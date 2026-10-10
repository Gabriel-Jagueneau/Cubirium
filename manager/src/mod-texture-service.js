const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execSync } = require('child_process');

class ModTextureService {

  readJarBuffer(jarPath, entryPath) {
    const isWin = process.platform === 'win32';
    if (isWin) {
      try {
        return execFileSync('tar', ['-xOf', jarPath, entryPath], {
          maxBuffer: 10 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'ignore']
        });
      } catch (_) {
        try {
          const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z = [System.IO.Compression.ZipFile]::OpenRead('${jarPath.replace(/'/g, "''")}'); $e = $z.GetEntry('${entryPath.replace(/'/g, "''")}'); if ($e) { $s = $e.Open(); $ms = New-Object System.IO.MemoryStream; $s.CopyTo($ms); [System.Console]::OpenStandardOutput().Write($ms.ToArray(), 0, $ms.Length) }`;
          return execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, {
            maxBuffer: 10 * 1024 * 1024,
            stdio: ['pipe', 'pipe', 'ignore']
          });
        } catch (__) {
          return null;
        }
      }
    } else {
      try {
        return execFileSync('unzip', ['-p', jarPath, entryPath], {
          maxBuffer: 10 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'ignore']
        });
      } catch (_) {
        return null;
      }
    }
  }

  constructor() {
    this.memoryCache = new Map(); // key: `${worldId}:${itemId}` -> Buffer
    this.cacheDir = path.join(__dirname, '..', 'public', 'cache', 'textures');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // Cache des fichiers contenus dans les jars: jarPath -> Set<string>
    this.jarEntriesCache = new Map();

    // Liste ordonnée des jars Minecraft Vanilla locaux
    this.vanillaJars = this.discoverVanillaJars();
  }

  /**
   * Trouve les jars officiels du client Minecraft installés sur la machine
   */
  discoverVanillaJars() {
    const home = process.env.HOME || os.homedir();
    const versionsDir = path.join(home, 'Library', 'Application Support', 'minecraft', 'versions');
    const jars = [];

    if (fs.existsSync(versionsDir)) {
      try {
        const dirs = fs.readdirSync(versionsDir);
        for (const d of dirs) {
          // Exclure forge / fabric / optifine pour privilégier les jars vanilla propres
          if (d.includes('forge') || d.includes('fabric-loader') || d.includes('OptiFine')) continue;
          const jar = path.join(versionsDir, d, `${d}.jar`);
          if (fs.existsSync(jar)) jars.push(jar);
        }

        // Prioriser 26.3, 1.21.1, etc.
        jars.sort((a, b) => {
          if (a.includes('26.3')) return -1;
          if (b.includes('26.3')) return 1;
          if (a.includes('1.21.1')) return -1;
          if (b.includes('1.21.1')) return 1;
          return b.localeCompare(a);
        });
      } catch (e) {}
    }

    return jars;
  }

  /**
   * Récupère la liste indexée des fichiers dans un jar pour un namespace
   * Une seule commande unzip -l exécutée par jar, puis indexation O(1) en mémoire
   */
  getJarEntries(jarPath, namespace) {
    const key = `${jarPath}:${namespace}`;
    if (this.jarEntriesCache.has(key)) {
      return this.jarEntriesCache.get(key);
    }

    try {
      const out = execFileSync('unzip', ['-l', jarPath, `assets/${namespace}/*`], {
        maxBuffer: 20 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'ignore']
      }).toString('utf8');

      const set = new Set();
      const lines = out.split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const entryPath = parts.slice(3).join(' ');
          if (entryPath) set.add(entryPath);
        }
      }

      this.jarEntriesCache.set(key, set);
      return set;
    } catch (e) {
      const emptySet = new Set();
      this.jarEntriesCache.set(key, emptySet);
      return emptySet;
    }
  }

  /**
   * Récupère la texture PNG d'un item (mod ou vanilla)
   * @param {string} worldId 
   * @param {string} itemId (ex: "minecraft:iron_sword", "tombstone:grave_dust" ou "iceandfire:ghost_sword")
   * @returns {Buffer|null}
   */
  getTexture(worldId, itemId, color = null) {
    if (!itemId) return null;
    const cleanId = itemId.trim().toLowerCase();
    const cacheKey = `${worldId || 'default'}:${cleanId}${color ? ':' + color : ''}`;

    // 1. Cache mémoire instantané
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey);
    }

    const parts = cleanId.split(':');
    const namespace = parts.length > 1 ? parts[0] : 'minecraft';
    const name = parts.length > 1 ? parts[1] : parts[0];

    // 2. Cache disque local (si pas de couleur custom, ou avec suffixe couleur)
    const diskFileName = color ? `${name}_${color}.png` : `${name}.png`;
    const diskPath = path.join(this.cacheDir, namespace, diskFileName);
    if (fs.existsSync(diskPath)) {
      try {
        const buf = fs.readFileSync(diskPath);
        if (buf && buf.length > 8 && buf[0] === 0x89) {
          this.memoryCache.set(cacheKey, buf);
          return buf;
        }
      } catch (e) {}
    }

    // 3. Texture Vanilla (minecraft)
    if (namespace === 'minecraft') {
      let r = 160, g = 101, b = 64;
      if (color) {
        const num = parseInt(color, 10);
        if (!isNaN(num)) {
          r = (num >> 16) & 0xff;
          g = (num >> 8) & 0xff;
          b = num & 0xff;
        }
      }
      const vanillaBuf = this.getVanillaTexture(name, diskPath, r, g, b);
      if (vanillaBuf) {
        this.memoryCache.set(cacheKey, vanillaBuf);
        return vanillaBuf;
      }
    }

    // 4. Texture Mod (recherche dans games/<worldId>/mods/*.jar)
    if (namespace !== 'minecraft') {
      const modBuf = this.getModTexture(worldId, namespace, name, diskPath);
      if (modBuf) {
        this.memoryCache.set(cacheKey, modBuf);
        return modBuf;
      }
    }

    return null;
  }

  /**
   * Extrait une texture Minecraft Vanilla depuis les versions locales
   */
  getVanillaTexture(name, diskPath, r = 160, g = 101, b = 64) {
    // Cas spécial: armure en cuir (teinte naturelle marron cuir #A06540 ou couleur teinte + superposition overlay)
    if (name.startsWith('leather_') && (name.includes('helmet') || name.includes('chestplate') || name.includes('leggings') || name.includes('boots') || name.includes('horse_armor'))) {
      const tinted = this.generateTintedLeatherArmor(name, diskPath, r, g, b);
      if (tinted) return tinted;
    }

    const candidates = [
      `assets/minecraft/textures/item/${name}.png`,
      `assets/minecraft/textures/block/${name}.png`,
      `assets/minecraft/textures/block/${name}_front.png`,
      `assets/minecraft/textures/block/${name}_top.png`,
      `assets/minecraft/textures/block/${name}_side.png`,
      `assets/minecraft/textures/block/${name}_side_0.png`,
      `assets/minecraft/textures/block/${name}_bottom.png`,
      `assets/minecraft/textures/block/${name}_end.png`
    ];

    for (const jar of this.vanillaJars) {
      const entries = this.getJarEntries(jar, 'minecraft');
      if (!entries || entries.size === 0) continue;

      for (const cand of candidates) {
        if (entries.has(cand)) {
          try {
            const buf = execFileSync('unzip', ['-p', jar, cand], {
              maxBuffer: 5 * 1024 * 1024,
              stdio: ['pipe', 'pipe', 'ignore']
            });
            if (buf && buf.length > 8 && buf[0] === 0x89) {
              this.saveToDiskCache(diskPath, buf);
              return buf;
            }
          } catch (e) {}
        }
      }

      // Essayer de résoudre le model JSON
      const modelItemPath = `assets/minecraft/models/item/${name}.json`;
      if (entries.has(modelItemPath)) {
        try {
          const modelJsonStr = execFileSync('unzip', ['-p', jar, modelItemPath], {
            maxBuffer: 1024 * 1024,
            stdio: ['pipe', 'pipe', 'ignore']
          }).toString('utf8');
          const modelJson = JSON.parse(modelJsonStr);

          // Résolution parent bloc
          let texturesObj = modelJson.textures;
          if (!texturesObj && modelJson.parent && modelJson.parent.startsWith('minecraft:block/')) {
            const parentBlock = modelJson.parent.replace('minecraft:block/', '');
            const blockModelPath = `assets/minecraft/models/block/${parentBlock}.json`;
            if (entries.has(blockModelPath)) {
              const bStr = execFileSync('unzip', ['-p', jar, blockModelPath], {
                stdio: ['pipe', 'pipe', 'ignore']
              }).toString('utf8');
              texturesObj = JSON.parse(bStr).textures;
            }
          }

          if (texturesObj) {
            // Ordre de priorité des textures dans les modèles
            const priorityKeys = ['layer0', 'front', 'top', 'texture', 'all', 'side', 'particle'];
            let resolvedTex = null;
            for (const k of priorityKeys) {
              if (typeof texturesObj[k] === 'string') {
                resolvedTex = texturesObj[k];
                break;
              }
            }
            if (!resolvedTex) {
              resolvedTex = Object.values(texturesObj).find(v => typeof v === 'string');
            }

            if (resolvedTex) {
              const cleanTex = resolvedTex.replace(/^minecraft:/, '');
              const texPath = `assets/minecraft/textures/${cleanTex}.png`;
              if (entries.has(texPath)) {
                const buf = execFileSync('unzip', ['-p', jar, texPath], {
                  maxBuffer: 5 * 1024 * 1024,
                  stdio: ['pipe', 'pipe', 'ignore']
                });
                if (buf && buf.length > 8 && buf[0] === 0x89) {
                  this.saveToDiskCache(diskPath, buf);
                  return buf;
                }
              }
            }
          }
        } catch (e) {}
      }
    }

    return null;
  }

  /**
   * Indexe les namespaces de tous les jars de mods pour un monde donné (avec mise en cache)
   * Permet de trouver instantanément en O(1) le bon jar pour n'importe quel item ou mod
   */
  getWorldModNamespaces(worldId) {
    if (!worldId) return new Map();
    if (this.worldNamespaceMap && this.worldNamespaceMap.has(worldId)) {
      return this.worldNamespaceMap.get(worldId);
    }
    if (!this.worldNamespaceMap) this.worldNamespaceMap = new Map();

    const nsMap = new Map(); // namespace -> Set<jarPath>
    const modsDir = path.join(__dirname, '..', '..', 'games', worldId, 'mods');
    if (!fs.existsSync(modsDir)) {
      this.worldNamespaceMap.set(worldId, nsMap);
      return nsMap;
    }

    try {
      const jars = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar'));
      for (const jar of jars) {
        const jarPath = path.join(modsDir, jar);
        try {
          const out = execFileSync('unzip', ['-l', jarPath, 'assets/*/'], {
            stdio: ['pipe', 'pipe', 'ignore'],
            maxBuffer: 10 * 1024 * 1024
          }).toString('utf8');

          const matches = out.matchAll(/assets\/([a-z0-9_.-]+)\//gi);
          for (const m of matches) {
            const ns = m[1].toLowerCase();
            if (ns === 'minecraft') continue;
            if (!nsMap.has(ns)) nsMap.set(ns, new Set());
            nsMap.get(ns).add(jarPath);
          }
        } catch (e) {}
      }
    } catch (e) {}

    this.worldNamespaceMap.set(worldId, nsMap);
    return nsMap;
  }

  /**
   * Trouve tous les jars associés à un namespace, avec recherche dans le monde actif puis repli automatique sur tous les autres mondes
   * @param {string} worldId
   * @param {string} namespace
   * @returns {string[]}
   */
  getJarsForNamespace(worldId, namespace) {
    const gamesDir = path.join(__dirname, '..', '..', 'games');
    const checkedWorlds = new Set();
    const candidateJars = [];

    // 1. D'abord dans le monde spécifié
    if (worldId) {
      checkedWorlds.add(worldId);
      const nsMap = this.getWorldModNamespaces(worldId);
      if (nsMap.has(namespace)) {
        candidateJars.push(...Array.from(nsMap.get(namespace)));
      }
    }

    // 2. Si non trouvé, explorer tous les autres mondes du gestionnaire
    if (candidateJars.length === 0 && fs.existsSync(gamesDir)) {
      try {
        const subdirs = fs.readdirSync(gamesDir);
        for (const dir of subdirs) {
          if (checkedWorlds.has(dir)) continue;
          const modsDir = path.join(gamesDir, dir, 'mods');
          if (fs.existsSync(modsDir)) {
            checkedWorlds.add(dir);
            const nsMap = this.getWorldModNamespaces(dir);
            if (nsMap.has(namespace)) {
              candidateJars.push(...Array.from(nsMap.get(namespace)));
            }
          }
        }
      } catch (e) {}
    }

    // 3. Si toujours non trouvé, recherche floue par nom de fichier jar
    if (candidateJars.length === 0) {
      const cleanNs = namespace.replace(/_v\d+$/, '').replace(/_/g, '');
      for (const wId of checkedWorlds) {
        const modsDir = path.join(gamesDir, wId, 'mods');
        if (fs.existsSync(modsDir)) {
          try {
            const allJars = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar'));
            for (const j of allJars) {
              const lower = j.toLowerCase();
              if (lower.includes(cleanNs) || cleanNs.includes(lower.replace(/\.jar$/, ''))) {
                candidateJars.push(path.join(modsDir, j));
              }
            }
          } catch (e) {}
        }
      }
    }

    return Array.from(new Set(candidateJars));
  }

  /**
   * Extrait une texture de mod depuis le dossier mods du monde (Tous mods supportés)
   */
  getModTexture(worldId, namespace, name, diskPath) {
    const targetJars = this.getJarsForNamespace(worldId, namespace);
    if (targetJars.length === 0) return null;

    // Variantes de noms pour tolérer les conventions de mods (ex: avec ou sans _of_the_, majuscules/minuscules)
    const nameVariants = [
      name,
      name.replace(/_of_the_/g, 'ofthe_'),
      name.replace(/_of_/g, 'of_'),
      name.replace(/_the_/g, 'the_'),
      name.replace(/_/g, '')
    ];
    const uniqueVariants = Array.from(new Set(nameVariants));

    for (const jarPath of targetJars) {
      const entries = this.getJarEntries(jarPath, namespace);
      if (!entries || entries.size === 0) continue;

      // 1. Test des chemins de textures directs
      for (const variant of uniqueVariants) {
        const candidates = [
          `assets/${namespace}/textures/item/${variant}.png`,
          `assets/${namespace}/textures/items/${variant}.png`,
          `assets/${namespace}/textures/block/${variant}.png`,
          `assets/${namespace}/textures/blocks/${variant}.png`,
          `assets/${namespace}/textures/${variant}.png`,
          `assets/${namespace}/textures/gui/${variant}.png`,
          `assets/${namespace}/textures/entity/${variant}.png`,
          `assets/${namespace}/textures/entities/${variant}.png`
        ];

        for (const cand of candidates) {
          if (entries.has(cand)) {
            try {
              const buf = execFileSync('unzip', ['-p', jarPath, cand], {
                maxBuffer: 10 * 1024 * 1024,
                stdio: ['pipe', 'pipe', 'ignore']
              });
              if (buf && buf.length > 8 && buf[0] === 0x89) {
                this.saveToDiskCache(diskPath, buf);
                return buf;
              }
            } catch (e) {}
          }
        }
      }

      // 2. Test du model JSON item / block
      for (const variant of uniqueVariants) {
        const modelPaths = [
          `assets/${namespace}/models/item/${variant}.json`,
          `assets/${namespace}/models/block/${variant}.json`,
          `assets/${namespace}/items/${variant}.json`
        ];

        for (const modelPath of modelPaths) {
          if (entries.has(modelPath)) {
            try {
              const modelJsonStr = execFileSync('unzip', ['-p', jarPath, modelPath], {
                maxBuffer: 2 * 1024 * 1024,
                stdio: ['pipe', 'pipe', 'ignore']
              }).toString('utf8');
              const modelJson = JSON.parse(modelJsonStr);

              let texturesObj = modelJson.textures;
              // Si pas de textures directes mais un parent
              if (!texturesObj && modelJson.parent) {
                const parentRef = modelJson.parent;
                const [pNs, pPath] = parentRef.includes(':') ? parentRef.split(':') : [namespace, parentRef];
                const pModelPath = `assets/${pNs}/models/${pPath}.json`;
                if (entries.has(pModelPath)) {
                  try {
                    const pJson = JSON.parse(execFileSync('unzip', ['-p', jarPath, pModelPath], { stdio: ['pipe', 'pipe', 'ignore'] }).toString('utf8'));
                    texturesObj = pJson.textures;
                  } catch (e) {}
                }
              }

              if (texturesObj) {
                const priorityKeys = ['layer0', 'layer1', 'front', 'top', 'texture', 'all', 'side', 'particle'];
                let resolvedTex = null;
                for (const k of priorityKeys) {
                  if (typeof texturesObj[k] === 'string') {
                    resolvedTex = texturesObj[k];
                    break;
                  }
                }
                if (!resolvedTex) {
                  resolvedTex = Object.values(texturesObj).find(v => typeof v === 'string');
                }

                if (resolvedTex) {
                  const [texNs, texP] = resolvedTex.includes(':') ? resolvedTex.split(':') : [namespace, resolvedTex];
                  const cleanTex = texP.startsWith('textures/') ? texP.replace(/^textures\//, '') : texP;
                  const candidatePaths = [
                    `assets/${texNs}/textures/${cleanTex}.png`,
                    `assets/${texNs}/textures/item/${cleanTex}.png`,
                    `assets/${texNs}/textures/block/${cleanTex}.png`
                  ];

                  if (texNs === 'minecraft') {
                    const vBuf = this.getVanillaTexture(cleanTex.replace(/^(item|block)\//, ''), diskPath);
                    if (vBuf) return vBuf;
                  } else {
                    for (const cand of candidatePaths) {
                      if (entries.has(cand)) {
                        const buf = execFileSync('unzip', ['-p', jarPath, cand], {
                          maxBuffer: 10 * 1024 * 1024,
                          stdio: ['pipe', 'pipe', 'ignore']
                        });
                        if (buf && buf.length > 8 && buf[0] === 0x89) {
                          this.saveToDiskCache(diskPath, buf);
                          return buf;
                        }
                      }
                    }
                  }
                }
              }
            } catch (e) {}
          }
        }
      }

      // 3. Heuristique de secours par mots-clés dans les textures du jar
      const keywords = name.toLowerCase().split('_').filter(w => w.length >= 3 && !['item', 'armor', 'the', 'and'].includes(w));
      if (keywords.length > 0) {
        for (const entry of entries) {
          if (entry.endsWith('.png') && (entry.includes('/textures/item/') || entry.includes('/textures/items/'))) {
            const entryLower = entry.toLowerCase();
            const matchesCount = keywords.filter(k => entryLower.includes(k)).length;
            if (matchesCount >= Math.min(2, keywords.length)) {
              try {
                const buf = this.readJarBuffer(jarPath, entry);
                if (buf && buf.length > 8 && buf[0] === 0x89) {
                  this.saveToDiskCache(diskPath, buf);
                  return buf;
                }
              } catch (e) {}
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Récupère la texture 3D d'armure portée (layer 1 ou layer 2) pour n'importe quel mod ou vanilla
   * @param {string} worldId
   * @param {string} itemId (ex: "born_in_chaos_v1:nightmare_mantleofthe_night_chestplate" ou "minecraft:diamond_chestplate")
   * @param {number} layer (1 pour casque, plastron, bottes ; 2 pour jambières)
   * @param {string|null} color
   */
  getArmorTexture(worldId, itemId, layer = 1, color = null) {
    if (!itemId) return null;
    const cleanId = itemId.trim().toLowerCase();
    const parts = cleanId.split(':');
    const namespace = parts.length > 1 ? parts[0] : 'minecraft';
    const name = parts.length > 1 ? parts[1] : parts[0];

    const cacheKey = `armor:${worldId || 'default'}:${cleanId}:l${layer}${color ? ':' + color : ''}`;
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey);
    }

    // 1. Matériaux Vanilla (leather, iron, gold, diamond, netherite, chainmail, turtle)
    const vanillaMaterials = ['leather', 'iron', 'gold', 'diamond', 'netherite', 'chainmail', 'turtle'];
    let detectedMat = vanillaMaterials.find(m => name.startsWith(m + '_') || name === m);

    if (namespace === 'minecraft' && detectedMat) {
      const localArmorPng = path.join(__dirname, '..', 'public', 'assets', 'minecraft', 'armor', `${detectedMat}_layer_${layer}.png`);
      if (fs.existsSync(localArmorPng)) {
        try {
          const buf = fs.readFileSync(localArmorPng);
          this.memoryCache.set(cacheKey, buf);
          return buf;
        } catch (e) {}
      }
    }

    // 2. Texture d'armure de mod
    const targetJars = this.getJarsForNamespace(worldId, namespace);
    if (targetJars.length > 0) {
      // Déterminer la pièce d'armure cible
      let pieceType = 'chestplate';
      if (layer === 2 || name.endsWith('_leggings') || name.endsWith('_pants') || name.includes('leggings') || name.includes('pants')) {
        pieceType = 'leggings';
      } else if (name.endsWith('_boots') || name.endsWith('_boot') || name.includes('boots') || name.includes('boot')) {
        pieceType = 'boots';
      } else if (name.endsWith('_helmet') || name.includes('helmet') || name.includes('mask') || name.includes('hood')) {
        pieceType = 'helmet';
      } else {
        pieceType = 'chestplate';
      }

      const conflicts = {
        helmet: ['chestplate', 'breastplate', 'boot', 'boots', 'leggings', 'pants'],
        chestplate: ['helmet', 'mask', 'cap', 'crown', 'boot', 'boots', 'leggings', 'pants'],
        leggings: ['helmet', 'mask', 'chestplate', 'breastplate', 'boot', 'boots'],
        boots: ['helmet', 'mask', 'chestplate', 'breastplate', 'leggings', 'pants']
      }[pieceType] || [];

      const primaryPieceTerms = {
        helmet: ['helmet', 'mask', 'masc', 'hood', 'head'],
        chestplate: ['chestplate', 'breastplate', 'chest', 'robe', 'mantle', 'tunic'],
        leggings: ['leggings', 'pants', 'greaves'],
        boots: ['boots', 'boot', 'shoes']
      }[pieceType] || [];

      for (const jarPath of targetJars) {
        const entries = this.getJarEntries(jarPath, namespace);
        if (!entries || entries.size === 0) continue;

        // Extraire les tokens du nom et du model JSON
        const itemTokens = name.replace(/_(helmet|chestplate|leggings|boots|armor|plate)$/g, '').split('_');
        const modelPath = `assets/${namespace}/models/item/${name}.json`;
        if (entries.has(modelPath)) {
          try {
            const json = JSON.parse((this.readJarBuffer(jarPath, modelPath) || '').toString('utf8'));
            if (json && json.textures) {
              for (const k of Object.keys(json.textures)) {
                const val = String(json.textures[k]).split(':').pop().split('/').pop();
                itemTokens.push(...val.split('_'));
                itemTokens.push(val);
              }
            }
          } catch (e) {}
        }

        const uniqueTokens = Array.from(new Set(itemTokens.map(t => t.toLowerCase()).filter(t => t.length >= 3 && !['ofthe', 'item', 'armor'].includes(t))));

        const candidates = [];
        for (const e of entries) {
          if (!e.endsWith('.png')) continue;
          const lower = e.toLowerCase();
          // Ignorer les icônes 2D d'inventaire et les blocs
          if (lower.includes('/textures/item/') || lower.includes('/textures/items/') || lower.includes('/textures/block/') || lower.includes('/textures/blocks/') || lower.includes('/textures/gui/')) continue;

          const filename = lower.split('/').pop().replace(/\.png$/, '');
          if (conflicts.some(c => filename.includes(c))) continue;

          const isArmorFolder = lower.includes('/armor/') || lower.includes('/models/armor/');
          const matchesAnyPiece = primaryPieceTerms.some(term => filename.includes(term) || lower.includes(term)) || lower.includes('layer_') || lower.includes('layer');

          if (!isArmorFolder && !matchesAnyPiece) continue;

          if (layer === 1 && (lower.includes('layer_2') || lower.includes('layer2'))) continue;
          if (layer === 2 && (lower.includes('layer_1') || lower.includes('layer1'))) continue;

          candidates.push(e);
        }

        const scored = candidates.map(cand => {
          const lower = cand.toLowerCase();
          const filename = lower.split('/').pop().replace(/\.png$/, '');
          let tokenMatches = 0;
          for (const t of uniqueTokens) {
            if (filename.includes(t)) tokenMatches += 4;
            else if (lower.includes(t)) tokenMatches += 2;
            else if (t.length >= 4 && filename.includes(t.slice(0, 4))) tokenMatches += 1;
          }
          const hasLayer = lower.includes('layer_' + layer) || lower.includes('layer' + layer);
          const isArmorFolder = lower.includes('/armor/') || lower.includes('/models/armor/');
          const matchesPrimary = primaryPieceTerms.some(term => filename.includes(term));

          let score = tokenMatches * 10;
          if (matchesPrimary) score += 50;
          if (hasLayer && tokenMatches > 0) score += 30;
          if (isArmorFolder && tokenMatches > 0) score += 20;

          return { cand, score };
        });

        scored.sort((a, b) => b.score - a.score);

        for (const item of scored) {
          try {
            const buf = this.readJarBuffer(jarPath, item.cand);
            if (buf && buf.length > 8 && buf[0] === 0x89) {
              this.memoryCache.set(cacheKey, buf);
              return buf;
            }
          } catch (e) {}
        }
      }
    }

    // Repli sur vanilla netherite / iron selon la teinte
    const fallbackMat = name.includes('dark') || name.includes('nether') || name.includes('night') ? 'netherite' : 'iron';
    const fallbackPath = path.join(__dirname, '..', 'public', 'assets', 'minecraft', 'armor', `${fallbackMat}_layer_${layer}.png`);
    if (fs.existsSync(fallbackPath)) {
      try {
        const buf = fs.readFileSync(fallbackPath);
        this.memoryCache.set(cacheKey, buf);
        return buf;
      } catch (e) {}
    }

    return null;
  }

  /**
   * Génère dynamiquement une texture d'armure en cuir teintée fidèle à Minecraft avec son overlay
   */
  generateTintedLeatherArmor(itemName, diskPath, r = 160, g = 101, b = 64) {
    const zlib = require('zlib');
    for (const jar of this.vanillaJars) {
      try {
        const baseBuf = this.readJarBuffer(jar, `assets/minecraft/textures/item/${itemName}.png`);
        if (!baseBuf || baseBuf.length < 8) continue;

        // Décoder le PNG de base (type 0 Grayscale avec tRNS)
        let offset = 8;
        let width = 0, height = 0, colorType = 0, bitDepth = 8;
        let transparentGray = -1;
        const idatParts = [];
        while (offset < baseBuf.length) {
          const len = baseBuf.readUInt32BE(offset);
          const type = baseBuf.toString('ascii', offset + 4, offset + 8);
          if (type === 'IHDR') {
            width = baseBuf.readUInt32BE(offset + 8);
            height = baseBuf.readUInt32BE(offset + 12);
            bitDepth = baseBuf[offset + 16];
            colorType = baseBuf[offset + 17];
          } else if (type === 'tRNS' && colorType === 0) {
            transparentGray = baseBuf.readUInt16BE(offset + 8);
          } else if (type === 'IDAT') {
            idatParts.push(baseBuf.slice(offset + 8, offset + 8 + len));
          }
          offset += 12 + len;
        }

        const inflated = zlib.inflateSync(Buffer.concat(idatParts));
        const outRgba = Buffer.alloc(width * height * 4);
        const stride = 1 + width;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const gray = inflated[y * stride + 1 + x];
            const idx = (y * width + x) * 4;
            if (gray !== transparentGray) {
              outRgba[idx] = Math.round((gray * r) / 255);
              outRgba[idx + 1] = Math.round((gray * g) / 255);
              outRgba[idx + 2] = Math.round((gray * b) / 255);
              outRgba[idx + 3] = 255;
            }
          }
        }

        // Tenter de charger l'overlay (boucles métalliques, boutons)
        try {
          const overlayBuf = this.readJarBuffer(jar, `assets/minecraft/textures/item/${itemName}_overlay.png`);
          if (overlayBuf && overlayBuf.length > 8) {
            let oOffset = 8;
            const oIdat = [];
            while (oOffset < overlayBuf.length) {
              const oLen = overlayBuf.readUInt32BE(oOffset);
              const oType = overlayBuf.toString('ascii', oOffset + 4, oOffset + 8);
              if (oType === 'IDAT') oIdat.push(overlayBuf.slice(oOffset + 8, oOffset + 8 + oLen));
              oOffset += 12 + oLen;
            }
            const oInflated = zlib.inflateSync(Buffer.concat(oIdat));
            const oStride = 1 + width * 2; // Grayscale + Alpha
            for (let y = 0; y < height; y++) {
              for (let x = 0; x < width; x++) {
                const og = oInflated[y * oStride + 1 + x * 2];
                const oa = oInflated[y * oStride + 1 + x * 2 + 1];
                const idx = (y * width + x) * 4;
                if (oa === 255) {
                  outRgba[idx] = og;
                  outRgba[idx + 1] = og;
                  outRgba[idx + 2] = og;
                  outRgba[idx + 3] = 255;
                } else if (oa > 0) {
                  const ba = outRgba[idx + 3];
                  const resA = oa + Math.round((ba * (255 - oa)) / 255);
                  outRgba[idx] = Math.round((og * oa + outRgba[idx] * ba * (255 - oa) / 255) / (resA || 1));
                  outRgba[idx + 1] = Math.round((og * oa + outRgba[idx + 1] * ba * (255 - oa) / 255) / (resA || 1));
                  outRgba[idx + 2] = Math.round((og * oa + outRgba[idx + 2] * ba * (255 - oa) / 255) / (resA || 1));
                  outRgba[idx + 3] = resA;
                }
              }
            }
          }
        } catch (e) {}

        // Encodage en PNG RGBA standard
        const crc32Table = [];
        for (let i = 0; i < 256; i++) {
          let c = i;
          for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
          crc32Table[i] = c;
        }
        const calcCrc = (buf) => {
          let c = 0xffffffff;
          for (let i = 0; i < buf.length; i++) c = crc32Table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
          return (c ^ 0xffffffff) >>> 0;
        };
        const makeChunk = (type, data) => {
          const lBuf = Buffer.alloc(4);
          lBuf.writeUInt32BE(data.length, 0);
          const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
          const cBuf = Buffer.alloc(4);
          cBuf.writeUInt32BE(calcCrc(td), 0);
          return Buffer.concat([lBuf, td, cBuf]);
        };

        const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const ihdr = Buffer.alloc(13);
        ihdr.writeUInt32BE(width, 0);
        ihdr.writeUInt32BE(height, 4);
        ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

        const rawScanlines = Buffer.alloc(height * (1 + width * 4));
        for (let y = 0; y < height; y++) {
          rawScanlines[y * (1 + width * 4)] = 0;
          outRgba.copy(rawScanlines, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
        }

        const finalPng = Buffer.concat([
          sig,
          makeChunk('IHDR', ihdr),
          makeChunk('IDAT', zlib.deflateSync(rawScanlines)),
          makeChunk('IEND', Buffer.alloc(0))
        ]);

        this.saveToDiskCache(diskPath, finalPng);
        return finalPng;
      } catch (err) {}
    }
    return null;
  }

  saveToDiskCache(diskPath, buf) {
    try {
      const dir = path.dirname(diskPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(diskPath, buf);
    } catch (e) {}
  }
}

module.exports = new ModTextureService();

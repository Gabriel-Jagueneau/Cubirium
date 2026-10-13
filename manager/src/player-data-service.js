const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

/**
 * Décodeur NBT binaire pur JS (sans dépendance externe)
 * Spécification standard NBT Mojang
 */
function parseNbtBuffer(buf) {
  let offset = 0;
  function readByte() { return buf.readInt8(offset++); }
  function readShort() { const v = buf.readInt16BE(offset); offset += 2; return v; }
  function readInt() { const v = buf.readInt32BE(offset); offset += 4; return v; }
  function readLong() { const v = buf.readBigInt64BE(offset); offset += 8; return Number(v); }
  function readFloat() { const v = buf.readFloatBE(offset); offset += 4; return v; }
  function readDouble() { const v = buf.readDoubleBE(offset); offset += 8; return v; }
  function readString() {
    const len = buf.readUInt16BE(offset); offset += 2;
    const s = buf.toString('utf8', offset, offset + len); offset += len;
    return s;
  }
  function readTagPayload(type) {
    switch (type) {
      case 0: return null;
      case 1: return readByte();
      case 2: return readShort();
      case 3: return readInt();
      case 4: return readLong();
      case 5: return readFloat();
      case 6: return readDouble();
      case 7: {
        const len = readInt();
        const b = buf.slice(offset, offset + len); offset += len;
        return b;
      }
      case 8: return readString();
      case 9: {
        const itemType = readByte();
        const len = readInt();
        const list = [];
        for (let i = 0; i < len; i++) list.push(readTagPayload(itemType));
        return list;
      }
      case 10: {
        const compound = {};
        while (offset < buf.length) {
          const t = readByte();
          if (t === 0) break;
          const name = readString();
          compound[name] = readTagPayload(t);
        }
        return compound;
      }
      case 11: {
        const len = readInt();
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(readInt());
        return arr;
      }
      case 12: {
        const len = readInt();
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(readLong());
        return arr;
      }
      default:
        throw new Error(`Type NBT inconnu: ${type} à l'offset ${offset}`);
    }
  }

  if (buf.length < 3) return {};
  const rootType = readByte();
  if (rootType === 10) {
    readString(); // nom du root (souvent vide)
    return readTagPayload(10) || {};
  }
  return {};
}

class PlayerDataService {
  constructor() {
    this.gamesDir = this.getGamesDir();
  }

  getGamesDir(minecraftService) {
    if (minecraftService && minecraftService.gamesDir) {
      return minecraftService.gamesDir;
    }
    const isWin = process.platform === 'win32';
    const isBundled = __dirname.includes('.app/Contents') || process.env.APP_BUNDLED === 'true';
    const appSupportGames = isWin
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Cubirium', 'games')
      : path.join(os.homedir(), 'Library/Application Support/Cubirium/games');
    const legacyGames = isWin
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'MinecraftServerManager', 'games')
      : path.join(os.homedir(), 'Library/Application Support/MinecraftServerManager/games');

    if (process.env.GAMES_DIR) {
      return path.resolve(process.env.GAMES_DIR);
    } else if (isBundled || isWin) {
      return fs.existsSync(appSupportGames) ? appSupportGames : (fs.existsSync(legacyGames) ? legacyGames : appSupportGames);
    } else {
      return path.resolve(__dirname, '../../games');
    }
  }

  resolveWorldPath(worldId, minecraftService) {
    if (!worldId) return null;
    if (path.isAbsolute(worldId) && fs.existsSync(worldId)) {
      return worldId;
    }
    const isWin = process.platform === 'win32';
    const candidateDirs = [
      this.getGamesDir(minecraftService),
      (minecraftService && minecraftService.gamesDir) ? minecraftService.gamesDir : null,
      isWin
        ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Cubirium', 'games')
        : path.join(os.homedir(), 'Library/Application Support/Cubirium/games'),
      isWin
        ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'MinecraftServerManager', 'games')
        : path.join(os.homedir(), 'Library/Application Support/MinecraftServerManager/games'),
      path.resolve(__dirname, '../../games')
    ].filter(Boolean);

    for (const d of candidateDirs) {
      const p = path.join(d, worldId);
      if (fs.existsSync(p)) return p;
    }

    return path.join(this.getGamesDir(minecraftService), worldId);
  }

  /**
   * Trouve le UUID d'un joueur par son pseudo dans un monde donné
   */
  findPlayerUuid(worldPath, playerName) {
    const targetName = playerName.trim().toLowerCase();

    // 1. Chercher dans usercache.json (racine du monde ou racine du serveur)
    const usercachePaths = [
      path.join(worldPath, 'usercache.json'),
      path.join(worldPath, 'world', 'usercache.json')
    ];

    for (const ucPath of usercachePaths) {
      if (fs.existsSync(ucPath)) {
        try {
          const cache = JSON.parse(fs.readFileSync(ucPath, 'utf8'));
          if (Array.isArray(cache)) {
            const entry = cache.find(e => e.name && e.name.toLowerCase() === targetName);
            if (entry && entry.uuid) return entry.uuid;
          }
        } catch (e) {}
      }
    }

    // 1b. Chercher dans usernamecache.json (Forge et NeoForge : { uuid: playerName })
    const usernamecachePaths = [
      path.join(worldPath, 'usernamecache.json'),
      path.join(worldPath, 'world', 'usernamecache.json')
    ];
    for (const uncPath of usernamecachePaths) {
      if (fs.existsSync(uncPath)) {
        try {
          const cache = JSON.parse(fs.readFileSync(uncPath, 'utf8'));
          if (cache && typeof cache === 'object' && !Array.isArray(cache)) {
            for (const [uuid, name] of Object.entries(cache)) {
              if (typeof name === 'string' && name.toLowerCase() === targetName) {
                return uuid;
              }
            }
          }
        } catch (e) {}
      }
    }

    // 2. Chercher dans ops.json, whitelist.json, banned-players.json
    const jsonFiles = ['ops.json', 'whitelist.json', 'banned-players.json'];
    for (const file of jsonFiles) {
      const p = path.join(worldPath, file);
      if (fs.existsSync(p)) {
        try {
          const data = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (Array.isArray(data)) {
            const entry = data.find(e => e.name && e.name.toLowerCase() === targetName);
            if (entry && entry.uuid) return entry.uuid;
          }
        } catch (e) {}
      }
    }

    // 3. Chercher dans les fichiers stats/*.json ou playerdata/*.dat (anciens et modernes 26.3+)
    const candidateDirs = [
      path.join(worldPath, 'world', 'players', 'stats'),
      path.join(worldPath, 'players', 'stats'),
      path.join(worldPath, 'world', 'stats'),
      path.join(worldPath, 'stats'),
      path.join(worldPath, 'world', 'players', 'data'),
      path.join(worldPath, 'players', 'data'),
      path.join(worldPath, 'world', 'playerdata'),
      path.join(worldPath, 'playerdata')
    ];

    for (const dir of candidateDirs) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => (f.endsWith('.json') || f.endsWith('.dat')) && !f.endsWith('.dat_old'));
        if (files.length === 1) {
          return files[0].replace(/\.(json|dat)$/, '');
        }
      }
    }

    // 4. Chercher dans logs/latest.log pour un joueur connecté en direct
    const logPath = path.join(worldPath, 'logs', 'latest.log');
    if (fs.existsSync(logPath)) {
      try {
        const logContent = fs.readFileSync(logPath, 'utf8');
        const re = new RegExp(`UUID of player ${playerName.trim()} is ([0-9a-fA-F-]+)`, 'i');
        const m = logContent.match(re);
        if (m && m[1]) return m[1];
      } catch (e) {}
    }

    return null;
  }

  /**
   * Récupère les détails complets d'un joueur (inventaire, armure, stats, vue 3D)
   */
  async getPlayerDetails(worldId, playerNameOrUuid, minecraftService) {
    const worldPath = this.resolveWorldPath(worldId, minecraftService);
    if (!worldPath || !fs.existsSync(worldPath)) {
      throw new Error(`Monde introuvable: ${worldId}`);
    }

    let uuid = playerNameOrUuid.includes('-') ? playerNameOrUuid : null;
    let playerName = playerNameOrUuid;

    if (!uuid) {
      uuid = this.findPlayerUuid(worldPath, playerName);
    }

    // Si on a un UUID mais pas le nom propre, tenter de retrouver le nom depuis usercache
    if (uuid && playerName === uuid) {
      const ucPath = path.join(worldPath, 'usercache.json');
      if (fs.existsSync(ucPath)) {
        try {
          const cache = JSON.parse(fs.readFileSync(ucPath, 'utf8'));
          const entry = cache.find(e => e.uuid === uuid);
          if (entry && entry.name) playerName = entry.name;
        } catch (e) {}
      }
    }

    // Contrôles (Whitelist, Banni, Opérateur)
    const ops = minecraftService.readJsonFile(worldPath, 'ops.json', []);
    const whitelist = minecraftService.readJsonFile(worldPath, 'whitelist.json', []);
    const bans = minecraftService.readJsonFile(worldPath, 'banned-players.json', []);

    const isOp = ops.some(o => (o.name && o.name.toLowerCase() === playerName.toLowerCase()) || (uuid && o.uuid === uuid));
    const isWhitelisted = whitelist.some(w => (w.name && w.name.toLowerCase() === playerName.toLowerCase()) || (uuid && w.uuid === uuid));
    const isBanned = bans.some(b => (b.name && b.name.toLowerCase() === playerName.toLowerCase()) || (uuid && b.uuid === uuid));

    // Est en ligne ?
    const isOnline = (typeof minecraftService.isPlayerOnline === 'function')
      ? minecraftService.isPlayerOnline(worldId, playerName)
      : (minecraftService.activeWorld === worldId && 
         (minecraftService.status === 'RUNNING' || minecraftService.activeProcess) && 
         minecraftService.players.some(p => p.toLowerCase() === playerName.toLowerCase()));

    // Si le serveur tourne actuellement sur ce monde, forcer un flush discret des données joueur vers le disque
    if (minecraftService && minecraftService.activeWorld === worldId && minecraftService.status === 'RUNNING' && typeof minecraftService.triggerSilentSave === 'function') {
      minecraftService.triggerSilentSave(worldId);
      await new Promise(r => setTimeout(r, 40));
    }

    // Lire le nom du dossier du monde (level-name)
    let levelName = 'world';
    const propsPath = path.join(worldPath, 'server.properties');
    if (fs.existsSync(propsPath)) {
      const match = fs.readFileSync(propsPath, 'utf8').match(/^level-name\s*=\s*(.+)$/m);
      if (match && match[1]) levelName = match[1].trim();
    }

    // Données NBT de base
    let health = 20;
    let maxHealth = 20;
    let foodLevel = 20;
    let foodSaturation = 5.0;
    let xpLevel = 0;
    let xpProgress = 0;
    let gameMode = 'survival'; // survival, creative, adventure, spectator
    let position = { x: 0, y: 64, z: 0, dimension: 'minecraft:overworld' };
    let spawnPosition = null;
    let lastDeathPosition = null;
    let inventory = [];

    if (uuid) {
      // Emplacements possibles du fichier playerdata (anciens & modernes 26.3+)
      const candidateDatPaths = [
        path.join(worldPath, levelName, 'players', 'data', `${uuid}.dat`),
        path.join(worldPath, levelName, 'playerdata', `${uuid}.dat`),
        path.join(worldPath, 'world', 'players', 'data', `${uuid}.dat`),
        path.join(worldPath, 'world', 'playerdata', `${uuid}.dat`),
        path.join(worldPath, 'players', 'data', `${uuid}.dat`),
        path.join(worldPath, 'playerdata', `${uuid}.dat`)
      ];
      let datPath = null;
      for (const p of candidateDatPaths) {
        if (fs.existsSync(p)) {
          datPath = p;
          break;
        }
      }

      if (datPath) {
        try {
          const raw = fs.readFileSync(datPath);
          const unzipped = zlib.gunzipSync(raw);
          const nbt = parseNbtBuffer(unzipped);

          if (nbt.Health !== undefined) health = Math.round(nbt.Health);
          if (nbt.foodLevel !== undefined) foodLevel = Math.round(nbt.foodLevel);
          if (nbt.foodSaturationLevel !== undefined) foodSaturation = Number(nbt.foodSaturationLevel);
          if (nbt.XpLevel !== undefined) xpLevel = Number(nbt.XpLevel);
          if (nbt.XpP !== undefined) xpProgress = Number(nbt.XpP);

          // GameMode (0: survival, 1: creative, 2: adventure, 3: spectator)
          const gmMap = { 0: 'survival', 1: 'creative', 2: 'adventure', 3: 'spectator' };
          if (nbt.playerGameType !== undefined && gmMap[nbt.playerGameType]) {
            gameMode = gmMap[nbt.playerGameType];
          }

          // Priorité au mode de jeu récemment commandé si Minecraft n'a pas encore écrit le .dat sur disque
          if (minecraftService && minecraftService._playerGameModes) {
            const cachedGm = minecraftService._playerGameModes.get(`${worldId}:${playerName.toLowerCase()}`);
            if (cachedGm && (Date.now() - cachedGm.timestamp < 120000)) {
              gameMode = cachedGm.mode;
            }
          }

          // Position
          if (Array.isArray(nbt.Pos) && nbt.Pos.length >= 3) {
            position = {
              x: Number(nbt.Pos[0].toFixed(2)),
              y: Number(nbt.Pos[1].toFixed(2)),
              z: Number(nbt.Pos[2].toFixed(2)),
              dimension: nbt.Dimension || 'minecraft:overworld'
            };
          }

          // Spawn
          if (nbt.SpawnX !== undefined && nbt.SpawnY !== undefined && nbt.SpawnZ !== undefined) {
            spawnPosition = {
              x: nbt.SpawnX,
              y: nbt.SpawnY,
              z: nbt.SpawnZ,
              dimension: nbt.SpawnDimension || 'minecraft:overworld'
            };
          }

          // LastDeathLocation
          if (nbt.LastDeathLocation && Array.isArray(nbt.LastDeathLocation.pos)) {
            lastDeathPosition = {
              x: nbt.LastDeathLocation.pos[0],
              y: nbt.LastDeathLocation.pos[1],
              z: nbt.LastDeathLocation.pos[2],
              dimension: nbt.LastDeathLocation.dimension || 'minecraft:overworld'
            };
          }

          const toRoman = (num) => {
            const romans = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X' };
            return romans[num] || String(num);
          };

          const ENCHANT_TRANSLATIONS = {
            'protection': 'Protection',
            'fire_protection': 'Protection contre le feu',
            'feather_falling': 'Chute amortie',
            'blast_protection': 'Protection contre les explosions',
            'projectile_protection': 'Protection contre les projectiles',
            'respiration': 'Apnée',
            'aqua_affinity': 'Affinité aquatique',
            'thorns': 'Épines',
            'depth_strider': 'Agilité aquatique',
            'frost_walker': 'Semelles givrantes',
            'soul_speed': 'Vitesse des âmes',
            'swift_sneak': 'Furtivité rapide',
            'sharpness': 'Tranchant',
            'smite': 'Châtiment',
            'bane_of_arthropods': 'Fléau des arthropodes',
            'knockback': 'Recul',
            'fire_aspect': 'Aura de feu',
            'looting': 'Butin',
            'sweeping_edge': 'Affilage',
            'efficiency': 'Efficacité',
            'silk_touch': 'Toucher de soie',
            'unbreaking': 'Solidité',
            'fortune': 'Fortune',
            'power': 'Puissance',
            'punch': 'Frappe',
            'flame': 'Flamme',
            'infinity': 'Infinité',
            'luck_of_the_sea': 'Chance de la mer',
            'lure': 'Appât',
            'loyalty': 'Loyauté',
            'impaling': 'Empalement',
            'riptide': 'Impulsion',
            'channeling': 'Canalisation',
            'multishot': 'Tir multiple',
            'quick_charge': 'Charge rapide',
            'piercing': 'Perforation',
            'mending': 'Raccommodage',
            'curse_of_vanishing': 'Malédiction de disparition',
            'curse_of_binding': 'Malédiction du lien éternel',
            'density': 'Densité',
            'breach': 'Brèche',
            'wind_burst': 'Rafale de vent'
          };

          const VANILLA_MAX_DURABILITY = {
            'wooden_sword': 59, 'stone_sword': 131, 'iron_sword': 250, 'golden_sword': 32, 'diamond_sword': 1561, 'netherite_sword': 2031,
            'wooden_shovel': 59, 'stone_shovel': 131, 'iron_shovel': 250, 'golden_shovel': 32, 'diamond_shovel': 1561, 'netherite_shovel': 2031,
            'wooden_pickaxe': 59, 'stone_pickaxe': 131, 'iron_pickaxe': 250, 'golden_pickaxe': 32, 'diamond_pickaxe': 1561, 'netherite_pickaxe': 2031,
            'wooden_axe': 59, 'stone_axe': 131, 'iron_axe': 250, 'golden_axe': 32, 'diamond_axe': 1561, 'netherite_axe': 2031,
            'wooden_hoe': 59, 'stone_hoe': 131, 'iron_hoe': 250, 'golden_hoe': 32, 'diamond_hoe': 1561, 'netherite_hoe': 2031,
            'bow': 384, 'crossbow': 465, 'trident': 250, 'mace': 500, 'shield': 336,
            'fishing_rod': 64, 'flint_and_steel': 64, 'shears': 238, 'brush': 64, 'carrot_on_a_stick': 25, 'warped_fungus_on_a_stick': 100,
            'leather_helmet': 55, 'leather_chestplate': 80, 'leather_leggings': 75, 'leather_boots': 65,
            'chainmail_helmet': 165, 'chainmail_chestplate': 240, 'chainmail_leggings': 225, 'chainmail_boots': 195,
            'iron_helmet': 165, 'iron_chestplate': 240, 'iron_leggings': 225, 'iron_boots': 195,
            'golden_helmet': 77, 'golden_chestplate': 112, 'golden_leggings': 105, 'golden_boots': 91,
            'diamond_helmet': 363, 'diamond_chestplate': 528, 'diamond_leggings': 495, 'diamond_boots': 429,
            'netherite_helmet': 407, 'netherite_chestplate': 592, 'netherite_leggings': 555, 'netherite_boots': 481,
            'turtle_helmet': 275, 'elytra': 432, 'wolf_armor': 64
          };

          const VANILLA_ITEM_NAMES = {
            'leather_helmet': 'Casque en cuir', 'leather_chestplate': 'Plastron en cuir', 'leather_leggings': 'Jambières en cuir', 'leather_boots': 'Bottes en cuir',
            'chainmail_helmet': 'Casque en cotte de mailles', 'chainmail_chestplate': 'Plastron en cotte de mailles', 'chainmail_leggings': 'Jambières en cotte de mailles', 'chainmail_boots': 'Bottes en cotte de mailles',
            'iron_helmet': 'Casque en fer', 'iron_chestplate': 'Plastron en fer', 'iron_leggings': 'Jambières en fer', 'iron_boots': 'Bottes en fer',
            'diamond_helmet': 'Casque en diamant', 'diamond_chestplate': 'Plastron en diamant', 'diamond_leggings': 'Jambières en diamant', 'diamond_boots': 'Bottes en diamant',
            'golden_helmet': 'Casque en or', 'golden_chestplate': 'Plastron en or', 'golden_leggings': 'Jambières en or', 'golden_boots': 'Bottes en or',
            'netherite_helmet': 'Casque en netherite', 'netherite_chestplate': 'Plastron en netherite', 'netherite_leggings': 'Jambières en netherite', 'netherite_boots': 'Bottes en netherite',
            'wooden_sword': 'Épée en bois', 'stone_sword': 'Épée en pierre', 'iron_sword': 'Épée en fer', 'golden_sword': 'Épée en or', 'diamond_sword': 'Épée en diamant', 'netherite_sword': 'Épée en netherite',
            'wooden_pickaxe': 'Pioche en bois', 'stone_pickaxe': 'Pioche en pierre', 'iron_pickaxe': 'Pioche en fer', 'golden_pickaxe': 'Pioche en or', 'diamond_pickaxe': 'Pioche en diamant', 'netherite_pickaxe': 'Pioche en netherite',
            'wooden_axe': 'Hache en bois', 'stone_axe': 'Hache en pierre', 'iron_axe': 'Hache en fer', 'golden_axe': 'Hache en or', 'diamond_axe': 'Hache en diamant', 'netherite_axe': 'Hache en netherite',
            'wooden_shovel': 'Pelle en bois', 'stone_shovel': 'Pelle en pierre', 'iron_shovel': 'Pelle en fer', 'golden_shovel': 'Pelle en or', 'diamond_shovel': 'Pelle en diamant', 'netherite_shovel': 'Pelle en netherite',
            'wooden_hoe': 'Houe en bois', 'stone_hoe': 'Houe en pierre', 'iron_hoe': 'Houe en fer', 'golden_hoe': 'Houe en or', 'diamond_hoe': 'Houe en diamant', 'netherite_hoe': 'Houe en netherite',
            'bow': 'Arc', 'crossbow': 'Arbalète', 'shield': 'Bouclier', 'elytra': 'Élytres', 'trident': 'Trident', 'mace': 'Masse', 'fishing_rod': 'Canne à pêche',
            'cobblestone': 'Pierre', 'dirt': 'Terre', 'oak_planks': 'Planches de chêne', 'birch_planks': 'Planches de bouleau', 'spruce_planks': 'Planches de sapin',
            'oak_log': 'Bûche de chêne', 'birch_log': 'Bûche de bouleau', 'spruce_log': 'Bûche de sapin', 'stick': 'Bâton', 'torch': 'Torche',
            'crafting_table': 'Établi', 'furnace': 'Fourneau', 'chest': 'Coffre', 'coal': 'Charbon', 'iron_ingot': 'Lingot de fer', 'gold_ingot': 'Lingot d\'or', 'diamond': 'Diamant',
            'raw_iron': 'Fer brut', 'raw_gold': 'Or brut', 'raw_copper': 'Cuivre brut',
            'porkchop': 'Côtelette de porc crue', 'cooked_porkchop': 'Côtelette de porc cuite', 'beef': 'Bœuf cru', 'cooked_beef': 'Steak', 'salmon': 'Saumon cru', 'cooked_salmon': 'Saumon cuit',
            'bread': 'Pain', 'apple': 'Pomme', 'golden_apple': 'Pomme dorée', 'enchanted_golden_apple': 'Pomme dorée enchantée',
            'rotten_flesh': 'Chair putréfiée', 'bone': 'Os', 'string': 'Ficelle', 'feather': 'Plume', 'gunpowder': 'Poudre à canon', 'tnt': 'TNT',
            'sand': 'Sable', 'gravel': 'Gravier', 'glass': 'Verre', 'leather': 'Cuir', 'oak_boat': 'Bateau en chêne'
          };

          const parseItemObj = (rawItem, slotNum) => {
            const cleanId = rawItem.id || '';
            const rawName = cleanId.replace(/^minecraft:/, '');
            const comp = rawItem.components || rawItem.tag || {};
            const enchants = [];

            // 1. Enchantements modernes (Data Components 1.20.5+ et 26.x)
            const modernEnchants = comp['minecraft:enchantments'] || comp.enchantments || comp['minecraft:stored_enchantments'] || comp.stored_enchantments;
            if (modernEnchants) {
              const levelsObj = (modernEnchants.levels && typeof modernEnchants.levels === 'object') ? modernEnchants.levels : modernEnchants;
              if (typeof levelsObj === 'object') {
                for (const [rawEId, lvl] of Object.entries(levelsObj)) {
                  if (typeof lvl === 'number' && lvl > 0) {
                    const eId = rawEId.replace(/^minecraft:/, '');
                    const eName = ENCHANT_TRANSLATIONS[eId] || eId.replace(/_/g, ' ');
                    enchants.push({ id: eId, name: eName, level: lvl, romanLevel: toRoman(lvl) });
                  }
                }
              }
            }

            // 2. Enchantements legacy NBT (1.20.4 et antérieur)
            const legacyList = (rawItem.tag && (rawItem.tag.Enchantments || rawItem.tag.StoredEnchantments)) || [];
            if (Array.isArray(legacyList)) {
              for (const e of legacyList) {
                if (e && e.id) {
                  const eId = String(e.id).replace(/^minecraft:/, '');
                  const lvl = typeof e.lvl === 'number' ? e.lvl : 1;
                  const eName = ENCHANT_TRANSLATIONS[eId] || eId.replace(/_/g, ' ');
                  if (!enchants.some(x => x.id === eId)) {
                    enchants.push({ id: eId, name: eName, level: lvl, romanLevel: toRoman(lvl) });
                  }
                }
              }
            }

            const isEnchanted = enchants.length > 0 || (comp['minecraft:enchantment_glint_override'] === true);
            const damage = (comp && comp['minecraft:damage'] !== undefined) ? comp['minecraft:damage'] : (rawItem.tag && rawItem.tag.Damage !== undefined ? rawItem.tag.Damage : null);
            const customName = (comp && (comp['minecraft:custom_name'] || comp['minecraft:item_name'])) || (rawItem.tag && rawItem.tag.display && rawItem.tag.display.Name) || null;
            const dyedColor = (comp && comp['minecraft:dyed_color'] && comp['minecraft:dyed_color'].rgb !== undefined) ? comp['minecraft:dyed_color'].rgb : (rawItem.tag && rawItem.tag.display && rawItem.tag.display.color) || null;

            // Calcul Durabilité
            let maxDamage = comp['minecraft:max_damage'] || VANILLA_MAX_DURABILITY[rawName] || null;
            let currentDurability = null;
            let durabilityPercent = null;

            if (maxDamage !== null && maxDamage > 0) {
              const currentDamage = damage || 0;
              currentDurability = Math.max(0, maxDamage - currentDamage);
              durabilityPercent = Math.max(0, Math.min(100, Math.round((currentDurability / maxDamage) * 100)));
            }

            const frenchName = VANILLA_ITEM_NAMES[rawName] || rawName.replace(/_/g, ' ');

            return {
              slot: slotNum,
              id: cleanId,
              name: frenchName,
              count: rawItem.count !== undefined ? rawItem.count : (rawItem.Count !== undefined ? rawItem.Count : 1),
              enchants,
              isEnchanted,
              damage,
              maxDamage,
              durability: currentDurability,
              durabilityPercent,
              customName,
              dyedColor
            };
          };

          // Inventaire standard
          if (Array.isArray(nbt.Inventory)) {
            inventory = nbt.Inventory.map(item => parseItemObj(item, item.Slot));
          }

          // Armure dans nbt.equipment (Minecraft 26.3+ snapshots & modern releases)
          if (nbt.equipment && typeof nbt.equipment === 'object') {
            const equipMapping = {
              head: 103,
              chest: 102,
              legs: 101,
              feet: 100,
              offhand: -106,
              body: 102
            };
            for (const [part, slotNum] of Object.entries(equipMapping)) {
              const eqItem = nbt.equipment[part];
              if (eqItem && eqItem.id) {
                const existingIdx = inventory.findIndex(it => it.slot === slotNum);
                const itemObj = parseItemObj(eqItem, slotNum);
                if (existingIdx >= 0) {
                  inventory[existingIdx] = itemObj;
                } else {
                  inventory.push(itemObj);
                }
              }
            }
          }
        } catch (e) {
          console.warn('Erreur lecture playerdata NBT:', e.message);
        }
      }
    }

    // Statistiques
    let playTimeTicks = 0;
    let playerKills = 0;
    let deaths = 0;
    let mobKills = 0;

    if (uuid) {
      const candidateStatsPaths = [
        path.join(worldPath, levelName, 'players', 'stats', `${uuid}.json`),
        path.join(worldPath, levelName, 'stats', `${uuid}.json`),
        path.join(worldPath, 'world', 'players', 'stats', `${uuid}.json`),
        path.join(worldPath, 'world', 'stats', `${uuid}.json`),
        path.join(worldPath, 'players', 'stats', `${uuid}.json`),
        path.join(worldPath, 'stats', `${uuid}.json`)
      ];
      let statsPath = null;
      for (const p of candidateStatsPaths) {
        if (fs.existsSync(p)) {
          statsPath = p;
          break;
        }
      }

      if (statsPath) {
        try {
          const statsJson = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
          const custom = (statsJson && statsJson.stats && statsJson.stats['minecraft:custom']) || {};
          playTimeTicks = custom['minecraft:play_time'] || custom['minecraft:total_world_time'] || 0;
          playerKills = custom['minecraft:player_kills'] || 0;
          deaths = custom['minecraft:deaths'] || 0;
          mobKills = custom['minecraft:mob_kills'] || 0;
        } catch (e) {}
      }
    }

    // Calcul du temps de jeu formaté
    const totalSeconds = Math.floor(playTimeTicks / 20);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    let playTimeFormatted = `${minutes} min`;
    if (hours > 0) {
      playTimeFormatted = `${hours} heure${hours > 1 ? 's' : ''}, ${minutes} min`;
    }

    const kdr = deaths > 0 ? (playerKills / deaths).toFixed(2) : playerKills.toFixed(1);

    return {
      worldId,
      name: playerName,
      uuid: uuid || 'Non généré',
      isOnline,
      isOp,
      isWhitelisted,
      isBanned,
      gameMode,
      health,
      maxHealth,
      foodLevel,
      foodSaturation,
      xpLevel,
      xpProgress,
      position,
      spawnPosition,
      lastDeathPosition,
      inventory,
      stats: {
        playTimeFormatted,
        playerKills,
        deaths,
        mobKills,
        kdr
      }
    };
  }

  /**
   * Exécute une action en jeu sur un joueur (soigner, nourrir, tuer, xp, gamemode, etc.)
   */
  async executePlayerAction(worldId, playerName, action, value, minecraftService) {
    const isRunning = (minecraftService.activeWorld === worldId && minecraftService.status === 'RUNNING');
    const target = playerName.trim();

    if (!target) throw new Error('Pseudo de joueur manquant.');

    switch (action) {
      case 'heal': {
        if (!isRunning) throw new Error('Le serveur doit être allumé pour soigner le joueur.');
        minecraftService.sendCommand(`effect give ${target} instant_health 1 255`);
        minecraftService.sendCommand(`effect give ${target} saturation 1 255`);
        return { success: true, message: `${target} a été soigné.` };
      }

      case 'feed': {
        if (!isRunning) throw new Error('Le serveur doit être allumé pour nourrir le joueur.');
        minecraftService.sendCommand(`effect give ${target} saturation 1 255`);
        await new Promise(r => setTimeout(r, 200));
        return { success: true, message: `${target} a été nourri.` };
      }

      case 'damage':
      case 'drain_health':
      case 'poison':
      case 'kill': {
        if (!isRunning) throw new Error('Le serveur doit être allumé pour vider la vie du joueur.');
        minecraftService.sendCommand(`effect give ${target} poison 1 252`);
        return { success: true, message: `Barre de santé de ${target} vidée (1/2 cœur).` };
      }

      case 'starve': {
        if (!isRunning) throw new Error('Le serveur doit être allumé pour affamer le joueur.');
        minecraftService.sendCommand(`effect give ${target} hunger 1 255`);
        return { success: true, message: `Barre de faim de ${target} vidée.` };
      }

      case 'xp': {
        if (!isRunning) throw new Error('Le serveur doit être allumé pour modifier l\'XP.');
        const levels = parseInt(value, 10);
        if (isNaN(levels) || levels === 0) throw new Error('Montant d\'XP invalide.');
        minecraftService.sendCommand(`experience add ${target} ${levels} levels`);
        const msg = levels > 0 
          ? `+${levels} niveau(x) d'XP donné(s) à ${target}.` 
          : `${levels} niveau(x) d'XP retiré(s) à ${target}.`;
        return { success: true, message: msg };
      }

      case 'gamemode': {
        if (!isRunning) throw new Error('Le serveur doit être allumé pour changer le mode de jeu.');
        const mode = String(value).trim().toLowerCase();
        minecraftService.sendCommand(`gamemode ${mode} ${target}`);

        // Enregistrer immédiatement le mode de jeu en mémoire pour synchronisation instantanée
        if (minecraftService) {
          if (!minecraftService._playerGameModes) {
            minecraftService._playerGameModes = new Map();
          }
          minecraftService._playerGameModes.set(`${worldId}:${target.toLowerCase()}`, {
            mode,
            timestamp: Date.now()
          });
          try {
            if (minecraftService.activeProcess && minecraftService.activeProcess.stdin) {
              minecraftService.activeProcess.stdin.write('save-all\n');
            }
          } catch (e) {}
        }

        return { success: true, message: `Mode de jeu de ${target} changé en ${mode}.`, gameMode: mode };
      }

      case 'teleport': {
        if (!isRunning) throw new Error('Le serveur doit être allumé pour téléporter le joueur.');
        const dest = String(value).trim();
        minecraftService.sendCommand(`tp ${target} ${dest}`);
        return { success: true, message: `${target} téléporté vers ${dest}.` };
      }

      case 'toggleControl': {
        const control = typeof value === 'string' ? value : (value?.control || value?.type);
        const normalizedControl = (control === 'ban' || control === 'banned') ? 'bannedPlayers' : (control === 'op' ? 'ops' : control);
        let desiredState = value?.state;

        if (desiredState === undefined) {
          const details = await this.getPlayerDetails(worldId, target, minecraftService);
          if (normalizedControl === 'whitelist') desiredState = !details.isWhitelisted;
          else if (normalizedControl === 'bannedPlayers') desiredState = !details.isBanned;
          else if (normalizedControl === 'ops') desiredState = !details.isOp;
          else desiredState = true;
        }

        if (desiredState) {
          await minecraftService.addPlayer(worldId, normalizedControl, target);
        } else {
          await minecraftService.removePlayer(worldId, normalizedControl, target);
        }
        return { 
          success: true, 
          control: normalizedControl, 
          state: desiredState,
          message: `${target} ${desiredState ? 'activé dans' : 'retiré de'} ${normalizedControl}.`
        };
      }

      case 'deleteData':
      case 'deletePlayerData': {
        return await this.deletePlayerData(worldId, target, minecraftService);
      }

      default:
        throw new Error(`Action inconnue: ${action}`);
    }
  }

  /**
   * Résout l'UUID d'un joueur par son pseudo ou retourne l'UUID s'il est déjà au bon format
   */
  async resolvePlayerUuid(worldId, targetName, minecraftService) {
    if (!worldId || !targetName) return null;
    if (targetName.includes('-')) return targetName;
    const worldPath = this.resolveWorldPath(worldId, minecraftService);
    if (!worldPath || !fs.existsSync(worldPath)) return null;
    return this.findPlayerUuid(worldPath, targetName);
  }

  /**
   * Supprime complètement les données d'un joueur dans le monde (playerdata, stats, advancements)
   */
  async deletePlayerData(worldId, targetName, minecraftService) {
    if (!worldId || !targetName) {
      throw new Error('Paramètres manquants (worldId, targetName).');
    }

    const worldPath = this.resolveWorldPath(worldId, minecraftService);
    if (!worldPath || !fs.existsSync(worldPath)) throw new Error('Dossier du monde introuvable.');

    const uuid = targetName.includes('-') ? targetName : this.findPlayerUuid(worldPath, targetName);

    // Si le joueur est en ligne, le kicker d'abord pour décharger son profil mémoire
    const isRunning = (minecraftService.status === 'RUNNING');
    if (isRunning && minecraftService.activeWorld === worldId) {
      try {
        minecraftService.sendCommand(`kick ${targetName} "Vos donnees ont ete reinitialisees."`);
      } catch (e) {}
    }

    let deletedFilesCount = 0;
    const deletedFiles = [];

    // Dossiers cibles possibles (structure Vanilla / Paper / Fabric / Forge)
    const subDirs = [
      'playerdata',
      path.join('world', 'playerdata'),
      path.join('players', 'data'),
      'stats',
      path.join('world', 'stats'),
      path.join('players', 'stats'),
      'advancements',
      path.join('world', 'advancements'),
      path.join('players', 'advancements')
    ];

    for (const sub of subDirs) {
      const fullDir = path.join(worldPath, sub);
      if (fs.existsSync(fullDir)) {
        const possibleFiles = [];
        if (uuid) {
          possibleFiles.push(`${uuid}.dat`, `${uuid}.dat_old`, `${uuid}.json`);
        }
        if (targetName) {
          possibleFiles.push(`${targetName}.dat`, `${targetName}.dat_old`, `${targetName}.json`);
        }
        for (const f of possibleFiles) {
          const filePath = path.join(fullDir, f);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
              deletedFilesCount++;
              deletedFiles.push(f);
            } catch (e) {}
          }
        }
      }
    }

    // Nettoyage de usercache.json (évite que le joueur ne réapparaisse dans la liste globale des joueurs)
    const cleanUserCache = (ucPath) => {
      if (fs.existsSync(ucPath)) {
        try {
          const cache = JSON.parse(fs.readFileSync(ucPath, 'utf8'));
          if (Array.isArray(cache)) {
            const filtered = cache.filter(e => {
              const nameMatch = e.name && e.name.toLowerCase() === targetName.toLowerCase();
              const uuidMatch = uuid && e.uuid === uuid;
              return !nameMatch && !uuidMatch;
            });
            fs.writeFileSync(ucPath, JSON.stringify(filtered, null, 2), 'utf8');
          }
        } catch (e) {}
      }
    };
    cleanUserCache(path.join(worldPath, 'usercache.json'));
    cleanUserCache(path.join(worldPath, 'world', 'usercache.json'));

    // Nettoyage des fichiers JSON de permissions (ops, whitelist, bans)
    const cleanJsonList = (fileName) => {
      const p = path.join(worldPath, fileName);
      if (fs.existsSync(p)) {
        try {
          const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (Array.isArray(arr)) {
            const filtered = arr.filter(e => {
              const name = typeof e === 'string' ? e : (e.name || '');
              const eUuid = e.uuid || '';
              const nameMatch = name && name.toLowerCase() === targetName.toLowerCase();
              const uuidMatch = uuid && eUuid === uuid;
              return !nameMatch && !uuidMatch;
            });
            fs.writeFileSync(p, JSON.stringify(filtered, null, 2), 'utf8');
          }
        } catch (e) {}
      }
    };
    cleanJsonList('ops.json');
    cleanJsonList('whitelist.json');
    cleanJsonList('banned-players.json');

    // Décharger de la liste en mémoire si présent
    if (minecraftService && Array.isArray(minecraftService.players)) {
      minecraftService.players = minecraftService.players.filter(p => {
        const pName = typeof p === 'string' ? p : (p.name || '');
        return pName.toLowerCase() !== targetName.toLowerCase();
      });
    }

    return {
      success: true,
      playerName: targetName,
      uuid: uuid || null,
      deletedFilesCount,
      deletedFiles,
      message: `Données et profil de ${targetName} supprimés avec succès (${deletedFilesCount} fichier(s) réinitialisé(s)).`
    };
  }
}

module.exports = new PlayerDataService();


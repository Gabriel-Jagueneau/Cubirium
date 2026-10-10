const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function readJarEntry(jarPath, entryPath) {
  const isWin = process.platform === 'win32';
  if (isWin) {
    try {
      return execSync(`tar -xOf "${jarPath}" "${entryPath}" 2>nul`, { maxBuffer: 1024 * 1024 }).toString('utf8');
    } catch (_) {
      try {
        const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z = [System.IO.Compression.ZipFile]::OpenRead('${jarPath.replace(/'/g, "''")}'); $e = $z.GetEntry('${entryPath.replace(/'/g, "''")}'); if ($e) { $sr = New-Object System.IO.StreamReader($e.Open()); $sr.ReadToEnd() }`;
        return execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { maxBuffer: 1024 * 1024 }).toString('utf8');
      } catch (__) {
        return '';
      }
    }
  } else {
    try {
      return execSync(`/usr/bin/unzip -p "${jarPath}" "${entryPath}" 2>/dev/null || unzip -p "${jarPath}" "${entryPath}" 2>/dev/null`, { maxBuffer: 1024 * 1024 }).toString('utf8');
    } catch (_) {
      return '';
    }
  }
}


// Liste exhaustive de mods connus comme étant strictement réservés au client
const CLIENT_ONLY_PATTERNS = [
  // Graphismes, shaders, rendu
  /optifine/i,
  /sodium/i,
  /rubidium/i,
  /embeddium/i,
  /iris/i,
  /oculus/i,
  /canvas/i,
  /indium/i,
  /reeses[_-]?sodium[_-]?options/i,
  /sodium[_-]?extra/i,
  /entityculling/i,
  /dynamiclights/i,
  /continuity/i,
  /cullleaves/i,
  /fastipflop/i,
  /lambdynamiclights/i,
  /fabric[_-]?skyboxes/i,
  /custom[_-]?fog/i,
  /distanthorizons/i,
  /nvidium/i,
  /vulkanmod/i,
  /gpumemleakfix/i,

  // HUD, Menus, GUI, cosmétique d'interface
  /fancymenu/i,
  /drippy/i,
  /customloadingscreen/i,
  /modmenu/i,
  /catalogue/i,
  /configured/i,
  /controlling/i,
  /searchables/i,
  /toastcontrol/i,
  /betterf3/i,
  /shulkerboxtooltip/i,
  /inventoryhud/i,
  /armorstatushud/i,
  /clickadv/i,
  /highlighter/i,
  /tip[_-]?the[_-]?scales/i,
  /chat[_-]?heads/i,
  /chatheads/i,
  /authme[_-]?client/i,
  /smoothboot/i,
  /borderless/i,
  /fullscreenwindowed/i,

  // Minimap client-only
  /xaeros[_-]?minimap/i,
  /xaerominimap/i,
  /voxelmap/i,
  /mapwriter/i,

  // Animations, physique visuelle, cosmétiques
  /skinlayers3d/i,
  /3d[_-]?skin[_-]?layers/i,
  /waveycapes/i,
  /notenoughanimations/i,
  /firstperson/i,
  /eatinganimation/i,
  /visuallayers/i,
  /customskinloader/i,
  /ears/i,
  /physicsmod[_-]client/i,
  /ambientenvironment/i,
  /presencefootsteps/i,
  /soundphysics/i,
  /dynamic[_-]?crosshair/i,
  /visuality/i,

  // Utilitaires de schéma / capture / zoom client
  /replaymod/i,
  /minihud/i,
  /litematica/i,
  /tweakeroo/i,
  /itemscroller/i,
  /malilib/i,
  /freecam/i,
  /zoomify/i,
  /ok[_-]?zoomer/i,
  /wi[_-]?zoom/i,
  /logical[_-]?zoom/i,
  /gammautils/i
];

class ModFilterService {
  constructor() {}

  /**
   * Inspecte les métadonnées d'un fichier jar individuel
   */
  inspectJar(jarPath) {
    const filename = path.basename(jarPath);
    let isClientOnly = false;
    let reason = null;
    let modId = null;
    let modName = null;
    let detectedLoader = null;
    let detectedMcVersion = null;

    // 1. Test heuristique par nom de fichier
    for (const pattern of CLIENT_ONLY_PATTERNS) {
      if (pattern.test(filename)) {
        isClientOnly = true;
        reason = `Mod client identifié par signature (${pattern.source})`;
        break;
      }
    }

    // 2. Inspection interne Fabric (fabric.mod.json)
    try {
      const fabricJson = readJarEntry(jarPath, 'fabric.mod.json');

      if (fabricJson.trim()) {
        detectedLoader = 'fabric';
        const parsed = JSON.parse(fabricJson);
        modId = parsed.id || modId;
        modName = parsed.name || modName;

        if (parsed.environment === 'client') {
          isClientOnly = true;
          reason = "Déclaré explicitement 'environment: client' dans fabric.mod.json";
        }

        if (parsed.depends && parsed.depends.minecraft) {
          const rawDep = Array.isArray(parsed.depends.minecraft) ? parsed.depends.minecraft.join(' ') : String(parsed.depends.minecraft);
          const mcMatch = rawDep.match(/(?:1\.\d+(?:\.\d+)?|2[56]\.\d+)/);
          if (mcMatch) detectedMcVersion = mcMatch[0];
        }
      }
    } catch (e) {
      // Pas de fabric.mod.json ou parse error
    }

    // 3. Inspection interne Quilt (quilt.mod.json)
    if (!isClientOnly) {
      try {
        const quiltJson = readJarEntry(jarPath, 'quilt.mod.json');

        if (quiltJson.trim()) {
          detectedLoader = 'quilt';
          const parsed = JSON.parse(quiltJson);
          if (parsed.quilt_loader && parsed.quilt_loader.environment === 'client') {
            isClientOnly = true;
            reason = "Déclaré 'environment: client' dans quilt.mod.json";
          }
        }
      } catch (e) {
        // Pas de quilt.mod.json
      }
    }

    let detectedLoaderVersion = null;

    // 4. Inspection Forge / NeoForge (mods.toml ou neoforge.mods.toml)
    if (!isClientOnly) {
      try {
        let tomlContent = readJarEntry(jarPath, 'META-INF/neoforge.mods.toml');
        if (!tomlContent.trim()) {
          tomlContent = readJarEntry(jarPath, 'META-INF/mods.toml');
        }

        if (tomlContent.trim()) {
          const isNeo = /neoforge/i.test(tomlContent);
          detectedLoader = isNeo ? 'neoforge' : 'forge';

          const idMatch = tomlContent.match(/modId\s*=\s*["']([^"']+)["']/i);
          if (idMatch) modId = idMatch[1];
          const nameMatch = tomlContent.match(/displayName\s*=\s*["']([^"']+)["']/i);
          if (nameMatch) modName = nameMatch[1];

          // 1. Chercher spécifiquement la version NeoForge/Forge
          const loaderDepMatch = tomlContent.match(/modId\s*=\s*["'](?:neoforge|forge)["'][\s\S]*?versionRange\s*=\s*["']\[?([0-9\.]+)/i);
          if (loaderDepMatch) {
            detectedLoaderVersion = loaderDepMatch[1];
          }

          // 2. Chercher spécifiquement la version Minecraft
          const mcDepMatch = tomlContent.match(/modId\s*=\s*["']minecraft["'][\s\S]*?versionRange\s*=\s*["']\[?([0-9\.]+)/i);
          if (mcDepMatch) {
            detectedMcVersion = mcDepMatch[1];
          } else {
            // Repli sur conversion de la version NeoForge (ex: 21.1.206 -> 1.21.1)
            if (detectedLoaderVersion && detectedLoaderVersion.startsWith('21.')) {
              detectedMcVersion = detectedLoaderVersion.startsWith('21.1') ? '1.21.1' : '1.21';
            } else if (detectedLoaderVersion && detectedLoaderVersion.startsWith('20.')) {
              const sub = detectedLoaderVersion.split('.')[1] || '1';
              detectedMcVersion = `1.20.${sub}`;
            }
          }

          // Ne vérifier le side que dans la déclaration du mod lui-même [[mods]] et non dans ses dépendances
          const modSectionMatch = tomlContent.match(/\[\[mods\]\]([\s\S]*?)(?:\[\[dependencies|$)/i);
          if (modSectionMatch && /side\s*=\s*["']CLIENT["']/i.test(modSectionMatch[1])) {
            isClientOnly = true;
            reason = "Spécifié 'side = CLIENT' au niveau du mod dans mods.toml";
          }
        }
      } catch (e) {
        // Pas de toml
      }
    }

    // Heuristiques prioritaires sur le nom de fichier (ex: [1.21.1] SecurityCraft...)
    const fnMcMatch = filename.match(/(?:\[|\b|\D)(1\.\d+(?:\.\d+)?|2[56]\.\d+)(?:\]|\b|\D)/);
    if (fnMcMatch) {
      detectedMcVersion = fnMcMatch[1];
    } else if (!detectedMcVersion) {
      const fnVerMatch = filename.match(/(?:mc|[-_v])(1\.\d+(?:\.\d+)?|2[56]\.\d+)/i);
      if (fnVerMatch) detectedMcVersion = fnVerMatch[1];
    }

    // Fallback et normalisation stricte : une version Minecraft ne commence pas par 21. ou 20.
    if (detectedMcVersion && /^(?:20|21)\.\d+/.test(detectedMcVersion)) {
      if (detectedMcVersion.startsWith('21.1')) detectedMcVersion = '1.21.1';
      else if (detectedMcVersion.startsWith('21.0') || detectedMcVersion === '21') detectedMcVersion = '1.21';
      else if (detectedMcVersion.startsWith('20.')) {
        const sub = detectedMcVersion.split('.')[1] || '1';
        detectedMcVersion = `1.20.${sub}`;
      } else {
        detectedMcVersion = '1.21.1';
      }
    }

    if (!detectedLoader) {
      if (/neoforge/i.test(filename)) detectedLoader = 'neoforge';
      else if (/fabric/i.test(filename)) detectedLoader = 'fabric';
      else if (/forge/i.test(filename)) detectedLoader = 'forge';
      else if (/quilt/i.test(filename)) detectedLoader = 'quilt';
    }

    const stats = fs.existsSync(jarPath) ? fs.statSync(jarPath) : { size: 0 };

    return {
      filename,
      filepath: jarPath,
      size: stats.size,
      modId: modId || filename.replace(/\.jar$/i, ''),
      modName: modName || filename,
      isClientOnly,
      detectedLoader,
      detectedMcVersion,
      reason: reason || (isClientOnly ? 'Mod purement client' : 'Compatible serveur')
    };
  }

  /**
   * Analyse un dossier contenant des fichiers jars ou un zip de modpack
   */
  async analyze(sourcePath, onProgress) {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Le chemin source n'existe pas: ${sourcePath}`);
    }

    const stat = fs.statSync(sourcePath);
    let workingDir = sourcePath;
    let isTempZip = false;

    // Si c'est un fichier ZIP / mrpack
    if (stat.isFile() && (sourcePath.toLowerCase().endsWith('.zip') || sourcePath.toLowerCase().endsWith('.mrpack'))) {
      if (onProgress) onProgress(5, "Décompression de l'archive du modpack...", 0, 0);
      const tempExtract = path.join(os.tmpdir(), `modpack_extract_${Date.now()}`);
      fs.mkdirSync(tempExtract, { recursive: true });
      if (process.platform === 'win32') {
        try {
          execSync(`tar -xf "${sourcePath}" -C "${tempExtract}" 2>nul`);
        } catch (_) {
          execSync(`powershell -NoProfile -NonInteractive -Command "Expand-Archive -LiteralPath '${sourcePath}' -DestinationPath '${tempExtract}' -Force"`);
        }
      } else {
        execSync(`/usr/bin/unzip -q "${sourcePath}" -d "${tempExtract}" 2>/dev/null || unzip -q "${sourcePath}" -d "${tempExtract}" 2>/dev/null`);
      }
      workingDir = tempExtract;
      isTempZip = true;
    }

    // Trouver tous les fichiers .jar
    const jarFiles = [];
    if (stat.isFile() && sourcePath.toLowerCase().endsWith('.jar')) {
      jarFiles.push(sourcePath);
    } else {
      const findJars = (dir) => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              if (!entry.name.startsWith('.')) {
                findJars(fullPath);
              }
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.jar')) {
              jarFiles.push(fullPath);
            }
          }
        } catch (e) {}
      };
      findJars(workingDir);
    }

    const totalJars = jarFiles.length;
    if (onProgress) {
      onProgress(15, `${totalJars} mod(s) détecté(s), début du tri intelligent...`, 0, totalJars);
    }

    // Analyse Modrinth mrpack index si présent
    const modrinthIndex = path.join(workingDir, 'modrinth.index.json');
    let modrinthServerUnsupported = new Set();
    let modrinthGameVersion = null;
    let modrinthLoader = null;

    if (fs.existsSync(modrinthIndex)) {
      try {
        const mdata = JSON.parse(fs.readFileSync(modrinthIndex, 'utf8'));
        if (mdata.dependencies) {
          modrinthGameVersion = mdata.dependencies.minecraft || null;
          if (mdata.dependencies['fabric-loader']) modrinthLoader = 'fabric';
          else if (mdata.dependencies['neoforge']) modrinthLoader = 'neoforge';
          else if (mdata.dependencies['forge']) modrinthLoader = 'forge';
          else if (mdata.dependencies['quilt-loader']) modrinthLoader = 'quilt';
        }
        if (mdata.files && Array.isArray(mdata.files)) {
          for (const f of mdata.files) {
            if (f.env && f.env.server === 'unsupported' && f.path) {
              modrinthServerUnsupported.add(path.basename(f.path));
            }
          }
        }
      } catch (e) {}
    }

    const serverMods = [];
    const clientOnlyMods = [];
    const loaderCounts = {};
    const versionCounts = {};

    for (let i = 0; i < jarFiles.length; i++) {
      const jarPath = jarFiles[i];
      const filename = path.basename(jarPath);
      const pct = totalJars > 0 ? (15 + Math.round(((i + 1) / totalJars) * 80)) : 95;
      if (onProgress) {
        onProgress(pct, `Tri du mod ${i + 1}/${totalJars} : ${filename}`, i + 1, totalJars);
      }

      const info = this.inspectJar(jarPath);
      if (modrinthServerUnsupported.has(info.filename)) {
        info.isClientOnly = true;
        info.reason = "Marqué 'env.server: unsupported' dans modrinth.index.json";
      }

      if (info.detectedLoader) {
        loaderCounts[info.detectedLoader] = (loaderCounts[info.detectedLoader] || 0) + 1;
      }
      if (info.detectedMcVersion) {
        versionCounts[info.detectedMcVersion] = (versionCounts[info.detectedMcVersion] || 0) + 1;
      }

      if (info.isClientOnly) {
        clientOnlyMods.push(info);
      } else {
        serverMods.push(info);
      }
    }

    if (onProgress) {
      onProgress(100, `Tri terminé : ${serverMods.length} mods serveur, ${clientOnlyMods.length} mods client exclus.`, totalJars, totalJars);
    }

    // Déterminer le loader prédominant
    let detectedLoader = modrinthLoader || null;
    if (!detectedLoader) {
      const sortedLoaders = Object.entries(loaderCounts).sort((a, b) => b[1] - a[1]);
      if (sortedLoaders.length > 0) detectedLoader = sortedLoaders[0][0];
    }
    if (!detectedLoader) detectedLoader = 'fabric'; // Default standard

    // Déterminer la version Minecraft prédominante
    let detectedMcVersion = modrinthGameVersion || null;
    if (!detectedMcVersion) {
      const sortedVersions = Object.entries(versionCounts).sort((a, b) => b[1] - a[1]);
      if (sortedVersions.length > 0) detectedMcVersion = sortedVersions[0][0];
    }
    if (!detectedMcVersion) detectedMcVersion = '1.21.1'; // Default stable

    return {
      isZip: isTempZip,
      workingDir,
      tempExtractDir: isTempZip ? workingDir : null,
      totalCount: jarFiles.length,
      detectedLoader,
      detectedMcVersion,
      serverMods,
      clientOnlyMods
    };
  }

  /**
   * Déploie les mods serveur filtrés vers le dossier mods cible
   */
  async deployServerMods(analysisResult, targetModsDir, overrideSelection = null, onProgress = null) {
    if (!fs.existsSync(targetModsDir)) {
      fs.mkdirSync(targetModsDir, { recursive: true });
    }

    let toInstall = analysisResult.serverMods;

    // Si l'utilisateur a ajusté la sélection
    if (overrideSelection && Array.isArray(overrideSelection)) {
      const allMods = [...analysisResult.serverMods, ...analysisResult.clientOnlyMods];
      toInstall = allMods.filter(m => overrideSelection.includes(m.filename));
    }

    let installedCount = 0;
    const installedList = [];
    const totalMods = toInstall.length;

    for (const mod of toInstall) {
      const dest = path.join(targetModsDir, mod.filename);
      fs.copyFileSync(mod.filepath, dest);
      installedCount++;
      installedList.push(mod.filename);
      if (onProgress && totalMods > 0 && (installedCount % 10 === 0 || installedCount === totalMods)) {
        const pct = 15 + Math.round((installedCount / totalMods) * 15);
        onProgress(pct, `Déploiement des mods serveur (${installedCount}/${totalMods})...`);
      }
    }

    // Si un dossier temporaire avait été extrait pour un zip, on peut le supprimer
    if (analysisResult.tempExtractDir && fs.existsSync(analysisResult.tempExtractDir)) {
      try {
        fs.rmSync(analysisResult.tempExtractDir, { recursive: true, force: true });
      } catch (e) {}
    }

    return {
      installedCount,
      installedList,
      targetModsDir
    };
  }
}

module.exports = new ModFilterService();

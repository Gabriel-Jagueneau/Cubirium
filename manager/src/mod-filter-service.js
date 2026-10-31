const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function readJarEntry(jarPath, entryPath) {
  const isWin = process.platform === 'win32';
  if (isWin) {
    try {
      const normForward = entryPath.replace(/\\/g, '/');
      const normBack = entryPath.replace(/\//g, '\\');
      try {
        return execSync(`tar -xOf "${jarPath}" "${normForward}" 2>nul`, { maxBuffer: 1024 * 1024, windowsHide: true }).toString('utf8');
      } catch (_) {
        return execSync(`tar -xOf "${jarPath}" "${normBack}" 2>nul`, { maxBuffer: 1024 * 1024, windowsHide: true }).toString('utf8');
      }
    } catch (_) {
      try {
        const norm = entryPath.replace(/\\/g, '/');
        const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z = [System.IO.Compression.ZipFile]::OpenRead('${jarPath.replace(/'/g, "''")}'); $e = $z.Entries | Where-Object { ($_.FullName -replace '\\\\','/') -eq '${norm}' } | Select-Object -First 1; if ($e) { $sr = New-Object System.IO.StreamReader($e.Open()); $sr.ReadToEnd() }`;
        return execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { maxBuffer: 1024 * 1024, windowsHide: true }).toString('utf8');
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

// Liste ciblée des mods purement client (moteurs graphiques et cosmétiques sans code serveur)
// connus pour planter systématiquement sur un serveur dédié headless
const STRICT_CLIENT_CRASH_PATTERNS = [
  // Graphismes, shaders, moteurs de rendu exclusivement client
  /optifine/i,
  /sodium[_-]?fabric/i,
  /rubidium/i,
  /embeddium/i,
  /iris-mc|\biris-/i,
  /oculus/i,
  /canvas/i,
  /indium/i,
  /reeses[_-]?sodium/i,
  /sodium[_-]?extra/i,
  /entityculling/i,
  /cullleaves/i,
  /lambdynamiclights/i,
  /fabric[_-]?skyboxes/i,
  /custom[_-]?fog/i,
  /nvidium/i,
  /vulkanmod/i,
  /gpumemleakfix/i,

  // HUD, Écrans personnalisés, Menus exclusivement client
  /fancymenu/i,
  /drippy/i,
  /customloadingscreen/i,
  /\bmodmenu-/i,
  /betterf3/i,
  /inventoryhud/i,
  /armorstatushud/i,
  /chat[_-]?heads/i,
  /authme[_-]?client/i,
  /borderless/i,
  /fullscreenwindowed/i,

  // Animations et cosmétiques visuels client
  /skinlayers3d|3d[_-]?skin[_-]?layers/i,
  /waveycapes/i,
  /notenoughanimations/i,
  /firstperson/i,
  /eatinganimation/i,
  /visuallayers/i,
  /customskinloader/i,
  /physicsmod[_-]client/i,
  /dynamic[_-]?crosshair/i,
  /visuality/i,

  // Utilitaires de schéma / capture / zoom client
  /replaymod/i,
  /minihud/i,
  /litematica/i,
  /tweakeroo/i,
  /itemscroller/i,
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
  inspectJar(jarPath, { isServerPack = false } = {}) {
    const filename = path.basename(jarPath);
    let isClientOnly = false;
    let reason = null;
    let modId = null;
    let modName = null;
    let detectedLoader = null;
    let detectedMcVersion = null;
    let detectedLoaderVersion = null;
    let hasManifest = false;

    // 1. Inspection interne Fabric (fabric.mod.json)
    try {
      const fabricJson = readJarEntry(jarPath, 'fabric.mod.json');
      if (fabricJson && fabricJson.trim()) {
        hasManifest = true;
        detectedLoader = 'fabric';
        const parsed = JSON.parse(fabricJson);
        modId = parsed.id || modId;
        modName = parsed.name || modName;

        const hasServerEntrypoint = parsed.entrypoints && (parsed.entrypoints.server || parsed.entrypoints.main);
        const onlyClientEntrypoint = parsed.entrypoints && parsed.entrypoints.client && !parsed.entrypoints.server && !parsed.entrypoints.main;

        if (parsed.environment === 'client' || (onlyClientEntrypoint && !hasServerEntrypoint)) {
          isClientOnly = true;
          reason = "Déclaré réservé au client dans fabric.mod.json";
        } else {
          isClientOnly = false;
          reason = "Compatible serveur (Fabric)";
        }

        if (parsed.depends && parsed.depends.minecraft) {
          const rawDep = Array.isArray(parsed.depends.minecraft) ? parsed.depends.minecraft.join(' ') : String(parsed.depends.minecraft);
          const mcMatch = rawDep.match(/(?:1\.\d+(?:\.\d+)?|2[56]\.\d+)/);
          if (mcMatch) detectedMcVersion = mcMatch[0];
        }
      }
    } catch (_) {}

    // 2. Inspection Forge / NeoForge (META-INF/neoforge.mods.toml ou META-INF/mods.toml)
    if (!hasManifest) {
      try {
        let tomlContent = readJarEntry(jarPath, 'META-INF/neoforge.mods.toml');
        if (!tomlContent || !tomlContent.trim()) {
          tomlContent = readJarEntry(jarPath, 'META-INF/mods.toml');
        }

        if (tomlContent && tomlContent.trim()) {
          hasManifest = true;
          const isNeo = /neoforge/i.test(tomlContent) || readJarEntry(jarPath, 'META-INF/neoforge.mods.toml').trim().length > 0;
          detectedLoader = isNeo ? 'neoforge' : 'forge';

          const idMatch = tomlContent.match(/modId\s*=\s*["']([^"']+)["']/i);
          if (idMatch) modId = idMatch[1];
          const nameMatch = tomlContent.match(/displayName\s*=\s*["']([^"']+)["']/i);
          if (nameMatch) modName = nameMatch[1];

          // Détection versions loader & Minecraft
          const loaderDepMatch = tomlContent.match(/modId\s*=\s*["'](?:neoforge|forge)["'][\s\S]*?versionRange\s*=\s*["']\[?([0-9\.]+)/i);
          if (loaderDepMatch) detectedLoaderVersion = loaderDepMatch[1];

          const mcDepMatch = tomlContent.match(/modId\s*=\s*["']minecraft["'][\s\S]*?versionRange\s*=\s*["']\[?([0-9\.]+)/i);
          if (mcDepMatch) {
            detectedMcVersion = mcDepMatch[1];
          } else if (detectedLoaderVersion) {
            if (detectedLoaderVersion.startsWith('21.')) detectedMcVersion = detectedLoaderVersion.startsWith('21.1') ? '1.21.1' : '1.21';
            else if (detectedLoaderVersion.startsWith('20.')) detectedMcVersion = `1.20.${detectedLoaderVersion.split('.')[1] || '1'}`;
          }

          // Dans Forge / NeoForge, les mods sont universels par défaut (side = "BOTH").
          // On vérifie UNIQUEMENT dans les blocs [[mods]] si le mod lui-même déclare side = "CLIENT" ou clientSideOnly = true
          const modBlocks = tomlContent.split(/\[\[mods\]\]/i).slice(1);
          let declaredClientOnly = false;
          for (const block of modBlocks) {
            const modDef = block.split(/\[\[/)[0];
            if (/side\s*=\s*["']CLIENT["']/i.test(modDef) || /clientSideOnly\s*=\s*true/i.test(modDef)) {
              declaredClientOnly = true;
              break;
            }
          }

          if (declaredClientOnly) {
            isClientOnly = true;
            reason = "Déclaré réservé au client dans mods.toml";
          } else {
            isClientOnly = false;
            reason = "Compatible serveur (Forge / NeoForge)";
          }
        }
      } catch (_) {}
    }

    // 3. Inspection interne Quilt (quilt.mod.json)
    if (!hasManifest) {
      try {
        const quiltJson = readJarEntry(jarPath, 'quilt.mod.json');
        if (quiltJson && quiltJson.trim()) {
          hasManifest = true;
          detectedLoader = 'quilt';
          const parsed = JSON.parse(quiltJson);
          if (parsed.quilt_loader && parsed.quilt_loader.environment === 'client') {
            isClientOnly = true;
            reason = "Déclaré réservé au client dans quilt.mod.json";
          } else {
            isClientOnly = false;
            reason = "Compatible serveur (Quilt)";
          }
        }
      } catch (_) {}
    }

    // 4. Inspection Legacy Forge 1.7.10 - 1.12.2 (mcmod.info)
    if (!hasManifest) {
      try {
        const mcmodInfo = readJarEntry(jarPath, 'mcmod.info');
        if (mcmodInfo && mcmodInfo.trim()) {
          hasManifest = true;
          detectedLoader = 'forge';
          try {
            const parsed = JSON.parse(mcmodInfo);
            const m = Array.isArray(parsed) ? parsed[0] : (parsed.modList ? parsed.modList[0] : null);
            if (m) {
              modId = m.modid || modId;
              modName = m.name || modName;
              if (m.mcversion) detectedMcVersion = m.mcversion;
            }
          } catch (_) {}
          isClientOnly = false;
          reason = "Compatible serveur (Legacy Forge)";
        }
      } catch (_) {}
    }

    // 5. Règle spéciale : si c'est un pack de serveur officiel, tous les mods sont conservés
    if (isServerPack) {
      isClientOnly = false;
      reason = "Inclus d'office (Pack de serveur)";
    } else {
      // 6. Heuristiques sur le nom de fichier :
      // - Si aucun manifest n'a été trouvé, ou si c'est un moteur graphique incompatible headless
      if (!hasManifest || isClientOnly) {
        for (const pattern of STRICT_CLIENT_CRASH_PATTERNS) {
          if (pattern.test(filename)) {
            isClientOnly = true;
            reason = `Mod client visuel identifié (${pattern.source})`;
            break;
          }
        }
      } else {
        // Exception stricte : les moteurs graphiques purs comme OptiFine, Embeddium, Oculus
        // font planter le serveur dédié même s'ils ne définissent pas side=CLIENT
        for (const crashPattern of [/optifine/i, /embeddium/i, /rubidium/i, /oculus/i]) {
          if (crashPattern.test(filename)) {
            isClientOnly = true;
            reason = `Moteur graphique client incompatible serveur (${crashPattern.source})`;
            break;
          }
        }
      }
    }

    // Heuristiques prioritaires sur le nom de fichier pour la version MC
    const fnMcMatch = filename.match(/(?:\[|\b|\D)(1\.\d+(?:\.\d+)?|2[56]\.\d+)(?:\]|\b|\D)/);
    if (fnMcMatch) {
      detectedMcVersion = fnMcMatch[1];
    } else if (!detectedMcVersion) {
      const fnVerMatch = filename.match(/(?:mc|[-_v])(1\.\d+(?:\.\d+)?|2[56]\.\d+)/i);
      if (fnVerMatch) detectedMcVersion = fnVerMatch[1];
    }

    // Normalisation de version MC
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
          execSync(`tar -xf "${sourcePath}" -C "${tempExtract}" 2>nul`, { stdio: 'ignore', windowsHide: true });
        } catch (_) {
          execSync(`powershell -NoProfile -NonInteractive -Command "Expand-Archive -LiteralPath '${sourcePath}' -DestinationPath '${tempExtract}' -Force"`, { stdio: 'ignore', windowsHide: true });
        }
      } else {
        execSync(`/usr/bin/unzip -q "${sourcePath}" -d "${tempExtract}" 2>/dev/null || unzip -q "${sourcePath}" -d "${tempExtract}" 2>/dev/null`);
      }
      workingDir = tempExtract;
      isTempZip = true;
    }

    // Détection si la source est un Pack Serveur officiel
    const sourceBase = path.basename(sourcePath).toLowerCase();
    const parentBase = path.basename(path.dirname(sourcePath)).toLowerCase();
    const isServerPack = /server[_\s-]*pack|server[_\s-]*files|serverpack|serverfiles/i.test(sourceBase) ||
      /server[_\s-]*pack|server[_\s-]*files|serverpack|serverfiles/i.test(parentBase) ||
      fs.existsSync(path.join(workingDir, 'server.properties')) ||
      fs.existsSync(path.join(workingDir, 'run.sh')) ||
      fs.existsSync(path.join(workingDir, 'run.bat')) ||
      fs.existsSync(path.join(workingDir, 'server.jar')) ||
      fs.existsSync(path.join(path.dirname(workingDir), 'server.properties')) ||
      fs.existsSync(path.join(path.dirname(workingDir), 'run.sh')) ||
      fs.existsSync(path.join(path.dirname(workingDir), 'server.jar'));

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
    let modrinthServerSupported = new Set();
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
            if (f.path) {
              const fname = path.basename(f.path);
              if (f.env && f.env.server === 'unsupported') {
                modrinthServerUnsupported.add(fname);
              } else if (f.env && (f.env.server === 'required' || f.env.server === 'optional')) {
                modrinthServerSupported.add(fname);
              }
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

      const info = this.inspectJar(jarPath, { isServerPack });
      if (modrinthServerUnsupported.has(info.filename)) {
        info.isClientOnly = true;
        info.reason = "Marqué 'env.server: unsupported' dans modrinth.index.json";
      } else if (modrinthServerSupported.has(info.filename)) {
        info.isClientOnly = false;
        info.reason = "Compatible serveur selon modrinth.index.json";
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
    if (!detectedLoader) detectedLoader = 'fabric';

    // Déterminer la version Minecraft prédominante
    let detectedMcVersion = modrinthGameVersion || null;
    if (!detectedMcVersion) {
      const sortedVersions = Object.entries(versionCounts).sort((a, b) => b[1] - a[1]);
      if (sortedVersions.length > 0) detectedMcVersion = sortedVersions[0][0];
    }
    if (!detectedMcVersion) detectedMcVersion = '1.21.1';

    return {
      isZip: isTempZip,
      workingDir,
      tempExtractDir: isTempZip ? workingDir : null,
      totalCount: jarFiles.length,
      detectedLoader,
      detectedMcVersion,
      isServerPack,
      serverMods,
      clientOnlyMods
    };
  }

  /**
   * Déploie les mods serveur filtrés vers le dossier mods cible
   */
  async deployServerMods(analysisResult, targetModsDir, overrideSelection = null, onProgress = null, keepAllMods = false) {
    if (!fs.existsSync(targetModsDir)) {
      fs.mkdirSync(targetModsDir, { recursive: true });
    }

    const allMods = [...(analysisResult.serverMods || []), ...(analysisResult.clientOnlyMods || [])];
    let toInstall = analysisResult.serverMods || [];

    if (keepAllMods) {
      toInstall = allMods;
    } else if (overrideSelection && Array.isArray(overrideSelection) && overrideSelection.length > 0) {
      const selSet = new Set(overrideSelection.map(s => String(s).trim().toLowerCase()));
      toInstall = allMods.filter(m => selSet.has(m.filename.trim().toLowerCase()));
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

    // Nettoyage éventuel du dossier temporaire extrait
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

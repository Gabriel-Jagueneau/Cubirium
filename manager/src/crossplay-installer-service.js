const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const configService = require('./config-service');
const vanillaInstaller = require('./vanilla-installer-service');

class CrossplayInstallerService {
  constructor() {
    this.paperApiBase = 'https://api.papermc.io/v2/projects/paper';
    this.geyserDownloadUrl = 'https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot';
    this.floodgateDownloadUrl = 'https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot';
  }

  fetchJson(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, { headers: { 'User-Agent': 'Cubirium/1.1' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(this.fetchJson(res.headers.location));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} pour ${url}`));
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(destPath);
      client.get(url, { headers: { 'User-Agent': 'Cubirium/1.1' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          try { fs.unlinkSync(destPath); } catch (e) {}
          return resolve(this.downloadFile(res.headers.location, destPath, onProgress));
        }
        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(destPath); } catch (e) {}
          return reject(new Error(`Téléchargement échoué HTTP ${res.statusCode}`));
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let cur = 0;
        res.on('data', chunk => {
          cur += chunk.length;
          if (total > 0 && onProgress) {
            onProgress(Math.round((cur / total) * 100));
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve(destPath));
        });
      }).on('error', (err) => {
        file.close();
        try { fs.unlinkSync(destPath); } catch (e) {}
        reject(err);
      });
    });
  }

  /**
   * Installe un serveur Crossplay complet avec PaperMC, Geyser et Floodgate
   */
  async installCrossplayServer(cleanId, targetDir, version, onProgress, options = {}) {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'type.txt'), 'crossplay\n', 'utf8');

    const effectiveVersion = version || '1.21.1';
    const serverJarPath = path.join(targetDir, 'server.jar');
    const pluginsDir = path.join(targetDir, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });

    // 1. Télécharger ou utiliser le cache de PaperMC
    if (onProgress) onProgress(10, `Recherche de PaperMC pour Minecraft ${effectiveVersion}...`);

    const cacheDir = path.join(__dirname, '..', 'cache', 'paper-jars');
    fs.mkdirSync(cacheDir, { recursive: true });
    const cachedPaper = path.join(cacheDir, `paper-${effectiveVersion}.jar`);

    let paperInstalled = false;
    if (fs.existsSync(cachedPaper) && fs.statSync(cachedPaper).size > 15000000) {
      if (onProgress) onProgress(30, `Utilisation de PaperMC ${effectiveVersion} depuis le cache...`);
      fs.copyFileSync(cachedPaper, serverJarPath);
      paperInstalled = true;
    } else {
      try {
        const versionMeta = await this.fetchJson(`${this.paperApiBase}/versions/${effectiveVersion}`);
        if (versionMeta && versionMeta.builds && versionMeta.builds.length > 0) {
          const latestBuild = versionMeta.builds[versionMeta.builds.length - 1];
          const downloadUrl = `${this.paperApiBase}/versions/${effectiveVersion}/builds/${latestBuild}/downloads/paper-${effectiveVersion}-${latestBuild}.jar`;
          if (onProgress) onProgress(15, `Téléchargement de PaperMC (build #${latestBuild})...`);
          await this.downloadFile(downloadUrl, serverJarPath, (pct) => {
            if (onProgress) onProgress(15 + Math.round(pct * 0.35), `Téléchargement PaperMC: ${pct}%`);
          });
          if (fs.existsSync(serverJarPath) && fs.statSync(serverJarPath).size > 1000000) {
            paperInstalled = true;
            try { fs.copyFileSync(serverJarPath, cachedPaper); } catch (_) {}
          }
        }
      } catch (paperErr) {
        console.warn(`[Crossplay] Erreur téléchargement PaperMC (${paperErr.message}), tentative repli vanilla...`);
      }

      // Fallback si PaperMC n'a pas pu être téléchargé
      if (!paperInstalled) {
        if (onProgress) onProgress(35, "Repli sur l'exécutable officiel...");
        await vanillaInstaller.installVanillaServer(
          cleanId,
          effectiveVersion,
          targetDir,
          (pct, msg) => { if (onProgress) onProgress(Math.round(pct * 0.5), msg); },
          options
        );
        paperInstalled = true;
      }
    }

    // 2. Télécharger GeyserMC (passerelle Bedrock)
    const geyserJarPath = path.join(pluginsDir, 'Geyser-Spigot.jar');
    const pluginsCacheDir = path.join(__dirname, '..', 'cache', 'plugins');
    fs.mkdirSync(pluginsCacheDir, { recursive: true });
    const cachedGeyser = path.join(pluginsCacheDir, 'Geyser-Spigot.jar');
    const cachedFloodgate = path.join(pluginsCacheDir, 'floodgate-spigot.jar');

    if (fs.existsSync(cachedGeyser) && fs.statSync(cachedGeyser).size > 5000000) {
      if (onProgress) onProgress(55, "Installation du pont Bedrock (GeyserMC) depuis le cache...");
      fs.copyFileSync(cachedGeyser, geyserJarPath);
    } else {
      try {
        if (onProgress) onProgress(50, "Téléchargement du pont Bedrock (GeyserMC)...");
        await this.downloadFile(this.geyserDownloadUrl, geyserJarPath, (pct) => {
          if (onProgress) onProgress(50 + Math.round(pct * 0.2), `Téléchargement GeyserMC: ${pct}%`);
        });
        if (fs.existsSync(geyserJarPath) && fs.statSync(geyserJarPath).size > 1000000) {
          try { fs.copyFileSync(geyserJarPath, cachedGeyser); } catch (_) {}
        }
      } catch (geyserErr) {
        console.warn(`[Crossplay] Impossible de télécharger Geyser: ${geyserErr.message}`);
      }
    }

    // 3. Télécharger Floodgate (authentification libre Bedrock)
    const floodgateJarPath = path.join(pluginsDir, 'floodgate-spigot.jar');
    if (fs.existsSync(cachedFloodgate) && fs.statSync(cachedFloodgate).size > 100000) {
      if (onProgress) onProgress(75, "Installation du système d'authentification console (Floodgate)...");
      fs.copyFileSync(cachedFloodgate, floodgateJarPath);
    } else {
      try {
        if (onProgress) onProgress(72, "Téléchargement du module d'authentification (Floodgate)...");
        await this.downloadFile(this.floodgateDownloadUrl, floodgateJarPath, (pct) => {
          if (onProgress) onProgress(72 + Math.round(pct * 0.15), `Téléchargement Floodgate: ${pct}%`);
        });
        if (fs.existsSync(floodgateJarPath) && fs.statSync(floodgateJarPath).size > 100000) {
          try { fs.copyFileSync(floodgateJarPath, cachedFloodgate); } catch (_) {}
        }
      } catch (fgErr) {
        console.warn(`[Crossplay] Impossible de télécharger Floodgate: ${fgErr.message}`);
      }
    }

    // 4. Configuration EULA
    if (onProgress) onProgress(88, "Configuration de l'EULA et des ports réseau...");
    fs.writeFileSync(path.join(targetDir, 'eula.txt'), 'eula=true\n', 'utf8');

    // 5. server.properties
    const isOffline = !!options.offline;
    const customSeed = (options.seed && options.seed.trim()) ? options.seed.trim() : '';
    const appDefaults = configService.getSettings();
    const serverProps = `# Minecraft Crossplay Server properties (Java + Bedrock)
server-port=25565
motd=Cubirium Crossplay ${effectiveVersion}
max-players=20
online-mode=${isOffline ? 'false' : 'true'}
level-seed=${customSeed}
enforce-secure-profile=false
difficulty=${appDefaults.defaultDifficulty || 'normal'}
gamemode=${appDefaults.defaultGamemode || 'survival'}
pvp=true
view-distance=${appDefaults.defaultViewDistance || 12}
simulation-distance=${appDefaults.defaultSimulationDistance || 4}
sync-chunk-writes=false
allow-flight=true
network-compression-threshold=512
white-list=false
`;
    fs.writeFileSync(path.join(targetDir, 'server.properties'), serverProps, 'utf8');

    // 6. run.sh et run.bat
    if (onProgress) onProgress(96, "Génération des scripts d'exécution multi-plateforme...");
    const reqMajor = effectiveVersion.startsWith('26.') || effectiveVersion.startsWith('25.') ? 25 : 21;
    const runScript = `#!/usr/bin/env sh
# Script de lancement automatique Crossplay (PaperMC + GeyserMC) pour ${cleanId}

JAVA_CUBIRIUM_25="$HOME/Library/Application Support/Cubirium/runtime/java-25/bin/java"
JAVA_CUBIRIUM_21="$HOME/Library/Application Support/Cubirium/runtime/java-21/bin/java"
JAVA_CUBIRIUM="$HOME/Library/Application Support/Cubirium/runtime/java-${reqMajor}/bin/java"

JAVA_BIN=""
if [ -n "$JAVA_EXEC" ] && [ -x "$JAVA_EXEC" ]; then
    JAVA_BIN="$JAVA_EXEC"
elif [ -n "$JAVA_BIN" ] && [ -x "$JAVA_BIN" ]; then
    JAVA_BIN="$JAVA_BIN"
elif [ -x "$JAVA_CUBIRIUM_25" ]; then
    JAVA_BIN="$JAVA_CUBIRIUM_25"
elif [ -x "$JAVA_CUBIRIUM_21" ]; then
    JAVA_BIN="$JAVA_CUBIRIUM_21"
elif [ -x "$JAVA_CUBIRIUM" ]; then
    JAVA_BIN="$JAVA_CUBIRIUM"
elif [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    JAVA_BIN="$JAVA_HOME/bin/java"
elif command -v java >/dev/null 2>&1; then
    JAVA_BIN="java"
else
    echo "Erreur: Aucun runtime Java ${reqMajor} valide trouvé sur le système."
    exit 1
fi

JAVA_VER_STR=$("$JAVA_BIN" -version 2>&1 | head -n 1)
echo "Lancement Crossplay (PaperMC MC ${effectiveVersion}) avec $JAVA_VER_STR"

exec "$JAVA_BIN" -Xms3G -Xmx6G \\
  -Djava.net.preferIPv4Stack=true \\
  -Djava.util.concurrent.ForkJoinPool.common.parallelism=6 \\
  -XX:+UnlockExperimentalVMOptions \\
  -XX:+UseG1GC \\
  -XX:+ParallelRefProcEnabled \\
  -XX:MaxGCPauseMillis=50 \\
  -XX:G1NewSizePercent=30 \\
  -XX:G1MaxNewSizePercent=40 \\
  -XX:G1ReservePercent=20 \\
  -XX:+DisableExplicitGC \\
  -jar server.jar nogui "$@"
`;
    fs.writeFileSync(path.join(targetDir, 'run.sh'), runScript, { mode: 0o755 });

    const runBatScript = `@echo off
rem Script de démarrage Crossplay PaperMC ${effectiveVersion}
cd /d "%~dp0"
set "JAVA_EXEC="
if defined JAVA_BIN if exist "%JAVA_BIN%" set "JAVA_EXEC=%JAVA_BIN%"
if not defined JAVA_EXEC if exist "%LOCALAPPDATA%\\Cubirium\\runtime\\java-25\\bin\\java.exe" set "JAVA_EXEC=%LOCALAPPDATA%\\Cubirium\\runtime\\java-25\\bin\\java.exe"
if not defined JAVA_EXEC if exist "%LOCALAPPDATA%\\Cubirium\\runtime\\java-21\\bin\\java.exe" set "JAVA_EXEC=%LOCALAPPDATA%\\Cubirium\\runtime\\java-21\\bin\\java.exe"
if not defined JAVA_EXEC if exist "%LOCALAPPDATA%\\Cubirium\\runtime\\java-${reqMajor}\\bin\\java.exe" set "JAVA_EXEC=%LOCALAPPDATA%\\Cubirium\\runtime\\java-${reqMajor}\\bin\\java.exe"
if not defined JAVA_EXEC if exist "%APPDATA%\\Cubirium\\runtime\\java-25\\bin\\java.exe" set "JAVA_EXEC=%APPDATA%\\Cubirium\\runtime\\java-25\\bin\\java.exe"
if not defined JAVA_EXEC if exist "%APPDATA%\\Cubirium\\runtime\\java-21\\bin\\java.exe" set "JAVA_EXEC=%APPDATA%\\Cubirium\\runtime\\java-21\\bin\\java.exe"
if not defined JAVA_EXEC if exist "%APPDATA%\\Cubirium\\runtime\\java-${reqMajor}\\bin\\java.exe" set "JAVA_EXEC=%APPDATA%\\Cubirium\\runtime\\java-${reqMajor}\\bin\\java.exe"
if not defined JAVA_EXEC if defined JAVA_HOME if exist "%JAVA_HOME%\\bin\\java.exe" set "JAVA_EXEC=%JAVA_HOME%\\bin\\java.exe"
if not defined JAVA_EXEC set "JAVA_EXEC=java"

"%JAVA_EXEC%" -Xms3G -Xmx6G -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -jar server.jar nogui %*
`;
    fs.writeFileSync(path.join(targetDir, 'run.bat'), runBatScript, 'utf8');

    if (onProgress) onProgress(100, `Serveur Crossplay ${cleanId} prêt !`);
    return {
      worldName: cleanId,
      version: effectiveVersion,
      type: 'Crossplay',
      path: targetDir,
      jar: serverJarPath
    };
  }
}

module.exports = new CrossplayInstallerService();

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// URLs directes de secours officielles Mojang pour les versions les plus courantes
const OFFICIAL_FALLBACK_URLS = {
  '26.3': 'https://piston-data.mojang.com/v1/objects/33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c/server.jar',
  '1.21.1': 'https://piston-data.mojang.com/v1/objects/450698d1863ab5180c13350526025e1dd24cb3e0/server.jar',
  '1.21': 'https://piston-data.mojang.com/v1/objects/e6252194605ec0793b5aeef0ef01a8b1be4b06b3/server.jar',
  '1.20.6': 'https://piston-data.mojang.com/v1/objects/145ff0858209bcfc164859ba735d4199aafa1eea/server.jar',
  '1.20.4': 'https://piston-data.mojang.com/v1/objects/8dd1a28015f51b1803213892b50b7b4fc76e594d/server.jar',
  '1.20.2': 'https://piston-data.mojang.com/v1/objects/5b868151bd42b4045553d70ded784e92a14b0f8d/server.jar',
  '1.20.1': 'https://piston-data.mojang.com/v1/objects/84194a5cce759e5d665deeab2421e10e85f1663b/server.jar',
  '1.19.4': 'https://piston-data.mojang.com/v1/objects/8f3112a10497510d647223b7b9148d423b497a5b/server.jar',
  '1.18.2': 'https://piston-data.mojang.com/v1/objects/c8f83c5655308435b3d30b96e1f92c0b83cc59cf/server.jar',
  '1.16.5': 'https://piston-data.mojang.com/v1/objects/1b557e7b033b583cd9f66746b7a9ab1ec1673ced/server.jar',
  '1.12.2': 'https://piston-data.mojang.com/v1/objects/886945bfb2b978778c3a0288fd7fab09d315b25f/server.jar',
  '1.8.9': 'https://launcher.mojang.com/v1/objects/b58b2ceb36e01bcd8dbf49c8fb66c55a9f0676cd/server.jar',
  '1.7.10': 'https://launcher.mojang.com/v1/objects/952438ac4e01b4d115c5fc38f891710c4941df29/server.jar'
};

class VanillaInstallerService {
  constructor() {
    this.manifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
    this.cachedVersions = null;
  }

  fetchJson(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(this.fetchJson(res.headers.location));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
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

      client.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(destPath);
          return resolve(this.downloadFile(res.headers.location, destPath, onProgress));
        }

        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0 && onProgress) {
            onProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close(() => resolve(destPath));
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });
    });
  }

  async getAvailableVersions() {
    try {
      const manifest = await this.fetchJson(this.manifestUrl);
      if (manifest && manifest.versions) {
        const latestRelease = manifest.latest?.release;
        const latestSnapshot = manifest.latest?.snapshot;

        // Récupérer toutes les versions officielles (releases) jusqu'à Minecraft 1.7.10 inclus
        const releases = manifest.versions.filter(v => v.type === 'release');
        const idx1710 = releases.findIndex(v => v.id === '1.7.10');
        const targetReleases = idx1710 !== -1 ? releases.slice(0, idx1710 + 1) : releases.slice(0, 80);

        const combinedMap = new Map();
        // Inclure le snapshot le plus récent en tête si pertinent
        if (latestSnapshot && !combinedMap.has(latestSnapshot)) {
          const snapObj = manifest.versions.find(v => v.id === latestSnapshot) || { id: latestSnapshot, releaseTime: new Date().toISOString() };
          combinedMap.set(latestSnapshot, snapObj);
        }
        // Ajouter snapshot 26.3 si présent
        const snap26 = manifest.versions.find(v => v.id === '26.3');
        if (snap26 && !combinedMap.has('26.3')) {
          combinedMap.set('26.3', snap26);
        }

        // Ajouter toutes les releases officielles couvertes (26.3 -> 1.7.10)
        for (const r of targetReleases) {
          if (!combinedMap.has(r.id)) combinedMap.set(r.id, r);
        }

        const rawList = Array.from(combinedMap.values());

        // Tri chronologique : version la plus récente en premier
        rawList.sort((a, b) => {
          const tA = a.releaseTime ? new Date(a.releaseTime).getTime() : 0;
          const tB = b.releaseTime ? new Date(b.releaseTime).getTime() : 0;
          return tB - tA;
        });

        const list = rawList.map((v, index) => {
          let reqJava = 21;
          if (v.id.startsWith('26.') || v.id.startsWith('25.') || v.id.startsWith('24w') || v.id.startsWith('25w') || v.id.startsWith('26w')) {
            reqJava = 25;
          } else if (v.id.startsWith('1.17')) {
            reqJava = 16;
          } else if (
            v.id.startsWith('1.16') || v.id.startsWith('1.15') || v.id.startsWith('1.14') ||
            v.id.startsWith('1.13') || v.id.startsWith('1.12') || v.id.startsWith('1.11') ||
            v.id.startsWith('1.10') || v.id.startsWith('1.9') || v.id.startsWith('1.8') ||
            v.id.startsWith('1.7')
          ) {
            reqJava = 8;
          }

          let tag = '';
          if (index === 0 || v.id === latestRelease) {
            tag = ' (Dernière version)';
          }
          if (reqJava === 25) {
            tag += ' - Java 25';
          } else if (reqJava === 8) {
            tag += ' - Java 8/17';
          } else if (reqJava === 21 && !tag) {
            tag = ' (Java 21)';
          }

          return {
            id: v.id,
            releaseTime: v.releaseTime,
            url: v.url,
            requiredJava: reqJava,
            isLatest: index === 0 || v.id === latestRelease,
            label: `${v.id}${tag}`
          };
        });

        this.cachedVersions = list;
        return this.cachedVersions;
      }
    } catch (e) {
      // En cas d'indisponibilité ou blocage réseau, utiliser les versions de repli
    }

    const fallbackList = Object.keys(OFFICIAL_FALLBACK_URLS).map((v, index) => {
      let reqJava = 21;
      if (v.startsWith('26.') || v.startsWith('25.')) reqJava = 25;
      else if (v.startsWith('1.16') || v.startsWith('1.12') || v.startsWith('1.8') || v.startsWith('1.7')) reqJava = 8;
      
      let tag = index === 0 ? ' (Dernière version)' : '';
      if (reqJava === 25) tag += ' - Java 25';
      else if (reqJava === 8) tag += ' - Java 8/17';

      return {
        id: v,
        releaseTime: 'Officiel',
        url: null,
        requiredJava: reqJava,
        isLatest: index === 0,
        label: `${v}${tag}`
      };
    });

    return fallbackList;
  }

  findLocalServerJar(version) {
    const cacheDir = path.join(__dirname, '..', 'cache', 'server-jars');
    // 1. Vérifier le cache local manager
    if (version) {
      const specificCached = path.join(cacheDir, `server-${version}.jar`);
      if (fs.existsSync(specificCached) && fs.statSync(specificCached).size > 1000000) {
        return specificCached;
      }
    }
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      for (const f of files) {
        if (f.endsWith('.jar')) {
          const p = path.join(cacheDir, f);
          if (fs.statSync(p).size > 1000000) return p;
        }
      }
    }

    // 2. Vérifier les mondes existants dans games/
    const gamesDir = path.resolve(__dirname, '..', '..', 'games');
    if (fs.existsSync(gamesDir)) {
      const dirs = fs.readdirSync(gamesDir);
      for (const d of dirs) {
        const potential = path.join(gamesDir, d, 'server.jar');
        if (fs.existsSync(potential)) {
          const stat = fs.statSync(potential);
          if (stat.size > 10000000) {
            return potential;
          }
        }
      }
    }

    return null;
  }

  async installVanillaServer(worldName, version, targetDir, onProgress, options = {}) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let downloadUrl = OFFICIAL_FALLBACK_URLS[version];

    if (!downloadUrl) {
      try {
        const versions = await this.getAvailableVersions();
        const found = versions.find(v => v.id === version);
        if (found && found.url) {
          const versionMeta = await this.fetchJson(found.url);
          if (versionMeta?.downloads?.server?.url) {
            downloadUrl = versionMeta.downloads.server.url;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    const serverJarPath = path.join(targetDir, 'server.jar');
    const cacheDir = path.join(__dirname, '..', 'cache', 'server-jars');
    const cachedJar = path.join(cacheDir, `server-${version}.jar`);

    // 1. Vérification si déjà en cache
    if (fs.existsSync(cachedJar) && fs.statSync(cachedJar).size > 10000000) {
      if (onProgress) onProgress(40, `Installation via le cache local (${version})...`);
      fs.copyFileSync(cachedJar, serverJarPath);
    } else {
      let downloadSuccess = false;

      // 2. Tenter le téléchargement réseau si URL disponible
      if (downloadUrl) {
        try {
          if (onProgress) onProgress(10, 'Téléchargement de server.jar en cours...');
          await this.downloadFile(downloadUrl, serverJarPath, (pct) => {
            if (onProgress) onProgress(10 + Math.round(pct * 0.7), `Téléchargement de server.jar (${pct}%)...`);
          });
          if (fs.existsSync(serverJarPath) && fs.statSync(serverJarPath).size > 1000000) {
            downloadSuccess = true;
            try {
              if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
              fs.copyFileSync(serverJarPath, cachedJar);
            } catch (ce) {}
          }
        } catch (netErr) {
          console.warn(`[VanillaInstaller] Téléchargement réseau échoué (${netErr.message}), bascule sur le cache/fallback local.`);
        }
      }

      // 3. Fallback sur un jar local existant si hors-ligne ou erreur DNS (ex: ENOTFOUND Mojang)
      if (!downloadSuccess) {
        const localJar = this.findLocalServerJar(version);
        if (localJar) {
          if (onProgress) onProgress(60, "Réseau indisponible : initialisation avec server.jar local...");
          fs.copyFileSync(localJar, serverJarPath);
          try {
            if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
            fs.copyFileSync(serverJarPath, cachedJar);
          } catch (ce) {}
        } else {
          throw new Error(`Impossible de télécharger server.jar (${version}) depuis Mojang (connexion réseau indisponible), et aucun fichier server.jar local n'a été trouvé. Veuillez vérifier votre connexion internet.`);
        }
      }
    }

    // 1. eula.txt
    if (onProgress) onProgress(85, "Configuration de l'EULA...");
    fs.writeFileSync(
      path.join(targetDir, 'eula.txt'),
      '# By changing the setting below to TRUE you are indicating your agreement to the Mojang EULA.\neula=true\n',
      'utf8'
    );

    // 2. server.properties
    if (onProgress) onProgress(90, 'Création des paramètres du serveur...');
    const isOffline = !!(options && options.offline);
    const customSeed = (options && options.seed) ? options.seed.trim() : '';
    const configService = require('./config-service');
    const appDefaults = configService.getSettings();
    const serverProps = `# Minecraft server properties
server-port=25565
motd=Serveur Minecraft Vanilla ${version}
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

    // 3. run.sh
    if (onProgress) onProgress(95, 'Génération du script de démarrage...');
    const runScript = `#!/usr/bin/env sh
# Script de lancement automatique Vanilla ${version}

JAVA_CUBIRIUM="$HOME/Library/Application Support/Cubirium/runtime/java-21/bin/java"
JAVA_25="/opt/homebrew/opt/openjdk@25/bin/java"
JAVA_21="/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home/bin/java"

# Recherche de la version Java adaptée
JAVA_BIN=""
if [ -x "$JAVA_CUBIRIUM" ]; then
    JAVA_BIN="$JAVA_CUBIRIUM"
elif [ -x "$JAVA_25" ]; then
    JAVA_BIN="$JAVA_25"
elif [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    JAVA_BIN="$JAVA_HOME/bin/java"
elif [ -x "$JAVA_21" ]; then
    JAVA_BIN="$JAVA_21"
elif command -v java >/dev/null 2>&1; then
    JAVA_BIN="java"
else
    echo "Erreur: Aucun runtime Java trouvé sur le système."
    exit 1
fi

JAVA_VER_STR=$("$JAVA_BIN" -version 2>&1 | head -n 1)
echo "Lancement Vanilla ${version} avec $JAVA_VER_STR"

# Avertissement si version 25+ demandée mais Java 21 exécuté
case "${version}" in
  26.*|25.*)
    if echo "$JAVA_VER_STR" | grep -q "21\."; then
      echo "⚠️ ATTENTION: Minecraft ${version} nécessite Java 25 (trouvé: Java 21)."
      echo "👉 Installez Java 25 via Homebrew: brew install openjdk@25"
      echo "Ou utilisez Minecraft 1.21.1 pleinement compatible avec votre Java 21 !"
    fi
    ;;
esac

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
    const runPath = path.join(targetDir, 'run.sh');
    fs.writeFileSync(runPath, runScript, { mode: 0o755 });

    // 4. run.bat pour Windows
    const isJava25 = version.startsWith('26.') || version.startsWith('25.');
    const runBatScript = `@echo off
rem Script de démarrage Vanilla ${version}
cd /d "%~dp0"
set "JAVA_EXEC="

rem Recherche prioritaire du runtime Cubirium ou Java système
for %%d in (
    "%LOCALAPPDATA%\\Cubirium\\runtime\\java-21\\bin\\java.exe"
    "%APPDATA%\\Cubirium\\runtime\\java-21\\bin\\java.exe"
    "%LOCALAPPDATA%\\Cubirium\\runtime\\java-25\\bin\\java.exe"
    "%LOCALAPPDATA%\\MinecraftServerManager\\runtime\\java-21\\bin\\java.exe"
    "%ProgramFiles%\\Eclipse Adoptium\\jdk-21*\\bin\\java.exe"
    "%ProgramFiles%\\Eclipse Adoptium\\jdk-25*\\bin\\java.exe"
    "%ProgramFiles%\\Microsoft\\jdk-21*\\bin\\java.exe"
    "%ProgramFiles%\\Java\\jdk-21*\\bin\\java.exe"
) do (
    if not defined JAVA_EXEC if exist "%%~d" set "JAVA_EXEC=%%~d"
)

if not defined JAVA_EXEC if defined JAVA_HOME if exist "%JAVA_HOME%\\bin\\java.exe" set "JAVA_EXEC=%JAVA_HOME%\\bin\\java.exe"
if not defined JAVA_EXEC set "JAVA_EXEC=java"

"%JAVA_EXEC%" -Xms3G -Xmx6G -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -jar server.jar nogui %*
`;
    fs.writeFileSync(path.join(targetDir, 'run.bat'), runBatScript, 'utf8');

    if (onProgress) onProgress(100, 'Installation Vanilla terminée avec succès !');
    return {
      worldName,
      version,
      path: targetDir,
      jar: serverJarPath
    };
  }
}

module.exports = new VanillaInstallerService();

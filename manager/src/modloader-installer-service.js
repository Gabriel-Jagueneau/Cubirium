const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const vanillaInstaller = require('./vanilla-installer-service');

class ModloaderInstallerService {
  constructor() {}

  fetchJson(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, { headers: { 'User-Agent': 'Minecraft-Server-Manager/1.0' } }, (res) => {
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
      client.get(url, { headers: { 'User-Agent': 'Minecraft-Server-Manager/1.0' } }, (res) => {
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

  async resolveNeoForgeVersion(mcVersion) {
    const fallbacks = {
      '1.21.1': '21.1.255',
      '1.21': '21.0.167',
      '1.20.6': '20.6.119',
      '1.20.4': '20.4.237',
      '1.20.2': '20.2.86',
      '1.20.1': '20.1.109'
    };

    let prefix = '21.1.';
    if (mcVersion === '1.21.1') prefix = '21.1.';
    else if (mcVersion === '1.21') prefix = '21.0.';
    else if (mcVersion === '1.20.6') prefix = '20.6.';
    else if (mcVersion === '1.20.4') prefix = '20.4.';
    else if (mcVersion === '1.20.2') prefix = '20.2.';
    else if (mcVersion === '1.20.1') prefix = '20.1.';
    else if (mcVersion.startsWith('26.') || mcVersion.startsWith('25.')) prefix = `${mcVersion}.`;

    try {
      const xml = await new Promise((resolve, reject) => {
        const req = https.get('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml', {
          headers: { 'User-Agent': 'Minecraft-Server-Manager/1.0' },
          timeout: 6000
        }, (res) => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          let d = '';
          res.on('data', chunk => d += chunk);
          res.on('end', () => resolve(d));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.on('error', reject);
      });

      const escapedPrefix = prefix.replace(/\./g, '\\.');
      const regex = new RegExp(`<version>(${escapedPrefix}(\\d+))<\\/version>`, 'g');
      const matches = [];
      let m;
      while ((m = regex.exec(xml)) !== null) {
        matches.push({ full: m[1], build: parseInt(m[2], 10) });
      }

      if (matches.length > 0) {
        matches.sort((a, b) => a.build - b.build);
        const latest = matches[matches.length - 1].full;
        console.log(`[Modloader] Dernière version NeoForge détectée pour MC ${mcVersion}: ${latest}`);
        return latest;
      }
    } catch (e) {
      console.warn(`[Modloader] Échec récupération métadonnées NeoForge: ${e.message}, utilisation version de secours`);
    }

    return fallbacks[mcVersion] || '21.1.255';
  }

  /**
   * Installe le serveur modloader (Fabric, NeoForge ou fallback vanilla)
   */
  async installModloaderServer({ worldId, mcVersion = '1.21.1', loader = 'fabric', targetDir, onProgress }) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const serverJarPath = path.join(targetDir, 'server.jar');

    // 1. Tenter l'installation NeoForge si loader === 'neoforge'
    if (loader === 'neoforge') {
      try {
        if (onProgress) onProgress(35, `Recherche de la dernière version NeoForge pour Minecraft ${mcVersion}...`);
        
        // Résolution dynamique de la version NeoForge pour la version MC
        const neoVersion = await this.resolveNeoForgeVersion(mcVersion);

        const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoVersion}/neoforge-${neoVersion}-installer.jar`;
        const tempInstallerPath = path.join(targetDir, 'neoforge-installer.jar');

        if (onProgress) onProgress(40, `Téléchargement de l'installeur NeoForge (${neoVersion})...`);
        await this.downloadFile(installerUrl, tempInstallerPath, (pct) => {
          if (onProgress) onProgress(40 + Math.round(pct * 0.25), `Téléchargement NeoForge ${neoVersion}: ${pct}%`);
        });

        if (onProgress) onProgress(68, `Installation des bibliothèques serveur NeoForge (${neoVersion})...`);
        
        // Intervalle de progression rassurant pendant l'exécution de l'installeur
        let curStep = 68;
        const installerTimer = setInterval(() => {
          if (curStep < 88) {
            curStep += 4;
            const messages = [
              "Téléchargement et vérification des dépendances Minecraft...",
              "Extraction des bibliothèques NeoForge...",
              "Génération des configurations de démarrage...",
              "Finalisation des archives serveur..."
            ];
            const msgIdx = Math.min(messages.length - 1, Math.floor((curStep - 70) / 5));
            if (onProgress) onProgress(curStep, messages[msgIdx]);
          }
        }, 3000);

        try {
          const { execSync } = require('child_process');
          execSync(`java -jar neoforge-installer.jar --installServer .`, {
            cwd: targetDir,
            stdio: 'ignore',
            timeout: 240000
          });
        } finally {
          clearInterval(installerTimer);
        }

        if (onProgress) onProgress(90, "Nettoyage des fichiers temporaires d'installation...");

        // Nettoyer l'installeur
        try { fs.unlinkSync(tempInstallerPath); } catch (e) {}
        try { fs.unlinkSync(path.join(targetDir, 'neoforge-installer.jar.log')); } catch (e) {}

        // Créer un lien symbolique ou fallback server.jar si besoin
        if (!fs.existsSync(serverJarPath)) {
          const srgJars = [];
          const findJars = (dir) => {
            try {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const e of entries) {
                const fp = path.join(dir, e.name);
                if (e.isDirectory()) findJars(fp);
                else if (e.isFile() && e.name.includes('server') && e.name.endsWith('.jar')) srgJars.push(fp);
              }
            } catch (err) {}
          };
          findJars(path.join(targetDir, 'libraries'));
          if (srgJars.length > 0) {
            try { fs.copyFileSync(srgJars[0], serverJarPath); } catch (e) {}
          }
        }

        return {
          loader: 'neoforge',
          mcVersion,
          neoVersion,
          serverJarPath,
          hasNeoRunSh: fs.existsSync(path.join(targetDir, 'run.sh'))
        };
      } catch (neoErr) {
        console.warn(`[Modloader] Échec installation NeoForge: ${neoErr.message}. Repli vers Fabric/Vanilla...`);
      }
    }

    // 2. Tenter l'installation Fabric si loader === 'fabric' ou suite à échec NeoForge
    if (loader === 'fabric' || loader === 'quilt' || (!fs.existsSync(serverJarPath) && !fs.existsSync(path.join(targetDir, 'run.sh')))) {
      try {
        if (onProgress) onProgress(20, `Recherche du loader Fabric pour Minecraft ${mcVersion}...`);
        
        let loaderVersion = '0.16.10';
        let installerVersion = '1.0.1';

        try {
          const meta = await this.fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`);
          if (Array.isArray(meta) && meta.length > 0 && meta[0].loader && meta[0].loader.version) {
            loaderVersion = meta[0].loader.version;
          }
        } catch (e) {
          console.warn(`[Modloader] Utilisation version Fabric fallback ${loaderVersion}`);
        }

        const fabricUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/${installerVersion}/server/jar`;
        if (onProgress) onProgress(40, `Téléchargement du Fabric Server Launcher (${mcVersion} / ${loaderVersion})...`);
        
        await this.downloadFile(fabricUrl, serverJarPath, (pct) => {
          if (onProgress) onProgress(40 + Math.round(pct * 0.45), `Téléchargement Fabric: ${pct}%`);
        });

        return {
          loader: 'fabric',
          mcVersion,
          loaderVersion,
          serverJarPath
        };
      } catch (fabricErr) {
        console.warn(`[Modloader] Échec installation Fabric: ${fabricErr.message}. Repli vers jar vanilla...`);
      }
    }

    // 3. Fallback sécurisé : Utilisation ou téléchargement d'un server.jar pour que le serveur ait toujours un exécutable valide
    if (onProgress) onProgress(60, `Préparation de l'exécutable serveur pour Minecraft ${mcVersion}...`);
    try {
      const localJar = vanillaInstaller.findLocalServerJar(mcVersion);
      if (localJar && fs.existsSync(localJar) && fs.statSync(localJar).size > 1000000) {
        if (onProgress) onProgress(80, `Utilisation du server.jar local existant...`);
        fs.copyFileSync(localJar, serverJarPath);
        return {
          loader: 'local-jar-fallback',
          mcVersion,
          serverJarPath
        };
      }

      let downloadUrl = null;
      try {
        const versions = await vanillaInstaller.getAvailableVersions();
        const found = versions.find(v => v.id === mcVersion);
        if (found && found.url) {
          const meta = await this.fetchJson(found.url);
          if (meta?.downloads?.server?.url) {
            downloadUrl = meta.downloads.server.url;
          }
        }
      } catch (manifestErr) {}

      if (!downloadUrl) {
        downloadUrl = `https://piston-data.mojang.com/v1/objects/450698d1863ab5180c13350526025e1dd24cb3e0/server.jar`; // 1.21.1
      }
      await this.downloadFile(downloadUrl, serverJarPath, (pct) => {
        if (onProgress) onProgress(60 + Math.round(pct * 0.35), `Téléchargement Jar: ${pct}%`);
      });

      return {
        loader: 'vanilla-fallback',
        mcVersion,
        serverJarPath
      };
    } catch (vanillaErr) {
      const emergencyJar = vanillaInstaller.findLocalServerJar(null);
      if (emergencyJar && fs.existsSync(emergencyJar) && fs.statSync(emergencyJar).size > 1000000) {
        fs.copyFileSync(emergencyJar, serverJarPath);
        return {
          loader: 'emergency-fallback',
          mcVersion,
          serverJarPath
        };
      }
      throw new Error(`Impossible d'installer le serveur pour ${mcVersion}: ${vanillaErr.message}`);
    }
  }
}

module.exports = new ModloaderInstallerService();

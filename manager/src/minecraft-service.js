const { spawn, exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const tunnelService = require('./tunnel-service');
const modFilterService = require('./mod-filter-service');
const vanillaInstaller = require('./vanilla-installer-service');
const modloaderInstaller = require('./modloader-installer-service');
const configService = require('./config-service');

/**
 * Calcul récursif de la taille d'un dossier en octets (100% natif Node.js, garanti sans 'du' sur Windows)
 */
function getDirectorySizeBytes(dirPath) {
  let total = 0;
  if (!dirPath || !fs.existsSync(dirPath)) return 0;
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return stat.size;
    }
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          total += getDirectorySizeBytes(fullPath);
        } else if (entry.isFile()) {
          total += fs.statSync(fullPath).size;
        }
      } catch (_) {}
    }
  } catch (_) {}
  return total;
}

function formatBytesToFrench(bytes) {
  if (!bytes || bytes <= 0) return '0 Mo';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

function computeDirectorySizeFormatted(targetDir) {
  if (!targetDir || !fs.existsSync(targetDir)) return '0 Mo';
  if (process.platform !== 'win32') {
    try {
      const du = execSync(`du -sk "${targetDir}" 2>/dev/null`, { timeout: 2500 }).toString().trim();
      const kb = parseInt(du.split(/\s+/)[0], 10);
      if (!isNaN(kb) && kb >= 0) {
        return formatBytesToFrench(kb * 1024);
      }
    } catch (_) {}
  }
  const bytes = getDirectorySizeBytes(targetDir);
  return formatBytesToFrench(bytes);
}

function formatWorldSizeFrench(raw) {
  if (!raw || raw === 'N/A') return '0 Mo';
  let str = String(raw).trim();
  str = str.replace(/([0-9.,]+)\s*([M|m])(?:B|iB|b)?$/i, '$1 Mo');
  str = str.replace(/([0-9.,]+)\s*([G|g])(?:B|iB|b)?$/i, '$1 Go');
  str = str.replace(/([0-9.,]+)\s*([T|t])(?:B|iB|b)?$/i, '$1 To');
  str = str.replace(/([0-9.,]+)\s*([K|k])(?:B|iB|b)?$/i, '$1 Ko');
  str = str.replace(/([0-9.,]+)\s*B$/i, '$1 o');
  return str;
}

function revealFileInOs(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return;
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  if (isWin) {
    try {
      const stat = fs.statSync(targetPath);
      if (stat.isFile()) {
        execSync(`explorer.exe /select,"${targetPath.replace(/\//g, '\\')}"`, { stdio: 'ignore' });
      } else {
        execSync(`explorer.exe "${targetPath.replace(/\//g, '\\')}"`, { stdio: 'ignore' });
      }
    } catch (_) {}
  } else if (isMac) {
    try {
      execSync(`osascript -e 'tell application "Finder" to reveal POSIX file "${targetPath.replace(/"/g, '\\"')}"' -e 'tell application "Finder" to activate' 2>/dev/null`);
    } catch (_) {
      try { execSync(`open -R "${targetPath}" 2>/dev/null`); } catch (_) {}
    }
  } else {
    try { execSync(`xdg-open "${targetPath}" 2>/dev/null`); } catch (_) {}
  }
}

class MinecraftService {
  constructor() {
    const isWin = process.platform === 'win32';
    const legacyAppSupportDir = isWin
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'MinecraftServerManager')
      : path.join(os.homedir(), 'Library/Application Support/MinecraftServerManager');
    const legacyAppSupportGames = path.join(legacyAppSupportDir, 'games');

    const appSupportDir = isWin
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Cubirium')
      : path.join(os.homedir(), 'Library/Application Support/Cubirium');
    const appSupportGames = path.join(appSupportDir, 'games');
    const devGames = path.resolve(__dirname, '../../games');

    // Migration automatique et transparente des mondes existants
    if (!fs.existsSync(appSupportGames) && fs.existsSync(legacyAppSupportGames)) {
      try {
        fs.mkdirSync(appSupportDir, { recursive: true });
        try {
          fs.renameSync(legacyAppSupportGames, appSupportGames);
        } catch (_) {
          fs.cpSync(legacyAppSupportGames, appSupportGames, { recursive: true });
        }
      } catch (e) {
        console.warn('[Cubirium] Erreur migration des mondes:', e.message);
      }
    }

    if (process.env.GAMES_DIR) {
      this.gamesDir = path.resolve(process.env.GAMES_DIR);
    } else if (fs.existsSync(appSupportGames) || __dirname.includes('.app/Contents') || isWin) {
      this.gamesDir = appSupportGames;
    } else if (fs.existsSync(devGames)) {
      this.gamesDir = devGames;
    } else if (fs.existsSync(legacyAppSupportGames)) {
      this.gamesDir = legacyAppSupportGames;
    } else {
      this.gamesDir = appSupportGames;
    }
    if (!fs.existsSync(this.gamesDir)) {
      fs.mkdirSync(this.gamesDir, { recursive: true });
    }

    this.activeWorld = null;
    this.activeProcess = null;
    this.status = 'STOPPED'; // 'STOPPED', 'STARTING', 'RUNNING', 'STOPPING'
    this.startTime = null;
    this.sessionStartRuntime = 0;
    this.runtimeSaveInterval = null;
    this.logsBuffer = [];
    this.worldLogs = {}; // Map of worldId -> array of log strings
    this.listeners = new Set();
    this.players = [];
    this.pendingExportDownloads = new Map();
    this.detectedVersion = null;
    this.serverSyncInterval = null;
    this._isJava25Installing = false;
    this.worldHealth = {}; // worldId -> { status: 'healthy' | 'needs_repair' | 'corrupted', reason: string, lastCrashAt: number }
    this.worldLaunchTimes = {}; // worldId -> timestamp
    this.isDownloadingJava = false;
    this.javaDownloadStep = '';

    // Vérification et pré-chargement silencieux de Java 21 en arrière-plan
    this.checkJavaInBackground();
  }

  /**
   * Vérifie si la version de Minecraft utilise la syntaxe moderne en snake_case pour les gamerules (>= 1.21.11, 26.x, etc.)
   */
  isModernGamerules(versionStr) {
    if (!versionStr) return true;
    const s = String(versionStr).trim().toLowerCase();
    if (s.startsWith('26') || s.startsWith('25') || s.startsWith('24w') || s.startsWith('25w') || s.startsWith('26w')) {
      return true;
    }
    const match = s.match(/1\.(\d+)(?:\.(\d+))?/);
    if (match) {
      const minor = parseInt(match[1], 10);
      const patch = parseInt(match[2] || '0', 10);
      if (minor > 21) return true;
      if (minor === 21 && patch >= 11) return true;
      return false;
    }
    return true;
  }

  /**
   * Tente d'extraire la version du serveur configurée dans run.sh, run.bat, server.properties ou versions/
   */
  getWorldVersion(worldId) {
    if (!worldId) return null;
    const worldPath = path.join(this.gamesDir, worldId);
    const runSh = path.join(worldPath, 'run.sh');
    const runBat = path.join(worldPath, 'run.bat');
    const props = path.join(worldPath, 'server.properties');

    for (const f of [runSh, runBat, props]) {
      if (fs.existsSync(f)) {
        try {
          const content = fs.readFileSync(f, 'utf8');
          const m = content.match(/Vanilla\s+([0-9.]+)|MC\s+([0-9.]+)|Minecraft\s+([0-9.]+)/i);
          if (m) return m[1] || m[2] || m[3];
        } catch (e) {}
      }
    }

    // Vérifier le dossier versions/ si existant
    const verDir = path.join(worldPath, 'versions');
    if (fs.existsSync(verDir)) {
      try {
        const sub = fs.readdirSync(verDir).find(d => !d.startsWith('.'));
        if (sub) return sub;
      } catch (_) {}
    }

    return null;
  }

  /**
   * Vérifie si un exécutable Java est réellement opérationnel sur le système
   */
  isJavaRunnable(binPath) {
    if (!binPath) return false;
    try {
      const { spawnSync } = require('child_process');
      const res = spawnSync(binPath, ['-version'], { timeout: 3500, stdio: 'pipe' });
      return res.status === 0;
    } catch (_) {
      return false;
    }
  }

  /**
   * Détection robuste et multi-plateforme du binaire Java et de JAVA_HOME adaptés au monde
   */
  findJavaExecutable(worldId = null, checkContent = '') {
    const isWin = process.platform === 'win32';
    const version = (this.getWorldVersion(worldId) || '').trim();
    const content = String(checkContent || '');

    // Déterminer la version de Java requise selon la version Minecraft du monde
    const isJava25 = version.startsWith('26.') || version.startsWith('25.') ||
                     version.startsWith('24w') || version.startsWith('25w') || version.startsWith('26w') ||
                     /(?:MC|Minecraft|Vanilla)\s*2[56]\./i.test(content);
    const isJava8 = version.startsWith('1.7') || version.startsWith('1.8') || version.startsWith('1.9') ||
                    version.startsWith('1.10') || version.startsWith('1.11') || version.startsWith('1.12') ||
                    version.startsWith('1.13') || version.startsWith('1.14') || version.startsWith('1.15') ||
                    version.startsWith('1.16');

    const candidates = [];

    // Priorité Java 8 pour les versions 1.7.10 à 1.16.5 si présent
    if (isJava8) {
      if (isWin) {
        const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
        candidates.push(path.join(pf, 'Java', 'jre1.8.0', 'bin', 'java.exe'));
        candidates.push(path.join(pf, 'Java', 'jre8', 'bin', 'java.exe'));
        candidates.push(path.join(pf, 'Eclipse Adoptium', 'jdk-8', 'bin', 'java.exe'));
      } else {
        candidates.push('/Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home/bin/java');
        candidates.push('/Library/Java/JavaVirtualMachines/jdk1.8.0.jdk/Contents/Home/bin/java');
        candidates.push('/Library/Java/JavaVirtualMachines/zulu-8.jdk/Contents/Home/bin/java');
        candidates.push('/Library/Java/JavaVirtualMachines/temurin-8.jdk/Contents/Home/bin/java');
      }
    }

    // 0. Dossiers de runtime locaux de Cubirium
    const appSupportDir = isWin
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Cubirium')
      : path.join(os.homedir(), 'Library/Application Support/Cubirium');
    const legacyAppSupportDir = isWin
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'MinecraftServerManager')
      : path.join(os.homedir(), 'Library/Application Support/MinecraftServerManager');

    const localRuntimeDirs = [
      path.join(appSupportDir, 'runtime', 'java-21'),
      path.join(appSupportDir, 'runtime', 'java-25'),
      path.join(this.gamesDir, '..', 'runtime', 'java-21'),
      path.join(this.gamesDir, '..', 'runtime', 'java-25'),
      path.join(legacyAppSupportDir, 'runtime', 'java-21'),
      path.join(legacyAppSupportDir, 'runtime', 'java-25'),
      isWin ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'Cubirium', 'runtime', 'java-21') : null,
      isWin ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'Cubirium', 'runtime', 'java-25') : null
    ].filter(Boolean);

    for (const rDir of localRuntimeDirs) {
      if (fs.existsSync(rDir)) {
        const jBin = isWin ? path.join(rDir, 'bin', 'java.exe') : path.join(rDir, 'bin', 'java');
        if (fs.existsSync(jBin)) candidates.push(jBin);
        const macJBin = path.join(rDir, 'Contents', 'Home', 'bin', 'java');
        if (fs.existsSync(macJBin)) candidates.push(macJBin);
      }
    }

    if (isWin) {
      // Chemins d'installation officiels de JDKs sous Windows
      const programFiles = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], 'C:\\Program Files', 'C:\\Program Files (x86)'].filter(Boolean);
      const vendorJdks = [];

      for (const pf of programFiles) {
        for (const vendor of ['Eclipse Adoptium', 'Microsoft', 'Java', 'BellSoft', 'Zulu', 'Semeru']) {
          const vDir = path.join(pf, vendor);
          if (fs.existsSync(vDir)) {
            try {
              const entries = fs.readdirSync(vDir);
              for (const e of entries) {
                const jExe = path.join(vDir, e, 'bin', 'java.exe');
                if (fs.existsSync(jExe)) {
                  vendorJdks.push(jExe);
                }
              }
            } catch (_) {}
          }
        }
      }

      // Prioriser la version requise
      if (isJava25) {
        const j25List = vendorJdks.filter(p => /25|java-25|jdk-25|temurin-25/i.test(p));
        const otherList = vendorJdks.filter(p => !/25|java-25|jdk-25|temurin-25/i.test(p));
        candidates.push(...j25List, ...otherList);
      } else if (isJava8) {
        const j8List = vendorJdks.filter(p => /1\.8|java-8|jdk-8|jre-8|jre1\.8/i.test(p));
        const otherList = vendorJdks.filter(p => !/1\.8|java-8|jdk-8|jre-8|jre1\.8/i.test(p));
        candidates.push(...j8List, ...otherList);
      } else {
        const j21List = vendorJdks.filter(p => /21|java-21|jdk-21|temurin-21/i.test(p));
        const otherList = vendorJdks.filter(p => !/21|java-21|jdk-21|temurin-21/i.test(p));
        candidates.push(...j21List, ...otherList);
      }

      if (process.env.JAVA_HOME) {
        candidates.push(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'));
      }

      candidates.push('java.exe');
      candidates.push('java');
    } else {
      // macOS / Linux
      const macJdkRoot = '/Library/Java/JavaVirtualMachines';

      if (isJava25) {
        candidates.push('/opt/homebrew/opt/openjdk@25/bin/java');
        candidates.push('/usr/local/opt/openjdk@25/bin/java');
      }

      if (isJava8) {
        candidates.push('/Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home/bin/java');
      }

      candidates.push('/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home/bin/java');
      candidates.push('/opt/homebrew/opt/openjdk@21/bin/java');
      candidates.push('/usr/local/opt/openjdk@21/bin/java');

      if (!isJava25) {
        candidates.push('/opt/homebrew/opt/openjdk@25/bin/java');
        candidates.push('/usr/local/opt/openjdk@25/bin/java');
      }

      // Parcourir /Library/Java/JavaVirtualMachines
      if (fs.existsSync(macJdkRoot)) {
        try {
          const jvms = fs.readdirSync(macJdkRoot);
          for (const jvm of jvms) {
            const jBin = path.join(macJdkRoot, jvm, 'Contents/Home/bin/java');
            if (fs.existsSync(jBin)) candidates.push(jBin);
          }
        } catch (_) {}
      }

      if (process.env.JAVA_HOME) {
        candidates.push(path.join(process.env.JAVA_HOME, 'bin', 'java'));
      }

      candidates.push('/usr/bin/java');
      candidates.push('java');
    }

    let foundExec = null;
    let foundJavaHome = '';

    for (const cand of candidates) {
      if (cand === 'java' || cand === 'java.exe') {
        if (!foundExec && this.isJavaRunnable(cand)) {
          foundExec = cand;
        }
        continue;
      }
      if (fs.existsSync(cand) && this.isJavaRunnable(cand)) {
        foundExec = cand;
        const binDir = path.dirname(cand);
        if (path.basename(binDir).toLowerCase() === 'bin') {
          foundJavaHome = path.dirname(binDir);
        }
        break;
      }
    }

    return {
      execFile: foundExec,
      javaHome: foundJavaHome || process.env.JAVA_HOME || '',
      isWorking: Boolean(foundExec)
    };
  }

  /**
   * S'assure que Java est fonctionnel avant de démarrer un monde.
   * Si aucun Java opérationnel n'est présent, installe automatiquement Temurin JRE 21.
   */
  async ensureJavaReady(worldId = null, checkContent = '') {
    let javaInfo = this.findJavaExecutable(worldId, checkContent);
    if (javaInfo.isWorking && javaInfo.execFile) {
      return javaInfo;
    }

    this.isDownloadingJava = true;
    this.javaDownloadStep = 'Téléchargement de Java 21...';
    this.broadcast('status', this.getState());

    this.appendLog('[Système] Java n\'a pas été détecté sur cet ordinateur.', worldId);
    this.appendLog('[Système] Téléchargement automatique de Java 21 LTS (Adoptium Temurin) en cours...', worldId);

    try {
      const installed = await this.downloadAndSetupJava21((step) => {
        this.javaDownloadStep = step;
        this.broadcast('status', this.getState());
        this.appendLog(`[Système] ${step}`, worldId);
      });
      this.isDownloadingJava = false;
      this.javaDownloadStep = '';
      this.broadcast('status', this.getState());
      this.appendLog('[Système] Java 21 a été installé et configuré avec succès !', worldId);
      return {
        execFile: installed.execFile,
        javaHome: installed.javaHome,
        isWorking: true
      };
    } catch (err) {
      this.isDownloadingJava = false;
      this.javaDownloadStep = '';
      this.broadcast('status', this.getState());
      this.appendLog(`[Système] Échec de l'auto-installation de Java 21: ${err.message}`, worldId);
      throw new Error(`Java n'est pas installé et le téléchargement automatique a échoué: ${err.message}`);
    }
  }

  /**
   * Vérification et téléchargement en tâche de fond au démarrage de l'appli si Java manque
   */
  checkJavaInBackground() {
    setTimeout(async () => {
      try {
        const javaInfo = this.findJavaExecutable();
        if (!javaInfo.isWorking) {
          console.log('[Cubirium] Aucun Java détecté, pré-installation de Java 21 en arrière-plan...');
          await this.downloadAndSetupJava21();
          console.log('[Cubirium] Java 21 pré-installé avec succès dans le runtime.');
        }
      } catch (e) {
        console.warn('[Cubirium] Note: Pré-téléchargement Java en arrière-plan:', e.message);
      }
    }, 2000);
  }

  /**
   * Télécharge et extrait Eclipse Temurin JRE 21 portable dans le dossier runtime de Cubirium
   */
  async downloadAndSetupJava21(onProgress = null) {
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const arch = os.arch();

    const appSupportDir = isWin
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Cubirium')
      : path.join(os.homedir(), 'Library/Application Support/Cubirium');
    const runtimeBase = path.join(appSupportDir, 'runtime');
    const targetJavaDir = path.join(runtimeBase, 'java-21');
    const tempDir = path.join(runtimeBase, 'temp-java-download');

    if (!fs.existsSync(runtimeBase)) {
      fs.mkdirSync(runtimeBase, { recursive: true });
    }
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const osParam = isWin ? 'windows' : (isMac ? 'mac' : 'linux');
    const archParam = (arch === 'arm64' || arch === 'aarch64') ? 'aarch64' : 'x64';
    const downloadUrl = `https://api.adoptium.net/v3/binary/latest/21/ga/${osParam}/${archParam}/jre/hotspot/normal/eclipse`;

    const archiveExt = isWin ? '.zip' : '.tar.gz';
    const archivePath = path.join(tempDir, `java21${archiveExt}`);
    const extractDir = path.join(tempDir, 'extracted');

    try {
      if (typeof onProgress === 'function') onProgress('Téléchargement de Java 21 LTS...');
      await this._downloadHttpFile(downloadUrl, archivePath);

      if (typeof onProgress === 'function') onProgress('Extraction du runtime Java 21...');
      if (fs.existsSync(extractDir)) {
        try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) {}
      }
      fs.mkdirSync(extractDir, { recursive: true });

      if (isWin) {
        try {
          execSync(`tar -xf "${archivePath}" -C "${extractDir}"`, { stdio: 'ignore' });
        } catch (_) {
          execSync(`powershell -NoProfile -NonInteractive -Command "Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'ignore' });
        }
      } else {
        execSync(`tar -xzf "${archivePath}" -C "${extractDir}"`, { stdio: 'ignore' });
      }

      let foundHome = null;
      const findJavaDir = (current) => {
        if (foundHome) return;
        const binCandidate = path.join(current, 'bin', isWin ? 'java.exe' : 'java');
        const macHomeCandidate = path.join(current, 'Contents', 'Home');
        if (fs.existsSync(binCandidate)) {
          foundHome = current;
          return;
        }
        if (fs.existsSync(path.join(macHomeCandidate, 'bin', 'java'))) {
          foundHome = macHomeCandidate;
          return;
        }
        try {
          const subs = fs.readdirSync(current, { withFileTypes: true });
          for (const s of subs) {
            if (s.isDirectory()) findJavaDir(path.join(current, s.name));
          }
        } catch (_) {}
      };
      findJavaDir(extractDir);

      if (!foundHome) {
        throw new Error('Runtime Java extrait non détecté');
      }

      if (typeof onProgress === 'function') onProgress('Configuration finale de Java 21...');
      if (fs.existsSync(targetJavaDir)) {
        try { fs.rmSync(targetJavaDir, { recursive: true, force: true }); } catch (_) {}
      }
      fs.mkdirSync(targetJavaDir, { recursive: true });

      fs.cpSync(foundHome, targetJavaDir, { recursive: true });

      if (!isWin) {
        const jBin = path.join(targetJavaDir, 'bin', 'java');
        if (fs.existsSync(jBin)) {
          try { fs.chmodSync(jBin, 0o755); } catch (_) {}
        }
      }

      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}

      const finalBin = isWin
        ? path.join(targetJavaDir, 'bin', 'java.exe')
        : path.join(targetJavaDir, 'bin', 'java');

      return {
        execFile: finalBin,
        javaHome: targetJavaDir
      };
    } catch (err) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
      throw err;
    }
  }

  _downloadHttpFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const https = require('https');
      const http = require('http');

      const getUrl = (currentUrl, depth = 0) => {
        if (depth > 10) return reject(new Error('Trop de redirections'));
        const client = currentUrl.startsWith('https://') ? https : http;
        const req = client.get(currentUrl, {
          headers: { 'User-Agent': 'Cubirium/1.1.1' }
        }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return getUrl(res.headers.location, depth + 1);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Code de statut HTTP : ${res.statusCode}`));
          }
          const file = fs.createWriteStream(destPath);
          res.pipe(file);
          file.on('finish', () => {
            file.close(() => resolve(destPath));
          });
          file.on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        });
        req.on('error', reject);
      };
      getUrl(url);
    });
  }

  /**
   * Récupère les infos de runtime persistant et dernier allumage d'un monde
   */
  getWorldRuntimeInfo(worldId) {
    if (!worldId) return { totalRuntime: 0, lastStartedAt: 0 };
    const dotMetaPath = path.join(this.gamesDir, worldId, '.runtime.json');
    const plainMetaPath = path.join(this.gamesDir, worldId, 'runtime.json');
    let totalRuntime = 0;
    let lastStartedAt = 0;

    const fileToRead = fs.existsSync(plainMetaPath) ? plainMetaPath : (fs.existsSync(dotMetaPath) ? dotMetaPath : null);
    if (fileToRead) {
      try {
        const data = JSON.parse(fs.readFileSync(fileToRead, 'utf8'));
        if (typeof data.totalRuntime === 'number') {
          totalRuntime = Math.max(0, Math.floor(data.totalRuntime));
        }
        if (typeof data.lastStartedAt === 'number') {
          lastStartedAt = data.lastStartedAt;
        }
      } catch (e) {}
    }

    // Si pas de métadonnée enregistrée pour le runtime, initialiser depuis Time dans level.dat (20 ticks/sec)
    if (totalRuntime === 0) {
      const worldDataFolder = this.getWorldDataFolder(path.join(this.gamesDir, worldId));
      const levelDatPath = path.join(worldDataFolder, 'level.dat');
      if (fs.existsSync(levelDatPath)) {
        try {
          const zlib = require('zlib');
          const buf = zlib.gunzipSync(fs.readFileSync(levelDatPath));
          const timeMarker = Buffer.from([0x04, 0x00, 0x04, 0x54, 0x69, 0x6d, 0x65]); // TAG_Long Time
          const idx = buf.indexOf(timeMarker);
          if (idx !== -1 && idx + timeMarker.length + 8 <= buf.length) {
            const ticks = Number(buf.readBigInt64BE(idx + timeMarker.length));
            if (ticks > 0) {
              totalRuntime = Math.floor(ticks / 20);
              this.saveWorldRuntime(worldId, totalRuntime);
            }
          }
        } catch (e) {}
      }
    }

    // Si aucun lastStartedAt connu, fallback sur mtime du log ou du dossier
    if (!lastStartedAt) {
      const logFile = path.join(this.gamesDir, worldId, 'logs', 'latest.log');
      if (fs.existsSync(logFile)) {
        try { lastStartedAt = fs.statSync(logFile).mtimeMs; } catch (_) {}
      } else {
        const worldDir = path.join(this.gamesDir, worldId);
        if (fs.existsSync(worldDir)) {
          try { lastStartedAt = fs.statSync(worldDir).mtimeMs; } catch (_) {}
        }
      }
    }

    return { totalRuntime, lastStartedAt: lastStartedAt || 0 };
  }

  /**
   * Récupère le runtime cumulé persistant d'un monde (en secondes)
   */
  getWorldRuntime(worldId) {
    return this.getWorldRuntimeInfo(worldId).totalRuntime;
  }

  /**
   * Sauvegarde le runtime cumulé d'un monde (en secondes) et préserve ou met à jour lastStartedAt
   */
  saveWorldRuntime(worldId, totalSeconds, newLastStartedAt = null) {
    if (!worldId) return;
    try {
      const dotMetaPath = path.join(this.gamesDir, worldId, '.runtime.json');
      const plainMetaPath = path.join(this.gamesDir, worldId, 'runtime.json');
      let currentData = {};
      const fileToRead = fs.existsSync(plainMetaPath) ? plainMetaPath : (fs.existsSync(dotMetaPath) ? dotMetaPath : null);
      if (fileToRead) {
        try { currentData = JSON.parse(fs.readFileSync(fileToRead, 'utf8')); } catch (_) {}
      }
      const lastStartedAt = (newLastStartedAt !== null)
        ? newLastStartedAt
        : (currentData.lastStartedAt || 0);

      const payload = JSON.stringify({
        totalRuntime: Math.max(0, Math.floor(totalSeconds)),
        lastStartedAt,
        updatedAt: Date.now()
      }, null, 2);

      fs.writeFileSync(dotMetaPath, payload, 'utf8');
      fs.writeFileSync(plainMetaPath, payload, 'utf8');
    } catch (e) {}
  }

  addListener(fn) {
    this.listeners.add(fn);
  }

  removeListener(fn) {
    this.listeners.delete(fn);
  }

  broadcast(type, data) {
    for (const listener of this.listeners) {
      try {
        listener({ type, data, timestamp: Date.now() });
      } catch (e) {
        // ignore
      }
    }
  }

  appendLog(line, targetWorldId = null) {
    if (!line) return;
    let trimmed = String(line).trimEnd();
    if (!trimmed) return;

    // Nettoyage immédiat des séquences d'échappement ANSI pour un affichage web impeccable
    trimmed = trimmed.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    if (!trimmed.trim()) return;

    const wid = targetWorldId || this.activeWorld;
    const cleanLine = trimmed;

    // 1. Capture de la version du serveur Minecraft depuis les logs de démarrage
    const verMatch = cleanLine.match(/Starting minecraft server version\s+([0-9a-zA-Z._-]+)/i);
    if (verMatch) {
      this.detectedVersion = verMatch[1];
    }

    // 2. Détection de statut "Done" / Prêt à recevoir les joueurs
    const lower = cleanLine.toLowerCase();
    const isDoneLog = lower.includes('done (') ||
                      lower.includes('done!') ||
                      lower.includes('done [') ||
                      lower.includes('for help, type') ||
                      lower.includes('rcon running') ||
                      lower.includes('dedicated server permissions') ||
                      lower.includes('started') ||
                      lower.includes('listening on');

    if (this.status === 'STARTING' && isDoneLog) {
      if (this.portCheckInterval) {
        clearInterval(this.portCheckInterval);
        this.portCheckInterval = null;
      }
      this.status = 'RUNNING';
      if (!this.startTime) this.startTime = Date.now();
      this.broadcast('status', this.getState());

      // Désactiver le broadcast des retours de commande administrative dans le chat
      try {
        if (this.activeProcess && this.activeProcess.stdin) {
          const ver = this.detectedVersion || this.getWorldVersion(this.activeWorld) || '26.3';
          const isModern = this.isModernGamerules(ver);
          if (isModern) {
            this.activeProcess.stdin.write('gamerule send_command_feedback false\n');
            this.activeProcess.stdin.write('gamerule log_admin_commands false\n');
          } else {
            this.activeProcess.stdin.write('gamerule sendCommandFeedback false\n');
            this.activeProcess.stdin.write('gamerule logAdminCommands false\n');
          }
        }
      } catch (e) {}

      // Synchroniser le tunnel
      this.broadcast('tunnel', tunnelService.getState());
    }

    // 3. Détection de joueurs rejoignant / quittant (Compatible Vanilla, Paper/Spigot, Forge, NeoForge, Fabric)
    const joinMatch = cleanLine.match(/:\s*(?:System chat:\s*)?([a-zA-Z0-9_]{2,16})\s+joined the game/i)
                   || cleanLine.match(/:\s*([a-zA-Z0-9_]{2,16})(?:\[.*?\])?\s+logged in with entity id/i)
                   || cleanLine.match(/UUID of player ([a-zA-Z0-9_]{2,16}) is/i);
    if (joinMatch && joinMatch[1] && joinMatch[1] !== 'System') {
      const p = joinMatch[1];
      if (!this.players.includes(p)) {
        this.players.push(p);
        this.broadcast('players', this.players);
        this.broadcast('status', this.getState());
      }
    }

    const leaveMatch = cleanLine.match(/:\s*(?:System chat:\s*)?([a-zA-Z0-9_]{2,16})\s+left the game/i)
                    || cleanLine.match(/name=([a-zA-Z0-9_]{2,16})[,\s\]].*?lost connection/i)
                    || cleanLine.match(/:\s*([a-zA-Z0-9_]{2,16})(?:\s*\(.*?\))?\s+lost connection/i);
    if (leaveMatch && leaveMatch[1] && leaveMatch[1] !== 'System') {
      const p = leaveMatch[1];
      const initialLength = this.players.length;
      this.players = this.players.filter(x => x !== p);
      if (this.players.length !== initialLength) {
        this.broadcast('players', this.players);
        this.broadcast('status', this.getState());
      }
    }

    // 4. Réponse de /list : mise à jour discrète des joueurs connectés
    const listMatch = cleanLine.match(/players online:(.*)$/i);
    if (listMatch) {
      const names = listMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      this.players = names;
      this.broadcast('players', this.players);
      this.broadcast('status', this.getState());
    }

    // 5. Filtrage strict du spam de terminal (demande utilisateur)
    // Conserver UNIQUEMENT le message de sauvegarde final quand on arrête/ferme le jeu
    const isStopping = this.status === 'STOPPING';
    const isSaveLine = cleanLine.includes('Saved the game') ||
                       cleanLine.includes('Saved the world') ||
                       cleanLine.includes('Saving the game');

    if (isSaveLine && !isStopping) {
      return;
    }

    // Masquer les retours de /list et commandes internes dans le terminal
    if (
      cleanLine.includes('players online:') ||
      (cleanLine.includes('There are') && cleanLine.includes('players online')) ||
      cleanLine.includes('sendCommandFeedback') ||
      cleanLine.includes('send_command_feedback') ||
      cleanLine.includes('logAdminCommands') ||
      cleanLine.includes('log_admin_commands')
    ) {
      return;
    }

    // 6. Ajouter au buffer et diffuser uniquement les logs pertinents
    if (wid) {
      if (!this.worldLogs[wid]) this.worldLogs[wid] = [];
      this.worldLogs[wid].push(trimmed);
      while (this.worldLogs[wid].length > 500) {
        this.worldLogs[wid].shift();
      }
    }

    this.logsBuffer.push(trimmed);
    while (this.logsBuffer.length > 500) {
      this.logsBuffer.shift();
    }

    this.broadcast('log', { worldId: wid, text: trimmed });
  }

  async getWorldLogs(worldId) {
    if (!worldId) return [];
    if (this.worldLogs[worldId] !== undefined && this.worldLogs[worldId].length > 0) {
      return this.worldLogs[worldId].slice(-500);
    }
    // Tenter de charger les logs récents depuis le fichier latest.log du monde en filtrant le spam
    const logFilePath = path.join(this.gamesDir, worldId, 'logs', 'latest.log');
    if (fs.existsSync(logFilePath)) {
      try {
        const content = fs.readFileSync(logFilePath, 'utf8');
        const lines = content.split(/\r?\n/)
          .filter(Boolean)
          .filter(l => {
            if (l.includes('Saved the game') || l.includes('Saving the game')) return false;
            if (l.includes('players online:') || (l.includes('There are') && l.includes('players online'))) return false;
            return true;
          });
        this.worldLogs[worldId] = lines.slice(-500);
        return this.worldLogs[worldId];
      } catch (e) {
        return [];
      }
    }
    if (!this.worldLogs[worldId]) {
      this.worldLogs[worldId] = [];
    }
    return this.worldLogs[worldId];
  }

  clearWorldLogs(worldId) {
    if (worldId) {
      this.worldLogs[worldId] = [];
      const logFilePath = path.join(this.gamesDir, worldId, 'logs', 'latest.log');
      try {
        if (fs.existsSync(logFilePath)) {
          fs.writeFileSync(logFilePath, '', 'utf8');
        }
      } catch (_) {}
      if (this.activeWorld === worldId) {
        this.logsBuffer = [];
      }
    } else {
      this.logsBuffer = [];
      for (const wid of Object.keys(this.worldLogs)) {
        this.worldLogs[wid] = [];
        const logFilePath = path.join(this.gamesDir, wid, 'logs', 'latest.log');
        try {
          if (fs.existsSync(logFilePath)) {
            fs.writeFileSync(logFilePath, '', 'utf8');
          }
        } catch (_) {}
      }
    }
  }

  getState() {
    const activeRuntime = (this.activeWorld && this.startTime && this.status !== 'STOPPED')
      ? this.sessionStartRuntime + Math.floor((Date.now() - this.startTime) / 1000)
      : (this.activeWorld ? this.getWorldRuntime(this.activeWorld) : 0);

    return {
      status: this.status,
      activeWorld: this.activeWorld,
      startTime: this.startTime,
      runtime: activeRuntime,
      uptime: activeRuntime,
      players: this.players,
      tunnel: tunnelService.getState(),
      isDownloadingJava: !!this.isDownloadingJava,
      javaDownloadStep: this.javaDownloadStep || ''
    };
  }

  getNextDefaultWorldName() {
    try {
      const existing = fs.readdirSync(this.gamesDir).filter(f => !f.startsWith('.'));
      let i = 1;
      while (existing.some(e => e.toLowerCase() === `monde-${i}`.toLowerCase())) {
        i++;
      }
      return `monde-${i}`;
    } catch (e) {
      return 'monde-1';
    }
  }

  /**
   * Trouve le dossier contenant les données du monde (level.dat, region/, DIM-1, etc.)
   * en tenant compte de level-name dans server.properties, de 'world', du nom du monde, ou de la racine.
   */
  getWorldDataFolder(worldPath) {
    if (!fs.existsSync(worldPath)) return worldPath;

    // 1. Lire level-name dans server.properties
    const propsPath = path.join(worldPath, 'server.properties');
    if (fs.existsSync(propsPath)) {
      try {
        const props = fs.readFileSync(propsPath, 'utf8');
        const match = props.match(/^\s*level-name\s*=\s*(.+)$/m);
        if (match && match[1]) {
          const levelName = match[1].trim();
          const candidate = path.join(worldPath, levelName);
          if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
            return candidate;
          }
        }
      } catch (e) {}
    }

    // 2. Sous-dossier standard 'world'
    const worldDir = path.join(worldPath, 'world');
    if (fs.existsSync(worldDir) && fs.statSync(worldDir).isDirectory()) {
      return worldDir;
    }

    // 3. Sous-dossier portant le même nom que le dossier du serveur
    const baseName = path.basename(worldPath);
    const selfNamed = path.join(worldPath, baseName);
    if (fs.existsSync(selfNamed) && fs.statSync(selfNamed).isDirectory()) {
      return selfNamed;
    }

    // 4. Sous-dossiers immédiats contenant level.dat ou region/
    try {
      const entries = fs.readdirSync(worldPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && !['logs', 'crash-reports', 'libraries', 'mods', 'cache', 'versions'].includes(entry.name)) {
          const candidate = path.join(worldPath, entry.name);
          if (fs.existsSync(path.join(candidate, 'level.dat')) || fs.existsSync(path.join(candidate, 'region'))) {
            return candidate;
          }
        }
      }
    } catch (e) {}

    // 5. Directement à la racine
    return worldPath;
  }

  /**
   * Scanne tous les mondes dans games/
   */
  async listWorlds() {
    if (!fs.existsSync(this.gamesDir)) return [];

    const entries = fs.readdirSync(this.gamesDir, { withFileTypes: true });
    const worlds = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const worldPath = path.join(this.gamesDir, entry.name);

      // Ignorer et purger les dossiers résiduels complètement vides
      try {
        const dirFiles = fs.readdirSync(worldPath).filter(f => !f.startsWith('.'));
        if (dirFiles.length === 0) {
          try { fs.rmSync(worldPath, { recursive: true, force: true }); } catch (_) {}
          continue;
        }
      } catch (_) {
        continue;
      }

      const hasRunSh = fs.existsSync(path.join(worldPath, 'run.sh'));
      const hasRunBat = fs.existsSync(path.join(worldPath, 'run.bat'));
      const hasServerJar = fs.existsSync(path.join(worldPath, 'server.jar'));
      const hasLaunchAll = fs.existsSync(path.join(worldPath, 'launchAll.sh'));
      const modsDir = path.join(worldPath, 'mods');
      const hasMods = fs.existsSync(modsDir);
      let modsCount = 0;
      if (hasMods) {
        try {
          modsCount = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar')).length;
        } catch (e) {}
      }

      // Lire server.properties si dispo
      let port = '25565';
      let motd = 'A Minecraft Server';
      const propsPath = path.join(worldPath, 'server.properties');
      if (fs.existsSync(propsPath)) {
        try {
          const props = fs.readFileSync(propsPath, 'utf8');
          const portM = props.match(/server-port\s*=\s*(\d+)/);
          if (portM) port = portM[1];
          const motdM = props.match(/motd\s*=\s*(.+)/);
          if (motdM) motd = motdM[1];
        } catch (e) {}
      }

      // Détecter type (Modloader réel, dossier mods ou MOTD Moddé)
      let type = 'Vanilla';
      const hasModloaderLibs = 
        fs.existsSync(path.join(worldPath, 'libraries/net/neoforged')) ||
        fs.existsSync(path.join(worldPath, 'libraries/net/minecraftforge')) ||
        fs.existsSync(path.join(worldPath, 'libraries/net/fabricmc')) ||
        fs.existsSync(path.join(worldPath, 'libraries/org/quiltmc'));
      const hasTypeMarker = fs.existsSync(path.join(worldPath, 'type.txt')) && 
        fs.readFileSync(path.join(worldPath, 'type.txt'), 'utf8').includes('modded');

      if (modsCount > 0 || hasMods || hasModloaderLibs || hasTypeMarker || motd.toLowerCase().includes('moddé')) {
        type = 'Moddé';
      }

      // Taille complète du dossier du serveur / monde (100% compatible Windows & macOS)
      const worldSize = computeDirectorySizeFormatted(worldPath);

      // Détection précise du lanceur et de la version
      let launcherVersion = (type === 'Vanilla') ? 'Vanilla' : 'Moddé';
      const neoforgeDir = path.join(worldPath, 'libraries/net/neoforged/neoforge');
      const forgeDir = path.join(worldPath, 'libraries/net/minecraftforge/forge');
      const fabricDir = path.join(worldPath, 'libraries/net/fabricmc');
      
      let detectedLdr = null;
      let detectedVer = this.getWorldVersion(entry.name);

      if (fs.existsSync(neoforgeDir)) {
        try {
          const versions = fs.readdirSync(neoforgeDir).filter(f => !f.startsWith('.'));
          detectedLdr = versions.length > 0 ? `NeoForge ${versions[0]}` : 'NeoForge';
        } catch (e) { detectedLdr = 'NeoForge'; }
      } else if (fs.existsSync(forgeDir)) {
        try {
          const versions = fs.readdirSync(forgeDir).filter(f => !f.startsWith('.'));
          detectedLdr = versions.length > 0 ? `Forge ${versions[0]}` : 'Forge';
        } catch (e) { detectedLdr = 'Forge'; }
      } else if (fs.existsSync(fabricDir) || fs.existsSync(path.join(worldPath, '.fabric'))) {
        detectedLdr = 'Fabric';
      }

      // Si pas encore déterminé par libraries, analyser run.sh ou run.bat
      if (!detectedLdr && (hasRunSh || fs.existsSync(path.join(worldPath, 'run.bat')))) {
        try {
          const runFile = hasRunSh ? path.join(worldPath, 'run.sh') : path.join(worldPath, 'run.bat');
          const runContent = fs.readFileSync(runFile, 'utf8');
          if (/neoforge/i.test(runContent)) {
            detectedLdr = 'NeoForge';
          } else if (/forge/i.test(runContent)) {
            detectedLdr = 'Forge';
          } else if (/fabric/i.test(runContent)) {
            detectedLdr = 'Fabric';
          } else if (/quilt/i.test(runContent)) {
            detectedLdr = 'Quilt';
          } else if (/vanilla/i.test(runContent)) {
            detectedLdr = 'Vanilla';
          }
        } catch (e) {}
      }

      // Si toujours indéterminé mais qu'il y a des mods, inspecter les fichiers .jar dans mods/
      if (!detectedLdr && modsCount > 0) {
        try {
          const modFiles = fs.readdirSync(path.join(worldPath, 'mods')).filter(f => f.endsWith('.jar'));
          if (modFiles.some(f => /neoforge/i.test(f))) detectedLdr = 'NeoForge';
          else if (modFiles.some(f => /forge/i.test(f))) detectedLdr = 'Forge';
          else if (modFiles.some(f => /fabric/i.test(f))) detectedLdr = 'Fabric';
          else detectedLdr = 'Moddé';
        } catch (_) {}
      }

      if (type === 'Vanilla') {
        launcherVersion = detectedVer ? `Vanilla ${detectedVer}` : 'Vanilla';
      } else {
        const ldrName = detectedLdr || 'Moddé';
        if (detectedVer && !ldrName.includes(detectedVer)) {
          launcherVersion = `${ldrName} ${detectedVer}`;
        } else {
          launcherVersion = ldrName;
        }
      }

      // Détection des dimensions chargées et créées (Uniquement Overworld, Nether, End)
      const dimensions = [];
      const worldDataFolder = this.getWorldDataFolder(worldPath);
      
      // 1. Overworld (Surface)
      const owRegionDir = path.join(worldDataFolder, 'region');
      const hasOwMca = fs.existsSync(owRegionDir) && fs.readdirSync(owRegionDir).some(f => f.endsWith('.mca'));
      const hasLevelDat = fs.existsSync(path.join(worldDataFolder, 'level.dat'));
      const isOwLoaded = hasOwMca || hasLevelDat || fs.existsSync(owRegionDir);
      if (isOwLoaded) {
        const duTarget = (fs.existsSync(owRegionDir) && fs.readdirSync(owRegionDir).length > 0) ? owRegionDir : worldDataFolder;
        const dimSize = computeDirectorySizeFormatted(duTarget);
        dimensions.push({ id: 'overworld', name: 'Overworld (Surface)', folder: path.relative(worldPath, owRegionDir) || 'region', size: dimSize, isLoaded: true });
      }

      // 2. Le Nether (DIM-1 ou sous-dossier _nether)
      const netherCandidate1 = path.join(worldDataFolder, 'DIM-1');
      const netherCandidate2 = path.join(worldPath, path.basename(worldDataFolder) + '_nether');
      const netherCandidate3 = path.join(worldPath, 'world_nether');
      let activeNetherDir = null;
      for (const cand of [netherCandidate1, netherCandidate2, netherCandidate3]) {
        const reg = path.join(cand, 'region');
        const regAlt = path.join(cand, 'DIM-1', 'region');
        if (fs.existsSync(reg) && fs.readdirSync(reg).some(f => f.endsWith('.mca'))) {
          activeNetherDir = cand;
          break;
        } else if (fs.existsSync(regAlt) && fs.readdirSync(regAlt).some(f => f.endsWith('.mca'))) {
          activeNetherDir = cand;
          break;
        }
      }
      if (activeNetherDir) {
        const dimSize = computeDirectorySizeFormatted(activeNetherDir);
        dimensions.push({ id: 'nether', name: 'Le Nether', folder: path.relative(worldPath, activeNetherDir) || 'DIM-1', size: dimSize, isLoaded: true });
      }

      // 3. L'End (DIM1 ou sous-dossier _the_end)
      const endCandidate1 = path.join(worldDataFolder, 'DIM1');
      const endCandidate2 = path.join(worldPath, path.basename(worldDataFolder) + '_the_end');
      const endCandidate3 = path.join(worldPath, 'world_the_end');
      let activeEndDir = null;
      for (const cand of [endCandidate1, endCandidate2, endCandidate3]) {
        const reg = path.join(cand, 'region');
        const regAlt = path.join(cand, 'DIM1', 'region');
        if (fs.existsSync(reg) && fs.readdirSync(reg).some(f => f.endsWith('.mca'))) {
          activeEndDir = cand;
          break;
        } else if (fs.existsSync(regAlt) && fs.readdirSync(regAlt).some(f => f.endsWith('.mca'))) {
          activeEndDir = cand;
          break;
        }
      }
      if (activeEndDir) {
        const dimSize = computeDirectorySizeFormatted(activeEndDir);
        dimensions.push({ id: 'the_end', name: "L'End", folder: path.relative(worldPath, activeEndDir) || 'DIM1', size: dimSize, isLoaded: true });
      }

      const isThisRunning = this.activeWorld === entry.name && this.status !== 'STOPPED';
      const runtimeInfo = this.getWorldRuntimeInfo(entry.name);
      const savedRuntime = runtimeInfo.totalRuntime;
      const currentRuntime = isThisRunning && this.startTime
        ? this.sessionStartRuntime + Math.floor((Date.now() - this.startTime) / 1000)
        : savedRuntime;

      worlds.push({
        id: entry.name,
        name: entry.name,
        path: worldPath,
        type,
        launcherVersion,
        modsCount,
        port,
        motd,
        worldSize,
        canLaunch: (hasRunSh || hasServerJar || hasLaunchAll || hasRunBat),
        needsRepair: (this.worldHealth[entry.name]?.status === 'needs_repair'),
        isCorrupted: (this.worldHealth[entry.name]?.status === 'corrupted') || (!hasRunSh && !hasServerJar && !hasLaunchAll && !hasRunBat && !fs.existsSync(path.join(worldPath, 'world'))),
        healthStatus: this.worldHealth[entry.name]?.status || 'healthy',
        crashReason: this.worldHealth[entry.name]?.reason || null,
        isRunning: isThisRunning,
        startTime: isThisRunning ? this.startTime : null,
        lastStartedAt: isThisRunning ? (this.startTime || Date.now()) : (runtimeInfo.lastStartedAt || 0),
        baseRuntime: savedRuntime,
        runtime: currentRuntime,
        uptime: currentRuntime,
        dimensions
      });
    }

    return worlds;
  }

  /**
   * Lancement d'un monde
   */
  async startWorld(worldId, force = false) {
    const worldPath = path.join(this.gamesDir, worldId);
    if (!fs.existsSync(worldPath)) {
      throw new Error(`Monde introuvable: ${worldId}`);
    }

    // Si un autre monde est déjà en cours d'exécution
    if (this.activeWorld && this.activeWorld !== worldId && this.status !== 'STOPPED') {
      if (force) {
        try { await this.stopWorld(true); } catch (_) {}
      } else {
        throw new Error(`Le monde '${this.activeWorld}' est déjà en cours d'exécution. Veuillez l'arrêter d'abord.`);
      }
    }

    this.worldLaunchTimes[worldId] = Date.now();
    if (this.worldHealth[worldId]) {
      delete this.worldHealth[worldId];
      this.broadcast('world_health_changed', { worldId, health: { status: 'healthy' } });
    }

    if (force) {
      this.appendLog(`[Serveur] Démarrage forcé demandé pour le monde ${worldId}.`, worldId);
    }

    // 0. Nettoyage préventif des processus fantômes ou orphelins
    try {
      execSync(`pkill -f "games/${worldId}" 2>/dev/null || true`);
      await new Promise(r => setTimeout(r, 600));
    } catch (e) {}

    // Nettoyage complet de tous les session.lock (racine, world/, dimensions)
    const findLocks = (dir) => {
      let locks = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fp = path.join(dir, entry.name);
          if (entry.isDirectory()) locks = locks.concat(findLocks(fp));
          else if (entry.name === 'session.lock') locks.push(fp);
        }
      } catch (_) {}
      return locks;
    };
    for (const lock of findLocks(worldPath)) {
      try { fs.unlinkSync(lock); } catch (e) {}
    }

    // En cas de démarrage forcé : neutraliser le Watchdog et supprimer les chunks corrompus de 0 octet
    if (force) {
      try {
        const propsPath = path.join(worldPath, 'server.properties');
        if (fs.existsSync(propsPath)) {
          let props = fs.readFileSync(propsPath, 'utf8');
          if (!props.includes('max-tick-time=-1')) {
            props = props.replace(/^max-tick-time=.*$/m, 'max-tick-time=-1');
            if (!props.includes('max-tick-time=')) props += '\nmax-tick-time=-1\n';
            fs.writeFileSync(propsPath, props, 'utf8');
          }
        }
        // Supprimer les fichiers de région/entités de 0 octet
        const cleanZeros = (dir) => {
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fp = path.join(dir, entry.name);
              if (entry.isDirectory()) cleanZeros(fp);
              else if (entry.isFile() && entry.name.endsWith('.mca')) {
                if (fs.statSync(fp).size === 0) try { fs.unlinkSync(fp); } catch (_) {}
              }
            }
          } catch (_) {}
        };
        cleanZeros(worldPath);
      } catch (_) {}
    }

    // Assurer eula=true
    const eulaPath = path.join(worldPath, 'eula.txt');
    try {
      fs.writeFileSync(eulaPath, 'eula=true\n', 'utf8');
    } catch (e) {}

    this.activeWorld = worldId;
    this.status = 'STARTING';
    this.sessionStartRuntime = this.getWorldRuntime(worldId);
    this.startTime = Date.now();
    this.saveWorldRuntime(this.activeWorld, this.sessionStartRuntime, this.startTime);
    if (this.runtimeSaveInterval) clearInterval(this.runtimeSaveInterval);
    this.runtimeSaveInterval = setInterval(() => {
      if (this.activeWorld && this.status !== 'STOPPED' && this.startTime) {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        this.saveWorldRuntime(this.activeWorld, this.sessionStartRuntime + elapsed);
      }
    }, 3000);

    // Synchronisation périodique discrète des joueurs connectés (sans forcer de sauvegarde en boucle)
    if (this.serverSyncInterval) clearInterval(this.serverSyncInterval);
    this.serverSyncInterval = setInterval(() => {
      if (this.activeWorld && this.status === 'RUNNING') {
        this.triggerSilentList(this.activeWorld);
      }
    }, 3000);

    this.players = [];
    if (!this.worldLogs[worldId] || this.worldLogs[worldId].length === 0) {
      await this.getWorldLogs(worldId);
    }
    if (!this.worldLogs[worldId]) {
      this.worldLogs[worldId] = [];
    }
    while (this.worldLogs[worldId].length > 500) {
      this.worldLogs[worldId].shift();
    }
    this.logsBuffer = [...this.worldLogs[worldId]];
    this.broadcast('status', this.getState());

    // 1. Détecter le port du serveur Minecraft et démarrer le tunnel public
    let serverPort = 25565;
    try {
      const propPath = path.join(worldPath, 'server.properties');
      if (fs.existsSync(propPath)) {
        const props = fs.readFileSync(propPath, 'utf8');
        const match = props.match(/^server-port=(\d+)/m);
        if (match) serverPort = parseInt(match[1], 10);
      }
    } catch (_) {}

    tunnelService.start(serverPort).then((tunnelState) => {
      this.broadcast('tunnel', tunnelState);
      if (tunnelState.publicAddress) {
        this.appendLog(`[Tunnel] En ligne : ${tunnelState.publicAddress}`, worldId);
      }
    }).catch(err => {
      this.appendLog(`[Tunnel] Erreur: ${err.message}`, worldId);
    });

    // Sondage actif TCP du port local Minecraft pour confirmer RUNNING immédiatement dès que le port écoute
    if (this.portCheckInterval) {
      clearInterval(this.portCheckInterval);
      this.portCheckInterval = null;
    }
    const net = require('net');
    this.portCheckInterval = setInterval(() => {
      if (this.status !== 'STARTING') {
        clearInterval(this.portCheckInterval);
        this.portCheckInterval = null;
        return;
      }
      const sock = new net.Socket();
      sock.setTimeout(400);
      sock.on('connect', () => {
        sock.destroy();
        if (this.status === 'STARTING') {
          this.status = 'RUNNING';
          if (!this.startTime) this.startTime = Date.now();
          this.broadcast('status', this.getState());
          this.broadcast('tunnel', tunnelService.getState());
        }
        clearInterval(this.portCheckInterval);
        this.portCheckInterval = null;
      });
      sock.on('error', () => { sock.destroy(); });
      sock.on('timeout', () => { sock.destroy(); });
      sock.connect(serverPort, '127.0.0.1');
    }, 1000);

    // 2. Déterminer la commande de lancement du serveur Minecraft
    let execFile = null;
    let execArgs = [];

    const isWin = process.platform === 'win32';
    const runBatPath = path.join(worldPath, 'run.bat');
    const runCmdPath = path.join(worldPath, 'run.cmd');
    const runShPath = path.join(worldPath, 'run.sh');
    const serverJarPath = path.join(worldPath, 'server.jar');

    let checkContent = '';
    try {
      if (fs.existsSync(path.join(worldPath, 'server.properties'))) {
        checkContent += fs.readFileSync(path.join(worldPath, 'server.properties'), 'utf8');
      }
      if (fs.existsSync(runShPath)) {
        checkContent += fs.readFileSync(runShPath, 'utf8');
      }
    } catch (e) {}

    // Vérification rigoureuse et auto-approvisionnement de Java avant tout lancement
    const javaInfo = await this.ensureJavaReady(worldId, checkContent);
    const selectedJavaHome = javaInfo.javaHome;

    if (isWin && (fs.existsSync(runBatPath) || fs.existsSync(runCmdPath))) {
      const batFile = fs.existsSync(runBatPath) ? runBatPath : runCmdPath;
      execFile = 'cmd.exe';
      execArgs = ['/c', batFile, 'nogui'];
    } else if (!isWin && fs.existsSync(runShPath)) {
      try { fs.chmodSync(runShPath, 0o755); } catch (e) {}
      execFile = '/bin/sh';
      execArgs = [runShPath, 'nogui'];
    } else if (fs.existsSync(serverJarPath)) {
      execFile = javaInfo.execFile || (isWin ? 'java.exe' : 'java');
      execArgs = ['-Xmx4G', '-Xms2G', '-jar', 'server.jar', 'nogui'];
    } else {
      this.status = 'STOPPED';
      this.activeWorld = null;
      this.markWorldCrashed(worldId, {
        code: -1,
        reason: "Aucun exécutable de démarrage (run.bat, run.sh ou server.jar) présent."
      });
      throw new Error(`Aucun exécutable (run.bat, run.sh ou server.jar) trouvé dans le dossier ${worldId}`);
    }

    const childEnv = { ...process.env };
    const effectiveJavaHome = selectedJavaHome || (javaInfo.execFile && path.isAbsolute(javaInfo.execFile) ? path.dirname(path.dirname(javaInfo.execFile)) : null);
    if (effectiveJavaHome) {
      childEnv.JAVA_HOME = effectiveJavaHome;
      const binDir = path.join(effectiveJavaHome, 'bin');
      if (isWin) {
        childEnv.PATH = `${binDir};${process.env.PATH || process.env.Path || ''}`;
        childEnv.Path = childEnv.PATH;
      } else {
        childEnv.PATH = `${binDir}:${process.env.PATH || ''}`;
      }
    }

    const child = spawn(execFile, execArgs, {
      cwd: worldPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv
    });

    this.activeProcess = child;

    // Gestion des flux stdout / stderr (logs directs du serveur Minecraft)
    child.stdout.on('data', (chunk) => {
      const lines = chunk.toString('utf8').split('\n');
      for (const line of lines) {
        if (line.trim()) this.appendLog(line, worldId);
      }
    });

    child.stderr.on('data', (chunk) => {
      const lines = chunk.toString('utf8').split('\n');
      for (const line of lines) {
        if (line.trim()) {
          this.appendLog(`[ERR] ${line}`, worldId);
          if (line.includes('UnsupportedClassVersionError') && (line.includes('69.0') || line.includes('class file version 69.0'))) {
            this.appendLog('[Java] ⚠️ Incompatibilité Java détectée : cette version de Minecraft requiert Java 25 (classe 69.0).', worldId);
            this.appendLog('[Java] 🚀 Lancement automatique de l\'installation d\'OpenJDK 25 en arrière-plan...', worldId);
            this.ensureJava25Background();
          }
        }
      }
    });

    child.on('close', (code) => {
      this.appendLog(`[Serveur] Le serveur s'est arrêté avec le code ${code}.`);
      const stoppedWorld = this.activeWorld;
      const wasStarting = (this.status === 'STARTING');
      const wasStopping = (this.status === 'STOPPING');
      const launchDuration = Math.floor((Date.now() - (this.worldLaunchTimes[stoppedWorld] || Date.now())) / 1000);
      const isAbnormalExit = !wasStopping && ((code !== 0 && code !== null) || wasStarting || launchDuration < 10);

      if (stoppedWorld && isAbnormalExit) {
        this.markWorldCrashed(stoppedWorld, {
          code: code ?? -1,
          reason: wasStarting 
            ? "Le serveur s'est arrêté brutalement pendant la phase d'initialisation." 
            : `Arrêt anormal du serveur (code ${code}).`
        });
      }

      if (this.portCheckInterval) {
        clearInterval(this.portCheckInterval);
        this.portCheckInterval = null;
      }
      if (this.runtimeSaveInterval) {
        clearInterval(this.runtimeSaveInterval);
        this.runtimeSaveInterval = null;
      }
      if (this.serverSyncInterval) {
        clearInterval(this.serverSyncInterval);
        this.serverSyncInterval = null;
      }
      if (this.activeWorld && this.startTime) {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        this.saveWorldRuntime(this.activeWorld, this.sessionStartRuntime + elapsed);
      }
      this.status = 'STOPPED';
      this.activeWorld = null;
      this.activeProcess = null;
      this.startTime = null;
      this.players = [];
      this.broadcast('players', []);
      try { tunnelService.stop().catch(() => {}); } catch (_) {}
      this.broadcast('tunnel', tunnelService.getState());

      this.broadcast('status', this.getState());
    });

    child.on('error', (err) => {
      this.appendLog(`[Serveur] Erreur de processus: ${err.message}`);
      if (this.portCheckInterval) {
        clearInterval(this.portCheckInterval);
        this.portCheckInterval = null;
      }
      const stoppedWorld = this.activeWorld;
      if (stoppedWorld) {
        this.markWorldCrashed(stoppedWorld, {
          code: -1,
          reason: `Erreur d'exécution du processus : ${err.message}`
        });
      }
      if (this.runtimeSaveInterval) {
        clearInterval(this.runtimeSaveInterval);
        this.runtimeSaveInterval = null;
      }
      if (this.serverSyncInterval) {
        clearInterval(this.serverSyncInterval);
        this.serverSyncInterval = null;
      }
      if (this.activeWorld && this.startTime) {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        this.saveWorldRuntime(this.activeWorld, this.sessionStartRuntime + elapsed);
      }
      this.status = 'STOPPED';
      this.startTime = null;
      this.broadcast('status', this.getState());
    });

    return this.getState();
  }

  /**
   * Envoi d'une commande stdin dans la console Minecraft
   */
  sendCommand(command, targetWorldId = null) {
    if (!this.activeProcess || !this.activeProcess.stdin || this.status === 'STOPPED') {
      throw new Error('Aucun serveur Minecraft en cours d\'exécution.');
    }
    if (targetWorldId && targetWorldId !== this.activeWorld) {
      throw new Error(`Le monde '${targetWorldId}' n'est pas celui actuellement en cours d'exécution (${this.activeWorld}).`);
    }
    const cleanCmd = command.trim();
    this.appendLog(`> ${cleanCmd}`, this.activeWorld);
    this.activeProcess.stdin.write(`${cleanCmd}\n`);
    return { success: true, command: cleanCmd };
  }

  /**
   * Sauvegarde silencieuse en tâche de fond (force Minecraft à écrire les playerdata sur disque)
   */
  triggerSilentSave(worldId) {
    if (this.activeProcess && this.activeProcess.stdin && this.status === 'RUNNING' && this.activeWorld === worldId) {
      const now = Date.now();
      if (!this._lastSilentSave || (now - this._lastSilentSave > 1500)) {
        this._lastSilentSave = now;
        try {
          this.activeProcess.stdin.write('save-all\n');
        } catch (e) {}
      }
    }
  }

  /**
   * Scan silencieux des joueurs connectés (/list)
   */
  triggerSilentList(worldId) {
    if (this.activeProcess && this.activeProcess.stdin && this.status === 'RUNNING' && this.activeWorld === worldId) {
      const now = Date.now();
      if (!this._lastSilentList || (now - this._lastSilentList > 1000)) {
        this._lastSilentList = now;
        try {
          this.activeProcess.stdin.write('list\n');
        } catch (e) {}
      }
    }
  }

  /**
   * Arrêt propre du serveur Minecraft
   */
  async stopWorld(force = false) {
    if (this.isDownloadingJava && !force) {
      throw new Error("Téléchargement de Java en cours. L'arrêt du serveur est temporairement bloqué pendant cette étape.");
    }

    if (this.status === 'STOPPED') {
      return this.getState();
    }

    this.status = 'STOPPING';
    this.appendLog(`[Manager] Arrêt gracieux du serveur en cours...`);
    this.broadcast('status', this.getState());

    if (this.activeProcess) {
      try {
        if (this.activeProcess.stdin) {
          this.activeProcess.stdin.write('stop\n');
        }
      } catch (e) {}

      // Attendre 15s max avant force kill
      let waited = 0;
      while (this.activeProcess && waited < 15) {
        await new Promise(r => setTimeout(r, 1000));
        waited++;
      }

      if (this.activeProcess && force) {
        this.appendLog(`[Manager] Force kill du serveur Minecraft...`);
        try {
          if (process.platform === 'win32' && this.activeProcess.pid) {
            exec(`taskkill /pid ${this.activeProcess.pid} /T /F 2>nul`);
          } else {
            this.activeProcess.kill('SIGKILL');
          }
        } catch (e) {}
      }
    }

    if (this.runtimeSaveInterval) {
      clearInterval(this.runtimeSaveInterval);
      this.runtimeSaveInterval = null;
    }
    if (this.serverSyncInterval) {
      clearInterval(this.serverSyncInterval);
      this.serverSyncInterval = null;
    }
    if (this.activeWorld && this.startTime) {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      this.saveWorldRuntime(this.activeWorld, this.sessionStartRuntime + elapsed);
    }

    this.status = 'STOPPED';
    this.activeWorld = null;
    this.activeProcess = null;
    this.startTime = null;
    this.players = [];
    this.broadcast('players', []);
    try { tunnelService.stop().catch(() => {}); } catch (_) {}
    this.broadcast('status', this.getState());
    this.broadcast('tunnel', tunnelService.getState());

    return this.getState();
  }

  /**
   * Enregistre un crash ou incident sur un monde pour proposer la réparation
   */
  /**
   * Analyse et diagnostique le dernier crash d'un monde
   */
  analyzeWorldCrash(worldId) {
    const worldPath = path.join(this.gamesDir, worldId);
    const crashDir = path.join(worldPath, 'crash-reports');
    const logsDir = path.join(worldPath, 'logs');
    let lastCrashFile = null;
    let crashContent = '';

    if (fs.existsSync(crashDir)) {
      try {
        const files = fs.readdirSync(crashDir)
          .filter(f => f.startsWith('crash-') && f.endsWith('.txt'))
          .map(f => ({ name: f, time: fs.statSync(path.join(crashDir, f)).mtimeMs }))
          .sort((a, b) => b.time - a.time);
        if (files.length > 0) {
          lastCrashFile = path.join(crashDir, files[0].name);
          crashContent = fs.readFileSync(lastCrashFile, 'utf8');
        }
      } catch (_) {}
    }

    let logContent = '';
    const latestLog = path.join(logsDir, 'latest.log');
    if (fs.existsSync(latestLog)) {
      try {
        const logData = fs.readFileSync(latestLog, 'utf8');
        logContent = logData.slice(-15000);
      } catch (_) {}
    }

    const fullText = (crashContent + '\n' + logContent);
    const diagnosis = {
      hasCrash: !!crashContent || !!lastCrashFile,
      crashFile: lastCrashFile ? path.basename(lastCrashFile) : null,
      isWatchdog: false,
      isOutOfMemory: false,
      isJavaMismatch: false,
      isCorruptChunk: false,
      isPortConflict: false,
      suspectedMod: null,
      entityCount: null,
      summary: ''
    };

    if (!fullText.trim()) {
      diagnosis.summary = "Aucun rapport d'erreur ou crash récent n'a été enregistré.";
      return diagnosis;
    }

    if (fullText.includes('ServerHangWatchdog') || fullText.includes('ServerWatchdog') || fullText.includes('single server tick took') || fullText.includes('Watching Server')) {
      diagnosis.isWatchdog = true;
    }

    if (fullText.includes('OutOfMemoryError') || fullText.includes('Java heap space') || fullText.includes('Compressed class space')) {
      diagnosis.isOutOfMemory = true;
    }

    if (fullText.includes('UnsupportedClassVersionError') || fullText.includes('has been compiled by a more recent version')) {
      diagnosis.isJavaMismatch = true;
    }

    if (fullText.includes('Address already in use') || fullText.includes('FAILED TO BIND TO PORT')) {
      diagnosis.isPortConflict = true;
    }

    if (fullText.includes('CorruptWorldException') || fullText.includes('Failed to load chunk') || fullText.includes('Empty Anvil header')) {
      diagnosis.isCorruptChunk = true;
    }

    const suspectedModMatch = fullText.match(/Suspected Mod:\s*\n?\s*([^\n\r]+)/i);
    if (suspectedModMatch) {
      diagnosis.suspectedMod = suspectedModMatch[1].trim();
    } else {
      const modMatch = fullText.match(/at TRANSFORMER\/([a-zA-Z0-9_-]+)@/i) || fullText.match(/net\.mcreator\.([a-zA-Z0-9_]+)/i);
      if (modMatch) {
        diagnosis.suspectedMod = modMatch[1].trim();
      }
    }

    const entityMatch = fullText.match(/entities:\s*([0-9]+)/i);
    if (entityMatch) {
      diagnosis.entityCount = parseInt(entityMatch[1], 10);
    }

    if (diagnosis.isWatchdog) {
      let desc = "Arrêt forcé par le Server Watchdog : un tick a dépassé la limite de 60s (blocage ou lag intensif).";
      if (diagnosis.suspectedMod) desc += ` Mod en cause : ${diagnosis.suspectedMod}.`;
      if (diagnosis.entityCount && diagnosis.entityCount > 500) desc += ` ${diagnosis.entityCount} entités étaient actives lors du crash (ex: explosion TNT géante).`;
      diagnosis.summary = desc;
    } else if (diagnosis.isOutOfMemory) {
      diagnosis.summary = "Mémoire vive saturée (OutOfMemoryError). La RAM allouée au serveur était insuffisante.";
    } else if (diagnosis.isJavaMismatch) {
      diagnosis.summary = "Incompatibilité de version Java avec le serveur Minecraft.";
    } else if (diagnosis.isPortConflict) {
      diagnosis.summary = "Conflit réseau : le port 25565 est déjà occupé par un autre processus.";
    } else if (diagnosis.isCorruptChunk) {
      diagnosis.summary = "Corruption de blocs ou de chunks dans la carte Minecraft.";
    } else {
      diagnosis.summary = "Incident ou arrêt anormal du serveur détecté.";
    }

    return diagnosis;
  }

  /**
   * Enregistre un crash ou incident sur un monde pour proposer la réparation
   */
  markWorldCrashed(worldId, { code, reason }) {
    if (!worldId) return;
    const worldPath = path.join(this.gamesDir, worldId);
    const hasFiles = fs.existsSync(worldPath) && fs.readdirSync(worldPath).filter(f => !f.startsWith('.')).length > 0;
    const hasValidWorld = hasFiles && (
      fs.existsSync(path.join(worldPath, 'world')) ||
      fs.existsSync(path.join(worldPath, 'level.dat')) ||
      fs.existsSync(path.join(worldPath, 'server.properties'))
    );
    const hasExecutable = hasFiles && (
      fs.existsSync(path.join(worldPath, 'server.jar')) ||
      fs.existsSync(path.join(worldPath, 'run.sh')) ||
      fs.existsSync(path.join(worldPath, 'run.bat')) ||
      fs.existsSync(path.join(worldPath, 'launchAll.sh'))
    );

    const isCorrupted = !hasFiles || (!hasValidWorld && !hasExecutable);
    const crashAnalysis = this.analyzeWorldCrash(worldId);

    this.worldHealth[worldId] = {
      status: isCorrupted ? 'corrupted' : 'needs_repair',
      reason: crashAnalysis.summary || reason || "Arrêt inattendu du serveur.",
      lastCrashAt: Date.now(),
      code: code ?? null,
      diagnosis: crashAnalysis
    };

    this.broadcast('world_health_changed', { worldId, health: this.worldHealth[worldId] });
  }

  /**
   * Efface l'état de crash d'un monde
   */
  clearWorldCrash(worldId) {
    if (this.worldHealth[worldId]) {
      delete this.worldHealth[worldId];
      this.broadcast('world_health_changed', { worldId, health: { status: 'healthy' } });
    }
  }

  /**
   * Réparation automatique et chirurgicale d'un monde corrompu ou crashé
   */
  async repairWorld(worldId) {
    const worldPath = path.join(this.gamesDir, worldId);
    if (!fs.existsSync(worldPath)) {
      throw new Error(`Monde introuvable: ${worldId}`);
    }

    const report = [];
    const fixes = [];

    // 0. Si le monde est actuellement actif, forcer son arrêt sécurisé
    if (this.activeWorld === worldId && this.activeProcess) {
      try {
        await this.stopWorld(true);
        report.push("Serveur actif arrêté pour libérer les fichiers.");
      } catch (_) {}
    }

    // 1. Analyse approfondie des causes du crash
    const diagnosis = this.analyzeWorldCrash(worldId);
    if (diagnosis.summary) {
      report.push(`Diagnostic : ${diagnosis.summary}`);
    }

    // 2. Détection et suppression de TOUS les verrous session.lock résiduels
    const findLocks = (dir) => {
      let locks = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fp = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            locks = locks.concat(findLocks(fp));
          } else if (entry.name === 'session.lock') {
            locks.push(fp);
          }
        }
      } catch (_) {}
      return locks;
    };

    const locks = findLocks(worldPath);
    let removedLocksCount = 0;
    for (const lockPath of locks) {
      try {
        fs.unlinkSync(lockPath);
        removedLocksCount++;
      } catch (_) {}
    }
    if (removedLocksCount > 0) {
      fixes.push(`Suppression de ${removedLocksCount} verrou(s) session.lock obsolètes`);
      report.push(`${removedLocksCount} verrou(s) session.lock résiduels supprimés.`);
    }

    // 3. Nettoyage des fichiers de chunks, régions, poi et entités corrompus de 0 octet
    const findCorruptedZeroByteFiles = (dir) => {
      let zeroFiles = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fp = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'logs' && entry.name !== 'crash-reports') {
              zeroFiles = zeroFiles.concat(findCorruptedZeroByteFiles(fp));
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (['.mca', '.dat', '.tmp', '.lock'].includes(ext) || entry.name.endsWith('.mca')) {
              try {
                const stat = fs.statSync(fp);
                if (stat.size === 0) zeroFiles.push(fp);
              } catch (_) {}
            }
          }
        }
      } catch (_) {}
      return zeroFiles;
    };

    const zeroByteFiles = findCorruptedZeroByteFiles(worldPath);
    let cleanedZeroFilesCount = 0;
    for (const zf of zeroByteFiles) {
      try {
        fs.unlinkSync(zf);
        cleanedZeroFilesCount++;
      } catch (_) {}
    }
    if (cleanedZeroFilesCount > 0) {
      fixes.push(`Suppression de ${cleanedZeroFilesCount} fichier(s) de chunk/entités corrompus (0 octet)`);
      report.push(`${cleanedZeroFilesCount} fichier(s) de données corrompus de 0 octet supprimés.`);
    }

    // 4. Réparation et optimisation de server.properties (désactivation Watchdog & synchro disque)
    const propsPath = path.join(worldPath, 'server.properties');
    const isModded = fs.existsSync(path.join(worldPath, 'mods')) ||
                     fs.existsSync(path.join(worldPath, 'type.txt')) ||
                     fs.existsSync(path.join(worldPath, 'libraries')) ||
                     diagnosis.isWatchdog;

    let propsMap = new Map();
    if (fs.existsSync(propsPath)) {
      try {
        const lines = fs.readFileSync(propsPath, 'utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx !== -1) {
              const k = trimmed.substring(0, eqIdx).trim();
              const v = trimmed.substring(eqIdx + 1).trim();
              propsMap.set(k, v);
            }
          }
        }
      } catch (_) {}
    }

    let propsModified = false;
    // Désactivation du Watchdog pour empêcher Minecraft d'arrêter le serveur en cas de lag spike ou explosion
    if (isModded || diagnosis.isWatchdog) {
      if (propsMap.get('max-tick-time') !== '-1') {
        propsMap.set('max-tick-time', '-1');
        propsModified = true;
        fixes.push("Watchdog désactivé (max-tick-time=-1) pour autoriser les calculs lourds et éviter les crashs de lag");
        report.push("Paramètre max-tick-time=-1 appliqué dans server.properties (Server Watchdog désactivé).");
      }
    }

    // Optimisation écriture disque asynchrone
    if (propsMap.get('sync-chunk-writes') !== 'false') {
      propsMap.set('sync-chunk-writes', 'false');
      propsModified = true;
      fixes.push("Écriture des chunks asynchrone activée (sync-chunk-writes=false)");
    }

    // S'assurer de la présence du port et d'une config minimale
    if (!propsMap.has('server-port')) {
      propsMap.set('server-port', '25565');
      propsModified = true;
    }
    if (!propsMap.has('allow-flight')) {
      propsMap.set('allow-flight', 'true');
      propsModified = true;
    }

    if (propsModified || !fs.existsSync(propsPath)) {
      try {
        let newPropsContent = `# Minecraft Server Properties (Auto-repaired par Cubirium)\n`;
        for (const [k, v] of propsMap.entries()) {
          newPropsContent += `${k}=${v}\n`;
        }
        fs.writeFileSync(propsPath, newPropsContent, 'utf8');
        report.push("Fichier server.properties mis à jour et optimisé.");
      } catch (_) {}
    }

    // 5. Acceptation stricte du CLUF EULA
    const eulaPath = path.join(worldPath, 'eula.txt');
    try {
      fs.writeFileSync(eulaPath, 'eula=true\n', 'utf8');
      fixes.push("Contrat de licence EULA validé (eula=true)");
      report.push("Contrat de licence EULA confirmé.");
    } catch (_) {}

    // 6. Nettoyage des fichiers JSON de cache corrompus
    const jsonFilesToCheck = [
      { name: 'usercache.json', defaultContent: '[]' },
      { name: 'usernamecache.json', defaultContent: '{}' },
      { name: 'ops.json', defaultContent: '[]' },
      { name: 'whitelist.json', defaultContent: '[]' },
      { name: 'banned-players.json', defaultContent: '[]' },
      { name: 'banned-ips.json', defaultContent: '[]' }
    ];

    let jsonCleanedCount = 0;
    for (const jf of jsonFilesToCheck) {
      const jp = path.join(worldPath, jf.name);
      if (fs.existsSync(jp)) {
        try {
          const raw = fs.readFileSync(jp, 'utf8').trim();
          if (!raw) {
            fs.writeFileSync(jp, jf.defaultContent, 'utf8');
            jsonCleanedCount++;
          } else {
            JSON.parse(raw); // Tester la validité
          }
        } catch (_) {
          // Fichier JSON invalide suite au crash
          try {
            fs.writeFileSync(jp, jf.defaultContent, 'utf8');
            jsonCleanedCount++;
          } catch (__) {}
        }
      }
    }
    if (jsonCleanedCount > 0) {
      fixes.push(`${jsonCleanedCount} fichier(s) de cache JSON corrompus réinitialisés`);
      report.push(`${jsonCleanedCount} fichier(s) JSON invalides réinitialisés proprement.`);
    }

    // 7. Vérification des permissions d'exécution sur les scripts de démarrage
    const runShPath = path.join(worldPath, 'run.sh');
    const runBatPath = path.join(worldPath, 'run.bat');
    const serverJarPath = path.join(worldPath, 'server.jar');

    if (fs.existsSync(runShPath)) {
      try {
        fs.chmodSync(runShPath, 0o755);
        fixes.push("Permissions d'exécution rétablies sur run.sh (chmod +x)");
        report.push("Permissions d'exécution accordées à run.sh.");
      } catch (_) {}
    }

    // 8. Ajustement de la mémoire Java si crash OutOfMemory
    if (diagnosis.isOutOfMemory && fs.existsSync(runShPath)) {
      try {
        let shContent = fs.readFileSync(runShPath, 'utf8');
        if (shContent.includes('-Xmx')) {
          shContent = shContent.replace(/-Xmx[0-9]+[GMK]/g, '-Xmx6G');
          fs.writeFileSync(runShPath, shContent, 'utf8');
          fixes.push("Allocation mémoire augmentée à 6 Go (-Xmx6G) suite à OutOfMemory");
          report.push("Allocation de mémoire vive rehaussée à 6G dans run.sh.");
        }
      } catch (_) {}
    }

    // 9. Vérification des exécutables manquants
    if (!fs.existsSync(runShPath) && !fs.existsSync(serverJarPath) && !fs.existsSync(runBatPath)) {
      try {
        const vanillaInstaller = require('./vanilla-installer-service');
        const ver = this.getWorldVersion(worldId) || '26.3';
        await vanillaInstaller.installVanillaServer(worldId, ver, worldPath);
        fixes.push(`Exécutable serveur officiel (${ver}) réinstallé`);
        report.push(`Binaire officiel server.jar (${ver}) réinstallé avec succès.`);
      } catch (err) {
        this.worldHealth[worldId] = {
          status: 'corrupted',
          reason: `Impossible de réparer l'exécutable du serveur: ${err.message}`,
          lastCrashAt: Date.now()
        };
        return {
          success: false,
          corrupted: true,
          message: `Le monde est corrompu et ne peut pas être réparé automatiquement. (${err.message})`,
          report,
          fixes
        };
      }
    }

    // 10. Archiver le crash report résolu pour éviter les faux positifs ultérieurs
    const crashDir = path.join(worldPath, 'crash-reports');
    if (fs.existsSync(crashDir)) {
      try {
        const cFiles = fs.readdirSync(crashDir).filter(f => f.startsWith('crash-') && f.endsWith('.txt'));
        for (const cf of cFiles) {
          const srcCrash = path.join(crashDir, cf);
          const solvedCrash = path.join(crashDir, `${cf}.repaired`);
          try { fs.renameSync(srcCrash, solvedCrash); } catch (_) {}
        }
        report.push("Rapports de crash résolus archivés.");
      } catch (_) {}
    }

    // 11. Réinitialiser la santé du monde et avertir les clients connectés
    delete this.worldHealth[worldId];
    this.broadcast('world_health_changed', { worldId, health: { status: 'healthy' } });

    const summaryMessage = fixes.length > 0 
      ? `Monde réparé avec succès : ${fixes.slice(0, 2).join(', ')}.`
      : "Le monde et ses configurations ont été vérifiés et réparés avec succès.";

    return {
      success: true,
      corrupted: false,
      diagnosis: diagnosis.summary,
      suspectedMod: diagnosis.suspectedMod,
      fixes,
      message: summaryMessage,
      report
    };
  }

  /**
   * Création d'un nouveau monde (Vanilla ou Moddé avec filtrage)
   */
  async createWorld({ name, type, version, loader, sourcePath, overrideMods, seed, offline }) {
    const cleanId = (name && name.trim()) 
      ? name.trim().replace(/[^a-zA-Z0-9_-]/g, '-') 
      : this.getNextDefaultWorldName();
    const targetDir = path.join(this.gamesDir, cleanId);

    if (fs.existsSync(targetDir)) {
      const existingFiles = fs.readdirSync(targetDir).filter(f => f !== '.DS_Store');
      if (existingFiles.length > 0) {
        throw new Error(`Un monde nommé '${cleanId}' existe déjà dans games/`);
      }
    }

    const isOffline = !!offline;
    const customSeed = (seed && seed.trim()) ? seed.trim() : '';

    if (type === 'vanilla') {
      try {
        this.broadcast('install_progress', { progress: 5, msg: "Initialisation de l'installation Vanilla...", worldId: cleanId });
        // Installation Vanilla automatique
        const result = await vanillaInstaller.installVanillaServer(
          cleanId,
          version || '26.3',
          targetDir,
          (progress, msg) => {
            this.broadcast('install_progress', { progress, msg, worldId: cleanId });
          },
          { seed: customSeed, offline: isOffline }
        );
        this.broadcast('install_progress', { progress: 100, msg: `Monde Vanilla ${cleanId} prêt !`, worldId: cleanId });
        return { success: true, world: result };
      } catch (err) {
        if (fs.existsSync(targetDir)) {
          try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch (cleanupErr) {}
        }
        throw err;
      }
    }

    if (type === 'modded') {
      try {
        this.broadcast('install_progress', { progress: 5, msg: "Création du dossier du monde...", worldId: cleanId });
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(path.join(targetDir, 'type.txt'), 'modded\n', 'utf8');
        const modsDir = path.join(targetDir, 'mods');

        let filterReport = null;
        let detectedLoader = 'fabric';
        let detectedMcVersion = '1.21.1';

        if (sourcePath && fs.existsSync(sourcePath)) {
          this.broadcast('install_progress', { progress: 10, msg: "Analyse et filtrage intelligent des mods...", worldId: cleanId });
          const analysis = await modFilterService.analyze(sourcePath, (pct, msg) => {
            const scaled = 10 + Math.round(pct * 0.2); // 10% à 30%
            this.broadcast('install_progress', { progress: scaled, msg, worldId: cleanId });
          });
          filterReport = await modFilterService.deployServerMods(analysis, modsDir, overrideMods, (pct, msg) => {
            this.broadcast('install_progress', { progress: pct, msg, worldId: cleanId });
          });
          if (analysis.detectedLoader) detectedLoader = analysis.detectedLoader;
          if (analysis.detectedMcVersion) detectedMcVersion = analysis.detectedMcVersion;
        } else {
          fs.mkdirSync(modsDir, { recursive: true });
        }

        const effectiveVersion = version || detectedMcVersion || '1.21.1';
        const effectiveLoader = loader || detectedLoader || 'fabric';

        // Télécharger et installer le server.jar approprié (Fabric ou NeoForge)
        try {
          await modloaderInstaller.installModloaderServer({
            worldId: cleanId,
            mcVersion: effectiveVersion,
            loader: effectiveLoader,
            targetDir,
            onProgress: (pct, msg) => {
              this.broadcast('install_progress', { progress: pct, msg, worldId: cleanId });
            }
          });
        } catch (installErr) {
          console.warn(`[CreateWorld] Avertissement installation loader: ${installErr.message}`);
          const hasExecutable = fs.existsSync(path.join(targetDir, 'server.jar')) ||
            fs.existsSync(path.join(targetDir, 'run.sh')) ||
            fs.existsSync(path.join(targetDir, 'libraries'));
          if (!hasExecutable) {
            throw new Error(`Échec de l'installation du modloader (${effectiveLoader}): ${installErr.message}`);
          }
        }

      this.broadcast('install_progress', { progress: 95, msg: "Génération des configurations et scripts de lancement...", worldId: cleanId });
      // Configuration EULA
      fs.writeFileSync(path.join(targetDir, 'eula.txt'), 'eula=true\n', 'utf8');
      
      const appDefaults = configService.getSettings();
      const serverProps = `# Minecraft Modded server properties
server-port=25565
motd=Serveur Minecraft Moddé ${effectiveVersion}
max-players=20
max-tick-time=-1
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

      // Script de lancement multi-Java (Java 25 pour versions 26.x/25.x, Java 8 si <= 1.16.5, Java 21 sinon)
      const isJava25 = effectiveVersion.startsWith('26.') || effectiveVersion.startsWith('25.');
      const isLegacyJava8 = effectiveVersion.startsWith('1.7') || effectiveVersion.startsWith('1.8') ||
                            effectiveVersion.startsWith('1.9') || effectiveVersion.startsWith('1.10') ||
                            effectiveVersion.startsWith('1.11') || effectiveVersion.startsWith('1.12') ||
                            effectiveVersion.startsWith('1.13') || effectiveVersion.startsWith('1.14') ||
                            effectiveVersion.startsWith('1.15') || effectiveVersion.startsWith('1.16');
      const runScript = `#!/usr/bin/env sh
# Script de lancement Moddé (${effectiveLoader} - Minecraft ${effectiveVersion}) pour ${cleanId}

JAVA_CUBIRIUM="$HOME/Library/Application Support/Cubirium/runtime/java-21/bin/java"
JAVA_21="/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home/bin/java"
JAVA_25="/opt/homebrew/opt/openjdk@25/bin/java"
JAVA_8="/Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home/bin/java"

JAVA_BIN=""
${isJava25 ? `if [ -x "$JAVA_25" ]; then
    JAVA_BIN="$JAVA_25"
elif [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    JAVA_BIN="$JAVA_HOME/bin/java"
fi` : (isLegacyJava8 ? `if [ -x "$JAVA_8" ]; then
    JAVA_BIN="$JAVA_8"
elif [ -x "$JAVA_CUBIRIUM" ]; then
    JAVA_BIN="$JAVA_CUBIRIUM"
elif [ -x "$JAVA_21" ]; then
    JAVA_BIN="$JAVA_21"
elif [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    JAVA_BIN="$JAVA_HOME/bin/java"
fi` : `if [ -x "$JAVA_CUBIRIUM" ]; then
    JAVA_BIN="$JAVA_CUBIRIUM"
elif [ -x "$JAVA_21" ]; then
    JAVA_BIN="$JAVA_21"
elif [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    JAVA_BIN="$JAVA_HOME/bin/java"
fi`)}

if [ -z "$JAVA_BIN" ] && command -v java >/dev/null 2>&1; then
    JAVA_BIN="java"
fi

if [ -z "$JAVA_BIN" ]; then
    echo "Erreur: Aucun runtime Java valide trouvé sur le système."
    exit 1
fi

JAVA_VER_STR=$("$JAVA_BIN" -version 2>&1 | head -n 1)
echo "Démarrage du serveur moddé (${effectiveLoader} MC ${effectiveVersion}) avec $JAVA_VER_STR"

exec "$JAVA_BIN" -Xmx6G -Xms3G \\
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
  ${(() => {
    // Si NeoForge a produit un unix_args.txt
    const libDir = path.join(targetDir, 'libraries');
    let unixArgsPath = null;
    if (fs.existsSync(libDir)) {
      const search = (d) => {
        try {
          for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, ent.name);
            if (ent.isDirectory()) search(p);
            else if (ent.isFile() && ent.name === 'unix_args.txt') {
              unixArgsPath = path.relative(targetDir, p);
            }
          }
        } catch (e) {}
      };
      search(libDir);
    }
    if (unixArgsPath) {
      return `@${unixArgsPath} nogui "$@"`;
    }
    return `-jar server.jar nogui "$@"`;
  })()}
`;
      fs.writeFileSync(path.join(targetDir, 'run.sh'), runScript, { mode: 0o755 });

      // Script de lancement Windows (run.bat) pour serveurs moddés
      const winArgsPart = (() => {
        const libDir = path.join(targetDir, 'libraries');
        let winArgsPath = null;
        if (fs.existsSync(libDir)) {
          const search = (d) => {
            try {
              for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
                const p = path.join(d, ent.name);
                if (ent.isDirectory()) search(p);
                else if (ent.isFile() && (ent.name === 'win_args.txt' || ent.name === 'unix_args.txt')) {
                  winArgsPath = path.relative(targetDir, p).replace(/\//g, '\\');
                }
              }
            } catch (e) {}
          };
          search(libDir);
        }
        if (winArgsPath) {
          return `@${winArgsPath} nogui %*`;
        }
        return `-jar server.jar nogui %*`;
      })();

      const runBatScript = `@echo off
rem Script de lancement Moddé (${effectiveLoader} - Minecraft ${effectiveVersion}) pour ${cleanId}
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
"%JAVA_EXEC%" -Xmx6G -Xms3G -Djava.net.preferIPv4Stack=true -Djava.util.concurrent.ForkJoinPool.common.parallelism=6 -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=50 -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1ReservePercent=20 -XX:+DisableExplicitGC ${winArgsPart}
`;
      fs.writeFileSync(path.join(targetDir, 'run.bat'), runBatScript, 'utf8');

      this.broadcast('install_progress', { progress: 100, msg: `Monde moddé '${cleanId}' créé et configuré avec succès !`, worldId: cleanId });

        return {
          success: true,
          worldId: cleanId,
          path: targetDir,
          version: effectiveVersion,
          loader: effectiveLoader,
          filterReport
        };
      } catch (err) {
        if (fs.existsSync(targetDir)) {
          try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch (cleanupErr) {}
        }
        throw err;
      }
    }

    throw new Error(`Type de monde inconnu: ${type}`);
  }

  /**
   * Récupère le contenu de server.properties pour un monde
   */
  async getWorldProperties(worldId) {
    const worldPath = path.join(this.gamesDir, worldId);
    const propsPath = path.join(worldPath, 'server.properties');
    if (!fs.existsSync(propsPath)) {
      return { exists: false, content: '' };
    }
    const content = fs.readFileSync(propsPath, 'utf8');
    return { exists: true, content };
  }

  /**
   * Sauvegarde le contenu de server.properties pour un monde
   */
  async saveWorldProperties(worldId, content) {
    const worldPath = path.join(this.gamesDir, worldId);
    if (!fs.existsSync(worldPath)) {
      throw new Error(`Monde introuvable: ${worldId}`);
    }
    const propsPath = path.join(worldPath, 'server.properties');
    fs.writeFileSync(propsPath, content, 'utf8');
    return { success: true };
  }

  /**
   * Renomme le dossier d'un monde dans games/
   */
  /**
   * Renomme le dossier d'un monde dans games/
   */
  async renameWorld(worldId, newName) {
    if (this.activeWorld === worldId && this.status !== 'STOPPED') {
      throw new Error(`Impossible de renommer le monde '${worldId}' pendant qu'il est en cours d'exécution. Arrêtez-le d'abord.`);
    }

    const cleanNewName = newName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '-');
    if (!cleanNewName) {
      throw new Error('Le nouveau nom est invalide.');
    }

    const oldPath = path.join(this.gamesDir, worldId);
    const newPath = path.join(this.gamesDir, cleanNewName);

    if (!fs.existsSync(oldPath)) {
      throw new Error(`Monde introuvable: ${worldId}`);
    }

    // Si le nom est exactement le même avec la même casse, rien à faire
    if (worldId === cleanNewName) {
      return { success: true, oldId: worldId, newId: cleanNewName };
    }

    const isCaseOnlyChange = (worldId.toLowerCase() === cleanNewName.toLowerCase());

    // Sur macOS APFS (insensible à la casse), fs.existsSync(newPath) renvoie true si seule la casse diffère.
    // On ne bloque que si ce n'est PAS un simple changement de casse d'un même dossier.
    if (!isCaseOnlyChange && fs.existsSync(newPath)) {
      throw new Error(`Un monde nommé '${cleanNewName}' existe déjà.`);
    }

    if (isCaseOnlyChange) {
      // Pour forcer la mise à jour de la casse sur un système de fichiers insensible à la casse (APFS),
      // on passe par un dossier intermédiaire temporaire.
      const tempPath = path.join(this.gamesDir, `__temp_rename_${Date.now()}_${cleanNewName}`);
      fs.renameSync(oldPath, tempPath);
      fs.renameSync(tempPath, newPath);
    } else {
      fs.renameSync(oldPath, newPath);
    }

    if (this.activeWorld === worldId) {
      this.activeWorld = cleanNewName;
    }

    return { success: true, oldId: worldId, newId: cleanNewName };
  }

  /**
   * Supprime définitivement un monde dans games/
   */
  async deleteWorld(worldId) {
    if (this.status !== 'STOPPED' && this.activeWorld === worldId) {
      throw new Error(`Le serveur '${worldId}' est actuellement en cours d'exécution. Arrête-le d'abord pour pouvoir le supprimer.`);
    }

    // Sécurité contre path traversal
    const safeWorldId = path.basename(worldId);
    if (!safeWorldId || safeWorldId.includes('..') || safeWorldId === '.' || safeWorldId === '/') {
      throw new Error('Identifiant de monde invalide.');
    }

    const worldPath = path.join(this.gamesDir, safeWorldId);
    if (!fs.existsSync(worldPath)) {
      throw new Error(`Monde introuvable: ${safeWorldId}`);
    }

    // Supprimer le répertoire de manière récursive
    fs.rmSync(worldPath, { recursive: true, force: true });

    if (this.activeWorld === safeWorldId) {
      this.activeWorld = null;
    }

    return { success: true, deletedId: safeWorldId };
  }

  /**
   * Helper pour lire un fichier JSON sécurisé dans un monde
   */
  readJsonFile(worldPath, filename, fallback = []) {
    const filePath = path.join(worldPath, filename);
    if (!fs.existsSync(filePath)) return fallback;
    try {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      return content ? JSON.parse(content) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  /**
   * Helper pour écrire un fichier JSON dans un monde
   */
  writeJsonFile(worldPath, filename, data) {
    const filePath = path.join(worldPath, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * Vérifie si un joueur est actuellement connecté en ligne (avec synchronisation de secours si besoin)
   */
  isPlayerOnline(worldId, playerName) {
    if (!worldId || !playerName) return false;
    const isThisWorldActive = (this.activeWorld === worldId) && (this.status === 'RUNNING' || this.activeProcess);
    if (!isThisWorldActive) return false;

    if (this.players.length === 0) {
      const worldPath = path.join(this.gamesDir, worldId);
      this.syncPlayersFromLog(worldPath);
    }
    return this.players.some(p => p.toLowerCase() === playerName.trim().toLowerCase());
  }

  /**
   * Récupère toutes les données de joueurs (Gestionnaire de Joueurs)
   */
  async getPlayersData(worldId) {
    const worldPath = path.join(this.gamesDir, worldId);
    if (!fs.existsSync(worldPath)) {
      throw new Error(`Monde introuvable: ${worldId}`);
    }

    const ops = this.readJsonFile(worldPath, 'ops.json', []);
    const whitelist = this.readJsonFile(worldPath, 'whitelist.json', []);
    const bannedPlayers = this.readJsonFile(worldPath, 'banned-players.json', []);
    const bannedIps = this.readJsonFile(worldPath, 'banned-ips.json', []);

    // Joueurs actuellement connectés si ce monde est en ligne
    if (this.activeWorld === worldId && (this.status === 'RUNNING' || this.activeProcess)) {
      this.triggerSilentList(worldId);
      this.triggerSilentSave(worldId);
      if (this.players.length === 0) {
        this.syncPlayersFromLog(worldPath);
      }
    }

    const online = (this.activeWorld === worldId) ? this.players : [];

    // Agrégation de tous les joueurs connus (usercache, playerdata, ops, whitelist, bans, online)
    const allPlayersMap = new Map();

    const usercache = this.readJsonFile(worldPath, 'usercache.json', []);
    if (Array.isArray(usercache)) {
      usercache.forEach(u => {
        if (u && u.name) {
          allPlayersMap.set(u.name.toLowerCase(), {
            name: u.name,
            uuid: u.uuid || ''
          });
        }
      });
    }

    // Support de usernamecache.json (Format standard Forge et NeoForge : { uuid: playerName })
    const usernamecache = this.readJsonFile(worldPath, 'usernamecache.json', {});
    if (usernamecache && typeof usernamecache === 'object' && !Array.isArray(usernamecache)) {
      Object.entries(usernamecache).forEach(([uuid, name]) => {
        if (name && typeof name === 'string') {
          allPlayersMap.set(name.toLowerCase(), {
            name,
            uuid: uuid || ''
          });
        }
      });
    }

    // Fichiers playerdata
    let levelName = 'world';
    const propsPath = path.join(worldPath, 'server.properties');
    if (fs.existsSync(propsPath)) {
      const match = fs.readFileSync(propsPath, 'utf8').match(/^level-name\s*=\s*(.+)$/m);
      if (match && match[1]) levelName = match[1].trim();
    }
    const worldDataFolder = this.getWorldDataFolder(worldPath);
    const candidatePlayerDirs = [
      path.join(worldDataFolder, 'playerdata'),
      path.join(worldDataFolder, 'players', 'data'),
      path.join(worldPath, levelName, 'players', 'data'),
      path.join(worldPath, 'world', 'players', 'data'),
      path.join(worldPath, levelName, 'playerdata'),
      path.join(worldPath, 'world', 'playerdata')
    ];

    for (const playerdataDir of candidatePlayerDirs) {
      if (fs.existsSync(playerdataDir)) {
        try {
          const files = fs.readdirSync(playerdataDir).filter(f => f.endsWith('.dat') && !f.endsWith('.dat_old'));
          for (const file of files) {
            const uuid = path.basename(file, '.dat');
            const already = Array.from(allPlayersMap.values()).find(p => p.uuid === uuid);
            if (!already) {
              const entry = Array.isArray(usercache) ? usercache.find(u => u.uuid === uuid) : null;
              let name = entry ? entry.name : null;
              if (!name && usernamecache && usernamecache[uuid]) {
                name = usernamecache[uuid];
              }
              if (!name) name = uuid;
              allPlayersMap.set(name.toLowerCase(), { name, uuid });
            }
          }
        } catch (e) {}
      }
    }

    // Ops
    ops.forEach(o => {
      const name = o.name || o;
      if (name && !allPlayersMap.has(name.toLowerCase())) {
        allPlayersMap.set(name.toLowerCase(), { name, uuid: o.uuid || '' });
      }
    });

    // Whitelist
    whitelist.forEach(w => {
      const name = w.name || w;
      if (name && !allPlayersMap.has(name.toLowerCase())) {
        allPlayersMap.set(name.toLowerCase(), { name, uuid: w.uuid || '' });
      }
    });

    // Bannis
    bannedPlayers.forEach(b => {
      const name = b.name || b;
      if (name && !allPlayersMap.has(name.toLowerCase())) {
        allPlayersMap.set(name.toLowerCase(), { name, uuid: b.uuid || '' });
      }
    });

    // En ligne
    online.forEach(onl => {
      const name = typeof onl === 'string' ? onl : (onl.name || onl);
      if (name && !allPlayersMap.has(name.toLowerCase())) {
        allPlayersMap.set(name.toLowerCase(), { name, uuid: '' });
      }
    });

    const onlineSet = new Set(online.map(p => (typeof p === 'string' ? p : p.name).toLowerCase()));
    const opSet = new Set(ops.map(p => (p.name || p).toLowerCase()));
    const whiteSet = new Set(whitelist.map(p => (p.name || p).toLowerCase()));
    const banSet = new Set(bannedPlayers.map(p => (p.name || p).toLowerCase()));

    const players = Array.from(allPlayersMap.values()).map(p => {
      const lower = p.name.toLowerCase();
      return {
        name: p.name,
        uuid: p.uuid,
        isOnline: onlineSet.has(lower),
        isOp: opSet.has(lower),
        isWhitelisted: whiteSet.has(lower),
        isBanned: banSet.has(lower)
      };
    });

    // Tri : en ligne d'abord, puis par ordre alphabétique
    players.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      worldId,
      players,
      ops,
      whitelist,
      bannedPlayers,
      bannedIps,
      online
    };
  }

  /**
   * Synchronise les joueurs en ligne à partir de logs/latest.log si besoin
   */
  syncPlayersFromLog(worldPath) {
    try {
      const logFile = path.join(worldPath, 'logs', 'latest.log');
      if (!fs.existsSync(logFile)) return;
      const lines = fs.readFileSync(logFile, 'utf8').split('\n');
      const active = new Set();
      for (const rawLine of lines) {
        const line = rawLine.replace(/\x1b\[[0-9;]*m/g, '');
        if (!line.includes('[Server thread/INFO]')) continue;
        
        const joinMatch = line.match(/:\s*(?:System chat:\s*)?([a-zA-Z0-9_]{2,16})\s+joined the game/i)
                       || line.match(/:\s*([a-zA-Z0-9_]{2,16})(?:\[.*?\])?\s+logged in with entity id/i);
        if (joinMatch && joinMatch[1] && joinMatch[1] !== 'System') {
          active.add(joinMatch[1]);
          continue;
        }

        const leaveMatch = line.match(/:\s*(?:System chat:\s*)?([a-zA-Z0-9_]{2,16})\s+left the game/i)
                        || line.match(/name=([a-zA-Z0-9_]{2,16})[,\s\]].*?lost connection/i)
                        || line.match(/:\s*([a-zA-Z0-9_]{2,16})(?:\s*\(.*?\))?\s+lost connection/i);
        if (leaveMatch && leaveMatch[1] && leaveMatch[1] !== 'System') {
          active.delete(leaveMatch[1]);
          continue;
        }
      }
      this.players = Array.from(active);
    } catch (e) {}
  }

  /**
   * Ajoute un joueur ou une IP à une liste
   */
  async addPlayer(worldId, listType, nameOrIp, reason = '') {
    const worldPath = path.join(this.gamesDir, worldId);
    if (!fs.existsSync(worldPath)) {
      throw new Error(`Monde introuvable: ${worldId}`);
    }

    const isRunning = (this.activeWorld === worldId && this.status === 'RUNNING');
    const target = nameOrIp.trim();
    if (!target) throw new Error('Nom ou IP requis');

    const fakeUuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

    if (listType === 'ops') {
      const ops = this.readJsonFile(worldPath, 'ops.json', []);
      const existing = ops.find(o => o.name && o.name.toLowerCase() === target.toLowerCase());
      if (!existing) {
        ops.push({
          uuid: fakeUuid(),
          name: target,
          level: 4,
          bypassesPlayerLimit: false
        });
        this.writeJsonFile(worldPath, 'ops.json', ops);
      }
      if (isRunning) this.sendCommand(`op ${target}`);
      return { success: true, list: 'ops', item: target };
    }

    if (listType === 'whitelist') {
      const wl = this.readJsonFile(worldPath, 'whitelist.json', []);
      const existing = wl.find(w => w.name && w.name.toLowerCase() === target.toLowerCase());
      if (!existing) {
        wl.push({
          uuid: fakeUuid(),
          name: target
        });
        this.writeJsonFile(worldPath, 'whitelist.json', wl);
      }
      if (isRunning) {
        this.sendCommand(`whitelist add ${target}`);
        this.sendCommand(`whitelist reload`);
      }
      return { success: true, list: 'whitelist', item: target };
    }

    if (listType === 'bannedPlayers') {
      const bans = this.readJsonFile(worldPath, 'banned-players.json', []);
      const existing = bans.find(b => b.name && b.name.toLowerCase() === target.toLowerCase());
      if (!existing) {
        bans.push({
          uuid: fakeUuid(),
          name: target,
          created: new Date().toISOString(),
          source: 'Server Manager',
          expires: 'forever',
          reason: reason || 'Banni par un administrateur'
        });
        this.writeJsonFile(worldPath, 'banned-players.json', bans);
      }
      if (isRunning) this.sendCommand(`ban ${target} ${reason || ''}`);
      return { success: true, list: 'bannedPlayers', item: target };
    }

    if (listType === 'bannedIps') {
      const banIps = this.readJsonFile(worldPath, 'banned-ips.json', []);
      const existing = banIps.find(b => b.ip === target);
      if (!existing) {
        banIps.push({
          ip: target,
          created: new Date().toISOString(),
          source: 'Server Manager',
          expires: 'forever',
          reason: reason || 'Banni par un administrateur'
        });
        this.writeJsonFile(worldPath, 'banned-ips.json', banIps);
      }
      if (isRunning) this.sendCommand(`ban-ip ${target} ${reason || ''}`);
      return { success: true, list: 'bannedIps', item: target };
    }

    throw new Error(`Type de liste inconnu: ${listType}`);
  }

  /**
   * Retire un joueur ou une IP d'une liste
   */
  async removePlayer(worldId, listType, identifier) {
    const worldPath = path.join(this.gamesDir, worldId);
    if (!fs.existsSync(worldPath)) {
      throw new Error(`Monde introuvable: ${worldId}`);
    }

    const isRunning = (this.activeWorld === worldId && this.status === 'RUNNING');
    const target = identifier.trim();

    if (listType === 'ops') {
      let ops = this.readJsonFile(worldPath, 'ops.json', []);
      ops = ops.filter(o => o.name && o.name.toLowerCase() !== target.toLowerCase() && o.uuid !== target);
      this.writeJsonFile(worldPath, 'ops.json', ops);
      if (isRunning) this.sendCommand(`deop ${target}`);
      return { success: true, list: 'ops', item: target };
    }

    if (listType === 'whitelist') {
      let wl = this.readJsonFile(worldPath, 'whitelist.json', []);
      wl = wl.filter(w => w.name && w.name.toLowerCase() !== target.toLowerCase() && w.uuid !== target);
      this.writeJsonFile(worldPath, 'whitelist.json', wl);
      if (isRunning) {
        this.sendCommand(`whitelist remove ${target}`);
        this.sendCommand(`whitelist reload`);
      }
      return { success: true, list: 'whitelist', item: target };
    }

    if (listType === 'bannedPlayers') {
      let bans = this.readJsonFile(worldPath, 'banned-players.json', []);
      bans = bans.filter(b => b.name && b.name.toLowerCase() !== target.toLowerCase() && b.uuid !== target);
      this.writeJsonFile(worldPath, 'banned-players.json', bans);
      if (isRunning) this.sendCommand(`pardon ${target}`);
      return { success: true, list: 'bannedPlayers', item: target };
    }

    if (listType === 'bannedIps') {
      let banIps = this.readJsonFile(worldPath, 'banned-ips.json', []);
      banIps = banIps.filter(b => b.ip !== target);
      this.writeJsonFile(worldPath, 'banned-ips.json', banIps);
      if (isRunning) this.sendCommand(`pardon-ip ${target}`);
      return { success: true, list: 'bannedIps', item: target };
    }

    throw new Error(`Type de liste inconnu: ${listType}`);
  }

  /**
   * Expulse (kick) un joueur du serveur en direct
   */
  /**
   * Expulse (kick) un joueur du serveur en direct
   */
  async kickPlayer(worldId, name, reason = 'Expulsé par un opérateur') {
    if (this.activeWorld !== worldId || this.status !== 'RUNNING') {
      throw new Error(`Le serveur n'est pas actif.`);
    }
    this.sendCommand(`kick ${name.trim()} ${reason}`);
    return { success: true, name, reason };
  }

  /**
   * Réinitialise une dimension (Overworld, Nether, End ou custom mod)
   */
  async resetDimension(worldId, dimensionId) {
    if (this.activeWorld === worldId && this.status !== 'STOPPED') {
      throw new Error('Impossible de réinitialiser une dimension pendant que le serveur est allumé. Arrête-le d’abord.');
    }
    const worldPath = path.join(this.gamesDir, worldId);
    if (!fs.existsSync(worldPath)) throw new Error('Monde introuvable.');

    const worldDataFolder = this.getWorldDataFolder(worldPath);

    if (dimensionId === 'overworld') {
      const dirsToRemove = ['region', 'entities', 'poi'];
      for (const d of dirsToRemove) {
        const p = path.join(worldDataFolder, d);
        if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
      }
      return { success: true, message: "L'Overworld a été réinitialisé avec succès !" };
    }

    if (dimensionId === 'nether') {
      const netherCandidates = [
        path.join(worldDataFolder, 'DIM-1'),
        path.join(worldPath, path.basename(worldDataFolder) + '_nether'),
        path.join(worldPath, 'world_nether')
      ];
      for (const nPath of netherCandidates) {
        if (fs.existsSync(nPath)) fs.rmSync(nPath, { recursive: true, force: true });
      }
      return { success: true, message: 'Le Nether a été réinitialisé avec succès !' };
    }

    if (dimensionId === 'the_end') {
      const endCandidates = [
        path.join(worldDataFolder, 'DIM1'),
        path.join(worldPath, path.basename(worldDataFolder) + '_the_end'),
        path.join(worldPath, 'world_the_end')
      ];
      for (const ePath of endCandidates) {
        if (fs.existsSync(ePath)) fs.rmSync(ePath, { recursive: true, force: true });
      }
      return { success: true, message: "L'End a été réinitialisé avec succès !" };
    }

    throw new Error('Dimension non reconnue. Seuls l’Overworld, le Nether et l’End peuvent être réinitialisés.');
  }

  /**
   * Compresse et exporte un monde au format zip vers le dossier choisi (Téléchargements par défaut)
   * et ouvre automatiquement le Finder sur le fichier créé
   */
  async exportWorldZip(worldId, destDir = null) {
    const worldPath = path.join(this.gamesDir, worldId);
    if (!fs.existsSync(worldPath)) throw new Error('Monde introuvable.');

    // 1. Sauvegarde et synchronisation des données joueurs et du runtime si le monde est en cours d'exécution
    if (this.activeWorld === worldId && (this.status === 'RUNNING' || this.serverProcess)) {
      try {
        this.sendCommand('save-all flush');
      } catch (_) {}
    }

    const runtimeInfo = this.getWorldRuntimeInfo(worldId);
    let totalRuntime = runtimeInfo.totalRuntime;
    let lastStartedAt = runtimeInfo.lastStartedAt;
    if (this.activeWorld === worldId && (this.status === 'RUNNING' || this.serverProcess)) {
      const elapsed = this.startTime ? Math.max(0, Math.floor((Date.now() - this.startTime) / 1000)) : 0;
      totalRuntime += elapsed;
      if (this.startTime) lastStartedAt = this.startTime;
    }
    this.saveWorldRuntime(worldId, totalRuntime, lastStartedAt);

    // Écriture garantie de world_info.json et runtime.json pour assurer la conservation
    try {
      const infoPayload = JSON.stringify({
        worldId,
        totalRuntime,
        lastStartedAt,
        exportedAt: Date.now()
      }, null, 2);
      fs.writeFileSync(path.join(worldPath, 'world_info.json'), infoPayload, 'utf8');
      fs.writeFileSync(path.join(worldPath, 'runtime.json'), infoPayload, 'utf8');
      fs.writeFileSync(path.join(worldPath, '.runtime.json'), infoPayload, 'utf8');
    } catch (_) {}

    // 2. Synchronisation et garantie d'existence des logs du terminal
    const logsDir = path.join(worldPath, 'logs');
    if (!fs.existsSync(logsDir)) {
      try { fs.mkdirSync(logsDir, { recursive: true }); } catch (_) {}
    }
    const logFilePath = path.join(logsDir, 'latest.log');
    if (this.worldLogs[worldId] && this.worldLogs[worldId].length > 0) {
      try {
        if (!fs.existsSync(logFilePath)) {
          fs.writeFileSync(logFilePath, this.worldLogs[worldId].join('\n') + '\n', 'utf8');
        } else {
          const existing = fs.readFileSync(logFilePath, 'utf8');
          if (!existing.trim()) {
            fs.writeFileSync(logFilePath, this.worldLogs[worldId].join('\n') + '\n', 'utf8');
          }
        }
      } catch (_) {}
    }

    const os = require('os');
    const crypto = require('crypto');
    let targetDir = destDir ? String(destDir).trim() : null;
    if (!targetDir) {
      targetDir = configService.getSettings().downloadPath || path.join(os.homedir(), 'Downloads');
    }
    if (targetDir.startsWith('~')) {
      targetDir = path.join(os.homedir(), targetDir.slice(1));
    }
    targetDir = path.resolve(targetDir);
    if (!fs.existsSync(targetDir)) {
      try { fs.mkdirSync(targetDir, { recursive: true }); } catch (e) {}
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}h${pad(now.getMinutes())}`;
    const zipFileName = `${worldId}_sauvegarde_${dateStr}.zip`;
    let destZipPath = path.join(targetDir, zipFileName);

    let writtenDirectly = false;
    let fallbackTmpPath = null;
    let fileSize = 0;

    // 1. Tente l'écriture directe dans targetDir (conserve logs, runtime et joueurs)
    try {
      if (fs.existsSync(destZipPath)) {
        try { fs.unlinkSync(destZipPath); } catch (e) {}
      }
      execSync(`cd "${this.gamesDir}" && zip -r "${destZipPath}" "${worldId}" -x "*.DS_Store" "*__MACOSX*" "*.Spotlight-V100*" "*.Trashes*"`, {
        maxBuffer: 1024 * 1024 * 500
      });
      if (fs.existsSync(destZipPath)) {
        fileSize = fs.statSync(destZipPath).size;
        writtenDirectly = true;
      }
    } catch (zipErr) {
      // 2. Si l'écriture directe dans targetDir a échoué (droits système/sandbox), compresser dans os.tmpdir()
      const tmpZip = path.join(os.tmpdir(), `${zipFileName}`);
      if (fs.existsSync(tmpZip)) {
        try { fs.unlinkSync(tmpZip); } catch (e) {}
      }
      try {
        execSync(`cd "${this.gamesDir}" && zip -r "${tmpZip}" "${worldId}" -x "*.DS_Store" "*__MACOSX*" "*.Spotlight-V100*" "*.Trashes*"`, {
          maxBuffer: 1024 * 1024 * 500
        });
        if (fs.existsSync(tmpZip)) {
          fileSize = fs.statSync(tmpZip).size;
          // Tente une copie dans targetDir
          try {
            fs.copyFileSync(tmpZip, destZipPath);
            writtenDirectly = true;
            try { fs.unlinkSync(tmpZip); } catch (e) {}
          } catch (copyErr) {
            // L'accès direct au dossier Downloads est restreint au niveau filesystem (sandbox macOS) :
            // Nous gardons tmpZip et déléguons le téléchargement direct au navigateur web vers ~/Downloads
            fallbackTmpPath = tmpZip;
          }
        }
      } catch (tmpZipErr) {
        throw new Error(`Erreur lors de la compression du monde : ${tmpZipErr.message}`);
      }
    }

    const formattedSize = formatWorldSizeFrench(this.formatBytes(fileSize));

    if (writtenDirectly && fs.existsSync(destZipPath)) {
      revealFileInOs(destZipPath);
      return {
        success: true,
        filePath: destZipPath,
        fileName: zipFileName,
        destDir: targetDir,
        size: formattedSize,
        bytes: fileSize,
        needsBrowserDownload: false
      };
    }

    if (fallbackTmpPath && fs.existsSync(fallbackTmpPath)) {
      const token = crypto.randomBytes(16).toString('hex');
      this.pendingExportDownloads.set(token, {
        filePath: fallbackTmpPath,
        fileName: zipFileName,
        createdAt: Date.now()
      });
      // Nettoyage automatique après 10 minutes
      setTimeout(() => {
        if (this.pendingExportDownloads.has(token)) {
          const entry = this.pendingExportDownloads.get(token);
          this.pendingExportDownloads.delete(token);
          try { fs.unlinkSync(entry.filePath); } catch (e) {}
        }
      }, 600000);

      return {
        success: true,
        filePath: destZipPath,
        fileName: zipFileName,
        destDir: targetDir,
        size: formattedSize,
        bytes: fileSize,
        needsBrowserDownload: true,
        downloadUrl: `/api/worlds/download-export?token=${token}&file=${encodeURIComponent(zipFileName)}`
      };
    }

    throw new Error(`Impossible de générer l'archive de sauvegarde.`);
  }

  /**
   * Compresse et exporte TOUS les mondes dans une archive zip unique (sauvegarde pré-désinstallation ou manuelle)
   */
  async exportAllWorldsZip(destDir = null) {
    if (!fs.existsSync(this.gamesDir)) throw new Error('Aucun dossier de mondes présent.');
    const entries = fs.readdirSync(this.gamesDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'));
    if (entries.length === 0) throw new Error('Aucun monde Minecraft présent à exporter.');

    // Préparer et synchroniser runtime, logs et joueurs pour chaque monde avant archivage
    for (const ent of entries) {
      const wId = ent.name;
      const wPath = path.join(this.gamesDir, wId);
      if (this.activeWorld === wId && (this.status === 'RUNNING' || this.serverProcess)) {
        try { this.sendCommand('save-all flush'); } catch (_) {}
      }
      const runtimeInfo = this.getWorldRuntimeInfo(wId);
      let totalRuntime = runtimeInfo.totalRuntime;
      let lastStartedAt = runtimeInfo.lastStartedAt;
      if (this.activeWorld === wId && (this.status === 'RUNNING' || this.serverProcess)) {
        const elapsed = this.startTime ? Math.max(0, Math.floor((Date.now() - this.startTime) / 1000)) : 0;
        totalRuntime += elapsed;
        if (this.startTime) lastStartedAt = this.startTime;
      }
      this.saveWorldRuntime(wId, totalRuntime, lastStartedAt);

      try {
        const infoPayload = JSON.stringify({
          worldId: wId,
          totalRuntime,
          lastStartedAt,
          exportedAt: Date.now()
        }, null, 2);
        fs.writeFileSync(path.join(wPath, 'world_info.json'), infoPayload, 'utf8');
        fs.writeFileSync(path.join(wPath, 'runtime.json'), infoPayload, 'utf8');
        fs.writeFileSync(path.join(wPath, '.runtime.json'), infoPayload, 'utf8');
      } catch (_) {}

      const logsDir = path.join(wPath, 'logs');
      if (!fs.existsSync(logsDir)) {
        try { fs.mkdirSync(logsDir, { recursive: true }); } catch (_) {}
      }
      const logFilePath = path.join(logsDir, 'latest.log');
      if (this.worldLogs[wId] && this.worldLogs[wId].length > 0) {
        try {
          if (!fs.existsSync(logFilePath)) {
            fs.writeFileSync(logFilePath, this.worldLogs[wId].join('\n') + '\n', 'utf8');
          } else {
            const existing = fs.readFileSync(logFilePath, 'utf8');
            if (!existing.trim()) {
              fs.writeFileSync(logFilePath, this.worldLogs[wId].join('\n') + '\n', 'utf8');
            }
          }
        } catch (_) {}
      }
    }

    const os = require('os');
    const crypto = require('crypto');
    let targetDir = destDir ? String(destDir).trim() : null;
    if (!targetDir) {
      targetDir = configService.getSettings().downloadPath || path.join(os.homedir(), 'Downloads');
    }
    if (targetDir.startsWith('~')) {
      targetDir = path.join(os.homedir(), targetDir.slice(1));
    }
    targetDir = path.resolve(targetDir);
    if (!fs.existsSync(targetDir)) {
      try { fs.mkdirSync(targetDir, { recursive: true }); } catch (e) {}
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}h${pad(now.getMinutes())}`;
    const zipFileName = `Sauvegarde_Tous_Les_Mondes_${dateStr}.zip`;
    let destZipPath = path.join(targetDir, zipFileName);

    let writtenDirectly = false;
    let fallbackTmpPath = null;
    let fileSize = 0;

    try {
      if (fs.existsSync(destZipPath)) {
        try { fs.unlinkSync(destZipPath); } catch (e) {}
      }
      execSync(`cd "${this.gamesDir}" && zip -r "${destZipPath}" . -x "*.DS_Store" "*__MACOSX*" "*.Spotlight-V100*" "*.Trashes*"`, {
        maxBuffer: 1024 * 1024 * 1000
      });
      if (fs.existsSync(destZipPath)) {
        fileSize = fs.statSync(destZipPath).size;
        writtenDirectly = true;
      }
    } catch (zipErr) {
      const tmpZip = path.join(os.tmpdir(), `${zipFileName}`);
      if (fs.existsSync(tmpZip)) {
        try { fs.unlinkSync(tmpZip); } catch (e) {}
      }
      try {
        execSync(`cd "${this.gamesDir}" && zip -r "${tmpZip}" . -x "*.DS_Store" "*__MACOSX*" "*.Spotlight-V100*" "*.Trashes*"`, {
          maxBuffer: 1024 * 1024 * 1000
        });
        if (fs.existsSync(tmpZip)) {
          fileSize = fs.statSync(tmpZip).size;
          try {
            fs.copyFileSync(tmpZip, destZipPath);
            writtenDirectly = true;
            try { fs.unlinkSync(tmpZip); } catch (e) {}
          } catch (copyErr) {
            fallbackTmpPath = tmpZip;
          }
        }
      } catch (tmpZipErr) {
        throw new Error(`Erreur lors de la compression des mondes : ${tmpZipErr.message}`);
      }
    }

    const formattedSize = formatWorldSizeFrench(this.formatBytes(fileSize));

    if (writtenDirectly && fs.existsSync(destZipPath)) {
      revealFileInOs(destZipPath);
      return {
        success: true,
        count: entries.length,
        filePath: destZipPath,
        fileName: zipFileName,
        destDir: targetDir,
        size: formattedSize,
        bytes: fileSize,
        needsBrowserDownload: false
      };
    }

    if (fallbackTmpPath && fs.existsSync(fallbackTmpPath)) {
      const token = crypto.randomBytes(16).toString('hex');
      this.pendingExportDownloads.set(token, {
        filePath: fallbackTmpPath,
        fileName: zipFileName,
        createdAt: Date.now()
      });
      setTimeout(() => {
        if (this.pendingExportDownloads.has(token)) {
          const entry = this.pendingExportDownloads.get(token);
          this.pendingExportDownloads.delete(token);
          try { fs.unlinkSync(entry.filePath); } catch (e) {}
        }
      }, 600000);

      return {
        success: true,
        count: entries.length,
        filePath: fallbackTmpPath,
        fileName: zipFileName,
        destDir: targetDir,
        size: formattedSize,
        bytes: fileSize,
        needsBrowserDownload: true,
        downloadUrl: `/api/worlds/download-export?token=${token}&file=${encodeURIComponent(zipFileName)}`
      };
    }

    throw new Error(`Impossible de finaliser l'archive de sauvegarde de tous les mondes.`);
  }

  /**
   * Formate un nombre d'octets en unité de stockage
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Mo';
    const k = 1024;
    const sizes = ['o', 'Ko', 'Mo', 'Go', 'To'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Extrait de manière robuste et sécurisée la version officielle Minecraft depuis level.dat
   */
  _extractVersionFromLevelDat(unzippedBuffer) {
    if (!unzippedBuffer || unzippedBuffer.length === 0) return null;

    // 1. Tag NBT Type 8 (String) nommé "Name" : [0x08, 0x00, 0x04, 'N', 'a', 'm', 'e']
    // Structure officielle Mojang : Data.Version.Name
    const nameMarker = Buffer.from([0x08, 0x00, 0x04, 0x4e, 0x61, 0x6d, 0x65]);
    const idx = unzippedBuffer.indexOf(nameMarker);
    if (idx !== -1) {
      const valLenIdx = idx + nameMarker.length;
      if (valLenIdx + 2 <= unzippedBuffer.length) {
        const strLen = unzippedBuffer.readUInt16BE(valLenIdx);
        if (strLen > 0 && strLen < 40 && valLenIdx + 2 + strLen <= unzippedBuffer.length) {
          const val = unzippedBuffer.toString('utf8', valLenIdx + 2, valLenIdx + 2 + strLen).trim();
          // Valider que c'est une version Minecraft officielle ou snapshot valide (1.7 à 1.22, 26.3, snapshots)
          if (/^(?:1\.(?:[7-9]|1[0-9]|2[0-2])(?:\.[0-9]+)?|[0-9]{2}w[0-9]{2}[a-z]|26\.3)$/i.test(val)) {
            return val;
          }
        }
      }
    }

    // 2. DataVersion TAG_Int (Type 3) nommé "DataVersion"
    const dvMarker = Buffer.from([0x03, 0x00, 0x0b, 0x44, 0x61, 0x74, 0x61, 0x56, 0x65, 0x72, 0x73, 0x69, 0x6f, 0x6e]);
    const dvIdx = unzippedBuffer.indexOf(dvMarker);
    if (dvIdx !== -1) {
      const intIdx = dvIdx + dvMarker.length;
      if (intIdx + 4 <= unzippedBuffer.length) {
        const dataVersion = unzippedBuffer.readInt32BE(intIdx);
        if (dataVersion >= 3955) return '1.21.1';
        if (dataVersion >= 3953) return '1.21';
        if (dataVersion >= 3837) return '1.20.6';
        if (dataVersion >= 3700) return '1.20.4';
        if (dataVersion >= 3463) return '1.20.1';
        if (dataVersion >= 3337) return '1.19.4';
        if (dataVersion >= 3105) return '1.19.2';
        if (dataVersion >= 2975) return '1.18.2';
        if (dataVersion >= 2730) return '1.17.1';
        if (dataVersion >= 2586) return '1.16.5';
        if (dataVersion >= 1976) return '1.14.4';
        if (dataVersion >= 1343) return '1.12.2';
      }
    }

    // 3. Fallback textuel strict : ne chercher QUE des versions réelles (1.7 à 1.22 ou 26.3)
    try {
      const rawStr = unzippedBuffer.toString('utf8');
      const mcMatches = rawStr.match(/(?:minecraft[ /_-]|mc[ /_-])(1\.(?:[7-9]|1[0-9]|2[0-2])(?:\.[0-9]+)?)/i);
      if (mcMatches && mcMatches[1]) {
        return mcMatches[1];
      }
      const strictMatch = rawStr.match(/(?<![0-9.])(1\.(?:1[2-9]|2[0-2])(?:\.[0-9]+)?)(?![0-9.])/);
      if (strictMatch && strictMatch[1]) {
        return strictMatch[1];
      }
    } catch (e) {}

    return null;
  }

  /**
   * Extrait le nom du monde (LevelName) depuis level.dat
   */
  _extractLevelNameFromLevelDat(unzippedBuffer) {
    if (!unzippedBuffer || unzippedBuffer.length === 0) return null;
    try {
      const marker = Buffer.from([0x08, 0x00, 0x09, 0x4c, 0x65, 0x76, 0x65, 0x6c, 0x4e, 0x61, 0x6d, 0x65]);
      const idx = unzippedBuffer.indexOf(marker);
      if (idx !== -1) {
        const valLenIdx = idx + marker.length;
        if (valLenIdx + 2 <= unzippedBuffer.length) {
          const strLen = unzippedBuffer.readUInt16BE(valLenIdx);
          if (strLen > 0 && strLen < 100 && valLenIdx + 2 + strLen <= unzippedBuffer.length) {
            const val = unzippedBuffer.toString('utf8', valLenIdx + 2, valLenIdx + 2 + strLen).trim();
            if (val && val.toLowerCase() !== 'world') {
              return val.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '-');
            }
          }
        }
      }
    } catch (e) {}
    return null;
  }

  _listDirectoryRecursive(dir, maxDepth = 4, currentDepth = 0, baseDir = dir) {
    let results = [];
    if (currentDepth > maxDepth) return results;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.name.startsWith('.') || ent.name === '__MACOSX') continue;
        const full = path.join(dir, ent.name);
        const rel = path.relative(baseDir, full);
        results.push({ rel, full, isDirectory: ent.isDirectory() });
        if (ent.isDirectory()) {
          results = results.concat(this._listDirectoryRecursive(full, maxDepth, currentDepth + 1, baseDir));
        }
      }
    } catch (e) {}
    return results;
  }

  /**
   * Analyse une source (archive zip ou dossier non compressé) pour détecter automatiquement le lanceur et la version
   */
  async inspectWorldZip(sourcePath) {
    if (!fs.existsSync(sourcePath)) throw new Error('Fichier ou dossier source introuvable.');

    const isDir = fs.statSync(sourcePath).isDirectory();
    let fileNames = [];
    let detectedType = 'vanilla';
    let detectedLauncher = 'Vanilla';
    let detectedVersion = null;
    let suggestedName = path.basename(sourcePath, path.extname(sourcePath)).replace(/[^a-zA-Z0-9_-]/g, '-');
    let modsCount = 0;

    const zlib = require('zlib');

    if (isDir) {
      const recFiles = this._listDirectoryRecursive(sourcePath);
      fileNames = recFiles.map(f => f.rel);

      // 1. Détection de level.dat dans le dossier
      const levelDatObj = recFiles.find(f => !f.isDirectory && /(?:^|[/\\])level\.dat$/i.test(f.rel));
      if (levelDatObj) {
        try {
          const rawBuf = fs.readFileSync(levelDatObj.full);
          const unzipped = zlib.gunzipSync(rawBuf);
          const v = this._extractVersionFromLevelDat(unzipped);
          if (v) detectedVersion = v;
          const ln = this._extractLevelNameFromLevelDat(unzipped);
          if (ln) suggestedName = ln;
        } catch (e) {}
      }
    } else {
      let zipList = '';
      try {
        zipList = execSync(`unzip -l "${sourcePath}"`, { maxBuffer: 1024 * 1024 * 20 }).toString();
      } catch (e) {
        throw new Error('Impossible de lire le contenu du fichier zip.');
      }

      const lines = zipList.split('\n');
      fileNames = lines.map(l => {
        const parts = l.trim().split(/\s+/);
        return parts.slice(3).join(' ');
      }).filter(Boolean);

      // 1. Détection de level.dat dans l'archive zip
      const levelDatEntry = fileNames.find(f => /(?:^|\/)level\.dat$/i.test(f));
      if (levelDatEntry) {
        try {
          const levelDatBuffer = execSync(`unzip -p "${sourcePath}" "${levelDatEntry}"`, { maxBuffer: 1024 * 1024 * 10 });
          const unzipped = zlib.gunzipSync(levelDatBuffer);
          const v = this._extractVersionFromLevelDat(unzipped);
          if (v) detectedVersion = v;
          const ln = this._extractLevelNameFromLevelDat(unzipped);
          if (ln) suggestedName = ln;
        } catch (e) {}
      }
    }

    // 2. Détection des mods et du modloader
    const modsFolderJars = fileNames.filter(f => /^mods\/[^\/]+\.jar$/i.test(f) || /[/\\]mods[/\\][^\/\\]+\.jar$/i.test(f));
    modsCount = modsFolderJars.length;

    // A. Détection formelle via les scripts de lancement et dossiers libraries
    let scriptLauncher = null;
    if (isDir) {
      const runShPath = path.join(sourcePath, 'run.sh');
      if (fs.existsSync(runShPath)) {
        try {
          const runShContent = fs.readFileSync(runShPath, 'utf8');
          if (/neoforge/i.test(runShContent)) scriptLauncher = 'NeoForge';
          else if (/fabric/i.test(runShContent)) scriptLauncher = 'Fabric';
          else if (/forge/i.test(runShContent)) scriptLauncher = 'Forge';
        } catch (_) {}
      }
    }

    // B. Détection pondérée par occurrence dans les noms de fichiers
    let neoScore = 0;
    let fabricScore = 0;
    let forgeScore = 0;

    for (const f of fileNames) {
      if (/neoforge|neoforged/i.test(f)) neoScore++;
      if (/fabric\.mod\.json|fabric-loader|net\/fabricmc/i.test(f)) fabricScore++;
      else if (/fabric/i.test(f)) fabricScore += 0.5;
      if (/minecraftforge|mods\.toml|forge-.*\.jar/i.test(f)) forgeScore++;
      else if (/forge/i.test(f) && !/neoforge/i.test(f)) forgeScore += 0.5;
    }

    if (scriptLauncher) {
      detectedType = 'modded';
      detectedLauncher = scriptLauncher;
    } else if (neoScore > 0 || fabricScore > 0 || forgeScore > 0 || modsCount > 0) {
      detectedType = 'modded';
      if (neoScore >= fabricScore && neoScore >= forgeScore && neoScore > 0) {
        detectedLauncher = 'NeoForge';
      } else if (fabricScore > neoScore && fabricScore >= forgeScore) {
        detectedLauncher = 'Fabric';
      } else if (forgeScore > neoScore && forgeScore >= fabricScore) {
        detectedLauncher = 'Forge';
      } else {
        detectedLauncher = 'NeoForge';
      }
    }

    // 3. Détection de version Minecraft à partir des noms de jars ou scripts (ex: run.sh, libraries)
    if (!detectedVersion && isDir) {
      const runShPath = path.join(sourcePath, 'run.sh');
      if (fs.existsSync(runShPath)) {
        try {
          const runShContent = fs.readFileSync(runShPath, 'utf8');
          const vM = runShContent.match(/(?:Minecraft|neoforge\/|mc[-_]?)(1\.(?:[7-9]|1[0-9]|2[0-2])(?:\.[0-9]+)?)/i);
          if (vM && vM[1]) detectedVersion = vM[1];
        } catch (_) {}
      }
    }

    if (!detectedVersion) {
      for (const fn of fileNames) {
        // Ne matcher que si explicitement préfixé par minecraft, fabric, forge ou neoforge
        const vMatch = fn.match(/(?:minecraft_server\.|neoforge-|forge-|fabric-loader-[\d.]+-|mc[-_]?)(1\.(?:[7-9]|1[0-9]|2[0-2])(?:\.[0-9]+)?)/i);
        if (vMatch && vMatch[1]) {
          detectedVersion = vMatch[1];
          break;
        }
      }
    }

    // Fallback par défaut garanti si aucune version Minecraft officielle n'a pu être identifiée
    if (!detectedVersion) {
      detectedVersion = '1.21.1';
    }

    return {
      success: true,
      launcher: detectedLauncher,
      version: detectedVersion,
      type: detectedType,
      suggestedName,
      modsCount
    };
  }

  /**
   * Importe un monde (archive zip OU dossier non compressé)
   */
  async importWorldZip(sourcePath, worldName = null, type = 'vanilla', version = '1.21.1') {
    const cleanId = (worldName && worldName.trim()) 
      ? worldName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '-') 
      : this.getNextDefaultWorldName();
    const targetDir = path.join(this.gamesDir, cleanId);

    // Vérification de collision respectueuse de la casse sur macOS
    if (fs.existsSync(targetDir)) {
      throw new Error(`Un monde nommé '${cleanId}' existe déjà.`);
    }

    const isDir = fs.existsSync(sourcePath) && fs.statSync(sourcePath).isDirectory();
    const tempExtract = path.join(this.gamesDir, `_temp_import_${Date.now()}`);
    let createdTargetDir = false;

    try {
      if (isDir) {
        // C'est un dossier non compressé
        fs.cpSync(sourcePath, tempExtract, { recursive: true });
      } else {
        // C'est une archive zip
        fs.mkdirSync(tempExtract, { recursive: true });
        execSync(`unzip -q "${sourcePath}" -d "${tempExtract}"`);
      }

      // Nettoyage des dossiers métadonnées macOS parasites
      const macOsx = path.join(tempExtract, '__MACOSX');
      if (fs.existsSync(macOsx)) {
        try { fs.rmSync(macOsx, { recursive: true, force: true }); } catch (_) {}
      }

      // Si le zip ou dossier contient un unique dossier conteneur, descendre d'un niveau
      let effectiveRoot = tempExtract;
      const rootEntries = fs.readdirSync(tempExtract).filter(f => !f.startsWith('.') && f !== '__MACOSX');
      if (rootEntries.length === 1 && fs.statSync(path.join(tempExtract, rootEntries[0])).isDirectory()) {
        effectiveRoot = path.join(tempExtract, rootEntries[0]);
      }

      // Analyser le contenu de effectiveRoot : est-ce un dossier de serveur complet ou une simple map ?
      const hasDirectLevelDat = fs.existsSync(path.join(effectiveRoot, 'level.dat'));
      const hasServerProps = fs.existsSync(path.join(effectiveRoot, 'server.properties'));
      const hasRuntimeMeta = fs.existsSync(path.join(effectiveRoot, 'runtime.json')) || fs.existsSync(path.join(effectiveRoot, '.runtime.json'));
      const hasOpsJson = fs.existsSync(path.join(effectiveRoot, 'ops.json')) || fs.existsSync(path.join(effectiveRoot, 'usercache.json'));
      const hasRunSh = fs.existsSync(path.join(effectiveRoot, 'run.sh')) || fs.existsSync(path.join(effectiveRoot, 'run.bat')) || fs.existsSync(path.join(effectiveRoot, 'server.jar'));
      const hasSubWorldWithLevelDat = fs.existsSync(path.join(effectiveRoot, 'world', 'level.dat'));

      const isFullServer = hasServerProps || hasRuntimeMeta || hasOpsJson || hasRunSh || (hasSubWorldWithLevelDat && !hasDirectLevelDat);

      fs.mkdirSync(targetDir, { recursive: true });
      createdTargetDir = true;

      if (isFullServer) {
        // C'est un serveur complet : déplacer l'intégralité de son contenu directement à la racine de targetDir
        const items = fs.readdirSync(effectiveRoot);
        for (const item of items) {
          if (item === '__MACOSX' || item === '.DS_Store') continue;
          const src = path.join(effectiveRoot, item);
          const dst = path.join(targetDir, item);
          fs.renameSync(src, dst);
        }
      } else if (hasDirectLevelDat) {
        // C'est une map de monde simple (ex: map solo CurseForge/PlanetMinecraft) : déplacer dans targetDir/world
        const worldSub = path.join(targetDir, 'world');
        fs.mkdirSync(worldSub, { recursive: true });
        const mapItems = fs.readdirSync(effectiveRoot);
        for (const item of mapItems) {
          if (item === '__MACOSX' || item === '.DS_Store') continue;
          const src = path.join(effectiveRoot, item);
          const dst = path.join(worldSub, item);
          fs.renameSync(src, dst);
        }
      } else {
        // Déplacement générique de tous les éléments
        const items = fs.readdirSync(effectiveRoot);
        for (const item of items) {
          if (item === '__MACOSX' || item === '.DS_Store') continue;
          const src = path.join(effectiveRoot, item);
          const dst = path.join(targetDir, item);
          fs.renameSync(src, dst);
        }
      }

      // Nettoyage de tempExtract si encore présent
      if (fs.existsSync(tempExtract)) {
        try { fs.rmSync(tempExtract, { recursive: true, force: true }); } catch (_) {}
      }

      // 1. Restauration fidèle du temps de runtime (world_info.json, runtime.json, .runtime.json)
      let importedRuntime = 0;
      let importedLastStartedAt = 0;
      const candidateMetaPaths = [
        path.join(targetDir, 'world_info.json'),
        path.join(targetDir, 'runtime.json'),
        path.join(targetDir, '.runtime.json'),
        path.join(targetDir, 'world', 'world_info.json'),
        path.join(targetDir, 'world', 'runtime.json'),
        path.join(targetDir, 'world', '.runtime.json')
      ];
      const foundRtPath = candidateMetaPaths.find(p => fs.existsSync(p));
      if (foundRtPath) {
        try {
          const rtData = JSON.parse(fs.readFileSync(foundRtPath, 'utf8'));
          if (typeof rtData.totalRuntime === 'number') {
            importedRuntime = Math.max(0, Math.floor(rtData.totalRuntime));
          }
          if (typeof rtData.lastStartedAt === 'number') {
            importedLastStartedAt = rtData.lastStartedAt;
          }
        } catch (_) {}
      }

      // Fallback si pas de fichier de métadonnées runtime : déduire depuis Time dans level.dat (ticks/20)
      if (importedRuntime === 0) {
        const worldDataFolder = this.getWorldDataFolder(targetDir);
        const levelDatPath = path.join(worldDataFolder, 'level.dat');
        if (fs.existsSync(levelDatPath)) {
          try {
            const zlib = require('zlib');
            const buf = zlib.gunzipSync(fs.readFileSync(levelDatPath));
            const timeMarker = Buffer.from([0x04, 0x00, 0x04, 0x54, 0x69, 0x6d, 0x65]);
            const idx = buf.indexOf(timeMarker);
            if (idx !== -1 && idx + timeMarker.length + 8 <= buf.length) {
              const ticks = Number(buf.readBigInt64BE(idx + timeMarker.length));
              if (ticks > 0) {
                importedRuntime = Math.floor(ticks / 20);
              }
            }
          } catch (_) {}
        }
      }

      if (importedRuntime > 0 || importedLastStartedAt > 0) {
        this.saveWorldRuntime(cleanId, importedRuntime, importedLastStartedAt);
      }

      // 2. Restauration des logs du terminal dans le buffer actif
      const candidateLogFiles = [
        path.join(targetDir, 'logs', 'latest.log'),
        path.join(targetDir, 'world', 'logs', 'latest.log')
      ];
      for (const logPath of candidateLogFiles) {
        if (fs.existsSync(logPath)) {
          try {
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
            if (lines.length > 0) {
              this.worldLogs[cleanId] = lines.slice(-500);
              break;
            }
          } catch (_) {}
        }
      }

      // 3. Fichiers et profils de joueurs (ops, whitelist, bans, usercache, usernamecache)
      // Synchroniser les fichiers de cache s'ils ont été placés dans un sous-dossier world/
      for (const pFile of ['usercache.json', 'usernamecache.json', 'ops.json', 'whitelist.json', 'banned-players.json', 'banned-ips.json']) {
        const subPFile = path.join(targetDir, 'world', pFile);
        const rootPFile = path.join(targetDir, pFile);
        if (fs.existsSync(subPFile) && !fs.existsSync(rootPFile)) {
          try { fs.copyFileSync(subPFile, rootPFile); } catch (_) {}
        }
      }

      if (!fs.existsSync(path.join(targetDir, 'ops.json'))) {
        try { fs.writeFileSync(path.join(targetDir, 'ops.json'), '[]\n', 'utf8'); } catch (_) {}
      }
      if (!fs.existsSync(path.join(targetDir, 'whitelist.json'))) {
        try { fs.writeFileSync(path.join(targetDir, 'whitelist.json'), '[]\n', 'utf8'); } catch (_) {}
      }
      if (!fs.existsSync(path.join(targetDir, 'banned-players.json'))) {
        try { fs.writeFileSync(path.join(targetDir, 'banned-players.json'), '[]\n', 'utf8'); } catch (_) {}
      }
      if (!fs.existsSync(path.join(targetDir, 'banned-ips.json'))) {
        try { fs.writeFileSync(path.join(targetDir, 'banned-ips.json'), '[]\n', 'utf8'); } catch (_) {}
      }
      if (!fs.existsSync(path.join(targetDir, 'usercache.json'))) {
        try { fs.writeFileSync(path.join(targetDir, 'usercache.json'), '[]\n', 'utf8'); } catch (_) {}
      }

      // 4. Configuration essentielle et permissions du script
      fs.writeFileSync(path.join(targetDir, 'eula.txt'), 'eula=true\n', 'utf8');

      if (!fs.existsSync(path.join(targetDir, 'server.properties'))) {
        fs.writeFileSync(
          path.join(targetDir, 'server.properties'),
          `# Importé par Cubirium\nserver-port=25565\nmotd=Serveur ${cleanId}\nonline-mode=true\nmax-players=20\n`,
          'utf8'
        );
      }

      if (fs.existsSync(path.join(targetDir, 'run.sh'))) {
        try { fs.chmodSync(path.join(targetDir, 'run.sh'), 0o755); } catch (_) {}
      }

      // Si pas d'exécutable présent, installer la version demandée
      if (!fs.existsSync(path.join(targetDir, 'run.sh')) && !fs.existsSync(path.join(targetDir, 'server.jar'))) {
        const vanillaInstaller = require('./vanilla-installer-service');
        await vanillaInstaller.installVanillaServer(cleanId, version || '1.21.1', targetDir);
      }

      return { success: true, worldId: cleanId };
    } catch (err) {
      if (createdTargetDir && fs.existsSync(targetDir)) {
        try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch (_) {}
      }
      throw err;
    } finally {
      if (fs.existsSync(tempExtract)) {
        try { fs.rmSync(tempExtract, { recursive: true, force: true }); } catch (e) {}
      }
    }
  }
}

module.exports = new MinecraftService();


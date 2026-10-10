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
 * Formate une taille brute (ex: du -sh "24M", "1.2G") vers les unités françaises : Mo, Go, To, Ko, o
 */
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

class MinecraftService {
  constructor() {
    const isBundled = __dirname.includes('.app/Contents');
    if (process.env.GAMES_DIR) {
      this.gamesDir = path.resolve(process.env.GAMES_DIR);
    } else if (isBundled) {
      this.gamesDir = path.join(os.homedir(), 'Library/Application Support/MinecraftServerManager/games');
    } else {
      this.gamesDir = path.resolve(__dirname, '../../games');
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
   * Détection robuste et multi-plateforme du binaire Java et de JAVA_HOME adaptés au monde
   */
  findJavaExecutable(worldId = null, checkContent = '') {
    const isWin = process.platform === 'win32';
    const version = (this.getWorldVersion(worldId) || '').trim();
    const content = String(checkContent || '');

    // Déterminer si Java 25 est requis (Minecraft 26.x, 25.x ou indication explicite)
    const isJava25 = version.startsWith('26.') || version.startsWith('25.') ||
                     content.includes('openjdk@25') || content.includes('Java 25');

    const candidates = [];

    // 0. Dossier de runtime local embarqué ou auto-téléchargé par l'application
    const localRuntimeDirs = [
      path.join(this.gamesDir, '..', 'runtime', 'java-25'),
      path.join(this.gamesDir, '..', 'runtime', 'java-21'),
      isWin ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'MinecraftServerManager', 'runtime', 'java-25') : null,
      !isWin ? path.join(os.homedir(), 'Library/Application Support/MinecraftServerManager/runtime/java-25') : null
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

      // Trier : si Java 25 requis, prioriser immédiatement les versions contenant 25
      if (isJava25) {
        const j25List = vendorJdks.filter(p => /25|java-25|jdk-25|temurin-25/i.test(p));
        const otherList = vendorJdks.filter(p => !/25|java-25|jdk-25|temurin-25/i.test(p));
        candidates.push(...j25List);
        candidates.push(...otherList);
      } else {
        candidates.push(...vendorJdks);
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

      candidates.push('/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home/bin/java');
      candidates.push('/opt/homebrew/opt/openjdk@21/bin/java');
      candidates.push('/usr/local/opt/openjdk@21/bin/java');

      if (!isJava25) {
        candidates.push('/opt/homebrew/opt/openjdk@25/bin/java');
        candidates.push('/usr/local/opt/openjdk@25/bin/java');
      }

      // Parcourir les JDKs installés dans /Library/Java/JavaVirtualMachines
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
        // Ne garder java/java.exe que si aucun exécutable spécifique n'a été trouvé
        if (!foundExec) foundExec = cand;
        continue;
      }
      if (fs.existsSync(cand)) {
        try {
          fs.accessSync(cand, fs.constants.X_OK);
          foundExec = cand;
          const binDir = path.dirname(cand);
          if (path.basename(binDir).toLowerCase() === 'bin') {
            foundJavaHome = path.dirname(binDir);
          }
          break;
        } catch (_) {}
      }
    }

    if (!foundExec) {
      foundExec = isWin ? 'java.exe' : 'java';
    }

    if (isJava25) {
      const isActually25 = foundExec && /25|java-25|jdk-25|temurin-25|openjdk@25/i.test(foundExec);
      if (!isActually25) {
        if (foundJavaHome && /21|jdk-21/i.test(foundJavaHome)) {
          foundJavaHome = '';
        }
        this.ensureJava25Background();
      }
    }

    return {
      execFile: foundExec,
      javaHome: foundJavaHome || process.env.JAVA_HOME || ''
    };
  }

  /**
   * Approvisionnement et installation silencieuse de Java 25 en arrière-plan
   */
  ensureJava25Background() {
    if (this._isJava25Installing) return;
    this._isJava25Installing = true;
    const isWin = process.platform === 'win32';

    setTimeout(() => {
      try {
        if (isWin) {
          console.log('[Java25] Lancement de l\'installation silencieuse d\'Adoptium Temurin 25 JDK via winget...');
          const wingetCmd = 'winget install --id EclipseAdoptium.Temurin.25.JDK -e --silent --accept-package-agreements --accept-source-agreements';
          const { spawn } = require('child_process');
          const proc = spawn('cmd.exe', ['/c', wingetCmd], { windowsHide: true, stdio: 'ignore' });
          proc.on('close', (code) => {
            this._isJava25Installing = false;
            console.log(`[Java25] Installation winget terminée (code ${code}).`);
          });
          proc.on('error', () => {
            this._isJava25Installing = false;
          });
        } else {
          const { exec } = require('child_process');
          exec('brew install openjdk@25', (err) => {
            this._isJava25Installing = false;
            if (!err) {
              console.log('[Java25] OpenJDK 25 installé avec succès via Homebrew.');
            }
          });
        }
      } catch (err) {
        this._isJava25Installing = false;
        console.warn('[Java25] Erreur lancement auto-installation:', err.message);
      }
    }, 100);
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

    const cleanLine = trimmed;

    // Capture de la version du serveur Minecraft depuis les logs de démarrage
    const verMatch = cleanLine.match(/Starting minecraft server version\s+([0-9a-zA-Z._-]+)/i);
    if (verMatch) {
      this.detectedVersion = verMatch[1];
    }

    // Filtrer les confirmations de sauvegarde silencieuse et de gamerules internes pour éviter le spam
    if (
      trimmed.includes('Saved the game') ||
      trimmed.includes('Saved the world') ||
      trimmed.includes('sendCommandFeedback') ||
      trimmed.includes('send_command_feedback') ||
      trimmed.includes('logAdminCommands') ||
      trimmed.includes('log_admin_commands')
    ) {
      return;
    }

    // Détection de statut "Done"
    if (this.status === 'STARTING' && (
      trimmed.includes('Done (') ||
      trimmed.includes('Started') ||
      trimmed.includes('RCON running') ||
      trimmed.includes('Dedicated server permissions')
    )) {
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

    // Détection de joueurs rejoignant / quittant (Compatible Vanilla, Paper/Spigot, Forge, NeoForge, Fabric)
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

    // Réponse de /list : "There are X of a max of Y players online: player1, player2"
    const listMatch = cleanLine.match(/players online:(.*)$/i);
    if (listMatch) {
      const names = listMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      this.players = names;
      this.broadcast('players', this.players);
      this.broadcast('status', this.getState());

      // Si cette requête list a été déclenchée de façon silencieuse en arrière-plan, ne pas polluer la console
      if (this._lastSilentList && (Date.now() - this._lastSilentList < 2500)) {
        return;
      }
    }

    // Masquer les messages "Saved the game" déclenchés par la synchronisation silencieuse
    if ((cleanLine.includes('Saved the game') || cleanLine.includes('Saving the game')) &&
        this._lastSilentSave && (Date.now() - this._lastSilentSave < 2500)) {
      return;
    }

    this.broadcast('log', { worldId: wid, text: trimmed });
  }

  async getWorldLogs(worldId) {
    if (!worldId) return [];
    if (this.worldLogs[worldId] !== undefined && this.worldLogs[worldId].length > 0) {
      return this.worldLogs[worldId].slice(-500);
    }
    // Tenter de charger les logs récents depuis le fichier latest.log du monde
    const logFilePath = path.join(this.gamesDir, worldId, 'logs', 'latest.log');
    if (fs.existsSync(logFilePath)) {
      try {
        const content = fs.readFileSync(logFilePath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);
        const recent = lines.slice(-500);
        this.worldLogs[worldId] = recent;
        return recent;
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
      tunnel: tunnelService.getState()
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

      // Taille complète du dossier du serveur / monde
      let worldSize = '0 Mo';
      try {
        const du = execSync(`du -sh "${worldPath}" 2>/dev/null`).toString().trim();
        const rawDu = du.split(/\s+/)[0];
        worldSize = formatWorldSizeFrench(rawDu);
      } catch (e) {}

      // Détection précise du lanceur et de la version
      let launcherVersion = (type === 'Vanilla') ? 'Vanilla' : 'Moddé';
      const neoforgeDir = path.join(worldPath, 'libraries/net/neoforged/neoforge');
      const forgeDir = path.join(worldPath, 'libraries/net/minecraftforge/forge');
      const fabricDir = path.join(worldPath, 'libraries/net/fabricmc');
      if (fs.existsSync(neoforgeDir)) {
        try {
          const versions = fs.readdirSync(neoforgeDir).filter(f => !f.startsWith('.'));
          launcherVersion = versions.length > 0 ? `NeoForge ${versions[0]}` : 'NeoForge';
        } catch (e) { launcherVersion = 'NeoForge'; }
      } else if (fs.existsSync(forgeDir)) {
        try {
          const versions = fs.readdirSync(forgeDir).filter(f => !f.startsWith('.'));
          launcherVersion = versions.length > 0 ? `Forge ${versions[0]}` : 'Forge';
        } catch (e) { launcherVersion = 'Forge'; }
      } else if (fs.existsSync(fabricDir)) {
        launcherVersion = 'Fabric';
      } else if (hasRunSh) {
        try {
          const runContent = fs.readFileSync(path.join(worldPath, 'run.sh'), 'utf8');
          const m = runContent.match(/Vanilla\s+([0-9.]+)|MC\s+([0-9.]+)/i);
          if (m) launcherVersion = `Vanilla ${m[1] || m[2]}`;
        } catch (e) {}
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
        let dimSize = '0 Mo';
        try {
          const duTarget = (fs.existsSync(owRegionDir) && fs.readdirSync(owRegionDir).length > 0) ? owRegionDir : worldDataFolder;
          const du = execSync(`du -sh "${duTarget}" 2>/dev/null`).toString().trim();
          dimSize = formatWorldSizeFrench(du.split(/\s+/)[0]);
        } catch (e) {}
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
        let dimSize = '0 Mo';
        try {
          const du = execSync(`du -sh "${activeNetherDir}" 2>/dev/null`).toString().trim();
          dimSize = formatWorldSizeFrench(du.split(/\s+/)[0]);
        } catch (e) {}
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
        let dimSize = '0 Mo';
        try {
          const du = execSync(`du -sh "${activeEndDir}" 2>/dev/null`).toString().trim();
          dimSize = formatWorldSizeFrench(du.split(/\s+/)[0]);
        } catch (e) {}
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
  async startWorld(worldId) {
    const worldPath = path.join(this.gamesDir, worldId);
    if (!fs.existsSync(worldPath)) {
      throw new Error(`Monde introuvable: ${worldId}`);
    }

    this.worldLaunchTimes[worldId] = Date.now();
    if (this.worldHealth[worldId]?.status === 'needs_repair') {
      delete this.worldHealth[worldId];
    }

    // 0. Nettoyage préventif des processus fantômes ou orphelins
    try {
      execSync(`pkill -f "games/${worldId}" 2>/dev/null || true`);
      await new Promise(r => setTimeout(r, 600));
    } catch (e) {}

    // Nettoyage du session.lock s'il est resté bloqué après un crash/arrêt forcé
    const sessionLock = path.join(worldPath, 'world', 'session.lock');
    if (fs.existsSync(sessionLock)) {
      try {
        fs.unlinkSync(sessionLock);
      } catch (e) {}
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

    // Synchronisation active et réactive des données serveur (joueurs, positions, pv, sauvegardes)
    if (this.serverSyncInterval) clearInterval(this.serverSyncInterval);
    this.serverSyncInterval = setInterval(() => {
      if (this.activeWorld && this.status === 'RUNNING') {
        this.triggerSilentList(this.activeWorld);
        this.triggerSilentSave(this.activeWorld);
      }
    }, 1500);

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

    const javaInfo = this.findJavaExecutable(worldId, checkContent);
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
      execFile = javaInfo.execFile;
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
    if (selectedJavaHome) {
      childEnv.JAVA_HOME = selectedJavaHome;
      const binDir = path.join(selectedJavaHome, 'bin');
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

    this.worldHealth[worldId] = {
      status: isCorrupted ? 'corrupted' : 'needs_repair',
      reason: reason || "Arrêt inattendu du serveur.",
      lastCrashAt: Date.now(),
      code: code ?? null
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
   * Réparation automatique d'un monde corrompu ou crashé
   */
  async repairWorld(worldId) {
    const worldPath = path.join(this.gamesDir, worldId);
    if (!fs.existsSync(worldPath)) {
      throw new Error(`Monde introuvable: ${worldId}`);
    }

    const report = [];

    // 1. Détecter et supprimer les verrous session.lock résiduels
    const lockCandidates = [
      path.join(worldPath, 'session.lock'),
      path.join(worldPath, 'world', 'session.lock')
    ];
    for (const lock of lockCandidates) {
      if (fs.existsSync(lock)) {
        try {
          fs.unlinkSync(lock);
          report.push("Verrou session.lock obsolète supprimé.");
        } catch (_) {}
      }
    }

    // 2. Vérifier et forcer l'acceptation de l'EULA
    const eulaPath = path.join(worldPath, 'eula.txt');
    try {
      fs.writeFileSync(eulaPath, 'eula=true\n', 'utf8');
      report.push("Contrat de licence EULA réinitialisé (eula=true).");
    } catch (_) {}

    // 3. Vérifier et réparer server.properties
    const propsPath = path.join(worldPath, 'server.properties');
    if (!fs.existsSync(propsPath)) {
      const defaultProps = `# Minecraft Server Properties (Auto-repaired)\nserver-port=25565\nmotd=Serveur ${worldId}\nonline-mode=true\nmax-players=20\npvp=true\n`;
      fs.writeFileSync(propsPath, defaultProps, 'utf8');
      report.push("Fichier server.properties manquant régénéré.");
    } else {
      try {
        let content = fs.readFileSync(propsPath, 'utf8');
        if (!content.includes('server-port=')) {
          content += '\nserver-port=25565\n';
          fs.writeFileSync(propsPath, content, 'utf8');
          report.push("Propriété server-port ajoutée dans server.properties.");
        }
      } catch (_) {}
    }

    // 4. Vérifier les exécutables et scripts de lancement
    const runShPath = path.join(worldPath, 'run.sh');
    const runBatPath = path.join(worldPath, 'run.bat');
    const serverJarPath = path.join(worldPath, 'server.jar');

    if (fs.existsSync(runShPath)) {
      try {
        fs.chmodSync(runShPath, 0o755);
        report.push("Permissions d'exécution restaurées sur run.sh (chmod +x).");
      } catch (_) {}
    }

    // Si aucun exécutable n'est présent mais qu'un dossier de map ou des configs existent
    if (!fs.existsSync(runShPath) && !fs.existsSync(serverJarPath) && !fs.existsSync(runBatPath)) {
      try {
        const vanillaInstaller = require('./vanilla-installer-service');
        const ver = this.getWorldVersion(worldId) || '26.3';
        await vanillaInstaller.installVanillaServer(worldId, ver, worldPath);
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
          report
        };
      }
    }

    // Réinitialiser la santé du monde
    delete this.worldHealth[worldId];
    this.broadcast('world_health_changed', { worldId, health: { status: 'healthy' } });

    return {
      success: true,
      corrupted: false,
      message: report.length > 0 ? report.join(' ') : "Le serveur a été vérifié et réparé avec succès.",
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

      // Script de lancement multi-Java (Java 25 pour versions 26.x/25.x, Java 21 sinon)
      const isJava25 = effectiveVersion.startsWith('26.') || effectiveVersion.startsWith('25.');
      const runScript = `#!/usr/bin/env sh
# Script de lancement Moddé (${effectiveLoader} - Minecraft ${effectiveVersion}) pour ${cleanId}

JAVA_25="/opt/homebrew/opt/openjdk@25/bin/java"
JAVA_21="/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home/bin/java"

JAVA_BIN=""
${isJava25 ? `
if [ -x "$JAVA_25" ]; then
    JAVA_BIN="$JAVA_25"
elif [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    JAVA_BIN="$JAVA_HOME/bin/java"
elif [ -x "$JAVA_21" ]; then
    JAVA_BIN="$JAVA_21"
elif command -v java >/dev/null 2>&1; then
    JAVA_BIN="java"
fi
` : `
if [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    JAVA_BIN="$JAVA_HOME/bin/java"
elif [ -x "$JAVA_21" ]; then
    JAVA_BIN="$JAVA_21"
elif [ -x "$JAVA_25" ]; then
    JAVA_BIN="$JAVA_25"
elif command -v java >/dev/null 2>&1; then
    JAVA_BIN="java"
fi
`}

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
set "JAVA_EXEC=java"
${isJava25 ? `
rem Recherche prioritaire de Java 25 sous Windows
for %%d in (
    "%LOCALAPPDATA%\\MinecraftServerManager\\runtime\\java-25\\bin\\java.exe"
    "%ProgramFiles%\\Eclipse Adoptium\\jdk-25*\\bin\\java.exe"
    "%ProgramFiles%\\Microsoft\\jdk-25*\\bin\\java.exe"
    "%ProgramFiles%\\Java\\jdk-25*\\bin\\java.exe"
) do (
    if exist "%%~d" set "JAVA_EXEC=%%~d"
)
if "%JAVA_EXEC%"=="java" if defined JAVA_HOME if exist "%JAVA_HOME%\\bin\\java.exe" set "JAVA_EXEC=%JAVA_HOME%\\bin\\java.exe"
` : `
if defined JAVA_HOME if exist "%JAVA_HOME%\\bin\\java.exe" set "JAVA_EXEC=%JAVA_HOME%\\bin\\java.exe"
`}
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
      // Ouvre le Finder directement sur le fichier sélectionné
      try {
        execSync(`osascript -e 'tell application "Finder" to reveal POSIX file "${destZipPath.replace(/"/g, '\\"')}"' -e 'tell application "Finder" to activate' 2>/dev/null`);
      } catch (e) {
        try { execSync(`open -R "${destZipPath}" 2>/dev/null`); } catch (err2) {}
      }
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
      try {
        execSync(`osascript -e 'tell application "Finder" to reveal POSIX file "${destZipPath.replace(/"/g, '\\"')}"' -e 'tell application "Finder" to activate' 2>/dev/null`);
      } catch (e) {
        try { execSync(`open -R "${destZipPath}" 2>/dev/null`); } catch (err2) {}
      }
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
          `# Importé par Minecraft Server Manager\nserver-port=25565\nmotd=Serveur ${cleanId}\nonline-mode=true\nmax-players=20\n`,
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


const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const configService = require('./config-service');

class TunnelService {
  constructor() {
    this.status = 'STOPPED'; // 'STOPPED', 'STARTING', 'RUNNING', 'RECONNECTING', 'ERROR'
    this.publicAddress = null;
    this.activePort = null;
    this.preferredPort = null;
    this.relayHost = 'bore.pub';
    this.relayControlPort = 7835;
    this.controlSocket = null;
    this.localPort = 25565;
    this.activeSockets = new Set();
    this.retryTimer = null;
    this.retryAttempts = 0;
    this.watchdogTimer = null;
    this.connectTimeoutTimer = null;
    this.lastActivityTime = Date.now();
    this.shouldRun = false;
    this.lastLogs = [];
    this.onStatusChange = null;

    const homeDir = process.env.HOME || os.homedir();
    const isWin = process.platform === 'win32';
    const isBundled = __dirname.includes('.app/Contents') || process.env.APP_BUNDLED === 'true';
    const appSupportDir = isWin
      ? path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'Cubirium')
      : path.join(homeDir, 'Library/Application Support/Cubirium');
    const legacySupportDir = isWin
      ? path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'MinecraftServerManager')
      : path.join(homeDir, 'Library/Application Support/MinecraftServerManager');
    const baseDir = isBundled
      ? (fs.existsSync(appSupportDir) ? appSupportDir : (fs.existsSync(legacySupportDir) ? legacySupportDir : appSupportDir))
      : path.resolve(__dirname, '..');
    this.logPath = path.join(baseDir, 'logs/tunnel.log');
    this.cachePath = path.join(baseDir, 'logs/tunnel-address.json');

    this.publicAddress = this.loadCachedAddress();
    if (this.publicAddress) {
      const parts = this.publicAddress.split(':');
      if (parts.length === 2) {
        const p = parseInt(parts[1], 10);
        if (p > 0) this.preferredPort = p;
      }
    }

    this.reloadConfig();
  }

  reloadConfig() {
    try {
      const cfg = configService.getSettings();
      if (cfg && cfg.tunnelRelayHost) {
        this.relayHost = cfg.tunnelRelayHost.trim();
      }
      if (cfg && cfg.tunnelRelayPort) {
        this.relayControlPort = parseInt(cfg.tunnelRelayPort, 10) || 7835;
      }
    } catch (_) {}
  }

  log(msg) {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const line = `[${timestamp}] [Tunnel] ${msg}`;
    this.lastLogs.push(line);
    if (this.lastLogs.length > 50) this.lastLogs.shift();

    try {
      const logDir = path.dirname(this.logPath);
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(this.logPath, line + '\n', 'utf8');
    } catch (_) {}
  }

  loadCachedAddress() {
    try {
      if (fs.existsSync(this.cachePath)) {
        const data = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
        if (data && data.address) return data.address;
      }
    } catch (_) {}
    return null;
  }

  saveCachedAddress(address) {
    if (!address) return;
    try {
      const dir = path.dirname(this.cachePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify({ address, updatedAt: new Date().toISOString() }), 'utf8');
    } catch (_) {}
  }

  clearCachedAddress() {
    this.publicAddress = null;
    try {
      if (fs.existsSync(this.cachePath)) fs.unlinkSync(this.cachePath);
    } catch (_) {}
  }

  getState() {
    return {
      status: this.status,
      publicAddress: this.publicAddress,
      activePort: this.activePort,
      relay: this.relayHost,
      connectionsCount: this.activeSockets.size,
      retryAttempts: this.retryAttempts,
      lastLogs: this.lastLogs.slice(-20)
    };
  }

  emitChange() {
    if (typeof this.onStatusChange === 'function') {
      try {
        this.onStatusChange(this.getState());
      } catch (_) {}
    }
  }

  /**
   * Démarre le tunnel public vers le port Minecraft local
   */
  async start(localPort) {
    if (localPort) {
      this.localPort = parseInt(localPort, 10) || this.localPort || 25565;
    }
    this.reloadConfig();
    this.shouldRun = true;

    if (this.status === 'RUNNING' && this.controlSocket && !this.controlSocket.destroyed) {
      this.log(`Tunnel déjà actif sur ${this.publicAddress}`);
      return this.getState();
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    return this._connect();
  }

  _connect() {
    if (!this.shouldRun) {
      return Promise.resolve(this.getState());
    }

    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    if (this.controlSocket) {
      try {
        this.controlSocket.removeAllListeners();
        this.controlSocket.destroy();
      } catch (_) {}
      this.controlSocket = null;
    }

    this.status = this.retryAttempts > 0 ? 'RECONNECTING' : 'STARTING';
    this.emitChange();

    const targetPort = this.preferredPort || 0;
    const portDesc = targetPort > 0 ? ` (demande port ${targetPort})` : '';
    this.log(`Connexion au relais ${this.relayHost}:${this.relayControlPort} pour le port local ${this.localPort}${portDesc}...`);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (state) => {
        if (!settled) {
          settled = true;
          if (this.connectTimeoutTimer) {
            clearTimeout(this.connectTimeoutTimer);
            this.connectTimeoutTimer = null;
          }
          resolve(state);
        }
      };

      try {
        const control = net.connect({
          host: this.relayHost,
          port: this.relayControlPort
        });

        this.controlSocket = control;
        control.setNoDelay(true);

        // Timeout uniquement pendant la poignée de main initiale (10s)
        this.connectTimeoutTimer = setTimeout(() => {
          this.log('Délai d\'attente de connexion dépassé (10s)');
          try {
            control.destroy(new Error('Connection timeout'));
          } catch (_) {}
        }, 10000);

        control.on('connect', () => {
          if (this.connectTimeoutTimer) {
            clearTimeout(this.connectTimeoutTimer);
            this.connectTimeoutTimer = null;
          }

          // Désactiver tout timeout d'inactivité Socket.setTimeout
          // afin d'empêcher les déconnexions prématurées au repos
          control.setTimeout(0);
          control.setKeepAlive(true, 10000);

          this.lastActivityTime = Date.now();
          this.log('Liaison de contrôle établie. Demande d\'attribution de port...');

          try {
            control.write(JSON.stringify({ Hello: targetPort }) + '\0');
          } catch (err) {
            this.log(`Échec d'envoi du message Hello : ${err.message}`);
            finish(this.getState());
          }
        });

        let rxBuffer = '';
        control.on('data', (chunk) => {
          this.lastActivityTime = Date.now();
          rxBuffer += chunk.toString('utf8');
          const frames = rxBuffer.split('\0');
          rxBuffer = frames.pop();

          for (const frame of frames) {
            const trimmed = frame.trim();
            if (!trimmed) continue;
            try {
              const msg = JSON.parse(trimmed);
              this.handleServerMessage(msg, control, finish);
            } catch (parseErr) {
              this.log(`Message serveur invalide : ${trimmed}`);
            }
          }
        });

        control.on('error', (err) => {
          this.log(`Erreur du socket de contrôle : ${err.message}`);
          finish(this.getState());
        });

        control.on('close', (hadError) => {
          this.log(`Connexion de contrôle fermée${hadError ? ' avec erreur' : ''}`);
          this.cleanupSockets();
          if (this.watchdogTimer) {
            clearInterval(this.watchdogTimer);
            this.watchdogTimer = null;
          }
          if (this.connectTimeoutTimer) {
            clearTimeout(this.connectTimeoutTimer);
            this.connectTimeoutTimer = null;
          }

          if (this.shouldRun) {
            this.scheduleReconnect();
          } else {
            this.status = 'STOPPED';
            this.emitChange();
          }
          finish(this.getState());
        });

      } catch (err) {
        this.log(`Exception lors de la connexion : ${err.message}`);
        if (this.shouldRun) {
          this.scheduleReconnect();
        } else {
          this.status = 'ERROR';
          this.emitChange();
        }
        finish(this.getState());
      }
    });
  }

  handleServerMessage(msg, control, onReady) {
    // Bore envoie régulièrement "Heartbeat" (string sérialisée en JSON)
    if (typeof msg === 'string' && msg === 'Heartbeat') {
      this.lastActivityTime = Date.now();
      return;
    }

    if (msg && msg.Heartbeat !== undefined) {
      this.lastActivityTime = Date.now();
      return;
    }

    if (msg && msg.Hello !== undefined) {
      const assignedPort = msg.Hello;
      this.activePort = assignedPort;
      this.preferredPort = assignedPort;
      this.publicAddress = `${this.relayHost}:${assignedPort}`;
      this.status = 'RUNNING';
      this.retryAttempts = 0;
      this.saveCachedAddress(this.publicAddress);
      this.log(`Tunnel public prêt et actif : ${this.publicAddress}`);
      this.startWatchdog();
      this.emitChange();
      if (typeof onReady === 'function') onReady(this.getState());
      return;
    }

    if (msg && msg.Connection) {
      this.spawnProxyStream(msg.Connection);
      return;
    }

    if (msg && msg.Error) {
      this.log(`Message d'erreur reçu du relais : ${msg.Error}`);
      // Si un port précis a été refusé (ex: déjà occupé), basculer sur n'importe quel port
      if (this.preferredPort) {
        this.log(`Port préféré (${this.preferredPort}) refusé ou occupé. Prochaine tentative sur port aléatoire.`);
        this.preferredPort = null;
      }
      try {
        control.destroy();
      } catch (_) {}
    }
  }

  startWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
    }
    this.lastActivityTime = Date.now();
    this.watchdogTimer = setInterval(() => {
      if (this.status !== 'RUNNING' || !this.shouldRun) return;

      const idleMs = Date.now() - this.lastActivityTime;
      // Le relais bore envoie un Heartbeat toutes les 500ms
      // Si 35 secondes s'écoulent sans aucune donnée reçue, la liaison est gelée/perdue
      if (idleMs > 35000) {
        this.log(`Inactivité du relais détectée (${Math.round(idleMs / 1000)}s sans signal). Relance du tunnel...`);
        if (this.controlSocket) {
          try {
            this.controlSocket.destroy(new Error('Watchdog inactivity timeout'));
          } catch (_) {}
        }
      }
    }, 5000);
  }

  /**
   * Lorsqu'un joueur externe se connecte sur bore.pub:port,
   * le serveur nous envoie un UUID de connexion.
   * Nous ouvrons alors une nouvelle connexion TCP vers bore.pub:7835,
   * envoyons { Accept: uuid }\0, et la branchons directement sur le serveur Minecraft local.
   */
  spawnProxyStream(connId) {
    let relayStream = null;
    let localStream = null;
    let isCleanedUp = false;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (relayStream) {
        this.activeSockets.delete(relayStream);
        try { relayStream.destroy(); } catch (_) {}
      }
      if (localStream) {
        this.activeSockets.delete(localStream);
        try { localStream.destroy(); } catch (_) {}
      }
    };

    try {
      relayStream = net.connect({
        host: this.relayHost,
        port: this.relayControlPort
      });

      this.activeSockets.add(relayStream);
      relayStream.setNoDelay(true);
      relayStream.setKeepAlive(true, 10000);

      relayStream.on('connect', () => {
        try {
          relayStream.write(JSON.stringify({ Accept: connId }) + '\0');
        } catch (_) {
          cleanup();
          return;
        }

        localStream = net.connect({
          host: '127.0.0.1',
          port: this.localPort
        });

        this.activeSockets.add(localStream);
        localStream.setNoDelay(true);
        localStream.setKeepAlive(true, 10000);

        localStream.on('connect', () => {
          relayStream.pipe(localStream);
          localStream.pipe(relayStream);
        });

        localStream.on('error', () => cleanup());
        localStream.on('close', () => cleanup());
      });

      relayStream.on('error', () => cleanup());
      relayStream.on('close', () => cleanup());
    } catch (_) {
      cleanup();
    }
  }

  scheduleReconnect() {
    if (!this.shouldRun) return;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    this.retryAttempts++;
    this.status = 'RECONNECTING';
    this.emitChange();

    // Après 3 échecs consécutifs avec un port préféré, abandonner pour tenter un nouveau port
    if (this.retryAttempts >= 3 && this.preferredPort) {
      this.log(`Échecs répétés : abandon du port préféré ${this.preferredPort} pour tenter une nouvelle attribution.`);
      this.preferredPort = null;
    }

    // Backoff exponentiel plafonné à 15s max (tentatives continues et infinies tant que Minecraft tourne)
    const delay = Math.min(1500 * Math.pow(1.35, Math.min(this.retryAttempts - 1, 8)), 15000);
    this.log(`Tentative de reconnexion dans ${Math.round(delay / 1000)}s (essai ${this.retryAttempts})...`);

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.shouldRun) {
        this._connect().catch(() => {});
      }
    }, delay);
  }

  cleanupSockets() {
    for (const socket of this.activeSockets) {
      try {
        socket.destroy();
      } catch (_) {}
    }
    this.activeSockets.clear();
  }

  /**
   * Arrête le tunnel
   */
  async stop() {
    this.shouldRun = false;
    this.preferredPort = null;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }

    this.retryAttempts = 0;
    this.status = 'STOPPED';
    this.publicAddress = null;
    this.activePort = null;

    if (this.controlSocket) {
      try {
        this.controlSocket.removeAllListeners();
        this.controlSocket.destroy();
      } catch (_) {}
      this.controlSocket = null;
    }

    this.cleanupSockets();
    this.clearCachedAddress();
    this.log('Tunnel arrêté proprement.');
    this.emitChange();

    return this.getState();
  }

  /**
   * Redémarre le tunnel (avec option pour forcer une nouvelle adresse IP/port)
   */
  async restart(forceNewPort = false) {
    this.log(`Redémarrage manuel du tunnel demandé${forceNewPort ? ' (nouveau port forcé)' : ''}...`);
    if (forceNewPort) {
      this.preferredPort = null;
      this.clearCachedAddress();
    }
    await this.stop();
    this.shouldRun = true;
    return this.start(this.localPort);
  }
}

module.exports = new TunnelService();

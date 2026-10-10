const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

class TunnelService {
  constructor() {
    this.status = 'STOPPED'; // 'STOPPED', 'STARTING', 'RUNNING', 'ERROR'
    this.publicAddress = null;
    this.activePort = null;
    this.relayHost = 'bore.pub';
    this.relayControlPort = 7835;
    this.controlSocket = null;
    this.localPort = 25565;
    this.activeSockets = new Set();
    this.retryTimer = null;
    this.retryAttempts = 0;
    this.maxRetryAttempts = 5;
    this.heartbeatTimer = null;
    this.lastLogs = [];
    this.onStatusChange = null;

    const homeDir = process.env.HOME || os.homedir();
    const isBundled = __dirname.includes('.app/Contents');
    const baseDir = isBundled
      ? path.join(homeDir, 'Library/Application Support/MinecraftServerManager')
      : path.resolve(__dirname, '..');
    this.logPath = path.join(baseDir, 'logs/tunnel.log');
    this.cachePath = path.join(baseDir, 'logs/tunnel-address.json');

    this.publicAddress = this.loadCachedAddress();
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
  async start(localPort = 25565) {
    this.localPort = parseInt(localPort, 10) || 25565;

    if (this.status === 'RUNNING' && this.controlSocket && !this.controlSocket.destroyed) {
      this.log(`Tunnel déjà actif sur ${this.publicAddress}`);
      return this.getState();
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    this.status = 'STARTING';
    this.emitChange();
    this.log(`Connexion au relais ${this.relayHost}:${this.relayControlPort} pour le port local ${this.localPort}...`);

    return new Promise((resolve) => {
      let resolved = false;

      const finish = (resultState) => {
        if (!resolved) {
          resolved = true;
          resolve(resultState);
        }
      };

      try {
        const control = net.connect({
          host: this.relayHost,
          port: this.relayControlPort,
          timeout: 8000
        });

        this.controlSocket = control;

        control.on('connect', () => {
          this.log('Liaison de contrôle établie. Demande d\'attribution de port...');
          // Protocole bore: JSON { Hello: 0 } terminé par \0
          try {
            control.write(JSON.stringify({ Hello: 0 }) + '\0');
          } catch (err) {
            this.handleError(err);
            finish(this.getState());
          }
        });

        let rxBuffer = '';
        control.on('data', (chunk) => {
          rxBuffer += chunk.toString('utf8');
          const frames = rxBuffer.split('\0');
          rxBuffer = frames.pop();

          for (const frame of frames) {
            if (!frame.trim()) continue;
            try {
              const msg = JSON.parse(frame);
              this.handleServerMessage(msg, finish);
            } catch (parseErr) {
              this.log(`Message serveur invalide : ${frame}`);
            }
          }
        });

        control.on('timeout', () => {
          this.log('Timeout de la connexion de contrôle');
          control.destroy(new Error('Connection timeout'));
        });

        control.on('error', (err) => {
          this.log(`Erreur du socket de contrôle : ${err.message}`);
          this.handleError(err);
          finish(this.getState());
        });

        control.on('close', (hadError) => {
          this.log(`Connexion de contrôle fermée${hadError ? ' avec erreur' : ''}`);
          this.cleanupSockets();
          if (this.status === 'RUNNING' || this.status === 'STARTING') {
            this.scheduleReconnect();
          }
        });

      } catch (err) {
        this.handleError(err);
        finish(this.getState());
      }
    });
  }

  handleServerMessage(msg, onReady) {
    if (msg.Hello !== undefined) {
      const assignedPort = msg.Hello;
      this.activePort = assignedPort;
      this.publicAddress = `${this.relayHost}:${assignedPort}`;
      this.status = 'RUNNING';
      this.retryAttempts = 0;
      this.saveCachedAddress(this.publicAddress);
      this.log(`Tunnel public prêt et actif : ${this.publicAddress}`);
      this.emitChange();
      if (typeof onReady === 'function') onReady(this.getState());
      return;
    }

    if (msg.Connection) {
      const connId = msg.Connection;
      this.spawnProxyStream(connId);
      return;
    }

    if (msg.Heartbeat !== undefined) {
      // Le serveur garde la session en vie
      return;
    }

    if (msg.Error) {
      this.log(`Erreur signalée par le relais : ${msg.Error}`);
      this.status = 'ERROR';
      this.emitChange();
    }
  }

  /**
   * Lorsqu'un joueur externe se connecte sur bore.pub:port,
   * le serveur nous envoie un UUID de connexion.
   * Nous ouvrons alors une nouvelle connexion TCP vers bore.pub:7835,
   * envoyons { Accept: uuid }\0, et la branchons directement sur le serveur Minecraft local.
   */
  spawnProxyStream(connId) {
    try {
      const relayStream = net.connect({
        host: this.relayHost,
        port: this.relayControlPort
      });

      this.activeSockets.add(relayStream);

      relayStream.on('connect', () => {
        relayStream.write(JSON.stringify({ Accept: connId }) + '\0');

        const localStream = net.connect({
          host: '127.0.0.1',
          port: this.localPort
        });

        this.activeSockets.add(localStream);

        localStream.on('connect', () => {
          relayStream.pipe(localStream);
          localStream.pipe(relayStream);
        });

        localStream.on('error', () => {
          relayStream.destroy();
        });

        localStream.on('close', () => {
          this.activeSockets.delete(localStream);
          relayStream.destroy();
        });
      });

      relayStream.on('error', () => {});
      relayStream.on('close', () => {
        this.activeSockets.delete(relayStream);
      });
    } catch (_) {}
  }

  handleError(err) {
    this.status = 'ERROR';
    this.emitChange();
  }

  scheduleReconnect() {
    if (this.retryAttempts >= this.maxRetryAttempts) {
      this.log(`Nombre maximal de tentatives de reconnexion atteint (${this.maxRetryAttempts}).`);
      this.status = 'ERROR';
      this.emitChange();
      return;
    }

    this.retryAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.retryAttempts), 15000);
    this.log(`Tentative de reconnexion dans ${Math.round(delay / 1000)}s (essai ${this.retryAttempts}/${this.maxRetryAttempts})...`);

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.start(this.localPort).catch(() => {});
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
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    this.retryAttempts = 0;
    this.status = 'STOPPED';
    this.publicAddress = null;
    this.activePort = null;

    if (this.controlSocket) {
      try {
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
}

module.exports = new TunnelService();

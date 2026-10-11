const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');
const minecraftService = require('./minecraft-service');
const tunnelService = require('./tunnel-service');
const modFilterService = require('./mod-filter-service');
const vanillaInstaller = require('./vanilla-installer-service');
const playerDataService = require('./player-data-service');
const modTextureService = require('./mod-texture-service');
const configService = require('./config-service');
const packageJson = require('../package.json');

function isNewerVersion(remote, local) {
  const pRemote = String(remote || '').split('.').map(n => parseInt(n, 10) || 0);
  const pLocal = String(local || '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pRemote.length, pLocal.length); i++) {
    const r = pRemote[i] || 0;
    const l = pLocal[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

// Redirection et sauvegarde des logs
const LOGS_DIR = path.resolve(__dirname, "../logs");
if (!fs.existsSync(LOGS_DIR)) {
  try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch (_) {}
}
const SERVER_LOG_FILE = path.join(LOGS_DIR, "server.log");
function writeServerLog(level, ...args) {
  const msg = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  try { fs.appendFileSync(SERVER_LOG_FILE, line, "utf8"); } catch (_) {}
}
const _origLog = console.log;
const _origErr = console.error;
console.log = function(...args) { writeServerLog("INFO", ...args); _origLog.apply(console, args); };
console.error = function(...args) { writeServerLog("ERROR", ...args); _origErr.apply(console, args); };
process.on("uncaughtException", (err) => {
  writeServerLog("FATAL", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (reason) => {
  writeServerLog("WARN", "Unhandled Rejection:", reason);
});

const DEFAULT_PORT = 4567;
const PUBLIC_DIR = path.resolve(__dirname, '../public');

function getCommandSuggestions(query, worldId, mcService) {
  const cleanQ = (query || '').trim().replace(/^\//, '').toLowerCase();

  const vanillaCmds = [
    { cmd: 'help', desc: 'Affiche la liste des commandes ou l’aide' },
    { cmd: 'list', desc: 'Liste les joueurs actuellement connectés' },
    { cmd: 'time set day', desc: 'Règle l’heure sur le jour (1000 ticks)' },
    { cmd: 'time set night', desc: 'Règle l’heure sur la nuit (13000 ticks)' },
    { cmd: 'time set noon', desc: 'Règle l’heure à midi (6000 ticks)' },
    { cmd: 'time set midnight', desc: 'Règle l’heure à minuit (18000 ticks)' },
    { cmd: 'time query daytime', desc: 'Affiche l’heure actuelle du jeu' },
    { cmd: 'weather clear', desc: 'Définit le temps sur dégagé' },
    { cmd: 'weather rain', desc: 'Déclenche la pluie' },
    { cmd: 'weather thunder', desc: 'Déclenche un orage violent' },
    { cmd: 'gamemode survival', desc: 'Passe en mode Survie' },
    { cmd: 'gamemode creative', desc: 'Passe en mode Créatif' },
    { cmd: 'gamemode adventure', desc: 'Passe en mode Aventure' },
    { cmd: 'gamemode spectator', desc: 'Passe en mode Spectateur' },
    { cmd: 'difficulty peaceful', desc: 'Définit la difficulté sur Paisible' },
    { cmd: 'difficulty easy', desc: 'Définit la difficulté sur Facile' },
    { cmd: 'difficulty normal', desc: 'Définit la difficulté sur Normal' },
    { cmd: 'difficulty hard', desc: 'Définit la difficulté sur Difficile' },
    { cmd: 'op <joueur>', desc: 'Accorde les privilèges d’opérateur' },
    { cmd: 'deop <joueur>', desc: 'Retire les privilèges d’opérateur' },
    { cmd: 'whitelist on', desc: 'Active la liste blanche' },
    { cmd: 'whitelist off', desc: 'Désactive la liste blanche' },
    { cmd: 'whitelist list', desc: 'Affiche les joueurs sur liste blanche' },
    { cmd: 'whitelist add <joueur>', desc: 'Ajoute un joueur à la liste blanche' },
    { cmd: 'whitelist remove <joueur>', desc: 'Retire un joueur de la liste blanche' },
    { cmd: 'whitelist reload', desc: 'Recharge la liste blanche' },
    { cmd: 'tp <joueur> <cible>', desc: 'Téléporte une entité' },
    { cmd: 'give <joueur> <item>', desc: 'Donne un objet à un joueur' },
    { cmd: 'clear <joueur>', desc: 'Vide l’inventaire d’un joueur' },
    { cmd: 'kill <cible>', desc: 'Élimine une entité ou joueur' },
    { cmd: 'kick <joueur> [raison]', desc: 'Expulse un joueur du serveur' },
    { cmd: 'ban <joueur> [raison]', desc: 'Bannit un joueur du serveur' },
    { cmd: 'pardon <joueur>', desc: 'Débannit un joueur' },
    { cmd: 'say <message>', desc: 'Diffuse un message à tous les joueurs' },
    { cmd: 'tell <joueur> <message>', desc: 'Envoie un message privé' },
    { cmd: 'save-all', desc: 'Sauvegarde l’ensemble du monde sur le disque' },
    { cmd: 'save-off', desc: 'Désactive la sauvegarde automatique' },
    { cmd: 'save-on', desc: 'Active la sauvegarde automatique' },
    { cmd: 'stop', desc: 'Arrête proprement le serveur' },
    { cmd: 'gamerule keepInventory true', desc: 'Conserve l’inventaire à la mort' },
    { cmd: 'gamerule doDaylightCycle false', desc: 'Fige le cycle jour/nuit' },
    { cmd: 'gamerule mobGriefing false', desc: 'Empêche les dégâts des monstres' },
    { cmd: 'gamerule doWeatherCycle false', desc: 'Fige la météo' },
    { cmd: 'locate structure <type>', desc: 'Localise la structure la plus proche' },
    { cmd: 'locate biome <biome>', desc: 'Localise un biome' },
    { cmd: 'effect give <joueur> <effet>', desc: 'Applique un effet de potion' },
    { cmd: 'effect clear <joueur>', desc: 'Retire tous les effets' },
    { cmd: 'enchant <joueur> <enchant>', desc: 'Enchante l’objet en main' },
    { cmd: 'summon <entite>', desc: 'Fait apparaître une entité' },
    { cmd: 'setworldspawn [x y z]', desc: 'Définit le point de spawn global' },
    { cmd: 'spawnpoint [joueur]', desc: 'Définit le spawn individuel' },
    { cmd: 'seed', desc: 'Affiche la graine de génération' },
    { cmd: 'xp add <joueur> <quantite>', desc: 'Donne de l’expérience' }
  ];

  const modCmds = [];
  if (worldId) {
    const worldPath = path.join(mcService.gamesDir, worldId);
    const modsDir = path.join(worldPath, 'mods');
    if (fs.existsSync(modsDir)) {
      try {
        const modFiles = fs.readdirSync(modsDir).map(f => f.toLowerCase());
        const has = (k) => modFiles.some(m => m.includes(k));
        if (has('iron') || has('spell')) {
          modCmds.push({ cmd: 'cast <sort>', desc: 'Iron\'s Spells: Lance un sort magique' });
          modCmds.push({ cmd: 'learn_spell <sort>', desc: 'Iron\'s Spells: Apprend un sort' });
        }
        if (has('curios')) {
          modCmds.push({ cmd: 'curios clear <joueur>', desc: 'Curios API: Vide les accessoires' });
        }
        if (has('iceandfire') || has('ice_and_fire')) {
          modCmds.push({ cmd: 'dragon tame <joueur>', desc: 'Ice & Fire: Apprivoise le dragon' });
        }
        if (has('spark')) {
          modCmds.push({ cmd: 'spark tps', desc: 'Spark: Affiche les performances et TPS' });
          modCmds.push({ cmd: 'spark sampler', desc: 'Spark: Profiler CPU' });
        }
        if (has('waystones')) {
          modCmds.push({ cmd: 'waystones reload', desc: 'Waystones: Recharge la config' });
        }
        if (has('journeymap')) {
          modCmds.push({ cmd: 'jm reload', desc: 'JourneyMap: Recharge les permissions' });
        }
        if (has('jei') || has('rei') || has('emi')) {
          modCmds.push({ cmd: 'jei hide', desc: 'JEI: Affiche/masque des objets' });
        }
      } catch (e) {}
    }

    const hasNeo = fs.existsSync(path.join(worldPath, 'libraries/net/neoforged'));
    const hasForge = fs.existsSync(path.join(worldPath, 'libraries/net/minecraftforge'));
    const hasFabric = fs.existsSync(path.join(worldPath, 'libraries/net/fabricmc'));
    if (hasNeo) {
      modCmds.push({ cmd: 'neoforge tps', desc: 'NeoForge: TPS par dimension' });
      modCmds.push({ cmd: 'neoforge mods', desc: 'NeoForge: Liste des mods actifs' });
    } else if (hasForge) {
      modCmds.push({ cmd: 'forge tps', desc: 'Forge: TPS par dimension' });
    } else if (hasFabric) {
      modCmds.push({ cmd: 'fabric mods', desc: 'Fabric: Liste des mods chargés' });
    }
  }

  const allCmds = [...modCmds, ...vanillaCmds];
  if (!cleanQ) {
    return allCmds.slice(0, 5);
  }

  const prefixMatches = allCmds.filter(c => c.cmd.toLowerCase().startsWith(cleanQ));
  const otherMatches = allCmds.filter(c => !c.cmd.toLowerCase().startsWith(cleanQ) && c.cmd.toLowerCase().includes(cleanQ));
  return [...prefixMatches, ...otherMatches].slice(0, 5);
}


const _skinBufferCache = new Map();
const SKINS_CACHE_DIR = path.join(PUBLIC_DIR, 'cache', 'skins');
if (!fs.existsSync(SKINS_CACHE_DIR)) {
  fs.mkdirSync(SKINS_CACHE_DIR, { recursive: true });
}

function fetchHttpBuffer(url, timeoutMs = 6000) {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https:') ? https : http;
      const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchHttpBuffer(res.headers.location, timeoutMs).then(resolve);
        }
        if (res.statusCode !== 200) return resolve(null);
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', () => resolve(null));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve(null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

async function getPlayerSkinBuffer(playerName, playerUuid = null) {
  const safeName = (playerName || 'steve').replace(/[^a-zA-Z0-9_]/g, '') || 'steve';
  const cleanUuid = playerUuid ? playerUuid.replace(/[^a-zA-Z0-9]/g, '') : null;
  const cacheKey = cleanUuid || safeName;

  if (_skinBufferCache.has(cacheKey)) {
    return _skinBufferCache.get(cacheKey);
  }
  if (_skinBufferCache.has(safeName)) {
    return _skinBufferCache.get(safeName);
  }

  const diskPath = path.join(SKINS_CACHE_DIR, `${cacheKey}.png`);
  if (fs.existsSync(diskPath)) {
    try {
      const buf = fs.readFileSync(diskPath);
      if (buf && buf.length > 500) {
        _skinBufferCache.set(cacheKey, buf);
        _skinBufferCache.set(safeName, buf);
        return buf;
      }
    } catch (e) {}
  }

  // Tenter de retrouver l'UUID depuis les fichiers usercache.json si non fourni
  let resolvedUuid = cleanUuid;
  if (!resolvedUuid && safeName.toLowerCase() !== 'steve') {
    try {
      const worlds = fs.readdirSync(minecraftService.gamesDir);
      for (const w of worlds) {
        const uc = path.join(minecraftService.gamesDir, w, 'usercache.json');
        if (fs.existsSync(uc)) {
          const arr = JSON.parse(fs.readFileSync(uc, 'utf8'));
          const found = arr.find(e => e.name && e.name.toLowerCase() === safeName.toLowerCase());
          if (found && found.uuid) {
            resolvedUuid = found.uuid.replace(/[^a-zA-Z0-9]/g, '');
            break;
          }
        }
      }
    } catch (e) {}
  }

  const remoteUrls = [];
  if (resolvedUuid) {
    remoteUrls.push(
      `https://crafatar.com/skins/${resolvedUuid}`,
      `https://mc-heads.net/skin/${resolvedUuid}`,
      `https://minotar.net/skin/${resolvedUuid}`,
      `https://visage.surgeplay.com/skin/${resolvedUuid}`
    );
  }
  remoteUrls.push(
    `https://minotar.net/skin/${safeName}`,
    `https://mc-heads.net/skin/${safeName}`
  );

  for (const u of remoteUrls) {
    const remoteBuf = await fetchHttpBuffer(u, 6000);
    if (remoteBuf && remoteBuf.length > 500) {
      try {
        fs.writeFileSync(diskPath, remoteBuf);
      } catch (e) {}
      _skinBufferCache.set(cacheKey, remoteBuf);
      _skinBufferCache.set(safeName, remoteBuf);
      return remoteBuf;
    }
  }

  // Fallback vers le skin local Steve officiel (ne pas cacher en mémoire pour permettre une réévaluation future)
  const fallbackPath = path.join(PUBLIC_DIR, 'assets', 'minecraft', 'skin', 'steve.png');
  let fallbackBuf = null;
  if (fs.existsSync(fallbackPath)) {
    fallbackBuf = fs.readFileSync(fallbackPath);
  } else {
    fallbackBuf = Buffer.alloc(0);
  }
  return fallbackBuf;
}


// Liste des clients SSE
const sseClients = new Set();

minecraftService.addListener((event) => {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
});

tunnelService.onStatusChange = (tState) => {
  const payload = `data: ${JSON.stringify({ type: 'tunnel', data: tState })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
};

/**
 * Helper JSON response
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

/**
 * Helper Parse Body
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB max JSON
        req.connection.destroy();
        reject(new Error('Body payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Handle multipart upload for modpacks (multiple jars, zip, mrpack)
 */
function handleMultipartUpload(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) {
      return reject(new Error('Format multipart/form-data invalide (boundary manquant)'));
    }
    const boundaryStr = boundaryMatch[1] || boundaryMatch[2];
    const boundaryBuf = Buffer.from(`--${boundaryStr}`);

    const chunks = [];
    let totalLen = 0;
    const MAX_UPLOAD_BYTES = 2048 * 1024 * 1024; // 2 Go max pour les gros packs et collections de mods

    req.on('data', chunk => {
      chunks.push(chunk);
      totalLen += chunk.length;
      if (totalLen > MAX_UPLOAD_BYTES) {
        req.destroy();
        reject(new Error('Taille du transfert trop importante (max 500 Mo)'));
      }
    });

    req.on('end', () => {
      try {
        const fullBuf = Buffer.concat(chunks);
        const stagingDir = path.join(os.tmpdir(), `mc_upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
        const stagingModsDir = path.join(stagingDir, 'mods');
        fs.mkdirSync(stagingModsDir, { recursive: true });

        let pos = 0;
        const uploadedFiles = [];
        let firstFilename = 'modpack';

        while (pos < fullBuf.length) {
          const bIdx = fullBuf.indexOf(boundaryBuf, pos);
          if (bIdx === -1) break;

          const partStart = bIdx + boundaryBuf.length;
          if (fullBuf.slice(partStart, partStart + 2).toString() === '--') {
            break;
          }

          const contentStart = partStart + 2;
          const nextBIdx = fullBuf.indexOf(boundaryBuf, contentStart);
          if (nextBIdx === -1) break;

          const partBuffer = fullBuf.slice(contentStart, nextBIdx - 2);
          pos = nextBIdx;

          const headerEnd = partBuffer.indexOf(Buffer.from('\r\n\r\n'));
          if (headerEnd === -1) continue;

          const headerStr = partBuffer.slice(0, headerEnd).toString('utf8');
          const bodyBuffer = partBuffer.slice(headerEnd + 4);

          const fnMatch = headerStr.match(/filename="([^"]+)"/);
          if (fnMatch) {
            const rawFilename = fnMatch[1].replace(/\\/g, '/');
            const cleanParts = rawFilename.split('/').filter(p => p && p !== '..' && p !== '.');
            if (cleanParts.length === 0) continue;
            const relPath = cleanParts.join(path.sep);
            const filename = cleanParts[cleanParts.length - 1];
            if (uploadedFiles.length === 0) firstFilename = filename;

            let destFile;
            if (cleanParts.length === 1 && filename.toLowerCase().endsWith('.jar')) {
              destFile = path.join(stagingModsDir, filename);
            } else {
              destFile = path.join(stagingDir, relPath);
            }

            fs.mkdirSync(path.dirname(destFile), { recursive: true });
            fs.writeFileSync(destFile, bodyBuffer);
            uploadedFiles.push({ filename, relPath, path: destFile, size: bodyBuffer.length });
          }
        }

        if (uploadedFiles.length === 0) {
          return reject(new Error('Aucun fichier valide reçu dans la requête.'));
        }

        const jarCount = fs.readdirSync(stagingModsDir).filter(f => f.toLowerCase().endsWith('.jar')).length;
        let sourcePath = stagingDir;
        if (jarCount === 0 && uploadedFiles.length === 1 && (firstFilename.toLowerCase().endsWith('.zip') || firstFilename.toLowerCase().endsWith('.mrpack'))) {
          sourcePath = uploadedFiles[0].path;
        } else {
          const rootEntries = fs.readdirSync(stagingDir).filter(f => !f.startsWith('.') && f !== '__MACOSX' && f !== 'mods');
          if (rootEntries.length === 1 && fs.statSync(path.join(stagingDir, rootEntries[0])).isDirectory()) {
            sourcePath = path.join(stagingDir, rootEntries[0]);
          } else {
            sourcePath = stagingDir;
          }
        }

        resolve({
          sourcePath,
          uploadedFiles,
          originalFilename: uploadedFiles.length === 1 ? firstFilename : `${uploadedFiles.length} fichiers`
        });
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

/**
 * Serveur HTTP Principal
 */
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  try {
    // 1. SSE Stream
    if (pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(': connected\n\n');
      sseClients.add(res);

      // Envoyer l'état initial
      res.write(`data: ${JSON.stringify({ type: 'status', data: minecraftService.getState() })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'tunnel', data: tunnelService.getState() })}\n\n`);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // 2. API Status
    if (pathname === '/api/status' && method === 'GET') {
      const isWin = process.platform === 'win32';
      const appSupportDir = isWin
        ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'MinecraftServerManager')
        : path.join(os.homedir(), 'Library/Application Support/MinecraftServerManager');
      const welcomeFlagAppSupport = path.join(appSupportDir, '.welcome-completed');
      const welcomeFlagLocal = path.join(__dirname, '..', '.welcome-completed');

      const existingWorlds = await minecraftService.listWorlds();
      const hasWorlds = Array.isArray(existingWorlds) && existingWorlds.length > 0;
      const isWelcomeCompleted = fs.existsSync(welcomeFlagAppSupport) || fs.existsSync(welcomeFlagLocal) || hasWorlds;

      return sendJson(res, 200, {
        minecraft: minecraftService.getState(),
        tunnel: tunnelService.getState(),
        welcomeNeeded: !isWelcomeCompleted
      });
    }

    // 2b. API Welcome Dismiss
    if (pathname === '/api/app/welcome-dismiss' && method === 'POST') {
      const isWin = process.platform === 'win32';
      const appSupportDir = isWin
        ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'MinecraftServerManager')
        : path.join(os.homedir(), 'Library/Application Support/MinecraftServerManager');
      try {
        if (!fs.existsSync(appSupportDir)) fs.mkdirSync(appSupportDir, { recursive: true });
        fs.writeFileSync(path.join(appSupportDir, '.welcome-completed'), new Date().toISOString(), 'utf8');
      } catch (e) {}
      try {
        fs.writeFileSync(path.join(__dirname, '..', '.welcome-completed'), new Date().toISOString(), 'utf8');
      } catch (e) {}
      return sendJson(res, 200, { success: true });
    }

    // 2c. API Check Update
    if (pathname === '/api/app/check-update' && method === 'GET') {
      const currentVersion = packageJson.version || '1.0.5';
      try {
        const options = {
          hostname: 'api.github.com',
          path: '/repos/Gabriel-Jagueneau/McS-Manager/releases/latest',
          method: 'GET',
          headers: {
            'User-Agent': 'McS-Manager',
            'Accept': 'application/vnd.github.v3+json'
          },
          timeout: 3500
        };

        const releaseData = await new Promise((resolve) => {
          const gitReq = https.request(options, (gitRes) => {
            let data = '';
            gitRes.on('data', chunk => data += chunk);
            gitRes.on('end', () => {
              if (gitRes.statusCode === 200) {
                try { resolve(JSON.parse(data)); } catch (_) { resolve(null); }
              } else {
                resolve(null);
              }
            });
          });
          gitReq.on('error', () => resolve(null));
          gitReq.on('timeout', () => { gitReq.destroy(); resolve(null); });
          gitReq.end();
        });

        if (!releaseData || !releaseData.tag_name) {
          return sendJson(res, 200, {
            currentVersion,
            latestVersion: currentVersion,
            updateAvailable: false
          });
        }

        const latestTag = releaseData.tag_name.replace(/^v/i, '').trim();
        const updateAvailable = isNewerVersion(latestTag, currentVersion);

        let downloadUrl = releaseData.html_url;
        if (releaseData.assets && releaseData.assets.length > 0) {
          const isWin = process.platform === 'win32';
          const matchAsset = releaseData.assets.find(a => 
            isWin ? a.name.endsWith('.exe') : (a.name.endsWith('.pkg') || a.name.endsWith('.dmg'))
          );
          if (matchAsset && matchAsset.browser_download_url) {
            downloadUrl = matchAsset.browser_download_url;
          }
        }

        return sendJson(res, 200, {
          currentVersion,
          latestVersion: latestTag,
          updateAvailable,
          releaseName: releaseData.name || `Version ${latestTag}`,
          releaseNotes: releaseData.body || '',
          releaseUrl: releaseData.html_url,
          downloadUrl
        });
      } catch (err) {
        return sendJson(res, 200, {
          currentVersion: packageJson.version || '1.0.5',
          latestVersion: packageJson.version || '1.0.5',
          updateAvailable: false
        });
      }
    }

    // 2d. API Update Summary (Post-mise à jour)
    if (pathname === '/api/app/update-summary' && method === 'GET') {
      const summaryFile = path.resolve(__dirname, '..', '.update-summary.json');
      if (fs.existsSync(summaryFile)) {
        try {
          const raw = fs.readFileSync(summaryFile, 'utf8');
          const summary = JSON.parse(raw);
          try { fs.unlinkSync(summaryFile); } catch (_) {}
          return sendJson(res, 200, { hasSummary: true, summary });
        } catch (_) {
          return sendJson(res, 200, { hasSummary: false });
        }
      }
      return sendJson(res, 200, { hasSummary: false });
    }

    // 2e. API Apply Update (Auto-mise à jour transparente sans installeur externe)
    if (pathname === '/api/app/apply-update' && method === 'POST') {
      try {
        const { targetVersion, releaseName, releaseNotes } = await parseBody(req);
        if (!targetVersion) {
          return sendJson(res, 400, { error: 'targetVersion requise' });
        }

        const cleanTag = String(targetVersion).replace(/^v/i, '').trim();
        const tagName = `v${cleanTag}`;
        const tempDir = path.join(os.tmpdir(), `mcs-update-${Date.now()}`);

        fs.mkdirSync(tempDir, { recursive: true });
        const archiveFile = path.join(tempDir, 'update.tar.gz');

        // 1. Télécharger l'archive des sources de la release
        const downloadUrls = [
          `https://codeload.github.com/Gabriel-Jagueneau/McS-Manager/tar.gz/refs/tags/${tagName}`,
          `https://github.com/Gabriel-Jagueneau/McS-Manager/archive/refs/tags/${tagName}.tar.gz`
        ];

        let downloaded = false;
        for (const dlUrl of downloadUrls) {
          try {
            execSync(`curl -sL --max-time 30 "${dlUrl}" -o "${archiveFile}"`);
            if (fs.existsSync(archiveFile) && fs.statSync(archiveFile).size > 10000) {
              downloaded = true;
              break;
            }
          } catch (_) {}
        }

        if (!downloaded) {
          try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
          return sendJson(res, 500, { error: "Échec du téléchargement des sources de la mise à jour depuis GitHub." });
        }

        // 2. Extraire l'archive
        try {
          execSync(`tar -xzf "${archiveFile}" -C "${tempDir}"`);
        } catch (tarErr) {
          try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
          return sendJson(res, 500, { error: "Échec de décompression de l'archive téléchargée." });
        }

        // 3. Localiser le sous-dossier manager extrait
        const entries = fs.readdirSync(tempDir);
        let extractedManagerDir = null;
        for (const entry of entries) {
          const cand = path.join(tempDir, entry, 'manager');
          if (fs.existsSync(cand) && fs.existsSync(path.join(cand, 'package.json'))) {
            extractedManagerDir = cand;
            break;
          }
        }

        if (!extractedManagerDir) {
          try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
          return sendJson(res, 500, { error: "L'archive téléchargée ne contient pas le dossier manager." });
        }

        // 4. Dossiers à mettre à jour
        const currentManagerDir = path.resolve(__dirname, '..');
        const targetDirs = [currentManagerDir];

        const macAppManager = '/Applications/Minecraft Server Manager.app/Contents/Resources/manager';
        if (fs.existsSync(macAppManager) && path.resolve(macAppManager) !== path.resolve(currentManagerDir)) {
          targetDirs.push(macAppManager);
        }

        const copyFolderRecursive = (src, dest) => {
          if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
          const items = fs.readdirSync(src);
          for (const item of items) {
            const sPath = path.join(src, item);
            const dPath = path.join(dest, item);
            if (fs.statSync(sPath).isDirectory()) {
              copyFolderRecursive(sPath, dPath);
            } else {
              fs.copyFileSync(sPath, dPath);
            }
          }
        };

        for (const tDir of targetDirs) {
          try {
            // Mise à jour de src/
            copyFolderRecursive(path.join(extractedManagerDir, 'src'), path.join(tDir, 'src'));
            // Mise à jour de public/
            copyFolderRecursive(path.join(extractedManagerDir, 'public'), path.join(tDir, 'public'));
            // Mise à jour de package.json
            fs.copyFileSync(path.join(extractedManagerDir, 'package.json'), path.join(tDir, 'package.json'));

            // Mise à jour de Info.plist si on se trouve dans un bundle macOS (.app)
            const possiblePlists = [
              path.resolve(tDir, '../../Info.plist'),
              '/Applications/Minecraft Server Manager.app/Contents/Info.plist'
            ];
            for (const pPath of possiblePlists) {
              if (fs.existsSync(pPath)) {
                try {
                  let pContent = fs.readFileSync(pPath, 'utf8');
                  pContent = pContent.replace(
                    /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+(<\/string>)/,
                    `$1${cleanTag}$2`
                  );
                  pContent = pContent.replace(
                    /(<key>CFBundleVersion<\/key>\s*<string>)[^<]+(<\/string>)/,
                    `$1${cleanTag}$2`
                  );
                  fs.writeFileSync(pPath, pContent, 'utf8');
                } catch (pErr) {
                  console.warn(`[Updater] Impossible de modifier ${pPath}:`, pErr.message);
                }
              }
            }

            // Écriture du résumé post-mise à jour
            const summaryData = {
              version: cleanTag,
              releaseName: releaseName || `Version ${cleanTag}`,
              releaseNotes: releaseNotes || 'Mise à jour de sécurité et améliorations de performances.',
              updatedAt: Date.now()
            };
            fs.writeFileSync(path.join(tDir, '.update-summary.json'), JSON.stringify(summaryData, null, 2), 'utf8');
          } catch (errCopy) {
            console.error(`Erreur de copie de mise à jour vers ${tDir}:`, errCopy);
          }
        }

        // Nettoyage temporaire
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}

        // Réponse immédiate au client avant le redémarrage
        sendJson(res, 200, {
          success: true,
          version: cleanTag,
          message: "Mise à jour installée avec succès. Rechargement en cours..."
        });

        // 5. Redémarrage propre du serveur en arrière-plan
        setTimeout(() => {
          try {
            const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
              detached: true,
              stdio: 'ignore',
              cwd: path.resolve(__dirname, '..'),
              env: process.env
            });
            child.unref();
            process.exit(0);
          } catch (e) {
            process.exit(0);
          }
        }, 1200);

        return;
      } catch (err) {
        console.error("Erreur critique apply-update:", err);
        return sendJson(res, 500, { error: err.message || "Erreur interne lors de la mise à jour." });
      }
    }

    // 3. API Worlds List
    if (pathname === '/api/worlds' && method === 'GET') {
      const worlds = await minecraftService.listWorlds();
      return sendJson(res, 200, { worlds });
    }

    // 4. API Start World
    if (pathname === '/api/worlds/start' && method === 'POST') {
      const { worldId } = await parseBody(req);
      if (!worldId) return sendJson(res, 400, { error: 'Paramètre worldId manquant.' });
      const state = await minecraftService.startWorld(worldId);
      return sendJson(res, 200, { success: true, state });
    }

    // 4b. API Repair World
    if (pathname === '/api/worlds/repair' && method === 'POST') {
      const { worldId } = await parseBody(req);
      if (!worldId) return sendJson(res, 400, { error: 'Paramètre worldId manquant.' });
      try {
        const result = await minecraftService.repairWorld(worldId);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 500, { error: `Échec de la réparation: ${err.message}` });
      }
    }

    // 5. API Stop World
    if (pathname === '/api/worlds/stop' && method === 'POST') {
      const { force } = await parseBody(req);
      const state = await minecraftService.stopWorld(!!force);
      return sendJson(res, 200, { success: true, state });
    }

    // 6. API Send Command
    if (pathname === '/api/worlds/command' && method === 'POST') {
      const { command, worldId } = await parseBody(req);
      if (!command) return sendJson(res, 400, { error: 'Commande manquante.' });
      const result = minecraftService.sendCommand(command, worldId);
      return sendJson(res, 200, result);
    }

    // 6b. API Get World Properties
    if (pathname === '/api/worlds/properties' && method === 'GET') {
      const worldId = parsedUrl.searchParams.get('worldId');
      if (!worldId) return sendJson(res, 400, { error: 'worldId manquant.' });
      const data = await minecraftService.getWorldProperties(worldId);
      return sendJson(res, 200, data);
    }

    // 6c. API Save World Properties
    if (pathname === '/api/worlds/properties' && method === 'POST') {
      const { worldId, content } = await parseBody(req);
      if (!worldId || typeof content !== 'string') {
        return sendJson(res, 400, { error: 'worldId ou content manquant.' });
      }
      const data = await minecraftService.saveWorldProperties(worldId, content);
      return sendJson(res, 200, data);
    }

    // 6d. API Rename World
    if (pathname === '/api/worlds/rename' && method === 'POST') {
      const { worldId, newName } = await parseBody(req);
      if (!worldId || !newName) {
        return sendJson(res, 400, { error: 'worldId ou newName manquant.' });
      }
      try {
        const data = await minecraftService.renameWorld(worldId, newName);
        return sendJson(res, 200, data);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    // 6e. API Delete World
    if (pathname === '/api/worlds/delete' && method === 'POST') {
      const { worldId } = await parseBody(req);
      if (!worldId) {
        return sendJson(res, 400, { error: 'worldId manquant.' });
      }
      const data = await minecraftService.deleteWorld(worldId);
      return sendJson(res, 200, data);
    }

    // 6f. API Open World Folder in Finder
    if (pathname === '/api/worlds/open-folder' && method === 'POST') {
      const { worldId, customPath } = await parseBody(req);
      const targetPath = customPath || (worldId ? path.join(minecraftService.gamesDir, worldId) : null);
      if (!targetPath) return sendJson(res, 400, { error: 'Chemin ou worldId manquant.' });
      if (fs.existsSync(targetPath)) {
        const safePath = targetPath.replace(/"/g, '\\"');
        exec(`osascript -e 'tell application "Finder" to reveal POSIX file "${safePath}"' -e 'tell application "Finder" to activate'`, (err) => {
          if (err) {
            exec(`open "${safePath}"`, (err2) => {
              if (err2) {
                exec(`open -R "${safePath}"`);
              }
            });
          }
        });
        return sendJson(res, 200, { success: true, path: targetPath });
      }
      return sendJson(res, 404, { error: 'Dossier introuvable.' });
    }

    // 6g. API Reset World Dimension
    if (pathname === '/api/worlds/reset-dimension' && method === 'POST') {
      const { worldId, dimensionId } = await parseBody(req);
      if (!worldId || !dimensionId) return sendJson(res, 400, { error: 'Paramètres manquants.' });
      try {
        const result = await minecraftService.resetDimension(worldId, dimensionId);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    // 6h. API Export World Zip
    if (pathname === '/api/worlds/export-destination' && method === 'GET') {
      const systemDownloads = path.join(os.homedir(), 'Downloads');
      const currentDest = configService.getSettings().downloadPath || systemDownloads;
      return sendJson(res, 200, {
        destDir: currentDest,
        defaultDestDir: systemDownloads
      });
    }

    // 6h-bis. API Global App Settings
    if (pathname === '/api/settings' && method === 'GET') {
      return sendJson(res, 200, configService.getSettings());
    }
    if (pathname === '/api/settings' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const updated = configService.saveSettings(body);
        return sendJson(res, 200, { success: true, settings: updated });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    if (pathname === '/api/settings/choose-folder' && method === 'POST') {
      try {
        const { exec } = require('child_process');
        if (process.platform === 'win32') {
          const ps = 'Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = "Sélectionnez le dossier de téléchargement"; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }';
          exec(`powershell -NoProfile -NonInteractive -Command "${ps}"`, (err, stdout) => {
            if (err || !stdout || !stdout.trim()) {
              return sendJson(res, 200, { cancelled: true });
            }
            const chosen = stdout.trim().replace(/\r?\n/g, '');
            return sendJson(res, 200, { success: true, folder: chosen });
          });
          return;
        } else {
          exec(`osascript -e 'tell application "System Events" to activate' -e 'POSIX path of (choose folder with prompt "Sélectionnez le dossier de téléchargement")'`, (err, stdout) => {
            if (err || !stdout || !stdout.trim()) {
              return sendJson(res, 200, { cancelled: true });
            }
            let chosen = stdout.trim();
            if (chosen.endsWith('/')) chosen = chosen.slice(0, -1);
            return sendJson(res, 200, { success: true, folder: chosen });
          });
          return;
        }
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (pathname === '/api/worlds/export-all' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const destDir = body.destDir || null;
        const result = await minecraftService.exportAllWorldsZip(destDir);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 500, { error: `Erreur exportation globale: ${err.message}` });
      }
    }

    if (pathname === '/api/worlds/export' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const worldId = body.worldId;
        const destDir = body.destDir || null;
        if (!worldId) return sendJson(res, 400, { error: 'worldId manquant.' });
        const result = await minecraftService.exportWorldZip(worldId, destDir);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 500, { error: `Erreur exportation: ${err.message}` });
      }
    }

    if (pathname === '/api/worlds/export' && method === 'GET') {
      const worldId = parsedUrl.searchParams.get('worldId');
      if (!worldId) return sendJson(res, 400, { error: 'worldId manquant.' });
      const targetDir = configService.getSettings().downloadPath || path.join(os.homedir(), 'Downloads');
      try {
        const result = await minecraftService.exportWorldZip(worldId, targetDir);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 500, { error: `Erreur exportation: ${err.message}` });
      }
    }

    if (pathname === '/api/worlds/download-export' && method === 'GET') {
      const token = parsedUrl.searchParams.get('token');
      const fileName = parsedUrl.searchParams.get('file') || 'sauvegarde.zip';
      if (!token || !minecraftService.pendingExportDownloads || !minecraftService.pendingExportDownloads.has(token)) {
        return sendJson(res, 404, { error: 'Lien de téléchargement expiré ou introuvable.' });
      }
      const entry = minecraftService.pendingExportDownloads.get(token);
      if (!fs.existsSync(entry.filePath)) {
        minecraftService.pendingExportDownloads.delete(token);
        return sendJson(res, 404, { error: 'Fichier temporaire introuvable.' });
      }
      const stat = fs.statSync(entry.filePath);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(entry.fileName || fileName)}"`,
        'Content-Length': stat.size
      });
      const stream = fs.createReadStream(entry.filePath);
      stream.pipe(res);
      stream.on('end', () => {
        minecraftService.pendingExportDownloads.delete(token);
        setTimeout(() => { try { fs.unlinkSync(entry.filePath); } catch (e) {} }, 2000);
      });
      return;
    }

    // 6i. API Inspect World Zip (Détection auto lanceur et version)
    if (pathname === '/api/worlds/inspect-zip' && method === 'POST') {
      try {
        const upload = await handleMultipartUpload(req);
        const result = await minecraftService.inspectWorldZip(upload.sourcePath);
        return sendJson(res, 200, {
          ...result,
          uploadedPath: upload.sourcePath
        });
      } catch (err) {
        return sendJson(res, 400, { error: `Erreur analyse archive: ${err.message}` });
      }
    }

    // 6i-bis. API Inspect Local World Path (Dossier ou Zip sélectionné dans le Finder sans upload multipart)
    if (pathname === '/api/worlds/inspect-local' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const localPath = body.path;
        if (!localPath || !fs.existsSync(localPath)) {
          return sendJson(res, 400, { error: 'Dossier ou archive introuvable sur le disque.' });
        }
        const result = await minecraftService.inspectWorldZip(localPath);
        return sendJson(res, 200, {
          ...result,
          uploadedPath: localPath
        });
      } catch (err) {
        return sendJson(res, 400, { error: `Erreur analyse monde local: ${err.message}` });
      }
    }

    // 6j. API Import World (Zip ou Dossier)
    if (pathname === '/api/worlds/import' && method === 'POST') {
      try {
        const contentType = req.headers['content-type'] || '';
        let sourcePath = null;
        let worldName = null;
        let type = 'vanilla';
        let version = '1.21.1';

        if (contentType.includes('application/json')) {
          const body = await parseBody(req);
          sourcePath = body.stagedPath || body.path;
          worldName = body.name || null;
          type = body.type || 'vanilla';
          version = body.version || '1.21.1';
          if (!sourcePath || !fs.existsSync(sourcePath)) {
            return sendJson(res, 400, { error: 'Fichier ou dossier d\'importation introuvable.' });
          }
        } else {
          const upload = await handleMultipartUpload(req);
          sourcePath = upload.sourcePath;
          const urlParams = parsedUrl.searchParams;
          worldName = urlParams.get('name') || null;
          type = urlParams.get('type') || 'vanilla';
          version = urlParams.get('version') || '1.21.1';
        }

        const result = await minecraftService.importWorldZip(sourcePath, worldName, type, version);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 400, { error: `Erreur import: ${err.message}` });
      }
    }

    // 6k. API Command Suggestions
    if (pathname === '/api/worlds/command-suggestions' && method === 'GET') {
      const worldId = parsedUrl.searchParams.get('worldId') || minecraftService.activeWorld || '';
      const query = parsedUrl.searchParams.get('q') || '';
      const suggestions = getCommandSuggestions(query, worldId, minecraftService);
      return sendJson(res, 200, { suggestions });
    }

    // 6l. API Player Manager
    if (pathname === '/api/players' && method === 'GET') {
      const worldId = parsedUrl.searchParams.get('worldId');
      if (!worldId) return sendJson(res, 400, { error: 'worldId manquant.' });
      const data = await minecraftService.getPlayersData(worldId);
      return sendJson(res, 200, data);
    }

    if (pathname === '/api/players/add' && method === 'POST') {
      const { worldId, list, name, reason } = await parseBody(req);
      if (!worldId || !list || !name) {
        return sendJson(res, 400, { error: 'Paramètres manquants (worldId, list, name).' });
      }
      const data = await minecraftService.addPlayer(worldId, list, name, reason);
      return sendJson(res, 200, data);
    }

    if (pathname === '/api/players/remove' && method === 'POST') {
      const { worldId, list, name } = await parseBody(req);
      if (!worldId || !list || !name) {
        return sendJson(res, 400, { error: 'Paramètres manquants (worldId, list, name).' });
      }
      const data = await minecraftService.removePlayer(worldId, list, name);
      return sendJson(res, 200, data);
    }

    if (pathname === '/api/players/kick' && method === 'POST') {
      const { worldId, name, reason } = await parseBody(req);
      if (!worldId || !name) {
        return sendJson(res, 400, { error: 'Paramètres manquants (worldId, name).' });
      }
      const data = await minecraftService.kickPlayer(worldId, name, reason);
      return sendJson(res, 200, data);
    }

    // 6m. API Player Details (Inspecteur Joueur & Inventaire 3D)
    if (pathname === '/api/players/details' && method === 'GET') {
      const worldId = parsedUrl.searchParams.get('worldId');
      const player = parsedUrl.searchParams.get('player');
      if (!worldId || !player) {
        return sendJson(res, 400, { error: 'worldId ou player manquant.' });
      }
      try {
        delete require.cache[require.resolve('./player-data-service')];
        const pds = require('./player-data-service');
        const data = await pds.getPlayerDetails(worldId, player, minecraftService);
        return sendJson(res, 200, data);
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (pathname === '/api/players/action' && method === 'POST') {
      const { worldId, player, action, value } = await parseBody(req);
      if (!worldId || !player || !action) {
        return sendJson(res, 400, { error: 'Paramètres manquants (worldId, player, action).' });
      }
      try {
        delete require.cache[require.resolve('./player-data-service')];
        const pds = require('./player-data-service');
        const result = await pds.executePlayerAction(worldId, player, action, value, minecraftService);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (pathname === '/api/players/delete-data' && method === 'POST') {
      const { worldId, player } = await parseBody(req);
      if (!worldId || !player) {
        return sendJson(res, 400, { error: 'Paramètres manquants (worldId, player).' });
      }
      try {
        delete require.cache[require.resolve('./player-data-service')];
        const pds = require('./player-data-service');
        const result = await pds.deletePlayerData(worldId, player, minecraftService);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    // 6g. API Item Texture (Extrait les textures réelles des mods et du jeu)
    if (pathname === '/api/item-texture' && method === 'GET') {
      const worldId = parsedUrl.searchParams.get('worldId') || minecraftService.activeWorld || '';
      const item = parsedUrl.searchParams.get('item');
      const color = parsedUrl.searchParams.get('color');
      if (!item) {
        return sendJson(res, 400, { error: 'item manquant.' });
      }

      // Tenter d'extraire depuis le cache, les versions vanilla locales ou les mods
      const buf = modTextureService.getTexture(worldId, item, color);
      if (buf) {
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': buf.length,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        return res.end(buf);
      }

      res.writeHead(404, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      return res.end();
    }

    // 6h. API Armor Texture 3D (Extrait les textures de modèles d'armures 3D de tous les mods et vanilla)
    if (pathname === '/api/armor-texture' && method === 'GET') {
      const worldId = parsedUrl.searchParams.get('worldId') || minecraftService.activeWorld || '';
      const item = parsedUrl.searchParams.get('item');
      const layer = parseInt(parsedUrl.searchParams.get('layer') || '1', 10);
      const color = parsedUrl.searchParams.get('color');
      if (!item) {
        return sendJson(res, 400, { error: 'item manquant.' });
      }

      const buf = modTextureService.getArmorTexture(worldId, item, layer, color);
      if (buf) {
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': buf.length,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        return res.end(buf);
      }

      res.writeHead(404, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      return res.end();
    }

    // 6i. API Player Skin (Mojang/Crafatar/Local Steve Fallback)
    if (pathname === '/api/player-skin' && method === 'GET') {
      const name = parsedUrl.searchParams.get('name') || 'steve';
      const uuid = parsedUrl.searchParams.get('uuid') || null;
      const skinBuf = await getPlayerSkinBuffer(name, uuid);
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': skinBuf.length,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      return res.end(skinBuf);
    }


    // 7. API Tunnel Start/Stop & Status
    if (pathname === '/api/tunnel/start' && method === 'POST') {
      const state = await tunnelService.start();
      return sendJson(res, 200, state);
    }
    if (pathname === '/api/tunnel/stop' && method === 'POST') {
      const state = await tunnelService.stop();
      return sendJson(res, 200, state);
    }
    if (pathname === '/api/tunnel/status' && method === 'GET') {
      return sendJson(res, 200, tunnelService.getState());
    }
    if (pathname === '/api/tunnel/restart' && method === 'POST') {
      await tunnelService.stop();
      const state = await tunnelService.start();
      return sendJson(res, 200, state);
    }

    // Désinstallation de l'application
    if (pathname === '/api/app/uninstall' && method === 'POST') {
      const body = await parseBody(req);
      const deleteWorlds = Boolean(body && (body.deleteWorlds || body.deleteData));
      const deleteBackups = Boolean(body && (body.deleteBackups || body.deleteData));
      const deleteSettings = Boolean(body && (body.deleteSettings || body.deleteData));
      const deleteCaches = Boolean(body && (body.deleteCaches !== false));
      const deleteAll = Boolean(body && body.deleteAll) || (deleteWorlds && deleteBackups && deleteSettings);

      try { await minecraftService.stop(true); } catch (e) {}
      try { await tunnelService.stop(); } catch (e) {}

      const isWin = process.platform === 'win32';
      const homeDir = os.homedir();
      const appSupportDir = isWin
        ? path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'MinecraftServerManager')
        : path.join(homeDir, 'Library/Application Support/MinecraftServerManager');
      const desktopShortcut1 = isWin
        ? path.join(homeDir, 'Desktop', 'Minecraft Server Manager.lnk')
        : path.join(homeDir, 'Desktop/Minecraft Server Manager');
      const desktopShortcut2 = isWin
        ? path.join(homeDir, 'Desktop', 'Minecraft Server Manager.url')
        : path.join(homeDir, 'Desktop/Minecraft Server Manager.app');
      const targetApp = process.env.APP_BUNDLE_PATH || (isWin ? path.join(process.env.LOCALAPPDATA || homeDir, 'MinecraftServerManager') : '/Applications/Minecraft Server Manager.app');

      // 1. Suppression des raccourcis Bureau
      try { if (fs.existsSync(desktopShortcut1)) fs.rmSync(desktopShortcut1, { recursive: true, force: true }); } catch (e) {}
      try { if (fs.existsSync(desktopShortcut2)) fs.rmSync(desktopShortcut2, { recursive: true, force: true }); } catch (e) {}

      // 2. Suppression des caches et LocalStorage Web si demandée ou par défaut
      if (deleteCaches) {
        if (!isWin) {
          const webkitDirs = [
            path.join(homeDir, 'Library/WebKit/com.gabriel.minecraftservermanager'),
            path.join(homeDir, 'Library/WebKit/fr.gabriel.minecraftservermanager'),
            path.join(homeDir, 'Library/WebKit/Minecraft Server Manager'),
            path.join(homeDir, 'Library/Caches/com.gabriel.minecraftservermanager'),
            path.join(homeDir, 'Library/Caches/fr.gabriel.minecraftservermanager'),
            path.join(homeDir, 'Library/Saved Application State/com.gabriel.minecraftservermanager.savedState'),
            path.join(homeDir, 'Library/Saved Application State/fr.gabriel.minecraftservermanager.savedState')
          ];
          for (const dir of webkitDirs) {
            try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
          }
        } else {
          const winDirs = [
            path.join(process.env.LOCALAPPDATA || '', 'MinecraftServerManager', 'WebView2'),
            path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data', 'Default', 'Local Storage'),
            path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data', 'Default', 'Session Storage')
          ];
          for (const dir of winDirs) {
            try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
          }
        }
      }

      // 2b. Suppression du marqueur de premier lancement
      try {
        const welcomeFlagPath = path.join(__dirname, '..', '.welcome-completed');
        if (fs.existsSync(welcomeFlagPath)) fs.unlinkSync(welcomeFlagPath);
      } catch (_) {}

      // 3. Suppression granulaire des données
      if (deleteAll) {
        try { if (fs.existsSync(appSupportDir)) fs.rmSync(appSupportDir, { recursive: true, force: true }); } catch (e) {}
      } else {
        if (deleteWorlds) {
          const gamesDir = path.join(appSupportDir, 'games');
          try { if (fs.existsSync(gamesDir)) fs.rmSync(gamesDir, { recursive: true, force: true }); } catch (e) {}
          const devGamesDir = path.resolve(__dirname, '../../games');
          try { if (fs.existsSync(devGamesDir)) fs.rmSync(devGamesDir, { recursive: true, force: true }); } catch (e) {}
        }
        if (deleteBackups) {
          const backupsDir = path.join(appSupportDir, 'backups');
          try { if (fs.existsSync(backupsDir)) fs.rmSync(backupsDir, { recursive: true, force: true }); } catch (e) {}
          const devBackupsDir = path.resolve(__dirname, '../../backups');
          try { if (fs.existsSync(devBackupsDir)) fs.rmSync(devBackupsDir, { recursive: true, force: true }); } catch (e) {}
        }
        if (deleteSettings) {
          const settingsFile = path.join(appSupportDir, 'app-settings.json');
          try { if (fs.existsSync(settingsFile)) fs.unlinkSync(settingsFile); } catch (e) {}
          const devSettingsFile = path.resolve(__dirname, '../app-settings.json');
          try { if (fs.existsSync(devSettingsFile)) fs.unlinkSync(devSettingsFile); } catch (e) {}
        }
      }

      // 4. Suppression de l'application
      if (!isWin) {
        const devRoot = path.resolve(__dirname, '../..');
        if (targetApp.endsWith('.app') && !targetApp.startsWith(devRoot)) {
          try { if (fs.existsSync(targetApp)) fs.rmSync(targetApp, { recursive: true, force: true }); } catch (e) {}
          exec(`rm -rf "${targetApp}" 2>/dev/null || true`);
          exec(`osascript -e 'tell application "Finder" to delete POSIX file "${targetApp}"' 2>/dev/null || true`);
        }
      }

      // 5. Fermeture différée des processus
      if (isWin) {
        setTimeout(() => {
          try { exec(`taskkill /pid ${process.pid} /T /F 2>nul`); } catch (_) { process.exit(0); }
        }, 800);
      } else {
        const cleanupCommands = [
          'sleep 0.8',
          'pkill -f "MinecraftServerManager" 2>/dev/null || true',
          `kill -9 ${process.pid} 2>/dev/null || true`
        ];
        const cmd = cleanupCommands.join('\n');
        spawn('bash', ['-c', cmd], {
          detached: true,
          stdio: 'ignore'
        }).unref();
      }

      return sendJson(res, 200, { success: true });
    }

    // Ouverture d'une URL dans le navigateur par défaut du système
    if (pathname === '/api/system/open-url' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const targetUrl = (body && body.url) ? String(body.url).trim() : '';
        if (targetUrl && (targetUrl.startsWith('https://') || targetUrl.startsWith('http://'))) {
          const safeUrl = targetUrl.replace(/"/g, '\\"');
          exec(`open "${safeUrl}"`);
          return sendJson(res, 200, { success: true });
        }
        return sendJson(res, 400, { error: 'URL invalide ou non sécurisée' });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    // Diagnostic et scan des composants PC (RAM, CPU, OS) pour recommandation d'hébergement
    if (pathname === '/api/system/benchmark' && method === 'GET') {
      try {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const cpus = os.cpus() || [];
        const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Processeur standard';
        const cpuCores = cpus.length;
        const totalRamGb = Math.round((totalMem / (1024 * 1024 * 1024)) * 10) / 10;
        const freeRamGb = Math.round((freeMem / (1024 * 1024 * 1024)) * 10) / 10;
        const platform = os.platform();
        const arch = os.arch();

        // Rapide benchmark réseau (mesure de latence TCP RTT vers DNS mondial 1.1.1.1:443)
        let pingMs = null;
        let netQuality = 'Excellente';
        let netDetail = 'Connexion très rapide';
        const netStart = Date.now();

        try {
          await new Promise((resolve) => {
            const socket = require('net').createConnection(443, '1.1.1.1');
            socket.setTimeout(1000);
            socket.on('connect', () => {
              pingMs = Date.now() - netStart;
              socket.destroy();
              resolve();
            });
            socket.on('error', () => {
              socket.destroy();
              resolve();
            });
            socket.on('timeout', () => {
              socket.destroy();
              resolve();
            });
          });
        } catch (_) {}

        if (pingMs !== null) {
          if (pingMs < 35) {
            netQuality = 'Fibre / Très rapide';
            netDetail = `${pingMs} ms (latence optimale)`;
          } else if (pingMs < 80) {
            netQuality = 'Très bonne';
            netDetail = `${pingMs} ms (très fluide)`;
          } else {
            netQuality = 'Moyenne';
            netDetail = `${pingMs} ms (acceptable)`;
          }
        } else {
          netQuality = 'Local uniquement';
          netDetail = 'Pas d\'accès internet détecté';
        }

        // Évaluation de la capacité d'hébergement
        let verdict = 'host_and_play';
        let verdictTitle = 'Héberger et Jouer simultanément';
        let verdictDesc = 'Votre machine est parfaitement taillée pour héberger votre serveur (Vanilla ou Moddé) tout en jouant sur ce même ordinateur en conservant une excellente fluidité.';
        let badgeColor = 'success';

        if (totalRamGb >= 15.5 && cpuCores >= 6) {
          verdict = 'host_and_play';
          verdictTitle = 'Héberger et Jouer simultanément';
          verdictDesc = 'Votre machine est parfaitement taillée pour faire tourner votre serveur (Vanilla ou Moddé avec de nombreux mods) tout en jouant en même temps sur cet ordinateur.';
          badgeColor = 'success';
        } else if (totalRamGb >= 7.5 && cpuCores >= 4) {
          verdict = 'host_only';
          verdictTitle = 'Hébergement dédié conseillé';
          verdictDesc = 'Votre ordinateur peut héberger le serveur confortablement. Pour une expérience de jeu optimale sans surcharge, il est recommandé de jouer depuis une autre machine sur votre réseau.';
          badgeColor = 'warning';
        } else {
          verdict = 'limited';
          verdictTitle = 'Configuration modeste';
          verdictDesc = 'Mémoire vive limitée (< 8 Go). Nous vous recommandons de réserver cet ordinateur à un serveur Vanilla léger (1 à 4 joueurs) et de fermer les autres applications en arrière-plan.';
          badgeColor = 'danger';
        }

        return sendJson(res, 200, {
          success: true,
          totalRamGb,
          freeRamGb,
          cpuModel,
          cpuCores,
          platform: platform === 'darwin' ? 'macOS' : (platform === 'win32' ? 'Windows' : 'Linux'),
          arch,
          network: {
            online: pingMs !== null,
            pingMs: pingMs,
            quality: netQuality,
            detail: netDetail
          },
          verdict,
          verdictTitle,
          verdictDesc,
          badgeColor
        });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    // 8. API Vanilla Versions
    if (pathname === '/api/vanilla/versions' && method === 'GET') {
      const versions = await vanillaInstaller.getAvailableVersions();
      return sendJson(res, 200, { versions });
    }

    // 9. API Analyze Modpack or Local Folder
    if (pathname === '/api/mods/analyze' && method === 'POST') {
      let { sourcePath } = await parseBody(req);
      if (!sourcePath) return sendJson(res, 400, { error: 'sourcePath manquant' });
      if (sourcePath.startsWith('~')) {
        sourcePath = path.join(os.homedir(), sourcePath.slice(1));
      }
      sourcePath = path.resolve(sourcePath);
      const analysis = await modFilterService.analyze(sourcePath, (progress, msg, current, total) => {
        minecraftService.broadcast('mod_analyze_progress', { progress, msg, current, total });
      });
      return sendJson(res, 200, {
        sourcePath,
        analysis
      });
    }

    // 10. API Upload & Analyze Modpack Zip / Jars / Folders
    if (pathname === '/api/mods/upload' && method === 'POST') {
      const upload = await handleMultipartUpload(req);
      const analysis = await modFilterService.analyze(upload.sourcePath, (progress, msg, current, total) => {
        minecraftService.broadcast('mod_analyze_progress', { progress, msg, current, total });
      });
      return sendJson(res, 200, {
        uploadedFile: upload.sourcePath,
        originalFilename: upload.originalFilename,
        analysis
      });
    }

    // 10-bis. API Analyze Local Mods (Dossier ou fichiers sélectionnés via Finder)
    if (pathname === '/api/mods/analyze-local' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const paths = Array.isArray(body.paths) ? body.paths : (body.path ? [body.path] : []);
        if (paths.length === 0) {
          return sendJson(res, 400, { error: 'Aucun chemin fourni.' });
        }

        const stagingDir = path.join(os.tmpdir(), `mc_upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
        const stagingModsDir = path.join(stagingDir, 'mods');
        fs.mkdirSync(stagingModsDir, { recursive: true });

        let originalFilename = '';

        for (const p of paths) {
          if (!fs.existsSync(p)) continue;
          const stat = fs.statSync(p);
          const base = path.basename(p);
          if (!originalFilename) originalFilename = base;

          if (stat.isDirectory()) {
            const copyJars = (dir) => {
              try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const e of entries) {
                  const full = path.join(dir, e.name);
                  if (e.isDirectory() && !e.name.startsWith('.')) {
                    copyJars(full);
                  } else if (e.isFile() && e.name.toLowerCase().endsWith('.jar')) {
                    fs.copyFileSync(full, path.join(stagingModsDir, e.name));
                  }
                }
              } catch (_) {}
            };
            copyJars(p);
          } else if (stat.isFile()) {
            if (p.toLowerCase().endsWith('.jar')) {
              fs.copyFileSync(p, path.join(stagingModsDir, base));
            } else if (p.toLowerCase().endsWith('.zip') || p.toLowerCase().endsWith('.mrpack')) {
              if (paths.length === 1) {
                const analysis = await modFilterService.analyze(p, (progress, msg, current, total) => {
                  minecraftService.broadcast('mod_analyze_progress', { progress, msg, current, total });
                });
                return sendJson(res, 200, {
                  uploadedFile: p,
                  originalFilename: base,
                  analysis
                });
              }
            }
          }
        }

        const jarCount = fs.readdirSync(stagingModsDir).filter(f => f.toLowerCase().endsWith('.jar')).length;
        if (jarCount === 0) {
          return sendJson(res, 400, { error: 'Aucun fichier .jar de mod trouvé dans la sélection.' });
        }

        const analysis = await modFilterService.analyze(stagingDir, (progress, msg, current, total) => {
          minecraftService.broadcast('mod_analyze_progress', { progress, msg, current, total });
        });

        return sendJson(res, 200, {
          uploadedFile: stagingDir,
          originalFilename: paths.length === 1 ? originalFilename : `${jarCount} mods`,
          analysis
        });
      } catch (err) {
        return sendJson(res, 400, { error: `Erreur analyse mods: ${err.message}` });
      }
    }

    // 11. API Create New World
    if (pathname === '/api/worlds/create' && method === 'POST') {
      const payload = await parseBody(req);
      const result = await minecraftService.createWorld(payload);
      return sendJson(res, 200, result);
    }

    // 12. API Get Logs History
    if (pathname === '/api/logs' && method === 'GET') {
      const reqWorldId = parsedUrl.searchParams.get('worldId') || minecraftService.activeWorld;
      if (reqWorldId) {
        const logs = await minecraftService.getWorldLogs(reqWorldId);
        return sendJson(res, 200, { logs, worldId: reqWorldId });
      }
      return sendJson(res, 200, { logs: minecraftService.logsBuffer, worldId: null });
    }

    // 12b. API Clear Logs
    if (pathname === '/api/logs/clear' && method === 'POST') {
      const { worldId } = await parseBody(req);
      const targetWorldId = worldId || minecraftService.activeWorld;
      minecraftService.clearWorldLogs(targetWorldId);
      return sendJson(res, 200, { success: true, worldId: targetWorldId });
    }

    // 13. Static Files
    let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Accès refusé');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.json': 'application/json'
      };
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    // Fallback 404
    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: `Route API introuvable: ${pathname}` });
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Non trouvé');
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: err.message });
  }
});

function startServer(port = DEFAULT_PORT) {
  server.listen(port, () => {
    console.log(`====================================================`);
    console.log(`🎮 Minecraft Server Manager actif sur :`);
    console.log(`👉 http://localhost:${port}`);
    console.log(`====================================================`);

  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} déjà utilisé par une instance active, réouverture de l'application.`);
      process.exit(0);
    } else {
      console.error('Erreur démarrage serveur:', err);
    }
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { server, startServer };

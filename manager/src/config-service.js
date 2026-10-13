
const fs = require('fs');
const path = require('path');
const os = require('os');

const isWin = process.platform === 'win32';
const isBundled = __dirname.includes('.app/Contents') || process.env.APP_BUNDLED === 'true';

const legacyDir = isWin
  ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'MinecraftServerManager')
  : path.join(os.homedir(), 'Library/Application Support/MinecraftServerManager');

const APP_SUPPORT_DIR = isWin
  ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Cubirium')
  : path.join(os.homedir(), 'Library/Application Support/Cubirium');

// Migration automatique des données de configuration si nécessaire
if (!fs.existsSync(APP_SUPPORT_DIR) && fs.existsSync(legacyDir)) {
  try {
    fs.mkdirSync(APP_SUPPORT_DIR, { recursive: true });
    const legacyCfg = path.join(legacyDir, 'app-settings.json');
    if (fs.existsSync(legacyCfg)) {
      fs.copyFileSync(legacyCfg, path.join(APP_SUPPORT_DIR, 'app-settings.json'));
    }
  } catch (e) {}
}

if ((isBundled || isWin) && !fs.existsSync(APP_SUPPORT_DIR)) {
  try {
    fs.mkdirSync(APP_SUPPORT_DIR, { recursive: true });
  } catch (e) {}
}

let CONFIG_PATH = path.join(__dirname, '..', 'app-settings.json');
if (isBundled || fs.existsSync(path.join(APP_SUPPORT_DIR, 'app-settings.json'))) {
  CONFIG_PATH = path.join(APP_SUPPORT_DIR, 'app-settings.json');
} else if (isWin && !fs.existsSync(CONFIG_PATH)) {
  CONFIG_PATH = path.join(APP_SUPPORT_DIR, 'app-settings.json');
}

let _cachedSystemDownloadsDir = null;

/**
 * Recherche robuste et réelle du dossier Téléchargements de l'ordinateur.
 * Sous Windows, interroge le Registre (User Shell Folders GUID FOLDERID_Downloads),
 * l'objet COM Windows Shell ou les dossiers physiques réels existants sur le disque.
 */
function getRealSystemDownloadsDir() {
  if (_cachedSystemDownloadsDir && fs.existsSync(_cachedSystemDownloadsDir)) {
    return _cachedSystemDownloadsDir;
  }

  if (isWin) {
    const userProfile = process.env.USERPROFILE || os.homedir();

    // 1. Registre Windows : User Shell Folders (GUID officiel FOLDERID_Downloads)
    try {
      const { execSync } = require('child_process');
      const regOutput = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders" /v "{374DE290-123F-4565-9164-39C4925E467B}"',
        { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
      );
      const match = regOutput.match(/\{374DE290-123F-4565-9164-39C4925E467B\}\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
      if (match && match[1]) {
        let regPath = match[1].trim();
        regPath = regPath.replace(/%([^%]+)%/g, (_, varName) => process.env[varName] || `%${varName}%`);
        if (fs.existsSync(regPath)) {
          _cachedSystemDownloadsDir = path.resolve(regPath);
          return _cachedSystemDownloadsDir;
        }
      }
    } catch (_) {}

    // 2. Registre Windows : Shell Folders standard
    try {
      const { execSync } = require('child_process');
      const regOutput2 = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders" /v "{374DE290-123F-4565-9164-39C4925E467B}"',
        { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
      );
      const match2 = regOutput2.match(/\{374DE290-123F-4565-9164-39C4925E467B\}\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
      if (match2 && match2[1]) {
        let regPath2 = match2[1].trim();
        regPath2 = regPath2.replace(/%([^%]+)%/g, (_, varName) => process.env[varName] || `%${varName}%`);
        if (fs.existsSync(regPath2)) {
          _cachedSystemDownloadsDir = path.resolve(regPath2);
          return _cachedSystemDownloadsDir;
        }
      }
    } catch (_) {}

    // 3. Objet COM Windows Shell via PowerShell (shell:Downloads)
    try {
      const { execSync } = require('child_process');
      const psCmd = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; (New-Object -ComObject Shell.Application).Namespace('shell:Downloads').Self.Path";
      const psOutput = execSync(
        `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${psCmd}"`,
        { encoding: 'utf8', timeout: 3500, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
      );
      const shellPath = psOutput.trim().split(/\r?\n/).pop()?.trim();
      if (shellPath && fs.existsSync(shellPath)) {
        _cachedSystemDownloadsDir = path.resolve(shellPath);
        return _cachedSystemDownloadsDir;
      }
    } catch (_) {}

    // 4. Détection par scan des emplacements physiques réels sur le disque
    const winCandidates = [
      path.join(userProfile, 'Downloads'),
      path.join(userProfile, 'Téléchargements'),
      path.join(userProfile, 'OneDrive', 'Downloads'),
      path.join(userProfile, 'OneDrive', 'Téléchargements'),
      path.join(os.homedir(), 'Downloads'),
      path.join(os.homedir(), 'Téléchargements')
    ];

    for (const cand of winCandidates) {
      if (cand && fs.existsSync(cand)) {
        _cachedSystemDownloadsDir = path.resolve(cand);
        return _cachedSystemDownloadsDir;
      }
    }

    // 5. Fallback sécurisé : création de Downloads dans le profil utilisateur
    const defaultWin = path.join(userProfile, 'Downloads');
    try {
      if (!fs.existsSync(defaultWin)) {
        fs.mkdirSync(defaultWin, { recursive: true });
      }
    } catch (_) {}
    _cachedSystemDownloadsDir = path.resolve(defaultWin);
    return _cachedSystemDownloadsDir;
  }

  if (process.platform === 'darwin') {
    const macCandidates = [
      path.join(os.homedir(), 'Downloads'),
      path.join(os.homedir(), 'Téléchargements')
    ];
    for (const cand of macCandidates) {
      if (fs.existsSync(cand)) {
        _cachedSystemDownloadsDir = path.resolve(cand);
        return _cachedSystemDownloadsDir;
      }
    }
    _cachedSystemDownloadsDir = path.join(os.homedir(), 'Downloads');
    return _cachedSystemDownloadsDir;
  }

  // Linux et autres
  try {
    const xdgFile = path.join(os.homedir(), '.config', 'user-dirs.dirs');
    if (fs.existsSync(xdgFile)) {
      const content = fs.readFileSync(xdgFile, 'utf8');
      const match = content.match(/^XDG_DOWNLOAD_DIR="([^"]+)"/m);
      if (match && match[1]) {
        let resolved = match[1].replace('$HOME', os.homedir()).replace(/~/, os.homedir());
        if (fs.existsSync(resolved)) {
          _cachedSystemDownloadsDir = path.resolve(resolved);
          return _cachedSystemDownloadsDir;
        }
      }
    }
  } catch (_) {}

  const linuxCandidates = [
    path.join(os.homedir(), 'Downloads'),
    path.join(os.homedir(), 'Téléchargements')
  ];
  for (const cand of linuxCandidates) {
    if (fs.existsSync(cand)) {
      _cachedSystemDownloadsDir = path.resolve(cand);
      return _cachedSystemDownloadsDir;
    }
  }

  _cachedSystemDownloadsDir = path.join(os.homedir(), 'Downloads');
  return _cachedSystemDownloadsDir;
}

const DEFAULT_CONFIG = {
  get downloadPath() {
    return getRealSystemDownloadsDir();
  },
  defaultViewDistance: 12,
  defaultSimulationDistance: 4,
  defaultGamemode: 'survival',
  defaultDifficulty: 'normal',
  tunnelRelayHost: 'bore.pub',
  tunnelRelayPort: 7835
};

function getSettings() {
  const realSystemDownloads = getRealSystemDownloadsDir();

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

      let downloadPath = (data.downloadPath && typeof data.downloadPath === 'string')
        ? data.downloadPath.trim()
        : '';

      // Si aucun chemin n'est défini ou si le chemin sauvegardé n'existe PAS sur la machine courante
      // (ex: chemin macOS initial copié sur Windows ou dossier inexistant),
      // on recherche dynamiquement et utilise le VRAI dossier Téléchargements de l'ordinateur.
      let needsAutoFix = false;
      if (!downloadPath || !fs.existsSync(downloadPath)) {
        downloadPath = realSystemDownloads;
        needsAutoFix = true;
      }

      const settings = {
        ...DEFAULT_CONFIG,
        ...data,
        downloadPath,
        defaultViewDistance: parseInt(data.defaultViewDistance, 10) || DEFAULT_CONFIG.defaultViewDistance,
        defaultSimulationDistance: parseInt(data.defaultSimulationDistance, 10) || DEFAULT_CONFIG.defaultSimulationDistance,
        defaultGamemode: data.defaultGamemode || DEFAULT_CONFIG.defaultGamemode,
        defaultDifficulty: data.defaultDifficulty || DEFAULT_CONFIG.defaultDifficulty,
        tunnelRelayHost: data.tunnelRelayHost ? data.tunnelRelayHost.trim() : DEFAULT_CONFIG.tunnelRelayHost,
        tunnelRelayPort: parseInt(data.tunnelRelayPort, 10) || DEFAULT_CONFIG.tunnelRelayPort
      };

      if (needsAutoFix) {
        try {
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2), 'utf8');
        } catch (_) {}
      }

      return settings;
    } catch (e) {
      console.warn('[ConfigService] Erreur lecture configuration, utilisation des valeurs par défaut:', e.message);
    }
  }

  // Première ouverture de l'application (création du fichier de configuration initiale)
  const initialSettings = {
    ...DEFAULT_CONFIG,
    downloadPath: realSystemDownloads
  };
  try {
    const parentDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(initialSettings, null, 2), 'utf8');
  } catch (_) {}
  return initialSettings;
}

function saveSettings(newSettings) {
  const current = getSettings();
  const updated = {
    ...current,
    ...newSettings
  };

  // Normalisation du dossier d'export
  if (updated.downloadPath && typeof updated.downloadPath === 'string') {
    let p = updated.downloadPath.trim();
    if (p.startsWith('~')) {
      p = path.join(os.homedir(), p.slice(1));
    }
    p = path.resolve(p);

    // S'assurer que le dossier personnalisé choisi par l'utilisateur existe
    try {
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
      }
    } catch (_) {}
    updated.downloadPath = p;
  } else {
    updated.downloadPath = getRealSystemDownloadsDir();
  }

  updated.defaultViewDistance = Math.min(32, Math.max(2, parseInt(updated.defaultViewDistance, 10) || 12));
  updated.defaultSimulationDistance = Math.min(32, Math.max(2, parseInt(updated.defaultSimulationDistance, 10) || 4));
  if (updated.tunnelRelayHost) {
    updated.tunnelRelayHost = updated.tunnelRelayHost.trim();
  }
  if (updated.tunnelRelayPort) {
    updated.tunnelRelayPort = parseInt(updated.tunnelRelayPort, 10) || DEFAULT_CONFIG.tunnelRelayPort;
  }

  try {
    const parentDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
  } catch (err) {
    console.warn('[ConfigService] Erreur écriture configuration:', err.message);
  }
  return updated;
}

module.exports = {
  getSettings,
  saveSettings,
  getRealSystemDownloadsDir,
  DEFAULT_CONFIG
};

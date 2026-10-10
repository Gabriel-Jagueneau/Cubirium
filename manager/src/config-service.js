const fs = require('fs');
const path = require('path');
const os = require('os');

const isWin = process.platform === 'win32';
const isBundled = __dirname.includes('.app/Contents') || process.env.APP_BUNDLED === 'true';
const APP_SUPPORT_DIR = isWin
  ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'MinecraftServerManager')
  : path.join(os.homedir(), 'Library/Application Support/MinecraftServerManager');
if (isBundled && !fs.existsSync(APP_SUPPORT_DIR)) {
  try {
    fs.mkdirSync(APP_SUPPORT_DIR, { recursive: true });
  } catch (e) {}
}

const CONFIG_PATH = isBundled
  ? path.join(APP_SUPPORT_DIR, 'app-settings.json')
  : path.join(__dirname, '..', 'app-settings.json');

const DEFAULT_CONFIG = {
  downloadPath: path.join(os.homedir(), 'Downloads'),
  defaultViewDistance: 12,
  defaultSimulationDistance: 4,
  defaultGamemode: 'survival',
  defaultDifficulty: 'normal'
};

function getSettings() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return {
        ...DEFAULT_CONFIG,
        ...data,
        downloadPath: data.downloadPath || DEFAULT_CONFIG.downloadPath,
        defaultViewDistance: parseInt(data.defaultViewDistance, 10) || DEFAULT_CONFIG.defaultViewDistance,
        defaultSimulationDistance: parseInt(data.defaultSimulationDistance, 10) || DEFAULT_CONFIG.defaultSimulationDistance,
        defaultGamemode: data.defaultGamemode || DEFAULT_CONFIG.defaultGamemode,
        defaultDifficulty: data.defaultDifficulty || DEFAULT_CONFIG.defaultDifficulty
      };
    } catch (e) {
      console.warn('[ConfigService] Erreur lecture configuration, utilisation des valeurs par défaut:', e.message);
    }
  }
  return { ...DEFAULT_CONFIG };
}

function saveSettings(newSettings) {
  const current = getSettings();
  const updated = {
    ...current,
    ...newSettings
  };

  // Normalisation
  if (updated.downloadPath) {
    let p = updated.downloadPath.trim();
    if (p.startsWith('~')) {
      p = path.join(os.homedir(), p.slice(1));
    }
    updated.downloadPath = path.resolve(p);
  } else {
    updated.downloadPath = DEFAULT_CONFIG.downloadPath;
  }

  updated.defaultViewDistance = Math.min(32, Math.max(2, parseInt(updated.defaultViewDistance, 10) || 12));
  updated.defaultSimulationDistance = Math.min(32, Math.max(2, parseInt(updated.defaultSimulationDistance, 10) || 4));

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

module.exports = {
  getSettings,
  saveSettings,
  DEFAULT_CONFIG
};

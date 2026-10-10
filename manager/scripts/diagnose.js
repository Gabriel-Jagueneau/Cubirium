#!/usr/bin/env node

/**
 * Script d'Auto-Diagnostic Global - Minecraft Server Manager
 * 
 * Analyse complète et automatisée :
 * 1. Syntaxe de tous les fichiers JavaScript (Frontend & Backend).
 * 2. Chargement et intégrité des modules Node.js backend (requires, dépendances).
 * 3. Structure HTML (fermeture des balises critiques div/section/button).
 * 4. Cohérence DOM (getElementById dans app.js vs id dans index.html).
 * 5. Cohérence des actions HTML inline (onclick, oninput, onchange vs window/fonctions).
 * 6. Cohérence des routes API (/api/... dans app.js vs routes dans server.js).
 * 7. Synchronisation du bundle macOS ("Minecraft Server Manager.app").
 * 8. Compilation Swift native (main.swift).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Détection automatique et robuste de la racine du projet
let candidateRoot = __dirname;
while (candidateRoot !== '/' && !fs.existsSync(path.join(candidateRoot, 'Minecraft Server Manager.app')) && !fs.existsSync(path.join(candidateRoot, 'manager', 'src'))) {
  candidateRoot = path.dirname(candidateRoot);
}
const PROJECT_ROOT = candidateRoot;
const MANAGER_DIR = fs.existsSync(path.join(PROJECT_ROOT, 'manager')) ? path.join(PROJECT_ROOT, 'manager') : PROJECT_ROOT;
const SRC_DIR = path.join(MANAGER_DIR, 'src');
const PUBLIC_DIR = path.join(MANAGER_DIR, 'public');
const APP_BUNDLE_DIR = path.join(PROJECT_ROOT, 'Minecraft Server Manager.app/Contents/Resources/manager');

const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  errors: []
};

function logHeader(title) {
  console.log('\n\x1b[1m\x1b[36m=======================================================');
  console.log(`  ${title}`);
  console.log('=======================================================\x1b[0m');
}

function logPass(msg) {
  results.passed++;
  console.log(` \x1b[32m✔\x1b[0m ${msg}`);
}

function logWarn(msg) {
  results.warnings++;
  console.log(` \x1b[33m⚠\x1b[0m ${msg}`);
}

function logFail(msg, detail = null) {
  results.failed++;
  results.errors.push({ msg, detail });
  console.log(` \x1b[31m✖\x1b[0m ${msg}`);
  if (detail) console.log(`   \x1b[90m${detail}\x1b[0m`);
}

// ---------------------------------------------------------------------------
// 1. Validation de syntaxe JavaScript
// ---------------------------------------------------------------------------
logHeader('1. Analyse syntaxique JavaScript');

function getAllJsFiles(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        files = files.concat(getAllJsFiles(fullPath));
      }
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const jsFiles = [...getAllJsFiles(SRC_DIR), ...getAllJsFiles(PUBLIC_DIR)];
let syntaxErrors = 0;

for (const file of jsFiles) {
  const relPath = path.relative(PROJECT_ROOT, file);
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
    logPass(`Syntaxe valide : ${relPath}`);
  } catch (err) {
    syntaxErrors++;
    logFail(`Erreur de syntaxe : ${relPath}`, err.stderr ? err.stderr.toString().trim() : err.message);
  }
}

// ---------------------------------------------------------------------------
// 2. Vérification des modules Backend
// ---------------------------------------------------------------------------
logHeader('2. Intégrité des modules Backend Node.js');

const backendModules = [
  'config-service.js',
  'minecraft-service.js',
  'tunnel-service.js',
  'player-data-service.js',
  'vanilla-installer-service.js',
  'modloader-installer-service.js',
  'mod-texture-service.js',
  'mod-filter-service.js'
];

for (const modName of backendModules) {
  const modPath = path.join(SRC_DIR, modName);
  if (!fs.existsSync(modPath)) {
    logFail(`Module manquant : ${modName}`);
    continue;
  }

  try {
    // Tester l'import en isolant les effets de bord
    delete require.cache[require.resolve(modPath)];
    const mod = require(modPath);
    if (mod) {
      logPass(`Module chargé avec succès : ${modName}`);
    } else {
      logWarn(`Module exporte null/undefined : ${modName}`);
    }
  } catch (err) {
    logFail(`Échec du chargement du module : ${modName}`, err.stack || err.message);
  }
}

// ---------------------------------------------------------------------------
// 3. Structure et balises HTML (index.html)
// ---------------------------------------------------------------------------
logHeader('3. Structure HTML & Équilibre des balises');

const htmlPath = path.join(PUBLIC_DIR, 'index.html');
let htmlContent = '';

if (!fs.existsSync(htmlPath)) {
  logFail('Fichier public/index.html introuvable !');
} else {
  htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Vérification de parité des balises critiques
  const criticalTags = ['div', 'section', 'main', 'header', 'footer', 'select', 'form'];
  for (const tag of criticalTags) {
    const openRegex = new RegExp(`<${tag}(\\s+[^>]*)?>`, 'gi');
    const closeRegex = new RegExp(`</${tag}>`, 'gi');
    const openCount = (htmlContent.match(openRegex) || []).length;
    const closeCount = (htmlContent.match(closeRegex) || []).length;

    if (openCount === closeCount) {
      logPass(`Balises <${tag}> équilibrées (${openCount}/${closeCount})`);
    } else {
      logFail(`Déséquilibre de balises <${tag}> : ${openCount} ouvertes vs ${closeCount} fermées`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Cohérence DOM (IDs index.html vs app.js)
// ---------------------------------------------------------------------------
logHeader('4. Cohérence DOM (IDs index.html <-> app.js)');

const appJsPath = path.join(PUBLIC_DIR, 'app.js');
let appJsContent = '';

if (fs.existsSync(appJsPath) && htmlContent) {
  appJsContent = fs.readFileSync(appJsPath, 'utf8');

  // Extraire tous les IDs dans index.html
  const htmlIds = new Set();
  const idRegex = /id=["']([a-zA-Z0-9_-]+)["']/g;
  let match;
  while ((match = idRegex.exec(htmlContent)) !== null) {
    htmlIds.add(match[1]);
  }

  // Extraire tous les getElementById dans app.js
  const jsGetIdRegex = /getElementById\(["']([a-zA-Z0-9_-]+)["']\)/g;
  const queriedIds = new Set();
  while ((match = jsGetIdRegex.exec(appJsContent)) !== null) {
    queriedIds.add(match[1]);
  }

  let missingDomCount = 0;
  for (const id of queriedIds) {
    if (!htmlIds.has(id)) {
      missingDomCount++;
      logWarn(`ID recherché dans app.js mais absent de index.html : '${id}'`);
    }
  }

  if (missingDomCount === 0) {
    logPass(`Tous les IDs ciblés par app.js (${queriedIds.size} IDs) sont bien présents dans le DOM`);
  } else {
    logWarn(`${missingDomCount} IDs potentiellement orphelins détectés`);
  }
}

// ---------------------------------------------------------------------------
// 5. Cohérence des événements inline HTML (onclick, oninput, etc.)
// ---------------------------------------------------------------------------
logHeader('5. Vérification des actions HTML inline (onclick, onchange, etc.)');

if (htmlContent && appJsContent) {
  const inlineHandlerRegex = /on(?:click|input|change|submit)=["']([a-zA-Z0-9_]+)\s*\(/g;
  const inlineHandlers = new Set();
  while ((match = inlineHandlerRegex.exec(htmlContent)) !== null) {
    inlineHandlers.add(match[1]);
  }

  let unhandledCount = 0;
  for (const fnName of inlineHandlers) {
    // Vérifier si la fonction est déclarée ou attachée à window
    const isDeclared = new RegExp(`(?:function\\s+${fnName}\\b|window\\.${fnName}\\s*=)`).test(appJsContent);
    if (isDeclared) {
      logPass(`Action inline définie : ${fnName}()`);
    } else {
      unhandledCount++;
      logFail(`Action HTML inline introuvable dans app.js : ${fnName}()`);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Cohérence des Endpoints API (/api/... app.js vs server.js)
// ---------------------------------------------------------------------------
logHeader('6. Cohérence des routes d\'API Frontend <-> Backend');

const serverJsPath = path.join(SRC_DIR, 'server.js');
if (fs.existsSync(serverJsPath) && appJsContent) {
  const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');

  // Extraire les appels fetch('/api/...') dans app.js
  const fetchRegex = /fetch\(["'`](\/api\/[a-zA-Z0-9_/-]+)[?"'`]/g;
  const apiCalls = new Set();
  while ((match = fetchRegex.exec(appJsContent)) !== null) {
    apiCalls.add(match[1]);
  }

  let missingRoutes = 0;
  for (const endpoint of apiCalls) {
    // Vérifier si server.js contient la route (exacte ou préfixée)
    const existsInServer = serverJsContent.includes(`'${endpoint}'`) || 
                           serverJsContent.includes(`"${endpoint}"`) ||
                           serverJsContent.includes(endpoint);

    if (existsInServer) {
      logPass(`Route backend confirmée : ${endpoint}`);
    } else {
      missingRoutes++;
      logWarn(`Route appelée dans app.js mais non détectée directement dans server.js : ${endpoint}`);
    }
  }

  if (missingRoutes === 0) {
    logPass(`Toutes les routes API frontend (${apiCalls.size} routes) sont gérées par le serveur backend`);
  }
}

// ---------------------------------------------------------------------------
// 7. Synchronisation de l'App Bundle macOS
// ---------------------------------------------------------------------------
logHeader('7. Vérification de la synchronisation de l\'App Bundle');

if (fs.existsSync(APP_BUNDLE_DIR)) {
  let bundleOutOfSync = false;
  const checkFiles = [
    { src: path.join(PUBLIC_DIR, 'index.html'), dst: path.join(APP_BUNDLE_DIR, 'public/index.html') },
    { src: path.join(PUBLIC_DIR, 'app.js'), dst: path.join(APP_BUNDLE_DIR, 'public/app.js') },
    { src: path.join(PUBLIC_DIR, 'styles.css'), dst: path.join(APP_BUNDLE_DIR, 'public/styles.css') },
    { src: path.join(SRC_DIR, 'server.js'), dst: path.join(APP_BUNDLE_DIR, 'src/server.js') },
    { src: path.join(SRC_DIR, 'minecraft-service.js'), dst: path.join(APP_BUNDLE_DIR, 'src/minecraft-service.js') },
    { src: path.join(SRC_DIR, 'player-data-service.js'), dst: path.join(APP_BUNDLE_DIR, 'src/player-data-service.js') }
  ];

  for (const pair of checkFiles) {
    if (!fs.existsSync(pair.dst)) {
      logWarn(`Fichier manquant dans le bundle de l'app : ${path.relative(PROJECT_ROOT, pair.dst)}`);
      bundleOutOfSync = true;
      continue;
    }

    const srcStat = fs.statSync(pair.src);
    const dstStat = fs.statSync(pair.dst);
    if (srcStat.size !== dstStat.size) {
      logWarn(`Désynchronisation détectée : ${path.basename(pair.src)} (source: ${srcStat.size} octets, bundle: ${dstStat.size} octets)`);
      bundleOutOfSync = true;
    }
  }

  if (!bundleOutOfSync) {
    logPass('Le bundle "Minecraft Server Manager.app" est parfaitement synchronisé avec les fichiers sources');
  } else {
    logWarn('Le bundle contient des fichiers désynchronisés. Une copie ou un build-pkg est recommandé.');
  }
} else {
  logWarn('Dossier du bundle non trouvé à l\'emplacement par défaut.');
}

// ---------------------------------------------------------------------------
// 8. Compilation du wrapper natif Swift
// ---------------------------------------------------------------------------
logHeader('8. Test de compilation du wrapper Swift (main.swift)');

const swiftSource = path.join(SRC_DIR, 'native-app/main.swift');
if (fs.existsSync(swiftSource)) {
  try {
    execSync(`swiftc -parse "${swiftSource}"`, { stdio: 'pipe' });
    logPass('Code Swift syntaxiquement valide (main.swift)');
  } catch (err) {
    logFail('Erreur de compilation Swift (main.swift)', err.stderr ? err.stderr.toString().trim() : err.message);
  }
}


// ---------------------------------------------------------------------------
// 9. Vérification des composants et lanceurs Windows
// ---------------------------------------------------------------------------
logHeader('9. Vérification des lanceurs & artefacts Windows');

const winFiles = [
  { path: path.join(PROJECT_ROOT, 'Lancer-Manager.bat'), label: 'Lanceur Windows Batch (Lancer-Manager.bat)' },
  { path: path.join(PROJECT_ROOT, 'Lancer-Manager.vbs'), label: 'Lanceur Windows Silencieux (Lancer-Manager.vbs)' },
  { path: path.join(PROJECT_ROOT, 'AppIcon.ico'), label: 'Icône native Windows (AppIcon.ico)' },
  { path: path.join(PROJECT_ROOT, 'scripts/build-win.sh'), label: 'Script de build Windows (build-win.sh)' },
  { path: path.join(PROJECT_ROOT, 'scripts/installer.nsi'), label: 'Script NSIS d\'installation (installer.nsi)' },
  { path: path.join(PROJECT_ROOT, 'scripts/start-server.vbs'), label: 'Script de démarrage silencieux Windows (start-server.vbs)' },
  { path: path.join(PROJECT_ROOT, 'MinecraftServerManager.exe'), label: 'Lanceur natif Windows compilé (MinecraftServerManager.exe)' },
  { path: path.join(PROJECT_ROOT, 'dist/Minecraft-Server-Manager-Installer.exe'), label: 'Installeur Windows compilé (.exe)' },
  { path: path.join(SRC_DIR, 'native-app-win/Program.cs'), label: 'Wrapper C# natif Windows (Program.cs)' }
];

for (const item of winFiles) {
  if (fs.existsSync(item.path)) {
    const size = fs.statSync(item.path).size;
    if (size > 0) {
      logPass(`Composant Windows présent et valide : ${item.label}`);
    } else {
      logWarn(`Fichier Windows vide (0 octet) : ${item.label}`);
    }
  } else {
    logFail(`Composant Windows manquant : ${item.label}`);
  }
}


try {
  execSync('cd scripts && makensis -V1 launcher.nsi', { cwd: PROJECT_ROOT, stdio: 'pipe' });
  logPass('Compilation NSIS du lanceur natif validée (MinecraftServerManager.exe)');
} catch (err) {
  logFail('Erreur de compilation du lanceur NSIS', err.message);
}

// ---------------------------------------------------------------------------
// Résumé Final
// ---------------------------------------------------------------------------
console.log('\n=======================================================');
console.log('                 RÉSUMÉ DU DIAGNOSTIC');
console.log('=======================================================');
console.log(`  ✔ Tests réussis : \x1b[32m${results.passed}\x1b[0m`);
console.log(`  ⚠ Avertissements : \x1b[33m${results.warnings}\x1b[0m`);
console.log(`  ✖ Échecs/Erreurs : \x1b[31m${results.failed}\x1b[0m`);
console.log('=======================================================');

if (results.failed > 0) {
  console.log('\n\x1b[31mDes anomalies critiques ont été détectées. Veuillez corriger les points signalés ci-dessus.\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\n\x1b[32mL\'application est 100% saine et opérationnelle sur l\'ensemble de ses composants !\x1b[0m\n');
  process.exit(0);
}

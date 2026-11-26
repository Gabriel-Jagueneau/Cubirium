// Cubirium - Frontend Client Logic

let activeWorld = null;
let serverStatus = 'STOPPED';
let currentServerStartTime = null;
let tunnelAddress = null;
let currentAnalysis = null;
let uploadedFilePath = null;
let autoScroll = true;
let isDownloadingJava = false;
let javaDownloadStep = '';

// DOM Elements
const worldsList = document.getElementById('worldsList');
const worldsCountBadge = document.getElementById('worldsCountBadge');
const btnRefreshWorlds = document.getElementById('btnRefreshWorlds');


const terminalOutput = document.getElementById('terminalOutput');
const activeWorldTitle = document.getElementById('activeWorldTitle');
const serverPulseDot = document.getElementById('serverPulseDot');
const btnStopActiveServer = document.getElementById('btnStopActiveServer');
const btnClearConsole = document.getElementById('btnClearConsole');
const playersOnlineBadge = document.getElementById('playersOnlineBadge');
const playersCount = document.getElementById('playersCount');
const terminalStatusTag = document.getElementById('terminalStatusTag');
const btnLaunchViewedWorld = document.getElementById('btnLaunchViewedWorld');

let selectedTerminalWorldId = null;
const terminalBuffers = {}; // worldId -> string[]
const terminalUnread = {};   // worldId -> count
let worldsListCache = [];
let currentPlayersList = [];

const cmdForm = document.getElementById('cmdForm');
const cmdInput = document.getElementById('cmdInput');
const btnSendCmd = document.getElementById('btnSendCmd');

// Modal Elements
const createModal = document.getElementById('createModal');
const btnOpenCreateModal = document.getElementById('btnOpenCreateModal');
const btnCloseCreateModal = document.getElementById('btnCloseCreateModal');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

const formCreateVanilla = document.getElementById('formCreateVanilla');
const vanillaName = document.getElementById('vanillaName');
const vanillaVersion = document.getElementById('vanillaVersion');
const btnCancelVanilla = document.getElementById('btnCancelVanilla');

const formCreateModded = document.getElementById('formCreateModded');
const moddedName = document.getElementById('moddedName');
const dropZone = document.getElementById('dropZone');
const dropTitle = document.getElementById('dropTitle');
const modpackFileInput = document.getElementById('modpackFileInput');
const modConfigRow = document.getElementById('modConfigRow');
const moddedVersion = document.getElementById('moddedVersion');
const moddedLoader = document.getElementById('moddedLoader');
const detectedVerBadge = document.getElementById('detectedVerBadge');
const detectedLoaderBadge = document.getElementById('detectedLoaderBadge');

// Modal de progression de création
const createProgressModal = document.getElementById('createProgressModal');
const progressModalTitle = document.getElementById('progressModalTitle');
const progressModalSubtitle = document.getElementById('progressModalSubtitle');
const progressBarFill = document.getElementById('progressBarFill');
const progressStepText = document.getElementById('progressStepText');
const progressPctText = document.getElementById('progressPctText');
const progressModalSpinner = document.getElementById('progressModalSpinner');
const progressSuccessIcon = document.getElementById('progressSuccessIcon');
const progressErrorIcon = document.getElementById('progressErrorIcon');
const progressModalFooter = document.getElementById('progressModalFooter');
const btnCloseProgressModal = document.getElementById('btnCloseProgressModal');
const analysisResults = document.getElementById('analysisResults');
const serverModsCount = document.getElementById('serverModsCount');
const clientModsCount = document.getElementById('clientModsCount');
const excludedModsList = document.getElementById('excludedModsList');
const btnSubmitModded = document.getElementById('btnSubmitModded');
const btnCancelModded = document.getElementById('btnCancelModded');

const toast = document.getElementById('toast');

// Toast Helper avec icônes Flat SVG thématiques et contextuelles
function showToast(msg, type = 'info') {
  let iconSvg = '';
  const lower = (msg || '').toLowerCase();

  if (lower.includes('copi') || lower.includes('presse-papier')) {
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  } else if (lower.includes('sauvegarde') || lower.includes('export') || lower.includes('enregistré')) {
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
  } else if (lower.includes('tunnel') || lower.includes('ip') || lower.includes('réseau') || lower.includes('en ligne')) {
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
  } else if (lower.includes('démarré') || lower.includes('lancé') || lower.includes('démarrage')) {
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
  } else if (lower.includes('arrêt') || lower.includes('stoppé') || lower.includes('fermé')) {
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"></rect></svg>`;
  } else if (lower.includes('java') || lower.includes('runtime')) {
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>`;
  } else if (lower.includes('répar') || lower.includes('diagnostic')) {
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`;
  } else if (type === 'success') {
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  } else if (type === 'warning') {
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
  } else {
    iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  toast.innerHTML = `<span class="toast-icon">${iconSvg}</span><span class="toast-text">${escapeHtml(msg)}</span>`;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 3500);
}

// ----------------------------------------------------
// API Calls
// ----------------------------------------------------
async function fetchWorlds() {
  try {
    const res = await fetch('/api/worlds');
    const data = await res.json();
    renderWorlds(data.worlds || []);
  } catch (err) {
    showToast('Erreur chargement des mondes: ' + err.message, 'error');
  }
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.minecraft) updateMinecraftState(data.minecraft);
    if (data.tunnel) updateTunnelState(data.tunnel);
    if (data.welcomeNeeded && !isWelcomeDismissed) {
      const modal = document.getElementById('welcomeModal');
      if (!modal || modal.style.display !== 'flex') {
        checkWelcomeModal(true);
      }
    }
  } catch (e) {
    console.error('Fetch status error', e);
  }
}

async function fetchVanillaVersions() {
  try {
    const res = await fetch('/api/vanilla/versions');
    const data = await res.json();
    if (data.versions && data.versions.length > 0) {
      vanillaVersion.innerHTML = data.versions.map(v =>
        `<option value="${v.id}">${v.label || ('Minecraft ' + v.id)}</option>`
      ).join('');
      vanillaVersion.selectedIndex = 0;
    }
  } catch (e) { }
}

async function startWorld(worldId, force = false) {
  try {
    selectTerminalWorld(worldId);
    showToast(force ? `Démarrage forcé de ${worldId}...` : `Démarrage de ${worldId}...`, 'info');
    const res = await fetch('/api/worlds/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId, force: !!force })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors du démarrage');
    showToast(force ? `Monde ${worldId} démarré de force !` : `Monde ${worldId} lancé avec succès !`, 'success');
    fetchWorlds();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function forceStartWorld(worldId) {
  return startWorld(worldId, true);
}
window.forceStartWorld = forceStartWorld;


async function stopActiveWorld() {
  if (isDownloadingJava) {
    showToast("Installation de Java en cours. L'arrêt du serveur est bloqué pendant cette étape.", 'warning');
    return;
  }
  try {
    showToast("Arrêt du serveur en cours...", 'info');
    let clientCurrentRuntime = null;
    if (activeWorld) {
      const activeCard = document.querySelector(`.world-card[data-id="${activeWorld}"] .runtime-val`);
      if (activeCard) {
        clientCurrentRuntime = parseInt(activeCard.getAttribute('data-current-runtime') || '0', 10);
      }
    }
    const res = await fetch('/api/worlds/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: false, clientRuntime: clientCurrentRuntime })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'arrêt');
    showToast("Serveur arrêté.", 'info');
    fetchWorlds();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openWorldFolder(worldId, customPath = null) {
  const isWin = navigator.platform.includes('Win') || navigator.userAgent.includes('Windows');
  const explorerName = isWin ? "l'Explorateur" : "le Finder";
  try {
    const foundWorld = (typeof worldsListCache !== 'undefined' && Array.isArray(worldsListCache))
      ? worldsListCache.find(w => w.id === worldId)
      : null;
    const targetPath = customPath || (foundWorld ? foundWorld.path : null);

    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.openFinder && targetPath) {
      window.webkit.messageHandlers.openFinder.postMessage(targetPath);
      showToast(`Dossier ouvert dans ${explorerName}`, 'success');
      return;
    }

    const res = await fetch('/api/worlds/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId, customPath: targetPath })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Dossier ouvert dans ${explorerName}`, 'success');
    } else {
      showToast(`Erreur ouverture : ${data.error || 'Dossier introuvable'}`, 'error');
    }
  } catch (err) {
    showToast(`Erreur ouverture : ${err.message}`, 'error');
  }
}
window.openWorldFolder = openWorldFolder;

let currentRepairWorldId = null;
let pendingRepairLaunchWorldId = null;
let _isRepairInProgress = false;

function triggerWorldRepair(worldId) {
  currentRepairWorldId = worldId;
  pendingRepairLaunchWorldId = worldId;
  const modal = document.getElementById('repairReportModal');
  if (!modal) return;

  const title = document.getElementById('repairReportTitle');
  if (title) title.textContent = `Diagnostic & Réparation : ${worldId}`;
  const sub = document.getElementById('repairReportSub');
  if (sub) sub.textContent = "Analyse méthodique et rétablissement du serveur";

  // Réinitialiser les écrans du modal
  const stepIntro = document.getElementById('repairStepIntro');
  const stepProgress = document.getElementById('repairStepProgress');
  const stepResult = document.getElementById('repairStepResult');
  if (stepIntro) stepIntro.style.display = 'flex';
  if (stepProgress) stepProgress.style.display = 'none';
  if (stepResult) stepResult.style.display = 'none';

  // Réinitialiser les boutons du footer
  const btnStart = document.getElementById('btnStartInteractiveRepair');
  const btnLaunch = document.getElementById('btnLaunchAfterRepair');
  const btnOpenFolder = document.getElementById('btnOpenFolderAfterCorrupted');
  const btnDismiss = document.getElementById('btnDismissRepairReport');
  if (btnStart) {
    btnStart.style.display = 'inline-flex';
    btnStart.disabled = false;
  }
  if (btnLaunch) btnLaunch.style.display = 'none';
  if (btnOpenFolder) btnOpenFolder.style.display = 'none';
  if (btnDismiss) {
    btnDismiss.disabled = false;
    btnDismiss.textContent = 'Annuler';
  }

  // Réinitialiser la barre de progression
  const pBar = document.getElementById('repairProgressBar');
  if (pBar) pBar.style.width = '0%';
  const pEta = document.getElementById('repairTimelineEta');
  if (pEta) pEta.textContent = 'Estimation : ~10s';

  modal.style.display = 'flex';
}
window.triggerWorldRepair = triggerWorldRepair;

function closeRepairReportModal() {
  if (_isRepairInProgress) return;
  const modal = document.getElementById('repairReportModal');
  if (modal) modal.style.display = 'none';
  currentRepairWorldId = null;
  pendingRepairLaunchWorldId = null;
}
window.closeRepairReportModal = closeRepairReportModal;

async function backupWorldBeforeRepair() {
  if (!currentRepairWorldId) return;
  const wid = currentRepairWorldId;
  showToast(`Sauvegarde et export de ${wid}...`, 'info');
  try {
    const res = await fetch('/api/worlds/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId: wid })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Échec de l'export.");
    showToast(`Sauvegarde de ${wid} exportée avec succès !`, 'success');
  } catch (err) {
    showToast(`Erreur d'export : ${err.message}`, 'error');
  }
}
window.backupWorldBeforeRepair = backupWorldBeforeRepair;

async function startInteractiveWorldRepair() {
  if (!currentRepairWorldId || _isRepairInProgress) return;
  const wid = currentRepairWorldId;
  _isRepairInProgress = true;

  const stepIntro = document.getElementById('repairStepIntro');
  const stepProgress = document.getElementById('repairStepProgress');
  const stepResult = document.getElementById('repairStepResult');
  const btnStart = document.getElementById('btnStartInteractiveRepair');
  const btnDismiss = document.getElementById('btnDismissRepairReport');
  if (stepIntro) stepIntro.style.display = 'none';
  if (stepProgress) stepProgress.style.display = 'flex';
  if (stepResult) stepResult.style.display = 'none';
  if (btnStart) btnStart.style.display = 'none';
  if (btnDismiss) {
    btnDismiss.disabled = true;
    btnDismiss.textContent = 'Diagnostic en cours...';
  }

  const pBar = document.getElementById('repairProgressBar');
  const pEta = document.getElementById('repairTimelineEta');
  const miniText = document.getElementById('repairMiniblocText');
  const stepsContainer = document.getElementById('repairTimelineSteps');

  const setTimelineStep = (stepNum, status = 'active', message = '') => {
    if (stepsContainer) {
      stepsContainer.querySelectorAll('.timeline-step').forEach(st => {
        const num = parseInt(st.getAttribute('data-step') || '0', 10);
        if (num < stepNum) {
          st.className = 'timeline-step done';
        } else if (num === stepNum) {
          st.className = `timeline-step ${status}`;
        } else {
          st.className = 'timeline-step';
        }
      });
    }
    if (miniText && message) miniText.textContent = message;
    if (pBar) pBar.style.width = `${Math.min(100, stepNum * 20)}%`;
  };

  // Lancement de la requête de réparation backend en parallèle
  const repairPromise = fetch('/api/worlds/repair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ worldId: wid })
  }).then(r => r.json()).catch(err => ({ success: false, error: err.message }));

  try {
    // Étape 1 : Analyse des Journaux & Crash Reports
    setTimelineStep(1, 'active', "Analyse méthodique de latest.log et crash-reports/, repérage des exceptions [ERROR]/[FATAL]...");
    if (pEta) pEta.textContent = "Estimation : ~10s";
    await new Promise(r => setTimeout(r, 1400));

    // Étape 2 : Ports Réseau & Sockets (FAILED TO BIND TO PORT)
    setTimelineStep(2, 'active', "Contrôle du port réseau 25565 et fermeture des sockets ou instances Java orphelines...");
    if (pEta) pEta.textContent = "Estimation : ~8s";
    await new Promise(r => setTimeout(r, 1600));

    // Étape 3 : Mémoire Vive & Arguments JVM (OutOfMemoryError)
    setTimelineStep(3, 'active', "Calibration de la mémoire vive (-Xms/-Xmx) et réglage des arguments JVM GC...");
    if (pEta) pEta.textContent = "Estimation : ~5s";
    await new Promise(r => setTimeout(r, 1500));

    // Étape 4 : Intégrité du Monde & Chunks NBT (level.dat / données NBT)
    setTimelineStep(4, 'active', "Vérification de level.dat (level.dat_old), isolation des régions corrompues et purge du cache...");
    if (pEta) pEta.textContent = "Estimation : ~3s";
    await new Promise(r => setTimeout(r, 1600));

    // Étape 5 : Environnement Java, Conflits de Mods & Exécutables
    setTimelineStep(5, 'active', "Synchronisation du JRE, isolation des mixins défaillants et validation de server.properties / EULA...");
    if (pEta) pEta.textContent = "Finalisation...";

    const data = await repairPromise;
    await new Promise(r => setTimeout(r, 1000));

    if (pBar) pBar.style.width = '100%';
    if (miniText) miniText.textContent = "Analyse terminée avec succès.";

    await new Promise(r => setTimeout(r, 600));

    // Affichage de l'écran résultat
    if (stepProgress) stepProgress.style.display = 'none';
    if (stepResult) stepResult.style.display = 'flex';
    if (btnDismiss) {
      btnDismiss.disabled = false;
      btnDismiss.textContent = 'Fermer';
    }

    const title = document.getElementById('repairReportTitle');
    const sub = document.getElementById('repairReportSub');
    const fixesTitle = document.getElementById('repairFixesTitle');
    const fixesList = document.getElementById('repairFixesList');
    const diagBox = document.getElementById('repairDiagnosisBox');
    const diagText = document.getElementById('repairDiagnosisText');
    const btnLaunch = document.getElementById('btnLaunchAfterRepair');
    const btnOpenFolder = document.getElementById('btnOpenFolderAfterCorrupted');

    if (data && data.success) {
      if (title) title.textContent = `Monde Réparé : ${wid}`;
      if (sub) sub.textContent = "Toutes les anomalies détectées ont été résolues avec succès.";
      if (fixesTitle) fixesTitle.textContent = "Opérations correctives appliquées";
      if (diagBox) diagBox.style.display = 'none';

      if (fixesList) {
        fixesList.innerHTML = '';
        const items = (Array.isArray(data.fixes) && data.fixes.length > 0)
          ? data.fixes
          : ["Intégrité de level.dat vérifiée et validée", "Verrous session.lock résiduels supprimés", "server.properties optimisé et CLUF EULA validé", "Permissions d'exécution et environnement Java cohérents"];
        items.forEach(fix => {
          const li = document.createElement('li');
          li.textContent = fix;
          fixesList.appendChild(li);
        });
      }

      if (btnLaunch) btnLaunch.style.display = 'inline-flex';
      if (btnOpenFolder) btnOpenFolder.style.display = 'none';
      showToast(`Monde ${wid} réparé avec succès !`, 'success');
    } else {
      // Diagnostic échoué ou monde déclaré corrompu
      if (title) title.textContent = `Diagnostic : Monde Corrompu`;
      if (sub) sub.textContent = "Le monde présente des altérations irréversibles.";
      if (fixesTitle) fixesTitle.textContent = "Bilan de l'incident critique";

      if (diagBox && diagText) {
        diagText.textContent = (data && (data.message || data.error)) || "Les fichiers de région ou structures critiques ne peuvent pas être reconstruits automatiquement.";
        diagBox.style.display = 'block';
      }

      if (fixesList) {
        fixesList.innerHTML = '';
        const items = (data && Array.isArray(data.report) && data.report.length > 0)
          ? data.report
          : ["Tentative de récupération de level.dat", "Analyse des exceptions JVM dans latest.log", "Échec de reconstruction des structures du monde"];
        items.forEach(rep => {
          const li = document.createElement('li');
          li.textContent = rep;
          fixesList.appendChild(li);
        });
      }

      if (btnLaunch) btnLaunch.style.display = 'none';
      if (btnOpenFolder) btnOpenFolder.style.display = 'inline-flex';

      // Marquer le monde comme corrompu dans le cache local
      const found = (worldsListCache || []).find(w => w.id === wid);
      if (found) {
        found.isCorrupted = true;
        found.needsRepair = false;
      }
      showToast(`Le monde ${wid} est corrompu et ne peut pas être réparé automatiquement.`, 'error');
    }

    await fetchWorlds();
  } catch (err) {
    showToast(`Erreur de réparation : ${err.message}`, 'error');
    if (btnDismiss) {
      btnDismiss.disabled = false;
      btnDismiss.textContent = 'Fermer';
    }
  } finally {
    _isRepairInProgress = false;
  }
}
window.startInteractiveWorldRepair = startInteractiveWorldRepair;

function openWorldFolderFromRepair() {
  if (currentRepairWorldId) {
    openWorldFolder(currentRepairWorldId);
  }
  closeRepairReportModal();
}
window.openWorldFolderFromRepair = openWorldFolderFromRepair;


async function sendCommand(cmd) {
  if (!cmd.trim()) return;
  if (selectedTerminalWorldId !== activeWorld || serverStatus !== 'RUNNING') {
    showToast(`Le monde sélectionné n'est pas allumé.`, 'error');
    return;
  }
  try {
    const res = await fetch('/api/worlds/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd, worldId: selectedTerminalWorldId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur commande');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function formatSeconds(totalSecs) {
  const secs = Math.max(0, Math.floor(totalSecs || 0));
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const remSecs = secs % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
}

function formatRuntime(startTime, baseSeconds = 0) {
  if (!startTime) return formatSeconds(baseSeconds);
  const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  return formatSeconds(baseSeconds + elapsed);
}
const formatUptime = formatRuntime;

function getSuggestedWorldName() {
  const count = (worldsListCache && worldsListCache.length) ? worldsListCache.length : 0;
  let nextNum = count + 1;
  const existing = new Set((worldsListCache || []).map(w => (w.name || '').toLowerCase()));
  while (existing.has(`monde-${nextNum}`)) {
    nextNum++;
  }
  return `monde-${nextNum}`;
}

// Ticker de Runtime chaque seconde (compte exactement le temps d'allumage du serveur sans jamais dériver ni reculer)
setInterval(() => {
  document.querySelectorAll('.runtime-val').forEach(el => {
    const wid = el.getAttribute('data-world-id');
    const isThisRunning = ((serverStatus === 'RUNNING' || serverStatus === 'STARTING' || serverStatus === 'STOPPING') && wid === activeWorld);
    const baseRuntime = parseInt(el.getAttribute('data-base-runtime') || '0', 10);
    const prevCurrent = parseInt(el.getAttribute('data-current-runtime') || '0', 10);
    let startTimeStr = el.getAttribute('data-start-time');

    if (isThisRunning) {
      if ((!startTimeStr || startTimeStr === '0' || startTimeStr === '') && currentServerStartTime) {
        startTimeStr = String(currentServerStartTime);
        el.setAttribute('data-start-time', startTimeStr);
      }
      const st = parseInt(startTimeStr, 10);
      if (st > 0) {
        const elapsed = Math.max(0, Math.floor((Date.now() - st) / 1000));
        const total = Math.max(prevCurrent, baseRuntime + elapsed);
        const formatted = formatSeconds(total);
        if (el.textContent !== formatted) el.textContent = formatted;
        el.setAttribute('data-current-runtime', String(total));
        return;
      }
    }

    // Si le monde est arrêté : afficher son runtime cumulé persistant sans jamais reculer
    const curr = Math.max(prevCurrent, parseInt(el.getAttribute('data-base-runtime') || '0', 10));
    const formatted = formatSeconds(curr);
    if (el.textContent !== formatted) el.textContent = formatted;
    el.setAttribute('data-current-runtime', String(curr));
  });
}, 1000);

// ----------------------------------------------------
// UI Renderers, Pinning, Collapsing & Per-World Terminals
// ----------------------------------------------------
const STORAGE_PINNED_WORLDS = 'mc_pinned_worlds_order';
const STORAGE_COLLAPSED_WORLDS = 'mc_collapsed_worlds_set';

function getPinnedWorldIds() {
  try {
    const raw = localStorage.getItem(STORAGE_PINNED_WORLDS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function savePinnedWorldIds(ids) {
  try {
    localStorage.setItem(STORAGE_PINNED_WORLDS, JSON.stringify(ids));
  } catch (e) { }
}

function getCollapsedWorldIds() {
  try {
    const raw = localStorage.getItem(STORAGE_COLLAPSED_WORLDS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveCollapsedWorldIds(ids) {
  try {
    localStorage.setItem(STORAGE_COLLAPSED_WORLDS, JSON.stringify(ids));
  } catch (e) { }
}

function togglePinWorld(worldId) {
  let pinned = getPinnedWorldIds();
  const idx = pinned.indexOf(worldId);
  const wasPinned = (idx !== -1);
  if (wasPinned) {
    pinned.splice(idx, 1);
  } else {
    pinned.push(worldId);
  }
  savePinnedWorldIds(pinned);
  renderWorlds(worldsListCache);
  if (wasPinned) {
    selectTerminalWorld(worldId);
    scrollWorldCardIntoView(worldId);
  }
}

function movePinnedWorld(worldId, delta) {
  let pinned = getPinnedWorldIds();
  const idx = pinned.indexOf(worldId);
  if (idx === -1) return;
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= pinned.length) return;
  const temp = pinned[idx];
  pinned[idx] = pinned[targetIdx];
  pinned[targetIdx] = temp;
  savePinnedWorldIds(pinned);
  renderWorlds(worldsListCache);
}

function toggleCollapseWorld(worldId) {
  let collapsed = getCollapsedWorldIds();
  const idx = collapsed.indexOf(worldId);
  const isNowCollapsed = (idx === -1);
  if (isNowCollapsed) {
    collapsed.push(worldId);
  } else {
    collapsed.splice(idx, 1);
  }
  saveCollapsedWorldIds(collapsed);

  const card = document.querySelector(`.world-card[data-id="${worldId}"]`);
  if (card) {
    card.classList.toggle('collapsed', isNowCollapsed);
    const chevron = card.querySelector('.chevron-icon');
    if (chevron) chevron.classList.toggle('collapsed', isNowCollapsed);
    const collapseBtn = card.querySelector('.btn-card-collapse');
    if (collapseBtn) collapseBtn.title = isNowCollapsed ? 'Déplier la carte' : 'Replier la carte';
  } else {
    renderWorlds(worldsListCache);
  }
}

// Drag & drop pour réordonner les mondes épinglés avec suivi souris en temps réel et déplacement dynamique fluide
let draggedPinnedWorldId = null;
let currentHoverPinnedIdx = null;
let floatingCardEl = null;
let dragOriginCardEl = null;
let initialPinnedSlots = [];

function activateDropHighlights() {
  const grid = document.getElementById('worldsList');
  if (grid) grid.classList.add('is-dragging-pinned');
}

function deactivateDropHighlights() {
  const grid = document.getElementById('worldsList');
  if (grid) grid.classList.remove('is-dragging-pinned');
}

function updatePinnedDisplacements(fromIdx, toIdx) {
  if (currentHoverPinnedIdx === toIdx) return;
  currentHoverPinnedIdx = toIdx;

  const pinned = getPinnedWorldIds();
  const draggedSlot = initialPinnedSlots[fromIdx];
  if (!draggedSlot) return;

  const draggedHeight = draggedSlot.height;
  const GAP = 14;

  pinned.forEach((id, idx) => {
    const card = document.querySelector(`.world-card[data-id="${id}"]:not(.floating-drag-card)`);
    if (!card) return;

    let shift = 0;
    if (toIdx !== null && toIdx !== -1 && toIdx !== fromIdx) {
      if (idx === fromIdx) {
        // La carte déplacée (fantôme) se place directement à son emplacement d'arrivée
        const targetSlot = initialPinnedSlots[toIdx];
        if (targetSlot) {
          if (fromIdx > toIdx) {
            // Déplacement vers le haut : aligne le haut de la carte avec le slot d'arrivée
            shift = targetSlot.initialTop - draggedSlot.initialTop;
          } else {
            // Déplacement vers le bas : aligne le bas de la carte avec le bas du slot d'arrivée
            shift = (targetSlot.initialTop + targetSlot.height - draggedHeight) - draggedSlot.initialTop;
          }
        }
      } else if (fromIdx > toIdx) {
        // Déplacement vers le haut : les cartes entre toIdx et fromIdx-1 descendent
        if (idx >= toIdx && idx < fromIdx) {
          shift = draggedHeight + GAP;
        }
      } else if (fromIdx < toIdx) {
        // Déplacement vers le bas : les cartes entre fromIdx+1 et toIdx montent
        if (idx > fromIdx && idx <= toIdx) {
          shift = -(draggedHeight + GAP);
        }
      }
    }

    if (shift !== 0) {
      card.style.transform = `translateY(${shift}px)`;
    } else {
      card.style.transform = '';
    }
  });
}

function clearPinnedDisplacements() {
  currentHoverPinnedIdx = null;
  const pinned = getPinnedWorldIds();
  pinned.forEach(id => {
    const card = document.querySelector(`.world-card[data-id="${id}"]:not(.floating-drag-card)`);
    if (card) {
      card.style.transform = '';
    }
  });
}

function handlePinnedPointerDown(e, worldId) {
  if (e.button !== 0) return; // Uniquement clic gauche
  const pinned = getPinnedWorldIds();
  if (pinned.length === 0) return;

  e.preventDefault();
  e.stopPropagation();

  const handleEl = e.currentTarget;
  if (handleEl && handleEl.setPointerCapture) {
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch (err) { }
  }

  const startX = e.clientX;
  const startY = e.clientY;
  const origCard = document.querySelector(`.world-card[data-id="${worldId}"]`);
  if (!origCard) return;

  const fromIdx = pinned.indexOf(worldId);
  if (fromIdx === -1) return;

  let isDraggingActive = false;
  let grabOffsetX = 0;
  let grabOffsetY = 0;
  let initialSlots = [];
  let targetDropIdx = fromIdx;

  const onPointerMove = (moveEvt) => {
    if (!isDraggingActive) {
      const dist = Math.hypot(moveEvt.clientX - startX, moveEvt.clientY - startY);
      if (dist < 4) return; // Seuil d'activation de 4px

      isDraggingActive = true;
      document.body.classList.add('is-dragging-card');
      draggedPinnedWorldId = worldId;
      dragOriginCardEl = origCard;
      activateDropHighlights();

      const rect = origCard.getBoundingClientRect();
      grabOffsetX = startX - rect.left;
      grabOffsetY = startY - rect.top;

      // Mesure des centres verticaux initiaux pour chaque emplacement épinglé
      const grid = document.getElementById('worldsList');
      const gridRect = grid ? grid.getBoundingClientRect() : { top: 0 };
      const gridScrollTop = grid ? grid.scrollTop : 0;

      initialPinnedSlots = pinned.map((id, idx) => {
        const c = document.querySelector(`.world-card[data-id="${id}"]`);
        if (!c) return { id, idx, initialTop: 0, height: 0, midYInGrid: 0, scrollTop: gridScrollTop };
        const r = c.getBoundingClientRect();
        return {
          id,
          idx,
          initialTop: r.top,
          height: r.height,
          midYInGrid: (r.top - gridRect.top) + r.height / 2,
          scrollTop: gridScrollTop
        };
      });
      initialSlots = initialPinnedSlots;

      // Création de la carte flottante qui suit le curseur en temps réel
      floatingCardEl = origCard.cloneNode(true);
      floatingCardEl.className = origCard.className + ' floating-drag-card';
      floatingCardEl.style.width = rect.width + 'px';
      floatingCardEl.style.height = rect.height + 'px';
      floatingCardEl.style.left = (moveEvt.clientX - grabOffsetX) + 'px';
      floatingCardEl.style.top = (moveEvt.clientY - grabOffsetY) + 'px';
      floatingCardEl.style.transform = '';
      floatingCardEl.style.margin = '0';
      document.body.appendChild(floatingCardEl);

      origCard.classList.add('dragging-origin');
    }

    if (isDraggingActive && floatingCardEl) {
      // Suivi de la souris 1:1
      floatingCardEl.style.left = (moveEvt.clientX - grabOffsetX) + 'px';
      floatingCardEl.style.top = (moveEvt.clientY - grabOffsetY) + 'px';

      // Auto-scroll du panneau si proche des bords haut/bas
      const grid = document.getElementById('worldsList');
      if (grid) {
        const gRect = grid.getBoundingClientRect();
        if (moveEvt.clientY < gRect.top + 45) {
          grid.scrollTop -= 8;
        } else if (moveEvt.clientY > gRect.bottom - 45) {
          grid.scrollTop += 8;
        }
      }

      // Si au moins 2 cartes sont épinglées, calculer l'emplacement cible et animer les autres cartes
      if (pinned.length >= 2) {
        const gRect = grid ? grid.getBoundingClientRect() : { top: 0 };
        const currentScrollTop = grid ? grid.scrollTop : 0;
        let closestIdx = fromIdx;
        let minDistance = Infinity;

        initialSlots.forEach(slot => {
          const slotScreenMidY = gRect.top + slot.midYInGrid - (currentScrollTop - slot.scrollTop);
          const dist = Math.abs(moveEvt.clientY - slotScreenMidY);
          if (dist < minDistance) {
            minDistance = dist;
            closestIdx = slot.idx;
          }
        });

        targetDropIdx = closestIdx;
        updatePinnedDisplacements(fromIdx, targetDropIdx);
      }
    }
  };

  const onPointerUp = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);

    if (handleEl && handleEl.releasePointerCapture) {
      try {
        if (handleEl.hasPointerCapture(e.pointerId)) {
          handleEl.releasePointerCapture(e.pointerId);
        }
      } catch (err) { }
    }

    document.body.classList.remove('is-dragging-card');

    if (isDraggingActive) {
      if (floatingCardEl) {
        floatingCardEl.remove();
        floatingCardEl = null;
      }
      if (dragOriginCardEl) {
        dragOriginCardEl.classList.remove('dragging-origin');
        dragOriginCardEl = null;
      }

      clearPinnedDisplacements();
      deactivateDropHighlights();

      if (targetDropIdx !== null && targetDropIdx !== fromIdx && pinned.length >= 2) {
        let curPinned = getPinnedWorldIds();
        const fIdx = curPinned.indexOf(worldId);
        if (fIdx !== -1 && targetDropIdx >= 0 && targetDropIdx < curPinned.length) {
          const [moved] = curPinned.splice(fIdx, 1);
          curPinned.splice(targetDropIdx, 0, moved);
          savePinnedWorldIds(curPinned);
          renderWorlds(worldsListCache);
        }
      }

      draggedPinnedWorldId = null;
      currentHoverPinnedIdx = null;
      initialPinnedSlots = [];
    }
  };

  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function getWorldPulseDotInfo(worldId) {
  const isThisActive = (worldId === activeWorld);
  if (!isThisActive) {
    return {
      className: 'pulse-dot',
      title: 'Serveur arrêté'
    };
  }

  if (isDownloadingJava) {
    return {
      className: 'pulse-dot downloading',
      title: javaDownloadStep || 'Téléchargement du runtime Java (dernière version)...'
    };
  }

  if (serverStatus === 'RUNNING') {
    return {
      className: 'pulse-dot online',
      title: 'Serveur en ligne'
    };
  }

  if (serverStatus === 'STARTING') {
    return {
      className: 'pulse-dot warning',
      title: 'Serveur en cours de démarrage'
    };
  }

  if (serverStatus === 'STOPPING') {
    return {
      className: 'pulse-dot warning',
      title: 'Serveur en cours d\'arrêt'
    };
  }

  return {
    className: 'pulse-dot',
    title: 'Serveur arrêté'
  };
}

let lastRenderedWorldsSignature = null;

// ==========================================
// Menu contextuel personnalisé universel (adaptatif selon la zone cliquée)
// ==========================================
const worldContextMenuEl = document.getElementById('worldContextMenu');
let activeContextWorldId = null;
const isMacContextPlatform = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
const CTX_MOD = isMacContextPlatform ? '⌘' : 'Ctrl+';

const CTX_ICONS = {
  play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
  stop: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"></rect></svg>`,
  spinner: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/></svg>`,
  folder: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
  repair: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`,
  players: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
  sliders: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="4" x2="14" y2="4"></line><line x1="10" y1="4" x2="3" y2="4"></line><line x1="21" y1="12" x2="12" y2="12"></line><line x1="8" y1="12" x2="3" y2="12"></line><line x1="21" y1="20" x2="16" y2="20"></line><line x1="12" y1="20" x2="3" y2="20"></line><line x1="14" y1="2" x2="14" y2="6"></line><line x1="8" y1="10" x2="8" y2="14"></line><line x1="16" y1="18" x2="16" y2="22"></line></svg>`,
  settings: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
  edit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`,
  pin: (filled) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-2l-2-2V5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8l-2 2v2z"></path><circle cx="12" cy="3" r="1"></circle></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
  copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
  cut: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line></svg>`,
  paste: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`,
  selectAll: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 3"></rect><line x1="8" y1="9" x2="16" y2="9"></line><line x1="8" y1="15" x2="16" y2="15"></line></svg>`,
  plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`,
  arrowDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`,
  link: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
  info: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  shield: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
  kick: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`,
  ban: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`
};

function copyTextUniversal(text, successMsg = null) {
  const str = String(text ?? '');
  if (!str) return;
  const done = () => {
    if (successMsg && typeof showToast === 'function') showToast(successMsg, 'success');
  };
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (_) { }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(str).then(done).catch(fallback);
  } else {
    fallback();
  }
}

async function clearTerminalDirectFromContextMenu() {
  if (!selectedTerminalWorldId) return;
  if (typeof resetClearButton === 'function') resetClearButton();
  const targetWorld = selectedTerminalWorldId;
  terminalBuffers[targetWorld] = [];
  if (terminalOutput) {
    terminalOutput.innerHTML = `
      <div class="terminal-welcome">
        <p>Logs effacés pour le monde <strong>${escapeHtml(targetWorld)}</strong>.</p>
      </div>`;
  }
  if (typeof showToast === 'function') {
    showToast(`Logs de '${targetWorld}' effacés avec succès.`, 'info');
  }
  try {
    await fetch('/api/logs/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId: targetWorld })
    });
  } catch (err) {
    console.error('Erreur clear logs:', err);
  }
}

function closeWorldContextMenu() {
  if (worldContextMenuEl) {
    worldContextMenuEl.classList.remove('visible');
    worldContextMenuEl.setAttribute('aria-hidden', 'true');
  }
  if (activeContextWorldId) {
    const prevCard = document.querySelector(`.world-card[data-id="${activeContextWorldId}"]`);
    if (prevCard) prevCard.classList.remove('context-active');
    activeContextWorldId = null;
  }
}

function renderCustomContextMenu(menuSpec, clientX, clientY) {
  if (!worldContextMenuEl || !Array.isArray(menuSpec) || menuSpec.length === 0) return;

  // Nettoyer séparateurs superflus (début, fin, ou consécutifs)
  const cleaned = [];
  for (const entry of menuSpec) {
    if (!entry) continue;
    if (entry.type === 'separator') {
      if (cleaned.length === 0 || cleaned[cleaned.length - 1].type === 'separator') continue;
    }
    cleaned.push(entry);
  }
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].type === 'separator') {
    cleaned.pop();
  }
  if (cleaned.length === 0) return;

  worldContextMenuEl.innerHTML = '';
  for (const entry of cleaned) {
    if (entry.type === 'separator') {
      const sep = document.createElement('div');
      sep.className = 'world-context-separator';
      sep.setAttribute('role', 'separator');
      worldContextMenuEl.appendChild(sep);
      continue;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'menuitem');
    btn.className = `world-context-item ${entry.className || ''}`.trim();
    if (entry.disabled) btn.disabled = true;
    const shortcutHtml = entry.shortcut ? `<span class="world-context-shortcut">${escapeHtml(entry.shortcut)}</span>` : '';
    btn.innerHTML = `${entry.icon || ''}<span class="world-context-item-label">${escapeHtml(entry.label)}</span>${shortcutHtml}`;
    let confirmResetTimer = null;
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (entry.disabled) return;
      if (entry.confirmLabel) {
        const isConfirming = btn.getAttribute('data-confirming') === 'true';
        if (!isConfirming) {
          btn.setAttribute('data-confirming', 'true');
          btn.classList.add('confirming');
          const lbl = btn.querySelector('.world-context-item-label');
          if (lbl) lbl.textContent = entry.confirmLabel;
          clearTimeout(confirmResetTimer);
          confirmResetTimer = setTimeout(() => {
            btn.removeAttribute('data-confirming');
            btn.classList.remove('confirming');
            if (lbl) lbl.textContent = entry.label;
          }, 4000);
          return;
        }
        clearTimeout(confirmResetTimer);
      }
      closeWorldContextMenu();
      if (typeof entry.onClick === 'function') entry.onClick();
    });
    worldContextMenuEl.appendChild(btn);
  }

  // Positionnement intelligent sans débordement hors de la fenêtre
  worldContextMenuEl.style.left = '0px';
  worldContextMenuEl.style.top = '0px';
  worldContextMenuEl.classList.add('visible');
  worldContextMenuEl.setAttribute('aria-hidden', 'false');

  const rect = worldContextMenuEl.getBoundingClientRect();
  const margin = 10;
  let posX = clientX;
  let posY = clientY;
  if (posX + rect.width > window.innerWidth - margin) {
    posX = Math.max(margin, window.innerWidth - rect.width - margin);
  }
  if (posY + rect.height > window.innerHeight - margin) {
    posY = Math.max(margin, window.innerHeight - rect.height - margin);
  }
  worldContextMenuEl.style.left = `${Math.round(posX)}px`;
  worldContextMenuEl.style.top = `${Math.round(posY)}px`;
}

function openWorldContextMenu(worldId, clientX, clientY) {
  if (!worldContextMenuEl) return;
  const w = (worldsListCache || []).find(item => item.id === worldId);
  if (!w) return;

  closeWorldContextMenu();
  activeContextWorldId = worldId;
  const targetCard = document.querySelector(`.world-card[data-id="${worldId}"]`);
  if (targetCard) targetCard.classList.add('context-active');

  const isRunning = w.isRunning || (w.id === activeWorld && (serverStatus === 'RUNNING' || serverStatus === 'STARTING'));
  const isServerRunning = (serverStatus !== 'STOPPED');
  const isActionDisabled = isServerRunning || isRunning;
  const isPinned = getPinnedWorldIds().includes(w.id);

  let primaryItem;
  if (isRunning) {
    if (isDownloadingJava) {
      primaryItem = { label: 'Téléchargement...', className: 'primary', disabled: true, icon: CTX_ICONS.spinner };
    } else {
      primaryItem = { label: 'Arrêter', className: 'stop', disabled: false, icon: CTX_ICONS.stop, onClick: () => stopActiveWorld() };
    }
  } else if (w.isCorrupted) {
    primaryItem = { label: 'Ouvrir le dossier', className: '', disabled: false, icon: CTX_ICONS.folder, onClick: () => openWorldFolder(w.id) };
  } else if (w.needsRepair) {
    primaryItem = { label: 'Réparer', className: 'repair', disabled: isServerRunning, icon: CTX_ICONS.repair, onClick: () => triggerWorldRepair(w.id) };
  } else {
    primaryItem = { label: 'Lancer', className: 'primary', disabled: isServerRunning, icon: CTX_ICONS.play, onClick: () => startWorld(w.id) };
  }

  const menuSpec = [
    primaryItem,
    { type: 'separator' },
    { label: 'Joueurs', disabled: !!w.isCorrupted, icon: CTX_ICONS.players, onClick: () => openPlayersManager(w.id) },
    { label: 'Paramètres', disabled: isActionDisabled || !!w.isCorrupted, icon: CTX_ICONS.sliders, onClick: () => openEditProps(w.id) },
    { label: 'Éditer', disabled: isActionDisabled || !!w.isCorrupted, icon: CTX_ICONS.settings, onClick: () => openRenameWorld(w.id) },
    { type: 'separator' },
    { label: isPinned ? 'Désépingler' : 'Épingler', className: isPinned ? 'pinned' : '', disabled: !!w.isCorrupted, icon: CTX_ICONS.pin(isPinned), onClick: () => togglePinWorld(w.id) },
    { type: 'separator' },
    { label: 'Supprimer', className: 'danger', disabled: isActionDisabled, icon: CTX_ICONS.trash, onClick: () => openDeleteWorld(w.id) }
  ];

  renderCustomContextMenu(menuSpec, clientX, clientY);
}

function buildEditableInputContextMenu(inputEl) {
  const isReadOnly = !!(inputEl.readOnly || inputEl.disabled);
  const isTextareaOrInput = inputEl.tagName === 'INPUT' || inputEl.tagName === 'TEXTAREA';
  const val = isTextareaOrInput ? (inputEl.value || '') : (inputEl.textContent || '');
  let selStart = 0;
  let selEnd = 0;
  let selectedText = '';

  if (isTextareaOrInput && typeof inputEl.selectionStart === 'number') {
    selStart = inputEl.selectionStart;
    selEnd = inputEl.selectionEnd;
    selectedText = val.slice(selStart, selEnd);
  } else {
    selectedText = (window.getSelection && window.getSelection().toString()) || '';
  }

  const hasSelection = selectedText.length > 0;
  const items = [
    {
      label: 'Couper',
      shortcut: `${CTX_MOD}X`,
      icon: CTX_ICONS.cut,
      disabled: isReadOnly || !hasSelection,
      onClick: () => {
        copyTextUniversal(selectedText);
        if (isTextareaOrInput && typeof inputEl.setRangeText === 'function') {
          inputEl.focus();
          inputEl.setRangeText('', selStart, selEnd, 'start');
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          inputEl.focus();
          try { document.execCommand('delete'); } catch (_) { }
        }
      }
    },
    {
      label: 'Copier',
      shortcut: `${CTX_MOD}C`,
      icon: CTX_ICONS.copy,
      disabled: !hasSelection,
      onClick: () => {
        copyTextUniversal(selectedText);
        inputEl.focus();
      }
    },
    {
      label: 'Coller',
      shortcut: `${CTX_MOD}V`,
      icon: CTX_ICONS.paste,
      disabled: isReadOnly,
      onClick: async () => {
        inputEl.focus();
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            const clip = await navigator.clipboard.readText();
            if (typeof clip === 'string') {
              if (isTextareaOrInput && typeof inputEl.setRangeText === 'function') {
                inputEl.setRangeText(clip, selStart, selEnd, 'end');
              } else {
                document.execCommand('insertText', false, clip);
              }
              inputEl.dispatchEvent(new Event('input', { bubbles: true }));
              return;
            }
          }
        } catch (_) { }
        try { document.execCommand('paste'); } catch (_) { }
      }
    },
    { type: 'separator' },
    {
      label: 'Tout sélectionner',
      shortcut: `${CTX_MOD}A`,
      icon: CTX_ICONS.selectAll,
      disabled: val.length === 0,
      onClick: () => {
        inputEl.focus();
        if (typeof inputEl.select === 'function') {
          inputEl.select();
        } else {
          try { document.execCommand('selectAll'); } catch (_) { }
        }
      }
    }
  ];

  if (!isReadOnly && val.length > 0) {
    items.push(
      { type: 'separator' },
      {
        label: 'Effacer le champ',
        className: 'danger',
        icon: CTX_ICONS.trash,
        onClick: () => {
          if (isTextareaOrInput) {
            inputEl.value = '';
          } else {
            inputEl.textContent = '';
          }
          inputEl.focus();
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    );
  }

  return items;
}

function buildPlayerRowContextMenu(playerRowEl) {
  const nameEl = playerRowEl.querySelector('.player-name');
  const name = nameEl ? nameEl.textContent.trim() : '';
  if (!name) return null;

  const lower = name.toLowerCase();
  const data = (typeof cachedPlayersData === 'object' && cachedPlayersData) ? cachedPlayersData : {};
  const playerObj = (data.players || []).find(p => (p.name || p).toLowerCase() === lower) || {};
  const isOnline = !!playerObj.isOnline || (Array.isArray(currentPlayersList) && currentPlayersList.some(p => p.toLowerCase() === lower));
  const isOp = !!playerObj.isOp || (data.ops || []).some(o => (o.name || o).toLowerCase() === lower);
  const isBanned = !!playerObj.isBanned || (data.bannedPlayers || []).some(b => (b.name || b).toLowerCase() === lower);
  const uuid = playerObj.uuid || '';

  const items = [
    { label: 'Gérer le joueur', icon: CTX_ICONS.edit, onClick: () => openPlayerDetail(name) },
    { label: 'Copier le pseudo', icon: CTX_ICONS.copy, onClick: () => copyTextUniversal(name, `Pseudo "${name}" copié`) }
  ];
  if (uuid) {
    items.push({ label: "Copier l'UUID", icon: CTX_ICONS.copy, onClick: () => copyTextUniversal(uuid, 'UUID copié') });
  }
  items.push({ type: 'separator' });
  items.push({
    label: isOp ? 'Retirer Opérateur' : 'Nommer Opérateur',
    icon: CTX_ICONS.shield,
    onClick: () => quickPlayerCommand(isOp ? 'deop' : 'op', name)
  });
  if (isOnline) {
    items.push({ label: 'Expulser (Kick)', className: 'repair', icon: CTX_ICONS.kick, onClick: () => quickKickAction(name) });
  }
  items.push({ type: 'separator' });
  if (isBanned) {
    items.push({ label: 'Pardonner', className: 'primary', icon: CTX_ICONS.shield, onClick: () => removePlayerAction('bannedPlayers', name) });
  } else {
    items.push({ label: 'Bannir', className: 'danger', icon: CTX_ICONS.ban, onClick: () => quickBanAction(name) });
  }
  return items;
}

function buildTerminalContextMenu(targetEl, selectedText) {
  const lineEl = targetEl.closest('.terminal-line');
  const lineText = lineEl ? lineEl.textContent : '';
  const worldId = selectedTerminalWorldId;
  const logs = (worldId && terminalBuffers[worldId]) ? terminalBuffers[worldId] : [];
  const hasLogs = logs.length > 0;
  const isThisRunning = !!(worldId && worldId === activeWorld && (serverStatus === 'RUNNING' || serverStatus === 'STARTING'));
  const isAnyRunning = serverStatus !== 'STOPPED';
  const tunnelEl = document.getElementById('tunnelShareIp');
  const tunnelPill = document.getElementById('tunnelSharePill');
  const hasTunnel = !!(tunnelPill && tunnelPill.style.display !== 'none' && tunnelEl && tunnelEl.textContent && tunnelEl.textContent.trim() !== '...');

  const items = [];
  if (selectedText) {
    items.push({
      label: 'Copier la sélection',
      shortcut: `${CTX_MOD}C`,
      icon: CTX_ICONS.copy,
      onClick: () => copyTextUniversal(selectedText, 'Sélection copiée')
    });
  }
  if (lineText) {
    items.push({
      label: 'Copier la ligne',
      icon: CTX_ICONS.copy,
      onClick: () => copyTextUniversal(lineText, 'Ligne copiée')
    });
  }
  items.push({
    label: 'Copier tous les logs',
    icon: CTX_ICONS.copy,
    disabled: !hasLogs,
    onClick: () => copyTextUniversal(logs.join('\n'), 'Logs copiés dans le presse-papiers')
  });

  items.push({ type: 'separator' });
  items.push({
    label: 'Aller en bas',
    icon: CTX_ICONS.arrowDown,
    disabled: !terminalOutput,
    onClick: () => {
      autoScroll = true;
      if (terminalOutput) terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }
  });

  if (worldId) {
    if (isThisRunning) {
      items.push({ label: 'Arrêter ce monde', className: 'stop', icon: CTX_ICONS.stop, onClick: () => stopActiveWorld() });
    } else {
      items.push({ label: 'Lancer ce monde', className: 'primary', disabled: isAnyRunning, icon: CTX_ICONS.play, onClick: () => startWorld(worldId) });
    }
  }
  if (hasTunnel) {
    items.push({ label: "Copier l'adresse du serveur", icon: CTX_ICONS.link, onClick: () => copyTunnelShareIp() });
  }

  items.push({ type: 'separator' });
  items.push({
    label: 'Effacer la console',
    confirmLabel: 'Vous êtes sûr ?',
    className: 'danger',
    icon: CTX_ICONS.trash,
    disabled: !worldId || !hasLogs,
    onClick: () => clearTerminalDirectFromContextMenu()
  });

  return items;
}

function buildTunnelContextMenu() {
  return [
    { label: "Copier l'adresse", icon: CTX_ICONS.copy, onClick: () => copyTunnelShareIp() },
    { type: 'separator' },
    { label: 'Reconnecter le tunnel', icon: CTX_ICONS.refresh, onClick: () => restartTunnelManual(null, false) },
    { label: 'Nouveau port public', icon: CTX_ICONS.link, onClick: () => restartTunnelManual(null, true) }
  ];
}

function closeTopVisibleModalFromContextMenu(modalBackdropEl) {
  if (!modalBackdropEl) return;
  const closeBtn = modalBackdropEl.querySelector('.btn-close');
  if (closeBtn) {
    closeBtn.click();
  } else {
    modalBackdropEl.style.display = 'none';
  }
}

function handleGlobalContextMenu(e) {
  const target = e.target;
  if (!target || typeof target.closest !== 'function') return;

  // Ignorer clic droit sur le menu contextuel lui-même
  if (worldContextMenuEl && worldContextMenuEl.contains(target)) {
    e.preventDefault();
    return;
  }

  // 1. Carte monde (menu dédié)
  const worldCard = target.closest('.world-card');
  if (worldCard) {
    const worldId = worldCard.getAttribute('data-id');
    if (worldId) {
      e.preventDefault();
      e.stopPropagation();
      openWorldContextMenu(worldId, e.clientX, e.clientY);
      return;
    }
  }

  closeWorldContextMenu();
  e.preventDefault();

  // 2. Champ de saisie éditable (input texte / textarea / contenteditable)
  const editableEl = target.closest('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="file"]):not([type="color"]), textarea, [contenteditable="true"]');
  if (editableEl) {
    renderCustomContextMenu(buildEditableInputContextMenu(editableEl), e.clientX, e.clientY);
    return;
  }

  // 3. Ligne de joueur dans le gestionnaire de joueurs
  const playerRow = target.closest('.player-row');
  if (playerRow) {
    const playerItems = buildPlayerRowContextMenu(playerRow);
    if (playerItems) {
      renderCustomContextMenu(playerItems, e.clientX, e.clientY);
      return;
    }
  }

  // 4. Pilule d'adresse du tunnel
  if (target.closest('#tunnelSharePill')) {
    renderCustomContextMenu(buildTunnelContextMenu(), e.clientX, e.clientY);
    return;
  }

  const selectedText = (window.getSelection && window.getSelection().toString().trim()) || '';

  // 5. Terminal / panneau console
  if (target.closest('#terminalOutput') || target.closest('.console-panel')) {
    renderCustomContextMenu(buildTerminalContextMenu(target, selectedText), e.clientX, e.clientY);
    return;
  }

  // 6. Modale ouverte
  const modalBackdrop = target.closest('.modal-backdrop');
  if (modalBackdrop && modalBackdrop.style.display !== 'none') {
    const modalItems = [];
    if (selectedText) {
      modalItems.push(
        { label: 'Copier la sélection', shortcut: `${CTX_MOD}C`, icon: CTX_ICONS.copy, onClick: () => copyTextUniversal(selectedText, 'Sélection copiée') },
        { type: 'separator' }
      );
    }
    if (modalBackdrop.id === 'playersModal') {
      modalItems.push(
        { label: 'Actualiser les joueurs', icon: CTX_ICONS.refresh, onClick: () => refreshPlayersData(true) },
        { type: 'separator' }
      );
    }
    modalItems.push(
      { label: 'Fermer cette fenêtre', shortcut: 'Échap', icon: CTX_ICONS.close, onClick: () => closeTopVisibleModalFromContextMenu(modalBackdrop) },
      { type: 'separator' },
      { label: "Recharger l'interface", shortcut: `${CTX_MOD}R`, icon: CTX_ICONS.refresh, onClick: () => window.location.reload() }
    );
    renderCustomContextMenu(modalItems, e.clientX, e.clientY);
    return;
  }

  // 7. Panneau des mondes / fond global de l'application
  const globalItems = [];
  if (selectedText) {
    globalItems.push(
      { label: 'Copier la sélection', shortcut: `${CTX_MOD}C`, icon: CTX_ICONS.copy, onClick: () => copyTextUniversal(selectedText, 'Sélection copiée') },
      { type: 'separator' }
    );
  }
  globalItems.push(
    { label: 'Créer un monde', className: 'primary', icon: CTX_ICONS.plus, onClick: () => openCreateModal() },
    {
      label: 'Actualiser les mondes',
      icon: CTX_ICONS.refresh,
      onClick: async () => {
        await fetchWorlds();
        if (typeof showToast === 'function') showToast('Liste des mondes actualisée.', 'info');
      }
    },
    { type: 'separator' },
    { label: 'Paramètres de Cubirium', shortcut: `${CTX_MOD},`, icon: CTX_ICONS.settings, onClick: () => openAppSettingsModal() },
    { label: 'À propos de Cubirium', shortcut: isMacContextPlatform ? '' : 'F1', icon: CTX_ICONS.info, onClick: () => openAboutModal() },
    { type: 'separator' },
    { label: "Recharger l'interface", shortcut: `${CTX_MOD}R`, icon: CTX_ICONS.refresh, onClick: () => window.location.reload() }
  );
  renderCustomContextMenu(globalItems, e.clientX, e.clientY);
}

if (worldsList) {
  worldsList.addEventListener('scroll', closeWorldContextMenu, { passive: true });
}
if (terminalOutput) {
  terminalOutput.addEventListener('scroll', closeWorldContextMenu, { passive: true });
}

document.addEventListener('contextmenu', handleGlobalContextMenu);

document.addEventListener('click', (e) => {
  if (worldContextMenuEl && worldContextMenuEl.classList.contains('visible') && !worldContextMenuEl.contains(e.target)) {
    closeWorldContextMenu();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && worldContextMenuEl && worldContextMenuEl.classList.contains('visible')) {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeWorldContextMenu();
  }
}, true);

window.addEventListener('resize', closeWorldContextMenu);
window.addEventListener('blur', closeWorldContextMenu);

function buildWorldCardHtml(w, opts) {
  const { isRunning, typeClass, isSelected, isActionDisabled, isServerRunning, isPinned, isCollapsed, displayRuntime, baseRuntimeSecs, runtimeSecs, effectiveStartTime } = opts;
  const lockAttr = isActionDisabled ? 'disabled class="btn-card-action disabled"' : 'class="btn-card-action"';
  const lockDeleteAttr = isActionDisabled ? 'disabled class="btn-card-action btn-card-delete disabled"' : 'class="btn-card-action btn-card-delete"';

  const dotInfo = getWorldPulseDotInfo(w.id);
  const isThisActive = (w.id === activeWorld);
  const isCardRunning = isThisActive && serverStatus === 'RUNNING';
  const isCardStarting = isThisActive && serverStatus === 'STARTING';
  const isCardStopping = isThisActive && serverStatus === 'STOPPING';
  const isCardDownloading = isThisActive && isDownloadingJava;
  const isCardCorrupted = !isThisActive && !!w.isCorrupted;

  return `
    <div class="world-card ${isCardRunning ? 'running' : ''} ${isCardStarting && !isCardDownloading ? 'starting' : ''} ${isCardStopping ? 'stopping' : ''} ${isCardDownloading ? 'downloading' : ''} ${isCardCorrupted ? 'corrupted' : ''} ${isSelected ? 'selected' : ''} ${isPinned ? 'is-pinned' : ''} ${isCollapsed ? 'collapsed' : ''}" 
         data-id="${w.id}" 
         onclick="selectTerminalWorld('${w.id}')">
      <div class="world-header">
        <div class="world-title-box">
          <div class="world-title-row">
            <span class="world-name">${escapeHtml(w.name)}</span>
            <span class="${dotInfo.className}" title="${escapeHtml(dotInfo.title)}"></span>
          </div>
          <span class="world-type-badge ${typeClass}">${w.type} ${w.modsCount > 0 ? `(${w.modsCount} mods)` : ''}</span>
        </div>

        <div class="world-header-actions" onclick="event.stopPropagation()">
          <button type="button" class="btn-card-pin ${isPinned ? 'active' : ''}" title="${isPinned ? 'Désépingler ce monde' : 'Épingler ce monde'}" onclick="togglePinWorld('${w.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="17" x2="12" y2="22"></line>
              <path d="M5 17h14v-2l-2-2V5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8l-2 2v2z"></path>
              <circle cx="12" cy="3" r="1"></circle>
            </svg>
          </button>
          <button type="button" class="btn-card-collapse" title="${isCollapsed ? 'Déplier la carte' : 'Replier la carte'}" onclick="toggleCollapseWorld('${w.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="chevron-icon ${isCollapsed ? 'collapsed' : ''}">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      </div>

      <div class="world-meta">
        <div class="meta-item meta-launcher">
          <span>Lanceur:</span>
          <strong title="${escapeHtml(w.launcherVersion || w.type)}">${escapeHtml(w.launcherVersion || w.type)}</strong>
        </div>
        <div class="meta-item">
          <span>Runtime:</span>
          <strong class="runtime-val" 
                  data-world-id="${w.id}" 
                  data-base-runtime="${baseRuntimeSecs}" 
                  data-current-runtime="${runtimeSecs}" 
                  data-start-time="${isRunning ? effectiveStartTime : ''}">${displayRuntime}</strong>
        </div>
        <div class="meta-item">
          <span>Taille:</span>
          <strong>${w.worldSize || '0 Mo'}</strong>
        </div>
      </div>

      <div class="world-actions" onclick="event.stopPropagation()">
        <div class="primary-action-container" data-type="${isRunning ? (isDownloadingJava ? 'downloading' : 'stop') : w.isCorrupted ? 'corrupted' : w.needsRepair ? 'repair' : 'launch'}">
        ${isRunning
      ? (isDownloadingJava
        ? `<button class="btn-downloading-java" disabled title="${escapeHtml(javaDownloadStep || 'Téléchargement de Java en cours...')}">
            <svg class="spinner-icon-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/>
            </svg>
            <span>Téléchargement</span>
          </button>`
        : `<button class="btn-stop-world" onclick="stopActiveWorld()">Arrêter</button>`)
      : w.isCorrupted
        ? `<button class="btn-corrupted" onclick="openWorldFolder('${w.id}')" title="Ce monde est corrompu. Cliquez pour ouvrir son dossier.">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
             </svg>
             <span>Ouvrir le dossier</span>
           </button>`
        : w.needsRepair
          ? `<button class="btn-repair" ${isServerRunning ? 'disabled' : ''} onclick="triggerWorldRepair('${w.id}')" title="Incident détecté. Cliquez pour lancer la réparation méthodique.">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
               </svg>
               <span>Réparer</span>
             </button>`
          : `<button class="btn-launch" ${isServerRunning ? 'disabled' : ''} onclick="startWorld('${w.id}')" title="Lancer le serveur">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                 <polygon points="5 3 19 12 5 21 5 3"></polygon>
               </svg>
               Lancer
             </button>`
    }
        </div>
        <button class="btn-card-action btn-card-players" title="Gestion des Joueurs (Ops, Whitelist, Bans)" onclick="openPlayersManager('${w.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        </button>
        <button ${lockAttr} title="Modifier server.properties" onclick="openEditProps('${w.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="21" y1="4" x2="14" y2="4"></line>
            <line x1="10" y1="4" x2="3" y2="4"></line>
            <line x1="21" y1="12" x2="12" y2="12"></line>
            <line x1="8" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="20" x2="16" y2="20"></line>
            <line x1="12" y1="20" x2="3" y2="20"></line>
            <line x1="14" y1="2" x2="14" y2="6"></line>
            <line x1="8" y1="10" x2="8" y2="14"></line>
            <line x1="16" y1="18" x2="16" y2="22"></line>
          </svg>
        </button>
        <button ${lockAttr} title="Gestion du monde (Dimensions, Export, Renommer)" onclick="openRenameWorld('${w.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
        <button ${lockDeleteAttr} title="Supprimer définitivement ce monde" onclick="openDeleteWorld('${w.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>

      ${isPinned ? `
        <div class="drag-handle-right" 
             title="Glisser pour réorganiser" 
             onpointerdown="event.stopPropagation(); handlePinnedPointerDown(event, '${w.id}')"
             onclick="event.stopPropagation()">
          <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="2.5" cy="2.5" r="1.5"></circle>
            <circle cx="7.5" cy="2.5" r="1.5"></circle>
            <circle cx="2.5" cy="8" r="1.5"></circle>
            <circle cx="7.5" cy="8" r="1.5"></circle>
            <circle cx="2.5" cy="13.5" r="1.5"></circle>
            <circle cx="7.5" cy="13.5" r="1.5"></circle>
          </svg>
        </div>
      ` : ''}
    </div>
  `;
}

let suppressAutoSelectWorld = false;
let pendingCreatedWorldId = null;
let lastCreatedWorldIdToScroll = null;

function scrollWorldCardIntoView(worldId) {
  if (!worldId || !worldsList) return;
  const doScroll = () => {
    const cards = worldsList.querySelectorAll('.world-card');
    let targetCard = null;
    for (const c of cards) {
      if (c.getAttribute('data-id') === worldId) {
        targetCard = c;
        break;
      }
    }
    if (targetCard && typeof targetCard.scrollIntoView === 'function') {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(doScroll));
  } else {
    doScroll();
  }
}

function queueFocusCreatedWorld(data, fallbackName) {
  const cleanFallback = fallbackName ? String(fallbackName).trim().replace(/[^a-zA-Z0-9_-]/g, '-') : '';
  const createdId = (data && (data.worldId || (data.world && (data.world.id || data.world.worldId)) || data.id)) || cleanFallback;
  if (!createdId) return;
  suppressAutoSelectWorld = false;
  pendingCreatedWorldId = createdId;
  lastCreatedWorldIdToScroll = createdId;
  fetchWorlds();
}

function showNoWorldSelectedTerminal() {
  selectedTerminalWorldId = null;
  if (typeof resetClearButton === 'function') resetClearButton();
  document.querySelectorAll('.world-card.selected').forEach(c => c.classList.remove('selected'));
  updateTerminalHeader();
  if (terminalOutput) {
    terminalOutput.innerHTML = `
      <div class="terminal-empty-state">
        <div class="terminal-empty-icon">
          <img src="/assets/logo.png?v=5" alt="Cubirium" class="terminal-empty-logo" />
        </div>
        <p class="terminal-empty-text">Veuillez sélectionner un monde</p>
      </div>`;
  }
}

function renderWorlds(worlds) {
  worldsListCache = worlds || [];
  worldsCountBadge.textContent = worldsListCache.length;

  // Supprimer immédiatement l'indicateur initial de chargement
  const initialLoader = worldsList.querySelector('.loading-state');
  if (initialLoader) initialLoader.remove();

  if (worldsListCache.length === 0) {
    if (lastRenderedWorldsSignature === 'empty' && worldsList.querySelector('.empty-state')) {
      if (!selectedTerminalWorldId && terminalOutput && !terminalOutput.querySelector('.terminal-empty-state')) {
        showNoWorldSelectedTerminal();
      } else {
        updateTerminalHeader();
      }
      return;
    }
    lastRenderedWorldsSignature = 'empty';
    worldsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
        </div>
        <h4 class="empty-state-title">Aucun monde trouvé</h4>
        <p class="empty-state-desc">Le dossier <code>games/</code> ne contient aucun monde.<br>Créez votre première partie pour démarrer.</p>
        <button type="button" class="btn-primary empty-state-btn" onclick="openCreateModal()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Créer un monde
        </button>
      </div>`;
    showNoWorldSelectedTerminal();
    return;
  }

  const pinnedIds = getPinnedWorldIds();
  const collapsedIds = getCollapsedWorldIds();

  // 1. Mondes épinglés ordonnés manuellement
  const pinnedWorlds = [];
  pinnedIds.forEach(id => {
    const found = worldsListCache.find(w => w.id === id);
    if (found) pinnedWorlds.push(found);
  });

  // 2. Mondes non épinglés triés par dernier allumage serveur (lastStartedAt décroissant)
  const unpinnedWorlds = worldsListCache.filter(w => !pinnedIds.includes(w.id));
  unpinnedWorlds.sort((a, b) => {
    const timeA = typeof a.lastStartedAt === 'number' ? a.lastStartedAt : 0;
    const timeB = typeof b.lastStartedAt === 'number' ? b.lastStartedAt : 0;
    return timeB - timeA;
  });

  const sortedWorlds = [...pinnedWorlds, ...unpinnedWorlds];

  const stateSignature = JSON.stringify({
    worlds: sortedWorlds.map(w => {
      const isRunning = w.isRunning || (w.id === activeWorld && serverStatus === 'RUNNING');
      return {
        id: w.id,
        name: w.name,
        type: w.type,
        modsCount: w.modsCount,
        launcherVersion: w.launcherVersion,
        worldSize: w.worldSize,
        lastStartedAt: w.lastStartedAt,
        isRunning,
        runtime: isRunning ? 0 : (w.runtime || w.uptime || 0)
      };
    }),
    serverStatus,
    activeWorld,
    selectedTerminalWorldId,
    pinnedIds,
    collapsedIds
  });

  if (stateSignature === lastRenderedWorldsSignature && worldsList.children.length > 0 && !worldsList.querySelector('.empty-state') && !worldsList.querySelector('.loading-state')) {
    if (pendingCreatedWorldId) {
      const createdMatch = sortedWorlds.find(w => w.id === pendingCreatedWorldId) ||
        sortedWorlds.find(w => w.id.toLowerCase() === pendingCreatedWorldId.toLowerCase());
      if (createdMatch) {
        pendingCreatedWorldId = null;
        selectTerminalWorld(createdMatch.id);
        scrollWorldCardIntoView(createdMatch.id);
        return;
      }
    }
    if (!selectedTerminalWorldId && terminalOutput && !terminalOutput.querySelector('.terminal-empty-state')) {
      showNoWorldSelectedTerminal();
    } else {
      updateTerminalHeader();
    }
    return;
  }

  // Réconciliation keyed in-place : ne détruit jamais de carte existante, préserve le hover
  const emptyStateEl = worldsList.querySelector('.empty-state');
  if (emptyStateEl) emptyStateEl.remove();
  const loadingStateEl = worldsList.querySelector('.loading-state');
  if (loadingStateEl) loadingStateEl.remove();

  const existingCardsMap = new Map();
  worldsList.querySelectorAll('.world-card').forEach(c => {
    const cid = c.getAttribute('data-id');
    if (cid) existingCardsMap.set(cid, c);
  });

  // Retirer les cartes supprimées
  existingCardsMap.forEach((card, id) => {
    if (!sortedWorlds.some(w => w.id === id)) {
      card.remove();
      existingCardsMap.delete(id);
    }
  });

  lastRenderedWorldsSignature = stateSignature;

  sortedWorlds.forEach(w => {
    let card = existingCardsMap.get(w.id);
    const isRunning = w.isRunning || (w.id === activeWorld && (serverStatus === 'RUNNING' || serverStatus === 'STARTING'));
    const typeClass = w.type === 'Moddé' ? 'modded' : (w.type === 'Crossplay' ? 'crossplay' : 'vanilla');
    const isSelected = (w.id === selectedTerminalWorldId);
    const isServerRunning = (serverStatus !== 'STOPPED');
    const isActionDisabled = isServerRunning || isRunning;
    const isPinned = pinnedIds.includes(w.id);
    const isCollapsed = collapsedIds.includes(w.id);

    const baseRuntimeSecs = (typeof w.baseRuntime === 'number') ? w.baseRuntime : ((typeof w.runtime === 'number') ? w.runtime : 0);
    const effectiveStartTime = isRunning ? (w.startTime || currentServerStartTime || Date.now()) : '';
    const runtimeSecs = isRunning && effectiveStartTime
      ? baseRuntimeSecs + Math.max(0, Math.floor((Date.now() - Number(effectiveStartTime)) / 1000))
      : ((typeof w.runtime === 'number') ? w.runtime : baseRuntimeSecs);
    const displayRuntime = formatSeconds(runtimeSecs);

    if (!card) {
      // Nouvelle carte créée
      const wrapper = document.createElement('div');
      wrapper.innerHTML = buildWorldCardHtml(w, {
        isRunning,
        typeClass,
        isSelected,
        isActionDisabled,
        isServerRunning,
        isPinned,
        isCollapsed,
        displayRuntime,
        baseRuntimeSecs,
        runtimeSecs,
        effectiveStartTime
      });
      card = wrapper.firstElementChild;
      existingCardsMap.set(w.id, card);
    } else {
      // Mise à jour chirurgicale in-place sur le noeud existant
      const isCardRunning = (w.id === activeWorld && serverStatus === 'RUNNING');
      const isCardStarting = (w.id === activeWorld && serverStatus === 'STARTING');
      const isCardStopping = (w.id === activeWorld && serverStatus === 'STOPPING');
      const isCardDownloading = (w.id === activeWorld && isDownloadingJava);
      card.classList.toggle('running', isCardRunning);
      card.classList.toggle('starting', isCardStarting && !isCardDownloading);
      card.classList.toggle('stopping', isCardStopping);
      card.classList.toggle('downloading', isCardDownloading);
      card.classList.toggle('corrupted', !isRunning && !!w.isCorrupted);
      card.classList.toggle('selected', isSelected);
      card.classList.toggle('is-pinned', isPinned);
      card.classList.toggle('collapsed', isCollapsed);

      // Synchronisation du Drag Handle 6 points pour les cartes épinglées
      let dragHandle = card.querySelector('.drag-handle-right');
      if (isPinned) {
        if (!dragHandle) {
          dragHandle = document.createElement('div');
          dragHandle.className = 'drag-handle-right';
          dragHandle.title = 'Glisser pour réorganiser';
          dragHandle.innerHTML = `
            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
              <circle cx="2.5" cy="2.5" r="1.5"></circle>
              <circle cx="7.5" cy="2.5" r="1.5"></circle>
              <circle cx="2.5" cy="8" r="1.5"></circle>
              <circle cx="7.5" cy="8" r="1.5"></circle>
              <circle cx="2.5" cy="13.5" r="1.5"></circle>
              <circle cx="7.5" cy="13.5" r="1.5"></circle>
            </svg>
          `;
          card.appendChild(dragHandle);
        }
        dragHandle.onpointerdown = (e) => {
          e.stopPropagation();
          handlePinnedPointerDown(e, w.id);
        };
        dragHandle.onclick = (e) => e.stopPropagation();
        dragHandle.removeAttribute('draggable');
        dragHandle.removeAttribute('ondragstart');
        dragHandle.removeAttribute('onmousedown');
      } else {
        if (dragHandle) {
          dragHandle.remove();
        }
      }
      card.removeAttribute('ondragend');
      card.removeAttribute('ondragover');
      card.removeAttribute('ondragenter');
      card.removeAttribute('ondragleave');
      card.removeAttribute('ondrop');

      const dot = card.querySelector('.world-title-row .pulse-dot');
      if (dot) {
        const dotInfo = getWorldPulseDotInfo(w.id);
        dot.className = dotInfo.className;
        dot.title = dotInfo.title;
      }

      const nameEl = card.querySelector('.world-name');
      if (nameEl && nameEl.textContent !== w.name) nameEl.textContent = w.name;

      const badge = card.querySelector('.world-type-badge');
      const newBadgeText = `${w.type} ${w.modsCount > 0 ? `(${w.modsCount} mods)` : ''}`;
      if (badge) {
        if (badge.textContent !== newBadgeText) badge.textContent = newBadgeText;
        badge.className = 'world-type-badge ' + typeClass;
      }

      const pinBtn = card.querySelector('.btn-card-pin');
      if (pinBtn) {
        pinBtn.classList.toggle('active', isPinned);
        pinBtn.title = isPinned ? 'Désépingler ce monde' : 'Épingler ce monde';
        const svg = pinBtn.querySelector('svg');
        if (svg) svg.setAttribute('fill', isPinned ? 'currentColor' : 'none');
      }

      const chevron = card.querySelector('.chevron-icon');
      if (chevron) chevron.classList.toggle('collapsed', isCollapsed);

      const runtimeEl = card.querySelector('.runtime-val');
      if (runtimeEl) {
        const prevSecs = parseInt(runtimeEl.getAttribute('data-current-runtime') || '0', 10);
        const safeRuntimeSecs = Math.max(prevSecs, runtimeSecs, (typeof w.runtime === 'number' ? w.runtime : 0));
        const safeDisplay = formatSeconds(safeRuntimeSecs);
        if (runtimeEl.textContent !== safeDisplay) runtimeEl.textContent = safeDisplay;
        runtimeEl.setAttribute('data-base-runtime', String(isRunning ? baseRuntimeSecs : safeRuntimeSecs));
        runtimeEl.setAttribute('data-current-runtime', String(safeRuntimeSecs));
        runtimeEl.setAttribute('data-start-time', isRunning && effectiveStartTime ? String(effectiveStartTime) : '');
      }

      const sizeEl = card.querySelector('.world-meta .meta-item:last-child strong');
      if (sizeEl && sizeEl.textContent !== (w.worldSize || '0 Mo')) {
        sizeEl.textContent = w.worldSize || '0 Mo';
      }

      const actionsDiv = card.querySelector('.world-actions');
      if (actionsDiv) {
        let primaryWrap = actionsDiv.querySelector('.primary-action-container');
        let expectedBtnHtml = '';
        let expectedType = '';
        if (isRunning) {
          if (isDownloadingJava) {
            expectedType = 'downloading';
            expectedBtnHtml = `<button class="btn-downloading-java" disabled title="${escapeHtml(javaDownloadStep || 'Téléchargement de Java en cours...')}"><svg class="spinner-icon-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/></svg><span>Téléchargement</span></button>`;
          } else {
            expectedType = 'stop';
            expectedBtnHtml = `<button class="btn-stop-world" onclick="stopActiveWorld()">Arrêter</button>`;
          }
        } else if (w.isCorrupted) {
          expectedType = 'corrupted';
          expectedBtnHtml = `<button class="btn-corrupted" onclick="openWorldFolder('${w.id}')" title="Ce monde est corrompu. Cliquez pour ouvrir son dossier."><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg><span>Ouvrir le dossier</span></button>`;
        } else if (w.needsRepair) {
          expectedType = 'repair';
          expectedBtnHtml = `<button class="btn-repair" ${isServerRunning ? 'disabled' : ''} onclick="triggerWorldRepair('${w.id}')" title="Incident détecté. Cliquez pour lancer la réparation méthodique."><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg><span>Réparer</span></button>`;
        } else {
          expectedType = 'launch';
          expectedBtnHtml = `<button class="btn-launch" ${isServerRunning ? 'disabled' : ''} onclick="startWorld('${w.id}')" title="Lancer le serveur"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>Lancer</button>`;
        }

        if (primaryWrap) {
          const currentType = primaryWrap.dataset.type || '';
          if (currentType !== expectedType) {
            primaryWrap.dataset.type = expectedType;
            primaryWrap.innerHTML = expectedBtnHtml;
          } else {
            const launchBtn = primaryWrap.querySelector('.btn-launch, .btn-repair');
            if (launchBtn && launchBtn.disabled !== isServerRunning) launchBtn.disabled = isServerRunning;
          }
        } else {
          const legacyPrimary = actionsDiv.querySelector('.btn-stop-world, .btn-launch, .btn-repair, .btn-corrupted, .btn-downloading-java, .btn-group-repair');
          if (legacyPrimary) {
            const newWrap = document.createElement('div');
            newWrap.className = 'primary-action-container';
            newWrap.dataset.type = expectedType;
            newWrap.innerHTML = expectedBtnHtml;
            legacyPrimary.replaceWith(newWrap);
          }
        }

        const actionBtns = actionsDiv.querySelectorAll('.btn-card-action:not(.btn-card-players):not(.btn-card-delete)');
        actionBtns.forEach(b => {
          if (b.disabled !== isActionDisabled) b.disabled = isActionDisabled;
          b.classList.toggle('disabled', isActionDisabled);
        });

        // Le bouton de gestion des joueurs doit TOUJOURS rester accessible et interactif
        const playersBtn = actionsDiv.querySelector('.btn-card-players');
        if (playersBtn) {
          if (playersBtn.disabled) playersBtn.disabled = false;
          playersBtn.classList.remove('disabled');
        }

        const deleteBtn = actionsDiv.querySelector('.btn-card-delete');
        if (deleteBtn) {
          if (deleteBtn.disabled !== isActionDisabled) deleteBtn.disabled = isActionDisabled;
          deleteBtn.classList.toggle('disabled', isActionDisabled);
        }
      }
    }

    // appendChild ordonne les cartes sans détruire les noeuds ni perdre le focus/hover
    worldsList.appendChild(card);
  });

  if (pendingCreatedWorldId) {
    const createdMatch = sortedWorlds.find(w => w.id === pendingCreatedWorldId) ||
      sortedWorlds.find(w => w.id.toLowerCase() === pendingCreatedWorldId.toLowerCase());
    if (createdMatch) {
      pendingCreatedWorldId = null;
      selectTerminalWorld(createdMatch.id);
      scrollWorldCardIntoView(createdMatch.id);
      return;
    }
  }

  if (selectedTerminalWorldId && !sortedWorlds.some(w => w.id === selectedTerminalWorldId)) {
    showNoWorldSelectedTerminal();
    return;
  }

  if (!selectedTerminalWorldId) {
    if (terminalOutput && !terminalOutput.querySelector('.terminal-empty-state')) {
      showNoWorldSelectedTerminal();
    } else {
      updateTerminalHeader();
    }
  } else {
    updateTerminalHeader();
  }
}

function updateWorldCardsLive() {
  const cards = document.querySelectorAll('.world-card');
  const isServerRunning = (serverStatus === 'RUNNING' || serverStatus === 'STARTING' || serverStatus === 'STOPPING');

  cards.forEach(card => {
    const worldId = card.getAttribute('data-id');
    if (!worldId) return;

    const isThisActive = (worldId === activeWorld);
    const isCardRunning = isThisActive && (serverStatus === 'RUNNING');
    const isCardStarting = isThisActive && (serverStatus === 'STARTING');
    const isCardStopping = isThisActive && (serverStatus === 'STOPPING');
    const isCardDownloading = isThisActive && isDownloadingJava;

    card.classList.toggle('running', isCardRunning);
    card.classList.toggle('starting', isCardStarting && !isCardDownloading);
    card.classList.toggle('stopping', isCardStopping);
    card.classList.toggle('downloading', isCardDownloading);

    // Mettre à jour l'ancrage temporel du runtime
    const runtimeEl = card.querySelector('.runtime-val');
    if (runtimeEl) {
      if (isCardRunning || (isThisActive && isCardStarting) || (isThisActive && isCardStopping)) {
        if (currentServerStartTime) {
          runtimeEl.setAttribute('data-start-time', String(currentServerStartTime));
        }
      } else if (!isThisActive || serverStatus === 'STOPPED') {
        runtimeEl.setAttribute('data-start-time', '');
        const currentVal = parseInt(runtimeEl.getAttribute('data-current-runtime') || '0', 10);
        if (currentVal > 0) {
          const oldBase = parseInt(runtimeEl.getAttribute('data-base-runtime') || '0', 10);
          runtimeEl.setAttribute('data-base-runtime', String(Math.max(oldBase, currentVal)));
        }
      }
    }

    // Mettre à jour la pastille lumineuse (pulse-dot)
    const dot = card.querySelector('.world-title-row .pulse-dot, .world-title-row [class*="pulse-dot"]');
    if (dot) {
      const dotInfo = getWorldPulseDotInfo(worldId);
      dot.className = dotInfo.className;
      dot.title = dotInfo.title;
    }

    // Mettre à jour le bouton principal d'action
    const actionsDiv = card.querySelector('.world-actions');
    if (actionsDiv) {
      const primaryWrap = actionsDiv.querySelector('.primary-action-container');
      let expectedType = '';
      let expectedBtnHtml = '';

      if (isCardRunning || (isThisActive && (isCardStarting || isCardStopping))) {
        if (isDownloadingJava) {
          expectedType = 'downloading';
          expectedBtnHtml = `<button class="btn-downloading-java" disabled title="${escapeHtml(javaDownloadStep || 'Téléchargement de Java en cours...')}"><svg class="spinner-icon-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/></svg><span>Téléchargement</span></button>`;
        } else {
          expectedType = 'stop';
          expectedBtnHtml = `<button class="btn-stop-world" onclick="stopActiveWorld()">Arrêter</button>`;
        }
      }

      if (primaryWrap) {
        if (expectedType) {
          if (primaryWrap.dataset.type !== expectedType) {
            primaryWrap.dataset.type = expectedType;
            primaryWrap.innerHTML = expectedBtnHtml;
          }
        } else {
          const launchBtn = primaryWrap.querySelector('.btn-launch');
          if (launchBtn && launchBtn.disabled !== isServerRunning) launchBtn.disabled = isServerRunning;
          const repairBtn = primaryWrap.querySelector('.btn-repair');
          if (repairBtn && repairBtn.disabled !== isServerRunning) repairBtn.disabled = isServerRunning;
          const forceBtn = primaryWrap.querySelector('.btn-card-force');
          if (forceBtn && forceBtn.disabled !== isServerRunning) forceBtn.disabled = isServerRunning;
        }
      } else {
        const legacyPrimary = actionsDiv.querySelector('.btn-stop-world, .btn-launch, .btn-repair, .btn-corrupted, .btn-downloading-java, .btn-group-repair');
        if (isCardRunning && legacyPrimary && !legacyPrimary.classList.contains('btn-stop-world')) {
          const newWrap = document.createElement('div');
          newWrap.className = 'primary-action-container';
          newWrap.dataset.type = 'stop';
          newWrap.innerHTML = `<button class="btn-stop-world" onclick="stopActiveWorld()">Arrêter</button>`;
          legacyPrimary.replaceWith(newWrap);
        }
      }

      const actionBtns = actionsDiv.querySelectorAll('.btn-card-action:not(.btn-card-players):not(.btn-card-delete)');
      const isActionDisabled = isServerRunning;
      actionBtns.forEach(b => {
        if (b.disabled !== isActionDisabled) b.disabled = isActionDisabled;
        b.classList.toggle('disabled', isActionDisabled);
      });

      const deleteBtn = actionsDiv.querySelector('.btn-card-delete');
      if (deleteBtn) {
        if (deleteBtn.disabled !== isActionDisabled) deleteBtn.disabled = isActionDisabled;
        deleteBtn.classList.toggle('disabled', isActionDisabled);
      }
    }
  });
}

function updateMinecraftState(state) {
  const previousStatus = serverStatus;
  const previousActiveWorld = activeWorld;
  serverStatus = state.status;
  activeWorld = state.activeWorld;
  currentPlayersList = state.players || [];
  isDownloadingJava = !!state.isDownloadingJava;
  javaDownloadStep = state.javaDownloadStep || '';
  if (state.startTime) {
    currentServerStartTime = state.startTime;
  } else if (serverStatus === 'STOPPED') {
    currentServerStartTime = null;
  }

  updateTerminalHeader();
  updateWorldCardsLive();

  if (previousStatus !== serverStatus || previousActiveWorld !== activeWorld) {
    fetchWorlds();
  }

  // Si la fenêtre de gestion des joueurs est ouverte, rafraîchir ses données
  if (playersModal && playersModal.style.display !== 'none') {
    refreshPlayersData();
  }

  // Refresh world buttons
  const launchBtns = document.querySelectorAll('.btn-launch');
  launchBtns.forEach(btn => {
    btn.disabled = (serverStatus !== 'STOPPED');
  });
}

let currentTunnelState = null;

function updateTunnelState(state) {
  if (!state) return;
  currentTunnelState = state;
  if (state.publicAddress) {
    tunnelAddress = state.publicAddress;
  } else if (state.status === 'STOPPED') {
    tunnelAddress = null;
  }
  updateTerminalHeader();
}

async function selectTerminalWorld(worldId) {
  if (!worldId) return;
  suppressAutoSelectWorld = false;
  selectedTerminalWorldId = worldId;
  terminalUnread[worldId] = 0; // réinitialiser le compteur de non-lus
  resetClearButton();

  updateTerminalHeader();

  // Mettre à jour l'apparence des cartes à gauche
  document.querySelectorAll('.world-card').forEach(card => {
    if (card.getAttribute('data-id') === worldId) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  // Si on a déjà les logs en mémoire pour ce monde
  if (terminalBuffers[worldId] && terminalBuffers[worldId].length > 0) {
    renderTerminalLogs(terminalBuffers[worldId]);
    return;
  }

  // Sinon, charger depuis l'API
  terminalOutput.innerHTML = `
    <div class="terminal-welcome">
      <p>Chargement des logs du monde <strong>${escapeHtml(worldId)}</strong>...</p>
    </div>`;

  try {
    const res = await fetch(`/api/logs?worldId=${encodeURIComponent(worldId)}`);
    const data = await res.json();
    if (selectedTerminalWorldId === worldId) {
      terminalBuffers[worldId] = (data.logs || []).slice(-500);
      if (terminalBuffers[worldId].length > 0) {
        renderTerminalLogs(terminalBuffers[worldId]);
      } else {
        terminalOutput.innerHTML = `
          <div class="terminal-welcome">
            <p>Terminal du monde <strong>${escapeHtml(worldId)}</strong>.</p>
            <p>Aucun log enregistré pour le moment pour ce monde.</p>
            <p style="font-size:0.75rem; margin-top:6px; opacity:0.8;">Lancez ce monde pour afficher sa console en direct.</p>
          </div>`;
      }
    }
  } catch (err) {
    if (selectedTerminalWorldId === worldId) {
      terminalOutput.innerHTML = `
        <div class="terminal-welcome">
          <p>Impossible de charger les logs de ${escapeHtml(worldId)}.</p>
        </div>`;
    }
  }
}

function updateTerminalHeader() {
  if (terminalStatusTag) terminalStatusTag.style.display = 'none';
  if (playersOnlineBadge) playersOnlineBadge.style.display = 'none';
  const terminalTitlePill = document.getElementById('terminalTitlePill') || (activeWorldTitle && activeWorldTitle.closest('.hud-pill-title'));

  if (!selectedTerminalWorldId) {
    if (terminalTitlePill) terminalTitlePill.style.display = 'none';
    activeWorldTitle.textContent = 'Aucun terminal actif';
    serverPulseDot.className = 'pulse-dot';
    btnStopActiveServer.style.display = 'none';
    btnLaunchViewedWorld.style.display = 'none';
    if (btnClearConsole) btnClearConsole.style.display = 'none';
    cmdInput.disabled = true;
    btnSendCmd.disabled = true;
    cmdInput.placeholder = 'Sélectionnez un monde pour accéder à sa console';
    return;
  }

  if (terminalTitlePill) terminalTitlePill.style.display = 'inline-flex';
  if (btnClearConsole) btnClearConsole.style.display = '';

  const isViewedRunning = (selectedTerminalWorldId === activeWorld && serverStatus === 'RUNNING');
  const isViewedStarting = (selectedTerminalWorldId === activeWorld && serverStatus === 'STARTING');
  const isViewedStopping = (selectedTerminalWorldId === activeWorld && serverStatus === 'STOPPING');

  activeWorldTitle.textContent = `Terminal : ${selectedTerminalWorldId}`;

  const terminalDotInfo = getWorldPulseDotInfo(selectedTerminalWorldId);
  serverPulseDot.className = terminalDotInfo.className;
  serverPulseDot.title = terminalDotInfo.title;

  if ((isViewedRunning || isViewedStarting) && isDownloadingJava) {
    btnStopActiveServer.style.display = 'inline-flex';
    btnStopActiveServer.disabled = true;
    btnStopActiveServer.className = 'btn-danger btn-downloading-java-header';
    btnStopActiveServer.innerHTML = `<svg class="spinner-icon-inline" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/></svg><span>Téléchargement</span>`;
    btnStopActiveServer.title = javaDownloadStep || "Téléchargement automatique de Java en cours, arrêt bloqué.";
    btnLaunchViewedWorld.style.display = 'none';
    cmdInput.disabled = true;
    btnSendCmd.disabled = true;
    cmdInput.placeholder = javaDownloadStep || `Installation de Java en cours pour ${selectedTerminalWorldId}...`;
  } else if (isViewedRunning) {
    btnStopActiveServer.style.display = 'inline-flex';
    btnStopActiveServer.disabled = false;
    btnStopActiveServer.className = 'btn-danger';
    btnStopActiveServer.innerHTML = 'Arrêter';
    btnStopActiveServer.title = 'Arrêter le serveur';
    btnLaunchViewedWorld.style.display = 'none';
    cmdInput.disabled = false;
    btnSendCmd.disabled = false;
    cmdInput.placeholder = `Commande pour ${selectedTerminalWorldId} (ex: op Gabriel, tp, say...)`;
  } else if (isViewedStarting) {
    btnStopActiveServer.style.display = 'inline-flex';
    btnStopActiveServer.disabled = false;
    btnStopActiveServer.className = 'btn-danger';
    btnStopActiveServer.innerHTML = 'Arrêter';
    btnStopActiveServer.title = 'Interrompre le démarrage';
    btnLaunchViewedWorld.style.display = 'none';
    cmdInput.disabled = true;
    btnSendCmd.disabled = true;
    cmdInput.placeholder = `Le monde ${selectedTerminalWorldId} démarre...`;
  } else if (isViewedStopping) {
    serverPulseDot.className = 'pulse-dot warning';
    btnStopActiveServer.style.display = 'none';
    btnLaunchViewedWorld.style.display = 'none';
    cmdInput.disabled = true;
    btnSendCmd.disabled = true;
    cmdInput.placeholder = `Le monde ${selectedTerminalWorldId} s'arrête...`;
  } else {
    serverPulseDot.className = 'pulse-dot';
    btnStopActiveServer.style.display = 'none';
    if (serverStatus === 'STOPPED') {
      btnLaunchViewedWorld.style.display = 'inline-flex';
    } else {
      btnLaunchViewedWorld.style.display = 'none';
    }
    cmdInput.disabled = true;
    btnSendCmd.disabled = true;
    if (activeWorld) {
      cmdInput.placeholder = `Le monde '${activeWorld}' tourne actuellement. '${selectedTerminalWorldId}' est éteint.`;
    } else {
      cmdInput.placeholder = `Ce monde est à l'arrêt. Cliquez sur 'Lancer ce monde' pour démarrer.`;
    }
  }

  // Adresse IP de partage (accès réseau public)
  const tunnelSharePill = document.getElementById('tunnelSharePill');
  const tunnelShareIp = document.getElementById('tunnelShareIp');
  const tunnelPulseDot = document.getElementById('tunnelPulseDot');
  const btnCopyTunnel = document.getElementById('btnCopyTunnel');

  if (tunnelSharePill && tunnelShareIp) {
    if (isViewedRunning && currentTunnelState && currentTunnelState.status !== 'STOPPED') {
      tunnelSharePill.style.display = 'inline-flex';
      const st = currentTunnelState.status;

      if (st === 'RUNNING' && tunnelAddress) {
        tunnelShareIp.textContent = tunnelAddress;
        tunnelShareIp.title = `Adresse de connexion : ${tunnelAddress}`;
        if (tunnelPulseDot) tunnelPulseDot.className = 'tunnel-pulse-dot';
        if (btnCopyTunnel) btnCopyTunnel.style.display = 'inline-flex';
      } else if (st === 'RECONNECTING' || st === 'STARTING') {
        const label = tunnelAddress ? `${tunnelAddress} (reconnexion...)` : 'Reconnexion tunnel...';
        tunnelShareIp.textContent = label;
        const relayName = (currentTunnelState && currentTunnelState.relay) || 'tunnel';
        tunnelShareIp.title = `Reconnexion automatique au relais ${relayName} en cours...`;
        if (tunnelPulseDot) tunnelPulseDot.className = 'tunnel-pulse-dot reconnecting';
        if (btnCopyTunnel) btnCopyTunnel.style.display = tunnelAddress ? 'inline-flex' : 'none';
      } else if (st === 'ERROR') {
        tunnelShareIp.textContent = 'Tunnel déconnecté (cliquer)';
        tunnelShareIp.title = 'Le tunnel a perdu la liaison. Cliquez pour forcer la reconnexion.';
        if (tunnelPulseDot) tunnelPulseDot.className = 'tunnel-pulse-dot error';
        if (btnCopyTunnel) btnCopyTunnel.style.display = 'none';
      } else if (tunnelAddress) {
        tunnelShareIp.textContent = tunnelAddress;
        if (tunnelPulseDot) tunnelPulseDot.className = 'tunnel-pulse-dot';
        if (btnCopyTunnel) btnCopyTunnel.style.display = 'inline-flex';
      } else {
        tunnelSharePill.style.display = 'none';
      }
    } else if (isViewedRunning && tunnelAddress) {
      tunnelSharePill.style.display = 'inline-flex';
      tunnelShareIp.textContent = tunnelAddress;
      tunnelShareIp.title = `Adresse de connexion : ${tunnelAddress}`;
      if (tunnelPulseDot) tunnelPulseDot.className = 'tunnel-pulse-dot';
      if (btnCopyTunnel) btnCopyTunnel.style.display = 'inline-flex';
    } else {
      tunnelSharePill.style.display = 'none';
    }
  }
}

function copyTunnelShareIp() {
  if (currentTunnelState && currentTunnelState.status === 'ERROR') {
    restartTunnelManual();
    return;
  }
  if (tunnelAddress) {
    navigator.clipboard.writeText(tunnelAddress).then(() => {
      showToast(`Adresse IP copiée dans le presse-papiers`, 'success');
      const btn = document.getElementById('btnCopyTunnel');
      if (btn) {
        const origText = btn.textContent;
        btn.textContent = 'Copié !';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = origText;
          btn.classList.remove('copied');
        }, 1500);
      }
    }).catch(() => {
      showToast(`Adresse IP : ${tunnelAddress}`, 'info');
    });
  } else {
    restartTunnelManual();
  }
}
window.copyTunnelShareIp = copyTunnelShareIp;

async function restartTunnelManual(event, forceNewPort = false) {
  if (event) event.stopPropagation();
  const btn = document.getElementById('btnRestartTunnel');
  if (btn) btn.classList.add('rotating');
  showToast(forceNewPort ? 'Génération d\'un nouveau port...' : 'Reconnexion au tunnel bore...', 'info');

  try {
    const res = await fetch('/api/tunnel/restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceNewPort })
    });
    const data = await res.json();
    if (data) {
      updateTunnelState(data);
      if (data.publicAddress) {
        showToast(`Tunnel actif : ${data.publicAddress}`, 'success');
      } else if (data.status === 'RECONNECTING') {
        showToast('Reconnexion en cours...', 'info');
      }
    }
  } catch (err) {
    showToast('Erreur lors de la reconnexion du tunnel', 'error');
  } finally {
    if (btn) {
      setTimeout(() => btn.classList.remove('rotating'), 600);
    }
  }
}
window.restartTunnelManual = restartTunnelManual;

function renderTerminalLogs(logsArray) {
  terminalOutput.innerHTML = '';
  const lines = (logsArray || []).slice(-500);
  const fragment = document.createDocumentFragment();
  for (const text of lines) {
    fragment.appendChild(createTerminalLineElement(text));
  }
  terminalOutput.appendChild(fragment);
  if (autoScroll) {
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }
}

function createTerminalLineElement(text) {
  const line = document.createElement('div');
  line.className = 'terminal-line';
  const raw = String(text ?? '');

  // 1. Commandes saisies dans la console (> ...)
  if (raw.startsWith('>')) {
    line.classList.add('command');
    const promptSpan = document.createElement('span');
    promptSpan.className = 'log-cmd-prompt';
    promptSpan.textContent = '>';
    const cmdSpan = document.createElement('span');
    cmdSpan.className = 'log-cmd-text';
    cmdSpan.textContent = raw.slice(1);
    line.appendChild(promptSpan);
    line.appendChild(cmdSpan);
    return line;
  }

  // 2. Préfixes internes Cubirium ([Tunnel], [Système], [Java], [Installation], [Réparation], [Cubirium])
  const internalMatch = raw.match(/^(\[(?:Tunnel|Système|Java|Installation|Réparation|Cubirium|ERR)\])\s*(.*)$/);
  if (internalMatch) {
    const tag = internalMatch[1];
    const msg = internalMatch[2];
    const tagSpan = document.createElement('span');
    const msgSpan = document.createElement('span');
    msgSpan.className = 'log-msg';
    msgSpan.textContent = msg;

    if (tag === '[ERR]' || /échec|erreur|error|exception/i.test(msg)) {
      line.classList.add('error');
      tagSpan.className = 'log-error';
    } else if (tag === '[Tunnel]') {
      line.classList.add('tunnel');
      tagSpan.className = 'log-tag-tunnel';
    } else {
      line.classList.add('system');
      tagSpan.className = 'log-tag-system';
      if (/avec succès|configuré|prêt|terminé|en ligne/i.test(msg)) {
        line.classList.add('is-success');
      }
    }
    tagSpan.textContent = tag;
    line.appendChild(tagSpan);
    if (msg) {
      line.appendChild(document.createTextNode(' '));
      line.appendChild(msgSpan);
    }
    return line;
  }

  // 3. Lignes de stack trace Java (\tat ... ou Caused by:)
  if (/^\s+at\s+[\w.$<>]+\(/.test(raw) || /^\s+\.\.\.\s+\d+\s+more/.test(raw)) {
    line.classList.add('stacktrace');
    line.textContent = raw;
    return line;
  }

  // 4. Lignes structurées Minecraft : [HH:MM:SS] [Thread/LEVEL]: Message
  // Compatible Vanilla, Paper/Spigot, Fabric, Forge et NeoForge
  const mcMatch = raw.match(/^(\[(?:\d{2}[A-Za-z]{3}\d{4}\s+)?\d{2}:\d{2}:\d{2}(?:\.\d+)?\])\s+(\[[^\]]+\](?:\s+\[[^\]]+\])?:?)\s*(.*)$/);
  if (mcMatch) {
    const tsPart = mcMatch[1];
    const threadPart = mcMatch[2];
    const msgPart = mcMatch[3] || '';

    const tsSpan = document.createElement('span');
    tsSpan.className = 'log-ts';
    tsSpan.textContent = tsPart;

    const threadSpan = document.createElement('span');
    const isErrLevel = /\/(?:ERROR|FATAL|SEVERE)\b/i.test(threadPart) || /\b(?:Exception|Error):/.test(msgPart);
    const isWarnLevel = !isErrLevel && /\/WARN(?:ING)?\b/i.test(threadPart);

    if (isErrLevel) {
      threadSpan.className = 'log-error';
      line.classList.add('error');
    } else if (isWarnLevel) {
      threadSpan.className = 'log-warn';
      line.classList.add('warn');
    } else {
      threadSpan.className = 'log-info';
      line.classList.add('info');
    }
    threadSpan.textContent = threadPart;

    line.appendChild(tsSpan);
    line.appendChild(document.createTextNode(' '));
    line.appendChild(threadSpan);

    if (msgPart) {
      line.appendChild(document.createTextNode(' '));
      const msgSpan = document.createElement('span');
      msgSpan.className = 'log-msg';

      if (!isErrLevel && !isWarnLevel) {
        // Lignes remarquables : détection sémantique
        const joinMatch = msgPart.match(/^(?:(System chat:\s*))?([a-zA-Z0-9_]{2,16})(\s+(?:joined the game|logged in with entity id).*)$/i);
        const leaveMatch = !joinMatch && msgPart.match(/^(?:(System chat:\s*))?([a-zA-Z0-9_]{2,16})(\s+(?:left the game|lost connection).*)$/i);
        const chatMatch = !joinMatch && !leaveMatch && msgPart.match(/^(?:(\[Not Secure\]\s*))?(<[a-zA-Z0-9_]{2,16}>)(\s+.*)$/);

        if (/^Done\s*\([^)]+\)!/i.test(msgPart) || /For help,\s*type\s+"help"/i.test(msgPart) || /RCON running on/i.test(msgPart)) {
          line.classList.add('is-success');
          msgSpan.textContent = msgPart;
        } else if (joinMatch) {
          line.classList.add('is-join');
          if (joinMatch[1]) msgSpan.appendChild(document.createTextNode(joinMatch[1]));
          const pSpan = document.createElement('span');
          pSpan.className = 'log-player-name';
          pSpan.textContent = joinMatch[2];
          msgSpan.appendChild(pSpan);
          msgSpan.appendChild(document.createTextNode(joinMatch[3]));
        } else if (leaveMatch) {
          line.classList.add('is-leave');
          if (leaveMatch[1]) msgSpan.appendChild(document.createTextNode(leaveMatch[1]));
          const pSpan = document.createElement('span');
          pSpan.className = 'log-player-name';
          pSpan.textContent = leaveMatch[2];
          msgSpan.appendChild(pSpan);
          msgSpan.appendChild(document.createTextNode(leaveMatch[3]));
        } else if (chatMatch) {
          line.classList.add('is-chat');
          if (chatMatch[1]) {
            const nsSpan = document.createElement('span');
            nsSpan.className = 'log-ts';
            nsSpan.textContent = chatMatch[1];
            msgSpan.appendChild(nsSpan);
          }
          const pSpan = document.createElement('span');
          pSpan.className = 'log-player-name';
          pSpan.textContent = chatMatch[2];
          msgSpan.appendChild(pSpan);
          msgSpan.appendChild(document.createTextNode(chatMatch[3]));
        } else if (/has (?:made the advancement|completed the challenge|reached the goal)/i.test(msgPart)) {
          line.classList.add('is-advancement');
          msgSpan.textContent = msgPart;
        } else if (/^(?:Stopping server|System chat:\s*Stopping the server|Stopping the server|Saving players|Saving worlds|All dimensions are saved)/i.test(msgPart)) {
          line.classList.add('is-shutdown');
          msgSpan.textContent = msgPart;
        } else if (/^(?:Starting minecraft server|Preparing level|Default game type:|Loading \d+ mods|Environment:|Running on )/i.test(msgPart)) {
          line.classList.add('is-milestone');
          msgSpan.textContent = msgPart;
        } else if (/^(?:The nearest\s+|Located\s+|Seed:|Teleported\s+|Gave\s+|Made\s+.+\s+a server operator|No longer a server operator|Set\s+.+game mode|Changed\s+.+game mode|Added\s+.+\s+to the whitelist|Removed\s+.+\s+from the whitelist|Banned\s+|Unbanned\s+|Pardoned\s+|Kicked\s+|Set the time to|Set the weather to|Gamerule\s+)/i.test(msgPart)) {
          line.classList.add('is-admin');
          msgSpan.textContent = msgPart;
        } else {
          msgSpan.textContent = msgPart;
        }
      } else {
        msgSpan.textContent = msgPart;
      }

      line.appendChild(msgSpan);
    }

    return line;
  }

  // 5. Fallback pour lignes non structurées
  if (raw.includes('[ERR]') || raw.includes('ERROR') || raw.includes('Exception') || raw.startsWith('Caused by:')) {
    line.classList.add('error');
  } else if (raw.includes('WARN')) {
    line.classList.add('warn');
  } else {
    line.classList.add('info');
  }

  line.textContent = raw;
  return line;
}

function appendTerminalLog(data) {
  let targetWorld = null;
  let logText = '';

  if (typeof data === 'object' && data !== null) {
    targetWorld = data.worldId || activeWorld || selectedTerminalWorldId;
    logText = data.text !== undefined ? data.text : '';
  } else {
    targetWorld = activeWorld || selectedTerminalWorldId;
    logText = String(data || '');
  }

  if (!targetWorld) return;

  if (!terminalBuffers[targetWorld]) {
    terminalBuffers[targetWorld] = [];
  }
  terminalBuffers[targetWorld].push(logText);
  while (terminalBuffers[targetWorld].length > 500) {
    terminalBuffers[targetWorld].shift();
  }

  if (targetWorld === selectedTerminalWorldId) {
    const el = createTerminalLineElement(logText);
    terminalOutput.appendChild(el);
    while (terminalOutput.children.length > 500) {
      terminalOutput.removeChild(terminalOutput.firstElementChild);
    }
    if (autoScroll) {
      terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }
  } else {
    terminalUnread[targetWorld] = (terminalUnread[targetWorld] || 0) + 1;
  }
}

// Détection scroll manuel dans le terminal
terminalOutput.addEventListener('scroll', () => {
  const isAtBottom = terminalOutput.scrollHeight - terminalOutput.scrollTop <= terminalOutput.clientHeight + 50;
  autoScroll = isAtBottom;
});

// ----------------------------------------------------
// EventSource (SSE) pour Temps Réel
// ----------------------------------------------------
let isSseActive = false;

function initSSE() {
  const evtSource = new EventSource('/api/events');

  evtSource.onopen = () => {
    isSseActive = true;
  };

  evtSource.onmessage = (event) => {
    isSseActive = true;
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'log') {
        appendTerminalLog(msg.data);
      } else if (msg.type === 'status') {
        updateMinecraftState(msg.data);
      } else if (msg.type === 'players') {
        currentPlayersList = msg.data || [];
        updateTerminalHeader();
        if (playersModal && playersModal.style.display !== 'none') {
          refreshPlayersData();
        }
        if (playerDetailModal && playerDetailModal.style.display !== 'none' && currentPlayerDetailName) {
          const isNowOnline = currentPlayersList.some(p => p.toLowerCase() === currentPlayerDetailName.toLowerCase());
          if (detailStatusPill) {
            detailStatusPill.textContent = isNowOnline ? 'En ligne' : 'Hors ligne';
            detailStatusPill.className = `player-status-pill ${isNowOnline ? 'online' : 'offline'}`;
          }
        }
      } else if (msg.type === 'tunnel') {
        updateTunnelState(msg.data);
      } else if (msg.type === 'install_progress') {
        updateProgressModal(msg.data.progress, msg.data.msg);
        if (msg.data.progress >= 100) {
          showToast(msg.data.msg || 'Installation terminée !', 'success');
        }
      } else if (msg.type === 'mod_analyze_progress') {
        const { progress, msg: statusMsg, current, total } = msg.data;
        const overall = 35 + Math.round(progress * 0.65);
        const countText = (current && total) ? `${current} / ${total} mods triés` : '';
        updateModLoadingProgress(overall, statusMsg, countText);
      }
    } catch (e) {
      console.error('SSE parse error', e);
    }
  };

  evtSource.onerror = () => {
    isSseActive = false;
    console.warn('SSE déconnecté, reconnexion automatique...');
  };
}

// ----------------------------------------------------
// Console Controls & Quick Chips
// ----------------------------------------------------
let clearConfirmTimer = null;

function resetClearButton() {
  if (clearConfirmTimer) {
    clearTimeout(clearConfirmTimer);
    clearConfirmTimer = null;
  }
  if (btnClearConsole) {
    btnClearConsole.textContent = 'Effacer';
    btnClearConsole.classList.remove('btn-confirm-warn');
    btnClearConsole.removeAttribute('data-confirming');
  }
}

btnClearConsole.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!selectedTerminalWorldId) return;

  const isConfirming = btnClearConsole.getAttribute('data-confirming') === 'true';

  if (!isConfirming) {
    // Étape 1 : Demande de confirmation visuelle
    btnClearConsole.setAttribute('data-confirming', 'true');
    btnClearConsole.textContent = 'Vous êtes sûr ?';
    btnClearConsole.classList.add('btn-confirm-warn');

    // Revenir à l'état initial après 4 secondes sans second clic
    clearConfirmTimer = setTimeout(() => {
      resetClearButton();
    }, 4000);
    return;
  }

  // Étape 2 : Confirmation validée !
  resetClearButton();

  const targetWorld = selectedTerminalWorldId;
  if (targetWorld) {
    terminalBuffers[targetWorld] = [];
  }
  terminalOutput.innerHTML = `
    <div class="terminal-welcome">
      <p>Logs effacés pour le monde <strong>${escapeHtml(targetWorld || 'sélectionné')}</strong>.</p>
    </div>`;
  showToast(`Logs de '${targetWorld || 'monde'}' effacés avec succès.`, 'info');

  try {
    await fetch('/api/logs/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId: targetWorld })
    });
  } catch (err) {
    console.error('Erreur clear logs:', err);
  }
});

// Annuler la confirmation si clic en dehors
document.addEventListener('click', (e) => {
  if (btnClearConsole && !btnClearConsole.contains(e.target)) {
    if (btnClearConsole.getAttribute('data-confirming') === 'true') {
      resetClearButton();
    }
  }
});

btnLaunchViewedWorld.addEventListener('click', () => {
  if (selectedTerminalWorldId) {
    startWorld(selectedTerminalWorldId);
  }
});

btnStopActiveServer.addEventListener('click', () => {
  stopActiveWorld();
});

const cmdSuggestionsBox = document.getElementById('cmdSuggestionsBox');
const suggestionsList = document.getElementById('suggestionsList');
const cmdSyntaxBar = document.getElementById('cmdSyntaxBar');
let _suggestTimeout = null;
let _selectedSuggestionIndex = -1;
const cmdHistory = [];
let cmdHistoryIndex = -1;
let _currentSuggestionsList = [];

const DEFAULT_COMMANDS = [
  { cmd: 'help', desc: 'Affiche la liste des commandes ou l’aide' },
  { cmd: 'list', desc: 'Liste les joueurs actuellement connectés' },
  { cmd: 'tp <joueur> <cible>', desc: 'Téléporte un joueur vers un autre joueur ou des coordonnées' },
  { cmd: 'gamemode <mode>', desc: 'Change le mode de jeu (survival, creative, spectator, adventure)' },
  { cmd: 'time set <valeur>', desc: 'Règle l’heure du monde (day, night, noon, midnight ou ticks)' },
  { cmd: 'weather <type>', desc: 'Définit la météo (clear, rain, thunder)' },
  { cmd: 'give <joueur> <item> [quantité]', desc: 'Donne un objet à un joueur' },
  { cmd: 'op <joueur>', desc: 'Donne les permissions administrateur' },
  { cmd: 'deop <joueur>', desc: 'Retire les permissions administrateur' },
  { cmd: 'whitelist <action>', desc: 'Gère la liste blanche (on, off, list, add, remove, reload)' },
  { cmd: 'locate structure <type>', desc: 'Localise la structure ou le biome le plus proche' },
  { cmd: 'difficulty <niveau>', desc: 'Définit la difficulté (peaceful, easy, normal, hard)' },
  { cmd: 'summon <entité> [x y z]', desc: 'Fait apparaître une entité' },
  { cmd: 'effect give <joueur> <effet>', desc: 'Applique un effet de potion à un joueur' },
  { cmd: 'kill <cible>', desc: 'Élimine un joueur ou une entité' },
  { cmd: 'clear [joueur]', desc: 'Vide l’inventaire d’un joueur ou de soi-même' },
  { cmd: 'gamerule <règle> [valeur]', desc: 'Modifie une règle de jeu (keepInventory, mobGriefing...)' },
  { cmd: 'setworldspawn [x y z]', desc: 'Définit le point d’apparition global du monde' },
  { cmd: 'spawnpoint [joueur] [x y z]', desc: 'Définit le point d’apparition individuel d’un joueur' },
  { cmd: 'say <message>', desc: 'Diffuse un message à tous les joueurs du serveur' },
  { cmd: 'tell <joueur> <message>', desc: 'Envoie un message privé à un joueur' },
  { cmd: 'kick <joueur> [raison]', desc: 'Expulse un joueur du serveur' },
  { cmd: 'ban <joueur> [raison]', desc: 'Bannit un joueur du serveur' },
  { cmd: 'pardon <joueur>', desc: 'Débannit un joueur' },
  { cmd: 'seed', desc: 'Affiche la graine de génération de ce monde' },
  { cmd: 'stop', desc: 'Arrête proprement le serveur' }
];

const COMMAND_SPECS = {
  tp: {
    args: [
      { name: '<joueur>', type: 'player', desc: 'Joueur à téléporter' },
      { name: '<cible ou x y z>', type: 'coord_or_player', desc: 'Destination (joueur ou coordonnées)' }
    ]
  },
  teleport: {
    args: [
      { name: '<joueur>', type: 'player', desc: 'Joueur à téléporter' },
      { name: '<cible ou x y z>', type: 'coord_or_player', desc: 'Destination (joueur ou coordonnées)' }
    ]
  },
  gamemode: {
    args: [
      { name: '<mode>', type: 'gamemode', desc: 'Mode de jeu' },
      { name: '[joueur]', type: 'player', desc: 'Joueur cible (optionnel)' }
    ]
  },
  time: {
    args: [
      { name: '<action>', type: 'time_action', desc: 'Action (set, add, query)' },
      {
        name: (tokens) => tokens[1] === 'set' ? '<heure>' : (tokens[1] === 'query' ? '<type>' : '<valeur>'),
        type: (tokens) => tokens[1] === 'set' ? 'time_preset' : (tokens[1] === 'query' ? 'time_query' : 'number'),
        desc: (tokens) => tokens[1] === 'set' ? 'Heure du jour' : 'Valeur'
      }
    ]
  },
  weather: {
    args: [
      { name: '<type>', type: 'weather', desc: 'Condition météo' },
      { name: '[durée]', type: 'number', desc: 'Durée en secondes' }
    ]
  },
  difficulty: {
    args: [
      { name: '<niveau>', type: 'difficulty', desc: 'Niveau de difficulté' }
    ]
  },
  give: {
    args: [
      { name: '<joueur>', type: 'player', desc: 'Joueur destinataire' },
      { name: '<item>', type: 'item', desc: 'Identifiant d’objet Minecraft' },
      { name: '[quantité]', type: 'number', desc: 'Quantité (1 à 64)' }
    ]
  },
  clear: {
    args: [
      { name: '[joueur]', type: 'player', desc: 'Joueur cible' },
      { name: '[item]', type: 'item', desc: 'Objet à retirer' }
    ]
  },
  kill: {
    args: [
      { name: '<cible>', type: 'player', desc: 'Entité ou joueur à éliminer' }
    ]
  },
  op: {
    args: [
      { name: '<joueur>', type: 'player', desc: 'Joueur à promouvoir administrateur' }
    ]
  },
  deop: {
    args: [
      { name: '<joueur>', type: 'player', desc: 'Joueur à rétrograder' }
    ]
  },
  kick: {
    args: [
      { name: '<joueur>', type: 'player', desc: 'Joueur à expulser' },
      { name: '[raison]', type: 'text', desc: 'Motif de l’expulsion' }
    ]
  },
  ban: {
    args: [
      { name: '<joueur>', type: 'player', desc: 'Joueur à bannir' },
      { name: '[raison]', type: 'text', desc: 'Motif du bannissement' }
    ]
  },
  pardon: {
    args: [
      { name: '<joueur>', type: 'player', desc: 'Joueur à débannir' }
    ]
  },
  whitelist: {
    args: [
      { name: '<action>', type: 'whitelist_action', desc: 'Action de liste blanche' },
      { name: '[joueur]', type: 'player', desc: 'Joueur concerné' }
    ]
  },
  locate: {
    args: [
      { name: '<catégorie>', type: 'locate_cat', desc: 'Catégorie (structure, biome, poi)' },
      { name: '<cible>', type: 'locate_target', desc: 'Structure ou biome recherché' }
    ]
  },
  summon: {
    args: [
      { name: '<entité>', type: 'entity', desc: 'Type d’entité à faire apparaître' },
      { name: '[x y z]', type: 'coord', desc: 'Coordonnées d’apparition' }
    ]
  },
  effect: {
    args: [
      { name: '<action>', type: 'effect_action', desc: 'Action give ou clear' },
      { name: '<joueur>', type: 'player', desc: 'Joueur ciblé' },
      { name: '[effet]', type: 'effect', desc: 'Effet de potion' },
      { name: '[durée]', type: 'number', desc: 'Durée en secondes' }
    ]
  },
  gamerule: {
    args: [
      { name: '<règle>', type: 'gamerule', desc: 'Règle de jeu Minecraft' },
      { name: '[valeur]', type: 'boolean', desc: 'Valeur (true / false)' }
    ]
  },
  setworldspawn: {
    args: [
      { name: '[x y z]', type: 'coord', desc: 'Coordonnées du point d’apparition global' }
    ]
  },
  spawnpoint: {
    args: [
      { name: '[joueur]', type: 'player', desc: 'Joueur' },
      { name: '[x y z]', type: 'coord', desc: 'Coordonnées de réapparition' }
    ]
  },
  say: {
    args: [
      { name: '<message>', type: 'text', desc: 'Message à diffuser à tous' }
    ]
  },
  tell: {
    args: [
      { name: '<joueur>', type: 'player', desc: 'Joueur destinataire' },
      { name: '<message>', type: 'text', desc: 'Message privé' }
    ]
  },
  help: {
    args: [
      { name: '[commande]', type: 'command_name', desc: 'Commande dont consulter l’aide' }
    ]
  }
};

const MC_TARGET_DESCS = {
  '@p': 'Joueur le plus proche',
  '@a': 'Tous les joueurs du serveur',
  '@s': 'Exécuteur de la commande',
  '@r': 'Joueur sélectionné au hasard',
  '@e': 'Toutes les entités vivantes'
};

const MC_GAMEMODES = [
  { val: 'survival', desc: 'Mode Survie standard' },
  { val: 'creative', desc: 'Mode Créatif illimité' },
  { val: 'adventure', desc: 'Mode Aventure (sans casse)' },
  { val: 'spectator', desc: 'Mode Spectateur (vol libre)' }
];

const MC_TIMES = [
  { val: 'day', desc: 'Début de journée (1000 ticks)' },
  { val: 'noon', desc: 'Midi plein soleil (6000 ticks)' },
  { val: 'night', desc: 'Nuit tombée (13000 ticks)' },
  { val: 'midnight', desc: 'Minuit obscur (18000 ticks)' },
  { val: '0', desc: 'Lever du jour (0 ticks)' },
  { val: '6000', desc: 'Zénith (6000 ticks)' },
  { val: '12000', desc: 'Crépuscule (12000 ticks)' }
];

const MC_WEATHERS = [
  { val: 'clear', desc: 'Ciel bleu et dégagé' },
  { val: 'rain', desc: 'Pluie continue' },
  { val: 'thunder', desc: 'Violent orage et foudre' }
];

const MC_DIFFICULTIES = [
  { val: 'peaceful', desc: 'Paisible (sans monstres)' },
  { val: 'easy', desc: 'Facile' },
  { val: 'normal', desc: 'Difficulté standard' },
  { val: 'hard', desc: 'Difficile (famine mortelle)' }
];

const MC_WHITELIST_ACTIONS = [
  { val: 'on', desc: 'Activer la restriction whitelist' },
  { val: 'off', desc: 'Désactiver la restriction whitelist' },
  { val: 'list', desc: 'Lister les joueurs autorisés' },
  { val: 'add', desc: 'Ajouter un joueur à la liste' },
  { val: 'remove', desc: 'Retirer un joueur de la liste' },
  { val: 'reload', desc: 'Recharger whitelist.json' }
];

const MC_STRUCTURES = [
  { val: 'minecraft:village', desc: 'Village habité' },
  { val: 'minecraft:ancient_city', desc: 'Cité antique des profondeurs' },
  { val: 'minecraft:fortress', desc: 'Forteresse du Nether' },
  { val: 'minecraft:bastion_remnant', desc: 'Bastion de Piglins' },
  { val: 'minecraft:mansion', desc: 'Manoir des bois sombres' },
  { val: 'minecraft:monument', desc: 'Monument sous-marin des gardiens' },
  { val: 'minecraft:stronghold', desc: 'Forteresse de l’End (Portail)' },
  { val: 'minecraft:mineshaft', desc: 'Puits de mine abandonné' },
  { val: 'minecraft:pillager_outpost', desc: 'Avant-poste de pillards' },
  { val: 'minecraft:buried_treasure', desc: 'Trésor enfoui' }
];

const MC_BIOMES = [
  { val: 'minecraft:plains', desc: 'Plaines herbeuses' },
  { val: 'minecraft:forest', desc: 'Forêt de chênes' },
  { val: 'minecraft:desert', desc: 'Désert aride' },
  { val: 'minecraft:jungle', desc: 'Jungle tropicale' },
  { val: 'minecraft:snowy_slopes', desc: 'Pentes enneigées' },
  { val: 'minecraft:nether_wastes', desc: 'Terres désolées du Nether' },
  { val: 'minecraft:end_highlands', desc: 'Hautes terres de l’End' }
];

const MC_ENTITIES = [
  { val: 'minecraft:zombie', desc: 'Monstre Zombie' },
  { val: 'minecraft:skeleton', desc: 'Squelette archer' },
  { val: 'minecraft:creeper', desc: 'Creeper explosif' },
  { val: 'minecraft:enderman', desc: 'Enderman téléporteur' },
  { val: 'minecraft:iron_golem', desc: 'Golem de fer' },
  { val: 'minecraft:villager', desc: 'Villageois commerçant' },
  { val: 'minecraft:cow', desc: 'Vache' },
  { val: 'minecraft:sheep', desc: 'Mouton' },
  { val: 'minecraft:pig', desc: 'Cochon' },
  { val: 'minecraft:warden', desc: 'Warden gardien des ténèbres' },
  { val: 'minecraft:ender_dragon', desc: 'Dragon de l’End' },
  { val: 'minecraft:wither', desc: 'Boss Wither' }
];

const MC_ITEMS = [
  { val: 'minecraft:diamond', desc: 'Diamant brut' },
  { val: 'minecraft:netherite_ingot', desc: 'Lingot de Netherite' },
  { val: 'minecraft:golden_apple', desc: 'Pomme dorée' },
  { val: 'minecraft:elytra', desc: 'Ailes Élytres' },
  { val: 'minecraft:totem_of_undying', desc: 'Totem d’immortalité' },
  { val: 'minecraft:iron_ingot', desc: 'Lingot de fer' },
  { val: 'minecraft:bow', desc: 'Arc de tir' },
  { val: 'minecraft:arrow', desc: 'Flèche' },
  { val: 'minecraft:bread', desc: 'Pain nourricier' },
  { val: 'minecraft:torch', desc: 'Torche d’éclairage' },
  { val: 'minecraft:oak_log', desc: 'Bûche de chêne' }
];

const MC_EFFECTS = [
  { val: 'minecraft:speed', desc: 'Vitesse de marche accrue' },
  { val: 'minecraft:strength', desc: 'Force d’attaque augmentée' },
  { val: 'minecraft:regeneration', desc: 'Régénération accélérée de santé' },
  { val: 'minecraft:night_vision', desc: 'Vision nocturne parfaite' },
  { val: 'minecraft:invisibility', desc: 'Invisibilité complète' },
  { val: 'minecraft:water_breathing', desc: 'Apnée sous-marine illimitée' },
  { val: 'minecraft:fire_resistance', desc: 'Immunité totale au feu et à la lave' },
  { val: 'minecraft:jump_boost', desc: 'Saut surélevé' },
  { val: 'minecraft:slow_falling', desc: 'Chute lente sans dégâts' },
  { val: 'minecraft:absorption', desc: 'Cœurs d’absorption supplémentaires' }
];

const MC_GAMERULES = [
  { val: 'keepInventory', desc: 'Conserver l’inventaire après la mort' },
  { val: 'mobGriefing', desc: 'Dégâts des monstres sur les blocs' },
  { val: 'doDaylightCycle', desc: 'Progression du cycle jour / nuit' },
  { val: 'doWeatherCycle', desc: 'Changements météorologiques automatiques' },
  { val: 'doFireTick', desc: 'Propagation et combustion du feu' },
  { val: 'naturalRegeneration', desc: 'Régénération naturelle de la vie' },
  { val: 'fallDamage', desc: 'Dégâts infligés par les chutes' },
  { val: 'fireDamage', desc: 'Dégâts causés par les flammes' },
  { val: 'drowningDamage', desc: 'Dégâts de noyade' },
  { val: 'showDeathMessages', desc: 'Messages de mort dans le chat' },
  { val: 'randomTickSpeed', desc: 'Vitesse de croissance des cultures et plantes' }
];

function getKnownPlayerNames() {
  const players = new Set();
  (currentPlayersList || []).forEach(p => {
    const name = typeof p === 'string' ? p : p.name;
    if (name) players.add(name);
  });
  players.add('@p');
  players.add('@a');
  players.add('@s');
  players.add('@r');
  players.add('@e');
  return Array.from(players);
}

function computeCommandSmartSuggestions(rawInput) {
  const hasSlash = rawInput.startsWith('/');
  const clean = rawInput.replace(/^\//, '');
  const tokens = clean.split(' ');
  const baseCmd = (tokens[0] || '').toLowerCase();
  const tokenIndex = tokens.length - 1; // 0 = nom commande, 1 = arg 0...
  const currentToken = tokens[tokenIndex] || '';

  const syntax = {
    base: (hasSlash ? '/' : '') + (baseCmd || ''),
    chips: []
  };

  // 1. Choix du nom de la commande (premier mot)
  if (tokenIndex === 0) {
    const q = baseCmd.trim();
    syntax.chips = [{ label: 'Commande', status: 'active' }];

    const filtered = !q
      ? DEFAULT_COMMANDS.slice(0, 10)
      : DEFAULT_COMMANDS.filter(c => {
        const name = c.cmd.split(' ')[0].toLowerCase();
        return name.startsWith(q) || c.cmd.toLowerCase().includes(q) || (c.desc || '').toLowerCase().includes(q);
      }).slice(0, 10);

    const suggestions = filtered.map(c => {
      const name = c.cmd.split(' ')[0];
      const hasArgs = c.cmd.includes(' ');
      return {
        insertText: (hasSlash ? '/' : '') + name + (hasArgs ? ' ' : ''),
        displayCmd: (hasSlash ? '/' : '') + name,
        desc: c.desc,
        kind: 'command'
      };
    });

    return { syntax, suggestions };
  }

  // 2. Navigation dans les arguments (tokenIndex >= 1)
  const spec = COMMAND_SPECS[baseCmd];
  const qArg = currentToken.toLowerCase();
  const argIndex = tokenIndex - 1;

  if (spec && spec.args && spec.args.length > 0) {
    syntax.chips = spec.args.map((a, i) => {
      const argName = typeof a.name === 'function' ? a.name(tokens) : a.name;
      if (i < argIndex) {
        return { label: tokens[i + 1] || argName, status: 'filled' };
      }
      if (i === argIndex) {
        return { label: argName, status: 'active' };
      }
      return { label: argName, status: 'pending' };
    });
  } else {
    syntax.chips = [{ label: `<arg ${tokenIndex}>`, status: 'active' }];
  }

  // Si tous les arguments prévus sont déjà remplis
  if (spec && spec.args && argIndex >= spec.args.length) {
    return {
      syntax,
      suggestions: [
        {
          insertText: (hasSlash ? '/' : '') + clean.trim(),
          displayCmd: '↵ Exécuter la commande',
          desc: 'Appuyez sur Entrée pour envoyer',
          kind: 'ready'
        }
      ]
    };
  }

  // Déterminer le type d’argument actif
  let argType = 'text';
  let argDesc = 'Valeur';
  if (spec && spec.args && spec.args[argIndex]) {
    const a = spec.args[argIndex];
    argType = typeof a.type === 'function' ? a.type(tokens) : a.type;
    argDesc = typeof a.desc === 'function' ? a.desc(tokens) : a.desc;
  }

  // Préparer les suggestions candidates selon le perk de l’argument
  let candidates = [];
  const players = getKnownPlayerNames();
  const coordCandidates = [
    { val: '~ ~ ~', desc: 'Position actuelle (~ ~ ~)' },
    { val: '~', desc: 'Axe courant (~)' },
    { val: '^ ^ ^', desc: 'Position relative au regard (^ ^ ^)' },
    { val: '0 64 0', desc: 'Origine mondiale au niveau de la mer' }
  ];

  if (argType === 'player') {
    candidates = players.map(p => ({
      val: p,
      desc: p.startsWith('@') ? (MC_TARGET_DESCS[p] || 'Sélecteur de cible') : 'Joueur connecté'
    }));
  } else if (argType === 'coord_or_player') {
    candidates = [
      ...players.map(p => ({ val: p, desc: p.startsWith('@') ? (MC_TARGET_DESCS[p] || 'Sélecteur de cible') : 'Joueur cible' })),
      ...coordCandidates
    ];
  } else if (argType === 'coord') {
    candidates = coordCandidates;
  } else if (argType === 'gamemode') {
    candidates = MC_GAMEMODES;
  } else if (argType === 'time_action') {
    candidates = [
      { val: 'set', desc: 'Régler l’heure du jour' },
      { val: 'add', desc: 'Avancer le cycle horaire' },
      { val: 'query', desc: 'Consulter l’heure courante' }
    ];
  } else if (argType === 'time_preset') {
    candidates = MC_TIMES;
  } else if (argType === 'time_query') {
    candidates = [
      { val: 'daytime', desc: 'Heure écoulée du jour' },
      { val: 'gametime', desc: 'Temps global de la partie' },
      { val: 'day', desc: 'Nombre de jours passés' }
    ];
  } else if (argType === 'weather') {
    candidates = MC_WEATHERS;
  } else if (argType === 'difficulty') {
    candidates = MC_DIFFICULTIES;
  } else if (argType === 'whitelist_action') {
    candidates = MC_WHITELIST_ACTIONS;
  } else if (argType === 'locate_cat') {
    candidates = [
      { val: 'structure', desc: 'Rechercher une structure' },
      { val: 'biome', desc: 'Rechercher un écosystème naturel' },
      { val: 'poi', desc: 'Rechercher un point d’intérêt (village)' }
    ];
  } else if (argType === 'locate_target') {
    candidates = (tokens[1] === 'biome') ? MC_BIOMES : MC_STRUCTURES;
  } else if (argType === 'entity') {
    candidates = MC_ENTITIES;
  } else if (argType === 'item') {
    candidates = MC_ITEMS;
  } else if (argType === 'effect_action') {
    candidates = [
      { val: 'give', desc: 'Accorder un effet de potion' },
      { val: 'clear', desc: 'Dissiper tous les effets actifs' }
    ];
  } else if (argType === 'effect') {
    candidates = MC_EFFECTS;
  } else if (argType === 'gamerule') {
    candidates = MC_GAMERULES;
  } else if (argType === 'boolean') {
    candidates = [
      { val: 'true', desc: 'Activer la règle' },
      { val: 'false', desc: 'Désactiver la règle' }
    ];
  } else if (argType === 'number') {
    candidates = [
      { val: '1', desc: 'Quantité : 1' },
      { val: '16', desc: 'Quantité : 16' },
      { val: '32', desc: 'Quantité : 32' },
      { val: '64', desc: 'Quantité : 64 (Stack)' }
    ];
  } else if (argType === 'command_name') {
    candidates = DEFAULT_COMMANDS.map(c => ({ val: c.cmd.split(' ')[0], desc: c.desc }));
  }

  // Filtrage selon la saisie courante du minibloc actif
  const filtered = candidates.filter(c => {
    if (!qArg) return true;
    const v = c.val.toLowerCase();
    return v.includes(qArg) || (c.desc || '').toLowerCase().includes(qArg);
  }).slice(0, 10);

  const suggestions = filtered.map(c => {
    const tokensCopy = [...tokens];
    tokensCopy[tokenIndex] = c.val;
    return {
      insertText: (hasSlash ? '/' : '') + tokensCopy.join(' ') + ' ',
      displayCmd: c.val,
      desc: c.desc || argDesc,
      kind: argType
    };
  });

  return { syntax, suggestions };
}

function renderSuggestions(smartResult, query) {
  if (!cmdSuggestionsBox || !suggestionsList) return;
  const { syntax, suggestions } = smartResult || {};

  // Mise à jour de la barre de miniblocs syntaxiques
  if (cmdSyntaxBar && syntax) {
    let barHtml = `<span class="syntax-cmd">${escapeHtml(syntax.base || '/')}</span>`;
    if (syntax.chips && syntax.chips.length > 0) {
      barHtml += syntax.chips.map(chip => {
        const statusClass = chip.status || 'pending';
        return `<span class="syntax-chip ${statusClass}">${escapeHtml(chip.label)}</span>`;
      }).join('');
    }
    cmdSyntaxBar.innerHTML = barHtml;
  }

  if (!suggestions || suggestions.length === 0) {
    suggestionsList.innerHTML = `<div class="suggestions-tip" style="padding: 8px 10px; color: var(--text-dim); font-style: italic;">Aucune suggestion pour cet argument</div>`;
    cmdSuggestionsBox.style.display = 'flex';
    _selectedSuggestionIndex = -1;
    return;
  }

  suggestionsList.innerHTML = suggestions.map((s, idx) => `
    <div class="suggestion-item ${idx === _selectedSuggestionIndex ? 'active' : ''}" data-insert="${escapeHtml(s.insertText)}" data-index="${idx}">
      <span class="suggestion-cmd">${escapeHtml(s.displayCmd || s.insertText)}</span>
      <span class="suggestion-desc">${escapeHtml(s.desc || '')}</span>
    </div>
  `).join('');

  cmdSuggestionsBox.style.display = 'flex';

  suggestionsList.querySelectorAll('.suggestion-item').forEach((el, index) => {
    el.onmousedown = (e) => {
      e.preventDefault();
      applySuggestionItem(suggestions[index]);
    };
    el.onmouseenter = () => {
      _selectedSuggestionIndex = index;
      updateActiveSuggestionHighlight();
    };
  });
}

function updateActiveSuggestionHighlight() {
  if (!suggestionsList) return;
  const items = suggestionsList.querySelectorAll('.suggestion-item');
  items.forEach((item, idx) => {
    if (idx === _selectedSuggestionIndex) {
      item.classList.add('active');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('active');
    }
  });
}

function applySuggestionItem(sug) {
  if (!sug || !cmdInput) return;
  cmdInput.value = sug.insertText;
  cmdInput.focus();
  cmdInput.setSelectionRange(sug.insertText.length, sug.insertText.length);
  _selectedSuggestionIndex = -1;
  updateCommandSuggestions(cmdInput.value);
}

async function updateCommandSuggestions(query) {
  if (!cmdSuggestionsBox || !suggestionsList) return;
  const clean = query;

  const smartResult = computeCommandSmartSuggestions(clean);
  _currentSuggestionsList = smartResult.suggestions || [];

  if (smartResult && (smartResult.suggestions.length > 0 || (smartResult.syntax && smartResult.syntax.chips.length > 0))) {
    renderSuggestions(smartResult, query);
    return;
  }

  // Repli sur l'API backend si nécessaire
  const wid = selectedTerminalWorldId || activeWorld || '';
  try {
    const res = await fetch(`/api/worlds/command-suggestions?worldId=${encodeURIComponent(wid)}&q=${encodeURIComponent(clean.trim())}`);
    const data = await res.json();
    if (data.suggestions && data.suggestions.length > 0) {
      const formatted = data.suggestions.map(c => ({
        insertText: (query.startsWith('/') ? '/' : '') + c.cmd + ' ',
        displayCmd: (query.startsWith('/') ? '/' : '') + c.cmd,
        desc: c.desc,
        kind: 'command'
      }));
      _currentSuggestionsList = formatted;
      renderSuggestions({ syntax: { base: clean, chips: [] }, suggestions: formatted }, query);
      return;
    }
  } catch (e) { }

  cmdSuggestionsBox.style.display = 'none';
  _selectedSuggestionIndex = -1;
}

if (cmdInput) {
  cmdInput.addEventListener('input', (e) => {
    const val = e.target.value;
    _selectedSuggestionIndex = -1;
    clearTimeout(_suggestTimeout);
    _suggestTimeout = setTimeout(() => {
      updateCommandSuggestions(val);
    }, 20);
  });

  cmdInput.addEventListener('focus', () => {
    updateCommandSuggestions(cmdInput.value);
  });

  cmdInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (cmdSuggestionsBox) {
        cmdSuggestionsBox.style.display = 'none';
        _selectedSuggestionIndex = -1;
      }
    }, 180);
  });

  cmdInput.addEventListener('keydown', (e) => {
    const isBoxOpen = cmdSuggestionsBox && cmdSuggestionsBox.style.display !== 'none';
    const items = _currentSuggestionsList || [];

    if (e.key === 'ArrowDown') {
      if (isBoxOpen && items.length > 0) {
        e.preventDefault();
        _selectedSuggestionIndex = (_selectedSuggestionIndex + 1) % items.length;
        updateActiveSuggestionHighlight();
      } else if (!cmdInput.value) {
        e.preventDefault();
        updateCommandSuggestions('');
      }
    } else if (e.key === 'ArrowUp') {
      if (isBoxOpen && items.length > 0) {
        e.preventDefault();
        _selectedSuggestionIndex = (_selectedSuggestionIndex - 1 + items.length) % items.length;
        updateActiveSuggestionHighlight();
      } else {
        if (cmdHistory.length > 0) {
          e.preventDefault();
          if (cmdHistoryIndex === -1) cmdHistoryIndex = cmdHistory.length - 1;
          else if (cmdHistoryIndex > 0) cmdHistoryIndex--;
          cmdInput.value = cmdHistory[cmdHistoryIndex] || '';
          if (cmdSuggestionsBox) cmdSuggestionsBox.style.display = 'none';
        }
      }
    } else if (e.key === 'Tab') {
      if (isBoxOpen && items.length > 0) {
        e.preventDefault();
        const target = (_selectedSuggestionIndex >= 0 && items[_selectedSuggestionIndex])
          ? items[_selectedSuggestionIndex]
          : items[0];
        applySuggestionItem(target);
      }
    } else if (e.key === 'Escape') {
      if (isBoxOpen) {
        e.preventDefault();
        cmdSuggestionsBox.style.display = 'none';
        _selectedSuggestionIndex = -1;
      }
    } else if (e.key === 'Enter') {
      if (isBoxOpen && _selectedSuggestionIndex >= 0 && items[_selectedSuggestionIndex]) {
        e.preventDefault();
        applySuggestionItem(items[_selectedSuggestionIndex]);
      }
    }
  });
}

cmdForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const cmd = cmdInput.value.trim();
  if (!cmd) return;
  if (cmdSuggestionsBox) {
    cmdSuggestionsBox.style.display = 'none';
    _selectedSuggestionIndex = -1;
  }

  // Enregistrer dans l'historique
  if (cmdHistory.length === 0 || cmdHistory[cmdHistory.length - 1] !== cmd) {
    cmdHistory.push(cmd);
  }
  cmdHistoryIndex = -1;

  sendCommand(cmd);
  cmdInput.value = '';
});

// ----------------------------------------------------
// Modals & Creation
// ----------------------------------------------------
function openCreateModal() {
  if (globalDropOverlay) globalDropOverlay.classList.remove('visible');
  globalDragCounter = 0;
  const suggested = getSuggestedWorldName();
  if (vanillaName) vanillaName.placeholder = `ex: ${suggested}`;
  if (moddedName) moddedName.placeholder = `ex: ${suggested}`;
  const crossplayName = document.getElementById('crossplayName');
  if (crossplayName) crossplayName.placeholder = `ex: ${suggested}`;
  const importName = document.getElementById('importWorldName');
  if (importName) importName.placeholder = `ex: ${suggested}`;
  createModal.style.display = 'flex';
}
function closeCreateModal() {
  if (globalDropOverlay) globalDropOverlay.classList.remove('visible');
  globalDragCounter = 0;
  createModal.style.display = 'none';

  // 1. Réinitialisation Onglet Vanilla
  const vName = document.getElementById('vanillaName');
  const vSeed = document.getElementById('vanillaSeed');
  const vOff = document.getElementById('vanillaOffline');
  const vVer = document.getElementById('vanillaVersion');
  if (vName) vName.value = '';
  if (vSeed) vSeed.value = '';
  if (vOff) vOff.checked = false;
  if (vVer && vVer.options.length > 0) vVer.selectedIndex = 0;

  // 1b. Réinitialisation Onglet Crossplay
  const cName = document.getElementById('crossplayName');
  const cSeed = document.getElementById('crossplaySeed');
  const cOff = document.getElementById('crossplayOffline');
  const cVer = document.getElementById('crossplayVersion');
  if (cName) cName.value = '';
  if (cSeed) cSeed.value = '';
  if (cOff) cOff.checked = false;
  if (cVer && cVer.options.length > 0) cVer.selectedIndex = 0;

  // 2. Réinitialisation Onglet Moddé
  const mName = document.getElementById('moddedName');
  const mSeed = document.getElementById('moddedSeed');
  const mOff = document.getElementById('moddedOffline');
  const mVer = document.getElementById('moddedVersion');
  const mLoader = document.getElementById('moddedLoader');
  if (mName) mName.value = '';
  if (mSeed) mSeed.value = '';
  if (mOff) mOff.checked = false;
  if (mVer && mVer.options.length > 0) mVer.selectedIndex = 0;
  if (mLoader) mLoader.value = 'fabric';

  const dropTitle = document.getElementById('dropTitle');
  if (dropTitle) dropTitle.textContent = 'Cliquez pour parcourir ou déposez vos fichiers mods ici';
  const dropZone = document.getElementById('dropZone');
  if (dropZone) dropZone.classList.remove('dragover', 'is-loading');
  const modpackFileInput = document.getElementById('modpackFileInput');
  if (modpackFileInput) modpackFileInput.value = '';

  const progCard = document.getElementById('modAnalysisProgressCard');
  if (progCard) progCard.style.display = 'none';
  if (analysisResults) analysisResults.style.display = 'none';

  const cfgRow = document.getElementById('modConfigRow');
  if (cfgRow) cfgRow.style.display = 'none';
  const detVBadge = document.getElementById('detectedVerBadge');
  const detLBadge = document.getElementById('detectedLoaderBadge');
  if (detVBadge) detVBadge.style.display = 'none';
  if (detLBadge) detLBadge.style.display = 'none';

  const exclUl = document.getElementById('excludedModsList');
  if (exclUl) exclUl.innerHTML = '';
  const srvUl = document.getElementById('serverModsList');
  if (srvUl) srvUl.innerHTML = '';
  const searchInput = document.getElementById('modSearchInput');
  if (searchInput) searchInput.value = '';
  const btnKeepAll = document.getElementById('btnToggleKeepAllMods');
  if (btnKeepAll) {
    btnKeepAll.textContent = 'Conserver tous les mods';
    btnKeepAll.classList.remove('is-active');
  }
  const tabSrvB = document.getElementById('tabServerModsBadge');
  const tabCliB = document.getElementById('tabClientModsBadge');
  if (tabSrvB) tabSrvB.textContent = '0';
  if (tabCliB) tabCliB.textContent = '0';
  currentAnalysis = null;
  activeSelectedMods.clear();
  isKeepAllModsActive = false;
  switchModsListTab('server');

  const srvC = document.getElementById('serverModsCount');
  const cliC = document.getElementById('clientModsCount');
  if (srvC) srvC.textContent = '0';
  if (cliC) cliC.textContent = '0';

  if (btnSubmitModded) btnSubmitModded.disabled = true;
  currentAnalysis = null;
  uploadedFilePath = null;
  uploadedLocalModsPaths = null;
  hideModLoadingProgress();

  // 3. Réinitialisation Onglet Charger Sauvegarde
  const impName = document.getElementById('importWorldName');
  if (impName) impName.value = '';
  const impDropTitle = document.getElementById('importDropTitle');
  if (impDropTitle) impDropTitle.textContent = 'Cliquez pour parcourir ou déposez votre dossier ou archive .zip ici';
  const impDropZone = document.getElementById('importDropZone');
  if (impDropZone) impDropZone.classList.remove('dragover');
  const impFolderInput = document.getElementById('importFolderInput');
  if (impFolderInput) impFolderInput.value = '';
  const impFileInput = document.getElementById('importFileInput');
  if (impFileInput) impFileInput.value = '';
  const impBadge = document.getElementById('importDetectedBadge');
  if (impBadge) {
    impBadge.className = 'auto-detected-badge';
    impBadge.innerHTML = '';
  }
  const btnSubmitImport = document.getElementById('btnSubmitImport');
  if (btnSubmitImport) btnSubmitImport.disabled = true;
  uploadedImportFiles = null;
  uploadedImportStagedPath = null;
  uploadedImportLocalPath = null;
  detectedImportLauncher = 'Vanilla';
  detectedImportVersion = '1.21.1';
  detectedImportType = 'vanilla';
}

btnOpenCreateModal.addEventListener('click', openCreateModal);
btnCloseCreateModal.addEventListener('click', closeCreateModal);
btnCancelVanilla.addEventListener('click', closeCreateModal);
btnCancelModded.addEventListener('click', closeCreateModal);
const btnCancelImport = document.getElementById('btnCancelImport');
if (btnCancelImport) btnCancelImport.addEventListener('click', closeCreateModal);
const btnCancelCrossplay = document.getElementById('btnCancelCrossplay');
if (btnCancelCrossplay) btnCancelCrossplay.addEventListener('click', closeCreateModal);
if (createModal) {
  createModal.addEventListener('click', (e) => {
    if (e.target === createModal) closeCreateModal();
  });
}

function switchToCreateTab(targetTab) {
  tabButtons.forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === targetTab);
  });
  tabPanes.forEach(p => {
    p.classList.toggle('active', p.id === targetTab);
  });
}

// Tabs switch
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-tab');
    if (target) switchToCreateTab(target);
  });
});

// ----------------------------------------------------
// Modal de Progression de Création
// ----------------------------------------------------
function openProgressModal(worldName, type) {
  if (!createProgressModal) return;
  createProgressModal.style.display = 'flex';
  if (progressModalTitle) progressModalTitle.textContent = `Création de '${worldName}'`;
  if (progressModalSubtitle) {
    progressModalSubtitle.textContent = type === 'modded'
      ? 'Configuration et déploiement du serveur moddé...'
      : (type === 'crossplay'
        ? 'Téléchargement de PaperMC et du pont Bedrock (GeyserMC)...'
        : 'Téléchargement du serveur officiel Mojang...');
  }
  if (progressBarFill) progressBarFill.style.width = '0%';
  if (progressPctText) progressPctText.textContent = '0%';
  if (progressStepText) progressStepText.textContent = 'Initialisation...';
  if (progressModalSpinner) progressModalSpinner.style.display = 'block';
  if (progressSuccessIcon) progressSuccessIcon.style.display = 'none';
  if (progressErrorIcon) progressErrorIcon.style.display = 'none';
  if (progressModalFooter) progressModalFooter.style.display = 'none';
}

function updateProgressModal(progress, msg) {
  if (!createProgressModal || createProgressModal.style.display === 'none') return;
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  if (progressBarFill) progressBarFill.style.width = `${pct}%`;
  if (progressPctText) progressPctText.textContent = `${pct}%`;
  if (msg && progressStepText) progressStepText.textContent = msg;

  if (pct >= 100) {
    if (progressModalTitle) progressModalTitle.textContent = 'Monde créé avec succès !';
    if (progressModalSubtitle) progressModalSubtitle.textContent = 'Le serveur est configuré et prêt à être lancé.';
    if (progressModalSpinner) progressModalSpinner.style.display = 'none';
    if (progressSuccessIcon) progressSuccessIcon.style.display = 'flex';
    setTimeout(() => {
      closeProgressModal();
      fetchWorlds();
    }, 1600);
  }
}

function setProgressError(errorMsg) {
  if (!createProgressModal) return;
  if (progressModalTitle) progressModalTitle.textContent = 'Échec de la création';
  if (progressModalSubtitle) progressModalSubtitle.textContent = errorMsg || 'Une erreur est survenue lors de la création.';
  if (progressModalSpinner) progressModalSpinner.style.display = 'none';
  if (progressErrorIcon) progressErrorIcon.style.display = 'flex';
  if (progressModalFooter) progressModalFooter.style.display = 'block';
}

function closeProgressModal() {
  if (createProgressModal) {
    createProgressModal.style.display = 'none';
  }
  if (lastCreatedWorldIdToScroll) {
    const targetId = lastCreatedWorldIdToScroll;
    lastCreatedWorldIdToScroll = null;
    scrollWorldCardIntoView(targetId);
  }
}

if (btnCloseProgressModal) {
  btnCloseProgressModal.addEventListener('click', () => {
    closeProgressModal();
    fetchWorlds();
  });
}

// Guide déroulant Crossplay (accordeon discret et professionnel)
const btnToggleGuide = document.getElementById("btnToggleCrossplayGuide");
const guideDrawer = document.getElementById("crossplayGuideDrawer");
if (btnToggleGuide && guideDrawer) {
  btnToggleGuide.addEventListener("click", () => {
    const isOpen = guideDrawer.classList.toggle("open");
    btnToggleGuide.classList.toggle("expanded", isOpen);
  });
}

// Création Vanilla
formCreateVanilla.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = vanillaName.value.trim() || getSuggestedWorldName();
  const version = vanillaVersion.value;
  const seed = (document.getElementById('vanillaSeed')?.value || '').trim();
  const offline = !!document.getElementById('vanillaOffline')?.checked;

  closeCreateModal();
  openProgressModal(name, 'vanilla');

  try {
    const res = await fetch('/api/worlds/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        type: 'vanilla',
        version,
        seed,
        offline
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur création');
    queueFocusCreatedWorld(data, name);
    updateProgressModal(100, `Monde Vanilla ${name} prêt !`);
  } catch (err) {
    setProgressError(err.message);
    showToast(err.message, 'error');
  }
});

// Création Crossplay (Bedrock & Java)
const formCreateCrossplay = document.getElementById('formCreateCrossplay');
if (formCreateCrossplay) {
  formCreateCrossplay.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('crossplayName');
    const name = nameInput ? (nameInput.value.trim() || getSuggestedWorldName()) : getSuggestedWorldName();
    const version = document.getElementById('crossplayVersion')?.value || '1.21.1';
    const seed = (document.getElementById('crossplaySeed')?.value || '').trim();
    const offline = !!document.getElementById('crossplayOffline')?.checked;

    closeCreateModal();
    openProgressModal(name, 'crossplay');

    try {
      const res = await fetch('/api/worlds/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type: 'crossplay',
          version,
          seed,
          offline
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur création serveur crossplay');
      queueFocusCreatedWorld(data, name);
      updateProgressModal(100, `Serveur Crossplay ${name} prêt !`);
    } catch (err) {
      setProgressError(err.message);
      showToast(err.message, 'error');
    }
  });
}

// ----------------------------------------------------
// Modpack & Mods Import Handling
// ----------------------------------------------------

// Parcourt récursivement les dossiers ou fichiers déposés
async function collectFilesFromDataTransfer(dataTransfer) {
  const resultFiles = [];
  const items = dataTransfer.items;

  async function traverseEntry(entry) {
    if (!entry) return;
    if (entry.isFile) {
      await new Promise(resolve => {
        entry.file(file => {
          if (file && (file.name.toLowerCase().endsWith('.jar') || file.name.toLowerCase().endsWith('.zip') || file.name.toLowerCase().endsWith('.mrpack'))) {
            resultFiles.push(file);
          }
          resolve();
        }, () => resolve());
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const readAllEntries = async () => {
        return new Promise(resolve => {
          dirReader.readEntries(async (entries) => {
            if (!entries || entries.length === 0) {
              resolve();
            } else {
              for (const child of entries) {
                await traverseEntry(child);
              }
              await readAllEntries();
              resolve();
            }
          }, () => resolve());
        });
      };
      await readAllEntries();
    }
  }

  if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) {
        await traverseEntry(entry);
      }
    }
  }

  // Repli classique
  if (resultFiles.length === 0 && dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const f = dataTransfer.files[i];
      if (f.name.toLowerCase().endsWith('.jar') || f.name.toLowerCase().endsWith('.zip') || f.name.toLowerCase().endsWith('.mrpack')) {
        resultFiles.push(f);
      }
    }
  }

  return resultFiles;
}

// ----------------------------------------------------
// Indicateur d'avancement du chargement et du tri des mods
// ----------------------------------------------------
const modAnalysisProgressCard = document.getElementById('modAnalysisProgressCard');
const modProgressSpinner = document.getElementById('modProgressSpinner');
const modProgressTitle = document.getElementById('modProgressTitle');
const modProgressSubtitle = document.getElementById('modProgressSubtitle');
const modProgressPct = document.getElementById('modProgressPct');
const modProgressBar = document.getElementById('modProgressBar');
const modProgressDetail = document.getElementById('modProgressDetail');
const modProgressCount = document.getElementById('modProgressCount');

function showModLoadingProgress(title, subtitle, detail) {
  if (!modAnalysisProgressCard) return;
  modAnalysisProgressCard.style.display = 'block';
  modAnalysisProgressCard.classList.remove('is-done');
  if (modProgressTitle) modProgressTitle.textContent = title || 'Chargement et tri des mods...';
  if (modProgressSubtitle) modProgressSubtitle.textContent = subtitle || 'Préparation du transfert';
  if (modProgressDetail) modProgressDetail.textContent = detail || 'Tri intelligent des mods serveur et exclusion des mods client';
  if (modProgressCount) modProgressCount.textContent = '';
  if (modProgressBar) modProgressBar.style.width = '0%';
  if (modProgressPct) modProgressPct.textContent = '0%';
  if (dropZone) dropZone.classList.add('is-loading');
  if (btnSubmitModded) btnSubmitModded.setAttribute('disabled', 'true');
}

function updateModLoadingProgress(pct, subtitle, countOrDetail) {
  if (!modAnalysisProgressCard || modAnalysisProgressCard.style.display === 'none') {
    showModLoadingProgress();
  }
  const cleanPct = Math.min(100, Math.max(0, Math.round(pct)));
  if (modProgressBar) modProgressBar.style.width = `${cleanPct}%`;
  if (modProgressPct) modProgressPct.textContent = `${cleanPct}%`;
  if (subtitle && modProgressSubtitle) modProgressSubtitle.textContent = subtitle;
  if (countOrDetail && modProgressCount) modProgressCount.textContent = countOrDetail;
}

function finishModLoadingProgress(message) {
  if (!modAnalysisProgressCard) return;
  modAnalysisProgressCard.classList.add('is-done');
  if (modProgressBar) modProgressBar.style.width = '100%';
  if (modProgressPct) modProgressPct.textContent = '100%';
  if (modProgressSubtitle) modProgressSubtitle.textContent = message || 'Tri terminé avec succès !';
  if (dropZone) dropZone.classList.remove('is-loading');
  setTimeout(() => {
    modAnalysisProgressCard.style.display = 'none';
    modAnalysisProgressCard.classList.remove('is-done');
  }, 1600);
}

function hideModLoadingProgress() {
  if (modAnalysisProgressCard) {
    modAnalysisProgressCard.style.display = 'none';
    modAnalysisProgressCard.classList.remove('is-done');
  }
  if (dropZone) dropZone.classList.remove('is-loading');
}

// Envoi et analyse des fichiers de mods avec suivi d'avancement précis
async function uploadAndAnalyzeFiles(files) {
  if (!files || files.length === 0) {
    showToast('Aucun fichier mod détecté dans la sélection.', 'warning');
    return;
  }

  const count = files.length;
  let totalBytes = 0;
  for (const f of files) totalBytes += (f.size || 0);
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);

  showModLoadingProgress(
    `Chargement et tri de ${count} mod(s)...`,
    `Envoi des fichiers vers le serveur (0 / ${totalMb} Mo)...`,
    `Séparation intelligente : mods serveur vs visuels client`
  );

  const formData = new FormData();
  for (const file of files) {
    formData.append('mods', file, file.name);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/mods/upload', true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const uploadPct = Math.round((e.loaded / e.total) * 100);
        const overall = Math.round(uploadPct * 0.35); // 0% à 35% de la progression globale
        const loadedMb = (e.loaded / (1024 * 1024)).toFixed(1);
        updateModLoadingProgress(
          overall,
          `Envoi des fichiers : ${loadedMb} Mo / ${totalMb} Mo (${uploadPct}%)`,
          `${count} mod(s) en transfert`
        );
      }
    };

    xhr.upload.onload = () => {
      updateModLoadingProgress(
        35,
        `Envoi terminé ! Début du tri et de l'analyse des mods...`,
        `${count} mod(s) reçus`
      );
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          finishModLoadingProgress(`Tri terminé : ${data.analysis?.totalCount || count} mods analysés !`);
          applyAnalysisResult(data.analysis, data.uploadedFile, data.originalFilename);
          showToast(`Tri terminé : ${data.analysis?.totalCount || count} mods inspectés avec succès.`, 'success');
          resolve(data);
        } catch (err) {
          hideModLoadingProgress();
          showToast('Erreur de lecture du résultat d\'analyse.', 'error');
          reject(err);
        }
      } else {
        let errMessage = 'Erreur lors de l\'analyse des mods.';
        try {
          const errData = JSON.parse(xhr.responseText);
          if (errData.error) errMessage = errData.error;
        } catch (_) { }
        hideModLoadingProgress();
        showToast(errMessage, 'error');
        dropTitle.textContent = 'Déposez votre dossier "mods", vos fichiers .jar ou un ZIP';
        reject(new Error(errMessage));
      }
    };

    xhr.onerror = () => {
      hideModLoadingProgress();
      showToast('Erreur réseau lors de l\'envoi des mods.', 'error');
      dropTitle.textContent = 'Déposez votre dossier "mods", vos fichiers .jar ou un ZIP';
      reject(new Error('Erreur réseau'));
    };

    xhr.send(formData);
  });
}

// Analyse directe par chemin local macOS avec indicateur d'avancement
async function analyzeLocalPath(sourcePath) {
  if (!sourcePath || !sourcePath.trim()) {
    showToast('Veuillez entrer un chemin de dossier valide.', 'warning');
    return;
  }

  showModLoadingProgress(
    `Analyse du dossier local...`,
    `Inspection de ${sourcePath.trim()}...`,
    `Tri intelligent en temps réel`
  );

  try {
    const res = await fetch('/api/mods/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath: sourcePath.trim() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Dossier introuvable');

    finishModLoadingProgress(`Tri terminé : ${data.analysis?.totalCount || 0} mods analysés !`);
    applyAnalysisResult(data.analysis, data.sourcePath, sourcePath.trim());
    showToast(`Tri terminé : ${data.analysis?.totalCount || 0} mods inspectés avec succès.`, 'success');
  } catch (err) {
    hideModLoadingProgress();
    showToast('Erreur: ' + err.message, 'error');
  }
}

let activeSelectedMods = new Set();
let isKeepAllModsActive = false;
let currentModsTab = 'server';

window.switchModsListTab = function (tab) {
  currentModsTab = tab;
  const wrapServer = document.getElementById('wrapServerModsList');
  const wrapClient = document.getElementById('wrapExcludedModsList');
  const btnTabServer = document.getElementById('btnTabServerMods');
  const btnTabClient = document.getElementById('btnTabClientMods');
  const boxServer = document.getElementById('boxServerMods');
  const boxClient = document.getElementById('boxClientMods');

  if (tab === 'server') {
    if (wrapServer) wrapServer.style.display = 'block';
    if (wrapClient) wrapClient.style.display = 'none';
    if (btnTabServer) btnTabServer.classList.add('active');
    if (btnTabClient) btnTabClient.classList.remove('active');
    if (boxServer) boxServer.style.borderColor = 'var(--accent-green)';
    if (boxClient) boxClient.style.borderColor = '';
  } else {
    if (wrapServer) wrapServer.style.display = 'none';
    if (wrapClient) wrapClient.style.display = 'block';
    if (btnTabServer) btnTabServer.classList.remove('active');
    if (btnTabClient) btnTabClient.classList.add('active');
    if (boxClient) boxClient.style.borderColor = 'var(--accent-amber)';
    if (boxServer) boxServer.style.borderColor = '';
  }
};

window.toggleKeepAllMods = function () {
  if (!currentAnalysis) return;
  const allMods = [...(currentAnalysis.serverMods || []), ...(currentAnalysis.clientOnlyMods || [])];
  const btn = document.getElementById('btnToggleKeepAllMods');

  isKeepAllModsActive = !isKeepAllModsActive;
  if (isKeepAllModsActive) {
    activeSelectedMods = new Set(allMods.map(m => m.filename));
    if (btn) {
      btn.textContent = 'Rétablir le filtrage recommandé';
      btn.classList.add('is-active');
    }
    showToast(`Tous les mods (${allMods.length}) seront conservés et installés sur le serveur.`, 'info');
  } else {
    activeSelectedMods = new Set((currentAnalysis.serverMods || []).map(m => m.filename));
    if (btn) {
      btn.textContent = 'Conserver tous les mods';
      btn.classList.remove('is-active');
    }
    showToast('Filtrage intelligent recommandé réactivé.', 'info');
  }
  renderModsInteractiveLists();
};

window.toggleModSelection = function (filename, shouldInclude) {
  if (!currentAnalysis) return;
  if (shouldInclude) {
    activeSelectedMods.add(filename);
    showToast(`Mod "${filename}" ajouté aux mods serveur.`, 'success');
  } else {
    activeSelectedMods.delete(filename);
    showToast(`Mod "${filename}" retiré des mods serveur.`, 'info');
  }
  renderModsInteractiveLists();
};

window.filterModsListDisplay = function () {
  renderModsInteractiveLists();
};

function renderModsInteractiveLists() {
  if (!currentAnalysis) return;
  const allMods = [...(currentAnalysis.serverMods || []), ...(currentAnalysis.clientOnlyMods || [])];
  const searchInput = document.getElementById('modSearchInput');
  const query = (searchInput?.value || '').trim().toLowerCase();

  const serverUl = document.getElementById('serverModsList');
  const clientUl = document.getElementById('excludedModsList');

  const retainedMods = [];
  const excludedMods = [];

  for (const mod of allMods) {
    if (activeSelectedMods.has(mod.filename)) {
      retainedMods.push(mod);
    } else {
      excludedMods.push(mod);
    }
  }

  // Mise à jour des compteurs et badges
  const serverCountEl = document.getElementById('serverModsCount');
  const clientCountEl = document.getElementById('clientModsCount');
  const tabServerBadge = document.getElementById('tabServerModsBadge');
  const tabClientBadge = document.getElementById('tabClientModsBadge');

  if (serverCountEl) serverCountEl.textContent = retainedMods.length;
  if (clientCountEl) clientCountEl.textContent = excludedMods.length;
  if (tabServerBadge) tabServerBadge.textContent = retainedMods.length;
  if (tabClientBadge) tabClientBadge.textContent = excludedMods.length;

  const filteredRetained = query
    ? retainedMods.filter(m => (m.modName || '').toLowerCase().includes(query) || m.filename.toLowerCase().includes(query))
    : retainedMods;

  const filteredExcluded = query
    ? excludedMods.filter(m => (m.modName || '').toLowerCase().includes(query) || m.filename.toLowerCase().includes(query))
    : excludedMods;

  if (serverUl) {
    if (filteredRetained.length === 0) {
      serverUl.innerHTML = '<li class="mods-empty-hint">' + (query ? 'Aucun mod correspondant à la recherche' : 'Aucun mod sélectionné pour le serveur') + '</li>';
    } else {
      serverUl.innerHTML = filteredRetained.map(m => `
        <li class="mods-item">
          <span class="mods-item-name" title="${escapeHtml(m.filename)}">${escapeHtml(m.modName || m.filename)}</span>
          <div class="mods-item-actions">
            <span class="mod-reason-tag server">Serveur</span>
            <button type="button" class="mods-btn-action exclude" onclick="toggleModSelection('${escapeHtml(m.filename).replace(/'/g, "\\'")}', false)">Exclure</button>
          </div>
        </li>
      `).join('');
    }
  }

  if (clientUl) {
    if (filteredExcluded.length === 0) {
      clientUl.innerHTML = '<li class="mods-empty-hint">' + (query ? 'Aucun mod exclu correspondant à la recherche' : 'Tous les mods sont actuellement inclus sur le serveur !') + '</li>';
    } else {
      clientUl.innerHTML = filteredExcluded.map(m => `
        <li class="mods-item">
          <span class="mods-item-name" title="${escapeHtml(m.filename)}">${escapeHtml(m.modName || m.filename)}</span>
          <div class="mods-item-actions">
            <span class="mod-reason-tag" title="${escapeHtml(m.reason || '')}">${escapeHtml(m.reason || 'Client')}</span>
            <button type="button" class="mods-btn-action include" onclick="toggleModSelection('${escapeHtml(m.filename).replace(/'/g, "\\'")}', true)">Ajouter au serveur</button>
          </div>
        </li>
      `).join('');
    }
  }

  if (btnSubmitModded) {
    btnSubmitModded.disabled = retainedMods.length === 0;
  }
}

// Application des résultats d'analyse sur l'interface
function applyAnalysisResult(analysis, sourcePath, label) {
  try {
    currentAnalysis = analysis;
    uploadedFilePath = sourcePath;

    if (dropTitle) {
      dropTitle.textContent = `Prêt : ${label} (${analysis?.totalCount || 0} mods détectés)`;
    }

    // Affichage du panneau de configuration de version & loader avec gap soigné
    if (modConfigRow) {
      modConfigRow.style.display = 'flex';
    }

    if (analysis && analysis.detectedMcVersion) {
      const opt = Array.from(moddedVersion.options).find(o => o.value === analysis.detectedMcVersion);
      if (opt) {
        moddedVersion.value = analysis.detectedMcVersion;
      } else {
        const newOpt = document.createElement('option');
        newOpt.value = analysis.detectedMcVersion;
        newOpt.textContent = `${analysis.detectedMcVersion} (Détectée des mods)`;
        newOpt.selected = true;
        moddedVersion.prepend(newOpt);
      }
      if (detectedVerBadge) {
        detectedVerBadge.textContent = `${analysis.detectedMcVersion} Détectée`;
        detectedVerBadge.style.display = 'inline-block';
      }
    }

    if (analysis && analysis.detectedLoader) {
      const lValue = analysis.detectedLoader.toLowerCase();
      const loaderOpt = Array.from(moddedLoader.options).find(o => o.value.toLowerCase() === lValue);
      if (loaderOpt) {
        moddedLoader.value = loaderOpt.value;
      }
      if (detectedLoaderBadge) {
        detectedLoaderBadge.textContent = `${analysis.detectedLoader.toUpperCase()} Détecté`;
        detectedLoaderBadge.style.display = 'inline-block';
      }
    }

    // Initialisation de la sélection interactive des mods
    const allMods = [...(analysis?.serverMods || []), ...(analysis?.clientOnlyMods || [])];
    const btnKeepAll = document.getElementById('btnToggleKeepAllMods');
    if (analysis && analysis.isServerPack) {
      // Dans un Pack Serveur officiel, tous les mods sont conservés d'emblée
      activeSelectedMods = new Set(allMods.map(m => m.filename));
      isKeepAllModsActive = true;
      if (btnKeepAll) {
        btnKeepAll.textContent = 'Rétablir le filtrage recommandé';
        btnKeepAll.classList.add('is-active');
      }
    } else {
      activeSelectedMods = new Set((analysis?.serverMods || []).map(m => m.filename));
      isKeepAllModsActive = false;
      if (btnKeepAll) {
        btnKeepAll.textContent = 'Conserver tous les mods';
        btnKeepAll.classList.remove('is-active');
      }
    }

    // Résultats du filtrage serveur / client
    if (analysisResults) {
      analysisResults.style.display = 'block';
    }

    renderModsInteractiveLists();
    switchModsListTab('server');

    if (btnSubmitModded) {
      btnSubmitModded.disabled = false;
    }
    showToast(`Analyse réussie : ${activeSelectedMods.size} mods serveur retenus sur ${allMods.length}.`, 'success');
  } catch (err) {
    console.error('Erreur applyAnalysisResult:', err);
    showToast('Erreur affichage mods: ' + err.message, 'error');
  }
}

// Réception des chemins choisis dans le Finder via le bridge natif Cocoa
let uploadedLocalModsPaths = null;
window.onModsPathsChosen = function (paths) {
  if (!paths || paths.length === 0) return;
  uploadedLocalModsPaths = paths;

  const count = paths.length;
  showModLoadingProgress(
    `Chargement et tri des mods...`,
    `Lecture de ${count} élément(s)...`,
    `Séparation intelligente : mods serveur vs visuels client`
  );

  fetch('/api/mods/analyze-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths })
  })
    .then(async (r) => {
      let data;
      try {
        data = await r.json();
      } catch (parseErr) {
        throw new Error('Réponse invalide du serveur (code ' + r.status + ')');
      }
      if (!r.ok || data.error) {
        throw new Error(data.error || 'Erreur HTTP ' + r.status);
      }
      return data;
    })
    .then(data => {
      finishModLoadingProgress(`Tri terminé : ${data.analysis?.totalCount || count} mods analysés !`);
      applyAnalysisResult(data.analysis, data.uploadedFile, data.originalFilename);
    })
    .catch(err => {
      hideModLoadingProgress();
      showToast('Erreur lors de l\'analyse des mods : ' + (err.message || 'Erreur inconnue'), 'error');
    });
};

// Clic direct sur la zone d'importation -> ouvre le Finder nativement ou le sélecteur HTML
dropZone.addEventListener('click', (e) => {
  if (e.target === modpackFileInput) return;

  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.chooseModsPath) {
    try {
      window.webkit.messageHandlers.chooseModsPath.postMessage({});
      return;
    } catch (err) {
      console.warn('Erreur bridge chooseModsPath:', err);
    }
  }
  modpackFileInput.click();
});

// Drag & Drop Listeners
dropZone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', (e) => {
  e.stopPropagation();
  dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('dragover');
  if (dropZone.classList.contains('is-loading')) return;
  showToast('Exploration des éléments glissés...', 'info');
  const files = await collectFilesFromDataTransfer(e.dataTransfer);
  uploadAndAnalyzeFiles(files);
});

// Écouteur sur sélection directe de fichiers HTML (fallback web)
modpackFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    const valid = Array.from(e.target.files).filter(f =>
      f.name.toLowerCase().endsWith('.jar') ||
      f.name.toLowerCase().endsWith('.zip') ||
      f.name.toLowerCase().endsWith('.mrpack')
    );
    uploadAndAnalyzeFiles(valid);
  }
});

// Création Moddé
formCreateModded.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = moddedName.value.trim() || getSuggestedWorldName();
  if (!uploadedFilePath) {
    showToast('Veuillez ajouter des fichiers mods ou une archive.', 'warning');
    return;
  }

  const version = moddedVersion.value;
  const loader = moddedLoader.value;
  const seed = (document.getElementById('moddedSeed')?.value || '').trim();
  const offline = !!document.getElementById('moddedOffline')?.checked;
  const sourcePathToDeploy = uploadedFilePath;

  const selectedModsList = Array.from(activeSelectedMods);

  closeCreateModal();
  openProgressModal(name, 'modded');

  try {
    const res = await fetch('/api/worlds/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        type: 'modded',
        version,
        loader,
        sourcePath: sourcePathToDeploy,
        seed,
        offline,
        selectedMods: selectedModsList,
        keepAllMods: !!isKeepAllModsActive
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur création monde moddé');
    queueFocusCreatedWorld(data, name);
    updateProgressModal(100, `Monde moddé ${name} créé avec succès !`);
  } catch (err) {
    setProgressError(err.message);
    showToast(err.message, 'error');
  }
});

// ----------------------------------------------------
// Import Sauvegarde / Archive Zip
// ----------------------------------------------------
let uploadedImportFiles = [];
let uploadedImportStagedPath = null;
let uploadedImportLocalPath = null;
let detectedImportVersion = '1.21.1';
let detectedImportLauncher = 'Vanilla';
let detectedImportType = 'vanilla';

const importDropZone = document.getElementById('importDropZone');
const importFileInput = document.getElementById('importFileInput');
const importFolderInput = document.getElementById('importFolderInput');
const importDropTitle = document.getElementById('importDropTitle');
const btnSubmitImport = document.getElementById('btnSubmitImport');
const formImportWorld = document.getElementById('formImportWorld');

// Réception du chemin choisi dans le Finder via le bridge natif Cocoa
window.onImportPathChosen = function (localPath) {
  if (!localPath) return;
  uploadedImportLocalPath = localPath;
  uploadedImportStagedPath = localPath;
  uploadedImportFiles = [{ name: localPath.split('/').filter(Boolean).pop() }];

  const isZip = localPath.toLowerCase().endsWith('.zip');
  const baseName = localPath.split('/').filter(Boolean).pop().replace(/\.zip$/i, '');

  if (importDropTitle) {
    importDropTitle.textContent = isZip ? `Archive prête : ${baseName}.zip` : `Dossier prêt : ${baseName}`;
  }

  const nameInput = document.getElementById('importWorldName');
  if (nameInput) {
    nameInput.value = baseName;
  }

  if (btnSubmitImport) btnSubmitImport.setAttribute('disabled', 'true');
  if (importDropZone) importDropZone.classList.add('is-loading');

  const badge = document.getElementById('importDetectedBadge');
  if (badge) {
    badge.className = 'auto-detected-badge visible';
    badge.innerHTML = `
      <div class="action-spinner"></div>
      <span>Analyse du monde et détection du lanceur...</span>
    `;
  }

  fetch('/api/worlds/inspect-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: localPath })
  })
    .then(r => r.json())
    .then(data => {
      if (importDropZone) importDropZone.classList.remove('is-loading');
      if (data.success && badge) {
        detectedImportVersion = data.version || '1.21.1';
        detectedImportLauncher = data.launcher || 'Vanilla';
        detectedImportType = data.type || 'vanilla';
        uploadedImportStagedPath = data.uploadedPath || localPath;

        badge.className = 'auto-detected-badge visible';
        badge.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <div>
            <strong>${escapeHtml(detectedImportLauncher)}</strong> détecté pour Minecraft <strong>${escapeHtml(detectedImportVersion)}</strong>
            ${data.modsCount ? `<br><small style="color: #94a3b8;">${data.modsCount} mod(s) inclus</small>` : ''}
          </div>
        `;

        if (nameInput && (!nameInput.value.trim() || nameInput.value.startsWith('Mon-Monde') || nameInput.value === 'monde-importe')) {
          if (data.suggestedName) {
            nameInput.value = data.suggestedName;
          }
        }
        if (btnSubmitImport) btnSubmitImport.removeAttribute('disabled');
      } else {
        if (badge) {
          badge.className = 'auto-detected-badge visible';
          badge.innerHTML = `<span style="color: #ef4444;">${escapeHtml(data.error || 'Erreur lors de l\'analyse')}</span>`;
        }
        if (btnSubmitImport) btnSubmitImport.setAttribute('disabled', 'true');
      }
    })
    .catch(err => {
      console.warn('Erreur détection monde local:', err);
      if (importDropZone) importDropZone.classList.remove('is-loading');
      if (badge) {
        badge.className = 'auto-detected-badge visible';
        badge.innerHTML = `<span style="color: #ef4444;">Échec d'analyse (${escapeHtml(err.message)})</span>`;
      }
      if (btnSubmitImport) btnSubmitImport.setAttribute('disabled', 'true');
    });
};

if (importDropZone) {
  // Clic sur la zone de dépôt : ouvre directement le Finder nativement ou le sélecteur HTML
  importDropZone.addEventListener('click', (e) => {
    if (e.target === importFileInput || e.target === importFolderInput) return;

    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.chooseImportPath) {
      try {
        window.webkit.messageHandlers.chooseImportPath.postMessage({});
        return;
      } catch (err) {
        console.warn('Erreur bridge chooseImportPath:', err);
      }
    }
    importFileInput?.click();
  });

  importDropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    importDropZone.classList.add('dragover');
  });

  importDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    importDropZone.classList.add('dragover');
  });

  importDropZone.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    importDropZone.classList.remove('dragover');
  });

  importDropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    importDropZone.classList.remove('dragover');
    if (globalDropOverlay) globalDropOverlay.classList.remove('visible');
    globalDragCounter = 0;
    if (importDropZone.classList.contains('is-loading')) return;

    const dtFiles = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (dtFiles.length > 0 && dtFiles[0].path) {
      handleImportFilesReceived(dtFiles);
      return;
    }

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const files = await traverseDataTransferItems(items);
      if (files.length > 0) {
        handleImportFilesReceived(files);
        return;
      }
    }

    if (dtFiles.length > 0) {
      handleImportFilesReceived(dtFiles);
    }
  });

  importFileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleImportFilesReceived(Array.from(e.target.files));
    }
  });

  importFolderInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleImportFilesReceived(Array.from(e.target.files));
    }
  });
}

// ----------------------------------------------------
// Global Drag & Drop pour l'import direct de monde dans toute l'application
// ----------------------------------------------------
let globalDragCounter = 0;
const globalDropOverlay = document.getElementById('globalDropOverlay');

function isAnyModalOpen() {
  const backdrops = document.querySelectorAll('.modal-backdrop, .welcome-overlay');
  for (const b of backdrops) {
    if (b.style.display && b.style.display !== 'none') {
      return true;
    }
  }
  const createModalEl = document.getElementById('createModal');
  if (createModalEl && createModalEl.style.display && createModalEl.style.display !== 'none') {
    return true;
  }
  return false;
}

window.addEventListener('dragenter', (e) => {
  if (isAnyModalOpen()) {
    if (globalDropOverlay) globalDropOverlay.classList.remove('visible');
    globalDragCounter = 0;
    return;
  }
  if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
    e.preventDefault();
    globalDragCounter++;
    if (globalDropOverlay) globalDropOverlay.classList.add('visible');
  }
});

window.addEventListener('dragover', (e) => {
  if (isAnyModalOpen()) {
    if (globalDropOverlay) globalDropOverlay.classList.remove('visible');
    globalDragCounter = 0;
    return;
  }
  if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
});

window.addEventListener('dragleave', (e) => {
  if (isAnyModalOpen()) {
    if (globalDropOverlay) globalDropOverlay.classList.remove('visible');
    globalDragCounter = 0;
    return;
  }
  if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
    globalDragCounter = Math.max(0, globalDragCounter - 1);
    if (globalDragCounter === 0 && globalDropOverlay) {
      globalDropOverlay.classList.remove('visible');
    }
  }
});

window.addEventListener('drop', async (e) => {
  if (isAnyModalOpen()) {
    if (globalDropOverlay) globalDropOverlay.classList.remove('visible');
    globalDragCounter = 0;
    return;
  }
  if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
    e.preventDefault();
    globalDragCounter = 0;
    if (globalDropOverlay) globalDropOverlay.classList.remove('visible');

    // Si le drop a été fait directement sur la zone de mods ou d'import, laisser le handler spécifique s'en charger
    const isTargetModDrop = e.target && (e.target.closest('#dropZone') || e.target.closest('#importDropZone'));
    if (isTargetModDrop) return;

    const dtFiles = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (dtFiles.length > 0 && dtFiles[0].path) {
      openCreateModal();
      switchToCreateTab('tab-import');
      handleImportFilesReceived(dtFiles);
      return;
    }

    let files = [];
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      files = await traverseDataTransferItems(items);
    }
    if ((!files || files.length === 0) && dtFiles.length > 0) {
      files = dtFiles;
    }

    if (files && files.length > 0) {
      openCreateModal();
      switchToCreateTab('tab-import');
      handleImportFilesReceived(files);
    }
  }
});

/**
 * Lit récursivement les dossiers ou fichiers déposés par drag & drop
 */
async function traverseDataTransferItems(items) {
  const resultFiles = [];

  async function traverseEntry(entry, currentPath = '') {
    if (entry.isFile) {
      await new Promise(resolve => {
        entry.file(file => {
          const rel = (currentPath ? currentPath + '/' : '') + file.name;
          Object.defineProperty(file, 'customRelativePath', { value: rel, configurable: true });
          resultFiles.push(file);
          resolve();
        }, () => resolve());
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const readAllEntries = async () => {
        return new Promise(resolve => {
          dirReader.readEntries(async (entries) => {
            if (entries.length === 0) {
              resolve();
            } else {
              for (const child of entries) {
                await traverseEntry(child, (currentPath ? currentPath + '/' : '') + entry.name);
              }
              await readAllEntries();
              resolve();
            }
          }, () => resolve());
        });
      };
      await readAllEntries();
    }
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.webkitGetAsEntry) {
      const entry = item.webkitGetAsEntry();
      if (entry) await traverseEntry(entry);
    }
  }

  return resultFiles;
}

function handleImportFilesReceived(files) {
  if (!files || files.length === 0) return;
  uploadedImportFiles = files;
  uploadedImportStagedPath = null;
  uploadedImportLocalPath = null;

  // Désactiver immédiatement le bouton d'importation pendant l'analyse
  if (btnSubmitImport) btnSubmitImport.setAttribute('disabled', 'true');
  if (importDropZone) importDropZone.classList.add('is-loading');

  const firstFile = files[0];
  const directLocalPath = firstFile.path || null;
  const isSingleZip = (files.length === 1 && firstFile.name.toLowerCase().endsWith('.zip'));
  let displayName = '';
  let importedWorldName = '';

  if (isSingleZip) {
    displayName = `Archive prête : ${firstFile.name} (${(firstFile.size / 1024 / 1024).toFixed(1)} Mo)`;
    importedWorldName = firstFile.name.replace(/\.zip$/i, '');
  } else {
    // Dossier non compacté
    const sampleRel = firstFile.customRelativePath || firstFile.webkitRelativePath || firstFile.name;
    const folderBase = sampleRel.includes('/') ? sampleRel.split('/')[0] : (firstFile.name || 'Mon-Monde');
    displayName = `Dossier prêt : ${folderBase} (${files.length} fichiers)`;
    importedWorldName = folderBase;
  }

  if (importDropTitle) {
    importDropTitle.textContent = displayName;
  }

  const nameInput = document.getElementById('importWorldName');
  if (nameInput && importedWorldName) {
    nameInput.value = importedWorldName;
  }

  // Badge d'analyse avec spinner
  const badge = document.getElementById('importDetectedBadge');
  if (badge) {
    badge.className = 'auto-detected-badge visible';
    badge.innerHTML = `
      <div class="action-spinner"></div>
      <span>Analyse du monde et détection du lanceur...</span>
    `;
  }

  // 1. Priorité chemin direct (Finder macOS / Explorateur Windows natif)
  if (directLocalPath) {
    uploadedImportLocalPath = directLocalPath;
    uploadedImportStagedPath = directLocalPath;
    fetch('/api/worlds/inspect-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: directLocalPath })
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && badge) {
          detectedImportVersion = data.version || '1.21.1';
          detectedImportLauncher = data.launcher || 'Vanilla';
          detectedImportType = data.type || 'vanilla';
          uploadedImportStagedPath = data.uploadedPath || directLocalPath;

          badge.className = 'auto-detected-badge visible';
          badge.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <div>
              <strong>${escapeHtml(detectedImportLauncher)}</strong> détecté pour Minecraft <strong>${escapeHtml(detectedImportVersion)}</strong>
              ${data.modsCount ? `<br><small style="color: #94a3b8;">${data.modsCount} mod(s) inclus</small>` : ''}
            </div>
          `;

          if (nameInput && (!nameInput.value.trim() || nameInput.value.startsWith('Mon-Monde') || nameInput.value === 'monde-importe')) {
            if (data.suggestedName) {
              nameInput.value = data.suggestedName;
            }
          }
          if (btnSubmitImport) btnSubmitImport.removeAttribute('disabled');
        } else {
          if (badge) {
            badge.className = 'auto-detected-badge visible';
            badge.innerHTML = `<span style="color: #ef4444;">${escapeHtml(data.error || 'Erreur lors de l\'analyse')}</span>`;
          }
          if (btnSubmitImport) btnSubmitImport.setAttribute('disabled', 'true');
        }
        if (importDropZone) importDropZone.classList.remove('is-loading');
      })
      .catch(err => {
        console.warn('Erreur détection monde direct:', err);
        if (badge) {
          badge.className = 'auto-detected-badge visible';
          badge.innerHTML = `<span style="color: #ef4444;">Échec d'analyse (${escapeHtml(err.message)})</span>`;
        }
        if (btnSubmitImport) btnSubmitImport.setAttribute('disabled', 'true');
        if (importDropZone) importDropZone.classList.remove('is-loading');
      });
    return;
  }

  // 2. Mode upload HTTP classique
  const formData = new FormData();
  if (isSingleZip) {
    formData.append('worldZip', files[0]);
  } else {
    for (const f of files) {
      const rel = f.customRelativePath || f.webkitRelativePath || f.name;
      formData.append('worldFiles', f, rel);
    }
  }

  fetch('/api/worlds/inspect-zip', {
    method: 'POST',
    body: formData
  })
    .then(r => r.json())
    .then(data => {
      if (data.success && badge) {
        detectedImportVersion = data.version || '1.21.1';
        detectedImportLauncher = data.launcher || 'Vanilla';
        detectedImportType = data.type || 'vanilla';
        uploadedImportStagedPath = data.uploadedPath || null;

        badge.className = 'auto-detected-badge visible';
        badge.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <div>
            <strong>${escapeHtml(detectedImportLauncher)}</strong> détecté pour Minecraft <strong>${escapeHtml(detectedImportVersion)}</strong>
            ${data.modsCount ? `<br><small style="color: #94a3b8;">${data.modsCount} mod(s) inclus</small>` : ''}
          </div>
        `;

        if (nameInput && (!nameInput.value.trim() || nameInput.value.startsWith('Mon-Monde') || nameInput.value === 'monde-importe')) {
          if (data.suggestedName) {
            nameInput.value = data.suggestedName;
          }
        }
        if (btnSubmitImport) btnSubmitImport.removeAttribute('disabled');
      } else {
        if (badge) {
          badge.className = 'auto-detected-badge visible';
          badge.innerHTML = `<span style="color: #ef4444;">${escapeHtml(data.error || 'Erreur lors de l\'analyse')}</span>`;
        }
        if (btnSubmitImport) btnSubmitImport.setAttribute('disabled', 'true');
      }
      if (importDropZone) importDropZone.classList.remove('is-loading');
    })
    .catch(err => {
      console.warn('Erreur détection monde:', err);
      if (badge) {
        badge.className = 'auto-detected-badge visible';
        badge.innerHTML = `<span style="color: #ef4444;">Échec d'analyse (${escapeHtml(err.message)})</span>`;
      }
      if (btnSubmitImport) btnSubmitImport.setAttribute('disabled', 'true');
      if (importDropZone) importDropZone.classList.remove('is-loading');
    });
}

if (formImportWorld) {
  formImportWorld.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetPath = uploadedImportLocalPath || uploadedImportStagedPath;
    if ((!uploadedImportFiles || uploadedImportFiles.length === 0) && !targetPath) return;
    const nameInput = document.getElementById('importWorldName');
    const name = (nameInput?.value.trim()) || getSuggestedWorldName();

    closeCreateModal();
    openProgressModal(name, detectedImportType || 'vanilla');

    try {
      let res;
      if (targetPath) {
        // Envoi direct sans re-upload lourd
        res = await fetch('/api/worlds/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stagedPath: targetPath,
            name,
            version: detectedImportVersion || '1.21.1',
            type: detectedImportType || 'vanilla'
          })
        });
      } else {
        const formData = new FormData();
        const isSingleZip = (uploadedImportFiles.length === 1 && uploadedImportFiles[0].name.toLowerCase().endsWith('.zip'));
        if (isSingleZip) {
          formData.append('worldZip', uploadedImportFiles[0]);
        } else {
          for (const f of uploadedImportFiles) {
            const rel = f.customRelativePath || f.webkitRelativePath || f.name;
            formData.append('worldFiles', f, rel);
          }
        }
        res = await fetch(`/api/worlds/import?name=${encodeURIComponent(name)}&version=${encodeURIComponent(detectedImportVersion || '1.21.1')}&type=${encodeURIComponent(detectedImportType || 'vanilla')}`, {
          method: 'POST',
          body: formData
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur importation');
      queueFocusCreatedWorld(data, name);
      updateProgressModal(100, `Monde ${name} importé et configuré avec succès !`);
    } catch (err) {
      setProgressError(err.message);
      showToast(err.message, 'error');
    }
  });
}

// ----------------------------------------------------
// Options du Serveur (server.properties)
// ----------------------------------------------------
let editingWorldId = null;
let currentRawProperties = '';

const editPropsModal = document.getElementById('editPropsModal');
const editPropsTitle = document.getElementById('editPropsTitle');
const editPropsSubtitle = document.getElementById('editPropsSubtitle');
const btnClosePropsModal = document.getElementById('btnClosePropsModal');
const btnCancelProps = document.getElementById('btnCancelProps');
const btnSaveProps = document.getElementById('btnSaveProps');
const propsTextarea = document.getElementById('propsTextarea');

// Contrôles des options du serveur
const propGamemode = document.getElementById('propGamemode');
const propDifficulty = document.getElementById('propDifficulty');
const propMaxPlayers = document.getElementById('propMaxPlayers');
const propWhitelist = document.getElementById('propWhitelist');
const propCracked = document.getElementById('propCracked');
const propPvp = document.getElementById('propPvp');
const propHardcore = document.getElementById('propHardcore');
const propAllowFlight = document.getElementById('propAllowFlight');
const propSpawnMonsters = document.getElementById('propSpawnMonsters');
const propSpawnAnimals = document.getElementById('propSpawnAnimals');
const propSpawnNpcs = document.getElementById('propSpawnNpcs');
const propCommandBlock = document.getElementById('propCommandBlock');
const propAllowNether = document.getElementById('propAllowNether');
const propViewDistance = document.getElementById('propViewDistance');
const propSimulationDistance = document.getElementById('propSimulationDistance');
const propPort = document.getElementById('propPort');
const propMotd = document.getElementById('propMotd');

function parseProps(text) {
  const map = {};
  text.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      map[key] = val;
    }
  });
  return map;
}

function syncRawToVisual() {
  const props = parseProps(propsTextarea.value);
  if (propGamemode) propGamemode.value = (props['gamemode'] || 'survival').toLowerCase();
  if (propDifficulty) propDifficulty.value = (props['difficulty'] || 'easy').toLowerCase();
  if (propMaxPlayers) propMaxPlayers.value = props['max-players'] || '20';

  if (propWhitelist) propWhitelist.checked = (props['white-list'] === 'true');
  // Cracked / Offline Mode : activé si online-mode === 'false'
  if (propCracked) propCracked.checked = (props['online-mode'] === 'false');
  if (propPvp) propPvp.checked = (props['pvp'] !== 'false');
  if (propHardcore) propHardcore.checked = (props['hardcore'] === 'true');
  if (propAllowFlight) propAllowFlight.checked = (props['allow-flight'] === 'true');
  if (propSpawnMonsters) propSpawnMonsters.checked = (props['spawn-monsters'] !== 'false');
  if (propSpawnAnimals) propSpawnAnimals.checked = (props['spawn-animals'] !== 'false');
  if (propSpawnNpcs) propSpawnNpcs.checked = (props['spawn-npcs'] !== 'false');
  if (propCommandBlock) propCommandBlock.checked = (props['enable-command-block'] === 'true');
  if (propAllowNether) propAllowNether.checked = (props['allow-nether'] !== 'false');

  if (propViewDistance) propViewDistance.value = props['view-distance'] || '12';
  if (propSimulationDistance) propSimulationDistance.value = props['simulation-distance'] || '4';
  if (propPort) propPort.value = props['server-port'] || '25565';
  if (propMotd) propMotd.value = props['motd'] || 'Cubirium Vanilla 1.21.1';
}

function syncVisualToRaw() {
  const overrides = {
    'gamemode': propGamemode ? propGamemode.value : 'survival',
    'difficulty': propDifficulty ? propDifficulty.value : 'easy',
    'max-players': propMaxPlayers ? propMaxPlayers.value : '20',
    'white-list': propWhitelist && propWhitelist.checked ? 'true' : 'false',
    // Si la case Cracké est cochée -> online-mode = false
    'online-mode': propCracked && propCracked.checked ? 'false' : 'true',
    'pvp': propPvp && propPvp.checked ? 'true' : 'false',
    'hardcore': propHardcore && propHardcore.checked ? 'true' : 'false',
    'allow-flight': propAllowFlight && propAllowFlight.checked ? 'true' : 'false',
    'spawn-monsters': propSpawnMonsters && propSpawnMonsters.checked ? 'true' : 'false',
    'spawn-animals': propSpawnAnimals && propSpawnAnimals.checked ? 'true' : 'false',
    'spawn-npcs': propSpawnNpcs && propSpawnNpcs.checked ? 'true' : 'false',
    'enable-command-block': propCommandBlock && propCommandBlock.checked ? 'true' : 'false',
    'allow-nether': propAllowNether && propAllowNether.checked ? 'true' : 'false',
    'view-distance': propViewDistance ? propViewDistance.value : '12',
    'simulation-distance': propSimulationDistance ? propSimulationDistance.value : '4',
    'server-port': propPort ? propPort.value : '25565',
    'motd': propMotd ? propMotd.value : 'Cubirium Vanilla 1.21.1',
    'sync-chunk-writes': 'false',
    'enforce-secure-profile': 'false'
  };

  let lines = propsTextarea.value.split('\n');
  const handledKeys = new Set();

  lines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      if (overrides.hasOwnProperty(key)) {
        handledKeys.add(key);
        return `${key}=${overrides[key]}`;
      }
    }
    return line;
  });

  // Ajouter les clés manquantes
  for (const [key, val] of Object.entries(overrides)) {
    if (!handledKeys.has(key)) {
      lines.push(`${key}=${val}`);
    }
  }

  propsTextarea.value = lines.join('\n');
}

async function openEditProps(worldId) {
  if (serverStatus !== 'STOPPED' && (worldId === activeWorld || serverStatus === 'RUNNING')) {
    showToast('Arrêtez le serveur pour modifier ses paramètres en toute sécurité.', 'warning');
    return;
  }

  editingWorldId = worldId;
  editPropsTitle.textContent = `${worldId} — Options`;
  editPropsSubtitle.textContent = `Configuration du serveur (server.properties)`;

  // Mettre à jour la tuile de chemin d'accès
  const foundWorld = worldsListCache.find(w => w.id === worldId);
  const fullPath = (foundWorld && foundWorld.path) ? foundWorld.path : worldId;
  const pathEl = document.getElementById('propWorldFullPath');
  if (pathEl) pathEl.textContent = fullPath;

  const btnOpenFinder = document.getElementById('btnOpenFinderFolder');
  const btnLabelEl = document.getElementById('btnOpenFinderFolderLabel');
  const isWin = navigator.platform.includes('Win') || navigator.userAgent.includes('Windows');
  if (btnLabelEl) {
    btnLabelEl.textContent = isWin ? "Ouvrir l'Explorateur" : "Ouvrir le Finder";
  }
  if (btnOpenFinder) {
    btnOpenFinder.title = isWin ? "Ouvrir dans l'Explorateur de fichiers de Windows" : "Ouvrir dans le Finder de macOS";
    btnOpenFinder.onclick = () => {
      if (!editingWorldId) return;
      openWorldFolder(editingWorldId, fullPath);
    };
  }

  document.querySelectorAll('#optionsGrid .option-card').forEach(c => c.classList.remove('hidden'));
  editPropsModal.style.display = 'flex';

  try {
    const res = await fetch(`/api/worlds/properties?worldId=${encodeURIComponent(worldId)}`);
    const data = await res.json();
    currentRawProperties = data.content || '';
    propsTextarea.value = currentRawProperties;
    syncRawToVisual();
  } catch (err) {
    showToast('Erreur chargement properties: ' + err.message, 'error');
  }
}

function closeEditProps() {
  editPropsModal.style.display = 'none';
  editingWorldId = null;
}

btnCancelProps.addEventListener('click', closeEditProps);
btnClosePropsModal.addEventListener('click', closeEditProps);

btnSaveProps.addEventListener('click', async () => {
  if (!editingWorldId) return;
  syncVisualToRaw();
  const content = propsTextarea.value;
  showToast('Sauvegarde des options...', 'info');

  try {
    const res = await fetch('/api/worlds/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId: editingWorldId, content })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur sauvegarde');
    showToast('Options enregistrées avec succès !', 'success');
    closeEditProps();
    fetchWorlds();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ====================================================
// Gestionnaire de Joueurs (Ops, Whitelist, Bans, En ligne)
// ====================================================
let currentPlayersWorldId = null;
let currentPlayersTab = 'ops';
let cachedPlayersData = { players: [], ops: [], whitelist: [], bannedPlayers: [], online: [] };

const playersModal = document.getElementById('playersModal');
const playersModalTitle = document.getElementById('playersModalTitle');
const playersModalSubtitle = document.getElementById('playersModalSubtitle');
const btnClosePlayersModal = document.getElementById('btnClosePlayersModal');
const btnRefreshPlayersModal = document.getElementById('btnRefreshPlayersModal');
let playersManagerPollInterval = null;
let isPollingPlayersManager = false;

function getPlayerLiveInterval() {
  return 500;
}

const tabBtnPlayers = document.getElementById('tabBtnPlayers');
const tabBtnOps = document.getElementById('tabBtnOps');
const tabBtnWhitelist = document.getElementById('tabBtnWhitelist');
const tabBtnBannedPlayers = document.getElementById('tabBtnBannedPlayers');

const countPlayers = document.getElementById('countPlayers');
const countOps = document.getElementById('countOps');
const countWhitelist = document.getElementById('countWhitelist');
const countBannedPlayers = document.getElementById('countBannedPlayers');

const formAddPlayer = document.getElementById('formAddPlayer');
const playerInputName = document.getElementById('playerInputName');
const playerInputReason = document.getElementById('playerInputReason');
const playersListContainer = document.getElementById('playersListContainer');

// --- Modale Détail Joueur & Inventaire 3D ---
const playerDetailModal = document.getElementById('playerDetailModal');
const btnClosePlayerDetailModal = document.getElementById('btnClosePlayerDetailModal');
const detailAvatar = document.getElementById('detailAvatar');
const detailPlayerName = document.getElementById('detailPlayerName');
const detailStatusPill = document.getElementById('detailStatusPill');
const detailPlayerUuid = document.getElementById('detailPlayerUuid');
const detailGameModeSelect = document.getElementById('detailGameModeSelect');
const detailGameModeDropdown = document.getElementById('detailGameModeDropdown');
const detailGameModeTrigger = document.getElementById('detailGameModeTrigger');
const detailGameModeLabel = document.getElementById('detailGameModeLabel');
const detailGameModeMenu = document.getElementById('detailGameModeMenu');
const optimisticPlayerGameModes = {};

const detailXpLabel = document.getElementById('detailXpLabel');
const detailXpFill = document.getElementById('detailXpFill');
const detailHeartsContainer = document.getElementById('detailHeartsContainer');
const detailFoodContainer = document.getElementById('detailFoodContainer');
// Boutons retirés - mais déclarations conservées pour compat.
const btnDetailKill = null;
const btnDetailHeal = null;
const btnDetailStarve = null;
const btnDetailFeed = null;

// --- 3D Player Viewer ---
const player3dCanvas = document.getElementById('player3dCanvas');
const player3dLoading = document.getElementById('player3dLoading');
let _skinViewer = null;
let _mouseMoveListener = null;
let _isDragging3DSkin = false;
let _skinDragListeners = null;
let _isVitalActionBusy = false;

if (player3dCanvas) {
  player3dCanvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
}

// Carte matériau -> noms de fichiers de texture armor
const ARMOR_MATERIAL_MAP = {
  // Layer 1 (helmet, chestplate, boots) + Layer 2 (leggings)
  'leather': { l1: '/assets/minecraft/armor/leather_layer_1.png', l2: '/assets/minecraft/armor/leather_layer_2.png', overlay1: '/assets/minecraft/armor/leather_layer_1_overlay.png', overlay2: '/assets/minecraft/armor/leather_layer_2_overlay.png', isLeather: true },
  'iron': { l1: '/assets/minecraft/armor/iron_layer_1.png', l2: '/assets/minecraft/armor/iron_layer_2.png' },
  'gold': { l1: '/assets/minecraft/armor/gold_layer_1.png', l2: '/assets/minecraft/armor/gold_layer_2.png' },
  'diamond': { l1: '/assets/minecraft/armor/diamond_layer_1.png', l2: '/assets/minecraft/armor/diamond_layer_2.png' },
  'netherite': { l1: '/assets/minecraft/armor/netherite_layer_1.png', l2: '/assets/minecraft/armor/netherite_layer_2.png' },
  'chainmail': { l1: '/assets/minecraft/armor/chainmail_layer_1.png', l2: '/assets/minecraft/armor/chainmail_layer_2.png' },
  'turtle': { l1: '/assets/minecraft/armor/turtle_layer_1.png', l2: null },
};

function getArmorMaterial(itemId) {
  if (!itemId) return null;
  const cleanId = itemId.replace(/^minecraft:/, '').toLowerCase();
  for (const [mat] of Object.entries(ARMOR_MATERIAL_MAP)) {
    if (cleanId.startsWith(mat + '_')) return mat;
    if (cleanId === mat) return mat;
  }
  return null;
}

const toggleWhitelist = document.getElementById('toggleWhitelist');
const toggleBanned = document.getElementById('toggleBanned');
const toggleOp = document.getElementById('toggleOp');

const slotHead = document.getElementById('slot-head');
const slotChest = document.getElementById('slot-chest');
const slotLegs = document.getElementById('slot-legs');
const slotFeet = document.getElementById('slot-feet');
const slotOffhand = document.getElementById('slot-offhand');
const mainInventoryGrid = document.getElementById('mainInventoryGrid');
const hotbarGrid = document.getElementById('hotbarGrid');

const detailPosX = document.getElementById('detailPosX');
const detailPosY = document.getElementById('detailPosY');
const detailPosZ = document.getElementById('detailPosZ');
const detailDimension = document.getElementById('detailDimension');
const btnCopyPosCoords = document.getElementById('btnCopyPosCoords');
const btnCopySpawnCoords = document.getElementById('btnCopySpawnCoords');
const btnCopyDeathCoords = document.getElementById('btnCopyDeathCoords');
const detailSpawnCoords = document.getElementById('detailSpawnCoords');
const detailDeathCoords = document.getElementById('detailDeathCoords');

const detailPlayTime = document.getElementById('detailPlayTime');
const detailPlayerKills = document.getElementById('detailPlayerKills');
const detailDeaths = document.getElementById('detailDeaths');
const detailKdr = document.getElementById('detailKdr');

let currentPlayerDetailName = null;
let currentPlayerDetailData = null;

async function openPlayersManager(worldId, tab = 'players') {
  currentPlayersWorldId = worldId || activeWorld;
  if (!currentPlayersWorldId) {
    showToast('Sélectionnez un monde pour gérer les joueurs.', 'error');
    return;
  }

  playersModalTitle.textContent = `${currentPlayersWorldId} — Joueurs`;
  playersModalSubtitle.textContent = `Gestion des droits, liste blanche et actions de jeu`;
  playersModal.style.display = 'flex';

  startPlayersManagerPolling();
  switchPlayersTab(tab);
  await refreshPlayersData();
}

async function pollPlayersManagerTick() {
  if (isPollingPlayersManager) return;
  if (!playersModal || playersModal.style.display === 'none' || !currentPlayersWorldId) {
    stopPlayersManagerPolling();
    return;
  }
  isPollingPlayersManager = true;
  try {
    await refreshPlayersData();
  } finally {
    isPollingPlayersManager = false;
  }
}

function startPlayersManagerPolling() {
  stopPlayersManagerPolling();
  const intervalMs = getPlayerLiveInterval();
  playersManagerPollInterval = setInterval(pollPlayersManagerTick, intervalMs);
}

function stopPlayersManagerPolling() {
  if (playersManagerPollInterval) {
    clearInterval(playersManagerPollInterval);
    playersManagerPollInterval = null;
  }
}

function closePlayersManager() {
  stopPlayersManagerPolling();
  playersModal.style.display = 'none';
  currentPlayersWorldId = null;
}

if (btnClosePlayersModal) {
  btnClosePlayersModal.addEventListener('click', closePlayersManager);
}

if (btnRefreshPlayersModal) {
  btnRefreshPlayersModal.addEventListener('click', async () => {
    const svg = btnRefreshPlayersModal.querySelector('svg');
    if (svg) {
      svg.classList.remove('spinning');
      void svg.offsetWidth;
      svg.classList.add('spinning');
      setTimeout(() => svg.classList.remove('spinning'), 600);
    }
    await refreshPlayersData();
  });
}

// Clic direct sur le badge de joueurs dans la barre d'état
if (playersOnlineBadge) {
  playersOnlineBadge.style.cursor = 'pointer';
  playersOnlineBadge.title = 'Ouvrir le gestionnaire des joueurs';
  playersOnlineBadge.addEventListener('click', () => {
    if (activeWorld) openPlayersManager(activeWorld, 'players');
  });
}

function switchPlayersTab(tabName) {
  currentPlayersTab = tabName;
  const tabs = [tabBtnPlayers, tabBtnOps, tabBtnWhitelist, tabBtnBannedPlayers];
  tabs.forEach(btn => {
    if (!btn) return;
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Adapter l'interface d'ajout rapide selon l'onglet (aucune barre sur l'onglet Joueurs)
  if (tabName === 'players') {
    formAddPlayer.style.display = 'none';
  } else {
    formAddPlayer.style.display = 'flex';
    playerInputName.value = '';
    if (tabName === 'bannedPlayers') {
      playerInputName.placeholder = 'Entrer un pseudo à bannir...';
      playerInputReason.style.display = 'inline-block';
      playerInputReason.placeholder = 'Raison du ban (optionnel)...';
    } else if (tabName === 'ops') {
      playerInputName.placeholder = 'Entrer un pseudo à nommer Opérateur...';
      playerInputReason.style.display = 'none';
    } else if (tabName === 'whitelist') {
      playerInputName.placeholder = 'Entrer un pseudo à ajouter à la Whitelist...';
      playerInputReason.style.display = 'none';
    }
  }

  renderPlayersList();
}

[tabBtnPlayers, tabBtnOps, tabBtnWhitelist, tabBtnBannedPlayers].forEach(btn => {
  if (btn) {
    btn.addEventListener('click', () => switchPlayersTab(btn.dataset.tab));
  }
});

async function refreshPlayersData(force = false) {
  if (!currentPlayersWorldId) return;
  try {
    const res = await fetch(`/api/players?worldId=${encodeURIComponent(currentPlayersWorldId)}`);
    const data = await res.json();
    if (res.ok) {
      const prevDataStr = JSON.stringify(cachedPlayersData);
      const nextDataStr = JSON.stringify(data);
      if (force || prevDataStr !== nextDataStr) {
        cachedPlayersData = data;
        if (countPlayers) {
          const total = data.players ? data.players.length : 0;
          const onlineCount = data.online ? data.online.length : 0;
          countPlayers.textContent = onlineCount > 0 ? `${onlineCount}/${total}` : `${total}`;
        }
        if (countOps) countOps.textContent = data.ops ? data.ops.length : 0;
        if (countWhitelist) countWhitelist.textContent = data.whitelist ? data.whitelist.length : 0;
        if (countBannedPlayers) countBannedPlayers.textContent = data.bannedPlayers ? data.bannedPlayers.length : 0;
        renderPlayersList();
      }
    }
  } catch (err) {
    console.error('Erreur fetch players:', err);
  }
}

function renderPlayersList() {
  if (!playersListContainer) return;
  const items = cachedPlayersData[currentPlayersTab] || [];

  if (items.length === 0) {
    let emptyMsg = "Aucun joueur dans cette liste.";
    if (currentPlayersTab === 'players') emptyMsg = "Aucun joueur n'a encore rejoint ce serveur.";
    if (currentPlayersTab === 'ops') emptyMsg = "Aucun opérateur configuré. Ajoute un pseudo ci-dessus.";
    if (currentPlayersTab === 'whitelist') emptyMsg = "La liste blanche est vide.";
    if (currentPlayersTab === 'bannedPlayers') emptyMsg = "Aucun joueur banni.";

    playersListContainer.innerHTML = `
      <div class="empty-players">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="8" r="4"></circle>
          <path d="M6 20v-2a6 6 0 0 1 12 0v2"></path>
        </svg>
        <p>${emptyMsg}</p>
      </div>`;
    return;
  }

  // Rendu de chaque ligne avec bouton Gérer sur TOUS les onglets
  playersListContainer.innerHTML = items.map(item => {
    const name = item.name || item;
    const uuid = item.uuid || '';
    const avatarUrl = `https://minotar.net/avatar/${encodeURIComponent(name)}/36`;

    // Onglet global "Joueurs" (affiche tout le monde avec statut en ligne ou hors ligne)
    if (currentPlayersTab === 'players') {
      const isOnline = !!item.isOnline || (currentPlayersList && currentPlayersList.some(p => p.toLowerCase() === name.toLowerCase()));
      const isOp = !!item.isOp;
      const isBanned = !!item.isBanned;
      const isWhitelisted = !!item.isWhitelisted;

      return `
        <div class="player-row">
          <div class="player-main" onclick="openPlayerDetail('${escapeHtml(name)}')" style="cursor: pointer;" title="Cliquer pour gérer le joueur">
            <img class="player-avatar" src="${avatarUrl}" alt="${escapeHtml(name)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'36\\' height=\\'36\\'><rect width=\\'36\\' height=\\'36\\' fill=\\'%23334155\\'/></svg>'"/>
            <div class="player-info">
              <div class="player-name-wrap">
                <span class="player-name">${escapeHtml(name)}</span>
                ${isOnline
          ? `<span class="player-tag online">En ligne</span>`
          : `<span class="player-tag" style="background:#1e293b;color:#94a3b8;border:1px solid rgba(255,255,255,0.08);">Hors ligne</span>`
        }
                ${isOp ? `<span class="player-tag op">OP</span>` : ''}
                ${isBanned ? `<span class="player-tag banned">Banni</span>` : ''}
                ${isWhitelisted ? `<span class="player-tag" style="background:#0f766e;color:#5eead4;">Whitelist</span>` : ''}
              </div>
              <span class="player-sub">${uuid ? escapeHtml(uuid) : (isOnline ? 'Connecté sur le serveur' : 'Joueur enregistré')}</span>
            </div>
          </div>
          <div class="player-actions">
            <button class="btn-player-manage" onclick="openPlayerDetail('${escapeHtml(name)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              Gérer
            </button>
            ${isOnline ? `
              <button class="btn-player-action" title="Expulser" onclick="quickKickAction('${escapeHtml(name)}')">Kick</button>
            ` : ''}
            <button class="btn-trash" id="btn-del-pdata-${escapeHtml(name)}" title="Supprimer les données de jeu (inventaire, progrès)" onclick="initDeletePlayerData('${escapeHtml(name)}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    if (currentPlayersTab === 'ops') {
      const level = item.level ? `Niveau ${item.level}` : 'Admin';
      return `
        <div class="player-row">
          <div class="player-main" onclick="openPlayerDetail('${escapeHtml(name)}')" style="cursor: pointer;" title="Cliquer pour gérer le joueur">
            <img class="player-avatar" src="${avatarUrl}" alt="${escapeHtml(name)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'36\\' height=\\'36\\'><rect width=\\'36\\' height=\\'36\\' fill=\\'%23334155\\'/></svg>'"/>
            <div class="player-info">
              <div class="player-name-wrap">
                <span class="player-name">${escapeHtml(name)}</span>
                <span class="player-tag op">${level}</span>
              </div>
              <span class="player-sub">${uuid ? escapeHtml(uuid) : 'Opérateur'}</span>
            </div>
          </div>
          <div class="player-actions">
            <button class="btn-player-manage" onclick="openPlayerDetail('${escapeHtml(name)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              Gérer
            </button>
          </div>
        </div>
      `;
    }

    if (currentPlayersTab === 'whitelist') {
      return `
        <div class="player-row">
          <div class="player-main" onclick="openPlayerDetail('${escapeHtml(name)}')" style="cursor: pointer;" title="Cliquer pour gérer le joueur">
            <img class="player-avatar" src="${avatarUrl}" alt="${escapeHtml(name)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'36\\' height=\\'36\\'/></svg>'"/>
            <div class="player-info">
              <div class="player-name-wrap">
                <span class="player-name">${escapeHtml(name)}</span>
                <span class="player-tag">Autorisé</span>
              </div>
              <span class="player-sub">${uuid ? escapeHtml(uuid) : 'Whitelist'}</span>
            </div>
          </div>
          <div class="player-actions">
            <button class="btn-player-manage" onclick="openPlayerDetail('${escapeHtml(name)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              Gérer
            </button>
            <button class="btn-trash" title="Retirer de la Whitelist" onclick="removePlayerAction('whitelist', '${escapeHtml(name)}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    if (currentPlayersTab === 'bannedPlayers') {
      const reason = item.reason ? ` • Raison: ${item.reason}` : '';
      return `
        <div class="player-row">
          <div class="player-main" onclick="openPlayerDetail('${escapeHtml(name)}')" style="cursor: pointer;" title="Cliquer pour gérer le joueur">
            <img class="player-avatar" src="${avatarUrl}" alt="${escapeHtml(name)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'36\\' height=\\'36\\'/></svg>'"/>
            <div class="player-info">
              <div class="player-name-wrap">
                <span class="player-name">${escapeHtml(name)}</span>
                <span class="player-tag banned">Banni</span>
              </div>
              <span class="player-sub">${item.created ? new Date(item.created).toLocaleDateString() : ''}${escapeHtml(reason)}</span>
            </div>
          </div>
          <div class="player-actions">
            <button class="btn-player-manage" onclick="openPlayerDetail('${escapeHtml(name)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              Gérer
            </button>
            <button class="btn-player-action" onclick="removePlayerAction('bannedPlayers', '${escapeHtml(name)}')">
              Pardonner
            </button>
          </div>
        </div>
      `;
    }

    return '';
  }).join('');
}

// Ajout de joueur via formulaire
formAddPlayer.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentPlayersWorldId) return;
  const nameOrIp = playerInputName.value.trim();
  const reason = playerInputReason.value.trim();
  if (!nameOrIp) return;

  if (currentPlayersTab === 'players') {
    // Dans l'onglet Joueurs, soumettre ouvre directement la fiche du joueur
    playerInputName.value = '';
    openPlayerDetail(nameOrIp);
    return;
  }

  try {
    const res = await fetch('/api/players/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worldId: currentPlayersWorldId,
        listType: currentPlayersTab,
        nameOrIp,
        reason
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'ajout');
    showToast(`${nameOrIp} ajouté !`, 'success');
    playerInputName.value = '';
    playerInputReason.value = '';
    await refreshPlayersData();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

async function removePlayerAction(listType, identifier) {
  if (!currentPlayersWorldId) return;
  try {
    const res = await fetch('/api/players/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worldId: currentPlayersWorldId,
        listType,
        identifier
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur suppression');
    showToast(`${identifier} retiré !`, 'success');
    await refreshPlayersData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function quickKickAction(name) {
  if (!currentPlayersWorldId) return;
  try {
    const res = await fetch('/api/players/kick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worldId: currentPlayersWorldId,
        name,
        reason: 'Expulsé par un administrateur'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur kick');
    showToast(`${name} a été expulsé !`, 'success');
    await refreshPlayersData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function quickBanAction(name) {
  if (!currentPlayersWorldId) return;
  try {
    const res = await fetch('/api/players/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worldId: currentPlayersWorldId,
        listType: 'bannedPlayers',
        nameOrIp: name,
        reason: 'Banni par un administrateur'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur ban');
    showToast(`${name} a été banni !`, 'success');
    await refreshPlayersData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function quickPlayerCommand(cmd, name) {
  if (!currentPlayersWorldId) return;
  if (cmd === 'op') {
    await fetch('/api/players/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId: currentPlayersWorldId, listType: 'ops', nameOrIp: name })
    });
    showToast(`${name} est désormais Opérateur !`, 'success');
  } else if (cmd === 'deop') {
    await fetch('/api/players/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId: currentPlayersWorldId, listType: 'ops', identifier: name })
    });
    showToast(`${name} n'est plus Opérateur.`, 'info');
  }
  await refreshPlayersData();
}

// --- Suppression des données du joueur (avec double vérification) ---
let _deletePlayerTimeout = null;

function initDeletePlayerData(playerName) {
  const btn = document.getElementById(`btn-del-pdata-${playerName}`);
  if (!btn) return;

  // Si déjà en confirmation (2ème clic) -> Exécuter la suppression
  if (btn.getAttribute('data-confirming') === 'true') {
    executeDeletePlayerData(playerName);
    return;
  }

  // 1ère étape : passer en mode confirmation avec avertissement visuel
  btn.setAttribute('data-confirming', 'true');
  btn.classList.add('confirming-delete');
  btn.innerHTML = `<span style="display:flex;align-items:center;gap:4px;font-size:0.72rem;font-weight:700;color:#fca5a5;">Confirmer ?</span>`;
  showToast(`Cliquez à nouveau pour confirmer la suppression définitive des données de ${playerName}.`, 'warning');

  clearTimeout(_deletePlayerTimeout);
  _deletePlayerTimeout = setTimeout(() => {
    cancelDeletePlayerData(playerName);
  }, 4500);
}
window.initDeletePlayerData = initDeletePlayerData;

function cancelDeletePlayerData(playerName) {
  const btn = document.getElementById(`btn-del-pdata-${playerName}`);
  if (!btn) return;
  btn.removeAttribute('data-confirming');
  btn.classList.remove('confirming-delete');
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  `;
}
window.cancelDeletePlayerData = cancelDeletePlayerData;

async function executeDeletePlayerData(playerName) {
  if (!currentPlayersWorldId) return;
  const btn = document.getElementById(`btn-del-pdata-${playerName}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span style="font-size:0.7rem;color:#fca5a5;">Suppression...</span>`;
  }
  showToast(`Suppression des données de ${playerName} en cours...`, 'info');

  try {
    const res = await fetch('/api/players/delete-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId: currentPlayersWorldId, player: playerName })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de la suppression');

    showToast(data.message || `Données de ${playerName} supprimées avec succès !`, 'success');

    if (playerDetailModal && playerDetailModal.style.display !== 'none' && currentPlayerDetailName === playerName) {
      closePlayerDetail();
    }

    // Nettoyer immédiatement le cache local et re-rendre
    if (cachedPlayersData) {
      if (Array.isArray(cachedPlayersData.players)) {
        cachedPlayersData.players = cachedPlayersData.players.filter(p => (p.name || p).toLowerCase() !== playerName.toLowerCase());
      }
      if (Array.isArray(cachedPlayersData.ops)) {
        cachedPlayersData.ops = cachedPlayersData.ops.filter(p => (p.name || p).toLowerCase() !== playerName.toLowerCase());
      }
      if (Array.isArray(cachedPlayersData.whitelist)) {
        cachedPlayersData.whitelist = cachedPlayersData.whitelist.filter(p => (p.name || p).toLowerCase() !== playerName.toLowerCase());
      }
      if (Array.isArray(cachedPlayersData.bannedPlayers)) {
        cachedPlayersData.bannedPlayers = cachedPlayersData.bannedPlayers.filter(p => (p.name || p).toLowerCase() !== playerName.toLowerCase());
      }
      if (Array.isArray(cachedPlayersData.online)) {
        cachedPlayersData.online = cachedPlayersData.online.filter(p => (p.name || p).toLowerCase() !== playerName.toLowerCase());
      }
      renderPlayersList();
    }

    await refreshPlayersData(true);
  } catch (err) {
    showToast(err.message, 'error');
    cancelDeletePlayerData(playerName);
  }
}
window.executeDeletePlayerData = executeDeletePlayerData;

// ==========================================
// --- GESTION DU JOUEUR & INVENTAIRE ---
// ==========================================

let playerDetailPollInterval = null;
let isPollingPlayerDetail = false;

const GAMEMODE_LABELS = {
  survival: 'Survie',
  creative: 'Créatif',
  adventure: 'Aventure',
  spectator: 'Spectateur'
};

function syncGameModeDropdownUI(mode) {
  const safeMode = GAMEMODE_LABELS[mode] ? mode : 'survival';
  if (detailGameModeSelect) detailGameModeSelect.value = safeMode;
  if (detailGameModeLabel) detailGameModeLabel.textContent = GAMEMODE_LABELS[safeMode];
  if (detailGameModeMenu) {
    detailGameModeMenu.querySelectorAll('.gamemode-dropdown-option').forEach((opt) => {
      const active = opt.dataset.value === safeMode;
      opt.classList.toggle('active', active);
      opt.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }
}

function setGameModeDropdownOpen(isOpen) {
  if (!detailGameModeDropdown) return;
  detailGameModeDropdown.classList.toggle('open', Boolean(isOpen));
  if (detailGameModeTrigger) detailGameModeTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if (detailGameModeMenu) detailGameModeMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
}

function closeGameModeDropdown() {
  setGameModeDropdownOpen(false);
}

async function pollPlayerDetailTick(forceRefresh = false) {
  if (isPollingPlayerDetail && !forceRefresh) return;
  if (!playerDetailModal || playerDetailModal.style.display === 'none' || !currentPlayerDetailName) {
    stopPlayerDetailPolling();
    return;
  }
  isPollingPlayerDetail = true;
  try {
    const res = await fetch(`/api/players/details?worldId=${encodeURIComponent(currentPlayersWorldId)}&player=${encodeURIComponent(currentPlayerDetailName)}`);
    if (res.ok) {
      const data = await res.json();
      if (currentPlayerDetailName === data.name) {
        const prevStr = currentPlayerDetailData ? JSON.stringify(currentPlayerDetailData) : '';
        const nextStr = JSON.stringify(data);
        if (forceRefresh || prevStr !== nextStr) {
          const invPrev = JSON.stringify(currentPlayerDetailData?.inventory);
          const invNext = JSON.stringify(data.inventory);
          const prevSelectedSlot = currentPlayerDetailData?.selectedSlot;
          currentPlayerDetailData = data;
          renderPlayerDetailView(data);
          if ((invPrev !== invNext || prevSelectedSlot !== data.selectedSlot) && _skinViewer) {
            _apply3DArmor(_skinViewer, data.inventory || [], data.selectedSlot ?? 0);
          }
        }
      }
    }
  } catch (e) {
  } finally {
    isPollingPlayerDetail = false;
  }
}

function startPlayerDetailPolling() {
  stopPlayerDetailPolling();
  const intervalMs = getPlayerLiveInterval();
  playerDetailPollInterval = setInterval(pollPlayerDetailTick, intervalMs);
}

function stopPlayerDetailPolling() {
  if (playerDetailPollInterval) {
    clearInterval(playerDetailPollInterval);
    playerDetailPollInterval = null;
  }
}

// Rafraîchissement immédiat quand l'utilisateur revient sur la fenêtre
function onPlayerPollingFocusChange() {
  if (playerDetailModal && playerDetailModal.style.display !== 'none' && currentPlayerDetailName) {
    pollPlayerDetailTick();
  }
  if (playersModal && playersModal.style.display !== 'none' && currentPlayersWorldId) {
    pollPlayersManagerTick();
  }
}

window.addEventListener('focus', onPlayerPollingFocusChange);
document.addEventListener('visibilitychange', onPlayerPollingFocusChange);

function detach3DSkinDragListeners() {
  _skinDragListeners = null;
  _isDragging3DSkin = false;
}

function closePlayerDetail() {
  hideMcTooltip();
  closeGameModeDropdown();
  stopPlayerDetailPolling();
  if (playerDetailModal) playerDetailModal.style.display = 'none';
  currentPlayerDetailName = null;
  currentPlayerDetailData = null;
  // Nettoyage du viewer 3D et de ses écouteurs
  detach3DSkinDragListeners();
  if (_mouseMoveListener) {
    document.removeEventListener('mousemove', _mouseMoveListener);
    _mouseMoveListener = null;
  }
  if (_skinViewer) {
    try { _skinViewer.dispose(); } catch (e) { }
    _skinViewer = null;
  }
  if (player3dLoading) player3dLoading.classList.remove('hidden');
}

if (btnClosePlayerDetailModal) {
  btnClosePlayerDetailModal.addEventListener('click', closePlayerDetail);
}

// Clic en dehors du dialogue pour fermer
if (playerDetailModal) {
  playerDetailModal.addEventListener('click', (e) => {
    if (e.target === playerDetailModal) closePlayerDetail();
  });
}

// Fonction pour ouvrir et charger les détails d'un joueur
async function openPlayerDetail(playerName) {
  if (!currentPlayersWorldId) currentPlayersWorldId = activeWorld;
  if (!currentPlayersWorldId || !playerName) return;

  currentPlayerDetailName = playerName;
  closeGameModeDropdown();

  // Pré-remplissage rapide
  if (detailPlayerName) detailPlayerName.textContent = playerName;
  if (detailPlayerUuid) detailPlayerUuid.textContent = 'Chargement des données NBT...';
  if (detailAvatar) detailAvatar.src = `https://minotar.net/avatar/${encodeURIComponent(playerName)}/48`;
  if (detailStatusPill) {
    detailStatusPill.textContent = 'Chargement...';
    detailStatusPill.className = 'player-status-pill';
  }

  if (playerDetailModal) playerDetailModal.style.display = 'flex';
  startPlayerDetailPolling();

  try {
    const res = await fetch(`/api/players/details?worldId=${encodeURIComponent(currentPlayersWorldId)}&player=${encodeURIComponent(playerName)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Impossible de lire les données du joueur.');

    currentPlayerDetailData = data;
    if (data.worldId) currentPlayersWorldId = data.worldId;
    renderPlayerDetailView(data);
    // Lance le rendu 3D du skin du joueur avec tout son équipement (armure, élytres, tête, main principale, seconde main)
    initOrUpdate3DPlayer(playerName, data.inventory || [], data.uuid, data.selectedSlot ?? 0);
  } catch (err) {
    console.error('Erreur chargement joueur:', err);
    showToast(err.message, 'error');
    if (detailPlayerUuid) detailPlayerUuid.textContent = 'Erreur lors de la lecture des données';
  }
}

// Rendu complet de la fiche Joueur
function renderPlayerDetailView(data) {
  if (!data) return;

  // En-tête
  if (detailPlayerName) detailPlayerName.textContent = data.name;
  if (detailPlayerUuid) detailPlayerUuid.textContent = data.uuid || 'UUID non répertorié';
  if (detailAvatar) detailAvatar.src = `https://minotar.net/avatar/${encodeURIComponent(data.name)}/48`;

  const isOnline = (data.isOnline !== undefined)
    ? !!data.isOnline
    : (currentPlayersList && currentPlayersList.some(p => p.toLowerCase() === data.name.toLowerCase()));

  if (detailStatusPill) {
    detailStatusPill.textContent = isOnline ? 'En ligne' : 'Hors ligne';
    detailStatusPill.className = `player-status-pill ${isOnline ? 'online' : 'offline'}`;
  }

  // Mode de jeu (instantané avec support optimiste + menu custom)
  const optMode = data.name ? optimisticPlayerGameModes[data.name.toLowerCase()] : null;
  const effectiveMode = optMode || data.gameMode || data.gameType || 'survival';
  syncGameModeDropdownUI(effectiveMode);
  if (data.name && data.gameMode && optMode === data.gameMode) {
    delete optimisticPlayerGameModes[data.name.toLowerCase()];
  }

  // Activer / désactiver les contrôles temps réel (Vie, Faim, XP) selon la présence en ligne
  const liveControls = playerDetailModal
    ? playerDetailModal.querySelectorAll('.btn-vital-ctrl, .btn-xp-chip')
    : [];
  liveControls.forEach((btn) => {
    if (!btn.dataset.defaultTitle && btn.title) {
      btn.dataset.defaultTitle = btn.title;
    }
    btn.disabled = !isOnline;
    btn.title = isOnline
      ? (btn.dataset.defaultTitle || '')
      : 'Le joueur doit être en ligne sur le serveur actif';
  });

  // Vie et Expérience
  const xpLevel = data.xpLevel || 0;
  const xpProgress = Math.min(1, Math.max(0, data.xpProgress || 0));
  if (detailXpLabel) detailXpLabel.textContent = `Niveau ${xpLevel}`;
  if (detailXpFill) detailXpFill.style.width = `${Math.round(xpProgress * 100)}%`;

  // 10 Cœurs de vie (avec support des mods qui augmentent la santé max) - Vraies textures Minecraft
  if (detailHeartsContainer) {
    const maxHealth = Math.max(20, Math.round(data.maxHealth !== undefined ? data.maxHealth : 20));
    const rawHealth = Math.max(0, Math.min(maxHealth, Math.round(data.health !== undefined ? data.health : 20)));
    const scaledHealth = maxHealth > 20 ? Math.round((rawHealth / maxHealth) * 20) : rawHealth;
    const hpTitle = `${rawHealth}/${maxHealth} PV`;
    let heartsHtml = '';
    for (let i = 0; i < 10; i++) {
      const heartValue = (i + 1) * 2;
      if (scaledHealth >= heartValue) {
        heartsHtml += `<img class="mc-heart-img" src="/assets/minecraft/gui/heart_full.png" alt="Cœur plein" title="${hpTitle}" />`;
      } else if (scaledHealth === heartValue - 1) {
        heartsHtml += `<img class="mc-heart-img" src="/assets/minecraft/gui/heart_half.png" alt="Demi-cœur" title="${hpTitle}" />`;
      } else {
        heartsHtml += `<img class="mc-heart-img" src="/assets/minecraft/gui/heart_empty.png" alt="Cœur vide" title="${hpTitle}" />`;
      }
    }
    detailHeartsContainer.innerHTML = heartsHtml;
    detailHeartsContainer.title = hpTitle;
  }

  // 10 Pilons de nourriture (Faim max: 20) - Rendu fidèle au HUD Minecraft (aligné à droite, décroissance de gauche à droite)
  if (detailFoodContainer) {
    const food = Math.max(0, Math.min(20, Math.round(data.foodLevel !== undefined ? data.foodLevel : 20)));
    let foodHtml = '';
    // Dans le HUD Minecraft officiel, le pilon 9 (à gauche) représente 19-20, le pilon 0 (à droite) représente 1-2
    for (let s = 9; s >= 0; s--) {
      const fullVal = (s + 1) * 2;
      const halfVal = fullVal - 1;
      if (food >= fullVal) {
        foodHtml += `<img class="mc-food-img" src="/assets/minecraft/gui/food_full.png" alt="Pilon plein" title="${food}/20 Faim" />`;
      } else if (food >= halfVal) {
        foodHtml += `<img class="mc-food-img" src="/assets/minecraft/gui/food_half.png" alt="Demi-pilon" title="${food}/20 Faim" />`;
      } else {
        foodHtml += `<img class="mc-food-img" src="/assets/minecraft/gui/food_empty.png" alt="Pilon vide" title="${food}/20 Faim" />`;
      }
    }
    detailFoodContainer.innerHTML = foodHtml;
    detailFoodContainer.title = `${food}/20 Faim`;
  }

  // Contrôles Joueur (Toggles)
  updatePlayerToggle(toggleWhitelist, data.isWhitelisted);
  updatePlayerToggle(toggleBanned, data.isBanned);
  updatePlayerToggle(toggleOp, data.isOp);

  // Inventaire (avec mise en évidence du slot sélectionné dans la hotbar)
  renderPlayerInventory(data.inventory || [], data.worldId, data.selectedSlot ?? 0);

  // Information & Coordonnées
  const pos = data.position || data.pos;
  if (detailPosX) detailPosX.textContent = pos ? pos.x.toFixed(2) : '0';
  if (detailPosY) detailPosY.textContent = pos ? pos.y.toFixed(2) : '64';
  if (detailPosZ) detailPosZ.textContent = pos ? pos.z.toFixed(2) : '0';
  if (detailDimension) detailDimension.textContent = (pos && pos.dimension) ? pos.dimension : (data.dimension || 'minecraft:overworld');

  const spawn = data.spawnPosition || data.spawn;
  if (detailSpawnCoords) {
    if (spawn) {
      detailSpawnCoords.textContent = `X: ${spawn.x} Y: ${spawn.y} Z: ${spawn.z} • ${spawn.dimension || 'overworld'}`;
      if (btnCopySpawnCoords) {
        btnCopySpawnCoords.style.display = 'inline-flex';
        btnCopySpawnCoords.dataset.coords = `${spawn.x} ${spawn.y} ${spawn.z}`;
      }
    } else {
      detailSpawnCoords.textContent = 'Non défini';
      if (btnCopySpawnCoords) btnCopySpawnCoords.style.display = 'none';
    }
  }

  const lastDeath = data.lastDeathPosition || data.lastDeath;
  if (detailDeathCoords) {
    if (lastDeath) {
      detailDeathCoords.textContent = `X: ${lastDeath.x} Y: ${lastDeath.y} Z: ${lastDeath.z} • ${lastDeath.dimension || 'overworld'}`;
      if (btnCopyDeathCoords) {
        btnCopyDeathCoords.style.display = 'inline-flex';
        btnCopyDeathCoords.dataset.coords = `${lastDeath.x} ${lastDeath.y} ${lastDeath.z}`;
      }
    } else {
      detailDeathCoords.textContent = 'Aucune mort enregistrée';
      if (btnCopyDeathCoords) btnCopyDeathCoords.style.display = 'none';
    }
  }

  // Statistiques
  const stats = data.stats || {};
  if (detailPlayTime) detailPlayTime.textContent = stats.playTimeFormatted || '0 min';
  if (detailPlayerKills) detailPlayerKills.textContent = stats.playerKills || 0;
  if (detailDeaths) detailDeaths.textContent = stats.deaths || 0;
  if (detailKdr) detailKdr.textContent = stats.kdr !== undefined ? stats.kdr : '0.0';
}

// ==========================================
// --- RENDU SKIN 3D JOUEUR ET ARMURE ---
// ==========================================

function setBoxUV(geometry, u, v, width, height, depth, texWidth = 64, texHeight = 32, mirrored = false) {
  const coord = (u0, v0, u1, v1) => {
    if (mirrored) {
      return [
        { x: u1 / texWidth, y: 1 - v1 / texHeight },
        { x: u0 / texWidth, y: 1 - v1 / texHeight },
        { x: u0 / texWidth, y: 1 - v0 / texHeight },
        { x: u1 / texWidth, y: 1 - v0 / texHeight }
      ];
    }
    return [
      { x: u0 / texWidth, y: 1 - v1 / texHeight },
      { x: u1 / texWidth, y: 1 - v1 / texHeight },
      { x: u1 / texWidth, y: 1 - v0 / texHeight },
      { x: u0 / texWidth, y: 1 - v0 / texHeight }
    ];
  };

  const top = coord(u + depth, v, u + width + depth, v + depth);
  const bottom = coord(u + width + depth, v, u + 2 * width + depth, v + depth);
  const right = coord(u, v + depth, u + depth, v + depth + height);
  const front = coord(u + depth, v + depth, u + width + depth, v + depth + height);
  const left = coord(u + width + depth, v + depth, u + width + 2 * depth, v + height + depth);
  const back = coord(u + width + 2 * depth, v + depth, u + 2 * width + 2 * depth, v + height + depth);

  const faces = mirrored ? [
    [right[3], right[2], right[0], right[1]],
    [left[3], left[2], left[0], left[1]],
    [top[3], top[2], top[0], top[1]],
    [bottom[0], bottom[1], bottom[3], bottom[2]],
    [front[3], front[2], front[0], front[1]],
    [back[3], back[2], back[0], back[1]]
  ] : [
    [left[3], left[2], left[0], left[1]],
    [right[3], right[2], right[0], right[1]],
    [top[3], top[2], top[0], top[1]],
    [bottom[0], bottom[1], bottom[3], bottom[2]],
    [front[3], front[2], front[0], front[1]],
    [back[3], back[2], back[0], back[1]]
  ];

  const uvs = [];
  for (const face of faces) {
    for (const pt of face) {
      uvs.push(pt.x, pt.y);
    }
  }
  const uvAttr = geometry.attributes.uv;
  uvAttr.set(new Float32Array(uvs));
  uvAttr.needsUpdate = true;
}

const _armorTextureCache = new Map();
const _item3dTextureCache = new Map();

function loadHtmlImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    if (!url.startsWith('/') && !url.startsWith('.')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadPixelCanvasTexture(url) {
  if (!url) return null;
  if (_item3dTextureCache.has(url)) {
    return _item3dTextureCache.get(url);
  }
  const p = (async () => {
    const img = await loadHtmlImage(url);
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    const tex = new skinview3d.CanvasTexture(canvas);
    tex.magFilter = 1003; // NearestFilter
    tex.minFilter = 1003; // NearestFilter
    tex.needsUpdate = true;
    tex.texWidth = canvas.width;
    tex.texHeight = canvas.height;
    return tex;
  })();
  _item3dTextureCache.set(url, p);
  const res = await p;
  if (!res) _item3dTextureCache.delete(url);
  else if (_item3dTextureCache.size > 200) {
    const oldest = _item3dTextureCache.keys().next().value;
    _item3dTextureCache.delete(oldest);
  }
  return res;
}

const KNOWN_VANILLA_ARMOR_MATS = new Set(['leather', 'iron', 'gold', 'golden', 'diamond', 'netherite', 'chainmail', 'turtle']);

async function getArmorTexture(itemIdOrMaterial, layerNum, dyedColor, assetId = null) {
  if (!itemIdOrMaterial) return null;
  const worldIdResolved = (currentPlayerDetailData && currentPlayerDetailData.worldId) || currentPlayersWorldId || activeWorld || '';
  const worldParam = encodeURIComponent(worldIdResolved);
  const assetParam = assetId ? `&assetId=${encodeURIComponent(assetId)}` : '';
  const cacheKey = `${worldParam}:${itemIdOrMaterial}_l${layerNum}_${assetId || ''}_${dyedColor !== null && dyedColor !== undefined ? dyedColor : 'default'}`;
  if (_armorTextureCache.has(cacheKey)) {
    return _armorTextureCache.get(cacheKey);
  }

  const p = (async () => {
    try {
      const cleanId = String(itemIdOrMaterial).toLowerCase();
      const isLeather = cleanId.startsWith('minecraft:leather_') || cleanId === 'leather';
      const colorParam = (dyedColor !== null && dyedColor !== undefined) ? `&color=${encodeURIComponent(dyedColor)}` : '';
      const apiUrl = `/api/armor-texture?worldId=${worldParam}&item=${encodeURIComponent(itemIdOrMaterial)}&layer=${layerNum}${colorParam}${assetParam}`;

      let baseImg = await loadHtmlImage(apiUrl);
      if (!baseImg && cleanId.startsWith('minecraft:')) {
        const prefix = cleanId.replace(/^minecraft:/, '').split('_')[0];
        if (KNOWN_VANILLA_ARMOR_MATS.has(prefix)) {
          const matFile = prefix === 'golden' ? 'gold' : prefix;
          baseImg = await loadHtmlImage(`/assets/minecraft/armor/${matFile}_layer_${layerNum}.png`);
        }
      }
      if (!baseImg || !baseImg.naturalWidth || !baseImg.naturalHeight) return null;

      const canvas = document.createElement('canvas');
      canvas.width = baseImg.naturalWidth || 64;
      canvas.height = baseImg.naturalHeight || 32;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(baseImg, 0, 0);

      if (isLeather) {
        const color = (dyedColor !== null && dyedColor !== undefined) ? dyedColor : 0xA06540;
        const cr = (color >> 16) & 0xff;
        const cg = (color >> 8) & 0xff;
        const cb = color & 0xff;
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 0) {
            const gray = d[i] / 255;
            d[i] = Math.round(gray * cr);
            d[i + 1] = Math.round(gray * cg);
            d[i + 2] = Math.round(gray * cb);
          }
        }
        ctx.putImageData(imgData, 0, 0);

        const overlayPath = `/assets/minecraft/armor/leather_layer_${layerNum}_overlay.png`;
        const overlayImg = await loadHtmlImage(overlayPath);
        if (overlayImg) {
          ctx.drawImage(overlayImg, 0, 0, canvas.width, canvas.height);
        }
      }

      const tex = new skinview3d.CanvasTexture(canvas);
      tex.magFilter = 1003; // NearestFilter
      tex.minFilter = 1003; // NearestFilter
      tex.needsUpdate = true;
      tex.texWidth = canvas.width;
      tex.texHeight = canvas.height;
      return tex;
    } catch (e) {
      console.warn('Failed to load armor texture:', itemIdOrMaterial, layerNum, e);
      return null;
    }
  })();

  _armorTextureCache.set(cacheKey, p);
  const result = await p;
  if (!result) _armorTextureCache.delete(cacheKey);
  else if (_armorTextureCache.size > 160) {
    const oldest = _armorTextureCache.keys().next().value;
    _armorTextureCache.delete(oldest);
  }
  return result;
}

function createArmorMaterial(texture, isEnchanted) {
  const mat = new skinview3d.MeshStandardMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.1,
    depthWrite: true,
    side: 2, // DoubleSide
    roughness: 1.0,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  if (isEnchanted) {
    mat.emissive.setHex(0x6b21a8); // Lueur violette d'enchantement
    mat.emissiveIntensity = 0.45;
  }
  return mat;
}

function normalizeEquipmentSlots(inventoryOrSlots, selectedSlot = 0) {
  if (!inventoryOrSlots) return {};
  if (!Array.isArray(inventoryOrSlots)) {
    return inventoryOrSlots;
  }
  const slots = {};
  const safeSelected = (typeof selectedSlot === 'number' && selectedSlot >= 0 && selectedSlot <= 8) ? selectedSlot : 0;
  for (const item of inventoryOrSlots) {
    if (!item || item.slot === undefined) continue;
    if (item.slot === 103) slots.helmet = item;
    else if (item.slot === 102) slots.chestplate = item;
    else if (item.slot === 101) slots.leggings = item;
    else if (item.slot === 100) slots.boots = item;
    else if (item.slot === -106 || item.slot === 150) slots.offhand = item;
    else if (item.slot === safeSelected) slots.mainHand = item;
  }
  return slots;
}

async function loadSkinWithFallbacks(viewer, playerName, playerUuid) {
  if (!viewer) return;
  const cleanUuid = playerUuid ? playerUuid.replace(/[^a-zA-Z0-9]/g, '') : '';
  const safeName = (playerName || 'steve').replace(/[^a-zA-Z0-9_]/g, '') || 'steve';

  const candidates = [];
  // 1. Minotar direct depuis le client (garanti de fonctionner si la tête s'affiche)
  candidates.push(`https://minotar.net/skin/${encodeURIComponent(safeName)}`);
  if (cleanUuid) {
    candidates.push(`https://minotar.net/skin/${encodeURIComponent(cleanUuid)}`);
    candidates.push(`https://crafatar.com/skins/${encodeURIComponent(cleanUuid)}`);
    candidates.push(`https://mc-heads.net/skin/${encodeURIComponent(cleanUuid)}`);
  }
  // 2. MC-Heads par nom
  candidates.push(`https://mc-heads.net/skin/${encodeURIComponent(safeName)}`);
  // 3. API locale proxyfiée
  candidates.push(`/api/player-skin?name=${encodeURIComponent(safeName)}&uuid=${encodeURIComponent(cleanUuid)}&_t=${Date.now()}`);
  // 4. Fallback local Steve
  candidates.push('/assets/minecraft/skin/steve.png');

  for (const url of candidates) {
    try {
      await viewer.loadSkin(url);
      return true;
    } catch (e) {
      // Tenter le candidat suivant
    }
  }
  return false;
}

function attach3DSkinDragRotation() {
  // Rotation manuelle volontairement désactivée : le modèle 3D reste fixe face à l'utilisateur (style inventaire Minecraft)
  detach3DSkinDragListeners();
}

async function initOrUpdate3DPlayer(playerName, inventory, playerUuid = null, selectedSlot = 0) {
  if (!player3dCanvas || typeof skinview3d === 'undefined') return;

  // Détruit le viewer existant si le joueur change
  if (_skinViewer && _skinViewer._playerName !== playerName) {
    try { _skinViewer.dispose(); } catch (e) { }
    _skinViewer = null;
  }

  // Affiche le spinner de chargement uniquement si création initiale
  const isFreshViewer = !_skinViewer;
  if (isFreshViewer && player3dLoading) player3dLoading.classList.remove('hidden');

  try {
    if (!_skinViewer) {
      _skinViewer = new skinview3d.SkinViewer({
        canvas: player3dCanvas,
        width: 162,
        height: 218,
        zoom: 0.78,
        fov: 48,
        enableControls: false,
        renderPaused: false
      });
      _skinViewer._playerName = playerName;

      // Fond transparent
      _skinViewer.background = null;
      _skinViewer.renderer.setClearColor(0x000000, 0);

      // Caméra cadrée sur le joueur entier (casque, bottes, armes et élytres 100% visibles)
      _skinViewer.camera.rotation.set(0, 0, 0);
      _skinViewer.fov = 48;
      _skinViewer.zoom = 0.78;

      // Animation idle Minecraft (respiration)
      _skinViewer.animation = new skinview3d.IdleAnimation();
      _skinViewer.animation.speed = 0.4;

      // Désactivation formelle de la rotation, du zoom et du pan
      if (_skinViewer.controls) {
        _skinViewer.controls.enabled = false;
        _skinViewer.controls.enableZoom = false;
        _skinViewer.controls.enablePan = false;
        _skinViewer.controls.enableRotate = false;
      }

      // Suivi de la souris : tête et yeux suivent le curseur (atténué lorsqu'on regarde le dos du skin)
      if (_mouseMoveListener) {
        document.removeEventListener('mousemove', _mouseMoveListener);
      }
      _mouseMoveListener = (e) => {
        if (_isDragging3DSkin || !_skinViewer || !_skinViewer.playerObject || !_skinViewer.playerObject.skin) return;
        const rect = player3dCanvas.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height * 0.25;

        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;

        const frontFactor = Math.max(0, Math.cos(_skinViewer.playerObject.rotation.y || 0));
        const yaw = Math.atan2(dx, 130) * frontFactor;
        const pitch = Math.atan2(dy, 130) * frontFactor;

        const clampedYaw = Math.max(-0.75, Math.min(0.75, yaw));
        const clampedPitch = Math.max(-0.45, Math.min(0.45, pitch));

        const head = _skinViewer.playerObject.skin.head;
        head.rotation.y = clampedYaw;
        head.rotation.x = clampedPitch;
        _skinViewer.playerObject.skin.body.rotation.y = clampedYaw * 0.25;
      };
      document.addEventListener('mousemove', _mouseMoveListener);

      // Chargement garanti du skin avec cascade de fallbacks
      await loadSkinWithFallbacks(_skinViewer, playerName, playerUuid);
    } else {
      // Si le viewer existe déjà, met à jour le skin
      await loadSkinWithFallbacks(_skinViewer, playerName, playerUuid);
    }

    // Application dynamique de TOUT l'équipement 3D (armure, élytres, têtes/blocs sur la tête, main principale, seconde main)
    await _apply3DArmor(_skinViewer, inventory, selectedSlot);

  } catch (err) {
    console.warn('3D skin error:', err);
  } finally {
    if (player3dLoading) {
      setTimeout(() => player3dLoading.classList.add('hidden'), isFreshViewer ? 250 : 60);
    }
  }
}

const VANILLA_MOB_HEAD_IDS = new Set([
  'minecraft:creeper_head',
  'minecraft:zombie_head',
  'minecraft:skeleton_skull',
  'minecraft:wither_skeleton_skull',
  'minecraft:piglin_head',
  'minecraft:dragon_head'
]);

function dispose3DEquipment(viewer) {
  if (!viewer) return;
  if (viewer.playerObject && viewer.playerObject.skin) {
    if (viewer.playerObject.skin.rightArm) viewer.playerObject.skin.rightArm.rotation.x = 0;
    if (viewer.playerObject.skin.leftArm) viewer.playerObject.skin.leftArm.rotation.x = 0;
  }
  if (viewer.playerObject && viewer.playerObject.elytra) {
    viewer.playerObject.elytra.visible = false;
    if (viewer.playerObject.elytra.material && viewer.playerObject.elytra.material.emissive) {
      viewer.playerObject.elytra.material.emissive.setHex(0x000000);
      viewer.playerObject.elytra.material.emissiveIntensity = 0;
    }
  }
  if (!Array.isArray(viewer._armorMeshes)) {
    viewer._armorMeshes = [];
    return;
  }
  for (const obj of viewer._armorMeshes) {
    if (obj.parent) obj.parent.remove(obj);
    const disposeNode = (n) => {
      if (!n) return;
      if (n.children && n.children.length > 0) {
        n.children.forEach(disposeNode);
      }
      try {
        if (n.geometry) n.geometry.dispose();
        if (n.material) {
          if (Array.isArray(n.material)) n.material.forEach(m => m && m.dispose && m.dispose());
          else if (n.material.dispose) n.material.dispose();
        }
      } catch (_) { }
    };
    disposeNode(obj);
  }
  viewer._armorMeshes = [];
}

async function _apply3DArmor(viewer, inventoryOrSlots, selectedSlot = 0) {
  if (!viewer || !viewer.playerObject || !viewer.playerObject.skin) return;

  // Jeton de séquence anti-concurrence pour le live polling
  const seq = (viewer._armorRenderSeq || 0) + 1;
  viewer._armorRenderSeq = seq;
  const isStale = () => !viewer || viewer._armorRenderSeq !== seq;

  dispose3DEquipment(viewer);

  const slots = normalizeEquipmentSlots(inventoryOrSlots, selectedSlot);
  const skin = viewer.playerObject.skin;
  const BoxGeometry = skinview3d.BoxGeometry;
  const Mesh = skinview3d.Mesh;
  const worldIdResolved = (currentPlayerDetailData && currentPlayerDetailData.worldId) || currentPlayersWorldId || activeWorld || '';
  const worldParam = encodeURIComponent(worldIdResolved);

  const registerObj = (parent, obj) => {
    parent.add(obj);
    if (!Array.isArray(viewer._armorMeshes)) viewer._armorMeshes = [];
    viewer._armorMeshes.push(obj);
    return obj;
  };

  const addArmorMesh = (parent, geometry, material, posY = 0, posX = 0, posZ = 0, renderOrder = 3) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(posX, posY, posZ);
    mesh.renderOrder = renderOrder;
    return registerObj(parent, mesh);
  };

  // =========================================================================
  // 1. TÊTE / CASQUE / BLOC PORTABLE / TÊTE DE JOUEUR OU MOB (Slot 103)
  // =========================================================================
  if (slots.helmet && slots.helmet.id && skin.head) {
    const helm = slots.helmet;
    const helmId = String(helm.id).toLowerCase();
    let headRendered = false;

    // 1a. Tête de joueur (minecraft:player_head)
    if (helmId === 'minecraft:player_head') {
      const owner = (helm.skullOwner || '').replace(/[^a-zA-Z0-9_]/g, '');
      const skinUrl = owner ? `https://minotar.net/skin/${encodeURIComponent(owner)}` : '/assets/minecraft/skin/steve.png';
      let tex = await loadPixelCanvasTexture(skinUrl);
      if (!tex && owner) tex = await loadPixelCanvasTexture('/assets/minecraft/skin/steve.png');
      if (isStale()) return;
      if (tex) {
        const tw = tex.texWidth || 64;
        const th = tex.texHeight || 64;
        const mat = createArmorMaterial(tex, helm.isEnchanted);
        const innerGeo = new BoxGeometry(9.2, 9.2, 9.2);
        setBoxUV(innerGeo, 0, 0, 8, 8, 8, tw, th);
        addArmorMesh(skin.head, innerGeo, mat, 4, 0, 0);

        const hatGeo = new BoxGeometry(9.7, 9.7, 9.7);
        setBoxUV(hatGeo, 32, 0, 8, 8, 8, tw, th);
        addArmorMesh(skin.head, hatGeo, mat, 4, 0, 0);
        headRendered = true;
      }
    }

    // 1b. Têtes de monstres Vanilla (Creeper, Zombie, Squelette, Wither, Piglin, Dragon)
    if (!headRendered && VANILLA_MOB_HEAD_IDS.has(helmId)) {
      const tex = await getArmorTexture(helmId, 1, null, null);
      if (isStale()) return;
      if (tex) {
        const tw = tex.texWidth || 64;
        const th = tex.texHeight || 64;
        const mat = createArmorMaterial(tex, helm.isEnchanted);
        if (helmId === 'minecraft:piglin_head') {
          const geo = new BoxGeometry(10.6, 9.2, 9.2);
          setBoxUV(geo, 0, 0, 10, 8, 8, tw, th);
          addArmorMesh(skin.head, geo, mat, 4, 0, 0);
        } else if (helmId === 'minecraft:dragon_head' && tw >= 256) {
          const geo = new BoxGeometry(10.2, 10.2, 10.2);
          setBoxUV(geo, 112, 30, 16, 16, 16, tw, th);
          addArmorMesh(skin.head, geo, mat, 4.4, 0, 0);
        } else {
          const geo = new BoxGeometry(9.3, 9.3, 9.3);
          setBoxUV(geo, 0, 0, 8, 8, 8, tw, th);
          addArmorMesh(skin.head, geo, mat, 4, 0, 0);
        }
        headRendered = true;
      }
    }

    // 1c. Casque d'armure standard ou moddé (64x32, 128x64, 64x64 entity/IceAndFire, 1.21.2+ assetId, 128x128 MCreator)
    // Inclut la coque principale (0, 0) ET la surcouche visière / cimier / cornes (32, 0), nettement au-dessus de head.outerLayer (9x9x9)
    if (!headRendered) {
      const tex = await getArmorTexture(helm.id, 1, helm.dyedColor, helm.equippable?.assetId);
      if (isStale()) return;
      if (tex) {
        const mat = createArmorMaterial(tex, helm.isEnchanted);
        const tw = tex.texWidth || 64;
        const th = tex.texHeight || 32;
        const innerHelmGeo = new BoxGeometry(9.8, 9.8, 9.8);
        const outerHelmGeo = new BoxGeometry(10.4, 10.4, 10.4);
        if (tw === 128 && th === 128) {
          setBoxUV(innerHelmGeo, 0, 0, 8, 8, 8, 128, 128);
          setBoxUV(outerHelmGeo, 32, 0, 8, 8, 8, 128, 128);
        } else {
          const s = (tw / th === 2) ? (tw / 64) : 1;
          setBoxUV(innerHelmGeo, 0, 0, 8 * s, 8 * s, 8 * s, tw, th);
          setBoxUV(outerHelmGeo, 32 * s, 0, 8 * s, 8 * s, 8 * s, tw, th);
        }
        addArmorMesh(skin.head, innerHelmGeo, mat, 4, 0, 0);
        addArmorMesh(skin.head, outerHelmGeo, mat, 4, 0, 0);
        headRendered = true;
      }
    }

    // 1d. Tout autre bloc ou objet portable sur la tête (citrouille sculptée, lanterne, verre, TNT, chapeaux/blocs moddés)
    if (!headRendered) {
      const baseItemUrl = `/api/item-texture?worldId=${worldParam}&item=${encodeURIComponent(helm.id)}`;
      const [frontTex, sideTex, topTex, bottomTex] = await Promise.all([
        loadPixelCanvasTexture(`${baseItemUrl}&face=front`),
        loadPixelCanvasTexture(`${baseItemUrl}&face=side`),
        loadPixelCanvasTexture(`${baseItemUrl}&face=top`),
        loadPixelCanvasTexture(`${baseItemUrl}&face=bottom`)
      ]);
      if (isStale()) return;
      const fallbackTex = frontTex || sideTex || topTex || bottomTex;
      if (fallbackTex) {
        const mkMat = (t) => createArmorMaterial(t || fallbackTex, helm.isEnchanted);
        // BoxGeometry face order: +x (right), -x (left), +y (top), -y (bottom), +z (front), -z (back)
        const materials = [
          mkMat(sideTex),
          mkMat(sideTex),
          mkMat(topTex),
          mkMat(bottomTex || topTex),
          mkMat(frontTex),
          mkMat(sideTex)
        ];
        const blockGeo = new BoxGeometry(9.9, 9.9, 9.9);
        addArmorMesh(skin.head, blockGeo, materials, 4.2, 0, 0);
      }
    }
  }

  // =========================================================================
  // 2. TORSE : ÉLYTRES / AILES OU PLASTRON (Slot 102)
  // =========================================================================
  const armWidthChest = skin.slim ? 4.4 : 5.2;
  if (slots.chestplate && slots.chestplate.id) {
    const chest = slots.chestplate;
    const chestId = String(chest.id).toLowerCase();
    const isWings = chestId.includes('elytra') || chestId.includes('wings');

    if (isWings && viewer.playerObject && viewer.playerObject.elytra) {
      let wingTex = await getArmorTexture(chest.id, 1, chest.dyedColor, chest.equippable?.assetId);
      if (!wingTex) {
        wingTex = await loadPixelCanvasTexture(`/api/item-texture?worldId=${worldParam}&item=${encodeURIComponent(chest.id)}`);
      }
      if (isStale()) return;
      if (wingTex) {
        const elytraObj = viewer.playerObject.elytra;
        elytraObj.map = wingTex;
        if (elytraObj.material && elytraObj.material.emissive) {
          if (chest.isEnchanted) {
            elytraObj.material.emissive.setHex(0x6b21a8);
            elytraObj.material.emissiveIntensity = 0.45;
          } else {
            elytraObj.material.emissive.setHex(0x000000);
            elytraObj.material.emissiveIntensity = 0;
          }
        }
        elytraObj.resetJoints();
        elytraObj.visible = true;
      }
    } else {
      const tex = await getArmorTexture(chest.id, 1, chest.dyedColor, chest.equippable?.assetId);
      if (isStale()) return;
      if (tex) {
        const mat = createArmorMaterial(tex, chest.isEnchanted);
        const tw = tex.texWidth || 64;
        const th = tex.texHeight || 32;

        if (tw === 128 && th === 128) {
          // Modèle MCreator ou entité 128x128 (ex: born_in_chaos)
          if (skin.body) {
            const bodyGeo = new BoxGeometry(9.7, 13.4, 5.7);
            setBoxUV(bodyGeo, 29, 0, 8, 14, 4, 128, 128);
            addArmorMesh(skin.body, bodyGeo, mat, 0, 0);

            const robeGeo = new BoxGeometry(10.1, 13.8, 6.1);
            setBoxUV(robeGeo, 26, 26, 8, 14, 4, 128, 128);
            addArmorMesh(skin.body, robeGeo, mat, 0, 0);
          }

          if (skin.rightArm && skin.rightArm.children[0]) {
            const rArmGeo = new BoxGeometry(armWidthChest, 13.4, 5.4);
            setBoxUV(rArmGeo, 91, 0, 4, 12, 4, 128, 128, false);
            addArmorMesh(skin.rightArm.children[0], rArmGeo, mat, 0, 0);

            const rShoulder = new BoxGeometry(armWidthChest + 0.5, 5.6, 5.8);
            setBoxUV(rShoulder, 90, 28, 4, 4, 4, 128, 128, false);
            addArmorMesh(skin.rightArm.children[0], rShoulder, mat, 4, 0);
          }

          if (skin.leftArm && skin.leftArm.children[0]) {
            const lArmGeo = new BoxGeometry(armWidthChest, 13.4, 5.4);
            setBoxUV(lArmGeo, 91, 0, 4, 12, 4, 128, 128, true);
            addArmorMesh(skin.leftArm.children[0], lArmGeo, mat, 0, 0);

            const lShoulder = new BoxGeometry(armWidthChest + 0.5, 5.6, 5.8);
            setBoxUV(lShoulder, 90, 28, 4, 4, 4, 128, 128, true);
            addArmorMesh(skin.leftArm.children[0], lShoulder, mat, 4, 0);
          }
        } else {
          // Modèle standard Minecraft Vanilla et mods (64x32, 128x64, ou 64x64 entity/IceAndFire)
          // Dimensions strictement supérieures à body.outerLayer (8.5x12.5x4.5) et arm.outerLayer (4.5x12.5x4.5)
          const s = (tw / th === 2) ? (tw / 64) : 1;
          if (skin.body) {
            const bodyGeo = new BoxGeometry(9.7, 13.4, 5.7);
            setBoxUV(bodyGeo, 16 * s, 16 * s, 8 * s, 12 * s, 4 * s, tw, th);
            addArmorMesh(skin.body, bodyGeo, mat, 0, 0);
          }

          if (skin.rightArm && skin.rightArm.children[0]) {
            const rArmGeo = new BoxGeometry(armWidthChest, 13.4, 5.4);
            setBoxUV(rArmGeo, 40 * s, 16 * s, 4 * s, 12 * s, 4 * s, tw, th, false);
            addArmorMesh(skin.rightArm.children[0], rArmGeo, mat, 0, 0);
          }

          if (skin.leftArm && skin.leftArm.children[0]) {
            const lArmGeo = new BoxGeometry(armWidthChest, 13.4, 5.4);
            setBoxUV(lArmGeo, 40 * s, 16 * s, 4 * s, 12 * s, 4 * s, tw, th, true);
            addArmorMesh(skin.leftArm.children[0], lArmGeo, mat, 0, 0);
          }
        }
      }
    }
  }

  // =========================================================================
  // 3. JAMBIÈRES / LEGGINGS (Slot 101) — Strictement > leg.outerLayer (4.5x12.5x4.5)
  // =========================================================================
  if (slots.leggings && slots.leggings.id) {
    const tex = await getArmorTexture(slots.leggings.id, 2, slots.leggings.dyedColor, slots.leggings.equippable?.assetId);
    if (isStale()) return;
    if (tex) {
      const mat = createArmorMaterial(tex, slots.leggings.isEnchanted);
      const tw = tex.texWidth || 64;
      const th = tex.texHeight || 32;
      const s = (tw / th === 2) ? (tw / 64) : 1;

      if (skin.body) {
        const beltGeo = new BoxGeometry(9.1, 12.9, 5.1);
        setBoxUV(beltGeo, 16 * s, 16 * s, 8 * s, 12 * s, 4 * s, tw, th);
        addArmorMesh(skin.body, beltGeo, mat, 0, 0, 0, 2);
      }

      if (skin.rightLeg && skin.rightLeg.children[0]) {
        const rLegGeo = new BoxGeometry(4.9, 12.9, 4.9);
        setBoxUV(rLegGeo, 0, 16 * s, 4 * s, 12 * s, 4 * s, tw, th, false);
        addArmorMesh(skin.rightLeg.children[0], rLegGeo, mat, 0, 0, 0, 2);
      }

      if (skin.leftLeg && skin.leftLeg.children[0]) {
        const lLegGeo = new BoxGeometry(4.9, 12.9, 4.9);
        setBoxUV(lLegGeo, 0, 16 * s, 4 * s, 12 * s, 4 * s, tw, th, true);
        addArmorMesh(skin.leftLeg.children[0], lLegGeo, mat, 0, 0, 0, 2);
      }
    }
  }

  // =========================================================================
  // 4. BOTTES / BOOTS (Slot 100) — Strictement > jambières (4.9x12.9x4.9)
  // =========================================================================
  if (slots.boots && slots.boots.id) {
    const tex = await getArmorTexture(slots.boots.id, 1, slots.boots.dyedColor, slots.boots.equippable?.assetId);
    if (isStale()) return;
    if (tex) {
      const mat = createArmorMaterial(tex, slots.boots.isEnchanted);
      const tw = tex.texWidth || 64;
      const th = tex.texHeight || 32;
      const s = (tw / th === 2) ? (tw / 64) : 1;

      if (skin.rightLeg && skin.rightLeg.children[0]) {
        const rBootGeo = new BoxGeometry(5.35, 13.4, 5.35);
        setBoxUV(rBootGeo, 0, 16 * s, 4 * s, 12 * s, 4 * s, tw, th, false);
        addArmorMesh(skin.rightLeg.children[0], rBootGeo, mat, 0, 0);
      }

      if (skin.leftLeg && skin.leftLeg.children[0]) {
        const lBootGeo = new BoxGeometry(5.35, 13.4, 5.35);
        setBoxUV(lBootGeo, 0, 16 * s, 4 * s, 12 * s, 4 * s, tw, th, true);
        addArmorMesh(skin.leftLeg.children[0], lBootGeo, mat, 0, 0);
      }
    }
  }

  // =========================================================================
  // 5. MAIN PRINCIPALE (Slot hotbar actif) & SECONDE MAIN (-106 / 150)
  // =========================================================================
  const isHandheldToolOrWeapon = (idLower) => {
    const base = idLower.includes(':') ? idLower.split(':')[1] : idLower;
    return /(?:^|_)(sword|pickaxe|axe|shovel|hoe|trident|mace|stick|rod|bow|crossbow|shears|flint_and_steel|brush|spyglass|dagger|scythe|spear|hammer|halberd|katana|blade|sabre|saber|wand|staff|knife|club|cleaver|battleaxe|warhammer|greatsword|longsword|rapier|glaive|pike|gun|rifle|pistol|shotgun|smg|sniper|carbine|ak47|hk416|scar|m4|g36|glock|revolver|bazooka|launcher|wrench|torch)(?:$|_)/.test(base);
  };

  const isHeldBlockItem = (idLower) => {
    const base = idLower.includes(':') ? idLower.split(':')[1] : idLower;
    if (isHandheldToolOrWeapon(idLower) || base.includes('seed') || base.includes('ingot') || base.includes('nugget') || base.includes('dust') || base.includes('dye') || base.includes('ball') || base.includes('pearl') || base.includes('crystal') || base.includes('meat') || base.includes('bread') || base.includes('apple') || base.includes('potion') || base.includes('bucket') || base.includes('book') || base.includes('arrow') || base.includes('bone') || base.includes('key') || base.includes('rocket') || base.includes('bundle') || base.includes('bed') || base.includes('door') || base.includes('sign') || base.includes('boat')) {
      return false;
    }
    return /(?:^|_)(tnt|stone|cobblestone|deepslate|dirt|grass_block|planks|log|wood|sand|gravel|glass|obsidian|bedrock|netherrack|end_stone|wool|concrete|terracotta|bricks|brick|ore|block|leaves|ice|snow_block|pumpkin|melon|furnace|crafting_table|chest|barrel|bookshelf|anvil|beacon|sponge|prismarine|quartz_block|hay_block|target|jukebox|note_block|dispenser|dropper|piston|observer|shulker_box)(?:$|_)/.test(base);
  };

  // Corrige les UVs de la face arrière (-z) d'une BoxGeometry pour qu'elle soit 100% alignée
  // pixel pour pixel avec la face avant (+z) — élimine totalement l'effet "X croisé"
  const createAlignedItemSlabGeo = (w, h, d = 0.35) => {
    const geo = new BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    if (uv && uv.array && uv.array.length >= 48) {
      // Face 5 (-z) : indices 40..47 -> inverser u (1 - u) pour correspondre exactement à Face 4 (+z)
      uv.array[40] = 1; uv.array[41] = 1;
      uv.array[42] = 0; uv.array[43] = 1;
      uv.array[44] = 1; uv.array[45] = 0;
      uv.array[46] = 0; uv.array[47] = 0;
      uv.needsUpdate = true;
    }
    return geo;
  };

  const attachHandItem = async (item, armGroup, isOffhand) => {
    if (!item || !item.id || !armGroup || !armGroup.children[0]) return;
    const armInner = armGroup.children[0];
    const itemIdLower = String(item.id).toLowerCase();
    const isShield = itemIdLower === 'minecraft:shield' || itemIdLower.endsWith('_shield');

    // Posture naturelle du bras Minecraft lorsqu'un objet est tenu
    armGroup.rotation.x = isOffhand ? -0.24 : -0.32;

    if (isShield) {
      const shieldTex = await getArmorTexture(item.id, 1, item.dyedColor, null);
      if (isStale()) return;
      if (shieldTex) {
        const mat = createArmorMaterial(shieldTex, item.isEnchanted);
        const tw = shieldTex.texWidth || 64;
        const th = shieldTex.texHeight || 64;
        const plateGeo = new BoxGeometry(5.6, 10.4, 0.85);
        if (tw >= 64 && th >= 64) {
          setBoxUV(plateGeo, 0, 0, 12, 22, 1, tw, th, false);
        }
        const plateMesh = new Mesh(plateGeo, mat);
        plateMesh.position.set(isOffhand ? 2.15 : -2.15, -3.5, 2.05);
        plateMesh.rotation.set(0.08, isOffhand ? 0.38 : -0.38, 0);
        plateMesh.renderOrder = 3;

        // Poignée en bois au dos du bouclier
        const handleGeo = new BoxGeometry(1.0, 2.8, 2.2);
        if (tw >= 64 && th >= 64) {
          setBoxUV(handleGeo, 26, 0, 2, 6, 6, tw, th, false);
        }
        const handleMesh = new Mesh(handleGeo, mat);
        handleMesh.position.set(0, 0, -1.35);
        handleMesh.renderOrder = 3;
        plateMesh.add(handleMesh);

        registerObj(armInner, plateMesh);
        return;
      }
    }

    // Blocs tenus en main : mini-cube 3D authentique (comme en jeu)
    if (isHeldBlockItem(itemIdLower)) {
      const baseItemUrl = `/api/item-texture?worldId=${worldParam}&item=${encodeURIComponent(item.id)}&v=6`;
      const [frontTex, sideTex, topTex, bottomTex] = await Promise.all([
        loadPixelCanvasTexture(`${baseItemUrl}&face=front`),
        loadPixelCanvasTexture(`${baseItemUrl}&face=side`),
        loadPixelCanvasTexture(`${baseItemUrl}&face=top`),
        loadPixelCanvasTexture(`${baseItemUrl}&face=bottom`)
      ]);
      if (isStale()) return;
      const fallbackTex = frontTex || sideTex || topTex || bottomTex;
      if (fallbackTex) {
        const mkMat = (t) => createArmorMaterial(t || fallbackTex, item.isEnchanted);
        const materials = [
          mkMat(sideTex),
          mkMat(sideTex),
          mkMat(topTex),
          mkMat(bottomTex || topTex),
          mkMat(frontTex),
          mkMat(sideTex)
        ];
        const miniBlockGeo = new BoxGeometry(4.4, 4.4, 4.4);
        const miniBlock = new Mesh(miniBlockGeo, materials);
        miniBlock.position.set(isOffhand ? 0.4 : -0.4, -4.6, 3.6);
        miniBlock.rotation.set(-0.35, isOffhand ? -0.75 : 0.75, 0);
        miniBlock.renderOrder = 3;
        registerObj(armInner, miniBlock);
        return;
      }
    }

    const colorParam = (item.dyedColor !== null && item.dyedColor !== undefined) ? `&color=${encodeURIComponent(item.dyedColor)}` : '';
    const itemUrl = `/api/item-texture?worldId=${worldParam}&item=${encodeURIComponent(item.id)}${colorParam}&v=6`;
    const tex = await loadPixelCanvasTexture(itemUrl);
    if (isStale() || !tex) return;

    // FrontSide uniquement + face arrière UV-alignée -> zéro croisement en "X" à travers la transparence
    const faceMat = new skinview3d.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.1,
      depthWrite: true,
      side: 0, // FrontSide
      roughness: 1.0,
      metalness: 0.0
    });
    if (item.isEnchanted) {
      faceMat.emissive.setHex(0x6b21a8);
      faceMat.emissiveIntensity = 0.45;
    }
    const invisibleEdgeMat = new skinview3d.MeshStandardMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const slabMaterials = [
      invisibleEdgeMat,
      invisibleEdgeMat,
      invisibleEdgeMat,
      invisibleEdgeMat,
      faceMat,
      faceMat
    ];

    const isTool = isHandheldToolOrWeapon(itemIdLower);
    const slabSize = isTool ? 8.0 : 5.6;
    const slabGeo = createAlignedItemSlabGeo(slabSize, slabSize, 0.35);
    const itemMesh = new Mesh(slabGeo, slabMaterials);
    itemMesh.rotation.order = 'YXZ';

    if (isTool) {
      // Orientation 3e personne Minecraft : manche ancré au centre du poing (y=-5.0, z=+1.0),
      // lame/tête projetée proprement vers l'avant (+Z) sans toucher l'avant-bras
      itemMesh.position.set(isOffhand ? 0.3 : -0.3, -3.4, 5.2);
      itemMesh.rotation.set(0, isOffhand ? -1.45 : -1.68, -0.42);
    } else {
      // Objet générique (perle, nourriture, potion, clé, objet moddé) tenu devant le poing face à la caméra
      itemMesh.position.set(isOffhand ? 0.35 : -0.35, -4.6, 3.3);
      itemMesh.rotation.set(-0.18, isOffhand ? 0.38 : -0.38, 0);
    }

    itemMesh.renderOrder = 3;
    registerObj(armInner, itemMesh);
  };

  if (slots.mainHand && skin.rightArm) {
    await attachHandItem(slots.mainHand, skin.rightArm, false);
  }
  if (slots.offhand && skin.leftArm) {
    await attachHandItem(slots.offhand, skin.leftArm, true);
  }
}

function updatePlayerToggle(btn, isActive) {
  if (!btn) return;
  const active = Boolean(isActive);
  btn.classList.toggle('active', active);
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  if (!btn.querySelector('.toggle-thumb')) {
    btn.innerHTML = '<span class="toggle-thumb"></span>';
  }
}
const updateOptionToggle = updatePlayerToggle;

// --- Tooltip Minecraft Flottant Instantané ---
let mcTooltipEl = null;

function showMcTooltip(e, it) {
  if (!mcTooltipEl) {
    mcTooltipEl = document.createElement('div');
    mcTooltipEl.id = 'mc-custom-tooltip';
    document.body.appendChild(mcTooltipEl);
  }
  if (!it) {
    mcTooltipEl.style.display = 'none';
    return;
  }

  const rawId = it.id || '';
  const cleanName = rawId.replace(/^minecraft:/, '').toLowerCase();
  const displayName = it.customName || it.name || cleanName;
  const isEnch = !!it.isEnchanted;

  let html = `<div class="mct-name${isEnch ? ' enchanted' : ''}">${escapeHtml(displayName)}${it.count > 1 ? ` x${it.count}` : ''}</div>`;

  if (it.enchants && it.enchants.length > 0) {
    html += '<div class="mct-enchants">';
    for (const ench of it.enchants) {
      html += `<div class="mct-enchant-item"><span class="mct-enchant-bullet">•</span> ${escapeHtml(ench.name)} ${escapeHtml(ench.romanLevel)}</div>`;
    }
    html += '</div>';
  }

  if (it.durability !== null && it.durability !== undefined && it.maxDamage) {
    const p = it.durabilityPercent !== null ? it.durabilityPercent : Math.round((it.durability / it.maxDamage) * 100);
    const colorStyle = p > 60 ? 'color: #4ade80;' : (p > 25 ? 'color: #facc15;' : 'color: #f87171;');
    html += `
      <div class="mct-durability">
        <span>Durabilité :</span>
        <span class="mct-durability-value" style="${colorStyle}">${it.durability} / ${it.maxDamage} (${p}%)</span>
      </div>
    `;
  } else if (it.damage !== null && it.damage > 0) {
    html += `
      <div class="mct-durability">
        <span>Dégâts subis :</span>
        <span class="mct-durability-value">${it.damage}</span>
      </div>
    `;
  }

  html += `<div class="mct-id">${escapeHtml(rawId)}</div>`;

  mcTooltipEl.innerHTML = html;
  mcTooltipEl.style.display = 'block';
  positionMcTooltip(e);
}

function positionMcTooltip(e) {
  if (!mcTooltipEl || mcTooltipEl.style.display === 'none') return;
  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  const rect = mcTooltipEl.getBoundingClientRect();
  if (x + rect.width > window.innerWidth - 8) {
    x = e.clientX - rect.width - pad;
  }
  if (y + rect.height > window.innerHeight - 8) {
    y = e.clientY - rect.height - pad;
  }
  mcTooltipEl.style.left = `${Math.max(8, x)}px`;
  mcTooltipEl.style.top = `${Math.max(8, y)}px`;
}

function hideMcTooltip() {
  if (mcTooltipEl) mcTooltipEl.style.display = 'none';
}

// Variable d'état de l'inventaire actif pour la délégation de survol
let activeInventoryItemsBySlot = {};

// Fonction de rendu des slots d'inventaire avec vraies textures extraites directement des mods / jeu (0 cache disque)
function renderPlayerInventory(items, targetWorldId = null, selectedSlot = null) {
  activeInventoryItemsBySlot = {};
  items.forEach(it => {
    activeInventoryItemsBySlot[it.slot] = it;
  });
  const itemsBySlot = activeInventoryItemsBySlot;

  const renderSlotContent = (slotNum, defaultPlaceholderImg = '') => {
    const it = itemsBySlot[slotNum];
    if (!it) {
      return defaultPlaceholderImg
        ? `<img class="slot-armor-placeholder" src="${defaultPlaceholderImg}" alt="Slot" />`
        : '';
    }

    const rawId = it.id || '';
    const cleanName = rawId.replace(/^minecraft:/, '').toLowerCase();
    const displayName = it.customName || it.name || cleanName;
    const countBadge = it.count > 1 ? `<span class="item-count">${it.count}</span>` : '';
    const resolvedWorld = targetWorldId || (currentPlayerDetailData && currentPlayerDetailData.worldId) || currentPlayersWorldId || activeWorld || '';
    const worldParam = encodeURIComponent(resolvedWorld);
    const colorParam = (it.dyedColor !== null && it.dyedColor !== undefined) ? `&color=${encodeURIComponent(it.dyedColor)}` : '';

    // Toutes les textures (mods et vanilla) sont extraites à la volée en mémoire depuis les JARs du monde
    const itemUrl = `/api/item-texture?worldId=${worldParam}&item=${encodeURIComponent(rawId)}${colorParam}&v=6`;
    const fallbackSvg = `/assets/minecraft/gui/unknown.svg`;

    const isEnch = !!it.isEnchanted;
    const enchantClass = isEnch ? ' enchanted' : '';
    const enchantSparkle = isEnch ? `<span class="enchant-sparkle"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9 12 2"/></svg></span>` : '';

    // Barre de durabilité Minecraft
    let durabilityBarHtml = '';
    if (it.durabilityPercent !== null && it.durabilityPercent !== undefined && it.durabilityPercent < 100) {
      const p = it.durabilityPercent;
      const levelClass = p > 60 ? 'high' : (p > 25 ? 'medium' : 'low');
      durabilityBarHtml = `
        <div class="mc-durability-bar">
          <div class="mc-durability-fill ${levelClass}" style="width: ${p}%;"></div>
        </div>
      `;
    }

    return `
      <img class="slot-item-img${enchantClass}"
           src="${itemUrl}" 
           alt="${escapeHtml(displayName)}" 
           loading="lazy"
           onerror="if(this.src !== '${fallbackSvg}'){ this.src='${fallbackSvg}'; }" />
      ${enchantSparkle}
      ${countBadge}
      ${durabilityBarHtml}
    `;
  };

  const updateArmorSlot = (slotEl, slotNum, defaultImg) => {
    if (!slotEl) return;
    const it = itemsBySlot[slotNum];
    if (it && it.isEnchanted) {
      slotEl.classList.add('has-enchanted');
    } else {
      slotEl.classList.remove('has-enchanted');
    }
    slotEl.innerHTML = renderSlotContent(slotNum, defaultImg);
    slotEl.removeAttribute('title');
  };

  // Armure (103: casque, 102: plastron, 101: jambières, 100: bottes)
  updateArmorSlot(slotHead, 103, '/assets/minecraft/gui/empty_helmet.png');
  updateArmorSlot(slotChest, 102, '/assets/minecraft/gui/empty_chestplate.png');
  updateArmorSlot(slotLegs, 101, '/assets/minecraft/gui/empty_leggings.png');
  updateArmorSlot(slotFeet, 100, '/assets/minecraft/gui/empty_boots.png');

  // Seconde main (-106 ou 150)
  if (slotOffhand) {
    const offhandItem = itemsBySlot[-106] || itemsBySlot[150];
    if (offhandItem && offhandItem.isEnchanted) {
      slotOffhand.classList.add('has-enchanted');
    } else {
      slotOffhand.classList.remove('has-enchanted');
    }
    slotOffhand.innerHTML = offhandItem
      ? renderSlotContent(offhandItem.slot, '/assets/minecraft/gui/empty_shield.png')
      : `<img class="slot-armor-placeholder" src="/assets/minecraft/gui/empty_shield.png" alt="Seconde main" />`;
    slotOffhand.removeAttribute('title');
  }

  // Inventaire principal (Slots 9 à 35 -> 27 cases)
  if (mainInventoryGrid) {
    let mainHtml = '';
    for (let s = 9; s <= 35; s++) {
      const it = itemsBySlot[s];
      const enchantClass = (it && it.isEnchanted) ? ' has-enchanted' : '';
      mainHtml += `<div class="mc-slot${enchantClass}" data-slot="${s}">${renderSlotContent(s)}</div>`;
    }
    mainInventoryGrid.innerHTML = mainHtml;
  }

  // Barre d'accès rapide (Slots 0 à 8 -> 9 cases, avec surbrillance de l'emplacement actif)
  if (hotbarGrid) {
    let hotbarHtml = '';
    for (let s = 0; s <= 8; s++) {
      const it = itemsBySlot[s];
      const enchantClass = (it && it.isEnchanted) ? ' has-enchanted' : '';
      const selectedClass = (selectedSlot !== null && selectedSlot !== undefined && Number(selectedSlot) === s) ? ' hotbar-selected' : '';
      hotbarHtml += `<div class="mc-slot${enchantClass}${selectedClass}" data-slot="${s}">${renderSlotContent(s)}</div>`;
    }
    hotbarGrid.innerHTML = hotbarHtml;
  }

  // Délégation de survol réactive pour tout l'inventaire
  const invContainer = document.querySelector('.mc-inventory-view');
  if (invContainer && !invContainer._hasTooltipDelegation) {
    invContainer._hasTooltipDelegation = true;

    invContainer.addEventListener('mousemove', (e) => {
      const slotEl = e.target.closest('.mc-slot');
      if (!slotEl) {
        hideMcTooltip();
        return;
      }
      const slotNum = slotEl.getAttribute('data-slot');
      const it = activeInventoryItemsBySlot[slotNum];
      if (it) {
        showMcTooltip(e, it);
      } else {
        hideMcTooltip();
      }
    });

    invContainer.addEventListener('mouseleave', () => {
      hideMcTooltip();
    });
  }
}

// Fonction centrale pour exécuter une action de gestion de joueur (sans clignotement du skin 3D)
async function executePlayerManagementAction(action, value = null) {
  if (!currentPlayersWorldId || !currentPlayerDetailName) {
    showToast('Aucun joueur sélectionné.', 'error');
    return null;
  }

  try {
    const res = await fetch('/api/players/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worldId: currentPlayersWorldId,
        player: currentPlayerDetailName,
        action,
        value
      })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erreur lors de l\'action');

    showToast(result.message || 'Action exécutée avec succès !', 'success');

    // Mise à jour optimiste immédiate avant le prochain tick NBT
    if (currentPlayerDetailData) {
      if (typeof result.health === 'number') currentPlayerDetailData.health = result.health;
      if (typeof result.foodLevel === 'number') currentPlayerDetailData.foodLevel = result.foodLevel;
      if (typeof result.gameMode === 'string') currentPlayerDetailData.gameMode = result.gameMode;
      renderPlayerDetailView(currentPlayerDetailData);
    }

    // Rafraîchissement fluide des données sans réinitialiser le viewer 3D
    await pollPlayerDetailTick(true);
    await refreshPlayersData();
    return result;
  } catch (err) {
    console.error('Erreur action joueur:', err);
    showToast(err.message, 'error');
    throw err;
  }
}

// Câblage des contrôles granulaires de Vie & Faim (Vider / -1 / +1 / Remplir)
document.querySelectorAll('.btn-vital-ctrl[data-vital-action]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (btn.disabled || _isVitalActionBusy) return;
    const vitalAction = btn.dataset.vitalAction;
    if (!vitalAction) return;
    _isVitalActionBusy = true;
    try {
      await executePlayerManagementAction(vitalAction);
    } catch (_) {
      // Toast déjà affiché dans executePlayerManagementAction
    } finally {
      _isVitalActionBusy = false;
    }
  });
});

// Câblage des boutons d'XP (-10, -5, -1, +1, +5, +10)
document.querySelectorAll('.btn-xp-chip').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    const amount = parseInt(btn.dataset.xp, 10);
    if (!isNaN(amount) && amount !== 0) {
      try {
        await executePlayerManagementAction('xp', amount);
      } catch (_) { }
    }
  });
});

// Fonction partagée pour changer le Mode de Jeu (optimiste + rollback en cas d'erreur)
async function applyPlayerGameModeSelection(selectedMode) {
  const targetPlayer = currentPlayerDetailName;
  if (!targetPlayer || !GAMEMODE_LABELS[selectedMode]) return;

  const previousMode = currentPlayerDetailData?.gameMode || 'survival';
  optimisticPlayerGameModes[targetPlayer.toLowerCase()] = selectedMode;
  if (currentPlayerDetailData) {
    currentPlayerDetailData.gameMode = selectedMode;
  }
  syncGameModeDropdownUI(selectedMode);

  try {
    await executePlayerManagementAction('gamemode', selectedMode);
  } catch (err) {
    delete optimisticPlayerGameModes[targetPlayer.toLowerCase()];
    if (currentPlayerDetailData) {
      currentPlayerDetailData.gameMode = previousMode;
    }
    syncGameModeDropdownUI(previousMode);
  }
}

// Câblage du menu déroulant Mode de Jeu custom (style identique au bouton Fermer ×)
if (detailGameModeTrigger && detailGameModeDropdown) {
  detailGameModeTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = detailGameModeDropdown.classList.contains('open');
    setGameModeDropdownOpen(!isOpen);
  });
}

if (detailGameModeMenu) {
  detailGameModeMenu.querySelectorAll('.gamemode-dropdown-option').forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = opt.dataset.value;
      closeGameModeDropdown();
      if (mode) applyPlayerGameModeSelection(mode);
    });
  });
}

document.addEventListener('click', (e) => {
  if (detailGameModeDropdown && detailGameModeDropdown.classList.contains('open') && !detailGameModeDropdown.contains(e.target)) {
    closeGameModeDropdown();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && detailGameModeDropdown && detailGameModeDropdown.classList.contains('open')) {
    e.preventDefault();
    e.stopPropagation();
    closeGameModeDropdown();
  }
}, true);

// Compatibilité éventuelle si le <select> caché reçoit un événement programmatique
if (detailGameModeSelect) {
  detailGameModeSelect.addEventListener('change', () => {
    applyPlayerGameModeSelection(detailGameModeSelect.value);
  });
}

// Câblage des toggles (Whitelist, Ban, Op)
if (toggleWhitelist) {
  toggleWhitelist.addEventListener('click', () => {
    executePlayerManagementAction('toggleControl', { type: 'whitelist' });
  });
}

if (toggleBanned) {
  toggleBanned.addEventListener('click', () => {
    executePlayerManagementAction('toggleControl', { type: 'bannedPlayers' });
  });
}

if (toggleOp) {
  toggleOp.addEventListener('click', () => {
    executePlayerManagementAction('toggleControl', { type: 'ops' });
  });
}

const btnDetailDeleteData = document.getElementById('btnDetailDeleteData');
let _detailDeleteTimeout = null;

if (btnDetailDeleteData) {
  btnDetailDeleteData.addEventListener('click', () => {
    if (!currentPlayerDetailName) return;

    if (btnDetailDeleteData.getAttribute('data-confirming') === 'true') {
      executeDeletePlayerData(currentPlayerDetailName);
      return;
    }

    btnDetailDeleteData.setAttribute('data-confirming', 'true');
    btnDetailDeleteData.classList.add('confirming-danger');
    btnDetailDeleteData.textContent = 'Confirmer suppression ?';
    showToast(`Cliquez à nouveau pour confirmer la suppression définitive des données de ${currentPlayerDetailName}.`, 'warning');

    clearTimeout(_detailDeleteTimeout);
    _detailDeleteTimeout = setTimeout(() => {
      btnDetailDeleteData.removeAttribute('data-confirming');
      btnDetailDeleteData.classList.remove('confirming-danger');
      btnDetailDeleteData.textContent = 'Supprimer les données';
    }, 4500);
  });
}

// Copie des coordonnées dans le presse-papier avec feedback visuel
function copyCoordsToClipboard(btn, text, label = 'Coordonnées') {
  if (!text) return;
  const doFeedback = () => {
    showToast(`${label} copiées : ${text}`, 'success');
    if (btn) {
      const origHtml = btn.innerHTML;
      btn.classList.add('copied');
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Copié !
      `;
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = origHtml;
      }, 1800);
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(doFeedback).catch(() => {
      fallbackCopy(text);
      doFeedback();
    });
  } else {
    fallbackCopy(text);
    doFeedback();
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { }
  document.body.removeChild(ta);
}

if (btnCopyPosCoords) {
  btnCopyPosCoords.addEventListener('click', () => {
    const x = detailPosX ? detailPosX.textContent : '0';
    const y = detailPosY ? detailPosY.textContent : '64';
    const z = detailPosZ ? detailPosZ.textContent : '0';
    copyCoordsToClipboard(btnCopyPosCoords, `${x} ${y} ${z}`, 'Position');
  });
}

if (btnCopySpawnCoords) {
  btnCopySpawnCoords.addEventListener('click', () => {
    const coords = btnCopySpawnCoords.dataset.coords || '';
    if (coords) copyCoordsToClipboard(btnCopySpawnCoords, coords, 'Réapparition');
  });
}

if (btnCopyDeathCoords) {
  btnCopyDeathCoords.addEventListener('click', () => {
    const coords = btnCopyDeathCoords.dataset.coords || '';
    if (coords) copyCoordsToClipboard(btnCopyDeathCoords, coords, 'Dernière mort');
  });
}

window.openPlayersManager = openPlayersManager;
window.openPlayerDetail = openPlayerDetail;
window.closePlayerDetail = closePlayerDetail;
window.removePlayerAction = removePlayerAction;
window.quickKickAction = quickKickAction;
window.quickBanAction = quickBanAction;
window.quickPlayerCommand = quickPlayerCommand;



// Manage World Modal (Onglet Crayon : Renommer, Exporter Zip, Réinitialiser dimensions)
let renamingWorldId = null;
const renameModal = document.getElementById('renameModal');
const renameNewName = document.getElementById('renameNewName');
const btnCloseRenameModal = document.getElementById('btnCloseRenameModal');
const btnCancelRename = document.getElementById('btnCancelRename');
const formRenameWorld = document.getElementById('formRenameWorld');

let defaultExportDestDir = '';

// Récupération du dossier Téléchargements de l'utilisateur
fetch('/api/worlds/export-destination')
  .then(r => r.json())
  .then(d => { if (d.defaultDestDir) defaultExportDestDir = d.defaultDestDir; })
  .catch(() => { });

function renderManageDimensions(worldId) {
  const container = document.getElementById('manageDimensionsList');
  if (!container) return;

  const world = worldsListCache.find(w => w.id === worldId);
  // Ne garder QUE Overworld, Nether, End s'ils sont chargés et créés
  const dims = (world && Array.isArray(world.dimensions))
    ? world.dimensions.filter(d => ['overworld', 'nether', 'the_end'].includes(d.id) && d.isLoaded)
    : [];

  if (dims.length === 0) {
    container.innerHTML = `
      <div style="color: var(--text-dim); font-size: 0.82rem; padding: 12px 14px; background: rgba(0, 0, 0, 0.2); border-radius: 8px; border: 1px dashed rgba(255, 255, 255, 0.1);">
        Aucune dimension générée ou explorée pour ce monde pour l'instant (le serveur n'a pas encore créé de région).
      </div>
    `;
    return;
  }

  container.innerHTML = dims.map(d => `
    <div class="dimension-card" id="dim-card-${d.id}">
      <div class="dimension-main-row">
        <div class="dimension-info">
          <div class="dimension-name-wrap">
            <span class="dimension-name">${escapeHtml(d.name)}</span>
            <span class="dimension-badge-loaded">Généré • <span class="dimension-size-text">${escapeHtml(d.size || '0 Mo')}</span></span>
          </div>
          <div class="dimension-meta">
            <span>Dossier: ${escapeHtml(d.folder || d.id)}</span>
          </div>
        </div>
        <button type="button" class="btn-reset-dim" id="btn-init-reset-${d.id}" onclick="promptDimensionReset('${worldId}', '${d.id}', '${escapeHtml(d.name)}')">
          Réinitialiser
        </button>
      </div>

      <!-- Double Approbation Inline -->
      <div class="dim-confirm-box" id="dim-confirm-${d.id}" style="display: none;">
        <div class="dim-confirm-warning">
          <strong>Confirmation requise</strong> : Tous les blocs, bâtiments et structures de <em>${escapeHtml(d.name)}</em> seront définitivement supprimés et régénérés à neuf lors du prochain lancement.
        </div>
        <div class="dim-confirm-actions">
          <button type="button" class="btn-cancel-dim-confirm" onclick="cancelDimensionReset('${d.id}')">Annuler</button>
          <button type="button" class="btn-execute-dim-reset" id="btn-exec-reset-${d.id}" onclick="executeDimensionReset('${worldId}', '${d.id}', '${escapeHtml(d.name)}')">
            Oui, Réinitialiser Définitivement
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// 1ère approbation : Ouvre la demande de confirmation
function promptDimensionReset(worldId, dimensionId, dimName) {
  if (serverStatus !== 'STOPPED' && (worldId === activeWorld || serverStatus === 'RUNNING')) {
    showToast('Arrête d\'abord le serveur avant de réinitialiser une dimension.', 'warning');
    return;
  }
  const confirmBox = document.getElementById(`dim-confirm-${dimensionId}`);
  const initBtn = document.getElementById(`btn-init-reset-${dimensionId}`);
  if (confirmBox) confirmBox.style.display = 'flex';
  if (initBtn) initBtn.style.display = 'none';
}
window.promptDimensionReset = promptDimensionReset;

// Annulation de la confirmation
function cancelDimensionReset(dimensionId) {
  const confirmBox = document.getElementById(`dim-confirm-${dimensionId}`);
  const initBtn = document.getElementById(`btn-init-reset-${dimensionId}`);
  if (confirmBox) confirmBox.style.display = 'none';
  if (initBtn) initBtn.style.display = 'inline-block';
}
window.cancelDimensionReset = cancelDimensionReset;

// 2ème approbation : Exécution avec retour visuel immédiat
async function executeDimensionReset(worldId, dimensionId, dimName) {
  if (serverStatus !== 'STOPPED' && (worldId === activeWorld || serverStatus === 'RUNNING')) {
    showToast('Arrête d\'abord le serveur.', 'warning');
    return;
  }

  const execBtn = document.getElementById(`btn-exec-reset-${dimensionId}`);
  if (execBtn) {
    execBtn.disabled = true;
    execBtn.textContent = 'Réinitialisation en cours...';
  }

  const statusBox = document.getElementById('dimResetStatusBox');
  if (statusBox) {
    statusBox.className = 'action-status-box loading';
    statusBox.innerHTML = `
      <div class="action-spinner"></div>
      <span>Réinitialisation de ${escapeHtml(dimName)} en cours...</span>
    `;
  }

  showToast(`Réinitialisation de ${dimName}...`, 'info');

  try {
    const res = await fetch('/api/worlds/reset-dimension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId, dimensionId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de la réinitialisation');

    if (statusBox) {
      statusBox.className = 'action-status-box success';
      statusBox.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>${escapeHtml(data.message || `${dimName} réinitialisé avec succès !`)}</span>
      `;
    }
    showToast(data.message || `${dimName} réinitialisé avec succès !`, 'success');
    await fetchWorlds();
    renderManageDimensions(worldId);
  } catch (err) {
    if (statusBox) {
      statusBox.className = 'action-status-box error';
      statusBox.innerHTML = `<span>Erreur : ${escapeHtml(err.message)}</span>`;
    }
    showToast(err.message, 'error');
    if (execBtn) {
      execBtn.disabled = false;
      execBtn.textContent = 'Oui, Réinitialiser Définitivement';
    }
  }
}
window.executeDimensionReset = executeDimensionReset;

function openRenameWorld(worldId) {
  if (serverStatus !== 'STOPPED' && (worldId === activeWorld || serverStatus === 'RUNNING')) {
    showToast('Arrêtez d\'abord le serveur pour gérer ou modifier ce monde.', 'warning');
    return;
  }
  renamingWorldId = worldId;
  const targetWorld = worldsListCache.find(w => w.id === worldId) || { name: worldId };
  renameNewName.value = targetWorld.name || worldId;

  const titleEl = document.getElementById('manageWorldModalTitle');
  if (titleEl) titleEl.textContent = `Gestion du Monde : ${targetWorld.name || worldId}`;

  // Réinitialiser les boîtes d'état & barre de progression
  const exportStatusBox = document.getElementById('exportStatusBox');
  if (exportStatusBox) exportStatusBox.style.display = 'none';
  const dimStatusBox = document.getElementById('dimResetStatusBox');
  if (dimStatusBox) dimStatusBox.style.display = 'none';

  const exportProgressContainer = document.getElementById('exportProgressContainer');
  const exportProgressBar = document.getElementById('exportProgressBar');
  const exportProgressPct = document.getElementById('exportProgressPct');
  const exportProgressText = document.getElementById('exportProgressText');
  const exportProgressSub = document.getElementById('exportProgressSub');
  if (exportProgressContainer) {
    exportProgressContainer.style.display = 'none';
    exportProgressContainer.classList.remove('done');
  }
  if (exportProgressBar) exportProgressBar.style.width = '0%';
  if (exportProgressPct) exportProgressPct.textContent = '0%';

  // Bouton Export Zip avec barre de chargement, avancement dynamique et ouverture Finder
  const btnExport = document.getElementById('btnExportWorldZip');
  if (btnExport) {
    btnExport.disabled = false;
    btnExport.onclick = async () => {
      if (btnExport.disabled) return;
      btnExport.disabled = true;

      // Masquer l'ancien résultat et afficher la barre de chargement
      if (exportStatusBox) exportStatusBox.style.display = 'none';
      if (exportProgressContainer) {
        exportProgressContainer.style.display = 'flex';
        exportProgressContainer.classList.remove('done');
      }
      if (exportProgressBar) exportProgressBar.style.width = '5%';
      if (exportProgressPct) exportProgressPct.textContent = '5%';
      if (exportProgressText) exportProgressText.textContent = 'Préparation de la sauvegarde...';
      if (exportProgressSub) exportProgressSub.textContent = 'Analyse des dossiers du monde et inventaires...';

      // Progression dynamique par étapes
      let progress = 5;
      const progressSteps = [
        { at: 20, text: 'Lecture des régions de la carte...', sub: 'Analyse des chunks Overworld, Nether et End' },
        { at: 45, text: 'Compression des données du monde...', sub: 'Compression des blocs, entités et régions' },
        { at: 70, text: 'Compression des inventaires et joueurs...', sub: 'playerdata, stats, advancements' },
        { at: 88, text: 'Compression des configurations et mods...', sub: 'server.properties, mods, configs' },
        { at: 94, text: 'Finalisation du fichier .zip...', sub: 'Assemblage final et écriture sur disque' }
      ];
      let stepIdx = 0;

      const progressInterval = setInterval(() => {
        if (stepIdx < progressSteps.length) {
          const step = progressSteps[stepIdx];
          progress = Math.min(95, progress + Math.floor(Math.random() * 6) + 3);
          if (progress >= step.at) {
            if (exportProgressText) exportProgressText.textContent = step.text;
            if (exportProgressSub) exportProgressSub.textContent = step.sub;
            stepIdx++;
          }
        } else {
          progress = Math.min(96, progress + 1);
        }
        if (exportProgressBar) exportProgressBar.style.width = `${progress}%`;
        if (exportProgressPct) exportProgressPct.textContent = `${progress}%`;
      }, 300);

      showToast(`Compression de ${worldId} en cours...`, 'info');

      try {
        const res = await fetch('/api/worlds/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worldId })
        });
        const data = await res.json();
        clearInterval(progressInterval);

        if (!res.ok) throw new Error(data.error || 'Erreur lors de l’exportation');

        // Si l'écriture locale directe a été restreinte, déclencher immédiatement le téléchargement navigateur vers Downloads
        if (data.needsBrowserDownload && data.downloadUrl) {
          const dlLink = document.createElement('a');
          dlLink.href = data.downloadUrl;
          dlLink.download = data.fileName || 'sauvegarde.zip';
          dlLink.style.display = 'none';
          document.body.appendChild(dlLink);
          dlLink.click();
          setTimeout(() => dlLink.remove(), 1000);
        }

        // Révéler le fichier dans le Finder via le bridge natif macOS
        if (data.filePath) {
          if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.openFinder) {
            window.webkit.messageHandlers.openFinder.postMessage(data.filePath);
          }
        }

        // Barre passe à 100% avec succès
        if (exportProgressBar) exportProgressBar.style.width = '100%';
        if (exportProgressPct) exportProgressPct.textContent = '100%';
        if (exportProgressText) exportProgressText.textContent = 'Sauvegarde créée avec succès !';
        if (exportProgressSub) exportProgressSub.textContent = `Archive : ${data.fileName} • ${data.size}`;
        if (exportProgressContainer) exportProgressContainer.classList.add('done');

        if (exportStatusBox) {
          exportStatusBox.className = 'action-status-box success';
          exportStatusBox.style.display = 'flex';
          exportStatusBox.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <div>
              Sauvegarde terminée : <strong>${escapeHtml(data.fileName)}</strong> • ${escapeHtml(data.size)}<br>
              <small style="color: #94a3b8;">Enregistrée dans <em>${escapeHtml(data.destDir)}</em> • Révélée dans le Finder</small>
            </div>
          `;
        }
        showToast(`Sauvegarde de ${worldId} enregistrée !`, 'success');
      } catch (err) {
        clearInterval(progressInterval);
        if (exportProgressContainer) exportProgressContainer.style.display = 'none';
        if (exportStatusBox) {
          exportStatusBox.className = 'action-status-box error';
          exportStatusBox.style.display = 'flex';
          exportStatusBox.innerHTML = `<span>Erreur : ${escapeHtml(err.message)}</span>`;
        }
        showToast(err.message, 'error');
      } finally {
        btnExport.disabled = false;
      }
    };
  }

  // Rendu des dimensions immédiat puis rafraîchissement automatique
  renderManageDimensions(worldId);
  fetchWorlds().then(() => {
    if (renamingWorldId === worldId) {
      renderManageDimensions(worldId);
    }
  }).catch(() => { });

  // Bouton de Démarrage Forcé depuis la gestion du monde (actif uniquement si le monde est cassé)
  const btnForceStart = document.getElementById('btnForceStartFromManage');
  if (btnForceStart) {
    const targetWorldObj = (worldsListCache || []).find(item => item.id === worldId);
    const isWorldBroken = !!(targetWorldObj && (targetWorldObj.needsRepair || targetWorldObj.isCorrupted));
    btnForceStart.disabled = !isWorldBroken;
    btnForceStart.title = isWorldBroken
      ? 'Forcer le lancement du serveur'
      : 'Disponible uniquement si le monde est endommagé ou corrompu';
    btnForceStart.onclick = async () => {
      if (!isWorldBroken) return;
      closeRenameWorld();
      await forceStartWorld(worldId);
    };
  }

  renameModal.style.display = 'flex';
  renameNewName.focus();
}

function closeRenameWorld() {
  renameModal.style.display = 'none';
  renamingWorldId = null;
}

btnCancelRename.addEventListener('click', closeRenameWorld);
btnCloseRenameModal.addEventListener('click', closeRenameWorld);

formRenameWorld.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!renamingWorldId) return;
  const targetWorldId = renamingWorldId;
  const rawInput = renameNewName.value.trim();
  if (!rawInput) {
    showToast('Veuillez saisir un nom pour le monde.', 'warning');
    return;
  }

  // Préserve les majuscules et remplace les espaces par des tirets propres
  const newName = rawInput.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '-');
  if (!newName) {
    showToast('Le nom de monde est invalide (utilisez des lettres, chiffres ou tirets).', 'warning');
    return;
  }

  closeRenameWorld();
  showToast(`Renommage de ${targetWorldId} en ${newName}...`, 'info');

  try {
    const res = await fetch('/api/worlds/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId: targetWorldId, newName })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors du renommage');
    showToast(`Monde renommé avec succès en '${data.newId}' !`, 'success');
    fetchWorlds();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Delete World Modal
let deletingWorldId = null;
const deleteWorldModal = document.getElementById('deleteWorldModal');
const deleteWorldNameTarget = document.getElementById('deleteWorldNameTarget');
const btnCloseDeleteModal = document.getElementById('btnCloseDeleteModal');
const btnCancelDelete = document.getElementById('btnCancelDelete');
const btnConfirmDelete = document.getElementById('btnConfirmDelete');

function openDeleteWorld(worldId) {
  if (serverStatus !== 'STOPPED' && (activeWorld === worldId || serverStatus === 'RUNNING')) {
    showToast('Arrêtez d\'abord le serveur pour pouvoir supprimer ce monde.', 'error');
    return;
  }
  deletingWorldId = worldId;
  if (deleteWorldNameTarget) deleteWorldNameTarget.textContent = worldId;
  if (deleteWorldModal) deleteWorldModal.style.display = 'flex';
}

function closeDeleteWorld() {
  if (deleteWorldModal) deleteWorldModal.style.display = 'none';
  deletingWorldId = null;
}

if (btnCancelDelete) btnCancelDelete.addEventListener('click', closeDeleteWorld);
if (btnCloseDeleteModal) btnCloseDeleteModal.addEventListener('click', closeDeleteWorld);

if (btnConfirmDelete) {
  btnConfirmDelete.addEventListener('click', async () => {
    if (!deletingWorldId) return;
    const target = deletingWorldId;
    closeDeleteWorld();
    showToast(`Suppression définitive de ${target}...`, 'info');

    try {
      const res = await fetch('/api/worlds/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldId: target })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la suppression');
      showToast(`Le monde '${target}' a été supprimé définitivement.`, 'success');
      delete terminalBuffers[target];
      delete terminalUnread[target];
      suppressAutoSelectWorld = true;
      showNoWorldSelectedTerminal();
      fetchWorlds();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// Repair Report Modal listeners
const btnCloseRepairReportModal = document.getElementById('btnCloseRepairReportModal');
const btnDismissRepairReport = document.getElementById('btnDismissRepairReport');
const btnLaunchAfterRepair = document.getElementById('btnLaunchAfterRepair');

if (btnCloseRepairReportModal) btnCloseRepairReportModal.addEventListener('click', closeRepairReportModal);
if (btnDismissRepairReport) btnDismissRepairReport.addEventListener('click', closeRepairReportModal);
if (btnLaunchAfterRepair) {
  btnLaunchAfterRepair.addEventListener('click', () => {
    const target = pendingRepairLaunchWorldId;
    closeRepairReportModal();
    if (target) {
      forceStartWorld(target);
    }
  });
}

if (btnRefreshWorlds) {
  btnRefreshWorlds.addEventListener('click', () => {
    const svg = btnRefreshWorlds.querySelector('svg');
    if (svg) {
      svg.classList.remove('spinning');
      void svg.offsetWidth;
      svg.classList.add('spinning');
      setTimeout(() => svg.classList.remove('spinning'), 600);
    }
    fetchWorlds();
  });
}

// Exposer globalement pour les événements onclick HTML
window.openEditProps = openEditProps;
window.openRenameWorld = openRenameWorld;
window.openDeleteWorld = openDeleteWorld;
window.startWorld = startWorld;
window.forceStartWorld = forceStartWorld;
window.stopActiveWorld = stopActiveWorld;
window.selectTerminalWorld = selectTerminalWorld;
window.togglePinWorld = togglePinWorld;
window.movePinnedWorld = movePinnedWorld;
window.toggleCollapseWorld = toggleCollapseWorld;
// ==========================================================================
// Modal Paramètres de l'Application (App Settings)
// ==========================================================================
const appSettingsModal = document.getElementById('appSettingsModal');
const settingsDownloadPath = document.getElementById('settingsDownloadPath');
const settingsViewDistance = document.getElementById('settingsViewDistance');
const settingsViewDistanceVal = document.getElementById('settingsViewDistanceVal');
const settingsSimulationDistance = document.getElementById('settingsSimulationDistance');
const settingsSimulationDistanceVal = document.getElementById('settingsSimulationDistanceVal');
const settingsDefaultGamemode = document.getElementById('settingsDefaultGamemode');
const settingsDefaultDifficulty = document.getElementById('settingsDefaultDifficulty');
const settingsTunnelRelayHost = document.getElementById('settingsTunnelRelayHost');
const settingsTunnelRelayPort = document.getElementById('settingsTunnelRelayPort');
const settingsTunnelAuthToken = document.getElementById('settingsTunnelAuthToken');

function toggleTunnelTokenVisibility() {
  const input = document.getElementById('settingsTunnelAuthToken');
  const btn = document.getElementById('btnToggleTunnelToken');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.textContent = 'Masquer';
  } else {
    input.type = 'password';
    if (btn) btn.textContent = 'Afficher';
  }
}

const settingsCustomDomainPrefix = document.getElementById('settingsCustomDomainPrefix');

function openOfficialWebsite() {
  openExternalUrl('https://cubirium.fr');
}
window.openOfficialWebsite = openOfficialWebsite;

function copyCustomDomainDemo(event) {
  if (event) event.stopPropagation();
  const input = document.getElementById('settingsCustomDomainPrefix');
  const prefix = input && input.value ? input.value.trim() : 'lesMondesAvecMesPotes';
  const domain = `${prefix}.cubirium.fr`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(domain).then(() => {
      showToast('Adresse copiée : ' + domain, 'success');
    }).catch(() => {
      showToast('Adresse : ' + domain, 'info');
    });
  } else {
    showToast('Adresse : ' + domain, 'info');
  }
}
window.copyCustomDomainDemo = copyCustomDomainDemo;

function switchLegalTab(tab, btn) {
  const tabs = ['privacy', 'terms', 'notices'];
  tabs.forEach(t => {
    const pane = document.getElementById(`legalPane${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const b = document.getElementById(`btnLegalTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (pane) pane.style.display = (t === tab) ? 'block' : 'none';
    if (b) {
      if (t === tab) b.classList.add('active');
      else b.classList.remove('active');
    }
  });

  const pill = document.getElementById('legalSlidingPill');
  const targetBtn = btn || document.getElementById(`btnLegalTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
  if (pill && targetBtn) {
    pill.style.width = targetBtn.offsetWidth + 'px';
    pill.style.transform = `translateX(${targetBtn.offsetLeft}px)`;
  }
}
window.switchLegalTab = switchLegalTab;

function showCurrentUpdateNotes() {
  const version = (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '1.5.0');
  const summary = {
    version: version,
    releaseName: `Cubirium v${version}`,
    releaseNotes: `### Notes de version v${version}
- **Inspecteur de Joueur & Équipement 3D Intégral** : Rendu 3D fidèle sur le skin des armures Vanilla et moddées, élytres, boucliers, têtes/blocs équipés et outils, armes ou blocs tenus en main.
- **Contrôles de Santé, Faim & Expérience** : Actions rapides granulaires sur les barres de vie et de faim (vider, -1, +1, remplir), carte d'expérience unifiée à 18 segments et sélecteur de mode de jeu harmonisé.
- **Extraction Directe des Textures de Mods en Mémoire** : Lecture native Node.js directement depuis les archives .jar des mods du monde et du client Minecraft sans aucun stockage disque sur macOS et Windows.
- **Ergonomie & Navigation Affinées** : Menu contextuel universel au clic droit, Skeleton Loader au démarrage, filigrane du terminal, protection du Démarrage Forcé et correction du calcul du Runtime et des retours console en jeu.`
  };
  showUpdateSummaryModal(summary);
  const title = document.getElementById('updateSummaryTitle');
  if (title) title.textContent = 'Notes de version';
  const subtitle = document.getElementById('updateSummarySubtitle');
  if (subtitle) subtitle.textContent = 'Nouveautés et améliorations de Cubirium';
}
window.showCurrentUpdateNotes = showCurrentUpdateNotes;

let initialSettingsState = null;

function applySettingsState(state) {
  if (!state) return;
  if (settingsDownloadPath) settingsDownloadPath.value = state.downloadPath || '';
  if (settingsViewDistance) {
    settingsViewDistance.value = state.defaultViewDistance ?? 12;
    if (settingsViewDistanceVal) settingsViewDistanceVal.textContent = (state.defaultViewDistance ?? 12) + ' chunks';
  }
  if (settingsSimulationDistance) {
    settingsSimulationDistance.value = state.defaultSimulationDistance ?? 4;
    if (settingsSimulationDistanceVal) settingsSimulationDistanceVal.textContent = (state.defaultSimulationDistance ?? 4) + ' chunks';
  }
  if (settingsDefaultGamemode) settingsDefaultGamemode.value = state.defaultGamemode || 'survival';
  if (settingsDefaultDifficulty) settingsDefaultDifficulty.value = state.defaultDifficulty || 'normal';
  if (settingsCustomDomainPrefix) settingsCustomDomainPrefix.value = state.customDomainPrefix || 'lesMondesAvecMesPotes';
  if (settingsTunnelRelayHost) settingsTunnelRelayHost.value = state.tunnelRelayHost || 'bore.pub';
  if (settingsTunnelRelayPort) settingsTunnelRelayPort.value = state.tunnelRelayPort || 7835;
  if (settingsTunnelAuthToken) settingsTunnelAuthToken.value = state.tunnelAuthToken || '';
}

function getSettingsFromInputs() {
  return {
    downloadPath: settingsDownloadPath ? settingsDownloadPath.value.trim() : '',
    defaultViewDistance: settingsViewDistance ? parseInt(settingsViewDistance.value, 10) : 12,
    defaultSimulationDistance: settingsSimulationDistance ? parseInt(settingsSimulationDistance.value, 10) : 4,
    defaultGamemode: settingsDefaultGamemode ? settingsDefaultGamemode.value : 'survival',
    defaultDifficulty: settingsDefaultDifficulty ? settingsDefaultDifficulty.value : 'normal',
    customDomainPrefix: settingsCustomDomainPrefix ? settingsCustomDomainPrefix.value.trim() : 'lesMondesAvecMesPotes',
    tunnelRelayHost: settingsTunnelRelayHost ? settingsTunnelRelayHost.value.trim() : 'bore.pub',
    tunnelRelayPort: settingsTunnelRelayPort ? parseInt(settingsTunnelRelayPort.value, 10) : 7835,
    tunnelAuthToken: settingsTunnelAuthToken ? settingsTunnelAuthToken.value.trim() : ''
  };
}

function resetAppSettingsModalUI() {
  // 1. Masquer les résultats du benchmark et réinitialiser son statut
  const benchResults = document.getElementById('settingsBenchResults');
  const benchLoader = document.getElementById('settingsBenchLoader');
  const benchBadge = document.getElementById('settingsBenchStatusBadge');
  const benchDesc = document.getElementById('settingsBenchSummaryDesc');
  const benchBtn = document.getElementById('btnSettingsRunBenchmark');

  if (benchResults) benchResults.style.display = 'none';
  if (benchLoader) benchLoader.style.display = 'none';
  if (benchBadge) {
    benchBadge.textContent = 'Non testé';
    benchBadge.style.color = '';
  }
  if (benchDesc) {
    benchDesc.textContent = 'Cliquez pour lancer une analyse complète de vos composants.';
  }
  if (benchBtn) {
    benchBtn.disabled = false;
    benchBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      <span>Tester mon PC</span>
    `;
  }

  // 2. Rétablir le message initial pour la vérification des mises à jour
  const updateFeedback = document.getElementById('settingsUpdateFeedback');
  if (updateFeedback) {
    updateFeedback.innerHTML = 'Vérifiez si une nouvelle version ou des correctifs sont disponibles.';
  }
  const updateBtn = document.getElementById('btnManualCheckUpdate');
  if (updateBtn) {
    updateBtn.disabled = false;
    updateBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
      </svg>
      <span>Vérifier les mises à jour</span>
    `;
  }

  // 3. Remonter le défilement tout en haut
  if (appSettingsModal) {
    const modalContent = appSettingsModal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.scrollTop = 0;
    }
  }
}

async function openAppSettingsModal() {
  if (!appSettingsModal) return;
  resetAppSettingsModalUI();
  appSettingsModal.style.display = 'flex';
  requestAnimationFrame(() => {
    switchLegalTab('privacy');
  });

  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      initialSettingsState = {
        downloadPath: data.downloadPath || '',
        defaultViewDistance: Number(data.defaultViewDistance) || 12,
        defaultSimulationDistance: Number(data.defaultSimulationDistance) || 4,
        defaultGamemode: data.defaultGamemode || 'survival',
        defaultDifficulty: data.defaultDifficulty || 'normal'
      };
      applySettingsState(initialSettingsState);
    }

    // Charger la version actuelle de l'application
    const versionTag = document.getElementById('settingsCurrentVersionTag');
    if (versionTag) {
      fetch('/api/app/check-update')
        .then(r => r.json())
        .then(vData => {
          if (vData && vData.currentVersion) {
            versionTag.textContent = `v${vData.currentVersion}`;
          }
        })
        .catch(() => { });
    }
  } catch (err) {
    console.warn('Erreur chargement paramètres:', err);
  }
}

// Annuler : restaure l'ancien état et ferme sans enregistrer
function cancelAppSettingsModal() {
  if (initialSettingsState) {
    applySettingsState(initialSettingsState);
  }
  resetAppSettingsModalUI();
  if (appSettingsModal) {
    appSettingsModal.style.display = 'none';
  }
}

// Fermer : enregistre automatiquement les modifications
async function closeAppSettingsModal() {
  if (!appSettingsModal || appSettingsModal.style.display === 'none') return;

  const current = getSettingsFromInputs();
  const hasChanged = !initialSettingsState ||
    current.downloadPath !== initialSettingsState.downloadPath ||
    current.defaultViewDistance !== initialSettingsState.defaultViewDistance ||
    current.defaultSimulationDistance !== initialSettingsState.defaultSimulationDistance ||
    current.defaultGamemode !== initialSettingsState.defaultGamemode ||
    current.defaultDifficulty !== initialSettingsState.defaultDifficulty;

  resetAppSettingsModalUI();
  appSettingsModal.style.display = 'none';

  if (hasChanged) {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current)
      });
      const data = await res.json();
      if (res.ok) {
        initialSettingsState = { ...current };
        showToast('Paramètres enregistrés automatiquement', 'success');
      } else {
        showToast('Erreur: ' + (data.error || 'Impossible d\'enregistrer'), 'error');
      }
    } catch (err) {
      showToast('Erreur réseau lors de la sauvegarde: ' + err.message, 'error');
    }
  }
}

// Auto-sauvegarde transparente des paramètres (sélection ou modification de champ)
async function autoSaveAppSettings() {
  const current = getSettingsFromInputs();
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current)
    });
    if (res.ok) {
      initialSettingsState = { ...current };
    }
  } catch (err) {
    console.warn('Erreur auto-sauvegarde paramètres:', err);
  }
}

if (settingsDownloadPath) {
  settingsDownloadPath.addEventListener('change', () => {
    autoSaveAppSettings();
  });
}

// Callback appelé par le bridge natif Cocoa (main.swift)
window.onFolderChosen = function (folderPath) {
  if (folderPath && settingsDownloadPath) {
    settingsDownloadPath.value = folderPath;
    showToast('Dossier sélectionné : ' + folderPath, 'info');
    autoSaveAppSettings();
  }
};

async function browseSettingsFolder() {
  // 1. Tenter le bridge natif Cocoa de l'application macOS
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.chooseFolder) {
    try {
      window.webkit.messageHandlers.chooseFolder.postMessage({});
      return;
    } catch (e) {
      console.warn('Erreur appel bridge chooseFolder:', e);
    }
  }

  // 2. Fallback via route serveur avec indicateur visuel de chargement
  const btn = document.getElementById('btnBrowseSettingsDownloadPath');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<svg class="spinner-icon-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/></svg> <span>Sélection...</span>`;
  }

  try {
    const res = await fetch('/api/settings/choose-folder', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (data.folder && settingsDownloadPath) {
        settingsDownloadPath.value = data.folder;
        showToast('Dossier sélectionné : ' + data.folder, 'info');
        if (typeof autoSaveAppSettings === 'function') {
          autoSaveAppSettings();
        }
      }
    }
  } catch (err) {
    console.warn('Erreur sélection dossier:', err);
    showToast('Erreur sélection dossier: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

// Clic hors de la modal pour fermer (avec auto-save)
if (appSettingsModal) {
  appSettingsModal.addEventListener('click', (e) => {
    if (e.target === appSettingsModal) {
      closeAppSettingsModal();
    }
  });
}

// Touche Échap pour fermer les modaux + raccourcis universels (Windows F1 / Ctrl+, et macOS Cmd+,)
window.addEventListener('keydown', (e) => {
  if (e.key === 'F1') {
    e.preventDefault();
    openAboutModal();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === ',') {
    e.preventDefault();
    openAppSettingsModal();
    return;
  }
  if (e.key === 'Escape') {
    const aboutModal = document.getElementById('aboutModal');
    if (aboutModal && aboutModal.style.display !== 'none') {
      closeAboutModal();
      return;
    }
    if (appSettingsModal && appSettingsModal.style.display !== 'none') {
      closeAppSettingsModal();
      return;
    }
  }
  // Raccourci universel Cmd+C / Ctrl+C sur le texte sélectionné hors des champs
  if (e.metaKey || e.ctrlKey) {
    if (e.key.toLowerCase() === 'c') {
      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (!isInput) {
        const sel = window.getSelection().toString();
        if (sel && sel.length > 0) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(sel).catch(() => { });
          } else {
            try { document.execCommand('copy'); } catch (_) { }
          }
        }
      }
    }
  }
});

function openAboutModal() {
  const modal = document.getElementById('aboutModal');
  if (modal) {
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      switchLegalTab('privacy');
    });
  }
}

function closeAboutModal() {
  const modal = document.getElementById('aboutModal');
  if (modal) modal.style.display = 'none';
}

window.openAboutModal = openAboutModal;
window.closeAboutModal = closeAboutModal;
window.openAppSettingsModal = openAppSettingsModal;
window.closeAppSettingsModal = closeAppSettingsModal;
window.cancelAppSettingsModal = cancelAppSettingsModal;
window.browseSettingsFolder = browseSettingsFolder;
window.openGlobalSettings = openAppSettingsModal;

// Helper Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==========================================================================
// ==========================================================================
// Application Uninstaller (3 étapes de confirmation sécurisée)
// ==========================================================================
async function openUninstallModal() {
  const modal = document.getElementById('uninstallConfirmModal');
  const step1 = document.getElementById('uninstallStep1');
  const step2 = document.getElementById('uninstallStep2');
  const step3 = document.getElementById('uninstallStep3');

  if (step1) step1.style.display = 'flex';
  if (step2) step2.style.display = 'none';
  if (step3) step3.style.display = 'none';

  // Réinitialiser le mot de passe de confirmation et le bouton final
  const keywordInput = document.getElementById('uninstallConfirmKeyword');
  const btnFinal = document.getElementById('btnConfirmUninstall');
  if (keywordInput) keywordInput.value = '';
  if (btnFinal) {
    btnFinal.disabled = true;
    btnFinal.style.opacity = '0.5';
    btnFinal.style.cursor = 'not-allowed';
    btnFinal.textContent = 'Désinstaller définitivement';
  }

  // Masquer l'état de l'exportation préventive
  const exportStatus = document.getElementById('uninstallExportAllStatus');
  if (exportStatus) {
    exportStatus.style.display = 'none';
    exportStatus.className = 'uninstall-backup-status';
    exportStatus.textContent = '';
  }

  // Récupérer le chemin d'exportation configuré
  try {
    const res = await fetch('/api/worlds/export-destination');
    const data = await res.json();
    const destPathEl = document.getElementById('uninstallBackupDestPath');
    if (destPathEl && data.destination) {
      destPathEl.textContent = data.destination;
    }
  } catch (_) { }

  if (modal) modal.style.display = 'flex';
}

function closeUninstallModal() {
  const modal = document.getElementById('uninstallConfirmModal');
  if (modal) modal.style.display = 'none';
}

function toggleAllUninstallOptions() {
  const optWorlds = document.getElementById('uninstallOptWorlds');
  const optBackups = document.getElementById('uninstallOptBackups');
  const optSettings = document.getElementById('uninstallOptSettings');
  const optCaches = document.getElementById('uninstallOptCaches');
  const btn = document.getElementById('btnToggleAllUninstall');

  const allChecked = Boolean(optWorlds?.checked && optBackups?.checked && optSettings?.checked);

  if (allChecked) {
    if (optWorlds) optWorlds.checked = false;
    if (optBackups) optBackups.checked = false;
    if (optSettings) optSettings.checked = false;
    if (btn) btn.textContent = 'Tout sélectionner';
  } else {
    if (optWorlds) optWorlds.checked = true;
    if (optBackups) optBackups.checked = true;
    if (optSettings) optSettings.checked = true;
    if (optCaches) optCaches.checked = true;
    if (btn) btn.textContent = 'Tout désélectionner';
  }
}

async function goToUninstallStep2() {
  const step1 = document.getElementById('uninstallStep1');
  const step2 = document.getElementById('uninstallStep2');
  const step3 = document.getElementById('uninstallStep3');

  const optWorlds = Boolean(document.getElementById('uninstallOptWorlds')?.checked);
  const optBackups = Boolean(document.getElementById('uninstallOptBackups')?.checked);
  const optSettings = Boolean(document.getElementById('uninstallOptSettings')?.checked);
  const optCaches = Boolean(document.getElementById('uninstallOptCaches')?.checked);

  const destroyList = document.getElementById('uninstallRecapDestroyList');
  const keepList = document.getElementById('uninstallRecapKeepList');

  // Remplir la liste des éléments détruits
  if (destroyList) {
    const items = ['<li>Application Cubirium & raccourcis Bureau</li>'];
    if (optWorlds) items.push('<li>Tous les mondes, maps, dimensions et mods (dossier <code>games/</code>)</li>');
    if (optBackups) items.push('<li>Toutes les sauvegardes et archives (.zip) locales</li>');
    if (optSettings) items.push('<li>Fichier de configuration générale et réglages personnalisés</li>');
    if (optCaches) items.push('<li>Caches système, session et LocalStorage WebKit / Edge</li>');
    destroyList.innerHTML = items.join('');
  }

  // Remplir la liste des éléments conservés
  if (keepList) {
    const items = [];
    if (!optWorlds) items.push('<li>Vos mondes, inventaires et mods Minecraft (préservés sur le disque)</li>');
    if (!optBackups) items.push('<li>Vos sauvegardes et archives (.zip) créées</li>');
    if (!optSettings) items.push('<li>Vos préférences et réglages de configuration</li>');
    if (!optCaches) items.push('<li>Les caches de navigation et données temporaires</li>');
    if (items.length === 0) {
      items.push('<li style="color: #fca5a5; font-style: italic;">Aucune donnée ne sera conservée (Désinstallation complète)</li>');
    }
    keepList.innerHTML = items.join('');
  }

  // Afficher la sauvegarde préventive UNIQUEMENT si les mondes sont sélectionnés pour suppression
  const backupPanel = document.getElementById('uninstallBackupPanel');
  if (backupPanel) {
    backupPanel.style.display = optWorlds ? 'block' : 'none';
  }

  // Mettre à jour le chemin d'export préventif si les mondes sont supprimés
  if (optWorlds) {
    try {
      const res = await fetch('/api/worlds/export-destination');
      const data = await res.json();
      const destPathEl = document.getElementById('uninstallBackupDestPath');
      if (destPathEl && data.destination) {
        destPathEl.textContent = data.destination;
      }
    } catch (_) { }
  }

  if (step1) step1.style.display = 'none';
  if (step2) step2.style.display = 'flex';
  if (step3) step3.style.display = 'none';
}

function backToUninstallStep1() {
  const step1 = document.getElementById('uninstallStep1');
  const step2 = document.getElementById('uninstallStep2');
  const step3 = document.getElementById('uninstallStep3');
  if (step1) step1.style.display = 'flex';
  if (step2) step2.style.display = 'none';
  if (step3) step3.style.display = 'none';
}

async function exportAllWorldsFromUninstall() {
  const btn = document.getElementById('btnExportAllFromUninstall');
  const statusEl = document.getElementById('uninstallExportAllStatus');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `
      <span class="loading-spinner" style="width:14px; height:14px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 0.8s linear infinite; display:inline-block;"></span>
      <span>Exportation de tous les mondes en cours...</span>`;
  }
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.className = 'uninstall-backup-status loading';
    statusEl.textContent = "Compression et archivage de l'ensemble des mondes en cours...";
  }

  try {
    const res = await fetch('/api/worlds/export-all', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Échec de l'exportation des mondes.");

    if (statusEl) {
      statusEl.className = 'uninstall-backup-status success';
      statusEl.innerHTML = `
        <strong>Sauvegarde réussie</strong><br>
        ${data.count} monde(s) archivé(s) (${data.size}) avec succès.<br>
        Fichier : <code>${escapeHtml(data.fileName)}</code><br>
        Emplacement : <code>${escapeHtml(data.destDir)}</code>
      `;
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Sauvegarde effectuée (Réexporter)</span>`;
    }

    if (data.needsBrowserDownload && data.downloadUrl) {
      window.location.href = data.downloadUrl;
    }
    showToast('Tous les mondes ont été sauvegardés avec succès !', 'success');
  } catch (err) {
    if (statusEl) {
      statusEl.className = 'uninstall-backup-status error';
      statusEl.textContent = "Erreur lors de l'exportation : " + err.message;
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="17 21 17 13 7 13 7 21"></polyline>
          <polyline points="7 3 7 8 15 8"></polyline>
        </svg>
        <span>Réessayer la sauvegarde</span>`;
    }
    showToast("Erreur export : " + err.message, 'error');
  }
}

function goToUninstallStep3() {
  const step1 = document.getElementById('uninstallStep1');
  const step2 = document.getElementById('uninstallStep2');
  const step3 = document.getElementById('uninstallStep3');

  const keywordInput = document.getElementById('uninstallConfirmKeyword');
  const btnFinal = document.getElementById('btnConfirmUninstall');
  if (keywordInput) keywordInput.value = '';
  if (btnFinal) {
    btnFinal.disabled = true;
    btnFinal.style.opacity = '0.5';
    btnFinal.style.cursor = 'not-allowed';
  }

  if (step1) step1.style.display = 'none';
  if (step2) step2.style.display = 'none';
  if (step3) step3.style.display = 'flex';

  setTimeout(() => {
    if (keywordInput) keywordInput.focus();
  }, 100);
}

function backToUninstallStep2() {
  const step1 = document.getElementById('uninstallStep1');
  const step2 = document.getElementById('uninstallStep2');
  const step3 = document.getElementById('uninstallStep3');
  if (step1) step1.style.display = 'none';
  if (step2) step2.style.display = 'flex';
  if (step3) step3.style.display = 'none';
}

function checkUninstallKeywordMatch() {
  const keywordInput = document.getElementById('uninstallConfirmKeyword');
  const btnFinal = document.getElementById('btnConfirmUninstall');
  if (!keywordInput || !btnFinal) return;

  const val = (keywordInput.value || '').trim().toLowerCase();
  if (val === 'supprimer') {
    btnFinal.disabled = false;
    btnFinal.style.opacity = '1';
    btnFinal.style.cursor = 'pointer';
  } else {
    btnFinal.disabled = true;
    btnFinal.style.opacity = '0.5';
    btnFinal.style.cursor = 'not-allowed';
  }
}

async function executeUninstall() {
  const keywordInput = document.getElementById('uninstallConfirmKeyword');
  if (!keywordInput || keywordInput.value.trim().toLowerCase() !== 'supprimer') {
    showToast("Veuillez saisir exactement 'supprimer' pour continuer.", 'warning');
    return;
  }

  const deleteWorlds = Boolean(document.getElementById('uninstallOptWorlds')?.checked);
  const deleteBackups = Boolean(document.getElementById('uninstallOptBackups')?.checked);
  const deleteSettings = Boolean(document.getElementById('uninstallOptSettings')?.checked);
  const deleteCaches = Boolean(document.getElementById('uninstallOptCaches')?.checked);
  const deleteAll = deleteWorlds && deleteBackups && deleteSettings;

  const btn = document.getElementById('btnConfirmUninstall');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Désinstallation en cours...';
  }

  // Réinitialiser le stockage local
  try {
    localStorage.removeItem(WELCOME_MODAL_SEEN_KEY);
    localStorage.removeItem(HAS_LAUNCHED_KEY);
    localStorage.clear();
    sessionStorage.clear();
  } catch (e) { }

  try {
    const res = await fetch('/api/app/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deleteWorlds,
        deleteBackups,
        deleteSettings,
        deleteCaches,
        deleteAll,
        deleteData: deleteWorlds || deleteAll
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');

    showToast('Application désinstallée. Fermeture...', 'info');

    setTimeout(() => {
      try {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.uninstallApp) {
          window.webkit.messageHandlers.uninstallApp.postMessage({
            deleteWorlds,
            deleteBackups,
            deleteSettings,
            deleteCaches,
            deleteAll,
            deleteData: deleteWorlds || deleteAll
          });
        } else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.terminateApp) {
          window.webkit.messageHandlers.terminateApp.postMessage('quit');
        }
      } catch (e) { }
      window.close();
    }, 600);
  } catch (e) {
    showToast('Erreur lors de la désinstallation : ' + e.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Désinstaller définitivement';
    }
  }
}

window.openUninstallModal = openUninstallModal;
window.closeUninstallModal = closeUninstallModal;
window.toggleAllUninstallOptions = toggleAllUninstallOptions;
window.goToUninstallStep2 = goToUninstallStep2;
window.backToUninstallStep1 = backToUninstallStep1;
window.exportAllWorldsFromUninstall = exportAllWorldsFromUninstall;
window.goToUninstallStep3 = goToUninstallStep3;
window.backToUninstallStep2 = backToUninstallStep2;
window.checkUninstallKeywordMatch = checkUninstallKeywordMatch;
window.executeUninstall = executeUninstall;

// ==========================================================================
// Modal de Bienvenue & Présentation (1ère ouverture uniquement)
// ==========================================================================
const WELCOME_MODAL_SEEN_KEY = 'msm_welcome_modal_seen';
let isWelcomeDismissed = false;

function checkWelcomeModal(force = false) {
  try {
    if (isWelcomeDismissed) return;
    const modal = document.getElementById('welcomeModal');
    if (!modal) return;
    // Si le modal est déjà affiché et ouvert, ne surtout pas réinitialiser la page en cours !
    if (modal.style.display === 'flex') {
      return;
    }
    const seen = localStorage.getItem(WELCOME_MODAL_SEEN_KEY);
    if (force || !seen || seen !== 'true') {
      goToWelcomePage(1);
      modal.style.display = 'flex';
    }
  } catch (e) { }
}

async function closeWelcomeModal() {
  isWelcomeDismissed = true;
  const modal = document.getElementById('welcomeModal');
  if (modal) {
    modal.style.display = 'none';
  }
  try {
    localStorage.setItem(WELCOME_MODAL_SEEN_KEY, 'true');
  } catch (e) { }
  try {
    await fetch('/api/app/welcome-dismiss', { method: 'POST' });
  } catch (e) { }
}
window.closeWelcomeModal = closeWelcomeModal;

function goToWelcomePage(pageNumber) {
  const p1 = document.getElementById('welcomePage1');
  const p2 = document.getElementById('welcomePage2');
  const stepBadge = document.getElementById('welcomeStepBadge');
  const headerTitle = document.getElementById('welcomeHeaderTitle');

  if (pageNumber === 2) {
    if (p1) p1.style.display = 'none';
    if (p2) p2.style.display = 'flex';
    if (stepBadge) stepBadge.textContent = '2 / 2';
    if (headerTitle) headerTitle.textContent = 'Cubirium';
    runSystemBenchmark();
  } else {
    if (p2) p2.style.display = 'none';
    if (p1) p1.style.display = 'flex';
    if (stepBadge) stepBadge.textContent = '1 / 2';
    if (headerTitle) headerTitle.textContent = 'Cubirium';
  }
}
window.goToWelcomePage = goToWelcomePage;

function renderBenchmarkCards(prefix, data) {
  // RAM
  const ramVal = document.getElementById(`${prefix}RamVal`);
  const ramDetail = document.getElementById(`${prefix}RamDetail`);
  if (ramVal) ramVal.textContent = `${data.totalRamGb} Go`;
  if (ramDetail) {
    if (data.totalRamGb >= 15.5) {
      ramDetail.textContent = 'Mémoire vive très confortable';
    } else if (data.totalRamGb >= 7.5) {
      ramDetail.textContent = 'Recommandé pour serveur & jeu';
    } else {
      ramDetail.textContent = 'Mémoire système minimale';
    }
  }

  // CPU
  const cpuVal = document.getElementById(`${prefix}CpuVal`);
  const cpuDetail = document.getElementById(`${prefix}CpuDetail`);
  const cleanCpu = (data.cpuModel || '')
    .replace(/\(R\)|\(TM\)|CPU|@.*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanCpu) {
    if (cpuVal) cpuVal.textContent = cleanCpu;
    if (cpuDetail) cpuDetail.textContent = `${data.cpuCores} Cœurs physiques & logiques`;
  } else {
    if (cpuVal) cpuVal.textContent = `${data.cpuCores} Cœurs`;
    if (cpuDetail) cpuDetail.textContent = 'Processeur multi-cœurs';
  }

  // Connexion
  const netVal = document.getElementById(`${prefix}NetVal`);
  const netDetail = document.getElementById(`${prefix}NetDetail`);
  if (data.network) {
    if (netVal) {
      if (data.network.pingMs !== null && data.network.pingMs < 35) {
        netVal.textContent = 'Excellente • Très rapide';
      } else if (data.network.pingMs !== null && data.network.pingMs < 80) {
        netVal.textContent = 'Très bonne • Fluide';
      } else if (data.network.online) {
        netVal.textContent = 'Standard • Modérée';
      } else {
        netVal.textContent = 'Local uniquement';
      }
    }
    if (netDetail) {
      if (data.network.pingMs !== null) {
        if (data.network.pingMs < 35) {
          netDetail.textContent = `${data.network.pingMs} ms (latence optimale)`;
        } else if (data.network.pingMs < 80) {
          netDetail.textContent = `${data.network.pingMs} ms (bonne réactivité)`;
        } else {
          netDetail.textContent = `${data.network.pingMs} ms (latence acceptable)`;
        }
      } else {
        netDetail.textContent = "Pas d'accès internet détecté";
      }
    }
  }

  // Système
  const osVal = document.getElementById(`${prefix}OsVal`);
  const osDetail = document.getElementById(`${prefix}OsDetail`);
  if (osVal) osVal.textContent = data.platform;
  if (osDetail) {
    if (data.platform === 'macOS') {
      osDetail.textContent = data.arch === 'arm64' ? 'Apple Silicon (arm64)' : 'Processeur Intel (x64)';
    } else if (data.platform === 'Windows') {
      osDetail.textContent = `Architecture 64 bits (${data.arch})`;
    } else {
      osDetail.textContent = `Architecture ${data.arch}`;
    }
  }
}

async function runSystemBenchmark() {
  const loader = document.getElementById('welcomeDiagnosisLoader');
  const results = document.getElementById('welcomeDiagnosisResults');
  if (loader) {
    loader.style.display = 'flex';
    loader.innerHTML = `
      <div class="action-spinner"></div>
      <span>Analyse des composants et du réseau en cours...</span>
    `;
  }
  if (results) results.style.display = 'none';

  try {
    const res = await fetch('/api/system/benchmark');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors du benchmark');

    renderBenchmarkCards('diag', data);

    const verdictCard = document.getElementById('welcomeVerdictCard');
    const verdictBadge = document.getElementById('diagVerdictBadge');
    const verdictTitle = document.getElementById('diagVerdictTitle');
    const verdictDesc = document.getElementById('diagVerdictDesc');

    if (verdictCard) {
      verdictCard.className = `welcome-verdict-box verdict-${data.badgeColor || 'success'}`;
    }
    if (verdictBadge) verdictBadge.textContent = data.badgeColor === 'success' ? 'Optimal' : (data.badgeColor === 'warning' ? 'Conseillé' : 'Limité');
    if (verdictTitle) verdictTitle.textContent = data.verdictTitle;
    if (verdictDesc) verdictDesc.textContent = data.verdictDesc;

    if (loader) loader.style.display = 'none';
    if (results) results.style.display = 'block';
  } catch (err) {
    console.warn('Erreur diagnostic composants:', err);
    if (loader) {
      loader.innerHTML = `<span style="color: #ef4444;">Échec du diagnostic (${escapeHtml(err.message)})</span>`;
    }
  }
}
window.runSystemBenchmark = runSystemBenchmark;

async function runSettingsBenchmark() {
  const btn = document.getElementById('btnSettingsRunBenchmark');
  const loader = document.getElementById('settingsBenchLoader');
  const results = document.getElementById('settingsBenchResults');
  const statusBadge = document.getElementById('settingsBenchStatusBadge');
  const summaryDesc = document.getElementById('settingsBenchSummaryDesc');
  const origBtnHtml = btn ? btn.innerHTML : null;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="action-spinner" style="width:14px;height:14px;border-width:2px;"></div><span>Benchmark...</span>`;
  }
  if (loader) loader.style.display = 'flex';
  if (results) results.style.display = 'none';
  if (statusBadge) {
    statusBadge.textContent = 'En cours...';
    statusBadge.style.color = '#93c5fd';
  }
  if (summaryDesc) summaryDesc.textContent = "Mesure des performances processeur, mémoire et réseau...";

  try {
    const res = await fetch('/api/system/benchmark');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors du benchmark');

    renderBenchmarkCards('settings', data);

    const verdictCard = document.getElementById('settingsVerdictCard');
    const verdictBadge = document.getElementById('settingsVerdictBadge');
    const verdictTitle = document.getElementById('settingsVerdictTitle');
    const verdictDesc = document.getElementById('settingsVerdictDesc');

    if (verdictCard) {
      verdictCard.className = `welcome-verdict-box verdict-${data.badgeColor || 'success'}`;
    }
    if (verdictBadge) {
      verdictBadge.textContent = data.badgeColor === 'success' ? 'Optimal' : (data.badgeColor === 'warning' ? 'Conseillé' : 'Limité');
    }
    if (verdictTitle) verdictTitle.textContent = data.verdictTitle;
    if (verdictDesc) verdictDesc.textContent = data.verdictDesc;

    if (statusBadge) {
      statusBadge.textContent = data.badgeColor === 'success' ? 'Optimal' : (data.badgeColor === 'warning' ? 'Conseillé' : 'Limité');
      statusBadge.style.color = data.badgeColor === 'success' ? '#4ade80' : (data.badgeColor === 'warning' ? '#facc15' : '#f87171');
    }
    if (summaryDesc) {
      summaryDesc.textContent = `${data.verdictTitle} — ${data.totalRamGb} Go RAM, ${data.cpuCores} Cœurs`;
    }

    if (loader) loader.style.display = 'none';
    if (results) results.style.display = 'block';
    showToast("Benchmark terminé avec succès !", "success");
  } catch (err) {
    console.warn('Erreur diagnostic composants dans paramètres:', err);
    if (loader) loader.style.display = 'none';
    if (summaryDesc) summaryDesc.textContent = `Échec de l'analyse : ${err.message}`;
    if (statusBadge) {
      statusBadge.textContent = 'Erreur';
      statusBadge.style.color = '#ef4444';
    }
    showToast(`Échec du benchmark : ${err.message}`, 'error');
  } finally {
    if (btn && origBtnHtml) {
      btn.disabled = false;
      btn.innerHTML = origBtnHtml;
    }
  }
}
window.runSettingsBenchmark = runSettingsBenchmark;

function openExternalUrl(url) {
  if (!url) return;
  // 1. Ouvrir via l'API Node.js locale dans le navigateur par défaut configuré sur la machine (Windows & Mac)
  fetch('/api/app/open-external', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  }).then(async (res) => {
    if (!res.ok) throw new Error('API open-external failed');
  }).catch(() => {
    // 2. Fallback bridge WebKit macOS
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.openExternalUrl) {
      window.webkit.messageHandlers.openExternalUrl.postMessage(url);
    } else {
      // 3. Fallback navigateur standard
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  });
}
window.openExternalUrl = openExternalUrl;

function openAuthorPortfolio() {
  openExternalUrl('https://gjagueneau.fr');
}
window.openAuthorPortfolio = openAuthorPortfolio;

// Interception automatique de tous les liens externes vers les sites web
document.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (!link) return;
  const href = link.getAttribute('href');
  if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
    e.preventDefault();
    openExternalUrl(href);
  }
});

// ==========================================================================
// Splash Loader Simple (actif dès le 2e lancement de l'application)
// ==========================================================================
const HAS_LAUNCHED_KEY = 'msm_app_has_launched';
let splashDismissed = false;

function initSplashLoader() {
  const splash = document.getElementById('appSplashLoader');
  if (!splash) return;

  const hasLaunched = localStorage.getItem(HAS_LAUNCHED_KEY);
  if (hasLaunched === 'true') {
    // 2e lancement et suivants : afficher immédiatement le loader
    splash.style.display = 'flex';
  } else {
    // 1er lancement : masquer le loader pour laisser apparaître le panneau de configuration
    splash.style.display = 'none';
  }
}

function dismissSplashLoader() {
  if (splashDismissed) return;
  splashDismissed = true;

  try {
    localStorage.setItem(HAS_LAUNCHED_KEY, 'true');
  } catch (e) { }

  const splash = document.getElementById('appSplashLoader');
  if (!splash || splash.style.display === 'none') return;

  splash.classList.add('fade-out');
  setTimeout(() => {
    splash.style.display = 'none';
  }, 350);
}

// Initialisation
window.addEventListener('DOMContentLoaded', async () => {
  initSplashLoader();

  const welcomeBackdrop = document.getElementById('welcomeModal');
  if (welcomeBackdrop) {
    welcomeBackdrop.addEventListener('click', (e) => {
      if (e.target === welcomeBackdrop) {
        closeWelcomeModal();
      }
    });
  }

  const hasLaunched = localStorage.getItem(HAS_LAUNCHED_KEY);
  const isSecondOrMore = (hasLaunched === 'true');

  const loadDataPromises = [
    fetchWorlds().catch(() => { }),
    fetchStatus().catch(() => { }),
    fetchVanillaVersions().catch(() => { }),
    initSSE()
  ];

  if (isSecondOrMore) {
    // Attendre que l'application soit connectée et chargée (min 500ms pour fluidité, max 2500ms)
    const timeoutPromise = new Promise(resolve => setTimeout(resolve, 2500));
    const readyPromise = Promise.all([
      Promise.all(loadDataPromises),
      new Promise(resolve => setTimeout(resolve, 500))
    ]);

    await Promise.race([readyPromise, timeoutPromise]);
    dismissSplashLoader();
    checkWelcomeModal();
  } else {
    // 1er lancement : afficher le modal de bienvenue et enregistrer que l'app a été ouverte
    try {
      localStorage.setItem(HAS_LAUNCHED_KEY, 'true');
    } catch (e) { }
    checkWelcomeModal();
  }

  // Rafraîchissement économique de secours (uniquement si SSE inactif, toutes les 30s)
  setInterval(async () => {
    if (document.hidden) return;
    try {
      if (!isSseActive) {
        await fetchStatus();
        await fetchWorlds();
      }
    } catch (e) { }
  }, 30000);

  // Rafraîchissement instantané lors du retour sur l'onglet de l'application
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      fetchStatus().catch(() => { });
      fetchWorlds().catch(() => { });
    }
  });

  // Vérification si une mise à jour vient d'être appliquée (Résumé post-update)
  sessionStorage.removeItem('updateOfferDeclined'); // Purger l'ancien drapeau global de test
  checkPostUpdateSummary().then((hasSummary) => {
    // Si aucun résumé n'a été affiché, vérifier rapidement si une nouvelle mise à jour est disponible
    if (!hasSummary) {
      setTimeout(() => checkForAppUpdates(true), 400);
    }
  });
});

/**
 * Système de mise à jour intégrée à l'application
 */
let pendingUpdateData = null;

async function checkPostUpdateSummary() {
  try {
    const res = await fetch('/api/app/update-summary');
    const data = await res.json();
    if (data && data.hasSummary && data.summary) {
      showUpdateSummaryModal(data.summary);
      return true;
    }
  } catch (_) { }
  return false;
}

function showUpdateSummaryModal(summary) {
  const modal = document.getElementById('updateSummaryModal');
  if (!modal) return;
  const settingsModal = document.getElementById('appSettingsModal');
  if (settingsModal && settingsModal.style.display !== 'none') {
    settingsModal.style.display = 'none';
  }
  const versionBadge = document.getElementById('updateSummaryVersionBadge');
  if (versionBadge) versionBadge.textContent = `Version v${summary.version}`;
  const notesEl = document.getElementById('updateSummaryNotesContent');
  if (notesEl) {
    const rawNotes = summary.releaseNotes || summary.releaseName || 'Mise à jour installée avec succès.';
    if (typeof renderMarkdownToHtml === 'function') {
      notesEl.innerHTML = renderMarkdownToHtml(rawNotes);
    } else {
      notesEl.textContent = rawNotes;
    }
  }
  modal.style.display = 'flex';
}

function closeUpdateSummaryModal() {
  const modal = document.getElementById('updateSummaryModal');
  if (modal) modal.style.display = 'none';
}

let updateOfferPostponedThisSession = false;

async function checkForAppUpdates(silent = true) {
  const btn = document.getElementById('btnManualCheckUpdate');
  const feedback = document.getElementById('settingsUpdateFeedback');
  const origBtnHtml = btn ? btn.innerHTML : null;

  if (!silent) {
    updateOfferPostponedThisSession = false;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<div class="action-spinner" style="width:14px;height:14px;border-width:2px;"></div><span>Recherche...</span>`;
    }
    if (feedback) {
      feedback.innerHTML = `
        <span class="settings-update-checking">
          <span class="action-spinner" style="width:12px;height:12px;border-width:2px;"></span>
          <span>Vérification en direct auprès des serveurs GitHub...</span>
        </span>
      `;
    }
  } else if (updateOfferPostponedThisSession) {
    return;
  }

  // Fermer la modale de résumé si l'utilisateur lance une vérification manuelle
  const summaryModal = document.getElementById('updateSummaryModal');
  if (summaryModal && summaryModal.style.display === 'flex') {
    if (silent) return;
    summaryModal.style.display = 'none';
  }

  const currentOfferModal = document.getElementById('updateOfferModal');
  if (currentOfferModal && currentOfferModal.style.display === 'flex') {
    if (silent) return;
    // Si l'utilisateur clique manuellement alors qu'une offre est déjà ouverte, masquer les paramètres pour lui montrer
    const settingsModal = document.getElementById('appSettingsModal');
    if (settingsModal) settingsModal.style.display = 'none';
    if (feedback && pendingUpdateData) {
      feedback.innerHTML = `<span style="color:#60a5fa;font-weight:600;">Nouvelle version v${escapeHtml(pendingUpdateData.latestVersion)} disponible</span>`;
    }
    if (btn && origBtnHtml) {
      btn.disabled = false;
      btn.innerHTML = origBtnHtml;
    }
    return;
  }

  try {
    const res = await fetch('/api/app/check-update', {
      signal: AbortSignal.timeout(6000)
    });
    const data = await res.json();
    if (data && data.updateAvailable) {
      pendingUpdateData = data;
      if (feedback) {
        feedback.innerHTML = `<span style="color:#60a5fa;font-weight:600;">Nouvelle version v${escapeHtml(data.latestVersion)} disponible</span>`;
      }
      showUpdateOfferModal(data);
    } else {
      const curV = data?.currentVersion || '1.0.0';
      if (!silent) {
        if (feedback) {
          feedback.innerHTML = `<span style="color:#4ade80;font-weight:600;">Votre application est à jour (v${escapeHtml(curV)}).</span>`;
        }
        showToast(`Votre application est à jour (v${curV}).`, 'success');
      }
    }
  } catch (e) {
    console.warn('[Update] Erreur de vérification:', e);
    if (!silent) {
      if (feedback) {
        feedback.innerHTML = `<span style="color:#f87171;">Impossible de contacter GitHub : ${escapeHtml(e.message || 'erreur réseau')}</span>`;
      }
      showToast("Impossible de vérifier les mises à jour.", 'warning');
    }
  } finally {
    if (!silent && btn && origBtnHtml) {
      btn.disabled = false;
      btn.innerHTML = origBtnHtml;
    }
  }
}
function renderMarkdownToHtml(text) {
  if (!text || typeof text !== 'string') return '';
  const lines = text.split(/\r?\n/);
  let html = '';
  let inList = false;

  const flushList = () => {
    if (inList === 'ul') {
      html += '</ul>';
      inList = false;
    } else if (inList === 'ol') {
      html += '</ol>';
      inList = false;
    }
  };

  const formatInlineText = (str) => {
    let out = escapeHtml(str);
    // Liens [texte](url)
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // `code`
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    // **gras**
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // *italique*
    out = out.replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, '$1<em>$2</em>$3');
    return out;
  };

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    // Titres Markdown (###, ##, #)
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      flushList();
      const level = Math.min(6, Math.max(3, headerMatch[1].length + 1));
      html += `<h${level}>${formatInlineText(headerMatch[2])}</h${level}>`;
      continue;
    }

    // Listes ordonnées (1. , 2. )
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      if (inList !== 'ol') {
        flushList();
        html += '<ol>';
        inList = 'ol';
      }
      html += `<li>${formatInlineText(numMatch[2])}</li>`;
      continue;
    }

    // Listes à puces (-, *, •)
    const listMatch = trimmed.match(/^[-*•]\s*(.*)$/);
    if (listMatch) {
      if (inList !== 'ul') {
        flushList();
        html += '<ul>';
        inList = 'ul';
      }
      html += `<li>${formatInlineText(listMatch[1])}</li>`;
      continue;
    }

    // Paragraphe standard
    flushList();
    html += `<p>${formatInlineText(trimmed)}</p>`;
  }

  flushList();
  return html;
}
window.renderMarkdownToHtml = renderMarkdownToHtml;

function showUpdateOfferModal(updateData) {
  const modal = document.getElementById('updateOfferModal');
  if (!modal) return;

  // Si la fenêtre des paramètres est ouverte, la masquer pour mettre en valeur la proposition de mise à jour
  const settingsModal = document.getElementById('appSettingsModal');
  if (settingsModal && settingsModal.style.display !== 'none') {
    settingsModal.style.display = 'none';
  }

  const versionBadge = document.getElementById('updateOfferVersionBadge');
  if (versionBadge) versionBadge.textContent = `Version v${updateData.latestVersion}`;

  const desc = document.getElementById('updateOfferDescription');
  if (desc) {
    desc.textContent = updateData.releaseName && updateData.releaseName !== `Version ${updateData.latestVersion}`
      ? updateData.releaseName
      : `Une nouvelle version v${updateData.latestVersion} de Cubirium est disponible.`;
  }

  const notesBox = document.getElementById('updateOfferNotesBox');
  const notesEl = document.getElementById('updateOfferNotesContent');
  if (notesEl) {
    if (updateData.releaseNotes && updateData.releaseNotes.trim().length > 0) {
      if (typeof renderMarkdownToHtml === 'function') {
        notesEl.innerHTML = renderMarkdownToHtml(updateData.releaseNotes.trim());
      } else {
        notesEl.textContent = updateData.releaseNotes.trim();
      }
      if (notesBox) notesBox.style.display = 'block';
    } else {
      if (notesBox) notesBox.style.display = 'none';
    }
  }

  const normalView = document.getElementById('updateOfferNormalView');
  const progressView = document.getElementById('updateOfferProgressView');
  const footer = document.getElementById('updateOfferFooter');
  const closeBtn = document.getElementById('btnCloseUpdateOfferModal');

  if (normalView) normalView.style.display = 'block';
  if (progressView) progressView.style.display = 'none';
  if (footer) footer.style.display = 'flex';
  if (closeBtn) closeBtn.style.display = 'block';

  modal.style.display = 'flex';
}

function closeUpdateOfferModal() {
  const modal = document.getElementById('updateOfferModal');
  if (modal) modal.style.display = 'none';
  updateOfferPostponedThisSession = true;
}

async function startInAppUpdate() {
  if (!pendingUpdateData) return;

  const normalView = document.getElementById('updateOfferNormalView');
  const progressView = document.getElementById('updateOfferProgressView');
  const footer = document.getElementById('updateOfferFooter');
  const closeBtn = document.getElementById('btnCloseUpdateOfferModal');
  const title = document.getElementById('updateProgressTitle');
  const sub = document.getElementById('updateProgressSubtitle');

  if (normalView) normalView.style.display = 'none';
  if (progressView) progressView.style.display = 'block';
  if (footer) footer.style.display = 'none';
  const spinner = progressView ? progressView.querySelector('.update-spinner') : null;
  if (spinner) spinner.style.display = 'block';
  const existingErrorIcon = progressView ? progressView.querySelector('.update-error-icon') : null;
  if (existingErrorIcon) existingErrorIcon.style.display = 'none';

  if (title) title.textContent = "Téléchargement de la mise à jour...";
  if (sub) sub.textContent = `Téléchargement et application des composants v${pendingUpdateData.latestVersion}...`;

  try {
    const res = await fetch('/api/app/apply-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetVersion: pendingUpdateData.latestVersion,
        releaseName: pendingUpdateData.releaseName,
        releaseNotes: pendingUpdateData.releaseNotes
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      const err = new Error(data.error || "Erreur lors de l'application de la mise à jour.");
      if (data.details) err.details = data.details;
      throw err;
    }

    if (title) title.textContent = "Mise à jour installée avec succès !";
    if (sub) sub.textContent = "Rechargement automatique de l'application...";

    setTimeout(() => {
      window.location.reload();
    }, 2200);
  } catch (err) {
    if (spinner) spinner.style.display = 'none';

    let errorIcon = progressView ? progressView.querySelector('.update-error-icon') : null;
    if (!errorIcon && progressView) {
      errorIcon = document.createElement('div');
      errorIcon.className = 'update-error-icon';
      errorIcon.innerHTML = `<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
      progressView.insertBefore(errorIcon, title);
    }
    if (errorIcon) errorIcon.style.display = 'flex';

    if (title) title.textContent = "Échec de la mise à jour";
    if (sub) {
      const errorMsg = err.message || "Une erreur est survenue lors de la mise à jour.";
      const errorDetails = err.details || "";
      sub.innerHTML = `
        <div style="color: var(--text-muted); margin-bottom: 8px;">${escapeHtml(errorMsg)}</div>
        ${errorDetails ? `<div class="update-error-box"><code>${escapeHtml(errorDetails)}</code></div>` : ''}
      `;
    }

    if (footer) footer.style.display = 'flex';
    if (closeBtn) closeBtn.style.display = 'block';
    const acceptBtn = document.getElementById('btnAcceptUpdate');
    if (acceptBtn) {
      acceptBtn.textContent = "Réessayer";
      acceptBtn.onclick = () => {
        if (errorIcon) errorIcon.style.display = 'none';
        if (spinner) spinner.style.display = 'block';
        if (normalView) normalView.style.display = 'block';
        if (progressView) progressView.style.display = 'none';
        acceptBtn.textContent = "Mettre à jour";
        acceptBtn.onclick = startInAppUpdate;
      };
    }
  }
}


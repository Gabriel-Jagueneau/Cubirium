// Minecraft Server Manager - Frontend Client Logic

let activeWorld = null;
let serverStatus = 'STOPPED';
let currentServerStartTime = null;
let tunnelAddress = null;
let currentAnalysis = null;
let uploadedFilePath = null;
let autoScroll = true;

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

// Toast Helper
function showToast(msg, type = 'info') {
  toast.textContent = msg;
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
  } catch (e) {}
}

async function startWorld(worldId) {
  try {
    selectTerminalWorld(worldId);
    showToast(`Démarrage de ${worldId}...`, 'info');
    const res = await fetch('/api/worlds/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors du démarrage');
    showToast(`Monde ${worldId} lancé avec succès !`, 'success');
    fetchWorlds();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function stopActiveWorld() {
  try {
    showToast("Arrêt du serveur en cours...", 'info');
    const res = await fetch('/api/worlds/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: false })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'arrêt');
    showToast("Serveur arrêté.", 'info');
    fetchWorlds();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function triggerWorldRepair(worldId) {
  try {
    showToast(`Réparation automatique de ${worldId}...`, 'info');
    const res = await fetch('/api/worlds/repair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de la réparation');
    if (data.success) {
      showToast(data.message || `Monde ${worldId} réparé avec succès !`, 'success');
      await fetchWorlds();
    } else if (data.corrupted) {
      showToast(data.message || `Le monde est corrompu. Ouverture du dossier...`, 'error');
      openWorldFolder(worldId);
      await fetchWorlds();
    } else {
      showToast(data.error || 'Impossible de réparer le monde.', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

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

// Ticker de Runtime chaque seconde (affiche toujours le chronomètre et conserve le runtime actuel)
setInterval(() => {
  document.querySelectorAll('.runtime-val, .uptime-val').forEach(el => {
    const wid = el.getAttribute('data-world-id');
    const isThisRunning = (serverStatus === 'RUNNING' && (wid === activeWorld || (!activeWorld && wid === selectedTerminalWorldId)));
    const baseRuntime = parseInt(el.getAttribute('data-base-runtime') || '0', 10);
    const currRuntime = parseInt(el.getAttribute('data-current-runtime') || el.getAttribute('data-base-runtime') || '0', 10);
    let startTimeStr = el.getAttribute('data-start-time');
    
    // Si le monde tourne mais n'avait pas encore son timestamp d'origine
    if ((!startTimeStr || startTimeStr === '0') && isThisRunning && currentServerStartTime) {
      startTimeStr = String(currentServerStartTime);
      el.setAttribute('data-start-time', startTimeStr);
    }
    
    if (isThisRunning && startTimeStr) {
      const st = parseInt(startTimeStr, 10);
      if (st > 0) {
        const elapsed = Math.max(0, Math.floor((Date.now() - st) / 1000));
        const total = baseRuntime + elapsed;
        const formatted = formatSeconds(total);
        if (el.textContent !== formatted) el.textContent = formatted;
        el.setAttribute('data-current-runtime', String(total));
        return;
      }
    }
    
    // Si le monde ne tourne pas : afficher son runtime actuel enregistré (persistant, jamais 00:00:00 arbitraire)
    const formatted = formatSeconds(currRuntime);
    if (el.textContent !== formatted) el.textContent = formatted;
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
  } catch (e) {}
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
  } catch (e) {}
}

function togglePinWorld(worldId) {
  let pinned = getPinnedWorldIds();
  const idx = pinned.indexOf(worldId);
  if (idx !== -1) {
    pinned.splice(idx, 1);
  } else {
    pinned.push(worldId);
  }
  savePinnedWorldIds(pinned);
  renderWorlds(worldsListCache);
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

// Drag & drop pour réordonner les mondes épinglés avec highlight des zones de drop
let draggedPinnedWorldId = null;

function activateDropHighlights() {
  const grid = document.getElementById('worldsList');
  if (grid) grid.classList.add('is-dragging-pinned');
}

function deactivateDropHighlights() {
  const grid = document.getElementById('worldsList');
  if (grid) grid.classList.remove('is-dragging-pinned');
}

function handlePinnedMouseDown(e, worldId) {
  draggedPinnedWorldId = worldId;
  activateDropHighlights();

  const onMouseUp = () => {
    deactivateDropHighlights();
    document.removeEventListener('mouseup', onMouseUp);
  };
  document.addEventListener('mouseup', onMouseUp);
}

const transparentDragImage = new Image();
transparentDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function handlePinnedDragStart(e, worldId) {
  draggedPinnedWorldId = worldId;
  activateDropHighlights();
  e.dataTransfer.effectAllowed = 'move';
  try {
    // Ne JAMAIS utiliser 'text/plain' pour éviter que macOS AppKit n'affiche le badge rouge de texte
    e.dataTransfer.setData('application/x-world-id', worldId);
  } catch (_) {}

  if (e.dataTransfer.setDragImage) {
    e.dataTransfer.setDragImage(transparentDragImage, 0, 0);
  }

  const card = document.querySelector(`.world-card[data-id="${worldId}"]`);
  if (card) card.classList.add('dragging');
}

function handlePinnedDragEnd() {
  draggedPinnedWorldId = null;
  deactivateDropHighlights();
  document.querySelectorAll('.world-card').forEach(c => {
    c.classList.remove('dragging', 'drag-over');
  });
}

function handlePinnedDragOver(e, targetWorldId) {
  if (!draggedPinnedWorldId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (targetWorldId && targetWorldId !== draggedPinnedWorldId) {
    const card = document.querySelector(`.world-card[data-id="${targetWorldId}"]`);
    if (card && card.classList.contains('is-pinned') && !card.classList.contains('drag-over')) {
      document.querySelectorAll('.world-card.drag-over').forEach(c => {
        if (c !== card) c.classList.remove('drag-over');
      });
      card.classList.add('drag-over');
    }
  }
}

function handlePinnedDragEnter(e, targetWorldId) {
  if (!draggedPinnedWorldId || draggedPinnedWorldId === targetWorldId) return;
  const card = document.querySelector(`.world-card[data-id="${targetWorldId}"]`);
  if (card && card.classList.contains('is-pinned')) {
    document.querySelectorAll('.world-card.drag-over').forEach(c => {
      if (c !== card) c.classList.remove('drag-over');
    });
    card.classList.add('drag-over');
  }
}

function handlePinnedDragLeave(e, targetWorldId) {
  const card = document.querySelector(`.world-card[data-id="${targetWorldId}"]`);
  if (!card) return;
  if (e.relatedTarget && card.contains(e.relatedTarget)) {
    return;
  }
  card.classList.remove('drag-over');
}

function handlePinnedDrop(e, targetWorldId) {
  e.preventDefault();
  if (!draggedPinnedWorldId || draggedPinnedWorldId === targetWorldId) return;
  let pinned = getPinnedWorldIds();
  const fromIdx = pinned.indexOf(draggedPinnedWorldId);
  const toIdx = pinned.indexOf(targetWorldId);
  if (fromIdx !== -1 && toIdx !== -1) {
    const [moved] = pinned.splice(fromIdx, 1);
    pinned.splice(toIdx, 0, moved);
    savePinnedWorldIds(pinned);
    renderWorlds(worldsListCache);
  }
  handlePinnedDragEnd();
}

let lastRenderedWorldsSignature = null;

function buildWorldCardHtml(w, opts) {
  const { isRunning, typeClass, isSelected, isActionDisabled, isServerRunning, isPinned, isCollapsed, displayRuntime, baseRuntimeSecs, runtimeSecs, effectiveStartTime } = opts;
  const lockAttr = isActionDisabled ? 'disabled class="btn-card-action disabled"' : 'class="btn-card-action"';
  const lockDeleteAttr = isActionDisabled ? 'disabled class="btn-card-action btn-card-delete disabled"' : 'class="btn-card-action btn-card-delete"';

  const dropZoneAttrs = isPinned ? `
    ondragend="handlePinnedDragEnd()"
    ondragover="handlePinnedDragOver(event, '${w.id}')"
    ondragenter="handlePinnedDragEnter(event, '${w.id}')"
    ondragleave="handlePinnedDragLeave(event, '${w.id}')"
    ondrop="handlePinnedDrop(event, '${w.id}')"
  ` : '';

  return `
    <div class="world-card ${isRunning ? 'running' : ''} ${isSelected ? 'selected' : ''} ${isPinned ? 'is-pinned' : ''} ${isCollapsed ? 'collapsed' : ''}" 
         data-id="${w.id}" 
         ${dropZoneAttrs}
         onclick="selectTerminalWorld('${w.id}')">
      <div class="world-header">
        <div class="world-title-box">
          <div class="world-title-row">
            <span class="world-name">${escapeHtml(w.name)}</span>
            <span class="pulse-dot ${isRunning ? 'online' : ''}" title="${isRunning ? 'Serveur en ligne' : 'Serveur arrêté'}"></span>
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
                  data-start-time="${effectiveStartTime}">${displayRuntime}</strong>
        </div>
        <div class="meta-item">
          <span>Taille:</span>
          <strong>${w.worldSize || '0 Mo'}</strong>
        </div>
      </div>

      <div class="world-actions" onclick="event.stopPropagation()">
        ${isRunning 
          ? `<button class="btn-stop-world" onclick="stopActiveWorld()">Arrêter</button>` 
          : w.isCorrupted
            ? `<button class="btn-corrupted" onclick="openWorldFolder('${w.id}')" title="Ce monde est corrompu. Cliquez pour ouvrir son dossier dans l'explorateur.">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                Corrompu
               </button>`
            : w.needsRepair
              ? `<button class="btn-repair" ${isServerRunning ? 'disabled' : ''} onclick="triggerWorldRepair('${w.id}')" title="Incident détecté. Cliquez pour lancer la réparation automatique.">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                  </svg>
                  Réparer
                 </button>`
              : `<button class="btn-launch" ${isServerRunning ? 'disabled' : ''} onclick="startWorld('${w.id}')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  Lancer
                 </button>`
        }
        <button class="btn-card-action btn-card-players" title="Gestion des Joueurs (Ops, Whitelist, Bans)" onclick="openPlayersManager('${w.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        </button>
        <button ${lockAttr} title="Modifier server.properties" onclick="openEditProps('${w.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
        <button ${lockAttr} title="Gestion du monde (Dimensions, Export, Renommer)" onclick="openRenameWorld('${w.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
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
             draggable="true" 
             onmousedown="handlePinnedMouseDown(event, '${w.id}')"
             ondragstart="handlePinnedDragStart(event, '${w.id}')"
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

function renderWorlds(worlds) {
  worldsListCache = worlds || [];
  worldsCountBadge.textContent = worldsListCache.length;

  // Supprimer immédiatement l'indicateur initial de chargement
  const initialLoader = worldsList.querySelector('.loading-state');
  if (initialLoader) initialLoader.remove();

  if (worldsListCache.length === 0) {
    if (lastRenderedWorldsSignature === 'empty' && worldsList.querySelector('.empty-state')) {
      updateTerminalHeader();
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
    updateTerminalHeader();
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
    if (!selectedTerminalWorldId && sortedWorlds.length > 0) {
      selectTerminalWorld(activeWorld || sortedWorlds[0].id);
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
    const isRunning = w.isRunning || (w.id === activeWorld && serverStatus === 'RUNNING');
    const typeClass = w.type === 'Moddé' ? 'modded' : 'vanilla';
    const isSelected = (w.id === selectedTerminalWorldId);
    const isServerRunning = (serverStatus !== 'STOPPED');
    const isActionDisabled = isServerRunning || isRunning;
    const isPinned = pinnedIds.includes(w.id);
    const isCollapsed = collapsedIds.includes(w.id);

    const runtimeSecs = (typeof w.runtime === 'number') ? w.runtime : ((typeof w.uptime === 'number') ? w.uptime : 0);
    const baseRuntimeSecs = (typeof w.baseRuntime === 'number') ? w.baseRuntime : runtimeSecs;
    const effectiveStartTime = w.startTime || (isRunning ? (currentServerStartTime || Date.now()) : '');
    const displayRuntime = isRunning ? formatRuntime(effectiveStartTime, baseRuntimeSecs) : formatSeconds(runtimeSecs);

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
      card.classList.toggle('running', isRunning);
      card.classList.toggle('selected', isSelected);
      card.classList.toggle('is-pinned', isPinned);
      card.classList.toggle('collapsed', isCollapsed);

      const dot = card.querySelector('.world-title-row .pulse-dot');
      if (dot) {
        dot.className = 'pulse-dot ' + (isRunning ? 'online' : '');
        dot.title = isRunning ? 'Serveur en ligne' : 'Serveur arrêté';
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
        if (runtimeEl.textContent !== displayRuntime) runtimeEl.textContent = displayRuntime;
        runtimeEl.setAttribute('data-base-runtime', String(baseRuntimeSecs));
        runtimeEl.setAttribute('data-current-runtime', String(runtimeSecs));
        runtimeEl.setAttribute('data-start-time', String(effectiveStartTime));
      }

      const sizeEl = card.querySelector('.world-meta .meta-item:last-child strong');
      if (sizeEl && sizeEl.textContent !== (w.worldSize || '0 Mo')) {
        sizeEl.textContent = w.worldSize || '0 Mo';
      }

      const actionsDiv = card.querySelector('.world-actions');
      if (actionsDiv) {
        const primaryBtn = actionsDiv.querySelector('.btn-stop-world, .btn-launch, .btn-repair, .btn-corrupted');
        let expectedBtnHtml = '';
        let expectedType = '';
        if (isRunning) {
          expectedType = 'stop';
          expectedBtnHtml = `<button class="btn-stop-world" onclick="stopActiveWorld()">Arrêter</button>`;
        } else if (w.isCorrupted) {
          expectedType = 'corrupted';
          expectedBtnHtml = `<button class="btn-corrupted" onclick="openWorldFolder('${w.id}')" title="Ce monde est corrompu. Cliquez pour ouvrir son dossier dans l'explorateur."><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>Corrompu</button>`;
        } else if (w.needsRepair) {
          expectedType = 'repair';
          expectedBtnHtml = `<button class="btn-repair" ${isServerRunning ? 'disabled' : ''} onclick="triggerWorldRepair('${w.id}')" title="Incident détecté. Cliquez pour lancer la réparation automatique."><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>Réparer</button>`;
        } else {
          expectedType = 'launch';
          expectedBtnHtml = `<button class="btn-launch" ${isServerRunning ? 'disabled' : ''} onclick="startWorld('${w.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>Lancer</button>`;
        }

        if (primaryBtn) {
          const currentType = primaryBtn.classList.contains('btn-stop-world') ? 'stop'
            : primaryBtn.classList.contains('btn-corrupted') ? 'corrupted'
            : primaryBtn.classList.contains('btn-repair') ? 'repair'
            : 'launch';
          if (currentType !== expectedType) {
            primaryBtn.outerHTML = expectedBtnHtml;
          } else if (expectedType === 'launch' || expectedType === 'repair') {
            if (primaryBtn.disabled !== isServerRunning) primaryBtn.disabled = isServerRunning;
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

  if (!selectedTerminalWorldId && sortedWorlds.length > 0) {
    selectTerminalWorld(activeWorld || sortedWorlds[0].id);
  } else {
    updateTerminalHeader();
  }
}

function updateMinecraftState(state) {
  const previousStatus = serverStatus;
  serverStatus = state.status;
  activeWorld = state.activeWorld;
  currentPlayersList = state.players || [];
  if (state.startTime) {
    currentServerStartTime = state.startTime;
  } else if (serverStatus === 'STOPPED') {
    currentServerStartTime = null;
    if (previousStatus && previousStatus !== 'STOPPED') {
      fetchWorlds();
    }
  }

  updateTerminalHeader();

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

function updateTunnelState(state) {
  if (state && state.publicAddress) {
    tunnelAddress = state.publicAddress;
    updateTerminalHeader();
  } else if (state && state.status === 'STOPPED') {
    tunnelAddress = null;
    updateTerminalHeader();
  }
}

async function selectTerminalWorld(worldId) {
  if (!worldId) return;
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

  if (!selectedTerminalWorldId) {
    activeWorldTitle.textContent = 'Aucun terminal actif';
    serverPulseDot.className = 'pulse-dot';
    btnStopActiveServer.style.display = 'none';
    btnLaunchViewedWorld.style.display = 'none';
    cmdInput.disabled = true;
    btnSendCmd.disabled = true;
    cmdInput.placeholder = 'Sélectionnez un monde pour accéder à sa console';
    return;
  }

  const isViewedRunning = (selectedTerminalWorldId === activeWorld && serverStatus === 'RUNNING');
  const isViewedStarting = (selectedTerminalWorldId === activeWorld && serverStatus === 'STARTING');
  const isViewedStopping = (selectedTerminalWorldId === activeWorld && serverStatus === 'STOPPING');

  activeWorldTitle.textContent = `Terminal : ${selectedTerminalWorldId}`;

  if (isViewedRunning) {
    serverPulseDot.className = 'pulse-dot online';
    btnStopActiveServer.style.display = 'inline-block';
    btnLaunchViewedWorld.style.display = 'none';
    cmdInput.disabled = false;
    btnSendCmd.disabled = false;
    cmdInput.placeholder = `Commande pour ${selectedTerminalWorldId} (ex: op Gabriel, tp, say...)`;
  } else if (isViewedStarting) {
    serverPulseDot.className = 'pulse-dot warning';
    btnStopActiveServer.style.display = 'inline-block';
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
  if (tunnelSharePill && tunnelShareIp) {
    if (isViewedRunning && tunnelAddress) {
      tunnelSharePill.style.display = 'inline-flex';
      tunnelShareIp.textContent = tunnelAddress;
      tunnelShareIp.title = `Adresse de connexion : ${tunnelAddress}`;
    } else {
      tunnelSharePill.style.display = 'none';
    }
  }
}

function copyTunnelShareIp() {
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
  }
}
window.copyTunnelShareIp = copyTunnelShareIp;

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

  if (text.includes('[ERR]') || text.includes('ERROR') || text.includes('Exception')) {
    line.classList.add('error');
  } else if (text.includes('WARN')) {
    line.classList.add('warn');
  } else if (text.startsWith('>')) {
    line.classList.add('command');
  } else if (text.startsWith('[Tunnel]')) {
    line.classList.add('tunnel');
  } else {
    line.classList.add('info');
  }

  line.textContent = text;
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
function initSSE() {
  const evtSource = new EventSource('/api/events');

  evtSource.onmessage = (event) => {
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
let _suggestTimeout = null;
let _selectedSuggestionIndex = -1;
const cmdHistory = [];
let cmdHistoryIndex = -1;

const DEFAULT_COMMANDS = [
  { cmd: 'help', desc: 'Affiche la liste des commandes ou l’aide' },
  { cmd: 'list', desc: 'Liste les joueurs actuellement connectés' },
  { cmd: 'gamemode survival', desc: 'Passe en mode Survie' },
  { cmd: 'gamemode creative', desc: 'Passe en mode Créatif' },
  { cmd: 'gamemode spectator', desc: 'Passe en mode Spectateur' },
  { cmd: 'gamemode adventure', desc: 'Passe en mode Aventure' },
  { cmd: 'time set day', desc: 'Règle l’heure sur le jour (1000 ticks)' },
  { cmd: 'time set noon', desc: 'Règle l’heure sur midi (6000 ticks)' },
  { cmd: 'time set night', desc: 'Règle l’heure sur la nuit (13000 ticks)' },
  { cmd: 'time set midnight', desc: 'Règle l’heure sur minuit (18000 ticks)' },
  { cmd: 'weather clear', desc: 'Définit le temps sur dégagé' },
  { cmd: 'weather rain', desc: 'Déclenche la pluie' },
  { cmd: 'weather thunder', desc: 'Déclenche un orage violent' },
  { cmd: 'op <joueur>', desc: 'Donne les permissions administrateur' },
  { cmd: 'deop <joueur>', desc: 'Retire les permissions administrateur' },
  { cmd: 'whitelist on', desc: 'Active la liste blanche' },
  { cmd: 'whitelist off', desc: 'Désactive la liste blanche' },
  { cmd: 'whitelist list', desc: 'Liste les joueurs autorisés' },
  { cmd: 'whitelist add <joueur>', desc: 'Ajoute un joueur à la liste' },
  { cmd: 'whitelist remove <joueur>', desc: 'Retire un joueur de la liste' },
  { cmd: 'tp <joueur> <cible>', desc: 'Téléporte un joueur' },
  { cmd: 'give <joueur> <item>', desc: 'Donne un objet à un joueur' },
  { cmd: 'difficulty peaceful', desc: 'Difficulté Paisible' },
  { cmd: 'difficulty easy', desc: 'Difficulté Facile' },
  { cmd: 'difficulty normal', desc: 'Difficulté Normale' },
  { cmd: 'difficulty hard', desc: 'Difficulté Difficile' },
  { cmd: 'say <message>', desc: 'Diffuse un message à tous les joueurs' },
  { cmd: 'save-all', desc: 'Sauvegarde l’ensemble du monde' },
  { cmd: 'stop', desc: 'Arrête proprement le serveur' },
  { cmd: 'kick <joueur> [raison]', desc: 'Expulse un joueur du serveur' },
  { cmd: 'ban <joueur> [raison]', desc: 'Bannit un joueur du serveur' },
  { cmd: 'pardon <joueur>', desc: 'Débannit un joueur' },
  { cmd: 'gamerule keepInventory true', desc: 'Garde l’inventaire à la mort' },
  { cmd: 'gamerule mobGriefing false', desc: 'Empêche les dégâts des monstres' },
  { cmd: 'clear <joueur>', desc: 'Vide l’inventaire d’un joueur' },
  { cmd: 'kill <cible>', desc: 'Élimine une entité ou joueur' }
];

function filterCommandList(rawQuery, serverList) {
  const hasSlash = rawQuery.startsWith('/');
  const q = rawQuery.replace(/^\//, '').toLowerCase().trim();
  const pool = (serverList && serverList.length > 0) ? serverList : DEFAULT_COMMANDS;
  if (!q) {
    return pool.slice(0, 10);
  }
  return pool.filter(c => {
    const cmdStr = c.cmd.toLowerCase();
    const descStr = (c.desc || '').toLowerCase();
    return cmdStr.includes(q) || descStr.includes(q);
  }).slice(0, 10);
}

function renderSuggestions(suggestions, query) {
  if (!cmdSuggestionsBox || !suggestionsList) return;
  if (!suggestions || suggestions.length === 0) {
    cmdSuggestionsBox.style.display = 'none';
    _selectedSuggestionIndex = -1;
    return;
  }

  const hasSlash = (query || '').startsWith('/');
  suggestionsList.innerHTML = suggestions.map((s, idx) => `
    <div class="suggestion-item ${idx === _selectedSuggestionIndex ? 'active' : ''}" data-cmd="${escapeHtml(s.cmd)}" data-has-slash="${hasSlash ? 'true' : 'false'}">
      <span class="suggestion-cmd">${hasSlash ? '/' : ''}${escapeHtml(s.cmd)}</span>
      <span class="suggestion-desc">${escapeHtml(s.desc)}</span>
    </div>
  `).join('');

  cmdSuggestionsBox.style.display = 'flex';

  suggestionsList.querySelectorAll('.suggestion-item').forEach((el, index) => {
    el.onmousedown = (e) => {
      e.preventDefault();
      applySuggestion(el);
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

function applySuggestion(itemEl) {
  if (!itemEl || !cmdInput) return;
  const rawCmd = itemEl.getAttribute('data-cmd');
  const hadSlash = cmdInput.value.trim().startsWith('/');
  let finalCmd = hadSlash ? ('/' + rawCmd) : rawCmd;

  // Si la commande contient un placeholder comme <joueur>, remplacer par le curseur approprié
  cmdInput.value = finalCmd;
  cmdSuggestionsBox.style.display = 'none';
  _selectedSuggestionIndex = -1;
  cmdInput.focus();

  // Positionner le curseur
  const placeholderIdx = finalCmd.indexOf('<');
  if (placeholderIdx !== -1) {
    cmdInput.setSelectionRange(placeholderIdx, finalCmd.indexOf('>') + 1);
  } else {
    cmdInput.setSelectionRange(finalCmd.length, finalCmd.length);
  }
}

async function updateCommandSuggestions(query) {
  if (!cmdSuggestionsBox || !suggestionsList) return;
  const clean = query.trim();
  
  // Rendu immédiat avec le cache local
  const localFiltered = filterCommandList(clean, null);
  renderSuggestions(localFiltered, query);

  const wid = selectedTerminalWorldId || activeWorld || '';
  try {
    const res = await fetch(`/api/worlds/command-suggestions?worldId=${encodeURIComponent(wid)}&q=${encodeURIComponent(clean)}`);
    const data = await res.json();
    if (data.suggestions && data.suggestions.length > 0) {
      renderSuggestions(data.suggestions, query);
    }
  } catch (e) {
    // Garde le rendu local déjà effectué
  }
}

if (cmdInput) {
  cmdInput.addEventListener('input', (e) => {
    const val = e.target.value;
    _selectedSuggestionIndex = -1;
    clearTimeout(_suggestTimeout);
    _suggestTimeout = setTimeout(() => {
      updateCommandSuggestions(val);
    }, 40);
  });

  cmdInput.addEventListener('focus', () => {
    if (cmdInput.value.trim().length > 0) {
      updateCommandSuggestions(cmdInput.value);
    }
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
    const items = suggestionsList ? suggestionsList.querySelectorAll('.suggestion-item') : [];

    if (e.key === 'ArrowDown') {
      if (isBoxOpen && items.length > 0) {
        e.preventDefault();
        _selectedSuggestionIndex = (_selectedSuggestionIndex + 1) % items.length;
        updateActiveSuggestionHighlight();
      } else if (!cmdInput.value) {
        // Ouvre les suggestions si input vide
        e.preventDefault();
        updateCommandSuggestions('');
      }
    } else if (e.key === 'ArrowUp') {
      if (isBoxOpen && items.length > 0) {
        e.preventDefault();
        _selectedSuggestionIndex = (_selectedSuggestionIndex - 1 + items.length) % items.length;
        updateActiveSuggestionHighlight();
      } else {
        // Historique des commandes envoyées
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
        applySuggestion(target);
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
        applySuggestion(items[_selectedSuggestionIndex]);
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
      : 'Téléchargement du serveur officiel Mojang...';
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
}

if (btnCloseProgressModal) {
  btnCloseProgressModal.addEventListener('click', () => {
    closeProgressModal();
    fetchWorlds();
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
    updateProgressModal(100, `Monde Vanilla ${name} prêt !`);
  } catch (err) {
    setProgressError(err.message);
    showToast(err.message, 'error');
  }
});

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
        } catch (_) {}
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

    // Résultats du filtrage serveur / client
    if (analysisResults) {
      analysisResults.style.display = 'block';
    }
    if (serverModsCount) {
      serverModsCount.textContent = (analysis && analysis.serverMods) ? analysis.serverMods.length : 0;
    }
    if (clientModsCount) {
      clientModsCount.textContent = (analysis && analysis.clientOnlyMods) ? analysis.clientOnlyMods.length : 0;
    }

    if (excludedModsList) {
      const excluded = (analysis && analysis.clientOnlyMods) ? analysis.clientOnlyMods : [];
      excludedModsList.innerHTML = excluded.map(m => `
        <li>
          <span class="mod-name">${escapeHtml(m.modName || m.filename)}</span>
          <span class="mod-reason">${escapeHtml(m.reason || 'Mod visuel client')}</span>
        </li>
      `).join('') || '<li>Aucun mod exclu (tous compatibles serveur)</li>';
    }

    if (btnSubmitModded) {
      btnSubmitModded.disabled = false;
    }
    showToast(`Analyse réussie : ${(analysis && analysis.serverMods) ? analysis.serverMods.length : 0} mods serveur retenus.`, 'success');
  } catch (err) {
    console.error('Erreur applyAnalysisResult:', err);
    showToast('Erreur affichage mods: ' + err.message, 'error');
  }
}

// Réception des chemins choisis dans le Finder via le bridge natif Cocoa
let uploadedLocalModsPaths = null;
window.onModsPathsChosen = function(paths) {
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
        offline
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur création monde moddé');
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
window.onImportPathChosen = function(localPath) {
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
          badge.innerHTML = `<span style="color: #ef4444;">⚠️ ${escapeHtml(data.error || 'Erreur lors de l\'analyse')}</span>`;
        }
        if (btnSubmitImport) btnSubmitImport.setAttribute('disabled', 'true');
      }
    })
    .catch(err => {
      console.warn('Erreur détection monde local:', err);
      if (importDropZone) importDropZone.classList.remove('is-loading');
      if (badge) {
        badge.className = 'auto-detected-badge visible';
        badge.innerHTML = `<span style="color: #ef4444;">⚠️ Échec d'analyse (${escapeHtml(err.message)})</span>`;
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
            badge.innerHTML = `<span style="color: #ef4444;">⚠️ ${escapeHtml(data.error || 'Erreur lors de l\'analyse')}</span>`;
          }
          if (btnSubmitImport) btnSubmitImport.setAttribute('disabled', 'true');
        }
        if (importDropZone) importDropZone.classList.remove('is-loading');
      })
      .catch(err => {
        console.warn('Erreur détection monde direct:', err);
        if (badge) {
          badge.className = 'auto-detected-badge visible';
          badge.innerHTML = `<span style="color: #ef4444;">⚠️ Échec d'analyse (${escapeHtml(err.message)})</span>`;
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
          badge.innerHTML = `<span style="color: #ef4444;">⚠️ ${escapeHtml(data.error || 'Erreur lors de l\'analyse')}</span>`;
        }
        if (btnSubmitImport) btnSubmitImport.setAttribute('disabled', 'true');
      }
      if (importDropZone) importDropZone.classList.remove('is-loading');
    })
    .catch(err => {
      console.warn('Erreur détection monde:', err);
      if (badge) {
        badge.className = 'auto-detected-badge visible';
        badge.innerHTML = `<span style="color: #ef4444;">⚠️ Échec d'analyse (${escapeHtml(err.message)})</span>`;
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
      updateProgressModal(100, `Monde ${name} importé et configuré avec succès !`);
      fetchWorlds();
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
  if (propMotd) propMotd.value = props['motd'] || 'Serveur Minecraft';
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
    'motd': propMotd ? propMotd.value : 'Serveur Minecraft',
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
  if (btnOpenFinder) {
    btnOpenFinder.onclick = async () => {
      if (!editingWorldId) return;
      try {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.openFinder) {
          window.webkit.messageHandlers.openFinder.postMessage(fullPath);
          showToast('Dossier ouvert dans le Finder', 'success');
          return;
        }
        const res = await fetch('/api/worlds/open-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worldId: editingWorldId, customPath: fullPath })
        });
        const data = await res.json();
        if (res.ok) {
          showToast('Dossier ouvert dans le Finder', 'success');
        } else {
          showToast('Erreur ouverture Finder: ' + (data.error || 'Introuvable'), 'error');
        }
      } catch (e) {
        showToast('Erreur ouverture Finder: ' + e.message, 'error');
      }
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

if (player3dCanvas) {
  player3dCanvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
}

// Carte matériau -> noms de fichiers de texture armor
const ARMOR_MATERIAL_MAP = {
  // Layer 1 (helmet, chestplate, boots) + Layer 2 (leggings)
  'leather':    { l1: '/assets/minecraft/armor/leather_layer_1.png',    l2: '/assets/minecraft/armor/leather_layer_2.png',    overlay1: '/assets/minecraft/armor/leather_layer_1_overlay.png', overlay2: '/assets/minecraft/armor/leather_layer_2_overlay.png', isLeather: true },
  'iron':       { l1: '/assets/minecraft/armor/iron_layer_1.png',       l2: '/assets/minecraft/armor/iron_layer_2.png' },
  'gold':       { l1: '/assets/minecraft/armor/gold_layer_1.png',       l2: '/assets/minecraft/armor/gold_layer_2.png' },
  'diamond':    { l1: '/assets/minecraft/armor/diamond_layer_1.png',    l2: '/assets/minecraft/armor/diamond_layer_2.png' },
  'netherite':  { l1: '/assets/minecraft/armor/netherite_layer_1.png',  l2: '/assets/minecraft/armor/netherite_layer_2.png' },
  'chainmail':  { l1: '/assets/minecraft/armor/chainmail_layer_1.png',  l2: '/assets/minecraft/armor/chainmail_layer_2.png' },
  'turtle':     { l1: '/assets/minecraft/armor/turtle_layer_1.png',     l2: null },
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
    btnRefreshPlayersModal.style.transform = 'rotate(180deg)';
    btnRefreshPlayersModal.style.transition = 'transform 0.4s ease';
    await refreshPlayersData();
    setTimeout(() => {
      btnRefreshPlayersModal.style.transform = 'none';
    }, 400);
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
  btn.innerHTML = `<span style="display:flex;align-items:center;gap:4px;font-size:0.72rem;font-weight:700;color:#fca5a5;">⚠️ Confirmer ?</span>`;
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

async function pollPlayerDetailTick() {
  if (isPollingPlayerDetail) return;
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
        if (prevStr !== nextStr) {
          const invPrev = JSON.stringify(currentPlayerDetailData?.inventory);
          const invNext = JSON.stringify(data.inventory);
          currentPlayerDetailData = data;
          renderPlayerDetailView(data);
          if (invPrev !== invNext && _skinViewer) {
            _apply3DArmor(_skinViewer, data.inventory || []);
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

function closePlayerDetail() {
  hideMcTooltip();
  stopPlayerDetailPolling();
  if (playerDetailModal) playerDetailModal.style.display = 'none';
  currentPlayerDetailName = null;
  currentPlayerDetailData = null;
  // Nettoyage du viewer 3D
  if (_mouseMoveListener) {
    document.removeEventListener('mousemove', _mouseMoveListener);
    _mouseMoveListener = null;
  }
  if (_skinViewer) {
    try { _skinViewer.dispose(); } catch(e) {}
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
    // Lance le rendu 3D du skin du joueur
    initOrUpdate3DPlayer(playerName, data.inventory || [], data.uuid);
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

  if (detailStatusPill) {
    const isOnline = (data.isOnline !== undefined)
      ? !!data.isOnline
      : (currentPlayersList && currentPlayersList.some(p => p.toLowerCase() === data.name.toLowerCase()));
    detailStatusPill.textContent = isOnline ? 'En ligne' : 'Hors ligne';
    detailStatusPill.className = `player-status-pill ${isOnline ? 'online' : 'offline'}`;
  }

  // Mode de jeu (instantané avec support optimiste)
  if (detailGameModeSelect) {
    const optMode = data.name ? optimisticPlayerGameModes[data.name.toLowerCase()] : null;
    const effectiveMode = optMode || data.gameMode || data.gameType || 'survival';
    detailGameModeSelect.value = effectiveMode;
    if (data.name && data.gameMode && optMode === data.gameMode) {
      delete optimisticPlayerGameModes[data.name.toLowerCase()];
    }
  }

  // Vie et Expérience
  const xpLevel = data.xpLevel || 0;
  const xpProgress = Math.min(1, Math.max(0, data.xpProgress || 0));
  if (detailXpLabel) detailXpLabel.textContent = `Niveau ${xpLevel}`;
  if (detailXpFill) detailXpFill.style.width = `${Math.round(xpProgress * 100)}%`;

  // 10 Cœurs de vie (Santé max: 20) - Vraies textures Minecraft
  if (detailHeartsContainer) {
    const health = Math.max(0, Math.min(20, Math.round(data.health !== undefined ? data.health : 20)));
    let heartsHtml = '';
    for (let i = 0; i < 10; i++) {
      const heartValue = (i + 1) * 2;
      if (health >= heartValue) {
        heartsHtml += `<img class="mc-heart-img" src="/assets/minecraft/gui/heart_full.png" alt="Cœur plein" title="${health}/20 PV" />`;
      } else if (health === heartValue - 1) {
        heartsHtml += `<img class="mc-heart-img" src="/assets/minecraft/gui/heart_half.png" alt="Demi-cœur" title="${health}/20 PV" />`;
      } else {
        heartsHtml += `<img class="mc-heart-img" src="/assets/minecraft/gui/heart_empty.png" alt="Cœur vide" title="${health}/20 PV" />`;
      }
    }
    detailHeartsContainer.innerHTML = heartsHtml;
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

  // Inventaire
  renderPlayerInventory(data.inventory || [], data.worldId);

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

  const top    = coord(u + depth, v, u + width + depth, v + depth);
  const bottom = coord(u + width + depth, v, u + 2 * width + depth, v + depth);
  const right  = coord(u, v + depth, u + depth, v + depth + height);
  const front  = coord(u + depth, v + depth, u + width + depth, v + depth + height);
  const left   = coord(u + width + depth, v + depth, u + width + 2 * depth, v + height + depth);
  const back   = coord(u + width + 2 * depth, v + depth, u + 2 * width + 2 * depth, v + height + depth);

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

async function getArmorTexture(itemIdOrMaterial, layerNum, dyedColor) {
  if (!itemIdOrMaterial) return null;
  const worldIdResolved = (currentPlayerDetailData && currentPlayerDetailData.worldId) || currentPlayersWorldId || activeWorld || '';
  const worldParam = encodeURIComponent(worldIdResolved);
  const cacheKey = `${worldParam}:${itemIdOrMaterial}_l${layerNum}_${dyedColor !== null && dyedColor !== undefined ? dyedColor : 'default'}`;
  if (_armorTextureCache.has(cacheKey)) {
    return _armorTextureCache.get(cacheKey);
  }

  const p = (async () => {
    try {
      const isLeather = itemIdOrMaterial.includes('leather');
      const colorParam = (dyedColor !== null && dyedColor !== undefined) ? `&color=${encodeURIComponent(dyedColor)}` : '';
      const apiUrl = `/api/armor-texture?worldId=${worldParam}&item=${encodeURIComponent(itemIdOrMaterial)}&layer=${layerNum}${colorParam}&_t=${Date.now()}`;

      let baseImg = await loadHtmlImage(apiUrl);
      if (!baseImg) {
        // Fallback local vanilla
        const cleanMat = itemIdOrMaterial.replace(/^minecraft:/, '').split('_')[0] || 'iron';
        baseImg = await loadHtmlImage(`/assets/minecraft/armor/${cleanMat}_layer_${layerNum}.png`);
      }
      if (!baseImg) return null;

      const canvas = document.createElement('canvas');
      canvas.width = baseImg.naturalWidth || 64;
      canvas.height = baseImg.naturalHeight || 32;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
            d[i]     = Math.round(gray * cr);
            d[i + 1] = Math.round(gray * cg);
            d[i + 2] = Math.round(gray * cb);
          }
        }
        ctx.putImageData(imgData, 0, 0);

        const overlayPath = `/assets/minecraft/armor/leather_layer_${layerNum}_overlay.png`;
        const overlayImg = await loadHtmlImage(overlayPath);
        if (overlayImg) {
          ctx.drawImage(overlayImg, 0, 0);
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
  return result;
}

function createArmorMaterial(texture, isEnchanted) {
  const mat = new skinview3d.MeshStandardMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.1,
    side: 2, // DoubleSide
    roughness: 0.8,
    metalness: 0.1
  });
  if (isEnchanted) {
    mat.emissive.setHex(0x581c87); // Lueur violette d'enchantement
    mat.emissiveIntensity = 0.55;
  }
  return mat;
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

async function initOrUpdate3DPlayer(playerName, inventory, playerUuid = null) {
  if (!player3dCanvas || typeof skinview3d === 'undefined') return;

  // Récupère les slots d'armure depuis l'inventaire
  const slots = {};
  if (Array.isArray(inventory)) {
    for (const item of inventory) {
      if (item && item.slot !== undefined) {
        if (item.slot === 103) slots.helmet = item;
        if (item.slot === 102) slots.chestplate = item;
        if (item.slot === 101) slots.leggings = item;
        if (item.slot === 100) slots.boots = item;
      }
    }
  }

  // Détruit le viewer existant si le joueur change
  if (_skinViewer && _skinViewer._playerName !== playerName) {
    try { _skinViewer.dispose(); } catch(e) {}
    _skinViewer = null;
  }

  // Affiche le spinner de chargement
  if (player3dLoading) player3dLoading.classList.remove('hidden');

  try {
    if (!_skinViewer) {
      _skinViewer = new skinview3d.SkinViewer({
        canvas: player3dCanvas,
        width: 150,
        height: 210,
        renderPaused: false
      });
      _skinViewer._playerName = playerName;

      // Fond transparent
      _skinViewer.background = null;
      _skinViewer.renderer.setClearColor(0x000000, 0);

      // Caméra cadrée sur le joueur (face avant)
      _skinViewer.camera.rotation.x = 0;
      _skinViewer.camera.rotation.y = 0;
      _skinViewer.camera.rotation.z = 0;
      _skinViewer.camera.position.set(0, 0, 40);
      _skinViewer.fov = 50;

      // Animation idle Minecraft (respiration)
      _skinViewer.animation = new skinview3d.IdleAnimation();
      _skinViewer.animation.speed = 0.4;

      // Désactivation formelle du zoom et du pan (vue fixe comme dans l'inventaire)
      if (_skinViewer.controls) {
        _skinViewer.controls.enableZoom = false;
        _skinViewer.controls.enablePan = false;
      }

      // Suivi de la souris : tête et yeux suivent le curseur exactement comme l'inventaire Minecraft
      if (_mouseMoveListener) {
        document.removeEventListener('mousemove', _mouseMoveListener);
      }
      _mouseMoveListener = (e) => {
        if (!_skinViewer || !_skinViewer.playerObject || !_skinViewer.playerObject.skin) return;
        const rect = player3dCanvas.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height * 0.25; // niveau de la tête

        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;

        const yaw   = Math.atan2(dx, 130);
        const pitch = Math.atan2(dy, 130);

        const clampedYaw   = Math.max(-0.75, Math.min(0.75, yaw));
        const clampedPitch = Math.max(-0.45, Math.min(0.45, pitch));

        const head = _skinViewer.playerObject.skin.head;
        head.rotation.y = clampedYaw;
        head.rotation.x = clampedPitch;
        _skinViewer.playerObject.skin.body.rotation.y = clampedYaw * 0.3;
      };
      document.addEventListener('mousemove', _mouseMoveListener);

      // Chargement garanti du skin avec cascade de fallbacks
      await loadSkinWithFallbacks(_skinViewer, playerName, playerUuid);
    } else {
      // Si le viewer existe déjà, met à jour le skin
      await loadSkinWithFallbacks(_skinViewer, playerName, playerUuid);
    }

    // Application dynamique des pièces d'armure 3D
    await _apply3DArmor(_skinViewer, slots);

  } catch(err) {
    console.warn('3D skin error:', err);
  } finally {
    if (player3dLoading) {
      setTimeout(() => player3dLoading.classList.add('hidden'), 300);
    }
  }
}


async function _apply3DArmor(viewer, slots) {
  if (!viewer || !viewer.playerObject || !viewer.playerObject.skin) return;

  // Nettoyage complet des anciens overlays d'armure
  if (viewer._armorMeshes) {
    for (const mesh of viewer._armorMeshes) {
      if (mesh.parent) mesh.parent.remove(mesh);
      try {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
      } catch (e) {}
    }
  }
  viewer._armorMeshes = [];

  const skin = viewer.playerObject.skin;
  const BoxGeometry = skinview3d.BoxGeometry;
  const Mesh = skinview3d.Mesh;

  const addArmorMesh = (parent, geometry, material, posY = 0, posX = 0) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(posX, posY, 0);
    parent.add(mesh);
    viewer._armorMeshes.push(mesh);
    return mesh;
  };

  // 1. Casque / Helmet (Slot 103)
  if (slots.helmet && slots.helmet.id) {
    const tex = await getArmorTexture(slots.helmet.id, 1, slots.helmet.dyedColor);
    if (tex && skin.head) {
      const mat = createArmorMaterial(tex, slots.helmet.isEnchanted);
      const tw = tex.texWidth || 64;
      const th = tex.texHeight || 32;
      const geo = new BoxGeometry(9.2, 9.2, 9.2);

      if (tw === 128 && th === 128) {
        setBoxUV(geo, 0, 0, 8, 8, 8, 128, 128);
      } else {
        const s = (tw / th === 2) ? (tw / 64) : 1;
        setBoxUV(geo, 0, 0, 8 * s, 8 * s, 8 * s, tw, th);
      }
      addArmorMesh(skin.head, geo, mat, 4, 0);
    }
  }

  // 2. Plastron / Chestplate (Slot 102)
  if (slots.chestplate && slots.chestplate.id) {
    const tex = await getArmorTexture(slots.chestplate.id, 1, slots.chestplate.dyedColor);
    if (tex) {
      const mat = createArmorMaterial(tex, slots.chestplate.isEnchanted);
      const tw = tex.texWidth || 64;
      const th = tex.texHeight || 32;

      if (tw === 128 && th === 128) {
        // Modèle MCreator ou entité 128x128 (ex: born_in_chaos nightrobebreastplate)
        if (skin.body) {
          const bodyGeo = new BoxGeometry(9.2, 12.4, 5.2);
          setBoxUV(bodyGeo, 29, 0, 8, 14, 4, 128, 128);
          addArmorMesh(skin.body, bodyGeo, mat, 0, 0);

          // Surcouche manteau / robe
          const robeGeo = new BoxGeometry(9.6, 12.8, 5.6);
          setBoxUV(robeGeo, 26, 26, 8, 14, 4, 128, 128);
          addArmorMesh(skin.body, robeGeo, mat, 0, 0);
        }

        if (skin.rightArm && skin.rightArm.children[0]) {
          const rArmGeo = new BoxGeometry(4.8, 12.4, 4.8);
          setBoxUV(rArmGeo, 91, 0, 4, 12, 4, 128, 128, false);
          addArmorMesh(skin.rightArm.children[0], rArmGeo, mat, 0, 0);

          const rShoulder = new BoxGeometry(5.2, 5.2, 5.2);
          setBoxUV(rShoulder, 90, 28, 4, 4, 4, 128, 128, false);
          addArmorMesh(skin.rightArm.children[0], rShoulder, mat, 4, 0);
        }

        if (skin.leftArm && skin.leftArm.children[0]) {
          const lArmGeo = new BoxGeometry(4.8, 12.4, 4.8);
          setBoxUV(lArmGeo, 91, 0, 4, 12, 4, 128, 128, true);
          addArmorMesh(skin.leftArm.children[0], lArmGeo, mat, 0, 0);

          const lShoulder = new BoxGeometry(5.2, 5.2, 5.2);
          setBoxUV(lShoulder, 90, 28, 4, 4, 4, 128, 128, true);
          addArmorMesh(skin.leftArm.children[0], lShoulder, mat, 4, 0);
        }
      } else {
        // Modèle standard Minecraft Vanilla et mods (ratio 2:1 ex: 64x32 ou 128x64)
        const s = (tw / th === 2) ? (tw / 64) : 1;
        if (skin.body) {
          const bodyGeo = new BoxGeometry(9.2, 12.4, 5.2);
          setBoxUV(bodyGeo, 16 * s, 16 * s, 8 * s, 12 * s, 4 * s, tw, th);
          addArmorMesh(skin.body, bodyGeo, mat, 0, 0);
        }

        if (skin.rightArm && skin.rightArm.children[0]) {
          const rArmGeo = new BoxGeometry(4.8, 12.4, 4.8);
          setBoxUV(rArmGeo, 40 * s, 16 * s, 4 * s, 12 * s, 4 * s, tw, th, false);
          addArmorMesh(skin.rightArm.children[0], rArmGeo, mat, 0, 0);
        }

        if (skin.leftArm && skin.leftArm.children[0]) {
          const lArmGeo = new BoxGeometry(4.8, 12.4, 4.8);
          setBoxUV(lArmGeo, 40 * s, 16 * s, 4 * s, 12 * s, 4 * s, tw, th, true);
          addArmorMesh(skin.leftArm.children[0], lArmGeo, mat, 0, 0);
        }
      }
    }
  }

  // 3. Jambières / Leggings (Slot 101)
  if (slots.leggings && slots.leggings.id) {
    const tex = await getArmorTexture(slots.leggings.id, 2, slots.leggings.dyedColor);
    if (tex) {
      const mat = createArmorMaterial(tex, slots.leggings.isEnchanted);
      const tw = tex.texWidth || 64;
      const th = tex.texHeight || 32;
      const s = (tw / th === 2) ? (tw / 64) : 1;

      // Ceinture / Hanches sur le corps
      if (skin.body) {
        const beltGeo = new BoxGeometry(8.8, 12.2, 4.8);
        setBoxUV(beltGeo, 16 * s, 16 * s, 8 * s, 12 * s, 4 * s, tw, th);
        addArmorMesh(skin.body, beltGeo, mat, 0, 0);
      }

      // Cuisse / Jambe droite
      if (skin.rightLeg && skin.rightLeg.children[0]) {
        const rLegGeo = new BoxGeometry(4.4, 12.2, 4.4);
        setBoxUV(rLegGeo, 0, 16 * s, 4 * s, 12 * s, 4 * s, tw, th, false);
        addArmorMesh(skin.rightLeg.children[0], rLegGeo, mat, 0, 0);
      }

      // Cuisse / Jambe gauche (effet miroir)
      if (skin.leftLeg && skin.leftLeg.children[0]) {
        const lLegGeo = new BoxGeometry(4.4, 12.2, 4.4);
        setBoxUV(lLegGeo, 0, 16 * s, 4 * s, 12 * s, 4 * s, tw, th, true);
        addArmorMesh(skin.leftLeg.children[0], lLegGeo, mat, 0, 0);
      }
    }
  }

  // 4. Bottes / Boots (Slot 100)
  if (slots.boots && slots.boots.id) {
    const tex = await getArmorTexture(slots.boots.id, 1, slots.boots.dyedColor);
    if (tex) {
      const mat = createArmorMaterial(tex, slots.boots.isEnchanted);
      const tw = tex.texWidth || 64;
      const th = tex.texHeight || 32;
      const s = (tw / th === 2) ? (tw / 64) : 1;

      // Botte droite
      if (skin.rightLeg && skin.rightLeg.children[0]) {
        const rBootGeo = new BoxGeometry(4.8, 12.4, 4.8);
        setBoxUV(rBootGeo, 0, 16 * s, 4 * s, 12 * s, 4 * s, tw, th, false);
        addArmorMesh(skin.rightLeg.children[0], rBootGeo, mat, 0, 0);
      }

      // Botte gauche (effet miroir)
      if (skin.leftLeg && skin.leftLeg.children[0]) {
        const lBootGeo = new BoxGeometry(4.8, 12.4, 4.8);
        setBoxUV(lBootGeo, 0, 16 * s, 4 * s, 12 * s, 4 * s, tw, th, true);
        addArmorMesh(skin.leftLeg.children[0], lBootGeo, mat, 0, 0);
      }
    }
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
      html += `<div class="mct-enchant-item"><span class="mct-enchant-bullet">✦</span> ${escapeHtml(ench.name)} ${escapeHtml(ench.romanLevel)}</div>`;
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

// Fonction de rendu des slots d'inventaire avec vraies textures Minecraft
function renderPlayerInventory(items, targetWorldId = null) {
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

    // Toutes les textures (mods et vanilla) passent par l'API locale avec cache mémoire & disque ultra-rapide
    const itemUrl = `/api/item-texture?worldId=${worldParam}&item=${encodeURIComponent(rawId)}${colorParam}&v=3`;
    const fallbackSvg = `/assets/minecraft/gui/unknown.svg`;

    const isEnch = !!it.isEnchanted;
    const enchantClass = isEnch ? ' enchanted' : '';
    const enchantSparkle = isEnch ? `<span class="enchant-sparkle">✦</span>` : '';

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

  // Barre d'accès rapide (Slots 0 à 8 -> 9 cases)
  if (hotbarGrid) {
    let hotbarHtml = '';
    for (let s = 0; s <= 8; s++) {
      const it = itemsBySlot[s];
      const enchantClass = (it && it.isEnchanted) ? ' has-enchanted' : '';
      hotbarHtml += `<div class="mc-slot${enchantClass}" data-slot="${s}">${renderSlotContent(s)}</div>`;
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

// Fonction centrale pour exécuter une action de gestion de joueur
async function executePlayerManagementAction(action, value = null) {
  if (!currentPlayersWorldId || !currentPlayerDetailName) {
    showToast('Aucun joueur sélectionné.', 'error');
    return;
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

    // Rafraîchir les données du joueur et de la liste globale
    await openPlayerDetail(currentPlayerDetailName);
    await refreshPlayersData();
  } catch (err) {
    console.error('Erreur action joueur:', err);
    showToast(err.message, 'error');
  }
}

// Câblage des boutons Soigner, Nourrir, Tuer, Affamer
if (btnDetailHeal) {
  btnDetailHeal.addEventListener('click', () => executePlayerManagementAction('heal'));
}

if (btnDetailFeed) {
  btnDetailFeed.addEventListener('click', () => executePlayerManagementAction('feed'));
}

if (btnDetailKill) {
  btnDetailKill.addEventListener('click', () => executePlayerManagementAction('damage'));
}

if (btnDetailStarve) {
  btnDetailStarve.addEventListener('click', () => executePlayerManagementAction('starve'));
}

// Câblage des boutons d'XP (-10, -5, -1, +1, +5, +10)
document.querySelectorAll('.btn-xp-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const amount = parseInt(btn.dataset.xp, 10);
    if (!isNaN(amount) && amount !== 0) {
      executePlayerManagementAction('xp', amount);
    }
  });
});

// Câblage du Mode de Jeu (select change - mise à jour instantanée et optimiste)
if (detailGameModeSelect) {
  detailGameModeSelect.addEventListener('change', async () => {
    const selectedMode = detailGameModeSelect.value;
    const targetPlayer = currentPlayerDetailName;
    if (!targetPlayer) return;

    const previousMode = currentPlayerDetailData?.gameMode || 'survival';
    optimisticPlayerGameModes[targetPlayer.toLowerCase()] = selectedMode;
    if (currentPlayerDetailData) {
      currentPlayerDetailData.gameMode = selectedMode;
    }

    try {
      await executePlayerManagementAction('gamemode', selectedMode);
    } catch (err) {
      delete optimisticPlayerGameModes[targetPlayer.toLowerCase()];
      if (currentPlayerDetailData) {
        currentPlayerDetailData.gameMode = previousMode;
      }
      detailGameModeSelect.value = previousMode;
    }
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
    btnDetailDeleteData.textContent = '⚠️ Confirmer suppression ?';
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
  try { document.execCommand('copy'); } catch (e) {}
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
  .catch(() => {});

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
          ⚠️ <strong>Confirmation requise</strong> : Tous les blocs, bâtiments et structures de <em>${escapeHtml(d.name)}</em> seront définitivement supprimés et régénérés à neuf lors du prochain lancement.
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
      statusBox.innerHTML = `<span>❌ Erreur : ${escapeHtml(err.message)}</span>`;
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
    showToast('Arrête d\'abord le serveur pour gérer ou modifier ce monde.', 'warning');
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
          exportStatusBox.innerHTML = `<span>❌ Erreur : ${escapeHtml(err.message)}</span>`;
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
  }).catch(() => {});

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
  if (serverStatus !== 'STOPPED' && activeWorld === worldId) {
    showToast('Arrête d\'abord le serveur pour pouvoir supprimer ce monde.', 'error');
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
      fetchWorlds();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

btnRefreshWorlds.addEventListener('click', fetchWorlds);

// Exposer globalement pour les événements onclick HTML
window.openEditProps = openEditProps;
window.openRenameWorld = openRenameWorld;
window.openDeleteWorld = openDeleteWorld;
window.startWorld = startWorld;
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
}

function getSettingsFromInputs() {
  return {
    downloadPath: settingsDownloadPath ? settingsDownloadPath.value.trim() : '',
    defaultViewDistance: settingsViewDistance ? parseInt(settingsViewDistance.value, 10) : 12,
    defaultSimulationDistance: settingsSimulationDistance ? parseInt(settingsSimulationDistance.value, 10) : 4,
    defaultGamemode: settingsDefaultGamemode ? settingsDefaultGamemode.value : 'survival',
    defaultDifficulty: settingsDefaultDifficulty ? settingsDefaultDifficulty.value : 'normal'
  };
}

async function openAppSettingsModal() {
  if (!appSettingsModal) return;
  appSettingsModal.style.display = 'flex';

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
  } catch (err) {
    console.warn('Erreur chargement paramètres:', err);
  }
}

// Annuler : restaure l'ancien état et ferme sans enregistrer
function cancelAppSettingsModal() {
  if (initialSettingsState) {
    applySettingsState(initialSettingsState);
  }
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

// Callback appelé par le bridge natif Cocoa (main.swift)
window.onFolderChosen = function(folderPath) {
  if (folderPath && settingsDownloadPath) {
    settingsDownloadPath.value = folderPath;
    showToast('Dossier sélectionné : ' + folderPath, 'info');
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

  // 2. Fallback via route serveur
  try {
    const res = await fetch('/api/settings/choose-folder', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (data.folder && settingsDownloadPath) {
        settingsDownloadPath.value = data.folder;
        showToast('Dossier sélectionné : ' + data.folder, 'info');
      }
    }
  } catch (err) {
    console.warn('Erreur sélection dossier:', err);
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

// Touche Échap pour fermer les paramètres (avec auto-save)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && appSettingsModal && appSettingsModal.style.display !== 'none') {
    closeAppSettingsModal();
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
            navigator.clipboard.writeText(sel).catch(() => {});
          } else {
            try { document.execCommand('copy'); } catch (_) {}
          }
        }
      }
    }
  }
});

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
  } catch (_) {}

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
    const items = ['<li>Application Minecraft Server Manager & raccourcis Bureau</li>'];
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
    } catch (_) {}
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
        <strong>✔ Sauvegarde réussie !</strong><br>
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
  } catch (e) {}

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
      } catch (e) {}
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
  } catch (e) {}
}

async function closeWelcomeModal() {
  isWelcomeDismissed = true;
  const modal = document.getElementById('welcomeModal');
  if (modal) {
    modal.style.display = 'none';
  }
  try {
    localStorage.setItem(WELCOME_MODAL_SEEN_KEY, 'true');
  } catch (e) {}
  try {
    await fetch('/api/app/welcome-dismiss', { method: 'POST' });
  } catch (e) {}
}
window.closeWelcomeModal = closeWelcomeModal;

function goToWelcomePage(pageNumber) {
  const p1 = document.getElementById('welcomePage1');
  const p2 = document.getElementById('welcomePage2');
  const stepBadge = document.getElementById('welcomeStepBadge');
  const headerTitle = document.getElementById('welcomeHeaderTitle');

  if (pageNumber === 2) {
    if (p1) p1.style.display = 'none';
    if (p2) p2.style.display = 'block';
    if (stepBadge) stepBadge.textContent = '2 / 2';
    if (headerTitle) headerTitle.textContent = 'Minecraft Server Manager';
    runSystemBenchmark();
  } else {
    if (p2) p2.style.display = 'none';
    if (p1) p1.style.display = 'block';
    if (stepBadge) stepBadge.textContent = '1 / 2';
    if (headerTitle) headerTitle.textContent = 'Minecraft Server Manager';
  }
}
window.goToWelcomePage = goToWelcomePage;

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

    const ramVal = document.getElementById('diagRamVal');
    const ramDetail = document.getElementById('diagRamDetail');
    if (ramVal) ramVal.textContent = `${data.totalRamGb} Go`;
    if (ramDetail) ramDetail.textContent = `${data.freeRamGb} Go disponibles`;

    const cpuVal = document.getElementById('diagCpuVal');
    const cpuDetail = document.getElementById('diagCpuDetail');
    if (cpuVal) cpuVal.textContent = `${data.cpuCores} Cœurs`;
    if (cpuDetail) cpuDetail.textContent = (data.cpuModel || '').replace(/\(R\)|\(TM\)/gi, '').trim();

    const netVal = document.getElementById('diagNetVal');
    const netDetail = document.getElementById('diagNetDetail');
    if (data.network) {
      if (netVal) netVal.textContent = data.network.quality;
      if (netDetail) netDetail.textContent = data.network.detail;
    }

    const osVal = document.getElementById('diagOsVal');
    const osDetail = document.getElementById('diagOsDetail');
    if (osVal) osVal.textContent = data.platform;
    if (osDetail) osDetail.textContent = data.arch;

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
      loader.innerHTML = `<span style="color: #ef4444;">⚠️ Échec du diagnostic (${escapeHtml(err.message)})</span>`;
    }
  }
}
window.runSystemBenchmark = runSystemBenchmark;

function openAuthorPortfolio() {
  const url = 'https://gjagueneau.eu';
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.openExternalUrl) {
    window.webkit.messageHandlers.openExternalUrl.postMessage(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
window.openAuthorPortfolio = openAuthorPortfolio;

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
  } catch (e) {}

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
    fetchWorlds().catch(() => {}),
    fetchStatus().catch(() => {}),
    fetchVanillaVersions().catch(() => {}),
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
    } catch (e) {}
    checkWelcomeModal();
  }

  // Polling dynamique de statut global (toutes les 1.2s en renfort continu de SSE)
  setInterval(async () => {
    if (document.hidden) return;
    try {
      await fetchStatus();
    } catch (e) {}
  }, 1200);

  // Polling périodique de fond des mondes (toutes les 3.5s)
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const createModal = document.getElementById('createModal');
      if (!createModal || createModal.style.display === 'none') {
        await fetchWorlds();
      }
    } catch (e) {}
  }, 3500);

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
  } catch (_) {}
  return false;
}

function showUpdateSummaryModal(summary) {
  const modal = document.getElementById('updateSummaryModal');
  if (!modal) return;
  const versionBadge = document.getElementById('updateSummaryVersionBadge');
  if (versionBadge) versionBadge.textContent = `Version v${summary.version}`;
  const notesEl = document.getElementById('updateSummaryNotesContent');
  if (notesEl) {
    notesEl.textContent = summary.releaseNotes || summary.releaseName || 'Mise à jour installée avec succès.';
  }
  modal.style.display = 'flex';
}

function closeUpdateSummaryModal() {
  const modal = document.getElementById('updateSummaryModal');
  if (modal) modal.style.display = 'none';
}

let updateOfferPostponedThisSession = false;

async function checkForAppUpdates(silent = true) {
  const summaryModal = document.getElementById('updateSummaryModal');
  if (summaryModal && summaryModal.style.display === 'flex') {
    return;
  }
  const currentOfferModal = document.getElementById('updateOfferModal');
  if (currentOfferModal && currentOfferModal.style.display === 'flex') {
    return;
  }

  // Si l'utilisateur a choisi "Plus tard" durant cette session, ne pas ré-afficher en arrière-plan
  if (silent && updateOfferPostponedThisSession) {
    return;
  }

  try {
    const res = await fetch('/api/app/check-update');
    const data = await res.json();
    if (data && data.updateAvailable) {
      pendingUpdateData = data;
      showUpdateOfferModal(data);
    } else if (!silent) {
      showToast(`Votre application est à jour (v${data?.currentVersion || '1.0.5'}).`, 'success');
    }
  } catch (e) {
    console.warn('[Update] Erreur de vérification:', e);
    if (!silent) showToast("Impossible de vérifier les mises à jour.", 'warning');
  }
}

function showUpdateOfferModal(updateData) {
  const modal = document.getElementById('updateOfferModal');
  if (!modal) return;

  const versionBadge = document.getElementById('updateOfferVersionBadge');
  if (versionBadge) versionBadge.textContent = `Version v${updateData.latestVersion}`;

  const desc = document.getElementById('updateOfferDescription');
  if (desc) {
    desc.textContent = updateData.releaseName && updateData.releaseName !== `Version ${updateData.latestVersion}`
      ? updateData.releaseName
      : `Une nouvelle version v${updateData.latestVersion} de Minecraft Server Manager est disponible.`;
  }

  const notesBox = document.getElementById('updateOfferNotesBox');
  const notesEl = document.getElementById('updateOfferNotesContent');
  if (notesEl) {
    if (updateData.releaseNotes && updateData.releaseNotes.trim().length > 0) {
      notesEl.textContent = updateData.releaseNotes.trim();
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
  if (closeBtn) closeBtn.style.display = 'none';

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
      throw new Error(data.error || "Erreur lors de l'application de la mise à jour.");
    }

    if (title) title.textContent = "Mise à jour installée avec succès !";
    if (sub) sub.textContent = "Rechargement automatique de l'application...";

    setTimeout(() => {
      window.location.reload();
    }, 2200);
  } catch (err) {
    if (title) title.textContent = "Échec de la mise à jour";
    if (sub) sub.textContent = err.message || "Une erreur est survenue.";
    if (footer) footer.style.display = 'flex';
    if (closeBtn) closeBtn.style.display = 'block';
    const acceptBtn = document.getElementById('btnAcceptUpdate');
    if (acceptBtn) {
      acceptBtn.textContent = "Réessayer";
      acceptBtn.onclick = () => {
        if (normalView) normalView.style.display = 'block';
        if (progressView) progressView.style.display = 'none';
        acceptBtn.textContent = "Mettre à jour";
        acceptBtn.onclick = startInAppUpdate;
      };
    }
  }
}


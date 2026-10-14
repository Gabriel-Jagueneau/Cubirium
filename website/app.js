/**
 * Cubirium Website · Logiciel & Changelog dynamique
 * Récupération temps réel des releases GitHub en direct
 */

document.addEventListener("DOMContentLoaded", () => {
  initCleanScrollNavigation();
  initOsDetection();
  initCopyAddress();
  fetchReleases();
});

let currentScrollAnimation = null;

/**
 * Défilement fluide ultra-réactif sans aucun délai d'attente au clic
 */
function smoothScrollTo(targetY) {
  if (currentScrollAnimation) {
    cancelAnimationFrame(currentScrollAnimation);
    currentScrollAnimation = null;
  }

  const startY = window.scrollY || window.pageYOffset || 0;
  const distance = targetY - startY;

  if (Math.abs(distance) < 2) {
    window.scrollTo(0, targetY);
    return;
  }

  // Durée réactive et équilibrée selon la distance (entre 280ms et 500ms max)
  const duration = Math.min(500, Math.max(280, Math.abs(distance) * 0.12));
  const startTime = performance.now();

  // Easing easeOutCubic : départ immédiat à pleine vitesse (réaction instantanée) puis décélération soyeuse
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const stopOnInteraction = () => {
    if (currentScrollAnimation) {
      cancelAnimationFrame(currentScrollAnimation);
      currentScrollAnimation = null;
    }
    window.removeEventListener("wheel", stopOnInteraction);
    window.removeEventListener("touchstart", stopOnInteraction);
  };

  window.addEventListener("wheel", stopOnInteraction, { passive: true, once: true });
  window.addEventListener("touchstart", stopOnInteraction, { passive: true, once: true });

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = easeOutCubic(progress);

    window.scrollTo(0, startY + distance * ease);

    if (progress < 1) {
      currentScrollAnimation = requestAnimationFrame(step);
    } else {
      currentScrollAnimation = null;
      window.scrollTo(0, targetY);
      window.removeEventListener("wheel", stopOnInteraction);
      window.removeEventListener("touchstart", stopOnInteraction);
    }
  }

  currentScrollAnimation = requestAnimationFrame(step);
}

/**
 * Navigation fluide sans aucun '#' dans la barre d'adresse
 */
function initCleanScrollNavigation() {
  // Supprimer tout hash résiduel dès le chargement
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  window.addEventListener("hashchange", (e) => {
    e.preventDefault();
    history.replaceState(null, "", window.location.pathname + window.location.search);
  });

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      e.preventDefault();
      const href = anchor.getAttribute("href");
      if (!href || href === "#") {
        smoothScrollTo(0);
        return;
      }

      const targetId = href.replace(/^#/, "");
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        const nav = document.querySelector(".navbar");
        const navHeight = nav ? nav.offsetHeight : 64;
        const currentY = window.scrollY || window.pageYOffset || 0;
        const targetPos = Math.max(0, targetEl.getBoundingClientRect().top + currentY - navHeight - 16);
        smoothScrollTo(targetPos);
      }
    });
  });
}

/**
 * Détection intelligente de l'OS pour mettre en avant le bon installeur
 */
function initOsDetection() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const isWindows = /Win/i.test(platform) || /Windows/i.test(ua);
  const isMac = /Mac/i.test(platform) || /Macintosh/i.test(ua);

  const btnMac = document.getElementById("btn-download-mac");
  const btnWin = document.getElementById("btn-download-win");
  const group = document.getElementById("download-buttons-group");

  if (!btnMac || !btnWin || !group) return;

  if (isWindows) {
    // Inverser l'ordre et le style pour privilégier Windows
    btnWin.className = "download-btn download-btn--primary";
    btnMac.className = "download-btn download-btn--secondary";
    group.insertBefore(btnWin, btnMac);
  } else if (isMac) {
    btnMac.className = "download-btn download-btn--primary";
    btnWin.className = "download-btn download-btn--secondary";
  }

  // Synchroniser l'URL de téléchargement direct du header selon l'OS
  const headerBtn = document.getElementById("header-download-btn");
  if (headerBtn) {
    headerBtn.href = isWindows
      ? "https://github.com/Gabriel-Jagueneau/Cubirium/releases/latest/download/win-Cubirium.exe"
      : "https://github.com/Gabriel-Jagueneau/Cubirium/releases/latest/download/mac-Cubirium.pkg";
  }
}

/**
 * Bouton interactif pour copier l'adresse de connexion du serveur dans la démo
 */
function initCopyAddress() {
  const copyBtn = document.getElementById("btnCopyTunnel") || document.getElementById("btn-copy-address");
  const addressEl = document.getElementById("tunnelShareIp") || document.getElementById("sample-address");

  if (!copyBtn || !addressEl) return;

  const handleCopy = async (e) => {
    if (e) e.stopPropagation();
    const textToCopy = addressEl.textContent.trim();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      copyBtn.classList.add("copied");
      const prevText = copyBtn.textContent;
      copyBtn.textContent = "Copié !";
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyBtn.textContent = prevText;
      }, 2000);
    } catch (err) {
      console.warn("Échec de la copie :", err);
    }
  };

  copyBtn.addEventListener("click", handleCopy);
  const pill = document.getElementById("tunnelSharePill");
  if (pill) {
    pill.addEventListener("click", handleCopy);
  }
}



/**
 * Récupération dynamique des releases depuis l'API GitHub
 */
async function fetchReleases() {
  const container = document.getElementById("changelog-container");
  if (!container) return;

  container.innerHTML = `
    <div class="changelog-loading">
      <div class="spinner"></div>
      <span>Chargement des versions depuis GitHub...</span>
    </div>
  `;

  const apiUrl = "https://api.github.com/repos/Gabriel-Jagueneau/Cubirium/releases";

  try {
    const res = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github.v3+json"
      }
    });

    if (res.status === 403 || res.status === 429) {
      renderError(
        container,
        "La limite de requêtes publiques de l'API GitHub a été atteinte (Rate Limit). Veuillez réessayer dans quelques minutes ou consulter les versions directement sur GitHub.",
        true
      );
      return;
    }

    if (!res.ok) {
      renderError(
        container,
        `Impossible de charger les versions depuis GitHub (Code HTTP ${res.status}).`,
        false
      );
      return;
    }

    const releases = await res.json();
    if (!Array.isArray(releases) || releases.length === 0) {
      renderError(
        container,
        "Aucune version n'est actuellement publiée sur le dépôt GitHub.",
        false
      );
      return;
    }

    updateHeaderVersions(releases[0]);
    renderReleases(releases, container);
  } catch (err) {
    console.warn("Erreur réseau GitHub API :", err);
    renderError(
      container,
      "Erreur de connexion aux serveurs GitHub. Impossible de charger l'historique des versions.",
      false
    );
  }
}

/**
 * Affiche un message d'erreur sobre et clair si GitHub est inaccessible ou rate-limité
 */
function renderError(container, message, isRateLimit = false) {
  if (!container) return;

  const title = isRateLimit
    ? "Limite de requêtes atteinte (Rate Limit)"
    : "Chargement impossible";

  container.innerHTML = `
    <div class="changelog-error">
      <div class="changelog-error__icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h3 class="changelog-error__title">${escapeHtml(title)}</h3>
      <p class="changelog-error__text">${escapeHtml(message)}</p>
      <div class="changelog-error__actions">
        <a href="https://github.com/Gabriel-Jagueneau/Cubirium/releases" target="_blank" rel="noopener noreferrer" class="btn btn--secondary btn--compact">
          <span>Ouvrir GitHub Releases</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
        <button type="button" class="btn btn--primary btn--compact" id="btn-retry-releases">
          <span>Réessayer</span>
        </button>
      </div>
    </div>
  `;

  const retryBtn = document.getElementById("btn-retry-releases");
  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      fetchReleases();
    });
  }
}

/**
 * Met à jour les libellés de version dans le Hero et la barre de navigation
 */
function updateHeaderVersions(latestRelease) {
  if (!latestRelease) return;
  const version = latestRelease.tag_name || "v1.1.1";

  const navBadge = document.getElementById("nav-version-badge");
  const heroBadge = document.getElementById("hero-badge-text");
  const heroVersion = document.getElementById("hero-version-text");

  if (navBadge) navBadge.textContent = version;
  if (heroBadge) heroBadge.textContent = `Dernière version ${version} disponible`;
  if (heroVersion) heroVersion.textContent = version;

  // Mise à jour éventuelle des liens de téléchargement hero et header
  const btnMac = document.getElementById("btn-download-mac");
  const btnWin = document.getElementById("btn-download-win");
  const headerBtn = document.getElementById("header-download-btn");

  if (latestRelease.assets && latestRelease.assets.length > 0) {
    const macAsset = latestRelease.assets.find(a => a.name.endsWith(".pkg") || a.name.includes("mac"));
    const winAsset = latestRelease.assets.find(a => a.name.endsWith(".exe") || a.name.includes("win"));

    window.latestReleaseAssets = { mac: macAsset, win: winAsset };

    if (macAsset && btnMac) btnMac.href = macAsset.browser_download_url;
    if (winAsset && btnWin) btnWin.href = winAsset.browser_download_url;

    if (headerBtn) {
      const isWindows = /Win/i.test(navigator.platform || navigator.userAgent || "");
      if (isWindows && winAsset) headerBtn.href = winAsset.browser_download_url;
      if (!isWindows && macAsset) headerBtn.href = macAsset.browser_download_url;
    }
  }
}

/**
 * Crée le bloc DOM d'une carte de version
 */
function createReleaseCard(rel, isLatest) {
  const card = document.createElement("article");
  card.className = `release-card ${isLatest ? "release-card--latest" : ""}`;

  const dateStr = formatDate(rel.published_at);
  const tagName = rel.tag_name || "Version";

  // Parsing du corps du changelog
  const formattedBody = formatMarkdownBody(rel.body || "Aucune note de version spécifiée.");

  // Assets et téléchargements
  const downloadsHtml = renderReleaseDownloads(rel);

  card.innerHTML = `
    <div class="release-card__header">
      <div class="release-card__tag-group">
        <span class="release-tag">${escapeHtml(tagName)}</span>
        ${isLatest ? '<span class="release-badge-latest">Dernière version</span>' : ""}
      </div>
      <time class="release-date" datetime="${rel.published_at}">${dateStr}</time>
    </div>

    <div class="release-card__body">
      ${formattedBody}
    </div>

    <div class="release-card__downloads">
      ${downloadsHtml}
    </div>
  `;

  return card;
}

/**
 * Génère le HTML pour chaque version en masquant les anciennes versions
 */
function renderReleases(releases, container) {
  if (!container) return;

  container.innerHTML = "";

  if (releases.length === 0) return;

  // Affichage immédiat de la toute dernière version
  const latestCard = createReleaseCard(releases[0], true);
  container.appendChild(latestCard);

  // S'il n'y a pas d'anciennes versions, pas besoin de bouton
  if (releases.length <= 1) return;

  // Conteneur des anciennes versions (cachées par défaut)
  const olderContainer = document.createElement("div");
  olderContainer.className = "changelog-older-versions";
  olderContainer.id = "changelog-older-versions";
  olderContainer.hidden = true;

  for (let i = 1; i < releases.length; i++) {
    const card = createReleaseCard(releases[i], false);
    olderContainer.appendChild(card);
  }

  container.appendChild(olderContainer);

  // Bouton pour afficher / masquer toutes les versions
  const toggleWrap = document.createElement("div");
  toggleWrap.className = "changelog-toggle-wrap";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "btn btn--secondary btn--toggle-versions";
  toggleBtn.id = "btn-toggle-versions";
  toggleBtn.innerHTML = `
    <span class="btn-toggle-text">Montrer toutes les versions</span>
    <svg class="icon-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;

  let isExpanded = false;

  const toggleOlderVersions = (forceExpand = null) => {
    isExpanded = forceExpand !== null ? forceExpand : !isExpanded;
    olderContainer.hidden = !isExpanded;
    toggleBtn.classList.toggle("is-expanded", isExpanded);
    const textSpan = toggleBtn.querySelector(".btn-toggle-text");
    if (textSpan) {
      textSpan.textContent = isExpanded ? "Masquer les anciennes versions" : "Montrer toutes les versions";
    }
  };

  toggleBtn.addEventListener("click", () => {
    if (isExpanded) {
      // Si on replie et que l'utilisateur est descendu dans les versions, remonter doucement
      const changelogSection = document.getElementById("changelog");
      if (changelogSection) {
        const nav = document.querySelector(".navbar");
        const navHeight = nav ? nav.offsetHeight : 64;
        const currentY = window.scrollY || window.pageYOffset || 0;
        const targetPos = Math.max(0, changelogSection.getBoundingClientRect().top + currentY - navHeight - 16);
        if (currentY > targetPos + 200) {
          smoothScrollTo(targetPos);
        }
      }
    }
    toggleOlderVersions();
  });

  toggleWrap.appendChild(toggleBtn);
  container.appendChild(toggleWrap);

  // Clic sur le raccourci du footer "Toutes les versions" : déroule automatiquement
  document.querySelectorAll('a[href="#changelog"]').forEach((link) => {
    link.addEventListener("click", () => {
      if (!isExpanded) {
        toggleOlderVersions(true);
      }
    });
  });
}

/**
 * Génère les boutons de téléchargement d'une version donnée
 */
function renderReleaseDownloads(rel) {
  const assets = rel.assets || [];
  let html = "";

  const macAsset = assets.find(a => a.name.endsWith(".pkg") || a.name.includes("mac"));
  const winAsset = assets.find(a => a.name.endsWith(".exe") || a.name.includes("win"));

  if (macAsset) {
    html += `
      <a href="${macAsset.browser_download_url}" class="release-download-link" title="Télécharger pour macOS">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
          <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
        <span>macOS (${formatBytes(macAsset.size)})</span>
      </a>
    `;
  }

  if (winAsset) {
    html += `
      <a href="${winAsset.browser_download_url}" class="release-download-link" title="Télécharger pour Windows">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
          <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
        <span>Windows (${formatBytes(winAsset.size)})</span>
      </a>
    `;
  }

  // Code source
  const zipUrl = rel.zipball_url || `https://github.com/Gabriel-Jagueneau/Cubirium/archive/refs/tags/${rel.tag_name}.zip`;
  html += `
    <a href="${zipUrl}" class="release-download-link" title="Code source ZIP">
      <svg viewBox="0 0 20 20" width="15" height="15" fill="currentColor">
        <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/>
      </svg>
      <span>Code source (.zip)</span>
    </a>
  `;

  // Lien vers la page GitHub
  if (rel.html_url) {
    html += `
      <a href="${rel.html_url}" target="_blank" rel="noopener noreferrer" class="release-download-link" title="Voir sur GitHub">
        <span>Voir sur GitHub →</span>
      </a>
    `;
  }

  return html;
}

/**
 * Formatage Markdown simple en HTML pour le corps de la release
 */
function formatMarkdownBody(text) {
  if (!text || typeof text !== "string") return "";
  const lines = text.split(/\r?\n/);
  let html = "";
  let inList = false;

  const flushList = () => {
    if (inList === "ul") {
      html += "</ul>";
      inList = false;
    } else if (inList === "ol") {
      html += "</ol>";
      inList = false;
    }
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
      html += `<h${level}>${formatInline(headerMatch[2])}</h${level}>`;
      continue;
    }

    // Puces ordonnées (1. , 2. )
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      if (inList !== "ol") {
        flushList();
        html += "<ol>";
        inList = "ol";
      }
      html += `<li>${formatInline(numMatch[2])}</li>`;
      continue;
    }

    // Puces non-ordonnées (-, *, •)
    const listMatch = trimmed.match(/^[-*•]\s*(.*)$/);
    if (listMatch) {
      if (inList !== "ul") {
        flushList();
        html += "<ul>";
        inList = "ul";
      }
      html += `<li>${formatInline(listMatch[1])}</li>`;
      continue;
    }

    flushList();
    html += `<p style="margin-bottom: 8px;">${formatInline(trimmed)}</p>`;
  }

  flushList();
  return html;
}

function formatInline(str) {
  let out = escapeHtml(str);
  // Liens [texte](url)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // `code`
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  // **gras**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // *italique*
  out = out.replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, "$1<em>$2</em>$3");
  return out;
}

function formatDate(isoString) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  } catch {
    return isoString;
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "Direct";
  const k = 1024;
  const sizes = ["o", "Ko", "Mo", "Go"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

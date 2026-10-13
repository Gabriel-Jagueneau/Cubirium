/**
 * Cubirium Website · Logiciel & Changelog dynamique
 * Récupération temps réel des releases GitHub avec fallback local robuste
 */

// Données de secours locales complètes (garantit 0 échec même en cas de rate-limit API GitHub)
const FALLBACK_RELEASES = [
  {
    tag_name: "v1.1.0",
    name: "Cubirium v1.1.0",
    published_at: "2026-10-13T09:17:13Z",
    html_url: "https://github.com/Gabriel-Jagueneau/Cubirium/releases/tag/v1.1.0",
    body: `Rebranding complet du projet en Cubirium.
- Correction du bouton et du libellé de l'Explorateur sous Windows
- Ouverture de tous les liens web externes dans le navigateur par défaut
- Calcul natif et fiable de la taille des mondes sous Windows
- Provisioning et détection automatique de Java 21 portable
- Ajout d'un spinner animé et état désactivé sur le bouton de réparation
- Diagnostic réseau honnête sans mention erronée de Fibre
- Optimisation des requêtes et suppression du polling intensif SSE
- Filtrage du spam de logs console (sauvegardes en jeu et sondages)
- Amélioration ergonomique du modal de bienvenue (boutons et défilement)`,
    assets: [
      {
        name: "mac-Cubirium.pkg",
        browser_download_url: "https://github.com/Gabriel-Jagueneau/Cubirium/releases/download/v1.1.0/mac-Cubirium.pkg",
        size: 104857600
      },
      {
        name: "win-Cubirium.exe",
        browser_download_url: "https://github.com/Gabriel-Jagueneau/Cubirium/releases/download/v1.1.0/win-Cubirium.exe",
        size: 98566144
      }
    ]
  },
  {
    tag_name: "v1.0.0",
    name: "Release v1.0.0",
    published_at: "2026-10-11T09:21:27Z",
    html_url: "https://github.com/Gabriel-Jagueneau/Cubirium/releases/tag/v1.0.0",
    body: `Version stable initiale de Minecraft Server Manager.
- Auto-réparation et détection proactive des incidents de démarrage
- Nettoyage et rollback stricts en cas d'échec d'installation ou d'importation
- Système de vérification et notification des mises à jour applicatives via GitHub
- Support étendu des runtimes Java 21 et Java 25 (Minecraft 26.3)
- Outil de diagnostic matériel et recommandations d'hébergement
- Filtrage intelligent des mods réservés au client`,
    assets: []
  }
];

document.addEventListener("DOMContentLoaded", () => {
  initOsDetection();
  initCopyAddress();
  fetchReleases();
});

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
}

/**
 * Bouton interactif pour copier l'adresse de connexion du serveur dans la démo
 */
function initCopyAddress() {
  const copyBtn = document.getElementById("btn-copy-address");
  const addressEl = document.getElementById("sample-address");
  const copyLabel = document.getElementById("copy-label");

  if (!copyBtn || !addressEl || !copyLabel) return;

  copyBtn.addEventListener("click", async () => {
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
      copyLabel.textContent = "Adresse copiée !";
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyLabel.textContent = "Copier l'adresse";
      }, 2500);
    } catch (err) {
      console.warn("Échec de la copie :", err);
    }
  });
}

/**
 * Récupération dynamique des releases depuis l'API GitHub
 */
async function fetchReleases() {
  const container = document.getElementById("changelog-container");
  const syncStatusText = document.getElementById("sync-status-text");
  const apiUrl = "https://api.github.com/repos/Gabriel-Jagueneau/Cubirium/releases";

  let releases = [];
  let isLive = false;

  try {
    const res = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github.v3+json"
      }
    });

    if (res.ok) {
      releases = await res.json();
      isLive = true;
    } else {
      console.warn("GitHub API a renvoyé un statut " + res.status + ", utilisation du fallback.");
      releases = FALLBACK_RELEASES;
    }
  } catch (err) {
    console.warn("Erreur réseau GitHub API, utilisation du fallback :", err);
    releases = FALLBACK_RELEASES;
  }

  // Si l'API retourne un tableau vide, utiliser le fallback
  if (!Array.isArray(releases) || releases.length === 0) {
    releases = FALLBACK_RELEASES;
  }

  updateHeaderVersions(releases[0]);
  renderReleases(releases, container);

  if (syncStatusText) {
    syncStatusText.textContent = isLive
      ? "Synchronisé avec GitHub"
      : "Versions locales certifiées";
  }
}

/**
 * Met à jour les libellés de version dans le Hero et la barre de navigation
 */
function updateHeaderVersions(latestRelease) {
  if (!latestRelease) return;
  const version = latestRelease.tag_name || "v1.1.0";

  const navBadge = document.getElementById("nav-version-badge");
  const heroBadge = document.getElementById("hero-badge-text");
  const heroVersion = document.getElementById("hero-version-text");

  if (navBadge) navBadge.textContent = version;
  if (heroBadge) heroBadge.textContent = `Dernière version ${version} disponible`;
  if (heroVersion) heroVersion.textContent = version;

  // Mise à jour éventuelle des liens de téléchargement hero
  const btnMac = document.getElementById("btn-download-mac");
  const btnWin = document.getElementById("btn-download-win");

  if (latestRelease.assets && latestRelease.assets.length > 0) {
    const macAsset = latestRelease.assets.find(a => a.name.endsWith(".pkg") || a.name.includes("mac"));
    const winAsset = latestRelease.assets.find(a => a.name.endsWith(".exe") || a.name.includes("win"));

    if (macAsset && btnMac) btnMac.href = macAsset.browser_download_url;
    if (winAsset && btnWin) btnWin.href = winAsset.browser_download_url;
  }
}

/**
 * Génère le HTML pour chaque version
 */
function renderReleases(releases, container) {
  if (!container) return;

  container.innerHTML = "";

  releases.forEach((rel, index) => {
    const isLatest = index === 0;
    const card = document.createElement("article");
    card.className = `release-card ${isLatest ? "release-card--latest" : ""}`;

    const dateStr = formatDate(rel.published_at);
    const tagName = rel.tag_name || "Version";
    const releaseTitle = rel.name || `Cubirium ${tagName}`;

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

      <h3 class="release-card__title">${escapeHtml(releaseTitle)}</h3>

      <div class="release-card__body">
        ${formattedBody}
      </div>

      <div class="release-card__downloads">
        ${downloadsHtml}
      </div>
    `;

    container.appendChild(card);
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
  const lines = text.split("\n");
  let inList = false;
  let html = "";

  lines.forEach(line => {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      return;
    }

    // Puces (- ou • ou *)
    if (/^[-•*]\s+/.test(trimmed)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      const itemContent = trimmed.replace(/^[-•*]\s+/, "");
      html += `<li>${formatInline(itemContent)}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<p style="margin-bottom: 8px;">${formatInline(trimmed)}</p>`;
    }
  });

  if (inList) {
    html += "</ul>";
  }

  return html;
}

function formatInline(str) {
  // `code`
  let out = escapeHtml(str);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  // **gras**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
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

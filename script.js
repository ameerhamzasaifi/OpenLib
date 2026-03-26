// ── Firebase Imports ─────────────────────────────────────────────────────────
import {
  signInWithGoogle, signInWithGitHub, signOutUser, getCurrentUser, onUserAuthStateChanged,
  submitRatingToFirestore, getRatingStatsFromFirestore, submitReportToFirestore,
  submitAppToFirestore, getAllRatingsFromFirestore, getAllAppsFromFirestore,
  getAppFromFirestore, incrementAppViews, toggleVote, getUserVote, seedAppsToFirestore
} from './firebase-config.js';

// ── State ────────────────────────────────────────────────────────────────────
let currentUser = null;
let apps = [];
let ratingsCache = {};

// ── Seed data (used to populate Firestore if empty) ──────────────────────────
const SEED_APPS = [
  {
    id: "frappe-books",
    name: "Frappe Books",
    logo: "https://frappebooks.com/logo.png",
    category: "Finance",
    description: "Free and open-source desktop bookkeeping software for small businesses and freelancers.",
    uses: "Track income, expenses, invoices, and financial reports without a subscription.",
    alternative: "QuickBooks",
    download: "https://frappebooks.com/",
    source: "https://github.com/frappe/books",
    maintainer: "organization",
    platforms: ["Linux", "Windows", "macOS"]
  },
  {
    id: "vlc",
    name: "VLC Media Player",
    logo: "https://www.videolan.org/vlc/screenshots/2.0.0/vlc-2.0.png",
    category: "Media",
    description: "A free, open-source multimedia player that handles virtually every video and audio format.",
    uses: "Play any media file locally without codec packs or proprietary software.",
    alternative: "Windows Media Player",
    download: "https://www.videolan.org/vlc/",
    source: "https://code.videolan.org/videolan/vlc",
    maintainer: "organization",
    platforms: ["Linux", "Windows", "macOS", "Android", "iOS"]
  },
  {
    id: "gimp",
    name: "GIMP",
    logo: "https://www.gimp.org/images/frontpage/wilber-big.png",
    category: "Design",
    description: "A professional-grade image editor with layers, masks, filters, and a full suite of drawing tools.",
    uses: "Edit photos, create digital art, and compose graphics without paying for Photoshop.",
    alternative: "Adobe Photoshop",
    download: "https://www.gimp.org/downloads/",
    source: "https://gitlab.gnome.org/GNOME/gimp",
    maintainer: "organization",
    platforms: ["Linux", "Windows", "macOS"]
  },
  {
    id: "logseq",
    name: "Logseq",
    logo: "https://logseq.com/logo.png",
    category: "Productivity",
    description: "A privacy-first, local-first knowledge management and note-taking app with outliner and graph views.",
    uses: "Build a personal knowledge base, journal, and task manager entirely on your own machine.",
    alternative: "Notion",
    download: "https://logseq.com/downloads",
    source: "https://github.com/logseq/logseq",
    maintainer: "organization",
    platforms: ["Linux", "Windows", "macOS", "Android", "iOS"]
  },
  {
    id: "inkscape",
    name: "Inkscape",
    logo: "https://media.inkscape.org/static/images/inkscape-logo.svg",
    category: "Design",
    description: "A powerful vector graphics editor with SVG as its native format, supporting complex paths and typography.",
    uses: "Create scalable logos, illustrations, and print layouts without Adobe Illustrator.",
    alternative: "Adobe Illustrator",
    download: "https://inkscape.org/release/",
    source: "https://gitlab.com/inkscape/inkscape",
    maintainer: "organization",
    platforms: ["Linux", "Windows", "macOS"]
  },
  {
    id: "bitwarden",
    name: "Bitwarden",
    logo: "https://bitwarden.com/images/icons/apple-touch-icon.png",
    category: "Security",
    description: "An end-to-end encrypted, open-source password manager with browser extensions and mobile apps.",
    uses: "Securely store and sync credentials across all devices with the option to self-host the vault.",
    alternative: "1Password",
    download: "https://bitwarden.com/download/",
    source: "https://github.com/bitwarden/clients",
    maintainer: "organization",
    platforms: ["Linux", "Windows", "macOS", "Android", "iOS", "Web"]
  },
  {
    id: "thunderbird",
    name: "Thunderbird",
    logo: "https://www.thunderbird.net/media/img/thunderbird/logos/thunderbird-128x128.png",
    category: "Communication",
    description: "A feature-rich email client with a unified inbox, calendar, RSS reader, and extensible add-ons.",
    uses: "Manage multiple email accounts from a single desktop app without browser dependency.",
    alternative: "Microsoft Outlook",
    download: "https://www.thunderbird.net/",
    source: "https://github.com/mozilla/releases-comm-central",
    maintainer: "organization",
    platforms: ["Linux", "Windows", "macOS"]
  },
  {
    id: "kdenlive",
    name: "Kdenlive",
    logo: "https://kdenlive.org/wp-content/uploads/2022/01/kdenlive.png",
    category: "Media",
    description: "A non-linear video editor with multi-track timeline, effects, transitions, and proxy editing.",
    uses: "Edit, cut, and export videos for YouTube or social media without paying for Premiere Pro.",
    alternative: "Adobe Premiere Pro",
    download: "https://kdenlive.org/en/download/",
    source: "https://invent.kde.org/multimedia/kdenlive",
    maintainer: "organization",
    platforms: ["Linux", "Windows", "macOS"]
  },
  {
    id: "signal",
    name: "Signal",
    logo: "https://signal.org/favicon-32x32.png",
    category: "Communication",
    description: "A private, end-to-end encrypted messaging app with voice and video calls backed by open protocols.",
    uses: "Send messages, photos, and make calls with strong cryptographic privacy by default.",
    alternative: "WhatsApp",
    download: "https://signal.org/en/download/",
    source: "https://github.com/signalapp/Signal-Android",
    maintainer: "organization",
    platforms: ["Linux", "Windows", "macOS", "Android", "iOS"]
  },
  {
    id: "libreoffice",
    name: "LibreOffice",
    logo: "https://www.libreoffice.org/themes/libreofficenew/img/discover.png",
    category: "Productivity",
    description: "A complete office suite with Writer, Calc, Impress, Draw, and Base — fully compatible with Microsoft formats.",
    uses: "Create documents, spreadsheets, and presentations without a Microsoft 365 subscription.",
    alternative: "Microsoft Office",
    download: "https://www.libreoffice.org/download/download/",
    source: "https://git.libreoffice.org/core",
    maintainer: "organization",
    platforms: ["Linux", "Windows", "macOS"]
  },
  {
    id: "blender",
    name: "Blender",
    logo: "https://www.blender.org/wp-content/themes/bthree/assets/imgs/logo-B.svg",
    category: "Design",
    description: "A complete 3D creation suite covering modelling, rigging, animation, simulation, rendering, and video editing.",
    uses: "Create 3D assets, animated films, game assets, and visual effects at professional quality.",
    alternative: "Autodesk Maya",
    download: "https://www.blender.org/download/",
    source: "https://github.com/blender/blender",
    maintainer: "organization",
    platforms: ["Linux", "Windows", "macOS"]
  },
  {
    id: "syncthing",
    name: "Syncthing",
    logo: "https://syncthing.net/img/logo-horizontal.svg",
    category: "Utility",
    description: "A continuous file-synchronisation program that syncs files between devices directly without a central server.",
    uses: "Keep folders in sync across computers without uploading data to a third-party cloud service.",
    alternative: "Dropbox",
    download: "https://syncthing.net/downloads/",
    source: "https://github.com/syncthing/syncthing",
    maintainer: "individual",
    platforms: ["Linux", "Windows", "macOS", "Android"]
  }
];

// ── Security: HTML escaping ──────────────────────────────────────────────────
function esc(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(String(str ?? "")));
  return div.innerHTML;
}

// ── Session ID ───────────────────────────────────────────────────────────────
function getSessionId() {
  let id = localStorage.getItem("openlib_session");
  if (!id) {
    id = "sess_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("openlib_session", id);
  }
  return id;
}

// ── Data Loading (Firestore only) ────────────────────────────────────────────
async function loadApps() {
  try {
    apps = await getAllAppsFromFirestore();
    if (apps.length === 0) {
      console.log("No apps in Firestore. Use seedApps() in console to seed initial data.");
    }
  } catch (err) {
    console.error("Error loading apps:", err);
    apps = [];
  }
}

async function fetchAllRatings() {
  try {
    ratingsCache = await getAllRatingsFromFirestore();
  } catch (err) {
    console.error("Error fetching ratings:", err);
    ratingsCache = {};
  }
}

async function submitRating(appId, star) {
  if (!currentUser) {
    showToast("Sign in to rate apps");
    return null;
  }
  try {
    const result = await submitRatingToFirestore(appId, star, currentUser.uid, getSessionId());
    ratingsCache[appId] = { avg: result.avg, total: result.total };
    return result;
  } catch (err) {
    console.error("Error submitting rating:", err);
    showToast("Failed to save rating");
    return null;
  }
}

async function submitApp(payload) {
  if (!currentUser) throw new Error("Sign in required");
  return await submitAppToFirestore(payload, currentUser.uid);
}

async function submitReport(payload) {
  if (!currentUser) throw new Error("Sign in required");
  return await submitReportToFirestore(
    payload.appId, payload.appName, payload.reason, payload.details, currentUser.uid
  );
}

// ── Seed function (call from browser console) ────────────────────────────────
window.seedApps = async function() {
  console.log("Seeding apps to Firestore...");
  try {
    const count = await seedAppsToFirestore(SEED_APPS);
    console.log(`Seeded ${count} new apps.`);
    await loadApps();
    renderCurrentView();
    showToast(`Seeded ${count} apps to Firestore`);
  } catch (err) {
    console.error("Seed failed:", err);
  }
};

// ── Ranking Calculator ───────────────────────────────────────────────────────
function calcRankScore(app) {
  const r = ratingsCache[app.id] || {};
  const avg = r.avg || 0;
  const total = r.total || 0;
  const likes = app.likes || 0;
  const dislikes = app.dislikes || 0;
  const views = app.views || 0;
  return (avg * 20) + (total * 3) + (likes * 2) - (dislikes) + (views * 0.05);
}

function getRankedApps() {
  return [...apps].sort((a, b) => calcRankScore(b) - calcRankScore(a));
}

function getAppRank(appId) {
  const ranked = getRankedApps();
  const idx = ranked.findIndex(a => a.id === appId);
  return idx >= 0 ? idx + 1 : null;
}

// ── Rendering Helpers ────────────────────────────────────────────────────────
function platformIcon(p) {
  return { Linux:"🐧", Windows:"🪟", macOS:"🍎", Android:"🤖", iOS:"📱", Web:"🌐" }[p] || "💻";
}

function renderStars(appId, interactive) {
  const c = ratingsCache[appId] || {};
  const avg = c.avg || 0;
  const rounded = Math.round(avg);
  return [1,2,3,4,5].map(n => `
    <span class="star${n <= rounded ? " active" : ""}${interactive ? " interactive" : ""}"
      data-app="${esc(appId)}" data-star="${n}"
      role="button" aria-label="Rate ${n} star${n > 1 ? "s" : ""}">★</span>
  `).join("");
}

function addedByBadge(addedBy) {
  if (!addedBy) return '<span class="added-by-badge team">OpenLib Team</span>';
  if (addedBy.type === "openlib-team") {
    return '<span class="added-by-badge team">OpenLib Team</span>';
  }
  return `<span class="added-by-badge user">👤 ${esc(addedBy.name || "User")}</span>`;
}

function buildCard(app) {
  const c = ratingsCache[app.id] || {};
  const avg = c.avg ? c.avg.toFixed(1) : "—";
  const total = c.total || 0;
  const rank = getAppRank(app.id);
  const plates = (app.platforms || []).map(p => `<span class="platform-tag">${platformIcon(p)} ${esc(p)}</span>`).join("");
  const logoHtml = app.logo
    ? `<img class="app-logo" src="${esc(app.logo)}" alt="${esc(app.name)} logo" data-app-id="${esc(app.id)}">`
    : `<div class="app-logo-fallback">${esc(app.name.charAt(0))}</div>`;

  return `
    <article class="app-card" data-id="${esc(app.id)}" data-category="${esc(app.category)}" role="listitem">
      <div class="card-top">
        ${rank ? `<span class="rank-badge">#${rank}</span>` : ""}
        ${logoHtml}
        <div class="app-header-text">
          <a class="app-name app-link" href="#/app/${esc(app.id)}">${esc(app.name)}</a>
          <span class="app-category">${esc(app.category)}</span>
        </div>
        <span class="maintainer-badge" data-type="${esc(app.maintainer)}">${esc(app.maintainer)}</span>
      </div>
      <p class="app-description">${esc(app.description)}</p>
      <div class="app-stats-row">
        <span class="stat-item" title="Views">👁 ${app.views || 0}</span>
        <span class="stat-item like-stat" title="Likes">👍 ${app.likes || 0}</span>
        <span class="stat-item dislike-stat" title="Dislikes">👎 ${app.dislikes || 0}</span>
        <span class="stat-item">${addedByBadge(app.addedBy)}</span>
      </div>
      <div class="platforms-row">${plates}</div>
      <div class="rating-block">
        <div class="stars" data-app="${esc(app.id)}">${renderStars(app.id, true)}</div>
        <div class="rating-info">
          <div class="rating-avg" id="avg-${esc(app.id)}">${avg}</div>
          <div id="count-${esc(app.id)}">${total} rating${total !== 1 ? "s" : ""}</div>
        </div>
        <button class="report-btn" data-app-id="${esc(app.id)}" data-app-name="${esc(app.name)}"
          title="Report this app" aria-label="Report ${esc(app.name)}">⚑</button>
      </div>
      <div class="card-actions">
        <a href="${esc(app.download)}" class="btn btn-primary auth-gate-link" data-action="download" data-app-id="${esc(app.id)}" data-app-name="${esc(app.name)}">⬇ Download</a>
        <a href="${esc(app.source)}" class="btn btn-secondary auth-gate-link" data-action="source" data-app-id="${esc(app.id)}" data-app-name="${esc(app.name)}">&lt;/&gt; Source</a>
      </div>
    </article>`;
}

function handleLogoError(e) {
  const img = e.target;
  const fallback = document.createElement("div");
  fallback.className = "app-logo-fallback";
  const appName = img.closest(".app-card")?.querySelector(".app-name")?.textContent || "?";
  fallback.textContent = appName.charAt(0);
  img.replaceWith(fallback);
}

function renderGrid(list) {
  const grid = document.getElementById("app-grid");
  document.getElementById("results-count").innerHTML = `<strong>${list.length}</strong> of ${apps.length} apps`;
  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <h3>No apps found</h3>
        <p>Try a different search term or category, or run <code>seedApps()</code> in the console to add initial data.</p>
      </div>`;
    return;
  }
  grid.innerHTML = list.map(buildCard).join("");
  document.getElementById("total-count").textContent = `${apps.length} apps`;
  grid.querySelectorAll("img.app-logo").forEach(img => {
    img.addEventListener("error", handleLogoError);
  });
}

function getFiltered() {
  const q = document.getElementById("search-input").value.toLowerCase().trim();
  const active = document.querySelector(".filter-btn.active")?.dataset.filter || "All";
  return apps.filter(app => {
    const cat = active === "All" || app.category === active;
    const srch = !q
      || app.name.toLowerCase().includes(q)
      || app.description.toLowerCase().includes(q)
      || app.category.toLowerCase().includes(q)
      || (app.alternative || "").toLowerCase().includes(q)
      || (app.platforms || []).some(p => p.toLowerCase().includes(q));
    return cat && srch;
  });
}

function buildFilters() {
  const cats = ["All", ...new Set(apps.map(a => a.category).sort())];
  const wrap = document.getElementById("filters-container");
  wrap.innerHTML = cats.map(c =>
    `<button class="filter-btn${c === "All" ? " active" : ""}" data-filter="${esc(c)}">${esc(c)}</button>`
  ).join("");
  wrap.addEventListener("click", e => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    wrap.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderGrid(getFiltered());
  });
}

// ── App Detail Page ──────────────────────────────────────────────────────────
async function showAppDetail(appId) {
  document.getElementById("home-view").style.display = "none";
  document.getElementById("rankings-view").style.display = "none";
  const detailView = document.getElementById("detail-view");
  detailView.style.display = "block";

  detailView.innerHTML = `<div class="detail-loading">Loading app details…</div>`;

  let app = apps.find(a => a.id === appId);
  if (!app) {
    app = await getAppFromFirestore(appId);
  }
  if (!app) {
    detailView.innerHTML = `<div class="empty-state"><h3>App not found</h3><p><a href="#/">← Back to library</a></p></div>`;
    return;
  }

  // Increment views
  const newViews = await incrementAppViews(appId);
  app.views = newViews;
  const localIdx = apps.findIndex(a => a.id === appId);
  if (localIdx >= 0) apps[localIdx].views = newViews;

  // Get user vote if logged in
  let userVote = null;
  if (currentUser) {
    userVote = await getUserVote(appId, currentUser.uid);
  }

  const c = ratingsCache[appId] || {};
  const avg = c.avg ? c.avg.toFixed(1) : "—";
  const total = c.total || 0;
  const rank = getAppRank(appId);
  const plates = (app.platforms || []).map(p => `<span class="platform-tag">${platformIcon(p)} ${esc(p)}</span>`).join("");
  const logoHtml = app.logo
    ? `<img class="detail-logo" src="${esc(app.logo)}" alt="${esc(app.name)} logo" onerror="this.style.display='none'">`
    : `<div class="detail-logo-fallback">${esc(app.name.charAt(0))}</div>`;

  detailView.innerHTML = `
    <div class="detail-page">
      <a href="#/" class="back-link">← Back to library</a>
      <div class="detail-header">
        ${logoHtml}
        <div class="detail-header-text">
          <h1 class="detail-name">${esc(app.name)} ${rank ? `<span class="rank-badge rank-lg">#${rank}</span>` : ""}</h1>
          <span class="app-category">${esc(app.category)}</span>
          <span class="maintainer-badge" data-type="${esc(app.maintainer)}">${esc(app.maintainer)}</span>
          ${addedByBadge(app.addedBy)}
        </div>
      </div>

      <div class="detail-body">
        <div class="detail-section">
          <h3>Description</h3>
          <p>${esc(app.description)}</p>
        </div>
        <div class="detail-section">
          <h3>Uses</h3>
          <p>${esc(app.uses)}</p>
        </div>
        <div class="detail-section">
          <h3>Alternative to</h3>
          <p class="alt-name">${esc(app.alternative)}</p>
        </div>
        <div class="detail-section">
          <h3>Platforms</h3>
          <div class="platforms-row">${plates}</div>
        </div>

        <div class="detail-stats">
          <div class="detail-stat-card">
            <span class="stat-number">${app.views || 0}</span>
            <span class="stat-label">Views</span>
          </div>
          <div class="detail-stat-card">
            <span class="stat-number">${app.likes || 0}</span>
            <span class="stat-label">Likes</span>
          </div>
          <div class="detail-stat-card">
            <span class="stat-number">${app.dislikes || 0}</span>
            <span class="stat-label">Dislikes</span>
          </div>
          <div class="detail-stat-card">
            <span class="stat-number">${avg}</span>
            <span class="stat-label">${total} Ratings</span>
          </div>
        </div>

        <div class="detail-actions">
          <div class="vote-buttons">
            <button class="vote-btn like-btn ${userVote === 'like' ? 'active' : ''}" data-app-id="${esc(appId)}" data-vote="like">
              👍 Like <span class="vote-count" id="like-count-${esc(appId)}">${app.likes || 0}</span>
            </button>
            <button class="vote-btn dislike-btn ${userVote === 'dislike' ? 'active' : ''}" data-app-id="${esc(appId)}" data-vote="dislike">
              👎 Dislike <span class="vote-count" id="dislike-count-${esc(appId)}">${app.dislikes || 0}</span>
            </button>
          </div>

          <div class="rating-block detail-rating">
            <span class="detail-rate-label">Rate:</span>
            <div class="stars" data-app="${esc(appId)}">${renderStars(appId, true)}</div>
            <div class="rating-info">
              <div class="rating-avg" id="avg-${esc(appId)}">${avg}</div>
              <div id="count-${esc(appId)}">${total} rating${total !== 1 ? "s" : ""}</div>
            </div>
          </div>

          <div class="detail-links">
            <a href="${esc(app.download)}" class="btn btn-primary btn-lg auth-gate-link" data-action="download" data-app-id="${esc(appId)}" data-app-name="${esc(app.name)}">⬇ Download</a>
            <a href="${esc(app.source)}" class="btn btn-secondary btn-lg auth-gate-link" data-action="source" data-app-id="${esc(appId)}" data-app-name="${esc(app.name)}">&lt;/&gt; Source Code</a>
          </div>

          <button class="report-btn detail-report" data-app-id="${esc(appId)}" data-app-name="${esc(app.name)}">⚑ Report this app</button>
        </div>
      </div>
    </div>
  `;

  // Attach event listeners
  detailView.querySelectorAll(".vote-btn").forEach(btn => {
    btn.addEventListener("click", handleVoteClick);
  });
  detailView.querySelectorAll(".auth-gate-link").forEach(link => {
    link.addEventListener("click", handleAuthGateClick);
  });
  detailView.querySelector(".detail-report")?.addEventListener("click", e => {
    const rb = e.currentTarget;
    openReportModal(rb.dataset.appId, rb.dataset.appName);
  });
}

// ── Rankings Page ────────────────────────────────────────────────────────────
function showRankings() {
  document.getElementById("home-view").style.display = "none";
  document.getElementById("detail-view").style.display = "none";
  const rankView = document.getElementById("rankings-view");
  rankView.style.display = "block";

  const ranked = getRankedApps();

  rankView.innerHTML = `
    <div class="rankings-page">
      <a href="#/" class="back-link">← Back to library</a>
      <h1 class="rankings-title">🏆 App Rankings</h1>
      <p class="rankings-subtitle">Ranked by community ratings, likes, and popularity</p>
      <div class="rankings-list">
        ${ranked.map((app, i) => {
          const c = ratingsCache[app.id] || {};
          const avg = c.avg ? c.avg.toFixed(1) : "—";
          const score = calcRankScore(app).toFixed(0);
          const logoHtml = app.logo
            ? `<img class="rank-logo" src="${esc(app.logo)}" alt="" onerror="this.style.display='none'">`
            : `<div class="rank-logo-fallback">${esc(app.name.charAt(0))}</div>`;
          return `
            <a href="#/app/${esc(app.id)}" class="ranking-item ${i < 3 ? 'top-' + (i+1) : ''}">
              <span class="ranking-pos">${i + 1}</span>
              ${logoHtml}
              <div class="ranking-info">
                <span class="ranking-name">${esc(app.name)}</span>
                <span class="ranking-cat">${esc(app.category)}</span>
              </div>
              <div class="ranking-metrics">
                <span title="Rating">⭐ ${avg}</span>
                <span title="Likes">👍 ${app.likes || 0}</span>
                <span title="Views">👁 ${app.views || 0}</span>
              </div>
              <span class="ranking-score" title="Score">${score} pts</span>
            </a>`;
        }).join("")}
      </div>
    </div>
  `;
}

// ── Auth Gate ─────────────────────────────────────────────────────────────────
function handleAuthGateClick(e) {
  if (currentUser) return; // Allow through
  e.preventDefault();
  e.stopPropagation();
  const action = e.currentTarget.dataset.action;
  const appName = e.currentTarget.dataset.appName;
  openLoginPrompt(action, appName, e.currentTarget.href);
}

function openLoginPrompt(action, appName, targetUrl) {
  const modal = document.getElementById("login-prompt-modal");
  const label = action === "download" ? "download" : "view the source code of";
  modal.querySelector(".login-prompt-text").textContent = `Sign in to ${label} ${appName}`;
  modal.dataset.targetUrl = targetUrl;
  modal.classList.add("open");
}

// ── Vote Handler ─────────────────────────────────────────────────────────────
async function handleVoteClick(e) {
  const btn = e.currentTarget;
  if (!currentUser) {
    showToast("Sign in to vote");
    return;
  }
  const appId = btn.dataset.appId;
  const voteType = btn.dataset.vote;

  btn.disabled = true;
  try {
    const result = await toggleVote(appId, currentUser.uid, voteType);
    // Refresh app data
    const updatedApp = await getAppFromFirestore(appId);
    if (updatedApp) {
      const idx = apps.findIndex(a => a.id === appId);
      if (idx >= 0) apps[idx] = updatedApp;

      // Update UI
      const likeCount = document.getElementById(`like-count-${appId}`);
      const dislikeCount = document.getElementById(`dislike-count-${appId}`);
      if (likeCount) likeCount.textContent = updatedApp.likes || 0;
      if (dislikeCount) dislikeCount.textContent = updatedApp.dislikes || 0;

      // Toggle active states
      const likeBtn = document.querySelector(`.like-btn[data-app-id="${appId}"]`);
      const dislikeBtn = document.querySelector(`.dislike-btn[data-app-id="${appId}"]`);
      if (result.action === "removed") {
        btn.classList.remove("active");
      } else {
        if (likeBtn) likeBtn.classList.toggle("active", result.type === "like");
        if (dislikeBtn) dislikeBtn.classList.toggle("active", result.type === "dislike");
      }
    }
    showToast(result.action === "removed" ? "Vote removed" : result.type === "like" ? "Liked!" : "Disliked");
  } catch (err) {
    showToast("Vote failed, try again");
  } finally {
    btn.disabled = false;
  }
}

// ── Star Rating ──────────────────────────────────────────────────────────────
async function handleStarClick(e) {
  const star = e.target.closest(".star.interactive");
  if (!star) return;
  if (!currentUser) {
    showToast("Sign in to rate apps");
    return;
  }
  const appId = star.dataset.app;
  const value = parseInt(star.dataset.star, 10);

  document.querySelectorAll(`.star[data-app="${appId}"]`).forEach((s, i) => {
    s.classList.toggle("active", i < value);
  });

  const result = await submitRating(appId, value);
  if (result) {
    ratingsCache[appId] = { avg: result.avg, total: result.total };
    const avgEl = document.getElementById(`avg-${appId}`);
    const countEl = document.getElementById(`count-${appId}`);
    if (avgEl) avgEl.textContent = result.avg ? result.avg.toFixed(1) : "—";
    if (countEl) countEl.textContent = `${result.total} rating${result.total !== 1 ? "s" : ""}`;
    showToast(`Rated ${value} ★ — saved`);
  }
}

// ── Report Modal ─────────────────────────────────────────────────────────────
function openReportModal(appId, appName) {
  if (!currentUser) {
    showToast("Sign in to report apps");
    return;
  }
  const modal = document.getElementById("report-modal");
  modal.querySelector(".modal-title").textContent = `Report: ${appName}`;
  const form = document.getElementById("report-form");
  form.dataset.appId = appId;
  form.dataset.appName = appName;
  form.reset();
  clearFormMsg(form);
  modal.classList.add("open");
}

async function handleReportSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector(".btn-submit");
  const reason = form.querySelector("#report-reason").value.trim();
  const details = form.querySelector("#report-details").value.trim();

  if (!reason) { showFormError(form, "Please choose a reason."); return; }
  if (details.length > 500) { showFormError(form, "Details must be 500 characters or less."); return; }

  btn.disabled = true;
  btn.setAttribute("data-original", btn.textContent);
  btn.textContent = "Sending…";

  try {
    await submitReport({ appId: form.dataset.appId, appName: form.dataset.appName, reason, details });
    showFormSuccess(form, "Report submitted. Thank you!");
    setTimeout(() => closeModal("report-modal"), 2000);
  } catch (err) {
    showFormError(form, err.message || "Could not send report.");
  } finally {
    btn.disabled = false;
    btn.textContent = btn.getAttribute("data-original") || "Submit Report";
  }
}

// ── Submit App Modal ─────────────────────────────────────────────────────────
function openSubmitModal() {
  if (!currentUser) {
    showToast("Sign in to submit apps");
    return;
  }
  const modal = document.getElementById("submit-modal");
  document.getElementById("submit-form").reset();
  clearFormMsg(document.getElementById("submit-form"));
  modal.classList.add("open");
}

async function handleSubmitApp(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector(".btn-submit");
  const platforms = [...form.querySelectorAll("input[name='platforms']:checked")].map(el => el.value);

  if (!platforms.length) { showFormError(form, "Select at least one platform."); return; }

  const name = form.querySelector("#sub-name").value.trim();
  const description = form.querySelector("#sub-description").value.trim();
  const uses = form.querySelector("#sub-uses").value.trim();

  if (name.length < 2 || name.length > 100) { showFormError(form, "App name must be 2-100 characters."); return; }
  if (description.length < 10 || description.length > 300) { showFormError(form, "Description must be 10-300 characters."); return; }
  if (uses.length < 10 || uses.length > 300) { showFormError(form, "Uses field must be 10-300 characters."); return; }

  const payload = {
    name,
    logo: form.querySelector("#sub-logo").value.trim(),
    category: form.querySelector("#sub-category").value,
    description,
    uses,
    alternative: form.querySelector("#sub-alternative").value.trim(),
    download: form.querySelector("#sub-download").value.trim(),
    source: form.querySelector("#sub-source").value.trim(),
    maintainer: form.querySelector("#sub-maintainer").value,
    platforms,
    submitterEmail: form.querySelector("#sub-email").value.trim(),
  };

  btn.disabled = true;
  btn.setAttribute("data-original", btn.textContent);
  btn.textContent = "Submitting…";

  try {
    await submitApp(payload);
    showFormSuccess(form, "App submitted for review!");
    setTimeout(() => closeModal("submit-modal"), 2500);
  } catch (err) {
    showFormError(form, err.message || "Submission failed.");
  } finally {
    btn.disabled = false;
    btn.textContent = btn.getAttribute("data-original") || "Submit App";
  }
}

// ── Modal Utilities ──────────────────────────────────────────────────────────
function closeModal(id) { document.getElementById(id)?.classList.remove("open"); }
function showFormError(form, msg)   { setMsg(form, msg, "error"); }
function showFormSuccess(form, msg) { setMsg(form, msg, "success"); }
function clearFormMsg(form)         { setMsg(form, "", ""); }
function setMsg(form, text, cls) {
  const el = form.querySelector(".form-msg");
  if (!el) return;
  el.textContent = text;
  el.className = cls ? `form-msg ${cls}` : "form-msg";
}

// ── Theme ────────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem("openlib_theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  document.getElementById("theme-icon").textContent = saved === "dark" ? "☀️" : "🌙";
}

function toggleTheme() {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("openlib_theme", next);
  document.getElementById("theme-icon").textContent = next === "dark" ? "☀️" : "🌙";
}

// ── Auth UI ──────────────────────────────────────────────────────────────────
function updateAuthUI(user) {
  currentUser = user;
  const trigger = document.getElementById("auth-trigger");
  const content = document.getElementById("auth-content");

  if (user) {
    trigger.innerHTML = `<span id="auth-icon">✓</span><span id="auth-label">${esc(user.displayName || "Account")}</span>`;
    content.innerHTML = `
      <div class="user-info">
        <div class="user-name">${esc(user.displayName || "User")}</div>
        <div class="user-email">${esc(user.email || "")}</div>
      </div>
      <button class="auth-option signout" id="signout-btn">← Sign Out</button>
    `;
  } else {
    trigger.innerHTML = `<span id="auth-icon">👤</span><span id="auth-label">Sign in</span>`;
    content.innerHTML = `
      <button class="auth-option google" id="google-signin-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Google
      </button>
      <button class="auth-option github" id="github-signin-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
        GitHub
      </button>
    `;
  }
}

function setupAuthHandlers() {
  const trigger = document.getElementById("auth-trigger");
  const dropdown = document.getElementById("auth-dropdown");

  trigger.addEventListener("click", e => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
  });

  document.addEventListener("click", e => {
    if (!e.target.closest(".auth-menu")) {
      dropdown.classList.remove("open");
    }
  });

  document.addEventListener("click", async e => {
    if (e.target.closest("#google-signin-btn")) {
      try {
        await signInWithGoogle();
        dropdown.classList.remove("open");
        showToast("Signed in with Google ✓");
      } catch (err) {
        showToast("Sign-in failed: " + err.message);
      }
    }
    if (e.target.closest("#github-signin-btn")) {
      try {
        await signInWithGitHub();
        dropdown.classList.remove("open");
        showToast("Signed in with GitHub ✓");
      } catch (err) {
        showToast("Sign-in failed: " + err.message);
      }
    }
    if (e.target.closest("#signout-btn")) {
      try {
        await signOutUser();
        dropdown.classList.remove("open");
        showToast("Signed out");
      } catch (err) {
        showToast("Sign-out failed: " + err.message);
      }
    }
  });
}

function initAuth() {
  onUserAuthStateChanged(user => {
    updateAuthUI(user);
  });
  setupAuthHandlers();
}

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove("show"), 2600);
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ── Meta helpers ─────────────────────────────────────────────────────────────
const BASE_URL = "https://ameerhamzasaifi.github.io/OpenLib/";

function updatePageMeta({ title, description, url }) {
  document.title = title;
  const setAttr = (id, attr, val) => { const el = document.getElementById(id); if (el) el.setAttribute(attr, val); };
  setAttr("canonical-url", "href", url);
  setAttr("og-url",         "content", url);
  setAttr("og-title",       "content", title);
  setAttr("og-description", "content", description);
  setAttr("tw-title",       "content", title);
  setAttr("tw-description", "content", description);
  setAttr("tw-url",         "content", url);
}

// ── Router ───────────────────────────────────────────────────────────────────
function handleRoute() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/app/")) {
    const appId = decodeURIComponent(hash.replace("#/app/", ""));
    const app = apps.find(a => a.id === appId);
    updatePageMeta({
      title: app ? `${app.name} — OpenLib` : "App — OpenLib",
      description: app ? app.description : "Open-source app details on OpenLib.",
      url: `${BASE_URL}#/app/${encodeURIComponent(appId)}`
    });
    showAppDetail(appId);
  } else if (hash === "#/rankings") {
    updatePageMeta({
      title: "Rankings — OpenLib",
      description: "Top-rated open-source apps ranked by the OpenLib community.",
      url: `${BASE_URL}#/rankings`
    });
    showRankings();
  } else {
    updatePageMeta({
      title: "OpenLib — Open Source App Library",
      description: "Discover free alternatives. Rate what you use. Own your software stack.",
      url: BASE_URL
    });
    showHome();
  }
}

function showHome() {
  document.getElementById("detail-view").style.display = "none";
  document.getElementById("rankings-view").style.display = "none";
  document.getElementById("home-view").style.display = "block";
}

function renderCurrentView() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/app/")) {
    showAppDetail(hash.replace("#/app/", ""));
  } else if (hash === "#/rankings") {
    showRankings();
  } else {
    buildFilters();
    renderGrid(getFiltered());
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  initTheme();
  initAuth();

  // Load data from Firestore
  await loadApps();
  await fetchAllRatings();

  buildFilters();
  renderGrid(getFiltered());

  // Route
  handleRoute();
  window.addEventListener("hashchange", handleRoute);

  // Event listeners
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
  document.getElementById("search-input").addEventListener("input", debounce(() => renderGrid(getFiltered()), 180));
  document.getElementById("submit-app-btn").addEventListener("click", openSubmitModal);
  document.getElementById("report-form").addEventListener("submit", handleReportSubmit);
  document.getElementById("submit-form").addEventListener("submit", handleSubmitApp);

  // Grid events
  document.getElementById("app-grid").addEventListener("click", e => {
    handleStarClick(e);
    const rb = e.target.closest(".report-btn");
    if (rb) openReportModal(rb.dataset.appId, rb.dataset.appName);
  });

  // Auth-gate on card links
  document.getElementById("app-grid").addEventListener("click", e => {
    const link = e.target.closest(".auth-gate-link");
    if (link) handleAuthGateClick(e);
  });

  // Login prompt modal handlers
  const loginModal = document.getElementById("login-prompt-modal");
  loginModal?.querySelector("#prompt-google-btn")?.addEventListener("click", async () => {
    try {
      await signInWithGoogle();
      loginModal.classList.remove("open");
      showToast("Signed in! You can now proceed.");
      if (loginModal.dataset.targetUrl) window.open(loginModal.dataset.targetUrl, "_blank", "noopener");
    } catch (err) {
      showToast("Sign-in failed: " + err.message);
    }
  });
  loginModal?.querySelector("#prompt-github-btn")?.addEventListener("click", async () => {
    try {
      await signInWithGitHub();
      loginModal.classList.remove("open");
      showToast("Signed in! You can now proceed.");
      if (loginModal.dataset.targetUrl) window.open(loginModal.dataset.targetUrl, "_blank", "noopener");
    } catch (err) {
      showToast("Sign-in failed: " + err.message);
    }
  });

  // Ranking nav link
  document.getElementById("ranking-nav-link")?.addEventListener("click", e => {
    e.preventDefault();
    location.hash = "#/rankings";
  });

  // Modal interactions
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", e => {
      if (e.target === overlay || e.target.closest(".modal-close")) {
        overlay.classList.remove("open");
      }
    });
    overlay.addEventListener("keydown", e => {
      if (e.key !== "Tab") return;
      const modal = overlay.querySelector(".modal");
      if (!modal) return;
      const focusables = modal.querySelectorAll("a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  });

  // Global keyboard shortcuts
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.open").forEach(m => m.classList.remove("open"));
    }
    if (e.altKey && e.key === "s") { e.preventDefault(); openSubmitModal(); }
    if (e.altKey && e.key === "f") { e.preventDefault(); document.getElementById("search-input").focus(); }
  });
}

document.addEventListener("DOMContentLoaded", init);

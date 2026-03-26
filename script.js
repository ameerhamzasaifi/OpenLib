// ── Config ───────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:3000/api";

function getSessionId() {
  let id = localStorage.getItem("openlib_session");
  if (!id) {
    id = "sess_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("openlib_session", id);
  }
  return id;
}

// ── App Data ─────────────────────────────────────────────────────────────────
const apps = [
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

// ── In-memory ratings cache ───────────────────────────────────────────────────
let ratingsCache = {};

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

async function fetchAllRatings() {
  try {
    ratingsCache = await apiFetch("/ratings");
  } catch {
    ratingsCache = loadLocalRatings();
  }
}

// ── localStorage fallback ─────────────────────────────────────────────────────
const LS_KEY = "openlib_ratings_v2";

function loadLocalRatings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}

function saveLocalRating(appId, star) {
  const all = loadLocalRatings();
  if (!all[appId]) all[appId] = { votes: [], userStar: 0 };
  const entry = all[appId];
  const prev  = entry.userStar;
  if (prev) {
    const idx = entry.votes.indexOf(prev);
    if (idx !== -1) entry.votes.splice(idx, 1);
  }
  entry.userStar = star;
  entry.votes.push(star);
  const total = entry.votes.length;
  const avg   = parseFloat((entry.votes.reduce((a, b) => a + b, 0) / total).toFixed(2));
  all[appId] = entry;
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  return { avg, total };
}

function getLocalUserStar(appId) {
  return loadLocalRatings()[appId]?.userStar || 0;
}

// ── API actions ───────────────────────────────────────────────────────────────
async function submitRating(appId, star) {
  try {
    const result = await apiFetch(`/ratings/${appId}`, {
      method: "POST",
      body: JSON.stringify({ star, sessionId: getSessionId() }),
    });
    ratingsCache[appId] = { avg: result.avg, total: result.total };
    saveLocalRating(appId, star);
    return result;
  } catch {
    return saveLocalRating(appId, star);
  }
}

async function submitApp(payload) {
  return apiFetch("/submissions", { method: "POST", body: JSON.stringify(payload) });
}

async function submitReport(payload) {
  return apiFetch("/reports", { method: "POST", body: JSON.stringify(payload) });
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function platformIcon(p) {
  return { Linux:"🐧", Windows:"🪟", macOS:"🍎", Android:"🤖", iOS:"📱", Web:"🌐" }[p] || "💻";
}

function renderStars(appId, userStar) {
  return [1,2,3,4,5].map(n => `
    <span class="star${n <= userStar ? " active" : ""}"
      data-app="${appId}" data-star="${n}"
      role="button" aria-label="Rate ${n} star${n > 1 ? "s" : ""}">★</span>
  `).join("");
}

function buildCard(app) {
  const c      = ratingsCache[app.id] || {};
  const avg    = c.avg   ? c.avg.toFixed(1) : "—";
  const total  = c.total || 0;
  const uStar  = getLocalUserStar(app.id);
  const plates = app.platforms.map(p => `<span class="platform-tag">${platformIcon(p)} ${p}</span>`).join("");
  const logoHtml = app.logo
    ? `<img class="app-logo" src="${app.logo}" alt="${app.name} logo" data-app-id="${app.id}">`
    : `<div class="app-logo-fallback">${app.name.charAt(0)}</div>`;

  return `
    <article class="app-card" data-id="${app.id}" data-category="${app.category}">
      <div class="card-top">
        ${logoHtml}
        <div class="app-header-text">
          <div class="app-name">${app.name}</div>
          <span class="app-category">${app.category}</span>
        </div>
        <span class="maintainer-badge" data-type="${app.maintainer}">${app.maintainer}</span>
      </div>
      <p class="app-description">${app.description}</p>
      <div class="app-meta-row">
        <div class="meta-item">
          <span class="meta-label">uses</span>
          <span class="meta-value">${app.uses}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">alt of</span>
          <span class="meta-value">Alternative to <span class="alt-name">${app.alternative}</span></span>
        </div>
      </div>
      <div class="platforms-row">${plates}</div>
      <div class="rating-block">
        <div class="stars" data-app="${app.id}">${renderStars(app.id, uStar)}</div>
        <div class="rating-info">
          <div class="rating-avg" id="avg-${app.id}">${avg}</div>
          <div id="count-${app.id}">${total} rating${total !== 1 ? "s" : ""}</div>
        </div>
        <button class="report-btn" data-app-id="${app.id}" data-app-name="${app.name}"
          title="Report this app" aria-label="Report ${app.name}">⚑</button>
      </div>
      <div class="card-actions">
        <a href="${app.download}" target="_blank" rel="noopener" class="btn btn-primary">⬇ Download</a>
        <a href="${app.source}"   target="_blank" rel="noopener" class="btn btn-secondary">&lt;/&gt; Source</a>
      </div>
    </article>`;
}

function handleLogoError(e) {
  const img = e.target;
  const fallback = document.createElement("div");
  fallback.className = "app-logo-fallback";
  // Get app name from the closest card
  const appName = img.closest(".app-card")?.querySelector(".app-name")?.textContent || "?";
  fallback.textContent = appName.charAt(0);
  img.replaceWith(fallback);
};

function renderGrid(list) {
  const grid  = document.getElementById("app-grid");
  document.getElementById("results-count").innerHTML = `<strong>${list.length}</strong> of ${apps.length} apps`;
  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <h3>No apps found</h3>
        <p>Try a different search term or category.</p>
      </div>`;
    return;
  }
  grid.innerHTML = list.map(buildCard).join("");
  document.getElementById("total-count").textContent = `${apps.length} apps`;
  
  // Attach logo error handlers
  grid.querySelectorAll("img.app-logo").forEach(img => {
    img.addEventListener("error", handleLogoError);
  });
}

function getFiltered() {
  const q = document.getElementById("search-input").value.toLowerCase().trim();
  const active = document.querySelector(".filter-btn.active")?.dataset.filter || "All";
  return apps.filter(app => {
    const cat  = active === "All" || app.category === active;
    const srch = !q
      || app.name.toLowerCase().includes(q)
      || app.description.toLowerCase().includes(q)
      || app.category.toLowerCase().includes(q)
      || app.alternative.toLowerCase().includes(q)
      || app.platforms.some(p => p.toLowerCase().includes(q));
    return cat && srch;
  });
}

function buildFilters() {
  const cats = ["All", ...new Set(apps.map(a => a.category).sort())];
  const wrap = document.getElementById("filters-container");
  wrap.innerHTML = cats.map(c =>
    `<button class="filter-btn${c === "All" ? " active" : ""}" data-filter="${c}">${c}</button>`
  ).join("");
  wrap.addEventListener("click", e => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    wrap.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderGrid(getFiltered());
  });
}

// ── Star rating ───────────────────────────────────────────────────────────────
async function handleStarClick(e) {
  const star = e.target.closest(".star");
  if (!star) return;
  const appId = star.dataset.app;
  const value = parseInt(star.dataset.star, 10);

  document.querySelectorAll(`.star[data-app="${appId}"]`).forEach((s, i) => {
    s.classList.toggle("active", i < value);
  });

  const result = await submitRating(appId, value);
  ratingsCache[appId] = { avg: result.avg, total: result.total };
  document.getElementById(`avg-${appId}`).textContent   = result.avg ? result.avg.toFixed(1) : "—";
  document.getElementById(`count-${appId}`).textContent = `${result.total} rating${result.total !== 1 ? "s" : ""}`;
  showToast(`Rated ${value} ★ — saved`);
}

// ── Report modal ──────────────────────────────────────────────────────────────
function openReportModal(appId, appName) {
  const modal = document.getElementById("report-modal");
  modal.querySelector(".modal-title").textContent = `Report: ${appName}`;
  const form = document.getElementById("report-form");
  form.dataset.appId   = appId;
  form.dataset.appName = appName;
  form.reset();
  clearFormMsg(form);
  modal.classList.add("open");
}

async function handleReportSubmit(e) {
  e.preventDefault();
  const form    = e.target;
  const btn     = form.querySelector(".btn-submit");
  const reason  = form.querySelector("#report-reason").value.trim();
  const details = form.querySelector("#report-details").value.trim();
  
  if (!reason) {
    showFormError(form, "Please choose a reason.");
    return;
  }
  
  if (details.length > 500) {
    showFormError(form, "Details must be 500 characters or less.");
    return;
  }
  
  btn.disabled = true;
  btn.setAttribute("data-original", btn.textContent);
  btn.textContent = "Sending…";
  
  try {
    await submitReport({ appId: form.dataset.appId, appName: form.dataset.appName, reason, details });
    showFormSuccess(form, "Report submitted. Thank you!");
    setTimeout(() => closeModal("report-modal"), 2000);
  } catch (err) {
    showFormError(form, err.message || "Could not send. Is the server running?");
  } finally {
    btn.disabled = false;
    btn.textContent = btn.getAttribute("data-original") || "Submit Report";
  }
}

// ── Submit App modal ──────────────────────────────────────────────────────────
function openSubmitModal() {
  const modal = document.getElementById("submit-modal");
  document.getElementById("submit-form").reset();
  clearFormMsg(document.getElementById("submit-form"));
  modal.classList.add("open");
}

async function handleSubmitApp(e) {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector(".btn-submit");
  const platforms = [...form.querySelectorAll("input[name='platforms']:checked")].map(el => el.value);
  
  // Validate platforms
  if (!platforms.length) {
    showFormError(form, "Select at least one platform.");
    return;
  }

  const name = form.querySelector("#sub-name").value.trim();
  const description = form.querySelector("#sub-description").value.trim();
  const uses = form.querySelector("#sub-uses").value.trim();
  
  // Validate field lengths
  if (name.length < 2 || name.length > 100) {
    showFormError(form, "App name must be 2-100 characters.");
    return;
  }
  if (description.length < 10 || description.length > 300) {
    showFormError(form, "Description must be 10-300 characters.");
    return;
  }
  if (uses.length < 10 || uses.length > 300) {
    showFormError(form, "Uses field must be 10-300 characters.");
    return;
  }

  const payload = {
    name,
    logo:           form.querySelector("#sub-logo").value.trim(),
    category:       form.querySelector("#sub-category").value,
    description,
    uses,
    alternative:    form.querySelector("#sub-alternative").value.trim(),
    download:       form.querySelector("#sub-download").value.trim(),
    source:         form.querySelector("#sub-source").value.trim(),
    maintainer:     form.querySelector("#sub-maintainer").value,
    platforms,
    submitterEmail: form.querySelector("#sub-email").value.trim(),
  };

  btn.disabled = true;
  btn.setAttribute("data-original", btn.textContent);
  btn.textContent = "Submitting…";
  
  try {
    await submitApp(payload);
    showFormSuccess(form, "App submitted for review! We'll check it shortly.");
    setTimeout(() => closeModal("submit-modal"), 2500);
  } catch (err) {
    showFormError(form, err.message || "Submission failed. Is the server running?");
  } finally {
    btn.disabled = false;
    btn.textContent = btn.getAttribute("data-original") || "Submit App";
  }
}

// ── Modal utilities ───────────────────────────────────────────────────────────
function closeModal(id) { document.getElementById(id)?.classList.remove("open"); }
function showFormError(form, msg)   { setMsg(form, msg, "error");   }
function showFormSuccess(form, msg) { setMsg(form, msg, "success"); }
function clearFormMsg(form)         { setMsg(form, "", "");         }
function setMsg(form, text, cls) {
  const el = form.querySelector(".form-msg");
  if (!el) return;
  el.textContent = text;
  el.className   = cls ? `form-msg ${cls}` : "form-msg";
}

// ── Theme ─────────────────────────────────────────────────────────────────────
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

// ── Toast ─────────────────────────────────────────────────────────────────────
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

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  initTheme();
  buildFilters();
  renderGrid(apps);
  
  await fetchAllRatings();
  renderGrid(getFiltered());

  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
  document.getElementById("search-input").addEventListener("input", debounce(() => renderGrid(getFiltered()), 180));
  document.getElementById("submit-app-btn").addEventListener("click", openSubmitModal);
  document.getElementById("report-form").addEventListener("submit", handleReportSubmit);
  document.getElementById("submit-form").addEventListener("submit", handleSubmitApp);

  document.getElementById("app-grid").addEventListener("click", e => {
    handleStarClick(e);
    const rb = e.target.closest(".report-btn");
    if (rb) openReportModal(rb.dataset.appId, rb.dataset.appName);
  });

  // Modal interactions
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", e => {
      if (e.target === overlay || e.target.closest(".modal-close")) {
        overlay.classList.remove("open");
      }
    });
    
    // Trap focus inside modal when open
    overlay.addEventListener("keydown", e => {
      if (e.key !== "Tab") return;
      const modal = overlay.querySelector(".modal");
      if (!modal) return;
      
      const focusables = modal.querySelectorAll(
        "a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      if (!focusables.length) return;
      
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  });

  // Global keyboard shortcuts
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.open").forEach(m => m.classList.remove("open"));
    }
    // Alt+S to open submit modal
    if (e.altKey && e.key === "s") {
      e.preventDefault();
      openSubmitModal();
    }
    // Alt+F to focus search
    if (e.altKey && e.key === "f") {
      e.preventDefault();
      document.getElementById("search-input").focus();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);

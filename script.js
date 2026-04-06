// ── Firebase Imports ─────────────────────────────────────────────────────────
import {
  signInWithGoogle, signInWithGitHub, signOutUser, getCurrentUser, onUserAuthStateChanged,
  getPendingLinkData, clearPendingLinkData, linkProviderToCurrentUser, getLinkedProviders,
  submitReportToFirestore,
  submitAppToFirestore, getAllAppsFromFirestore,
  getAppFromFirestore, incrementAppViews, toggleVote, getUserVote,
  submitEditRequest, getEditRequestsForApp, getUserEditRequests,
  uploadLogoToStorage
} from './firebase-config.js';

import { checkForUpdates } from './version-check.js';

import {
  createOrUpdateUserRecord, getUserRecord, updateUserProfile, updateUserRole,
  setAccountVerified, setTeamAccount, getAllUsers,
  createOrganization, getOrganization, updateOrganization, addOrgMember,
  removeOrgMember, transferOwnership, transferToCorporation, getUserOrganizations, getAllOrganizations,
  submitAppWithOwner, getAppsByOwner, transferAppOwnership,
  getAppVersions, restoreAppVersion,
  addReviewComment, getReviewComments, approveEditRequest, mergeEditRequest, rejectEditRequest,
  computeRecommendations, trackActivity,
  isAdminOrTeam, adminAddApp, adminUpdateApp, adminRemoveApp,
  getAllPendingSubmissions, getAllEditRequests, approveSubmission, rejectSubmission,
  requestChangesOnSubmission,
  getAllSubmissions, getSubmission, getUserSubmissions, updateSubmission, getSubmissionComments, addSubmissionComment,
  followUser, unfollowUser, isFollowing,
  addAppReview, getAppReviews, markReviewHelpful, getUserReviewForApp, toggleReviewVote, getUserReviewVote,
  toggleBookmark, isBookmarked, getUserBookmarks,
  trackDownload,
  submitOwnershipClaim,
  resolveContributorProfile, getOfficialProfile, isOfficialApp,
  getTeamMembers, getOpenLibConfig, updateOpenLibConfig,
  getTeamMemberPermissions, updateTeamMemberPermissions,
  addTeamMember, removeTeamMember, getTeamStats,
  getAllReports, getReport, updateReportStatus,
  logModerationAction, getModerationLog,
  setAppModerationStatus, restoreExpiredSuspensions, getReportStats
} from './firebase-db.js';

// ── State ────────────────────────────────────────────────────────────────────
let currentUser = null;
let userRecord = null;
let isAdmin = false;
let apps = [];


// [VULN-10 FIX] Seed data removed from production bundle.
// Use a separate seed script with firebase-admin SDK for development:
//   node seed.js

// ── Security: HTML escaping ──────────────────────────────────────────────────
function esc(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(String(str ?? "")));
  return div.innerHTML;
}

// URL-safe escaping for src/href attributes — preserves & but prevents attribute breakout
function escUrl(str) {
  const s = String(str ?? "");
  return s.replace(/"/g, "%22").replace(/'/g, "%27").replace(/</g, "%3C").replace(/>/g, "%3E");
}

// ── [VULN-14R FIX] Modal-based input prompt (replaces browser prompt()) ──────
function showInputModal(title, placeholder = "Enter your response…") {
  return new Promise((resolve) => {
    const modal = document.getElementById("input-prompt-modal");
    if (!modal) { resolve(null); return; }

    const titleEl = modal.querySelector("#input-prompt-title");
    const labelEl = modal.querySelector("#input-prompt-label");
    const field = modal.querySelector("#input-prompt-field");
    const submitBtn = modal.querySelector("#input-prompt-submit");
    const cancelBtn = modal.querySelector("#input-prompt-cancel");

    titleEl.textContent = title;
    labelEl.textContent = title;
    field.value = "";
    field.placeholder = placeholder;
    modal.classList.add("open");
    field.focus();

    function cleanup() {
      modal.classList.remove("open");
      submitBtn.removeEventListener("click", onSubmit);
      cancelBtn.removeEventListener("click", onCancel);
      modal.querySelector(".modal-close").removeEventListener("click", onCancel);
      field.removeEventListener("keydown", onKeydown);
    }
    function onSubmit() {
      const val = field.value.trim();
      if (!val) return;
      cleanup();
      resolve(val.slice(0, 1000));
    }
    function onCancel() {
      cleanup();
      resolve(null);
    }
    function onKeydown(e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); }
      if (e.key === "Escape") onCancel();
    }

    submitBtn.addEventListener("click", onSubmit);
    cancelBtn.addEventListener("click", onCancel);
    modal.querySelector(".modal-close").addEventListener("click", onCancel);
    field.addEventListener("keydown", onKeydown);
  });
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

// [VULN-10 FIX] Seed function removed from client bundle.
// Use a separate seed script: node seed.js

// ── Ranking Calculator ───────────────────────────────────────────────────────
function calcRankScore(app) {
  const likes = app.likes || 0;
  const dislikes = app.dislikes || 0;
  const views = app.views || 0;
  return (likes * 2) - (dislikes) + (views * 0.05);
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

function addedByBadge(addedBy) {
  // Synchronous card-level badge — uses isOfficialApp for fast rendering
  if (!addedBy || addedBy.type === "openlib-team" || addedBy.role === "admin") {
    return `<a href="/team" class="added-by-badge team added-by-link" title="Curated by the OpenLib team">
      <span class="added-by-avatar-mini official-avatar-mini">OL</span> OpenLib (Official)
    </a>`;
  }
  const name = esc(addedBy.name || "Anonymous");
  const profileLink = addedBy.uid ? `href="/profile/${esc(addedBy.uid)}"` : "";
  const avatarMini = addedBy.photoURL
    ? `<img class="added-by-avatar-mini" src="${escUrl(addedBy.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="added-by-avatar-mini">${esc((addedBy.name || "A").charAt(0))}</span>`;
  return `<a ${profileLink} class="added-by-badge user added-by-link" title="Added by ${name}">
    ${avatarMini} ${name}
  </a>`;
}

// ── Comparison Editor Helpers ────────────────────────────────────────────────
function compCellHtml(val, colIdx) {
  let selType, textVal = "";
  if (val === true) selType = "true";
  else if (val === false) selType = "false";
  else if (val == null) selType = "dash";
  else if (typeof val === "string" && val.startsWith("@")) selType = val;
  else { selType = "text"; textVal = val; }
  const isBinding = typeof selType === "string" && selType.startsWith("@");
  return `<div class="comp-cell" data-col="${colIdx}">
    <select class="comp-cell-type">
      <option value="true" ${selType === "true" ? "selected" : ""}>✔ Yes</option>
      <option value="false" ${selType === "false" ? "selected" : ""}>✖ No</option>
      <option value="dash" ${selType === "dash" ? "selected" : ""}>— N/A</option>
      <option value="text" ${selType === "text" ? "selected" : ""}>Text…</option>
      <optgroup label="Auto (from app data)">
        <option value="@license" ${selType === "@license" ? "selected" : ""}>📄 License</option>
        <option value="@platforms" ${selType === "@platforms" ? "selected" : ""}>💻 Platforms</option>
        <option value="@cross-platform" ${selType === "@cross-platform" ? "selected" : ""}>🌐 Cross-Platform?</option>
        <option value="@version" ${selType === "@version" ? "selected" : ""}>📦 Version</option>
        <option value="@source" ${selType === "@source" ? "selected" : ""}>🔗 Has Source?</option>
      </optgroup>
    </select>
    <input type="text" class="comp-cell-text" value="${esc(textVal)}" placeholder="Value" style="${selType === "text" ? "" : "display:none"}">
  </div>`;
}

function compRowHtml(row, colCount) {
  let cells = "";
  for (let c = 0; c < colCount; c++) cells += compCellHtml(row?.values?.[c] ?? null, c);
  return `<div class="comp-row">
    <input type="text" class="comp-feature-input" value="${esc(row?.feature || "")}" placeholder="Feature name">
    <div class="comp-row-cells">${cells}</div>
    <div class="comp-row-actions">
      <button type="button" class="btn btn-xs comp-row-up" title="Move up">↑</button>
      <button type="button" class="btn btn-xs comp-row-down" title="Move down">↓</button>
      <button type="button" class="btn btn-xs btn-danger comp-row-remove" title="Remove row">✕</button>
    </div>
  </div>`;
}

function initComparisonEditor(container, data) {
  const cols = data?.columns?.length ? data.columns : [];
  const rows = data?.rows || [];
  container.innerHTML = `
    <div class="comp-editor">
      <div class="comp-editor-cols">
        <span class="comp-editor-label">Column Labels</span>
        <div class="comp-col-inputs">
          ${cols.map((c, i) => `<div class="comp-col-entry">
            <input type="text" class="comp-col-input" value="${esc(c)}" placeholder="App name" data-col="${i}">
            ${i >= 2 ? `<button type="button" class="btn btn-xs btn-danger comp-remove-col" data-col="${i}" title="Remove column">✕</button>` : ""}
          </div>`).join("")}
        </div>
        <button type="button" class="btn btn-sm btn-secondary comp-add-col">+ Column</button>
      </div>
      <div class="comp-editor-rows">${rows.map(r => compRowHtml(r, cols.length)).join("")}</div>
      <button type="button" class="btn btn-sm btn-secondary comp-add-row">+ Feature Row</button>
    </div>`;
  attachCompEditorEvents(container);
}

function attachCompEditorEvents(ct) {
  ct.addEventListener("change", e => {
    if (e.target.classList.contains("comp-cell-type")) {
      const ti = e.target.parentElement.querySelector(".comp-cell-text");
      ti.style.display = e.target.value === "text" ? "" : "none";
    }
  });
  ct.addEventListener("click", e => {
    const t = e.target;
    if (t.classList.contains("comp-add-col")) {
      const colsBox = ct.querySelector(".comp-col-inputs");
      const n = colsBox.querySelectorAll(".comp-col-input").length;
      const d = document.createElement("div"); d.className = "comp-col-entry";
      d.innerHTML = `<input type="text" class="comp-col-input" value="" placeholder="App name" data-col="${n}">
        <button type="button" class="btn btn-xs btn-danger comp-remove-col" data-col="${n}" title="Remove column">✕</button>`;
      colsBox.appendChild(d);
      ct.querySelectorAll(".comp-row").forEach(row => {
        row.querySelector(".comp-row-cells").insertAdjacentHTML("beforeend", compCellHtml(null, n));
      });
    }
    if (t.classList.contains("comp-remove-col")) {
      const ci = parseInt(t.dataset.col);
      t.parentElement.remove();
      ct.querySelectorAll(`.comp-cell[data-col="${ci}"]`).forEach(c => c.remove());
      reindexCompCols(ct);
    }
    if (t.classList.contains("comp-add-row")) {
      const n = ct.querySelectorAll(".comp-col-input").length;
      ct.querySelector(".comp-editor-rows").insertAdjacentHTML("beforeend", compRowHtml(null, n));
    }
    if (t.classList.contains("comp-row-remove")) t.closest(".comp-row").remove();
    if (t.classList.contains("comp-row-up")) {
      const row = t.closest(".comp-row"), prev = row.previousElementSibling;
      if (prev) row.parentElement.insertBefore(row, prev);
    }
    if (t.classList.contains("comp-row-down")) {
      const row = t.closest(".comp-row"), next = row.nextElementSibling;
      if (next) row.parentElement.insertBefore(next, row);
    }
  });
}

function reindexCompCols(ct) {
  ct.querySelectorAll(".comp-col-entry").forEach((e, i) => {
    const inp = e.querySelector(".comp-col-input"); if (inp) inp.dataset.col = i;
    const btn = e.querySelector(".comp-remove-col"); if (btn) btn.dataset.col = i;
  });
  ct.querySelectorAll(".comp-row").forEach(row => {
    row.querySelectorAll(".comp-cell").forEach((c, i) => { c.dataset.col = i; });
  });
}

function getComparisonData(container) {
  const colInputs = container.querySelectorAll(".comp-col-input");
  if (!colInputs.length) return null;
  const columns = [...colInputs].map(i => i.value.trim());
  if (columns.every(c => !c)) return null;
  const rows = [];
  container.querySelectorAll(".comp-row").forEach(rowEl => {
    const feature = rowEl.querySelector(".comp-feature-input").value.trim();
    const values = [];
    rowEl.querySelectorAll(".comp-cell").forEach(cell => {
      const tp = cell.querySelector(".comp-cell-type").value;
      if (tp === "true") values.push(true);
      else if (tp === "false") values.push(false);
      else if (tp === "dash") values.push(null);
      else if (tp.startsWith("@")) values.push(tp);
      else values.push(cell.querySelector(".comp-cell-text").value.trim() || null);
    });
    if (feature) rows.push({ feature, values });
  });
  return rows.length ? { columns, rows } : null;
}

function validateComparisonEditor(container) {
  const features = [];
  let error = null;
  container.querySelectorAll(".comp-row").forEach(rowEl => {
    const f = rowEl.querySelector(".comp-feature-input").value.trim();
    if (!f) { error = "Comparison: feature name cannot be empty."; return; }
    if (features.includes(f.toLowerCase())) { error = `Comparison: duplicate feature "${f}".`; return; }
    features.push(f.toLowerCase());
  });
  return error;
}

// Resolve dynamic tokens in comparison cell values — binds to live app metadata
const COMP_BINDINGS = {
  "@license": app => app.license || "Open Source",
  "@platforms": app => (app.platforms || []).join(", ") || "—",
  "@cross-platform": app => (app.platforms || []).length > 1,
  "@source": app => app.source ? "✔" : "—",
  "@version": app => app.version || "—"
};

function resolveCompValue(val, app) {
  if (typeof val === "string" && val.startsWith("@") && COMP_BINDINGS[val]) return COMP_BINDINGS[val](app);
  return val;
}

function renderComparisonHtml(app) {
  if (app.comparisonData?.columns?.length && app.comparisonData?.rows?.length) {
    const { columns, rows } = app.comparisonData;
    const hdr = columns.map(c => `<th>${esc(c)}</th>`).join("");
    const body = rows.map(r => {
      const cells = (r.values || []).map(raw => {
        const v = resolveCompValue(raw, app);
        if (v === true) return '<td class="comp-yes">✔</td>';
        if (v === false) return '<td class="comp-no">✖</td>';
        if (v == null) return '<td class="comp-na">—</td>';
        return `<td>${esc(String(v))}</td>`;
      }).join("");
      return `<tr><td>${esc(r.feature)}</td>${cells}</tr>`;
    }).join("");
    return `<div class="detail-section"><h3>Comparison</h3>
      <table class="comparison-table"><thead><tr><th>Feature</th>${hdr}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  if (!app.alternative) return "";
  return `<div class="detail-section"><h3>Comparison</h3>
    <table class="comparison-table">
      <thead><tr><th>Feature</th><th>${esc(app.name)}</th><th>${esc(app.alternative)}</th></tr></thead>
      <tbody>
        <tr><td>Free</td><td class="comp-yes">✅</td><td class="comp-no">❌</td></tr>
        <tr><td>Open Source</td><td class="comp-yes">✅</td><td class="comp-no">❌</td></tr>
        <tr><td>Cross-Platform</td><td class="comp-yes">${(app.platforms || []).length > 1 ? "✅" : "—"}</td><td>—</td></tr>
        <tr><td>License</td><td>${esc(app.license || "Open Source")}</td><td>Proprietary</td></tr>
      </tbody>
    </table></div>`;
}

function buildCard(app) {
  const rank = getAppRank(app.id);
  const plates = (app.platforms || []).map(p => `<span class="platform-tag">${platformIcon(p)} ${esc(p)}</span>`).join("");
  const logoHtml = app.logo
    ? `<img class="app-logo" src="${escUrl(app.logo)}" alt="${esc(app.name)} logo" data-app-id="${esc(app.id)}">`
    : `<div class="app-logo-fallback">${esc(app.name.charAt(0))}</div>`;
  const tags = (app.tags || []).slice(0, 3);
  const tagsHtml = tags.length ? `<div class="card-tags">${tags.map(t => `<span class="card-tag">${esc(t)}</span>`).join("")}</div>` : "";

  return `
    <article class="app-card" data-id="${esc(app.id)}" data-category="${esc(app.category)}" role="listitem">
      <div class="card-top">
        ${rank ? `<span class="rank-badge">#${rank}</span>` : ""}
        ${logoHtml}
        <div class="app-header-text">
          <a class="app-name app-link" href="/app/${esc(app.id)}">${esc(app.name)}</a>
          <span class="app-category">${esc(app.category)}</span>
        </div>
        <span class="maintainer-badge" data-type="${esc(app.maintainer)}">${esc(app.maintainer)}</span>
      </div>
      <p class="app-description">${esc(app.description)}</p>
      ${app.version || app.license ? `<div class="card-meta-pills">${app.version ? `<span class="card-pill">${esc(app.version)}</span>` : ""}${app.license ? `<span class="card-pill">${esc(app.license)}</span>` : ""}</div>` : ""}
      ${tagsHtml}
      <div class="app-stats-row">
        <span class="stat-item" title="Views">👁 ${app.views || 0}</span>
        <span class="stat-item like-stat" title="Likes">👍 ${app.likes || 0}</span>
        <span class="stat-item dislike-stat" title="Dislikes">👎 ${app.dislikes || 0}</span>
        <span class="stat-item" title="Downloads">⬇ ${app.downloads || 0}</span>
        <span class="stat-item">${addedByBadge(app.addedBy)}</span>
      </div>
      <div class="platforms-row">${plates}</div>
      <div class="card-footer">
        <button class="card-bookmark-btn" data-app-id="${esc(app.id)}" title="Save app">☆</button>
        <button class="report-btn" data-app-id="${esc(app.id)}" data-app-name="${esc(app.name)}"
          title="Report this app" aria-label="Report ${esc(app.name)}">⚑</button>
      </div>
      <div class="card-actions">
        <a href="${esc(app.download)}" class="btn btn-primary" target="_blank" rel="noopener" data-app-id="${esc(app.id)}" data-app-name="${esc(app.name)}">⬇ Download</a>
        <a href="${esc(app.source)}" class="btn btn-secondary" target="_blank" rel="noopener" data-app-id="${esc(app.id)}" data-app-name="${esc(app.name)}">&lt;/&gt; Source</a>
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
    // Hide restricted/removed apps from public view (admins still see them in admin panel)
    const modStatus = app.moderationStatus || "active";
    if (modStatus !== "active" && !isAdmin) return false;
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
  const views = ["home-view", "rankings-view", "profile-view", "org-view", "admin-view", "verify-view", "team-view", "team-manage-view"];
  views.forEach(v => { const el = document.getElementById(v); if (el) el.style.display = "none"; });
  const detailView = document.getElementById("detail-view");
  detailView.style.display = "block";

  detailView.innerHTML = `<div class="detail-loading">Loading app details…</div>`;

  let app = apps.find(a => a.id === appId);
  if (!app) {
    app = await getAppFromFirestore(appId);
  }
  if (!app) {
    detailView.innerHTML = `<div class="empty-state"><h3>App not found</h3><p><a href="/">← Back to library</a></p></div>`;
    return;
  }

  // Increment views (throttled: 1 per user per app per hour)
  const viewUserId = currentUser ? currentUser.uid : null;
  const newViews = await incrementAppViews(appId, viewUserId);
  app.views = newViews;
  const localIdx = apps.findIndex(a => a.id === appId);
  if (localIdx >= 0) apps[localIdx].views = newViews;

  // Get user vote if logged in
  let userVote = null;
  let bookmarked = false;
  if (currentUser) {
    try {
      userVote = await getUserVote(appId, currentUser.uid);
      bookmarked = await isBookmarked(currentUser.uid, appId);
    } catch (err) {
      console.warn("Error loading user data for detail page:", err);
    }
  }

  const rank = getAppRank(appId);
  const prevRank = getAppPreviousRank(appId);
  const rankMovement = prevRank ? prevRank - rank : 0;
  const plates = (app.platforms || []).map(p => `<span class="platform-tag">${platformIcon(p)} ${esc(p)}</span>`).join("");
  const logoHtml = app.logo
    ? `<img class="detail-logo" src="${escUrl(app.logo)}" alt="${esc(app.name)} logo" onerror="this.style.display='none'">`
    : `<div class="detail-logo-fallback">${esc(app.name.charAt(0))}</div>`;

  // Generate tags HTML
  const tags = app.tags || [];
  const tagsHtml = tags.length ? tags.map(t => `<a href="/" class="detail-tag" data-tag="${esc(t)}">${esc(t)}</a>`).join("") : "";

  // Screenshots gallery
  const screenshots = app.screenshots || [];
  const screenshotsHtml = screenshots.length ? `
    <div class="detail-section">
      <h3>Screenshots</h3>
      <div class="screenshots-gallery">
        ${screenshots.map((url, i) => `<img class="screenshot-thumb" src="${escUrl(url)}" alt="Screenshot ${i+1}" data-full="${escUrl(url)}" loading="lazy">`).join("")}
      </div>
    </div>` : "";

  // Features list
  const features = app.features || [];
  const featuresHtml = features.length ? `
    <div class="detail-section">
      <h3>Key Features</h3>
      <ul class="features-list">
        ${features.map(f => `<li>${esc(f)}</li>`).join("")}
      </ul>
    </div>` : "";

  // Full description (expandable) — combines short + full description
  const fullDesc = app.fullDescription || "";
  const expandableDescHtml = fullDesc ? `
    <div class="detail-section expandable-desc">
      <h3>About</h3>
      <div class="desc-content collapsed" id="full-desc-content">${esc(fullDesc)}</div>
      <button class="desc-toggle-btn" id="desc-toggle">Show more ▼</button>
    </div>` : "";

  // Installation methods
  const installs = app.installMethods || [];
  const installHtml = installs.length ? `
    <div class="detail-section">
      <h3>Installation Methods</h3>
      <div class="install-methods">
        ${installs.map(m => `
          <div class="install-method">
            <span class="install-label">${esc(m.label)}</span>
            <code class="install-cmd">${esc(m.command)}</code>
            <button class="copy-cmd-btn" data-cmd="${esc(m.command)}" title="Copy">📋</button>
          </div>
        `).join("")}
      </div>
    </div>` : "";

  // System requirements
  const sysreq = app.systemRequirements || "";
  const sysreqHtml = sysreq ? `
    <div class="detail-section">
      <h3>System Requirements</h3>
      <pre class="sysreq-block">${esc(sysreq)}</pre>
    </div>` : "";

  // Comparison table (dynamic or legacy fallback)
  const comparisonHtml = renderComparisonHtml(app);

  // Security badges
  const isOfficialEntry = isOfficialApp(app);
  const securityHtml = `
    <div class="detail-section security-badges">
      <h3>Security & Trust</h3>
      <div class="trust-badges">
        ${app.source ? '<span class="trust-badge trust-verified">✅ Open Source Verified</span>' : ''}
        ${isOfficialEntry ? '<span class="trust-badge trust-team">🛡️ OpenLib Reviewed</span>' : ''}
        <span class="trust-badge trust-source">🔗 ${app.source?.includes("github.com") ? "GitHub" : app.source?.includes("gitlab") ? "GitLab" : app.source?.includes("bitbucket") ? "Bitbucket" : app.source?.includes("codeberg") ? "Codeberg" : app.source?.includes("sourceforge") ? "SourceForge" : "Official"} Source</span>
      </div>
    </div>`;

  // Changelog / Version info
  const versionInfoHtml = `
    <div class="detail-meta-bar">
      ${app.version ? `<span class="meta-pill">📦 ${esc(app.version)}</span>` : ""}
      ${app.license ? `<span class="meta-pill">📄 ${esc(app.license)}</span>` : ""}
      ${app.fileSize ? `<span class="meta-pill">💾 ${esc(app.fileSize)}</span>` : ""}
      ${app.updatedAt ? `<span class="meta-pill">🕐 Updated ${new Date(app.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>` : ""}
      ${app.developer ? `<span class="meta-pill dev-pill">${app.developerUrl ? `<a href="${esc(app.developerUrl)}" target="_blank" rel="noopener">` : ""}👤 ${esc(app.developer)}${app.developerUrl ? "</a>" : ""}</span>` : ""}
    </div>`;

  // Share button data
  const shareUrl = `${location.origin}/app/${encodeURIComponent(appId)}`;

  // Similar apps
  const similarApps = getSimilarApps(app);
  const similarHtml = similarApps.length ? `
    <div class="detail-section similar-section">
      <h3>You May Also Like</h3>
      <div class="similar-grid">
        ${similarApps.map(sa => {
          const saLogo = sa.logo
            ? `<img class="similar-logo" src="${escUrl(sa.logo)}" alt="" onerror="this.style.display='none'">`
            : `<div class="similar-logo-fallback">${esc(sa.name.charAt(0))}</div>`;
          return `
            <a href="/app/${esc(sa.id)}" class="similar-card">
              ${saLogo}
              <div class="similar-info">
                <span class="similar-name">${esc(sa.name)}</span>
                <span class="similar-cat">${esc(sa.category)}</span>
              </div>
              <span class="similar-likes">👍 ${sa.likes || 0}</span>
            </a>`;
        }).join("")}
      </div>
    </div>` : "";

  // Resolve contributor profile — uses role-based attribution system
  let creatorHtml = "";
  const contributor = await resolveContributorProfile(app);

  if (contributor.displayType === "official") {
    creatorHtml = `
      <div class="detail-section creator-section">
        <h3>Added By</h3>
        <a href="${esc(contributor.profileLink || '/')}" class="creator-card openlib-creator-card">
          <div class="creator-card-avatar-fallback openlib-avatar">${esc(contributor.avatarText)}</div>
          <div class="creator-card-info">
            <span class="creator-card-name">${esc(contributor.displayName)} <span class="badge badge-role badge-admin">${esc(contributor.badge)}</span></span>
            <span class="creator-card-bio">${esc(contributor.bio)}</span>
          </div>
        </a>
      </div>`;
  } else if (contributor.displayType === "organization") {
    const orgAvatar = contributor.avatarURL
      ? `<img class="creator-card-avatar" src="${escUrl(contributor.avatarURL)}" alt="" referrerpolicy="no-referrer">`
      : `<div class="creator-card-avatar-fallback">${esc(contributor.avatarText)}</div>`;
    creatorHtml = `
      <div class="detail-section creator-section">
        <h3>Added By</h3>
        <a href="${esc(contributor.profileLink)}" class="creator-card">
          ${orgAvatar}
          <div class="creator-card-info">
            <span class="creator-card-name">${esc(contributor.displayName)} ${contributor.verified ? '<span class="badge badge-verified" title="Verified">✓ Verified</span>' : ""}</span>
            ${contributor.bio ? `<span class="creator-card-bio">${esc(contributor.bio)}</span>` : ""}
          </div>
        </a>
      </div>`;
  } else if (contributor.displayType === "user") {
    const creatorAvatar = contributor.avatarURL
      ? `<img class="creator-card-avatar" src="${escUrl(contributor.avatarURL)}" alt="" referrerpolicy="no-referrer">`
      : `<div class="creator-card-avatar-fallback">${esc(contributor.avatarText)}</div>`;
    const profileTag = contributor.profileLink ? "a" : "div";
    const profileAttr = contributor.profileLink ? `href="${esc(contributor.profileLink)}"` : "";
    creatorHtml = `
      <div class="detail-section creator-section">
        <h3>Added By</h3>
        <${profileTag} ${profileAttr} class="creator-card">
          ${creatorAvatar}
          <div class="creator-card-info">
            <span class="creator-card-name">${esc(contributor.displayName)} ${contributor.teamAccount ? '<span class="badge badge-team" title="Team Account">⚡ Team</span>' : ""} ${contributor.verified ? '<span class="badge badge-verified" title="Verified">✓ Verified</span>' : ""} ${roleBadge(contributor.role)}</span>
            ${contributor.bio ? `<span class="creator-card-bio">${esc(contributor.bio)}</span>` : ""}
            ${contributor.createdAt ? `<span class="creator-card-joined">Joined ${new Date(contributor.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>` : ""}
          </div>
        </${profileTag}>
      </div>`;
  }

  // Claim ownership section — show for logged-in users who don't already own the app
  const showClaimOwnership = currentUser && !app.ownerId && app.addedBy?.uid !== currentUser?.uid;
  const claimHtml = showClaimOwnership ? `
    <div class="detail-section claim-section">
      <h3>Is this your app?</h3>
      <p class="claim-description">If you are the developer or maintainer of ${esc(app.name)}, you can claim ownership to manage its listing.</p>
      <button class="btn btn-claim-ownership" id="claim-ownership-btn" data-app-id="${esc(appId)}">🔑 Claim App Ownership</button>
    </div>` : "";

  // Check if current user can edit (owner, admin, or openlib team)
  const canEdit = currentUser && (
    app.addedBy?.uid === currentUser.uid ||
    app.ownerId === currentUser.uid ||
    isAdmin
  );

  // Moderation status banner
  const modStatus = app.moderationStatus || "active";
  const modBannerHtml = modStatus !== "active" ? `
    <div class="mod-banner mod-banner-${esc(modStatus)}">
      <span class="mod-banner-icon">${modStatus === "restricted" ? "⚠️" : "🚫"}</span>
      <div class="mod-banner-text">
        <strong>This app is currently ${modStatus === "restricted" ? "restricted" : "removed"}.</strong>
        ${app.moderationReason ? `<span>${esc(app.moderationReason)}</span>` : ""}
        ${app.suspendUntil ? `<span>Suspension expires: ${new Date(app.suspendUntil).toLocaleDateString()}</span>` : ""}
      </div>
    </div>` : "";

  detailView.innerHTML = `
    <div class="detail-page">
      <a href="/" class="back-link">← Back to library</a>
      ${modBannerHtml}
      <div class="detail-header">
        ${logoHtml}
        <div class="detail-header-text">
          <h1 class="detail-name">${esc(app.name)} ${rank ? `<span class="rank-badge rank-lg">#${rank}</span>` : ""} ${rankMovement > 0 ? `<span class="rank-move rank-up">↑${rankMovement}</span>` : rankMovement < 0 ? `<span class="rank-move rank-down">↓${Math.abs(rankMovement)}</span>` : ""}</h1>
          <span class="app-category">${esc(app.category)}</span>
          <span class="maintainer-badge" data-type="${esc(app.maintainer)}">${esc(app.maintainer)}</span>
          ${addedByBadge(app.addedBy)}
        </div>
        <div class="detail-header-actions">
          <button class="bookmark-btn ${bookmarked ? 'bookmarked' : ''}" id="bookmark-btn" data-app-id="${esc(appId)}" title="${bookmarked ? 'Remove bookmark' : 'Save app'}">
            ${bookmarked ? '★' : '☆'}
          </button>
          <div class="share-dropdown-wrap">
            <button class="share-btn" id="share-btn" title="Share">🔗 Share</button>
            <div class="share-dropdown" id="share-dropdown">
              <button class="share-option" data-action="copy" data-url="${esc(shareUrl)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy Link</button>
              <a class="share-option" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(app.name + ' — Open source alternative to ' + (app.alternative || '') + '. Check it out on OpenLib!')}&url=${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener"><img class="share-icon" src="https://upload.wikimedia.org/wikipedia/commons/c/ce/X_logo_2023.svg" alt="X"> X (Twitter)</a>
              <a class="share-option" href="https://wa.me/?text=${encodeURIComponent(app.name + ' — ' + shareUrl)}" target="_blank" rel="noopener"><img class="share-icon" src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp"> WhatsApp</a>
              <a class="share-option" href="https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(app.name + ' — Open Source Alternative to ' + (app.alternative || ''))}" target="_blank" rel="noopener"><img class="share-icon" src="https://upload.wikimedia.org/wikipedia/commons/b/b4/Reddit_logo.svg" alt="Reddit"> Reddit</a>
            </div>
          </div>
        </div>
      </div>

      ${tagsHtml ? `<div class="detail-tags">${tagsHtml}</div>` : ""}

      <div class="detail-body">
        ${expandableDescHtml || `<div class="detail-section"><h3>About</h3><p>${esc(app.description)}</p></div>`}

        ${featuresHtml}
        ${screenshotsHtml}

        <div class="detail-info-grid">
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
        </div>

        ${comparisonHtml}
        ${installHtml}
        ${sysreqHtml}
        ${securityHtml}

        <div class="detail-stats-actions">
          <div class="detail-stats">
            <div class="detail-stat-card"><span class="stat-number">${app.views || 0}</span><span class="stat-label">Views</span></div>
            <div class="detail-stat-card"><span class="stat-number">${app.likes || 0}</span><span class="stat-label">Likes</span></div>
            <div class="detail-stat-card"><span class="stat-number">${app.dislikes || 0}</span><span class="stat-label">Dislikes</span></div>
            <div class="detail-stat-card"><span class="stat-number">${app.downloads || 0}</span><span class="stat-label">Downloads</span></div>
          </div>

          <div class="detail-actions-row">
            <div class="vote-buttons">
              <button class="vote-btn like-btn ${userVote === 'like' ? 'active' : ''}" data-app-id="${esc(appId)}" data-vote="like">
                👍 Like <span class="vote-count" id="like-count-${esc(appId)}">${app.likes || 0}</span>
              </button>
              <button class="vote-btn dislike-btn ${userVote === 'dislike' ? 'active' : ''}" data-app-id="${esc(appId)}" data-vote="dislike">
                👎 Dislike <span class="vote-count" id="dislike-count-${esc(appId)}">${app.dislikes || 0}</span>
              </button>
            </div>
            <div class="detail-links">
              <a href="${esc(app.download)}" class="btn btn-primary btn-lg download-track-link" target="_blank" rel="noopener" data-app-id="${esc(appId)}" data-app-name="${esc(app.name)}">⬇ Download</a>
              ${app.website ? `<a href="${esc(app.website)}" class="btn btn-secondary btn-lg" target="_blank" rel="noopener">🌐 Website</a>` : ""}
              <a href="${esc(app.source)}" class="btn btn-secondary btn-lg" target="_blank" rel="noopener" data-app-id="${esc(appId)}" data-app-name="${esc(app.name)}">&lt;/&gt; ${app.source?.includes("github.com") ? "GitHub" : app.source?.includes("gitlab") ? "GitLab" : app.source?.includes("bitbucket") ? "Bitbucket" : app.source?.includes("codeberg") ? "Codeberg" : app.source?.includes("sourceforge") ? "SourceForge" : "Source Code"}</a>
              ${app.docs ? `<a href="${esc(app.docs)}" class="btn btn-secondary btn-lg" target="_blank" rel="noopener">📖 Docs</a>` : ""}
            </div>
          </div>
        </div>

        <div class="detail-secondary-actions">
            <button class="report-btn detail-report" data-app-id="${esc(appId)}" data-app-name="${esc(app.name)}">⚑ Report this app</button>
            <button class="btn btn-direct-edit" data-app-id="${esc(appId)}" data-app-name="${esc(app.name)}">✏️ Edit App</button>
          </div>

        <!-- Reviews Section -->
        <div class="detail-section reviews-section" id="reviews-section-${esc(appId)}">
          <div class="reviews-header">
            <h3>Reviews</h3>
            <div class="reviews-header-actions">
              ${currentUser ? `<button class="btn btn-primary btn-sm write-review-btn" id="write-review-btn-${esc(appId)}">✏️ Write a Review</button>` : `<p class="review-signin-hint">Sign in to write a review.</p>`}
            </div>
          </div>
          ${currentUser ? `
          <div class="review-form-wrapper" id="review-form-wrapper-${esc(appId)}" style="display:none;">
            <form class="review-form" id="review-form-${esc(appId)}">
              <div class="review-rating-input">
                <span class="review-star" data-star="1">★</span>
                <span class="review-star" data-star="2">★</span>
                <span class="review-star" data-star="3">★</span>
                <span class="review-star" data-star="4">★</span>
                <span class="review-star" data-star="5">★</span>
                <input type="hidden" id="review-rating-${esc(appId)}" value="5">
              </div>
              <input type="text" class="review-title-input" id="review-title-${esc(appId)}" placeholder="Review title (optional)" maxlength="120">
              <textarea class="review-text-input" id="review-text-${esc(appId)}" rows="2" placeholder="Share your experience with this app…" maxlength="2000" required></textarea>
              <div class="review-form-actions">
                <button type="submit" class="btn btn-primary btn-sm">Submit Review</button>
                <button type="button" class="btn btn-secondary btn-sm review-cancel-btn" id="review-cancel-${esc(appId)}">Cancel</button>
              </div>
              <div class="form-msg review-msg" role="alert"></div>
            </form>
          </div>
          <div class="review-submitted-msg" id="review-submitted-${esc(appId)}" style="display:none;">
            <span class="review-success-icon">✅</span> Your review has been submitted. Thank you!
          </div>` : ""}
          <div class="reviews-list reviews-preview" id="reviews-list-${esc(appId)}">
            <p class="er-loading">Loading reviews…</p>
          </div>
          <a class="btn btn-secondary btn-sm view-all-reviews-btn" href="/app/${esc(appId)}/reviews" id="view-all-reviews-${esc(appId)}" style="display:none;">View All Reviews →</a>
        </div>

        <div class="edit-requests-section" id="edit-requests-${esc(appId)}">
          <h3>Edit Requests</h3>
          <div class="edit-requests-list" id="er-list-${esc(appId)}">
            <p class="er-loading">Loading edit requests…</p>
          </div>
          <a class="btn btn-secondary btn-sm view-all-er-btn" href="/app/${esc(appId)}/edit-requests" id="view-all-er-${esc(appId)}" style="display:none;">View All Edit Requests →</a>
        </div>

        <div class="version-history-section">
          <h3>Version History</h3>
          <div class="version-history-list" id="version-history-${esc(appId)}">
            <p class="er-loading">Loading history…</p>
          </div>
          <a class="btn btn-secondary btn-sm view-all-versions-btn" href="/app/${esc(appId)}/versions" id="view-all-versions-${esc(appId)}" style="display:none;">View All Versions →</a>
        </div>

        ${creatorHtml}
        ${claimHtml}
        ${similarHtml}
      </div>
    </div>
  `;

  // Attach event listeners
  detailView.querySelectorAll(".vote-btn").forEach(btn => {
    btn.addEventListener("click", handleVoteClick);
  });

  // Track downloads (debounced to prevent duplicate clicks)
  detailView.querySelectorAll(".download-track-link").forEach(link => {
    let tracking = false;
    link.addEventListener("click", async () => {
      if (tracking) return;
      tracking = true;
      try {
        const newCount = await trackDownload(appId, currentUser?.uid);
        if (newCount != null) {
          const idx = apps.findIndex(a => a.id === appId);
          if (idx >= 0) apps[idx].downloads = newCount;
          const dlStat = detailView.querySelector('.detail-stats .detail-stat-card:nth-child(4) .stat-number');
          if (dlStat) dlStat.textContent = newCount;
        }
      } finally {
        setTimeout(() => { tracking = false; }, 2000);
      }
    });
  });
  detailView.querySelector(".detail-report")?.addEventListener("click", e => {
    const rb = e.currentTarget;
    openReportModal(rb.dataset.appId, rb.dataset.appName);
  });

  // Edit App button (opens edit request modal for everyone)
  detailView.querySelector(".btn-direct-edit")?.addEventListener("click", e => {
    const btn = e.currentTarget;
    openEditRequestModal(btn.dataset.appId, btn.dataset.appName, app);
  });

  // Bookmark button
  detailView.querySelector("#bookmark-btn")?.addEventListener("click", async e => {
    if (!currentUser) { showToast("Sign in to save apps"); return; }
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const saved = await toggleBookmark(currentUser.uid, appId);
      btn.classList.toggle("bookmarked", saved);
      btn.textContent = saved ? "★" : "☆";
      btn.title = saved ? "Remove bookmark" : "Save app";
      showToast(saved ? "App saved to your library!" : "Removed from library");
    } catch (err) { showToast("Failed to save"); }
    btn.disabled = false;
  });

  // Share dropdown
  const shareBtn = detailView.querySelector("#share-btn");
  const shareDropdown = detailView.querySelector("#share-dropdown");
  shareBtn?.addEventListener("click", e => {
    e.stopPropagation();
    shareDropdown.classList.toggle("open");
  });
  detailView.querySelector("[data-action='copy']")?.addEventListener("click", e => {
    navigator.clipboard.writeText(e.currentTarget.dataset.url);
    showToast("Link copied!");
    shareDropdown.classList.remove("open");
  });
  document.addEventListener("click", () => shareDropdown?.classList.remove("open"), { once: true });

  // Screenshots lightbox
  detailView.querySelectorAll(".screenshot-thumb").forEach(img => {
    img.addEventListener("click", () => openScreenshotLightbox(img.dataset.full));
  });

  // Expandable description
  detailView.querySelector("#desc-toggle")?.addEventListener("click", () => {
    const content = detailView.querySelector("#full-desc-content");
    const btn = detailView.querySelector("#desc-toggle");
    content.classList.toggle("collapsed");
    btn.textContent = content.classList.contains("collapsed") ? "Show more ▼" : "Show less ▲";
  });

  // Copy install commands
  detailView.querySelectorAll(".copy-cmd-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.cmd);
      showToast("Command copied!");
    });
  });

  // Tag click handler
  detailView.querySelectorAll(".detail-tag").forEach(tag => {
    tag.addEventListener("click", e => {
      e.preventDefault();
      document.getElementById("search-input").value = tag.dataset.tag;
      navigateTo("/");
    });
  });

  // Claim ownership button
  detailView.querySelector("#claim-ownership-btn")?.addEventListener("click", async e => {
    if (!currentUser) { showToast("Sign in to claim ownership"); return; }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Submitting…";
    try {
      await submitOwnershipClaim(appId, currentUser);
      showToast("Ownership claim submitted! The team will review it.");
      btn.textContent = "✓ Claim Submitted";
    } catch (err) {
      showToast(err.message || "Failed to submit claim");
      btn.disabled = false;
      btn.textContent = "🔑 Claim App Ownership";
    }
  });

  // Reviews — preview mode (top 3)
  loadAppReviewsPreview(appId);
  setupReviewForm(appId);

  // SPA navigation for View All Reviews
  const viewAllLink = document.getElementById(`view-all-reviews-${appId}`);
  if (viewAllLink) {
    viewAllLink.addEventListener("click", e => { e.preventDefault(); navigateTo(`/app/${appId}/reviews`); });
  }

  // SPA navigation for View All Edit Requests
  const viewAllERLink = document.getElementById(`view-all-er-${appId}`);
  if (viewAllERLink) {
    viewAllERLink.addEventListener("click", e => { e.preventDefault(); navigateTo(`/app/${appId}/edit-requests`); });
  }

  // SPA navigation for View All Versions
  const viewAllVersionsLink = document.getElementById(`view-all-versions-${appId}`);
  if (viewAllVersionsLink) {
    viewAllVersionsLink.addEventListener("click", e => { e.preventDefault(); navigateTo(`/app/${appId}/versions`); });
  }

  // Load edit requests and version history for this app
  loadEditRequestsForDetail(appId);
  loadVersionHistory(appId);
}

// ── Edit Request (PR-style) ──────────────────────────────────────────────────

// ── Similar Apps ─────────────────────────────────────────────────────────────
function getSimilarApps(app) {
  return apps
    .filter(a => a.id !== app.id && (a.category === app.category || (app.tags || []).some(t => (a.tags || []).includes(t))))
    .sort((a, b) => (b.likes || 0) - (a.likes || 0))
    .slice(0, 6);
}

// ── Previous Rank (for rank movement indicator) ──────────────────────────────
function getAppPreviousRank(appId) {
  // Simple heuristic: use score without most recent view changes
  return null; // Would need historical data; returns null for now
}

// ── Screenshot Lightbox ──────────────────────────────────────────────────────
function openScreenshotLightbox(src) {
  const overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";
  overlay.innerHTML = `
    <div class="lightbox-content">
      <img src="${escUrl(src)}" alt="Screenshot" class="lightbox-img">
      <button class="lightbox-close">✕</button>
    </div>
  `;
  overlay.addEventListener("click", e => {
    if (e.target === overlay || e.target.closest(".lightbox-close")) overlay.remove();
  });
  document.body.appendChild(overlay);
}

// ── Reviews ──────────────────────────────────────────────────────────────────
function renderReviewCard(r, showVoteState = false) {
  const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
  const date = new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const helpfulActive = r._userVote === "helpful" ? " review-vote-active" : "";
  const unhelpfulActive = r._userVote === "unhelpful" ? " review-vote-active" : "";
  return `
    <div class="review-card">
      <div class="review-card-header">
        <div class="review-author">
          ${r.authorPhoto ? `<img class="review-avatar" src="${escUrl(r.authorPhoto)}" alt="" referrerpolicy="no-referrer">` : `<div class="review-avatar-fallback">${esc((r.authorName || "U").charAt(0))}</div>`}
          <span class="review-author-name">${esc(r.authorName)}</span>
          <span class="review-date">${date}</span>
        </div>
        <span class="review-stars">${stars}</span>
      </div>
      ${r.title ? `<h4 class="review-title">${esc(r.title)}</h4>` : ""}
      <p class="review-text">${esc(r.text)}</p>
      <div class="review-actions">
        <button class="review-helpful-btn${helpfulActive}" data-review-id="${esc(r.id)}" data-vote-type="helpful">👍 Helpful (${r.helpful || 0})</button>
        <button class="review-helpful-btn${unhelpfulActive}" data-review-id="${esc(r.id)}" data-vote-type="unhelpful">👎 (${r.unhelpful || 0})</button>
      </div>
    </div>`;
}

function bindReviewVoteButtons(container, reloadFn) {
  container.querySelectorAll(".review-helpful-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!currentUser) { showToast("Sign in to rate reviews"); return; }
      btn.disabled = true;
      try {
        await toggleReviewVote(btn.dataset.reviewId, currentUser.uid, btn.dataset.voteType);
        await reloadFn();
      } catch (e) {
        showToast("Could not register vote");
      }
      btn.disabled = false;
    });
  });
}

async function loadAppReviewsPreview(appId) {
  const container = document.getElementById(`reviews-list-${appId}`);
  const viewAllBtn = document.getElementById(`view-all-reviews-${appId}`);
  if (!container) return;
  try {
    const reviews = await getAppReviews(appId, "helpful");
    if (!reviews.length) {
      container.innerHTML = `<p class="er-empty">No reviews yet. Be the first to review!</p>`;
      if (viewAllBtn) viewAllBtn.style.display = "none";
      return;
    }
    // Load user votes for preview reviews
    const preview = reviews.slice(0, 3);
    if (currentUser) {
      await Promise.all(preview.map(async r => {
        r._userVote = await getUserReviewVote(r.id, currentUser.uid);
      }));
    }
    container.innerHTML = preview.map(r => renderReviewCard(r)).join("");
    bindReviewVoteButtons(container, () => loadAppReviewsPreview(appId));
    if (viewAllBtn) viewAllBtn.style.display = reviews.length > 3 ? "" : "none";
  } catch (e) {
    container.innerHTML = `<p class="er-empty">Could not load reviews.</p>`;
  }
}

async function loadAppReviews(appId, sortBy = "latest") {
  const container = document.getElementById(`reviews-list-full-${appId}`);
  if (!container) return;
  try {
    const reviews = await getAppReviews(appId, sortBy);
    if (!reviews.length) {
      container.innerHTML = `<p class="er-empty">No reviews yet. Be the first to review!</p>`;
      return;
    }
    if (currentUser) {
      await Promise.all(reviews.map(async r => {
        r._userVote = await getUserReviewVote(r.id, currentUser.uid);
      }));
    }
    container.innerHTML = reviews.map(r => renderReviewCard(r, true)).join("");
    bindReviewVoteButtons(container, () => loadAppReviews(appId, sortBy));
  } catch (e) {
    container.innerHTML = `<p class="er-empty">Could not load reviews.</p>`;
  }
}

function setupReviewForm(appId) {
  const form = document.getElementById(`review-form-${appId}`);
  const wrapper = document.getElementById(`review-form-wrapper-${appId}`);
  const writeBtn = document.getElementById(`write-review-btn-${appId}`);
  const cancelBtn = document.getElementById(`review-cancel-${appId}`);
  const submittedMsg = document.getElementById(`review-submitted-${appId}`);
  if (!form) return;

  // Check if user already reviewed this app
  if (currentUser) {
    getUserReviewForApp(appId, currentUser.uid).then(existing => {
      if (existing && writeBtn) {
        writeBtn.textContent = "✅ Already Reviewed";
        writeBtn.disabled = true;
        writeBtn.classList.add("review-already-done");
      }
    });
  }

  // Write a Review button toggle
  if (writeBtn) {
    writeBtn.addEventListener("click", () => {
      if (wrapper) wrapper.style.display = "";
      writeBtn.style.display = "none";
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      if (wrapper) wrapper.style.display = "none";
      if (writeBtn) writeBtn.style.display = "";
    });
  }

  // Star rating
  const stars = form.querySelectorAll(".review-star");
  const ratingInput = document.getElementById(`review-rating-${appId}`);
  let selectedRating = 5;

  function updateStars(rating) {
    stars.forEach((s, i) => s.classList.toggle("selected", i < rating));
  }
  updateStars(5);

  stars.forEach(star => {
    star.addEventListener("click", () => {
      selectedRating = parseInt(star.dataset.star);
      ratingInput.value = selectedRating;
      updateStars(selectedRating);
    });
    star.addEventListener("mouseenter", () => updateStars(parseInt(star.dataset.star)));
    star.addEventListener("mouseleave", () => updateStars(selectedRating));
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const title = document.getElementById(`review-title-${appId}`).value.trim();
    const text = document.getElementById(`review-text-${appId}`).value.trim();
    const msg = form.querySelector(".review-msg");

    if (!text) { msg.textContent = "Please write a review."; msg.className = "form-msg review-msg error"; return; }

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Submitting…";
    try {
      await addAppReview(appId, { rating: selectedRating, title, text }, currentUser);
      // Hide form, show confirmation
      if (wrapper) wrapper.style.display = "none";
      if (submittedMsg) submittedMsg.style.display = "";
      if (writeBtn) { writeBtn.textContent = "✅ Already Reviewed"; writeBtn.disabled = true; writeBtn.classList.add("review-already-done"); }
      // Reload preview
      loadAppReviewsPreview(appId);
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "form-msg review-msg error";
      btn.disabled = false;
      btn.textContent = "Submit Review";
    }
  });
}

function openEditRequestModal(appId, appName, app, directEdit = false) {
  if (!currentUser) {
    showToast("Sign in to edit app");
    return;
  }
  const modal = document.getElementById("edit-request-modal");
  const form = document.getElementById("edit-request-form");
  form.reset();
  clearFormMsg(form);

  // Set app ID
  document.getElementById("er-app-id").value = appId;
  modal.querySelector(".modal-title").textContent = `✏️ Edit App — ${appName}`;

  // Pre-fill placeholders with current data
  document.getElementById("er-name").placeholder = app.name || "App name";
  document.getElementById("er-description").placeholder = app.description || "Description";
  document.getElementById("er-uses").placeholder = app.uses || "Uses";
  document.getElementById("er-alternative").placeholder = app.alternative || "Alternative of";
  document.getElementById("er-logo").placeholder = app.logo || "Logo URL";
  document.getElementById("er-download").placeholder = app.download || "Download URL";
  document.getElementById("er-source").placeholder = app.source || "Source URL";
  document.getElementById("er-website").placeholder = app.website || "Website URL";
  document.getElementById("er-docs").placeholder = app.docs || "Docs URL";
  document.getElementById("er-version").placeholder = app.version || "Version";
  document.getElementById("er-filesize").placeholder = app.fileSize || "File size";
  document.getElementById("er-developer").placeholder = app.developer || "Developer";
  document.getElementById("er-developer-url").placeholder = app.developerUrl || "Developer URL";
  document.getElementById("er-full-description").placeholder = app.fullDescription || "Extended description";
  document.getElementById("er-features").placeholder = (app.features || []).join("\n") || "Features (one per line)";
  document.getElementById("er-tags").placeholder = (app.tags || []).join(", ") || "Tags";
  document.getElementById("er-screenshots").placeholder = (app.screenshots || []).join("\n") || "Screenshot URLs";
  document.getElementById("er-install-methods").placeholder = (app.installMethods || []).map(m => m.label + " | " + m.command).join("\n") || "Installation methods";
  document.getElementById("er-sysreq").placeholder = app.systemRequirements || "System requirements";
  document.getElementById("er-license").value = "";

  // Pre-check current platforms
  form.querySelectorAll("input[name='er-platforms']").forEach(cb => {
    cb.checked = (app.platforms || []).includes(cb.value);
  });

  // Comparison editor
  const erCompContainer = document.getElementById("er-comparison-editor");
  const erCompInitBtn = document.getElementById("er-comp-init");
  if (erCompContainer) {
    erCompContainer.innerHTML = "";
    if (app.comparisonData?.columns?.length) {
      initComparisonEditor(erCompContainer, app.comparisonData);
      if (erCompInitBtn) erCompInitBtn.style.display = "none";
    } else {
      if (erCompInitBtn) {
        erCompInitBtn.style.display = "";
        erCompInitBtn.onclick = () => {
          const appName = app.name || "This App";
          const alt = app.alternative || "Alternative";
          initComparisonEditor(erCompContainer, {
            columns: [appName, alt],
            rows: [
              { feature: "Free", values: [true, false] },
              { feature: "Open Source", values: [true, false] },
              { feature: "License", values: ["", "Proprietary"] }
            ]
          });
          erCompInitBtn.style.display = "none";
        };
      }
    }
  }

  // Show submitter info
  const submitterEl = document.getElementById("edit-request-submitter");
  submitterEl.innerHTML = `
    <div class="er-submitter-card">
      ${currentUser.photoURL
        ? `<img class="er-avatar" src="${escUrl(currentUser.photoURL)}" alt="" referrerpolicy="no-referrer">`
        : `<div class="er-avatar-fallback">${esc((currentUser.displayName || currentUser.email || "U").charAt(0))}</div>`}
      <div class="er-submitter-info">
        <span class="er-submitter-name">${esc(currentUser.displayName || "User")}</span>
        <span class="er-submitter-email">${esc(currentUser.email || "")}</span>
      </div>
      <span class="er-provider-badge">${esc(currentUser.providerData?.[0]?.providerId === "github.com" ? "GitHub" : "Google")}</span>
    </div>
  `;

  modal.classList.add("open");
}

async function handleEditRequestSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector(".btn-submit");

  const appId = document.getElementById("er-app-id").value;
  const reason = document.getElementById("er-reason").value.trim();

  if (!reason) { showFormError(form, "Please explain why this edit is needed."); return; }
  if (reason.length < 5) { showFormError(form, "Reason must be at least 5 characters."); return; }

  // Gather only changed fields
  const changes = {};
  const fields = [
    { id: "er-name", key: "name" },
    { id: "er-description", key: "description" },
    { id: "er-uses", key: "uses" },
    { id: "er-alternative", key: "alternative" },
    { id: "er-logo", key: "logo" },
    { id: "er-download", key: "download" },
    { id: "er-source", key: "source" },
    { id: "er-category", key: "category" },
    { id: "er-website", key: "website" },
    { id: "er-docs", key: "docs" },
    { id: "er-version", key: "version" },
    { id: "er-license", key: "license" },
    { id: "er-filesize", key: "fileSize" },
    { id: "er-developer", key: "developer" },
    { id: "er-developer-url", key: "developerUrl" },
    { id: "er-full-description", key: "fullDescription" },
    { id: "er-sysreq", key: "systemRequirements" }
  ];

  fields.forEach(({ id, key }) => {
    const val = document.getElementById(id).value.trim();
    if (val) changes[key] = val;
  });

  // Validate logo URL if provided
  if (changes.logo && !isValidLogoURL(changes.logo)) {
    showFormError(form, "Logo URL must be a valid image link (.jpg, .jpeg, .png, or .svg).");
    return;
  }

  // Handle logo file upload for edit request
  const erLogoFile = document.getElementById("er-logo-file")?._selectedFile;
  if (erLogoFile) {
    btn.disabled = true;
    btn.textContent = "Uploading logo…";
    try {
      changes.logo = await uploadLogoToStorage(erLogoFile, appId);
    } catch (err) {
      showFormError(form, err.message || "Logo upload failed.");
      btn.disabled = false;
      btn.textContent = btn.getAttribute("data-original") || "Submit Edit Request";
      return;
    }
  }

  // Multi-line / parsed fields
  const erFeatures = document.getElementById("er-features").value.trim();
  if (erFeatures) changes.features = erFeatures.split("\n").map(f => f.trim()).filter(Boolean);

  const erTags = document.getElementById("er-tags").value.trim();
  if (erTags) changes.tags = erTags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);

  const erScreenshots = document.getElementById("er-screenshots").value.trim();
  if (erScreenshots) changes.screenshots = erScreenshots.split("\n").map(s => s.trim()).filter(Boolean);

  const erInstall = document.getElementById("er-install-methods").value.trim();
  if (erInstall) changes.installMethods = erInstall.split("\n").map(line => {
    const parts = line.split("|").map(p => p.trim());
    return parts.length >= 2 ? { label: parts[0], command: parts[1] } : null;
  }).filter(Boolean);

  const platforms = [...form.querySelectorAll("input[name='er-platforms']:checked")].map(el => el.value);
  // Find the app to compare platforms
  const app = apps.find(a => a.id === appId);
  const currentPlatforms = app?.platforms || [];
  const platformsChanged = platforms.length !== currentPlatforms.length ||
    platforms.some(p => !currentPlatforms.includes(p)) ||
    currentPlatforms.some(p => !platforms.includes(p));
  if (platformsChanged && platforms.length > 0) {
    changes.platforms = platforms;
  }

  // Comparison data
  const erCompEl = document.getElementById("er-comparison-editor");
  if (erCompEl && erCompEl.querySelector(".comp-editor")) {
    const compErr = validateComparisonEditor(erCompEl);
    if (compErr) { showFormError(form, compErr); return; }
    const compData = getComparisonData(erCompEl);
    if (compData) changes.comparisonData = compData;
  }

  if (Object.keys(changes).length === 0) {
    showFormError(form, "No changes detected. Edit at least one field.");
    return;
  }

  changes.reason = reason;

  btn.disabled = true;
  btn.setAttribute("data-original", btn.textContent);
  btn.textContent = "Submitting…";

  try {
    await submitEditRequest(appId, changes, currentUser);
    showFormSuccess(form, "Edit request submitted! It will be reviewed by the team.");
    setTimeout(() => {
      closeModal("edit-request-modal");
      // Reload edit requests list
      loadEditRequestsForDetail(appId);
    }, 2000);
  } catch (err) {
    showFormError(form, err.message || "Failed to submit edit request.");
  } finally {
    btn.disabled = false;
    btn.textContent = btn.getAttribute("data-original") || "Submit Edit Request";
  }
}

// ── Verified / Team Badges ───────────────────────────────────────────────────
function verifiedBadge(record) {
  if (!record) return "";
  let badges = "";
  if (record.teamAccount) badges += '<span class="badge badge-team" title="Team Account">⚡ Team</span>';
  if (record.verified) badges += '<span class="badge badge-verified" title="Verified">✓ Verified</span>';
  return badges;
}

function roleBadge(role) {
  const labels = {
    "openlib-team": "OpenLib",
    "admin": "Admin",
    "maintainer": "Maintainer",
    "contributor": "Contributor"
  };
  if (!labels[role]) return '';
  const cls = ["admin", "openlib-team"].includes(role) ? "badge-admin" : role === "maintainer" ? "badge-maintainer" : "";
  return `<span class="badge badge-role ${cls}">${esc(labels[role] || role)}</span>`;
}

// ── Recommendations Section ──────────────────────────────────────────────────
function renderRecommendations() {
  const container = document.getElementById("recommendations-section");
  if (!container) return;

  if (!currentUser || !userRecord) {
    container.style.display = "none";
    return;
  }

  const recs = computeRecommendations(apps, {}, userRecord);
  if (recs.length === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  container.innerHTML = `
    <h2 class="rec-title">Recommended for You</h2>
    <div class="rec-grid">
      ${recs.map(app => {
        const logoHtml = app.logo
          ? `<img class="rec-logo" src="${escUrl(app.logo)}" alt="" onerror="this.style.display='none'">`
          : `<div class="rec-logo-fallback">${esc(app.name.charAt(0))}</div>`;
        return `
          <a href="/app/${esc(app.id)}" class="rec-card">
            ${logoHtml}
            <div class="rec-info">
              <span class="rec-name">${esc(app.name)}</span>
              <span class="rec-cat">${esc(app.category)}</span>
            </div>
            <span class="rec-rating">👍 ${app.likes || 0}</span>
          </a>`;
      }).join("")}
    </div>
  `;
}

// ── Profile View ─────────────────────────────────────────────────────────────
async function showProfile(uid) {
  const views = ["home-view", "detail-view", "rankings-view", "org-view", "admin-view", "verify-view", "team-view", "team-manage-view"];
  views.forEach(v => { const el = document.getElementById(v); if (el) el.style.display = "none"; });
  const profileView = document.getElementById("profile-view");
  profileView.style.display = "block";
  profileView.innerHTML = `<div class="detail-loading">Loading profile…</div>`;

  const isOwnProfile = !uid || uid === currentUser?.uid;
  const targetUid = uid || currentUser?.uid;
  if (!targetUid) {
    profileView.innerHTML = `<div class="empty-state"><h3>Sign in to view your profile</h3><a href="/">← Back</a></div>`;
    return;
  }

  const record = isOwnProfile ? (userRecord || await getUserRecord(targetUid)) : await getUserRecord(targetUid);
  if (!record) {
    profileView.innerHTML = `<div class="empty-state"><h3>Profile not found</h3><a href="/">← Back</a></div>`;
    return;
  }

  const orgs = await getUserOrganizations(targetUid);
  const userApps = await getAppsByOwner(targetUid);
  const editReqs = await getUserEditRequests(targetUid);
  const userSubs = isOwnProfile ? await getUserSubmissions(targetUid) : [];
  const bookmarkedIds = isOwnProfile && currentUser ? await getUserBookmarks(currentUser.uid) : [];
  const bookmarkedApps = bookmarkedIds.length ? apps.filter(a => bookmarkedIds.includes(a.id)) : [];

  // Follow state
  const followersCount = record.followersCount || 0;
  const followingCount = record.followingCount || 0;
  let currentlyFollowing = false;
  if (!isOwnProfile && currentUser) {
    currentlyFollowing = await isFollowing(currentUser.uid, targetUid);
  }

  const avatarHtml = record.photoURL
    ? `<img class="profile-avatar" src="${escUrl(record.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="profile-avatar-fallback">${esc((record.displayName || "U").charAt(0))}</div>`;

  profileView.innerHTML = `
    <div class="profile-page">
      <a href="/" class="back-link">← Back to library</a>
      <div class="profile-header">
        ${avatarHtml}
        <div class="profile-header-text">
          <h1 class="profile-name">${esc(record.displayName)} ${verifiedBadge(record)} ${roleBadge(record.role)}</h1>
          <p class="profile-email">${esc(record.email)}</p>
          ${record.bio ? `<p class="profile-bio">${esc(record.bio)}</p>` : ""}
          ${record.website ? `<a href="${esc(record.website)}" class="profile-website" target="_blank" rel="noopener">${esc(record.website)}</a>` : ""}
          <p class="profile-joined">Joined ${new Date(record.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
          <div class="profile-follow-info">
            <span class="follow-count"><strong id="followers-count">${followersCount}</strong> Followers</span>
            <span class="follow-count"><strong id="following-count">${followingCount}</strong> Following</span>
          </div>
          ${!isOwnProfile && currentUser ? `
            <button class="btn btn-follow ${currentlyFollowing ? 'following' : ''}" id="follow-btn" data-uid="${esc(targetUid)}">
              ${currentlyFollowing ? '✓ Following' : '+ Follow'}
            </button>
          ` : ""}
          ${!isOwnProfile && !currentUser ? `<button class="btn btn-follow" id="follow-btn-guest">+ Follow</button>` : ""}
        </div>
      </div>

      <div class="profile-stats">
        <div class="profile-stat"><span class="stat-number">${record.activity?.appsSubmitted || 0}</span><span class="stat-label">Apps Submitted</span></div>
        <div class="profile-stat"><span class="stat-number">${record.activity?.editsProposed || 0}</span><span class="stat-label">Edits Proposed</span></div>
        <div class="profile-stat"><span class="stat-number">${record.activity?.reviewsDone || 0}</span><span class="stat-label">Reviews</span></div>
      </div>

      ${isOwnProfile && ["admin", "openlib-team"].includes(record.role) ? `
        <div class="profile-team-actions">
          <a href="/verify" class="btn btn-primary btn-verify-submissions" id="verify-submissions-btn">🛡️ Verify App Submissions</a>
        </div>
      ` : ""}

      ${isOwnProfile ? `
        <div class="profile-edit-section">
          <h3>Edit Profile</h3>
          <form id="profile-edit-form" class="profile-form">
            <div class="form-group"><label for="profile-bio">Bio</label><textarea id="profile-bio" rows="2" maxlength="200" placeholder="A short bio…">${esc(record.bio || "")}</textarea></div>
            <div class="form-group"><label for="profile-website">Website</label><input type="url" id="profile-website" placeholder="https://…" value="${esc(record.website || "")}"></div>
            <div class="form-group">
              <label>Preferred Categories</label>
              <div class="checkbox-group">
                ${["Communication","Design","Finance","Media","Productivity","Security","Utility","Other"].map(c =>
                  `<label class="checkbox-label"><input type="checkbox" name="pref-cat" value="${c}" ${(record.preferences?.categories || []).includes(c) ? "checked" : ""}> ${c}</label>`
                ).join("")}
              </div>
            </div>
            <div class="form-group">
              <label>Preferred Platforms</label>
              <div class="checkbox-group">
                ${["Linux","Windows","macOS","Android","iOS","Web"].map(p =>
                  `<label class="checkbox-label"><input type="checkbox" name="pref-plat" value="${p}" ${(record.preferences?.platforms || []).includes(p) ? "checked" : ""}> ${p}</label>`
                ).join("")}
              </div>
            </div>
            <div class="form-msg" role="alert"></div>
            <button type="submit" class="btn btn-primary">Save Profile</button>
          </form>
        </div>
      ` : ""}

      <div class="profile-section">
        <h3>Organizations (${orgs.length})</h3>
        ${isOwnProfile ? `<button class="btn btn-secondary btn-sm" id="create-org-btn">+ Create Organization</button>` : ""}
        <div class="profile-list">
          ${orgs.length ? orgs.map(org => `
            <a href="/org/${esc(org.id)}" class="profile-list-item">
              <span class="org-icon">🏢</span>
              <div class="profile-list-info">
                <span class="profile-list-name">${esc(org.name)} ${org.verified ? '<span class="badge badge-verified">✓</span>' : ""}</span>
                <span class="profile-list-meta">${org.members?.length || 0} members · ${org.apps?.length || 0} apps</span>
              </div>
              <span class="profile-list-role">${esc(org.members?.find(m => m.uid === targetUid)?.role || "member")}</span>
            </a>
          `).join("") : `<p class="profile-empty">No organizations yet.</p>`}
        </div>
      </div>

      <div class="profile-section">
        <h3>Apps (${userApps.length})</h3>
        <div class="profile-list">
          ${userApps.length ? userApps.map(app => `
            <a href="/app/${esc(app.id)}" class="profile-list-item">
              <span class="org-icon">📦</span>
              <div class="profile-list-info">
                <span class="profile-list-name">${esc(app.name)}</span>
                <span class="profile-list-meta">${esc(app.category)} · ${app.views || 0} views</span>
              </div>
            </a>
          `).join("") : `<p class="profile-empty">No apps yet.</p>`}
        </div>
      </div>

      <div class="profile-section">
        <h3>Edit Requests (${editReqs.length})</h3>
        <div class="profile-list">
          ${editReqs.length ? editReqs.slice(0, 10).map(er => {
            const statusIcon = er.status === "open" ? "🟢" : er.status === "merged" ? "🟣" : "🔴";
            return `
              <div class="profile-list-item">
                <span class="org-icon">${statusIcon}</span>
                <div class="profile-list-info">
                  <span class="profile-list-name">${esc(er.appId)} — ${esc(er.changes?.reason || "Edit")}</span>
                  <span class="profile-list-meta">${esc(er.status)} · ${new Date(er.createdAt).toLocaleDateString()}</span>
                </div>
              </div>`;
          }).join("") : `<p class="profile-empty">No edit requests yet.</p>`}
        </div>
      </div>

      ${isOwnProfile ? `
      <div class="profile-section">
        <h3>Saved Apps (${bookmarkedApps.length})</h3>
        <div class="profile-list">
          ${bookmarkedApps.length ? bookmarkedApps.map(app => `
            <a href="/app/${esc(app.id)}" class="profile-list-item">
              <span class="org-icon">★</span>
              <div class="profile-list-info">
                <span class="profile-list-name">${esc(app.name)}</span>
                <span class="profile-list-meta">${esc(app.category)} · 👍 ${app.likes || 0}</span>
              </div>
            </a>
          `).join("") : `<p class="profile-empty">No saved apps yet. Bookmark apps to find them here.</p>`}
        </div>
      </div>
      ` : ""}

      ${isOwnProfile && userSubs.length ? `
      <div class="profile-section">
        <h3>My Submissions (${userSubs.length})</h3>
        <div class="profile-list">
          ${userSubs.map(sub => {
            const statusIcon = sub.status === "pending" ? "🟡" : sub.status === "approved" ? "🟢" : sub.status === "rejected" ? "🔴" : sub.status === "changes_requested" ? "🟠" : "⚪";
            const statusLabel = sub.status === "changes_requested" ? "Changes Requested" : sub.status.charAt(0).toUpperCase() + sub.status.slice(1);
            return `
              <div class="profile-list-item submission-item" data-sub-id="${esc(sub.id)}">
                <span class="org-icon">${statusIcon}</span>
                <div class="profile-list-info">
                  <span class="profile-list-name">${esc(sub.name)}</span>
                  <span class="profile-list-meta">${esc(statusLabel)} · ${esc(sub.category)} · ${new Date(sub.timestamp).toLocaleDateString()}</span>
                  ${sub.status === "changes_requested" && sub.changesComment ? `<span class="profile-list-feedback">💬 "${esc(sub.changesComment)}"</span>` : ""}
                  ${sub.status === "rejected" && sub.rejectReason ? `<span class="profile-list-feedback">❌ "${esc(sub.rejectReason)}"</span>` : ""}
                </div>
                ${sub.status === "changes_requested" ? `<button class="btn btn-sm btn-primary sub-edit-btn" data-sub-id="${esc(sub.id)}">Edit & Resubmit</button>` : ""}
              </div>`;
          }).join("")}
        </div>
      </div>
      ` : isOwnProfile ? `
      <div class="profile-section">
        <h3>My Submissions (0)</h3>
        <p class="profile-empty">No submissions yet. <a href="/" class="link">Submit an app</a> to get started!</p>
      </div>
      ` : ""}
    </div>
  `;

  // Attach handlers
  if (isOwnProfile) {
    document.getElementById("profile-edit-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const form = e.target;
      const bio = document.getElementById("profile-bio").value.trim();
      const website = document.getElementById("profile-website").value.trim();
      const categories = [...form.querySelectorAll("input[name='pref-cat']:checked")].map(el => el.value);
      const platforms = [...form.querySelectorAll("input[name='pref-plat']:checked")].map(el => el.value);

      try {
        await updateUserProfile(currentUser.uid, { bio, website, preferences: { categories, platforms } });
        userRecord = await getUserRecord(currentUser.uid);
        showFormSuccess(form, "Profile updated!");
        renderRecommendations();
      } catch (err) {
        showFormError(form, err.message);
      }
    });

    document.getElementById("create-org-btn")?.addEventListener("click", () => {
      document.getElementById("create-org-modal")?.classList.add("open");
    });

    // Edit & Resubmit handlers
    profileView.querySelectorAll(".sub-edit-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const subId = btn.dataset.subId;
        const sub = userSubs.find(s => s.id === subId);
        if (!sub) return;
        openResubmitModal(sub);
      });
    });
  }

  // Follow button handler
  document.getElementById("follow-btn")?.addEventListener("click", async e => {
    const btn = e.currentTarget;
    const followeeUid = btn.dataset.uid;
    btn.disabled = true;
    try {
      if (btn.classList.contains("following")) {
        await unfollowUser(currentUser.uid, followeeUid);
        btn.classList.remove("following");
        btn.textContent = "+ Follow";
        const el = document.getElementById("followers-count");
        if (el) el.textContent = Math.max(0, parseInt(el.textContent) - 1);
      } else {
        await followUser(currentUser.uid, followeeUid);
        btn.classList.add("following");
        btn.textContent = "✓ Following";
        const el = document.getElementById("followers-count");
        if (el) el.textContent = parseInt(el.textContent) + 1;
      }
    } catch (err) {
      showToast(err.message || "Follow action failed");
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("follow-btn-guest")?.addEventListener("click", () => {
    showToast("Sign in to follow users");
  });
}

// ── Organization View ────────────────────────────────────────────────────────
async function showOrgView(orgId) {
  const views = ["home-view", "detail-view", "rankings-view", "profile-view", "admin-view", "verify-view", "team-view", "team-manage-view"];
  views.forEach(v => { const el = document.getElementById(v); if (el) el.style.display = "none"; });
  const orgView = document.getElementById("org-view");
  orgView.style.display = "block";
  orgView.innerHTML = `<div class="detail-loading">Loading organization…</div>`;

  const org = await getOrganization(orgId);
  if (!org) {
    orgView.innerHTML = `<div class="empty-state"><h3>Organization not found</h3><a href="/">← Back</a></div>`;
    return;
  }

  const orgApps = await getAppsByOwner(orgId);
  const isOwner = currentUser && org.ownerId === currentUser.uid;
  const isMember = currentUser && org.members?.some(m => m.uid === currentUser.uid);
  const memberRole = org.members?.find(m => m.uid === currentUser?.uid)?.role;
  const canManage = isOwner || memberRole === "maintainer";

  orgView.innerHTML = `
    <div class="org-page">
      <a href="/" class="back-link">← Back to library</a>
      <div class="org-header">
        ${org.logoURL ? `<img class="org-logo" src="${escUrl(org.logoURL)}" alt="" onerror="this.style.display='none'">` : `<div class="org-logo-fallback">🏢</div>`}
        <div class="org-header-text">
          <h1 class="org-name">${esc(org.name)} ${org.verified ? '<span class="badge badge-verified">✓ Verified</span>' : ""}</h1>
          ${org.ownerType === "corporation" ? `<span class="badge badge-corp">🏛 Corporation: ${esc(org.corporationName || "")}</span>` : ""}
          ${org.description ? `<p class="org-desc">${esc(org.description)}</p>` : ""}
          ${org.website ? `<a href="${esc(org.website)}" class="org-website" target="_blank" rel="noopener">${esc(org.website)}</a>` : ""}
          <p class="org-meta">Created ${new Date(org.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
        </div>
      </div>

      <div class="org-stats">
        <div class="profile-stat"><span class="stat-number">${org.members?.length || 0}</span><span class="stat-label">Members</span></div>
        <div class="profile-stat"><span class="stat-number">${orgApps.length}</span><span class="stat-label">Apps</span></div>
      </div>

      <div class="org-section">
        <h3>Members</h3>
        ${canManage ? `
          <div class="org-add-member">
            <input type="email" id="org-add-email" placeholder="user@email.com" class="org-member-input">
            <select id="org-add-role" class="org-member-select">
              <option value="contributor">Contributor</option>
              <option value="maintainer">Maintainer</option>
            </select>
            <button class="btn btn-secondary btn-sm" id="org-add-member-btn">Add Member</button>
          </div>
        ` : ""}
        <div class="org-members-list">
          ${(org.members || []).map(m => `
            <div class="org-member-item" data-uid="${esc(m.uid)}">
              <span class="org-member-name">${esc(m.displayName || "User")}</span>
              <span class="badge badge-role">${esc(m.role)}</span>
              ${canManage && m.uid !== org.ownerId ? `<button class="btn-icon btn-remove-member" data-uid="${esc(m.uid)}" title="Remove">✕</button>` : ""}
            </div>
          `).join("")}
        </div>
      </div>

      ${isOwner ? `
        <div class="org-section">
          <h3>Ownership</h3>
          <div class="org-ownership-actions">
            <div class="org-transfer-row">
              <select id="transfer-member-select" class="org-member-select">
                <option value="">Transfer to member…</option>
                ${org.members.filter(m => m.uid !== org.ownerId).map(m =>
                  `<option value="${esc(m.uid)}">${esc(m.displayName)}</option>`
                ).join("")}
              </select>
              <button class="btn btn-secondary btn-sm" id="transfer-ownership-btn">Transfer</button>
            </div>
            <div class="org-transfer-row">
              <input type="text" id="corp-name-input" placeholder="Corporation name" class="org-member-input">
              <button class="btn btn-secondary btn-sm" id="transfer-corp-btn">Transfer to Corporation</button>
            </div>
          </div>
        </div>
      ` : ""}

      <div class="org-section">
        <h3>Apps (${orgApps.length})</h3>
        <div class="profile-list">
          ${orgApps.length ? orgApps.map(app => `
            <a href="/app/${esc(app.id)}" class="profile-list-item">
              <span class="org-icon">📦</span>
              <div class="profile-list-info">
                <span class="profile-list-name">${esc(app.name)}</span>
                <span class="profile-list-meta">${esc(app.category)} · 👍 ${app.likes || 0}</span>
              </div>
            </a>
          `).join("") : `<p class="profile-empty">No apps yet.</p>`}
        </div>
      </div>
    </div>
  `;

  // Event handlers
  document.getElementById("org-add-member-btn")?.addEventListener("click", async () => {
    const email = document.getElementById("org-add-email").value.trim();
    const role = document.getElementById("org-add-role").value;
    if (!email) { showToast("Enter an email"); return; }
    try {
      await addOrgMember(orgId, email, role, currentUser.uid);
      showToast("Member added!");
      showOrgView(orgId);
    } catch (err) { showToast(err.message); }
  });

  orgView.querySelectorAll(".btn-remove-member").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await removeOrgMember(orgId, btn.dataset.uid, currentUser.uid);
        showToast("Member removed");
        showOrgView(orgId);
      } catch (err) { showToast(err.message); }
    });
  });

  document.getElementById("transfer-ownership-btn")?.addEventListener("click", async () => {
    const newOwner = document.getElementById("transfer-member-select").value;
    if (!newOwner) { showToast("Select a member"); return; }
    try {
      await transferOwnership(orgId, newOwner, currentUser.uid);
      showToast("Ownership transferred!");
      showOrgView(orgId);
    } catch (err) { showToast(err.message); }
  });

  document.getElementById("transfer-corp-btn")?.addEventListener("click", async () => {
    const corpName = document.getElementById("corp-name-input").value.trim();
    if (!corpName) { showToast("Enter corporation name"); return; }
    try {
      await transferToCorporation(orgId, corpName, currentUser.uid);
      showToast("Transferred to corporation!");
      showOrgView(orgId);
    } catch (err) { showToast(err.message); }
  });
}

// ── Verify Submissions (Team-only screen) ────────────────────────────────────
async function showVerifySubmissions() {
  const allViews = ["home-view", "detail-view", "rankings-view", "profile-view", "org-view", "admin-view", "team-view", "team-manage-view"];
  allViews.forEach(v => { const el = document.getElementById(v); if (el) el.style.display = "none"; });
  const verifyView = document.getElementById("verify-view");
  verifyView.style.display = "block";

  // Access check — only team / admin
  const isTeam = userRecord && ["admin", "openlib-team"].includes(userRecord.role);
  if (!currentUser || !isTeam) {
    verifyView.innerHTML = `<div class="empty-state"><h3>Access Denied</h3><p>Only OpenLib team members can verify submissions.</p><a href="/">← Back to library</a></div>`;
    return;
  }

  verifyView.innerHTML = `<div class="detail-loading">Loading submissions for review…</div>`;

  let submissions = [];
  let loadError = null;
  try {
    submissions = await getAllSubmissions();
    console.log("[Verify] Loaded", submissions.length, "submissions");
  } catch (e) {
    console.error("[Verify] Failed to load submissions:", e);
    loadError = e.message;
  }

  if (loadError) {
    verifyView.innerHTML = `
      <div class="verify-page">
        <a href="/profile" class="back-link">← Back to profile</a>
        <h1 class="verify-title">🛡️ Verify App Submissions</h1>
        <div class="admin-error-banner">
          <strong>⚠️ Failed to load submissions:</strong> ${esc(loadError)}
          <p>This may be caused by missing Firestore indexes or permission issues. Check the browser console for details.</p>
        </div>
      </div>`;
    return;
  }

  const pendingCount = submissions.filter(s => s.status === "pending").length;
  const changesCount = submissions.filter(s => s.status === "changes_requested").length;
  const approvedCount = submissions.filter(s => s.status === "approved").length;
  const rejectedCount = submissions.filter(s => s.status === "rejected").length;

  verifyView.innerHTML = `
    <div class="verify-page">
      <a href="/profile" class="back-link">← Back to profile</a>
      <h1 class="verify-title">🛡️ Verify App Submissions</h1>
      <p class="verify-subtitle">Review, accept, reject, or request changes on submitted apps.</p>

      <div class="verify-stats">
        <div class="verify-stat-card verify-stat-pending"><span class="stat-number">${pendingCount}</span><span class="stat-label">Pending</span></div>
        <div class="verify-stat-card verify-stat-changes"><span class="stat-number">${changesCount}</span><span class="stat-label">Changes Requested</span></div>
        <div class="verify-stat-card verify-stat-approved"><span class="stat-number">${approvedCount}</span><span class="stat-label">Approved</span></div>
        <div class="verify-stat-card verify-stat-rejected"><span class="stat-number">${rejectedCount}</span><span class="stat-label">Rejected</span></div>
      </div>

      <div class="sub-filters" id="verify-filters">
        <button class="sub-filter-btn active" data-filter="pending">🟡 Pending (${pendingCount})</button>
        <button class="sub-filter-btn" data-filter="changes_requested">🟠 Changes Requested (${changesCount})</button>
        <button class="sub-filter-btn" data-filter="approved">🟢 Approved (${approvedCount})</button>
        <button class="sub-filter-btn" data-filter="rejected">🔴 Rejected (${rejectedCount})</button>
        <button class="sub-filter-btn" data-filter="all">All (${submissions.length})</button>
      </div>

      <div class="verify-list" id="verify-list">
        ${renderVerifyCards(submissions, "pending")}
      </div>
    </div>
  `;

  // Store submissions for filter switching
  verifyView._submissions = submissions;

  // Filter buttons
  verifyView.querySelectorAll(".sub-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      verifyView.querySelectorAll(".sub-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const filter = btn.dataset.filter;
      document.getElementById("verify-list").innerHTML = renderVerifyCards(submissions, filter);
      attachVerifyHandlers();
    });
  });

  attachVerifyHandlers();
}

function renderVerifyCards(submissions, filter) {
  const filtered = filter === "all" ? submissions : submissions.filter(s => s.status === filter);
  if (!filtered.length) return `<p class="admin-empty">No ${filter === "all" ? "" : filter.replace("_", " ")} submissions.</p>`;

  return filtered.map(sub => {
    const statusIcon = sub.status === "pending" ? "🟡" : sub.status === "approved" ? "🟢" : sub.status === "rejected" ? "🔴" : sub.status === "changes_requested" ? "🟠" : "⚪";
    const statusLabel = sub.status === "changes_requested" ? "Changes Requested" : (sub.status || "unknown").charAt(0).toUpperCase() + (sub.status || "unknown").slice(1);
    const canAct = sub.status === "pending" || sub.status === "changes_requested";

    // Helper: safe field display with "—" fallback
    const sf = (val) => val != null && val !== "" && val !== undefined ? esc(val) : "—";

    return `
    <div class="verify-card" data-id="${esc(sub.id)}" data-status="${esc(sub.status)}">
      <div class="verify-card-header">
        <div class="verify-card-title">
          ${sub.logo ? `<img class="verify-card-logo" src="${escUrl(sub.logo)}" alt="" onerror="this.style.display='none'">` : `<div class="verify-card-logo-fallback">${esc((sub.name || "?").charAt(0))}</div>`}
          <div>
            <strong class="verify-card-name">${sf(sub.name)}</strong>
            <span class="badge badge-role">${sf(sub.category)}</span>
            <span class="sub-status-badge sub-status-${esc(sub.status)}">${statusIcon} ${statusLabel}</span>
          </div>
        </div>
        <span class="verify-card-date">${sub.timestamp ? new Date(sub.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span>
      </div>

      <div class="verify-card-body">
        <div class="verify-field"><label>Description</label><p>${sf(sub.description)}</p></div>
        ${sub.fullDescription ? `<div class="verify-field"><label>Full Description</label><p>${sf(sub.fullDescription)}</p></div>` : ""}
        <div class="verify-field"><label>Uses / Problem solved</label><p>${sf(sub.uses)}</p></div>
        <div class="verify-field-row">
          <div class="verify-field"><label>Alternative of</label><p>${sf(sub.alternative)}</p></div>
          <div class="verify-field"><label>Maintainer</label><p>${sf(sub.maintainer)}</p></div>
        </div>
        <div class="verify-field-row">
          <div class="verify-field"><label>Download</label><p>${sub.download ? `<a href="${esc(sub.download)}" target="_blank" rel="noopener">${esc(sub.download)}</a>` : "—"}</p></div>
          <div class="verify-field"><label>Source Code</label><p>${sub.source ? `<a href="${esc(sub.source)}" target="_blank" rel="noopener">${esc(sub.source)}</a>` : "—"}</p></div>
        </div>
        <div class="verify-field-row">
          <div class="verify-field"><label>Website</label><p>${sub.website ? `<a href="${esc(sub.website)}" target="_blank" rel="noopener">${esc(sub.website)}</a>` : "—"}</p></div>
          <div class="verify-field"><label>Documentation</label><p>${sub.docs ? `<a href="${esc(sub.docs)}" target="_blank" rel="noopener">${esc(sub.docs)}</a>` : "—"}</p></div>
        </div>
        <div class="verify-field-row">
          <div class="verify-field"><label>Developer</label><p>${sf(sub.developer)}</p></div>
          <div class="verify-field"><label>Developer URL</label><p>${sub.developerUrl ? `<a href="${esc(sub.developerUrl)}" target="_blank" rel="noopener">${esc(sub.developerUrl)}</a>` : "—"}</p></div>
        </div>
        <div class="verify-field-row">
          <div class="verify-field"><label>License</label><p>${sf(sub.license)}</p></div>
          <div class="verify-field"><label>Version</label><p>${sf(sub.version)}</p></div>
          <div class="verify-field"><label>File Size</label><p>${sf(sub.fileSize)}</p></div>
        </div>
        ${sub.logo ? `<div class="verify-field"><label>Logo</label><p><img class="verify-card-logo-preview" src="${escUrl(sub.logo)}" alt="" onerror="this.style.display='none'"> <a href="${escUrl(sub.logo)}" target="_blank" rel="noopener">View</a></p></div>` : ""}
        <div class="verify-field">
          <label>Platforms</label>
          <div class="verify-platforms">${(sub.platforms || []).length ? sub.platforms.map(p => `<span class="platform-tag">${platformIcon(p)} ${esc(p)}</span>`).join(" ") : "—"}</div>
        </div>
        ${(sub.tags || []).length ? `<div class="verify-field"><label>Tags</label><div class="verify-tags">${sub.tags.map(t => `<span class="card-tag">${esc(t)}</span>`).join(" ")}</div></div>` : ""}
        ${(sub.features || []).length ? `<div class="verify-field"><label>Features</label><ul class="sub-features-list">${sub.features.map(f => `<li>${esc(f)}</li>`).join("")}</ul></div>` : ""}
        ${(sub.screenshots || []).length ? `<div class="verify-field"><label>Screenshots</label><div class="verify-screenshots">${sub.screenshots.map(s => `<a href="${escUrl(s)}" target="_blank" rel="noopener"><img class="verify-screenshot-thumb" src="${escUrl(s)}" alt="" onerror="this.style.display='none'"></a>`).join(" ")}</div></div>` : ""}
        ${(sub.installMethods || []).length ? `<div class="verify-field"><label>Install Methods</label><div class="verify-install-methods">${sub.installMethods.map(m => `<code>${esc(m.label)}: ${esc(m.command)}</code>`).join("<br>")}</div></div>` : ""}
        ${sub.systemRequirements ? `<div class="verify-field"><label>System Requirements</label><pre class="verify-sysreq">${esc(sub.systemRequirements)}</pre></div>` : ""}
        <div class="verify-field-row">
          <div class="verify-field"><label>Submitted by</label><p>${esc(sub.userId ? sub.userId.slice(0, 16) : "—")}… ${sub.submitterEmail ? `(${esc(sub.submitterEmail)})` : ""}</p></div>
          <div class="verify-field"><label>Date</label><p>${sub.timestamp ? new Date(sub.timestamp).toLocaleString() : "—"}</p></div>
        </div>
        ${sub.updatedAt && sub.updatedAt !== sub.timestamp ? `<div class="verify-field"><label>Last updated</label><p>${new Date(sub.updatedAt).toLocaleString()}</p></div>` : ""}
      </div>

      ${sub.status === "changes_requested" && sub.changesComment ? `
        <div class="verify-feedback verify-feedback-changes">
          <strong>💬 Requested changes:</strong> ${esc(sub.changesComment)}
        </div>
      ` : ""}
      ${sub.status === "rejected" && sub.rejectReason ? `
        <div class="verify-feedback verify-feedback-rejected">
          <strong>❌ Rejection reason:</strong> ${esc(sub.rejectReason)}
        </div>
      ` : ""}
      ${sub.status === "approved" && sub.reviewedBy ? `
        <div class="verify-feedback verify-feedback-approved">
          <strong>✅ Approved</strong> on ${sub.reviewedAt ? new Date(sub.reviewedAt).toLocaleDateString() : ""}
        </div>
      ` : ""}

      <div class="verify-comments" id="verify-comments-${esc(sub.id)}"></div>

      <div class="verify-comment-form">
        <input type="text" class="verify-comment-input" data-sub-id="${esc(sub.id)}" placeholder="Leave a review comment…" maxlength="500">
        <button class="btn btn-sm btn-secondary verify-comment-btn" data-sub-id="${esc(sub.id)}">Comment</button>
      </div>

      ${canAct ? `
        <div class="verify-actions">
          <button class="btn btn-primary verify-accept-btn" data-id="${esc(sub.id)}">✓ Accept App</button>
          <button class="btn btn-warning verify-changes-btn" data-id="${esc(sub.id)}">↺ Ask Changes</button>
          <button class="btn btn-danger verify-reject-btn" data-id="${esc(sub.id)}">✕ Reject</button>
        </div>
      ` : ""}
    </div>`;
  }).join("");
}

function attachVerifyHandlers() {
  // Load comments for each card
  document.querySelectorAll(".verify-card").forEach(card => {
    loadVerifyComments(card.dataset.id);
  });

  // Comment
  document.querySelectorAll(".verify-comment-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const input = document.querySelector(`.verify-comment-input[data-sub-id="${btn.dataset.subId}"]`);
      const text = input?.value.trim();
      if (!text) return;
      btn.disabled = true;
      try {
        await addSubmissionComment(btn.dataset.subId, text, currentUser);
        input.value = "";
        loadVerifyComments(btn.dataset.subId);
      } catch (err) { showToast(err.message); }
      btn.disabled = false;
    });
  });

  // Accept
  document.querySelectorAll(".verify-accept-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Accepting…";
      try {
        await approveSubmission(btn.dataset.id, currentUser.uid);
        showToast("App accepted & published!");
        await loadApps();
        showVerifySubmissions();
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
        btn.textContent = "✓ Accept App";
      }
    });
  });

  // Request Changes
  document.querySelectorAll(".verify-changes-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const comment = await showInputModal("Describe the changes needed for this submission:");
      if (!comment) return;
      btn.disabled = true;
      btn.textContent = "Sending…";
      try {
        await requestChangesOnSubmission(btn.dataset.id, currentUser.uid, comment);
        showToast("Changes requested — submitter will be notified");
        showVerifySubmissions();
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
        btn.textContent = "↺ Ask Changes";
      }
    });
  });

  // Reject
  document.querySelectorAll(".verify-reject-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const reason = await showInputModal("Reason for rejection:");
      if (!reason) return;
      btn.disabled = true;
      btn.textContent = "Rejecting…";
      try {
        await rejectSubmission(btn.dataset.id, currentUser.uid, reason);
        showToast("Submission rejected");
        showVerifySubmissions();
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
        btn.textContent = "✕ Reject";
      }
    });
  });
}

async function loadVerifyComments(submissionId) {
  const container = document.getElementById(`verify-comments-${submissionId}`);
  if (!container) return;
  try {
    const comments = await getSubmissionComments(submissionId);
    if (!comments.length) { container.innerHTML = ""; return; }
    container.innerHTML = `<div class="verify-comments-list">${comments.map(c => {
      const typeClass = c.type === "changes_requested" ? "comment-changes-requested" :
                        c.type === "resubmission" ? "comment-resubmission" : "";
      return `
        <div class="er-comment ${typeClass}">
          ${c.authorPhoto ? `<img class="er-avatar-sm" src="${escUrl(c.authorPhoto)}" alt="" referrerpolicy="no-referrer">` : ""}
          <span class="er-comment-author">${esc(c.authorName)}</span>
          <span class="er-comment-text">${esc(c.text)}</span>
          <span class="er-comment-time">${new Date(c.createdAt).toLocaleDateString()}</span>
        </div>`;
    }).join("")}</div>`;
  } catch (e) {
    container.innerHTML = "";
  }
}

// ── Public OpenLib Team Page ─────────────────────────────────────────────────
async function showOpenLibTeamPage() {
  const views = ["home-view", "detail-view", "rankings-view", "profile-view", "org-view", "admin-view", "verify-view", "team-manage-view"];
  views.forEach(v => { const el = document.getElementById(v); if (el) el.style.display = "none"; });
  const teamView = document.getElementById("team-view");
  teamView.style.display = "block";

  teamView.innerHTML = `<div class="detail-loading">Loading OpenLib team…</div>`;

  let config, members, stats;
  try {
    [config, members, stats] = await Promise.all([
      getOpenLibConfig(),
      getTeamMembers(),
      getTeamStats()
    ]);
  } catch (e) {
    teamView.innerHTML = `<div class="empty-state"><h3>Failed to load</h3><p>${esc(e.message)}</p><a href="/">← Back</a></div>`;
    return;
  }

  if (!config) config = { displayName: "OpenLib", bio: "A curated open-source app library.", website: "", github: "" };
  if (!members) members = [];

  const admins = members.filter(m => m.role === "admin");
  const teamMembers = members.filter(m => m.role === "openlib-team");
  const canManage = isAdmin;

  // Count apps curated by team
  const teamApps = apps.filter(a => isOfficialApp(a));

  teamView.innerHTML = `
    <div class="team-page">
      <a href="/" class="back-link">← Back to library</a>

      <!-- OpenLib Profile Header -->
      <div class="team-profile-header">
        <div class="team-profile-avatar">
          <div class="creator-card-avatar-fallback openlib-avatar team-avatar-lg">${esc(config.avatarText || "OL")}</div>
        </div>
        <div class="team-profile-info">
          <h1 class="team-profile-name">${esc(config.displayName || "OpenLib")} <span class="badge badge-role badge-admin">Official</span></h1>
          <p class="team-profile-bio">${esc(config.bio || "")}</p>
          <div class="team-profile-links">
            ${config.website ? `<a href="${esc(config.website)}" target="_blank" rel="noopener" class="team-link">🌐 Website</a>` : ""}
            ${config.github ? `<a href="${esc(config.github)}" target="_blank" rel="noopener" class="team-link">💻 GitHub</a>` : ""}
            ${config.established ? `<span class="team-link-text">📅 Est. ${esc(config.established)}</span>` : ""}
          </div>
        </div>
        ${canManage ? `<a href="/team/manage" class="btn btn-secondary team-manage-btn" id="team-manage-link">⚙️ Manage Team</a>` : ""}
      </div>

      <!-- Team Stats -->
      <div class="team-stats-grid">
        <div class="team-stat-card">
          <span class="stat-number">${stats?.appsCurated || teamApps.length}</span>
          <span class="stat-label">Apps Curated</span>
        </div>
        <div class="team-stat-card">
          <span class="stat-number">${stats?.totalApps || apps.length}</span>
          <span class="stat-label">Total Apps</span>
        </div>
        <div class="team-stat-card">
          <span class="stat-number">${admins.length}</span>
          <span class="stat-label">Admins</span>
        </div>
        <div class="team-stat-card">
          <span class="stat-number">${teamMembers.length}</span>
          <span class="stat-label">Team Members</span>
        </div>
      </div>

      <!-- Admins Section -->
      <div class="team-section">
        <h2 class="team-section-title">👑 Admins</h2>
        <p class="team-section-desc">Full platform control — manage apps, users, teams, and all settings.</p>
        <div class="team-members-grid">
          ${admins.length ? admins.map(m => renderTeamMemberCard(m, "admin")).join("") : `<p class="team-empty">No admins configured.</p>`}
        </div>
      </div>

      <!-- Team Members Section -->
      <div class="team-section">
        <h2 class="team-section-title">⚡ Team Members</h2>
        <p class="team-section-desc">Review submissions, curate apps, and assist with platform moderation. Permissions set by admins.</p>
        <div class="team-members-grid">
          ${teamMembers.length ? teamMembers.map(m => renderTeamMemberCard(m, "openlib-team")).join("") : `<p class="team-empty">No team members yet.</p>`}
        </div>
      </div>

      <!-- Curated Apps Preview -->
      <div class="team-section">
        <h2 class="team-section-title">📦 Recently Curated</h2>
        <div class="team-curated-grid">
          ${teamApps.slice(0, 8).map(a => `
            <a href="/app/${esc(a.id)}" class="team-curated-card">
              ${a.logo ? `<img class="team-curated-logo" src="${escUrl(a.logo)}" alt="" onerror="this.style.display='none'">` : `<div class="team-curated-logo-fallback">${esc(a.name.charAt(0))}</div>`}
              <span class="team-curated-name">${esc(a.name)}</span>
              <span class="team-curated-cat">${esc(a.category)}</span>
            </a>
          `).join("")}
          ${teamApps.length === 0 ? `<p class="team-empty">No curated apps yet.</p>` : ""}
        </div>
      </div>
    </div>
  `;

  // Manage link click handler
  teamView.querySelector("#team-manage-link")?.addEventListener("click", e => {
    e.preventDefault();
    navigateTo("/team/manage");
  });

  // Member profile links
  teamView.querySelectorAll(".team-member-link").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      navigateTo(link.getAttribute("href"));
    });
  });

  // Curated app links
  teamView.querySelectorAll(".team-curated-card").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      navigateTo(link.getAttribute("href"));
    });
  });
}

function renderTeamMemberCard(member, role) {
  const avatarHtml = member.photoURL
    ? `<img class="team-member-avatar" src="${escUrl(member.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="team-member-avatar-fallback">${esc((member.displayName || "?").charAt(0))}</div>`;
  const roleLabel = role === "admin" ? "Admin" : "Team";
  const roleClass = role === "admin" ? "badge-admin" : "badge-team-role";
  const joinDate = member.createdAt ? new Date(member.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "";

  return `
    <a href="/profile/${esc(member.id)}" class="team-member-card team-member-link">
      ${avatarHtml}
      <div class="team-member-info">
        <span class="team-member-name">
          ${esc(member.displayName || "Anonymous")}
          <span class="badge badge-role ${roleClass}">${roleLabel}</span>
          ${member.verified ? '<span class="badge badge-verified" title="Verified">✓</span>' : ""}
        </span>
        ${member.bio ? `<span class="team-member-bio">${esc(member.bio)}</span>` : ""}
        <span class="team-member-meta">
          ${joinDate ? `Joined ${joinDate}` : ""}
          ${member.activity ? ` · ${member.activity.appsAdded || 0} apps added` : ""}
        </span>
      </div>
    </a>`;
}

// ── Team Management Page (Admin-only) ────────────────────────────────────────
async function showTeamManagePage() {
  const views = ["home-view", "detail-view", "rankings-view", "profile-view", "org-view", "admin-view", "verify-view", "team-view"];
  views.forEach(v => { const el = document.getElementById(v); if (el) el.style.display = "none"; });
  const manageView = document.getElementById("team-manage-view");
  manageView.style.display = "block";

  if (!currentUser || !isAdmin) {
    manageView.innerHTML = `<div class="empty-state"><h3>Access Denied</h3><p>Only admins can manage the team.</p><a href="/team">← Back to team page</a></div>`;
    return;
  }

  manageView.innerHTML = `<div class="detail-loading">Loading team management…</div>`;

  let config, members, allUsers;
  try {
    [config, members, allUsers] = await Promise.all([
      getOpenLibConfig(),
      getTeamMembers(),
      getAllUsers()
    ]);
  } catch (e) {
    manageView.innerHTML = `<div class="empty-state"><h3>Failed to load</h3><p>${esc(e.message)}</p><a href="/team">← Back</a></div>`;
    return;
  }

  if (!config) config = {};
  const nonTeamUsers = allUsers.filter(u => !["admin", "openlib-team"].includes(u.role));

  // Load permissions for all team members
  const memberPermissions = {};
  for (const m of members) {
    try {
      memberPermissions[m.id] = await getTeamMemberPermissions(m.id);
    } catch (e) {
      memberPermissions[m.id] = null;
    }
  }

  manageView.innerHTML = `
    <div class="team-manage-page">
      <a href="/team" class="back-link">← Back to team page</a>
      <h1 class="admin-title">⚙️ Team Management</h1>

      <!-- Tabs -->
      <div class="admin-tabs">
        <button class="admin-tab active" data-tab="tm-profile">OpenLib Profile</button>
        <button class="admin-tab" data-tab="tm-members">Team Members (${members.length})</button>
        <button class="admin-tab" data-tab="tm-permissions">Permissions</button>
        <button class="admin-tab" data-tab="tm-add">Add Member</button>
      </div>

      <div class="admin-tab-content" id="tm-tab-content">
        ${renderTMProfileTab(config)}
      </div>
    </div>
  `;

  // Tab switching
  manageView.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      manageView.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const panel = document.getElementById("tm-tab-content");
      switch (tab.dataset.tab) {
        case "tm-profile": panel.innerHTML = renderTMProfileTab(config); break;
        case "tm-members": panel.innerHTML = renderTMMembersTab(members); break;
        case "tm-permissions": panel.innerHTML = renderTMPermissionsTab(members, memberPermissions); break;
        case "tm-add": panel.innerHTML = renderTMAddMemberTab(nonTeamUsers); break;
      }
      attachTMHandlers(tab.dataset.tab, { config, members, memberPermissions, nonTeamUsers });
    });
  });

  attachTMHandlers("tm-profile", { config, members, memberPermissions, nonTeamUsers });
}

function renderTMProfileTab(config) {
  return `
    <div class="tm-section">
      <h3>OpenLib Account Settings</h3>
      <p class="tm-desc">Configure the public OpenLib profile shown on the team page and contributor attribution.</p>
      <form id="tm-profile-form" class="tm-form">
        <div class="form-group">
          <label for="tm-display-name">Display Name</label>
          <input type="text" id="tm-display-name" value="${esc(config.displayName || "OpenLib")}" maxlength="50">
        </div>
        <div class="form-group">
          <label for="tm-bio">Bio / Description</label>
          <textarea id="tm-bio" rows="3" maxlength="500">${esc(config.bio || "")}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="tm-website">Website</label>
            <input type="url" id="tm-website" value="${esc(config.website || "")}" placeholder="https://…">
          </div>
          <div class="form-group">
            <label for="tm-github">GitHub</label>
            <input type="url" id="tm-github" value="${esc(config.github || "")}" placeholder="https://github.com/…">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="tm-avatar-text">Avatar Text</label>
            <input type="text" id="tm-avatar-text" value="${esc(config.avatarText || "OL")}" maxlength="4">
          </div>
          <div class="form-group">
            <label for="tm-established">Established</label>
            <input type="text" id="tm-established" value="${esc(config.established || "")}" maxlength="10" placeholder="2024">
          </div>
        </div>
        <div class="form-msg" role="alert"></div>
        <button type="submit" class="btn btn-primary">Save Profile</button>
      </form>
    </div>`;
}

function renderTMMembersTab(members) {
  const admins = members.filter(m => m.role === "admin");
  const team = members.filter(m => m.role === "openlib-team");

  return `
    <div class="tm-section">
      <h3>Current Team (${members.length})</h3>

      <h4 class="tm-sub-title">👑 Admins (${admins.length})</h4>
      <div class="tm-members-list">
        ${admins.map(m => renderTMMemberRow(m, false)).join("")}
      </div>

      <h4 class="tm-sub-title" style="margin-top:20px">⚡ Team Members (${team.length})</h4>
      <div class="tm-members-list">
        ${team.length ? team.map(m => renderTMMemberRow(m, true)).join("") : `<p class="team-empty">No team members. Use the "Add Member" tab.</p>`}
      </div>
    </div>`;
}

function renderTMMemberRow(member, canRemove) {
  const avatarHtml = member.photoURL
    ? `<img class="tm-member-avatar" src="${escUrl(member.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="tm-member-avatar-fallback">${esc((member.displayName || "?").charAt(0))}</div>`;
  const roleLabel = member.role === "admin" ? "Admin" : "Team";
  const roleClass = member.role === "admin" ? "badge-admin" : "badge-team-role";
  const lastLogin = member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never";

  return `
    <div class="tm-member-row" data-uid="${esc(member.id)}">
      ${avatarHtml}
      <div class="tm-member-info">
        <span class="tm-member-name">${esc(member.displayName || "Anonymous")} <span class="badge badge-role ${roleClass}">${roleLabel}</span></span>
        <span class="tm-member-email">${esc(member.email || "")}</span>
        <span class="tm-member-meta">Last active: ${lastLogin}</span>
      </div>
      <div class="tm-member-actions">
        ${canRemove ? `<button class="btn btn-sm btn-danger tm-remove-btn" data-uid="${esc(member.id)}" data-name="${esc(member.displayName)}">Remove</button>` : `<span class="tm-role-fixed">Protected</span>`}
      </div>
    </div>`;
}

function renderTMPermissionsTab(members, memberPermissions) {
  const team = members.filter(m => m.role === "openlib-team");
  if (!team.length) {
    return `<div class="tm-section"><h3>Permissions</h3><p class="team-empty">No team members to configure. Add members first.</p></div>`;
  }

  const permLabels = {
    canApproveSubmissions: "Approve Submissions",
    canRejectSubmissions: "Reject Submissions",
    canRequestChanges: "Request Changes",
    canAddApps: "Add Apps Directly",
    canEditApps: "Edit Apps",
    canDeleteApps: "Delete Apps",
    canManageUsers: "Manage Users",
    canManageOrgs: "Manage Organizations",
    canViewReports: "View Reports",
    canMergeEditRequests: "Merge Edit Requests",
    canManageTeam: "Manage Team"
  };

  return `
    <div class="tm-section">
      <h3>Team Permissions</h3>
      <p class="tm-desc">Configure what each team member can do. Admins always have full access.</p>

      ${team.map(m => {
        const perms = memberPermissions[m.id] || {};
        return `
          <div class="tm-perm-card" data-uid="${esc(m.id)}">
            <div class="tm-perm-header">
              ${m.photoURL ? `<img class="tm-member-avatar-sm" src="${escUrl(m.photoURL)}" alt="" referrerpolicy="no-referrer">` : ""}
              <strong>${esc(m.displayName || "Anonymous")}</strong>
            </div>
            <div class="tm-perm-grid">
              ${Object.entries(permLabels).map(([key, label]) => `
                <label class="tm-perm-toggle">
                  <input type="checkbox" class="tm-perm-check" data-uid="${esc(m.id)}" data-perm="${esc(key)}" ${perms[key] ? "checked" : ""}>
                  <span>${label}</span>
                </label>
              `).join("")}
            </div>
            <button class="btn btn-sm btn-primary tm-save-perms-btn" data-uid="${esc(m.id)}">Save Permissions</button>
          </div>`;
      }).join("")}
    </div>`;
}

function renderTMAddMemberTab(nonTeamUsers) {
  return `
    <div class="tm-section">
      <h3>Add Team Member</h3>
      <p class="tm-desc">Select a registered user to add to the OpenLib team. They'll get the "openlib-team" role with default permissions (which you can customize in the Permissions tab).</p>

      <div class="tm-search-wrap">
        <input type="search" id="tm-user-search" placeholder="Search by name or email…" class="tm-search-input" autocomplete="off">
      </div>

      <div class="tm-user-list" id="tm-user-list">
        ${nonTeamUsers.slice(0, 20).map(u => renderTMUserRow(u)).join("")}
        ${nonTeamUsers.length > 20 ? `<p class="tm-more-note">Showing 20 of ${nonTeamUsers.length} users. Use search to find specific users.</p>` : ""}
        ${nonTeamUsers.length === 0 ? `<p class="team-empty">No eligible users found.</p>` : ""}
      </div>
    </div>`;
}

function renderTMUserRow(user) {
  const avatarHtml = user.photoURL
    ? `<img class="tm-member-avatar-sm" src="${escUrl(user.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="tm-member-avatar-fallback-sm">${esc((user.displayName || "?").charAt(0))}</div>`;
  return `
    <div class="tm-user-row" data-uid="${esc(user.id)}">
      ${avatarHtml}
      <div class="tm-user-info">
        <span class="tm-user-name">${esc(user.displayName || "Anonymous")}</span>
        <span class="tm-user-email">${esc(user.email || "")}</span>
      </div>
      <button class="btn btn-sm btn-primary tm-add-user-btn" data-uid="${esc(user.id)}" data-name="${esc(user.displayName || "this user")}">+ Add to Team</button>
    </div>`;
}

function attachTMHandlers(tab, data) {
  const manageView = document.getElementById("team-manage-view");

  switch (tab) {
    case "tm-profile": {
      const form = document.getElementById("tm-profile-form");
      form?.addEventListener("submit", async e => {
        e.preventDefault();
        const btn = form.querySelector(".btn-primary");
        btn.disabled = true;
        btn.textContent = "Saving…";
        try {
          await updateOpenLibConfig({
            displayName: document.getElementById("tm-display-name").value.trim(),
            bio: document.getElementById("tm-bio").value.trim(),
            website: document.getElementById("tm-website").value.trim(),
            github: document.getElementById("tm-github").value.trim(),
            avatarText: document.getElementById("tm-avatar-text").value.trim() || "OL",
            established: document.getElementById("tm-established").value.trim()
          }, currentUser.uid);
          showFormSuccess(form, "Profile saved!");
        } catch (err) {
          showFormError(form, err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = "Save Profile";
        }
      });
      break;
    }

    case "tm-members": {
      manageView.querySelectorAll(".tm-remove-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const name = btn.dataset.name || "this member";
          if (!confirm(`Remove ${name} from the OpenLib team? Their role will revert to "user".`)) return;
          btn.disabled = true;
          btn.textContent = "Removing…";
          try {
            await removeTeamMember(btn.dataset.uid, currentUser.uid);
            showToast(`${name} removed from team`);
            showTeamManagePage();
          } catch (err) {
            showToast(err.message);
            btn.disabled = false;
            btn.textContent = "Remove";
          }
        });
      });
      break;
    }

    case "tm-permissions": {
      manageView.querySelectorAll(".tm-save-perms-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const uid = btn.dataset.uid;
          const checks = manageView.querySelectorAll(`.tm-perm-check[data-uid="${uid}"]`);
          const perms = {};
          checks.forEach(c => { perms[c.dataset.perm] = c.checked; });
          btn.disabled = true;
          btn.textContent = "Saving…";
          try {
            await updateTeamMemberPermissions(uid, perms, currentUser.uid);
            showToast("Permissions updated");
          } catch (err) {
            showToast(err.message);
          } finally {
            btn.disabled = false;
            btn.textContent = "Save Permissions";
          }
        });
      });
      break;
    }

    case "tm-add": {
      const searchInput = document.getElementById("tm-user-search");
      const userList = document.getElementById("tm-user-list");

      searchInput?.addEventListener("input", () => {
        const term = searchInput.value.trim().toLowerCase();
        const filtered = data.nonTeamUsers.filter(u =>
          (u.displayName || "").toLowerCase().includes(term) ||
          (u.email || "").toLowerCase().includes(term)
        ).slice(0, 20);
        userList.innerHTML = filtered.length
          ? filtered.map(u => renderTMUserRow(u)).join("")
          : `<p class="team-empty">No matching users.</p>`;
        attachTMAddButtons();
      });

      attachTMAddButtons();
      break;
    }
  }
}

function attachTMAddButtons() {
  document.querySelectorAll(".tm-add-user-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const name = btn.dataset.name || "this user";
      if (!confirm(`Add ${name} to the OpenLib team?`)) return;
      btn.disabled = true;
      btn.textContent = "Adding…";
      try {
        await addTeamMember(btn.dataset.uid, currentUser.uid);
        showToast(`${name} added to the team!`);
        showTeamManagePage();
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
        btn.textContent = "+ Add to Team";
      }
    });
  });
}

// ── Admin Dashboard ──────────────────────────────────────────────────────────
async function showAdminDashboard() {
  const views = ["home-view", "detail-view", "rankings-view", "profile-view", "org-view", "verify-view", "team-view", "team-manage-view"];
  views.forEach(v => { const el = document.getElementById(v); if (el) el.style.display = "none"; });
  const adminView = document.getElementById("admin-view");
  adminView.style.display = "block";

  if (!currentUser || !isAdmin) {
    adminView.innerHTML = `<div class="empty-state"><h3>Access Denied</h3><p>Admin access required.</p><a href="/">← Back</a></div>`;
    console.warn("[Admin] Access denied — currentUser:", !!currentUser, "isAdmin:", isAdmin, "role:", userRecord?.role);
    return;
  }

  adminView.innerHTML = `<div class="detail-loading">Loading admin dashboard…</div>`;

  let submissions = [], editRequests = [], users = [], orgs = [], reports = [];
  let loadErrors = [];

  try {
    [submissions, editRequests, users, orgs, reports] = await Promise.all([
      getAllSubmissions().catch(e => { loadErrors.push("submissions: " + e.message); console.error("[Admin] Failed to load submissions:", e); return []; }),
      getAllEditRequests("open").catch(e => { loadErrors.push("edit requests: " + e.message); console.error("[Admin] Failed to load edit requests:", e); return []; }),
      getAllUsers().catch(e => { loadErrors.push("users: " + e.message); console.error("[Admin] Failed to load users:", e); return []; }),
      getAllOrganizations().catch(e => { loadErrors.push("organizations: " + e.message); console.error("[Admin] Failed to load orgs:", e); return []; }),
      getAllReports().catch(e => { loadErrors.push("reports: " + e.message); console.error("[Admin] Failed to load reports:", e); return []; })
    ]);
  } catch (e) {
    console.error("[Admin] Critical load error:", e);
    loadErrors.push("critical: " + e.message);
  }

  // Auto-restore expired suspensions
  restoreExpiredSuspensions(currentUser.uid).catch(() => {});

  const pendingCount = submissions.filter(s => s.status === "pending").length;
  const changesCount = submissions.filter(s => s.status === "changes_requested").length;
  const pendingReports = reports.filter(r => r.status === "pending" || r.status === "under_review").length;

  const errorBanner = loadErrors.length ? `
    <div class="admin-error-banner">
      <strong>⚠️ Some data failed to load:</strong>
      <ul>${loadErrors.map(e => `<li>${esc(e)}</li>`).join("")}</ul>
      <p>This may be caused by missing Firestore indexes or permission issues. Check the browser console for details.</p>
    </div>` : "";

  console.log("[Admin] Loaded:", { submissions: submissions.length, editRequests: editRequests.length, users: users.length, orgs: orgs.length, errors: loadErrors });

  adminView.innerHTML = `
    <div class="admin-page">
      <a href="/" class="back-link">← Back to library</a>
      <h1 class="admin-title">⚙️ Admin Dashboard</h1>
      ${errorBanner}

      <div class="admin-stats">
        <div class="admin-stat-card"><span class="stat-number">${pendingCount}</span><span class="stat-label">Pending Submissions</span></div>
        <div class="admin-stat-card"><span class="stat-number">${changesCount}</span><span class="stat-label">Changes Requested</span></div>
        <div class="admin-stat-card"><span class="stat-number">${editRequests.length}</span><span class="stat-label">Open Edit Requests</span></div>
        <div class="admin-stat-card"><span class="stat-number">${pendingReports}</span><span class="stat-label">Open Reports</span></div>
        <div class="admin-stat-card"><span class="stat-number">${users.length}</span><span class="stat-label">Users</span></div>
        <div class="admin-stat-card"><span class="stat-number">${apps.length}</span><span class="stat-label">Apps</span></div>
      </div>

      <div class="admin-tabs">
        <button class="admin-tab active" data-tab="submissions">Submissions</button>
        <button class="admin-tab" data-tab="edit-requests">Edit Requests</button>
        <button class="admin-tab" data-tab="reports">Reports${pendingReports ? ` <span class="tab-badge">${pendingReports}</span>` : ""}</button>
        <button class="admin-tab" data-tab="users">Users</button>
        <button class="admin-tab" data-tab="add-app">Add App</button>
      </div>

      <div class="admin-tab-content" id="admin-tab-content">
        ${renderAdminSubmissions(submissions)}
      </div>
    </div>
  `;

  // Tab switching
  adminView.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", async () => {
      adminView.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const panel = document.getElementById("admin-tab-content");

      switch (tab.dataset.tab) {
        case "submissions": panel.innerHTML = renderAdminSubmissions(submissions); break;
        case "edit-requests": panel.innerHTML = renderAdminEditRequests(editRequests); break;
        case "reports": panel.innerHTML = renderAdminReports(reports); break;
        case "users": panel.innerHTML = renderAdminUsers(users); break;
        case "add-app": panel.innerHTML = renderAdminAddApp(); break;
      }
      attachAdminHandlers(tab.dataset.tab);
    });
  });

  attachAdminHandlers("submissions");
}

function renderAdminSubmissions(submissions) {
  if (!submissions.length) return `<p class="admin-empty">No submissions yet.</p>`;

  const statusFilters = `
    <div class="sub-filters">
      <button class="sub-filter-btn active" data-filter="all">All (${submissions.length})</button>
      <button class="sub-filter-btn" data-filter="pending">🟡 Pending (${submissions.filter(s => s.status === "pending").length})</button>
      <button class="sub-filter-btn" data-filter="changes_requested">🟠 Changes Requested (${submissions.filter(s => s.status === "changes_requested").length})</button>
      <button class="sub-filter-btn" data-filter="approved">🟢 Approved (${submissions.filter(s => s.status === "approved").length})</button>
      <button class="sub-filter-btn" data-filter="rejected">🔴 Rejected (${submissions.filter(s => s.status === "rejected").length})</button>
    </div>
  `;

  const cards = submissions.map(sub => {
    const statusIcon = sub.status === "pending" ? "🟡" : sub.status === "approved" ? "🟢" : sub.status === "rejected" ? "🔴" : sub.status === "changes_requested" ? "🟠" : "⚪";
    const statusLabel = sub.status === "changes_requested" ? "Changes Requested" : (sub.status || "unknown").charAt(0).toUpperCase() + (sub.status || "unknown").slice(1);
    const canAct = sub.status === "pending" || sub.status === "changes_requested";

    // Helper: render a field row, showing "—" for missing/undefined values
    const field = (label, value, isLink) => {
      const display = value != null && value !== "" && value !== undefined ? value : "—";
      const content = isLink && display !== "—"
        ? `<a href="${esc(display)}" target="_blank" rel="noopener">${esc(display)}</a>`
        : esc(display);
      return `<div class="sub-review-row"><span class="sub-review-label">${esc(label)}</span><span class="sub-review-value">${content}</span></div>`;
    };

    return `
    <div class="admin-card sub-review-card" data-id="${esc(sub.id)}" data-status="${esc(sub.status)}">
      <div class="admin-card-header">
        <strong>${esc(sub.name || "(No name)")}</strong>
        <span class="badge badge-role">${esc(sub.category || "—")}</span>
        <span class="sub-status-badge sub-status-${esc(sub.status || "unknown")}">${statusIcon} ${statusLabel}</span>
        <span class="admin-card-date">${sub.timestamp ? new Date(sub.timestamp).toLocaleDateString() : "—"}</span>
      </div>

      <div class="sub-review-details">
        ${field("Description", sub.description)}
        ${field("Full Description", sub.fullDescription)}
        ${field("Uses", sub.uses)}
        ${field("Alternative of", sub.alternative)}
        ${field("Download", sub.download, true)}
        ${field("Source", sub.source, true)}
        ${field("Website", sub.website, true)}
        ${field("Documentation", sub.docs, true)}
        <div class="sub-review-row">
          <span class="sub-review-label">Logo</span>
          <span class="sub-review-value">${sub.logo ? `<img class="sub-review-logo" src="${escUrl(sub.logo)}" alt="" onerror="this.style.display='none'"> <a href="${escUrl(sub.logo)}" target="_blank" rel="noopener">URL</a>` : "—"}</span>
        </div>
        ${field("Maintainer", sub.maintainer)}
        ${field("Developer", sub.developer)}
        ${field("Developer URL", sub.developerUrl, true)}
        ${field("License", sub.license)}
        ${field("Version", sub.version)}
        ${field("File Size", sub.fileSize)}
        <div class="sub-review-row">
          <span class="sub-review-label">Platforms</span>
          <span class="sub-review-value">${(sub.platforms || []).length ? sub.platforms.map(p => `<span class="platform-tag">${platformIcon(p)} ${esc(p)}</span>`).join(" ") : "—"}</span>
        </div>
        <div class="sub-review-row">
          <span class="sub-review-label">Tags</span>
          <span class="sub-review-value">${(sub.tags || []).length ? sub.tags.map(t => `<span class="card-tag">${esc(t)}</span>`).join(" ") : "—"}</span>
        </div>
        <div class="sub-review-row">
          <span class="sub-review-label">Features</span>
          <span class="sub-review-value">${(sub.features || []).length ? `<ul class="sub-features-list">${sub.features.map(f => `<li>${esc(f)}</li>`).join("")}</ul>` : "—"}</span>
        </div>
        <div class="sub-review-row">
          <span class="sub-review-label">Screenshots</span>
          <span class="sub-review-value">${(sub.screenshots || []).length ? sub.screenshots.map(s => `<a href="${escUrl(s)}" target="_blank" rel="noopener" class="sub-screenshot-link">📸 ${esc(s.split('/').pop())}</a>`).join(" ") : "—"}</span>
        </div>
        <div class="sub-review-row">
          <span class="sub-review-label">Install Methods</span>
          <span class="sub-review-value">${(sub.installMethods || []).length ? sub.installMethods.map(m => `<code>${esc(m.label)}: ${esc(m.command)}</code>`).join("<br>") : "—"}</span>
        </div>
        ${field("System Requirements", sub.systemRequirements)}
        <div class="sub-review-row sub-review-submitter-row">
          <span class="sub-review-label">Submitted by</span>
          <span class="sub-review-value">
            <span class="sub-submitter-uid" title="${esc(sub.userId || "")}">${esc(sub.userId ? sub.userId.slice(0, 12) + "…" : "—")}</span>
            ${sub.submitterEmail ? ` <span class="sub-submitter-email">(${esc(sub.submitterEmail)})</span>` : ""}
            <button class="btn btn-sm btn-secondary sub-lookup-user-btn" data-uid="${esc(sub.userId || "")}" title="Lookup submitter profile">👤 Lookup</button>
          </span>
        </div>
        ${sub.updatedAt ? `<div class="sub-review-row"><span class="sub-review-label">Last updated</span><span class="sub-review-value">${new Date(sub.updatedAt).toLocaleString()}</span></div>` : ""}
      </div>

      ${sub.status === "changes_requested" && sub.changesComment ? `
        <div class="sub-review-feedback">
          <strong>💬 Requested changes:</strong> ${esc(sub.changesComment)}
        </div>
      ` : ""}
      ${sub.status === "rejected" && sub.rejectReason ? `
        <div class="sub-review-feedback sub-review-rejected">
          <strong>❌ Rejection reason:</strong> ${esc(sub.rejectReason)}
        </div>
      ` : ""}

      <div class="sub-comments-section" id="sub-comments-${esc(sub.id)}">
        <div class="sub-comments-loading">Loading comments…</div>
      </div>

      ${currentUser ? `
        <div class="sub-comment-form">
          <input type="text" class="sub-comment-input" data-sub-id="${esc(sub.id)}" placeholder="Add a review comment…" maxlength="500">
          <button class="btn btn-sm btn-secondary sub-comment-btn" data-sub-id="${esc(sub.id)}">Comment</button>
        </div>
      ` : ""}

      ${canAct ? `
        <div class="admin-card-actions">
          <button class="btn btn-primary btn-sm admin-approve-sub" data-id="${esc(sub.id)}">✓ Accept</button>
          <button class="btn btn-danger btn-sm admin-reject-sub" data-id="${esc(sub.id)}">✕ Reject</button>
          <button class="btn btn-warning btn-sm admin-request-changes-sub" data-id="${esc(sub.id)}">↺ Ask Changes</button>
        </div>
      ` : ""}
    </div>
    `;
  }).join("");

  return statusFilters + `<div class="sub-review-list">${cards}</div>`;
}

function renderAdminEditRequests(editRequests) {
  if (!editRequests.length) return `<p class="admin-empty">No open edit requests.</p>`;
  return editRequests.map(er => {
    const changedFields = Object.keys(er.changes || {}).filter(k => k !== "reason");
    return `
      <div class="admin-card" data-id="${esc(er.id)}">
        <div class="admin-card-header">
          <strong>App: ${esc(er.appId)}</strong>
          <span class="er-status er-status-open">🟢 open</span>
          <span class="admin-card-date">${new Date(er.createdAt).toLocaleDateString()}</span>
        </div>
        <div class="er-card-changes">
          ${changedFields.map(f => `<span class="er-change-tag">${esc(f)}</span>`).join("")}
          <button class="btn btn-sm btn-secondary er-diff-toggle" data-er-id="${esc(er.id)}" data-app-id="${esc(er.appId)}" data-changes="${encodeURIComponent(JSON.stringify(er.changes || {}))}">📋 View Changes</button>
        </div>
        <div class="er-diff-container" id="er-diff-${esc(er.id)}"></div>
        ${er.changes?.reason ? `<p class="er-card-reason">"${esc(er.changes.reason)}"</p>` : ""}
        <div class="admin-card-actions">
          <button class="btn btn-primary btn-sm admin-merge-er" data-id="${esc(er.id)}">Merge</button>
          <button class="btn btn-secondary btn-sm admin-approve-er" data-id="${esc(er.id)}">Approve</button>
          <button class="btn btn-secondary btn-sm admin-reject-er" data-id="${esc(er.id)}">Reject</button>
        </div>
      </div>`;
  }).join("");
}

function renderAdminUsers(users) {
  return `
    <div class="admin-users-list">
      ${users.map(u => `
        <div class="admin-user-card" data-uid="${esc(u.uid)}">
          <div class="admin-user-header">
            ${u.photoURL ? `<img class="admin-user-avatar" src="${escUrl(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<div class="admin-user-avatar-fallback">${esc((u.displayName || "U").charAt(0))}</div>`}
            <div class="admin-user-info">
              <span class="admin-user-name">${esc(u.displayName)} ${verifiedBadge(u)}</span>
              <span class="admin-user-email">${esc(u.email)}</span>
            </div>
          </div>
          <div class="admin-user-controls">
            <select class="admin-role-select" data-uid="${esc(u.uid)}">
              ${["user","contributor","maintainer","admin","openlib-team"].map(r =>
                `<option value="${r}" ${u.role === r ? "selected" : ""}>${r}</option>`
              ).join("")}
            </select>
            <button class="btn btn-sm ${u.verified ? 'btn-active' : 'btn-secondary'} admin-toggle-verified" data-uid="${esc(u.uid)}" data-verified="${u.verified}">
              ${u.verified ? "✓ Verified" : "Verify"}
            </button>
            <button class="btn btn-sm ${u.teamAccount ? 'btn-active' : 'btn-secondary'} admin-toggle-team" data-uid="${esc(u.uid)}" data-team="${u.teamAccount}">
              ${u.teamAccount ? "⚡ Team" : "Set Team"}
            </button>
          </div>
        </div>
      `).join("")}
    </div>`;
}

function renderAdminAddApp() {
  return `
    <form id="admin-add-app-form" class="admin-form admin-form-full">
      <!-- ── Section: Basic Info ── -->
      <fieldset class="admin-fieldset">
        <legend class="admin-fieldset-legend">Basic Info</legend>
        <div class="form-row">
          <div class="form-group"><label for="aa-name">App Name <span class="required">*</span></label><input type="text" id="aa-name" required maxlength="100" placeholder="e.g. Inkscape"></div>
          <div class="form-group"><label for="aa-category">Category <span class="required">*</span></label>
            <select id="aa-category" required>
              <option value="">— Pick —</option>
              <option value="Communication">Communication</option><option value="Design">Design</option>
              <option value="Finance">Finance</option><option value="Media">Media</option>
              <option value="Productivity">Productivity</option><option value="Security">Security</option>
              <option value="Utility">Utility</option><option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="aa-logo">Logo <span class="optional">(URL or upload — .jpg, .jpeg, .png, .svg)</span></label>
          <div class="logo-input-group">
            <input type="url" id="aa-logo" placeholder="https://…/logo.png" class="logo-url-input">
            <span class="logo-or">or</span>
            <label class="logo-upload-label" for="aa-logo-file">📁 Upload</label>
            <input type="file" id="aa-logo-file" accept=".jpg,.jpeg,.png,.svg" class="logo-file-input">
            <span class="logo-file-name" id="aa-logo-filename"></span>
          </div>
        </div>
        <div class="form-group"><label for="aa-description">Short Description <span class="required">*</span></label><textarea id="aa-description" rows="2" required maxlength="300" placeholder="One-sentence app description."></textarea></div>
        <div class="form-group"><label for="aa-full-description">Full Description <span class="optional">(optional)</span></label><textarea id="aa-full-description" rows="4" maxlength="5000" placeholder="Detailed description with features, highlights, who it's for…"></textarea></div>
        <div class="form-group"><label for="aa-uses">Uses / Problem it solves <span class="required">*</span></label><textarea id="aa-uses" rows="2" required maxlength="300" placeholder="What specific problem does this app solve?"></textarea></div>
        <div class="form-group"><label for="aa-alternative">Alternative of <span class="required">*</span></label><input type="text" id="aa-alternative" required maxlength="100" placeholder="e.g. Adobe Photoshop"></div>
      </fieldset>

      <!-- ── Section: Links ── -->
      <fieldset class="admin-fieldset">
        <legend class="admin-fieldset-legend">Links</legend>
        <div class="form-row">
          <div class="form-group"><label for="aa-download">Download URL <span class="required">*</span></label><input type="url" id="aa-download" required placeholder="https://appname.org/download"></div>
          <div class="form-group"><label for="aa-source">Source URL <span class="required">*</span></label><input type="url" id="aa-source" required placeholder="https://github.com/…"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="aa-website">Website URL <span class="optional">(optional)</span></label><input type="url" id="aa-website" placeholder="https://appname.org"></div>
          <div class="form-group"><label for="aa-docs">Docs URL <span class="optional">(optional)</span></label><input type="url" id="aa-docs" placeholder="https://docs.appname.org"></div>
        </div>
      </fieldset>

      <!-- ── Section: Developer Info ── -->
      <fieldset class="admin-fieldset">
        <legend class="admin-fieldset-legend">Developer Info</legend>
        <div class="form-row">
          <div class="form-group"><label for="aa-maintainer">Maintainer Type <span class="required">*</span></label>
            <select id="aa-maintainer" required>
              <option value="individual">Individual</option>
              <option value="organization">Organization</option>
              <option value="admin">Admin / OpenLib Team</option>
            </select>
          </div>
          <div class="form-group"><label for="aa-developer">Developer Name <span class="optional">(optional)</span></label><input type="text" id="aa-developer" maxlength="100" placeholder="e.g. OBS Project"></div>
        </div>
        <div class="form-group"><label for="aa-developer-url">Developer URL <span class="optional">(optional)</span></label><input type="url" id="aa-developer-url" placeholder="https://github.com/developer"></div>
      </fieldset>

      <!-- ── Section: Metadata ── -->
      <fieldset class="admin-fieldset">
        <legend class="admin-fieldset-legend">Metadata</legend>
        <div class="form-row">
          <div class="form-group"><label for="aa-version">Version <span class="optional">(optional)</span></label><input type="text" id="aa-version" maxlength="30" placeholder="e.g. 3.4.1"></div>
          <div class="form-group"><label for="aa-license">License <span class="required">*</span></label>
            <select id="aa-license" required>
              <option value="">— Select —</option>
              <option value="MIT">MIT</option>
              <option value="GPL-3.0">GPL-3.0</option>
              <option value="GPL-2.0">GPL-2.0</option>
              <option value="Apache-2.0">Apache-2.0</option>
              <option value="BSD-3-Clause">BSD-3-Clause</option>
              <option value="BSD-2-Clause">BSD-2-Clause</option>
              <option value="MPL-2.0">MPL-2.0</option>
              <option value="AGPL-3.0">AGPL-3.0</option>
              <option value="LGPL-3.0">LGPL-3.0</option>
              <option value="ISC">ISC</option>
              <option value="Unlicense">Unlicense</option>
              <option value="Proprietary">Proprietary</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="aa-filesize">File Size <span class="optional">(optional)</span></label><input type="text" id="aa-filesize" maxlength="30" placeholder="e.g. 45 MB"></div>
          <div class="form-group"><label for="aa-tags">Tags <span class="optional">(comma-separated)</span></label><input type="text" id="aa-tags" maxlength="200" placeholder="privacy, encryption, chat"></div>
        </div>
        <div class="form-group"><label for="aa-features">Key Features <span class="optional">(one per line)</span></label><textarea id="aa-features" rows="4" maxlength="2000" placeholder="🎥 Live streaming&#10;🎙 Audio mixing&#10;🖥 Multi-scene support"></textarea></div>
      </fieldset>

      <!-- ── Section: Media ── -->
      <fieldset class="admin-fieldset">
        <legend class="admin-fieldset-legend">Media</legend>
        <div class="form-group"><label for="aa-screenshots">Screenshot URLs <span class="optional">(one per line)</span></label><textarea id="aa-screenshots" rows="3" maxlength="2000" placeholder="https://…/screenshot1.png&#10;https://…/screenshot2.png"></textarea></div>
      </fieldset>

      <!-- ── Section: Comparison ── -->
      <fieldset class="admin-fieldset">
        <legend class="admin-fieldset-legend">Comparison Table <span class="optional">(optional)</span></legend>
        <p class="comp-editor-hint">Build a feature comparison between this app and alternatives. Use ✔/✖ for booleans, Text for free input, — for N/A.</p>
        <div id="aa-comparison-editor"></div>
        <button type="button" class="btn btn-sm btn-secondary" id="aa-comp-init" style="margin-top:6px">+ Create Comparison Table</button>
      </fieldset>

      <!-- ── Section: System & Installation ── -->
      <fieldset class="admin-fieldset">
        <legend class="admin-fieldset-legend">System &amp; Installation</legend>
        <div class="form-group">
          <label>Supported Platforms <span class="required">*</span></label>
          <div class="checkbox-group">
            <label class="checkbox-label"><input type="checkbox" name="aa-platforms" value="Linux"> 🐧 Linux</label>
            <label class="checkbox-label"><input type="checkbox" name="aa-platforms" value="Windows"> 🪟 Windows</label>
            <label class="checkbox-label"><input type="checkbox" name="aa-platforms" value="macOS"> 🍎 macOS</label>
            <label class="checkbox-label"><input type="checkbox" name="aa-platforms" value="Android"> 🤖 Android</label>
            <label class="checkbox-label"><input type="checkbox" name="aa-platforms" value="iOS"> 📱 iOS</label>
            <label class="checkbox-label"><input type="checkbox" name="aa-platforms" value="Web"> 🌐 Web</label>
          </div>
        </div>
        <div class="form-group"><label for="aa-install-methods">Installation Methods <span class="optional">(one per line: label | command or URL)</span></label><textarea id="aa-install-methods" rows="3" maxlength="2000" placeholder="apt | sudo apt install appname&#10;brew | brew install appname&#10;winget | winget install AppName"></textarea></div>
        <div class="form-group"><label for="aa-sysreq">System Requirements <span class="optional">(optional)</span></label><textarea id="aa-sysreq" rows="2" maxlength="1000" placeholder="RAM: 4 GB minimum&#10;Storage: 500 MB&#10;OS: Windows 10+, macOS 11+"></textarea></div>
      </fieldset>

      <!-- ── Section: Admin / Moderation ── -->
      <fieldset class="admin-fieldset admin-fieldset-mod">
        <legend class="admin-fieldset-legend">🔒 Admin Controls</legend>
        <div class="form-row">
          <div class="form-group"><label for="aa-added-by">Added By <span class="required">*</span></label>
            <select id="aa-added-by" required>
              <option value="openlib" selected>OpenLib (Official)</option>
              <option value="admin">Admin (current user)</option>
              <option value="user">Specific User</option>
              <option value="organization">Organization</option>
            </select>
          </div>
          <div class="form-group" id="aa-owner-id-group" style="display:none;">
            <label for="aa-owner-id">Owner UID / Org ID</label>
            <input type="text" id="aa-owner-id" maxlength="128" placeholder="User UID or Organization ID">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="aa-visibility">Visibility</label>
            <select id="aa-visibility">
              <option value="active" selected>Public (Active)</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>
          <div class="form-group"><label for="aa-verified">Open-Source Verified</label>
            <select id="aa-verified">
              <option value="true" selected>Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        </div>
      </fieldset>

      <div class="form-msg" role="alert"></div>
      <div class="admin-form-actions">
        <button type="submit" class="btn btn-primary btn-lg">🚀 Publish App (Admin)</button>
        <button type="reset" class="btn btn-secondary">Reset Form</button>
      </div>
    </form>`;
}

// ── Admin Reports Tab ────────────────────────────────────────────────────────
function renderAdminReports(reports) {
  if (!reports.length) return `<p class="admin-empty">No reports submitted yet.</p>`;

  const statusFilters = `
    <div class="sub-filters">
      <button class="sub-filter-btn active" data-filter="all">All (${reports.length})</button>
      <button class="sub-filter-btn" data-filter="pending">🟡 Pending (${reports.filter(r => r.status === "pending").length})</button>
      <button class="sub-filter-btn" data-filter="under_review">🔵 Under Review (${reports.filter(r => r.status === "under_review").length})</button>
      <button class="sub-filter-btn" data-filter="resolved">🟢 Resolved (${reports.filter(r => r.status === "resolved").length})</button>
      <button class="sub-filter-btn" data-filter="rejected">🔴 Rejected (${reports.filter(r => r.status === "rejected").length})</button>
    </div>`;

  const cards = reports.map(r => {
    const statusIcon = r.status === "pending" ? "🟡" : r.status === "under_review" ? "🔵" : r.status === "resolved" ? "🟢" : r.status === "rejected" ? "🔴" : "⚪";
    const statusLabel = r.status === "under_review" ? "Under Review" : (r.status || "unknown").charAt(0).toUpperCase() + (r.status || "unknown").slice(1);
    const canAct = r.status === "pending" || r.status === "under_review";
    const date = r.timestamp ? new Date(r.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
    const reportedApp = apps.find(a => a.id === r.appId);
    const appModStatus = reportedApp?.moderationStatus || "active";

    return `
      <div class="report-card" data-report-id="${esc(r.id)}" data-status="${esc(r.status)}">
        <div class="report-card-header">
          <div class="report-card-title">
            <span class="report-status-icon">${statusIcon}</span>
            <strong>${esc(r.appName || r.appId)}</strong>
            <span class="badge badge-role">${esc(statusLabel)}</span>
            ${appModStatus !== "active" ? `<span class="badge badge-mod-${esc(appModStatus)}">${appModStatus === "restricted" ? "⚠️ Restricted" : "🚫 Removed"}</span>` : ""}
          </div>
          <span class="report-card-date">${date}</span>
        </div>
        <div class="report-card-body">
          <div class="report-field"><span class="report-field-label">Reason:</span> <span class="report-field-value">${esc(r.reason)}</span></div>
          <div class="report-field"><span class="report-field-label">Details:</span> <span class="report-field-value">${esc(r.details || "No additional details")}</span></div>
          <div class="report-field"><span class="report-field-label">Reporter:</span> <span class="report-field-value">${esc(r.userId || "Anonymous")}</span> <button class="btn btn-secondary btn-xs report-lookup-user" data-uid="${esc(r.userId || "")}">👤 Lookup</button></div>
          <div class="report-field"><span class="report-field-label">App:</span> <a href="/app/${esc(r.appId)}" class="report-app-link">${esc(r.appName || r.appId)} →</a></div>
          ${r.adminNotes ? `<div class="report-field"><span class="report-field-label">Admin Notes:</span> <span class="report-field-value">${esc(r.adminNotes)}</span></div>` : ""}
          ${r.resolvedBy ? `<div class="report-field"><span class="report-field-label">Resolved by:</span> <span class="report-field-value">${esc(r.resolvedBy)}</span></div>` : ""}
        </div>
        ${canAct ? `
        <div class="report-card-actions">
          <div class="report-actions-row">
            <button class="btn btn-primary btn-sm report-resolve-btn" data-id="${esc(r.id)}">✅ Resolve</button>
            <button class="btn btn-secondary btn-sm report-reject-btn" data-id="${esc(r.id)}">❌ Reject</button>
            <button class="btn btn-secondary btn-sm report-review-btn" data-id="${esc(r.id)}">🔍 Mark Under Review</button>
          </div>
          <div class="report-enforcement-row">
            <span class="report-enforcement-label">Enforcement:</span>
            <button class="btn btn-warning btn-sm report-restrict-btn" data-app-id="${esc(r.appId)}" data-app-name="${esc(r.appName || r.appId)}">⚠️ Restrict App</button>
            <button class="btn btn-danger btn-sm report-remove-btn" data-app-id="${esc(r.appId)}" data-app-name="${esc(r.appName || r.appId)}">🚫 Remove App</button>
            <button class="btn btn-secondary btn-sm report-suspend-btn" data-app-id="${esc(r.appId)}" data-app-name="${esc(r.appName || r.appId)}">⏱️ Timed Suspension</button>
            ${appModStatus !== "active" ? `<button class="btn btn-secondary btn-sm report-restore-btn" data-app-id="${esc(r.appId)}" data-app-name="${esc(r.appName || r.appId)}">♻️ Restore App</button>` : ""}
          </div>
        </div>` : ""}
      </div>`;
  }).join("");

  return statusFilters + `<div class="report-cards">${cards}</div>`;
}

function attachAdminHandlers(tab) {
  if (tab === "submissions") {
    // Status filter buttons
    document.querySelectorAll(".sub-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".sub-filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const filter = btn.dataset.filter;
        document.querySelectorAll(".sub-review-card").forEach(card => {
          if (filter === "all" || card.dataset.status === filter) {
            card.style.display = "";
          } else {
            card.style.display = "none";
          }
        });
      });
    });

    // Load comments for each submission
    document.querySelectorAll(".sub-review-card").forEach(card => {
      loadSubComments(card.dataset.id);
    });

    // Comment form handlers
    document.querySelectorAll(".sub-comment-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const input = document.querySelector(`.sub-comment-input[data-sub-id="${btn.dataset.subId}"]`);
        const text = input?.value.trim();
        if (!text) return;
        btn.disabled = true;
        try {
          await addSubmissionComment(btn.dataset.subId, text, currentUser);
          input.value = "";
          loadSubComments(btn.dataset.subId);
        } catch (err) { showToast(err.message); }
        btn.disabled = false;
      });
    });

    document.querySelectorAll(".admin-request-changes-sub").forEach(btn => {
      btn.addEventListener("click", async () => {
        const comment = await showInputModal("Describe the required changes for this submission:");
        if (!comment) return;
        btn.disabled = true;
        try {
          await requestChangesOnSubmission(btn.dataset.id, currentUser.uid, comment);
          btn.closest(".admin-card").remove();
          showToast("Requested changes on submission");
        } catch (err) { showToast(err.message); }
        btn.disabled = false;
      });
    });
    document.querySelectorAll(".admin-approve-sub").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await approveSubmission(btn.dataset.id, currentUser.uid);
          btn.closest(".admin-card").remove();
          showToast("Submission approved & app created!");
          await loadApps();
        } catch (err) { showToast(err.message); }
        btn.disabled = false;
      });
    });
    document.querySelectorAll(".admin-reject-sub").forEach(btn => {
      btn.addEventListener("click", async () => {
        const reason = await showInputModal("Reason for rejection:");
        if (!reason) return;
        btn.disabled = true;
        try {
          await rejectSubmission(btn.dataset.id, currentUser.uid, reason);
          btn.closest(".admin-card").remove();
          showToast("Submission rejected");
        } catch (err) { showToast(err.message); }
        btn.disabled = false;
      });
    });

    // Lookup submitter user record
    document.querySelectorAll(".sub-lookup-user-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.uid;
        if (!uid) { showToast("No submitter UID"); return; }
        btn.disabled = true;
        btn.textContent = "Loading…";
        try {
          const record = await getUserRecord(uid);
          if (record) {
            const info = `${record.displayName || "—"} (${record.email || "—"})\nRole: ${record.role || "user"}\nProvider: ${(record.linkedProviders || []).join(", ") || record.provider || "—"}\nJoined: ${record.createdAt ? new Date(record.createdAt).toLocaleDateString() : "—"}`;
            alert("Submitter Profile:\n\n" + info);
          } else {
            showToast("User record not found for UID: " + uid.slice(0, 12));
          }
        } catch (err) {
          console.error("[Admin] User lookup failed:", err);
          showToast("Lookup failed: " + err.message);
        }
        btn.disabled = false;
        btn.textContent = "👤 Lookup";
      });
    });
  }

  if (tab === "edit-requests") {
    document.querySelectorAll(".admin-card .er-diff-toggle").forEach(btn => {
      btn.addEventListener("click", () => {
        toggleDiffView(btn.dataset.erId, btn.dataset.appId, btn.dataset.changes, btn);
      });
    });
    document.querySelectorAll(".admin-merge-er").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await mergeEditRequest(btn.dataset.id, currentUser.uid);
          btn.closest(".admin-card").remove();
          showToast("Edit request merged!");
          await loadApps();
        } catch (err) { showToast(err.message); }
        btn.disabled = false;
      });
    });
    document.querySelectorAll(".admin-approve-er").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await approveEditRequest(btn.dataset.id, currentUser.uid);
          showToast("Edit request approved!");
        } catch (err) { showToast(err.message); }
        btn.disabled = false;
      });
    });
    document.querySelectorAll(".admin-reject-er").forEach(btn => {
      btn.addEventListener("click", async () => {
        const reason = await showInputModal("Reason for rejection:");
        if (!reason) return;
        btn.disabled = true;
        try {
          await rejectEditRequest(btn.dataset.id, currentUser.uid, reason);
          btn.closest(".admin-card").remove();
          showToast("Edit request rejected");
        } catch (err) { showToast(err.message); }
        btn.disabled = false;
      });
    });
  }

  if (tab === "users") {
    document.querySelectorAll(".admin-role-select").forEach(select => {
      select.addEventListener("change", async () => {
        try {
          await updateUserRole(select.dataset.uid, select.value, currentUser.uid);
          showToast("Role updated!");
        } catch (err) {
          showToast(err.message);
          showAdminDashboard();
        }
      });
    });
    document.querySelectorAll(".admin-toggle-verified").forEach(btn => {
      btn.addEventListener("click", async () => {
        const current = btn.dataset.verified === "true";
        try {
          await setAccountVerified(btn.dataset.uid, !current, currentUser.uid);
          showToast(current ? "Verification removed" : "Account verified!");
          showAdminDashboard();
        } catch (err) { showToast(err.message); }
      });
    });
    document.querySelectorAll(".admin-toggle-team").forEach(btn => {
      btn.addEventListener("click", async () => {
        const current = btn.dataset.team === "true";
        try {
          await setTeamAccount(btn.dataset.uid, !current, currentUser.uid);
          showToast(current ? "Team status removed" : "Marked as Team account!");
          showAdminDashboard();
        } catch (err) { showToast(err.message); }
      });
    });
  }

  if (tab === "reports") {
    // Status filter buttons
    document.querySelectorAll(".sub-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".sub-filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const filter = btn.dataset.filter;
        document.querySelectorAll(".report-card").forEach(card => {
          card.style.display = (filter === "all" || card.dataset.status === filter) ? "" : "none";
        });
      });
    });

    // Resolve report
    document.querySelectorAll(".report-resolve-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const notes = await showInputModal("Resolution notes (optional):");
        btn.disabled = true;
        try {
          await updateReportStatus(btn.dataset.id, "resolved", currentUser.uid, notes || "");
          showToast("Report resolved");
          showAdminDashboard();
        } catch (err) { showToast(err.message); }
        btn.disabled = false;
      });
    });

    // Reject report
    document.querySelectorAll(".report-reject-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const notes = await showInputModal("Rejection reason:");
        if (!notes) return;
        btn.disabled = true;
        try {
          await updateReportStatus(btn.dataset.id, "rejected", currentUser.uid, notes);
          showToast("Report rejected");
          showAdminDashboard();
        } catch (err) { showToast(err.message); }
        btn.disabled = false;
      });
    });

    // Mark under review
    document.querySelectorAll(".report-review-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await updateReportStatus(btn.dataset.id, "under_review", currentUser.uid, "");
          showToast("Report marked as under review");
          showAdminDashboard();
        } catch (err) { showToast(err.message); }
        btn.disabled = false;
      });
    });

    // Restrict app
    document.querySelectorAll(".report-restrict-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const reason = await showInputModal(`Reason for restricting "${btn.dataset.appName}":`);
        if (!reason) return;
        btn.disabled = true;
        try {
          await setAppModerationStatus(btn.dataset.appId, "restricted", currentUser.uid, reason);
          showToast("App restricted");
          await loadApps();
          showAdminDashboard();
        } catch (err) { showToast(err.message); }
        btn.disabled = false;
      });
    });

    // Remove app
    document.querySelectorAll(".report-remove-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const reason = await showInputModal(`Reason for removing "${btn.dataset.appName}":`);
        if (!reason) return;
        btn.disabled = true;
        try {
          await setAppModerationStatus(btn.dataset.appId, "removed", currentUser.uid, reason);
          showToast("App removed from public listing");
          await loadApps();
          showAdminDashboard();
        } catch (err) { showToast(err.message); }
        btn.disabled = false;
      });
    });

    // Timed suspension
    document.querySelectorAll(".report-suspend-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const daysStr = await showInputModal(`Suspend "${btn.dataset.appName}" for how many days?`);
        if (!daysStr) return;
        const days = parseInt(daysStr, 10);
        if (isNaN(days) || days < 1 || days > 365) { showToast("Enter a number between 1 and 365"); return; }
        const reason = await showInputModal("Reason for suspension:");
        if (!reason) return;
        btn.disabled = true;
        try {
          const suspendUntil = new Date(Date.now() + days * 86400000).toISOString();
          await setAppModerationStatus(btn.dataset.appId, "restricted", currentUser.uid, reason, { suspendUntil });
          showToast(`App suspended for ${days} day(s)`);
          await loadApps();
          showAdminDashboard();
        } catch (err) { showToast(err.message); }
        btn.disabled = false;
      });
    });

    // Restore app
    document.querySelectorAll(".report-restore-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await setAppModerationStatus(btn.dataset.appId, "active", currentUser.uid, "Restored by admin");
          showToast("App restored");
          await loadApps();
          showAdminDashboard();
        } catch (err) { showToast(err.message); }
        btn.disabled = false;
      });
    });

    // Lookup reporter
    document.querySelectorAll(".report-lookup-user").forEach(btn => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.uid;
        if (!uid) { showToast("No reporter UID"); return; }
        btn.disabled = true;
        btn.textContent = "Loading…";
        try {
          const record = await getUserRecord(uid);
          if (record) {
            const info = `${record.displayName || "—"} (${record.email || "—"})\nRole: ${record.role || "user"}\nProvider: ${(record.linkedProviders || []).join(", ") || record.provider || "—"}\nJoined: ${record.createdAt ? new Date(record.createdAt).toLocaleDateString() : "—"}`;
            alert("Reporter Profile:\n\n" + info);
          } else {
            showToast("User record not found");
          }
        } catch (err) { showToast("Lookup failed: " + err.message); }
        btn.disabled = false;
        btn.textContent = "👤 Lookup";
      });
    });
  }

  if (tab === "add-app") {
    // Toggle owner ID field visibility based on "Added By" selection
    const addedBySelect = document.getElementById("aa-added-by");
    const ownerIdGroup = document.getElementById("aa-owner-id-group");
    if (addedBySelect && ownerIdGroup) {
      addedBySelect.addEventListener("change", () => {
        const val = addedBySelect.value;
        ownerIdGroup.style.display = (val === "user" || val === "organization") ? "" : "none";
        const ownerInput = document.getElementById("aa-owner-id");
        if (ownerInput) ownerInput.required = (val === "user" || val === "organization");
      });
    }

    // Logo file upload preview
    const logoFileInput = document.getElementById("aa-logo-file");
    const logoFilename = document.getElementById("aa-logo-filename");
    if (logoFileInput && logoFilename) {
      logoFileInput.addEventListener("change", () => {
        logoFilename.textContent = logoFileInput.files[0]?.name || "";
      });
    }

    // Comparison editor
    const aaCompContainer = document.getElementById("aa-comparison-editor");
    const aaCompInitBtn = document.getElementById("aa-comp-init");
    if (aaCompInitBtn && aaCompContainer) {
      aaCompInitBtn.addEventListener("click", () => {
        const appName = document.getElementById("aa-name").value.trim() || "This App";
        const alt = document.getElementById("aa-alternative").value.trim() || "Alternative";
        initComparisonEditor(aaCompContainer, {
          columns: [appName, alt],
          rows: [
            { feature: "Free", values: [true, false] },
            { feature: "Open Source", values: [true, false] },
            { feature: "License", values: ["", "Proprietary"] }
          ]
        });
        aaCompInitBtn.style.display = "none";
      });
    }

    document.getElementById("admin-add-app-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const form = e.target;
      const submitBtn = form.querySelector("button[type='submit']");
      clearFormMsg(form);

      // Validate platforms
      const platforms = [...form.querySelectorAll("input[name='aa-platforms']:checked")].map(el => el.value);
      if (!platforms.length) { showFormError(form, "Select at least one platform."); return; }

      // Handle logo: file upload takes priority over URL
      let logoUrl = document.getElementById("aa-logo").value.trim();
      const logoFile = document.getElementById("aa-logo-file")?.files[0];
      if (logoFile) {
        try {
          submitBtn.disabled = true;
          submitBtn.textContent = "Uploading logo…";
          logoUrl = await uploadLogoToStorage(logoFile, document.getElementById("aa-name").value.trim());
        } catch (uploadErr) {
          showFormError(form, "Logo upload failed: " + uploadErr.message);
          submitBtn.disabled = false;
          submitBtn.textContent = "🚀 Publish App (Admin)";
          return;
        }
      } else if (logoUrl && !isValidLogoURL(logoUrl)) {
        showFormError(form, "Logo URL must be https and end in .jpg, .jpeg, .png, .svg, or .webp");
        return;
      }

      // Parse multi-line / comma fields
      const featuresRaw = document.getElementById("aa-features").value.trim();
      const features = featuresRaw ? featuresRaw.split("\n").map(f => f.trim()).filter(Boolean) : [];

      const tagsRaw = document.getElementById("aa-tags").value.trim();
      const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim().toLowerCase()).filter(Boolean) : [];

      const screenshotsRaw = document.getElementById("aa-screenshots").value.trim();
      const screenshots = screenshotsRaw ? screenshotsRaw.split("\n").map(u => u.trim()).filter(Boolean) : [];

      const installRaw = document.getElementById("aa-install-methods").value.trim();
      const installMethods = installRaw ? installRaw.split("\n").map(line => {
        const parts = line.split("|");
        if (parts.length >= 2) return { label: parts[0].trim(), command: parts.slice(1).join("|").trim() };
        return null;
      }).filter(Boolean) : [];

      // Comparison data
      const aaCompEl = document.getElementById("aa-comparison-editor");
      let comparisonData = null;
      if (aaCompEl && aaCompEl.querySelector(".comp-editor")) {
        const compErr = validateComparisonEditor(aaCompEl);
        if (compErr) { showFormError(form, compErr); return; }
        comparisonData = getComparisonData(aaCompEl);
      }

      const appData = {
        name: document.getElementById("aa-name").value.trim(),
        logo: logoUrl,
        category: document.getElementById("aa-category").value,
        description: document.getElementById("aa-description").value.trim(),
        fullDescription: document.getElementById("aa-full-description").value.trim(),
        uses: document.getElementById("aa-uses").value.trim(),
        alternative: document.getElementById("aa-alternative").value.trim(),
        download: document.getElementById("aa-download").value.trim(),
        source: document.getElementById("aa-source").value.trim(),
        website: document.getElementById("aa-website").value.trim(),
        docs: document.getElementById("aa-docs").value.trim(),
        maintainer: document.getElementById("aa-maintainer").value,
        developer: document.getElementById("aa-developer").value.trim(),
        developerUrl: document.getElementById("aa-developer-url").value.trim(),
        version: document.getElementById("aa-version").value.trim() || "1.0.0",
        license: document.getElementById("aa-license").value,
        fileSize: document.getElementById("aa-filesize").value.trim(),
        features,
        tags,
        screenshots,
        installMethods,
        systemRequirements: document.getElementById("aa-sysreq").value.trim(),
        platforms,
        comparisonData,
        // Internal admin control fields (prefixed with _)
        _addedByType: document.getElementById("aa-added-by").value,
        _ownerId: document.getElementById("aa-owner-id").value.trim(),
        _visibility: document.getElementById("aa-visibility").value,
        _verified: document.getElementById("aa-verified").value
      };

      submitBtn.disabled = true;
      submitBtn.textContent = "Publishing…";
      try {
        await adminAddApp(appData, currentUser.uid);
        showFormSuccess(form, "App published successfully!");
        form.reset();
        if (ownerIdGroup) ownerIdGroup.style.display = "none";
        if (logoFilename) logoFilename.textContent = "";
        if (aaCompContainer) aaCompContainer.innerHTML = "";
        if (aaCompInitBtn) aaCompInitBtn.style.display = "";
        await loadApps();
      } catch (err) {
        showFormError(form, err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "🚀 Publish App (Admin)";
      }
    });
  }
}

// ── Version History (in detail page) ─────────────────────────────────────────
function renderVersionCard(v, appId, opts = {}) {
  const date = new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const changedFields = Object.keys(v.changes || {});
  const typeIcon = v.type === "initial" ? "🎉" : v.type === "restore" ? "⏪" : v.type === "ownership_transfer" ? "🔄" : "📝";
  const typeLabel = v.type === "initial" ? "Initial" : v.type === "restore" ? "Restore" : v.type === "ownership_transfer" ? "Transfer" : "Edit";
  const vNum = v.versionNumber != null ? `#${v.versionNumber}` : "";
  const avatar = v.authorPhoto
    ? `<img class="er-comment-avatar" src="${escUrl(v.authorPhoto)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="er-comment-avatar-fallback">${esc((v.authorName || "U").charAt(0))}</div>`;
  const canRestore = isAdmin && v.fullSnapshot && Object.keys(v.fullSnapshot).length > 0;

  return `
    <div class="version-card" data-version-id="${esc(v.id)}">
      <div class="version-header">
        <div class="version-header-left">
          <span class="version-number">${vNum}</span>
          <span class="version-type-badge version-type-${esc(v.type)}">${typeIcon} ${typeLabel}</span>
          ${v.editRequestId ? `<a class="version-er-link" href="/app/${esc(appId)}/edit-requests" title="Linked edit request">🔗 ER</a>` : ""}
        </div>
        <span class="version-date">${date}</span>
      </div>
      <p class="version-message">${esc(v.commitMessage)}</p>
      ${v.summary && v.summary !== v.commitMessage ? `<p class="version-summary">${esc(v.summary)}</p>` : ""}
      <div class="version-author">
        ${avatar}
        <span>${esc(v.authorName || "Unknown")}</span>
      </div>
      ${changedFields.length ? `
        <button class="btn btn-sm btn-secondary version-diff-toggle" data-version-id="${esc(v.id)}">📋 View Changes (${changedFields.length} field${changedFields.length > 1 ? "s" : ""})</button>
        <div class="version-changes" id="version-diff-${esc(v.id)}" style="display:none;">
          ${changedFields.map(f => {
            const c = v.changes[f];
            const oldStr = formatValuePlain(c?.old).slice(0, 300);
            const newStr = formatValuePlain(c?.new).slice(0, 300);
            return `<div class="version-diff"><span class="diff-field">${esc(FIELD_LABELS[f] || f)}</span><span class="diff-old">− ${esc(oldStr)}</span><span class="diff-new">+ ${esc(newStr)}</span></div>`;
          }).join("")}
        </div>
      ` : ""}
      ${canRestore ? `<button class="btn btn-sm btn-secondary version-restore-btn" data-version-id="${esc(v.id)}" data-app-id="${esc(appId)}">⏪ Restore to this version</button>` : ""}
    </div>`;
}

function bindVersionCardHandlers(container, appId, reloadFn) {
  container.querySelectorAll(".version-diff-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const diffEl = document.getElementById(`version-diff-${btn.dataset.versionId}`);
      if (diffEl) {
        const open = diffEl.style.display !== "none";
        diffEl.style.display = open ? "none" : "";
        btn.textContent = open ? btn.textContent.replace("Hide", "View") : btn.textContent.replace("View", "Hide");
      }
    });
  });
  container.querySelectorAll(".version-er-link").forEach(link => {
    link.addEventListener("click", e => { e.preventDefault(); navigateTo(link.getAttribute("href")); });
  });
  container.querySelectorAll(".version-restore-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Restore the app to this version? This will overwrite current data and create a new version entry.")) return;
      btn.disabled = true;
      btn.textContent = "Restoring…";
      try {
        await restoreAppVersion(btn.dataset.appId, btn.dataset.versionId, currentUser.uid);
        showToast("App restored to selected version!");
        await loadApps();
        reloadFn();
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
        btn.textContent = "⏪ Restore to this version";
      }
    });
  });
}

async function loadVersionHistory(appId) {
  const container = document.getElementById(`version-history-${appId}`);
  const viewAllBtn = document.getElementById(`view-all-versions-${appId}`);
  if (!container) return;

  try {
    const versions = await getAppVersions(appId);
    if (!versions.length) {
      container.innerHTML = `<p class="er-empty">No version history yet.</p>`;
      if (viewAllBtn) viewAllBtn.style.display = "none";
      return;
    }

    const preview = versions.slice(0, 3);
    container.innerHTML = preview.map(v => renderVersionCard(v, appId)).join("");
    bindVersionCardHandlers(container, appId, () => loadVersionHistory(appId));
    if (viewAllBtn) viewAllBtn.style.display = versions.length > 3 ? "" : "none";
  } catch (e) {
    container.innerHTML = `<p class="er-empty">Could not load version history.</p>`;
  }
}

// ── Enhanced Edit Request with Review Comments ───────────────────────────────
/* ── Diff View Helper ── */
function formatFieldValue(val, fieldKey) {
  if (val == null || val === "") return '<span class="diff-empty">—</span>';
  if (fieldKey === "comparisonData") return formatComparisonDataDiff(val);
  if (fieldKey === "installMethods") return formatInstallMethodsDiff(val);
  if (Array.isArray(val)) {
    if (!val.length) return '<span class="diff-empty">—</span>';
    // Handle arrays of objects (generic)
    if (typeof val[0] === "object" && val[0] !== null) {
      return val.map(v => `<span class="diff-tag">${esc(JSON.stringify(v))}</span>`).join(" ");
    }
    return val.map(v => `<span class="diff-tag">${esc(String(v))}</span>`).join(" ");
  }
  if (typeof val === "object") return `<pre class="diff-json">${esc(JSON.stringify(val, null, 2))}</pre>`;
  return esc(String(val));
}

function formatComparisonDataDiff(data) {
  if (!data || !data.columns?.length || !data.rows?.length) return '<span class="diff-empty">—</span>';
  const hdr = data.columns.map(c => `<th>${esc(c)}</th>`).join("");
  const bindingLabel = { "@license": "📄 Auto: License", "@platforms": "💻 Auto: Platforms", "@cross-platform": "🌐 Auto: Cross-Platform", "@version": "📦 Auto: Version", "@source": "🔗 Auto: Has Source" };
  const body = data.rows.map(r => {
    const cells = (r.values || []).map(v => {
      if (v === true) return '<td class="comp-yes">✔</td>';
      if (v === false) return '<td class="comp-no">✖</td>';
      if (v == null) return '<td class="comp-na">—</td>';
      if (typeof v === "string" && v.startsWith("@") && bindingLabel[v]) return `<td><span class="diff-tag">${bindingLabel[v]}</span></td>`;
      return `<td>${esc(String(v))}</td>`;
    }).join("");
    return `<tr><td>${esc(r.feature)}</td>${cells}</tr>`;
  }).join("");
  return `<table class="comparison-table diff-inline-table"><thead><tr><th>Feature</th>${hdr}</tr></thead><tbody>${body}</tbody></table>`;
}

function formatInstallMethodsDiff(methods) {
  if (!Array.isArray(methods) || !methods.length) return '<span class="diff-empty">—</span>';
  return methods.map(m => `<div class="diff-install-item"><span class="diff-tag">${esc(m.label || "")}</span> <code>${esc(m.command || "")}</code></div>`).join("");
}

function formatValuePlain(val) {
  if (val == null || val === "") return "—";
  if (Array.isArray(val)) return val.length ? val.map(v => typeof v === "object" ? JSON.stringify(v) : String(v)).join(", ") : "—";
  if (typeof val === "object") return JSON.stringify(val, null, 2);
  return String(val);
}

const FIELD_LABELS = {
  name: "Name", description: "Description", uses: "Uses", alternative: "Alternative To",
  logo: "Logo URL", download: "Download URL", source: "Source URL", category: "Category",
  website: "Website", docs: "Documentation", version: "Version", license: "License",
  fileSize: "File Size", developer: "Developer", developerUrl: "Developer URL",
  fullDescription: "Full Description", features: "Features", tags: "Tags",
  screenshots: "Screenshots", installMethods: "Install Methods", platforms: "Platforms",
  systemRequirements: "System Requirements", comparisonData: "Comparison Table"
};

function renderDiffTable(changes, originalApp, snapshot) {
  const fields = Object.keys(changes).filter(k => k !== "reason");
  if (!fields.length) return '<p class="diff-empty-msg">No field changes.</p>';

  return `
    <div class="diff-table-wrap">
      <table class="diff-table">
        <thead><tr><th>Field</th><th class="diff-old">Original</th><th class="diff-new">Proposed</th></tr></thead>
        <tbody>
          ${fields.map(f => {
            const oldVal = snapshot && snapshot[f] !== undefined ? snapshot[f] : (originalApp ? originalApp[f] : undefined);
            const newVal = changes[f];
            const isComplex = f === "comparisonData" || f === "installMethods" || Array.isArray(newVal) || (typeof newVal === "object" && newVal !== null);
            const isLong = (typeof newVal === "string" && newVal.length > 120) || isComplex;
            return `<tr class="${isLong ? "diff-row-long" : ""}">
              <td class="diff-field-name">${esc(FIELD_LABELS[f] || f)}</td>
              <td class="diff-cell diff-cell-old">${formatFieldValue(oldVal, f)}</td>
              <td class="diff-cell diff-cell-new">${formatFieldValue(newVal, f)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

async function toggleDiffView(erId, appId, changesJson, toggleBtn, snapshotJson) {
  const diffEl = document.getElementById(`er-diff-${erId}`);
  if (!diffEl) return;
  if (diffEl.classList.contains("open")) {
    diffEl.classList.remove("open");
    diffEl.innerHTML = "";
    toggleBtn.textContent = "📋 View Changes";
    return;
  }
  diffEl.innerHTML = '<p class="diff-loading">Loading diff…</p>';
  diffEl.classList.add("open");
  toggleBtn.textContent = "▲ Hide Changes";
  try {
    const app = apps.find(a => a.id === appId) || await getAppFromFirestore(appId);
    const changes = JSON.parse(decodeURIComponent(changesJson));
    const snapshot = snapshotJson ? JSON.parse(decodeURIComponent(snapshotJson)) : null;
    diffEl.innerHTML = renderDiffTable(changes, app, snapshot);
  } catch (err) {
    diffEl.innerHTML = '<p class="diff-empty-msg">Could not load diff.</p>';
  }
}

function renderERCard(er, appId, opts = {}) {
  const date = new Date(er.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const statusClass = er.status === "open" ? "er-status-open" : er.status === "merged" ? "er-status-merged" : "er-status-closed";
  const statusIcon = er.status === "open" ? "🟢" : er.status === "merged" ? "🟣" : "🔴";
  const changedFields = Object.keys(er.changes || {}).filter(k => k !== "reason");
  const submitter = er.submitter || {};
  const avatarHtml = submitter.photoURL
    ? `<img class="er-avatar-sm" src="${escUrl(submitter.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="er-avatar-sm-fallback">${esc((submitter.displayName || "U").charAt(0))}</div>`;
  const approvals = er.approvals || [];
  const canReview = isAdmin && er.status === "open";
  const snapshot = er.mergeSnapshot || er.originalSnapshot || null;
  const snapshotAttr = snapshot ? `data-snapshot="${encodeURIComponent(JSON.stringify(snapshot))}"` : "";

  return `
    <div class="er-card" data-er-id="${esc(er.id)}">
      <div class="er-card-header">
        <span class="er-status ${statusClass}">${statusIcon} ${esc(er.status)}</span>
        ${er.locked ? '<span class="er-locked-badge">🔒 Locked</span>' : ""}
        ${approvals.length ? `<span class="er-approvals">✓ ${approvals.length} approval${approvals.length > 1 ? "s" : ""}</span>` : ""}
        <span class="er-date">${date}</span>
      </div>
      <div class="er-card-submitter">
        ${avatarHtml}
        <span class="er-submitter-link">${esc(submitter.displayName || "Anonymous")}</span>
        ${submitter.provider ? `<span class="er-provider-sm">via ${esc(submitter.provider === "github.com" ? "GitHub" : "Google")}</span>` : ""}
      </div>
      <div class="er-card-changes">
        <span class="er-changes-label">Changes:</span>
        ${changedFields.map(f => `<span class="er-change-tag">${esc(f)}</span>`).join("")}
        <button class="btn btn-sm btn-secondary er-diff-toggle" data-er-id="${esc(er.id)}" data-app-id="${esc(appId)}" data-changes="${encodeURIComponent(JSON.stringify(er.changes || {}))}" ${snapshotAttr}>📋 View Changes</button>
      </div>
      <div class="er-diff-container" id="er-diff-${esc(er.id)}"></div>
      ${er.changes?.reason ? `<p class="er-card-reason">"${esc(er.changes.reason)}"</p>` : ""}
      <div class="er-comments-section" id="er-comments-${esc(er.id)}"></div>
      ${currentUser ? `
        <div class="er-comment-form">
          <input type="text" class="er-comment-input" data-er-id="${esc(er.id)}" placeholder="Add a comment…" maxlength="500">
          <button class="btn btn-sm btn-secondary er-comment-btn" data-er-id="${esc(er.id)}">Comment</button>
        </div>
      ` : ""}
      ${canReview ? `
        <div class="er-review-actions">
          <button class="btn btn-sm btn-primary er-merge-btn" data-er-id="${esc(er.id)}">Merge</button>
          <button class="btn btn-sm btn-secondary er-approve-btn" data-er-id="${esc(er.id)}">Approve</button>
          <button class="btn btn-sm btn-secondary er-reject-btn" data-er-id="${esc(er.id)}">Reject</button>
        </div>
      ` : ""}
    </div>
  `;
}

function bindERCardHandlers(container, appId, reloadFn) {
  // Diff toggle handlers
  container.querySelectorAll(".er-diff-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      toggleDiffView(btn.dataset.erId, btn.dataset.appId, btn.dataset.changes, btn, btn.dataset.snapshot || null);
    });
  });

  // Comment handlers
  container.querySelectorAll(".er-comment-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const input = container.querySelector(`.er-comment-input[data-er-id="${btn.dataset.erId}"]`);
      const text = input?.value.trim();
      if (!text) return;
      try {
        await addReviewComment(btn.dataset.erId, text, currentUser);
        input.value = "";
        loadERComments(btn.dataset.erId);
      } catch (err) { showToast(err.message); }
    });
  });

  // Admin review handlers
  container.querySelectorAll(".er-merge-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await mergeEditRequest(btn.dataset.erId, currentUser.uid);
        showToast("Edit request merged!");
        await loadApps();
        reloadFn();
      } catch (err) { showToast(err.message); }
      btn.disabled = false;
    });
  });
  container.querySelectorAll(".er-approve-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await approveEditRequest(btn.dataset.erId, currentUser.uid);
        showToast("Approved!");
        reloadFn();
      } catch (err) { showToast(err.message); }
      btn.disabled = false;
    });
  });
  container.querySelectorAll(".er-reject-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const reason = await showInputModal("Reason for rejection:");
      if (!reason) return;
      btn.disabled = true;
      try {
        await rejectEditRequest(btn.dataset.erId, currentUser.uid, reason);
        showToast("Rejected");
        reloadFn();
      } catch (err) { showToast(err.message); }
      btn.disabled = false;
    });
  });
}

async function loadEditRequestsForDetail(appId) {
  const listEl = document.getElementById(`er-list-${appId}`);
  const viewAllBtn = document.getElementById(`view-all-er-${appId}`);
  if (!listEl) return;

  try {
    const requests = await getEditRequestsForApp(appId);
    if (requests.length === 0) {
      listEl.innerHTML = `<p class="er-empty">No edit requests yet. Be the first to suggest an improvement!</p>`;
      if (viewAllBtn) viewAllBtn.style.display = "none";
      return;
    }

    const preview = requests.slice(0, 3);
    listEl.innerHTML = preview.map(er => renderERCard(er, appId)).join("");

    for (const er of preview) { loadERComments(er.id); }
    bindERCardHandlers(listEl, appId, () => loadEditRequestsForDetail(appId));
    if (viewAllBtn) viewAllBtn.style.display = requests.length > 3 ? "" : "none";
  } catch (err) {
    listEl.innerHTML = `<p class="er-empty">Could not load edit requests.</p>`;
  }
}

async function loadERComments(editRequestId) {
  const container = document.getElementById(`er-comments-${editRequestId}`);
  if (!container) return;
  try {
    const comments = await getReviewComments(editRequestId);
    if (!comments.length) { container.innerHTML = ""; return; }

    const INITIAL_SHOW = 3;
    const LOAD_MORE = 10;

    const renderComment = c => {
      const typeClass = c.type === "approval" ? "comment-approval" : c.type === "rejection" ? "comment-rejection" : c.type === "merge" ? "comment-merge" : "";
      const avatar = c.authorPhoto
        ? `<img class="er-comment-avatar" src="${escUrl(c.authorPhoto)}" alt="" referrerpolicy="no-referrer">`
        : `<div class="er-comment-avatar-fallback">${esc((c.authorName || "U").charAt(0))}</div>`;
      return `
        <div class="er-comment ${typeClass}">
          ${avatar}
          <div class="er-comment-body">
            <span class="er-comment-author">${esc(c.authorName)}</span>
            <span class="er-comment-text">${esc(c.text)}</span>
          </div>
          <span class="er-comment-time">${new Date(c.createdAt).toLocaleDateString()}</span>
        </div>`;
    };

    let shown = INITIAL_SHOW;
    function render() {
      const visible = comments.slice(0, shown);
      const remaining = comments.length - shown;
      container.innerHTML = visible.map(renderComment).join("")
        + (remaining > 0 ? `<button class="er-load-more-btn" id="er-load-more-${editRequestId}">Load more comments (${remaining} remaining)</button>` : "");
      const loadMoreBtn = document.getElementById(`er-load-more-${editRequestId}`);
      if (loadMoreBtn) {
        loadMoreBtn.addEventListener("click", () => {
          shown = Math.min(shown + LOAD_MORE, comments.length);
          render();
        });
      }
    }
    render();
  } catch (e) {
    container.innerHTML = "";
  }
}

async function loadSubComments(submissionId) {
  const container = document.getElementById(`sub-comments-${submissionId}`);
  if (!container) return;
  try {
    const comments = await getSubmissionComments(submissionId);
    if (!comments.length) { container.innerHTML = ""; return; }
    container.innerHTML = comments.map(c => {
      const typeClass = c.type === "changes_requested" ? "comment-changes-requested" :
                        c.type === "resubmission" ? "comment-resubmission" :
                        c.type === "comment" ? "" : "";
      return `
        <div class="er-comment ${typeClass}">
          ${c.authorPhoto ? `<img class="er-avatar-sm" src="${escUrl(c.authorPhoto)}" alt="" referrerpolicy="no-referrer">` : ""}
          <span class="er-comment-author">${esc(c.authorName)}</span>
          <span class="er-comment-text">${esc(c.text)}</span>
          <span class="er-comment-time">${new Date(c.createdAt).toLocaleDateString()}</span>
        </div>`;
    }).join("");
  } catch (e) {
    container.innerHTML = "";
  }
}

// ── Rankings Page ────────────────────────────────────────────────────────────
function showRankings() {
  const views = ["home-view", "detail-view", "profile-view", "org-view", "admin-view", "verify-view", "team-view", "team-manage-view"];
  views.forEach(v => { const el = document.getElementById(v); if (el) el.style.display = "none"; });
  const rankView = document.getElementById("rankings-view");
  rankView.style.display = "block";

  const ranked = getRankedApps();

  rankView.innerHTML = `
    <div class="rankings-page">
      <a href="/" class="back-link">← Back to library</a>
      <h1 class="rankings-title">🏆 App Rankings</h1>
      <p class="rankings-subtitle">Ranked by community likes and popularity</p>
      <div class="rankings-list">
        ${ranked.map((app, i) => {
          const score = calcRankScore(app).toFixed(0);
          const logoHtml = app.logo
            ? `<img class="rank-logo" src="${escUrl(app.logo)}" alt="" onerror="this.style.display='none'">`
            : `<div class="rank-logo-fallback">${esc(app.name.charAt(0))}</div>`;
          return `
            <a href="/app/${esc(app.id)}" class="ranking-item ${i < 3 ? 'top-' + (i+1) : ''}">
              <span class="ranking-pos">${i + 1}</span>
              ${logoHtml}
              <div class="ranking-info">
                <span class="ranking-name">${esc(app.name)}</span>
                <span class="ranking-cat">${esc(app.category)}</span>
              </div>
              <div class="ranking-metrics">
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

      // Update vote button counts
      const likeCount = document.getElementById(`like-count-${appId}`);
      const dislikeCount = document.getElementById(`dislike-count-${appId}`);
      if (likeCount) likeCount.textContent = updatedApp.likes || 0;
      if (dislikeCount) dislikeCount.textContent = updatedApp.dislikes || 0;

      // Update stat cards (Likes = 2nd card, Dislikes = 3rd card)
      const detailView = document.getElementById("detail-view");
      if (detailView) {
        const statCards = detailView.querySelectorAll('.detail-stats .detail-stat-card .stat-number');
        if (statCards[1]) statCards[1].textContent = updatedApp.likes || 0;
        if (statCards[2]) statCards[2].textContent = updatedApp.dislikes || 0;
      }

      // Toggle active states
      const likeBtn = document.querySelector(`.like-btn[data-app-id="${CSS.escape(appId)}"]`);
      const dislikeBtn = document.querySelector(`.dislike-btn[data-app-id="${CSS.escape(appId)}"]`);
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

  let logo = form.querySelector("#sub-logo").value.trim();
  const logoFile = document.getElementById("sub-logo-file")?._selectedFile;
  if (logo && !logoFile && !isValidLogoURL(logo)) { showFormError(form, "Logo URL must end in .jpg, .jpeg, .png, or .svg"); return; }

  // If a file was selected, upload it to Firebase Storage
  if (logoFile) {
    btn.disabled = true;
    btn.textContent = "Uploading logo…";
    try {
      logo = await uploadLogoToStorage(logoFile, name);
    } catch (err) {
      showFormError(form, err.message || "Logo upload failed.");
      btn.disabled = false;
      btn.textContent = btn.getAttribute("data-original") || "Submit App";
      return;
    }
  }

  // Parse features (one per line)
  const featuresRaw = (form.querySelector("#sub-features")?.value || "").trim();
  const features = featuresRaw ? featuresRaw.split("\n").map(f => f.trim()).filter(Boolean) : [];

  // Parse tags (comma separated)
  const tagsRaw = (form.querySelector("#sub-tags")?.value || "").trim();
  const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim().toLowerCase()).filter(Boolean) : [];

  // Parse screenshots (one URL per line)
  const screenshotsRaw = (form.querySelector("#sub-screenshots")?.value || "").trim();
  const screenshots = screenshotsRaw ? screenshotsRaw.split("\n").map(s => s.trim()).filter(Boolean) : [];

  // Parse install methods (label | command, one per line)
  const installRaw = (form.querySelector("#sub-install-methods")?.value || "").trim();
  const installMethods = installRaw ? installRaw.split("\n").map(line => {
    const parts = line.split("|").map(p => p.trim());
    return parts.length >= 2 ? { label: parts[0], command: parts[1] } : null;
  }).filter(Boolean) : [];

  const payload = {
    name,
    logo,
    category: form.querySelector("#sub-category").value,
    description,
    fullDescription: (form.querySelector("#sub-full-description")?.value || "").trim(),
    features,
    uses,
    alternative: form.querySelector("#sub-alternative").value.trim(),
    download: form.querySelector("#sub-download").value.trim(),
    source: form.querySelector("#sub-source").value.trim(),
    website: (form.querySelector("#sub-website")?.value || "").trim(),
    docs: (form.querySelector("#sub-docs")?.value || "").trim(),
    maintainer: form.querySelector("#sub-maintainer").value,
    developer: (form.querySelector("#sub-developer")?.value || "").trim(),
    developerUrl: (form.querySelector("#sub-developer-url")?.value || "").trim(),
    license: (form.querySelector("#sub-license")?.value || ""),
    version: (form.querySelector("#sub-version")?.value || "").trim(),
    fileSize: (form.querySelector("#sub-filesize")?.value || "").trim(),
    tags,
    screenshots,
    installMethods,
    systemRequirements: (form.querySelector("#sub-sysreq")?.value || "").trim(),
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

// ── Resubmit Modal ───────────────────────────────────────────────────────────
function openResubmitModal(sub) {
  const modal = document.getElementById("resubmit-modal");
  const feedback = document.getElementById("resubmit-feedback");

  // Show feedback from reviewer
  if (sub.changesComment) {
    feedback.innerHTML = `<div class="resubmit-feedback-box"><strong>🟠 Reviewer feedback:</strong> ${esc(sub.changesComment)}</div>`;
  } else {
    feedback.innerHTML = "";
  }

  // Pre-fill form with current submission data
  document.getElementById("resub-id").value = sub.id;
  document.getElementById("resub-name").value = sub.name || "";
  document.getElementById("resub-category").value = sub.category || "";
  document.getElementById("resub-logo").value = sub.logo || "";
  document.getElementById("resub-alternative").value = sub.alternative || "";
  document.getElementById("resub-description").value = sub.description || "";
  document.getElementById("resub-uses").value = sub.uses || "";
  document.getElementById("resub-download").value = sub.download || "";
  document.getElementById("resub-source").value = sub.source || "";
  document.getElementById("resub-maintainer").value = sub.maintainer || "individual";
  document.getElementById("resub-website").value = sub.website || "";
  document.getElementById("resub-docs").value = sub.docs || "";
  document.getElementById("resub-version").value = sub.version || "";
  document.getElementById("resub-license").value = sub.license || "";
  document.getElementById("resub-filesize").value = sub.fileSize || "";
  document.getElementById("resub-developer").value = sub.developer || "";
  document.getElementById("resub-developer-url").value = sub.developerUrl || "";
  document.getElementById("resub-full-description").value = sub.fullDescription || "";
  document.getElementById("resub-features").value = (sub.features || []).join("\n");
  document.getElementById("resub-tags").value = (sub.tags || []).join(", ");
  document.getElementById("resub-screenshots").value = (sub.screenshots || []).join("\n");
  document.getElementById("resub-install-methods").value = (sub.installMethods || []).map(m => m.label + " | " + m.command).join("\n");
  document.getElementById("resub-sysreq").value = sub.systemRequirements || "";

  // Check platforms
  document.querySelectorAll("input[name='resub-platforms']").forEach(cb => {
    cb.checked = (sub.platforms || []).includes(cb.value);
  });

  clearFormMsg(document.getElementById("resubmit-form"));
  modal.classList.add("open");
}

async function handleResubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector(".btn-submit");
  const subId = document.getElementById("resub-id").value;
  const platforms = [...form.querySelectorAll("input[name='resub-platforms']:checked")].map(el => el.value);

  if (!platforms.length) { showFormError(form, "Select at least one platform."); return; }

  const resubLogo = document.getElementById("resub-logo").value.trim();
  if (resubLogo && !isValidLogoURL(resubLogo)) { showFormError(form, "Logo URL must end in .jpg, .jpeg, .png, or .svg"); return; }

  const updatedData = {
    name: document.getElementById("resub-name").value.trim(),
    logo: resubLogo,
    category: document.getElementById("resub-category").value,
    description: document.getElementById("resub-description").value.trim(),
    uses: document.getElementById("resub-uses").value.trim(),
    alternative: document.getElementById("resub-alternative").value.trim(),
    download: document.getElementById("resub-download").value.trim(),
    source: document.getElementById("resub-source").value.trim(),
    maintainer: document.getElementById("resub-maintainer").value,
    platforms,
    website: (document.getElementById("resub-website")?.value || "").trim(),
    docs: (document.getElementById("resub-docs")?.value || "").trim(),
    version: (document.getElementById("resub-version")?.value || "").trim(),
    license: (document.getElementById("resub-license")?.value || ""),
    fileSize: (document.getElementById("resub-filesize")?.value || "").trim(),
    developer: (document.getElementById("resub-developer")?.value || "").trim(),
    developerUrl: (document.getElementById("resub-developer-url")?.value || "").trim(),
    fullDescription: (document.getElementById("resub-full-description")?.value || "").trim(),
    systemRequirements: (document.getElementById("resub-sysreq")?.value || "").trim(),
    features: (document.getElementById("resub-features")?.value || "").trim().split("\n").map(f => f.trim()).filter(Boolean),
    tags: (document.getElementById("resub-tags")?.value || "").trim().split(",").map(t => t.trim().toLowerCase()).filter(Boolean),
    screenshots: (document.getElementById("resub-screenshots")?.value || "").trim().split("\n").map(s => s.trim()).filter(Boolean),
    installMethods: (document.getElementById("resub-install-methods")?.value || "").trim().split("\n").map(line => {
      const parts = line.split("|").map(p => p.trim());
      return parts.length >= 2 ? { label: parts[0], command: parts[1] } : null;
    }).filter(Boolean),
  };

  if (updatedData.name.length < 2) { showFormError(form, "App name must be at least 2 characters."); return; }
  if (updatedData.description.length < 10) { showFormError(form, "Description must be at least 10 characters."); return; }

  btn.disabled = true;
  btn.textContent = "Resubmitting…";
  try {
    await updateSubmission(subId, currentUser.uid, updatedData);
    showFormSuccess(form, "Resubmitted for review!");
    setTimeout(() => {
      closeModal("resubmit-modal");
      showProfile(null);
    }, 2000);
  } catch (err) {
    showFormError(form, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Resubmit for Review";
  }
}

// ── Validation Helpers ────────────────────────────────────────────────────────
function isValidLogoURL(url) {
  if (!url) return true; // logo is optional
  try {
    const parsed = new URL(url, location.href);
    // Only allow https: scheme
    if (parsed.protocol !== "https:") return false;
    // Allowlist of trusted image hostnames
    const trustedHosts = [
      "firebasestorage.googleapis.com",
      "raw.githubusercontent.com",
      "i.imgur.com",
      "imgur.com"
    ];
    const isTrustedHost = trustedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith("." + h));
    if (isTrustedHost) return true;
    // For other https hosts, require an image file extension
    return /\.(jpe?g|png|svg|webp)(\?.*)?$/i.test(parsed.pathname);
  } catch {
    return false;
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
async function updateAuthUI(user) {
  currentUser = user;
  const trigger = document.getElementById("auth-trigger");
  const content = document.getElementById("auth-content");
  const adminLink = document.getElementById("admin-nav-link");
  const profileLink = document.getElementById("profile-nav-link");

  if (user) {
    // Create/update user record in Firestore
    userRecord = await createOrUpdateUserRecord(user);
    isAdmin = userRecord && ["admin", "openlib-team"].includes(userRecord.role);

    // Show/hide admin link
    if (adminLink) adminLink.style.display = isAdmin ? "inline-flex" : "none";
    if (profileLink) profileLink.style.display = "inline-flex";

    const avatarHtml = user.photoURL
      ? `<img class="auth-avatar" src="${escUrl(user.photoURL)}" alt="" referrerpolicy="no-referrer">`
      : `<span id="auth-icon">✓</span>`;
    trigger.innerHTML = `${avatarHtml}<span id="auth-label">${esc(user.displayName || "Account")}</span>`;
    const providerName = user.providerData?.[0]?.providerId === "github.com" ? "GitHub" : "Google";
    const linkedProviders = getLinkedProviders();
    const linkedDisplay = linkedProviders.map(p =>
      p === "github.com" ? "GitHub" : p === "google.com" ? "Google" : p
    ).join(" + ");
    content.innerHTML = `
      <div class="user-info">
        ${user.photoURL ? `<img class="auth-dropdown-avatar" src="${escUrl(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : ""}
        <div class="user-name">${esc(user.displayName || "User")} ${verifiedBadge(userRecord)}</div>
        <div class="user-email">${esc(user.email || "")}</div>
        <div class="user-provider">Signed in via ${esc(linkedDisplay || providerName)}</div>
        <div class="user-role">${roleBadge(userRecord?.role || "user")}</div>
      </div>
      <a href="/profile" class="auth-option profile-link">👤 My Profile</a>
      <button class="auth-option signout" id="signout-btn">← Sign Out</button>
    `;
  } else {
    userRecord = null;
    isAdmin = false;
    if (adminLink) adminLink.style.display = "none";
    if (profileLink) profileLink.style.display = "none";
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
        if (err.code === "auth/account-exists-with-different-credential") {
          dropdown.classList.remove("open");
          showAccountLinkingModal(err.email, err.existingProvider);
        } else if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
          // User closed the popup — do nothing
        } else {
          showToast("Sign-in failed: " + err.message);
        }
      }
    }
    if (e.target.closest("#github-signin-btn")) {
      try {
        await signInWithGitHub();
        dropdown.classList.remove("open");
        showToast("Signed in with GitHub ✓");
      } catch (err) {
        if (err.code === "auth/account-exists-with-different-credential") {
          dropdown.classList.remove("open");
          showAccountLinkingModal(err.email, err.existingProvider);
        } else if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
          // User closed the popup — do nothing
        } else {
          showToast("Sign-in failed: " + err.message);
        }
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

// ── Account Linking Modal ────────────────────────────────────────────────────
function showAccountLinkingModal(email, existingProvider) {
  const modal = document.getElementById("account-link-modal");
  if (!modal) return;

  const providerName = existingProvider === "github.com" ? "GitHub" : "Google";
  const attemptedName = existingProvider === "github.com" ? "Google" : "GitHub";

  modal.querySelector("#link-modal-email").textContent = email || "your email";
  modal.querySelector("#link-modal-existing-provider").textContent = providerName;
  modal.querySelector("#link-modal-attempted-provider").textContent = attemptedName;

  const linkBtn = modal.querySelector("#link-modal-signin-btn");
  linkBtn.textContent = "Sign in with " + providerName;
  linkBtn.dataset.provider = existingProvider;

  modal.classList.add("open");
}

function hideAccountLinkingModal() {
  const modal = document.getElementById("account-link-modal");
  if (modal) modal.classList.remove("open");
}

function setupAccountLinkingModal() {
  const modal = document.getElementById("account-link-modal");
  if (!modal) return;

  // "Sign in with [existing provider]" button — signs in and auto-links
  modal.querySelector("#link-modal-signin-btn")?.addEventListener("click", async () => {
    const provider = modal.querySelector("#link-modal-signin-btn").dataset.provider;
    try {
      if (provider === "google.com") {
        await signInWithGoogle();
      } else if (provider === "github.com") {
        await signInWithGitHub();
      }
      hideAccountLinkingModal();
      showToast("Accounts linked successfully ✓");
    } catch (err) {
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
        return;
      }
      showToast("Linking failed: " + err.message);
    }
  });

  // Cancel button(s)
  modal.querySelector("#link-modal-cancel-btn")?.addEventListener("click", () => {
    clearPendingLinkData();
    hideAccountLinkingModal();
  });
  modal.querySelector("#link-modal-cancel-btn-secondary")?.addEventListener("click", () => {
    clearPendingLinkData();
    hideAccountLinkingModal();
  });

  // Close on backdrop click
  modal.addEventListener("click", e => {
    if (e.target === modal) {
      clearPendingLinkData();
      hideAccountLinkingModal();
    }
  });
}

function initAuth() {
  onUserAuthStateChanged(async user => {
    await updateAuthUI(user);
    renderRecommendations();
  });
  setupAuthHandlers();
  setupAccountLinkingModal();
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
const BASE_URL = location.origin;

function navigateTo(path) {
  history.pushState(null, "", path);
  handleRoute();
}

function updatePageMeta({ title, description, url }) {
  document.title = title;
  const setAttr = (id, attr, val) => { const el = document.getElementById(id); if (el) el.setAttribute(attr, val); };
  setAttr("meta-description", "content", description);
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
  const path = location.pathname || "/";
  if (path.match(/^\/app\/[^/]+\/reviews$/)) {
    const appId = decodeURIComponent(path.replace("/app/", "").replace("/reviews", ""));
    const app = apps.find(a => a.id === appId);
    updatePageMeta({
      title: app ? `Reviews — ${app.name} — OpenLib` : "Reviews — OpenLib",
      description: app ? `Read reviews for ${app.name} on OpenLib.` : "App reviews on OpenLib.",
      url: `${BASE_URL}/app/${encodeURIComponent(appId)}/reviews`
    });
    showReviewsPage(appId);
  } else if (path.match(/^\/app\/[^/]+\/edit-requests$/)) {
    const appId = decodeURIComponent(path.replace("/app/", "").replace("/edit-requests", ""));
    const app = apps.find(a => a.id === appId);
    updatePageMeta({
      title: app ? `Edit Requests — ${app.name} — OpenLib` : "Edit Requests — OpenLib",
      description: app ? `View edit requests for ${app.name} on OpenLib.` : "App edit requests on OpenLib.",
      url: `${BASE_URL}/app/${encodeURIComponent(appId)}/edit-requests`
    });
    showEditRequestsPage(appId);
  } else if (path.match(/^\/app\/[^/]+\/versions$/)) {
    const appId = decodeURIComponent(path.replace("/app/", "").replace("/versions", ""));
    const app = apps.find(a => a.id === appId);
    updatePageMeta({
      title: app ? `Version History — ${app.name} — OpenLib` : "Version History — OpenLib",
      description: app ? `View version history for ${app.name} on OpenLib.` : "App version history on OpenLib.",
      url: `${BASE_URL}/app/${encodeURIComponent(appId)}/versions`
    });
    showVersionHistoryPage(appId);
  } else if (path.startsWith("/app/")) {
    const appId = decodeURIComponent(path.replace("/app/", ""));
    const app = apps.find(a => a.id === appId);
    updatePageMeta({
      title: app ? `${app.name} — OpenLib` : "App — OpenLib",
      description: app ? app.description : "Open-source app details on OpenLib.",
      url: `${BASE_URL}/app/${encodeURIComponent(appId)}`
    });
    showAppDetail(appId);
  } else if (path === "/rankings") {
    updatePageMeta({
      title: "Rankings — OpenLib",
      description: "Top-rated open-source apps ranked by the OpenLib community.",
      url: `${BASE_URL}/rankings`
    });
    showRankings();
  } else if (path === "/profile" || path.startsWith("/profile/")) {
    const uid = path === "/profile" ? null : decodeURIComponent(path.replace("/profile/", ""));
    updatePageMeta({ title: "Profile — OpenLib", description: "User profile on OpenLib.", url: `${BASE_URL}${path}` });
    showProfile(uid);
  } else if (path.startsWith("/org/")) {
    const orgId = decodeURIComponent(path.replace("/org/", ""));
    updatePageMeta({ title: "Organization — OpenLib", description: "Organization on OpenLib.", url: `${BASE_URL}${path}` });
    showOrgView(orgId);
  } else if (path === "/admin") {
    updatePageMeta({ title: "Admin — OpenLib", description: "Admin dashboard.", url: `${BASE_URL}/admin` });
    showAdminDashboard();
  } else if (path === "/verify") {
    updatePageMeta({ title: "Verify Submissions — OpenLib", description: "Review and verify app submissions.", url: `${BASE_URL}/verify` });
    showVerifySubmissions();
  } else if (path === "/team/manage") {
    updatePageMeta({ title: "Team Management — OpenLib", description: "Manage the OpenLib team.", url: `${BASE_URL}/team/manage` });
    showTeamManagePage();
  } else if (path === "/team") {
    updatePageMeta({ title: "OpenLib Team — OpenLib", description: "Meet the OpenLib team — admins and contributors curating the open-source app library.", url: `${BASE_URL}/team` });
    showOpenLibTeamPage();
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
  const views = ["detail-view", "rankings-view", "profile-view", "org-view", "admin-view", "verify-view", "team-view", "team-manage-view"];
  views.forEach(v => { const el = document.getElementById(v); if (el) el.style.display = "none"; });
  document.getElementById("home-view").style.display = "block";
  buildFilters();
  renderGrid(getFiltered());
  renderRecommendations();
}

async function showReviewsPage(appId) {
  const views = ["home-view", "rankings-view", "profile-view", "org-view", "admin-view", "verify-view", "team-view", "team-manage-view"];
  views.forEach(v => { const el = document.getElementById(v); if (el) el.style.display = "none"; });
  const detailView = document.getElementById("detail-view");
  detailView.style.display = "block";

  let app = apps.find(a => a.id === appId);
  if (!app) { try { app = await getAppFromFirestore(appId); } catch(e) {} }
  if (!app) { detailView.innerHTML = `<div class="detail-loading">App not found.</div>`; return; }

  const hasReviewed = currentUser ? await getUserReviewForApp(appId, currentUser.uid) : null;

  detailView.innerHTML = `
    <div class="reviews-page">
      <div class="reviews-page-header">
        <a href="/app/${esc(appId)}" class="reviews-back-link">← Back to ${esc(app.name)}</a>
        <h2>Reviews for ${esc(app.name)}</h2>
        <div class="reviews-page-actions">
          ${currentUser ? (hasReviewed
            ? `<button class="btn btn-secondary btn-sm write-review-btn review-already-done" disabled>✅ Already Reviewed</button>`
            : `<button class="btn btn-primary btn-sm write-review-btn" id="write-review-page-btn">✏️ Write a Review</button>`)
            : `<p class="review-signin-hint">Sign in to write a review.</p>`}
        </div>
      </div>
      ${currentUser && !hasReviewed ? `
      <div class="review-form-wrapper" id="review-form-wrapper-page" style="display:none;">
        <form class="review-form" id="review-form-page">
          <div class="review-rating-input">
            <span class="review-star" data-star="1">★</span>
            <span class="review-star" data-star="2">★</span>
            <span class="review-star" data-star="3">★</span>
            <span class="review-star" data-star="4">★</span>
            <span class="review-star" data-star="5">★</span>
            <input type="hidden" id="review-rating-page" value="5">
          </div>
          <input type="text" class="review-title-input" id="review-title-page" placeholder="Review title (optional)" maxlength="120">
          <textarea class="review-text-input" id="review-text-page" rows="3" placeholder="Share your experience with ${esc(app.name)}…" maxlength="2000" required></textarea>
          <div class="review-form-actions">
            <button type="submit" class="btn btn-primary btn-sm">Submit Review</button>
            <button type="button" class="btn btn-secondary btn-sm review-cancel-btn" id="review-cancel-page">Cancel</button>
          </div>
          <div class="form-msg review-msg" role="alert"></div>
        </form>
      </div>
      <div class="review-submitted-msg" id="review-submitted-page" style="display:none;">
        <span class="review-success-icon">✅</span> Your review has been submitted. Thank you!
      </div>` : ""}
      <div class="review-sort-btns">
        <button class="review-sort-btn active" data-sort="latest">Latest</button>
        <button class="review-sort-btn" data-sort="top">Top</button>
        <button class="review-sort-btn" data-sort="helpful">Helpful</button>
      </div>
      <div class="reviews-list" id="reviews-list-full-${esc(appId)}">
        <p class="er-loading">Loading reviews…</p>
      </div>
    </div>`;

  // Sort buttons
  detailView.querySelectorAll(".review-sort-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      detailView.querySelectorAll(".review-sort-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadAppReviews(appId, btn.dataset.sort);
    });
  });

  loadAppReviews(appId, "latest");

  // Write review form on reviews page
  const writeBtn = document.getElementById("write-review-page-btn");
  const wrapper = document.getElementById("review-form-wrapper-page");
  const cancelBtn = document.getElementById("review-cancel-page");
  const form = document.getElementById("review-form-page");
  const submittedMsg = document.getElementById("review-submitted-page");

  if (writeBtn && wrapper) {
    writeBtn.addEventListener("click", () => { wrapper.style.display = ""; writeBtn.style.display = "none"; });
  }
  if (cancelBtn && wrapper && writeBtn) {
    cancelBtn.addEventListener("click", () => { wrapper.style.display = "none"; writeBtn.style.display = ""; });
  }

  if (form) {
    const stars = form.querySelectorAll(".review-star");
    const ratingInput = document.getElementById("review-rating-page");
    let selectedRating = 5;
    function updateStars(rating) { stars.forEach((s, i) => s.classList.toggle("selected", i < rating)); }
    updateStars(5);
    stars.forEach(star => {
      star.addEventListener("click", () => { selectedRating = parseInt(star.dataset.star); ratingInput.value = selectedRating; updateStars(selectedRating); });
      star.addEventListener("mouseenter", () => updateStars(parseInt(star.dataset.star)));
      star.addEventListener("mouseleave", () => updateStars(selectedRating));
    });

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const title = document.getElementById("review-title-page").value.trim();
      const text = document.getElementById("review-text-page").value.trim();
      const msg = form.querySelector(".review-msg");
      if (!text) { msg.textContent = "Please write a review."; msg.className = "form-msg review-msg error"; return; }
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.textContent = "Submitting…";
      try {
        await addAppReview(appId, { rating: selectedRating, title, text }, currentUser);
        if (wrapper) wrapper.style.display = "none";
        if (submittedMsg) submittedMsg.style.display = "";
        loadAppReviews(appId, "latest");
      } catch (err) {
        msg.textContent = err.message;
        msg.className = "form-msg review-msg error";
        btn.disabled = false;
        btn.textContent = "Submit Review";
      }
    });
  }

  // Back link SPA navigation
  detailView.querySelector(".reviews-back-link")?.addEventListener("click", e => {
    e.preventDefault();
    navigateTo(`/app/${appId}`);
  });
}

async function showEditRequestsPage(appId) {
  const views = ["home-view", "rankings-view", "profile-view", "org-view", "admin-view", "verify-view", "team-view", "team-manage-view"];
  views.forEach(v => { const el = document.getElementById(v); if (el) el.style.display = "none"; });
  const detailView = document.getElementById("detail-view");
  detailView.style.display = "block";

  let app = apps.find(a => a.id === appId);
  if (!app) { try { app = await getAppFromFirestore(appId); } catch(e) {} }
  if (!app) { detailView.innerHTML = `<div class="detail-loading">App not found.</div>`; return; }

  detailView.innerHTML = `
    <div class="er-page">
      <div class="er-page-header">
        <a href="/app/${esc(appId)}" class="er-back-link">← Back to ${esc(app.name)}</a>
        <h2>Edit Requests for ${esc(app.name)}</h2>
      </div>
      <div class="er-status-filters">
        <button class="er-filter-btn active" data-filter="all">All</button>
        <button class="er-filter-btn" data-filter="open">Open</button>
        <button class="er-filter-btn" data-filter="merged">Merged</button>
        <button class="er-filter-btn" data-filter="closed">Closed</button>
      </div>
      <div class="er-full-list" id="er-full-list-${esc(appId)}">
        <p class="er-loading">Loading edit requests…</p>
      </div>
    </div>`;

  let allRequests = [];

  async function loadFiltered(filter) {
    const listEl = document.getElementById(`er-full-list-${appId}`);
    if (!listEl) return;
    try {
      if (!allRequests.length) allRequests = await getEditRequestsForApp(appId);
      const filtered = filter === "all" ? allRequests : allRequests.filter(r => r.status === filter);
      if (!filtered.length) {
        listEl.innerHTML = `<p class="er-empty">No ${filter === "all" ? "" : filter + " "}edit requests.</p>`;
        return;
      }
      listEl.innerHTML = filtered.map(er => renderERCard(er, appId)).join("");
      for (const er of filtered) { loadERComments(er.id); }
      bindERCardHandlers(listEl, appId, () => { allRequests = []; loadFiltered(filter); });
    } catch (err) {
      listEl.innerHTML = `<p class="er-empty">Could not load edit requests.</p>`;
    }
  }

  // Filter buttons
  detailView.querySelectorAll(".er-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      detailView.querySelectorAll(".er-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadFiltered(btn.dataset.filter);
    });
  });

  loadFiltered("all");

  // Back link SPA navigation
  detailView.querySelector(".er-back-link")?.addEventListener("click", e => {
    e.preventDefault();
    navigateTo(`/app/${appId}`);
  });
}

async function showVersionHistoryPage(appId) {
  const views = ["home-view", "rankings-view", "profile-view", "org-view", "admin-view", "verify-view", "team-view", "team-manage-view"];
  views.forEach(v => { const el = document.getElementById(v); if (el) el.style.display = "none"; });
  const detailView = document.getElementById("detail-view");
  detailView.style.display = "block";

  let app = apps.find(a => a.id === appId);
  if (!app) { try { app = await getAppFromFirestore(appId); } catch(e) {} }
  if (!app) { detailView.innerHTML = `<div class="detail-loading">App not found.</div>`; return; }

  detailView.innerHTML = `
    <div class="version-page">
      <div class="version-page-header">
        <a href="/app/${esc(appId)}" class="version-back-link">← Back to ${esc(app.name)}</a>
        <h2>Version History for ${esc(app.name)}</h2>
      </div>
      <div class="version-full-list" id="version-full-list-${esc(appId)}">
        <p class="er-loading">Loading version history…</p>
      </div>
    </div>`;

  async function loadAll() {
    const listEl = document.getElementById(`version-full-list-${appId}`);
    if (!listEl) return;
    try {
      const versions = await getAppVersions(appId);
      if (!versions.length) {
        listEl.innerHTML = `<p class="er-empty">No version history yet.</p>`;
        return;
      }
      listEl.innerHTML = versions.map(v => renderVersionCard(v, appId)).join("");
      bindVersionCardHandlers(listEl, appId, loadAll);
    } catch (err) {
      listEl.innerHTML = `<p class="er-empty">Could not load version history.</p>`;
    }
  }

  loadAll();

  detailView.querySelector(".version-back-link")?.addEventListener("click", e => {
    e.preventDefault();
    navigateTo(`/app/${appId}`);
  });
}

function renderCurrentView() {
  const path = location.pathname || "/";
  if (path.match(/^\/app\/[^/]+\/reviews$/)) {
    showReviewsPage(decodeURIComponent(path.replace("/app/", "").replace("/reviews", "")));
  } else if (path.match(/^\/app\/[^/]+\/edit-requests$/)) {
    showEditRequestsPage(decodeURIComponent(path.replace("/app/", "").replace("/edit-requests", "")));
  } else if (path.match(/^\/app\/[^/]+\/versions$/)) {
    showVersionHistoryPage(decodeURIComponent(path.replace("/app/", "").replace("/versions", "")));
  } else if (path.startsWith("/app/")) {
    showAppDetail(path.replace("/app/", ""));
  } else if (path === "/rankings") {
    showRankings();
  } else if (path === "/profile" || path.startsWith("/profile/")) {
    showProfile(path === "/profile" ? null : path.replace("/profile/", ""));
  } else if (path.startsWith("/org/")) {
    showOrgView(path.replace("/org/", ""));
  } else if (path === "/admin") {
    showAdminDashboard();
  } else if (path === "/verify") {
    showVerifySubmissions();
  } else {
    buildFilters();
    renderGrid(getFiltered());
    renderRecommendations();
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  // Redirect legacy hash URLs to clean paths
  if (location.hash && location.hash.startsWith("#/")) {
    const cleanPath = location.hash.slice(1); // "#/app/x" → "/app/x"
    history.replaceState(null, "", cleanPath);
  }

  initTheme();
  initAuth();

  // Non-blocking version update check (runs in background)
  checkForUpdates();

  // Load data from Firestore
  await loadApps();

  buildFilters();
  renderGrid(getFiltered());

  // Route
  handleRoute();
  window.addEventListener("popstate", handleRoute);

  // Intercept internal link clicks for SPA navigation
  document.addEventListener("click", e => {
    const anchor = e.target.closest("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("mailto:") || anchor.hasAttribute("target")) return;
    if (href.startsWith("/") || href === "/") {
      e.preventDefault();
      navigateTo(href);
    }
  });

  // Event listeners
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
  document.getElementById("search-input").addEventListener("input", debounce(() => renderGrid(getFiltered()), 180));
  document.getElementById("submit-app-btn").addEventListener("click", openSubmitModal);
  document.getElementById("report-form").addEventListener("submit", handleReportSubmit);
  document.getElementById("submit-form").addEventListener("submit", handleSubmitApp);
  // Logo file upload → upload to Firebase Storage
  document.getElementById("sub-logo-file")?.addEventListener("change", e => {
    const file = e.target.files[0];
    const nameEl = document.getElementById("sub-logo-filename");
    if (!file) { if (nameEl) nameEl.textContent = ""; return; }
    if (nameEl) nameEl.textContent = file.name;
    // Store file reference for later upload during submission
    document.getElementById("sub-logo-file")._selectedFile = file;
  });
  document.getElementById("edit-request-form").addEventListener("submit", handleEditRequestSubmit);
  // Edit request logo file upload
  document.getElementById("er-logo-file")?.addEventListener("change", e => {
    const file = e.target.files[0];
    const nameEl = document.getElementById("er-logo-filename");
    if (!file) { if (nameEl) nameEl.textContent = ""; return; }
    if (nameEl) nameEl.textContent = file.name;
    document.getElementById("er-logo-file")._selectedFile = file;
  });
  document.getElementById("resubmit-form").addEventListener("submit", handleResubmit);

  // Grid events
  document.getElementById("app-grid").addEventListener("click", async e => {
    const rb = e.target.closest(".report-btn");
    if (rb) openReportModal(rb.dataset.appId, rb.dataset.appName);

    // Card bookmark button
    const bkBtn = e.target.closest(".card-bookmark-btn");
    if (bkBtn) {
      e.stopPropagation();
      if (!currentUser) { showToast("Sign in to bookmark apps."); return; }
      const appId = bkBtn.dataset.appId;
      try {
        const nowBookmarked = await toggleBookmark(currentUser.uid, appId);
        bkBtn.textContent = nowBookmarked ? "★" : "☆";
        bkBtn.classList.toggle("bookmarked", nowBookmarked);
      } catch (err) { showToast("Bookmark failed."); }
      return;
    }

    // Make entire card clickable to open detail view
    if (e.target.closest("a, button, .report-btn")) return;
    const card = e.target.closest(".app-card");
    if (card) {
      const appId = card.dataset.id;
      if (appId) navigateTo(`/app/${appId}`);
    }
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
      if (err.code === "auth/account-exists-with-different-credential") {
        loginModal.classList.remove("open");
        showAccountLinkingModal(err.email, err.existingProvider);
      } else if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
        showToast("Sign-in failed: " + err.message);
      }
    }
  });
  loginModal?.querySelector("#prompt-github-btn")?.addEventListener("click", async () => {
    try {
      await signInWithGitHub();
      loginModal.classList.remove("open");
      showToast("Signed in! You can now proceed.");
      if (loginModal.dataset.targetUrl) window.open(loginModal.dataset.targetUrl, "_blank", "noopener");
    } catch (err) {
      if (err.code === "auth/account-exists-with-different-credential") {
        loginModal.classList.remove("open");
        showAccountLinkingModal(err.email, err.existingProvider);
      } else if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
        showToast("Sign-in failed: " + err.message);
      }
    }
  });

  // Ranking nav link
  document.getElementById("ranking-nav-link")?.addEventListener("click", e => {
    e.preventDefault();
    navigateTo("/rankings");
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

  // Nav links
  document.getElementById("profile-nav-link")?.addEventListener("click", e => { e.preventDefault(); navigateTo("/profile"); });
  document.getElementById("admin-nav-link")?.addEventListener("click", e => { e.preventDefault(); navigateTo("/admin"); });

  // Create organization form
  document.getElementById("create-org-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.target;
    const name = document.getElementById("org-name").value.trim();
    const description = document.getElementById("org-description").value.trim();
    const logoURL = document.getElementById("org-logo").value.trim();
    const website = document.getElementById("org-website").value.trim();

    if (!name || name.length < 2) { showFormError(form, "Name must be at least 2 characters."); return; }

    const btn = form.querySelector(".btn-submit");
    btn.disabled = true;
    btn.textContent = "Creating…";
    try {
      const org = await createOrganization({ name, description, logoURL, website }, currentUser.uid);
      showFormSuccess(form, "Organization created!");
      userRecord = await getUserRecord(currentUser.uid);
      setTimeout(() => {
        closeModal("create-org-modal");
        navigateTo(`/org/${org.id}`);
      }, 1500);
    } catch (err) {
      showFormError(form, err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Create Organization";
    }
  });
}

document.addEventListener("DOMContentLoaded", init);

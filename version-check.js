// ── Version Update Detection ─────────────────────────────────────────────────
// Fully automatic: a predeploy hook stamps DEPLOY_TIMESTAMP on every
// `firebase deploy`. When an admin visits, the timestamp is auto-pushed to
// Firestore. Other users with older builds see a dismissible update banner.

import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { db } from './firebase-config.js';

// ── Auto-stamped by predeploy hook — DO NOT EDIT MANUALLY ────────────────────
const DEPLOY_TIMESTAMP = 1775423307;

const LS_KEY = "openlib_deploy_ts";
const SS_DISMISS_KEY = "openlib_update_dismissed";

/**
 * Run the version check after app initialises.
 * Non-blocking — call with `checkForUpdates()` (no await needed on critical path).
 */
export async function checkForUpdates() {
  try {
    if (sessionStorage.getItem(SS_DISMISS_KEY)) return;
    if (!DEPLOY_TIMESTAMP) return; // local dev — not stamped

    const snap = await getDoc(doc(db, "config", "app_version"));
    const remoteTs = snap.exists() ? (snap.data().deployTimestamp || 0) : 0;

    if (DEPLOY_TIMESTAMP >= remoteTs) {
      // This build is current or newer
      if (DEPLOY_TIMESTAMP > remoteTs) {
        // Newer build — auto-push to Firestore (only succeeds for admins)
        autoSyncVersion();
      }
      localStorage.setItem(LS_KEY, String(DEPLOY_TIMESTAMP));
      return;
    }

    // This build is outdated
    const localTs = Number(localStorage.getItem(LS_KEY) || "0");
    if (localTs >= remoteTs) return; // already seen / dismissed

    showUpdateBanner();
  } catch (_) {
    // Version check must never break the app
  }
}

/**
 * Auto-push current deploy timestamp to Firestore.
 * Only succeeds for admin users (Firestore rules reject others silently).
 */
async function autoSyncVersion() {
  try {
    await setDoc(doc(db, "config", "app_version"), {
      deployTimestamp: DEPLOY_TIMESTAMP,
      updatedAt: new Date().toISOString()
    });
  } catch (_) {
    // Not admin — silently ignore, Firestore rules will reject
  }
}

function showUpdateBanner() {
  // Prevent duplicates
  if (document.getElementById("version-update-banner")) return;

  const banner = document.createElement("div");
  banner.id = "version-update-banner";
  banner.setAttribute("role", "alert");
  banner.innerHTML =
    `<div class="version-banner-inner">` +
      `<span class="version-banner-text">A new version of OpenLib is available</span>` +
      `<div class="version-banner-actions">` +
        `<button class="version-btn-update" id="version-btn-update">Update</button>` +
        `<button class="version-btn-dismiss" id="version-btn-dismiss" aria-label="Dismiss">✕</button>` +
      `</div>` +
    `</div>`;

  document.body.appendChild(banner);

  // Trigger entrance animation on next frame
  requestAnimationFrame(() => banner.classList.add("visible"));

  document.getElementById("version-btn-update").addEventListener("click", () => applyUpdate());
  document.getElementById("version-btn-dismiss").addEventListener("click", () => dismissBanner(banner));
}

async function applyUpdate() {
  // Update stored timestamp
  localStorage.setItem(LS_KEY, String(DEPLOY_TIMESTAMP));

  // Clear service worker caches if present
  if ("caches" in window) {
    try {
      const names = await caches.keys();
      await Promise.all(names.map(n => caches.delete(n)));
    } catch (_) { /* best effort */ }
  }

  // Unregister service workers if present
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.unregister()));
    } catch (_) { /* best effort */ }
  }

  // Hard reload — bypass browser cache
  location.reload(true);
}

function dismissBanner(banner) {
  sessionStorage.setItem(SS_DISMISS_KEY, "1");
  banner.classList.remove("visible");
  banner.addEventListener("transitionend", () => banner.remove(), { once: true });
  // Fallback removal if transition doesn't fire
  setTimeout(() => { if (banner.parentNode) banner.remove(); }, 500);
}

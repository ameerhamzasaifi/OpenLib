// ── Version Update Detection ─────────────────────────────────────────────────
// Non-blocking client-side check: compares local version against Firestore
// config/app_version document. Shows a dismissible banner when outdated.

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { db } from './firebase-config.js';

// ── Current app version (bumped by deploy script) ────────────────────────────
const APP_VERSION = "1.0.0";

// [VULN-11N FIX] Strict version string validation to prevent injection
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
const MAX_VERSION_LEN = 30;

function isValidVersion(v) {
  return typeof v === "string" && v.length <= MAX_VERSION_LEN && SEMVER_RE.test(v);
}

const LS_KEY = "openlib_app_version";
const SS_DISMISS_KEY = "openlib_update_dismissed";

/**
 * Run the version check after app initialises.
 * Non-blocking — call with `checkForUpdates()` (no await needed on critical path).
 */
export async function checkForUpdates() {
  try {
    // Skip if user already dismissed this session
    if (sessionStorage.getItem(SS_DISMISS_KEY)) return;

    const remoteVersion = await fetchRemoteVersion();
    if (!remoteVersion) return; // offline or fetch failed — silently bail

    const localVersion = localStorage.getItem(LS_KEY);

    // First visit — seed localStorage, no prompt needed
    if (!localVersion) {
      localStorage.setItem(LS_KEY, remoteVersion);
      return;
    }

    // Versions match — nothing to do
    if (localVersion === remoteVersion) return;

    // Mismatch: also check against the hardcoded build version
    // If the build itself is already current, just update localStorage silently
    if (APP_VERSION === remoteVersion) {
      localStorage.setItem(LS_KEY, remoteVersion);
      return;
    }

    // Genuine mismatch — show update banner
    showUpdateBanner(remoteVersion);
  } catch (_) {
    // Swallow all errors — version check must never break the app
  }
}

async function fetchRemoteVersion() {
  try {
    const snap = await getDoc(doc(db, "config", "app_version"));
    if (snap.exists()) {
      const version = snap.data().version || null;
      // [VULN-11N FIX] Reject invalid version strings from Firestore
      if (version && !isValidVersion(version)) {
        console.warn("Remote version string failed validation, ignoring:", version);
        return null;
      }
      return version;
    }
    return null;
  } catch (_) {
    return null; // offline / permission error — fail silently
  }
}

function showUpdateBanner(newVersion) {
  // Prevent duplicates
  if (document.getElementById("version-update-banner")) return;

  const banner = document.createElement("div");
  banner.id = "version-update-banner";
  banner.setAttribute("role", "alert");
  banner.innerHTML =
    `<div class="version-banner-inner">` +
      `<span class="version-banner-text">A new version of OpenLib is available <strong>(${escText(newVersion)})</strong></span>` +
      `<div class="version-banner-actions">` +
        `<button class="version-btn-update" id="version-btn-update">Update</button>` +
        `<button class="version-btn-dismiss" id="version-btn-dismiss" aria-label="Dismiss">✕</button>` +
      `</div>` +
    `</div>`;

  document.body.appendChild(banner);

  // Trigger entrance animation on next frame
  requestAnimationFrame(() => banner.classList.add("visible"));

  document.getElementById("version-btn-update").addEventListener("click", () => applyUpdate(newVersion));
  document.getElementById("version-btn-dismiss").addEventListener("click", () => dismissBanner(banner));
}

async function applyUpdate(newVersion) {
  // Update stored version
  localStorage.setItem(LS_KEY, newVersion);

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

function escText(str) {
  const el = document.createElement("span");
  el.textContent = String(str ?? "");
  return el.innerHTML;
}

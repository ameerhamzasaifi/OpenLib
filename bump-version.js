#!/usr/bin/env node
// ── bump-version.js ──────────────────────────────────────────────────────────
// Run after each deploy to update the Firestore config/app_version document.
//
// Usage:
//   node bump-version.js <version>
//   node bump-version.js 1.1.0
//
// This also patches the APP_VERSION constant in version-check.js so the
// deployed bundle matches the Firestore record.
//
// Requires: firebase-admin (npm install firebase-admin --save-dev)
// Auth: uses Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS.

const fs = require("fs");
const path = require("path");

const newVersion = process.argv[2];
if (!newVersion) {
  console.error("Usage: node bump-version.js <version>");
  process.exit(1);
}

// [VULN-08N FIX] Validate version string against strict semver pattern
if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(newVersion)) {
  console.error("Version must be semver format: X.Y.Z or X.Y.Z-prerelease");
  process.exit(1);
}

// ── 1. Patch version-check.js ────────────────────────────────────────────────
const vcPath = path.join(__dirname, "version-check.js");
let vcSource = fs.readFileSync(vcPath, "utf-8");
const versionRegex = /const APP_VERSION = ".*?";/;
if (!versionRegex.test(vcSource)) {
  console.error("Could not find APP_VERSION constant in version-check.js");
  process.exit(1);
}
vcSource = vcSource.replace(versionRegex, `const APP_VERSION = "${newVersion}";`);
fs.writeFileSync(vcPath, vcSource, "utf-8");
console.log(`✔ version-check.js → APP_VERSION = "${newVersion}"`);

// ── 2. Update Firestore config/app_version ───────────────────────────────────
async function updateFirestore() {
  try {
    const admin = require("firebase-admin");

    // [VULN-08N FIX] Use environment variable instead of hardcoded project ID
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      console.error("⚠ Set FIREBASE_PROJECT_ID environment variable");
      console.log('  e.g. FIREBASE_PROJECT_ID=openlib-f7bf1 node bump-version.js 1.2.0');
      process.exit(1);
    }

    if (!admin.apps.length) {
      admin.initializeApp({ projectId });
    }

    const db = admin.firestore();
    await db.doc("config/app_version").set({
      version: newVersion,
      updatedAt: new Date().toISOString()
    });

    console.log(`✔ Firestore config/app_version → "${newVersion}"`);
  } catch (err) {
    console.error("⚠ Could not update Firestore (ensure firebase-admin is installed and authenticated):");
    console.error("  " + err.message);
    console.log("\n  You can set the document manually in the Firebase Console:");
    console.log("  Collection: config  →  Document: app_version");
    console.log(`  Fields: { version: "${newVersion}", updatedAt: "${new Date().toISOString()}" }\n`);
  }
}

updateFirestore();

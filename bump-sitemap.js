#!/usr/bin/env node
// ── bump-sitemap.js ──────────────────────────────────────────────────────────
// Predeploy hook: generates sitemap.xml from Firestore "apps" collection.
// Uses the Firestore REST API — no npm packages required.
//
// Runs automatically via firebase.json "predeploy" alongside bump-version.js.

const https = require("https");
const fs = require("fs");
const path = require("path");

const PROJECT_ID = "openlib-f7bf1";
const BASE_URL = "https://openlib-f7bf1.web.app";
const COLLECTION = "apps";

function fetchApps() {
  return new Promise((resolve, reject) => {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?pageSize=1000`;
    https.get(url, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const docs = json.documents || [];
          const apps = docs.map(doc => {
            const fields = doc.fields || {};
            const id = doc.name.split("/").pop();
            const updatedAt = fields.updatedAt?.stringValue || fields.createdAt?.stringValue || "";
            return { id, updatedAt };
          });
          resolve(apps);
        } catch (e) {
          reject(e);
        }
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

function toW3CDate(isoStr) {
  if (!isoStr) return new Date().toISOString().split("T")[0];
  try {
    return new Date(isoStr).toISOString().split("T")[0];
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function main() {
  let apps = [];
  try {
    apps = await fetchApps();
    console.log(`✔ Fetched ${apps.length} apps from Firestore`);
  } catch (e) {
    console.warn(`⚠ Could not fetch apps from Firestore (${e.message}). Generating sitemap with static pages only.`);
  }

  const today = new Date().toISOString().split("T")[0];

  const staticPages = [
    { loc: "/",          changefreq: "daily",  priority: "1.0",  lastmod: today },
    { loc: "/rankings",  changefreq: "daily",  priority: "0.8",  lastmod: today },
    { loc: "/trending",  changefreq: "daily",  priority: "0.7",  lastmod: today },
    { loc: "/team",      changefreq: "monthly", priority: "0.4", lastmod: today },
  ];

  const appPages = apps.map(app => ({
    loc: `/app/${encodeURIComponent(app.id)}`,
    changefreq: "weekly",
    priority: "0.9",
    lastmod: toW3CDate(app.updatedAt),
  }));

  const allPages = [...staticPages, ...appPages];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(p => `  <url>
    <loc>${escapeXml(BASE_URL + p.loc)}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;

  const outPath = path.join(__dirname, "sitemap.xml");
  fs.writeFileSync(outPath, xml, "utf-8");
  console.log(`✔ sitemap.xml → ${allPages.length} URLs (${staticPages.length} static + ${appPages.length} apps)`);
}

main().catch(e => {
  console.error("Failed to generate sitemap:", e);
  process.exit(1);
});

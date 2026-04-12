// ── OpenLib Prerender Cloud Function ──────────────────────────────────────────
// Serves pre-rendered HTML to search engine bots and social crawlers.
// Regular users get the normal SPA (index.html).
//
// Routes handled: /app/*, /rankings, /trending
// Bot detection via User-Agent header.

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

admin.initializeApp();
const db = admin.firestore();

const BASE_URL = "https://openlib-f7bf1.web.app";

// ── Bot detection ────────────────────────────────────────────────────────────
const BOT_RE = /googlebot|google-inspectiontool|bingbot|yandex|baiduspider|twitterbot|facebookexternalhit|linkedinbot|embedly|quora link preview|outbrain|pinterest|pinterestbot|slackbot|vkshare|w3c_validator|whatsapp|telegrambot|discordbot|applebot|petalbot|seznambot|ahrefsbot|semrushbot|mj12bot|dotbot/i;

function isBot(ua) {
  return BOT_RE.test(ua || "");
}

// ── HTML escaping ────────────────────────────────────────────────────────────
function esc(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── SPA fallback (serves index.html to regular users) ────────────────────────
let spaHtmlCache = null;
function getSpaHtml() {
  if (!spaHtmlCache) {
    try {
      spaHtmlCache = fs.readFileSync(path.join(__dirname, "spa.html"), "utf-8");
    } catch {
      // Fallback: redirect to home (should not happen if predeploy copies the file)
      return null;
    }
  }
  return spaHtmlCache;
}

// ── Build pre-rendered HTML page ─────────────────────────────────────────────
function buildPage({ title, description, url, image, type, jsonLd, body }) {
  const jsonLdTag = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : "";
  const imgTag = image
    ? `<meta property="og:image" content="${esc(image)}">\n    <meta name="twitter:image" content="${esc(image)}">`
    : `<meta property="og:image" content="${BASE_URL}/og-image.png">`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
  <link rel="canonical" href="${esc(url)}">

  <meta property="og:type" content="${esc(type || "website")}">
  <meta property="og:site_name" content="OpenLib">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  ${imgTag}

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">

  ${jsonLdTag}
  <link rel="stylesheet" href="/styles.css">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
</head>
<body>
  <header>
    <nav>
      <a href="/">OpenLib — Open Source App Library</a> ·
      <a href="/rankings">Rankings</a> ·
      <a href="/trending">Trending</a> ·
      <a href="/team">Team</a>
    </nav>
  </header>
  <main>
    ${body}
  </main>
  <footer>
    <p><strong>OpenLib</strong> — A curated open-source app library.
    <a href="https://github.com/ameerhamzasaifi/openlib">Contribute on GitHub</a></p>
    <nav>
      <a href="/rankings">Rankings</a> ·
      <a href="/trending">Trending</a> ·
      <a href="/privacy.txt">Privacy Policy</a> ·
      <a href="/terms.txt">Terms</a>
    </nav>
  </footer>
  <script type="module" src="/script.js"></script>
</body>
</html>`;
}

// ── Render: App Detail Page ──────────────────────────────────────────────────
async function renderApp(appId) {
  try {
    const snap = await db.collection("apps").doc(appId).get();
    if (!snap.exists) return null;

    const app = { id: snap.id, ...snap.data() };
    const alt = app.alternative || "proprietary software";
    const title = `${app.name} — Free Open Source Alternative to ${alt} | OpenLib`;
    const desc = `${app.name} is a free, open-source alternative to ${alt}. ${(app.description || "").slice(0, 140)}`;
    const url = `${BASE_URL}/app/${encodeURIComponent(appId)}`;

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: app.name,
      description: app.description || "",
      applicationCategory: app.category || "DesignApplication",
      operatingSystem: (app.platforms || []).join(", ") || "All",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      ...(app.license && { license: app.license }),
      ...(app.download && { downloadUrl: app.download }),
      ...(app.version && { softwareVersion: app.version }),
      ...(app.avgRating && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: app.avgRating,
          reviewCount: app.reviewCount || 1,
          bestRating: "5",
          worstRating: "1",
        },
      }),
    };

    const platforms = (app.platforms || []).join(", ");
    const features = (app.features || [])
      .map((f) => `<li>${esc(f)}</li>`)
      .join("");
    const tags = (app.tags || [])
      .map((t) => `<span>${esc(t)}</span>`)
      .join(" · ");
    const installs = (app.installMethods || [])
      .map((m) => `<li><strong>${esc(m.label)}</strong>: <code>${esc(m.command)}</code></li>`)
      .join("");

    const body = `
    <article>
      <h1>${esc(app.name)}</h1>
      ${app.alternative ? `<p><strong>Free, open-source alternative to ${esc(app.alternative)}</strong></p>` : ""}
      <p>${esc(app.description || "")}</p>

      ${app.fullDescription ? `<section><h2>About ${esc(app.name)}</h2><p>${esc(app.fullDescription)}</p></section>` : ""}
      ${features ? `<section><h2>Key Features</h2><ul>${features}</ul></section>` : ""}
      ${platforms ? `<section><h2>Available Platforms</h2><p>${esc(platforms)}</p></section>` : ""}
      ${installs ? `<section><h2>Installation</h2><ul>${installs}</ul></section>` : ""}
      ${app.systemRequirements ? `<section><h2>System Requirements</h2><pre>${esc(app.systemRequirements)}</pre></section>` : ""}

      <section>
        <h2>Details</h2>
        <ul>
          ${app.version ? `<li>Version: ${esc(app.version)}</li>` : ""}
          ${app.license ? `<li>License: ${esc(app.license)}</li>` : ""}
          ${app.category ? `<li>Category: ${esc(app.category)}</li>` : ""}
          ${app.fileSize ? `<li>File Size: ${esc(app.fileSize)}</li>` : ""}
          ${app.developer ? `<li>Developer: ${esc(app.developer)}</li>` : ""}
          ${app.maintainer ? `<li>Maintained by: ${esc(app.maintainer)}</li>` : ""}
        </ul>
      </section>

      ${tags ? `<section><h2>Tags</h2><p>${tags}</p></section>` : ""}

      <section>
        <h2>Links</h2>
        <ul>
          ${app.download ? `<li><a href="${esc(app.download)}" rel="noopener">Download ${esc(app.name)}</a></li>` : ""}
          ${app.source ? `<li><a href="${esc(app.source)}" rel="noopener">Source Code</a></li>` : ""}
          ${app.website ? `<li><a href="${esc(app.website)}" rel="noopener">Official Website</a></li>` : ""}
          ${app.docs ? `<li><a href="${esc(app.docs)}" rel="noopener">Documentation</a></li>` : ""}
        </ul>
      </section>

      <p><a href="/app/${encodeURIComponent(appId)}/reviews">Read reviews for ${esc(app.name)}</a></p>
    </article>`;

    return buildPage({ title, description: desc, url, image: app.logo, type: "article", jsonLd, body });
  } catch (e) {
    console.error("renderApp error:", appId, e);
    return null;
  }
}

// ── Render: Rankings Page ────────────────────────────────────────────────────
async function renderRankings() {
  try {
    const snap = await db.collection("apps").get();
    const apps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    apps.sort((a, b) => {
      const scoreA = (a.likes || 0) - (a.dislikes || 0) + (a.views || 0) / 10;
      const scoreB = (b.likes || 0) - (b.dislikes || 0) + (b.views || 0) / 10;
      return scoreB - scoreA;
    });

    const title = "Top Ranked Open Source Apps 2026 | OpenLib";
    const desc = "Discover the highest-rated free and open-source apps ranked by the OpenLib community. Find the best FOSS alternatives.";
    const url = `${BASE_URL}/rankings`;

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Top Ranked Open Source Apps",
      numberOfItems: apps.length,
      itemListElement: apps.slice(0, 50).map((app, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: app.name,
        url: `${BASE_URL}/app/${encodeURIComponent(app.id)}`,
      })),
    };

    const list = apps
      .slice(0, 100)
      .map(
        (app, i) =>
          `<li><a href="/app/${encodeURIComponent(app.id)}">#${i + 1} ${esc(app.name)}</a>${app.alternative ? ` — alternative to ${esc(app.alternative)}` : ""} — ${esc((app.description || "").slice(0, 120))}</li>`
      )
      .join("\n        ");

    const body = `
    <h1>Top Ranked Open Source Apps</h1>
    <p>The highest-rated free and open-source software alternatives, ranked by the OpenLib community. ${apps.length} apps and counting.</p>
    <ol>
        ${list}
    </ol>`;

    return buildPage({ title, description: desc, url, jsonLd, body });
  } catch (e) {
    console.error("renderRankings error:", e);
    return null;
  }
}

// ── Render: Trending Page ────────────────────────────────────────────────────
async function renderTrending() {
  try {
    const snap = await db.collection("apps").get();
    const apps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    apps.sort((a, b) => (b.views || 0) - (a.views || 0));

    const title = "Trending Open Source Apps This Week | OpenLib";
    const desc = "See which free and open-source apps are trending this week on OpenLib. Discover popular FOSS alternatives.";
    const url = `${BASE_URL}/trending`;

    const list = apps
      .slice(0, 50)
      .map(
        (app) =>
          `<li><a href="/app/${encodeURIComponent(app.id)}">${esc(app.name)}</a>${app.alternative ? ` — alternative to ${esc(app.alternative)}` : ""} — ${esc((app.description || "").slice(0, 120))}</li>`
      )
      .join("\n        ");

    const body = `
    <h1>Trending Open Source Apps</h1>
    <p>Popular free and open-source apps trending on OpenLib this week.</p>
    <ul>
        ${list}
    </ul>`;

    return buildPage({ title, description: desc, url, body });
  } catch (e) {
    console.error("renderTrending error:", e);
    return null;
  }
}

// ── Main Cloud Function ──────────────────────────────────────────────────────
exports.prerender = functions.https.onRequest(async (req, res) => {
  const ua = req.headers["user-agent"] || "";

  // Regular users → serve the SPA directly
  if (!isBot(ua)) {
    const spa = getSpaHtml();
    if (spa) {
      res.set("Cache-Control", "public, max-age=300, s-maxage=600");
      res.set("Content-Type", "text/html; charset=utf-8");
      return res.send(spa);
    }
    // If spa.html missing, redirect to root (hosting serves index.html)
    return res.redirect(302, "/");
  }

  // Bot traffic → serve pre-rendered HTML
  const urlPath = decodeURIComponent(req.path);
  let html = null;

  try {
    if (urlPath.startsWith("/app/")) {
      // Extract appId (handles /app/{id}, /app/{id}/reviews, /app/{id}/versions, etc.)
      const appId = urlPath.replace("/app/", "").split("/")[0];
      if (appId) html = await renderApp(appId);
    } else if (urlPath === "/rankings") {
      html = await renderRankings();
    } else if (urlPath === "/trending") {
      html = await renderTrending();
    }
  } catch (e) {
    console.error("Prerender error:", urlPath, e);
  }

  if (html) {
    res.set("Cache-Control", "public, s-maxage=3600, max-age=600");
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("X-Rendered-By", "openlib-prerender");
    return res.send(html);
  }

  // Fallback: serve SPA
  const spa = getSpaHtml();
  if (spa) {
    res.set("Cache-Control", "public, max-age=300");
    res.set("Content-Type", "text/html; charset=utf-8");
    return res.send(spa);
  }
  return res.redirect(302, "/");
});

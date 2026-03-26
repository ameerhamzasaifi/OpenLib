const express = require("express");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Data directory ──────────────────────────────────────────────────────────
const DATA_DIR        = path.join(__dirname, "data");
const RATINGS_FILE    = path.join(DATA_DIR, "ratings.json");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const REPORTS_FILE    = path.join(DATA_DIR, "reports.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  [RATINGS_FILE, SUBMISSIONS_FILE, REPORTS_FILE].forEach(file => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify([], null, 2));
  });
}
ensureDataDir();

// ── Helpers ─────────────────────────────────────────────────────────────────
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); }
  catch { return []; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function calcAverage(votes) {
  if (!votes.length) return 0;
  return votes.reduce((a, b) => a + b, 0) / votes.length;
}

function timestamp() {
  return new Date().toISOString();
}

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Validation helpers ───────────────────────────────────────────────────────
function isValidUrl(str) {
  try { new URL(str); return true; } catch { return false; }
}

// ── RATINGS ──────────────────────────────────────────────────────────────────

// GET /api/ratings — full ratings map  { appId: { avg, total, votes } }
app.get("/api/ratings", (req, res) => {
  const all = readJSON(RATINGS_FILE);
  const map = {};
  all.forEach(r => {
    if (!map[r.appId]) map[r.appId] = [];
    map[r.appId].push(r.star);
  });
  const result = {};
  Object.keys(map).forEach(id => {
    const votes = map[id];
    result[id] = {
      avg:   parseFloat(calcAverage(votes).toFixed(2)),
      total: votes.length,
    };
  });
  res.json(result);
});

// GET /api/ratings/:appId — single app stats
app.get("/api/ratings/:appId", (req, res) => {
  const { appId } = req.params;
  const all   = readJSON(RATINGS_FILE);
  const votes = all.filter(r => r.appId === appId).map(r => r.star);
  res.json({
    appId,
    avg:   parseFloat(calcAverage(votes).toFixed(2)),
    total: votes.length,
  });
});

// POST /api/ratings/:appId  body: { star: 1-5, sessionId: string }
app.post("/api/ratings/:appId", (req, res) => {
  const { appId }  = req.params;
  const { star, sessionId } = req.body;

  if (!star || star < 1 || star > 5 || !Number.isInteger(Number(star))) {
    return res.status(400).json({ error: "star must be an integer 1–5" });
  }
  if (!sessionId || typeof sessionId !== "string" || sessionId.length < 4) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  const all = readJSON(RATINGS_FILE);

  // one vote per sessionId per app — update in place
  const existing = all.findIndex(r => r.appId === appId && r.sessionId === sessionId);
  if (existing !== -1) {
    all[existing].star      = Number(star);
    all[existing].updatedAt = timestamp();
  } else {
    all.push({ appId, star: Number(star), sessionId, createdAt: timestamp() });
  }

  writeJSON(RATINGS_FILE, all);

  const votes = all.filter(r => r.appId === appId).map(r => r.star);
  res.json({
    appId,
    avg:   parseFloat(calcAverage(votes).toFixed(2)),
    total: votes.length,
  });
});

// ── SUBMISSIONS ──────────────────────────────────────────────────────────────

// GET /api/submissions — list all pending submissions (admin view)
app.get("/api/submissions", (req, res) => {
  const secret = req.headers["x-admin-key"];
  if (secret !== (process.env.ADMIN_KEY || "openlib-admin")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json(readJSON(SUBMISSIONS_FILE));
});

// POST /api/submissions  body: { name, logo, category, description, uses, alternative,
//                                download, source, maintainer, platforms, submitterEmail? }
app.post("/api/submissions", (req, res) => {
  const required = ["name", "category", "description", "uses", "alternative", "download", "source", "maintainer", "platforms"];
  const missing  = required.filter(k => !req.body[k]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }

  const { name, logo, category, description, uses, alternative,
          download, source, maintainer, platforms, submitterEmail } = req.body;

  if (!["individual", "organization"].includes(maintainer)) {
    return res.status(400).json({ error: "maintainer must be 'individual' or 'organization'" });
  }
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return res.status(400).json({ error: "platforms must be a non-empty array" });
  }
  if (!isValidUrl(download) || !isValidUrl(source)) {
    return res.status(400).json({ error: "download and source must be valid URLs" });
  }

  const all = readJSON(SUBMISSIONS_FILE);
  const entry = {
    id:             `sub_${Date.now()}`,
    status:         "pending",
    name,
    logo:           logo || "",
    category,
    description,
    uses,
    alternative,
    download,
    source,
    maintainer,
    platforms,
    submitterEmail: submitterEmail || "",
    submittedAt:    timestamp(),
  };
  all.push(entry);
  writeJSON(SUBMISSIONS_FILE, all);

  res.status(201).json({ message: "Submission received. It will be reviewed shortly.", id: entry.id });
});

// ── REPORTS ──────────────────────────────────────────────────────────────────

// GET /api/reports — list all reports (admin view)
app.get("/api/reports", (req, res) => {
  const secret = req.headers["x-admin-key"];
  if (secret !== (process.env.ADMIN_KEY || "openlib-admin")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json(readJSON(REPORTS_FILE));
});

// POST /api/reports   body: { appId, appName, reason, details? }
app.post("/api/reports", (req, res) => {
  const { appId, appName, reason, details } = req.body;

  if (!appId || !appName || !reason) {
    return res.status(400).json({ error: "appId, appName and reason are required" });
  }

  const validReasons = ["broken-link", "wrong-info", "malware", "duplicate", "other"];
  if (!validReasons.includes(reason)) {
    return res.status(400).json({ error: `reason must be one of: ${validReasons.join(", ")}` });
  }

  const all = readJSON(REPORTS_FILE);
  const entry = {
    id:         `rep_${Date.now()}`,
    status:     "open",
    appId,
    appName,
    reason,
    details:    details || "",
    reportedAt: timestamp(),
  };
  all.push(entry);
  writeJSON(REPORTS_FILE, all);

  res.status(201).json({ message: "Report submitted. Thank you for helping keep OpenLib accurate." });
});

// ── 404 fallback ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  OpenLib server running at http://localhost:${PORT}\n`);
  console.log(`  Static site: http://localhost:${PORT}/index.html`);
  console.log(`  Ratings API: http://localhost:${PORT}/api/ratings`);
  console.log(`  Admin key  : ${process.env.ADMIN_KEY || "openlib-admin"} (set ADMIN_KEY env var to change)\n`);
});

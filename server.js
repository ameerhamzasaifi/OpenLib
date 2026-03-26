const express = require("express");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// ── SPA fallback — serve index.html for any non-file route ──────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  OpenLib server running at http://localhost:${PORT}`);
  console.log(`  All data is stored in Firestore.\n`);
});

# OpenLib

> A curated open-source app library. Discover, rate, and explore free software alternatives.

[![Live](https://img.shields.io/badge/Live-Firebase-orange)](https://openlib-f7bf1.web.app)
[![License](https://img.shields.io/badge/license-MPL--2.0-green)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-ameerhamzasaifi%2Fopenlib-blue)](https://github.com/ameerhamzasaifi/openlib)

**https://openlib-f7bf1.web.app**

---

## What is OpenLib?

OpenLib is a community-driven catalog of open-source software. Browse curated app listings, vote on your favorites, leave reviews, and discover free alternatives to proprietary tools — all backed by Firebase and built with vanilla JS.

---

## Features

### Discovery
- Full-text search with keyboard shortcut (`Alt+F`)
- Filter by category (Communication, Design, Finance, Media, Productivity, Security, Utility)
- Rankings page with scoring based on likes, views, downloads, and opens
- Trending page with time-filtered charts
- Personalized recommendations based on bookmarks and preferences
- Tag-based browsing and similar app suggestions

### App Detail Pages
- Screenshots gallery with lightbox viewer
- Installation methods with one-click copy
- Feature lists, system requirements, and comparison tables
- Version/license/file size metadata
- Like/dislike voting, star ratings, and written reviews
- Bookmark, share, and "Open App" support for web-only apps
- Moderation banners for restricted or removed apps

### Community
- User profiles with activity stats, bio, website, and follower system
- Organizations — create teams, manage members, submit apps as an org
- Edit requests (PR-style) with diff viewer, approval workflow, and review comments
- App ownership claims
- Version history with full snapshot restore (admin)
- Written reviews with helpful/unhelpful voting

### Submissions
- Submit apps via the **+ Submit App** modal (no account for browsing; sign-in required to submit)
- Resubmit after reviewer feedback
- Logo and screenshot upload (base64 encoded, up to 6 screenshots)
- Web-only app support (shows "Open App" instead of "Download")

### Admin & Team
- Submissions queue with approve / reject / request-changes workflow
- Edit request merge system
- Report moderation with restrict, remove, and timed suspension enforcement
- Moderation audit log
- User management — role assignment, verified status, team accounts
- OpenLib Team page with public profile and granular per-member permissions
- Version restore for any app

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla JS (no frameworks, no build step) |
| Auth | Firebase Auth — Google & GitHub OAuth |
| Database | Cloud Firestore |
| Hosting | Firebase Hosting |
| Analytics | Google Analytics 4 (production only) |

---

## Project Structure

```
index.html              — Single-page app shell (all views, modals)
script.js               — Routing, rendering, event handling
firebase-db.js          — All Firestore operations
firebase-config.js      — Firebase init + auth (not committed — see template)
styles.css              — All styles (CSS variables, dark/light theme)
firestore.rules         — Firestore security rules
firestore.indexes.json  — Composite index definitions
version-check.js        — Auto-update detection banner
bump-version.js         — Pre-deploy timestamp hook
firebase-config.template.js — Config template for contributors
```

---

## Getting Started

### Prerequisites
- [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`)
- A Firebase project with Firestore and Authentication enabled

### Local Setup

```bash
git clone https://github.com/ameerhamzasaifi/openlib.git
cd openlib

# Copy the config template and fill in your Firebase project values
cp firebase-config.template.js firebase-config.js
# Edit firebase-config.js with your project credentials

# Start the local emulator
firebase emulators:start
```

Then open `index.html` directly in a browser, or serve it via the emulator at `http://localhost:5000`.

> **Note:** `firebase-config.js` is gitignored. Never commit it.

### Deploy

```bash
firebase deploy
```

The `predeploy` hook in `firebase.json` runs `bump-version.js` automatically to update the version timestamp before each deploy.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

**Quick summary:**
1. Fork the repo
2. Create a branch: `git checkout -b my-change`
3. Make your changes (test locally with the emulator or by opening `index.html`)
4. Push and open a PR

**To submit an app without writing code**, use the **+ Submit App** button on the live site. All submissions are reviewed by the team.

### Code Conventions

- Vanilla JS only — no frameworks, no build step, no transpilation
- All views render into pre-existing containers in `index.html`
- Every `show*()` function hides all other views, then shows its own
- Routes are registered in `handleRoute()`, navigation via `navigateTo(path)`
- DB functions go in `firebase-db.js`; always check `isAdminOrTeam()` for privileged ops
- All user-supplied content must be escaped with `esc()` before HTML insertion
- Use CSS variables defined in `:root` — don't hardcode colors

### Role System

| Role | Access |
|---|---|
| `user` | Browse, vote, review, report, submit apps |
| `contributor` | Same, plus recognized in profiles |
| `maintainer` | Same, plus limited edit/approval abilities |
| `openlib-team` | Same, plus admin panel (permissions set per-member by admin) |
| `admin` | Full access to everything |

---

## Security

Security issues should be reported **privately** — not as public GitHub issues.

👉 [Report a vulnerability](https://github.com/ameerhamzasaifi/openlib/security/advisories/new)

See [SECURITY.md](SECURITY.md) for the full policy, scope, and response timeline.

---

## License

[Mozilla Public License 2.0](LICENSE)

OpenLib is open source. You are free to use, modify, and distribute the code under the terms of the MPL-2.0. The name "OpenLib" and associated branding are excluded from the license grant per MPL-2.0 § 2.3 (trademark exclusion).

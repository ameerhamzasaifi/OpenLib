# Contributing to OpenLib

## Quick Start

1. Fork the repo
2. Create a branch: `git checkout -b my-change`
3. Make your changes
4. Test locally with `firebase emulators:start` or just open `index.html`
5. Push and open a PR

## Submit Apps Without Code

Use the **+ Submit App** button on the live site. The team reviews all submissions.

## Project Structure

```
index.html          — Single HTML file (SPA)
script.js           — All routing, rendering, event handling
firebase-db.js      — Firestore operations (users, apps, reports, teams)
firebase-config.js  — Firebase init + auth (not committed, use template)
styles.css          — All styles
firestore.rules     — Security rules
version-check.js    — Auto-update detection
bump-version.js     — Predeploy timestamp hook
```

## Conventions

- Vanilla JS only — no frameworks, no build step
- All views render into existing containers in `index.html`
- Every `show*()` function hides all other views, then shows its own
- Routes go in `handleRoute()`, use `navigateTo(path)` for navigation
- DB functions go in `firebase-db.js`, always check `isAdminOrTeam()` for privileged ops
- Escape all user content with `esc()` before inserting into HTML
- CSS variables defined in `:root` — use them

## Roles

| Role | Access |
|------|--------|
| user | Browse, vote, review, report, submit apps |
| contributor | Same + recognized in profiles |
| maintainer | Same + limited edit abilities |
| openlib-team | Same + admin panel access (permissions set by admin) |
| admin | Full access to everything |

## Security

- Never trust client input — validate in Firestore rules
- Admin-only operations must check both client-side (`isAdmin`) and server-side (rules)
- Don't add `firebase-config.js` to git — use the template

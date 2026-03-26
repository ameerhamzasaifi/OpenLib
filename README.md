# OpenLib

A curated open-source app library. Discover, rate, and explore free software alternatives.

[![Live](https://img.shields.io/badge/Live-Firebase-orange)](https://openlib-f7bf1.web.app) [![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**Live:** https://openlib-f7bf1.web.app

---

## Setup

```bash
git clone https://github.com/ameerhamzasaifi/openlib.git
cd openlib
cp firebase-config.template.js firebase-config.js
# Fill in your Firebase credentials from Firebase Console
```

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vanilla JS (ES modules), HTML5, CSS3 |
| Routing | Hash-based (`#/app/{id}`, `#/rankings`, `#/profile`) |
| Database | Cloud Firestore |
| Auth | Firebase Auth (Google, GitHub) |
| Hosting | Firebase Hosting |

## Features

- Search and filter by category/platform
- Star ratings, likes/dislikes, view counts
- Rankings page (community-scored)
- User profiles and organizations
- App submissions with team review
- Edit requests with code-review workflow
- Admin dashboard (roles, verification, moderation)
- Dark/light theme, responsive, keyboard shortcuts (Alt+S, Alt+F)

## Contributing

1. Fork → branch → change → PR
2. Or submit apps directly on the live site via "+ Submit App"

# OpenLib

Curated open-source app library. Discover, rate, and explore free software alternatives.

[![Live](https://img.shields.io/badge/Live-Firebase-orange)](https://openlib-f7bf1.web.app) [![License](https://img.shields.io/badge/license-MPL--2.0-green)](LICENSE)

**https://openlib-f7bf1.web.app**

## Features

- Search, filter by category/platform, keyboard shortcuts (Alt+S, Alt+F)
- Ratings, likes/dislikes, reviews, view counts, rankings
- User profiles, organizations, followers
- App submissions with team review workflow
- Edit requests with diff viewer and merge system
- Report moderation with enforcement actions (restrict, remove, timed suspensions)
- Admin dashboard — submissions, edit requests, reports, user management
- Role system — user, contributor, maintainer, admin, team
- Team page with public profile and admin management panel
- Version history with restore, ownership claims, bookmarks
- Dark/light theme, fully responsive

## Stack

Vanilla JS · Firebase Auth (Google, GitHub) · Cloud Firestore · Firebase Hosting

## Setup

1. Clone the repo
2. Copy `firebase-config.template.js` → `firebase-config.js` and fill in your Firebase credentials
3. `firebase deploy`

The predeploy hook auto-stamps the version for update detection.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MPL-2.0](LICENSE)
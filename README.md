# OpenLib

<p align="center">
  <img src="https://raw.githubusercontent.com/AHS-Mobile-Labs/OpenLib/refs/heads/main/og-image.png" alt="OpenLib Banner" width="100%" />
</p>

> A curated open-source app library. Discover, rate, and explore free software alternatives.

[![Live](https://img.shields.io/badge/Live-Firebase-orange)](https://www.openlib.online/)
[![License](https://img.shields.io/badge/license-MPL--2.0-green)](LICENSE)

**[https://www.openlib.online/](https://www.openlib.online/)**

---

## About

OpenLib is a community-driven catalog of open-source software built to help users discover free and privacy-friendly alternatives to proprietary apps. Browse curated app listings, explore trending software, leave reviews, vote on favorites, and share useful tools with the community.

OpenLib is owned and maintained by [AHS Mobile Labs](https://github.com/AHS-Mobile-Labs).

---

## Features

### Discovery

* Full-text search with keyboard shortcut (`Alt+F`)
* Filter by category (Communication, Design, Finance, Media, Productivity, Security, Utility)
* Rankings page with scoring based on likes, views, downloads, and opens
* Trending page with time-filtered charts
* Personalized recommendations based on bookmarks and preferences
* Tag-based browsing and similar app suggestions

### App Detail Pages

* Screenshots gallery with lightbox viewer
* Installation methods with one-click copy
* Feature lists, system requirements, and comparison tables
* Version/license/file size metadata
* Like/dislike voting, star ratings, and written reviews
* Bookmark, share, and "Open App" support for web-only apps
* Moderation banners for restricted or removed apps

### Community

* User profiles with activity stats, bio, website, and follower system
* Organizations — create teams, manage members, submit apps as an org
* Edit requests (PR-style) with diff viewer, approval workflow, and review comments
* App ownership claims
* Version history with full snapshot restore (admin)
* Written reviews with helpful/unhelpful voting

### Submissions

* Submit apps via the **+ Submit App** modal
* Resubmit after reviewer feedback
* Logo and screenshot upload support
* Web-only app support

### Admin & Team

* Submissions queue with approve / reject / request-changes workflow
* Edit request merge system
* Report moderation and suspension enforcement
* Moderation audit log
* User management and role assignment
* OpenLib Team page with granular permissions
* Version restore for any app

---

## Stack

| Layer     | Tech               |
| --------- | ------------------ |
| Frontend  | Vanilla JS         |
| Auth      | Firebase Auth      |
| Database  | Cloud Firestore    |
| Hosting   | Firebase Hosting   |
| Analytics | Google Analytics 4 |

---

## Getting Started

### Prerequisites

* Firebase CLI
* Firebase project with Firestore and Authentication enabled

### Local Setup

```bash
git clone https://github.com/AHS-Mobile-Labs/OpenLib.git && cd OpenLib

cp firebase-config.template.js firebase-config.js

firebase emulators:start
```

Then open `index.html` in your browser or access the local Firebase emulator.

> `firebase-config.js` is gitignored and should never be committed.

---

## Deploy

```bash
firebase deploy
```

---

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Test locally
5. Open a pull request

You can also submit apps directly through the OpenLib website.

---

## Security

Security vulnerabilities should be reported privately.

See `SECURITY.md` for the responsible disclosure policy.

---

## License

[Mozilla Public License 2.0](LICENSE)

OpenLib is open source software distributed under the MPL-2.0 license. Branding, logos, and the "OpenLib" name remain property of AHS Mobile Labs.


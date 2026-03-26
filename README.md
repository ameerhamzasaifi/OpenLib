# OpenLib

**A curated open-source app library** — discover, rate, and explore the best free and open-source software.

[![Live Demo](https://img.shields.io/badge/Live-GitHub%20Pages-blueviolet)](https://ameerhamzasaifi.github.io/OpenLib) [![License MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE) [![Tech Stack](https://img.shields.io/badge/tech-Firebase%20%7C%20Vanilla%20JS-orange)](FIREBASE_INTEGRATION.md)

---

## 🚀 Live Demo

**Visit:** https://ameerhamzasaifi.github.io/OpenLib

## ⚡ Quick Setup

### For GitHub Pages Deployment

1. **Set Up Firebase Project**
   - Go to https://firebase.google.com, create a new project
   - Enable Firestore Database and Authentication (Google + GitHub)

2. **Create Firebase Config** (not committed for security)
   ```bash
   cp firebase-config.template.js firebase-config.js
   # Edit with your Firebase credentials from Firebase Console
   ```

3. **Deploy to GitHub Pages**
   ```bash
   git push origin main
   ```

4. **Set Firebase Security Rules** (see [FIREBASE_INTEGRATION.md](FIREBASE_INTEGRATION.md))

5. **Seed Initial Data**
   - Open the live site
   - Press F12, run in console: `seedApps()`

For detailed setup → [GITHUB_PAGES_DEPLOYMENT.md](GITHUB_PAGES_DEPLOYMENT.md)

---

## ✨ Features

### Browse & Discover
- 🔍 **Instant Search** — Filter apps by name, description, or category
- 🏷️ **100+ Apps** — Curated collection of popular open-source tools
- 📱 **Platform Filters** — Find apps for Linux, Windows, macOS, Android, iOS, Web
- 🏠 **Category Filters** — Browse by Productivity, Media, Design, Finance, Security, etc.

### Engagement
- ⭐ **Star Ratings** (1-5) — Rate and see community averages
- 👍 **Likes/Dislikes** — Show what you love or don't love
- 👁️ **View Counter** — See how popular each app is
- 🏆 **Rankings Page** — Apps ranked by community scores

### Details & Attribution
- 📄 **Detail Pages** — Full descriptions, alternatives, platforms
- 👤 **User Attribution** — See who submitted each app
- 🏷️ **Maintainer Info** — Individual vs. Organization
- 🔗 **Download & Source Links** — Direct links to homepage and repository

### Security & Access
- 🔐 **Authentication** — Sign in with Google or GitHub
- 📂 **Auth-gating** — Downloads and source links require sign-in
- 📖 **Free Browsing** — Search and view all apps without signing in
- 🛡️ **Firestore-backed** — All data stored securely in Cloud Firestore

### UI/UX
- 🌓 **Dark/Light Theme** — Toggle and save preference
- 📱 **Responsive Design** — Works on all devices
- ⌨️ **Keyboard Shortcuts** — Alt+S (submit), Alt+F (search)
- ♿ **Accessible** — Semantic HTML, ARIA labels, focus management

---

## 🏗️ Architecture

| Component | Technology |
|-----------|-----------|
| **Frontend** | HTML5 + CSS3 + Vanilla JavaScript (ES6+) |
| **Routing** | Client-side hash routing (`#/`, `#/app/{id}`, `#/rankings`) |
| **Data** | Cloud Firestore (Google Firebase) |
| **Auth** | Firebase Authentication (Google, GitHub) |
| **Hosting** | GitHub Pages (static site) |
| **Fonts** | Google Fonts (Syne, DM Mono, DM Sans) |
| **Deployment** | Git push to main branch |

### Collections (Firestore)

| Collection | Purpose |
|------------|---------|
| `apps` | All app entries (name, description, platforms, likes/dislikes, views) |
| `ratings` | Per-user 1-5 star ratings |
| `app_votes` | Per-user likes/dislikes |
| `submissions` | User-submitted new apps (pending review) |
| `reports` | User-submitted problem reports (pending review) |

---

## 📖 Documentation

- [**GITHUB_PAGES_DEPLOYMENT.md**](GITHUB_PAGES_DEPLOYMENT.md) — Complete deployment guide
- [**FIREBASE_INTEGRATION.md**](FIREBASE_INTEGRATION.md) — Firestore collections, rules, and architecture
- [**FIREBASE_SETUP.md**](FIREBASE_SETUP.md) — Firebase Console configuration steps

---

## 🛠️ Local Development

```bash
# Clone the repository
git clone https://github.com/ameerhamzasaifi/openlib.git
cd openlib

# Copy and configure Firebase
cp firebase-config.template.js firebase-config.js
# Edit firebase-config.js with your Firebase project ID, API key, etc.

# Install dependencies
npm install

# Start local dev server
npm run dev

# Visit http://localhost:3000
```

### Build for Production

The site is static and works as-is. Push to main branch on GitHub to deploy:

```bash
git push origin main
```

GitHub Pages automatically deploys from the `main` branch.

---

## 📝 The Seed Apps

When you first deploy, run `seedApps()` in the browser console to populate the library with 12 popular open-source apps:

1. Frappe Books (Finance)
2. VLC Media Player (Media)
3. GIMP (Design)
4. Logseq (Productivity)
5. Inkscape (Design)
6. Bitwarden (Security)
7. Thunderbird (Communication)
8. Kdenlive (Media)
9. Signal (Communication)
10. LibreOffice (Productivity)
11. Blender (Design)
12. Syncthing (Utility)

Each has ratings, vote counts, view counts, and contributor info.

---

## 🔐 Security

- Firebase config (`firebase-config.js`) is **never committed** — listed in `.gitignore`
- All user input is HTML-escaped to prevent XSS
- Firestore Security Rules enforce authentication for sensitive operations
- API keys are Web API keys from Firebase (safe for client-side exposure within your project)
- `firebase-config.template.js` provided as a reference template

---

## 🌐 Contributing

### To Add an App

1. Sign in to the live site
2. Click "+ Submit App"
3. Fill in the form
4. Submitted apps are reviewed manually before appearing in the library

### To Report Issues

1. Sign in to the live site
2. Click "⚑" on any app card
3. Select reason and add details
4. Reports are reviewed by maintainers

### To Contribute Code

1. Fork this repository
2. Make your changes
3. Test locally (`npm run dev`)
4. Submit a pull request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

Created by [Ameer Hamza Saifi](https://github.com/ameerhamzasaifi)

---

## 🙏 Acknowledgments

- **Firebase** for Firestore, Authentication, and Hosting support
- **GitHub Pages** for free static site hosting
- **Google Fonts** for typography
- All the maintainers of the open-source apps featured in the library!

---

**Made with ❤️ to celebrate open-source software**

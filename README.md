# OpenLib

**A curated open-source app library** — discover, rate, and explore the best free and open-source software across every platform.

![OpenLib Preview](https://img.shields.io/badge/status-active-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue) ![Tech](https://img.shields.io/badge/tech-HTML%20%7C%20CSS%20%7C%20JS-orange)

---

## What is OpenLib?

OpenLib is a static, fully client-side website that presents a searchable, filterable gallery of open-source applications. Each entry shows the app's purpose, what proprietary tool it replaces, where to download it, who maintains it, and which platforms it supports. Visitors can rate apps on a 1–5 star scale; ratings persist in the browser via `localStorage`.

No backend. No build step. Just open the file.

---

## Features

- **Instant search** — filter apps by name or description in real time
- **Category filters** — narrow results by app category (Productivity, Media, Design, etc.)
- **Dark / Light theme** — toggle with one click; preference saved across sessions
- **Star ratings** — rate any app 1–5 stars; see the live average and total vote count
- **Platform badges** — know at a glance whether an app runs on Linux, Windows, macOS, Android, iOS, or the Web
- **"Alternative of" tag** — quickly see which proprietary tool each app can replace
- **Maintainer type** — individual or organisation, shown on every card
- **Responsive grid** — works on phones, tablets, and desktops
- **Zero dependencies** — pure HTML, CSS, and vanilla JavaScript

---

## Tech Stack

| Layer      | Technology          |
|------------|---------------------|
| Structure  | Semantic HTML5      |
| Styling    | Custom CSS3 (variables, grid, flexbox) |
| Logic      | Vanilla JavaScript (ES6+) |
| Storage    | Browser `localStorage` |
| Fonts      | Google Fonts (Syne + DM Mono) |

---

## Getting Started

### Run locally

```bash
git clone https://github.com/ameerhamzasaifi/openlib.git
cd openlib
# open index.html in any modern browser
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

No server required. All features work from the filesystem.

### Host online

Upload the three files (`index.html`, `styles.css`, `script.js`) to any static host:

- **GitHub Pages** — push to a repo and enable Pages in Settings
- **Netlify** — drag the project folder onto [netlify.com/drop](https://netlify.com/drop)
- **Vercel** — `vercel deploy` from the project directory

---

## Adding an App

Open `script.js` and add a new object to the `apps` array:

```js
{
  id: "unique-slug",
  name: "App Name",
  logo: "https://link-to-logo.png",
  category: "Productivity",
  description: "One-sentence description of what the app does.",
  uses: "Problem it solves for the user.",
  alternative: "Notion",
  download: "https://appname.org/download",
  source: "https://github.com/org/appname",
  maintainer: "organization",        // "individual" or "organization"
  platforms: ["Linux", "Windows", "macOS", "Web"]
}
```

Save the file and refresh the browser.

---

## Contributing

Contributions are warmly welcome — whether that's adding new apps, fixing typos, improving the UI, or expanding the feature set.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/add-blender`
3. Make your changes and commit: `git commit -m "feat: add Blender to apps list"`
4. Push the branch: `git push origin feat/add-blender`
5. Open a Pull Request

Please keep app entries accurate, use an official logo URL, and verify that the download and source links resolve.

---

## Roadmap

- [ ] JSON-based app registry (separate `apps.json` file)
- [ ] Tag-based multi-filter (e.g., filter by platform AND category simultaneously)
- [ ] App detail modal with full screenshots
- [ ] "Submit an app" form that opens a pre-filled GitHub Issue
- [ ] PWA support for offline browsing
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Automated link-checker CI action

---

## License

Released under the **MIT License** — see [LICENSE](LICENSE) for details.

You are free to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of this software.

---

<p align="center">Made with ♥ for the open-source community</p>

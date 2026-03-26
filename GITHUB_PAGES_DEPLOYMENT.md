# GitHub Pages Deployment Guide

## Quick Setup

### 1. Create `firebase-config.js` (NOT committed to git)

Copy `firebase-config.template.js` to `firebase-config.js` and fill in your Firebase project credentials:

```bash
cp firebase-config.template.js firebase-config.js
```

Then edit `firebase-config.js` with your Firebase credentials:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};
```

Get these from: Firebase Console → Project Settings → Your apps → Web app config

### 2. Set GitHub Pages Source

1. Go to your repo on GitHub
2. Settings → Pages
3. Select **main** branch as source
4. Leave folder as **(root)**
5. Click Save

### 3. Firebase Security Rules

Set these rules in Firebase Console → Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /apps/{appId} {
      allow read: if true;
      allow update: if request.auth != null;
      allow create, delete: if false;
    }
    
    match /ratings/{ratingId} {
      allow read: if true;
      allow create, update: if request.auth != null;
      allow delete: if false;
    }
    
    match /app_votes/{voteId} {
      allow read: if true;
      allow create, update, delete: if request.auth != null;
    }
    
    match /submissions/{subId} {
      allow create: if request.auth != null;
      allow read: if false;
    }
    
    match /reports/{reportId} {
      allow create: if request.auth != null;
      allow read: if false;
    }
  }
}
```

### 4. Firebase Auth Configuration

1. Firebase Console → Authentication
2. Sign-in method → Google → Enable
3. Enable GitHub (optional)
4. Add authorized redirect URIs:
   - `https://ameerhamzasaifi.github.io/OpenLib`
   - `http://localhost:3000` (for local development)

### 5. Seed Initial Data

After deployment, go to the live site and run in browser console:
```javascript
seedApps()
```

This adds the 12 built-in open-source apps to Firestore.

## Verification Checklist

- [ ] `firebase-config.js` exists (locally, not committed)
- [ ] All Firebase credentials are correct
- [ ] Firestore rules are set
- [ ] Auth providers are enabled
- [ ] GitHub Pages is pointing to main branch
- [ ] Site loads and shows app library
- [ ] Auth buttons work (Google/GitHub sign-in)
- [ ] Seed data appears after running `seedApps()`

## Troubleshooting

**Apps don't appear:**
- Check browser console for Firebase errors
- Run `seedApps()` in console to add initial data
- Check Firestore has `apps` collection

**Auth doesn't work:**
- Check Firebase Auth is enabled for your provider
- Verify authorized domains include your GitHub Pages URL
- Check browser console for auth errors

**Changes not showing:**
- Wait a few minutes for GitHub Pages to deploy
- Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- Check git commits were pushed: `git push origin main`

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Visit http://localhost:3000
```

The app uses client-side routing with `#/` URLs, so all routes work on any static host.

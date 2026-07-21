# eMarket PH Admin Dashboard

This is a standalone Firebase web admin dashboard. It can be hosted from GitHub Pages, Firebase Hosting, Netlify, Vercel, or any static web host.

## Files

- `index.html` - app shell and login page
- `styles.css` - responsive modern UI
- `app.js` - Firebase Auth, Firestore reads, and admin actions

## Firebase Setup

The dashboard uses the existing Firebase project:

- Project ID: `emarket-95a0f`
- Auth domain: `emarket-95a0f.firebaseapp.com`
- Storage bucket: `emarket-95a0f.firebasestorage.app`

If your Firebase Console has a separate Web App config, replace `firebaseConfig` in `app.js` with that config.

## Admin Access

Only users with one of these can enter the dashboard:

- Firebase custom claim: `admin: true`
- Firestore field: `users/{uid}.role == "admin"`

Non-admin users are signed out immediately.

## GitHub Pages Notes

1. Push this folder to your GitHub repo.
2. Enable GitHub Pages for the branch/folder you want to serve.
3. Add your GitHub Pages domain to Firebase Authentication authorized domains.
   Example: `yourname.github.io`
4. Keep Firestore and Storage rules deployed so admin-only reads and writes work.

## Dashboard Features

- Admin-only login and role gate.
- Overview stats for users, listings, reports, chats, and verification requests.
- ID and selfie verification review with approve/reject confirmation.
- Reports review with reporter/reported user context and chat transcript viewer.
- User management with block/unblock, detail view, user listings, and notifications.
- Listing moderation with status actions and listing detail preview.
- Chat room viewer with latest messages.

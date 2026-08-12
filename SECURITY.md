# eMarket PH Admin Dashboard Security

This dashboard is a Firebase client app. The Firebase API key in `app.js` is not a secret. Real protection must be enforced by Firebase Authentication, Firestore Security Rules, and Storage Security Rules.

## Required Firebase Rules

Before deploying this dashboard, make sure your production Firestore rules enforce:

- Only signed-in admins can read all `users`, `reports`, `chatRooms`, and all `listings`.
- Only admins can write `appConfig/ads`.
- Only admins can update user verification fields, block/unblock users, update report status, and moderate listing status.
- Normal users cannot create or edit `users/{uid}.role`.
- Admin-created notifications under `users/{uid}/notifications` are allowed only for admins.
- Chat message writes from this dashboard are allowed only for admins or valid participants.

Storage rules must enforce:

- Verification ID/selfie files are readable only by the owner or admins.
- Listing images may be public if your app needs public browsing.
- Chat images are readable only by chat participants or admins.

## Dashboard Hardening Included

- Admin role gate before showing dashboard data.
- Admin re-check before every click action that reads or writes privileged data.
- Content Security Policy meta tag to reduce injected script risk.
- No Firebase private key or service account in the website.
- User-supplied text is HTML-escaped before rendering.
- Firestore image and media links are limited to `https://` URLs before rendering.
- Non-admin users are signed out immediately.

## Deployment Notes

- Add your GitHub Pages domain to Firebase Authentication authorized domains.
- Use HTTPS only.
- Do not add service account JSON files to this repo.
- Prefer setting Firebase custom claim `admin: true` for real admins, with `users/{uid}.role == "admin"` as a UI fallback only if your rules protect that field.

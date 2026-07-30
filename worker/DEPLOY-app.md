# Deploying the app skeleton (passkeys + capture → the one thing)

The landing page and signup flow are untouched. The app lives at **`/app/`**
(`app/index.html`, `noindex`) and talks to the existing `qntm-signups` Worker via new
`/auth/*` and `/app/*` routes, backed by new D1 tables. Nothing here is live for
users until you run steps 1–2 below.

## What was added
- `worker/src/{util,auth,app}.js` + a router in `worker/src/index.js` (signup + export unchanged).
- `worker/schema-app.sql` — users, credentials (passkeys), sessions, captures, webauthn_challenges.
- `worker/package.json` — adds `@simplewebauthn/server` (passkey verification; run `npm install`).
- `app/index.html` — the app UI (passkey register/login via `@simplewebauthn/browser` from esm.sh, capture box, the one thing). It was `/app.html` at the repo root until 2026-07-30; that URL is now a redirect stub.

## Go live
```bash
cd worker
npm install                                                    # pulls @simplewebauthn/server
npx wrangler d1 execute qntm-signups --remote --file=./schema-app.sql   # create the app tables in prod D1
npx wrangler deploy                                            # deploy the Worker (new routes)
# app/index.html deploys with the static site on push (GitHub Pages, main:/ verbatim)
```

Then open **https://qntm.network/app/** on a device with a platform authenticator
(Face ID / Touch ID): claim a handle → create a passkey → you're in. Capture a few
things; the oldest open one is surfaced as *the one thing*; tick it and the next rises.

## Verified so far (headless)
- Worker bundles clean (`wrangler deploy --dry-run`, ~116 KiB gzip).
- The full app loop tested against a local D1 (`wrangler dev --local`): session auth,
  capture, the-one-thing ordering (oldest open), done → next surfaces, empty state,
  and the 401 guard. Signup regression-tested (unchanged).
- **NOT** headless-testable: the WebAuthn ceremony itself (needs a real browser +
  authenticator). The code follows `@simplewebauthn` v13's documented API; test the
  register/login in the browser after deploy. If the installed `@simplewebauthn/server`
  major differs from 13, check `registrationInfo.credential` shape in `auth.js`.

## Notes / next hardening
- Sessions are bearer tokens in `localStorage` (the app frontend and Worker are different
  origins; a cross-site cookie would be blocked by Safari/ITP). To move to HttpOnly
  cookies later, put the Worker on `api.qntm.network` (same site) with a `Domain=.qntm.network`
  cookie, or a `qntm.network/api/*` route.
- "The one thing" heuristic is v1 (oldest open). Sharpen freely — it's derived, no migration.
- RP ID is `qntm.network` (prod) / `localhost` (dev), set in `worker/src/util.js:rpConfig`.

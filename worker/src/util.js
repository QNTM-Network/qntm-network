// Shared helpers for the qntm.network Worker (signup + app).

// The app frontend (qntm.network) and this Worker (workers.dev) are different origins,
// so the app calls it with `Authorization: Bearer <token>` (no cookies). CORS therefore
// allows the Authorization header; no Allow-Credentials needed.
export const ALLOWED_ORIGINS = new Set([
  "https://qntm.network",
  "https://www.qntm.network",
  "http://localhost:8731",
]);

export function cors(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://qntm.network";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    // WITHOUT THIS, CHROME CACHES A PREFLIGHT FOR 5 SECONDS (its own default, unstated by this
    // file until now). Measured: no Access-Control-Max-Age shipped in production, so every API
    // call more than five seconds after the last one paid a full extra OPTIONS round trip — 105ms
    // to the LHR edge (docs/implementation-artifacts/research-state-and-speed.md §2.3). 86400s
    // (24h) is the ceiling Chromium and Firefox both honour; a longer value is silently clamped to
    // it, so this is the whole of the win rather than a conservative first step.
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

// WebAuthn relying-party config, derived from the calling origin. The RP ID is the domain
// the ceremony runs on (qntm.network, where the app is served from /app/) — NOT the Worker's
// own host.
//
// THE RP ID IS WHY THE APP CAN MOVE AND THE OPERATOR'S PASSKEY CANNOT BE LOST BY MOVING IT.
// A credential is bound to the RP ID, not to a URL, and WebAuthn L2 section 5.1.3 accepts a
// ceremony from any origin whose effective domain the RP ID is a "registrable domain suffix of,
// or is equal to". So:
//
//   * /app.html -> /app/ (2026-07-30) is a PATH change on the same origin. Nothing here is
//     affected, not one line, and the session token in localStorage carries over because
//     localStorage is scoped to the origin and not to the path.
//   * app.qntm.network, if the zone ever moves to Cloudflare, WOULD ALSO KEEP THE CREDENTIAL —
//     `qntm.network` is a registrable domain suffix of `app.qntm.network`, so the existing
//     passkey authenticates there with no re-enrolment. What it needs is TWO WIDENINGS IN THIS
//     FILE and nothing else: `app.qntm.network` added to ALLOWED_ORIGINS above, and the
//     hardcoded `origin` below made a LIST (@simplewebauthn's expectedOrigin accepts an array)
//     so a ceremony from the subdomain verifies. Do NOT widen rpID to match — narrowing or
//     widening the RP ID is what actually orphans credentials.
//
// That was checked before the move, because the reverse assumption — "a new origin costs him his
// only passkey" — is what would have made the subdomain a bad trade. It is not what costs it.
// The subdomain was rejected for a DNS reason (this zone's nameservers are Google Cloud DNS, and
// GitHub Pages serves one custom domain per site), recorded in
// docs/architecture/capabilities.yaml#the-app-has-an-address-and-a-way-in.
export function rpConfig(origin) {
  if (origin && origin.startsWith("http://localhost")) {
    return { rpID: "localhost", origin, rpName: "qntm" };
  }
  return { rpID: "qntm.network", origin: "https://qntm.network", rpName: "qntm" };
}

// --- base64url <-> bytes -----------------------------------------------------
export function bufToB64u(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uToBytes(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// --- ids, tokens, time -------------------------------------------------------
export function uuid() {
  return crypto.randomUUID();
}

export function randomToken(bytes = 32) {
  return bufToB64u(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function isoIn(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function bearer(request) {
  const h = request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// Validate the bearer token against the sessions table -> { user_id, handle } or null.
export async function getSession(env, request) {
  const token = bearer(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT s.user_id AS user_id, u.handle AS handle
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > datetime('now')`
  )
    .bind(token)
    .first();
  return row || null;
}

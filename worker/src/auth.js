// Passkey (WebAuthn) auth for the qntm app — register + login, backed by D1.
// Uses @simplewebauthn/server (v13) for the crypto-critical verification; we never
// hand-roll attestation/assertion checks. On success we mint a bearer session token.
//
// Flow state (the challenge) lives in `webauthn_challenges`, keyed by a random flow id
// the client echoes back — single-use, short-lived. Sessions live in `sessions`.

import { registrationAllowed } from "./registration.js";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

import {
  json,
  rpConfig,
  uuid,
  randomToken,
  isoIn,
  bufToB64u,
  b64uToBytes,
} from "./util.js";

const CHALLENGE_TTL = 300; // seconds
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/i;

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function newSession(env, userId) {
  const token = randomToken(32);
  await env.DB.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  )
    .bind(token, userId, isoIn(SESSION_TTL))
    .run();
  return token;
}

// --- registration ------------------------------------------------------------

async function registerOptions(request, env, origin) {
  const body = await readJson(request);
  // INVITE-ONLY until each user has their own graph — see registration.js. Checked first, so a
  // closed door costs no D1 read and reveals nothing about which handles exist.
  const allowed = registrationAllowed(env, body);
  if (!allowed.ok) return json({ ok: false, error: allowed.error }, allowed.status, origin);
  const handle = String(body?.handle || "").trim();
  if (!HANDLE_RE.test(handle)) {
    return json({ ok: false, error: "handle must be 2–32 chars (letters, digits, - _)" }, 422, origin);
  }
  const existing = await env.DB.prepare("SELECT id FROM users WHERE handle = ?").bind(handle).first();
  if (existing) {
    return json({ ok: false, error: "handle taken — try logging in" }, 409, origin);
  }

  const { rpID, rpName } = rpConfig(origin);
  const userId = uuid();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: handle,
    userDisplayName: handle,
    userID: b64uToBytes(bufToB64u(new TextEncoder().encode(userId))),
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const flowId = randomToken(16);
  await env.DB.prepare(
    "INSERT INTO webauthn_challenges (id, challenge, handle, user_id, expires_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(flowId, options.challenge, handle, userId, isoIn(CHALLENGE_TTL))
    .run();

  return json({ ok: true, flowId, options }, 200, origin);
}

async function registerVerify(request, env, origin) {
  const body = await readJson(request);
  const flowId = String(body?.flowId || "");
  const response = body?.response;
  if (!flowId || !response) return json({ ok: false, error: "bad request" }, 400, origin);

  const chal = await env.DB.prepare(
    "SELECT challenge, handle, user_id FROM webauthn_challenges WHERE id = ? AND expires_at > datetime('now')"
  )
    .bind(flowId)
    .first();
  if (!chal) return json({ ok: false, error: "challenge expired — start again" }, 400, origin);

  const { rpID, origin: expectedOrigin } = rpConfig(origin);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: chal.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (e) {
    return json({ ok: false, error: "verification failed: " + e.message }, 400, origin);
  }
  if (!verification.verified || !verification.registrationInfo) {
    return json({ ok: false, error: "not verified" }, 400, origin);
  }

  // @simplewebauthn v13: registrationInfo.credential = { id, publicKey, counter, transports }
  const cred = verification.registrationInfo.credential;
  const userId = chal.user_id;

  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, handle) VALUES (?, ?)").bind(userId, chal.handle),
    env.DB.prepare(
      "INSERT INTO credentials (id, user_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?)"
    ).bind(
      cred.id,
      userId,
      bufToB64u(cred.publicKey),
      cred.counter || 0,
      JSON.stringify(cred.transports || [])
    ),
    env.DB.prepare("DELETE FROM webauthn_challenges WHERE id = ?").bind(flowId),
  ]);

  const token = await newSession(env, userId);
  return json({ ok: true, token, handle: chal.handle }, 200, origin);
}

// --- login (authentication) --------------------------------------------------

async function loginOptions(request, env, origin) {
  const body = await readJson(request);
  const handle = String(body?.handle || "").trim();

  let allowCredentials = undefined; // undefined -> discoverable (usernameless) login
  if (handle) {
    const rows = await env.DB.prepare(
      `SELECT c.id AS id, c.transports AS transports
         FROM credentials c JOIN users u ON u.id = c.user_id WHERE u.handle = ?`
    )
      .bind(handle)
      .all();
    allowCredentials = (rows.results || []).map((r) => ({
      id: r.id,
      transports: safeJson(r.transports),
    }));
  }

  const { rpID } = rpConfig(origin);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    ...(allowCredentials ? { allowCredentials } : {}),
  });

  const flowId = randomToken(16);
  await env.DB.prepare(
    "INSERT INTO webauthn_challenges (id, challenge, expires_at) VALUES (?, ?, ?)"
  )
    .bind(flowId, options.challenge, isoIn(CHALLENGE_TTL))
    .run();

  return json({ ok: true, flowId, options }, 200, origin);
}

async function loginVerify(request, env, origin) {
  const body = await readJson(request);
  const flowId = String(body?.flowId || "");
  const response = body?.response;
  if (!flowId || !response?.id) return json({ ok: false, error: "bad request" }, 400, origin);

  const chal = await env.DB.prepare(
    "SELECT challenge FROM webauthn_challenges WHERE id = ? AND expires_at > datetime('now')"
  )
    .bind(flowId)
    .first();
  if (!chal) return json({ ok: false, error: "challenge expired — start again" }, 400, origin);

  const credRow = await env.DB.prepare(
    "SELECT id, user_id, public_key, counter, transports FROM credentials WHERE id = ?"
  )
    .bind(response.id)
    .first();
  if (!credRow) return json({ ok: false, error: "unknown passkey" }, 404, origin);

  const { rpID, origin: expectedOrigin } = rpConfig(origin);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: chal.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: credRow.id,
        publicKey: b64uToBytes(credRow.public_key),
        counter: credRow.counter,
        transports: safeJson(credRow.transports),
      },
    });
  } catch (e) {
    return json({ ok: false, error: "verification failed: " + e.message }, 400, origin);
  }
  if (!verification.verified) return json({ ok: false, error: "not verified" }, 400, origin);

  const handle = await env.DB.prepare("SELECT handle FROM users WHERE id = ?")
    .bind(credRow.user_id)
    .first();

  await env.DB.batch([
    env.DB.prepare("UPDATE credentials SET counter = ? WHERE id = ?").bind(
      verification.authenticationInfo.newCounter,
      credRow.id
    ),
    env.DB.prepare("DELETE FROM webauthn_challenges WHERE id = ?").bind(flowId),
  ]);

  const token = await newSession(env, credRow.user_id);
  return json({ ok: true, token, handle: handle?.handle || null }, 200, origin);
}

async function logout(request, env, origin) {
  const auth = request.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(m[1].trim()).run();
  return json({ ok: true }, 200, origin);
}

function safeJson(s) {
  try {
    return JSON.parse(s || "[]");
  } catch {
    return [];
  }
}

// Route /auth/* -> handler. Returns null if the path isn't an auth route.
export function handleAuth(request, env, url, origin) {
  if (request.method !== "POST") return null;
  const routes = {
    "/auth/register/options": registerOptions,
    "/auth/register/verify": registerVerify,
    "/auth/login/options": loginOptions,
    "/auth/login/verify": loginVerify,
    "/auth/logout": logout,
  };
  const fn = routes[url.pathname];
  return fn ? fn(request, env, origin) : null;
}

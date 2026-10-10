// RECENTLY USED (2026-10-10, backlog row recently-used-recorded-on-the-server; operator choice:
// shared on the server, not per device).
//
// GET  /app/recent   session — the user's recent keys, newest first (up to 50)
// POST /app/recent   session — {key} was used now
//
// A key is `view:<view id>` or `task:<qntm id>` (app/present/recent.ts says what each means). Keyed
// by the session's user id, never by a shared operator id, so it is per user from the start.

import { json } from "./util.js";

const KEY_RE = /^(view|task):[^\s]{1,200}$/;
const READ_LIMIT = 50;
const KEEP = 200;

export async function recentGet(request, env, origin, session) {
  const { results } = await env.DB.prepare(
    `SELECT item_key FROM recents WHERE user_id = ? ORDER BY used_at DESC LIMIT ?`,
  )
    .bind(session.user_id, READ_LIMIT)
    .all();
  return json({ ok: true, recent: (results || []).map((row) => row.item_key) }, 200, origin);
}

export async function recentPost(request, env, origin, session) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad request: body is not valid JSON" }, 400, origin);
  }
  const key = body?.key;
  if (typeof key !== "string" || !KEY_RE.test(key)) {
    return json({ ok: false, error: "bad request: 'key' must be view:<id> or task:<id>" }, 400, origin);
  }
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO recents (user_id, item_key, used_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, item_key) DO UPDATE SET used_at = excluded.used_at`,
    ).bind(session.user_id, key, now),
    env.DB.prepare(
      `DELETE FROM recents WHERE user_id = ? AND item_key NOT IN
         (SELECT item_key FROM recents WHERE user_id = ? ORDER BY used_at DESC LIMIT ?)`,
    ).bind(session.user_id, session.user_id, KEEP),
  ]);
  return json({ ok: true }, 200, origin);
}

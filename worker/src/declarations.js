// The compiled declaration's read-back — `docs/implementation-artifacts/design-the-runtime-compile.md`
// §2.3/§4.
//
// GET  /config/declaration/<kind>/current   public — the latest STORED version's body, no-cache
// GET  /config/declaration/<kind>/<version> public — one immutable version's body, cache-forever
//
// `?include=dropped` adds the compile's drop ledger; without it the body is the declaration alone,
// because a client never reads the ledger and it is a fifth of the bytes.
//
// THE ONE WRITER IS `POST /config/publish` (`publish.js`, 2026-10-09). This file used to store a
// declaration per kind on a Gate-1 compile alone — a second way in that never asked the engine, so
// a stored "current" could describe a config the engine had refused. It is gone; the kind a client
// reads is `presentation`, the whole document `compile-presentation.mjs` builds.
//
// WHY THE READ IS OPEN. The served declaration is the direct successor of `presentation.json`, a
// public asset the app has always fetched with no login. Single tenant: reads resolve against
// `env.GRAPH_USER_ID` until backlog row each-user-has-their-own-graph gives each user their own.

import { json } from "./util.js";
import { PRESENTATION_KIND } from "./publish.js";

/** The kinds a client can read. Older per-kind rows stay readable by version. */
const KINDS = new Set([PRESENTATION_KIND, "structural", "qualification", "resolution", "rules"]);

// Same shape `design-the-runtime-compile.md` §4.2 point 2 specifies for the immutable body — a
// version, once minted, never changes, so it is safe to cache forever.
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
// The pointer must always answer freshly (§4.2 point 1) — never cached, not even for a moment.
const NO_CACHE = "no-cache";

const VERSION_RE = /^sha256-[0-9a-f]{64}$/;

/** Shared body for both GET routes below — reads one stored (kind, version) row and answers with
 * the caller-chosen cache posture. `resolvedVersion` is echoed in the body so a "current" caller
 * (which did not name a version) still learns which one it got. */
async function readStoredVersion(env, origin, kind, version, cacheControl, withDropped) {
  const userId = env.GRAPH_USER_ID;
  if (!userId) return json({ ok: false, error: "not found" }, 404, origin);
  const row = await env.DB.prepare(
    `SELECT declaration_json, dropped_json FROM declarations WHERE user_id = ? AND kind = ? AND version = ?`,
  )
    .bind(userId, kind, version)
    .first();
  if (!row) return json({ ok: false, error: "not found" }, 404, origin);
  return json(
    {
      ok: true,
      kind,
      version,
      declaration: JSON.parse(row.declaration_json),
      ...(withDropped ? { dropped: JSON.parse(row.dropped_json) } : {}),
    },
    200,
    origin,
    { "Cache-Control": cacheControl },
  );
}

/** GET /config/declaration/<kind>/current — resolve the pointer, then serve its body. Two D1
 * reads, deliberately: the pointer table stays a tiny, freshly-read fact even though this route
 * folds the body fetch into the same response, matching `design-the-runtime-compile.md` §4.2's
 * two-tier scheme in substance (a caller learns "what is current" and gets the bytes together)
 * without yet building the separate pointer-only endpoint nothing consumes ahead of the front-end
 * work (roadmap step 3, out of this slice's scope). */
async function readCurrent(env, origin, kind, withDropped) {
  const userId = env.GRAPH_USER_ID;
  if (!userId) return json({ ok: false, error: "not found" }, 404, origin);
  const pointer = await env.DB.prepare(
    `SELECT version FROM declaration_current WHERE user_id = ? AND kind = ?`,
  )
    .bind(userId, kind)
    .first();
  if (!pointer) return json({ ok: false, error: "not found" }, 404, origin);
  return readStoredVersion(env, origin, kind, pointer.version, NO_CACHE, withDropped);
}

/**
 * @param {Request} request
 * @param {*} env
 * @param {URL} url
 * @param {string} origin
 * @returns {Promise<Response|null>} null if this request is not one of this file's routes.
 */
export async function handleDeclarations(request, env, url, origin) {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== "config" || segments[1] !== "declaration") return null;
  const kind = segments[2];
  if (!KINDS.has(kind) || request.method !== "GET" || segments.length !== 4) return null;
  const rest = segments[3];
  const withDropped = url.searchParams.get("include") === "dropped";
  if (rest === "current") return readCurrent(env, origin, kind, withDropped);
  if (VERSION_RE.test(rest)) return readStoredVersion(env, origin, kind, rest, IMMUTABLE_CACHE, withDropped);
  return null;
}

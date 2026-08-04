// The compiled declaration's storage and read-back — `docs/implementation-artifacts/
// design-the-runtime-compile.md` §2.3/§4, the piece `worker/src/config.js`'s Gate-1-only route
// deliberately leaves undone: "Nothing here is stored, nothing is forwarded to the graph server —
// those are Gate 2 and the two-consumer write path... explicitly not this route's job." This file
// is that missing piece, kept to the smallest slice that needs neither Gate 2 nor a second tenant:
// durable storage under a version key, and read-back by version or by "current" — nothing more.
//
// POST /config/declaration/structural       operator-only — compile(files), then store
// POST /config/declaration/qualification    operator-only — compile(files), then store
// POST /config/declaration/resolution       operator-only — compile(files), then store
// GET  /config/declaration/<kind>/current   public — the latest STORED version's body, no-cache
// GET  /config/declaration/<kind>/<version> public — one immutable version's body, cache-forever
//
// WHY THE WRITE IS OPERATOR-ONLY AND THE READ IS NOT. `config.js`'s own preview route is
// unauthenticated because it "touches no storage and names no user, so a session buys nothing but
// friction" — that reasoning stops applying the instant a POST durably writes a D1 row: an open
// write would let any caller grow the table without bound, the same cost/DoS surface `POST
// /app/graph` already guards with `operatorUser()` (a shared bearer key, not a session). This file
// reuses that exact gate rather than inventing a second notion of "who may write". The READ side
// stays open, unauthenticated, no session — the served declaration is the direct successor of
// `presentation.json`, a public asset the app fetches with no login today, and
// `design-the-runtime-compile.md` §4 designs its replacement as exactly that: a fetchable URL, not
// a protected one. Single-tenant throughout: reads resolve against `env.GRAPH_USER_ID`, the one
// operator id this Worker already treats as "the" tenant everywhere else (`app.js`
// `isOperatorSession`/`operatorUser`) — `config-is-per-user-not-per-server` (roadmap step 5) is
// unscoped, deliberately, and nothing here front-runs it.
//
// WHAT THIS DOES NOT DO, NAMED RATHER THAN IMPLIED. It never forwards to the graph server (Gate
// 2), so `engineAccepted` can only ever be `null` from this file — the engine was never asked.
// Storing here is Gate 1 alone, exactly as `POST /config/compile/*` already is: a stored/"current"
// version is a claim about what COMPILED, never a claim about what the engine has validated. A
// version is minted and the pointer flipped the instant Gate 1 passes, NOT held back pending a
// second gate — because there is no second gate wired to this route to hold it back for. That is
// the two-consumer write path (`design-the-runtime-compile.md` §3, roadmap step 4/step H) and it
// is not built here; `receipt.engineAccepted` staying `null` forever, from this file, is how that
// limit stays honest rather than silently implied "probably fine".

import { json } from "./util.js";
import { operatorUser } from "./app.js";
import { compile as compileStructural } from "../../scripts/compile-structural.mjs";
import { compile as compileQualification } from "../../scripts/compile-qualification.mjs";
import { compile as compileResolution } from "../../scripts/compile-resolution.mjs";

const COMPILERS = new Map([
  ["structural", compileStructural],
  ["qualification", compileQualification],
  ["resolution", compileResolution],
]);

// Same shape `design-the-runtime-compile.md` §4.2 point 2 specifies for the immutable body — a
// version, once minted, never changes, so it is safe to cache forever.
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
// The pointer must always answer freshly (§4.2 point 1) — never cached, not even for a moment.
const NO_CACHE = "no-cache";

const VERSION_RE = /^sha256-[0-9a-f]{64}$/;

/**
 * The receipt — extends `config.js`'s own shape with a REAL `stored`, rather than a second,
 * differently-shaped object. `engineAccepted` is always `null` from this file (see header).
 */
function receipt({ compiled, version, stored }) {
  return { compiled, version, stored, engineAccepted: null };
}

/** POST /config/declaration/<kind> — operator-only. Compiles the submitted files with the SAME
 * `compile(files)` the matching Gate-1 preview route calls, then durably stores the result under
 * its own content-hash version and flips the "current" pointer to it. */
async function storeDeclaration(request, env, origin, kind, compile) {
  const userId = operatorUser(request, env);
  if (!userId) return json({ ok: false, error: "not authorised" }, 401, origin);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad request: body is not valid JSON" }, 400, origin);
  }
  const files = body && typeof body === "object" ? body.files : undefined;
  if (files === null || typeof files !== "object" || Array.isArray(files)) {
    return json({ ok: false, error: "bad request: 'files' must be an object of path -> contents" }, 400, origin);
  }
  for (const [path, contents] of Object.entries(files)) {
    if (typeof contents !== "string") {
      return json({ ok: false, error: `bad request: 'files[${JSON.stringify(path)}]' is not a string` }, 400, origin);
    }
  }

  // GATE 1 — identical to `config.js`'s own preview route: a thrown error IS the refusal, named,
  // unreworded. On refusal there is nothing to store — `stored` is honestly `false`, not merely
  // unset, because nothing durable happened.
  let compiled;
  try {
    compiled = compile(files);
  } catch (error) {
    return json(
      {
        ok: false,
        refused: true,
        error: String(error?.message || error),
        receipt: receipt({ compiled: false, version: null, stored: false }),
      },
      422,
      origin,
    );
  }

  const declarationJson = JSON.stringify(compiled.declaration);
  const droppedJson = JSON.stringify(compiled.dropped);

  // The same loud-refusal-over-silent-loss posture `POST /app/graph` already takes at D1's 1 MB
  // row cap, applied here before either write below is attempted.
  if (declarationJson.length > 950_000 || droppedJson.length > 950_000) {
    return json(
      { ok: false, error: "declaration exceeds D1 row limit — enable R2 (see wrangler.toml)" },
      413,
      origin,
    );
  }

  // IDEMPOTENT, BY CONSTRUCTION, NOT BY A SEPARATE CHECK. `compiled.version` IS the content hash
  // of exactly `{declaration, dropped}` (`declaration-version.mjs`), so the SAME bytes can only
  // ever produce the SAME (user_id, kind, version) primary key — `ON CONFLICT ... DO NOTHING`
  // makes a repeat store a true no-op (no second row, no rewritten row) rather than a raced
  // INSERT that this code would otherwise have to detect and swallow by hand.
  await env.DB.prepare(
    `INSERT INTO declarations (user_id, kind, version, declaration_json, dropped_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, kind, version) DO NOTHING`,
  )
    .bind(userId, kind, compiled.version, declarationJson, droppedJson)
    .run();

  // The pointer always flips to the version just stored — a valid Gate-1 compile is, from this
  // route's own authority, the latest one, exactly as an operator's CLI -> commit -> GitHub Pages
  // push already makes the newest committed config "current" today. Nothing here waits on a
  // second gate that this route does not call (see header).
  await env.DB.prepare(
    `INSERT INTO declaration_current (user_id, kind, version, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, kind) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at`,
  )
    .bind(userId, kind, compiled.version)
    .run();

  return json(
    {
      ok: true,
      declaration: compiled.declaration,
      dropped: compiled.dropped,
      receipt: receipt({ compiled: true, version: compiled.version, stored: true }),
    },
    200,
    origin,
  );
}

/** Shared body for both GET routes below — reads one stored (kind, version) row and answers with
 * the caller-chosen cache posture. `resolvedVersion` is echoed in the body so a "current" caller
 * (which did not name a version) still learns which one it got. */
async function readStoredVersion(env, origin, kind, version, cacheControl) {
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
      dropped: JSON.parse(row.dropped_json),
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
async function readCurrent(env, origin, kind) {
  const userId = env.GRAPH_USER_ID;
  if (!userId) return json({ ok: false, error: "not found" }, 404, origin);
  const pointer = await env.DB.prepare(
    `SELECT version FROM declaration_current WHERE user_id = ? AND kind = ?`,
  )
    .bind(userId, kind)
    .first();
  if (!pointer) return json({ ok: false, error: "not found" }, 404, origin);
  return readStoredVersion(env, origin, kind, pointer.version, NO_CACHE);
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
  const compile = COMPILERS.get(kind);
  if (!compile) return null;
  const rest = segments[3];

  if (request.method === "POST" && segments.length === 3) {
    return storeDeclaration(request, env, origin, kind, compile);
  }
  if (request.method === "GET" && rest === "current" && segments.length === 4) {
    return readCurrent(env, origin, kind);
  }
  if (request.method === "GET" && segments.length === 4 && VERSION_RE.test(rest)) {
    return readStoredVersion(env, origin, kind, rest, IMMUTABLE_CACHE);
  }
  return null;
}

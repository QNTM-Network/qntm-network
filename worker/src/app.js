// The qntm app skeleton — capture, and surface THE ONE THING.
// Every route requires a valid bearer session. "The one thing" is DERIVED (not stored):
// v1 = the oldest still-open capture — the thing you've known needed doing the longest.
// (prioritization-is-derived — sharpen the heuristic later without a data migration.)

import { json, notModified, getSession, uuid, isoIn, bearer } from "./util.js";

async function loadState(env, userId, handle) {
  const rows = await env.DB.prepare(
    `SELECT id, text, created_at FROM captures
      WHERE user_id = ? AND status = 'open' ORDER BY created_at ASC`
  )
    .bind(userId)
    .all();
  const open = rows.results || [];
  return {
    ok: true,
    handle,
    oneThing: open.length ? open[0] : null, // oldest open = the one thing
    captures: open,
    count: open.length,
  };
}

async function capture(request, env, origin, session) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400, origin);
  }
  const text = String(body?.text || "").trim();
  if (!text) return json({ ok: false, error: "nothing to capture" }, 422, origin);
  if (text.length > 2000) return json({ ok: false, error: "too long" }, 422, origin);

  await env.DB.prepare("INSERT INTO captures (id, user_id, text) VALUES (?, ?, ?)")
    .bind(uuid(), session.user_id, text)
    .run();
  return json(await loadState(env, session.user_id, session.handle), 200, origin);
}

async function markDone(request, env, origin, session) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400, origin);
  }
  const id = String(body?.id || "");
  if (!id) return json({ ok: false, error: "bad request" }, 400, origin);
  await env.DB.prepare(
    "UPDATE captures SET status = 'done', done_at = datetime('now') WHERE id = ? AND user_id = ?"
  )
    .bind(id, session.user_id)
    .run();
  return json(await loadState(env, session.user_id, session.handle), 200, origin);
}

async function state(request, env, origin, session) {
  return json(await loadState(env, session.user_id, session.handle), 200, origin);
}

// ── graph hosting (Option A) — see docs/architecture/graph-hosting-plan.md ────────────────
// Two engines, one seam: qntm-md (local) projects the graph -> a snapshot; the browser displays
// it. The browser talks ONLY to GET /app/graph + POST /app/edit; the producer sits behind the
// operator key. That is what lets projection slide laptop -> server later with no browser change.

const EDIT_KINDS = new Set(["done", "reopen", "capture", "reprioritise"]);

// ── the tenancy boundary ─────────────────────────────────────────────────────────────────────
//
// THE HOSTED MODEL HAS EXACTLY ONE TENANT AND IT IS NOT WHOEVER IS LOGGED IN.
//
// `qntm-graph.fly.dev` holds ONE `/data/state.db`, ONE `/data/vault` and ONE `/data/config`, and
// its bearer (`SERVER_TOKEN`) is a SERVER credential, not a user credential — it says "the Worker
// is calling", never "and this is who for". `server/app.py` in the sibling engine repo takes no
// user on any route: `/graph` reads THE db, `/vault/file` writes THE vault, `/cycle` cycles THE
// model. Every one of those is the operator's.
//
// So a session bearer proves WHO you are and the server bearer proves the call is legitimate, and
// nothing in between ever asked whether this person is entitled to THAT graph. Before this gate,
// `graphGet` handed the hosted envelope — all 77 rendered views and the whole graph blob — to any
// caller holding any valid session, and `editFile` let any such caller overwrite any path inside
// the operator's live vault and run a cycle over it. Registration is open (`auth.js#registerOptions`
// checks a handle regex and uniqueness, nothing else), so "any valid session" meant "anyone who
// chose an unused handle". That was not a future risk; `GRAPH_SERVER_URL` and `SERVER_TOKEN` are
// both set in production, so the hosted branch is the live branch.
//
// Until the server can name a tenant, the only honest boundary is: THE SHARED MODEL IS THE
// OPERATOR'S, AND ONLY THE OPERATOR'S SESSION REACHES IT. `GRAPH_USER_ID` already means exactly
// "the operator's `users.id`" — `operatorUser()` below has always mapped `GRAPH_PUSH_KEY` onto it,
// and every `graph_snapshots` row in D1 carries it. This gate reuses that fact rather than
// inventing a second notion of who the operator is.
//
// FAIL CLOSED, in the posture `server/app.py#_require_auth` already sets for `SERVER_TOKEN`: with
// `GRAPH_USER_ID` UNSET there is no way to establish that ANY session is the operator's, so the
// answer is nobody — not everybody. `!env.GRAPH_USER_ID` returning false here is what makes an
// unconfigured Worker serve the shared model to the world, so it must return false the other way.
//
// This is a GATE, not a tenancy model. It does not give a second person a graph; it stops a second
// person being given the FIRST person's. What replaces it — a per-user db and vault on the volume,
// with the path DERIVED from the session and never accepted from the request — is stage 3 of
// docs/implementation-artifacts/design-a-user-owns-their-graph.md.
function isOperatorSession(env, session) {
  const operatorId = env.GRAPH_USER_ID;
  if (!operatorId) return false; // unconfigured -> nobody, never everybody
  return session?.user_id === operatorId;
}

async function pendingCount(env, userId) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM graph_edits WHERE user_id = ? AND status = 'pending'"
  )
    .bind(userId)
    .first();
  return row?.n || 0;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE WRITE-CORRELATION ECHO — CARRIED THROUGH THIS WORKER, NEVER PRODUCED BY IT
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// The browser mints one opaque token per write (app/present/correlation.ts) and posts it beside
// `{path, markdown, base}`. The graph server records it and names it back in the projection it
// serves, as `writes: {path: [token, ...]}` at the TOP of its own envelope, and the browser then
// knows ITS write landed rather than that some write did.
//
// THIS WORKER REBUILDS THE ENVELOPE FIELD BY FIELD IN TWO PLACES, WHICH IS WHY THIS HELPER EXISTS.
// `graphGet` and `editFile` each construct `snapshot` from a fixed list of keys, so anything the
// graph server adds is DROPPED by default — a contract landing on the other side of the wire would
// have been silently swallowed here and read as "the server echoes nothing". MEASURED: without the
// two spreads below, a graph server emitting `writes` produces a browser envelope with no `writes`
// in it at all, and every held row goes on being held for want of a field that was on the wire.
//
// CARRIED VERBATIM AND ONLY WHEN THERE IS ONE. No shape is asserted here — the browser's own strict
// reader is the single place the shape is known — and NOTHING IS SUBSTITUTED FOR AN ABSENT ONE. An
// unconditional `writes: e.writes || {}` would be the wrong default and not a tidier one: it would
// make every projection from today's DEPLOYED graph server, which knows nothing of any of this,
// arrive at the browser carrying an empty echo. The browser reads "no key at all" as silence and
// behaves exactly as it did before correlation existed; it reads "an empty echo" as a server that
// is answering, which starts a grace running and puts a sentence on the freshness line. Absent and
// empty are different statements, and only one of them is true of a server that has never heard of
// a token.
const WRITE_ECHO_KEY = "writes";

/** The first of `sources` that names the echo at all, or `undefined` when none does. */
function echoOf(...sources) {
  for (const source of sources) {
    if (source !== null && typeof source === "object" && source[WRITE_ECHO_KEY] !== undefined) {
      return source[WRITE_ECHO_KEY];
    }
  }
  return undefined;
}

/** `{write_tokens: …}` when there is an echo to carry, and an EMPTY object when there is not. */
function echoFields(...sources) {
  const echo = echoOf(...sources);
  return echo === undefined ? {} : { [WRITE_ECHO_KEY]: echo };
}

// GET /app/graph (session) — serve the projection. The hosted model (Fly) is the source of
// truth; the D1 snapshot is a fallback for when the server is unreachable.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// CONDITIONAL, BOTH DIRECTIONS — efficient-graph-read-path (2026-08-07)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// THIS FUNCTION IS NOT THE PURE RELAY AN EARLIER SURVEY CALLED IT. It never forwards Fly's bytes —
// it parses `e` and rebuilds a DIFFERENT JSON object (`ok`, `handle`, `source`, a `snapshot`
// wrapper, `pending_edits` from D1). That reshaping is exactly why this route cannot simply repeat
// Fly's `ETag` back to the browser as if the two responses were the same representation — they are
// not, byte for byte. What IS true, and what this comment stakes the design on: `pending_edits` is
// the ONLY field here Fly's ETag does not govern, it comes from a cheap, independent D1 read
// (`graph_edits`, the web-gesture queue — a different write path from the one `pickup.ts` polls
// for), and treating it as "may lag by one poll" rather than folding it into a second hash is a
// bounded, self-correcting imprecision, not the stale-304-hides-a-real-change failure the brief
// warns about. Fly's ETag is reused VERBATIM as this route's own `ETag` on exactly that basis.
//
// THE FORWARD DIRECTION. `If-None-Match` the BROWSER sent (revalidating ITS OWN cached copy of
// THIS route's prior response) is read off `request` and forwarded to Fly as ITS `If-None-Match` —
// the same value, because this route's ETag IS Fly's ETag. Skipping this is the exact failure
// named in the brief: an ETag Fly can check but a browser's revalidation never reaches is a
// declaration that does not reach.
//
// THE BACK DIRECTION. Fly's `304` (no body, `graph`/`views`/`writes` provably unchanged) is
// answered with the Worker's OWN `304` — no body, `pending_edits` simply not refreshed on this
// particular answer (see above). Fly's `200` is answered as today, PLUS the `ETag` header this
// route did not carry before.
async function graphGet(request, env, origin, session) {
  // Prefer the hosted model — FOR THE ONE PERSON IT BELONGS TO. A non-operator session falls
  // through to the D1 path below, which is already keyed by `user_id`, so a second person sees
  // their OWN snapshot (today: none, `snapshot: null`) rather than a 403. That is deliberate:
  // "you have no graph yet" is the truth for a new account, and it is a shape the app already
  // renders. A refusal here would read as breakage; an empty graph reads as a new beginning.
  // The WRITE path is not so forgiving — see `editFile`.
  if (env.GRAPH_SERVER_URL && env.SERVER_TOKEN && isOperatorSession(env, session)) {
    try {
      const flyHeaders = { Authorization: `Bearer ${env.SERVER_TOKEN}` };
      const inm = request.headers.get("If-None-Match");
      if (inm) flyHeaders["If-None-Match"] = inm;

      const r = await fetch(`${env.GRAPH_SERVER_URL}/graph`, { headers: flyHeaders });

      if (r.status === 304) {
        // Fly's own answer already proves the tag is still current, so it is the fallback even in
        // the (should-never-happen) case Fly's 304 omitted its own `ETag` header.
        return notModified(origin, r.headers.get("ETag") || inm);
      }

      if (r.ok) {
        const e = await r.json();
        const etag = r.headers.get("ETag");
        return json(
          {
            ok: true,
            handle: session.handle,
            source: "server",
            snapshot: {
              version: null,
              generated_at: e.generated_at,
              views: e.views || [],
              graph: e.graph || {},
              locations: e.locations || {},
              // The echo, when the graph server names one — see `echoFields`. This is the READ
              // path the contract names in as many words: "the server echoes it in the envelope
              // that GET /graph later serves".
              ...echoFields(e),
            },
            pending_edits: await pendingCount(env, session.user_id),
          },
          200,
          origin,
          // ABSENT, NEVER EMPTY, when Fly sent none — an older Fly deployment must not make this
          // route hand back an ETag nothing ever validates, which would fail CLOSED (every future
          // read looks changed) rather than open. `undefined` here means `json()`'s spread adds no
          // `ETag` key at all, so a browser that gets no ETag simply asks unconditionally next
          // time, exactly as it does today.
          etag ? { ETag: etag } : {}
        );
      }
    } catch {
      // fall through to the D1 snapshot
    }
  }

  const head = await env.DB.prepare(
    `SELECT version, generated_at, graph_json, locations_json FROM graph_snapshots
      WHERE user_id = ? ORDER BY version DESC LIMIT 1`
  )
    .bind(session.user_id)
    .first();
  if (!head) {
    return json(
      { ok: true, handle: session.handle, snapshot: null, pending_edits: 0 },
      200,
      origin
    );
  }
  const rows = await env.DB.prepare(
    `SELECT view_id, path, title, domain, markdown FROM graph_snapshot_views
      WHERE user_id = ? AND version = ? ORDER BY view_id`
  )
    .bind(session.user_id, head.version)
    .all();
  const snapshot = {
    version: head.version,
    generated_at: head.generated_at,
    views: (rows.results || []).map((r) => ({
      id: r.view_id,
      path: r.path,
      title: r.title,
      domain: r.domain,
      markdown: r.markdown,
    })),
    graph: JSON.parse(head.graph_json),
    locations: JSON.parse(head.locations_json || "{}"),
  };
  return json(
    {
      ok: true,
      handle: session.handle,
      snapshot,
      pending_edits: await pendingCount(env, session.user_id),
    },
    200,
    origin
  );
}

// POST /app/edit (session) — enqueue one web gesture. Never writes the graph; the laptop drains
// this queue, applies it as a textual vault edit, and lets qntm-md's cycle reconcile it.
async function editPost(request, env, origin, session) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400, origin);
  }
  const kind = String(body?.kind || "");
  if (!EDIT_KINDS.has(kind)) return json({ ok: false, error: "unknown kind" }, 422, origin);
  const nodeId = body?.node_id ? String(body.node_id) : null;
  if (kind !== "capture" && !nodeId) {
    return json({ ok: false, error: "node_id required" }, 422, origin);
  }
  const payload = body?.payload != null ? JSON.stringify(body.payload) : null;
  await env.DB.prepare(
    "INSERT INTO graph_edits (id, user_id, kind, node_id, payload_json) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(uuid(), session.user_id, kind, nodeId, payload)
    .run();
  return json({ ok: true, pending_edits: await pendingCount(env, session.user_id) }, 200, origin);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE RERUN, BOUNDED TO EXACTLY ONE EXTRA CYCLE
// (backlog `rerun-on-refusal`; server/app.py `POST /cycle`, aa4b069 — verified against the real
// file, not assumed from a report: the keys are `write_refusals` — a list of the paths the cycle
// declined to write back — and `rerun_recommended` — `bool(refusals)`, true iff that list is
// non-empty. Both are unconditional entries in the response dict, so an OLDER server simply omits
// both keys rather than sending them empty or null.)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// aa4b069 made the cycle's write-back compare before it writes and REFUSE a view file that changed
// on disk mid-cycle — a save landing in that window is safe, but the cycle that refused is the one
// that would have stamped it, so the file sits un-rendered until ANOTHER cycle runs. That is what
// `rerun_recommended` is FOR: the one useful response to it is to run `/cycle` again.
//
// THE BOUND IS ONE CALL, NOT A LOOP. `cycleOnceMore` fetches `/cycle` exactly once and never asks
// what ITS OWN answer recommends — a second `rerun_recommended: true` is read, not chased. Read
// every call site below: each one calls `/cycle`, then AT MOST ONCE calls `cycleOnceMore`. There is
// no while loop and no recursion, so the bound is not a runtime count that could grow — it is two
// fetches in the source text, full stop, however many refusals the rerun itself goes on to report.
//
// WHY ONE RERUN IS ENOUGH RATHER THAN ZERO OR N. The refusal fires because a save landed between
// the cycle's READ of the vault and its WRITE-BACK — a window exactly one cycle wide. A second
// cycle reads the vault fresh, so the file that was refused is now ordinary input the rerun stamps
// normally. For the rerun ITSELF to be refused again, a save would have to land in the much
// narrower window between the FIRST cycle's write and the SECOND cycle's read — possible, but that
// save gets its own `rerun_recommended` for the NEXT request to this Worker to pick up. Chasing it
// here would turn one slow request into an unbounded one for the sake of a race so narrow the
// existing mechanism already covers it on the next gesture.
//
// WHAT IT COSTS. A cycle is the ~10-14s step this file measures elsewhere (`editFile`'s own
// comments below). A rerun DOUBLES that wait on whichever path takes it — doubles the synchronous
// caller's latency, and doubles how long the `ack: true` path keeps the Worker alive under
// `waitUntil`. That second cost is real even though nothing is billed for Worker CPU on that path:
// it is wall time the Fly machine stays awake for, paid for exactly like the first cycle is.
//
// WHY IT CANNOT OVERLAP A CYCLE ALREADY RUNNING. `server/app.py` serialises every `/cycle` call
// through one process-wide `threading.Lock()` (`_cycle_lock`), and there is no distinct "busy"
// answer for a caller that arrives while it is held — `with _cycle_lock:` simply BLOCKS the request
// inside the handler until the lock frees, then runs and answers exactly as if nothing had queued
// (200, or the ordinary 500 on a failed cycle). Two consequences follow. First, `cycleOnceMore` is
// only ever called AFTER the cycle that recommended it has already returned its full response, so
// it cannot race the cycle that produced the recommendation — that one is already finished by
// construction. Second, if some UNRELATED trigger holds the lock when the rerun's `fetch` lands,
// the rerun does not error or get told to back off — it queues behind the lock, silently, and pays
// only added latency, never a corrupted overlap. There is no locked-response to branch on because
// the server never sends one; blocking IS the answer.
//
// ABSENCE IS SAFE. `d?.rerun_recommended === true` is false for `undefined` (an older server that
// never learned the key) exactly as it is for `false` — so every call site below runs one cycle,
// exactly as it did before this change, whenever the key is missing.
//
// FAILS OPEN ON THE RERUN'S OWN FAILURE. If the rerun's `fetch` throws or answers anything other
// than `ok: true`, `cycleOnceMore` returns `null` and the caller keeps the ORIGINAL cycle's result —
// a rerun that cannot complete must never turn an already-successful cycle into a reported failure.
async function cycleOnceMore(env, auth) {
  try {
    const r = await fetch(`${env.GRAPH_SERVER_URL}/cycle`, { method: "POST", headers: auth });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d?.ok) return d;
  } catch {
    // The rerun's own network failure — fall through and hand the caller nothing, so it keeps
    // whatever the first cycle already produced rather than losing a good result to a bad retry.
  }
  return null;
}

// POST /app/edit-file (session) — the web write path. The browser sends {path, markdown, base,
// token} for one view; we write it on the hosted model, run a cycle, and return the fresh
// projection. `base` and `token` are both OPTIONAL and both forwarded only when present. The
// operator token stays server-side; the browser only ever holds its passkey session.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE PRECONDITION, AND THE ONE THING THIS WORKER MUST NEVER DO WITH IT
// (design-the-resolution-architecture.md step 13; backlog `the-write-is-refused-server-side`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// `base` is `sha256-<hex>` of exactly the bytes the browser's edit was computed against
// (app/present/base.ts `baseOf`). It says ONE thing: "I believe this file currently says X". It
// is the whole of optimistic concurrency control on this path, because every save posts the WHOLE
// FILE and whoever receives it overwrites what they are sent.
//
// THIS WORKER FORWARDS THE CLAIM. IT DOES NOT ADJUDICATE IT — and that is a decision, not an
// omission. To refuse, something must know what the file says NOW. `server/app.py` offers
// `POST /vault/file` (an unconditional write) and `GET /graph` (the whole 77-view envelope) and
// nothing else; there is no per-file read. So the only refusal this Worker could build alone is
// READ-THEN-WRITE, and check-then-act has a race of its own: between the read and the write, a
// cycle can rewrite the file and the write clobbers it anyway. The row already judges that weaker,
// and there is a second, larger reason recorded on the row: a refusal is only safe once the
// BROWSER can hold a refused edit's characters, and today it can only keep them on screen. A
// refusal fires on an ordinary gesture (a second edit inside one ~14 s cycle), so switching one on
// before the holding half exists would trade a silent loss of the ENGINE'S output for a visible
// loss of the OPERATOR'S typing. That is the worse trade.
//
// SO EXACTLY ONE EXPRESSION BELOW CAN REFUSE A WRITE: `w.status === 409`, the graph server's own
// answer. This Worker compares no strings and computes no digests, so it cannot invent a mismatch,
// and a `base` it cannot understand is still just a string it hands on. WHEN `base` IS ABSENT IT
// IS NOT FORWARDED AT ALL — absent, never empty and never null — so a caller that predates this
// change sends a request byte-for-byte identical to the one it sent before, and gets today's
// unconditional write. Everything else fails OPEN: a graph server that never learns to refuse
// never refuses, and this path behaves exactly as it did.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// AND THE WRITE CAN NOW ANSWER BEFORE THE CYCLE — `ack: true`, OPT-IN, FROM THE BROWSER
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// The two fetches below are ~250 ms and ~10 s. Waiting for the second is why a checkbox takes ten
// seconds to answer, and the cycle's output is not what the operator is waiting to see — he already
// knows what he ticked. So `ack: true` splits the answer in two: the write is confirmed on the vault
// write, and the cycle runs in `ctx.waitUntil`, which keeps the Worker alive past the response.
//
// THE PROJECTION IS THEN COLLECTED SEPARATELY, by the browser, as a bounded series of `GET
// /app/graph` reads placed after the write (app/present/pickup.ts). It is NOT a poll: nothing is
// read unless a write was accepted, the series ends, and the whole window falls inside the wake the
// write itself already paid for on the Fly machine.
//
// THREE WAYS IT FALLS BACK TO TODAY'S BEHAVIOUR, AND ALL THREE ARE THE SAME DIRECTION. A browser
// that does not send `ack` gets the synchronous answer it has always had. A runtime that hands this
// handler no `ctx` (every test that called it with four arguments, and any future caller) gets the
// synchronous answer, because there would be nothing to run the cycle. And a 409 or a failed write
// is answered BEFORE this branch is reached, so an accepted-but-unwritten file is not a state that
// exists. Fail open, in both directions, exactly as `base` and `token` already do.
async function editFile(request, env, origin, session, ctx) {
  // The write half of the tenancy boundary, and the one that must REFUSE rather than degrade.
  // `POST /vault/file` on the hosted model writes into the operator's live vault at a path this
  // request body chooses, and `POST /cycle` then ingests it as authored content. There is no
  // per-user destination to fall through to, so a non-operator session is told no. 403, not 401:
  // the caller authenticated fine, they are simply not entitled to this model.
  if (!isOperatorSession(env, session)) {
    return json({ ok: false, error: "not your graph" }, 403, origin);
  }
  if (!env.GRAPH_SERVER_URL || !env.SERVER_TOKEN) {
    return json({ ok: false, error: "server not configured" }, 503, origin);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400, origin);
  }
  const path = String(body?.path || "");
  if (!path || body?.markdown == null) {
    return json({ ok: false, error: "path and markdown required" }, 422, origin);
  }

  // THE CLAIM, CARRIED ONLY WHEN THERE IS ONE. A non-string, an empty string or a missing field
  // are all the same thing here — this write makes no claim — and the difference between "no
  // claim" and "a claim I cannot read" is the receiver's to draw, not this Worker's, which is
  // exactly why nothing is substituted for an absent one.
  const write = { path, markdown: body.markdown };
  if (typeof body?.base === "string" && body.base !== "") write.base = body.base;
  // THE CORRELATION TOKEN, FORWARDED ON EXACTLY THE SAME TERMS AS `base` IMMEDIATELY ABOVE, and for
  // exactly the same reason. `token` is the browser's opaque per-write handle
  // (app/present/correlation.ts `mintWriteToken`). It says ONE thing: "this POST is mine". The
  // graph server records it and echoes it in the projection it later serves, and the browser then
  // knows ITS write landed rather than that some write did — which is what stops the recovery strip
  // holding lines that saved perfectly (measured: three of five rows in a real browser run).
  //
  // THIS WORKER NEITHER MINTS NOR ADJUDICATES ONE. It compares no strings and generates no
  // randomness, so it cannot invent a token, and a token it cannot understand is still just a
  // string it hands on. WHEN `token` IS ABSENT IT IS NOT FORWARDED AT ALL — absent, never empty and
  // never null — so a browser that predates this change sends a request byte-for-byte identical to
  // the one it sent before, and a graph server that never learns to record one never records one.
  // Everything on this path fails OPEN, in both directions.
  if (typeof body?.token === "string" && body.token !== "") write.token = body.token;

  const auth = { Authorization: `Bearer ${env.SERVER_TOKEN}` };
  // 1. overwrite the single view on the hosted model
  const w = await fetch(`${env.GRAPH_SERVER_URL}/vault/file`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(write),
  });
  // 1a. THE REFUSAL, AND IT IS THE GRAPH SERVER'S, NOT THIS WORKER'S. 409 means the precondition
  // did not hold and NOTHING WAS WRITTEN — so the cycle below is skipped, because a cycle after a
  // refused write would tell the browser its edit had been ingested. `current` is what the file
  // says instead, passed through verbatim when the server sends it and `null` when it does not;
  // nothing here reconstructs it. Distinguishable from the 502 immediately after it on purpose:
  // "your edit is stale" and "the write failed" are different events and the page answers them
  // differently. NOTE: no deployed graph server answers 409 today, so this branch is unreachable
  // in production until the monorepo change on the row lands — it is complete, tested against a
  // fixture, and inert.
  if (w.status === 409) {
    const refusal = await w.json().catch(() => ({}));
    return json(
      {
        ok: false,
        error: "stale base — the file changed since this edit was computed, so nothing was written",
        refused: "stale-base",
        path,
        current: typeof refusal?.current === "string" ? refusal.current : null,
      },
      409,
      origin
    );
  }
  if (!w.ok) return json({ ok: false, error: "write failed" }, 502, origin);

  // 1b. THE ACK. The vault holds the operator's bytes; the cycle is the engine's answer to them, and
  // it is not what he is waiting to see. `accepted: true` is the browser's signal that this answer
  // is deliberately projection-less — it is the difference between "the server sent no projection"
  // and "the server sent a malformed one", and the page says a different sentence for each.
  //
  // NO SNAPSHOT KEY AT ALL, absent rather than null, for the reason `echoFields` states one
  // paragraph up: absent and empty are different statements. The page reads `!data.snapshot` as "no
  // projection came back" and must not be handed an empty one to paint.
  //
  // `waitUntil` TAKES THE PROMISE AND NOTHING OUTSIDE IT READS THE RESPONSE. A cycle that fails
  // after this point cannot be reported to a response that has already been sent, and inventing a
  // second channel to report it on would be a worse answer than the one that exists: the browser's
  // pickup finds no acknowledgement of its write, gives up after a bounded series, and says so.
  //
  // WHAT CHANGED: the promise now reads its OWN cycle's answer — not to report it anywhere, but to
  // decide whether one rerun is owed (see `cycleOnceMore` above for the bound, the cost, and why it
  // cannot overlap a cycle already running). `deferred` still holds exactly one promise; the rerun
  // is a second `fetch` INSIDE that same promise chain, not a second registration with `waitUntil`,
  // so the Worker is kept alive for the whole chain and not a token more.
  if (body?.ack === true && typeof ctx?.waitUntil === "function") {
    ctx.waitUntil(
      (async () => {
        const r = await fetch(`${env.GRAPH_SERVER_URL}/cycle`, { method: "POST", headers: auth });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d?.rerun_recommended === true) await cycleOnceMore(env, auth);
        return d;
      })()
    );
    return json(
      {
        ok: true,
        handle: session.handle,
        source: "server",
        accepted: true,
        path,
        pending_edits: await pendingCount(env, session.user_id),
      },
      200,
      origin
    );
  }

  // 2. cycle (ingest the edit + re-project) — this is the ~14s step
  const c = await fetch(`${env.GRAPH_SERVER_URL}/cycle`, { method: "POST", headers: auth });
  let cd = await c.json().catch(() => ({}));
  if (!c.ok || !cd.ok) return json({ ok: false, error: "cycle failed" }, 502, origin);
  // 2a. THE RERUN — see `cycleOnceMore`'s own comment above for the bound, the cost, and why it
  // cannot overlap a cycle already running. `cd.rerun_recommended` is `undefined` on an older
  // server, `undefined === true` is `false`, and this branch is skipped exactly as if it did not
  // exist — the projection below is built from the first cycle's answer, today's behaviour intact.
  if (cd.rerun_recommended === true) {
    const again = await cycleOnceMore(env, auth);
    // A rerun that could not complete leaves `cd` as the first cycle's own answer — still correct,
    // just not yet re-stamped — rather than losing a good result to a failed retry.
    if (again) cd = again;
  }
  // 3. hand back the fresh projection, same shape as GET /app/graph
  return json(
    {
      ok: true,
      handle: session.handle,
      source: "server",
      snapshot: {
        version: null,
        generated_at: cd.snapshot?.generated_at,
        views: cd.snapshot?.views || [],
        graph: cd.snapshot?.graph || {},
        locations: cd.snapshot?.locations || {},
        // The echo, when the cycle names one, from either altitude of its own answer — see
        // `echoFields`. This is the WRITE path's own acknowledgement, and it is the first place an
        // echoing server can put one: the answer to the very POST that carried the token.
        ...echoFields(cd.snapshot, cd),
      },
      pending_edits: await pendingCount(env, session.user_id),
    },
    200,
    origin
  );
}

// Operator (headless laptop) auth: GRAPH_PUSH_KEY sent as Bearer -> the single operator user_id.
// EXPORTED so `worker/src/declarations.js` can gate its own store route on the same shared key —
// the identical reasoning `POST /app/graph` already applies (a write that durably grows a D1 table
// needs the same "who may write" gate, not a second one invented to match).
export function operatorUser(request, env) {
  const key = bearer(request);
  if (!key || !env.GRAPH_PUSH_KEY || key !== env.GRAPH_PUSH_KEY) return null;
  return env.GRAPH_USER_ID || null;
}

// POST /app/graph (operator) — push a projection snapshot into D1 (split rows), then prune the
// previous version and drain the edits the laptop applied this cycle.
async function graphPush(request, env, origin, userId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400, origin);
  }
  const snapshot = body?.snapshot;
  if (!snapshot || !Array.isArray(snapshot.views)) {
    return json({ ok: false, error: "bad snapshot" }, 422, origin);
  }
  const last = await env.DB.prepare(
    "SELECT MAX(version) AS v FROM graph_snapshots WHERE user_id = ?"
  )
    .bind(userId)
    .first();
  const version = (last?.v || 0) + 1;
  const generated_at = String(snapshot.generated_at || isoIn(0));
  const graph_json = JSON.stringify(snapshot.graph ?? {});
  const locations_json = JSON.stringify(snapshot.locations ?? {});

  // Reject before we hit D1's 1 MB row cap, so growth fails loud (not a silent lost push).
  if (graph_json.length > 950_000) {
    return json(
      { ok: false, error: "graph exceeds D1 row limit — enable R2 (see wrangler.toml)" },
      413,
      origin
    );
  }

  // The graph blob is the one big row — insert it on its own (not inside a giant batch).
  await env.DB.prepare(
    `INSERT INTO graph_snapshots (user_id, version, generated_at, graph_json, locations_json)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(userId, version, generated_at, graph_json, locations_json)
    .run();

  // The views are many small rows — one atomic batch.
  const viewStmt = env.DB.prepare(
    `INSERT INTO graph_snapshot_views (user_id, version, view_id, path, title, domain, markdown)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  await env.DB.batch(
    snapshot.views.map((v) =>
      viewStmt.bind(
        userId,
        version,
        String(v.id),
        String(v.path ?? ""),
        String(v.title ?? v.id),
        v.domain ?? null,
        String(v.markdown ?? "")
      )
    )
  );

  // Mark the edits the laptop applied in this cycle as landed, then prune the old version.
  const appliedIds = Array.isArray(body?.applied_edit_ids)
    ? body.applied_edit_ids.map(String)
    : [];
  const tail = [
    env.DB.prepare(
      "DELETE FROM graph_snapshots WHERE user_id = ? AND version < ?"
    ).bind(userId, version),
    env.DB.prepare(
      "DELETE FROM graph_snapshot_views WHERE user_id = ? AND version < ?"
    ).bind(userId, version),
  ];
  for (const id of appliedIds) {
    tail.push(
      env.DB.prepare(
        `UPDATE graph_edits SET status = 'applied', applied_at = datetime('now'), applied_in_version = ?
          WHERE id = ? AND user_id = ? AND status = 'pending'`
      ).bind(version, id, userId)
    );
  }
  await env.DB.batch(tail);

  return json({ ok: true, version, views: snapshot.views.length, applied: appliedIds.length }, 200, origin);
}

// GET /app/edits/pending (operator) — the queue the laptop drains before the next cycle.
async function editsPending(request, env, origin, userId) {
  const rows = await env.DB.prepare(
    `SELECT id, kind, node_id, payload_json, created_at FROM graph_edits
      WHERE user_id = ? AND status = 'pending' ORDER BY created_at ASC`
  )
    .bind(userId)
    .all();
  return json({ ok: true, edits: rows.results || [] }, 200, origin);
}

// Route /app/* -> handler. Session routes need a bearer session; operator routes (the headless
// laptop producer) need GRAPH_PUSH_KEY. Returns null if not an app route.
export async function handleApp(request, env, url, origin, ctx) {
  const key = `${request.method} ${url.pathname}`;

  // Operator routes — the snapshot producer, behind the shared key (not a user session).
  const operatorRoutes = {
    "POST /app/graph": graphPush,
    "GET /app/edits/pending": editsPending,
  };
  if (operatorRoutes[key]) {
    const userId = operatorUser(request, env);
    if (!userId) return json({ ok: false, error: "not authorised" }, 401, origin);
    return operatorRoutes[key](request, env, origin, userId);
  }

  // Session routes — a logged-in person in the browser.
  const sessionRoutes = {
    "GET /app/state": state,
    "POST /app/capture": capture,
    "POST /app/done": markDone,
    "GET /app/graph": graphGet,
    "POST /app/edit": editPost,
    "POST /app/edit-file": editFile,
  };
  const fn = sessionRoutes[key];
  if (!fn) return null;

  const session = await getSession(env, request);
  if (!session) return json({ ok: false, error: "not authenticated" }, 401, origin);
  // `ctx` IS PASSED TO EVERY SESSION ROUTE AND READ BY ONE. Handing it to all six rather than
  // special-casing `editFile` keeps the call shape single — the same reason there is one
  // `sessionRoutes` table rather than a branch per path — and the five that ignore it are unchanged
  // by an extra argument. It is `undefined` whenever the caller did not supply one.
  return fn(request, env, origin, session, ctx);
}

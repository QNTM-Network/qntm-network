// The qntm app skeleton — capture, and surface THE ONE THING.
// Every route requires a valid bearer session. "The one thing" is DERIVED (not stored):
// v1 = the oldest still-open capture — the thing you've known needed doing the longest.
// (prioritization-is-derived — sharpen the heuristic later without a data migration.)

import { json, getSession, uuid, isoIn, bearer } from "./util.js";

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

async function pendingCount(env, userId) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM graph_edits WHERE user_id = ? AND status = 'pending'"
  )
    .bind(userId)
    .first();
  return row?.n || 0;
}

// GET /app/graph (session) — serve the projection. The hosted model (Fly) is the source of
// truth; the D1 snapshot is a fallback for when the server is unreachable.
async function graphGet(request, env, origin, session) {
  // Prefer the hosted model. A failure here (cold start timeout, outage) falls through to D1.
  if (env.GRAPH_SERVER_URL && env.SERVER_TOKEN) {
    try {
      const r = await fetch(`${env.GRAPH_SERVER_URL}/graph`, {
        headers: { Authorization: `Bearer ${env.SERVER_TOKEN}` },
      });
      if (r.ok) {
        const e = await r.json();
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
            },
            pending_edits: await pendingCount(env, session.user_id),
          },
          200,
          origin
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

// POST /app/edit-file (session) — the web write path. The browser sends {path, markdown} for one
// view; we write it on the hosted model, run a cycle, and return the fresh projection. The operator
// token stays server-side; the browser only ever holds its passkey session.
async function editFile(request, env, origin, session) {
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

  const auth = { Authorization: `Bearer ${env.SERVER_TOKEN}` };
  // 1. overwrite the single view on the hosted model
  const w = await fetch(`${env.GRAPH_SERVER_URL}/vault/file`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ path, markdown: body.markdown }),
  });
  if (!w.ok) return json({ ok: false, error: "write failed" }, 502, origin);
  // 2. cycle (ingest the edit + re-project) — this is the ~14s step
  const c = await fetch(`${env.GRAPH_SERVER_URL}/cycle`, { method: "POST", headers: auth });
  const cd = await c.json().catch(() => ({}));
  if (!c.ok || !cd.ok) return json({ ok: false, error: "cycle failed" }, 502, origin);
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
      },
      pending_edits: await pendingCount(env, session.user_id),
    },
    200,
    origin
  );
}

// Operator (headless laptop) auth: GRAPH_PUSH_KEY sent as Bearer -> the single operator user_id.
function operatorUser(request, env) {
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
export async function handleApp(request, env, url, origin) {
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
  return fn(request, env, origin, session);
}

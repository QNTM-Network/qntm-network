/**
 * The tenancy boundary on the hosted model — `worker/src/app.js`.
 *
 *   node --test tests/app-graph-tenancy.test.mjs
 *
 * WHAT THIS PINS, AND WHY IT IS A PAIR AND NOT AN ASSERTION.
 *
 * `qntm-graph.fly.dev` holds ONE state.db, ONE vault and ONE config, and they are the operator's.
 * `server/app.py` (sibling engine repo) takes no user on any route. The Worker holds SERVER_TOKEN
 * and is the box's only caller. So the server bearer proves "the Worker is calling" and the
 * session bearer proves "this is who" — and until this gate, nothing joined the two. Any session
 * reached the operator's graph, and registration is open to anyone who picks an unused handle.
 *
 * Every test below is therefore TWO tests: the operator's session must still get through, and a
 * second person's must not. One arm alone proves nothing — a gate that refuses everybody passes
 * "B is refused" and is still broken, and a gate that admits everybody passes "A succeeds".
 *
 * The intruder here is a REAL second account: a distinct users.id with a valid, unexpired session
 * row, exactly what `POST /auth/register/verify` mints today. Nothing is faked about their claim
 * to be logged in — only about whose graph it is.
 *
 * `fetch` is stubbed and RECORDS every call, because the strongest assertion is not "B got a 403".
 * It is that the Fly machine was NEVER CALLED for B — the operator's bytes were not fetched, not
 * buffered, not filtered out at the last moment. The breach fails before it reaches the network.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { handleApp } from "../worker/src/app.js";

// ── the two accounts ──────────────────────────────────────────────────────────────────────────
// OPERATOR_ID is the real shape and the real provenance: `wrangler d1 execute qntm-signups
// --remote` shows exactly one row in `users` today (handle "qntm", created 2026-07-16), and every
// `graph_snapshots` row carries that same id — which is what proves GRAPH_USER_ID holds it, since
// `operatorUser()` is the only thing that writes that column.
const OPERATOR_ID = "a19e4c66-af5d-4114-a928-d2c63b503374";
const INTRUDER_ID = "00000000-1111-2222-3333-444444444444";

const OPERATOR_TOKEN = "session-token-operator";
const INTRUDER_TOKEN = "session-token-intruder";

const SESSIONS = {
  [OPERATOR_TOKEN]: { user_id: OPERATOR_ID, handle: "qntm" },
  [INTRUDER_TOKEN]: { user_id: INTRUDER_ID, handle: "mallory" },
};

// What the operator's hosted model would hand back. If a single one of these strings reaches the
// intruder, the test has caught a real leak of real content.
const HOSTED_ENVELOPE = {
  generated_at: "2026-07-30T12:27:25.530046+00:00",
  views: [{ id: "this-week", path: "this_week.md", title: "This Week", markdown: "- [ ] SECRET" }],
  graph: { nodes: [{ id: "n1", title: "SECRET NODE" }], edges: [] },
  locations: {},
};

// ── a D1 stub that answers only the queries these routes actually make ────────────────────────
// Deliberately NOT a SQL engine. It matches on a distinctive fragment of each statement, so a
// query that changes shape stops being answered rather than being silently mis-answered.
function makeDb() {
  const stmt = (sql, params = []) => ({
    bind: (...args) => stmt(sql, args),
    first: async () => {
      if (sql.includes("FROM sessions s JOIN users u")) return SESSIONS[params[0]] || null;
      if (sql.includes("COUNT(*) AS n FROM graph_edits")) return { n: 0 };
      // The per-user D1 snapshot. Neither account has ever been pushed one, so: none.
      if (sql.includes("FROM graph_snapshots")) return null;
      throw new Error(`unstubbed first(): ${sql}`);
    },
    all: async () => {
      if (sql.includes("FROM graph_snapshot_views")) return { results: [] };
      // `captures` is genuinely per-user in D1 already, so the stub honours the bound user_id the
      // way D1 would. The operator has a row; the intruder does not. That makes the leak check
      // below load-bearing: it passes only because `loadState` binds the SESSION's user_id.
      if (sql.includes("FROM captures")) {
        return params[0] === OPERATOR_ID
          ? { results: [{ id: "c1", text: "SECRET capture", created_at: "2026-07-30" }] }
          : { results: [] };
      }
      throw new Error(`unstubbed all(): ${sql}`);
    },
    run: async () => ({ success: true }),
  });
  return { prepare: (sql) => stmt(sql), batch: async () => [] };
}

const BASE_ENV = {
  GRAPH_SERVER_URL: "https://qntm-graph.fly.dev",
  SERVER_TOKEN: "server-token",
  GRAPH_USER_ID: OPERATOR_ID,
};

function makeEnv(overrides = {}) {
  return { DB: makeDb(), ...BASE_ENV, ...overrides };
}

// ── fetch stub: stands in for the Fly box, and records every call ──────────────────────────────
let calls = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    const path = new URL(String(url)).pathname;
    if (path === "/graph") return jsonResponse(HOSTED_ENVELOPE);
    if (path === "/vault/file") return jsonResponse({ ok: true, path: "this_week.md" });
    if (path === "/cycle") return jsonResponse({ ok: true, snapshot: HOSTED_ENVELOPE });
    throw new Error(`unstubbed fetch: ${url}`);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── driving handleApp ─────────────────────────────────────────────────────────────────────────
async function call(env, method, path, { token, body, headers = {} } = {}) {
  const url = new URL(`https://api.example${path}`);
  const request = new Request(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const res = await handleApp(request, env, url, "https://qntm.network");
  assert.ok(res, `handleApp did not route ${method} ${path}`);
  return { status: res.status, body: await res.json() };
}

const flyCalls = () => calls.filter((c) => c.url.includes("qntm-graph.fly.dev"));

// Does this response carry any byte of the operator's model? The blunt instrument on purpose —
// it does not care HOW a leak arrived, only that nothing secret is in the payload.
function leaksOperatorContent(body) {
  return JSON.stringify(body).includes("SECRET");
}

// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("GET /app/graph — the operator's hosted model is the operator's", () => {
  test("AUTHORISED: the operator's session gets the hosted model", async () => {
    const { status, body } = await call(makeEnv(), "GET", "/app/graph", {
      token: OPERATOR_TOKEN,
    });

    assert.equal(status, 200);
    assert.equal(body.source, "server", "the operator must still reach the hosted model");
    assert.equal(body.snapshot.views[0].markdown, "- [ ] SECRET");
    assert.deepEqual(
      flyCalls().map((c) => `${c.method} ${new URL(c.url).pathname}`),
      ["GET /graph"],
      "and it must reach it by actually calling the box"
    );
  });

  test("REFUSED: a second account gets its own (empty) graph, and Fly is never called", async () => {
    const { status, body } = await call(makeEnv(), "GET", "/app/graph", {
      token: INTRUDER_TOKEN,
    });

    assert.equal(status, 200);
    assert.notEqual(body.source, "server");
    assert.equal(body.snapshot, null, "a new account has no graph — that is the honest answer");
    assert.equal(body.handle, "mallory", "and it is still THEIR session, not a rejection");
    assert.ok(!leaksOperatorContent(body), "no byte of the operator's model may appear");
    assert.deepEqual(flyCalls(), [], "the operator's bytes must never even be fetched");
  });
});

describe("POST /app/edit-file — writing into the operator's live vault", () => {
  const EDIT = { path: "this_week.md", markdown: "- [x] SECRET" };

  test("AUTHORISED: the operator's session writes and cycles", async () => {
    const { status, body } = await call(makeEnv(), "POST", "/app/edit-file", {
      token: OPERATOR_TOKEN,
      body: EDIT,
    });

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(
      flyCalls().map((c) => `${c.method} ${new URL(c.url).pathname}`),
      ["POST /vault/file", "POST /cycle"],
      "the write path is a write then a cycle, both on the box"
    );
  });

  test("REFUSED: a second account cannot write one byte into the operator's vault", async () => {
    const { status, body } = await call(makeEnv(), "POST", "/app/edit-file", {
      token: INTRUDER_TOKEN,
      body: EDIT,
    });

    assert.equal(status, 403, "authenticated, and not entitled — 403, not 401");
    assert.equal(body.ok, false);
    assert.deepEqual(flyCalls(), [], "nothing may reach the vault, not even a rejected write");
  });
});

describe("the boundary is taken from the session, never from the request", () => {
  // The id-guessing arm. The intruder KNOWS the operator's user id — it is a uuid in a snapshot
  // row, not a secret — and tries every way of asserting it that the wire allows.
  const IMPERSONATIONS = [
    ["a user_id in the body", { body: { user_id: OPERATOR_ID, path: "x.md", markdown: "x" } }],
    ["a header the browser controls", { headers: { "X-Qntm-User": OPERATOR_ID } }],
    ["the operator's handle", { body: { handle: "qntm", path: "x.md", markdown: "x" } }],
  ];

  for (const [label, extra] of IMPERSONATIONS) {
    test(`REFUSED: ${label} does not change who you are`, async () => {
      const { status } = await call(makeEnv(), "POST", "/app/edit-file", {
        token: INTRUDER_TOKEN,
        body: { path: "x.md", markdown: "x" },
        ...extra,
      });
      assert.equal(status, 403);
      assert.deepEqual(flyCalls(), []);
    });
  }

  test("REFUSED: omitting the session entirely is not a way past it", async () => {
    const { status, body } = await call(makeEnv(), "GET", "/app/graph", { token: undefined });
    assert.equal(status, 401);
    assert.ok(!leaksOperatorContent(body));
    assert.deepEqual(flyCalls(), []);
  });

  test("REFUSED: an expired or unknown session token is not a way past it", async () => {
    const { status, body } = await call(makeEnv(), "GET", "/app/graph", { token: "made-up" });
    assert.equal(status, 401);
    assert.ok(!leaksOperatorContent(body));
    assert.deepEqual(flyCalls(), []);
  });
});

describe("fail closed — an unconfigured boundary serves nobody, not everybody", () => {
  // The inversion that made this bug possible in `server/app.py#_require_auth` before PR #49:
  // `if (TOKEN && ...)` fell OPEN when TOKEN was unset. `isOperatorSession` must fall the other
  // way. If GRAPH_USER_ID is missing there is no way to establish that any session is the
  // operator's, so the answer is nobody — INCLUDING the operator.
  test("with GRAPH_USER_ID unset, even the operator's session does not reach the model", async () => {
    const env = makeEnv({ GRAPH_USER_ID: undefined });

    const read = await call(env, "GET", "/app/graph", { token: OPERATOR_TOKEN });
    assert.notEqual(read.body.source, "server");
    assert.ok(!leaksOperatorContent(read.body));

    const write = await call(env, "POST", "/app/edit-file", {
      token: OPERATOR_TOKEN,
      body: { path: "this_week.md", markdown: "x" },
    });
    assert.equal(write.status, 403);

    assert.deepEqual(flyCalls(), [], "an unconfigured Worker calls the box for nobody");
  });

  test("with GRAPH_USER_ID set to the empty string, likewise", async () => {
    const env = makeEnv({ GRAPH_USER_ID: "" });
    const { body } = await call(env, "GET", "/app/graph", { token: OPERATOR_TOKEN });
    assert.notEqual(body.source, "server");
    assert.deepEqual(flyCalls(), []);
  });
});

describe("what the gate does NOT claim", () => {
  // Honesty, pinned. Per-user D1 rows were already scoped by user_id before this change; the gate
  // adds nothing there and this test says so, so nobody reads the gate as broader than it is.
  test("the per-user D1 routes were already scoped, and still are", async () => {
    const { status, body } = await call(makeEnv(), "GET", "/app/state", { token: INTRUDER_TOKEN });
    assert.equal(status, 200);
    assert.equal(body.handle, "mallory");
    assert.ok(!leaksOperatorContent(body));
  });
});

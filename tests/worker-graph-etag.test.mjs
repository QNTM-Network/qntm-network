/**
 * `GET /app/graph` FORWARDS THE CONDITIONAL, BOTH DIRECTIONS — efficient-graph-read-path
 * (2026-08-07).
 *
 *   node --test tests/worker-graph-etag.test.mjs
 *
 * THE FAILURE THIS FILE EXISTS TO CATCH. Fly can grow an honest `ETag` on `GET /graph`
 * (`server/tests/test_graph_etag.py`) and this Worker can still ship nothing, if `graphGet`
 * forgets to read the browser's `If-None-Match` off the incoming request, or forgets to send it
 * on to Fly, or forgets to hand Fly's own `ETag` back. Any one of those and the whole feature is
 * "a declaration that does not reach" — the exact phrase the brief uses. So every claim below is
 * checked against the RECORDED Fly call (`flyCalls()`), not only against the Worker's own
 * response — the same posture `tests/app-graph-tenancy.test.mjs` already takes for the tenancy
 * gate, reused here for the conditional.
 *
 * FOUR CLAIMS:
 *   1. THE FORWARD DIRECTION. A browser's `If-None-Match` reaches Fly as Fly's own
 *      `If-None-Match` — same value, verbatim.
 *   2. THE BACK DIRECTION, UNCHANGED CASE. Fly's `304` becomes the Worker's own `304` — no body,
 *      the `ETag` carried back so the browser still has something to re-send.
 *   3. THE BACK DIRECTION, CHANGED CASE. Fly's `200` with a NEW `ETag` becomes a Worker `200`
 *      carrying that same new tag — so the browser's NEXT `If-None-Match` names the current one.
 *   4. FAILS OPEN. A caller with no `If-None-Match` sends none to Fly (today's shape, unchanged);
 *      a Fly response with no `ETag` (an older deployment) leaves the Worker's own response with
 *      none either, rather than inventing one nothing will ever validate against.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { handleApp } from "../worker/src/app.js";

const OPERATOR_ID = "a19e4c66-af5d-4114-a928-d2c63b503374";
const OPERATOR_TOKEN = "session-token-operator";

const SESSIONS = {
  [OPERATOR_TOKEN]: { user_id: OPERATOR_ID, handle: "qntm" },
};

const ENVELOPE = {
  generated_at: "2026-08-07T12:00:00Z",
  views: [{ id: "this-week", path: "this_week.md", title: "This Week", markdown: "- [ ] a task" }],
  graph: { nodes: [], edges: [] },
  locations: {},
  writes: {},
};

const ETAG_1 = '"aaaa1111"';
const ETAG_2 = '"bbbb2222"';

function makeDb() {
  const stmt = (sql, params = []) => ({
    bind: (...args) => stmt(sql, args),
    first: async () => {
      if (sql.includes("FROM sessions s JOIN users u")) return SESSIONS[params[0]] || null;
      if (sql.includes("COUNT(*) AS n FROM graph_edits")) return { n: 0 };
      if (sql.includes("FROM graph_snapshots")) return null;
      throw new Error(`unstubbed first(): ${sql}`);
    },
    all: async () => {
      if (sql.includes("FROM graph_snapshot_views")) return { results: [] };
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

// The Fly stub for this file: configurable per test via `flyAnswer`, and every call is recorded
// with the headers it actually carried — the claims below are about THOSE, not the response.
let calls = [];
let flyAnswer;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  flyAnswer = { status: 200, etag: ETAG_1, body: ENVELOPE };
  globalThis.fetch = async (url, init = {}) => {
    const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});
    calls.push({ url: String(url), method: init.method || "GET", headers });
    const path = new URL(String(url)).pathname;
    if (path === "/graph") {
      if (flyAnswer.status === 304) {
        return new Response(null, { status: 304, headers: { ETag: flyAnswer.etag } });
      }
      const respHeaders = flyAnswer.etag ? { ETag: flyAnswer.etag } : {};
      return new Response(JSON.stringify(flyAnswer.body), {
        status: flyAnswer.status,
        headers: { "Content-Type": "application/json", ...respHeaders },
      });
    }
    throw new Error(`unstubbed fetch: ${url}`);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function call(env, { headers = {} } = {}) {
  const url = new URL("https://api.example/app/graph");
  const request = new Request(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, ...headers },
  });
  const res = await handleApp(request, env, url, "https://qntm.network");
  assert.ok(res, "handleApp did not route GET /app/graph");
  return res;
}

const flyCalls = () => calls.filter((c) => c.url.includes("qntm-graph.fly.dev"));

// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("the forward direction — the browser's If-None-Match reaches Fly", () => {
  test("no If-None-Match from the browser -> none sent to Fly (today's shape, unchanged)", async () => {
    await call(makeEnv());

    assert.equal(flyCalls().length, 1);
    assert.equal(flyCalls()[0].headers.get("If-None-Match"), null);
  });

  test("the browser's If-None-Match is forwarded to Fly VERBATIM", async () => {
    await call(makeEnv(), { headers: { "If-None-Match": ETAG_1 } });

    assert.equal(flyCalls().length, 1);
    assert.equal(flyCalls()[0].headers.get("If-None-Match"), ETAG_1);
  });
});

describe("the back direction, unchanged case — Fly's 304 becomes the Worker's own 304", () => {
  test("no body, and the ETag is carried back so the browser can ask again", async () => {
    flyAnswer = { status: 304, etag: ETAG_1 };

    const res = await call(makeEnv(), { headers: { "If-None-Match": ETAG_1 } });

    assert.equal(res.status, 304);
    const text = await res.text();
    assert.equal(text, "", "a 304 must carry no body");
    assert.equal(res.headers.get("ETag"), ETAG_1);
  });

  test("a 304 still reached Fly by actually asking it — not answered from thin air", async () => {
    flyAnswer = { status: 304, etag: ETAG_1 };

    await call(makeEnv(), { headers: { "If-None-Match": ETAG_1 } });

    assert.deepEqual(
      flyCalls().map((c) => `${c.method} ${new URL(c.url).pathname}`),
      ["GET /graph"]
    );
  });
});

describe("the back direction, changed case — Fly's fresh ETag reaches the browser", () => {
  test("a 200 from Fly with a NEW ETag hands that same tag back", async () => {
    flyAnswer = { status: 200, etag: ETAG_2, body: ENVELOPE };

    const res = await call(makeEnv(), { headers: { "If-None-Match": ETAG_1 } });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("ETag"), ETAG_2, "the browser's NEXT If-None-Match must name this");
    const body = await res.json();
    assert.equal(body.snapshot.generated_at, ENVELOPE.generated_at);
  });
});

describe("fails open — no invented ETag, no invented conditional", () => {
  test("Fly answers 200 with no ETag (an older deployment) -> the Worker sends none either", async () => {
    flyAnswer = { status: 200, etag: null, body: ENVELOPE };

    const res = await call(makeEnv());

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("ETag"), null, "no ETag nothing will ever validate against");
  });

  test("a plain read (no If-None-Match) still gets the full 200 body as before", async () => {
    const res = await call(makeEnv());

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, "server");
    assert.equal(body.snapshot.views[0].markdown, "- [ ] a task");
  });
});

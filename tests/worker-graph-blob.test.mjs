/**
 * `GET /app/graph/blob` FORWARDS THE CONDITIONAL, ON ITS OWN ETAG —
 * graph-envelope-composition-separates-blob-from-view-markdown (2026-08-07).
 *
 *   node --test tests/worker-graph-blob.test.mjs
 *
 * SAME POSTURE AS `tests/worker-graph-etag.test.mjs`, narrowed to the new route: a browser's
 * `If-None-Match` reaches Fly's `GET /graph/blob` verbatim, Fly's `304`/`200` come back
 * unchanged, and — the one claim this file adds that the sibling does not need — THIS ROUTE'S
 * ETag is never confused with `GET /app/graph`'s. `server/app.py`'s own docstring for `GET
 * /graph/blob` states why the two must stay disjoint hashes; this file proves the WORKER half of
 * that (it relays whichever tag Fly minted for whichever route, and invents neither).
 *
 * Every claim is checked against the RECORDED Fly call (`flyCalls()`), not only the Worker's own
 * response — the same reason `worker-graph-etag.test.mjs` does.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { handleApp } from "../worker/src/app.js";

const OPERATOR_ID = "a19e4c66-af5d-4114-a928-d2c63b503374";
const OPERATOR_TOKEN = "session-token-operator";
const OTHER_TOKEN = "session-token-other";
const OTHER_ID = "b29e4c66-af5d-4114-a928-d2c63b503375";

const SESSIONS = {
  [OPERATOR_TOKEN]: { user_id: OPERATOR_ID, handle: "qntm" },
  [OTHER_TOKEN]: { user_id: OTHER_ID, handle: "stranger" },
};

const BLOB_BODY = { graph: { nodes: [{ id: "n1", type: "task", fields: {} }], edges: [] } };
const ETAG_1 = '"blob-aaaa"';
const ETAG_2 = '"blob-bbbb"';

let d1GraphJson = null;

function makeDb() {
  const stmt = (sql, params = []) => ({
    bind: (...args) => stmt(sql, args),
    first: async () => {
      if (sql.includes("FROM sessions s JOIN users u")) return SESSIONS[params[0]] || null;
      if (sql.includes("COUNT(*) AS n FROM graph_edits")) return { n: 0 };
      if (sql.includes("FROM graph_snapshots")) {
        return d1GraphJson ? { graph_json: d1GraphJson } : null;
      }
      throw new Error(`unstubbed first(): ${sql}`);
    },
    all: async () => {
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

let calls = [];
let flyAnswer;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  d1GraphJson = null;
  flyAnswer = { status: 200, etag: ETAG_1, body: BLOB_BODY };
  globalThis.fetch = async (url, init = {}) => {
    const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});
    calls.push({ url: String(url), method: init.method || "GET", headers });
    const path = new URL(String(url)).pathname;
    if (path === "/graph/blob") {
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

async function call(env, { token = OPERATOR_TOKEN, headers = {} } = {}) {
  const url = new URL("https://api.example/app/graph/blob");
  const request = new Request(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, ...headers },
  });
  const res = await handleApp(request, env, url, "https://qntm.network");
  assert.ok(res, "handleApp did not route GET /app/graph/blob");
  return res;
}

const flyCalls = () => calls.filter((c) => c.url.includes("qntm-graph.fly.dev"));

describe("the forward direction — the browser's If-None-Match reaches Fly's /graph/blob", () => {
  test("no If-None-Match -> none sent to Fly", async () => {
    await call(makeEnv());
    assert.equal(flyCalls().length, 1);
    assert.equal(flyCalls()[0].headers.get("If-None-Match"), null);
    assert.equal(new URL(flyCalls()[0].url).pathname, "/graph/blob");
  });

  test("the browser's If-None-Match is forwarded to Fly VERBATIM", async () => {
    await call(makeEnv(), { headers: { "If-None-Match": ETAG_1 } });
    assert.equal(flyCalls()[0].headers.get("If-None-Match"), ETAG_1);
  });
});

describe("the back direction — Fly's answer is relayed unchanged", () => {
  test("a 304 becomes the Worker's own 304, no body, ETag carried back", async () => {
    flyAnswer = { status: 304, etag: ETAG_1 };
    const res = await call(makeEnv(), { headers: { "If-None-Match": ETAG_1 } });
    assert.equal(res.status, 304);
    assert.equal(await res.text(), "");
    assert.equal(res.headers.get("ETag"), ETAG_1);
  });

  test("a 200 with a NEW ETag hands that same tag back, and the graph rides along", async () => {
    flyAnswer = { status: 200, etag: ETAG_2, body: BLOB_BODY };
    const res = await call(makeEnv(), { headers: { "If-None-Match": ETAG_1 } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("ETag"), ETAG_2);
    const body = await res.json();
    assert.deepEqual(body.snapshot.graph, BLOB_BODY.graph);
    assert.equal(body.source, "server");
  });
});

describe("fails open — no invented ETag", () => {
  test("Fly answers 200 with no ETag -> the Worker sends none either", async () => {
    flyAnswer = { status: 200, etag: null, body: BLOB_BODY };
    const res = await call(makeEnv());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("ETag"), null);
  });
});

describe("the D1 fallback — a non-operator session, or one with no Fly config", () => {
  test("no GRAPH_SERVER_URL -> reads the same graph_json column GET /app/graph itself reads", async () => {
    d1GraphJson = JSON.stringify(BLOB_BODY.graph);
    const res = await call(makeEnv({ GRAPH_SERVER_URL: undefined }));
    assert.equal(res.status, 200);
    assert.equal(flyCalls().length, 0, "Fly was called despite there being no server configured");
    const body = await res.json();
    assert.deepEqual(body.snapshot.graph, BLOB_BODY.graph);
  });

  test("a non-operator session with nothing stored yet gets snapshot: null, not a crash", async () => {
    const res = await call(makeEnv(), { token: OTHER_TOKEN });
    assert.equal(res.status, 200);
    assert.equal(flyCalls().length, 0, "a stranger's session reached the operator's Fly box");
    const body = await res.json();
    assert.equal(body.snapshot, null);
  });
});

// =================================================================================================
// THE TWO ROUTES' ETAGS ARE NOT INTERCHANGEABLE, ACROSS THE WORKER TOO — the Worker-side half of
// server/tests/test_graph_blob.py's §5. This Worker relays whichever tag Fly minted for whichever
// route; it must never let a caller holding GET /app/graph's tag get a false 304 from this route
// or vice versa. Since this Worker invents no ETag of its own (proved above — "fails open"), the
// property reduces to "Fly's two routes disagree", which server/tests/test_graph_blob.py already
// proves at the source; this test pins that THIS Worker does not paper over a difference by, say,
// reusing one cached tag for both routes.
// =================================================================================================

describe("this route never invents or reuses a tag GET /app/graph minted", () => {
  test("this route's ETag is read fresh from ITS OWN Fly call, not carried over from another", async () => {
    // Two independent calls, two independent Fly answers — proving nothing here is cached or
    // shared across requests the way a bug conflating the two routes' tags would produce.
    flyAnswer = { status: 200, etag: ETAG_1, body: BLOB_BODY };
    const first = await call(makeEnv());
    assert.equal(first.headers.get("ETag"), ETAG_1);

    flyAnswer = { status: 200, etag: ETAG_2, body: BLOB_BODY };
    const second = await call(makeEnv());
    assert.equal(second.headers.get("ETag"), ETAG_2);
  });
});

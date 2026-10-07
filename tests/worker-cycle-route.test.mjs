/**
 * `POST /app/cycle` — the web app's Cycle button (2026-10-07, operator-directed).
 *
 *   node --test tests/worker-cycle-route.test.mjs
 *
 * CLAIMS:
 *   1. The operator's session reaches Fly's `POST /cycle` exactly once and gets the cycle's own
 *      summary, needs-attention count and write refusals back, relayed rather than recomputed.
 *   2. A `rerun_recommended` answer gets ONE rerun, and the rerun's result is the one returned.
 *   3. A non-operator session is refused (403) and Fly is never called.
 *   4. A failed cycle is reported as a failure (502), never as success.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { handleApp } from "../worker/src/app.js";

const OPERATOR_ID = "a19e4c66-af5d-4114-a928-d2c63b503374";
const OPERATOR_TOKEN = "session-token-operator";
const OTHER_TOKEN = "session-token-other";

const SESSIONS = {
  [OPERATOR_TOKEN]: { user_id: OPERATOR_ID, handle: "qntm" },
  [OTHER_TOKEN]: { user_id: "someone-else", handle: "guest" },
};

function makeDb() {
  const stmt = (sql, params = []) => ({
    bind: (...args) => stmt(sql, args),
    first: async () => {
      if (sql.includes("FROM sessions s JOIN users u")) return SESSIONS[params[0]] || null;
      throw new Error(`unstubbed first(): ${sql}`);
    },
    all: async () => ({ results: [] }),
    run: async () => ({ success: true }),
  });
  return { prepare: (sql) => stmt(sql), batch: async () => [] };
}

const makeEnv = () => ({
  DB: makeDb(),
  GRAPH_SERVER_URL: "https://qntm-graph.fly.dev",
  SERVER_TOKEN: "server-token",
  GRAPH_USER_ID: OPERATOR_ID,
});

let calls = [];
let answers = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    const next = answers.shift();
    if (next === undefined) throw new Error(`unstubbed fetch: ${url}`);
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  answers = [];
});

async function call(token) {
  const url = new URL("https://api.example/app/cycle");
  const request = new Request(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const res = await handleApp(request, makeEnv(), url, "https://qntm.network");
  assert.ok(res, "handleApp did not route POST /app/cycle");
  return { status: res.status, body: await res.json() };
}

describe("POST /app/cycle", () => {
  test("relays the cycle's own summary, attention count and refusals", async () => {
    answers = [{ body: { ok: true, summary_text: "qntm-cycle ✓ 41s", needs_attention: 2, elapsed_seconds: 41, write_refusals: [] } }];
    const { status, body } = await call(OPERATOR_TOKEN);
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, summary_text: "qntm-cycle ✓ 41s", needs_attention: 2, elapsed_seconds: 41, write_refusals: [] });
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).pathname, "/cycle");
    assert.equal(calls[0].method, "POST");
  });

  test("a rerun recommendation gets one rerun, and its result is returned", async () => {
    answers = [
      { body: { ok: true, summary_text: "first", needs_attention: 0, rerun_recommended: true, write_refusals: ["daily.md"] } },
      { body: { ok: true, summary_text: "second", needs_attention: 0, write_refusals: [] } },
    ];
    const { body } = await call(OPERATOR_TOKEN);
    assert.equal(calls.length, 2);
    assert.equal(body.summary_text, "second");
  });

  test("a non-operator session is refused and Fly is never called", async () => {
    const { status } = await call(OTHER_TOKEN);
    assert.equal(status, 403);
    assert.equal(calls.length, 0);
  });

  test("a failed cycle is reported as a failure", async () => {
    answers = [{ status: 500, body: { detail: "cycle failed: boom" } }];
    const { status, body } = await call(OPERATOR_TOKEN);
    assert.equal(status, 502);
    assert.equal(body.ok, false);
  });
});

/**
 * `POST /app/edit-file` with `cycle: false` — a save that does not run the engine (2026-10-08,
 * operator-directed: "All are stored ... until you run [Cycle]").
 *
 * CLAIM: the file is written on Fly (`POST /vault/file`) and NOTHING else is called — no `/cycle`,
 * now or behind the response — and the answer says the save was accepted and the cycle deferred.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { handleApp } from "../worker/src/app.js";

const OPERATOR_ID = "a19e4c66-af5d-4114-a928-d2c63b503374";
const TOKEN = "session-token-operator";

function makeDb() {
  const stmt = (sql, params = []) => ({
    bind: (...args) => stmt(sql, args),
    first: async () => (sql.includes("FROM sessions s JOIN users u") ? (params[0] === TOKEN ? { user_id: OPERATOR_ID, handle: "qntm" } : null) : { n: 0, count: 0 }),
    all: async () => ({ results: [] }),
    run: async () => ({ success: true }),
  });
  return { prepare: (sql) => stmt(sql), batch: async () => [] };
}

test("a cycle: false save writes the file and runs no cycle", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ ok: true, path: "inbox.md" }), { status: 200 });
  };
  const waited = [];
  try {
    const url = new URL("https://api.example/app/edit-file");
    const request = new Request(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path: "inbox.md", markdown: "# Inbox\n- [ ] A\n", ack: true, cycle: false }),
    });
    const env = { DB: makeDb(), GRAPH_SERVER_URL: "https://qntm-graph.fly.dev", SERVER_TOKEN: "t", GRAPH_USER_ID: OPERATOR_ID };
    const res = await handleApp(request, env, url, "https://qntm.network", { waitUntil: (p) => waited.push(p) });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.accepted, true);
    assert.equal(body.deferred, true);
    assert.equal(waited.length, 0, "a cycle was scheduled behind the response");
    assert.ok(calls.some((c) => c.endsWith("/vault/file")), `the file was not written: ${calls}`);
    assert.ok(!calls.some((c) => c.endsWith("/cycle")), `a cycle ran: ${calls}`);
  } finally {
    globalThis.fetch = realFetch;
  }
});

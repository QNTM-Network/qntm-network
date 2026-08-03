/**
 * THE RERUN — closing the gap `write_refusals` / `rerun_recommended` name and nobody read.
 *
 *   node --test tests/app-rerun-on-refusal.test.mjs
 *
 * ── THE BACKGROUND, VERIFIED, NOT ASSUMED ──
 *
 * monorepo PR #62 (`aa4b069`) made the cycle's write-back compare before it writes and REFUSE a
 * view file that changed on disk mid-cycle — the operator's line survives, but the cycle that
 * refused is the one that would have stamped it, so the file sits un-rendered until ANOTHER cycle
 * runs. `server/app.py` (read 2026-08-03, sibling repo, READ ONLY) carries this forward as
 * `POST /cycle`'s response gains two unconditional keys:
 *
 *   `write_refusals`     — a list of the paths the cycle declined to write back (`str(p)` each).
 *   `rerun_recommended`  — `bool(refusals)`; `true` iff that list is non-empty.
 *
 * Both are present on every response from a server carrying `aa4b069`, never omitted-when-false —
 * an EMPTY list and `false` are the "nothing refused" answer, not an absent key. Only a server that
 * PREDATES `aa4b069` omits them, and that is the case this suite's absence arms cover.
 *
 * ── WHAT THIS SUITE PROVES, AND WHERE ──
 *
 *   §1  THE SYNCHRONOUS PATH (`editFile`'s `2. cycle` step, no `ack`). One rerun on
 *       `rerun_recommended: true`; the rerun's own recommendation is never chased (the bound);
 *       the projection returned is the RERUN's, because that is the one with the stamp; a rerun
 *       that fails leaves the FIRST cycle's result standing; absence of the key behaves exactly as
 *       today, one cycle, no more.
 *   §2  THE ASYNC ACK PATH (`ack: true`, fire-and-forget under `ctx.waitUntil`). The same bound and
 *       the same absence-safety, observed through `deferred` — the promise handed to `waitUntil` —
 *       since nothing in the RESPONSE itself carries the rerun on this path.
 *
 * ── WHAT THIS SUITE DOES NOT MEASURE ──
 *
 * NO LIVE SERVER. Every `/cycle` answer is a fixture in this file; `qntm-graph.fly.dev` is never
 * contacted, no cycle runs against any vault, and the ~10-14s a real cycle takes is not something a
 * unit test can observe — it is stated in `cycleOnceMore`'s own comment in `worker/src/app.js`,
 * not proven here. What IS proven is the SHAPE: how many times `/cycle` is called, in what order,
 * and which answer wins.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { handleApp } from "../worker/src/app.js";

const OPERATOR_ID = "a19e4c66-af5d-4114-a928-d2c63b503374";
const OPERATOR_TOKEN = "session-token-operator";
const SESSIONS = { [OPERATOR_TOKEN]: { user_id: OPERATOR_ID, handle: "qntm" } };
const PATH = "work/outcomes.md";
const EDITED = "# This Week\n\n- [x] Draft the launch note [[qntm:121]] #task\n";

function makeDb() {
  const stmt = (sql, params = []) => ({
    bind: (...args) => stmt(sql, args),
    first: async () => {
      if (sql.includes("FROM sessions s JOIN users u")) return SESSIONS[params[0]] || null;
      if (sql.includes("COUNT(*) AS n FROM graph_edits")) return { n: 0 };
      throw new Error(`unstubbed first(): ${sql}`);
    },
    all: async () => {
      throw new Error(`unstubbed all(): ${sql}`);
    },
    run: async () => ({ success: true }),
  });
  return { prepare: (sql) => stmt(sql), batch: async () => [] };
}

const ENV = () => ({
  DB: makeDb(),
  GRAPH_SERVER_URL: "https://qntm-graph.fly.dev",
  SERVER_TOKEN: "server-token",
  GRAPH_USER_ID: OPERATOR_ID,
});

const jsonResponse = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/** views distinguish which cycle's answer a test is looking at — the STAMP differs between them. */
const envelope = (label, extra = {}) => ({
  ok: true,
  snapshot: {
    generated_at: `2026-08-03T09:00:0${label}Z`,
    views: [{ id: "this-week", path: PATH, title: "This Week", markdown: `${label}-markdown` }],
    graph: {},
    locations: {},
  },
  ...extra,
});

const FIRST_REFUSED = envelope("0", { write_refusals: [PATH], rerun_recommended: true });
const RERUN_CLEAN = envelope("1", { write_refusals: [], rerun_recommended: false });
const ORDINARY = envelope("2"); // no keys at all — the pre-aa4b069 shape
const REFUSED_AGAIN = envelope("3", { write_refusals: [PATH], rerun_recommended: true });

describe("§1 THE SYNCHRONOUS PATH — POST /app/edit-file with no ack", () => {
  /** Every call the Worker made, in order. */
  let calls;
  /** A queue of answers `/cycle` gives, consumed one per call; the last is repeated if exhausted. */
  let cycleAnswers;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    calls = [];
    cycleAnswers = [];
    globalThis.fetch = async (url, init = {}) => {
      const route = new URL(String(url)).pathname;
      calls.push({ route, method: init.method || "GET" });
      if (route === "/vault/file") return jsonResponse({ ok: true, path: PATH });
      if (route === "/cycle") {
        const next = cycleAnswers.length > 1 ? cycleAnswers.shift() : cycleAnswers[0];
        return jsonResponse(next);
      }
      throw new Error(`unstubbed fetch: ${url}`);
    };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  async function editFile(body) {
    const url = new URL("https://api.example/app/edit-file");
    const request = new Request(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await handleApp(request, ENV(), url, "https://qntm.network");
    return { status: res.status, body: await res.json() };
  }

  const routes = () => calls.map((c) => `${c.method} ${c.route}`);

  test("A REFUSAL RUNS EXACTLY ONE MORE CYCLE, and its projection is what comes back", async () => {
    cycleAnswers = [FIRST_REFUSED, RERUN_CLEAN];

    const { status, body } = await editFile({ path: PATH, markdown: EDITED });

    assert.equal(status, 200);
    assert.deepEqual(routes(), ["POST /vault/file", "POST /cycle", "POST /cycle"], "not one cycle, not three");
    assert.equal(
      body.snapshot.generated_at,
      RERUN_CLEAN.snapshot.generated_at,
      "the caller got the FIRST cycle's un-stamped answer, not the rerun's",
    );
  });

  test("THE BOUND — a rerun that ITSELF recommends a rerun is never chased", async () => {
    // The second /cycle answers REFUSED_AGAIN, recommending a THIRD call. Nothing may follow it.
    cycleAnswers = [FIRST_REFUSED, REFUSED_AGAIN];

    const { status, body } = await editFile({ path: PATH, markdown: EDITED });

    assert.equal(status, 200);
    assert.deepEqual(
      routes(),
      ["POST /vault/file", "POST /cycle", "POST /cycle"],
      "a second recommendation produced a third fetch — the bound is not one call, it is a loop",
    );
    assert.equal(body.snapshot.generated_at, REFUSED_AGAIN.snapshot.generated_at, "the rerun's own answer is still used");
  });

  test("ABSENCE IS SAFE — a server that never learned these keys gets exactly today's single cycle", async () => {
    cycleAnswers = [ORDINARY];

    const { status, body } = await editFile({ path: PATH, markdown: EDITED });

    assert.equal(status, 200);
    assert.deepEqual(routes(), ["POST /vault/file", "POST /cycle"], "an absent key ran a rerun anyway");
    assert.equal(body.snapshot.generated_at, ORDINARY.snapshot.generated_at);
  });

  test("`rerun_recommended: false` (an ordinary cycle, keys present) is one call, same as absence", async () => {
    cycleAnswers = [RERUN_CLEAN];

    await editFile({ path: PATH, markdown: EDITED });

    assert.deepEqual(routes(), ["POST /vault/file", "POST /cycle"]);
  });

  test("FAIL OPEN — a rerun the box cannot answer keeps the FIRST cycle's result", async () => {
    cycleAnswers = [FIRST_REFUSED];
    let cycleCalls = 0;
    globalThis.fetch = async (url, init = {}) => {
      const route = new URL(String(url)).pathname;
      calls.push({ route, method: init.method || "GET" });
      if (route === "/vault/file") return jsonResponse({ ok: true, path: PATH });
      if (route === "/cycle") {
        cycleCalls += 1;
        if (cycleCalls === 1) return jsonResponse(FIRST_REFUSED);
        throw new Error("network down for the rerun");
      }
      throw new Error(`unstubbed fetch: ${url}`);
    };

    const { status, body } = await editFile({ path: PATH, markdown: EDITED });

    assert.equal(status, 200, "a failed rerun must not fail a request whose first cycle succeeded");
    assert.equal(
      body.snapshot.generated_at,
      FIRST_REFUSED.snapshot.generated_at,
      "the caller must see the FIRST cycle's own answer when the rerun cannot complete",
    );
    assert.deepEqual(routes(), ["POST /vault/file", "POST /cycle", "POST /cycle"], "the rerun was still attempted");
  });

  test("FAIL OPEN — a rerun that answers but not `ok: true` is treated the same as a rerun that never lands", async () => {
    cycleAnswers = [FIRST_REFUSED];
    let cycleCalls = 0;
    globalThis.fetch = async (url, init = {}) => {
      const route = new URL(String(url)).pathname;
      calls.push({ route, method: init.method || "GET" });
      if (route === "/vault/file") return jsonResponse({ ok: true, path: PATH });
      if (route === "/cycle") {
        cycleCalls += 1;
        if (cycleCalls === 1) return jsonResponse(FIRST_REFUSED);
        return jsonResponse({ ok: false, error: "cycle failed" }, 500);
      }
      throw new Error(`unstubbed fetch: ${url}`);
    };

    const { status, body } = await editFile({ path: PATH, markdown: EDITED });

    assert.equal(status, 200);
    assert.equal(body.snapshot.generated_at, FIRST_REFUSED.snapshot.generated_at);
  });
});

describe("§2 THE ASYNC ACK PATH — POST /app/edit-file with ack: true, observed through ctx.waitUntil", () => {
  let calls;
  let cycleAnswers;
  let deferred;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    calls = [];
    cycleAnswers = [];
    deferred = [];
    globalThis.fetch = async (url, init = {}) => {
      const route = new URL(String(url)).pathname;
      calls.push({ route, method: init.method || "GET" });
      if (route === "/vault/file") return jsonResponse({ ok: true, path: PATH });
      if (route === "/cycle") {
        const next = cycleAnswers.length > 1 ? cycleAnswers.shift() : cycleAnswers[0];
        return jsonResponse(next);
      }
      throw new Error(`unstubbed fetch: ${url}`);
    };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  async function editFile(body) {
    const url = new URL("https://api.example/app/edit-file");
    const request = new Request(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const ctx = { waitUntil: (promise) => deferred.push(promise) };
    const res = await handleApp(request, ENV(), url, "https://qntm.network", ctx);
    return { status: res.status, body: await res.json() };
  }

  const routes = () => calls.map((c) => `${c.method} ${c.route}`);

  test("A REFUSAL RUNS ONE MORE CYCLE BEHIND THE RESPONSE — still one waitUntil registration", async () => {
    cycleAnswers = [FIRST_REFUSED, RERUN_CLEAN];

    const { status, body } = await editFile({ path: PATH, markdown: EDITED, ack: true });

    assert.equal(status, 200, "the ack answers on the vault write, before either cycle runs");
    assert.equal(body.accepted, true);
    assert.equal("snapshot" in body, false, "the ack still carries no projection of its own");
    assert.equal(deferred.length, 1, "the rerun must not register a second waitUntil");

    await Promise.all(deferred);
    assert.deepEqual(routes(), ["POST /vault/file", "POST /cycle", "POST /cycle"], "the rerun did not run behind the ack");
  });

  test("THE BOUND HOLDS HERE TOO — a rerun that recommends again is not chased", async () => {
    cycleAnswers = [FIRST_REFUSED, REFUSED_AGAIN];

    await editFile({ path: PATH, markdown: EDITED, ack: true });
    await Promise.all(deferred);

    assert.deepEqual(routes(), ["POST /vault/file", "POST /cycle", "POST /cycle"]);
  });

  test("ABSENCE IS SAFE HERE TOO — one cycle, fire-and-forget, exactly as before this change", async () => {
    cycleAnswers = [ORDINARY];

    await editFile({ path: PATH, markdown: EDITED, ack: true });
    await Promise.all(deferred);

    assert.deepEqual(routes(), ["POST /vault/file", "POST /cycle"]);
  });

  test("THE DEFERRED PROMISE STILL RESOLVES TRUTHY — the existing ack contract is unbroken", async () => {
    // app-async-ack.test.mjs asserts `answered.ok === true` on the ORDINARY case; this is the same
    // property, restated here because this suite owns the rerun's effect on what the promise
    // resolves to.
    cycleAnswers = [ORDINARY];

    await editFile({ path: PATH, markdown: EDITED, ack: true });
    const answered = await deferred[0];

    assert.equal(answered.ok, true, "the deferred promise stopped resolving to the cycle's own answer");
  });
});

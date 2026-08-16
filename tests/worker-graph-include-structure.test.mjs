/**
 * `GET /app/graph?include_structure=true` REACHES FLY, AND ONLY WHEN ASKED —
 * section-trees-have-a-persisted-home (2026-08-16), the browser-side half.
 *
 *   node --test tests/worker-graph-include-structure.test.mjs
 *
 * THE FAILURE THIS FILE EXISTS TO CATCH. `server/app.py`'s `GET /graph?include_structure=true`
 * (PR #122) can be live and correct, and this Worker can still never reach it, if `graphGet`
 * forgets to read the browser's own query param off the incoming request or forgets to append it
 * to the Fly URL — the exact "capability shipped, no path reaches it" failure PR #122's own
 * description names for the prior state of this feature. Checked against the RECORDED Fly call
 * (`flyCalls()`), the same posture `worker-graph-etag.test.mjs` takes for the conditional.
 *
 * THREE CLAIMS:
 *   1. NOT ASKED, NOT SENT. A plain `GET /app/graph` (no query param) reaches Fly as a bare
 *      `/graph` — byte-identical to today, no `include_structure` in the URL at all.
 *   2. ASKED, SENT VERBATIM. `?include_structure=true` on the incoming request reaches Fly as
 *      `?include_structure=true` on its own request.
 *   3. RELAYED, NOT RECOMPUTED. A view's `sections` key, present in Fly's own response body,
 *      reaches the browser unchanged — the Worker adds no logic of its own to produce it.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { handleApp } from "../worker/src/app.js";

const OPERATOR_ID = "a19e4c66-af5d-4114-a928-d2c63b503374";
const OPERATOR_TOKEN = "session-token-operator";

const SESSIONS = {
  [OPERATOR_TOKEN]: { user_id: OPERATOR_ID, handle: "qntm" },
};

const ENVELOPE_WITH_SECTIONS = {
  generated_at: "2026-08-16T12:00:00Z",
  views: [
    {
      id: "this-week",
      path: "this_week.md",
      title: "This Week",
      markdown: "- [ ] a task",
      sections: { to_do: { section_id: "to_do", roots: [{ node_id: "n1", node_type: "task", is_qualifying: true, children: [] }] } },
    },
  ],
  writes: {},
};

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

let calls = [];
let flyBody;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  flyBody = ENVELOPE_WITH_SECTIONS;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    const path = new URL(String(url)).pathname;
    if (path === "/graph") {
      return new Response(JSON.stringify(flyBody), {
        status: 200,
        headers: { "Content-Type": "application/json", ETag: '"etag1"' },
      });
    }
    throw new Error(`unstubbed fetch: ${url}`);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function call(env, { query = "" } = {}) {
  const url = new URL(`https://api.example/app/graph${query}`);
  const request = new Request(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${OPERATOR_TOKEN}` },
  });
  const res = await handleApp(request, env, url, "https://qntm.network");
  assert.ok(res, "handleApp did not route GET /app/graph");
  return res;
}

const flyCalls = () => calls.filter((c) => c.url.includes("qntm-graph.fly.dev"));

// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("not asked, not sent", () => {
  test("a plain GET /app/graph reaches Fly as a bare /graph — no include_structure in the URL", async () => {
    await call(makeEnv());

    assert.equal(flyCalls().length, 1);
    const flyUrl = new URL(flyCalls()[0].url);
    assert.equal(flyUrl.searchParams.get("include_structure"), null);
    assert.equal(flyUrl.pathname + flyUrl.search, "/graph");
  });
});

describe("asked, sent verbatim", () => {
  test("?include_structure=true on the incoming request reaches Fly the same way", async () => {
    await call(makeEnv(), { query: "?include_structure=true" });

    assert.equal(flyCalls().length, 1);
    const flyUrl = new URL(flyCalls()[0].url);
    assert.equal(flyUrl.searchParams.get("include_structure"), "true");
  });

  test("any other value is treated as not asking — fails closed, not open", async () => {
    await call(makeEnv(), { query: "?include_structure=1" });

    assert.equal(flyCalls().length, 1);
    const flyUrl = new URL(flyCalls()[0].url);
    assert.equal(flyUrl.searchParams.get("include_structure"), null);
  });
});

describe("relayed, not recomputed", () => {
  test("a view's sections key from Fly reaches the browser unchanged", async () => {
    const res = await call(makeEnv(), { query: "?include_structure=true" });

    const body = await res.json();
    assert.deepEqual(body.snapshot.views[0].sections, ENVELOPE_WITH_SECTIONS.views[0].sections);
  });

  test("no sections key from Fly means none in the browser's view either", async () => {
    flyBody = { ...ENVELOPE_WITH_SECTIONS, views: [{ ...ENVELOPE_WITH_SECTIONS.views[0], sections: undefined }] };

    const res = await call(makeEnv());

    const body = await res.json();
    assert.equal("sections" in body.snapshot.views[0], false);
  });
});

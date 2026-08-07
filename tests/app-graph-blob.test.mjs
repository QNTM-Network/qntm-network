/**
 * `graphBlob` — the graph cached SEPARATELY from `graphData`, and fetched in the background
 * (graph-envelope-composition-separates-blob-from-view-markdown, 2026-08-07).
 *
 *   node --test tests/app-graph-blob.test.mjs
 *
 * ── WHAT CHANGED, IN ONE SENTENCE ──
 *
 * `GET /app/graph`'s default response no longer carries `graph` — the ~741 KB node/edge blob that
 * used to ride on every page load and every post-write pickup read now lives behind its own route,
 * `GET /app/graph/blob`, fetched and cached by the page itself (`refreshGraphBlob`,
 * `app/index.html`) rather than by the envelope reader.
 *
 * ── WHAT THIS FILE PROVES, APPLICATION-LEVEL (through the real lifted page, not a hand-built
 *    context — see `tests/fixtures/app-html-page.mjs`'s own header for why that distinction is
 *    the whole point of this fixture) ──
 *
 *   §1  A COMMIT MADE BEFORE THE BLOB HAS ARRIVED SEES `ctx.graph === null` — the pre-existing,
 *       honest "graph-not-loaded" shape (`resolvers/promotion.ts`/`resolvers/ordering.ts`), not a
 *       crash and not a stale value.
 *   §2  `refreshGraphBlob` FETCHES, CACHES, AND FEEDS THE RESOLVER CONTEXT. After it resolves,
 *       `resolverContextFor`'s own `ctx.graph` is the fetched blob's `{nodes, edges}` — the same
 *       object `promotion.ts`/`ordering.ts` read, reached through the real page function, not a
 *       reimplementation of it.
 *   §3  THE FETCH IS CONDITIONAL. A second call sends the first call's ETag back as
 *       `If-None-Match`; a 304 leaves the cache exactly as it was.
 *   §4  `graphData.snapshot.graph` — THE D1-FALLBACK SHAPE — STILL WINS when present, so a
 *       non-operator session (or a Fly-unreachable read) that still carries the graph inline is
 *       unaffected by this cache existing at all.
 *   §5  LOGOUT DROPS THE CACHE, so a second sign-in on the same tab cannot resolve a
 *       promotion/ordering commit against a stranger's graph before the first background refresh
 *       overwrites it.
 *
 * ── WHAT THIS FILE DOES NOT VERIFY ──
 *
 * No live browser, no real Fly server, no real Worker. `tests/worker-graph-blob.test.mjs` proves
 * the Worker's own forwarding contract (If-None-Match forwarded, Fly's 304/ETag relayed, the two
 * routes' ETags kept disjoint); `server/tests/test_graph_blob.py` proves the Fly route itself.
 * This file's job is the ONE seam none of those cover: what the PAGE does with what either of
 * them sends back.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { importPage, installBrowser, makeWorkDir, withDeclaration } from "./fixtures/app-html-page.mjs";

const BLOB = { nodes: [{ id: "n1", type: "task", fields: { qntm_id: 1 } }], edges: [] };
const ETAG_1 = '"blob-etag-1"';
const ETAG_2 = '"blob-etag-2"';

/** Stand up the page with a controllable `/app/graph/blob` stub, calls recorded in order. */
async function standUpPage(label) {
  installBrowser();
  const calls = [];
  let blobAnswer = () => ({
    status: 200,
    etag: ETAG_1,
    body: { ok: true, source: "server", snapshot: { graph: BLOB } },
  });
  globalThis.fetch = withDeclaration(async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    const headers = init.headers || {};
    calls.push({ path, ifNoneMatch: headers["If-None-Match"] ?? null });
    if (path === "/app/graph/blob") {
      const a = blobAnswer();
      if (a.status === 304) {
        return { ok: false, status: 304, headers: { get: (h) => (h === "ETag" ? a.etag : null) } };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: (h) => (h === "ETag" ? a.etag : null) },
        json: async () => a.body,
      };
    }
    if (path === "/app/graph") {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          ok: true,
          handle: "luke",
          pending_edits: 0,
          snapshot: { generated_at: "2026-08-07T12:00:00Z", views: [{ id: "v", path: "v.md", title: "V", domain: "work", markdown: "# v" }] },
        }),
      };
    }
    throw new Error(`unstubbed fetch: ${url}`);
  });
  const page = await importPage(makeWorkDir(label));
  page.__setToken("session-token");
  return {
    page,
    calls,
    setBlobAnswer: (fn) => { blobAnswer = fn; },
  };
}

const settle = () => new Promise((r) => setImmediate(r));
const graphOfCommit = (page) => page.__resolverContextFor({ id: "v" }, { kind: "set-line", lineIndex: 0, markdown: "- [ ] x", source: "- [ ] x" }).graph;

describe("§1 before the blob has arrived — the pre-existing honest abstain shape", () => {
  test("a commit built before any fetch sees ctx.graph === null, not a crash", async () => {
    const { page } = await standUpPage("graph-blob-before");
    assert.equal(page.__graphBlob(), null, "the cache is not pre-seeded");
    assert.equal(graphOfCommit(page), null);
  });
});

describe("§2 refreshGraphBlob fetches, caches, and feeds the resolver context", () => {
  test("after refreshGraphBlob resolves, ctx.graph is the fetched blob", async () => {
    const { page, calls } = await standUpPage("graph-blob-fetch");

    await page.__refreshGraphBlob();
    await settle();

    assert.deepEqual(
      calls.map((c) => c.path),
      ["/app/graph/blob"],
    );
    assert.deepEqual(page.__graphBlob(), { graph: BLOB });
    assert.deepEqual(graphOfCommit(page), BLOB);
  });

  test("no token, no fetch — the same fail-open posture every other read on this page takes", async () => {
    const { page, calls } = await standUpPage("graph-blob-no-token");
    page.__setToken(null);

    await page.__refreshGraphBlob();

    assert.equal(calls.length, 0, "a fetch was made with no session to authorise it");
    assert.equal(page.__graphBlob(), null);
  });
});

describe("§3 the fetch is conditional — a second call revalidates, a 304 changes nothing", () => {
  test("the second call sends the first call's ETag as If-None-Match", async () => {
    const { page, calls } = await standUpPage("graph-blob-conditional");

    await page.__refreshGraphBlob();
    await page.__refreshGraphBlob();

    assert.equal(calls.length, 2);
    assert.equal(calls[0].ifNoneMatch, null, "the first fetch has nothing to revalidate yet");
    assert.equal(calls[1].ifNoneMatch, ETAG_1, "the second fetch did not send back what the first received");
  });

  test("a 304 leaves the cache exactly as it was", async () => {
    const { page, setBlobAnswer } = await standUpPage("graph-blob-304");

    await page.__refreshGraphBlob();
    const before = page.__graphBlob();
    const beforeEtag = page.__graphBlobEtag();

    setBlobAnswer(() => ({ status: 304, etag: ETAG_1 }));
    await page.__refreshGraphBlob();

    assert.deepEqual(page.__graphBlob(), before);
    assert.equal(page.__graphBlobEtag(), beforeEtag);
  });

  test("a real 200 with a NEW ETag replaces the cache and the tag both", async () => {
    const { page, setBlobAnswer } = await standUpPage("graph-blob-refresh");
    await page.__refreshGraphBlob();

    const grown = { nodes: [...BLOB.nodes, { id: "n2", type: "task", fields: { qntm_id: 2 } }], edges: [] };
    setBlobAnswer(() => ({ status: 200, etag: ETAG_2, body: { ok: true, source: "server", snapshot: { graph: grown } } }));
    await page.__refreshGraphBlob();

    assert.equal(page.__graphBlobEtag(), ETAG_2);
    assert.deepEqual(page.__graphBlob(), { graph: grown });
  });
});

describe("§4 the D1-fallback shape still wins when graphData carries its own graph", () => {
  test("graphData.snapshot.graph, when present, is preferred over the separately-cached blob", async () => {
    const { page } = await standUpPage("graph-blob-d1-wins");
    const d1Graph = { nodes: [{ id: "d1-node", type: "task", fields: {} }], edges: [] };
    page.__setGraphData({ snapshot: { graph: d1Graph, views: [] } });
    page.__setGraphBlob({ graph: BLOB });

    assert.deepEqual(graphOfCommit(page), d1Graph, "the separately-cached blob overrode the D1-inline graph");
  });
});

describe("§5 logout drops the cache", () => {
  test("graphBlob and its ETag are both cleared, so a second sign-in cannot inherit them", async () => {
    const { page } = await standUpPage("graph-blob-logout");
    page.__setGraphBlob({ graph: BLOB });
    page.__setGraphBlobEtag(ETAG_1);

    page.logout();

    assert.equal(page.__graphBlob(), null, "logout left the previous session's graph cached");
    assert.equal(page.__graphBlobEtag(), null, "logout left the previous session's ETag cached");
  });
});

/**
 * THE SECOND LIVE DEFECT THE GENERIC RETRY MECHANISM EXISTS FOR, OBSERVED 2026-08-17: pressing `o`
 * on the true last row of a list opened the new line in the MIDDLE, because `resolvers/ordering.
 * ts`'s `classifierFor` depends on `ctx.graph` too (the same field `resolvers/promotion.ts`'s
 * `structuralNodeCandidateFor` does — `tests/app-promotion-retries-on-graph-refresh.test.mjs`
 * covers THAT resolver's own version of this defect) but does NOT abstain when the graph is
 * stale. It silently falls back to a smaller, incomplete sibling set and answers with THAT, wrong
 * (or missing), placement — never an honest refusal a caller could notice and retry on its own.
 *
 *   node --test tests/app-ordering-retries-on-graph-refresh.test.mjs
 *
 * ── THE ROOT CAUSE, RESTATED AS WHAT THIS FILE DRIVES ──
 *
 * `resolvers/ordering.ts`'s `classifierFor` builds a real `QualifyingClassifier`
 * (`arrange/orderingqualify.ts`'s `qualifyingClassifierFor`) the moment `ctx.graph !== null` — it
 * does NOT wait for the graph to carry every row the placement needs. `evaluateDefaultSection`
 * (`arrange/ordering.ts`) then classifies each candidate sibling one at a time: a STAMPED sibling
 * whose id is not (yet) in the — possibly stale — graph classifies `undefined` ("cannot read") and
 * is silently EXCLUDED from the ranked set, exactly the same "cannot read, so cannot include" rule
 * the marker-based declared path already applies to an unreadable marker. That silent exclusion
 * only escalates to an honest `unclassifiable-siblings` ABSTAIN when EVERY candidate comes back
 * unknown (`OrderingAbstention`'s own header, `arrange/ordering.ts`) — when at least one sibling
 * IS classified, the ranked set is simply smaller than it should be, and the answer this resolver
 * reaches is confidently, silently wrong.
 *
 * ── THE SCENARIO THIS FILE BUILDS ──
 *
 * Two existing, stamped siblings ("Apple", "Zulu") in an UNDECLARED section (the engine's own
 * default title ordering, his real inbox's own shape) — "Apple" is in the graph blob from the
 * start; "Zulu" is not, until a later refresh. A THIRD row ("Mango" — alphabetically between the
 * two) is typed at the very end of the list via a real `o`/type/blur gesture, matching the
 * operator's own report exactly: he is on the true last row when he opens the new line.
 *
 *   WITH THE STALE BLOB (Zulu excluded): "Mango" ranks against "Apple" alone, sorts after it, and
 *   nothing else is ranked — so it looks like it already belongs where it physically landed (the
 *   end of the list). `resolveOrderingPlacementFor`'s own insert gate
 *   (`currentBeforeLineIndex !== beforeLineIndex`, both `null`) reads that as "already correct" and
 *   ARMS NOTHING. This is the bug: "Mango" should sit before "Zulu", and nothing says so.
 *
 *   WITH THE FRESH BLOB (Zulu included): "Mango" ranks between "Apple" and "Zulu" — the ranked set
 *   now shows a real neighbour to sit before, `beforeLineIndex` names Zulu's own line, and the
 *   insert gate reads a genuine mismatch against the physical "end of list" position. The retry
 *   re-arms `settle` with the CORRECT placement.
 *
 * ── WHY THIS PROVES THE GENERALISED MECHANISM, NOT JUST A SECOND COPY OF THE PROMOTION PROOF ──
 *
 * At no point does ordering ABSTAIN in the stale run — `page.commitLine`'s own diagnostics carry
 * nothing for `ordering` to report, and `page.__settle()` arms nothing, which is indistinguishable
 * from "nothing needed to move" unless this file's own knowledge of the fixture says otherwise. A
 * promotion-shaped retry (keyed off an abstain reason) would never have noticed this commit needed
 * a second look at all — `app/present/graph-refresh-retry.ts`'s `GraphRefreshRetrySurface` notices
 * anyway, because it arms UNCONDITIONALLY on every commit and keys retry-worthiness off the graph
 * blob's own ETag, never off any resolver's verdict.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { importPage, installBrowser, makeEvent, makeWorkDir, walk } from "./fixtures/app-html-page.mjs";

const VIEW = { id: "week", path: "week.md" };

const DECLARATION = {
  qualification: {
    defaultNodeType: "task",
    structuralNodeTypes: [],
    tokens: { node_type: { "#task": "task" }, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
    predicates: { "open-tasks": { find: { nodeType: ["task"], fields: {} }, exclude: [] } },
    sections: { week: { capture: { qualification: "open-tasks", nodeType: "task", name: "Capture" } } },
    sectionOrder: { week: ["capture"] },
    refused: {},
    dropped: {},
  },
  resolution: {
    // UNDECLARED — the engine's own default (title) ordering applies, his real inbox's own shape.
    ordering: {},
    orderingFields: {},
    defaultOrdering: [{ field: "title", direction: "asc" }],
    priorityRank: {},
    dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
    chromeShapes: {},
    sectionRegistration: {},
    registration: {},
    lineGrammars: {},
    dropped: {},
  },
  structural: { edgeCardinality: {}, sections: {}, dropped: {} },
  rules: { order: { established: true, sequence: [] }, rules: {}, patterns: {}, fieldMarkers: {}, dropped: {} },
};

// Line 0: heading. Line 1: "Apple" — in the graph blob from the start. Line 2: "Zulu" — stamped,
// but MISSING from the blob until the fresh refresh. "Mango" (typed live, below) sorts between the
// two alphabetically, so a ranked set missing "Zulu" produces a DIFFERENT (wrong) answer than one
// that carries it.
const SOURCE = ["## Capture", "- [ ] Apple [[qntm:1]] #task", "- [ ] Zulu [[qntm:2]] #task"].join("\n");

const GRAPH_WITHOUT_ZULU = { nodes: [{ id: "qntm:1", type: "task", fields: {} }], edges: [] };
const GRAPH_WITH_ZULU = {
  nodes: [
    { id: "qntm:1", type: "task", fields: {} },
    { id: "qntm:2", type: "task", fields: {} },
  ],
  edges: [],
};

const ETAG_STALE = '"blob-without-zulu"';
const ETAG_FRESH = '"blob-with-zulu"';

const settle = () => new Promise((r) => setImmediate(r));

/** The same conditional `/app/graph/blob` stub `tests/app-promotion-retries-on-graph-refresh.
 * test.mjs` uses, restated here rather than imported for the identical reason that file gives. */
function standUpPage(label) {
  const { elements, document: doc } = installBrowser();
  let blobGraph = GRAPH_WITHOUT_ZULU;
  let blobEtag = ETAG_STALE;
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    const headers = init.headers || {};
    if (init.method && init.method !== "GET") {
      const body = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handle: "luke",
          pending_edits: 0,
          snapshot: { generated_at: "2026-08-17T00:00:00Z", views: [{ ...VIEW, markdown: body.markdown }] },
        }),
      };
    }
    if (path === "/app/graph/blob") {
      if (headers["If-None-Match"] === blobEtag) {
        return { ok: false, status: 304, headers: { get: (h) => (h === "ETag" ? blobEtag : null) } };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: (h) => (h === "ETag" ? blobEtag : null) },
        json: async () => ({ ok: true, source: "server", snapshot: { graph: blobGraph } }),
      };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  };
  return {
    elements,
    press: (key) => doc.dispatch("keydown", makeEvent({ key })),
    setBlob(graph, etag) {
      blobGraph = graph;
      blobEtag = etag;
    },
  };
}

/** Every test starts the SAME way: declared, seeded (graph carried ONLY as a separately-fetched
 * blob — `graphData` itself carries no `graph` key, the shape `GET /app/graph` serves by default),
 * painted, cursor reset to line 0. */
async function freshPage(label) {
  const { elements, press, setBlob } = standUpPage(label);
  setBlob(GRAPH_WITHOUT_ZULU, ETAG_STALE);
  const page = await importPage(makeWorkDir(label));
  page.__setToken("session-token");
  page.__applyPresentation(DECLARATION);
  page.__setGraphData({
    snapshot: { generated_at: "2026-08-17T00:00:00Z", views: [{ ...VIEW, title: "This Week", domain: "demo", markdown: SOURCE }] },
  });
  page.paintView(VIEW.id);
  press("g");
  press("g");
  return { page, elements, press, setBlob };
}

/** `o` on the true last row ("Zulu"), type "Mango", blur — the real `o`/type/blur gesture, driven
 * through `draftInput`'s own settle -> `commitLine` -> optimistic repaint, exactly as
 * `tests/app-settle-wiring.test.mjs` §1 already proves the mechanism live. Returns the file this
 * gesture produces, so callers can address it without hand-computing string offsets. */
function typeMangoAtTheEnd(page, elements, press) {
  press("j"); // line 1: Apple
  press("j"); // line 2: Zulu — the true last row
  press("o"); // open a draft below it
  const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
  assert.ok(input, "o did not open a draft line");
  input.value = "- [ ] Mango";
  input.dispatch("blur"); // commits synchronously through the real, retry-arming commitLine wrapper
  return [...SOURCE.split("\n"), "- [ ] Mango"].join("\n");
}

describe("1. THE STALE WINDOW, REPRODUCED — a stale blob drops a sibling silently, and ordering arms nothing", () => {
  test("through the real page: `o`/type/blur posts the capture, and settle stays empty though the row belongs before Zulu", async () => {
    const { page, elements, press } = await freshPage("ordering-retry-stale-window");
    await page.__refreshGraphBlobAndRetryGraphRefresh();
    assert.deepEqual(page.__graphBlob(), { graph: GRAPH_WITHOUT_ZULU });

    const AFTER = typeMangoAtTheEnd(page, elements, press);
    await settle();

    // THE BUG ITSELF, FALSIFIED HERE: "Mango" (between "Apple" and "Zulu" alphabetically) should
    // have been placed before "Zulu" — the ranked set that decided otherwise silently dropped
    // "Zulu" because the stale blob did not carry it. Nothing armed, so the row stays wrongly at
    // the end of the list.
    const instructions = page.__settle().take(AFTER, VIEW.id);
    assert.deepEqual(instructions, [], "ordering must have armed nothing while the stale blob silently excluded Zulu");

    // AND THE RETRY WAS ARMED IN ITS PLACE — every commit is, unconditionally, regardless of what
    // any resolver decided. See `graph-refresh-retry.ts`'s own header.
    const pending = page.__graphRefreshRetry().pending(AFTER, VIEW.id, "test-sentinel-etag-never-real");
    assert.notEqual(pending, null, "graphRefreshRetry must remember this commit for when the graph catches up");
    assert.equal(pending.lineIndex, 3);
  });
});

describe("2. THE RETRY, PROVEN — a fresh graph blob carrying Zulu gives ordering a second, CORRECT chance", () => {
  test("the fresh refresh re-derives the commit and arms the row before Zulu, through the real SettleSurface", async () => {
    const { page, elements, press, setBlob } = await freshPage("ordering-retry-fresh-graph");
    await page.__refreshGraphBlobAndRetryGraphRefresh();

    const AFTER = typeMangoAtTheEnd(page, elements, press);
    await settle();

    assert.deepEqual(page.__settle().take(AFTER, VIEW.id), [], "precondition: still nothing armed");
    assert.notEqual(
      page.__graphRefreshRetry().pending(AFTER, VIEW.id, "test-sentinel-etag-never-real"),
      null,
      "precondition: retry armed",
    );

    // THE GRAPH CATCHES UP — a genuinely fresh fetch (a new ETag), now carrying Zulu.
    setBlob(GRAPH_WITH_ZULU, ETAG_FRESH);
    await page.__refreshGraphBlobAndRetryGraphRefresh();
    assert.deepEqual(page.__graphBlob(), { graph: GRAPH_WITH_ZULU });

    // THE CORRECT PLACEMENT, NOW ARMED — "Mango" (line 3) sits immediately before "Zulu" (line 2),
    // through the exact same `SettleSurface` a fresh commit's own `armSettle` call reaches
    // (`commit.ts`'s `resolveAndArm`) — no second placing mechanism.
    const instructions = page.__settle().take(AFTER, VIEW.id);
    assert.equal(instructions.length, 1, `expected exactly one placement armed, got ${JSON.stringify(instructions)}`);
    assert.equal(instructions[0].placement.lineIndex, 3, "the row that moves is Mango's own line");
    assert.equal(instructions[0].placement.beforeLineIndex, 2, "Mango must be placed immediately before Zulu, not left at the end");

    // AND THE RETRY IS CONSUMED — a second fresh refresh must not re-derive the identical commit.
    assert.equal(
      page.__graphRefreshRetry().pending(AFTER, VIEW.id, "test-sentinel-etag-never-real"),
      null,
      "the retry must clear once it has re-derived the commit",
    );
  });
});

describe("3. THE EXISTING PROMOTION PROOF IS UNTOUCHED BY THIS GENERALISATION — a sanity cross-check", () => {
  test("ordering's own retry does not require promotion to be declared at all", async () => {
    // `DECLARATION` above carries an empty rules table and no structural indent binding — promotion
    // never has an opinion on any commit this file makes (no `>`/`<`, no indent). This is not a
    // promotion regression test (that is `tests/app-promotion-retries-on-graph-refresh.test.mjs`,
    // unmodified by this leg) — it is confirmation that the SAME generic retry mechanism helps
    // ordering with zero promotion-shaped configuration in play at all.
    const { page, elements, press } = await freshPage("ordering-retry-no-promotion");
    await page.__refreshGraphBlobAndRetryGraphRefresh();
    const AFTER = typeMangoAtTheEnd(page, elements, press);
    await settle();
    assert.equal(page.__predict().take(AFTER, VIEW.id), null, "no promotion-shaped prediction should ever be armed by this fixture");
    assert.notEqual(
      page.__graphRefreshRetry().pending(AFTER, VIEW.id, "test-sentinel-etag-never-real"),
      null,
      "the retry mechanism still remembered the commit",
    );
  });
});

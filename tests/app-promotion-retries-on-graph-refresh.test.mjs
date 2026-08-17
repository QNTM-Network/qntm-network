/**
 * THE LIVE DEFECT, OBSERVED 2026-08-17: type a task, type a second task, indent the second beneath
 * the first. The parent should flip to `#outcome` immediately (an optimistic prediction), matching
 * what the engine's own cycle eventually confirms — it did not: the prediction silently abstained
 * during the wait, and only the slow real cycle's answer ever showed the correct flip.
 *
 *   node --test tests/app-promotion-retries-on-graph-refresh.test.mjs
 *
 * ── THE ROOT CAUSE, RESTATED AS WHAT THIS FILE DRIVES ──
 *
 * `structuralNodeCandidateFor` (`resolvers/promotion.ts`) needs the graph to know a STAMPED
 * child's own fields. The graph the browser holds is `app/present/graph.ts`'s `graphCache`,
 * refreshed in the background — so a child whose stamp just landed (a moment ago, its own write
 * still settling) is not yet IN the cache when the operator indents it: an honest
 * `child-not-in-graph` abstain, not a defect in that resolver. `docs/architecture/classes.yaml`'s
 * `graph-aware-resolution-reads-one-modelled-graph` names the gap this file closes: NOTHING used
 * to re-ask promotion once the cache caught up.
 *
 * ── WHAT THIS FILE PROVES, THROUGH THE REAL PAGE (not a hand-built resolver context) ──
 *
 *   1. THE STALE WINDOW, REPRODUCED. A graph blob missing the child, an indent commit through a
 *      real `>` keypress — the write posts, and NO prediction is armed. This is the bug itself,
 *      falsified here before the fix's own mechanism ever runs.
 *   2. THE RETRY, PROVEN. The graph blob refreshes with a NEW ETag that now carries the child —
 *      driven through the real `refreshGraphBlobAndRetryPromotion` wrapper both real trigger
 *      points (`installProjection`, `loadGraph`) call — and the CORRECT prediction (the parent's
 *      own row, `#outcome`) is now armed, through the real `PredictSurface`.
 *   3. STALENESS IS RESPECTED. If the operator types something else before the fresh refresh
 *      lands, the retry must be discarded, never applied — `PromotionRetrySurface`'s own "matches
 *      by exact source string" discipline, proven directly rather than assumed.
 *   4. A 304 RETRIES NOTHING. An unchanged blob (the ETag the operator's own client already holds)
 *      must not re-ask promotion at all — asking again against unchanged data could only repeat
 *      the identical abstain.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { importPage, installBrowser, makeEvent, makeWorkDir } from "./fixtures/app-html-page.mjs";
import { PROMOTION_DECLARATION, PROMOTION_VIEW } from "./fixtures/promotion-scenarios.mjs";

const PARENT_ID = "qntm:501";
const CHILD_ID = "qntm:502";

// Line 0: heading. Line 1: the already-stamped parent. Line 2: an already-stamped SIBLING, not yet
// indented — the operator's own gesture, mid-reorganisation, exactly as
// `tests/app-parent-promotion-on-indent.test.mjs` section 7 ("THE ALREADY-STAMPED CHILD") drives.
const SOURCE = [
  "## Capture",
  `- [ ] Ship the launch note [[${PARENT_ID}]] #task`,
  `- [ ] Draft the copy [[${CHILD_ID}]] #task`,
].join("\n");

const AFTER_INDENT = [
  "## Capture",
  `- [ ] Ship the launch note [[${PARENT_ID}]] #task`,
  `    - [ ] Draft the copy [[${CHILD_ID}]] #task`,
].join("\n");

/** THE STALE WINDOW — the graph blob as it stands the moment the child's own write is still
 * settling: the parent is there, the child is not. */
const GRAPH_WITHOUT_CHILD = { nodes: [{ id: PARENT_ID, type: "task", fields: { status: "open" } }], edges: [] };

/** THE CAUGHT-UP GRAPH — a later fetch, after the child's own write has landed server-side. */
const GRAPH_WITH_CHILD = {
  nodes: [
    { id: PARENT_ID, type: "task", fields: { status: "open" } },
    { id: CHILD_ID, type: "task", fields: { status: "open" } },
  ],
  edges: [],
};

const ETAG_STALE = '"blob-without-child"';
const ETAG_FRESH = '"blob-with-child"';

const settle = () => new Promise((r) => setImmediate(r));

/**
 * Stand up the page with BOTH stubs the defect spans: the write endpoint (echoes the posted
 * markdown, the same shape every other suite's `postStub`/`echoStub` uses) and `GET
 * /app/graph/blob` (conditional, mutable between calls — the same shape
 * `tests/app-graph-blob.test.mjs`'s own `standUpPage` uses, restated here rather than imported so
 * this file has no dependency on that suite's fixture surviving unrelated edits).
 */
function standUpPage(label) {
  const { elements, document: doc } = installBrowser();
  const posted = [];
  let blobGraph = GRAPH_WITHOUT_CHILD;
  let blobEtag = ETAG_STALE;
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    const headers = init.headers || {};
    if (init.method && init.method !== "GET") {
      const body = JSON.parse(init.body);
      posted.push({ url, body });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handle: "luke",
          pending_edits: 0,
          snapshot: { generated_at: "2026-08-17T00:00:00Z", views: [{ ...PROMOTION_VIEW, markdown: body.markdown }] },
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
    posted,
    press: (key) => doc.dispatch("keydown", makeEvent({ key })),
    setBlob(graph, etag) {
      blobGraph = graph;
      blobEtag = etag;
    },
  };
}

/** Every test starts the SAME way: declared, seeded, painted, cursor reset to line 0 — the graph
 * carried ONLY as a separately-fetched blob (`graphData` itself carries no `graph` key), the exact
 * shape `GET /app/graph` now serves by default (graph-envelope-composition-separates-blob-from-
 * view-markdown) and the shape this defect lives in. */
async function freshPage(label) {
  const { posted, press, setBlob } = standUpPage(label);
  const page = await importPage(makeWorkDir(label));
  page.__setToken("session-token");
  page.__applyPresentation(PROMOTION_DECLARATION);
  page.__setGraphData({
    snapshot: { generated_at: "2026-08-17T00:00:00Z", views: [{ ...PROMOTION_VIEW, title: "This Week", domain: "demo", markdown: SOURCE }] },
  });
  page.paintView(PROMOTION_VIEW.id);
  press("g");
  press("g");
  return { page, posted, press, setBlob };
}

describe("1. THE STALE WINDOW, REPRODUCED — an indent with the child not yet in the graph blob abstains, and arms nothing", () => {
  test("through the real page: `>` posts the indent, and the predict surface stays empty", async () => {
    const { page, posted, press } = await freshPage("retry-stale-window");

    // THE GRAPH BLOB IS FETCHED ONCE, MISSING THE CHILD — the moment `installProjection`'s own
    // trigger would have fired for the parent's own earlier write, well before the child existed.
    await page.__refreshGraphBlobAndRetryPromotion();
    assert.deepEqual(page.__graphBlob(), { graph: GRAPH_WITHOUT_CHILD });

    press("j"); // line 1: the parent
    press("j"); // line 2: the already-stamped child, about to be indented
    press(">");
    await settle();

    const write = posted[0];
    assert.ok(write, "> never reached the write endpoint");
    assert.equal(write.body.markdown, AFTER_INDENT, "the indent itself did not post the expected file");

    // THE BUG ITSELF, FALSIFIED HERE: no prediction armed for the parent's own row — the browser
    // stayed silent through the whole wait, exactly as the operator reported.
    const instruction = page.__predict().take(AFTER_INDENT, PROMOTION_VIEW.id);
    assert.equal(instruction, null, "nothing should be armed while the child is still missing from the graph blob");

    // AND THE RETRY WAS ARMED IN ITS PLACE — the mechanism this file exists to prove, about to be
    // exercised in section 2.
    const pending = page.__promotionRetry().pending(AFTER_INDENT, PROMOTION_VIEW.id);
    assert.notEqual(pending, null, "promotionRetry must remember this commit for when the graph catches up");
    assert.equal(pending.lineIndex, 2);
  });
});

describe("2. THE RETRY, PROVEN — a fresh graph blob carrying the child gives promotion a second chance", () => {
  test("the fresh refresh arms the correct prediction, through the real PredictSurface", async () => {
    const { page, press, setBlob } = await freshPage("retry-fresh-graph");
    await page.__refreshGraphBlobAndRetryPromotion();

    press("j");
    press("j");
    press(">");
    await settle();

    assert.equal(page.__predict().take(AFTER_INDENT, PROMOTION_VIEW.id), null, "precondition: still abstained");
    assert.notEqual(page.__promotionRetry().pending(AFTER_INDENT, PROMOTION_VIEW.id), null, "precondition: retry armed");

    // THE GRAPH CATCHES UP — a genuinely fresh fetch (a new ETag), now carrying the child.
    setBlob(GRAPH_WITH_CHILD, ETAG_FRESH);
    await page.__refreshGraphBlobAndRetryPromotion();

    assert.deepEqual(page.__graphBlob(), { graph: GRAPH_WITH_CHILD });

    // THE CORRECT PREDICTION, NOW ARMED — the parent's own row (1), never the committed child's
    // row (2), through the exact same `PredictSurface` a fresh commit's own `armPredict` call
    // reaches (`commit.ts`) — no second painting mechanism.
    const instruction = page.__predict().take(AFTER_INDENT, PROMOTION_VIEW.id);
    assert.notEqual(instruction, null, "the retry must arm a real prediction once the graph carries the child");
    assert.equal(instruction.predictions.length, 1);
    assert.equal(instruction.predictions[0].lineIndex, 1, "the PARENT's row, never the committed child's row");
    assert.equal(instruction.predictions[0].text, "#outcome");
    assert.match(instruction.predictions[0].fullText, /#outcome/);
    assert.doesNotMatch(instruction.predictions[0].fullText, /#task/, "the swap must replace #task, not append beside it");

    // AND THE RETRY IS CONSUMED — a second fresh refresh must not re-arm the identical claim.
    assert.equal(page.__promotionRetry().pending(AFTER_INDENT, PROMOTION_VIEW.id), null, "the retry must clear once it succeeds");
  });
});

describe("3. STALENESS IS RESPECTED — a retry armed against a source the operator has since edited is discarded, not applied", () => {
  test("a later, unrelated projection landing moves paintedSource past the pending retry's own key", async () => {
    const { page, press, setBlob } = await freshPage("retry-stale-source");
    await page.__refreshGraphBlobAndRetryPromotion();

    press("j");
    press("j");
    press(">");
    await settle();
    assert.notEqual(page.__promotionRetry().pending(AFTER_INDENT, PROMOTION_VIEW.id), null, "precondition: retry armed");

    // THE WORLD MOVED WHILE HE STAYED PUT — a projection for an EDIT UNRELATED to the pending
    // retry lands (a rename on the parent's own row, nothing to do with the child's indent), the
    // same kind of event `installProjection` installs on every write's own answer. `paintedSource`
    // moves on; the retry's own key (`AFTER_INDENT`) no longer matches what is on screen. Landed
    // directly, rather than through a second real gesture, so this section proves ONLY the
    // staleness discipline — not a second, unrelated indent's own resolver behaviour.
    const RENAMED = [
      "## Capture",
      `- [ ] Ship the launch note, renamed [[${PARENT_ID}]] #task`,
      `    - [ ] Draft the copy [[${CHILD_ID}]] #task`,
    ].join("\n");
    page.__setGraphData({
      snapshot: { generated_at: "2026-08-17T00:05:00Z", views: [{ ...PROMOTION_VIEW, title: "This Week", domain: "demo", markdown: RENAMED }] },
    });
    page.paintView(PROMOTION_VIEW.id, "arrived");

    // THE GRAPH NOW CATCHES UP — but the retry armed above was for `AFTER_INDENT`, a source no
    // longer on screen (`RENAMED`, just installed, is).
    setBlob(GRAPH_WITH_CHILD, ETAG_FRESH);
    await page.__refreshGraphBlobAndRetryPromotion();

    // THE STALE RETRY MUST NEVER APPLY. Read against the ORIGINAL source it was armed against —
    // exactly the discipline `PredictSurface` itself already keeps.
    assert.equal(
      page.__predict().take(AFTER_INDENT, PROMOTION_VIEW.id),
      null,
      "a retry armed against a superseded source must never arm a prediction for that stale source",
    );
    // AND NOTHING WAS INVENTED FOR THE NEW SOURCE EITHER — the retry was about `AFTER_INDENT`
    // specifically, never generalised into "whatever is on screen now".
    assert.equal(page.__predict().take(RENAMED, PROMOTION_VIEW.id), null, "the retry must not arm a claim for a source it was never asked about");
  });
});

describe("4. A 304 RETRIES NOTHING — an unchanged blob must not re-ask promotion at all", () => {
  test("the same ETag comes back — no retry attempt, nothing armed", async () => {
    const { page, press } = await freshPage("retry-unchanged-blob");
    await page.__refreshGraphBlobAndRetryPromotion();

    press("j");
    press("j");
    press(">");
    await settle();
    assert.notEqual(page.__promotionRetry().pending(AFTER_INDENT, PROMOTION_VIEW.id), null, "precondition: retry armed");

    // THE SAME BLOB, REFETCHED — a 304, unchanged. Still missing the child.
    await page.__refreshGraphBlobAndRetryPromotion();

    assert.equal(page.__predict().take(AFTER_INDENT, PROMOTION_VIEW.id), null, "a 304 must never arm a prediction");
    assert.notEqual(
      page.__promotionRetry().pending(AFTER_INDENT, PROMOTION_VIEW.id),
      null,
      "the retry must stay pending for the NEXT genuinely fresh refresh, not be dropped on a 304",
    );
  });
});

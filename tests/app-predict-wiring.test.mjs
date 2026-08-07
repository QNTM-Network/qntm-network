/**
 * THE LAST MILE, DRIVEN END TO END — the operator's own two scenarios, through app/index.html's
 * REAL `commitLine` and REAL `repaintCurrentView`, painted into `#viewBody`'s real DOM.
 *
 *   node --test tests/app-predict-wiring.test.mjs
 *
 * `tests/app-rules-stamp.test.mjs` and `tests/app-parent-promotion.test.mjs` already prove the two
 * PREDICTIONS are computed correctly and NARRATED (the badge, the freshness line) — this file does
 * not repeat that proof. What it proves is the part `armPrediction`/`paint.ts` add on top: that the
 * SAME two answers reach the ROW they are about, as a decoration, and never anywhere else.
 *
 * BOTH SCENARIOS FAIL ON `main` BY CONSTRUCTION, NOT BY ASSERTION: `git show main:app/index.html`
 * and `git show main:app/present/index.ts` carry zero occurrences of `PredictSurface`,
 * `row-prediction` or `armPrediction` (checked directly, positively — `main` does not have
 * `app/present/predict.ts` at all). Section 7's mutation proofs additionally show, ON THIS BRANCH,
 * that removing the wiring this leg adds reproduces that exact absence.
 *
 * SEVEN SECTIONS:
 *
 *   1. THE HEADLINE, SCENARIO 1 — a fresh capture: the `🆕 <date>` claim lands on the row just
 *      committed, real config, real day boundary.
 *   2. THE HEADLINE, SCENARIO 2 — an indent: the `#outcome` claim lands on the row ABOVE the one
 *      committed, never on the committed row itself.
 *   3. ABSTENTIONS ARE NEVER PAINTED — an unrenderable child rule, and a parent this app cannot
 *      resolve, both arm nothing and paint nothing.
 *   4. RECONCILIATION, CONFIRMED — the engine's own answer already carries the claim: silence, no
 *      chip, ordinary content.
 *   5. RECONCILIATION, CONTRADICTED — the engine's own answer does not carry it: the withdrawn chip
 *      paints once, on the reconciling repaint.
 *   6. THE WRITE PATH IS UNTOUCHED — the posted body carries neither glyph, byte-identical to
 *      `commit.markdown`; a positive grep over this leg's own block for an assignment to
 *      `.markdown`/`.text`.
 *   7. MUTATION PROOFS — the wiring this file exists to prove is not vacuously green.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  importPage,
  installBrowser,
  makeWorkDir,
  walk,
  withDeclaration,
  SERVED_DECLARATION,
  mutatingBundle,
  RESOLVER_SOURCES,
} from "./fixtures/app-html-page.mjs";
import { todayFor } from "../dist/present.js";
import {
  PROMOTION_DECLARATION,
  PROMOTION_VIEW,
  BARE_PARENT_TYPED,
  BARE_AFTER_PARENT,
  BARE_AFTER_CHILD,
  TAGGED_PARENT_TYPED,
  TAGGED_AFTER_PARENT,
  TAGGED_AFTER_CHILD,
} from "./fixtures/promotion-scenarios.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const TODAY = todayFor(Date.now(), SERVED_DECLARATION.resolution.dayBoundary);
assert.equal(TODAY.kind, "answer", "fixture precondition — the real config's day boundary must resolve");
const STAMP_TEXT = `🆕 ${TODAY.answer.logicalDate}`;

/**
 * `#viewBody`'s own chip(s), anywhere under it — `.row-prediction`, including its withdrawn form.
 *
 * TWO SHAPES, BOTH READ (2026-08-07). An APPEND-ONLY claim (`stamp-created-at-on-task`, or a retype
 * with nothing already on the line to swap) is still a real, appended DOM child, found by `walk`
 * exactly as before. A SWAP claim (`paint.ts`'s `replacePredictedSwap`) is marked INSIDE a content
 * element's own `innerHTML` STRING, at the position the superseded token occupied — never appended
 * — so `walk`'s `.children` traversal cannot see it: this fixture's mock DOM stores an assigned
 * `innerHTML` as an opaque string, never parsed into real child nodes (`app-html-page.mjs`'s own
 * `_html`/`_text` split). Reading that string directly is not a workaround for a test limitation —
 * a REAL browser's DOM would show both shapes as ordinary elements either way; this mock is simply
 * more literal about the fact that `innerHTML` is a serialisation, and `chipsIn` reads both
 * serialisations of the identical claim so a caller never has to know which mechanism produced it.
 */
function chipsIn(body) {
  const real = walk(body).filter((el) => String(el.className ?? "").split(/\s+/).includes("row-prediction"));
  const embedded = [];
  const CHIP_RE = /<span class="(row-prediction(?: row-prediction-withdrawn)?)"[^>]*>([^<]*)<\/span>/g;
  for (const el of [body, ...walk(body)]) {
    const html = typeof el.innerHTML === "string" ? el.innerHTML : "";
    for (const match of html.matchAll(CHIP_RE)) {
      embedded.push({ className: match[1], textContent: match[2] });
    }
  }
  return [...real, ...embedded];
}

/** A synchronous, non-`ack` POST answer that echoes the posted markdown back — the same shape
 * `app-parent-promotion.test.mjs`'s own `postStub` uses, so `arrive` is satisfied and nothing later
 * overwrites what this file is asserting. */
function echoStub(view) {
  const posted = [];
  const fetchImpl = withDeclaration(async (url, init) => {
    const body = JSON.parse(init.body);
    posted.push({ url, body });
    return {
      ok: true,
      json: async () => ({
        ok: true,
        handle: "luke",
        pending_edits: 0,
        snapshot: { generated_at: "2026-08-04T12:00:00Z", views: [{ ...view, markdown: body.markdown }] },
      }),
    };
  });
  fetchImpl.posted = posted;
  return fetchImpl;
}

/** Paint `markdown` as the CURRENT content of `view` and repaint — the real production call, real
 * `predict` surface armed by whatever `commitLine` last did. */
function paint(page, view, markdown) {
  page.__setGraphData({ snapshot: { generated_at: "2026-08-04T12:00:00Z", views: [{ ...view, markdown }] } });
  page.__setCurrentViewId(view.id);
  page.__repaintCurrentView();
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE HEADLINE, SCENARIO 1 — a fresh capture, the 🆕 stamp lands on the row just typed
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. THE HEADLINE — he adds a task, and sees the 🆕 stamp appear on that exact row", () => {
  let page, elements;

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = withDeclaration(async () => ({
      ok: true,
      json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot: { generated_at: "2026-08-01T12:00:00Z", views: [] } }),
    }));
    page = await importPage(makeWorkDir("predict-headline-stamp"));
    await page.loadPresentation();
  });

  const VIEW = { id: "inbox", path: "inbox.md" };
  const BEFORE = "## Inbox\n## Domain Empty\n";
  const AFTER = "## Inbox\n## Domain Empty\n- [ ] Write the launch note\n";
  const CAPTURE = { lineIndex: 2, text: "- [ ] Write the launch note", markdown: AFTER, source: BEFORE, kind: "insert-line" };

  test("OBSERVED ON THIS BRANCH: the predict surface arms the child's own row with the real day-boundary label", async () => {
    globalThis.fetch = echoStub(VIEW);
    const write = page.commitLine(VIEW, { ...CAPTURE });
    // Read synchronously — armPrediction runs before the await, the same moment armOrderingSettle
    // already does (app/index.html's own comment for why).
    const instruction = page.__predict().take(AFTER, VIEW.id);
    assert.notEqual(instruction, null, "nothing was armed for the headline capture");
    assert.deepEqual(instruction.predictions, [{ lineIndex: 2, text: STAMP_TEXT }]);
    await write;
  });

  test("OBSERVED ON THIS BRANCH: painted — the chip lands inside the row's own element, at line 2, nowhere else", async () => {
    globalThis.fetch = echoStub(VIEW);
    const write = page.commitLine(VIEW, { ...CAPTURE });
    paint(page, VIEW, AFTER);

    const body = elements.get("viewBody");
    const rows = walk(body).filter((el) => el.tagName === "label");
    assert.equal(rows.length, 1, "precondition: exactly one task row painted");
    const chips = chipsIn(rows[0]);
    assert.equal(chips.length, 1, "the committed row must carry exactly one predicted chip");
    assert.equal(chips[0].textContent, STAMP_TEXT);
    assert.match(chips[0].className, /\brow-prediction\b/);
    assert.doesNotMatch(chips[0].className, /withdrawn/, "a freshly-armed claim is pending, not withdrawn");
    await write;
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE HEADLINE, SCENARIO 2 — an indent, the #outcome claim lands on the PARENT's row
// ══════════════════════════════════════════════════════════════════════════════════════════════

// `PROMOTION_DECLARATION`/`PROMOTION_VIEW` now live in `tests/fixtures/promotion-scenarios.mjs` — a
// hand-built declaration shaped like the operator's real one (mirrors the real
// tasks-with-open-part-of-child pattern's structure without depending on the real 35-type list),
// extracted 2026-08-07 so this file and `tests/app-parent-promotion-on-indent.test.mjs` can never
// silently disagree again about what "the operator's real gesture" looks like — see that fixture's
// own header for the defect this closes.

describe("2. THE HEADLINE — he indents a task under a task, and sees the parent become an outcome", () => {
  let page, elements;

  // NEITHER LINE CARRIES AN EXPLICIT #task TAG, THE OPERATOR'S OTHER OWN IDIOMATIC STYLE
  // (tests/app-rules-stamp.test.mjs's own headline capture is bare too). Section 8 below drives the
  // TAGGED shape — a parent line carrying `#task` explicitly, the SAME family the promotion rule's
  // `retype` effect targets — which used to hit `conflicting-token-present` and abstain silently;
  // see that section's own header for the defect and the fix.
  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = echoStub(PROMOTION_VIEW);
    page = await importPage(makeWorkDir("predict-headline-promotion"));
    page.__applyPresentation(PROMOTION_DECLARATION);
    page.__setGraphData({ snapshot: { generated_at: "2026-08-04T00:00:00Z", views: [], graph: { nodes: [], edges: [] } } });
  });

  test("OBSERVED ON THIS BRANCH: the parent's own row is armed, the CHILD's row is not", async () => {
    await page.commitLine(PROMOTION_VIEW, {
      lineIndex: 1, text: "- [ ] Ship the launch note", markdown: BARE_AFTER_PARENT, source: BARE_PARENT_TYPED, kind: "insert-line",
    });
    const write = page.commitLine(PROMOTION_VIEW, {
      lineIndex: 2, text: "    - [ ] Draft the copy", markdown: BARE_AFTER_CHILD, source: BARE_AFTER_PARENT, kind: "insert-line",
    });
    const instruction = page.__predict().take(BARE_AFTER_CHILD, PROMOTION_VIEW.id);
    assert.notEqual(instruction, null);
    assert.deepEqual(
      instruction.predictions,
      [{ lineIndex: 1, text: "#outcome", fullText: "- [ ] Ship the launch note #outcome" }],
      "the PARENT's row (1), never the committed child's row (2) — `fullText` (2026-08-07) carries the whole predicted line so paint.ts can show it byte-exact rather than only the delta",
    );
    await write;
  });

  test("OBSERVED ON THIS BRANCH: painted — the chip lands on the parent row, and the committed row carries none", async () => {
    await page.commitLine(PROMOTION_VIEW, {
      lineIndex: 1, text: "- [ ] Ship the launch note", markdown: BARE_AFTER_PARENT, source: BARE_PARENT_TYPED, kind: "insert-line",
    });
    const write = page.commitLine(PROMOTION_VIEW, {
      lineIndex: 2, text: "    - [ ] Draft the copy", markdown: BARE_AFTER_CHILD, source: BARE_AFTER_PARENT, kind: "insert-line",
    });
    paint(page, PROMOTION_VIEW, BARE_AFTER_CHILD);

    const body = elements.get("viewBody");
    const rows = walk(body).filter((el) => el.tagName === "label");
    assert.equal(rows.length, 2, "precondition: parent row and child row both painted");
    assert.equal(chipsIn(rows[0]).length, 1, "the parent row must carry the promotion claim");
    assert.equal(chipsIn(rows[0])[0].textContent, "#outcome");
    assert.equal(chipsIn(rows[1]).length, 0, "the committed child row must carry no claim of its own here");
    await write;
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. ABSTENTIONS ARE NEVER PAINTED
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. ABSTENTIONS ARE NEVER PAINTED — the browser's own 'I don't know' stays honest", () => {
  test("a rule that fires but cannot be spelled onto the line arms and paints nothing", async () => {
    const { elements } = installBrowser();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    const page = await importPage(makeWorkDir("predict-abstain-unrenderable"));
    // The exact unrenderable-field shape tests/app-rules-stamp.test.mjs §3 already proves abstains
    // through the badge — reused here to prove it ALSO arms no prediction.
    const DECLARATION = {
      qualification: {
        defaultNodeType: "task", structuralNodeTypes: [],
        tokens: { node_type: { "#task": "task" }, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
        predicates: { "demo-open": { find: { nodeType: ["task"], fields: {} }, exclude: [] } },
        sections: { demo: { capture: { qualification: "demo-open", nodeType: "task", name: "Capture" } } },
        sectionOrder: { demo: ["capture"] }, refused: {}, dropped: {},
      },
      resolution: {
        registration: {}, lineGrammars: {}, ordering: {}, orderingFields: {},
        dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
        chromeShapes: {}, sectionRegistration: {}, defaultOrdering: [], priorityRank: {}, dropped: {},
      },
      rules: {
        order: { established: true, sequence: ["stamp-unspellable-field"] },
        rules: {
          "stamp-unspellable-field": {
            pattern: "tasks", when: { op: "true" }, priority: 0,
            actions: [{ verb: "set", field: "no_marker_for_this_field", to: "x" }],
          },
        },
        patterns: { tasks: { find: { nodeType: ["task"], fields: {} }, exclude: [] } },
        fieldMarkers: {}, dropped: {},
      },
    };
    page.__applyPresentation(DECLARATION);

    const VIEW = { id: "demo", path: "demo.md" };
    const BEFORE = "## Capture\n";
    const AFTER = "## Capture\n- [ ] Try this\n";
    page.commitLine(VIEW, { lineIndex: 1, text: "- [ ] Try this", markdown: AFTER, source: BEFORE, kind: "insert-line" });

    assert.equal(page.__predict().take(AFTER, VIEW.id), null, "an unrenderable rule must arm nothing");
    page.__setGraphData({ snapshot: { generated_at: "x", views: [{ ...VIEW, markdown: AFTER }] } });
    page.__setCurrentViewId(VIEW.id);
    page.__repaintCurrentView();
    assert.equal(chipsIn(elements.get("viewBody")).length, 0, "an abstention must paint no chip");
  });

  test("a parent this app cannot resolve (graph not loaded) arms and paints nothing", async () => {
    const { elements } = installBrowser();
    globalThis.fetch = echoStub(PROMOTION_VIEW);
    const page = await importPage(makeWorkDir("predict-abstain-graph-not-loaded"));
    page.__applyPresentation(PROMOTION_DECLARATION);
    // NO __setGraphData AT ALL — graphSnapshot() (app/index.html) returns null, which
    // parentCandidateFor abstains "graph-not-loaded" for a STAMPED parent. Use a stamped parent so
    // this path is actually reached (an unstamped one resolves off the line itself and would answer).
    const BEFORE = "## Capture\n- [ ] Ship the launch note [[qntm:999]]\n";
    const AFTER = "## Capture\n- [ ] Ship the launch note [[qntm:999]]\n    - [ ] Draft the copy\n";
    const write = page.commitLine(PROMOTION_VIEW, {
      lineIndex: 2, text: "    - [ ] Draft the copy", markdown: AFTER, source: BEFORE, kind: "insert-line",
    });
    const reading = page.__parentPromotionFor(PROMOTION_VIEW, {
      lineIndex: 2, text: "    - [ ] Draft the copy", markdown: AFTER, source: BEFORE, kind: "insert-line",
    });
    assert.equal(reading.kind, "abstains");
    assert.equal(reading.because, "graph-not-loaded");
    assert.equal(page.__predict().take(AFTER, PROMOTION_VIEW.id), null, "an abstained parent must arm nothing");
    await write;
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4 + 5. RECONCILIATION — confirmed (silence) and contradicted (withdrawn, painted once)
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. RECONCILIATION, CONFIRMED — the engine's own answer already carries the claim", () => {
  test("no chip is painted; the row's own ordinary characters are now what the chip predicted", async () => {
    const { elements } = installBrowser();
    globalThis.fetch = withDeclaration(async () => ({
      ok: true, json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot: { generated_at: "x", views: [] } }),
    }));
    const page = await importPage(makeWorkDir("predict-reconcile-confirmed"));
    await page.loadPresentation();

    const VIEW = { id: "inbox", path: "inbox.md" };
    const BEFORE = "## Inbox\n## Domain Empty\n";
    const AFTER = "## Inbox\n## Domain Empty\n- [ ] Write the launch note\n";
    globalThis.fetch = echoStub(VIEW);
    const write = page.commitLine(VIEW, { lineIndex: 2, text: "- [ ] Write the launch note", markdown: AFTER, source: BEFORE, kind: "insert-line" });
    // The optimistic repaint — the chip is there.
    paint(page, VIEW, AFTER);
    assert.equal(chipsIn(elements.get("viewBody")).length, 1, "precondition: the pending claim was painted");

    // THE ENGINE'S OWN ANSWER — the SAME characters the chip predicted, now real.
    const ARRIVED = `## Inbox\n## Domain Empty\n- [ ] Write the launch note ${STAMP_TEXT}\n`;
    paint(page, VIEW, ARRIVED);
    assert.equal(chipsIn(elements.get("viewBody")).length, 0, "a confirmed claim paints no chip — it is ordinary content now");
    const rows = walk(elements.get("viewBody")).filter((el) => el.tagName === "label");
    assert.equal(rows.length, 1, "the row is still painted — confirmation removes the CHIP, never the row");
    const rowText = walk(rows[0]).map((el) => el.innerHTML ?? "").join("");
    assert.match(rowText, new RegExp(TODAY.answer.logicalDate), "the row's own real characters now carry the date the chip predicted");
    await write;
  });
});

describe("5. RECONCILIATION, CONTRADICTED — the engine's own answer disagrees", () => {
  test("the withdrawn chip paints once, on the reconciling repaint, then is gone", async () => {
    const { elements } = installBrowser();
    globalThis.fetch = withDeclaration(async () => ({
      ok: true, json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot: { generated_at: "x", views: [] } }),
    }));
    const page = await importPage(makeWorkDir("predict-reconcile-contradicted"));
    await page.loadPresentation();

    const VIEW = { id: "inbox", path: "inbox.md" };
    const BEFORE = "## Inbox\n## Domain Empty\n";
    const AFTER = "## Inbox\n## Domain Empty\n- [ ] Write the launch note\n";
    globalThis.fetch = echoStub(VIEW);
    const write = page.commitLine(VIEW, { lineIndex: 2, text: "- [ ] Write the launch note", markdown: AFTER, source: BEFORE, kind: "insert-line" });
    paint(page, VIEW, AFTER);
    assert.equal(chipsIn(elements.get("viewBody")).length, 1, "precondition: the pending claim was painted");

    // THE ENGINE'S OWN ANSWER — reformatted, and crucially, WITHOUT the stamp this browser expected
    // (a hypothetical config change, or a rule this app modelled differently from the engine).
    const ARRIVED = "## Inbox\n## Domain Empty\n- [ ] Write the launch note #task\n";
    paint(page, VIEW, ARRIVED);
    const rows = walk(elements.get("viewBody")).filter((el) => el.tagName === "label");
    const chip = chipsIn(rows[0])[0];
    assert.notEqual(chip, undefined, "the contradiction must be shown, not silently dropped");
    assert.match(chip.className, /\brow-prediction-withdrawn\b/);
    assert.equal(chip.textContent, STAMP_TEXT, "the withdrawn chip still names what was claimed");

    // ONE-SHOT: the very next repaint of the SAME arrived source shows nothing more.
    paint(page, VIEW, ARRIVED);
    assert.equal(chipsIn(elements.get("viewBody")).length, 0, "a withdrawal is shown exactly once");
    await write;
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE WRITE PATH IS UNTOUCHED
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("6. THE WRITE PATH IS UNTOUCHED", () => {
  test("the posted body for the headline capture carries neither predicted glyph, byte-identical to commit.markdown", async () => {
    installBrowser();
    const VIEW = { id: "inbox", path: "inbox.md" };
    const page = await importPage(makeWorkDir("predict-write-path"));
    const BEFORE = "## Inbox\n## Domain Empty\n";
    const AFTER = "## Inbox\n## Domain Empty\n- [ ] Write the launch note\n";
    globalThis.fetch = withDeclaration(async () => ({
      ok: true, json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot: { generated_at: "x", views: [] } }),
    }));
    await page.loadPresentation();
    const stub = echoStub(VIEW);
    globalThis.fetch = stub;
    await page.commitLine(VIEW, { lineIndex: 2, text: "- [ ] Write the launch note", markdown: AFTER, source: BEFORE, kind: "insert-line" });
    assert.equal(stub.posted.length, 1, "the capture was never posted");
    assert.equal(stub.posted[0].body.markdown, AFTER, "the posted body must be byte-identical to what applyEdit produced");
    assert.ok(!stub.posted[0].body.markdown.includes("🆕"), "the write path must never carry the predicted glyph");
    assert.ok(!stub.posted[0].body.markdown.includes("#outcome"), "the write path must never carry the predicted retype");
  });

  test("`.markdown`/`.text` are never assigned by anything that produces a prediction — the positive grep", () => {
    // `childPredictionFor`/`parentPredictionFor`/`armPrediction` are `rulesSpec.arm`,
    // `promotionSpec.arm` and `armPredict` now. The grep runs against the WHOLE of every resolver
    // module plus `resolve.ts` — a wider claim than the hand-sliced page block it replaces, and one
    // that cannot go stale by being pointed at a region that moved.
    for (const [name, source] of Object.entries(RESOLVER_SOURCES)) {
      assert.doesNotMatch(source, /\.markdown\s*=(?!=)/, `${name} assigns .markdown`);
      assert.doesNotMatch(source, /\.text\s*=(?!=)/, `${name} assigns .text`);
      assert.doesNotMatch(source, /\bonLineCommit\b|\bonCheckboxToggle\b/, `${name} reaches a write callback`);
    }
    // AND THE ONE CALL SITE, RELOCATED (2026-08-07). `armPredict` used to be reached from exactly
    // one place ON THE PAGE, inside hand-authored `commitLine`; `commitLine` itself has since
    // moved to app/present/commit.ts (see that module's own header — the relocation this leg's
    // brief asked for, so a caller-chain probe can see it call `runResolvers`) and the call moved
    // with it. The invariant is unchanged — armPredict is reached from exactly one place — only
    // WHERE that one place is has moved, so this checks both halves: zero occurrences left behind
    // on the page, exactly one in the module that now owns the call.
    const APP_SOURCE = readFileSync(resolve(HERE, "..", "app", "index.html"), "utf8");
    assert.equal((APP_SOURCE.match(/\barmPredict\(/g) ?? []).length, 0, "app/index.html must call armPredict nowhere — it moved to commit.ts");
    const COMMIT_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "commit.ts"), "utf8");
    assert.equal((COMMIT_SOURCE.match(/\barmPredict\(/g) ?? []).length, 1, "predict is armed from more than one place");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7. MUTATION PROOFS
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("7. MUTATION PROOFS — this leg's own tests are not vacuously green", () => {
  test("MUTATION: skip armPrediction entirely — the headline scenario 1 goes red", async () => {
    // THIS MUTATION MOVED, WITH THE CALL IT TARGETS (2026-08-07). `armPredict` used to be called
    // from hand-authored `commitLine`, on the page — the ONE mutation in this section that could
    // not use `mutatingBundle` yet, unlike the other two below. `commitLine` now lives in
    // app/present/commit.ts (compiled into dist/present.js), so the call this mutation disables
    // is in the bundle too, and this joins the other two.
    const workDir = makeWorkDir("predict-mutation-skip-arm");
    const mutate = mutatingBundle([
      "armPredict(deps.predict, commit.markdown, view.id, outcome.predictions);",
      "/* the predict arm skipped */",
    ])(workDir);
    const { elements } = installBrowser();
    globalThis.fetch = withDeclaration(async () => ({
      ok: true, json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot: { generated_at: "x", views: [] } }),
    }));
    const page = await importPage(workDir, mutate);
    await page.loadPresentation();

    const VIEW = { id: "inbox", path: "inbox.md" };
    const BEFORE = "## Inbox\n## Domain Empty\n";
    const AFTER = "## Inbox\n## Domain Empty\n- [ ] Write the launch note\n";
    globalThis.fetch = echoStub(VIEW);
    const write = page.commitLine(VIEW, { lineIndex: 2, text: "- [ ] Write the launch note", markdown: AFTER, source: BEFORE, kind: "insert-line" });
    paint(page, VIEW, AFTER);
    assert.equal(
      chipsIn(elements.get("viewBody")).length, 0,
      "with armPrediction skipped, the headline scenario must reproduce main's own behaviour — no chip",
    );
    await write;
  });

  test("MUTATION: childPredictionFor stops trimming the delta — the chip carries the whole line, not just the marker", async () => {
    const workDir = makeWorkDir("predict-mutation-no-slice");
    const mutate = mutatingBundle([
      "const delta = reading.text.slice(line.length).trim();",
      "const delta = reading.text;",
    ])(workDir);
    installBrowser();
    globalThis.fetch = withDeclaration(async () => ({
      ok: true, json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot: { generated_at: "x", views: [] } }),
    }));
    const page = await importPage(workDir, mutate);
    await page.loadPresentation();

    const VIEW = { id: "inbox", path: "inbox.md" };
    const BEFORE = "## Inbox\n## Domain Empty\n";
    const AFTER = "## Inbox\n## Domain Empty\n- [ ] Write the launch note\n";
    globalThis.fetch = echoStub(VIEW);
    const write = page.commitLine(VIEW, { lineIndex: 2, text: "- [ ] Write the launch note", markdown: AFTER, source: BEFORE, kind: "insert-line" });
    const instruction = page.__predict().take(AFTER, VIEW.id);
    assert.notEqual(instruction.predictions[0].text, STAMP_TEXT, "the mutant must produce a DIFFERENT (wrong, unsliced) claim");
    assert.match(instruction.predictions[0].text, /Write the launch note/, "the mutant duplicates the row's own characters — exactly the failure this test exists to catch");
    await write;
  });

  test("MUTATION: parentPredictionFor renders every effect, not only retype — the real promotion rules abstain again", async () => {
    // Restores the EXACT all-or-nothing call the design brief itself refuted (see this leg's own
    // header, parentPredictionFor) — proof that filtering to retype effects is load-bearing, not
    // cosmetic: without it, every real published promotion rule (which always pairs its retype
    // with an unrenderable auto_outcome/auto_habit set) abstains, and the headline scenario 2 goes
    // red exactly the way it did before this leg's own instinct was corrected.
    //
    // 2026-08-07: the retype filter moved from `arm` into `read` (`resolvers/promotion.ts`) — see
    // `PromotionOutcome.render`'s own header — so the exact text this mutation targets moved with
    // it, from `reading.applied.filter(...)` to `pass.applied.filter(...)`. The BEHAVIOUR this
    // mutation proves is unchanged; only its source location is.
    const workDir = makeWorkDir("predict-mutation-no-retype-filter");
    const mutate = mutatingBundle([
      'const retypes = pass.applied.filter((effect) => effect.verb === "retype");',
      "const retypes = pass.applied;",
    ])(workDir);
    const { elements } = installBrowser();
    globalThis.fetch = echoStub(PROMOTION_VIEW);
    const page = await importPage(workDir, mutate);
    page.__applyPresentation(PROMOTION_DECLARATION);
    page.__setGraphData({ snapshot: { generated_at: "x", views: [], graph: { nodes: [], edges: [] } } });

    const PARENT_TYPED = "## Capture\n";
    const AFTER_PARENT = "## Capture\n- [ ] Ship the launch note\n";
    const AFTER_CHILD = "## Capture\n- [ ] Ship the launch note\n    - [ ] Draft the copy\n";
    await page.commitLine(PROMOTION_VIEW, {
      lineIndex: 1, text: "- [ ] Ship the launch note", markdown: AFTER_PARENT, source: PARENT_TYPED, kind: "insert-line",
    });
    const write = page.commitLine(PROMOTION_VIEW, {
      lineIndex: 2, text: "    - [ ] Draft the copy", markdown: AFTER_CHILD, source: AFTER_PARENT, kind: "insert-line",
    });
    assert.equal(
      page.__predict().take(AFTER_CHILD, PROMOTION_VIEW.id), null,
      "with the all-or-nothing render restored, the real published rule shape (retype + unrenderable set) must abstain again",
    );
    await write;
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 8. THE OPERATOR'S REAL GESTURE — a parent line that ALREADY carries `#task`, the shape that
//    silently abstained in production on 2026-08-07 (`conflicting-token-present`, swallowed inside
//    `arm`, never reported anywhere). FAILS ON UNFIXED CODE — see this section's own header.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("8. THE OPERATOR'S REAL GESTURE — a #task-tagged parent, indented under, still becomes #outcome", () => {
  /**
   * THE DEFECT, AND WHY NEITHER EXISTING FILE CAUGHT IT. `tests/app-parent-promotion-on-indent.test
   * .mjs` proves `promotionSpec.read()`/`say()` decide correctly for a `#task`-tagged parent line —
   * but it never calls `.arm()` and never touches the DOM, so it could not see `arm`'s own silent
   * `[] `. Section 2 above (this file) DOES call `.arm()`, through the real `commitLine`, but its
   * own fixture was BARE on purpose (see its comment, now retired) "because a tagged line would hit
   * `conflicting-token-present`" — it was written AROUND the bug rather than proving it does not
   * happen. Neither file, alone or together before this leg, ever drove a `#task`-tagged parent
   * through `arm()` to `#viewBody`. This section is that missing drive, using the SAME shared
   * fixture (`tests/fixtures/promotion-scenarios.mjs`) section 2 now imports, so the two files
   * cannot silently diverge on what "a real task line" looks like again.
   *
   * PROVEN AT APPLICATION LEVEL: real `commitLine`, real `armPredict`, real `repaintCurrentView`,
   * real `#viewBody` children — not the resolver alone.
   */
  test("OBSERVED ON THIS BRANCH: the #outcome chip paints on the tagged parent's row — the swap, not a refusal", async () => {
    const { elements } = installBrowser();
    globalThis.fetch = echoStub(PROMOTION_VIEW);
    const page = await importPage(makeWorkDir("predict-tagged-parent-headline"));
    page.__applyPresentation(PROMOTION_DECLARATION);
    page.__setGraphData({ snapshot: { generated_at: "2026-08-07T00:00:00Z", views: [], graph: { nodes: [], edges: [] } } });

    await page.commitLine(PROMOTION_VIEW, {
      lineIndex: 1, text: "- [ ] Ship the launch note #task", markdown: TAGGED_AFTER_PARENT, source: TAGGED_PARENT_TYPED, kind: "insert-line",
    });
    const write = page.commitLine(PROMOTION_VIEW, {
      lineIndex: 2, text: "    - [ ] Draft the copy #task", markdown: TAGGED_AFTER_CHILD, source: TAGGED_AFTER_PARENT, kind: "insert-line",
    });

    // THE ARMED PREDICTION — read synchronously, before the write's own answer lands.
    const instruction = page.__predict().take(TAGGED_AFTER_CHILD, PROMOTION_VIEW.id);
    assert.notEqual(instruction, null, "ON UNFIXED CODE: `arm` swallows `conflicting-token-present` and arms nothing here — this is the red assertion");
    assert.deepEqual(
      instruction.predictions,
      [{ lineIndex: 1, text: "#outcome", fullText: "- [ ] Ship the launch note #outcome" }],
      "`fullText` (2026-08-07) carries the whole predicted line, byte-identical to `renderRuleEffects`'s own swap — see `RowPrediction`'s own header",
    );

    paint(page, PROMOTION_VIEW, TAGGED_AFTER_CHILD);
    const body = elements.get("viewBody");
    const rows = walk(body).filter((el) => el.tagName === "label");
    assert.equal(rows.length, 2, "precondition: parent row and child row both painted");
    assert.equal(chipsIn(rows[0]).length, 1, "the tagged parent row must still carry the promotion claim");
    assert.equal(chipsIn(rows[0])[0].textContent, "#outcome");

    // ── THE STRONGER PROOF: IN PLACE, NOT APPENDED ─────────────────────────────────────────────
    //
    // `chipsIn` finding one "#outcome" claim is necessary but not sufficient — it would ALSO be
    // true of the pre-2026-08-08 defect, which appended that exact claim AFTER the row's own STALE
    // content while `#task` stayed put (the operator's own report: "it added it at end. Not
    // replaced task."). The row's own content-bearing element (`walk`'s second child under a
    // checkbox row — `row.append(box, span)`, paint.ts) is where that stale `#task` would still be
    // read directly, since the mock DOM stores an assigned `innerHTML` as an opaque string never
    // parsed into real children (`chipsIn`'s own header). Byte-exact: `#task` must be gone from it
    // entirely, not merely joined by a second claim.
    const contentSpan = walk(rows[0]).find((el) => el.tagName === "span" && el !== rows[0]);
    assert.ok(contentSpan, "precondition: the parent row has its own content span");
    assert.doesNotMatch(
      contentSpan.innerHTML,
      /#task/,
      "THE OLD #task TAG MUST BE GONE FROM THE ROW'S OWN RENDERED CONTENT, not merely joined by a floating '#outcome' badge",
    );
    await write;
  });

  test("MUTATION: disable the in-place swap render — the old #task tag reappears, reproducing the operator's exact report", async () => {
    // `replacePredictedSwap` (paint.ts) is what turns `fullText` into the row's own byte-exact
    // content instead of an appended badge. Disabling ONLY the call site that consumes it — nothing
    // about `renderRuleEffects`'s own (already-correct) swap computation — reproduces the operator's
    // exact symptom: #task visible, #outcome merely appended beside it. Proves this leg's own new
    // assertion (above) is not vacuously green.
    const workDir = makeWorkDir("predict-tagged-parent-inplace-mutation");
    const mutate = mutatingBundle([
      'const replaced = predictable !== void 0 && prediction.fullText !== void 0 ? replacePredictedSwap(predictable, prediction.fullText, prediction.text, "pending") : false;',
      "const replaced = false;",
    ])(workDir);
    const { elements } = installBrowser();
    globalThis.fetch = echoStub(PROMOTION_VIEW);
    const page = await importPage(workDir, mutate);
    page.__applyPresentation(PROMOTION_DECLARATION);
    page.__setGraphData({ snapshot: { generated_at: "2026-08-07T00:00:00Z", views: [], graph: { nodes: [], edges: [] } } });

    await page.commitLine(PROMOTION_VIEW, {
      lineIndex: 1, text: "- [ ] Ship the launch note #task", markdown: TAGGED_AFTER_PARENT, source: TAGGED_PARENT_TYPED, kind: "insert-line",
    });
    const write = page.commitLine(PROMOTION_VIEW, {
      lineIndex: 2, text: "    - [ ] Draft the copy #task", markdown: TAGGED_AFTER_CHILD, source: TAGGED_AFTER_PARENT, kind: "insert-line",
    });

    paint(page, PROMOTION_VIEW, TAGGED_AFTER_CHILD);
    const body = elements.get("viewBody");
    const rows = walk(body).filter((el) => el.tagName === "label");
    const contentSpan = walk(rows[0]).find((el) => el.tagName === "span" && el !== rows[0]);
    assert.match(
      contentSpan.innerHTML,
      /#task/,
      "MUTANT: with the in-place render disabled, the row's own stale content must still carry #task — this is the RED this leg's fix turns GREEN",
    );
    assert.equal(chipsIn(rows[0]).length, 1, "MUTANT: the claim still arrives, but only as a separate appended badge, exactly the operator's report");
    await write;
  });

  test("THE OLD `#task` TAG IS GONE, NOT DOUBLED — the real write is still untouched, and the resolver's own reading matches", async () => {
    // A regression guard for the SWAP mechanism itself, distinct from the paint assertion above:
    // `promotionSpec.read()`'s own `reading.render` must carry the REPLACED line — `#outcome`, not
    // `#task #outcome` — even though nothing here ever writes it back to `commit.markdown`.
    const { elements } = installBrowser();
    globalThis.fetch = echoStub(PROMOTION_VIEW);
    const page = await importPage(makeWorkDir("predict-tagged-parent-swap-shape"));
    page.__applyPresentation(PROMOTION_DECLARATION);
    page.__setGraphData({ snapshot: { generated_at: "2026-08-07T00:00:00Z", views: [], graph: { nodes: [], edges: [] } } });

    await page.commitLine(PROMOTION_VIEW, {
      lineIndex: 1, text: "- [ ] Ship the launch note #task", markdown: TAGGED_AFTER_PARENT, source: TAGGED_PARENT_TYPED, kind: "insert-line",
    });
    const write = page.commitLine(PROMOTION_VIEW, {
      lineIndex: 2, text: "    - [ ] Draft the copy #task", markdown: TAGGED_AFTER_CHILD, source: TAGGED_AFTER_PARENT, kind: "insert-line",
    });
    const reading = page.__parentPromotionFor(PROMOTION_VIEW, {
      lineIndex: 2, text: "    - [ ] Draft the copy #task", markdown: TAGGED_AFTER_CHILD, source: TAGGED_AFTER_PARENT, kind: "insert-line",
    });
    assert.equal(reading.kind, "answer");
    assert.equal(reading.render.kind, "rendered");
    assert.equal(reading.render.text, "- [ ] Ship the launch note #outcome", "the swap replaces #task in place; it does not append #outcome beside it");
    // PROMOTION_DECLARATION's own rule declares `partial: true` (an unmodelled `emit_event`) — see
    // that fixture's own comment — so the sentence carries that clause too; this is not about the
    // swap, only about matching the fixture's real shape rather than a simplified one.
    assert.equal(page.__parentPromotionDiagnosticFor(reading), "parent: decided (partial — action(s) not modelled)");
    await write;
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 9. THE ABSTENTION IS NOW VISIBLE — `arm`'s own refusal, when one still happens, reaches the SAME
//    diagnostics channel every other resolver abstention already does. `conflicting-token-present`
//    can no longer fire for a `retype` (section 8 proves the swap), so this exercises the OTHER
//    reason `arm` can still refuse — `unrenderable-effect`, a `retype` targeting a value the
//    declaration's own `node_type` family has no token for at all.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("9. THE ABSTENTION IS NOW VISIBLE — a render `arm` cannot spell reaches show()/abstentionsOf, not just []", () => {
  test("an unspellable retype target abstains through the SAME sentence a read()-level refusal already uses, and paints nothing", async () => {
    // `#outcome` is deliberately ABSENT from `node_type` here — every other shape of this
    // declaration is `PROMOTION_DECLARATION` (promotion-scenarios.mjs), so this is the ONE
    // controlled difference the test exists to exploit.
    const declaration = JSON.parse(JSON.stringify(PROMOTION_DECLARATION));
    delete declaration.qualification.tokens.node_type["#outcome"];

    const { elements } = installBrowser();
    globalThis.fetch = echoStub(PROMOTION_VIEW);
    const page = await importPage(makeWorkDir("predict-abstain-unrenderable-retype"));
    page.__applyPresentation(declaration);
    page.__setGraphData({ snapshot: { generated_at: "2026-08-07T00:00:00Z", views: [], graph: { nodes: [], edges: [] } } });

    await page.commitLine(PROMOTION_VIEW, {
      lineIndex: 1, text: "- [ ] Ship the launch note", markdown: BARE_AFTER_PARENT, source: BARE_PARENT_TYPED, kind: "insert-line",
    });
    const write = page.commitLine(PROMOTION_VIEW, {
      lineIndex: 2, text: "    - [ ] Draft the copy", markdown: BARE_AFTER_CHILD, source: BARE_AFTER_PARENT, kind: "insert-line",
    });
    const reading = page.__parentPromotionFor(PROMOTION_VIEW, {
      lineIndex: 2, text: "    - [ ] Draft the copy", markdown: BARE_AFTER_CHILD, source: BARE_AFTER_PARENT, kind: "insert-line",
    });
    assert.equal(reading.kind, "answer", "the graph-aware PASS still decides correctly — this is arm's own refusal, not read's");
    assert.equal(reading.render.kind, "abstains");
    assert.equal(reading.render.because, "unrenderable-effect");
    assert.equal(
      page.__parentPromotionDiagnosticFor(reading),
      "parent: abstained — rendering-unrenderable-effect",
      "arm's own refusal must be readable through show(), the same channel every other resolver abstention already uses",
    );
    assert.equal(page.__predict().take(BARE_AFTER_CHILD, PROMOTION_VIEW.id), null, "arm must still arm nothing for an unspellable retype");
    paint(page, PROMOTION_VIEW, BARE_AFTER_CHILD);
    assert.equal(chipsIn(elements.get("viewBody")).length, 0);
    await write;
  });
});

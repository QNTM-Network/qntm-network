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
  assertMutated,
  importPage,
  installBrowser,
  makeWorkDir,
  walk,
  withDeclaration,
  SERVED_DECLARATION,
} from "./fixtures/app-html-page.mjs";
import { todayFor } from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const TODAY = todayFor(Date.now(), SERVED_DECLARATION.resolution.dayBoundary);
assert.equal(TODAY.kind, "answer", "fixture precondition — the real config's day boundary must resolve");
const STAMP_TEXT = `🆕 ${TODAY.answer.logicalDate}`;

/** `#viewBody`'s own chip(s), anywhere under it — `.row-prediction`, including its withdrawn form. */
function chipsIn(body) {
  return walk(body).filter((el) => String(el.className ?? "").split(/\s+/).includes("row-prediction"));
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

// A hand-built declaration shaped like the operator's real one — the SAME shape
// tests/app-parent-promotion.test.mjs uses for the identical reason (mirrors the real
// tasks-with-open-part-of-child pattern's structure without depending on the real 35-type list).
const PROMOTION_DECLARATION = {
  qualification: {
    defaultNodeType: "task",
    structuralNodeTypes: [],
    tokens: {
      node_type: { "#task": "task", "#routine": "routine", "#outcome": "outcome", "#habit": "habit" },
      domain: {},
      status: { "[ ]": "open", "[x]": "done" },
    },
    predicates: { "open-tasks": { find: { nodeType: ["task"], fields: {} }, exclude: [] } },
    sections: { "this-week": { capture: { qualification: "open-tasks", nodeType: "task", name: "Capture" } } },
    sectionOrder: { "this-week": ["capture"] },
    refused: {},
    dropped: {},
  },
  resolution: {
    registration: {}, lineGrammars: {}, ordering: {}, orderingFields: {},
    dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
    chromeShapes: {}, sectionRegistration: {}, defaultOrdering: [], priorityRank: {}, dropped: {},
  },
  structural: {
    indent: { edgeType: "PART_OF", edgeSource: "self" },
    edgeCardinality: { PART_OF: "many_to_one", WAITING_FOR: "many_to_many" },
    sections: {}, dropped: {},
  },
  rules: {
    order: { established: true, sequence: ["task-with-open-part-of-child-becomes-outcome"] },
    rules: {
      "task-with-open-part-of-child-becomes-outcome": {
        pattern: "tasks-with-open-part-of-child",
        when: { op: "null", field: "change_type" },
        priority: 0,
        actions: [
          { verb: "retype", to: "outcome" },
          { verb: "set", field: "auto_outcome", to: true },
        ],
        partial: true,
      },
    },
    patterns: {
      "tasks-with-open-part-of-child": {
        find: { nodeType: ["task"], fields: { status: { eq: "open" } } },
        exclude: [],
        edgeSteps: [
          {
            direction: "children", mustExist: true, edgeType: ["PART_OF"],
            nodeType: ["task", "outcome"], fields: { status: { not: { eq: "done" } } },
          },
        ],
      },
    },
    fieldMarkers: {},
    dropped: {},
  },
};

const PROMOTION_VIEW = { id: "this-week", path: "this_week.md" };

describe("2. THE HEADLINE — he indents a task under a task, and sees the parent become an outcome", () => {
  let page, elements;

  // NEITHER LINE CARRIES AN EXPLICIT #task TAG, THE OPERATOR'S OWN IDIOMATIC STYLE
  // (tests/app-rules-stamp.test.mjs's own headline capture is bare too) — and load-bearing here:
  // `renderRuleEffects` refuses to retype a line that already carries a DIFFERENT token from the
  // SAME family (`conflicting-token-present`, rules.ts), so a line explicitly tagged `#task` would
  // correctly abstain rather than paint "#outcome" beside a tag the operator typed that still says
  // otherwise. See section 3 below for that abstention proven directly.
  const PARENT_TYPED = "## Capture\n";
  const AFTER_PARENT = "## Capture\n- [ ] Ship the launch note\n";
  const AFTER_CHILD = "## Capture\n- [ ] Ship the launch note\n    - [ ] Draft the copy\n";

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = echoStub(PROMOTION_VIEW);
    page = await importPage(makeWorkDir("predict-headline-promotion"));
    page.__applyPresentation(PROMOTION_DECLARATION);
    page.__setGraphData({ snapshot: { generated_at: "2026-08-04T00:00:00Z", views: [], graph: { nodes: [], edges: [] } } });
  });

  test("OBSERVED ON THIS BRANCH: the parent's own row is armed, the CHILD's row is not", async () => {
    await page.commitLine(PROMOTION_VIEW, {
      lineIndex: 1, text: "- [ ] Ship the launch note", markdown: AFTER_PARENT, source: PARENT_TYPED, kind: "insert-line",
    });
    const write = page.commitLine(PROMOTION_VIEW, {
      lineIndex: 2, text: "    - [ ] Draft the copy", markdown: AFTER_CHILD, source: AFTER_PARENT, kind: "insert-line",
    });
    const instruction = page.__predict().take(AFTER_CHILD, PROMOTION_VIEW.id);
    assert.notEqual(instruction, null);
    assert.deepEqual(instruction.predictions, [{ lineIndex: 1, text: "#outcome" }], "the PARENT's row (1), never the committed child's row (2)");
    await write;
  });

  test("OBSERVED ON THIS BRANCH: painted — the chip lands on the parent row, and the committed row carries none", async () => {
    await page.commitLine(PROMOTION_VIEW, {
      lineIndex: 1, text: "- [ ] Ship the launch note", markdown: AFTER_PARENT, source: PARENT_TYPED, kind: "insert-line",
    });
    const write = page.commitLine(PROMOTION_VIEW, {
      lineIndex: 2, text: "    - [ ] Draft the copy", markdown: AFTER_CHILD, source: AFTER_PARENT, kind: "insert-line",
    });
    paint(page, PROMOTION_VIEW, AFTER_CHILD);

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

  test("`.markdown`/`.text` are never assigned by armPrediction/childPredictionFor/parentPredictionFor — the positive grep", () => {
    const APP_SOURCE = readFileSync(resolve(HERE, "..", "app", "index.html"), "utf8");
    const start = APP_SOURCE.indexOf("function childPredictionFor(");
    const end = APP_SOURCE.indexOf("function armPrediction(") + APP_SOURCE.slice(APP_SOURCE.indexOf("function armPrediction(")).indexOf("\n}\n") + 3;
    assert.ok(start > 0 && end > start, "could not locate this leg's own block in app/index.html");
    const block = APP_SOURCE.slice(start, end);
    assert.doesNotMatch(block, /\.markdown\s*=(?!=)/, "the predict block must not assign .markdown");
    assert.doesNotMatch(block, /\.text\s*=(?!=)/, "the predict block must not assign .text");
    assert.doesNotMatch(block, /\bonLineCommit\b|\bonCheckboxToggle\b/, "the predict block must never reach a write callback");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7. MUTATION PROOFS
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("7. MUTATION PROOFS — this leg's own tests are not vacuously green", () => {
  test("MUTATION: skip armPrediction entirely — the headline scenario 1 goes red", async () => {
    const workDir = makeWorkDir("predict-mutation-skip-arm");
    const mutate = (source) =>
      assertMutated(source, "armPrediction(view, commit, rulesReading, parentReading);", "/* armPrediction skipped */");
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
    const mutate = (source) =>
      assertMutated(
        source,
        "const delta = rulesReading.text.slice(line.length).trim();",
        "const delta = rulesReading.text;",
      );
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
    const workDir = makeWorkDir("predict-mutation-no-retype-filter");
    const mutate = (source) =>
      assertMutated(
        source,
        "const retypes = parentReading.applied.filter((effect) => effect.verb === \"retype\");",
        "const retypes = parentReading.applied;",
      );
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

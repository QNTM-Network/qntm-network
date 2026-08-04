/**
 * THE HEADLINE TEST — the operator's own acceptance criterion, in his own words: "He types a task.
 * He indents another task beneath it. The parent becomes an `outcome` and gets `auto_outcome: true`
 * — immediately, in the browser, on commit." And its `#waiting-for` sibling. Driven through
 * `app/index.html`'s real `commitLine`, the same entry point every real keystroke reaches — never a
 * hand-rolled reimplementation of the wiring.
 *
 *   node --test tests/app-parent-promotion.test.mjs
 *
 * ── WHAT CLOSES HERE, AND WHAT DOES NOT ──
 *
 * `presentation.json`'s `rules` key publishes rules whose `for_each` pattern carries a one-hop
 * `children:` edge-existence test. `rulesReadingFor` (app/index.html) can only ever evaluate the
 * committed line's OWN fields, so it abstains on every one of them
 * (`rule-pattern-needs-graph-traversal`) — proven directly in section 6 below, the "fails on main"
 * half of this file's own proof. `parentPromotionFor` (also app/index.html, wired for the first
 * time this leg, backed by the new PURE module `app/present/graphmatch.ts`) is what answers the
 * SAME question for the STRUCTURAL PARENT of a fresh, indented capture — a candidate that may
 * already have a real graph id, or may be a fresh, not-yet-minted capture itself.
 *
 * WHAT DOES NOT SHIP: the parent row's own CHARACTERS are never rewritten. `#parentBadge` and the
 * freshness line say what the graph-aware pass decided; the write that actually retypes the parent
 * is the engine's own next cycle, same as it always has been. See `app/index.html`'s own PARENT
 * PROMOTION block header for the full argument — the same write-path invariant seven other test
 * files already pin (`.markdown` is never assigned in app/) holds here too, and section 5 below
 * proves it directly for this feature.
 *
 * Six sections:
 *
 *   1. THE HEADLINE — a task, indented beneath another task NEITHER of which has a graph id yet
 *      (the literal scenario: type, then indent, before any round trip) — the parent decides
 *      `outcome`/`auto_outcome: true` the instant the child commits.
 *   2. THE SAME, FOR AN EXISTING PARENT — the parent already carries a `[[qntm:N]]` stamp and a
 *      real graph id; its fields come from the graph, never re-derived from the line.
 *   3. THE WAITING-FOR ARM — an open `#waiting-for` child promotes its parent the same way, via a
 *      DIFFERENT edge type this app does not learn from the wire (see `WAITING_FOR_TAG_BINDING`'s
 *      own comment).
 *   4. HABIT WINS OVER OUTCOME — an existing qualifying child PLUS a freshly-indented `#routine`
 *      child: the parent becomes `habit`, never `outcome`, in the SAME commit.
 *   5. THE WRITE PATH IS UNTOUCHED — the posted body for the child's own commit carries nothing
 *      about the parent; `.markdown` is never reassigned.
 *   6. ABSTAINS VISIBLY — a parent that carries a stamp naming a graph id NOT in the current
 *      snapshot (an id that does not exist, from this app's point of view) abstains rather than
 *      guessing; and PROVEN AGAINST WHAT `main` DOES TODAY, `rulesReadingFor` itself abstains
 *      `rule-pattern-needs-graph-traversal` for the very rule this whole file exists to answer.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

import { importPage, installBrowser, makeWorkDir } from "./fixtures/app-html-page.mjs";

const WORK = makeWorkDir("app-parent-promotion");

// ── A HAND-BUILT DECLARATION, SHAPED LIKE THE OPERATOR'S REAL ONE ──────────────────────────────
//
// Mirrors `presentation.json`'s real `tasks-with-open-part-of-child`/`tasks-with-open-waiting-for-
// child` patterns EXACTLY in STRUCTURE (a `mustExist: true` step admitting an open non-note child,
// a `mustExist: false` step excluding a routine child) — a smaller `nodeType` list than the real
// 35-type enumeration, because this file proves the MECHANISM, not that one list. Also carries the
// routine/habit pair (`tasks-with-routine-child-becomes-habit`/`outcomes-with-routine-child-
// becomes-habit`) in the SAME relative order the real declaration publishes them (outcome-
// promoting rules before habit-promoting ones), because section 4's proof depends on that order,
// not on anything special-cased in `graphmatch.ts` itself.
const DECLARATION = {
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
    registration: {},
    lineGrammars: {},
    ordering: {},
    orderingFields: {},
    dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
    chromeShapes: {},
    sectionRegistration: {},
    defaultOrdering: [],
    priorityRank: {},
    dropped: {},
  },
  structural: {
    indent: { edgeType: "PART_OF", edgeSource: "self" },
    edgeCardinality: { PART_OF: "many_to_one", WAITING_FOR: "many_to_many" },
    sections: {},
    dropped: {},
  },
  rules: {
    order: {
      established: true,
      sequence: [
        "task-with-open-part-of-child-becomes-outcome",
        "task-with-open-waiting-for-child-becomes-outcome",
        "task-with-routine-child-becomes-habit",
        "outcome-with-routine-child-becomes-habit",
      ],
    },
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
      "task-with-open-waiting-for-child-becomes-outcome": {
        pattern: "tasks-with-open-waiting-for-child",
        when: { op: "null", field: "change_type" },
        priority: 0,
        actions: [
          { verb: "retype", to: "outcome" },
          { verb: "set", field: "auto_outcome", to: true },
        ],
        partial: true,
      },
      "task-with-routine-child-becomes-habit": {
        pattern: "tasks-with-routine-child",
        when: { op: "null", field: "cadence" },
        priority: 0,
        actions: [
          { verb: "retype", to: "habit" },
          { verb: "set", field: "auto_habit", to: true },
        ],
        partial: true,
      },
      "outcome-with-routine-child-becomes-habit": {
        pattern: "outcomes-with-routine-child",
        when: { op: "null", field: "cadence" },
        priority: 0,
        actions: [
          { verb: "retype", to: "habit" },
          { verb: "set", field: "auto_habit", to: true },
          { verb: "unset", field: "auto_outcome" },
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
            direction: "children",
            mustExist: true,
            edgeType: ["PART_OF"],
            nodeType: ["task", "outcome"],
            fields: { status: { not: { eq: "done" } } },
          },
          { direction: "children", mustExist: false, edgeType: ["PART_OF"], nodeType: ["routine"], fields: {} },
        ],
      },
      "tasks-with-open-waiting-for-child": {
        find: { nodeType: ["task"], fields: { status: { eq: "open" } } },
        exclude: [],
        edgeSteps: [
          {
            direction: "children",
            mustExist: true,
            edgeType: ["WAITING_FOR"],
            nodeType: ["task", "outcome"],
            fields: { status: { not: { eq: "done" } } },
          },
          { direction: "children", mustExist: false, edgeType: ["PART_OF"], nodeType: ["routine"], fields: {} },
        ],
      },
      "tasks-with-routine-child": {
        find: { nodeType: ["task"], fields: {} },
        exclude: [],
        edgeSteps: [{ direction: "children", mustExist: true, edgeType: ["PART_OF"], nodeType: ["routine"], fields: {} }],
      },
      "outcomes-with-routine-child": {
        find: { nodeType: ["outcome"], fields: {} },
        exclude: [],
        edgeSteps: [{ direction: "children", mustExist: true, edgeType: ["PART_OF"], nodeType: ["routine"], fields: {} }],
      },
    },
    fieldMarkers: {},
    dropped: {},
  },
};

const VIEW = { id: "this-week", path: "this_week.md" };

/** Answers a POST exactly like the real Worker's synchronous (non-`ack`) shape — `snapshot.views`
 * carries the posted markdown back, the same echo `app-generality-acceptance.test.mjs`'s own
 * `postStub` uses, so `arrive`'s own "did the write land" check is satisfied and nothing later
 * overwrites the freshness line this file asserts against. */
function postStub() {
  const posted = [];
  const fetchImpl = async (url, init) => {
    if (init?.method !== "GET") {
      const body = JSON.parse(init.body);
      posted.push({ url, body });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handle: "luke",
          pending_edits: 0,
          snapshot: { generated_at: "2026-08-04T12:00:00Z", views: [{ ...VIEW, markdown: body.markdown }] },
        }),
      };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  };
  fetchImpl.posted = posted;
  return fetchImpl;
}

/** A fresh page, the declaration applied directly (never a real fetch — `__applyPresentation` is
 * the same seam `app-rules-stamp.test.mjs` §3 already uses), and the graph seeded before any
 * `commitLine` call. */
async function freshPage(label, graph) {
  const { elements } = installBrowser();
  const fetchImpl = postStub();
  globalThis.fetch = fetchImpl;
  const page = await importPage(makeWorkDir(label));
  page.__applyPresentation(DECLARATION);
  page.__setGraphData({ snapshot: { generated_at: "2026-08-04T00:00:00Z", views: [], graph } });
  return { page, elements, posted: fetchImpl.posted };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE HEADLINE — neither line has a graph id yet: he types a task, then indents another
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. THE HEADLINE: a task, indented beneath a task neither of which has a graph id yet", () => {
  let page, elements, posted;

  before(async () => {
    ({ page, elements, posted } = await freshPage("parent-promotion-headline", { nodes: [], edges: [] }));
  });

  const PARENT_TYPED = "## Capture\n";
  const AFTER_PARENT = "## Capture\n- [ ] Ship the launch note #task\n";
  const AFTER_CHILD = "## Capture\n- [ ] Ship the launch note #task\n    - [ ] Draft the copy #task\n";

  test("typing the PARENT alone decides nothing about itself — it has no structural parent of its own", async () => {
    const write = page.commitLine(VIEW, {
      lineIndex: 1,
      text: "- [ ] Ship the launch note #task",
      markdown: AFTER_PARENT,
      source: PARENT_TYPED,
      kind: "insert-line",
    });
    // `updateParentBadge` returns WITHOUT touching the DOM at all for "not-evaluated" — the same
    // silence `updateRulesBadge` already gives a "set-line" commit — so the element may never have
    // been created; either "never touched" or "touched with empty text" both mean the same thing:
    // nothing to say about a root-level line.
    assert.ok(!elements.get("parentBadge")?.textContent, "a root-level line has no parent row to decide about");
    await write;
  });

  test("indenting a CHILD beneath it promotes the parent to outcome, auto_outcome true — immediately, on commit", async () => {
    const write = page.commitLine(VIEW, {
      lineIndex: 2,
      text: "    - [ ] Draft the copy #task",
      markdown: AFTER_CHILD,
      source: AFTER_PARENT,
      kind: "insert-line",
    });
    // READ BESIDE "syncing…" — before the `await` lets the stubbed write's answer land and
    // overwrite the freshness line, the same moment `app-rules-stamp.test.mjs` §1 reads its own
    // freshness assertion.
    const freshness = elements.get("freshness").textContent;
    assert.match(freshness, /^syncing…/, freshness);
    assert.match(freshness, /the row above becomes outcome, sets auto_outcome/, freshness);
    // "(partial — action(s) not modelled)" — the real published rule ALSO carries an `emit_event`
    // this closed grammar excludes (`presentation.json`'s own `partial: true`, mirrored in this
    // file's DECLARATION); the retype/set are still the real, correct, decided answer.
    assert.equal(elements.get("parentBadge").textContent, "parent: decided (partial — action(s) not modelled)");
    await write;
    assert.equal(posted.length, 2, "both commits above must have posted");
    // THE POSTED BODY FOR THE CHILD'S OWN COMMIT NAMES ONLY THE CHILD — see section 5 for the full
    // "nothing beyond what he typed" proof; this is the fast, local check for this scenario.
    assert.equal(posted[1].body.markdown, AFTER_CHILD);
  });

  test("THE PURE ANSWER ITSELF, driven directly: applied carries the retype AND the set, in order", () => {
    const reading = page.__parentPromotionFor(VIEW, {
      lineIndex: 2,
      text: "    - [ ] Draft the copy #task",
      markdown: AFTER_CHILD,
      source: AFTER_PARENT,
      kind: "insert-line",
    });
    assert.equal(reading.kind, "answer");
    assert.deepEqual(reading.applied, [
      { verb: "retype", ruleId: "task-with-open-part-of-child-becomes-outcome", to: "outcome" },
      { verb: "set", ruleId: "task-with-open-part-of-child-becomes-outcome", field: "auto_outcome", to: true },
    ]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE SAME, FOR AN EXISTING PARENT — a real graph id, fields from the graph, never the line
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. an EXISTING parent (a real [[qntm:N]] stamp, fields read from the graph) promotes the same way", () => {
  let page, elements;

  before(async () => {
    ({ page, elements } = await freshPage("parent-promotion-existing", {
      nodes: [{ id: "qntm:501", type: "task", fields: { status: "open" } }],
      edges: [],
    }));
  });

  const BEFORE = "## Capture\n- [ ] Ship the launch note [[qntm:501]] #task\n";
  const AFTER = "## Capture\n- [ ] Ship the launch note [[qntm:501]] #task\n    - [ ] Draft the copy #task\n";

  test("the STAMPED parent's OWN graph fields decide the match, not a re-derivation of its line", async () => {
    const write = page.commitLine(VIEW, {
      lineIndex: 2,
      text: "    - [ ] Draft the copy #task",
      markdown: AFTER,
      source: BEFORE,
      kind: "insert-line",
    });
    // READ BESIDE "syncing…", before the stubbed write's answer lands and overwrites it.
    assert.match(elements.get("freshness").textContent, /the row above becomes outcome, sets auto_outcome/);
    assert.equal(elements.get("parentBadge").textContent, "parent: decided (partial — action(s) not modelled)");
    await write;
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE WAITING-FOR ARM — the same promotion, via a DIFFERENT edge type
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. THE WAITING-FOR ARM: an open #waiting-for child promotes its parent the same way", () => {
  let page, elements;

  before(async () => {
    ({ page, elements } = await freshPage("parent-promotion-waiting-for", {
      nodes: [{ id: "qntm:502", type: "task", fields: { status: "open" } }],
      edges: [],
    }));
  });

  const BEFORE = "## Capture\n- [ ] Ship the launch note [[qntm:502]] #task\n";
  const AFTER = "## Capture\n- [ ] Ship the launch note [[qntm:502]] #task\n    - [ ] #waiting-for Vendor reply\n";

  test("a #waiting-for child (not a PART_OF one) still promotes the parent to outcome", async () => {
    const write = page.commitLine(VIEW, {
      lineIndex: 2,
      text: "    - [ ] #waiting-for Vendor reply",
      markdown: AFTER,
      source: BEFORE,
      kind: "insert-line",
    });
    // READ BESIDE "syncing…", before the stubbed write's answer lands and overwrites it.
    assert.equal(elements.get("parentBadge").textContent, "parent: decided (partial — action(s) not modelled)");
    assert.match(elements.get("freshness").textContent, /the row above becomes outcome, sets auto_outcome/);
    await write;
  });

  test("THE PURE ANSWER: the fired rule is the WAITING_FOR one specifically, not the PART_OF one", () => {
    const reading = page.__parentPromotionFor(VIEW, {
      lineIndex: 2,
      text: "    - [ ] #waiting-for Vendor reply",
      markdown: AFTER,
      source: BEFORE,
      kind: "insert-line",
    });
    assert.deepEqual(
      reading.applied.map((e) => e.ruleId),
      ["task-with-open-waiting-for-child-becomes-outcome", "task-with-open-waiting-for-child-becomes-outcome"],
    );
  });

  test("AN EXISTING WAITING_FOR EDGE ALONE (no prospective #waiting-for needed) already satisfies the pattern — proves the direction convention, not only the prospective-child path", async () => {
    // qntm:502 --WAITING_FOR--> qntm:503, matching WAITING_FOR_TAG_BINDING's own "position" source
    // convention (the PARENT is the edge's source). The line being committed here is an ORDINARY,
    // DONE task (no #waiting-for tag, and `[x]` so its OWN prospective PART_OF contribution cannot
    // independently satisfy the PART_OF-outcome rule's own "status not done" step) — isolating the
    // proof to the EXISTING WAITING_FOR edge alone. If `edgeSourceOf`'s WAITING_FOR convention were
    // wrong (source/target swapped), this existing edge would not be found as a "children"
    // neighbour of qntm:502 at all, and this test would fail.
    const graph = {
      nodes: [
        { id: "qntm:502", type: "task", fields: { status: "open" } },
        { id: "qntm:503", type: "task", fields: { status: "open" } },
      ],
      edges: [{ id: "e1", type: "WAITING_FOR", source: "qntm:502", target: "qntm:503", fields: {} }],
    };
    const localMarkdown = "## Capture\n- [ ] Ship the launch note [[qntm:502]] #task\n    - [x] Unrelated new step #task\n";
    const localSource = "## Capture\n- [ ] Ship the launch note [[qntm:502]] #task\n";
    // Re-seed a SEPARATE page instance with this scenario's own graph, rather than reusing the
    // outer `before()`'s (which carries no WAITING_FOR edge at all).
    const local = await freshPage("parent-promotion-waiting-for-existing-edge", graph);
    const reading = local.page.__parentPromotionFor(VIEW, {
      lineIndex: 2,
      text: "    - [x] Unrelated new step #task",
      markdown: localMarkdown,
      source: localSource,
      kind: "insert-line",
    });
    assert.equal(reading.kind, "answer");
    assert.deepEqual(
      reading.applied.map((e) => e.ruleId),
      ["task-with-open-waiting-for-child-becomes-outcome", "task-with-open-waiting-for-child-becomes-outcome"],
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. HABIT WINS OVER OUTCOME — the exclusion his config's own comments flag as fragile
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. HABIT WINS OVER OUTCOME: an existing qualifying child PLUS a freshly-indented #routine child", () => {
  let page, elements;

  before(async () => {
    ({ page, elements } = await freshPage("parent-promotion-habit-wins", {
      nodes: [
        { id: "qntm:700", type: "task", fields: { status: "open" } },
        { id: "qntm:701", type: "task", fields: { status: "open" } },
      ],
      // qntm:701 already PART_OF qntm:700 — on its own this would already satisfy the outcome
      // pattern's mustExist:true step.
      edges: [{ id: "e1", type: "PART_OF", source: "qntm:701", target: "qntm:700", fields: {} }],
    }));
  });

  const BEFORE = "## Capture\n- [ ] Umbrella task [[qntm:700]] #task\n";
  const AFTER = "## Capture\n- [ ] Umbrella task [[qntm:700]] #task\n    - [ ] Weekly review #routine\n";

  test("the parent becomes habit, NEVER outcome, in the same commit that indents the routine child", async () => {
    const write = page.commitLine(VIEW, {
      lineIndex: 2,
      text: "    - [ ] Weekly review #routine",
      markdown: AFTER,
      source: BEFORE,
      kind: "insert-line",
    });
    // READ BESIDE "syncing…", before the stubbed write's answer lands and overwrites it.
    const freshness = elements.get("freshness").textContent;
    assert.match(freshness, /the row above becomes habit, sets auto_habit/);
    assert.doesNotMatch(freshness, /becomes outcome/, "the routine child must block the outcome rule, not merely race it");
    await write;
  });

  test("THE PURE ANSWER: only the habit rule fires, and the outcome rule never appears in applied", () => {
    const reading = page.__parentPromotionFor(VIEW, {
      lineIndex: 2,
      text: "    - [ ] Weekly review #routine",
      markdown: AFTER,
      source: BEFORE,
      kind: "insert-line",
    });
    assert.deepEqual(
      reading.applied.map((e) => e.ruleId),
      ["task-with-routine-child-becomes-habit", "task-with-routine-child-becomes-habit"],
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE WRITE PATH IS UNTOUCHED
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. THE WRITE PATH IS UNTOUCHED — the posted body carries only what the operator typed on the committed line", () => {
  test("the posted markdown for the child's own commit is byte-identical to the commit's own markdown", async () => {
    const { page, posted } = await freshPage("parent-promotion-write-path", { nodes: [], edges: [] });
    const BEFORE = "## Capture\n- [ ] Ship the launch note #task\n";
    const AFTER = "## Capture\n- [ ] Ship the launch note #task\n    - [ ] Draft the copy #task\n";
    await page.commitLine(VIEW, {
      lineIndex: 1,
      text: "- [ ] Ship the launch note #task",
      markdown: AFTER.slice(0, "## Capture\n- [ ] Ship the launch note #task\n".length),
      source: BEFORE.slice(0, "## Capture\n".length),
      kind: "insert-line",
    });
    await page.commitLine(VIEW, {
      lineIndex: 2,
      text: "    - [ ] Draft the copy #task",
      markdown: AFTER,
      source: BEFORE,
      kind: "insert-line",
    });
    assert.equal(posted.length, 2);
    assert.equal(posted[1].body.markdown, AFTER, "the write must carry exactly the child's own commit, nothing about the parent");
    assert.doesNotMatch(JSON.stringify(posted[1].body), /outcome/, "no promotion vocabulary leaks into the POST body");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. ABSTAINS VISIBLY
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("6. ABSTAINS VISIBLY — an id that does not exist is refused, never guessed; and main's own gap, shown directly", () => {
  test("a parent stamp naming a graph id NOT in the current snapshot abstains 'parent-not-in-graph'", async () => {
    const { page, elements } = await freshPage("parent-promotion-abstain-missing-id", { nodes: [], edges: [] });
    const BEFORE = "## Capture\n- [ ] Ship the launch note [[qntm:999]] #task\n";
    const AFTER = "## Capture\n- [ ] Ship the launch note [[qntm:999]] #task\n    - [ ] Draft the copy #task\n";
    const write = page.commitLine(VIEW, {
      lineIndex: 2,
      text: "    - [ ] Draft the copy #task",
      markdown: AFTER,
      source: BEFORE,
      kind: "insert-line",
    });
    // READ BESIDE "syncing…", before the stubbed write's answer lands and overwrites the freshness
    // line — `#parentBadge` itself persists either way, but read both at the same honest moment.
    assert.equal(elements.get("parentBadge").textContent, "parent: abstained — parent-not-in-graph");
    assert.doesNotMatch(
      elements.get("freshness").textContent,
      /becomes outcome/,
      "an id this app cannot find must never be guessed into a promotion",
    );
    await write;
  });

  test("THE GAP THIS FILE CLOSES, SHOWN DIRECTLY: rulesReadingFor itself abstains on the SAME rule for the CHILD's own line", async () => {
    // `rulesReadingFor` only ever evaluates the COMMITTED line's own fields — it has no graph, and
    // its own pattern (`tasks-with-open-part-of-child`) carries a one-hop edge step, so it must
    // abstain `rule-pattern-needs-graph-traversal`. This is the exact abstention `parentPromotionFor`
    // exists to answer for a DIFFERENT row (the parent) — proof the two are answering genuinely
    // different questions, not duplicating one another.
    const { page } = await freshPage("parent-promotion-shows-the-gap", { nodes: [], edges: [] });
    const BEFORE = "## Capture\n- [ ] Ship the launch note #task\n";
    const AFTER = "## Capture\n- [ ] Ship the launch note #task\n    - [ ] Draft the copy #task\n";
    const CHILD_COMMIT = {
      lineIndex: 2,
      text: "    - [ ] Draft the copy #task",
      markdown: AFTER,
      source: BEFORE,
      kind: "insert-line",
    };
    const rulesReading = page.__rulesReadingFor(VIEW, CHILD_COMMIT);
    assert.equal(rulesReading.kind, "abstains");
    assert.equal(rulesReading.because, "rule-pattern-needs-graph-traversal");
    // AND YET `parentPromotionFor`, asked the SAME question about the PARENT, answers.
    const parentReading = page.__parentPromotionFor(VIEW, CHILD_COMMIT);
    assert.equal(parentReading.kind, "answer");
    assert.ok(parentReading.applied.length > 0);
  });
});

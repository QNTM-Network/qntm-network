/**
 * THE GRAPH-AWARE MATCHER, PROVEN DIRECTLY — `app/present/graphmatch.ts`'s own two exports,
 * `matchesQualifierGraphAware` and `applyGraphAwareRules`, against hand-built fixtures. No monorepo
 * checkout needed (unlike `present-rules.test.mjs`'s §3/§4) — every fixture here is invented, small,
 * and runs unconditionally in CI.
 *
 *   node --test tests/present-graphmatch.test.mjs
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `present-rules.test.mjs`. `applyRules` (rules.ts) and
 * `applyGraphAwareRules` (graphmatch.ts) share the same one-pass, priority-ordered walk model, but
 * they are different functions answering different questions — one for the committed line's own
 * fields, one for an EXTERNAL candidate (a structural parent) against a graph passed in. This file
 * is scoped to the second one, and to `matchesQualifierGraphAware`, the qualifier-level function
 * underneath it that `membership.ts`'s own `matchesQualifier` deliberately does NOT grow into (see
 * that function's own header, and `graphmatch.ts`'s).
 *
 * Two describe blocks:
 *
 *   1. `matchesQualifierGraphAware` — the qualifier-level function, proven against one hand-built
 *      pattern shaped like the operator's real `tasks-with-open-part-of-child` (a `mustExist: true`
 *      step admitting an open non-note child, plus a `mustExist: false` step excluding a routine
 *      child — the `habit-wins-over-outcome` exclusion, modelled as data rather than special-cased
 *      in code).
 *   2. `applyGraphAwareRules` — the whole-pass function, proven against two rules in ONE published
 *      order (outcome-promotion, then habit-promotion) — the same order the operator's real
 *      `presentation.json` publishes them in — showing the exclusion emerges from the pattern's own
 *      shape and the pass's own order, with no rule-specific code anywhere in `graphmatch.ts`.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { matchesQualifierGraphAware, applyGraphAwareRules } from "../dist/present.js";

const graph = (nodes, edges) => ({ nodes, edges });

/** Mirrors the SHAPE of the operator's real `tasks-with-open-part-of-child` pattern (measured off
 * the shipped `presentation.json`, §"Where things stand" of this leg's own brief) — a smaller
 * `nodeType` list than the real 35-type enumeration (this file does not need the real list to prove
 * the mechanism), but the SAME two-step structure: an open non-routine child admits, a routine child
 * excludes. */
const TASK_OPEN_CHILD_QUALIFIER = {
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
    {
      direction: "children",
      mustExist: false,
      edgeType: ["PART_OF"],
      nodeType: ["routine"],
      fields: {},
    },
  ],
};

/** `PART_OF`: the indented line is the edge's own source (mirrors `structural.indent.edgeSource ===
 * "self"`, published, real). `WAITING_FOR`: the parent/positional slot is the source (this app's one
 * known, explicitly limited exception — see `app/index.html`'s own `WAITING_FOR_TAG_BINDING`). Any
 * other edge type is honestly unknown. */
const edgeSourceOf = (edgeType) =>
  edgeType === "PART_OF" ? "self" : edgeType === "WAITING_FOR" ? "position" : undefined;

describe("matchesQualifierGraphAware", () => {
  test("with no edgeSteps at all, behaves exactly like a fields-only qualifier match", () => {
    const q = { find: { nodeType: ["task"], fields: {} }, exclude: [] };
    assert.equal(
      matchesQualifierGraphAware({ node_type: "task" }, "p1", q, graph([], []), edgeSourceOf, undefined),
      true,
    );
    assert.equal(
      matchesQualifierGraphAware({ node_type: "outcome" }, "p1", q, graph([], []), edgeSourceOf, undefined),
      false,
    );
  });

  test("find/exclude refuse BEFORE any edgeStep is even reached — a done task never consults the graph", () => {
    // If this function reached the edgeSteps for a `status: done` candidate it would have to
    // resolve `edgeSourceOf` for PART_OF even though the empty graph below carries nothing for it —
    // it does not, because `find` alone already refuses.
    const ok = matchesQualifierGraphAware(
      { node_type: "task", status: "done" },
      "p1",
      TASK_OPEN_CHILD_QUALIFIER,
      graph([], []),
      edgeSourceOf,
      undefined,
    );
    assert.equal(ok, false);
  });

  test("mustExist:true satisfied by an EXISTING graph child alone, no prospective child needed", () => {
    const g = graph(
      [
        { id: "p1", type: "task", fields: { status: "open" } },
        { id: "c1", type: "task", fields: { status: "open" } },
      ],
      [{ id: "e1", type: "PART_OF", source: "c1", target: "p1", fields: {} }],
    );
    const ok = matchesQualifierGraphAware(
      { node_type: "task", status: "open" },
      "p1",
      TASK_OPEN_CHILD_QUALIFIER,
      g,
      edgeSourceOf,
      undefined,
    );
    assert.equal(ok, true);
  });

  test("mustExist:true satisfied by the PROSPECTIVE child ALONE — the parent has no existing graph edges at all", () => {
    const g = graph([{ id: "p1", type: "task", fields: { status: "open" } }], []);
    const prospective = { edgeType: "PART_OF", fields: { node_type: "task", status: "open" } };
    const ok = matchesQualifierGraphAware(
      { node_type: "task", status: "open" },
      "p1",
      TASK_OPEN_CHILD_QUALIFIER,
      g,
      edgeSourceOf,
      prospective,
    );
    assert.equal(ok, true);
  });

  test("THE PARENT HAS NO ID YET (candidateId null) — decided from the prospective child alone, never guessed", () => {
    // Nothing in `graph` names this candidate at all — it has not been minted. No real edge will
    // ever equal a `null` id, so this is decided the same way a not-yet-existing node's zero
    // existing edges always would be: correctly, with no special case.
    const g = graph([], []);
    const prospective = { edgeType: "PART_OF", fields: { node_type: "task", status: "open" } };
    const ok = matchesQualifierGraphAware(
      { node_type: "task", status: "open" },
      null,
      TASK_OPEN_CHILD_QUALIFIER,
      g,
      edgeSourceOf,
      prospective,
    );
    assert.equal(ok, true);
  });

  test("A candidate with no structural parent id and NO prospective child either — mustExist:true fails, not undecidable", () => {
    // A real, confident "no" — there is nothing this candidate could possibly have as a child, so
    // this is decidable, not an abstention.
    const ok = matchesQualifierGraphAware(
      { node_type: "task", status: "open" },
      null,
      TASK_OPEN_CHILD_QUALIFIER,
      graph([], []),
      edgeSourceOf,
      undefined,
    );
    assert.equal(ok, false);
  });

  test("HABIT-WINS-OVER-OUTCOME: a qualifying open child AND a routine child — the routine child blocks the match", () => {
    const g = graph(
      [
        { id: "p1", type: "task", fields: { status: "open" } },
        { id: "c1", type: "task", fields: { status: "open" } },
        { id: "r1", type: "routine", fields: {} },
      ],
      [
        { id: "e1", type: "PART_OF", source: "c1", target: "p1", fields: {} },
        { id: "e2", type: "PART_OF", source: "r1", target: "p1", fields: {} },
      ],
    );
    const ok = matchesQualifierGraphAware(
      { node_type: "task", status: "open" },
      "p1",
      TASK_OPEN_CHILD_QUALIFIER,
      g,
      edgeSourceOf,
      undefined,
    );
    assert.equal(ok, false, "a routine child must block the outcome pattern even though c1 qualifies on its own");
  });

  test("UNKNOWN EDGE-SOURCE CONVENTION: an edge type edgeSourceOf cannot place makes the step undecidable, never guessed", () => {
    const g = graph(
      [
        { id: "p1", type: "task", fields: { status: "open" } },
        { id: "c1", type: "task", fields: { status: "open" } },
      ],
      [{ id: "e1", type: "PART_OF", source: "c1", target: "p1", fields: {} }],
    );
    const unknownSourceOf = () => undefined;
    const ok = matchesQualifierGraphAware(
      { node_type: "task", status: "open" },
      "p1",
      TASK_OPEN_CHILD_QUALIFIER,
      g,
      unknownSourceOf,
      undefined,
    );
    assert.equal(ok, undefined);
  });

  test("A DANGLING NEIGHBOUR (edge names an id absent from `graph.nodes`) is undecidable, not silently skipped", () => {
    // Skipping it would UNDER-count a mustExist:false step's own neighbours — a routine child this
    // app cannot see is not the same fact as "no routine child" — so this must refuse, not answer.
    const g = graph(
      [{ id: "p1", type: "task", fields: { status: "open" } }],
      [{ id: "e1", type: "PART_OF", source: "ghost", target: "p1", fields: {} }],
    );
    const ok = matchesQualifierGraphAware(
      { node_type: "task", status: "open" },
      "p1",
      TASK_OPEN_CHILD_QUALIFIER,
      g,
      edgeSourceOf,
      undefined,
    );
    assert.equal(ok, undefined);
  });

  test("direction: parents is the mirror of direction: children — proven with a WAITING_FOR (position-sourced) edge", () => {
    // p1 --WAITING_FOR--> c1 (parent is the edge's own source, per edgeSourceOf's WAITING_FOR
    // convention). Asking "does c1 have a PARENT waiting on it" is a `direction: parents` step.
    const q = {
      find: { nodeType: ["task"], fields: {} },
      exclude: [],
      edgeSteps: [
        { direction: "parents", mustExist: true, edgeType: ["WAITING_FOR"], nodeType: null, fields: {} },
      ],
    };
    const g = graph(
      [
        { id: "p1", type: "task", fields: {} },
        { id: "c1", type: "task", fields: {} },
      ],
      [{ id: "e1", type: "WAITING_FOR", source: "p1", target: "c1", fields: {} }],
    );
    assert.equal(matchesQualifierGraphAware({ node_type: "task" }, "c1", q, g, edgeSourceOf, undefined), true);
    assert.equal(matchesQualifierGraphAware({ node_type: "task" }, "p1", q, g, edgeSourceOf, undefined), false);
  });
});

describe("applyGraphAwareRules — one pass, the SAME order model applyRules (rules.ts) uses", () => {
  // Mirrors the SHAPE of the operator's real published order — the outcome-promoting rule's own
  // pattern already excludes a routine child (its own second edgeStep), and the habit-promoting
  // rule comes LATER in `order` — so the exclusion needs no special code, only that shape and that
  // order, exactly as `presentation.json` itself publishes them.
  const LANGUAGE = {
    orderEstablished: true,
    order: ["promote-outcome", "promote-habit"],
    rules: {
      "promote-outcome": {
        pattern: "task-open-child",
        when: { op: "true" },
        priority: 0,
        actions: [
          { verb: "retype", to: "outcome" },
          { verb: "set", field: "auto_outcome", to: true },
        ],
      },
      "promote-habit": {
        pattern: "task-routine-child",
        when: { op: "true" },
        priority: 0,
        actions: [
          { verb: "retype", to: "habit" },
          { verb: "set", field: "auto_habit", to: true },
        ],
      },
    },
    patterns: {
      "task-open-child": TASK_OPEN_CHILD_QUALIFIER,
      "task-routine-child": {
        find: { nodeType: ["task"], fields: {} },
        exclude: [],
        edgeSteps: [
          { direction: "children", mustExist: true, edgeType: ["PART_OF"], nodeType: ["routine"], fields: {} },
        ],
      },
    },
    fieldMarkers: {},
    dropped: {},
  };

  test("THE HEADLINE SHAPE: a task with one open task child becomes outcome, auto_outcome true", () => {
    const g = graph([{ id: "p1", type: "task", fields: { status: "open" } }], []);
    const prospective = { edgeType: "PART_OF", fields: { node_type: "task", status: "open" } };
    const pass = applyGraphAwareRules(
      { node_type: "task", status: "open" },
      "p1",
      LANGUAGE,
      g,
      edgeSourceOf,
      prospective,
      undefined,
    );
    assert.deepEqual(pass.applied, [
      { verb: "retype", ruleId: "promote-outcome", to: "outcome" },
      { verb: "set", ruleId: "promote-outcome", field: "auto_outcome", to: true },
    ]);
    assert.equal(pass.fields.node_type, "outcome");
    assert.equal(pass.fields.auto_outcome, true);
    assert.deepEqual(pass.undecidable, []);
  });

  test("HABIT WINS, IN THE SAME PASS: an existing qualifying child PLUS an existing routine child — outcome never fires, habit does", () => {
    const g = graph(
      [
        { id: "p1", type: "task", fields: { status: "open" } },
        { id: "c1", type: "task", fields: { status: "open" } },
        { id: "r1", type: "routine", fields: {} },
      ],
      [
        { id: "e1", type: "PART_OF", source: "c1", target: "p1", fields: {} },
        { id: "e2", type: "PART_OF", source: "r1", target: "p1", fields: {} },
      ],
    );
    const pass = applyGraphAwareRules(
      { node_type: "task", status: "open" },
      "p1",
      LANGUAGE,
      g,
      edgeSourceOf,
      undefined,
      undefined,
    );
    assert.deepEqual(pass.applied, [
      { verb: "retype", ruleId: "promote-habit", to: "habit" },
      { verb: "set", ruleId: "promote-habit", field: "auto_habit", to: true },
    ]);
    assert.equal(pass.fields.node_type, "habit", "must never have become outcome first");
  });

  test("UNDECIDABLE: an unknown edge-source convention marks BOTH affected rules undecidable, without crashing the pass", () => {
    const g = graph(
      [
        { id: "p1", type: "task", fields: { status: "open" } },
        { id: "c1", type: "task", fields: { status: "open" } },
      ],
      [{ id: "e1", type: "PART_OF", source: "c1", target: "p1", fields: {} }],
    );
    const unknownSourceOf = () => undefined;
    const pass = applyGraphAwareRules(
      { node_type: "task", status: "open" },
      "p1",
      LANGUAGE,
      g,
      unknownSourceOf,
      undefined,
      undefined,
    );
    assert.deepEqual(pass.applied, []);
    assert.deepEqual([...pass.undecidable].sort(), ["promote-habit", "promote-outcome"]);
  });

  test("A candidate that already qualifies for neither rule (no children at all) answers 'nothing applies', not undecidable", () => {
    const g = graph([{ id: "p1", type: "task", fields: { status: "open" } }], []);
    const pass = applyGraphAwareRules(
      { node_type: "task", status: "open" },
      "p1",
      LANGUAGE,
      g,
      edgeSourceOf,
      undefined,
      undefined,
    );
    assert.deepEqual(pass.applied, []);
    assert.deepEqual(pass.undecidable, []);
    assert.equal(pass.fields.node_type, "task");
  });
});

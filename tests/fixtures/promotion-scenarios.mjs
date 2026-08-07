/**
 * THE ONE CANONICAL SHAPE OF "THE OPERATOR INDENTS A TASK UNDER A TASK" — shared by the resolver
 * test (`tests/app-parent-promotion-on-indent.test.mjs`, which proves `promotionSpec.read()`/`say()`
 * decide correctly) and the wiring test (`tests/app-predict-wiring.test.mjs`, which proves the SAME
 * decision reaches `#viewBody` as a paintable chip through the real `commitLine` → `arm()` →
 * `armPredict` → paint path).
 *
 * ── WHY THIS FILE EXISTS (2026-08-07) ──
 *
 * It did not exist before today, and that absence is the mechanism that let a real defect ship:
 * `app-parent-promotion-on-indent.test.mjs` proved the resolver right using a `#task`-tagged parent
 * line, but never called `.arm()`. `app-predict-wiring.test.mjs` DID call `.arm()`, through the real
 * page, but its own fixture comment said outright that it used BARE (untagged) lines "because a
 * tagged line would hit `conflicting-token-present`" — the exact abstention this leg's fix closes.
 * Two files, two different opinions about what "a task line" looks like, and the one opinion that
 * would have caught the bug (a tagged parent line, driven all the way to paint) was never taken.
 *
 * This module is the fix for THAT — one markdown shape, one declaration, imported by both files, so
 * a future change to "what a real task line looks like" cannot drift between them silently again.
 *
 * ── TWO VARIANTS, BOTH REAL ──
 *
 * `BARE_*` — the operator's other own idiomatic style: no explicit `#task` tag, the default node
 * type of the section. Still exercised, still real, kept for continuity with what
 * `app-predict-wiring.test.mjs` already proved before this leg.
 *
 * `TAGGED_*` — the operator's OTHER commonest gesture, and the one this leg exists for: a line
 * carrying its own `#task` tag explicitly, same family (`node_type`) the promotion rule's `retype`
 * effect targets. This is the shape `tests/app-parent-promotion-on-indent.test.mjs`'s own `SOURCE`
 * already used for the resolver half; it is now also driven through `arm()`/paint here.
 */

export const PROMOTION_DECLARATION = {
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
            direction: "children",
            mustExist: true,
            edgeType: ["PART_OF"],
            nodeType: ["task", "outcome"],
            fields: { status: { not: { eq: "done" } } },
          },
        ],
      },
    },
    fieldMarkers: {},
    dropped: {},
  },
};

export const PROMOTION_VIEW = { id: "this-week", path: "this_week.md" };

// ── BARE — no explicit #task tag, the section's own default node type. ──
export const BARE_PARENT_TYPED = "## Capture\n";
export const BARE_AFTER_PARENT = "## Capture\n- [ ] Ship the launch note\n";
export const BARE_AFTER_CHILD = "## Capture\n- [ ] Ship the launch note\n    - [ ] Draft the copy\n";

// ── TAGGED — an explicit #task on both lines, the shape that hits `conflicting-token-present` on
// the parent's own retype before this leg's fix. Mirrors `app-parent-promotion-on-indent.test.mjs`'s
// own `SOURCE` (`- [ ] Ship the launch note [[qntm:501]] #task`), minus the stamp — this scenario is
// a FRESH capture (both lines typed together, `insert-line` all the way), not a round-tripped node,
// so no `[[qntm:N]]` is needed to reach `conflicting-token-present`: the tag alone is what conflicts.
export const TAGGED_PARENT_TYPED = "## Capture\n";
export const TAGGED_AFTER_PARENT = "## Capture\n- [ ] Ship the launch note #task\n";
export const TAGGED_AFTER_CHILD = "## Capture\n- [ ] Ship the launch note #task\n    - [ ] Draft the copy #task\n";

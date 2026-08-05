/**
 * THE HEADLINE TEST — "he adds a line to his inbox... the 🆕 created-date stamp appears
 * immediately, instead of the engine adding it ten seconds later." `docs/implementation-
 * artifacts/roadmap-the-road-ahead.md` step 3's own `½`, widened to the whole category rather
 * than the two hand-picked rules it named: `presentation.json`'s `rules` key, read by ZERO call
 * sites before this file, through `app/index.html`'s own real `commitLine`.
 *
 *   node --test tests/app-rules-stamp.test.mjs
 *
 * ── WHAT "APPEARS IMMEDIATELY" MEANS HERE, STATED BEFORE THE TESTS THAT PROVE IT ──
 *
 * A predicted correction the write path could see does not exist until this file lands: the
 * instant a fresh capture commits, `#rulesBadge` reads `rules: decided` and the freshness line
 * names WHAT (`this line sets created_at`) — both computed from the real, published grammar, the
 * real published order, and the real day-boundary resolver (`todayFor`, never `Date.now()` read
 * raw). That is the whole of "immediately": before this change the operator learned NOTHING
 * about `stamp-created-at-on-task` until the cycle's own projection landed, ~10 s later; after it,
 * he learns it — and which rule, and what it decided — the moment his write leaves.
 *
 * ── THE ONE THING THIS FILE DOES NOT CLAIM, NAMED RATHER THAN LEFT FOR A REVIEWER TO FIND ──
 *
 * The `🆕` GLYPH ITSELF, painted into the row's own characters, is NOT what this change ships.
 * The first implementation did that — reassigning `commit.markdown` before the POST — and
 * `tests/app-membership-note.test.mjs`'s own `` `.markdown` is never ASSIGNED in app/ `` guard
 * (pinned in SEVEN OTHER files too) caught it: that invariant is "what he typed is what gets
 * saved," and a rules pass with a bug in it must never be able to quietly widen what a write
 * carries. Section 4 below asserts the posted body is BYTE-IDENTICAL to what `applyEdit` produced
 * — the direct, positive proof that this file's own feature does not touch it. See this file's
 * own PR description for what painting the glyph into the DOM (never the wire) would need.
 *
 * FIVE SECTIONS:
 *
 *   1. THE HEADLINE — a fresh capture under "Domain Empty" (the operator's own example section,
 *      real config, real declaration): `#rulesBadge` and the freshness line answer the instant
 *      the write leaves, naming `stamp-created-at-on-task`'s own decision — computed against the
 *      SAME day-boundary label the engine would write, never the system clock read raw.
 *   2. THE PUBLISHED ORDER, RESPECTED — a fresh capture under a ROUTINE-default section with no
 *      cadence: `routine-without-cadence-becomes-task` fires first (order position 10 of 17),
 *      retyping it to `task`; `stamp-created-at-on-task` (position 14) then matches the
 *      NOW-task candidate in the SAME pass and fires too — TWO rules named in the one note, real
 *      config, real order, proof this is one ordered pass over a mutating candidate, not
 *      seventeen independent checks against the original fields.
 *   3. ABSTAIN VISIBLY — a rule that matches and fires but whose effect this app cannot spell
 *      onto a line (no marker, no token family) is shown, through `#rulesBadge`, as
 *      `rules: abstained — rendering-unrenderable-effect`, never silence.
 *   4. THE POSTED BODY IS UNTOUCHED — the positive proof for the claim in this file's own header:
 *      `posted.body.markdown` is asserted BYTE-IDENTICAL to the `markdown` the commit itself
 *      carried, for the SAME headline capture section 1 drives.
 *   5. SCOPED TO A FRESH CAPTURE — an EXISTING line (already carrying a `[[qntm:N]]` stamp,
 *      `commit.kind === "set-line"`) never reaches the rules pass at all.
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
  withDeclaration,
  SERVED_DECLARATION,
} from "./fixtures/app-html-page.mjs";
import { todayFor, applyRules, readRulesDeclaration } from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = makeWorkDir("app-rules-stamp");

/** The day-boundary answer for RIGHT NOW, computed the SAME way the app must — the proof
 * standard that this is not a coincidence of one hand-picked date: whatever day this suite runs
 * on, this is the label the app is required to agree with. */
const TODAY = todayFor(Date.now(), SERVED_DECLARATION.resolution.dayBoundary);
assert.equal(TODAY.kind, "answer", "the real config's day boundary must resolve — fixture precondition");

/** The real, published rules language, read the SAME way `context.ts` reads it off the served
 * document — never `SERVED_DECLARATION.rules` directly, whose `order` is `{established,
 * sequence}`, not the flat array `applyRules` takes. */
const RULES_LANGUAGE = readRulesDeclaration(SERVED_DECLARATION).rules;

describe("1. THE HEADLINE — a fresh capture under Domain Empty is decided the instant it commits", () => {
  let page;
  let elements;
  let posted;

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = withDeclaration(async (url, init) => {
      const body = JSON.parse(init.body);
      posted = { url, body };
      return {
        ok: true,
        json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot: { generated_at: "2026-08-01T12:00:00Z", views: [] } }),
      };
    });
    page = await importPage(WORK);
    await page.loadPresentation();
  });

  const VIEW = { id: "inbox", path: "inbox.md" };
  // "## Inbox" (inbox-tagged, ordinal 0), "## Domain Empty" (ordinal 1) — the operator's own two
  // sections, exactly as `qualification.sectionOrder.inbox` (SERVED_DECLARATION) declares them.
  const BEFORE = "## Inbox\n## Domain Empty\n";
  const AFTER = "## Inbox\n## Domain Empty\n- [ ] Write the launch note\n";
  const CAPTURE = {
    lineIndex: 2,
    text: "- [ ] Write the launch note",
    markdown: AFTER,
    source: BEFORE,
    kind: "insert-line",
  };

  test("THE OPERATOR'S OWN SCENARIO: stamp-created-at-on-task is decided, and named, beside 'syncing…' — not 10s later", async () => {
    posted = null;
    const write = page.commitLine(VIEW, { ...CAPTURE });
    // READ BESIDE "syncing…" — the same moment `tests/app-ordering-note.test.mjs`'s own §2 reads,
    // before the `await` below lets the stubbed cycle answer land and overwrite the freshness line.
    const freshness = elements.get("freshness").textContent;
    assert.match(freshness, /^syncing…/, freshness);
    assert.match(freshness, /this line sets created_at/, freshness);
    assert.equal(elements.get("rulesBadge").textContent, "rules: decided");
    await write;
    assert.ok(posted, "the capture was never posted");
  });

  test("THE DATE NAMED IS THE DAY-BOUNDARY'S OWN LABEL — computed via todayFor, never the system clock read raw", () => {
    const reading = page.__rulesReadingFor(VIEW, { ...CAPTURE });
    assert.equal(reading.kind, "answer");
    assert.deepEqual(reading.applied, [{ verb: "set", ruleId: "stamp-created-at-on-task", field: "created_at", to: TODAY.answer.logicalDate }]);
  });
});

describe("2. THE PUBLISHED ORDER, RESPECTED — retype fires, then the retyped candidate is stamped, in one pass", () => {
  let page;
  let elements;

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = withDeclaration(async () => ({
      ok: true,
      json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot: { generated_at: "2026-08-01T12:00:00Z", views: [] } }),
    }));
    page = await importPage(WORK);
    await page.loadPresentation();
  });

  const VIEW = { id: "routines-personal", path: "routines.md" };
  const BEFORE = "## Personal Routines\n## Upcoming\n";
  const AFTER = "## Personal Routines\n- [ ] Water the garden\n## Upcoming\n";
  const CAPTURE = { lineIndex: 1, text: "- [ ] Water the garden", markdown: AFTER, source: BEFORE, kind: "insert-line" };

  test("a bare capture under a ROUTINE-default section with no cadence becomes a task AND is stamped, same pass", async () => {
    const reading = page.__rulesReadingFor(VIEW, { ...CAPTURE });
    assert.equal(reading.kind, "answer");
    // routine-without-cadence-becomes-task (order position 10) retypes it to `task` — the section
    // default (`routine`) is contradicted, not silently kept. stamp-created-at-on-task (position
    // 14) only matches a candidate whose node_type is ALREADY `task` — it could not have fired at
    // all here if the retype above had not already run, in the SAME pass, before it.
    assert.deepEqual(reading.applied, [
      { verb: "retype", ruleId: "routine-without-cadence-becomes-task", to: "task" },
      { verb: "set", ruleId: "stamp-created-at-on-task", field: "created_at", to: TODAY.answer.logicalDate },
    ]);

    globalThis.fetch = withDeclaration(async () => ({
      ok: true,
      json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot: { generated_at: "2026-08-01T12:00:00Z", views: [] } }),
    }));
    const write = page.commitLine(VIEW, { ...CAPTURE });
    // READ BESIDE "syncing…", before the `await` lets the stubbed cycle answer overwrite it.
    assert.match(elements.get("freshness").textContent, /becomes task, sets created_at/);
    await write;
  });

  test("MUTATION PROOF: the SAME candidate, with a cadence, is NOT retyped — the when clause, not just the pattern, gates the fire", () => {
    // A CONTROL over the exact fields the test above resolves — proof it is not vacuously true.
    // `cadence` is not a RESOLVABLE_FIELD (no vocabulary token sets it from a line's own text), so
    // a fresh capture can never carry a non-null one in practice; asserted here as a property of
    // `applyRules` itself, over a hand-built field set, against the REAL published order/rules/
    // patterns — not a second, hand-rolled grammar.
    const fields = { node_type: "routine", domain: "personal" };
    const withoutCadence = applyRules(fields, RULES_LANGUAGE, TODAY.answer);
    assert.deepEqual(
      withoutCadence.applied.map((e) => e.ruleId),
      ["routine-without-cadence-becomes-task", "stamp-created-at-on-task"],
    );
    const withCadence = applyRules({ ...fields, cadence: "7" }, RULES_LANGUAGE, TODAY.answer);
    // A cadence of "7" fires a DIFFERENT published rule (stamp-interval-days-7) — real, expected,
    // and proof this evaluator is not simply refusing every routine with any field set. What must
    // NOT be in this list is the retype: cadence present means `null(cadence)` is false.
    assert.ok(
      !withCadence.applied.some((e) => e.ruleId === "routine-without-cadence-becomes-task"),
      "a routine WITH a cadence must not be retyped",
    );
    assert.ok(
      !withCadence.applied.some((e) => e.ruleId === "stamp-created-at-on-task"),
      "without the retype, node_type stays routine, so stamp-created-at-on-task's own pattern (tasks) still does not match",
    );
  });
});

describe("3. ABSTAIN VISIBLY — a rule that fires but cannot be rendered says so, through #rulesBadge", () => {
  let page;
  let elements;

  // A hand-built declaration, one rule, whose `setsField` target has no published marker AND no
  // token family — the exact shape `rule-set field '<name>'` names in `rules.dropped` for real
  // (`interval_days`, measured against the operator's own config: no vocabulary/markers.yaml
  // entry at all). Invented here rather than reaching for the real fixture so the test does not
  // depend on which of his rules happens to be unspellable this month.
  const DECLARATION = {
    qualification: {
      defaultNodeType: "task",
      structuralNodeTypes: [],
      tokens: { node_type: { "#task": "task" }, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
      predicates: { "demo-open": { find: { nodeType: ["task"], fields: {} }, exclude: [] } },
      sections: { demo: { capture: { qualification: "demo-open", nodeType: "task", name: "Capture" } } },
      sectionOrder: { demo: ["capture"] },
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
    rules: {
      order: { established: true, sequence: ["stamp-unspellable-field"], derivedFrom: "test fixture" },
      rules: {
        "stamp-unspellable-field": {
          pattern: "tasks",
          when: { op: "true" },
          priority: 0,
          actions: [{ verb: "set", field: "no_marker_for_this_field", to: "x" }],
        },
      },
      patterns: { tasks: { find: { nodeType: ["task"], fields: {} }, exclude: [] } },
      fieldMarkers: {},
      dropped: {},
    },
  };

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
    page.__applyPresentation(DECLARATION);
  });

  const VIEW = { id: "demo", path: "demo.md" };
  const BEFORE = "## Capture\n";
  const AFTER = "## Capture\n- [ ] Try this\n";
  const CAPTURE = { lineIndex: 1, text: "- [ ] Try this", markdown: AFTER, source: BEFORE, kind: "insert-line" };

  test("the rule MATCHES and FIRES but has no glyph to write — the badge says so", () => {
    const reading = page.__rulesReadingFor(VIEW, { ...CAPTURE });
    assert.equal(reading.kind, "abstains");
    assert.equal(reading.because, "rendering-unrenderable-effect");

    page.__updateRulesBadge(reading);
    assert.equal(elements.get("rulesBadge").textContent, "rules: abstained — rendering-unrenderable-effect");
    assert.equal(page.__rulesNoteFor(reading), "", "an abstention must not also narrate as if it were an answer");
  });

  test("MUTATION PROOF: publish a marker for the field and the SAME rule renders — the abstention was real, not a bug in the fixture", () => {
    const RENDERABLE = JSON.parse(JSON.stringify(DECLARATION));
    RENDERABLE.rules.fieldMarkers = { no_marker_for_this_field: { token: "🔖", kind: "int" } };
    page.__applyPresentation(RENDERABLE);
    const reading = page.__rulesReadingFor(VIEW, { ...CAPTURE });
    assert.equal(reading.kind, "answer");
    assert.equal(reading.text, "- [ ] Try this 🔖 x");
    assert.equal(page.__rulesDiagnosticFor(reading), "rules: decided");
    page.__applyPresentation(DECLARATION); // restore, so later tests in this file see the original
  });
});

describe("4. THE POSTED BODY IS UNTOUCHED — the positive proof, not an inference from a missing call site", () => {
  let page;
  let posted;

  before(async () => {
    installBrowser();
    globalThis.fetch = withDeclaration(async (url, init) => {
      const body = JSON.parse(init.body);
      posted = { url, body };
      return { ok: true, json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot: { generated_at: "2026-08-01T12:00:00Z", views: [] } }) };
    });
    page = await importPage(WORK);
    await page.loadPresentation();
  });

  const VIEW = { id: "inbox", path: "inbox.md" };
  const BEFORE = "## Inbox\n## Domain Empty\n";
  const AFTER = "## Inbox\n## Domain Empty\n- [ ] Write the launch note\n";

  test("the same headline capture (§1) posts EXACTLY the markdown applyEdit produced — no 🆕, no #task, nothing this app did not type", async () => {
    posted = null;
    await page.commitLine(VIEW, {
      lineIndex: 2,
      text: "- [ ] Write the launch note",
      markdown: AFTER,
      source: BEFORE,
      kind: "insert-line",
    });
    assert.ok(posted, "the capture was never posted");
    assert.equal(posted.body.markdown, AFTER, "the posted body must be byte-identical to what applyEdit produced");
    assert.ok(!posted.body.markdown.includes("🆕"), "the write path must never carry the predicted glyph");
  });

  test("`.markdown` is never assigned by this feature's own code — the positive grep, not an absence of a call site", () => {
    const APP_SOURCE = readFileSync(resolve(HERE, "..", "app", "index.html"), "utf8");
    const rulesBlock = APP_SOURCE.slice(APP_SOURCE.indexOf("// RULES — `rules.ts`'s own axis"));
    assert.doesNotMatch(rulesBlock, /\.markdown\s*=(?!=)/, "the rules block must not assign .markdown");
    assert.doesNotMatch(rulesBlock, /\.text\s*=(?!=)/, "the rules block must not assign .text");
  });
});

describe("5. SCOPED TO A FRESH CAPTURE — an existing, already-minted line never reaches the rules pass", () => {
  let page;

  before(async () => {
    installBrowser();
    globalThis.fetch = withDeclaration(async () => ({
      ok: true,
      json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot: { generated_at: "2026-08-01T12:00:00Z", views: [] } }),
    }));
    page = await importPage(WORK);
    await page.loadPresentation();
  });

  const VIEW = { id: "inbox", path: "inbox.md" };
  const SOURCE = "## Inbox\n## Domain Empty\n- [ ] Write the launch note [[qntm:900]]\n";

  test("a set-line commit on an already-minted line is 'not-evaluated' — never guesses at its created_at", () => {
    const reading = page.__rulesReadingFor(VIEW, {
      lineIndex: 2,
      text: "- [ ] Write the launch note edited [[qntm:900]]",
      markdown: SOURCE.replace(
        "- [ ] Write the launch note [[qntm:900]]",
        "- [ ] Write the launch note edited [[qntm:900]]",
      ),
      source: SOURCE,
      kind: "set-line",
    });
    assert.equal(reading.kind, "not-evaluated", "a set-line commit must never reach the rules pass at all");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. GRAPH-DEPENDENT PATTERNS (2026-08-04 widening) — a rule whose for_each pattern carries a
// one-hop edge step (`compile-qualification.mjs`'s `normaliseEdgeStep`, reused by `compile-
// rules.mjs`'s PASS 2) is exactly the shape the operator's own `task-with-open-part-of-child-
// becomes-outcome`/`task-with-open-waiting-for-child-becomes-outcome` rules are: published now,
// where they used to be dropped outright, but UNDECIDABLE for this fresh-capture-only evaluator —
// `applyRules` has no graph to walk. This section proves the three claims that matter: (a) an
// undecidable rule does not crash the pass, (b) it does not silently masquerade as "no rule
// matches" when nothing else fires, and (c) it does not block a LATER, fully-decidable rule in the
// same pass from firing and rendering exactly as it always did.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("6. GRAPH-DEPENDENT PATTERNS — undecidable, never silently skipped, never blocking a later rule", () => {
  let page;
  let elements;

  // A hand-built declaration: `graph-dependent-promotes` mirrors the operator's real
  // `task-with-open-part-of-child-becomes-outcome` shape exactly — a `for_each` pattern whose
  // `root.find` (`node_type: task`) matches almost any fresh task capture, PLUS a one-hop
  // `children:`/`exists: true` edgeStep this evaluator cannot decide from a line's own fields.
  // `stamps-a-field` is an ORDINARY, fully-decidable rule at LOWER priority (so it sorts after the
  // undecidable one in `language.order`) — the positive control that proves the undecidable rule
  // does not block it.
  const DECLARATION = {
    qualification: {
      defaultNodeType: "task",
      structuralNodeTypes: [],
      tokens: { node_type: { "#task": "task" }, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
      predicates: { "demo-open": { find: { nodeType: ["task"], fields: {} }, exclude: [] } },
      sections: { demo: { capture: { qualification: "demo-open", nodeType: "task", name: "Capture" } } },
      sectionOrder: { demo: ["capture"] },
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
    rules: {
      order: { established: true, sequence: ["graph-dependent-promotes", "stamps-a-field"] },
      rules: {
        "graph-dependent-promotes": {
          pattern: "open-tasks-with-live-child",
          when: { op: "true" },
          priority: 10,
          actions: [{ verb: "retype", to: "outcome" }],
        },
        "stamps-a-field": {
          pattern: "tasks",
          when: { op: "true" },
          priority: 0,
          actions: [{ verb: "set", field: "demo_flag", to: true }],
        },
      },
      patterns: {
        "open-tasks-with-live-child": {
          find: { nodeType: ["task"], fields: {} },
          exclude: [],
          edgeSteps: [
            { direction: "children", mustExist: true, edgeType: ["PART_OF"], nodeType: null, fields: {} },
          ],
        },
        tasks: { find: { nodeType: ["task"], fields: {} }, exclude: [] },
      },
      fieldMarkers: { demo_flag: { token: "🚩", kind: "int" } },
      dropped: {},
    },
  };

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
    page.__applyPresentation(DECLARATION);
  });

  const VIEW = { id: "demo", path: "demo.md" };
  const BEFORE = "## Capture\n";
  const AFTER = "## Capture\n- [ ] Try this\n";
  const CAPTURE = { lineIndex: 1, text: "- [ ] Try this", markdown: AFTER, source: BEFORE, kind: "insert-line" };

  test("THE UNDECIDABLE RULE DOES NOT CRASH THE PASS, AND THE LATER DECIDABLE RULE STILL FIRES", () => {
    const reading = page.__rulesReadingFor(VIEW, { ...CAPTURE });
    assert.equal(reading.kind, "answer", "an undecidable rule must not turn the whole pass into an abstention here — something else really did fire");
    assert.deepEqual(reading.applied, [{ verb: "set", ruleId: "stamps-a-field", field: "demo_flag", to: true }]);
    assert.equal(reading.text, "- [ ] Try this 🚩 true");
    assert.equal(reading.partial, false, "nothing partial fired — only the fully-decidable rule did");
  });

  test("AND THE PASS SAYS WHAT IT COULD NOT CONSULT — the answer is not silently treated as complete", () => {
    // ── THE MEASUREMENT THIS CLOSES, IN THE OPERATOR'S OWN INBOX ──
    //
    // For one freshly typed `- [ ] something #task` the published table holds 25 rules: 1 fires, 7
    // are structurally undecidable in a browser (a one-hop `children:`/`parents:` edge step), 2
    // match with a false `when`, 15 do not match. `applyRules` has always reported the seven in
    // `RulePassResult.undecidable`. The READER threw them away: the old `rulesReadingFor` surfaced
    // that list only when `applied.length === 0`, which is unreachable the moment anything fires.
    // So the register printed "rules: decided" while 28% of the table went unconsulted. He reported
    // it as "rules not reliable" and he was right.
    //
    // THIS FIXTURE IS THE SAME SHAPE IN MINIATURE — one rule fires, one is undecidable — which is
    // exactly the case the old reader was silent about.
    const reading = page.__rulesReadingFor(VIEW, { ...CAPTURE });
    assert.equal(reading.kind, "answer");
    assert.equal(reading.coverage.kind, "partial", "an answer reached with a rule left unconsulted must say so");
    assert.deepEqual(
      reading.coverage.unconsulted,
      ["graph-dependent-promotes"],
      "the unconsulted rules are NAMED, never counted — a reader that cannot say which cannot act on it",
    );
  });

  test("BUT NOTHING THE OPERATOR SEES CHANGED — the badge is byte-identical to what shipped", () => {
    // COVERAGE IS EXPRESSIBLE, NOT SURFACED, AND THAT SPLIT IS THE WHOLE OF THIS STEP. Showing it
    // changes what he reads, which is a separate, separately reviewable change; making the state
    // representable is what stops the next change having to invent a place to put it.
    const reading = page.__rulesReadingFor(VIEW, { ...CAPTURE });
    assert.equal(page.__rulesDiagnosticFor(reading), "rules: decided");
    page.__updateRulesBadge(reading);
    assert.equal(elements.get("rulesBadge").textContent, "rules: decided");
  });

  test("A PASS THAT CONSULTED EVERYTHING SAYS SO TOO — `complete` is a measurement, not a default", () => {
    // THE FALSIFIER FOR THE TEST ABOVE. If `coverage` were hardcoded to "partial", or derived from
    // anything other than the pass's own `undecidable` list, this would fail: the same candidate
    // against a table with the undecidable rule removed must report FULL coverage.
    const DECIDABLE_ONLY = JSON.parse(JSON.stringify(DECLARATION));
    delete DECIDABLE_ONLY.rules.rules["graph-dependent-promotes"];
    DECIDABLE_ONLY.rules.order.sequence = ["stamps-a-field"];
    page.__applyPresentation(DECIDABLE_ONLY);
    const reading = page.__rulesReadingFor(VIEW, { ...CAPTURE });
    assert.equal(reading.kind, "answer");
    assert.deepEqual(reading.coverage, { kind: "complete" });
    page.__applyPresentation(DECLARATION); // restore, so later tests in this file see the original
  });

  test("WITH THE DECIDABLE RULE REMOVED, THE SAME CANDIDATE ABSTAINS VISIBLY — never a confident 'nothing applies'", () => {
    const UNDECIDABLE_ONLY = JSON.parse(JSON.stringify(DECLARATION));
    delete UNDECIDABLE_ONLY.rules.rules["stamps-a-field"];
    UNDECIDABLE_ONLY.rules.order.sequence = ["graph-dependent-promotes"];
    page.__applyPresentation(UNDECIDABLE_ONLY);

    const reading = page.__rulesReadingFor(VIEW, { ...CAPTURE });
    assert.equal(reading.kind, "abstains");
    assert.equal(reading.because, "rule-pattern-needs-graph-traversal");

    page.__updateRulesBadge(reading);
    assert.equal(elements.get("rulesBadge").textContent, "rules: abstained — rule-pattern-needs-graph-traversal");

    page.__applyPresentation(DECLARATION); // restore, so later tests in this file see the original
  });

  test("MUTATION PROOF: the pure applyRules function itself never calls matchesQualifier on the undecidable pattern", () => {
    // A direct proof at the pure-function level, not only through the page: `applyRules` must
    // record the rule id in `pass.undecidable`, never throw (matchesQualifier WOULD throw if this
    // function forgot the qualifierNeedsGraph guard — membership.ts's own defence-in-depth), and
    // never appear in `pass.applied`.
    const rulesTable = readRulesDeclaration(DECLARATION).rules;
    const pass = applyRules({ node_type: "task", domain: null, status: "open" }, rulesTable, TODAY.answer);
    assert.deepEqual(pass.undecidable, ["graph-dependent-promotes"]);
    assert.ok(!pass.applied.some((e) => e.ruleId === "graph-dependent-promotes"));
    assert.deepEqual(
      pass.applied.map((e) => e.ruleId),
      ["stamps-a-field"],
    );
  });
});

/**
 * A SECOND LOAD UPDATES EVERY DECLARED AXIS ATOMICALLY, NEVER FIVE-OF-SIX (OR THREE-OF-FOUR) —
 * the traced scenario `research-the-store.md` §8 names and asks for, against
 * `docs/implementation-artifacts/backlog.yaml`'s `consolidate-declaration-lets-into-one-value`.
 *
 *   node --test tests/app-declaration-atomicity.test.mjs
 *
 * ── WHAT THIS PROVES, AND WHY A VALUE TEST CANNOT PROVE IT ──
 *
 * `presentation`/`indentUnit`/`structural`/`qualification`/`resolution`/`rulesTable` used to be six
 * independent `let`s in `app/index.html`, all six fed by nothing but `applyPresentation`, all six
 * assigned in six separate statements. A test that only checks "after `applyPresentation` runs, do
 * the six fields have the right values" is blind to HOW they got there — it would pass equally
 * against the six-`let` shape and the one-`Declaration` shape, because on the HAPPY PATH they
 * behave identically. What only a TRACED SCENARIO can show is the SHAPE of the write: is there an
 * instant, reachable by a real exception, in which some axes describe a new document and others
 * describe the old one? Section 1 below constructs that instant and reaches it. Section 2 proves
 * the real, shipped `app/index.html` has no such instant to reach.
 *
 * ── SECTION 1: THE HAZARD THE SIX-WAY SPLIT HAD, REPRODUCED ON A MUTATED COPY ──
 *
 * `applyPresentation`'s real body today is ONE assignment: `declaration = declarationFrom(declared)`
 * — see `app/present/context.ts`'s `Declaration` header for the argument that this cannot tear.
 * Section 1 mutates that ONE line back into a sequence of separate writes to `declaration` (via
 * `{ ...declaration, axis: newValue }`, the closest in-page reproduction of "six independent `let`s,
 * one write per axis" without needing a scratch bundle rebuild — see the mutation's own comment for
 * why a spread-per-axis is the faithful analogue), with a deliberate throw wedged between axis 3
 * and axis 4. It then drives two real loads through the mutated page — document A cleanly, document
 * B interrupted mid-write — and reads what a resolver would actually see afterward: three axes
 * describing B, one still describing A. That mix is not a state B or A ever declared on its own; it
 * is the exact hazard `research-the-store.md` §7.1 named as "the moment this becomes a real hazard".
 *
 * ── SECTION 2: THE SAME TWO LOADS, THE REAL PAGE, GENUINELY INTERRUPTED ──
 *
 * No bundle mutation here — this is the code that ships. `applyPresentation`'s only way to reach
 * something that can throw before its one assignment line is the `console.warn` loop over
 * `declared.problems`, so section 2 patches `console.warn` to throw and hands the page a SECOND
 * document that is genuinely well-formed except for one deliberately invalid `note` key (`note: 7`
 * — declaration.ts's own reader reports `'note' is number, not a string`, proven in
 * present-global.test.mjs's "`note` is prose" test, reused here as the interrupt trigger rather than
 * invented fresh). The interruption lands AFTER `presentationFromDeclaration` has already built the
 * complete replacement object and BEFORE `declaration = declarationFrom(declared)` ever runs. If the
 * assignment were split the way section 1's mutant splits it, this would be exactly the reachable
 * tear point. On the real page there is no second write to interrupt: `declaration` is asserted,
 * axis by axis, to still hold EVERY value from the FIRST load — never a partial adoption of the
 * second document, never a mix.
 *
 * ── SECTION 3: THE WRITE-SITE COUNT IS PINNED, THE SAME WAY `graphData`'S IS ──
 *
 * `research-the-store.md` §5 invariant 7: `graphData`'s assignment count is MECHANICALLY pinned
 * (`tests/app-membership-note.test.mjs`), not merely documented, so a change that adds a sixth write
 * site fails a test rather than waiting to be noticed in review. `declaration` gets the same
 * standing guard here: exactly two occurrences of `declaration =` in `app/index.html` — the `let
 * declaration = NOT_YET_DECLARED;` initialiser and the one atomic assignment inside
 * `applyPresentation`. A second call site to `applyPresentation` (research-the-store.md §7.1's own
 * "the moment this becomes a real hazard") would not, by itself, move this count — which is exactly
 * why sections 1 and 2 above exist as the real proof and this is defence in depth, not a substitute.
 *
 * ── WHAT THIS FILE DOES NOT COVER ──
 *
 * No browser, no passkey session, no live server, no cycle, no paint. This is a proof about ONE
 * module-level value and the one function that writes it — `applyPresentation` — not about what a
 * resolver or the painter subsequently does with a torn or whole `declaration`. Section 1's
 * "resolver would see a mix" claim is checked by reading `page.__declaration()` directly (the exact
 * fields `resolverContextFor`/`globalRegistrationFor` read off it), not by driving a real commit.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { importPage, installBrowser, makeWorkDir, assertMutated } from "./fixtures/app-html-page.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_SOURCE = readFileSync(resolve(HERE, "..", "app", "index.html"), "utf8");

// ── TWO REAL, VALID, DISTINGUISHABLE DECLARATIONS ──
//
// Same nested shape as tests/app-resolver-registry.test.mjs's own `DECLARATION` (already proven, by
// that file's suite, to parse into non-EMPTY `qualification`/`resolution`/`structural`/`rules`) —
// copied rather than imported because that file does not export it, and importing test-private
// fixtures across files is worse than one more small, self-contained copy. A and B differ in
// exactly one leaf value per axis, each one a value the relevant reader accepts without complaint,
// so a landed-vs-stuck axis is identifiable by a single field read rather than a deep comparison.
function declarationWith({ defaultNodeType, timezone, cardinality, marker }) {
  return {
    qualification: {
      defaultNodeType,
      structuralNodeTypes: [],
      tokens: { node_type: { "#task": "task" }, domain: { "#work": "work" }, status: { "[ ]": "open", "[x]": "done" } },
      predicates: { "open-tasks": { find: { nodeType: ["task"], fields: { domain: { eq: null } } }, exclude: [] } },
      sections: { demo: { capture: { qualification: "open-tasks", nodeType: "task", name: "Capture" } } },
      sectionOrder: { demo: ["capture"] },
      refused: {},
      dropped: {},
    },
    resolution: {
      registration: {},
      lineGrammars: {},
      ordering: {},
      orderingFields: {},
      dayBoundary: { timezone, dayStartHour: 4, weekStartsOn: "monday" },
      chromeShapes: {},
      sectionRegistration: {},
      defaultOrdering: [{ field: "title", direction: "asc" }],
      priorityRank: {},
      dropped: {},
    },
    structural: {
      indent: { edgeType: "PART_OF", edgeSource: "self" },
      edgeCardinality: { PART_OF: cardinality },
      sections: {},
      dropped: {},
    },
    rules: {
      order: { established: true, sequence: ["stamp-new"] },
      rules: {
        "stamp-new": { pattern: "any-task", when: { op: "true" }, priority: 0, actions: [{ verb: "set", field: "demo_flag", to: true }] },
      },
      patterns: { "any-task": { find: { nodeType: ["task"], fields: {} }, exclude: [] } },
      fieldMarkers: { demo_flag: { token: marker, kind: "int" } },
      dropped: {},
    },
  };
}

const DECLARATION_A = declarationWith({
  defaultNodeType: "task",
  timezone: "Europe/London",
  cardinality: "many_to_one",
  marker: "🚩",
});
const DECLARATION_B = declarationWith({
  defaultNodeType: "note",
  timezone: "America/New_York",
  cardinality: "one_to_many",
  marker: "🏳",
});

/**
 * Run `fn` with `console.warn` silenced. `declarationWith`'s documents are deliberately minimal —
 * only the four axes this file distinguishes are filled in, so every real load reports genuine,
 * expected, irrelevant-to-this-proof problems (missing registration sub-fields and the like). This
 * keeps that noise out of the test's own output without touching the interrupt tests, which install
 * their own `console.warn` on purpose and restore it themselves.
 */
function quietly(fn) {
  const saved = console.warn;
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.warn = saved;
  }
}

/** Read the four axes off a page's held declaration, in the shape a resolver actually sees them. */
function axesOf(page) {
  const d = page.__declaration();
  return {
    defaultNodeType: d.qualification.defaultNodeType,
    timezone: d.resolution.dayBoundary.timezone,
    cardinality: d.structural.edgeCardinality.PART_OF,
    marker: d.rules.fieldMarkers.demo_flag.token,
  };
}

describe("1. THE HAZARD THE SIX-WAY SPLIT HAD — reproduced on a mutated copy", () => {
  test("MUTATION: a write split across three axes then a throw leaves a mix no document declared", async () => {
    installBrowser();
    const work = makeWorkDir("declaration-atomicity-mutant");
    const mutant = await importPage(work, (source) =>
      assertMutated(
        source,
        "  declaration = declarationFrom(declared);",
        [
          // THE CLOSEST IN-PAGE REPRODUCTION OF "SIX INDEPENDENT `let`s, ONE WRITE EACH": each line
          // below reassigns the WHOLE `declaration` binding to a fresh object (never mutates one in
          // place — mutating `NOT_YET_DECLARED`'s own fields would corrupt the shared bundle
          // singleton every other test in this process imports), copying every prior field forward
          // and overwriting exactly one axis, the same one-write-per-`let` shape the six original
          // variables had.
          "  declaration = { ...declaration, qualification: declared.qualification };",
          "  declaration = { ...declaration, structural: declared.structural };",
          "  declaration = { ...declaration, resolution: declared.resolution };",
          "  if (globalThis.__TORN_DECLARATION_WRITE__) {",
          "    throw new Error('MUTATION PROOF: torn write, deliberately, between axis 3 and axis 4');",
          "  }",
          "  declaration = { ...declaration, rules: declared.rules };",
        ].join("\n"),
      ),
    );

    // LOAD 1, CLEAN. Establishes a fully-consistent baseline every field of which is document A's.
    globalThis.__TORN_DECLARATION_WRITE__ = false;
    quietly(() => mutant.__applyPresentation(DECLARATION_A));
    assert.deepEqual(axesOf(mutant), {
      defaultNodeType: "task",
      timezone: "Europe/London",
      cardinality: "many_to_one",
      marker: "🚩",
    });

    // LOAD 2, INTERRUPTED. Document B arrives; three axes land, the throw fires, the fourth never
    // runs.
    globalThis.__TORN_DECLARATION_WRITE__ = true;
    try {
      assert.throws(() => quietly(() => mutant.__applyPresentation(DECLARATION_B)), /torn write/);

      // THE MIX: qualification/structural/resolution now describe B. `rules` still describes A.
      // No `presentation.json` this app has ever served says `defaultNodeType: "note"` alongside
      // `marker: "🚩"` — that pairing exists only because the write tore, exactly the scenario
      // research-the-store.md §8 asks for and exactly what the real code (section 2) cannot reach.
      assert.deepEqual(axesOf(mutant), {
        defaultNodeType: "note", // B
        timezone: "America/New_York", // B
        cardinality: "one_to_many", // B
        marker: "🚩", // STILL A — axis 4 never wrote
      });
    } finally {
      delete globalThis.__TORN_DECLARATION_WRITE__;
    }
  });
});

describe("2. THE REAL PAGE — the same two loads, genuinely interrupted, cannot tear", () => {
  test("a thrown console.warn before the one assignment leaves every axis at the previous load", async () => {
    installBrowser();
    const work = makeWorkDir("declaration-atomicity-real");
    const page = await importPage(work);

    // LOAD 1, CLEAN. Same baseline as section 1, through the UNMUTATED page.
    quietly(() => page.__applyPresentation(DECLARATION_A));
    assert.deepEqual(axesOf(page), {
      defaultNodeType: "task",
      timezone: "Europe/London",
      cardinality: "many_to_one",
      marker: "🚩",
    });

    // LOAD 2, GENUINELY INTERRUPTED. `applyPresentation`'s only reachable throw point before its
    // one assignment is the `console.warn` loop over `declared.problems` — so document B carries
    // one deliberately invalid key (`note: 7`, the same trigger present-global.test.mjs's own
    // "`note` is prose" test proves produces exactly one problem) and `console.warn` is patched to
    // throw when it is called. `presentationFromDeclaration` has ALREADY built the complete
    // replacement object by the time this fires — proving the interruption lands strictly before
    // `declaration = declarationFrom(declared)`, the one place this code could tear if it were
    // split the way section 1's mutant splits it.
    const savedWarn = console.warn;
    console.warn = (message) => {
      throw new Error("MUTATION PROOF: interrupted before the atomic assignment — " + message);
    };
    try {
      assert.throws(
        () => page.__applyPresentation({ ...DECLARATION_B, note: 7 }),
        /interrupted before the atomic assignment/,
      );
    } finally {
      console.warn = savedWarn;
    }

    // NOT A MIX. Every axis — including the three section 1's mutant let land early — is still
    // EXACTLY document A's, because there was only ever one write to interrupt and it never ran.
    assert.deepEqual(
      axesOf(page),
      { defaultNodeType: "task", timezone: "Europe/London", cardinality: "many_to_one", marker: "🚩" },
      "an interrupted load changed at least one axis — the consolidated value tore",
    );
  });
});

describe("3. THE WRITE-SITE COUNT IS PINNED, THE SAME WAY graphData'S IS", () => {
  test("`declaration =` occurs exactly twice — the initialiser and the one atomic assignment", () => {
    const sites = APP_SOURCE.match(/\bdeclaration\s*=(?!=)/g) ?? [];
    assert.equal(
      sites.length,
      2,
      "a third `declaration =` site means a second place can write this value — the six-way " +
        "hazard sections 1/2 above prove is closed would be reopened by a second writer, not by " +
        "a second call to applyPresentation alone",
    );
  });
});

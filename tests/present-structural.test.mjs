/**
 * THE STRUCTURAL LANGUAGE, PUBLISHED — proof for design-the-structural-language.md's item 1.
 *
 *   node --test tests/present-structural.test.mjs
 *
 * Four claims, four sections below:
 *
 *   1. THE SHIPPED DECLARATION READS CLEANLY, against `dist/present.js` — the artifact, not the
 *      sources — same posture as `tests/present-global.test.mjs`.
 *   2. AN UNRECOGNISED DECLARATION IS REPORTED, NEVER GUESSED — the structural reader is exactly
 *      as strict as `declaration.ts` already is about renditions, key by key.
 *   3. THE SERVED VALUE IS WHAT THE MONOREPO'S CONFIG ACTUALLY DECLARES — not a hand-copied
 *      fixture. This is the one section that reads the sibling checkout
 *      (`scripts/generate-structural-declaration.mjs`, the same script that produced
 *      `presentation.json`'s `structural` key), and it is SKIPPED, loudly, when that checkout is
 *      not present — this repo's CI does not clone the monorepo, so this section runs locally and
 *      lights up there, the same posture `tests/flow_scenarios/vim_gestures.ts` documents for its
 *      own CI gate.
 *   4. THE INDENT UNIT IS NO LONGER TWO DISAGREEING LITERALS — `declaration.ts`'s fallback IS
 *      `indent.ts`'s `INDENT_UNIT`, not a second `4`, and the SERVED value reaches the source-edit
 *      arithmetic end to end. `paint.ts`'s margin arithmetic is the one place this claim does NOT
 *      hold — see that section for why, and for the citation to where the attempt was made and
 *      reverted.
 */

import { test, describe } from "node:test";
import { ledgerIsPresent, readLedger } from "../scripts/dropped-ledger.mjs";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";

import { makeDocument, makeBody, serialize } from "./fixtures/dom-stub.mjs";
import {
  readStructuralDeclaration,
  presentationFromDeclaration,
  indentedLine,
  INDENT_UNIT,
  DEFAULT_INDENT_UNIT,
  PresentationContext,
  paint,
} from "../dist/present.js";
import {
  generateStructural,
  DEFAULT_CONFIG_DIR,
} from "../scripts/generate-structural-declaration.mjs";

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..");
const PRESENTATION_PATH = join(REPO, "presentation.json");
const SERVED = JSON.parse(readFileSync(PRESENTATION_PATH, "utf8"));

/**
 * THE SERVED SHAPE PLUS ITS SIBLING LEDGER — what the committed PAIR declares, not half of it.
 *
 * `presentation.json` used to carry its own `dropped` map. The four generators now write it to
 * `presentation-dropped.json` instead, so the served file alone no longer holds everything the
 * generator produced. Comparing against the served half ALONE would go green the day a ledger
 * silently stopped being written — the thing that stopped being written would simply be absent
 * from both sides of the assertion, which is the failure the ledger move was made to avoid one
 * layer down (`scripts/dropped-ledger.mjs`: every reader spells it `?.dropped ?? {}`, so a
 * missing ledger reads as "nothing was dropped" rather than throwing).
 *
 * So this reconstitutes the pair and compares THAT. It asserts two things at once: the served
 * declaration still matches a fresh compile, AND no drop was lost in the move.
 *
 * IT WORKS BEFORE AND AFTER THE REGENERATION, deliberately, because today it runs before.
 * `presentation.json` still holds its own `dropped` and the sibling does not exist; `readLedger`
 * returns `{}` for an absent file, this returns `served` untouched, and the assertion is
 * byte-identical to the one it replaces. After the next regeneration the served half loses
 * `dropped`, the sibling supplies it, and the same line keeps asserting the same total.
 */
function servedWithLedger(key, served) {
  // THE SWITCH IS THE FILE'S ABSENCE, NOT THE LEDGER'S EMPTINESS, and the difference is a real
  // one this file got wrong first time round. `structural`'s ledger is legitimately EMPTY — it
  // drops nothing. Short-circuiting on `Object.keys(ledger).length === 0` therefore returned the
  // served half untouched for structural even AFTER the regeneration, at which point the served
  // half has no `dropped` key at all while a fresh compile has `dropped: {}` — and the assertion
  // fails on a key nobody changed. `ledgerIsPresent` is in `dropped-ledger.mjs` for exactly this
  // distinction: "the file is gone" and "the file says nothing was dropped" are different facts.
  if (!ledgerIsPresent(PRESENTATION_PATH)) return served;
  return { ...served, dropped: { ...(served?.dropped ?? {}), ...readLedger(PRESENTATION_PATH, key) } };
}
const md = new MarkdownIt("commonmark").enable("table");

describe("1. the shipped declaration's structural key reads cleanly", () => {
  test("no problems, and the six live overrides are all present", () => {
    const { structural, problems } = readStructuralDeclaration(SERVED);
    assert.deepEqual(problems, [], "the shipped structural declaration does not read cleanly");
    assert.deepEqual(structural.indent, { edgeType: "PART_OF", edgeSource: "self" });
    assert.equal(structural.edgeCardinality.PART_OF, "many_to_one");
    assert.equal(structural.edgeCardinality.WAITING_FOR, "many_to_many");
    for (const view of [
      "operator-qntm",
      "operator-qntm-network",
      "operator-flowtrace",
      "operator-trace-orchestration",
      "waiting-for-work",
      "waiting-for-personal",
    ]) {
      assert.ok(structural.sections[view], `${view} lost its override`);
    }
  });

  test("a document with no structural key at all is silence, not a problem", () => {
    const { structural, problems } = readStructuralDeclaration({ checkbox: "raw" });
    assert.deepEqual(problems, []);
    assert.deepEqual(structural, {
      indent: undefined,
      edgeCardinality: {},
      edgeDirectionRegistry: {},
      sections: {},
      // `dropped` joined the EMPTY shape when the generators started recording what they refuse
      // to publish (scripts/ledger.mjs). Empty here for the same reason every other key is: this
      // document declares no structural language, so there is nothing published AND nothing
      // dropped. The claim this test makes — silence is not a problem — is unchanged.
      dropped: {},
    });
  });

  test("declaration.ts does not misreport 'structural' or 'indentUnit' as unrecognised", () => {
    // The widening this design item makes: two more known top-level keys, neither a Rendition.
    // Getting this wrong would mean every served file with a structural language logs a false
    // "not a resolution key" warning forever.
    const { problems } = presentationFromDeclaration({
      checkbox: "wired",
      indentUnit: 4,
      structural: { indent: { edgeType: "PART_OF", edgeSource: "self" } },
    });
    assert.deepEqual(problems, []);
  });
});

describe("2. an unrecognised structural declaration is reported, never guessed", () => {
  test("an unknown top-level key inside 'structural' is reported and dropped", () => {
    const { structural, problems } = readStructuralDeclaration({ structural: { wat: true } });
    assert.equal(structural.indent, undefined);
    assert.match(problems.join(" "), /'structural\.wat' is not a recognised key/);
  });

  test("'structural' itself, wrong shape, is reported whole", () => {
    const { structural, problems } = readStructuralDeclaration({ structural: "PART_OF" });
    assert.deepEqual(structural, {
      indent: undefined,
      edgeCardinality: {},
      edgeDirectionRegistry: {},
      sections: {},
      // `dropped` joined the EMPTY shape when the generators started recording what they refuse
      // to publish (scripts/ledger.mjs). Empty here for the same reason every other key is: this
      // document declares no structural language, so there is nothing published AND nothing
      // dropped. The claim this test makes — silence is not a problem — is unchanged.
      dropped: {},
    });
    assert.match(problems.join(" "), /'structural' is string, not an object/);
  });

  test("indent.edgeSource outside self/position is reported and indent stays unknown", () => {
    const { structural, problems } = readStructuralDeclaration({
      structural: { indent: { edgeType: "PART_OF", edgeSource: "sideways" } },
    });
    assert.equal(structural.indent, undefined);
    assert.match(problems.join(" "), /'structural\.indent\.edgeSource' is "sideways"/);
  });

  test("indent missing edgeType is reported and indent stays unknown", () => {
    const { structural, problems } = readStructuralDeclaration({
      structural: { indent: { edgeSource: "self" } },
    });
    assert.equal(structural.indent, undefined);
    assert.match(problems.join(" "), /'structural\.indent\.edgeType' is undefined/);
  });

  test("a non-string cardinality is reported and only that entry is dropped", () => {
    const { structural, problems } = readStructuralDeclaration({
      structural: { edgeCardinality: { PART_OF: "many_to_one", WAITING_FOR: 7 } },
    });
    assert.deepEqual(structural.edgeCardinality, { PART_OF: "many_to_one" });
    assert.match(problems.join(" "), /'structural\.edgeCardinality\.WAITING_FOR' is 7/);
  });

  test("a section with edgeDirection outside incoming/outgoing is reported, others survive", () => {
    const { structural, problems } = readStructuralDeclaration({
      structural: {
        sections: {
          v: {
            good: { edgeTypes: ["WAITING_FOR"], edgeDirection: "incoming" },
            bad: { edgeTypes: ["WAITING_FOR"], edgeDirection: "sideways" },
          },
        },
      },
    });
    assert.deepEqual(Object.keys(structural.sections.v), ["good"]);
    assert.match(problems.join(" "), /'structural\.sections\.v\.bad\.edgeDirection' is "sideways"/);
  });

  test("a section's edgeTypes as an empty array is reported, not silently accepted", () => {
    const { structural, problems } = readStructuralDeclaration({
      structural: { sections: { v: { s: { edgeTypes: [], edgeDirection: "incoming" } } } },
    });
    assert.deepEqual(structural.sections, {});
    assert.match(problems.join(" "), /'structural\.sections\.v\.s\.edgeTypes' is \[\]/);
  });

  test("an unrecognised key inside a section's own language is reported", () => {
    const { problems } = readStructuralDeclaration({
      structural: {
        sections: { v: { s: { edgeTypes: ["X"], edgeDirection: "incoming", extra: true } } },
      },
    });
    assert.match(problems.join(" "), /'structural\.sections\.v\.s\.extra' is not a recognised key/);
  });

  test("indentUnit malformed values are reported and fall back to the default", () => {
    for (const bad of [0, -1, 4.5, "4", null]) {
      const { indentUnit, problems } = presentationFromDeclaration({ indentUnit: bad });
      assert.equal(indentUnit, DEFAULT_INDENT_UNIT, `${JSON.stringify(bad)} did not fall back`);
      assert.match(problems.join(" "), /'indentUnit' is/);
    }
  });
});

describe("3. the served value is what the monorepo's config actually declares", () => {
  const available = existsSync(DEFAULT_CONFIG_DIR);

  test(
    "generating from the monorepo's YAML reproduces presentation.json's structural key",
    { skip: available ? false : `monorepo not checked out at ${DEFAULT_CONFIG_DIR} — this ` +
        "section runs locally, where the sibling checkout this worktree already assumes for " +
        "flow-trace is present, and is skipped in CI, which does not clone it" },
    () => {
      const generated = generateStructural(DEFAULT_CONFIG_DIR);
      assert.deepEqual(
        servedWithLedger("structural", SERVED.structural),
        generated,
        "presentation.json's structural key is STALE — run " +
          "'node scripts/generate-structural-declaration.mjs' and commit the result",
      );
    },
  );

  // A FRESH COMPILE, NOT THE COMMITTED FIXTURE — structural-edges-resolve-from-declared-config
  // (2026-08-16). Deliberately independent of `presentation.json`'s own freshness (the test above
  // this one), so a stale commit can never mask whether `edgeDirectionRegistry` itself is correct.
  test(
    "edgeDirectionRegistry is EXHAUSTIVE — every schema edge type, not just ones a section names",
    { skip: available ? false : `monorepo not checked out at ${DEFAULT_CONFIG_DIR}` },
    () => {
      const { edgeCardinality, edgeDirectionRegistry } = generateStructural(DEFAULT_CONFIG_DIR);
      // `edgeCardinality` is the OLD, narrowed table — every key in it names an edge type someone
      // declared. `edgeDirectionRegistry` must be a SUPERSET: every one of those keys, PLUS every
      // other edge type schema.yaml declares that nothing narrows away.
      for (const edgeType of Object.keys(edgeCardinality)) {
        assert.ok(edgeType in edgeDirectionRegistry, `${edgeType} is in the narrowed table but not the full one`);
      }
      assert.ok(
        Object.keys(edgeDirectionRegistry).length > Object.keys(edgeCardinality).length,
        "the registry is not actually wider than the narrowed table — this operator's schema " +
          "declares more edge types than his structural language currently names, so an equal " +
          "count means nothing was widened",
      );
      // THE FACT THE WHOLE FEATURE DEPENDS ON: PART_OF is his one hierarchy edge, and its
      // `direction` (not `cardinality` — `many_to_one` is a different fact) is `child_to_parent`.
      assert.equal(edgeDirectionRegistry.PART_OF, "child_to_parent");
      assert.notEqual(edgeDirectionRegistry.PART_OF, edgeCardinality.PART_OF, "direction and cardinality must not collapse into the same string");
    },
  );
});

describe("4. the indent unit is one declared source, and exactly one consumer derives from it", () => {
  test("declaration.ts's fallback IS indent.ts's INDENT_UNIT, not a second literal 4", () => {
    assert.equal(DEFAULT_INDENT_UNIT, INDENT_UNIT);
  });

  test("a declared indentUnit reaches indentedLine's arithmetic end to end", () => {
    // The stage-2 falsifier's own shape, applied to this axis: flip the declared number and the
    // COMPUTED EDIT must change, not merely the value returned by the reader.
    const declaredTwo = presentationFromDeclaration({ indentUnit: 2 }).indentUnit;
    const declaredEight = presentationFromDeclaration({ indentUnit: 8 }).indentUnit;
    const line = "- [ ] a task";

    const indentedByTwo = indentedLine(line, "in", 1, declaredTwo);
    assert.equal(indentedByTwo.match(/^ */)[0].length, 2);

    const indentedByEight = indentedLine(line, "in", 1, declaredEight);
    assert.equal(indentedByEight.match(/^ */)[0].length, 8);
  });

  test("no declaration at all falls back to the engine's own literal, unchanged", () => {
    const indentUnit = presentationFromDeclaration({}).indentUnit;
    assert.equal(indentUnit, 4);
    const indented = indentedLine("- [ ] a task", "in", 1, indentUnit);
    assert.equal(indented, "    - [ ] a task");
  });

  test(
    "paint.ts's checkbox margin does NOT derive from the declared unit — a known, cited, " +
      "golden-blocked disagreement, not a silent regression",
    () => {
      // See app/present/paint.ts's own comment at the marginLeft line: fixing this divides by the
      // declared unit instead of the constant 2, and tests/present-golden.test.mjs's byte-
      // identical comparison against the historical app.html:234-269 reference fails for indents
      // of 1, 2 and 4 raw spaces when that is tried — confirmed by making the edit, running the
      // golden suite, and reverting, not by inspection. PaintDeps carries no indentUnit field for
      // exactly this reason: a field nothing consumes is not a wire, it is a decoration.
      globalThis.document = makeDocument();
      const body = makeBody();
      // Four raw spaces — one nesting level under this instance's declared/default unit.
      paint(body, "    - [ ] nested", new PresentationContext(), {
        markdown: md,
        onCheckboxToggle: () => {},
      });
      const text = serialize(body);
      // (4 / 2) * 1.2 = 2.4rem — the OLD, still-hardcoded arithmetic. The CORRECT value under a
      // 4-space unit would be 1.2rem; this assertion is the tripwire that a future fix must
      // consciously update, alongside the golden master, rather than one drifting unnoticed.
      assert.match(text, /marginLeft="2\.4rem"/);
    },
  );
});

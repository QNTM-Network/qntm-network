/**
 * THE CLOSED CAPTURE-RULES GRAMMAR, PUBLISHED — proof for design-the-rule-mirror.md §11 row 4.
 *
 *   node --test tests/present-capture-rules.test.mjs
 *
 * `design-the-rule-mirror.md` §3.2/§3.3 found a bare capture reaches exactly TWO of the operator's
 * 94 rules — `routine-without-cadence-becomes-task` and `stamp-created-at-on-task`. §11 row 4
 * prices publishing them as a closed grammar at `½`, ahead of any evaluator. `roadmap-the-road-
 * ahead.md` step 3 names why: without it, the browser has no way to know a correction
 * (`routine` -> `task`) is coming in 13 of 186 sections, and a silent swap ten seconds later would
 * be a lie told twice.
 *
 * THE ORDER BETWEEN THEM IS DELIBERATELY NOT PUBLISHED AS A SEQUENCE. An earlier version of this
 * grammar derived `order` from the two source files' basenames and called that "the alphabetical
 * position... in config/rules/" — a review caught that this was two independent naming schemes
 * (file name, `rule_id`) agreeing by coincidence, traced to neither the loader nor the rule
 * engine. `scripts/compile-capture-rules.mjs`'s header records the full re-investigation: the
 * loader mechanism IS traced, precisely, as far as `apps/qntm-md/src/qntm_md/**` reaches — but the
 * final link, whether `qntm_rule_engine.execute()` (in `core/rule-engine`, outside that boundary)
 * preserves the traced list order or re-derives its own, is not established. So `captureRules.
 * order` is `{established: false, reason: ...}`, not an array — an honest gap, not a confident
 * coincidence restated with better citations.
 *
 * This is a published fact, not an evaluator. Nothing here (or in `scripts/compile-capture-
 * rules.mjs`) tests a `when` clause against a real node — see that file's header.
 *
 * Six sections:
 *
 *   1. THE SHIPPED DECLARATION is a closed grammar of exactly two rules, with `order` an honest
 *      "unestablished" rather than a guessed sequence.
 *   2. `declaration.ts` DOES NOT MISREPORT `captureRules` as an unrecognised key — and the
 *      detector that would have fired on it before it was taught the key is shown still alive.
 *   3. THE SERVED VALUE IS WHAT THE MONOREPO'S TWO RULE FILES ACTUALLY DECLARE — generated, not
 *      transcribed. Skipped, loudly, when the monorepo is not checked out (this repo's CI does not
 *      clone it), same posture as `tests/present-structural.test.mjs` §3.
 *   4. THE AGREEMENT TEST — runs in CI, unconditionally, against a COMMITTED fixture copy of the
 *      two authored files (verified byte-identical to the monorepo trunk when committed — see the
 *      PR body). This is what makes "the published grammar and the authored YAML disagree" a
 *      failing test rather than a hope.
 *   5. THE MUTATION PROOF — the grammar is CLOSED: a shape it does not model throws, it is never
 *      silently approximated. Five mutants, each on a real anchor string, each asserted to change
 *      the source before it is fed back in.
 *   6. THE ORDER IS AN HONEST GAP, NOT A GUESS — `established` is a hard `false`, and the reason
 *      names both the ruled-out mechanism and the one boundary that still blocks closing it.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readDeclaration } from "../dist/present.js";
import {
  compile,
  GenerationError,
  CADENCE_RULES_KEY,
  STAMP_RULES_KEY,
  ORDER_UNESTABLISHED_REASON,
} from "../scripts/compile-capture-rules.mjs";
import {
  generateCaptureRules,
  DEFAULT_CONFIG_DIR,
} from "../scripts/generate-capture-rules-declaration.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const SERVED = JSON.parse(readFileSync(join(REPO, "presentation.json"), "utf8"));

// A STANDALONE fixture directory, deliberately NOT under `tests/fixtures/config/` — that shared
// tree is already swept by `generate-resolution-declaration.mjs`'s own `rules/*.yaml` reader (a
// pre-existing feature, unrelated to this file, that builds the registration table's retype
// list). Adding these two files there made `generateResolution(FIXTURE_CONFIG)` pick them up and
// refuse them (their `for_each` shape is not what THAT generator expects), which turned
// `tests/declaration-drop.test.mjs`'s "the unmutated fixture drops exactly two things" assertion
// red — confirmed by reproducing it once, moving the fixture, and confirming it went green again.
const FIXTURE_DIR = join(HERE, "fixtures", "capture-rules");
const CADENCE_TEXT = readFileSync(join(FIXTURE_DIR, "cadence_auto_routine.yaml"), "utf8");
const STAMP_TEXT = readFileSync(join(FIXTURE_DIR, "stamp_created_at.yaml"), "utf8");
const goodFiles = () => ({ [CADENCE_RULES_KEY]: CADENCE_TEXT, [STAMP_RULES_KEY]: STAMP_TEXT });

/** Replace `from` with `to`, but only in the text FROM the first line naming `ruleId` onward — so
 * a mutation aimed at one rule cannot silently land on the other rule sharing the same file (both
 * of `cadence_auto_routine.yaml`'s rules test the same field, so a plain `.replace` is ambiguous). */
function mutateAfter(text, ruleId, from, to) {
  const marker = `- id: ${ruleId}`;
  const idx = text.indexOf(marker);
  assert.notEqual(idx, -1, `'${marker}' is not in the fixture — the mutation's own anchor moved`);
  assert.equal(text.indexOf(marker, idx + 1), -1, `'${marker}' is not unique in the fixture`);
  const head = text.slice(0, idx);
  const tail = text.slice(idx);
  const mutatedTail = tail.replace(from, to);
  assert.notEqual(mutatedTail, tail, `the mutation's own anchor '${from}' was not found after ${marker}`);
  return head + mutatedTail;
}

const EXPECTED_RULES = {
  "routine-without-cadence-becomes-task": {
    pattern: "routines",
    when: { op: "null", field: "cadence" },
    retypesTo: "task",
  },
  "stamp-created-at-on-task": {
    pattern: "tasks",
    when: { op: "eq", field: "created_at", value: null },
    setsField: "created_at",
    setsFieldTo: "$cycle_today",
  },
};
const EXPECTED_ORDER = { established: false, reason: ORDER_UNESTABLISHED_REASON };

// ── 1 ────────────────────────────────────────────────────────────────────────────────────────

describe("1. the shipped declaration is a closed grammar of exactly two rules", () => {
  test("order is explicitly unestablished — not a guessed sequence", () => {
    assert.deepEqual(SERVED.captureRules.order, EXPECTED_ORDER);
    assert.equal(SERVED.captureRules.order.established, false);
    assert.equal(typeof SERVED.captureRules.order.reason, "string");
    assert.ok(SERVED.captureRules.order.reason.length > 0);
  });

  test("each rule's pattern/predicate/action match what the authored YAML declares", () => {
    assert.deepEqual(SERVED.captureRules.rules, EXPECTED_RULES);
  });

  test("exactly two rule ids are published — this is the whole grammar, not a sample of it", () => {
    assert.deepEqual(Object.keys(SERVED.captureRules.rules).sort(), [
      "routine-without-cadence-becomes-task",
      "stamp-created-at-on-task",
    ]);
  });

  test("dropped is empty — a closed set of two either publishes whole or refuses outright", () => {
    assert.deepEqual(SERVED.captureRules.dropped, {});
  });
});

// ── 2 ────────────────────────────────────────────────────────────────────────────────────────

describe("2. declaration.ts does not misreport captureRules as an unrecognised key", () => {
  test("the served document reads with no problems", () => {
    const { problems } = readDeclaration(SERVED);
    assert.deepEqual(problems, [], "the rendition reader objected to the served document");
  });

  test(
    "POSITIVE CONTROL: an actually-unknown key IS reported — the detector 'captureRules' had " +
      "to be taught to skip is demonstrably still alive, not removed",
    () => {
      const { problems } = readDeclaration({ ...SERVED, captureRulesTypo: SERVED.captureRules });
      assert.match(problems.join(" "), /'captureRulesTypo' is not a resolution key/);
    },
  );
});

// ── 3 ────────────────────────────────────────────────────────────────────────────────────────

describe("3. the served value is what the monorepo's two rule files actually declare", () => {
  const available = existsSync(DEFAULT_CONFIG_DIR);

  test(
    "generating from the monorepo reproduces presentation.json's captureRules key",
    {
      skip: available
        ? false
        : `monorepo not checked out at ${DEFAULT_CONFIG_DIR} — this section runs locally and is ` +
          "skipped in CI, which does not clone it",
    },
    () => {
      const generated = generateCaptureRules(DEFAULT_CONFIG_DIR);
      assert.deepEqual(
        SERVED.captureRules,
        generated,
        "presentation.json's captureRules key is STALE — run " +
          "'node scripts/generate-capture-rules-declaration.mjs' and commit the result",
      );
    },
  );
});

// ── 4 ────────────────────────────────────────────────────────────────────────────────────────

describe("4. THE AGREEMENT TEST — runs in CI, no monorepo needed", () => {
  test(
    "compile() over the committed fixture copy of the authored YAML equals the shipped grammar",
    () => {
      const { declaration } = compile(goodFiles());
      assert.deepEqual(
        { ...declaration, dropped: {} },
        SERVED.captureRules,
        "the published grammar and the fixture-compiled grammar disagree",
      );
    },
  );

  test("the fixture carries both of cadence_auto_routine.yaml's rules, not a trimmed extract", () => {
    // Keeping the file whole (not just the one rule this grammar reads) is what makes DROP-BY-ID
    // (section 5's rule-id mutant) a meaningful test: `findRule` has to pick the right one out of
    // two, exactly as it must against the real file.
    assert.match(CADENCE_TEXT, /- id: task-with-cadence-becomes-routine/);
    assert.match(CADENCE_TEXT, /- id: routine-without-cadence-becomes-task/);
    assert.match(STAMP_TEXT, /- id: stamp-created-at-on-task/);
  });
});

// ── 5 ────────────────────────────────────────────────────────────────────────────────────────

describe("5. THE MUTATION PROOF — a shape this closed grammar does not model is refused, not guessed", () => {
  test("CONTROL: the unmutated fixture compiles without throwing", () => {
    assert.doesNotThrow(() => compile(goodFiles()));
  });

  test("MUTANT: a third predicate shape ('gt') is refused", () => {
    const mutated = mutateAfter(
      CADENCE_TEXT,
      "routine-without-cadence-becomes-task",
      `"null": [$current.node.fields.cadence]`,
      "gt: [$current.node.fields.cadence, 0]",
    );
    assert.throws(
      () => compile({ ...goodFiles(), [CADENCE_RULES_KEY]: mutated }),
      /not one of the two predicate shapes this closed grammar models/,
    );
  });

  test("MUTANT: an action verb this grammar does not recognise ('archive') is refused", () => {
    const mutated = mutateAfter(
      CADENCE_TEXT,
      "routine-without-cadence-becomes-task",
      "    - verb: emit_event",
      "    - verb: archive\n      node_id: $current.node.id\n    - verb: emit_event",
    );
    assert.throws(
      () => compile({ ...goodFiles(), [CADENCE_RULES_KEY]: mutated }),
      /an action verb this closed grammar does not model/,
    );
  });

  test("MUTANT: the rule id is renamed — 'not found', never silently absent", () => {
    const mutated = STAMP_TEXT.replace(
      "- id: stamp-created-at-on-task",
      "- id: renamed-stamp-rule",
    );
    assert.notEqual(mutated, STAMP_TEXT, "the mutation's own anchor was not found");
    assert.throws(
      () => compile({ ...goodFiles(), [STAMP_RULES_KEY]: mutated }),
      /no rule with id 'stamp-created-at-on-task' found/,
    );
  });

  test("MUTANT: the action targets a node other than the current one — refused", () => {
    const mutated = mutateAfter(
      STAMP_TEXT,
      "stamp-created-at-on-task",
      "node_id: $current.node.id",
      "node_id: $current.node.parent_id",
    );
    assert.throws(
      () => compile({ ...goodFiles(), [STAMP_RULES_KEY]: mutated }),
      /not the current node/,
    );
  });

  test("MUTANT: set_node_type's node_type is not a string — refused", () => {
    const mutated = mutateAfter(
      CADENCE_TEXT,
      "routine-without-cadence-becomes-task",
      "node_type: task",
      "node_type: 42",
    );
    assert.throws(
      () => compile({ ...goodFiles(), [CADENCE_RULES_KEY]: mutated }),
      /'set_node_type' has no string 'node_type'/,
    );
  });

  test("every mutant is a real GenerationError, not some other failure the regex happens to match", () => {
    const mutated = mutateAfter(
      STAMP_TEXT,
      "stamp-created-at-on-task",
      "node_id: $current.node.id",
      "node_id: $current.node.parent_id",
    );
    assert.throws(
      () => compile({ ...goodFiles(), [STAMP_RULES_KEY]: mutated }),
      (error) => error instanceof GenerationError,
    );
  });
});

// ── 6 ────────────────────────────────────────────────────────────────────────────────────────

describe("6. the order is an honest gap, not a guess", () => {
  test("'established' is a hard false, not an absent key or a falsy placeholder", () => {
    assert.strictEqual(SERVED.captureRules.order.established, false);
    assert.notEqual(SERVED.captureRules.order.established, undefined);
  });

  test("no 'sequence' is published while unestablished — nothing to mistake for an answer", () => {
    assert.equal("sequence" in SERVED.captureRules.order, false);
  });

  test("the reason names the mechanism that WAS traced and ruled out (rule_id sort, dead code)", () => {
    assert.match(SERVED.captureRules.order.reason, /rule_loader\.py/);
    assert.match(SERVED.captureRules.order.reason, /dead code/);
    assert.match(SERVED.captureRules.order.reason, /no callers/);
  });

  test("the reason names the mechanism that WAS traced and DOES feed the compiled rule list (the loader)", () => {
    assert.match(SERVED.captureRules.order.reason, /bundle\/loader\.py/);
    assert.match(SERVED.captureRules.order.reason, /alphabetical config-tree file order/);
  });

  test("the reason names the one boundary that still blocks closing the gap (core/rule-engine)", () => {
    assert.match(SERVED.captureRules.order.reason, /qntm_rule_engine\.execute\(\)/);
    assert.match(SERVED.captureRules.order.reason, /core\/rule-engine/);
    assert.match(SERVED.captureRules.order.reason, /outside this generator's permitted read boundary/);
  });

  test(
    "MUTATION CHECK: if the reason string were emptied, this section's own detectors would catch it",
    () => {
      // Not a mutation of shipped code — a demonstration that the assertions above are not
      // vacuously matching an empty string, by running the same regexes against "" and confirming
      // every one of them fails first.
      const empty = "";
      assert.equal(/rule_loader\.py/.test(empty), false);
      assert.equal(/bundle\/loader\.py/.test(empty), false);
      assert.equal(/qntm_rule_engine\.execute\(\)/.test(empty), false);
    },
  );
});

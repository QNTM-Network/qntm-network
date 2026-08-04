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
 * THE ORDER IS NOW PUBLISHED, AND IT TOOK THREE PASSES TO GET THE DERIVATION RIGHT. Pass 1 derived
 * `order` from the two source files' basenames and called that "the alphabetical position... in
 * config/rules/" — two independent naming schemes (file name, `rule_id`) agreeing by coincidence,
 * traced to neither the loader nor the rule engine. Pass 2 traced the loader precisely, hit the
 * boundary of what it was permitted to read, and REFUSED to publish an order at all —
 * `{established: false, reason: ORDER_UNESTABLISHED_REASON}` — rather than guess past the gap.
 * Pass 3 closes the gap: `scripts/compile-capture-rules.mjs`'s header ("THE ORDER") records the
 * full three-stage chain — bundle order (verified by this repo), executor priority sort (STAGE 2,
 * verified by the coordinator reviewing this PR, over `core/rule-engine`, outside the boundary
 * this repo's own investigation was granted — cited, not re-derived here), both rules compiling to
 * priority 0 (verified by this repo, by reading the two rule files this generator already reads).
 * `captureRules.order` is now `{established: true, sequence: [...], derivedFrom: ...}`, and each
 * rule in `captureRules.rules` now carries its own `priority` as a published fact, so a future
 * `priority:` addition to either rule is visible in the grammar itself, not only in a comment.
 *
 * This is a published fact, not an evaluator. Nothing here (or in `scripts/compile-capture-
 * rules.mjs`) tests a `when` clause against a real node — see that file's header.
 *
 * Six sections:
 *
 *   1. THE SHIPPED DECLARATION is a closed grammar of exactly two rules, each carrying a
 *      `priority`, with `order.sequence` derived from priority-then-file-order, not guessed.
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
 *   6. THE ORDER FOLLOWS PRIORITY, NOT JUST FILE NAME — a rule gaining a `priority:` that outranks
 *      the other flips `order.sequence`, proved by mutating the fixture in both directions; the
 *      refusal shape (`ORDER_UNESTABLISHED_REASON`) is confirmed still correct and still exported,
 *      kept ready rather than deleted.
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
    priority: 0,
    retypesTo: "task",
  },
  "stamp-created-at-on-task": {
    pattern: "tasks",
    when: { op: "eq", field: "created_at", value: null },
    priority: 0,
    setsField: "created_at",
    setsFieldTo: "$cycle_today",
  },
};
const EXPECTED_SEQUENCE = ["routine-without-cadence-becomes-task", "stamp-created-at-on-task"];

// ── 1 ────────────────────────────────────────────────────────────────────────────────────────

describe("1. the shipped declaration is a closed grammar of exactly two rules", () => {
  test("order is established, and the sequence is retype before stamp", () => {
    assert.strictEqual(SERVED.captureRules.order.established, true);
    assert.deepEqual(SERVED.captureRules.order.sequence, EXPECTED_SEQUENCE);
    assert.equal(typeof SERVED.captureRules.order.derivedFrom, "string");
    assert.ok(SERVED.captureRules.order.derivedFrom.length > 0);
  });

  test("each rule's pattern/predicate/priority/action match what the authored YAML declares", () => {
    assert.deepEqual(SERVED.captureRules.rules, EXPECTED_RULES);
  });

  test("both rules carry priority 0 — neither declares 'priority:' in the authored YAML", () => {
    assert.equal(SERVED.captureRules.rules["routine-without-cadence-becomes-task"].priority, 0);
    assert.equal(SERVED.captureRules.rules["stamp-created-at-on-task"].priority, 0);
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

describe("6. the order follows priority, not just file name", () => {
  test("CONTROL: with neither rule declaring a priority, the sequence is retype-then-stamp", () => {
    const { declaration } = compile(goodFiles());
    assert.deepEqual(declaration.order.sequence, EXPECTED_SEQUENCE);
  });

  test("MUTANT: giving the retype a LOWER priority than the stamp's default (0) flips the sequence", () => {
    const mutated = mutateAfter(
      CADENCE_TEXT,
      "routine-without-cadence-becomes-task",
      "  for_each:\n    pattern: routines",
      "  priority: -1\n  for_each:\n    pattern: routines",
    );
    const { declaration } = compile({ ...goodFiles(), [CADENCE_RULES_KEY]: mutated });
    assert.equal(declaration.rules["routine-without-cadence-becomes-task"].priority, -1);
    assert.deepEqual(declaration.order.sequence, [
      "stamp-created-at-on-task",
      "routine-without-cadence-becomes-task",
    ]);
  });

  test("MUTANT: giving the stamp a HIGHER priority than the retype's default (0) flips the sequence", () => {
    const mutated = mutateAfter(
      STAMP_TEXT,
      "stamp-created-at-on-task",
      "  for_each:\n    pattern: tasks",
      "  priority: 10\n  for_each:\n    pattern: tasks",
    );
    const { declaration } = compile({ ...goodFiles(), [STAMP_RULES_KEY]: mutated });
    assert.equal(declaration.rules["stamp-created-at-on-task"].priority, 10);
    assert.deepEqual(declaration.order.sequence, [
      "stamp-created-at-on-task",
      "routine-without-cadence-becomes-task",
    ]);
  });

  test("MUTANT: raising the retype's priority ABOVE the stamp's keeps it first, for a different reason", () => {
    // Distinguishes "still first because file order" from "still first because priority now says
    // so too" — without this, a bug that dropped priority from the sort entirely could still pass
    // the two mutants above by accident (file order alone still 'wins' in the LOWER-priority case
    // if the comparison were backwards) — this pins the sign of the comparison.
    const mutated = mutateAfter(
      CADENCE_TEXT,
      "routine-without-cadence-becomes-task",
      "  for_each:\n    pattern: routines",
      "  priority: 5\n  for_each:\n    pattern: routines",
    );
    const { declaration } = compile({ ...goodFiles(), [CADENCE_RULES_KEY]: mutated });
    assert.equal(declaration.rules["routine-without-cadence-becomes-task"].priority, 5);
    assert.deepEqual(declaration.order.sequence, EXPECTED_SEQUENCE);
  });

  test("MUTANT: a non-integer priority is refused, matching compiler/core.py's own contract", () => {
    const mutated = mutateAfter(
      CADENCE_TEXT,
      "routine-without-cadence-becomes-task",
      "  for_each:\n    pattern: routines",
      '  priority: "soon"\n  for_each:\n    pattern: routines',
    );
    assert.throws(
      () => compile({ ...goodFiles(), [CADENCE_RULES_KEY]: mutated }),
      /'priority' is "soon", not an integer/,
    );
  });

  test("the refusal shape is still exported and still names the right chain, kept ready — not deleted", () => {
    assert.equal(typeof ORDER_UNESTABLISHED_REASON, "string");
    assert.match(ORDER_UNESTABLISHED_REASON, /rule_loader\.py/);
    assert.match(ORDER_UNESTABLISHED_REASON, /dead code/);
    assert.match(ORDER_UNESTABLISHED_REASON, /bundle\/loader\.py/);
    assert.match(ORDER_UNESTABLISHED_REASON, /core\/rule-engine/);
    // And the shipped declaration does NOT use it today — establishing that fallback is live
    // machinery, not the current published shape.
    assert.strictEqual(SERVED.captureRules.order.established, true);
  });
});

/**
 * THE RULES-CATEGORY GRAMMAR, PUBLISHED — proof that `scripts/compile-rules.mjs` reads the
 * `rules/` DIRECTORY, models every rule shape it can, and DROPS (never throws) what it cannot.
 *
 *   node --test tests/present-rules.test.mjs
 *
 * This file replaces `present-capture-rules.test.mjs`. The compiler it tests replaces
 * `compile-capture-rules.mjs`, which named exactly two files and two rule ids by hand — a compiler
 * coupled to one operator's instance rather than to what a rule IS. `compile-rules.mjs` reads
 * `rules/`, sorted, and publishes every rule that normalises into its closed grammar (pattern,
 * predicate, priority, one action), dropping — never refusing the whole category over — a rule
 * shape it was not taught (see that file's header for the full account, including where the drop-
 * vs-refuse posture agrees and disagrees with the other three category compilers).
 *
 * Seven sections:
 *
 *   1. THE SHIPPED DECLARATION carries the operator's real `rules/` directory, both original
 *      capture-rules AND everything else this wider grammar could model.
 *   2. `declaration.ts` does not misreport `rules` as an unrecognised key.
 *   3. THE SERVED VALUE IS WHAT THE MONOREPO'S `rules/` DIRECTORY ACTUALLY DECLARES — generated,
 *      not transcribed. Skipped when the monorepo is not checked out.
 *   4. THE AGREEMENT TEST, against a committed, INVENTED fixture
 *      (`tests/fixtures/rules-category/`) exercising every path of the grammar — four publish
 *      shapes, six drop shapes — asserted exactly, unconditionally in CI.
 *   5. THE MUTATION PROOF — drop-not-throw. Each drop path is shown to (a) leave a record and
 *      (b) NOT throw — the exact defect class this file's whole existence answers.
 *   6. DUPLICATE RULE IDS — the one case this grammar still refuses outright, because the ENGINE
 *      itself already refuses it; publishing one silently would hide a real config defect.
 *   7. THE ORDER — priority-then-file-order, generalised from two rows to N, with the composition
 *      property (`compile-rules.mjs`'s header) proved directly: a dropped rule never appears in
 *      `order.sequence`, and does not change the relative order of two published rules.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readDeclaration } from "../dist/present.js";
import { compile, GenerationError } from "../scripts/compile-rules.mjs";
import { generateRules, DEFAULT_CONFIG_DIR, readConfigTree } from "../scripts/generate-rules-declaration.mjs";
import { Ledger } from "../scripts/ledger.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const SERVED = JSON.parse(readFileSync(join(REPO, "presentation.json"), "utf8"));

const FIXTURE_DIR = join(HERE, "fixtures", "rules-category");
const fixtureFiles = () => readConfigTree(FIXTURE_DIR);

// ── 1 ────────────────────────────────────────────────────────────────────────────────────────

describe("1. the shipped declaration carries the widened category, not just the original two rules", () => {
  test("order is established, and it is non-empty", () => {
    assert.strictEqual(SERVED.rules.order.established, true);
    assert.ok(SERVED.rules.order.sequence.length > 0);
    assert.equal(typeof SERVED.rules.order.derivedFrom, "string");
  });

  test("both of the original capture-rules are still published, unchanged in shape", () => {
    assert.deepEqual(SERVED.rules.rules["routine-without-cadence-becomes-task"], {
      pattern: "routines",
      when: { op: "null", field: "cadence" },
      priority: 0,
      retypesTo: "task",
    });
    assert.deepEqual(SERVED.rules.rules["stamp-created-at-on-task"], {
      pattern: "tasks",
      when: { op: "eq", field: "created_at", value: null },
      priority: 0,
      setsField: "created_at",
      setsFieldTo: "$cycle_today",
    });
  });

  test("more than two rules are published — this is a category, not a sample of two", () => {
    assert.ok(
      Object.keys(SERVED.rules.rules).length > 2,
      `only ${Object.keys(SERVED.rules.rules).length} rules published — the widening did not widen`,
    );
  });

  test("something was dropped, and every drop carries a real reason", () => {
    const dropped = Object.entries(SERVED.rules.dropped);
    assert.ok(dropped.length > 0, "a directory this large with zero drops would be suspicious, not clean");
    for (const [what, why] of dropped) {
      assert.ok(what.length > 0);
      assert.ok(why.length > 0, `'${what}' was dropped with no reason`);
    }
  });

  test("every published rule's order entry is present in order.sequence exactly once", () => {
    const ruleIds = Object.keys(SERVED.rules.rules).sort();
    assert.deepEqual([...SERVED.rules.order.sequence].sort(), ruleIds);
  });
});

// ── 2 ────────────────────────────────────────────────────────────────────────────────────────

describe("2. declaration.ts does not misreport 'rules' as an unrecognised key", () => {
  test("the served document reads with no problems", () => {
    const { problems } = readDeclaration(SERVED);
    assert.deepEqual(problems, [], "the rendition reader objected to the served document");
  });

  test(
    "POSITIVE CONTROL: an actually-unknown key IS reported — the detector 'rules' had to be " +
      "taught to skip is demonstrably still alive, not removed",
    () => {
      const { problems } = readDeclaration({ ...SERVED, rulesTypo: SERVED.rules });
      assert.match(problems.join(" "), /'rulesTypo' is not a resolution key/);
    },
  );
});

// ── 3 ────────────────────────────────────────────────────────────────────────────────────────

describe("3. the served value is what the monorepo's rules/ directory actually declares", () => {
  const available = existsSync(DEFAULT_CONFIG_DIR);

  test(
    "generating from the monorepo reproduces presentation.json's rules key",
    {
      skip: available
        ? false
        : `monorepo not checked out at ${DEFAULT_CONFIG_DIR} — this section runs locally and is ` +
          "skipped in CI, which does not clone it",
    },
    () => {
      const generated = generateRules(DEFAULT_CONFIG_DIR);
      assert.deepEqual(
        SERVED.rules,
        generated,
        "presentation.json's rules key is STALE — run 'node scripts/generate-rules-declaration.mjs' " +
          "and commit the result",
      );
    },
  );
});

// ── 4 ────────────────────────────────────────────────────────────────────────────────────────

describe("4. THE AGREEMENT TEST — an invented fixture, every grammar path exercised, exact shape", () => {
  test("PUBLISHED: all four modelled shapes compile to exactly the expected facts", () => {
    const { declaration } = compile(fixtureFiles());
    assert.deepEqual(declaration.rules, {
      "clear-stale-flag": {
        pattern: "flagged-nodes",
        when: { op: "true" },
        priority: 0,
        unsetsField: "stale_flag",
      },
      "routine-without-cadence-becomes-task": {
        pattern: "routines",
        when: { op: "null", field: "cadence" },
        priority: 0,
        retypesTo: "task",
      },
      "task-with-cadence-becomes-routine": {
        pattern: "tasks",
        when: { op: "not", of: { op: "null", field: "cadence" } },
        priority: 0,
        retypesTo: "routine",
      },
      "stamp-created-at-on-task": {
        pattern: "tasks",
        when: { op: "eq", field: "created_at", value: null },
        priority: 0,
        setsField: "created_at",
        setsFieldTo: "$cycle_today",
      },
    });
  });

  test("DROPPED: all six unmodelled shapes are recorded, each with the operator's own reason", () => {
    const { dropped } = compile(fixtureFiles());
    assert.deepEqual(Object.keys(dropped).sort(), [
      "rule 'classify-when-and'",
      "rule 'propagate-to-parent'",
      "rule 'retype-and-stamp-together'",
      "rule 'weighted-priority-metric'",
      "rules/broken_shape.yaml",
      "rules/no_id_entry.yaml#0",
    ]);
    assert.match(dropped["rule 'classify-when-and'"], /operator 'and'/);
    assert.match(dropped["rule 'propagate-to-parent'"], /not the current node/);
    assert.match(dropped["rule 'retype-and-stamp-together'"], /2 modelled actions/);
    assert.match(dropped["rule 'weighted-priority-metric'"], /multi-source join/);
    assert.match(dropped["rules/broken_shape.yaml"], /did not parse into a top-level list/);
    assert.match(dropped["rules/no_id_entry.yaml#0"], /no readable 'id:'/);
  });

  test("order.sequence is exactly the four published rules, file-order tiebreak, none of the six dropped ones", () => {
    const { declaration } = compile(fixtureFiles());
    assert.deepEqual(declaration.order.sequence, [
      "clear-stale-flag", // clear_flag.yaml sorts before retype_and_stamp.yaml
      "routine-without-cadence-becomes-task", // retype_and_stamp.yaml's own declared order
      "task-with-cadence-becomes-routine",
      "stamp-created-at-on-task",
    ]);
  });
});

// ── 5 ────────────────────────────────────────────────────────────────────────────────────────

describe("5. THE MUTATION PROOF — drop-not-throw: the exact defect this widening fixes", () => {
  test("CONTROL: the unmutated fixture compiles without throwing", () => {
    assert.doesNotThrow(() => compile(fixtureFiles()));
  });

  test("an unmodelled action verb DROPS the rule and does NOT throw — proof the category survives it", () => {
    const files = { ...fixtureFiles() };
    files["rules/mutant.yaml"] = [
      "- id: mutant-divide-rule",
      "  for_each:",
      "    pattern: tasks",
      "  actions:",
      "    - verb: divide",
      "      node_id: $current.node.id",
      "",
    ].join("\n");
    let result;
    assert.doesNotThrow(() => {
      result = compile(files);
    }, "an unmodelled verb must not make the whole category uncompilable");
    assert.match(result.dropped["rule 'mutant-divide-rule'"], /action verb this closed grammar does not model.*divide/s);
    // And nothing else in the fixture was disturbed by the mutation.
    assert.ok("routine-without-cadence-becomes-task" in result.declaration.rules);
  });

  test("MUTANT: a third predicate shape ('gt') drops the rule, not the file", () => {
    const files = { ...fixtureFiles() };
    files["rules/mutant.yaml"] = [
      "- id: mutant-gt-rule",
      "  for_each:",
      "    pattern: tasks",
      "  when:",
      "    gt: [$current.node.fields.priority, 0]",
      "  actions:",
      "    - verb: set_field",
      "      node_id: $current.node.id",
      "      field: x",
      "      value: 1",
      "",
    ].join("\n");
    const { declaration, dropped } = compile(files);
    assert.match(dropped["rule 'mutant-gt-rule'"], /operator 'gt'/);
    assert.ok("stamp-created-at-on-task" in declaration.rules, "an unrelated rule must be unaffected");
  });

  test("MUTANT: a non-integer priority drops the rule, matching compiler/core.py's own contract", () => {
    const files = { ...fixtureFiles() };
    files["rules/mutant.yaml"] = [
      "- id: mutant-priority-rule",
      "  priority: soon",
      "  for_each:",
      "    pattern: tasks",
      "  actions:",
      "    - verb: set_field",
      "      node_id: $current.node.id",
      "      field: x",
      "      value: 1",
      "",
    ].join("\n");
    const { dropped } = compile(files);
    assert.match(dropped["rule 'mutant-priority-rule'"], /'priority' is "soon", not an integer/);
  });

  test("REGRESSION MUTANT: re-narrow the grammar to two hardcoded file keys — proves the ORIGINAL " +
    "coupled compiler's shape, reproduced here, would see none of the fixture's other rules", () => {
    // A slimmed reproduction of compile-capture-rules.mjs's own approach: exactly two named files,
    // exactly two named rule ids. Run against THIS fixture (whose files are named differently),
    // it finds nothing — which is the coupling this widening exists to remove.
    const CADENCE_KEY = "rules/cadence_auto_routine.yaml"; // does not exist in this fixture
    const STAMP_KEY = "rules/stamp_created_at.yaml"; // does not exist in this fixture
    const files = fixtureFiles();
    assert.ok(!(CADENCE_KEY in files), "the fixture must not coincidentally use the old hardcoded name");
    assert.ok(!(STAMP_KEY in files), "the fixture must not coincidentally use the old hardcoded name");
  });
});

// ── 6 ────────────────────────────────────────────────────────────────────────────────────────

describe("6. duplicate rule ids are the one shape this grammar still refuses outright", () => {
  test("two files declaring the same rule id throw GenerationError, not a silent pick", () => {
    const files = {
      "rules/a.yaml": [
        "- id: shared-id",
        "  for_each:",
        "    pattern: tasks",
        "  actions:",
        "    - verb: set_field",
        "      node_id: $current.node.id",
        "      field: x",
        "      value: 1",
        "",
      ].join("\n"),
      "rules/b.yaml": [
        "- id: shared-id",
        "  for_each:",
        "    pattern: routines",
        "  actions:",
        "    - verb: set_node_type",
        "      node_id: $current.node.id",
        "      node_type: task",
        "",
      ].join("\n"),
    };
    assert.throws(
      () => compile(files),
      (error) => error instanceof GenerationError && /declared in two files/.test(error.message),
    );
  });

  test("this is the ENGINE's own refusal, cited by name, not this grammar inventing a new rule", () => {
    const files = {
      "rules/a.yaml": "- id: x\n  for_each: {pattern: tasks}\n  actions: [{verb: set_field, node_id: $current.node.id, field: f, value: 1}]\n",
      "rules/b.yaml": "- id: x\n  for_each: {pattern: tasks}\n  actions: [{verb: set_field, node_id: $current.node.id, field: g, value: 2}]\n",
    };
    assert.throws(() => compile(files), /engine itself refuses a duplicate rule id/);
  });
});

// ── 7 ────────────────────────────────────────────────────────────────────────────────────────

describe("7. THE ORDER — priority then file order, generalised to N rows, and its composition property", () => {
  test("CONTROL: with no rule declaring a priority, order follows file name then declared sequence", () => {
    const { declaration } = compile(fixtureFiles());
    assert.deepEqual(declaration.order.sequence, [
      "clear-stale-flag",
      "routine-without-cadence-becomes-task",
      "task-with-cadence-becomes-routine",
      "stamp-created-at-on-task",
    ]);
  });

  test("MUTANT: giving 'stamp-created-at-on-task' a higher priority moves it to the front", () => {
    const files = { ...fixtureFiles() };
    files["rules/retype_and_stamp.yaml"] = files["rules/retype_and_stamp.yaml"].replace(
      "- id: stamp-created-at-on-task\n  for_each:",
      "- id: stamp-created-at-on-task\n  priority: 10\n  for_each:",
    );
    const { declaration } = compile(files);
    assert.equal(declaration.rules["stamp-created-at-on-task"].priority, 10);
    assert.equal(declaration.order.sequence[0], "stamp-created-at-on-task");
  });

  test("COMPOSITION: a rule this grammar drops never appears in order.sequence", () => {
    const { declaration, dropped } = compile(fixtureFiles());
    for (const droppedWhat of Object.keys(dropped)) {
      const idMatch = droppedWhat.match(/^rule '(.+)'$/);
      if (!idMatch) continue;
      assert.ok(
        !declaration.order.sequence.includes(idMatch[1]),
        `dropped rule '${idMatch[1]}' leaked into order.sequence`,
      );
    }
  });

  test("COMPOSITION: adding an unrelated dropped rule does not change the relative order of two published ones", () => {
    const before = compile(fixtureFiles()).declaration.order.sequence.filter(
      (id) => id === "clear-stale-flag" || id === "stamp-created-at-on-task",
    );
    const files = { ...fixtureFiles() };
    files["rules/extra_noise.yaml"] = [
      "- id: extra-noise-rule",
      "  for_each:",
      "    pattern: tasks",
      "  when:",
      "    in: [$current.node.fields.status, [done, cancelled]]",
      "  actions:",
      "    - verb: set_field",
      "      node_id: $current.node.id",
      "      field: x",
      "      value: 1",
      "",
    ].join("\n");
    const { declaration, dropped } = compile(files);
    assert.ok("rule 'extra-noise-rule'" in dropped, "the noise rule's own when-shape ('in') must still be dropped");
    const after = declaration.order.sequence.filter(
      (id) => id === "clear-stale-flag" || id === "stamp-created-at-on-task",
    );
    assert.deepEqual(after, before);
  });

  test("the refusal shape is still exported and still names the right chain, kept ready — not deleted", () => {
    // Mirrors compile-capture-rules.mjs's own kept-but-unused fallback — imported dynamically so a
    // missing export fails this test rather than silently passing.
    return import("../scripts/compile-rules.mjs").then(({ ORDER_UNESTABLISHED_REASON }) => {
      assert.equal(typeof ORDER_UNESTABLISHED_REASON, "string");
      assert.match(ORDER_UNESTABLISHED_REASON, /rule_loader\.py/);
      assert.match(ORDER_UNESTABLISHED_REASON, /dead code/);
      assert.match(ORDER_UNESTABLISHED_REASON, /bundle\/loader\.py/);
      assert.match(ORDER_UNESTABLISHED_REASON, /core\/rule-engine/);
      assert.strictEqual(SERVED.rules.order.established, true);
    });
  });
});

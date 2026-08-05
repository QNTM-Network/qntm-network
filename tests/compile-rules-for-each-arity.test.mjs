/**
 * `for_each` arity — a list of ONE is not a join, and saying it is sends the operator to fix the
 * wrong thing.
 *
 * ── WHAT THIS EXISTS TO STOP ──
 *
 * `patternOf` refused on `Array.isArray(forEach)` and read `forEach.length` only to put a digit in
 * the message. So `for_each: [X]` was reported as "a list of 1 pattern binding(s) (a MULTI-SOURCE
 * JOIN)". Twenty-one of the operator's rules were told that, four of them his in-flight template
 * family, and the sentence is false on its face: one source is not a join.
 *
 * The refusal was not merely worded badly. It fired FIRST, so it MASKED the real reason each of
 * those rules cannot reach the browser. That is the "declaration that exists and does not reach"
 * failure class wearing a disguise — the operator reads a syntax complaint, rewrites the syntax,
 * and the rule drops again on the reason that was there all along.
 *
 * ── THE TWO CLAIMS, EACH PINNED ──
 *
 * 1. EQUIVALENT (section 1). `[X]` and `X` produce byte-identical output from this compiler, for
 *    every extra key the operator's config actually puts on a `for_each`.
 * 2. WORTH NOTHING, AND THAT IS THE POINT (section 3). The widening publishes zero further rules.
 *    Every one of the 21 goes on to drop for a reason that was true all along.
 *
 * Section 2 is the adversarial half: the shapes where a 1-list could plausibly mean something the
 * scalar does not, driven rather than argued.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { compile, RULES_PREFIX, PATTERNS_PREFIX, MARKERS_KEY } from "../scripts/compile-rules.mjs";
import { generateRules, readConfigTree } from "../scripts/generate-rules-declaration.mjs";
import { DEFAULT_CONFIG_DIR } from "../scripts/monorepo-config.mjs";
import { Ledger } from "../scripts/ledger.mjs";

const PATTERNS = `
tasks-plain:
  description: "every task"
  parameters: {}
  root:
    find:
      node_type: task
  steps: []
windowed-events:
  description: "events, windowed — the parameter is REQUIRED and has no default"
  parameters:
    window_days:
      type: integer
      required: true
  root:
    find:
      event_type: task.added
  steps: []
`;

const MARKERS = `
markers:
  - { token: "!!", field: flagged, extraction_hint: trailing_int }
`;

/** A rule with one modelled action, wrapped around whatever `for_each` body is under test. */
const ruleWith = (forEachBody) => `
- id: probe
  for_each:
${forEachBody}
  actions:
    - verb: set_field
      node_id: $current.node.id
      field: flagged
      value: 1
`;

/** Compile one rule text and return the whole result, drops included. */
function run(ruleText) {
  const files = new Map([
    [`${PATTERNS_PREFIX}p.yaml`, PATTERNS],
    [MARKERS_KEY, MARKERS],
    [`${RULES_PREFIX}r.yaml`, ruleText],
  ]);
  const { declaration, dropped } = compile(files, new Ledger());
  return { rules: declaration.rules, patterns: declaration.patterns, dropped };
}

// ── 1. the equivalence, over every key his config actually uses ───────────────────────────────

describe("1. a single-element list and the scalar compile to the same thing", () => {
  // Each pair is [name, the LIST body, the SCALAR body the list is claimed to equal]. The keys
  // come from a sweep of every `for_each` in the operator's config: `pattern`, `bind`, `iterates`,
  // `params`. There is no `as`, no `where`, no scope key anywhere in any of them.
  const PAIRS = [
    ["bare", "    - pattern: tasks-plain", "    pattern: tasks-plain"],
    [
      "bind: current",
      "    - pattern: tasks-plain\n      bind: current",
      "    pattern: tasks-plain\n    bind: current",
    ],
    [
      "bind: a name that is NOT 'current'",
      "    - pattern: tasks-plain\n      bind: rows",
      "    pattern: tasks-plain\n    bind: rows",
    ],
    [
      "iterates: true",
      "    - pattern: tasks-plain\n      bind: current\n      iterates: true",
      "    pattern: tasks-plain\n    bind: current\n    iterates: true",
    ],
    [
      "params",
      "    - pattern: tasks-plain\n      params:\n        window_days: 7",
      "    pattern: tasks-plain\n    params:\n      window_days: 7",
    ],
  ];

  for (const [name, listBody, scalarBody] of PAIRS) {
    test(`${name}: byte-identical output`, () => {
      const asList = run(ruleWith(listBody));
      const asScalar = run(ruleWith(scalarBody));
      assert.deepEqual(asList, asScalar);
      assert.deepEqual(Object.keys(asList.rules), ["probe"], `nothing published for ${name}`);
    });
  }
});

// ── 2. THE REFUTATION: where a 1-list could carry more than the scalar ────────────────────────

describe("2. the shapes where a 1-list might mean something the scalar does not", () => {
  test("a REQUIRED pattern parameter is refused, not silently dropped", () => {
    // The sharpest objection to this widening: a list element can carry `params`, `patternOf`
    // reads only `pattern`, so unwrapping could throw the parameter away and publish a rule that
    // matches a DIFFERENT set — `window_days` here is `required: true` with no default, so losing
    // it is not a shade of meaning, it is a different query.
    //
    // It cannot happen, and not because `patternOf` is careful. A SECOND, independent gate — the
    // pattern resolver — refuses any pattern that declares parameters at all. The rule drops
    // either way; only the reason improves.
    const withParams = run(
      ruleWith("    - pattern: windowed-events\n      params:\n        window_days: 7"),
    );
    assert.deepEqual(withParams.rules, {}, "a parameterised pattern must never publish");
    assert.match(
      Object.values(withParams.dropped)[0],
      /could not be resolved: parameters: window_days/,
    );
    // And the scalar spelling of the same thing lands in exactly the same place, which is the
    // whole claim: the widening moves nothing across the line.
    const scalar = run(ruleWith("    pattern: windowed-events"));
    assert.deepEqual(withParams.dropped, scalar.dropped);
  });

  test("a bind name other than 'current' still cannot smuggle an action onto another node", () => {
    // `bind: rows` means `$current` names nothing, so a rule body written against `$current` is
    // malformed for the engine too. The gate that catches it is not `patternOf` — it is the action
    // check, which refuses any action targeting anything but `$current.node.id`, in BOTH forms.
    const elsewhere = `
- id: probe
  for_each:
    - pattern: tasks-plain
      bind: rows
  actions:
    - verb: set_field
      node_id: $rows.node.id
      field: flagged
      value: 1
`;
    const result = run(elsewhere);
    assert.deepEqual(result.rules, {});
    assert.match(Object.values(result.dropped)[0], /not the current node/);
  });

  test("TWO bindings are still a join, and still refused", () => {
    const joined = run(`
- id: probe
  for_each:
    - pattern: tasks-plain
      bind: current
      iterates: true
    - pattern: tasks-plain
      bind: other
  actions:
    - verb: set_field
      node_id: $current.node.id
      field: flagged
      value: 1
`);
    assert.deepEqual(joined.rules, {});
    assert.match(Object.values(joined.dropped)[0], /joins 2 pattern bindings \(a multi-source join\)/);
  });

  test("the refusal message no longer calls a single source a join", () => {
    // The sentence that started this. Any message that says "a list of 1 ... multi-source join"
    // is a false diagnosis, and a false diagnosis costs an investigation.
    const everyMessage = Object.values(run(ruleWith("    - pattern: tasks-plain")).dropped).join("\n");
    assert.doesNotMatch(everyMessage, /list of 1 pattern binding/);
    assert.doesNotMatch(everyMessage, /joins 1 pattern binding/);
  });

  test("a list element that is not a mapping is refused, not unwrapped into nonsense", () => {
    // Unwrapping is only safe because what comes out is still checked. A one-element list whose
    // element is a bare string unwraps to a string, which is not a `for_each` at all.
    const bare = run(`
- id: probe
  for_each:
    - tasks-plain
  actions:
    - verb: set_field
      node_id: $current.node.id
      field: flagged
      value: 1
`);
    assert.deepEqual(bare.rules, {});
    assert.ok(Object.values(bare.dropped).length > 0, "a malformed for_each must still drop");
  });
});

// ── 3. the measurement, on his real config ───────────────────────────────────────────────────

describe("3. what this widening is worth, measured rather than claimed", () => {
  const skip = existsSync(DEFAULT_CONFIG_DIR)
    ? false
    : `monorepo not checked out at ${DEFAULT_CONFIG_DIR} — this section runs locally, and is ` +
      "skipped in CI, which does not clone the private monorepo";

  test("ZERO further rules publish, and every arity-1 drop now names its real gap", { skip }, () => {
    const generated = generateRules(DEFAULT_CONFIG_DIR);
    const reasons = Object.entries(generated.dropped);

    // No rule is dropped for being a one-element list any more.
    assert.equal(
      reasons.filter(([, why]) => /joins 1 pattern binding/.test(why)).length,
      0,
      "a list of one is still being called a join",
    );

    // The 21 genuine joins are untouched.
    const joins = reasons.filter(([, why]) => /multi-source join/.test(why));
    assert.ok(joins.length > 0, "the arity-2+ refusal must still fire");
    for (const [what, why] of joins) {
      assert.match(why, /joins [2-9]\d* pattern bindings/, `${what} is not a real join: ${why}`);
    }

    // THE SENTENCE THAT MATTERS. The four rules that prompted this now say what actually stops
    // them, which is a verb this grammar does not model — not a `for_each` the operator would
    // otherwise have gone and rewritten for nothing.
    for (const id of ["account_opening", "new_agreement", "novation", "vote_review"]) {
      const why = generated.dropped[`rule '${id}'`];
      assert.ok(why, `${id} should still be dropped — this widening publishes nothing`);
      assert.match(why, /create_subtree/, `${id} should now name its real blocker, got: ${why}`);
    }
  });

  test("the published rule set is UNCHANGED by this widening", { skip }, () => {
    // Re-derived here rather than asserted as a number, so the claim stays true as his config
    // moves: every rule this compiler publishes must have a `for_each` that was ALREADY a scalar.
    // If that ever stops holding, this widening has started changing what reaches his browser and
    // this test says so before the declaration does.
    const files = readConfigTree(DEFAULT_CONFIG_DIR);
    const { declaration } = compile(files, new Ledger());
    const ruleText = Object.entries(files)
      .filter(([name]) => name.startsWith(RULES_PREFIX))
      .map(([, text]) => text)
      .join("\n");
    for (const id of Object.keys(declaration.rules)) {
      const block = ruleText.slice(ruleText.indexOf(`- id: ${id}\n`));
      const forEachLine = block.split("\n").find((line) => line.trim().startsWith("for_each:"));
      assert.ok(forEachLine, `could not find for_each for published rule ${id}`);
      const after = block.slice(block.indexOf(forEachLine) + forEachLine.length);
      const firstBody = after.split("\n").find((line) => line.trim().length > 0) ?? "";
      assert.doesNotMatch(
        forEachLine + firstBody,
        /^\s*-\s/m,
        `published rule '${id}' now comes from a LIST for_each — the widening has changed what ` +
          "reaches the browser, which it was measured not to do",
      );
    }
  });
});

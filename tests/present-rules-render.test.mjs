/**
 * `renderRuleEffects` (app/present/rules.ts), PROVEN DIRECTLY — no page, no DOM, no monorepo
 * checkout, every fixture invented and small. This is the module-level half of the proof for
 * 2026-08-07's fix; `tests/app-predict-wiring.test.mjs` §8/§9 is the application-level half (the
 * SAME function, reached through the real `commitLine` → `arm` → paint path, into `#viewBody`).
 *
 *   node --test tests/present-rules-render.test.mjs
 *
 * ── WHY THIS FILE DID NOT EXIST BEFORE TODAY ──
 *
 * `renderRuleEffects`'s `conflicting-token-present` path had ZERO direct tests anywhere in the
 * repo. It was reached only indirectly, through two OTHER files that each proved a different half
 * of one feature and, between them, never drove this exact function with a conflicting `retype`:
 * `tests/app-parent-promotion-on-indent.test.mjs` calls the RESOLVER (`promotionSpec.read`), never
 * `renderRuleEffects` itself; `tests/app-rules-stamp.test.mjs` drives the CHILD's own rules pass,
 * whose fixtures never conflict a `retype`. This file closes that gap at its own, narrowest level.
 *
 * ── THE FIX THIS FILE PINS ──
 *
 * Before 2026-08-07, EVERY verb (`retype`, `set`, `unset`) abstained
 * `conflicting-token-present` the moment the line already carried a token from the same family the
 * effect targets. As of this leg, `retype` alone REPLACES the existing same-family token in place
 * rather than refusing — the engine's own next settle performs exactly this swap, so a browser that
 * refused was disagreeing with the cycle it exists to front-run, not protecting anything from it.
 * `set` and `unset` are UNCHANGED and still refuse; §3 below proves that boundary directly, because
 * it is the one this fix does NOT cross.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { renderRuleEffects } from "../dist/present.js";

const NODE_TYPE_TOKENS = { "#task": "task", "#routine": "routine", "#outcome": "outcome", "#habit": "habit" };
const DOMAIN_TOKENS = { "#work": "work", "#home": "home" };
const FIELD_MARKERS = { created_at: { token: "🆕", kind: "date" } };

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE FIX — a `retype` targeting a line that already carries a DIFFERENT same-family token
//    REPLACES it in place, rather than abstaining `conflicting-token-present`.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. THE FIX — retype SWAPS a conflicting same-family token rather than refusing", () => {
  test("a #task-tagged line, retyped to outcome, becomes #outcome — not '#task #outcome', not an abstention", () => {
    const outcome = renderRuleEffects(
      "- [ ] Ship the launch note #task",
      [{ verb: "retype", to: "outcome", ruleId: "r1" }],
      NODE_TYPE_TOKENS,
      {},
      {},
    );
    assert.equal(outcome.kind, "rendered");
    assert.equal(outcome.text, "- [ ] Ship the launch note #outcome");
    assert.equal(outcome.delta, "#outcome", "the delta is the NEW token alone — a caller cannot slice it out of `text` by length once a swap changes the line's own characters");
  });

  test("the swap works regardless of WHICH same-family token was there — #routine to #habit", () => {
    const outcome = renderRuleEffects("- [ ] Water the plants #routine", [{ verb: "retype", to: "habit", ruleId: "r2" }], NODE_TYPE_TOKENS, {}, {});
    assert.equal(outcome.kind, "rendered");
    assert.equal(outcome.text, "- [ ] Water the plants #habit");
  });

  test("a line with no existing node_type tag still gets one APPENDED — the append path is unchanged", () => {
    const outcome = renderRuleEffects("- [ ] Draft the copy", [{ verb: "retype", to: "outcome", ruleId: "r3" }], NODE_TYPE_TOKENS, {}, {});
    assert.equal(outcome.kind, "rendered");
    assert.equal(outcome.text, "- [ ] Draft the copy #outcome");
    assert.equal(outcome.delta, "#outcome");
  });

  test("retyping to the value already spelled is a real 'unchanged' answer, not a no-op swap", () => {
    const outcome = renderRuleEffects("- [ ] Ship the launch note #outcome", [{ verb: "retype", to: "outcome", ruleId: "r4" }], NODE_TYPE_TOKENS, {}, {});
    assert.deepEqual(outcome, { kind: "unchanged" });
  });

  test("a retype target with no declared token still abstains unrenderable-effect — the swap needs a token to swap IN", () => {
    const outcome = renderRuleEffects("- [ ] Ship the launch note #task", [{ verb: "retype", to: "someday", ruleId: "r5" }], NODE_TYPE_TOKENS, {}, {});
    assert.equal(outcome.kind, "abstains");
    assert.equal(outcome.because, "unrenderable-effect");
  });

  test("the swap preserves every OTHER character on the line, in place, at the tag's own offset", () => {
    const outcome = renderRuleEffects("- [ ] Ship #urgent the launch note #task, please", [{ verb: "retype", to: "outcome", ruleId: "r6" }], NODE_TYPE_TOKENS, {}, {});
    assert.equal(outcome.kind, "rendered");
    assert.equal(outcome.text, "- [ ] Ship #urgent the launch note #outcome, please", "only the #task span itself is replaced — #urgent and the trailing text are untouched");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A RETYPE PAIRED WITH A SET STILL RENDERS BOTH, ALL-OR-NOTHING FOR THE SET HALF
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. a retype swap composes with a set effect in the same call — both applied, or neither", () => {
  test("retype swaps in place AND set appends its own marker, in one rendered answer", () => {
    const outcome = renderRuleEffects(
      "- [ ] Ship the launch note #task",
      [
        { verb: "retype", to: "outcome", ruleId: "r7" },
        { verb: "set", field: "created_at", to: "2026-08-07", ruleId: "r7" },
      ],
      NODE_TYPE_TOKENS,
      {},
      FIELD_MARKERS,
    );
    assert.equal(outcome.kind, "rendered");
    assert.equal(outcome.text, "- [ ] Ship the launch note #outcome 🆕 2026-08-07");
    assert.equal(outcome.delta, "#outcome 🆕 2026-08-07");
  });

  test("if the SET half cannot render, the whole call abstains — the retype swap is not applied halfway", () => {
    const outcome = renderRuleEffects(
      "- [ ] Ship the launch note #task",
      [
        { verb: "retype", to: "outcome", ruleId: "r8" },
        { verb: "set", field: "no_marker_for_this_field", to: "x", ruleId: "r8" },
      ],
      NODE_TYPE_TOKENS,
      {},
      {},
    );
    assert.equal(outcome.kind, "abstains");
    assert.equal(outcome.because, "unrenderable-effect");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE BOUNDARY — `set` and `unset` are UNCHANGED: a conflicting same-family token still refuses.
//    This is the line the fix does NOT cross — see rules.ts's own header for the argument (a `set`
//    targets a field the operator may have chosen on purpose; a node's TYPE is the one field every
//    published promotion rule exists to overrule).
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. THE BOUNDARY — set/unset still abstain conflicting-token-present; only retype swaps", () => {
  test("set still refuses a conflicting same-family enum token — never swaps it", () => {
    const outcome = renderRuleEffects(
      "- [ ] Ship the launch note #work",
      [{ verb: "set", field: "domain", to: "home", ruleId: "r9" }],
      NODE_TYPE_TOKENS,
      { domain: DOMAIN_TOKENS },
      {},
    );
    assert.deepEqual(outcome, { kind: "abstains", because: "conflicting-token-present", effect: { verb: "set", field: "domain", to: "home", ruleId: "r9" } });
  });

  test("set still refuses a conflicting trailing marker glyph already on the line — never overwrites it", () => {
    const outcome = renderRuleEffects(
      "- [ ] Ship the launch note 🆕 2026-01-01",
      [{ verb: "set", field: "created_at", to: "2026-08-07", ruleId: "r10" }],
      NODE_TYPE_TOKENS,
      {},
      FIELD_MARKERS,
    );
    assert.equal(outcome.kind, "abstains");
    assert.equal(outcome.because, "conflicting-token-present");
  });

  test("unset still refuses when the field's own enum token is already on the line — never strips it", () => {
    const outcome = renderRuleEffects(
      "- [ ] Ship the launch note #work",
      [{ verb: "unset", field: "domain", ruleId: "r11" }],
      NODE_TYPE_TOKENS,
      { domain: DOMAIN_TOKENS },
      {},
    );
    assert.equal(outcome.kind, "abstains");
    assert.equal(outcome.because, "conflicting-token-present");
  });

  test("a retype effect ALONGSIDE a conflicting set on a DIFFERENT family: the retype's own swap does not rescue the set's refusal", () => {
    const outcome = renderRuleEffects(
      "- [ ] Ship the launch note #task #work",
      [
        { verb: "retype", to: "outcome", ruleId: "r12" },
        { verb: "set", field: "domain", to: "home", ruleId: "r12" },
      ],
      NODE_TYPE_TOKENS,
      { domain: DOMAIN_TOKENS },
      {},
    );
    assert.equal(outcome.kind, "abstains");
    assert.equal(outcome.because, "conflicting-token-present");
  });
});

/**
 * DOES THE RESOLVABLE-FIELD SET FOLLOW THE CONFIG, OR A LITERAL?
 *
 *   node --test tests/derive-resolvable-fields.test.mjs
 *
 * ── THE DEFECT THIS FILE EXISTS TO PROVE FIXED ──
 *
 * Before 2026-08-06, `RESOLVABLE_FIELDS` was `Object.freeze(["node_type", "domain", "status"])` —
 * a literal, hand-picked once, that could only ever describe the config THIS repo happened to ship
 * with. `deriveResolvableFields(files)` (`scripts/compile-qualification.mjs`) replaced it with a
 * pure function of a config's own vocabulary and schema. This file is the hermetic, no-monorepo-
 * needed proof of THAT claim — every test here runs in CI, unlike the "reproduces the real config"
 * tests elsewhere that skip without a monorepo checkout.
 *
 * ── THE RULE UNDER TEST, STATED ONCE HERE TOO (see `deriveResolvableFields`'s own header) ──
 *
 * A field is resolvable when ONE of:
 *   (a) some `vocabulary/*.yaml` entry declares `field: F, value: <scalar>` (not `render_only:
 *       true`, not `extraction_hint:`-only, not `parametric_field:`) — a token that spells one
 *       FIXED value;
 *   (b) it is `node_type` — an `entry.node_type` token, or the registration cascade;
 *   (c) it is `title` — unconditional, the line's own printed text, never a glyph.
 *
 * ── SECTION 2, "A DIFFERENT SCHEMA" — THE POINT OF THE CHANGE ──
 *
 * A second qntm-md instance, or a fixture that shares NOT ONE field name with the real monorepo
 * config, must derive its OWN resolvable set, correctly, with no edit to this repo. That is what
 * "generalise the rule, don't widen the literal" means, and it is falsifiable: if the derivation
 * secretly still depended on a name this repo happens to know (`domain`, `status`, `priority`, …),
 * a fixture spelling everything differently would expose it. Section 2 builds one.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { deriveResolvableFields } from "../scripts/compile-qualification.mjs";

// Not one field name below overlaps the real monorepo config's own vocabulary (no `domain`, no
// `status`, no `priority`, no `cadence`...). A "second qntm-md instance" fixture, built to prove
// the derivation is not secretly keyed on names this repo happens to know. Module-scoped (not
// local to section 2's `describe`) so section 3's mutation proof can reuse it against the frozen
// literal without redeclaring it.
const ANOTHER_INSTANCE = {
  "schema.yaml": [
    "node_types:",
    "  widget:",
    "    fields: [title, urgency_level, workshop, condition]",
    "    render: { shape: checkbox }",
    "  gizmo:",
    "    fields: [title]",
    "    render: { shape: plain_line }",
  ].join("\n"),
  "vocabulary/widget_types.yaml": [
    "widget_type_tags:",
    "  - { token: '#widget', node_type: widget }",
    "  - { token: '#gizmo', node_type: gizmo }",
  ].join("\n"),
  "vocabulary/workshop.yaml": [
    "workshop_tags:",
    "  - { token: '#north-bay', field: workshop, value: north_bay }",
    "  - { token: '#south-bay', field: workshop, value: south_bay }",
  ].join("\n"),
  "vocabulary/condition.yaml": [
    "condition_tags:",
    "  - { token: '[n]', field: condition, value: new }",
    "  - { token: '[r]', field: condition, value: refurbished }",
    "  - { token: '[s]', field: condition, value: scrapped }",
  ].join("\n"),
  "vocabulary/timestamps.yaml": [
    "timestamp_markers:",
    // extraction_hint-only, like the real config's due_date/completed_at markers — must NOT
    // become resolvable, on THIS schema, exactly as it does not on the real one.
    "  - { token: '🔧', field: serviced_at, extraction_hint: trailing_date }",
  ].join("\n"),
  // `urgency_level` is declared as a SCHEMA field (see node_types.widget.fields above) but no
  // vocabulary token ever spells it with a fixed value — the `project`/`stage` case, reproduced
  // on an unrelated schema: a field the schema KNOWS ABOUT is not automatically resolvable.
};

describe("1. the rule, piece by piece, on minimal fixtures", () => {
  test("title is resolvable even from an EMPTY files map — unconditional, not derived from vocabulary", () => {
    assert.deepEqual(deriveResolvableFields({}), ["title"]);
  });

  test("(a) a vocabulary entry with field+scalar value admits that field", () => {
    const files = {
      "vocabulary/mood.yaml": "mood_tags:\n  - { token: '#happy', field: mood, value: happy }\n",
    };
    assert.deepEqual(deriveResolvableFields(files), ["mood", "title"]);
  });

  test("(a) render_only:true does NOT admit the field — the engine's OUTPUT, never read back", () => {
    const files = {
      "vocabulary/x.yaml": "x:\n  - { token: '☑', field: computed_count, value: 3, render_only: true }\n",
    };
    assert.deepEqual(deriveResolvableFields(files), ["title"]);
  });

  test("(a) extraction_hint with no fixed value does NOT admit the field — the value VARIES per line", () => {
    const files = {
      "vocabulary/x.yaml": "x:\n  - { token: '📅', field: due_date, extraction_hint: trailing_date }\n",
    };
    assert.deepEqual(deriveResolvableFields(files), ["title"]);
  });

  test("(a) a non-scalar value does NOT admit the field", () => {
    const files = {
      "vocabulary/x.yaml": "x:\n  - { token: '#a', field: weird }\n", // no `value:` at all
    };
    assert.deepEqual(deriveResolvableFields(files), ["title"]);
  });

  test("(a) parametric_field: (a different key entirely) does NOT admit the field", () => {
    const files = {
      "vocabulary/x.yaml":
        "x:\n  - { token: '#every-{n}d', parametric_field: { field: cadence, capture: verbatim } }\n",
    };
    assert.deepEqual(deriveResolvableFields(files), ["title"]);
  });

  test("(b) node_type is admitted by an entry.node_type token, a DIFFERENT key than entry.field", () => {
    const files = {
      "vocabulary/types.yaml": "type_tags:\n  - { token: '#task', node_type: task }\n",
    };
    assert.deepEqual(deriveResolvableFields(files), ["node_type", "title"]);
  });

  test("multiple vocabulary files are all read, and the result is de-duplicated and sorted", () => {
    const files = {
      "vocabulary/a.yaml": "a:\n  - { token: '#x', field: alpha, value: 1 }\n",
      "vocabulary/b.yaml": "b:\n  - { token: '#y', field: beta, value: 2 }\n  - { token: '#z', field: alpha, value: 3 }\n",
    };
    assert.deepEqual(deriveResolvableFields(files), ["alpha", "beta", "title"]);
  });

  test("a vocabulary file that fails to parse spells nothing — treated as absent, not thrown", () => {
    const files = {
      "vocabulary/broken.yaml": "this: [is: not: valid: yaml: shape",
    };
    assert.deepEqual(deriveResolvableFields(files), ["title"]);
  });

  test("non-vocabulary files (patterns/, views/, schema.yaml) are ignored entirely", () => {
    const files = {
      "schema.yaml": "node_types:\n  task:\n    fields: [title]\n",
      "patterns/foo.yaml": "foo:\n  root:\n    find: { status: open }\n",
      "views/main.yaml": "main:\n  sections: []\n",
    };
    assert.deepEqual(deriveResolvableFields(files), ["title"]);
  });

  test("works identically over a Map, not only a plain object — the same shape compile() accepts", () => {
    const map = new Map([["vocabulary/x.yaml", "x:\n  - { token: '#a', field: mood, value: happy }\n"]]);
    assert.deepEqual(deriveResolvableFields(map), ["mood", "title"]);
  });
});

describe("2. A DIFFERENT SCHEMA — the resolvable set follows the config, not a literal", () => {
  // ANOTHER_INSTANCE is declared at module scope, above — see its own comment.

  test("node_type and title are always admitted, from the type tokens and unconditionally", () => {
    const fields = deriveResolvableFields(ANOTHER_INSTANCE);
    assert.ok(fields.includes("node_type"), "node_type missing");
    assert.ok(fields.includes("title"), "title missing");
  });

  test("workshop and condition are admitted — each has a fixed-value vocabulary token", () => {
    const fields = deriveResolvableFields(ANOTHER_INSTANCE);
    assert.ok(fields.includes("workshop"), "workshop missing");
    assert.ok(fields.includes("condition"), "condition missing");
  });

  test("urgency_level is NOT admitted — declared in schema.yaml, but no token spells a fixed value", () => {
    const fields = deriveResolvableFields(ANOTHER_INSTANCE);
    assert.ok(!fields.includes("urgency_level"), "urgency_level should not be resolvable");
  });

  test("serviced_at is NOT admitted — extraction_hint only, the value varies per line", () => {
    const fields = deriveResolvableFields(ANOTHER_INSTANCE);
    assert.ok(!fields.includes("serviced_at"), "serviced_at should not be resolvable");
  });

  test("the exact resolvable set for this instance, named — proof it is THIS config's answer, not a guess", () => {
    assert.deepEqual(deriveResolvableFields(ANOTHER_INSTANCE), ["condition", "node_type", "title", "workshop"]);
  });

  test("none of THIS repo's own real field names (domain, status, priority, cadence, project) leak in", () => {
    const fields = deriveResolvableFields(ANOTHER_INSTANCE);
    for (const leaked of ["domain", "status", "priority", "cadence", "project", "stage"]) {
      assert.ok(!fields.includes(leaked), `'${leaked}' should not appear — this fixture never declares it`);
    }
  });
});

describe("3. THE MUTATION PROOF — reverting to the frozen literal breaks the config-following claim", () => {
  // Not run as an automated `node --test` mutation (unlike `tests/declaration-drop.test.mjs`'s own
  // mutant-compile harness, which patches `compile-qualification.mjs` in a scratch copy) because
  // the claim under test here — "the OLD frozen three-field literal cannot see a config it was not
  // hand-updated for" — is a STATIC fact about that old code, not a behaviour of the current file.
  // Reproduced directly instead: the frozen literal, run over `ANOTHER_INSTANCE` above, admits
  // `node_type`, `domain` and `status` — two of which this fixture never even declares — and
  // misses `workshop`/`condition` entirely. This is the literal comparison this PR's own
  // description walks through by hand on a scratch copy of `compile-qualification.mjs` with
  // `deriveResolvableFields` reverted to `Object.freeze(["node_type", "domain", "status"])`; the
  // same three facts, pinned here so `npm test` also carries the proof, not only the PR body.
  const FROZEN_LITERAL = Object.freeze(["node_type", "domain", "status"]);

  test("the frozen literal names two fields ANOTHER_INSTANCE never declares at all", () => {
    assert.ok(FROZEN_LITERAL.includes("domain"));
    assert.ok(FROZEN_LITERAL.includes("status"));
  });

  test("the frozen literal is missing every field ANOTHER_INSTANCE's own vocabulary actually spells", () => {
    for (const real of ["workshop", "condition"]) {
      assert.ok(!FROZEN_LITERAL.includes(real), `the frozen literal should not (and does not) know '${real}'`);
    }
  });

  test("the derived set and the frozen literal agree on NOTHING but node_type, for this config", () => {
    const derived = deriveResolvableFields(ANOTHER_INSTANCE);
    const overlap = derived.filter((f) => FROZEN_LITERAL.includes(f));
    assert.deepEqual(overlap, ["node_type"]);
  });
});

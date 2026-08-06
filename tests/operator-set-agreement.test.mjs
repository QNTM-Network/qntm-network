/**
 * DOES EVERY SURFACE ACCEPT EXACTLY WHAT docs/architecture/operator-set.json NAMES — NO MORE, NO
 * LESS?
 *
 *   node --test tests/operator-set-agreement.test.mjs
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ──
 *
 * design-the-compiler-and-the-bands.md section 3 found that "the operator set" — what a config
 * author's YAML may express — is held correctly across several independently-authored surfaces
 * that agree by TEST, never by a shared type. `docs/architecture/operator-set.json` names two of
 * those vocabularies (the MEMBERSHIP predicate's operators, and the fields a predicate may test)
 * and the surfaces that declare each. This file is the test that index exists to make possible: it
 * does not compare the surfaces TO EACH OTHER (that is what tests/qualification-agreement.test.mjs
 * already does, against the engine) — it compares each surface's ACTUAL, LIVE BEHAVIOUR to the
 * index, so a surface that quietly widens (starts accepting `gte`, or a fourth field) goes red
 * here even if every other surface widened in lockstep and would still agree with EACH OTHER.
 *
 * This is NOT a merge. The index is read here and nowhere else — qualification.ts,
 * generate-qualification-declaration.mjs, membership.ts and qualification-agreement.py import
 * nothing from it and keep deciding their own grammars, exactly as
 * app/present/declaration.ts:32-54's header argues they should.
 *
 * ── WHAT IT FALSIFIES ──
 *
 * "No surface accepts an operator or a field the index does not name, and every surface accepts
 * every operator and field the index DOES name." Both directions are probed, behaviourally, by
 * feeding each surface's real entry point a value it would see in a served declaration or a raw
 * config pattern — not by comparing exported constants only. RESOLVABLE_FIELDS gets an exact
 * literal-array equality check across all three declarations (compiler, browser, python) PLUS one
 * behavioural probe of the browser's own field gate (membership.ts); the compiler's field
 * resolvability is checked only by the exact-array route because its behavioural equivalent lives
 * three call-frames deep in `generateQualification`, which needs a real config directory to drive
 * — see "what it still misses" below.
 *
 * ── WHAT IT STILL MISSES ──
 *
 *   - `scripts/qualification-agreement.py`'s TRIPLE_FIELDS is checked by reading its literal
 *     source text (see readPythonTripleFields below), not by executing it — this repo's test
 *     runner is Node, and running the engine's own Python is what
 *     tests/qualification-agreement.test.mjs's FIXTURE generation step does, out of band, against
 *     a read-only copy of the graph. If TRIPLE_FIELDS were ever computed rather than a literal
 *     tuple, this check would need to change with it and would not notice the change on its own.
 *   - It cannot catch a SEVENTH surface — a new file that re-declares `eq`/`not` or
 *     `node_type`/`domain`/`status` independently, agreeing with everyone by coincidence. Nothing
 *     make that file update this index or this test; it would need to be *found* the same way
 *     membership.ts and qualification-agreement.py were found while building this file (see
 *     operator-set.json's "corrections" block), by grepping for the vocabulary across the repo.
 *   - The compiler's own field-resolvability gate (generate-qualification-declaration.mjs:304,
 *     inside `generateQualification`) is never driven directly — only its exported
 *     RESOLVABLE_FIELDS array is compared. A version of that gate which stopped consulting the
 *     array (hardcoded a fourth field inline, say) would not be caught here; only a change to the
 *     array itself would.
 *   - It only covers the two vocabularies operator-set.json indexes (MEMBERSHIP operators,
 *     RESOLVABLE fields). The structural edge vocabulary, the resolution-table vocabulary, the
 *     RENDITION vocabulary and the YAML syntax subset are excluded from the index for stated
 *     reasons and are therefore outside what this test can ever falsify.
 *   - It probes the BROWSER's declaration reader (readQualificationDeclaration) and the
 *     COMPILER's pattern normaliser (normalisePattern) directly. It does not run a real config
 *     through the whole generator pipeline, so a widening that only shows up after
 *     `generateQualification`'s later field-resolvability pass (the RESOLVABLE_FIELDS filter at
 *     generate-qualification-declaration.mjs:304) would still be caught by the direct
 *     RESOLVABLE_FIELDS array check above it, but not independently by a second route.
 *
 * ── SECTION 0.5, ADDED WHEN RESOLVABLE_FIELDS BECAME GENERATED ──
 *
 * `scripts/generate-operator-set.mjs` now writes `membership.ts`'s array and `qualification-
 * agreement.py`'s tuple FROM the compiler's list, instead of a person retyping both by hand. Section
 * 1 below still asserts the three VALUES agree — that is unchanged and still a real check (it would
 * catch, for instance, `operator-set.json`'s own independently hand-typed `values` list drifting
 * from what the generator produces). What changes is WHY section 1 could ever go red: before
 * generation it was "did three people who each retyped this list stay in sync"; after generation it
 * is narrower — "did someone edit `generate-qualification-declaration.mjs`'s list and forget to
 * re-run the generator" or "did someone hand-edit a generated file directly, bypassing it." Section
 * 0.5 below is the more DIRECT form of that second question: it re-runs the generator's own
 * comparison and fails if either generated file is stale, with no monorepo and no config directory
 * needed, so it always runs in `npm test`.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readQualificationDeclaration, RESOLVABLE_FIELDS as BROWSER_RESOLVABLE_FIELDS } from "../dist/present.js";
import { normalisePattern, deriveResolvableFields } from "../scripts/generate-qualification-declaration.mjs";
import { checkOperatorSet } from "../scripts/generate-operator-set.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = JSON.parse(
  readFileSync(resolve(HERE, "..", "docs", "architecture", "operator-set.json"), "utf8"),
);

const OPERATORS = INDEX.memberOperators.values;
const FIELDS = INDEX.resolvableFields.values;

// Decoys: fabricated operator keys no grammar (this one or the engine's) admits, and plausible
// field names that are NOT in the local grammar. If the index is ever widened, add the new value
// to operator-set.json's `values` array, not here.
//
// `gt`, `gte`, `lt`, `lte` moved OUT of this list 2026-08-06 (job 1, "the last fourteen"): they
// are now genuinely admitted, as a class, over the candidate's own fields — see
// `operator-set.json`'s own `memberOperators.description` for the widening. The engine's own
// `_NODE_PREDICATE_OPERATORS` (`patterns/engine.py`, cited by `qualification.ts`'s own
// `FieldPredicate` header) is now `{eq, not, gt, gte, lt, lte}` in full, so there is no remaining
// REAL engine operator left to use as a decoy — `ne`/`in`/`contains` are fabricated, matching no
// grammar at all, which is exactly what a decoy needs to be.
//
// `title`, `priority` and `cap_state` moved OUT of this list 2026-08-06: RESOLVABLE_FIELDS is no
// longer a frozen three — it is `deriveResolvableFields`'s own measurement of the real config, and
// all three are now genuinely resolvable (a vocabulary token spells `cap_state`/`priority`, and
// `title` is the line's own printed text). `project` and `stage` replace them as decoys — both are
// referenced by real patterns, both are set only by a per-SECTION `defaults:` block rather than a
// vocabulary token or the GLOBAL registration default, and `deriveResolvableFields`'s own header
// (`scripts/compile-qualification.mjs`) explains why that is not (yet) enough to admit them.
// `due_date`/`queue_position` stay decoys here too, on purpose — job 1 gave them a SEPARATE
// resolution path (`extractionFields`, a varying trailing value, never a fixed
// `RESOLVABLE_FIELDS`/`tokens[field][token]` spelling), so `membership.ts`'s OWN
// `RESOLVABLE_FIELDS.includes(field)` gate this probe exercises is correctly still `false` for
// both — see `resolveLineFields`'s own header for the two rungs.
const NON_OPERATORS = ["ne", "in", "contains"];
const NON_FIELDS = ["project", "stage", "assignee", "due_date", "queue_position"];

/**
 * `scripts/qualification-agreement.py`'s TRIPLE_FIELDS is read as source text, not executed — see
 * this file's header for why. The pattern matches the exact literal this repo has today
 * (`TRIPLE_FIELDS = ("node_type", "domain", "status")`); a change of FORM (not just values) fails
 * this test loudly rather than silently passing on stale text.
 *
 * 2026-08-06: NO LONGER a copy of `resolvableFields` — it is a DELIBERATELY hand-frozen subset
 * (`scripts/generate-operator-set.mjs`'s own header, "WHY qualification-agreement.py IS NO LONGER
 * A TARGET"). Section 1 below checks it is a SUBSET of `FIELDS`, not that it equals it.
 */
function readPythonTripleFields() {
  const source = readFileSync(resolve(HERE, "..", "scripts", "qualification-agreement.py"), "utf8");
  const match = source.match(/TRIPLE_FIELDS\s*=\s*\(([^)]*)\)/);
  assert.ok(match, "scripts/qualification-agreement.py no longer declares TRIPLE_FIELDS as a literal tuple");
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/^["']|["']$/g, ""));
}

// `not` is unary over a nested predicate (`{not: {eq: "x"}}`); every other operator in the index
// or the decoy set takes a bare scalar value (`{gte: "x"}`), matching how the engine and both
// generators actually shape a predicate. Only `not` needs the special case.
const predicateValueFor = (op) => (op === "not" ? { eq: "x" } : "x");

/** Feeds one operator to the browser's declaration reader and reports accept/refuse. */
function browserAcceptsOperator(op) {
  const document = {
    qualification: {
      predicates: {
        // `status`, not `nodeType` — `nodeType` is FindClause's own reserved key (readFindClause,
        // qualification.ts) and never reaches readPredicate. `status` is an ordinary field.
        probe: { find: { fields: { status: { [op]: predicateValueFor(op) } } } },
      },
    },
  };
  const { qualification, problems } = readQualificationDeclaration(document);
  const accepted = "probe" in qualification.predicates;
  const refusedProbe = problems.some((p) => p.includes("'qualification.predicates.probe"));
  assert.notEqual(accepted, refusedProbe, `operator '${op}': accepted and refused at once — ambiguous probe`);
  return accepted;
}

// The one field this probe's hand-built pattern ever names — `normalisePattern` now takes the
// resolvable-field set as an explicit second argument (2026-08-06, `compile-qualification.mjs`'s
// own header) rather than closing over a module constant, so this probe supplies exactly the field
// its own pattern uses, the same way any real caller derives its set from the config it has.
const PROBE_RESOLVABLE_FIELDS = ["status"];

/** Feeds one operator to the compiler's pattern normaliser and reports accept/refuse. */
function compilerAcceptsOperator(op) {
  try {
    // `node_type` is a reserved key in normaliseFind's own grammar (a type restriction, never run
    // through normalisePredicate) — `status` is an ordinary field and reaches the real operator
    // switch (compile-qualification.mjs's normalisePredicate/normalisePattern).
    normalisePattern(
      { root: { find: { status: { [op]: predicateValueFor(op) } } } },
      PROBE_RESOLVABLE_FIELDS,
    );
    return true;
  } catch {
    return false;
  }
}

/** Feeds one field name to the browser's declaration reader (through a predicate) and reports accept/refuse. */
function browserAcceptsField(field) {
  const document = {
    qualification: {
      predicates: {
        probe: { find: { fields: { [field]: { eq: "x" } } } },
      },
    },
  };
  // membership.ts's RESOLVABLE_FIELDS gates which fields a LINE can resolve, not which fields a
  // predicate can name — qualification.ts's readPredicate accepts any field name as a key (the
  // generator is what withholds unresolvable fields, per generate-qualification-declaration.mjs's
  // own header). So the browser-side field probe below exercises membership.ts's own gate
  // directly, via RESOLVABLE_FIELDS.includes, mirroring what resolveLineFields checks internally.
  return BROWSER_RESOLVABLE_FIELDS.includes(field);
}

describe("0. the index is not vacuous", () => {
  test("both vocabularies are non-empty", () => {
    assert.ok(OPERATORS.length > 0);
    assert.ok(FIELDS.length > 0);
  });

  test("the decoy sets do not accidentally overlap the index", () => {
    for (const op of NON_OPERATORS) assert.ok(!OPERATORS.includes(op), `decoy '${op}' is actually indexed`);
    for (const f of NON_FIELDS) assert.ok(!FIELDS.includes(f), `decoy '${f}' is actually indexed`);
  });
});

describe("0.5. membership.ts is not stale relative to a live compile of the real config", () => {
  // `checkOperatorSet` NEVER throws for a missing monorepo — it returns `{stale: [], checked:
  // false, lines}` (`scripts/generate-operator-set.mjs`'s own header) — so this degrades to
  // "nothing to check" on a CI runner with no monorepo clone, and genuinely compares on a laptop
  // or worktree that has one (this repo's own `DEFAULT_CONFIG_DIR`, when found).
  test("membership.ts matches deriveResolvableFields, compiled from the real monorepo config", () => {
    const { stale, checked, lines } = checkOperatorSet();
    if (!checked) {
      // Nothing to check IS a legitimate outcome, not a pass by omission — say so, same as every
      // other "reproduces the monorepo" test in this repo.
      return;
    }
    assert.deepEqual(stale, [], `run 'node scripts/generate-operator-set.mjs' and commit:\n${lines.join("\n")}`);
  });
});

describe("1. RESOLVABLE_FIELDS — checked for agreement across every surface that declares it", () => {
  test("the index's own list matches this repo's shipped value", () => {
    assert.deepEqual(
      [...FIELDS].sort(),
      [
        "asserted_state",
        "blocked_state",
        "cadence",
        "cap_state",
        "change_type",
        "class_state",
        "domain",
        "genre",
        "god_box",
        "instantiate",
        "lead_state",
        "node_type",
        "package_state",
        "principle_state",
        "priority",
        "status",
        "tier",
        "title",
      ].sort(),
    );
  });

  // `generate-qualification-declaration.mjs`/`compile-qualification.mjs` no longer export a
  // static `RESOLVABLE_FIELDS` constant to compare against — `deriveResolvableFields(files)` is a
  // FUNCTION of a config, not a fact about this repo (see that function's own header). What CAN be
  // checked hermetically, with no monorepo, is that it derives the SAME index-carried set from a
  // hand-built files map shaped like the real config's relevant vocabulary — i.e. that the rule,
  // not just its output on one config, is the one this index describes. `tests/derive-resolvable-
  // fields.test.mjs` is the deep, fixture-driven version of this claim (including the "different
  // schema" proof); this is the narrow one, local to this file's own cross-surface purpose.
  test("compiler (deriveResolvableFields) derives the index's own list from a matching fixture", () => {
    const files = {
      "vocabulary/checkbox.yaml": "checkbox:\n  - { token: '[ ]', field: status, value: open }\n",
      "vocabulary/type_tags.yaml": "type_tags:\n  - { token: '#task', node_type: task }\n",
      "vocabulary/tags.yaml": [
        "domain_tags:",
        "  - { token: '#work', field: domain, value: work }",
        "cadence_tags:",
        "  - { token: '#daily', field: cadence, value: daily }",
        "tier_tags:",
        "  - { token: '#t1', field: tier, value: 1 }",
        "cap_state_tags:",
        "  - { token: '#capped', field: cap_state, value: capped }",
        "change_type_tags:",
        "  - { token: '#minor', field: change_type, value: minor }",
        "genre_tags:",
        "  - { token: '#fiction', field: genre, value: fiction }",
        "god_box_tags:",
        "  - { token: '#god', field: god_box, value: true }",
        "class_state_tags:",
        "  - { token: '#cls', field: class_state, value: exists }",
        "package_state_tags:",
        "  - { token: '#pkg', field: package_state, value: exists }",
        "principle_state_tags:",
        "  - { token: '#prn', field: principle_state, value: held }",
        "instantiate_tags:",
        "  - { token: '#onboard', field: instantiate, value: onboard }",
        "priority_tags:",
        "  - { token: '#p1', field: priority, value: 1 }",
        "blocked_state_tags:",
        "  - { token: '#blocked', field: blocked_state, value: blocked }",
        "lead_state_tags:",
        "  - { token: '#lead', field: lead_state, value: lead }",
        "asserted_state_tags:",
        "  - { token: '#asserted', field: asserted_state, value: asserted }",
        "",
      ].join("\n"),
    };
    assert.deepEqual(deriveResolvableFields(files), [...FIELDS].sort());
  });

  test("browser (membership.ts) matches the index", () => {
    assert.deepEqual([...BROWSER_RESOLVABLE_FIELDS].sort(), [...FIELDS].sort());
  });

  test("python agreement generator (qualification-agreement.py) is a SUBSET of the index, not a copy", () => {
    // 2026-08-06: qualification-agreement.py's TRIPLE_FIELDS is deliberately hand-frozen at the
    // historical three — see this file's own header and `scripts/generate-operator-set.mjs`'s.
    const triple = readPythonTripleFields();
    for (const field of triple) {
      assert.ok(FIELDS.includes(field), `TRIPLE_FIELDS carries '${field}', which is not even in the index`);
    }
    assert.deepEqual(triple.sort(), ["domain", "node_type", "status"]);
  });
});

describe("1.5. deriveResolvableFields needs the config it is a function of — not a narrower slice", () => {
  // 2026-08-06's own regression, caught while wiring this branch up: `compile-rules.mjs` and
  // `check-isolate-conformance.mjs`'s `rules` entry both used to build a files map holding only
  // `vocabulary/markers.yaml` (deliberately narrow — "THE MARKER GAP", `compile-rules.mjs`'s own
  // header) and then called `deriveResolvableFields` on THAT map. `markers.yaml` alone spells no
  // fixed-value field at all (every entry is `extraction_hint`/`render_only`), so the derived set
  // collapsed to `["title"]` — refusing `status`, `domain`, everything a real rule's pattern
  // needs. Fixed by widening both readers to the whole `vocabulary/` directory
  // (`generate-rules-declaration.mjs`'s header has the full account). This test pins the
  // regression itself, not just its fix, so a future narrowing is caught here first.
  test("a files map holding ONLY markers.yaml-shaped entries derives no field beyond title", () => {
    const markersOnly = {
      "vocabulary/markers.yaml": [
        "trailing_markers:",
        "  - { token: '📅', field: due_date, extraction_hint: trailing_date }",
        "  - { token: '☑️', field: done_task_count, extraction_hint: trailing_int, render_only: true }",
        "",
      ].join("\n"),
    };
    assert.deepEqual(deriveResolvableFields(markersOnly), ["title"]);
  });
});

describe("2. MEMBERSHIP operators — behavioural probe of both live entry points", () => {
  for (const op of OPERATORS) {
    test(`browser ACCEPTS indexed operator '${op}'`, () => {
      assert.equal(browserAcceptsOperator(op), true);
    });
    test(`compiler ACCEPTS indexed operator '${op}'`, () => {
      assert.equal(compilerAcceptsOperator(op), true);
    });
  }

  for (const op of NON_OPERATORS) {
    test(`browser REFUSES non-indexed operator '${op}'`, () => {
      assert.equal(browserAcceptsOperator(op), false);
    });
    test(`compiler REFUSES non-indexed operator '${op}'`, () => {
      assert.equal(compilerAcceptsOperator(op), false);
    });
  }
});

describe("3. RESOLVABLE fields — behavioural probe of the browser's own gate", () => {
  for (const field of FIELDS) {
    test(`browser (membership.ts) ACCEPTS indexed field '${field}'`, () => {
      assert.equal(browserAcceptsField(field), true);
    });
  }

  for (const field of NON_FIELDS) {
    test(`browser (membership.ts) REFUSES non-indexed field '${field}'`, () => {
      assert.equal(browserAcceptsField(field), false);
    });
  }
});

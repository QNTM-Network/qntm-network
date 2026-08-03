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
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readQualificationDeclaration, RESOLVABLE_FIELDS as BROWSER_RESOLVABLE_FIELDS } from "../dist/present.js";
import { normalisePattern, RESOLVABLE_FIELDS as COMPILER_RESOLVABLE_FIELDS } from "../scripts/generate-qualification-declaration.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = JSON.parse(
  readFileSync(resolve(HERE, "..", "docs", "architecture", "operator-set.json"), "utf8"),
);

const OPERATORS = INDEX.memberOperators.values;
const FIELDS = INDEX.resolvableFields.values;

// Decoys: real engine operators (`patterns/engine.py::_NODE_PREDICATE_OPERATORS`, cited by
// qualification.ts:60-68) and plausible field names that are NOT in the local grammar. If the
// index is ever widened, add the new value to operator-set.json's `values` array, not here.
const NON_OPERATORS = ["gte", "lte", "gt", "lt", "ne", "in", "contains"];
const NON_FIELDS = ["title", "priority", "project", "cap_state", "assignee"];

/**
 * `scripts/qualification-agreement.py`'s TRIPLE_FIELDS is read as source text, not executed — see
 * this file's header for why. The pattern matches the exact literal this repo has today
 * (`TRIPLE_FIELDS = ("node_type", "domain", "status")`); a change of FORM (not just values) fails
 * this test loudly rather than silently passing on stale text.
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

/** Feeds one operator to the compiler's pattern normaliser and reports accept/refuse. */
function compilerAcceptsOperator(op) {
  try {
    // `node_type` is a reserved key in normaliseFind's own grammar (a type restriction, never run
    // through normalisePredicate) — `status` is an ordinary field and reaches the real operator
    // switch (generate-qualification-declaration.mjs:234-236, normalisePredicate at :205-226).
    normalisePattern({ root: { find: { status: { [op]: predicateValueFor(op) } } } });
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

describe("1. RESOLVABLE_FIELDS — three literal declarations, checked for exact agreement", () => {
  test("the index's own list matches this repo's shipped value", () => {
    assert.deepEqual(FIELDS, ["node_type", "domain", "status"]);
  });

  test("compiler (generate-qualification-declaration.mjs) matches the index", () => {
    assert.deepEqual([...COMPILER_RESOLVABLE_FIELDS].sort(), [...FIELDS].sort());
  });

  test("browser (membership.ts) matches the index", () => {
    assert.deepEqual([...BROWSER_RESOLVABLE_FIELDS].sort(), [...FIELDS].sort());
  });

  test("python agreement generator (qualification-agreement.py) matches the index", () => {
    assert.deepEqual(readPythonTripleFields().sort(), [...FIELDS].sort());
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

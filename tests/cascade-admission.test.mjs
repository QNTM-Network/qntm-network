/**
 * RESOLVABILITY IS A CASCADE WALK, NOT A LINE-ONLY TOKEN LOOKUP.
 *
 *   node --test tests/cascade-admission.test.mjs
 *
 * ── THE MECHANISM UNDER TEST ──
 *
 * A field's value can be known two ways for a line being typed: LEXICALLY (a token in the line
 * spells it — `deriveResolvableFields`) or STRUCTURALLY (the line's own POSITION implies it — its
 * SECTION, via a `defaults:` block the section itself declares). `compile-qualification.mjs`'s
 * `deriveStructuralFieldsByQualification` is the second rung; `compile()` unions it, per pattern,
 * with the lexical set before admitting a predicate. This file proves five things about that walk,
 * each with a fixture built fresh here — nothing below shares a field name, a node type or a
 * qualification name with the operator's real config, and nothing here reads or writes any config
 * on disk:
 *
 *   1. THE UNIT — `deriveStructuralFieldsByQualification` itself, on hand-built site lists.
 *   2. THE POSITIVE — a field with NO vocabulary token, fixed by the ONE section that references
 *      it, is now admitted where it used to be refused.
 *   3. THE SOUNDNESS FLOOR — the SAME field, referenced by a SECOND section that does not fix it,
 *      is refused EVERYWHERE, never admitted at the one site that could answer and silently wrong
 *      at the one that cannot. Intersection, not union.
 *   4. THE NEGATIVE PROOF — a field no rung (lexical or structural) ever fixes stays refused.
 *   5. THE ACCEPTANCE SCENARIO — a field registered BOTH ways (a token AND a section default): the
 *      LINE's own token wins over the SECTION's default, exactly the way the engine's own
 *      `ResolutionCascade.merge_into` already orders LINE ahead of STRUCTURAL_NODE
 *      (`apps/qntm-md/src/qntm_md/resolution/levels.py:86-92`, verified against the engine this
 *      PR, cited in `compile-qualification.mjs`'s own header).
 *   6. THE MUTATION PROOF — revert the assemble step to the lexical set alone, on a scratch copy of
 *      the compiler, and show the POSITIVE case (2) goes back to being refused; restore and show it
 *      is admitted again.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compile,
  deriveStructuralFieldsByQualification,
  deriveResolvableFields,
} from "../scripts/compile-qualification.mjs";
import { Ledger } from "../scripts/ledger.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

/**
 * WHY SECTION 5's OWN `before()` HOOK PATCHES A SCRATCH COPY OF `dist/present.js`, BELOW:
 * `app/present/membership.ts`'s `resolveLineFields` decodes a line's own tokens against a MODULE-
 * LEVEL constant, `RESOLVABLE_FIELDS` (`membership.ts:95`) — generated from the REAL monorepo
 * config by `scripts/generate-operator-set.mjs`, never from the declaration a caller hands it. That
 * is correct for the shipped app (the constant and the served declaration are always compiled from
 * the SAME config, kept in step by `tests/operator-set-agreement.test.mjs`), but it means a
 * SYNTHETIC field name invented only for this file's own fixture (never in the real config, by
 * design — see this file's header) is invisible to that loop no matter what the fixture's own
 * declaration publishes: the token would be read, but never matched against `RESOLVABLE_FIELDS`, so
 * its value would never reach the resolved field set. Proving THE ACCEPTANCE SCENARIO through the
 * REAL, shipped `resolveLineFields`/`membershipFor` — not a hand-rolled stand-in — therefore needs
 * ONE extra field name added to that one constant, in a scratch copy of the built bundle, the same
 * way section 6 patches a scratch copy of the COMPILER for its own mutation proof. Nothing else
 * about `dist/present.js` is touched, and nothing on disk in this repo is written.
 */

// ── 1. THE UNIT ──────────────────────────────────────────────────────────────────────────────

describe("1. deriveStructuralFieldsByQualification — the unit, on hand-built site lists", () => {
  test("one site fixing a field admits it for that qualification", () => {
    const views = [{ a: { qualification: "q1", defaults: { holding_bay: "bay_one" } } }];
    const result = deriveStructuralFieldsByQualification(views);
    assert.deepEqual([...result.get("q1")], ["holding_bay"]);
  });

  test("two sites agreeing on a field keep it — intersection, not just the first site", () => {
    const views = [
      { a: { qualification: "q1", defaults: { holding_bay: "bay_one" } } },
      { b: { qualification: "q1", defaults: { holding_bay: "bay_two", extra: "x" } } },
    ];
    const result = deriveStructuralFieldsByQualification(views);
    // `extra` is only on the second site — NOT admitted, because the first site never fixes it.
    assert.deepEqual([...result.get("q1")], ["holding_bay"]);
  });

  test("two sites DISAGREEING (one omits the field entirely) drop it from the intersection", () => {
    const views = [
      { a: { qualification: "q1", defaults: { holding_bay: "bay_one" } } },
      { b: { qualification: "q1", defaults: {} } },
    ];
    const result = deriveStructuralFieldsByQualification(views);
    assert.deepEqual([...result.get("q1")], []);
  });

  test("a section with no defaults: at all contributes the empty set, not an absence", () => {
    const views = [{ a: { qualification: "q1" } }];
    const result = deriveStructuralFieldsByQualification(views);
    assert.deepEqual([...result.get("q1")], []);
  });

  test("a qualification nothing references has no entry in the map at all", () => {
    const views = [{ a: { qualification: "q1", defaults: { x: 1 } } }];
    const result = deriveStructuralFieldsByQualification(views);
    assert.equal(result.has("q2"), false);
  });
});

// ── the synthetic instance — built fresh per test group below, never shared config state ───────

/**
 * A complete, minimal, self-contained files map `compile()` can run end to end: one structural
 * node type (satisfies the "at least one `identity: {unique: true}`" refusal), one checkbox node
 * type, a global registration, and whatever `extraViews`/`extraPatterns`/`extraVocabulary` a test
 * adds on top — merged in, never overwriting the base. Every name below (`crate`, `holding_bay`,
 * `crate_state`, `#flagged`, …) is invented for this file and shares nothing with the operator's
 * real config or with `tests/fixtures/config`.
 */
function syntheticFiles({ extraViews = {}, extraPatterns = {}, extraVocabulary = {} } = {}) {
  return {
    "schema.yaml": [
      "node_types:",
      "  crate:",
      "    fields: [title, status]",
      "    render: { shape: checkbox }",
      "  crate_header:",
      "    fields: [title]",
      "    identity: { unique: true }",
      "    render: { shape: heading }",
      "",
    ].join("\n"),
    "views/default_registration.yaml": [
      "default_registration:",
      "  default_node_type: crate",
      "  input_grammar: tolerant",
      "  default_tags: []",
      "",
    ].join("\n"),
    "vocabulary/status_tags.yaml": [
      "status_tags:",
      "  - { token: '[ ]', field: status, value: open }",
      "  - { token: '[x]', field: status, value: done }",
      "",
    ].join("\n"),
    ...extraVocabulary,
    ...extraViews,
    ...extraPatterns,
  };
}

// ── 2 & 3. THE POSITIVE AND THE SOUNDNESS FLOOR, TOGETHER — same field, two configs ─────────────

describe("2/3. a structurally-fixed field is admitted at the ONE site, refused the moment a SECOND site cannot answer it", () => {
  test("POSITIVE: one section fixing 'holding_bay' via defaults: admits the pattern that ranges over it", () => {
    const files = syntheticFiles({
      extraPatterns: {
        "patterns/crate.yaml": [
          "crate-lonely:",
          "  root:",
          "    find:",
          "      node_type: crate",
          "      holding_bay: bay_one",
          "",
        ].join("\n"),
      },
      extraViews: {
        "views/crate.yaml": [
          "crate-board:",
          "  path: crate/board.md",
          "  sections:",
          "    - id: lonely",
          "      qualification: crate-lonely",
          "      name: Lonely",
          "      defaults:",
          "        holding_bay: bay_one",
          "",
        ].join("\n"),
      },
    });
    const { declaration } = compile(files, new Ledger());
    assert.ok(
      "crate-lonely" in declaration.predicates,
      `expected 'crate-lonely' published; refused: ${JSON.stringify(declaration.refused)}`,
    );
    assert.equal(declaration.refused["crate-lonely"], undefined);
    // THE LEXICAL SET NEVER MOVES. `holding_bay` has no vocabulary token anywhere in this fixture —
    // admitting the PATTERN must never mean `deriveResolvableFields` started lying about the LINE.
    assert.ok(!declaration.resolvableFields.includes("holding_bay"));
  });

  test("SOUNDNESS FLOOR: the SAME qualification, referenced by a second section that omits the field, is refused EVERYWHERE", () => {
    const files = syntheticFiles({
      extraPatterns: {
        "patterns/crate.yaml": [
          "crate-shared:",
          "  root:",
          "    find:",
          "      node_type: crate",
          "      holding_bay: bay_two",
          "",
        ].join("\n"),
      },
      extraViews: {
        "views/crate.yaml": [
          "crate-board:",
          "  path: crate/board.md",
          "  sections:",
          "    - id: shared-a",
          "      qualification: crate-shared",
          "      name: Shared A",
          "      defaults:",
          "        holding_bay: bay_two",
          "    - id: shared-b",
          "      qualification: crate-shared",
          "      name: Shared B",
          "",
        ].join("\n"),
      },
    });
    const { declaration } = compile(files, new Ledger());
    // Site A alone would admit `holding_bay` (proved above). Site B fixes nothing at all. A pattern
    // admitted on the strength of site A would be WRONG the moment it is evaluated for a line typed
    // under site B — so the whole qualification refuses, at BOTH sites, rather than answer
    // correctly at one and confidently wrong at the other.
    assert.equal("crate-shared" in declaration.predicates, false);
    assert.equal(declaration.refused["crate-shared"], "unresolvable field(s): holding_bay");
  });
});

// ── 4. THE NEGATIVE PROOF — no rung anywhere answers, so it stays refused ──────────────────────

describe("4. a field NO rung fixes — no token, no section anywhere — still refuses", () => {
  test("a pattern referencing a field that is spelled nowhere and defaulted nowhere is refused", () => {
    const files = syntheticFiles({
      extraPatterns: {
        "patterns/crate.yaml": [
          "crate-never:",
          "  root:",
          "    find:",
          "      node_type: crate",
          "      unreachable_field: nowhere",
          "",
        ].join("\n"),
      },
      extraViews: {
        "views/crate.yaml": [
          "crate-board:",
          "  path: crate/board.md",
          "  sections:",
          "    - id: never",
          "      qualification: crate-never",
          "      name: Never",
          "",
        ].join("\n"),
      },
    });
    const { declaration } = compile(files, new Ledger());
    assert.equal("crate-never" in declaration.predicates, false);
    assert.equal(declaration.refused["crate-never"], "unresolvable field(s): unreachable_field");
  });
});

// ── 5. THE ACCEPTANCE SCENARIO — registered both ways, the line's own token wins ────────────────

describe("5. the operator's own acceptance scenario: a field set BOTH ways, the token wins", () => {
  // `crate_state` is spelled by a vocabulary token (`#flagged`) AND fixed by two different
  // sections' own `defaults:` (`active` -> active, `flagged` -> flagged). Write a line under
  // `active` and put `#flagged` on it: the LINE beats the SECTION, so it resolves to `flagged`,
  // no longer belongs in `active`, and DOES belong in `flagged` — read with the SAME line.
  const files = syntheticFiles({
    extraVocabulary: {
      "vocabulary/crate_state_tags.yaml": [
        "crate_state_tags:",
        "  - { token: '#flagged', field: crate_state, value: flagged }",
        "",
      ].join("\n"),
    },
    extraPatterns: {
      "patterns/crate.yaml": [
        "crate-active:",
        "  root:",
        "    find:",
        "      node_type: crate",
        "      crate_state: { not: flagged }",
        "",
        "crate-flagged:",
        "  root:",
        "    find:",
        "      node_type: crate",
        "      crate_state: flagged",
        "",
      ].join("\n"),
    },
    extraViews: {
      "views/crate.yaml": [
        "crate-board:",
        "  path: crate/board.md",
        "  sections:",
        "    - id: active",
        "      qualification: crate-active",
        "      name: Active",
        "      defaults:",
        "        crate_state: active",
        "    - id: flagged",
        "      qualification: crate-flagged",
        "      name: Flagged",
        "      defaults:",
        "        crate_state: flagged",
        "",
      ].join("\n"),
    },
  });
  const { declaration } = compile(files, new Ledger());

  test("both qualifications are published (crate_state is lexically resolvable — a token spells it)", () => {
    assert.ok("crate-active" in declaration.predicates);
    assert.ok("crate-flagged" in declaration.predicates);
  });

  describe("membership, through the REAL shipped resolver (dist/present.js, patched only to know the synthetic field name — see this file's own header)", () => {
    let mod;
    let cleanup;
    let LANGUAGE;

    before(async () => {
      const scratch = mkdtempSync(join(tmpdir(), "patched-present-"));
      cleanup = () => rmSync(scratch, { recursive: true, force: true });
      const source = readFileSync(join(REPO, "dist", "present.js"), "utf8");
      const anchor = /var RESOLVABLE_FIELDS = \[[^\]]*\];/;
      assert.ok(anchor.test(source), "RESOLVABLE_FIELDS's own declaration line was not found in dist/present.js");
      const patched = source.replace(anchor, (match) => match.replace("];", `, "crate_state"];`));
      assert.notEqual(patched, source, "the patch did not apply");
      const path = join(scratch, "present.js");
      writeFileSync(path, patched);
      mod = await import(`file://${path}`);
      LANGUAGE = mod.readQualificationDeclaration({ qualification: declaration }).qualification;
    });
    after(() => cleanup());

    test("a bare line under 'active' resolves crate_state from the SECTION default, and belongs", () => {
      const reading = mod.membershipFor("crate-board", "active", "- [ ] A crate", LANGUAGE);
      assert.equal(reading.kind, "answer");
      assert.equal(reading.answer.fields.crate_state, "active");
      assert.equal(reading.answer.belongs, true);
    });

    test("THE PRECEDENCE PROOF: the SAME line under 'active', with '#flagged' on it, resolves to 'flagged' — the token, not the section default", () => {
      const reading = mod.membershipFor("crate-board", "active", "- [ ] A crate #flagged", LANGUAGE);
      assert.equal(reading.kind, "answer");
      assert.equal(
        reading.answer.fields.crate_state,
        "flagged",
        "the section's own 'active' default overrode the line's token — precedence is backwards",
      );
      assert.equal(reading.answer.belongs, false, "'active' excludes crate_state=flagged; it should no longer belong");
    });

    test("the identical line, read under 'flagged' instead, belongs there", () => {
      const reading = mod.membershipFor("crate-board", "flagged", "- [ ] A crate #flagged", LANGUAGE);
      assert.equal(reading.kind, "answer");
      assert.equal(reading.answer.fields.crate_state, "flagged");
      assert.equal(reading.answer.belongs, true);
    });
  });
});

// ── 6. THE MUTATION PROOF — neuter the union, on a scratch copy, and the positive case reverts ──

describe("6. THE MUTATION PROOF — a compiler that never unions the structural rung refuses case 2 again", () => {
  /**
   * Patch `compile-qualification.mjs`'s assemble step back to its PRE-WIDENING shape (`normalise
   * Pattern(..., resolvableFields)`, the lexical set alone — no `structuralFieldsByQualification`
   * consulted at all) in a scratch copy, import THAT copy, and prove the positive-admission case
   * from section 2 above goes back to being refused under it. Same technique `tests/declaration-
   * drop.test.mjs`'s own mutant-compile harness uses: a sibling module in a temp dir, relative
   * imports rewritten to absolute paths, nothing on disk in this repo touched.
   */
  async function withMutantCompile(use) {
    const scratch = mkdtempSync(join(tmpdir(), "mutant-cascade-"));
    try {
      const source = readFileSync(join(REPO, "scripts", "compile-qualification.mjs"), "utf8");
      const anchor =
        'const admissibleFields = [\n' +
        '      ...new Set([\n' +
        '        ...resolvableFields,\n' +
        '        ...Object.keys(extractionHintFields),\n' +
        '        ...(structuralFieldsByQualification.get(name) ?? []),\n' +
        '      ]),\n' +
        '    ].sort();';
      assert.ok(source.includes(anchor), "the mutation's own anchor was not found — did the assemble step move?");
      const mutated = source.replace(anchor, "const admissibleFields = resolvableFields;");
      assert.notEqual(mutated, source, "the mutation's own patch did not apply");
      const rewritten = mutated
        .replaceAll('from "./yaml-subset.mjs"', `from ${JSON.stringify(join(REPO, "scripts", "yaml-subset.mjs"))}`)
        .replaceAll('from "./ledger.mjs"', `from ${JSON.stringify(join(REPO, "scripts", "ledger.mjs"))}`)
        .replaceAll(
          'from "./declaration-version.mjs"',
          `from ${JSON.stringify(join(REPO, "scripts", "declaration-version.mjs"))}`,
        );
      const path = join(scratch, "mutant-compile.mjs");
      writeFileSync(path, rewritten);
      const mutant = await import(`file://${path}`);
      return await use(mutant);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  const positiveFiles = () =>
    syntheticFiles({
      extraPatterns: {
        "patterns/crate.yaml": [
          "crate-lonely:",
          "  root:",
          "    find:",
          "      node_type: crate",
          "      holding_bay: bay_one",
          "",
        ].join("\n"),
      },
      extraViews: {
        "views/crate.yaml": [
          "crate-board:",
          "  path: crate/board.md",
          "  sections:",
          "    - id: lonely",
          "      qualification: crate-lonely",
          "      name: Lonely",
          "      defaults:",
          "        holding_bay: bay_one",
          "",
        ].join("\n"),
      },
    });

  test("CONTROL: the real, unmutated compiler admits 'crate-lonely' (restates section 2's own claim)", () => {
    const { declaration } = compile(positiveFiles(), new Ledger());
    assert.ok("crate-lonely" in declaration.predicates);
  });

  test("MUTANT: with the union removed, 'crate-lonely' is refused again — the widening is load-bearing, not decoration", async () => {
    await withMutantCompile((mutant) => {
      const { declaration } = mutant.compile(positiveFiles(), new Ledger());
      assert.equal("crate-lonely" in declaration.predicates, false);
      assert.equal(declaration.refused["crate-lonely"], "unresolvable field(s): holding_bay");
    });
  });

  test("RESTORED: outside the mutant, the same fixture is admitted again — nothing on disk changed", () => {
    const { declaration } = compile(positiveFiles(), new Ledger());
    assert.ok("crate-lonely" in declaration.predicates);
  });
});

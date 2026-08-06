/**
 * THE DECLARED TRAVERSAL DEPTH — how far off the candidate node this app's own grammar may look,
 * published rather than left an unstated property of `normaliseStep`'s admitted shapes.
 *
 *   node --test tests/present-qualification-traversal-depth.test.mjs
 *
 * The operator's own correction (quoted in `scripts/compile-qualification.mjs`'s header) is that
 * graph traversal is NORMAL, not exotic, and the browser's current limit is a NUMBER that should
 * be visible and movable, not a class of rule someone else owns. This file proves the number is
 * published, read, and — the part a bare value assertion cannot show — actually equal to the
 * ceiling the grammar enforces, not a second, driftable copy of it.
 *
 * Five claims:
 *
 *   1. THE PUBLISHED VALUE. `compile-qualification.mjs` emits `traversalDepth: 1` unconditionally,
 *      even for a fixture with zero graph-aware patterns — an ENGINE-FACT-shaped constant, the
 *      same posture `compile-resolution.mjs`'s `ENGINE_DEFAULT_ORDERING` already takes.
 *   2. THE READER (`qualification.ts`). A well-formed value is adopted; absence is silence (the
 *      built-in default, 1 — not 0, because a one-hop `EdgeStep` is already what this grammar
 *      admits regardless of whether the number arrived); a malformed value is reported.
 *   3. THE SCENARIO A BARE VALUE CANNOT PROVE: the published `1` actually agrees with what the
 *      grammar does. A pattern with a real one-hop `children:` step resolves and carries
 *      `edgeSteps` (depth 1, in use); a pattern with `ancestors:` (depth > 1, unbounded) is
 *      REFUSED by the same compile call that published `1` — so the number and the behaviour are
 *      the same read, not two facts that could drift apart.
 *   4. THE HISTOGRAM'S OWN HEADLINE, PINNED. Of the operator's real config, the compiled
 *      `traversalDepth` is 1; a mutation to 2 is not silently "more capable" — nothing in the real
 *      config needs it (see the PR body for the full count), and this suite does not assert that
 *      count (a live-graph-free static count is a `scripts/measure-*` job, not a unit test's), but
 *      it does pin that raising the constant with no grammar change is a LIE the type system
 *      cannot catch — stated here so a future editor does not "helpfully" bump it alone.
 *   5. `rules` SHARES THE SAME CEILING WITHOUT A SECOND COPY: `compile-rules.mjs` imports
 *      `normalisePattern` from this same file, so a rule's `for_each` pattern is bound by the
 *      identical grammar `traversalDepth` describes — proved by driving `compile-rules.mjs`
 *      against a fixture pattern with a two-hop shape and observing the SAME refusal wording
 *      `normaliseStep` produces, not a rules-specific one.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, cpSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { normalisePattern, TRAVERSAL_DEPTH } from "../scripts/compile-qualification.mjs";
import { generateQualification } from "../scripts/generate-qualification-declaration.mjs";
import { readQualificationDeclaration, DEFAULT_TRAVERSAL_DEPTH } from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CONFIG = join(HERE, "fixtures", "config");

describe("1. the published value", () => {
  test("TRAVERSAL_DEPTH is 1", () => {
    assert.equal(TRAVERSAL_DEPTH, 1);
  });

  test("compiling the fixture config publishes traversalDepth: 1 unconditionally", () => {
    const qualification = generateQualification(FIXTURE_CONFIG);
    assert.equal(qualification.traversalDepth, 1);
  });

  test("DEFAULT_TRAVERSAL_DEPTH (the reader's built-in floor) agrees with TRAVERSAL_DEPTH (the compiler's published constant) — one number, not two", () => {
    assert.equal(DEFAULT_TRAVERSAL_DEPTH, TRAVERSAL_DEPTH);
  });
});

describe("2. the reader — qualification.ts", () => {
  test("a well-formed traversalDepth is adopted, with no problems", () => {
    const { qualification, problems } = readQualificationDeclaration({ qualification: { traversalDepth: 3 } });
    assert.equal(qualification.traversalDepth, 3);
    assert.deepEqual(problems, []);
  });

  test("no traversalDepth key at all is SILENCE — the built-in default, not a problem", () => {
    const { qualification, problems } = readQualificationDeclaration({});
    assert.equal(qualification.traversalDepth, DEFAULT_TRAVERSAL_DEPTH);
    assert.deepEqual(problems, []);
  });

  test("a malformed traversalDepth is a reported problem and falls back to the default, never a guess", () => {
    for (const bad of [-1, 1.5, "1", null, [1]]) {
      const { qualification, problems } = readQualificationDeclaration({ qualification: { traversalDepth: bad } });
      assert.equal(qualification.traversalDepth, DEFAULT_TRAVERSAL_DEPTH, `${JSON.stringify(bad)} was silently adopted`);
      assert.equal(problems.length, 1);
      assert.match(problems[0], /traversalDepth/);
    }
  });
});

describe("3. THE SCENARIO — the published number agrees with what the grammar actually does", () => {
  test("a real one-hop pattern resolves and carries edgeSteps — depth 1, in use, not hypothetical", () => {
    const oneHop = {
      root: { find: { node_type: "task" } },
      steps: [{ children: { edge_type: "PART_OF", node_type: "routine" }, exists: true }],
    };
    // `[]` for resolvableFields: neither pattern here names a root/self field predicate — only
    // `node_type` (handled outside the resolvableFields check) and edge-step fields (deliberately
    // EXEMPT from it, see `normalisePattern`'s own comment) — so the derived set never matters to
    // what these two tests assert.
    const { edgeSteps } = normalisePattern(oneHop, []);
    assert.equal(edgeSteps?.length, 1, "a one-hop pattern did not resolve to one edge step");
  });

  test("a pattern needing MORE than the declared depth is refused by the SAME compile pass that published the number — no drift between the two", () => {
    const beyondOneHop = {
      root: { find: {} },
      steps: [{ ancestors: { edge_type: "PART_OF" }, exists: true }],
    };
    assert.throws(() => normalisePattern(beyondOneHop, []), /traverses \(ancestors/);
  });

  test("MUTATION PROOF: the fixture's OWN beyond-depth pattern (traversing-tasks, ancestors:) becomes a real one-hop pattern (parents:), and the section it feeds flips from refused to published — the exact recovery the depth number describes", () => {
    // `tests/fixtures/config/patterns/basic.yaml`'s own comment: `traversing-tasks` USED TO use
    // `parents:` (one hop, this grammar's ceiling) before it was deliberately changed to
    // `ancestors:` (unbounded, beyond it) to give this fixture a pattern on each side of the
    // refusal boundary. This test restores that one-hop shape and shows the section it feeds
    // (`views/main.yaml`'s `nested`, `qualification: traversing-tasks`) crosses back over.
    const scratch = mkdtempSync(join(tmpdir(), "traversal-depth-"));
    try {
      cpSync(FIXTURE_CONFIG, scratch, { recursive: true });
      const before = generateQualification(scratch);
      assert.equal(before.traversalDepth, 1, "the depth number moved on a read that changed nothing");
      assert.ok(
        "traversing-tasks" in before.refused,
        "the fixture's own beyond-depth pattern was not refused before the mutation",
      );
      assert.equal(before.sections.main?.nested, undefined, "the section fed by it was already published");

      const patternsPath = join(scratch, "patterns", "basic.yaml");
      const original = readFileSync(patternsPath, "utf8");
      writeFileSync(
        patternsPath,
        original.replace(
          "    - ancestors: { edge_type: PART_OF }\n      exists: true\n",
          "    - parents: { edge_type: PART_OF }\n      exists: true\n",
        ),
      );
      assert.notEqual(readFileSync(patternsPath, "utf8"), original, "the mutation did not change the file");

      const after = generateQualification(scratch);
      assert.equal(after.traversalDepth, 1, "the depth number moved on a config edit that stayed within it");
      assert.equal("traversing-tasks" in after.refused, false, "the one-hop pattern is still refused");
      assert.ok(after.predicates["traversing-tasks"]?.edgeSteps?.length === 1, "no edgeSteps entry appeared");
      assert.ok(after.sections.main?.nested, "the section fed by the now-resolvable pattern was not published");
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe("4. raising the constant alone would be a lie the type system cannot catch — stated, not enforced by code", () => {
  test("EdgeStep (app/present/qualification.ts) has no field for a second hop", () => {
    // Structural, not behavioural: `readEdgeStep`'s own recognised-key list, pinned so a future
    // widening of the WIRE SHAPE to carry a chained step is a deliberate edit here, never a
    // silent one.
    const source = readFileSync(resolve(HERE, "..", "app", "present", "qualification.ts"), "utf8");
    const start = source.indexOf("export interface EdgeStep");
    const end = source.indexOf("}", start);
    const body = source.slice(start, end);
    assert.doesNotMatch(body, /steps|hops|chain/i, "EdgeStep grew a way to express more than one hop");
  });
});

describe("5. rules shares the ceiling without a second copy", () => {
  test("compile-rules.mjs imports normalisePattern from compile-qualification.mjs, not a copy of it", () => {
    const source = readFileSync(resolve(HERE, "..", "scripts", "compile-rules.mjs"), "utf8");
    assert.match(source, /import\s*\{\s*normalisePattern[^}]*\}\s*from\s*"\.\/compile-qualification\.mjs"/);
  });
});

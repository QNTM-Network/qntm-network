/**
 * NO DECLARATION DISAPPEARS WITHOUT A RECORD.
 *
 *   node --test tests/declaration-drop.test.mjs
 *
 * `design-the-rule-mirror.md` §8.4 states the operator's acceptance test as three outcomes for a
 * config entry the browser cannot express — picks it up, refuses it visibly, silently ignores it —
 * and §9.3 measured the third one live, at `generate-qualification-declaration.mjs:396`. This file
 * is the proof that the third outcome is gone, and it is organised as five claims:
 *
 *   1. EVERY DROP PATH LEAVES A RECORD. Sixteen of them, across all three generators, each
 *      triggered by a real mutation of a real config file rather than asserted from reading the
 *      source. A path that cannot be triggered is a path that does not exist, and a path proved by
 *      a grep returning nothing is not proved at all (this document's own evidence rule, §1).
 *   2. THE MUTATION PROOF. Re-introduce the silent `continue` and a test goes red. A guard that
 *      cannot go red is decoration, so the guard is shown going red.
 *   3. THE CI CHECK FAILS ON A STALE DECLARATION — not that it runs, that it exits 1, driven as
 *      the subprocess `build.yml` actually invokes.
 *   4. NO WOLF. Against the committed fixture, the ledger records what was really dropped and
 *      nothing else — a ledger that fired on every legitimate config entry would be noise, and
 *      noise is what gets ignored.
 *   5. THE ACCEPTANCE TEST, both halves, against a SCRATCH COPY OF THE OPERATOR'S REAL CONFIG.
 *      Skipped, loudly, when the monorepo is not checked out; §5 is the only section that skips.
 *
 * NOTHING HERE WRITES TO THE OPERATOR'S CONFIG. Every mutation is made to a `cpSync` copy under
 * the runner's temp dir, and the copy is removed in a `finally`.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateQualification,
  readConfigTree as readQualificationConfigTree,
  DEFAULT_CONFIG_DIR,
} from "../scripts/generate-qualification-declaration.mjs";
import { generateStructural } from "../scripts/generate-structural-declaration.mjs";
import { generateResolution } from "../scripts/generate-resolution-declaration.mjs";
import { generateRules } from "../scripts/generate-rules-declaration.mjs";
import { checkDeclarations } from "../scripts/checkdeclarations.mjs";
import { Ledger } from "../scripts/ledger.mjs";
import { parseYamlSubset } from "../scripts/yaml-subset.mjs";
import { readQualificationDeclaration } from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const FIXTURE_CONFIG = join(HERE, "fixtures", "config");

/**
 * Copy a config tree somewhere writable, mutate it, and hand the copy's path to a reader.
 * The same shape `tests/present-qualification.test.mjs`'s own falsifier uses, generalised over
 * which config it copies so the fixture and the operator's real config share one harness.
 */
function withMutatedConfig(source, mutate, use) {
  const scratch = mkdtempSync(join(tmpdir(), "declaration-drop-"));
  try {
    const configDir = join(scratch, "config");
    cpSync(source, configDir, { recursive: true });
    mutate(configDir);
    return use(configDir, scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Overwrite one config file wholesale. Used where a mutation must break the file's SHAPE. */
const put = (configDir, relative, text) => writeFileSync(join(configDir, relative), text);

/** Rewrite one config file by string substitution, asserting the edit actually applied. */
function edit(configDir, relative, from, to) {
  const path = join(configDir, relative);
  const before = readFileSync(path, "utf8");
  assert.ok(before.includes(from), `the mutation's own anchor '${from}' is not in ${relative}`);
  writeFileSync(path, before.replace(from, to));
}

/** Generate one declaration from a mutated fixture and return its `dropped` map. */
const droppedFrom = (generate, mutate) =>
  withMutatedConfig(FIXTURE_CONFIG, mutate, (configDir) => generate(configDir).dropped);

/** Assert `dropped` names `what` and that the reason says `why`. */
function assertDropped(dropped, what, why) {
  assert.ok(
    what in dropped,
    `nothing was recorded for '${what}'. Recorded: ${JSON.stringify(Object.keys(dropped))}`,
  );
  assert.match(dropped[what], why);
}

// ── 0. the fixture itself is legal config ─────────────────────────────────────────────────────

describe("0. the committed fixture config is a real config, parsed not assumed", () => {
  // THE TRAP THIS CLOSES, and it has caught five agents: a plain YAML scalar containing ": "
  // parses as a nested mapping and breaks declaration loading with exit 2. Reading the whole tree
  // through the generators' own parser is what turns "it looks fine" into a check.
  test("every fixture YAML file parses through the generators' own reader", () => {
    const files = [
      "schema.yaml",
      "line_grammars.yaml",
      "day_boundary.yaml",
      "patterns/basic.yaml",
      "views/default_registration.yaml",
      "views/main.yaml",
      "vocabulary/type_tags.yaml",
      "vocabulary/domain_tags.yaml",
      "vocabulary/status_tags.yaml",
      "vocabulary/markers.yaml",
      "vocabulary/structural_tokens.yaml",
    ];
    for (const relative of files) {
      const path = join(FIXTURE_CONFIG, relative);
      assert.ok(existsSync(path), `${relative} is missing from the fixture`);
      const parsed = parseYamlSubset(readFileSync(path, "utf8"), path);
      assert.ok(parsed && typeof parsed === "object", `${relative} did not parse into a mapping`);
    }
  });

  test("all three generators run against it and publish something", () => {
    assert.ok(Object.keys(generateQualification(FIXTURE_CONFIG).predicates).length > 0);
    assert.ok(generateStructural(FIXTURE_CONFIG).indent.edgeType === "PART_OF");
    assert.ok(generateResolution(FIXTURE_CONFIG).registration.defaultNodeType === "task");
  });
});

// ── 1. every drop path leaves a record ────────────────────────────────────────────────────────

describe("1a. qualification — every path that discards a declaration records it", () => {
  test("DROP 1: a patterns/ file that is not a mapping", () => {
    const dropped = droppedFrom(generateQualification, (c) =>
      put(c, "patterns/orphan.yaml", "- not\n- a\n- mapping\n"),
    );
    assertDropped(dropped, "patterns/orphan.yaml", /did not parse into a mapping/);
  });

  test("DROP 2: a views/ file that is not a mapping", () => {
    const dropped = droppedFrom(generateQualification, (c) =>
      put(c, "views/extra.yaml", "- just\n- a\n- list\n"),
    );
    assertDropped(dropped, "views/extra.yaml", /did not parse into a mapping/);
  });

  test("DROP 3: a views/ file with more than one top-level key", () => {
    const dropped = droppedFrom(generateQualification, (c) =>
      put(c, "views/two.yaml", "one:\n  sections: []\ntwo:\n  sections: []\n"),
    );
    assertDropped(dropped, "views/two.yaml", /declares 2 top-level keys \(one, two\)/);
  });

  test("DROP 4: a view with no sections list", () => {
    const dropped = droppedFrom(generateQualification, (c) =>
      put(c, "views/bare.yaml", "bare:\n  path: bare.md\n"),
    );
    assertDropped(dropped, "views/bare.yaml", /declares no 'sections:' list/);
  });

  test("DROP 5: a section entry that is not a mapping — and it names the ADDRESSING cost", () => {
    const dropped = droppedFrom(generateQualification, (c) =>
      edit(c, "views/main.yaml", "    - id: open", "    - just-a-string\n    - id: open"),
    );
    assertDropped(dropped, "views/main.yaml#0", /is not a mapping/);
    // The reason must name what a missing sectionOrder entry costs, because that is the part a
    // reader cannot infer: `app/present/address.ts` indexes sectionOrder POSITIONALLY.
    assertDropped(dropped, "views/main.yaml#0", /shifts the positional ordinal/);
  });

  test("DROP 6: a section with no 'qualification:' key", () => {
    const dropped = droppedFrom(generateQualification, (c) =>
      edit(c, "views/main.yaml", "      qualification: local-tasks\n", ""),
    );
    assertDropped(dropped, "views/main.yaml#0", /section 'open'.*declares no 'qualification:'/s);
  });

  test("DROP 7: a vocabulary file that is not a mapping", () => {
    const dropped = droppedFrom(generateQualification, (c) =>
      put(c, "vocabulary/broken.yaml", "- a\n- list\n"),
    );
    assertDropped(dropped, "vocabulary/broken.yaml", /did not parse into a mapping/);
  });

  test("DROP 8: a vocabulary family that is not a list", () => {
    const dropped = droppedFrom(generateQualification, (c) =>
      put(c, "vocabulary/odd.yaml", "odd_family:\n  token: '#x'\n  field: domain\n"),
    );
    assertDropped(dropped, "vocabulary/odd.yaml#odd_family", /is not a list of token entries/);
  });

  test("DROP 9: a vocabulary entry with no token", () => {
    const dropped = droppedFrom(generateQualification, (c) =>
      edit(c, "vocabulary/domain_tags.yaml", '  - token: "#work"\n', "  - field: domain\n"),
    );
    assertDropped(dropped, "vocabulary/domain_tags.yaml#domain_tags[0]", /declares no 'token:' string/);
  });

  test("DROP 10 — THE ONE §9.3 NAMES: a token setting a field this config's vocabulary+schema do not make resolvable", () => {
    // The operator's own worked example, verbatim from the design document AT THE TIME: "If the
    // operator declares `#p1 -> priority: high` tomorrow, it vanishes from the published grammar
    // and nothing anywhere says so." 2026-08-06 RETIRES `priority` from this example, on purpose —
    // it is the worked example's OWN vindication, not a hole in the fix: `RESOLVABLE_FIELDS`
    // stopped being the hand-picked `["node_type", "domain", "status"]` this test pinned and
    // became `deriveResolvableFields`'s own measurement of the config (`compile-qualification.mjs`'s
    // header). The fixture's OWN `vocabulary/markers.yaml` already carries a fixed-value `priority`
    // enum (🔽/⏫), so under the derived rule `priority` is NOW resolvable — the exact defect the
    // operator's diagnosis named, and this test cannot use it to demonstrate a drop any more than
    // the operator's own real config can. THE FIX ALSO RETIRES `field: X, value: <scalar>` as a
    // shape that can EVER demonstrate DROP 10 — rule (a) admits exactly that shape, by
    // construction (see `isFixedValueToken`), so no fixed-value token can ever be dropped for
    // ranging outside the resolvable set again. What is STILL dropped this way is a token that
    // sets a field through `extraction_hint:` alone (a value that VARIES per line, never a fixed
    // spelling `tokens[field][token]` can hold) — `due_date` (📅, this same fixture) already is
    // one; this mutation adds a SECOND, brand-new field via the identical shape, so the path is
    // exercised by a real mutation rather than only by the fixture's own pre-existing content.
    const dropped = droppedFrom(generateQualification, (c) =>
      put(
        c,
        "vocabulary/gentest_scheduled_tags.yaml",
        'gentest_scheduled_tags:\n  - token: "🗓️"\n    field: gentest_scheduled_at\n    extraction_hint: trailing_date\n',
      ),
    );
    assertDropped(dropped, "vocabulary token '🗓️'", /sets 'gentest_scheduled_at'/);
  });

  test("DROP 11: a resolvable field set by a render-only token", () => {
    const dropped = droppedFrom(generateQualification, (c) =>
      edit(
        c,
        "vocabulary/status_tags.yaml",
        "    value: done\n",
        "    value: done\n    render_only: true\n",
      ),
    );
    assertDropped(dropped, "vocabulary token '#done'", /render_only: true/);
  });

  test("DROP 12: a resolvable field set to something that is not a fixed scalar", () => {
    const dropped = droppedFrom(generateQualification, (c) =>
      edit(c, "vocabulary/domain_tags.yaml", "    value: work\n", "    value: [work, admin]\n"),
    );
    assertDropped(dropped, "vocabulary token '#work'", /not a fixed scalar/);
  });

  test("DROP 13: a token setting a field through 'parametric_field:' — a shape the loop never reads", () => {
    // This is the one an AST scan for `entry.field` cannot find: the field name is spelled under
    // a DIFFERENT key, so a scanner looking for the property access reports "not a field
    // declaration" and moves on. The operator wrote a field name either way.
    const dropped = droppedFrom(generateQualification, (c) =>
      put(
        c,
        "vocabulary/parametric.yaml",
        'parametric_tags:\n  - token: "#every-{n}{unit}"\n    parametric_field:\n      field: cadence\n      capture: n\n',
      ),
    );
    assertDropped(dropped, "vocabulary token '#every-{n}{unit}'", /sets 'cadence' through 'parametric_field:'/);
  });

  test("DROP 14: a section whose qualification was refused — the app says nothing under that heading", () => {
    // No mutation needed: the fixture ships one section on each side of the boundary on purpose.
    const dropped = generateQualification(FIXTURE_CONFIG).dropped;
    assertDropped(dropped, "section 'main.nested'", /qualification refused: traversing-tasks/);
    // And the reason is not restated — it lives in `refused`, once, and the two must join.
    const refused = generateQualification(FIXTURE_CONFIG).refused;
    assert.ok("traversing-tasks" in refused, "the join target is missing from refused");
  });
});

describe("1b. structural — every path that discards a declaration records it", () => {
  test("DROP 15: a view sheet whose top-level key this line scanner cannot see", () => {
    const dropped = droppedFrom(generateStructural, (c) =>
      put(c, "views/indented.yaml", "  buried:\n    sections:\n      - id: x\n"),
    );
    assertDropped(dropped, "views/indented.yaml", /no top-level view key this scanner recognises/);
  });

  test("DROP 16: a view with no sections: at the indent this scanner reads", () => {
    const dropped = droppedFrom(generateStructural, (c) =>
      put(c, "views/nosections.yaml", "nosections:\n  path: nosections.md\n"),
    );
    assertDropped(dropped, "views/nosections.yaml", /has no 'sections:' key at the indent/);
  });

  test("DROP 17 — THE WORST OF THE THREE: a HALF-declared structural override", () => {
    // Types with no direction. Before this change the section was dropped whole and the app
    // silently used the GLOBAL indent binding under a heading the operator had told to do
    // something else — a confident wrong answer, not an abstention.
    const dropped = droppedFrom(generateStructural, (c) =>
      edit(c, "views/main.yaml", "      structural_edge_direction: outgoing\n", ""),
    );
    assertDropped(
      dropped,
      "section 'main.nested'",
      /structural_edge_types with no structural_edge_direction.*falls back to the global indent binding/s,
    );
  });

  test("DROP 17b: the other half — direction with no types", () => {
    const dropped = droppedFrom(generateStructural, (c) =>
      edit(c, "views/main.yaml", "      structural_edge_types: [UNLOCKS]\n", ""),
    );
    assertDropped(
      dropped,
      "section 'main.nested'",
      /structural_edge_direction with no structural_edge_types/,
    );
  });

  test("default_registration.yaml is EXCLUDED BY NAME, not by silence", () => {
    // The one file in a real config that legitimately has no `sections:`. If it were skipped by
    // silence rather than by name, every other sectionless view would be silent too.
    assert.deepEqual(generateStructural(FIXTURE_CONFIG).dropped, {});
  });
});

describe("1c. resolution — every path that discards a declaration records it", () => {
  test("DROP 18: a view file that is not a mapping — and the REGISTRATION GUARD it disables", () => {
    const dropped = droppedFrom(generateResolution, (c) => put(c, "views/x.yaml", "- a\n- list\n"));
    assertDropped(dropped, "views/x.yaml", /neither published nor checked/);
  });

  test("DROP 19: a view file with more than one top-level key", () => {
    const dropped = droppedFrom(generateResolution, (c) =>
      put(c, "views/two.yaml", "one:\n  sections: []\ntwo:\n  sections: []\n"),
    );
    assertDropped(dropped, "views/two.yaml", /declares 2 top-level keys/);
  });

  test("DROP 20: a view with no sections list", () => {
    const dropped = droppedFrom(generateResolution, (c) =>
      put(c, "views/bare.yaml", "bare:\n  path: bare.md\n"),
    );
    assertDropped(dropped, "views/bare.yaml", /declares no 'sections:' list/);
  });

  test("DROP 21: a section with no readable id — its ordering could not be published", () => {
    const dropped = droppedFrom(generateResolution, (c) =>
      edit(c, "views/main.yaml", "    - id: open", "    - name: nameless"),
    );
    assertDropped(dropped, "views/main.yaml#0", /has no readable 'id:'.*ordering/s);
  });

  test("DROP 22: a node type whose render shape this app cannot seed", () => {
    // `person` is a `default_node_type` candidate with shape `plain_line` (seedable). Point a
    // view's default at a `heading`-shaped type and the GLOBAL rung goes silent for it.
    const dropped = droppedFrom(generateResolution, (c) =>
      edit(c, "views/main.yaml", "main:\n  path: main.md\n", "main:\n  path: main.md\n  default_node_type: header\n"),
    );
    assertDropped(dropped, "node type 'header'", /render shape 'heading' is not one this app knows how to seed/);
  });

  test("DROP 23: an ordering field whose marker is render_only", () => {
    const dropped = droppedFrom(generateResolution, (c) =>
      edit(c, "vocabulary/markers.yaml", "    extraction_hint: trailing_date\n", "    extraction_hint: trailing_date\n    render_only: true\n"),
    );
    assertDropped(dropped, "ordering field 'due_date'", /render_only: true/);
  });

  test("DROP 24 — THE EXACT TWIN of §9.3, in another generator: an unrecognised extraction_hint", () => {
    const dropped = droppedFrom(generateResolution, (c) =>
      edit(c, "vocabulary/markers.yaml", "extraction_hint: trailing_date", "extraction_hint: trailing_duration"),
    );
    assertDropped(dropped, "ordering field 'due_date'", /extraction_hint "trailing_duration"/);
  });

  test("DROP 25: a marker with no token", () => {
    const dropped = droppedFrom(generateResolution, (c) =>
      edit(c, "vocabulary/markers.yaml", '  - token: "📅"\n', "  - x: y\n"),
    );
    // With the token line gone the field has no marker at all, which is DROP 26's shape.
    assertDropped(dropped, "ordering field 'due_date'", /no marker for it at all|declares no 'token:'/);
  });

  test("DROP 26: two markers claim one ordering field — the loser is named", () => {
    const dropped = droppedFrom(generateResolution, (c) =>
      edit(
        c,
        "vocabulary/markers.yaml",
        '  - token: "📅"\n    field: due_date\n    extraction_hint: trailing_date\n',
        '  - token: "📅"\n    field: due_date\n    extraction_hint: trailing_date\n' +
          '  - token: "🗓"\n    field: due_date\n    extraction_hint: trailing_date\n',
      ),
    );
    assertDropped(dropped, "ordering field 'due_date'", /two markers claim it/);
  });

  test("DROP 27: an ordering field the config names and no marker declares", () => {
    const dropped = droppedFrom(generateResolution, (c) =>
      edit(c, "views/main.yaml", "        - field: due_date", "        - field: invented_field"),
    );
    assertDropped(dropped, "ordering field 'invented_field'", /declares no marker for it at all/);
  });

  test("DROP 28: priority (an ENGINE DEFAULT ORDERING field, not a declared one) with no marker at all drops too", () => {
    // The candidate set fed to readOrderingFieldMarkers is no longer only what a section's own
    // `ordering:` names — ENGINE_DEFAULT_ORDERING_MARKER_FIELDS adds `due_date`/`priority`
    // unconditionally, so removing priority's ONLY markers must still be recorded, even though no
    // section in this fixture ever names 'priority' in an `ordering:` list.
    const dropped = droppedFrom(generateResolution, (c) =>
      edit(
        c,
        "vocabulary/markers.yaml",
        '  - token: "🔽"\n    field: priority\n    value: low\n  - token: "⏫"\n    field: priority\n    value: high\n',
        "",
      ),
    );
    assertDropped(dropped, "ordering field 'priority'", /declares no marker for it at all/);
  });

  test("NOT A DROP: two enum tokens for the SAME field is the enum's normal shape, not DROP 26's collision", () => {
    // The unmutated fixture already declares two markers for 'priority' (🔽=low, ⏫=high) — if this
    // were read the same way as a TRAILING marker, DROP 26's "two markers claim it" would fire.
    // It must not: an enum field legitimately owns more than one token, one per value.
    const dropped = generateResolution(FIXTURE_CONFIG).dropped;
    assert.ok(!("ordering field 'priority'" in dropped), JSON.stringify(dropped));
  });

  test("DROP 29: an enum marker and a trailing marker claiming the SAME field conflict, and neither is published", () => {
    const dropped = droppedFrom(generateResolution, (c) =>
      edit(
        c,
        "vocabulary/markers.yaml",
        '  - token: "⏫"\n    field: priority\n    value: high\n',
        '  - token: "⏫"\n    field: priority\n    value: high\n' +
          '  - token: "🕒"\n    field: priority\n    extraction_hint: trailing_int\n',
      ),
    );
    assertDropped(dropped, "ordering field 'priority'", /cannot be read both ways at once/);
  });
});

// ── 2. the mutation proof: a guard that cannot go red is decoration ───────────────────────────

describe("2. THE MUTATION PROOF — re-introduce a silent drop and a test goes red", () => {
  /**
   * Re-create the exact line the finding names, as it stood before this change:
   *
   *   if (typeof entry.field !== "string" || !RESOLVABLE_FIELDS.includes(entry.field)) continue;
   *
   * — by patching the PARSING logic's own source into a temp copy and importing that copy.
   * Nothing on disk in this repo is modified. Since `5d4f1b5`-shaped port (this generator's own,
   * `compile-qualification.mjs`) split the token loop OUT of `generate-qualification-
   * declaration.mjs` and into `compile-qualification.mjs`, the mutant targets THAT file — the
   * mutant is a sibling module in a temp dir that imports this repo's real `yaml-subset.mjs` and
   * `ledger.mjs` by absolute path. The file-reading half (`readConfigTree`, unaffected by this
   * mutation) is never mutated: it is imported for real from `generate-qualification-
   * declaration.mjs` and combined with the mutant `compile`, the same way the real
   * `generateQualification` combines them.
   */
  const withMutantCompile = async (patch, use) => {
    const scratch = mkdtempSync(join(tmpdir(), "mutant-generator-"));
    try {
      const source = readFileSync(join(REPO, "scripts", "compile-qualification.mjs"), "utf8");
      const mutated = patch(source);
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
      // AWAITED INSIDE THE try, never returned as a pending promise: the `finally` below removes
      // the directory the mutant module lives in, and an un-awaited use would race it. `use`
      // itself is synchronous everywhere it is called below (it only drives synchronous file
      // reads and the mutant's own synchronous `compile`), so this await settles immediately.
      return await use(mutant);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  };

  /** Combine a mutant `compile` with the REAL, unmutated `readConfigTree` — the same shell shape
   * `generateQualification` itself uses — to produce its equivalent over a config directory. */
  function generateWithMutantCompile(mutant, configDir) {
    const files = readQualificationConfigTree(configDir);
    const { declaration, dropped } = mutant.compile(files, new Ledger());
    return { ...declaration, dropped };
  }

  test("CONTROL: the mutant harness reproduces the real generator when it patches nothing real", async () => {
    // A mutation experiment whose harness is untested proves nothing about the mutation. The
    // control changes a comment only, and the output must be byte-identical to the real one.
    const real = JSON.stringify(generateQualification(FIXTURE_CONFIG));
    const same = await withMutantCompile(
      (s) => s.replace("// ── assemble", "// ── assemble (harness control)"),
      (mutant) => JSON.stringify(generateWithMutantCompile(mutant, FIXTURE_CONFIG)),
    );
    assert.equal(same, real, "the mutant harness does not reproduce the real generator");
  });

  test("MUTANT: restore the silent `continue` at the token loop and the DROP 10 assertion goes RED", async () => {
    const droppedByMutant = await withMutantCompile(
      (source) => {
        // Replace the whole recorded branch with the single line it replaced.
        const start = source.indexOf('        if (typeof entry.field === "string") {');
        assert.notEqual(start, -1, "the recorded branch is not where the mutation expects it");
        const end = source.indexOf("        // DROP PATH 13.", start);
        assert.notEqual(end, -1, "the end of the recorded branch was not found");
        return (
          source.slice(0, start) +
          // `resolvableFields` — the LOCAL variable `compile()` computes at its own step 0
          // (`deriveResolvableFields(files)`) — not a module constant: 2026-08-06 retired
          // `RESOLVABLE_FIELDS` as a name this file could even reference here any more, which is
          // itself part of what this mutant proves (see this test's own header): the OLD shape
          // closed over a frozen list; the CURRENT shape closes over a value computed from the
          // same config this loop is already reading, and the silent-continue defect is
          // reproduced against THAT shape, not a stale one.
          '        if (typeof entry.field !== "string" || !resolvableFields.includes(entry.field)) continue;\n' +
          "        if (entry.render_only === true) continue;\n" +
          "        if (!isScalar(entry.value) || entry.value === null) continue;\n" +
          "        tokens[entry.field][entry.token] = entry.value;\n" +
          "        continue;\n" +
          source.slice(end)
        );
      },
      (mutant) =>
        withMutatedConfig(
          FIXTURE_CONFIG,
          // NOT `priority` (as this test used before 2026-08-06): the fixture's own `markers.yaml`
          // already spells `priority` with a fixed value (🔽/⏫), so `deriveResolvableFields`
          // admits it at `compile()`'s step 0 — BEFORE this mutated loop ever runs — regardless of
          // this mutation. An `extraction_hint`-only field (no `value:` anywhere for it, the same
          // shape DROP 10 above uses) is the one shape no admission rule can ever pull in, mutated
          // or not, so it is what proves THIS loop's own record-keeping is what makes DROP 10 pass.
          (c) =>
            put(
              c,
              "vocabulary/gentest_scheduled_tags.yaml",
              'gentest_scheduled_tags:\n  - token: "🗓️"\n    field: gentest_scheduled_at\n    extraction_hint: trailing_date\n',
            ),
          (configDir) => generateWithMutantCompile(mutant, configDir).dropped,
        ),
    );

    // THE RED. Under the mutant, `🗓️` is dropped and NOTHING says so — which is exactly the
    // shipped defect. The assertion DROP 10 makes therefore fails here, and this test asserts
    // that it fails: a guard that cannot go red is decoration.
    assert.throws(
      () => assertDropped(droppedByMutant, "vocabulary token '🗓️'", /sets 'gentest_scheduled_at'/),
      /nothing was recorded for 'vocabulary token '🗓️''/,
      "the mutant still recorded the drop — the guard is not what makes DROP 10 pass",
    );
  });
});

// ── 3. the CI check fails on a stale declaration ──────────────────────────────────────────────

describe("3. THE CI GATE — it does not merely run, it FAILS on a stale declaration", () => {
  /** Run `scripts/checkdeclarations.mjs` exactly as build.yml does, and report its exit code. */
  const runCheck = (configDir, presentationPath) => {
    try {
      const stdout = execFileSync(
        process.execPath,
        [join(REPO, "scripts", "checkdeclarations.mjs"), "--config-dir", configDir, "--presentation", presentationPath],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      return { code: 0, output: stdout };
    } catch (error) {
      return { code: error.status, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
    }
  };

  /** Write a presentation.json holding the four generated keys from `configDir`. */
  const servedFrom = (configDir, scratch) => {
    const path = join(scratch, "presentation.json");
    writeFileSync(
      path,
      JSON.stringify(
        {
          note: "a synthetic served document",
          qualification: generateQualification(configDir),
          structural: generateStructural(configDir),
          resolution: generateResolution(configDir),
          rules: generateRules(configDir),
        },
        null,
        2,
      ),
    );
    return path;
  };

  test("FRESH: a declaration generated from its own config exits 0", () => {
    const scratch = mkdtempSync(join(tmpdir(), "gate-fresh-"));
    try {
      const served = servedFrom(FIXTURE_CONFIG, scratch);
      const { code } = runCheck(FIXTURE_CONFIG, served);
      assert.equal(code, 0, "a fresh declaration did not pass the gate");
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("STALE: the config gains a token the app cannot express, and the gate EXITS 1", () => {
    // This is the whole point. Before this change the same mutation moved NOTHING in the
    // generated output, so no staleness check anywhere could have fired on it.
    const scratch = mkdtempSync(join(tmpdir(), "gate-stale-"));
    try {
      const served = servedFrom(FIXTURE_CONFIG, scratch);
      const result = withMutatedConfig(
        FIXTURE_CONFIG,
        // NOT `priority` (as this test used before 2026-08-06): the fixture's `markers.yaml`
        // already spells it with a fixed value, so `deriveResolvableFields` admits it and a NEW
        // `#p1` token would be PUBLISHED, not dropped — proving staleness a different way (a new
        // token value) rather than the one this test names. `gentest_scheduled_at`
        // (`extraction_hint`-only, the same shape DROP 10 above uses) stays unresolvable under
        // every admission rule, so it still demonstrates "a token the app cannot express".
        (c) =>
          put(
            c,
            "vocabulary/gentest_scheduled_tags.yaml",
            'gentest_scheduled_tags:\n  - token: "🗓️"\n    field: gentest_scheduled_at\n    extraction_hint: trailing_date\n',
          ),
        (configDir) => runCheck(configDir, served),
      );
      assert.equal(result.code, 1, `the gate did not fail on a stale declaration:\n${result.output}`);
      assert.match(result.output, /qualification: STALE/);
      // And it names WHICH declaration vanished, not merely that bytes differ.
      assert.match(result.output, /NEWLY DROPPED\s+vocabulary token '🗓️'/);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("STALE: a config change the app CAN express also exits 1 — the gate is not drop-specific", () => {
    const scratch = mkdtempSync(join(tmpdir(), "gate-stale2-"));
    try {
      const served = servedFrom(FIXTURE_CONFIG, scratch);
      const result = withMutatedConfig(
        FIXTURE_CONFIG,
        (c) => edit(c, "views/main.yaml", "        domain: personal", "        domain: work"),
        (configDir) => runCheck(configDir, served),
      );
      assert.equal(result.code, 1, `the gate did not fail on a changed default:\n${result.output}`);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("NOT CHECKED is not a pass: an absent config dir exits 3, never 0", () => {
    // build.yml reads this exit code and raises a ::warning:: rather than a green tick, because a
    // check that could not run must never look like a check that ran and passed.
    const absent = join(tmpdir(), "no-such-config-dir");
    const { code, output } = runCheck(absent, join(REPO, "presentation.json"));
    assert.equal(code, 3);
    assert.match(output, /NOTHING WAS CHECKED/);
    assert.match(output, /It is NOT a pass/);
    // The report must not explain a SEARCH it did not make. `--config-dir` named this directory,
    // so a line about where the ancestor walk looked would be a true sentence about the wrong
    // thing — which is exactly how the wording this replaced ("expected in CI", printed on the
    // operator's own laptop) came to be read as reassurance.
    assert.match(output, /named explicitly by --config-dir/);
    assert.doesNotMatch(output, /monorepo checkout located at/);
  });

  test("--require-config turns the same absence into a FAILURE, and only when passed", () => {
    // The distinction the exit codes carry: CI never passes the flag, so an absent monorepo stays
    // exit 3 and the workflow stays green-with-a-warning. A local caller who MEANT to compare
    // against the operator's config passes it, and finds out that the comparison did not happen.
    const absent = join(tmpdir(), "no-such-config-dir");
    const presentation = join(REPO, "presentation.json");
    const relaxed = runCheck(absent, presentation);
    const strict = spawnSync(
      process.execPath,
      [
        join(REPO, "scripts", "checkdeclarations.mjs"),
        "--config-dir",
        absent,
        "--presentation",
        presentation,
        "--require-config",
      ],
      { encoding: "utf8" },
    );
    assert.equal(relaxed.code, 3, "without the flag, an absence is 'not checked'");
    assert.equal(strict.status, 1, "with the flag, the same absence is a failure");
    assert.match(strict.stderr, /--require-config was passed/);
    // Three outcomes, three codes: a MATCH is 0, a STALE declaration is 1, an absence is 3 — and
    // the absence only becomes 1 when a caller asked for it to.
    assert.notEqual(relaxed.code, 0, "an absence must never share an exit code with a match");
  });

  test("the in-process comparison agrees with the subprocess, so a test can use either", () => {
    const served = {
      qualification: generateQualification(FIXTURE_CONFIG),
      structural: generateStructural(FIXTURE_CONFIG),
      resolution: generateResolution(FIXTURE_CONFIG),
      rules: generateRules(FIXTURE_CONFIG),
    };
    assert.deepEqual(checkDeclarations(FIXTURE_CONFIG, served).stale, []);
    assert.deepEqual(checkDeclarations(FIXTURE_CONFIG, {}).stale, [
      "qualification",
      "structural",
      "resolution",
      "rules",
    ]);
  });
});

// ── 4. no wolf ────────────────────────────────────────────────────────────────────────────────

describe("4. NO WOLF — the ledger records what was dropped, and nothing else", () => {
  test("the unmutated fixture drops exactly two things, all real", () => {
    // RESTATED — two -> four, when the fixture's markers.yaml gained priority's own two
    // value-match rows (🔽/⏫, needed so `readOrderingFieldMarkers` has something real to find once
    // it always looks for a `priority` marker — see this file's own resolution-side tests below).
    // At the time, `compile-qualification.mjs` dropped any token whose `field` was outside the
    // frozen `RESOLVABLE_FIELDS` triple — `priority` was not one of them, so both new tokens
    // dropped here.
    //
    // RESTATED AGAIN 2026-08-06 — four -> two. `RESOLVABLE_FIELDS` is no longer frozen: it is
    // `deriveResolvableFields`'s own measurement of the config, and 🔽/⏫ are exactly a fixed-value
    // vocabulary token spelling `priority` — rule (a), admitted (`compile-qualification.mjs`'s own
    // header). They are PUBLISHED now, not dropped; the operator's real config shows the identical
    // move (verified: `priority` moved from dropped to published there too, PR description). Only
    // `📅` (an `extraction_hint`-only marker, never a fixed value) and the malformed nested section
    // still drop — the same two DROP PATHS DROP 10's own reworked test now demonstrates with a
    // synthetic field, reproduced here for real from the fixture's own pre-existing content.
    const dropped = generateQualification(FIXTURE_CONFIG).dropped;
    assert.deepEqual(Object.keys(dropped).sort(), ["section 'main.nested'", "vocabulary token '📅'"]);
    assert.deepEqual(generateStructural(FIXTURE_CONFIG).dropped, {});
    // RESTATED, 2026-08-06 ("the default ordering is declared") — {} -> one real drop. The
    // fixture declares no `global_defaults.yaml` at all, so `defaultOrdering` falls back to the
    // engine's own literal tuple (due_date, priority, title — see compile-resolution.mjs's own
    // header, "THE DEFAULT ORDERING"), and every one of ITS fields is now looked up for a marker,
    // generically, the same as any section's own declared `ordering:` field — no field is
    // exempted by name any more. `title` has none in this fixture (it never does: a title is the
    // printed line's own chrome-free text, not a glyph — see `readOrderingFieldMarkers`'s own
    // header), so DROP PATH 13 records it. This is NOT a new wolf: the fact was always true, and
    // was previously silenced by a hardcoded `field !== "title"` filter this change removed
    // precisely because it named a field by string in the compiler's own control flow.
    assert.deepEqual(generateResolution(FIXTURE_CONFIG).dropped, {
      "ordering field 'title'":
        "named by a section's 'ordering:' and/or the engine's own default ordering, but " +
        "vocabulary/markers.yaml declares no marker for it at all, so nothing can read its value off a line",
    });
  });

  test("a token on a DIFFERENT axis — an edge tag — is not recorded, because nothing was dropped", () => {
    const dropped = droppedFrom(generateQualification, (c) =>
      put(c, "vocabulary/edge_tags.yaml", 'edge_tags:\n  - token: "#unlocks"\n    edge_type: UNLOCKS\n    cardinality: many\n'),
    );
    assert.ok(
      !Object.keys(dropped).some((k) => k.includes("#unlocks")),
      `an edge tag was recorded as a dropped field declaration: ${JSON.stringify(dropped)}`,
    );
  });

  test("a marker for a field no ordering names is not recorded either", () => {
    const dropped = droppedFrom(generateResolution, (c) =>
      edit(c, "vocabulary/markers.yaml", "markers:\n", 'markers:\n  - token: "⏳"\n    field: waiting_since\n    extraction_hint: trailing_date\n'),
    );
    assert.ok(
      !("ordering field 'waiting_since'" in dropped),
      "a marker outside the ordering table was recorded as a drop",
    );
  });

  test("a generate NEVER fails on a drop — a generator that cries wolf gets --force'd", () => {
    // The design decision, asserted rather than left in a comment: `generateQualification` returns
    // normally with drops present, both against the operator's config and against the fixture.
    // Only DISAGREEING with the committed record is an error, and that is `--check`'s job
    // (section 3).
    //
    // NOT a `field: alpha, value: 1` fixed-value token (as this test used before 2026-08-06): rule
    // (a) admits exactly that shape (`isFixedValueToken`), so `alpha`/`beta` would each become
    // resolvable and PUBLISH rather than drop — proving nothing about a generator that "cries
    // wolf". `extraction_hint`-only entries (the same shape DROP 10 uses) still drop under every
    // admission rule, so they are what this test needs.
    assert.doesNotThrow(() =>
      withMutatedConfig(
        FIXTURE_CONFIG,
        (c) =>
          put(
            c,
            "vocabulary/many.yaml",
            'many:\n  - token: "#a"\n    field: alpha\n    extraction_hint: trailing_int\n  - token: "#b"\n    field: beta\n    extraction_hint: trailing_int\n',
          ),
        (configDir) => {
          const result = generateQualification(configDir);
          assert.equal(Object.keys(result.dropped).length, 4);
          return result;
        },
      ),
    );
  });
});

// ── 5. the acceptance test, against a scratch copy of the operator's REAL config ───────────────

const monorepo = existsSync(DEFAULT_CONFIG_DIR);
const skip = monorepo ? false : `monorepo not checked out at ${DEFAULT_CONFIG_DIR}`;

describe("5. THE ACCEPTANCE TEST — the operator's own three outcomes, on his own config", () => {
  test("BASELINE: his real config today drops 11 tokens and 16 sections, all recorded", { skip }, () => {
    // RESTATED 2026-08-03 against monorepo `d4c9d98`: 77/137/214 -> 82/148/230.
    //
    // RESTATED AGAIN 2026-08-04 against monorepo `0fe6c1d`: 82/148/230 -> 82/107/189. Not his
    // config moving this time — `compile-qualification.mjs`'s one-hop `children:`/`parents:`
    // widening (`normaliseEdgeStep`, this leg) resolved 19 patterns that used to be refused for
    // "traverses an edge", each covering one or more sections, so 41 fewer sections are dropped for
    // that reason. The token count is untouched (82): vocabulary drops are a different axis this
    // widening never reads.
    //
    // RESTATED AGAIN 2026-08-06: 82/107/189 -> 11/82/93. This time the token count DOES move, and
    // by the most — `RESOLVABLE_FIELDS` stopped being the hand-picked `["node_type", "domain",
    // "status"]` this test pinned and became `deriveResolvableFields`'s own measurement of his
    // config (`compile-qualification.mjs`'s header): 18 fields are resolvable now, not 3, so most
    // of the 82 tokens DROP PATH 10 used to catch ("sets a field outside node_type/domain/status")
    // are published instead. The 71 that stopped being dropped are exactly the operator's own
    // diagnosis made concrete: "it's definitely fields it can't resolve... that should be compiled
    // and be the source of truth." The 11 still dropped are `extraction_hint`-only, `render_only`,
    // or `parametric_field:`-shaped — see DROP 10/11/13's own tests for what each still excludes,
    // and why. Sections: 107 -> 82, the same 25-section improvement `cap_state`/`principle_state`/
    // `class_state`/`package_state`/`instantiate`/`tier`/`genre`/`god_box`/`priority`/`cadence`/
    // `change_type`/`blocked_state`/`lead_state`/`asserted_state` becoming resolvable buys.
    //
    // RESTATED AGAIN, SAME DAY: 11/82/93 -> 11/16/27. Resolvability became a CASCADE WALK
    // (`deriveStructuralFieldsByQualification`, `compile-qualification.mjs`), not a line-rung-only
    // token lookup: a pattern referencing `project` or `stage` — no vocabulary token, but fixed by
    // EVERY section that registers it via a section-level `defaults:` — is admitted too. 66 of the
    // 82 previously-dropped sections were dropped for exactly that reason (`unresolvable field(s):
    // project` or `...stage`); the other 16 are dropped for a genuinely different reason (the
    // section's qualification needs the clock or an orderable comparison — `due_date < today` and
    // its kin — which this rung does not and should not touch; see this PR's own residue
    // classification). The token count (11) is untouched: no vocabulary token's own admission
    // changed, only which SECTIONS' patterns can now use a token-admitted OR structurally-admitted
    // field together.
    //
    // THESE THREE NUMBERS ARE A RECORD OF HIS CONFIG AND THIS GENERATOR'S GRAMMAR, NOT A FIXED
    // PROPERTY OF THIS REPO. They move whenever he adds a view OR this generator's grammar widens,
    // and they are expected to. Re-measure and restate them with the monorepo commit named — do not
    // relax the assertion into a range.
    const dropped = generateQualification(DEFAULT_CONFIG_DIR).dropped;
    const tokens = Object.keys(dropped).filter((k) => k.startsWith("vocabulary token"));
    const sections = Object.keys(dropped).filter((k) => k.startsWith("section "));
    assert.equal(tokens.length, 11, "the token drop count moved — regenerate and say so");
    assert.equal(sections.length, 16, "the refused-section count moved — regenerate and say so");
    // design-the-rule-mirror.md §9.2 measured 137 of 186 by running a script. It is now a fact
    // the declaration states about itself.
    assert.equal(Object.keys(dropped).length, 27);
    for (const reason of Object.values(dropped)) assert.ok(reason.length > 0);
  });

  test("HALF A — a declaration the grammar CANNOT express: a human is told", { skip }, () => {
    // NOT `#p1 -> priority` (as this test used before 2026-08-06): the real config's own
    // `vocabulary/markers.yaml` spells `priority` with fixed enum values, so `deriveResolvable
    // Fields` admits it and this token would be PUBLISHED, not dropped. `gentest_scheduled_at`
    // (`extraction_hint`-only) stays unresolvable under every admission rule this compiler has.
    const dropped = withMutatedConfig(
      DEFAULT_CONFIG_DIR,
      (configDir) =>
        writeFileSync(
          join(configDir, "vocabulary", "gentest_scheduled_tags.yaml"),
          'gentest_scheduled_tags:\n  - token: "🗓️"\n    field: gentest_scheduled_at\n    extraction_hint: trailing_date\n',
        ),
      (configDir) => generateQualification(configDir).dropped,
    );
    // 1. RECORDED, keyed by the token he typed, with a reason he can act on.
    assertDropped(dropped, "vocabulary token '🗓️'", /sets 'gentest_scheduled_at'/);
    // 2. PRINTED. The same map is what `reportDropped` turns into stderr lines on every generate.
    const ledger = new Ledger();
    ledger.drop("vocabulary token '🗓️'", dropped["vocabulary token '🗓️'"]);
    const report = ledger.report("qualification").join("\n");
    assert.match(report, /READ AND NOT PUBLISHED/);
    assert.match(report, /vocabulary token '🗓️'/);
    // 3. GATED. The committed presentation.json does not carry it, so `--check` is now red.
    const served = JSON.parse(readFileSync(join(REPO, "presentation.json"), "utf8"));
    assert.ok(
      !("vocabulary token '🗓️'" in served.qualification.dropped),
      "the committed declaration already carries this token — the gate arm of this test is void",
    );
  });

  test("HALF B — a declaration the grammar CAN express: it flows through, with no code change", { skip }, () => {
    // The other half, and the test is not a test without it. A new SECTION, with a new
    // `defaults:` field the generator has never seen, pointing at an already-publishable
    // qualification. Nothing in `app/` or `scripts/` is edited between the two halves.
    const language = withMutatedConfig(
      DEFAULT_CONFIG_DIR,
      (configDir) => {
        const path = join(configDir, "views", "inbox.yaml");
        const before = readFileSync(path, "utf8");
        assert.ok(before.includes("qualification: domain-empty"), "inbox.yaml's shape moved");
        writeFileSync(
          path,
          before.replace(
            "    - id: domain-empty",
            "    - id: invented-section\n" +
              "      qualification: domain-empty\n" +
              '      name: "Invented"\n' +
              "      defaults:\n" +
              "        invented_field: invented_value\n" +
              "    - id: domain-empty",
          ),
        );
      },
      (configDir) => readQualificationDeclaration({ qualification: generateQualification(configDir) }).qualification,
    );

    const section = language.sections["inbox"]?.["invented-section"];
    assert.ok(section, "a new section with a publishable qualification did not flow through");
    assert.equal(section.name, "Invented");
    assert.equal(section.qualification, "domain-empty");
    // A NEW FIELD, never enumerated anywhere: the grammar is `{field: scalar}`, not a list of the
    // eight fields the generator happened to see. This is the generality claim, tested.
    assert.deepEqual(section.defaults, { invented_field: "invented_value" });
    // And it takes its place in the FULL declared order, so addressing follows it too.
    assert.ok(language.sectionOrder["inbox"].includes("invented-section"));
    assert.deepEqual(language.sectionOrder["inbox"], ["inbox-tagged", "invented-section", "domain-empty"]);
  });

  test("THE THIRD OUTCOME IS GONE: a config change reaches EXACTLY ONE of the two other rows", { skip }, () => {
    // The acceptance test, stated as the operator states it. Take the same declaration twice —
    // one the app can express and one it cannot — and assert each lands in exactly one row, with
    // "silently ignored" reachable by neither.
    const publish = withMutatedConfig(
      DEFAULT_CONFIG_DIR,
      (configDir) =>
        writeFileSync(
          join(configDir, "vocabulary", "extra_domain_tags.yaml"),
          'extra_domain_tags:\n  - token: "#invented"\n    field: domain\n    value: invented\n',
        ),
      (configDir) => generateQualification(configDir),
    );
    // ROW 1, picks it up: the token is in the published grammar, and not in `dropped`.
    assert.equal(publish.tokens.domain["#invented"], "invented");
    assert.ok(!("vocabulary token '#invented'" in publish.dropped));

    const refuse = withMutatedConfig(
      DEFAULT_CONFIG_DIR,
      (configDir) =>
        writeFileSync(
          join(configDir, "vocabulary", "extra_domain_tags.yaml"),
          // NOT `field: invented_field, value: invented` (as this test used before 2026-08-06):
          // rule (a) admits EXACTLY that shape (a fixed-value token) — `invented_field` would
          // become resolvable and PUBLISH, collapsing this into ROW 1. `extraction_hint`-only
          // (a value that VARIES per line, never a fixed spelling) is what still refuses under
          // every rule this compiler has.
          'extra_domain_tags:\n  - token: "#invented"\n    field: invented_field\n    extraction_hint: trailing_int\n',
        ),
      (configDir) => generateQualification(configDir),
    );
    // ROW 2, refuses it visibly: absent from every published token map, present in `dropped`.
    for (const map of Object.values(refuse.tokens)) {
      assert.ok(!("#invented" in map), "a token on an unresolvable field reached the published grammar");
    }
    assertDropped(refuse.dropped, "vocabulary token '#invented'", /sets 'invented_field'/);

    // ROW 3, silently ignored: no longer reachable. The two runs differ in `dropped`, so the
    // refusal is not byte-identical to the publish — which is precisely what it used to be.
    assert.notDeepEqual(publish.dropped, refuse.dropped);
  });
});

// ── the ledger itself ─────────────────────────────────────────────────────────────────────────

describe("6. the ledger", () => {
  test("two drops of one thing join their reasons rather than one overwriting the other", () => {
    const ledger = new Ledger();
    ledger.drop("a", "first");
    ledger.drop("a", "second");
    assert.equal(ledger.toJSON().a, "first; second");
    assert.equal(ledger.size, 1);
  });

  test("keys are sorted, so a directory-walk order never produces a spurious diff", () => {
    const ledger = new Ledger();
    for (const key of ["z", "a", "m"]) ledger.drop(key, "why");
    assert.deepEqual(Object.keys(ledger.toJSON()), ["a", "m", "z"]);
  });

  test("a drop with no reason is refused — an unexplained record is the silence again", () => {
    const ledger = new Ledger();
    assert.throws(() => ledger.drop("a", ""), /must give a reason/);
    assert.throws(() => ledger.drop("", "why"), /must name what was dropped/);
  });

  test("an empty ledger reports that plainly, rather than saying nothing", () => {
    assert.match(new Ledger().report("qualification").join("\n"), /nothing was dropped/);
  });
});

// ── 7. the audit is COMPLETE, and the completeness is machine-checked ─────────────────────────

describe("7. THE COMPLETENESS SCANNER — no path may leave a declaration without a verdict", () => {
  /**
   * WHY A SCANNER AND NOT A GREP. Sections 1 and 2 prove each drop path I FOUND. They cannot prove
   * I found them all, and "grep returned nothing" is not a proof of absence — this repository has
   * already had an AST scan pass its own positive control and still miss three call sites named as
   * strings. So this scans the RAW SOURCE TEXT of the five files below (never an AST, so a shape
   * spelled as a string cannot hide from it) and requires every `continue;` to carry exactly one
   * of two verdicts:
   *
   *   RECORDED   a `ledger.drop(` call appears in the twelve lines above it, so the declaration
   *              it discards leaves a record.
   *   NOT A DROP a comment saying so, and why — the audit's own finding, written at the site.
   *
   * A new `continue` added later carries neither and turns this red. That is the point: the guard
   * is against the NEXT silent drop, not only the sixteen already closed.
   *
   * SIX FILES, NOT FIVE — THE SAME GAP, CLOSED A SECOND TIME RATHER THAN REPEATED. The structural
   * port (`5d4f1b5`) split `generate-structural-declaration.mjs`'s parsing logic (and its
   * `continue`s) into `compile-structural.mjs`; the qualification port (`9be7f13`) did the same
   * into `compile-qualification.mjs` and added both compile modules here, closing the gap that
   * `5d4f1b5` had left open (every `continue` in `compile-structural.mjs` was unscanned by this
   * sweep from the moment it merged until `9be7f13`). This port (resolution, step C's remaining
   * generator) moved `generate-resolution-declaration.mjs`'s own parsing logic — and every one of
   * its `continue`s — into `scripts/compile-resolution.mjs` the identical way. Confirmed directly,
   * not assumed: running this file's own test suite BEFORE adding `compile-resolution.mjs` below
   * made "the sweep is not vacuous" fail (31 `continue` statements seen, under the >= 40 floor —
   * the corpus had silently shrunk by exactly the ~16 statements that moved out of
   * `generate-resolution-declaration.mjs` and were not yet being counted anywhere), which is the
   * scanner catching the same class of gap PR #86's own commit message named, before it could ship
   * silently a second time.
   */
  const GENERATORS = [
    "scripts/generate-qualification-declaration.mjs",
    "scripts/generate-structural-declaration.mjs",
    "scripts/generate-resolution-declaration.mjs",
    "scripts/generate-rules-declaration.mjs",
    "scripts/compile-qualification.mjs",
    "scripts/compile-structural.mjs",
    "scripts/compile-resolution.mjs",
    "scripts/compile-rules.mjs",
  ];
  const WINDOW = 12;

  /** @returns {string[]} `file:line  <source>` for every `continue;` carrying neither verdict. */
  function unclassified(sources) {
    const found = [];
    for (const [name, text] of Object.entries(sources)) {
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (!/\bcontinue;/.test(line)) return;
        const window = lines.slice(Math.max(0, i - WINDOW), i + 1).join("\n");
        if (/ledger\.drop\(/.test(window)) return;
        if (/NOT A DROP/.test(window)) return;
        found.push(`${name}:${i + 1}  ${line.trim()}`);
      });
    }
    return found;
  }

  const read = () =>
    Object.fromEntries(GENERATORS.map((g) => [g, readFileSync(join(REPO, g), "utf8")]));

  test("POSITIVE CONTROL: the scanner FINDS an unclassified `continue` when one is injected", () => {
    // A measurement that returns zero is a broken measurement until a positive control passes
    // (design-the-resolution-architecture.md:1406-1408). This is that control, and it runs FIRST.
    const sources = read();
    const target = GENERATORS[0];
    sources[target] = sources[target].replace(
      "export function generateQualification(",
      "function injectedSilentDrop(xs) {\n" +
        "  for (const x of xs) {\n" +
        "    if (x.field !== undefined) continue;\n" +
        "  }\n" +
        "}\n\n" +
        "export function generateQualification(",
    );
    const found = unclassified(sources);
    assert.equal(found.length, 1, `the control did not produce exactly one finding: ${found.join("\n")}`);
    assert.match(found[0], /if \(x\.field !== undefined\) continue;/);
  });

  test("SECOND CONTROL: a `continue` labelled NOT A DROP is accepted, and only then", () => {
    const sources = read();
    const target = GENERATORS[1];
    sources[target] = sources[target].replace(
      "export function generateStructural(",
      "function labelled(xs) {\n" +
        "  for (const x of xs) {\n" +
        "    // NOT A DROP: a synthetic control.\n" +
        "    if (x) continue;\n" +
        "  }\n" +
        "}\n\n" +
        "export function generateStructural(",
    );
    assert.deepEqual(unclassified(sources), []);
  });

  test("THE SWEEP: every `continue;` in all three generators carries a verdict", () => {
    const found = unclassified(read());
    assert.deepEqual(
      found,
      [],
      "a `continue` in a generator neither records a drop nor says why it is not one:\n" +
        found.join("\n"),
    );
  });

  test("the sweep is not vacuous — it looked at a real number of statements", () => {
    // A scanner whose corpus is empty passes trivially. This pins the corpus size, so a refactor
    // that moved the generators somewhere the scanner cannot see fails here rather than passing.
    const sources = read();
    const total = Object.values(sources).reduce(
      (n, text) => n + text.split("\n").filter((l) => /\bcontinue;/.test(l)).length,
      0,
    );
    assert.ok(total >= 40, `the scanner only saw ${total} continue statements, which cannot be right`);
  });

  test("every ledger.drop call site is inside a generator this scanner reads", () => {
    // The other direction: a drop recorded somewhere the sweep does not scan would be a path
    // whose completeness nothing checks.
    const sources = read();
    const recorded = Object.values(sources).reduce(
      (n, text) => n + (text.match(/ledger\.drop\(/g) ?? []).length,
      0,
    );
    assert.ok(recorded >= 16, `only ${recorded} recorded drop sites were found across the three generators`);
  });
});

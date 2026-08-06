/**
 * THE BROWSER READS COMPOSITION — proof for closing the asymmetry monorepo PR #72 named.
 *
 *   node --test tests/resolution-declared-composition.test.mjs
 *
 * THE ASYMMETRY THIS CLOSES: monorepo PR #72 (`bc3aa01`, "The engine reads composition from
 * config, not just its own copy") gave `global_defaults.yaml` a `composition:` key, validated at
 * load time by `bundle/loader.py`'s `_validate_global_composition` and threaded into every render
 * call site — but `scripts/compile-resolution.mjs` kept publishing `ENGINE_LITERAL_COMPOSITION`
 * unconditionally, with a comment saying no config surface existed at all. That PR's own body named
 * the trap: the moment an operator declares a composition that genuinely differs, the ENGINE would
 * honour it and the BROWSER would keep guessing the old literal — the exact "one side right, one
 * side silently wrong" divergence this whole arc exists to make impossible, opened rather than
 * closed. `readGlobalComposition` (`scripts/compile-resolution.mjs`) is the fix.
 *
 * FOUR CLAIMS, FOUR SECTIONS — the same shape
 * `tests/resolution-declared-default-ordering.test.mjs` already proved for `defaultOrdering`:
 *
 *   1. NO CONFIG, NO CHANGE. A config with no `global_defaults.yaml` at all — every config this
 *      repo has ever run against, today — publishes exactly what it always published, byte for
 *      byte, PLUS a new, visible `compositionSource: "engine-fallback"`.
 *
 *   2. ANOTHER USER'S CONFIG. A `global_defaults.yaml` declaring `composition:` over an order that
 *      is NOT the engine's literal is compiled and published verbatim, `compositionSource:
 *      "config"` — proof the compiler genuinely READS the declaration rather than merely
 *      tolerating its presence (the mutation proof the brief asked for).
 *
 *   3. MALFORMED CONFIG REFUSES LOUDLY. Every shape `bundle/loader.py`'s own
 *      `_validate_global_composition` rejects (not a mapping, `heads:` missing a required shape,
 *      an unknown cell class, an empty `tail:`, …) throws `GenerationError` here too — the two
 *      validations were built to agree on purpose; see section 3's own comment for where each
 *      check was read from.
 *
 *   4. THE PROOF THAT MATTERS — ANOTHER USER, A DIFFERENT COMPOSITION, THE SAME BYTES THE ENGINE
 *      WOULD PRODUCE. `tests/fixtures/composition-different-declaration-agreement.json` — see its
 *      own header for exactly how it was produced and why it is a committed fixture rather than a
 *      live `composition-agreement.py` run (the local trunk checkout is three commits behind
 *      `bc3aa01` and must not be edited to catch up; no cycle or state.db may substitute). Every
 *      fixture's `engineLine` is the REAL bc3aa01 renderer's own transcribed output for a
 *      genuinely different declared order; this section proves `composeLine` reproduces it exactly.
 *
 * NOTHING HERE WRITES TO THE OPERATOR'S CONFIG or to `apps/qntm-md/config/`. Every mutation in
 * sections 1-3 is made to a `cpSync` scratch copy of `tests/fixtures/config`, removed in a
 * `finally`.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { generateResolution } from "../scripts/generate-resolution-declaration.mjs";
import { GenerationError, ENGINE_LITERAL_COMPOSITION } from "../scripts/compile-resolution.mjs";
import { composeLine } from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CONFIG = join(HERE, "fixtures", "config");

/** Copy the fixture config, mutate it, generate the resolution declaration, clean up. */
function withScratchFixture(mutate) {
  const scratch = mkdtempSync(join(tmpdir(), "declared-composition-"));
  try {
    const configDir = join(scratch, "config");
    cpSync(FIXTURE_CONFIG, configDir, { recursive: true });
    mutate(configDir);
    return generateResolution(configDir);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

describe("1. NO CONFIG, NO CHANGE — the fixture declares no global_defaults.yaml at all", () => {
  test("falls back to the engine's own literal composition, and says so", () => {
    const resolution = generateResolution(FIXTURE_CONFIG);
    assert.deepEqual(resolution.composition, ENGINE_LITERAL_COMPOSITION);
    assert.equal(resolution.compositionSource, "engine-fallback");
  });
});

describe("2. ANOTHER USER'S CONFIG — a composition that is NOT the engine's literal", () => {
  const DECLARED = {
    heads: { checkbox: ["title", "checkbox"], plain_line: ["title"] },
    tail: ["tags", "stamp", "markers", "chrome", "date"],
  };

  test("the served declaration carries the CONFIG's own order, not the engine's literal", () => {
    const resolution = withScratchFixture((configDir) => {
      writeFileSync(
        join(configDir, "global_defaults.yaml"),
        [
          "defaults: {}",
          "composition:",
          "  heads:",
          "    checkbox: [title, checkbox]",
          "    plain_line: [title]",
          "  tail: [tags, stamp, markers, chrome, date]",
          "",
        ].join("\n"),
      );
    });
    assert.deepEqual(resolution.composition, {
      ...DECLARED,
      separator: " ",
      bullet: ENGINE_LITERAL_COMPOSITION.bullet,
      titleStyles: ENGINE_LITERAL_COMPOSITION.titleStyles,
    });
    assert.equal(resolution.compositionSource, "config");
    // MUTATION PROOF: this really is DIFFERENT from the literal, not a reformatted copy of it —
    // a compiler that merely tolerated the key's presence but still published the literal would
    // pass every other assertion in this file and fail only this one.
    assert.notDeepEqual(resolution.composition, ENGINE_LITERAL_COMPOSITION);
  });

  test("separator is never a declared key — an operator trying to declare one is REFUSED, not silently ignored", () => {
    // Before `form:` existed, an unrecognised sibling of `heads:`/`tail:` loaded clean and changed
    // nothing — precisely the defect this module's own header warns about elsewhere. Composition's
    // top-level keys are now a closed, validated set (`heads`, `tail`, `form`), so a `separator:`
    // typo is now a loud `GenerationError` instead of a silent no-op.
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            [
              "defaults: {}",
              "composition:",
              "  heads:",
              "    checkbox: [checkbox, title]",
              "    plain_line: [title]",
              "  tail: [stamp, tags, markers, chrome, date]",
              "  separator: '  '",
              "",
            ].join("\n"),
          );
        }),
      GenerationError,
    );
  });

  describe("2b. FORM — the declared bullet + title-style wrap, composition's OWN optional sub-block", () => {
    test("a declared bullet + title_styles is read verbatim, compositionSource stays 'config'", () => {
      const resolution = withScratchFixture((configDir) => {
        writeFileSync(
          join(configDir, "global_defaults.yaml"),
          [
            "defaults: {}",
            "composition:",
            "  heads:",
            "    checkbox: [checkbox, title]",
            "    plain_line: [title]",
            "  tail: [stamp, date, tags, markers, chrome]",
            "  form:",
            "    bullet: '*'",
            "    title_styles: [italic]",
            "",
          ].join("\n"),
        );
      });
      assert.equal(resolution.composition.bullet, "*");
      assert.deepEqual(resolution.composition.titleStyles, ["italic"]);
      assert.equal(resolution.compositionSource, "config");
      // MUTATION PROOF: genuinely different from the engine literal's form, not a reformatted copy.
      assert.notEqual(resolution.composition.bullet, ENGINE_LITERAL_COMPOSITION.bullet);
      assert.notDeepEqual(resolution.composition.titleStyles, ENGINE_LITERAL_COMPOSITION.titleStyles);
    });

    test("heads/tail declared with NO form: block reads the engine's own bullet/titleStyles literal", () => {
      const resolution = withScratchFixture((configDir) => {
        writeFileSync(
          join(configDir, "global_defaults.yaml"),
          [
            "defaults: {}",
            "composition:",
            "  heads:",
            "    checkbox: [checkbox, title]",
            "    plain_line: [title]",
            "  tail: [stamp, date, tags, markers, chrome]",
            "",
          ].join("\n"),
        );
      });
      assert.equal(resolution.composition.bullet, ENGINE_LITERAL_COMPOSITION.bullet);
      assert.deepEqual(resolution.composition.titleStyles, ENGINE_LITERAL_COMPOSITION.titleStyles);
    });

    test("multiple declared title_styles nest, order-independent — the array is a MEMBERSHIP set", () => {
      const resolution = withScratchFixture((configDir) => {
        writeFileSync(
          join(configDir, "global_defaults.yaml"),
          [
            "defaults: {}",
            "composition:",
            "  heads:",
            "    checkbox: [checkbox, title]",
            "    plain_line: [title]",
            "  tail: [stamp, date, tags, markers, chrome]",
            "  form:",
            "    title_styles: [strikethrough, bold]",
            "",
          ].join("\n"),
        );
      });
      assert.deepEqual(resolution.composition.titleStyles, ["strikethrough", "bold"]);
    });
  });

  test("a composition may declare a THIRD head shape beyond checkbox/plain_line — not rejected", () => {
    const resolution = withScratchFixture((configDir) => {
      writeFileSync(
        join(configDir, "global_defaults.yaml"),
        [
          "defaults: {}",
          "composition:",
          "  heads:",
          "    checkbox: [checkbox, title]",
          "    plain_line: [title]",
          "    stat_line: [title]",
          "  tail: [stamp, date, tags, markers, chrome]",
          "",
        ].join("\n"),
      );
    });
    assert.deepEqual(resolution.composition.heads.stat_line, ["title"]);
  });
});

describe("3. MALFORMED CONFIG REFUSES LOUDLY, matching bundle/loader.py's own validation", () => {
  // Each case below names, in its own test title, the check `bundle/loader.py`'s
  // `_validate_global_composition` (monorepo, read-only) performs at the identical point — read
  // there, reproduced here, never invented independently.

  test("composition: not a mapping throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(join(configDir, "global_defaults.yaml"), "defaults: {}\ncomposition: not-a-map\n");
        }),
      GenerationError,
    );
  });

  test("composition.heads: absent throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            "defaults: {}\ncomposition:\n  tail: [stamp, date, tags, markers, chrome]\n",
          );
        }),
      GenerationError,
    );
  });

  test("composition.heads: missing the required 'plain_line' shape throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            [
              "defaults: {}",
              "composition:",
              "  heads:",
              "    checkbox: [checkbox, title]",
              "  tail: [stamp, date, tags, markers, chrome]",
              "",
            ].join("\n"),
          );
        }),
      GenerationError,
    );
  });

  test("composition.heads.<shape>: empty list throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            [
              "defaults: {}",
              "composition:",
              "  heads:",
              "    checkbox: []",
              "    plain_line: [title]",
              "  tail: [stamp, date, tags, markers, chrome]",
              "",
            ].join("\n"),
          );
        }),
      GenerationError,
    );
  });

  test("composition.heads.<shape>: an unknown cell class throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            [
              "defaults: {}",
              "composition:",
              "  heads:",
              "    checkbox: [checkbox, priority]", // 'priority' is a FIELD, never a cell class
              "    plain_line: [title]",
              "  tail: [stamp, date, tags, markers, chrome]",
              "",
            ].join("\n"),
          );
        }),
      GenerationError,
    );
  });

  test("composition.tail: absent throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            "defaults: {}\ncomposition:\n  heads:\n    checkbox: [checkbox, title]\n    plain_line: [title]\n",
          );
        }),
      GenerationError,
    );
  });

  test("composition.tail: empty list throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            [
              "defaults: {}",
              "composition:",
              "  heads:",
              "    checkbox: [checkbox, title]",
              "    plain_line: [title]",
              "  tail: []",
              "",
            ].join("\n"),
          );
        }),
      GenerationError,
    );
  });

  test("composition.tail: an unknown cell class throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            [
              "defaults: {}",
              "composition:",
              "  heads:",
              "    checkbox: [checkbox, title]",
              "    plain_line: [title]",
              "  tail: [stamp, date, tags, markers, chrome, due_date]", // a FIELD, never a cell class
              "",
            ].join("\n"),
          );
        }),
      GenerationError,
    );
  });

  test("a global_defaults.yaml that declares no composition: at all is 'not declared', not malformed", () => {
    // Defence in depth for the fallback branch itself: the operator's real file today is exactly
    // this shape (`defaults: {}`, nothing else) and must not throw.
    const resolution = withScratchFixture((configDir) => {
      writeFileSync(join(configDir, "global_defaults.yaml"), "defaults: {}\n");
    });
    assert.deepEqual(resolution.composition, ENGINE_LITERAL_COMPOSITION);
    assert.equal(resolution.compositionSource, "engine-fallback");
  });

  // FORM — the same "refuse loudly" posture as heads/tail above, for composition's own optional
  // `form:` sub-block. Each case names, in its own title, the check `bundle/loader.py`'s
  // `_validate_composition_form` performs at the identical point.
  const COMPOSITION_HEADS_TAIL = [
    "  heads:",
    "    checkbox: [checkbox, title]",
    "    plain_line: [title]",
    "  tail: [stamp, date, tags, markers, chrome]",
  ];

  test("composition.form: not a mapping throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            ["defaults: {}", "composition:", ...COMPOSITION_HEADS_TAIL, "  form: not-a-map", ""].join("\n"),
          );
        }),
      GenerationError,
    );
  });

  test("composition.form: has an unknown key throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            [
              "defaults: {}",
              "composition:",
              ...COMPOSITION_HEADS_TAIL,
              "  form:",
              "    separator: ', '", // never a form key — see section 2's own test
              "",
            ].join("\n"),
          );
        }),
      GenerationError,
    );
  });

  test("composition.form.bullet: not one of -/*/+ throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            ["defaults: {}", "composition:", ...COMPOSITION_HEADS_TAIL, "  form:", "    bullet: '>'", ""].join("\n"),
          );
        }),
      GenerationError,
    );
  });

  test("composition.form.bullet: more than one character throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            ["defaults: {}", "composition:", ...COMPOSITION_HEADS_TAIL, "  form:", "    bullet: '--'", ""].join("\n"),
          );
        }),
      GenerationError,
    );
  });

  test("composition.form.title_styles: empty list throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            ["defaults: {}", "composition:", ...COMPOSITION_HEADS_TAIL, "  form:", "    title_styles: []", ""].join(
              "\n",
            ),
          );
        }),
      GenerationError,
    );
  });

  test("composition.form.title_styles: an unknown style name throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            [
              "defaults: {}",
              "composition:",
              ...COMPOSITION_HEADS_TAIL,
              "  form:",
              "    title_styles: [underline]", // not in the closed 3-member vocabulary
              "",
            ].join("\n"),
          );
        }),
      GenerationError,
    );
  });

  test("composition.form.title_styles: a repeated style throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            [
              "defaults: {}",
              "composition:",
              ...COMPOSITION_HEADS_TAIL,
              "  form:",
              "    title_styles: [italic, italic]",
              "",
            ].join("\n"),
          );
        }),
      GenerationError,
    );
  });

  test("composition: an unknown top-level key (e.g. a 'forms' typo) throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            ["defaults: {}", "composition:", ...COMPOSITION_HEADS_TAIL, "  forms:", "    bullet: '*'", ""].join(
              "\n",
            ),
          );
        }),
      GenerationError,
    );
  });
});

describe("4. THE PROOF THAT MATTERS — another user's composition, the same bytes the engine would produce", () => {
  const read = (path) => JSON.parse(readFileSync(resolve(HERE, path), "utf8"));
  const FIXTURE = read("./fixtures/composition-different-declaration-agreement.json");

  test("positive control: the declared order really is not the engine's literal", () => {
    assert.notDeepEqual(
      { heads: FIXTURE.declaration.heads, tail: FIXTURE.declaration.tail },
      { heads: ENGINE_LITERAL_COMPOSITION.heads, tail: ENGINE_LITERAL_COMPOSITION.tail },
    );
  });

  for (const fixture of FIXTURE.fixtures) {
    test(`${fixture.id}: composeLine(...) === the real (bc3aa01) engine's own transcribed line`, () => {
      const composed = composeLine(fixture.shape, fixture.cells, FIXTURE.declaration, fixture.depth);
      assert.equal(composed, fixture.engineLine);
    });
  }
});

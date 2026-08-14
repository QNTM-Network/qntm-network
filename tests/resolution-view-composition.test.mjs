/**
 * DOES A VIEW SHEET'S OWN `composition:` REACH THE BROWSER, AND DOES SILENCE STILL MEAN THE
 * RUNG BELOW?
 *
 *   node --test tests/resolution-view-composition.test.mjs
 *
 * The browser half of the cascade the engine opened in monorepo #111. That PR made
 * `composition:` declarable on a view sheet and resolved it view -> global -> engine literal
 * inside `renderer._resolve_composition`. This file proves the same three rungs on this side,
 * through `compile-resolution.mjs` and back out of `resolutiontable.ts`'s `compositionFor`.
 *
 * WHY THE ENGINE HAD TO GO FIRST, recorded because it is the whole reason this file did not
 * exist a day earlier: `tests/view-key-agreement.test.mjs` refuses a slot for a key no config
 * can contain. Publishing one before the engine admitted `composition:` would have been a
 * branch no loadable config could reach — a green surface over a region no input can get to.
 * See docs/architecture/capabilities.yaml#a-view-may-not-override-what-the-engine-reads-once.
 *
 * PROVED AGAINST `tests/fixtures/config/`, on a `cpSync` scratch copy, the same harness
 * `resolution-declared-composition.test.mjs` uses for the global rung. `presentation.json` is
 * never read and never written by this file.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { generateResolution } from "../scripts/generate-resolution-declaration.mjs";
import { GenerationError, ENGINE_LITERAL_COMPOSITION } from "../scripts/compile-resolution.mjs";
import { readConfigResolutionDeclaration, compositionFor } from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CONFIG = join(HERE, "fixtures", "config");

/** The fixture's one view sheet, and the id it publishes under. */
const VIEW_FILE = "main.yaml";
const VIEW_ID = "main";

// A tail that is NOT the engine literal, differing on cells any line carries — the same
// vacuity trap the engine-side sibling had to be repaired for twice. `stamp` moves from the
// FRONT of the literal tail to the BACK, which is visible on any line that has both a stamp
// and tags.
const DECLARED_TAIL = ["tags", "markers", "chrome", "stamp", "date"];
const DECLARED_HEADS = { checkbox: ["checkbox", "title"], plain_line: ["title"] };

function withScratchFixture(mutate) {
  const scratch = mkdtempSync(join(tmpdir(), "view-composition-"));
  try {
    const configDir = join(scratch, "config");
    cpSync(FIXTURE_CONFIG, configDir, { recursive: true });
    mutate(configDir);
    return generateResolution(configDir);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Re-read the sheet YAML and splice a `composition:` block in at the sheet level. */
function declareOnSheet(configDir, block) {
  const path = join(configDir, "views", VIEW_FILE);
  const text = readFileSync(path, "utf8");
  // The sheet's own keys are indented two spaces under its id; insert before `sections:`.
  const spliced = text.replace(/^  sections:/m, `${block}  sections:`);
  assert.notEqual(spliced, text, "the fixture sheet no longer has a `sections:` key to splice before");
  writeFileSync(path, spliced);
}

const SHEET_BLOCK =
  "  composition:\n" +
  "    heads:\n" +
  "      checkbox: [checkbox, title]\n" +
  "      plain_line: [title]\n" +
  "    tail: [tags, markers, chrome, stamp, date]\n";

describe("1. ABSENCE IS OPT-OUT — the fixture declares no sheet composition", () => {
  const resolution = generateResolution(FIXTURE_CONFIG);

  test("no view appears in viewComposition at all", () => {
    assert.deepEqual(resolution.viewComposition, {});
  });

  test("the global answer is untouched, and still says which rung it is", () => {
    // BYTE-IDENTICAL TO BEFORE THIS RUNG EXISTED. The fixture declares no `global_defaults.yaml`
    // either, so this is the engine literal, reported as such.
    assert.deepEqual(resolution.composition, ENGINE_LITERAL_COMPOSITION);
    assert.equal(resolution.compositionSource, "engine-fallback");
  });
});

describe("2. A SHEET THAT DECLARES ONE WINS, and only for itself", () => {
  const resolution = withScratchFixture((configDir) => declareOnSheet(configDir, SHEET_BLOCK));

  test("the sheet's own tail is published under its view id", () => {
    assert.deepEqual(resolution.viewComposition[VIEW_ID].tail, DECLARED_TAIL);
    assert.deepEqual(resolution.viewComposition[VIEW_ID].heads, DECLARED_HEADS);
  });

  test("the GLOBAL answer is unchanged by a sheet declaration", () => {
    // THE CONTAINMENT ASSERTION. A view rung that silently rewrote the global answer would pass
    // every test above while breaking every view that did not declare one.
    assert.deepEqual(resolution.composition, ENGINE_LITERAL_COMPOSITION);
    assert.equal(resolution.compositionSource, "engine-fallback");
  });

  test("the two rungs genuinely differ — this file is not comparing a thing to itself", () => {
    // THE VACUITY GUARD. The engine-side sibling of this test had to be repaired twice because
    // its two arms composed identical output. See flow-trace architecture.yaml
    // #a-check-whose-arms-agree-measures-nothing.
    assert.notDeepEqual(resolution.viewComposition[VIEW_ID].tail, resolution.composition.tail);
  });
});

describe("3. `form:` CASCADES INDEPENDENTLY — a sheet may reorder cells and inherit the bullet", () => {
  test("a sheet declaring no form: carries formSource engine-fallback", () => {
    const resolution = withScratchFixture((configDir) => declareOnSheet(configDir, SHEET_BLOCK));
    const entry = resolution.viewComposition[VIEW_ID];
    assert.equal(entry.formSource, "engine-fallback");
    assert.equal(entry.bullet, ENGINE_LITERAL_COMPOSITION.bullet);
    assert.deepEqual(entry.titleStyles, ENGINE_LITERAL_COMPOSITION.titleStyles);
  });

  test("a sheet declaring form: carries its own bullet and says so", () => {
    const resolution = withScratchFixture((configDir) =>
      declareOnSheet(configDir, SHEET_BLOCK + "    form:\n      bullet: '*'\n"),
    );
    const entry = resolution.viewComposition[VIEW_ID];
    assert.equal(entry.bullet, "*");
    assert.equal(entry.formSource, "config");
  });
});

describe("4. MALFORMED IS REFUSED, at the view rung as at the global one", () => {
  const cases = [
    ["not a mapping", "  composition: nonsense\n", /is not a mapping/],
    ["unknown top key", SHEET_BLOCK + "    nope: 1\n", /unknown key/],
    [
      "unknown tail cell class",
      "  composition:\n    heads:\n      checkbox: [checkbox, title]\n      plain_line: [title]\n" +
        "    tail: [not_a_cell]\n",
      /unknown cell class/,
    ],
    [
      "heads missing a required shape",
      "  composition:\n    heads:\n      checkbox: [checkbox, title]\n    tail: [tags]\n",
      /missing required shape/,
    ],
  ];

  for (const [label, block, pattern] of cases) {
    test(`${label} is a hard GenerationError naming the sheet`, () => {
      assert.throws(
        () => withScratchFixture((configDir) => declareOnSheet(configDir, block)),
        (error) => {
          assert.ok(error instanceof GenerationError, `expected GenerationError, got ${error}`);
          assert.match(error.message, pattern);
          // THE POINT OF THREADING `where`: the diagnostic must send the operator to the file
          // they edited, not to global_defaults.yaml, which they may not even have.
          assert.match(error.message, /views\/main\.yaml/);
          assert.doesNotMatch(error.message, /global_defaults\.yaml/);
          return true;
        },
      );
    });
  }
});

describe("5. THE READER RESOLVES THE CASCADE, and names the rung that answered", () => {
  const served = (resolution) => readConfigResolutionDeclaration({ resolution }).resolution;

  test("a declaring view resolves to its own composition, source `view`", () => {
    const resolution = withScratchFixture((configDir) => declareOnSheet(configDir, SHEET_BLOCK));
    const answer = compositionFor(served(resolution), VIEW_ID);
    assert.equal(answer.source, "view");
    assert.deepEqual(answer.composition.tail, DECLARED_TAIL);
  });

  test("a view that declared nothing falls through to the rung below, source reported", () => {
    const resolution = withScratchFixture((configDir) => declareOnSheet(configDir, SHEET_BLOCK));
    const answer = compositionFor(served(resolution), "a-view-that-does-not-exist");
    assert.equal(answer.source, "engine-fallback");
    assert.deepEqual(answer.composition, ENGINE_LITERAL_COMPOSITION);
  });

  test("with no rung declaring anything, every view gets the engine literal", () => {
    const answer = compositionFor(served(generateResolution(FIXTURE_CONFIG)), VIEW_ID);
    assert.equal(answer.source, "engine-fallback");
    assert.deepEqual(answer.composition, ENGINE_LITERAL_COMPOSITION);
  });

  test("the resolved answer carries no formSource — that is the entry's, not the composition's", () => {
    // `Composition` and `ViewComposition` are different types on purpose: `formSource` describes
    // the DECLARATION, not the composed line, and a caller composing a line has no use for it.
    const resolution = withScratchFixture((configDir) => declareOnSheet(configDir, SHEET_BLOCK));
    const answer = compositionFor(served(resolution), VIEW_ID);
    assert.equal("formSource" in answer.composition, false);
  });

  test("no table at all resolves to undefined rather than a guess", () => {
    assert.equal(compositionFor(undefined, VIEW_ID), undefined);
  });
});

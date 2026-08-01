/**
 * THE CONFIG-ONLY RESOLUTION TABLE, PUBLISHED AND READ — proof for
 * design-the-resolution-architecture.md step 5.
 *
 *   node --test tests/present-resolution.test.mjs
 *
 * Four claims, four sections, the same shape `tests/present-structural.test.mjs` and
 * `tests/present-qualification.test.mjs` already established for their own axes:
 *
 *   1. THE SHIPPED DECLARATION READS CLEANLY, against `dist/present.js` — the artifact, not the
 *      sources.
 *   2. AN UNRECOGNISED DECLARATION IS REPORTED, NEVER GUESSED — `resolutiontable.ts` is exactly
 *      as strict as the other three readers.
 *   3. THE SERVED VALUE IS WHAT THE MONOREPO'S CONFIG ACTUALLY DECLARES — generated, not
 *      transcribed. Skipped, loudly, when the monorepo is not checked out.
 *   4. THE FALSIFIER — proof standard #3 in the operator's brief: change the config in a SCRATCH
 *      COPY and the published answer follows. Three mutations, one per fact this table adds that
 *      `qualification.ts` does not already carry: reorder a section's `ordering:`, add an
 *      `ordering_mode:` to a section that had none, and clear `day_start_hour` to a different
 *      value. If the answer did not follow, the app would be holding a copy of the config rather
 *      than reading a declaration generated from it.
 *
 *   5. THE SIZE ASSERTION — proof standard #4: the whole `resolution` key stays in the
 *      neighbourhood `research-the-resolution-universe.md` §6.1 measured for the config-only
 *      table (per-view median 685 B, 454-1,930 B), so a future widening (say, adding
 *      `pull_context`'s 77 sections) is a visible size jump in this test, not a silent one.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readConfigResolutionDeclaration, readDeclaration, presentationFromDeclaration } from "../dist/present.js";
import {
  generateResolution,
  DEFAULT_CONFIG_DIR,
} from "../scripts/generate-resolution-declaration.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVED = JSON.parse(readFileSync(resolve(HERE, "..", "presentation.json"), "utf8"));

describe("1. the shipped declaration reads cleanly", () => {
  test("`resolution` parses with no problems reported", () => {
    const { resolution, problems } = readConfigResolutionDeclaration(SERVED);
    assert.deepEqual(problems, [], "the served resolution declaration reported problems");
    assert.ok(resolution.registration, "no registration table was published");
    assert.equal(resolution.registration.defaultNodeType, "task");
    assert.equal(resolution.registration.baseNodeType, "task");
    assert.equal(resolution.registration.inputGrammar, "tolerant");
    assert.deepEqual(resolution.registration.defaultTags, []);
  });

  test("`declaration.ts` does not report it as an unknown key", () => {
    const { problems } = readDeclaration(SERVED);
    assert.deepEqual(problems, [], "the rendition reader objected to the served document");
  });

  test("two line grammars, and 'tolerant' admits exactly the three shapes measured", () => {
    const { resolution } = readConfigResolutionDeclaration(SERVED);
    assert.deepEqual(Object.keys(resolution.lineGrammars).sort(), ["checkbox_only", "tolerant"]);
    assert.deepEqual(resolution.lineGrammars.tolerant, ["blank_line", "fenced_code", "heading"]);
    assert.deepEqual(resolution.lineGrammars.checkbox_only, []);
  });

  test("nine ordering sections, across the six views measured", () => {
    const { resolution } = readConfigResolutionDeclaration(SERVED);
    const count = Object.values(resolution.ordering).reduce((n, s) => n + Object.keys(s).length, 0);
    assert.equal(count, 9);
    assert.deepEqual(resolution.ordering["this-week"]["overdue"].ordering, [
      { field: "due_date", direction: "asc" },
    ]);
    assert.equal(resolution.ordering["daily-work"]["capture"].orderingMode, "insertion_order");
  });

  test("the day boundary — 04:00, Europe/London, week starts Monday", () => {
    const { resolution } = readConfigResolutionDeclaration(SERVED);
    assert.deepEqual(resolution.dayBoundary, {
      timezone: "Europe/London",
      dayStartHour: 4,
      weekStartsOn: "monday",
    });
  });

  test("chromeShapes (step 6) — the operator's trap case, and the common case", () => {
    const { resolution } = readConfigResolutionDeclaration(SERVED);
    // person and group are the two published views that resolve to a non-checkbox default —
    // measured directly against schema.yaml; see newline.ts's own header for why this pair matters.
    assert.equal(resolution.chromeShapes.person, "plain_line");
    assert.equal(resolution.chromeShapes.group, "plain_line");
    assert.equal(resolution.chromeShapes.task, "checkbox");
    // stat_line and heading shapes are never published — newline.ts does not know how to seed them.
    for (const shape of Object.values(resolution.chromeShapes)) {
      assert.ok(["checkbox", "plain_line"].includes(shape), `unexpected published shape '${shape}'`);
    }
  });
});

describe("1a. wired into the app's one reader (presentationFromDeclaration)", () => {
  test("DeclaredPresentation carries the resolution axis, with no reported problem", () => {
    const declared = presentationFromDeclaration(SERVED);
    assert.equal(declared.resolution.registration.baseNodeType, "task");
    assert.deepEqual(declared.problems, [], "wiring resolution in introduced a reported problem");
  });

  test("a document with no resolution key at all still wires cleanly — silence, not a crash", () => {
    const declared = presentationFromDeclaration({ checkbox: "wired" });
    assert.equal(declared.resolution.registration, undefined);
    assert.deepEqual(declared.resolution.ordering, {});
  });
});

describe("2. a malformed declaration is reported, never guessed", () => {
  const read = (resolution) => readConfigResolutionDeclaration({ resolution });

  test("no `resolution` key at all is silence, not a problem", () => {
    const { resolution, problems } = readConfigResolutionDeclaration({ checkbox: "wired" });
    assert.deepEqual(problems, []);
    assert.equal(resolution.registration, undefined);
  });

  test("an unrecognised top-level key is reported and NOT applied", () => {
    const { problems } = read({ registration: {}, pullContext: {} });
    assert.ok(problems.some((p) => p.includes("pullContext")), problems.join("\n"));
  });

  test("registration.baseNodeType conflated away is reported, and the whole table drops", () => {
    const { resolution, problems } = read({
      registration: { defaultNodeType: "task", inputGrammar: "tolerant", defaultTags: [] },
    });
    assert.ok(problems.some((p) => p.includes("baseNodeType")), problems.join("\n"));
    assert.equal(resolution.registration, undefined);
  });

  test("an ordering direction outside asc/desc is reported and that key drops", () => {
    const { resolution, problems } = read({
      ordering: { v: { s: { ordering: [{ field: "due_date", direction: "sideways" }] } } },
    });
    assert.ok(problems.some((p) => p.includes("direction")), problems.join("\n"));
    assert.deepEqual(resolution.ordering, {});
  });

  test("dayStartHour outside 0..23 is reported and the day boundary drops", () => {
    const { resolution, problems } = read({
      dayBoundary: { timezone: "Europe/London", dayStartHour: 24, weekStartsOn: "monday" },
    });
    assert.ok(problems.some((p) => p.includes("dayStartHour")), problems.join("\n"));
    assert.equal(resolution.dayBoundary, undefined);
  });

  test("a `resolution` key of the wrong shape blinds the reader loudly, not silently", () => {
    const { resolution, problems } = readConfigResolutionDeclaration({ resolution: [] });
    assert.equal(problems.length, 1);
    assert.equal(resolution.registration, undefined);
  });

  test("chromeShapes: an unrecognised shape is reported and that node type drops", () => {
    const { resolution, problems } = read({
      chromeShapes: { task: "checkbox", widget: "stat_line" },
    });
    assert.deepEqual(resolution.chromeShapes, { task: "checkbox" });
    assert.ok(problems.some((p) => p.includes("chromeShapes.widget")), problems.join("\n"));
  });

  test("chromeShapes of the wrong shape blinds the reader loudly; other keys survive", () => {
    const { resolution, problems } = read({
      chromeShapes: "not-an-object",
      dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
    });
    assert.deepEqual(resolution.chromeShapes, {});
    assert.equal(resolution.dayBoundary.timezone, "Europe/London", "one bad key blinded the reader to a good one");
    assert.ok(problems.some((p) => p.includes("chromeShapes")), problems.join("\n"));
  });

  test("one view's malformed ordering is reported and dropped; another view's survives", () => {
    const { resolution, problems } = read({
      ordering: {
        good: { s: { orderingMode: "insertion_order" } },
        bad: { s: { ordering: "not-a-list" } },
      },
    });
    assert.deepEqual(resolution.ordering.good, { s: { ordering: undefined, orderingMode: "insertion_order" } });
    assert.equal(resolution.ordering.bad, undefined);
    assert.ok(problems.some((p) => p.includes("ordering.bad")), problems.join("\n"));
  });
});

const monorepo = existsSync(DEFAULT_CONFIG_DIR);
const skip = monorepo ? false : `monorepo not checked out at ${DEFAULT_CONFIG_DIR}`;

describe("3. the served value is what the monorepo's config actually declares", () => {
  test("generating from the monorepo's YAML reproduces presentation.json's resolution key", { skip }, () => {
    assert.deepEqual(
      SERVED.resolution,
      generateResolution(DEFAULT_CONFIG_DIR),
      "presentation.json's 'resolution' key is STALE — run " +
        "'node scripts/generate-resolution-declaration.mjs' and commit the result",
    );
  });
});

describe("4. the falsifier: the app's answer follows the config, because it reads it", () => {
  const withMutatedConfig = (mutate) => {
    const scratch = mkdtempSync(join(tmpdir(), "resolution-falsifier-"));
    try {
      const configDir = join(scratch, "config");
      cpSync(DEFAULT_CONFIG_DIR, configDir, { recursive: true });
      mutate(configDir);
      return generateResolution(configDir);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  };

  test("BASELINE: this-week's overdue section sorts due_date ascending", { skip }, () => {
    const resolution = generateResolution(DEFAULT_CONFIG_DIR);
    assert.deepEqual(resolution.ordering["this-week"]["overdue"].ordering, [
      { field: "due_date", direction: "asc" },
    ]);
  });

  test("MUTATE THE DIRECTION: flip overdue's sort to descending, and the answer follows", { skip }, () => {
    const resolution = withMutatedConfig((configDir) => {
      const path = join(configDir, "views", "this-week.yaml");
      const original = readFileSync(path, "utf8");
      // The FIRST 'direction: asc' in the file is 'overdue's own — its section starts the list.
      const mutated = original.replace("direction: asc", "direction: desc");
      assert.notEqual(mutated, original, "the falsifier's own edit did not apply");
      writeFileSync(path, mutated);
    });
    assert.deepEqual(resolution.ordering["this-week"]["overdue"].ordering, [
      { field: "due_date", direction: "desc" },
    ]);
  });

  test("MUTATE THE DAY BOUNDARY: change day_start_hour, and the published value follows", { skip }, () => {
    const resolution = withMutatedConfig((configDir) => {
      const path = join(configDir, "day_boundary.yaml");
      const mutated = readFileSync(path, "utf8").replace("day_start_hour: 4", "day_start_hour: 6");
      assert.ok(mutated.includes("day_start_hour: 6"), "the falsifier's own edit did not apply");
      writeFileSync(path, mutated);
    });
    assert.equal(resolution.dayBoundary.dayStartHour, 6);
    // Nothing else moved — only the mutated key changed between the baseline run and this one.
    assert.equal(resolution.dayBoundary.timezone, "Europe/London");
  });

  test("MUTATE AN ORDERING_MODE: give due-today an insertion_order it did not have", { skip }, () => {
    const before = generateResolution(DEFAULT_CONFIG_DIR);
    assert.equal(before.ordering["daily-work"]?.["due-today"], undefined);
    const resolution = withMutatedConfig((configDir) => {
      const path = join(configDir, "views", "daily-work.yaml");
      const original = readFileSync(path, "utf8");
      const mutated = original.replace(
        "- id: due-today",
        "- id: due-today\n      ordering_mode: insertion_order",
      );
      assert.notEqual(mutated, original, "the falsifier's own edit did not apply");
      writeFileSync(path, mutated);
    });
    assert.equal(resolution.ordering["daily-work"]["due-today"].orderingMode, "insertion_order");
  });

  test("MUTATE A RENDER SHAPE: flip person from plain_line to checkbox, and chromeShapes follows", { skip }, () => {
    // Step 6's own falsifier proof standard #4: change the DECLARED node type in schema.yaml and
    // the published seed follows. `person`'s render block is not the only 'shape: plain_line' in
    // the file (`mandate`, `phase` and others declare one too), so the anchor is the sequence that
    // is unique to `person`: its own 'shape: plain_line' immediately followed by the NEXT type's
    // header, '  group:' — verified unique in the file before trusting the replace.
    const before = generateResolution(DEFAULT_CONFIG_DIR);
    assert.equal(before.chromeShapes.person, "plain_line");
    const resolution = withMutatedConfig((configDir) => {
      const path = join(configDir, "schema.yaml");
      const original = readFileSync(path, "utf8");
      const needle = "shape: plain_line\n  group:";
      assert.equal(
        original.split(needle).length - 1,
        1,
        "the anchor this falsifier depends on is no longer unique in schema.yaml",
      );
      const mutated = original.replace(needle, "shape: checkbox\n  group:");
      assert.notEqual(mutated, original, "the falsifier's own edit did not apply");
      writeFileSync(path, mutated);
    });
    assert.equal(resolution.chromeShapes.person, "checkbox", "the published shape did not follow the mutation");
    // group's own render block is untouched — only person's, immediately before it, moved.
    assert.equal(resolution.chromeShapes.group, "plain_line", "an unrelated node type's shape moved too");
  });

  test("MUTATE A CANDIDATE OUT OF EXISTENCE: remove person's render: block, and it still publishes checkbox", { skip }, () => {
    // The engine's own default for an UNDECLARED render block is checkbox (schema.yaml's own
    // comment, mirrored by `node_type_form.py`) — proving the generator follows that default too,
    // not just the declared-shape branch the mutation above already covers.
    const resolution = withMutatedConfig((configDir) => {
      const path = join(configDir, "schema.yaml");
      const original = readFileSync(path, "utf8");
      const needle = "    render:\n      shape: plain_line\n  group:";
      assert.equal(
        original.split(needle).length - 1,
        1,
        "the anchor this falsifier depends on is no longer unique in schema.yaml",
      );
      const mutated = original.replace(needle, "  group:");
      assert.notEqual(mutated, original, "the falsifier's own edit did not apply");
      writeFileSync(path, mutated);
    });
    assert.equal(resolution.chromeShapes.person, "checkbox", "an undeclared render block did not default to checkbox");
  });
});

describe("5. the size assertion — a future widening is visible, not silent", () => {
  test("the whole 'resolution' key stays under 3,000 bytes", () => {
    const bytes = JSON.stringify(SERVED.resolution).length;
    // Measured 2026-08-01 at step 5: 994 bytes (registration 4 fields, 2 line grammars, 9
    // ordering sections, 3 day-boundary keys). Step 6 added `chromeShapes` (11 node-type
    // candidates, checkbox/plain_line only) and measured 1,330 bytes whole-table.
    // research-the-resolution-universe.md §6.1's per-view slice for the FULL eight-kind table
    // (which this is a deliberate subset of — defaults and the per-view minting default already
    // live on `qualification`) runs 454-1,930 B median 685 B PER VIEW; this whole-instance table
    // at under 3,000 B total is comfortably inside that neighbourhood rather than an order of
    // magnitude off it either way.
    assert.ok(bytes > 200, `'resolution' is suspiciously small (${bytes} B) — a measurement of ` +
      "near-zero should be treated as broken until a positive control passes");
    assert.ok(bytes < 3000, `'resolution' grew to ${bytes} B — a kind was added; update this ` +
      "ceiling deliberately rather than let it float");
  });
});

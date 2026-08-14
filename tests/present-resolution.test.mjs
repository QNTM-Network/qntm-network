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
import { parseYamlSubset } from "../scripts/yaml-subset.mjs";
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

  test("fifteen ordering sections, across the six views measured", () => {
    // RESTATED 2026-08-03: nine -> fifteen, when `presentation.json` was regenerated from monorepo
    // `d4c9d98`. The six added sections are all `this-week`'s, from `a901fe8` (relative three-day
    // window): due-yesterday, available-yesterday, due-today, available-today, due-tomorrow,
    // available-tomorrow. The VIEW count is still six — no view gained or lost an ordering table.
    const { resolution } = readConfigResolutionDeclaration(SERVED);
    const count = Object.values(resolution.ordering).reduce((n, s) => n + Object.keys(s).length, 0);
    assert.equal(count, 15);
    assert.equal(Object.keys(resolution.ordering).length, 6, "a view gained or lost an ordering table");
    assert.deepEqual(resolution.ordering["this-week"]["overdue"].ordering, [
      { field: "due_date", direction: "asc" },
    ]);
    assert.equal(resolution.ordering["daily-work"]["capture"].orderingMode, "insertion_order");
  });

  test("step 7 — every ordering section carries the operator's own name for it", () => {
    const { resolution } = readConfigResolutionDeclaration(SERVED);
    assert.equal(resolution.ordering["this-week"]["overdue"].name, "Overdue");
    assert.equal(resolution.ordering["this-week"]["due-this-week"].name, "Due This Week");
    assert.equal(resolution.ordering["flowtrace-queue"]["queue"].name, "Queue");
    assert.equal(resolution.ordering["daily-work"]["capture"].name, "Work Capture");
    // None of these 9 sections is published in qualification.sections (measured 2026-08-01: all 9
    // traverse an edge, consult the clock, or range over a field the app cannot resolve) — proving
    // `name` really could not have been joined from there, which is why it rides here instead.
  });

  test("step 7 — DID NOT NEED THE DAY BOUNDARY: none of the 9 orderings is clock-bound", () => {
    // THE MEASUREMENT THAT DECIDES WHETHER STEP 7 NEEDS STEP 8. Every `ordering.field` is an
    // ABSOLUTE value (a literal date or an externally-stamped rank), compared field-to-field, never
    // against "today" — so sorting an already-placed row needs no clock. A positive control first
    // (queue_position genuinely is one of the fields) so a result of "zero clock-bound orderings"
    // cannot be an artefact of an extractor that finds nothing.
    const { resolution } = readConfigResolutionDeclaration(SERVED);
    const fields = new Set();
    for (const sections of Object.values(resolution.ordering)) {
      for (const section of Object.values(sections)) {
        for (const key of section.ordering ?? []) fields.add(key.field);
      }
    }
    assert.ok(fields.has("queue_position"), "positive control failed — the extractor found nothing");
    for (const field of fields) {
      assert.ok(
        !/cycle|today|now/i.test(field),
        `'${field}' looks clock-relative — step 8 really is a dependency after all`,
      );
    }
  });

  test("step 7 — orderingFields publishes a marker for the 3 fields the 15 orderings use, PLUS priority", () => {
    // RESTATED 2026-08-04, `roadmap-the-road-ahead.md`'s "the engine's own default ordering, made
    // explicit" step: 3 -> 4. `priority` is named by NO declared section's own `ordering:` —
    // it is named by `defaultOrdering` (below), unconditionally, for every config, which is why
    // its marker is looked up even though nothing in `resolution.ordering` itself mentions it.
    const { resolution } = readConfigResolutionDeclaration(SERVED);
    assert.deepEqual(Object.keys(resolution.orderingFields).sort(), [
      "available_date",
      "due_date",
      "priority",
      "queue_position",
    ]);
    assert.deepEqual(resolution.orderingFields.due_date, { token: "📅", kind: "date" });
    assert.deepEqual(resolution.orderingFields.available_date, { token: "🛫", kind: "date" });
    assert.deepEqual(resolution.orderingFields.queue_position, { token: "🔢", kind: "int" });
    // priority's TWO tokens (🔽=low, ⏫=high) — the enum shape, never a single glyph.
    assert.deepEqual(resolution.orderingFields.priority, {
      kind: "enum",
      values: { "🔽": "low", "⏫": "high" },
    });
  });

  test("THE DEFAULT ORDERING — defaultOrdering/priorityRank are published, always, for every config", () => {
    // 2026-08-06 ("the default ordering is declared"): defaultOrdering/priorityRank are now a
    // DECLARED value (`global_defaults.yaml`'s own `default_ordering:`/`priority_rank:`), not a
    // hardcoded literal — see `compile-resolution.mjs`'s own header, "THE DEFAULT ORDERING". The
    // operator's own real config declares neither key yet, so this ships the engine's fallback
    // tuple (`section_builder.py:26-37`'s `_DEFAULT_ORDERING`/`_PRIORITY_RANK`, verbatim) — pinned
    // against a LIVE import of the engine's own tuple by
    // `tests/resolution-default-ordering-agreement.test.mjs`; this test only proves it SHIPPED,
    // and that the fallback is a NAMED, visible fact (`defaultOrderingSource`), not a silent one.
    // `tests/resolution-declared-default-ordering.test.mjs` proves the CONFIG-DECLARED path, over
    // fields that are not due_date/priority/title, against a fixture — the "another user" case.
    const { resolution } = readConfigResolutionDeclaration(SERVED);
    assert.deepEqual(resolution.defaultOrdering, [
      { field: "due_date", direction: "asc" },
      { field: "priority", direction: "desc" },
      { field: "title", direction: "asc" },
    ]);
    assert.equal(resolution.defaultOrderingSource, "engine-fallback");
    assert.deepEqual(resolution.priorityRank, { urgent: 4, high: 3, normal: 2, medium: 2, low: 1 });
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
    // `undefined`, not an empty table. There is no empty table any more: a resolution without a
    // day boundary is not a lesser table, it is one no reader may hold. See section 2a.
    assert.equal(declared.resolution, undefined);
    assert.deepEqual(declared.problems, [], "silence must stay silent — this is not a problem");
  });
});

describe("2. a malformed declaration is reported, never guessed", () => {
  /**
   * A VALID DAY BOUNDARY RIDES ON EVERY FIXTURE BELOW, and none of these tests is about the clock.
   *
   * The reader now refuses to produce a table at all without one (section 2a proves that
   * directly), so a fixture that omitted it would make every assertion here fail for the same
   * uninteresting reason instead of testing the key it names. A test that wants the boundary
   * ABSENT passes `dayBoundary: undefined` explicitly and says so.
   */
  const DAY_BOUNDARY = { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" };
  const read = (resolution) =>
    readConfigResolutionDeclaration({ resolution: { dayBoundary: DAY_BOUNDARY, ...resolution } });

  test("no `resolution` key at all is silence, not a problem", () => {
    const { resolution, problems } = readConfigResolutionDeclaration({ checkbox: "wired" });
    assert.deepEqual(problems, []);
    assert.equal(resolution, undefined);
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

  test("dayStartHour outside 0..23 is reported and the WHOLE TABLE drops, not just the boundary", () => {
    const { resolution, problems } = read({
      dayBoundary: { timezone: "Europe/London", dayStartHour: 24, weekStartsOn: "monday" },
    });
    assert.ok(problems.some((p) => p.includes("dayStartHour")), problems.join("\n"));
    // The boundary is the ONE key that takes the table down with it — see section 2a.
    assert.equal(resolution, undefined);
  });

  test("a `resolution` key of the wrong shape blinds the reader loudly, not silently", () => {
    const { resolution, problems } = readConfigResolutionDeclaration({ resolution: [] });
    assert.equal(problems.length, 1);
    assert.equal(resolution, undefined);
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

  test("orderingFields: an unrecognised kind is reported and that field drops", () => {
    const { resolution, problems } = read({
      orderingFields: { due_date: { token: "📅", kind: "date" }, weird: { token: "❓", kind: "duration" } },
    });
    assert.deepEqual(resolution.orderingFields, { due_date: { token: "📅", kind: "date" } });
    assert.ok(problems.some((p) => p.includes("orderingFields.weird")), problems.join("\n"));
  });

  test("orderingFields of the wrong shape blinds the reader loudly; other keys survive", () => {
    const { resolution, problems } = read({
      orderingFields: "not-an-object",
      dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
    });
    assert.deepEqual(resolution.orderingFields, {});
    assert.equal(resolution.dayBoundary.timezone, "Europe/London", "one bad key blinded the reader to a good one");
    assert.ok(problems.some((p) => p.includes("orderingFields")), problems.join("\n"));
  });

  test("orderingFields: an enum marker reads cleanly, and rejects an empty/missing `values`", () => {
    const { resolution, problems } = read({
      orderingFields: {
        priority: { kind: "enum", values: { "🔽": "low", "⏫": "high" } },
        broken: { kind: "enum", values: {} },
      },
    });
    assert.deepEqual(resolution.orderingFields.priority, {
      kind: "enum",
      values: { "🔽": "low", "⏫": "high" },
    });
    assert.equal(resolution.orderingFields.broken, undefined);
    assert.ok(problems.some((p) => p.includes("orderingFields.broken.values")), problems.join("\n"));
  });

  test("orderingFields: an enum marker with an unrecognised key (e.g. a stray 'token') is reported", () => {
    const { problems } = read({
      orderingFields: { priority: { kind: "enum", values: { "🔽": "low" }, token: "🔽" } },
    });
    assert.ok(problems.some((p) => p.includes("orderingFields.priority.token")), problems.join("\n"));
  });

  test("defaultOrdering: an empty array is reported — the engine default stays unknown, never fabricated", () => {
    const { resolution, problems } = read({ defaultOrdering: [] });
    assert.deepEqual(resolution.defaultOrdering, []);
    assert.ok(problems.some((p) => p.includes("defaultOrdering")), problems.join("\n"));
  });

  test("defaultOrdering: one malformed entry drops the WHOLE list — an engine fact is all-or-nothing", () => {
    const { resolution, problems } = read({
      defaultOrdering: [{ field: "due_date", direction: "asc" }, { field: "priority", direction: "sideways" }],
    });
    assert.deepEqual(resolution.defaultOrdering, []);
    assert.ok(problems.some((p) => p.includes("defaultOrdering[1].direction")), problems.join("\n"));
  });

  test("defaultOrderingSource: 'config' and 'engine-fallback' both read cleanly; anything else is reported", () => {
    assert.equal(read({ defaultOrderingSource: "config" }).resolution.defaultOrderingSource, "config");
    assert.equal(
      read({ defaultOrderingSource: "engine-fallback" }).resolution.defaultOrderingSource,
      "engine-fallback",
    );
    const { resolution, problems } = read({ defaultOrderingSource: "made-up" });
    assert.equal(resolution.defaultOrderingSource, undefined);
    assert.ok(problems.some((p) => p.includes("defaultOrderingSource")), problems.join("\n"));
  });

  test("defaultOrderingSource: absent is silence, not a problem — an older declaration has no opinion", () => {
    const { resolution, problems } = read({});
    assert.equal(resolution.defaultOrderingSource, undefined);
    assert.deepEqual(problems, []);
  });

  test("compositionSource: 'config' and 'engine-fallback' both read cleanly; anything else is reported", () => {
    assert.equal(read({ compositionSource: "config" }).resolution.compositionSource, "config");
    assert.equal(
      read({ compositionSource: "engine-fallback" }).resolution.compositionSource,
      "engine-fallback",
    );
    const { resolution, problems } = read({ compositionSource: "made-up" });
    assert.equal(resolution.compositionSource, undefined);
    assert.ok(problems.some((p) => p.includes("compositionSource")), problems.join("\n"));
  });

  test("compositionSource: absent is silence, not a problem — an older declaration has no opinion", () => {
    const { resolution, problems } = read({});
    assert.equal(resolution.compositionSource, undefined);
    assert.deepEqual(problems, []);
  });

  test("priorityRank: a non-integer or non-positive rank is reported and the whole map drops", () => {
    const { resolution, problems } = read({ priorityRank: { urgent: 4, low: 0 } });
    assert.deepEqual(resolution.priorityRank, {});
    assert.ok(problems.some((p) => p.includes("priorityRank.low")), problems.join("\n"));
  });

  test("a section's `name` that is an empty string is reported and the whole section drops", () => {
    const { resolution, problems } = read({
      ordering: { v: { s: { orderingMode: "insertion_order", name: "" } } },
    });
    assert.equal(resolution.ordering.v, undefined);
    assert.ok(problems.some((p) => p.includes("v.s.name")), problems.join("\n"));
  });

  test("one view's malformed ordering is reported and dropped; another view's survives", () => {
    const { resolution, problems } = read({
      ordering: {
        good: { s: { orderingMode: "insertion_order" } },
        bad: { s: { ordering: "not-a-list" } },
      },
    });
    assert.deepEqual(resolution.ordering.good, {
      s: { ordering: undefined, orderingMode: "insertion_order", name: undefined },
    });
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
      // THE FALSIFIER AIMS AT `overdue` BY NAME, NOT BY POSITION. It used to take the FIRST
      // 'direction: asc' in the file, on the stated ground that "its section starts the list".
      // The monorepo's `a901fe8` (add relative three-day window) put six day-relative sections
      // AHEAD of `overdue`, so that first match became `due-yesterday`'s. The edit then landed on
      // a section this test says nothing about, `overdue` stayed `asc`, and a working generator
      // was reported as broken. A falsifier that can lose its aim when a section is inserted
      // above it is not a falsifier, so the aim is now taken from the section id.
      const startsAt = original.indexOf("- id: overdue");
      assert.notEqual(startsAt, -1, "the falsifier can no longer find overdue's own section");
      const mutated =
        original.slice(0, startsAt) +
        original.slice(startsAt).replace("direction: asc", "direction: desc");
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

  test("MUTATE A MARKER TOKEN: change queue_position's glyph in markers.yaml, and orderingFields follows", { skip }, () => {
    const before = generateResolution(DEFAULT_CONFIG_DIR);
    assert.equal(before.orderingFields.queue_position.token, "🔢");
    const resolution = withMutatedConfig((configDir) => {
      const path = join(configDir, "vocabulary", "markers.yaml");
      const original = readFileSync(path, "utf8");
      const needle = '{ token: "🔢", field: queue_position, extraction_hint: trailing_int }';
      assert.equal(original.split(needle).length - 1, 1, "the anchor this falsifier depends on moved");
      const mutated = original.replace(needle, needle.replace("🔢", "🔟"));
      assert.notEqual(mutated, original, "the falsifier's own edit did not apply");
      writeFileSync(path, mutated);
    });
    assert.equal(resolution.orderingFields.queue_position.token, "🔟", "the published token did not follow the mutation");
    // due_date's own marker is untouched — only queue_position's glyph moved.
    assert.equal(resolution.orderingFields.due_date.token, "📅");
  });

  test("MUTATE AN ENUM MARKER'S TOKEN: change priority's low glyph, and orderingFields.priority follows", { skip }, () => {
    const before = generateResolution(DEFAULT_CONFIG_DIR);
    assert.deepEqual(before.orderingFields.priority, { kind: "enum", values: { "🔽": "low", "⏫": "high" } });
    const resolution = withMutatedConfig((configDir) => {
      const path = join(configDir, "vocabulary", "markers.yaml");
      const original = readFileSync(path, "utf8");
      const needle = '{ token: "🔽", field: priority,       value: low                     }';
      assert.equal(original.split(needle).length - 1, 1, "the anchor this falsifier depends on moved");
      const mutated = original.replace(needle, needle.replace("🔽", "⬇️"));
      assert.notEqual(mutated, original, "the falsifier's own edit did not apply");
      writeFileSync(path, mutated);
    });
    assert.deepEqual(
      resolution.orderingFields.priority,
      { kind: "enum", values: { "⬇️": "low", "⏫": "high" } },
      "the published enum's token did not follow the mutation",
    );
    // high's own token is untouched — only low's glyph moved. The RANK TABLE
    // (`priorityRank`/`ENGINE_PRIORITY_RANK`) is an ENGINE fact, not a config one, so it does not
    // move with this — see tests/resolution-default-ordering-agreement.test.mjs.
    assert.deepEqual(resolution.priorityRank, { urgent: 4, high: 3, normal: 2, medium: 2, low: 1 });
  });

  test("MUTATE A MARKER OUT OF EXTRACTABILITY: turn queue_position render_only, and it stops publishing", { skip }, () => {
    // Mirrors markers.yaml's own comment for done_task_count/par: a render_only marker's value is
    // NEVER ingested from that glyph, so a table that kept publishing it would tell the operator an
    // edit moves a row by a field the engine itself refuses to read back.
    const resolution = withMutatedConfig((configDir) => {
      const path = join(configDir, "vocabulary", "markers.yaml");
      const original = readFileSync(path, "utf8");
      const needle = '{ token: "🔢", field: queue_position, extraction_hint: trailing_int }';
      assert.equal(original.split(needle).length - 1, 1, "the anchor this falsifier depends on moved");
      const mutated = original.replace(needle, needle.replace(" }", ", render_only: true }"));
      assert.notEqual(mutated, original, "the falsifier's own edit did not apply");
      writeFileSync(path, mutated);
    });
    assert.equal(resolution.orderingFields.queue_position, undefined, "a render_only marker still published");
  });

  test("MUTATE THE DEFAULT ORDERING: declare global_defaults.yaml's default_ordering, and defaultOrdering/defaultOrderingSource follow", { skip }, () => {
    const before = generateResolution(DEFAULT_CONFIG_DIR);
    assert.equal(before.defaultOrderingSource, "engine-fallback", "the operator's real config already declares one");
    const resolution = withMutatedConfig((configDir) => {
      const path = join(configDir, "global_defaults.yaml");
      const original = readFileSync(path, "utf8");
      assert.ok(original.includes("defaults: {}"), "the falsifier's own anchor is no longer in global_defaults.yaml");
      const mutated =
        original +
        "\ndefault_ordering:\n  - { field: available_date, direction: desc }\npriority_rank:\n  urgent: 9\n";
      writeFileSync(path, mutated);
    });
    assert.deepEqual(resolution.defaultOrdering, [{ field: "available_date", direction: "desc" }]);
    assert.equal(resolution.defaultOrderingSource, "config");
    assert.deepEqual(resolution.priorityRank, { urgent: 9 });
    // due_date's marker is untouched — only the GLOBAL default's own field changed.
    assert.deepEqual(resolution.orderingFields.available_date, { token: "🛫", kind: "date" });
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
  test("the whole 'resolution' key stays under 50,000 bytes", () => {
    const bytes = JSON.stringify(SERVED.resolution).length;
    // THE CEILING MOVED, DELIBERATELY, ONCE — rungs 1 and 2 (design-the-rule-mirror.md) added
    // `sectionRegistration`, which is the first entry in this table that carries a row PER SECTION
    // rather than per node type or per declared key: 186 sections against the 9 that declare an
    // ordering. Measured 2026-08-01 at 42,508 B whole-table, of which `sectionRegistration` is
    // 40,776 B. That is the SAME order as `qualification` (23,872 B) and 5 % of the 805 KB of
    // graph already on the wire, which is the comparison §9.6 of the design document makes when
    // it says "the payload objection to a fourth grammar is not an objection". The ceiling below
    // is set so a SECOND per-section kind is still visible rather than absorbed.
    // Measured 2026-08-01 at step 5: 994 bytes (registration 4 fields, 2 line grammars, 9
    // ordering sections, 3 day-boundary keys). Step 6 added `chromeShapes` (11 node-type
    // candidates, checkbox/plain_line only) and measured 1,330 bytes whole-table. Step 7 added
    // each ordering section's `name` and the 3-entry `orderingFields` marker table, measured
    // 1,732 bytes whole-table.
    // research-the-resolution-universe.md §6.1's per-view slice for the FULL eight-kind table
    // (which this is a deliberate subset of — defaults and the per-view minting default already
    // live on `qualification`) runs 454-1,930 B median 685 B PER VIEW; this whole-instance table
    // at under 3,000 B total is comfortably inside that neighbourhood rather than an order of
    // magnitude off it either way.
    assert.ok(bytes > 200, `'resolution' is suspiciously small (${bytes} B) — a measurement of ` +
      "near-zero should be treated as broken until a positive control passes");
    assert.ok(bytes < 50000, `'resolution' grew to ${bytes} B — a kind was added; update this ` +
      "ceiling deliberately rather than let it float");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 8. THE OUTPUT HALF — the three facts a composer needs, generator through reader
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// ── WHY THIS SECTION COMPILES THE FIXTURE AND NOT THE OPERATOR'S CONFIG ──
//
// Every other section above reads `SERVED` — the committed `presentation.json`. These keys are NOT
// in it, deliberately: regenerating that file against today's monorepo config also carries ~20
// unrelated drops and turns 19 seeding tests red (measured; see this branch's own PR). So the
// generator ships first and the regeneration is its own decision.
//
// That makes `SERVED` the wrong subject here and the FIXTURE the right one. It is committed, so
// this runs on every pull request with no monorepo — the same reason `declaration-drop.test.mjs`
// uses it — and it exercises the real generator through the real reader, which is the join that
// would otherwise be proven by nothing until someone regenerates.

describe("8. the output half — chromeShapes, the form's own source, and the spelling table", () => {
  const FIXTURE = resolve(HERE, "fixtures", "config");
  const compiled = generateResolution(FIXTURE);
  // THROUGH THE REAL READER, not asserted on the generator's raw output. A key the generator
  // publishes and the reader rejects is worse than one it never published: the app would report a
  // problem on the operator's console for a table that is perfectly well formed.
  const { resolution, problems } = readConfigResolutionDeclaration({ resolution: compiled });

  test("the reader accepts every key the generator now publishes, with no problem reported", () => {
    assert.deepEqual(problems, [], "the reader objected to the generator's own output");
  });

  test("chromeShapes covers a type NO view mints — the whole point of the widening", () => {
    // `person` is minted by a view; the widening is not visible through it. The fixture's `header`
    // is declared and minted by nothing, and it is `heading`-shaped, so it must be DROPPED with a
    // reason rather than silently absent — absence is what this change exists to remove.
    assert.equal(resolution.chromeShapes.task, "checkbox");
    assert.equal(resolution.chromeShapes.person, "plain_line");
    assert.equal(resolution.chromeShapes.header, undefined, "a heading-shaped type must not be published");
    assert.match(
      compiled.dropped["node type 'header'"] ?? "",
      /knows how to draw/,
      "an undrawable declared type must be named in the ledger, not merely missing",
    );
  });

  test("the form carries its OWN source, because one flag cannot speak for both halves", () => {
    // The fixture declares no `global_defaults.yaml` at all, so both read `engine-fallback` and
    // they agree. The value of the second flag is in the state below, which no config has reached.
    assert.equal(resolution.compositionSource, "engine-fallback");
    assert.equal(resolution.compositionFormSource, "engine-fallback");
  });

  test("A DECLARED `composition:` WITH NO `form:` — the case one flag would get wrong", () => {
    // THE FALSIFIER FOR THE KEY ABOVE. Declare `heads`/`tail` and no `form:`, and `compositionSource`
    // becomes "config" over a bullet and a title wrap the config never mentioned. Without the second
    // flag a reader is told the operator declared them; he did not.
    const scratch = mkdtempSync(join(tmpdir(), "composition-form-source-"));
    try {
      const configDir = join(scratch, "config");
      cpSync(FIXTURE, configDir, { recursive: true });
      writeFileSync(
        join(configDir, "global_defaults.yaml"),
        "composition:\n  heads:\n    checkbox: [checkbox, title]\n    plain_line: [title]\n  tail: [stamp, date, tags, markers, chrome]\n",
      );
      const withComposition = generateResolution(configDir);
      assert.equal(withComposition.compositionSource, "config", "the heads/tail ARE the config's");
      assert.equal(
        withComposition.compositionFormSource,
        "engine-fallback",
        "the bullet and titleStyles are the ENGINE's — a config that ordered cells said nothing about them",
      );
      // AND THE VALUES ARE THE ENGINE'S OWN, unchanged — `renderer.py`'s `_COMPOSITION_BULLET` and
      // `_COMPOSITION_TITLE_STYLES: tuple[str, ...] = ()`. `titleStyles: []` is not an absence and
      // not a drop; it is the engine wrapping a title in nothing, mirrored exactly.
      assert.equal(withComposition.composition.bullet, "-");
      assert.deepEqual(withComposition.composition.titleStyles, []);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("A BRACKET GLYPH LANDS IN NEITHER TABLE, and is RECORDED — the trap, driven", () => {
    // THE CASE THE OPERATOR'S CONFIG HAS AND THIS FIXTURE DOES NOT. His `vocabulary/checkbox.yaml`
    // spells `status` with `[ ]`/`[x]` — neither `#`-prefixed nor a marker family — and until this
    // change those six pairs were published as `spelling.fieldTokens.status`, which is exactly what
    // a composer would reach for and exactly the copy that re-opened his completed outcomes.
    //
    // Added here by mutation so it runs in CI with no monorepo, and so the absence is proven to be
    // a NAMED one: a silent drop would leave a reader unable to tell "not published" from
    // "published empty".
    const scratch = mkdtempSync(join(tmpdir(), "checkbox-glyph-spelling-"));
    try {
      const configDir = join(scratch, "config");
      cpSync(FIXTURE, configDir, { recursive: true });
      writeFileSync(
        join(configDir, "vocabulary", "checkbox.yaml"),
        'checkbox:\n  - { token: "[ ]", field: status, value: open }\n  - { token: "[x]", field: status, value: done }\n',
      );
      const r = generateResolution(configDir);
      assert.equal(r.spelling.fieldTags.status?.["open"], "#open", "the real #-prefixed tag must survive");
      assert.equal(r.spelling.fieldMarkerValues.status, undefined, "a bracket glyph is not a marker");
      for (const table of [r.spelling.fieldTags, r.spelling.fieldMarkerValues]) {
        for (const spellings of Object.values(table)) {
          for (const token of Object.values(spellings)) {
            assert.ok(!token.startsWith("["), `a checkbox glyph '${token}' reached a spelling table`);
          }
        }
      }
      // NAMED, NOT MERELY MISSING — and the reason points at where the answer actually lives.
      assert.match(r.dropped["vocabulary token '[x]'"] ?? "", /renderCheckbox/);
      assert.match(r.dropped["vocabulary token '[ ]'"] ?? "", /neither a '#'-prefixed tag nor a marker glyph/);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("the checkbox decision is published as ORDERED rows plus a fallback, never a map", () => {
    assert.equal(compiled.renderCheckboxSource, "engine-literal");
    assert.equal(resolution.renderCheckbox.fallback, "[ ]");
    assert.deepEqual(
      resolution.renderCheckbox.rows.map((r) => [r.when.equals, r.then]),
      [["open", "[ ]"], ["done", "[x]"], ["in_progress", "[/]"], ["cancelled", "[-]"], ["waiting", "[~]"], ["scheduled", "[>]"]],
    );
    // ORDER IS MEANING. A map would lose it, and `tests/composition-agreement.test.mjs` pins these
    // exact rows against what the engine's own dispatcher answered.
    assert.ok(Array.isArray(resolution.renderCheckbox.rows), "rows must stay an ordered array");
  });

  test("the spelling table answers in the direction that PRINTS, for types and for fields", () => {
    assert.equal(resolution.spelling.typeTokens.task, "#task");
    assert.equal(resolution.spelling.typeTokens.person, "#person");
    // A FIXED-value field: the whole tag IS the value.
    // A FIXED-value TAG: `#`-prefixed, so the engine emits it into the TAGS cell.
    assert.equal(resolution.spelling.fieldTags.domain.work, "#work");
    // THE FIXTURE'S `status` IS GENUINELY A TAG (`#open`/`#done`, status_tags.yaml), so it belongs
    // in `fieldTags` here and this config does NOT exercise the checkbox-glyph case at all. That is
    // proven by its own mutation test below rather than asserted from a config that cannot show it.
    assert.deepEqual(resolution.spelling.fieldTags.status, { open: "#open", done: "#done" });
    // A TRAILING marker: the glyph introduces a value that varies line to line, so the kind is
    // part of the spelling.
    assert.deepEqual(resolution.spelling.fieldMarkers.due_date, { token: "📅", kind: "date" });
  });

  test("where the spelling table and `orderingFields` both answer, they AGREE", () => {
    // Two tables built by two readers from one file. They overlap on every field an ordering names,
    // and a composer holding one must not have to wonder which is authoritative.
    for (const [field, marker] of Object.entries(resolution.orderingFields)) {
      if (marker.kind === "enum") {
        // The enum arm's twin is `fieldMarkerValues`, keyed value -> token rather than token ->
        // value. It is the MARKER half of the split, which is where `priority`'s 🔽/⏫ live: an
        // enum ordering field is spelled by a marker glyph, never by a `#`-prefixed tag.
        const printed = resolution.spelling.fieldMarkerValues[field] ?? resolution.spelling.fieldTags[field];
        assert.ok(printed, `'${field}' is an enum for ordering but has no printed spelling`);
        for (const [token, value] of Object.entries(marker.values)) {
          assert.equal(printed[value], token, `'${field}' spells ${value} differently in the two tables`);
        }
        continue;
      }
      const rendered = resolution.spelling.fieldMarkers[field];
      assert.ok(rendered, `'${field}' has an ordering marker but no printed spelling`);
      assert.equal(rendered.token, marker.token, `'${field}' has two different glyphs`);
      assert.equal(rendered.kind, marker.kind, `'${field}' has two different kinds`);
    }
  });

  test("A `render_only` GLYPH IS REFUSED BY THE SEED TABLE AND KEPT BY THE PRINTED ONE", () => {
    // THE POINT OF THE WHOLE THIRD CHANGE, and the only test that proves the two tables disagree on
    // purpose. `render_only: true` means the engine PRINTS the glyph and never reads it back. That
    // one fact excludes it from seeding — writing it into a line the operator types would freeze a
    // value the engine goes on deciding — and QUALIFIES it for printing, which is what it is for.
    const scratch = mkdtempSync(join(tmpdir(), "render-only-spelling-"));
    try {
      const configDir = join(scratch, "config");
      cpSync(FIXTURE, configDir, { recursive: true });
      const markers = join(configDir, "vocabulary", "markers.yaml");
      writeFileSync(
        markers,
        readFileSync(markers, "utf8") +
          '  - token: "☑️"\n    field: done_task_count\n    extraction_hint: trailing_int\n    render_only: true\n',
      );
      const r = generateResolution(configDir);

      assert.deepEqual(
        r.spelling.fieldMarkers.done_task_count,
        { token: "☑️", kind: "int", renderOnly: true },
        "the printed table dropped a glyph the engine prints",
      );
      // AND THE INGEST DROP IS UNWEAKENED — same key, same reason, still recorded.
      assert.match(
        r.dropped["vocabulary token '☑️'"] ?? "",
        /render_only: true.*would not round-trip/s,
        "the seed refusal stopped being recorded",
      );
      // The seed table never learned the field at all, which is the refusal itself.
      assert.equal(r.spelling.fieldTags.done_task_count, undefined);
      assert.equal(r.spelling.fieldMarkerValues.done_task_count, undefined);
      for (const sections of Object.values(r.sectionRegistration)) {
        for (const entry of Object.values(sections)) {
          assert.ok(!entry.tokens.includes("☑️"), "a render_only glyph was seeded into a new line");
        }
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 9. THE STAMP CELL — which types are identified by name, and therefore render stampless
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// `composition.tail` names `stamp`. Whether a node gets one is a property of its TYPE, not its
// line: `decide_stamp` (renderer.py) asks `identity_spec` and returns `""` when the type declares
// `identity: {unique: true}`. Seven of the operator's 36 types do, and nothing told the browser.
//
// COMPILED FROM THE COMMITTED FIXTURE, like §8 and for the same reason: these keys are not in
// `presentation.json` (not regenerated — still blocked on the seed question), so the served file is
// the wrong subject and the fixture is the right one. It runs on every PR with no monorepo.
//
// THE PYTHON HALF is `scripts/resolution-agreement.py`, which drives the engine's own
// `identity_spec` over a real Graph and REFUSES on any disagreement. Falsified: forcing `unique`
// false in the generator makes it refuse on all seven types. It is not exercised in CI, because it
// reads the operator's config; that is the same limit every `*-agreement.py` in this repo carries.

describe("9. the stamp cell — identity modes, generator through reader", () => {
  const FIXTURE_DIR = resolve(HERE, "fixtures", "config");
  const compiledIdentity = generateResolution(FIXTURE_DIR);
  const identityReading = readConfigResolutionDeclaration({ resolution: compiledIdentity });

  test("the reader accepts the generator's own identity map, with no problem reported", () => {
    assert.deepEqual(identityReading.problems, [], "the reader objected to the generator's output");
  });

  test("EVERY declared type is keyed, so a missing key means 'unknown type', not 'ordinary type'", () => {
    // THE PROPERTY THE WHOLE SHAPE EXISTS FOR. A sparse map makes "this type is ordinary" and "I
    // have never heard of this type" the same lookup, and they are opposite instructions: the first
    // says stamp it, the second says refuse to compose it.
    // Parsed through the generators' OWN reader, not a regex over the file — a regex that matched
    // the wrong shape would silently check nothing, which is how this test first passed vacuously.
    const declared = Object.keys(
      parseYamlSubset(readFileSync(resolve(FIXTURE_DIR, "schema.yaml"), "utf8"), "schema.yaml").node_types,
    );
    assert.ok(declared.length >= 3, `only ${declared.length} types found in the fixture schema`);
    // NON-VACUITY, stated as the property rather than as a count: this proves nothing unless the
    // fixture carries BOTH kinds. A schema where every type were ordinary would pass the loop below
    // while never exercising the branch that matters.
    const modes = Object.values(identityReading.resolution.identityModes);
    assert.ok(modes.some((m) => m.unique), "no unique-identity type in the fixture — nothing proven");
    assert.ok(modes.some((m) => !m.unique), "every type is unique in the fixture — nothing proven");
    for (const nodeType of declared) {
      assert.ok(
        identityReading.resolution.identityModes[nodeType] !== undefined,
        `'${nodeType}' is declared in schema.yaml but absent from identityModes`,
      );
    }
  });

  test("a unique-identity type is published stampless, WITH the field that identifies it instead", () => {
    // The fixture declares `header` with `identity: {field: title, unique: true}`.
    // THE FIXTURE'S OWN SHAPE, and it is the more interesting one: `header` declares
    // `identity: {unique: true}` with NO `field:`. The engine accepts that — `decide_stamp` reads
    // only `unique` and renders it stampless, while `applier.py`'s by-title guard needs both and so
    // never fires. "Stampless, and nothing re-identifies it" is a real state, published as it is.
    assert.deepEqual(identityReading.resolution.identityModes.header, { unique: true, field: null });
    // And an ordinary type carries the mint-fresh-and-stamp pathway.
    assert.deepEqual(identityReading.resolution.identityModes.task, { unique: false, field: null });
  });

  test("`unique: true, field: null` IS PUBLISHED, not refused — the engine accepts it", () => {
    // This reader first REFUSED that combination, on the reasoning that a unique type with no
    // field identifies nothing once its stamp is omitted. True, and not the reader's call: the
    // fixture's own `header` is exactly that shape, the engine runs it, and `decide_stamp` reads
    // only `unique` — so the line IS stampless. Refusing would have refused a real config.
    const { resolution, problems } = readConfigResolutionDeclaration({
      resolution: { ...compiledIdentity, identityModes: { header: { unique: true, field: null } } },
    });
    assert.deepEqual(problems, []);
    assert.deepEqual(resolution.identityModes.header, { unique: true, field: null });
  });

  test("ONE BAD ENTRY POISONS THE MAP, unlike chromeShapes' per-entry tolerance", () => {
    // The asymmetry is deliberate. A dropped `chromeShapes` entry makes a type undrawable and the
    // caller notices. A dropped identity entry is indistinguishable from "ordinary type", which
    // silently stamps a node the engine renders stampless.
    const { resolution, problems } = readConfigResolutionDeclaration({
      resolution: { ...compiledIdentity, identityModes: { ...compiledIdentity.identityModes, header: "yes" } },
    });
    assert.equal(resolution.identityModes, undefined, "a malformed entry left a partial map readable");
    assert.ok(problems.some((p) => p.includes("identityModes.header")), problems.join("; "));
  });

  test("the map follows the CONFIG — declare a second unique type and it appears", () => {
    // THE FALSIFIER: this reads schema.yaml rather than carrying a list. Make `person` unique in a
    // scratch copy and the published answer must move with it, with no code change.
    const scratch = mkdtempSync(join(tmpdir(), "identity-modes-"));
    try {
      const configDir = join(scratch, "config");
      cpSync(FIXTURE_DIR, configDir, { recursive: true });
      const schemaPath = join(configDir, "schema.yaml");
      writeFileSync(
        schemaPath,
        readFileSync(schemaPath, "utf8").replace(
          "  person:\n    fields: [title]\n",
          "  person:\n    fields: [title]\n    identity:\n      field: title\n      unique: true\n",
        ),
      );
      const moved = generateResolution(configDir).identityModes;
      assert.deepEqual(moved.person, { unique: true, field: "title" }, "the published answer did not follow the config");
      assert.deepEqual(moved.task, { unique: false, field: null }, "an unrelated type moved too");
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 10. CONTINUATION LINES — the extra lines a node re-emits beneath its own
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// `_render_node_line` composes each as `{indent+1}{bullet} {value} {token}`. BOTH halves are
// config: the field names from `schema.yaml`'s `render.continuation_fields` (the file `chromeShapes`
// and `identityModes` already read) and the trailing tag from `vocabulary/structural_tokens.yaml`'s
// `field_bindings:` (a file `spelling` already walks). Neither is engine source, so unlike
// `renderCheckbox` there is no copy and nothing to pin.
//
// Compiled from the committed fixture, like §8 and §9, for the same reason and with the same limit.

describe("10. continuation lines — both halves, from config", () => {
  const FIXTURE_DIR = resolve(HERE, "fixtures", "config");

  test("the reader accepts the generator's own continuation map, with no problem reported", () => {
    const compiled = generateResolution(FIXTURE_DIR);
    const { problems } = readConfigResolutionDeclaration({ resolution: compiled });
    assert.deepEqual(problems, [], "the reader objected to the generator's output");
  });

  test("A TYPE THAT DECLARES ONE GETS BOTH HALVES — the field AND the tag that re-ingests it", () => {
    // THE FALSIFIER, by mutation, because the fixture declares no continuation field of its own.
    // The tag is not decoration: `view-render-language-is-ingest-language` means a rendered
    // continuation line must be its own valid re-ingest input, or the next cycle reads it as an
    // untagged line and mints a stray PART_OF child.
    const scratch = mkdtempSync(join(tmpdir(), "continuation-fields-"));
    try {
      const configDir = join(scratch, "config");
      cpSync(FIXTURE_DIR, configDir, { recursive: true });
      const schemaPath = join(configDir, "schema.yaml");
      writeFileSync(
        schemaPath,
        readFileSync(schemaPath, "utf8").replace(
          "  person:\n    fields: [title]\n    render:\n      shape: plain_line\n",
          "  person:\n    fields: [title, summary]\n    render:\n      shape: plain_line\n      continuation_fields: [summary]\n",
        ),
      );
      const tokensPath = join(configDir, "vocabulary", "structural_tokens.yaml");
      writeFileSync(
        tokensPath,
        readFileSync(tokensPath, "utf8") +
          '  - token: "#gloss"\n    structural_token:\n      kind: field_binding\n      field_bindings:\n        - token: "#gloss"\n          field: summary\n',
      );
      const { resolution, problems } = readConfigResolutionDeclaration({ resolution: generateResolution(configDir) });
      assert.deepEqual(problems, []);
      assert.deepEqual(
        resolution.continuationFields.person,
        [{ field: "summary", token: "#gloss" }],
        "the continuation line lost its field or its re-ingest tag",
      );
      // A TYPE THAT DECLARES NONE IS SIMPLY ABSENT — one meaning, unlike chromeShapes' key set.
      assert.equal(resolution.continuationFields.task, undefined);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("`token: null` IS AN ANSWER — an ambiguous binding renders no tag, and is not a gap", () => {
    // `field_binding_token_for` ends `matches[0] if len(matches) == 1 else None`: two tokens bound
    // to one field is not a pick the engine makes, and `_render_node_line`'s `if tag` guard then
    // emits the line with no trailing tag at all. Mirrored, and RECORDED — a bare absence would
    // read as "unknown" when it is the engine's own answer.
    const scratch = mkdtempSync(join(tmpdir(), "continuation-ambiguous-"));
    try {
      const configDir = join(scratch, "config");
      cpSync(FIXTURE_DIR, configDir, { recursive: true });
      const schemaPath = join(configDir, "schema.yaml");
      writeFileSync(
        schemaPath,
        readFileSync(schemaPath, "utf8").replace(
          "  person:\n    fields: [title]\n    render:\n      shape: plain_line\n",
          "  person:\n    fields: [title, summary]\n    render:\n      shape: plain_line\n      continuation_fields: [summary]\n",
        ),
      );
      const tokensPath = join(configDir, "vocabulary", "structural_tokens.yaml");
      writeFileSync(
        tokensPath,
        readFileSync(tokensPath, "utf8") +
          '  - token: "#gloss"\n    structural_token:\n      kind: field_binding\n      field_bindings:\n        - token: "#gloss"\n          field: summary\n        - token: "#blurb"\n          field: summary\n',
      );
      const compiled = generateResolution(configDir);
      assert.deepEqual(compiled.continuationFields.person, [{ field: "summary", token: null }]);
      assert.match(
        compiled.dropped["node type 'person' continuation field 'summary'"] ?? "",
        /2 vocabulary tokens bind that field/,
        "an ambiguous binding was published as null with no reason recorded",
      );
      // AND `null` SURVIVES THE READER, because it is the engine's answer rather than a malformed
      // value. A reader that refused it would refuse a config the engine renders.
      const { resolution, problems } = readConfigResolutionDeclaration({ resolution: compiled });
      assert.deepEqual(problems, []);
      assert.equal(resolution.continuationFields.person[0].token, null);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("ONE BAD ENTRY POISONS THE MAP — a dropped line is a line the node stops carrying", () => {
    const compiled = generateResolution(FIXTURE_DIR);
    const { resolution, problems } = readConfigResolutionDeclaration({
      resolution: { ...compiled, continuationFields: { ticket: [{ field: "summary", token: 7 }] } },
    });
    assert.equal(resolution.continuationFields, undefined, "a malformed entry left a partial map readable");
    assert.ok(problems.some((p) => p.includes("continuationFields.ticket[0].token")), problems.join("; "));
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 11. EDGE TAGS — what fills the chrome cell `edgeTagOrder` was already ordering
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// `_outgoing_edge_chrome_cells` emits `#<token> [[<target title>]]` for every outgoing edge whose
// type is chrome-eligible. `edgeTagOrder` (#182) published the ORDER of that cell while nothing
// could populate it: `readSpelling` handled `node_type:` and `field:` entries and had no case for
// `edge_type:`, so four of the operator's seven tags occurred zero times in the served file.
//
// AN ORDERING IS A CLAIM ABOUT A CELL. These tests are the other half of that claim.

describe("11. edge tags — the chrome cell's contents", () => {
  const FIXTURE_DIR = resolve(HERE, "fixtures", "config");

  const withEdgeTags = (yaml) => {
    const scratch = mkdtempSync(join(tmpdir(), "edge-tags-"));
    try {
      const configDir = join(scratch, "config");
      cpSync(FIXTURE_DIR, configDir, { recursive: true });
      writeFileSync(join(configDir, "vocabulary", "edge_tags.yaml"), yaml);
      return generateResolution(configDir);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  };

  test("an edge tag is published with its token AND its cardinality", () => {
    const compiled = withEdgeTags(
      'edge_tags:\n' +
        '  - { token: "#next", edge_type: NEXT, cardinality: one }\n' +
        '  - { token: "#unlocks", edge_type: UNLOCKS, cardinality: many }\n',
    );
    const { resolution, problems } = readConfigResolutionDeclaration({ resolution: compiled });
    assert.deepEqual(problems, []);
    assert.deepEqual(resolution.spelling.edgeTags, {
      NEXT: { token: "#next", cardinality: "one" },
      UNLOCKS: { token: "#unlocks", cardinality: "many" },
    });
  });

  test("CARDINALITY IS CARRIED, and `one` is a real case — NEXT is it in his own config", () => {
    // Not decoration: `one` versus `many` decides whether a second edge of that type REPLACES or
    // APPENDS. A composer that ignored it would emit two `#next` cells for a relation the config
    // says holds one. Asserted as a property rather than a spot value, so it survives a rename.
    const compiled = withEdgeTags(
      'edge_tags:\n  - { token: "#next", edge_type: NEXT, cardinality: one }\n' +
        '  - { token: "#parallel", edge_type: PARALLEL, cardinality: many }\n',
    );
    const kinds = new Set(Object.values(compiled.spelling.edgeTags).map((t) => t.cardinality));
    assert.deepEqual([...kinds].sort(), ["many", "one"], "the fixture must exercise BOTH cardinalities");
  });

  test("AN UNKNOWN CARDINALITY DROPS THE TAG, with a reason — it does not default to `many`", () => {
    // Defaulting would append where the engine replaces, printing a cell the engine never emits.
    // Dropping makes a composer omit the chrome instead: visibly LESS than the engine rather than
    // differently from it, which is the failure that can be seen rather than mistaken for a sync bug.
    const compiled = withEdgeTags('edge_tags:\n  - { token: "#next", edge_type: NEXT, cardinality: several }\n');
    assert.equal(compiled.spelling.edgeTags.NEXT, undefined);
    assert.match(compiled.dropped["edge tag '#next'"] ?? "", /neither 'one' nor 'many'/);
  });

  test("THE READER REFUSES A CARDINALITY-LESS TAG TOO, and names it", () => {
    const compiled = generateResolution(FIXTURE_DIR);
    const { resolution, problems } = readConfigResolutionDeclaration({
      resolution: {
        ...compiled,
        spelling: { ...compiled.spelling, edgeTags: { NEXT: { token: "#next" } } },
      },
    });
    assert.equal(resolution.spelling.edgeTags.NEXT, undefined);
    assert.ok(problems.some((p) => p.includes("edgeTags.NEXT.cardinality")), problems.join("; "));
  });

  test("EVERY TAG `edgeTagOrder` RANKS CAN NOW BE PRODUCED — the gap #182 opened, closed", () => {
    // THE POINT OF THIS PR, asserted as the join it is. Every token the published chrome ORDER
    // ranks must be a token some published edge tag can emit; otherwise the ordering is ordering
    // something nothing fills, which is exactly the state this closes.
    const compiled = withEdgeTags(
      'edge_tags:\n' +
        '  - { token: "#requires", edge_type: REQUIRES, cardinality: many }\n' +
        '  - { token: "#blocks", edge_type: BLOCKS, cardinality: many }\n' +
        '  - { token: "#next", edge_type: NEXT, cardinality: one }\n' +
        '  - { token: "#parallel", edge_type: PARALLEL, cardinality: many }\n' +
        '  - { token: "#waiting-for", edge_type: WAITING_FOR, cardinality: many }\n',
    );
    const emittable = new Set(Object.values(compiled.spelling.edgeTags).map((t) => t.token));
    assert.ok(emittable.size > 0, "no edge tag is emittable — the chrome cell cannot be filled");
    for (const ranked of compiled.edgeTagOrder.canonicalOrder) {
      assert.ok(
        emittable.has(ranked),
        `edgeTagOrder ranks '${ranked}' but no published edge tag emits it — the order is ` +
          "ordering a cell nothing can fill",
      );
    }
  });
});

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

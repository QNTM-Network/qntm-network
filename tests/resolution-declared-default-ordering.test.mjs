/**
 * THE DEFAULT ORDERING IS DECLARED — proof for "the default ordering is declared" (2026-08-06).
 *
 *   node --test tests/resolution-declared-default-ordering.test.mjs
 *
 * THE DEFECT THIS CLOSES: `resolution.defaultOrdering`/`priorityRank` used to be a hardcoded
 * literal (`due_date`, `priority`, `title`) published unconditionally for EVERY qntm.network
 * instance, mirroring the engine's own hardcoded `section_builder._DEFAULT_ORDERING`. A user who
 * declares their own node types and fields — the whole point of the product — got a global sort
 * order naming fields that might not exist in their vocabulary at all. See
 * `scripts/compile-resolution.mjs`'s own header, "THE DEFAULT ORDERING", for the full argument.
 *
 * THREE CLAIMS:
 *
 *   1. NO CONFIG, NO CHANGE. A config with no `global_defaults.yaml` at all — every config this
 *      repo has ever run against, today — publishes exactly what it always published, byte for
 *      byte, PLUS a new, visible `defaultOrderingSource: "engine-fallback"`.
 *
 *   2. ANOTHER USER'S CONFIG — THE PROOF THAT MATTERS. A `global_defaults.yaml` declaring
 *      `default_ordering:`/`priority_rank:` over fields that are NOT `due_date`/`priority`/`title`
 *      is compiled, published verbatim, and its fields' markers are resolved the SAME generic way
 *      any declared section's own `ordering:` fields are — no field name anywhere in the compiler
 *      decided which fields could be looked up.
 *
 *   3. MALFORMED CONFIG REFUSES LOUDLY. A `default_ordering:`/`priority_rank:` of the wrong shape
 *      throws `GenerationError`, the same posture every other malformed-shape config in this file
 *      already takes (`readDayBoundary`, `readChromeShapes`, ...) — never a silent guess.
 *
 * NOTHING HERE WRITES TO THE OPERATOR'S CONFIG or to `apps/qntm-md/config/`. Every mutation is
 * made to a `cpSync` scratch copy of `tests/fixtures/config`, removed in a `finally`.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { generateResolution } from "../scripts/generate-resolution-declaration.mjs";
import { GenerationError } from "../scripts/compile-resolution.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CONFIG = join(HERE, "fixtures", "config");

const ENGINE_LITERAL_DEFAULT_ORDERING = [
  { field: "due_date", direction: "asc" },
  { field: "priority", direction: "desc" },
  { field: "title", direction: "asc" },
];
const ENGINE_LITERAL_PRIORITY_RANK = { urgent: 4, high: 3, normal: 2, medium: 2, low: 1 };

/** Copy the fixture config, mutate it, generate the resolution declaration, clean up. */
function withScratchFixture(mutate) {
  const scratch = mkdtempSync(join(tmpdir(), "declared-default-ordering-"));
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
  test("falls back to the engine's own literal tuple, and says so", () => {
    const resolution = generateResolution(FIXTURE_CONFIG);
    assert.deepEqual(resolution.defaultOrdering, ENGINE_LITERAL_DEFAULT_ORDERING);
    assert.equal(resolution.defaultOrderingSource, "engine-fallback");
    assert.deepEqual(resolution.priorityRank, ENGINE_LITERAL_PRIORITY_RANK);
  });

  test("today's byte-for-byte behaviour, unchanged: title has no marker, and that absence is now a NAMED drop, not silence", () => {
    const resolution = generateResolution(FIXTURE_CONFIG);
    assert.equal(resolution.orderingFields.title, undefined);
    assert.match(
      resolution.dropped["ordering field 'title'"] ?? "",
      /declares no marker for it at all/,
    );
  });
});

describe("2. ANOTHER USER'S CONFIG — a different default ordering, over fields that are not due_date/priority/title", () => {
  test("the served declaration carries the CONFIG's own fields, not the engine's tuple", () => {
    const resolution = withScratchFixture((configDir) => {
      writeFileSync(
        join(configDir, "global_defaults.yaml"),
        [
          "defaults: {}",
          "default_ordering:",
          "  - { field: effort, direction: asc }",
          "  - { field: owner_rank, direction: desc }",
          "priority_rank:",
          "  gold: 3",
          "  silver: 2",
          "  bronze: 1",
          "",
        ].join("\n"),
      );
      const markersPath = join(configDir, "vocabulary", "markers.yaml");
      const markers = readFileSync(markersPath, "utf8");
      writeFileSync(
        markersPath,
        markers +
          [
            '  - token: "⏱"',
            "    field: effort",
            "    extraction_hint: trailing_int",
            '  - token: "🥇"',
            "    field: owner_rank",
            "    value: gold",
            '  - token: "🥈"',
            "    field: owner_rank",
            "    value: silver",
            '  - token: "🥉"',
            "    field: owner_rank",
            "    value: bronze",
            "",
          ].join("\n"),
      );
    });

    assert.deepEqual(resolution.defaultOrdering, [
      { field: "effort", direction: "asc" },
      { field: "owner_rank", direction: "desc" },
    ]);
    assert.equal(resolution.defaultOrderingSource, "config");
    assert.deepEqual(resolution.priorityRank, { gold: 3, silver: 2, bronze: 1 });

    // The two NEW fields' markers resolved — the SAME generic path any declared section's own
    // `ordering:` field uses (`readOrderingFieldMarkers`), never a special case for these names.
    assert.deepEqual(resolution.orderingFields.effort, { token: "⏱", kind: "int" });
    assert.deepEqual(resolution.orderingFields.owner_rank, {
      kind: "enum",
      values: { "🥇": "gold", "🥈": "silver", "🥉": "bronze" },
    });

    // due_date's marker is STILL published — the fixture's own 'main.open' section declares
    // `ordering: [{field: due_date}]`, independent of the GLOBAL default this test changed. Proves
    // the two candidate sources (a section's own ordering, the global default) are unioned, not
    // one replacing the other.
    assert.deepEqual(resolution.orderingFields.due_date, { token: "📅", kind: "date" });

    // 'priority' and 'title' are NAMED BY NOTHING in this config any more — the engine's fallback
    // tuple is not in effect once a config declares its own — so neither is looked up, and neither
    // produces a drop. This is the whole point: the compiler asked about the FIELDS THIS CONFIG
    // NAMED, not about a fixed set it already knew.
    assert.equal(resolution.orderingFields.priority, undefined);
    assert.equal(resolution.dropped["ordering field 'priority'"], undefined);
    assert.equal(resolution.orderingFields.title, undefined);
    assert.equal(resolution.dropped["ordering field 'title'"], undefined);
  });

  test("a default ordering with no enum-shaped field publishes no priorityRank at all — absent, not empty", () => {
    const resolution = withScratchFixture((configDir) => {
      writeFileSync(
        join(configDir, "global_defaults.yaml"),
        ["defaults: {}", "default_ordering:", "  - { field: due_date, direction: desc }", ""].join("\n"),
      );
    });
    assert.deepEqual(resolution.defaultOrdering, [{ field: "due_date", direction: "desc" }]);
    assert.equal(resolution.defaultOrderingSource, "config");
    assert.equal("priorityRank" in resolution, false, "an empty priorityRank was published rather than omitted");
  });
});

describe("3. MALFORMED CONFIG REFUSES LOUDLY, never a silent guess", () => {
  test("default_ordering: not a list throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(join(configDir, "global_defaults.yaml"), "defaults: {}\ndefault_ordering: not-a-list\n");
        }),
      GenerationError,
    );
  });

  test("default_ordering: [] (empty) throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(join(configDir, "global_defaults.yaml"), "defaults: {}\ndefault_ordering: []\n");
        }),
      GenerationError,
    );
  });

  test("default_ordering[i].direction outside asc/desc throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            "defaults: {}\ndefault_ordering:\n  - { field: effort, direction: sideways }\n",
          );
        }),
      GenerationError,
    );
  });

  test("default_ordering[i] with no field: throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            "defaults: {}\ndefault_ordering:\n  - { direction: asc }\n",
          );
        }),
      GenerationError,
    );
  });

  test("priority_rank: not a mapping throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            "defaults: {}\ndefault_ordering:\n  - { field: effort, direction: asc }\npriority_rank: not-a-map\n",
          );
        }),
      GenerationError,
    );
  });

  test("priority_rank value that is not a positive integer throws GenerationError", () => {
    assert.throws(
      () =>
        withScratchFixture((configDir) => {
          writeFileSync(
            join(configDir, "global_defaults.yaml"),
            "defaults: {}\ndefault_ordering:\n  - { field: owner_rank, direction: asc }\npriority_rank:\n  gold: 0\n",
          );
        }),
      GenerationError,
    );
  });

  test("a global_defaults.yaml that declares no default_ordering: at all is 'not declared', not malformed", () => {
    // Defence in depth for the fallback branch itself: the operator's real file today is exactly
    // this shape (`defaults: {}`, nothing else) and must not throw.
    const resolution = withScratchFixture((configDir) => {
      writeFileSync(join(configDir, "global_defaults.yaml"), "defaults: {}\n");
    });
    assert.deepEqual(resolution.defaultOrdering, ENGINE_LITERAL_DEFAULT_ORDERING);
    assert.equal(resolution.defaultOrderingSource, "engine-fallback");
  });
});

/**
 * DOES THIS GENERATOR SEE EVERY KEY THE OPERATOR IS ALLOWED TO DECLARE?
 *
 *   node --test tests/view-key-agreement.test.mjs
 *
 * ── WHAT IS BEING PINNED, AND WHY IT IS NOT A STYLE CHECK ──
 *
 * The engine's view-sheet validator (`apps/qntm-md/src/qntm_md/bundle/validators/views.py`)
 * hard-rejects an unknown key on a sheet AND on a section. Measured 2026-08-14 by running
 * `validate_views` over a sheet declaring `composition:` at each level: both raised
 * `BundleValidationError`, and a bundle carrying that key does not load. So the engine's two
 * allow-lists are the WHOLE surface an operator can declare, and this generator's own three lists
 * — PUBLISHED / REFUSED / NOT_PUBLISHED (`compile-resolution.mjs`) — are its claim to have made a
 * DECISION about each one.
 *
 * This file asserts the two agree exactly, in both directions:
 *
 *   A key the ENGINE admits and this generator lists NOWHERE is the "silently ignores it" row of
 *   `ledger.mjs`'s three-outcome table — the dangerous one. It arrives the day a key is ADDED to
 *   the engine's allow-list, which is precisely how a per-view override slot would arrive, and
 *   until now nothing here would have noticed.
 *
 *   A key this generator lists that the ENGINE does NOT admit is the mirror, and it is worse: the
 *   slot is unreachable. No config that declares it loads, so the branch reading it can never run
 *   and can never be measured — a green surface over a region no input can reach.
 *
 * ── THE FOUR KINDS THIS FILE WAS OPENED FOR ──
 *
 * `chromeShapes`, `composition`, `tagOrder` and `dayBoundary` are published as ONE GLOBAL answer
 * with no view or section override slot. Section 3 records WHY that is currently correct rather
 * than leaving it as an unexplained asymmetry: the engine admits none of the four at either level,
 * so there is nowhere for a declaration to come from. `docs/architecture/capabilities.yaml`
 * #a-view-may-not-override-what-the-engine-reads-once carries the per-kind argument and names
 * which of them should eventually get a slot and where that change lands.
 *
 * ── WHAT THIS DOES NOT PROVE ──
 *
 * That the ENGINE's allow-lists today still match the committed fixture — that is a claim about
 * `validators/views.py` as it stands right now, proven only by re-running
 * `scripts/view-key-agreement.py` against a live monorepo checkout, and unconfirmed here. Same
 * posture `composition-agreement.test.mjs` and `resolution-default-ordering-agreement.test.mjs`
 * already state for their own fixtures.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  VIEW_SHEET_KEYS_PUBLISHED,
  VIEW_SHEET_KEYS_REFUSED,
  VIEW_SHEET_KEYS_NOT_PUBLISHED,
  VIEW_SECTION_KEYS_PUBLISHED,
  VIEW_SECTION_KEYS_REFUSED,
  VIEW_SECTION_KEYS_NOT_PUBLISHED,
} from "../scripts/compile-resolution.mjs";
import { generateResolution } from "../scripts/generate-resolution-declaration.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CONFIG = join(HERE, "fixtures", "config");
const FIXTURE = JSON.parse(readFileSync(resolve(HERE, "./fixtures/view-key-agreement.json"), "utf8"));

/**
 * WHICH engine the fixture captured, for the failure text.
 *
 * Every assertion here compares the browser's lists against a COMMITTED capture, so a failure
 * has two possible causes and they need different fixes: the browser really is behind the
 * engine, or the capture is stale and the engine moved without anyone re-running it. Measured
 * 2026-08-14: the second happened, silently, for three hours — `scripts/view-key-agreement.py`
 * read a shared trunk clone sitting on a feature branch, captured a pre-change engine, and
 * exited 0. Naming the captured revision in the message is what lets a reader tell the two
 * apart in the moment rather than after re-deriving it.
 *
 * `engineRevision` is absent from fixtures captured before that provenance existed; say so
 * plainly rather than printing "undefined", which reads like a bug in the test.
 */
const CAPTURED_FROM = (() => {
  const rev = FIXTURE.engineRevision;
  if (!rev) return "engine revision UNRECORDED — this fixture predates provenance capture, so it cannot say which engine it read; re-run scripts/view-key-agreement.py";
  const where = rev.overridden ? " (QNTM_MONOREPO_ENGINE_SRC)" : "";
  return `captured from engine ${rev.branch} @ ${String(rev.sha).slice(0, 12)}${where}`;
})();

const sorted = (keys) => [...keys].sort();

describe("1. the engine's sheet keys and this generator's three lists are the same set", () => {
  const declared = [
    ...VIEW_SHEET_KEYS_PUBLISHED,
    ...VIEW_SHEET_KEYS_REFUSED,
    ...VIEW_SHEET_KEYS_NOT_PUBLISHED,
  ];

  test("every key the engine admits on a sheet is decided about here", () => {
    const undecided = FIXTURE.sheetKeys.filter((key) => !declared.includes(key));
    assert.deepEqual(
      undecided,
      [],
      `the engine admits ${JSON.stringify(undecided)} on a view sheet and compile-resolution.mjs ` +
        "lists it in none of PUBLISHED / REFUSED / NOT_PUBLISHED. An operator can declare it and " +
        "this generator would neither publish nor refuse it. Decide which of the three it is. " +
        `[${CAPTURED_FROM}]`,
    );
  });

  test("no key is claimed here that the engine would reject", () => {
    const unreachable = declared.filter((key) => !FIXTURE.sheetKeys.includes(key));
    assert.deepEqual(
      unreachable,
      [],
      `compile-resolution.mjs lists ${JSON.stringify(unreachable)} as a view-sheet key, and the ` +
        "engine's validator rejects it — a config declaring it does not load, so nothing can ever " +
        "reach the branch that reads it.",
    );
  });

  test("the three lists do not overlap — a key has ONE decision, not two", () => {
    assert.equal(new Set(declared).size, declared.length, `duplicate across the three lists: ${declared}`);
  });
});

describe("2. the engine's section keys and this generator's three lists are the same set", () => {
  const declared = [
    ...VIEW_SECTION_KEYS_PUBLISHED,
    ...VIEW_SECTION_KEYS_REFUSED,
    ...VIEW_SECTION_KEYS_NOT_PUBLISHED,
  ];

  test("every key the engine admits on a section is decided about here", () => {
    const undecided = FIXTURE.sectionKeys.filter((key) => !declared.includes(key));
    assert.deepEqual(
      undecided,
      [],
      `the engine admits ${JSON.stringify(undecided)} on a section and compile-resolution.mjs ` +
        "lists it in none of PUBLISHED / REFUSED / NOT_PUBLISHED.",
    );
  });

  test("no key is claimed here that the engine would reject", () => {
    const unreachable = declared.filter((key) => !FIXTURE.sectionKeys.includes(key));
    assert.deepEqual(unreachable, [], `unreachable section keys: ${JSON.stringify(unreachable)}`);
  });

  test("the three lists do not overlap", () => {
    assert.equal(new Set(declared).size, declared.length, `duplicate across the three lists: ${declared}`);
  });
});

describe("3. the four global-only kinds have no view or section slot, because none can be declared", () => {
  // The spellings an operator would reach for. `composition:` and `tag_order:` are the keys
  // `global_defaults.yaml` uses (or would use); `day_boundary:` is `day_boundary.yaml`'s own root
  // key; `render:` is where `schema.yaml` puts the chrome shape, on the node TYPE.
  const FOUR = ["composition", "tag_order", "day_boundary", "render"];

  for (const key of FOUR) {
    test(`the engine admits no '${key}:' on a view sheet or a section`, () => {
      assert.ok(
        !FIXTURE.sheetKeys.includes(key) && !FIXTURE.sectionKeys.includes(key),
        `the engine now admits '${key}:' on a view sheet or a section. That is the moment ` +
          "compile-resolution.mjs must grow a cascade slot for it — the browser publishing one " +
          "global answer for a view that overrides it is the asymmetry monorepo PR #72 opened " +
          "for composition at the GLOBAL rung. See docs/architecture/capabilities.yaml" +
          "#a-view-may-not-override-what-the-engine-reads-once for which of the four should get " +
          "a slot and what has to land first. " +
          `[${CAPTURED_FROM}]`,
      );
    });
  }

  test("chromeShapes reaches a section through default_node_type, which DOES cascade", () => {
    // Not a gap: the section declares what a line BECOMES, and the type carries how that renders.
    // The engine grants default_node_type all three levels, and this generator reads it at the
    // section rung — so a section already chooses its chrome, by choosing its type.
    assert.ok(VIEW_SECTION_KEYS_PUBLISHED.includes("default_node_type"));
    assert.deepEqual(FIXTURE.levelsFor.default_node_type, ["global", "view", "structural_node"]);
  });
});

describe("4. an unknown key on a sheet or a section is recorded, not silently ignored", () => {
  // Proved against `tests/fixtures/config/` — a `cpSync` scratch copy with ONE extra view sheet
  // added, removed in a `finally`. Same harness `resolution-declared-composition.test.mjs` uses,
  // and it never touches the committed `presentation.json`.
  const withProbeSheet = (sheetYaml) => {
    const scratch = mkdtempSync(join(tmpdir(), "view-key-agreement-"));
    try {
      const configDir = join(scratch, "config");
      cpSync(FIXTURE_CONFIG, configDir, { recursive: true });
      writeFileSync(join(configDir, "views", "probe.yaml"), sheetYaml);
      return generateResolution(configDir).dropped ?? {};
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  };

  test("a sheet-level 'composition:' is named in the dropped map", () => {
    const dropped = withProbeSheet(
      "probe:\n  path: probe.md\n  composition:\n    tail: [tags]\n  sections:\n" +
        "    - id: open\n      qualification: local-tasks\n",
    );
    const reason = dropped["views/probe.yaml"] ?? "";
    assert.match(
      reason,
      /composition:/,
      `the sheet declared 'composition:' and the dropped map does not name it — got ${JSON.stringify(reason)}`,
    );
  });

  test("a section-level 'composition:' is named, with the section it was on", () => {
    const dropped = withProbeSheet(
      "probe:\n  path: probe.md\n  sections:\n    - id: open\n      qualification: local-tasks\n" +
        "      composition:\n        tail: [tags]\n",
    );
    const reason = dropped["views/probe.yaml"] ?? "";
    assert.match(reason, /composition:/, `dropped map does not name the key — got ${JSON.stringify(reason)}`);
    assert.match(reason, /'open'/, `dropped map does not name the section — got ${JSON.stringify(reason)}`);
  });

  test("a sheet declaring only known keys is not flagged", () => {
    // THE NEGATIVE HALF. Without it, a check that flagged EVERY sheet would pass the two tests
    // above just as well, and the drop would be noise rather than a signal.
    const dropped = withProbeSheet(
      "probe:\n  version: 1\n  domain: all\n  path: probe.md\n  sections:\n" +
        "    - id: open\n      qualification: local-tasks\n      name: Open\n",
    );
    const reason = dropped["views/probe.yaml"] ?? "";
    assert.doesNotMatch(
      reason,
      /has no read for that key/,
      `a sheet using only engine-allowed, generator-known keys was flagged: ${JSON.stringify(reason)}`,
    );
  });
});

describe("5. the sorted sets are equal — one assertion that states the whole contract", () => {
  test("sheet", () => {
    assert.deepEqual(
      sorted([...VIEW_SHEET_KEYS_PUBLISHED, ...VIEW_SHEET_KEYS_REFUSED, ...VIEW_SHEET_KEYS_NOT_PUBLISHED]),
      sorted(FIXTURE.sheetKeys),
    );
  });
  test("section", () => {
    assert.deepEqual(
      sorted([
        ...VIEW_SECTION_KEYS_PUBLISHED,
        ...VIEW_SECTION_KEYS_REFUSED,
        ...VIEW_SECTION_KEYS_NOT_PUBLISHED,
      ]),
      sorted(FIXTURE.sectionKeys),
    );
  });
});

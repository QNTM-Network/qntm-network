/**
 * DOES THE BROWSER'S DEFAULT ORDERING AGREE WITH THE ENGINE'S OWN CONSTANT?
 *
 *   node --test tests/resolution-default-ordering-agreement.test.mjs
 *
 * `roadmap-the-road-ahead.md`'s "the engine's own default ordering, made explicit" step
 * (2026-08-04). `resolution.defaultOrdering`/`resolution.priorityRank` are the ONE pair of facts
 * this repo publishes that is NOT config-dependent — `apps/qntm-md/src/qntm_md/render/
 * section_builder.py`'s `_DEFAULT_ORDERING`/`_PRIORITY_RANK` module-level constants, true for
 * every qntm-md instance, hardcoded in `scripts/compile-resolution.mjs` as `ENGINE_DEFAULT_
 * ORDERING`/`ENGINE_PRIORITY_RANK` rather than derived from any operator's YAML (there is nothing
 * in YAML that states them).
 *
 * "Derived from the engine's own source, pinned by a test that fails if the engine changes it" —
 * the operator's own words for what this must be, given the config boundary this branch may not
 * cross (`apps/qntm-md/config/` and `config/` are read-only). `scripts/resolution-agreement.py`
 * (run on a machine with the monorepo checked out — never by this test, never by CI) imports
 * `_DEFAULT_ORDERING`/`_PRIORITY_RANK` LIVE from `qntm_md.render.section_builder` — not a second
 * transcription, the actual runtime objects the renderer sorts by — and REFUSES to write
 * `tests/fixtures/resolution-agreement.json` at all if they disagree with what THAT run's
 * `presentation.json` publishes (see that script's own "REFUSING" block). This test is the
 * SECOND, INDEPENDENT half: it reads the COMMITTED fixture and the COMMITTED `presentation.json`
 * and asserts they still agree — so a change to EITHER file alone (an engine constant edited
 * without regenerating the fixture, or `presentation.json` regenerated from a stale
 * `compile-resolution.mjs`) is caught here even without re-running the Python side.
 *
 * WHAT THIS DOES NOT PROVE: that the ENGINE's live behaviour still matches `_DEFAULT_ORDERING`
 * (i.e. that `_section_order_key` still reads that exact constant) — that is a claim about
 * `section_builder.py`'s own internal wiring, unconfirmed by this file, stated as such in the
 * PR's own report.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readConfigResolutionDeclaration } from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (path) => JSON.parse(readFileSync(resolve(HERE, path), "utf8"));

const SERVED = read("../presentation.json");
const TRUTH = read("./fixtures/resolution-agreement.json");
const RESOLUTION = readConfigResolutionDeclaration(SERVED).resolution;

describe("1. defaultOrdering — the browser's published tuple equals a LIVE import of the engine's own", () => {
  test("field-for-field, direction-for-direction, in the engine's own order", () => {
    assert.deepEqual(RESOLUTION.defaultOrdering, TRUTH.defaultOrdering);
  });

  test("positive control: the fixture actually carries three keys, not an empty/trivial answer", () => {
    assert.equal(TRUTH.defaultOrdering.length, 3, "a comparison against an empty tuple would prove nothing");
  });

  test("the operator's own characterisation, corrected: it is NOT bare alphabetical — due_date and priority outrank title", () => {
    assert.equal(TRUTH.defaultOrdering[0].field, "due_date", "the FIRST key is due_date, not title");
    assert.equal(TRUTH.defaultOrdering[1].field, "priority", "the SECOND key is priority, not title");
    assert.equal(TRUTH.defaultOrdering[2].field, "title", "title is only the THIRD key — the final tiebreak");
  });
});

describe("2. priorityRank — the browser's published rank table equals a LIVE import of the engine's own", () => {
  test("every name, every number", () => {
    assert.deepEqual(RESOLUTION.priorityRank, TRUTH.priorityRank);
  });

  test("positive control: 'normal' and 'medium' really do share one rank in the engine's own dict", () => {
    // Four numbers for five names — if this ever measured five distinct numbers, the operator's
    // own config comment (and this file's own header) would need correcting, not silently kept.
    assert.equal(TRUTH.priorityRank.normal, TRUTH.priorityRank.medium);
    assert.equal(new Set(Object.values(TRUTH.priorityRank)).size, 4);
    assert.equal(Object.keys(TRUTH.priorityRank).length, 5);
  });

  test("priority is DESCENDING — urgent (4) outranks low (1), and defaultOrdering says so", () => {
    const priorityKey = RESOLUTION.defaultOrdering.find((k) => k.field === "priority");
    assert.ok(priorityKey, "priority is not one of the published default-ordering keys");
    assert.equal(priorityKey.direction, "desc");
    assert.ok(TRUTH.priorityRank.urgent > TRUTH.priorityRank.low);
  });
});

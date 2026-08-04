/**
 * THE LAYER IS AN INPUT DIMENSION, NOT AN OUTPUT KEY — the compiled declaration is flat.
 *
 *   node --test tests/declaration-layer-is-flattened.test.mjs
 *
 * `docs/architecture/capabilities.yaml`'s `the-cascade-resolves-into-per-section-answers-not-a-
 * layer-key` capability: the cascade (global -> view -> section -> node type -> line) is an AXIS
 * every config type is read THROUGH, resolved away by the time it reaches the browser. The
 * compiled declaration answers
 * per SECTION — `structural.sections`, `qualification.sections`/`sectionOrder`,
 * `resolution.sectionRegistration` — and carries no literal `global` key and no literal `view` key
 * anywhere in any of the four compiled sections, because a per-section answer already has the
 * cascade folded into it. Nothing enforced that shape before this file existed: a generator could
 * start emitting a `global` or a `view` key tomorrow — reintroducing the cascade as an OUTPUT
 * concept rather than an INPUT one — and nothing in this repo would say so.
 *
 * WHY THE COMMITTED presentation.json AND NOT A FRESH GENERATE. This file asserts a SHAPE
 * property, not a content property — it does not care what the operator's config says, only that
 * whatever the generators emit never surfaces the layer as a key. The committed artifact is what
 * the browser actually loads (CI already refuses to ship one stale against a fresh build —
 * `.github/workflows/build.yml`), so a shape defect here is a shape defect the browser would
 * receive. Reading the committed file needs no monorepo checkout, so — unlike the four
 * monorepo-comparison suites in this repo that skip in CI and can only fail locally — this file
 * runs, and can fail, in CI on every push.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..");
const DECLARATION = JSON.parse(readFileSync(resolve(REPO, "presentation.json"), "utf8"));

/** Every key found anywhere in `value`, however deeply nested — arrays walked, not keyed. */
function everyKey(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) everyKey(item, out);
  } else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      out.push(key);
      everyKey(v, out);
    }
  }
  return out;
}

describe("the layer is resolved away by compile time, never a key in the output", () => {
  for (const section of ["structural", "qualification", "resolution", "rules"]) {
    test(`presentation.json's '${section}' key carries no literal "global" or "view" key, anywhere in its tree`, () => {
      const keys = everyKey(DECLARATION[section]);
      assert.ok(!keys.includes("global"), `found a literal "global" key inside '${section}' — the layer leaked into the output`);
      assert.ok(!keys.includes("view"), `found a literal "view" key inside '${section}' — the layer leaked into the output`);
    });
  }

  test("structural answers per section (`sections`), not per layer", () => {
    assert.ok("sections" in DECLARATION.structural, "structural is missing 'sections'");
  });

  test("qualification answers per section (`sections`, `sectionOrder`), not per layer", () => {
    assert.ok("sections" in DECLARATION.qualification, "qualification is missing 'sections'");
    assert.ok("sectionOrder" in DECLARATION.qualification, "qualification is missing 'sectionOrder'");
  });

  test("resolution answers per section (`sectionRegistration`), not per layer", () => {
    assert.ok("sectionRegistration" in DECLARATION.resolution, "resolution is missing 'sectionRegistration'");
  });
});

/**
 * global_defaults.yaml IS LIVE IN THE ENGINE AND SILENT IN THE BROWSER — A TRIPWIRE, NOT A FIX.
 *
 *   node --test tests/global-defaults-does-not-reach-the-browser.test.mjs
 *
 * `docs/architecture/capabilities.yaml`'s `the-cascade-resolves-into-per-section-answers-not-a-
 * layer-key` capability, correcting a claim carried into this project's own conversation:
 * `global_defaults.yaml` is wired end to end in the monorepo's Python engine
 * (`bundle/loader.py:431-432,574-592`, `io/applier.py:4080-4156` — read-only, verified this pass)
 * but NONE of this repo's four browser-facing generators
 * (`generate-qualification-declaration.mjs`, `generate-resolution-declaration.mjs`,
 * `generate-structural-declaration.mjs`, `generate-rules-declaration.mjs`) reads it — only
 * `scripts/resolution-agreement.py`, a verification script, does. That is a SKEW, not a bug: the
 * day the operator declares a real global default, the engine applies it immediately and the
 * browser stays silent about it, with no error and no drop, because nothing in its compile path
 * so much as opens the file.
 *
 * THIS FILE DOES NOT CLOSE THE SKEW — closing it is a design decision about whether and how the
 * browser should learn GLOBAL-layer defaults, out of this branch's scope (documentation and
 * declarations only). It PINS the current, deliberate half of it: nobody may make a generator
 * start reading `global_defaults.yaml` BY ACCIDENT, as a side effect of some other change. If a
 * generator ever needs to, this test is what turns that into a decision instead of a silent
 * drift, and updating it is a one-line edit alongside whatever change closes the skew on purpose.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..");

const GENERATORS = [
  "scripts/generate-qualification-declaration.mjs",
  "scripts/generate-resolution-declaration.mjs",
  "scripts/generate-structural-declaration.mjs",
  "scripts/generate-rules-declaration.mjs",
];

for (const rel of GENERATORS) {
  test(`${rel} does not reference global_defaults`, () => {
    // Read as a Buffer, not text — a NUL byte cannot make this silently pass the way plain
    // `grep` (without `-a`) has silently skipped a real file in this repo before
    // (`tests/no-nul-bytes.test.mjs`'s own reason for existing). `Buffer#includes` is a byte
    // search; it does not stop at the first NUL the way a naive text scan can.
    const source = readFileSync(resolve(REPO, rel));
    assert.ok(
      !source.includes("global_defaults"),
      `${rel} now references global_defaults.yaml — the browser/engine skew this test pins has ` +
        "changed (intentionally, one hopes); update or remove this test alongside whatever change closed it",
    );
  });
}

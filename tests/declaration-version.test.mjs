/**
 * THE VERSION KEY — a compiled declaration's identity, and the arithmetic it rests on.
 *
 *   node --test tests/declaration-version.test.mjs
 *
 * THREE THINGS THIS SUITE PROVES, IN ORDER.
 *
 *   1. `sha256Hex` IS REALLY SHA-256. `scripts/declaration-version.mjs`'s own header explains why
 *      it is a hand transcription rather than `crypto.subtle.digest` (that Promise would put
 *      `compile()` — a synchronous function on both the CLI's `--check` and the Worker's Gate 1
 *      critical paths — one asynchronous turn later than it has ever been). A hand-transcribed
 *      digest is only worth having if it agrees with the sha256 the rest of the world computes —
 *      §1 below is the same falsifier `tests/present-base.test.mjs` already applies to the
 *      TypeScript transcription of the identical algorithm, run again here because this is a
 *      second, independent transcription for the Node/Worker side of the repo.
 *   2. `canonicalize`/`canonicalJSON` MAKE THE KEY INSENSITIVE TO OBJECT KEY ORDER, PROVABLY, NOT
 *      MERELY OBSERVED TO AGREE WITH `compile()`'s OWN SORTED CONSTRUCTION TODAY.
 *   3. `versionKey` HAS THE TWO PROPERTIES DETERMINISM EXISTS FOR — same input, same key; a single
 *      changed value, a different key — first as a small, exact unit case, then (in
 *      `worker-config-compile.test.mjs` §5) driven through the real Worker route against real
 *      generator fixtures, so the property is proven at both grains.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { sha256Hex, canonicalize, canonicalJSON, versionKey } from "../scripts/declaration-version.mjs";

const SOURCE_URL = new URL("../scripts/declaration-version.mjs", import.meta.url);

describe("1. sha256Hex agrees with node's own sha256, including the padding boundaries", () => {
  const nodeSha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
  const hex = (text) => sha256Hex(new TextEncoder().encode(text));

  test("every case agrees with node's own sha256", () => {
    const cases = [
      "",
      "a",
      '{"declaration":{},"dropped":{}}',
      // MULTI-BYTE, because a declaration's own text (a section name, a rule's own sentence in
      // `dropped`) is full of it.
      "é 🆕 2026-08-03 ✅ 🛫",
      // 55/56 and 63/64/65 are where sha256's padding gains a block. A transcription error hides
      // everywhere except here — the same boundary set `tests/present-base.test.mjs` checks for
      // the TypeScript transcription of this identical algorithm.
      ..."x".repeat(70).split("").map((_, i) => "x".repeat(i + 20)),
      "y".repeat(1000),
    ];
    for (const text of cases) {
      assert.equal(hex(text), nodeSha256(text), `disagreed with node's sha256 at ${text.length} chars`);
    }
  });
});

describe("2. canonicalize/canonicalJSON — key order cannot change the key", () => {
  test("object keys are sorted, recursively", () => {
    const a = { b: 1, a: { d: 2, c: 3 } };
    const b = { a: { c: 3, d: 2 }, b: 1 };
    assert.equal(canonicalJSON(a), canonicalJSON(b));
    assert.deepEqual(canonicalize(a), canonicalize(b));
  });

  test("array order is left exactly alone — an array's order is meaning in this repo, not incidental", () => {
    const forward = { edgeTypes: ["A", "B"] };
    const backward = { edgeTypes: ["B", "A"] };
    assert.notEqual(canonicalJSON(forward), canonicalJSON(backward));
  });

  test("primitives and null pass through unchanged", () => {
    assert.equal(canonicalJSON(null), "null");
    assert.equal(canonicalJSON(42), "42");
    assert.equal(canonicalJSON("x"), '"x"');
    assert.equal(canonicalJSON(true), "true");
  });
});

describe("3. versionKey — the two properties determinism exists for, at the unit grain", () => {
  test("names its algorithm, so a later one can be told apart from it", () => {
    assert.match(versionKey({ declaration: {}, dropped: {} }), /^sha256-[0-9a-f]{64}$/);
  });

  test("SAME CONFIG, SAME KEY: two calls over the identical compiled shape agree, key order included", () => {
    const compiledA = { declaration: { indent: { edgeType: "PART_OF" }, sections: {} }, dropped: {} };
    const compiledB = {
      // The identical facts, spelled with the object's own keys in the opposite order — a files
      // map POSTed as JSON has no guarantee of matching another caller's own construction order.
      dropped: {},
      declaration: { sections: {}, indent: { edgeType: "PART_OF" } },
    };
    assert.equal(versionKey(compiledA), versionKey(compiledB));
  });

  test("CHANGED CONFIG, DIFFERENT KEY: one changed value anywhere in declaration flips the key", () => {
    const before = versionKey({ declaration: { indent: { edgeType: "PART_OF" } }, dropped: {} });
    const after = versionKey({ declaration: { indent: { edgeType: "UNLOCKS" } }, dropped: {} });
    assert.notEqual(before, after);
  });

  test("CHANGED DROPPED, DIFFERENT KEY: dropped is part of what is versioned, not incidental logging", () => {
    // `design-config-is-content.md` §5.3's own receipt delta treats `dropped` as user-facing —
    // this is that decision, made concrete: a declaration that stops (or starts) dropping
    // something, with its OWN published fields unchanged, is still a real change of version.
    const same = { indent: { edgeType: "PART_OF" } };
    const before = versionKey({ declaration: same, dropped: {} });
    const after = versionKey({ declaration: same, dropped: { "views/main.yaml": "no top-level view key" } });
    assert.notEqual(before, after);
  });

  test("NEVER A CLOCK OR A COUNTER — imports nothing that could reach one", () => {
    // `design-the-runtime-compile.md` §8 step A: determinism is the whole point. A module that
    // imported node:fs, a clock, or a random source could not be trusted to answer identically
    // twice; checked here the same way `ledger.mjs`'s own zero-import claim is checked, by
    // reading the file rather than trusting its header's prose.
    const source = readFileSync(SOURCE_URL, "utf8");
    const imports = source.split("\n").filter((line) => /^\s*import\b/.test(line));
    assert.deepEqual(imports, [], `declaration-version.mjs imports something: ${imports.join(" | ")}`);
  });
});

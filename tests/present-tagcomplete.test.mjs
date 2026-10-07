// Tag completion (2026-10-07): the vocabulary comes from the published config, and the caret
// decides which `#word` is being completed.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { applyTag, matchingTags, tagQueryAt, tagVocabulary } from "../dist/present.js";

const SOURCES = {
  qualification: { tokens: { node_type: { "#task": "task", "#outcome": "outcome" }, domain: { "#work": "work" }, status: { "[ ]": "open" } } },
  resolution: { tagOrder: { canonicalOrder: ["#outcome", "#waiting-for", "#task"] } },
};

describe("tagVocabulary", () => {
  test("merges both published sources, canonical order first, no duplicates, tags only", () => {
    assert.deepEqual(tagVocabulary(SOURCES), ["#outcome", "#waiting-for", "#task", "#work"]);
  });
  test("an empty declaration offers nothing", () => {
    assert.deepEqual(tagVocabulary({}), []);
  });
  test("the real published config offers the operator's tags, including edge tags", () => {
    const declaration = JSON.parse(readFileSync(new URL("../presentation.json", import.meta.url), "utf8"));
    const vocab = tagVocabulary(declaration);
    for (const tag of ["#task", "#outcome", "#work", "#waiting-for", "#account-opening"]) {
      assert.ok(vocab.includes(tag), `${tag} missing`);
    }
  });
});

describe("tagQueryAt", () => {
  test("the caret after `#wo` asks for `wo`", () => {
    assert.deepEqual(tagQueryAt("Call Bob #wo", 12), { start: 9, end: 12, prefix: "wo" });
  });
  test("a bare `#` asks for everything", () => {
    assert.deepEqual(tagQueryAt("Call Bob #", 10), { start: 9, end: 10, prefix: "" });
  });
  test("outside a `#word` there is no query", () => {
    assert.equal(tagQueryAt("Call Bob #work now", 18), null);
    assert.equal(tagQueryAt("no tag here", 5), null);
  });
  test("a `#` inside a word is not a tag", () => {
    assert.equal(tagQueryAt("issue#12", 8), null);
  });
});

describe("matchingTags and applyTag", () => {
  const vocab = tagVocabulary(SOURCES);
  test("prefix matches come first, then contains matches", () => {
    assert.deepEqual(matchingTags(vocab, { start: 0, end: 2, prefix: "t" }), ["#task", "#outcome", "#waiting-for"]);
  });
  test("taking a tag replaces the word and leaves the caret after a space", () => {
    const query = tagQueryAt("Call Bob #wo", 12);
    assert.deepEqual(applyTag("Call Bob #wo", query, "#work"), { text: "Call Bob #work ", caret: 15 });
  });
  test("taking a tag mid-line keeps the rest of the line", () => {
    const query = tagQueryAt("Call #wo Bob", 8);
    assert.deepEqual(applyTag("Call #wo Bob", query, "#work"), { text: "Call #work Bob", caret: 11 });
  });
});

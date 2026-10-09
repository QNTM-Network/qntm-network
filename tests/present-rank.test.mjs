// One ranking for every list (2026-10-09, backlog row one-ranking-for-every-list). Every list —
// `/` search, `[[` suggestions, the Views filter, `#` tags, `:` markers — matches and orders through
// app/present/rank.ts, which orders with the same comparator as section ordering.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  compareByKeys,
  DEFAULT_RANK_POLICIES,
  linkTargets,
  matchingTags,
  matchQuality,
  rank,
  searchViews,
} from "../dist/present.js";

const STATUSES = { "[ ]": "open", "[x]": "done", "[>]": "scheduled", "[/]": "in_progress" };
const VIEWS = [
  {
    id: "everything",
    title: "Everything Work",
    path: "work/everything.md",
    markdown: [
      "## Work",
      "- [x] Get back to Jason [[qntm:1]] #task ✅ 2026-09-08",
      "- [x] Charlotte to come back to Jason [[qntm:2]] #task",
      "- [ ] Chris to talk to Jason [[qntm:3]] #task",
      "- [>] Jason review [[qntm:4]] #task ⏳ 2026-10-12",
    ].join("\n"),
  },
  {
    id: "tasks",
    title: "Work Tasks",
    path: "work/tasks.md",
    markdown: ["## Work Tasks", "- [/] Jason contract [[qntm:5]] #task #work"].join("\n"),
  },
];
const titles = (hits) => hits.map((h) => h.title || h.text);

test("match quality: starts with > every word starts a word > in the title > only elsewhere > none", () => {
  const item = { title: "Get back to Jason", also: "#task #work" };
  assert.equal(matchQuality(item, "get back"), 3);
  assert.equal(matchQuality(item, "jas back"), 2);
  assert.equal(matchQuality(item, "ason"), 1);
  assert.equal(matchQuality(item, "jason work"), 0);
  assert.equal(matchQuality(item, "zebra"), null);
  assert.equal(matchQuality(item, "  "), 3, "an empty query matches everything equally");
});

test("search: open work first, done last — the operator's 'jason' search, 2026-10-09", () => {
  const hits = searchViews(VIEWS, "jason", { statuses: STATUSES });
  assert.deepEqual(titles(hits), [
    "Chris to talk to Jason", // open
    "Jason contract", // in progress
    "Jason review", // scheduled
    "Get back to Jason", // done
    "Charlotte to come back to Jason", // done
  ]);
});

test("search: views, then sections, then tasks — unchanged", () => {
  const hits = searchViews(VIEWS, "work", { statuses: STATUSES });
  assert.deepEqual([...new Set(hits.map((h) => h.kind))], ["view", "section", "task"]);
});

test("a demoted view's hits sort last but stay listed", () => {
  const policy = { ...DEFAULT_RANK_POLICIES.search, demote: ["*/everything*"] };
  const hits = searchViews(VIEWS, "jason", { statuses: STATUSES, policy });
  assert.equal(hits[0].title, "Jason contract", "the one task outside Everything comes first");
  assert.equal(hits.length, 5, "nothing is hidden");
});

test("[[: title matches only, open first", () => {
  assert.deepEqual(titles(linkTargets(VIEWS, "jason", { statuses: STATUSES })).slice(0, 2), [
    "Chris to talk to Jason",
    "Jason contract",
  ]);
});

test("tags: a name that starts with the query before one that contains it, then config order", () => {
  const vocab = ["#task", "#outcome", "#waiting-for", "#work"];
  assert.deepEqual(matchingTags(vocab, { start: 0, end: 2, prefix: "t" }), ["#task", "#outcome", "#waiting-for"]);
  assert.deepEqual(matchingTags(vocab, { start: 0, end: 1, prefix: "" }), vocab, "an empty query lists every tag in config order");
});

test("a key with a declared `order` ranks by that order; `*` stands for every value not named", () => {
  const items = ["done", "waiting", "open", "custom"].map((status, i) => ({ status, title: `t${i}` }));
  const policy = { keys: [{ field: "status", order: ["open", "*", "done"] }, { field: "position" }] };
  assert.deepEqual(rank(items, (x) => x, "", policy).map((x) => x.status), ["open", "waiting", "custom", "done"]);
});

test("one comparator: present before absent whatever the direction; strings by code point", () => {
  const present = [{ tier: 0, value: "b" }];
  const absent = [{ tier: 1, value: "" }];
  assert.equal(compareByKeys(present, absent, [{ direction: "desc" }]) < 0, true);
  assert.equal(compareByKeys([{ tier: 0, value: "a" }], present, [{ direction: "desc" }]) > 0, true);
  // U+1F600 is above U+FFFF; JavaScript's `<` on code units would put it before U+FF5E.
  assert.equal(compareByKeys([{ tier: 0, value: "\u{1F600}" }], [{ tier: 0, value: "～" }], [{}]) > 0, true);
});

test("no list ranks by itself — every list calls rank()", () => {
  const read = (p) => readFileSync(new URL(`../app/${p}`, import.meta.url), "utf8");
  for (const file of ["present/search.ts", "shell/drawer.ts", "present/tagcomplete.ts", "present/markercomplete.ts"]) {
    const source = read(file);
    assert.match(source, /\brank\(/, `${file} does not rank through rank.ts`);
    assert.doesNotMatch(source, /\.sort\(\(a, b\)/, `${file} sorts by a rule of its own`);
  }
  assert.match(read("present/arrange/ordering.ts"), /compareByKeys\(/, "section ordering has its own comparator again");
});

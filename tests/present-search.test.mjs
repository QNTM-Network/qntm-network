// Search across views (2026-10-07): each matching task once, in the view it is found in first.

import { test } from "node:test";
import assert from "node:assert/strict";

import { searchViews, ModeSurface } from "../dist/present.js";

const VIEWS = [
  { id: "inbox", title: "Inbox", markdown: "## Inbox\n- [ ] Call Bob about trading acc [[qntm:1]] #task\n- [ ] Pay rent [[qntm:2]] #task" },
  { id: "daily", title: "Daily", markdown: "## Today\n- [>] Call Bob about trading acc [[qntm:1]] #task ⏳ 2026-10-08\n- [ ] Book flights [[qntm:3]] #task" },
];

test("every word must match, case-insensitive, any order", () => {
  assert.deepEqual(searchViews(VIEWS, "bob TRADING").map((h) => h.qntmId), ["1"]);
  assert.deepEqual(searchViews(VIEWS, "trading zebra"), []);
});

test("a task in many views is one result, from the first view it is in", () => {
  const hits = searchViews(VIEWS, "call");
  assert.equal(hits.length, 1);
  assert.deepEqual([hits[0].viewId, hits[0].lineIndex], ["inbox", 1]);
});

test("the current view is preferred, so the jump stays where you are", () => {
  const hits = searchViews(VIEWS, "call", { prefer: "daily" });
  assert.deepEqual([hits[0].viewId, hits[0].lineIndex], ["daily", 1]);
});

test("the shown text drops the checkbox and the id", () => {
  assert.equal(searchViews(VIEWS, "flights")[0].text, "Book flights #task");
});

test("a heading is a SECTION result, marked as one; an empty query finds nothing (2026-10-08)", () => {
  const hits = searchViews(VIEWS, "today");
  assert.ok(hits.length > 0 && hits.every((h) => h.kind === "section" || h.kind === "view"));
  assert.deepEqual(searchViews(VIEWS, "   "), []);
});

test("a view's title is a VIEW result, and views come before sections and tasks", () => {
  const views = [
    { id: "work-daily", title: "Work Daily", markdown: "# Work\n## Work Capture\n- [ ] Work out plan [[qntm:9]] #task" },
  ];
  const hits = searchViews(views, "work");
  assert.deepEqual(hits.map((h) => h.kind), ["view", "section", "task"]);
});

test("/ asks for the search box", () => {
  assert.equal(new ModeSurface().handleKey("/", 0, 3).effect.kind, "search");
});

test("a view is found by any folder on its path, at any depth (2026-10-08)", () => {
  const views = [{ id: "work-outcomes-all", title: "All", path: "work/outcomes/all.md", markdown: "# All" }];
  const hits = searchViews(views, "work outcomes");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "view");
  assert.equal(hits[0].text, "work / outcomes › All");
});

test("each task hit carries its status from the declared glyphs, and its engine title (2026-10-09)", () => {
  const statuses = { "[ ]": "open", "[x]": "done", "[>]": "scheduled" };
  const views = [{ id: "v", title: "V", markdown: [
    "- [x] Book flights [[qntm:7]] #task ✅ 2026-10-01",
    "- [>] Book hotel [[qntm:8]] #task ⏳ 2026-10-12",
    "- [ ] Book car [[qntm:9]] #task",
  ].join("\n") }];
  const hits = searchViews(views, "book", { statuses });
  assert.deepEqual(hits.map((h) => [h.title, h.status]), [["Book flights", "done"], ["Book hotel", "scheduled"], ["Book car", "open"]]);
  // Without the table a `[>]` line is still found; it just has no checkbox status.
  assert.equal(searchViews(views, "hotel")[0].qntmId, "8");
});

test("search has no line reader of its own — it reads through rendition.ts", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../app/present/search.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /qntm:\(\\d\+\)\\\]\\\]/, "a stamp regex is back in search.ts");
  assert.doesNotMatch(source, /#\{2,6\}/, "a heading regex is back in search.ts");
  assert.doesNotMatch(source, /- \\\[\.\\\]/, "a checkbox regex is back in search.ts");
});

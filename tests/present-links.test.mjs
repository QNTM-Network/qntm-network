// `[[` links (2026-10-08, operator-asked: "make [[]] be able to actually select and filter through
// and click into nodes"). The suggestions and the click both read the same search `/` runs.

import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanTitleFor, findLinkTarget, linkQueryAt, linkSource, linkTargets, ModeSurface } from "../dist/present.js";

const VIEWS = [
  {
    id: "habits",
    title: "Habits",
    path: "structure/habits.md",
    markdown: [
      "## Habits",
      "- [ ] Become an early riser [[qntm:4762]] #habit #structure",
      "    - [ ] Wake at 7:30 [[qntm:4763]] #habit ⏳ 2026-10-09",
    ].join("\n"),
  },
  {
    id: "work",
    title: "Work Tasks",
    path: "work/tasks.md",
    markdown: ["## Work Tasks", "- [ ] Send the risk note to Christen [[qntm:9]] #task #work 📅 2026-10-09"].join("\n"),
  },
];

test("an open [[ before the caret is a query; a closed one is not", () => {
  assert.deepEqual(linkQueryAt("see [[ear", 9), { start: 4, query: "ear" });
  assert.equal(linkQueryAt("see [[Early]] now", 17), null);
  assert.equal(linkQueryAt("no link here", 5), null);
});

test("a link's title is the engine's title — cleanTitleFor, not a reader of search's own", () => {
  const title = (line) => linkTargets([{ id: "v", markdown: line }], "a")[0]?.title;
  for (const line of [
    "- [ ] Become an early riser [[qntm:1]] #habit #structure",
    "- [ ] Send a note #task #work 📅 2026-10-09 [[qntm:2]]",
    "- [ ] Wake at 7:30 [[qntm:3]] #habit ⏳ 2026-10-09",
  ]) {
    assert.equal(title(line), cleanTitleFor(line).text, line);
  }
  // A tag in the middle of a title is cut out, as the engine cuts it — the old reader stopped there.
  assert.equal(title("- [ ] Call #work Alan back [[qntm:4]]"), "Call Alan back");
});

test("[[ suggests tasks from every view, and choosing one writes [[Title]]", () => {
  const source = linkSource(() => VIEWS, () => "work");
  const offer = source("- [ ] Plan #task [[early", 24);
  assert.ok(offer !== null);
  assert.equal(offer.start, 17);
  assert.deepEqual(offer.items.map((i) => i.insert), ["[[Become an early riser]]"]);
  // A ]] already after the caret is part of what the link replaces.
  assert.equal(source("x [[risk]]", 8).end, 10);
  // An empty query offers nothing, so typing [[ alone does not open a list of everything.
  assert.equal(source("x [[", 4), null);
});

test("a link is suggested by its title, not by a link on its line", () => {
  const views = [{ id: "w", title: "W", markdown: [
    "- [ ] Compliance to come back [[qntm:1]] #task #unlocks [[Revert to George]]",
    "- [ ] Revert to George [[qntm:2]] #task",
  ].join("\n") }];
  assert.deepEqual(linkTargets(views, "revert").map((h) => h.title), ["Revert to George"]);
});

test("each title is offered once, best first", () => {
  const doubled = [...VIEWS, { ...VIEWS[0], id: "all", title: "All" }];
  assert.equal(linkTargets(doubled, "riser").length, 1);
});

test("a link finds its task by exact title, or by id; nothing else matches", () => {
  assert.deepEqual(
    [findLinkTarget(VIEWS, "Become an early riser")?.viewId, findLinkTarget(VIEWS, "Become an early riser")?.lineIndex],
    ["habits", 1],
  );
  assert.equal(findLinkTarget(VIEWS, "become AN early riser")?.qntmId, "4762");
  assert.equal(findLinkTarget(VIEWS, "qntm:4763")?.lineIndex, 2);
  assert.equal(findLinkTarget(VIEWS, "Become an early"), null, "a prefix is not the title");
  assert.equal(findLinkTarget(VIEWS, "Nothing like this"), null);
});

test("the mode says when it changes, so the badge and the touch bar cannot fall behind", () => {
  const mode = new ModeSurface();
  const seen = [];
  mode.onChange((m) => seen.push(m));
  mode.enterInsert();
  mode.enterInsert();
  mode.enterNormal();
  assert.deepEqual(seen, ["INSERT", "NORMAL"]);
});

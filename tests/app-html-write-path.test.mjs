/**
 * THE WRITE PATH, THROUGH app.html'S OWN CODE — not through a reconstruction of it.
 *
 *   node --test tests/app-html-write-path.test.mjs
 *
 * The other two suites prove things about app/present/. This one proves the thing that actually
 * matters to a person using the app, and it proves it about THE PAGE: click a checkbox and the
 * file that gets POSTed is the file you started with, with exactly one character different.
 *
 * WHY IT GOES TO THIS TROUBLE. app.html is a hand-authored page outside every enforcer this repo
 * has — outside the capture filter, outside tsconfig, outside the bundle. A test that copied its
 * wiring into a fixture and then tested the fixture would pass forever while the page rotted. So
 * tests/fixtures/app-html-page.mjs lifts the page's real `<script type="module">` and runs it;
 * every line of logic under test is the line that ships. The lifting moved into that fixture at
 * migration stage 2, when a second suite needed the same page — one extractor, not two.
 *
 * THE PROPERTY. The app posts the WHOLE FILE for one view and the server overwrites it. So the
 * question is never "did the checkbox change" — it is "what did the other 40 lines of the file
 * turn into on the way". A lossy round trip here does not corrupt one title; it rewrites a view.
 * Assert 3 below is the one that would catch that, and it is deliberately an assertion about
 * every line rather than about the line that changed.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

import { importPage, installBrowser, makeWorkDir, walk } from "./fixtures/app-html-page.mjs";

const WORK = makeWorkDir("app-html-write-path");

// A view with the shape the real ones have: headings, nested tasks, prose, a table, and lines
// carrying wiki-links, tags and markers — the characters that must survive a round trip.
const VIEW = {
  id: "this-week",
  path: "work/outcomes.md",
  title: "This Week",
  domain: "work",
  markdown: [
    "# This Week",
    "",
    "## Overdue",
    "- [ ] Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29",
    "    - [ ] sub-step one [[qntm:122]] #task 🛫 2026-07-28",
    "- [x] Already done [[qntm:123]] #task ✅ 2026-07-27",
    "",
    "## Due This Week",
    "Some prose with **bold** and `code`.",
    "| a | b |",
    "| --- | --- |",
    "| 1 | 2 |",
    "",
    "- [ ] Last one [[qntm:124]] #task #home 📅 2026-08-01",
    "",
  ].join("\n"),
};

let page;
let elements;
let posted;

before(async () => {
  ({ elements } = installBrowser());
  globalThis.fetch = async (url, init) => {
    posted = { url, body: JSON.parse(init.body) };
    // Answer with a snapshot shaped like the Worker's, carrying the file we were just sent —
    // which is what makes the page's re-paint after a save part of what this exercises.
    return {
      ok: true,
      json: async () => ({
        ok: true,
        handle: "luke",
        pending_edits: 1,
        snapshot: {
          generated_at: "2026-07-30T12:00:00Z",
          views: [{ ...VIEW, markdown: posted.body.markdown }],
        },
      }),
    };
  };
  page = await importPage(WORK);
  page.__setGraphData({ snapshot: { generated_at: "2026-07-30T12:00:00Z", views: [VIEW] } });
});

describe("app.html's own write path", () => {
  test("the page paints the view through the presentation bundle", () => {
    page.paintView("this-week");
    const body = elements.get("viewBody");
    const boxes = walk(body).filter((el) => el.type === "checkbox");
    assert.equal(boxes.length, 4, "the page did not paint every task line");
    assert.ok(
      walk(body).some((el) => el.tagName === "h2"),
      "the page did not paint the demoted headings",
    );
  });

  test("ticking a box posts the whole file to the write endpoint", async () => {
    page.paintView("this-week");
    const box = walk(elements.get("viewBody")).find((el) => el.type === "checkbox");
    box.checked = true;
    box.dispatch("change");
    await new Promise((r) => setImmediate(r));

    assert.ok(posted, "no request was made");
    assert.ok(posted.url.endsWith("/app/edit-file"), `posted to ${posted.url}`);
    assert.equal(posted.body.path, "work/outcomes.md");
    assert.equal(typeof posted.body.markdown, "string");
  });

  test("the posted markdown is the source with exactly one character different", async () => {
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
    page.paintView("this-week");
    const box = walk(elements.get("viewBody")).find((el) => el.type === "checkbox");
    box.checked = true;
    box.dispatch("change");
    await new Promise((r) => setImmediate(r));

    const before = VIEW.markdown.split("\n");
    const after = posted.body.markdown.split("\n");

    // THE WHOLE FILE, line for line. Not "the changed line is right" — every other line, byte
    // for byte, including the blank ones, the table, and every wiki-link, tag and marker.
    assert.equal(after.length, before.length, "the file gained or lost lines");
    assert.equal(posted.body.markdown.length, VIEW.markdown.length, "the file changed length");
    const changedLines = before.map((_, i) => i).filter((i) => before[i] !== after[i]);
    assert.deepEqual(changedLines, [3], "more than one line changed");

    // And within that one line, exactly one character, and it is the glyph.
    const [i] = changedLines;
    const changedChars = [...before[i]].map((_, j) => j).filter((j) => before[i][j] !== after[i][j]);
    assert.deepEqual(changedChars, [3]);
    assert.equal(before[i].slice(0, 6), "- [ ] ");
    assert.equal(after[i].slice(0, 6), "- [x] ");

    // The tokens the app shows as literal characters must still BE those characters.
    for (const token of ["[[qntm:121]]", "#task", "#work", "🆕 2026-07-29"]) {
      assert.ok(after[i].includes(token), `the round trip lost ${token}`);
    }
  });

  test("a nested task edits its own line and not its parent's", async () => {
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
    page.paintView("this-week");
    const box = walk(elements.get("viewBody")).filter((el) => el.type === "checkbox")[1];
    box.checked = true;
    box.dispatch("change");
    await new Promise((r) => setImmediate(r));

    const before = VIEW.markdown.split("\n");
    const after = posted.body.markdown.split("\n");
    const changed = before.map((_, i) => i).filter((i) => before[i] !== after[i]);
    assert.deepEqual(changed, [4]);
    assert.ok(after[4].startsWith("    - [x] "), "the indent did not survive the edit");
  });

  test("unticking is the same operation in reverse", async () => {
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
    page.paintView("this-week");
    const box = walk(elements.get("viewBody")).filter((el) => el.type === "checkbox")[2];
    assert.equal(box.checked, true, "the already-done task did not paint as checked");
    box.checked = false;
    box.dispatch("change");
    await new Promise((r) => setImmediate(r));

    const after = posted.body.markdown.split("\n");
    assert.equal(after[5], "- [ ] Already done [[qntm:123]] #task ✅ 2026-07-27");
  });
});

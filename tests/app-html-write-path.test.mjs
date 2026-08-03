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

import { importPage, installBrowser, makeEvent, makeWorkDir, walk } from "./fixtures/app-html-page.mjs";

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

/**
 * The clickable TEXT of the first TASK line.
 *
 * `walk(body).find((el) => el.tagName === "span")` used to be exactly this, and stopped being it
 * when the vim cursor's own line started rendering its source characters (app/present/paint.ts's
 * `normalLine`, three spans). `paintView` seeds the cursor to line 0, so the first span on the page
 * now belongs to the heading. A task's text span is the one carrying RENDERED markdown; the cursor
 * line's spans carry `textContent`. Selecting by that selects the thing these tests are about.
 */
const taskText = (body) => walk(body).find((el) => el.tagName === "span" && el.innerHTML !== "");

/**
 * Paint with the cursor parked on line 0 — the heading — so all four task lines paint as tasks.
 *
 * NOT COSMETIC, AND NOT A WORKAROUND. The cursor's own line renders its SOURCE in NORMAL as well as
 * INSERT (app/present/paint.ts), so WHICH line it is on decides which lines are widgets. `page`
 * holds one `FocusSurface` for the whole file, exactly as the real app holds one for the session,
 * so a test that just called `paintView` would be asserting against wherever the previous test left
 * the cursor. These tests are about clicking a TASK; this is them saying so.
 */
function paintParked() {
  page.__setFocus(0, VIEW.markdown);
  page.paintView("this-week");
}

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
    paintParked();
    const body = elements.get("viewBody");
    const boxes = walk(body).filter((el) => el.type === "checkbox");
    assert.equal(boxes.length, 4, "the page did not paint every task line");
    assert.ok(
      walk(body).some((el) => el.tagName === "h3"),
      "the page did not paint the demoted headings",
    );
    // AND LINE 0 IS THE CURSOR'S, SO IT SHOWS ITS SOURCE RATHER THAN ITS RENDITION. `paintView`
    // seeds the selection to line 0, and "cursor on the line → the line renders as its exact source
    // text" holds in NORMAL as well as INSERT. It used to paint an <h2> here; that was the defect.
    const raw = walk(body).filter((el) => String(el.className ?? "").split(/\s+/).includes("rawline"));
    assert.equal(raw.length, 1, "the selected line did not render as its source");
    assert.equal(
      raw[0].children.map((child) => child.textContent).join(""),
      "# This Week",
      "the selected line's characters are not the source's",
    );
    assert.equal(
      walk(body).filter((el) => el.tagName === "h2").length,
      0,
      "the line under the cursor still painted as a heading widget",
    );
  });

  test("ticking a box posts the whole file to the write endpoint", async () => {
    paintParked();
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
    paintParked();
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
    paintParked();
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
    paintParked();
    const box = walk(elements.get("viewBody")).filter((el) => el.type === "checkbox")[2];
    assert.equal(box.checked, true, "the already-done task did not paint as checked");
    box.checked = false;
    box.dispatch("change");
    await new Promise((r) => setImmediate(r));

    const after = posted.body.markdown.split("\n");
    assert.equal(after[5], "- [ ] Already done [[qntm:123]] #task ✅ 2026-07-27");
  });
});

describe("the tag chip, through the page (migration stage 8)", () => {
  /**
   * Drive `declaration` through the page's own reader, the way `loadPresentation()` drives the
   * fetched one.
   *
   * NOT A FETCH STUB, AND THAT IS NOW A CHOICE RATHER THAN A NECESSITY. This comment used to say
   * there was nothing left on the wire to intercept, because `loadPresentation` read a constant
   * baked into the bundle. That decision is reversed — the declaration is fetched from
   * `/presentation.json` again (design-config-is-content.md step 2, and see
   * `withDeclaration` in tests/fixtures/app-html-page.mjs for the stub that answers it). What this
   * suite is asking is still "does the DOCUMENT decide the chips", not "does the request arrive",
   * so it drives `__applyPresentation` — the exact function `loadPresentation` itself calls once
   * the bytes are in hand. The request half is proven in tests/present-global.test.mjs section 5.
   */
  function servePresentation(declaration) {
    page.__applyPresentation(declaration);
  }

  test("the served declaration decides whether the page paints chips at all", async () => {
    // THE PROOF THAT THIS IS ARCHITECTURE AND NOT A STYLESHEET, made against the page rather than
    // against a module: the same page, the same bundle, the same view, two documents on the wire.
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });

    await servePresentation({ checkbox: "wired", tags: "wired" });
    paintParked();
    const wired = walk(elements.get("viewBody")).filter((el) =>
      String(el.innerHTML).includes('class="tagchip"'),
    );
    assert.equal(wired.length, 4, "the page painted no chips against a declaration of wired");
    assert.match(wired[0].innerHTML, /<span class="tagchip">#task<\/span>/);

    await servePresentation({ checkbox: "wired", tags: "raw" });
    paintParked();
    const raw = walk(elements.get("viewBody"));
    assert.equal(
      raw.filter((el) => String(el.innerHTML).includes("tagchip")).length,
      0,
      "flipping the served declaration to raw left the chips on the page — the key is inert",
    );
    assert.ok(raw.some((el) => String(el.innerHTML).includes("#task")));
  });

  test("with chips painted, ticking a box still posts the source byte for byte", async () => {
    // THE SOURCE-STRING PROPERTY, UNDER THE ONE RENDITION THAT COULD BREAK IT. The page no longer
    // holds `#task` or `#work` as text anywhere — they are chips. So a posted file that still
    // carries them carries them because it came from the SOURCE, and a page-derived file could
    // not possibly reproduce them.
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
    await servePresentation({ checkbox: "wired", heading: "wired", prose: "wired", tags: "wired" });
    paintParked();
    posted = null;

    const box = walk(elements.get("viewBody")).find((el) => el.type === "checkbox");
    box.checked = true;
    box.dispatch("change");
    await new Promise((r) => setImmediate(r));

    const before = VIEW.markdown.split("\n");
    const after = posted.body.markdown.split("\n");
    assert.equal(posted.body.markdown.length, VIEW.markdown.length, "the file changed length");
    assert.deepEqual(before.map((_, i) => i).filter((i) => before[i] !== after[i]), [3]);
    assert.equal(after[3], "- [x] Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29");
    assert.ok(!posted.body.markdown.includes("tagchip"), "the app's own markup reached the vault");
  });

  test("with chips painted, editing a line posts the file with exactly that line replaced", async () => {
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
    await servePresentation({ checkbox: "wired", heading: "wired", prose: "wired", tags: "wired" });
    paintParked();
    posted = null;

    const body = elements.get("viewBody");
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    taskText(body).dispatch("click", makeEvent());
    page.__enterInsert();
    const editable = walk(body).find((el) => el.type === "text");
    assert.equal(editable.value, VIEW.markdown.split("\n")[3], "the cursor did not reach the source");
    editable.value = "- [ ] Draft the launch note [[qntm:121]] #task #home 🆕 2026-07-29";
    editable.dispatch("blur");
    await new Promise((r) => setImmediate(r));

    const before = VIEW.markdown.split("\n");
    const after = posted.body.markdown.split("\n");
    assert.deepEqual(before.map((_, i) => i).filter((i) => before[i] !== after[i]), [3]);
    for (let i = 0; i < before.length; i += 1) {
      if (i === 3) continue;
      assert.equal(after[i], before[i], `line ${i} moved and nobody edited it`);
    }
  });

  test("the page's posted file is immune to a corrupted DOM WITH the chips corrupted too", async () => {
    // The detector, aimed at the rendition where the DOM and the source really disagree. Every
    // chip on the page is replaced with something that is not a tag before the affordance is used.
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
    await servePresentation({ checkbox: "wired", heading: "wired", prose: "wired", tags: "wired" });
    paintParked();
    posted = null;

    const body = elements.get("viewBody");
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    taskText(body).dispatch("click", makeEvent());
    page.__enterInsert();
    for (const el of walk(body)) {
      if (String(el.innerHTML).includes("tagchip")) {
        el.innerHTML = '<span class="tagchip">#WRECKED</span>';
      }
    }
    const editable = walk(body).find((el) => el.type === "text");
    editable.value = "- [x] Draft the launch note [[qntm:121]] #task #work ✅ 2026-08-04";
    editable.dispatch("blur");
    await new Promise((r) => setImmediate(r));

    assert.ok(!posted.body.markdown.includes("WRECKED"), "the page rebuilt the file from the page");
    const before = VIEW.markdown.split("\n");
    const after = posted.body.markdown.split("\n");
    assert.deepEqual(before.map((_, i) => i).filter((i) => before[i] !== after[i]), [3]);
    // Every other line's tags came out of the SOURCE, which is the only place they still exist.
    assert.ok(after[5].includes("#task"), "a tag that was only ever a chip did not survive");
    assert.ok(after[13].includes("#task") && after[13].includes("#home"));
  });

  test("and the page is put back where the rest of this file expects it", async () => {
    // The page holds ONE presentation context and ONE focus surface for its lifetime. Restoring
    // silence is what keeps this describe from changing the meaning of every test above it.
    await servePresentation({});
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
    paintParked();
    const body = walk(elements.get("viewBody"));
    assert.equal(body.filter((el) => String(el.innerHTML).includes("tagchip")).length, 0);
    assert.equal(body.filter((el) => el.type === "checkbox").length, 4);
  });
});

describe("the cursor rule, through the page (migration stage 3)", () => {
  const line = (index) => VIEW.markdown.split("\n")[index];

  test("clicking a line's text shows its verbatim source, in an input, in the page", () => {
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
    paintParked();
    const body = elements.get("viewBody");
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    taskText(body).dispatch("click", makeEvent());
    page.__enterInsert();

    const editable = walk(body).filter((el) => el.type === "text");
    assert.equal(editable.length, 1, "the page has no focus surface — clicking a line did nothing");
    assert.equal(editable[0].value, line(3));
    assert.equal(
      walk(body).filter((el) => el.type === "checkbox").length,
      3,
      "focusing one line disturbed the other three",
    );
  });

  test("blur closes the input and posts nothing when nothing was typed", async () => {
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
    paintParked();
    const body = elements.get("viewBody");
    posted = null;
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    taskText(body).dispatch("click", makeEvent());
    page.__enterInsert();
    walk(body).find((el) => el.type === "text").dispatch("blur");
    await new Promise((r) => setImmediate(r));

    // THE INPUT IS GONE AND NOTHING WAS POSTED — the two facts this test has always been for.
    assert.equal(walk(body).filter((el) => el.type === "text").length, 0);
    assert.equal(posted, null, "leaving a line untouched posted the whole view");

    // IT USED TO ASSERT FOUR CHECKBOXES HERE, i.e. that the line went all the way back to its
    // rendition. It does not, and should not: `settle` returns this page to NORMAL rather than
    // blurring (motions.ts — vim always has a cursor on some line), and in NORMAL the cursor's line
    // shows its source. Three checkboxes is the OTHER three lines, untouched, which is the real
    // claim; the fourth is the line the cursor is still on.
    assert.equal(walk(body).filter((el) => el.type === "checkbox").length, 3);
    const raw = walk(body).filter((el) => String(el.className ?? "").split(/\s+/).includes("rawline"));
    assert.equal(raw.length, 1, "the line the cursor stayed on did not render as its source");
    assert.equal(
      raw[0].children.map((child) => child.textContent).join(""),
      VIEW.markdown.split("\n")[3],
      "and the characters it shows are not the source's",
    );
  });

  test("edit then blur posts the file with exactly that line replaced", async () => {
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
    paintParked();
    const body = elements.get("viewBody");
    posted = null;
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    taskText(body).dispatch("click", makeEvent());
    page.__enterInsert();
    const editable = walk(body).find((el) => el.type === "text");
    editable.value = "- [ ] Draft the launch note [[qntm:121]] #task #work 🛫 2026-08-04";
    editable.dispatch("blur");
    await new Promise((r) => setImmediate(r));

    assert.ok(posted, "no request was made");
    assert.ok(posted.url.endsWith("/app/edit-file"), `posted to ${posted.url}`);
    assert.equal(posted.body.path, "work/outcomes.md");

    const before = VIEW.markdown.split("\n");
    const after = posted.body.markdown.split("\n");
    assert.equal(after.length, before.length, "the file gained or lost lines");
    const changed = before.map((_, i) => i).filter((i) => before[i] !== after[i]);
    assert.deepEqual(changed, [3], "more than one line changed");
    assert.equal(after[3], "- [ ] Draft the launch note [[qntm:121]] #task #work 🛫 2026-08-04");
    for (let i = 0; i < before.length; i += 1) {
      if (i === 3) continue;
      assert.equal(after[i], before[i], `line ${i} moved and nobody edited it`);
    }
  });

  test("the page's posted file is immune to a corrupted DOM", async () => {
    // The same detector as the checkbox has, aimed at the surface that reads an element back.
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
    paintParked();
    const body = elements.get("viewBody");
    posted = null;
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    taskText(body).dispatch("click", makeEvent());
    page.__enterInsert();
    for (const el of walk(body)) {
      if (el.tagName === "span") el.innerHTML = "<b>WRECKED</b>";
      if (el.tagName === "h2" || el.tagName === "div") el.innerHTML = "WRECKED";
    }
    const editable = walk(body).find((el) => el.type === "text");
    editable.value = "- [x] Draft the launch note [[qntm:121]] #task #work ✅ 2026-08-04";
    editable.dispatch("blur");
    await new Promise((r) => setImmediate(r));

    assert.ok(!posted.body.markdown.includes("WRECKED"), "the page rebuilt the file from the page");
    const before = VIEW.markdown.split("\n");
    const after = posted.body.markdown.split("\n");
    assert.deepEqual(before.map((_, i) => i).filter((i) => before[i] !== after[i]), [3]);
  });
});

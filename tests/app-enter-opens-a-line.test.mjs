/**
 * ENTER OPENS A LINE, AND THE LINE SURVIVES THE PAINT THAT OPENS IT — driven through
 * app/index.html's own lifted script.
 *
 *   node --test tests/app-enter-opens-a-line.test.mjs
 *
 * ── THE DEFECT THIS SUITE WAS WRITTEN AGAINST, MEASURED BEFORE IT WAS FIXED ──
 *
 * `Enter` on an open line DESTROYED the row it opened and painted the view THREE TIMES. Measured on
 * this rig, deterministically: mode `NORMAL`, no draft, no `<input>`, ten rows in the column where
 * five belong.
 *
 * The mechanism, and it is two separable faults:
 *
 *   1. `settle` opened the draft and left `focus.lineIndex` on the line it had just committed. A
 *      draft focuses its own `<input>` directly (`paintDraft`, no cascade and no mode check), so the
 *      paint that followed had TWO cursors: it built and focused an `<input>` for the committed
 *      line, then built and focused the draft. Focusing the second BLURRED the first, and `blur` is
 *      wired to the COMMITTING settlement — which therefore ran RE-ENTRANTLY INSIDE `paint()`, and
 *      whose own repaint destroyed the draft that same paint had just built.
 *   2. While that nested paint ran, the OUTER FRAME went on appending rows — rows closing over the
 *      source string the nested paint had already replaced. That is the half that WRITES: every one
 *      of those rows hands its own `source` to `applyEdit`, and the write unit is the whole file.
 *
 * ── WHY IT IS THIS SUITE AND NOT tests/app-vim-wiring.test.mjs ──
 *
 * The same three browser facts tests/app-escape-discards.test.mjs names, for the same reason: a DOM
 * stub without them cannot express this defect at all. They are modelled here on top of the shared
 * fixture, so the code under test is still the page that ships.
 *
 *   1. REMOVING THE FOCUSED ELEMENT FIRES `blur`.
 *   2. FOCUSING AN ELEMENT BLURS THE ONE THAT HAD FOCUS.
 *   3. A KEYDOWN IN AN `<input>` BUBBLES TO THE DOCUMENT HANDLER.
 *
 * WHAT THIS SUITE DOES NOT PROVE: a real browser. No browser was run for this file. The three facts
 * are modelled from documented behaviour, not measured.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertMutated,
  importPage,
  installBrowser,
  makeEvent,
  makeWorkDir,
  REPO,
  walk, repointBundle } from "./fixtures/app-html-page.mjs";

/**
 * THE MUTATION SEAM, AND WHY IT IS THE BUNDLE RATHER THAN THE PAGE — the same seam
 * tests/app-escape-discards.test.mjs cuts, and its header explains why: the gesture under test is in
 * `app/present/paint.ts`, which the page imports as `/dist/present.js`. A mutated COPY of the bundle
 * is written beside the lifted page and the page's own import is pointed at it.
 */
function mutating(...pairs) {
  return (workDir) => {
    let mutated = readFileSync(join(REPO, "dist", "present.js"), "utf8");
    for (const [pattern, replacement] of pairs) {
      mutated = assertMutated(mutated, pattern, replacement);
    }
    const file = join(workDir, "present.mutated.js");
    writeFileSync(file, mutated);
    const url = pathToFileURL(file).href;
    return (source) => repointBundle(source, url);
  };
}

/**
 * MUTATION 1 — THE MISSING BLUR PUT BACK. `settle` opens the draft and leaves the cursor on the
 * committed line, which is exactly what the page did before this fix. Two cursors, one paint.
 */
const TWO_CURSORS = ["    if (opened) {\n      focus.blur();\n    }", "    if (opened) {\n    }"];
const withTwoCursors = mutating(TWO_CURSORS);

/**
 * MUTATION 2 — THE SUPERSEDED FRAME ALLOWED TO GO ON PAINTING. The generation is still taken and
 * still bumped; it is only the REFUSAL that is removed, so this mutant is the painter exactly as it
 * was before `paintGeneration` existed and nothing else.
 */
const STALE_FRAMES = [
  "  const superseded = () => paintGeneration !== mine;",
  "  const superseded = () => false;",
];
const withStaleFramesPainting = mutating(STALE_FRAMES);

/**
 * BOTH AT ONCE — THE PAGE AS IT SHIPPED WHEN THE DEFECT WAS MEASURED, and the arm that reproduces
 * the report itself rather than one half of its cause.
 */
const withTheDefect = mutating(TWO_CURSORS, STALE_FRAMES);

const PATH = "personal/all.md";
const FIRST = "- [ ] first task [[qntm:2614]] #task";
const SECOND = "- [ ] second task [[qntm:2]] #task";
const SOURCE = ["# This Week", FIRST, SECOND].join("\n");
/** What he types into the row he opened — the only copy of it there is, until it settles. */
const TYPED = "- [ ] third task";

const viewOf = (markdown) => ({
  id: "this-week",
  path: PATH,
  title: "This Week",
  domain: "personal",
  markdown,
});

/**
 * The page, with the three browser facts installed.
 *
 * `hang` MODELS A SERVER THAT HAS NOT ANSWERED YET, and it is not a convenience. A POST returns and
 * the page repaints from the reply, which WASHES THE SCREEN CLEAN — so a rig whose fetch resolves
 * immediately cannot see the rows a superseded frame left behind, and would report a defect as
 * fixed because the network tidied up after it. A cycle takes seconds; the operator is looking at
 * those rows for all of them, and can click one.
 */
async function rig(label, { mutateFor, hang = false } = {}) {
  const workDir = makeWorkDir(label);
  const mutate = mutateFor === undefined ? undefined : mutateFor(workDir);
  const posts = [];
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    posts.push(body);
    if (hang) {
      return new Promise(() => {});
    }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        snapshot: {
          generated_at: new Date(Date.UTC(2026, 7, 1, 12, posts.length)).toISOString(),
          views: [viewOf(body?.markdown ?? SOURCE)],
        },
      }),
    };
  };

  const { focused, document: doc } = installBrowser();
  const page = await importPage(workDir, mutate);
  page.__setGraphData({ snapshot: { generated_at: "2026-08-01T00:00:00Z", views: [viewOf(SOURCE)] } });

  const body = doc.getElementById("viewBody");

  // FACT 1 — removing the focused element fires blur.
  const html = Object.getOwnPropertyDescriptor(body, "innerHTML");
  Object.defineProperty(body, "innerHTML", {
    configurable: true,
    get: html.get,
    set(value) {
      const going = walk(this).filter((child) => child === focused.value);
      html.set.call(this, value);
      for (const child of going) {
        if (focused.value === child) focused.value = null;
        child.focused = false;
        child.dispatch("blur");
      }
    },
  });

  // FACT 2 — focusing an element blurs whatever had focus.
  const create = doc.createElement;
  const patched = (tag) => {
    const element = create(tag);
    element.focus = function focusElement() {
      const previous = focused.value;
      if (previous === this) return;
      focused.value = this;
      this.focused = true;
      if (previous !== null && previous !== undefined) {
        previous.focused = false;
        previous.dispatch("blur");
      }
    };
    return element;
  };
  doc.createElement = patched;
  globalThis.document.createElement = patched;

  const inputs = () => walk(body).filter((el) => el.tagName === "input" && el.type === "text");
  const boxes = () => walk(body).filter((el) => el.tagName === "input" && el.type === "checkbox");
  /** Every element on screen that answers a click — the cursor targets `focusable` wired up. */
  const targets = () => walk(body).filter((el) => (el.listeners?.get("click") ?? []).length > 0);

  /**
   * HOW MANY COPIES OF THE VIEW ARE ON SCREEN — counted, not eyeballed.
   *
   * `paint` appends exactly ONE click-below-the-last-line row (`div.newline`) per call, at the very
   * end, so the number of them in the column IS the number of frames that finished painting into
   * it. It is a better measure than the row count for the same reason a value-level assertion beats
   * a count anywhere else: it says WHAT is doubled rather than that something is.
   */
  const columns = () =>
    body.children.filter((child) => String(child.className).split(/\s+/).includes("newline")).length;

  // FACT 3 — a keydown in the open line bubbles to the document handler.
  const press = (key) => {
    const open = focused.value ?? null;
    const event = makeEvent({ key, target: open ?? { tagName: "BODY" } });
    if (open !== null) open.dispatch("keydown", event);
    doc.dispatch("keydown", event);
    return event;
  };

  /** Every character the column is showing, whichever element carries it. */
  const rowText = (el) => {
    if (el.value !== undefined && el.value !== "") return el.value;
    const own = el.textContent ?? "";
    if (own !== "") return own;
    return walk(el)
      .map((child) => child.textContent ?? "")
      .join("");
  };
  const screen = () => body.children.map(rowText).join("\n");
  /** How many rows the column is drawing. A view painted twice is a view drawn twice. */
  const rows = () => body.children.length;

  page.paintView("this-week", "chosen");
  return { page, posts, body, inputs, boxes, targets, columns, press, screen, rows, focused };
}

const turn = () => new Promise((resolve) => setTimeout(resolve, 5));

/** Put the cursor on the first task and open it for typing — `gg`, `j`, `i`. */
function openTheFirstTask(r) {
  r.press("g");
  r.press("g");
  r.press("j");
  r.press("i");
  const line = r.inputs()[0];
  assert.ok(line, "i did not open the first task for typing");
  assert.equal(line.value, FIRST, "the open line is not holding the first task's source");
  return line;
}

/**
 * THE VIEW, DRAWN ONCE. Five rows: three source lines, the row being made, and the
 * click-below-the-last-line target. Anything more is a second copy of the column.
 */
const ONE_COPY_WITH_A_DRAFT = 5;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. THE INTENDED END STATE, STATED AND THEN ASSERTED.
//
//    Enter on an open line means: COMMIT THIS LINE, OPEN THE NEXT, PUT THE CURSOR IN IT, INSERT.
//    Four facts, four assertions, plus the one the defect showed on screen — ONE copy of the view.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("1. Enter on an open line", () => {
  test("leaves exactly one copy of the view on screen", async () => {
    const r = await rig("enter-one-copy");
    openTheFirstTask(r);

    r.press("Enter");
    await turn();

    assert.equal(r.columns(), 1, `Enter painted the view ${r.columns()} times, not once`);
    assert.equal(
      r.rows(),
      ONE_COPY_WITH_A_DRAFT,
      `Enter left the wrong number of rows in the column: ${r.rows()}`,
    );
    // AND SAID OF THE FILE'S OWN CONTENTS TOO, because a row count is satisfied by five wrong rows:
    // this file has two checkbox lines, so a column showing it once has two boxes.
    assert.equal(r.boxes().length, 2, "the column is not showing this file's two checkbox lines");
  });

  test("opens a row below the committed line, and the cursor is in it", async () => {
    const r = await rig("enter-opens");
    openTheFirstTask(r);

    r.press("Enter");
    await turn();

    const draft = r.page.__draft().draft;
    assert.notEqual(draft, null, "Enter destroyed the row it opened");
    assert.equal(draft.lineIndex, 2, "the row did not open below the line Enter was pressed on");

    const open = r.inputs();
    assert.equal(open.length, 1, `Enter left ${open.length} rows open for typing, not one`);
    assert.equal(open[0].value, draft.seed, "the open row is not the row that was made");
    assert.equal(r.focused.value, open[0], "the cursor is not in the row Enter opened");
  });

  test("reports INSERT, because a line really is open for text", async () => {
    const r = await rig("enter-insert");
    openTheFirstTask(r);

    r.press("Enter");

    assert.equal(r.page.__vimMode(), "INSERT", "Enter opened a row and reported NORMAL");
  });

  test("commits nothing when the line was not changed, and the file does not move", async () => {
    const r = await rig("enter-unchanged");
    openTheFirstTask(r);

    r.press("Enter");
    await turn();

    assert.deepEqual(r.posts, [], `Enter posted an unchanged line: ${JSON.stringify(r.posts)}`);
    assert.equal(
      r.page.__served().read(PATH, SOURCE).outcome,
      "current",
      "the base moved, so something computed a file",
    );
  });

  test("commits the characters he typed, and posts them exactly once", async () => {
    const r = await rig("enter-changed");
    const line = openTheFirstTask(r);
    line.value = "- [ ] first task, rewritten [[qntm:2614]] #task";

    r.press("Enter");
    await turn();

    assert.equal(r.posts.length, 1, `Enter posted ${r.posts.length} files, not one`);
    assert.equal(
      r.posts[0].markdown,
      ["# This Week", "- [ ] first task, rewritten [[qntm:2614]] #task", SECOND].join("\n"),
      "Enter posted something other than the line he typed",
    );
    assert.notEqual(r.page.__draft().draft, null, "committing the line destroyed the row it opened");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. NOTHING WRITES FROM A STALE SOURCE — the half of this defect that is a write and not a glitch.
//
//    A row that is being made, holding characters, and a repaint that removes it. The removal fires
//    `blur`, `blur` settles the row into a file with ONE LINE MORE, and that settlement repaints —
//    all of it INSIDE the outer `paint()`. Every row the outer frame appends after that closes over
//    the file with ONE LINE LESS, and the write unit is the whole file.
//
//    ASSERTED ON WHAT REACHES THE WIRE, not on the row count, because the row count is the symptom
//    and the POST is the damage.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Open a row, type into it, then click a line — the gesture that settles the row mid-paint. */
async function typeARowThenClickAway(r) {
  r.press("g");
  r.press("g");
  r.press("j");
  r.press("o");
  const draft = r.inputs()[0];
  assert.ok(draft, "o did not open a row");
  draft.value = TYPED;
  draft.dispatch("input", makeEvent({}));
  assert.equal(r.page.__draft().draft.typed, TYPED, "the row did not record what he typed");

  const heading = r.targets()[0];
  assert.ok(heading, "there is no line on screen to click");
  heading.dispatch("click", makeEvent({}));
  return draft;
}

const WITH_THE_ROW = ["# This Week", FIRST, TYPED, SECOND].join("\n");

describe("2. a row settled by a nested paint", () => {
  test("is posted once, whole, and the file it is posted into is the file the server sent", async () => {
    const r = await rig("stale-insert", { hang: true });
    await typeARowThenClickAway(r);

    assert.equal(r.posts.length, 1, `the row settled ${r.posts.length} times, not once`);
    assert.equal(r.posts[0].markdown, WITH_THE_ROW, "the row was inserted into the wrong file");
  });

  test("leaves no row on screen holding a file that no longer exists", async () => {
    const r = await rig("stale-rows", { hang: true });
    await typeARowThenClickAway(r);

    // ONE COPY. Four source lines and the click-below-the-last-line target; the row is gone from the
    // column because it is in the file now.
    assert.equal(r.rows(), 5, `the settled row left a second copy of the view:\n${r.screen()}`);

    // AND THE ASSERTION THAT MATTERS: every affordance still on screen writes the file that HAS his
    // line in it. Ticking any box on screen must not be able to un-create the row he just made.
    const boxes = r.boxes();
    assert.ok(boxes.length > 0, "there is no checkbox on screen, so this proves nothing");
    for (const [index, box] of boxes.entries()) {
      box.checked = !box.checked;
      box.dispatch("change", makeEvent({}));
    }

    const written = r.posts.slice(1).map((post) => post.markdown);
    assert.equal(written.length, boxes.length, "a box on screen did not reach the write path");
    for (const markdown of written) {
      assert.ok(
        markdown.split("\n").includes(TYPED),
        `a box on screen posted a file with his line missing:\n${markdown}`,
      );
      assert.equal(
        markdown.split("\n").length,
        4,
        `a box on screen posted a file of the wrong length:\n${markdown}`,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. THE MUTATION PROOFS. A guard that cannot go red is decoration.
//
//    Two faults, two mutations, one each. Reintroducing either separately is what shows they really
//    are two — and it is why the fix is two lines in two places rather than one guard doing both
//    jobs badly.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("3. reintroduce the defect and the proofs go red", () => {
  test("with BOTH faults back, Enter destroys the row and paints the view three times", async () => {
    let r;
    try {
      r = await rig("enter-the-defect", { mutateFor: withTheDefect });
    } catch (error) {
      assert.fail(`the mutation could not be applied, so this proof is vacuous: ${error.message}`);
    }
    openTheFirstTask(r);

    r.press("Enter");
    await turn();

    // THE REPORT, EXECUTABLE, TO THE NUMBER: mode NORMAL, no draft, no <input>, THREE COPIES.
    assert.equal(r.page.__vimMode(), "NORMAL", "the mutation did not drop out of INSERT");
    assert.equal(r.page.__draft().draft, null, "the mutation did not destroy the row");
    assert.equal(r.inputs().length, 0, "the mutation left a row open for typing");
    assert.equal(r.columns(), 3, `the mutation did not paint the view three times:\n${r.screen()}`);
    // SECTION 1'S OWN ASSERTIONS, INVERTED — written out rather than left to be inferred.
    assert.notEqual(r.rows(), ONE_COPY_WITH_A_DRAFT, "section 1's row count still holds");
    assert.notEqual(r.page.__vimMode(), "INSERT", "section 1's mode assertion still holds");
  });

  test("with only the cursor left on the committed line, the row is still destroyed", async () => {
    let r;
    try {
      r = await rig("enter-two-cursors", { mutateFor: withTwoCursors });
    } catch (error) {
      assert.fail(`the mutation could not be applied, so this proof is vacuous: ${error.message}`);
    }
    openTheFirstTask(r);

    r.press("Enter");
    await turn();

    // THE TWO FAULTS ARE SEPARABLE, AND THIS IS THE HALF THAT SAYS SO. The frame guard alone keeps
    // the column down to ONE copy — no stale frame goes on appending — and the row is destroyed
    // anyway, because the re-entrant settlement still runs. A guard that tidied the screen and left
    // the operator with no line would have looked fixed.
    assert.equal(r.columns(), 1, "the frame guard did not hold the column to one copy");
    assert.equal(r.page.__draft().draft, null, "the mutation did not destroy the row");
    assert.equal(r.inputs().length, 0, "the mutation left a row open for typing");
    assert.equal(r.page.__vimMode(), "NORMAL", "the mutation did not drop out of INSERT");
    // AND THE COLUMN IS HALF A VIEW: one of the file's two checkbox lines survived the frame that
    // was cut short. One copy, and the wrong one.
    assert.equal(r.boxes().length, 1, "the mutation left the column whole");
  });

  test("with a superseded frame allowed to paint, a box on screen posts the file without his line", async () => {
    let r;
    try {
      r = await rig("stale-frames", { mutateFor: withStaleFramesPainting, hang: true });
    } catch (error) {
      assert.fail(`the mutation could not be applied, so this proof is vacuous: ${error.message}`);
    }
    await typeARowThenClickAway(r);

    // THE SECOND COPY, DRAWN FROM THE FILE THAT NO LONGER EXISTS. Two columns, and the file's two
    // checkbox lines have become three boxes.
    assert.equal(r.columns(), 2, `the mutation left no stale frame:\n${r.screen()}`);
    assert.equal(r.boxes().length, 3, "the mutation left no stale checkbox, so this is vacuous");

    // AND THE WRITE. The LAST box on screen belongs to the superseded frame, so it closes over the
    // file as it stood BEFORE his row was inserted — ticking it POSTS that file, and his line, which
    // has no other copy anywhere, is gone.
    const boxes = r.boxes();
    const stale = boxes[boxes.length - 1];
    stale.checked = true;
    stale.dispatch("change", makeEvent({}));

    assert.equal(r.posts.length, 2, "the stale box did not reach the write path");
    assert.equal(
      r.posts[1].markdown,
      ["# This Week", "- [x] first task [[qntm:2614]] #task", SECOND].join("\n"),
      "the stale box did not post the superseded file",
    );
    assert.ok(
      !r.posts[1].markdown.split("\n").includes(TYPED),
      "the mutation did not actually destroy his line, so section 2's proof would not have gone red",
    );
  });
});

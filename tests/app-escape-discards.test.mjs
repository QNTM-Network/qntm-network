/**
 * ESCAPE DISCARDS. IT DOES NOT WRITE. — driven through app/index.html's own lifted script.
 *
 *   node --test tests/app-escape-discards.test.mjs
 *
 * ── WHY THIS SUITE EXISTS BESIDE tests/present-motions.test.mjs AND tests/app-vim-wiring.test.mjs ──
 *
 * Both of those already press Escape and both already assert that nothing was committed. Neither
 * could have caught a browser destroying the operator's line, because both drive a DOM stub that is
 * missing the three facts a real browser has and this gesture depends on:
 *
 *   1. REMOVING THE FOCUSED ELEMENT FIRES `blur`. Escape's own repaint removes the `<input>` the
 *      operator is in, and `blur` is wired to the COMMITTING settlement. That is the shape that
 *      destroyed a draft row one day earlier (`DraftSurface.generation`, app/present/paint.ts).
 *   2. FOCUSING AN ELEMENT BLURS THE ONE THAT HAD FOCUS. One paint can build two `<input>`s and
 *      focus them in order, so a settlement can fire re-entrantly from inside `paint()`.
 *   3. A KEYDOWN IN AN `<input>` BUBBLES TO THE DOCUMENT HANDLER, which drains the projection queue
 *      and then re-reads `mode.mode` — which Escape has just changed.
 *
 * All three are modelled here, on top of the shared fixture rather than instead of it, so the code
 * under test is still the page that ships.
 *
 * WHAT THIS SUITE DOES NOT PROVE: a real browser. No browser was run for this file. The three facts
 * above are modelled from documented behaviour, not measured.
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
  walk,
} from "./fixtures/app-html-page.mjs";

/**
 * THE MUTATION SEAM, AND WHY IT IS THE BUNDLE RATHER THAN THE PAGE.
 *
 * `extractPageScript`'s own `mutate` reaches app/index.html's script, and the gesture under test is
 * not in it — `discard` is `app/present/paint.ts`, which the page imports as `/dist/present.js`. So
 * a mutated COPY of the bundle is written beside the lifted page and the page's own import is
 * pointed at it. Nothing else about the page changes, and the bundle the browser loads is still the
 * thing under test — this is one line of it, rewritten, exactly as `assertMutated` insists.
 */
function withEscapeCommitting(workDir) {
  const original = readFileSync(join(REPO, "dist", "present.js"), "utf8");
  const mutated = assertMutated(original, "      discard();", "      settle();");
  const file = join(workDir, "present.mutated.js");
  writeFileSync(file, mutated);
  const url = pathToFileURL(file).href;
  const was = pathToFileURL(join(REPO, "dist", "present.js")).href;
  return (source) => assertMutated(source, JSON.stringify(was), JSON.stringify(url));
}

const PATH = "personal/all.md";

/** A stamped, saved line — the one the operator watched vanish — and an unstamped neighbour. */
const STAMPED = "- [ ] first task [[qntm:2614]] #task";
const SOURCE = ["# This Week", STAMPED, "- [ ] second task [[qntm:2]] #task"].join("\n");

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
 * ONE PAGE MODULE PER RIG. `makeWorkDir` per call is what makes each test independent — the page
 * keeps `graphData`, `focus` and `mode` in module-scoped state, so two tests sharing one module
 * share a cursor.
 */
async function rig(label, mutateFor) {
  const workDir = makeWorkDir(label);
  const mutate = mutateFor === undefined ? undefined : mutateFor(workDir);
  const posts = [];
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    posts.push(body);
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

  // FACT 1 — removing the focused element fires blur. `paint()` empties the column with
  // `body.innerHTML = ""`, so this is the hook every repaint goes through.
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

  // FACT 3 — a keydown in the open line bubbles to the document handler.
  const press = (key) => {
    const open = focused.value ?? null;
    const event = makeEvent({ key, target: open ?? { tagName: "BODY" } });
    if (open !== null) open.dispatch("keydown", event);
    doc.dispatch("keydown", event);
    return event;
  };

  /**
   * Every character the column is showing, whichever element carries it.
   *
   * IT WALKS RATHER THAN READING THE TOP ROW, because one line's characters live at three different
   * depths depending on its rendition: an `<input>`'s `value`, a `<div>`'s `textContent`, and a
   * task's `<label>` → `<span>`. A reader that only looked at the top row would report a checkbox
   * line as empty and call that "the line is gone".
   */
  const rowText = (el) => {
    if (el.value !== undefined && el.value !== "") return el.value;
    const own = el.textContent ?? "";
    if (own !== "") return own;
    return walk(el)
      .map((child) => child.textContent ?? "")
      .join("");
  };
  const screen = () => body.children.map(rowText).join("\n");
  /** How many rows the column is drawing. A lost line is a lost row. */
  const rows = () => body.children.length;

  page.paintView("this-week", "chosen");
  return { page, posts, body, inputs, press, screen, rows, focused };
}

/** Put the cursor on the stamped line and open it for typing — `gg`, `j`, `i`. */
function openTheStampedLine(r) {
  r.press("g");
  r.press("g");
  r.press("j");
  r.press("i");
  const line = r.inputs()[0];
  assert.ok(line, "i did not open the stamped line for typing");
  assert.equal(line.value, STAMPED, "the open line is not holding the stamped line's source");
  return line;
}

const turn = () => new Promise((resolve) => setTimeout(resolve, 5));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. A SAVED, STAMPED LINE. Escape posts NOTHING — asserted at the value level, not by a count.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("1. Escape on a saved, stamped line", () => {
  test("posts nothing at all, and the source is byte-identical to before", async () => {
    const r = await rig("escape-stamped");
    const before = r.page.__setGraphData === undefined ? null : SOURCE;
    const line = openTheStampedLine(r);
    line.value = "";

    r.press("Escape");
    await turn();

    // THE VALUE-LEVEL ASSERTION, WHICH IS THE ONE THAT MATTERS. A count of zero is satisfied by an
    // app that cannot write at all; this says WHAT was on the wire, which is nothing.
    assert.deepEqual(r.posts, [], `Escape put a file on the wire: ${JSON.stringify(r.posts)}`);

    // AND THE FILE THE APP IS HOLDING IS THE FILE THE SERVER SENT, character for character.
    const view = r.page.__served().read(PATH, before);
    assert.equal(view.outcome, "current", "the base moved, so something computed a file");

    // AND THE LINE IS BACK ON SCREEN, AS THE SOURCE HAS IT.
    assert.ok(
      r.screen().includes(STAMPED),
      `the stamped line is not on screen after Escape:\n${r.screen()}`,
    );
    assert.equal(r.inputs().length, 0, "an <input> is still open after Escape");
  });

  test("empties nothing: the emptied <input> is never read", async () => {
    const r = await rig("escape-emptied-input");
    const line = openTheStampedLine(r);
    // THE BROWSER FACT THE BRIEF NAMES: a text input's default value is its `value` ATTRIBUTE, and
    // the painter sets only the IDL property — so anything that reverts the field reverts it to the
    // EMPTY STRING. This is that worst case, made explicit rather than hoped against.
    line.value = "";

    r.press("Escape");
    await turn();

    assert.deepEqual(r.posts, [], "an emptied input reached a write");
    assert.ok(r.screen().includes(STAMPED), "the emptied input was painted back as the line");
  });

  test("lands in NORMAL with the cursor still on the line it was on", async () => {
    const r = await rig("escape-normal");
    openTheStampedLine(r);
    assert.equal(r.page.__vimMode(), "INSERT");
    assert.equal(r.page.__focusIndex(), 1);

    r.press("Escape");

    assert.equal(r.page.__vimMode(), "NORMAL", "Escape did not return to NORMAL");
    assert.equal(r.page.__focusIndex(), 1, "Escape moved the cursor off the line");
    assert.equal(r.inputs().length, 0, "Escape left a line open for typing");
  });

  test("a second Escape changes nothing — the reflex is idempotent", async () => {
    const r = await rig("escape-twice");
    const line = openTheStampedLine(r);
    line.value = "- [ ] rewritten entirely";
    r.press("Escape");
    const after = r.screen();
    r.press("Escape");
    r.press("Escape");
    await turn();

    assert.deepEqual(r.posts, [], "a repeated Escape reached a write");
    assert.equal(r.screen(), after, "a repeated Escape changed the screen");
    assert.equal(r.page.__vimMode(), "NORMAL");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. A NEW LINE. The report said a SAVED line went; a new one is the other half of the gesture and
//    it has its own settlement (`draftInput`), so it is proven separately rather than assumed.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("2. Escape on a line that is not in the file yet", () => {
  test("posts nothing, and the lines that ARE in the file are all still there", async () => {
    const r = await rig("escape-draft");
    r.press("g");
    r.press("g");
    r.press("j");
    r.press("o");
    const draft = r.inputs()[0];
    if (draft !== undefined) {
      draft.value = "- [ ] a line he changed his mind about";
      draft.dispatch("input", makeEvent({}));
    }

    r.press("Escape");
    await turn();

    assert.deepEqual(r.posts, [], "abandoning a new line reached a write");
    // AND THE FILE IS UNTOUCHED — asked of `BaseSurface`, which answers "is this the copy the server
    // has": the same question the write path itself asks, so a divergence this misses is one the
    // write path would miss too.
    assert.equal(
      r.page.__served().read(PATH, SOURCE).outcome,
      "current",
      "abandoning a new line moved the file the app is holding",
    );
    // AND EVERY ROW THAT WAS THERE IS STILL THERE. Three source lines and the click-below-the-last
    // -line row: the abandoned row is gone and nothing else went with it.
    assert.equal(r.rows(), 4, `abandoning a new line changed the rows on screen: ${r.screen()}`);
    assert.equal(r.page.__draft().draft, null, "the abandoned row is still open");
    assert.equal(r.page.__vimMode(), "NORMAL");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. THE MUTATION PROOF. A guard that cannot go red is decoration.
//
// The mutation is the defect's own shape, restored exactly: Escape routed back into the settlement
// that CAN write. If the assertions above still passed with that in place they would be proving
// nothing about the guard.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("3. reintroduce the defect and the proofs go red", () => {
  test("with Escape wired to the committing settlement, an emptied line IS written", async () => {
    let r;
    try {
      r = await rig("escape-mutant", withEscapeCommitting);
    } catch (error) {
      assert.fail(`the mutation could not be applied, so this proof is vacuous: ${error.message}`);
    }
    const line = openTheStampedLine(r);
    line.value = "";

    r.press("Escape");
    await turn();

    // THE DEFECT, EXECUTABLE. One POST, and the file it carries has the stamped line emptied — the
    // node's only printing gone, which is what took `[[qntm:2614]]` out of the vault.
    assert.equal(r.posts.length, 1, "the mutated page did not write, so the guard proves nothing");
    assert.equal(
      r.posts[0].markdown,
      ["# This Week", "", "- [ ] second task [[qntm:2]] #task"].join("\n"),
      "the mutated page wrote something other than the emptied line",
    );
    assert.ok(
      !r.posts[0].markdown.includes("[[qntm:2614]]"),
      "the mutation did not actually destroy the stamp",
    );

    // SECTION 1'S OWN ASSERTION, INVERTED — written out rather than left to be inferred, because
    // "this suite would have been red before the fix" is the claim the mutation arm exists to make
    // and a reader should be able to check it against one line rather than against a whole section.
    assert.notDeepEqual(r.posts, [], "section 1's contract still holds with the defect in place");
    assert.notEqual(
      r.page.__served().read(PATH, SOURCE).outcome,
      "current",
      "the defect moved no base, so section 1's base assertion would not have gone red either",
    );
  });
});

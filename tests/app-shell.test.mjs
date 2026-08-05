/**
 * THE SHELL — the menu bar and the view drawer, asserted through the page's own script.
 *
 *   node --test tests/app-shell.test.mjs
 *
 * The app had no chrome. It had a `<select>` grouped by a hand-written label, a nav holding one
 * button, and no way to say where you were. What replaced it is a fixed menu bar and a drawer off
 * the right edge holding the views as the FOLDERS THEY LIVE IN — the shape the operator already
 * reads in Obsidian.
 *
 * ── WHERE THE FOLDER COMES FROM, WHICH IS THE ONE FINDING WORTH LEADING WITH ──
 *
 * A view in the snapshot carries `path` — its rendered file's path inside the vault — and also
 * `domain`, a label written by hand in each view's config. The retired `<select>` grouped by
 * `domain`. THE TWO ARE NOT THE SAME THING, measured across the operator's 76 view configs, and
 * the fixture below is drawn from them so the disagreement is in the test data rather than in a
 * comment: `dev/test-scratchpad.md` is declared `domain: personal`, and fourteen views in four
 * separate project folders under `dev/` are one flat `dev` bucket. `path` is the field the write
 * path posts to, so it cannot drift from where the file actually is; `domain` can and has.
 *
 * ── WHY IT DRIVES THE PAGE INSTEAD OF DESCRIBING IT ──
 *
 * Same reason as tests/app-html-write-path.test.mjs: app/index.html is hand-authored HTML outside
 * tsconfig, outside the bundle, and outside flow-trace's capture (node cannot import an HTML
 * document). A suite that reimplemented the drawer in a fixture would stay green while the page
 * rotted. So tests/fixtures/app-html-page.mjs lifts the page's real module script and runs it, and
 * every function called below is the one that ships.
 *
 * The half that cannot be driven — a browser laying the result out — is asserted the way the row
 * suite does it: as properties of the stylesheet that ships. `--touch` is not a measurement of a
 * rendered button, it is the invariant that makes the measurement come out at 44px.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { REPO, importPage, installBrowser, makeEvent, makeWorkDir } from "./fixtures/app-html-page.mjs";

const PAGE = readFileSync(resolve(REPO, "app", "index.html"), "utf8");

/**
 * The page with every comment removed — HTML, CSS and JS.
 *
 * The retirement checks in section 6 look for corpses by name, and this page's comments TALK
 * about what was retired ("the retired <select> grouped by domain") on purpose, because a reader
 * who finds `domain` in the data needs to know why the drawer does not use it. Searching the raw
 * file would make writing that explanation a test failure, which is a test that punishes the one
 * habit this repo is built on.
 */
const CODE = PAGE
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/**
 * Eight of the operator's real views, ids, paths and domains as his view configs declare them.
 *
 * Chosen to carry every shape the tree has to hold: two loose files at the vault root, a flat
 * folder, a folder of folders (`dev/`) that ALSO holds a loose file, and a three-deep path
 * (`admin/dojo/habit/`). Plus the two disagreements — `test-scratchpad` whose domain names a
 * different folder entirely, and the `dev` bucket that is four projects.
 */
const VIEWS = [
  { id: "this-week", path: "this_week.md", title: "This Week", domain: "all", markdown: "## Today\n- [ ] a thing\n" },
  { id: "inbox", path: "inbox.md", title: "Inbox", domain: "all", markdown: "## In\n" },
  { id: "all-work", path: "work/all.md", title: "All Work", domain: "work", markdown: "## Work\n" },
  { id: "outcomes", path: "work/outcomes.md", title: "Outcomes", domain: "work", markdown: "## Outcomes\n" },
  { id: "qntm-queue", path: "dev/qntm/queue.md", title: "Qntm Queue", domain: "dev", markdown: "## Queue\n" },
  { id: "flowtrace-queue", path: "dev/flow-trace/queue.md", title: "Flowtrace Queue", domain: "dev", markdown: "## Queue\n" },
  { id: "test-scratchpad", path: "dev/test-scratchpad.md", title: "Test Scratchpad", domain: "personal", markdown: "## Scratch\n" },
  { id: "habit-dojo", path: "admin/dojo/habit/habit-dojo.md", title: "Habit Dojo", domain: "dojo", markdown: "## Dojo\n" },
];

const WORK = makeWorkDir("app-shell");
let page;
let elements;
let doc;

before(async () => {
  ({ elements, document: doc } = installBrowser());
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  page = await importPage(WORK);
  page.__setGraphData({ snapshot: { generated_at: "2026-07-30T09:00:00Z", views: VIEWS } });
});

const el = (id) => elements.get(id);

/** Rebuild the drawer around a chosen view, the way loadGraph does. */
function drawerShowing(id) {
  page.__setCurrentViewId(id);
  page.buildDrawer(VIEWS);
}

/** Every element the drawer painted, in document order. */
function rows() {
  const out = [];
  const walk = (node) => {
    for (const child of node.children ?? []) {
      out.push(child);
      walk(child);
    }
  };
  walk(el("viewTree"));
  return out;
}

const buttonsOfClass = (name) =>
  rows().filter((node) => String(node.className).split(" ").includes(name));

/** A row's visible words — the label span's text, which is where treeRow puts the name. */
const nameOf = (button) =>
  (button.children ?? []).find((child) => child.className === "rowname")?.textContent ?? "";

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE FOLDER IS THE PATH'S FOLDER
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. a view's folder comes from its path, not from its domain", () => {
  test("the folder is the directory the rendered file is in", () => {
    assert.equal(page.folderOf("work/all.md"), "work");
    assert.equal(page.folderOf("dev/qntm/queue.md"), "dev/qntm");
    assert.equal(page.folderOf("admin/dojo/habit/habit-dojo.md"), "admin/dojo/habit");
    // A loose file at the vault root has no folder, and that is a real answer rather than a
    // missing one — Obsidian draws those at the root of the tree, and so does the drawer.
    assert.equal(page.folderOf("this_week.md"), "");
    assert.equal(page.folderOf(undefined), "");
  });

  test("the tree nests, because the vault does", () => {
    const root = page.foldersOf(VIEWS);
    assert.deepEqual([...root.folders.keys()].sort(), ["admin", "dev", "work"]);
    assert.deepEqual(root.views.map((v) => v.id), ["this-week", "inbox"]);

    const dev = root.folders.get("dev");
    assert.deepEqual([...dev.folders.keys()].sort(), ["flow-trace", "qntm"]);
    assert.deepEqual(dev.views.map((v) => v.id), ["test-scratchpad"], "dev holds a loose file too");

    // Three deep. A tree that only understood one level would put this under `admin` and lose
    // the two folders between — and `admin/dojo/` has four dojos in the real vault.
    const habit = root.folders.get("admin").folders.get("dojo").folders.get("habit");
    assert.deepEqual(habit.views.map((v) => v.id), ["habit-dojo"]);
  });

  test("THE FINDING: `domain` is a different fact and it disagrees with the folder", () => {
    // Not an opinion about which is nicer. These are the operator's own declarations, and if the
    // drawer grouped by `domain` — as the retired <select> did — this is what a reader would be
    // told about where his files are.
    const disagreements = VIEWS.filter((v) => (v.domain ?? "") !== page.folderOf(v.path));
    assert.ok(
      disagreements.length > 0,
      "the fixture no longer carries a disagreement, so this test proves nothing — put one back",
    );

    const scratchpad = VIEWS.find((v) => v.id === "test-scratchpad");
    assert.equal(page.folderOf(scratchpad.path), "dev");
    assert.equal(scratchpad.domain, "personal", "the label says one folder, the file is in another");

    // COARSER, TOO. Three views share the domain `dev`; they live in three different folders.
    const devDomain = VIEWS.filter((v) => v.domain === "dev");
    const devFolders = new Set(devDomain.map((v) => page.folderOf(v.path)));
    assert.equal(devDomain.length, 2);
    assert.equal(devFolders.size, 2, "two `dev` views, two folders — one bucket would merge them");

    // And a domain can name something that is not a folder at any level.
    assert.equal(VIEWS.find((v) => v.id === "this-week").domain, "all");
    assert.ok(!VIEWS.some((v) => page.folderOf(v.path) === "all"));
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE DRAWER
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. the drawer groups the views into those folders", () => {
  before(() => drawerShowing("qntm-queue"));

  test("every view is a row, and every folder is a row", () => {
    assert.equal(buttonsOfClass("viewbtn").length, VIEWS.length);
    const folders = buttonsOfClass("foldbtn").map(nameOf).sort();
    assert.deepEqual(folders, ["admin", "dev", "dojo", "flow-trace", "habit", "qntm", "work"]);
  });

  test("a view sits inside its folder's children, not beside it", () => {
    const dev = buttonsOfClass("foldbtn").find((b) => nameOf(b) === "qntm");
    const box = rows().find((node) => (node.children ?? []).includes(dev));
    const kids = box.children.find((child) => child.className === "foldkids");
    assert.deepEqual(kids.children.map(nameOf), ["Qntm Queue"]);
  });

  test("a folder counts everything beneath it, not only its own files", () => {
    const dev = buttonsOfClass("foldbtn").find((b) => nameOf(b) === "dev");
    const count = dev.children.find((child) => child.className === "count");
    // dev/qntm/queue.md + dev/flow-trace/queue.md + dev/test-scratchpad.md
    assert.equal(count.textContent, "3");
  });

  test("the folders holding the current view land OPEN, the rest land shut", () => {
    const foldOf = (name) => {
      const head = buttonsOfClass("foldbtn").find((b) => nameOf(b) === name);
      return rows().find((node) => (node.children ?? []).includes(head));
    };
    assert.ok(!foldOf("dev").classList.contains("shut"), "dev holds the current view");
    assert.ok(!foldOf("qntm").classList.contains("shut"), "so does dev/qntm");
    assert.ok(foldOf("work").classList.contains("shut"), "work does not");
    assert.ok(foldOf("flow-trace").classList.contains("shut"));
  });

  test("the current view is marked, and only it", () => {
    const current = buttonsOfClass("viewbtn").filter((b) => b.classList.contains("current"));
    assert.deepEqual(current.map(nameOf), ["Qntm Queue"]);

    drawerShowing("all-work");
    assert.deepEqual(
      buttonsOfClass("viewbtn").filter((b) => b.classList.contains("current")).map(nameOf),
      ["All Work"],
    );
    drawerShowing("qntm-queue");
  });

  test("the bar says where you are, in the folder's words and the view's", () => {
    drawerShowing("habit-dojo");
    assert.equal(el("barFolder").textContent, "admin/dojo/habit");
    assert.equal(el("barView").textContent, "Habit Dojo");
    drawerShowing("this-week");
    assert.equal(el("barFolder").textContent, "", "a root view names no folder");
    assert.equal(el("barView").textContent, "This Week");
    drawerShowing("qntm-queue");
  });

  test("a folder row opens and shuts what is under it, and says which it is", () => {
    const head = buttonsOfClass("foldbtn").find((b) => nameOf(b) === "work");
    const box = rows().find((node) => (node.children ?? []).includes(head));
    assert.equal(head.getAttribute("aria-expanded"), "false");
    head.dispatch("click");
    assert.ok(!box.classList.contains("shut"));
    assert.equal(head.getAttribute("aria-expanded"), "true");
    head.dispatch("click");
    assert.ok(box.classList.contains("shut"));
    assert.equal(head.getAttribute("aria-expanded"), "false");
  });

  test("choosing a view paints it and closes the drawer", () => {
    el("viewsBtn").dispatch("click");
    assert.ok(page.__drawerIsOpen());
    const target = buttonsOfClass("viewbtn").find((b) => nameOf(b) === "Inbox");
    target.dispatch("click");
    assert.equal(el("barView").textContent, "Inbox", "the bar followed the choice");
    assert.ok(el("viewBody").children.length > 0, "the view was painted");
    assert.ok(!page.__drawerIsOpen(), "the drawer stayed open over the view it just chose");
  });

  test("no snapshot is a sentence, not an empty panel", () => {
    page.buildDrawer([]);
    assert.equal(buttonsOfClass("viewbtn").length, 0);
    assert.match(el("viewTree").children[0].textContent, /No views/);
    drawerShowing("qntm-queue");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. OPENING, CLOSING, AND THE CURSOR
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. the drawer opens, closes, and hands the cursor back", () => {
  before(() => drawerShowing("qntm-queue"));

  test("the button opens it and closes it again", () => {
    el("viewsBtn").dispatch("click");
    assert.ok(page.__drawerIsOpen());
    assert.ok(el("drawer").classList.contains("open"));
    assert.ok(el("scrim").classList.contains("open"), "the scrim came with it");
    assert.equal(el("drawer").getAttribute("aria-hidden"), "false");
    assert.equal(el("viewsBtn").getAttribute("aria-expanded"), "true");
    assert.ok(doc.body.classList.contains("noscroll"), "the page behind a modal does not scroll");

    el("viewsBtn").dispatch("click");
    assert.ok(!page.__drawerIsOpen());
    assert.ok(!el("drawer").classList.contains("open"));
    assert.ok(!el("scrim").classList.contains("open"));
    assert.equal(el("drawer").getAttribute("aria-hidden"), "true");
    assert.equal(el("viewsBtn").getAttribute("aria-expanded"), "false");
    assert.ok(!doc.body.classList.contains("noscroll"));
  });

  test("the close button closes it, and so does the page behind it", () => {
    el("viewsBtn").dispatch("click");
    el("drawerClose").dispatch("click");
    assert.ok(!page.__drawerIsOpen());

    el("viewsBtn").dispatch("click");
    el("scrim").dispatch("click");
    assert.ok(!page.__drawerIsOpen(), "a tap outside the drawer is the biggest close target there is");
  });

  test("Escape closes it from inside AND from anywhere else on the page", () => {
    el("viewsBtn").dispatch("click");
    page.drawerStops[0].dispatch("keydown", makeEvent({ key: "Escape" }));
    assert.ok(!page.__drawerIsOpen(), "Escape with the cursor in the drawer");

    el("viewsBtn").dispatch("click");
    doc.dispatch("keydown", makeEvent({ key: "Escape", target: { tagName: "BODY" } }));
    assert.ok(!page.__drawerIsOpen(), "Escape with the cursor somewhere else entirely");
  });

  test("`\\` opens it — and is refused while the cursor is in a line's source", () => {
    doc.dispatch("keydown", makeEvent({ key: "\\", target: { tagName: "BODY" } }));
    assert.ok(page.__drawerIsOpen());
    page.closeDrawer();

    // EVERY LINE OF A VIEW BECOMES AN <input> THE MOMENT IT IS CLICKED. A global key that fired
    // there would eat a character out of the operator's own markdown, which is this shell
    // breaking the app it wraps.
    const typed = doc.dispatch("keydown", makeEvent({ key: "\\", target: { tagName: "INPUT" } }));
    assert.ok(!page.__drawerIsOpen(), "the shell stole a backslash out of a source line");
    assert.ok(!typed.defaultPrevented, "and it must not swallow the keystroke either");
  });

  test("the cursor goes to where you already are, and comes back to the button", () => {
    const current = buttonsOfClass("viewbtn").find((b) => b.classList.contains("current"));
    el("viewsBtn").dispatch("click");
    assert.ok(current.focused, "the drawer opened with the cursor on the current view");
    el("drawerClose").dispatch("click");
    assert.ok(el("viewsBtn").focused, "closing gave the cursor back to what opened it");
  });

  test("Tab does not leave the drawer while it is open", () => {
    el("viewsBtn").dispatch("click");
    const stops = page.drawerStops;
    assert.ok(stops.length > 2, "a trap over fewer than two stops proves nothing");
    for (const stop of stops) stop.focused = false;

    const off = stops[stops.length - 1].dispatch("keydown", makeEvent({ key: "Tab" }));
    assert.ok(off.defaultPrevented);
    assert.ok(stops[0].focused, "Tab off the end wrapped to the first stop");

    for (const stop of stops) stop.focused = false;
    const back = stops[0].dispatch("keydown", makeEvent({ key: "Tab", shiftKey: true }));
    assert.ok(back.defaultPrevented);
    assert.ok(stops[stops.length - 1].focused, "Shift+Tab off the front wrapped to the last stop");

    // A Tab in the MIDDLE is the browser's business, not the trap's.
    for (const stop of stops) stop.focused = false;
    const through = stops[1].dispatch("keydown", makeEvent({ key: "Tab" }));
    assert.ok(!through.defaultPrevented, "the trap took a keystroke it had no business taking");
    page.closeDrawer();
  });

  test("the close button is the first stop, and every row after it is one", () => {
    assert.equal(page.drawerStops[0], el("drawerClose"));
    assert.equal(page.drawerStops.length, 1 + buttonsOfClass("foldbtn").length + VIEWS.length);
  });

  test("with no session there is nothing to open", () => {
    page.__setGraphData(null);
    page.openDrawer();
    assert.ok(!page.__drawerIsOpen(), "the drawer opened over a page with no views behind it");
    page.__setGraphData({ snapshot: { generated_at: "x", views: VIEWS } });
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. WHAT ONLY THE STYLESHEET CAN SAY
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The page's stylesheet as rules, media queries flattened and carrying their condition.
 *
 * Deliberately a SECOND small reader rather than a shared one: tests/app-view-rows.test.mjs owns
 * a reader tuned to one question (can a selector reach a painted line) and coupling this suite to
 * it would make a change to either one a change to both.
 */
function readSheet() {
  const block = /<style>([\s\S]*?)<\/style>/.exec(PAGE);
  assert.ok(block, "app/index.html no longer has a <style> block");
  const css = block[1].replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const readInto = (text, condition) => {
    for (const [, head, body] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const declarations = new Map();
      for (const piece of body.split(";")) {
        const at = piece.indexOf(":");
        if (at === -1) continue;
        declarations.set(piece.slice(0, at).trim(), piece.slice(at + 1).trim());
      }
      rules.push({ selector: head.trim().replace(/\s+/g, " "), declarations, condition });
    }
  };
  let rest = css;
  for (;;) {
    const at = rest.indexOf("@");
    if (at === -1) break;
    const head = /^@[a-z-]+[^{]*\{/.exec(rest.slice(at));
    assert.ok(head, "unreadable at-rule");
    const open = at + head[0].length - 1;
    let depth = 0;
    let close = open;
    for (; close < rest.length; close += 1) {
      if (rest[close] === "{") depth += 1;
      else if (rest[close] === "}" && (depth -= 1) === 0) break;
    }
    readInto(rest.slice(open + 1, close), rest.slice(at, open).trim().replace(/\s+/g, " "));
    rest = rest.slice(0, at) + rest.slice(close + 1);
  }
  readInto(rest, null);
  return rules;
}

const SHEET = readSheet();
const rulesFor = (selector, condition = null) =>
  SHEET.filter(
    (rule) =>
      rule.condition === condition &&
      rule.selector.split(",").some((one) => one.trim() === selector),
  );
const ruleFor = (selector, condition = null) => rulesFor(selector, condition)[0];
/** The last word on a property — source order decides, and `html, body` states one before `body`. */
function valueOf(selector, property, condition = null) {
  let answer;
  for (const rule of rulesFor(selector, condition)) {
    if (rule.declarations.has(property)) answer = rule.declarations.get(property);
  }
  return answer;
}
const token = (name) => valueOf(":root", name);

describe("4. a phone can use it", () => {
  test("no target the shell offers is smaller than 44px", () => {
    // ONE TOKEN, so it cannot be 44 in eight places and 40 in the ninth.
    const touch = token("--touch");
    assert.match(touch, /^([\d.]+)rem$/, "--touch is not a length this test understands");
    assert.ok(Number.parseFloat(touch) * 16 >= 44, `--touch is ${touch}, under the 44px minimum`);

    for (const selector of [".barbtn", ".foldbtn", ".viewbtn"]) {
      const rule = ruleFor(selector);
      assert.ok(rule, `${selector} has no rule at all`);
      assert.equal(
        rule.declarations.get("min-height"), "var(--touch)",
        `${selector} sizes itself rather than taking the one minimum`,
      );
    }
    // A bar control is as WIDE as it is tall, too — "Sign out" is fine, but a control whose label
    // is one glyph would otherwise be a 44px-tall sliver.
    assert.equal(valueOf(".barbtn", "min-width"), "var(--touch)");
  });

  test("the fixed edges pay the safe-area insets", () => {
    // `viewport-fit=cover` is already in the viewport meta, which is what makes this necessary:
    // without it the page stops short of the notch and none of this matters; with it, a bar that
    // ignores the inset puts its controls under the camera housing.
    assert.match(PAGE, /viewport-fit=cover/, "the viewport meta no longer covers the display");
    for (const name of ["--safe-t", "--safe-r", "--safe-b", "--safe-l"]) {
      assert.match(String(token(name)), /^env\(safe-area-inset-/, `${name} is not an inset`);
    }
    // The three surfaces that touch an edge of the screen.
    assert.match(String(valueOf(".bar", "padding")), /var\(--safe-t\)/);
    assert.match(String(valueOf(".drawer", "padding")), /var\(--safe-b\)/);
    assert.match(String(valueOf("body", "padding")), /var\(--safe-b\)/);
    // And they can only ADD room: an inset is always taken against a step of the scale, never
    // instead of one, so a desktop (every inset 0) still gets its padding.
    assert.match(String(valueOf(".bar", "padding")), /max\(var\(--s4\), var\(--safe-r\)\)/);
  });

  test("the drawer reaches the thumb: the head moves to the bottom on a phone", () => {
    const phone = "@media (max-width: 40rem)";
    assert.ok(SHEET.some((rule) => rule.condition === phone), "the phone breakpoint is gone");
    assert.equal(valueOf(".drawer-head", "order"), "1", "on a wide screen the head is at the top");
    assert.equal(valueOf(".drawer-head", "order", phone), "3", "on a phone it is at the bottom");
    assert.equal(valueOf(".tree", "order", phone), "1");
    // The controls survive the breakpoint; only WORDS are dropped.
    const dropped = SHEET
      .filter((rule) => rule.condition === phone && rule.declarations.get("display") === "none")
      .flatMap((rule) => rule.selector.split(",").map((one) => one.trim()));
    assert.deepEqual(dropped.sort(), [".bar-folder", ".bar-word", ".kbd"]);
  });
});

describe("5. asked not to move, it does not move", () => {
  test("the slide is one token and the reduced-motion block turns it off", () => {
    const reduced = "@media (prefers-reduced-motion: reduce)";
    assert.ok(String(token("--slide")).length > 0, "the motion is not named");
    for (const selector of [".scrim", ".drawer"]) {
      assert.match(
        String(valueOf(selector, "transition")), /var\(--slide\)/,
        `${selector} writes its own duration instead of taking the one token`,
      );
    }
    const off = SHEET.find(
      (rule) => rule.condition === reduced && rule.declarations.get("transition") === "none",
    );
    assert.ok(off, "nothing turns the motion off for someone who asked");
    for (const selector of [".scrim", ".drawer", ".chev"]) {
      assert.ok(
        off.selector.split(",").some((one) => one.trim() === selector),
        `${selector} still slides for a reader who asked it not to`,
      );
    }
  });

  test("OPENING THE DRAWER CANNOT MOVE THE READING COLUMN", () => {
    // research-polish-direction.md §3b names this as the frame's ONE constraint — "opening the
    // drawer must not move the reading column horizontally" — and the drawer was breaking it by
    // a route that has nothing to do with the drawer's own width. `.noscroll` hides the body's
    // overflow, the classic scrollbar goes away, and a column CENTRED in the frame slides by half
    // the width the frame just gained. Measured at 1440 wide: 485.2px at rest, 492.0px while the
    // drawer was open, 485.2px again after — 6.8px of travel each way, five times the 1.3637px
    // the row suite otherwise polices. Holding the gutter open permanently makes it 0.0000px.
    assert.equal(valueOf(".noscroll", "overflow"), "hidden", "the drawer stopped locking scroll");
    assert.equal(
      valueOf("html", "scrollbar-gutter"), "stable",
      "the gutter is not held open, so opening the drawer re-centres every line mid-read",
    );
    // The column is CENTRED, which is why the gutter has to be stable. If this ever stops being
    // true the reason above changes, and the rule should be re-derived rather than kept by habit.
    assert.equal(valueOf("body", "justify-content"), "center");
  });
});

describe("6. what the shell replaced is gone", () => {
  test("the <select> is retired — element, rules and wiring together", () => {
    // "Do not leave both" was the instruction, and a half-retirement is the failure mode: the
    // element removed and its stylesheet rules left behind, or the reverse.
    for (const corpse of ["viewPick", "<select", "optgroup", "gbar"]) {
      assert.ok(!CODE.includes(corpse), `${corpse} survived the retirement of the view chooser`);
    }
  });

  test("the one-button nav and the topbar are gone with it", () => {
    for (const corpse of ['id="nav"', 'class="topbar"', 'class="brand"']) {
      assert.ok(!CODE.includes(corpse), `${corpse} survived`);
    }
    for (const dead of [".nav", ".tab", ".tab.active", ".topbar", ".brand", "select"]) {
      assert.ok(!ruleFor(dead), `${dead} is a rule with nothing left to match`);
    }
  });

  test("the scales are stated once and the shell is written in them", () => {
    for (const name of ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--t1", "--t2", "--t3", "--t4"]) {
      assert.ok(token(name), `${name} is not declared`);
      assert.equal(
        SHEET.filter((rule) => rule.declarations.has(name)).length, 1,
        `${name} is declared more than once, which is how two scales become one wrong one`,
      );
    }
    // The shell's own rules take the ladder rather than inventing rungs. `1px` is exempt: a
    // hairline is a device pixel, not a step of a spacing scale.
    const SHELL = /^\.(bar|drawer|tree|fold|viewbtn|scrim|chev|count|rowname|kbd|noscroll)/;
    const shellRules = SHEET.filter((rule) =>
      rule.selector.split(",").some((one) => SHELL.test(one.trim())),
    );
    assert.ok(shellRules.length > 10, "the shell's rules are not where this test thinks they are");
    const magic = [];
    for (const rule of shellRules) {
      for (const [property, value] of rule.declarations) {
        if (!/^(padding|margin|gap|font-size|letter-spacing)/.test(property)) continue;
        for (const piece of String(value).split(/\s+/)) {
          if (/^-?[\d.]+(rem|em|px)$/.test(piece) && piece !== "1px") {
            magic.push(`${rule.selector} { ${property}: ${piece} }`);
          }
        }
      }
    }
    assert.deepEqual(magic, [], "these are numbers where a token should be");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7. THE ACTION RAIL
//
// The operator asked for "another menu bar, on bottom for mobile and equivalent for Mac, with
// icons". What he did NOT ask for, and what this deliberately is not, is a tab bar: `#entry` is a
// gate rather than a place, `#app` is unreachable (`loadState` is defined and never called), and
// so `#graph` is the only section a reader can be in. The 76 destinations this app really has are
// views in nested folders, and they already have the drawer. So the rail holds ACTIONS — which is
// also the shape of the bar along the bottom of his own phone: all 23 of `app.json`'s
// `mobileToolbarCommands` are commands and none of them is a destination.
//
// The sibling who built the top bar refused a desktop rail on the grounds that it would be "two
// layouts to keep in step". These tests are the answer: one element, one set of controls, and a
// red test rather than a promise if either width ever loses one.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** The rail's markup, and the ids of the controls inside it. */
const RAIL_MARKUP = /<nav id="rail"[\s\S]*?<\/nav>/.exec(PAGE)?.[0] ?? "";
const RAIL_BUTTON_IDS = [...RAIL_MARKUP.matchAll(/<button id="(\w+)"/g)].map((m) => m[1]);

describe("7. the rail is one element, and it holds actions", () => {
  test("there is exactly one rail, and exactly one of each control inside it", () => {
    assert.ok(RAIL_MARKUP, "app/index.html has no <nav id=\"rail\">");
    assert.equal((PAGE.match(/<nav id="rail"/g) ?? []).length, 1, "the rail is declared twice");
    assert.deepEqual(RAIL_BUTTON_IDS, ["viewsBtn", "refreshBtn", "signOut"]);
    // DUPLICATION IS THE MECHANISM OF DRIFT. A control that exists once cannot fall out of step
    // with itself, so the whole "two layouts" objection is answered by counting.
    for (const id of RAIL_BUTTON_IDS) {
      assert.equal(
        (PAGE.match(new RegExp(`id="${id}"`, "g")) ?? []).length, 1,
        `#${id} appears more than once — a second copy is a second thing to keep in step`,
      );
    }
    // And the bar it moved out of holds no control at all any more: it is where you are, and who.
    const barMarkup = /<header id="bar"[\s\S]*?<\/header>/.exec(PAGE)?.[0] ?? "";
    assert.ok(barMarkup, "the menu bar is gone");
    assert.ok(!barMarkup.includes("<button"), "a control is still duplicated in the menu bar");
  });

  test("NO CONTROL EXISTS AT ONE WIDTH AND NOT THE OTHER", () => {
    // The drift guard, and the reason a desktop rail does not mean two layouts. Every rule in
    // the sheet is read — INCLUDING the ones inside media queries, which is exactly where a
    // control would be quietly dropped — and none of them may remove the rail or anything in it.
    const RAIL_SELECTOR = /^\.(rail|railbtn|ico)$|^#(viewsBtn|refreshBtn|signOut)$/;
    const removed = [];
    for (const rule of SHEET) {
      const gone =
        rule.declarations.get("display") === "none" ||
        rule.declarations.get("visibility") === "hidden";
      if (!gone) continue;
      for (const one of rule.selector.split(",").map((s) => s.trim())) {
        if (RAIL_SELECTOR.test(one)) removed.push(`${one} @ ${rule.condition ?? "every width"}`);
      }
    }
    assert.deepEqual(removed, [], "a rail control is dropped at one of the two widths");

    // The rail is anchored to a different EDGE at each width, and that is the whole difference.
    const phone = "@media (max-width: 40rem)";
    assert.equal(valueOf(".rail", "inset"), "calc(var(--bar-h) + var(--safe-t)) auto 0 0");
    assert.equal(valueOf(".rail", "inset", phone), "auto 0 0 0");
    assert.equal(valueOf(".rail", "flex-direction"), "column");
    assert.equal(valueOf(".rail", "flex-direction", phone), "row-reverse");
  });

  test("no target the rail offers is smaller than 44px, from the same one token", () => {
    // The same token the bar's own controls take — so the rail cannot be 44 here and 40 there.
    assert.equal(valueOf(".railbtn", "min-height"), "var(--touch)");
    assert.equal(valueOf(".railbtn", "min-width"), "var(--touch)");
    assert.ok(Number.parseFloat(token("--touch")) * 16 >= 44, "--touch fell under the minimum");
  });

  test("the rail pays the safe-area inset at whichever edge it is standing on", () => {
    const phone = "@media (max-width: 40rem)";
    // Desktop: it stands on the LEFT edge and on the bottom, so it pays left and bottom.
    assert.match(String(valueOf(".rail", "padding")), /var\(--safe-l\)/);
    assert.match(String(valueOf(".rail", "padding")), /var\(--safe-b\)/);
    assert.match(String(valueOf(".rail", "width")), /var\(--safe-l\)/);
    // Phone: it stands on the BOTTOM edge, over the home indicator, and on both side edges in
    // landscape. Its HEIGHT carries the inset too — padding alone would put the controls in the
    // right place inside a bar that was too short for them.
    assert.match(String(valueOf(".rail", "padding", phone)), /var\(--safe-b\)/);
    assert.match(String(valueOf(".rail", "padding", phone)), /var\(--safe-l\)/);
    assert.match(String(valueOf(".rail", "padding", phone)), /var\(--safe-r\)/);
    assert.match(String(valueOf(".rail", "height", phone)), /var\(--safe-b\)/);
    // And an inset may only ever ADD room — taken against a step of the scale, never instead.
    assert.match(String(valueOf(".rail", "padding", phone)), /max\(var\(--s2\), var\(--safe-l\)\)/);
  });

  test("THE RAIL RESERVES ITS SPACE — it never floats over the last line of a view", () => {
    const phone = "@media (max-width: 40rem)";
    // One arithmetic, in the frame's own padding, and both anchorings pay it.
    const padding = String(valueOf("body", "padding"));
    assert.match(padding, /var\(--rail-bottom\)/, "the bottom anchoring reserves nothing");
    assert.match(padding, /var\(--rail-side\)/, "the left anchoring reserves nothing");
    // EXACTLY ONE OF THE TWO IS LIVE AT A TIME. Both non-zero would indent the column on a phone
    // for a rail that is not there; both zero is a bar sitting on top of the reader's last row.
    assert.equal(valueOf(":root", "--rail-bottom"), "0px");
    assert.equal(valueOf(":root", "--rail-side"), "var(--rail-w)");
    assert.equal(valueOf(":root", "--rail-bottom", phone), "var(--rail-h)");
    assert.equal(valueOf(":root", "--rail-side", phone), "0px");
    // And the frame has to be able to GROW for that padding to be worth anything. With
    // `height: 100%` the body does not grow for content that overflows it, the bottom padding
    // falls outside the scroll extent, and the rail covers the last row by its whole 56px —
    // measured at 390x844, last row bottom 844.1 against a rail top of 788.1 before this.
    assert.equal(valueOf("body", "min-height"), "100%");
    assert.equal(valueOf("body", "height"), undefined, "a fixed height throws the padding away");
  });

  test("EVERY CONTROL SAYS WHAT IT IS IN WORDS, at both widths", () => {
    // An icon alone is a rebus, and two of these three have no settled glyph to be a rebus of.
    // The label is a <span> of real text inside the button, and nothing may hide it — including
    // the phone breakpoint, which is where "labels on desktop only" would have put the exception.
    for (const id of RAIL_BUTTON_IDS) {
      const button = new RegExp(`<button id="${id}"[\\s\\S]*?</button>`).exec(RAIL_MARKUP)[0];
      const labels = [...button.matchAll(/<span(?: class="kbd")?>([^<]+)<\/span>/g)].map((m) => m[1]);
      assert.ok(
        labels.some((word) => /[A-Za-z]{3,}/.test(word)),
        `#${id} is a picture with no word on it`,
      );
      // aria-label is carried AS WELL, never instead — labelling it for a screen reader and
      // leaving it a rebus for everyone else is the failure this test exists to prevent.
      assert.ok(/aria-label=|aria-haspopup=/.test(button), `#${id} announces nothing`);
    }
    const hidesLabels = SHEET.some(
      (rule) =>
        rule.declarations.get("display") === "none" &&
        rule.selector.split(",").some((one) => /\.railbtn\s+span$|\.railbtn\s+\*/.test(one.trim())),
    );
    assert.equal(hidesLabels, false, "the labels are dropped at some width — that is icon-only");
  });

  test("the icons are one grid at one weight, and no glyph carries its own", () => {
    const icons = [...RAIL_MARKUP.matchAll(/<svg class="ico"([^>]*)>([\s\S]*?)<\/svg>/g)];
    assert.equal(icons.length, 3, "the rail does not have exactly three icons");
    for (const [, attributes, guts] of icons) {
      assert.match(attributes, /viewBox="0 0 24 24"/, "an icon is drawn on a different grid");
      assert.match(attributes, /aria-hidden="true"/, "an icon is read aloud beside its own label");
      // The weight, cap, join, fill and colour are `.ico`'s, once, for all three. A glyph that
      // set its own would be the one that arrives half a pixel heavier than its neighbours.
      for (const own of ["stroke-width", "stroke=", "fill=", "stroke-linecap"]) {
        assert.ok(!attributes.includes(own), `an icon sets its own ${own}`);
        assert.ok(!guts.includes(own), `a path inside an icon sets its own ${own}`);
      }
    }
    // Stated once, in the sheet, which is what makes the above enforceable rather than a habit.
    for (const [property, value] of [
      ["stroke-width", "1.5"], ["stroke", "currentColor"], ["fill", "none"],
      ["stroke-linecap", "round"], ["stroke-linejoin", "round"],
    ]) {
      assert.equal(valueOf(".ico", property), value, `.ico does not state ${property}`);
    }
    // NO FONT AND NO CDN. A dependency you fetch is a dependency that can fail to arrive and
    // leave three unlabelled buttons behind.
    assert.ok(!/<i class="fa|icomoon|material-icons|<link[^>]+icon.*font/i.test(PAGE));
  });

  test("asked not to move, the rail does not move", () => {
    const reduced = "@media (prefers-reduced-motion: reduce)";
    const off = SHEET.find(
      (rule) => rule.condition === reduced && rule.declarations.get("transition") === "none",
    );
    assert.ok(off, "nothing turns motion off for someone who asked");
    // `.railbtn` is a <button>, and `button` is in that block — so the rail is covered by the
    // rule that is already there rather than by a fourth selector that could be forgotten.
    assert.ok(
      off.selector.split(",").some((one) => one.trim() === "button"),
      "the reduced-motion block stopped covering buttons, which is what covers the rail",
    );
    assert.match(String(valueOf(".railbtn", "transition")) === "undefined"
      ? "inherited" : String(valueOf(".railbtn", "transition")), /inherited|var\(--slide\)/,
      "the rail writes its own duration instead of taking the one token");
  });

  test("the rail appears with the session and leaves with it", () => {
    page.showShell(true);
    assert.ok(!el("rail").classList.contains("hidden"), "signed in, and no rail");
    assert.ok(!el("who").classList.contains("hidden"));
    page.showShell(false);
    assert.ok(el("rail").classList.contains("hidden"), "signed out, and the controls are still up");
    assert.ok(el("who").classList.contains("hidden"), "signed out, and the handle is still up");
    page.showShell(true);
  });

  test("nothing in the rail writes — the vault's shape is not editable from the chrome", () => {
    // The line the sibling drew, held. No new / rename / move / delete: the app has no operation
    // for them, and a menu offering them would be a SECOND write path beside `commitLine`.
    for (const forbidden of ["/app/new", "/app/rename", "/app/move", "/app/delete"]) {
      assert.ok(!CODE.includes(forbidden), `the chrome grew a write path: ${forbidden}`);
    }
    const writes = [...CODE.matchAll(/api\("([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(
      [...new Set(writes)].sort(),
      ["/app/capture", "/app/done", "/app/edit-file", "/app/graph", "/app/state",
       "/auth/login/options", "/auth/login/verify", "/auth/logout",
       "/auth/register/options", "/auth/register/verify"],
      "the page calls an endpoint it did not before",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 8. READING THE GRAPH AGAIN
//
// The freshness line has always said "as of <when> · N queued" and there has never been a way to
// ask again short of reloading the page. It is the one control in the rail that touches the
// network, and it is a GET.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("8. a re-read keeps your place", () => {
  test("it lands on the view you were in, when the snapshot still has it", () => {
    assert.equal(page.landOn(VIEWS, "qntm-queue").id, "qntm-queue");
    assert.equal(page.landOn(VIEWS, "habit-dojo").id, "habit-dojo");
  });

  test("it falls back rather than insisting — a view can leave between two reads", () => {
    // Renamed on the laptop, so the id is simply not there any more. `this-week` is the default.
    assert.equal(page.landOn(VIEWS, "a-view-that-was-renamed-away").id, "this-week");
    assert.equal(page.landOn(VIEWS, null).id, "this-week");
    // And with no `this-week` either, the first view rather than a crash.
    const without = VIEWS.filter((v) => v.id !== "this-week");
    assert.equal(page.landOn(without, null).id, without[0].id);
  });

  test("THE RE-READ DOES NOT THROW THE READER BACK TO THE DEFAULT VIEW", async () => {
    // Which is what a button wired straight to `loadGraph` would have done, every time, because
    // it has always chosen `this-week` — right at sign-in and wrong at every other moment.
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), method: options.method });
      return {
        ok: true,
        json: async () => ({
          ok: true, handle: "luke", pending_edits: 0,
          snapshot: { generated_at: "2026-07-30T10:00:00Z", views: VIEWS },
        }),
      };
    };
    page.__setGraphData({ snapshot: { generated_at: "2026-07-30T09:00:00Z", views: VIEWS } });
    page.__setCurrentViewId("flowtrace-queue");

    await page.refresh();

    assert.equal(page.__currentViewId(), "flowtrace-queue", "the re-read moved the reader");
    assert.deepEqual(calls.map((c) => c.method), ["GET"], "the re-read wrote something");
    assert.match(calls[0].url, /\/app\/graph$/);
  });

  test("it says it is working, and stops saying so when it lands", async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        ok: true, handle: "luke", pending_edits: 0,
        snapshot: { generated_at: "2026-07-30T10:00:00Z", views: VIEWS },
      }),
    });
    page.__setGraphData({ snapshot: { generated_at: "x", views: VIEWS } });
    await page.refresh();
    assert.equal(el("refreshBtn").getAttribute("aria-busy"), null, "it stayed busy after landing");
  });

  test("a failed read leaves the view standing", async () => {
    // "could not read: <message>" — the sentence this arm used to check — is retired
    // (chore/retire-the-status-line); `refresh`'s `catch` is now silent. The functional recovery
    // below (the view holds, the button un-busies) is unchanged and is what is left to prove.
    globalThis.fetch = async () => { throw new Error("offline"); };
    page.__setGraphData({ snapshot: { generated_at: "x", views: VIEWS } });
    page.__setCurrentViewId("all-work");
    await page.refresh();
    assert.equal(page.__currentViewId(), "all-work", "a failed read moved the reader anyway");
    assert.equal(el("refreshBtn").getAttribute("aria-busy"), null, "it stayed busy after failing");
  });

  test("with no session there is nothing to re-read", async () => {
    let asked = false;
    globalThis.fetch = async () => { asked = true; return { ok: true, json: async () => ({}) }; };
    page.__setGraphData(null);
    await page.refresh();
    assert.equal(asked, false, "it went to the network with nobody signed in");
  });

  test("an empty snapshot is a sentence, not a crash", async () => {
    // It stopped being hypothetical when the graph became re-readable on demand: the old
    // `views[0]` would have been `undefined` and the next line would have thrown inside a press.
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ ok: true, handle: "luke", pending_edits: 0,
        snapshot: { generated_at: "2026-07-30T10:00:00Z", views: [] } }),
    });
    page.__setGraphData({ snapshot: { generated_at: "x", views: VIEWS } });
    await page.refresh();
    // THE SENTENCE MOVED, AND SO DID WHAT IT SAYS. It used to be "No snapshot yet — run
    // graph-sync push on the laptop." on `#freshness`, which is an instruction addressed to
    // exactly one person and was the entire first impression of every account that is not his.
    // It is now the `#empty` block, which tells an account with no graph apart from a graph with
    // nothing in it — tests/app-entry.test.mjs section 5 owns what it says. What THIS test has
    // always been about is unchanged: an empty view list is a sentence rather than a crash, and
    // the old `views[0]` would have been `undefined` with the next line throwing inside a press.
    assert.ok(!el("empty").classList.contains("hidden"), "an empty snapshot showed nothing at all");
    assert.ok(el("emptyHead").textContent, "the empty state has no heading");
    assert.equal(page.__currentViewId(), null);
  });
});

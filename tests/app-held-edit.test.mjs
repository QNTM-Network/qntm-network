/**
 * A VANISHED OR REFUSED EDIT IS HELD, UNANCHORED — NEVER DROPPED.
 *
 *   node --test tests/app-held-edit.test.mjs
 *
 * ── THE TWO BACKLOG ROWS THIS IS EVIDENCE FOR, AND WHY THEY ARE ONE SUITE ──
 *
 * `the-vanished-line-is-parked-not-dropped` — the CYCLE removed the line the cursor was on.
 * `a-refused-edit-is-held-unanchored`      — the SERVER declined the write.
 *
 * They were filed as two rows and they are ONE MECHANISM. To the person typing, both are the same
 * event: characters that were his a moment ago, that no file now owns. The app's answer is one
 * surface (`app/present/held.ts`), one strip on the page, one release rule, and one sentence
 * pattern. Proving them separately would mean writing the same evidence twice and letting the two
 * halves drift.
 *
 * THE OPERATOR CHOSE THIS BEHAVIOUR BY NAME, asked directly what should happen when he has typed
 * into a line and a new projection arrives without it: "hold the edit, unanchored — your typing
 * survives as a row the source doesn't own, like the draft line already works." He chose it over
 * REFUSING the arrival (cheap, never wrong, but the typing is lost) and over MOVING TO THE NEAREST
 * SURVIVOR (never stuck, but he types into a line he did not choose).
 *
 * ── THE FOUR WAYS A LINE GOES ABSENT, AND THE ONE THE BROWSER CANNOT TELL APART ──
 *
 * Section 2 drives all four through the real page. Two of them are the two `absent` CAUSES
 * `tests/present-replay.test.mjs` already distinguishes and hands to this row deliberately:
 *
 *   §2a  A GENUINE DELETION. `anchor.node` is a real id, so the two-tier walk's node tier really
 *        ran and really found nothing (replay §2d).
 *   §2b  THE FIRST STAMP OF AUTHORING. `anchor.node` is `null`, so the node tier never ran at all —
 *        an unstamped line's identity is its own changing text, and the cycle changed it (replay
 *        §1). This is the marquee case: the characters at risk are the ones HE JUST TYPED.
 *   §2c  MOVED OUT OF THE VIEW. Shaped identically to §2a on the wire, and the browser genuinely
 *        CANNOT tell them apart — `snapshot.graph` carries the node list and nothing reads it
 *        (design-the-edit-is-a-safe-haven.md §6.4, backlog `resolve-from-the-model-not-the-text`).
 *        Both are tested anyway, because "the app does the same safe thing either way" is the claim,
 *        and a claim about two situations needs two fixtures.
 *   §2d  REFUSED BY A 409. No projection at all; the write came back declined.
 *
 * ── WHAT THIS SUITE DOES NOT VERIFY ──
 *
 * No browser was opened. No passkey session, no live graph server, no engine cycle, no real POST.
 * Every projection below is a FIXTURE — a second string, hand-built the way a real cycle transforms
 * a real line — and the 409s are a stubbed `fetch`. The refusal is not switched on anywhere: the
 * server half is `vault-file-accepts-a-precondition`, in another repository.
 */

import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertMutated,
  importPage,
  installBrowser,
  makeEvent,
  makeWorkDir,
  walk,
  REPO,
} from "./fixtures/app-html-page.mjs";

const HERE = resolve(fileURLToPath(import.meta.url), "..");

const { HeldSurface, heldFrom, keyOf } = await import(join(REPO, "dist", "present.js"));

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 0. THE MODULE IS THE SHAPE ITS OWN HEADER CLAIMS
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A source file with its comments removed.
 *
 * IT MATTERS FOR THIS MODULE SPECIFICALLY. `held.ts`'s prose says `applyEdit` and `lineIndex` out
 * loud, repeatedly and on purpose — the header's whole argument is about the fields and calls it
 * REFUSES. A scan that counted the essay would measure the argument rather than the code, which is
 * the same trap `tests/app-stale-write-refusal.test.mjs` names for its own `409` count.
 */
const codeOf = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const HELD_TS = readFileSync(join(REPO, "app", "present", "held.ts"), "utf8");

describe("0. held.ts is the shape its own header claims", () => {
  const CODE = codeOf(HELD_TS);

  test("it imports nothing — there is no module it could reach an edit through", () => {
    assert.deepEqual(CODE.match(/^import\b.*$/gm), null, "held.ts gained an import");
  });

  test("PURE — no DOM, no fetch, no clock, proved by making all three throw", () => {
    // The same drive tests/present-base.test.mjs applies to `BaseSurface`. A module that reached
    // for any of the three would fail here rather than in a browser six months from now.
    //
    // THE DESCRIPTOR IS SAVED AND RESTORED, NOT THE VALUE. `installBrowser` later in this file
    // ASSIGNS `globalThis.document`, so leaving behind a non-writable property here would break
    // every arm that drives the page — measured, the first time this was written.
    const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const savedFetch = globalThis.fetch;
    const savedNow = Date.now;
    const explode = (what) => () => {
      throw new Error(`held.ts reached for ${what}`);
    };
    try {
      Object.defineProperty(globalThis, "document", {
        value: new Proxy({}, { get: explode("the DOM") }),
        configurable: true,
        writable: true,
      });
      globalThis.fetch = explode("the network");
      Date.now = explode("the clock");

      const surface = new HeldSurface();
      surface.hold(heldFrom("vanished", { text: "- [ ] a", view: "v", path: "v.md", instance: "v/0/- [ ] a", node: null, base: null }));
      surface.settle("v.md", "- [ ] a");
      surface.hold(heldFrom("refused", { text: "- [ ] b", view: "v", path: "v.md", instance: null, node: null, base: "sha256-x" }));
      surface.discard(surface.rows[0].id);
      surface.clear();
      assert.equal(surface.count, 0);
    } finally {
      if (savedDocument === undefined) {
        delete globalThis.document;
      } else {
        Object.defineProperty(globalThis, "document", savedDocument);
      }
      globalThis.fetch = savedFetch;
      Date.now = savedNow;
    }
  });

  test("THE FIELD IT REFUSES — no line index anywhere in the type or the class", () => {
    // The single most important thing this module does NOT have. An index is what `applyEdit`
    // takes, so a held record carrying one is a record a later change could post. `instance` is an
    // identity and nothing in the bundle can turn one back into an index in a string that no longer
    // contains it.
    assert.equal(CODE.match(/\blineIndex\b/g), null, "a held row gained a line index");
  });

  test("it names no edit constructor — `applyEdit` and `SourceEdit` appear in neither the code nor the imports", () => {
    assert.equal(CODE.match(/\bapplyEdit\b|\bSourceEdit\b|\binsert-line\b|\bset-line\b/g), null);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SURFACE — one held row or many, superseding, releasing
// ══════════════════════════════════════════════════════════════════════════════════════════════

const edit = (over = {}) => ({
  text: "- [ ] Ring the dentist",
  view: "inbox",
  path: "inbox.md",
  instance: "inbox/1/- [ ] Ring the dentist",
  node: null,
  base: null,
  ...over,
});

describe("1. HeldSurface — what happens to a SECOND held row, said rather than left undefined", () => {
  test("MANY, NEWEST FIRST — a second event never evicts the first", () => {
    const held = new HeldSurface();
    held.hold(heldFrom("vanished", edit()));
    held.hold(heldFrom("refused", edit({ text: "- [x] Water the plants", instance: "inbox/1/qntm:122", node: "qntm:122" })));

    assert.equal(held.count, 2, "the first row was evicted — his characters were dropped to make room");
    assert.equal(held.rows[0].text, "- [x] Water the plants", "newest first — the row he was looking at");
    assert.equal(held.rows[1].text, "- [ ] Ring the dentist");
  });

  test("SUPERSEDED, LOSSLESSLY — a retried save for the same line replaces its own earlier row", () => {
    // The one way junk would otherwise accumulate: he retries a declined save and gets a second row
    // for the same characters. The replacement is only allowed when the new text CONTAINS the old,
    // so nothing the earlier row held can be lost by it.
    const held = new HeldSurface();
    held.hold(heldFrom("refused", edit({ text: "- [ ] Ring the dentist" })));
    held.hold(heldFrom("refused", edit({ text: "- [ ] Ring the dentist about the crown" })));

    assert.equal(held.count, 1, "two rows for one line");
    assert.equal(held.rows[0].text, "- [ ] Ring the dentist about the crown");
  });

  test("AND IT STACKS WHEN NEITHER CONTAINS THE OTHER — two texts are two pieces of writing", () => {
    const held = new HeldSurface();
    held.hold(heldFrom("refused", edit({ text: "- [ ] Ring the dentist" })));
    held.hold(heldFrom("refused", edit({ text: "- [ ] Ring the doctor", instance: "inbox/1/- [ ] Ring the dentist" })));

    assert.equal(held.count, 2, "replacing here would have destroyed characters the first row held");
  });

  test("the supersession key is the view plus the identity, falling back to the characters", () => {
    assert.equal(keyOf(edit()), "inbox inbox/1/- [ ] Ring the dentist");
    assert.equal(keyOf(edit({ instance: null })), "inbox - [ ] Ring the dentist");
    assert.notEqual(keyOf(edit()), keyOf(edit({ view: "this-week" })), "two views share one key");
  });

  test("EMPTY CHARACTERS ARE NOT HELD — a blank line has nothing in it to lose", () => {
    const held = new HeldSurface();
    assert.equal(heldFrom("vanished", edit({ text: "   " })), null);
    assert.equal(held.hold(null), null, "a null record must be a no-op, not a throw");
    assert.equal(held.count, 0);
  });
});

describe("1b. HeldSurface.settle — THE ONLY automatic release, and it fails toward keeping", () => {
  const surfaceHolding = (text) => {
    const held = new HeldSurface();
    held.hold(heldFrom("vanished", edit({ text })));
    return held;
  };

  test("RELEASED — the projection brings the line back exactly as he typed it", () => {
    const held = surfaceHolding("- [ ] Ring the dentist");
    const released = held.settle("inbox.md", "## Domain Empty\n- [ ] Ring the dentist\n");
    assert.equal(released.length, 1);
    assert.equal(held.count, 0);
  });

  test("RELEASED — the projection brings it back with the cycle's own tokens APPENDED", () => {
    // The one real shape every stamped line in the operator's own vault shows: the title first,
    // cycle-appended tokens after, never a rewritten prefix. Same check tests/present-replay.test.mjs
    // makes for `preserved`.
    const held = surfaceHolding("- [ ] Ring the dentist");
    held.settle("inbox.md", "## Domain Empty\n- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01\n");
    assert.equal(held.count, 0);
  });

  test("NOT RELEASED — a different file, however similar its contents", () => {
    const held = surfaceHolding("- [ ] Ring the dentist");
    held.settle("this_week.md", "- [ ] Ring the dentist\n");
    assert.equal(held.count, 1, "a row was released against a file it never belonged to");
  });

  test("NOT RELEASED BY A PREFIX THAT IS NOT AN APPEND — `- ` must not match every task line", () => {
    // The narrowing that has no magic number in it: the held text must end in a non-space and the
    // arrived line must continue with a space. Releasing wrongly LOSES his characters, so this
    // comparison is deliberately the strict one.
    const held = surfaceHolding("- ");
    held.settle("inbox.md", "- [ ] Ring the dentist\n");
    assert.equal(held.count, 1, "a two-character row was released by a line that merely starts with it");
  });

  test("NOT RELEASED when the cycle REWROTE the line rather than appending to it", () => {
    const held = surfaceHolding("- [ ] Ring the dentist");
    held.settle("inbox.md", "- [ ] RING THE DENTIST [[qntm:2604]]\n");
    assert.equal(held.count, 1, "a rewritten line is not the characters he typed");
  });

  test("NOTHING ELSE RELEASES — not a repaint, not another hold, not a second settle of another file", () => {
    const held = surfaceHolding("- [ ] Ring the dentist");
    held.hold(heldFrom("refused", edit({ text: "- [ ] Something else", instance: "inbox/1/x" })));
    held.settle("inbox.md", "## Domain Empty\n");
    held.settle("other.md", "- [ ] Ring the dentist\n");
    assert.equal(held.count, 2, "a row was released by an event that owns none of its characters");
  });

  test("DISCARD — his own dismissal, by handle, and it removes exactly one", () => {
    const held = new HeldSurface();
    const first = held.hold(heldFrom("vanished", edit()));
    held.hold(heldFrom("vanished", edit({ text: "- [ ] Another", instance: "inbox/1/y" })));
    assert.equal(held.discard(first.id), true);
    assert.equal(held.count, 1);
    assert.equal(held.rows[0].text, "- [ ] Another");
    assert.equal(held.discard(first.id), false, "discarding twice must not remove a second row");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE FOUR WAYS A LINE GOES ABSENT — through the real app/index.html
// ══════════════════════════════════════════════════════════════════════════════════════════════

const PATH = "work/outcomes.md";
const OTHER_PATH = "work/inbox.md";

/** Two stamped lines. Line 3 is `qntm:121` — the cursor's line in every §2 arm but the authoring one. */
const V1 = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Draft the launch note [[qntm:121]] #task",
  "- [ ] Water the plants [[qntm:122]] #task",
  "",
].join("\n");
const CURSOR = 3;
const CURSOR_TEXT = V1.split("\n")[CURSOR];

/** §2a — the cycle DELETED it: the node is not printed anywhere in what arrived. */
const DELETED = V1.split("\n").filter((_, at) => at !== CURSOR).join("\n");

/** §2c — the same shape, reached by the node LEAVING THE VIEW. Indistinguishable on the wire. */
const MOVED_OUT = ["# This Week", "", "## Overdue", "- [ ] Water the plants [[qntm:122]] #task", ""].join("\n");

/** §2b — an UNSTAMPED line: its identity is its own text, so `anchor.node` is `null`. */
const BARE = ["# This Week", "", "## Overdue", "- [ ] Ring the dentist", ""].join("\n");
const TYPED = "- [ ] Ring the dentist #work";
/** What a real cycle does with it: mints the node, and the line leaves this view (replay §1). */
const STAMPED_ELSEWHERE = ["# This Week", "", "## Overdue", ""].join("\n");

/**
 * §2f — THE SAME AUTHORING SHAPE AS §2b, EXCEPT THE LINE STAYS IN THE VIEW. `BARE` above has no
 * stamped line in its section at all, so it is the case the relative anchor REFUSES (there is no
 * landmark that outlives the cycle — app/present/relative.ts). This one has `qntm:122` under it,
 * which is what the operator's own inbox actually looks like when he captures into it.
 */
const BARE_WITH_NEIGHBOUR = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Ring the dentist",
  "- [ ] Water the plants [[qntm:122]] #task",
  "",
].join("\n");
const AUTHORED = 3;
/** What a real cycle does when the line STAYS: mints the node and appends its tokens after his. */
const STAMPED_IN_PLACE = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
  "- [ ] Water the plants [[qntm:122]] #task",
  "",
].join("\n");
/** The same arrival, with the cycle having RE-SORTED his line above the heading's other item. */
const STAMPED_AND_RESORTED = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Water the plants [[qntm:122]] #task",
  "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
  "",
].join("\n");

/** §3 — the same characters coming BACK, with the cycle's own tokens appended. */
const CAME_BACK = ["# This Week", "", "## Overdue", `${TYPED} [[qntm:2604]] #task 🆕 2026-08-01`, ""].join("\n");

const WORK = makeWorkDir("app-held-edit");

/**
 * ONE DRIVER, USED BY SECTIONS 2, 3, 4 AND BOTH MUTATION PROOFS — so a mutated page is driven by
 * exactly the same code as the real one, and a difference in outcome can only be the mutation.
 *
 * EVERY METHOD PINS ITS OWN PAGE'S GLOBALS FIRST (`use`). This file stands up more than one page
 * module, and `installBrowser` replaces `globalThis.document` while the page's own `$` resolves it
 * at CALL time — so a second page's setup landing between a first page's arms would silently paint
 * one page's rows into the other page's document. Pinning per call makes the ordering irrelevant
 * instead of relying on it.
 */
function makeDriver(page, browser, control) {
  const settle = () => new Promise((r) => setImmediate(r));
  const elements = browser.elements;

  const use = () => {
    globalThis.document = browser.document;
    globalThis.fetch = browser.fetch;
  };

  const view = (markdown, id, path) => ({ id, path, title: id, domain: "work", markdown });

  const envelope = (markdown) => ({
    ok: true,
    handle: "luke",
    pending_edits: 0,
    snapshot: {
      generated_at: "2026-08-01T09:00:00Z",
      views: [view(markdown, "this-week", PATH), view("# Inbox\n", "inbox", OTHER_PATH)],
    },
  });

  /**
   * A projection arrives and the page installs it — `graphData`, `paintView`, `sayAsOf`, in the
   * order every write path in the real page uses them. `sayAsOf` is what puts `cursorNote` on the
   * freshness line, so an arm that skipped it could not see the sentence at all.
   */
  const land = (markdown, id = "this-week") => {
    use();
    const data = envelope(markdown);
    page.__setGraphData(data);
    page.paintView(id);
    page.__sayAsOf(data);
    return elements.get("freshness").textContent;
  };

  /** Put the cursor on a line, with this page's own document pinned first. */
  const setFocus = (lineIndex, source) => {
    use();
    page.__setFocus(lineIndex, source);
  };

  const taskText = () =>
    walk(elements.get("viewBody")).find((el) => el.tagName === "span" && el.innerHTML !== "");
  const openInput = () => walk(elements.get("viewBody")).find((el) => el.type === "text");

  /** Park the cursor on the heading first, so `taskText()` is the first TASK and not the cursor's row. */
  const open = (markdown) => {
    land(markdown);
    setFocus(0, markdown);
    page.paintView("this-week");
  };

  /** Type `text` into the first task line and blur — one committed line edit through the real path. */
  async function typeAndCommit(before, text) {
    open(before);
    taskText().dispatch("click", makeEvent());
    const input = openInput();
    input.value = text;
    input.dispatch("blur");
    await settle();
  }

  return {
    page,
    elements,
    use,
    settle,
    land,
    open,
    taskText,
    openInput,
    typeAndCommit,
    setFocus,
    logout: () => {
      use();
      page.logout();
    },
    /**
     * START AN ARM FROM A CLEAN SLATE. It lands the OTHER view first, which makes the arm's own
     * first `land` a VIEW CHANGE rather than a projection arrival — `paintView`'s `sameView` is
     * false, so a cursor left anchored by the previous arm cannot produce a hold that this arm did
     * not cause. Then it drops whatever is held, so every count below starts at zero.
     */
    arm: () => {
      land("# Inbox\n", "inbox");
      page.__held().clear();
      page.__paintHeldRows();
      control.refuseWith = null;
      control.nextProjection = null;
      control.posted.length = 0;
    },
    freshness: () => elements.get("freshness").textContent,
    heldRows: () => walk(elements.get("heldRows")),
    heldTexts: () =>
      walk(elements.get("heldRows"))
        .filter((el) => el.tagName === "input")
        .map((el) => el.value),
    heldWheres: () =>
      walk(elements.get("heldRows"))
        .filter((el) => el.tagName === "p")
        .map((el) => el.textContent),
    stripHidden: () => elements.get("heldStrip").classList.contains("hidden"),
    control,
  };
}

/** Install a browser and a fetch stub, import a page (optionally mutated), and return a driver. */
async function standUpPage(workDir, mutate) {
  const browser = installBrowser();
  const control = { refuseWith: null, nextProjection: null, posted: [] };
  browser.fetch = async (url, init) => {
    if (control.refuseWith) {
      return { ok: false, status: control.refuseWith.status, json: async () => control.refuseWith.body };
    }
    const body = JSON.parse(init.body);
    control.posted.push(body);
    const markdown = control.nextProjection ?? body.markdown;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        handle: "luke",
        pending_edits: 0,
        snapshot: {
          generated_at: "2026-08-01T09:00:00Z",
          views: [
            { id: "this-week", path: PATH, title: "This Week", domain: "work", markdown },
            { id: "inbox", path: OTHER_PATH, title: "Inbox", domain: "work", markdown: "# Inbox\n" },
          ],
        },
      }),
    };
  };
  globalThis.fetch = browser.fetch;
  const page = await importPage(workDir, mutate);
  return makeDriver(page, browser, control);
}

describe("2. THE FOUR WAYS A LINE GOES ABSENT — his characters survive every one", () => {
  let d;
  let page;

  before(async () => {
    d = await standUpPage(WORK);
    page = d.page;
  });

  // EVERY ARM STARTS FROM A CLEAN SLATE — see `arm` in the driver for why it lands the other view
  // first rather than only clearing what is held.
  beforeEach(() => d.arm());

  test("2a. DELETED BY THE CYCLE — the anchor HAD a node, the node tier ran and found nothing", () => {
    d.land(V1);
    d.setFocus(CURSOR, V1);
    assert.equal(page.__focusAnchor().node, "qntm:121", "the arm did not set up the §2d shape");

    d.land(DELETED);

    const rows = page.__held().rows;
    assert.equal(rows.length, 1, "the characters were dropped");
    assert.equal(rows[0].text, CURSOR_TEXT, "the wrong line's characters were held");
    assert.equal(rows[0].node, "qntm:121", "the node the row named was not carried");
    assert.equal(rows[0].reason, "vanished");
    assert.equal(rows[0].path, PATH, "a held row must name the file it came from");
    // AND IT IS ON SCREEN, not merely in a variable.
    assert.deepEqual(d.heldTexts(), [CURSOR_TEXT]);
    assert.equal(d.stripHidden(), false);
    assert.match(d.freshness(), /the line you were on is not in this view any more — what was on it is held above this view/);
  });

  test("2b. THE FIRST STAMP OF AUTHORING — the characters held are the ones HE TYPED, not the ones that were there", async () => {
    // THE MARQUEE CASE (replay §1). An unstamped line's identity is its own text, so `anchor.node`
    // is null and the two-tier walk's second tier cannot run at all. This is also the only arm where
    // the pre-edit line and the typed line differ, so it is the one that proves the app holds the
    // right one of the two.
    d.control.nextProjection = STAMPED_ELSEWHERE;
    await d.typeAndCommit(BARE, TYPED);

    const rows = page.__held().rows;
    assert.equal(rows.length, 1, "his own typing was dropped");
    assert.equal(rows[0].text, TYPED, "the app held the line as it was BEFORE he typed into it");
    assert.equal(rows[0].node, null, "this arm is not the §2a shape — the node tier never ran");
    assert.deepEqual(d.heldTexts(), [TYPED]);
  });

  test(
    "2f. THE FIRST STAMP OF AUTHORING, WHEN THE LINE STAYS — the cursor holds and NOTHING is held. " +
      "This is `author-in-the-browser-not-in-obsidian`'s own blocker, through the real page.",
    () => {
      d.land(BARE_WITH_NEIGHBOUR);
      d.setFocus(AUTHORED, BARE_WITH_NEIGHBOUR);
      const anchor = page.__focusAnchor();
      assert.equal(anchor.node, null, "the line he is authoring still has no node — nothing about that changed");
      assert.equal(anchor.relative.below, "qntm:122", "and it now carries where it SAT");

      d.land(STAMPED_IN_PLACE);

      assert.equal(page.__focusIndex(), AUTHORED, "the cursor left the line he was writing");
      assert.equal(page.__held().count, 0, "nothing was lost, so nothing should be held");
      assert.match(d.freshness(), /^as of .* · 0 queued$/, "a restore this certain needs no sentence");
    },
  );

  test(
    "2g. THE SAME, WITH THE CYCLE RE-SORTING IT — the cursor follows by the characters, and the " +
      "page SAYS the claim was weaker, because the line is somewhere he did not put it",
    () => {
      d.land(BARE_WITH_NEIGHBOUR);
      d.setFocus(AUTHORED, BARE_WITH_NEIGHBOUR);

      d.land(STAMPED_AND_RESORTED);

      assert.equal(page.__focusIndex(), 4, "the cursor did not follow the line the cycle moved");
      assert.equal(page.__held().count, 0);
      assert.match(d.freshness(), /the cycle moved the line you were writing/);
    },
  );

  test("2c. MOVED OUT OF THE VIEW — the same safe answer, and the browser cannot tell it from 2a", () => {
    d.land(V1);
    d.setFocus(CURSOR, V1);

    d.land(MOVED_OUT);

    assert.deepEqual(d.heldTexts(), [CURSOR_TEXT]);
    // The claim, stated as an assertion rather than only in prose: what reached the browser in this
    // arm and in §2a is the SAME kind of evidence — a projection with the line missing — and the
    // answer is identical. Telling them apart needs `snapshot.graph`, which nothing reads.
    assert.equal(page.__held().rows[0].reason, "vanished");
  });

  test("2d. REFUSED BY A 409 — held, and the base it was computed against is held with it", async () => {
    d.control.refuseWith = {
      status: 409,
      body: { ok: false, error: "stale base", refused: "stale-base", path: PATH, current: V1 },
    };

    await d.typeAndCommit(V1, "- [ ] Draft the launch note BY FRIDAY [[qntm:121]] #task");

    const rows = page.__held().rows;
    assert.equal(rows.length, 1, "a refused edit was dropped");
    assert.equal(rows[0].text, "- [ ] Draft the launch note BY FRIDAY [[qntm:121]] #task");
    assert.equal(rows[0].reason, "refused");
    assert.match(rows[0].base, /^sha256-[0-9a-f]{64}$/, "the base the server declined was not carried");
    // THE SECOND HALF OF THE SENTENCE MOVED WHEN `the-view-heals-itself` LANDED, and the FIRST half
    // — the one this arm is really about — did not. The refusal carried `current`, so the view
    // adopted it and "still on this line" stopped being true; what is still true, and is the only
    // thing §2 exists to prove, is that his characters are held. The screen losing a second copy of
    // something the strip is holding is exactly what the holding was built to make safe.
    assert.match(d.freshness(), /what you typed is held above this view/);
    assert.match(d.freshness(), /your next save will go through/, "the view did not heal itself");
  });

  test("2d(ii). REFUSED WITH NOTHING TO ADOPT — the older sentence, word for word, still true", async () => {
    // A 409 the graph server answered without `current` (it is entitled to: worker/src/app.js
    // passes it through verbatim and sends `null` when there is none). Nothing repainted, so the
    // characters really are still on the line AND held, and the page says both.
    d.control.refuseWith = {
      status: 409,
      body: { ok: false, error: "stale base", refused: "stale-base", path: PATH, current: null },
    };

    await d.typeAndCommit(V1, "- [ ] Draft the launch note BY FRIDAY [[qntm:121]] #task");

    assert.equal(page.__held().rows.length, 1, "a refused edit was dropped");
    assert.match(d.freshness(), /your characters are still on this line · what you typed is held above this view/);
  });

  test("2e. AND THE HELD ROW SURVIVES THE NEXT PROJECTION — the whole point of holding it at all", () => {
    // Before this row landed, a 409 kept the characters on screen and NOWHERE ELSE: the next
    // projection to arrive replaced both the screen and the painter's source. This is that arrival.
    d.land(V1);
    d.setFocus(CURSOR, V1);
    d.land(DELETED);
    assert.equal(page.__held().count, 1, "the arm did not set up");

    d.land(MOVED_OUT);
    d.land(DELETED);

    assert.deepEqual(d.heldTexts(), [CURSOR_TEXT], "two more projections erased what was held");
  });

  test("AMBIGUOUS HOLDS NOTHING — the characters are demonstrably still in the file, twice", () => {
    // THE NODE MOVED OUT OF ITS OWN SECTION AND IS NOW PRINTED IN TWO OTHERS. That is what it takes
    // to reach `ambiguous` rather than `found`: the instance tier keys on the SECTION ORDINAL, so a
    // node still printed under its original heading is found by instance and the node tier never
    // runs (`app/present/instance.ts`). Only when the instance is gone AND the node answers more
    // than once does the walk refuse. `~/qntm/this_week.md` prints three real nodes twice each, so
    // this is a real shape rather than a hypothetical.
    const twice = [
      "# This Week",
      "",
      "## Overdue",
      "",
      "## Later",
      "- [ ] Draft the launch note [[qntm:121]] #task",
      "",
      "## Even Later",
      "- [ ] Draft the launch note [[qntm:121]] #task",
      "",
    ].join("\n");
    d.land(V1);
    d.setFocus(CURSOR, V1);

    d.land(twice);

    assert.equal(page.__held().count, 0, "a held row was created for characters the file still owns");
    assert.match(d.freshness(), /prints that line more than once/);
  });

  test("AN ORDINARY ARRIVAL HOLDS NOTHING — the positive control this whole section needs", () => {
    d.land(V1);
    d.setFocus(CURSOR, V1);

    d.land(V1.replace("## Overdue", "## Overdue Now"));

    assert.equal(page.__held().count, 0, "a row that is still there was held anyway");
    assert.equal(d.stripHidden(), true, "the strip is on screen with nothing in it");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. WHEN IT CLEARS, AND WHETHER IT SURVIVES A VIEW CHANGE
// ══════════════════════════════════════════════════════════════════════════════════════════════

const WORK_CLEARING = makeWorkDir("app-held-edit-clearing");

describe("3. WHEN A HELD ROW CLEARS — exactly three ways, and a view change is not one of them", () => {
  let d;
  let page;

  before(async () => {
    d = await standUpPage(WORK_CLEARING);
    page = d.page;
  });

  // EVERY ARM STARTS FROM A CLEAN SLATE — see `arm` in the driver for why it lands the other view
  // first rather than only clearing what is held.
  beforeEach(() => d.arm());

  test("IT CLEARS WHEN THE PROJECTION BRINGS THE CHARACTERS BACK — which is also the recovery path", async () => {
    // There is no "put it back" button, and this is why there does not need to be one. He retypes
    // the line, the write lands through the ordinary path, the projection carries the characters,
    // and the row holding them releases itself.
    d.control.nextProjection = STAMPED_ELSEWHERE;
    await d.typeAndCommit(BARE, TYPED);
    assert.equal(page.__held().count, 1, "the arm did not set up");

    d.land(CAME_BACK);

    assert.equal(page.__held().count, 0, "the file owns the characters and a second copy is still on screen");
    assert.equal(d.stripHidden(), true);
  });

  test("IT CLEARS WHEN HE DISCARDS IT — the one dismissal, and it is a real button on the row", () => {
    d.land(V1);
    d.setFocus(CURSOR, V1);
    d.land(DELETED);
    assert.equal(page.__held().count, 1, "the arm did not set up");

    const button = d.heldRows().find((el) => el.tagName === "button");
    assert.equal(button.textContent, "Discard");
    button.dispatch("click", makeEvent());

    assert.equal(page.__held().count, 0);
    assert.deepEqual(d.heldTexts(), [], "the row was released but the screen still shows it");
    assert.equal(d.stripHidden(), true);
  });

  test("IT SURVIVES A VIEW CHANGE — and the reason a DRAFT does not is a reason about the WRITE", () => {
    // `paintView` calls `draftLine.drop()` on every view change on purpose: a draft carries a LINE
    // INDEX and settles into an `insert-line` against whatever source is on screen, so a leaked one
    // could write into a file nobody is looking at. A held row carries no index and reaches no edit
    // constructor, so the hazard the drop protects against does not exist for it — while the COST of
    // dropping would be exactly what this capability forbids: his characters destroyed by a click in
    // the drawer.
    d.land(V1);
    d.setFocus(CURSOR, V1);
    d.land(DELETED);
    assert.equal(page.__held().count, 1, "the arm did not set up");

    d.land("# Inbox\n", "inbox");

    assert.equal(page.__held().count, 1, "a click in the drawer destroyed what he typed");
    assert.deepEqual(d.heldTexts(), [CURSOR_TEXT], "it survived but stopped being visible");
    assert.deepEqual(
      d.heldWheres(),
      [`${PATH} · the line this was on is not in that view any more`],
      "a row from another file must name its own file",
    );
  });

  test("AND COMING BACK TO THE VIEW STILL HOLDS IT — a return is not a release either", () => {
    d.land(V1);
    d.setFocus(CURSOR, V1);
    d.land(DELETED);
    d.land("# Inbox\n", "inbox");

    d.land(DELETED);

    assert.deepEqual(d.heldTexts(), [CURSOR_TEXT]);
  });

  test("SIGNING OUT CLEARS EVERYTHING — the one release that is neither settle nor Discard", () => {
    d.land(V1);
    d.setFocus(CURSOR, V1);
    d.land(DELETED);
    assert.equal(page.__held().count, 1, "the arm did not set up");

    d.logout();

    assert.equal(page.__held().count, 0, "one operator's writing was left on screen for the next one");
    assert.deepEqual(d.heldTexts(), []);
  });

  test("THE ROW'S CHARACTERS ARE READONLY — selectable and copyable, never an editing surface", () => {
    d.land(V1);
    d.setFocus(CURSOR, V1);
    d.land(DELETED);

    const input = d.heldRows().find((el) => el.tagName === "input");
    assert.equal(input.readOnly, true, "the held row is an editing surface");
    assert.equal(input.value, CURSOR_TEXT);
    assert.deepEqual([...input.listeners.keys()], [], "a held row must have no commit path of any kind");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. NOTHING HELD REACHES A WRITE
// ══════════════════════════════════════════════════════════════════════════════════════════════

const WORK_WRITE = makeWorkDir("app-held-edit-write");

describe("4. NOTHING HELD REACHES A WRITE — the pinned sites, re-counted on this branch", () => {
  const APP_SOURCE = readFileSync(resolve(HERE, "..", "app", "index.html"), "utf8");
  const PAINT_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "paint.ts"), "utf8");
  const HELD_CODE = codeOf(HELD_TS);
  /** The page with its comments removed — see `codeOf`. Its prose names `held.ts` as a PATH. */
  const APP_CODE = codeOf(APP_SOURCE);

  // research-the-rule-closure.md §8 proved "there is no code path from a painted pixel to a POST
  // body" BY COUNTING these sites. This change adds a whole new REGION of the screen, so re-counting
  // them here is the measurement that the region added no path. Every number is unchanged.

  // FOUR RATHER THAN FIVE SINCE 2026-08-01, AND THE MOVE IS NOT THIS SUITE'S. The behavioural
  // queue folded `toggleTask`'s and `commitLine`'s identical assign-paint-say into one
  // `installProjection`, because "install this projection" and "hold it, a line is open" is one
  // decision that must not be made twice. See tests/app-membership-note.test.mjs §4 for the full
  // account and for the value-level assertion that replaced what the count was doing.
  test("`graphData` is STILL assigned in exactly four places", () => {
    const sites = APP_SOURCE.match(/\bgraphData\s*=(?!=)/g) ?? [];
    assert.equal(sites.length, 4, "holding an edit must not add a client-computed graphData write");
  });

  test("`writeFile` STILL has exactly two callers — toggleTask and commitLine", () => {
    const occurrences = APP_SOURCE.match(/\bwriteFile\(/g) ?? [];
    assert.equal(occurrences.length, 3, "a held row gained a way to be posted");
  });

  test("`applyEdit` is STILL reached from exactly five sites outside its own module", () => {
    const pageCalls = APP_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    const paintCalls = PAINT_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    assert.equal(pageCalls.length + paintCalls.length, 5, "holding an edit must reach applyEdit zero times");
    assert.equal(pageCalls.length, 2);
    assert.equal(paintCalls.length, 3);
    assert.equal(HELD_CODE.match(/\bapplyEdit\b/g), null, "held.ts must not name the edit constructor in its code");
  });

  test("`.markdown` is STILL never ASSIGNED in app/", () => {
    const assignments = (source) => source.match(/\.markdown\s*=(?!=)/g) ?? [];
    assert.deepEqual(assignments(APP_SOURCE), []);
    assert.deepEqual(assignments(PAINT_SOURCE), []);
    assert.deepEqual(assignments(HELD_TS), []);
  });

  test("THE HELD SURFACE IS REACHED IN EXACTLY SIX PLACES, and none of them is a write path", () => {
    // `held.rows` is what a caller would have to reach for to post one. It is read by the painter of
    // the strip and by nothing else; `held.hold` is reached only through `holdEdit`, the one gate.
    //
    // SIX RATHER THAN FIVE SINCE WRITE CORRELATION, AND THE SIXTH IS A RELEASE. `held.landed` is the
    // server's own acknowledgement clearing a row (app/present/correlation.ts) — it takes a list of
    // TOKENS and returns rows, so like `held.settle` beside it, it is a way OUT of the surface and
    // not a way from the surface into a write. The name is asserted rather than the count, so a
    // seventh reach has to be justified here rather than absorbed by a number.
    const reads = APP_CODE.match(/\bheld\.[A-Za-z]\w*/g) ?? [];
    assert.deepEqual(
      [...new Set(reads)].sort(),
      ["held.clear", "held.discard", "held.hold", "held.landed", "held.rows", "held.settle"],
      "a new way to reach the held surface appeared — check it is not a write path",
    );
    assert.equal((APP_CODE.match(/\bheld\.hold\(/g) ?? []).length, 1, "holding must have exactly one gate");
    assert.equal((APP_CODE.match(/\bheld\.rows\b/g) ?? []).length, 1, "the characters are read in more than one place");
  });

  test("THE STRIP IS NOT IN THE READING COLUMN — the painter is handed a body it cannot walk out of", () => {
    // Structural, because it is what makes the type-level argument true at runtime: `paint()` gets
    // `#viewBody` and a source string. `#heldStrip` is its SIBLING, so no held row can ever be part
    // of the element tree the painter walks or the source string it computes an edit from.
    //
    // ── IT USED TO PIN THE ORDER AND NOW IT PINS THE CONTAINMENT, WHICH IS THE STRONGER CLAIM ──
    //
    // The old assertion was `viewBody ... heldStrip`, in that order, within 2,000 characters. That
    // was never what the argument needed — "the strip is below the column" is a layout fact, and
    // the strip moved ABOVE the column when "held below" turned out to point a screen and a half
    // past the fold (see the markup). What the argument needs is that the strip is not INSIDE the
    // column, and this says exactly that by asserting `#viewBody` is written empty and closed: an
    // element with no markup children cannot contain the strip wherever the strip sits.
    assert.match(
      APP_SOURCE,
      /<article id="viewBody" class="viewbody"><\/article>/,
      "the reading column gained markup children — the painter's body must stay empty in the source",
    );
    assert.match(APP_SOURCE, /<section id="heldStrip" class="held hidden"/, "the strip is gone");
    // AND IT IS A CHILD OF `#graph`, NOT OF ANYTHING THE PAINTER IS HANDED. The one element between
    // them in either direction is the column itself, so this pins "sibling" without pinning "after".
    assert.match(
      APP_SOURCE,
      /<section id="heldStrip"[\s\S]{0,400}<\/section>\s*<article id="viewBody"/,
      "the strip is no longer the reading column's sibling",
    );
    // THE BODY IS STILL `#viewBody` AND THE SOURCE IS STILL ONE STRING OFF THE WIRE. The second
    // argument is named `source` since the ack landed, and its ONE definition is asserted below
    // rather than tolerated: `accepted.sourceFor(v.path)` is a file's markdown the SERVER said it
    // holds (app/present/accepted.ts), and `v.markdown` is the projection's copy. Neither can be a
    // held row — the strip is `#viewBody`'s sibling and neither expression can reach it — so the
    // structural argument this test makes is unchanged and is now pinned at both ends.
    assert.match(APP_SOURCE, /paint\(body, source, presentation/, "the painter's body is no longer #viewBody");
    assert.match(
      APP_SOURCE,
      /const source = accepted\.sourceFor\(v\.path\) \?\? v\.markdown;/,
      "the painter's source gained a second definition — check it cannot be a held row",
    );
  });

});

/**
 * EACH DRIVEN SUITE STANDS UP ITS OWN PAGE IN A `before` HOOK, NOT INSIDE A TEST.
 *
 * `installBrowser` replaces `globalThis.document`, and the page's `$` resolves it at CALL time — so
 * two suites driving two page modules must not have their setup interleaved with the other's arms.
 * A suite-scoped `before` gives that ordering; a `standUpPage` in the body of a test does not.
 */
describe("4b. THE FALSIFIER ON THE WIRE — a held row's characters never reach a POST", () => {
  let d;

  before(async () => {
    d = await standUpPage(WORK_WRITE);
  });

  test("with a row held, an ordinary save and an ordinary tick post none of its characters", async () => {
    const page = d.page;

    // Hold the launch note's line by deleting it from the arriving projection.
    d.land(V1);
    d.setFocus(CURSOR, V1);
    d.land(DELETED);
    assert.equal(page.__held().count, 1, "the arm did not set up");

    // Park the cursor back on the heading so the surviving task paints as a CHECKBOX again — the
    // clamp left it on that row, and a focused row is an `<input>`, not a `<label>`.
    d.open(DELETED);
    d.control.posted.length = 0;

    // A TICK, then a LINE COMMIT — both write paths this page has, both through the real gestures.
    const box = walk(d.elements.get("viewBody")).filter((el) => el.type === "checkbox")[0];
    box.checked = true;
    box.dispatch("change");
    await d.settle();
    await d.typeAndCommit(DELETED, "- [ ] Water the plants BY SUNDAY [[qntm:122]] #task");

    assert.ok(d.control.posted.length >= 2, "the arm posted nothing to inspect");
    for (const body of d.control.posted) {
      assert.ok(
        !body.markdown.includes("Draft the launch note"),
        `a held row's characters reached the wire: ${body.markdown}`,
      );
    }
    // And it is still held — nothing consumed it, nothing re-inserted it.
    assert.ok(
      page.__held().rows.some((row) => row.text === CURSOR_TEXT),
      "the held row was silently consumed by a write",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE MUTATION PROOF — break the holding, and the guards go red
// ══════════════════════════════════════════════════════════════════════════════════════════════

const WORK_NO_HOLD = makeWorkDir("app-held-edit-mutant-hold");
const WORK_NO_RELEASE = makeWorkDir("app-held-edit-mutant-release");

/**
 * §2a's assertion, lifted into a function so the mutated page can be driven through EXACTLY the
 * same check. A guard that cannot go red is decoration; this is what proves it goes red.
 */
function assertCharactersSurvive(d) {
  const rows = d.page.__held().rows;
  assert.equal(rows.length, 1, "the characters were dropped");
  assert.equal(rows[0].text, CURSOR_TEXT);
  assert.deepEqual(d.heldTexts(), [CURSOR_TEXT]);
}

describe("5. MUTATION PROOF — neuter the holding, and §2a's own assertion goes red", () => {
  let d;

  before(async () => {
    d = await standUpPage(WORK_NO_HOLD, (source) =>
      assertMutated(source, "if (held.hold(record) === null) {", "if (true) {"),
    );
  });

  test("the characters are NOT recoverable once the one holding expression is broken", () => {
    d.land(V1);
    d.setFocus(CURSOR, V1);
    d.land(DELETED);

    assert.throws(
      () => assertCharactersSurvive(d),
      /the characters were dropped/,
      "the holding was removed and §2a still passed — the guard proves nothing",
    );
    // AND THE PAGE IS OTHERWISE UNHARMED, which is what makes this a mutation of the holding rather
    // than of the app: the sentence still fires, so it is genuinely the HOLDING that went, not the
    // whole detection path.
    assert.match(d.freshness(), /the line you were on is not in this view any more/);
  });
});

describe("5b. MUTATION PROOF — neuter the RELEASE, and §3's clearance assertion goes red", () => {
  // The opposite failure, and the one that would make a held row a second source of truth on
  // screen: characters the file HAS, still claimed by a row saying no file owns them.
  let d;

  before(async () => {
    d = await standUpPage(WORK_NO_RELEASE, (source) =>
      assertMutated(source, "held.settle(entering.path, entering.markdown);", "void (entering.path, entering.markdown);"),
    );
  });

  test("a row is still held after the projection brings its characters back", async () => {
    d.control.nextProjection = STAMPED_ELSEWHERE;
    await d.typeAndCommit(BARE, TYPED);
    assert.equal(d.page.__held().count, 1, "the arm did not set up");

    d.land(CAME_BACK);

    assert.throws(
      () => assert.equal(d.page.__held().count, 0),
      /Expected values to be strictly equal/,
      "the release was removed and the clearance assertion still passed",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE SENTENCE IS PRODUCED BY THE HOLDING — `held-is-really-held`
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// ── THE DEFECT THIS SECTION IS EVIDENCE FOR ──
//
// The page said "what you typed is held below" NEXT TO `holdEdit`, not OUT OF it. `holdEdit` is a
// no-op for characters `heldFrom` refuses, so every one of the three sentences that name the strip
// could be said with the strip empty and hidden. On the ADOPTED branch that is the branch that
// takes his characters off the screen, so a false claim there costs him the last copy there was.
//
// ── WHAT IS PROVEN HERE AND WHAT IS NOT ──
//
// PROVEN: the clause is said if and only if a row is really on the strip, and the adoption does not
// run without one. Both directions, both mutation-proved.
//
// NOT PROVEN, AND SAID PLAINLY: the operator's own 2026-08-03 browser drive reported a refused save
// DESTROYING a line he had typed, with the strip empty. That loss was NOT reproduced. Eight
// gestures were driven through this page with the three browser facts installed (vim `i`+click-away,
// vim `o`+Enter, vim `o`+click-away, click-to-edit+click-away, Enter mid-edit, an ack save followed
// by a refused create two turns later, a refusal followed by a re-read, and §2d below) and every one
// of them put the characters on the strip. The deployed `app/index.html` and `dist/present.js` were
// fetched and are byte-identical to `origin/main`, so it is not a stale deploy either. See the PR
// body: the report stays on the board.
const WORK_HONESTY = makeWorkDir("app-held-edit-honesty");
const WORK_ALWAYS_HELD = makeWorkDir("app-held-edit-mutant-always-held");

/** The file the SERVER holds — deliberately different from `V1`, so an adoption is observable. */
const SERVER_HAS = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Draft the launch note [[qntm:121]] #task 🆕 2026-08-03",
  "- [ ] Water the plants [[qntm:122]] #task",
  "",
].join("\n");

/** Refuse the next write, handing back `SERVER_HAS` — the shape `the-view-heals-itself` adopts. */
const refuse = (d) => {
  d.control.refuseWith = {
    status: 409,
    body: { ok: false, error: "stale base", refused: "stale-base", path: PATH, current: SERVER_HAS },
  };
};

describe("6. A REFUSAL SAYS 'held' ONLY WHEN SOMETHING IS HELD", () => {
  let d;

  before(async () => {
    d = await standUpPage(WORK_HONESTY);
  });

  beforeEach(() => d.arm());

  test("THE POSITIVE CONTROL — characters worth holding are held, said, and on the strip", async () => {
    refuse(d);
    await d.typeAndCommit(V1, "- [ ] Draft the launch note BY FRIDAY [[qntm:121]] #task");

    assert.deepEqual(d.heldTexts(), ["- [ ] Draft the launch note BY FRIDAY [[qntm:121]] #task"]);
    assert.equal(d.stripHidden(), false, "the strip is hidden while it is holding his characters");
    assert.match(d.freshness(), /what you typed is held above this view/);
    // AND THE ADOPTION RAN, because the characters are safe somewhere else.
    assert.equal(d.page.__accepted().markdown, SERVER_HAS, "the view did not heal itself");
  });

  test(
    "AN EMPTIED LINE HOLDS NOTHING, AND THE PAGE DOES NOT SAY IT DOES — the sentence that used " +
      "to lie",
    async () => {
      // `heldFrom` refuses whitespace, so this refusal holds nothing. `set-line` to empty is a
      // legal edit (app/present/source.ts: the asymmetry is deliberate — only INSERT refuses a
      // contentless line), so it really does reach the wire and really does come back 409.
      refuse(d);
      await d.typeAndCommit(V1, "");

      assert.equal(d.page.__held().count, 0, "whitespace was held — `heldFrom`'s rule changed");
      assert.deepEqual(d.heldTexts(), []);
      assert.equal(d.stripHidden(), true);
      assert.doesNotMatch(
        d.freshness(),
        /held above this view/,
        "the page claimed his characters are on the strip while the strip is empty and hidden",
      );
      // AND THE FIRST HALF IS STILL SAID, because it is still true: the save was refused and
      // nothing was written. Only the claim about the strip goes quiet.
      assert.match(d.freshness(), /the server refused it and nothing was written/);
    },
  );

  test(
    "AND THE ADOPTION IS GATED ON THE HOLDING, NOT ON ITS ATTEMPT — `healFromRefusal`'s own " +
      "safety argument, written as a precondition",
    async () => {
      // The emptied line above is the safe case (`typed.trim() === ""` — nothing to lose), so it
      // adopts. This asserts the OTHER half: the gate exists and is the expression the mutation
      // arm below breaks. Nothing here is a behaviour change on today's code — it is the argument
      // stopping being prose.
      refuse(d);
      await d.typeAndCommit(V1, "");
      assert.equal(d.page.__accepted().markdown, SERVER_HAS, "nothing was at stake, so it heals");

      const pageSource = readFileSync(resolve(HERE, "..", "app", "index.html"), "utf8");
      assert.match(
        pageSource,
        /const safeToAdopt = heldIt \|\| typed\.trim\(\) === "";/,
        "the adoption's precondition is gone — it is back to trusting the order of two statements",
      );
      assert.match(
        pageSource,
        /if \(safeToAdopt && healFromRefusal\(path, current\)\) \{/,
        "the precondition is no longer what gates the adoption",
      );
    },
  );
});

/**
 * §6's silence assertion, lifted into a function so the mutated page is driven through EXACTLY the
 * same check — the shape §5 above already uses, and for the same reason.
 */
function assertSaysNothingAboutHolding(d) {
  assert.equal(d.page.__held().count, 0, "the arm did not set up — something really was held");
  assert.doesNotMatch(
    d.freshness(),
    /held above this view/,
    "the page claimed his characters are on the strip while the strip is empty and hidden",
  );
}

describe("6b. MUTATION PROOF — let the holding claim a success it did not have, and §6 goes red", () => {
  // THE MUTATION IS THE DEFECT ITSELF. `holdEdit` reports `true` whether or not a row was taken,
  // which is precisely the shape the page had before this row: the sentence written BESIDE the
  // call instead of out of it. Everything else about the page is untouched.
  let d;

  before(async () => {
    d = await standUpPage(WORK_ALWAYS_HELD, (source) =>
      assertMutated(source, "  if (held.hold(record) === null) {\n    return false;\n  }", "  if (false) {\n    return false;\n  }"),
    );
  });

  test("the page says the characters are held while the strip is empty and hidden", async () => {
    refuse(d);
    await d.typeAndCommit(V1, "");

    assert.equal(d.stripHidden(), true, "the mutation put a row on the strip — it is the wrong one");
    assert.throws(
      () => assertSaysNothingAboutHolding(d),
      /the page claimed his characters are on the strip/,
      "the claim was decoupled from the holding and §6 still passed — the guard proves nothing",
    );
  });
});

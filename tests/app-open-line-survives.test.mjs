/**
 * A LINE HE HAS OPEN SURVIVES A PROJECTION ARRIVING. A VIEW CHANGE STILL DESTROYS IT.
 *
 *   node --test tests/app-open-line-survives.test.mjs
 *
 * ── THE BACKLOG ROW, AND THE HALF OF ITS REASONING THAT WAS ALWAYS RIGHT ──
 *
 * `a-line-being-made-survives-a-projection-too`. `paintView` called `draftLine.drop()`
 * unconditionally, with an argued reason: "an index that meant under the third task in one view
 * means something else in the next" — and a row that leaked across a view change is the one way
 * this affordance could write into a file nobody was looking at.
 *
 * THAT REASONING IS ABOUT A VIEW CHANGE AND IT STILL STANDS. Section 2 is its guard, and it is
 * written first on purpose: the change this suite is evidence for is only safe if the hazard the
 * drop protects against is provably untouched.
 *
 * WHAT IS WRONG IS THAT `paintView` IS CALLED FOR TWO REASONS. A projection arriving is the same
 * view, the same cursor and the same sentence half-typed. Destroying his row for that is the safe
 * haven violated by the mechanism the apex capability needs.
 *
 * ── THE ROW IS REACHABLE TODAY, WHICH THE BACKLOG ROW DOUBTED ──
 *
 * The row says it is "genuinely worthless before 7 (`the-projection-arrives-without-being-asked-
 * for`): until a projection can arrive unbidden, `drop()` is correct and this row would be a change
 * with no observable effect." That is refuted, and section 1's last test is the refutation driven
 * through the page: `commitLine` is ASYNC and the cycle takes seconds. He captures a thing, presses
 * Enter, presses `o`, and starts typing the next one — and the FIRST capture's own answer lands on
 * the second capture's open row. Two captures in a row is the operator's ordinary gesture in his
 * own inbox, not a race that needs a poll to reach.
 *
 * ── WHAT THIS SUITE DOES NOT VERIFY ──
 *
 * No browser was opened. No passkey session, no live graph server, no engine cycle, no real POST.
 * Every projection below is a FIXTURE — a second string, hand-built the way a real cycle transforms
 * a real line. The DOM is `installBrowser`'s stub, so nothing here proves a real browser's own
 * blur-on-removal behaviour; section 5 drives that event explicitly rather than waiting for it.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

import {
  assertMutated,
  importPage,
  installBrowser,
  makeEvent,
  makeWorkDir,
  walk,
} from "./fixtures/app-html-page.mjs";

const WORK = makeWorkDir("app-open-line-survives");

/**
 * The inbox as `~/qntm/inbox.md` really prints it (read read-only 2026-08-01, the same copy
 * tests/present-replay.test.mjs holds) — newest first, every line stamped.
 */
const INBOX = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
  "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
  "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
].join("\n");

const view = (markdown) => ({
  id: "inbox",
  path: "inbox.md",
  title: "Inbox",
  domain: "all",
  markdown,
});

/** A second view, so a VIEW CHANGE is a real thing this page can be asked to do. */
const OTHER = {
  id: "this-week",
  path: "work/outcomes.md",
  title: "This Week",
  domain: "work",
  markdown: ["# This Week", "- [ ] first outcome [[qntm:1]] #task"].join("\n"),
};

const snapshot = (inbox) => ({
  generated_at: "2026-08-01T09:00:00Z",
  views: [view(inbox), OTHER],
});

let page;
let elements;
let doc;

before(async () => {
  ({ elements, document: doc } = installBrowser());
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  page = await importPage(WORK);
});

const inputs = () =>
  walk(elements.get("viewBody")).filter((el) => el.tagName === "input" && el.type === "text");
const heldRows = () =>
  walk(elements.get("heldRows")).filter((el) => el.tagName === "input" && el.type === "text");
const press = (key) => doc.dispatch("keydown", makeEvent({ key }));

/**
 * Land in the inbox, put the cursor on `- [ ] Lesley pay tenner`, and press `o`. Returns the row's
 * `<input>`.
 *
 * IT DRIVES THE PAGE'S OWN KEY WIRING rather than calling `openLine` — the whole point of this
 * fixture is that `app/index.html` is outside every enforcer this repo has, so a suite that
 * reimplemented its wiring would stay green while the page rotted.
 */
function openRow(target = 2) {
  page.__setGraphData({ snapshot: snapshot(INBOX) });
  page.__setCurrentViewId("inbox");
  page.paintView("inbox", "chosen");
  press("g");
  press("g");
  for (let at = 0; at < target; at += 1) {
    press("j");
  }
  press("o");
  const row = inputs()[0];
  assert.ok(row, "`o` did not open a row through the page's own wiring");
  return row;
}

/** Type into the open row exactly as a person does — value, then the `input` event. */
function type(row, text) {
  row.value = text;
  row.dispatch("input");
}

/** A projection arriving: the envelope is replaced and the page repaints, as every write path does. */
function arrives(markdown) {
  page.__setGraphData({ snapshot: snapshot(markdown) });
  page.paintView("inbox", "arrived");
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. A PROJECTION ARRIVING DOES NOT DESTROY THE ROW — above it, below it, and both.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. a line he has open survives a projection arriving", () => {
  test("the characters survive, and the row is still the row — not a fresh one", () => {
    const row = openRow();
    type(row, "- [ ] Call the bank");
    const generation = page.__draft().generation;

    arrives(INBOX);

    const draft = page.__draft().draft;
    assert.ok(draft, "the row was destroyed by a projection arriving");
    assert.equal(draft.typed, "- [ ] Call the bank", "the row came back holding its seed, not his characters");
    assert.equal(inputs().length, 1, "the row is not on screen, or there are two of them");
    assert.equal(inputs()[0].value, "- [ ] Call the bank");
    assert.equal(page.__vimMode(), "INSERT", "the row survived but the mode did not — he cannot keep typing");
    assert.notEqual(page.__draft().generation, generation, "the row was re-placed without saying so");
  });

  test("the caret goes back to the end of what he had typed", () => {
    const row = openRow();
    type(row, "- [ ] Call the bank");
    arrives(INBOX);
    const back = inputs()[0];
    assert.equal(back.selectionStart, "- [ ] Call the bank".length);
    assert.equal(back.selectionEnd, "- [ ] Call the bank".length);
  });

  test("A LINE CHANGED ABOVE IT — the index moves and the row moves with it", () => {
    const row = openRow();
    type(row, "- [ ] Call the bank");
    assert.equal(page.__draft().draft.lineIndex, 3);

    arrives(
      [
        "## Inbox",
        "## Domain Empty",
        "- [ ] New capture from the phone [[qntm:2610]] #task 🆕 2026-08-01",
        "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
        "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
        "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
      ].join("\n"),
    );

    assert.equal(page.__draft().draft.lineIndex, 4, "the row stayed at 3 while its neighbour moved to 3");
    assert.equal(page.__draft().draft.typed, "- [ ] Call the bank");
  });

  test("A LINE CHANGED BELOW IT — nothing above moved, so neither does the row", () => {
    const row = openRow();
    type(row, "- [ ] Call the bank");

    arrives(
      [INBOX, "- [ ] Something the cycle filed underneath [[qntm:2611]] #task 🆕 2026-08-01"].join("\n"),
    );

    assert.equal(page.__draft().draft.lineIndex, 3);
    assert.equal(page.__draft().draft.typed, "- [ ] Call the bank");
  });

  test("BOTH AT ONCE", () => {
    const row = openRow();
    type(row, "- [ ] Call the bank");

    arrives(
      [
        "## Inbox",
        "## Domain Empty",
        "- [ ] New capture from the phone [[qntm:2610]] #task 🆕 2026-08-01",
        "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
        "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
        "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
        "- [ ] Something the cycle filed underneath [[qntm:2611]] #task 🆕 2026-08-01",
      ].join("\n"),
    );

    assert.equal(page.__draft().draft.lineIndex, 4);
    assert.equal(page.__draft().draft.typed, "- [ ] Call the bank");
  });

  test("EXACTLY ONE ROW IS EDITABLE — the surviving row does not also un-blur the line beneath it", () => {
    // The trap `repaintCurrentView`'s own comment records measuring: `o` blurs `focus` on purpose,
    // and anything that seeds it back makes a second line raw the moment INSERT is on.
    const row = openRow();
    type(row, "- [ ] Call the bank");
    arrives(INBOX);
    assert.equal(inputs().length, 1, "a projection arriving opened a second editable row");
    assert.equal(page.__focusIndex(), null, "the selection was seeded back onto a real line");
  });

  test(
    "THE ROW IS REACHABLE WITHOUT AN UNBIDDEN PROJECTION — two captures in a row, which is the " +
      "operator's ordinary gesture. This refutes the backlog row's own claim that the change has " +
      "no observable effect before `the-projection-arrives-without-being-asked-for`.",
    () => {
      // He settles the first capture (Enter), which starts an async POST. Before it answers he
      // presses `o` and types the second one. Then the FIRST capture's projection lands.
      const first = openRow();
      type(first, "- [ ] Lesley pay tenner");
      first.dispatch("keydown", makeEvent({ key: "Enter" }));
      assert.equal(page.__draft().draft, null, "settling did not close the first row");

      press("o");
      const second = inputs()[0];
      assert.ok(second, "the second `o` did not open a row");
      type(second, "- [ ] Call the bank");

      arrives(INBOX); // the first capture's own cycle, coming back

      assert.ok(page.__draft().draft, "the first capture's answer destroyed the second capture");
      assert.equal(page.__draft().draft.typed, "- [ ] Call the bank");
    },
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A VIEW CHANGE STILL DROPS IT — the half of the original reasoning that was always right.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. a view change still destroys the row, unchanged", () => {
  test("choosing another view drops it — a row must never write into a file nobody is looking at", () => {
    const row = openRow();
    type(row, "- [ ] Call the bank");

    page.paintView("this-week", "chosen");

    assert.equal(page.__draft().draft, null, "the row leaked across a view change");
    assert.equal(page.__vimMode(), "NORMAL", "INSERT leaked across a view change");
  });

  test("choosing the SAME view again drops it too — `chosen` is the caller's word, not a position", () => {
    // The proxy this change replaced (`id === paintedViewId`) reads this as an arrival. It is not:
    // he pressed a view in the drawer, which is the gesture the drop was written for.
    const row = openRow();
    type(row, "- [ ] Call the bank");
    page.paintView("inbox", "chosen");
    assert.equal(page.__draft().draft, null);
  });

  test("a caller that says nothing drops it — the safe direction, and every older caller's behaviour", () => {
    const row = openRow();
    type(row, "- [ ] Call the bank");
    page.paintView("inbox");
    assert.equal(page.__draft().draft, null);
  });

  test("AN ARRIVAL THAT LANDS ON A DIFFERENT VIEW DROPS IT — both conditions, never either", () => {
    // A re-read whose view was renamed on the laptop is an arrival AND a change of view.
    const row = openRow();
    type(row, "- [ ] Call the bank");
    page.paintView("this-week", "arrived");
    assert.equal(page.__draft().draft, null, "the row followed an arrival into another view");
  });

  test("nothing is held by a view change — a dropped row is not a lost one; he chose to leave", () => {
    page.__held().clear();
    const row = openRow();
    type(row, "- [ ] Call the bank");
    page.paintView("this-week", "chosen");
    assert.equal(page.__held().count, 0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE PROJECTION ALREADY CARRIES HIS LINE — released, never duplicated.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. a projection carrying his line releases the row", () => {
  test("the row goes, nothing is held, and the view is not showing his line twice", () => {
    page.__held().clear();
    // The inbox the moment before he typed it, so the arriving INBOX has GAINED his line.
    const beforeHeTyped = [
      "## Inbox",
      "## Domain Empty",
      "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
      "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
    ].join("\n");
    page.__setGraphData({ snapshot: snapshot(beforeHeTyped) });
    page.__setCurrentViewId("inbox");
    page.paintView("inbox", "chosen");
    press("g");
    press("g");
    press("j"); // `## Domain Empty`
    press("o");
    const row = inputs()[0];
    type(row, "- [ ] Lesley pay tenner");

    arrives(INBOX); // the cycle ingested it while he was still typing

    assert.equal(page.__draft().draft, null, "the row was re-placed, so the line is on screen twice");
    assert.equal(page.__held().count, 0, "the file owns the characters — holding them would be a third copy");
    assert.equal(inputs().length, 0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. IT CANNOT BE RE-PLACED — held, not dropped.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. an un-replaceable row is held", () => {
  test("the neighbour left the view, so the characters go to the held strip", () => {
    page.__held().clear();
    const row = openRow();
    type(row, "- [ ] Call the bank");

    // The cycle moved qntm:2603 out of the inbox entirely. Nothing beside the row survives.
    arrives(
      [
        "## Inbox",
        "## Domain Empty",
        "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
        "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
      ].join("\n"),
    );

    assert.equal(page.__draft().draft, null, "an un-placeable row was kept at an index that means nothing");
    assert.equal(page.__held().count, 1, "his characters were destroyed rather than held");
    const held = page.__held().rows[0];
    assert.equal(held.text, "- [ ] Call the bank");
    assert.equal(held.reason, "unplaced");
    assert.equal(held.instance, null, "a row in no file has no identity — and must carry no index");
    assert.equal(heldRows()[0]?.value, "- [ ] Call the bank", "the strip did not redraw");
    assert.equal(page.__vimMode(), "NORMAL", "INSERT survived a row that no longer exists");
  });

  test("a row holding only its own chrome is dropped silently — there was never a line to lose", () => {
    page.__held().clear();
    openRow(); // `o`, and nothing typed
    arrives(
      [
        "## Inbox",
        "## Domain Empty",
        "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
        "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
      ].join("\n"),
    );
    assert.equal(page.__draft().draft, null);
    assert.equal(page.__held().count, 0, "`- [ ] ` was put on the strip as if it were work");
  });

  test("the page says what happened, in the line it already uses to say what happened", () => {
    page.__held().clear();
    const row = openRow();
    type(row, "- [ ] Call the bank");
    arrives(
      [
        "## Inbox",
        "## Domain Empty",
        "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
        "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
      ].join("\n"),
    );
    page.__sayAsOf({ snapshot: { generated_at: "2026-08-01T09:00:00Z" }, pending_edits: 0 });
    assert.match(elements.get("freshness").textContent, /held above this view/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE ELEMENT LEFT BEHIND — a row that survives is repainted, so the first element must not
//    settle. This closes a hole the unconditional drop never covered: `drop()` protected the
//    SURFACE and the removed element's own `blur` listener still posts.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. the replaced element cannot settle", () => {
  test("blurring the element a survival replaced writes nothing and does not close the row", () => {
    const posts = [];
    const saved = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      posts.push({ url, init });
      return { ok: true, json: async () => ({ ok: true }) };
    };
    try {
      const stale = openRow();
      type(stale, "- [ ] Call the bank");
      arrives(INBOX);
      assert.ok(page.__draft().draft, "precondition: the row survived");

      // What a browser does when it removes a focused element.
      stale.dispatch("blur");

      assert.deepEqual(posts, [], "a replaced element settled and put a write on the wire");
      assert.ok(page.__draft().draft, "a replaced element's blur closed the live row");
    } finally {
      globalThis.fetch = saved;
    }
  });

  test("and the same for a row a VIEW CHANGE dropped — the hazard the drop alone never covered", () => {
    const posts = [];
    const saved = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      posts.push({ url, init });
      return { ok: true, json: async () => ({ ok: true }) };
    };
    try {
      const stale = openRow();
      type(stale, "- [ ] Call the bank");
      page.paintView("this-week", "chosen");
      stale.dispatch("blur");
      assert.deepEqual(posts, [], "a dropped row's own element posted into the view being left");
    } finally {
      globalThis.fetch = saved;
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE MUTATION PROOF — a guard that cannot go red is decoration.
//
//    The page is one hand-authored file with no seam to inject at, so the seam is breaking one
//    named expression and re-importing. `assertMutated` refuses a pattern that has drifted, so a
//    typo cannot produce a green "mutation proof" against an unmodified page.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Drive one mutated copy of the page, with its own browser, and put everything back.
 *
 * `installBrowser` BEFORE `importPage`, and that order is load-bearing: the page registers its
 * document-level `keydown` at import time, so a module imported against the previous document
 * would never hear a key. The originals are RESTORED rather than rebuilt, because a rebuilt
 * document is one the ORIGINAL page never registered on either.
 *
 * ONLY THE PAGE'S OWN SOURCE CAN BE MUTATED THIS WAY. `dist/present.js` is imported by file URL
 * and is not rewritten, so a decision that lives in a module (draft.ts's `placeDraft`, paint.ts's
 * recording of the typed characters) is proved by tests/present-replay.test.mjs section 8 and by
 * this suite's own assertions, never by a mutation here. Stated so nobody reads more into this
 * section than it earns.
 */
async function withMutant(label, pattern, replacement, body) {
  const savedPage = page;
  const savedElements = elements;
  const savedDoc = doc;
  const savedDocument = globalThis.document;
  ({ elements, document: doc } = installBrowser());
  try {
    page = await importPage(makeWorkDir(label), (source) =>
      assertMutated(source, pattern, replacement),
    );
    body();
  } finally {
    page = savedPage;
    elements = savedElements;
    doc = savedDoc;
    globalThis.document = savedDocument;
  }
}

describe("6. break the survival and the suite goes red", () => {
  test("restoring the unconditional drop destroys the row again, and section 1 would fail", async () => {
    await withMutant(
      "app-open-line-survives-mutant-drop",
      'const carried = why === "arrived" && sameView ? draftLine.draft : null;',
      "const carried = null;",
      () => {
        const row = openRow();
        type(row, "- [ ] Call the bank");
        arrives(INBOX);
        assert.equal(
          page.__draft().draft,
          null,
          "the mutation did not reach the behaviour — section 1 proves nothing",
        );
      },
    );
  });

  test("breaking the hold destroys his characters instead, and section 4 would fail", async () => {
    await withMutant(
      "app-open-line-survives-mutant-hold",
      'placement.outcome === "unplaced" && carried.typed !== carried.seed',
      "false",
      () => {
        page.__held().clear();
        const row = openRow();
        type(row, "- [ ] Call the bank");
        arrives(
          [
            "## Inbox",
            "## Domain Empty",
            "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
            "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
          ].join("\n"),
        );
        assert.equal(page.__draft().draft, null, "precondition: the row could not be placed");
        assert.equal(
          page.__held().count,
          0,
          "the mutation did not reach the behaviour — section 4 proves nothing",
        );
      },
    );
  });
});

/**
 * ONE ACT, ONE ANSWER — a refused write must be answered the same way whichever gesture made it.
 *
 *   node --test tests/app-one-write-path-per-act.test.mjs
 *
 * ── WHAT THIS FILE IS ABOUT, IN ONE SENTENCE ──
 *
 * Ticking a checkbox with the mouse and ticking the same checkbox with `x` are the SAME ACT, and
 * on a contended write they do different things: the `x` tick is rebased against the server's own
 * copy and sent again, and the mouse tick is dropped.
 *
 * ── THE MEASUREMENT, RUN BEFORE ANY OF THIS WAS WRITTEN (2026-08-14, unmodified origin/main
 *    @ 2dbe931) ──
 *
 *     act                          POSTs under a 409      the retry's `ops`
 *     tick line 1 by mouse                 1              (there is no retry)
 *     tick line 1 by `x`                   2              null
 *     open a line with `o`                 1              (there is no retry)
 *
 * The first two rows are ONE line of the file, ONE glyph, and two different outcomes. The third
 * row is a row the operator typed, refused and not sent again.
 *
 * ── WHY THE MEASUREMENT HAD TO BE A RUN AND NOT A READ ──
 *
 * The first version of this probe asserted two OTHER differences — that the mouse path leaves a
 * stale queued projection behind (`commitLine` calls `queued.drop`, `toggleTask` does not) and
 * that the two paths post different bodies. BOTH ARE FALSE, and only running it said so: the
 * queued projection is dropped on both paths (something downstream of the write does it), and the
 * two paths post byte-identical bodies including identical `ops`. A file that had pinned either
 * of those would have been pinning a difference that does not exist. What survived the run is
 * the refusal, and only the refusal.
 *
 * ── WHY A 409 IS WORTH ENFORCING RATHER THAN A CURIOSITY ──
 *
 * `the-write-carries-a-precondition-the-server-can-refuse` (capabilities.yaml) says in its own
 * words that the 409 branch is "UNREACHABLE IN PRODUCTION until the monorepo change lands", and
 * `worker/src/app.js:576` says "no deployed graph server answers 409 today". BOTH SENTENCES ARE
 * NOW OUT OF DATE: `server/app.py` holds `_stale_base` and answers 409 with the current content
 * (its own `POST /vault/file`, the branch at `status_code=409`). A refused write is live code on
 * the operator's own path, and `a-write-refuses-a-stale-base` measured that a stale base is an
 * ORDINARY event inside one ~14 s cycle rather than a rare one.
 *
 * ── THE RULE THAT DECIDES ALL OF THIS, AND IT IS NOT A RULE ABOUT CHECKBOXES ──
 *
 * The operator's own: THE GRAPH IS TRUTH, MINUS CHANGES STREAMED FROM THE VIEW THAT HAVE NOT
 * LANDED. A posted write is still streamed-from-the-view; so is a rebase retry still running; a
 * refusal with no retry left is not. Every assertion below is that one sentence applied.
 *
 * IT REPLACES THE SPECIAL CASE IT LOOKS LIKE. `the-write-carries-a-precondition-the-server-can-refuse`
 * reasons about two answers — a refused line commit keeps the operator's characters on screen, a
 * refused tick puts the box back — and reads as tick-versus-text. It is not. Typed characters stay
 * because the operator can still resend them; a box reverts because nothing is left to resend. One
 * rule, two outcomes. That is why merging the two write paths did not have to choose between them.
 *
 * ── WHAT EACH TEST BELOW PINS ──
 *
 *   1.  THE HEADLINE. One act, two gestures, one 409 — the same number of POSTs. Was RED on
 *       2dbe931 (1 versus 2); GREEN since the mouse tick became a line commit.
 *   1b. THE BOX MOVES ONLY WHEN THE ANSWER IS FINAL — both halves of the rule above, and the
 *       first of the two is the one a "revert on 409" implementation gets wrong while passing
 *       every count-the-POSTs assertion in §1.
 *   2.  THE RETRY CARRIES ITS OPS, like every other write in this app since #174/#176.
 *   3.  A REFUSED `insert-line` IS NOT SILENTLY DROPPED. **RED, DELIBERATELY, AND IT LIVES ON ITS
 *       OWN BRANCH** (`diagnose/insert-line-has-no-rebase`) rather than here, so a recorded gap
 *       does not block a deploy. See that branch for why the fix is NOT a widened guard.
 *
 * Every test is driven through the REAL PAGE — `app/index.html`'s own lifted `<script
 * type="module">` — because that page is outside `tsconfig.json`'s `include`, so nothing else in
 * this repository can see what it does. That is also where the second write path used to live.
 *
 * ── AND THE TYPE CHECKER DOES NOT GUARD THE OPS ARGUMENT ANYWHERE, NOT ONLY ON THAT PAGE ──
 *
 * The known hazard is that `app/index.html` is untyped, so a `writeFile(...)` call missing its
 * fifth argument compiles and ships silently there. Falsified 2026-08-14 and the hazard is WIDER
 * than that: deleting the fifth argument from the retry in `app/present/commit.ts` — a module
 * tsconfig DOES read — leaves `npx tsc --noEmit` completely silent, because `ops` is declared
 * OPTIONAL (`ops?:`) and has to be, since `lineOps` returns `null` and every caller predating
 * #174 omitted it. So there is no typed position in this repository where forgetting to send the
 * edit is a compile error. §2 below is the only thing that notices, which is why it asserts the
 * op's CONTENT and its INDEX rather than merely that a field is present.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { importPage, installBrowser, makeEvent, makeWorkDir, walk } from "./fixtures/app-html-page.mjs";

process.setMaxListeners(30);

// A real declaration, so every resolver is LIVE rather than abstaining at its first gate — the
// same reasoning tests/app-gesture-write-path.test.mjs states in full for the same fixture shape.
const DECLARATION = {
  qualification: {
    defaultNodeType: "task",
    structuralNodeTypes: [],
    tokens: { node_type: {}, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
    predicates: {},
    sections: {},
    sectionOrder: { demo: ["queue"] },
    refused: {},
  },
  resolution: {
    ordering: {
      demo: {
        queue: {
          ordering: [{ field: "queue_position", direction: "asc" }],
          orderingMode: undefined,
          name: "Queue",
        },
      },
    },
    orderingFields: { queue_position: { token: "🔢", kind: "int" } },
    dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
  },
};

const SOURCE = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2"].join("\n");
const VIEW = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: SOURCE };

/**
 * THE SERVER'S OWN COPY, one row further on. The line every gesture below acts on is STILL THERE
 * and at a DIFFERENT INDEX — which is the exact state `rebaseLineEdit` exists to survive, and the
 * reason this fixture inserts a row rather than editing one: a rebase that refuses for an
 * unrelated reason would make every assertion below pass or fail for the wrong reason.
 */
const SERVER_CURRENT = [
  "## Queue",
  "- [ ] z [[qntm:9]] 🔢 0",
  "- [ ] a [[qntm:1]] 🔢 1",
  "- [ ] b [[qntm:2]] 🔢 2",
].join("\n");

/**
 * A fresh page whose first write is REFUSED exactly as the graph server refuses one.
 *
 * The refusal body is `{ok: false, refused: "stale-base", path, current}` and every field of that
 * is load-bearing: `api()` (app/index.html) only copies `current` onto the thrown error when
 * `data.refused` is a STRING, so a 409 without it reaches the page's `catch` carrying a status and
 * nothing else and no rebase is possible for a reason that has nothing to do with this file. That
 * was the probe's own first mistake and it read as "the `x` path does not retry either".
 */
async function freshPage(label, { refuseFirst = false } = {}) {
  const work = makeWorkDir(label);
  const { elements, document: doc } = installBrowser();
  const posts = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    posts.push({ url, body });
    if (refuseFirst && posts.length === 1) {
      return {
        ok: false,
        status: 409,
        json: async () => ({
          ok: false,
          refused: "stale-base",
          path: "demo.md",
          error: "stale base — the file changed since this edit was computed",
          current: SERVER_CURRENT,
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        handle: "luke",
        pending_edits: 0,
        snapshot: {
          generated_at: "2026-08-05T00:00:00Z",
          views: [{ ...VIEW, markdown: body.markdown }],
        },
      }),
    };
  };
  const page = await importPage(work);
  page.__applyPresentation(DECLARATION);
  page.__setGraphData({ snapshot: { generated_at: "2026-08-05T00:00:00Z", views: [VIEW] } });
  page.paintView("demo");
  return { page, elements, doc, posts, press: (key) => doc.dispatch("keydown", makeEvent({ key })) };
}

/** Long enough for a write, its refusal, a rebase and the retry that follows it. */
const quiesce = () => new Promise((r) => setTimeout(r, 20));

/**
 * Tick line 1's checkbox WITH THE MOUSE.
 *
 * The cursor is parked on line 0 first, and that is not cosmetic: the line under the cursor paints
 * its SOURCE CHARACTERS rather than a widget (app/present/paint.ts), so a page whose cursor sat on
 * line 1 would have no checkbox on line 1 to click. This is the same `paintParked` reasoning
 * tests/app-html-write-path.test.mjs states for itself.
 */
async function tickByMouse(page, elements) {
  page.__setFocus(0, SOURCE);
  page.paintView("demo");
  const box = walk(elements.get("viewBody")).find((el) => el.type === "checkbox");
  assert.ok(box, "line 1 painted no checkbox — the fixture is not exercising its subject");
  box.checked = true;
  box.dispatch("change");
  await quiesce();
}

/**
 * The checkbox belonging to the row that RENDERS `needle`, not the first checkbox on the page.
 *
 * NOT A CONVENIENCE, AND IT CAUGHT A FALSE FAILURE WHILE THIS FILE WAS BEING WRITTEN. After a
 * successful rebase the retry's answer repaints the view from THE SERVER'S file, which in these
 * fixtures has an extra row ABOVE the one being ticked. So `find((el) => el.type === "checkbox")`
 * stops meaning "the row I ticked" the moment the thing under test works — it returns the new row,
 * unticked, and the assertion reads as "the box was reverted" when nothing was reverted at all.
 * A test that can only see the first box cannot tell a reverted tick from a re-ordered view.
 */
function boxForRow(elements, needle) {
  const nodes = walk(elements.get("viewBody"));
  const boxes = nodes.filter((el) => el.type === "checkbox");
  const labels = nodes.filter((el) => el.tagName === "span" && el.innerHTML !== "");
  const index = labels.findIndex((el) => String(el.innerHTML).includes(needle));
  assert.ok(index !== -1, `no rendered row contains ${needle} — the fixture is not exercising its subject`);
  assert.ok(boxes[index], `the row rendering ${needle} has no checkbox`);
  return boxes[index];
}

/** Tick the SAME line with `x` — `gg` for a deterministic start, `j` onto line 1. */
async function tickByKey(press) {
  press("g");
  press("g");
  press("j");
  press("x");
  await quiesce();
}

describe("1. THE HEADLINE — one act, two gestures, one refusal, one answer", () => {
  test("a refused tick is answered the same way whether the mouse or `x` made it", async () => {
    const mouse = await freshPage("one-path-mouse-409", { refuseFirst: true });
    await tickByMouse(mouse.page, mouse.elements);

    const key = await freshPage("one-path-key-409", { refuseFirst: true });
    await tickByKey(key.press);

    // Both gestures produced the SAME first write — this is the control, and it is what makes the
    // difference below a difference in the REFUSAL PATH rather than in the edit itself.
    assert.equal(mouse.posts[0].body.markdown, key.posts[0].body.markdown, "the two gestures did not even post the same file");
    assert.deepEqual(mouse.posts[0].body.ops, key.posts[0].body.ops, "the two gestures did not post the same ops");

    // AND THEN THEY DIVERGE. Measured on main: 1 and 2.
    assert.equal(
      mouse.posts.length,
      key.posts.length,
      `the same act was answered differently: the mouse tick made ${mouse.posts.length} POST(s) and \`x\` made ${key.posts.length}. ` +
        "A tick is one glyph on one line and there is exactly one correct answer to a refused one — " +
        "`app/index.html`'s `toggleTask` and `app/present/commit.ts`'s `commitLine` are two write " +
        "paths for one act, and only the second holds a rebase.",
    );
  });
});

describe("1b. THE BOX MOVES ONLY WHEN THE ANSWER IS FINAL", () => {
  /**
   * THE OPERATOR'S OWN RULE, AND IT IS NOT A RULE ABOUT BOXES: *the graph is truth, minus changes
   * streamed from the view that have not landed.*
   *
   * So the question a refused tick asks is never "was there a 409" — it is "is this change still
   * in flight". A 409 that a rebase then satisfies never left flight, and reverting the box on it
   * would show the operator a state the server does not have and is about to stop having. The two
   * tests below are the two sides of that one rule, and the FIRST is the one a "revert on 409"
   * implementation gets wrong while passing every count-the-POSTs assertion above.
   */
  test("a refused tick whose rebase succeeds keeps the box ticked — it never left flight", async () => {
    const { page, elements, posts } = await freshPage("one-path-inflight", { refuseFirst: true });
    await tickByMouse(page, elements);

    assert.equal(posts.length, 2, "the rebase retry did not happen — this test cannot say anything");
    const box = boxForRow(elements, "[[qntm:1]]");
    assert.equal(
      box.checked,
      true,
      "the box was put back on a refusal that a retry then satisfied. The change was in flight the " +
        "whole time and it landed; reverting shows a state the server does not hold.",
    );
  });

  test("a refused tick with no retry left puts the box back — the graph is truth again", async () => {
    // THE SERVER REWROTE THE VERY LINE BEING TICKED, so `rebaseLineEdit` refuses `line-changed`
    // rather than reapplying the edit over someone else's words. Nothing is left to retry, so the
    // change stops being streamed-from-the-view and the box has to tell the truth.
    const work = makeWorkDir("one-path-final-refusal");
    const { elements, document: doc } = installBrowser();
    const posts = [];
    globalThis.fetch = async (url, init) => {
      posts.push({ url, body: JSON.parse(init.body) });
      return {
        ok: false,
        status: 409,
        json: async () => ({
          ok: false,
          refused: "stale-base",
          path: "demo.md",
          error: "stale base",
          current: ["## Queue", "- [ ] a REWRITTEN [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2"].join("\n"),
        }),
      };
    };
    const page = await importPage(work);
    page.__applyPresentation(DECLARATION);
    page.__setGraphData({ snapshot: { generated_at: "2026-08-05T00:00:00Z", views: [VIEW] } });
    page.paintView("demo");
    await tickByMouse(page, elements);

    assert.equal(posts.length, 1, "a rebase was attempted after all — the fixture is not producing a final refusal");
    const box = boxForRow(elements, "[[qntm:1]]");
    assert.equal(
      box.checked,
      false,
      "the box stayed ticked after a refusal nothing can retry. Nothing is in flight, so the graph " +
        "is truth, and a ticked box is the lie this rule exists to stop.",
    );
    assert.equal(box.disabled, false, "the box was left disabled, so the operator cannot try again");
  });
});

describe("2. THE RETRY CARRIES ITS OPS", () => {
  test("the write sent after a rebase names the edit it is, like every other write in this app", async () => {
    const { press, posts } = await freshPage("one-path-retry-ops", { refuseFirst: true });
    await tickByKey(press);

    assert.equal(posts.length, 2, "no rebase retry happened — this test cannot say anything about it");
    const retry = posts[1];

    // WHY THIS IS NOT A WHOLE-FILE FOLD, contradicting the docstring at commit.ts's `writeFile`
    // declaration ("Absent on the rebase retry below, deliberately — that is a whole-file fold").
    // `rebaseLineEdit` returns `applyEdit(current, {kind: "set-line", lineIndex: reading.lineIndex,
    // text: edited})` — ONE line replaced, and `reading.lineIndex` is an index INTO THE SERVER'S
    // OWN FILE, which is also the `base` this retry declares. So the op and the body agree by
    // construction against the same base, which is the whole of `lineOps`' own safety argument.
    assert.ok(
      Array.isArray(retry.body.ops) && retry.body.ops.length === 1,
      "the rebase retry sent no ops — the one moment the write is contended is the one moment " +
        "this browser stops telling the server what the edit was, leaving `difflib` to guess it " +
        "against a file that has moved twice.",
    );

    // AND THE OP IS THE RIGHT ONE — against the server's file, not the browser's stale base. On
    // SERVER_CURRENT the line moved from index 1 to index 2.
    const [[start, end, replacement]] = retry.body.ops;
    assert.equal(start, 2, "the op is indexed against the browser's stale copy, not the base it declares");
    assert.equal(end, 3, "a set-line op must be half-open over exactly its own row");
    assert.deepEqual(replacement, ["- [x] a [[qntm:1]] 🔢 1"]);
    assert.equal(
      retry.body.markdown.split("\n")[start],
      replacement[0],
      "the op and the whole-file body describe different edits",
    );
  });
});

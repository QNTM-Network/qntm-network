/**
 * A ROW KEEPS ITS IDENTITY AND ITS SELECTION ACROSS A RESOLVE AND THE REPAINT THAT FOLLOWS.
 *
 *   node --test tests/app-row-store.test.mjs
 *
 * ── THE OPERATOR'S OWN REPORT, WHICH IS THE ACCEPTANCE CRITERION ──
 *
 * "we can't select it while it's resolving ... prob related to previous ... (should route via a
 * state store maybe...)"
 *
 * § 1 is that sentence driven through `app/index.html`'s own wiring: `gg j j o`, type a capture,
 * Enter, and then — while the POST is still in the air — one `k`. Before `app/present/rows.ts`
 * existed the row VANISHED on that keystroke, because `repaintCurrentView` re-derived its source
 * from the server's copy and the server had not answered yet.
 *
 * § 6 IS THE MUTATION PROOF and it is the only reason § 1 means anything: it reverts the two
 * expressions that read the store, on a separately-imported copy of the page, and drives the
 * identical gesture. If § 6 goes green the defect is reproduced; if it goes red the store is not
 * what is holding § 1 up.
 *
 * §§ 2–5 are the refutations: that the store and not the DOM decides what is on screen, that
 * "OFFERED, NOT INSTALLED" still holds, that a provisional handle cannot land on the wrong row,
 * and that nothing this surface holds reaches a write.
 *
 * ── WHAT THIS SUITE DOES NOT VERIFY ──
 *
 * No browser was opened. No passkey session, no live graph server, no engine cycle, no real POST.
 * Every projection below is a FIXTURE — a second string, hand-built the way a real cycle transforms
 * a real line, taken from the shapes `tests/app-open-line-survives.test.mjs` already uses against
 * the operator's own inbox. The DOM is `installBrowser`'s stub.
 */

import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  REPO,
  assertMutated,
  extractPageScript,
  importPage,
  installBrowser,
  makeEvent,
  makeWorkDir,
  walk,
} from "./fixtures/app-html-page.mjs";

const WORK = makeWorkDir("app-row-store");

/**
 * The inbox as `~/qntm/inbox.md` really prints it (read read-only 2026-08-01, the same copy
 * tests/app-open-line-survives.test.mjs holds) — newest first, every line stamped.
 */
const INBOX = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
  "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
  "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
].join("\n");

const TYPED = "- [ ] Call the bank";

/**
 * WHAT THE CYCLE MAKES OF THAT LINE — stamped, defaulted, marked. It is not the string that went on
 * the wire and that is the whole difficulty: the row's instance id was its own characters, and the
 * characters changed.
 */
const STAMPED = `${TYPED} [[qntm:2604]] #task 🆕 2026-08-04`;

/** The projection the cycle answers with: his line stamped, in place. */
const ANSWERED = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
  STAMPED,
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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE HARNESS — one page, one browser, and a write that answers only when a test says so.
// ══════════════════════════════════════════════════════════════════════════════════════════════

let page;
let elements;
let doc;
/** Every write the page has made, in order, each with the resolver its test can call. */
let writes;

/** A `fetch` that hands the test the resolver rather than answering by itself. */
function deferredFetch() {
  writes = [];
  globalThis.fetch = (url, init) =>
    new Promise((resolve, reject) => {
      writes.push({
        url: String(url),
        body: init?.body === undefined ? null : JSON.parse(init.body),
        answer: (data, ok = true, status = 200) =>
          resolve({ ok, status, json: async () => data }),
        fail: (error) => reject(error),
      });
    });
}

before(async () => {
  ({ elements, document: doc } = installBrowser());
  deferredFetch();
  page = await importPage(WORK);
});

beforeEach(() => {
  deferredFetch();
});

const body = () => elements.get("viewBody");
const inputs = () => walk(body()).filter((el) => el.tagName === "input" && el.type === "text");
const press = (key) => doc.dispatch("keydown", makeEvent({ key }));
const rows = () => page.__rows();

/** Every row the painter actually drew, by the `data-instance` it stamped on it. */
const painted = () =>
  walk(body())
    .map((el) => el.dataset?.instance)
    .filter((id) => typeof id === "string" && id !== "");

/** Is a row for `text` on the screen — asked of the painter's own output, never of the store. */
const onScreen = (text) => painted().some((id) => id.endsWith(`/${text}`) || id.includes(text));

/**
 * Land in the inbox, put the cursor on `- [ ] Lesley pay tenner`, press `o`, type `TYPED` and
 * settle it with Enter. Returns nothing; the write is left IN THE AIR, unanswered.
 *
 * IT DRIVES THE PAGE'S OWN KEY WIRING rather than calling `commitLine` — `app/index.html` is
 * outside every enforcer this repo has, so a suite that reimplemented its wiring would stay green
 * while the page rotted.
 */
function captureAndLeaveItResolving(currentPage = page) {
  currentPage.__setGraphData({ snapshot: snapshot(INBOX) });
  currentPage.__setCurrentViewId("inbox");
  currentPage.paintView("inbox", "chosen");
  press("g");
  press("g");
  press("j");
  press("j");
  press("o");
  const row = inputs()[0];
  assert.ok(row, "`o` did not open a row through the page's own wiring");
  row.value = TYPED;
  row.dispatch("input");
  row.dispatch("keydown", makeEvent({ key: "Enter" }));
}

/** The cycle's answer, landing the way a real projection does. */
function landProjection(markdown, currentPage = page) {
  currentPage.__setGraphData({ snapshot: snapshot(markdown) });
  currentPage.paintView("inbox", "arrived");
}


/**
 * A source file with its COMMENTS REMOVED — because every invariant below is about what the code
 * does, and this repo's code explains itself in prose that names the very things being forbidden.
 * `rows.ts`'s own header explains why the vim handler used to reach `applyEdit`; grepping the raw
 * file for that string would fail on the sentence saying it must not happen.
 */
const codeOf = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** The page's own module script, comments removed. */
const pageCode = () => {
  const html = readFileSync(join(REPO, "app", "index.html"), "utf8");
  const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(script, "app/index.html no longer contains a module script");
  return codeOf(script[1]);
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE ACCEPTANCE TEST — the operator's own sentence, driven, and the proof it can go red.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. a row keeps its identity and its selection across a resolve and the repaint after it", () => {
  test("THE ROW IS REAL FROM THE INSTANT IT IS TYPED — a handle, before the engine has named it", () => {
    captureAndLeaveItResolving();

    const store = rows();
    assert.equal(store.view, "inbox");
    assert.ok(store.source.includes(TYPED), "the store is not holding the string on screen");

    const row = store.rowAt(3);
    assert.ok(row, "the typed line has no row in the store");
    assert.equal(row.text, TYPED);
    assert.equal(row.id.kind, "provisional", "a row nobody has stamped claims an engine id");
    assert.ok(row.id.local, "the row has no handle");
    assert.equal(row.id.engine, undefined, "a provisional identity carries an engine id");
  });

  test("AND IT SURVIVES THE REPAINT A KEYSTROKE CAUSES, WHICH IS THE OPERATOR'S OWN COMPLAINT", () => {
    captureAndLeaveItResolving();
    assert.ok(onScreen(TYPED), "the optimistic repaint did not draw the typed row");
    const handle = rows().rowAt(3).id.local;

    // The write is STILL in the air — nothing has answered it.
    assert.equal(writes.length, 1, "the capture did not post exactly one write");
    press("j");
    press("k");

    assert.ok(onScreen(TYPED), "the typed row vanished on a keystroke while the write was resolving");
    assert.equal(rows().rowAt(3).id.local, handle, "the row came back as a DIFFERENT row");
    assert.equal(page.__focusIndex(), 3, "the cursor is not on the row he typed");
    assert.equal(rows().selected?.id.local, handle, "the store does not have that row selected");
  });

  test("AND THE ENGINE'S ID BINDS TO THE SAME HANDLE WHEN THE CYCLE ANSWERS — the reconciliation", () => {
    captureAndLeaveItResolving();
    press("j");
    press("k");
    const handle = rows().selected.id.local;
    assert.equal(rows().selected.id.kind, "provisional");

    // The cycle answers: the line is stamped, defaulted and marked. Every character of its instance
    // id has changed, so ONLY `relative.ts`'s neighbourhood claim can carry the row across.
    landProjection(ANSWERED);

    const row = rows().rowOf(handle);
    assert.ok(row, "the handle did not survive the projection — the row was re-minted");
    assert.equal(row.id.kind, "reconciled", "the engine named the line and the row did not notice");
    assert.equal(row.id.engine, "qntm:2604");
    assert.equal(row.text, STAMPED);
    assert.equal(row.lineIndex, 3);
    assert.equal(rows().selected?.id.local, handle, "the row lost its selection across the resolve");
    assert.equal(page.__focusIndex(), 3, "the cursor did not follow the row it was on");
  });

  test("THE HANDLE IS THIS BROWSER'S OWN — it is never posted and never written into a source", () => {
    captureAndLeaveItResolving();
    const handle = rows().rowAt(3).id.local;
    const posted = writes[0].body;

    assert.ok(!JSON.stringify(posted).includes(handle), "a local handle reached the wire");
    assert.ok(!posted.markdown.includes("row:"), "a local handle reached the file");
    landProjection(ANSWERED);
    assert.ok(!rows().source.includes(handle), "a local handle reached the source on screen");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. REFUTATION (a) — IS THE STORE ACTUALLY THE SOURCE OF TRUTH, OR IS THE DOM STILL?
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. the store decides what is on screen, and the screen follows it", () => {
  test("MUTATE THE STORE AND THE SCREEN FOLLOWS — nothing else was touched", () => {
    captureAndLeaveItResolving();
    assert.ok(onScreen(TYPED));

    // Nothing in `graphData` moves, nothing is accepted, no projection lands. ONLY the store is
    // told something new — and the next ordinary repaint draws it.
    rows().edited("inbox", ANSWERED);
    page.__repaintCurrentView();

    assert.ok(onScreen("qntm:2604"), "the store moved and the screen did not follow it");
  });

  test("THE PAGE NEVER READS A ROW BACK OFF THE DOM — no query selector, no reading of a child", () => {
    const PAGE = pageCode();
    for (const forbidden of ["querySelector", "getElementsByClassName", ".children", ".childNodes"]) {
      assert.equal(PAGE.includes(forbidden), false, `the page reads the document back: ${forbidden}`);
    }
  });

  test("THE STORE READS NO DOCUMENT AND NO CLOCK — it holds state, it does not go and find any", () => {
    const code = codeOf(readFileSync(join(REPO, "app", "present", "rows.ts"), "utf8"));
    for (const forbidden of ["document", "window", "fetch(", "Date.now"]) {
      assert.equal(code.includes(forbidden), false, `rows.ts reaches for ${forbidden}`);
    }
  });

  test("THE PAINTER IS GIVEN THE WRITE HALF ONLY — it cannot read the table it fills", () => {
    const PAINT = codeOf(readFileSync(join(REPO, "app", "present", "paint.ts"), "utf8"));
    // `RowSink` is the narrowed type; `RowStore` must not appear in the painter at all.
    assert.ok(PAINT.includes("RowSink"), "paint.ts no longer names the sink — this test is stale");
    assert.equal(PAINT.includes("RowStore"), false, "paint.ts was handed the whole store");
    for (const reader of ["rows?.rowAt", "rows?.selected", "rows?.carry", "rows?.source"]) {
      assert.equal(PAINT.includes(reader), false, `paint.ts reads the store: ${reader}`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. REFUTATION (b) — CAN A PROJECTION ARRIVING MID-EDIT STILL DESTROY TYPED CHARACTERS?
//    "OFFERED, NOT INSTALLED", and the store must not become the thing that installs one.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. offered, not installed — a projection does not reach the screen while a line is open", () => {
  test("THE SEQUENCE THAT COST HIM WORK ONCE: capture, open the next row, and the first answer lands", async () => {
    captureAndLeaveItResolving();
    press("o");
    const second = inputs()[0];
    assert.ok(second, "the second `o` did not open a row");
    second.value = "- [ ] Ring the dentist";
    second.dispatch("input");

    // The FIRST capture's own cycle, coming back while he is typing the second one.
    writes[0].answer({ ok: true, snapshot: snapshot(ANSWERED), pending_edits: 0 });
    await new Promise((r) => setImmediate(r));

    assert.notEqual(page.__queued().pending("inbox.md"), null, "the projection was not held");
    assert.equal(inputs().length, 1, "the row he is typing into was destroyed, or doubled");
    assert.equal(inputs()[0].value, "- [ ] Ring the dentist", "his characters were replaced");
    assert.ok(
      !rows().source.includes("qntm:2604"),
      "the store installed a projection that the page deliberately held",
    );
  });

  test("AND IT LANDS THE MOMENT THE ROW SETTLES — held is held, never dropped", async () => {
    captureAndLeaveItResolving();
    press("o");
    const second = inputs()[0];
    second.value = "- [ ] Ring the dentist";
    second.dispatch("input");
    writes[0].answer({ ok: true, snapshot: snapshot(ANSWERED), pending_edits: 0 });
    await Promise.resolve();

    second.dispatch("keydown", makeEvent({ key: "Escape" }));
    press("j"); // the third drain point — the world catches up when he is not typing into it

    assert.ok(rows().source.includes("qntm:2604"), "the held projection never reached the screen");
  });

  test("A 409 KEEPS HIS CHARACTERS ON SCREEN — the store must not adopt the server's file under him", async () => {
    captureAndLeaveItResolving();
    const refusal = new Error("stale base");
    refusal.status = 409;
    refusal.refused = "stale-base";
    refusal.current = INBOX;
    writes[0].fail(refusal);
    await new Promise((r) => setImmediate(r));

    assert.ok(
      rows().source.includes(TYPED),
      "a refusal adopted the server's file and the operator's characters left the screen",
    );
    assert.ok(onScreen(TYPED), "his line is no longer painted after the refusal");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. REFUTATION (c) — DOES A PROVISIONAL HANDLE EVER LAND ON THE WRONG ROW, OR TWO ON ONE ROW?
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. the identity race, built rather than assumed away", () => {
  test("NO TWO ROWS EVER SHARE A HANDLE, across every resolve this suite drives", () => {
    captureAndLeaveItResolving();
    const seen = () => rows().rows.map((r) => r.id.local);
    const unique = (list) => assert.equal(new Set(list).size, list.length, `duplicate handle: ${list}`);

    unique(seen());
    landProjection(ANSWERED);
    unique(seen());
    landProjection(INBOX);
    unique(seen());
  });

  test("TWO ROWS WHOSE CHARACTERS EXTEND ONE ANOTHER DO NOT BOTH CLAIM ONE LINE", () => {
    // Both unstamped, both in one section, one an extension of the other. On the arriving source
    // only ONE of them is still there, so the ladder has two claimants for one line.
    const before = ["## Inbox", "- [ ] pay", "- [ ] pay the bill"].join("\n");
    const after = ["## Inbox", "- [ ] pay the bill [[qntm:9]] #task"].join("\n");
    page.__setGraphData({ snapshot: { generated_at: "t", views: [{ ...view(before) }] } });
    page.__setCurrentViewId("inbox");
    page.paintView("inbox", "chosen");
    const held = rows().rows.map((r) => [r.lineIndex, r.id.local]);
    assert.equal(held.length, 3);

    page.__setGraphData({ snapshot: { generated_at: "t2", views: [{ ...view(after) }] } });
    page.paintView("inbox", "arrived");

    const now = rows().rows;
    assert.equal(now.length, 2, "the arriving view has two printed lines");
    assert.equal(new Set(now.map((r) => r.id.local)).size, 2, "two rows landed on one line");
    assert.equal(now[1].id.engine, "qntm:9");
  });

  test("A ROW ALREADY BOUND TO AN ENGINE ID IS DROPPED RATHER THAN RE-POINTED AT ANOTHER", () => {
    const store = rows();
    const first = ["## Inbox", "- [ ] a [[qntm:11]] #task"].join("\n");
    store.showing("race", first);
    const bound = store.rowAt(1);
    assert.equal(bound.id.engine, "qntm:11");

    // The SAME instance string, a DIFFERENT node — the one shape that means the walk landed wrong.
    // (`instance.ts` keys an unstamped line by its text; here the stamp itself changed, so the
    // instance changes with it and only a text-tier claim could reach the new line at all.)
    const second = ["## Inbox", "- [ ] a [[qntm:12]] #task"].join("\n");
    store.showing("race", second);

    const now = store.rowAt(1);
    assert.equal(now.id.engine, "qntm:12", "the row did not take the arriving engine's id");
    assert.notEqual(now.id.local, bound.id.local, "one handle now addresses two different nodes");
  });

  test("A VIEW CHANGE DISCARDS THE TABLE — a handle never crosses into another file", () => {
    captureAndLeaveItResolving();
    const handle = rows().rowAt(3).id.local;

    page.__setCurrentViewId("this-week");
    page.paintView("this-week", "chosen");

    assert.equal(rows().view, "this-week");
    assert.equal(rows().rowOf(handle), null, "a row from the inbox is addressable inside another view");
    assert.equal(rows().source, OTHER.markdown);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE WRITE-PATH INVARIANT — the write still carries nothing beyond what the operator typed.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. nothing this store holds reaches a write", () => {
  const ROWS = codeOf(readFileSync(join(REPO, "app", "present", "rows.ts"), "utf8"));

  test("`.markdown` is never assigned in rows.ts, and it names no write path at all", () => {
    assert.deepEqual(ROWS.match(/\.markdown\s*=(?!=)/g), null);
    for (const forbidden of ["writeFile", "applyEdit", "/app/edit-file", "commit."]) {
      assert.equal(ROWS.includes(forbidden), false, `rows.ts reaches the write path: ${forbidden}`);
    }
  });

  test("THE POSTED FILE IS THE FILE, WITH EXACTLY THE LINE HE TYPED INSERTED — nothing else", () => {
    captureAndLeaveItResolving();
    const posted = writes[0].body.markdown;
    const before = INBOX.split("\n");
    const after = posted.split("\n");

    assert.equal(after.length, before.length + 1, "the write gained or lost more than one line");
    assert.equal(after[3], TYPED, "the inserted line is not the characters he typed");
    const rest = [...after.slice(0, 3), ...after.slice(4)];
    assert.deepEqual(rest, before, "a line nobody edited moved or changed");
  });

  test("AND A RESOLVE THAT RECONCILED A ROW STILL POSTS ONLY WHAT HE TYPES NEXT", () => {
    captureAndLeaveItResolving();
    landProjection(ANSWERED);
    // He ticks the reconciled row with `x` — the gesture that reads the store's source directly.
    press("g");
    press("g");
    press("j");
    press("j");
    press("j");
    press("x");

    const tick = writes[writes.length - 1].body.markdown;
    const before = ANSWERED.split("\n");
    const after = tick.split("\n");
    const changed = before.map((_, i) => i).filter((i) => before[i] !== after[i]);
    assert.deepEqual(changed, [3], "the tick changed a line other than the one under the cursor");
    assert.equal(after[3], STAMPED.replace("- [ ]", "- [x]"));
  });
});


// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE MUTATION PROOF — the store is load-bearing, or every section above is decoration.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// A GUARD THAT CANNOT GO RED IS DECORATION. This reverts the ONE thing the fix turns on — the two
// expressions that ask the store what is on screen — back to what shipped on `7ca06c4`, and drives
// § 1's identical gesture against the reverted page. `assertMutated` refuses a pattern that is not
// there exactly once, so a green result here can never mean "the pattern drifted and the
// unmodified page passed".
//
// IT IS LAST IN THE FILE AND STANDS UP ITS OWN BROWSER, because `installBrowser` and `importPage`
// are process-global: a mutant imported earlier would leave every later section measuring it.

describe("6. break the store's readers and the acceptance test goes red", () => {
  let mutant;
  let mutantElements;
  let mutantDoc;

  before(async () => {
    ({ elements: mutantElements, document: mutantDoc } = installBrowser());
    globalThis.fetch = () => new Promise(() => {});
    const file = extractPageScript(makeWorkDir("app-row-store-mutant"), (source) => {
      let out = assertMutated(
        source,
        "  const source = rows.showing(v.id, accepted.sourceFor(v.path) ?? v.markdown);\n  //",
        "  const source = accepted.sourceFor(v.path) ?? v.markdown;\n  //",
      );
      out = assertMutated(
        out,
        "    const source = rows.showing(v.id, accepted.sourceFor(v.path) ?? v.markdown);\n    const lastIndex",
        "    const source = v.markdown;\n    const lastIndex",
      );
      return out;
    });
    mutant = await import(`file://${file}`);
  });

  test("WITHOUT the store's answer, the typed row vanishes on the very next keystroke", () => {
    const mBody = () => mutantElements.get("viewBody");
    const mInputs = () => walk(mBody()).filter((el) => el.tagName === "input" && el.type === "text");
    const mPress = (key) => mutantDoc.dispatch("keydown", makeEvent({ key }));
    const mOnScreen = (text) =>
      walk(mBody())
        .map((el) => el.dataset?.instance)
        .some((id) => typeof id === "string" && id.includes(text));

    mutant.__setGraphData({ snapshot: snapshot(INBOX) });
    mutant.__setCurrentViewId("inbox");
    mutant.paintView("inbox", "chosen");
    mPress("g");
    mPress("g");
    mPress("j");
    mPress("j");
    mPress("o");
    const row = mInputs()[0];
    assert.ok(row, "`o` did not open a row on the mutated page");
    row.value = TYPED;
    row.dispatch("input");
    row.dispatch("keydown", makeEvent({ key: "Enter" }));

    assert.ok(mOnScreen(TYPED), "even the optimistic repaint failed — the mutation broke the wrong thing");

    mPress("j");
    mPress("k");

    assert.equal(
      mOnScreen(TYPED),
      false,
      "the mutation did not reproduce the defect — this suite proves nothing about the store",
    );
  });
});

/**
 * THE BEHAVIOURAL QUEUE — a projection arriving mid-edit is HELD, and applied coherently after.
 *
 *   node --test tests/app-projection-queue.test.mjs
 *
 * ── THE ROW, AND THE DEFECT IT IS EVIDENCE AGAINST ──
 *
 * `a-projection-can-arrive-and-be-held`, specified in
 * docs/implementation-artifacts/design-local-behaviour-and-the-queue.md §5.
 *
 * `paint.ts`'s `rawInput` sets `input.value = lineSource` — the characters of an open line come out
 * of whatever source string the painter is walking. So a projection installed while a line is open
 * replaces what the operator typed, mid-word, with what the cycle thinks that line says. It needs
 * no unbidden transport to reach: `commitLine` is async and a cycle takes seconds, so a tick's own
 * answer lands on the line he opened after making it.
 *
 * ── WHAT IS PROVEN, AND IN WHICH SECTION ──
 *
 *   §1  THE SURFACE. `ProjectionQueue` in isolation, out of dist/present.js — the artifact the
 *       browser loads. One pending per path, ordered by `generated_at`, newest wins, older DROPPED.
 *   §2  HELD. A projection arriving mid-edit does not reach the screen and does not touch his
 *       characters — with lines changed ABOVE the open line, BELOW it, and BOTH.
 *   §3  COALESCED. Two arrivals while one line is open leave ONE pending projection, the newer, and
 *       the older is never applied — proven on the screen and not only on the surface.
 *   §4  THE DETECTOR STILL FIRES. A held projection moves the BASE even though it does not move the
 *       screen, so a second write reports the divergence. And it stays silent when it should.
 *   §5  TWO EDITS INSIDE ONE CYCLE. The second edit is made while the first is in flight — the case
 *       that must not lose work — and neither side is lost.
 *   §6  MUTATION PROOFS. Break the coalescing and break the gate; watch the guards go red.
 *
 * ── WHAT THIS SUITE DOES NOT VERIFY ──
 *
 * No browser was opened. No passkey session, no live graph server, no engine cycle, no real POST.
 * Every projection below is a FIXTURE — a second string, hand-built the way a real cycle transforms
 * a real line. The DOM is `installBrowser`'s stub. Nothing here measures latency, and nothing here
 * exercises an ASYNCHRONOUS ack: `POST /app/edit-file` still awaits the cycle, so every arrival
 * below is the return of a write, which is the only way a projection reaches this page today.
 */

import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import {
  assertMutated,
  importPage,
  installBrowser,
  makeEvent,
  makeWorkDir,
  walk,
  REPO,
} from "./fixtures/app-html-page.mjs";

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SURFACE — app/present/queue.ts, out of the shipped bundle
// ══════════════════════════════════════════════════════════════════════════════════════════════

const PATH = "work/outcomes.md";
const OTHER_PATH = "inbox.md";

/** The shipped class, not a re-implementation — the same posture present-base.test.mjs takes. */
let ProjectionQueue;
before(async () => {
  ({ ProjectionQueue } = await import(join(REPO, "dist", "present.js")));
});

const T1 = "2026-08-01T09:00:00Z";
const T2 = "2026-08-01T09:00:10Z";
const T3 = "2026-08-01T09:00:20Z";

describe("1. ONE PENDING PROJECTION PER PATH, ORDERED BY `generated_at`", () => {
  test("an offer into an empty queue is QUEUED and is what is pending", () => {
    const q = new ProjectionQueue();
    assert.equal(q.size, 0);
    assert.deepEqual(q.offer(PATH, T1, "one"), { outcome: "queued" });
    assert.equal(q.size, 1);
    assert.equal(q.pending(PATH).data, "one");
    assert.equal(q.pending(PATH).generatedAt, T1);
    assert.equal(q.pending(PATH).path, PATH);
  });

  test("A NEWER ONE SUPERSEDES — and the queue is still ONE deep, which is the whole design", () => {
    // "Two queued projections is one queued projection and one lie." A projection is an ABSOLUTE
    // statement about a file, so replaying the older one after the newer would move the screen
    // backwards through a state the server has already left.
    const q = new ProjectionQueue();
    q.offer(PATH, T1, "one");
    assert.deepEqual(q.offer(PATH, T2, "two"), { outcome: "superseded" });
    assert.equal(q.size, 1, "the queue accumulated instead of coalescing");
    assert.equal(q.pending(PATH).data, "two");
  });

  test("AN OLDER ONE IS DROPPED — it is not applied first and it does not linger", () => {
    const q = new ProjectionQueue();
    q.offer(PATH, T2, "two");
    assert.deepEqual(q.offer(PATH, T1, "one"), { outcome: "stale" });
    assert.equal(q.size, 1);
    assert.equal(q.pending(PATH).data, "two", "an out-of-order arrival moved the queue backwards");
  });

  test("AN EQUAL ONE IS DROPPED TOO — the same projection delivered twice says nothing new", () => {
    const q = new ProjectionQueue();
    q.offer(PATH, T2, "two");
    assert.deepEqual(q.offer(PATH, T2, "two-again"), { outcome: "stale" });
    assert.equal(q.pending(PATH).data, "two");
  });

  test("three arrivals out of order leave the NEWEST, whichever order they came in", () => {
    for (const order of [
      [T1, T2, T3],
      [T3, T1, T2],
      [T2, T3, T1],
      [T3, T2, T1],
    ]) {
      const q = new ProjectionQueue();
      for (const at of order) q.offer(PATH, at, at);
      assert.equal(q.pending(PATH).data, T3, `arrival order ${order.join(",")} decided the answer`);
      assert.equal(q.size, 1);
    }
  });

  test("AN UNREADABLE OR ABSENT TIMESTAMP FAILS TOWARD THE ARRIVAL, on purpose", () => {
    // The only alternative is to go on showing an older projection on the strength of a comparison
    // that could not be made. Wrong about ordering beats behind the server for reasons nobody sees.
    for (const [held, arriving] of [
      [T2, null],
      [null, T1],
      [T2, "not-a-date"],
      ["not-a-date", T1],
      [null, null],
    ]) {
      const q = new ProjectionQueue();
      q.offer(PATH, held, "held");
      assert.deepEqual(
        q.offer(PATH, arriving, "arriving"),
        { outcome: "superseded" },
        `held=${held} arriving=${arriving}`,
      );
      assert.equal(q.pending(PATH).data, "arriving");
    }
  });

  test("PATHS ARE INDEPENDENT — one file's projection never supersedes another's", () => {
    const q = new ProjectionQueue();
    q.offer(PATH, T2, "outcomes");
    assert.deepEqual(q.offer(OTHER_PATH, T1, "inbox"), { outcome: "queued" });
    assert.equal(q.size, 2);
    assert.equal(q.pending(PATH).data, "outcomes");
    assert.equal(q.pending(OTHER_PATH).data, "inbox");
  });

  test("`take` hands it over exactly once; `pending` does not", () => {
    const q = new ProjectionQueue();
    q.offer(PATH, T1, "one");
    assert.equal(q.pending(PATH).data, "one");
    assert.equal(q.pending(PATH).data, "one", "reading it consumed it");
    assert.equal(q.take(PATH).data, "one");
    assert.equal(q.take(PATH), null, "it was handed over twice");
    assert.equal(q.pending(PATH), null);
    assert.equal(q.size, 0);
  });

  test("`drop` and `clear` forget without applying", () => {
    const q = new ProjectionQueue();
    q.offer(PATH, T1, "one");
    q.offer(OTHER_PATH, T1, "two");
    q.drop(PATH);
    assert.equal(q.size, 1);
    q.clear();
    assert.equal(q.size, 0);
    assert.equal(q.pending(OTHER_PATH), null);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2-5. THE PAGE — app/index.html, driven
// ══════════════════════════════════════════════════════════════════════════════════════════════

const WORK = makeWorkDir("app-projection-queue");

/**
 * The view, the way `work/outcomes.md` really prints. Line 3 is the one the operator opens; line 2
 * is ABOVE it and line 4 is BELOW it, so a projection can be built that changes either, or both.
 */
const V1 = [
  "# This Week",
  "",
  "- [ ] Draft the launch note [[qntm:121]] #task",
  "- [ ] Ring the dentist [[qntm:122]] #task",
  "- [ ] Water the plants [[qntm:123]] #task",
  "",
].join("\n");

/** What a cycle does that nobody typed: a rule's tag, and a stamp. Above, below, and both. */
const changed = (lines) => {
  const out = V1.split("\n");
  for (const [at, text] of lines) out[at] = text;
  return out.join("\n");
};
const ABOVE = changed([[2, "- [ ] Draft the launch note [[qntm:121]] #task #blocked"]]);
const BELOW = changed([[4, "- [ ] Water the plants [[qntm:123]] #task 🛫 2026-08-04"]]);
const BOTH = changed([
  [2, "- [ ] Draft the launch note [[qntm:121]] #task #blocked"],
  [4, "- [ ] Water the plants [[qntm:123]] #task 🛫 2026-08-04"],
]);

const view = (markdown) => ({
  id: "this-week",
  path: PATH,
  title: "This Week",
  domain: "work",
  markdown,
});

const envelope = (markdown, at) => ({
  ok: true,
  handle: "luke",
  pending_edits: 0,
  snapshot: { generated_at: at, views: [view(markdown)] },
});

let page;
let elements;
/** What the write endpoint answers next — a queue of envelopes, one taken per POST. */
let answers;
/** Every body this page put on the wire, in order. */
let posted;

const settle = () => new Promise((r) => setImmediate(r));
const freshness = () => elements.get("freshness").textContent;

/** Everything the painted body is showing, as one string. */
const onScreen = () =>
  walk(elements.get("viewBody"))
    .map((el) => `${el.textContent || ""}${el.innerHTML || ""}${el.value || ""}`)
    .join("\n");

const openInputs = () =>
  walk(elements.get("viewBody")).filter((el) => el.tagName === "input" && el.type === "text");
const boxes = () => walk(elements.get("viewBody")).filter((el) => el.type === "checkbox");

/**
 * THE ROW A SOURCE LINE IS DRAWN AS, ADDRESSED BY THE SOURCE LINE AND NOT BY POSITION ON SCREEN.
 *
 * `paint()` appends exactly one direct child per NON-BLANK source line, in source order (its own
 * `lastPaintedIndex` comment says so), and the blank-line drop is what makes the two orders differ.
 * Counting the non-blank lines before `lineIndex` is therefore the mapping, and it survives what a
 * fixed ordinal does not: the row's SHAPE changes as the cursor moves through the view — a
 * checkbox `label` becomes a three-span `normalLine` when it is selected and an `<input>` when it
 * is opened — so a test that indexed spans would silently address a different line after any
 * gesture. This suite drives several gestures in a row; that is not a hypothetical.
 */
function rowFor(els, source, lineIndex) {
  const before = source
    .split("\n")
    .slice(0, lineIndex)
    .filter((line) => line.trim() !== "").length;
  const row = els.get("viewBody").children[before];
  assert.ok(row, `no painted row for source line ${lineIndex}`);
  return row;
}

/**
 * Open a line for typing through the page's own click wiring — which is what runs
 * `mode.enterInsert()` (`paint.ts`'s `focusable`). The listener sits on whichever element the
 * painter made focusable for that shape (the `<span>` of a checkbox row, the `<div>` of a selected
 * one), so it is found rather than assumed.
 *
 * A CLICK RATHER THAN `i`, DELIBERATELY. The keyboard path would run this page's third drain point
 * on the way past, and several arms below need to open a line while a projection is still held.
 */
function clickLine(els, source, lineIndex) {
  const row = rowFor(els, source, lineIndex);
  const target = [row, ...walk(row)].find((el) => el.listeners?.has("click"));
  assert.ok(target, `source line ${lineIndex} is painted with nothing a cursor can reach`);
  target.dispatch("click", makeEvent());
  const input = walk(els.get("viewBody")).find((el) => el.tagName === "input" && el.type === "text");
  assert.ok(input, "clicking the line did not open it for typing");
  return input;
}

/** Land a projection the ordinary way — the boot path, which nothing about the queue touches. */
function land(markdown, at = T1) {
  const fresh = envelope(markdown, at);
  page.__setGraphData(fresh);
  page.__setCurrentViewId("this-week");
  page.paintView("this-week", "chosen");
  return fresh;
}

describe("THE PAGE — a projection arriving mid-edit", () => {
  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = async (url, init) => {
      posted.push(JSON.parse(init.body));
      const next = answers.shift();
      assert.ok(next, "the page posted more times than this arm has answers for");
      return { ok: true, status: 200, json: async () => next };
    };
    page = await importPage(WORK);
  });

  beforeEach(() => {
    answers = [];
    posted = [];
    page.__queued().clear();
  });

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // 2. HELD — the falsifier, three ways
  // ════════════════════════════════════════════════════════════════════════════════════════════

  for (const [where, arriving, markers] of [
    ["ABOVE the open line", ABOVE, ["#blocked"]],
    ["BELOW the open line", BELOW, ["🛫 2026-08-04"]],
    ["ABOVE AND BELOW it", BOTH, ["#blocked", "🛫 2026-08-04"]],
  ]) {
    test(`a projection that changes lines ${where} is HELD, and his characters are untouched`, async () => {
      land(V1);
      answers = [envelope(arriving, T2)];

      // The tick leaves. Then — before its answer lands, which is the whole point — he opens the
      // line below it and starts typing. This is the operator's own two-gestures-in-one-cycle
      // sequence, not a race that needs a poll to reach.
      boxes()[0].checked = true;
      boxes()[0].dispatch("change");
      const input = clickLine(elements, V1, 3);
      input.value = "- [ ] Ring the dentist BEFORE FRIDAY [[qntm:122]] #task";

      await settle();

      assert.equal(input.value, "- [ ] Ring the dentist BEFORE FRIDAY [[qntm:122]] #task",
        "the arriving projection sourced his open line's characters");
      assert.equal(page.__queued().size, 1, "the projection was not held");
      assert.equal(page.__queued().pending(PATH).generatedAt, T2);
      for (const marker of markers) {
        assert.doesNotMatch(onScreen(), new RegExp(marker), `${marker} reached the screen mid-edit`);
      }
      assert.match(freshness(), /^the cycle answered/, "the page did not say the arrival was held");
    });
  }

  test("AND IT IS APPLIED COHERENTLY WHEN THE LINE SETTLES — every changed line, in one paint", async () => {
    // The half that makes holding a queue rather than a refusal. He leaves the line WITHOUT
    // changing it (the commonest way an open line closes), and the whole view moves at once.
    land(V1);
    answers = [envelope(BOTH, T2)];

    boxes()[0].checked = true;
    boxes()[0].dispatch("change");
    const input = clickLine(elements, V1, 3);
    await settle();
    assert.equal(page.__queued().size, 1, "the arm did not set up");

    input.dispatch("blur");
    // ONE TURN. `paint.ts` calls `onLineCommit` in the MIDDLE of the settlement — the mode changes
    // and the repaint happens after it returns — so the page schedules the drain for the moment the
    // settlement is finished rather than draining inside it. See `commitLine`'s own paragraph.
    await settle();

    assert.equal(page.__queued().size, 0, "the projection was still held after the line settled");
    assert.match(onScreen(), /#blocked/, "the line above did not arrive");
    assert.match(onScreen(), /🛫 2026-08-04/, "the line below did not arrive");
    assert.match(freshness(), /^as of /, "the freshness line did not report the projection landing");
    assert.equal(posted.length, 1, "an unchanged line posted a second write");
  });

  test("WITH NOTHING OPEN IT IS NOT HELD AT ALL — the queue must not become a stall", async () => {
    // The control. A cursor is not an open line: in NORMAL the selected line renders as characters
    // with a block cursor and there is nothing to lose, so the world goes on moving.
    land(V1);
    page.__setFocus(3, V1);
    page.paintView("this-week", "arrived");
    assert.equal(page.__vimMode(), "NORMAL", "the arm opened a line it meant to leave shut");
    assert.equal(page.__aLineIsOpen(), false, "a NORMAL cursor was read as an open line");

    answers = [envelope(BOTH, T2)];
    boxes()[0].checked = true;
    boxes()[0].dispatch("change");
    await settle();

    assert.equal(page.__queued().size, 0, "a projection was held with nothing open");
    assert.match(onScreen(), /#blocked/);
    assert.match(freshness(), /^as of /);
  });

  test("A ROW BEING MADE COUNTS AS AN OPEN LINE TOO — draft and edit are one gate", () => {
    // `aLineIsOpen` asks BOTH surfaces because they are deliberately separate modules (draft.ts).
    // Driven through the surfaces rather than the keyboard, so the two halves are separable.
    land(V1);
    assert.equal(page.__aLineIsOpen(), false);
    page.__setFocus(3, V1);
    assert.equal(page.__aLineIsOpen(), false, "a cursor alone is not an open line");
    clickLine(elements, V1, 3);
    assert.equal(page.__aLineIsOpen(), true, "an <input> holding a line is not an open line");
  });

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // 3. COALESCED — the older is DROPPED, not applied then overwritten
  // ════════════════════════════════════════════════════════════════════════════════════════════

  test("TWO ARRIVALS, ONE PENDING — and the older one never reaches the screen", async () => {
    land(V1);
    // Two writes, two answers. The first carries `#blocked`, the second carries BOTH, so the
    // older projection has a marker of its own that a screen could show if it were ever applied.
    answers = [envelope(ABOVE, T2), envelope(BOTH, T3)];

    // THE LINE IS OPENED AND NOT TYPED INTO, ON PURPOSE. What is under test here is the ORDERING,
    // and it is read off the screen after the line settles — so the settlement must not itself post
    // a third write whose own answer would decide what is painted. §2 and §5 carry the character
    // half; this arm carries the ordering half, and neither borrows the other's evidence.
    const input = clickLine(elements, V1, 3);

    boxes()[0].checked = true;
    boxes()[0].dispatch("change");
    await settle();
    const afterFirst = onScreen();
    assert.equal(page.__queued().size, 1);
    assert.equal(page.__queued().pending(PATH).generatedAt, T2);

    boxes()[1].checked = true;
    boxes()[1].dispatch("change");
    await settle();
    const afterSecond = onScreen();

    assert.equal(page.__queued().size, 1, "two projections were queued — one of them is a lie");
    assert.equal(page.__queued().pending(PATH).generatedAt, T3, "the older one won");

    // THE PROOF THAT IT WAS DROPPED RATHER THAN APPLIED-THEN-OVERWRITTEN is that its content was
    // never on the screen at any point, not that the end state is right. An implementation that
    // painted the older one and then the newer would end in the same place and would have moved
    // the operator's screen backwards on the way.
    assert.doesNotMatch(afterFirst, /#blocked/, "the older projection was painted");
    assert.doesNotMatch(afterSecond, /#blocked/, "the older projection was painted");
    assert.equal(input.value, V1.split("\n")[3], "the open line was re-sourced from an arrival");

    input.dispatch("blur");
    await settle();
    assert.match(onScreen(), /🛫 2026-08-04/, "the newer projection never landed");
  });

  test("AN OUT-OF-ORDER ARRIVAL IS DROPPED — ordering is `generated_at`, never the wire", async () => {
    // Two answers whose timestamps run BACKWARDS, which is what two writes racing on a network
    // produce. The screen must not follow the network's order.
    land(V1);
    answers = [envelope(BOTH, T3), envelope(ABOVE, T2)];

    const input = clickLine(elements, V1, 3);
    boxes()[0].checked = true;
    boxes()[0].dispatch("change");
    await settle();
    boxes()[1].checked = true;
    boxes()[1].dispatch("change");
    await settle();

    assert.equal(page.__queued().size, 1);
    assert.equal(page.__queued().pending(PATH).generatedAt, T3, "a later arrival moved time backwards");

    input.dispatch("blur");
    await settle();
    assert.match(onScreen(), /🛫 2026-08-04/, "the stale arrival won on the screen");
  });

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // 4. THE DETECTOR STILL FIRES — the rule this change was allowed to make no exception to
  // ════════════════════════════════════════════════════════════════════════════════════════════

  test("A HELD PROJECTION MOVES THE BASE, so the next write reports the divergence", async () => {
    // WITHOUT THIS THE QUEUE WOULD BE A SAFETY NET REMOVED TO BUY COHERENCE. `served` answers "is
    // the copy this save was computed from the copy the SERVER has". A projection sitting in the
    // queue is what the server has, so a base left at the previous one would answer `current` for
    // a save that discards a projection this page is holding in its own hand.
    land(V1);
    answers = [envelope(ABOVE, T2), envelope(BOTH, T3)];

    const input = clickLine(elements, V1, 3);
    boxes()[0].checked = true;
    boxes()[0].dispatch("change");
    await settle();

    assert.equal(page.__served().markdown, ABOVE, "the base did not follow the held projection");

    boxes()[1].checked = true;
    boxes()[1].dispatch("change");
    await settle();

    assert.match(
      freshness(),
      /out-of-date copy|overwritten/,
      "a second write against a superseded base said nothing",
    );
    void input;
  });

  test("AND IT STAYS SILENT WHEN IT SHOULD — one write, nothing queued, no sentence", async () => {
    land(V1);
    answers = [envelope(ABOVE, T2)];

    boxes()[0].checked = true;
    boxes()[0].dispatch("change");
    await settle();

    assert.match(freshness(), /^as of /);
    assert.doesNotMatch(freshness(), /out-of-date copy|overwritten/, "a clean write was reported stale");
  });

  test("the base a HELD projection sets is SERVER markdown, never a string this page computed", async () => {
    // `base.ts`'s named trap. The second site that calls `served.take` must be as safe as the first.
    land(V1);
    answers = [envelope(BOTH, T2)];

    const input = clickLine(elements, V1, 3);
    input.value = "- [ ] Ring the dentist COMPUTED LOCALLY [[qntm:122]] #task";
    boxes()[0].checked = true;
    boxes()[0].dispatch("change");
    await settle();

    assert.equal(page.__served().markdown, BOTH);
    assert.doesNotMatch(page.__served().markdown, /COMPUTED LOCALLY/, "the detector certified its own divergence");
  });

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // 5. TWO EDITS INSIDE ONE CYCLE — the case that must not lose work
  // ════════════════════════════════════════════════════════════════════════════════════════════

  test("HE COMMITS ONE LINE AND OPENS THE NEXT; the first answer lands, and NEITHER is lost", async () => {
    // Measured as ordinary rather than rare: `a-line-being-made-survives-a-projection-too`'s own
    // record calls two captures in a row "the operator's ordinary gesture in his own inbox".
    land(V1);
    // The first write's answer carries the operator's own committed line PLUS a rule's output on
    // the line above it — which is what a real cycle returns.
    const FIRST_ANSWER = changed([
      [2, "- [ ] Draft the launch note [[qntm:121]] #task #blocked"],
      [3, "- [ ] Ring the dentist ON MONDAY [[qntm:122]] #task 🆕 2026-08-01"],
    ]);
    answers = [envelope(FIRST_ANSWER, T2), envelope(FIRST_ANSWER, T3)];

    const first = clickLine(elements, V1, 3);
    first.value = "- [ ] Ring the dentist ON MONDAY [[qntm:122]] #task";
    first.dispatch("blur");
    // He does not wait. The next line opens while the first write is still in the air.
    const second = clickLine(elements, V1, 4);
    second.value = "- [ ] Water the plants THIS EVENING [[qntm:123]] #task";

    await settle();

    // THE FIRST WRITE'S ANSWER LANDED AND WAS HELD. Before the queue it was installed, and
    // installing it repainted `second` from the arriving source — destroying what he had typed.
    assert.equal(page.__queued().size, 1, "the first answer was not held");
    assert.equal(
      second.value,
      "- [ ] Water the plants THIS EVENING [[qntm:123]] #task",
      "the first edit's own answer destroyed the second edit's characters",
    );

    second.dispatch("blur");
    await settle();

    assert.equal(posted.length, 2, "the second edit never reached the wire");
    const last = posted[1].markdown;
    assert.match(last, /Ring the dentist ON MONDAY/, "the first edit was dropped from the second write");
    assert.match(last, /Water the plants THIS EVENING/, "the second edit was not written");
    assert.equal(page.__queued().size, 0, "a projection was still held after everything settled");
  });

  test("A SECOND WRITE MADE WHILE THE FIRST IS IN THE AIR IS STILL COUNTED AS ONE", async () => {
    // `served.open`/`close` bracket the POST, and the queue must not have unbalanced them — a
    // write that was never closed would report `writing` forever and a write closed twice would
    // stop reporting it at all.
    land(V1);
    answers = [envelope(ABOVE, T2), envelope(BOTH, T3)];

    boxes()[0].checked = true;
    boxes()[0].dispatch("change");
    boxes()[1].checked = true;
    boxes()[1].dispatch("change");
    await settle();
    await settle();

    assert.equal(page.__served().writing(PATH), 0, "a write was left in the air");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. MUTATION PROOFS — a guard that cannot go red is decoration
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Both mutations rewrite ONE named expression in the page and re-import it. `assertMutated` refuses
 * a pattern that is not there exactly once, so a drifted pattern fails loudly rather than producing
 * a green "mutation proof" against an unmodified page.
 */
describe("6. THE GUARDS GO RED WHEN THE THING THEY GUARD IS BROKEN", () => {
  /** Stand up an independent page module with `mutate` applied, and drive one gesture into it. */
  async function driveMutated(label, mutate) {
    const { elements: els } = installBrowser();
    const answersFor = [envelope(ABOVE, T2), envelope(BOTH, T3)];
    globalThis.fetch = async () => {
      const next = answersFor.shift();
      return { ok: true, status: 200, json: async () => next };
    };
    const mutated = await importPage(makeWorkDir(label), mutate);
    const body = () => walk(els.get("viewBody"));
    mutated.__setGraphData(envelope(V1, T1));
    mutated.__setCurrentViewId("this-week");
    mutated.paintView("this-week", "chosen");
    return {
      page: mutated,
      screen: () =>
        body()
          .map((el) => `${el.textContent || ""}${el.innerHTML || ""}${el.value || ""}`)
          .join("\n"),
      boxes: () => body().filter((el) => el.type === "checkbox"),
      inputs: () => body().filter((el) => el.tagName === "input" && el.type === "text"),
      rows: () => body().filter((el) => el.tagName === "span" && el.innerHTML !== ""),
    };
  }

  test("BREAK THE COALESCING — every arrival looks equally old, so the older one wins", async () => {
    // One character of the ordering fact, replaced by a constant. `offer` then reads every arrival
    // as "not newer than what is held" and drops it — first-wins instead of newest-wins.
    const driven = await driveMutated("app-projection-queue-mutation-order", (source) =>
      assertMutated(
        source,
        "queued.offer(path, data.snapshot.generated_at ?? null, data)",
        'queued.offer(path, "1970-01-01T00:00:00Z", data)',
      ),
    );

    driven.rows()[1].dispatch("click", makeEvent());
    driven.boxes()[0].dispatch("change");
    await new Promise((r) => setImmediate(r));
    driven.boxes()[1].dispatch("change");
    await new Promise((r) => setImmediate(r));

    assert.equal(
      driven.page.__queued().pending(PATH).generatedAt,
      "1970-01-01T00:00:00Z",
      "the mutation did not reach the page's own offer",
    );
    driven.inputs()[0].dispatch("blur");
    await new Promise((r) => setImmediate(r));

    // §3's assertion, inverted: with the ordering broken the FIRST answer is the one on screen and
    // the second — the one the server actually last produced — is the one that was dropped.
    assert.doesNotMatch(
      driven.screen(),
      /🛫 2026-08-04/,
      "the coalescing is not load-bearing — breaking the ordering changed nothing",
    );
    assert.match(driven.screen(), /#blocked/, "the older answer did not win, so the mutation did nothing");
  });

  test("BREAK THE GATE — nothing is ever open, so an arrival paints over what he is typing", async () => {
    const driven = await driveMutated("app-projection-queue-mutation-gate", (source) =>
      assertMutated(
        source,
        "return mode.mode === \"INSERT\" && focus.lineIndex !== null;",
        "return false;",
      ),
    );

    driven.rows()[1].dispatch("click", makeEvent());
    const input = driven.inputs()[0];
    input.value = "- [ ] Ring the dentist BEFORE FRIDAY [[qntm:122]] #task";
    driven.boxes()[0].dispatch("change");
    await new Promise((r) => setImmediate(r));

    assert.equal(driven.page.__queued().size, 0, "the gate mutation did not reach the page");
    // §2's three assertions, inverted: the projection reached the screen mid-edit, which is the
    // exact defect the row exists to end.
    assert.match(
      driven.screen(),
      /#blocked/,
      "the gate is not load-bearing — removing it did not let a projection through",
    );
  });
});

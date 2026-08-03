/**
 * SAY THE MEMBERSHIP ANSWER — design-the-resolution-architecture.md step 4, through app/index.html's
 * OWN LIFTED SCRIPT, not through a reconstruction of it.
 *
 *   node --test tests/app-membership-note.test.mjs
 *
 * Steps 1-3 (this repo, `feat/addressing`) made `sectionAt` and `membershipFor` correct and callable
 * for a real cursor line but wired to nothing — `app/index.html` never called either, and no pixel
 * changed. This is the step that calls them: `commitLine`'s `membershipNoteFor` asks, on every
 * committed edit, whether the line it just changed still belongs in the section it is in, and says
 * so in the freshness line when the answer is "no longer".
 *
 * ── WHERE THE MESSAGE LIVES, AND WHY ──
 *
 * The freshness line (`#freshness`), never a row. `app/present/base.ts`'s stale-save report already
 * proved the shape: hold a sentence, say it beside "syncing…" while the write the sentence is ABOUT
 * is in flight, and let the next freshness-line write retire it. Putting it there instead of beside
 * the row makes "say it" and "move it" (paint.ts's row-building code) STRUCTURALLY DISTANT — there
 * is no function this change adds that both computes a membership answer and touches `viewBody`, and
 * section 4 below proves it by enumeration rather than by argument.
 *
 * ── FOUR SECTIONS ──
 *
 *   1. HIS OWN TWO CASES, end to end — a bare line under "Domain Empty" edited but still bare says
 *      nothing; the same line edited to add `#work` says "this line will leave Domain Empty", said
 *      the instant the write leaves and gone the instant the cycle's answer lands.
 *   2. ONLY THE LEAVING TRANSITION IS SAID — the same declaration, driven directly through the
 *      page's own `commitLine`, proves the asymmetry: a RETURNING transition (was leaving, now
 *      stays) is silence too, and an unchanged answer either way is silence.
 *   3. EVERY REFUSAL PATH PRODUCES SILENCE — the five `Abstention` values, on either side of the
 *      before/after comparison, and the one case unique to this layer: an INSERTED line has no
 *      "before" and must not guess one from an unrelated line at the same index.
 *   4. NOTHING LOCAL REACHES A WRITE — the write-adjacent assignment sites this repo already proved
 *      closed (`docs/implementation-artifacts/research-the-rule-closure.md` §8) are pinned at their
 *      current counts, so a future change that adds one fails here; and the sentence itself is
 *      proven absent from the posted body directly, not only inferred from the counts.
 *
 * ── WHAT THIS FILE DOES NOT COVER, STATED RATHER THAN LEFT IMPLIED ──
 *
 * No browser, no passkey session, no live server, no cycle. `toggleTask` (a mouse click on a
 * checkbox) and vim's `x` (which also reaches `commitLine`, but with a hand-built commit that
 * carries no `kind`) are NOT wired to `membershipNoteFor` — only a text-edited line committed
 * through `rawInput`'s `set-line` path is. That is a real, stated gap, not an oversight; see this
 * change's PR description for the backlog row that names it.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { importPage, installBrowser, makeEvent, makeWorkDir, walk } from "./fixtures/app-html-page.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = makeWorkDir("app-membership-note");

/** Flush the microtask queue — the same one-liner tests/present-base.test.mjs already uses. */
const settle = () => new Promise((r) => setImmediate(r));

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1 & 2 — THE OPERATOR'S OWN CASES, through the real declaration and the real page
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** His own starting view: "Inbox", then "Domain Empty" with the bare capture already in it. */
const VIEW = {
  id: "inbox",
  path: "inbox.md",
  title: "Inbox",
  domain: "all",
  markdown: ["## Inbox", "## Domain Empty", "- [ ] Ring the dentist"].join("\n"),
};

describe("HIS OWN TWO CASES, end to end, through app/index.html's own lifted script", () => {
  let page;
  let elements;
  let posted;

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      posted = { url, body };
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handle: "luke",
          pending_edits: 0,
          snapshot: { generated_at: "2026-08-01T12:00:00Z", views: [{ ...VIEW, markdown: body.markdown }] },
        }),
      };
    };
    page = await importPage(WORK);
  });

  const freshness = () => elements.get("freshness").textContent;

  /**
   * Paint the real "inbox" view against the real, shipped declaration — nothing hand-built —
   * with the cursor PARKED on line 0, the heading. Not cosmetic: the cursor's own line renders its
   * SOURCE in NORMAL (paint.ts), so leaving it wherever the previous test parked it would decide
   * which line is a clickable widget and which is inert selected text — the same coupling
   * tests/app-html-write-path.test.mjs's own `paintParked` and tests/present-base.test.mjs's own
   * `park` are named for.
   */
  function paintFresh() {
    page.loadPresentation();
    page.__setGraphData({ snapshot: { generated_at: "2026-08-01T12:00:00Z", views: [VIEW] } });
    page.__setFocus(0, VIEW.markdown);
    page.paintView("inbox");
  }

  /** The clickable text of the one task line — same selector every write-path suite uses. */
  const taskText = () =>
    walk(elements.get("viewBody")).find((el) => el.tagName === "span" && el.innerHTML !== "");

  test('a bare line edited but STILL bare says nothing — "it belongs, so it stays"', async () => {
    paintFresh();
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    taskText().dispatch("click", makeEvent());
    page.__enterInsert();
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    assert.equal(input.value, "- [ ] Ring the dentist", "the cursor did not reach the real capture");
    input.value = "- [ ] Ring the dentist today";
    posted = null;
    input.dispatch("blur");

    assert.ok(posted, "the edit was never posted");
    assert.doesNotMatch(
      freshness(),
      /leave/,
      `an edit that did not change the answer narrated itself: ${freshness()}`,
    );
    await settle();
    assert.doesNotMatch(freshness(), /leave/, `the answer after the cycle landed: ${freshness()}`);
  });

  test('the SAME line, edited to add #work, says "this line will leave Domain Empty"', async () => {
    paintFresh();
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    taskText().dispatch("click", makeEvent());
    page.__enterInsert();
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = "- [ ] Ring the dentist #work";
    posted = null;
    input.dispatch("blur");

    // SAID THE INSTANT THE WRITE LEAVES, beside "syncing…" — the same register the stale-save
    // report already uses, and the same reason: the operator is still looking at the line he just
    // left, not at whatever the freshness line says ~14 s later when the cycle answers.
    assert.equal(
      freshness(),
      "syncing… · this line will leave Domain Empty",
      "the operator's own case was not said while the write was in flight",
    );

    // AND GONE THE INSTANT THE CYCLE'S ANSWER LANDS. This app has not built the machinery (design
    // doc steps 11/12) to CONFIRM a prediction against what the cycle actually did, so holding it
    // past this one write would let it stand as if confirmed. Letting it lapse is the honest
    // middle: "a stale prediction is worse than none."
    //
    // (The freshness line DOES say something else once the answer lands — "the line you were on
    // is not in this view any more". That is `reportCursorReading`, an UNRELATED, correct report:
    // an unstamped line's identity is its own exact text, this edit changed the text, so the
    // pre-existing anchor honestly cannot find it again. It is evidence the membership note is not
    // piggy-backing on that mechanism — the two notes are independent and this proves it.)
    await settle();
    assert.doesNotMatch(freshness(), /leave/, `the prediction outlived its own write: ${freshness()}`);
    assert.match(freshness(), /^as of .* · 0 queued/, freshness());
  });

  test("the CONTROL — an edit computed against a current base says nothing extra at all", async () => {
    // Without this, the two tests above are decoration: an assertion that cannot come out the
    // other way is not a check. This edit changes the FILE (so it really does post) without
    // changing the MEMBERSHIP ANSWER either side of it.
    paintFresh();
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    taskText().dispatch("click", makeEvent());
    page.__enterInsert();
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = "- [ ] Ring the dentist tomorrow";
    posted = null;
    input.dispatch("blur");
    assert.equal(freshness(), "syncing…", `an unchanged answer narrated itself: ${freshness()}`);
    await settle();
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2 & 3 — THE ASYMMETRY, AND EVERY REFUSAL PATH — driven directly through `commitLine`
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// A hand-built declaration, the same posture tests/present-qualification.test.mjs section 2 takes
// for its malformed-input cases: it is not the operator's real config, but every shape in it is a
// shape `readQualificationDeclaration` actually produces, so `commitLine`'s own logic is what is
// under test, not a fixture that merely looks like one.

const FAKE_DECLARATION = {
  qualification: {
    defaultNodeType: "task",
    structuralNodeTypes: [],
    tokens: {
      node_type: {},
      domain: { "#work": "work", "#personal": "personal" },
      status: { "[ ]": "open", "[x]": "done" },
    },
    predicates: {
      "domain-empty": {
        find: { nodeType: null, fields: { domain: { eq: null } } },
        exclude: [{ nodeType: null, fields: { status: { eq: "done" } } }],
      },
    },
    sections: {
      demo: {
        "domain-empty": { qualification: "domain-empty", nodeType: "task", name: "Domain Empty" },
      },
    },
    // "unpublished" is declared (it opens a real heading) but names no predicate that survived —
    // the same shape `daily-work`'s "urgent" ordinal has in the real declaration.
    sectionOrder: { demo: ["domain-empty", "unpublished"] },
    refused: {},
  },
};

const DEMO_SOURCE = [
  "## Domain Empty", // ordinal 0 -> "domain-empty" (published)
  "- [ ] Ring the dentist", // ordinal 0
  "## Unpublished", // ordinal 1 -> "unpublished" (declared, not published)
  "- [ ] Anything", // ordinal 1
].join("\n");

const DEMO_VIEW = { id: "demo", path: "demo.md" };

describe("ONLY THE LEAVING TRANSITION IS SAID, AND EVERY REFUSAL PRODUCES SILENCE", () => {
  let page;

  before(async () => {
    installBrowser();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
  });

  /**
   * Drive `membershipNoteFor` directly — no DOM, no fetch, no `served` base reading entangled in
   * the result, which is what makes "syncing… · <note>" vs "syncing…" the only two shapes a
   * `writeFile` caller would ever have had to reconcile; `served`'s own contribution to that line
   * is a separate, separately-tested fact (tests/present-base.test.mjs).
   */
  function noteFor(patch) {
    page.__applyPresentation(FAKE_DECLARATION);
    return page.__membershipNoteFor(DEMO_VIEW, {
      lineIndex: 1,
      text: "- [ ] Ring the dentist",
      markdown: "irrelevant to this suite",
      source: DEMO_SOURCE,
      kind: "set-line",
      ...patch,
    });
  }

  test("BASELINE, restated through the page's own function: leaving is said", () => {
    assert.equal(noteFor({ text: "- [ ] Ring the dentist #work" }), "this line will leave Domain Empty");
  });

  test("RETURNING is silence too — was leaving, now stays, and nothing is said either way", () => {
    // The line's OWN before-text (DEMO_SOURCE's line 1) is the bare capture; overriding `source` so
    // the line's own history reads as ALREADY carrying #work is what makes this the reverse case.
    const withWork = DEMO_SOURCE.replace("- [ ] Ring the dentist", "- [ ] Ring the dentist #work");
    const said = noteFor({ source: withWork, text: "- [ ] Ring the dentist" });
    assert.equal(said, "", `a RETURNING transition narrated itself: "${said}"`);
  });

  test("an edit that changes the CHARACTERS but not the ANSWER is silence", () => {
    assert.equal(noteFor({ text: "- [ ] Ring the dentist tomorrow" }), "");
  });

  test('ABSTENTION 1/5 — "no-section-declaration": an unpublished section says nothing', () => {
    assert.equal(noteFor({ lineIndex: 3, text: "- [ ] Anything else" }), "");
  });

  test('ABSTENTION 2/5 — "already-a-node": the AFTER text carries a stamp', () => {
    assert.equal(noteFor({ text: "- [ ] Ring the dentist [[qntm:99]]" }), "");
  });

  test('ABSTENTION 3/5 — "not-a-declared-checkbox": the AFTER text is prose', () => {
    assert.equal(noteFor({ text: "Just prose, not a checkbox at all" }), "");
  });

  test('ABSTENTION 4/5 — "no-content": the AFTER text is an empty box', () => {
    assert.equal(noteFor({ text: "- [ ] " }), "");
  });

  test('ABSTENTION 5/5 — "ambiguous-token": the AFTER text sets one field twice', () => {
    assert.equal(noteFor({ text: "- [ ] Ring the dentist #work #personal" }), "");
  });

  test("the BEFORE side abstaining is silence too, even when the AFTER answers", () => {
    // Line 0 is the heading that OPENS "domain-empty" — a real position (`sectionAt` names it),
    // and a line that is not a checkbox, so its OWN membership abstains "not-a-declared-checkbox".
    assert.equal(noteFor({ lineIndex: 0, text: "- [ ] A brand new capture" }), "");
  });

  test("an INSERTED line has no before, and is refused rather than misattributed", () => {
    // The trap `LineCommit.kind`'s own header names: lineIndex 1 in DEMO_SOURCE is the bare
    // capture, which — if wrongly read as this line's own "before" — would make this look like a
    // LEAVING transition once #work is typed. `kind: "insert-line"` must refuse it outright.
    const said = noteFor({ kind: "insert-line", text: "- [ ] Ring the dentist #work" });
    assert.equal(said, "", "an insertion was compared against an unrelated line's membership instead of refusing");
  });

  test("with no declaration loaded at all, membershipNoteFor says nothing rather than throwing", () => {
    page.__applyPresentation({}); // no `qualification` key — the same silence a broken fetch leaves
    assert.doesNotThrow(() =>
      page.__membershipNoteFor(DEMO_VIEW, {
        lineIndex: 1,
        text: "- [ ] Ring the dentist #work",
        markdown: "irrelevant",
        source: DEMO_SOURCE,
        kind: "set-line",
      }),
    );
    assert.equal(
      page.__membershipNoteFor(DEMO_VIEW, {
        lineIndex: 1,
        text: "- [ ] Ring the dentist #work",
        markdown: "irrelevant",
        source: DEMO_SOURCE,
        kind: "set-line",
      }),
      "",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4 — NOTHING LOCAL REACHES A WRITE
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("NOTHING LOCAL REACHES A WRITE — the write-adjacent sites, pinned", () => {
  const APP_SOURCE = readFileSync(resolve(HERE, "..", "app", "index.html"), "utf8");
  const PAINT_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "paint.ts"), "utf8");

  // docs/implementation-artifacts/research-the-rule-closure.md §8 enumerated these four facts and
  // proved "there is no code path from a painted pixel to a POST body" BY COUNTING THEM, not by
  // arguing it. Re-counting them here, on THIS branch, is what a change that adds a sixth site
  // fails against — a measurement of zero new sites is only meaningful once a positive control
  // (these five) is shown passing, which is what each assertion below is.

  // ── THE `graphData` COUNT MOVED FROM FIVE TO FOUR, AND IT MOVED IN THE SAFE DIRECTION ──
  //
  // `a-projection-can-arrive-and-be-held` (the behavioural queue) took the three statements
  // `toggleTask` and `commitLine` each used to make — assign, paint, say — and put them in ONE
  // function, `installProjection`, because a projection that arrives while a line is open must be
  // HELD rather than installed and that decision cannot be made in two places. So the two write
  // paths stopped assigning `graphData` and the queue's single drain started.
  //
  // THE PROPERTY THIS SUITE DEFENDS IS UNCHANGED AND IS NOW EASIER TO CHECK, WHICH IS WHY THE
  // NUMBER WAS ALLOWED TO MOVE. What research-the-rule-closure.md §8 counted was "every site where
  // something becomes the page's copy of the server's answer, so that a client-computed string
  // appearing at one of them is visible". Four sites is a smaller surface than five, and the second
  // assertion below is stronger than the count ever was: it enumerates what is assigned rather than
  // how often, so a sixth site that assigned a page-computed envelope would fail on the VALUE even
  // if someone had adjusted the number.
  //
  // `loadGraph` KEEPS ITS OWN and did not fold into `installProjection`: it must assign before its
  // empty-state branch, which returns without ever painting.
  test("`graphData` is assigned in exactly four places — every one the server's own envelope", () => {
    const sites = APP_SOURCE.match(/\bgraphData\s*=(?!=)/g) ?? [];
    assert.equal(sites.length, 4, "membershipNoteFor must not add a client-computed graphData write");
  });

  test("and what is assigned is only ever `null`, the fetched envelope, or a QUEUED one", () => {
    const assigned = (APP_SOURCE.match(/\bgraphData\s*=(?!=)\s*([A-Za-z0-9_$.]+)/g) ?? []).map((site) =>
      site.replace(/^\bgraphData\s*=\s*/, ""),
    );
    assert.deepEqual(
      [...assigned].sort(),
      ["data", "null", "null", "pending.data"],
      "a value this page computed became the copy of the file every write is measured against",
    );
  });

  test("`writeFile` has exactly two callers — toggleTask and commitLine, unchanged in count", () => {
    // Its own declaration line plus its two call sites — three occurrences of the name applied.
    const occurrences = APP_SOURCE.match(/\bwriteFile\(/g) ?? [];
    assert.equal(occurrences.length, 3, "a new call site would mean a third write path exists");
  });

  test("`applyEdit` is reached from exactly five sites outside its own module", () => {
    const pageCalls = APP_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    const paintCalls = PAINT_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    assert.equal(
      pageCalls.length + paintCalls.length,
      5,
      "membershipNoteFor computes an ANSWER, never an edit, and must reach applyEdit zero times",
    );
    // Named separately so a future count drift says WHICH side moved.
    assert.equal(pageCalls.length, 2);
    assert.equal(paintCalls.length, 3);
  });

  test("`.markdown` is never ASSIGNED in app/ — only compared, read or passed through", () => {
    const assignments = (source) => source.match(/\.markdown\s*=(?!=)/g) ?? [];
    assert.deepEqual(assignments(APP_SOURCE), []);
    assert.deepEqual(assignments(PAINT_SOURCE), []);
  });

  test("membershipNoteFor imports nothing from source.ts — it cannot produce a SourceEdit", () => {
    // The same posture tests/flow_scenarios/section_membership.ts already proves for membership.ts
    // itself, restated for the ONE new function this step adds to the page.
    const fn = /function membershipNoteFor[\s\S]*?\n}\n/.exec(APP_SOURCE)?.[0];
    assert.ok(fn, "membershipNoteFor was not found — this test is checking the wrong source");
    assert.ok(!/\bapplyEdit\(/.test(fn), "membershipNoteFor calls applyEdit");
  });

  test("the sentence shown is absent from the write it describes — proven on the wire, not inferred", async () => {
    const { elements } = installBrowser();
    let posted = null;
    globalThis.fetch = async (url, init) => {
      posted = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handle: "luke",
          pending_edits: 0,
          snapshot: {
            generated_at: "2026-08-01T12:00:00Z",
            views: [{ ...VIEW, markdown: posted.markdown }],
          },
        }),
      };
    };
    const page = await importPage(WORK);
    page.loadPresentation();
    page.__setGraphData({ snapshot: { generated_at: "2026-08-01T12:00:00Z", views: [VIEW] } });
    page.__setFocus(0, VIEW.markdown);
    page.paintView("inbox");
    const taskText = () =>
      walk(elements.get("viewBody")).find((el) => el.tagName === "span" && el.innerHTML !== "");
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    taskText().dispatch("click", makeEvent());
    page.__enterInsert();
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = "- [ ] Ring the dentist #work";
    input.dispatch("blur");

    assert.equal(elements.get("freshness").textContent, "syncing… · this line will leave Domain Empty");
    assert.ok(posted, "the edit was never posted");
    assert.doesNotMatch(
      posted.markdown,
      /will leave/,
      "the displayed sentence reached the POST body — a local answer became authored input",
    );
    assert.match(posted.markdown, /#work/, "the fixture no longer reproduces the operator's own edit");
  });
});

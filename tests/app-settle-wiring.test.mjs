/**
 * THE LAST MILE FOR ORDERING, DRIVEN END TO END — through app/index.html's REAL keydown wiring,
 * REAL `commitLine`, REAL `repaintCurrentView`/`paintView`, painted into `#viewBody`'s real DOM.
 *
 *   node --test tests/app-settle-wiring.test.mjs
 *
 * ── WHY THIS FILE EXISTS ──
 *
 * `tests/app-predict-wiring.test.mjs` proves the predict affordance end to end, through the real
 * page. Nothing did the same for settle — every existing settle/ordering suite
 * (`tests/app-ordering-note.test.mjs`, `tests/present-paint-settle.test.mjs`) either calls
 * `armOrderingSettle` and reads `settle.take()` directly (never through a real `o`/Enter gesture or
 * a real `repaintCurrentView`), or arms `SettleSurface` by hand and paints it in isolation (never
 * through `commitLine`'s real registry walk). "The row is armed" and "the row physically moves in
 * `#viewBody`, because a real keystroke committed it" are different claims, and only the second one
 * is what the operator drove live. This file is that second proof, and it is also the falsifier: it
 * is the test that would have caught "ordering stopped settling" had one existed before.
 *
 * ── THE KEY CHANGE, 2026-08-06 — READ THIS BEFORE THE SECTIONS BELOW ──
 *
 * §2 of this file used to be titled "THE HAZARD, DEMONSTRATED": it drove `SettleSurface` into the
 * operator's own regression on purpose and asserted the discard, because at the time nothing stood
 * in for it. The diagnosis it recorded: `SettleSurface` armed a placement against the EXACT source
 * string it was computed from, and a captured row gets an engine-minted `[[qntm:N]]` stamp on its
 * very next real answer — a character arriving elsewhere on that SAME line, not the row's position
 * being contradicted. The string-keyed surface could not tell the two apart, so it discarded a
 * still-correct claim on the exact event the operator was watching for. §2 below is now the FIX,
 * proven the same way the hazard was demonstrated: `SettleSurface` is keyed by the row's IDENTITY
 * (`resolveInstanceAnchor`, the one walk `instance.ts`/`rows.ts`/`focus.ts` already share — see
 * `app/present/settle.ts`'s own header) rather than by the string, so the stamp arrival no longer
 * discards it.
 *
 * ── SIX SECTIONS ──
 *
 *   1. THE WIN, DRIVEN END TO END — `o`, type a row that must sort first, blur. The mechanism this
 *      whole capability rests on (resolver → arm → paint → FLIP) is proven live, through the real
 *      page, for both a DECLARED ordering (`queue_position`) and the ENGINE DEFAULT ordering
 *      (`title`, undeclared section — his real inbox's own shape).
 *   2. THE FIX, PROVEN — the single most valuable test in this change: arm a settle through the
 *      REAL `commitLine`, deliver a projection whose ONLY difference from what was armed is an
 *      engine-minted stamp on the row's own line, and prove the motion still runs — the row is
 *      still shown in its predicted position after that repaint, through the real page, not merely
 *      that `SettleSurface.take` returns non-null in isolation. This is the exact scenario that
 *      broke, and §2 as it stood before this change is the proof nothing caught it. Uses a BARE
 *      capture (no marker/date/tag typed at capture time) — §4 names exactly why.
 *   3. THE NEGATIVE — A STALE OR SUPERSEDED PLACEMENT NEVER ANIMATES. Firing the wrong motion is
 *      worse than firing none, so the identity key must refuse at least as readily as the old
 *      string key did wherever the string key was RIGHT to refuse. Two cases, both driven through
 *      the real page: the armed row is deleted from the next projection outright, and a second,
 *      real edit to the SAME row that the resolver can no longer rank (via `commitLine`'s own
 *      `settle.supersede`, settle.ts's third discard condition) leaves no stale claim behind for a
 *      later repaint to act on.
 *   4. THE FORMER GAP, CLOSED — a capture that ALREADY carries the section's own ordering marker
 *      (typed by the operator at capture time — required for `orderingPlacementFor` to rank an
 *      insert-line at all), or a hand-typed type tag, now survives the stamp too: the engine's
 *      canonical render (`renderer.py`'s `_field_expression_cells`, read directly) inserts
 *      `[[qntm:N]]` BEFORE that marker/tag, not after it, and `relative.ts`'s `extendsLine` — shared
 *      by `rows.ts`/`draft.ts`/`focus.ts` — now tries the arrived line with the stamp taken back out
 *      as well as the plain append, so an insertion in the middle of the line is recognised as the
 *      same row. `tests/present-relative.test.mjs` proves this exhaustively over every marker/tag
 *      token `presentation.json` (the compiled declaration) actually declares, not for one hand-
 *      picked shape. See §4's own tests for the proof and app/present/settle.ts's header for the
 *      pointer to the narrower limit that remains (two markers/tags typed out of the engine's own
 *      canonical print order — a genuine reordering, not an insertion).
 *   5. PLACEMENT APPLIES AT COMMIT, IN THE SAME TURN AS THE KEYSTROKE — added 2026-08-06, per
 *      `design-the-two-rules.md`'s Perception Rule and the operator's own words: "it should happen
 *      instantly... that it resolves in the same [turn] from front end live, not from sync from
 *      backend." §1 above already drove this end to end, but BOTH of its captures type the
 *      `[[qntm:N]]` stamp BY HAND — not how a real capture ever looks (`settle.ts`'s own header:
 *      "a row this browser just captured has no stamp yet"). §2's own bare/unstamped case proves
 *      `armSettle` arms correctly, but calls `commitLine` directly rather than through a real
 *      keystroke, and stops at the arm — it never paints the DOM at all. §5 closes both gaps at
 *      once: a BARE capture (no stamp, matching a real `o`/Enter gesture exactly), driven through
 *      real DOM events, checked BEFORE any projection has been delivered — proving the row is
 *      relocated and the FLIP motion ran in the SAME synchronous pass the keystroke causes — and
 *      then, for the shape §2/§4 already proved survives a stamp, the engine's AGREEING projection
 *      is delivered and shown to be an invisible no-op: no second motion, nothing re-painted that
 *      was not already correct.
 *   6. THE NEGATIVE, ONE MORE — AN ABSTAINING SECTION NEVER MOVES THE ROW AT ALL. A section that
 *      declares no sort (`orderingMode: insertion_order`, `ordering.ts`'s own "abstains on EVERY
 *      edit, forever") has nowhere for `armSettle` to arm a placement from — proven through the
 *      same real gesture, checking that nothing is armed and the row lands exactly where it was
 *      typed, never guessed into a rank the section never declared.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { importPage, installBrowser, makeEvent, makeWorkDir, walk } from "./fixtures/app-html-page.mjs";
import {
  MARKER_QUEUE_AFTER_CAPTURE,
  MARKER_QUEUE_BEFORE,
  MARKER_QUEUE_STAMPED,
  TAGGED_MARKER_QUEUE_AFTER_CAPTURE,
  TAGGED_MARKER_QUEUE_STAMPED,
} from "./fixtures/promotion-scenarios.mjs";

process.setMaxListeners(30);

/** Every prose/task row's own visible text, in DOM order — the `<label>` rows AND the raw/cursor
 * `<div>` a just-committed row paints as while it still holds the cursor (see `normalLine`,
 * paint.ts) — `focus` lands on the row that just settled, in NORMAL, so it renders raw rather than
 * `wired` (`app/present/paint.ts`'s own "FOCUS CONTRIBUTES WHENEVER THERE IS A CURSOR" rule). A
 * suite that looked only for `<label>` would miss exactly the row it is trying to find. */
function rowTexts(body) {
  return walk(body)
    .filter((el) => el.tagName === "label" || (el.tagName === "div" && String(el.className).includes("rawline")))
    .map((el) => {
      const spans = walk(el).filter((e) => e.tagName === "span");
      if (spans.length > 0) return spans.map((s) => s.innerHTML || s.textContent || "").join("");
      return el.innerHTML || el.textContent || "";
    });
}

/**
 * A fresh page, wired for a REAL keydown-driven gesture — `o`, type, blur/Enter — with a mocked
 * `fetch` that echoes back whatever markdown was posted, the same shape §1's own `freshPage`
 * established. Shared by §5/§6 below, which both need the real DOM/keyboard path §1 already proved
 * out, against declarations of their own.
 */
async function freshGesturePage(label, declaration, view) {
  const { elements, document: doc } = installBrowser();
  let posted = null;
  globalThis.fetch = async (_url, init) => {
    posted = { url: _url, body: JSON.parse(init.body) };
    return {
      ok: true,
      json: async () => ({
        ok: true, handle: "luke", pending_edits: 0,
        snapshot: { generated_at: "2026-08-06T00:00:00Z", views: [{ ...view, markdown: posted.body.markdown }] },
      }),
    };
  };
  const page = await importPage(makeWorkDir(label));
  page.__applyPresentation(declaration);
  page.__setGraphData({ snapshot: { generated_at: "2026-08-06T00:00:00Z", views: [view] } });
  page.paintView(view.id);
  const press = (key) => doc.dispatch("keydown", makeEvent({ key }));
  return { page, elements, press, posted: () => posted, view, document: doc };
}

/** Press Enter the way a real browser does: fire the SAME event at the focused `<input>` first
 * (running its own keydown listener), then let it "bubble" to `document` (running the global
 * handler) — the two-stage dispatch this fixture's mock DOM does not do automatically (an
 * element's own `dispatch` never reaches `document`'s listeners — see `installBrowser` in
 * `tests/fixtures/app-html-page.mjs`). §7 and §8 below both need this: a real Enter keydown reaches
 * BOTH the input's own listener and app/index.html's global keydown handler (which unconditionally
 * calls `drainPainted()` before its own NORMAL-mode gate — "the third drain point"), and a test that
 * only dispatched to the input would silently fail to exercise that second listener at all. */
function pressEnterOn(input, doc) {
  const event = makeEvent({ key: "Enter", target: input });
  input.dispatch("keydown", event);
  doc.dispatch("keydown", event);
  return event;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE WIN, DRIVEN END TO END
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. THE WIN — a row typed at the end sorts into place, live, through the real page", () => {
  // The SAME declared-ordering fixture tests/app-gesture-write-path.test.mjs already proves `x`/`>`
  // reach the server with — a real `queue_position` (`🔢`) key, ascending.
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
        demo: { queue: { ordering: [{ field: "queue_position", direction: "asc" }], orderingMode: undefined, name: "Queue" } },
      },
      orderingFields: { queue_position: { token: "🔢", kind: "int" } },
      dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
    },
  };

  const SOURCE = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2"].join("\n");
  const VIEW = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: SOURCE };

  async function freshPage(label) {
    const { elements, document: doc } = installBrowser();
    let posted = null;
    globalThis.fetch = async (url, init) => {
      posted = { url, body: JSON.parse(init.body) };
      return {
        ok: true,
        json: async () => ({
          ok: true, handle: "luke", pending_edits: 0,
          snapshot: { generated_at: "2026-08-05T00:00:00Z", views: [{ ...VIEW, markdown: posted.body.markdown }] },
        }),
      };
    };
    const page = await importPage(makeWorkDir(label));
    page.__applyPresentation(DECLARATION);
    page.__setGraphData({ snapshot: { generated_at: "2026-08-05T00:00:00Z", views: [VIEW] } });
    page.paintView("demo");
    const press = (key) => doc.dispatch("keydown", makeEvent({ key }));
    return { page, elements, press, posted: () => posted };
  }

  test("DECLARED ordering (queue_position): a new row sorting FIRST is armed AND physically relocated before the write even resolves", async () => {
    const { page, elements, press } = await freshPage("settle-win-declared");
    press("g"); press("g"); // line 0, heading
    press("j"); // line 1
    press("o"); // open a draft below line 1
    assert.equal(page.__vimMode(), "INSERT");

    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    assert.ok(input, "o did not open a draft line");
    input.value = "- [ ] NEW ROW [[qntm:9]] 🔢 0"; // sorts before BOTH existing rows

    input.dispatch("blur"); // fires paint.ts's real draftInput settle -> commitLine -> optimistic repaint, synchronously

    // PROOF 1: the settle surface really armed a placement, not merely that a note was computed.
    const armed = page.__settle();
    assert.notEqual(armed, undefined);

    // PROOF 2: the row is DEMONSTRABLY relocated in #viewBody, in the SAME synchronous paint pass
    // draftInput's own settle() triggers — the win the brief asks to be driven, not merely armed.
    const texts = rowTexts(elements.get("viewBody"));
    const newRowAt = texts.findIndex((t) => t.includes("NEW ROW"));
    const aAt = texts.findIndex((t) => t.includes("[[qntm:1]]"));
    const bAt = texts.findIndex((t) => t.includes("[[qntm:2]]"));
    assert.ok(newRowAt !== -1 && aAt !== -1 && bAt !== -1, `expected all three rows painted, got: ${JSON.stringify(texts)}`);
    assert.ok(newRowAt < aAt, "the new row (queue_position 0) must sort BEFORE row a (queue_position 1)");
    assert.ok(aAt < bAt, "row a and row b must keep their own relative order");

    // PROOF 3: the moved row actually carries the FLIP class paint.ts's settleRow applies —
    // the motion RAN, it was not merely that the final DOM order happened to look right.
    const moved = walk(elements.get("viewBody")).find((el) => String(el.className ?? "").includes("settle-move"));
    assert.ok(moved, "no element carries paint.ts's settle-move class — the FLIP motion never ran");
  });

  test("ENGINE DEFAULT ordering (undeclared section, title tiebreak): the same win, for his real inbox's own shape", async () => {
    const DEFAULT_DECLARATION = {
      qualification: { ...DECLARATION.qualification, sectionOrder: { demo: ["queue"] } },
      resolution: {
        ordering: {}, // undeclared — the exact shape his real inbox has
        orderingFields: { due_date: { token: "📅", kind: "date" }, priority: { kind: "enum", values: { "🔽": "low", "⏫": "high" } } },
        defaultOrdering: [
          { field: "due_date", direction: "asc" },
          { field: "priority", direction: "desc" },
          { field: "title", direction: "asc" },
        ],
        priorityRank: { urgent: 4, high: 3, normal: 2, medium: 2, low: 1 },
        dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
      },
    };
    const SRC = ["## Queue", "- [ ] Family domain [[qntm:1]]", "- [ ] Micu lunch [[qntm:2]]"].join("\n");
    const V = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: SRC };

    const { elements, document: doc } = installBrowser();
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot: { generated_at: "x", views: [{ ...V, markdown: body.markdown }] } }) };
    };
    const page = await importPage(makeWorkDir("settle-win-default"));
    page.__applyPresentation(DEFAULT_DECLARATION);
    page.__setGraphData({ snapshot: { generated_at: "x", views: [V] } });
    page.paintView("demo");
    const press = (key) => doc.dispatch("keydown", makeEvent({ key }));

    press("g"); press("g");
    press("j"); // line 1: "Family domain"
    press("o");
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = "- [ ] Aaa sorts first [[qntm:9]]"; // "Aaa" < "Family" < "Micu", codepoint order
    input.dispatch("blur");

    const texts = rowTexts(elements.get("viewBody"));
    const newAt = texts.findIndex((t) => t.includes("Aaa sorts first"));
    const familyAt = texts.findIndex((t) => t.includes("Family domain"));
    assert.ok(newAt !== -1 && familyAt !== -1, `expected both rows painted, got: ${JSON.stringify(texts)}`);
    assert.ok(newAt < familyAt, "the undeclared section's own engine-default (title) tiebreak must still place the new row first");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// SHARED FIXTURE — the declared `queue_position` config §1 already proved live, reused by §2/§3 so
// neither section re-argues that the mechanism itself works; they argue only about STALENESS.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const QUEUE_DECLARATION = {
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
      demo: { queue: { ordering: [{ field: "queue_position", direction: "asc" }], orderingMode: undefined, name: "Queue" } },
    },
    orderingFields: { queue_position: { token: "🔢", kind: "int" } },
    dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
  },
};

/** A fresh page, real declaration, real fetch echo (the server hands back whatever markdown was
 * posted, unchanged) — commitLine's own POST is real, and this file never needs to inspect it. */
async function freshQueuePage(label, initialMarkdown) {
  const { elements } = installBrowser();
  const view = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: initialMarkdown };
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        ok: true, handle: "luke", pending_edits: 0,
        snapshot: { generated_at: "2026-08-06T00:00:00Z", views: [{ ...view, markdown: body.markdown }] },
      }),
    };
  };
  const page = await importPage(makeWorkDir(label));
  page.__applyPresentation(QUEUE_DECLARATION);
  page.__setGraphData({ snapshot: { generated_at: "2026-08-06T00:00:00Z", views: [view] } });
  page.__setCurrentViewId("demo");
  return { page, elements, view };
}

/** Paint `markdown` as the CURRENT content of `view` and repaint — the real production call, real
 * `settle` surface armed by whatever `commitLine` last did (mirrors app-predict-wiring.test.mjs's
 * own `paint` helper). */
function paintProjection(page, view, markdown) {
  page.__setGraphData({ snapshot: { generated_at: "2026-08-06T00:00:00Z", views: [{ ...view, markdown }] } });
  page.__repaintCurrentView();
}

// A hand-built declaration shaped like §1's own "ENGINE DEFAULT" fixture — title tiebreak, no
// declared ordering — used here because it is the shape the fix's own limit (§4 below) needs
// contrasted against a shape that has NO limit: a bare capture with nothing beyond its title.
const DEFAULT_DECLARATION = {
  qualification: {
    defaultNodeType: "task", structuralNodeTypes: [],
    tokens: { node_type: {}, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
    predicates: {}, sections: {}, sectionOrder: { demo: ["queue"] }, refused: {},
  },
  resolution: {
    ordering: {},
    orderingFields: { due_date: { token: "📅", kind: "date" }, priority: { kind: "enum", values: { "🔽": "low", "⏫": "high" } } },
    defaultOrdering: [
      { field: "due_date", direction: "asc" },
      { field: "priority", direction: "desc" },
      { field: "title", direction: "asc" },
    ],
    priorityRank: { urgent: 4, high: 3, normal: 2, medium: 2, low: 1 },
    dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
  },
};

/** Same shape as `freshQueuePage`, parameterised by declaration — §2/§4 need the DEFAULT one. */
async function freshDefaultPage(label, declaration, initialMarkdown) {
  const { elements } = installBrowser();
  const view = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: initialMarkdown };
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        ok: true, handle: "luke", pending_edits: 0,
        snapshot: { generated_at: "2026-08-06T00:00:00Z", views: [{ ...view, markdown: body.markdown }] },
      }),
    };
  };
  const page = await importPage(makeWorkDir(label));
  page.__applyPresentation(declaration);
  page.__setGraphData({ snapshot: { generated_at: "2026-08-06T00:00:00Z", views: [view] } });
  page.__setCurrentViewId("demo");
  return { page, elements, view };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE FIX, PROVEN — a still-correct placement survives the engine's own stamp arrival
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. THE FIX — the row the operator just captured stays sorted through the engine's OWN answer, stamp and all", () => {
  // A BARE capture — a title, nothing else — exactly the shape `relative.ts`'s own header measured
  // against the operator's real inbox ("the title first, the cycle's tokens appended after, never a
  // rewritten prefix"). §4 below names the narrower shape this does NOT yet cover.
  const BEFORE = ["## Queue", "- [ ] Family domain [[qntm:1]]", "- [ ] Micu lunch [[qntm:2]]"].join("\n");
  // Opened after "Family domain" — the WRONG slot; alphabetically "Aaa" < "Family" < "Micu", so a
  // real placement is armed moving it back before "Family domain".
  const AFTER = ["## Queue", "- [ ] Family domain [[qntm:1]]", "- [ ] Aaa sorts first", "- [ ] Micu lunch [[qntm:2]]"].join("\n");
  const COMMIT = { lineIndex: 2, text: "- [ ] Aaa sorts first", markdown: AFTER, source: BEFORE, kind: "insert-line" };

  test("real commitLine arms the placement for a freshly captured, UNSTAMPED row sorting first", async () => {
    const { page, view } = await freshDefaultPage("settle-fix-stamp-arm", DEFAULT_DECLARATION, BEFORE);
    await page.commitLine(view, COMMIT);
    const [instruction] = page.__settle().take(AFTER, "demo");
    assert.notEqual(instruction, undefined, "the real resolver walk must have armed a placement for the new row");
    assert.deepEqual(instruction.placement, { lineIndex: 2, beforeLineIndex: 1 }, "\"Aaa\" belongs immediately before \"Family domain\"");
  });

  test("THE SINGLE MOST VALUABLE TEST IN THIS CHANGE: the engine's next answer — the SAME row, now stamped, nothing else different — still paints the row in its predicted place", async () => {
    const { page, elements, view } = await freshDefaultPage("settle-fix-stamp-survives", DEFAULT_DECLARATION, BEFORE);
    await page.commitLine(view, COMMIT);
    paintProjection(page, view, AFTER); // the browser's own optimistic paint — the row sorts first

    let texts = rowTexts(elements.get("viewBody"));
    let aaaAt = texts.findIndex((t) => t.includes("Aaa sorts first"));
    let familyAt = texts.findIndex((t) => t.includes("Family domain"));
    assert.ok(aaaAt !== -1 && aaaAt < familyAt, `precondition: "Aaa" must be sorted first before the stamp arrives, got: ${JSON.stringify(texts)}`);

    // THE ENGINE'S OWN NEXT REAL ANSWER — the operator's own words: "a captured line gets an
    // engine-minted stamp on its very next real answer." The row's own text, its section: ALL
    // unchanged. Only a `[[qntm:N]]` is appended to the line this browser is still holding a
    // pending placement for. Neither "Family domain" nor "Micu lunch" changed at all.
    const STAMPED = ["## Queue", "- [ ] Family domain [[qntm:1]]", "- [ ] Aaa sorts first [[qntm:9]]", "- [ ] Micu lunch [[qntm:2]]"].join("\n");
    paintProjection(page, view, STAMPED);

    const [instruction] = page.__settle().take(STAMPED, "demo");
    assert.notEqual(instruction, undefined, "the placement must survive the stamp landing on its own row");

    texts = rowTexts(elements.get("viewBody"));
    aaaAt = texts.findIndex((t) => t.includes("Aaa sorts first"));
    familyAt = texts.findIndex((t) => t.includes("Family domain"));
    const micuAt = texts.findIndex((t) => t.includes("Micu lunch"));
    assert.ok(aaaAt !== -1 && familyAt !== -1 && micuAt !== -1, `expected all three rows painted, got: ${JSON.stringify(texts)}`);
    assert.ok(aaaAt < familyAt, "THE MOTION STILL RUNS: the row must still be shown sorted before \"Family domain\" once it is stamped");
    assert.ok(familyAt < micuAt, "\"Family domain\" and \"Micu lunch\" keep their own relative order — nothing about them was ever in question");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE NEGATIVE — a stale or superseded placement never animates
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. THE NEGATIVE — a placement that is no longer true never fires, through the real page", () => {
  test("the armed row is deleted from the next projection outright — no motion, plain file order", async () => {
    const BEFORE = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2", "- [ ] c [[qntm:3]] 🔢 3"].join("\n");
    // Edit "c" to sort first — a real placement is armed moving it before "a".
    const AFTER = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2", "- [ ] c [[qntm:3]] 🔢 0"].join("\n");
    const { page, elements, view } = await freshQueuePage("settle-negative-deleted", BEFORE);

    await page.commitLine(view, { lineIndex: 3, text: "- [ ] c [[qntm:3]] 🔢 0", markdown: AFTER, source: BEFORE, kind: "set-line" });
    assert.equal(page.__settle().take(AFTER, view.id).length, 1, "precondition: a placement really was armed for \"c\"");

    // THE ENGINE'S OWN ANSWER DROPS "c" ENTIRELY — a real, if unusual, outcome (a rule retyped it
    // out of this section, a refusal adopted a file that no longer has it, and so on). Whatever the
    // cause, "before WHAT" and "which row" both stop having answers.
    const WITHOUT_C = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2"].join("\n");
    paintProjection(page, view, WITHOUT_C);

    assert.deepEqual(page.__settle().take(WITHOUT_C, view.id), [], "a row that cannot be found must not be guessed at");
    const texts = rowTexts(elements.get("viewBody")); // includes the heading itself
    assert.equal(texts.length, 3, `expected the heading plus the 2 surviving rows, got: ${JSON.stringify(texts)}`);
    assert.ok(!texts.some((t) => t.includes("qntm:3")), "\"c\" must not be painted at all — it left the source");
    const moved = walk(elements.get("viewBody")).find((el) => String(el.className ?? "").includes("settle-move"));
    assert.equal(moved, undefined, "no element may carry the FLIP class for a row that no longer exists");
  });

  test("a second, real edit to the SAME row that the resolver can no longer rank supersedes the first — the stale target is never animated toward", async () => {
    const BEFORE = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2", "- [ ] c [[qntm:3]] 🔢 3"].join("\n");
    // FIRST EDIT: "c"'s queue_position drops to 0 — armed to move before "a".
    const AFTER_FIRST = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2", "- [ ] c [[qntm:3]] 🔢 0"].join("\n");
    const { page, elements, view } = await freshQueuePage("settle-negative-superseded", BEFORE);

    await page.commitLine(view, { lineIndex: 3, text: "- [ ] c [[qntm:3]] 🔢 0", markdown: AFTER_FIRST, source: BEFORE, kind: "set-line" });
    const firstArm = page.__settle().take(AFTER_FIRST, view.id);
    assert.equal(firstArm.length, 1, "precondition: the first edit really armed a placement moving \"c\" before \"a\"");

    // SECOND EDIT, SAME ROW: the operator deletes the marker while fixing a typo — a real, plausible
    // edit ("- [ ] c [[qntm:3]] 🔢 0" -> "- [ ] c [[qntm:3]]"). `ordering.ts`'s own header: a row
    // with no marker is EXCLUDED from the ranked set, not guessed at — `orderingPlacementFor`
    // ABSTAINS (`no-value`) and `armSettle` re-arms nothing, because there is no fresh placement to
    // arm. Without `settle.supersede` (commitLine, index.html), the FIRST arm — keyed on "c"'s own
    // identity, untouched by this second edit — would still resolve and would still fire, animating
    // "c" to a position nothing has recomputed and nothing can now vouch for.
    const AFTER_SECOND = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2", "- [ ] c [[qntm:3]]"].join("\n");
    const note = page.__orderingNoteFor(view, { lineIndex: 3, text: "- [ ] c [[qntm:3]]", markdown: AFTER_SECOND, source: AFTER_FIRST, kind: "set-line" });
    const diag = page.__orderingDiagnosticFor(view, { lineIndex: 3, text: "- [ ] c [[qntm:3]]", markdown: AFTER_SECOND, source: AFTER_FIRST, kind: "set-line" });
    assert.equal(note, "", "precondition: the resolver must ABSTAIN for this edit, computing no placement at all");
    assert.match(String(diag), /abstained/, `precondition: expected an abstention, got: ${JSON.stringify(diag)}`);

    await page.commitLine(view, { lineIndex: 3, text: "- [ ] c [[qntm:3]]", markdown: AFTER_SECOND, source: AFTER_FIRST, kind: "set-line" });

    assert.deepEqual(
      page.__settle().take(AFTER_SECOND, view.id),
      [],
      "the stale first placement must be discarded, not left standing by an abstention's empty re-arm",
    );

    paintProjection(page, view, AFTER_SECOND);
    const texts = rowTexts(elements.get("viewBody"));
    const aAt = texts.findIndex((t) => t.includes("[[qntm:1]]"));
    const cAt = texts.findIndex((t) => t.includes("[[qntm:3]]"));
    assert.ok(aAt !== -1 && cAt !== -1, `expected both rows painted, got: ${JSON.stringify(texts)}`);
    assert.ok(aAt < cAt, "\"c\" must be shown in plain file order — never dragged to the stale, now-unranked target");
    const moved = walk(elements.get("viewBody")).find((el) => String(el.className ?? "").includes("settle-move"));
    assert.equal(moved, undefined, "no element may carry the FLIP class — the stale placement must never animate");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE FORMER GAP, CLOSED — a marker-bearing capture now survives the stamp too
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. THE FORMER GAP, CLOSED — a capture that ALREADY carries a trailing ordering marker now survives the stamp", () => {
  test("FIXED: the engine inserts [[qntm:N]] BEFORE an existing trailing marker, and relative.ts's extendsLine now recognises that as the same row", async () => {
    // `apps/qntm-md/src/qntm_md/render/renderer.py`'s `_field_expression_cells` composes a
    // rendered line's tail in ONE fixed, DECLARED order — `presentation.json`'s own
    // `composition.tail`, `["stamp", "date", "tags", "markers", "chrome"]` for this instance —
    // confirmed by reading that function directly (read-only; this repo never edits the engine).
    // So when the operator's own capture ALREADY carries the section's ordering marker (a
    // `queue_position` value typed at capture time — required for `orderingPlacementFor` to rank an
    // insert-line at all; see ordering.ts's own header), the engine's canonical re-render does not
    // APPEND the stamp after everything the operator typed — it INSERTS it between the title and
    // that marker. `relative.ts`'s `extendsLine` (the RELATIVE/TEXT rungs' only confirmation, and
    // the rung `settle.ts` depends on for an unstamped row) used to require the arrived line to
    // equal the remembered text with characters ADDED ONLY AT THE END. It now also tries the
    // arrived line WITH the stamp taken back out, so an insertion in the MIDDLE is recognised too.
    // §2 above already proved the fix holds for a bare capture; this test proves the SAME survival
    // for the shape that used to be the honest, named exception — through the real page, not only
    // `extendsLine` in isolation (`tests/present-relative.test.mjs` proves that half, exhaustively
    // over every marker/tag `presentation.json` declares).
    const BEFORE = MARKER_QUEUE_BEFORE;
    const AFTER = MARKER_QUEUE_AFTER_CAPTURE;
    const { page, elements, view } = await freshQueuePage("settle-marker-gap-closed", BEFORE);

    await page.commitLine(view, { lineIndex: 3, text: "- [ ] NEW ROW 🔢 0", markdown: AFTER, source: BEFORE, kind: "insert-line" });
    paintProjection(page, view, AFTER);
    let texts = rowTexts(elements.get("viewBody"));
    assert.ok(texts.findIndex((t) => t.includes("NEW ROW")) < texts.findIndex((t) => t.includes("[[qntm:1]]")), "precondition: the optimistic paint sorts it first, exactly as §2 does");

    // THE ENGINE STAMPS IT, INSERTED before the existing marker — `_field_expression_cells`'s own
    // composition order, not a fixture invented for this test.
    const STAMPED = MARKER_QUEUE_STAMPED;
    paintProjection(page, view, STAMPED);

    // THE FIX, PROVEN: the placement DOES survive, and the row stays sorted exactly as §2 already
    // proved for a bare capture — the shape that used to be this suite's own named exception.
    const [instruction] = page.__settle().take(STAMPED, view.id);
    assert.notEqual(instruction, undefined, "FIXED: a marker-bearing capture's placement must survive the stamp landing on its own row");
    assert.deepEqual(instruction.placement, { lineIndex: 3, beforeLineIndex: 1 }, "\"NEW ROW\" (queue_position 0) still belongs immediately before \"a\" (queue_position 1)");
    texts = rowTexts(elements.get("viewBody"));
    const newAt = texts.findIndex((t) => t.includes("NEW ROW"));
    const aAt = texts.findIndex((t) => t.includes("[[qntm:1]]"));
    assert.ok(newAt !== -1 && aAt !== -1 && newAt < aAt, `FIXED: the row must still be shown sorted before "a" once it is stamped, got: ${JSON.stringify(texts)}`);
  });

  test("FIXED: the same survival for a capture carrying a hand-typed TYPE TAG, stamped and re-tagged in the SAME composed order the engine always uses", async () => {
    // The real shape `tests/present-relative.test.mjs`'s own `REAL_INBOX` fixture carries —
    // `[[qntm:N]] #task 🆕 ...` — a stamp, THEN a type tag, THEN a marker, all in composition's own
    // tail order. A fresh capture typed WITH its own `#task` tag (the operator's other common
    // gesture — `tests/fixtures/promotion-scenarios.mjs`'s own `TAGGED_*` shapes) must survive its
    // first stamp the same way a marker-bearing one now does.
    const BEFORE = MARKER_QUEUE_BEFORE;
    const AFTER = TAGGED_MARKER_QUEUE_AFTER_CAPTURE;
    const { page, elements, view } = await freshQueuePage("settle-tag-and-marker-gap-closed", BEFORE);

    await page.commitLine(view, { lineIndex: 3, text: "- [ ] NEW ROW #task 🔢 0", markdown: AFTER, source: BEFORE, kind: "insert-line" });
    paintProjection(page, view, AFTER);

    // THE ENGINE STAMPS IT, INSERTED before BOTH the tag and the marker — composition's tail order
    // is stamp, then tags, then markers; neither cell moves relative to the other, only the stamp
    // lands in front of both.
    const STAMPED = TAGGED_MARKER_QUEUE_STAMPED;
    paintProjection(page, view, STAMPED);

    const [instruction] = page.__settle().take(STAMPED, view.id);
    assert.notEqual(instruction, undefined, "FIXED: a tag-and-marker-bearing capture's placement must survive the stamp landing on its own row");
    const texts = rowTexts(elements.get("viewBody"));
    const newAt = texts.findIndex((t) => t.includes("NEW ROW"));
    const aAt = texts.findIndex((t) => t.includes("[[qntm:1]]"));
    assert.ok(newAt !== -1 && aAt !== -1 && newAt < aAt, `FIXED: the row must still be shown sorted before "a" once it is stamped, got: ${JSON.stringify(texts)}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. PLACEMENT APPLIES AT COMMIT — the row is in its correct position BEFORE any projection is
//    delivered, with the motion having run — and the engine's AGREEING answer moves nothing again
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. PLACEMENT APPLIES AT COMMIT — a bare, unstamped capture is relocated in the SAME synchronous paint as the real keystroke, before any projection, and an agreeing projection is a no-op", () => {
  test("DEFAULT ordering (undeclared section, title tiebreak): correct BEFORE any projection, with motion — then the engine's stamped, agreeing answer moves nothing a second time", async () => {
    const SRC = ["## Queue", "- [ ] Family domain [[qntm:1]]", "- [ ] Micu lunch [[qntm:2]]"].join("\n");
    const V = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: SRC };
    const { page, elements, press, view } = await freshGesturePage("commit-applies-default", DEFAULT_DECLARATION, V);

    press("g"); press("g");
    press("j"); // line 1: "Family domain"
    press("o");
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    // A BARE CAPTURE — a title, nothing else. No stamp, no marker: exactly what a real `o`/Enter
    // capture looks like (`settle.ts`'s own header — the engine mints the stamp, never the operator).
    input.value = "- [ ] Aaa sorts first";
    input.dispatch("blur"); // real draftInput settle -> commitLine -> armSettle -> optimistic repaint, ALL synchronous, before this test has awaited anything at all

    // ── BEFORE ANY PROJECTION IS DELIVERED: already in its correct sorted position, with motion ──
    let texts = rowTexts(elements.get("viewBody"));
    let newAt = texts.findIndex((t) => t.includes("Aaa sorts first"));
    let familyAt = texts.findIndex((t) => t.includes("Family domain"));
    assert.ok(newAt !== -1 && familyAt !== -1, `expected both rows painted, got: ${JSON.stringify(texts)}`);
    assert.ok(newAt < familyAt, "the row must sort BEFORE \"Family domain\" in the SAME turn as the keystroke — no projection has been delivered yet");
    const movedBefore = walk(elements.get("viewBody")).find((el) => String(el.className ?? "").includes("settle-move"));
    assert.ok(movedBefore, "the FLIP motion must have run in this same synchronous pass — no element carries settle-move");

    // ── THE ENGINE'S OWN AGREEING ANSWER, LATER — the same row, now stamped, nothing else different.
    // This is exactly the shape §2 already proved the placement survives (a bare capture, stamp
    // appended, never inserted mid-line), reused here so §5 can go one step further: not merely
    // "does it still resolve" but "is the SCREEN a no-op".
    const STAMPED = ["## Queue", "- [ ] Family domain [[qntm:1]]", "- [ ] Aaa sorts first [[qntm:9]]", "- [ ] Micu lunch [[qntm:2]]"].join("\n");
    paintProjection(page, view, STAMPED);

    // ── AFTER THE AGREEING PROJECTION: still correctly placed, and NOTHING moved a second time ──
    texts = rowTexts(elements.get("viewBody"));
    newAt = texts.findIndex((t) => t.includes("Aaa sorts first"));
    familyAt = texts.findIndex((t) => t.includes("Family domain"));
    const micuAt = texts.findIndex((t) => t.includes("Micu lunch"));
    assert.ok(newAt !== -1 && familyAt !== -1 && micuAt !== -1, `expected all three rows painted, got: ${JSON.stringify(texts)}`);
    assert.ok(newAt < familyAt && familyAt < micuAt, "the row stays correctly sorted once the engine's own answer lands");
    const movedAfter = walk(elements.get("viewBody")).find((el) => String(el.className ?? "").includes("settle-move"));
    assert.equal(movedAfter, undefined, "the agreeing projection must be an invisible NO-OP — no second motion; the engine only CONFIRMS what the browser already showed");
  });

  test("DECLARED ordering (queue_position): correct BEFORE any projection is delivered, with the motion having run", async () => {
    const SRC = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2"].join("\n");
    const V = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: SRC };
    const { elements, press } = await freshGesturePage("commit-applies-declared", QUEUE_DECLARATION, V);

    press("g"); press("g");
    press("j"); // line 1: "a"
    press("j"); // line 2: "b"
    press("o");
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    // A real marker, typed as the operator would, and still NO stamp — the engine mints that, not him.
    input.value = "- [ ] c sorts first 🔢 0";
    input.dispatch("blur");

    const texts = rowTexts(elements.get("viewBody"));
    const cAt = texts.findIndex((t) => t.includes("c sorts first"));
    const aAt = texts.findIndex((t) => t.includes("[[qntm:1]]"));
    assert.ok(cAt !== -1 && aAt !== -1, `expected both rows painted, got: ${JSON.stringify(texts)}`);
    assert.ok(cAt < aAt, "queue_position 0 must sort before queue_position 1, in the same turn as the keystroke — no projection has been delivered yet");
    const moved = walk(elements.get("viewBody")).find((el) => String(el.className ?? "").includes("settle-move"));
    assert.ok(moved, "the FLIP motion must have run in this same synchronous pass");
    // NOT CARRIED FURTHER TO A STAMPED PROJECTION, ON PURPOSE. A capture that already carries its
    // own ordering marker is §4's KNOWN, NAMED, OUT-OF-SCOPE GAP: the engine inserts `[[qntm:N]]`
    // BEFORE the marker, not after it, so `extendsLine`'s append-only check does not survive it —
    // asserting a no-op here would either duplicate §4's proof of the gap or silently paper over it.
    // The default-ordering test above carries the FULL before/after arc for the shape that does
    // survive a stamp; this test's job is only the "before" half, for the declared-ordering path.
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE NEGATIVE, ONE MORE — AN ABSTAINING SECTION NEVER MOVES THE ROW AT ALL
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("6. THE NEGATIVE — a section that declares no sort at all (insertion order) never arms a placement, and the row stays exactly where it was typed", () => {
  // DECLARED, explicitly, with NO ordering fields at all — `ordering.ts`'s own header: "A section
  // declaring `orderingMode: insertion_order` abstains on EVERY edit, forever." This is NOT the
  // undeclared/default-fallback case (§1's second test, §5's first test) — those always have
  // somewhere to fall back to (due_date/priority/title). This section genuinely has nowhere at all.
  const INSERTION_ORDER_DECLARATION = {
    qualification: {
      defaultNodeType: "task", structuralNodeTypes: [],
      tokens: { node_type: {}, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
      predicates: {}, sections: {}, sectionOrder: { demo: ["queue"] }, refused: {},
    },
    resolution: {
      ordering: { demo: { queue: { ordering: [], orderingMode: "insertion_order", name: "Queue" } } },
      orderingFields: {},
      defaultOrdering: [
        { field: "due_date", direction: "asc" },
        { field: "priority", direction: "desc" },
        { field: "title", direction: "asc" },
      ],
      priorityRank: {},
      dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
    },
  };

  test("a row typed where it would sort FIRST under title order stays exactly where it was opened — no placement is ever armed", async () => {
    const SRC = ["## Queue", "- [ ] Zzz already last [[qntm:1]]"].join("\n");
    const V = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: SRC };
    const { page, elements, press, posted } = await freshGesturePage("negative-insertion-order", INSERTION_ORDER_DECLARATION, V);

    press("g"); press("g");
    press("j"); // line 1: "Zzz already last"
    press("o"); // opens a draft AFTER it, at line index 2 — where insertion order must leave it
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    // "Aaa" would sort FIRST under title order — the section's own declared `insertion_order` must
    // refuse to apply that rule at all, leaving the row exactly where it was opened, AFTER "Zzz".
    input.value = "- [ ] Aaa would sort first under title order";
    input.dispatch("blur");

    const p = posted();
    assert.ok(p, "the write must have posted — commitLine ran");
    // NO PLACEMENT WAS EVER ARMED — the resolver abstained (`insertion-order`), so `armSettle` never
    // called `.arm()` at all, and `take()`, asked against the EXACT string that was armed against
    // (were anything armed), has nothing to say.
    assert.deepEqual(
      page.__settle().take(p.body.markdown, "demo"),
      [],
      "an abstaining section must never leave a live placement armed",
    );

    // THE ROW IS EXACTLY WHERE IT WAS TYPED — second, in FILE order, never dragged by a rule the
    // section never declared. Landing it first would be the browser guessing a rule this section
    // does not have, which is the exact hazard the abstention exists to refuse.
    const texts = rowTexts(elements.get("viewBody"));
    const newAt = texts.findIndex((t) => t.includes("Aaa would sort first"));
    const zzzAt = texts.findIndex((t) => t.includes("Zzz already last"));
    assert.ok(newAt !== -1 && zzzAt !== -1, `expected both rows painted, got: ${JSON.stringify(texts)}`);
    assert.ok(zzzAt < newAt, "insertion order: the new row must land AFTER the row it was opened below, never sorted ahead of it");

    const moved = walk(elements.get("viewBody")).find((el) => String(el.className ?? "").includes("settle-move"));
    assert.equal(moved, undefined, "no element may carry the FLIP class — nothing was ever armed to move");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7. THE ENTER GESTURE — o, type, ENTER (not blur) — the operator's own live gesture, reproduced
//    or refuted, driven through the real page
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("7. THE ENTER GESTURE — o, type, ENTER — the coordinator's hypothesis, checked rather than assumed", () => {
  // WHY THIS SECTION EXISTS. §5 above proves placement-at-commit end to end for `o`, type, BLUR.
  // Every other section in this file also commits through BLUR. The operator's own live report was
  // `o`, type, ENTER — a gesture this file, until now, never drove. `draftInput`'s own wiring
  // (app/present/paint.ts) attaches BOTH `input.addEventListener("blur", settle)` and a `keydown`
  // listener that calls the SAME `settle()` closure for `Enter` — so the two gestures reach
  // identical application code, UNLESS something differs at the DOM-EVENT level that this file's
  // `input.dispatch("blur")` shortcut never exercises: a real `Enter` keydown is dispatched at the
  // FOCUSED `<input>` first (running `draftInput`'s own listener) and then BUBBLES to `document`,
  // where app/index.html's global keydown handler (index.html:3210) unconditionally calls
  // `drainPainted()` BEFORE its own NORMAL-mode gate — "the THIRD DRAIN POINT ... called ... on
  // ORDINARY keystrokes with nothing queued" (index.html:1958-1961). `tests/fixtures/
  // app-html-page.mjs`'s mock DOM does NOT bubble an element-dispatched event to `document` at all
  // (`dispatch` on an element only walks THAT element's own `listeners` map, and `document.dispatch`
  // is a wholly separate call) — so a faithful reproduction of a real keypress has to dispatch the
  // SAME event to BOTH the input and `document`, by hand, exactly what a browser does for free. A
  // test that only called `input.dispatch("keydown", ...)` would silently fail to exercise the one
  // mechanism (the third drain point) the operator's own symptom could plausibly depend on.
  // (`pressEnterOn` itself is defined at module scope, just below `freshGesturePage` — §8 needs it
  // too, for the identical reason.)

  test("DEFAULT ordering (undeclared section, title tiebreak): o, type, ENTER — correct BEFORE any projection, exactly mirroring §5's BLUR case", async () => {
    const SRC = ["## Queue", "- [ ] Family domain [[qntm:1]]", "- [ ] Micu lunch [[qntm:2]]"].join("\n");
    const V = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: SRC };
    const { page, elements, press, view, document: doc } = await freshGesturePage("enter-gesture-default", DEFAULT_DECLARATION, V);

    press("g"); press("g");
    press("j"); // line 1: "Family domain"
    press("o");
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    // THE BARE CAPTURE, TYPED EXACTLY AS §5's BLUR CASE TYPES IT — the only variable this section
    // changes is the key that commits it.
    input.value = "- [ ] Aaa sorts first";
    const event = pressEnterOn(input, doc);

    // THE KEYDOWN ITSELF MUST NOT HAVE INSERTED A NEWLINE OR REACHED THE BROWSER'S OWN DEFAULT —
    // `draftInput`'s own listener calls `event.preventDefault()` before `settle()`; if this is
    // false, `commitLine` never ran at all and everything below would be checking a stale screen.
    assert.ok(event.defaultPrevented, "Enter must be prevented by draftInput's own keydown listener — commitLine may not have run");

    // ── BEFORE ANY PROJECTION IS DELIVERED: is the row already in its correct sorted position? ──
    // This is the EXACT assertion §5's BLUR test makes, unchanged, against the ENTER gesture.
    const texts = rowTexts(elements.get("viewBody"));
    const newAt = texts.findIndex((t) => t.includes("Aaa sorts first"));
    const familyAt = texts.findIndex((t) => t.includes("Family domain"));
    assert.ok(newAt !== -1 && familyAt !== -1, `expected both rows painted, got: ${JSON.stringify(texts)}`);
    assert.ok(newAt < familyAt, "THE OPERATOR'S OWN SYMPTOM: the row must sort BEFORE \"Family domain\" in the SAME turn as the Enter keystroke — no projection has been delivered yet");
    const moved = walk(elements.get("viewBody")).find((el) => String(el.className ?? "").includes("settle-move"));
    assert.ok(moved, "the FLIP motion must have run in this same synchronous pass — no element carries settle-move");
  });

  test("DECLARED ordering (queue_position): o, type, ENTER — correct BEFORE any projection, exactly mirroring §5's BLUR case", async () => {
    const SRC = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2"].join("\n");
    const V = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: SRC };
    const { elements, press, document: doc } = await freshGesturePage("enter-gesture-declared", QUEUE_DECLARATION, V);

    press("g"); press("g");
    press("j"); // line 1: "a"
    press("j"); // line 2: "b"
    press("o");
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = "- [ ] c sorts first 🔢 0";
    pressEnterOn(input, doc);

    const texts = rowTexts(elements.get("viewBody"));
    const cAt = texts.findIndex((t) => t.includes("c sorts first"));
    const aAt = texts.findIndex((t) => t.includes("[[qntm:1]]"));
    assert.ok(cAt !== -1 && aAt !== -1, `expected both rows painted, got: ${JSON.stringify(texts)}`);
    assert.ok(cAt < aAt, "queue_position 0 must sort before queue_position 1, in the same turn as the Enter keystroke");
    const moved = walk(elements.get("viewBody")).find((el) => String(el.className ?? "").includes("settle-move"));
    assert.ok(moved, "the FLIP motion must have run in this same synchronous pass");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 8. TWO CAPTURES IN A ROW — the operator's real workflow, and the actual mechanism behind the
//    reported symptom, found while §7 above was refuting the Enter-vs-blur hypothesis
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("8. TWO CAPTURES IN A ROW — a second, unrelated commit must not undo the first row's placement", () => {
  // ── WHY THIS SECTION EXISTS, AND WHAT §7 ACTUALLY FOUND ──
  //
  // §7 refutes the Enter-vs-blur hypothesis directly: a single `o`/type/Enter capture lands
  // correctly, synchronously, exactly like the blur-driven §5. That is NOT the end of the
  // investigation — driving the operator's REAL workflow (rapid, repeated `o`/type/Enter capture,
  // one inbox item after another — "his own two-captures-in-a-row gesture", `app/index.html`'s own
  // words at `commitLine`'s `arrive` comment) found a real, reproducible defect independent of the
  // Enter/blur question and independent of the GitHub Pages deploy gap: the FIRST row's placement
  // reverted to raw file order the INSTANT a second, wholly unrelated row was captured. Verified
  // live: `o`/type "Aaa sorts first"/Enter lands "Aaa" correctly before "Family domain" (matching
  // §7) — then, immediately, `o`/type "Zzz sorts last"/Enter — and "Aaa" falls back to AFTER "Family
  // domain" the moment the second capture's own optimistic repaint runs. Root cause: `SettleSurface`
  // (app/present/settle.ts, before this change) held exactly ONE pending placement — `arm()`'s own
  // comment called that "the same reason there is one cursor," which is right for a SECOND commit to
  // the SAME row and silently wrong for a commit to a DIFFERENT one. `armSettle`'s second call
  // (resolve.ts) simply overwrote the first row's still-correct claim, and the next full repaint
  // rebuilt every row from the literal (unsorted) source string with nothing left to reposition the
  // first one. This matches the operator's report almost exactly — visible immediately, wrong, and
  // self-correcting only once a real server answer eventually replaces the DOM outright — for a
  // workflow (capturing several inbox items back to back) that is at least as ordinary as a single
  // isolated capture.
  //
  // THE FIX: `SettleSurface` now holds one entry PER ROW, keyed by that row's own identity, so an
  // arm for one row never discards another's. See settle.ts's own header for the full account, the
  // discard conditions, and the derived (never chosen) bound on how many can be pending at once.
  test("DEFAULT ordering (undeclared section): o/type/Enter, then IMMEDIATELY o/type/Enter again for an unrelated row — BOTH stay correctly placed, before any projection", async () => {
    const SRC = ["## Queue", "- [ ] Family domain [[qntm:1]]", "- [ ] Micu lunch [[qntm:2]]"].join("\n");
    const V = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: SRC };
    const { elements, press, document: doc } = await freshGesturePage("two-captures-default", DEFAULT_DECLARATION, V);

    // CAPTURE 1: sorts FIRST, immediately before "Family domain".
    press("g"); press("g");
    press("j"); // line 1: "Family domain"
    press("o");
    let input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = "- [ ] Aaa sorts first";
    pressEnterOn(input, doc);

    let texts = rowTexts(elements.get("viewBody"));
    let newAt = texts.findIndex((t) => t.includes("Aaa sorts first"));
    let familyAt = texts.findIndex((t) => t.includes("Family domain"));
    assert.ok(newAt !== -1 && newAt < familyAt, `precondition: capture 1 alone must sort correctly, exactly as §7 already proved, got: ${JSON.stringify(texts)}`);

    // CAPTURE 2, IMMEDIATELY: a wholly UNRELATED row, sorting LAST — nowhere near capture 1's own
    // slot. The cursor is left wherever capture 1's own commit put it (NORMAL, on the row it just
    // placed), so `o` opens the next draft below it — the same "one more item" gesture the operator
    // actually uses.
    press("o");
    input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    assert.ok(input, "the second o did not open a draft");
    input.value = "- [ ] Zzz sorts last";
    pressEnterOn(input, doc);

    // ── THE REGRESSION THIS SECTION EXISTS TO CATCH: does CAPTURE 1 survive CAPTURE 2? ──
    texts = rowTexts(elements.get("viewBody"));
    newAt = texts.findIndex((t) => t.includes("Aaa sorts first"));
    familyAt = texts.findIndex((t) => t.includes("Family domain"));
    const micuAt = texts.findIndex((t) => t.includes("Micu lunch"));
    const zzzAt = texts.findIndex((t) => t.includes("Zzz sorts last"));
    assert.ok(
      newAt !== -1 && familyAt !== -1 && micuAt !== -1 && zzzAt !== -1,
      `expected all four rows painted, got: ${JSON.stringify(texts)}`,
    );
    assert.ok(
      newAt < familyAt,
      `THE OPERATOR'S OWN SYMPTOM, TWO CAPTURES DEEP: "Aaa sorts first" must STILL sort before "Family domain" after an unrelated second capture — got order: ${JSON.stringify(texts)}`,
    );
    assert.ok(familyAt < micuAt, "\"Family domain\" and \"Micu lunch\" keep their own relative order");
    assert.ok(micuAt < zzzAt, "\"Zzz sorts last\" — capture 2's own placement — must also be correct, last");

    // BOTH ROWS MUST HAVE CARRIED THE FLIP CLASS AT SOME POINT DURING THIS SEQUENCE — captured
    // AFTER capture 2, since capture 1's own class is cleared once its transition completes, but
    // the count on THIS repaint shows capture 2's own admitted motion at minimum.
    const movedAfterSecond = walk(elements.get("viewBody")).filter((el) => String(el.className ?? "").includes("settle-move"));
    assert.ok(movedAfterSecond.length >= 1, "at least the second capture's own motion must be visible on this repaint");
  });

  test("DECLARED ordering (queue_position): the same two-captures shape, both rows correctly placed", async () => {
    const SRC = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 5"].join("\n");
    const V = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: SRC };
    const { elements, press, document: doc } = await freshGesturePage("two-captures-declared", QUEUE_DECLARATION, V);

    press("g"); press("g");
    press("j"); // line 1: "a"
    press("o");
    let input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    // Sorts between "a" (1) and "b" (5).
    input.value = "- [ ] middle 🔢 3";
    pressEnterOn(input, doc);

    let texts = rowTexts(elements.get("viewBody"));
    assert.ok(
      texts.findIndex((t) => t.includes("middle")) !== -1 &&
        texts.findIndex((t) => t.includes("middle")) > texts.findIndex((t) => t.includes("[[qntm:1]]")) &&
        texts.findIndex((t) => t.includes("middle")) < texts.findIndex((t) => t.includes("[[qntm:2]]")),
      `precondition: capture 1 alone must sort between "a" and "b", got: ${JSON.stringify(texts)}`,
    );

    // CAPTURE 2: sorts FIRST, before "a" — unrelated to capture 1's own slot.
    press("o");
    input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = "- [ ] first 🔢 0";
    pressEnterOn(input, doc);

    texts = rowTexts(elements.get("viewBody"));
    const firstAt = texts.findIndex((t) => t.includes("- [ ] first"));
    const aAt = texts.findIndex((t) => t.includes("[[qntm:1]]"));
    const middleAt = texts.findIndex((t) => t.includes("middle"));
    const bAt = texts.findIndex((t) => t.includes("[[qntm:2]]"));
    assert.ok(
      [firstAt, aAt, middleAt, bAt].every((i) => i !== -1),
      `expected all four rows painted, got: ${JSON.stringify(texts)}`,
    );
    assert.ok(firstAt < aAt, "capture 2's own placement (queue_position 0) must sort before \"a\"");
    assert.ok(
      aAt < middleAt && middleAt < bAt,
      `capture 1's own placement must SURVIVE capture 2 — "middle" must still sort between "a" and "b", got: ${JSON.stringify(texts)}`,
    );
  });

  // ── THE OPEN LINE IS SACRED — NEGATIVE PROOF ──
  //
  // `settle`'s own repositioning must never reach a row that is still an open `<input>`: paint.ts's
  // `rowsByLineIndex` is built ONLY from `source.split("\n")` — the committed file — and a draft
  // still being typed is appended SEPARATELY (`paintDraft`), never entered into that map at all. So
  // there is no `lineIndex` a settle instruction could name that resolves to the draft — proven here
  // by driving row 1's own placement AND leaving a SECOND draft open, mid-type, uncommitted, and
  // checking that draft's own characters and caret are exactly what was typed, untouched by
  // whatever `settle` does elsewhere on the same repaint.
  test("the operator's SECOND, still-open draft keeps its own characters and caret while the FIRST row settles around it", async () => {
    const SRC = ["## Queue", "- [ ] Family domain [[qntm:1]]", "- [ ] Micu lunch [[qntm:2]]"].join("\n");
    const V = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: SRC };
    const { elements, press, document: doc } = await freshGesturePage("two-captures-caret-safe", DEFAULT_DECLARATION, V);

    // CAPTURE 1: commits and settles, exactly as above.
    press("g"); press("g");
    press("j");
    press("o");
    let input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = "- [ ] Aaa sorts first";
    pressEnterOn(input, doc);

    // A SECOND DRAFT IS OPENED, AND LEFT OPEN — not committed. This is the row `settle` must never
    // touch: it has no source line of its own yet at all.
    press("o");
    input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    assert.ok(input, "the second o did not open a draft");
    input.value = "- [ ] half-typed row, not yet committ";
    input.dispatch("input", makeEvent({}));
    input.setSelectionRange(input.value.length, input.value.length);

    // ── THE OPEN DRAFT'S OWN CHARACTERS AND CARET, CHECKED WHILE ROW 1's OWN PLACEMENT IS LIVE ──
    assert.equal(input.value, "- [ ] half-typed row, not yet committ", "the open draft's characters must be exactly what was typed — nothing lost, nothing added");
    assert.equal(input.selectionStart, input.value.length, "the caret must stay at the end of what was typed");

    // AND ROW 1's OWN PLACEMENT IS STILL LIVE, CONFIRMED THE SAME WAY §7/§8 ALREADY DO — the two
    // facts hold at once: the settled row stays settled, the open row stays exactly as typed.
    const texts = rowTexts(elements.get("viewBody"));
    const newAt = texts.findIndex((t) => t.includes("Aaa sorts first"));
    const familyAt = texts.findIndex((t) => t.includes("Family domain"));
    assert.ok(newAt !== -1 && familyAt !== -1 && newAt < familyAt, `row 1 must still be correctly placed while the draft is open, got: ${JSON.stringify(texts)}`);

    // THE DRAFT IS STILL THE FOCUSED ELEMENT — nothing about settling row 1 moved the cursor away
    // from the line the operator is actively typing.
    assert.equal(input.focused, true, "the open draft must still hold the caret");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 9. A STALE QUEUED PROJECTION MUST NOT OUTLIVE THE COMMIT THAT MAKES IT STALE — the operator's
//    real, five-times-reported symptom, found OUTSIDE the settle/paint span itself
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("9. A STALE QUEUED PROJECTION MUST NOT OUTLIVE THE COMMIT THAT MAKES IT STALE", () => {
  // ── WHERE THIS ONE ACTUALLY LIVES, AND WHY §1–8 ABOVE COULD NEVER FIND IT ──
  //
  // Every section above proves `commitLine` -> `armSettle` -> `SettleSurface.arm` -> the optimistic
  // repaint -> `SettleSurface.take` -> `settleRow`'s FLIP, in isolation, for ONE commit against a
  // page holding nothing else. That mechanism is not what drops the row. What drops it sits one
  // layer OUTSIDE that span, in `app/index.html`'s own `document`-level `keydown` handler: "THE
  // THIRD DRAIN POINT" (`drainPainted()`) runs UNCONDITIONALLY, before any mode gate, on literally
  // every keydown that bubbles to `document` — INCLUDING the very Enter that just committed a fresh
  // capture through the `<input>`'s own listener, which fires FIRST (target phase) and closes the
  // line (`aLineIsOpen()` flips `true` -> `false`) before this handler's own bubble-phase code runs.
  //
  // If a projection for this same file is already sitting in `queued` — a wholly ordinary state for
  // the operator's own real workflow, capturing several inbox items back to back (`settle.ts`'s own
  // header names this gesture), where an EARLIER item's ~10s pickup can land while a LATER item is
  // still being typed, and gets QUEUED rather than installed because `aLineIsOpen()` was `true` at
  // that instant — `drainPainted()` installs it right there, on the SAME keystroke, discarding the
  // placement `armSettle` just armed for the row before the operator ever sees it painted. The row
  // then reappears, unsorted, in plain file order, the moment its OWN write's answer next lands
  // (there is nothing left in `SettleSurface` to place it once its identity anchor has failed to
  // resolve against the stale source and been deleted) — and stays there until the real engine cycle
  // eventually corrects it. That is exactly "it only reaches its correct position when the engine's
  // projection arrives seconds later."
  //
  // THE FIX lives in `commitLine` itself (`app/index.html`): `queued.drop(view.path)`, alongside the
  // existing `settle.supersede` call. Anything held in `queued` at the moment a NEW local commit is
  // made necessarily predates that commit — the edit has not even reached `writeFile` yet, so no
  // cycle anywhere could possibly have answered for it — so it can never be MORE current than the
  // screen this commit is about to paint, and letting it survive to be installed later (by this same
  // keydown's own bubble, or by any ordinary keystroke after) can only ever regress the screen.
  // Dropping it costs nothing durable: the write this commit is about to make starts its own pickup,
  // and whatever the dropped projection knew is superseded for good the moment that pickup answers.
  //
  // NOT REACHABLE THROUGH A HAND-BUILT DOM. `tests/fixtures/app-html-page.mjs`'s mock `document`
  // never bubbles an element-dispatched event on its own — `pressEnterOn` (this file) already exists
  // to compensate for exactly that gap — but this section additionally needs a projection to be
  // sitting in `queued` at commit time, which no earlier section in this file, and no prior agent's
  // proof, ever put there. `page.__queued()` (the exported getter onto the page's own module-scoped
  // `ProjectionQueue`) is what lets this section manufacture that state directly, through the real
  // `offer`/`drop` methods `app/present/queue.ts` exports — not a second, hand-rolled queue.

  test("a projection queued for an UNRELATED earlier write, still pending the instant a fresh o/type/Enter capture commits, must not survive to overwrite that capture's own placement", async () => {
    const SRC = [
      "## Tagged",
      "## Inbox",
      "- [ ] And now testing a second one [[qntm:1]]",
      "- [ ] Testing inbox [[qntm:2]]",
      "- [ ] and third one [[qntm:3]]",
    ].join("\n");
    const V = { id: "inbox", path: "inbox.md", title: "Inbox", domain: "inbox", markdown: SRC };
    const DECLARATION = {
      ...DEFAULT_DECLARATION,
      qualification: { ...DEFAULT_DECLARATION.qualification, sectionOrder: { inbox: ["inbox-tagged", "domain-empty"] } },
    };
    const { page, elements, press, view, document: doc } = await freshGesturePage("stale-queue-race", DECLARATION, V);

    press("g"); press("g");
    press("j"); press("j"); press("j"); // "and third one" — the last row in the section
    press("o");
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = "- [ ] Bravo zzTEST should be second";

    // AN EARLIER, WHOLLY UNRELATED WRITE'S OWN CYCLE ANSWERED WHILE THIS DRAFT WAS STILL OPEN — the
    // real, ordinary consequence of capturing several items in quick succession. Its projection does
    // not and cannot carry "Bravo" — the server has not seen it yet — so it was held rather than
    // installed (`arrive`/`drainProjection`'s own `aLineIsOpen()` gate), exactly as it would for real.
    page.__queued().offer(view.path, "2026-08-06T00:00:05Z", {
      snapshot: { generated_at: "2026-08-06T00:00:05Z", views: [{ ...view, markdown: SRC }] },
    });
    assert.notEqual(page.__queued().pending(view.path), null, "precondition: a projection really is queued for this path before the commit");

    pressEnterOn(input, doc);

    // ── THE OPERATOR'S OWN SYMPTOM, ON THE SAME KEYSTROKE THE ROW WAS TYPED WITH ──
    let texts = rowTexts(elements.get("viewBody"));
    let bravoAt = texts.findIndex((t) => t.includes("Bravo"));
    let testingAt = texts.findIndex((t) => t.includes("Testing inbox"));
    assert.ok(bravoAt !== -1, `the row must not vanish — a stale queued projection must never overwrite a commit that has not yet reached the server, got: ${JSON.stringify(texts)}`);
    assert.ok(bravoAt < testingAt, `the row must sort BEFORE "Testing inbox" on the SAME keystroke that captured it, got: ${JSON.stringify(texts)}`);

    // ── AND IT MUST STAY CORRECT THROUGH THE NEXT ORDINARY KEYSTROKE, NOT ONLY THIS ONE ──
    // A fix that only guarded the FIRST `drainPainted()` call (the one on this same Enter) but left
    // the stale entry standing in `queued` would still lose the row the moment the operator's next,
    // wholly ordinary keystroke ran the document handler's own drain — this is the falsifier for
    // that narrower, insufficient fix.
    press("j");
    texts = rowTexts(elements.get("viewBody"));
    bravoAt = texts.findIndex((t) => t.includes("Bravo"));
    testingAt = texts.findIndex((t) => t.includes("Testing inbox"));
    assert.ok(bravoAt !== -1, `the row must still be on screen after the NEXT ordinary keystroke, got: ${JSON.stringify(texts)}`);
    assert.ok(bravoAt < testingAt, `the row must still sort correctly after the NEXT ordinary keystroke, got: ${JSON.stringify(texts)}`);
  });
});

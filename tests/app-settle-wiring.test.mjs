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
 *   4. A KNOWN REMAINING GAP, NAMED RATHER THAN HIDDEN — a capture that ALREADY carries the
 *      section's own ordering marker (typed by the operator at capture time — required for
 *      `orderingPlacementFor` to rank an insert-line at all) does NOT yet survive the stamp: the
 *      engine's canonical render (`renderer.py`'s `_field_expression_cells`, read directly) inserts
 *      `[[qntm:N]]` BEFORE that marker, not after it, and `relative.ts`'s `extendsLine` — an
 *      append-only confirmation, shared by `rows.ts`/`held.ts`/`focus.ts` — does not recognise an
 *      insertion in the middle of the line as the same row. This is the honest edge of what this
 *      change fixes; closing it is separately-scoped work in a shared module this change does not
 *      touch. See §4's own test for the proof and app/present/settle.ts's header for the pointer.
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
  return { page, elements, press, posted: () => posted, view };
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
    const instruction = page.__settle().take(AFTER, "demo");
    assert.notEqual(instruction, null, "the real resolver walk must have armed a placement for the new row");
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

    const instruction = page.__settle().take(STAMPED, "demo");
    assert.notEqual(instruction, null, "the placement must survive the stamp landing on its own row");

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
    assert.notEqual(page.__settle().take(AFTER, view.id), null, "precondition: a placement really was armed for \"c\"");

    // THE ENGINE'S OWN ANSWER DROPS "c" ENTIRELY — a real, if unusual, outcome (a rule retyped it
    // out of this section, a refusal adopted a file that no longer has it, and so on). Whatever the
    // cause, "before WHAT" and "which row" both stop having answers.
    const WITHOUT_C = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2"].join("\n");
    paintProjection(page, view, WITHOUT_C);

    assert.equal(page.__settle().take(WITHOUT_C, view.id), null, "a row that cannot be found must not be guessed at");
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
    assert.notEqual(firstArm, null, "precondition: the first edit really armed a placement moving \"c\" before \"a\"");

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

    assert.equal(
      page.__settle().take(AFTER_SECOND, view.id),
      null,
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
// 4. A KNOWN REMAINING GAP, NAMED RATHER THAN HIDDEN
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. A KNOWN REMAINING GAP — a capture that ALREADY carries a trailing ordering marker does not yet survive the stamp", () => {
  test("DOCUMENTED, NOT FIXED: the engine inserts [[qntm:N]] BEFORE an existing trailing marker, which relative.ts's extendsLine (an append-only check) does not recognise as the same row", async () => {
    // `apps/qntm-md/src/qntm_md/render/renderer.py`'s `_field_expression_cells` composes a
    // rendered line's tail in ONE fixed order: qntm_id_cell, THEN date/tag/marker/chrome cells —
    // confirmed by reading that function directly (read-only; this repo never edits the engine).
    // So when the operator's own capture ALREADY carries the section's ordering marker (a
    // `queue_position` value typed at capture time — required for `orderingPlacementFor` to rank an
    // insert-line at all; see ordering.ts's own header), the engine's canonical re-render does not
    // APPEND the stamp after everything the operator typed — it INSERTS it between the title and
    // that marker. `relative.ts`'s `extendsLine` (the RELATIVE/TEXT rungs' only confirmation, and
    // the rung `settle.ts` now depends on for an unstamped row) requires the arrived line to equal
    // the remembered text with characters ADDED ONLY AT THE END — `arrived.startsWith(held + " ")`.
    // An insertion in the MIDDLE fails that check, so this ONE case — a row captured WITH its
    // ordering marker already on it — still discards the placement on the stamp's arrival. §2 above
    // proves the fix DOES hold for a bare capture (no marker/date/tag typed at capture); this test
    // proves, rather than asserts in prose, exactly where that coverage currently ends.
    const BEFORE = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2"].join("\n");
    const AFTER = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2", "- [ ] NEW ROW 🔢 0"].join("\n");
    const { page, elements, view } = await freshQueuePage("settle-known-gap-marker", BEFORE);

    await page.commitLine(view, { lineIndex: 3, text: "- [ ] NEW ROW 🔢 0", markdown: AFTER, source: BEFORE, kind: "insert-line" });
    paintProjection(page, view, AFTER);
    let texts = rowTexts(elements.get("viewBody"));
    assert.ok(texts.findIndex((t) => t.includes("NEW ROW")) < texts.findIndex((t) => t.includes("[[qntm:1]]")), "precondition: the optimistic paint sorts it first, exactly as §2 does");

    // THE ENGINE STAMPS IT, INSERTED before the existing marker — `_field_expression_cells`'s own
    // composition order, not a fixture invented for this test.
    const STAMPED = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2", "- [ ] NEW ROW [[qntm:9]] 🔢 0"].join("\n");
    paintProjection(page, view, STAMPED);

    // THE GAP, PROVEN: the placement does NOT survive, and the row falls back to plain (unsorted)
    // file order — the exact regression this whole change exists to end, for this one shape only.
    assert.equal(page.__settle().take(STAMPED, view.id), null, "KNOWN GAP: a marker-bearing capture's placement is still discarded on stamp arrival");
    texts = rowTexts(elements.get("viewBody"));
    const newAt = texts.findIndex((t) => t.includes("NEW ROW"));
    const aAt = texts.findIndex((t) => t.includes("[[qntm:1]]"));
    assert.ok(newAt > aAt, "KNOWN GAP: the row is shown back in its unsorted, as-typed position once stamped");
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
    assert.equal(
      page.__settle().take(p.body.markdown, "demo"),
      null,
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

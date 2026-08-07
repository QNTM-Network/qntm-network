/**
 * `j`/`k`/`gg`/`G` MUST MOVE THROUGH THE ROWS AS THEY ARE ACTUALLY PAINTED, NOT THROUGH THE
 * FILE'S OWN LINE NUMBERS — driven through the real page, the real resolver walk, the real DOM.
 *
 *   node --test tests/app-vim-visual-order.test.mjs
 *
 * ── THE OPERATOR'S OWN WORDS ──
 *
 * "hovering over it still shows the old random order. Also selecting up and down sort of has the
 * old placed order, not the resolved post-ordering-rules order. So there is general lack of
 * alignment between DOM, post-rule placement, etc, with some legacy state."
 *
 * ── THE MECHANISM, MEASURED RATHER THAN GUESSED ──
 *
 * `app/present/arrange/ordering.ts`'s `orderingPlacementFor` decides where an edited row now
 * belongs; `app/present/resolvers/ordering.ts`'s `arm` arms that placement on `SettleSurface`;
 * `app/present/paint.ts`'s `settleRow` moves the ONE row's DOM ELEMENT via `insertBefore`. That
 * move is COSMETIC ONLY — it repositions the element in `#viewBody`, and it never touches
 * `source`, the string every line index still addresses. So the moment a settle has fired even
 * once for a view, "line index N" and "the row painted Nth" are two different claims, and only
 * one of them — the DOM's own current child order — is what the operator is looking at.
 *
 * `app/index.html`'s global `keydown` handler computes `j`/`k`/`gg`/`G`'s target with
 * `current = focus.lineIndex ?? 0` and `lastIndex = source.split("\n").length - 1`, then hands
 * both straight to `app/present/motions.ts`'s `ModeSurface.handleKey`, which returns
 * `current +/- pending`, clamped. That is arithmetic on the FILE's own line numbering — the
 * exact representation the paragraph above shows has drifted from the screen. It is not a second
 * BUG so much as the one place this codebase's third-oldest assumption (line index == screen
 * position) was never updated the day an optimistic, DOM-only reorder became possible.
 *
 * ── WHAT THIS TEST DRIVES ──
 *
 * A three-row DECLARED `queue_position` section — the same shape
 * `tests/app-settle-wiring.test.mjs` §1/§3 already prove settles correctly — edited so the LAST
 * row (file line 3, "c") now sorts FIRST. `commitLine` arms and applies that placement
 * synchronously (§5 of that file proves the motion runs in the same turn as the keystroke), so
 * immediately after the edit `#viewBody` paints, in order: the heading, "c", "a", "b" — while
 * `source` itself still reads heading(0), a(1), b(2), c(3), because nothing about `settleRow`
 * ever edits the string.
 *
 * From the heading, `j` must select the row painted immediately below it — "c", file line 3.
 * Computed from the file's own numbering, `j` lands on file line 1 ("a") instead: the SECOND
 * row visually, not the first. That mismatch is the whole of the operator's report.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { importPage, installBrowser, makeEvent, makeWorkDir, walk } from "./fixtures/app-html-page.mjs";

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

/** Every non-blank painted row's own visible text, in the DOM's CURRENT order — the same reader
 * `app-settle-wiring.test.mjs` uses to prove a row physically relocated. */
function rowTexts(body) {
  return walk(body)
    .filter((el) => el.tagName === "label" || (el.tagName === "div" && String(el.className).includes("rawline")) || /^h[2-6]$/.test(el.tagName))
    .map((el) => {
      const spans = walk(el).filter((e) => e.tagName === "span");
      if (spans.length > 0) return spans.map((s) => s.innerHTML || s.textContent || "").join("");
      return el.innerHTML || el.textContent || "";
    });
}

describe("j/k select through the DOM's resolved order, not the file's own line numbers", () => {
  test("after an optimistic reorder, j from the heading selects the row painted immediately below it", async () => {
    const BEFORE = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2", "- [ ] c [[qntm:3]] 🔢 3"].join("\n");
    // "c" (file line 3) is edited to sort FIRST — a real placement is armed moving it before "a".
    const AFTER = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2", "- [ ] c [[qntm:3]] 🔢 0"].join("\n");
    const view = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: BEFORE };

    const { elements, document: doc } = installBrowser();
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handle: "luke",
          pending_edits: 0,
          snapshot: { generated_at: "2026-08-07T00:00:00Z", views: [{ ...view, markdown: body.markdown }] },
        }),
      };
    };
    const page = await importPage(makeWorkDir("vim-visual-order"));
    page.__applyPresentation(QUEUE_DECLARATION);
    page.__setGraphData({ snapshot: { generated_at: "2026-08-07T00:00:00Z", views: [view] } });
    page.paintView("demo");
    const press = (key) => doc.dispatch("keydown", makeEvent({ key }));

    // Edit "c" (file line 3) to sort first — the real registry walk, the real settle arm.
    await page.commitLine(view, {
      lineIndex: 3,
      text: "- [ ] c [[qntm:3]] 🔢 0",
      markdown: AFTER,
      source: BEFORE,
      kind: "set-line",
    });

    // PRECONDITION: the optimistic settle really did relocate "c" ahead of "a"/"b" in the DOM —
    // `source`'s own line order is untouched (still a, b, c) the whole time.
    const body = elements.get("viewBody");
    const painted = rowTexts(body);
    const headingAt = painted.findIndex((t) => t.includes("Queue"));
    const cAt = painted.findIndex((t) => t.includes("[[qntm:3]]"));
    const aAt = painted.findIndex((t) => t.includes("[[qntm:1]]"));
    assert.ok(
      headingAt !== -1 && cAt !== -1 && aAt !== -1 && headingAt < cAt && cAt < aAt,
      `precondition: expected the heading, then "c", then "a" in DOM order, got: ${JSON.stringify(painted)}`,
    );

    // THE ASSERTION: from the heading (file line 0), `j` must select the row now painted
    // immediately below it — "c", file line 3 — not file line 1 ("a"), which is only the file's
    // own next line number and, since the settle above, no longer the next PAINTED row.
    press("g");
    press("g");
    assert.equal(page.__focusIndex(), 0, "gg must land on the heading");
    press("j");
    assert.equal(
      page.__focusIndex(),
      3,
      `"j" from the heading must select "c" (file line 3, the row painted immediately below the ` +
        `heading after the optimistic reorder) — got file line ${page.__focusIndex()} instead, ` +
        `which is the FILE's next line number, not the DOM's`,
    );
  });
});

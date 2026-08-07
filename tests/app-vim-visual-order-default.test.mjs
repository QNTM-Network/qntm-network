/**
 * `j`/`k`/`gg`/`G` (and now `ArrowUp`/`ArrowDown`) MUST MOVE THROUGH THE ROWS AS THEY ARE ACTUALLY
 * PAINTED FOR AN UNDECLARED SECTION TOO — driven through the real page, the real resolver walk,
 * the real DOM. This is the sibling `app-vim-visual-order.test.mjs` never had.
 *
 *   node --test tests/app-vim-visual-order-default.test.mjs
 *
 * ── WHY THIS FILE EXISTS, SEPARATELY FROM `app-vim-visual-order.test.mjs` ──
 *
 * `app-vim-visual-order.test.mjs` proves `j` selects through the DOM's resolved order rather than
 * the file's own line numbers — for a section that DECLARES `ordering: [{ field: "queue_position" }]`.
 * That test drives `app/present/resolvers/ordering.ts`'s `read`/`arm` down the `orderingFor`/
 * `orderingPlacementFor` branch (`app/present/arrange/ordering.ts`).
 *
 * `resolvers/ordering.ts`'s own header (2026-08-06 entry) states plainly that an UNDECLARED
 * section — "most of his vault", the engine's own words — routes through `defaultOrderingFor`/
 * `defaultOrderingPlacementFor` instead: a STRUCTURALLY SEPARATE comparator
 * (`compareDefaultTuples`, not `compareTuples`) reached by the SAME dispatcher
 * (`resolveOrderingFor`/`resolveOrderingPlacementFor`) but never exercised by the declared-path
 * test above. That file's own history records TWO PRIOR INCIDENTS (2026-08-06, 2026-08-07) that
 * were DEFAULT-PATH-ONLY and that the declared-path suite did not catch — a real precedent for two
 * implementations of "which row does this line now sit before" silently drifting apart.
 *
 * `tests/app-settle-wiring.test.mjs`'s "ENGINE DEFAULT ordering" test already proves the DOM
 * PHYSICALLY MOVES for the default path (`rowTexts` before/after `o`+type+blur). It never presses
 * `j`/`k`/Arrow afterward and never reads `page.__focusIndex()` — so nothing yet proves the
 * SELECTION half (`visualLineOrder`, read by `app/index.html`'s global `keydown` handler) actually
 * walks that reordered DOM correctly for a row the DEFAULT comparator, not the declared one, moved.
 * This file is that missing proof, mirroring `app-vim-visual-order.test.mjs` exactly except for the
 * declaration (no `ordering:` entry for the section — `defaultOrdering` by `title`, ascending,
 * codepoint order — the exact shape `app-settle-wiring.test.mjs`'s default-path test already uses).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { importPage, installBrowser, makeEvent, makeWorkDir, walk } from "./fixtures/app-html-page.mjs";

// SAME SHAPE `app-settle-wiring.test.mjs`'s "ENGINE DEFAULT ordering" test uses: `ordering: {}` —
// no entry for `demo`/`queue` at all — which is exactly what makes `resolveOrderingFor`/
// `resolveOrderingPlacementFor`'s dispatcher (`ordering[viewId]?.[sectionId] !== undefined`) route
// to `defaultOrderingFor`/`defaultOrderingPlacementFor` rather than `orderingFor`/
// `orderingPlacementFor`.
const DEFAULT_DECLARATION = {
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
    ordering: {}, // UNDECLARED — the exact shape "most of his vault" has, per resolvers/ordering.ts's own header
    orderingFields: {},
    defaultOrdering: [{ field: "title", direction: "asc" }],
    priorityRank: {},
    dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
  },
};

/** Every non-blank painted row's own visible text, in the DOM's CURRENT order — the same reader
 * `app-vim-visual-order.test.mjs` and `app-settle-wiring.test.mjs` both use. */
function rowTexts(body) {
  return walk(body)
    .filter((el) => el.tagName === "label" || (el.tagName === "div" && String(el.className).includes("rawline")) || /^h[2-6]$/.test(el.tagName))
    .map((el) => {
      const spans = walk(el).filter((e) => e.tagName === "span");
      if (spans.length > 0) return spans.map((s) => s.innerHTML || s.textContent || "").join("");
      return el.innerHTML || el.textContent || "";
    });
}

describe("j/k/Arrow select through the DOM's resolved order for the DEFAULT (undeclared-section) ordering path too", () => {
  test("after an optimistic default-path reorder, j from the heading selects the row painted immediately below it", async () => {
    // File order: Bbb(1), Ccc(2), Ddd(3) — alphabetical, so BEFORE the edit the file's own line
    // order and the title-ascending default order agree, exactly as the declared-path test's
    // starting fixture does.
    const BEFORE = ["## Queue", "- [ ] Bbb [[qntm:1]]", "- [ ] Ccc [[qntm:2]]", "- [ ] Ddd [[qntm:3]]"].join("\n");
    // "Ddd" (file line 3) is retitled "Aaa sorts first" — alphabetically FIRST — a real placement
    // is armed by the DEFAULT comparator, moving it before "Bbb".
    const AFTER = ["## Queue", "- [ ] Bbb [[qntm:1]]", "- [ ] Ccc [[qntm:2]]", "- [ ] Aaa sorts first [[qntm:3]]"].join("\n");
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
    const page = await importPage(makeWorkDir("vim-visual-order-default"));
    page.__applyPresentation(DEFAULT_DECLARATION);
    page.__setGraphData({ snapshot: { generated_at: "2026-08-07T00:00:00Z", views: [view] } });
    page.paintView("demo");
    const press = (key) => doc.dispatch("keydown", makeEvent({ key }));

    // Edit "Ddd" (file line 3) to sort first — the real registry walk, the real DEFAULT-path
    // settle arm (`defaultOrderingPlacementFor`, not `orderingPlacementFor`).
    await page.commitLine(view, {
      lineIndex: 3,
      text: "- [ ] Aaa sorts first [[qntm:3]]",
      markdown: AFTER,
      source: BEFORE,
      kind: "set-line",
    });

    // PRECONDITION: the optimistic settle really did relocate "Aaa sorts first" ahead of
    // "Bbb"/"Ccc" in the DOM — `source`'s own line order is untouched (still Bbb, Ccc, Aaa) the
    // whole time. This is the DEFAULT-path twin of `app-settle-wiring.test.mjs`'s own DOM-order
    // assertion, driven the identical way.
    const body = elements.get("viewBody");
    const painted = rowTexts(body);
    const headingAt = painted.findIndex((t) => t.includes("Queue"));
    const aaaAt = painted.findIndex((t) => t.includes("[[qntm:3]]"));
    const bbbAt = painted.findIndex((t) => t.includes("[[qntm:1]]"));
    assert.ok(
      headingAt !== -1 && aaaAt !== -1 && bbbAt !== -1 && headingAt < aaaAt && aaaAt < bbbAt,
      `precondition: expected the heading, then "Aaa sorts first", then "Bbb" in DOM order, got: ${JSON.stringify(painted)}`,
    );

    // THE ASSERTION: from the heading (file line 0), `j` must select the row now painted
    // immediately below it — "Aaa sorts first", file line 3 — not file line 1 ("Bbb"), which is
    // only the file's own next line number and, since the DEFAULT-path settle above, no longer the
    // next PAINTED row.
    press("g");
    press("g");
    assert.equal(page.__focusIndex(), 0, "gg must land on the heading");
    press("j");
    assert.equal(
      page.__focusIndex(),
      3,
      `"j" from the heading must select "Aaa sorts first" (file line 3, the row painted immediately ` +
        `below the heading after the DEFAULT-path optimistic reorder) — got file line ` +
        `${page.__focusIndex()} instead, which is the FILE's next line number, not the DOM's`,
    );

    // THE SAME PROOF AGAIN, THROUGH `ArrowDown` — the operator's actual gesture, not the vim
    // alias. `gg` has no Arrow equivalent (it is a two-key vim binding with no ANSI arrow analogue,
    // and the operator's own words name only "up and down"), so this presses `k` back to the
    // heading through the vim binding, then repeats the descent with `ArrowDown`.
    press("k");
    assert.equal(page.__focusIndex(), 0, "k back to the heading");
    press("ArrowDown");
    assert.equal(
      page.__focusIndex(),
      3,
      `ArrowDown from the heading must select "Aaa sorts first" (file line 3) exactly as "j" does — ` +
        `got file line ${page.__focusIndex()} instead`,
    );
  });
});

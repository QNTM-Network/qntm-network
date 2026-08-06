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
 * ── TWO SECTIONS ──
 *
 *   1. THE WIN, DRIVEN END TO END — `o`, type a row that must sort first, blur. The mechanism this
 *      whole capability rests on (resolver → arm → paint → FLIP) is proven live, through the real
 *      page, for both a DECLARED ordering (`queue_position`) and the ENGINE DEFAULT ordering
 *      (`title`, undeclared section — his real inbox's own shape).
 *   2. THE HAZARD, DEMONSTRATED — `SettleSurface`, unlike `PredictSurface`, has no reconciliation
 *      branch: the instant a later-arriving projection's text differs from `commit.markdown` by
 *      ANYTHING at all (an engine-minted `[[qntm:N]]` stamp is the commonest cause, and it is
 *      near-certain on a capture), the placement is discarded in silence and the row falls back to
 *      plain file order — even when nothing about its correct position has actually been
 *      contradicted. `PredictSurface.take` is shown, on the identical kind of event, explicitly
 *      checking whether its claim survived; `SettleSurface.take` is shown not checking at all. This
 *      is the shape of the defect the diagnosis names, demonstrated in-repo rather than asserted.
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
// 2. THE HAZARD, DEMONSTRATED — SettleSurface has no reconciliation branch, unlike PredictSurface
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. THE HAZARD — a still-correct placement is silently dropped the instant ANY later text differs, with nothing standing in for it", () => {
  test("SettleSurface.take: a source differing ONLY by an appended stamp (order otherwise unchanged) returns null, not a reconciled answer", async () => {
    const { SettleSurface } = await import("../dist/present.js");
    const settle = new SettleSurface();
    const armedAgainst = "## Queue\n- [ ] NEW ROW [[qntm:9]] 🔢 0\n- [ ] a [[qntm:1]] 🔢 1\n- [ ] b [[qntm:2]] 🔢 2";
    settle.arm(armedAgainst, "demo", { lineIndex: 1, beforeLineIndex: 2 });

    // The engine's OWN next answer, differing from what was armed by nothing but a minted node id —
    // the row's ACTUAL order (still first) is unchanged, and the browser cannot tell that from a
    // genuine reorder using this surface alone.
    const arrivedStillCorrectOrder = "## Queue\n- [ ] NEW ROW [[qntm:8]] [[qntm:9]] 🔢 0\n- [ ] a [[qntm:1]] 🔢 1\n- [ ] b [[qntm:2]] 🔢 2";
    const instruction = settle.take(arrivedStillCorrectOrder, "demo");

    // THIS IS THE HAZARD, PROVEN RATHER THAN ASSUMED: a placement whose underlying claim (this row
    // sorts first) is STILL true is thrown away because the string is not byte-identical, and
    // nothing here re-establishes it. `paint()` falls back to plain file order for this repaint —
    // which, in this fixture, still happens to be correct (the row IS still first in file order),
    // but SettleSurface itself does not know that and offers no motion, no confirmation, nothing.
    assert.equal(instruction, null, "SettleSurface silently drops a still-live claim on ANY source mismatch");
  });

  test("PredictSurface.take: the SAME kind of event — a later source differing from what was armed — is explicitly reconciled, not silently dropped", async () => {
    const { PredictSurface } = await import("../dist/present.js");
    const predict = new PredictSurface();
    const armedAgainst = "## Inbox\n- [ ] Write the launch note";
    predict.arm(armedAgainst, "inbox", [{ lineIndex: 1, text: "🆕 2026-08-05" }]);

    // The engine's answer differs (a stamp minted, the same shape SettleSurface's own hazard case
    // above uses) — and carries the predicted text, so this is the CONFIRMED case: silence, by
    // design, because paint.ts now sees the claim as ordinary content.
    const confirmed = "## Inbox\n- [ ] Write the launch note 🆕 2026-08-05";
    assert.equal(predict.take(confirmed, "inbox"), null, "confirmed: no chip, but this is DECIDED, not merely dropped");

    // Re-arm and prove the OTHER branch: a genuine contradiction is not silence either — it comes
    // back as an explicit, named `withdrawn` entry. THIS is the reconciliation SettleSurface lacks:
    // PredictSurface never just returns null on a mismatch without having asked "does my claim still
    // hold" first.
    predict.arm(armedAgainst, "inbox", [{ lineIndex: 1, text: "🆕 2026-08-05" }]);
    const contradicted = "## Inbox\n- [ ] Write the launch note #task";
    const instruction = predict.take(contradicted, "inbox");
    assert.notEqual(instruction, null, "PredictSurface answers a mismatch with a reconciled instruction, never bare null");
    assert.deepEqual(instruction.withdrawn, [{ lineIndex: 1, text: "🆕 2026-08-05" }]);
  });
});

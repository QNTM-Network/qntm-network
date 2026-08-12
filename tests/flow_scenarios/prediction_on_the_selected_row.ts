/**
 * prediction_on_the_selected_row — A PREDICTION FOR THE ROW THE CURSOR IS ON CAN NEVER SWAP.
 *
 * A DELIBERATE RED. It FAILs on unmodified main and is expected to keep failing until the operator
 * decides what a prediction on the selected row should do. Do not loosen it to fit an
 * implementation.
 *
 * ── WHAT WAS MEASURED, 2026-08-12 ──
 *
 * The operator reported `#outcome` APPENDED to his line rather than swapped in place. The
 * `rule-effect-shown` sink (#168) named three ways an append can happen. Driving his shape through
 * the real page wiring settled which:
 *
 *   HYPOTHESIS REFUTED — THE STAMP. Every fixture in this repo covers a FRESH capture, and his line
 *   is a stamped, round-tripped node, so the stamp looked like the difference. It is not. A stamped
 *   parent renders and swaps exactly like a bare one:
 *     `- [ ] Ship the launch note [[qntm:501]] #task`  ->  `... [[qntm:501]] #outcome`, in place.
 *
 *   REPRODUCED — CONDITION 2, THE ROW IS NOT PREDICTABLE. `paint.ts`'s row builder gives the row the
 *   vim cursor is on a block-cursor rendition and RETURNS EARLY (see the `mode.mode === "NORMAL" &&
 *   focus.isFocused(lineIndex)` branch): it is added to `rowsByLineIndex` and never to
 *   `predictableByLineIndex`. `landPrediction` therefore receives `predictable === undefined` for
 *   that row, cannot call `replacePredictedSwap` at all, and appends — with a correct `fullText` in
 *   hand and a fully wired tag rendition. Measured: the chip lands as a separate ELEMENT rather than
 *   embedded in the row's own rendered HTML, which is the append path's own signature.
 *
 *   ALSO REPRODUCED, AND NOT PINNED HERE — CONDITION 3. When the row's resolved tags rendition is
 *   not `wired`, `renderTokens` emits no `.tagchip` markup, `replacePredictedSwap` cannot find the
 *   delta's chip (`chipIndex === -1`), and it refuses. That one is CONFIG-DEPENDENT — it is the
 *   resolution gap, and which rendition a row resolves to is the operator's own declaration to make.
 *   This scenario pins the condition that has NO config dependency.
 *
 * ── WHY THIS IS A DEFECT AND NOT A COVERAGE GAP ──
 *
 * The two are named apart deliberately. That every fixture is a fresh capture is a COVERAGE GAP and
 * cost nothing here — the stamped case works. That a prediction for the selected row silently
 * degrades to an append is a DEFECT: it is unreachable by any configuration, it produces exactly the
 * symptom the operator reported, and nothing anywhere says it happened. `landPrediction` returns
 * void and reports no reason; a reader sees an append and cannot tell it from an append-only claim.
 *
 * ── WHAT IS ASSERTED ──
 *
 * That a prediction carrying `fullText` for a row reaches the swap. Nothing about WHERE the cursor
 * should be, and nothing about what the fix should be — a selected row could be made predictable, or
 * the swap could be taught to rebuild a block-cursor row, or a prediction on the selected row could
 * be deliberately suppressed. Those are three different products and the operator has chosen none.
 */

import { FocusSurface } from "../../app/present/focus.js";
import { ModeSurface } from "../../app/present/motions.js";
import { PresentationContext } from "../../app/present/context.js";
import { paint } from "../../app/present/paint.js";

const LINE = "- [ ] Ship the launch note [[qntm:501]] #task";
const SWAPPED = "- [ ] Ship the launch note [[qntm:501]] #outcome";
const SOURCE = ["## Capture", LINE].join("\n");
const LINE_INDEX = 1;

export function run(): void {
  assertAPredictionOnTheSelectedRowCanSwap();
}

function assertAPredictionOnTheSelectedRowCanSwap(): void {
  const focus = new FocusSurface();
  const mode = new ModeSurface();
  const body = stubBody();

  // THE CURSOR IS ON THE ROW THE PREDICTION IS FOR. This is the whole precondition, and it is an
  // ordinary state: the operator's cursor is somewhere, and a rule can fire for the line it is on.
  focus.focus(LINE_INDEX, SOURCE, "");

  paint(body, SOURCE, new PresentationContext(), {
    markdown: markdownStub(),
    focus,
    mode,
    predict: takeOnce({
      predictions: [{ lineIndex: LINE_INDEX, text: "#outcome", fullText: SWAPPED }],
      withdrawn: [],
      animate: false,
    }),
  } as never);

  const embedded = collectHtml(body).join("");
  const separate = countPredictionElements(body);

  // A SWAP writes the chip INTO the row's own rendered markup. An append hangs a separate element
  // off the row. That difference is the two branches' own signature and needs no access to either.
  const swapped = embedded.includes("row-prediction") && embedded.includes("#outcome");
  if (!swapped) {
    throw new Error(
      "A PREDICTION FOR THE ROW THE CURSOR IS ON CAN NEVER SWAP. " +
        `The prediction carried fullText ${JSON.stringify(SWAPPED)} and the row was painted, but ` +
        `the claim landed as ${separate} separate appended element(s) rather than in the row's own ` +
        "rendered markup. `paint.ts`'s row builder returns EARLY for the selected row in NORMAL — " +
        "it is added to `rowsByLineIndex` and never to `predictableByLineIndex` — so " +
        "`landPrediction` gets `predictable === undefined`, cannot reach `replacePredictedSwap`, " +
        "and appends. The stale `#task` stays on the line beside the new `#outcome`, which is the " +
        "operator's own report. THIS IS A DELIBERATE PIN — the fix is a design decision he has " +
        "not made; do not loosen this assertion to make it pass.",
    );
  }
}

/** A `PredictSurface` that answers once, then nothing — the shape `paint` calls `take()` on. */
function takeOnce(instruction: unknown): unknown {
  let given = false;
  return {
    take: (): unknown => {
      if (given) return null;
      given = true;
      return instruction;
    },
  };
}

function markdownStub(): unknown {
  return { render: (m: string) => m, renderInline: (m: string) => m };
}

function collectHtml(node: unknown, out: string[] = []): string[] {
  const el = node as { innerHTML?: unknown; children?: unknown[] };
  if (typeof el.innerHTML === "string") out.push(el.innerHTML);
  for (const kid of el.children ?? []) collectHtml(kid, out);
  return out;
}

function countPredictionElements(node: unknown, seen = { n: 0 }): number {
  const el = node as { className?: unknown; children?: unknown[] };
  if (String(el.className ?? "").split(/\s+/).includes("row-prediction")) seen.n += 1;
  for (const kid of el.children ?? []) countPredictionElements(kid, seen);
  return seen.n;
}

/** The minimum `paint` writes into, over a stub document. */
function stubBody(): HTMLElement {
  const make = (tagName = "div"): Record<string, unknown> => {
    const el: Record<string, unknown> = {
      tagName, type: "", value: "", className: "", selectionStart: -1,
      children: [] as unknown[], dataset: {}, style: {}, innerHTML: "", textContent: "",
      listeners: new Map<string, ((e: unknown) => void)[]>(),
      append(...kids: unknown[]) { (el.children as unknown[]).push(...kids); },
      appendChild(kid: unknown) { (el.children as unknown[]).push(kid); return kid; },
      addEventListener(t: string, fn: (e: unknown) => void) {
        const m = el.listeners as Map<string, ((e: unknown) => void)[]>;
        m.set(t, [...(m.get(t) ?? []), fn]);
      },
      setAttribute() {}, removeAttribute() {}, focus() {},
      setSelectionRange(a: number) { el.selectionStart = a; },
      remove() {}, contains() { return false; }, querySelector() { return null; },
      querySelectorAll() { return []; }, closest() { return null; }, getAttribute() { return null; },
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    };
    return el;
  };
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (t: string) => make(t),
    createTextNode: () => make("#text"),
    querySelector: () => null,
  };
  return make("div") as unknown as HTMLElement;
}

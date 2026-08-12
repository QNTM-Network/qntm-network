/**
 * rule_effect_lands — DRIVES A RULE EFFECT ALL THE WAY TO THE SCREEN, so the `rule-effect-shown`
 * sink has observed chains instead of none.
 *
 * ── THE GAP THIS CLOSES ──
 *
 * `rule-effect-shown` (`app/present/paint:landPrediction`) was declared in #168 and shipped
 * UNGOVERNED, on purpose: `canonical-routing` reported `chains_observed: 0`, so any class declared
 * over it would have produced a verdict computed from an empty set. That is the same shape that let
 * this repo's routing checks pass vacuously for their whole existence before 2026-08-07. A sink
 * nothing drives is declared, not observed, and the two are not the same thing.
 *
 * This scenario is the drive. It is also the CONFIRMATION of the operator's own report, which is
 * why it asserts the two cases as a PAIR rather than one:
 *
 *   "the parent shows #outcome — it does swap correctly. i move the cursor up onto the parent row —
 *    it reverts to the old state. it's actually just the hover front-running state that's wrong."
 *
 * ── WHAT IT ESTABLISHES, AND IT IS ONE MECHANISM RATHER THAN TWO ──
 *
 * Reported as two symptoms — a stale tag sitting BESIDE a new one (the earlier reproduction) and
 * the row REVERTING to its old state when the cursor lands on it (his own) — and they are the same
 * branch seen at two moments. `paint.ts`'s row builder draws the row under the vim cursor with a
 * block-cursor rendition and returns BEFORE `predictableByLineIndex.set`, so:
 *
 *   cursor OFF the row  the row is predictable, `replacePredictedSwap` rewrites its markup in
 *                       place, and the swap is what the operator sees.
 *   cursor ON the row   the row is not predictable, `landPrediction` cannot reach the swap, and it
 *                       appends the delta beside the row's own SETTLED content — which still says
 *                       `#task`. From the operator's seat that reads as "it reverted", because the
 *                       old text is back on screen; from the DOM's seat it is an append next to
 *                       stale content. One cause, two descriptions.
 *
 * The distinction is now READ rather than inferred: `landPrediction` stamps its own reason on the
 * row (`data-prediction-landing`), so this scenario asserts the REASON, not a shape it deduced from
 * the markup afterwards. Every earlier attempt at this question inferred from the DOM and several
 * of those inferences were wrong while being consistent with what they saw.
 *
 * ── WHAT IS STUBBED ──
 *
 * Nothing under `app/` — the real `paint`, `FocusSurface`, `ModeSurface` and `PresentationContext`
 * run. What is replaced is the document, because node has none.
 */

import { FocusSurface } from "../../app/present/focus.js";
import { ModeSurface } from "../../app/present/motions.js";
import { PresentationContext } from "../../app/present/context.js";
import { paint } from "../../app/present/paint.js";

const LINE = "- [ ] Ship the launch note [[qntm:501]] #task";
const SWAPPED = "- [ ] Ship the launch note [[qntm:501]] #outcome";
const SOURCE = ["## Capture", LINE].join("\n");
const ROW = 1;

export function run(): void {
  // The cursor is somewhere ELSE — the ordinary case, and the one that works.
  const off = landingFor({ cursorOnTheRow: false });
  if (off !== "swapped") {
    throw new Error(
      `with the cursor OFF the row, the rule effect must land as a SWAP — got ${JSON.stringify(off)}`,
    );
  }

  // The cursor is ON the row the rule fired for — the operator's own report.
  const on = landingFor({ cursorOnTheRow: true });
  if (on !== "appended:row-not-predictable") {
    throw new Error(
      "with the cursor ON the row, the rule effect must be observed landing as an append for the " +
        `REASON \`row-not-predictable\` — got ${JSON.stringify(on)}. This scenario OBSERVES that ` +
        "defect (pinned separately as `a-prediction-on-the-selected-row-can-never-swap`); a " +
        "different reason here means the cause moved and the pin is measuring the wrong thing.",
    );
  }
}

/** Paint one row with one prediction and read the reason the landing stamped on it. */
function landingFor(opts: { cursorOnTheRow: boolean }): string | undefined {
  const focus = new FocusSurface();
  const mode = new ModeSurface();
  const body = stubBody();

  // `isFocused(ROW)` is the whole difference between the two cases.
  focus.focus(opts.cursorOnTheRow ? ROW : 0, SOURCE, "");

  // TAGS WIRED AT THE GLOBAL LEVEL — the same value the operator's own presentation.json publishes
  // (`tags: "wired"`). Without it the cascade floor is `raw`, no `.tagchip` markup is rendered, and
  // `replacePredictedSwap` refuses for a DIFFERENT reason (`swap-refused`) — which is exactly what
  // this scenario observed on its first run, and exactly the distinction the new diagnostic exists
  // to make legible. Left uncommented here so nobody "fixes" it back to a bare context.
  paint(body, SOURCE, new PresentationContext({ GLOBAL: { tags: "wired" } as never }), {
    markdown: markdownStub(),
    focus,
    mode,
    predict: takeOnce({
      predictions: [{ lineIndex: ROW, text: "#outcome", fullText: SWAPPED }],
      withdrawn: [],
      animate: false,
    }),
  } as never);

  return stampedReason(body);
}

/** The `data-prediction-landing` the sink wrote, wherever in the tree the row ended up. */
function stampedReason(node: unknown): string | undefined {
  const el = node as { dataset?: Record<string, string>; children?: unknown[] };
  const own = el.dataset?.["predictionLanding"];
  if (own !== undefined) return own;
  for (const kid of el.children ?? []) {
    const found = stampedReason(kid);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** A `PredictSurface` that answers once — the shape `paint` calls `take()` on. */
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

/** The minimum `paint` writes into, over a stub document. */
function stubBody(): HTMLElement {
  const make = (tagName = "div"): Record<string, unknown> => {
    const el: Record<string, unknown> = {
      tagName, type: "", value: "", className: "", selectionStart: -1,
      children: [] as unknown[], dataset: {} as Record<string, string>, style: {},
      innerHTML: "", textContent: "",
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

/**
 * THE LANDING — a rule's decision reaching the screen, and the one place that says why.
 *
 * ── WHY THIS IS ITS OWN MODULE, AND IT IS NOT TIDINESS ──
 *
 * `rule-effect-shown` was declared in #168 against `app/present/paint:landPrediction` while that
 * function lived inside `paint.ts`, and `canonical-routing` reported `chains_observed: 0` even with
 * a scenario driving it directly. Exporting it changed nothing. The cause is structural: the
 * observer wraps a module's EXPORT BINDINGS, so a call from `paint` to a function defined in the
 * same file never crosses a boundary it can see. `placeCaret` is observable for exactly the
 * complementary reason — it was extracted into `caret.ts`, so every call to it is a cross-module
 * call.
 *
 * SO A SINK MUST LIVE IN ITS OWN MODULE TO BE OBSERVABLE AT ALL. That is a general fact about this
 * project's instrumentation, not a fact about predictions, and it is worth stating here because a
 * correctly declared sink at a correctly named function can still measure nothing — silently, and
 * with a green `sinks` verdict, since `flow-trace sinks` checks that a canonical class EXISTS and
 * never that a chain was seen.
 */

import { appendPrediction, replacePredictedSwap } from "./paint.js";
import type { Rendition } from "./express/rendition.js";
import type { RowPrediction } from "./predict.js";

/**
 * WHICH BRANCH `landPrediction` TOOK, AND ON WHAT GROUNDS.
 *
 * The `rule-effect-shown` sink returned `void` until 2026-08-12, and the cost of that silence is
 * measurable: six different explanations for one appended `#outcome` were advanced and defended
 * over a day, and every one of them was consistent with what the DOM showed, because an append
 * from `no-full-text`, from `row-not-predictable` and from `swap-refused` are byte-identical on
 * screen. A sink that lands work three ways and reports none of them cannot be diagnosed, only
 * guessed at.
 *
 * THE THREE REASONS ARE NOT REDUNDANT WITH EACH OTHER:
 *   no-full-text        the claim was append-only. Every `resolvers/rules.ts` prediction, by
 *                       construction — it arms `text` and never `fullText`. Correct, not a defect.
 *   row-not-predictable the row was drawn without a rendition to rebuild from. The row under the
 *                       vim cursor is the live case (paint.ts's block-cursor branch returns before
 *                       `predictableByLineIndex.set`), which is
 *                       `a-prediction-on-the-selected-row-can-never-swap`.
 *   swap-refused        both preconditions held and `replacePredictedSwap` still declined — no
 *                       `.tagchip` markup to find for the delta, or a blank line. Config-dependent:
 *                       a row whose tags resolve to `raw`/`plain` renders no chip.
 */
export type PredictionLanding =
  | { readonly kind: "swapped" }
  | {
      readonly kind: "appended";
      readonly because: "no-full-text" | "row-not-predictable" | "swap-refused";
    };

/**
 * A RULE'S DECISION REACHING THE SCREEN — the terminal effect of a rule application.
 *
 * ── WHY THIS IS THE SINK, AND WHY `renderRuleEffects` IS NOT ──
 *
 * `renderRuleEffects` (rules.ts) computes characters and RETURNS them. It is the arithmetic, not
 * the landing: nothing a person can see has happened when it returns, and a caller is free to throw
 * the result away — `promotion.ts` does exactly that when the render abstains (`arm` returns
 * `ARMS_NOTHING` and no pixel changes). Declaring it the sink would repeat the mistake
 * `selection-moved` was declared with: a function that DECIDES, at the altitude of one that lands.
 * THIS is where a rule stops being a decision and becomes something the operator can see.
 *
 * ── THE ROUTES, COUNTED RATHER THAN ASSERTED (grep `surface: "predict"`) ──
 *
 * Exactly TWO surfaces arm a prediction, and both are rule applications. There is no third caller
 * and no non-rule prediction in this app:
 *   app/present/resolvers/rules.ts:209      the RULES axis, for the line just committed. Arms with
 *                                          `text` only and NO `fullText`, so it can only ever take
 *                                          the append branch below — never the swap.
 *   app/present/resolvers/promotion.ts:493  the PARENT-PROMOTION axis, for the row above. The only
 *                                          caller that supplies `fullText`, i.e. the only one that
 *                                          can reach the in-place swap at all.
 *
 * ── THE TWO SPELLINGS ARE ONE EFFECT, WHICH IS WHY THEY GET ONE HOME ──
 *
 * A swap shows the byte-exact predicted line in place; an append hangs the delta after the row's
 * settled content. The operator sees one thing either way — his rule, on his line — so the effect
 * is one, and the branch between them is a rendition decision rather than two different jobs.
 * Until this function they were an inline if/else inside `paint`, reachable by no observer and
 * countable by nobody, which is why "why did it append instead of swapping" has been answered
 * several times by reading and never once by measurement.
 *
 * ── THE THREE WAYS AN APPEND HAPPENS, AND ONLY ONE OF THEM IS VISIBLE FROM THE CALL SITE ──
 *
 *   1. NO `fullText` — an append-only claim. Every rules-axis prediction, by construction.
 *   2. THE ROW IS NOT PREDICTABLE — `predictableByLineIndex` holds no entry for it, so there is no
 *      rendition or render callback to rebuild the line from.
 *   3. `replacePredictedSwap` REFUSED — it rebuilt the line and could not find the delta's own chip
 *      in the rendered HTML (`chipIndex === -1`), or the line was blank. This one is invisible from
 *      the call site, and it is the reason this sink exists.
 *
 * It decides nothing about WHAT to show: `text` and `fullText` arrive already decided.
 */
export function landPrediction(
  el: HTMLElement,
  predictable:
    | {
        readonly contentEl: HTMLElement;
        readonly tagsRendition: Rendition;
        readonly stampRendition: Rendition;
        readonly render: (markdown: string) => string;
      }
    | undefined,
  prediction: RowPrediction,
  animate: boolean,
): PredictionLanding {
  // WHY IT LANDED THE WAY IT DID, DECIDED BEFORE ANYTHING IS DRAWN. Six wrong theories about the
  // operator's appended `#outcome` survived on this function's silence — three of them mine. The
  // branch was decidable all along; it was simply never stated, so every reader had to infer it
  // from the DOM afterwards and each inference was consistent with several causes at once.
  const because: "no-full-text" | "row-not-predictable" | undefined =
    prediction.fullText === undefined
      ? "no-full-text"
      : predictable === undefined
        ? "row-not-predictable"
        : undefined;

  const replaced =
    predictable !== undefined && prediction.fullText !== undefined
      ? replacePredictedSwap(predictable, prediction.fullText, prediction.text, "pending")
      : false;
  if (!replaced) {
    appendPrediction(el, prediction.text, "pending", animate);
  }

  // `swap-refused` is the one reason that cannot be decided in advance: it means `predictable` and
  // `fullText` were BOTH present and `replacePredictedSwap` still declined — it rebuilt the line
  // and could not find the delta's own chip in the rendered markup (`chipIndex === -1`), or the
  // line was blank. Distinguishing it from the two preconditions above is the whole point: they
  // look identical in the DOM and have completely different causes.
  const landing: PredictionLanding = replaced
    ? { kind: "swapped" }
    : { kind: "appended", because: because ?? "swap-refused" };

  // STAMPED ON THE ROW, WHICH IS WHAT MAKES IT AN OBSERVABLE FACT RATHER THAN A LOG. Same posture
  // as `data-instance` (see `stampInstance`): the DOM is where a claim about a row belongs, any
  // scenario or test can read it without new plumbing, and a browser session can be inspected after
  // the fact. Nothing in the app reads it — it exists so that "which branch fired, and why" is a
  // READING rather than an inference.
  el.dataset["predictionLanding"] = landing.kind === "swapped" ? "swapped" : `appended:${landing.because}`;
  return landing;
}

/**
 * predict — the one place a repaint may say "the browser believes the engine's next answer will
 * change THIS row," painted into that row rather than narrated only in a badge above the view.
 * PURE: no DOM, no fetch, no clock. `settle.ts`'s own sibling — read that module's header first,
 * because this one restates its shape on purpose rather than inventing a second one.
 *
 * ── THE SAME EVENT, TWICE — WHY ONE SURFACE SERVES BOTH PREDICTIONS ──
 *
 * `app/present/rules.ts`'s `stamp-created-at-on-task` and `app/present/graphmatch.ts`'s promotion
 * rules are two different computations, but what the browser DOES with either answer is the same
 * fact stated twice: "I expect this row to carry this text once the cycle catches up." One is about
 * the row just committed; the other is about the row ABOVE it. Both are claims, neither is settled
 * content, and both need to vanish the instant they stop being true. Building two decoration paths
 * would have meant two places that could each get "never write this to `commit.markdown`" right or
 * wrong independently — see `app/index.html`'s own PARENT PROMOTION block for why that invariant is
 * pinned across seven other test files and is not negotiable. One surface, one set of rules for
 * when a claim is shown, reconciled or withdrawn, used by both.
 *
 * ── WHY IT IS KEYED BY THE EXACT SOURCE STRING AND THE VIEW, LIKE `SettleSurface` ──
 *
 * A prediction is a claim about ONE version of the file, the same way a placement is: "once this
 * text reads the way it does right now, these rows carry these characters too." `take` compares the
 * exact string and view every time for the identical reason `SettleSurface.take` does — a stale
 * instruction cannot match again, by construction, so nothing has to remember to call a separate
 * `clear()` on the ordinary "nothing changed" repaint.
 *
 * ── WHERE THIS WIDENS PAST `SettleSurface`, AND WHY ──
 *
 * `SettleSurface` never says what became of a stale placement — it just stops matching, and the row
 * quietly stays where the FLIP arithmetic already put it (a description of the DOM, not of the
 * file, so there is nothing to contradict). A prediction is a claim about CHARACTERS that may or may
 * not actually appear once real content lands, and the operator's own principle governs it — "the
 * browser's first answer is a claim, not a fact" — so `take` here has a second, one-shot job: the
 * moment a NEW source arrives for the SAME view, it reconciles the claim ONCE against that source and
 * says which of its predictions turned out to be WITHDRAWN (their text is nowhere in the new source)
 * rather than leaving the operator to infer that from the chip simply not reappearing. A prediction
 * that IS found in the new source needs no separate announcement: it is no longer a claim, it is now
 * that row's own ordinary characters, rendered exactly like every other line — "becomes real content"
 * is silence, by design, the same way a settled row does not narrate its own arrival.
 *
 * THE RECONCILIATION IS A SUBSTRING CHECK OVER THE WHOLE NEW SOURCE, NOT A LINE-INDEXED ONE, and
 * that is a deliberate looseness rather than an oversight: ordering and settle can both relocate a
 * row between the moment a prediction is armed and the moment the real answer lands, so the row at
 * `lineIndex` in the NEW source is not provably the row the OLD source meant. Line-indexed addressing
 * is already how every other axis in this bundle (membership, ordering, rules) speaks about a row,
 * so it is not a new risk this module introduces — but the FIX (confirm/withdraw by node identity
 * rather than by position) is real, separately-scoped work this module does not attempt. What it
 * does instead is narrower and honest about it: "does this exact claim's text appear ANYWHERE in
 * what the engine actually sent back."
 *
 * ── ONE ARMED INSTRUCTION, THE SAME REASON `SettleSurface.arm` GIVES ──
 *
 * There is one cursor, and for the same reason there is one pending settle and one pending set of
 * predictions: a second commit before the first one's predictions have even reconciled describes a
 * NEWER state of the view, and the newer one is the only one worth keeping. `arm` always overwrites,
 * even with an EMPTY list — see `app/index.html`'s own `armPrediction` for why an empty arm still has
 * to happen on every commit rather than being skipped: leaving a stale, unrelated arm in place would
 * let a LATER, unrelated commit's own optimistic repaint reconcile it, reporting a real prediction as
 * "withdrawn" when nothing has actually contradicted it yet — a false accusation, not a lesser one.
 */

/** One row this paint believes will carry `text` once the engine's answer lands. */
export interface RowPrediction {
  /** The line index, IN THE SOURCE THIS WAS ARMED AGAINST, of the row the text belongs to. */
  readonly lineIndex: number;
  /** The characters expected to appear on that row — never posted, never written into `source`;
   * see `paint.ts`'s own consumption for the DOM-only shape this takes. */
  readonly text: string;
  /**
   * THE WHOLE LINE this row's own claim describes, when the claim is about a SWAP rather than a
   * bare addition — `RuleRenderOutcome.text` (rules.ts), already byte-identical to the engine's own
   * render for the SAME retype (`tests/retype-agreement.test.mjs`, exhaustive over the declared
   * node-type family). `undefined` for an ordinary append-only claim (`stamp-created-at-on-task`),
   * which has no "whole line" answer distinct from `text` itself appended.
   *
   * WHY THIS EXISTS: `text` alone tells a caller WHAT characters to show, never WHERE — `paint.ts`
   * used to always append it after a row's own SETTLED content, which is correct for a genuine
   * addition and wrong for a same-family swap (the operator's own report, 2026-08-07: "it added it
   * at end, not replaced task"). `fullText`, when present, is what `paint.ts` renders the row FROM
   * instead of the row's own literal source line — the operator sees the byte-exact predicted line
   * immediately, the SAME text a settle would eventually confirm, rather than stale content plus a
   * floating badge for the 14 seconds until the engine's own answer lands.
   */
  readonly fullText?: string;
}

/** A prediction reconciled against a NEW source and found nowhere in it — contradicted, not merely
 * stale. Same shape as `RowPrediction`; named separately because a caller must never confuse "still
 * pending" with "answered, and answered no." */
export interface WithdrawnPrediction {
  readonly lineIndex: number;
  readonly text: string;
}

/** What ONE `take()` call hands back. */
export interface PredictInstruction {
  /** Still-live claims to paint onto their rows — empty on the repaint that only reconciles. */
  readonly predictions: readonly RowPrediction[];
  /** Claims this repaint discovered were contradicted — empty on every OTHER repaint, including the
   * ordinary ones that merely keep showing a still-pending prediction. */
  readonly withdrawn: readonly WithdrawnPrediction[];
  /** `true` for exactly one `take()` per armed instruction (the entrance) and for the ONE repaint
   * that reports a withdrawal — every other repaint of a still-pending instruction gets `false`,
   * `settle.ts`'s own one-shot-motion precedent. */
  readonly animate: boolean;
}

export class PredictSurface {
  #source: string | null = null;
  #view = "";
  #predictions: readonly RowPrediction[] = [];
  #animated = false;

  /**
   * Arm a set of predictions, computed elsewhere, against the EXACT source they describe and the
   * view they belong to. Overwrites whatever was armed before, even an empty list — see this
   * class's own header for why an empty arm must still happen.
   */
  arm(source: string, view: string, predictions: readonly RowPrediction[]): void {
    this.#source = source;
    this.#view = view;
    this.#predictions = predictions;
    this.#animated = false;
  }

  /**
   * What THIS repaint of `source`/`view` should do.
   *
   *   `null` — nothing is armed for this view at all, or nothing is armed for this exact source and
   *   nothing was armed for this view either (there is nothing to show and nothing to reconcile).
   *
   *   `source` matches exactly — the armed predictions are still live; returns them, `animate` true
   *   only the first time.
   *
   *   `view` matches but `source` does not — the file this view shows has genuinely changed since
   *   the arm (the cycle answered, or the operator moved past this state some other way). Reconciled
   *   ONCE: every armed prediction whose text is not found anywhere in the new `source` comes back as
   *   `withdrawn`; the arm is then cleared, so this can never fire twice for the same claim. A
   *   prediction that WAS found reports nothing — see this class's own header for why silence is the
   *   right answer for "this came true".
   */
  take(source: string, view: string): PredictInstruction | null {
    if (this.#source === null || this.#view !== view) {
      return null;
    }
    if (this.#source === source) {
      if (this.#predictions.length === 0) {
        return null;
      }
      const animate = !this.#animated;
      this.#animated = true;
      return { predictions: this.#predictions, withdrawn: [], animate };
    }
    const armed = this.#predictions;
    this.#source = null;
    this.#view = "";
    this.#predictions = [];
    this.#animated = false;
    const withdrawn = armed.filter((prediction) => !source.includes(prediction.text));
    if (withdrawn.length === 0) {
      return null;
    }
    return { predictions: [], withdrawn, animate: true };
  }
}

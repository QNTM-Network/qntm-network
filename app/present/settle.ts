/**
 * settle — the one place a repaint may say "place this row where the browser predicts the engine
 * will," and the one place that admission is proven ONE-SHOT rather than replayed on every
 * incidental repaint. PURE: no DOM, no fetch, no clock. `docs/implementation-artifacts/roadmap-
 * the-road-ahead.md` step 3, and the operator's own words for what it must feel like: "not clunky
 * but intentional · moving deliberately in the background."
 *
 * ── WHAT THIS CLASS DOES, AND WHAT IT DELIBERATELY LEAVES TO ITS TWO NEIGHBOURS ──
 *
 * Three questions, three owners, exactly the split `focus.ts`/`motions.ts`/`paint.ts` already draw
 * for the cursor:
 *
 *   WHETHER a row should move, and to where — `app/present/ordering.ts`'s `orderingPlacementFor`.
 *     This class never computes a placement; it only HOLDS one that was already computed.
 *   HOW the motion looks — `paint.ts`, which owns every other DOM decision this bundle makes and
 *     is where the FLIP transform, the `--slide` timing token and the reduced-motion opt-out live.
 *   WHEN an armed placement is still live, and whether THIS repaint has already shown its motion —
 *     this class, and nothing else, because that fact has to survive from the repaint that armed
 *     it to however many incidental repaints follow (a `j`/`k`, a mode change) before the row's
 *     real position is confirmed or contradicted by the next thing the server sends.
 *
 * ── WHY IT IS KEYED BY THE EXACT SOURCE STRING AND THE VIEW, NOT CLEARED ON READ ──
 *
 * A placement is a claim about ONE version of the file: "once this text reads the way I predict,
 * this row belongs here." The moment `source` no longer matches — a second edit landed elsewhere,
 * a projection arrived with the engine's own answer, the operator changed views — the claim is
 * about a file that no longer exists on screen, and re-showing it would be a GUESS wearing the
 * clothes of a prediction. So `take` compares the exact string and the exact view id every time,
 * and answers `null` the instant either has moved on. Nothing has to remember to call a separate
 * `clear()`: a stale instruction cannot ever match again, by construction, the same way an
 * `InstanceAnchor` computed against a vanished projection cannot ever be found again by
 * `resolveInstanceAnchor`.
 *
 * THE CONVERSE IS THE POINT TOO. `paintView`'s ordinary internal repaints — `j`/`k`, entering
 * INSERT, the countless redraws one edit's own settlement causes before the cycle answers — all
 * paint the SAME `source` the placement was armed against, for as long as nothing new has
 * happened. Comparing by string rather than clearing after one use is what keeps the row in its
 * predicted spot across all of those, instead of snapping back to its old position the instant the
 * operator presses a motion key a moment after committing the edit that moved it.
 *
 * ── WHY THE ANIMATION FLAG IS SEPARATE FROM THE PLACEMENT ITSELF ──
 *
 * The row must relocate on EVERY one of those incidental repaints (otherwise it is not "placed" at
 * all, only placed once and then abandoned) but it must be SHOWN MOVING only on the first of them —
 * a slide that replayed on every keystroke would be the "clunky" half of the brief's own contrast,
 * not the "intentional" half. `take` therefore answers the position question every time and the
 * "should this be animated" question exactly once per armed instruction, consuming it on the way
 * out the same way `sentEdit`/`landedTokens`/`cursorNote` in `app/index.html` are read once and
 * cleared — this class is the same pattern, moved into `app/present/` because `paint.ts` needs it
 * on every repaint, not only the one immediately after a commit.
 */

/** WHERE a row belongs, in terms `paint.ts` can act on directly — see `orderingPlacementFor`
 * (ordering.ts) for how this is computed and why its answer is provably the engine's own. */
export interface RowPlacement {
  /** The line index (in the source this placement was armed against) of the row that is moving. */
  readonly lineIndex: number;
  /** The line index of the row it should now sit immediately BEFORE, or `null` for "last among
   * its section's ranked rows." */
  readonly beforeLineIndex: number | null;
}

/** What one `take()` call hands back — the placement, and whether THIS repaint is the one that
 * gets to show the motion. */
export interface SettleInstruction {
  readonly placement: RowPlacement;
  /** `true` for exactly one `take()` per armed instruction — the repaint that should play the
   * FLIP transform. Every other repaint of the same still-live instruction gets `false`: reposition
   * silently, because the operator has already seen this row admit it moved once. */
  readonly animate: boolean;
}

export class SettleSurface {
  #source: string | null = null;
  #view = "";
  #placement: RowPlacement | null = null;
  #animated = false;

  /**
   * Arm a placement, computed elsewhere, against the EXACT source it was computed from and the
   * view it belongs to. Overwrites whatever was armed before — there is one cursor and, for the
   * same reason, one pending settle: a second commit before the first one's motion has even shown
   * describes a NEWER prediction, and the newer one is the only one worth keeping.
   */
  arm(source: string, view: string, placement: RowPlacement): void {
    this.#source = source;
    this.#view = view;
    this.#placement = placement;
    this.#animated = false;
  }

  /**
   * What THIS repaint of `source`/`view` should do, or `null` when nothing is armed for this exact
   * pair — see this class's own header for why a mismatch needs no separate clearing.
   */
  take(source: string, view: string): SettleInstruction | null {
    if (this.#placement === null || this.#source !== source || this.#view !== view) {
      return null;
    }
    const animate = !this.#animated;
    this.#animated = true;
    return { placement: this.#placement, animate };
  }
}

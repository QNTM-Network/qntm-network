/**
 * DraftSurface — a line that is being made and is not in the file yet. PURE: no DOM, no clock.
 *
 * ── THE ONE DECISION THIS MODULE IS ──
 *
 * A new line is NOT written into the source when it is opened. It is held here, painted as an
 * empty row, and reaches `applyEdit` exactly once — at the moment it settles, carrying the
 * characters a person actually typed. Until then the source string is byte-for-byte the one the
 * server sent.
 *
 * That is not a tidiness preference; it is the only arrangement in which the feature cannot destroy
 * anything, and the alternative was tried on paper first. Writing the empty line into the source
 * immediately would mean:
 *
 *   1. the app is holding a source that differs from the vault's by a line nobody has committed, so
 *      the NEXT edit anywhere in the view — a checkbox tick three lines up — would POST that line
 *      as well, because the write unit is the whole file. Measured against a hermetic copy of the
 *      engine's starter bundle: an empty `- [ ] ` mints a node titled nothing, which then reprints
 *      itself into three sections across two views and stays there. One abandoned keystroke,
 *      permanent junk graph state.
 *   2. abandoning the line would need a DELETE affordance to undo it — a destructive edit added to
 *      the union in order to clean up after a constructive one.
 *
 * Held here instead, an abandoned draft costs nothing: it was never in the file, so dropping it is
 * not a deletion and needs no source edit at all. `applyEdit` gained ONE kind, not two.
 *
 * ── DERIVED, NOT DECLARED — THE SAME RULE AS THE FOCUS SURFACE, FOR THE SAME REASON ──
 *
 * "There is a line being made at index 4" is a fact about this moment. It has no declaration home
 * and must never grow one: a fact about the moment written into a file is a fact that outlives the
 * moment, which is the shape that makes a UI state machine drift from the UI. It is computed, held
 * across the repaints of one gesture, and thrown away.
 *
 * ── WHY IT IS NOT A SECOND FIELD ON `FocusSurface` ──
 *
 * The cursor is always in the draft while a draft exists, so folding the two together is tempting.
 * They answer different questions to different readers: `FocusSurface` is a CONTRIBUTOR to the
 * cascade — it turns a line number into a FOCUS-level contribution and the cascade reads it — and
 * this holds no contribution at all, because a line with no content has no rendition to resolve
 * between. One module that both contributes a level and holds an uncommitted edit would be two
 * concerns wearing one name, and the level is the half everything else in this bundle depends on.
 */

/** Where a line is being made, and the characters it opened with. */
export interface Draft {
  /** The index the line WILL occupy — the same index `applyEdit`'s `insert-line` takes. */
  readonly lineIndex: number;
  /**
   * The chrome the line opened with, from `seedFor`. Kept so the surface can tell a draft that has
   * gained characters from one that has not, without asking the page what it looks like.
   */
  readonly seed: string;
}

export class DraftSurface {
  #draft: Draft | null = null;

  /** The line being made, or `null` when none is. */
  get draft(): Draft | null {
    return this.#draft;
  }

  /** Is a line being made AT this index? */
  isDraftAt(lineIndex: number): boolean {
    return this.#draft?.lineIndex === lineIndex;
  }

  /** Open a line. One at a time — there is one cursor, and a draft always has it. */
  open(lineIndex: number, seed: string): void {
    this.#draft = { lineIndex, seed };
  }

  /**
   * Abandon the line being made.
   *
   * NOT A DELETION, and the distinction is the whole point of this module: the line was never in
   * the file, so there is nothing to remove and no source edit to write down. Escape, Backspace on
   * an empty draft, and settling without having typed anything all land here.
   */
  drop(): void {
    this.#draft = null;
  }
}

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
 *
 * ── A PROJECTION ARRIVING IS NOT A VIEW CHANGE, AND ONLY ONE OF THEM MAY DESTROY THIS ROW ──
 *
 * `app/index.html`'s `paintView` used to call `drop()` unconditionally, with an argued reason: a
 * row that leaked across a VIEW CHANGE could settle into an `insert-line` against a source nobody
 * was looking at. That reason is sound and it is about the view changing. It does not transfer to
 * the OTHER event that reaches the same function — a projection arriving, which is the world
 * moving while the operator stayed put, on the same view, mid-sentence.
 *
 * So this module now answers the question the drop used to answer by destroying the row: WHERE
 * DOES A LINE THAT IS NOT IN THE FILE GO, when the file it is not in has just been replaced.
 *
 * ── IT IS ANCHORED ON ITS NEIGHBOUR, NOT ON ITSELF, AND THAT IS FORCED ──
 *
 * `relative.ts` re-finds a line by a BRACKET of stamped neighbours, a gap count, an offset and the
 * characters — and every one of those five is read off a line that IS IN THE SOURCE. A draft is by
 * construction in neither source: not the one it was opened against (nothing is written until it
 * settles — see above) and not the one that arrives (the cycle never saw it). `relativeAnchorFor`
 * returns `null` for it and cannot do otherwise: `places[lineIndex]` is the line the draft would
 * PUSH DOWN, not the draft.
 *
 * What a draft has instead is a NEIGHBOUR it was opened beside, and that neighbour is a real line
 * with a real identity. So the place is `{ anchor, side }` — an ordinary `InstanceAnchor` for the
 * line above (or, when there is none, the line below) plus which side of it the row sits on. That
 * anchor is resolved by `resolveInstanceAnchor`, which means the draft inherits ALL FOUR rungs of
 * `ANCHOR_TRUST` — including `relative`, for the ordinary case where the neighbour is itself a
 * line the operator typed a moment ago and the cycle has just stamped. The specificity order is
 * read, never re-expressed here (`instance.ts` records what re-expressing it cost this project).
 *
 * THE NEIGHBOUR IS THE ADJACENT LINE AND THE SEARCH DOES NOT WALK PAST A BLANK. A blank between
 * the draft and its landmark is a blank the cycle may add or remove, and "two lines below qntm:122
 * with one blank in between" is an offset read against a gap nothing promises. Refused rather than
 * guessed at, the same posture `relative.ts` takes for its own gap: no place, and the characters
 * are held.
 */

import { instanceAnchorFor, resolveInstanceAnchor } from "./instance.js";
import type { AnchorVia, InstanceAnchor } from "./instance.js";
import { extendsLine } from "./relative.js";

/**
 * WHERE THE ROW SITS — expressed against the one thing near it that outlives the cycle.
 *
 * `side` is which side of `anchor`'s line the row is on, and it is carried rather than derived
 * because "above" and "below" are the two things `openLine`'s single `lineIndex` argument cannot
 * tell apart after the fact: `o` on line 4 and `O` on line 5 both open at index 5.
 */
export interface DraftPlace {
  readonly anchor: InstanceAnchor;
  readonly side: "above" | "below";
}

/** Where a line is being made, the characters it opened with, and what it currently holds. */
export interface Draft {
  /** The index the line WILL occupy — the same index `applyEdit`'s `insert-line` takes. */
  readonly lineIndex: number;
  /**
   * The chrome the line opened with, from `seedFor`. Kept so the surface can tell a draft that has
   * gained characters from one that has not, without asking the page what it looks like.
   */
  readonly seed: string;
  /**
   * WHAT THE ROW HOLDS RIGHT NOW — `seed` until somebody types into it.
   *
   * IT IS HERE BECAUSE A REPAINT DESTROYS AN `<input>`, which is `design-the-edit-is-a-safe-haven.
   * md`'s own DELTA finding ("what has been typed lives in a DOM element a repaint destroys")
   * applied to the one surface that had not yet answered it. A draft that survives a projection
   * but comes back holding its seed has not survived anything the operator cares about.
   *
   * IT IS NOT A SECOND WRITE PATH. `paint.ts`'s `settle` still reads `input.value` and still
   * computes the one `insert-line` from it; this is the same characters recorded a moment earlier
   * so a repaint can put them back. Nothing posts this field.
   */
  readonly typed: string;
  /** Where the row sits, or `null` when nothing beside it could be anchored. See `DraftPlace`. */
  readonly place: DraftPlace | null;
}

/**
 * WHAT SHOULD HAPPEN TO THE ROW when a projection lands — the judgement, separate from the
 * storage, split for the same reason a pure decision is always kept apart from the surface that
 * stores its result: this is the part worth checking against a replayed projection, and a test
 * harness can only check what it can call without a page.
 *
 *   placed    the neighbour was re-found; the row goes back at `lineIndex`, on the same side.
 *   arrived   THE PROJECTION ALREADY CARRIES HIS CHARACTERS — the cycle ingested the line while he
 *             was still typing it. The row is released, because re-placing it would put a second
 *             copy of a line the file now owns on screen, and settling that copy would mint a
 *             second node. This is `held.ts`'s own release rule, applied to the other end of the
 *             same gesture.
 *   unplaced  nothing could be said about where the row goes. The caller holds the characters.
 */
export type DraftPlacement =
  | { readonly outcome: "placed"; readonly lineIndex: number; readonly via: AnchorVia }
  | { readonly outcome: "arrived" }
  | { readonly outcome: "unplaced"; readonly because: "no-place" | "absent" | "ambiguous" };

/**
 * The place for a row opening at `lineIndex` in `source`, or `null` when nothing adjacent to it
 * has an identity to hold onto.
 *
 * ABOVE FIRST, BELOW ONLY AS A FALLBACK. `o`, Enter mid-line and a click under the last row all
 * open BENEATH something, so the line above is the one the operator was looking at when he asked
 * for the row. `O` at the very top of a section has nothing above it inside the file — index 0 —
 * or has the heading, which `instance.ts` gives a CONSTANT token precisely so its identity does
 * not move when its characters do.
 *
 * `null` FOR A BLANK NEIGHBOUR ON BOTH SIDES, deliberately — see the module header for why the
 * search does not step over one.
 */
export function placeFor(source: string, lineIndex: number, view: string): DraftPlace | null {
  const above = lineIndex > 0 ? instanceAnchorFor(source, lineIndex - 1, view) : null;
  if (above !== null) {
    return { anchor: above, side: "above" };
  }
  const below = instanceAnchorFor(source, lineIndex, view);
  return below === null ? null : { anchor: below, side: "below" };
}

/** Does any line of `source` still carry `text` — the same characters, or with a token appended? */
function carries(source: string, text: string): boolean {
  return source.split("\n").some((line) => extendsLine(text, line));
}

/**
 * Where the row goes now that `after` has arrived. PURE — no DOM, no surface, no clock.
 *
 * `before` is the string that was on screen when the row was opened against it, and it is read for
 * ONE thing: to tell "the cycle brought his line back" apart from "this view already had a line
 * like that". Releasing the row is the one outcome here that DESTROYS characters, so it is gated
 * on the arriving projection having gained the line rather than merely containing one — the same
 * direction `held.ts`'s own comparison fails in, applied to a decision that is strictly more
 * dangerous than `held.settle`'s (a released held row is a copy of something the file has; a
 * released draft is the only copy there was).
 *
 * A ROW HOLDING NOTHING BUT ITS OWN CHROME IS NEVER "ARRIVED". It has no characters to match with
 * and `applyEdit` refuses to insert it, so the only question about it is where it goes.
 */
export function placeDraft(
  draft: Draft,
  before: string,
  after: string,
  view: string,
): DraftPlacement {
  if (draft.typed !== draft.seed && carries(after, draft.typed) && !carries(before, draft.typed)) {
    return { outcome: "arrived" };
  }
  if (draft.place === null) {
    return { outcome: "unplaced", because: "no-place" };
  }
  const reading = resolveInstanceAnchor(draft.place.anchor, after, view);
  if (reading.outcome === "found") {
    const at = draft.place.side === "above" ? reading.lineIndex + 1 : reading.lineIndex;
    return { outcome: "placed", lineIndex: at, via: reading.via };
  }
  return { outcome: "unplaced", because: reading.outcome };
}

export class DraftSurface {
  #draft: Draft | null = null;
  #generation = 0;

  /** The line being made, or `null` when none is. */
  get draft(): Draft | null {
    return this.#draft;
  }

  /**
   * WHICH ROW THE SURFACE IS ON — a monotonic counter, bumped by every one of the three calls that
   * changes which row exists (`open`, `carry`, `drop`).
   *
   * IT IS THE ONLY THING THAT MAKES A SURVIVING DRAFT SAFE, and it closes a hole that was already
   * there. `paint.ts` builds one `<input>` per row and that element's `blur` listener SETTLES —
   * computing an `insert-line` against the source string the row was opened against and handing it
   * to the page's write path. Removing a focused element is a blur in every browser that fires one.
   * Before this row existed the page dropped the draft and repainted, and the removed element's
   * blur could still post into the view being left; the drop protected the SURFACE and not the
   * ELEMENT. A row that now SURVIVES a projection is repainted as a second element, so the first
   * one has to be answerable for.
   *
   * `paint.ts` captures this number when it builds the element and refuses to settle or abandon
   * when it no longer matches: an element whose row has been dropped, or re-placed, is not the row
   * on screen and its settlement is not this row's settlement.
   */
  get generation(): number {
    return this.#generation;
  }

  /** Is a line being made AT this index? */
  isDraftAt(lineIndex: number): boolean {
    return this.#draft?.lineIndex === lineIndex;
  }

  /** Open a line. One at a time — there is one cursor, and a draft always has it. */
  open(lineIndex: number, seed: string, place: DraftPlace | null = null): void {
    this.#draft = { lineIndex, seed, typed: seed, place };
    this.#generation += 1;
  }

  /**
   * The row holds these characters now. Called as they are typed, so a repaint can put them back.
   *
   * A NO-OP WHEN NO ROW IS OPEN, rather than an error: the caller is a DOM listener on an element
   * that may already have been removed, and a listener that can throw during teardown is a
   * listener that takes the page down with it.
   */
  type(text: string): void {
    if (this.#draft === null) {
      return;
    }
    this.#draft = { ...this.#draft, typed: text };
  }

  /**
   * THE ROW SURVIVED A PROJECTION — same characters, same seed, new index and a freshly taken
   * place.
   *
   * The place is re-taken by the caller against the ARRIVING source rather than carried forward,
   * for the reason `focus.reanchor` re-takes its own anchor on a `found`: an anchor that goes on
   * describing the previous projection is an anchor that drifts one cycle at a time.
   */
  carry(lineIndex: number, place: DraftPlace | null): void {
    if (this.#draft === null) {
      return;
    }
    this.#draft = { ...this.#draft, lineIndex, place };
    this.#generation += 1;
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
    this.#generation += 1;
  }
}

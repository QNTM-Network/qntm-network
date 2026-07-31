/**
 * FocusSurface — where the cursor is, and the FOCUS-level contribution derived from it.
 *
 * PURE. No DOM, no fetch, no clock. It holds one number-or-null and turns it into a level, which
 * is the whole of the operator's rule expressed as data:
 *
 *   cursor on the line  -> the line renders as its exact source text
 *   cursor off the line -> the resolved rendition, clickable
 *
 * ── WHY THE RULE IS A LEVEL AND NOT AN `if (focused)` IN THE PAINTER ──
 *
 * FOCUS is the MOST SPECIFIC of the seven levels (levels.ts, SPECIFICITY), so it beats every
 * declaration below it. That ordering is not decoration: without it, a line that declared itself
 * a chip at LINE level, or an instance that declared `wired` at GLOBAL, would become uneditable —
 * the cursor would land on it and it would go on showing the rendition. Expressing the rule as a
 * contribution at the top of the cascade makes "the cursor always wins" a property of the ORDER,
 * owned in one tuple, rather than a branch in a painter that some later change forgets to keep.
 *
 * The painter therefore contains no `if (focused) ... else if (mode === ...)` chain. It asks the
 * cascade and obeys the answer; this class is what makes the answer different for the line under
 * the cursor.
 *
 * ── DERIVED, NOT DECLARED ──
 *
 * Every other level has a declaration home: a served file, a user record, a view sheet. This one
 * has none and must never grow one. "Where the cursor is" is a fact about the moment, and a fact
 * about the moment written into a file is a fact that outlives the moment — the shape that makes
 * a UI state machine drift from the UI. So the FOCUS contribution is computed, held for one
 * paint, and thrown away.
 *
 * THE ANCHOR THIS SURFACE GAINED IN 2026-07-31'S HAVEN ROW IS THE SAME KIND OF FACT, AND THE CLAIM
 * WAS CHECKED RATHER THAN ASSUMED. An `Anchor` is derived from a source string and a line index at
 * the instant the cursor lands, held for as long as the cursor is on that line, and dropped with
 * it. Nothing serves it, nothing stores it, and no file records it — so the rule above survives
 * intact. It is also not a second CONCERN, which is the test `draft.ts` applies to the same
 * question and answers the other way: `DraftSurface` holds an uncommitted EDIT and this holds
 * neither more nor less than it always did — WHICH LINE the cursor is on. The anchor is that same
 * one fact, correctly typed. `design-the-edit-is-a-safe-haven.md` §5.2 says so in as many words:
 * ANCHOR "exists but is the wrong type. It is an index; the world moving changes indices."
 *
 * NO NEW CONTRIBUTION AND NO NEW LEVEL. `contextFor` is untouched, `FOCUSED` is untouched, and the
 * cascade cannot tell that this class changed. The anchor decides WHERE the cursor is; it never
 * decides how anything renders.
 *
 * ── WHY IT IS RAW ON EVERY KEY ──
 *
 * The contribution is built FROM `RESOLUTION_KEYS` rather than listed by hand. When stage 8 adds
 * `tags`, `links` and `markers`, the focused line must show ALL of its characters — a focused
 * line that resolved its checkbox raw and its tags wired would be a line you could put a cursor
 * in and still not see. Deriving the contribution means that keeps being true without anyone
 * remembering to come back here.
 */

import { anchorFor, resolveAnchor } from "./anchor.js";
import type { Anchor, AnchorReading } from "./anchor.js";
import { PresentationContext } from "./context.js";
import { RESOLUTION_KEYS } from "./resolution.js";
import type { Contribution, Rendition } from "./resolution.js";

/** What the FOCUS level says about the line under the cursor: show me the characters. */
const FOCUSED: Contribution = Object.freeze(
  Object.fromEntries(RESOLUTION_KEYS.map((key) => [key, "raw" as Rendition])),
) as Contribution;

export class FocusSurface {
  #lineIndex: number | null = null;
  #anchor: Anchor | null = null;

  /** The line the cursor is on, or `null` when it is nowhere. */
  get lineIndex(): number | null {
    return this.#lineIndex;
  }

  /**
   * WHICH line the cursor is on, expressed as identity rather than as a position — or `null` when
   * nothing was anchored. See `focus` below for the two ways that happens.
   */
  get anchor(): Anchor | null {
    return this.#anchor;
  }

  isFocused(lineIndex: number): boolean {
    return this.#lineIndex === lineIndex;
  }

  /**
   * Put the cursor on a line. One line at a time — there is one cursor.
   *
   * `source` IS OPTIONAL AND ITS ABSENCE IS A REAL CONFIGURATION, the same shape `PaintDeps`
   * already draws for `focus`, `mode` and `draft`: without it the cursor is a bare index exactly as
   * it was before this parameter existed, and `reanchor` below reports `unanchored` rather than
   * pretending. Every caller in the shipped app supplies it (`app/index.html`, `paint.ts`); the
   * tests written before anchoring existed do not, and go on painting what they always painted.
   *
   * THE INDEX AND THE ANCHOR ARE SET IN ONE CALL, on purpose. Two setters would be two facts that
   * can disagree about where one cursor is, and "there is one cursor" is the property every motion
   * in this bundle is arithmetic on.
   */
  focus(lineIndex: number, source?: string): void {
    this.#lineIndex = lineIndex;
    this.#anchor = source === undefined ? null : anchorFor(source, lineIndex);
  }

  /**
   * THE WORLD ARRIVED. Where is the cursor's line in `source` now, and which rung said so?
   *
   * On `found` the cursor MOVES to the line it found and the anchor is taken again against the new
   * projection — a cycle that stamped the line, or rewrote its tail, has changed the text tier 2
   * would look for next time, and an anchor that went on describing the previous projection would
   * be the same defect one repaint later.
   *
   * ON `ambiguous` AND `absent` NOTHING MOVES AND NOTHING IS CLEARED, which is deliberate rather
   * than unfinished. Blurring a cursor whose line has vanished would destroy the one thing row 4
   * (`the-vanished-line-is-parked-not-dropped`) needs in order to park the operator's characters
   * where he can recover them. This row's whole obligation is that the outcome REACHES THE CALLER
   * instead of being silence, and the caller decides.
   *
   * IT IS THE CALLER'S CALL, NOT THE PAINTER'S. `paint` cannot tell a projection arriving from its
   * own optimistic repaint of a source it has already seen, so re-anchoring lives with the code
   * that knows a snapshot landed — the same split `boundaryLine` and `openLine` already have
   * between a pure answer and the wiring that asks for it.
   *
   * IF THIS SURFACE EVER GAINS A COLUMN — and it is likely to, because `w`/`b`/`e` repeating in
   * NORMAL makes the cursor a line AND a column — THIS METHOD MUST DECIDE WHAT HAPPENS TO IT
   * EXPLICITLY. It goes through `focus()` above, which owns the index and the anchor and nothing
   * else, so a column added as a third field would be silently reset here on every arrival. The
   * fact it needs is already in hand: `anchor.text` is re-taken against the new projection one line
   * below, so a column can be clamped into the line's CURRENT characters rather than guessed.
   */
  reanchor(source: string): AnchorReading {
    const anchor = this.#anchor;
    if (anchor === null) {
      return { outcome: "unanchored" };
    }
    const reading = resolveAnchor(anchor, source);
    if (reading.outcome === "found") {
      this.focus(reading.lineIndex, source);
    }
    return reading;
  }

  /** Take the cursor off whatever it was on. */
  blur(): void {
    this.#lineIndex = null;
    this.#anchor = null;
  }

  /**
   * The context to resolve ONE line against: the caller's facts, plus FOCUS if this is the line.
   *
   * The level name lives here rather than at the call site so the painter never has to know which
   * rung the cursor sits on — it hands over a line number and a context and gets a context back.
   */
  contextFor(lineIndex: number, base: PresentationContext): PresentationContext {
    return base.with("FOCUS", this.isFocused(lineIndex) ? FOCUSED : undefined);
  }
}

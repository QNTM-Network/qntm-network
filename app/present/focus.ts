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
 * ── WHY IT IS RAW ON EVERY KEY ──
 *
 * The contribution is built FROM `RESOLUTION_KEYS` rather than listed by hand. When stage 8 adds
 * `tags`, `links` and `markers`, the focused line must show ALL of its characters — a focused
 * line that resolved its checkbox raw and its tags wired would be a line you could put a cursor
 * in and still not see. Deriving the contribution means that keeps being true without anyone
 * remembering to come back here.
 */

import { PresentationContext } from "./context.js";
import { RESOLUTION_KEYS } from "./resolution.js";
import type { Contribution, Rendition } from "./resolution.js";

/** What the FOCUS level says about the line under the cursor: show me the characters. */
const FOCUSED: Contribution = Object.freeze(
  Object.fromEntries(RESOLUTION_KEYS.map((key) => [key, "raw" as Rendition])),
) as Contribution;

export class FocusSurface {
  #lineIndex: number | null = null;

  /** The line the cursor is on, or `null` when it is nowhere. */
  get lineIndex(): number | null {
    return this.#lineIndex;
  }

  isFocused(lineIndex: number): boolean {
    return this.#lineIndex === lineIndex;
  }

  /** Put the cursor on a line. One line at a time — there is one cursor. */
  focus(lineIndex: number): void {
    this.#lineIndex = lineIndex;
  }

  /** Take the cursor off whatever it was on. */
  blur(): void {
    this.#lineIndex = null;
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

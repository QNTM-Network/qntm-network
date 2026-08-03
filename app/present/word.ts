/**
 * wordCaret — where `{count}w`/`b`/`e` put the caret. PURE: no DOM, no fetch, no clock.
 *
 * ── WHY THIS IS A SEPARATE MODULE FROM motions.ts, RATHER THAN A CASE IN ITS SWITCH ──
 *
 * The same reason `boundary.ts` and `indent.ts` are separate (see either header). Deciding WHERE
 * the count-th title word starts needs `titleSpans`, which needs `classifyLine`, both
 * `resolution.ts` — and `app/present/motions.ts` imports nothing at all, which is what proves
 * `ModeSurface` cannot produce a `Contribution` even by accident. So `ModeSurface.handleKey`
 * reports only a motion letter and a count (its own count-prefix arithmetic, unchanged) for
 * `w`/`b`/`e`, and this module — imported by the caller, never by motions.ts — turns that into a
 * caret offset into the line.
 *
 * ── THE CALLER STILL DOES THE MOVING ──
 *
 * `ModeSurface.handleKey` cannot compute the column this module computes and must not import the
 * module that does. So the caller (`app/index.html`) calls `wordCaret`, and only THEN calls
 * `focus.moveColumn(column, line)` if a word was found — the same "effect reported, caller acts"
 * split `{`/`}` and `>`/`<` already draw between "which line" (motions.ts's job to ask for) and
 * "which line, actually" (boundary.ts's/indent.ts's job to answer), applied to "which column"
 * instead of "which line".
 *
 * ── RELATIVE TO THE CURSOR, WHICH IS THE CORRECTION THIS MODULE EXISTS TO CARRY ──
 *
 * THE FIRST VERSION OF THIS FUNCTION ANCHORED EVERY COUNT TO A FIXED END OF THE TITLE, and said so:
 * "there is no established caret column in NORMAL — `FocusSurface` holds a LINE, not a column". So
 * `w` meant "the start of the count-th word of the title", counted from the title's own start, no
 * matter where the cursor already was. That was honest about its own cause and the cause is gone:
 * `FocusSurface` holds a column now (focus.ts). The operator's complaint was the consequence — with
 * every `w` measured from the same fixed point, a second `w` could not go anywhere new, which is why
 * `w` had to end in INSERT to appear to do anything at all.
 *
 * SO EVERY MOTION IS MEASURED FROM `from`, THE CURSOR'S CURRENT COLUMN, AND IS STRICT:
 *
 *   `w` — the START of the count-th title word that begins strictly AFTER `from`.
 *   `e` — the LAST CHARACTER of the count-th title word that ends strictly after `from`.
 *   `b` — the START of the count-th title word that begins strictly BEFORE `from`, nearest first.
 *
 * STRICTLY, BECAUSE A MOTION THAT CAN RETURN ITS OWN STARTING POINT IS A MOTION THAT DOES NOT
 * REPEAT — which is the whole defect. `w` pressed with the cursor already on a word's first
 * character moves to the NEXT word, exactly as vim's does.
 *
 * `e` LANDS ON THE LAST CHARACTER, NOT ONE PAST IT. It used to return `word.end` (one past) because
 * it was seeding a text CARET, which lives between characters; it is now positioning a BLOCK cursor,
 * which lives on one. `a` is what reaches one-past-the-end, by asking for `column + 1` — so `e`
 * then `a` puts the caret exactly where `e` alone used to put it, and the old behaviour is reachable
 * rather than lost.
 *
 * A count past the number of words CLAMPS rather than wraps — the same rule `clampLine` already
 * enforces for `j`/`k`/`G` — landing on the first (`b`) or last (`w`/`e`) title word rather than
 * doing nothing, refusing, or wrapping around to the other end. `count` defaults to 1 at the call
 * site (motions.ts's `pending ?? 1`), so the untyped case ("w" with no digits first) is just
 * `count === 1` here, not a separate branch.
 */

import { titleSpans } from "./rendition.js";
import type { WordSpan } from "./rendition.js";

/** `w`: start of the count-th word. `e`: end of the count-th word. `b`: start, counted from the end. */
export type WordMotion = "w" | "b" | "e";

/**
 * The column `motion` puts the cursor at, `count` title words away from `from` — or `null` when the
 * line has no title at all (`titleSpans` returned nothing: a bare heading marker, a blank line,
 * chrome with nothing after it), which the caller reads as "this key does nothing here".
 *
 * A count that overruns the title clamps to its last (`w`/`e`) or first (`b`) word. A motion with
 * nowhere left to go returns that same end rather than `null`: `null` means "this line has no words
 * at all", and a caller that could not tell the two apart would repaint on one and not the other.
 */
export function wordCaret(line: string, motion: WordMotion, count: number, from: number): number | null {
  const words = titleSpans(line);
  if (words.length === 0) {
    return null;
  }
  const n = Math.max(1, count);
  const last = words[words.length - 1] as WordSpan;
  const first = words[0] as WordSpan;

  // THE CANDIDATE COLUMNS, IN THE DIRECTION OF TRAVEL. `e` counts word ENDS and `w`/`b` count word
  // STARTS, so the one list each motion walks is built here and the arithmetic below is identical
  // for all three — no per-motion index juggling, which is where the fixed-anchor version's
  // off-by-ones lived.
  if (motion === "b") {
    const before = words.map((word) => word.start).filter((at) => at < from);
    if (before.length === 0) {
      return first.start;
    }
    return before[Math.max(0, before.length - n)] as number;
  }

  const after =
    motion === "e"
      ? words.map((word) => word.end - 1).filter((at) => at > from)
      : words.map((word) => word.start).filter((at) => at > from);
  if (after.length === 0) {
    return motion === "e" ? last.end - 1 : last.start;
  }
  return after[Math.min(n - 1, after.length - 1)] as number;
}

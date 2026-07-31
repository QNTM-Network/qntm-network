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
 * ── THE CALLER STILL DOES THE ENTERING ──
 *
 * Unlike `i`/Enter/`a`, `ModeSurface.handleKey` cannot call its own `enterInsert(caret)` for
 * `w`/`b`/`e` — it does not have the offset this module computes, and it must not import the
 * module that does. So the caller (`app/index.html`) calls `wordCaret`, and only THEN calls
 * `mode.enterInsert(offset)` if a word was found. `ModeSurface`'s mode stays `NORMAL` until that
 * happens — the same "effect reported, caller acts" split `{`/`}` and `>`/`<` already draw between
 * "which line" (motions.ts's job to ask for) and "which line, actually" (boundary.ts's/indent.ts's
 * job to answer), applied to "which column" instead of "which line".
 *
 * ── THE POSTURE, STATED BECAUSE THE DESIGN DOCUMENT ONLY NAMES IT IN PASSING ──
 *
 * There is no established caret column in NORMAL — `FocusSurface` holds a LINE, not a column
 * (`focus.ts`), and vim's own `w`/`b`/`e` are relative to a column this app's NORMAL mode has never
 * had. So every count is anchored to a FIXED end of the title, the same way `G`/`gg` anchor to a
 * fixed end of the buffer rather than to a remembered position:
 *
 *   `w` — the START of the count-th title word, counting FORWARD from the title's own start.
 *   `e` — the END of the count-th title word, counting FORWARD from the title's own start.
 *   `b` — the START of the count-th-from-LAST title word, counting BACKWARD from the title's end.
 *
 * `w` and `e` share an anchor because vim's own `w`/`e` both move forward; `b` moves backward, so
 * it is anchored at the other end. A count past the number of words CLAMPS rather than wraps — the
 * same rule `clampLine` already enforces for `j`/`k`/`G` — landing on the first (`b`) or last
 * (`w`/`e`) title word rather than doing nothing, refusing, or wrapping around to the other end.
 * `count` defaults to 1 at the call site (motions.ts's `pending ?? 1`), so the untyped case ("w"
 * with no digits first) is just `count === 1` here, not a separate branch.
 */

import { titleSpans } from "./resolution.js";

/** `w`: start of the count-th word. `e`: end of the count-th word. `b`: start, counted from the end. */
export type WordMotion = "w" | "b" | "e";

/**
 * The caret offset `motion` puts the cursor at, `count` words into `line`'s title — or `null` when
 * the line has no title at all (`titleSpans` returned nothing: a bare heading marker, a blank
 * line, chrome with nothing after it). `count` is clamped into `[1, words.length]` before use, so
 * a count that overruns the title lands on its first or last word rather than wrapping.
 */
export function wordCaret(line: string, motion: WordMotion, count: number): number | null {
  const words = titleSpans(line);
  if (words.length === 0) {
    return null;
  }
  const n = Math.max(1, count);

  if (motion === "b") {
    const index = Math.max(0, words.length - n);
    return words[index]?.start ?? null;
  }
  const index = Math.min(n - 1, words.length - 1);
  const word = words[index];
  if (word === undefined) {
    return null;
  }
  return motion === "e" ? word.end : word.start;
}

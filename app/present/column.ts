/**
 * columnFor — GIVEN AN INSTRUCTION AND A LINE, WHERE IS THE CURSOR. The one place that computes a
 * column. PURE: no DOM, no fetch, no clock.
 *
 * ── THIS IS NOT A NEW IDEA IN THIS CODEBASE. IT IS THE EXISTING ONE, FINISHED. ──
 *
 * `app/present/motions.ts` decides what a keystroke MEANS and imports nothing, which is what proves
 * `ModeSurface` cannot reach the cascade even by accident. Because it imports nothing it cannot see
 * a line's characters, so it must not compute positions in them. The codebase already draws that
 * line three times, and `word.ts`'s own header names the split: motions.ts asks for "which line",
 * `boundary.ts` answers it; motions.ts asks for "which text", `indent.ts` answers it; motions.ts
 * asks for "which column", `word.ts` answers it.
 *
 * THE PATHS THAT WORK ARE EXACTLY THE PATHS THAT HAVE AN ANSWERING MODULE. Measured 2026-08-12:
 * `w`/`b`/`e` (answered by `word.ts`) and `0`/`$` are the only two gestures that leave
 * `FocusSurface.column` agreeing with where the caret actually is. Every other gesture either
 * computed a position somewhere it could not see the line (`motions.ts` did `column + 1` for `a`,
 * with the clamp stranded in `paint.ts` two modules away) or wrote a literal `0` into the surface
 * and called it a column. Five sites did the latter.
 *
 * So this module is not a fourth thing invented to satisfy a diagram. It is `word.ts`'s pattern
 * extended to the gestures that never got one, and it ABSORBS `word.ts` rather than sitting beside
 * it — a caller asking "where does `w` go" and a caller asking "where does `a` go" are asking one
 * question, and two entry points for it would be the second coordinate system the whole change
 * exists to remove.
 *
 * ── THE CONTRACT ──
 *
 *   instruction    "append" / "keep" / "clicked here"   says WHAT, no arithmetic
 *        ↓
 *   columnFor      instruction + line → a position      the ONLY place that computes
 *        ↓
 *   FocusSurface   holds it                             its column comes from here and nowhere else
 *        ↓
 *   placeCaret     puts it on screen                    decides nothing
 *
 * `FocusSurface` is never handed a number by a caller that already decided. It is handed an
 * INSTRUCTION and asks this module. That is why `focus()` no longer takes a column at all: "I have
 * nothing to say about the column" used to be spelled `0`, which is indistinguishable from meaning
 * column zero, and the only way to make it unspellable was to delete the parameter.
 *
 * ── TWO CLAMPS, AND THEY ARE NOT A SPECIAL CASE ──
 *
 * A NORMAL cursor sits ON a character, so its last legal column is `length - 1`. An INSERT caret
 * sits BETWEEN characters, so its last legal position is `length` — one past the end, which is
 * exactly where a caret belongs when appending. Those are two different spaces, not one space with
 * an exception, and the instruction is what says which one is being asked about. The old code had
 * this too; it was just split across two modules that could not see each other (`clampColumn` in
 * motions.ts, `Math.min(caret, lineSource.length)` in paint.ts).
 */

import { clampColumn } from "./motions.js";
import { wordCaret } from "./word.js";
import type { WordMotion } from "./word.js";

/**
 * WHAT A GESTURE MEANT, with no arithmetic in it.
 *
 * The two string kinds `motions.ts` emits (`"insert"`, `"append"`) are spelled the same there and
 * are deliberately NOT imported from here: that module imports nothing, and
 * `tests/flow_scenarios/vim_gestures.ts` asserts it by reading its source. Coupling by string value
 * is the price of that invariant and is cheaper than breaking it.
 */
export type CursorInstruction =
  /** `0`, entering a view, a click — the beginning of the line. */
  | { readonly kind: "line-start" }
  /** `$` — the line's last character. */
  | { readonly kind: "line-end" }
  /** `j`/`k`, `{`/`}` — a different line, the same column, re-measured against the new line. */
  | { readonly kind: "keep" }
  /** `i`/Enter — an INSERT caret at the cursor's own column. */
  | { readonly kind: "insert" }
  /** `a` — an INSERT caret one past the character under the cursor. */
  | { readonly kind: "append" }
  /** `w`/`b`/`e` — the count-th title word from here. */
  | { readonly kind: "word"; readonly motion: WordMotion; readonly count: number };

/** The instructions that place an INSERT caret, which may sit one past the last character. */
function isInsertSpace(instruction: CursorInstruction): boolean {
  return instruction.kind === "insert" || instruction.kind === "append";
}

/**
 * The column `instruction` names, measured against `lineText`, from the cursor's current column
 * `from`.
 *
 * `null` MEANS "THIS GESTURE DOES NOTHING HERE" and is reachable only from a word motion on a line
 * with no title at all — `wordCaret`'s own signal, passed through rather than swallowed, because a
 * caller that could not tell "nowhere to go" from "column 0" would repaint on one and not the
 * other. Every other instruction always has an answer.
 *
 * `lineText` is `null` when the caller has no source to measure against. Nothing is invented for
 * that case: the instruction's own arithmetic runs and `clampColumn` leaves it alone, which is the
 * behaviour `focus()` has always had when called without a source.
 */
export function columnFor(
  instruction: CursorInstruction,
  lineText: string | null,
  from: number,
): number | null {
  const raw = rawColumnFor(instruction, lineText, from);
  if (raw === null) {
    return null;
  }
  if (!isInsertSpace(instruction)) {
    return clampColumn(raw, lineText);
  }
  // INSERT SPACE. One past the last character is legal here and is what `a` on the final character
  // means, so this cannot go through `clampColumn` (which stops at `length - 1`). It is still
  // clamped — `a` must not point past characters that exist.
  if (!Number.isFinite(raw) || raw < 0) {
    return 0;
  }
  const at = Math.floor(raw);
  return lineText === null ? at : Math.min(at, lineText.length);
}

/** The instruction's own arithmetic, before either clamp. */
function rawColumnFor(
  instruction: CursorInstruction,
  lineText: string | null,
  from: number,
): number | null {
  switch (instruction.kind) {
    case "line-start":
      return 0;
    case "line-end":
      // The line's own end. `clampColumn` turns it into the last character that exists, which is
      // what `$` has always meant here — stated as "past the end" and landing on the end.
      return lineText === null ? 0 : lineText.length;
    case "keep":
    case "insert":
      return from;
    case "append":
      // ONE PAST THE CHARACTER UNDER THE CURSOR — vim's own `a`. This is the arithmetic that used
      // to live in motions.ts as `column + 1`, where it could not see the line it indexed, with the
      // clamp stranded in paint.ts. Both halves are here now, next to the string they measure.
      return from + 1;
    case "word":
      return lineText === null ? from : wordCaret(lineText, instruction.motion, instruction.count, from);
  }
}

/**
 * indentedLine — what `>`/`<` MEAN as a change to a line's leading whitespace. PURE: no DOM, no
 * fetch, no clock.
 *
 * ── WHY THIS IS A SEPARATE MODULE FROM motions.ts, RATHER THAN A CASE IN ITS SWITCH ──
 *
 * The same reason `boundary.ts` is separate (see its header): `app/present/motions.ts` imports
 * nothing at all, and that is what proves `ModeSurface` cannot produce a `Contribution` even by
 * accident. Deciding what a line's NEW leading whitespace is requires knowing whether the line is
 * one this app will touch at all — a blank line and a heading line are both refused, for reasons
 * below — and that refusal needs `classifyLine` (`resolution.ts`). So `ModeSurface.handleKey`
 * reports only a direction and a count for `>`/`<` (motions.ts's own count-prefix arithmetic,
 * unchanged), and this module — imported by the caller, never by motions.ts — turns that into the
 * line's new text.
 *
 * ── THE UNIT IS FOUR SPACES, TAKEN FROM THE ENGINE, NOT TWO TAKEN FROM A STYLESHEET ──
 *
 * `apps/qntm_md/src/qntm_md/render/renderer.py:947-950` emits `'    ' * depth` — four spaces per
 * nesting level. Confirmed independently against the operator's own rendered content,
 * `~/qntm/this_week.md` (read-only): a depth-1 line carries 4 leading spaces, a depth-2 line
 * carries 8. `app/present/paint.ts`'s ONLY existing indent arithmetic — `(shape.indent.length / 2)
 * * 1.2 + "rem"`, a CSS margin transcribed from `app.html:246` — treats two spaces as one level.
 * That arithmetic is NOT reused here. Reusing it would insert two spaces per keystroke; two spaces
 * still reparents (see below — the engine's differ pops on ANY increase), so the gesture would
 * appear to work, and the next cycle would re-render the line at four spaces and double the indent
 * under the operator's hands. `INDENT_UNIT` below is the one place this app's indent arithmetic is
 * allowed to disagree with the engine, and it doesn't.
 *
 * `app/present/paint.ts:697`'s margin CSS is a SEPARATE, pre-existing display bug — it scales a
 * nested line's on-screen margin by 2x what a 4-space-per-level convention would produce, since it
 * still divides by two. It is not corrected here: fixing it is a change to a file this module's
 * sibling owns (paint.ts), and it would break `tests/present-golden.test.mjs`'s byte-identical
 * comparison against the historical `app.html:234-269` reference, which is a separate, already-
 * validated claim this change has no business invalidating. It is a cosmetic finding, not a
 * correctness one: the CSS margin is still monotonic in the source indent (more indent, more
 * margin), so it is misleading, not misleading in a way that produces a WRONG source edit — the
 * source edit is computed here, from the raw character count, never from that CSS constant.
 *
 * ── WHY ANY INCREASE MATTERS, EVEN BY ONE SPACE ──
 *
 * `apps/qntm_md/src/qntm_md/diff/content_diff.py:721-722`: `depth = len(normalised) -
 * len(normalised.lstrip())`, popped with `stack[-1][0] >= depth` — a raw leading-space count, no
 * "level" arithmetic anywhere in it. One extra space is enough to make a line a child of the line
 * above it, and the applier creates or detaches the `PART_OF` structural edge accordingly
 * (`apps/qntm_md/src/qntm_md/io/applier.py:2738-2812`). So `>`/`<` are not formatting — they are a
 * reparent — and `INDENT_UNIT` below is the only thing standing between a keystroke and a graph
 * edit expressed in a number of spaces the engine did not intend.
 *
 * ── WHY A HEADING LINE IS REFUSED, WHICH IS NOT IN THE DESIGN DOCUMENT AND IS ARGUED HERE ──
 *
 * `content_diff.py`'s own heading test, `_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")`
 * (`content_diff.py:83`), requires the `#` to be the FIRST character — no leading whitespace at
 * all — and this app's own `HEADING` regex (`resolution.ts`) is the same shape for the same
 * reason (both are transcriptions of CommonMark's own rule). So indenting a heading by even one
 * space does not indent it: it stops being a heading, on both ends. Client-side, `classifyLine`
 * would reclassify it as `prose` on the very next paint. Server-side, the engine's differ would
 * stop running its heading branch (`stack = []`, section boundaries reset) and fall through to the
 * ordinary depth-and-reparent branch instead — corrupting the section the heading was supposed to
 * open, not merely mis-indenting one line. That is a bigger and stranger failure than the reparent
 * `>`/`<` are meant to perform, and refusing it costs nothing an operator would want: nobody
 * indents a heading in Obsidian to make it a child task.
 *
 * ── WHY A BLANK LINE IS REFUSED ──
 *
 * There is no content to reparent — `classifyLine` already gives a blank line no rendition at all
 * (`resolution.ts`, `paint.ts`'s blank-line branch) — and changing only its whitespace would be a
 * source edit with no observable effect anywhere the operator looks, which is the same shape of
 * problem `applyEdit`'s `insert-line` refusal (`carriesContent`) already exists to avoid one layer
 * over.
 *
 * ── THE ROUNDING RULE, STATED BECAUSE THE BRIEF ASKS FOR ONE ──
 *
 * Every result is a whole multiple of `INDENT_UNIT`, whatever the line started with — vim's own
 * `shiftround`, not "add/remove four characters". Indenting rounds UP past the current floor of
 * units (`floor(len / UNIT) + count`); outdenting rounds DOWN from the current ceiling
 * (`max(0, ceil(len / UNIT) - count)`). Two consequences follow directly and are both tested:
 *
 *   * a line already sitting on a whole number of units (0, 4, 8, …) round-trips exactly —
 *     `>` then `<` restores the original text byte for byte, because indenting adds one unit and
 *     outdenting removes exactly the one it added;
 *   * a line NOT on a whole number of units — hand-typed with an odd count, or a stray tab — does
 *     NOT round-trip through `>` then `<`. `>` rounds it up to the next multiple and DISCARDS the
 *     remainder; a following `<` removes a further whole unit from THAT multiple, landing below
 *     the original count. This is a deliberate decision, not an oversight: the alternative
 *     (preserving the remainder) would let `>` insert a text that is not a multiple of the unit
 *     whenever the starting line was not one, which is exactly the "a key press cannot produce an
 *     indent that is not a whole number of units" guarantee this module exists to hold.
 *
 * `<` at zero is the same formula wearing no special case: `ceil(0 / UNIT) - count` clamps to zero
 * at `max(0, …)`, so the returned text is the line unchanged — a no-op, not an error and not a
 * wrap, exactly as the brief asks.
 *
 * Any whitespace character (`\s`, matching `TASK`'s own leading-whitespace capture in
 * `resolution.ts`) counts toward the existing length being rounded, but the OUTPUT is always pure
 * spaces — this app never writes a tab, mirroring the engine, which never emits one either.
 */

import { classifyLine } from "./resolution.js";

/**
 * Four spaces. See the module header for the citation and for why this is not derived from
 * `paint.ts`'s margin arithmetic.
 */
export const INDENT_UNIT = 4;

const LEADING_WHITESPACE = /^\s*/;

/**
 * The new text for `line` after indenting (`"in"`) or outdenting (`"out"`) it by `count` units of
 * `INDENT_UNIT` spaces.
 *
 * Returns `line` UNCHANGED — not `null` — when the gesture has nothing to do: outdenting a line
 * already at zero, or a line this app refuses to touch at all (blank or heading; see the module
 * header). Returning the same string rather than a sentinel is deliberate: the caller hands the
 * result straight to `applyEdit`'s `set-line`, and that function's OWN rule — an edit whose text
 * equals the line already there is a refusal, not a successful no-op edit (`source.ts`) — is what
 * turns "nothing to do" into "post nothing", with no second no-op check needed here.
 */
export function indentedLine(line: string, direction: "in" | "out", count: number): string {
  const shape = classifyLine(line);
  if (shape.kind === "blank" || shape.kind === "heading") {
    return line;
  }

  const match = LEADING_WHITESPACE.exec(line);
  const currentLength = match?.[0].length ?? 0;
  const rest = line.slice(currentLength);

  const units =
    direction === "in"
      ? Math.floor(currentLength / INDENT_UNIT) + count
      : Math.max(0, Math.ceil(currentLength / INDENT_UNIT) - count);

  return " ".repeat(units * INDENT_UNIT) + rest;
}

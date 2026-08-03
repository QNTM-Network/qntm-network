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
 * ── THE UNIT IS DECLARED, NOT HARDCODED — BUT IT WASN'T ALWAYS, AND THIS IS WHY THAT CHANGED ──
 *
 * `apps/qntm_md/src/qntm_md/render/renderer.py:947-950` emits `'    ' * depth` — four spaces per
 * nesting level, "because Obsidian writes four" (a rendition convention, not a structural fact:
 * `design-the-structural-language.md` §3 proves detection is unit-free, so this number changes no
 * edge, only whether a re-rendered line visibly jumps). `INDENT_UNIT` below used to be this app's
 * OWN hardcoded transcription of that literal. It is now the FALLBACK — the value used when
 * `presentation.json` declares no `indentUnit` of its own (`declaration.ts` reads that key; a
 * missing or malformed one already falls back to `DEFAULT_INDENT_UNIT`, which is the same `4`).
 * `indentedLine`'s new `unit` parameter is how the declared value reaches this module: the caller
 * (`app/index.html`) reads `presentation.json` once, and both the source-edit arithmetic here and
 * — where the golden master allows it — the on-screen margin in `paint.ts` derive from that one
 * read, rather than each carrying its own copy of the number.
 *
 * `app/present/paint.ts`'s checkbox-margin arithmetic — `(shape.indent.length / 2) * 1.2 + "rem"`,
 * a CSS margin transcribed from `app.html:246` — still treats TWO spaces as one level, and still
 * disagrees with the four this module now sources from config. `paint.ts`'s own header records
 * why: `tests/present-golden.test.mjs` compares the painted DOM byte-for-byte against the historical
 * `app.html:234-269` reference for indents of 1, 2 and 4 raw spaces, and changing the divisor
 * changes the `marginLeft` those cases assert — tried, confirmed to fail the golden, and reverted
 * rather than weakening that comparison to make room. It is a cosmetic finding, not a correctness
 * one: the CSS margin is still monotonic in the source indent (more indent, more margin), so it is
 * misleading, not misleading in a way that produces a WRONG source edit — the source edit is
 * computed here, from the raw character count and the declared unit, never from that CSS constant.
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

import { classifyLine } from "./rendition.js";

/**
 * Four spaces — the BUILT-IN FALLBACK, used only when `presentation.json` declares no
 * `indentUnit` of its own (or declares one `declaration.ts` could not read). See the module
 * header: this used to be the only value in the app; it is now the floor a declared value
 * overrides, matching every other silent-falls-through-to-default key in the cascade.
 */
export const INDENT_UNIT = 4;

const LEADING_WHITESPACE = /^\s*/;

/**
 * The new text for `line` after indenting (`"in"`) or outdenting (`"out"`) it by `count` units of
 * `unit` spaces.
 *
 * `unit` defaults to `INDENT_UNIT` so every existing caller — and every test written before
 * `presentation.json` carried `indentUnit` — is unchanged. `app/index.html` is the one caller that
 * passes a declared value explicitly, once it has read one (see the module header).
 *
 * Returns `line` UNCHANGED — not `null` — when the gesture has nothing to do: outdenting a line
 * already at zero, or a line this app refuses to touch at all (blank or heading; see the module
 * header). Returning the same string rather than a sentinel is deliberate: the caller hands the
 * result straight to `applyEdit`'s `set-line`, and that function's OWN rule — an edit whose text
 * equals the line already there is a refusal, not a successful no-op edit (`source.ts`) — is what
 * turns "nothing to do" into "post nothing", with no second no-op check needed here.
 */
export function indentedLine(
  line: string,
  direction: "in" | "out",
  count: number,
  unit: number = INDENT_UNIT,
): string {
  const shape = classifyLine(line);
  if (shape.kind === "blank" || shape.kind === "heading") {
    return line;
  }

  const match = LEADING_WHITESPACE.exec(line);
  const currentLength = match?.[0].length ?? 0;
  const rest = line.slice(currentLength);

  const units =
    direction === "in"
      ? Math.floor(currentLength / unit) + count
      : Math.max(0, Math.ceil(currentLength / unit) - count);

  return " ".repeat(units * unit) + rest;
}

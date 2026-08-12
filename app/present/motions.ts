/**
 * ModeSurface — vim's NORMAL/INSERT distinction, and the arithmetic its motions need. PURE. No
 * DOM, no fetch, no clock.
 *
 * ── READ THIS FIRST IF YOU CAME LOOKING FOR "THE MODE LEVEL" ──
 *
 * `PresentationLevel` (levels.ts) already has a rung literally spelled `MODE`, sixth in
 * `SPECIFICITY`, and the backlog already has a row for it — `add-the-mode-presentation-level`,
 * "reading versus authoring as ONE session-scoped contribution that shifts the default rendition
 * for every line". This module is NOT that row, and the difference is load-bearing rather than
 * naming trivia:
 *
 *   * READING/AUTHORING is a `Resolution` shift for the WHOLE VIEW, uniformly — flip it and every
 *     checkbox, heading and prose line on screen changes rendition together. It is exactly the
 *     shape `Contribution` already has: a partial record of `checkbox`/`heading`/`prose`/`tags`,
 *     the same vocabulary GLOBAL and USER speak, just scoped to a gesture instead of a login or an
 *     instance. research-polish-direction.md §5 ships it FIRST, before vim motions, "because #1
 *     proves the mode plumbing" — the two were always meant to be siblings, not the same thing.
 *
 *   * NORMAL/INSERT is a fact about exactly ONE line — the selected one — and every other line's
 *     rendition is completely unaffected by it. That is not "a narrower Resolution shift"; it is
 *     not a Resolution shift AT ALL. `ModeSurface` never imports `resolution.ts`, never produces a
 *     `Contribution`, and never touches `PresentationContext`. It answers a different question —
 *     which KEYS are live, and whether the selected line is an editable `<input>` or its ordinary
 *     rendered form with a selection mark — and that question has no `Rendition` in it.
 *
 * TRIED AND REJECTED: making NORMAL contribute `{checkbox: wired, heading: wired, prose: wired,
 * tags: wired}` at the MODE rung (a no-op against DEFAULT) and INSERT contribute nothing, leaving
 * `FocusSurface`'s existing FOCUS contribution to do the rest exactly as it does today. This looks
 * elegant and is wrong: it would make the mode a `Rendition` shift, which is the one thing
 * NORMAL/INSERT is not. MODE (the cascade rung) stays silent, exactly as `levels.ts` still says of
 * every rung today, and this module is the reason it gets to go on saying that truthfully.
 *
 * ── AND THE GATE THAT USED TO BE WRITTEN HERE WAS THE REAL DEFECT, NOT THE ALTERNATIVE ──
 *
 * This header used to argue the opposite of what is above it: that because NORMAL's selected line
 * "must NOT become an `<input>`", the raw-on-focus contribution "has to be GATED by mode", and
 * `paint.ts` therefore called `focus.contextFor` only while `mode.mode === "INSERT"`. THAT GATE WAS
 * WRONG AND IT SHIPPED. It contradicted the operator's founding rule for the surface, recorded in
 * `docs/implementation-artifacts/design-presentation-cascade.md` and in focus.ts's own header —
 * "cursor on the line → the line renders as its exact source text" — and in NORMAL the cursor IS on
 * the line. It also made `w`/`b`/`e` unrepeatable by construction: with the selected line rendered
 * as a widget there are no characters on screen for a column to move through, so the mode had
 * nowhere to put a cursor.
 *
 * TWO QUESTIONS WERE BEING ANSWERED WITH ONE BOOLEAN. "Does this line show its characters?" is the
 * cascade's, and FOCUS has always answered it the same way regardless of mode. "Is this line OPEN
 * FOR TYPING?" is this module's, and it is an EMBODIMENT question — an `<input>` in INSERT, a span
 * carrying a block cursor in NORMAL. `paint.ts` now splits them: `focusLive` is `focus !== undefined`
 * (what it was before this module existed) and the mode decides only which element the SAME raw
 * rendition is built out of. That split is the same family as `focus === undefined ? rawText(...) :
 * rawInput(...)` already was, and it is still never a second `Contribution`.
 *
 * ── SLICE 2 (2026-07-31): `a`, `o`/`O`, `x`, `{`/`}` — SAME RULE, MORE GESTURES ──
 *
 * None of these produce a `Contribution` either, for the same reason the first five did not — they
 * decide which keys are live and how the selected line is embodied, never how a line RENDERS.
 *
 *   `a` — INSERT with the caret at the END of the line, as a PARAMETER of entering INSERT rather
 *   than a second code path. `enterInsert` takes an optional `caret` and `i`/Enter simply do not
 *   pass one — same method, same effect KIND (`"enter-insert"`), one field apart.
 *
 *   `o`/`O` — open a new line below/above and enter INSERT on it. This module does not know what a
 *   new line IS (that is `seedFor`/`DraftSurface`, which this module still does not import), so it
 *   reports the DIRECTION and leaves opening it to the caller — the same split `move` already has
 *   between "which line" (decided here) and "what happens to it" (decided by `paint.ts`/the DOM
 *   wiring). See `newline.ts`'s `openLine`, the ONE function both Enter's mid-edit "open below" and
 *   this key now call — not a parallel implementation.
 *
 *   `x` — toggle done on the selected line, reusing `applyEdit`'s existing `set-checkbox` case
 *   (source.ts) rather than a new one. This module does not know whether the selected line HAS a
 *   checkbox either — that needs `classifyLine`, which is `resolution.ts`, which this module still
 *   does not import — so it reports the intent and the caller (which already has the source string)
 *   decides whether there is anything to toggle. CHOSEN OVER `Alt+D` (the operator's own Obsidian
 *   binding, research-polish-direction.md §5): `Alt`+letter is not reliably `e.key === "d"` across
 *   platforms — macOS turns Option+D into `"∂"` at the DOM layer, not `"d"` plus a modifier flag —
 *   and a binding that silently fails to fire on the operator's own OS, with no test able to catch
 *   it (this suite's stubs do not model real key composition), is worse than one that works
 *   everywhere. `x` is vim's own "act on what is under the cursor," repurposed from a character to
 *   a line the way every other binding here already repurposes column arithmetic into line
 *   arithmetic — and it costs nothing across platforms.
 *
 *   `{`/`}` — move to the previous/next structural boundary. THIS is the one gesture whose target
 *   line this module genuinely cannot compute: finding a boundary needs `classifyLine`
 *   (resolution.ts), and importing that here would be importing the SAME module the whole "not a
 *   Contribution" argument above turns on staying clear of. So `{`/`}` report a DIRECTION and a
 *   COUNT — the count-prefix arithmetic stays here, with every other motion's — and `boundary.ts`
 *   (a new, separate, pure module) answers "which line" from the source lines the DOM wiring
 *   already has. `ModeSurface` still imports nothing; `boundary.ts` imports `classifyLine` and
 *   nothing else, and is not this file.
 *
 * ── SLICE 4 (2026-07-31): `w`, `b`, `e` — word jump into INSERT ──
 *
 * SAME SHAPE AS `{`/`}`/`>`/`<`, ONE STEP FURTHER. Where the count-th TITLE word starts or ends
 * needs `titleSpans`, which needs `classifyLine` — `resolution.ts` again — so this module reports
 * only a motion letter (`"w"`/`"b"`/`"e"`) and a composed count; `word.ts`'s `wordCaret` turns that
 * into a column, or `null` on a line with no title. The caller computes the column from the reported
 * motion and count and applies it, exactly the way `{`/`}`'s caller calls
 * `focus.focus(boundaryLine(...))` rather than this module calling it.
 *
 * ── SLICE 5 (2026-07-31): `w`/`b`/`e` STAY IN NORMAL, AND THE CURSOR GAINS A COLUMN ──
 *
 * THE OPERATOR FALSIFIED SLICE 4 BY USING IT: "right now word jump also does insert. so i can't
 * jump through it just does first jump then wwww typed". Slice 4 ended `w` in `enterInsert(offset)`
 * on the reasoning — `design-the-vim-cursor.md` §2.2, labelled [REA] — that `w`/`b`/`e` need not be
 * repeatable NORMAL-mode motions because the platform's own `Option+←/→` would do the repeating
 * once the caret was in the line. He is a vim user. In vim `w` repeats, so the second `w` was a
 * literal `w` typed into the box.
 *
 * SO `w`/`b`/`e` ARE ORDINARY MOTIONS NOW: they move the COLUMN and leave `#mode` at `"NORMAL"`,
 * exactly as `j`/`k` move the line and leave it there. `handleKey` still does not flip `#mode` for
 * them — but where that used to mean "the caller finishes the job by entering INSERT", it now means
 * what it says. Nothing enters INSERT except `i`, `a`, `Enter`, `o`/`O` and a mouse click.
 *
 * THE COLUMN LIVES ON `FocusSurface`, NOT HERE, AND THE REASON IS THE ONE ALREADY WRITTEN DOWN.
 * focus.ts's `reanchor` carries a note left by the row that made the cursor an identity: if this
 * surface ever gains a column, `reanchor` must decide explicitly what happens to it, because
 * `anchor.text` is re-taken against the arriving projection and a column can therefore be CLAMPED
 * into the line's current characters rather than guessed. A column held here would have had no such
 * clamp available and no such arrival to hook. `design-the-vim-cursor.md` §1.4 argued the opposite
 * — that a column's lifetime is "one paint" and it "must not survive a repaint" — and that argument
 * held only while `w` ended in INSERT. A motion that repeats is a position that persists.
 *
 * THIS MODULE STILL IMPORTS NOTHING. It reads the column as an ARGUMENT (`handleKey`'s fourth
 * parameter) and reports columns as NUMBERS, the same way it has always read and reported line
 * indices. No `Contribution`, no `PresentationContext`, no `Rendition` — the boundary this header
 * opens with is exactly where it was.
 *
 * ── SLICE 3 (2026-07-31): `>` and `<` — indent and outdent the selected line ──
 *
 * SAME SHAPE AS `{`/`}`, FOR THE SAME REASON. Turning a keystroke into a new leading-whitespace
 * string needs `classifyLine` — a heading and a blank line are both refused, see `indent.ts` for
 * why — so this module reports only a DIRECTION (`"in"`/`"out"`) and a COUNT, composed with the
 * same count-prefix arithmetic every other motion here already shares (`3>` indents three units in
 * one keystroke, exactly as `3}` jumps three boundaries). `indent.ts`, a new pure module the same
 * shape as `boundary.ts`, turns that into the line's new text; this module still imports nothing.
 * NOT bound to `Tab`/`Shift-Tab`: `Tab` carries a browser focus-move default this app does not
 * intercept, `Tab` inside INSERT is already an accidental line-commit (see `paint.ts`'s blur-
 * settles-the-input path), and this module's own `handleKey(key, …)` takes no modifier argument, so
 * `Tab` and `Shift-Tab` would arrive as the identical `key` value and be indistinguishable here.
 * `>`/`<` are vim's own indent keys, carry no browser default, and need no signature change.
 *
 * COUNT COMPOSITION, DECIDED PER KEY, NOT ONCE FOR ALL OF THEM. `j`/`k`/`G`/`{`/`}` are motions —
 * repeating one is well-defined and vim does it, so a pending count multiplies them exactly as it
 * always has. `i`/Enter/`a` enter INSERT once regardless of a pending count: vim's own repeat-on-
 * insert only takes effect on the LATER `Escape` (replay the typed text N times), which this
 * module does not implement, so a count in front of `i`/Enter/`a` has no observable difference from
 * its absence and discarding it silently is not confusing anyone — the app enters INSERT once
 * either way, exactly what `i`/Enter already did before this slice. `o`/`O`/`x` are the opposite
 * case: a count WOULD obviously change what they do (open N lines; nothing well-defined for
 * "toggle done 3 times"), the brief is explicit that repeating an OPEN is a much bigger write than
 * repeating a MOVE, and that write is not attempted here — so a pending count in front of `o`/`O`/`x`
 * makes them consumed-but-inert (`handled: true`, `effect: {kind: "none"}`) rather than silently
 * doing the un-counted version and leaving the operator to notice the count was ignored.
 *
 * ── WHAT THIS MODULE ACTUALLY OWNS ──
 *
 *   1. `Mode` — `"NORMAL"` (no `<input>` is open; the selected line shows its exact source
 *      characters with a BLOCK cursor on one of them) or `"INSERT"` (an `<input>` holds those same
 *      characters and a text caret sits between two of them). BOTH RENDITIONS ARE RAW. What changes
 *      between them is which element carries the characters and whether a keystroke can alter them.
 *   2. `clampLine` and `clampColumn` — the arithmetic every motion shares, one per axis: no wrap,
 *      clamp into the range that exists, exactly as vim's own `j`/`k` refuse to leave the buffer
 *      and its own `l` refuses to leave the line.
 *   3. `ModeSurface.handleKey` — one NORMAL-mode keystroke in, one outcome out: whether it was
 *      recognised (so the caller knows whether to `preventDefault`), and what happened (move the
 *      selection, start editing, ask for a new line, ask for a checkbox toggle, or ask for a
 *      boundary jump). It owns the count-prefix digits and the two-key `gg` binding; the caller
 *      owns applying the outcome to `FocusSurface`/`DraftSurface`/`applyEdit` and repainting —
 *      never re-deciding anything this module already decided.
 */

/**
 * NORMAL: the selected line's own characters, with a block cursor on one of them and no `<input>`
 * open. INSERT: an `<input>` holds those same characters and a keystroke can change them.
 */
export type Mode = "NORMAL" | "INSERT";

/**
 * Clamp `index` into the closed range `[0, lastIndex]`. No wrap — vim's `j`/`k`/`gg`/`G` never
 * carry the cursor past either end of the buffer, they stop at it.
 *
 * `lastIndex < 0` (an empty source — not even one line) clamps to `0` rather than going negative,
 * so a caller never has to special-case "there is nothing to select" before asking for a line.
 */
export function clampLine(index: number, lastIndex: number): number {
  const floor = 0;
  const ceiling = lastIndex < 0 ? 0 : lastIndex;
  return Math.max(floor, Math.min(index, ceiling));
}

/**
 * Clamp `column` into the characters of `text` — the SAME no-wrap rule `clampLine` applies to a
 * line index, applied to the other axis, and kept beside it so there is one place to read both.
 *
 * THE CEILING IS `text.length - 1`, NOT `text.length`, and that is vim's own rule rather than an
 * off-by-one: in NORMAL the cursor sits ON a character, so the last position it can occupy is the
 * last character. An empty string has no character to sit on, so the ceiling floors at `0` and the
 * cursor rests on the empty cell. `a` is what reaches `text.length` (one past the last character),
 * and it reaches it by asking for `column + 1` and being clamped by the painter against the line it
 * is about to open — not by this function widening.
 *
 * `text === null` MEANS "NO TEXT TO CLAMP AGAINST", which is a real configuration rather than a
 * missing one: `FocusSurface.focus` takes its source string optionally (see focus.ts), and a caller
 * that did not supply one has given this function nothing to measure. The column is floored at zero
 * and otherwise left alone, which is the same posture `focus` already takes for the anchor.
 */
export function clampColumn(column: number, text: string | null): number {
  if (!Number.isFinite(column) || column < 0) {
    return 0;
  }
  const at = Math.floor(column);
  if (text === null) {
    return at;
  }
  return Math.min(at, Math.max(0, text.length - 1));
}

/**
 * WHAT AN INSERT GESTURE MEANT, WITH NO ARITHMETIC IN IT.
 *
 * `i`/Enter mean "at the cursor's own column"; `a` means "one past the character under it". This
 * module used to answer those itself — `enterInsert(column)` and `enterInsert(column + 1)` — and it
 * had no business doing so: it IMPORTS NOTHING, so it cannot see the line those columns index, and
 * the clamp that made `column + 1` safe was stranded two modules away in `paint.ts`. Arithmetic
 * split from the string it measures is how `a` came to place a caret the cursor surface never
 * learned about (measured 2026-08-12; the backlog row is
 * `focus-column-does-not-follow-the-caret`). Both halves now live in `column.ts`, together.
 *
 * SPELLED AS A LOCAL UNION RATHER THAN IMPORTED FROM `column.ts`, DELIBERATELY. This module
 * imports nothing at all — that is what proves `ModeSurface` cannot reach the cascade even by
 * accident, and `tests/flow_scenarios/vim_gestures.ts` ENFORCES it by reading this file's source
 * for `import` lines. Coupling to `CursorInstruction` by string value is the price of keeping that
 * invariant, and it is cheaper than breaking it. `column.ts` names the same two strings.
 */
export type CaretIntent = "insert" | "append";

/** What a NORMAL-mode keystroke does, once it is fully decided. */
export type NormalEffect =
  | { readonly kind: "none" }
  | { readonly kind: "move"; readonly lineIndex: number }
  /**
   * `caret` is a PARAMETER of entering INSERT, not a second effect kind. It is now ALWAYS supplied
   * and it is always a COLUMN: `i` opens at the cursor's own column and `a` at `column + 1`, both
   * measured in the same offsets-into-the-source-line the NORMAL cursor itself uses. There is one
   * coordinate system on this axis and this field speaks it.
   *
   * IT USED TO BE `"end"` FOR `a` AND ABSENT FOR `i`, WHICH WAS THE ABSENCE OF A COLUMN SPEAKING.
   * With no column in NORMAL, `a` had nowhere to be "after" and the only well-defined place left
   * was the end of the line; `i` had nowhere to open and took whatever the browser did. Both are
   * now decided, so neither guess is left. `a` still lands at the end of the line when the cursor is
   * on its last character — that is `column + 1` arriving there, not a special case.
   */
  | { readonly kind: "enter-insert"; readonly caret: CaretIntent }
  /**
   * `0`/`$` asked for the START or the END of the selected line. UNLIKE `w`/`b`/`e` these need no
   * grammar at all — column zero and "the last character" are facts about the STRING, not about its
   * title — so no module has to answer a second question and the caller applies them directly from
   * the line it already has. That is why they cost nothing to ship beside the word motions.
   *
   * THEY ARE THE SOURCE LINE'S OWN ENDS, NOT THE TITLE'S, and the two really do differ: `0` on
   * `        - [ ] Pay aug [[qntm:1234]] #task` is the first space of the indent, not the `P` of
   * `Pay`. That is vim's `0`, which is what the operator is asking for by pressing it — `^` is the
   * key that means "the first thing that is not whitespace" and it is not bound here.
   */
  | { readonly kind: "column"; readonly to: "start" | "end" }
  /**
   * `o`/`O` asked for a new line. This module does not know what a new line IS — that is
   * `seedFor`/`DraftSurface` (newline.ts), which stays unimported here — so it reports only WHERE:
   * `"below"` the selected line or `"above"` it. The caller opens it, exactly the split `move`
   * already draws between "which line" (here) and "what that means" (the caller).
   */
  | { readonly kind: "open"; readonly direction: "above" | "below" }
  /** `x` asked to toggle done on the selected line. Whether it HAS a checkbox is the caller's to
   * decide — this module does not import `resolution.ts`'s `classifyLine` either. */
  | { readonly kind: "toggle-done" }
  /**
   * `{`/`}` asked for the boundary `count` jumps away, in `direction`. This module cannot compute
   * WHICH LINE that is — that needs `classifyLine` (resolution.ts) over the actual source lines,
   * which this module has never had and still does not import — so it reports direction and count,
   * the same count-prefix arithmetic every other motion already shares, and leaves "which line" to
   * `boundary.ts`, a separate pure module the caller consults.
   */
  | { readonly kind: "boundary"; readonly direction: "prev" | "next"; readonly count: number }
  /**
   * `>`/`<` asked to indent/outdent the selected line `count` units. This module cannot compute
   * the new TEXT — that needs `classifyLine` to refuse a blank or heading line, which is
   * `indent.ts`'s job (this module still does not import it) — so it reports direction and the
   * same composed count every other motion reports.
   */
  | { readonly kind: "indent"; readonly direction: "in" | "out"; readonly count: number }
  /**
   * `w`/`b`/`e` asked to jump `count` title words and enter INSERT there. This module cannot
   * compute the caret OFFSET that lands on — that needs `titleSpans` (resolution.ts), which is
   * `word.ts`'s job (this module still does not import it) — so it reports the motion letter and
   * the same composed count every other motion reports. The caller calls `wordCaret`, then this
   * surface's own `enterInsert(offset)` if one was found; `handleKey` does not flip `#mode` here.
   */
  | { readonly kind: "word"; readonly motion: "w" | "b" | "e"; readonly count: number };

/** One keystroke's outcome: whether it was consumed, and what it did. */
export interface NormalKeyOutcome {
  /**
   * Whether this key was ONE OF NORMAL MODE'S BINDINGS. The caller's rule is the brief's own:
   * "anything unbound is ignored, not swallowed — do not `preventDefault()` on keys you do not
   * handle." A digit that is only ACCUMULATING a count (nothing moved yet) still counts as
   * handled: it was consumed into the pending count, which is a real outcome even though nothing
   * about the selection changed yet.
   */
  readonly handled: boolean;
  readonly effect: NormalEffect;
}

const DIGIT = /^[0-9]$/;

export class ModeSurface {
  #mode: Mode = "NORMAL";
  #count = "";
  #pendingG = false;
  #caretHint: CaretIntent | undefined = undefined;

  get mode(): Mode {
    return this.#mode;
  }

  /**
   * Start editing — an `<input>` is about to hold the selected line's characters. Called by
   * `handleKey` for `i`/`Enter`/`a`, and by the DOM wiring for a mouse click, which has meant "edit
   * this line" since before this module existed and goes on meaning it.
   *
   * `caret` IS A COLUMN AND NOTHING ELSE. `i` passes the cursor's own column and `a` passes
   * `column + 1`; a mouse click passes nothing, because a click puts the caret where the person
   * clicked and the painter must not overrule that.
   *
   * IT USED TO ACCEPT `"end"` AS WELL, AND THAT UNION IS GONE ON PURPOSE. `"end"` was shorthand for
   * "the column one past the last character" from a time when NORMAL had no column to be one past
   * — the string was standing in for arithmetic nothing could do yet. Now the cursor HAS a column,
   * `a` is `column + 1`, and a second way of naming a position on the same axis would be exactly
   * the second coordinate system this change is under instruction not to introduce.
   * See `takeCaretHint` for how the painter reads it back.
   */
  enterInsert(caret?: CaretIntent): void {
    this.#mode = "INSERT";
    this.#caretHint = caret;
    this.#count = "";
    this.#pendingG = false;
  }

  /**
   * The caret hint set by the last `enterInsert`, consumed once and cleared.
   *
   * CONSUMED RATHER THAN JUST READ, so a later repaint of the SAME INSERT session (there is none
   * today — nothing repaints an open `<input>` while it holds focus — but the consume-once shape is
   * what stops one arriving unnoticed and re-applying a stale "jump to the end" over wherever the
   * operator has since moved the caret by hand) cannot reapply it. The painter calls this exactly
   * once, at the moment it builds the `<input>` the hint was for.
   */
  takeCaretHint(): CaretIntent | undefined {
    const hint = this.#caretHint;
    this.#caretHint = undefined;
    return hint;
  }

  /**
   * Leave editing — the selected line PERSISTS (FocusSurface's `lineIndex` is not touched here;
   * see paint.ts's `settle`, which stops calling `focus.blur()` once a `ModeSurface` is wired in,
   * for exactly this reason). Vim always has a cursor on some line; only whether that line is open
   * for text ever turns off.
   */
  enterNormal(): void {
    this.#mode = "NORMAL";
    this.#caretHint = undefined;
    this.#count = "";
    this.#pendingG = false;
  }

  /**
   * One keystroke while in NORMAL mode. No-op (and reports unhandled) while in INSERT — the
   * `<input>`'s own keydown listener owns keys once one is open, and this module never reaches
   * into it.
   *
   * `current`/`lastIndex` are `FocusSurface.lineIndex` (never `null` while vim owns the cursor —
   * the DOM wiring is responsible for giving it a starting value) and the last valid line index
   * for the view being shown.
   *
   * `column` IS THE CURSOR'S OTHER AXIS AND IT IS AN INPUT, NOT A DECISION MADE HERE. It arrives
   * from `FocusSurface.column` exactly as `current` arrives from `FocusSurface.lineIndex`, and this
   * module reads it for `i`/`a` (which open INSERT relative to it) and for nothing else. It
   * defaults to `0` so every caller written before the column existed goes on compiling and goes on
   * meaning what it meant: `i` at column zero is the start of the line.
   *
   * COUNT PREFIX: digits accumulate; `1`-`9` may start one, `0` may only CONTINUE one already
   * started. A BARE `0` IS NOW COLUMN ZERO, which is a change: it was left unbound while the cursor
   * had no column to send to zero, and "left unbound until there is something for it to mean" is
   * what that note in the brief was recording. There is now.
   *
   * `gg`: the one two-key binding. A `g` that is not followed by a second `g` is silently
   * abandoned and the key that broke the pair is processed as an ordinary keystroke — so `g` then
   * `j` moves down by one rather than doing nothing at all.
   */
  /**
   * `column` IS GONE FROM THIS SIGNATURE (2026-08-12) AND ITS ABSENCE IS THE POINT. It existed so
   * `i`/`a` could compute `column` and `column + 1`. This module imports nothing and therefore
   * cannot see the line those numbers index, so computing them here was always arithmetic performed
   * out of sight of its own operand — and the clamp that made `column + 1` safe lived in paint.ts,
   * two modules away. `column.ts` holds both halves now, and once it did, this parameter was read
   * by nothing. A parameter a module cannot use is the same "looks like data, means nothing" shape
   * as the literal `0` this whole change removed from `focus()`; it is deleted for the same reason.
   */
  handleKey(key: string, current: number, lastIndex: number): NormalKeyOutcome {
    if (this.#mode !== "NORMAL") {
      return { handled: false, effect: { kind: "none" } };
    }

    if (this.#pendingG) {
      this.#pendingG = false;
      if (key === "g") {
        this.#count = "";
        return { handled: true, effect: { kind: "move", lineIndex: clampLine(0, lastIndex) } };
      }
      // Not the second `g` — fall through and let the rest of this method decide what `key` does.
    }

    if (key === "g") {
      this.#pendingG = true;
      return { handled: false, effect: { kind: "none" } };
    }

    if (DIGIT.test(key)) {
      if (key === "0" && this.#count === "") {
        // A BARE `0` IS THE MOTION, A `0` AFTER A DIGIT IS PART OF THE COUNT. Both are vim's own
        // rule and the order here is what keeps them apart: `10j` is ten lines down, `0` on its own
        // is the start of the line, and neither can be mistaken for the other because the pending
        // count is what decides which one this keystroke is.
        return { handled: true, effect: { kind: "column", to: "start" } };
      }
      this.#count += key;
      return { handled: true, effect: { kind: "none" } };
    }

    const pending = this.#count === "" ? null : Number(this.#count);
    this.#count = "";

    switch (key) {
      case "j":
      case "ArrowDown":
        // `ArrowDown` ALONGSIDE `j`, NOT INSTEAD OF IT — the SAME two-names-one-motion shape
        // `app/shell/drawer.ts`'s `drawerKey` already commits to for its own row list (`ArrowDown`/
        // `j` there, bound per-stop, only while a drawer row holds focus). The operator's own words
        // named the gesture, not the letter: "selecting up and down sort of has the old placed
        // order, not the resolved post ordering rules order" — pressed live, `ArrowDown` reached
        // NOTHING here (this `switch` had no case for it, so `handleKey` fell to `default` and
        // returned `handled: false`; the caller's `if (!outcome.handled) return;` then never even
        // called `e.preventDefault()`) while `j` moved correctly. This was never a routing
        // problem — `document`'s global `keydown` handler (`app/index.html`) already reaches this
        // module for every unmodified keystroke outside the drawer/an `<input>`; the key was simply
        // never one of this switch's cases. Composes with a pending count exactly as `j` does:
        // `3` then `ArrowDown` moves three lines, the same arithmetic `10j` already shares.
        return {
          handled: true,
          effect: { kind: "move", lineIndex: clampLine(current + (pending ?? 1), lastIndex) },
        };
      case "k":
      case "ArrowUp":
        // See `ArrowDown`, immediately above — the same alias, the other direction.
        return {
          handled: true,
          effect: { kind: "move", lineIndex: clampLine(current - (pending ?? 1), lastIndex) },
        };
      case "G":
        // Bare `G`: last line. `{count}G`: line `count`, 1-indexed — vim's own convention, so
        // `3G` lands on the THIRD line, index 2.
        return {
          handled: true,
          effect: {
            kind: "move",
            lineIndex: pending === null ? clampLine(lastIndex, lastIndex) : clampLine(pending - 1, lastIndex),
          },
        };
      case "i":
      case "Enter":
        // AT THE CURSOR'S OWN COLUMN, which is what `i` has always meant in vim and what this app
        // could not offer until NORMAL had a column to be at. Before this, `i` opened the `<input>`
        // and took whatever caret position the browser chose after `value =` then `focus()`.
        this.enterInsert("insert");
        return { handled: true, effect: { kind: "enter-insert", caret: "insert" } };
      case "a":
        // ONE PAST THE CURSOR — vim's own `a`, "append AFTER the character under the cursor". On the
        // line's LAST character that is the end of the line, which is what `a` did before this
        // change, so the old behaviour is the new arithmetic's boundary case rather than a rule that
        // had to be kept. The painter clamps it against the line it is about to open, so `column + 1`
        // can never point past the characters that exist (paint.ts, the caret seed).
        //
        // A PENDING COUNT IS DISCARDED, NOT REFUSED. See the header: `i`/Enter/`a` enter INSERT
        // once regardless of a count, because the count's only vim meaning (repeat the typed text
        // on Escape) is not implemented, so there is no counted behaviour a bare `a` could be
        // mistaken for skipping.
        this.enterInsert("append");
        return { handled: true, effect: { kind: "enter-insert", caret: "append" } };
      case "$":
        // THE OTHER HALF OF `0`, AND THE SAME NON-COST. "The last character of the line" needs the
        // line's LENGTH and nothing else, so like `0` it asks no module a second question — the
        // caller applies it from the string it already has.
        return { handled: true, effect: { kind: "column", to: "end" } };
      case "o":
        if (pending !== null) {
          // A COUNT IS REFUSED, NOT DISCARDED. Unlike `a` above, `3o` has an obvious counted
          // meaning (open three lines) that this module does not implement, so acting on the
          // un-counted version would silently do something other than what was asked. See header.
          return { handled: true, effect: { kind: "none" } };
        }
        return { handled: true, effect: { kind: "open", direction: "below" } };
      case "O":
        if (pending !== null) {
          return { handled: true, effect: { kind: "none" } };
        }
        return { handled: true, effect: { kind: "open", direction: "above" } };
      case "x":
        if (pending !== null) {
          // Same refusal as `o`/`O`: "toggle done three times" has no well-defined meaning, so a
          // count in front of `x` is consumed and does nothing rather than toggling once anyway.
          return { handled: true, effect: { kind: "none" } };
        }
        return { handled: true, effect: { kind: "toggle-done" } };
      case "{":
        // A MOTION LIKE EVERY OTHER ONE — the count composes exactly as `j`/`k`/`G`'s already do.
        // `boundaryLine` (boundary.ts) decides which line; this only decides direction and count.
        return { handled: true, effect: { kind: "boundary", direction: "prev", count: pending ?? 1 } };
      case "}":
        return { handled: true, effect: { kind: "boundary", direction: "next", count: pending ?? 1 } };
      case ">":
        // A MOTION LIKE EVERY OTHER ONE — `3>` indents three units in one keystroke, the same
        // count-prefix arithmetic `{`/`}`/`j`/`k`/`G` already compose. `indent.ts`'s `indentedLine`
        // decides the actual text; this only decides direction and count.
        return { handled: true, effect: { kind: "indent", direction: "in", count: pending ?? 1 } };
      case "<":
        return { handled: true, effect: { kind: "indent", direction: "out", count: pending ?? 1 } };
      case "w":
        // A MOTION LIKE EVERY OTHER ONE — the count composes exactly as `{`/`}`/`>`/`<`'s already
        // do. `wordCaret` (app/present/word.ts) decides the actual offset and whether one exists;
        // this only decides the motion letter and count. See the header for why `#mode` does NOT
        // change here, unlike `i`/Enter/`a`.
        return { handled: true, effect: { kind: "word", motion: "w", count: pending ?? 1 } };
      case "b":
        return { handled: true, effect: { kind: "word", motion: "b", count: pending ?? 1 } };
      case "e":
        return { handled: true, effect: { kind: "word", motion: "e", count: pending ?? 1 } };
      default:
        return { handled: false, effect: { kind: "none" } };
    }
  }
}

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
 * elegant and is wrong: `FocusSurface.contextFor` contributes raw-on-every-key unconditionally
 * whenever a line is focused, with no mode concept at all, because until this module existed
 * "focused" and "editing" were the same fact. Vim's whole point is that they are not — NORMAL
 * mode's selected line is FocusSurface's `lineIndex` too (the brief is explicit that motions are
 * arithmetic on that one number, and there must be exactly one cursor, not two competing ideas of
 * where it is), yet that line must NOT become an `<input>`. So the raw-on-focus contribution has
 * to be GATED by mode — see `paint.ts`, which only calls `focus.contextFor` while `mode.mode` is
 * `"INSERT"` (or no `ModeSurface` is wired at all, which preserves every caller that predates this
 * change: click-to-edit, with no vim concept in the picture, keeps working exactly as it did).
 * That gate lives in the PAINTER, as an embodiment choice in the same family as `focus === undefined
 * ? rawText(...) : rawInput(...)` — never as a second `Contribution`. Confirms the module boundary
 * drawn above: MODE (the cascade rung) stays silent, exactly as `levels.ts` still says of every
 * rung today, and this module is the reason it gets to go on saying that truthfully.
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
 * into a caret offset, or `null` on a line with no title. The one way this differs from `{`/`}` and
 * `>`/`<`: those effects leave `Mode` untouched (a line move, an edit) and this one MUST end in
 * INSERT, which is `enterInsert(caret)`'s job — but this module still cannot call it, because it
 * does not have the offset. So `handleKey` does NOT flip `#mode` for `w`/`b`/`e`; the caller
 * computes the offset from the reported motion and count, then calls `mode.enterInsert(offset)`
 * itself if one was found, exactly the way `{`/`}`'s caller calls `focus.focus(boundaryLine(...))`
 * rather than this module calling it. See word.ts for the full argument, including why a count
 * with no established caret column is anchored to a fixed end of the title rather than to a
 * remembered position.
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
 *   1. `Mode` — `"NORMAL"` (no `<input>` is open; the selected line is a LINE SELECTION, not a
 *      text caret) or `"INSERT"` (an `<input>` holds the selected line's exact source characters —
 *      what the app already did before this module existed, and unchanged by it).
 *   2. `clampLine` — the arithmetic every motion shares: no wrap, clamp into `[0, lastIndex]`,
 *      exactly as vim's own `j`/`k` refuse to leave the buffer.
 *   3. `ModeSurface.handleKey` — one NORMAL-mode keystroke in, one outcome out: whether it was
 *      recognised (so the caller knows whether to `preventDefault`), and what happened (move the
 *      selection, start editing, ask for a new line, ask for a checkbox toggle, or ask for a
 *      boundary jump). It owns the count-prefix digits and the two-key `gg` binding; the caller
 *      owns applying the outcome to `FocusSurface`/`DraftSurface`/`applyEdit` and repainting —
 *      never re-deciding anything this module already decided.
 */

/** NORMAL: a line selection, no `<input>` open. INSERT: an `<input>` holds the line's characters. */
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

/** What a NORMAL-mode keystroke does, once it is fully decided. */
export type NormalEffect =
  | { readonly kind: "none" }
  | { readonly kind: "move"; readonly lineIndex: number }
  /**
   * `caret` is a PARAMETER of entering INSERT, not a second effect kind — `i`/Enter omit it
   * (unspecified caret, exactly what they did before this field existed) and `a` sets `"end"`.
   */
  | { readonly kind: "enter-insert"; readonly caret?: "end" }
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
  #caretHint: "end" | number | undefined = undefined;

  get mode(): Mode {
    return this.#mode;
  }

  /**
   * Start editing — an `<input>` is about to hold the selected line's characters. Called by
   * `handleKey` for `i`/`Enter`/`a`, and by the DOM wiring for a mouse click, which has meant "edit
   * this line" since before this module existed and goes on meaning it.
   *
   * `caret` IS THE PARAMETER `a` NEEDED, NOT A SECOND METHOD. `i`/Enter/a mouse click all pass
   * nothing (unspecified — the `<input>` gets whatever position it always got, undisturbed) and
   * `a` passes `"end"`. `w`/`b`/`e` (slice 4) pass a NUMBER — the offset `word.ts`'s `wordCaret`
   * computed — which is why this parameter is `"end" | number` rather than the narrower `"end"`
   * slice 1 shipped: a caret seed is a column, and `"end"` was always shorthand for "the column
   * one past the last character", not a fact any type poorer than a number should have to name.
   * See `takeCaretHint` for how the painter reads it back.
   */
  enterInsert(caret?: "end" | number): void {
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
  takeCaretHint(): "end" | number | undefined {
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
   * COUNT PREFIX: digits accumulate; `1`-`9` may start one, `0` may only CONTINUE one already
   * started (a bare `0` is left unbound rather than guessed at as "column zero", per the brief).
   * Any non-digit key — bound or not — consumes and clears the pending digits, which is why the
   * count is reset before the switch below runs rather than only inside the branches that use it.
   *
   * `gg`: the one two-key binding. A `g` that is not followed by a second `g` is silently
   * abandoned and the key that broke the pair is processed as an ordinary keystroke — so `g` then
   * `j` moves down by one rather than doing nothing at all.
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
        return { handled: false, effect: { kind: "none" } };
      }
      this.#count += key;
      return { handled: true, effect: { kind: "none" } };
    }

    const pending = this.#count === "" ? null : Number(this.#count);
    this.#count = "";

    switch (key) {
      case "j":
        return {
          handled: true,
          effect: { kind: "move", lineIndex: clampLine(current + (pending ?? 1), lastIndex) },
        };
      case "k":
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
        this.enterInsert();
        return { handled: true, effect: { kind: "enter-insert" } };
      case "a":
        // A PENDING COUNT IS DISCARDED, NOT REFUSED. See the header: `i`/Enter/`a` enter INSERT
        // once regardless of a count, because the count's only vim meaning (repeat the typed text
        // on Escape) is not implemented, so there is no counted behaviour a bare `a` could be
        // mistaken for skipping.
        this.enterInsert("end");
        return { handled: true, effect: { kind: "enter-insert", caret: "end" } };
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

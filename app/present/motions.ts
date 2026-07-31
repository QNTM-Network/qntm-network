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
 * ── WHAT THIS MODULE ACTUALLY OWNS ──
 *
 *   1. `Mode` — `"NORMAL"` (no `<input>` is open; the selected line is a LINE SELECTION, not a
 *      text caret) or `"INSERT"` (an `<input>` holds the selected line's exact source characters —
 *      what the app already did before this module existed, and unchanged by it).
 *   2. `clampLine` — the arithmetic every motion shares: no wrap, clamp into `[0, lastIndex]`,
 *      exactly as vim's own `j`/`k` refuse to leave the buffer.
 *   3. `ModeSurface.handleKey` — one NORMAL-mode keystroke in, one outcome out: whether it was
 *      recognised (so the caller knows whether to `preventDefault`), and what happened (move the
 *      selection, or start editing). It owns the count-prefix digits and the two-key `gg` binding;
 *      the caller owns nothing but applying the outcome to `FocusSurface` and repainting.
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
  | { readonly kind: "enter-insert" };

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

  get mode(): Mode {
    return this.#mode;
  }

  /**
   * Start editing — an `<input>` is about to hold the selected line's characters. Called by
   * `handleKey` for `i`/`Enter`, and by the DOM wiring for a mouse click, which has meant "edit
   * this line" since before this module existed and goes on meaning it.
   */
  enterInsert(): void {
    this.#mode = "INSERT";
    this.#count = "";
    this.#pendingG = false;
  }

  /**
   * Leave editing — the selected line PERSISTS (FocusSurface's `lineIndex` is not touched here;
   * see paint.ts's `settle`, which stops calling `focus.blur()` once a `ModeSurface` is wired in,
   * for exactly this reason). Vim always has a cursor on some line; only whether that line is open
   * for text ever turns off.
   */
  enterNormal(): void {
    this.#mode = "NORMAL";
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
      default:
        // Unbound, INCLUDING `a` — the brief allows entering INSERT with the caret at end-of-line
        // "if it falls out cheaply, otherwise skip it". Threading a caret-position preference
        // through to the `<input>` paint.ts creates on the next repaint is not cheap: `raw()`'s
        // autofocus has no such parameter today, and adding one is a real change to a function
        // that also serves plain click-to-edit. Skipped, so `a` is left unbound rather than
        // shipped as a false synonym for `i`.
        return { handled: false, effect: { kind: "none" } };
    }
  }
}

/**
 * FocusSurface — where the cursor is, and the FOCUS-level contribution derived from it.
 *
 * PURE. No DOM, no fetch, no clock. It holds WHERE THE CURSOR IS and turns it into a level, which
 * is the whole of the operator's rule expressed as data:
 *
 *   cursor on the line  -> the line renders as its exact source text
 *   cursor off the line -> the resolved rendition, clickable
 *
 * THAT RULE HAS NO MODE IN IT, AND FOR ONE RELEASE THE PAINTER PUT ONE THERE. `paint.ts` gated the
 * contribution below on `mode.mode === "INSERT"`, so in NORMAL — where the cursor IS on the line —
 * the line went on showing its rendition. The gate is gone (see motions.ts for the full account);
 * `focusLive` is `focus !== undefined`, which is what it was before vim existed. NORMAL and INSERT
 * are two EMBODIMENTS of the one raw rendition this class asks for, not two answers to it.
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
 * WAS CHECKED RATHER THAN ASSUMED. An anchor is derived from a source string and a line index at
 * the instant the cursor lands, held for as long as the cursor is on that line, and dropped with
 * it. Nothing serves it, nothing stores it, and no file records it — so the rule above survives
 * intact. It is also not a second CONCERN, which is the test `draft.ts` applies to the same
 * question and answers the other way: `DraftSurface` holds an uncommitted EDIT and this holds
 * neither more nor less than it always did — WHICH LINE the cursor is on. The anchor is that same
 * one fact, correctly typed. `design-the-edit-is-a-safe-haven.md` §5.2 says so in as many words:
 * ANCHOR "exists but is the wrong type. It is an index; the world moving changes indices."
 *
 * ── THE ANCHOR IS NOW AN INSTANCE, NOT A WALK OF FOUR RUNGS (2026-07-31, SAME DAY) ──
 *
 * `anchor.ts`'s four-rung walk (STAMP, STAMP_IN_SECTION, TEXT, TEXT_IN_SECTION) was the FIRST
 * correct type for this fact, and it is now RETIRED, not merely superseded — see instance.ts's own
 * header for why it is deleted rather than left beside its replacement. What this surface holds is
 * an `InstanceAnchor` (`instance.ts`): the row's own `${view}/${section}/${token}` id, plus the
 * node it names, if any. `resolveInstanceAnchor` is a TWO-TIER walk, not four: instance match first
 * (the same printing — cursor holds), node match second, over the whole projection, ONLY when the
 * instance did not match (the printing moved section — cursor follows, and the caller learns that
 * from `reading.via === "node"`). Ambiguous and absent are unchanged in spirit: a node matching more
 * than once is refused, not guessed, and nothing answering is reported rather than silent.
 *
 * THIS IS A BEHAVIOUR-PRESERVING SWAP, NOT A NARROWER ONE — the one property worth stating plainly
 * because it is the one regression risk in the whole change: A STAMPED NODE THAT MOVES SECTION
 * STILL KEEPS THE CURSOR. The four-rung STAMP tier searched the whole file by stamp alone, ignoring
 * section, so a node moving section was still found; a NAIVE pure instance lookup (matching only
 * `instance`, which encodes section) would have lost that — design doc §3.3's refutation 1. It does
 * not, here, because `resolveInstanceAnchor`'s SECOND tier is exactly that whole-file stamp search,
 * carried over unchanged in spirit and proven in tests/present-anchor.test.mjs.
 *
 * NO NEW CONTRIBUTION AND NO NEW LEVEL. `contextFor` is untouched, `FOCUSED` is untouched, and the
 * cascade cannot tell that this class changed. The anchor decides WHERE the cursor is; it never
 * decides how anything renders.
 *
 * ── AND THE COLUMN, WHICH IS THE SAME KIND OF FACT AGAIN ──
 *
 * `w`/`b`/`e` repeat in NORMAL, so the cursor is a LINE AND A COLUMN. The column is an offset into
 * the line the anchor already names — never a second coordinate system — and it is subject to every
 * word above: derived, held while the cursor is there, dropped with it, declared by nothing and
 * served by nothing. `contextFor` does not read it and the cascade still cannot tell it exists,
 * which is what keeps "the cursor always wins" a fact about the ORDER of the levels and not about
 * how far along a line the operator happens to be.
 *
 * `design-the-vim-cursor.md` §1.4 said a column's lifetime is "one paint" and that it "must not
 * survive a repaint". That was true of a column written once at the NORMAL→INSERT transition, which
 * is what the same document's §2.2 designed. It is false of a column a motion repeats against, and
 * §1.4's own table is amended in that document rather than left contradicting this file.
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
import { instanceAnchorFor, resolveInstanceAnchor } from "./instance.js";
import type { InstanceAnchor, InstanceReading } from "./instance.js";
import { clampColumn } from "./motions.js";
import { columnFor } from "./column.js";
import type { CursorInstruction } from "./column.js";
import { RESOLUTION_KEYS } from "./express/rendition.js";
import type { Contribution, Rendition } from "./express/rendition.js";

/**
 * The characters of the line at `lineIndex`, or `null` when there is no source to read them from.
 *
 * `null` IS NOT AN ERROR. `focus` takes its source optionally (see below), and a caller that gave
 * none has given this nothing to measure — `clampColumn` says what happens then.
 */
function lineTextOf(source: string | undefined, lineIndex: number): string | null {
  if (source === undefined) {
    return null;
  }
  return source.split("\n")[lineIndex] ?? null;
}

/** What the FOCUS level says about the line under the cursor: show me the characters. */
const FOCUSED: Contribution = Object.freeze(
  Object.fromEntries(RESOLUTION_KEYS.map((key) => [key, "raw" as Rendition])),
) as Contribution;

/**
 * What `reanchor` reports. `InstanceReading` (instance.ts) covers everything the WORLD can answer —
 * `found`, `ambiguous`, `absent` — and `unanchored` is added here rather than there because it is
 * not a fact about a resolution; it is a fact about this surface: no anchor was ever taken (nothing
 * was open, or it was on a blank line, which has no identity — see instance.ts). Keeping it out of
 * `InstanceReading` is what lets `resolveInstanceAnchor` stay a pure function of an anchor that
 * definitely exists, rather than one more caller having to handle "there wasn't one".
 */
export type ReanchorReading = InstanceReading | { readonly outcome: "unanchored" };

export class FocusSurface {
  #lineIndex: number | null = null;
  #anchor: InstanceAnchor | null = null;
  #column = 0;

  /** The line the cursor is on, or `null` when it is nowhere. */
  get lineIndex(): number | null {
    return this.#lineIndex;
  }

  /**
   * WHICH CHARACTER of that line the cursor is on — an offset into the line's own source string,
   * clamped to a character that exists. `0` when the cursor is nowhere.
   *
   * IT IS AN OFFSET INTO THE LINE THE INDEX ALREADY NAMES, NOT A SECOND COORDINATE SYSTEM. The
   * anchor decides WHICH line; this decides WHERE IN IT. Every column that enters this surface is
   * clamped against that line's characters on the way in, which is what makes "clamped to a
   * character that exists" a property of the surface rather than of each of its callers.
   */
  get column(): number {
    return this.#column;
  }

  /**
   * WHICH line the cursor is on, expressed as identity rather than as a position — or `null` when
   * nothing was anchored. See `focus` below for the two ways that happens.
   */
  get anchor(): InstanceAnchor | null {
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
   *
   * `column` DEFAULTS TO ZERO, WHICH IS A DECISION AND NOT AN OMISSION. Landing on a line puts the
   * cursor at its start: `j`, `k`, `gg`, `G`, `{`, `}` and a mouse click all take this default, so a
   * line move resets the column. Vim's own `j`/`k` instead remember a DESIRED column and restore it
   * on a line long enough to hold it — a third piece of state (the desired column is not the actual
   * one) that nothing in this change needs, so it is not built. What IS needed is that `w`/`b`/`e`
   * repeat, and they do not move between lines. The one caller that passes a column is `reanchor`
   * below, which is preserving one rather than choosing one.
   *
   * `view` DEFAULTS TO `""`, THE SAME OPTIONAL-DEPENDENCY POSTURE AS `source`. It is what namespaces
   * the anchor's instance string (`instance.ts`, `${view}/${section}/${token}`) so a future cursor
   * remembered ACROSS views cannot collide two views' section-0 into one key — not a live feature,
   * so most tests never pass it and get `""` consistently, which is harmless as long as `reanchor`
   * is given the SAME view an anchor was taken with. Every real call site is (`app/index.html`,
   * `paint.ts`), because a view's own id is already in hand wherever a line is focused.
   */
  focus(lineIndex: number, source?: string, view = ""): void {
    this.place(lineIndex, { kind: "line-start" }, source, view);
  }

  /**
   * MOVE THE CURSOR TO A LINE, SAYING WHAT THE COLUMN SHOULD MEAN THERE.
   *
   * THE COLUMN PARAMETER IS GONE AND THIS IS WHAT REPLACED IT. `focus` used to take
   * `column = 0`, and five of its seven callers passed a literal `0` — not because they meant
   * column zero but because they had nothing to say about the column. Those two things were
   * spelled identically, so the second was invisible: measured 2026-08-12, `j`/`k`, `{`/`}`, a
   * click, the post-edit settle and view entry all silently reset an established column, and the
   * insert path never wrote one at all. Deleting the parameter was tried first and surfaced
   * nothing, because every caller already typed the `0` explicitly (see the backlog row
   * `focus-column-does-not-follow-the-caret`). The only way to make "I have nothing to say"
   * unspellable was to stop accepting a number here and accept an INSTRUCTION instead.
   *
   * SO THIS SURFACE NEVER RECEIVES A POSITION FROM A CALLER THAT ALREADY DECIDED. It receives what
   * the gesture MEANT and asks `columnFor` (column.ts), which is the only code in the application
   * that computes a column. `#column` is assigned in exactly two places, both of them one line
   * long, and both of them assign what `columnFor` returned.
   */
  place(lineIndex: number, instruction: CursorInstruction, source?: string, view = ""): void {
    this.#lineIndex = lineIndex;
    this.#anchor = source === undefined ? null : instanceAnchorFor(source, lineIndex, view);
    const resolved = columnFor(instruction, lineTextOf(source, lineIndex), this.#column);
    // `null` is the word motions' "this line has no title, so this gesture does nothing" — the
    // cursor has still MOVED LINE, so the column keeps whatever it held rather than being invented.
    if (resolved !== null) {
      this.#column = resolved;
    }
  }

  /**
   * Move the cursor along the line it is already on — `w`/`b`/`e`/`0`/`$`, and nothing else.
   *
   * IT TAKES THE LINE'S TEXT RATHER THAN LOOKING IT UP, for the same reason `focus` takes a source:
   * this surface holds no copy of the view and must not start holding one. The caller has the string
   * the column was computed against (app/index.html reads it out of the same `v.markdown` it hands
   * `wordCaret`), so passing it is passing the fact, not fetching it twice.
   *
   * IT IS A SEPARATE CALL FROM `focus` AND THAT IS NOT THE "TWO SETTERS" THE NOTE ABOVE REFUSES.
   * That refusal is about two setters for ONE fact — an index and an anchor that could disagree
   * about which line the cursor is on. A column is a different axis: it cannot disagree with the
   * index, only be clamped by it, which is exactly what happens here.
   */
  moveColumn(column: number, lineText: string): void {
    this.#column = clampColumn(column, lineText);
  }

  /**
   * MOVE THE CURSOR WITHIN THE LINE IT IS ALREADY ON, saying what the gesture meant.
   *
   * The column-only sibling of `place`, and the replacement for `moveColumn`'s number-taking shape
   * on every real caller. `w`/`b`/`e` and `0`/`$` were already CORRECT before this change — they
   * are the only two gestures that were — and they were correct precisely because each of them
   * already ran an answering module (`word.ts`) or the line's own length before writing. Routing
   * them through `columnFor` changes none of their answers; it removes the second entry point by
   * which a caller could write a column it had decided for itself.
   *
   * RETURNS WHETHER THE CURSOR MOVED, which is `wordCaret`'s "this line has no title at all"
   * passed through: the caller repaints on `true` and does nothing on `false`, exactly as it did
   * when it made that test itself.
   */
  moveTo(instruction: CursorInstruction, lineText: string): boolean {
    const resolved = columnFor(instruction, lineText, this.#column);
    if (resolved === null) {
      return false;
    }
    this.#column = resolved;
    return true;
  }

  /**
   * THE WORLD ARRIVED. Where is the cursor's line in `source` now, and how did the walk find it?
   *
   * `view` MUST BE THE SAME VIEW THE ANCHOR WAS TAKEN AGAINST — every real caller has it in hand
   * already (`app/index.html`'s `paintView` only ever calls this when `sameView`, i.e. `id` here is
   * the same id the anchor's own `focus()` call used). IT DEFAULTS TO `""`, THE SAME AS `focus()`'s
   * OWN DEFAULT, so a caller that never passes one (every test written before either parameter
   * existed) stays consistent with itself — the anchor was taken with `""` and is resolved with
   * `""` — rather than mismatching against `focus()`'s default and reporting `absent` for a line
   * that is still there.
   *
   * On `found` the cursor MOVES to the line it found and the anchor is taken again against the new
   * projection — a cycle that stamped the line, or rewrote its tail, has changed the token an
   * unstamped line's instance depends on, and an anchor that went on describing the previous
   * projection would be the same defect one repaint later.
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
   * THE COLUMN THIS METHOD WAS WARNED ABOUT NOW EXISTS, AND THIS IS THE EXPLICIT DECISION.
   *
   * The warning left here by the row that made the cursor an identity was that a column added as a
   * third field would be SILENTLY RESET on every arrival, because this method moves the cursor by
   * calling `focus()` and `focus()` owns the index and the anchor and nothing else. It does not
   * happen, because the column is passed back through: `focus(lineIndex, source, this.#column, view)`.
   *
   * AND IT IS CLAMPED RATHER THAN CARRIED, which is the fact the warning said was already in hand.
   * `focus` re-takes the anchor against the ARRIVING projection, so it also has that projection's
   * text for the line the cursor landed on, and `clampColumn` (motions.ts) cuts the column down to a
   * character that is really there. A cycle that shortened the line — stripped a marker cell,
   * rewrote a tail — leaves the cursor on that line's LAST character rather than past its end, and a
   * cycle that lengthened it leaves the column exactly where the operator put it. Neither outcome is
   * a guess: both are the same one clamp, applied to whatever arrived.
   *
   * ON `ambiguous` AND `absent` THE COLUMN IS UNTOUCHED, for the same reason the index and the
   * anchor are: nothing about the cursor moves when the world could not tell us where its line went.
   */
  reanchor(source: string, view = ""): ReanchorReading {
    const anchor = this.#anchor;
    if (anchor === null) {
      return { outcome: "unanchored" };
    }
    const reading = resolveInstanceAnchor(anchor, source, view);
    if (reading.outcome === "found") {
      // KEEP, not a number. The column this surface already holds is exactly what `keep` means,
      // so re-anchoring says so instead of reading its own field and handing it back to itself.
      this.place(reading.lineIndex, { kind: "keep" }, source, view);
    }
    return reading;
  }

  /** Take the cursor off whatever it was on. */
  blur(): void {
    this.#lineIndex = null;
    this.#anchor = null;
    this.#column = 0;
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

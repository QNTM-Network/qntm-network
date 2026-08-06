/**
 * settle — the one place a repaint may say "place this row where the browser predicts the engine
 * will," and the one place that admission is proven ONE-SHOT rather than replayed on every
 * incidental repaint. PURE: no DOM, no fetch, no clock. `docs/implementation-artifacts/roadmap-
 * the-road-ahead.md` step 3, and the operator's own words for what it must feel like: "not clunky
 * but intentional · moving deliberately in the background."
 *
 * ── WHAT THIS CLASS DOES, AND WHAT IT DELIBERATELY LEAVES TO ITS TWO NEIGHBOURS ──
 *
 * Three questions, three owners, exactly the split `focus.ts`/`motions.ts`/`paint.ts` already draw
 * for the cursor:
 *
 *   WHETHER a row should move, and to where — `app/present/ordering.ts`'s `orderingPlacementFor`.
 *     This class never computes a placement; it only HOLDS one that was already computed.
 *   HOW the motion looks — `paint.ts`, which owns every other DOM decision this bundle makes and
 *     is where the FLIP transform, the `--slide` timing token and the reduced-motion opt-out live.
 *   WHEN an armed placement is still live, and whether THIS repaint has already shown its motion —
 *     this class, and nothing else, because that fact has to survive from the repaint that armed
 *     it to however many incidental repaints follow (a `j`/`k`, a mode change) before the row's
 *     real position is confirmed or contradicted by the next thing the server sends.
 *
 * ── THE OPERATOR'S DEFECT, THE DIAGNOSIS, AND WHY THE KEY CHANGED (2026-08-06) ──
 *
 * "Only thing not working now is that ordering doesn't work any more" — after having watched it
 * work once. The mechanism was never broken (`tests/app-settle-wiring.test.mjs` §1 drives resolver
 * → arm → paint → FLIP live, through the real page). What broke it was this class's own KEY: it
 * used to arm a placement against the EXACT source string it was computed from, and `take` refused
 * the instant that string was not byte-identical — `#source !== source`. A row this browser just
 * captured has no `[[qntm:N]]` stamp yet, so the engine's very next real answer mints one and
 * appends it to that same line. THAT is a character arriving elsewhere in the file, not the row's
 * position being contradicted — and the old key could not tell the two apart. It discarded a
 * still-correct placement on the exact event the operator was watching for, every time.
 *
 * ── THE FIX: THE KEY IS THE ROW'S IDENTITY, NOT THE STRING IT WAS COMPUTED AGAINST ──
 *
 * `arm` now takes an `InstanceAnchor` for the moving row (and, when there is one, for the row it
 * should sit before) — the SAME anchor `instance.ts`/`rows.ts`/`focus.ts` already build and trust,
 * via `instanceAnchorFor`. `take` no longer compares strings at all: it asks `resolveInstanceAnchor`
 * — the ONE walk `RowStore`, `healFromRefusal` and `FocusSurface.reanchor` already share, in the
 * `ANCHOR_TRUST` order (instance, node, relative, text) that module owns and this one does not
 * re-express — whether each anchor still names a real line in the arriving `source`. A stamp
 * appended after the row's own characters is exactly the case `relative.ts`'s `extendsLine` exists
 * for (see `instance.ts`'s own header on why the RELATIVE rung is "the acceptance criterion" for a
 * line typed with no stamp yet): the row's INSTANCE key changes (an unstamped line's identity is
 * its own characters, and the stamp just rewrote them), so rung 1 misses; it has no `node` to search
 * with yet, so rung 2 cannot even try; and rung 3 finds it, bracketed by its stamped neighbours,
 * confirmed because the arrived line still starts with the remembered text. THIS IS NOT A SECOND
 * IDENTITY WALK — it is the one the engine's own `levels.py` is on record as having paid, twice, for
 * writing a second copy of.
 *
 * ── A KNOWN, NAMED LIMIT OF RUNG 3 — NOT SILENTLY SWEPT UNDER THIS FIX ──
 *
 * `extendsLine` confirms an APPENDED tail (`arrived.startsWith(held + " ")`), never an INSERTED one.
 * `apps/qntm-md/src/qntm_md/render/renderer.py`'s `_field_expression_cells` (read directly, engine
 * source, never edited) composes a rendered line's tail in ONE fixed order — the `[[qntm:N]]` stamp
 * FIRST, then the date/tag/marker/chrome cells — so a captured row that ALREADY carries the
 * section's own ordering marker (typed by the operator at capture time; `orderingPlacementFor`
 * cannot rank an insert-line with no marker at all) gets its stamp INSERTED between the title and
 * that marker, not appended after everything. `extendsLine` does not recognise that as the same
 * row, so THIS shape does not yet survive the stamp. A bare capture (title only, nothing else typed
 * yet — the shape `relative.ts`'s own header measured against the operator's real inbox, and the
 * shape a DEFAULT-ordering or `insertion_order` capture actually is) is unaffected: there is nothing
 * on the line for the stamp to be inserted before, so the appended tail IS the whole tail and rung 3
 * holds. `tests/app-settle-wiring.test.mjs` §2 proves the shape this fixes; §4 proves, rather than
 * hides, exactly where that coverage still ends. Closing it is separately-scoped work in a module
 * this change does not touch — `extendsLine` is shared with `held.ts`, `rows.ts` and `focus.ts`, and
 * widening what it confirms is a decision about ALL of their correctness, not only this one's.
 *
 * ── EXACTLY WHEN AN ARM IS DISCARDED, NAMED RATHER THAN LEFT IMPLICIT ──
 *
 *   A VIEW CHANGE. `take` compares `view` first, unconditionally — the same guard the string-keyed
 *   version had, kept byte-for-byte, because a placement about one view is not evidence about
 *   another one.
 *
 *   THE ROW LEAVING THE VIEW. `resolveInstanceAnchor` answers `ambiguous` or `absent` for the
 *   moving row, or for the row it was armed to sit before, in the arriving `source` — `take` then
 *   clears its own state and answers `null`. Refused, never guessed: a row that cannot be found is
 *   not "probably still there," and a target row that vanished means "before WHAT" has no answer.
 *
 *   A SECOND COMMIT TO THE SAME ROW. `armSettle` (resolve.ts) only re-arms when a fresh placement
 *   was computed — a placement left un-rearmed keeps describing a still-correct claim, which is
 *   right for every OTHER row in the file. It is wrong for THIS row: if the operator edits the very
 *   line a placement is pending for, and the new edit needs no placement of its own (already sorted
 *   correctly for the new value), the OLD placement would otherwise survive, unrearmed, and could
 *   still resolve — its anchor is keyed on the row's IDENTITY, which a same-row re-edit does not
 *   disturb — and fire a motion for a value the row no longer has. `supersede`, called from
 *   `commitLine` (app/index.html) before `armSettle` on every commit, closes exactly this gap: it
 *   asks whether the line about to be committed IS the row currently armed and, if so, clears the
 *   arm before the resolver walk even runs. A fresh placement computed a moment later (via
 *   `armSettle`) simply re-arms on top, which is the ordinary "one pending settle" case below.
 *
 * ── WHY A STALE PLACEMENT CAN NEVER ANIMATE A ROW SOMEWHERE NO LONGER CORRECT ──
 *
 * Firing the wrong motion is worse than firing none — the operator would watch a row travel to a
 * position the file does not actually have, which is a LIE, not merely a missed animation. Every
 * exit above is a REFUSAL: `take` only ever answers with a `lineIndex`/`beforeLineIndex` it just
 * re-derived from `resolveInstanceAnchor`'s own current answer, never a coordinate carried over
 * unchecked from the moment it was armed. There is no path from "armed once" to "painted" that does
 * not re-prove both endpoints are still real rows, still findable, in the source THIS repaint is
 * about to show.
 *
 * ── WHY IT IS NOT KEYED BY THE EXACT SOURCE STRING ANY MORE, AND WHAT THAT TRADES AWAY ──
 *
 * The old key was SAFE in one narrow sense: it could only ever fire against the string it was
 * computed from, so nothing about it could be wrong — it could only be silent when it should not
 * have been, which is exactly the bug above. The new key is durable across exactly the kind of
 * change the operator's own capture makes to the file it lands in (a stamp appended, elsewhere a
 * cycle re-sorts nothing this row cares about) and still refuses, by construction, the moment the
 * row's own identity genuinely cannot be re-established. Nothing about the CONVERSE case changes:
 * `paintView`'s ordinary internal repaints — `j`/`k`, entering INSERT, the countless redraws one
 * edit's own settlement causes before the cycle answers — still paint a `source` in which both
 * anchors resolve via the strongest rung (`instance`, unchanged), so the row still holds its
 * predicted spot across all of those exactly as before.
 *
 * ── WHY THE ANIMATION FLAG IS SEPARATE FROM THE PLACEMENT ITSELF ──
 *
 * The row must relocate on EVERY one of those incidental repaints (otherwise it is not "placed" at
 * all, only placed once and then abandoned) but it must be SHOWN MOVING only on the first of them —
 * a slide that replayed on every keystroke would be the "clunky" half of the brief's own contrast,
 * not the "intentional" half. `take` therefore answers the position question every time and the
 * "should this be animated" question exactly once per armed instruction, consuming it on the way
 * out the same way `sentEdit`/`landedTokens`/`cursorNote` in `app/index.html` are read once and
 * cleared — this class is the same pattern, moved into `app/present/` because `paint.ts` needs it
 * on every repaint, not only the one immediately after a commit.
 */

import { instanceAnchorFor, resolveInstanceAnchor } from "./instance.js";
import type { InstanceAnchor } from "./instance.js";

/** WHERE a row belongs, in terms `paint.ts` can act on directly — see `orderingPlacementFor`
 * (ordering.ts) for how this is computed and why its answer is provably the engine's own. */
export interface RowPlacement {
  /** The line index (in the source this placement was armed against) of the row that is moving. */
  readonly lineIndex: number;
  /** The line index of the row it should now sit immediately BEFORE, or `null` for "last among
   * its section's ranked rows." */
  readonly beforeLineIndex: number | null;
}

/** What one `take()` call hands back — the placement, and whether THIS repaint is the one that
 * gets to show the motion. */
export interface SettleInstruction {
  readonly placement: RowPlacement;
  /** `true` for exactly one `take()` per armed instruction — the repaint that should play the
   * FLIP transform. Every other repaint of the same still-live instruction gets `false`: reposition
   * silently, because the operator has already seen this row admit it moved once. */
  readonly animate: boolean;
}

export class SettleSurface {
  #view = "";
  /** The moving row's identity, at arm time — `null` means nothing is armed. */
  #moving: InstanceAnchor | null = null;
  /** Whether a "before" row was armed at all — `RowPlacement.beforeLineIndex === null` ("last")
   * carries no row to re-anchor, so this is tracked separately from `#before` being `null`. */
  #hasBefore = false;
  /** The "before" row's identity, at arm time — meaningless unless `#hasBefore`. */
  #before: InstanceAnchor | null = null;
  #animated = false;

  /**
   * Arm a placement, computed elsewhere, against the identity of the row it is about — not the
   * exact string it was computed from. `source`/`view` are still required: they are what
   * `instanceAnchorFor` needs to TAKE the anchor in the first place, exactly once, here. Overwrites
   * whatever was armed before — there is one cursor and, for the same reason, one pending settle: a
   * second commit before the first one's motion has even shown describes a NEWER prediction, and
   * the newer one is the only one worth keeping.
   *
   * IF EITHER ROW HAS NO IDENTITY TO TAKE — `placement.lineIndex` or a non-null
   * `placement.beforeLineIndex` names a blank line or a line out of range — NOTHING IS ARMED, and
   * whatever was armed before is cleared with it. `orderingPlacementFor` never returns such an
   * index (a blank line has no marker value to rank), so this is a defensive floor, not a live
   * path; it exists so an unrealistic caller fails by arming nothing rather than by arming a
   * placement this class could never re-find.
   */
  arm(source: string, view: string, placement: RowPlacement): void {
    const moving = instanceAnchorFor(source, placement.lineIndex, view);
    if (moving === null) {
      this.#clear();
      return;
    }
    let before: InstanceAnchor | null = null;
    if (placement.beforeLineIndex !== null) {
      before = instanceAnchorFor(source, placement.beforeLineIndex, view);
      if (before === null) {
        this.#clear();
        return;
      }
    }
    this.#view = view;
    this.#moving = moving;
    this.#hasBefore = placement.beforeLineIndex !== null;
    this.#before = before;
    this.#animated = false;
  }

  /**
   * What THIS repaint of `source`/`view` should do, or `null` when nothing is armed, the view does
   * not match, or the armed row(s) can no longer be found in `source` — see this class's own header
   * for the three discard conditions and why none of them can be skipped.
   *
   * THE LINE INDICES RETURNED ARE THIS REPAINT'S OWN, NEVER THE ONES ARMED AGAINST — recomputed
   * fresh, every call, from `resolveInstanceAnchor`'s current answer. A caller can act on them
   * without knowing anything moved.
   */
  take(source: string, view: string): SettleInstruction | null {
    if (this.#moving === null || this.#view !== view) {
      return null;
    }
    const movingReading = resolveInstanceAnchor(this.#moving, source, view);
    if (movingReading.outcome !== "found") {
      this.#clear();
      return null;
    }
    let beforeLineIndex: number | null = null;
    if (this.#hasBefore) {
      if (this.#before === null) {
        // Unreachable by construction — `arm` never sets `#hasBefore` without a valid `#before`.
        // Guarded rather than asserted so a future refactor fails by refusing, not by throwing.
        this.#clear();
        return null;
      }
      const beforeReading = resolveInstanceAnchor(this.#before, source, view);
      if (beforeReading.outcome !== "found") {
        this.#clear();
        return null;
      }
      beforeLineIndex = beforeReading.lineIndex;
    }
    const animate = !this.#animated;
    this.#animated = true;
    return {
      placement: { lineIndex: movingReading.lineIndex, beforeLineIndex },
      animate,
    };
  }

  /**
   * A LINE IS ABOUT TO BE COMMITTED — discard the armed placement if it describes THIS row.
   *
   * Called from `commitLine` (app/index.html), before the resolver walk that might re-arm, on
   * EVERY commit — the same "always called" posture `armPredict` already has, for the identical
   * reason: an un-rearmed claim about a row that just changed again is a claim about a value the
   * row no longer carries, and `armSettle` only re-arms when a FRESH placement was computed, which
   * a same-row edit that now sorts correctly (no placement) will not produce. Left unchecked, the
   * OLD placement's anchor is still the row's own identity — untouched by a same-row text edit that
   * does not touch its stamp — so it would keep resolving and could fire a motion for a value that
   * is no longer true. This is the one case a plain identity key reopens that the old string key
   * closed by accident (ANY edit changed the string, so ANY edit discarded the arm); this closes it
   * on purpose, narrowly, without giving up the tolerance the rest of this class exists to add.
   *
   * `source`/`lineIndex` ARE THE COMMIT'S OWN "BEFORE" — `commit.source`/`commit.lineIndex`, the
   * file and the position as they stood the instant before this edit landed, which is the same
   * source the currently-armed anchor would resolve against if nothing else had happened since it
   * was armed. If it resolves there, to that exact line, this commit is re-touching the row the arm
   * is about; the arm is cleared. If it resolves anywhere else, or not at all, this commit is about
   * a DIFFERENT row and the standing arm is left exactly as it was — still a live claim about a row
   * nothing here has touched.
   *
   * CALL THIS ONLY FOR A `"set-line"` COMMIT. `LineCommit.source`'s own header states why: for
   * `"insert-line"`, `source.split("\n")[lineIndex]` is a DIFFERENT, unrelated line about to be
   * pushed down to make room for the new row, not that row's own before-state — comparing an armed
   * anchor's resolved position against that index would risk clearing a live arm on the coincidence
   * of a new row being opened at the slot an already-armed row currently occupies, which is exactly
   * the "a row still being typed is never the row this moves" hazard `paint.ts` already guards on
   * the read side. A brand-new row cannot be "the same row" as anything already armed — it did not
   * exist when the arm was taken — so `"insert-line"` never needs this call at all.
   */
  supersede(source: string, view: string, lineIndex: number): void {
    if (this.#moving === null || this.#view !== view) {
      return;
    }
    const reading = resolveInstanceAnchor(this.#moving, source, view);
    if (reading.outcome === "found" && reading.lineIndex === lineIndex) {
      this.#clear();
    }
  }

  #clear(): void {
    this.#view = "";
    this.#moving = null;
    this.#hasBefore = false;
    this.#before = null;
    this.#animated = false;
  }
}

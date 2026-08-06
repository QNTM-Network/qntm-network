/**
 * settle — the one place a repaint may say "place this row where the browser predicts the engine
 * will," and the one place that admission is proven ONE-SHOT rather than replayed on every
 * incidental repaint. PURE: no DOM, no fetch, no clock. `docs/implementation-artifacts/roadmap-
 * the-road-ahead.md` step 3, and the operator's own words for what it must feel like: "not clunky
 * but intentional · moving deliberately in the background."
 *
 * ── 2026-08-06, SECOND CHANGE: MANY PENDING PLACEMENTS, NOT ONE — READ THIS BEFORE THE REST ──
 *
 * "The row landed at the bottom and stayed there. About ten seconds later — when the engine's
 * projection arrived — it moved up." Reproduced directly (`tests/app-settle-wiring.test.mjs` §8):
 * `o`/type/Enter a row that sorts first — it DOES land correctly, immediately, exactly as designed.
 * Then, immediately, a SECOND unrelated `o`/type/Enter — a title sorting last, nowhere near the
 * first row's slot. The first row REVERTS to raw file order the instant the second commits. Nothing
 * about the first row's own text, position or identity changed; what discarded it was this class's
 * OWN previous shape: one arm slot, and `arm()`'s own comment called that "the same reason there is
 * one cursor" — a call that made sense for a second commit to the SAME row (a newer prediction about
 * the SAME thing) and was silently wrong for a commit to a DIFFERENT one. This is "his own
 * two-captures-in-a-row gesture" (`app/index.html`, the comment at `commitLine`'s own `arrive` call)
 * — ordinary, rapid, multi-item capture, not an edge case.
 *
 * THE FIX: `#pending` is a map, keyed by the row's OWN identity string (`InstanceAnchor.instance`
 * at arm time), not one slot. `arm()` for row A no longer touches whatever is pending for row B —
 * it can only ever replace ITS OWN row's own prior entry (see below for why that can never produce
 * two entries for one physical row). `take()` walks every entry and returns one `SettleInstruction`
 * per row that can still be found, each independently re-resolved through `resolveInstanceAnchor` —
 * exactly the per-row proof the single-slot version already did, just no longer thrown away the
 * moment a DIFFERENT row also has something pending.
 *
 * NOT SPECIFIC TO ANY GESTURE, VIEW OR SECTION. Every commit — `o`/Enter, `o`/blur, editing an
 * existing line, a checkbox tick's own settle-adjacent paths — arms through the identical
 * `armSettle`/`SettleSurface.arm` call in `commitLine` (app/index.html), for whichever section and
 * view the commit's own view names. The fix is one property of the map ("a row's placement survives
 * until ITS OWN identity says otherwise"), asked the same way for all of them.
 *
 * ── THE BOUND, DERIVED, NOT CHOSEN ──
 *
 * There is no "keep the last N" and no arbitrary capacity. `arm()` for a given row's identity always
 * REPLACES that row's own prior entry (never adds a second one for the same row — see `arm()`'s own
 * comment), so `#pending`'s size can never exceed the number of DISTINCT rows the view holds, each
 * counted at most once. A view with `n` printed lines can have at most `n` pending placements, and in
 * practice only the small number of rows committed since their own placement was last confirmed or
 * contradicted — which `take()` prunes on every call (a resolved-but-vanished row is deleted, not
 * kept). The bound is "at most one entry per row that exists," which is the view's own size, not a
 * number this class picked.
 *
 * ── EVERY CONDITION THAT DISCARDS A PENDING PLACEMENT, NAMED ──
 *
 *   A VIEW CHANGE. `arm()` for a different view than the one currently held clears every pending
 *     entry for the OLD view before arming the new one — a placement about one view is not evidence
 *     about another, and holding it would let it resurface, stale, were the operator ever to return.
 *     `take()` for a view that does not match answers `[]` without discarding anything, the same
 *     "withhold, do not erase" posture the single-slot version already had for this case — the
 *     entries are for the CURRENT view only, by construction, so nothing to erase is ever held for a
 *     view not currently armed.
 *   THE ROW LEAVING THE VIEW. Exactly as before, per entry: `resolveInstanceAnchor` answers anything
 *     other than `found` for the moving row or its `before` row, and `take()` deletes THAT entry —
 *     never the others.
 *   A SECOND COMMIT TO THE SAME ROW. `supersede`, unchanged in contract, now searches every pending
 *     entry for the one whose anchor resolves to the edited `lineIndex` and removes only that one.
 *   A FRESH ARM FOR THE SAME ROW. `arm()` keys by the row's OWN identity at arm time; a second arm
 *     for a row already holding a pending entry replaces it (a newer prediction about the SAME row),
 *     exactly the single-slot behaviour, now scoped to the one row it is about.
 *
 * FIRING THE WRONG MOTION IS WORSE THAN FIRING NONE — unchanged from the single-slot version, and
 * still the reason every exit above is a refusal: `take()` only ever returns a `lineIndex`/
 * `beforeLineIndex` it just re-derived from `resolveInstanceAnchor`'s own current answer, per entry,
 * never a coordinate carried over unchecked.
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
 * (Every discard condition — a view change, a row leaving the view, a second commit to the same
 * row, a fresh arm for the same row — is named once, above, in "EVERY CONDITION THAT DISCARDS A
 * PENDING PLACEMENT." `supersede`'s own doc comment below states the same fact from `commitLine`'s
 * calling side.)
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

/** What one `take()` call hands back for ONE row — the placement, and whether THIS repaint is the
 * one that gets to show the motion. `take()` itself returns zero, one or many of these — see the
 * class header for why the count is never capped. */
export interface SettleInstruction {
  readonly placement: RowPlacement;
  /** `true` for exactly one `take()` per armed instruction — the repaint that should play the
   * FLIP transform. Every other repaint of the same still-live instruction gets `false`: reposition
   * silently, because the operator has already seen this row admit it moved once. */
  readonly animate: boolean;
}

/** One row's own standing claim — everything `resolveInstanceAnchor` needs to re-derive, every
 * call, whether this row is still findable and where. Never read by anything outside this class. */
interface PendingEntry {
  readonly moving: InstanceAnchor;
  /** Whether a "before" row was armed at all — `RowPlacement.beforeLineIndex === null` ("last")
   * carries no row to re-anchor, so this is tracked separately from `before` being `null`. */
  readonly hasBefore: boolean;
  readonly before: InstanceAnchor | null;
  animated: boolean;
}

export class SettleSurface {
  #view = "";
  /** One entry per row with an unconfirmed placement, keyed by that row's OWN identity string
   * (`InstanceAnchor.instance`, taken at arm time) — never a second entry for the same physical row;
   * see `arm()`. The class header states the bound this gives the map's size. */
  #pending = new Map<string, PendingEntry>();

  /**
   * Arm a placement, computed elsewhere, against the identity of the row it is about — not the
   * exact string it was computed from, and not against whatever else is currently pending for OTHER
   * rows. `source`/`view` are still required: they are what `instanceAnchorFor` needs to TAKE the
   * anchor in the first place, exactly once, here.
   *
   * REPLACES ONLY THIS ROW'S OWN PRIOR ENTRY, keyed by `moving.instance` — a second arm for a row
   * already holding a pending claim describes a NEWER prediction about the SAME row (the one case
   * "there is one cursor" ever meant), and overwrites it; every OTHER row's own pending entry is
   * untouched. This is the whole of the fix: the single-slot version overwrote regardless of WHICH
   * row the new arm was about, discarding a still-correct claim about a row nothing here has
   * touched — see the class header for the reproduction.
   *
   * A DIFFERENT VIEW THAN THE ONE CURRENTLY HELD clears every pending entry before arming this one
   * — see the class header's "A VIEW CHANGE" condition.
   *
   * IF EITHER ROW HAS NO IDENTITY TO TAKE — `placement.lineIndex` or a non-null
   * `placement.beforeLineIndex` names a blank line or a line out of range — NOTHING IS ARMED FOR
   * THIS PLACEMENT, and every OTHER row's own pending entry is left exactly as it was.
   * `orderingPlacementFor` never returns such an index (a blank line has no marker value to rank),
   * so this is a defensive floor, not a live path; it exists so an unrealistic caller fails by
   * arming nothing rather than by arming a placement this class could never re-find.
   */
  arm(source: string, view: string, placement: RowPlacement): void {
    const moving = instanceAnchorFor(source, placement.lineIndex, view);
    if (moving === null) {
      return;
    }
    let before: InstanceAnchor | null = null;
    if (placement.beforeLineIndex !== null) {
      before = instanceAnchorFor(source, placement.beforeLineIndex, view);
      if (before === null) {
        return;
      }
    }
    if (view !== this.#view) {
      this.#pending.clear();
      this.#view = view;
    }
    this.#pending.set(moving.instance, {
      moving,
      hasBefore: placement.beforeLineIndex !== null,
      before,
      animated: false,
    });
  }

  /**
   * What THIS repaint of `source`/`view` should do — one `SettleInstruction` per row that still has
   * a live, re-resolvable claim, in no particular order (`paint.ts` applies each independently by
   * the LINE INDEX it carries, not by array position). `[]` for "nothing to do" — no rows armed, a
   * view that does not match, or every armed row's own claim now fails to resolve — never `null`;
   * an empty list and "nothing happened" are the same fact stated as a length.
   *
   * A ROW THAT CANNOT BE RE-FOUND IS DELETED FROM `#pending` HERE, not merely skipped — see the
   * class header's "THE ROW LEAVING THE VIEW" condition. Every OTHER row's entry, found or not,
   * is judged independently and never affects this one.
   *
   * THE LINE INDICES RETURNED ARE THIS REPAINT'S OWN, NEVER THE ONES ARMED AGAINST — recomputed
   * fresh, every call, from `resolveInstanceAnchor`'s current answer. A caller can act on them
   * without knowing anything moved.
   */
  take(source: string, view: string): readonly SettleInstruction[] {
    if (view !== this.#view || this.#pending.size === 0) {
      return [];
    }
    const instructions: SettleInstruction[] = [];
    for (const [key, entry] of this.#pending) {
      const movingReading = resolveInstanceAnchor(entry.moving, source, view);
      if (movingReading.outcome !== "found") {
        this.#pending.delete(key);
        continue;
      }
      let beforeLineIndex: number | null = null;
      if (entry.hasBefore) {
        if (entry.before === null) {
          // Unreachable by construction — `arm` never sets `hasBefore` without a valid `before`.
          // Guarded rather than asserted so a future refactor fails by refusing, not by throwing.
          this.#pending.delete(key);
          continue;
        }
        const beforeReading = resolveInstanceAnchor(entry.before, source, view);
        if (beforeReading.outcome !== "found") {
          this.#pending.delete(key);
          continue;
        }
        beforeLineIndex = beforeReading.lineIndex;
      }
      const animate = !entry.animated;
      entry.animated = true;
      instructions.push({
        placement: { lineIndex: movingReading.lineIndex, beforeLineIndex },
        animate,
      });
    }
    return instructions;
  }

  /**
   * A LINE IS ABOUT TO BE COMMITTED — discard the ONE pending entry that describes THIS row, if
   * there is one; every other row's own pending entry is untouched.
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
   * source each currently-armed anchor would resolve against if nothing else had happened since it
   * was armed. Every entry is checked; the first (and, by construction, only) one that resolves to
   * that exact line is the row this commit is re-touching, and it alone is removed. An edit that
   * resolves nowhere, or to a different line, is about a DIFFERENT row, and every standing entry is
   * left exactly as it was.
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
    if (view !== this.#view) {
      return;
    }
    for (const [key, entry] of this.#pending) {
      const reading = resolveInstanceAnchor(entry.moving, source, view);
      if (reading.outcome === "found" && reading.lineIndex === lineIndex) {
        this.#pending.delete(key);
        return;
      }
    }
  }
}

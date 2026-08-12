/**
 * THE CARET — the one place in this application that puts a text cursor on the screen.
 *
 * ── WHY THIS MODULE EXISTS, AND WHAT IT IS NOT ──
 *
 * `app/present/focus.ts` holds WHERE THE CURSOR IS: a line index, a column, and the identity
 * anchor that finds the line again after a projection replaces the text under it. It is a state
 * surface. `FocusSurface.focus()` assigns three private fields and returns — it performs no DOM
 * operation of any kind, and `app/present/focus.ts` contains none.
 *
 * This module holds WHERE THE CARET IS DRAWN. That is a different fact, one layer down, and it is
 * the terminal one: a person looking at the screen sees the result of `placeCaret` and never sees
 * the result of `FocusSurface.focus`. Deciding a cursor should be somewhere and a caret blinking
 * there are two events, and only the second is an effect on the world.
 *
 * The distinction is not pedantry — it was a measured defect in the declarations. `selection-moved`
 * was declared with `sink: app/present/focus:FocusSurface.focus`, a STATE SETTER, and that altitude
 * is what made `cursor-position` unable to govern it: a class cannot stand between callers and a
 * method it owns. The full record is in `docs/architecture/classes.yaml` under `cursor-position`.
 *
 * ── THE CONTRACT ──
 *
 * `placeCaret` is MECHANICAL. It takes an element and a position and performs one DOM call. It
 * decides nothing: it does not clamp, it does not consult the focus surface, it does not know
 * which cursor it is serving. Every decision about WHERE belongs to the caller, because the
 * callers disagree about what "where" means and each of them already holds the fact it needs —
 * see the two concerns below.
 *
 * `?.` IS DELIBERATE AND IT IS LOAD-BEARING, not defensive slop. The application's own test
 * doubles do not all implement `setSelectionRange`: `tests/flow_scenarios/render_and_edit.ts`
 * installs a stub whose `focus()` is an explicit no-op and which has no `setSelectionRange` at
 * all. Without the optional call every scenario driving a paint would throw. Read that as the
 * warning it is rather than as reassurance — see BLINDNESS below.
 *
 * ── THE TWO CONCERNS THAT REACH IT, WHICH ARE NOT ONE CONCERN ──
 *
 *   1. THE READING CURSOR. `paint.ts`, in the row builder, when `focus.isFocused(lineIndex)` and
 *      the mode surface is holding a caret hint (`i`/`a`/Enter, decided in `motions.ts` and
 *      measured in the NORMAL cursor's own column). The position is clamped into the line's length
 *      at the call site, which is the one place that arithmetic meets the string it indexes.
 *
 *   2. THE DRAFT'S OWN CURSOR. `paint.ts`, in `paintDraft`, on a row that is in NO file yet. Two
 *      branches: the operator has typed into the row and it survived a repaint (the caret returns
 *      to the end of what he typed), or the row is fresh and still holding its seed (the caret goes
 *      to `NewLine.cursorOffset`, the seed's own answer for where his words belong).
 *
 * These do not collapse. The reading cursor is a position in a line of the FILE and is answerable
 * to `FocusSurface`. The draft cursor is a position in a string that is in no file, is answerable
 * to `DraftSurface`, and has no line index in the source to be anchored against. They share this
 * module because a caret on screen is one effect; they share nothing above it.
 *
 * ── BLINDNESS, STATED RATHER THAN LEFT FOR A LATER READER TO ASSUME COVERAGE ──
 *
 * NO SCENARIO UNDER `tests/flow_scenarios/` EXECUTES THIS FUNCTION'S DOM CALL. The only scenario
 * that reaches `paint` (`render_and_edit.ts`) supplies a document stub with no `setSelectionRange`,
 * so the optional call above short-circuits every time; the two scenarios that touch the gesture
 * and draft layers (`vim_gestures.ts`, `draft_placement.ts`) replace `document` with a proxy that
 * THROWS on any access, and assert purity. So `flow-trace`'s observer records zero chains reaching
 * here, and any routing verdict over this sink today is computed from an empty set. A green from
 * an empty set is not a green. This is a live gap, measured 2026-08-12, not a limitation of the
 * tool.
 *
 * The NEGATIVE half does not share that blindness and is the reason this module is a single file:
 * `assert_caret_placement_has_one_home` (`tests/flow_scenarios/qntm_network_checks.py`) reads the
 * sources statically and fails if `setSelectionRange` appears anywhere under `app/` except here.
 * That check needs no scenario and cannot be sidestepped by a path nothing drives — but it is
 * blind INSIDE `app/index.html`, which its own docstring states.
 */

/**
 * Put the caret at `at` in `element`, as a collapsed selection.
 *
 * All three original call sites placed a COLLAPSED range (start === end), so this takes one
 * position rather than two. A future selection with an extent is a different effect and should
 * arrive as a different function, not as a second optional parameter that most callers pass twice.
 */
export function placeCaret(element: HTMLElement, at: number): void {
  (element as HTMLInputElement).setSelectionRange?.(at, at);
}

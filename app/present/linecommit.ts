/**
 * `LineCommit` — what a client hands the write path when a line it changed is left. Moved here from
 * the web painter (`app/shell/paint.ts`) on 2026-10-10 so the client core (`app/present/`) never
 * imports page code: commit, undo, register, resolve and the graph refresh retry all read it, and
 * a phone app or an API client would produce it too.
 */

/**
 * What the caller is handed when the cursor leaves a line it changed.
 *
 * `text` is the verbatim characters the input held; `markdown` is the WHOLE view source with
 * exactly that one line replaced, or `null` if the edit was refused — an unchanged line (the
 * commonest thing a cursor does), or text that is not one line. `null` means DO NOT POST, and it
 * is distinguishable from a successful no-op for the same reason it is for the checkbox: the app
 * posts the whole file and the server overwrites what it is sent.
 */
export interface LineCommit {
  readonly lineIndex: number;
  readonly text: string;
  readonly markdown: string | null;
  /**
   * WHICH `applyEdit` CASE PRODUCED THIS COMMIT — `"set-line"` (`rawInput`, an existing row) or
   * `"insert-line"` (`draftInput`, a row that did not exist a moment ago). Provenance, not a
   * fourth edit kind: `SourceEdit`'s closed union is untouched, this is a copy of the literal
   * already passed to `applyEdit` at each call site below.
   *
   * WHY A CALLER NEEDS IT: for `"set-line"`, `source.split("\n")[lineIndex]` IS the line's own
   * text a moment ago — a real "before" a caller can compare `text` against. For `"insert-line"`,
   * that same index in `source` is a DIFFERENT, unrelated line that is about to be pushed down —
   * `insert-line` makes room for the new row rather than replacing one — so treating it as "the
   * line's own before" would compare two different lines and call it one line's history. A caller
   * that cannot tell the two apart has no honest way to ask "did this line's own answer change".
   */
  readonly kind: "set-line" | "insert-line" | "delete-line" | "move-line" | "delete-lines";
  /**
   * THE STRING THE EDIT WAS APPLIED TO — `applyEdit`'s own input, verbatim.
   *
   * It is here because the WHOLE FILE goes on the wire and the server overwrites what it is sent,
   * so "which copy of the file was this computed from" is a fact about the write that only the
   * painter knows: the source a row closes over is the string that paint was handed, and after an
   * optimistic repaint (`settle` below) that is a string the app computed rather than one the
   * server sent. The caller compares it against the served copy (`app/present/base.ts`) and hashes
   * it for the wire. The painter neither compares nor hashes — it reports which base it used.
   *
   * NOT A SECOND WRITE UNIT AND NOT A NEW EDIT KIND. `markdown` is still the whole view and still
   * the only thing posted; `SourceEdit` is still the closed union of three.
   */
  readonly source: string;
  /**
   * THE ONE FACT `commitLine` KNOWS AND ITS CALLER CANNOT: THIS CHANGE IS NO LONGER IN FLIGHT.
   *
   * The operator's own rule for the whole app: *the graph is truth, minus changes streamed from
   * the view that have not landed.* Everything follows from which side of that line a write is on,
   * and only the write path can say — a posted write, and a rebase retry still running, are both
   * still streamed-from-the-view; a refusal with no retry left is not.
   *
   * SO THIS FIRES EXACTLY WHERE `commitLine` GIVES UP AND DELIBERATELY DOES NOT REPAINT: the two
   * exits that keep the operator's characters on screen (no rebase was possible; the retry was
   * itself refused). It does NOT fire for a refusal that a retry then satisfies — the change was
   * in flight the whole time and landed. It does NOT fire on an ordinary failure either, because
   * those exits already call `repaintArrived`, which redraws from the last server state and IS the
   * revert.
   *
   * WHY IT IS A CALLBACK RATHER THAN A BRANCH IN `commitLine`. What "no longer in flight" should
   * LOOK like differs per affordance, and the difference is not a special case — it falls out of
   * the same rule. Typed characters stay on screen because the operator can still resend them, so
   * a line commit passes nothing here. A ticked box has nothing left to resend, so it reverts, and
   * the checkbox call site passes the revert. One rule, two outcomes, decided by the caller that
   * knows what it drew rather than by the write path that does not.
   *
   * `current` is the server's own copy as the refusal carried it, or `undefined` when the refusal
   * carried none — handed on verbatim so a caller that wants to adopt it can, without `commitLine`
   * deciding on its behalf whether adopting is safe (`healFromRefusal` makes that call and refuses
   * on its own terms).
   */
  readonly onRefusalIsFinal?: ((current: unknown) => void) | undefined;
}

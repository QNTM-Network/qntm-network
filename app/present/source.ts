/**
 * applyEdit — every write-back, expressed as an operation on the SOURCE STRING.
 *
 * ── THIS MODULE IS THE STRUCTURAL FORM OF THE GOVERNING CONSTRAINT ──
 *
 *   A resolution is admissible only when every affordance it offers can be expressed as an edit
 *   to the SOURCE STRING. The app never reconstructs markdown from the DOM.
 *
 * It is stronger than the engine's `accept ⊇ emit` in the way a client needs. The engine's rule
 * is about vocabularies: do not print a glyph you cannot read back. This one is about DIRECTION
 * OF AUTHORITY: the markdown is the truth, the DOM is a projection of it, and edits travel
 * projection → source → engine → new projection, never backwards.
 *
 * IT WAS ALREADY TRUE BEFORE THIS MODULE EXISTED, and protecting that is the highest-value thing
 * this change does. `toggleTask` in app.html took the source string it was handed, patched one
 * character at one line index, and posted the whole file; the DOM was never inverted. What this
 * module changes is not the property but its FINDABILITY: "does this affordance have a source
 * edit?" is now answerable by reading one file, and an affordance that cannot be written down as
 * an operation here is not admissible. That is a schedule, not an objection — resolution levels
 * advance exactly as fast as the source edits do.
 *
 * WHY THE WHOLE FILE IS IN AND THE WHOLE FILE IS OUT. The browser posts `{path, markdown}` for one
 * view and the server overwrites it, so a resolution that renders only part of a file must still
 * hold the whole file's source or a save drops the parts it never rendered. Taking the whole
 * source and returning the whole source makes that impossible to get wrong by construction.
 *
 * PURE. No DOM, no fetch. The caller decides what to do with the string; this decides what the
 * string is. `flows.yaml` carries `source-never-touches-the-dom` as a forbidden flow so that a
 * later change cannot quietly make this module read the page it is supposed to be authoritative
 * over — which is precisely what DOM inversion would look like on its first day.
 */

/**
 * Set the checkbox glyph on one line.
 *
 * The ONE affordance the app offers today, and the only one with a source edit. Anything added
 * here must be writable as a substring operation on `source` or it does not belong.
 */
export interface SetCheckbox {
  readonly kind: "set-checkbox";
  readonly lineIndex: number;
  readonly checked: boolean;
}

export type SourceEdit = SetCheckbox;

// VERBATIM from app.html:275 as it stood at 64c3a87. The capture groups are what make this an
// edit and not a rewrite: group 1 is everything up to the glyph, group 2 is everything after it,
// and the only character this function is permitted to change sits between them.
const CHECKBOX_GLYPH = /^(\s*- \[)[ xX](\] .*)$/;

/**
 * Apply one edit to the whole source and return the whole source.
 *
 * Returns `null` when the edit does not apply — an unmatched line, or an index outside the file.
 * NULL IS NOT AN ERROR, IT IS A REFUSAL, and it matters that it is distinguishable from a
 * successful no-op: the caller must not post a file it did not intend to change. `paintView`'s
 * old `if (!m) return;` had the same meaning and the same consequence (no optimistic UI change,
 * no POST); this preserves it.
 *
 * The out-of-range guard is the one behavioural difference from the code this replaces, which
 * would have thrown on `undefined.match`. The case is unreachable from the painter — the index
 * always comes from the same split of the same string — so nothing observable changes; it is a
 * refusal instead of a crash for a caller that has not been written yet.
 */
export function applyEdit(source: string, edit: SourceEdit): string | null {
  const lines = source.split("\n");
  const line = lines[edit.lineIndex];
  if (line === undefined) {
    return null;
  }

  const match = CHECKBOX_GLYPH.exec(line);
  if (match === null) {
    return null;
  }

  lines[edit.lineIndex] = (match[1] ?? "") + (edit.checked ? "x" : " ") + (match[2] ?? "");
  return lines.join("\n");
}

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

import { carriesContent } from "./express/rendition.js";

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

/**
 * Replace one line with the characters a person typed into it (migration stage 3).
 *
 * THE SECOND AFFORDANCE, AND THE ONE THE GOVERNING CONSTRAINT WAS WRITTEN FOR. The focused line
 * renders as an `<input>` holding its verbatim source, so what comes back is SOURCE TEXT — the
 * characters themselves, not a rendition of them that something has to un-render. That is why an
 * `<input>` is admissible where a `contenteditable` region is not: the substring operation is
 * "line N becomes this string", writable in one sentence, and there is no inversion anywhere in
 * it. An editable rendered region would have no such sentence, which is precisely the test.
 *
 * `text` is ONE LINE. `applyEdit` refuses a `text` carrying a newline rather than splitting it,
 * and the refusal is structural rather than defensive: an `<input>` cannot contain one, so a
 * newline arriving here means the caller is not the surface this was written for and the file is
 * about to gain a line nobody counted. "Exactly one line replaced, every other line byte for
 * byte" stops being provable the moment that is allowed through.
 */
export interface SetLine {
  readonly kind: "set-line";
  readonly lineIndex: number;
  readonly text: string;
}

/**
 * Put a NEW line into the file at `lineIndex`, pushing every line from there down.
 *
 * THE THIRD AFFORDANCE, AND THE FIRST ONE WHOSE SUBJECT DID NOT EXIST BEFORE THE EDIT. `set-line`
 * and `set-checkbox` both name a line that is already there; this one names the place a line is
 * ABOUT TO BE. It is still one sentence — "the file gains this string at index N, and nothing else
 * changes" — which is the whole of the admissibility test, and it is why creating a line is
 * expressible at all.
 *
 * `lineIndex` IS THE INDEX THE NEW LINE WILL OCCUPY, not the line it goes after. So `0` puts it at
 * the top and `lines.length` appends. That is the one place this kind's range differs from the
 * other two: `lines.length` is a legal index here and an out-of-range one everywhere else, because
 * "after the last line" is a real place to put a line and not a real line to edit. The guard is
 * therefore written here rather than shared with the other two branches.
 *
 * ── WHY IT REFUSES A LINE WITH NO CONTENT, WHICH IS THE MOST IMPORTANT LINE IN THIS FILE ──
 *
 * An empty new line is not a harmless no-op on the other side. Run against a hermetic copy of the
 * engine's own starter bundle (`qntm-md init` + `qntm-md run`, 2026-07-31):
 *
 *   * `- [ ] ` with an empty title MINTS A REAL NODE. There is no empty-title guard anywhere in the
 *     engine's parse-to-mint path, so the cycle created `qntm:3` titled `(untitled)` and then
 *     PROPAGATED it — it came back in three sections across two views, permanently, because a node
 *     is graph state and every view that qualifies it prints it.
 *   * A wholly blank line is a grammar SKIP under the shipped `tolerant` input grammar, so no node
 *     is minted AND the line is gone the moment the cycle re-renders the view, which it does
 *     unconditionally for every view every cycle.
 *
 * Both outcomes are worse than the affordance not firing. So the refusal is structural and it lives
 * HERE, in the one module that owns source edits, rather than in the painter — a guard in a caller
 * is a guard the next caller does not have. `carriesContent` is the app's own line grammar
 * (resolution.ts) asked a question, not a second regex invented for the occasion.
 *
 * IT DOES NOT APPLY TO `set-line`, AND THE ASYMMETRY IS DELIBERATE. Emptying a line that already
 * exists is a legal edit to a node that already exists — the engine re-renders that node's line
 * from the graph on the next cycle, so nothing is created and nothing is lost. Inserting an empty
 * line creates a node with no title. Different acts, different rules.
 */
export interface InsertLine {
  readonly kind: "insert-line";
  /** The index the new line will occupy. `0` is the top; `lines.length` is the end. */
  readonly lineIndex: number;
  readonly text: string;
}

export type SourceEdit = SetCheckbox | SetLine | InsertLine;

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

  // INSERT IS DISCRIMINATED FIRST, because it is the one kind whose index may legally be one past
  // the end — "after the last line" is a place, not a line. Reading `lines[lineIndex]` before this
  // branch would refuse an append, which is exactly the gesture the operator asked for.
  if (edit.kind === "insert-line") {
    if (!Number.isInteger(edit.lineIndex) || edit.lineIndex < 0 || edit.lineIndex > lines.length) {
      return null;
    }
    if (edit.text.includes("\n") || edit.text.includes("\r")) {
      return null;
    }
    if (!carriesContent(edit.text)) {
      return null;
    }
    lines.splice(edit.lineIndex, 0, edit.text);
    return lines.join("\n");
  }

  const line = lines[edit.lineIndex];
  if (line === undefined) {
    return null;
  }

  if (edit.kind === "set-line") {
    // A no-op is a REFUSAL, not a successful edit. Leaving a line and changing nothing is the
    // commonest thing a cursor does; returning the file unchanged would make the caller POST a
    // whole view to say nothing, and the server overwrites what it is sent.
    if (edit.text === line) {
      return null;
    }
    if (edit.text.includes("\n") || edit.text.includes("\r")) {
      return null;
    }
    lines[edit.lineIndex] = edit.text;
    return lines.join("\n");
  }

  // AN EDIT THIS FUNCTION DOES NOT KNOW IS REFUSED, EXPLICITLY.
  //
  // Found by a stage-8 test, not by reading: this used to be a bare fall-through, so ANY edit that
  // was not `set-line` was treated as a checkbox toggle. `SourceEdit` is a closed union and no
  // typed caller can reach that, but the shape of the bug is the one this repo has already paid
  // for one repo away — the engine's renderer kept emitting a glyph its accept vocabulary no
  // longer had, the unmatched glyph was absorbed into a node's title, exit 0, no diagnostic.
  //
  // The concrete version here: the next affordance to arrive — a removable tag chip is the
  // obvious candidate, `{kind: "delete-span", ...}` — would, if someone added the type and forgot
  // the branch, silently UNTICK a checkbox and POST the whole file, because `edit.checked` would
  // be undefined and undefined is falsy. Discriminating explicitly makes that a refusal instead.
  //
  // A THIRD KIND ARRIVED AND THIS GUARD IS WHY IT COST NOTHING. `insert-line` (2026-07-31) is
  // discriminated at the top of this function and never reaches here; had it been added to the
  // union and not to the code, it would land on this line and be REFUSED rather than silently
  // untick the box at whatever index it happened to name. The union stays closed and the
  // fall-through stays impossible; `tests/present-newline.test.mjs` section 5 proves the second
  // half by handing this function a kind that does not exist.
  if (edit.kind !== "set-checkbox") {
    return null;
  }

  const match = CHECKBOX_GLYPH.exec(line);
  if (match === null) {
    return null;
  }

  lines[edit.lineIndex] = (match[1] ?? "") + (edit.checked ? "x" : " ") + (match[2] ?? "");
  return lines.join("\n");
}

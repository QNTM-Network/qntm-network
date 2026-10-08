/**
 * The line register — the lines `dd` marked for deletion, and what `yy` copied (2026-10-08,
 * operator-asked: "dd should remove line (cross out is fine) but the delete should happen from
 * the cycle"; "I don't seem to be able to delete more than one line at a time").
 *
 * PURE. The page holds one.
 *
 * `dd` MARKS. A marked line is drawn crossed out and nothing is posted. Any number of lines can be
 * marked; `dd` on a marked line unmarks it, and so does `u`. Every mark is deleted when Cycle is
 * pressed, in ONE write per view (`deleteLinesCommit`), before the cycle runs. `p`/`P` instead MOVES the last marked line, in one
 * write, so the engine sees a move rather than a delete and a new node.
 *
 * A MARK IS ITS LINE'S TEXT, NOT AN INDEX. Saves and cycles change the file under a mark — a stamp
 * arrives, the view re-sorts — so a mark is found again in the file as it is now
 * (`findLine`, app/present/undo.ts), and a mark that cannot be found for certain is dropped:
 * nothing is deleted on a guess.
 */

import type { LineCommit } from "./paint.js";
import { applyEdit } from "./source.js";
import { findLine } from "./undo.js";

/** A qntm identity stamp, `[[qntm:42]]`, with the space before it. */
const STAMP = /\s*\[\[qntm:[^\]]+\]\]/g;

export class LineRegister {
  #text: string | undefined = undefined;
  /** view -> the marked lines' text, oldest first. */
  readonly #marks = new Map<string, string[]>();

  /** `yy` — the line's text, as a copy. */
  yank(text: string): void {
    this.#text = text;
  }

  /** `dd` — mark `text` in `view`, or unmark it if it is marked. Answers whether it is now marked. */
  toggleMark(view: string, text: string): boolean {
    const marks = this.#marks.get(view) ?? [];
    const at = marks.indexOf(text);
    if (at !== -1) {
      marks.splice(at, 1);
      this.#marks.set(view, marks);
      return false;
    }
    marks.push(text);
    this.#marks.set(view, marks);
    this.#text = text;
    return true;
  }

  /** Where the marks in `view` are in `source` now; a mark that cannot be found is dropped. */
  markedLines(view: string, source: string): readonly number[] {
    const marks = this.#marks.get(view) ?? [];
    const kept: string[] = [];
    const found: number[] = [];
    for (const text of marks) {
      const at = findLine(source, text);
      if (at < 0) continue;
      kept.push(text);
      found.push(at);
    }
    this.#marks.set(view, kept);
    return found;
  }

  /** The same lines, read only — for the painter's cross. Drops nothing. */
  markedLinesIn(view: string, source: string): ReadonlySet<number> {
    const out = new Set<number>();
    for (const text of this.#marks.get(view) ?? []) {
      const at = findLine(source, text);
      if (at >= 0) out.add(at);
    }
    return out;
  }

  /** The views that have a mark. */
  markedViews(): readonly string[] {
    return [...this.#marks].filter(([, marks]) => marks.length > 0).map(([view]) => view);
  }

  /** `u` with marks pending: unmark the last one. Answers whether there was one. */
  unmarkLast(view: string): boolean {
    const marks = this.#marks.get(view) ?? [];
    if (marks.length === 0) return false;
    marks.pop();
    return true;
  }

  /** `p`: the last mark's line in `source`, taken off the marks; `undefined` if none is found. */
  takeLast(view: string, source: string): number | undefined {
    const marks = this.#marks.get(view) ?? [];
    while (marks.length > 0) {
      const text = marks.pop() as string;
      const at = findLine(source, text);
      if (at >= 0) return at;
    }
    return undefined;
  }

  /** Every mark in `view`, found in `source` and taken off; the page deletes them in one write. */
  takeAll(view: string, source: string): readonly number[] {
    const found = this.markedLines(view, source);
    this.#marks.set(view, []);
    return found;
  }

  /** What `p` puts down when no line is marked: the text as a NEW line — its identity stamp
   *  removed, so the engine mints a new node rather than seeing one node on two lines. */
  copyText(): string | undefined {
    return this.#text?.replace(STAMP, "");
  }
}

/** The ONE write that deletes every line in `lineIndexes`, or `null` (none can be deleted). */
export function deleteLinesCommit(source: string, lineIndexes: readonly number[]): LineCommit | null {
  if (lineIndexes.length === 0) return null;
  const markdown = applyEdit(source, { kind: "delete-lines", lineIndexes });
  const first = Math.min(...lineIndexes);
  return markdown === null ? null : { lineIndex: first, text: "", markdown, source, kind: "delete-lines" };
}

/** The write that deletes line `lineIndex`, or `null` (a blank or a heading is not deleted). Its
 *  `text` is empty, so a refused delete heals from the server's copy (app/present/commit.ts). */
export function deleteCommit(source: string, lineIndex: number): LineCommit | null {
  const markdown = applyEdit(source, { kind: "delete-line", lineIndex });
  return markdown === null ? null : { lineIndex, text: "", markdown, source, kind: "delete-line" };
}

/** The ONE write that moves line `from` to the place `to` (counted before the line is taken). */
export function moveCommit(source: string, from: number, to: number): LineCommit | null {
  const markdown = applyEdit(source, { kind: "move-line", lineIndex: from, to });
  if (markdown === null) return null;
  const landed = to > from ? to - 1 : to;
  return { lineIndex: landed, text: markdown.split("\n")[landed] ?? "", markdown, source, kind: "move-line" };
}

/** The write that puts `text` in as a new line at `at`. */
export function insertCommit(source: string, at: number, text: string): LineCommit | null {
  const markdown = applyEdit(source, { kind: "insert-line", lineIndex: at, text });
  return markdown === null ? null : { lineIndex: at, text, markdown, source, kind: "insert-line" };
}

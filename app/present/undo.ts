/**
 * Undo and redo (2026-10-08, operator-asked: "undo with u and redo with control r ... and normal
 * command / control z").
 *
 * PURE: no DOM, no fetch, no clock. The page holds one `UndoHistory`.
 *
 * ONE HISTORY PER VIEW. `u` in a view undoes the last change made IN THAT VIEW and never moves the
 * operator to another one; each view keeps its own history, so switching views and pressing `u`
 * there undoes that view's last change.
 *
 * WHAT IS RECORDED IS A LINE CHANGE, NOT A FILE. Between a change and its undo the cycle may have
 * rewritten the file — re-sorted it, added an `[[qntm:N]]` stamp or a created date. So an undo
 * finds its line again in the file AS IT IS NOW (`findLine`), and is refused — returns `null`,
 * changes nothing — when it cannot find it for certain.
 *
 * Every undo is itself an ordinary edit, posted through the one write path like any other.
 */

import type { LineCommit } from "./linecommit.js";
import { applyEdit } from "./source.js";

/** One change to one view, as text: `before` → `after`. `null` means "no line" (an insert has no
 *  `before`, a delete has no `after`). `neighbour` is the line just above, for putting a deleted
 *  line back in its place. */
export interface LineChange {
  readonly view: string;
  readonly before: string | null;
  readonly after: string | null;
  readonly neighbour: string | null;
}

const STAMP = /\[\[qntm:([^\]]+)\]\]/;
/** What the cycle adds to a line it has taken in: the identity stamp and the created date. */
const CYCLE_ADDED = /\s*\[\[qntm:[^\]]+\]\]|\s*🆕\s*\d{4}-\d{2}-\d{2}/gu;

const plain = (line: string): string => line.replace(CYCLE_ADDED, "").replace(/\s+/g, " ").trim();

/**
 * Where `line` is in `source` now: the exact text; else the same `[[qntm:N]]` stamp; else the same
 * text once the cycle's own additions are set aside. Only an answer that is unique counts — two
 * candidates is `-1`, never a guess.
 */
export function findLine(source: string, line: string): number {
  const lines = source.split("\n");
  const unique = (test: (candidate: string) => boolean): number => {
    let found = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (!test(lines[i] ?? "")) continue;
      if (found !== -1) return -2;
      found = i;
    }
    return found;
  };
  const exact = unique((candidate) => candidate === line);
  if (exact >= 0) return exact;
  const stamp = STAMP.exec(line)?.[1];
  if (stamp !== undefined) {
    const byStamp = unique((candidate) => STAMP.exec(candidate)?.[1] === stamp);
    if (byStamp >= 0) return byStamp;
  }
  const wanted = plain(line);
  if (wanted === "") return -1;
  const byText = unique((candidate) => plain(candidate) === wanted);
  return byText >= 0 ? byText : -1;
}

/** The change a commit makes, read off the commit itself. `null` for a commit that changes nothing. */
export function changeOf(view: string, commit: LineCommit): LineChange | null {
  if (commit.markdown === null) return null;
  const before = commit.source.split("\n");
  const after = commit.markdown.split("\n");
  const i = commit.lineIndex;
  switch (commit.kind) {
    case "set-line":
      return before[i] === after[i] ? null : { view, before: before[i] ?? null, after: after[i] ?? null, neighbour: null };
    case "insert-line":
      return { view, before: null, after: after[i] ?? null, neighbour: i > 0 ? (after[i - 1] ?? null) : null };
    case "delete-line":
      return { view, before: before[i] ?? null, after: null, neighbour: i > 0 ? (before[i - 1] ?? null) : null };
    case "move-line":
    case "delete-lines":
      // Two or more places at once; not undone line by line. Not recorded.
      return null;
  }
}

/** The edit that turns `from` into `to` in `source` as it is now, or `null` (refused). */
function apply(source: string, from: string | null, to: string | null, neighbour: string | null): LineCommit | null {
  if (from !== null && to !== null) {
    const at = findLine(source, from);
    if (at < 0) return null;
    const markdown = applyEdit(source, { kind: "set-line", lineIndex: at, text: to });
    return markdown === null ? null : { lineIndex: at, text: to, markdown, source, kind: "set-line" };
  }
  if (from !== null) {
    const at = findLine(source, from);
    if (at < 0) return null;
    const markdown = applyEdit(source, { kind: "delete-line", lineIndex: at });
    return markdown === null ? null : { lineIndex: at, text: "", markdown, source, kind: "delete-line" };
  }
  if (to !== null) {
    // Put the line back under the line it was under; the top of the file if that line is gone.
    // A stamp is not put back: the node it named was deleted, so the line comes back as a new one.
    const text = to.replace(/\s*\[\[qntm:[^\]]+\]\]/g, "");
    const above = neighbour === null ? -1 : findLine(source, neighbour);
    const at = above >= 0 ? above + 1 : 0;
    const markdown = applyEdit(source, { kind: "insert-line", lineIndex: at, text });
    return markdown === null ? null : { lineIndex: at, text, markdown, source, kind: "insert-line" };
  }
  return null;
}

const LIMIT = 100;

export class UndoHistory {
  readonly #done = new Map<string, LineChange[]>();
  readonly #undone = new Map<string, LineChange[]>();

  /** A new change in `change.view`. It clears that view's redo list, as every editor does. */
  record(change: LineChange): void {
    const done = this.#done.get(change.view) ?? [];
    done.push(change);
    if (done.length > LIMIT) done.shift();
    this.#done.set(change.view, done);
    this.#undone.set(change.view, []);
  }

  /** The edit that undoes the last change in `view`, against `source` as it is now — or `null`
   *  when there is nothing to undo, or the line cannot be found for certain (the change is then
   *  kept, so a later `u` can try again). Taking it moves the change to the redo list. */
  undo(view: string, source: string): LineCommit | null {
    const done = this.#done.get(view) ?? [];
    const change = done[done.length - 1];
    if (change === undefined) return null;
    const edit = apply(source, change.after, change.before, change.neighbour);
    if (edit === null) return null;
    done.pop();
    const undone = this.#undone.get(view) ?? [];
    undone.push(change);
    this.#undone.set(view, undone);
    return edit;
  }

  /** The edit that redoes the last undone change in `view`, the same way. */
  redo(view: string, source: string): LineCommit | null {
    const undone = this.#undone.get(view) ?? [];
    const change = undone[undone.length - 1];
    if (change === undefined) return null;
    const edit = apply(source, change.before, change.after, change.neighbour);
    if (edit === null) return null;
    undone.pop();
    const done = this.#done.get(view) ?? [];
    done.push(change);
    this.#done.set(view, done);
    return edit;
  }
}

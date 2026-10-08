/**
 * The line register — what `dd` cut and `yy` copied, for `p`/`P` to put down (2026-10-08,
 * operator-asked: "I use [dd] to move items").
 *
 * PURE: no DOM, no fetch. The page holds one.
 *
 * WHY A CUT WAITS. The engine reads a removed line as "delete this node". If `dd` posted at once,
 * the cycle could delete the node before `p` put the line back, and the move would become a delete
 * and a new node. So `dd` only marks the line. Then:
 *   - `p`/`P` moves it, in ONE write (`move-line`, app/present/source.ts);
 *   - any other edit first deletes it (`takeCut` hands the cut back for the page to post).
 * A cut is only valid against the SAME file it was taken from: if the file changed underneath,
 * the cut is dropped and nothing is deleted — refused, never guessed.
 */

import type { LineCommit } from "./paint.js";
import { applyEdit } from "./source.js";

export interface Cut {
  readonly view: string;
  readonly source: string;
  readonly lineIndex: number;
}

/** A qntm identity stamp, `[[qntm:42]]`, with the space before it. */
const STAMP = /\s*\[\[qntm:[^\]]+\]\]/g;

export class LineRegister {
  #text: string | undefined = undefined;
  #cut: Cut | undefined = undefined;

  /** `yy` — the line's text, as a copy: no cut is pending afterwards. */
  yank(text: string): void {
    this.#text = text;
  }

  /** `dd` — mark the line; nothing is posted yet. A second `dd` replaces the first. */
  cut(cut: Cut, text: string): void {
    this.#cut = cut;
    this.#text = text;
  }

  /** The cut still waiting for `p`, when it was taken from exactly this file; else `undefined`. */
  pendingCut(view: string, source: string): Cut | undefined {
    const cut = this.#cut;
    if (cut === undefined) return undefined;
    if (cut.view !== view || cut.source !== source) {
      this.#cut = undefined;
      return undefined;
    }
    return cut;
  }

  /** The pending cut's line, for the painter's mark — a read only, never clears anything. */
  cutLineIn(view: string, source: string): number | undefined {
    const cut = this.#cut;
    return cut !== undefined && cut.view === view && cut.source === source ? cut.lineIndex : undefined;
  }

  /** Forget the pending cut and hand it back (the page posts its delete, or has moved it). */
  takeCut(): Cut | undefined {
    const cut = this.#cut;
    this.#cut = undefined;
    return cut;
  }

  /** What `p` puts down when no cut is pending: the text, as a NEW line — its identity stamp
   *  removed, so the engine mints a new node rather than seeing one node on two lines. */
  copyText(): string | undefined {
    return this.#text?.replace(STAMP, "");
  }
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

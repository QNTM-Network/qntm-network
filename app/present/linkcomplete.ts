/**
 * `[[` suggests nodes to link to (2026-10-08, operator-asked: "make [[]] be able to actually
 * select and filter through and click into nodes").
 *
 * PURE. One more `CompletionSource` (completion.ts) — the list, the keys and the applying are the
 * completer's, exactly as for tags, dates and markers. The candidates are `linkTargets`, the same
 * search `/` runs, so this is not a second index of the graph. Choosing one writes `[[Title]]`,
 * the form the engine resolves by title.
 */

import type { CompletionSource } from "./completion.js";
import { linkTargets, type SearchView } from "./search.js";

/** The open `[[` before the caret and what has been typed after it, or `null`. */
export function linkQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("[[");
  if (start === -1) return null;
  const query = before.slice(start + 2);
  if (query.includes("]]") || query.includes("[")) return null;
  return { start, query };
}

export function linkSource(views: () => readonly SearchView[], preferViewId: () => string | null): CompletionSource {
  return (text, caret) => {
    const open = linkQueryAt(text, caret);
    if (open === null || open.query.trim() === "") return null;
    // A `]]` the person already typed (or a phone keyboard paired) is replaced with the link.
    const end = text.startsWith("]]", caret) ? caret + 2 : caret;
    const items = linkTargets(views(), open.query, preferViewId()).map((hit) => ({
      label: `${hit.title}  ·  ${hit.viewTitle}`,
      insert: `[[${hit.title}]]`,
    }));
    return { start: open.start, end, items };
  };
}

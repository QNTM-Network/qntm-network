/**
 * Search across every view (2026-10-07, operator-directed: "search across views").
 *
 * PURE. It reads the views the server sent (their markdown, exactly as painted) and returns each
 * matching task ONCE — a task is rendered into many views, so results are keyed by its
 * `[[qntm:N]]` id — with the first view and line it appears on, so the page can jump there. Every
 * word of the query must appear (any order, case-insensitive). Lines with no id (headings, prose)
 * are not results.
 */

export interface SearchView {
  readonly id: string;
  readonly title?: string | undefined;
  readonly markdown: string;
}

export interface SearchHit {
  readonly qntmId: string;
  /** The line's text with its checkbox and id taken off, for display. */
  readonly text: string;
  readonly viewId: string;
  readonly viewTitle: string;
  readonly lineIndex: number;
}

const ID = /\[\[qntm:(\d+)\]\]/;

export function searchViews(
  views: readonly SearchView[],
  query: string,
  preferViewId?: string | null,
  limit = 30,
): readonly SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return [];
  // The current view first, so a task visible where the operator already is jumps there.
  const ordered = [...views].sort((a, b) => Number(b.id === preferViewId) - Number(a.id === preferViewId));
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const view of ordered) {
    const lines = view.markdown.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const id = ID.exec(line)?.[1];
      if (id === undefined || seen.has(id)) continue;
      const lower = line.toLowerCase();
      if (!words.every((w) => lower.includes(w))) continue;
      seen.add(id);
      hits.push({
        qntmId: id,
        text: line.replace(/^\s*- \[.\]\s*/, "").replace(ID, "").replace(/\s+/g, " ").trim(),
        viewId: view.id,
        viewTitle: view.title ?? view.id,
        lineIndex: index,
      });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

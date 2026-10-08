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

/** What a hit is (2026-10-08, operator-asked: views and section headers too, clearly marked). */
export type SearchKind = "view" | "section" | "task";

export interface SearchHit {
  readonly kind: SearchKind;
  /** The task's id; `""` for a view or a section. */
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
  const matches = (text: string): boolean => {
    const lower = text.toLowerCase();
    return words.every((w) => lower.includes(w));
  };
  // VIEWS FIRST, then SECTIONS, then TASKS — the broader the place, the higher it sits.
  for (const view of ordered) {
    const title = view.title ?? view.id;
    if (matches(title)) {
      hits.push({ kind: "view", qntmId: "", text: title, viewId: view.id, viewTitle: title, lineIndex: 0 });
    }
  }
  const sections = new Set<string>();
  for (const view of ordered) {
    view.markdown.split("\n").forEach((line, index) => {
      const heading = /^#{2,6}\s+(.*)$/.exec(line)?.[1]?.trim();
      if (heading === undefined || heading === "" || !matches(heading)) return;
      const key = `${view.id}\u0000${heading}`;
      if (sections.has(key)) return;
      sections.add(key);
      hits.push({ kind: "section", qntmId: "", text: heading, viewId: view.id, viewTitle: view.title ?? view.id, lineIndex: index });
    });
  }
  if (hits.length >= limit) return hits.slice(0, limit);
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
        kind: "task",
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

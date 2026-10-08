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
  /** The view's file path, e.g. `work/outcomes/all.md` — its folders are searched too, at any depth. */
  readonly path?: string | undefined;
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

/** The folders of `path` as words: `work/outcomes-career/all.md` -> "work outcomes career". */
function folderWords(path: string | undefined): string {
  const parts = String(path ?? "").split("/").slice(0, -1);
  return parts.join(" ").replace(/[-_]/g, " ");
}

/** The folders of `path` for display: `work/outcomes/all.md` -> "work / outcomes". */
function folderLabel(path: string | undefined): string {
  return String(path ?? "").split("/").slice(0, -1).join(" / ");
}

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
    // EVERY FOLDER ON THE PATH, NOT A FIXED DEPTH (2026-10-08, operator report: "work outcomes"
    // found nothing). `work/outcomes/all.md` is searched as "work outcomes all".
    const folders = folderWords(view.path);
    if (matches(`${title} ${folders}`)) {
      const where = folderLabel(view.path);
      hits.push({ kind: "view", qntmId: "", text: where === "" ? title : `${where} › ${title}`, viewId: view.id, viewTitle: title, lineIndex: 0 });
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

/**
 * A task's title, as a `[[Title]]` link names it (2026-10-08, operator-asked: `[[` should find and
 * open nodes). The engine resolves a title-form wiki-link BY TITLE (config/vocabulary/
 * structural_tokens.yaml, `existing_line_title`), so the title is the line's own words: everything
 * before its first tag, marker or link. `text` is a hit's `text` — checkbox and id already off.
 */
export function taskTitle(text: string): string {
  const cut = text.search(/\s#[^\s#]|\s\[\[|\s\p{Extended_Pictographic}/u);
  return (cut === -1 ? text : text.slice(0, cut)).trim();
}

/**
 * The tasks a `[[` link could name, best first — the same search `/` runs, so a link and a search
 * find the same things in the same order. Each title once.
 */
export function linkTargets(
  views: readonly SearchView[],
  query: string,
  preferViewId?: string | null,
  limit = 8,
): readonly (SearchHit & { readonly title: string })[] {
  const seen = new Set<string>();
  const out: (SearchHit & { readonly title: string })[] = [];
  for (const hit of searchViews(views, query, preferViewId, 200)) {
    if (hit.kind !== "task") continue;
    const title = taskTitle(hit.text);
    const key = title.toLowerCase();
    if (title === "" || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...hit, title });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Where a link points: the first task whose title is exactly `title` (case-insensitive), or a
 * `[[qntm:N]]` id's own line. `null` when no view the server sent has it.
 */
export function findLinkTarget(
  views: readonly SearchView[],
  target: string,
  preferViewId?: string | null,
): SearchHit | null {
  const id = /^qntm:(\d+)$/i.exec(target.trim())?.[1];
  const want = target.trim().toLowerCase();
  const hits = searchViews(views, id === undefined ? target : `qntm:${id}`, preferViewId, 500);
  for (const hit of hits) {
    if (hit.kind !== "task") continue;
    if (id !== undefined ? hit.qntmId === id : taskTitle(hit.text).toLowerCase() === want) return hit;
  }
  return null;
}

/**
 * Search across every view (2026-10-07, operator-directed: "search across views").
 *
 * PURE. It reads the views the server sent (their markdown, exactly as painted) and returns each
 * matching task ONCE — a task is rendered into many views, so results are keyed by its
 * `[[qntm:N]]` id — with the first view and line it appears on, so the page can jump there. Every
 * word of the query must appear (any order, case-insensitive). Lines with no id (headings, prose)
 * are not results.
 */

import { classifyLine, cleanTitleFor, contentOf, stampSpans, type CheckboxStatuses } from "./express/rendition.js";

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
  /** The line's content with its chrome and id taken off, tags kept — for display. */
  readonly text: string;
  /**
   * The task's title as the engine stores it (`cleanTitleFor`) — what a `[[Title]]` link names.
   * `""` for a view or a section, and for a line whose title the reader will not guess.
   */
  readonly title: string;
  /** The task's checkbox status from the declared glyph table (`open`, `done`, `scheduled`, …);
   *  `""` for a view, a section, or a node line with no checkbox. */
  readonly status: string;
  readonly viewId: string;
  readonly viewTitle: string;
  readonly lineIndex: number;
}

/** How to search. Every field is optional. */
export interface SearchOptions {
  /** This view's hits come first, so a jump stays where the operator already is. */
  readonly prefer?: string | null | undefined;
  readonly limit?: number | undefined;
  /** The declared checkbox glyphs (`qualification.tokens.status`), so `[>]` and `[~]` read as tasks. */
  readonly statuses?: CheckboxStatuses | undefined;
}

/** The folders of `path` as words: `work/outcomes-career/all.md` -> "work outcomes career". */
function folderWords(path: string | undefined): string {
  const parts = String(path ?? "").split("/").slice(0, -1);
  return parts.join(" ").replace(/[-_]/g, " ");
}

/** The folders of `path` for display: `work/outcomes/all.md` -> "work / outcomes". */
function folderLabel(path: string | undefined): string {
  return String(path ?? "").split("/").slice(0, -1).join(" / ");
}

/** The words of `query`, lower case. */
export function queryWords(query: string): readonly string[] {
  return query.toLowerCase().split(/\s+/).filter((w) => w !== "");
}

/**
 * EVERY LINE IS READ THROUGH app/present/express/rendition.ts (2026-10-09, backlog row
 * search-reads-lines-through-the-shared-readers). A heading is `classifyLine`'s heading, an id is
 * `stampSpans`' stamp, the shown text is `contentOf`, the title is `cleanTitleFor`, the status is
 * `classifyLine`'s. This module used to carry a regex for each, and its title regex could disagree
 * with the engine's title — so a `[[Title]]` link could miss its own task.
 */
export function searchViews(views: readonly SearchView[], query: string, options: SearchOptions = {}): readonly SearchHit[] {
  const words = queryWords(query);
  if (words.length === 0) return [];
  const limit = options.limit ?? 30;
  const prefer = options.prefer ?? null;
  // The current view first, so a task visible where the operator already is jumps there.
  const ordered = [...views].sort((a, b) => Number(b.id === prefer) - Number(a.id === prefer));
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
      hits.push({
        kind: "view", qntmId: "", text: where === "" ? title : `${where} › ${title}`, title: "", status: "",
        viewId: view.id, viewTitle: title, lineIndex: 0,
      });
    }
  }
  const sections = new Set<string>();
  for (const view of ordered) {
    view.markdown.split("\n").forEach((line, index) => {
      const shape = classifyLine(line, options.statuses);
      // A SECTION is a heading below the view's own title (`##` and deeper).
      if (shape.kind !== "heading" || shape.hashes.length < 2) return;
      const heading = shape.text.trim();
      if (heading === "" || !matches(heading)) return;
      const key = `${view.id}\u0000${heading}`;
      if (sections.has(key)) return;
      sections.add(key);
      hits.push({
        kind: "section", qntmId: "", text: heading, title: "", status: "",
        viewId: view.id, viewTitle: view.title ?? view.id, lineIndex: index,
      });
    });
  }
  if (hits.length >= limit) return hits.slice(0, limit);
  for (const view of ordered) {
    const lines = view.markdown.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      // A TASK is a line the engine stamped — its first `[[qntm:N]]` is its identity.
      const stamp = stampSpans(line)[0];
      if (stamp === undefined || seen.has(stamp.id) || !matches(line)) continue;
      seen.add(stamp.id);
      const shape = classifyLine(line, options.statuses);
      const content = contentOf(line) ?? "";
      const title = cleanTitleFor(line);
      hits.push({
        kind: "task",
        qntmId: stamp.id,
        text: content.split(stamp.text).join("").replace(/\s+/g, " ").trim(),
        title: title.kind === "title" ? title.text : "",
        status: shape.kind === "checkbox" ? shape.status : "",
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
 * The tasks a `[[` link could name, best first — the same search `/` runs, so a link and a search
 * find the same things in the same order. Each title once.
 */
export function linkTargets(
  views: readonly SearchView[],
  query: string,
  options: SearchOptions = {},
): readonly SearchHit[] {
  const limit = options.limit ?? 8;
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  // THE TITLE MUST MATCH, NOT THE LINE (2026-10-08, measured live): `[[revert` listed "Compliance
  // to come back" first, because that line carries `#unlocks [[Revert to George]]`.
  const words = queryWords(query);
  for (const hit of searchViews(views, query, { ...options, limit: 500 })) {
    if (hit.kind !== "task") continue;
    const key = hit.title.toLowerCase();
    if (key === "" || seen.has(key) || !words.every((w) => key.includes(w))) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Where a link points: the first task whose title is exactly `target` (case-insensitive), or a
 * `[[qntm:N]]` id's own line. `null` when no view the server sent has it.
 */
export function findLinkTarget(
  views: readonly SearchView[],
  target: string,
  options: SearchOptions = {},
): SearchHit | null {
  // A `[[qntm:N]]` link names an id, read by the same stamp reader as every line.
  const id = stampSpans(`[[${target.trim()}]]`)[0]?.id;
  const want = target.trim().toLowerCase();
  const hits = searchViews(views, id === undefined ? target : `qntm:${id}`, { ...options, limit: 500 });
  for (const hit of hits) {
    if (hit.kind !== "task") continue;
    if (id !== undefined ? hit.qntmId === id : hit.title.toLowerCase() === want) return hit;
  }
  return null;
}

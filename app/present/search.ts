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
import { DEFAULT_RANK_POLICIES, rank, type RankItem, type RankPolicy } from "./rank.js";

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
  /** The view's file path — what a policy's `demote` globs are matched against. */
  readonly viewPath: string;
  readonly lineIndex: number;
}

/** How to search. Every field is optional. */
export interface SearchOptions {
  /** This view's hits come first, so a jump stays where the operator already is. */
  readonly prefer?: string | null | undefined;
  readonly limit?: number | undefined;
  /** The declared checkbox glyphs (`qualification.tokens.status`), so `[>]` and `[~]` read as tasks. */
  readonly statuses?: CheckboxStatuses | undefined;
  /** How to order the hits (app/present/rank.ts); the list's built-in policy when absent. */
  readonly policy?: RankPolicy | undefined;
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


/**
 * EVERY LINE IS READ THROUGH app/present/express/rendition.ts (2026-10-09, backlog row
 * search-reads-lines-through-the-shared-readers). A heading is `classifyLine`'s heading, an id is
 * `stampSpans`' stamp, the shown text is `contentOf`, the title is `cleanTitleFor`, the status is
 * `classifyLine`'s.
 *
 * EVERYTHING SEARCH COULD FIND, UNRANKED — every view, every section heading, and EVERY COPY of
 * every stamped line (a task is printed in many views). The preferred view's items come first, so
 * they win ties. Which match a query and in what order is app/present/rank.ts's; a task then keeps
 * only one copy (`bestCopyOfEachTask`), so a copy in a demoted view (Everything Work)
 * loses to the same task's copy anywhere else (2026-10-09, measured live: deduplicating BEFORE
 * ranking kept every task's Everything copy whenever Everything was the open view). The copy is
 * chosen by `bestCopyOfEachTask`, the order by the list's policy.
 */
export function searchCandidates(views: readonly SearchView[], options: SearchOptions = {}): readonly SearchHit[] {
  const prefer = options.prefer ?? null;
  // The preferred view first, so a task in many views is found where the operator already is: its
  // copy is the one kept, and it is handed to the ranking first (its `position` tie-break).
  const ordered = [...views.filter((v) => v.id === prefer), ...views.filter((v) => v.id !== prefer)];
  const hits: SearchHit[] = [];
  for (const view of ordered) {
    const title = view.title ?? view.id;
    const where = folderLabel(view.path);
    hits.push({
      kind: "view", qntmId: "", text: where === "" ? title : `${where} › ${title}`, title, status: "",
      viewId: view.id, viewTitle: title, viewPath: view.path ?? "", lineIndex: 0,
    });
  }
  const sections = new Set<string>();
  for (const view of ordered) {
    const lines = view.markdown.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const shape = classifyLine(line, options.statuses);
      // A SECTION is a heading below the view's own title (`##` and deeper).
      if (shape.kind === "heading") {
        const heading = shape.text.trim();
        const key = `${view.id}\u0000${heading}`;
        if (shape.hashes.length < 2 || heading === "" || sections.has(key)) continue;
        sections.add(key);
        hits.push({
          kind: "section", qntmId: "", text: heading, title: heading, status: "",
          viewId: view.id, viewTitle: view.title ?? view.id, viewPath: view.path ?? "", lineIndex: index,
        });
        continue;
      }
      // A TASK is a line the engine stamped — its first `[[qntm:N]]` is its identity.
      const stamp = stampSpans(line)[0];
      if (stamp === undefined) continue;
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
        viewPath: view.path ?? "",
        lineIndex: index,
      });
    }
  }
  return hits;
}

/** What ranking needs to know about a hit. A view is matched on its title and folders, a section on
 *  its heading, a task on its title first and the rest of its line after. */
function describeHit(hit: SearchHit): RankItem {
  if (hit.kind === "view") return { title: hit.viewTitle, also: folderWords(hit.viewPath), kind: "view", path: hit.viewPath };
  if (hit.kind === "section") return { title: hit.text, kind: "section", path: hit.viewPath };
  return { title: hit.title, also: hit.text, kind: "task", status: hit.status, path: hit.viewPath };
}

/**
 * Each task once: the copy NOT in a demoted view, else the first (the preferred view's). Chosen by
 * the same ranking, with only the `demoted` and `position` keys, so which copy is kept never
 * depends on a difference between copies — two views can print one task with different
 * checkboxes — and is decided before the full policy orders the result.
 */
function bestCopyOfEachTask(hits: readonly SearchHit[], key: (hit: SearchHit) => string, policy: RankPolicy): SearchHit[] {
  const choose: RankPolicy = { keys: [{ field: "demoted", direction: "asc" }, { field: "position" }], demote: policy.demote };
  const seen = new Set<string>();
  const kept = new Set(
    rank(hits, (hit) => ({ title: "", path: hit.viewPath }), "", choose).filter((hit) => {
      if (hit.kind !== "task") return true;
      const k = key(hit);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
  );
  return hits.filter((hit) => kept.has(hit));
}

/** The `/` search: views, sections and tasks matching `query`, ranked by the `search` policy. */
export function searchViews(views: readonly SearchView[], query: string, options: SearchOptions = {}): readonly SearchHit[] {
  if (query.trim() === "") return [];
  const policy = options.policy ?? DEFAULT_RANK_POLICIES.search;
  const copies = bestCopyOfEachTask(searchCandidates(views, options), (hit) => hit.qntmId, policy);
  return rank(copies, describeHit, query, policy).slice(0, options.limit ?? 30);
}

/**
 * The tasks a `[[` link could name, best first, each title once — the same candidates `/` searches,
 * ranked by the `link` policy. A task is matched on its TITLE only (2026-10-08, measured live:
 * `[[revert` listed "Compliance to come back" first, because that line carries
 * `#unlocks [[Revert to George]]`).
 */
export function linkTargets(views: readonly SearchView[], query: string, options: SearchOptions = {}): readonly SearchHit[] {
  if (query.trim() === "") return [];
  const tasks = searchCandidates(views, options).filter((hit) => hit.kind === "task" && hit.title !== "");
  const policy = options.policy ?? DEFAULT_RANK_POLICIES.link;
  const describe = (hit: SearchHit): RankItem => ({ title: hit.title, kind: "task", status: hit.status, path: hit.viewPath });
  const copies = bestCopyOfEachTask(tasks, (hit) => hit.title.toLowerCase(), policy);
  return rank(copies, describe, query, policy).slice(0, options.limit ?? 8);
}

/**
 * Where a link points: the first task whose title is exactly `target` (case-insensitive), or a
 * `[[qntm:N]]` id's own line. `null` when no view the server sent has it. A lookup, not a ranking.
 */
export function findLinkTarget(views: readonly SearchView[], target: string, options: SearchOptions = {}): SearchHit | null {
  // A `[[qntm:N]]` link names an id, read by the same stamp reader as every line.
  const id = stampSpans(`[[${target.trim()}]]`)[0]?.id;
  const want = target.trim().toLowerCase();
  for (const hit of searchCandidates(views, options)) {
    if (hit.kind !== "task") continue;
    if (id !== undefined ? hit.qntmId === id : hit.title.toLowerCase() === want) return hit;
  }
  return null;
}

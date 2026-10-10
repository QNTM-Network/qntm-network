/**
 * The `/` search box (2026-10-07, operator-directed). Returns an opener.
 *
 * Type to search every view (`app/present/search.ts`); ↑/↓ choose, Enter or a click jumps to the
 * task in the view it was found in, Escape closes. Made on first open, so installing touches nothing.
 *
 * BLANK, IT SHOWS WHAT WAS USED RECENTLY (2026-10-10): the views and tasks the user opened or
 * edited, newest first, without the view already open — so `/` then Enter switches back.
 */

import type { CheckboxStatuses } from "../present/express/rendition.js";
import type { RankPolicy } from "../present/rank.js";
import { searchViews, type SearchHit, type SearchView } from "../present/search.js";

export interface SearchDeps {
  readonly views: () => readonly SearchView[];
  readonly currentViewId: () => string | null;
  /** The declared checkbox glyphs, read fresh so a config change is picked up. */
  readonly statuses?: () => CheckboxStatuses | undefined;
  /** The `search` ranking policy, read fresh (config/client.yaml). */
  readonly policy?: () => RankPolicy | undefined;
  /** The `recent` ranking policy, for a blank search (config/client.yaml). */
  readonly recentPolicy?: () => RankPolicy | undefined;
  /** The user's recently used keys, newest first (app/present/recent.ts). */
  readonly recent?: () => readonly string[];
  /** A hit was chosen — the page records it as used. */
  readonly used?: (hit: SearchHit) => void;
  /** Show `viewId` with the cursor on `lineIndex`. */
  readonly go: (viewId: string, lineIndex: number) => void;
}

export function installSearch(deps: SearchDeps, doc: Document = document): () => void {
  let root: HTMLElement | null = null;
  let input: HTMLInputElement | null = null;
  let list: HTMLUListElement | null = null;
  let hits: readonly SearchHit[] = [];
  let selected = 0;

  const close = (): void => {
    if (root !== null) root.hidden = true;
  };

  const choose = (index: number): void => {
    const hit = hits[index];
    if (hit === undefined) return;
    close();
    deps.used?.(hit);
    deps.go(hit.viewId, hit.lineIndex);
  };

  const render = (): void => {
    if (list === null) return;
    list.replaceChildren(
      ...hits.map((hit, index) => {
        const row = doc.createElement("li");
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", String(index === selected));
        const kind = doc.createElement("em");
        kind.className = `search-kind search-kind-${hit.kind}`;
        kind.textContent = hit.kind === "view" ? "View" : hit.kind === "section" ? "Section" : "Task";
        if (index === 0 && hit.kind === "view" && input?.value.trim() === "") kind.textContent = "Back to";
        // A DONE TASK IS SHOWN DIMMED (2026-10-09): its status comes from the declared glyphs.
        if (hit.status === "done") row.classList.add("search-done");
        const text = doc.createElement("span");
        text.textContent = hit.text;
        const where = doc.createElement("small");
        where.textContent = hit.viewTitle;
        row.append(kind, text, where);
        row.addEventListener("mousedown", (event) => {
          event.preventDefault();
          choose(index);
        });
        return row;
      }),
    );
  };

  const search = (): void => {
    hits = searchViews(deps.views(), input?.value ?? "", {
      prefer: deps.currentViewId(),
      statuses: deps.statuses?.(),
      policy: deps.policy?.(),
      recent: deps.recent?.(),
      recentPolicy: deps.recentPolicy?.(),
    });
    selected = 0;
    render();
  };

  const make = (): void => {
    root = doc.createElement("div");
    root.className = "search-box";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Search");
    input = doc.createElement("input");
    input.type = "search";
    input.placeholder = "Recent — type to search views, sections and tasks…";
    input.setAttribute("aria-label", "Search views, sections and tasks");
    list = doc.createElement("ul");
    list.setAttribute("role", "listbox");
    root.append(input, list);
    input.addEventListener("input", () => search());
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" && hits.length > 0) selected = (selected + 1) % hits.length;
      else if (event.key === "ArrowUp" && hits.length > 0) selected = (selected - 1 + hits.length) % hits.length;
      else if (event.key === "Enter") choose(selected);
      else if (event.key === "Escape") close();
      else return;
      event.preventDefault();
      event.stopPropagation();
      render();
    });
    input.addEventListener("blur", () => close());
    doc.body.append(root);
  };

  return () => {
    if (root === null) make();
    root!.hidden = false;
    input!.value = "";
    search();
    input!.focus();
  };
}

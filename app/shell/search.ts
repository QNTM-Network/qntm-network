/**
 * The `/` search box (2026-10-07, operator-directed). Returns an opener.
 *
 * Type to search every view (`app/present/search.ts`); ↑/↓ choose, Enter or a click jumps to the
 * task in the view it was found in, Escape closes. Made on first open, so installing touches nothing.
 */

import { searchViews, type SearchHit, type SearchView } from "../present/search.js";

export interface SearchDeps {
  readonly views: () => readonly SearchView[];
  readonly currentViewId: () => string | null;
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
    deps.go(hit.viewId, hit.lineIndex);
  };

  const render = (): void => {
    if (list === null) return;
    list.replaceChildren(
      ...hits.map((hit, index) => {
        const row = doc.createElement("li");
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", String(index === selected));
        const text = doc.createElement("span");
        text.textContent = hit.text;
        const where = doc.createElement("small");
        where.textContent = hit.viewTitle;
        row.append(text, where);
        row.addEventListener("mousedown", (event) => {
          event.preventDefault();
          choose(index);
        });
        return row;
      }),
    );
  };

  const make = (): void => {
    root = doc.createElement("div");
    root.className = "search-box";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Search");
    input = doc.createElement("input");
    input.type = "search";
    input.placeholder = "Search tasks in every view…";
    input.setAttribute("aria-label", "Search tasks");
    list = doc.createElement("ul");
    list.setAttribute("role", "listbox");
    root.append(input, list);
    input.addEventListener("input", () => {
      hits = searchViews(deps.views(), input!.value, deps.currentViewId());
      selected = 0;
      render();
    });
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
    hits = [];
    render();
    input!.focus();
  };
}

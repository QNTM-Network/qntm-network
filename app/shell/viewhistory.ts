/**
 * Back and forward through views (2026-10-09, operator request from a phone: "otherwise I have to go
 * in, search, find a view, … search, go back to the other view").
 *
 * THE HISTORY IS THE BROWSER'S, NOT A SECOND ONE. Each view chosen is one browser history entry,
 * so the phone's swipe back, the browser's own buttons, ⌘[ / ⌘], `H` / `L` and the touch bar's
 * ◀ / ▶ all step through the same list, and none of them can disagree about where "back" is.
 *
 * Only a view CHANGE is an entry. A projection arriving in the same view, a re-read, and the paint
 * that a back or forward itself causes are not.
 *
 * The address carries the view (`#view=<id>`), so a reload — or a link — opens that view.
 */

const PREFIX = "#view=";

interface Entry {
  readonly qntmView: string;
  /** How many entries this app made before this one — back stops at 0 rather than leaving the app. */
  readonly depth: number;
}

const entryOf = (state: unknown): Entry | null =>
  state !== null && typeof state === "object" && typeof (state as Entry).qntmView === "string"
    ? (state as Entry)
    : null;

/** The view the address names, or null. */
export function viewFromHash(hash: string): string | null {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const id = decodeURIComponent(hash.slice(PREFIX.length));
    return id === "" ? null : id;
  } catch {
    return null;
  }
}

export interface ViewHistoryDeps {
  /** The page's window. Without a `history` (a test harness), there is no history and nothing breaks. */
  readonly win: Partial<Pick<Window, "history" | "location" | "addEventListener">>;
  /** Paint a view. Called for a back or forward; what it paints is not recorded again. */
  readonly show: (viewId: string) => void;
}

export interface ViewHistory {
  /** A view was chosen and painted. */
  visited(viewId: string): void;
  back(): void;
  forward(): void;
}

export function installViewHistory(deps: ViewHistoryDeps): ViewHistory {
  const { history, location } = deps.win;
  if (history === undefined || location === undefined || deps.win.addEventListener === undefined) {
    return { visited() {}, back() {}, forward() {} };
  }
  let restoring = false;

  deps.win.addEventListener("popstate", (event) => {
    const entry = entryOf((event as PopStateEvent).state);
    if (entry === null) return;
    restoring = true;
    try {
      deps.show(entry.qntmView);
    } finally {
      restoring = false;
    }
  });

  return {
    visited(viewId) {
      if (restoring) return;
      const current = entryOf(history.state);
      if (current?.qntmView === viewId) return;
      const url = `${location.pathname}${location.search}${PREFIX}${encodeURIComponent(viewId)}`;
      if (current === null) history.replaceState({ qntmView: viewId, depth: 0 } satisfies Entry, "", url);
      else history.pushState({ qntmView: viewId, depth: current.depth + 1 } satisfies Entry, "", url);
    },
    back() {
      if ((entryOf(history.state)?.depth ?? 0) > 0) history.back();
    },
    forward() {
      history.forward();
    },
  };
}

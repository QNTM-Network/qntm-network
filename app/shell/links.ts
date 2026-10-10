/**
 * A click on a `[[Title]]` link opens the node it names (2026-10-08, operator-asked).
 *
 * The painter draws a title-form link as a `.linkchip` (app/shell/paint.ts). This module listens
 * on the view body in the CAPTURE phase — before the row's own click handler, which would put the
 * cursor on the line instead — finds the task with that title in the views the server sent
 * (`findLinkTarget`, the same search `/` runs) and hands it to `go`, the same jump a search result
 * makes. A link nothing matches does nothing but say so in the console.
 */

import type { CheckboxStatuses } from "../present/express/rendition.js";
import { findLinkTarget, type SearchView } from "../present/search.js";

export interface LinkDeps {
  readonly viewBody: HTMLElement;
  readonly views: () => readonly SearchView[];
  readonly currentViewId: () => string | null;
  readonly statuses?: () => CheckboxStatuses | undefined;
  /** Show `viewId` with the cursor on `lineIndex` — the search box's own `go`. */
  readonly go: (viewId: string, lineIndex: number) => void;
}

export function installLinks(deps: LinkDeps): void {
  deps.viewBody.addEventListener(
    "click",
    (event) => {
      const chip = (event.target as Element | null)?.closest?.(".linkchip");
      if (chip == null) return;
      event.preventDefault();
      event.stopPropagation();
      const target = (chip.textContent ?? "").replace(/^\[\[|\]\]$/g, "");
      const hit = findLinkTarget(deps.views(), target, { prefer: deps.currentViewId(), statuses: deps.statuses?.() });
      if (hit === null) {
        console.info(`[qntm] no view has a task called ${JSON.stringify(target)}`);
        return;
      }
      deps.go(hit.viewId, hit.lineIndex);
    },
    true,
  );
}

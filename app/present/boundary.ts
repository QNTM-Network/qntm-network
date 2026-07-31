/**
 * boundaryLine — where vim's `{`/`}` land. PURE: no DOM, no fetch, no clock.
 *
 * ── WHY THIS IS A SEPARATE MODULE FROM motions.ts, RATHER THAN A CASE IN ITS SWITCH ──
 *
 * `app/present/motions.ts` imports nothing at all, and its own header explains why that is
 * load-bearing: it is what proves `ModeSurface` cannot produce a `Contribution` even by accident,
 * because it cannot reach `resolution.ts` to build one. Answering "where is the nearest boundary"
 * needs to know what KIND each line is — heading, checkbox, blank, prose — and that classification
 * is `classifyLine`, which lives in `resolution.ts`. Importing it into motions.ts would not add a
 * `Contribution` (this module never touches `PresentationContext` either), but it would end the one
 * fact motions.ts's own header stakes its whole argument on. So the classification-aware half of
 * `{`/`}` lives here instead, and `ModeSurface.handleKey` reports only a direction and a count
 * (motions.ts's own count-prefix arithmetic, unchanged) for this module — or the DOM wiring that
 * calls it directly — to turn into a line index.
 *
 * ── WHAT A "STRUCTURAL BOUNDARY" MEANS HERE, STATED RATHER THAN ASSUMED ──
 *
 * A HEADING LINE, and nothing else — not a blank line. Two reasons, both from evidence already in
 * this repo rather than from vim's own paragraph convention:
 *
 *   1. `newline.ts` already treats a heading as what BOUNDS A SECTION ("stopping at the heading
 *      that opens this section" — its own STRUCTURAL_NODE/VIEW rungs are defined by crossing one).
 *      `{`/`}` reuse that exact concept instead of inventing a second boundary vocabulary: jumping
 *      between headings is jumping between the same sections `seedFor` already reasons about.
 *   2. The operator's own content is task-list-heavy and blank-line-sparse — the SOURCE fixture in
 *      tests/present-motions.test.mjs has none at all — so a blank-line definition would leave
 *      `{`/`}` inert on exactly the content this app exists to show. Headings are the boundary that
 *      is actually there, and they are also the outline the operator already navigates with
 *      Obsidian's own `Alt+O` (research-polish-direction.md §5).
 *
 * ── WHY RUNNING OUT OF HEADINGS LANDS ON THE FILE'S OWN END, NOT ON THE LAST ONE FOUND ──
 *
 * `}` past the last heading — or in a view with no headings at all — goes to the LAST LINE, and
 * `{` before the first goes to the FIRST. That is vim's own behaviour for `}`/`{` running out of
 * paragraphs (falls through to end-of-file / start-of-file rather than refusing), and it is what
 * makes `{`/`}` a working substitute for `gg`/`G` on a view with no headings at all, rather than a
 * dead key on the operator's own root files (`this_week.md`, `inbox.md` — no heading, per the
 * repo's own fixtures). A count that cannot be fully satisfied stops there immediately rather than
 * landing on the last boundary it DID find — `3}` with only one heading ahead goes straight to the
 * last line, the same way vim's own motion does not stop half-counted.
 */

import { classifyLine } from "./resolution.js";

/** Which direction `{`/`}` search in. */
export type BoundaryDirection = "prev" | "next";

/** The line index `count` heading-jumps away from `current`, in `direction`. Clamps at the ends. */
export function boundaryLine(
  lines: readonly string[],
  current: number,
  direction: BoundaryDirection,
  count: number,
): number {
  let at = current;
  for (let step = 0; step < count; step += 1) {
    const found = direction === "next" ? nextHeading(lines, at) : prevHeading(lines, at);
    if (found === null) {
      return direction === "next" ? Math.max(0, lines.length - 1) : 0;
    }
    at = found;
  }
  return at;
}

function nextHeading(lines: readonly string[], from: number): number | null {
  for (let at = from + 1; at < lines.length; at += 1) {
    if (classifyLine(lines[at] ?? "").kind === "heading") {
      return at;
    }
  }
  return null;
}

function prevHeading(lines: readonly string[], from: number): number | null {
  for (let at = from - 1; at >= 0; at -= 1) {
    if (classifyLine(lines[at] ?? "").kind === "heading") {
      return at;
    }
  }
  return null;
}

/**
 * seedFor — what a NEW line is, before anybody has typed into it. PURE: no DOM, no fetch.
 *
 * ── THE PROBLEM THIS MODULE EXISTS FOR ──
 *
 * A new line has no content, so nothing about it can be READ from the line. Everything about it has
 * to be RESOLVED. That makes creating one the first affordance in this app whose answer comes from
 * the cascade rather than from the characters in front of it, which is why it gets a module instead
 * of a branch in the painter.
 *
 * ── THE CASCADE IT WALKS, AND WHY THOSE FOUR RUNGS ──
 *
 * The engine decides what a bare line MEANS with `default_node_type`, which cascades
 * GLOBAL -> VIEW -> STRUCTURAL_NODE, most specific first
 * (`src/qntm_md/resolution/registration.py:89-113`; the shipped GLOBAL value is `task`, at
 * `config/views/default_registration.yaml:4`; a view declares its own with a sheet-level key, as
 * `config/views/people.yaml:10` declares `person`). That decision reaches the browser ALREADY MADE,
 * printed into the view: the same `render.shape` that `io/applier.py:110-150` consults to admit a
 * chrome-free line is the one `render/renderer.py:909-936` consults to print it. So this module
 * does not re-derive the cascade. It reads the answer the cascade already gave, off the SOURCE
 * STRING, from the nearest line that carries one — and reports WHICH RUNG answered, because
 * provenance is part of the return everywhere else in this bundle and this is no different.
 *
 *   LINE             the line immediately above the new one, in the same section
 *   STRUCTURAL_NODE  another line in the same section — above it, or below it
 *   VIEW             a line somewhere else in the view, across a heading
 *   GLOBAL           nothing in the view says anything, so nothing is resolved. THE SEED IS NULL.
 *
 * The rungs are named from `PresentationLevel` rather than invented, because they ARE those levels:
 * a heading is what bounds a STRUCTURAL_NODE, the file is what bounds a VIEW.
 *
 * ── WHY THE GLOBAL RUNG REFUSES INSTEAD OF GUESSING, WHICH IS THE HARDEST DECISION HERE ──
 *
 * The obvious floor is `- [ ] `, mirroring the engine's own root literal
 * (`bundle/validators/views.py:132`, `ROOT_DEFAULT_NODE_TYPE = "task"`, whose render shape is
 * `checkbox`). It was rejected on measured evidence, not on principle. Against a hermetic copy of
 * the shipped starter bundle (2026-07-31), a checkbox line authored into the starter's `people`
 * view — `default_node_type: person`, a type whose fields are `[title, qntm_id]` and nothing else —
 * did not degrade:
 *
 *   CycleAbortedError: graph error during apply phase: RuleExecutionError:
 *     resolve_or_create_node failed for type 'person': Node type 'person' does not have
 *     field 'status' — valid fields: qntm_id, title
 *
 * The WHOLE CYCLE aborts. Nothing ingests, no view re-renders, and every other edit made in the
 * same cycle is lost with it. The other guess is not safe either — a plain `- ` under a
 * checkbox-shaped default is refused at the applier's form gate and the line simply vanishes when
 * the view is rewritten.
 *
 * So on a view that has printed no node line at all, both guesses cost the operator something and
 * one of them costs him the cycle. This module returns `null` and the surface declines to open a
 * line, which is the only answer that cannot destroy anything.
 *
 * THE GAP THAT WOULD CLOSE IT IS NAMED AND SMALL: the snapshot envelope does not carry the view's
 * resolved `default_node_type`. It carries `path`, `title`, `markdown`, `graph` and `locations` and
 * nothing about registration. Widening it is design-presentation-cascade.md's own §4.3 blocker and
 * the precondition of its stage 7 (the VIEW and STRUCTURAL_NODE levels). With that one field in the
 * payload the GLOBAL rung stops being a guess and becomes a read, and this module's `null` goes
 * away. Nothing else about this file changes.
 *
 * ── ONE LIMITATION, STATED RATHER THAN LEFT TO BE DISCOVERED ──
 *
 * The VIEW rung crosses a heading to find evidence, so it answers with another SECTION's shape.
 * That is sound only while no section declares a `default_node_type` of its own. The rung exists
 * (`bundle/validators/views.py:1312-1318`) and nothing in the operator's 73 view sheets uses it
 * today — every declaration is sheet-level. If one ever does, a new line in a silent section could
 * take the shape of a section that resolved differently. The fix is the same one field in the
 * envelope; until then the provenance this function returns is how a caller can tell how far it
 * had to go to find an answer.
 */

import { chromeOf, classifyLine } from "./resolution.js";
import type { PresentationLevel } from "./levels.js";
import type { DraftSurface } from "./draft.js";

/** A new line's opening characters, and the rung of the cascade that decided them. */
export interface NewLine {
  /** The chrome the line starts with — `- [ ] `, `  - `, and so on. Never has content in it. */
  readonly text: string;
  /** Which rung answered. `GLOBAL` never appears: that rung returns `null` instead. */
  readonly level: PresentationLevel;
}

/**
 * What a new line at `lineIndex` would be, or `null` when the view says nothing at all.
 *
 * `lineIndex` is the index the new line WOULD OCCUPY — the same index `applyEdit`'s `insert-line`
 * takes, so a caller never has to convert between "after line N" and "at index N+1" and get it
 * wrong in one of the two places.
 *
 * THE SEARCH IS SPLIT IN THREE PASSES AND NOT ONE, because the passes are the cascade's rungs and
 * collapsing them would lose the provenance. Same-section-above first (most specific), then
 * same-section-below, then the rest of the view.
 */
export function seedFor(source: string, lineIndex: number): NewLine | null {
  const lines = source.split("\n");
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex > lines.length) {
    return null;
  }

  // 1. UP, stopping at the heading that opens this section. The first evidence found is the LINE
  //    rung if it is the line directly above, and the STRUCTURAL_NODE rung if the search had to
  //    step over blanks or lines that are not node lines to reach it.
  for (let at = lineIndex - 1; at >= 0; at -= 1) {
    const line = lines[at] ?? "";
    if (classifyLine(line).kind === "heading") {
      break;
    }
    const chrome = chromeOf(line);
    if (chrome !== null) {
      return { text: chrome, level: at === lineIndex - 1 ? "LINE" : "STRUCTURAL_NODE" };
    }
  }

  // 2. DOWN, stopping at the heading that opens the NEXT section. A line pressed open directly
  //    under `## capture` has nothing above it in its own section and everything below it, and
  //    those lines are its section's answer just as much as the ones above would have been.
  for (let at = lineIndex; at < lines.length; at += 1) {
    const line = lines[at] ?? "";
    if (classifyLine(line).kind === "heading") {
      break;
    }
    const chrome = chromeOf(line);
    if (chrome !== null) {
      // NO INDENT FROM HERE ON. The indent is a fact about the line the cursor was ON — pressing
      // Enter at the end of a nested child makes its sibling — and not a fact about what the
      // section's nodes are. Carrying a stranger's indent would nest a new line under something
      // it has nothing to do with.
      return { text: chrome.trimStart(), level: "STRUCTURAL_NODE" };
    }
  }

  // 3. THE WHOLE VIEW. Headings are no longer boundaries here; they are what has already been
  //    crossed, and crossing them is precisely what makes this the VIEW rung and not the one above.
  for (const line of lines) {
    const chrome = chromeOf(line);
    if (chrome !== null) {
      return { text: chrome.trimStart(), level: "VIEW" };
    }
  }

  // 4. GLOBAL. Nothing in this view has ever been printed as a node, so nothing here knows what a
  //    node in it looks like. See the header: both available guesses cost the operator something
  //    and one of them aborts his cycle.
  return null;
}

/**
 * Ask for a line at `lineIndex`, resolved against `from`, and open it in `draft` if the cascade has
 * an answer. Returns whether one was opened.
 *
 * THE ONE PLACE "ASK `seedFor`, THEN OBEY THE REFUSAL" IS WRITTEN — vim's slice 2 adds a SECOND
 * caller of this exact sequence (`o`/`O`, fired from app/index.html's keydown handler with no line
 * being committed at all) beside the one that already existed (Enter, mid-commit, inside
 * `paint.ts`'s `rawInput`). Two callers and one function is what keeps GLOBAL's refusal — guessing
 * costs the operator either a lost line or an aborted cycle, see the header above — a property of
 * every caller rather than a rule each one has to remember to re-implement. `paint.ts`'s own
 * `openLineAt` is now a two-line wrapper around this that adds only the `draft`/`focus` optionality
 * `PaintDeps` carries; nothing here duplicates it.
 */
export function openLine(
  from: string,
  lineIndex: number,
  draft: DraftSurface,
  onDeclined?: (lineIndex: number) => void,
): boolean {
  const seed = seedFor(from, lineIndex);
  if (seed === null) {
    onDeclined?.(lineIndex);
    return false;
  }
  draft.open(lineIndex, seed.text);
  return true;
}

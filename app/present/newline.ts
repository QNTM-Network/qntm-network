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
 *   GLOBAL           nothing in the view says anything, so nothing is PRINTED to search — but the
 *                    DECLARATION may still answer. See the next section: this rung used to be a
 *                    guess, refused outright; design-the-resolution-architecture.md step 6 made it
 *                    a READ, and it refuses LESS OFTEN, not never.
 *
 * The rungs are named from `PresentationLevel` rather than invented, because they ARE those levels:
 * a heading is what bounds a STRUCTURAL_NODE, the file is what bounds a VIEW.
 *
 * ── THE GLOBAL RUNG: WHY IT USED TO REFUSE, AND WHAT MAKES IT SAFE TO ANSWER NOW ──
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
 * the view is rewritten. So on a view that has printed no node line at all, both LITERAL guesses
 * cost the operator something and one of them costs him the cycle — that is still true today, and
 * is why this module still contains no hardcoded `"- [ ] "` fallback anywhere.
 *
 * WHAT CHANGED IS THAT A GUESS IS NO LONGER THE ONLY OTHER OPTION. `design-the-resolution-
 * architecture.md` step 5 published `qualification.sections[view][section].nodeType` — the
 * section's resolved node type, already cascaded GLOBAL -> VIEW by the generator, the exact
 * `default_node_type` fact this header used to say the snapshot envelope did not carry — and
 * step 6 (this one) added the ONE further fact that fact alone could not supply: which of the two
 * seedable CHROME FORMS that type actually renders with (`resolution.chromeShapes`, keyed by node
 * type, generated from `schema.yaml`'s `node_types.<t>.render.shape`). A type name on its own does
 * not settle checkbox-vs-plain — `person` and `task` are both names, and only reading
 * `render.shape` (or its absence, which the engine itself treats as checkbox — see that generator's
 * own header) tells them apart. Both facts present and agreeing is what turns the GLOBAL rung from
 * a guess into a read; either one missing is still a refusal, not a guess with better PR.
 *
 * SO THE GLOBAL RUNG STILL RETURNS `null`, AND HERE IS EXACTLY WHEN, NAMED RATHER THAN LEFT IMPLIED:
 *
 *   * no `GlobalRegistration` was supplied at all (a caller with no declaration, or a test
 *     exercising the print-based rungs alone) — the exact previous behaviour, unchanged;
 *   * `sectionAt` cannot name a `(view, section)` for `lineIndex` — above the first heading, an
 *     unaddressable view, or a markdown file with more headings than the config declares;
 *   * the named section is not in `qualification.sections[view]` — one of the 118 (of 159)
 *     qualifications the generator refused to normalise, `daily-work`'s 4 of 5 unpublished
 *     sections and `daily-personal`'s 5 of 8 among them; THIS IS A REAL, MEASURED CASE, not a
 *     hypothetical one, and it means the operator's own daily surfaces still refuse here today;
 *   * the resolved node type is not in `resolution.chromeShapes` — a type this config never uses
 *     as a `default_node_type` candidate (should not happen; the generator publishes every
 *     candidate it finds), or one whose declared `render.shape` is `stat_line`/`heading`, which
 *     this module does not know how to seed and will not guess at.
 *
 * NO SECTION OF THE OPERATOR'S REAL CONFIG IS DELETED FROM THE REFUSAL BY THIS CHANGE — it fires
 * for every one of the same reasons it always could, PLUS a section can now stop refusing when the
 * previous rungs found nothing printed. That is "fires less often", proven directly by
 * `tests/present-newline.test.mjs`, never assumed from the new fact existing.
 *
 * ── ONE LIMITATION, STATED RATHER THAN LEFT TO BE DISCOVERED ──
 *
 * The VIEW rung crosses a heading to find evidence, so it answers with another SECTION's shape.
 * That is sound only while no section declares a `default_node_type` of its own. The rung exists
 * (`bundle/validators/views.py:1312-1318`) and nothing in the operator's 73 view sheets uses it
 * today — every declaration is sheet-level. If one ever does, a new line in a silent section could
 * take the shape of a section that resolved differently. The GLOBAL rung above does not have this
 * limitation — it reads the SECTION's own resolved type, never a neighbour's — which is one more
 * reason a caller should prefer it firing over the VIEW rung's cross-heading guess, though nothing
 * here changes which one the walk reaches first (LINE, then STRUCTURAL_NODE, then VIEW, then
 * GLOBAL — most specific PRINTED evidence always wins over the declaration, unchanged).
 */

import { sectionAt } from "./address.js";
import { chromeOf, classifyLine } from "./resolution.js";
import type { PresentationLevel } from "./levels.js";
import type { DraftSurface } from "./draft.js";

/**
 * What the GLOBAL rung needs to become a read instead of a refusal — design-the-resolution-
 * architecture.md step 6. OPTIONAL everywhere it is accepted: a caller with none gets exactly the
 * previous behaviour, `null`, and every existing test that never mentions this type keeps passing
 * unmodified, which is the point of it being additive rather than a new required parameter.
 *
 * Deliberately three narrow, already-published slices rather than the whole `QualificationLanguage`
 * / `ConfigResolutionTable` — this module does not need predicates, `defaults:`, ordering or the
 * day boundary, and taking the whole shape would let it read facts §5.4 of the design document
 * (`app/present/membership.ts`'s own boundary) says are not this layer's to interpret.
 */
export interface GlobalRegistration {
  /** The view this new line is being opened in — `PaintDeps.view` / the page's `currentViewId`. */
  readonly view: string;
  /** `QualificationLanguage.sectionOrder` — the FULL declared order. NEVER `.sections`' proper
   * subset; see `address.ts`'s own header for why passing the subset here is the exact mistake
   * that module's type signature is built to make unrepresentable. */
  readonly sectionOrder: Readonly<Record<string, readonly string[]>>;
  /** `QualificationLanguage.sections` — read only for `.nodeType`, the section's MINTING default,
   * already cascaded GLOBAL -> VIEW by the generator. NEVER `resolution.registration.baseNodeType`
   * (the REVERT target) in this role — see this module's header and resolutiontable.ts's own for
   * the 2026-07-27 race that name confusion already cost once. */
  readonly sections: Readonly<Record<string, Readonly<Record<string, { readonly nodeType: string }>>>>;
  /** `ConfigResolutionTable.chromeShapes` — the one fact `nodeType` alone cannot supply. A type
   * absent here is a type this module refuses to seed rather than guess a chrome form for. */
  readonly chromeShapes: Readonly<Record<string, "checkbox" | "plain_line">>;
}

/** A new line's opening characters, and the rung of the cascade that decided them. */
export interface NewLine {
  /** The chrome the line starts with — `- [ ] `, `  - `, and so on. Never has content in it. */
  readonly text: string;
  /** Which rung answered. `GLOBAL` appears only when a `GlobalRegistration` was supplied AND it
   * had an answer — see this module's header for exactly when that is and when it still refuses. */
  readonly level: PresentationLevel;
}

/**
 * What a new line at `lineIndex` would be, or `null` when nothing — printed or declared — answers.
 *
 * `lineIndex` is the index the new line WOULD OCCUPY — the same index `applyEdit`'s `insert-line`
 * takes, so a caller never has to convert between "after line N" and "at index N+1" and get it
 * wrong in one of the two places.
 *
 * THE SEARCH IS SPLIT IN FOUR PASSES AND NOT ONE, because the passes are the cascade's rungs and
 * collapsing them would lose the provenance. Same-section-above first (most specific), then
 * same-section-below, then the rest of the view, then — only once every PRINTED line has been
 * asked and none answered — the declaration, if `declared` was supplied. Most specific PRINTED
 * evidence still wins outright: `declared` is consulted LAST, never first, which is what keeps
 * this the same "resolve, then evaluate" ordering `membership.ts`'s own header cites, rather than
 * a shortcut that lets a config default outrun something the operator can already see on screen.
 */
export function seedFor(
  source: string,
  lineIndex: number,
  declared?: GlobalRegistration,
): NewLine | null {
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

  // 4. GLOBAL — READ, not guessed (design-the-resolution-architecture.md step 6). Nothing in this
  //    view has ever been PRINTED as a node, so there is no evidence left to walk up to — but the
  //    declaration may still know what a node here looks like. `sectionAt` names the section the
  //    same way L3 ADDRESSING always does; its `nodeType` is the MINTING default (never
  //    `baseNodeType`, the revert target — see the header); `chromeShapes` is the one further fact
  //    that settles checkbox-vs-plain, which the type name alone cannot. Any one of the three
  //    missing is a refusal, exactly as it always was — this branch only ever RETURNS an answer,
  //    it never has to distinguish "I don't know" from "the answer is no chrome at all".
  if (declared !== undefined) {
    const sectionId = sectionAt(source, lineIndex, declared.view, declared.sectionOrder);
    const nodeType =
      sectionId === null ? undefined : declared.sections[declared.view]?.[sectionId]?.nodeType;
    const shape = nodeType === undefined ? undefined : declared.chromeShapes[nodeType];
    if (shape !== undefined) {
      return { text: shape === "checkbox" ? "- [ ] " : "- ", level: "GLOBAL" };
    }
  }
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
 *
 * `declared` is threaded straight to `seedFor` and nowhere else — this function still does not
 * decide anything about the GLOBAL rung's answer, it only obeys whatever `seedFor` returns, exactly
 * as it always has for the other three rungs.
 */
export function openLine(
  from: string,
  lineIndex: number,
  draft: DraftSurface,
  onDeclined?: (lineIndex: number) => void,
  declared?: GlobalRegistration,
): boolean {
  const seed = seedFor(from, lineIndex, declared);
  if (seed === null) {
    onDeclined?.(lineIndex);
    return false;
  }
  draft.open(lineIndex, seed.text);
  return true;
}

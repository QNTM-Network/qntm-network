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
 * ── THE DECLARED TOKENS: WHAT THE LINE IS, NOT JUST WHICH BOX IT WEARS ──
 *
 * `design-the-rule-mirror.md`'s ladder, rungs 1 and 2, and they arrive together because §3.3 says
 * they must. The operator's own words: "it gets stamped `task`. That's what the evidence would be
 * for inbox. Then for `personal all` it would get stamped `task` AND `personal`, as we have a
 * default resolution here."
 *
 * Until now this module resolved the section's node type on EVERY Enter and threw the name away,
 * keeping only the checkbox. It now also seeds the CHARACTERS the engine itself would print for
 * that answer — `- [ ] #task ` in `inbox`, `- [ ] #task #personal ` in `personal/all` — read off
 * `resolution.sectionRegistration[view][section].tokens`.
 *
 * THIS MODULE DERIVES NONE OF THAT. It does not know which tag spells `domain: personal`, what
 * order the engine emits tags in, or that a rule retypes a cadence-less `routine` inside the pass
 * that mints it. All three are config reads, done once, in
 * `scripts/generate-resolution-declaration.mjs`, each refusal recorded in that key's `dropped`
 * map. What arrives here is a list of strings and the only thing done with it is `join(" ")`.
 *
 * WHY WRITING THEM INTO THE LINE IS SAFE, WHICH IS THE ONE QUESTION THAT MATTERS. A value the
 * browser writes into the source is ingested as AUTHORED and outranks the rule that produced it,
 * so seeding a default converts a DERIVED value into an AUTHORED one. It costs nothing here
 * because THE ENGINE PERFORMS THAT SAME CONVERSION ITSELF, one cycle later: read the operator's
 * own `personal/all.md` and every line already carries `#task #personal`, printed by
 * `TokenResolver.source_tags_for_node` and read back as an authored token on the next ingest.
 * Seeding reaches the same fixed point one cycle earlier; it does not create one. A field the
 * engine prints NO tag for — `project`, on 60 sections — is never seeded, and that is the same
 * rule read the other way rather than a shortfall.
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

import { sectionForInsertAt } from "./address.js";
import { chromeOf, classifyLine } from "./resolution.js";
import { placeFor } from "./draft.js";
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
  /**
   * `ConfigResolutionTable.sectionRegistration` — read ONLY for `.tokens`, and never re-derived.
   *
   * The fourth slice, and the one that turns "which chrome" into "what this line IS". See this
   * module's header, section THE DECLARED TOKENS. OPTIONAL, like the whole of this interface: a
   * caller that omits it gets exactly the chrome-only seed that shipped before.
   */
  readonly sectionRegistration?: Readonly<
    Record<
      string,
      Readonly<Record<string, { readonly nodeType: string; readonly tokens: readonly string[] }>>
    >
  >;
}

/** A new line's opening characters, and the rung of the cascade that decided them. */
export interface NewLine {
  /**
   * The characters the line starts with. The chrome — `- [ ] `, `  - ` — followed by the DECLARED
   * TOKENS, when a declaration was supplied and the section has any. Never the operator's content:
   * everything here is something the config said, and the cursor sits after all of it.
   */
  readonly text: string;
  /** Which rung decided the CHROME. `GLOBAL` appears only when a `GlobalRegistration` was supplied
   * AND it had an answer — see this module's header for exactly when that is and when it still
   * refuses. The tokens below are NOT decided by this rung; they are read off the section. */
  readonly level: PresentationLevel;
  /**
   * The declared tokens seeded into `text`, in the engine's own order — `["#task", "#personal"]`.
   * Empty when no declaration was supplied, when `sectionAt` could not name the section, or when
   * the section has nothing spellable to say. Carried out separately from `text` so a caller can
   * report WHAT was said without re-parsing the characters it just asked for.
   */
  readonly tokens: readonly string[];
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

  // THE SECTION THIS LINE IS IN, named once. Both halves of the answer need it and they must not
  // disagree: the tokens are a fact about the section the line is ACTUALLY in, while the CHROME
  // may have come from a neighbour across a heading (the VIEW rung). Resolving it twice would be
  // two chances for the seed to describe two different sections.
  //
  // `sectionForInsertAt`, NOT `sectionAt` — `lineIndex` is where the new line WILL BE, not where an
  // existing line IS, and at two boundaries those name different sections. See that function's own
  // header for the arithmetic and for the 2026-08-01 browser observation it answers: `o` on the
  // trailing blank line seeded a bare `- [ ] ` in both `inbox` and `personal/all`, because
  // `sectionAt` refuses `lineIndex === lines.length` and the tokens fell to `[]` while the printed
  // rungs still copied the neighbour's chrome.
  const sectionId =
    declared === undefined
      ? null
      : sectionForInsertAt(source, lineIndex, declared.view, declared.sectionOrder);

  const chrome = chromeFor(lines, lineIndex, declared, sectionId);
  if (chrome === null) {
    return null;
  }

  // THE DECLARED TOKENS. Read, never derived — `sectionRegistration[view][section].tokens` is the
  // string the ENGINE would print for the node this section mints, generated once from the same
  // vocabulary the engine renders through. See this module's header, and
  // `scripts/generate-resolution-declaration.mjs`'s section 7 for why a field with no token is
  // never seeded rather than spelled some other way.
  //
  // THE TOKENS DO NOT DEPEND ON WHICH RUNG DECIDED THE CHROME, and that is deliberate. The chrome
  // is printed evidence and the most specific printed evidence wins; the tokens are a declaration
  // about the section, and the section is the same section whichever line the chrome was copied
  // from. Joining them by rung would let the VIEW rung's cross-heading answer drag another
  // section's meaning onto this line.
  const tokens =
    sectionId === null || declared === undefined
      ? []
      : declared.sectionRegistration?.[declared.view]?.[sectionId]?.tokens ?? [];

  // `chrome` already ends in the separator its own form carries (`- [ ] `, `- `), so the tokens
  // join straight on, and the trailing space is what puts the cursor after them rather than
  // between the last token and the operator's first character.
  const text = tokens.length === 0 ? chrome.text : `${chrome.text}${tokens.join(" ")} `;
  return { text, level: chrome.level, tokens };
}

/**
 * The four rungs, unchanged in every particular — this is `seedFor`'s original body, lifted whole
 * so the token seed above can be added WITHOUT touching the cascade walk. Returns the chrome and
 * the rung that decided it, or `null` when nothing — printed or declared — answers.
 */
function chromeFor(
  lines: readonly string[],
  lineIndex: number,
  declared: GlobalRegistration | undefined,
  sectionId: string | null,
): { readonly text: string; readonly level: PresentationLevel } | null {
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
  //    declaration may still know what a node here looks like. `sectionAt` named the section the
  //    same way L3 ADDRESSING always does; its `nodeType` is the MINTING default (never
  //    `baseNodeType`, the revert target — see the header); `chromeShapes` is the one further fact
  //    that settles checkbox-vs-plain, which the type name alone cannot. Any one of the three
  //    missing is a refusal, exactly as it always was — this branch only ever RETURNS an answer,
  //    it never has to distinguish "I don't know" from "the answer is no chrome at all".
  //
  //    THE TYPE IS NOW ASKED FOR TWICE, MOST COMPLETE SOURCE LAST-RESORT — `qualification.sections`
  //    first, exactly as before, then `resolution.sectionRegistration`. They agree wherever both
  //    answer (`tests/present-newline.test.mjs` asserts it over the operator's whole config); the
  //    second covers the 137 sections the first drops because their MEMBERSHIP predicate would not
  //    normalise, which is a fact about what already belongs there and not about what a new line
  //    becomes. `personal/all` is one of those 137. This rung therefore fires strictly MORE often
  //    than it did and never differently — the same "fires less often, never never" the header
  //    records for step 6.
  if (declared !== undefined && sectionId !== null) {
    const nodeType =
      declared.sections[declared.view]?.[sectionId]?.nodeType ??
      declared.sectionRegistration?.[declared.view]?.[sectionId]?.nodeType;
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
 *
 * ── IT ALSO TAKES THE ROW'S PLACE, HERE AND NOWHERE ELSE ──
 *
 * A row that is going to survive a projection has to know where it sits before the projection
 * arrives, because by then `from` is gone. `placeFor` (draft.ts) reads it off the SAME string this
 * function was handed and the SAME index it is opening at, which is the only pairing that means
 * anything — an index taken against one source and resolved against another describes a different
 * line. Both callers of this function go through it, so neither has to remember to.
 *
 * `view` NAMESPACES THE ANCHOR and must be the id `paintView` will later resolve it against
 * (`instance.ts`'s instance string is `${view}/${section}/${token}`). It falls back to
 * `declared.view` — the same id, when a declaration was supplied — and then to `""`, which is what
 * every caller that never re-places a row already gets from `focus.focus`'s own default.
 */
export function openLine(
  from: string,
  lineIndex: number,
  draft: DraftSurface,
  onDeclined?: (lineIndex: number) => void,
  declared?: GlobalRegistration,
  view?: string,
): boolean {
  const seed = seedFor(from, lineIndex, declared);
  if (seed === null) {
    onDeclined?.(lineIndex);
    return false;
  }
  draft.open(lineIndex, seed.text, placeFor(from, lineIndex, view ?? declared?.view ?? ""));
  return true;
}

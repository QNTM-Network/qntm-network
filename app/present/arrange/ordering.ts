/**
 * ordering — after this edit, will this line sort to a different position within its section?
 * PURE: no DOM, no fetch, no clock, no graph. design-the-resolution-architecture.md step 7, L5
 * EVALUATION.
 *
 * ── HOMED IN arrange/ — THE ARRANGE VERB ──
 *
 * The TREE half of docs/implementation-artifacts/design-the-three-layers.md's three-verb split:
 * "order and nest them; parent/child, context versus qualifying." `parentLineOf`, below, is this
 * browser's own hand-rolled reconstruction of the parent boundaries the engine's
 * `section_builder.py` computes once and discards before markdown ships — see
 * `arrange/incoming-section-tree.ts` for the seam where that fact would arrive already built.
 *
 * ── THE TWO MEASUREMENTS THAT DECIDED WHAT THIS MODULE IS, MADE BEFORE WRITING IT ──
 *
 * 1. DOES AN ORDERING KEY DEPEND ON THE CLOCK? Measured directly off the operator's real config
 *    (`presentation.json`'s `resolution.ordering`, 9 sections): seven sort on an ABSOLUTE field —
 *    `due_date` or `available_date` (four `this-week` sections, ascending) or `queue_position`
 *    (three `queue` sections, ascending) — and two (`daily-work`/`daily-personal`'s `capture`) use
 *    `orderingMode: insertion_order`, which has no field to compare at all. NONE compares a field
 *    against "today" — `due_date <= $cycle_today` is a MEMBERSHIP question (which section a row is
 *    IN, already decided before this module runs) and a completely different question from "given
 *    two rows already in the same section, which sorts first" (a field-to-field comparison an ISO
 *    date string answers by itself). **So the day boundary (step 8) is not a dependency of this
 *    module.** The design document's own build-order table lists step 7 as needing "5, and 8 for
 *    the dated half" — that "dated half" does not exist for ORDERING specifically, only for
 *    MEMBERSHIP, which is a different layer (`membership.ts`) already built and already silent for
 *    all nine of these sections (next point). This is a measurement, not an assumption: it is
 *    re-run by `tests/present-ordering.test.mjs` §1 against the shipped declaration, with a
 *    positive control (asserting at least one section's field IS `due_date`) so a result of "zero
 *    clock-bound orderings" cannot be an artefact of a broken reader.
 *
 * 2. CAN THE BROWSER KNOW A LINE'S POSITION WITHIN ITS SECTION? It has the source string, the
 *    ordering field's name, and — since step 5 published nothing that maps a field name to how its
 *    value is SPELLED — this step's own addition, `resolution.orderingFields` (the trailing-token
 *    marker `config/vocabulary/markers.yaml` already declares: `📅`/`🛫`/`🔢`). What it does NOT
 *    have is a reliable way to tell, from a printed line's characters alone, whether that line is a
 *    genuine member of the section's ordering (as opposed to an ANCESTOR pulled in for context —
 *    `pull_context: ancestors` — printed in the same section for a descendant that matches, with
 *    none of the descendant's own fields). `membership.ts` cannot answer this either: every real
 *    sibling in a populated section already carries a `[[qntm:N]]` stamp, and `membershipFor`
 *    abstains `already-a-node` for every one of them by design (it answers for a line being TYPED,
 *    not an existing node). So this module does NOT claim to know full section membership. It
 *    claims something narrower: AMONG THE SIBLING LINES THAT ALSO CARRY THIS SECTION'S OWN
 *    ORDERING MARKER, where does the edited line's new value rank. A row without the marker (an
 *    ancestor with no `due_date`, or — measured directly against `~/qntm/dev/flow-trace/queue.md` —
 *    a DONE item whose `🔢` was removed once it left the active queue) is excluded from the ranked
 *    set, not guessed at.
 *
 *    THAT ALONE IS NOT ENOUGH, AND A REAL MEASUREMENT AGAINST `~/qntm/this_week.md` PROVED IT.
 *    `apps/qntm-md/src/qntm_md/render/section_builder.py:337-341` (`_order_children`) sorts a
 *    section's `ordering:` key ONLY WITHIN the qualifying siblings that share one PARENT, and —
 *    load-bearing — `ordered = _canonical_context_order(context_nodes) + ordered_qualifying` puts
 *    every ANCESTOR/context row at a tree level BEFORE every ordering-sorted qualifying row at that
 *    SAME level, regardless of the qualifying rows' own field values. Measured directly:
 *    `available-overdue`'s real content prints "Check personal outcomes" (`available_date`
 *    2026-07-27, the EARLIEST in the section) LAST, after two `#outcome` ancestor roots whose own
 *    subtrees carry the LATER date 2026-07-28 — because at the section's root level, "Check
 *    personal outcomes" is a QUALIFYING root sorted after two CONTEXT roots, never compared to them
 *    by date at all. A flat, whole-section rank (comparing every marker-bearing line regardless of
 *    tree position) would have called this a "moved" prediction the cycle would then contradict.
 *    **2026-08-06, NARROWED — this module used to refuse outright, abstention `nested-section`, the
 *    instant ANY line in the section's printed range carried indentation. It no longer does, for
 *    THIS (marker-based) path.** The finding above was never "any nesting is unsafe" — it was
 *    "a flat, WHOLE-SECTION rank crosses parents `_order_children` never lets cross." `parentLineOf`
 *    (below `anyLineIndented`) rebuilds the same PARENT boundaries `_order_children` itself ranks
 *    within — one call per parent, `section_builder.py:258-289`/`:291-299` — straight off the
 *    printed indentation, and `evaluateSection` now ranks a line only against siblings sharing its
 *    OWN parent. "Check personal outcomes" is a concrete instance: with parent-aware grouping its
 *    group is the section's ROOT level, and the only OTHER root-level lines are the two `#outcome`
 *    ancestors — which carry no `available_date` of their own and are excluded by `tupleFor`'s
 *    existing marker requirement (measurement 2's own opening paragraph, unchanged) — so it ranks
 *    alone, `siblingCount: 0`, never compared to the deeper dated rows that broke the flat model.
 *    See `parentLineOf`'s own header for the full citation and for why this narrowing is sound for
 *    a MARKER-based field but is not extended to the title-based default path below.
 *
 *    `snapshot.graph` (1,501 nodes, 460 edges) already reaches the browser and is NOT read here —
 *    the marker-token reading gives an answer computed the same way for the sibling rows and for
 *    the row being edited (apples to apples), where a graph lookup for siblings and a text read for
 *    the edited line's about-to-be-written value would be two representations of one fact that
 *    could silently disagree. The graph also does not carry which rows are CONTEXT vs QUALIFYING —
 *    that distinction lives in a placement-filter re-evaluation this module does not attempt.
 *
 * ── WHAT THIS MODULE REFUSES, NAMED RATHER THAN LEFT TO BE DISCOVERED ──
 *
 *   NO-SECTION-DECLARATION. The (view, section) is not in `resolution.ordering` — 177 of 186
 *   sections, always.
 *
 *   INSERTION-ORDER. The section only declares `orderingMode` (`daily-work`/`daily-personal`'s
 *   `capture`) — there is no field an edit could move a row BY, so a row's slot never changes as a
 *   consequence of what is typed into it (it changes as a consequence of WHEN a line was inserted,
 *   a fact this module has no way to preview and the engine itself only fixes at cycle time).
 *
 *   FIELD-NOT-PUBLISHED. The section's ordering key names a field `resolution.orderingFields` has
 *   no marker for (unpublished today, but the reader stays honest if the config ever adds one).
 *
 *   NESTED-SECTION. **2026-08-06: no longer produced by the DECLARED path** (`evaluateSection`) —
 *   see measurement 2's own update, above, and `parentLineOf`'s header. On the DEFAULT/title path
 *   (`evaluateDefaultSection`, below `orderingPlacementFor`'s own code) it is unconditional UNLESS
 *   the caller supplies `classifyQualifying` (`orderingqualify.ts`) — `title` has no marker to
 *   exclude a context row by, so parent-aware grouping alone is not provable safe there
 *   (`tests/present-ordering.test.mjs` §11d's own counter-example) without a real qualifying/context
 *   signal from the graph. See `evaluateDefaultSection`'s own header for the mechanism.
 *
 *   NO-VALUE. The edited line's BEFORE or AFTER text does not carry an extractable value for every
 *   key the section orders by. Symmetric with `membership.ts`'s "either side abstaining is
 *   silence": there is nothing to compare a missing value against.
 *
 * ── WHAT THIS MODULE NEVER DOES, AS FIRST WRITTEN — AND THE ONE PARAGRAPH THAT CHANGED ──
 *
 * `orderingFor` itself produces no `Contribution` and no `SourceEdit`, and still does not:
 * `paint.ts`'s row-building code is never reached from this function, and its only caller
 * (`app/index.html`'s `orderingNoteFor`) still only writes the answer into the freshness line.
 * THAT PARAGRAPH IS UNCHANGED AND THE TESTS THAT PINNED IT (`tests/present-ordering.test.mjs`,
 * `tests/app-ordering-note.test.mjs`) STILL PASS UNMODIFIED.
 *
 * **2026-08-04, `roadmap-the-road-ahead.md` step 3.** The sentence that used to sit here —
 * "this module returns a RANK COMPARISON, not an index into `viewBody`" — was a true description
 * of the only function this file had. It is no longer a true description of the FILE, because the
 * operator's own brief for this step is "make it place the row," which is exactly an index into
 * `viewBody`. Rather than stretch `orderingFor`'s own contract to cover a second job, this file
 * gained a SECOND, NAMED function — `orderingPlacementFor` — that answers the placement question
 * `orderingFor` was built to refuse. It shares every abstention `orderingFor` has (both call the
 * same private `evaluateSection`, so the two can never disagree about WHETHER to answer) and adds
 * no new one: the same nine sections that can be ranked can be placed, the same 177 that cannot be
 * ranked cannot be placed either. See `orderingPlacementFor`'s own header for the proof that its
 * answer agrees with the engine's, not merely that it produces AN index.
 *
 * **2026-08-06, PARENT-AWARE SIBLING GROUPING.** The operator's own report: browser ordering had
 * gone silent almost everywhere, because `nested-section` fired the instant ANY line in a section
 * nested — which four of the `this-week` sections do on every real cycle (they print `#outcome`
 * ancestors) and which `qntm-queue`'s own summary-child shape does too. `evaluateSection` (shared by
 * `orderingFor`/`orderingPlacementFor`) no longer refuses on that trigger alone: `parentLineOf`
 * (below `anyLineIndented`) restricts the ranked sibling set to lines sharing the edited line's own
 * PARENT, mirroring `_order_children`'s one-call-per-parent shape (`section_builder.py:258-299`)
 * instead of ranking the whole flattened section. This is NOT a blanket removal — see
 * `parentLineOf`'s own header for exactly what makes it sound for THIS (marker-based) path, and
 * `evaluateDefaultSection`'s header (below) for the concrete, cited reason the title-based DEFAULT
 * path keeps refusing. `nested-section` remains a real, reachable abstention — reachable from the
 * default path only, now — not a retired one.
 *
 * **2026-08-06, `orderingqualify.ts`.** `evaluateDefaultSection` gained an OPTIONAL parameter,
 * `classifyQualifying`, letting a caller with the live graph (`resolvers/ordering.ts`) hand in the
 * one fact `title` cannot carry — is a sibling a genuine qualifying member, read off the engine's
 * own last cycle, never approximated from characters. See that function's own header for the
 * mechanism and `orderingqualify.ts`'s header for why no text-only version can exist. Without the
 * parameter this file's behaviour is unchanged, byte for byte.
 *
 * **2026-08-07, "NO" AND "DON'T KNOW" STOPPED SHARING A REPRESENTATION.** The operator's own report,
 * traced live: a single `o` -> type -> Enter left the row where it was typed, reaching its sorted
 * slot only once the engine's cycle caught up. Root cause was `orderingqualify.ts`'s node lookup
 * comparing a stamp against `node.id` (the graph engine's internal UUID) instead of `fields.qntm_id`
 * (what a `[[qntm:N]]` stamp actually names — `graphmatch.ts`'s `resolvedQntmId`), which made
 * `classifyQualifying` answer `undefined` for every stamped sibling, not only the genuinely stale
 * ones. That is fixed at the source. This file's OWN part of the incident: with EVERY sibling
 * excluded, `siblingsRaw` emptied out to the same shape a genuinely-empty, confidently-decided group
 * already produces — `beforeLineIndex`/`currentBeforeLineIndex` both `null`, which `arm`'s insert
 * gate reads as "nothing to place" rather than "could not tell." `classifyQualifying`'s node-lookup
 * bug is what CAUSED this incident; this file's `null`-for-both-"no" and `null`-for-"don't-know" is
 * what let it fail SILENTLY rather than loudly, and would let the NEXT unknown (a genuinely stale
 * graph snapshot, or a qualifier whose one-hop edge type `edgeSourceOfFor` cannot resolve — both
 * still real, see `orderingqualify.ts`'s own header) do the identical silent thing. `siblingsRaw`
 * emptying out because EVERY candidate was UNKNOWN now abstains `unclassifiable-siblings` instead
 * of answering — see that abstention's own header on `OrderingAbstention`.
 */

import { classifyLine, cleanTitleFor } from "../express/rendition.js";
import type { CleanTitleReading } from "../express/rendition.js";
import type { OrderingFieldMarker, OrderingKey, SectionOrdering } from "../resolutiontable.js";

/**
 * Why nothing is said. The first five name a refusal in this module's own header, for the DECLARED
 * path (`orderingFor`/`orderingPlacementFor`). The last three belong to the DEFAULT path
 * (`defaultOrderingFor`/`defaultOrderingPlacementFor`, below `orderingPlacementFor`'s own code) —
 * `roadmap-the-road-ahead.md`'s next step, "the engine's own default ordering, made explicit":
 *
 *   CONTAINER-ORDERING-DIRECTIVE. The section's own heading line carries a literal `#order:`
 *   substring — `view_registration.py`'s `ordering_binding` reads the CONTAINER NODE'S OWN
 *   `ordering` field (settable at runtime by exactly this directive, `parse_order_directive.py`)
 *   BEFORE it ever falls back to the view-section `ordering:` this app already reads, and that
 *   node-owned value is graph state this app has no way to preview. `format_directive` prints it
 *   straight back onto the rendered heading, so this is a printed fact, not a hidden one — this
 *   module refuses rather than assume the config-only fallback still applies.
 *
 *   STYLE-AMBIGUOUS-TITLE. `cleanTitleFor` (rendition.ts) could not prove its title string agrees
 *   with the engine's own `canonicalise_title_segment` — see that function's own header.
 *
 *   HAS-DECLARED-ORDERING. Defence in depth: `defaultOrderingFor`/`defaultOrderingPlacementFor`
 *   are for sections `ordering[view][section]` has NOTHING to say about. Calling either on a
 *   section that DOES declare `ordering`/`orderingMode` is a caller error this module refuses
 *   rather than silently answers by the wrong rule — `resolveOrderingFor`/
 *   `resolveOrderingPlacementFor` (this file's own dispatcher) never makes that call by
 *   construction, so a caller reaching this abstention went around the dispatcher.
 *
 *   NOT-QUALIFYING. Reachable only with `classifyQualifying` supplied AND confidently saying the
 *   EDITED line itself is CONTEXT, not qualifying — `_order_children` (`section_builder.py:319-345`)
 *   never gives a context row a title-ordered rank, so there is nothing to place it against.
 *
 *   UNCLASSIFIABLE-SIBLINGS. **2026-08-07.** Reachable only with `classifyQualifying` supplied —
 *   every OTHER same-parent-group line was excluded from the ranked set, AND at least one of them
 *   was excluded because the classifier could not decide (`undefined` — unknown), not because it
 *   confidently read CONTEXT (`false`). Without this abstention, "everyone I could read said
 *   context" and "I could not read anyone" produce the IDENTICAL `siblingCount: 0` answer — and for
 *   a `defaultOrderingPlacementFor` caller that empty set collapses `beforeLineIndex` AND
 *   `currentBeforeLineIndex` to `null`, which the insert gate (`resolvers/ordering.ts`'s `arm`,
 *   `currentBeforeLineIndex !== beforeLineIndex`) reads as "already correct" — the exact silent
 *   failure this abstention exists to make visible instead. See `evaluateDefaultSection`'s own call
 *   site for the precise trigger, and this module's own header, "2026-08-07", for the incident this
 *   answers.
 */
export type OrderingAbstention =
  | "no-section-declaration"
  | "insertion-order"
  | "field-not-published"
  | "nested-section"
  | "no-value"
  | "container-ordering-directive"
  | "style-ambiguous-title"
  | "has-declared-ordering"
  | "not-qualifying"
  | "unclassifiable-siblings";

/** The answer, when there is one. `moved` is the whole of it; the rest is provenance. */
export interface OrderingAnswer {
  readonly moved: boolean;
  /** 1-based rank among the edited line and every sibling whose marker could be read, BEFORE. */
  readonly beforeRank: number;
  /** The same rank, AFTER. */
  readonly afterRank: number;
  /** How many OTHER lines in the section were ranked alongside the edited line. */
  readonly siblingCount: number;
}

/** Either an answer, or the reason there is none. Never a default, never a guess. */
export type OrderingReading =
  | { readonly kind: "answer"; readonly answer: OrderingAnswer }
  | { readonly kind: "abstains"; readonly because: OrderingAbstention };

const abstains = (because: OrderingAbstention): OrderingReading => ({ kind: "abstains", because });

// ── THE SECTION'S OWN LINE RANGE — the same "a heading OPENS the section it is the first line
// of" convention app/present/address.ts's own header cites (renderer.py:399/:430), walked directly
// rather than reused, because address.ts's ordinal walk answers "which section", not "which OTHER
// lines are in it" — a different question this module needs and that one does not.
function sectionBounds(
  lines: readonly string[],
  lineIndex: number,
): { start: number; end: number; headingIndex: number | null } {
  let start = 0;
  // `headingIndex` — null if no heading was found above `lineIndex` at all (malformed content);
  // added for the DEFAULT-ordering path's own container-directive check, below. The declared path
  // never reads it — one walk, a second consumer, not a second walk.
  let headingIndex: number | null = null;
  for (let at = lineIndex; at >= 0; at -= 1) {
    if (classifyLine(lines[at] ?? "").kind === "heading") {
      start = at + 1;
      headingIndex = at;
      break;
    }
  }
  let end = lines.length;
  for (let at = lineIndex + 1; at < lines.length; at += 1) {
    if (classifyLine(lines[at] ?? "").kind === "heading") {
      end = at;
      break;
    }
  }
  return { start, end, headingIndex };
}

// A line carries indentation when a non-blank character sits behind leading whitespace —
// `renderer.py:950`'s `'    ' * depth` prefix, the ONLY way this engine prints an ancestor/context
// row or a nested child. Blank lines (all-whitespace) are not "indented content" and do not trip
// this — an empty line between two flat rows must not turn a genuinely flat section into a refusal.
const INDENTED_CONTENT = /^\s+\S/;

function anyLineIndented(lines: readonly string[], start: number, end: number): boolean {
  for (let at = start; at < end; at += 1) {
    if (INDENTED_CONTENT.test(lines[at] ?? "")) return true;
  }
  return false;
}

/**
 * 2026-08-06, PARENT-AWARE SIBLING GROUPING — the declared path's own narrowing of
 * `nested-section`, mirroring `section_builder.py`'s tree directly rather than refusing the
 * instant a section nests at all. See this module's header, "measurement 2", for the finding that
 * MOTIVATED this: `_order_children` (`section_builder.py:306-348`) is called ONCE PER PARENT — once
 * for the section's own root list (`build:291-299`), once again for every node's own `children` as
 * `build_node` recurses (`build:258-289`, the call at `:270-278`) — and each call ranks ONLY the
 * nodes it was given, which share that one call's PARENT. A line several tree levels away, under a
 * DIFFERENT parent, is never a candidate for that comparison at all — not merely a candidate that
 * loses a tiebreak. `available-overdue`'s finding was never "context beats qualifying"; it was
 * "Check personal outcomes" (a ROOT) got compared, by a flat whole-section rank, against dated rows
 * living several levels beneath two OTHER roots — rows that are not its siblings under any
 * definition the engine has. Restricting the ranked set to true siblings removes exactly that
 * cross-parent comparison and nothing else.
 *
 * The walk below returns, for every non-blank line in `[start, end)`, the file index of its nearest
 * enclosing line with STRICTLY LESS leading whitespace — `null` for a line at the section's own top
 * level (the engine's `root_ids`, `build:244-250`). This is sound because `renderer.py:591-620`
 * (`_render_tree_node`, `depth=depth+1` at its one recursive call, `:722`) guarantees every child
 * prints at EXACTLY one level deeper than its own immediate parent, never more, never less — so two
 * lines share a real tree parent if and only if they share the nearest shallower line above them.
 * The comparison uses the RAW leading-whitespace character count, not a divided "depth" number —
 * deliberately: `content_diff.py:721-722` (cited in `indent.ts`'s own header) reads a raw count for
 * the identical reason, and a raw count needs no `indentUnit` read to stay correct, since two true
 * siblings always carry the IDENTICAL exact prefix (`'    ' * depth`, repeated, never approximated).
 *
 * Blank lines are skipped entirely, matching `INDENTED_CONTENT`/`anyLineIndented` above — an empty
 * line between two siblings carries no depth of its own and must not interrupt the walk.
 *
 * WHY THIS IS SAFE FOR THE MARKER-BASED FIELDS THIS FUNCTION SERVES (`due_date`/`available_date`/
 * `queue_position`) AND NOT EXTENDED TO THE DEFAULT/TITLE PATH BELOW — see that path's own header
 * for the argument in full. In short: a CONTEXT/ancestor row that lacks this section's own ordering
 * marker is already excluded from `tupleFor`'s ranked set regardless of parent (the exclusion this
 * module's header, measurement 2, already names as accepted and pre-existing) — this walk only
 * stops a context-free, cross-parent QUALIFYING row from being compared to a QUALIFYING row it does
 * not share a parent with. The default/title path has no such exclusion available: `title` is
 * readable off every line, context or qualifying alike, so the same walk there would happily seat a
 * context row into a title comparison the engine never runs — see `evaluateDefaultSection`'s own
 * header for why that path keeps the blanket refusal.
 */
function parentLineOf(lines: readonly string[], start: number, end: number): ReadonlyMap<number, number | null> {
  const parentOf = new Map<number, number | null>();
  const stack: { lineIndex: number; indent: number }[] = [];
  for (let at = start; at < end; at += 1) {
    const match = /^(\s*)\S/.exec(lines[at] ?? "");
    if (match === null) continue; // blank line — no depth, does not interrupt the walk
    const indent = match[1]?.length ?? 0;
    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? -1) >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    parentOf.set(at, parent === undefined ? null : parent.lineIndex);
    stack.push({ lineIndex: at, indent });
  }
  return parentOf;
}

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const INT_SHAPE = /^-?\d+$/;
const FLOAT_SHAPE = /^-?\d+(?:\.\d+)?$/;

/** The trailing-token half of `OrderingFieldMarker` — `markerValue` below reads only this shape;
 * an `"enum"` marker (`priority`'s `🔽`/`⏫`) has no single glyph and no trailing value at all, so
 * it is never a valid argument here — see `tupleFor`'s own guard, which refuses one before it
 * would reach this function. */
type TrailingMarker = Extract<OrderingFieldMarker, { readonly kind: "date" | "int" | "float" }>;

function shapeMatches(marker: TrailingMarker, token: string): boolean {
  if (marker.kind === "date") return DATE_SHAPE.test(token);
  if (marker.kind === "int") return INT_SHAPE.test(token);
  return FLOAT_SHAPE.test(token);
}

/**
 * The value trailing `marker`'s glyph on `line`, or `undefined` if the glyph is absent or what
 * follows it does not have the shape `marker.kind` demands — the same "first whitespace-separated
 * run after a value-bearing marker IS its value" rule `parse_marker.py:98-99` reads by (this
 * module's header cites the full chain). A literal substring search for the glyph, never a dynamic
 * RegExp built from it: `markers.yaml`'s tokens are single graphemes, sometimes with a trailing
 * variation selector, and building a pattern from arbitrary characters is a heavier and riskier
 * tool than `indexOf` needs to be for an exact, known string.
 */
export function markerValue(line: string, marker: TrailingMarker): string | undefined {
  const at = line.indexOf(marker.token);
  if (at === -1) return undefined;
  const after = line.slice(at + marker.token.length);
  const match = /^\s+(\S+)/.exec(after);
  if (match === null) return undefined;
  const token = match[1] ?? "";
  return shapeMatches(marker, token) ? token : undefined;
}

/** One line's value for every key in `keys`, or `undefined` if ANY key's value is missing. */
function tupleFor(
  line: string,
  keys: readonly OrderingKey[],
  markers: Readonly<Record<string, OrderingFieldMarker>>,
): readonly string[] | undefined {
  const values: string[] = [];
  for (const key of keys) {
    const marker = markers[key.field];
    if (marker === undefined) return undefined; // field-not-published; caller has already checked
    // An "enum" marker has no reader in THIS declared-path model (compareValue below never learned
    // priorityRank) — evaluateSection's own field-not-published guard is widened to catch this
    // before tupleFor is ever reached; this is defence in depth, not the primary guard.
    if (marker.kind === "enum") return undefined;
    const value = markerValue(line, marker);
    if (value === undefined) return undefined;
    values.push(value);
  }
  return values;
}

function compareValue(kind: OrderingFieldMarker["kind"], a: string, b: string): number {
  if (kind === "date") return a < b ? -1 : a > b ? 1 : 0;
  return Number(a) - Number(b);
}

/** -1 if `a` sorts before `b` under `keys`' declared directions, +1 after, 0 tied on every key. */
function compareTuples(
  a: readonly string[],
  b: readonly string[],
  keys: readonly OrderingKey[],
  markers: Readonly<Record<string, OrderingFieldMarker>>,
): number {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (key === undefined) continue;
    const marker = markers[key.field];
    if (marker === undefined) continue;
    const diff = compareValue(marker.kind, a[i] ?? "", b[i] ?? "");
    if (diff !== 0) return key.direction === "desc" ? -diff : diff;
  }
  return 0;
}

/** 1-based rank of `target` among itself and every tuple in `siblings` that sorts before it. */
function rankOf(
  target: readonly string[],
  siblings: readonly (readonly string[])[],
  keys: readonly OrderingKey[],
  markers: Readonly<Record<string, OrderingFieldMarker>>,
): number {
  let rank = 1;
  for (const sibling of siblings) {
    if (compareTuples(sibling, target, keys, markers) < 0) rank += 1;
  }
  return rank;
}

/** One OTHER marker-bearing line in the edited line's section, in FILE ORDER — its own line index,
 * carried alongside its tuple, because `orderingFor` only ever needed the tuple and
 * `orderingPlacementFor` (below) needs to say WHICH LINE its answer is relative to. */
interface RankedSibling {
  readonly lineIndex: number;
  readonly tuple: readonly string[];
}

/** What both exported functions need before they can answer their OWN question — the declaration
 * check, the nesting refusal, and the two tuples, gathered exactly once so `orderingFor` and
 * `orderingPlacementFor` cannot answer "does this section qualify" two different ways. */
type SectionEvaluation =
  | {
      readonly kind: "answer";
      readonly keys: readonly OrderingKey[];
      readonly beforeTuple: readonly string[];
      readonly afterTuple: readonly string[];
      readonly siblings: readonly RankedSibling[];
    }
  | { readonly kind: "abstains"; readonly because: OrderingAbstention };

function evaluateSection(
  viewId: string,
  sectionId: string,
  source: string,
  lineIndex: number,
  afterText: string,
  ordering: Readonly<Record<string, Readonly<Record<string, SectionOrdering>>>>,
  orderingFields: Readonly<Record<string, OrderingFieldMarker>>,
): SectionEvaluation {
  const declared = ordering[viewId]?.[sectionId];
  if (declared === undefined) return { kind: "abstains", because: "no-section-declaration" };
  const keys = declared.ordering;
  if (keys === undefined || keys.length === 0) return { kind: "abstains", because: "insertion-order" };
  for (const key of keys) {
    const marker = orderingFields[key.field];
    // An "enum" marker (priority's shape) has no reader in this declared-ordering model — see
    // tupleFor/markerValue's own guard. Treated the SAME as no marker at all: this model can no
    // more read a value from it than it could read one from nothing.
    if (marker === undefined || marker.kind === "enum") {
      return { kind: "abstains", because: "field-not-published" };
    }
  }

  const lines = source.split("\n");
  const { start, end } = sectionBounds(lines, lineIndex);

  const beforeText = lines[lineIndex] ?? "";
  const beforeTuple = tupleFor(beforeText, keys, orderingFields);
  const afterTuple = tupleFor(afterText, keys, orderingFields);
  if (beforeTuple === undefined || afterTuple === undefined) return { kind: "abstains", because: "no-value" };

  // PARENT-AWARE — see `parentLineOf`'s own header for the full citation. `_order_children`
  // (`section_builder.py:306-348`) ranks ONLY the siblings one call was given, which share one
  // PARENT (the section's own root level, or one node's own `children`) — never the whole section
  // flattened. A line under a DIFFERENT parent is walked past here exactly as it is in the engine:
  // not compared, not even considered, regardless of whether it carries this section's marker.
  const parentOf = parentLineOf(lines, start, end);
  const group = parentOf.get(lineIndex) ?? null;

  const siblings: RankedSibling[] = [];
  for (let at = start; at < end; at += 1) {
    if (at === lineIndex) continue;
    if (!parentOf.has(at)) continue; // blank line — not a member of any group
    if (parentOf.get(at) !== group) continue; // a different parent — not a true sibling
    const tuple = tupleFor(lines[at] ?? "", keys, orderingFields);
    if (tuple !== undefined) siblings.push({ lineIndex: at, tuple });
  }

  return { kind: "answer", keys, beforeTuple, afterTuple, siblings };
}

/**
 * Does the line at `lineIndex` (as `source` currently holds it) rank differently within its
 * section once it reads `afterText` instead?
 *
 * `source` is the WHOLE FILE the edit was computed against (the painter's own `LineCommit.source`,
 * the same value `membershipNoteFor` reads its "before" from) — never the edited-in-place
 * `commit.markdown`, which already carries `afterText` at this index and would compare a line
 * against itself.
 */
export function orderingFor(
  viewId: string,
  sectionId: string,
  source: string,
  lineIndex: number,
  afterText: string,
  ordering: Readonly<Record<string, Readonly<Record<string, SectionOrdering>>>>,
  orderingFields: Readonly<Record<string, OrderingFieldMarker>>,
): OrderingReading {
  const evaluation = evaluateSection(viewId, sectionId, source, lineIndex, afterText, ordering, orderingFields);
  if (evaluation.kind === "abstains") return abstains(evaluation.because);

  const tuples = evaluation.siblings.map((s) => s.tuple);
  const beforeRank = rankOf(evaluation.beforeTuple, tuples, evaluation.keys, orderingFields);
  const afterRank = rankOf(evaluation.afterTuple, tuples, evaluation.keys, orderingFields);
  return {
    kind: "answer",
    answer: {
      moved: beforeRank !== afterRank,
      beforeRank,
      afterRank,
      siblingCount: tuples.length,
    },
  };
}

/** The answer `orderingPlacementFor` gives when it can — an index a painter can act on, not a
 * rank a sentence can narrate. */
export interface OrderingPlacement {
  /** Whether the row's position actually changes — the same fact `OrderingAnswer.moved` states,
   * recomputed independently rather than threaded through, so a caller driving this function alone
   * (without also calling `orderingFor`) gets a self-contained answer, and so a test can assert the
   * two never disagree rather than trust that they were computed once and shared.
   *
   * A RANK COMPARISON, NOT A POSITION COMPARISON — it answers "would this edit change the VALUE
   * this row ranks by", which is the right question for an existing row whose PHYSICAL slot in
   * `source` is already trusted (the file was sorted before this edit; only the edit could have
   * desynced it). It is the WRONG question for a row with no before-state at all — see
   * `currentBeforeLineIndex`'s own header, and `roadmap-the-road-ahead.md`'s "settle fires for a
   * newly added line" step, for the row this field alone cannot answer for. */
  readonly moved: boolean;
  /** The CURRENT line index (in `source`, before this edit is painted) of the sibling the edited
   * line should sit immediately BEFORE once its new value has sorted in. `null` — nothing in the
   * section sorts after it: the edited line becomes the last ranked row. Meaningless when `moved`
   * is `false`; a caller that places on `moved` must not read this when it is not. */
  readonly beforeLineIndex: number | null;
  /**
   * THE SIBLING `lineIndex` ALREADY SITS IMMEDIATELY BEFORE, IN `source`, RIGHT NOW — `null` when
   * nothing ranked follows it there. A POSITION fact, not a rank one: computed from the same
   * file-order walk `beforeLineIndex` sorts, read BEFORE that sort is applied, so it costs nothing
   * extra and can never disagree about which siblings exist.
   *
   * THIS IS WHAT MAKES "IS THE ROW WHERE IT BELONGS" ANSWERABLE FOR A ROW `moved` CANNOT ANSWER
   * FOR. A freshly `insert-line`d row has no rank-changing edit to compare — `evaluateSection`'s
   * own before/after tuple would be identical (the row's one and only value), so `moved` is always
   * `false` for it, which is the exact defect `armOrderingSettle` (app/index.html) had: a new row's
   * destination was computed correctly and never acted on, because `moved` asked the wrong
   * question. `currentBeforeLineIndex !== beforeLineIndex` asks the right one for ANY row,
   * inserted or edited: does its actual neighbour already match its correct one. `armOrderingSettle`
   * uses `moved` for `set-line` (unchanged, proven behaviour) and this comparison for
   * `insert-line` (see that function's own header for why the two need different gates).
   */
  readonly currentBeforeLineIndex: number | null;
}

/** Either a placement, or the same reason `OrderingReading` would abstain — see this module's
 * header for why the two functions can never abstain differently. */
export type PlacementReading =
  | { readonly kind: "answer"; readonly placement: OrderingPlacement }
  | { readonly kind: "abstains"; readonly because: OrderingAbstention };

/**
 * WHERE the line at `lineIndex` belongs once it reads `afterText` — an index into the section's
 * OTHER ranked rows, not merely whether one exists. Same inputs as `orderingFor`, same abstentions,
 * a different question.
 *
 * ── THE PROOF OF AGREEMENT, STATED BEFORE THE CODE THAT MAKES IT TRUE ──
 *
 * `section_builder.py:340-344` (`_order_children`, the non-`persist_placing` branch every one of
 * the nine declared sections takes) sorts qualifying nodes with Python's `sorted(qualifying_nodes,
 * key=...)`. Python's own language reference guarantees that sort is STABLE: two nodes whose keys
 * compare equal keep the relative order they had in `qualifying_nodes` — which is graph-edge order,
 * and `orderingFor`'s own header (measurement 2) already establishes, and this module's existing
 * tests already prove, that graph-edge order and this file's own line-by-line walk of `source`
 * agree for every flat section — the only shape either function will ever answer for. So: build
 * the SAME list this function's own walk already has — every ranked sibling, in file order, PLUS
 * the edited line's own entry (using `afterText`) spliced back into its own file position — and
 * sort THAT list with the one guarantee that matters: JavaScript's `Array.prototype.sort` has been
 * REQUIRED stable since ECMA-262 2019, which V8/Node has implemented for every version this repo
 * could plausibly run on. A stable sort of the identical pre-sort order, under the identical
 * comparator (`compareTuples`, already measured against his real config), produces the identical
 * post-sort order — including which element a tie leaves adjacent to which. The row immediately
 * AFTER the edited line's own entry in that result is the row it now belongs beside.
 *
 * THIS IS SOURCE EVIDENCE, NOT A LIVE MEASUREMENT, AND THAT DISTINCTION IS DELIBERATE — the same
 * one `paint.ts`'s own `normalLine` comment draws for the CSS Working Group's readonly-caret
 * thread: nobody ran the Python engine to WATCH two tied `due_date`s resolve. What is checked is
 * that both languages' sort primitives are DOCUMENTED stable and that the pre-sort list this
 * function builds is the SAME list (same order, same members) `_order_children` sorts — which is a
 * claim about two specifications agreeing, not about a program run and observed. `tests/present-
 * ordering.test.mjs` proves the CONSEQUENCE empirically wherever it can (his real config's flat
 * `queue` sections) and proves the STABILITY claim directly (an invented tie) where his config
 * currently has none to offer.
 *
 * ── WHY `moved` IS RECOMPUTED HERE RATHER THAN PASSED IN ──
 *
 * A rank number and a neighbour index are two different representations of the same underlying
 * fact, and a caller that trusted one without the other would be trusting that whoever wired them
 * together did so correctly. Recomputing both from `evaluateSection`'s own output, independently,
 * is what lets a test assert they AGREE rather than assume it.
 */
export function orderingPlacementFor(
  viewId: string,
  sectionId: string,
  source: string,
  lineIndex: number,
  afterText: string,
  ordering: Readonly<Record<string, Readonly<Record<string, SectionOrdering>>>>,
  orderingFields: Readonly<Record<string, OrderingFieldMarker>>,
): PlacementReading {
  const evaluation = evaluateSection(viewId, sectionId, source, lineIndex, afterText, ordering, orderingFields);
  if (evaluation.kind === "abstains") return { kind: "abstains", because: evaluation.because };

  const { keys, beforeTuple, afterTuple, siblings } = evaluation;
  const tuples = siblings.map((s) => s.tuple);
  const beforeRank = rankOf(beforeTuple, tuples, keys, orderingFields);
  const afterRank = rankOf(afterTuple, tuples, keys, orderingFields);
  const moved = beforeRank !== afterRank;

  // THE PRE-SORT LIST, REBUILT IN FILE ORDER WITH THE EDITED LINE BACK IN ITS OWN SLOT — see this
  // function's own header for why file order (not "siblings then the edited line") is what a
  // stable sort needs to agree with the engine's tie-break. `siblings` is already ascending by
  // `lineIndex` (the walk that built it never visits a line out of order), so finding where
  // `lineIndex` belongs is one linear scan, not a second sort.
  const entries: RankedSibling[] = [...siblings];
  const insertAt = entries.findIndex((entry) => entry.lineIndex > lineIndex);
  // READ BEFORE THE SPLICE — `currentBeforeLineIndex`'s own header. `entries[insertAt]` right now
  // is the sibling FILE ORDER already has immediately after `lineIndex`; the splice below is what
  // puts the edited/inserted line's own entry there instead.
  const currentBeforeLineIndex = insertAt === -1 ? null : (entries[insertAt]?.lineIndex ?? null);
  const selfEntry: RankedSibling = { lineIndex, tuple: afterTuple };
  if (insertAt === -1) {
    entries.push(selfEntry);
  } else {
    entries.splice(insertAt, 0, selfEntry);
  }

  const sorted = entries
    .slice()
    .sort((a, b) => compareTuples(a.tuple, b.tuple, keys, orderingFields));
  const at = sorted.findIndex((entry) => entry.lineIndex === lineIndex);
  const next = at === -1 ? undefined : sorted[at + 1];
  const beforeLineIndex = next === undefined ? null : next.lineIndex;

  return { kind: "answer", placement: { moved, beforeLineIndex, currentBeforeLineIndex } };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFAULT ORDERING — the engine's own fallback for the 171 (of 186) sections that declare
// NEITHER `ordering:` NOR `ordering_mode:`, made explicit rather than left to the browser's
// silence. `resolution.defaultOrdering`/`resolution.priorityRank` (resolutiontable.ts) are ENGINE
// FACTS — `section_builder.py`'s `_DEFAULT_ORDERING`/`_PRIORITY_RANK`, published unconditionally,
// never read out of any operator's YAML — see `scripts/compile-resolution.mjs`'s own header for
// the full account and `tests/resolution-default-ordering-agreement.test.mjs` for the live-import
// proof that this file's copy of the tuple has not drifted from the engine's.
//
// ── WHY THIS IS A SEPARATE COMPARATOR, NOT A THIRD BRANCH INSIDE `compareTuples` ──
//
// `compareTuples`/`tupleFor` (above) implement the DECLARED path's own rule: EVERY key must have a
// value, or the whole comparison abstains `no-value` — correct for `due_date`/`available_date`/
// `queue_position`, which the operator's own 15 declared sections treat as though every qualifying
// row carries one. The engine's default ordering is built on the OPPOSITE rule
// (`section_builder.py:400-423`, `_field_order_key`): a MISSING `due_date` or `priority` does not
// abstain the comparison — it sorts the row AFTER every row that HAS one (tier 1 vs tier 0), which
// is exactly how his inbox — no `due_date`, no `priority` on any item — still gets a real order
// (title, the final tiebreak). Reusing `compareTuples` for this would mean teaching one function
// two incompatible "what does a missing value mean" answers; a second, parallel comparator keeps
// each rule legible on its own.
//
// ── THE THIRD FIELD, TITLE, HAS NO MARKER AT ALL ──
//
// `due_date`/`priority` are read the same way the declared path already does (a marker glyph,
// looked up in `orderingFields`). `title` is different in kind: it is not a value a glyph spells,
// it is the printed line's OWN chrome-free text — `cleanTitleFor` (rendition.ts) computes it,
// proven to agree with the engine's `canonicalise_title_segment(_normalise_title(...))` step for
// step (see that function's own header), and it is ALWAYS available (barring `style-ambiguous`)
// for any non-blank content line, unlike `due_date`/`priority` which are absent on most rows.
//
// ── THE ABSTENTIONS THIS PATH ADDS, AND THE ONES IT REUSES ──
//
// `field-not-published` (reused): `due_date` or `priority` has no marker in THIS config at all —
// this app cannot tell "absent on this row" from "present but unreadable", so it refuses the whole
// comparison rather than guess every row is tier 1.
//
// `nested-section` (reused; **narrowed 2026-08-06, CONDITIONALLY** — `orderingqualify.ts`) — this
// used to be the one place the declared path's `parentLineOf` fix was never applied, because field
// presence was the only qualifying/context signal this file had, and `title` gives none: a bare
// context row and a bare qualifying row both read `{tier: 1, tier: 1}` on `due_date`/`priority`,
// indistinguishable, so grouping by parent alone would compare them by TITLE — a comparison
// `_order_children` (`section_builder.py:345`) never runs, since context sorts before qualifying
// UNCONDITIONALLY. `tests/present-ordering.test.mjs` §11d proves this and still passes unmodified:
// called with no `classifyQualifying`, this function is byte-identical to before.
//
// What changed is the "only signal" premise, not the argument. `qualifying_ids` IS a graph fact
// (`section_builder.py:237`), and `orderingqualify.ts`'s `qualifyingClassifierFor` reads it for an
// existing, stamped sibling the same way `resolvers/promotion.ts`'s `parentCandidateFor` already
// reads a structural parent — off the live `GraphSnapshot`, by its `[[qntm:N]]` stamp, never
// re-derived from characters. Supplied as `classifyQualifying`, `evaluateDefaultSection` applies
// `parentLineOf` for grouping and then keeps only siblings the classifier confidently calls
// qualifying, dropping context AND unknown alike — the same "cannot read, so cannot include" rule
// `tupleFor` already applies to an unreadable marker. Reaches only sections whose qualification was
// PUBLISHED — 41 of 159 real qualifications, 47 of 186 sections, measured 2026-08-01
// (`qualification.ts`'s own header; cross-checked against `backlog.yaml`'s
// `the-cascade-terminates-for-a-new-line` row, which independently confirms 118 of 159 are not).
// For every other section, no classifier is built, the parameter is `undefined`, and
// `nested-section` still fires — STILL ABSTAINS, honestly, not approximated past.
//
// `container-ordering-directive`, `style-ambiguous-title`, `has-declared-ordering`: unchanged, see
// `OrderingAbstention`'s own header above for each. `not-qualifying`: new, same header.

/** One field's comparison key for the DEFAULT ordering's tiered rule — `tier: 0` (present) always
 * sorts before `tier: 1` (absent), REGARDLESS of `direction`; `value` is compared only within one
 * tier. Mirrors `section_builder.py:400-423`'s own `(tier, value)` tuple exactly. */
interface DefaultFieldKey {
  readonly tier: 0 | 1;
  readonly value: string | number;
}

/**
 * Compare two strings by UNICODE CODE POINT — the same rule Python 3's `str.__lt__` uses (no
 * normalisation, no locale) — rather than JavaScript's native `<`, which compares UTF-16 CODE
 * UNITS and can disagree with true code-point order for a title containing an ASTRAL character
 * (a surrogate pair): `Array.from` iterates a string by code point, so building an array first and
 * comparing element-by-element is the correct comparison, not merely a stylistic one. This is what
 * lets `title`'s own tiebreak agree with the engine's `str < str` for EVERY title, not only the
 * ASCII/BMP-only ones his current inbox happens to show.
 */
function compareCodepoints(a: string, b: string): number {
  const ac = Array.from(a);
  const bc = Array.from(b);
  const len = Math.min(ac.length, bc.length);
  for (let i = 0; i < len; i += 1) {
    const ca = ac[i]?.codePointAt(0) ?? 0;
    const cb = bc[i]?.codePointAt(0) ?? 0;
    if (ca !== cb) return ca - cb;
  }
  return ac.length - bc.length;
}

/**
 * One field's key for one line — `undefined` fields (a marker glyph absent, an enum with no
 * matching token, a title on a genuinely blank line) return `{ tier: 1, ... }`, never abstain
 * individually; only a `style-ambiguous` title propagates as a refusal, to the whole comparison
 * (`evaluateDefaultSection`'s own call site), never silently to just this one field.
 */
function defaultFieldKeyFor(
  line: string,
  field: string,
  orderingFields: Readonly<Record<string, OrderingFieldMarker>>,
  priorityRank: Readonly<Record<string, number>>,
  title: CleanTitleReading,
): DefaultFieldKey | "style-ambiguous" {
  if (field === "title") {
    if (title.kind === "abstains") {
      // A genuinely blank line (no node at all) has nothing to rank — tier 1, the same "absent"
      // tier a missing due_date gets. A style-ambiguous title is a REFUSAL, not an absence — see
      // this module's header.
      return title.because === "style-ambiguous" ? "style-ambiguous" : { tier: 1, value: "" };
    }
    return { tier: 0, value: title.text };
  }

  const marker = orderingFields[field];
  if (marker === undefined) return { tier: 1, value: "" }; // the caller has already refused this generally

  if (marker.kind === "enum") {
    // `priority`'s shape: scan for ANY of the field's own tokens (🔽/⏫), never a single glyph.
    let found: string | undefined;
    for (const [token, spelled] of Object.entries(marker.values)) {
      if (!line.includes(token)) continue;
      // Two DIFFERENT tokens for the same field on one line is the shape `line_parser.py`'s own
      // `AmbiguousEditError` refuses to ingest at all — this preview cannot know what the engine
      // would resolve it to, so it treats the row as tier 1 (absent) rather than pick one.
      if (found !== undefined && found !== spelled) return { tier: 1, value: 0 };
      found = spelled;
    }
    if (found === undefined) return { tier: 1, value: 0 };
    const rank = priorityRank[found];
    return rank === undefined ? { tier: 1, value: 0 } : { tier: 0, value: rank };
  }

  const raw = markerValue(line, marker);
  if (raw === undefined) return { tier: 1, value: marker.kind === "date" ? "" : 0 };
  return marker.kind === "date" ? { tier: 0, value: raw } : { tier: 0, value: Number(raw) };
}

/** Every field's key for one line, in `defaultOrdering`'s own order — or `"style-ambiguous"` the
 * instant the title field (the one field every row actually has) cannot be read cleanly. */
function defaultTupleFor(
  line: string,
  defaultOrdering: readonly OrderingKey[],
  orderingFields: Readonly<Record<string, OrderingFieldMarker>>,
  priorityRank: Readonly<Record<string, number>>,
): readonly DefaultFieldKey[] | "style-ambiguous" {
  const title = cleanTitleFor(line);
  const tuple: DefaultFieldKey[] = [];
  for (const key of defaultOrdering) {
    const fieldKey = defaultFieldKeyFor(line, key.field, orderingFields, priorityRank, title);
    if (fieldKey === "style-ambiguous") return "style-ambiguous";
    tuple.push(fieldKey);
  }
  return tuple;
}

/** -1 if `a` sorts before `b` under `defaultOrdering`'s own tiered rule, +1 after, 0 tied on every
 * key — the DEFAULT-path twin of `compareTuples`, tier-aware rather than abstain-on-missing. */
function compareDefaultTuples(
  a: readonly DefaultFieldKey[],
  b: readonly DefaultFieldKey[],
  defaultOrdering: readonly OrderingKey[],
): number {
  for (let i = 0; i < defaultOrdering.length; i += 1) {
    const key = defaultOrdering[i];
    const av = a[i];
    const bv = b[i];
    if (key === undefined || av === undefined || bv === undefined) continue;
    if (av.tier !== bv.tier) return av.tier - bv.tier; // present ALWAYS before absent, direction-independent
    if (av.tier === 1) continue; // both absent on this key — tied here, try the next key
    let diff: number;
    if (key.field === "title") diff = compareCodepoints(String(av.value), String(bv.value));
    else if (typeof av.value === "number" && typeof bv.value === "number") diff = av.value - bv.value;
    else diff = String(av.value) < String(bv.value) ? -1 : String(av.value) > String(bv.value) ? 1 : 0;
    if (diff !== 0) return key.direction === "desc" ? -diff : diff;
  }
  return 0;
}

/** 1-based rank of `target` among itself and every tuple in `siblings` that sorts before it —
 * the DEFAULT-path twin of `rankOf`. */
function defaultRankOf(
  target: readonly DefaultFieldKey[],
  siblings: readonly (readonly DefaultFieldKey[])[],
  defaultOrdering: readonly OrderingKey[],
): number {
  let rank = 1;
  for (const sibling of siblings) {
    if (compareDefaultTuples(sibling, target, defaultOrdering) < 0) rank += 1;
  }
  return rank;
}

/** One OTHER line in the edited line's section, ranked for the DEFAULT ordering — the twin of
 * `RankedSibling`. */
interface RankedDefaultSibling {
  readonly lineIndex: number;
  readonly tuple: readonly DefaultFieldKey[];
}

type DefaultSectionEvaluation =
  | {
      readonly kind: "answer";
      readonly beforeTuple: readonly DefaultFieldKey[];
      readonly afterTuple: readonly DefaultFieldKey[];
      readonly siblings: readonly RankedDefaultSibling[];
    }
  | { readonly kind: "abstains"; readonly because: OrderingAbstention };

// `format_directive` (parse_order_directive.py) prints a container node's OWN ordering back onto
// its heading as literally this substring — see `OrderingAbstention`'s own header.
const CONTAINER_ORDER_DIRECTIVE = "#order:";

/**
 * `undefined` — no signal at all, `ordering.ts`'s original, unconditional behaviour. `true` — this
 * line is a genuine QUALIFYING member of the section (`section_builder.py`'s own `qualifying_ids`).
 * `false` — confidently CONTEXT (a row `_order_children` places by `_canonical_context_order`,
 * never by this section's own ordering key). See `orderingqualify.ts`'s `qualifyingClassifierFor`
 * for the one real implementation of this shape and why no version of it can be built from text.
 */
export type QualifyingClassifier = (lineIndex: number) => boolean | undefined;

function evaluateDefaultSection(
  viewId: string,
  sectionId: string,
  source: string,
  lineIndex: number,
  afterText: string,
  ordering: Readonly<Record<string, Readonly<Record<string, SectionOrdering>>>>,
  defaultOrdering: readonly OrderingKey[],
  orderingFields: Readonly<Record<string, OrderingFieldMarker>>,
  priorityRank: Readonly<Record<string, number>>,
  classifyQualifying?: QualifyingClassifier,
): DefaultSectionEvaluation {
  // Defence in depth — see `OrderingAbstention`'s own header for `has-declared-ordering`.
  if (ordering[viewId]?.[sectionId] !== undefined) {
    return { kind: "abstains", because: "has-declared-ordering" };
  }
  if (defaultOrdering.length === 0) {
    // The declaration itself carried no default ordering to compare by (a malformed or absent
    // publish — `resolutiontable.ts`'s own reader falls back to `[]`, never fabricates one).
    return { kind: "abstains", because: "field-not-published" };
  }
  for (const key of defaultOrdering) {
    if (key.field === "title") continue; // title is never marker-based — see this module's header
    if (orderingFields[key.field] === undefined) return { kind: "abstains", because: "field-not-published" };
  }

  const lines = source.split("\n");
  const { start, end, headingIndex } = sectionBounds(lines, lineIndex);

  if (headingIndex !== null && (lines[headingIndex] ?? "").includes(CONTAINER_ORDER_DIRECTIVE)) {
    return { kind: "abstains", because: "container-ordering-directive" };
  }

  const beforeText = lines[lineIndex] ?? "";
  const beforeTuple = defaultTupleFor(beforeText, defaultOrdering, orderingFields, priorityRank);
  const afterTuple = defaultTupleFor(afterText, defaultOrdering, orderingFields, priorityRank);

  const siblingsRaw: { lineIndex: number; tuple: readonly DefaultFieldKey[] | "style-ambiguous" }[] = [];

  if (classifyQualifying === undefined) {
    // THE ORIGINAL, UNCONDITIONAL PATH — byte-identical to before 2026-08-06. No classifier means
    // no way to tell context from qualifying, so the blanket nesting refusal stays, exactly as
    // `OrderingAbstention`'s header and this file's own counter-example (`tests/present-
    // ordering.test.mjs` §11d) require.
    if (anyLineIndented(lines, start, end)) {
      return { kind: "abstains", because: "nested-section" };
    }
    for (let at = start; at < end; at += 1) {
      if (at === lineIndex) continue;
      siblingsRaw.push({ lineIndex: at, tuple: defaultTupleFor(lines[at] ?? "", defaultOrdering, orderingFields, priorityRank) });
    }
  } else {
    // THE NARROWED PATH — a real qualifying/context signal is available (`orderingqualify.ts`).
    // The edited line ITSELF must not be a confidently-CONTEXT row: `_order_children` never gives a
    // context row a title-ordered rank at all, so there is nothing to place it against. `undefined`
    // (unknown — the ordinary shape of a freshly typed, not-yet-stamped capture, see
    // `orderingqualify.ts`'s own header) is NOT treated as context here; only a confident `false` is.
    if (classifyQualifying(lineIndex) === false) {
      return { kind: "abstains", because: "not-qualifying" };
    }
    // `parentLineOf` — SHARED with the declared path, not reimplemented — restricts comparison to
    // true tree siblings, exactly as `evaluateSection` already does above. See that function's own
    // header for the citation this rests on.
    const parentOf = parentLineOf(lines, start, end);
    const group = parentOf.get(lineIndex) ?? null;
    // TRACKED SEPARATELY FROM `siblingsRaw.length === 0` — see `unclassifiable-siblings`'s own
    // header on `OrderingAbstention`. A candidate this classifier confidently calls CONTEXT (`false`)
    // and a candidate it genuinely CANNOT read (`undefined`) both stay excluded from the ranked set
    // (PR #131's own protection, unchanged) — but only the second kind means this function does not
    // actually know whether the ranked set below is complete.
    let anyCandidateUnknown = false;
    for (let at = start; at < end; at += 1) {
      if (at === lineIndex) continue;
      if (!parentOf.has(at)) continue; // blank line — not a member of any group
      if (parentOf.get(at) !== group) continue; // a different parent — not a true sibling
      const verdict = classifyQualifying(at);
      // STRICT `=== true`: a sibling this classifier calls CONTEXT (`false`) is excluded because
      // the engine never ranks it here; a sibling it cannot decide (`undefined` — no stamp, or
      // stamped but not in a possibly-stale graph) is ALSO excluded, the same "cannot read, so
      // cannot include" rule `tupleFor`'s marker check already applies on the declared path. Both
      // are silent drops, not refusals of the whole section — see `orderingqualify.ts`'s header.
      if (verdict === undefined) {
        anyCandidateUnknown = true;
        continue;
      }
      if (verdict !== true) continue;
      siblingsRaw.push({ lineIndex: at, tuple: defaultTupleFor(lines[at] ?? "", defaultOrdering, orderingFields, priorityRank) });
    }
    // THE GUARD `unclassifiable-siblings` EXISTS FOR — see `OrderingAbstention`'s own header for
    // the full argument. Deliberately narrow: only when the ranked set came back EMPTY *and* at
    // least one same-group candidate existed but could not be read. A group with SOME known
    // qualifying siblings and one stray unknown still answers (the pre-existing, accepted "cannot
    // read, so cannot include" behaviour, §12e's own original shape) — only the case
    // indistinguishable from "no real information at all" escalates to an abstention.
    if (siblingsRaw.length === 0 && anyCandidateUnknown) {
      return { kind: "abstains", because: "unclassifiable-siblings" };
    }
  }

  // A SINGLE ambiguous title anywhere in the RANKED set refuses the WHOLE comparison, not just that
  // one row — excluding the row silently would risk placing the edited line beside a neighbour
  // whose true rank this app could not actually establish. See `OrderingAbstention`'s own header.
  // (A context row's own ambiguous title, when a classifier is in play, was already dropped above —
  // it is never in `siblingsRaw` to begin with, and correctly does not block this comparison: the
  // engine never reads that row's title either.)
  if (
    beforeTuple === "style-ambiguous" ||
    afterTuple === "style-ambiguous" ||
    siblingsRaw.some((sibling) => sibling.tuple === "style-ambiguous")
  ) {
    return { kind: "abstains", because: "style-ambiguous-title" };
  }

  return {
    kind: "answer",
    beforeTuple,
    afterTuple,
    siblings: siblingsRaw as RankedDefaultSibling[],
  };
}

/**
 * The DEFAULT-path twin of `orderingFor` — same question ("did this edit change the edited line's
 * rank"), same shape of answer, a different rule underneath (see this module's header) for the 171
 * sections `orderingFor` itself always abstains `no-section-declaration` for.
 */
export function defaultOrderingFor(
  viewId: string,
  sectionId: string,
  source: string,
  lineIndex: number,
  afterText: string,
  ordering: Readonly<Record<string, Readonly<Record<string, SectionOrdering>>>>,
  defaultOrdering: readonly OrderingKey[],
  orderingFields: Readonly<Record<string, OrderingFieldMarker>>,
  priorityRank: Readonly<Record<string, number>>,
  classifyQualifying?: QualifyingClassifier,
): OrderingReading {
  const evaluation = evaluateDefaultSection(
    viewId,
    sectionId,
    source,
    lineIndex,
    afterText,
    ordering,
    defaultOrdering,
    orderingFields,
    priorityRank,
    classifyQualifying,
  );
  if (evaluation.kind === "abstains") return abstains(evaluation.because);

  const tuples = evaluation.siblings.map((sibling) => sibling.tuple);
  const beforeRank = defaultRankOf(evaluation.beforeTuple, tuples, defaultOrdering);
  const afterRank = defaultRankOf(evaluation.afterTuple, tuples, defaultOrdering);
  return {
    kind: "answer",
    answer: {
      moved: beforeRank !== afterRank,
      beforeRank,
      afterRank,
      siblingCount: tuples.length,
    },
  };
}

/**
 * The DEFAULT-path twin of `orderingPlacementFor` — same STABLE-SORT proof structure
 * (`orderingPlacementFor`'s own header states the full argument: rebuild the pre-sort list in FILE
 * ORDER with the edited line spliced back into its own slot, sort it with the one comparator this
 * whole module uses, read off the row immediately after). `compareDefaultTuples` is the ONLY
 * difference from `orderingPlacementFor` — a stable sort under a DIFFERENT, but equally
 * deterministic, comparator produces the identical structural guarantee.
 *
 * The same caveat `orderingFor`'s header names for the declared path's own flat sections applies
 * here with one more link in the chain, named rather than hidden: this proof needs the PRE-SORT
 * list (this function's own siblings walk) to be the SAME list `_order_children`'s flat branch
 * would sort. For the three declared `queue` sections that is MEASURED (`tests/present-
 * ordering.test.mjs` §1, against real content). For an arbitrary UNDECLARED section, it is the
 * SAME assumption `nested-section`'s own indentation check already rests on, extended to a wider
 * set of sections than that check has ever been exercised against — see this branch's own report
 * for what stays UNCONFIRMED rather than proven here.
 */
export function defaultOrderingPlacementFor(
  viewId: string,
  sectionId: string,
  source: string,
  lineIndex: number,
  afterText: string,
  ordering: Readonly<Record<string, Readonly<Record<string, SectionOrdering>>>>,
  defaultOrdering: readonly OrderingKey[],
  orderingFields: Readonly<Record<string, OrderingFieldMarker>>,
  priorityRank: Readonly<Record<string, number>>,
  classifyQualifying?: QualifyingClassifier,
): PlacementReading {
  const evaluation = evaluateDefaultSection(
    viewId,
    sectionId,
    source,
    lineIndex,
    afterText,
    ordering,
    defaultOrdering,
    orderingFields,
    priorityRank,
    classifyQualifying,
  );
  if (evaluation.kind === "abstains") return { kind: "abstains", because: evaluation.because };

  const { beforeTuple, afterTuple, siblings } = evaluation;
  const tuples = siblings.map((sibling) => sibling.tuple);
  const beforeRank = defaultRankOf(beforeTuple, tuples, defaultOrdering);
  const afterRank = defaultRankOf(afterTuple, tuples, defaultOrdering);
  const moved = beforeRank !== afterRank;

  const entries: RankedDefaultSibling[] = [...siblings];
  const insertAt = entries.findIndex((entry) => entry.lineIndex > lineIndex);
  // READ BEFORE THE SPLICE — see `currentBeforeLineIndex`'s own header on `OrderingPlacement`, and
  // `orderingPlacementFor`'s twin of this same line above.
  const currentBeforeLineIndex = insertAt === -1 ? null : (entries[insertAt]?.lineIndex ?? null);
  const selfEntry: RankedDefaultSibling = { lineIndex, tuple: afterTuple };
  if (insertAt === -1) {
    entries.push(selfEntry);
  } else {
    entries.splice(insertAt, 0, selfEntry);
  }

  const sorted = entries.slice().sort((a, b) => compareDefaultTuples(a.tuple, b.tuple, defaultOrdering));
  const at = sorted.findIndex((entry) => entry.lineIndex === lineIndex);
  const next = at === -1 ? undefined : sorted[at + 1];
  const beforeLineIndex = next === undefined ? null : next.lineIndex;

  return { kind: "answer", placement: { moved, beforeLineIndex, currentBeforeLineIndex } };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE DISPATCHER — "make the browser resolve it like every other resolver", the operator's own
// words for this step. ONE function each call site (`app/index.html`'s `orderingNoteFor`/
// `orderingDiagnosticFor`/`armOrderingSettle`) now calls, for EVERY section, declared or not —
// never a branch repeated at each call site. Routing is the ONE fact `ordering[view][section] !==
// undefined` already states (readOrdering's own definition of "declared": a section publishes an
// entry here iff its view sheet names an `ordering:` or an `ordering_mode:`), so the dispatcher
// adds no new abstention of its own — it either hands off to `orderingFor`/`orderingPlacementFor`
// UNCHANGED (every existing test for those two keeps its exact, pinned behaviour) or to
// `defaultOrderingFor`/`defaultOrderingPlacementFor` above.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Resolve WHETHER an edit moves its line, for ANY section — declared or the engine default.
 *
 * `classifyQualifying` is OPTIONAL and reaches only the default path — `orderingFor` never takes
 * one, because the declared path already has its own qualifying/context signal (the ordering
 * marker itself, `parentLineOf`'s own header). A caller with a live graph
 * (`app/present/orderingqualify.ts`'s `qualifyingClassifierFor`) may narrow the default path's
 * `nested-section` refusal; a caller with none gets the ORIGINAL, unconditional behaviour, because
 * every parameter after `priorityRank` is new and optional.
 */
export function resolveOrderingFor(
  viewId: string,
  sectionId: string,
  source: string,
  lineIndex: number,
  afterText: string,
  ordering: Readonly<Record<string, Readonly<Record<string, SectionOrdering>>>>,
  orderingFields: Readonly<Record<string, OrderingFieldMarker>>,
  defaultOrdering: readonly OrderingKey[],
  priorityRank: Readonly<Record<string, number>>,
  classifyQualifying?: QualifyingClassifier,
): OrderingReading {
  if (ordering[viewId]?.[sectionId] !== undefined) {
    return orderingFor(viewId, sectionId, source, lineIndex, afterText, ordering, orderingFields);
  }
  return defaultOrderingFor(
    viewId,
    sectionId,
    source,
    lineIndex,
    afterText,
    ordering,
    defaultOrdering,
    orderingFields,
    priorityRank,
    classifyQualifying,
  );
}

/** Resolve WHERE an edit's line belongs, for ANY section — declared or the engine default. The
 * placement-half twin of `resolveOrderingFor`, sharing the exact same routing rule and the exact
 * same optional `classifyQualifying` (see that function's own header). */
export function resolveOrderingPlacementFor(
  viewId: string,
  sectionId: string,
  source: string,
  lineIndex: number,
  afterText: string,
  ordering: Readonly<Record<string, Readonly<Record<string, SectionOrdering>>>>,
  orderingFields: Readonly<Record<string, OrderingFieldMarker>>,
  defaultOrdering: readonly OrderingKey[],
  priorityRank: Readonly<Record<string, number>>,
  classifyQualifying?: QualifyingClassifier,
): PlacementReading {
  if (ordering[viewId]?.[sectionId] !== undefined) {
    return orderingPlacementFor(viewId, sectionId, source, lineIndex, afterText, ordering, orderingFields);
  }
  return defaultOrderingPlacementFor(
    viewId,
    sectionId,
    source,
    lineIndex,
    afterText,
    ordering,
    defaultOrdering,
    orderingFields,
    priorityRank,
    classifyQualifying,
  );
}

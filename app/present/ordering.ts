/**
 * ordering — after this edit, will this line sort to a different position within its section?
 * PURE: no DOM, no fetch, no clock, no graph. design-the-resolution-architecture.md step 7, L5
 * EVALUATION.
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
 *    **So this module refuses outright — abstention `nested-section` — the instant ANY line in the
 *    section's printed range carries indentation.** A section rendered with zero indentation
 *    (`renderer.py:950`'s `'    ' * depth` prefix is empty at every printed row) has no ancestor
 *    context and no tree levels to cross, which is exactly the shape the three flat `queue`
 *    sections have and the `this-week` sections do not — proven, not assumed, by
 *    `tests/present-ordering.test.mjs` §1 reading both shapes from the real vault.
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
 *   NESTED-SECTION. Any line in the section's printed range carries indentation — see measurement
 *   2 above. Applies to all four `this-week` sections today (they print `#outcome` ancestors); the
 *   three `queue` sections are flat and never trigger it.
 *
 *   NO-VALUE. The edited line's BEFORE or AFTER text does not carry an extractable value for every
 *   key the section orders by. Symmetric with `membership.ts`'s "either side abstaining is
 *   silence": there is nothing to compare a missing value against.
 *
 * ── WHAT THIS MODULE NEVER DOES ──
 *
 * It produces no `Contribution` and no `SourceEdit`. It moves nothing — `paint.ts`'s row-building
 * code is never reached from here, by construction: this module returns a RANK COMPARISON, not an
 * index into `viewBody`, and its only caller (`app/index.html`'s `orderingNoteFor`) writes the
 * answer into the freshness line, the same structurally-distant register step 4 established for
 * `membershipNoteFor` — see that function's own header for why "say it" and "move it" are kept in
 * different functions rather than merely different lines of one.
 */

import { classifyLine } from "./resolution.js";
import type { OrderingFieldMarker, OrderingKey, SectionOrdering } from "./resolutiontable.js";

/** Why nothing is said. Each value names a refusal in this module's header. */
export type OrderingAbstention =
  | "no-section-declaration"
  | "insertion-order"
  | "field-not-published"
  | "nested-section"
  | "no-value";

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
function sectionBounds(lines: readonly string[], lineIndex: number): { start: number; end: number } {
  let start = 0;
  for (let at = lineIndex; at >= 0; at -= 1) {
    if (classifyLine(lines[at] ?? "").kind === "heading") {
      start = at + 1;
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
  return { start, end };
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

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const INT_SHAPE = /^-?\d+$/;
const FLOAT_SHAPE = /^-?\d+(?:\.\d+)?$/;

function shapeMatches(marker: OrderingFieldMarker, token: string): boolean {
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
export function markerValue(line: string, marker: OrderingFieldMarker): string | undefined {
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
  const declared = ordering[viewId]?.[sectionId];
  if (declared === undefined) return abstains("no-section-declaration");
  const keys = declared.ordering;
  if (keys === undefined || keys.length === 0) return abstains("insertion-order");
  for (const key of keys) {
    if (orderingFields[key.field] === undefined) return abstains("field-not-published");
  }

  const lines = source.split("\n");
  const { start, end } = sectionBounds(lines, lineIndex);
  // MUST run before any value is trusted — see this module's header, measurement 2: a section with
  // ANY indented row nests ancestor/context lines the engine sorts by a DIFFERENT rule (context
  // rows first, ordering applied only within same-parent siblings), which a flat rank across the
  // whole section would get wrong. Checked over the section's FULL range, not just the two lines
  // being compared, because an indented line elsewhere in the section is still evidence the section
  // is a tree, not a list.
  if (anyLineIndented(lines, start, end)) return abstains("nested-section");

  const beforeText = lines[lineIndex] ?? "";
  const beforeTuple = tupleFor(beforeText, keys, orderingFields);
  const afterTuple = tupleFor(afterText, keys, orderingFields);
  if (beforeTuple === undefined || afterTuple === undefined) return abstains("no-value");

  const siblings: (readonly string[])[] = [];
  for (let at = start; at < end; at += 1) {
    if (at === lineIndex) continue;
    const tuple = tupleFor(lines[at] ?? "", keys, orderingFields);
    if (tuple !== undefined) siblings.push(tuple);
  }

  const beforeRank = rankOf(beforeTuple, siblings, keys, orderingFields);
  const afterRank = rankOf(afterTuple, siblings, keys, orderingFields);
  return {
    kind: "answer",
    answer: {
      moved: beforeRank !== afterRank,
      beforeRank,
      afterRank,
      siblingCount: siblings.length,
    },
  };
}

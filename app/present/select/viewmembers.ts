/**
 * viewmembers — WHAT IS IN A VIEW, computed from the graph and the compiled language, in the
 * browser. PURE: no DOM, no fetch, no clock, no storage. The graph is a PARAMETER and `today` is a
 * PARAMETER, the same discipline `graphmatch.ts` and `rules.ts` already take.
 *
 * ── WHAT THIS CLOSES ──
 *
 * `app/index.html:2042` finds a view by path and reads its `markdown` — the engine rendered it, the
 * browser displays it. Nothing client-side computes what a view CONTAINS, so an edit's effect is
 * visible only in the one view on screen, and only after the engine has run. This module is the
 * missing half: given the compiled language and a graph, it answers which nodes are in each of a
 * view's sections and in what order.
 *
 * ── IT DECIDES NOTHING ITSELF ──
 *
 * Every fact it uses is READ from the compiled config. Membership comes from
 * `language.predicates[section.qualification]`; the section list and their order come from
 * `language.sectionOrder[viewId]`; the sort keys come from `ordering[viewId][sectionId]` or
 * `defaultOrdering`. There is no membership rule, no ordering, and no section order authored in
 * TypeScript here — this file is a reader and a loop.
 *
 * ── WHY IT SHARES THE COMPARATORS RATHER THAN GROWING ITS OWN ──
 *
 * `arrange/ordering.ts` already implements both ordering rules the engine has, and both were
 * measured against the operator's real config: `compareTuples` (the DECLARED path — every key must
 * have a value or the comparison abstains) and `compareDefaultTuples` (the DEFAULT path — a missing
 * value sorts the row AFTER every row that has one, mirroring `section_builder.py:400-423`'s
 * `_field_order_key`, with `title` compared by unicode CODE POINT so it agrees with Python's
 * `str.__lt__`). Both take TUPLES, not lines, so this module reuses them exactly as they are and
 * writes only the other half: building those tuples from a NODE'S FIELDS instead of from a rendered
 * line's marker glyphs.
 *
 * That split is the whole point. A node's `due_date` is a field; a rendered row's `due_date` is a
 * 📅 followed by text. Reading them is genuinely different work. Deciding which of two rows sorts
 * first is not, and a second comparator here would be two homes for one decision — the shape that
 * had `renderer.ts` and `ViewRegistration` both resolving heading nodes in the sibling repo until
 * today.
 *
 * ── WHAT IT REFUSES, BY NAME, RATHER THAN GUESSING ──
 *
 * Every abstention below is a fact this app cannot resolve, never an approximation. A section whose
 * qualifier needs the clock without a `today`; a graph-dependent qualifier with no graph in reach; a
 * declared ordering key a node has no value for. Each is reported as a named reason on the section,
 * so a caller can show "this section could not be computed" rather than an empty one, which would
 * read identically to "nothing qualifies".
 */

import type { TodayAnswer } from "../today.js";
import type { FieldValue, QualificationLanguage, Qualifier } from "./qualification.js";
import { qualifierNeedsClock, qualifierNeedsGraph } from "./qualification.js";
import { matchesQualifier } from "./membership.js";
import type { EdgeSourceOf, GraphNode, GraphSnapshot } from "../graphmatch.js";
import { candidateFieldsOf, matchesQualifierGraphAware } from "../graphmatch.js";
import type { DefaultFieldKey } from "../arrange/ordering.js";
import { compareDefaultTuples, compareTuples } from "../arrange/ordering.js";
import type {
  OrderingFieldMarker,
  OrderingKey,
  SectionOrdering,
} from "../resolutiontable.js";

/** Everything the ordering half reads, exactly as `resolution` publishes it. Passed as one object
 * so a caller cannot supply three of the four and silently get the engine's fallback for the rest. */
export interface OrderingLanguage {
  readonly ordering: Readonly<Record<string, Readonly<Record<string, SectionOrdering>>>>;
  readonly orderingFields: Readonly<Record<string, OrderingFieldMarker>>;
  readonly defaultOrdering: readonly OrderingKey[];
  readonly priorityRank: Readonly<Record<string, number>>;
}

export type SectionAbstention =
  /** The section's `qualification` names no published predicate. */
  | "no-predicate"
  /** The qualifier compares against the day boundary and no `today` was supplied. */
  | "needs-clock"
  /** The qualifier traverses an edge and no graph was supplied. */
  | "needs-graph"
  /** A DECLARED ordering key names a field with no marker in this config at all. */
  | "ordering-field-not-published";

/** One section of a view, computed. `members` is ordered when `ordered` is true; when it is false
 * the members are real but their ORDER is not — see `orderAbstention`. */
export interface ViewSection {
  readonly sectionId: string;
  readonly name: string;
  readonly qualification: string;
  readonly members: readonly GraphNode[];
  readonly ordered: boolean;
  readonly orderAbstention?: SectionAbstention;
  /** Nodes the graph could not answer for — `matchesQualifierGraphAware` returned `undefined`.
   * Never folded into `members` and never silently dropped: an unanswerable node is not a
   * non-member. */
  readonly undecided: readonly GraphNode[];
}

/** A section this app could not compute AT ALL — membership itself was unresolvable, so there is no
 * member list to show, empty or otherwise. */
export interface UncomputedSection {
  readonly sectionId: string;
  readonly name: string;
  readonly qualification: string;
  readonly because: SectionAbstention;
}

export interface ViewComputation {
  readonly viewId: string;
  readonly sections: readonly ViewSection[];
  readonly uncomputed: readonly UncomputedSection[];
}

/** `{node_type, ...fields}` for a node, via `graphmatch.ts`'s own reshaping — never a second one. */
function fieldsOf(node: GraphNode): Readonly<Record<string, FieldValue>> {
  return candidateFieldsOf(node);
}

/**
 * One field's DEFAULT-path key for a NODE — the field-reading twin of `ordering.ts`'s
 * `defaultFieldKeyFor`, which reads the same key off a rendered line.
 *
 * The tier rule is the engine's and is not reinterpreted here: a value the node HAS is tier 0, a
 * value it does not is tier 1, and `compareDefaultTuples` sorts every tier 0 before every tier 1
 * regardless of direction. `priority` resolves through `priorityRank` exactly as the line path does;
 * the difference is only that a node carries the spelled value in a field, where a line carries a
 * glyph that has to be found in its text.
 */
function defaultKeyForField(
  fields: Readonly<Record<string, FieldValue>>,
  field: string,
  ordering: OrderingLanguage,
): DefaultFieldKey {
  const raw = fields[field];

  if (field === "title") {
    // ALWAYS AVAILABLE on a node, unlike on a line, where the title has to be recovered from the
    // printed characters and can come back `style-ambiguous`. A node's title is a field the engine
    // already canonicalised, so this path has no ambiguous case to refuse.
    return typeof raw === "string" && raw.length > 0
      ? { tier: 0, value: raw }
      : { tier: 1, value: "" };
  }

  const marker = ordering.orderingFields[field];
  if (marker === undefined) return { tier: 1, value: "" };

  if (marker.kind === "enum") {
    if (typeof raw !== "string") return { tier: 1, value: 0 };
    const rank = ordering.priorityRank[raw];
    return rank === undefined ? { tier: 1, value: 0 } : { tier: 0, value: rank };
  }

  if (raw === undefined || raw === null || raw === "") {
    return { tier: 1, value: marker.kind === "date" ? "" : 0 };
  }
  return marker.kind === "date"
    ? { tier: 0, value: String(raw) }
    : { tier: 0, value: Number(raw) };
}

/**
 * A node's DECLARED-path tuple, or `undefined` when the node has no value for one of the keys.
 *
 * `undefined` here means the same thing it means in `ordering.ts`'s `tupleFor`: under a DECLARED
 * ordering every key must have a value or the comparison abstains. This module keeps that rule
 * rather than tiering the missing value, because the two rules genuinely differ and the declared one
 * is what the operator's own declared sections are written against.
 */
function declaredTupleFor(
  fields: Readonly<Record<string, FieldValue>>,
  keys: readonly OrderingKey[],
  ordering: OrderingLanguage,
): readonly string[] | undefined {
  const values: string[] = [];
  for (const key of keys) {
    const marker = ordering.orderingFields[key.field];
    if (marker === undefined) return undefined;
    if (marker.kind === "enum") return undefined; // `compareTuples` never learned priorityRank
    const raw = fields[key.field];
    if (raw === undefined || raw === null || raw === "") return undefined;
    values.push(String(raw));
  }
  return values;
}

/** Does `node` qualify — `undefined` when the question needs a graph this call was not given, or a
 * graph that cannot answer the step. Never a guessed `false`. */
function qualifies(
  node: GraphNode,
  qualifier: Qualifier,
  graph: GraphSnapshot | undefined,
  edgeSourceOf: EdgeSourceOf | undefined,
  today: TodayAnswer | undefined,
): boolean | undefined {
  const fields = fieldsOf(node);
  if (!qualifierNeedsGraph(qualifier)) return matchesQualifier(fields, qualifier, today);
  if (graph === undefined || edgeSourceOf === undefined) return undefined;
  return matchesQualifierGraphAware(fields, node.id, qualifier, graph, edgeSourceOf, undefined, today);
}

/**
 * Compute one view: which nodes are in each of its sections, in the order the config declares.
 *
 * `graph` is optional ON PURPOSE. Most sections qualify on a node's own fields and need no
 * traversal; supplying no graph computes those and reports the graph-dependent ones as
 * `needs-graph` rather than refusing the whole view. Returns `undefined` only when the view itself
 * is not declared — a caller asking for a view this config does not have is a different error from
 * a view whose sections could not be computed.
 */
export function computeViewMembers(
  viewId: string,
  nodes: readonly GraphNode[],
  language: QualificationLanguage,
  ordering: OrderingLanguage,
  options?: {
    readonly graph?: GraphSnapshot;
    readonly edgeSourceOf?: EdgeSourceOf;
    readonly today?: TodayAnswer;
  },
): ViewComputation | undefined {
  const sectionIds = language.sectionOrder[viewId];
  const declared = language.sections[viewId];
  if (sectionIds === undefined || declared === undefined) return undefined;

  const graph = options?.graph;
  const edgeSourceOf = options?.edgeSourceOf;
  const today = options?.today;

  const sections: ViewSection[] = [];
  const uncomputed: UncomputedSection[] = [];

  for (const sectionId of sectionIds) {
    const section = declared[sectionId];
    if (section === undefined) continue; // dropped from `sections` but not `sectionOrder` — nothing to compute
    const name = section.name ?? sectionId;
    const qualifier = language.predicates[section.qualification];

    if (qualifier === undefined) {
      uncomputed.push({ sectionId, name, qualification: section.qualification, because: "no-predicate" });
      continue;
    }
    if (qualifierNeedsClock(qualifier) && today === undefined) {
      uncomputed.push({ sectionId, name, qualification: section.qualification, because: "needs-clock" });
      continue;
    }
    if (qualifierNeedsGraph(qualifier) && (graph === undefined || edgeSourceOf === undefined)) {
      uncomputed.push({ sectionId, name, qualification: section.qualification, because: "needs-graph" });
      continue;
    }

    const members: GraphNode[] = [];
    const undecided: GraphNode[] = [];
    for (const node of nodes) {
      const answer = qualifies(node, qualifier, graph, edgeSourceOf, today);
      if (answer === true) members.push(node);
      else if (answer === undefined) undecided.push(node);
    }

    const declaredOrdering = ordering.ordering[viewId]?.[sectionId];
    const placed = orderMembers(members, declaredOrdering, ordering);
    sections.push({
      sectionId,
      name,
      qualification: section.qualification,
      members: placed.members,
      ordered: placed.ordered,
      ...(placed.because === undefined ? {} : { orderAbstention: placed.because }),
      undecided,
    });
  }

  return { viewId, sections, uncomputed };
}

/**
 * Sort a section's members — DECLARED ordering when the section has one, the engine default
 * otherwise. The routing rule is `resolveOrderingFor`'s own (`ordering[viewId]?.[sectionId] !==
 * undefined`), stated once there and mirrored here rather than invented.
 *
 * A DECLARED ordering whose keys a node cannot answer does not fall through to the default — it
 * abstains. Falling through would quietly show the operator a section ordered by a rule he did not
 * declare, which is worse than showing him one that says it could not be ordered.
 */
function orderMembers(
  members: readonly GraphNode[],
  declaredOrdering: SectionOrdering | undefined,
  ordering: OrderingLanguage,
): { members: readonly GraphNode[]; ordered: boolean; because?: SectionAbstention } {
  if (declaredOrdering !== undefined) {
    const keys = declaredOrdering.ordering;
    // `insertion_order` and any other non-key ordering mode: the config declares that this section
    // is NOT sorted by field, so member order is the graph's own and this app does not invent one.
    if (keys === undefined || keys.length === 0) return { members, ordered: false };

    const tuples = new Map<string, readonly string[]>();
    for (const node of members) {
      const tuple = declaredTupleFor(fieldsOf(node), keys, ordering);
      if (tuple === undefined) {
        return { members, ordered: false, because: "ordering-field-not-published" };
      }
      tuples.set(node.id, tuple);
    }
    const sorted = [...members].sort((a, b) =>
      compareTuples(tuples.get(a.id) ?? [], tuples.get(b.id) ?? [], keys, ordering.orderingFields),
    );
    return { members: sorted, ordered: true };
  }

  const keys = ordering.defaultOrdering;
  if (keys.length === 0) return { members, ordered: false };
  const tuples = new Map<string, readonly DefaultFieldKey[]>();
  for (const node of members) {
    const fields = fieldsOf(node);
    tuples.set(node.id, keys.map((key) => defaultKeyForField(fields, key.field, ordering)));
  }
  const sorted = [...members].sort((a, b) =>
    compareDefaultTuples(tuples.get(a.id) ?? [], tuples.get(b.id) ?? [], keys),
  );
  return { members: sorted, ordered: true };
}

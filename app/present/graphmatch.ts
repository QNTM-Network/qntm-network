/**
 * graphmatch — the ONE-HOP GRAPH TRAVERSAL `membership.ts`'s own header names as "a later leg's
 * work" and `rules.ts`'s `applyRules` abstains on by name (`qualifierNeedsGraph`). PURE: no DOM, no
 * fetch, no clock, no storage — the graph is a PARAMETER, resolved by the caller
 * (`app/index.html`), exactly the same discipline `applyRules`'s own `today` parameter already
 * takes for the day boundary. This module never calls `fetch` and never reads `graphData` itself.
 *
 * ── THE GAP THIS CLOSES ──
 *
 * `presentation.json`'s `rules` key publishes two rules whose `for_each` pattern carries a one-hop
 * `children:` edge-existence test — `task-with-open-part-of-child-becomes-outcome` and
 * `task-with-open-waiting-for-child-becomes-outcome` — plus the pair that already existed alongside
 * them, `task-with-routine-child-becomes-habit` and `outcome-with-routine-child-becomes-habit`.
 * `rules.ts`'s `applyRules` cannot evaluate any of them: `qualifierNeedsGraph` is `true` for their
 * pattern, so the pass marks them `undecidable` and moves on (see that function's own header for
 * why that is the right behaviour for what it is — a candidate's OWN fields, with no graph in
 * reach). This module is what a caller reaches for INSTEAD, once it actually has a graph to hand.
 *
 * ── WHY THIS IS A SEPARATE MODULE, NOT A WIDER `matchesQualifier` ──
 *
 * `membership.ts`'s `matchesQualifier` THROWS when handed a graph-dependent qualifier, on purpose —
 * its own header states the reason: two real callers already check `qualifierNeedsGraph` FIRST and
 * abstain, and teaching that one function to sometimes need a graph and sometimes not would weaken
 * the guarantee every existing caller relies on ("this function never needs more than the fields
 * you handed it"). `matchesQualifierGraphAware`, below, is a DIFFERENT function with a DIFFERENT
 * contract — it takes a graph, and it can genuinely say "I don't know" (`undefined`, never a
 * fabricated `false`) when the graph cannot answer a step. `matchesQualifier` itself is untouched by
 * this file: it is not imported, not called, not widened. The purity tests that pin it, and every
 * existing caller's assumption that it is fields-only, hold exactly as they did before this file
 * existed.
 *
 * ── THE CANDIDATE IS NEVER THE COMMITTED LINE ──
 *
 * Every OTHER function in this bundle that evaluates a rule (`applyRules`) does so against the line
 * the operator just typed. This module's whole reason to exist is the opposite case: the operator
 * indents a task beneath another task, and the rule that fires is about the PARENT — a node that
 * may already have a real id in the graph, or may itself be a fresh, not-yet-minted capture sitting
 * a few lines above the one just committed. `app/index.html`'s own orchestration (`parentPromotionFor`)
 * is what resolves WHICH node is the candidate and what its own fields are; this module only ever
 * answers the question once handed a candidate, a graph, and the one edit still missing from that
 * graph — see `ProspectiveChild`, below.
 *
 * ── THE PROSPECTIVE CHILD HAS NO ID, AND THIS MODULE NEVER INVENTS ONE ──
 *
 * The line the operator just indented is not in `graph` — the engine mints ids, this app never
 * does — so "does the candidate have a qualifying child" cannot be answered from `graph` alone at
 * the instant of commit. `ProspectiveChild` is the other half: a plain description (which edge type
 * it would create to its parent, and its own resolved fields) that this module folds into the SAME
 * existence test a graph-only child would need to pass, WITHOUT ever synthesising a `GraphNode` with
 * a fabricated `id` — `edgeStepIsSatisfied` (below) tests its `fields` directly, alongside whatever
 * real neighbours `graph.edges` already names, and never writes it into any node lookup table.
 *
 * ── WHAT "UNDECIDABLE" MEANS HERE, AND WHY IT IS NEVER GUESSED PAST ──
 *
 * `EdgeSourceOf` is the one fact this module cannot derive from `graph` or from `RulesLanguage`
 * itself: which raw `source`/`target` key of a wire edge is the "child" end, for a given edge type.
 * `PART_OF` and `WAITING_FOR` do not agree — an indented line is a `PART_OF` edge's OWN source (the
 * child names its parent), while a `#waiting-for`-tagged line is a `WAITING_FOR` edge's TARGET (the
 * parent names the child it is waiting on) — see `app/index.html`'s own `edgeSourceOf` for where
 * this fact comes from and the one honestly-stated limitation in how far it currently reaches. This
 * module NEVER assumes a convention for an edge type `edgeSourceOf` does not name: `neighboursOf`
 * returns `undefined` rather than guess a direction, and that `undefined` propagates all the way out
 * to `applyGraphAwareRules`'s own `undecidable` list — the same "refuse rather than fabricate"
 * posture `qualifierNeedsGraph` itself already takes one layer up.
 *
 * ── ONE PASS, IN THE SAME PUBLISHED ORDER — `applyRules`'s OWN MODEL, REUSED ──
 *
 * `applyGraphAwareRules` walks `language.order` exactly once, left to right, exactly as `applyRules`
 * does — including the `habit-wins-over-outcome` exclusion, which is not special-cased here at all:
 * it falls out of `tasks-with-open-part-of-child`'s OWN second edge step (`mustExist: false` on a
 * `routine` neighbour) refusing to match while a routine child is present, so the outcome rule never
 * fires and the LATER `task-with-routine-child-becomes-habit` rule (still finding `node_type: task`,
 * because the earlier rule never retyped it) fires instead. This module adds no rule-specific logic
 * to produce that outcome; it is the SAME one-pass, same-order walk `applyRules` already runs,
 * pointed at a graph-aware qualifier matcher instead of a fields-only one.
 */

import type { FieldValue, FindClause, Qualifier } from "./select/qualification.js";
import { qualifierNeedsClock } from "./select/qualification.js";
import { matchesFindClause } from "./select/membership.js";
import type { ResolvedFields } from "./select/membership.js";
import type { TodayAnswer } from "./today.js";
import { applyRuleActions, evaluateWhen } from "./rules.js";
import type { RuleEffect, RulesLanguage } from "./rules.js";

/** One node as the wire actually carries it — `{id, type, fields}`, `type` a top-level sibling of
 * `fields`, never nested inside it. Measured against the shipped payload, not re-derived here. */
export interface GraphNode {
  readonly id: string;
  readonly type: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
}

/** One edge as the wire actually carries it — `{id, type, source, target, fields}`, `PART_OF` and
 * `WAITING_FOR` literal, unabbreviated `type` values. */
export interface GraphEdge {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly target: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
}

/** The slice of `GET /app/graph`'s payload this module needs — never the whole envelope, so a
 * caller building this from `graphData.snapshot.graph` states exactly what it is handing over. */
export interface GraphSnapshot {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/**
 * THE ID A `[[qntm:N]]` STAMP ACTUALLY NAMES — NEVER `node.id`, AND THIS IS NOT A STYLE CHOICE.
 *
 * `node.id` (this module's own `GraphNode.id`, above) is the graph ENGINE's internal identifier —
 * `core/graph/src/qntm_graph/core/nodes.py::create_node` mints it as `str(uuid.uuid4())`, and
 * `core/graph/src/qntm_graph/core/serialisation.py::to_dict` (the ONLY function that ever produces
 * the wire's `snapshot.graph.nodes[].id`) writes that UUID straight through — never `fields.qntm_id`,
 * never any other rewrite. `GraphEdge.source`/`.target` name the SAME UUID space (an edge's own
 * `source`/`target` come from `store.all_edges()`, the identical internal store this `id` does), so
 * `node.id` stays the right value to hand `matchesQualifierGraphAware` as `candidateId` and to
 * `neighboursOf`'s own `e.source === candidateId` comparisons — this function is NOT a replacement
 * for `node.id` everywhere, only for the one place a caller is matching a STAMP.
 *
 * A `[[qntm:N]]` stamp is a DIFFERENT number, from a DIFFERENT namespace: `renderer.py::decide_stamp`
 * emits `f"[[qntm:{qntm_id_value}]]"` where `qntm_id_value` is `_resolved_qntm_id(node)`
 * (`renderer.py:1389-1391`) — `node.fields.get("qntm_id")` when the node's schema declares one
 * (`identity/mint.py`'s `next_qntm_id`, a small monotonic counter, "max existing qntm_id + 1"),
 * falling back to `node.id` only for the rare type that mints none. These two ids are never the
 * same value for a normal, `qntm_id`-bearing node — a UUID and a small integer cannot collide, and
 * nothing in the pipeline from `graph.to_dict()` through `POST /app/graph` to `GET /app/graph`
 * (`worker/src/app.js`'s `graphPush`/`graphGet`, `server/app.py`'s `_read_graph`/`_envelope`) ever
 * reconciles them — the blob is relayed byte-for-byte at every hop.
 *
 * A caller trying to find WHICH node a printed `[[qntm:N]]` names — `stampSpans`'s own `id`,
 * bare-numeric, never `node.id`-shaped — must compare `N` against THIS function's answer, never
 * against `node.id` directly. Comparing against `node.id` looks plausible (both are "the node's id"
 * in prose) and fails SILENTLY for every node the schema mints a `qntm_id` for, which is the common
 * case: not a thrown error, not a type error, just a `Map`/`.find()` that never matches —
 * indistinguishable from a genuinely absent or stale node. `2026-08-07`: this was exactly the
 * divergence PR #131's `orderingqualify.ts` (and `resolvers/promotion.ts`'s pre-existing,
 * structurally identical `parentCandidateFor` lookup) both had: `bareId(node.id) ===
 * bareId(stampedId)` can never be true for a real, present node.
 */
export function resolvedQntmId(node: GraphNode): string {
  const raw = node.fields["qntm_id"];
  return String(raw === undefined || raw === null ? node.id : raw);
}

/**
 * The edit still missing from `graph`: the line the operator just committed, described as the
 * child it would become once the engine mints it. `edgeType` is which edge this local gesture
 * creates to ITS OWN structural parent (`PART_OF` for an ordinary indent, or whatever else the
 * caller's own gesture reading resolved — see `app/index.html`'s `prospectiveEdgeBinding`).
 * `fields` are the child's OWN resolved fields, AFTER its own `applyRules` pass has run — the same
 * "what will this line's node actually be" answer `rulesReadingFor` already computes for the
 * committed line itself, reused here rather than re-derived a second, looser way.
 */
export interface ProspectiveChild {
  readonly edgeType: string;
  readonly fields: ResolvedFields;
}

/**
 * `edgeType -> "self" | "position" | undefined` — which raw wire key (`source`/`target`) names the
 * CHILD end of an edge of this type. `"self"` mirrors `structural.ts`'s `IndentBinding.edgeSource`
 * exactly: the tagged/indented line is the edge's own `source`. `"position"` is the opposite
 * convention: the POSITIONAL node (the parent slot) is the edge's `source`. `undefined` is a real,
 * legitimate answer — "I was not told" — and every caller in this module treats it as undecidable,
 * never as a default.
 */
export type EdgeSourceOf = (edgeType: string) => "self" | "position" | undefined;

/** `{node_type: node.type, ...node.fields}` — the ONE reshaping this module does, so
 * `matchesFindClause` (membership.ts) can be reused unchanged rather than re-implemented against a
 * `{type, fields}` split it was never written to read. */
function candidateFieldsOf(node: GraphNode): ResolvedFields {
  return { node_type: node.type, ...node.fields };
}

/**
 * Every neighbour reachable from `candidateId` by a `direction`-shaped, `edgeType`-typed edge, or
 * `undefined` when the direction convention for `edgeType` is not known (`edgeSourceOf` returned
 * `undefined`) AND at least one edge of that type actually touches `candidateId` — see this
 * function's own short-circuit below for why an edge type that never touches this candidate at all
 * needs no convention to answer correctly.
 */
function neighboursOf(
  candidateId: string,
  edgeType: string,
  direction: "children" | "parents",
  edgeSourceOf: EdgeSourceOf,
  graph: GraphSnapshot,
): readonly GraphNode[] | undefined {
  const touching = graph.edges.filter(
    (e) => e.type === edgeType && (e.source === candidateId || e.target === candidateId),
  );
  // NOTHING OF THIS TYPE TOUCHES THIS CANDIDATE AT ALL — decidable trivially (zero neighbours),
  // with no need to resolve a direction convention that would never change the answer. This is what
  // lets a not-yet-minted candidate (`candidateId` an id no edge will ever name) answer WITHOUT ever
  // calling `edgeSourceOf` — it has, by construction, no existing edges of any type.
  if (touching.length === 0) return [];
  const source = edgeSourceOf(edgeType);
  if (source === undefined) return undefined;
  // "self" = the CHILD is the edge's own source (PART_OF's own convention: the indented line names
  // its parent). For a "children" query the CANDIDATE is the parent end, i.e. the edge's TARGET; for
  // a "parents" query the candidate is the CHILD end, i.e. the edge's SOURCE.
  // "position" is the mirror: the CANDIDATE is the edge's source for a "children" query, and its
  // target for a "parents" query.
  const candidateIsSource =
    (direction === "children" && source === "position") || (direction === "parents" && source === "self");
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const neighbourIds = new Set<string>();
  for (const edge of touching) {
    if (candidateIsSource) {
      if (edge.source === candidateId) neighbourIds.add(edge.target);
    } else {
      if (edge.target === candidateId) neighbourIds.add(edge.source);
    }
  }
  const out: GraphNode[] = [];
  for (const id of neighbourIds) {
    const node = byId.get(id);
    // A neighbour id the edge names but `graph.nodes` does not carry is NOT skipped silently — it
    // is exactly the shape of gap this module refuses to guess past, because skipping it would
    // under-count a `mustExist: false` step's own neighbours (a routine child this app cannot see
    // is not the same fact as "no routine child"). Undecidable, the same as an unresolved direction.
    if (node === undefined) return undefined;
    out.push(node);
  }
  return out;
}

/**
 * One `EdgeStep`'s own restricted shape — `nodeType`/`fields`, the exact `FindClause` half every
 * step already carries, reused rather than restated.
 */
type StepNeighbourFilter = Pick<FindClause, "nodeType" | "fields">;

/**
 * Does `step` — one `EdgeStep` from a published `Qualifier.edgeSteps` — hold for `candidateId`,
 * combining whatever real neighbours `graph` already names with `prospective`, when it is one this
 * step's own `direction`/`edgeType` could see at all? `undefined` when this cannot be decided.
 */
function edgeStepIsSatisfied(
  candidateId: string,
  step: {
    readonly direction: "children" | "parents";
    readonly mustExist: boolean;
    readonly edgeType: readonly string[];
  } & StepNeighbourFilter,
  edgeSourceOf: EdgeSourceOf,
  graph: GraphSnapshot,
  prospective: ProspectiveChild | undefined,
): boolean | undefined {
  const candidates: ResolvedFields[] = [];
  for (const edgeType of step.edgeType) {
    const found = neighboursOf(candidateId, edgeType, step.direction, edgeSourceOf, graph);
    if (found === undefined) return undefined;
    for (const node of found) candidates.push(candidateFieldsOf(node));
  }
  if (
    prospective !== undefined &&
    step.direction === "children" &&
    step.edgeType.includes(prospective.edgeType)
  ) {
    candidates.push(prospective.fields);
  }
  const clause: FindClause = { nodeType: step.nodeType, fields: step.fields };
  const anyMatches = candidates.some((fields) => matchesFindClause(fields, clause));
  return step.mustExist ? anyMatches : !anyMatches;
}

/**
 * Graph-aware sibling of `membership.ts`'s `matchesQualifier` — same `find`/`exclude` evaluation
 * (delegated to `matchesFindClause`, never reimplemented), PLUS every `edgeSteps` entry resolved
 * against `graph` and `prospective` rather than thrown on. Returns `undefined` — never a guessed
 * `false` — the moment any one step cannot be decided; `find`/`exclude` are still checked FIRST and
 * can still produce a confident `false` on their own, because failing those needs no graph at all.
 *
 * `candidateId` is `null` for a not-yet-minted candidate (the operator's OWN parent line has no
 * `[[qntm:N]]` stamp yet either) — see `neighboursOf`'s own short-circuit for why this still answers
 * correctly rather than needing a second code path: no real edge will ever name a `null` id, so
 * every step sees zero EXISTING neighbours and decides on `prospective` alone.
 */
export function matchesQualifierGraphAware(
  candidateFields: ResolvedFields,
  candidateId: string | null,
  qualifier: Qualifier,
  graph: GraphSnapshot,
  edgeSourceOf: EdgeSourceOf,
  prospective: ProspectiveChild | undefined,
  today?: TodayAnswer,
): boolean | undefined {
  // THE SAME "UNDEFINED, NEVER A GUESSED FALSE" CONTRACT THIS FUNCTION'S OWN HEADER STATES FOR AN
  // EDGE STEP, applied to the OTHER thing a candidate's own `find`/`exclude` might need and this
  // call might not have: `qualifierNeedsClock` can only ever be `true` here through `qualifier
  // .find`/`.exclude` (never through an edge step's own neighbour fields — `compile-qualification
  // .mjs`'s `normalisePredicate` never admits a comparison there; see that function's own
  // `allowComparison` parameter), so checking it before either `matchesFindClause` call below
  // is checking exactly what those two calls are about to need.
  if (qualifierNeedsClock(qualifier) && today === undefined) return undefined;
  if (!matchesFindClause(candidateFields, qualifier.find, today)) return false;
  if (qualifier.exclude.some((clause) => matchesFindClause(candidateFields, clause, today))) return false;
  const steps = qualifier.edgeSteps ?? [];
  if (steps.length === 0) return true;
  // `candidateId` folded to a sentinel no real wire id can equal — `neighboursOf`'s own filter
  // (`e.source === candidateId || e.target === candidateId`) is never true for a `null` candidate
  // either way; the sentinel exists only so this function's own signature can stay a plain `string`
  // internally rather than threading `| null` through every helper below it.
  const id = candidateId ?? "";
  for (const step of steps) {
    const ok = edgeStepIsSatisfied(id, step, edgeSourceOf, graph, prospective);
    if (ok === undefined) return undefined;
    if (!ok) return false;
  }
  return true;
}

/** Mirrors `RulePassResult` (rules.ts) exactly — same four fields, same meaning — for the graph-aware
 * pass over an EXTERNAL candidate rather than the commit's own line. */
export interface GraphAwareRulePassResult {
  readonly fields: ResolvedFields;
  readonly applied: readonly RuleEffect[];
  readonly partial: readonly string[];
  readonly undecidable: readonly string[];
}

/**
 * `applyRules`'s own one-pass, priority-ordered walk (`rules.ts`), pointed at
 * `matchesQualifierGraphAware` instead of `matchesQualifier` — see this module's own header for why
 * that is the whole of what is different, and why the `habit-wins-over-outcome` exclusion needs no
 * special case here. `candidateId`/`prospective` are threaded through UNCHANGED to every step of
 * every rule in the walk; `today` is the SAME clock-free parameter `applyRules` already takes.
 */
export function applyGraphAwareRules(
  fields: ResolvedFields,
  candidateId: string | null,
  language: RulesLanguage,
  graph: GraphSnapshot,
  edgeSourceOf: EdgeSourceOf,
  prospective: ProspectiveChild | undefined,
  today: { readonly logicalDate: string; readonly weekEnd: string } | undefined,
): GraphAwareRulePassResult {
  let working: Record<string, FieldValue> = { ...fields };
  const applied: RuleEffect[] = [];
  const partial: string[] = [];
  const undecidable: string[] = [];

  for (const ruleId of language.order) {
    const rule = language.rules[ruleId];
    if (rule === undefined) continue; // defence in depth — same as applyRules's own
    const qualifier = language.patterns[rule.pattern];
    if (qualifier === undefined) continue; // same defence

    const matched = matchesQualifierGraphAware(
      working,
      candidateId,
      qualifier,
      graph,
      edgeSourceOf,
      prospective,
      today,
    );
    if (matched === undefined) {
      undecidable.push(ruleId);
      continue;
    }
    if (!matched) continue;
    if (!evaluateWhen(rule.when, working)) continue;

    if (rule.partial === true) partial.push(ruleId);
    const { working: nextWorking, effects } = applyRuleActions(ruleId, rule.actions, working, today);
    working = nextWorking;
    applied.push(...effects);
  }

  return { fields: working, applied, partial, undecidable };
}

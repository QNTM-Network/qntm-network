/**
 * orderingqualify — for an EXISTING, already-rendered sibling line, is it a genuine QUALIFYING
 * member of its section, or a CONTEXT/ancestor row pulled in only to complete the tree?
 *
 * `ordering.ts`'s header names this gap and refuses to guess past it: the DEFAULT/title path keeps
 * refusing `nested-section` because "engine membership (`qualifying_ids`, invisible to this app) is
 * what actually decides context-vs-qualifying" and needs "a real qualifying/context signal (graph
 * membership...) this app does not have today, not a cleverer text heuristic." This module is that
 * signal.
 *
 * ── WHY NOT `resolution.sectionRegistration`, AND WHY NOT TEXT AT ALL ──
 *
 * `sectionRegistration` (resolutiontable.ts) looks like a candidate but its own header says it is
 * NOT the qualification — it is "what a new line BECOMES", published UNGATED, independent of what
 * already belongs there. The real predicate is `qualification.sections[view][section].qualification`
 * naming an entry in `qualification.predicates` (a `Qualifier`). `membership.ts`'s
 * `matchesQualifier`/`resolveLineFields` already reads it, but only for a line being TYPED,
 * unstamped — it derives node_type/domain/status from THIS section's OWN registration cascade, and
 * abstains `already-a-node` for anything carrying `[[qntm:N]]`, which every real sibling does
 * (`ordering.ts`'s own measurement). Applying that cascade to a stamped sibling ANYWAY would not be
 * a smaller answer, it would be a wrong one: a context/ancestor row was minted under a DIFFERENT
 * section with a DIFFERENT default, and a bare line relying on either default is textually
 * IDENTICAL — `tests/present-ordering.test.mjs` §11d's own "Zebra context row"/"Apple task" fixture
 * is built to prove exactly this: no text heuristic can tell them apart.
 *
 * ── WHAT THIS MODULE READS INSTEAD ──
 *
 * The GRAPH. `resolvers/promotion.ts`'s `parentCandidateFor` already reads a structural parent's
 * TRUE fields off the live `GraphSnapshot` by its `[[qntm:N]]` stamp rather than re-deriving them —
 * "the graph, never a re-derivation off the line, is this app's source of truth for an existing
 * node." This module applies the same rule to every OTHER stamped sibling a section prints:
 * `stampSpans` reads the id, the id is looked up in `graph`, and the node's OWN last-cycle fields
 * are matched against the section's `Qualifier` with `matchesQualifierGraphAware` (`graphmatch.ts`)
 * — the same function `promotion.ts` already trusts. No new matching logic here, only the wiring
 * that gets a sibling LINE to that existing matcher.
 *
 * `ordering.ts` stays "no graph" (its own header's purity claim): it gains only an OPTIONAL plain
 * function parameter, `(lineIndex) => boolean | undefined`, the same shape `applyRules` already
 * takes `today` in rather than reading the clock. This file is the one place the graph is read.
 *
 * ── COVERAGE THIS MODULE DOES NOT REACH ──
 *
 * `qualifyingClassifierFor` returns `undefined` (no classifier — `ordering.ts` keeps its present,
 * unnarrowed abstention) when the section's qualification was never published. Measured 2026-08-01
 * (`qualification.ts`'s own header, cross-checked against `backlog.yaml`'s
 * `the-cascade-terminates-for-a-new-line` row): 118 of 159 real section qualifications are exactly
 * this — refused by the generator (more than a one-hop edge, the clock, or an unresolvable field).
 * Widening that is a generator change, out of scope here and not approximated.
 *
 * Per-line, the classifier returns `undefined` (unknown — dropped from the ranked set, the same
 * "cannot read, so cannot include" rule the marker path already applies to an unreadable marker)
 * when: the line carries no `[[qntm:N]]` at all (the ordinary shape of the line CURRENTLY BEING
 * EDITED, a fresh capture — not a defect); the stamped id is not in `graph` (a stale snapshot,
 * accepted the same way `promotion.ts` already accepts it); or the qualifier's one-hop edge step
 * cannot be resolved (`matchesQualifierGraphAware`'s own `undefined`).
 */

import { stampSpans } from "./rendition.js";
import type { QualificationLanguage, Qualifier } from "./qualification.js";
import { matchesQualifierGraphAware } from "./graphmatch.js";
import type { EdgeSourceOf, GraphSnapshot } from "./graphmatch.js";

/** `[[qntm:N]]` -> `N`, and `qntm:N` -> `N` — the same normalisation `promotion.ts`'s own `bareId`
 * applies, so a real match is never missed over a prefix this app is not certain either side uses. */
const bareId = (id: string): string => String(id).replace(/^qntm:/i, "");

/**
 * The section's own published qualifier, or `undefined` when this module has nothing to test
 * against — `qualifyingClassifierFor`'s own first gate, pulled out so a caller that wants to know
 * WHY no classifier exists (as opposed to merely that none does) can ask this directly.
 */
export function publishedQualifierFor(
  viewId: string,
  sectionId: string,
  qualification: QualificationLanguage,
): Qualifier | undefined {
  const section = qualification.sections[viewId]?.[sectionId];
  if (section === undefined) return undefined;
  return qualification.predicates[section.qualification];
}

/**
 * Build a classifier — `(lineIndex) => boolean | undefined` — for every line in `lines`, scoped to
 * one section's own published qualifier. `undefined` (no classifier) when `viewId`/`sectionId`'s
 * qualification was never published; see this module's own header for how often that is true today
 * and why it is not this module's place to approximate past it.
 *
 * `lines` MUST be the same `source.split("\n")` the caller's own `ordering.ts` walk uses — the
 * classifier is a closure over a fixed line array, addressed by the SAME index `ordering.ts`
 * already threads through `evaluateDefaultSection`, never re-split here.
 */
export function qualifyingClassifierFor(
  lines: readonly string[],
  viewId: string,
  sectionId: string,
  qualification: QualificationLanguage,
  graph: GraphSnapshot,
  edgeSourceOf: EdgeSourceOf,
): ((lineIndex: number) => boolean | undefined) | undefined {
  const qualifier = publishedQualifierFor(viewId, sectionId, qualification);
  if (qualifier === undefined) return undefined;

  // Built once per call, not once per line — `graph.nodes` is walked here exactly once regardless
  // of how many lines the returned closure is later asked about.
  const byId = new Map(graph.nodes.map((node) => [bareId(node.id), node] as const));

  return (lineIndex: number): boolean | undefined => {
    const line = lines[lineIndex] ?? "";
    const stamped = stampSpans(line);
    const first = stamped[0];
    if (first === undefined) return undefined; // no `[[qntm:N]]` — cannot identify the node at all
    const node = byId.get(bareId(first.id));
    if (node === undefined) return undefined; // stamped, but not in this (possibly stale) graph
    const fields = { node_type: node.type, ...node.fields };
    return matchesQualifierGraphAware(fields, node.id, qualifier, graph, edgeSourceOf, undefined);
  };
}

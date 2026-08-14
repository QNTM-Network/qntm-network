/**
 * titleStyleFor — apply the published `render_title_style` table to one node.
 *
 * ── WHY THIS SHIPS WITH THE TABLE RATHER THAN AFTER IT ──
 *
 * `edgeTagOrder` was published as the ORDER of a cell nothing could fill, and the lesson written
 * down beside `TOP_KEYS` is that publishing a fact asserts it can be used. A first-match-wins
 * predicate table that no caller can evaluate is the same shape: correct, pinned, and inert. This
 * is the smallest thing that makes the table answer a question.
 *
 * PURE. No DOM, no fetch, no clock. It takes a context and returns the styles.
 *
 * ── THE TWO DEFAULTS THAT DECIDE WHETHER THIS AGREES WITH THE ENGINE AT ALL ──
 *
 * `build_node_local_context` (qntm_md/node_context.py) does not hand the rule engine a plain
 * object. Two of its members carry DEFAULTS, and both are load-bearing for these predicates:
 *
 *   * `node.fields` is a NONE-DEFAULT map. A node with no `status` resolves
 *     `node.fields.status` to null, not to a missing path — so `{eq: [..., "done"]}` is a clean
 *     false rather than an error.
 *   * `node.edge_type_counts` is a ZERO-DEFAULT count map. A node with no WAITING_FOR edge
 *     resolves that count to 0, not undefined — so `{gte: [..., 1]}` compares 0 against 1 and is
 *     false, where an undefined would make the comparison meaningless.
 *
 * The contract's own header records what the second one costs when it is absent: reaching for
 * `incoming_edge_ids` — a PLAIN dict with no default — raises rather than not-matching, and that
 * "aborted a whole cycle rather than merely mis-styling a line".
 *
 * So `nodeLocalContext` below builds those defaults ONCE, here, rather than leaving each caller to
 * remember them. A composer that assembled the context by hand and forgot the zero-default would
 * disagree with the engine on every node with no outgoing WAITING_FOR edge — which is nearly all
 * of them, and silently.
 */

import type { RenderTitleStyle, TitleStylePredicate } from "../resolutiontable.js";

/** The node shape this needs — a subset of the graph's own, so a caller passes what it already has. */
export interface TitleStyleNode {
  readonly type: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

/**
 * The context a title-style predicate resolves against, mirroring `build_node_local_context`'s
 * render-decision members. `outgoingEdgeTypes` is the node's OUTGOING edge type names, one entry
 * per edge (repeats are what make a count), because that is what the engine counts.
 *
 * INCOMING IS ACCEPTED AND UNUSED TODAY, deliberately. The contract says its WAITING_FOR row
 * becomes `node.incoming_edge_type_counts.WAITING_FOR` once the engine's mirror lands. Taking it
 * now means that row needs no change here — the path resolves and the answer moves with it.
 */
export function nodeLocalContext(
  node: TitleStyleNode,
  outgoingEdgeTypes: readonly string[] = [],
  incomingEdgeTypes: readonly string[] = [],
): Record<string, unknown> {
  const count = (types: readonly string[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const type of types) out[type] = (out[type] ?? 0) + 1;
    return out;
  };
  return {
    node: {
      type: node.type,
      fields: { ...node.fields },
      edge_type_counts: count(outgoingEdgeTypes),
      incoming_edge_type_counts: count(incomingEdgeTypes),
    },
  };
}

/**
 * Resolve a dot path, returning the ZERO-DEFAULT for a missing count and `null` for a missing
 * field — the two defaults named in this module's header. Anything else missing is `undefined`,
 * which never equals a published `value` and so never matches, the same as the engine's non-match.
 */
function resolvePath(context: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".");
  let cursor: unknown = context;
  for (const [index, segment] of segments.entries()) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    const parent = cursor as Record<string, unknown>;
    if (!(segment in parent)) {
      // THE DEFAULTS, applied at the point the lookup misses rather than by pre-filling every
      // possible key. `node.edge_type_counts.X` and its incoming mirror are counts, so an absent
      // one is 0; `node.fields.X` is a field, so an absent one is null.
      const container = segments.slice(0, index).join(".");
      if (container === "node.edge_type_counts" || container === "node.incoming_edge_type_counts") return 0;
      if (container === "node.fields") return null;
      return undefined;
    }
    cursor = parent[segment];
  }
  return cursor;
}

function compare(op: string, left: unknown, right: string | number): boolean {
  if (op === "eq") return left === right;
  if (op === "ne") return left !== right;
  // ORDERING COMPARISONS ONLY BETWEEN NUMBERS. The engine's operators are Python's, where
  // `None > 1` raises rather than answering; refusing to compare a non-number is the closest
  // honest equivalent — it does not match, and it does not invent an ordering JavaScript would
  // happily supply by coercion.
  if (typeof left !== "number" || typeof right !== "number") return false;
  if (op === "gt") return left > right;
  if (op === "gte") return left >= right;
  if (op === "lt") return left < right;
  if (op === "lte") return left <= right;
  return false;
}

/** Evaluate one predicate against a context. */
export function titleStylePredicateHolds(
  predicate: TitleStylePredicate,
  context: Record<string, unknown>,
): boolean {
  // DISCRIMINATED ON SHAPE, not by eliminating `op` values one at a time. The logical arm's `op` is
  // itself a union (`"and" | "or"`), so narrowing it away member by member leaves the arm in place
  // as far as the checker is concerned and the comparison branch cannot see its own `path`.
  if ("terms" in predicate) {
    return predicate.op === "and"
      ? predicate.terms.every((term) => titleStylePredicateHolds(term, context))
      : predicate.terms.some((term) => titleStylePredicateHolds(term, context));
  }
  if ("term" in predicate) return !titleStylePredicateHolds(predicate.term, context);
  return compare(predicate.op, resolvePath(context, predicate.path), predicate.value);
}

/**
 * The styles this node's title is wrapped in — FIRST MATCH WINS, `fallback` when none holds.
 *
 * Returns the table's own arrays, never a copy with something added: the GLOBAL
 * `composition.form.titleStyles` is a separate answer the engine merges alongside this one, and
 * merging it here would apply it twice for a caller that also reads it.
 */
export function titleStyleFor(
  table: RenderTitleStyle,
  context: Record<string, unknown>,
): readonly string[] {
  for (const row of table.rows) {
    if (titleStylePredicateHolds(row.when, context)) return row.then;
  }
  return table.fallback;
}

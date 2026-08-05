/**
 * THE REGISTRY — which resolvers run, and in what order.
 *
 * ── THIS ARRAY IS THE ONLY PLACE A RESOLVER IS NAMED ──
 *
 * `commitLine` (app/index.html) names none of them. It builds ONE `CommitContext`, hands it to
 * `runResolvers`, and joins what comes back. Adding a tenth axis is a spec module and one line
 * here; it is not a fifth badge-writing function on a page the compiler cannot read.
 *
 * ── WHAT THE ORDER DECIDES, AND WHAT IT DOES NOT ──
 *
 * DOES NOT: which answers are reached. Every `read` is pure and reads only the context, which the
 * runner never mutates, so no resolver can see another's answer and no permutation of this array
 * changes a single reading, note, badge string or placement.
 *
 * DOES, and only these two: the order the freshness-line sentences are JOINED in, and the order the
 * predictions reach `PredictSurface.arm` in. Both are visible to the operator and both are declared
 * HERE and nowhere else. `tests/app-resolver-registry.test.mjs` is the falsifier — it shuffles this
 * array and asserts exactly those two outputs move and nothing else does.
 *
 * THE ORDER IS THE ONE THAT SHIPPED. membership, ordering, rules, parent — the sequence
 * `commitLine`'s own `notes` array and its four `update*Badge` calls were written in, preserved
 * literally so this restructure cannot move a sentence.
 *
 * ── THE SEAM FOR PUBLISHING THIS FROM CONFIG ──
 *
 * A later leg publishes this order from config, so the engine and the browser read ONE declaration
 * rather than two hand-kept lists. When it lands, THIS FILE reads the published order and maps it
 * onto the specs below, through `defineResolver` — the single point of entry every resolver already
 * goes through. `runResolvers`, the page, and every spec are untouched by that change.
 *
 * THERE IS NO PLACEHOLDER DECLARATION, NO GENERATOR AND NO CONFIG KEY YET, AND THAT IS DELIBERATE.
 * A declaration that exists and does not reach is this system's highest-frequency defect — it looks
 * like progress and is a second thing to keep in step with the truth. A seam is a comment and a
 * single point of entry, not a file.
 */

import { defineResolver } from "../resolve.js";
import type { Resolver } from "../resolve.js";
import { membershipSpec } from "./membership.js";
import { orderingSpec } from "./ordering.js";
import { rulesSpec } from "./rules.js";
import { promotionSpec } from "./promotion.js";

export const RESOLVERS: readonly Resolver[] = [
  defineResolver(membershipSpec),
  defineResolver(orderingSpec),
  defineResolver(rulesSpec),
  defineResolver(promotionSpec),
];

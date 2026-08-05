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
 * DOES, and these are all of them:
 *
 *   1. The order the freshness-line sentences are JOINED in.
 *   2. The order the predictions reach `PredictSurface.arm` in — one list, one arm, painted in the
 *      order given.
 *   3. LATENT, AND STATED RATHER THAN LEFT TO BE DISCOVERED: which placement wins, if two resolvers
 *      ever arm `settle` for the same commit. `SettleSurface.arm` OVERWRITES (one cursor, one
 *      pending settle), so `armSettle` applying them in registry order means the LAST one wins.
 *      Exactly one resolver arms settle today, so this cannot fire — but "the order decides only
 *      two things" would have been false the day a second one landed, and a claim that quietly
 *      stops being true is worse than a caveat nobody needs yet.
 *
 * All three are declared HERE and nowhere else. `tests/app-resolver-registry.test.mjs` is the
 * falsifier for the first two — it reverses this array and asserts every badge, every reading and
 * the POST body are byte-identical while the joined sentence reverses.
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

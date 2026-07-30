/**
 * PresentationContext — the assembled facts, one contribution per level.
 *
 * PURE. It holds what each level says and nothing else: no DOM, no fetch, no session, no clock.
 * Keeping it pure is what lets a test say "resolve as if the cursor were on this line" without a
 * browser, which is the whole reason the cursor rule (migration stage 3) can be specified before
 * the surface it reacts to exists.
 *
 * IT IS EMPTY IN THE SHIPPED APP TODAY, DELIBERATELY. `app.html` constructs one with no
 * contributions, so every level is silent and every key falls through to DEFAULT. That is not a
 * stub — it is the honest state: no level has a declaration home yet. GLOBAL gets one at stage 2,
 * MODE at stage 4, USER at stage 5, VIEW and STRUCTURAL_NODE at stage 7 (which needs the snapshot
 * envelope widened first). Each of those stages fills a slot this class already has, and none of
 * them changes this file.
 *
 * The constructor takes a plain record rather than a Map so a caller can write the fact it knows
 * and stay silent on the rest without spelling silence a second way.
 */

import type { PresentationLevel } from "./levels.js";
import type { Contribution } from "./resolution.js";

export class PresentationContext {
  readonly #contributions: ReadonlyMap<PresentationLevel, Contribution>;

  constructor(contributions: Readonly<Partial<Record<PresentationLevel, Contribution>>> = {}) {
    const entries = Object.entries(contributions) as ReadonlyArray<
      readonly [PresentationLevel, Contribution | undefined]
    >;
    this.#contributions = new Map(
      entries.filter((entry): entry is [PresentationLevel, Contribution] => entry[1] !== undefined),
    );
  }

  /**
   * What this level says, or `undefined` if it says nothing.
   *
   * The cascade is the only caller. It is a method rather than a public field so that the
   * cascade's read of a level is a real, observable call — `flow-trace` measures calls, and a
   * property read would make the edge between the resolver and the facts it resolves against
   * invisible to the thing that is supposed to be watching it.
   */
  at(level: PresentationLevel): Contribution | undefined {
    return this.#contributions.get(level);
  }
}

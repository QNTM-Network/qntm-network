/**
 * PresentationCascade — the ONE reader. Pure: no DOM, no fetch, no globals.
 *
 * ── HOMED IN express/ — THE EXPRESS VERB ──
 *
 * The LINES half of docs/implementation-artifacts/design-the-three-layers.md's three-verb split:
 * this class is the actual cascade walk that turns an assembled `PresentationContext` into one
 * `Resolved` decision per token family — the mechanism EXPRESS's own definition names ("turn one
 * node into a line of text"). `levels.ts` (the precedence order) and `rendition.ts` (the value
 * vocabulary) sit beside it in this directory for the same reason.
 *
 * This is the answer to the test design-presentation-cascade.md section 1 sets: a reader of this
 * repo, asked "why did this line render this way?", must be able to answer by naming one level,
 * one declaration and one reader, without reading a painter function and without running the app.
 * The reader is this class. Before it, the answer was "line 241 of a 395-line HTML page decided".
 *
 * PROVENANCE IS PART OF THE RETURN. `resolve` reports WHICH LEVEL WON, not just what it decided.
 * That is what makes the cascade debuggable by the person using the app rather than only by its
 * author — "this rendered this way because your USER default says so" is a title attribute away —
 * and it is what lets a test assert precedence rather than merely assert an outcome that happens
 * to be right for the wrong reason.
 *
 * THE ORDER IS NOT HERE. It is `SPECIFICITY`, in levels.ts, and this loop is the only thing that
 * walks it. See levels.ts for why that matters.
 */

import { SPECIFICITY, isSilent } from "./levels.js";
import type { PresentationLevel } from "./levels.js";
import { DEFAULT } from "./rendition.js";
import type { Rendition, ResolutionKey } from "./rendition.js";
import type { PresentationContext } from "../context.js";

/** A decision and its provenance: what won, and which level won it. */
export interface Resolved {
  readonly rendition: Rendition;
  readonly level: PresentationLevel;
}

export class PresentationCascade {
  readonly #context: PresentationContext;

  constructor(context: PresentationContext) {
    this.#context = context;
  }

  /**
   * Resolve one key. Most specific level that says anything wins; DEFAULT if none does.
   *
   * Deliberately the same shape as the engine's `ResolutionCascade.resolve` on the ingest side.
   * A reader who has understood one has understood both, and divergence between the two halves is
   * the failure this whole arc exists to avoid.
   */
  resolve(key: ResolutionKey): Resolved {
    for (const level of SPECIFICITY) {
      const contribution = this.#context.at(level);
      if (isSilent(contribution)) {
        continue;
      }
      const rendition = contribution?.[key];
      if (rendition === undefined) {
        continue;
      }
      return { rendition, level };
    }
    return { rendition: DEFAULT[key], level: "GLOBAL" };
  }
}

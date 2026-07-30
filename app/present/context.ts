/**
 * PresentationContext — the assembled facts, one contribution per level.
 *
 * PURE. It holds what each level says and nothing else: no DOM, no fetch, no session, no clock.
 * Keeping it pure is what lets a test say "resolve as if the cursor were on this line" without a
 * browser, which is the whole reason the cursor rule (migration stage 3) can be specified before
 * the surface it reacts to exists.
 *
 * ONE LEVEL SPEAKS IN THE SHIPPED APP AS OF MIGRATION STAGE 2. `app.html` fetches the served
 * declaration (`presentation.json`) and builds its context through `presentationFromDeclaration`
 * below; every other level is still silent and falls through to DEFAULT. The remaining slots fill
 * one stage at a time: MODE at stage 4, USER at stage 5, VIEW and STRUCTURAL_NODE at stage 7
 * (which needs the snapshot envelope widened first), and FOCUS at stage 3 — which is DERIVED from
 * where the cursor is rather than declared in a file, so it arrives per line rather than here.
 *
 * The constructor takes a plain record rather than a Map so a caller can write the fact it knows
 * and stay silent on the rest without spelling silence a second way.
 */

import type { PresentationLevel } from "./levels.js";
import { readDeclaration } from "./declaration.js";
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

/** A context built from a served declaration, and everything that was wrong with the document. */
export interface DeclaredPresentation {
  readonly context: PresentationContext;
  readonly problems: readonly string[];
}

/**
 * Assemble a context from the instance's served presentation declaration — the GLOBAL level.
 *
 * THIS FUNCTION IS THE WIRE, and it is a function in `app/` rather than four lines in `app.html`
 * for one reason that is not style: `.flow-trace.yaml`'s capture filter is the path prefix `app`,
 * so a call made from the page is a call nothing can observe. The edge
 * `app/present/context -> app/present/declaration` is declared in flows.yaml as
 * `context-reads-the-global-declaration`, and it is the observable form of "the declaration
 * reaches". Written in the page instead, "is the reader wired?" would be answerable only by
 * reading a file — which is the condition migration stage 1 existed to end.
 *
 * A document that could not be read at all yields an empty contribution, which `isSilent` treats
 * as silence, which falls through to DEFAULT. So the worst case of a broken declaration is
 * TODAY'S BEHAVIOUR PLUS A PROBLEM MESSAGE, never a blank page.
 */
export function presentationFromDeclaration(document: unknown): DeclaredPresentation {
  const reading = readDeclaration(document);
  return {
    context: new PresentationContext({ GLOBAL: reading.contribution }),
    problems: reading.problems,
  };
}

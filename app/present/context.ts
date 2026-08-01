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
 * `presentationFromDeclaration` ALSO reads two facts that are not cascade levels at all — the
 * indent unit and the structural language (`design-the-structural-language.md`, item 1) — off the
 * SAME served document. Neither is a `Rendition`, so neither lives in `PresentationContext`; see
 * `DeclaredPresentation` below for where they do.
 *
 * The constructor takes a plain record rather than a Map so a caller can write the fact it knows
 * and stay silent on the rest without spelling silence a second way.
 */

import type { PresentationLevel } from "./levels.js";
import { readDeclaration } from "./declaration.js";
import { readStructuralDeclaration } from "./structural.js";
import type { StructuralLanguage } from "./structural.js";
import { readQualificationDeclaration } from "./qualification.js";
import type { QualificationLanguage } from "./qualification.js";
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

  /**
   * The same facts with one level replaced — a NEW context; this one never changes.
   *
   * DERIVED LEVELS NEED THIS AND DECLARED LEVELS DO NOT, which is the whole reason it exists.
   * GLOBAL, USER, VIEW and STRUCTURAL_NODE are read once from somewhere and hold still for the
   * whole paint, so the constructor is enough for them. FOCUS is a fact about ONE LINE AT ONE
   * INSTANT: it is true of the line under the cursor and false of the forty lines around it, and
   * a paint therefore needs forty-one slightly different contexts.
   *
   * Immutable on purpose. A mutable context would let the painter set FOCUS, paint, and forget to
   * unset it — and a resolver whose answer depends on what was asked before it is not a cascade,
   * it is a state machine wearing one. Every context handed to a cascade here is complete.
   */
  with(level: PresentationLevel, contribution: Contribution | undefined): PresentationContext {
    const next: Partial<Record<PresentationLevel, Contribution>> = {};
    for (const [existing, said] of this.#contributions) {
      next[existing] = said;
    }
    if (contribution === undefined) {
      delete next[level];
    } else {
      next[level] = contribution;
    }
    return new PresentationContext(next);
  }
}

/** A context built from a served declaration, and everything that was wrong with the document. */
export interface DeclaredPresentation {
  readonly context: PresentationContext;
  /** The instance's indent unit, in spaces — see `declaration.ts`'s header for why this rides
   * beside the GLOBAL contribution rather than inside it (it is not a `Rendition`). */
  readonly indentUnit: number;
  /** The INGEST axis — what a gesture like indent MEANS. See `structural.ts`'s header for why
   * this is a lookup table rather than a fifth cascade level. */
  readonly structural: StructuralLanguage;
  /** The MEMBERSHIP axis — which section a line belongs in, and the full declared section order
   * per view that `app/present/address.ts`'s `sectionAt` indexes. See `qualification.ts`'s header
   * for why this is a lookup table too, and `membership.ts` for what tests a resolved field set
   * against it. Was read only by tests until this wiring; see this field's own history for why "a
   * declaration that exists and does not reach" is this system's highest-frequency bug. */
  readonly qualification: QualificationLanguage;
  readonly problems: readonly string[];
}

/**
 * Assemble a context from the instance's served presentation declaration — the GLOBAL level, the
 * indent unit, and the structural language, all three read from the SAME document.
 *
 * THIS FUNCTION IS THE WIRE, and it is a function in `app/` rather than lines in `app.html` for
 * one reason that is not style: `.flow-trace.yaml`'s capture filter is the path prefix `app`, so
 * a call made from the page is a call nothing can observe. The edge `app/present/context ->
 * app/present/declaration` is declared in flows.yaml as `context-reads-the-global-declaration`,
 * and `app/present/context -> app/present/structural` as `context-reads-the-structural-
 * declaration` — both are the observable form of "the declaration reaches". Written in the page
 * instead, "is the reader wired?" would be answerable only by reading a file — which is the
 * condition migration stage 1 existed to end, and exactly the reason `structural`'s reader is
 * called from HERE rather than from `app/index.html` directly, even though it could be: one call
 * site, for one document, is also what keeps a future caller from fetching or parsing it twice.
 *
 * A document that could not be read at all yields an empty contribution and an empty structural
 * language, which `isSilent` and `structural.ts`'s own silence-is-legal rule both treat the same
 * way. So the worst case of a broken declaration is TODAY'S BEHAVIOUR PLUS A PROBLEM MESSAGE,
 * never a blank page and never a guess.
 *
 * `qualification.ts`'s reader joins the same way `structural.ts`'s did — read HERE, off the SAME
 * document, and returned on `DeclaredPresentation` rather than left for each caller to fetch a
 * third time. Before this, `readQualificationDeclaration` had no production caller at all: only
 * tests called it directly. 20+ KB of predicate table shipped in every build and no running line
 * of code opened it — exactly the failure mode this function's own header names first.
 */
export function presentationFromDeclaration(document: unknown): DeclaredPresentation {
  const reading = readDeclaration(document);
  const structuralReading = readStructuralDeclaration(document);
  const qualificationReading = readQualificationDeclaration(document);
  return {
    context: new PresentationContext({ GLOBAL: reading.contribution }),
    indentUnit: reading.indentUnit,
    structural: structuralReading.structural,
    qualification: qualificationReading.qualification,
    problems: [...reading.problems, ...structuralReading.problems, ...qualificationReading.problems],
  };
}

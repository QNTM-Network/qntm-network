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
import { readDeclaration, DEFAULT_INDENT_UNIT } from "./declaration.js";
import { readStructuralDeclaration } from "./structural.js";
import type { StructuralLanguage } from "./structural.js";
import { readQualificationDeclaration } from "./qualification.js";
import type { QualificationLanguage } from "./qualification.js";
import { readConfigResolutionDeclaration } from "./resolutiontable.js";
import type { ConfigResolutionTable } from "./resolutiontable.js";
import { readRulesDeclaration } from "./rules.js";
import type { RulesLanguage } from "./rules.js";
import type { Contribution } from "./rendition.js";

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
  /** Which view id a fresh boot should land on — see `declaration.ts`'s `LANDING_VIEW_KEY` for
   * where it comes from. `undefined` when the document declares none; `app/index.html`'s `landOn`
   * is the one reader, and it says so loudly rather than guessing. */
  readonly landingView: string | undefined;
  /** The INGEST axis — what a gesture like indent MEANS. See `structural.ts`'s header for why
   * this is a lookup table rather than a fifth cascade level. */
  readonly structural: StructuralLanguage;
  /** The MEMBERSHIP axis — which section a line belongs in, and the full declared section order
   * per view that `app/present/address.ts`'s `sectionAt` indexes. See `qualification.ts`'s header
   * for why this is a lookup table too, and `membership.ts` for what tests a resolved field set
   * against it. Was read only by tests until this wiring; see this field's own history for why "a
   * declaration that exists and does not reach" is this system's highest-frequency bug. */
  readonly qualification: QualificationLanguage;
  /** The CONFIG-ONLY RESOLUTION TABLE — registration's two names, ordering, line grammars, the
   * day boundary. See `resolutiontable.ts`'s header for what it deliberately does not carry
   * (defaults and the per-view minting default, already published on `qualification` above).
   *
   * `undefined` WHEN THE DOCUMENT DECLARED NO USABLE TABLE, and unlike `structural`/
   * `qualification`/`rules` beside it there is no empty-object form of this one to fall back to:
   * a table without a valid `dayBoundary` is refused whole, because the boundary is the one field
   * whose absence crashes a reader rather than quieting it. See
   * `readConfigResolutionDeclaration`'s own header for what that refusal costs and why it is
   * still the right trade. Consumers already gate on this — `resolvers/{rules,ordering,
   * promotion}.ts` and the page's `globalRegistrationFor` each open by checking it. */
  readonly resolution: ConfigResolutionTable | undefined;
  /** THE RULES-CATEGORY GRAMMAR — `scripts/compile-rules.mjs`'s own published pattern/predicate/
   * priority/action table, plus the pattern find-clauses and field-marker spellings needed to
   * APPLY it to a fresh capture's own resolved fields. See `rules.ts`'s header for what reads it
   * (`app/index.html`'s `rulesReadingFor`) and what it deliberately never does on its own. */
  readonly rules: RulesLanguage;
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
 *
 * `resolutiontable.ts`'s reader joins the same way, a fourth axis over the same document
 * (design-the-resolution-architecture.md step 5). Unlike the other three, nothing under `app/`
 * calls `presentationFromDeclaration(...).resolution` yet — see that module's own header for why
 * it is still published: the next three steps of the same sequence each name it as their
 * dependency, which is a precondition, not the "published, not yet narrated" gap the other axes
 * started from.
 */
export function presentationFromDeclaration(document: unknown): DeclaredPresentation {
  const reading = readDeclaration(document);
  const structuralReading = readStructuralDeclaration(document);
  const qualificationReading = readQualificationDeclaration(document);
  const resolutionReading = readConfigResolutionDeclaration(document);
  const rulesReading = readRulesDeclaration(document);
  return {
    context: new PresentationContext({ GLOBAL: reading.contribution }),
    indentUnit: reading.indentUnit,
    landingView: reading.landingView,
    structural: structuralReading.structural,
    qualification: qualificationReading.qualification,
    resolution: resolutionReading.resolution,
    rules: rulesReading.rules,
    problems: [
      ...reading.problems,
      ...structuralReading.problems,
      ...qualificationReading.problems,
      ...resolutionReading.problems,
      ...rulesReading.problems,
    ],
  };
}

/**
 * Declaration — the six facts `app/index.html` reads out of ONE served document, held as ONE
 * value instead of six independent `let`s. `research-the-store.md` §7.1 names this the one
 * concrete piece of work its survey of the app's state layer found: unlike the eleven mutable
 * surfaces under `app/present/` — each of which argues in its own header why it must NOT merge
 * with its neighbour — these six have no such argument, because they are not six facts. They are
 * one fact (`presentationFromDeclaration`'s return value) that the page used to destructure back
 * apart.
 *
 * ── THE UNIT: THE NEWEST DECLARATION, WHOLE — NO PER-KEY COMPARISON ──
 *
 * Every one of the eleven surfaces this app already has needs its own comparison logic —
 * `sameView`, `isNewer`, `extendsLine`, `ANCHOR_TRUST` — because each holds a fact that can be
 * newer or older than what is on screen. A `Declaration` has no such question: there is exactly
 * one writer (`applyPresentation`, `app/index.html`), exactly one source (`/presentation.json`),
 * and no notion of "stale" independent of "not the one most recently fetched". So this is a plain
 * `interface`, not a class — nothing here needs a method, because "the newest one, whole" is not
 * a comparison, it is a replacement.
 *
 * ── ATOMICITY IS STRUCTURAL, NOT A CONVENTION FOLLOWED CAREFULLY ──
 *
 * The six-`let` shape this replaces had no barrier between assigning `structural` and assigning
 * `rulesTable` — a throw between the two (or a future edit that inserts one) would leave some axes
 * describing a new document and some the old, with nothing to catch it. A `Declaration` cannot tear
 * for a structural reason, not merely an unlikely one: `declarationFrom` below builds the whole
 * object as ONE expression before it is ever assigned to anything, so either every field is read
 * off the SAME `DeclaredPresentation` (which is itself built as one object literal by
 * `presentationFromDeclaration` above, off one call to each of five pure readers, before that
 * function returns), or the assignment that would have replaced `declaration` never runs at all —
 * there is no intermediate state a caller synchronously in between two field writes could observe,
 * because there are no longer two field writes. `applyPresentation` becomes ONE assignment,
 * `declaration = declarationFrom(declared);`, and an object reference swap is not divisible the
 * way six sequential statements are.
 *
 * ── WHAT THIS DOES NOT HOLD, AND WHY ──
 *
 * NO SUBSCRIPTION. Nothing here notifies a reader when `applyPresentation` runs — the same PULL
 * discipline `research-the-store.md` §5 invariant 4 names for the eleven surfaces applies here
 * without qualification: a reader takes `declaration` (or one of its fields) as an argument, fresh,
 * the same way `paint()` already takes `presentation`, never as something it subscribed to.
 *
 * NO CACHE OF ANYTHING DERIVED FROM IT. `globalRegistrationFor`/`resolverContextFor`
 * (`app/index.html`) still build their own fresh object literal on every call, per invariant 3 —
 * this value changes what they read FROM, never whether they memoise, and they still do not.
 *
 * NO `problems`. `DeclaredPresentation.problems` is consumed once, by `applyPresentation`'s
 * `console.warn` loop, at the moment a document is read — it is a report about THAT READ, not a
 * fact about the current state of the page, and holding it past that loop would be a stale problem
 * list sitting beside a since-corrected declaration. `declarationFrom` below drops it on purpose.
 *
 * ── THE SENTINEL: "NOT YET DECLARED" IS A DIFFERENT FACT FROM "DECLARED EMPTY" ──
 *
 * `presentationFromDeclaration` never returns `undefined` for `structural`/`qualification`/`rules`
 * — a document that is missing, malformed, or simply absent from the network yields each axis's own
 * `EMPTY` constant (see `structural.ts`/`qualification.ts`/`rules.ts`), because THOSE readers are
 * only ever called with an ACTUAL document, even if that document turns out to be `{}`. But
 * `app/index.html` can be in a state that document never describes: no document has been read yet
 * — before the boot-time `loadPresentation()` resolves, or forever, if its `fetch` throws (that
 * catch block warns and returns without ever calling `applyPresentation` — see `loadPresentation`'s
 * own header). Two resolvers (`resolvers/membership.ts`, `resolvers/promotion.ts`) gate on
 * `declared.qualification === undefined` specifically to mean "nothing has ever answered this
 * question", which `EMPTY` does not mean — `EMPTY` is a real, if content-free, answer.
 * `NOT_YET_DECLARED` below reproduces exactly the values the six original `let`s were initialised
 * to, `undefined` included, so that distinction — never collapsed into `EMPTY` by this change — is
 * carried across the consolidation rather than quietly erased by it.
 */
export interface Declaration {
  readonly context: PresentationContext;
  readonly indentUnit: number;
  readonly landingView: string | undefined;
  readonly structural: StructuralLanguage | undefined;
  readonly qualification: QualificationLanguage | undefined;
  readonly resolution: ConfigResolutionTable | undefined;
  readonly rules: RulesLanguage | undefined;
}

/**
 * The page's declaration before any document has ever been read. Every field reproduces, exactly,
 * what the six `let`s this replaces were each initialised to — an empty `PresentationContext`
 * (every level silent), the engine's own indent-unit literal, and `undefined` for the three axes
 * whose readers `presentationFromDeclaration` has not yet been asked to run. See this file's own
 * header ("THE SENTINEL") for why `undefined` here, and not `EMPTY`, is the fact this state needs.
 */
export const NOT_YET_DECLARED: Declaration = {
  context: new PresentationContext(),
  indentUnit: DEFAULT_INDENT_UNIT,
  landingView: undefined,
  structural: undefined,
  qualification: undefined,
  resolution: undefined,
  rules: undefined,
};

/**
 * The one place a `DeclaredPresentation` (a reading OF a document, plus its problems) becomes a
 * `Declaration` (the page's current, held fact). `applyPresentation` is the only caller — see this
 * file's own header for why the whole of `app/index.html`'s six-`let` replacement is exactly one
 * call to this function followed by exactly one assignment.
 */
export function declarationFrom(declared: DeclaredPresentation): Declaration {
  return {
    context: declared.context,
    indentUnit: declared.indentUnit,
    landingView: declared.landingView,
    structural: declared.structural,
    qualification: declared.qualification,
    resolution: declared.resolution,
    rules: declared.rules,
  };
}

/**
 * WHAT A RESOLVER IS — the one closed interface every local answer this app gives is shaped by.
 *
 * ── WHY THIS MODULE EXISTS ──
 *
 * `app/index.html` knew FOUR resolvers by name. Each needed four hand-written functions on that
 * page (`*ReadingFor`, `*NoteFor`, `*DiagnosticFor`, `update*Badge`, plus an `arm*` for two of
 * them), and `commitLine` named every one of them in sequence. Six more axes are declared and
 * unwired, which at that shape is twenty-four more hand-written functions in a file `tsconfig.json`
 * cannot see: its `include` covers TypeScript sources under `app/` and nothing else, and a
 * `<script type="module">` inside an HTML document is checked by nothing until it runs.
 *
 * THAT BLIND SPOT IS NOT HYPOTHETICAL. `f448da2` shipped `x` and `>`/`<` handlers that hand-built
 * `{ lineIndex, text, markdown }` and left out `kind`/`source` — two fields `LineCommit` (paint.ts)
 * declares REQUIRED, everywhere TypeScript is watching. It was not watching that page. The omission
 * was silent for months, until `armOrderingSettle`'s gate widened and `commit.source` reached
 * `sectionAt` as `undefined`: `undefined.split("\n")` threw inside `commitLine`'s synchronous
 * prefix, in an `async` function neither keydown call site awaited, so the operator's keystroke
 * vanished into an unhandled rejection with no POST and nothing on screen. Fixed in `9bc50ab`; the
 * REASON it could happen at all is fixed here, by moving the code to where the compiler can read it.
 *
 * ── THE INTERFACE, AND HOW IT WAS DERIVED ──
 *
 * It was read off the four that already existed, not designed for them:
 *
 *   `read(ctx)`   ONE evaluation, computed exactly once per commit. Membership, rules and parent
 *                 promotion each already had this and each already said, in their own headers, why:
 *                 two separately-written evaluations of the same question drift apart. Ordering was
 *                 the exception — `orderingNoteFor` and `orderingDiagnosticFor` each recomputed
 *                 `resolveOrderingFor` independently — and porting it onto `read` is the one place
 *                 this restructure removes a duplicate rather than moving one. The functions are
 *                 pure, so the removal is unobservable; see the PR body's own account.
 *   `say(r)`      the freshness-line sentence, or `""` for silence. Only ever a CHANGE is narrated.
 *   `show(r)`     the abstention register's sentence for this resolver's own badge, or `""` for
 *                 "leave the badge showing the last real evaluation".
 *   `arm(ctx, r)` OPTIONAL, and DECLARATIVE: it returns descriptions of what to prime, never a call
 *                 into a surface. See `Arming` below for the fact that forced that shape.
 *
 * ── THE ONE PLACE THE FOUR DID NOT FIT, STATED RATHER THAN BENT ──
 *
 * `armPrediction` (the page, before this) armed `predict` ONCE per commit with the UNION of what
 * the rules axis decided for the committed row and what parent promotion decided for the row above.
 * `PredictSurface.arm` OVERWRITES — so two resolvers each calling it would leave only the second
 * one's claim, and the page's own comment explains that the empty arm must still happen on every
 * commit or a later unrelated repaint reports a live prediction as "withdrawn". A per-resolver
 * `arm` that reached the surface directly therefore could NOT reproduce today's behaviour. So `arm`
 * returns `Arming[]`, the runner concatenates them in registry order, and `armPredict` below makes
 * the single unconditional call. The rule "one surface, one arm per commit" is a property of the
 * SURFACE, not of any resolver, and it now lives where that is true.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ──
 *
 * No DOM. No fetch. No clock — `CommitContext.now` is a reader the page supplies, the same
 * discipline `today.ts` already keeps for itself (`tests/app-today-note.test.mjs` proves it).
 * `Diagnostic` names a badge; it never writes one. The page owns every `document.getElementById`.
 */

import type { LineCommit } from "./paint.js";
import type { QualificationLanguage } from "./qualification.js";
import type { ConfigResolutionTable } from "./resolutiontable.js";
import type { RulesLanguage } from "./rules.js";
import type { StructuralLanguage } from "./structural.js";
import type { GraphSnapshot } from "./graphmatch.js";
import type { RowPlacement } from "./settle.js";
import type { RowPrediction } from "./predict.js";

/**
 * The view a commit was made in, narrowed to exactly what a resolver reads off it.
 *
 * DELIBERATELY NOT the served view object. `sectionOrderFor` (address.ts) takes `{id, sections?}`
 * and nothing in any resolver reads `path`, `title`, `domain` or `markdown` — `path` is the WRITE
 * path's business (`writeFile`), and a resolver that could see it could post.
 */
export interface ViewIdentity {
  readonly id: string;
  readonly sections?: readonly string[];
}

/**
 * The four published declaration axes, each `undefined` until `/presentation.json` has been read.
 *
 * `undefined` IS THE STATE EVERY RESOLVER MUST HANDLE, not an error to guard against once at the
 * top: a page whose declaration fetch timed out still paints, still moves the cursor and still
 * writes, and every rung that needs a declaration abstains rather than guessing. See
 * `loadPresentation`'s own header on the page.
 */
export interface DeclarationSet {
  readonly structural: StructuralLanguage | undefined;
  readonly qualification: QualificationLanguage | undefined;
  readonly resolution: ConfigResolutionTable | undefined;
  readonly rules: RulesLanguage | undefined;
}

/**
 * EVERYTHING A RESOLVER MAY READ, BUILT ONCE PER COMMIT.
 *
 * One object, assembled by the page at the top of `commitLine`, handed to every resolver in the
 * registry. A resolver cannot reach page state that is not on it, which is what makes "walk the
 * registry" a complete description of what happens rather than an outline of it.
 */
export interface CommitContext {
  readonly view: ViewIdentity;
  readonly commit: LineCommit;
  readonly declared: DeclarationSet;
  /**
   * The live graph, narrowed to the `{nodes, edges}` shape `graphmatch.ts` needs, or `null` when
   * the graph has not been read yet (or was read and carries neither array — the D1-fallback shape
   * a brand-new account gets). NEVER a fetch: the page reads what it is holding and hands it over.
   */
  readonly graph: GraphSnapshot | null;
  /**
   * "NOW", AS A READER RATHER THAN A VALUE, AND THE DIFFERENCE MATTERS. A value would be read on
   * every commit, including the ones no resolver asks the time for; a reader is called exactly
   * where `Date.now()` was called before this module existed — inside the rules axis, after its own
   * gates, once. The page supplies `() => Date.now()`; nothing in `app/present/` reads the clock.
   */
  readonly now: () => number;
}

/**
 * THE GRAPH AS THE WIRE ACTUALLY DELIVERS IT — everything on the path from the page's own
 * `graphData` down to the two arrays a resolver needs, each step honestly optional.
 *
 * `snapshot: null` is a real shape a brand-new account gets (the D1 fallback in
 * `worker/src/app.js`), not a defect, which is why every rung here tolerates it.
 */
export interface GraphPayload {
  readonly snapshot?: { readonly graph?: { readonly nodes?: unknown; readonly edges?: unknown } | null } | null;
}

/**
 * `graphData.snapshot.graph`, narrowed to exactly the `{nodes, edges}` shape `graphmatch.ts` needs
 * — `null` when the graph has not been read yet, or was read and carries neither array.
 *
 * THE ELEMENT SHAPES ARE TRUSTED, AND THE ASSERTION SAYS SO OUT LOUD. This checks that both keys
 * hold arrays and does not walk them; the page's own version did exactly the same, and validating
 * every node on every commit would be a per-keystroke cost paid to catch a server that has never
 * been wrong. Where the trust lives is now one line a reviewer can find, rather than an implication.
 */
export function graphSnapshotOf(graphData: GraphPayload | null | undefined): GraphSnapshot | null {
  const graph = graphData?.snapshot?.graph;
  if (graph === undefined || graph === null) {
    return null;
  }
  const { nodes, edges } = graph;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return null;
  }
  return { nodes: nodes as GraphSnapshot["nodes"], edges: edges as GraphSnapshot["edges"] };
}

/**
 * WHAT THE RESOLVER WAS ASKED TO CONSULT, AND WHAT IT ACTUALLY COULD.
 *
 * ── THE MEASUREMENT THAT FORCED THIS TO BE A FIRST-CLASS STATE ──
 *
 * For one freshly typed `- [ ] something #task` in the operator's inbox, the published rule table
 * holds 25 rules. One fires. SEVEN are structurally undecidable in a browser — their `for_each`
 * pattern carries a one-hop `children:`/`parents:` edge step this app has no graph walk for. Two
 * match and their `when` is false. Fifteen do not match. The browser then prints "rules: decided".
 *
 * `applyRules` is honest about this and always has been: `RulePassResult.undecidable` names every
 * skipped rule id. The loss is at the READER — the old `rulesReadingFor` surfaced `undecidable`
 * ONLY when `applied.length === 0`, which is unreachable the moment any rule fires. So 28% of the
 * table went unconsulted and the register said a verdict was reached.
 *
 * ── WHY IT IS ON THE ANSWER AND NOT A FOURTH `kind` ──
 *
 * "Decided" and "could not consult everything" are ORTHOGONAL, not adjacent points on one scale. A
 * resolver can answer correctly and completely (membership), answer correctly having skipped part
 * of what it was asked (rules, promotion), or answer while the layer beneath it dropped what it
 * could not read WITHOUT SAYING SO (ordering — see `"unknown"` below). A fourth `kind` would force
 * every reader of `kind === "answer"` to learn a new state it does not care about; a field on the
 * answer lets the badge keep printing what it prints today and lets a later, separately reviewable
 * change surface it.
 *
 * THIS PR MAKES THE STATE EXPRESSIBLE AND DOES NOT SURFACE IT. Every badge string is byte-identical
 * to what shipped before it. `show()` does not read `coverage`. It is read by
 * `tests/app-resolver-registry.test.mjs`, which is what keeps this from being a declaration that
 * exists and does not reach.
 */
export type Coverage =
  /** Every unit this resolver was asked to consult, it consulted. */
  | { readonly kind: "complete" }
  /**
   * An answer WAS reached, and these named units were never consulted at all. Named, never
   * counted: a reader that cannot say WHICH rules went unasked cannot act on the fact.
   */
  | { readonly kind: "partial"; readonly unconsulted: readonly string[] }
  /**
   * THE RESOLVER CANNOT SAY, AND WILL NOT CLAIM "COMPLETE" TO FILL THE SLOT. Reserved for a layer
   * beneath the resolver that drops what it could not read without reporting it — `orderingFor`
   * (ordering.ts) ranks the edited line against `siblings.push` only where `tupleFor` returned a
   * value, so a sibling whose marker cannot be read is silently absent from the ranking and the
   * count of those never leaves that function. Saying "complete" for ordering would be a lie; this
   * says the true thing instead. Closing it is a change to `ordering.ts`, out of scope here.
   */
  | { readonly kind: "unknown"; readonly because: string };

/** The answer consulted everything it was asked to. */
export const COMPLETE: Coverage = { kind: "complete" };

/** `undecidable` (the pass results in rules.ts / graphmatch.ts) as a `Coverage` — empty is complete. */
export function coverageOf(unconsulted: readonly string[]): Coverage {
  return unconsulted.length === 0 ? COMPLETE : { kind: "partial", unconsulted };
}

/**
 * AN ANSWER, AN ABSTENTION, OR NOT-EVALUATED — the three-way shape all four existing resolvers
 * already had, named once instead of four times.
 *
 * `"not-evaluated"` is a PRECONDITION this resolver never got to judge (no declaration loaded, the
 * commit is the wrong kind, the cursor is outside any published section) — deliberately distinct
 * from `"abstains"`, which is a refusal the resolver DID make and can name a reason for. The
 * distinction is why `show()` writes nothing for the first and a sentence for the second: a gesture
 * a resolver was never asked about must not overwrite the answer to one it was.
 *
 * `Answer` is INTERSECTED onto the answer arm rather than nested under an `answer` key, so each
 * resolver's reading keeps the exact flat shape it had before this module existed and every
 * assertion already written against those readings still reads the same fields.
 */
export type Reading<Answer extends object, Because extends string = string> =
  | { readonly kind: "not-evaluated" }
  | { readonly kind: "abstains"; readonly because: Because }
  | ({ readonly kind: "answer"; readonly coverage: Coverage } & Answer);

/** The one `"not-evaluated"` value, shared — there is nothing to distinguish two of them. */
export const NOT_EVALUATED = { kind: "not-evaluated" } as const;

/**
 * A SURFACE TO PRIME, DESCRIBED RATHER THAN CALLED.
 *
 * `arm` returns these; the runner collects them; `armSettle`/`armPredict` below make the calls. See
 * this module's header for the fact that forced the indirection — `PredictSurface.arm` overwrites,
 * and two resolvers contribute to ONE arm.
 */
export type Arming =
  | { readonly surface: "settle"; readonly placement: RowPlacement }
  | { readonly surface: "predict"; readonly prediction: RowPrediction };

/** What `show()` decided, addressed to the element that shows it. Never a DOM write. */
export interface Diagnostic {
  /** The element id on the page. The page looks it up; this module never does. */
  readonly badge: string;
  readonly text: string;
  /**
   * Which of the two badge classes applies. Derived from the sentence, exactly as the four
   * hand-written `update*Badge` functions each derived it (`text.startsWith("<id>: abstained")`) —
   * one rule now, in one place, instead of four copies of the same prefix.
   */
  readonly abstained: boolean;
}

/**
 * ONE RESOLVER, WRITTEN OUT. The type `defineResolver` closes over; the shape a tenth axis fills in.
 */
export interface ResolverSpec<R> {
  /** The register's own name — also the prefix `show()`'s sentences carry. */
  readonly id: string;
  /** The page element this resolver's diagnostic is written to. */
  readonly badge: string;
  /** ONE evaluation, per commit, that `say`/`show`/`arm` all read. Pure. */
  read(ctx: CommitContext): R;
  /** The freshness-line sentence, or `""` for silence. */
  say(reading: R): string;
  /** The abstention register's sentence, or `""` for "do not touch the badge". */
  show(reading: R): string;
  /** What to prime before the optimistic repaint. Absent when this axis primes nothing. */
  arm?(ctx: CommitContext, reading: R): readonly Arming[];
}

/** What one resolver produced for one commit. */
export interface ResolverRun {
  readonly id: string;
  readonly note: string;
  readonly diagnostic: Diagnostic | null;
  readonly armings: readonly Arming[];
}

/**
 * A RESOLVER AS THE REGISTRY HOLDS IT — the reading type ERASED, on purpose.
 *
 * `ResolverSpec<R>` has `R` in both an output position (`read`) and an input one (`say`), so an
 * array of specs could only be typed by making `R` `unknown` (which no spec satisfies) or by
 * relying on TypeScript's bivariant method checking (which is unsound). `defineResolver` closes
 * over `R` inside one function instead: every spec is checked against its OWN reading type at the
 * point it is written, and what the registry holds is the erased result. No `any`, no cast.
 */
export interface Resolver {
  readonly id: string;
  run(ctx: CommitContext): ResolverRun;
}

/** `show()`'s answer, addressed — `null` when the resolver said nothing and the badge stands. */
export function diagnosticOf<R>(spec: ResolverSpec<R>, reading: R): Diagnostic | null {
  const text = spec.show(reading);
  if (text === "") {
    return null;
  }
  return { badge: spec.badge, text, abstained: text.startsWith(`${spec.id}: abstained`) };
}

/**
 * THE SINGLE POINT OF ENTRY — the seam a later leg publishes the registry through.
 *
 * ── THE SEAM, STATED AS A COMMENT AND NOT AS A FILE ──
 *
 * The registry is an ordered array in TypeScript today (`resolvers/registry.ts`). A later leg
 * publishes that order from config, so the engine and the browser read ONE declaration instead of
 * two hand-kept lists. When that lands, the change is: `registry.ts` reads the published order and
 * maps it onto specs THROUGH THIS FUNCTION. Nothing else moves — not `runResolvers`, not any spec,
 * not the page.
 *
 * NOTHING IS PUBLISHED AHEAD OF A READER, DELIBERATELY. This system's highest-frequency defect is a
 * declaration that exists and does not reach — a generated file, a config key, an exported constant
 * nothing consumes, all of which look like progress and are not. So there is no config key for the
 * registry order yet, no generator, and no placeholder declaration file. There is one function
 * every resolver already goes through, which is what a seam is.
 */
export function defineResolver<R>(spec: ResolverSpec<R>): Resolver {
  return {
    id: spec.id,
    run(ctx: CommitContext): ResolverRun {
      // ONE READ, THREE READERS — the tie every one of the ported resolvers states in its own
      // header. Two separately written evaluations of the same question drift apart; this is what
      // stops there being two.
      const reading = spec.read(ctx);
      return {
        id: spec.id,
        note: spec.say(reading),
        diagnostic: diagnosticOf(spec, reading),
        armings: spec.arm === undefined ? [] : spec.arm(ctx, reading),
      };
    },
  };
}

/** Everything one commit's walk produced, joined but not yet applied to anything. */
export interface CommitOutcome {
  /** Per resolver, in registry order — kept so a caller can ask what ONE axis said. */
  readonly runs: readonly ResolverRun[];
  /** The non-empty sentences, in registry order. The page joins them; this does not. */
  readonly notes: readonly string[];
  /** The badges to write, in registry order. The page writes them; this does not. */
  readonly diagnostics: readonly Diagnostic[];
  readonly placements: readonly RowPlacement[];
  readonly predictions: readonly RowPrediction[];
}

/**
 * WALK THE REGISTRY. The whole of what a commit decides, locally, before the write leaves.
 *
 * ── ORDER, AND EXACTLY WHERE IT IS LOAD-BEARING ──
 *
 * Every resolver's `read` is PURE and reads only `ctx`, which this function never mutates — so no
 * resolver can see another's answer and the WALK is order-independent. What is order-DEPENDENT is
 * the output, and only in ways the operator can see: `notes` are joined into one sentence in this
 * order, and `predictions` reach `PredictSurface.arm` as one list in this order. Both are declared
 * by `RESOLVERS`' own array order and by nothing else. See `tests/app-resolver-registry.test.mjs`
 * for the falsifier that a shuffled registry changes those two outputs and nothing else.
 */
export function runResolvers(resolvers: readonly Resolver[], ctx: CommitContext): CommitOutcome {
  const runs: ResolverRun[] = [];
  const notes: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const placements: RowPlacement[] = [];
  const predictions: RowPrediction[] = [];
  for (const resolver of resolvers) {
    const run = resolver.run(ctx);
    runs.push(run);
    if (run.note !== "") {
      notes.push(run.note);
    }
    if (run.diagnostic !== null) {
      diagnostics.push(run.diagnostic);
    }
    for (const arming of run.armings) {
      if (arming.surface === "settle") {
        placements.push(arming.placement);
      } else {
        predictions.push(arming.prediction);
      }
    }
  }
  return { runs, notes, diagnostics, placements, predictions };
}

/** `SettleSurface`'s arming half, narrowed — this module never holds the surface itself. */
export interface SettleArm {
  arm(source: string, view: string, placement: RowPlacement): void;
}

/** `PredictSurface`'s arming half, narrowed — same reason. */
export interface PredictArm {
  arm(source: string, view: string, predictions: readonly RowPrediction[]): void;
}

/**
 * ARM THE SETTLE SURFACE — ONLY when a resolver produced a placement.
 *
 * A placement left un-rearmed keeps describing the same still-correct claim, so there is no empty
 * arm here and never was. `base` is `commit.markdown`, the string the optimistic repaint is about
 * to paint INTO — arming against anything else describes a paint that has already happened by the
 * time `SettleSurface.take` could match it.
 */
export function armSettle(
  surface: SettleArm,
  base: string | null,
  viewId: string,
  placements: readonly RowPlacement[],
): void {
  if (base === null) {
    return;
  }
  for (const placement of placements) {
    surface.arm(base, viewId, placement);
  }
}

/**
 * ARM THE PREDICT SURFACE — UNCONDITIONALLY, even with an empty list, and that is the difference
 * from `armSettle` above rather than an inconsistency with it.
 *
 * Leaving a stale, unrelated arm in place lets a LATER, unrelated commit's own optimistic repaint
 * reconcile it: `PredictSurface.take` sees a new source and reports a still-pending claim as
 * "withdrawn" when nothing has contradicted it. A false accusation, not a lesser one. See
 * `predict.ts`'s own header, which names this page's `armPrediction` as the reason it says so.
 */
export function armPredict(
  surface: PredictArm,
  base: string | null,
  viewId: string,
  predictions: readonly RowPrediction[],
): void {
  if (base === null) {
    return;
  }
  surface.arm(base, viewId, predictions);
}

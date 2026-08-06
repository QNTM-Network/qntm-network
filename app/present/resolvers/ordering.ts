/**
 * THE ORDERING RESOLVER — after this commit, will the line sort to a different position within its
 * section, and where does it belong?
 *
 * Design-the-resolution-architecture.md step 7 (L5 EVALUATION) and roadmap-the-road-ahead.md step 3
 * (the PLACEMENT half). Ported from `app/index.html`'s `orderingNoteFor`/`orderingDiagnosticFor`/
 * `updateOrderingBadge`/`armOrderingSettle` with no behaviour change.
 *
 * ── THE ONE THING THIS PORT CHANGES, AND WHY IT IS NOT A BEHAVIOUR CHANGE ──
 *
 * Ordering was the ONLY one of the four axes with no `*ReadingFor`: `orderingNoteFor` and
 * `orderingDiagnosticFor` each called `resolveOrderingFor` independently, with identical arguments,
 * and each threw the other's answer away. `read` below is called once and both readers share it.
 * `resolveOrderingFor` is PURE — no clock, no DOM, no fetch, no mutation of its arguments — so one
 * call and two calls cannot differ in what they return. Everything the page put on screen is
 * unchanged; what is gone is a second identical evaluation of the same question.
 *
 * ── SAY IT, NEVER MOVE IT — AND THEN, SEPARATELY, MOVE IT ──
 *
 * `say`/`show` narrate. Nothing they call touches the painter's row order: `resolveOrderingFor` is
 * pure and produces no `Contribution` and no `SourceEdit`. `arm` is the placement half, and it is
 * still not a write — it primes `SettleSurface`, which the next optimistic repaint reads.
 *
 * ── TWO KINDS, TWO GATES, IN `arm` ──
 *
 *   `"set-line"`: gated on `placement.moved` — the row's rank BEFORE this edit against its rank
 *   AFTER, which is the right question exactly when a real "before" exists and the file's physical
 *   order already agreed with it.
 *
 *   `"insert-line"`: a row with no before-state has no rank to compare, so `moved` is trivially
 *   `false` for EVERY insert — which was a silent no-op, not a refusal: the placement was computed
 *   correctly every time and discarded. `currentBeforeLineIndex` (the row's ACTUAL neighbour, read
 *   at the same moment its CORRECT one is computed) makes "is the row where it belongs" answerable
 *   for a row that was never edited at all, only just typed.
 *
 * `arm` READS `commit.markdown` FOR AN INSERT AND `commit.source` FOR A SET, DELIBERATELY.
 * `commit.source` is the file BEFORE the insertion, so `source.split("\n")[lineIndex]` is a
 * different, unrelated line about to be pushed down. `commit.markdown` already holds the new row at
 * that index. A `"set-line"` keeps reading `commit.source` — the row is already there, and that is
 * the base `say`'s own note was computed against, so the two stay in agreement about "before".
 *
 * ── COVERAGE IS `unknown` HERE, AND THAT IS A FINDING RATHER THAN A DEFAULT ──
 *
 * `orderingFor` (ordering.ts) builds its ranking with `if (tuple !== undefined) siblings.push(...)`
 * — a sibling whose ordering marker cannot be read is silently ABSENT from the ranking that decides
 * `moved`. `OrderingAnswer.siblingCount` reports how many WERE ranked and nothing reports how many
 * were not, so this resolver cannot name what went unconsulted without a change to `ordering.ts`.
 * Claiming `complete` would be a lie about a measurement never taken; `unknown` is the true state.
 *
 * ── 2026-08-06: THE DEFAULT/TITLE PATH'S OWN QUALIFYING CLASSIFIER ──
 *
 * `resolveOrderingFor`/`resolveOrderingPlacementFor` each take an OPTIONAL last parameter, a plain
 * `(lineIndex) => boolean | undefined` that lets the default/title path narrow its `nested-section`
 * refusal (`ordering.ts`'s own header, and `orderingqualify.ts`'s). This is the ONE place that
 * parameter is built and supplied — `ordering.ts` stays graph-free; this resolver already holds
 * `ctx.graph` (`promotion.ts` reads it too, for the identical reason) and `ctx.declared.structural`
 * (for the same `edgeSourceOfFor` `promotion.ts` builds). `classifierFor`, below, returns
 * `undefined` — no classifier — the instant the graph has not loaded, which reproduces the
 * PRE-2026-08-06 behaviour exactly for every commit made before the graph is available.
 */

import { sectionAt, sectionOrderFor } from "../address.js";
import { resolveOrderingFor, resolveOrderingPlacementFor } from "../arrange/ordering.js";
import type { OrderingAbstention, OrderingAnswer, QualifyingClassifier } from "../arrange/ordering.js";
import { qualifyingClassifierFor } from "../arrange/orderingqualify.js";
import { edgeSourceOfFor } from "./promotion.js";
import type { Arming, CommitContext, Coverage, Reading, ResolverSpec } from "../resolve.js";
import { NOT_EVALUATED } from "../resolve.js";

/**
 * The default/title path's own qualifying-vs-context signal, built from whatever this commit's
 * `ctx` already holds — `undefined` (no narrowing; `ordering.ts`'s original behaviour) when the
 * graph has not loaded yet, or when `qualification` said nothing usable for this exact section
 * (`qualifyingClassifierFor`'s own gate — see that function's header for the current count of
 * sections this reaches). `source` is whichever text `resolveOrderingFor`/
 * `resolveOrderingPlacementFor` are about to be called against — `read` and `arm` address a
 * DIFFERENT string for an insert (see `arm`'s own comment below), so this is built fresh at each
 * call site rather than once, the same "recompute rather than trust a shared cache" posture
 * `orderingPlacementFor` itself takes for `moved`.
 */
function classifierFor(
  ctx: CommitContext,
  viewId: string,
  sectionId: string,
  source: string,
): QualifyingClassifier | undefined {
  const { qualification, structural } = ctx.declared;
  if (qualification === undefined || ctx.graph === null) {
    return undefined;
  }
  return qualifyingClassifierFor(source.split("\n"), viewId, sectionId, qualification, ctx.graph, edgeSourceOfFor(structural));
}

/**
 * WHY THIS RESOLVER CANNOT SAY WHAT IT DID NOT CONSULT — one constant, so the reason is stated
 * once and a reader who wants it fixed knows exactly which function to change.
 */
const SIBLINGS_DROPPED_UNREPORTED: Coverage = {
  kind: "unknown",
  because: "ordering-drops-unreadable-siblings-without-reporting-them",
};

/** The rank answer, plus the operator's own words for the section it is about. */
export interface OrderingMove {
  readonly answer: OrderingAnswer;
  /** `resolution.ordering[view][section].name`, or the section id when the config carries no name. */
  readonly sectionName: string;
}

export type OrderingCommitReading = Reading<OrderingMove, OrderingAbstention>;

export const orderingSpec: ResolverSpec<OrderingCommitReading> = {
  id: "ordering",
  badge: "orderingBadge",

  read(ctx: CommitContext): OrderingCommitReading {
    const { view, commit } = ctx;
    const { qualification, resolution } = ctx.declared;
    if (resolution === undefined || qualification === undefined || commit.kind !== "set-line") {
      return NOT_EVALUATED;
    }
    const sectionOrder = sectionOrderFor(view, qualification.sectionOrder);
    const sectionId = sectionAt(commit.source, commit.lineIndex, view.id, sectionOrder);
    if (sectionId === null) {
      return NOT_EVALUATED;
    }
    // `resolveOrderingFor`, NOT `orderingFor` directly. Routes to `orderingFor` unchanged for the
    // sections that declare `ordering`/`orderingMode`, and to `defaultOrderingFor` for every OTHER
    // section — `due_date`/`priority`/`title`, the engine's own fallback (`section_builder.py`'s
    // `_DEFAULT_ORDERING`), not a browser guess. This is what makes an edit to an undeclared
    // section (his inbox, `dev/qntm/backlog`, most of his vault) say anything at all.
    const reading = resolveOrderingFor(
      view.id,
      sectionId,
      commit.source,
      commit.lineIndex,
      commit.text,
      resolution.ordering,
      resolution.orderingFields,
      resolution.defaultOrdering,
      resolution.priorityRank,
      classifierFor(ctx, view.id, sectionId, commit.source),
    );
    if (reading.kind === "abstains") {
      return { kind: "abstains", because: reading.because };
    }
    return {
      kind: "answer",
      coverage: SIBLINGS_DROPPED_UNREPORTED,
      answer: reading.answer,
      sectionName: resolution.ordering[view.id]?.[sectionId]?.name ?? sectionId,
    };
  },

  say(reading: OrderingCommitReading): string {
    if (reading.kind !== "answer" || !reading.answer.moved) {
      return "";
    }
    return `this line will move within ${reading.sectionName}`;
  },

  show(reading: OrderingCommitReading): string {
    // EVERY SECTION NOW GETS A WORD. Before `resolveOrderingFor` existed, 177 of 186 sections
    // declared no `ordering:` and `no-section-declaration` reached exactly as far as a `return ""`
    // — indistinguishable from "nothing changed". A section declaring `orderingMode:
    // insertion_order` abstains on EVERY edit, forever, and said nothing about it until this
    // register existed.
    if (reading.kind === "not-evaluated") {
      return "";
    }
    if (reading.kind === "abstains") {
      return `ordering: abstained — ${reading.because}`;
    }
    return "ordering: decided";
  },

  /**
   * THE PLACEMENT — computed from `ctx`, NOT from `reading`, and that asymmetry is real rather than
   * an oversight. `read` answers "did the rank change" (`resolveOrderingFor`); this answers "which
   * row does it now sit before" (`resolveOrderingPlacementFor`) — a different published function
   * against a different address source for an insert. The two questions do not reduce to one, so
   * `arm` takes the context and asks its own. It is still PURE, and it still runs exactly once per
   * commit, which is what the shared-reading rule is actually protecting.
   */
  arm(ctx: CommitContext): readonly Arming[] {
    const { view, commit } = ctx;
    const { qualification, resolution } = ctx.declared;
    if (resolution === undefined || qualification === undefined || commit.markdown === null) {
      return [];
    }
    const sectionOrder = sectionOrderFor(view, qualification.sectionOrder);
    const addressSource = commit.kind === "insert-line" ? commit.markdown : commit.source;
    const sectionId = sectionAt(addressSource, commit.lineIndex, view.id, sectionOrder);
    if (sectionId === null) {
      return [];
    }
    const reading = resolveOrderingPlacementFor(
      view.id,
      sectionId,
      addressSource,
      commit.lineIndex,
      commit.text,
      resolution.ordering,
      resolution.orderingFields,
      resolution.defaultOrdering,
      resolution.priorityRank,
      classifierFor(ctx, view.id, sectionId, addressSource),
    );
    if (reading.kind !== "answer") {
      return [];
    }
    const needsPlacement =
      commit.kind === "insert-line"
        ? reading.placement.currentBeforeLineIndex !== reading.placement.beforeLineIndex
        : reading.placement.moved;
    if (!needsPlacement) {
      return [];
    }
    return [
      {
        surface: "settle",
        placement: { lineIndex: commit.lineIndex, beforeLineIndex: reading.placement.beforeLineIndex },
      },
    ];
  },
};

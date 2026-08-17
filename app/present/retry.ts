/**
 * PromotionRetrySurface — WHICH ROW'S PROMOTION MOST RECENTLY ABSTAINED FOR A GRAPH-RELATED
 * REASON, SO A LATER GRAPH REFRESH CAN GIVE IT A SECOND CHANCE.
 *
 * PURE: no DOM, no fetch, no clock — the same discipline `predict.ts` and `settle.ts` each state
 * for themselves, restated here rather than invented fresh (see `predict.ts`'s own header, which
 * this class deliberately mirrors).
 *
 * ── WHAT THIS CLOSES ──
 *
 * `docs/architecture/classes.yaml`'s `graph-aware-resolution-reads-one-modelled-graph` names the
 * gap directly: promotion's own `structuralNodeCandidateFor` (`resolvers/promotion.ts`) correctly
 * abstains `graph-not-loaded`/`child-not-in-graph`/`parent-not-in-graph` when the browser's graph
 * cache has not caught up with a just-typed child yet — an HONEST abstain, not a bug in that
 * resolver. But NOTHING RE-EVALUATES IT once the cache does catch up (`app/present/graph.ts`'s
 * `refreshGraphBlob` resolving with genuinely fresh data). `PredictSurface` already reconciles an
 * ARMED prediction against newer source text on the next repaint — but an abstain arms an EMPTY
 * prediction list, which `PredictSurface.take` correctly treats as nothing pending (see that
 * class's own header for why an empty arm still has to happen on every commit). There is nothing
 * for `PredictSurface` to reconcile, because promotion never got far enough to have an opinion.
 * This class is the thing that remembers "promotion was ASKED and could not answer YET" long
 * enough for a later graph refresh to ask it again.
 *
 * ── ONE PENDING RETRY, THE SAME REASON `PredictSurface` HOLDS ONE ARMED INSTRUCTION ──
 *
 * A second commit before the first one's retry has even been attempted describes a NEWER state of
 * the view, and the newer one is the only one worth holding — `predict.ts`'s own header states the
 * identical reasoning for its own single slot ("the same reason there is one cursor"). `arm`
 * always overwrites.
 *
 * ── WHY THERE IS NO EXPLICIT "CLEAR ON SUPERSESSION" STEP ──
 *
 * `settle.ts` and `predict.ts` both have to actively discard a stale entry because each is read on
 * EVERY repaint, including ones that have nothing to do with the row that armed them — a stale
 * entry left in place would be misread as live. This class is read only from ONE place, at the
 * moment a graph refresh resolves fresh, and `pending(source, view)` compares the EXACT source
 * string and view still on screen at THAT moment — `predict.ts`'s own "matches by exact source
 * string" discipline, reused rather than reinvented. A commit made after the abstain changes
 * `source` (a real edit always does, or `commitLine` would not have called `runResolvers` at all —
 * see `commit.ts`'s own early return on `commit.markdown === null`), so a stale pending retry can
 * never match a later `pending()` call by construction: the source it was armed against is no
 * longer the source on screen. `clear()` exists for the one caller that DOES need to say "this
 * retry is done" — a successful retry, which arms a real prediction and must not fire a second
 * time for the identical claim on the NEXT graph refresh.
 */

import type { LineCommit } from "./paint.js";
import { promotionSpec } from "./resolvers/promotion.js";
import { armPredict } from "./resolve.js";
import type { CommitContext, PredictArm } from "./resolve.js";

export class PromotionRetrySurface {
  #source: string | null = null;
  #view = "";
  #commit: LineCommit | null = null;

  /**
   * Promotion abstained for `commit` (committed against `view`, producing `source` —
   * `commit.markdown`, the same base `armPredict`/`armSettle` key against) for a graph-related
   * reason. Overwrites whatever was pending before — see this class's own header.
   */
  arm(source: string, view: string, commit: LineCommit): void {
    this.#source = source;
    this.#view = view;
    this.#commit = commit;
  }

  /**
   * The commit pending retry for the EXACT `source`/`view` still on screen, or `null` when there
   * is nothing pending, the pending retry belongs to a different view, or the operator has typed
   * something else since — see this class's own header for why a source mismatch alone is enough
   * to treat a pending retry as stale, with no separate staleness check. Does not clear: a retry
   * that still cannot decide (the fresh graph still does not carry the row it needs) stays pending
   * for the NEXT graph refresh, exactly as an honest abstain would if it were asked again by hand.
   */
  pending(source: string, view: string): LineCommit | null {
    if (this.#source !== source || this.#view !== view) {
      return null;
    }
    return this.#commit;
  }

  /** The retry decided (armed a real prediction) or the operator moved on some other way this
   * class was not built to detect on its own. Nothing left pending for a later refresh to find. */
  clear(): void {
    this.#source = null;
    this.#view = "";
    this.#commit = null;
  }
}

/**
 * THE THREE ABSTENTION REASONS THIS SURFACE EXISTS TO GIVE A SECOND CHANCE TO — read directly off
 * `resolvers/promotion.ts`'s own `structuralNodeCandidateFor` (`"graph-not-loaded"`, and
 * `${notFoundPrefix}-not-in-graph` for `notFoundPrefix` in `"parent" | "child"`), restated as a
 * literal set here rather than re-derived, because promotion's own module exports no constant
 * naming them — see that function's own header for why each is an HONEST abstain rather than a
 * defect, and therefore each is exactly the shape a later graph refresh can resolve without the
 * operator doing anything.
 */
export const GRAPH_RETRYABLE_ABSTENTIONS: ReadonlySet<string> = new Set([
  "graph-not-loaded",
  "parent-not-in-graph",
  "child-not-in-graph",
]);

/**
 * createRetryPromotion — THE ONE PLACE A RETRIED PROMOTION REACHES `predict`, THE SAME REASON
 * `commit.ts`'s `createCommitLine` IS THE ONE PLACE A FRESH COMMIT DOES.
 *
 * ── WHY THIS IS A SEPARATE FACTORY, NOT A METHOD ON `commitLine`'S OWN PATH ──
 *
 * `tests/app-predict-wiring.test.mjs` §6 pins `armPredict` to EXACTLY ONE call site inside
 * `commit.ts` and ZERO inside `app/index.html` — the write-path-cleanliness invariant this bundle
 * has kept since `armPredict` itself was relocated out of the page (2026-08-07). A retry is a
 * SECOND, LATER trigger for the identical surface (see `PromotionRetrySurface`'s own header: a
 * graph refresh landing fresh, not a commit), so it earns a SECOND call site rather than being
 * folded into `commit.ts`'s — but that second call site belongs under `app/present/`, inside the
 * capture filter, the same reason `commitLine` itself moved there: a page-level function calling
 * `armPredict` directly would have made this the ONE new page-level exception to an invariant
 * `app-predict-wiring.test.mjs` grep-checks by file, and the point of that grep is that there is
 * never a second place to remember the rule from.
 *
 * ── THE SHAPE, MATCHING `commit.ts`'S OWN ──
 *
 * `promotionSpec` and `armPredict` are imported DIRECTLY, real module-to-module calls, the same
 * reason `commit.ts` imports `RESOLVERS`/`runResolvers`/`armSettle`/`armPredict` directly rather
 * than through `deps` (see that module's own header). Everything this function needs FROM THE
 * PAGE and cannot hold itself — which view is on screen, what source is painted for it, and how to
 * repaint once a retry succeeds — arrives as `deps`, exactly as `CommitLineDeps` carries what
 * `commitLine` cannot hold.
 */

/** The view a retry reads against, narrowed to what `promotionSpec.read` needs — `CommitContext`'s
 * own `ViewIdentity` restated here rather than imported, so this module's public surface does not
 * force a caller to import a type from `resolve.ts` just to describe "the view on screen". */
export interface RetryPromotionView {
  readonly id: string;
  readonly sections?: readonly string[];
}

export interface RetryPromotionDeps {
  /** The pending-retry tracker itself — a page-constructed `PromotionRetrySurface`, the same
   * "constructed once, held by the page" posture `settle`/`predict`/`queued` already have. */
  readonly retrySurface: PromotionRetrySurface;
  /** `resolverContextFor(view, commit)`, unmoved, on the page — the identical dep `commit.ts`'s
   * own `CommitLineDeps.buildContext` is, for the identical reason (`declaration`/`graphData`/the
   * graph cache are page `let`s this module cannot read directly). */
  buildContext(view: RetryPromotionView, commit: LineCommit): CommitContext;
  readonly predict: PredictArm;
  /** The view currently on screen, or `null` when nothing is — a live read, like `buildContext`
   * above: `currentViewId` is a page `let`, reassigned on every view change. */
  currentView(): RetryPromotionView | null;
  /** The source currently painted for that view — `paintedSource`, a live read for the identical
   * reason. This is the string `PromotionRetrySurface.pending` matches the armed retry against. */
  paintedSource(): string;
  /** Repaint the current view — `() => paintView(currentViewId, "arrived")` on the page, called
   * ONLY once a retry arms a real prediction, so `PredictSurface.take` has a repaint to answer. */
  repaint(): void;
}

/**
 * Build the page's retry attempt — called once, at page scope, the identical pattern
 * `createCommitLine(deps)` establishes. The returned function takes no arguments: every fact it
 * needs about "right now" is read through `deps` at call time, never captured at construction.
 */
export function createRetryPromotion(deps: RetryPromotionDeps): () => void {
  /**
   * THE GRAPH REFRESH LANDED FRESH — GIVE WHATEVER `promotionRetry` IS HOLDING A SECOND CHANCE.
   *
   * MATCHED AGAINST THE EXACT SOURCE STILL ON SCREEN (`deps.paintedSource()`) — see
   * `PromotionRetrySurface.pending`'s own header: if the operator has typed anything else since
   * the abstain, this returns `null` and the stale retry is discarded, never applied.
   *
   * A NAMED FUNCTION DECLARATION, RETURNED — the identical reason `commit.ts`'s own header gives
   * for `commitLine`: flow-trace's TS transform recovers a name for a `FunctionDeclaration`
   * regardless of nesting.
   */
  function retryPromotion(): void {
    const view = deps.currentView();
    if (view === null) {
      return;
    }
    const pending = deps.retrySurface.pending(deps.paintedSource(), view.id);
    if (pending === null) {
      return;
    }
    // ONE CONTEXT, READ AND ARMED FROM THE SAME BUILD — `defineResolver`'s own `run(ctx)` does the
    // identical thing (`resolve.ts`), for the identical reason: two separately-built contexts for
    // one retry could disagree about what `ctx.graph` held between the two calls.
    const ctx = deps.buildContext(view, pending);
    const reading = promotionSpec.read(ctx);
    if (reading.kind !== "answer" || reading.applied.length === 0) {
      // STILL CANNOT DECIDE — the fresh graph does not carry what this retry needs yet (or carries
      // it but the rule genuinely does not fire). Left pending: see `PromotionRetrySurface`'s own
      // header for why nothing here clears it in this branch.
      return;
    }
    // `promotionSpec.arm` IS DECLARED OPTIONAL BY `ResolverSpec<R>` (some specs have none) BUT
    // PROMOTION'S OWN IS ALWAYS PRESENT — `defineResolver`'s own `run(ctx)` (resolve.ts) makes the
    // identical check for the identical reason, so the type is honoured here rather than asserted
    // past.
    if (promotionSpec.arm === undefined) {
      return;
    }
    const armed = promotionSpec.arm(ctx, reading);
    if (armed.kind !== "answer") {
      return;
    }
    const predictions = armed.armings
      .filter((arming) => arming.surface === "predict")
      .map((arming) => arming.prediction);
    if (predictions.length === 0) {
      return;
    }
    // FED INTO `predict` THE EXACT SAME WAY A FRESH COMMIT'S OWN `armPredict` CALL ALREADY IS
    // (`commit.ts`) — same function, same `base`/`viewId`/`predictions` shape — so it repaints
    // through the existing, already-tested `PredictSurface` path and not a second one.
    armPredict(deps.predict, pending.markdown, view.id, predictions);
    deps.retrySurface.clear();
    deps.repaint();
  }
  return retryPromotion;
}

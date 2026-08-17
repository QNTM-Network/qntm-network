/**
 * GraphRefreshRetrySurface — WHICH COMMIT'S OWN RESOLVER WALK MOST RECENTLY RAN AGAINST A GRAPH
 * THAT HAS SINCE GONE STALE, SO A LATER GRAPH REFRESH CAN RE-DERIVE IT.
 *
 * PURE: no DOM, no fetch, no clock — the same discipline `predict.ts`/`settle.ts` each state for
 * themselves, restated here rather than invented fresh.
 *
 * ── REPLACES `PromotionRetrySurface` (deleted 2026-08-17) — READ WHY BEFORE READING WHAT ──
 *
 * The first shape this took was promotion-specific: a surface that remembered a commit only when
 * `promotionSpec.read` abstained `graph-not-loaded`/`child-not-in-graph`/`parent-not-in-graph`,
 * and a retry that re-asked `promotionSpec` alone. It shipped, and it worked, and the operator
 * caught the shape directly: "we shouldn't have dual pathways, just the right governing class for
 * how things should be done." The same day, a SECOND live defect turned up in a resolver that
 * shape could never have covered: `resolvers/ordering.ts`'s `classifierFor` depends on
 * `ctx.graph` too (see that function's own header), but it does not ABSTAIN when the graph is
 * stale — it silently falls back to a different, non-graph-aware default ordering and answers
 * with THAT, wrong, placement. Reproduced live: pressing `o` on the true last row of a list opened
 * the new line in the middle, because ordering had placed the row with the fallback scheme while
 * the graph was still catching up. A promotion-shaped retry, and a second, ordering-shaped copy of
 * one, would have been exactly the duplication the operator was objecting to — and the copy would
 * still have missed this defect, because ordering never abstains in a way a promotion-shaped retry
 * would even notice.
 *
 * ── THE GENERIC SIGNAL, INSTEAD OF A PER-RESOLVER ONE ──
 *
 * Every commit's `CommitContext` is built with `ctx.graph` sourced from whatever
 * `graphCache.blob()` (`graph.ts`) currently holds. `GraphBlobCache.etag()` already names the
 * freshness of that blob — the same conditional-request evidence the cache's own `refresh()` keys
 * its revalidation on. The robust fact both defects above reduce to is not "did this resolver
 * abstain" but "did the graph the walk ran against change since it ran": `arm` (below) records the
 * etag `graphCache.etag()` held at the moment a commit's own walk happened, for EVERY commit,
 * unconditionally — never gated on what any resolver decided, because a silent wrong answer
 * (ordering) gives no reason to gate on and an honest abstain (promotion) needs none. `pending`
 * then answers yes only when the CURRENT etag differs from the one recorded — the blob has
 * genuinely moved since, so the commit is worth re-deriving, regardless of which resolver would
 * benefit from that or whether anything explicitly refused the first time.
 *
 * ── ONE RE-DERIVATION PER ARM, NOT AN INDEFINITE RETRY ──
 *
 * `pending` is consumed by `createGraphRefreshRetry` below exactly once per fresh etag: the retry
 * either lands a better answer this time or it does not, and either way the slot clears. A commit
 * whose row still cannot be resolved against the NEXT fresher blob gets no further help from this
 * surface on its own — only a NEW commit to the same row (which re-arms) or the operator noticing
 * and re-editing would give it another chance. This is a narrower promise than the old surface
 * made for promotion specifically (which kept a still-abstaining retry pending for the next
 * refresh) and a deliberate simplification: the generic mechanism has no resolver-shaped notion of
 * "still refused" to hold onto, only "ran against a since-superseded graph," and that fact is
 * fully spent the moment a walk has run against the newer one.
 *
 * ── ONE PENDING SLOT, THE SAME REASON `PredictSurface` HOLDS ONE ARMED INSTRUCTION ──
 *
 * A second commit before the first one's retry has even been attempted describes a NEWER state of
 * the view, and the newer one is the only one worth holding — `predict.ts`'s own header states the
 * identical reasoning for its own single slot. `arm` always overwrites.
 *
 * ── WHY THERE IS NO EXPLICIT "CLEAR ON SUPERSESSION" STEP ──
 *
 * `pending(source, view, currentEtag)` compares the EXACT source string and view still on screen,
 * the identical discipline `PredictSurface`/the old `PromotionRetrySurface` both already keep. A
 * commit made after this one changes `source` (a real edit always does), so a stale pending retry
 * can never match a later `pending()` call by construction — the source it was armed against is no
 * longer the source on screen.
 */

import type { LineCommit } from "./paint.js";
import { resolveAndArm } from "./commit.js";
import type { CommitContext, Diagnostic, PredictArm, SettleArm } from "./resolve.js";

export class GraphRefreshRetrySurface {
  #source: string | null = null;
  #view = "";
  #commit: LineCommit | null = null;
  #etag: string | null = null;

  /**
   * `commit` (committed against `view`, producing `source` — `commit.markdown`, the same base
   * `armSettle`/`armPredict` key against) ran its resolver walk against the graph blob at `etag`
   * (`graphCache.etag()` at the moment `commit`'s own context was built). Called on EVERY commit,
   * unconditionally — see this class's own header for why there is no gate on what any resolver
   * decided. Overwrites whatever was pending before.
   */
  arm(source: string, view: string, commit: LineCommit, etag: string | null): void {
    this.#source = source;
    this.#view = view;
    this.#commit = commit;
    this.#etag = etag;
  }

  /**
   * The commit pending retry for the EXACT `source`/`view` still on screen, when the graph blob's
   * OWN etag has genuinely moved since that commit's context was built — or `null` when there is
   * nothing pending, the pending retry belongs to a different view, the operator has typed
   * something else since, or (`currentEtag` unchanged) the graph has not actually moved and
   * re-deriving would only repeat the identical walk. Does not clear on its own — the caller
   * clears once it has actually used the answer (see `createGraphRefreshRetry`).
   */
  pending(source: string, view: string, currentEtag: string | null): LineCommit | null {
    if (this.#source !== source || this.#view !== view) {
      return null;
    }
    if (this.#etag === currentEtag) {
      return null;
    }
    return this.#commit;
  }

  /** The retry ran (whatever it found), or the operator moved on some other way this class was
   * not built to detect on its own. Nothing left pending for a later refresh to find. */
  clear(): void {
    this.#source = null;
    this.#view = "";
    this.#commit = null;
    this.#etag = null;
  }
}

/** The view a retry reads against, narrowed to what `resolveAndArm` needs — restated rather than
 * imported so this module's public surface does not force a caller to import a type from
 * `resolve.ts`/`commit.ts` just to describe "the view on screen". */
export interface GraphRefreshRetryView {
  readonly id: string;
  readonly sections?: readonly string[];
}

export interface GraphRefreshRetryDeps {
  /** The pending-retry tracker itself — a page-constructed `GraphRefreshRetrySurface`, the same
   * "constructed once, held by the page" posture `settle`/`predict`/`queued` already have. */
  readonly retrySurface: GraphRefreshRetrySurface;
  /** `resolverContextFor(view, commit)`, unmoved, on the page — the identical dep
   * `ResolveAndArmDeps.buildContext` is, for the identical reason. */
  buildContext(view: GraphRefreshRetryView, commit: LineCommit): CommitContext;
  /** `reportAbstentions(diagnostics)`, unmoved, on the page — passed straight through to
   * `resolveAndArm`. */
  reportAbstentions(diagnostics: readonly Diagnostic[]): void;
  readonly settle: SettleArm;
  readonly predict: PredictArm;
  /** The view currently on screen, or `null` when nothing is — a live read: `currentViewId` is a
   * page `let`, reassigned on every view change. */
  currentView(): GraphRefreshRetryView | null;
  /** The source currently painted for that view — `paintedSource`, a live read for the identical
   * reason. This is the string `GraphRefreshRetrySurface.pending` matches the armed retry against. */
  paintedSource(): string;
  /** `graphCache.etag()`, a live read — compared against whatever etag the pending commit's own
   * walk ran against. */
  currentEtag(): string | null;
  /** Repaint the current view — `() => paintView(currentViewId, "arrived")` on the page, called
   * ONLY once a retry has actually re-armed something for `settle`/`predict` to have a repaint to
   * answer. */
  repaint(): void;
}

/**
 * Build the page's retry attempt — called once, at page scope, the identical pattern
 * `createCommitLine(deps)` establishes. The returned function takes no arguments: every fact it
 * needs about "right now" is read through `deps` at call time, never captured at construction.
 */
export function createGraphRefreshRetry(deps: GraphRefreshRetryDeps): () => void {
  /**
   * THE GRAPH REFRESH LANDED FRESH — GIVE WHATEVER `retrySurface` IS HOLDING A SECOND CHANCE,
   * THROUGH THE IDENTICAL RESOLVE-AND-ARM STEP A FRESH COMMIT USES (`resolveAndArm`, `commit.ts`).
   * This is the whole point of the generalisation: this function does not know, and does not need
   * to know, which resolver (if any) benefits — it re-runs the whole registry walk and lets
   * `armSettle`/`armPredict` apply whatever changed.
   *
   * A NAMED FUNCTION DECLARATION, RETURNED — the identical reason `commit.ts`'s own header gives
   * for `commitLine`: flow-trace's TS transform recovers a name for a `FunctionDeclaration`
   * regardless of nesting.
   */
  function retryGraphRefresh(): void {
    const view = deps.currentView();
    if (view === null) {
      return;
    }
    const currentEtag = deps.currentEtag();
    const pending = deps.retrySurface.pending(deps.paintedSource(), view.id, currentEtag);
    if (pending === null) {
      return;
    }
    // THE SHARED STEP, REUSED — never a second, hand-copied `runResolvers`/`armSettle`/
    // `armPredict` sequence. See `resolveAndArm`'s own header (commit.ts) for why this is the one
    // place either caller ever reaches those three.
    resolveAndArm(deps, view, pending);
    deps.retrySurface.clear();
    deps.repaint();
  }
  return retryGraphRefresh;
}

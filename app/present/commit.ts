/**
 * commitLine — THE ONE PLACE A LINE COMMIT WALKS THE RESOLVER REGISTRY AND SENDS THE WRITE.
 *
 * ── WHY THIS MOVED, STATED AGAINST THE EXACT GAP IT CLOSES ──
 *
 * `app/index.html`'s own comment above the resolver block already said it: "This page is the
 * ONLY place that calls both `runResolvers` and reaches `paint`" — and until this move that
 * statement was true and UNVERIFIABLE, because `commitLine` lived inside a `<script type=
 * "module">` in an HTML document. flow-trace's capture is a node module-load hook
 * (`.flow-trace.yaml`'s own note); node cannot import HTML, so every call this function made was
 * invisible to canonical routing, to flow declarations and to depth-to-sink, by construction, not
 * by omission. `docs/architecture/classes.yaml`'s `capture-rule-application` entry names the exact
 * fix: "the connecting act — building a context, walking the registry, handing the result to
 * paint — moves out of `app/index.html` ... into a module under `app/`, mirroring the move
 * `presentation-painting` itself made in migration stage 1." This module is that move.
 *
 * ── A RELOCATION, NOT A REFACTOR ──
 *
 * Every statement below is `app/index.html`'s old `commitLine` body, unchanged, with the free
 * variables it used to close over (`settle`, `predict`, `queued`, `writeFile`, `arrive`,
 * `healFromRefusal`, `writes`, `resolverContextFor`, `reportAbstentions`, and the repaint-on-
 * refusal call into `paintView`) turned into one `deps` parameter — the same shape `paint()`
 * (paint.ts) already takes its own page state in, for the identical reason: a module under
 * `app/present/` may not read `document.getElementById` or hold a `let` the page owns, so
 * whatever a moved function still needs from the page has to arrive as an argument.
 *
 * `resolverContextFor` and `reportAbstentions` DELIBERATELY DID NOT MOVE. Both are small, both
 * are genuinely page-shaped (the first reads `declaration`/`graphData`/`graphBlob`, three `let`s
 * the page reassigns; the second is a `console.debug` sink two source-scraping tests —
 * `tests/app-today-note.test.mjs`, `tests/app-resolver-registry.test.mjs` — already pin to
 * `app/index.html`'s own text) and neither is what makes the resolver-to-paint path untraceable.
 * `RESOLVERS`, `runResolvers`, `armSettle` and `armPredict` are all imported here DIRECTLY
 * rather than through `deps` — real, unconditional, module-to-module calls a caller-chain probe
 * can see — which is the part that was missing. `deps.buildContext` is asked
 * for the assembled `CommitContext` and does not change what gets built, only where the building
 * happens to be written.
 *
 * ── WHY AN INJECTED `writeFile`/`arrive`/`healFromRefusal`/`repaintArrived` IS STILL A REAL,
 *    OBSERVABLE ROUTE TO `paint` ──
 *
 * flow-trace's JS observer threads the "logical caller" through `AsyncLocalStorage`
 * (`tools/flow-trace/js/src/runtime.mjs`), not through the native call stack — deliberately,
 * because JS has no caller frame after an `await`. A frame that is NOT instrumented (because it
 * still lives in `app/index.html`, e.g. `paintView`/`repaintCurrentView`) never touches that
 * store: calling into it and back out is transparent. So a call chain that runs
 * `commitLine -> (uninstrumented glue) -> paint` is recorded as `commitLine` calling `paint`
 * directly — the intervening page frames are invisible, not misattributing. That is what lets
 * this module, alone, make the chain a caller-chain probe can confirm, without `paintView` or
 * `repaintCurrentView` moving too (out of scope for this leg — see the design brief this module
 * answers). `tests/flow_scenarios/commit_line_routes_to_paint.ts` drives exactly this and is the
 * falsifiable claim; do not take the paragraph above as the proof.
 */

import { lineOps, type LineOp } from "./source.js";
import { RESOLVERS } from "./resolvers/registry.js";
import { runResolvers, armSettle, armPredict } from "./resolve.js";
import type { CommitContext, CommitOutcome, Diagnostic, PredictArm, SettleArm } from "./resolve.js";
import type { LineCommit } from "./paint.js";
import { rebaseLineEdit } from "./rebase.js";
import { mintWriteToken } from "./correlation.js";

/**
 * THE VIEW A RESOLVER WALK IS ASKED AGAINST, NARROWED TO WHAT `resolveAndArm` ITSELF NEEDS — the
 * same `{id, sections?}` shape `resolve.ts`'s own `ViewIdentity` already names, restated here
 * (rather than imported) for the identical reason `retry.ts`'s old `RetryPromotionView` restated
 * it: a caller of THIS function should not have to import a type from `resolve.ts` just to
 * describe "the view on screen". `CommitLineView` (below) is a strict superset — `path` is the
 * WRITE path's own business, and this function never writes anything.
 */
export interface ResolveAndArmView {
  readonly id: string;
  readonly sections?: readonly string[];
}

/**
 * EVERYTHING `resolveAndArm` NEEDS FROM WHOEVER CALLS IT — the four-line block `commitLine` used
 * to run inline, narrowed to exactly the fields it reads. `CommitLineDeps` (below) satisfies this
 * structurally without change: `settle`/`predict` are unnarrowed supersets (`CommitLineSettle`
 * adds `supersede`, which this function never calls) and `buildContext`/`reportAbstentions` are
 * verbatim.
 */
export interface ResolveAndArmDeps {
  /** `resolverContextFor(view, commit)`, unmoved, on the page — see `CommitLineDeps.buildContext`'s
   * own comment for why this is a function and not a value. */
  buildContext(view: ResolveAndArmView, commit: LineCommit): CommitContext;
  /** `reportAbstentions(diagnostics)`, unmoved, on the page. */
  reportAbstentions(diagnostics: readonly Diagnostic[]): void;
  readonly settle: SettleArm;
  readonly predict: PredictArm;
}

/**
 * RUN THE REGISTRY, REPORT WHAT IT REFUSED, ARM WHATEVER IT DECIDED — THE ONE STEP EVERY COMMIT
 * TAKES, WRITE OR RETRY, AND THE ONLY PLACE `runResolvers`/`armSettle`/`armPredict` ARE EVER
 * CALLED.
 *
 * ── WHY THIS IS ITS OWN FUNCTION (2026-08-17) ──
 *
 * Extracted out of `commitLine`'s body so a LATER, NO-WRITE TRIGGER — a graph refresh landing
 * fresh, re-deriving a commit already posted — can run the identical step without a second,
 * hand-copied `runResolvers`/`reportAbstentions`/`armSettle`/`armPredict` sequence living
 * somewhere else. The operator's own words, on the FIRST shape this took (a promotion-only retry
 * surface, `app/present/retry.ts`, since deleted): "we shouldn't have dual pathways, just the
 * right governing class for how things should be done." This function is that governing class —
 * `commitLine` (below) calls it for the write path; `createGraphRefreshRetry`
 * (`graph-refresh-retry.ts`) calls the SAME function, unmodified, for the refresh path. Nothing
 * about "which resolver decided what" is known by either caller; both simply ask "run the walk,
 * arm whatever it found" and let the registry answer for itself.
 *
 * ── WHAT DELIBERATELY STAYED IN `commitLine`, AND WHY ──
 *
 * `settle.supersede` (a stale claim about the row THIS commit is re-touching, discarded before a
 * fresh one can replace it) and `queued.drop` (whatever was queued for this write's own path is
 * now stale) are both WRITE-PATH facts — a retry re-derives an ALREADY-POSTED commit against a
 * fresher graph, and neither "this write is happening again" (it is not) nor "the queue for this
 * path is stale" (nothing new is being queued) is true of that. Folding them in here would give a
 * retry two side effects it has no business having. `commitLine` still calls `supersede` itself,
 * before this function runs — see that function's own comment for why the order it calls things
 * in still lands `supersede` strictly before `armSettle` reaches the same row, which is the one
 * ordering fact `settle.ts`'s own header (`supersede`'s doc comment) actually depends on.
 */
export function resolveAndArm(
  deps: ResolveAndArmDeps,
  view: ResolveAndArmView,
  commit: LineCommit,
): CommitOutcome {
  const outcome = runResolvers(RESOLVERS, deps.buildContext(view, commit));
  deps.reportAbstentions(outcome.diagnostics);
  // SETTLE ONLY WHEN THERE IS A PLACEMENT; PREDICT ALWAYS, EVEN WITH AN EMPTY LIST — see
  // `armSettle`/`armPredict`'s own headers (resolve.ts) for why the two are not symmetric.
  armSettle(deps.settle, commit.markdown, view.id, outcome.placements);
  armPredict(deps.predict, commit.markdown, view.id, outcome.predictions);
  return outcome;
}

/**
 * The view a commit was made against, narrowed to what `commitLine` itself reads. A superset of
 * `resolve.ts`'s own `ViewIdentity` — `path` is this function's business (`writeFile`'s argument,
 * `queued.drop`'s key), and `ViewIdentity` deliberately excludes it so no resolver can see it.
 */
export interface CommitLineView {
  readonly id: string;
  readonly path: string;
  readonly sections?: readonly string[];
}

/** `SettleSurface`'s arming half PLUS `supersede` — narrowed the same way `resolve.ts`'s own
 * `SettleArm` is, so this module never needs the whole class, only the two calls it makes. */
export interface CommitLineSettle {
  arm(source: string, view: string, placement: import("./settle.js").RowPlacement): void;
  supersede(source: string, view: string, lineIndex: number): void;
}

/** `ProjectionQueue`'s drop half, narrowed the same way. */
export interface CommitLineQueue {
  drop(path: string): void;
}

/** `WriteRegister`'s two terminal-conclusion calls, narrowed the same way. */
export interface CommitLineWrites {
  concludeGiveUp(token: string): void;
  giveUp(token: string): void;
}

/**
 * EVERYTHING `commitLine` NEEDS FROM THE PAGE, AND NOTHING ELSE. Assembled once, when the page
 * constructs its own `commitLine` via `createCommitLine(deps)` — every field below is either a
 * `const` on the page (so a reference taken once stays correct for the page's whole lifetime:
 * `settle`, `predict`, `queued`, `writes`) or a thin wrapper around a page function that reads a
 * live `let` at CALL time rather than at construction time (`buildContext`, `repaintArrived`), so
 * neither closure goes stale across a `loadPresentation`/`applyPresentation` reassignment.
 */
export interface CommitLineDeps {
  /** `resolverContextFor(view, commit)`, unmoved, on the page. */
  buildContext(view: CommitLineView, commit: LineCommit): CommitContext;
  /** `reportAbstentions(diagnostics)`, unmoved, on the page. */
  reportAbstentions(diagnostics: readonly Diagnostic[]): void;
  readonly settle: CommitLineSettle;
  readonly predict: PredictArm;
  readonly queued: CommitLineQueue;
  /** `drainPainted`, the page's own queue drain — called via `queueMicrotask`, never awaited. */
  drainPainted(): void;
  /** `writeFile`, unmoved — the one place a file is posted. */
  writeFile(
    view: CommitLineView,
    markdown: string,
    source: string,
    token: string | null,
    /**
     * The edit this write IS, as line-ops — carried ALONGSIDE `markdown`, never instead of it.
     * Both go on the wire so the change is deployable in ANY ORDER: a Worker that has never heard
     * of `ops` reads the markdown and behaves byte-identically to today, one that has prefers the
     * ops.
     *
     * ── THE REBASE RETRY SENDS ITS OPS TOO, AND THIS LINE USED TO SAY IT DELIBERATELY DID NOT ──
     *
     * The retired sentence was "Absent on the rebase retry below, deliberately — that is a
     * whole-file fold." It is not a fold. `rebaseLineEdit` returns `applyEdit(current, {kind:
     * "set-line", lineIndex: reading.lineIndex, text: edited})` — ONE line of the SERVER'S OWN file
     * replaced — and it hands back the index it resolved to for exactly this purpose. Every write
     * on this path posts the whole file; that is true of the first attempt as well, and it was
     * never what made the first attempt's ops meaningful.
     *
     * AND IT IS THE WRITE THAT MOST NEEDS THEM. A retry only happens because the file moved, so it
     * is the one moment the server's `difflib` reconstruction is guessing against a copy two edits
     * from the one the browser was holding — precisely when being told the edit is worth most.
     * `tests/app-one-write-path-per-act.test.mjs` §2 asserts the op is indexed against `current`
     * (the base this retry declares) rather than against the browser's stale copy.
     */
    ops?: readonly LineOp[] | null,
  ): Promise<unknown>;
  /** `arrive`, unmoved — installs or holds whatever the write answered with. */
  arrive(
    path: string,
    data: unknown,
    write: { markdown: string; token: string | null; source: string },
  ): string;
  /** `healFromRefusal`, unmoved — adopts the server's file when nothing typed is at stake. */
  healFromRefusal(path: string, current: unknown): boolean;
  readonly writes: CommitLineWrites;
  /** `() => paintView(currentViewId, "arrived")`, on the page — the one repaint `commitLine`
   * itself still triggers directly, on a write failure or an exhausted rebase. */
  repaintArrived(): void;
}

/**
 * A write's rejection, as `commitLine`'s own `catch` reads it — `api()`'s thrown shape on the
 * page, narrowed to the two fields this function actually branches on.
 */
interface WriteRefusal {
  readonly status?: number;
  readonly current?: unknown;
}

/**
 * Build the page's `commitLine` — same behaviour, same order of operations, as the function this
 * replaces (`app/index.html`, before this move). See this module's own header for what changed
 * (nothing about WHAT runs; only where it is written) and what did not move (why).
 */
export function createCommitLine(
  deps: CommitLineDeps,
): (view: CommitLineView, commit: LineCommit) => Promise<void> {
  // A NAMED FUNCTION DECLARATION, RETURNED, RATHER THAN `return async function commitLine(...) {`
  // — behaviourally identical (the same closure, hoisted the same way, returned the same
  // reference) and NOT cosmetic: flow-trace's TS transform (`js/src/transform.mjs`,
  // `qualnameFor`) only recovers a name for a returned function EXPRESSION when its parent is a
  // variable declaration or a property assignment; a bare `return async function commitLine(){}`
  // parents on a `ReturnStatement` and records as `<anonymous>` — checked directly: canonical-
  // routing reported `app/present/commit:<anonymous> -> paint` and a BYPASS against
  // `commit-line-routing` until this shape changed. A `FunctionDeclaration` always carries its
  // own name regardless of nesting, which is what the class in classes.yaml
  // (`app/present/commit:commitLine`) actually needs to match against.
  async function commitLine(view: CommitLineView, commit: LineCommit): Promise<void> {
    if (commit.markdown === null) {
      // THE LINE SETTLED AND CHANGED NOTHING, AND THE QUEUE WAS WAITING FOR ONE — see the
      // original's own comment (still true, still on the page) for why this is scheduled a turn
      // later rather than drained here directly.
      queueMicrotask(deps.drainPainted);
      return;
    }
    // A SECOND COMMIT TO THE ROW `settle` IS CURRENTLY ARMED FOR, BEFORE THE WALK BELOW CAN
    // RE-ARM IT — see settle.ts's own header. Scoped to `"set-line"`, unchanged. MOVED AHEAD OF
    // THE WALK (2026-08-17, `resolveAndArm`'s own extraction) rather than left between
    // `runResolvers` and `armSettle` — `supersede` reads only `commit.source`/`view.id`/
    // `commit.lineIndex`, none of which the walk produces, so it does not depend on running after
    // it; what DOES matter, and is unchanged, is that this still runs strictly before `armSettle`
    // (inside `resolveAndArm`, immediately below) reaches the same row — see `SettleSurface.
    // supersede`'s own doc comment for why that one ordering fact, and only that one, is load-
    // bearing.
    if (commit.kind === "set-line") {
      deps.settle.supersede(commit.source, view.id, commit.lineIndex);
    }
    // ── ONE CONTEXT, ONE WALK, ONE ARM — AND THIS FUNCTION NAMES NO RESOLVER ── `resolveAndArm`
    // (above) is the extracted step: `runResolvers`, `reportAbstentions`, `armSettle`, `armPredict`,
    // in that order — the SAME sequence a graph-refresh retry runs later, unmodified, for a commit
    // this walk already decided once. See that function's own header for why it is a function at
    // all rather than left inline.
    resolveAndArm(deps, view, commit);
    // WHATEVER IS STILL QUEUED FOR THIS PATH IS NOW STALE — see the original's own long comment,
    // unchanged, still on the page beside `queued`'s own declaration. Independent of `settle`/
    // `predict` (a different surface, a different kind of staleness), so its position relative to
    // `resolveAndArm` above is not load-bearing either way; kept after, closest to where the write
    // itself begins.
    deps.queued.drop(view.path);
    const token = mintWriteToken();
    try {
      // THE EDIT, NO LONGER DISCARDED. Derived from the commit's own `kind` and `lineIndex`, with
      // the replacement text read back out of the markdown the fold already produced — so the ops
      // and the whole-file body below cannot describe different edits. `null` when the commit is
      // not expressible as one line op, in which case this is exactly today's write.
      const ops = lineOps(commit.kind, commit.lineIndex, commit.markdown);
      const data = await deps.writeFile(view, commit.markdown, commit.source, token, ops);
      // OFFERED, NOT INSTALLED — see the original's own comment.
      deps.arrive(view.path, data, { markdown: commit.markdown, token, source: commit.source });
    } catch (error) {
      const e = error as WriteRefusal;
      // ── A REFUSAL AND A FAILURE ARE THE SAME `catch` AND OPPOSITE ANSWERS ── (unchanged)
      if (e?.status === 409) {
        if (commit.text.trim() === "") {
          if (token !== null) {
            deps.writes.concludeGiveUp(token);
          }
          deps.healFromRefusal(view.path, e.current);
          return;
        }
        // ── A SAFE RETRY: THE REBASE ── (unchanged)
        //
        // `refusedCurrent` NARROWS `e.current` ONCE, so the type checker can see what the runtime
        // already knows: `rebase.outcome` can only be `"rebased"` when `e.current` was a string
        // (that is `rebaseLineEdit`'s own precondition, checked immediately below). Re-testing
        // `typeof e.current === "string"` a second time at line ~195 would be the same fact
        // asserted twice, which is worse than asserting it once and reusing the narrowed value.
        const refusedCurrent = typeof e.current === "string" ? e.current : null;
        const rebase =
          commit.kind === "set-line" && refusedCurrent !== null
            ? rebaseLineEdit(view.id, commit.source, commit.lineIndex, commit.text, refusedCurrent)
            : null;
        if (rebase?.outcome === "rebased" && refusedCurrent !== null) {
          if (token !== null) {
            deps.writes.concludeGiveUp(token);
          }
          const retryToken = mintWriteToken();
          try {
            // THE RETRY NAMES ITS EDIT, against the server's own file — `rebase.lineIndex` is the
            // index the anchor walk resolved to in `refusedCurrent`, which is also the `source`
            // this write declares as its base one argument along. `set-line` because that is the
            // edit `rebaseLineEdit` made; `null` when the index is out of range, which sends no
            // `ops` field and is byte-for-byte the retry this path posted before.
            const retryOps = lineOps("set-line", rebase.lineIndex, rebase.markdown);
            const data = await deps.writeFile(view, rebase.markdown, refusedCurrent, retryToken, retryOps);
            deps.arrive(view.path, data, {
              markdown: rebase.markdown,
              token: retryToken,
              source: refusedCurrent,
            });
          } catch (retryFailure) {
            const retryError = retryFailure as WriteRefusal;
            if (retryError?.status === 409 && retryToken !== null) {
              deps.writes.concludeGiveUp(retryToken);
            }
            if (retryError?.status !== 409) {
              deps.repaintArrived();
            } else {
              // THE RETRY WAS ITSELF REFUSED — the last thing in flight is gone. Only on the 409
              // arm: the other arm repainted from the last server state one line up, and that
              // repaint IS the revert.
              commit.onRefusalIsFinal?.(retryError.current);
            }
          }
          return;
        }
        // NO REBASE WAS POSSIBLE — refused, not guessed. BOUND: ZERO further retries. (unchanged)
        if (token !== null) {
          deps.writes.concludeGiveUp(token);
        }
        // AND NOTHING IS IN FLIGHT ANY MORE, which is a different statement from "the write
        // failed" and the reason this call is here rather than in the caller's own `catch`: this
        // exit is reached only after `rebaseLineEdit` has REFUSED to guess, so it is the moment
        // the change stops being streamed-from-the-view. See `LineCommit.onRefusalIsFinal`.
        commit.onRefusalIsFinal?.(e.current);
        return;
      }
      // The write itself failed (not a refusal) — repaint from the last known server state.
      deps.repaintArrived();
    }
  }
  return commitLine;
}

/**
 * ProjectionQueue — THE NEXT PROJECTION FOR ONE FILE, held until the screen can take it.
 *
 * PURE. No DOM, no fetch, no clock, and it imports nothing — the same posture as `base.ts`,
 * `focus.ts`, `draft.ts` and `motions.ts`. It decides WHICH projection is the current one for a
 * path and nothing at all about when it is installed; that gate is the page's, because only the
 * page knows whether a line is open.
 *
 * ── WHAT THIS IS FOR, IN ONE SENTENCE ──
 *
 * A projection arriving while the operator is typing repaints the view out from under him. The
 * painter sources an open line's characters from whatever string it is walking (`paint.ts`'s
 * `rawInput`, `input.value = lineSource`), so an arrival mid-edit silently replaces what he typed.
 * The answer is not to repaint more carefully; it is to NOT REPAINT YET — hold the projection,
 * install it the moment the line settles.
 * `docs/implementation-artifacts/design-local-behaviour-and-the-queue.md` §5 specifies it.
 *
 * ── IT COALESCES. IT DOES NOT ACCUMULATE, AND THAT IS THE WHOLE DESIGN ──
 *
 * At most ONE pending projection per path, replaced wholesale by a newer one. Two queued
 * projections is one queued projection and one lie: a projection is an ABSOLUTE statement about a
 * file ("this is what it says"), not an event ("this changed"), so replaying an older one after a
 * newer one would move the screen backwards through states the server has already left. There is
 * no ordering in which applying both is more correct than applying the newer.
 *
 * That is the discipline `BaseSurface` already applies one level down — "one base, for the file on
 * screen, because a base that outlives the projection it came from is a lie" — and the discipline
 * `paint()` makes cheap: a view is rebuilt from ONE STRING, so installing a projection is a
 * one-argument operation with no diff to replay and no DOM reconciler to keep in step.
 *
 * ── ORDERED BY `generated_at`, WHICH IS THE ENVELOPE'S OWN FACT ──
 *
 * Not by arrival order. Two writes inside one cycle produce two answers whose ORDER ON THE WIRE is
 * a property of the network, and the operator's screen must not depend on it. `generated_at` is
 * stamped by the thing that produced the projection (`server/app.py`, forwarded by
 * `worker/src/app.js`), so it is the only ordering both ends agree on.
 *
 * KEYED BY PATH RATHER THAN BY VIEW ID, because the write unit is a FILE — `POST /app/edit-file`
 * takes `{path, markdown, base}` — and `BaseSurface` is keyed the same way for the same reason. A
 * view id is what the page paints; a path is what the server was told about.
 *
 * ── WHAT IT DELIBERATELY DOES NOT HOLD ──
 *
 * NOTHING THE BROWSER COMPUTED. Everything offered here came off the wire. The two things this app
 * computes locally — the optimistic repaint after a commit, and the freshness line's sentences —
 * are not arrivals and must never be queued: a client-computed string installed through this
 * surface would reach `BaseSurface.take` as if the server had sent it, and the stale-write detector
 * would then certify a file it had itself diverged (`base.ts`, `take`'s own header).
 *
 * NO TIMER, NO RETRY, NO TRANSPORT. This holds one object per path and answers three questions
 * about it. What fetches a projection, and what wakes the page up to drain one, are the page's and
 * the transport's problems (`the-projection-arrives-without-being-asked-for`).
 */

/** One projection, waiting. `data` is the whole envelope, opaque here and never inspected. */
export interface PendingProjection<T = unknown> {
  /** The file this projection describes — the same string the write path posts as `path`. */
  readonly path: string;
  /** The envelope's own `generated_at`, verbatim. `null` when the envelope carried none. */
  readonly generatedAt: string | null;
  /** The envelope. This surface reads nothing out of it; the page installs it whole. */
  readonly data: T;
}

/**
 * What became of an offered projection.
 *
 * `queued` — nothing was pending for that path; this one is now.
 * `superseded` — it replaced an older pending projection, WHICH IS DROPPED, never applied first.
 * `stale` — it is not newer than what is already pending, so it is dropped and nothing changed.
 */
export type OfferOutcome =
  | { readonly outcome: "queued" }
  | { readonly outcome: "superseded" }
  | { readonly outcome: "stale" };

/**
 * Is `arriving` a later projection than `held`?
 *
 * BOTH UNREADABLE TIMESTAMPS FAIL TOWARD THE ARRIVAL, and that is a decision rather than a
 * fallback. If the two cannot be ordered, the only two options are "show the one that just arrived"
 * and "go on showing an older one on the strength of a comparison that could not be made". The
 * first is wrong at most about ordering; the second leaves the screen behind the server for reasons
 * nobody can see. An envelope with no `generated_at` at all is the same case.
 *
 * EQUAL IS NOT NEWER. Two envelopes stamped the same instant are the same projection — the cycle
 * stamps once — so the arrival says nothing new and is dropped. That also makes `offer` idempotent
 * for the ordinary case of one answer delivered twice.
 */
function isNewer(arriving: string | null, held: string | null): boolean {
  if (arriving === null || held === null) {
    return true;
  }
  const a = Date.parse(arriving);
  const b = Date.parse(held);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return true;
  }
  return a > b;
}

export class ProjectionQueue<T = unknown> {
  #pending = new Map<string, PendingProjection<T>>();

  /**
   * A PROJECTION ARRIVED FOR `path`. Hold it, unless what is already held is at least as new.
   *
   * It does not install anything and it cannot: installing is a repaint, a repaint needs a DOM, and
   * this module has none. The caller drains.
   */
  offer(path: string, generatedAt: string | null, data: T): OfferOutcome {
    const held = this.#pending.get(path);
    if (held === undefined) {
      this.#pending.set(path, { path, generatedAt, data });
      return { outcome: "queued" };
    }
    if (!isNewer(generatedAt, held.generatedAt)) {
      return { outcome: "stale" };
    }
    // REPLACED, NOT APPENDED. The older one is dropped here and is never seen again — this single
    // statement is the whole of "the older is dropped rather than applied then overwritten".
    this.#pending.set(path, { path, generatedAt, data });
    return { outcome: "superseded" };
  }

  /** What is waiting for `path`, without taking it. `null` when nothing is. */
  pending(path: string): PendingProjection<T> | null {
    return this.#pending.get(path) ?? null;
  }

  /** Take what is waiting for `path` and stop holding it. `null` when nothing is. */
  take(path: string): PendingProjection<T> | null {
    const held = this.#pending.get(path);
    if (held === undefined) {
      return null;
    }
    this.#pending.delete(path);
    return held;
  }

  /** Stop holding anything for `path`, applied or not. */
  drop(path: string): void {
    this.#pending.delete(path);
  }

  /** How many paths have something waiting. One per file, so this is also "how many files". */
  get size(): number {
    return this.#pending.size;
  }

  /**
   * Forget everything, for the same reason `BaseSurface.drop` exists: the graph went away (a
   * sign-out) and a projection held for a session that has ended is a projection for a file this
   * page may no longer read.
   */
  clear(): void {
    this.#pending.clear();
  }
}

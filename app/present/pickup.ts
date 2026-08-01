/**
 * PickupSchedule — WHEN TO GO AND COLLECT THE ANSWER TO A WRITE, and how many times to try.
 *
 * PURE. No DOM, no fetch, no clock, and it imports nothing — the same posture as `queue.ts`,
 * `base.ts`, `focus.ts`, `draft.ts` and `motions.ts`. It decides WHETHER a read is owed for a path,
 * HOW LONG the caller should wait before making it, and WHEN to stop; it makes no read, holds no
 * timer, and knows nothing about envelopes. The page owns `setTimeout` and `fetch`, because only
 * the page has them.
 *
 * ── WHAT THIS IS FOR, IN ONE SENTENCE ──
 *
 * A write's answer has always come back ON the write. The moment the write is ACKED instead —
 * `POST /app/edit-file` answering on the vault write with the cycle running behind it — that answer
 * has nowhere to come from, and the complete set of things that install a projection drops from
 * three (boot, the re-read button, the return of a write) to two, neither of which fires on its own.
 * A pickup is the third one rebuilt as a SEPARATE read: the write says "accepted", and the answer to
 * it is collected a moment later.
 *
 * ── IT IS NOT A POLL, AND THE DIFFERENCE IS WHAT THE OPERATOR PAYS FOR ──
 *
 * The graph server is a Fly machine with `auto_stop_machines = "stop"` and `min_machines_running =
 * 0`: it sleeps when idle, and a cold wake costs 4,278 ms of a dedicated core he is paying for. A
 * timer in the browser that re-reads every N seconds wakes that machine every N seconds for as long
 * as a tab is open, whether or not he is using the app — at 30 s that is 2,880 wakes a day for
 * nothing. So the schedule here is BOUNDED and CAUSED:
 *
 *   CAUSED   — nothing is ever scheduled except by a write the operator made. With no writes there
 *              are no reads, and an idle tab reaches the graph server exactly zero times.
 *   BOUNDED  — a write buys at most `delaysMs.length` attempts and then the schedule is EXHAUSTED
 *              and says so. It never re-arms itself; only a new write can.
 *   INSIDE THE WAKE THE WRITE ALREADY PAID FOR — the whole window is ~40 s, and the machine is by
 *              construction awake and busy for it: the write woke it and the cycle is running on it.
 *              So the marginal cost of every pickup is zero cold wakes.
 *
 * ── ONE OUTSTANDING PICKUP PER PATH, THE NEWEST WRITE'S ──
 *
 * `queue.ts`'s discipline, applied to the read rather than to the arrival. Two pickups for one file
 * is one pickup and one wasted read: they would fetch the same envelope, and the answer that matters
 * is the LATEST write's, because a projection generated after the newest write was accepted was
 * necessarily generated after the older one was. So a second `schedule` for a path already waiting
 * ADOPTS the newer token and starts the attempts again, rather than adding a second timer.
 *
 * RESTARTING THE ATTEMPTS IS NOT AN UNBOUNDED LOOP. Each restart costs one gesture by the operator,
 * so the total number of reads is bounded by the number of writes he makes — and while he is making
 * writes, the machine is awake regardless.
 *
 * ── IT DOES NOT DECIDE WHETHER THE ANSWER ARRIVED ──
 *
 * `answered(path, satisfied)` is TOLD. That decision belongs to the page, because it is a fact about
 * the write register (`correlation.ts` — did the projection NAME my write) and about the queue, and
 * this module holds neither. Keeping it here would have meant a second, weaker copy of a judgement
 * that already exists, which is exactly the split `queue.ts` makes with `aLineIsOpen`.
 */

/**
 * HOW LONG TO WAIT BEFORE EACH ATTEMPT, in milliseconds, and therefore HOW MANY ATTEMPTS THERE ARE.
 *
 * THE FIRST NUMBER IS THE MEASURED CYCLE. `research-state-and-speed.md` measures the engine cycle at
 * ~10 s, which is the whole reason the write stops waiting for it — so the first read is placed
 * where the cycle is expected to have finished rather than immediately, because a read that arrives
 * before the cycle costs a full envelope and answers nothing.
 *
 * THE LAST TWO ARE THE OVERRUN, AND THERE ARE ONLY TWO ON PURPOSE. A cycle that has not answered in
 * ~40 s is not late, it is a cycle something is wrong with, and the honest thing to do then is to
 * stop and say so rather than to go on reading. The re-read button is one press away and it is the
 * operator's, which is the right place for an unbounded retry to live.
 */
export const PICKUP_DELAYS: readonly number[] = [10_000, 10_000, 20_000];

/** A read was placed for this path, or one is already outstanding and this one joined it. */
export type ScheduleOutcome =
  | { readonly outcome: "scheduled"; readonly delayMs: number; readonly attempt: number }
  | { readonly outcome: "joined"; readonly attempt: number };

/** The timer fired: make the read, or do not — the pickup was cancelled while it waited. */
export type AttemptOutcome =
  | { readonly outcome: "read"; readonly attempt: number; readonly token: string | null }
  | { readonly outcome: "cancelled" };

/** What the attempt's answer means for the schedule. */
export type AnswerOutcome =
  | { readonly outcome: "done" }
  | { readonly outcome: "again"; readonly delayMs: number; readonly attempt: number }
  | { readonly outcome: "exhausted" };

interface Waiting {
  /** The write this pickup is collecting the answer to, or `null` when that write carried none. */
  token: string | null;
  /** How many attempts have been STARTED for this pickup, counting from 1. */
  attempt: number;
}

export class PickupSchedule {
  readonly #delays: readonly number[];
  #waiting = new Map<string, Waiting>();

  constructor(delaysMs: readonly number[] = PICKUP_DELAYS) {
    // A COPY, so a caller that keeps the array it passed cannot lengthen this schedule afterwards —
    // the bound is the whole safety property and it must not be reachable from outside.
    this.#delays = [...delaysMs];
  }

  /** How many attempts one write buys before the schedule gives up. */
  get attempts(): number {
    return this.#delays.length;
  }

  /**
   * A WRITE WAS ACCEPTED FOR `path` — its answer is owed, so place a read.
   *
   * `token` is the write's own handle (`correlation.ts`'s `mintWriteToken`) or `null` when the
   * browser could not mint one. It is held OPAQUELY and only handed back at `attempt` time; nothing
   * here compares it to anything.
   */
  schedule(path: string, token: string | null = null): ScheduleOutcome {
    const held = this.#waiting.get(path);
    if (held !== undefined) {
      // ADOPTED, NOT APPENDED — see the header. The newer write's token replaces the older one
      // because a projection naming the newer one was generated after the older one landed, and the
      // attempts start again because this is a new cycle to wait for.
      held.token = token;
      held.attempt = 0;
      return { outcome: "joined", attempt: 0 };
    }
    this.#waiting.set(path, { token, attempt: 0 });
    return { outcome: "scheduled", delayMs: this.#delayFor(0), attempt: 0 };
  }

  /**
   * THE TIMER FIRED. Start the next attempt, or report that there is nothing left to collect.
   *
   * `cancelled` is not a failure: it is what a pickup that has already been satisfied by another
   * route — the re-read button, a later write's own projection — looks like from inside the timer
   * that was still counting.
   */
  attempt(path: string): AttemptOutcome {
    const held = this.#waiting.get(path);
    if (held === undefined) {
      return { outcome: "cancelled" };
    }
    held.attempt += 1;
    return { outcome: "read", attempt: held.attempt, token: held.token };
  }

  /**
   * THE ATTEMPT ANSWERED. `satisfied` is the PAGE'S judgement that the write this pickup was
   * collecting has been answered — see the header for why it is told rather than decided here.
   *
   * `exhausted` DROPS THE RECORD. There is nothing left to collect and nothing will re-arm on its
   * own; the next read of this file is a gesture the operator makes.
   */
  answered(path: string, satisfied: boolean): AnswerOutcome {
    const held = this.#waiting.get(path);
    if (held === undefined) {
      return { outcome: "done" };
    }
    if (satisfied) {
      this.#waiting.delete(path);
      return { outcome: "done" };
    }
    if (held.attempt >= this.#delays.length) {
      this.#waiting.delete(path);
      return { outcome: "exhausted" };
    }
    return { outcome: "again", delayMs: this.#delayFor(held.attempt), attempt: held.attempt };
  }

  /** A projection for `path` arrived by some other route. Returns whether one was outstanding. */
  cancel(path: string): boolean {
    return this.#waiting.delete(path);
  }

  /** The write a pickup for `path` is collecting the answer to, or `null` when there is none. */
  token(path: string): string | null {
    return this.#waiting.get(path)?.token ?? null;
  }

  /** Is a pickup outstanding for `path`? */
  waiting(path: string): boolean {
    return this.#waiting.has(path);
  }

  /** How many paths have a pickup outstanding. */
  get size(): number {
    return this.#waiting.size;
  }

  /** Every pickup dropped — the graph was dropped, or the session ended. */
  clear(): void {
    this.#waiting.clear();
  }

  /** The wait before the attempt AFTER `made`, clamped to the last declared delay. */
  #delayFor(made: number): number {
    return this.#delays[Math.min(made, this.#delays.length - 1)] ?? 0;
  }
}

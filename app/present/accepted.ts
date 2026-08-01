/**
 * AcceptedSource — THE MARKDOWN THE SERVER SAID IT NOW HOLDS FOR ONE FILE, until a projection
 * replaces it.
 *
 * PURE. No DOM, no fetch, no clock, and it imports nothing — the same posture as `base.ts`,
 * `queue.ts`, `pickup.ts`, `focus.ts` and `draft.ts`.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT A SECOND COPY OF THE PROJECTION ──
 *
 * A synchronous write answers with the whole projection: the cycle ran, the envelope came back, the
 * painter re-walked the file, and a SECOND edit made a moment later is computed on top of the first
 * because the painter's source moved. That is the only reason two edits inside one cycle compose
 * today, and it is measured: `tests/app-projection-queue.test.mjs` §5.
 *
 * AN ACK REMOVES EXACTLY THAT. `POST /app/edit-file` answering on the vault write carries no
 * projection, nothing repaints, and the painter goes on holding the string it was handed — so a
 * second tick is computed against a file WITHOUT the first tick in it, and the whole-file write
 * overwrites it. §7 of the same suite measures that too, and it is the reason async was refused.
 *
 * WHAT THE ACK DOES CARRY IS A STATEMENT ABOUT THE SERVER'S OWN COPY: `POST /vault/file` writes the
 * bytes it is sent, verbatim, and a 200 says it did. So after an ack THE FILE SAYS WHAT WAS POSTED,
 * and this surface is that sentence held as a string. It is not a guess, not an optimistic local
 * edit, and not a projection: it is one file's content, on the server's word.
 *
 * ── THE TWO THINGS THAT READ IT, AND WHY BOTH ARE THE SAME FACT ──
 *
 *   THE PAINTER'S SOURCE — so the next edit is computed on top of the last accepted one. That is
 *     what makes two edits inside one cycle carry both.
 *   THE BASE (`base.ts`) — so `served.read` answers `current` for a write whose base really is what
 *     the server holds, and `stale` when it is not. Both are the truth about the same one string.
 *
 * ── WHAT IT IS EMPHATICALLY NOT ──
 *
 * NOT A PROJECTION AND NEVER INSTALLED AS ONE. It holds ONE FILE'S markdown. It has no views, no
 * graph, no locations and no `generated_at`, so there is nothing here that could reach `graphData`,
 * and nothing here is ever offered to `ProjectionQueue`. The one direction the app permits —
 * projection → source → engine → new projection, never backwards — is untouched: this is a way
 * station on the SOURCE side, and a projection arriving discards it.
 *
 * NOT DURABLE. Its life is the gap between an ack and the projection that answers it, which is one
 * cycle. `drop` is called the moment a projection for that path is installed, and the projection
 * wins unconditionally — the engine is entitled to rewrite what it ingested, so the arriving file is
 * the newer truth even where it disagrees with what was posted.
 *
 * ── ONE FILE, THE ONE ON SCREEN — `BaseSurface`'S DISCIPLINE, FOR THE SAME REASON ──
 *
 * Writes only ever come from the painted view, so one is all there is to hold, and a ledger of every
 * file the session has ever posted would be a ledger of strings quietly ageing behind views nobody
 * is looking at. A second `take` replaces the first wholesale.
 */
export class AcceptedSource {
  #path: string | null = null;
  #markdown: string | null = null;

  /** The file this is about, or `null` when nothing is held. */
  get path(): string | null {
    return this.#path;
  }

  /** What the server said that file holds, or `null` when nothing is held. */
  get markdown(): string | null {
    return this.#markdown;
  }

  /**
   * THE SERVER ACCEPTED THIS FILE'S CONTENT. Hold it until a projection for the path arrives.
   *
   * Called with the markdown that WENT ON THE WIRE and was answered 200 — never with a string the
   * app merely intends to send, and never with one a write failed or was refused on. A 409 says
   * nothing was written, so nothing may be taken here from one.
   */
  take(path: string, markdown: string): void {
    this.#path = path;
    this.#markdown = markdown;
  }

  /** What the painter should walk for `path`, or `null` when this surface has nothing to say. */
  sourceFor(path: string): string | null {
    return this.#path === path ? this.#markdown : null;
  }

  /**
   * A PROJECTION FOR `path` ARRIVED, so this is superseded. Returns whether anything was dropped.
   *
   * PATH-CHECKED RATHER THAN UNCONDITIONAL, because a projection is installed for the painted view
   * and the accepted file may be another one — a write leaves for one path and the operator may be
   * looking at a second by the time it answers.
   */
  drop(path: string): boolean {
    if (this.#path !== path) {
      return false;
    }
    this.#path = null;
    this.#markdown = null;
    return true;
  }

  /** Everything dropped — the graph was dropped, or the session ended. */
  clear(): void {
    this.#path = null;
    this.#markdown = null;
  }
}

/**
 * correlation — THE TOKEN A WRITE CARRIES, AND THE ECHO THAT PROVES THAT WRITE LANDED.
 *
 * PURE, with ONE named exception. The register and the reader are arithmetic over strings — no DOM,
 * no fetch, no clock — and the module imports nothing. `mintWriteToken` is the one function that
 * reaches for a platform global, and it is separated from the surface for exactly the reason
 * `baseOf` is separated from `BaseSurface` in `base.ts`: the surface stays a comparison of strings
 * that a test can drive with `document`, `fetch` and `Date.now` all made to throw.
 *
 * ── THE MEASURED DEFECT THIS EXISTS TO FIX ──
 *
 * A browser run on 2026-08-01 found the recovery strip (`held.ts`) carrying FIVE rows, of which
 * THREE were lines that had saved perfectly. The cause is visible in the data and is not a bug in
 * the strip: the cycle REWRITES the line it ingests — it appends the identity stamp, the defaults
 * and the marker — so the browser, trying to recognise its own line in the projection that comes
 * back, is matching on TEXT. `HeldSurface.settle` matches a line exactly or as a prefix with a
 * token appended, which is the shape the cycle usually produces and is NOT the shape it always
 * produces: a re-sorted line, a re-worded title, a line the cycle moved into another view all read
 * as "the file does not own these characters", and the row stays on the strip claiming work was
 * lost when none was.
 *
 * TEXT IS NOT IDENTITY. A TOKEN IS. The browser mints one opaque token per write, sends it beside
 * `{path, markdown, base}`, and the server records it and names it back in the envelope it later
 * serves. That is POSITIVE EVIDENCE, which is the only kind of evidence this app is allowed to
 * release a held row on.
 *
 * ── THE NARROW CLAIM, WHICH IS THE ONLY ONE ANYTHING HERE IS BUILT ON ──
 *
 * The echo says EXACTLY this and no more:
 *
 *     "this server accepted a write carrying this token FOR THIS PATH"
 *
 * It does NOT say the projection in hand is derived from that write. The server's ledger holds up
 * to 8 tokens per path for 24 hours, so a token recorded before a LATER write to the same path is
 * still echoed; with the stale-base precondition in place a later write must have been computed
 * against the earlier one's result, but without a `base` it need not have been. The narrow claim is
 * the one the code is written to: `WriteRegister.arrive` matches a token ONLY under the path its
 * own write went to, and where the difference could matter the answer is to keep the row.
 *
 * IT ALSO DOES NOT SAY THE LINE THE OPERATOR TYPED SURVIVED THE CYCLE, and nothing here should ever
 * be read as saying so — the cycle is entitled to rewrite, move or delete what it ingests, and that
 * is a decision about content the vault has already taken, not a loss of the operator's characters.
 * The strip's own claim is "characters no file owns"; once the write was accepted, a file owned
 * them.
 *
 * ── WHY IT SITS BESIDE `base.ts` RATHER THAN INSIDE IT ──
 *
 * They are the same SHAPE of thing and two different FACTS with two different lifetimes. A base is
 * about the FILE — "I believe this file currently says X" — is recomputed for every write from
 * whatever source that write was applied to, and is meaningless the instant the file changes. A
 * token is about ONE WRITE — "this particular POST is mine" — is minted once, outlives its own
 * answer (the echo may arrive on a later `GET /graph`), and is meaningless to every other write of
 * the same file. Folding one into the other would give the file-level fact a per-write lifetime,
 * which is `base.ts`'s own named trap ("a base that outlives the projection it came from is a lie")
 * approached from the opposite side.
 *
 * ── THE ECHO IS READ THROUGH ONE SMALL, REPLACEABLE READER ──
 *
 * `readWriteEcho` is the only expression in this repository that knows WHERE in an envelope the
 * echo lives and WHAT SHAPE it has. It is written in the posture `declaration.ts`, `structural.ts`,
 * `qualification.ts` and `resolutiontable.ts` all share: it accepts `unknown`, it declares its
 * grammar, silence falls through to the behaviour that existed before it, and a shape it does not
 * recognise is REPORTED as a problem rather than guessed at. The server half of this contract is
 * being built in another repository at the same time as this one; when its exact envelope shape is
 * known, `WRITE_ECHO_KEY` and `readWriteEcho` are the only things that need to change, and every
 * caller, test and behaviour below stays as it is.
 */

/**
 * The envelope key the echo is read from. Exported so a test can name it rather than repeat it.
 *
 * THE SHAPE IS THE SERVER HALF'S, SETTLED 2026-08-01 AND NO LONGER A PLACEHOLDER:
 *
 *     "writes": { "this_week.md": ["<token>", "<token>"] }
 *
 * `{path: [token, …]}`, oldest first, always present once the server half is deployed, `{}` when
 * there are none and `{}` again when its own ledger cannot be read. The token is echoed VERBATIM —
 * not trimmed, not case-folded, not re-encoded — so the comparison below is exact equality and
 * needs to be nothing cleverer.
 */
export const WRITE_ECHO_KEY = "writes";

/**
 * What reading an envelope's echo produced.
 *
 * `silent` — the envelope carries no such key at all. THE SHIPPING CONDITION: the server half is
 *   merged and NOT DEPLOYED, so this is what every projection reads as today, and every caller then
 *   behaves exactly as this app behaved before correlation existed.
 * `echo` — the key was present and its shape is the declared one. `writes` may be empty: a server
 *   with nothing to say for this projection is not a problem, and neither is one whose ledger it
 *   could not read.
 * `unrecognised` — the key was present and its shape is not the declared one. NO TOKEN IS TAKEN
 *   FROM IT, so nothing is released on the strength of a shape nobody agreed. Reported, so a
 *   contract drift between the two halves is visible rather than silently inert.
 */
export type EchoReading =
  | { readonly outcome: "silent" }
  | { readonly outcome: "echo"; readonly writes: ReadonlyMap<string, readonly string[]> }
  | { readonly outcome: "unrecognised"; readonly problem: string };

/**
 * A path as this module compares it — the ONE normalisation, declared rather than assumed.
 *
 * The server keys its ledger by the path the write's own answer returned, `/`-STRIPPED. The browser
 * knows a file by the `path` its projection carries (`work/outcomes.md`), which already has no
 * leading slash. Stripping one from both sides is therefore a no-op in every case measured and the
 * exact correction in the one case it is not — and it is the ONLY transform applied. No trimming,
 * no case folding, no separator rewriting: two paths that differ in any other way are two files,
 * and treating them as one would release a held row against a write of a different file.
 */
function samePath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

/** The token's own name, carried in the string so a later scheme can be told apart from this one. */
const TOKEN_PREFIX = "w1-";

/** 128 bits. See `mintWriteToken` for why that is the number. */
const TOKEN_BYTES = 16;

/**
 * ONE OPAQUE TOKEN FOR ONE WRITE — `w1-<32 hex>` — or `null` when this platform cannot mint one.
 *
 * ── HOW IT IS GENERATED, AND WHY THAT IS ENOUGH ──
 *
 * 128 bits from the platform CSPRNG (`crypto.getRandomValues`), hex-encoded, behind a scheme
 * prefix. The token has to satisfy exactly two properties and neither of them needs more:
 *
 *   1. IT MUST NOT COLLIDE WITH ANOTHER WRITE'S TOKEN. The population is tiny — the writes one
 *      browser session has outstanding at once, which is a handful, and `WriteRegister` below caps
 *      it at 64. 128 random bits puts the birthday probability over any plausible session at
 *      astronomically below the probability of the network reordering the answers, which is the
 *      failure this correlation is FOR.
 *   2. IT MUST NOT BE GUESSABLE. A token is the browser's proof that a projection is the answer to
 *      ITS write. If a token could be predicted, an envelope from anywhere could release a held row
 *      by naming one — which is the false positive this whole change exists to remove, restored
 *      through a side door. A CSPRNG is the cheap answer; `Math.random` is not, and is deliberately
 *      NOT used as a fallback.
 *
 * SYNCHRONOUS, AND `base.ts` ALREADY RECORDS WHY THAT MATTERS ON THIS PATH. `crypto.subtle` is a
 * promise and would put the POST one turn later than every caller of the write path expects.
 * `getRandomValues` is not a promise, so the wire timing is exactly where it was.
 *
 * `null` RATHER THAN A WEAK TOKEN, AND THAT IS THE FAIL-SAFE DIRECTION. On a platform with no
 * CSPRNG the write carries no token at all, the server is sent a request byte-for-byte identical to
 * the one it was sent before this change, and no held row is ever released by correlation — the
 * text rule is all there is, exactly as today. A weak token would instead mean releasing rows on
 * evidence nobody can trust, and a released row is the operator's characters gone.
 */
export function mintWriteToken(): string | null {
  const source = globalThis.crypto;
  if (source === undefined || typeof source.getRandomValues !== "function") {
    return null;
  }
  const bytes = source.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let out = TOKEN_PREFIX;
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

/** Is `value` a token this app could have minted? Shape only — never "did I mint this one". */
function isToken(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** Is `value` an object this reader may walk the keys of? Not an array, not `null`, not a scalar. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * THE ONE PLACE THE ECHO'S SHAPE IS KNOWN. Read an envelope for the writes it acknowledges.
 *
 * ── THE GRAMMAR, DECLARED RATHER THAN INFERRED ──
 *
 * ONE SHAPE AND NO SECOND: `writes` is an OBJECT whose every value is an ARRAY of non-empty
 * STRINGS, keyed by path. Anything else at that key — an array, `null`, a number, a value that is
 * not a list of tokens — is a server saying something this browser cannot read, and the only safe
 * reading of "I cannot read your answer" is that NO WRITE IS PROVEN. Guessing here would release a
 * held row on a shape nobody agreed, which loses the operator's characters; that is the one
 * direction this module must never fail in.
 *
 * ABSENT IS NOT A SHAPE AT ALL: it is `silent`, and silence is the whole of the shipping condition.
 * The server half is merged and not deployed, so `silent` is what this reads in production today.
 *
 * TWO LOCATIONS, BOTH DECLARED, AND THE REASON IS STRUCTURAL RATHER THAN HEDGING. The graph server
 * puts `writes` at the TOP of its own envelope; `worker/src/app.js` rebuilds that envelope into
 * `{ok, handle, snapshot: {…}}` and carries `writes` INSIDE `snapshot`, beside `generated_at` and
 * `views`, because that is where the rest of the graph server's envelope lands. So the key really
 * does appear at two altitudes depending on which side of the Worker you are reading, and this
 * reader is on the browser side of both. Each is read with identical strictness and the tokens are
 * merged per path.
 */
export function readWriteEcho(envelope: unknown): EchoReading {
  if (!isRecord(envelope)) {
    return { outcome: "silent" };
  }
  const places: unknown[] = [envelope[WRITE_ECHO_KEY]];
  const snapshot = envelope["snapshot"];
  if (isRecord(snapshot)) {
    places.push(snapshot[WRITE_ECHO_KEY]);
  }

  const writes = new Map<string, string[]>();
  let present = false;
  for (const place of places) {
    if (place === undefined) {
      continue;
    }
    present = true;
    if (!isRecord(place)) {
      return {
        outcome: "unrecognised",
        problem:
          `'${WRITE_ECHO_KEY}' is ${JSON.stringify(place)}, which is not an object of ` +
          "path-to-tokens — no write is treated as landed from this projection",
      };
    }
    for (const [path, listed] of Object.entries(place)) {
      if (!Array.isArray(listed)) {
        return {
          outcome: "unrecognised",
          problem:
            `'${WRITE_ECHO_KEY}.${path}' is ${JSON.stringify(listed)}, which is not a list of ` +
            "write tokens — no write is treated as landed from this projection",
        };
      }
      const into = writes.get(samePath(path)) ?? [];
      for (const one of listed) {
        if (!isToken(one)) {
          return {
            outcome: "unrecognised",
            problem:
              `'${WRITE_ECHO_KEY}.${path}' contains ${JSON.stringify(one)}, which is not a write ` +
              "token — no write is treated as landed from this projection",
          };
        }
        into.push(one);
      }
      writes.set(samePath(path), into);
    }
  }
  return present ? { outcome: "echo", writes } : { outcome: "silent" };
}

/**
 * What one arrival did to the outstanding writes.
 *
 * `matched` — tokens THIS BROWSER put on the wire that the arrival acknowledged. The only positive
 *   evidence in this module, and the only thing a caller may release a held row on.
 * `gaveUp` — tokens whose grace ran out. THEY RELEASE NOTHING. See `WriteRegister.arrive`.
 */
export interface WriteEcho {
  readonly matched: readonly string[];
  readonly gaveUp: readonly string[];
}

/**
 * HOW MANY ARRIVALS THAT SPEAK ABOUT A WRITE'S OWN FILE MAY GO BY WITHOUT NAMING IT.
 *
 * THREE, AND "SPEAK ABOUT" IS THE LOAD-BEARING PART. A projection whose echo does not mention the
 * path at all counts for nothing here — it had no occasion to acknowledge the write, so treating
 * its silence as an answer would be reading evidence out of an absence. Only an arrival that lists
 * that path, and does not list this token among it, spends grace.
 *
 * THREE RATHER THAN ONE BECAUSE THE SERVER'S LEDGER IS CAPPED AND AGED — 8 tokens per path, 64
 * paths, a 24-hour TTL — so an echo can legitimately vanish, and a write's acknowledgement can
 * legitimately arrive on a LATER `GET /graph` rather than on the write's own answer. A number this
 * side of the caps costs nothing to be wrong about in the safe direction and buys the case the
 * contract explicitly allows.
 *
 * AND BEING WRONG COSTS NOTHING IN THE UNSAFE DIRECTION AT ALL, WHICH IS THE WHOLE REASON A SMALL
 * NUMBER IS ALLOWED. Giving up releases NOTHING. A vanished echo is never proof the write failed;
 * a token dropped too early can only mean a held row that stays held — the direction this whole
 * capability fails in on purpose.
 */
const GRACE = 3;

/**
 * The most writes one session may have outstanding. A backstop rather than a rule: writes are
 * closed by their own path's next projection, so reaching this means projections for those paths
 * stopped arriving entirely. The OLDEST is dropped, because a token nothing has acknowledged
 * through 64 later writes is not going to be.
 */
const CAPACITY = 64;

/**
 * THE WRITES THIS BROWSER HAS OUTSTANDING — one record per token, until it is matched or given up.
 *
 * PURE. It holds strings and counts, imports nothing, and reaches no global. A test drives it with
 * the DOM, the network and the clock all made to throw.
 *
 * ── IT IS NOT DECLARED, AND MUST NEVER BECOME SO ──
 *
 * The rule `focus.ts`, `draft.ts` and `held.ts` all state, applied here: a fact about the moment,
 * written into a file, is a fact that outlives the moment. An outstanding write is true for as long
 * as one browser is waiting for one answer. It does not survive a reload, and that is a property
 * rather than a gap — a token restored from storage would be a claim about a write this page never
 * made, and it would release held rows on it.
 *
 * ── TWO WRITES TO ONE PATH, WHICH IS WHY THIS IS A MAP AND NOT A FIELD ──
 *
 * The operator ticks a box and commits a line inside one cycle, or ticks two boxes. Both writes are
 * to one file and both are in the air at once — the situation `BaseSurface` counts per path for its
 * own reason. Keyed by TOKEN rather than by path, the browser learns which of ITS writes landed
 * rather than that SOME write did, which is the whole distinction this module was asked for.
 */
export class WriteRegister {
  #open = new Map<string, { readonly path: string; grace: number }>();

  /** A write left for the server carrying `token`, for `path`. The path is normalised on the way in. */
  open(token: string, path: string): void {
    // Re-opening a token that is already outstanding would restart its grace, so the first record
    // wins. Tokens are minted per write and never reused, so this is a guard rather than a case.
    if (this.#open.has(token)) {
      return;
    }
    if (this.#open.size >= CAPACITY) {
      const oldest = this.#open.keys().next();
      if (!oldest.done) {
        this.#open.delete(oldest.value);
      }
    }
    this.#open.set(token, { path: samePath(path), grace: GRACE });
  }

  /**
   * A PROJECTION ARRIVED. Say which outstanding writes it acknowledges, and which have run out.
   *
   * `writes` is the echo read off the envelope — `{path: [token, …]}` — and it is asked about BOTH
   * halves of the question, which is what makes this narrow rather than convenient.
   *
   * ── MATCHING IS PER PATH, BECAUSE THE SERVER'S CLAIM IS PER PATH ──
   *
   * The echo says exactly one thing: "this server accepted a write carrying this token FOR THIS
   * PATH". So a token is matched only when it appears under the path the write that minted it went
   * to. A token found under some other file's key acknowledges some other write, and the whole
   * point of a token is that the browser learns MY write landed rather than that some write did —
   * so this is the one comparison that must not be loosened for convenience.
   *
   * A TOKEN IN THE ECHO THAT THIS REGISTER NEVER OPENED IS IGNORED, SILENTLY AND ON PURPOSE. It is
   * a write some other session made, or one this page made before a reload.
   *
   * ── GIVING UP NEEDS THE ARRIVAL TO HAVE SPOKEN ABOUT THE FILE ──
   *
   * Grace is spent only when the echo LISTS the write's own path and does not list its token. An
   * arrival that says nothing about that file had no occasion to acknowledge the write, and reading
   * evidence out of that silence is exactly what the server's own caps and TTL make wrong.
   */
  arrive(writes: ReadonlyMap<string, readonly string[]>): WriteEcho {
    const matched: string[] = [];
    const gaveUp: string[] = [];
    for (const [token, record] of this.#open) {
      const named = writes.get(record.path);
      if (named === undefined) {
        continue;
      }
      if (named.includes(token)) {
        matched.push(token);
        continue;
      }
      record.grace -= 1;
      if (record.grace <= 0) {
        gaveUp.push(token);
      }
    }
    for (const token of matched) {
      this.#open.delete(token);
    }
    for (const token of gaveUp) {
      this.#open.delete(token);
    }
    return { matched, gaveUp };
  }

  /**
   * STOP WAITING FOR THIS ONE. The caller knows the write will never be acknowledged — the server
   * refused it (a 409 means nothing was written, so there is nothing to echo).
   *
   * IT RELEASES NOTHING AND PROVES NOTHING. Same as `arrive`'s `gaveUp`: this is the register
   * forgetting, never the strip letting go. Returns whether the token was outstanding.
   */
  giveUp(token: string): boolean {
    return this.#open.delete(token);
  }

  /** How many writes are outstanding — all of them, or just those for `path`. */
  outstanding(path: string | null = null): number {
    if (path === null) {
      return this.#open.size;
    }
    let count = 0;
    const wanted = samePath(path);
    for (const record of this.#open.values()) {
      if (record.path === wanted) {
        count += 1;
      }
    }
    return count;
  }

  /** Is this token still outstanding? Exported for a test to assert the lifecycle, not for a caller. */
  waiting(token: string): boolean {
    return this.#open.has(token);
  }

  /** Forget everything. Sign-out only, for the same reason `HeldSurface.clear` exists. */
  clear(): void {
    this.#open.clear();
  }
}

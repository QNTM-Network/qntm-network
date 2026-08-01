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
 * `{path, markdown, base}`, and the server echoes it in the envelope it later serves. A projection
 * carrying the token is the server saying, in one unambiguous string, "this projection includes the
 * write you made". That is POSITIVE EVIDENCE, which is the only kind of evidence this app is
 * allowed to release a held row on.
 *
 * ── WHAT THIS MODULE DELIBERATELY DOES NOT CLAIM ──
 *
 * A matched echo says the SERVER RECORDED THE WRITE. It does not say the line the operator typed
 * survived the cycle, and nothing here should ever be read as saying so — the cycle is entitled to
 * rewrite, move or delete what it ingests, and that is a decision about content the vault has
 * already taken, not a loss of the operator's characters. The strip's own claim is "characters no
 * file owns"; once the write landed, a file owned them.
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
 * The envelope key the echo is read from, at either of two DECLARED locations — see
 * `readWriteEcho`. Exported so a test can name it rather than repeat the string.
 */
export const WRITE_ECHO_KEY = "write_tokens";

/**
 * What reading an envelope's echo produced.
 *
 * `silent` — the envelope carries no such key at all. THE SHIPPING CONDITION: a server that has
 *   never heard of a write token produces this on every projection, and every caller below then
 *   behaves exactly as this app behaved before correlation existed.
 * `echo` — the key was present and its shape is one this reader declares. `tokens` may be empty:
 *   a server that knows the field and has nothing to say for this projection is not a problem.
 * `unrecognised` — the key was present and its shape is not one this reader declares. NO TOKEN IS
 *   TAKEN FROM IT, so nothing is released on the strength of a shape nobody agreed. Reported, so a
 *   contract drift between the two halves is visible rather than silently inert.
 */
export type EchoReading =
  | { readonly outcome: "silent" }
  | { readonly outcome: "echo"; readonly tokens: readonly string[] }
  | { readonly outcome: "unrecognised"; readonly problem: string };

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

/**
 * THE ONE PLACE THE ECHO'S SHAPE IS KNOWN. Read an envelope for the write tokens it acknowledges.
 *
 * ── THE GRAMMAR, DECLARED RATHER THAN INFERRED ──
 *
 * TWO LOCATIONS, BOTH DECLARED: `envelope.write_tokens` and `envelope.snapshot.write_tokens`. The
 * server half of this contract is being written in another repository AT THE SAME TIME as this
 * half, and the envelope already mixes both altitudes (`handle` and `pending_edits` are top level,
 * `generated_at` and `views` are inside `snapshot`). Declaring both is not guessing: each is read
 * with the same strictness, and a shape at either that this reader does not know is reported. It
 * collapses to whichever one the two halves settle on, and that edit is this function alone.
 *
 * THREE SHAPES, AND NO FOURTH:
 *   a STRING          — one token. The commonest shape for the answer to one write.
 *   an ARRAY of them  — several, for a projection that carries more than one write.
 *   `null`            — the server knows the field and has nothing for this projection. An empty
 *                       echo, which is a legal statement and not a malformation.
 * ABSENT is not a shape at all: it is `silent`, and silence is the whole of the shipping condition.
 *
 * NOTHING ELSE. A number, an object, an array with a non-string in it — each is a server saying
 * something this browser cannot read, and the only safe reading of "I cannot read your answer" is
 * that NO WRITE IS PROVEN. Guessing here would release a held row on a shape nobody agreed, which
 * loses the operator's characters; that is the one direction this module must never fail in.
 */
export function readWriteEcho(envelope: unknown): EchoReading {
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
    return { outcome: "silent" };
  }
  const record = envelope as Record<string, unknown>;
  const places: unknown[] = [record[WRITE_ECHO_KEY]];
  const snapshot = record["snapshot"];
  if (typeof snapshot === "object" && snapshot !== null && !Array.isArray(snapshot)) {
    places.push((snapshot as Record<string, unknown>)[WRITE_ECHO_KEY]);
  }

  const tokens: string[] = [];
  let present = false;
  for (const place of places) {
    if (place === undefined) {
      continue;
    }
    present = true;
    if (place === null) {
      continue;
    }
    if (isToken(place)) {
      tokens.push(place);
      continue;
    }
    if (Array.isArray(place)) {
      for (const one of place) {
        if (!isToken(one)) {
          return {
            outcome: "unrecognised",
            problem:
              `'${WRITE_ECHO_KEY}' contains ${JSON.stringify(one)}, which is not a write token — ` +
              "no write is treated as landed from this projection",
          };
        }
        tokens.push(one);
      }
      continue;
    }
    return {
      outcome: "unrecognised",
      problem:
        `'${WRITE_ECHO_KEY}' is ${JSON.stringify(place)}, which is not a write token, a list of ` +
        "write tokens or null — no write is treated as landed from this projection",
    };
  }
  return present ? { outcome: "echo", tokens } : { outcome: "silent" };
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
 * HOW MANY PROJECTIONS FOR A WRITE'S OWN FILE MAY ARRIVE WITHOUT ITS TOKEN BEFORE IT IS DROPPED.
 *
 * TWO, and the number is derived rather than picked. A write's own answer is the FIRST projection
 * for that path — that is where an echoing server puts the acknowledgement — and the second is the
 * grace for the case the design allows explicitly: the echo arriving on a `GET /graph` served
 * later rather than on the write's own answer. A third would be a token kept alive by projections
 * that have already had every opportunity to acknowledge it.
 *
 * IT COSTS NOTHING TO BE WRONG ABOUT, WHICH IS WHY IT IS ALLOWED TO BE A SMALL NUMBER AT ALL. Giving
 * up releases NOTHING. A token dropped too early can only mean a held row that stays held — the
 * direction this whole capability fails in on purpose.
 */
const GRACE = 2;

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

  /** A write left for the server carrying `token`, for `path`. */
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
    this.#open.set(token, { path, grace: GRACE });
  }

  /**
   * A PROJECTION ARRIVED. Say which outstanding writes it acknowledges, and which have run out.
   *
   * `path` is the file the projection describes, or `null` for an arrival that describes the whole
   * graph (a re-read). MATCHING IGNORES THE PATH ENTIRELY — a token identifies one write and needs
   * no help — and only the GIVING UP is path-aware, so a projection for another file can never
   * exhaust the grace of a write that is still waiting for its own answer. A `null` path therefore
   * matches everything and expires nothing, which is the honest reading of "this arrival says
   * nothing in particular about any one write".
   *
   * A TOKEN IN `tokens` THAT THIS REGISTER NEVER OPENED IS IGNORED, SILENTLY AND ON PURPOSE. It is
   * a write some other session made, or one this page made before a reload. "Some write landed" is
   * not the question; "MY write landed" is.
   */
  arrive(path: string | null, tokens: readonly string[]): WriteEcho {
    const matched: string[] = [];
    const gaveUp: string[] = [];
    for (const [token, record] of this.#open) {
      if (tokens.includes(token)) {
        matched.push(token);
        continue;
      }
      if (path !== null && record.path === path) {
        record.grace -= 1;
        if (record.grace <= 0) {
          gaveUp.push(token);
        }
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
    for (const record of this.#open.values()) {
      if (record.path === path) {
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

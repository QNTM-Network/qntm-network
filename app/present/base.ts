/**
 * BaseSurface — WHAT THE SERVER LAST SENT FOR THE FILE THE PAINTER IS HOLDING, and `baseOf`, the
 * token that fact becomes on the wire.
 *
 * PURE. No DOM, no fetch, no clock — the same posture as `focus.ts`, `draft.ts` and `motions.ts`,
 * and it imports nothing. `baseOf` is the one function here that reaches for a platform global, and
 * it is separated from the surface precisely so the surface stays a comparison of two strings.
 *
 * ── WHAT THIS IS FOR, IN ONE SENTENCE ──
 *
 * Every save this app makes posts the WHOLE FILE and the server overwrites what it is sent, so a
 * save computed against an out-of-date copy of that file silently discards everything that changed
 * in between — and what changes in between is the CYCLE'S OWN OUTPUT: a rule's tag, a task the
 * engine created, a stamp. The operator's typing is never the thing lost. The system's computed
 * behaviour is, every time, with no error and no exit code.
 * `docs/implementation-artifacts/design-the-edit-is-a-safe-haven.md` §3 measures it.
 *
 * ── THE HALF THIS BUILDS, AND THE HALF IT CANNOT ──
 *
 * This is the CLIENT half of optimistic concurrency control, and it is buildable with no server
 * change (design doc §8). It does two separable things:
 *
 *   1. IT DETECTS what the client can prove on its own — that the string an edit was computed
 *      against is not the string the server last sent for that file, or that an earlier save of the
 *      same file has not answered yet, so the server has already moved past whatever this one
 *      carries. Both are facts about the browser's own history and need nobody's cooperation.
 *   2. IT CARRIES `baseOf(source)` on the write, so that the server CAN one day refuse. That is
 *      row 5 (`the-write-is-refused-server-side`) and it touches a repository that is not this one.
 *
 * WHAT IT DOES NOT DO IS PREVENT THE WRITE, and that is a decision rather than an omission. A
 * client that refused its own save would lose the operator's characters and tell him nothing —
 * strictly worse than the defect. His typing still reaches the server; what changes is that a
 * divergence is SAID.
 *
 * IT ALSO CANNOT SEE A CHANGE IT WAS NEVER TOLD ABOUT. A cycle that rewrote the file on the server
 * while nothing arrived in the browser leaves this surface holding a base that looks current and is
 * not. Only the server can answer "what does this file say NOW", which is exactly why the base goes
 * on the wire and exactly why row 5 exists.
 *
 * ── WHY THE SURFACE HOLDS THE STRING AND THE WIRE CARRIES A HASH ──
 *
 * They are two different jobs and only one of them needs a digest. The client already HAS the
 * served markdown, so its own check is `served === source`, an exact comparison that cannot
 * collide. The server cannot be sent the whole previous file, so it gets `sha256-<hex>` of exactly
 * the same bytes. The detector therefore never depends on the hash at all, which is worth stating
 * because it is what makes the two halves shippable a row apart.
 *
 * ── ONE BASE, FOR THE FILE THE PAINTER WAS HANDED ──
 *
 * `FocusSurface`'s discipline, applied to a per-FILE fact: taken in the same call that installs a
 * projection for painting, replaced wholesale by the next one, and dropped when the graph is
 * dropped. A ledger of every file the session has ever seen would be a ledger of bases quietly
 * ageing behind views nobody is looking at, and a base that outlives the projection it was taken
 * from is a lie. Writes only ever come from the painted view, so one is all there is to hold.
 *
 * THE PENDING WRITES ARE THE ONE THING KEYED SEPARATELY, and they are a different fact with a
 * different lifetime: a write is outstanding until the network answers, whatever the operator does
 * to the view in the meantime. Counted per path rather than held as a flag because two saves to one
 * file really can be in the air at once — that is the very situation this detects.
 *
 * ── THE PER-LINE FACT NEXT DOOR IS NOT THIS FACT ──
 *
 * `instance.ts` and `focus.ts` identify a LINE inside a projection. This identifies a FILE'S
 * CONTENT. They answer different questions ("where did my cursor go" against "may I write this")
 * and must not be merged: a cursor that resolved perfectly says nothing about whether the file the
 * save is computed from is current, and a current base says nothing about where the cursor went.
 */

/**
 * What a write's base is, measured against what the server last sent.
 *
 * `current` — the edit was computed against exactly the markdown the server sent for this file.
 * `stale` — it was not, so the write discards whatever changed between the two.
 * `writing` — an earlier save of this same file has not answered yet, so no base the client holds
 *   can be current: its own outstanding write is already changing the file.
 * `unknown` — nothing has been taken for this path, so nothing can be compared. Reported rather
 *   than treated as `current`, because a check that quietly passes when it cannot run is
 *   decoration.
 */
export type BaseReading =
  | { readonly outcome: "current" }
  | { readonly outcome: "stale" }
  | { readonly outcome: "writing" }
  | { readonly outcome: "unknown" };

/** The digest's name, carried in the token so a later algorithm can be told apart from this one. */
const BASE_PREFIX = "sha256-";

/** SHA-256's round constants — the first 32 bits of the fractional parts of ∛(first 64 primes). */
const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** The initial state — the first 32 bits of the fractional parts of √(first 8 primes). */
const H0 = Uint32Array.from([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const rotr = (word: number, bits: number): number => (word >>> bits) | (word << (32 - bits));

/**
 * One 32-bit word out of an array.
 *
 * IT EXISTS FOR THE TYPE CHECKER AND NOT FOR SAFETY. `noUncheckedIndexedAccess` types every index
 * as possibly `undefined`, and every index below is in range by construction — the loops are the
 * fixed 16/64/8 of the specification. `?? 0` is unreachable; writing the arithmetic through one
 * accessor is what keeps that assertion in one place instead of in forty casts.
 */
const word = (words: Uint32Array, index: number): number => words[index] ?? 0;

/**
 * SHA-256 of `bytes`, as lowercase hex. FIPS 180-4, transcribed.
 *
 * WRITTEN OUT RATHER THAN CALLED FROM `crypto.subtle`, AND THE REASON IS TIMING RATHER THAN
 * PURITY. WebCrypto's digest is a PROMISE, and a promise before the POST puts the write one
 * asynchronous turn later than every caller of this app's write path expects — measured in node,
 * `await crypto.subtle.digest(...)` resolves AFTER a `setImmediate` scheduled at the same moment.
 * The write path is otherwise synchronous right up to `fetch`, so hashing there would have changed
 * WHEN the file goes on the wire in order to describe what is on it, which is a real behaviour
 * change smuggled in as an implementation detail. A pure function keeps the wire timing exactly
 * where it was.
 *
 * IT IS CHECKED AGAINST AN INDEPENDENT IMPLEMENTATION rather than trusted:
 * tests/present-base.test.mjs compares it with node's own `createHash("sha256")` over the empty
 * string, multi-byte UTF-8, and every length around the 55/56/63/64/65-byte padding boundaries. A
 * digest that disagreed with the world's sha256 would be a precondition the server can never
 * satisfy, so "it is really sha256" is the property that had to be provable.
 */
function sha256Hex(bytes: Uint8Array): string {
  // One 0x80 byte, then zeros, then a 64-bit big-endian bit count, rounded up to whole 64-byte
  // blocks — 9 is that byte plus those eight.
  const blocks = new Uint8Array((((bytes.length + 9 + 63) / 64) | 0) * 64);
  blocks.set(bytes);
  blocks[bytes.length] = 0x80;
  const view = new DataView(blocks.buffer);
  const bits = bytes.length * 8;
  view.setUint32(blocks.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(blocks.length - 4, bits >>> 0);

  const h = Uint32Array.from(H0);
  const w = new Uint32Array(64);
  for (let start = 0; start < blocks.length; start += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(start + i * 4);
    }
    for (let i = 16; i < 64; i += 1) {
      const x = word(w, i - 15);
      const y = word(w, i - 2);
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[i] = (word(w, i - 16) + s0 + word(w, i - 7) + s1) >>> 0;
    }
    let a = word(h, 0);
    let b = word(h, 1);
    let c = word(h, 2);
    let d = word(h, 3);
    let e = word(h, 4);
    let f = word(h, 5);
    let g = word(h, 6);
    let work = word(h, 7);
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = (e & f) ^ (~e & g);
      const t1 = (work + s1 + choice + word(K, i) + word(w, i)) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      work = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    const round = [a, b, c, d, e, f, g, work];
    for (let i = 0; i < 8; i += 1) {
      h[i] = (word(h, i) + (round[i] ?? 0)) >>> 0;
    }
  }
  return Array.from(h)
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}

/**
 * The base token for a file's exact bytes — `sha256-<hex>`.
 *
 * SHA-256 OF THE UTF-8 BYTES, UNNORMALISED, AND BOTH HALVES OF THAT ARE DECISIONS.
 *
 * SHA-256 because the server that will one day compare it (row 5, design doc §8.2, which says
 * `sha256` in as many words) must be able to compute it from the file on disk with no cooperation
 * from this code. Every language has sha256; nothing else about the token has to be agreed. A
 * hash of this project's own invention would have made the browser's arithmetic part of the
 * protocol, and row 5 would have had to port it.
 *
 * UNNORMALISED because the write unit is the WHOLE FILE, byte for byte. Folding CRLF into LF, or
 * ignoring a trailing newline, would make two files that really are different hash the same — and
 * a changed line ending and a lost final newline are exactly the kind of whole-file damage this
 * app's own POST is capable of doing. Normalisation here would not be tidiness; it would be a hole
 * in the check, in the direction of accepting.
 */
export function baseOf(markdown: string): string {
  return BASE_PREFIX + sha256Hex(new TextEncoder().encode(markdown));
}

export class BaseSurface {
  #path: string | null = null;
  #markdown: string | null = null;
  #writing = new Map<string, number>();

  /** The file this surface is holding a base for, or `null` when it holds none. */
  get path(): string | null {
    return this.#path;
  }

  /** The markdown the server last sent for that file, or `null` when none was taken. */
  get markdown(): string | null {
    return this.#markdown;
  }

  /**
   * THE SERVER SENT THIS FILE. Hold it as the base every write of that file is measured against.
   *
   * Called with the markdown out of the projection being installed — never with a string this app
   * computed. That distinction is the whole detector: the painter repaints OPTIMISTICALLY from its
   * own edited string after a commit (`paint.ts`'s `settle`), so a second edit made before the
   * answer comes back is computed against a string the server has never seen, and the comparison
   * below is what notices.
   */
  take(path: string, markdown: string): void {
    this.#path = path;
    this.#markdown = markdown;
  }

  /** A write of `path` left for the server and has not answered. */
  open(path: string): void {
    this.#writing.set(path, (this.#writing.get(path) ?? 0) + 1);
  }

  /** It answered, or it failed. Either way it is no longer in the air. */
  close(path: string): void {
    const open = (this.#writing.get(path) ?? 0) - 1;
    if (open > 0) {
      this.#writing.set(path, open);
    } else {
      this.#writing.delete(path);
    }
  }

  /** How many writes of `path` have not answered yet. */
  writing(path: string): number {
    return this.#writing.get(path) ?? 0;
  }

  /**
   * IS THIS WRITE'S BASE THE FILE THE SERVER LAST SENT? `source` is the exact string the edit was
   * applied to — `applyEdit`'s own input, handed up by the painter, never re-derived here.
   *
   * `stale` IS CHECKED BEFORE `writing` because it is the stronger statement: it says this write's
   * base is provably not the served copy, where `writing` only says the server has moved past
   * whatever base it carries. The two overlap (a second line commit inside one cycle is both) and
   * one sentence is what the operator gets, so the more specific one wins.
   */
  read(path: string, source: string): BaseReading {
    if (this.#path !== path || this.#markdown === null) {
      return { outcome: "unknown" };
    }
    if (this.#markdown !== source) {
      return { outcome: "stale" };
    }
    if (this.writing(path) > 0) {
      return { outcome: "writing" };
    }
    return { outcome: "current" };
  }

  /**
   * Forget the base. The pending writes are NOT forgotten — they are still in the air, and a
   * surface that pretended otherwise would report `current` for a save it knows is already
   * superseded.
   */
  drop(): void {
    this.#path = null;
    this.#markdown = null;
  }
}

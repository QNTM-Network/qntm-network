/**
 * declaration-version — a deterministic content-hash identity for what a `compile()` call
 * produced, so the same config compiles to the same version and a changed config cannot reuse an
 * old one. `design-the-runtime-compile.md` §8 step A.
 *
 * ── ZERO IMPORTS, ON PURPOSE — THE SAME REASON `ledger.mjs` AND EVERY `compile-*.mjs` FILE HAS
 *    NONE ──
 *
 * This module is imported from all three `compile-*.mjs` files, which must stay safe to import
 * inside a Cloudflare Worker isolate (`compile-structural.mjs`'s own header has the exact crash a
 * Node-specific import produced the first time this was tried). `node:crypto` would work under
 * this Worker's `nodejs_compat` flag, but `crypto.subtle.digest` — the Web Crypto primitive both
 * Node and `workerd` actually share — is ASYNCHRONOUS, and `compile(files)` is a pure, synchronous
 * function on both of its callers' critical paths (the CLI's `--check`, and the Worker's Gate 1,
 * which answers inside the same request that decides whether a write is accepted at all). Making
 * `compile` async to await a digest would change what every existing caller of it is, for a step
 * this design explicitly prices at "under an hour." So this hashes the way `app/present/base.ts`'s
 * `baseOf` already does for exactly the same reason (its own header: "an `await` before the POST
 * would put the write one asynchronous turn later than it has ever been") — SHA-256, transcribed by
 * hand, FIPS 180-4, synchronous. That file cannot be imported here (it is TypeScript, compiled only
 * for the browser bundle); this is a second, independent transcription for the Node/Worker side of
 * the repo, the same duplication this repo already accepts between `yaml-subset.mjs` and PyYAML
 * (`design-config-is-content.md` §2.2(a), "one implementation per concern" refused as a merge
 * target) rather than a new shared module reaching across a build boundary that does not exist yet.
 * `tests/declaration-version.test.mjs` cross-checks every case against Node's own
 * `crypto.createHash("sha256")`, the same falsifier `tests/present-base.test.mjs` already applies
 * to the TypeScript transcription.
 */

// SHA-256's round constants — the first 32 bits of the fractional parts of ∛(first 64 primes).
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

// The initial state — the first 32 bits of the fractional parts of √(first 8 primes).
const H0 = Uint32Array.from([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const rotr = (n, bits) => (n >>> bits) | (n << (32 - bits));
const word = (words, index) => words[index] ?? 0;

/**
 * SHA-256 of `bytes`, as lowercase hex. FIPS 180-4, transcribed — see this file's header for why
 * it is not `crypto.subtle.digest`.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function sha256Hex(bytes) {
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
    .map((w) => w.toString(16).padStart(8, "0"))
    .join("");
}

/**
 * `value`, re-encoded so that every object's own keys are sorted before `JSON.stringify` ever
 * sees them. Array order is left exactly alone — an array is a place this repo already uses to
 * mean "this order is the meaning" (`edgeTypes: [A, B]`, an `ordering:` list), and reordering it
 * here would hash two declarations that mean different things as the same version.
 *
 * WHY THIS EXISTS AT ALL, GIVEN `design-the-runtime-compile.md` §6 ALREADY PROVES EVERY OBJECT
 * `compile()` BUILDS IS ASSEMBLED IN A SORTED ORDER (view keys, `Ledger.toJSON()`'s own keys, …).
 * That finding is about the OBJECTS `compile()` HANDS BACK, not about every object this version key
 * itself might ever be asked to hash. Canonicalising here means the version key's own correctness
 * does not depend on every future caller re-deriving that same discipline by hand — it is provably
 * insensitive to insertion order, rather than merely observed to agree with it today.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function canonicalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = canonicalize(value[key]);
  }
  return sorted;
}

/** `JSON.stringify(value)`, but object keys are sorted first at every level. See `canonicalize`. */
export function canonicalJSON(value) {
  return JSON.stringify(canonicalize(value));
}

/**
 * The version key for one `compile()` call — `sha256-<hex>` of the canonical JSON of exactly the
 * two fields `compile()` returns to a caller, `declaration` and `dropped`, TOGETHER.
 *
 * WHY BOTH FIELDS, NOT `declaration` ALONE. `dropped` is not incidental logging — it is a real,
 * user-facing part of what a compile produced (the receipt's own delta, `design-config-is-
 * content.md` §5.3 point 1), and a compile that starts dropping something new while `declaration`
 * happens to stay byte-identical is a real change a caller must be able to see as a new version.
 * Excluding it would let two genuinely different compiles collide on one key.
 *
 * WHY THE COMPILED OUTPUT, NOT THE SUBMITTED INPUT FILES, AND NOT A COMPILER-VERSION TAG — see this
 * repository's PR body for the argued position; the short version is that this key's one job is to
 * NAME A BYTE STRING for cache-forever addressing (`design-the-runtime-compile.md` §4.2's immutable,
 * per-version URL), and hashing the bytes being named is the only way to make "same key ⇔ same
 * bytes" hold by construction rather than by discipline. Two different configs that happen to
 * compile to the identical output are not a defect to distinguish — they ARE the identical output,
 * and serving them under the identical immutable URL is correct, not an accident this key should
 * paper over.
 *
 * @param {{declaration: unknown, dropped: unknown}} compiled
 * @returns {string}
 */
export function versionKey(compiled) {
  const canonical = canonicalJSON({ declaration: compiled.declaration, dropped: compiled.dropped });
  return "sha256-" + sha256Hex(new TextEncoder().encode(canonical));
}

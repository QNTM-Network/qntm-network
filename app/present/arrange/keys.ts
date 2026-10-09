/**
 * Compare by a declared list of keys — THE ONE COMPARATOR for every order the app decides
 * (2026-10-09, backlog row one-ranking-for-every-list).
 *
 * PURE. Taken out of `arrange/ordering.ts`'s `compareDefaultTuples`, unchanged in behaviour: each
 * row is read into one `SortValue` per key, and the first key on which two rows differ decides.
 * Section ordering (the engine's `(tier, value)` rule, `section_builder.py:400-423`) and list
 * ranking (`app/present/rank.ts`) both call it, so there is one comparator, not two.
 *
 * ── THE TWO RULES IT KEEPS ──
 *
 * PRESENT BEFORE ABSENT, WHATEVER THE DIRECTION. `tier: 0` (the row has a value) sorts before
 * `tier: 1` (it has none), and `direction` reverses only the order of values within tier 0.
 *
 * STRINGS BY CODE POINT, as Python 3's `str.__lt__` does — not by JavaScript's `<`, which compares
 * UTF-16 code units and disagrees for an astral character. Numbers by difference.
 */

/** One row's value for one key. */
export interface SortValue {
  readonly tier: 0 | 1;
  readonly value: string | number;
}

/** A key's direction; `asc` when not given. */
export interface SortKey {
  readonly direction?: "asc" | "desc" | undefined;
}

/** Compare two strings by Unicode code point. */
export function compareCodepoints(a: string, b: string): number {
  const ac = Array.from(a);
  const bc = Array.from(b);
  const len = Math.min(ac.length, bc.length);
  for (let i = 0; i < len; i += 1) {
    const ca = ac[i]?.codePointAt(0) ?? 0;
    const cb = bc[i]?.codePointAt(0) ?? 0;
    if (ca !== cb) return ca - cb;
  }
  return ac.length - bc.length;
}

/** -1 if `a` sorts before `b` under `keys`, +1 after, 0 tied on every key. */
export function compareByKeys(a: readonly SortValue[], b: readonly SortValue[], keys: readonly SortKey[]): number {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const av = a[i];
    const bv = b[i];
    if (key === undefined || av === undefined || bv === undefined) continue;
    if (av.tier !== bv.tier) return av.tier - bv.tier; // present ALWAYS before absent, direction-independent
    if (av.tier === 1) continue; // both absent on this key — tied here, try the next key
    const diff =
      typeof av.value === "number" && typeof bv.value === "number"
        ? av.value - bv.value
        : compareCodepoints(String(av.value), String(bv.value));
    if (diff !== 0) return key.direction === "desc" ? -diff : diff;
  }
  return 0;
}

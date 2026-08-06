/**
 * The presentation levels, and THE precedence order — owned here and nowhere else.
 *
 * ── HOMED IN express/ — THE EXPRESS VERB ──
 *
 * The precedence order EXPRESS's cascade (`cascade.ts`) walks to turn assembled contributions into
 * one rendition decision per line. Only used by `cascade.ts` and, for typing, `context.ts`.
 *
 * A level is more specific than another when its fact becomes KNOWN LATER (design-presentation-
 * cascade.md section 2.1). The instance's default is known when it is configured; the cursor's
 * position is known at the instant it lands. Most specific wins, exactly as on ingest.
 *
 * SPECIFICITY IS OWNED IN EXACTLY ONE TUPLE AND NO CALLER MAY RE-EXPRESS IT. The engine paid for
 * that rule: its own levels.py carries a comment recording that the order used to be re-expressed
 * per key, per site, three times, and the hand-rolled copy in the differ was the one that was
 * wrong. The concrete form of the rule here is that `paint.ts` contains no
 * `if (focused) ... else if (mode === ...)` chain — it asks the cascade and obeys the answer.
 *
 * WHAT IS TRUE TODAY, so nobody reads more into this file than it earns: every one of the seven
 * levels is SILENT. Nothing in the shipped app contributes at any level, so every resolve() falls
 * through to DEFAULT and the painted output is exactly what it was before this module existed.
 * The order is declared now because the alternative — adding levels one at a time as each stage
 * needs one, each re-deciding where it sits — is how the engine got three copies of it.
 *
 * SUBTREE is deliberately absent, and node TYPE is deliberately not a level (it is the engine's
 * `render.shape`, which decides what markdown a node EMITS, orthogonal to how that markdown is
 * SHOWN). See design-presentation-cascade.md section 2.2 for both omissions and what would bring
 * SUBTREE back.
 */

/** The seven levels a presentation fact can be declared at. */
export type PresentationLevel =
  | "GLOBAL"
  | "USER"
  | "VIEW"
  | "STRUCTURAL_NODE"
  | "LINE"
  | "MODE"
  | "FOCUS";

/**
 * MOST SPECIFIC FIRST. The cascade walks this array in order and returns the first level that
 * says anything. Reordering this line reorders the whole system, which is the point of there
 * being one line.
 */
export const SPECIFICITY = [
  "FOCUS",
  "MODE",
  "LINE",
  "STRUCTURAL_NODE",
  "VIEW",
  "USER",
  "GLOBAL",
] as const satisfies readonly PresentationLevel[];

/**
 * SILENCE HAS ONE SPELLING. Absent, `undefined` and empty all mean "this level declares nothing",
 * and the predicate that says so lives with the levels rather than at each call site — the same
 * arrangement as the engine's `is_silent`. A level that spells silence differently from its
 * neighbour is how a cascade acquires a hole nobody can see.
 */
export function isSilent(contribution: Readonly<Record<string, unknown>> | undefined): boolean {
  return contribution === undefined || Object.keys(contribution).length === 0;
}

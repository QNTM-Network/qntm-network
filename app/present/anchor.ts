/**
 * anchor — WHICH line the cursor is in, expressed so that it survives the string being replaced.
 * PURE: no DOM, no fetch, no clock.
 *
 * ── THE DEFECT THIS MODULE IS THE ANSWER TO, MEASURED RATHER THAN REASONED ──
 *
 * `FocusSurface` held one number, and AN INDEX IS MEANINGFUL ONLY AGAINST THE STRING IT INDEXES.
 * Reproduced against `dist/present.js` through `tests/fixtures/dom-stub.mjs`, on unmodified
 * `origin/main` (f349b94), from two fixtures built out of `~/qntm/this_week.md`:
 *
 *   the cursor is in `- [ ] Pay back per Darinz' plan said on 16th May [[qntm:1232]] …`, index 5,
 *   and the operator has typed into it.
 *
 *   ARM 4  a cycle puts ONE line into `## Overdue`, above him. Repaint. The open `<input>` now
 *          holds `"## Overdue to Start"` — a HEADING — and his characters are gone. Exit 0,
 *          nothing thrown, nothing reported.
 *   ARM 5  his node leaves the view. Repaint. ZERO editable rows are painted, `focus.lineIndex`
 *          still says `5`, the cursor is nowhere on screen, and again nothing is reported.
 *
 * Silent in both directions. The second is the worse one: the system loses the cursor and says
 * nothing at all.
 *
 * ── IDENTITY, NOT REBASING, AND THE REASON IS NOT ELEGANCE ──
 *
 * The other candidate was to REBASE the index: diff the old source against the new one and map 5
 * forward. It is the operational-transformation shape and it is strictly more machinery — a diff,
 * plus a tie-break policy for an insertion landing exactly at the anchor. It also needs the OLD
 * source string to still be in hand at the moment the new one arrives, and in this app it is not:
 * `app/index.html`'s `paintView` reads its markdown out of `graphData`, which a fresh snapshot
 * replaces wholesale before anything repaints. So a rebase would first have to make the browser
 * retain a copy of a projection precisely so it could diff it against its successor.
 *
 * Identity needs none of that. The engine already stamps `[[qntm:N]]` into the printed line, it is
 * already on the wire, `paint.ts:306` already reasons about it, and it survives the case index
 * arithmetic cannot express at all: A MOVE BETWEEN SECTIONS. A rule that moves a task out of
 * `## Overdue to Start` into `## Scheduled This Week` is not "index 5 became index 12" to a diff;
 * it is a delete and an insert, and the tie-break that follows it is a guess.
 *
 * ── WHAT THE STAMP DOES NOT DO, AND THIS IS MEASURED IN THE OPERATOR'S LIVE VAULT ──
 *
 * A `[[qntm:N]]` IS NOT UNIQUE WITHIN A VIEW. `~/qntm/this_week.md` (read-only, 2026-07-31) prints
 * THREE nodes twice each — `qntm:1975`, `qntm:1986` and `qntm:1232` each appear once under
 * `## Due This Week` or `## Overdue to Start` and again under `## Scheduled This Week`, as
 * BYTE-IDENTICAL lines. That is 6 of the file's 15 node lines. So a resolver that took the first
 * match would silently put the cursor in the wrong printing of the right node on nearly half of the
 * operator's current week, and a resolver that refused every duplicate would refuse there too.
 *
 * THE SECTION IS WHAT TELLS THEM APART, and it is a structure this bundle already reads: a heading
 * is what bounds a `STRUCTURAL_NODE` (`levels.ts`), it is what `seedFor`'s rungs stop at
 * (`newline.ts`), and it is what `boundaryLine` walks. So the anchor carries the heading that opens
 * its section, and a rung that matches several lines narrows them by it before it gives up.
 *
 * ── THE RUNGS, AND THE ONE RULE THAT GOVERNS ALL OF THEM ──
 *
 * The same walk-the-rungs-and-report-which-answered shape `newline.ts` already uses. Most
 * trustworthy first:
 *
 *   STAMP              exactly one line in the projection carries this identity stamp
 *   STAMP_IN_SECTION   several do; exactly one of those is under the same heading
 *   TEXT               the line has no stamp (a heading, prose, a line the cycle has not stamped
 *                      yet) or its stamp is not in this projection — and exactly one line has its
 *                      exact source text
 *   TEXT_IN_SECTION    several do; exactly one of those is under the same heading
 *   (absent)           no rung answered. REPORTED, never guessed
 *
 * **A RUNG THAT FINDS NOTHING PASSES. A RUNG THAT FINDS TOO MANY STOPS.** Falling through from an
 * ambiguous STAMP to TEXT would be settling a strong fact's tie with a weaker one: if a node is
 * printed twice inside ONE section, both rows really are that node, and picking between them by
 * their characters picks a PRINTING rather than a node. The app cannot know which printing the
 * cursor was in, so it says `ambiguous` and hands the candidates back. Ambiguity is a THIRD
 * OUTCOME, not a first match.
 *
 * ── WHICH INDEX THIS IS EXPRESSED AGAINST, DECIDED ONCE FOR EVERY LATER ROW ──
 *
 * **THE SOURCE LINE INDEX. Never a painted-row ordinal.** `design-the-vim-cursor.md` §3.4 observes
 * that a blank line is dropped from the paint and gets no row, so the count of painted rows and the
 * count of source lines diverge. That is real, and it is NOT a second coordinate system: `paint.ts`'s
 * own `lastPaintedIndex` holds the SOURCE index of the last line that got a row (`paint.ts:674`,
 * `lastPaintedIndex = index`), so it is a filtered sample of the source indices, not an ordinal in a
 * different space. Everything that WRITES already speaks source indices — `applyEdit`'s `set-line`
 * and `insert-line` (`source.ts`), `seedFor` (`newline.ts`), `clampLine` (`motions.ts`),
 * `boundaryLine` (`boundary.ts`) — so expressing the anchor any other way would buy a conversion at
 * every one of those boundaries and avoid one at none. Row 3's held line and any later visual range
 * take the same authority.
 *
 * ── A BLANK LINE HAS NO IDENTITY, AND SAYS SO INSTEAD OF PRETENDING ──
 *
 * `anchorFor` returns `null` for a blank or whitespace-only line. It has no stamp, and its "exact
 * source text" is a string every other blank line in the view also has, so tier 2 would come back
 * ambiguous every single time. Vim's `j`/`k` CAN put the selection on a blank line (`paint.ts` draws
 * a mark for exactly that), so this is a real state and not a hypothetical — and "there was nothing
 * to hold onto" is a better thing to report than a tie nobody can break.
 *
 * ── DERIVED, NOT DECLARED — THE SAME RULE `FocusSurface` AND `DraftSurface` ALREADY KEEP ──
 *
 * An anchor is computed from a source string and a line index at the moment the cursor lands, held
 * for as long as the cursor is there, and thrown away. It has no declaration home and must never
 * grow one. It is a fact about the moment, and this module adds no `Contribution`, no cascade rung
 * and no edit kind — it decides WHERE the cursor is, never how anything renders.
 */

import { classifyLine, qntmIdSpans } from "./resolution.js";

/**
 * Which rung answered, most trustworthy first.
 *
 * ORDERED, AND EXPORTED ORDERED, for the same reason `levels.ts` exports `SPECIFICITY`: a caller
 * that has to compare two readings — row 3's held line will — must not have to re-derive the order
 * from a comment. A cursor restored by `TEXT` and a cursor restored by `STAMP` are not equally
 * trustworthy, and the difference is a fact about the resolution, not a matter of taste.
 */
export const ANCHOR_TRUST = ["STAMP", "STAMP_IN_SECTION", "TEXT", "TEXT_IN_SECTION"] as const;

/** Which rung answered. See `ANCHOR_TRUST` for the order and the header for what each one means. */
export type AnchorTier = (typeof ANCHOR_TRUST)[number];

/** WHICH line the cursor is in, expressed so it survives the source string being replaced. */
export interface Anchor {
  /**
   * The line's own `[[qntm:N]]` identity stamp, verbatim, or `null` when it carries none.
   *
   * THE FIRST STAMP ON THE LINE, and that is the node's own rather than an arbitrary choice: the
   * engine's renderer emits identity before the chrome cells that carry outgoing edges (see
   * `resolution.ts`'s `wikiLinkSpans` note, citing `renderer.py`'s `chrome_cells`, "emitted LAST"),
   * so on `- [x] Store all somewhere [[qntm:1723]] … #requires [[JB to send over Sarasin]]`
   * (`~/qntm/habits.md:24`, read-only) the first bracketed span IS the node.
   */
  readonly stamp: string | null;
  /** The line's exact source text, as painted. Tier 2's whole content. */
  readonly text: string;
  /**
   * The heading line that opens this line's section, verbatim, or `null` above the first heading.
   * What breaks a tie between two printings of one node — see the header, where the operator's own
   * `this_week.md` prints three nodes twice each.
   */
  readonly section: string | null;
  /**
   * The index the cursor was at when this anchor was taken.
   *
   * A REPORTING FIELD AND NOTHING ELSE. `resolveAnchor` never reads it — that is the whole point of
   * the module, and `tests/present-anchor.test.mjs` proves it by corrupting this field and asserting
   * the resolution does not move. It is here so a refusal can say WHERE the operator was, which is
   * what row 4 (`the-vanished-line-is-parked-not-dropped`) needs in order to park his characters.
   */
  readonly takenAt: number;
}

/**
 * What the walk found. Four outcomes, all explicit, none of them silence.
 *
 * `unanchored` is not a rung — it is "no anchor was ever taken", which happens when the cursor is
 * nowhere, when it was put on a line without a source to anchor against, or when it is on a blank
 * line. It is a member of this union rather than a `null` return so that a caller's switch is
 * exhaustive and cannot fall past it by accident, which is exactly how the silence this module
 * exists to end got in.
 */
export type AnchorReading =
  | { readonly outcome: "found"; readonly tier: AnchorTier; readonly lineIndex: number }
  | { readonly outcome: "ambiguous"; readonly tier: AnchorTier; readonly candidates: readonly number[] }
  | { readonly outcome: "absent" }
  | { readonly outcome: "unanchored" };

/** The first `[[qntm:N]]` on a line, verbatim, or `null`. See `Anchor.stamp` for why the first. */
function stampOf(line: string): string | null {
  const [first] = qntmIdSpans(line);
  return first === undefined ? null : line.slice(first.start, first.end);
}

/** The heading that opens `lineIndex`'s section — the nearest heading strictly above it. */
function sectionOf(lines: readonly string[], lineIndex: number): string | null {
  for (let at = lineIndex - 1; at >= 0; at -= 1) {
    const line = lines[at] ?? "";
    if (classifyLine(line).kind === "heading") {
      return line;
    }
  }
  return null;
}

/**
 * The anchor for the line at `lineIndex` in `source`, or `null` when that line has no identity to
 * hold onto — out of range, or blank (see the header).
 */
export function anchorFor(source: string, lineIndex: number): Anchor | null {
  const lines = source.split("\n");
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) {
    return null;
  }
  const text = lines[lineIndex] ?? "";
  if (classifyLine(text).kind === "blank") {
    return null;
  }
  return {
    stamp: stampOf(text),
    text,
    section: sectionOf(lines, lineIndex),
    takenAt: lineIndex,
  };
}

/**
 * One rung: the candidates it matched, and the same candidates narrowed to the anchor's section.
 *
 * NARROWING IS ATTEMPTED ONLY WHEN THE RUNG IS AMBIGUOUS, so a unique match never has to agree
 * about its section — a cycle that renamed the heading above a stamped line has not moved the line,
 * and refusing it for that would be the anchor being LESS robust than the stamp it is built on.
 */
function decide(
  candidates: readonly number[],
  lines: readonly string[],
  anchor: Anchor,
  tier: AnchorTier,
  narrowedTier: AnchorTier,
): AnchorReading | null {
  if (candidates.length === 0) {
    return null; // This rung found nothing. The walk goes on. See the header's one rule.
  }
  if (candidates.length === 1) {
    return { outcome: "found", tier, lineIndex: candidates[0] as number };
  }
  const inSection = candidates.filter((at) => sectionOf(lines, at) === anchor.section);
  if (inSection.length === 1) {
    return { outcome: "found", tier: narrowedTier, lineIndex: inSection[0] as number };
  }
  // TOO MANY, AND THE SECTION DID NOT SETTLE IT. The walk STOPS here rather than dropping to a
  // weaker rung — see the header. The candidates go back to the caller so a refusal can name them.
  return { outcome: "ambiguous", tier, candidates: inSection.length > 1 ? inSection : candidates };
}

/**
 * Where `anchor`'s line is in `source` now — and WHICH RUNG SAID SO.
 *
 * Never reads `anchor.takenAt`. The whole claim of this module is that the answer does not depend
 * on where the line used to be, and a function that consulted the old index would make that claim
 * untestable.
 */
export function resolveAnchor(anchor: Anchor, source: string): AnchorReading {
  const lines = source.split("\n");

  if (anchor.stamp !== null) {
    const wanted = anchor.stamp.toLowerCase();
    const byStamp: number[] = [];
    lines.forEach((line, at) => {
      if (stampOf(line)?.toLowerCase() === wanted) {
        byStamp.push(at);
      }
    });
    const reading = decide(byStamp, lines, anchor, "STAMP", "STAMP_IN_SECTION");
    if (reading !== null) {
      return reading;
    }
  }

  const byText: number[] = [];
  lines.forEach((line, at) => {
    if (line === anchor.text) {
      byText.push(at);
    }
  });
  const reading = decide(byText, lines, anchor, "TEXT", "TEXT_IN_SECTION");
  if (reading !== null) {
    return reading;
  }

  // TIER 3. The line is not in this projection, and this is the outcome that ships today as
  // silence: zero editable rows, the index unchanged, nothing said. It is REPORTED rather than
  // guessed, and what to DO about it — park the characters where they can be recovered — is row 4.
  return { outcome: "absent" };
}

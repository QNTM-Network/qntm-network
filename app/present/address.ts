/**
 * address — L3 ADDRESSING: naming the `(view, section)` a printed row sits in, BY THE CONFIG'S OWN
 * SECTION ID. PURE: no DOM, no fetch, no clock, no config file read here — the id list arrives as
 * a parameter, already validated by `qualification.ts`.
 *
 * `docs/implementation-artifacts/design-the-resolution-architecture.md` names this layer directly
 * (§3.1): the cascade cannot select a `STRUCTURAL_NODE` contribution without knowing WHICH
 * structural node it is resolving at, and nothing did that job — `instance.ts`, `boundary.ts` and
 * `focus.ts` all answer "where is this row" and none of them answers "what does this row resolve
 * to". This module is the join the design document calls step 2, and the layer's name.
 *
 * ── THE BLOCKER, STATED PLAINLY ──
 *
 * The app already knows a section by its POSITIONAL ORDINAL — the Nth heading walked from the
 * markdown (`instance.ts`'s own `section` field, `boundary.ts`'s heading-crossing). The declaration
 * is keyed on the config's section `id:` string (`inbox-tagged`, `domain-empty`), because that is
 * what `membershipFor` (`membership.ts:190-196`) needs to look up a section's qualification.
 * Nothing mapped one to the other. This module is that map.
 *
 * ── THE TRAP THIS MODULE IS BUILT SO IT CANNOT BE FALLEN INTO ──
 *
 * `QualificationLanguage.sections` is a PROPER SUBSET of the config's declared sections — only the
 * ones whose qualification survived normalisation. On `daily-work` it is 1 of 5; on
 * `daily-personal`, 3 of 8. `Object.keys(sections[view])[ordinal]` would index that subset and be
 * silently wrong on exactly those two views — the operator's own daily surfaces — while working on
 * the other 25 published views, which is what makes the mistake easy to ship and hard to notice.
 *
 * This module NEVER reads `QualificationLanguage.sections`. Its one input besides the source and
 * the line index is `sectionOrder: Record<view, string[]>` — the FULL declared order, published by
 * `generate-qualification-declaration.mjs` specifically because `sections` cannot be trusted for
 * this. There is no `sections`-shaped parameter this function could accidentally be called with
 * instead; the type signature only accepts the full order. That is what makes the trap impossible
 * rather than merely avoided: a caller cannot pass the subset by mistake because the subset is a
 * `Record<string, Record<string, SectionQualification>>`, a different shape than
 * `Record<string, readonly string[]>`, and TypeScript refuses the call.
 *
 * ── THE ORDINAL, COUNTED THE SAME WAY `instance.ts` COUNTS IT ──
 *
 * A heading OPENS the section it is the first line of (renderer.py:399/:430 attribute a heading
 * LINE's own record to the section it is about to render, not the one above it —`instance.ts`'s
 * header cites the same two lines for its own ordinal). So the ordinal for `lineIndex` is the
 * number of heading lines at-or-above it, minus one, 0-based; `null` above the file's first
 * heading, matching `instance.ts`'s `section: null` for the same position and `boundary.ts`'s
 * "above the first heading" floor.
 */

import { classifyLine } from "./resolution.js";

/**
 * The 0-based ordinal of the section that contains `lineIndex` — counting every heading at or
 * above it. `null` above the file's first heading, or when `lineIndex` is out of range.
 *
 * Deliberately NOT reused from `instance.ts`'s `instancesOf`: that function returns `null` for a
 * BLANK line (nothing to give an instance id to), but a blank line still sits inside a section
 * positionally — the cursor can rest on one before anything is typed — and `sectionAt` must answer
 * for it. Recomputing the walk here, rather than widening `instancesOf`'s contract, keeps that
 * module's "no id for a line with nothing to be an id OF" rule intact for its own callers.
 */
export function sectionOrdinalAt(source: string, lineIndex: number): number | null {
  const lines = source.split("\n");
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) {
    return null;
  }
  let ordinal: number | null = null;
  for (let at = 0; at <= lineIndex; at += 1) {
    if (classifyLine(lines[at] ?? "").kind === "heading") {
      ordinal = ordinal === null ? 0 : ordinal + 1;
    }
  }
  return ordinal;
}

/**
 * The config's own section id for the section that contains `lineIndex` in `view` — the join this
 * module exists for. `sectionOrder` MUST be the full declared order
 * (`QualificationLanguage.sectionOrder`), never the published-predicate subset
 * (`QualificationLanguage.sections`) — see the module header for why the type signature makes that
 * mistake unrepresentable rather than merely documented against.
 *
 * `null` when: `lineIndex` has no ordinal (above the first heading, blank source, out of range);
 * `view` is not in `sectionOrder` (an unpublished or unknown view); or the ordinal runs past the
 * end of the declared list (a markdown file with more headings than the config declares — the one
 * case `design-the-resolution-architecture.md` step 1's own falsifier exists to catch upstream,
 * never guessed at here).
 */
export function sectionAt(
  source: string,
  lineIndex: number,
  view: string,
  sectionOrder: Readonly<Record<string, readonly string[]>>,
): string | null {
  const ordinal = sectionOrdinalAt(source, lineIndex);
  if (ordinal === null) {
    return null;
  }
  const order = sectionOrder[view];
  if (order === undefined) {
    return null;
  }
  return order[ordinal] ?? null;
}

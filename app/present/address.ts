/**
 * address — L3 ADDRESSING: naming the `(view, section)` a printed row sits in, BY THE CONFIG'S OWN
 * SECTION ID. PURE: no DOM, no fetch, no clock, no config file read here — the id list arrives as
 * a parameter, already validated by `qualification.ts`.
 *
 * ── NOT HOMED IN select/, arrange/ OR express/ — SHARED ACROSS ALL OF THEM, ON PURPOSE ──
 *
 * "Which (view, section) is this row" sounds like SELECT, but this module is consumed by every
 * axis equally: `newline.ts` (SELECT's registration), and all four `resolvers/*.ts` — SELECT,
 * ARRANGE, RULES and promotion alike — call `sectionAt`/`sectionOrderFor` as their first step.
 * Homing it inside one verb's directory would make the other three reach across a boundary for a
 * fact that belongs to none of them more than the others. Left at the top level as the shared
 * addressing primitive docs/implementation-artifacts/design-the-resolution-architecture.md §3.1
 * (quoted below) names it as — the join every layer needs before it can ask its own question.
 *
 * `sectionOrderFor`, below `sectionAt`, is step 11 (design-the-resolution-architecture.md) narrowed
 * to what a server that never runs the renderer can actually publish — see its own header for why
 * that is the declared section ORDER and not a per-line section, and what would need to change,
 * elsewhere, for the stronger form.
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

import { classifyLine } from "./express/rendition.js";

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

/**
 * ── AN INSERTION INDEX IS NOT A READ INDEX, AND ADDRESSING THEM THE SAME WAY IS A DEFECT ──
 *
 * The config's own section id for the section a line INSERTED at `lineIndex` would sit in.
 * `sectionAt` above answers for a line that EXISTS at `lineIndex`; this one answers for a line that
 * does not exist yet and is about to take that index, pushing whatever is there now down. Those are
 * two different positions in the file and they name two different sections at two boundaries:
 *
 *   THE END OF THE FILE. `applyEdit`'s `insert-line` convention (source.ts) accepts `lineIndex ===
 *     lines.length` — one past the last line, which is what `o` on the trailing blank line asks for
 *     and what every rendered view ends with, because the engine's own writer terminates the file
 *     with a newline. `sectionOrdinalAt` REFUSES that index (`lineIndex >= lines.length`), and it
 *     is right to: no line is there to be read. So `sectionAt` returned `null`, `newline.ts` seeded
 *     no tokens, and a real browser run on 2026-08-01 showed the cost — `o` on the trailing blank
 *     line of `personal/all` seeded a bare `- [ ] ` where `o` one line higher seeded
 *     `- [ ] #task #personal `. The chrome was right by COINCIDENCE OF THE NEIGHBOUR (the printed
 *     rungs still answered from the line above); the declaration was never consulted at all.
 *
 *   THE LINE BEFORE A HEADING. Inserting AT the index a heading currently occupies puts the new
 *     line ABOVE that heading — in the section the heading CLOSES, never the one it opens.
 *     `sectionAt` at that index names the heading's OWN section, one too far. On `~/qntm/inbox.md`,
 *     whose two headings are adjacent lines, `o` on `## Inbox` addressed `domain-empty`.
 *
 * THE RULE, AND IT IS ARITHMETIC RATHER THAN A SPECIAL CASE. A line inserted at `lineIndex` sits
 * after existing line `lineIndex - 1` and before existing line `lineIndex`. The headings at or
 * above it are therefore exactly the headings at or above `lineIndex - 1` — so the insertion's
 * ordinal IS `sectionOrdinalAt(source, lineIndex - 1)`, and this function is `sectionAt` asked
 * about the line the new one lands after. Both boundaries fall out of that single subtraction:
 * `lines.length` becomes the last real line, and a heading's index becomes the line above it.
 *
 * `lineIndex === 0` STILL REFUSES, and that refusal is kept rather than tidied away. A line
 * inserted at 0 lands above the file's first heading, where the config declares no section at all
 * — `sectionAt(source, -1, …)` is `null` and that is the correct answer, the same one
 * `sectionOrdinalAt` gives every other position outside a section.
 *
 * `sectionAt` ITSELF IS UNTOUCHED. Its two callers in `app/index.html` (`commitLine`) address a
 * line the operator has ALREADY typed into, at an index that really holds it; changing that
 * function's range would widen a read to a position with nothing to read.
 *
 * ── THERE IS NO RANGE GUARD HERE, AND ITS ABSENCE IS THE MEASURED DECISION ──
 *
 * One was written and then removed, because it could not be made to fail. The legal insertion
 * range is `[0, lines.length]`; subtracting one maps it onto `[-1, lines.length - 1]`, and
 * `sectionOrdinalAt` already refuses BOTH ends of that — `-1` for being negative and
 * `lines.length` for being past the last line. So every out-of-range insertion index (negative,
 * fractional, or past `lines.length`) reaches `sectionAt` as an out-of-range READ index and is
 * refused there, by the check that already exists. A second guard in front of it would be a branch
 * no test could turn red, which is worse than no branch: it reads as a protection and defends
 * nothing. THE REFUSAL IS STILL PROVEN — `tests/app-seed-from-cascade.test.mjs` section 2 asserts
 * it at `lines.length + 1`, at `-1` and at a fractional index, against this function directly.
 */
export function sectionForInsertAt(
  source: string,
  lineIndex: number,
  view: string,
  sectionOrder: Readonly<Record<string, readonly string[]>>,
): string | null {
  return sectionAt(source, lineIndex - 1, view, sectionOrder);
}

/**
 * ── STEP 11, NARROWED TO WHAT THE SERVER CAN ACTUALLY EMIT ──
 * (design-the-resolution-architecture.md step 11: "carry section identity in the envelope")
 *
 * `server/app.py`'s `_envelope()` (monorepo, read read-only — `server/app.py:149-197`) reads each
 * view's CONFIG and its RAW MARKDOWN; it never runs the renderer. GET /graph does not call
 * `run_cycle`, and even POST /cycle's own `RenderedLineRecord` — the fact that WOULD answer
 * "which section is line N in" directly — is computed and discarded before `_envelope()` builds its
 * response (design-the-resolution-architecture.md §5.9). So the server can publish the DECLARED
 * section order per view (the same list step 1's generator already reads off the identical config,
 * `view.sections[].id`, in file order) — cheaply, no renderer, no database read, no migration — and
 * CANNOT publish a per-line section without a change to the engine/server pairing that captures
 * `RenderedLineRecord` before it is thrown away, which is a change this repo cannot make (filed:
 * `carry-declared-section-order-in-the-server-envelope`, backlog.yaml). `sectionOrdinalAt` above —
 * counting headings to find WHICH ordinal a line sits at — is therefore still necessary after step
 * 11 lands server-side; nothing about that walk goes away. What step 11 can change is the SOURCE of
 * the ordinal->id table `sectionAt` indexes: today it is always the declaration baked into
 * `dist/present.js` at build time; once the server carries it, it can be the LIVE config instead,
 * closing a real staleness gap `server/app.py`'s own docstring names — `POST /config` updates
 * `/data/config` "without a redeploy" of the static app bundle that bakes the declaration.
 *
 * `sectionOrderFor` is the one place a caller prefers the live-served order over the static one.
 * `sectionAt` ITSELF IS UNTOUCHED — this function only produces the same `Record<string, readonly
 * string[]>` shape `sectionAt`'s `sectionOrder` parameter already accepts, so wiring this in is a
 * change at the CALL SITE, never inside `sectionAt`'s own logic.
 *
 * PER VIEW, WHOLESALE, NEVER MERGED ELEMENT-BY-ELEMENT. A served view's own `sections` array, when
 * present, REPLACES that view's declared order entirely — mixing the two lists index-by-index would
 * silently misalign every ordinal after the first point they disagree, which is a worse failure
 * than either list alone.
 *
 * CORRECTED 2026-08-17 — THE PREMISE BELOW WAS TRUE WHEN WRITTEN (2026-08-01) AND STOPPED BEING
 * TRUE FIFTEEN DAYS LATER, SILENTLY. `GET /app/graph?include_structure=true` (2026-08-16, structural
 * composition) now DOES put a `sections` key on every served view — but it is a section TREE,
 * `Record<sectionId, {section_id, roots}>`, a completely different shape built for a completely
 * different reader (`app/present/express/viewmarkdown.ts`'s structural nesting). It has nothing to
 * do with THIS function's `sections`, which was always meant to be a plain ordered array of section
 * ids. Same field name, two unrelated features, fifteen days apart — and because this function
 * only checked `!== undefined`, it read the tree object as if it were the array, silently replacing
 * every view's correct declared order with a non-array it could never index into. Observed live
 * 2026-08-17: `sectionAt` returned `null` for every commit on every view, because `order[ordinal]`
 * was `object[0]` — not the section id at that position, since the object has no numeric keys at
 * all — and every graph-aware resolver (promotion is the one that surfaces it, being the only one
 * that needs a section id for a DIFFERENT line) abstained `no-section-declaration` universally,
 * including for relationships that had always existed and had nothing to do with anything new.
 *
 * THE GUARD BELOW IS THE FIX, AND IT IS NARROW ON PURPOSE: `Array.isArray` is the one true fact
 * that tells the two shapes apart (an array vs. a plain object keyed by section id), so a genuine
 * future array-shaped override (server/app.py has still never sent one — see below) still applies
 * exactly as designed, and the tree object is now correctly treated as "nothing to override with,"
 * the same as `undefined` always was.
 *
 * ADDITIVE BY CONSTRUCTION, NOT BY CONVENTION: `server/app.py`'s served view was `{id, path, title,
 * domain, markdown}` on 2026-08-01, with no `sections` key at all, so `view.sections` read
 * `undefined` for every real view and this function returned `declared` UNCHANGED (same reference,
 * not a copy). That premise is what the 2026-08-17 correction above restates precisely: additive
 * held only until a second feature reused the field name, which is exactly the failure a type guard
 * — not a comment — has to stand between the two.
 */
export function sectionOrderFor(
  view: { readonly id: string; readonly sections?: unknown },
  declared: Readonly<Record<string, readonly string[]>>,
): Readonly<Record<string, readonly string[]>> {
  if (!Array.isArray(view.sections)) {
    return declared;
  }
  return { ...declared, [view.id]: view.sections };
}

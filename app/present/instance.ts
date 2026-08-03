/**
 * instance — presentation-instance identity: a stable id for a PRINTED LINE, derived from the
 * source string alone. PURE: no DOM, no fetch, no clock.
 *
 * ── WHAT THIS MODULE ANSWERS, AND WHAT IT REPLACED ──
 *
 * `FocusSurface` used to answer "which line is the cursor on now" by walking four rungs — STAMP,
 * STAMP_IN_SECTION, TEXT, TEXT_IN_SECTION, in a module called `anchor.ts` — each a fresh scan of
 * the projection, narrowed by a heading's TEXT when a scan found too many.
 * `design-presentation-instance-identity.md` (§1.2) measured that the first three of those four
 * collapse into ONE fact the engine already computes every cycle and throws away:
 * `(section_id, node_id)` — RenderedLineRecord, renderer.py:169-184, discarded before it reaches
 * `line_cache` (persistence/schema.py:41-49). This module RE-DERIVES that fact in the browser, from
 * data the projection already carries, and IS what `focus.ts` calls now — `anchor.ts` is deleted
 * (2026-07-31, proved dead by removing it and rebuilding: `npm run typecheck` and `npm run build`
 * stayed clean with nothing importing it, and the only test that broke was the one that imported
 * its symbols directly, since rewritten — `tests/present-anchor.test.mjs`), not kept beside its
 * replacement. Its four-rung walk collapses to the two-tier one below — see `resolveInstanceAnchor`
 * for which tiers survive, and why.
 *
 * ── THE SECTION IS AN ORDINAL, NEVER THE HEADING'S CHARACTERS — THIS IS THE WHOLE FIX ──
 *
 * `design-presentation-instance-identity.md` §2.3(c) measured, across all five of the operator's
 * live views: the Nth heading in a rendered file IS the Nth section the view's config declares, in
 * order, 24 declared sections against 24 headings, exact positional match, every time — because the
 * renderer walks `compiled_sheet.manifest` in the ORDER the config lists it (renderer.py:341) and a
 * section still emits its heading even when it qualifies nothing. So "which section is this line
 * in" is answerable by COUNTING HEADINGS, without ever reading a config file, and the count is
 * stable under exactly the kind of edit that broke the old rungs: `~/qntm/metrics.md` prints five
 * headings as `## <name> <emoji> <ratio>`, and the ratio changes every cycle while the ORDER of the
 * five sections does not (design doc §1.3, measured live: `0.49` became `0.44` between two reads of
 * the same file). A rung keyed on the heading's CHARACTERS calls that a vanished line. A section
 * ordinal does not, because the ordinal never read the ratio in the first place.
 *
 * THIS IS ALSO WHY A HEADING'S OWN IDENTITY TOKEN IS A CONSTANT, NOT ITS TEXT — the one asymmetry
 * in this module worth stating up front. A heading is what OPENS the section it is assigned to
 * (matching the engine's own attribution: renderer.py:399 and :430 both give a heading LINE's
 * record `section_id=section.id` for the section it is about to render, the same key its own body
 * gets), so exactly one heading exists per section ordinal, by construction. The ordinal alone
 * already disambiguates it from every other line in the view; re-deriving a second fact from its
 * changing characters would only reintroduce the bug this module exists to remove. So a heading's
 * token is `HEADING_TOKEN` below — unless it carries a `[[qntm:N]]` stamp of its own (a
 * `structural_edge_types` header IS a node's own rendered manifestation, renderer.py:396-419), in
 * which case the node wins, exactly as it does for every other line.
 *
 * ── NODE BESIDE INSTANCE, NEVER INSTANCE ALONE — REFUTATION 1 FROM THE DESIGN DOCUMENT ──
 *
 * A pure instance-id lookup is not enough and shipping only one would be a regression: the retired
 * `anchor.ts` kept the cursor on a uniquely-stamped node that MOVES SECTION via its STAMP rung,
 * because that rung searched by stamp across the whole file and did not care which heading was
 * above it. An instance id encodes the section, so the row that printed under the OLD section and
 * the row that prints under the NEW one are, correctly, two different instances — the design's own
 * §2.4 argument for why that is right, not a bug: the row under the old heading ceased to exist and a new row
 * came into existence, and only the NODE persisted. So `LineInstance.node` rides beside `instance`
 * on every line that has one, and `resolveInstanceAnchor` below is a TWO-TIER walk for exactly this
 * reason — instance match first (the same printing, cursor holds), node match second (the printing
 * moved, cursor follows and the caller can say so) — never instance alone.
 *
 * ── WHAT DOES NOT COLLAPSE, AND MATCHES THE RETIRED anchor.ts'S OWN HONESTY ABOUT IT ──
 *
 * A line with no stamp (a heading, or a line the operator has typed but the cycle has not stamped
 * yet) has no node to fall back to, so its identity IS its instance — section ordinal plus its own
 * exact text (or, for a heading, the constant token above). If that text changes, the OLD instance
 * will not be found, by the same construction that made TEXT the honest floor in `anchor.ts`: a
 * line's characters are a content hash, not an identity, and this module does not pretend
 * otherwise for a line the engine has never rendered. §3.2 of the design document names this the
 * hard case this module does not and cannot fix — see `a-line-being-made-survives-a-projection-too`
 * in the backlog, a different construct (a RELATIVE anchor, "after instance X"), not a consequence
 * of this one.
 *
 * THAT SECOND CONSTRUCT NOW EXISTS AND IS `relative.ts`, AND THE SENTENCE ABOVE STANDS UNCHANGED:
 * this module still does not and cannot fix the case. What it does instead is CARRY the second
 * construct's answer, because the ORDER of the rungs is a fact that must live in exactly one place
 * (`ANCHOR_TRUST` below) and splitting the walk across two modules is how the engine's own
 * `levels.py` acquired three copies of one ordering. `InstanceAnchor.relative` is computed by
 * `relative.ts` and read by `relative.ts`; nothing here interprets it, and it is `null` for every
 * line that carries a stamp — which is why the two tiers below are provably unchanged. The
 * dependency runs one way only: this module imports `relative.ts`, never the reverse.
 *
 * ── WHY EVERY PRINTED LINE GETS ONE, NOT ONLY NODE LINES ──
 *
 * The operator decided this directly (design doc §8): `metrics.md` has ZERO node lines and five
 * headings, and it is the view the false-`absent` bug was measured on. An id space that only named
 * node lines could not address the view that most needed it. `{`/`}` already jump to headings
 * (`boundary.ts`), so a heading needs an id for the same reason a node line does — a grid with holes
 * in it is not a grid. The one thing that still gets NO id is a BLANK line, matching the retired
 * `anchor.ts`'s own `anchorFor(...) === null` for one and `paint.ts`'s own blank-line branch, which
 * draws no row for one at all — there is nothing here for an id to be an id OF.
 *
 * ── THE FORMAT, AND WHY R2 SHOULD PRODUCE THE SAME STRING ──
 *
 * `${view}/${section}/${token}` (`#${occurrence}` appended only when the token is not unique
 * within its section — this_week.md's three duplicated stamps need no suffix at all, because each
 * printing sits in a DIFFERENT section and the section alone tells them apart; only
 * `structural_edge_types`'s `allow_repeats` case, design doc §2.4, can ever need one). `section` is
 * the 0-based ordinal of the heading that opens the line's section, counting headings top to
 * bottom — NEVER a config-read string id, because this module has no config to read. `token` is
 * the node id (`qntm:N`, brackets stripped) when the line carries one, the constant `HEADING_TOKEN`
 * for an unstamped heading, or the line's own exact source text otherwise.
 *
 * THIS IS DELIBERATELY NOT THE SAME STRING THE DESIGN DOCUMENT'S OWN WIRE SKETCH SPELLS (§6:
 * `view/section_id/node_id`, where `section_id` is a config-declared string like `domain-empty`) —
 * and that gap is the one honest thing this module cannot close alone. For "R1 and R2 produce the
 * identical string" (the property that makes the later switch a no-op, proof standard item 3) to
 * hold, R2 must emit the SAME 0-based ordinal this module counts, not the config's own id string,
 * for the `section` component — the ordinal is the fact this module can prove positionally (design
 * doc §2.3c, and `tests/present-instance.test.mjs`'s own parity test), the string id is not
 * something a browser holding only markdown can ever derive. This is a decision for R2, spelled out
 * here rather than assumed, because a module cannot silently commit its future sibling to a format
 * choice it never argued for.
 */

import { relativeAnchorFor, resolveRelativeAnchor } from "./relative.js";
import type { RelativeAnchor, RelativeRefusal } from "./relative.js";
import { classifyLine, qntmIdSpans } from "./rendition.js";

/** The identity token an unstamped heading uses — see the header for why it is a constant. */
const HEADING_TOKEN = "§heading";

/**
 * One printed line's identity: the opaque instance string, the node it names (or `null`), and
 * which section (by ordinal, never by heading text) it belongs to.
 */
export interface LineInstance {
  /** Opaque. `${view}/${section}/${token}`, `#${occurrence}` appended only where needed. Never
   * parse this — see the module header. */
  readonly instance: string;
  /** `qntm:N`, brackets stripped, or `null` for a line with no stamp of its own. */
  readonly node: string | null;
  /** The 0-based ordinal of the heading that opens this line's section, or `null` above the first
   * heading in the file. */
  readonly section: number | null;
}

/** The first `[[qntm:N]]` on a line, as the engine's own node id — brackets stripped. `null` when
 * the line carries none. See `anchor.ts`'s `stampOf` for why the FIRST: chrome cells (outgoing
 * edges) are printed after a node's own identity, never before it. */
function nodeStampOf(line: string): string | null {
  const [first] = qntmIdSpans(line);
  if (first === undefined) {
    return null;
  }
  // `[[qntm:N]]` is always exactly two brackets on each side — QNTM_ID (resolution.ts) matches
  // nothing else — so slicing them off is safe without re-parsing what qntmIdSpans already found.
  return line.slice(first.start + 2, first.end - 2);
}

/** One line's raw facts, before occurrence counting decides whether it needs a suffix. */
interface RawLine {
  readonly section: number | null;
  readonly node: string | null;
  readonly token: string;
}

/**
 * Every printed line's instance, in ONE pass over `source` — `null` for a line that gets no row at
 * all (blank; see `paint.ts`'s own blank-line branch and `anchor.ts`'s `anchorFor` for the same
 * decision made twice already).
 *
 * Computed for the WHOLE source at once, not line by line, because the occurrence count that
 * decides whether a line needs a `#N` suffix (two lines in one section sharing a token — the
 * `structural_edge_types` case, design doc §2.4) is a fact about the file, not about one line, and
 * `paint.ts` walks every line anyway: one pass here is one pass there, not `n` of them.
 */
export function instancesOf(source: string, view: string): readonly (LineInstance | null)[] {
  const lines = source.split("\n");

  // PASS 1 — classify. `section` counts headings top to bottom: crossing a heading OPENS a new
  // section and the heading itself is the first line IN it (renderer.py:399/:430 attribute the
  // heading line's own record to the section it is about to render, not the one above it — see the
  // module header), so the increment happens before the heading's own row is recorded.
  let section: number | null = null;
  const raw: (RawLine | null)[] = lines.map((line) => {
    const shape = classifyLine(line);
    if (shape.kind === "blank") {
      return null;
    }
    if (shape.kind === "heading") {
      section = section === null ? 0 : section + 1;
      const node = nodeStampOf(line);
      return { section, node, token: node ?? HEADING_TOKEN };
    }
    const node = nodeStampOf(line);
    return { section, node, token: node ?? line };
  });

  // PASS 2 — occurrence counts, keyed by (section, token). A group of size 1 needs no suffix at
  // all — this is what lets this_week.md's duplicated stamps separate for free (§2.4: each
  // printing is in a DIFFERENT section, so their groups never share a key) and keeps the common
  // case's instance string short and stable.
  const key = (r: RawLine): string => `${r.section ?? "none"} ${r.token}`;
  const groupSize = new Map<string, number>();
  for (const r of raw) {
    if (r === null) {
      continue;
    }
    const k = key(r);
    groupSize.set(k, (groupSize.get(k) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  return raw.map((r) => {
    if (r === null) {
      return null;
    }
    const k = key(r);
    const occurrence = (seen.get(k) ?? 0) + 1;
    seen.set(k, occurrence);
    const size = groupSize.get(k) ?? 1;
    const suffix = size > 1 ? `#${occurrence}` : "";
    const sectionToken = r.section === null ? "-" : String(r.section);
    return {
      instance: `${view}/${sectionToken}/${r.token}${suffix}`,
      node: r.node,
      section: r.section,
    };
  });
}

/**
 * The instance at one line — a convenience over `instancesOf` for a single lookup, the same shape
 * `anchor.ts`'s `anchorFor` takes. `null` out of range or on a blank line, matching `anchorFor`.
 *
 * PREFER `instancesOf` WHEN WALKING A WHOLE VIEW — `paint.ts` does, once per paint, rather than
 * calling this per line, which would re-scan the file `n` times for an `n`-line view.
 */
export function instanceOf(source: string, lineIndex: number, view: string): LineInstance | null {
  if (!Number.isInteger(lineIndex) || lineIndex < 0) {
    return null;
  }
  return instancesOf(source, view)[lineIndex] ?? null;
}

/** What the cursor holds onto: the instance it was taken at, and the node it names (if any). */
export interface InstanceAnchor {
  readonly instance: string;
  readonly node: string | null;
  readonly takenAt: number;
  /**
   * WHERE THE LINE SAT, for a line that has no identity of its own yet — `relative.ts`. `null` for
   * every line carrying a stamp (the node tier owns those) and for every line with no stamped
   * neighbour in its section (nothing to be relative to). Read only by `relative.ts`; this module
   * carries it and never interprets it.
   */
  readonly relative: RelativeAnchor | null;
}

/**
 * THE ORDER OF THE RUNGS, OWNED HERE AND NOWHERE ELSE — most trusted first.
 *
 * The retired `anchor.ts` exported an `ANCHOR_TRUST` for exactly this job and it is revived rather
 * than re-invented, because the engine's own `levels.py` carries a comment recording what an order
 * re-expressed per site cost this project once already: three copies, and the hand-rolled one was
 * the wrong one. `resolveInstanceAnchor` walks these in this order and no caller may re-express it;
 * `tests/present-relative.test.mjs` asserts the walk against this tuple rather than against prose.
 *
 *   instance  the same printing, exactly. `${view}/${section}/${token}` matched.
 *   node      the engine's own identity, which it guarantees across a move between sections.
 *   relative  a NEIGHBOURHOOD claim, confirmed by the characters. Weaker than `node` because the
 *             engine guarantees a node id and guarantees nothing about a node's neighbours.
 *   text      a CONTENT claim with no position behind it. The floor, and the weakest thing this
 *             bundle will act on.
 *
 * WHY `relative` IS AFTER `node` AND NOT BEFORE IT — the question the brief asked. `node` is a fact
 * the engine mints and preserves; `relative` is an inference from two other lines' node ids holding
 * still, which nothing promises. A rung that made a weaker claim before a stronger one could answer
 * would be a regression the day a stamped line moved section — the exact property `focus.ts`'s own
 * header calls the one regression risk in the whole anchor arc. AND THE QUESTION IS MOOT BY
 * CONSTRUCTION AS WELL AS BY ARGUMENT: a `relative` anchor is only ever taken for a line with NO
 * node (`relative.ts`), so the two rungs can never both have something to say about one line.
 *
 * WHY `text` IS BELOW `relative` RATHER THAN "BETWEEN TEXT AND NODE" — the brief's own guess needs
 * correcting. There is no separate TEXT rung above; `anchor.ts`'s four rungs collapsed into two and
 * TEXT was one of the three that collapsed INTO `instance` (see the module header). What
 * `relative.ts` revives under the name `text` is a strictly weaker relation than the retired one —
 * an EXTENSION, not an equality, over the whole view — so it sits at the bottom, not in the middle.
 */
export const ANCHOR_TRUST = ["instance", "node", "relative", "text"] as const;

/** How a `found` reading was reached — graded by `ANCHOR_TRUST`, most trusted first. */
export type AnchorVia = (typeof ANCHOR_TRUST)[number];

/**
 * What the collapsed walk found — three outcomes, matching `design-presentation-instance-identity.md`
 * §3.3 exactly:
 *
 *   found, via "instance"   the same printing. The cursor holds. (was STAMP / STAMP_IN_SECTION /
 *                            TEXT / TEXT_IN_SECTION, collapsed into one lookup — see the header.)
 *   found, via "node"       the printing MOVED SECTION. The cursor follows; the caller should say
 *                            the section changed, because it did (refutation 1 — see the header).
 *   ambiguous               the node now prints in more than one place. Refused, not guessed —
 *                            same rule anchor.ts's own `decide()` uses: a rung that finds too many
 *                            stops rather than picking.
 *   absent                  neither the instance nor (if it had one) the node was found.
 */
export type InstanceReading =
  | { readonly outcome: "found"; readonly lineIndex: number; readonly via: AnchorVia }
  | { readonly outcome: "ambiguous"; readonly candidates: readonly number[] }
  | { readonly outcome: "absent"; readonly because?: RelativeRefusal };

/**
 * The anchor for the line at `lineIndex` in `source`, or `null` when it has no identity — out of
 * range or blank, matching `instanceOf`.
 *
 * IT NOW ALSO TAKES THE RELATIVE ANCHOR, IN THE SAME ONE PASS. `instancesOf` has already been
 * walked to get the instance, and `relative.ts` reads exactly that list — so the second construct
 * costs one more scan of an array already in hand, not a second parse of the source. It is `null`
 * for every stamped line and for every line with no stamped neighbour; see `relative.ts` for the
 * three cases and why each one is a refusal rather than a guess.
 */
export function instanceAnchorFor(source: string, lineIndex: number, view: string): InstanceAnchor | null {
  const list = instancesOf(source, view);
  const info = list[lineIndex] ?? null;
  if (info === null) {
    return null;
  }
  return {
    instance: info.instance,
    node: info.node,
    takenAt: lineIndex,
    relative: relativeAnchorFor(list, source.split("\n"), lineIndex),
  };
}

/**
 * Where `anchor`'s line is in `source` now, walking the rungs in `ANCHOR_TRUST` order — see
 * `InstanceReading` above for what each outcome means and the module header for why a pure instance
 * lookup is not the whole answer.
 *
 * THE FIRST TWO RUNGS ARE UNTOUCHED, AND THIS IS THE ONE REGRESSION CLAIM WORTH CHECKING RATHER
 * THAN TRUSTING. The rungs `relative.ts` adds run ONLY on the path that used to return `absent`,
 * and they run at all only when `anchor.relative !== null` — which `relativeAnchorFor` returns for
 * NO line carrying a stamp. So for every stamped line this function is byte-identical to what it
 * was; and for an unstamped line it could previously return only `found`/`via:"instance"` or
 * `absent`, because `ambiguous` requires a node to search with. Nothing that answered before
 * answers differently now.
 */
export function resolveInstanceAnchor(
  anchor: InstanceAnchor,
  source: string,
  view: string,
): InstanceReading {
  const list = instancesOf(source, view);

  const byInstance = list.findIndex((info) => info?.instance === anchor.instance);
  if (byInstance !== -1) {
    return { outcome: "found", lineIndex: byInstance, via: "instance" };
  }

  if (anchor.node !== null) {
    const candidates: number[] = [];
    list.forEach((info, at) => {
      if (info?.node === anchor.node) {
        candidates.push(at);
      }
    });
    if (candidates.length === 1) {
      return { outcome: "found", lineIndex: candidates[0] as number, via: "node" };
    }
    if (candidates.length > 1) {
      return { outcome: "ambiguous", candidates };
    }
  }

  // RUNGS 3 AND 4 — the line the operator is authoring, which the two above cannot reach by
  // construction (see the module header and `relative.ts`). The refusal REASON is carried out on
  // `absent` rather than dropped: "the line you were on is gone" and "the neighbourhood it sat in
  // changed shape" are different events to the person who typed it.
  if (anchor.relative !== null) {
    const reading = resolveRelativeAnchor(anchor.relative, list, source.split("\n"));
    if (reading.outcome === "found") {
      return { outcome: "found", lineIndex: reading.lineIndex, via: reading.via };
    }
    if (reading.outcome === "ambiguous") {
      return { outcome: "ambiguous", candidates: reading.candidates };
    }
    return { outcome: "absent", because: reading.because };
  }

  return { outcome: "absent" };
}

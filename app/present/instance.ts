/**
 * instance — presentation-instance identity: a stable id for a PRINTED LINE, derived from the
 * source string alone. PURE: no DOM, no fetch, no clock.
 *
 * ── WHAT THIS MODULE ANSWERS, AND WHY IT IS NOT anchor.ts ──
 *
 * `anchor.ts` answers "which line is the cursor on now" by walking four rungs — STAMP,
 * STAMP_IN_SECTION, TEXT, TEXT_IN_SECTION — each a fresh scan of the projection, narrowed by a
 * heading's TEXT when a scan finds too many. `design-presentation-instance-identity.md` (§1.2)
 * measured that the first three of those four collapse into ONE fact the engine already computes
 * every cycle and throws away: `(section_id, node_id)` — RenderedLineRecord, renderer.py:169-184,
 * discarded before it reaches `line_cache` (persistence/schema.py:41-49). This module RE-DERIVES
 * that fact in the browser, from data the projection already carries, so the four-rung walk
 * collapses to a single lookup — see anchor.ts's own header for which rungs actually go and which
 * one survives, and why.
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
 * A pure instance-id lookup is not enough and shipping only one would be a regression: today, a
 * uniquely-stamped node that MOVES SECTION keeps the cursor via `anchor.ts`'s STAMP rung, because
 * that rung searches by stamp across the whole file and does not care which heading is above it. An
 * instance id encodes the section, so the row that printed under the OLD section and the row that
 * prints under the NEW one are, correctly, two different instances — the design's own §2.4 argument
 * for why that is right, not a bug: the row under the old heading ceased to exist and a new row
 * came into existence, and only the NODE persisted. So `LineInstance.node` rides beside `instance`
 * on every line that has one, and `resolveInstanceAnchor` below is a TWO-TIER walk for exactly this
 * reason — instance match first (the same printing, cursor holds), node match second (the printing
 * moved, cursor follows and the caller can say so) — never instance alone.
 *
 * ── WHAT DOES NOT COLLAPSE, AND MATCHES anchor.ts'S OWN HONESTY ABOUT IT ──
 *
 * A line with no stamp (a heading, or a line the operator has typed but the cycle has not stamped
 * yet) has no node to fall back to, so its identity IS its instance — section ordinal plus its own
 * exact text (or, for a heading, the constant token above). If that text changes, the OLD instance
 * will not be found, by the same construction that made TEXT the honest floor in anchor.ts: a
 * line's characters are a content hash, not an identity, and this module does not pretend
 * otherwise for a line the engine has never rendered. §3.2 of the design document names this the
 * hard case this module does not and cannot fix — see `a-line-being-made-survives-a-projection-too`
 * in the backlog, a different construct (a RELATIVE anchor, "after instance X"), not a consequence
 * of this one.
 *
 * ── WHY EVERY PRINTED LINE GETS ONE, NOT ONLY NODE LINES ──
 *
 * The operator decided this directly (design doc §8): `metrics.md` has ZERO node lines and five
 * headings, and it is the view the false-`absent` bug was measured on. An id space that only named
 * node lines could not address the view that most needed it. `{`/`}` already jump to headings
 * (`boundary.ts`), so a heading needs an id for the same reason a node line does — a grid with holes
 * in it is not a grid. The one thing that still gets NO id is a BLANK line, matching `anchorFor`'s
 * own `null` (`anchor.ts:184-199`) and `paint.ts`'s own blank-line branch, which draws no row for
 * one at all — there is nothing here for an id to be an id OF.
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

import { classifyLine, qntmIdSpans } from "./resolution.js";

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
}

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
  | { readonly outcome: "found"; readonly lineIndex: number; readonly via: "instance" | "node" }
  | { readonly outcome: "ambiguous"; readonly candidates: readonly number[] }
  | { readonly outcome: "absent" };

/** The anchor for the line at `lineIndex` in `source`, or `null` when it has no identity — out of
 * range or blank, matching `instanceOf`. */
export function instanceAnchorFor(source: string, lineIndex: number, view: string): InstanceAnchor | null {
  const info = instanceOf(source, lineIndex, view);
  if (info === null) {
    return null;
  }
  return { instance: info.instance, node: info.node, takenAt: lineIndex };
}

/**
 * Where `anchor`'s line is in `source` now, walking the two tiers instance identity actually
 * needs — see `InstanceReading` above for what each outcome means and the module header for why a
 * pure instance lookup is not the whole answer.
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

  return { outcome: "absent" };
}

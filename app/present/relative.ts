/**
 * relative — WHERE A LINE SITS, for a line that has no identity of its own yet. PURE: no DOM, no
 * fetch, no clock, and it imports nothing.
 *
 * ── THE MEASURED BLOCKER THIS MODULE EXISTS FOR ──
 *
 * `design-presentation-instance-identity.md` §3.2 anchored on a real line as the operator typed it
 * — `- [ ] Lesley pay tenner` — and resolved it against the projection that came back:
 *
 *   inbox line 2, stamp=null, section="## Domain Empty"  ->  {"outcome":"absent"}
 *
 * `tests/present-replay.test.mjs` reproduced that as a measurement and generalised it past any one
 * fixture: `membershipFor` (membership.ts) answers ONLY for a line carrying no `[[qntm:N]]`, so at
 * the moment a prediction matters the line has no node — `instanceAnchorFor` gives it `node: null`.
 * The cycle then stamps the line. The NODE tier of `resolveInstanceAnchor` has nothing to search
 * with; the INSTANCE tier fails because an unstamped line's identity IS its own characters and the
 * stamp changed them. Both tiers are structurally unavailable at once, which is why the reading is
 * `absent` and the harness reports `converged: null` — unconfirmable, not wrong.
 *
 * SO THE APEX CAPABILITY — `author-in-the-browser-not-in-obsidian` — DESTROYED THE CURSOR'S HOLD ON
 * THE LINE BEING AUTHORED, every time, and it followed from `membershipFor`'s own precondition
 * rather than from any one view.
 *
 * ── WHY THIS IS A SECOND CONSTRUCT AND NOT A WIDER INSTANCE FORMAT ──
 *
 * The design document refused to fold it in (§3.2): "a relative anchor is an id expressed as a
 * position between two instances, which is exactly what an instance-id space makes expressible —
 * but it is a second thing to build, not a consequence of the first." The reason is that an
 * instance id is a claim about ONE row and this is a claim about a NEIGHBOURHOOD. Widening
 * `${view}/${section}/${token}` to carry a neighbour would make every stamped line's id depend on
 * lines it has nothing to do with, and a stamped line's id is the one thing in this bundle that is
 * already exact. So: a separate type, a separate resolver, a separate proof — and ONE walk, because
 * the walk's order is a fact that must live in one place (see `instance.ts`'s `ANCHOR_TRUST`).
 *
 * ── WHAT THE ANCHOR IS, EXACTLY, AND WHAT IT CANNOT SURVIVE ──
 *
 * A BRACKET plus an OFFSET plus the CHARACTERS:
 *
 *   above    the node id of the nearest STAMPED line above, within the same section — or `null`
 *            when there is none, in which case the bracket's top is the section's own first line.
 *   below    the same, downward — or `null`, in which case the bracket's bottom is the section's
 *            own last line.
 *   section  the 0-based ordinal of the heading that opens the line's section.
 *   gap      how many non-blank lines stood between the brackets when the anchor was taken.
 *   offset   which of those the line was, 0-based.
 *   text     the characters the line had.
 *
 * ── BOTH BRACKETS NULL IS A REAL ANCHOR, AND THE LANDMARK IS THE SECTION'S OWN HEADING ──
 *
 * As merged, this module refused a section with NO stamped line in it — "such a section offers no
 * landmark that outlives the cycle". THAT SENTENCE WAS WRONG ABOUT ONE LANDMARK, and the landmark
 * was already in the anchor: `section`, the 0-based ordinal of the heading that opens it.
 *
 * A HEADING IS ADDRESSED BY ORDINAL AND NEVER BY ITS CHARACTERS (`instance.ts`, `HEADING_TOKEN`;
 * `address.ts`, `sectionOrdinalAt`), which is exactly why `~/qntm/metrics.md`'s five headings
 * survive a ratio that changes every cycle. So "the Kth non-blank line of the Nth section" is a
 * claim about the SAME fact the heading's own identity token is built on — not a weaker one, and
 * not a new one. The bracket's two edges already fall back to the section's own first and last
 * line when one side is `null`; when BOTH are `null` the region is simply the whole section, and
 * the section's first line IS its heading by construction (`instancesOf` opens a new ordinal ON
 * the heading line, so `boundsOf(places, N).first` cannot be anything else).
 *
 * WHAT IT COSTS TO GET THIS WRONG IS BOUNDED BY THE SAME TWO GUARDS AS EVERY OTHER BRACKET. If the
 * heading is GONE — the one measured way an ordinal can lie, when a graph node's title collides
 * with a section name and the section renders with no heading at all — every ordinal below it
 * shifts by one, `anchor.section` names a DIFFERENT section, and its gap count and its characters
 * will not agree. `gap-changed` or `text-changed` follows, then the TEXT rung, then `held.ts`. That
 * failure is not new and not local: an ordinal that shifts already breaks the heading's own
 * INSTANCE rung everywhere in this bundle. This rung inherits that exposure; it does not add one.
 *
 * AND IT IS THE OPERATOR'S OWN FIRST CAPTURE OF THE DAY. Measured against his live vault
 * (2026-08-01, read read-only): 109 of 191 rendered sections carry no stamped line, 94 of them are
 * heading-only — including `~/qntm/inbox.md`'s `## Inbox`, `work/daily.md`'s `## Work Capture`,
 * `personal/daily.md`'s `## Personal Capture` and `this_week.md`'s `## Overdue`. Every capture into
 * one of those lost its cursor unconditionally, because no anchor was taken at all — which also
 * denied it the TEXT rung, and the TEXT rung is what actually rescues the inbox case, where the
 * cycle re-sorts a new capture out of `## Inbox` and into `## Domain Empty`.
 *
 * "AFTER NODE 122" ALONE WAS THE OTHER CANDIDATE AND IT IS NOT ENOUGH. It cannot tell two lines
 * opened one after another under the same node apart, and it says nothing at all about a line
 * opened at the TOP of a section, which is where a new capture actually lands in the operator's own
 * inbox (`~/qntm/inbox.md` prints newest first). A bracket answers both: the second line differs
 * from the first by its offset, and a line with no stamped neighbour above is still bracketed from
 * BELOW. The other candidates — "after 122 at depth N", "the Kth unstamped line after 122" — are
 * both this one with a weaker second component, and neither survives anything this one does not.
 *
 * WHAT IT CANNOT SURVIVE, NAMED RATHER THAN DISCOVERED LATER:
 *
 *   1. THE CYCLE MOVING THE LINE OUT OF ITS BRACKET. `~/qntm/inbox.md`'s three real lines print
 *      2603, 2602, 2598 — descending, newest first. A line opened at the BOTTOM of that section is
 *      re-sorted to the TOP by the cycle that stamps it, so the bracket it was taken in
 *      (`above: qntm:2598`, nothing below) no longer contains it. `gap-changed` is reported and
 *      the bracket refuses. The TEXT rung below is what catches this case, and it catches it by
 *      making a weaker claim and saying so — never by relaxing the bracket.
 *   2. THE CYCLE INSERTING ANOTHER LINE INTO THE SAME BRACKET. Two lines where one stood is
 *      `gap-changed` again. It is refused rather than guessed at, because guessing here lands the
 *      cursor on a line the operator did not write.
 *   3. A BRACKETING NODE LEAVING THE VIEW. `above-absent` / `below-absent`. There is no second
 *      bracket to fall back to and inventing one would be inventing a neighbourhood.
 *   4. A BRACKETING NODE PRINTING TWICE. `above-ambiguous` / `below-ambiguous` — the same refusal
 *      `resolveInstanceAnchor`'s node tier already makes for the same reason.
 *   5. THE SECTION ITSELF NOT BEING IN THE ARRIVING PROJECTION. `section-absent`, and it is only
 *      reachable for a whole-section bracket, where the ordinal is the only landmark there is. A
 *      view that printed six headings and now prints four has no section 5 for the anchor to mean.
 *   6. NO LANDMARK AT ALL. `no-landmark` — an anchor with no bracket AND no section ordinal, which
 *      is the region above the file's first heading with nothing stamped in it. `relativeAnchorFor`
 *      never mints one (it returns `null` for exactly this case), so this refusal guards the
 *      EXPORTED resolver against a hand-built anchor rather than a shape the take side can produce.
 *
 * ── THE TEXT CHECK IS A CONFIRMATION, NOT A SEARCH — AND THE SHAPE WAS MEASURED ──
 *
 * A position match alone would move the cursor onto whatever now occupies a slot. So the bracket
 * names a candidate and the CHARACTERS confirm it: the arrived line must EXTEND the remembered
 * text. That is the one real shape every stamped line in the operator's own vault shows — the title
 * first, the cycle's tokens appended after, never a rewritten prefix (`~/qntm/inbox.md`, read
 * read-only 2026-08-01; `tests/present-replay.test.mjs` checks exactly this as `preserved`).
 *
 * `extendsLine` BELOW IS THE SAME PREDICATE `held.ts`'s OWN `sourceOwns` USES, DELIBERATELY WRITTEN
 * TWICE RATHER THAN SHARED. `held.ts` imports nothing, by construction, and that zero-import
 * property is the evidence for its stated invariant that it cannot reach a write. Making it import
 * a predicate from here would trade a load-bearing property for a saved function. If a THIRD caller
 * ever needs this relation it should move to a module both can depend on — it must not be written a
 * third time.
 *
 * ── TWO RUNGS, AND WHY THE WEAKER ONE EXISTS AT ALL ──
 *
 *   relative  the bracket held AND the characters confirm it. Position and content agree.
 *   text      the bracket refused, but exactly ONE line in the whole view extends the remembered
 *             characters. A content claim with no position behind it.
 *
 * The TEXT rung is the retired `anchor.ts`'s own floor, revived with two changes that make it
 * safer than it was: it is an EXTENSION relation rather than exact equality (so it survives the
 * stamp, which is the whole point), and more than one match is `ambiguous` rather than a pick. It
 * exists because refusal 1 above is not a corner case — it is what the operator's real inbox does
 * to every capture typed below the first item. `held.settle` already stakes the operator's
 * characters on this same predicate, view-wide, to RELEASE a held row, which is the strictly more
 * dangerous of the two decisions; using it to move a cursor is the lesser claim.
 *
 * ── IT IS ONLY EVER TAKEN FOR A LINE WITH NO STAMP ──
 *
 * `relativeAnchorFor` returns `null` for a line that carries a node id, and that narrowness is what
 * makes this change provably non-regressive: for every stamped line the anchor's `relative` is
 * `null` and `resolveInstanceAnchor`'s walk is byte-identical to what it was. For an unstamped line
 * the walk today can only return `found`/`via:"instance"` or `absent` (`ambiguous` needs a node), so
 * the rungs added here run ONLY where the answer was already `absent`. No existing rung is
 * weakened, narrowed, or reordered.
 */

/**
 * One line, as this module needs to see it. `LineInstance` (instance.ts) satisfies this
 * structurally, which is how this module reads a projection without importing the module that
 * derives one — see the header for why the dependency runs one way only.
 *
 * `null` in a list position means a line with no identity at all (a blank), exactly as
 * `instancesOf` reports it.
 */
export interface LinePlace {
  /** `qntm:N`, brackets stripped, or `null` for a line carrying no stamp. */
  readonly node: string | null;
  /** The 0-based ordinal of the heading that opens this line's section, or `null` above the first. */
  readonly section: number | null;
}

/** Every reason the bracket declines to answer. Each one is a test in tests/present-relative.test.mjs. */
export type RelativeRefusal =
  | "above-absent"
  | "above-ambiguous"
  | "below-absent"
  | "below-ambiguous"
  | "bracket-crossed"
  | "gap-changed"
  | "no-landmark"
  | "section-absent"
  | "text-changed";

/**
 * WHERE THE LINE SAT, expressed against things that outlive it. See the module header for the
 * shape and for what it cannot survive.
 */
export interface RelativeAnchor {
  /** Nearest stamped node above, in this section. `null` when there is none. */
  readonly above: string | null;
  /** Nearest stamped node below, in this section. `null` when there is none. */
  readonly below: string | null;
  /** The section ordinal the line was in — `null` above the first heading. */
  readonly section: number | null;
  /** How many non-blank lines stood between the brackets. */
  readonly gap: number;
  /** Which of those the line was, 0-based. */
  readonly offset: number;
  /** The characters the line had. The confirmation, never the search key for the bracket rung. */
  readonly text: string;
}

/**
 * What the two rungs found. `found` carries WHICH rung answered so a caller can grade the restore;
 * `refused` carries WHY, because "it did not work" is not a thing a person can act on.
 */
export type RelativeReading =
  | { readonly outcome: "found"; readonly lineIndex: number; readonly via: "relative" | "text" }
  | { readonly outcome: "ambiguous"; readonly candidates: readonly number[] }
  | { readonly outcome: "refused"; readonly because: RelativeRefusal };

/**
 * The engine's own `[[qntm:N]]` stamp — the SAME pattern `express/rendition.ts`'s `QNTM_ID`
 * matches, duplicated rather than imported: this module imports nothing (see the module header),
 * the same reason `extendsLine` below is itself written twice rather than shared with `held.ts`.
 */
const STAMP_TOKEN = /\[\[qntm:[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?\]\]/g;

/**
 * `arrived` with the stamp token spanning `[start, end)` removed, and the space that joined it to
 * its neighbours collapsed back to the ONE space that was there before the engine composed it in —
 * never two, never zero. `renderer.py`'s `_field_expression_cells` always joins tail cells with a
 * single `" "` (`_COMPOSITION_TAIL`'s own `separator`, `presentation.json`'s `composition.
 * separator`), so undoing exactly that join is what "as if the engine had never composed this one
 * cell" means, characters for characters.
 */
function withStampRemoved(arrived: string, start: number, end: number): string {
  const before = arrived.slice(0, start);
  const after = before.endsWith(" ") && arrived.slice(end).startsWith(" ")
    ? arrived.slice(end + 1) // the join space on EITHER side is the same one space — drop only one
    : arrived.slice(end);
  return (before + after).trimEnd();
}

/**
 * Does `arrived` still carry `held` — the same characters, or the same characters with the cycle's
 * own tokens ADDED, either after them or with the stamp INSERTED somewhere inside them?
 *
 * THE ENGINE DOES NOT ONLY APPEND. `apps/qntm-md/src/qntm_md/render/renderer.py`'s
 * `_field_expression_cells` composes a node's tail in ONE fixed, declared order —
 * `presentation.json`'s own `composition.tail`, `["stamp", "date", "tags", "markers", "chrome"]`
 * for this instance, read directly rather than assumed — so a line the operator captured WITH its
 * own trailing tag or marker already on it (`- [ ] Buy milk 🔢 3`, the section's own ordering
 * marker, typed at capture time) gets its stamp composed BEFORE that marker on the engine's own
 * very next answer (`- [ ] Buy milk [[qntm:9]] 🔢 3`), not after everything. A check that only ever
 * tried the END would refuse that still-correct row on the one event it exists to survive.
 *
 * SO THIS TRIES BOTH SHAPES, IN ORDER: the plain append first (unchanged from before — covers a
 * BARE capture, nothing typed beyond the title, and any other case where the addition genuinely
 * lands at the end), and, only if that fails, "the arrived line WITH one stamp token taken back
 * out" against the same append rule. The second branch is not a looser match: it still requires
 * the non-stamp characters on either side of the stamp to reproduce `held` EXACTLY (bar the one
 * join space `withStampRemoved` accounts for), or `held` plus a further append — an insertion
 * ANYWHERE ELSE (two tags swapping order, a value changing) still refuses, exactly as it did
 * before. Tried at every stamp span `arrived` carries, because nothing here assumes there is
 * exactly one — it does not need to: `held` is guaranteed stamp-free (`relativeAnchorFor` never
 * takes this anchor for an already-stamped line — see the module header), so the ONE genuine match
 * is the row's own new stamp, wherever it appears.
 *
 * THE APPENDED BRANCH IS NARROWED SO IT CANNOT MATCH BY ACCIDENT, with no magic number in it: the
 * held text must end in a non-space and the arrived line must continue with a space. That is what
 * "a token was appended after it" looks like, and it is not what `- ` matching `- [ ] Ring the
 * dentist` looks like. Same predicate as `held.ts`'s `sourceOwns` — see the module header for why
 * it is written twice.
 */
export function extendsLine(held: string, arrived: string): boolean {
  if (arrived === held) {
    return true;
  }
  if (held === "" || held.trimEnd() !== held) {
    return false;
  }
  if (arrived.startsWith(held + " ")) {
    return true;
  }
  for (const match of arrived.matchAll(STAMP_TOKEN)) {
    const start = match.index as number;
    const stripped = withStampRemoved(arrived, start, start + match[0].length);
    if (stripped === held || stripped.startsWith(held + " ")) {
      return true;
    }
  }
  return false;
}

/** The first and last index of `section` in `places`, or `null` when the section is not there. */
function boundsOf(
  places: readonly (LinePlace | null)[],
  section: number | null,
): { first: number; last: number } | null {
  let first = -1;
  let last = -1;
  places.forEach((place, at) => {
    if (place !== null && place.section === section) {
      if (first === -1) {
        first = at;
      }
      last = at;
    }
  });
  return first === -1 ? null : { first, last };
}

/** Every non-blank index in `[from, to]` that belongs to `section`. The gap, as a list. */
function gapBetween(
  places: readonly (LinePlace | null)[],
  section: number | null,
  from: number,
  to: number,
): readonly number[] {
  const found: number[] = [];
  for (let at = Math.max(0, from); at <= Math.min(to, places.length - 1); at += 1) {
    const place = places[at] ?? null;
    if (place !== null && place.section === section) {
      found.push(at);
    }
  }
  return found;
}

/** Where `node` prints. More than one is what makes a bracket ambiguous rather than wrong. */
function printingsOf(places: readonly (LinePlace | null)[], node: string): readonly number[] {
  const found: number[] = [];
  places.forEach((place, at) => {
    if (place?.node === node) {
      found.push(at);
    }
  });
  return found;
}

/**
 * The relative anchor for the line at `lineIndex`, or `null` when there is none to take.
 *
 * `null` IN EXACTLY THREE CASES, and each one is a real shape rather than a defensive guard:
 *
 *   * the line is blank or out of range — it has no identity anywhere in this bundle;
 *   * the line ALREADY CARRIES A STAMP — the node tier owns it and a second, weaker claim about
 *     the same line could only ever disagree with a stronger one (see the module header);
 *   * the line is the HEADING THAT OPENS ITS SECTION — see below;
 *   * NOTHING IN ITS SECTION CARRIES A STAMP AND THE SECTION HAS NO HEADING — the region above the
 *     file's first heading (`section === null`) with nothing stamped in it. A bracket of two nulls
 *     THERE is the whole file wearing a bracket's clothes, because there is no ordinal to name the
 *     region by. Inside a real section the same two nulls mean the whole section, and the heading's
 *     ordinal names it — see the module header.
 *
 * THE HEADING EXCLUSION IS THE ONE THAT NEEDED ARGUING, AND IT WAS FOUND BY A TEST RATHER THAN
 * FORESEEN. A heading carries no stamp, so it reaches this function by the same path an authored
 * line does — and it would be given a bracket, and with it the TEXT rung, which compares
 * CHARACTERS. `~/qntm/metrics.md` prints its five headings as `## <name> <emoji> <ratio>` and the
 * ratio changes every cycle. A heading identified by its characters is precisely the defect
 * `instance.ts` exists to remove, and its answer — a heading's identity token is a CONSTANT,
 * because exactly one heading exists per section ordinal by construction — is already strictly
 * better than anything a neighbourhood could say. So a heading is excluded, and the fact is
 * derived rather than passed in: the line that OPENS a section is that section's heading
 * (`instance.ts` attributes a heading's own record to the section it opens), which is a fact
 * already encoded in the ordinals this function receives.
 *
 * THE LAST CASE USED TO BE WIDER AND IT IS NOW NARROW, WHICH IS THE WHOLE OF THIS CHANGE. It read
 * "nothing in its section carries a stamp" and refused the operator's first capture into an empty
 * section outright. It now refuses only when there is no section ORDINAL either — because the
 * ordinal is a landmark, and it is the same landmark a heading's own identity token is built on.
 * See the module header for the argument, the measurement, and what the ordinal cannot survive.
 */
export function relativeAnchorFor(
  places: readonly (LinePlace | null)[],
  lines: readonly string[],
  lineIndex: number,
): RelativeAnchor | null {
  const place = places[lineIndex] ?? null;
  if (place === null || place.node !== null) {
    return null;
  }
  const section: number | null = place.section;

  const bounds = boundsOf(places, section);
  if (bounds === null) {
    return null;
  }
  // THE LINE THAT OPENS A SECTION IS THAT SECTION'S HEADING, and a heading is excluded — see the
  // JSDoc above for the argument. `section === null` is the region above the first heading, which
  // has no heading to open it, so the first line there is an ordinary line.
  if (section !== null && bounds.first === lineIndex) {
    return null;
  }

  // UP, stopping where the section stops. A blank is stepped over (it has no section to compare);
  // the heading that OPENS this section belongs to it (instance.ts's own attribution), so the scan
  // stops one line further up, at the first line of the section above.
  let above: string | null = null;
  let aboveAt = -1;
  for (let at = lineIndex - 1; at >= 0; at -= 1) {
    const other = places[at];
    if (other === null || other === undefined) {
      continue;
    }
    if (other.section !== section) {
      break;
    }
    if (other.node !== null) {
      above = other.node;
      aboveAt = at;
      break;
    }
  }

  let below: string | null = null;
  let belowAt = -1;
  for (let at = lineIndex + 1; at < places.length; at += 1) {
    const other = places[at];
    if (other === null || other === undefined) {
      continue;
    }
    if (other.section !== section) {
      break;
    }
    if (other.node !== null) {
      below = other.node;
      belowAt = at;
      break;
    }
  }

  // NO BRACKET AND NO ORDINAL IS NO LANDMARK. Two nulls INSIDE a section still name a region — the
  // section itself, by the ordinal of the heading that opens it. Above the file's first heading
  // there is no heading and so no ordinal, and the region would be the whole file.
  if (above === null && below === null && section === null) {
    return null;
  }

  const from = above === null ? bounds.first : aboveAt + 1;
  const to = below === null ? bounds.last : belowAt - 1;
  const gap = gapBetween(places, section, from, to);
  const offset = gap.indexOf(lineIndex);
  if (offset === -1) {
    return null;
  }

  return { above, below, section, gap: gap.length, offset, text: lines[lineIndex] ?? "" };
}

/**
 * Where `anchor`'s line is in the arriving projection — the BRACKET rung first, the TEXT rung only
 * when the bracket refuses. See the module header for what each rung claims and why the weaker one
 * exists.
 *
 * `places` and `lines` describe the SAME arriving source: `instancesOf(after, view)` and
 * `after.split("\n")`. The caller passes both because this module derives neither — it reads a
 * projection, it does not parse one.
 */
export function resolveRelativeAnchor(
  anchor: RelativeAnchor,
  places: readonly (LinePlace | null)[],
  lines: readonly string[],
): RelativeReading {
  const bracket = bracketRung(anchor, places, lines);
  if (bracket.outcome !== "refused") {
    return bracket;
  }
  return textRung(anchor, places, lines, bracket);
}

/** The strong rung: the neighbourhood still holds, and the characters in it confirm the line. */
function bracketRung(
  anchor: RelativeAnchor,
  places: readonly (LinePlace | null)[],
  lines: readonly string[],
): RelativeReading {
  let aboveAt = -1;
  if (anchor.above !== null) {
    const printings = printingsOf(places, anchor.above);
    if (printings.length === 0) {
      return { outcome: "refused", because: "above-absent" };
    }
    if (printings.length > 1) {
      return { outcome: "refused", because: "above-ambiguous" };
    }
    aboveAt = printings[0] as number;
  }

  let belowAt = -1;
  if (anchor.below !== null) {
    const printings = printingsOf(places, anchor.below);
    if (printings.length === 0) {
      return { outcome: "refused", because: "below-absent" };
    }
    if (printings.length > 1) {
      return { outcome: "refused", because: "below-ambiguous" };
    }
    belowAt = printings[0] as number;
  }

  // THE BRACKET MUST STILL BE A BRACKET. Two nodes that swapped places, or that now print in two
  // different sections, describe no region at all — and a region that is not a region cannot
  // contain the line. Refused, never repaired.
  const aboveSection = aboveAt === -1 ? null : (places[aboveAt]?.section ?? null);
  const belowSection = belowAt === -1 ? null : (places[belowAt]?.section ?? null);
  if (aboveAt !== -1 && belowAt !== -1) {
    if (belowAt <= aboveAt || aboveSection !== belowSection) {
      return { outcome: "refused", because: "bracket-crossed" };
    }
  }

  // WHICH SECTION THE REGION IS IN. A bracket that resolved names it directly — the section the
  // bracketing node prints in NOW, which is what makes a node that moved section refuse rather than
  // bracket a region it left. With NO bracket at all the region is the whole section, and the only
  // thing naming it is the ordinal the anchor recorded: the heading's own landmark. See the module
  // header for why that is the same fact `instance.ts` already trusts a heading's identity to.
  const bracketed = aboveAt !== -1 || belowAt !== -1;
  if (!bracketed && anchor.section === null) {
    return { outcome: "refused", because: "no-landmark" };
  }
  const section = bracketed ? (aboveAt !== -1 ? aboveSection : belowSection) : anchor.section;
  const bounds = boundsOf(places, section);
  if (bounds === null) {
    // A view that printed six headings and now prints four has no section 5 to be relative to.
    // Distinct from `gap-changed`, which says the region IS there and has a different shape.
    return { outcome: "refused", because: bracketed ? "gap-changed" : "section-absent" };
  }
  const from = aboveAt === -1 ? bounds.first : aboveAt + 1;
  const to = belowAt === -1 ? bounds.last : belowAt - 1;
  const gap = gapBetween(places, section, from, to);

  // THE GAP IS A COUNT AND IT MUST MATCH EXACTLY. A cycle that inserted or removed a line in this
  // neighbourhood moved every offset in it, and an offset read against a different gap is a guess
  // dressed as arithmetic.
  if (gap.length !== anchor.gap) {
    return { outcome: "refused", because: "gap-changed" };
  }
  const candidate = gap[anchor.offset];
  if (candidate === undefined) {
    return { outcome: "refused", because: "gap-changed" };
  }
  if (!extendsLine(anchor.text, lines[candidate] ?? "")) {
    return { outcome: "refused", because: "text-changed" };
  }
  return { outcome: "found", lineIndex: candidate, via: "relative" };
}

/**
 * The weak rung: the neighbourhood is gone, but exactly one line in the view still carries the
 * operator's characters. See the module header for why this exists and what it is NOT allowed to do
 * (pick, when more than one matches).
 *
 * `refusal` is the BRACKET's own reason, and it is what this rung returns when it finds nothing
 * either — so the caller always learns why the STRONG claim failed, never only that the weak one
 * did. There is deliberately no separate "nothing extends the text" reason: the bracket has already
 * said something more specific in every case that reaches here (`text-changed` when the slot was
 * right and the characters were not, one of the six others when the neighbourhood itself moved), and
 * a second name for the same event is a name that will one day disagree with the first.
 */
function textRung(
  anchor: RelativeAnchor,
  places: readonly (LinePlace | null)[],
  lines: readonly string[],
  refusal: Extract<RelativeReading, { outcome: "refused" }>,
): RelativeReading {
  const candidates: number[] = [];
  places.forEach((place, at) => {
    if (place !== null && extendsLine(anchor.text, lines[at] ?? "")) {
      candidates.push(at);
    }
  });
  if (candidates.length === 1) {
    return { outcome: "found", lineIndex: candidates[0] as number, via: "text" };
  }
  if (candidates.length > 1) {
    return { outcome: "ambiguous", candidates };
  }
  return refusal;
}

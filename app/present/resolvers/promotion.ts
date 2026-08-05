/**
 * THE PARENT-PROMOTION RESOLVER — `graphmatch.ts`'s own wire half.
 *
 * Ported from `app/index.html`'s `WAITING_FOR_TAG_BINDING`, `edgeSourceOf`, `prospectiveEdgeBinding`,
 * `structuralParentLineIndex`, `bareId`, `parentCandidateFor`, `structuralRelationshipChangeFor`,
 * `parentPromotionFor`, `parentPromotionNoteFor`, `parentPromotionDiagnosticFor`,
 * `updateParentBadge` and `parentPredictionFor` — twelve names, one resolver, no behaviour change.
 *
 * ── WHAT IT IS FOR ──
 *
 * Rules the operator publishes — `task-with-open-part-of-child-becomes-outcome`, its `#waiting-for`
 * sibling, the routine/habit pair — carry a one-hop `children:` edge step, and the RULES resolver
 * abstains on every one of them (`rule-pattern-needs-graph-traversal`) because it only ever has ONE
 * line's fields and never a graph. This closes that gap for the shape he asked for by name: he
 * indents a task beneath another task, and the PARENT — not the line he just committed — is the
 * candidate a graph-aware rule now has to answer for.
 *
 * ── THE EFFECT LANDS ON A DIFFERENT ROW, AND IT IS NEVER WRITTEN THERE ──
 *
 * Every other axis answers for the line `commit` itself carries. A promotion decided for the PARENT
 * cannot ride this write at all — there is no POST for a row that was not edited — so it is
 * SURFACED (`#parentBadge`, and a `predict` decoration on the row above) and never written
 * anywhere. If the operator wants it on the page for real, the engine's own next cycle writes it;
 * this is the browser saying, honestly, what that cycle is about to do.
 *
 * ── COVERAGE, AND THE SAME SILENT GAP THE RULES AXIS HAD ──
 *
 * `applyGraphAwareRules` reports `undecidable` exactly as `applyRules` does, and the old reader
 * surfaced it only when `applied.length === 0` — so a pass in which something fired reported
 * "parent: decided" while other graph-aware rules went unconsulted. Carried as `coverage` now, on
 * the answer, unread by `show`. Making it expressible and surfacing it are two changes; this is the
 * first, and the badge string is byte-identical to what shipped.
 */

import { sectionAt, sectionOrderFor } from "../address.js";
import { resolveLineFields } from "../membership.js";
import type { ResolvedFields } from "../membership.js";
import type { QualificationLanguage, SectionQualification } from "../qualification.js";
import { applyRules, renderRuleEffects } from "../rules.js";
import type { RuleEffect } from "../rules.js";
import { applyGraphAwareRules } from "../graphmatch.js";
import type { GraphSnapshot } from "../graphmatch.js";
import { stampSpans, tagSpans } from "../rendition.js";
import type { StructuralLanguage } from "../structural.js";
import type { Arming, CommitContext, Reading, ResolverSpec } from "../resolve.js";
import { NOT_EVALUATED, coverageOf } from "../resolve.js";

/**
 * THE ONE EDGE BINDING THIS APP KNOWS BY NAME, AND WHY IT IS NOT A SECOND `structural.indent`.
 *
 * `structural.ts`'s published wire carries only the GLOBAL indent default (which edge type an
 * ORDINARY indent creates, and which end is which) — never the PER-TAG overrides
 * `vocabulary/structural_tokens.yaml` declares (`#waiting-for`, `#requires`, `#unlocks`, …),
 * because that generator was scoped, on purpose, to what a render narration needed. Widening it to
 * publish the full token vocabulary — including the edge TYPE each tag claims, declared in a THIRD
 * file (`edge_tags.yaml`) — is real, separately-scoped work.
 *
 * What this leg needs is narrower: ONE tag, mapped to the edge type and direction
 * `structural_tokens.yaml`'s own comment states in as many words — "`#waiting-for` (bare, indented)
 * -> WAITING_FOR parent->child and claims the indent slot (no PART_OF)". It is NOT a generalised
 * reader: a second graph-aware rule keyed to a DIFFERENT bare tag needs a second line here, and the
 * two functions below say so rather than pretending this table is the whole vocabulary.
 */
export const WAITING_FOR_TAG_BINDING = {
  tag: "#waiting-for",
  edgeType: "WAITING_FOR",
  edgeSource: "position",
} as const;

/**
 * `edgeType -> "self" | "position" | undefined` — `graphmatch.ts`'s own `EdgeSourceOf` contract.
 * The GLOBAL indent binding's edge type is answered from the PUBLISHED declaration (generic —
 * follows whatever the operator declares, no hardcode); the one extra binding is the constant
 * above; anything else is honestly `undefined`, and `graphmatch.ts` abstains rather than guessing.
 */
export function edgeSourceOfFor(
  structural: StructuralLanguage | undefined,
): (edgeType: string) => "self" | "position" | undefined {
  return (edgeType: string) => {
    const indent = structural?.indent;
    if (indent !== undefined && indent.edgeType === edgeType) {
      return indent.edgeSource;
    }
    if (WAITING_FOR_TAG_BINDING.edgeType === edgeType) {
      return WAITING_FOR_TAG_BINDING.edgeSource;
    }
    return undefined;
  };
}

/**
 * Which edge this freshly-committed LINE's own gesture creates to its structural parent — the
 * global indent default UNLESS the line's own tags claim the slot for the one tag above.
 * `undefined` when there is no published indent binding to fall back to at all.
 */
export function prospectiveEdgeBinding(
  line: string,
  structural: StructuralLanguage | undefined,
): { readonly edgeType: string } | undefined {
  if (tagSpans(line).some((span) => span.text === WAITING_FOR_TAG_BINDING.tag)) {
    return { edgeType: WAITING_FOR_TAG_BINDING.edgeType };
  }
  const indent = structural?.indent;
  if (indent === undefined) {
    return undefined;
  }
  return { edgeType: indent.edgeType };
}

/**
 * The nearest PRECEDING line, strictly less indented than `lines[lineIndex]`, skipping blank lines
 * — the standard nesting rule the engine's own differ uses (`content_diff.py`: a raw leading-space
 * count, popped by `stack[-1][0] >= depth`). `null` when nothing shallower precedes this line at
 * all — a root-level line, which is not a structural child of anything.
 *
 * Works uniformly whether the line found is a real content line, a heading, or anything else this
 * app does not recognise as a node: `parentCandidateFor`'s own call into `resolveLineFields` is
 * what refuses a shape that is not actually a checkbox line, never this function, which only ever
 * measures whitespace.
 */
export function structuralParentLineIndex(lines: readonly string[], lineIndex: number): number | null {
  const leadingWhitespace = (line: string): number => (/^\s*/.exec(line) ?? [""])[0].length;
  const childIndent = leadingWhitespace(lines[lineIndex] ?? "");
  for (let i = lineIndex - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue; // blank — keep scanning upward, same as a heading would be skipped past
    if (leadingWhitespace(line) < childIndent) return i;
  }
  return null;
}

/** `[[qntm:N]]` -> `N`, and `qntm:N` -> `N` — normalises whichever spelling a graph node's own `id`
 * carries against the bare id `stampSpans` extracts from a line's stamp, so a real match is never
 * missed over a prefix this app is not certain about either way. */
const bareId = (id: string): string => String(id).replace(/^qntm:/i, "");

/** Either a resolved candidate or the reason there is none. */
type ParentCandidate =
  | { readonly id: string | null; readonly fields: ResolvedFields }
  | { readonly abstain: string };

/**
 * The structural parent's own id + resolved fields — from the LIVE GRAPH when the parent line
 * already carries a `[[qntm:N]]` stamp (the graph, never a re-derivation off the line, is this
 * app's source of truth for an existing node — the same posture `resolveLineFields` takes when it
 * refuses "already-a-node"), or resolved the SAME way a fresh candidate's fields are when the
 * parent line carries no stamp yet, because an unstamped parent is ITSELF not yet a node the graph
 * can answer for. Returns `{ abstain }` rather than guessing when neither source can answer.
 */
export function parentCandidateFor(
  parentLine: string,
  parentSection: SectionQualification,
  snapshot: GraphSnapshot | null,
  qualification: QualificationLanguage,
): ParentCandidate {
  const stamped = stampSpans(parentLine);
  const first = stamped[0];
  if (first !== undefined) {
    if (snapshot === null) {
      return { abstain: "graph-not-loaded" };
    }
    const wanted = bareId(first.id);
    const node = snapshot.nodes.find((n) => bareId(n.id) === wanted);
    if (node === undefined) {
      return { abstain: "parent-not-in-graph" };
    }
    return { id: node.id, fields: { node_type: node.type, ...node.fields } };
  }
  const fields = resolveLineFields(parentLine, parentSection, qualification);
  if (typeof fields === "string") {
    return { abstain: `parent-${fields}` };
  }
  return { id: null, fields };
}

/**
 * DID `commit`'s OWN LINE GAIN A STRUCTURAL PARENT IT DID NOT HAVE A MOMENT AGO, LOSE ONE IT DID,
 * OR IS ITS RELATIONSHIP TO WHATEVER PRECEDES IT UNCHANGED — the one fact `read` gates on, in place
 * of the enumeration (`commit.kind !== "insert-line"`) that shipped instead of it and missed the
 * operator's commonest gesture: type the child, THEN indent it (a `set-line` commit, never an
 * insert).
 *
 * `commit.kind === "set-line"`: `commit.source` IS this line's own file a moment ago — a `set-line`
 * commit replaces exactly one line and shifts nothing else, so the SAME `lineIndex` names the SAME
 * physical line on both sides. This is what makes `>`/`<` AND a hand-typed change to a line's own
 * leading whitespace both reachable here: neither is an insert, and neither needs to be.
 *
 * EVERY OTHER `kind`: `commit.source` at this index is a DIFFERENT, unrelated line about to be
 * pushed down, never this line's own before. A line still being minted has no honest "before", so
 * this reads as "no relationship a moment ago" — simply true for a line that did not exist — rather
 * than mis-reading an unrelated line's indentation as this one's history. A hypothetical future
 * `kind` gets the SAME safe default, which can only ever under-report a LOST relationship and never
 * invent a GAINED one, since `after` is always read for real.
 *
 * `"gained"` CARRIES THE INDEX IT IS GAINED FROM, and that is the one thing this port adds to the
 * page's own version: "gained" means `afterParentLineIndex !== null` BY CONSTRUCTION, and putting
 * the number on the variant is how the compiler is told so. The alternative was a `null` check the
 * logic already guarantees can never fire — a branch no test could ever turn red, which reads as a
 * protection and defends nothing.
 */
export type RelationshipChange =
  | { readonly kind: "unchanged" }
  | { readonly kind: "lost" }
  | { readonly kind: "gained"; readonly parentLineIndex: number };

export function structuralRelationshipChangeFor(
  commit: CommitContext["commit"],
  afterParentLineIndex: number | null,
): RelationshipChange {
  const beforeParentLineIndex =
    commit.kind === "set-line" ? structuralParentLineIndex(commit.source.split("\n"), commit.lineIndex) : null;
  if (beforeParentLineIndex === afterParentLineIndex) {
    return { kind: "unchanged" };
  }
  if (afterParentLineIndex === null) {
    return { kind: "lost" };
  }
  return { kind: "gained", parentLineIndex: afterParentLineIndex };
}

/** What the graph-aware pass decided about the row ABOVE the committed one. */
export interface PromotionOutcome {
  /** WHICH row the effect is about, so a caller never has to re-derive it. */
  readonly parentLineIndex: number;
  /** Possibly empty — "the parent was checked and nothing about it changes" is a real answer. */
  readonly applied: readonly RuleEffect[];
  /** A fired rule carries an unmodelled `emit_event`. See the rules resolver for the distinction
   * between this and `coverage`. */
  readonly partial: boolean;
}

export type PromotionCommitReading = Reading<PromotionOutcome>;

export const promotionSpec: ResolverSpec<PromotionCommitReading> = {
  id: "parent",
  badge: "parentBadge",

  read(ctx: CommitContext): PromotionCommitReading {
    const { view, commit } = ctx;
    const { structural, qualification, resolution, rules: rulesTable } = ctx.declared;
    if (rulesTable === undefined || qualification === undefined || resolution === undefined) {
      return NOT_EVALUATED;
    }
    if (commit.markdown === null) {
      return NOT_EVALUATED;
    }
    const lines = commit.markdown.split("\n");
    const parentLineIndex = structuralParentLineIndex(lines, commit.lineIndex);
    const relationship = structuralRelationshipChangeFor(commit, parentLineIndex);
    if (relationship.kind === "unchanged") {
      return NOT_EVALUATED;
    }
    if (relationship.kind === "lost") {
      // THE RELATIONSHIP WAS REMOVED (an outdent, or any edit that un-indents this line past its
      // former parent), NEVER GAINED. Abstaining rather than running the graph-aware pass is not
      // caution for its own sake: `applyGraphAwareRules` can only ever ADD a prospective child to a
      // candidate's existing neighbours — it has no way to SUBTRACT one the live graph still names
      // — so asking "does the OLD parent still qualify" would score against a graph state that
      // still contains the child this very commit is removing. That is a confidently wrong "no
      // change" rather than an honest unknown, which is worse than saying nothing.
      return { kind: "abstains", because: "structural-relationship-removed" };
    }
    // relationship.kind === "gained" — everything below reads exactly as it always has, now simply
    // reachable from more than one `commit.kind`, and with the parent's index carried by the
    // variant rather than re-narrowed from a nullable local.
    const parentAt = relationship.parentLineIndex;

    const sectionOrder = sectionOrderFor(view, qualification.sectionOrder);
    const childSectionId = sectionAt(commit.markdown, commit.lineIndex, view.id, sectionOrder);
    const childSection = childSectionId === null ? undefined : qualification.sections[view.id]?.[childSectionId];
    if (childSection === undefined) {
      return { kind: "abstains", because: "no-section-declaration" };
    }
    const childLine = lines[commit.lineIndex] ?? "";
    const childFieldsRaw = resolveLineFields(childLine, childSection, qualification);
    if (typeof childFieldsRaw === "string") {
      return { kind: "abstains", because: `child-${childFieldsRaw}` };
    }

    const binding = prospectiveEdgeBinding(childLine, structural);
    if (binding === undefined) {
      return NOT_EVALUATED;
    }

    const parentSectionId = sectionAt(commit.markdown, parentAt, view.id, sectionOrder);
    const parentSection = parentSectionId === null ? undefined : qualification.sections[view.id]?.[parentSectionId];
    if (parentSection === undefined) {
      return { kind: "abstains", because: "no-section-declaration" };
    }
    const parentLine = lines[parentAt] ?? "";
    const snapshot = ctx.graph;
    const parentCandidate = parentCandidateFor(parentLine, parentSection, snapshot, qualification);
    if ("abstain" in parentCandidate) {
      return { kind: "abstains", because: parentCandidate.abstain };
    }

    // NO CLOCK READ. None of the graph-aware rules this closes (the outcome pair, the habit pair)
    // name `$cycle_today`/`$cycle_week_end` in their actions, and both pass functions already handle
    // an unresolved cycle variable by SKIPPING just that one action — never guessing a value and
    // never blocking every other action in the same rule. So `undefined` costs nothing for the rules
    // this exists to decide, and costs one narrow, honestly-scoped gap for a FUTURE graph-aware rule
    // that stamps a date. Threading the rules axis's own already-read instant through would remove
    // even that gap, and is separately-scoped follow-up work.
    const childPass = applyRules(childFieldsRaw, rulesTable, undefined);
    const prospective = { edgeType: binding.edgeType, fields: childPass.fields };

    const pass = applyGraphAwareRules(
      parentCandidate.fields,
      parentCandidate.id,
      rulesTable,
      snapshot ?? { nodes: [], edges: [] },
      edgeSourceOfFor(structural),
      prospective,
      undefined,
    );
    if (pass.applied.length === 0 && pass.undecidable.length > 0) {
      return { kind: "abstains", because: "graph-match-undecidable" };
    }
    return {
      kind: "answer",
      coverage: coverageOf(pass.undecidable),
      parentLineIndex: parentAt,
      applied: pass.applied,
      partial: pass.partial.length > 0,
    };
  },

  say(reading: PromotionCommitReading): string {
    if (reading.kind !== "answer" || reading.applied.length === 0) {
      return "";
    }
    const words = reading.applied.map((effect) => {
      if (effect.verb === "retype") return `becomes ${effect.to}`;
      if (effect.verb === "set") return `sets ${effect.field}`;
      return `clears ${effect.field}`;
    });
    return `the row above ${words.join(", ")}`;
  },

  show(reading: PromotionCommitReading): string {
    if (reading.kind === "not-evaluated") {
      return "";
    }
    if (reading.kind === "abstains") {
      return `parent: abstained — ${reading.because}`;
    }
    // A REAL, DECIDED ANSWER — the graph-aware pass ran and nothing in it fired. Never conflated
    // with an abstention.
    if (reading.applied.length === 0) {
      return "parent: decided — no change";
    }
    return reading.partial ? "parent: decided (partial — action(s) not modelled)" : "parent: decided";
  },

  /**
   * THE PARENT'S OWN PREDICTION — the row ABOVE `commit`, decorated with the retype a promotion rule
   * decided for it, when this app can spell that retype onto a line at all.
   *
   * WHY ONLY THE `retype` EFFECTS. `task-with-open-part-of-child-becomes-outcome` and its three
   * siblings ALWAYS pair their retype with a `set_field` targeting `auto_outcome`/`auto_habit`, and
   * `vocabulary/markers.yaml` declares no trailing marker for either — `renderRuleEffects`'s
   * ALL-OR-NOTHING rule ("never show a line half-corrected") would therefore abstain on EVERY real
   * promotion this app will ever see, silencing the one scenario this whole axis exists to paint.
   * That rule protects a claim about what a LINE'S OWN CHARACTERS will become; `auto_outcome` never
   * becomes characters at all, in this decoration OR in the engine's own eventual content. Filtering
   * to `retype` before rendering is not routing around the guard; it is asking the guard the
   * question it can answer, and `show` above still reports the retype AND the un-renderable set
   * together, in words.
   */
  arm(ctx: CommitContext, reading: PromotionCommitReading): readonly Arming[] {
    const { commit } = ctx;
    const qualification = ctx.declared.qualification;
    if (reading.kind !== "answer" || reading.applied.length === 0) {
      return [];
    }
    if (qualification === undefined || commit.markdown === null) {
      return [];
    }
    const retypes = reading.applied.filter((effect) => effect.verb === "retype");
    if (retypes.length === 0) {
      return [];
    }
    const parentLine = commit.markdown.split("\n")[reading.parentLineIndex] ?? "";
    const rendered = renderRuleEffects(parentLine, retypes, qualification.tokens.node_type ?? {}, {}, {});
    if (rendered.kind !== "rendered") {
      return [];
    }
    const text = rendered.text.slice(parentLine.length).trim();
    return text === "" ? [] : [{ surface: "predict", prediction: { lineIndex: reading.parentLineIndex, text } }];
  },
};

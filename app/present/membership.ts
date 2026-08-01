/**
 * membership — after this edit, does this line still belong in the section it is in?
 *
 * PURE: no DOM, no fetch, no clock, no storage. It reads a line's characters, a section's declared
 * qualification, and answers, or refuses. It NEVER moves anything.
 *
 * ── THE QUESTION, IN THE OPERATOR'S OWN TERMS ──
 *
 * `inbox.md` has two sections. "Inbox" qualifies on `inbox-items` (node_type is `inbox`, not done).
 * "Domain Empty" qualifies on `domain-empty` (no domain set, not done, not structural chrome). Type
 * a bare line under Domain Empty and nothing sets a domain — the view's own header comment says
 * captures stay untagged there deliberately — while the node type falls through the registration
 * cascade to the global default, `task`. So it has no domain, it is not done, and it BELONGS where
 * it was typed. Add `#work` and it acquires a domain, so it does not.
 *
 * Both answers follow from the declaration plus the line's own characters. Neither needs a cycle,
 * a graph walk or the clock. That is the whole claim, and `tests/present-membership.test.mjs`
 * proves exactly those two cases against the operator's real `inbox.yaml`.
 *
 * ── WHAT IT REFUSES, AND WHY EACH REFUSAL IS NOT TIMIDITY ──
 *
 * `newline.ts` returns `null` at its GLOBAL rung rather than pick one of two plausible seeds,
 * because one guess aborts the operator's whole cycle and the other makes his line vanish. The
 * refusals here are chosen the same way — each one is a place where a confident answer would be a
 * fabrication:
 *
 *   NO SECTION DECLARATION. The section is not in the published table, so its qualification was
 *   refused by the generator (it traverses an edge, consults the clock, or ranges over a field the
 *   app cannot resolve). 118 of the operator's 159 qualifications are in this category and the app
 *   is silent about every one of them.
 *
 *   THE LINE ALREADY CARRIES A `[[qntm:N]]` STAMP. This module answers for a line being TYPED. An
 *   existing node's fields live in the graph, and this module does not read the graph — but the
 *   deeper reason is that token REMOVAL is not token addition inverted. Whether deleting `#work`
 *   from a stamped line clears `domain` is the engine's ingest semantics to decide, and guessing
 *   it would produce exactly the confident-and-wrong answer this module exists to avoid.
 *
 *   THE LINE IS NOT A CHECKBOX WITH A DECLARED BOX. `status` is one of the three fields the
 *   predicates range over, and the checkbox is the only thing on a line that sets it. A prose line
 *   has no status to resolve — and per `source.ts`, a bare `- ` line under a checkbox-shaped
 *   default is refused at the applier's form gate and simply vanishes, so it has no membership to
 *   report either.
 *
 *   THE LINE CARRIES NO CONTENT, OR TWO TOKENS THAT SET THE SAME FIELD. An empty line mints an
 *   `(untitled)` node (`source.ts`, measured 2026-07-31) rather than the node the operator meant;
 *   `#work #personal` on one line is a precedence question the engine owns and this module does
 *   not.
 *
 * ── WHAT IT NEVER DOES ──
 *
 * It produces no `Contribution` and no `SourceEdit`. The closed union of three edit kinds in
 * `source.ts` is untouched, and no caller of this module can reach a POST body — the answer's only
 * destination is something shown to the operator. Nor may a caller MOVE the row: saying "this will
 * leave Domain Empty" is safe, and relocating a row under a live cursor is not, because an edit in
 * flight is a safe haven the operator chose. This module deliberately returns a statement, not an
 * instruction.
 */

import { carriesContent, qntmIdSpans, tagSpans } from "./resolution.js";
import type {
  FieldPredicate,
  FieldValue,
  FindClause,
  QualificationLanguage,
  Qualifier,
} from "./qualification.js";

/** The three fields a line being typed decides, and the only three any published predicate uses. */
export const RESOLVABLE_FIELDS = ["node_type", "domain", "status"] as const;

/** A line's resolved fields — what the engine would mint from it, for these three fields only. */
export type ResolvedFields = Readonly<Record<string, FieldValue>>;

/** Why nothing is said. Each value names a refusal in this module's header. */
export type Abstention =
  | "no-section-declaration"
  | "already-a-node"
  | "not-a-declared-checkbox"
  | "no-content"
  | "ambiguous-token";

/** The answer, when there is one. `belongs` is the whole of it; the rest is provenance. */
export interface MembershipAnswer {
  readonly belongs: boolean;
  readonly view: string;
  readonly section: string;
  readonly qualification: string;
  readonly fields: ResolvedFields;
  /**
   * THE OPERATOR'S OWN WORDS FOR `section` — "Domain Empty", never "domain-empty". Read off the
   * declaration's `name:` when the config carries one (185 of 186 sections do); for the one that
   * does not, the id is reformatted (`domain-empty` -> `Domain Empty`) rather than shown raw, so a
   * caller building a sentence never has to decide what to do with a missing decoration itself.
   */
  readonly sectionName: string;
}

/** Either an answer, or the reason there is none. Never a default, never a guess. */
export type MembershipReading =
  | { readonly kind: "answer"; readonly answer: MembershipAnswer }
  | { readonly kind: "abstains"; readonly because: Abstention };

const abstains = (because: Abstention): MembershipReading => ({ kind: "abstains", because });

/**
 * `domain-empty` -> `Domain Empty`. The fallback for the one section (of 186) whose config
 * declares no `name:` — never used against the operator's real "Domain Empty" case, which has
 * one, but a caller must still get a sentence rather than a raw id for the section that lacks it.
 */
function titleCaseFromId(id: string): string {
  return id
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * A checkbox line: optional indent, `- `, a one-character box, a space, then the rest.
 *
 * Deliberately NOT `resolution.ts`'s `classifyLine`, whose `TASK` regex closes over `[ ]`/`[x]`
 * only — a display grammar for the two boxes the painter can render. `checkbox.yaml` declares six
 * (`[/]` in_progress, `[~]` waiting, and so on), and which ones exist is the CONFIG's to say. This
 * matches any single-character box and then looks it up in the published token table, so a seventh
 * box declared tomorrow is understood here with no edit, and an undeclared one is refused rather
 * than assumed open.
 */
const CHECKBOX = /^\s*- (\[[^\]]\]) (.*)$/;

function evaluatePredicate(actual: FieldValue, predicate: FieldPredicate): boolean {
  if ("not" in predicate) return !evaluatePredicate(actual, predicate.not);
  return actual === predicate.eq;
}

/**
 * One `find` clause against one resolved field set.
 *
 * Mirrors `qntm_graph.patterns.engine._filter_nodes`: the node type is checked by SET MEMBERSHIP
 * (a missing `node_type` in the find skips the check entirely), and every other key is a field
 * predicate, all conjoined. A field the resolver never set reads as `null`, which is the engine's
 * behaviour too — `node.fields.get(name)` returns `None` for an absent field, so `domain: null`
 * matches a node that never had one.
 */
export function matchesFindClause(fields: ResolvedFields, clause: FindClause): boolean {
  if (clause.nodeType !== null) {
    const nodeType = fields["node_type"];
    if (typeof nodeType !== "string" || !clause.nodeType.includes(nodeType)) return false;
  }
  for (const [field, predicate] of Object.entries(clause.fields)) {
    if (!evaluatePredicate(fields[field] ?? null, predicate)) return false;
  }
  return true;
}

/** Match the find, and match NONE of the exclusions. See `Qualifier` for why both are one shape. */
export function matchesQualifier(fields: ResolvedFields, qualifier: Qualifier): boolean {
  if (!matchesFindClause(fields, qualifier.find)) return false;
  return !qualifier.exclude.some((clause) => matchesFindClause(fields, clause));
}

/**
 * What the engine would mint from `line`, typed under `section`, for the three resolvable fields.
 *
 * The registration cascade, least specific first: the node type comes from the section's published
 * `nodeType` (already resolved through GLOBAL then VIEW by the generator), the section's own
 * `defaults:` block supplies any fields it declares, and then the line's own tokens win over both —
 * the same "more specific beats less specific" ordering the presentation cascade resolves by.
 *
 * Returns the reason instead when the line is one this module will not answer for.
 */
export function resolveLineFields(
  line: string,
  section: { readonly nodeType: string; readonly defaults: ResolvedFields | undefined },
  language: QualificationLanguage,
): ResolvedFields | Abstention {
  if (qntmIdSpans(line).length > 0) return "already-a-node";

  const match = CHECKBOX.exec(line);
  if (match === null) return "not-a-declared-checkbox";
  const box = match[1] ?? "";
  const tail = match[2] ?? "";
  const status = language.tokens["status"]?.[box];
  if (status === undefined) return "not-a-declared-checkbox";
  if (!carriesContent(line)) return "no-content";

  const fields: Record<string, FieldValue> = { node_type: section.nodeType, domain: null };
  for (const [field, value] of Object.entries(section.defaults ?? {})) fields[field] = value;
  fields["status"] = status;

  // The line's own tokens. A token that sets a field the SECTION also set overrides it; a second
  // token setting the SAME field is an ambiguity the engine's precedence owns, not this module's.
  const seen = new Set<string>();
  for (const span of tagSpans(tail)) {
    for (const field of RESOLVABLE_FIELDS) {
      const value = language.tokens[field]?.[span.text];
      if (value === undefined) continue;
      if (seen.has(field)) return "ambiguous-token";
      seen.add(field);
      fields[field] = value;
    }
  }
  return fields;
}

/**
 * Does `line`, typed under `sectionId` of `viewId`, belong there?
 *
 * The only entry point a caller needs. Everything it can refuse, it refuses by name.
 */
export function membershipFor(
  viewId: string,
  sectionId: string,
  line: string,
  language: QualificationLanguage,
): MembershipReading {
  const section = language.sections[viewId]?.[sectionId];
  if (section === undefined) return abstains("no-section-declaration");
  const qualifier = language.predicates[section.qualification];
  // Unreachable through `readQualificationDeclaration`, which drops a section whose qualification
  // was not published. Kept because this function also accepts a hand-built language in tests, and
  // a missing predicate must abstain rather than throw under a live cursor.
  if (qualifier === undefined) return abstains("no-section-declaration");

  const fields = resolveLineFields(line, section, language);
  if (typeof fields === "string") return abstains(fields);

  return {
    kind: "answer",
    answer: {
      belongs: matchesQualifier(fields, qualifier),
      view: viewId,
      section: sectionId,
      qualification: section.qualification,
      fields,
      sectionName: section.name ?? titleCaseFromId(sectionId),
    },
  };
}

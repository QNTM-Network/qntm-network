/**
 * qualification — reading the MEMBERSHIP half of the declaration: which section a line belongs in,
 * not how a token is shown and not what a gesture means. PURE: no DOM, no fetch, no clock.
 *
 * A view's section names a `qualification` — a pattern the engine resolves each cycle to decide
 * which nodes render under that heading. Type a line under "Domain Empty" in `inbox.md` and a
 * determinate question follows immediately: after that edit, does this line still belong where it
 * is? The operator's own framing: a bare line there gets no domain and defaults to a task, so it
 * stays; add `#work` and it acquires a domain, so it leaves. Both answers are implied by the
 * declaration plus the line's own resolved fields, and neither needs a cycle.
 *
 * ── WHY THIS IS A READER AND NOT AN INTERPRETER ──
 *
 * `structural.ts`'s header states the constraint this module inherits: "read the document,
 * validate its shape, say what was wrong with it, and hand back a plain lookup table" — building a
 * second interpreter of a language the engine already interprets is the failure mode the
 * structural-language design names outright and refuses.
 *
 * This module does not interpret the pattern language. `scripts/generate-qualification-declaration.mjs`
 * does that ONCE, against the monorepo's config, and publishes only what normalises into a closed
 * grammar of two operators (`eq`, `not`) over a candidate node's own fields — refusing, with a
 * recorded reason, every pattern that traverses an edge, consults the clock, takes a parameter, or
 * ranges over a field the app cannot resolve. What arrives here is the result: a lookup table of
 * predicates. `membership.ts` tests a resolved field set against one. Neither reads YAML, neither
 * knows what `children:` or `$cycle_today` mean, and neither can learn.
 *
 * The bet is the one the presentation cascade already took and won: evaluating a DECLARED predicate
 * over fields the browser already holds is a read, not a second authority. What makes it safe here
 * is the direction of travel — the answer is only ever DISPLAYED. This module produces no
 * `Contribution`, `membership.ts` produces no `SourceEdit`, and the closed union of three edit
 * kinds in `source.ts` is untouched. There is no path from this answer to a POST body.
 *
 * ── WHAT IS PUBLISHED, AND WHAT IS DELIBERATELY NOT ──
 *
 * Measured against the operator's real config on 2026-08-01: 186 sections, 159 distinct
 * qualifications. 41 patterns covering 47 sections normalise into the local grammar AND range only
 * over fields the app can resolve for a line being typed. 118 do not and are absent from
 * `predicates` — 27 traverse edges, 11 use an orderable comparison (the clock-bound date windows),
 * 79 range over a field like `project` or `title` that is not decided by anything visible in the
 * line, and 1 compares against a cycle variable. `refused` carries every one of them with its
 * reason, so a config change that moves a section across that boundary shows up in a diff rather
 * than silently shrinking what the browser will say.
 *
 * A section absent from `sections` is a section this app says NOTHING about. That is the same
 * posture `newline.ts` takes at its GLOBAL rung and the cursor anchor takes when it cannot find its
 * line: refuse rather than guess, because a wrong answer here would tell the operator his line is
 * about to move when it is not.
 *
 * ── GENERATED, NEVER TRANSCRIBED ──
 *
 * Same condition `structural.ts` records for its own key. A hand-written copy of a predicate is a
 * second version of a config fact, free to drift from the one the engine reads; the whole reason
 * this declaration exists is to remove that. `tests/qualification-agreement.test.mjs` measures the
 * published predicates against the ENGINE's own `qntm_graph.patterns.engine.matches_pattern` over
 * the operator's real graph, so a generator that mis-read the YAML does not survive `npm test`.
 */

/** A scalar a node field can hold, as it arrives in the declaration. */
export type FieldValue = string | number | boolean | null;

/**
 * One field's predicate. Closed to two forms because those are the only two the generator emits:
 * `eq` is the engine's default for a bare YAML value, and `not` is its one logical operator
 * (`patterns/engine.py::_NODE_PREDICATE_OPERATORS`). The orderable comparisons exist in the engine
 * and are deliberately NOT here — every pattern using one compares a date against a cycle variable,
 * which is not local, so admitting the operator would only widen this type without widening what
 * can be answered.
 */
export type FieldPredicate = { readonly eq: FieldValue } | { readonly not: FieldPredicate };

/**
 * One `find` clause: an optional node-type restriction plus field predicates, conjoined.
 * `nodeType === null` means the clause places no restriction on type — the engine's own
 * `_filter_nodes` semantics, where a missing `node_type` skips the type filter entirely.
 */
export interface FindClause {
  readonly nodeType: readonly string[] | null;
  readonly fields: Readonly<Record<string, FieldPredicate>>;
}

/**
 * A ONE-HOP `children:`/`parents:` edge-existence step — `compile-qualification.mjs`'s
 * `normaliseEdgeStep`, unchanged on the wire. `direction` names which single traversal the engine
 * takes (`children`/`parents`, never transitive — an `ancestors:`/`descendants:` step is refused at
 * compile time and never reaches here); `edgeType`/`nodeType`/`fields` restrict the NEIGHBOUR node
 * reached that way, the same `FindClause` shape reused rather than restated; `mustExist` is `true`
 * for the config's `exists: true` and `false` for `not_exists: true`.
 *
 * NEITHER `qualification.ts` NOR `membership.ts` EVALUATES THIS STEP. Doing so needs the graph
 * payload's own edges, which `resolveLineFields`'s whole domain (a line being typed, not yet
 * minted) never carries — see `qualifierNeedsGraph`, below, and that function's own callers.
 */
export interface EdgeStep {
  readonly direction: "children" | "parents";
  readonly mustExist: boolean;
  readonly edgeType: readonly string[];
  readonly nodeType: readonly string[] | null;
  readonly fields: Readonly<Record<string, FieldPredicate>>;
}

/**
 * A whole qualification, flattened: match `find`, match NONE of `exclude`, and — when `edgeSteps`
 * is present and non-empty — satisfy every one-hop edge-existence test too.
 *
 * `exclude` carries both SELF-test step forms the config uses, because over a single candidate node
 * they are the same form. A hand-authored `- not: [{find_nodes: {status: done}}]` with `min: 1` and
 * the structural-chrome exclusions that `bundle/pattern_structural_defaults.py` synthesises at
 * bundle load both reduce to "the candidate does not match this find" — see the generator's header
 * for the derivation through `_evaluate_not`'s bounded complement.
 *
 * `edgeSteps` IS OPTIONAL, AND ABSENT RATHER THAN `[]` FOR EVERY PATTERN THAT NEVER USES ONE — the
 * exact two-key `{find, exclude}` shape every pattern published before this key existed keeps
 * publishing, byte-identical (`compile-qualification.mjs`'s own comment at the call site). A
 * `Qualifier` carrying a non-empty `edgeSteps` cannot be decided by `matchesQualifier` — see
 * `qualifierNeedsGraph`.
 */
export interface Qualifier {
  readonly find: FindClause;
  readonly exclude: readonly FindClause[];
  readonly edgeSteps?: readonly EdgeStep[];
}

/**
 * Does deciding `qualifier` need the graph — a neighbour node's own fields, reached by one
 * `children:`/`parents:` hop — rather than only the candidate's own fields? `matchesQualifier`
 * (`membership.ts`) throws rather than guess when this is `true`; every caller of it (`membership.ts`'s
 * `membershipFor`, `rules.ts`'s `applyRules`) checks this FIRST and abstains instead of calling it.
 *
 * A pure structural check, not a graph read: it asks what KIND of qualifier this is, never what a
 * `children:` step MEANS — the same "reader, not interpreter" boundary this module's own header
 * draws for the rest of the pattern language.
 */
export function qualifierNeedsGraph(qualifier: Qualifier): boolean {
  return (qualifier.edgeSteps?.length ?? 0) > 0;
}

/** What a section declares: its qualification, and the registration defaults a line under it gets. */
export interface SectionQualification {
  readonly qualification: string;
  /** The node type an unstamped line resolves to here — the VIEW rung, or the GLOBAL default. */
  readonly nodeType: string;
  /** The section's own `defaults:` block, if it declares one (`{domain: admin}` and the like). */
  readonly defaults: Readonly<Record<string, FieldValue>> | undefined;
  /**
   * THE OPERATOR'S OWN WORDS FOR THIS SECTION — the config's `name:` ("Domain Empty"), never its
   * `id:` ("domain-empty"). Absent only for the one section of 186 whose config declares no name;
   * `membershipFor` (`membership.ts`) is what supplies a fallback, because a reader has no config
   * to fall back against and must not guess one.
   */
  readonly name: string | undefined;
}

/** The whole published table. A lookup, not a resolver. */
export interface QualificationLanguage {
  /** `default_registration.default_node_type` — the GLOBAL rung. Absent when unreadable. */
  readonly defaultNodeType: string | undefined;
  /** Schema-declared identity-unique types, for callers that want to name why chrome is excluded. */
  readonly structuralNodeTypes: readonly string[];
  /** field name -> token -> value, for every token in the vocabulary that sets that field. */
  readonly tokens: Readonly<Record<string, Readonly<Record<string, FieldValue>>>>;
  readonly predicates: Readonly<Record<string, Qualifier>>;
  readonly sections: Readonly<Record<string, Readonly<Record<string, SectionQualification>>>>;
  /**
   * Per view, the FULL declared order of section ids — including sections whose qualification was
   * refused. `sections` above is a proper SUBSET, filtered to what the app can decide, and 2 of 27
   * published views (`daily-work` 1 of 5, `daily-personal` 3 of 8) are that subset for real. L3
   * ADDRESSING (`app/present/address.ts`'s `sectionAt`) indexes THIS list by heading ordinal, never
   * `Object.keys(sections[view])` — that would work on 25 views and silently misaddress the two
   * daily surfaces the operator actually uses. See `generate-qualification-declaration.mjs`'s
   * header for where this is captured, and why it must never be re-derived from `sections`.
   */
  readonly sectionOrder: Readonly<Record<string, readonly string[]>>;
  /** pattern name -> why nothing was published for it. Never read to decide anything. */
  readonly refused: Readonly<Record<string, string>>;
  /**
   * EVERY DECLARATION THE GENERATOR READ AND DID NOT PUBLISH, `what -> why`.
   *
   * `refused` above is one KIND of that — a pattern that would not normalise into the local
   * grammar. `dropped` is all the others, and before it existed not one of them was written down
   * anywhere: a vocabulary token setting a fourth field, a view sheet the reader could not parse,
   * a section missing its `qualification:`. `generate-qualification-declaration.mjs:396` dropped
   * 73 of the operator's own tokens with no record, no warning and no exit code, which is the
   * third of the three outcomes `design-the-rule-mirror.md` §8.4 names — "silently ignores it" —
   * and the one it says must not exist.
   *
   * Like `refused`, this is not read to DECIDE anything: the app's behaviour is identical with it
   * present or absent. It is here so the declaration states what it does not contain, and so
   * `--check` (which compares the whole generated object) turns red when that set changes.
   */
  readonly dropped: Readonly<Record<string, string>>;
  /**
   * HOW MANY HOPS OFF THE CANDIDATE NODE THIS APP MAY ATTEMPT — `scripts/compile-qualification.mjs`'s
   * `TRAVERSAL_DEPTH`, published unconditionally, the same "engine fact, not a config fact" posture
   * `scripts/compile-resolution.mjs`'s `ENGINE_DEFAULT_ORDERING` already takes for a different one.
   *
   * NOT YET CONSUMED BY ANYTHING — stated rather than hidden, the same posture this codebase has
   * already taken for a published-before-its-reader fact (`resolutiontable.ts`'s own header). What
   * it makes possible: a caller can ask "is this declaration's own idea of how far it may look
   * still 1?" instead of that ceiling being an unstated property of `normaliseStep`'s admitted
   * shapes. Widening it to 2 or more, and teaching the grammar to actually reach that far, is a
   * SEPARATE, larger change this field does not attempt — see `TRAVERSAL_DEPTH`'s own header.
   */
  readonly traversalDepth: number;
}

/** Mirrors `StructuralReading` and `DeclarationReading`: the value, plus what was wrong with it. */
export interface QualificationReading {
  readonly qualification: QualificationLanguage;
  readonly problems: readonly string[];
}

/** The top-level key this module owns. `declaration.ts` knows its name only to skip it. */
export const QUALIFICATION_KEY = "qualification";

/** The built-in floor for `traversalDepth`, when the served key is absent or malformed — 1, not
 * 0, because a one-hop `EdgeStep` (`qualifierNeedsGraph`, below) is already what this grammar
 * admits regardless of whether the number arrived; falling back to 0 would make the REPORTED
 * ceiling lie about what the reader already does. Mirrors `DEFAULT_INDENT_UNIT`'s own reasoning in
 * `declaration.ts`: one built-in number, not a second copy of the compiler's own constant. */
export const DEFAULT_TRAVERSAL_DEPTH = 1;

const TOP_KEYS = [
  "defaultNodeType",
  "structuralNodeTypes",
  "tokens",
  "predicates",
  "sections",
  "sectionOrder",
  "refused",
  "dropped",
  "traversalDepth",
] as const;
const SECTION_KEYS = ["qualification", "nodeType", "defaults", "name"] as const;

const EMPTY: QualificationLanguage = {
  defaultNodeType: undefined,
  structuralNodeTypes: [],
  tokens: {},
  predicates: {},
  sections: {},
  sectionOrder: {},
  refused: {},
  dropped: {},
  traversalDepth: DEFAULT_TRAVERSAL_DEPTH,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const shapeOf = (value: unknown): string => (Array.isArray(value) ? "an array" : typeof value);

function isFieldValue(value: unknown): value is FieldValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function readPredicate(path: string, value: unknown, problems: string[]): FieldPredicate | undefined {
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object — this predicate stays unknown`);
    return undefined;
  }
  const keys = Object.keys(value);
  if (keys.length !== 1) {
    problems.push(
      `'${path}' carries ${keys.length} operators (${keys.join(", ")}) — exactly one of eq, not`,
    );
    return undefined;
  }
  if (keys[0] === "eq") {
    if (!isFieldValue(value.eq)) {
      problems.push(`'${path}.eq' is ${shapeOf(value.eq)}, not a scalar or null`);
      return undefined;
    }
    return { eq: value.eq };
  }
  if (keys[0] === "not") {
    const inner = readPredicate(`${path}.not`, value.not, problems);
    return inner === undefined ? undefined : { not: inner };
  }
  problems.push(`'${path}' uses operator '${keys[0]}' — the operators are eq, not`);
  return undefined;
}

function readFindClause(path: string, value: unknown, problems: string[]): FindClause | undefined {
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object — this clause stays unknown`);
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (key !== "nodeType" && key !== "fields") {
      problems.push(`'${path}.${key}' is not a recognised key — the keys are nodeType, fields`);
    }
  }
  let nodeType: readonly string[] | null = null;
  if (value.nodeType !== null && value.nodeType !== undefined) {
    if (
      !Array.isArray(value.nodeType) ||
      value.nodeType.length === 0 ||
      !value.nodeType.every((t) => typeof t === "string" && t !== "")
    ) {
      problems.push(
        `'${path}.nodeType' is ${JSON.stringify(value.nodeType)}, not null and not a non-empty ` +
          "array of non-empty strings — this clause stays unknown",
      );
      return undefined;
    }
    nodeType = value.nodeType as readonly string[];
  }
  const fields: Record<string, FieldPredicate> = {};
  if (value.fields !== undefined) {
    if (!isPlainObject(value.fields)) {
      problems.push(`'${path}.fields' is ${shapeOf(value.fields)}, not an object`);
      return undefined;
    }
    for (const [field, predicate] of Object.entries(value.fields)) {
      const read = readPredicate(`${path}.fields.${field}`, predicate, problems);
      // A clause with ONE unreadable predicate is dropped whole. Keeping the readable half would
      // widen the clause — fewer conjuncts match MORE nodes — so a partial read is not a smaller
      // answer, it is a different and wrong one.
      if (read === undefined) return undefined;
      fields[field] = read;
    }
  }
  return { nodeType, fields };
}

const DIRECTIONS = ["children", "parents"] as const;

/**
 * One `edgeSteps[i]` entry — `EdgeStep`'s own wire shape. Mirrors `readFindClause`'s "one bad
 * clause drops the whole pattern" posture: a dropped edge step would silently turn a REQUIRED
 * existence test into "not checked", which admits nodes the config excludes — the same wrong-
 * direction risk a dropped `exclude` clause already carries.
 */
function readEdgeStep(path: string, value: unknown, problems: string[]): EdgeStep | undefined {
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object — this edge step stays unknown`);
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (key !== "direction" && key !== "mustExist" && key !== "edgeType" && key !== "nodeType" && key !== "fields") {
      problems.push(
        `'${path}.${key}' is not a recognised key — the keys are direction, mustExist, edgeType, ` +
          "nodeType, fields",
      );
    }
  }
  if (typeof value.direction !== "string" || !(DIRECTIONS as readonly string[]).includes(value.direction)) {
    problems.push(`'${path}.direction' is ${JSON.stringify(value.direction)}, not children or parents`);
    return undefined;
  }
  if (typeof value.mustExist !== "boolean") {
    problems.push(`'${path}.mustExist' is ${shapeOf(value.mustExist)}, not a boolean`);
    return undefined;
  }
  const edgeType = readStringList(`${path}.edgeType`, value.edgeType, problems);
  if (edgeType.length === 0) return undefined; // readStringList already reported the shape problem
  // Reuses `readFindClause`'s own nodeType/fields reading over the REST of this object — the
  // neighbour-node restriction is exactly a `FindClause`, just reached by a hop instead of self.
  const rest = readFindClause(path, { nodeType: value.nodeType, fields: value.fields }, problems);
  if (rest === undefined) return undefined;
  return {
    direction: value.direction as EdgeStep["direction"],
    mustExist: value.mustExist,
    edgeType,
    nodeType: rest.nodeType,
    fields: rest.fields,
  };
}

function readPredicates(value: unknown, problems: string[]): Record<string, Qualifier> {
  if (!isPlainObject(value)) {
    problems.push(
      `'${QUALIFICATION_KEY}.predicates' is ${shapeOf(value)}, not an object — every section's ` +
        "membership stays unknown",
    );
    return {};
  }
  const out: Record<string, Qualifier> = {};
  for (const [name, raw] of Object.entries(value)) {
    const path = `${QUALIFICATION_KEY}.predicates.${name}`;
    if (!isPlainObject(raw)) {
      problems.push(`'${path}' is ${shapeOf(raw)}, not an object`);
      continue;
    }
    for (const key of Object.keys(raw)) {
      if (key !== "find" && key !== "exclude" && key !== "edgeSteps") {
        problems.push(`'${path}.${key}' is not a recognised key — the keys are find, exclude, edgeSteps`);
      }
    }
    const find = readFindClause(`${path}.find`, raw.find, problems);
    if (find === undefined) continue;
    if (raw.exclude !== undefined && !Array.isArray(raw.exclude)) {
      problems.push(`'${path}.exclude' is ${shapeOf(raw.exclude)}, not an array`);
      continue;
    }
    const exclude: FindClause[] = [];
    let ok = true;
    for (const [i, clause] of (raw.exclude ?? []).entries()) {
      const read = readFindClause(`${path}.exclude[${i}]`, clause, problems);
      // A dropped exclusion would ADMIT nodes the engine excludes — structural chrome, done
      // captures. Same reasoning as a dropped field predicate: refuse the whole pattern.
      if (read === undefined) {
        ok = false;
        break;
      }
      exclude.push(read);
    }
    if (!ok) continue;
    if (raw.edgeSteps !== undefined && !Array.isArray(raw.edgeSteps)) {
      problems.push(`'${path}.edgeSteps' is ${shapeOf(raw.edgeSteps)}, not an array`);
      continue;
    }
    const edgeSteps: EdgeStep[] = [];
    let edgeOk = true;
    for (const [i, step] of (raw.edgeSteps ?? []).entries()) {
      const read = readEdgeStep(`${path}.edgeSteps[${i}]`, step, problems);
      if (read === undefined) {
        edgeOk = false;
        break;
      }
      edgeSteps.push(read);
    }
    if (!edgeOk) continue;
    out[name] = edgeSteps.length > 0 ? { find, exclude, edgeSteps } : { find, exclude };
  }
  return out;
}

function readSections(
  value: unknown,
  predicates: Readonly<Record<string, Qualifier>>,
  problems: string[],
): Record<string, Record<string, SectionQualification>> {
  if (!isPlainObject(value)) {
    problems.push(
      `'${QUALIFICATION_KEY}.sections' is ${shapeOf(value)}, not an object — no section is placed`,
    );
    return {};
  }
  const out: Record<string, Record<string, SectionQualification>> = {};
  for (const [viewId, sectionsValue] of Object.entries(value)) {
    const viewPath = `${QUALIFICATION_KEY}.sections.${viewId}`;
    if (!isPlainObject(sectionsValue)) {
      problems.push(`'${viewPath}' is ${shapeOf(sectionsValue)}, not an object`);
      continue;
    }
    const sections: Record<string, SectionQualification> = {};
    for (const [sectionId, raw] of Object.entries(sectionsValue)) {
      const path = `${viewPath}.${sectionId}`;
      if (!isPlainObject(raw)) {
        problems.push(`'${path}' is ${shapeOf(raw)}, not an object`);
        continue;
      }
      for (const key of Object.keys(raw)) {
        if (!(SECTION_KEYS as readonly string[]).includes(key)) {
          problems.push(
            `'${path}.${key}' is not a recognised key — the keys are ${SECTION_KEYS.join(", ")}`,
          );
        }
      }
      if (typeof raw.qualification !== "string" || raw.qualification === "") {
        problems.push(`'${path}.qualification' is ${JSON.stringify(raw.qualification)}, not a name`);
        continue;
      }
      if (!(raw.qualification in predicates)) {
        // A section pointing at a predicate that was not published cannot be decided, and a
        // dangling name is worth reporting rather than dropping in silence: it means the two
        // halves of one generated document disagree.
        problems.push(
          `'${path}.qualification' names '${raw.qualification}', which is not in predicates — ` +
            "this section stays undecidable",
        );
        continue;
      }
      if (typeof raw.nodeType !== "string" || raw.nodeType === "") {
        problems.push(`'${path}.nodeType' is ${JSON.stringify(raw.nodeType)}, not a node type`);
        continue;
      }
      let defaults: Record<string, FieldValue> | undefined;
      if (raw.defaults !== undefined) {
        if (!isPlainObject(raw.defaults)) {
          problems.push(`'${path}.defaults' is ${shapeOf(raw.defaults)}, not an object`);
          continue;
        }
        defaults = {};
        let ok = true;
        for (const [field, fieldValue] of Object.entries(raw.defaults)) {
          if (!isFieldValue(fieldValue)) {
            problems.push(`'${path}.defaults.${field}' is ${shapeOf(fieldValue)}, not a scalar`);
            ok = false;
            break;
          }
          defaults[field] = fieldValue;
        }
        if (!ok) continue;
      }
      // A WRONG-SHAPED NAME IS REPORTED AND TREATED AS ABSENT, NOT DROPPED. Unlike `defaults` —
      // which feeds the registration cascade an `answer` would be wrong without — `name` decorates
      // an answer that is otherwise complete; dropping the whole section over unreadable prose
      // would refuse a real answer for a fact nothing downstream depends on to be correct.
      let name: string | undefined;
      if (raw.name !== undefined) {
        if (typeof raw.name === "string" && raw.name !== "") {
          name = raw.name;
        } else {
          problems.push(`'${path}.name' is ${JSON.stringify(raw.name)}, not a name — falling back`);
        }
      }
      sections[sectionId] = { qualification: raw.qualification, nodeType: raw.nodeType, defaults, name };
    }
    if (Object.keys(sections).length > 0) out[viewId] = sections;
  }
  return out;
}

function readTokens(value: unknown, problems: string[]): Record<string, Record<string, FieldValue>> {
  if (!isPlainObject(value)) {
    problems.push(
      `'${QUALIFICATION_KEY}.tokens' is ${shapeOf(value)}, not an object — no line's fields can ` +
        "be resolved",
    );
    return {};
  }
  const out: Record<string, Record<string, FieldValue>> = {};
  for (const [field, familyValue] of Object.entries(value)) {
    const path = `${QUALIFICATION_KEY}.tokens.${field}`;
    if (!isPlainObject(familyValue)) {
      problems.push(`'${path}' is ${shapeOf(familyValue)}, not an object`);
      continue;
    }
    const family: Record<string, FieldValue> = {};
    for (const [token, tokenValue] of Object.entries(familyValue)) {
      if (!isFieldValue(tokenValue) || tokenValue === null) {
        problems.push(`'${path}.${token}' is ${JSON.stringify(tokenValue)}, not a scalar value`);
        continue;
      }
      family[token] = tokenValue;
    }
    out[field] = family;
  }
  return out;
}

function readStringList(path: string, value: unknown, problems: string[]): string[] {
  if (!Array.isArray(value) || !value.every((t) => typeof t === "string" && t !== "")) {
    problems.push(`'${path}' is ${JSON.stringify(value)}, not an array of non-empty strings`);
    return [];
  }
  return value as string[];
}

/**
 * `sectionOrder`: per view, an array of section ids — the full declared order, unfiltered. Read
 * with the same "one bad view does not blind the reader to the rest" posture as `sections`: a
 * malformed view's order is reported and dropped; the rest survive.
 */
function readSectionOrder(
  value: unknown,
  problems: string[],
): Record<string, readonly string[]> {
  if (!isPlainObject(value)) {
    problems.push(
      `'${QUALIFICATION_KEY}.sectionOrder' is ${shapeOf(value)}, not an object — no section can ` +
        "be addressed by its position in the file",
    );
    return {};
  }
  const out: Record<string, readonly string[]> = {};
  for (const [viewId, order] of Object.entries(value)) {
    out[viewId] = readStringList(`${QUALIFICATION_KEY}.sectionOrder.${viewId}`, order, problems);
  }
  return out;
}

/**
 * Both `refused` and `dropped` are the same shape — a name mapped to a sentence saying why nothing
 * was published for it — so they are read by one function keyed on which one it is reading. Two
 * copies of this loop would be two places for the strictness to drift apart.
 */
function readReasons(key: string, value: unknown, problems: string[]): Record<string, string> {
  if (!isPlainObject(value)) {
    problems.push(`'${QUALIFICATION_KEY}.${key}' is ${shapeOf(value)}, not an object`);
    return {};
  }
  const out: Record<string, string> = {};
  for (const [name, reason] of Object.entries(value)) {
    if (typeof reason !== "string") {
      problems.push(`'${QUALIFICATION_KEY}.${key}.${name}' is ${shapeOf(reason)}, not a string`);
      continue;
    }
    out[name] = reason;
  }
  return out;
}

/**
 * Read the `qualification` key of a served presentation declaration.
 *
 * Accepts the same `unknown` document the other two readers do, for the same reason: this is
 * `JSON.parse` of a file on a web server. No `qualification` key at all is SILENCE, not a problem —
 * the app then says nothing about any section, which is exactly what it did before this key
 * existed. A key of the wrong shape is reported, and the sub-fact that could not be read falls back
 * to absent rather than aborting the read, so one malformed section does not blind the app to the
 * rest. The one asymmetry with `structural.ts`: an unreadable predicate or exclusion drops its
 * WHOLE pattern rather than degrading it, because a partially-read conjunction matches MORE nodes
 * than the config says, and answering wrongly is worse than not answering.
 */
export function readQualificationDeclaration(document: unknown): QualificationReading {
  if (!isPlainObject(document)) {
    return { qualification: EMPTY, problems: [] }; // declaration.ts's own guard already reports this
  }
  if (!(QUALIFICATION_KEY in document)) {
    return { qualification: EMPTY, problems: [] };
  }
  const raw = document[QUALIFICATION_KEY];
  const problems: string[] = [];
  if (!isPlainObject(raw)) {
    problems.push(
      `'${QUALIFICATION_KEY}' is ${shapeOf(raw)}, not an object — no section's membership can be ` +
        "decided",
    );
    return { qualification: EMPTY, problems };
  }
  for (const key of Object.keys(raw)) {
    if (!(TOP_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `'${QUALIFICATION_KEY}.${key}' is not a recognised key and was NOT applied — the keys ` +
          `are ${TOP_KEYS.join(", ")}`,
      );
    }
  }
  let defaultNodeType: string | undefined;
  if ("defaultNodeType" in raw) {
    if (typeof raw.defaultNodeType === "string" && raw.defaultNodeType !== "") {
      defaultNodeType = raw.defaultNodeType;
    } else {
      problems.push(
        `'${QUALIFICATION_KEY}.defaultNodeType' is ${JSON.stringify(raw.defaultNodeType)}, not a ` +
          "node type — the GLOBAL registration rung stays unknown",
      );
    }
  }
  const predicates = "predicates" in raw ? readPredicates(raw.predicates, problems) : {};
  let traversalDepth = DEFAULT_TRAVERSAL_DEPTH;
  if ("traversalDepth" in raw) {
    if (typeof raw.traversalDepth === "number" && Number.isInteger(raw.traversalDepth) && raw.traversalDepth >= 0) {
      traversalDepth = raw.traversalDepth;
    } else {
      problems.push(
        `'${QUALIFICATION_KEY}.traversalDepth' is ${JSON.stringify(raw.traversalDepth)}, not a ` +
          `non-negative integer — the built-in default (${DEFAULT_TRAVERSAL_DEPTH}) is used instead`,
      );
    }
  }
  return {
    qualification: {
      defaultNodeType,
      structuralNodeTypes:
        "structuralNodeTypes" in raw
          ? readStringList(
              `${QUALIFICATION_KEY}.structuralNodeTypes`,
              raw.structuralNodeTypes,
              problems,
            )
          : [],
      tokens: "tokens" in raw ? readTokens(raw.tokens, problems) : {},
      predicates,
      sections: "sections" in raw ? readSections(raw.sections, predicates, problems) : {},
      sectionOrder: "sectionOrder" in raw ? readSectionOrder(raw.sectionOrder, problems) : {},
      refused: "refused" in raw ? readReasons("refused", raw.refused, problems) : {},
      dropped: "dropped" in raw ? readReasons("dropped", raw.dropped, problems) : {},
      traversalDepth,
    },
    problems,
  };
}

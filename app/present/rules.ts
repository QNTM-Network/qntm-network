/**
 * rules — reading the RULES-CATEGORY declaration (`scripts/compile-rules.mjs`'s own published
 * grammar: pattern, predicate, priority, one action, plus fire order) and APPLYING the closed set
 * it publishes to a freshly captured line's own resolved fields. PURE: no DOM, no fetch, no clock,
 * no storage — the one exception, `$cycle_today`, is threaded IN as a parameter, never read here.
 *
 * ── THE GAP THIS CLOSES ──
 *
 * `presentation.json`'s `structural`, `qualification` and `resolution` keys are read across 15
 * call sites; `rules` is read at zero. `stamp-created-at-on-task` sets `created_at` inside the
 * SAME pass that mints a task, so the browser's registration answer for a fresh capture is
 * missing a fact the engine adds ten seconds later — the `🆕 <date>` stamp the operator watches
 * for. This module is the READER half; `app/index.html` (`rulesReadingFor`/`armRuleApplication`)
 * is the WIRE half, the same split every other axis in this bundle already takes.
 *
 * ── BOUNDED APPLICATION, NOT AN INTERPRETER ──
 *
 * `applyRules` below evaluates EXACTLY the closed grammar `compile-rules.mjs` publishes — a
 * predicate that is `absent`/`null`/`eq`/`not` over the candidate's OWN resolved fields, and an
 * action that is `set_node_type`/`set_field`/`unset_field` targeting the candidate itself. It adds
 * no operator, no verb and no traversal `compile-rules.mjs` does not already model — the 86 rules
 * that generator drops (a `for_each` list, an `and` predicate, a computed-field reference, more
 * than one action) are simply not in `language.rules` at all, so this module never sees them and
 * cannot special-case them. If a future change to this file needs to teach it a fourth predicate
 * operator or a fourth verb to make some rule "work", that is a widening of the COMPILED grammar,
 * not of this reader, and belongs in `compile-rules.mjs` instead — see that file's own header.
 *
 * ── ONE PRIORITY-ORDERED PASS, NOT A FIXPOINT ──
 *
 * `language.order` is priority descending, stable, file order the tiebreak — computed once, at
 * compile time, over every published rule (`compile-rules.mjs`'s own "THE ORDER"). `applyRules`
 * walks it EXACTLY ONCE, left to right, mutating a working copy of the candidate's fields as each
 * rule fires — never re-scanning from the top and never looping until nothing changes. This is
 * not a simplification: `core/rule-engine`'s own executor (cited, not re-derived, in
 * `compile-rules.mjs`'s header) is itself one stable sort and one pass over it. A rule earlier in
 * the order CAN change whether a later rule's own pattern/predicate matches — measured directly
 * against the operator's real config: `routine-without-cadence-becomes-task` (order position 10)
 * retypes a bare routine capture to `task`, and `stamp-created-at-on-task` (position 14) then
 * matches the NOW-task candidate in the same walk and fires too. A caller that evaluated all 17
 * published rules against the ORIGINAL fields, independently, would miss this — it is why
 * `applyRules` threads one mutable working copy through the walk rather than mapping over
 * `language.order` independently per rule.
 *
 * ── WHAT THIS MODULE NEVER DOES ──
 *
 * It produces no `Contribution` and no `SourceEdit` on its own — `applyRules` is a pure
 * fields-in/fields-out function, the same shape `matchesQualifier` (membership.ts) already is. It
 * never reads the graph, never mints a `qntm:` id and never targets any node but the candidate
 * itself (`compile-rules.mjs`'s own compiler already refused every action that did, at compile
 * time — `propagate-to-parent` is one of the 86 that never reaches `language.rules` at all). Where
 * this module's caller decides to WRITE its answer into `commit.markdown` before a post — a
 * decision this module does not make — see `app/index.html`'s own header for that boundary.
 */

import type { EdgeStep, FieldValue, Qualifier } from "./select/qualification.js";
import { qualifierNeedsGraph } from "./select/qualification.js";
import { matchesQualifier } from "./select/membership.js";
import type { ResolvedFields } from "./select/membership.js";
import { tagSpans } from "./express/rendition.js";

/** Mirrors `compile-rules.mjs`'s `normaliseWhen` output exactly — the closed predicate grammar a
 * published rule's `when:` was reduced to. */
export type RuleWhen =
  | { readonly op: "true" }
  | { readonly op: "null"; readonly field: string }
  | { readonly op: "eq"; readonly field: string; readonly value: FieldValue }
  | { readonly op: "not"; readonly of: RuleWhen };

/** One published, modelled action — exactly `RuleEffect`'s own three verb shapes, minus `ruleId`
 * (which the action does not carry until it FIRES). `compile-rules.mjs`'s `normaliseModelledAction`
 * publishes this shape, in the config's own declared order. */
export type RuleActionSpec =
  | { readonly verb: "retype"; readonly to: string }
  | { readonly verb: "set"; readonly field: string; readonly to: FieldValue }
  | { readonly verb: "unset"; readonly field: string };

/** One published rule, exactly `compile-rules.mjs`'s own per-id shape — `pattern`/`when`/
 * `priority`/`actions` always present, `actions` a NON-EMPTY ordered list (WIDENED this leg from
 * "exactly one action shape" — see `compile-rules.mjs`'s own header, "WHAT THIS GRAMMAR MODELS").
 * `partial` is `true` only when the rule ALSO declares an `emit_event` this grammar recognises and
 * excludes — `actions` is then a real but INCOMPLETE account of the rule's effect; see
 * `applyRules`'s own header for what this module does with that fact. Absent (not `false`) for the
 * common case, mirroring the wire's own omission. */
export interface RuleSpec {
  readonly pattern: string;
  readonly when: RuleWhen;
  readonly priority: number;
  readonly actions: readonly RuleActionSpec[];
  readonly partial?: boolean;
}

/** The trailing-marker spelling for a `setsField` target — `compile-rules.mjs` PASS 3's own
 * output, restricted to the three shapes a value can trail a glyph as. */
export interface FieldMarker {
  readonly token: string;
  readonly kind: "date" | "int" | "float";
}

/** The whole published table. A lookup, not a resolver — `applyRules` below is the resolver. */
export interface RulesLanguage {
  /** `true` unless the served document's `order.established` was itself malformed — mirrors
   * `compile-rules.mjs`'s own `ORDER_UNESTABLISHED_REASON` escape hatch, kept ready though every
   * declaration this repo has ever generated sets it `true`. */
  readonly orderEstablished: boolean;
  /** The published rules' own fire order — every id in `rules` below, exactly once. Empty, and
   * `orderEstablished` false, when the served order could not be read. */
  readonly order: readonly string[];
  readonly rules: Readonly<Record<string, RuleSpec>>;
  /** pattern name -> the closed `find`/`exclude` grammar it normalised to — `app/present/
   * qualification.ts`'s own `Qualifier` shape, reused rather than restated (see this module's
   * header, and `compile-rules.mjs`'s PASS 2, for why one grammar serves both consumers). */
  readonly patterns: Readonly<Record<string, Qualifier>>;
  /** field name -> its trailing-marker spelling, where one exists — see `FieldMarker`. A
   * `setsField` target absent here has no glyph this app can write, and `applyRules`'s caller must
   * treat that rule's effect as unrenderable rather than invent one. */
  readonly fieldMarkers: Readonly<Record<string, FieldMarker>>;
  /** what -> why, for every declaration `compile-rules.mjs` read and did not publish. Never read
   * to decide anything — see every sibling category's own `dropped`/`refused` for the same rule. */
  readonly dropped: Readonly<Record<string, string>>;
}

export const RULES_KEY = "rules";

const EMPTY: RulesLanguage = {
  orderEstablished: false,
  order: [],
  rules: {},
  patterns: {},
  fieldMarkers: {},
  dropped: {},
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const shapeOf = (value: unknown): string => (Array.isArray(value) ? "an array" : typeof value);

function isFieldValue(value: unknown): value is FieldValue {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function readWhen(path: string, value: unknown, problems: string[]): RuleWhen | undefined {
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object`);
    return undefined;
  }
  const op = value.op;
  if (op === "true") return { op: "true" };
  if (op === "null" || op === "eq") {
    if (typeof value.field !== "string" || value.field === "") {
      problems.push(`'${path}.field' is ${JSON.stringify(value.field)}, not a field name`);
      return undefined;
    }
    if (op === "null") return { op: "null", field: value.field };
    if (!isFieldValue(value.value)) {
      problems.push(`'${path}.value' is ${shapeOf(value.value)}, not a scalar or null`);
      return undefined;
    }
    return { op: "eq", field: value.field, value: value.value };
  }
  if (op === "not") {
    const inner = readWhen(`${path}.of`, value.of, problems);
    return inner === undefined ? undefined : { op: "not", of: inner };
  }
  problems.push(`'${path}.op' is ${JSON.stringify(op)}, not one of true, null, eq, not`);
  return undefined;
}

/** One `actions[i]` entry. Mirrors `RuleEffect`'s own three verb shapes — see `RuleActionSpec`. */
function readActionSpec(path: string, value: unknown, problems: string[]): RuleActionSpec | undefined {
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object`);
    return undefined;
  }
  if (value.verb === "retype") {
    if (typeof value.to !== "string" || value.to === "") {
      problems.push(`'${path}.to' is ${JSON.stringify(value.to)}, not a node type`);
      return undefined;
    }
    return { verb: "retype", to: value.to };
  }
  if (value.verb === "set") {
    if (typeof value.field !== "string" || value.field === "") {
      problems.push(`'${path}.field' is ${JSON.stringify(value.field)}, not a field name`);
      return undefined;
    }
    if (!isFieldValue(value.to)) {
      problems.push(`'${path}.to' is ${shapeOf(value.to)}, not a scalar or null`);
      return undefined;
    }
    return { verb: "set", field: value.field, to: value.to };
  }
  if (value.verb === "unset") {
    if (typeof value.field !== "string" || value.field === "") {
      problems.push(`'${path}.field' is ${JSON.stringify(value.field)}, not a field name`);
      return undefined;
    }
    return { verb: "unset", field: value.field };
  }
  problems.push(`'${path}.verb' is ${JSON.stringify(value.verb)}, not retype, set or unset`);
  return undefined;
}

function readRuleSpec(path: string, value: unknown, problems: string[]): RuleSpec | undefined {
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object`);
    return undefined;
  }
  if (typeof value.pattern !== "string" || value.pattern === "") {
    problems.push(`'${path}.pattern' is ${JSON.stringify(value.pattern)}, not a pattern name`);
    return undefined;
  }
  const when = readWhen(`${path}.when`, value.when, problems);
  if (when === undefined) return undefined;
  if (typeof value.priority !== "number" || !Number.isInteger(value.priority)) {
    problems.push(`'${path}.priority' is ${JSON.stringify(value.priority)}, not an integer`);
    return undefined;
  }
  if (!Array.isArray(value.actions) || value.actions.length === 0) {
    problems.push(`'${path}.actions' is ${shapeOf(value.actions)}, not a non-empty array`);
    return undefined;
  }
  const actions: RuleActionSpec[] = [];
  for (const [i, raw] of value.actions.entries()) {
    const action = readActionSpec(`${path}.actions[${i}]`, raw, problems);
    // ONE UNREADABLE ACTION DROPS THE WHOLE RULE — the same "a partial read is a different and
    // wrong answer" posture `qualification.ts`'s `readFindClause` already takes: publishing the
    // OTHER, readable actions while silently losing one would apply an effect the config never
    // declared on its own.
    if (action === undefined) return undefined;
    actions.push(action);
  }
  if (value.partial !== undefined && typeof value.partial !== "boolean") {
    problems.push(`'${path}.partial' is ${shapeOf(value.partial)}, not a boolean`);
    return undefined;
  }
  return {
    pattern: value.pattern,
    when,
    priority: value.priority,
    actions,
    ...(value.partial === true ? { partial: true } : {}),
  };
}

function readFieldPredicate(path: string, value: unknown, problems: string[]): unknown | undefined {
  // Reuses the SAME two-operator shape `qualification.ts`'s own `readPredicate` already validates
  // — `{eq: scalar|null}` or `{not: <same>}` — restated locally rather than imported, because
  // `qualification.ts`'s reader is scoped to ITS OWN top-level key and importing a private helper
  // across category readers would couple two independent strict readers to one internal shape.
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object`);
    return undefined;
  }
  const keys = Object.keys(value);
  if (keys.length !== 1) {
    problems.push(`'${path}' carries ${keys.length} operators — exactly one of eq, not`);
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
    const inner = readFieldPredicate(`${path}.not`, value.not, problems);
    return inner === undefined ? undefined : { not: inner };
  }
  problems.push(`'${path}' uses operator '${keys[0]}' — the operators are eq, not`);
  return undefined;
}

function readFindClause(path: string, value: unknown, problems: string[]): Qualifier["find"] | undefined {
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object`);
    return undefined;
  }
  let nodeType: readonly string[] | null = null;
  if (value.nodeType !== null && value.nodeType !== undefined) {
    if (!Array.isArray(value.nodeType) || !value.nodeType.every((t) => typeof t === "string" && t !== "")) {
      problems.push(`'${path}.nodeType' is not null and not an array of non-empty strings`);
      return undefined;
    }
    nodeType = value.nodeType as readonly string[];
  }
  const fields: Record<string, unknown> = {};
  if (value.fields !== undefined) {
    if (!isPlainObject(value.fields)) {
      problems.push(`'${path}.fields' is ${shapeOf(value.fields)}, not an object`);
      return undefined;
    }
    for (const [field, predicate] of Object.entries(value.fields)) {
      const read = readFieldPredicate(`${path}.fields.${field}`, predicate, problems);
      if (read === undefined) return undefined;
      fields[field] = read;
    }
  }
  return { nodeType, fields } as Qualifier["find"];
}

const DIRECTIONS = ["children", "parents"] as const;

/**
 * One `edgeSteps[i]` entry — mirrors `qualification.ts`'s own `readEdgeStep`, restated rather than
 * imported for the SAME reason `readFindClause` above already is (this file's own header): two
 * independent strict readers, not one shared private helper.
 */
function readEdgeStep(path: string, value: unknown, problems: string[]): EdgeStep | undefined {
  if (!isPlainObject(value)) {
    problems.push(`'${path}' is ${shapeOf(value)}, not an object`);
    return undefined;
  }
  if (typeof value.direction !== "string" || !(DIRECTIONS as readonly string[]).includes(value.direction)) {
    problems.push(`'${path}.direction' is ${JSON.stringify(value.direction)}, not children or parents`);
    return undefined;
  }
  if (typeof value.mustExist !== "boolean") {
    problems.push(`'${path}.mustExist' is ${shapeOf(value.mustExist)}, not a boolean`);
    return undefined;
  }
  if (
    !Array.isArray(value.edgeType) ||
    value.edgeType.length === 0 ||
    !value.edgeType.every((t) => typeof t === "string" && t !== "")
  ) {
    problems.push(`'${path}.edgeType' is not a non-empty array of non-empty strings`);
    return undefined;
  }
  const rest = readFindClause(path, { nodeType: value.nodeType, fields: value.fields }, problems);
  if (rest === undefined) return undefined;
  return {
    direction: value.direction as EdgeStep["direction"],
    mustExist: value.mustExist,
    edgeType: value.edgeType as readonly string[],
    nodeType: rest.nodeType,
    fields: rest.fields,
  };
}

function readPatterns(value: unknown, problems: string[]): Record<string, Qualifier> {
  if (!isPlainObject(value)) {
    problems.push(`'${RULES_KEY}.patterns' is ${shapeOf(value)}, not an object`);
    return {};
  }
  const out: Record<string, Qualifier> = {};
  for (const [name, raw] of Object.entries(value)) {
    const path = `${RULES_KEY}.patterns.${name}`;
    if (!isPlainObject(raw)) {
      problems.push(`'${path}' is ${shapeOf(raw)}, not an object`);
      continue;
    }
    const find = readFindClause(`${path}.find`, raw.find, problems);
    if (find === undefined) continue;
    if (raw.exclude !== undefined && !Array.isArray(raw.exclude)) {
      problems.push(`'${path}.exclude' is ${shapeOf(raw.exclude)}, not an array`);
      continue;
    }
    const exclude: Qualifier["find"][] = [];
    let ok = true;
    for (const [i, clause] of (raw.exclude ?? []).entries()) {
      const read = readFindClause(`${path}.exclude[${i}]`, clause, problems);
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

function readFieldMarkers(value: unknown, problems: string[]): Record<string, FieldMarker> {
  if (!isPlainObject(value)) {
    problems.push(`'${RULES_KEY}.fieldMarkers' is ${shapeOf(value)}, not an object`);
    return {};
  }
  const out: Record<string, FieldMarker> = {};
  const kinds = new Set(["date", "int", "float"]);
  for (const [field, raw] of Object.entries(value)) {
    const path = `${RULES_KEY}.fieldMarkers.${field}`;
    if (!isPlainObject(raw) || typeof raw.token !== "string" || raw.token === "" || !kinds.has(raw.kind as string)) {
      problems.push(`'${path}' is not a {token, kind} marker`);
      continue;
    }
    out[field] = { token: raw.token, kind: raw.kind as FieldMarker["kind"] };
  }
  return out;
}

function readReasons(key: string, value: unknown, problems: string[]): Record<string, string> {
  if (!isPlainObject(value)) {
    problems.push(`'${RULES_KEY}.${key}' is ${shapeOf(value)}, not an object`);
    return {};
  }
  const out: Record<string, string> = {};
  for (const [name, reason] of Object.entries(value)) {
    if (typeof reason !== "string") {
      problems.push(`'${RULES_KEY}.${key}.${name}' is ${shapeOf(reason)}, not a string`);
      continue;
    }
    out[name] = reason;
  }
  return out;
}

/** Mirrors `structural.ts`/`qualification.ts`/`resolutiontable.ts`: the value, plus what was wrong
 * with it. */
export interface RulesReading {
  readonly rules: RulesLanguage;
  readonly problems: readonly string[];
}

/**
 * Read the `rules` key of a served presentation declaration. Silence is legal (the key absent);
 * a present-but-malformed sub-fact is reported and falls back to absent, the same "one malformed
 * corner does not blind the reader to the rest" posture every sibling category reader takes.
 */
export function readRulesDeclaration(document: unknown): RulesReading {
  if (!isPlainObject(document) || !(RULES_KEY in document)) {
    return { rules: EMPTY, problems: [] };
  }
  const raw = document[RULES_KEY];
  const problems: string[] = [];
  if (!isPlainObject(raw)) {
    problems.push(`'${RULES_KEY}' is ${shapeOf(raw)}, not an object`);
    return { rules: EMPTY, problems };
  }

  const rulesRaw = raw.rules;
  const rules: Record<string, RuleSpec> = {};
  if (isPlainObject(rulesRaw)) {
    for (const [id, entry] of Object.entries(rulesRaw)) {
      const spec = readRuleSpec(`${RULES_KEY}.rules.${id}`, entry, problems);
      if (spec !== undefined) rules[id] = spec;
    }
  } else {
    problems.push(`'${RULES_KEY}.rules' is ${shapeOf(rulesRaw)}, not an object`);
  }

  let orderEstablished = false;
  let order: readonly string[] = [];
  const orderRaw = raw.order;
  if (isPlainObject(orderRaw) && orderRaw.established === true) {
    if (Array.isArray(orderRaw.sequence) && orderRaw.sequence.every((id) => typeof id === "string")) {
      order = orderRaw.sequence as readonly string[];
      orderEstablished = true;
    } else {
      problems.push(`'${RULES_KEY}.order.sequence' is not an array of rule ids`);
    }
  } else if (isPlainObject(orderRaw) && orderRaw.established === false) {
    // A legitimate, named refusal (`ORDER_UNESTABLISHED_REASON`) — not a problem to report.
  } else {
    problems.push(`'${RULES_KEY}.order' is not a recognised {established, sequence} shape`);
  }

  return {
    rules: {
      orderEstablished,
      order,
      rules,
      patterns: "patterns" in raw ? readPatterns(raw.patterns, problems) : {},
      fieldMarkers: "fieldMarkers" in raw ? readFieldMarkers(raw.fieldMarkers, problems) : {},
      dropped: "dropped" in raw ? readReasons("dropped", raw.dropped, problems) : {},
    },
    problems,
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// APPLICATION — the closed grammar, run over one candidate's resolved fields.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Exported so `graphmatch.ts`'s own one-pass walk (evaluating an EXTERNAL candidate — a structural
 * PARENT the operator did not just commit — against the SAME published `RuleWhen` grammar) can
 * reuse this exact evaluation rather than a second, drifting copy. Behaviour is unchanged; only the
 * visibility widened.
 */
export function evaluateWhen(when: RuleWhen, fields: ResolvedFields): boolean {
  if (when.op === "true") return true;
  if (when.op === "null") return (fields[when.field] ?? null) === null;
  if (when.op === "eq") return (fields[when.field] ?? null) === when.value;
  return !evaluateWhen(when.of, fields);
}

/** One rule's effect, once it has fired — named by verb rather than left as the raw `RuleSpec`,
 * so a caller (`applyRules`'s own return, `app/index.html`'s renderer) never has to re-derive
 * which of the three action shapes it is looking at. */
export type RuleEffect =
  | { readonly verb: "retype"; readonly ruleId: string; readonly to: string }
  | { readonly verb: "set"; readonly ruleId: string; readonly field: string; readonly to: FieldValue }
  | { readonly verb: "unset"; readonly ruleId: string; readonly field: string };

/** What one pass over `language.order` produced. */
export interface RulePassResult {
  /** The candidate's fields, after every rule that fired has applied its effect — in ORDER, so a
   * later rule sees an earlier one's write, matching `compile-rules.mjs`'s own "ONE PASS" account. */
  readonly fields: ResolvedFields;
  /** Every rule that matched (pattern AND `when`) and fired, in the order it fired. */
  readonly applied: readonly RuleEffect[];
  /** Rule ids, in fire order, whose `actions` were applied but which ALSO carry `partial: true`
   * (an `emit_event` this grammar excludes) — `applied` above already carries their real, correct
   * modelled effects; this is the separate fact that those effects are not the WHOLE of what the
   * rule does. See `applyRules`'s own header for why the modelled effects still apply and render
   * rather than abstaining outright. */
  readonly partial: readonly string[];
  /** Rule ids, in `language.order`'s own order, SKIPPED because their `for_each` pattern carries a
   * one-hop edge step (`qualifierNeedsGraph`) — this pass could not tell whether they matched, so
   * it did not apply them, but it also did not treat them as a confident "no match". See
   * `applyRules`'s own header for why a rule here does not block a LATER rule in the same pass from
   * firing normally. */
  readonly undecidable: readonly string[];
}

/**
 * Run `language`'s published, priority-ordered rules over `fields` — ONE PASS, exactly as
 * `compile-rules.mjs`'s header derives the real engine does. PURE: no DOM, no fetch, no clock —
 * a `$cycle_today`/`$cycle_week_end` reference in a rule's `setsFieldTo` is substituted from
 * `today`, which the CALLER resolves (`app/present/today.ts`'s `todayFor`) and hands in; this
 * function never reads `Date.now()` itself. A `setsFieldTo` naming any OTHER `$`-prefixed
 * variable is a value this closed grammar cannot resolve — the rule still MATCHES (its pattern
 * and `when` are evaluated exactly as any other rule's), but its action is skipped: no field is
 * written, and it is not counted in `applied`. This is a narrower refusal than dropping the whole
 * rule at compile time would be, and deliberately so — `compile-rules.mjs` cannot know today
 * whether a future `setsFieldTo` will ever be `$cycle_today`-shaped, so refusing this one
 * unresolvable VALUE, per candidate, is this reader's own abstention to make, not the compiler's.
 *
 * ── WIDENED THIS LEG: MULTIPLE ACTIONS, AND TWO NEW WAYS A PASS CAN BE INCOMPLETE ──
 *
 * A rule's `actions` is now an ORDERED LIST (`compile-rules.mjs`'s own widening) — this function
 * applies every one, in order, exactly as it always applied its single action.
 *
 * TWO KINDS OF INCOMPLETENESS ARE NAMED, NEVER HIDDEN, NEVER TREATED AS A CONFIDENT "NO MATCH":
 *
 *   PARTIAL (`RulePassResult.partial`) — a rule that FIRED (its pattern and `when` both matched)
 *   but ALSO declares an `emit_event` this grammar excludes. Its modelled `actions` are REAL and
 *   CORRECT — the retype/set/unset genuinely happens — so they still apply to `working` and still
 *   appear in `applied`, rendering exactly as before. What is incomplete is only this function's
 *   OWN AWARENESS of the rule's full effect (an event fires that nothing here represents); the
 *   caller (`app/index.html`'s `rulesReadingFor`) surfaces that as an annotation on an otherwise
 *   real answer, never as a reason to withhold the modelled part.
 *
 *   UNDECIDABLE (`RulePassResult.undecidable`) — a rule whose `for_each` pattern carries a one-hop
 *   edge step (`qualifierNeedsGraph`): this function cannot tell whether the candidate matches it
 *   at all, because that needs a NEIGHBOUR node's fields and this function only ever has the
 *   candidate's own. SKIPPED, not treated as "does not match" and not treated as "the whole pass is
 *   void" — a LATER rule in `language.order` (lower priority, or same priority and later in file
 *   order) is still evaluated normally. Aborting the whole pass here would be the wrong trade: it
 *   was measured against the operator's real config that a graph-dependent pattern's `root.find`
 *   alone (no exclude, no edge test) matches the OVERWHELMING majority of ordinary fresh captures —
 *   `stamp-created-at-on-task` (an unrelated, fully-decidable rule) would stop firing on nearly
 *   every plain task capture if one undecidable rule silenced the rest. The caller still surfaces
 *   `undecidable` — see `rulesReadingFor` — but only when NOTHING else in the pass fired, which is
 *   exactly the case where "no rule applies" would otherwise be a confident answer this function
 *   cannot actually stand behind.
 */
/**
 * Apply one rule's ALREADY-MATCHED `actions`, in order, to `working` — exactly the inline loop
 * `applyRules` used to carry directly, factored out so `graphmatch.ts`'s own one-pass walk over an
 * EXTERNAL candidate (a structural parent, never the commit's own line — see that module's header)
 * can apply a fired rule's effects identically, rather than a second copy of this arithmetic that
 * could drift from this one. PURE, same contract as `applyRules` itself.
 *
 * `applyRules` below is now a thin caller of this — behaviourally BYTE-IDENTICAL to what it did
 * before this split; nothing about a rule's fields-in/fields-out result changed, only where the
 * fifteen lines that do it live.
 */
export function applyRuleActions(
  ruleId: string,
  actions: readonly RuleActionSpec[],
  working: Record<string, FieldValue>,
  today: { readonly logicalDate: string; readonly weekEnd: string } | undefined,
): { readonly working: Record<string, FieldValue>; readonly effects: readonly RuleEffect[] } {
  let next = working;
  const effects: RuleEffect[] = [];
  for (const action of actions) {
    if (action.verb === "retype") {
      next = { ...next, node_type: action.to };
      effects.push({ verb: "retype", ruleId, to: action.to });
      continue;
    }
    if (action.verb === "set") {
      const resolved = resolveRuleValue(action.to, today);
      if (resolved.kind === "unresolvable") continue; // see applyRules's own header
      next = { ...next, [action.field]: resolved.value };
      effects.push({ verb: "set", ruleId, field: action.field, to: resolved.value });
      continue;
    }
    // unset
    next = { ...next, [action.field]: null };
    effects.push({ verb: "unset", ruleId, field: action.field });
  }
  return { working: next, effects };
}

export function applyRules(
  fields: ResolvedFields,
  language: RulesLanguage,
  today: { readonly logicalDate: string; readonly weekEnd: string } | undefined,
): RulePassResult {
  let working: Record<string, FieldValue> = { ...fields };
  const applied: RuleEffect[] = [];
  const partial: string[] = [];
  const undecidable: string[] = [];

  for (const ruleId of language.order) {
    const rule = language.rules[ruleId];
    if (rule === undefined) continue; // defence in depth — order and rules must agree; a caller-built language might not
    const qualifier = language.patterns[rule.pattern];
    if (qualifier === undefined) continue; // same defence — compile-rules.mjs guarantees this never happens for a real declaration
    if (qualifierNeedsGraph(qualifier)) {
      undecidable.push(ruleId);
      continue;
    }
    if (!matchesQualifier(working, qualifier)) continue;
    if (!evaluateWhen(rule.when, working)) continue;

    if (rule.partial === true) partial.push(ruleId);
    const { working: nextWorking, effects } = applyRuleActions(ruleId, rule.actions, working, today);
    working = nextWorking;
    applied.push(...effects);
  }

  return { fields: working, applied, partial, undecidable };
}

type ResolvedRuleValue = { readonly kind: "value"; readonly value: FieldValue } | { readonly kind: "unresolvable" };

/** `$cycle_today`/`$cycle_week_end` -> `today`'s own fields; any other `$`-prefixed string is
 * unresolvable (this closed grammar names no other cycle variable); every other scalar is used
 * as written. */
function resolveRuleValue(
  raw: FieldValue,
  today: { readonly logicalDate: string; readonly weekEnd: string } | undefined,
): ResolvedRuleValue {
  if (typeof raw !== "string" || !raw.startsWith("$")) return { kind: "value", value: raw };
  if (today === undefined) return { kind: "unresolvable" };
  if (raw === "$cycle_today") return { kind: "value", value: today.logicalDate };
  if (raw === "$cycle_week_end") return { kind: "value", value: today.weekEnd };
  return { kind: "unresolvable" };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// RENDERING — turning an applied `RuleEffect` into the characters the operator sees, or refusing.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Why nothing was written. Both are refusals over WRITING, never over the rule's own decision —
 * `applyRules` above already decided the VALUE; this is the separate question of whether this app
 * can SPELL it onto a line without inventing characters the operator did not choose.
 *
 *   UNRENDERABLE-EFFECT   no glyph this app can write exists for the field an effect touched —
 *   neither a `qualification.tokens` family (an enum, e.g. `domain`/`node_type`) nor a
 *   `language.fieldMarkers` trailing marker (a magnitude, e.g. `created_at`) names it. The VALUE
 *   was still decided (`applied` carries it); it is simply not shown.
 *
 *   CONFLICTING-TOKEN-PRESENT   the line already carries a token from the SAME family the effect
 *   would write into — a DIFFERENT tag for an enum field (the operator typed `#routine` and this
 *   pass wants `#task`), or an existing instance of a trailing marker's own glyph. Rewriting or
 *   removing characters the operator typed is exactly the risk `armOrderingSettle`'s own
 *   commit-boundary discipline exists to avoid elsewhere in this bundle; this module refuses
 *   rather than edit in place, the same "the caret must not be disturbed" boundary the operator
 *   himself drew for this feature.
 */
export type RuleRenderAbstention = "unrenderable-effect" | "conflicting-token-present";

export type RuleRenderOutcome =
  | { readonly kind: "unchanged" }
  | { readonly kind: "rendered"; readonly text: string }
  | { readonly kind: "abstains"; readonly because: RuleRenderAbstention; readonly effect: RuleEffect };

/** `{token: value}` -> `{value: token}`, first token (sorted) wins a tie — the same "one real
 * value, occasionally more than one glyph, pick deterministically" posture `resolveLineFields`
 * (membership.ts) already takes reading the OTHER direction. */
function invertTokenFamily(family: Readonly<Record<string, FieldValue>>): Map<FieldValue, string> {
  const out = new Map<FieldValue, string>();
  for (const token of Object.keys(family).sort()) {
    const value = family[token];
    if (value !== undefined && !out.has(value)) out.set(value, token);
  }
  return out;
}

/** Does `line` already carry a `#tag` naming ANY value in `family`? Reused by both the "already
 * correct, nothing to append" check and the "a DIFFERENT tag is already there, refuse" check. */
function tagFromFamily(line: string, family: Readonly<Record<string, FieldValue>>): string | undefined {
  for (const span of tagSpans(line)) {
    if (Object.prototype.hasOwnProperty.call(family, span.text)) return span.text;
  }
  return undefined;
}

function formatMarkerValue(value: FieldValue): string {
  return value === null ? "" : String(value);
}

/**
 * Render every effect `applyRules` produced onto `line`, or refuse — see `RuleRenderAbstention`.
 * ALL-OR-NOTHING: if ANY effect cannot be rendered, NONE of the others are written either, so a
 * caller never shows a line half-corrected — the same posture `readFindClause` (qualification.ts)
 * already takes for a partially-unreadable predicate ("a partial read is not a smaller answer, it
 * is a different and wrong one"). `effects` is walked in FIRE ORDER (`applyRules`'s own `applied`,
 * already priority-ordered), so the abstention reported is always the first one this pass would
 * have hit while actually appending characters.
 *
 * `nodeTypeTokens` is `qualification.tokens.node_type` (a "retype" effect's own family);
 * `fieldTokens` is the REST of `qualification.tokens` (`set`'s own enum families, e.g. `domain`);
 * `fieldMarkers` is `language.fieldMarkers` (`set`'s own trailing-marker families, e.g.
 * `created_at`). Three separate maps, not one merged table, because that is exactly the shape
 * `qualification.tokens`/`RulesLanguage.fieldMarkers` are already published in — this function
 * reads, it does not re-key.
 */
export function renderRuleEffects(
  line: string,
  effects: readonly RuleEffect[],
  nodeTypeTokens: Readonly<Record<string, FieldValue>>,
  fieldTokens: Readonly<Record<string, Readonly<Record<string, FieldValue>>>>,
  fieldMarkers: Readonly<Record<string, FieldMarker>>,
): RuleRenderOutcome {
  if (effects.length === 0) return { kind: "unchanged" };

  let appended = "";
  for (const effect of effects) {
    if (effect.verb === "retype") {
      const byValue = invertTokenFamily(nodeTypeTokens);
      const token = byValue.get(effect.to);
      if (token === undefined) return { kind: "abstains", because: "unrenderable-effect", effect };
      const existing = tagFromFamily(line, nodeTypeTokens);
      if (existing === token) continue; // already spelled — nothing to add
      if (existing !== undefined) return { kind: "abstains", because: "conflicting-token-present", effect };
      appended += ` ${token}`;
      continue;
    }
    if (effect.verb === "set") {
      const enumFamily = fieldTokens[effect.field];
      if (enumFamily !== undefined) {
        const byValue = invertTokenFamily(enumFamily);
        const token = byValue.get(effect.to);
        if (token === undefined) return { kind: "abstains", because: "unrenderable-effect", effect };
        const existing = tagFromFamily(line, enumFamily);
        if (existing === token) continue;
        if (existing !== undefined) return { kind: "abstains", because: "conflicting-token-present", effect };
        appended += ` ${token}`;
        continue;
      }
      const marker = fieldMarkers[effect.field];
      if (marker === undefined) return { kind: "abstains", because: "unrenderable-effect", effect };
      if (line.includes(marker.token)) {
        return { kind: "abstains", because: "conflicting-token-present", effect };
      }
      appended += ` ${marker.token} ${formatMarkerValue(effect.to)}`;
      continue;
    }
    // unset — a fresh capture with nothing to unset is the common case (see this module's own
    // header — an unset effect on a never-set field is a confirmation, not a change); if the
    // field's own token or marker glyph IS somehow already present, refuse rather than strip
    // characters the operator typed.
    const enumFamily = fieldTokens[effect.field];
    if (enumFamily !== undefined && tagFromFamily(line, enumFamily) !== undefined) {
      return { kind: "abstains", because: "conflicting-token-present", effect };
    }
    const marker = fieldMarkers[effect.field];
    if (marker !== undefined && line.includes(marker.token)) {
      return { kind: "abstains", because: "conflicting-token-present", effect };
    }
  }

  return appended === "" ? { kind: "unchanged" } : { kind: "rendered", text: line + appended };
}

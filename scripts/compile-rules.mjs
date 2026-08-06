/**
 * compile-rules — the PURE compile step for the RULES CATEGORY declaration: every rule under
 * `rules/` this closed grammar can model, published with its pattern, predicate, priority and
 * action, plus the fire order the real engine would give them — widened from `compile-capture-
 * rules.mjs`, which read exactly two named files and two named rule ids.
 *
 * ── WHY THIS FILE REPLACES `compile-capture-rules.mjs`, NOT JUST EXTENDS IT ──
 *
 * The two rules `compile-capture-rules.mjs` published (`routine-without-cadence-becomes-task`,
 * `stamp-created-at-on-task`) are the operator's own content — arbitrary, personal, and swappable.
 * A compiler that names them by id, and names their two files by path, knows nothing about what a
 * RULE *is*; it knows two facts about one operator's instance. Point it at a different `rules/`
 * directory and it finds nothing, because there is nothing in it that reads a directory at all.
 *
 * This file reads `rules/`, the directory — every `.yaml` file in it, sorted — the same way
 * `compile-qualification.mjs` reads `patterns/` and `compile-resolution.mjs` reads `rules/` for
 * its own, narrower purpose (retype rules that could seed a fresh line). The two rules a bare
 * capture reaches are no longer the whole of what this file knows; they are two rows in a bigger
 * table, found by grammar, not by name.
 *
 * ── THE HARD DESIGN QUESTION: A RULE THIS GRAMMAR CANNOT MODEL MUST NOT SINK THE CATEGORY ──
 *
 * The old file's answer to a rule shape it could not read was `GenerationError` — correct for a
 * closed set of exactly two hand-picked rules (either both are readable or the generator is
 * broken), and wrong for a directory of 46 files and roughly a hundred rules that use verbs this
 * grammar was never asked to model: `count`, `divide`, `weighted_sum`, `subtract`, `round`, `sum`,
 * `compute_date`, `create_subtree`, `create_edge`, `delete_edge`, `delete_node`, `max` — real
 * verbs, in real files, none of them expressible as "this rule sets one field on the node that
 * matched." A generator that threw on the first one would make the whole category uncompilable
 * over content that has nothing to do with the two rules it used to know.
 *
 * The other three category compilers already answer this question, and they answer it the SAME
 * way structural and resolution do (`compile-qualification.mjs`'s per-pattern `refused` map is the
 * one place the three disagree with each other — see below): compile what the grammar models,
 * and PUBLISH what it could not, WITH THE REASON, via `Ledger` (`scripts/ledger.mjs`). A drop is
 * not a failure; a silent drop is the failure this repository has already shipped once
 * (`design-the-rule-mirror.md` §9.3, `generate-qualification-declaration.mjs:396`, 73 tokens gone
 * with nothing said). So every per-rule modelling gap below — an unrecognised verb, a `when` shape
 * outside `null`/`eq`/`not`/absent, a `for_each` that joins more than one pattern, a non-integer
 * `priority`, an action that targets a node other than the one that matched — is caught locally
 * and turned into `ledger.drop("rule '<id>'", "<why>")`, never a thrown refusal of the whole file
 * or the whole category. `GenerationError` is kept for exactly one case, below, that is not a
 * grammar gap at all: two rules sharing one id, which the engine itself already refuses
 * (`qntm_md.lifecycle.rule_loader.compile`'s `seen_ids` check, read in this repo's boundary)  —
 * publishing one of the two silently would hide a config defect this grammar can plainly see,
 * not model around one it cannot.
 *
 * ── DROP VS. REFUSE — WHERE THE THREE EXISTING COMPILERS DISAGREE, AND WHERE THIS ONE LANDS ──
 *
 * `compile-structural.mjs` and `compile-resolution.mjs` both use exactly one mechanism for "read
 * but not published": `ledger.drop(what, why)`. `compile-qualification.mjs` uses TWO: `ledger.drop`
 * for structural drops (an unreadable file, a malformed section), and a SEPARATE `refused` map,
 * keyed by pattern name, for a pattern that read fine but would not normalise into the closed
 * predicate grammar. The second map exists there for a reason specific to qualification: a
 * section's `qualification:` key NAMES a pattern, and `qualification.sections` has to JOIN a
 * dropped section back to the reason its pattern was refused — `ledger.drop("section 'v.s'", ...)`
 * alone would leave `refused['<pattern-name>']` nowhere to live for that join. Nothing in this
 * file has an equivalent join: a rule does not get referenced by id from anywhere else in this
 * declaration. So this file follows the SIMPLER, MORE COMMON of the two postures — one `Ledger`,
 * no second map — matching structural and resolution, not qualification's special case. Stated
 * plainly because the task asked for it: the three do disagree with each other, and the
 * disagreement is explained by a join qualification needs and this file does not.
 *
 * ── WHAT THIS GRAMMAR MODELS ──
 *
 *   for_each     `{pattern: <name>}`, or a SINGLE-ELEMENT LIST of the same (extra keys such as
 *                `bind`/`iterates`/`params` are ignored in both forms alike — every published
 *                action targets `$current.node.id` regardless of what the binding is named). A
 *                list of TWO OR MORE bindings is a multi-source join, carries an iteration
 *                variable this grammar cannot express, and is dropped rather than guessed at.
 *                21 of the operator's rules use the arity-1 list; 21 use arity 2+.
 *   when         absent (always true — matches `compile-resolution.mjs`'s own `evaluateWhen`),
 *                `{"null": [$current.node.fields.<f>]}`, `{eq: [$current.node.fields.<f>, <v>]}`,
 *                or `{not: [<one of the above>]}`. `and`/`or`/`in`/`exists` — all real, in real
 *                rules — are outside this grammar and dropped with the operator naming which
 *                operator it was.
 *   priority     absent -> 0 (`compiler/core.py:114`'s own default), or an integer.
 *   actions      an ORDERED LIST of zero-or-more `set_node_type`/`set_field`/`unset_field` actions,
 *                each targeting `$current.node.id`, IN THE ORDER THE CONFIG DECLARES THEM (order is
 *                part of a rule's meaning — see `modelledActions`'s own header), plus any number of
 *                `emit_event` actions (recognised and excluded — see `compile-capture-rules.mjs`'s
 *                original reasoning, unchanged: nothing published here reads the event log). A verb
 *                outside that set, zero modelled actions, or a modelled action targeting a different
 *                node — dropped. WIDENED (this leg) from "exactly one modelled action" to "one or
 *                more": `task-with-open-part-of-child-becomes-outcome` and its WAITING_FOR sibling
 *                each declare THREE actions (`set_node_type`, `set_field`, `emit_event`) and were
 *                dropped by the old one-action grammar regardless of whether their `for_each`
 *                pattern resolved. A rule whose action list ALSO carries an `emit_event` publishes
 *                `partial: true` — its `actions` are a real but INCOMPLETE account of what the rule
 *                does, and `app/present/rules.ts`'s `applyRules` must show that rather than apply the
 *                modelled subset as if it were the whole effect (see that module's own header).
 *
 * `unset_field` is a genuine widening beyond the original two rules' grammar (which only ever saw
 * `set_node_type` and `set_field`): it appears in 14 of the operator's real rules, it is exactly as
 * simple to state as `set_field` ("this rule clears field F on the node that matched"), and leaving
 * it unmodelled would have meant dropping every one of those 14 for a reason that is really just
 * "this generator was never taught a common verb," not a genuine grammar gap. `count`, `divide`,
 * `weighted_sum`, `subtract`, `round`, `sum`, `compute_date`, `create_subtree`, `create_edge`,
 * `delete_edge`, `delete_node`, `max` are NOT modelled — each names a computation or a graph
 * mutation this declaration has no reader for today, and adding them speculatively would publish
 * facts nothing consumes (the same "a smaller table that is exact and consumed beats a complete one
 * nobody reads" rule `generate-resolution-declaration.mjs`'s header already states).
 *
 * ── THE ORDER — THE SAME THREE-STAGE CHAIN `compile-capture-rules.mjs` ESTABLISHED, WIDENED FROM
 *    TWO ROWS TO EVERY ROW THIS GRAMMAR PUBLISHES ──
 *
 * STAGE 0 — RULED OUT. `apps/qntm-md/src/qntm_md/lifecycle/rule_loader.py:48`'s
 * `CompiledRuleSet.rules_for` sorts by `rule_id` — but `rules_for(` has no caller anywhere in
 * `src/` (grepped, not taken on trust: re-confirmed for this file, same zero result), and
 * `qntm_md.lifecycle` is referenced only by its own `__init__.py`. A parallel, unused compilation
 * path. DEAD. Do not mistake it for the authority, no matter how many rules this file now reads.
 *
 * STAGE 1 — THE COMPILED-LIST ORDER: `apps/qntm-md/src/qntm_md/bundle/loader.py`'s
 * `_iter_registered_yaml_files` walks the config tree via `sorted(root.path.rglob("*"))` — full
 * alphabetical path order — and stamps each file's walk position onto every rule it declares as
 * `order` (`_rule_candidates`, one `order` per FILE, shared by every rule inside it; a Python
 * stable sort then keeps same-file rules in their declared sequence). `_choose_winning_candidates`
 * and `validate_rules` both preserve that order rather than impose their own.
 *
 * STAGE 2 — THE EXECUTOR'S SORT, verified by the coordinator over `core/rule-engine` (outside this
 * repo's own read boundary, cited not re-derived): `executor/core.py:74` —
 * `sorted(enabled_rules, key=lambda r: r.priority, reverse=True)`, STABLE, priority descending;
 * `compiler/core.py:114` — `priority = rule_dict.get("priority", 0)`.
 *
 * THE CLOSED CHAIN, for any two rules THIS GENERATOR PUBLISHES: bundle order (file name, STAGE 1)
 * -> executor stable sort by priority descending (STAGE 2) -> a priority tie holds STAGE 1's
 * order. This composition rule is exactly what makes publishing a GLOBAL order over an arbitrarily
 * large published set still correct: a stable sort's answer for any PAIR of elements depends only
 * on their own keys, never on what else is in the list, so widening from two rules to every rule
 * this grammar could model changes nothing about how any two of them are ordered relative to each
 * other. `order.sequence` below is computed only over PUBLISHED rules — a dropped rule's true
 * priority is not itself in question, but its position relative to what a browser could ever be
 * shown is not a fact this declaration can state, so it does not appear in `order` at all.
 *
 * `ORDER_UNESTABLISHED_REASON` is kept, unused, exactly as `compile-capture-rules.mjs` kept it —
 * ready for `compile()` to revert `order` to `{established: false, reason: ...}` if STAGE 2's
 * citation is ever found not to hold, without re-deriving the refusal from nothing.
 *
 * ── THE PURE/SHELL SPLIT — the same shape every `compile-*.mjs` file already uses ──
 */

import { Ledger } from "./ledger.mjs";
import { versionKey } from "./declaration-version.mjs";
import { parseYamlSubset } from "./yaml-subset.mjs";
import {
  normalisePattern,
  deriveResolvableFields,
  deriveExtractionHintFields,
  PATTERNS_PREFIX,
} from "./compile-qualification.mjs";

export class GenerationError extends Error {}
class Refusal extends Error {}
const refuse = (reason) => {
  throw new Refusal(reason);
};

/** The one prefix `compile`'s file map recognises for rule files. Named once so the pure function
 * and the fs shell in `generate-rules-declaration.mjs` agree on the exact same string without
 * restating it. */
export const RULES_PREFIX = "rules/";

/**
 * Re-exported, not restated: this file also reads `patterns/*.yaml`, and `compile-qualification.mjs`
 * already names that prefix — see "THE PATTERN GAP" below for why.
 */
export { PATTERNS_PREFIX };

/** Where the trailing-marker spelling for a `setsField` action's target field lives. Read only for
 * the SMALL, bounded set of fields this compile actually needs a glyph for — see "THE MARKER GAP". */
export const MARKERS_KEY = "vocabulary/markers.yaml";

// The three trailing-marker shapes this generator can spell a VALUE with — the exact subset
// `compile-resolution.mjs`'s own `EXTRACTION_KINDS` already established for `orderingFields`,
// restated here rather than imported: that map is a closure-local constant inside
// `compile-resolution.mjs`'s own `compile()`, not an export, and the two tables read the SAME three
// `extraction_hint` strings from the SAME `vocabulary/markers.yaml` grammar for the SAME reason —
// this is the identical closed grammar, applied to a different candidate field set (rule-authored
// `setsField` targets instead of `ordering:`-declared fields), not a second interpretation of it.
const EXTRACTION_KINDS = { trailing_date: "date", trailing_int: "int", trailing_float: "float" };

const SELF_NODE = "$current.node.id";
const FIELD_REF = /^\$current\.node\.fields\.([A-Za-z0-9_]+)$/;

// The three verbs this closed grammar states a published fact about. `emit_event` is recognised
// and excluded on purpose (see this file's header); any OTHER verb is unmodelled and drops the
// rule that carries it.
const MODEL_VERBS = new Set(["set_node_type", "set_field", "unset_field"]);
const IGNORED_VERBS = new Set(["emit_event"]);

// KEPT, UNUSED TODAY, ON PURPOSE — see this file's header, "THE ORDER".
export const ORDER_UNESTABLISHED_REASON =
  "the compiled rule list a published rule feeds into is built, in alphabetical config-tree file " +
  "order, by apps/qntm-md/src/qntm_md/bundle/loader.py (traced: _iter_registered_yaml_files -> " +
  "_choose_winning_candidates -> validate_rules), and apps/qntm-md/src/qntm_md/lifecycle/" +
  "rule_loader.py's rule_id sort is confirmed dead code (no callers in src/). But whether " +
  "qntm_rule_engine.execute() and compile_rules() -- defined in core/rule-engine/src/" +
  "qntm_rule_engine, outside this generator's permitted read boundary -- fire rules in that list " +
  "order or re-derive their own from the compiled priority field is not established.";

/** `$current.node.fields.<name>` -> `<name>`. Refuses (drops the rule) on any other shape. */
function fieldNameOf(ref) {
  const match = typeof ref === "string" ? ref.match(FIELD_REF) : null;
  if (!match) {
    refuse(
      `${JSON.stringify(ref)} is not a '$current.node.fields.<name>' reference — this closed ` +
        "grammar only models predicates over the candidate node's own fields",
    );
  }
  return match[1];
}

/**
 * A rule's `when` clause, normalised into `{op: "true"}` (absent), `{op: "null", field}`,
 * `{op: "eq", field, value}` or `{op: "not", of: <normalised>}` — or refused. `and`, `or`, `in`
 * and `exists` are all real shapes in the operator's config; none of the four is modelled, and a
 * rule using one is dropped, named by the operator it used.
 */
function normaliseWhen(when) {
  if (when === undefined || when === null) return { op: "true" };
  const keys = when && typeof when === "object" && !Array.isArray(when) ? Object.keys(when) : null;
  if (!keys || keys.length !== 1) {
    refuse(
      `'when' is ${JSON.stringify(when)} — not one of the shapes this closed grammar models ` +
        "(absent, {null: [...]}, {eq: [...]}, {not: [...]})",
    );
  }
  const [op] = keys;
  if (op === "null") {
    const args = when["null"];
    if (!Array.isArray(args) || args.length !== 1) {
      refuse("'null' predicate does not take exactly one argument");
    }
    return { op: "null", field: fieldNameOf(args[0]) };
  }
  if (op === "eq") {
    const args = when.eq;
    if (!Array.isArray(args) || args.length !== 2) {
      refuse("'eq' predicate does not take exactly two arguments");
    }
    return { op: "eq", field: fieldNameOf(args[0]), value: args[1] };
  }
  if (op === "not") {
    const args = when.not;
    if (!Array.isArray(args) || args.length !== 1) {
      refuse("'not' predicate does not wrap exactly one clause");
    }
    return { op: "not", of: normaliseWhen(args[0]) };
  }
  refuse(`'when' uses operator '${op}', which this closed grammar does not model (only null/eq/not)`);
}

/**
 * A rule's `priority`, matching `core/rule-engine/src/qntm_rule_engine/compiler/core.py:114`'s
 * own default: `rule_dict.get("priority", 0)`. Absent -> 0. Present but not an integer is refused
 * (drops the rule) rather than guessed at.
 */
function priorityOf(entry) {
  if (!("priority" in entry) || entry.priority === undefined) return 0;
  if (typeof entry.priority !== "number" || !Number.isInteger(entry.priority)) {
    refuse(`'priority' is ${JSON.stringify(entry.priority)}, not an integer`);
  }
  return entry.priority;
}

/**
 * `for_each: {pattern: <name>}` -> `<name>`.
 *
 * ── A LIST OF ONE IS NOT A JOIN ──
 *
 * This guard used to be `Array.isArray(forEach)` — list-NESS, never list LENGTH. The length was
 * read only to interpolate a digit into the message, so a list of one and a list of three took the
 * same path and got the same words: "a list of 1 pattern binding(s) (a multi-source join)". A join
 * of one source is not a join, and 21 of the operator's rules were told it was.
 *
 * The two forms are equivalent HERE because this grammar reads exactly one key off a `for_each`,
 * `pattern`, and ignores `bind`, `iterates` and `params` in both forms alike. `stamp-outcome-done-
 * task-count` is already a published SCALAR carrying `bind: current` and `iterates: true`, so
 * "the extra keys are ignored" is the existing posture, not a new one.
 *
 * The engine says the same in its own words. `apps/qntm-md/src/qntm_md/bundle/validators/
 * rules.py`, on the multi-bind iterator rule: "Single-bind shapes (`for_each` is a dict, or a
 * single-entry list) are exempt — iteration is unambiguous." Two or more bindings need exactly one
 * `iterates: true` to say which source the rule walks; one binding needs nothing, because there is
 * nothing to choose between.
 *
 * ── WHAT THIS UNLOCKS: NOTHING. THAT IS THE POINT ──
 *
 * Measured against the operator's config, this widening publishes ZERO further rules. All 21 go on
 * to drop, and every one of them drops for a reason that was TRUE all along and hidden behind a
 * reason that was not: 7 use `create_subtree`, 8 use `sum`/`weighted_sum`, 4 use a `when` operator
 * outside null/eq/not, 1 has a predicate that is not over the candidate's own fields. The value is
 * not capability. It is that the ledger now names the gap the operator would have to close, rather
 * than sending him to rewrite a `for_each` that was never the obstacle.
 *
 * A list of TWO OR MORE is still refused, unchanged: that IS a multi-source join, it carries an
 * iteration variable this grammar has no way to express, and it is not guessed at.
 */
function patternOf(forEach) {
  // A single-element list unwraps to the scalar it is equivalent to, BEFORE the join guard.
  if (Array.isArray(forEach) && forEach.length === 1) forEach = forEach[0];
  if (Array.isArray(forEach)) {
    refuse(
      `'for_each' joins ${forEach.length} pattern bindings (a multi-source join), which this ` +
        "closed grammar does not model",
    );
  }
  if (!forEach || typeof forEach !== "object" || typeof forEach.pattern !== "string" || forEach.pattern === "") {
    refuse("'for_each' does not declare a string 'pattern'");
  }
  return forEach.pattern;
}

/**
 * One modelled action, `{verb: "retype", to}` / `{verb: "set", field, to}` / `{verb: "unset",
 * field}` — the SAME verb-tagged shape `app/present/rules.ts`'s own `RuleEffect` already uses for
 * a FIRED action, reused here for a PUBLISHED one rather than inventing a second vocabulary for
 * the same three verbs.
 */
function normaliseModelledAction(action) {
  if (action.node_id !== SELF_NODE) {
    refuse(`'${action.verb}' targets ${JSON.stringify(action.node_id)}, not the current node ('${SELF_NODE}')`);
  }
  if (action.verb === "set_node_type") {
    if (typeof action.node_type !== "string") refuse("'set_node_type' has no string 'node_type'");
    return { verb: "retype", to: action.node_type };
  }
  if (action.verb === "set_field") {
    if (typeof action.field !== "string") refuse("'set_field' has no string 'field'");
    return { verb: "set", field: action.field, to: action.value ?? null };
  }
  // unset_field
  if (typeof action.field !== "string") refuse("'unset_field' has no string 'field'");
  return { verb: "unset", field: action.field };
}

/**
 * The rule's modelled actions, IN THE ORDER THE CONFIG DECLARES THEM — `set_node_type`/
 * `set_field`/`unset_field`, plus confirmation that every OTHER action on the rule is one of
 * those or an ignored `emit_event`. Order is preserved because it is part of the rule's own
 * meaning (`task-with-open-part-of-child-becomes-outcome` retypes to `outcome` BEFORE it sets
 * `auto_outcome: true` — a later rule matching on `node_type: outcome` in the SAME pass, if one
 * existed, would see the retype only because it ran first): a caller applying these one at a time,
 * in array order, reproduces that.
 *
 * Refuses (drops the rule) on: an unrecognised verb, zero modelled actions, or a modelled action
 * targeting anything but the current node. Does NOT refuse on more than one modelled action, and
 * does NOT refuse on an `emit_event` sitting alongside modelled ones — see `partial`, below.
 *
 * @returns {{actions: object[], partial: boolean}} `partial` is `true` when the rule ALSO
 *   declares at least one `emit_event` — this closed grammar recognises and excludes it (`app/
 *   present/rules.ts` has no event bus to fire it into), so `actions` is a PROPER SUBSET of the
 *   rule's real effect, and a caller must show that rather than present `actions` as complete.
 */
function modelledActions(actions) {
  if (!Array.isArray(actions)) refuse("'actions' is not a list");

  const unmodelled = [
    ...new Set(
      actions
        .filter((a) => !(a && typeof a === "object" && (MODEL_VERBS.has(a.verb) || IGNORED_VERBS.has(a.verb))))
        .map((a) => (a && typeof a === "object" ? JSON.stringify(a.verb) : JSON.stringify(a))),
    ),
  ];
  if (unmodelled.length > 0) {
    refuse(`an action verb this closed grammar does not model: ${unmodelled.join(", ")}`);
  }

  const modelled = actions.filter((a) => MODEL_VERBS.has(a.verb));
  if (modelled.length === 0) {
    refuse(
      "no modelled action — every action is 'emit_event' (or there are none), and this grammar " +
        "publishes a fact about set_node_type/set_field/unset_field only",
    );
  }
  const partial = actions.some((a) => a && typeof a === "object" && IGNORED_VERBS.has(a.verb));
  return { actions: modelled.map(normaliseModelledAction), partial };
}

const basenameOf = (key) => key.split("/").pop();

/**
 * The published rules' firing order — STAGE 1 (file order) and STAGE 2 (priority) joined, in JS,
 * over the same inputs the real chain uses. See this file's header ("THE ORDER").
 *
 * @param {{ruleId: string, fileKey: string, priority: number}[]} entries a copy; this sorts it.
 * @returns {string[]}
 */
function computeOrderSequence(entries) {
  const byFileOrder = entries
    .slice()
    .sort((a, b) => basenameOf(a.fileKey).localeCompare(basenameOf(b.fileKey)));
  return byFileOrder.sort((a, b) => b.priority - a.priority).map((e) => e.ruleId);
}

/**
 * `patterns/*.yaml` -> `{name -> raw config}`, sorted by file the same way `compile-qualification
 * .mjs` reads the same directory. A DUPLICATE name across two files is not this generator's
 * concern to adjudicate (`compile-qualification.mjs` already refuses that outright for its own
 * purpose); the FIRST file read wins here, because this generator only ever asks "what does this
 * NAME mean", never "is this directory internally consistent" — that question belongs to the
 * generator that owns the whole `patterns/` tree.
 */
function readRawPatterns(allKeys, get, ledger) {
  const patternKeys = allKeys()
    .filter((k) => k.startsWith(PATTERNS_PREFIX) && k.endsWith(".yaml"))
    .sort();
  const rawPatterns = new Map();
  for (const key of patternKeys) {
    const file = key.slice(PATTERNS_PREFIX.length);
    let parsed;
    try {
      parsed = parseYamlSubset(get(key), key);
    } catch (error) {
      ledger.drop(
        `patterns/${file}`,
        `it did not parse (${error.message}), so no pattern it declares could resolve a rule's for_each`,
      );
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      ledger.drop(
        `patterns/${file}`,
        "the file did not parse into a mapping of pattern name -> definition, so no pattern it " +
          "declares could resolve a rule's for_each",
      );
      continue;
    }
    for (const [name, config] of Object.entries(parsed)) {
      if (!rawPatterns.has(name)) rawPatterns.set(name, config);
    }
  }
  return rawPatterns;
}

/**
 * `vocabulary/markers.yaml` -> `{field -> {token, kind}}`, restricted to `fields` — the SMALL,
 * BOUNDED set of trailing-marker-shaped fields a `setsField` action, among the rules PASS 2 kept,
 * actually targets. See "THE MARKER GAP" at this file's top import block for why this exists and
 * why it is scoped this narrowly rather than reading the whole vocabulary: a field this closed
 * grammar cannot spell a glyph for is a field this app cannot WRITE, however confidently the rule
 * itself was modelled, and this reader is what lets that be a named, per-field fact rather than a
 * silent "nothing happened" the moment a caller tries to render an applied `set_field`.
 *
 * Deliberately NARROWER than `compile-resolution.mjs`'s own `readOrderingFieldMarkers`: no `enum`
 * branch, because the two fields this repo's real config needs it for today (`created_at`,
 * `interval_days`) are both trailing-shaped, and a field this app already spells through the
 * ENUM token families (`node_type`, `domain`, `status` — `qualification.tokens`) never needs a
 * second spelling published here at all; the browser tries that family first (see `rules.ts`).
 */
function readFieldMarkers(fields, has, get, ledger) {
  if (fields.size === 0) return {};
  if (!has(MARKERS_KEY)) return {};
  let parsed;
  try {
    parsed = parseYamlSubset(get(MARKERS_KEY), MARKERS_KEY);
  } catch (error) {
    ledger.drop(MARKERS_KEY, `it did not parse (${error.message}), so no rule-set field can be spelled`);
    return {};
  }
  const markers = parsed?.markers;
  if (!Array.isArray(markers)) {
    ledger.drop(MARKERS_KEY, "no 'markers:' list, so no rule-set field can be spelled");
    return {};
  }
  const out = {};
  for (const entry of markers) {
    // NOT A DROP: a non-mapping marker declares no field — nothing named here was discarded; if it
    // was the only marker for a field this reader needs, the field-level sweep below records that.
    if (!entry || typeof entry !== "object") continue;
    const { token, field, extraction_hint: hint, value, render_only: renderOnly } = entry;
    // NOT A DROP: this table is restricted to fields a PUBLISHED rule's `setsField` actually
    // targets — a marker outside that set was never a candidate, the same posture
    // `readOrderingFieldMarkers` (compile-resolution.mjs) already takes for its own field set.
    if (typeof field !== "string" || !fields.has(field)) continue;
    const what = `rule-set field '${field}'`;
    if (value !== undefined) {
      // NOT A DROP: a fixed-value (enum) marker row for a field this reader was asked about — not
      // modelled here (see this function's own header); the field stays unspelled and is named as
      // such by the field-level sweep below, once, after every marker row has had its chance.
      continue;
    }
    if (renderOnly === true) {
      ledger.drop(what, `its marker '${token}' is 'render_only: true' — the engine never ingests a value from that glyph`);
      continue;
    }
    const kind = EXTRACTION_KINDS[hint];
    // NOT A DROP: an extraction_hint this reader does not model (or none at all) — the field
    // simply gathers no candidate token from THIS row; the field-level sweep below is what
    // ultimately records the field as unspelled if no row ever supplies one.
    if (kind === undefined) continue;
    // NOT A DROP: a marker row with no usable token string — the same "gathers nothing from this
    // row" posture as the extraction_hint check just above.
    if (typeof token !== "string" || token === "") continue;
    if (out[field] === undefined) out[field] = { token, kind };
  }
  for (const field of fields) {
    if (out[field] === undefined && ledger.toJSON()[`rule-set field '${field}'`] === undefined) {
      ledger.drop(
        `rule-set field '${field}'`,
        "a published rule's 'set_field' targets it, but vocabulary/markers.yaml declares no " +
          "trailing marker for it, so this app cannot write a value into a line for it",
      );
    }
  }
  return out;
}

/**
 * Compile the rules-category declaration from an in-memory map of path -> contents. PURE: no
 * filesystem, no command line, no clock, no randomness.
 *
 * @param {Record<string, string> | Map<string, string>} files recognised keys: every
 *   `"rules/<name>.yaml"`, every `"patterns/<name>.yaml"` and `"vocabulary/markers.yaml"`. Paths
 *   use `/` regardless of platform — this is a logical tree, not a filesystem one.
 * @param {Ledger} ledger
 * @returns {{declaration: {order: object, rules: object, patterns: object, fieldMarkers: object},
 *   dropped: object, version: string}}
 */
export function compile(files, ledger = new Ledger()) {
  const isMap = files instanceof Map;
  const has = (key) => (isMap ? files.has(key) : Object.prototype.hasOwnProperty.call(files, key));
  const get = (key) => (isMap ? files.get(key) : files[key]);
  const allKeys = () => (isMap ? [...files.keys()] : Object.keys(files));

  // Same files map `compile-qualification.mjs`'s own `compile()` derives this from (§0 there) —
  // 2026-08-06, this reader's `normalisePattern` call now needs the same field set THAT compiler
  // threads through, rather than a frozen `RESOLVABLE_FIELDS` import. See that function's header.
  // UNIONED WITH THE FOURTH RUNG (`deriveExtractionHintFields`) for the identical reason
  // `compile-qualification.mjs`'s own `compile()` unions it into `admissibleFields` — a rule's
  // `for_each` pattern shares ONE grammar with a section's `qualification:` (`normalisePattern`
  // is imported, not reimplemented), so a pattern like `overall-aoi-completed`
  // (`completed_at: {gte: "$cycle_today - 30 d", lte: "$cycle_today"}`) resolves here exactly the
  // same way it now resolves there.
  const resolvableFields = [
    ...new Set([...deriveResolvableFields(files), ...Object.keys(deriveExtractionHintFields(files))]),
  ].sort();

  const ruleKeys = allKeys()
    .filter((k) => k.startsWith(RULES_PREFIX) && k.endsWith(".yaml"))
    .sort();

  const rules = {};
  const orderEntries = [];
  const seenIds = new Map(); // ruleId -> the file that first declared it

  for (const key of ruleKeys) {
    const file = key.slice(RULES_PREFIX.length);
    let parsed;
    try {
      parsed = parseYamlSubset(get(key), key);
    } catch (error) {
      // DROP PATH — a whole file, and every rule it declares.
      ledger.drop(
        `rules/${file}`,
        `it did not parse (${error.message}), so no rule it declares was evaluated`,
      );
      continue;
    }
    if (!Array.isArray(parsed)) {
      // DROP PATH — the file parsed, but not into the top-level list of rules this shape expects.
      ledger.drop(
        `rules/${file}`,
        "the file did not parse into a top-level list of rules, so no rule it declares was evaluated",
      );
      continue;
    }

    parsed.forEach((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        // DROP PATH — an entry that is not itself a rule mapping.
        ledger.drop(`rules/${file}#${index}`, "the entry is not a mapping, so it could not be read as a rule");
        return;
      }
      const id = entry.id;
      if (typeof id !== "string" || id === "") {
        // DROP PATH — no id to publish it under.
        ledger.drop(`rules/${file}#${index}`, "no readable 'id:', so it could not be published under any key");
        return;
      }
      const what = `rule '${id}'`;

      // NOT A DROP GAP: two rules sharing one id is a config defect the ENGINE ITSELF already
      // refuses (qntm_md.lifecycle.rule_loader.compile's own seen_ids check) — not a shape this
      // grammar failed to model. Publishing one silently would hide that defect, not report it.
      if (seenIds.has(id)) {
        throw new GenerationError(
          `rule id '${id}' is declared in two files (${seenIds.get(id)} and ${file}) — the engine ` +
            "itself refuses a duplicate rule id; publishing one of the two here would hide a real " +
            "config defect rather than surface it.",
        );
      }
      seenIds.set(id, file);

      try {
        const pattern = patternOf(entry.for_each);
        const when = normaliseWhen(entry.when);
        const priority = priorityOf(entry);
        const { actions, partial } = modelledActions(entry.actions);
        // `partial` OMITTED, NOT `false`, for the common case — the same "absent means the common
        // answer" posture `compile-qualification.mjs`'s new `edgeSteps` takes, so a rule with no
        // excluded action keeps the exact shape it always published.
        rules[id] = { pattern, when, priority, actions, ...(partial ? { partial: true } : {}) };
        orderEntries.push({ ruleId: id, fileKey: key, priority });
      } catch (error) {
        if (!(error instanceof Refusal)) throw error;
        ledger.drop(what, error.message);
      }
    });
  }

  // ── PASS 2 — RESOLVE `for_each.pattern`, THE ONE FACT PASS 1 NEVER READ ────────────────────────
  //
  // A published rule names a PATTERN, never says what it means: `compile-rules.mjs`'s own header
  // states this plainly ("every published action targets $current.node.id regardless of what the
  // binding is named") — the CANDIDATE a rule fires over is left for a reader to resolve. Applying
  // a rule needs that resolved — "does THIS line's own fields match pattern X" — and X's meaning is
  // `patterns/<name>.yaml`'s own `root.find`/`steps`, the identical closed grammar
  // `compile-qualification.mjs`'s `normalisePattern` already models, tests and ships for section
  // membership. Reusing it here (rather than writing a second reduction of the same YAML shape) is
  // "generate once" applied to a SECOND consumer of one already-published grammar, not a new one —
  // the same move `compile-resolution.mjs`'s own `readRetypeRules` already made for its narrower
  // purpose (predicting a SEED's type tag). A pattern this closed grammar cannot model AT ALL — a
  // MULTI-HOP traversal (`ancestors:`/`descendants:`), a field outside what THIS config's own
  // vocabulary+schema make resolvable (`deriveResolvableFields`, above) — is not
  // guessed at: every rule that names it is DROPPED, because a rule this app cannot tell the
  // candidate for is a rule this app cannot apply, however cleanly its own `when`/action read. A
  // pattern that resolves but carries `edgeSteps` (a ONE-HOP `children:`/`parents:` existence test,
  // widened alongside this file — `compile-qualification.mjs`'s own header) is NOT dropped here: it
  // is a real, decidable predicate, just not one this reader's own consumer (`app/present/rules.ts`,
  // a FRESH-CAPTURE-ONLY evaluator) can apply without a graph. That is `applyRules`'s abstention to
  // make at read time (`qualifierNeedsGraph`), never this compiler's to guess at or drop for.
  //
  // STRUCTURAL-CHROME EXCLUSION (`applyStructuralExclusionDefaults`, `compile-qualification.mjs`)
  // is DELIBERATELY NOT APPLIED HERE. It is a no-op for every pattern any rule in the operator's
  // real config names — measured: `routines`/`tasks`/`albums-all`/… all declare `node_type`
  // explicitly, and that function only ever adds anything when `root.find` names none — and it is
  // a no-op BY CONSTRUCTION for the one thing this declaration's patterns are ever matched against:
  // a FRESH CAPTURE'S OWN RESOLVED FIELDS (`membership.ts`'s `resolveLineFields`), which can never
  // itself resolve to a structural/chrome node type (that function seeds `node_type` from a
  // section's own registered content type or a vocabulary token, never from schema chrome). Calling
  // it would cost a `schema.yaml` dependency this generator does not otherwise need, for a
  // correction that changes nothing this declaration is ever matched against.
  const rawPatterns = readRawPatterns(allKeys, get, ledger);
  const neededPatternNames = new Set(Object.values(rules).map((r) => r.pattern));
  const patterns = {};
  const patternRefused = new Map();
  for (const name of [...neededPatternNames].sort()) {
    const raw = rawPatterns.get(name);
    if (raw === undefined) {
      patternRefused.set(
        name,
        `no pattern named '${name}' is declared under patterns/, so no rule naming it can be applied`,
      );
      // NOT A DROP: this loop records WHY a pattern name could not be resolved, keyed by the
      // pattern, not by the rule — the actual `ledger.drop("rule '<id>'", ...)` (below, per rule)
      // is where the record lands, because a pattern name is not itself an operator artefact and
      // more than one rule can share one refused pattern; recording here too would double-report.
      continue;
    }
    try {
      patterns[name] = normalisePattern(raw, resolvableFields);
    } catch (error) {
      patternRefused.set(name, error.message);
    }
  }
  for (const id of Object.keys(rules)) {
    const pattern = rules[id].pattern;
    if (patternRefused.has(pattern)) {
      ledger.drop(
        `rule '${id}'`,
        `its for_each pattern '${pattern}' could not be resolved: ${patternRefused.get(pattern)}`,
      );
      delete rules[id];
    }
  }
  const survivingIds = new Set(Object.keys(rules));
  const orderSequence = computeOrderSequence(orderEntries.filter((e) => survivingIds.has(e.ruleId)));

  // ── PASS 3 — THE SPELLING FOR EVERY `setsField` TARGET, AMONG WHAT SURVIVED PASS 2 ─────────────
  //
  // Applying `stamp-created-at-on-task`'s own action decides a VALUE (`created_at` becomes today's
  // logical date); WRITING that value into a line the operator can see needs a GLYPH, and nothing
  // published before this file named one for any field a rule sets — `resolution.orderingFields`
  // carries exactly the four fields an `ordering:` declares, and `created_at` orders nothing. See
  // `readFieldMarkers`'s own header for the full account, including why this is the SAME closed
  // trailing-marker grammar `compile-resolution.mjs` already reads, over a different field set.
  const setFieldTargets = new Set(
    Object.values(rules)
      .flatMap((r) => r.actions)
      .filter((a) => a.verb === "set")
      .map((a) => a.field),
  );
  const fieldMarkers = readFieldMarkers(setFieldTargets, has, get, ledger);

  const declaration = {
    order: {
      established: true,
      sequence: orderSequence,
      derivedFrom:
        "priority, descending, stable — ties broken by the compiled-list order the bundle " +
        "loader's config-tree walk produces (file name) — computed over every rule this grammar " +
        "published AND whose for_each pattern this grammar could also resolve; a rule dropped by " +
        "either pass is not part of this ordering. See compile-rules.mjs's header, 'THE ORDER'.",
    },
    rules,
    /** pattern name -> `{find, exclude}` (`app/present/qualification.ts`'s own `Qualifier` shape) —
     * every `for_each.pattern` a PUBLISHED rule names, resolved. See PASS 2 above. */
    patterns,
    /** field name -> `{token, kind}` — the trailing-marker spelling for every field a PUBLISHED
     * rule's `set_field` action targets, where one exists. See PASS 3 above. A field absent here
     * that IS a `setsField` target has no marker this app can write with; `dropped` names why. */
    fieldMarkers,
  };
  const dropped = ledger.toJSON();
  return { declaration, dropped, version: versionKey({ declaration, dropped }) };
}

/**
 * compile-capture-rules — the PURE compile step for the capture-rules declaration: the closed
 * grammar of the two rules a bare capture reaches, and — where it can be defended — the order
 * between them. See "THE ORDER" below for why, today, it cannot: this publishes the two rules
 * with confidence and marks their firing order EXPLICITLY UNESTABLISHED rather than guess at it.
 *
 * ── WHAT THIS PUBLISHES, AND WHY ONLY THESE TWO ──
 *
 * `docs/implementation-artifacts/design-the-rule-mirror.md` §3.2 swept every one of the operator's
 * 186 sections and found a bare capture reaches exactly TWO of his 94 rules, never more:
 * `routine-without-cadence-becomes-task` (13 sections) and `stamp-created-at-on-task` (132
 * sections). §3.3 is the finding that makes publishing them non-optional: neither rule declares a
 * `priority:`, so both sit in the same band as 74 others, and which one actually fires first is
 * decided by code this file traces as far as it is permitted to (see "THE ORDER" below) rather
 * than by anything the config itself states. Without publishing at least the two rules, a browser
 * that only knows rung 1 (registration) stamps `routine` on a bare capture in 13 of his sections
 * and is contradicted, silently, the moment a cycle runs. §11 row 4 prices this exact deliverable
 * at `½` and calls it "the smallest possible rule mirror: 2 of 94 rules."
 *
 * `docs/implementation-artifacts/roadmap-the-road-ahead.md` step 3 states the boundary this file
 * does not cross: this is a published grammar of two rules with a generated fixture, NOT an
 * interpreter. Nothing in this file evaluates a `when` clause against a node — it only NAMES what
 * the two rules test and do, as data, the same way `compile-structural.mjs` names an edge type
 * without ever walking a graph.
 *
 * ── WHY A CLOSED GRAMMAR, NOT A GENERAL RULE READER ──
 *
 * Unlike the other three `compile-*.mjs` files, this one does not enumerate an unbounded set of
 * config files and publish whatever normalises (dropping the rest, with a reason). It reads
 * exactly two named files and looks up exactly two named rule ids inside them. There is nothing to
 * "drop" here in the ledger sense — either both rules are found and match the shape this grammar
 * knows how to describe, or `compile` REFUSES OUTRIGHT with a `GenerationError`. A closed set of
 * two either publishes whole or not at all; `dropped` is always `{}` by construction, not because
 * nothing was ever rejected but because rejection here is a hard refusal, not a silent omission.
 *
 * ── WHAT IS MODELLED, AND WHAT IS DELIBERATELY EXCLUDED ──
 *
 * Each rule's `for_each.pattern`, its `when` predicate (only the two shapes the operator's real
 * rules use — `{"null": [$current.node.fields.<f>]}` and `{eq: [$current.node.fields.<f>, null]}`
 * — anything else throws), and the one data-mutating action it takes (`set_node_type` for the
 * retype, `set_field` for the stamp). `emit_event` actions are recognised and EXCLUDED ON PURPOSE,
 * not silently: design-the-rule-mirror.md §5.3 measured that 0 of the 2 rules a capture reaches
 * read the event log, so publishing what they write to it would name a fact the browser has no use
 * for and no way to verify. Any OTHER action verb is unmodelled and throws — this grammar never
 * guesses at a shape it has not been shown.
 *
 * ── THE ORDER — INVESTIGATED, AND DELIBERATELY NOT PUBLISHED ──
 *
 * An earlier version of this file derived `order` by sorting the two rule files' own basenames and
 * cited that as a plausible proxy for "the alphabetical position... in config/rules/" design-the-
 * rule-mirror.md §3.3 names. Review caught that this was a coincidence stated as a fact: two
 * independent orderings (file name, rule_id) happened to agree for this one pair, and neither had
 * been traced to the code that actually decides firing order. What follows is that trace, done
 * read-only over `apps/qntm-md/src/qntm_md/**` — the one boundary this investigation was permitted
 * to widen into (never `core/rule-engine`, never the config directory beyond the two files this
 * generator already reads, never a write, never a `cd`).
 *
 * RULED OUT: `apps/qntm-md/src/qntm_md/lifecycle/rule_loader.py:48`'s `CompiledRuleSet.rules_for`
 * sorts by `rule_id` — but `rules_for(` has no caller anywhere in `src/` (confirmed independently
 * by grep, not taken on trust), and `qntm_md.lifecycle` itself is referenced only by its own
 * `__init__.py`. This is a parallel, unused compilation path — its own `CompiledRule` /
 * `CompiledRuleSet` dataclasses, distinct from `qntm_rule_engine.CompiledRule` — not the mechanism
 * the orchestrator's rules phase actually uses.
 *
 * TRACED, AND THIS IS THE REAL MECHANISM UP TO THE BOUNDARY: the list `qntm_rule_engine.execute()`
 * receives is built by `apps/qntm-md/src/qntm_md/bundle/loader.py`, in three steps that each
 * PRESERVE an order rather than impose one of their own:
 *
 *   1. `_iter_registered_yaml_files` (loader.py:1257-1290) walks each registered config root via
 *      `sorted(root.path.rglob("*"))` (loader.py:1269) — every YAML file in the tree, in full
 *      alphabetical path order — and stamps each file's position in that walk onto it as `order`
 *      (loader.py:396-405).
 *   2. `_choose_winning_candidates` (loader.py:898-912) resolves multi-root precedence, then
 *      returns `sorted(winners.values(), key=lambda candidate: candidate.order)` (loader.py:912).
 *      Two rules declared in ONE file share that file's single `order` value (`_rule_candidates`,
 *      loader.py:1001-1022, assigns `order=source.order` per rule via `_candidate`, loader.py:1112
 *      — not a fresh index per rule), so Python's STABLE sort keeps same-file rules in their
 *      declared sequence.
 *   3. `validate_rules` (bundle/validators/rules.py:37-144) iterates its input in the given order
 *      and appends to `merged` with no re-sort (rules.py:56-138), then calls
 *      `qntm_rule_engine.compile_rules(merged)` (rules.py:144) on that list, unchanged.
 *
 * That compiled list reaches the orchestrator as `loaded_bundle.tier1_rules`
 * (orchestrator.py:5769, `rules=loaded_bundle.tier1_rules`); passes through
 * `_compile_runtime_rule_bundle` UNCHANGED when there are no shell rules — true for these two —
 * (`return _RuntimeRuleBundle(list(operator_rules), rule_triggers)`, orchestrator.py:1859); and
 * reaches `_run_rules_phase` as `rules=runtime_rules` (orchestrator.py:4809-4834), which calls
 * `qntm_rule_engine.execute(rules, ...)` (orchestrator.py:2199-2206) with that list, unmodified.
 *
 * So the list handed to `execute()` genuinely does have the retype ahead of the stamp —
 * `cadence_auto_routine.yaml` sorts before `stamp_created_at.yaml` in `_iter_registered_yaml_
 * files`'s walk, mechanically, not by a naming coincidence this file merely noticed. And nothing
 * anywhere in `apps/qntm-md/src/qntm_md/**` reads a compiled rule's `priority` field for execution
 * purposes — grepped across the whole tree; every other hit on "priority" is the unrelated
 * node-field marker (`#p1`), never a rule attribute.
 *
 * WHAT REMAINS UNESTABLISHED, AND WHY THIS FILE STILL REFUSES TO PUBLISH AN ORDER: whether
 * `qntm_rule_engine.execute()` (and `compile_rules()`, which produces the `CompiledRule` objects
 * `execute` consumes) FIRES rules in the list order it receives, or re-derives its own — from the
 * compiled `priority` field design-the-rule-mirror.md's own census shows exists on every compiled
 * rule, or from something else entirely. That code is defined in `core/rule-engine/src/
 * qntm_rule_engine`, OUTSIDE the boundary this investigation was permitted to widen into
 * (`apps/qntm-md/src/qntm_md/**` only), and it was NOT read. The absence of any priority-consuming
 * code in `apps/qntm-md/src/qntm_md/**` is EVIDENCE the list survives unchanged into firing order —
 * it is not proof, and "probably right, derived by inference" is exactly the standard this
 * investigation was told is not good enough. So: an honest gap beats a confident coincidence. This
 * closed grammar does not publish `order` as a sequence. It publishes `order: {established: false,
 * reason: ORDER_UNESTABLISHED_REASON}` — one string, in one place, so a future reader who closes
 * the remaining gap (a read of `core/rule-engine`'s `execute`/`compile_rules`) has exactly one
 * constant to update, not a comment to rediscover.
 *
 * ── THE PURE/SHELL SPLIT — the same shape `compile-structural.mjs` and `compile-qualification.mjs`
 *    already use, for the same reason: this module must be safe to import in a context with no
 *    filesystem (a future Worker route, if step 4 of the roadmap ever reaches this declaration) ──
 */

import { versionKey } from "./declaration-version.mjs";
import { parseYamlSubset } from "./yaml-subset.mjs";

export class GenerationError extends Error {}

// The two file keys `compile`'s file map carries. Named once so the pure function and the fs shell
// in `generate-capture-rules-declaration.mjs` agree on the exact same strings without restating
// them — the same discipline `compile-structural.mjs`'s `STRUCTURAL_TOKENS_KEY` etc. already use.
export const CADENCE_RULES_KEY = "rules/cadence_auto_routine.yaml";
export const STAMP_RULES_KEY = "rules/stamp_created_at.yaml";

const SELF_NODE = "$current.node.id";
const FIELD_REF = /^\$current\.node\.fields\.([A-Za-z0-9_]+)$/;

// Which rule id lives in which file, and what this grammar expects that rule's one meaningful
// action to be. Order in this array carries NO meaning — see this file's header ("THE ORDER") for
// why publication order is not derived from it, or from anything else this file can defend.
const RULE_SOURCES = Object.freeze([
  Object.freeze({
    fileKey: CADENCE_RULES_KEY,
    ruleId: "routine-without-cadence-becomes-task",
    actionVerb: "set_node_type",
  }),
  Object.freeze({
    fileKey: STAMP_RULES_KEY,
    ruleId: "stamp-created-at-on-task",
    actionVerb: "set_field",
  }),
]);

// `emit_event` actions are recognised and excluded on purpose — see this file's header. Any verb
// outside this set and `actionVerb` above is a shape this closed grammar refuses rather than
// guesses at.
const IGNORED_VERBS = new Set(["emit_event"]);

// The one place the ordering investigation's conclusion is written down. See this file's header
// ("THE ORDER — INVESTIGATED, AND DELIBERATELY NOT PUBLISHED") for the full trace this summarises.
export const ORDER_UNESTABLISHED_REASON =
  "the compiled rule list these two rules feed into is built, in alphabetical config-tree file " +
  "order, by apps/qntm-md/src/qntm_md/bundle/loader.py (traced: _iter_registered_yaml_files -> " +
  "_choose_winning_candidates -> validate_rules), and apps/qntm-md/src/qntm_md/lifecycle/" +
  "rule_loader.py's rule_id sort is confirmed dead code (no callers in src/). But whether " +
  "qntm_rule_engine.execute() and compile_rules() -- defined in core/rule-engine/src/" +
  "qntm_rule_engine, outside this generator's permitted read boundary -- fire rules in that list " +
  "order or re-derive their own from the compiled priority field is not established.";

/** `$current.node.fields.<name>` -> `<name>`. Throws on any other reference shape. */
function fieldNameOf(ref, context) {
  const match = typeof ref === "string" ? ref.match(FIELD_REF) : null;
  if (!match) {
    throw new GenerationError(
      `${context}: ${JSON.stringify(ref)} is not a '$current.node.fields.<name>' reference — ` +
        "this closed grammar only models predicates over the candidate node's own fields",
    );
  }
  return match[1];
}

/**
 * Normalise a rule's `when` clause into `{op: "null", field}` or `{op: "eq", field, value}`. These
 * are exactly the two shapes `routine-without-cadence-becomes-task` and `stamp-created-at-on-task`
 * use today. Anything else throws — a third shape arriving in one of these two named rules is a
 * config change this grammar has not been taught, and it must be reported, not misread.
 */
function normaliseWhen(when, context) {
  const keys = when && typeof when === "object" ? Object.keys(when) : null;
  if (keys && keys.length === 1 && keys[0] === "null") {
    const args = when["null"];
    if (!Array.isArray(args) || args.length !== 1) {
      throw new GenerationError(`${context}: 'null' predicate does not take exactly one argument`);
    }
    return { op: "null", field: fieldNameOf(args[0], context) };
  }
  if (keys && keys.length === 1 && keys[0] === "eq") {
    const args = when["eq"];
    if (!Array.isArray(args) || args.length !== 2) {
      throw new GenerationError(`${context}: 'eq' predicate does not take exactly two arguments`);
    }
    return { op: "eq", field: fieldNameOf(args[0], context), value: args[1] };
  }
  throw new GenerationError(
    `${context}: 'when' is ${JSON.stringify(when)} — not one of the two predicate shapes this ` +
      "closed grammar models ({null: [...]} or {eq: [..., null]})",
  );
}

/** `for_each: {pattern: <name>}` -> `<name>`. Throws if the shape does not match. */
function patternOf(forEach, context) {
  if (!forEach || typeof forEach !== "object" || typeof forEach.pattern !== "string") {
    throw new GenerationError(`${context}: 'for_each' does not declare a string 'pattern'`);
  }
  return forEach.pattern;
}

/**
 * The rule's one modelled action — `set_node_type` or `set_field`, per `source.actionVerb` — plus
 * confirmation that every OTHER action on the rule is either that one or an ignored `emit_event`.
 * Throws on: zero or more than one matching action, an action targeting anything but the current
 * node, or any action verb this grammar does not recognise at all.
 */
function primaryAction(actions, source, context) {
  if (!Array.isArray(actions)) {
    throw new GenerationError(`${context}: 'actions' is not a list`);
  }
  const unmodelled = actions.filter(
    (a) => !(a && typeof a === "object" && (a.verb === source.actionVerb || IGNORED_VERBS.has(a.verb))),
  );
  if (unmodelled.length > 0) {
    throw new GenerationError(
      `${context}: an action verb this closed grammar does not model — ${JSON.stringify(unmodelled)}`,
    );
  }
  const matching = actions.filter((a) => a.verb === source.actionVerb);
  if (matching.length !== 1) {
    throw new GenerationError(
      `${context}: expected exactly one '${source.actionVerb}' action, found ${matching.length}`,
    );
  }
  const action = matching[0];
  if (action.node_id !== SELF_NODE) {
    throw new GenerationError(
      `${context}: '${source.actionVerb}' targets ${JSON.stringify(action.node_id)}, not the ` +
        `current node ('${SELF_NODE}')`,
    );
  }
  return action;
}

/** Find the one entry carrying `id: ruleId` in a parsed rules file's top-level list. */
function findRule(parsed, ruleId, fileKey) {
  if (!Array.isArray(parsed)) {
    throw new GenerationError(`${fileKey}: does not parse into a top-level list of rules`);
  }
  const matches = parsed.filter((e) => e && typeof e === "object" && e.id === ruleId);
  if (matches.length === 0) {
    throw new GenerationError(`${fileKey}: no rule with id '${ruleId}' found`);
  }
  if (matches.length > 1) {
    throw new GenerationError(`${fileKey}: ${matches.length} rules share the id '${ruleId}'`);
  }
  return matches[0];
}

function get(files, key) {
  return files instanceof Map ? files.get(key) : files[key];
}
function has(files, key) {
  return files instanceof Map ? files.has(key) : Object.prototype.hasOwnProperty.call(files, key);
}

/**
 * Compile the capture-rules declaration from an in-memory map of path -> contents. PURE: no
 * filesystem, no command line, no clock, no randomness.
 *
 * @param {Record<string, string> | Map<string, string>} files recognised keys: `CADENCE_RULES_KEY`,
 *   `STAMP_RULES_KEY`.
 * @returns {{declaration: {order: {established: false, reason: string}, rules: object}, dropped: {},
 *   version: string}}
 */
export function compile(files) {
  const rules = {};
  for (const source of RULE_SOURCES) {
    if (!has(files, source.fileKey)) {
      throw new GenerationError(`${source.fileKey} does not exist`);
    }
    const parsed = parseYamlSubset(get(files, source.fileKey), source.fileKey);
    const context = `${source.fileKey}#${source.ruleId}`;
    const entry = findRule(parsed, source.ruleId, source.fileKey);
    const pattern = patternOf(entry.for_each, context);
    const when = normaliseWhen(entry.when, context);
    const action = primaryAction(entry.actions, source, context);

    if (source.actionVerb === "set_node_type") {
      if (typeof action.node_type !== "string") {
        throw new GenerationError(`${context}: 'set_node_type' has no string 'node_type'`);
      }
      rules[source.ruleId] = { pattern, when, retypesTo: action.node_type };
    } else {
      if (typeof action.field !== "string") {
        throw new GenerationError(`${context}: 'set_field' has no string 'field'`);
      }
      rules[source.ruleId] = { pattern, when, setsField: action.field, setsFieldTo: action.value ?? null };
    }
  }

  // NOT a computed sequence — see this file's header ("THE ORDER"). `established: false` is a
  // constant, not derived from `files`, because the gap it names is a gap in what this generator
  // is permitted to read, not a fact about the two rule files' current content.
  const declaration = { order: { established: false, reason: ORDER_UNESTABLISHED_REASON }, rules };
  const dropped = {}; // Always empty by construction — see this file's header.
  return { declaration, dropped, version: versionKey({ declaration, dropped }) };
}

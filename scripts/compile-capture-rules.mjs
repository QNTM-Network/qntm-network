/**
 * compile-capture-rules — the PURE compile step for the capture-rules declaration: the closed
 * grammar of the two rules a bare capture reaches, and the order between them — published because
 * the derivation is now established end to end. See "THE ORDER" below for the full chain and, for
 * exactly two lines in it, who read them.
 *
 * ── WHAT THIS PUBLISHES, AND WHY ONLY THESE TWO ──
 *
 * `docs/implementation-artifacts/design-the-rule-mirror.md` §3.2 swept every one of the operator's
 * 186 sections and found a bare capture reaches exactly TWO of his 94 rules, never more:
 * `routine-without-cadence-becomes-task` (13 sections) and `stamp-created-at-on-task` (132
 * sections). §3.3 is the finding that makes publishing them non-optional: neither rule declares a
 * `priority:` in the operator's config today, so both compile to the engine's default (0), and
 * which one actually fires first is decided by the rule engine's own priority sort with the
 * compiled-list order as its tiebreak — see "THE ORDER" below for the full chain. Without
 * publishing it, a browser that only knows rung 1 (registration) stamps `routine` on a bare
 * capture in 13 of his sections and is contradicted, silently, the moment a cycle runs. §11 row 4
 * prices this exact deliverable at `½` and calls it "the smallest possible rule mirror: 2 of 94
 * rules."
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
 * — anything else throws), its `priority` (absent -> 0, matching the compiler default — see "THE
 * ORDER"), and the one data-mutating action it takes (`set_node_type` for the retype, `set_field`
 * for the stamp). `emit_event` actions are recognised and EXCLUDED ON PURPOSE, not silently:
 * design-the-rule-mirror.md §5.3 measured that 0 of the 2 rules a capture reaches read the event
 * log, so publishing what they write to it would name a fact the browser has no use for and no way
 * to verify. Any OTHER action verb is unmodelled and throws — this grammar never guesses at a
 * shape it has not been shown.
 *
 * ── THE ORDER — A THREE-STAGE CHAIN, TRACED END TO END, TWO LINES OF IT NOT BY THIS FILE'S AUTHOR ──
 *
 * Two earlier versions of this section got this wrong in two different ways, and both corrections
 * are worth keeping visible. Version 1 derived `order` by sorting the two rule files' own
 * basenames and called that "the alphabetical position... in config/rules/" design-the-rule-
 * mirror.md §3.3 names — a coincidence (file name, `rule_id`, both agreeing for this one pair)
 * stated as a fact, traced to neither the loader nor the rule engine. Version 2 traced the loader
 * precisely, found it could not reach the rule engine's own file from the granted read boundary,
 * and REFUSED to publish an order at all rather than guess past the gap. This version closes that
 * gap, because a second, wider read — done by the coordinator reviewing this PR, not by this
 * file's author — reached the missing link. What follows is the full chain; each stage says who
 * verified it.
 *
 * STAGE 0 — RULED OUT, verified by this file's author, read-only, over `apps/qntm-md/src/
 * qntm_md/**`: `apps/qntm-md/src/qntm_md/lifecycle/rule_loader.py:48`'s `CompiledRuleSet.rules_for`
 * sorts by `rule_id` — but `rules_for(` has no caller anywhere in `src/` (grepped, not taken on
 * trust), and `qntm_md.lifecycle` itself is referenced only by its own `__init__.py`. A parallel,
 * unused compilation path — its own `CompiledRule` / `CompiledRuleSet` dataclasses, distinct from
 * `qntm_rule_engine.CompiledRule` — never the mechanism the orchestrator's rules phase uses. DEAD.
 * Do not mistake it for the authority.
 *
 * STAGE 1 — THE COMPILED-LIST ORDER, verified by this file's author, read-only, over the same
 * boundary: the list `qntm_rule_engine.execute()` receives is built by `apps/qntm-md/src/qntm_md/
 * bundle/loader.py`, in three steps that each PRESERVE an order rather than impose one of their
 * own:
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
 * `qntm_rule_engine.execute(rules, ...)` (orchestrator.py:2199-2206) with that list, unmodified. So
 * the list `execute()` receives has `cadence_auto_routine.yaml`'s rules ahead of
 * `stamp_created_at.yaml`'s, mechanically — `routine-without-cadence-becomes-task` before
 * `stamp-created-at-on-task`.
 *
 * STAGE 2 — WHAT `execute()` DOES WITH THAT LIST, verified by the coordinator, read-only, over
 * `core/rule-engine/src/qntm_rule_engine` — OUTSIDE the boundary this file's author was granted for
 * either investigation, and NOT independently re-read by this file's author. Taken as reported, not
 * re-derived:
 *
 *   - `executor/core.py:74` — `sorted(enabled_rules, key=lambda r: r.priority, reverse=True)`, a
 *     STABLE sort by priority, highest first. The docstring at line 57: "Equal priorities maintain
 *     insertion order (stable sort)." The executor does not invent its own order; it sorts by
 *     priority only, and for ties, keeps the order it was handed — which STAGE 1 established.
 *   - `compiler/core.py:114` — `priority = rule_dict.get("priority", 0)`. A rule with no `priority:`
 *     key compiles to priority `0`.
 *
 * THE CLOSED CHAIN: bundle order (STAGE 1, alphabetical file order — the retype's file sorts
 * first) -> executor stable-sort by priority descending (STAGE 2) -> both rules compile to
 * priority 0 (neither `cadence_auto_routine.yaml` nor `stamp_created_at.yaml` declares a
 * `priority:` key — grepped by this file's author, independently, over the two files this
 * generator already reads) -> the tie holds -> STAGE 1's order decides ->
 * `routine-without-cadence-becomes-task` fires before `stamp-created-at-on-task`.
 *
 * PRIORITY FIRST, FILE ORDER AS THE DOCUMENTED TIEBREAK — NOT FILE ORDER ALONE. Publishing only
 * the resulting sequence would repeat version 1's mistake one level up: a correct answer with an
 * indefensible derivation. So this file publishes each rule's `priority` (extracted from its own
 * YAML, defaulting to 0 exactly as `compiler/core.py:114` does) as data on the rule itself, and
 * computes `order.sequence` from priority (descending) with file order as the tiebreak — the same
 * two-key sort STAGE 2 performs, run here in JS over the same inputs. If either rule ever gains a
 * `priority:` that changes the relative order, this generator's own computation follows it — see
 * `tests/present-capture-rules.test.mjs`'s mutation section for the proof that it actually does.
 *
 * IF THE CHAIN EVER BREAKS: `ORDER_UNESTABLISHED_REASON` below is kept, unused but ready, so a
 * future reader who finds STAGE 2's citations no longer hold what this comment says they hold can
 * revert `compile()` to publishing `{established: false, reason: ORDER_UNESTABLISHED_REASON}`
 * without re-deriving the refusal from nothing.
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
// action to be. THIS ARRAY'S OWN ORDER CARRIES NO MEANING — `computeOrder` below sorts a copy of
// it by file name first (STAGE 1) and priority second (the JS side of the STAGE 1/STAGE 2 join),
// never by this list's declaration order. See this file's header ("THE ORDER").
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

// KEPT, UNUSED TODAY, ON PURPOSE. `compile()` no longer publishes this — the chain is closed, see
// this file's header ("THE ORDER"), STAGE 2. It stays exported and accurate so a future reader who
// finds STAGE 2's citations no longer hold can revert `compile()`'s `order` to
// `{established: false, reason: ORDER_UNESTABLISHED_REASON}` without re-deriving the refusal.
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

/**
 * A rule's `priority`, matching `core/rule-engine/src/qntm_rule_engine/compiler/core.py:114`'s own
 * default: `rule_dict.get("priority", 0)`. Absent -> 0. Present but not an integer throws — this
 * closed grammar refuses to guess at a shape the compiler itself would not accept as a priority.
 */
function priorityOf(entry, context) {
  if (!("priority" in entry) || entry.priority === undefined) return 0;
  if (typeof entry.priority !== "number" || !Number.isInteger(entry.priority)) {
    throw new GenerationError(
      `${context}: 'priority' is ${JSON.stringify(entry.priority)}, not an integer`,
    );
  }
  return entry.priority;
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

const basenameOf = (key) => key.split("/").pop();

/**
 * The two rules' firing order — STAGE 1 (file order) and STAGE 2 (priority) joined, in JS, over
 * the same inputs the real chain uses. See this file's header ("THE ORDER").
 *
 * `entries` must already be a copy; this function sorts it. First by `fileKey`'s basename
 * (STAGE 1 — what the bundle loader's directory walk would produce, the only order that ever
 * reaches the rule engine), THEN — because `Array.prototype.sort` is a STABLE sort in every engine
 * this repo targets — a second pass by `priority` descending reproduces exactly what STAGE 2's
 * `sorted(enabled_rules, key=lambda r: r.priority, reverse=True)` does to that same list: rules
 * that tie on priority keep the order they arrived in, which is STAGE 1's.
 *
 * @param {{ruleId: string, fileKey: string, priority: number}[]} entries
 * @returns {string[]}
 */
function computeOrderSequence(entries) {
  const byFileOrder = entries
    .slice()
    .sort((a, b) => basenameOf(a.fileKey).localeCompare(basenameOf(b.fileKey)));
  return byFileOrder.sort((a, b) => b.priority - a.priority).map((e) => e.ruleId);
}

/**
 * Compile the capture-rules declaration from an in-memory map of path -> contents. PURE: no
 * filesystem, no command line, no clock, no randomness.
 *
 * @param {Record<string, string> | Map<string, string>} files recognised keys: `CADENCE_RULES_KEY`,
 *   `STAMP_RULES_KEY`.
 * @returns {{declaration: {order: {established: true, sequence: string[], derivedFrom: string},
 *   rules: object}, dropped: {}, version: string}}
 */
export function compile(files) {
  const rules = {};
  const orderEntries = [];
  for (const source of RULE_SOURCES) {
    if (!has(files, source.fileKey)) {
      throw new GenerationError(`${source.fileKey} does not exist`);
    }
    const parsed = parseYamlSubset(get(files, source.fileKey), source.fileKey);
    const context = `${source.fileKey}#${source.ruleId}`;
    const entry = findRule(parsed, source.ruleId, source.fileKey);
    const pattern = patternOf(entry.for_each, context);
    const when = normaliseWhen(entry.when, context);
    const priority = priorityOf(entry, context);
    const action = primaryAction(entry.actions, source, context);

    if (source.actionVerb === "set_node_type") {
      if (typeof action.node_type !== "string") {
        throw new GenerationError(`${context}: 'set_node_type' has no string 'node_type'`);
      }
      rules[source.ruleId] = { pattern, when, priority, retypesTo: action.node_type };
    } else {
      if (typeof action.field !== "string") {
        throw new GenerationError(`${context}: 'set_field' has no string 'field'`);
      }
      rules[source.ruleId] = {
        pattern,
        when,
        priority,
        setsField: action.field,
        setsFieldTo: action.value ?? null,
      };
    }
    orderEntries.push({ ruleId: source.ruleId, fileKey: source.fileKey, priority });
  }

  const declaration = {
    order: {
      established: true,
      sequence: computeOrderSequence(orderEntries),
      derivedFrom:
        "priority, descending, stable — ties broken by the compiled-list order the bundle " +
        "loader's config-tree walk produces (file name, since both rules' files are otherwise " +
        "unordered relative to each other). See compile-capture-rules.mjs's header, 'THE ORDER'.",
    },
    rules,
  };
  const dropped = {}; // Always empty by construction — see this file's header.
  return { declaration, dropped, version: versionKey({ declaration, dropped }) };
}

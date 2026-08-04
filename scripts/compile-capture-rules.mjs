/**
 * compile-capture-rules — the PURE compile step for the capture-rules declaration: the closed
 * grammar of the two rules a bare capture reaches, and the order between them.
 *
 * ── WHAT THIS PUBLISHES, AND WHY ONLY THESE TWO ──
 *
 * `docs/implementation-artifacts/design-the-rule-mirror.md` §3.2 swept every one of the operator's
 * 186 sections and found a bare capture reaches exactly TWO of his 94 rules, never more:
 * `routine-without-cadence-becomes-task` (13 sections) and `stamp-created-at-on-task` (132
 * sections). §3.3 is the finding that makes publishing them non-optional: neither rule declares a
 * `priority:`, so both sit in the same band as 74 others, and the only thing that decides their
 * order is the alphabetical position of `cadence_auto_routine.yaml` ahead of
 * `stamp_created_at.yaml` in `config/rules/` — an order the config itself never states. Without
 * publishing it, a browser that only knows rung 1 (registration) stamps `routine` on a bare capture
 * in 13 of his sections and is contradicted, silently, the moment a cycle runs. §11 row 4 prices
 * this exact deliverable at `½` and calls it "the smallest possible rule mirror: 2 of 94 rules."
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
 * ── THE ORDER — DERIVED, NOT ASSERTED, AND ONE THING ABOUT IT IS UNVERIFIED ──
 *
 * `order` is computed by sorting the two source files' own basenames — `cadence_auto_routine.yaml`
 * before `stamp_created_at.yaml` — which is mechanically the same fact design-the-rule-mirror.md
 * §3.3 cites for why the retype runs before the stamp. What this file CANNOT verify, because its
 * only permitted reads are these two named files (never the rules directory, never the loader): the
 * design document's own "What is unverified" list, item 3, names this directly — whether the
 * monorepo's bundle loader actually walks `config/rules/*.yaml` in alphabetical order, or merely
 * happened to on the run that was observed. This file inherits that as an open question; it does
 * not close it.
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
// action to be. Order in this array carries NO meaning — `computeOrder` below is what decides
// publication order, from the file names, not from this list's position.
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

const basenameOf = (key) => key.split("/").pop();

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

/**
 * The publication order: the two rule ids, sorted by their SOURCE FILE's basename. See this file's
 * header for what this is standing in for and what it does not verify.
 */
function computeOrder() {
  return RULE_SOURCES.slice()
    .sort((a, b) => basenameOf(a.fileKey).localeCompare(basenameOf(b.fileKey)))
    .map((s) => s.ruleId);
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
 * @returns {{declaration: {order: string[], rules: object}, dropped: {}, version: string}}
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

  const declaration = { order: computeOrder(), rules };
  const dropped = {}; // Always empty by construction — see this file's header.
  return { declaration, dropped, version: versionKey({ declaration, dropped }) };
}

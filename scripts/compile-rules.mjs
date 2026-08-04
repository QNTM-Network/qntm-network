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
 *   for_each     `{pattern: <name>}` (extra keys such as `bind`/`iterates` are ignored — every
 *                published action targets `$current.node.id` regardless of what the binding is
 *                named). A `for_each` expressed as a LIST of pattern bindings (a multi-source join
 *                — 39 of the operator's rules use this shape for aggregate metrics) is a different
 *                grammar entirely and is dropped, not guessed at.
 *   when         absent (always true — matches `compile-resolution.mjs`'s own `evaluateWhen`),
 *                `{"null": [$current.node.fields.<f>]}`, `{eq: [$current.node.fields.<f>, <v>]}`,
 *                or `{not: [<one of the above>]}`. `and`/`or`/`in`/`exists` — all real, in real
 *                rules — are outside this grammar and dropped with the operator naming which
 *                operator it was.
 *   priority     absent -> 0 (`compiler/core.py:114`'s own default), or an integer.
 *   actions      exactly one action whose verb is `set_node_type`, `set_field` or `unset_field`,
 *                targeting `$current.node.id`, plus any number of `emit_event` actions (recognised
 *                and excluded — see `compile-capture-rules.mjs`'s original reasoning, unchanged:
 *                nothing published here reads the event log). A verb outside that set, more than
 *                one modelled action, or an action targeting a different node — dropped.
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

export class GenerationError extends Error {}
class Refusal extends Error {}
const refuse = (reason) => {
  throw new Refusal(reason);
};

/** The one prefix `compile`'s file map recognises. Named once so the pure function and the fs
 * shell in `generate-rules-declaration.mjs` agree on the exact same string without restating it. */
export const RULES_PREFIX = "rules/";

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
 * `for_each: {pattern: <name>}` -> `<name>`. A `for_each` expressed as a LIST (a multi-source
 * join — the shape every aggregate/metric rule in the operator's config uses) is a different
 * grammar this file does not read; refused, not guessed at.
 */
function patternOf(forEach) {
  if (Array.isArray(forEach)) {
    refuse(
      `'for_each' is a list of ${forEach.length} pattern binding(s) (a multi-source join), which ` +
        "this closed grammar does not model",
    );
  }
  if (!forEach || typeof forEach !== "object" || typeof forEach.pattern !== "string" || forEach.pattern === "") {
    refuse("'for_each' does not declare a string 'pattern'");
  }
  return forEach.pattern;
}

/**
 * The rule's one modelled action — `set_node_type`, `set_field` or `unset_field` — plus
 * confirmation that every OTHER action on the rule is either that one or an ignored `emit_event`.
 * Refuses (drops the rule) on: an unrecognised verb, zero or more than one modelled action, or an
 * action targeting anything but the current node.
 */
function primaryAction(actions) {
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
  if (modelled.length > 1) {
    refuse(
      `${modelled.length} modelled actions (verbs: ${modelled.map((a) => a.verb).join(", ")}) — ` +
        "this grammar publishes exactly one action per rule",
    );
  }
  const action = modelled[0];
  if (action.node_id !== SELF_NODE) {
    refuse(`'${action.verb}' targets ${JSON.stringify(action.node_id)}, not the current node ('${SELF_NODE}')`);
  }

  if (action.verb === "set_node_type") {
    if (typeof action.node_type !== "string") refuse("'set_node_type' has no string 'node_type'");
    return { retypesTo: action.node_type };
  }
  if (action.verb === "set_field") {
    if (typeof action.field !== "string") refuse("'set_field' has no string 'field'");
    return { setsField: action.field, setsFieldTo: action.value ?? null };
  }
  // unset_field
  if (typeof action.field !== "string") refuse("'unset_field' has no string 'field'");
  return { unsetsField: action.field };
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
 * Compile the rules-category declaration from an in-memory map of path -> contents. PURE: no
 * filesystem, no command line, no clock, no randomness.
 *
 * @param {Record<string, string> | Map<string, string>} files recognised keys: every
 *   `"rules/<name>.yaml"`. Paths use `/` regardless of platform — this is a logical tree, not a
 *   filesystem one.
 * @param {Ledger} ledger
 * @returns {{declaration: {order: object, rules: object}, dropped: object, version: string}}
 */
export function compile(files, ledger = new Ledger()) {
  const isMap = files instanceof Map;
  const get = (key) => (isMap ? files.get(key) : files[key]);
  const allKeys = () => (isMap ? [...files.keys()] : Object.keys(files));

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
        const action = primaryAction(entry.actions);
        rules[id] = { pattern, when, priority, ...action };
        orderEntries.push({ ruleId: id, fileKey: key, priority });
      } catch (error) {
        if (!(error instanceof Refusal)) throw error;
        ledger.drop(what, error.message);
      }
    });
  }

  const declaration = {
    order: {
      established: true,
      sequence: computeOrderSequence(orderEntries),
      derivedFrom:
        "priority, descending, stable — ties broken by the compiled-list order the bundle " +
        "loader's config-tree walk produces (file name) — computed over every rule this grammar " +
        "published; a rule this grammar dropped is not part of this ordering. See " +
        "compile-rules.mjs's header, 'THE ORDER'.",
    },
    rules,
  };
  const dropped = ledger.toJSON();
  return { declaration, dropped, version: versionKey({ declaration, dropped }) };
}

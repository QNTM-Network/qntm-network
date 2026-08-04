/**
 * compile-qualification — the PURE compile step for the qualification declaration, split out of
 * `generate-qualification-declaration.mjs` for the same reason `compile-structural.mjs` was split
 * out of `generate-structural-declaration.mjs` (`5d4f1b5`, PR #84): this module must be safe to
 * `import` inside a Cloudflare Worker isolate, and "the function is pure" is not the same claim as
 * "the file is safe to import in a Worker." That first port found the gap by crashing at module
 * load — `worker/src/config.js` importing `compile` from the single-file generator dragged in
 * `node:fs` and `scripts/monorepo-config.mjs`'s module-level `fileURLToPath(import.meta.url)`, a
 * Node idiom `wrangler`'s bundler does not survive. This file is built to that finding from the
 * start rather than discovering it again: it imports only `yaml-subset.mjs` and `ledger.mjs`, both
 * already zero-import (`design-the-runtime-compile.md`'s own citation), so the Worker's module
 * graph for the qualification route is exactly: this file, plus those two — nothing Node-specific.
 * `worker/src/config.js` imports `compile` from HERE, never from `generate-qualification-
 * declaration.mjs`, which keeps `node:fs`, `node:path` and `monorepo-config.mjs` on the CLI side of
 * the split where a Worker route never has to load them.
 *
 * ── WHAT MOVED HERE, VERBATIM OR NEAR IT ──
 *
 * Every piece of `generate-qualification-declaration.mjs` that never touched a filesystem path
 * moved unchanged: `RESOLVABLE_FIELDS`, the pattern normaliser (`normalisePattern` and its
 * helpers), the structural-exclusion desugarer (`applyStructuralExclusionDefaults`). The four
 * `read*(configDir, ledger)` functions that DID read the filesystem directly
 * (`readStructuralNodeTypes`, `readPatterns`, `readViews`, `readTokens`) are inlined into one
 * `compile(files, ledger)`, rewritten to read an in-memory files map instead — the same has/get/
 * allKeys shape `compile-structural.mjs` already established, so a files map (an object from a
 * POSTed JSON body, or a Map built by a caller) works without the caller knowing which. See that
 * file's own header for the shape's origin.
 *
 * ── WHAT CHANGED, NAMED SO IT IS NOT MISTAKEN FOR DRIFT ──
 *
 * Every LEDGER-DROP key (`patterns/foo.yaml`, `views/bar.yaml#2`, `vocabulary token '#work'`, …)
 * is byte-identical to what the original produced — `tests/declaration-drop.test.mjs` proves this,
 * unchanged, because a files-map key IS the same string the original derived from a directory read
 * plus a prefix. What changed is the small set of hard `GenerationError` messages that used to
 * interpolate an ABSOLUTE FILESYSTEM PATH (`${configDir}/schema.yaml does not exist`): those now
 * name the logical key instead (`schema.yaml does not exist`), the same "no absolute path or
 * username reaches a thrown message" move `compile-structural.mjs`'s `parseIndentBinding` already
 * made. No test asserts the old wording — checked directly, `grep -rn "does not exist" tests/` —
 * so this is a real but inert change, not a risk to the refusal contract the acceptance test pins
 * (see USAGE below and this repo's PR for the exact grep).
 *
 * ── WHAT DID NOT MOVE, AND WHY IT MATTERS MOST ──
 *
 * `normalisePattern` is unchanged in EVERY way that matters to `unresolvable field(s): project` —
 * `tests/app-generality-acceptance.test.mjs:519`'s own pinned refusal. It still takes one parsed
 * pattern config and returns `{find, exclude}` or throws `Refusal`; it never reads a file, a
 * files-map key, or a ledger. `tests/operator-set-agreement.test.mjs` calls it directly, with a
 * hand-built config object, exactly as it did before this file existed — this move changes where
 * the function LIVES, never what it DOES or SAYS.
 */

import { parseYamlSubset } from "./yaml-subset.mjs";
import { Ledger } from "./ledger.mjs";
import { versionKey } from "./declaration-version.mjs";

export class GenerationError extends Error {}
class Refusal extends Error {}
const refuse = (reason) => {
  throw new Refusal(reason);
};

// The fixed keys `compile`'s file map carries, plus the three prefixes every per-family file lives
// under. Named once so the pure function and any caller building a files map (the fs shell in
// `generate-qualification-declaration.mjs`, or a Worker route reading a POSTed body) agree on the
// exact same strings without restating them.
export const SCHEMA_KEY = "schema.yaml";
export const PATTERNS_PREFIX = "patterns/";
export const VIEWS_PREFIX = "views/";
export const VOCABULARY_PREFIX = "vocabulary/";
export const DEFAULT_REGISTRATION_KEY = `${VIEWS_PREFIX}default_registration.yaml`;

/**
 * The only node fields `app/present/membership.ts` can resolve for a line the operator is typing:
 * the node type (registration default, or a type token on the line), the domain (a domain token),
 * and the status (the checkbox). Every one of the three is decided by something visible IN THE
 * LINE or by a registration default this file also publishes. A predicate that ranges outside this
 * set is published but is not answerable, and the app refuses it at read time rather than here —
 * the declaration stays a faithful record of the config either way.
 *
 * THE ONE VALUE THREE OTHER FILES ARE GENERATED FROM. `scripts/generate-operator-set.mjs` writes
 * `app/present/membership.ts`'s and `scripts/qualification-agreement.py`'s own copies of this list
 * FROM this one — this move keeps this constant's name, its value, and the module path callers
 * already import it from (`generate-qualification-declaration.mjs` re-exports it, unchanged, below
 * its own header) so that generation and `tests/operator-set-agreement.test.mjs`'s direct import
 * both keep working with no edit of their own.
 */
export const RESOLVABLE_FIELDS = Object.freeze(["node_type", "domain", "status"]);

const isScalar = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);

// ── the pattern normaliser — pure over a parsed config object, no files map involved ───────────

function normalisePredicate(value, field) {
  if (isScalar(value)) {
    if (typeof value === "string" && value.startsWith("$")) {
      refuse(`${field}: cycle variable ${value}`);
    }
    return { eq: value };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    // A mapping predicate names its operator explicitly. The engine allows several, conjoined
    // (`{gte: $today, lte: $week_end}` is a range), but every multi-operator predicate in the
    // config is a date window against a cycle variable, so only the single-operator forms are
    // local. `eq` is spelled out here as well as inferred from a bare value, because
    // `status: {not: {eq: done}}` nests one inside the other and refusing the inner `eq` would
    // withhold a pattern that is entirely decidable.
    const keys = Object.keys(value);
    if (keys.length !== 1) refuse(`${field}: operator ${keys.join("+")}`);
    if (keys[0] === "not") return { not: normalisePredicate(value.not, field) };
    if (keys[0] === "eq") return normalisePredicate(value.eq, field);
    refuse(`${field}: operator ${keys[0]}`);
  }
  refuse(`${field}: unreadable predicate`);
}

function normaliseFind(find, where) {
  if (!find || typeof find !== "object" || Array.isArray(find)) {
    refuse(`${where}: not a mapping`);
  }
  let nodeType = null;
  const fields = {};
  for (const [key, value] of Object.entries(find)) {
    if (key === "node_type") {
      const list = Array.isArray(value) ? value : [value];
      if (list.length === 0 || !list.every((t) => typeof t === "string" && !t.startsWith("$"))) {
        refuse(`${where}.node_type: not a string or list`);
      }
      nodeType = [...list].sort();
      // NOT A DROP: loop control — node_type was just read into `nodeType`.
      continue;
    }
    fields[key] = normalisePredicate(value, key);
  }
  return { nodeType, fields };
}

/**
 * `{not: [{find_nodes: F}], min: 1}` over a single candidate is exactly "the candidate does not
 * match F" — a SELF-test, never a traversal. Returns `{kind: "self", nodeType, fields}`.
 */
function normaliseSelfStep(step, index) {
  if (step.min !== 1) refuse(`step ${index}: min=${JSON.stringify(step.min)}`);
  if (!Array.isArray(step.not) || step.not.length !== 1) {
    refuse(`step ${index}: 'not' is not a single-element list`);
  }
  const sub = step.not[0];
  if (!sub || typeof sub !== "object" || Array.isArray(sub) || Object.keys(sub).length !== 1) {
    refuse(`step ${index}: sub-step is not a single-key mapping`);
  }
  if (!("find_nodes" in sub)) {
    refuse(`step ${index}: traverses (${Object.keys(sub)[0]})`);
  }
  return { kind: "self", ...normaliseFind(sub.find_nodes, `step ${index}.not[0].find_nodes`) };
}

/**
 * `{children: {edge_type: T, ...F}, exists: true}` / `{parents: {...}, not_exists: true}` — a
 * ONE-HOP edge-existence test: does the candidate have (or not have) at least one neighbour,
 * reached by ONE `children`/`parents` traversal of `edge_type`, matching `F`?
 *
 * MEASURED against the operator's real config (`tasks_with_open_part_of_child.yaml`,
 * `tasks_with_open_waiting_for_child.yaml`, and 25 more patterns 27 sections reference): every
 * real `children:`/`parents:` step names `edge_type` (a string or a list — `chain_head_candidates
 * .yaml`'s `[NEXT, PARALLEL]`), optionally `node_type`, and optionally further field predicates
 * (`status: {not: {eq: done}}`, or a bare boolean like `reset_cascade_pending: true`) — exactly the
 * shape `normaliseFind` already reads for `root.find` and for a self-step's own `find_nodes`, so
 * this reuses it rather than re-deriving field-predicate handling a third time.
 *
 * ONE HOP ONLY, ON PURPOSE. `ancestors:`/`descendants:` are TRANSITIVE by the operator's own
 * comments (`routine_reset_cascade.yaml`: "TRANSITIVE, not one hop (`ancestors` ...)";
 * `unlocks_propagation.yaml`: "Transitive (`ancestors`, not `parents`)") — a walk of unbounded
 * depth, not a single edge. Modelling that would need a graph-aware matcher this leg does not
 * build (see `app/present/membership.ts`'s `qualifierNeedsGraph`); `normaliseStep` below refuses
 * any direction key other than `children`/`parents` for exactly this reason, with the same
 * `traverses (...)` wording a self-step refusal already uses.
 */
function normaliseEdgeStep(direction, mustExist, spec, index) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    refuse(`step ${index}.${direction}: not a mapping`);
  }
  const { edge_type: edgeTypeRaw, ...rest } = spec;
  const edgeTypeList = Array.isArray(edgeTypeRaw) ? edgeTypeRaw : [edgeTypeRaw];
  if (
    edgeTypeList.length === 0 ||
    !edgeTypeList.every((t) => typeof t === "string" && t !== "" && !t.startsWith("$"))
  ) {
    refuse(`step ${index}.${direction}.edge_type: not a string or non-empty list of strings`);
  }
  const edgeType = [...edgeTypeList].sort();
  const { nodeType, fields } = normaliseFind(rest, `step ${index}.${direction}`);
  return { kind: "edge", direction, mustExist, edgeType, nodeType, fields };
}

/**
 * One pattern `step`, normalised to either a SELF-test (`{kind: "self", nodeType, fields}` — the
 * original, unwidened grammar) or a ONE-HOP edge-existence test (`{kind: "edge", direction,
 * mustExist, edgeType, nodeType, fields}` — see `normaliseEdgeStep`). Any other shape — including
 * `ancestors:`/`descendants:`, three or more keys, or an `exists`/`not_exists` value that is not
 * literally `true` — is refused with the same `traverses (...)` naming the original grammar used,
 * so a config change that adds a step shape neither form models still names exactly what it saw.
 */
function normaliseStep(step, index) {
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    refuse(`step ${index}: not a mapping`);
  }
  const keys = Object.keys(step).sort();
  if (keys.length === 2 && keys[0] === "min" && keys[1] === "not") {
    return normaliseSelfStep(step, index);
  }
  if (keys.length === 2) {
    const direction = keys.includes("children") ? "children" : keys.includes("parents") ? "parents" : null;
    const polarityKey = keys.includes("exists") ? "exists" : keys.includes("not_exists") ? "not_exists" : null;
    if (direction !== null && polarityKey !== null) {
      if (step[polarityKey] !== true) {
        refuse(`step ${index}.${polarityKey}: ${JSON.stringify(step[polarityKey])}, not true`);
      }
      return normaliseEdgeStep(direction, polarityKey === "exists", step[direction], index);
    }
  }
  refuse(`step ${index}: traverses (${keys.join("+")})`);
}

/**
 * Normalise one pattern config into the closed local grammar `{find, exclude}`, or throw
 * `Refusal` with a reason. PURE — one object in, one object out or a thrown reason; no file, no
 * files-map key, no ledger. `tests/operator-set-agreement.test.mjs` drives this directly, and
 * `tests/app-generality-acceptance.test.mjs`'s pinned refusal (`unresolvable field(s): project`)
 * is this function's own last check, unchanged by this file's existence.
 */
export function normalisePattern(config) {
  const parameters = config?.parameters;
  if (parameters && typeof parameters === "object" && Object.keys(parameters).length > 0) {
    refuse(`parameters: ${Object.keys(parameters).join("+")}`);
  }
  const root = config?.root;
  if (!root || typeof root !== "object" || Array.isArray(root)) refuse("no 'root' mapping");
  if (!("find" in root)) refuse("root has no 'find' (composed pattern)");
  const extraRootKeys = Object.keys(root).filter((k) => k !== "find");
  if (extraRootKeys.length > 0) {
    refuse(`root also carries ${extraRootKeys.join("+")}`);
  }
  const find = normaliseFind(root.find, "root.find");
  const steps = Array.isArray(config.steps) ? config.steps : config.steps == null ? [] : refuse("'steps' is not a list");
  const normalisedSteps = steps.map((step, i) => normaliseStep(step, i));
  const exclude = normalisedSteps
    .filter((s) => s.kind === "self")
    .map(({ nodeType, fields }) => ({ nodeType, fields }));
  const edgeSteps = normalisedSteps
    .filter((s) => s.kind === "edge")
    .map(({ direction, mustExist, edgeType, nodeType, fields }) => ({
      direction,
      mustExist,
      edgeType,
      nodeType,
      fields,
    }));

  // THE LAST REFUSAL, AND THE ONE THAT DECIDES WHAT SHIPS. A predicate can be perfectly local and
  // still be unanswerable, because the app has to resolve the LINE's fields before it can test
  // anything — and for a line the operator is typing it can resolve exactly three: the node type
  // (registration default, or a type token in the line), the domain (a domain token) and the
  // status (the checkbox). Each is decided by something visible in the line or by a default this
  // same file publishes. `project`, `title`, `cap_state` and the rest are not: they are set
  // elsewhere, or by an engine rule at mint time, and a browser that resolved them to "absent"
  // would answer confidently and wrongly. Withholding them here keeps ONE refusal boundary with
  // ONE legible record, instead of a predicate on the wire that the app must silently decline.
  //
  // EDGE-STEP FIELDS ARE DELIBERATELY OUTSIDE THIS CHECK. A `children:`/`parents:` field predicate
  // (`status`, `reset_cascade_pending`, `cluster_locked`, ...) ranges over a NEIGHBOUR NODE's
  // fields, read from the graph payload the same way any node's fields are — never from the LINE
  // being typed, which is what `RESOLVABLE_FIELDS` exists to bound. Applying that bound here would
  // refuse every one-hop pattern this widening exists to admit, for a restriction that was never
  // about the graph in the first place.
  const referencedFields = new Set();
  for (const clause of [find, ...exclude]) {
    for (const field of Object.keys(clause.fields)) referencedFields.add(field);
  }
  const unresolvable = [...referencedFields].filter((f) => !RESOLVABLE_FIELDS.includes(f)).sort();
  if (unresolvable.length > 0) {
    refuse(`unresolvable field(s): ${unresolvable.join("+")}`);
  }
  const result = { find, exclude };
  // OMITTED, NOT `[]`, WHEN NO PATTERN IN THE OPERATOR'S CONFIG USES ONE — every pattern that
  // resolved before this widening keeps the EXACT TWO-KEY `{find, exclude}` shape it always had,
  // insertion order and all, so its JSON is BYTE-IDENTICAL, not merely semantically equal.
  // VERIFIED against the operator's real config for this widening's own PR: all 69 previously-
  // published patterns hash identical before/after, 19 new ones resolve, 0 regressed — see that
  // PR's own description for the exact reproducible comparison run.
  if (edgeSteps.length > 0) result.edgeSteps = edgeSteps;
  return result;
}

/**
 * Reproduce `bundle/pattern_structural_defaults.py`: a pattern whose `root.find` names no
 * `node_type` gets one `{not: [{find_nodes: {node_type: T}}], min: 1}` step per identity-unique
 * type it does not already exclude. `include_structural: true` opts the whole pattern out. PURE —
 * unchanged by this file's existence.
 */
export function applyStructuralExclusionDefaults(config, structuralTypes) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return config;
  if (config.include_structural === true) {
    const { include_structural, ...rest } = config;
    return rest;
  }
  const find = config.root && typeof config.root === "object" ? config.root.find : null;
  if (!find || typeof find !== "object" || Array.isArray(find)) return config;
  if ("node_type" in find) return config;

  const already = new Set();
  if (Array.isArray(config.steps)) {
    for (const step of config.steps) {
      // NOT A DROP: scanning steps the pattern ALREADY has, to avoid re-adding an exclusion. A malformed step is refused with a reason by normaliseStep below.
      if (!step || typeof step !== "object") continue;
      // NOT A DROP: same scan, same downstream refusal.
      if (!Array.isArray(step.not)) continue;
      for (const sub of step.not) {
        const findNodes = sub && typeof sub === "object" ? sub.find_nodes : null;
        if (findNodes && typeof findNodes === "object" && typeof findNodes.node_type === "string") {
          already.add(findNodes.node_type);
        }
      }
    }
  }
  const missing = structuralTypes.filter((t) => !already.has(t));
  if (missing.length === 0) return config;
  const steps = Array.isArray(config.steps) ? [...config.steps] : [];
  for (const nodeType of missing) {
    steps.push({ not: [{ find_nodes: { node_type: nodeType } }], min: 1 });
  }
  return { ...config, steps };
}

// ── the pure compile — `design-the-runtime-compile.md` step C's own contract ───────────────────

/**
 * Compile the qualification declaration from an in-memory config tree. PURE: no filesystem, no
 * command line, no clock, no randomness — and, like `compile-structural.mjs`, no import that is
 * not itself as pure as this one. The same function runs identically in the CLI shell
 * (`generate-qualification-declaration.mjs`) and in the Worker's Gate-1 route
 * (`worker/src/config.js`).
 *
 * @param {Record<string, string> | Map<string, string>} files path -> file contents. Recognised
 *   keys: `"schema.yaml"`, every `"patterns/<name>.yaml"`, every `"views/<name>.yaml"` (including
 *   `"views/default_registration.yaml"`), and every `"vocabulary/<name>.yaml"`. Paths use `/`
 *   regardless of platform — this is a logical tree, not a filesystem one.
 * @param {Ledger} ledger
 * @returns {{declaration: object, dropped: object}}
 */
export function compile(files, ledger = new Ledger()) {
  const isMap = files instanceof Map;
  const has = (key) => (isMap ? files.has(key) : Object.prototype.hasOwnProperty.call(files, key));
  const get = (key) => (isMap ? files.get(key) : files[key]);
  const allKeys = () => (isMap ? [...files.keys()] : Object.keys(files));
  const readYaml = (key) => parseYamlSubset(get(key), key);

  // ── 1. schema.yaml -> the identity-unique (structural) node types ────────────────────────────

  if (!has(SCHEMA_KEY)) throw new GenerationError(`${SCHEMA_KEY} does not exist`);
  const schema = readYaml(SCHEMA_KEY);
  const nodeTypes = schema?.node_types;
  if (!nodeTypes || typeof nodeTypes !== "object") {
    throw new GenerationError(`${SCHEMA_KEY}: no 'node_types:' mapping`);
  }
  const structuralTypes = [];
  for (const [name, definition] of Object.entries(nodeTypes)) {
    const identity = definition && typeof definition === "object" ? definition.identity : null;
    if (identity && typeof identity === "object" && identity.unique === true) structuralTypes.push(name);
  }
  if (structuralTypes.length === 0) {
    throw new GenerationError(
      `${SCHEMA_KEY}: no node type declares 'identity: {unique: true}' — the structural-exclusion ` +
        "desugarer this generator reproduces would be a no-op, which has never been true of this " +
        "config; refusing rather than publishing predicates that admit structural chrome.",
    );
  }
  structuralTypes.sort();

  // ── 2. patterns/*.yaml -> one merged pattern map ──────────────────────────────────────────────
  // SORTED EXPLICITLY, the same reason `compile-structural.mjs`'s view keys are: a files map
  // carries no directory-walk order of its own once it is in memory.

  const patternKeys = allKeys()
    .filter((k) => k.startsWith(PATTERNS_PREFIX) && k.endsWith(".yaml"))
    .sort();
  const rawPatterns = new Map();
  for (const key of patternKeys) {
    const file = key.slice(PATTERNS_PREFIX.length);
    const document = readYaml(key);
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      // DROP PATH 1. Every pattern this file defines vanishes with it, and a section naming one of
      // them then throws "names a pattern that no file in patterns/ defines" — a true message
      // pointing at the wrong file. Recorded here so the real cause is named at the real place.
      ledger.drop(
        key,
        "the file did not parse into a mapping of pattern name -> definition, so every pattern " +
          "it defines was skipped",
      );
      continue;
    }
    for (const [name, config] of Object.entries(document)) {
      if (rawPatterns.has(name)) {
        throw new GenerationError(
          `pattern '${name}' is defined in two files (${rawPatterns.get(name).file} and ${file}) — ` +
            "the engine merges one dict, so a duplicate silently loses; refusing.",
        );
      }
      rawPatterns.set(name, { file, config });
    }
  }

  // ── 3. views/*.yaml -> sections, with the registration cascade resolved ──────────────────────

  if (!has(DEFAULT_REGISTRATION_KEY)) {
    throw new GenerationError(`${DEFAULT_REGISTRATION_KEY} does not exist`);
  }
  const registration = readYaml(DEFAULT_REGISTRATION_KEY)?.default_registration;
  if (!registration || typeof registration !== "object") {
    throw new GenerationError(`${DEFAULT_REGISTRATION_KEY}: no 'default_registration:' mapping`);
  }
  const globalNodeType = registration.default_node_type;
  if (typeof globalNodeType !== "string") {
    throw new GenerationError(
      `${DEFAULT_REGISTRATION_KEY}: default_node_type is not a string — the GLOBAL rung of the ` +
        "registration cascade is what an unstamped line falls through to; refusing to guess it.",
    );
  }

  const viewKeys = allKeys()
    .filter((k) => k.startsWith(VIEWS_PREFIX) && k.endsWith(".yaml"))
    .sort();
  const views = {};
  const sectionOrder = {};
  for (const key of viewKeys) {
    // NOT A DROP: default_registration.yaml is not a view sheet; it is read above, for the GLOBAL rung.
    if (key === DEFAULT_REGISTRATION_KEY) continue;
    const file = key.slice(VIEWS_PREFIX.length);
    const document = readYaml(key);
    // DROP PATHS 2-4. Each drops a WHOLE VIEW — every section it declares, out of both `sections`
    // and `sectionOrder`. `sectionOrder` is what L3 ADDRESSING indexes positionally, so a view
    // missing from it is a view whose every line is addressed by falling through to nothing.
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      ledger.drop(key, "the file did not parse into a mapping, so the whole view was skipped");
      continue;
    }
    const entries = Object.entries(document);
    if (entries.length !== 1) {
      ledger.drop(
        key,
        `the file declares ${entries.length} top-level keys (${Object.keys(document).join(", ")}) ` +
          "and this generator reads a view sheet as exactly one; the whole view was skipped",
      );
      continue;
    }
    const [viewId, view] = entries[0];
    if (!view || typeof view !== "object" || !Array.isArray(view.sections)) {
      ledger.drop(key, `view '${viewId}' declares no 'sections:' list, so the whole view was skipped`);
      continue;
    }

    const viewNodeType =
      typeof view.default_node_type === "string" ? view.default_node_type : globalNodeType;
    const sections = {};
    const order = [];
    for (const [index, section] of view.sections.entries()) {
      // DROP PATHS 5-6. A section dropped here is dropped from `sectionOrder` TOO, and that is the
      // one this file's own comments say must be impossible: `app/present/address.ts` counts
      // headings positionally and indexes `sectionOrder`, but the ENGINE still emits a heading for
      // a section this generator could not read. One missing entry therefore shifts every
      // subsequent section's ordinal and misaddresses every line under it — silently, and with
      // confident wrong answers rather than abstentions.
      if (!section || typeof section !== "object") {
        ledger.drop(
          `${key}#${index}`,
          `section at index ${index} of view '${viewId}' is not a mapping — it is missing from ` +
            "sectionOrder, which shifts the positional ordinal of every section after it",
        );
        continue;
      }
      const { id, qualification, defaults, name } = section;
      if (typeof id !== "string" || typeof qualification !== "string") {
        ledger.drop(
          `${key}#${index}`,
          `section ${typeof id === "string" ? `'${id}'` : `at index ${index}`} of view ` +
            `'${viewId}' declares no ${typeof id === "string" ? "'qualification:'" : "'id:'"} — ` +
            "it is missing from sectionOrder, which shifts the positional ordinal of every " +
            "section after it",
        );
        continue;
      }
      const entry = { qualification, nodeType: viewNodeType };
      // THE OPERATOR'S OWN WORDS FOR THE SECTION, when the config declares one.
      if (typeof name === "string" && name !== "") entry.name = name;
      if (defaults && typeof defaults === "object" && !Array.isArray(defaults)) {
        const fixed = {};
        for (const [field, value] of Object.entries(defaults)) {
          if (!isScalar(value)) {
            throw new GenerationError(
              `${file}: section '${id}' defaults.${field} is not a scalar — this generator does ` +
                "not know what an unstamped line under it resolves to, and refuses to guess.",
            );
          }
          fixed[field] = value;
        }
        if (Object.keys(fixed).length > 0) entry.defaults = fixed;
      }
      sections[id] = entry;
      // THE FULL DECLARED ORDER, captured BEFORE the assembly step below drops any section whose
      // qualification was refused. This is what `sectionAt` (L3 ADDRESSING, `app/present/
      // address.ts`) indexes — never `Object.keys(sections[view])`.
      order.push(id);
    }
    if (Object.keys(sections).length > 0) {
      views[viewId] = sections;
      sectionOrder[viewId] = order;
    }
  }

  // ── 4. vocabulary/*.yaml -> the tokens that set a RESOLVABLE field ──────────────────────────
  // Collected across ALL vocabulary files rather than from three known filenames, so a new family
  // that starts setting one of these fields is picked up with no edit here.

  const tokens = {};
  for (const field of RESOLVABLE_FIELDS) tokens[field] = {};

  const vocabularyKeys = allKeys()
    .filter((k) => k.startsWith(VOCABULARY_PREFIX) && k.endsWith(".yaml"))
    .sort();
  for (const key of vocabularyKeys) {
    const document = readYaml(key);
    // DROP PATH 7. A whole vocabulary file, and every token in it.
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      ledger.drop(
        key,
        "the file did not parse into a mapping of family -> token list, so every token it " +
          "declares was skipped",
      );
      continue;
    }
    for (const [familyName, family] of Object.entries(document)) {
      // DROP PATH 8. A family declared as a mapping rather than a list.
      if (!Array.isArray(family)) {
        ledger.drop(
          `${key}#${familyName}`,
          `the '${familyName}:' family is not a list of token entries, so every token in it was ` +
            "skipped",
        );
        continue;
      }
      for (const [index, entry] of family.entries()) {
        // DROP PATH 9. An entry with no `token:` — there is nothing to key it by.
        if (!entry || typeof entry !== "object" || typeof entry.token !== "string") {
          ledger.drop(
            `${key}#${familyName}[${index}]`,
            "the entry declares no 'token:' string, so nothing could be keyed by it",
          );
          continue;
        }
        const what = `vocabulary token '${entry.token}'`;
        if (typeof entry.node_type === "string") {
          tokens.node_type[entry.token] = entry.node_type;
          continue;
        }
        // DROP PATH 10 — the largest of the sixteen: a token setting a field outside the three the
        // app can resolve for a line being typed.
        if (typeof entry.field === "string") {
          if (!RESOLVABLE_FIELDS.includes(entry.field)) {
            ledger.drop(
              what,
              `sets '${entry.field}', which is not one of the fields the app can resolve for a ` +
                `line being typed (${RESOLVABLE_FIELDS.join(", ")})`,
            );
            continue;
          }
          // DROP PATH 11. A resolvable field, set by a marker the engine itself refuses to ingest
          // from that glyph. Deliberate, and now stated rather than assumed.
          if (entry.render_only === true) {
            ledger.drop(
              what,
              `sets '${entry.field}' but is 'render_only: true' — a derived display value the ` +
                "engine never reads back from that glyph",
            );
            continue;
          }
          // DROP PATH 12. A resolvable field set to something that is not a fixed scalar.
          if (!isScalar(entry.value) || entry.value === null) {
            ledger.drop(
              what,
              `sets '${entry.field}' to ${JSON.stringify(entry.value ?? null)}, which is not a ` +
                "fixed scalar this generator can publish as token -> value",
            );
            continue;
          }
          tokens[entry.field][entry.token] = entry.value;
          continue;
        }
        // DROP PATH 13. A token that sets a field through a DIFFERENT key
        // (`parametric_field:` — a field declaration this loop never even looks at otherwise).
        if (entry.parametric_field && typeof entry.parametric_field === "object") {
          const field = entry.parametric_field.field;
          ledger.drop(
            what,
            `sets '${typeof field === "string" ? field : "an unnamed field"}' through ` +
              "'parametric_field:', a shape this generator does not read at all",
          );
          continue;
        }
        // Everything else — an edge tag, a deletion gesture, a structural token — declares no
        // field at all. There is nothing dropped, so nothing is recorded.
      }
    }
  }
  for (const field of RESOLVABLE_FIELDS) {
    if (Object.keys(tokens[field]).length === 0) {
      throw new GenerationError(
        `no vocabulary token sets '${field}' — the app resolves a line's ${field} from these ` +
          "tokens, so an empty map would make every answer a silent guess; refusing.",
      );
    }
  }

  // ── assemble ────────────────────────────────────────────────────────────────────────────────

  const referenced = new Set();
  for (const sections of Object.values(views)) {
    for (const section of Object.values(sections)) referenced.add(section.qualification);
  }

  const predicates = {};
  const refused = {};
  for (const name of [...referenced].sort()) {
    const raw = rawPatterns.get(name);
    if (raw === undefined) {
      throw new GenerationError(
        `section qualification '${name}' names a pattern that no file in patterns/ defines`,
      );
    }
    try {
      predicates[name] = normalisePattern(
        applyStructuralExclusionDefaults(raw.config, structuralTypes),
      );
    } catch (error) {
      if (!(error instanceof Refusal)) throw error;
      refused[name] = error.message;
    }
  }

  // A section whose qualification was refused is dropped entirely: the app must not hold a section
  // id it can say nothing about, because a present-but-empty entry is indistinguishable from a
  // decidable one that happened to match nothing.
  const sections = {};
  for (const [viewId, viewSections] of Object.entries(views)) {
    const kept = {};
    for (const [sectionId, section] of Object.entries(viewSections)) {
      if (section.qualification in predicates) {
        kept[sectionId] = section;
        // NOT A DROP: this is the KEEP branch.
        continue;
      }
      // DROP PATH 14. The section is IN `sectionOrder` (so addressing is unharmed) but out of
      // `sections`, so the app abstains for every line under it. The REASON is not restated here:
      // it is `refused['<qualification>']`, one copy.
      ledger.drop(`section '${viewId}.${sectionId}'`, `qualification refused: ${section.qualification}`);
    }
    if (Object.keys(kept).length > 0) sections[viewId] = kept;
  }

  const declaration = {
    defaultNodeType: globalNodeType,
    structuralNodeTypes: structuralTypes,
    tokens,
    predicates,
    sections,
    // The FULL declared order, per view — every section id, including the ones dropped from
    // `sections` above because their qualification was refused.
    sectionOrder,
    refused,
  };
  // EVERY DECLARATION THIS GENERATOR READ AND DID NOT PUBLISH, with its reason. `refused` above
  // is ONE kind of that — a pattern that would not normalise. `dropped` is all the others.
  const dropped = ledger.toJSON();
  return {
    declaration,
    dropped,
    // `design-the-runtime-compile.md` §8 step A — deterministic, content-derived, never a clock or
    // a counter. See `declaration-version.mjs` for what is hashed and why.
    version: versionKey({ declaration, dropped }),
  };
}

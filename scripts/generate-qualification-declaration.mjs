/**
 * generate-qualification-declaration — writes `presentation.json`'s `qualification` key FROM the
 * monorepo's own config, never by hand.
 *
 * ── THE QUESTION THIS ANSWERS ──
 *
 * A view's section decides MEMBERSHIP by a named `qualification` — a pattern. Type a line under
 * "Domain Empty" in `inbox.md` and one determinate question follows: after that edit, does this
 * line still belong in the section it is in? Today the operator learns the answer by running a
 * cycle. The answer is already implied by the declaration plus the line's own resolved fields, so
 * for a large part of the config the browser can say it immediately.
 *
 * ── WHAT A QUALIFICATION ACTUALLY RANGES OVER (measured, 2026-08-01) ──
 *
 * Across the operator's real config: 73 view files, 186 sections, 159 distinct qualifications,
 * 252 pattern definitions in 138 files. Classified by the machinery each definition needs:
 *
 *   122  root.find over NODE FIELDS ONLY, `steps: []`
 *     2  node fields + a self-referential exclusion step (`domain-empty`, `inbox-items`)
 *    27  EDGE-TRAVERSING (`children`/`parents`/`ancestors` + `exists`/`not_exists`)
 *     8  CLOCK-DEPENDENT (`$cycle_today` / `$cycle_week_end` compared against a date field)
 *     0  event-query patterns are referenced by any section
 *
 * So a qualification is NOT one thing. 124 of 159 are a predicate over the candidate node's OWN
 * fields and nothing else — decidable with no graph walk, no clock and no cycle. The other 35 are
 * not, and this generator publishes nothing about them. That split IS the answer: locality is a
 * property of the individual pattern, not of qualifications as a category.
 *
 * ── THE TWO STEP FORMS ARE ONE FORM ──
 *
 * `domain-empty` hand-authors `- not: [{find_nodes: {status: done}}]` with `min: 1`. Separately,
 * `bundle/pattern_structural_defaults.py` SYNTHESISES an exclusion at bundle load for every
 * schema-declared identity-unique node type, for any pattern whose `root.find` names no
 * `node_type` — and it emits that exclusion in the SAME shape. Over a single candidate node,
 * `qntm_graph.patterns.engine._evaluate_not` computes the bounded complement of `[candidate]`, and
 * `min: 1` then requires that complement to be non-empty. Both forms therefore reduce to exactly:
 * "the candidate does NOT match this find". One shape, one meaning, and this generator reproduces
 * the desugarer so the browser excludes structural chrome the way the engine does.
 *
 * ── WHAT IT REFUSES ──
 *
 * A pattern is published only when the whole of it normalises into the closed grammar below.
 * Anything else is recorded in `refused` WITH ITS REASON and no predicate is emitted, so a section
 * the browser cannot decide is a section the browser says nothing about. `newline.ts` takes the
 * same posture at its GLOBAL rung, for the same reason: both available guesses cost the operator
 * something.
 *
 *   find:     node_type (string | list of strings) + field predicates
 *   predicate: {eq: scalar|null}  |  {not: <predicate>}
 *   refused:  the orderable comparisons (gt/gte/lt/lte), any `$variable`, non-empty `parameters`,
 *             any step that is not `{not: [{find_nodes: <find>}], min: 1}`, any traversal step
 *
 * ── WHAT IT IS NOT ──
 *
 * It is not a second interpreter of the structural language, and it never decides anything the
 * engine then has to honour. The engine remains the only writer. What this publishes is READ by
 * the browser to DISPLAY a consequence of an edit already in flight; `app/present/membership.ts`
 * produces no `Contribution`, no `SourceEdit`, and nothing reaches a POST body.
 *
 * ── `sectionOrder` — THE ORDINAL→ID JOIN, published BESIDE `sections`, NEVER DERIVED FROM IT ──
 *
 * `sections` (above) is the PUBLISHED subset — one entry per section whose qualification survived
 * normalisation. `sectionOrder` is the FULL declared order — every section id `view.sections`
 * lists, in the order it lists them, with no filtering at all. The app's L3 ADDRESSING layer
 * (`app/present/address.ts`) counts headings positionally and indexes THIS list, because a section
 * still emits its heading even when its qualification was refused: `daily-work` publishes 1 of 5
 * sections and `daily-personal` 3 of 8, so indexing `sections`' own keys by ordinal would silently
 * misaddress every line under an unpublished section on the operator's two daily surfaces — the
 * exact trap `sectionOrder` exists to make impossible rather than merely avoided.
 *
 * ── USAGE ──
 *
 *   node scripts/generate-qualification-declaration.mjs                 write presentation.json
 *   node scripts/generate-qualification-declaration.mjs --check         diff only, exit 1 if stale
 *   node scripts/generate-qualification-declaration.mjs --config-dir X  override the config path
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseYamlSubset } from "./yaml-subset.mjs";
import { DEFAULT_CONFIG_DIR, REPO_ROOT } from "./monorepo-config.mjs";
import { Ledger, reportDropped } from "./ledger.mjs";

export { DEFAULT_CONFIG_DIR };

class GenerationError extends Error {}

/**
 * The only node fields `app/present/membership.ts` can resolve for a line the operator is typing:
 * the node type (registration default, or a type token on the line), the domain (a domain token),
 * and the status (the checkbox). Every one of the three is decided by something visible IN THE
 * LINE or by a registration default this file also publishes. A predicate that ranges outside this
 * set is published but is not answerable, and the app refuses it at read time rather than here —
 * the declaration stays a faithful record of the config either way.
 */
export const RESOLVABLE_FIELDS = Object.freeze(["node_type", "domain", "status"]);

const readYaml = (path) => parseYamlSubset(readFileSync(path, "utf8"), path);

// ── 1. schema.yaml -> the identity-unique (structural) node types ─────────────────────────────

function readStructuralNodeTypes(configDir) {
  const path = join(configDir, "schema.yaml");
  if (!existsSync(path)) throw new GenerationError(`${path} does not exist`);
  const schema = readYaml(path);
  const nodeTypes = schema?.node_types;
  if (!nodeTypes || typeof nodeTypes !== "object") {
    throw new GenerationError(`${path}: no 'node_types:' mapping`);
  }
  const unique = [];
  for (const [name, definition] of Object.entries(nodeTypes)) {
    const identity = definition && typeof definition === "object" ? definition.identity : null;
    if (identity && typeof identity === "object" && identity.unique === true) unique.push(name);
  }
  if (unique.length === 0) {
    throw new GenerationError(
      `${path}: no node type declares 'identity: {unique: true}' — the structural-exclusion ` +
        "desugarer this generator reproduces would be a no-op, which has never been true of this " +
        "config; refusing rather than publishing predicates that admit structural chrome.",
    );
  }
  return unique.sort();
}

// ── 2. patterns/*.yaml -> one merged pattern map ──────────────────────────────────────────────

function readPatterns(configDir, ledger) {
  const dir = join(configDir, "patterns");
  if (!existsSync(dir)) throw new GenerationError(`${dir} does not exist`);
  const merged = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort()) {
    const document = readYaml(join(dir, file));
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      // DROP PATH 1. Every pattern this file defines vanishes with it, and a section naming one of
      // them then throws "names a pattern that no file in patterns/ defines" — a true message
      // pointing at the wrong file. Recorded here so the real cause is named at the real place.
      ledger.drop(
        `patterns/${file}`,
        "the file did not parse into a mapping of pattern name -> definition, so every pattern " +
          "it defines was skipped",
      );
      continue;
    }
    for (const [name, config] of Object.entries(document)) {
      if (merged.has(name)) {
        throw new GenerationError(
          `pattern '${name}' is defined in two files (${merged.get(name).file} and ${file}) — ` +
            "the engine merges one dict, so a duplicate silently loses; refusing.",
        );
      }
      merged.set(name, { file, config });
    }
  }
  return merged;
}

/**
 * Reproduce `bundle/pattern_structural_defaults.py`: a pattern whose `root.find` names no
 * `node_type` gets one `{not: [{find_nodes: {node_type: T}}], min: 1}` step per identity-unique
 * type it does not already exclude. `include_structural: true` opts the whole pattern out.
 */
function applyStructuralExclusionDefaults(config, structuralTypes) {
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
      if (!step || typeof step !== "object") continue;
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

// ── 3. normalise a pattern into the closed local grammar, or refuse with a reason ──────────────

class Refusal extends Error {}
const refuse = (reason) => {
  throw new Refusal(reason);
};

const isScalar = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);

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
      continue;
    }
    fields[key] = normalisePredicate(value, key);
  }
  return { nodeType, fields };
}

/**
 * `{not: [{find_nodes: F}], min: 1}` over a single candidate is exactly "the candidate does not
 * match F" (see this file's header). Every other step form reaches beyond the node.
 */
function normaliseStep(step, index) {
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    refuse(`step ${index}: not a mapping`);
  }
  const keys = Object.keys(step).sort();
  if (keys.length !== 2 || keys[0] !== "min" || keys[1] !== "not") {
    refuse(`step ${index}: traverses (${keys.join("+")})`);
  }
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
  return normaliseFind(sub.find_nodes, `step ${index}.not[0].find_nodes`);
}

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
  const exclude = steps.map((step, i) => normaliseStep(step, i));

  // THE LAST REFUSAL, AND THE ONE THAT DECIDES WHAT SHIPS. A predicate can be perfectly local and
  // still be unanswerable, because the app has to resolve the LINE's fields before it can test
  // anything — and for a line the operator is typing it can resolve exactly three: the node type
  // (registration default, or a type token in the line), the domain (a domain token) and the
  // status (the checkbox). Each is decided by something visible in the line or by a default this
  // same file publishes. `project`, `title`, `cap_state` and the rest are not: they are set
  // elsewhere, or by an engine rule at mint time, and a browser that resolved them to "absent"
  // would answer confidently and wrongly. Withholding them here keeps ONE refusal boundary with
  // ONE legible record, instead of a predicate on the wire that the app must silently decline.
  const referencedFields = new Set();
  for (const clause of [find, ...exclude]) {
    for (const field of Object.keys(clause.fields)) referencedFields.add(field);
  }
  const unresolvable = [...referencedFields].filter((f) => !RESOLVABLE_FIELDS.includes(f)).sort();
  if (unresolvable.length > 0) {
    refuse(`unresolvable field(s): ${unresolvable.join("+")}`);
  }
  return { find, exclude };
}

// ── 4. views/*.yaml -> sections, with the registration cascade resolved ────────────────────────

function readViews(configDir, ledger) {
  const dir = join(configDir, "views");
  if (!existsSync(dir)) throw new GenerationError(`${dir} does not exist`);
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort();

  const registration = readYaml(join(dir, "default_registration.yaml"))?.default_registration;
  if (!registration || typeof registration !== "object") {
    throw new GenerationError(`${dir}/default_registration.yaml: no 'default_registration:' mapping`);
  }
  const globalNodeType = registration.default_node_type;
  if (typeof globalNodeType !== "string") {
    throw new GenerationError(
      `${dir}/default_registration.yaml: default_node_type is not a string — the GLOBAL rung of ` +
        "the registration cascade is what an unstamped line falls through to; refusing to guess it.",
    );
  }

  const views = {};
  const sectionOrder = {};
  for (const file of files) {
    if (file === "default_registration.yaml") continue;
    const document = readYaml(join(dir, file));
    // DROP PATHS 2-4. Each drops a WHOLE VIEW — every section it declares, out of both `sections`
    // and `sectionOrder`. `sectionOrder` is what L3 ADDRESSING indexes positionally, so a view
    // missing from it is a view whose every line is addressed by falling through to nothing.
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      ledger.drop(`views/${file}`, "the file did not parse into a mapping, so the whole view was skipped");
      continue;
    }
    const entries = Object.entries(document);
    if (entries.length !== 1) {
      ledger.drop(
        `views/${file}`,
        `the file declares ${entries.length} top-level keys (${Object.keys(document).join(", ")}) ` +
          "and this generator reads a view sheet as exactly one; the whole view was skipped",
      );
      continue;
    }
    const [viewId, view] = entries[0];
    if (!view || typeof view !== "object" || !Array.isArray(view.sections)) {
      ledger.drop(
        `views/${file}`,
        `view '${viewId}' declares no 'sections:' list, so the whole view was skipped`,
      );
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
      // confident wrong answers rather than abstentions. Neither path fires on the operator's
      // config today (measured 2026-08-01: 186 of 186 sections carry both keys); they are recorded
      // rather than merely guarded so that the day one does, the record names the heading.
      if (!section || typeof section !== "object") {
        ledger.drop(
          `views/${file}#${index}`,
          `section at index ${index} of view '${viewId}' is not a mapping — it is missing from ` +
            "sectionOrder, which shifts the positional ordinal of every section after it",
        );
        continue;
      }
      const { id, qualification, defaults, name } = section;
      if (typeof id !== "string" || typeof qualification !== "string") {
        ledger.drop(
          `views/${file}#${index}`,
          `section ${typeof id === "string" ? `'${id}'` : `at index ${index}`} of view ` +
            `'${viewId}' declares no ${typeof id === "string" ? "'qualification:'" : "'id:'"} — ` +
            "it is missing from sectionOrder, which shifts the positional ordinal of every " +
            "section after it",
        );
        continue;
      }
      const entry = { qualification, nodeType: viewNodeType };
      // THE OPERATOR'S OWN WORDS FOR THE SECTION, when the config declares one (185 of 186 do).
      // step 4 (design-the-resolution-architecture.md) needs a name to say — "this will leave
      // Domain Empty" reads Domain Empty off THIS, never off the id (`domain-empty`) it is keyed
      // by. Optional: `app/present/membership.ts` falls back to formatting the id when a section
      // is the one that has none, rather than refusing to answer over a missing decoration.
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
      // THE FULL DECLARED ORDER, captured BEFORE `generateQualification` drops any section whose
      // qualification was refused (see the `sections` assembly below). This is what `sectionAt`
      // (L3 ADDRESSING, `app/present/address.ts`) indexes — never `Object.keys(sections[view])`,
      // which is a proper SUBSET on `daily-work` (1 of 5 published) and `daily-personal` (3 of 8):
      // indexing the subset by ordinal silently misaddresses every line under an unpublished
      // section on the operator's two most-used daily surfaces.
      order.push(id);
    }
    if (Object.keys(sections).length > 0) {
      views[viewId] = sections;
      sectionOrder[viewId] = order;
    }
  }
  return { views, globalNodeType, sectionOrder };
}

// ── 5. vocabulary/*.yaml -> the tokens that set a RESOLVABLE field ─────────────────────────────

/**
 * Every token, from every vocabulary family, that sets `node_type`, `domain` or `status` to a
 * FIXED value. Collected across all families rather than from three known filenames, so a new
 * family that starts setting one of these fields is picked up with no edit here.
 */
function readTokens(configDir, ledger) {
  const dir = join(configDir, "vocabulary");
  if (!existsSync(dir)) throw new GenerationError(`${dir} does not exist`);
  const tokens = {};
  for (const field of RESOLVABLE_FIELDS) tokens[field] = {};

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort()) {
    const document = readYaml(join(dir, file));
    // DROP PATH 7. A whole vocabulary file, and every token in it.
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      ledger.drop(
        `vocabulary/${file}`,
        "the file did not parse into a mapping of family -> token list, so every token it " +
          "declares was skipped",
      );
      continue;
    }
    for (const [familyName, family] of Object.entries(document)) {
      // DROP PATH 8. A family declared as a mapping rather than a list.
      if (!Array.isArray(family)) {
        ledger.drop(
          `vocabulary/${file}#${familyName}`,
          `the '${familyName}:' family is not a list of token entries, so every token in it was ` +
            "skipped",
        );
        continue;
      }
      for (const [index, entry] of family.entries()) {
        // DROP PATH 9. An entry with no `token:` — there is nothing to key it by.
        if (!entry || typeof entry !== "object" || typeof entry.token !== "string") {
          ledger.drop(
            `vocabulary/${file}#${familyName}[${index}]`,
            "the entry declares no 'token:' string, so nothing could be keyed by it",
          );
          continue;
        }
        const what = `vocabulary token '${entry.token}'`;
        if (typeof entry.node_type === "string") {
          tokens.node_type[entry.token] = entry.node_type;
          continue;
        }
        // DROP PATH 10 — THE ONE design-the-rule-mirror.md §9.3 names, and the largest of the
        // sixteen: measured against the operator's live config on 2026-08-01, 73 of his tokens
        // set a field outside the three the app can resolve for a line being typed, and every one
        // of them left this loop with no `refused` entry, no warning and no exit code. Recorded
        // now, per token, keyed by the token he typed — so `#p1 -> priority: high`, added
        // tomorrow, is named in `dropped` rather than vanishing.
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
        // DROP PATH 13. A token that sets a field through a DIFFERENT key. `parametric_field:`
        // (4 tokens today, e.g. `#every-{n}{unit}` -> cadence) is a field declaration this loop
        // never even looks at, so an AST scan for `entry.field` would report it as "not a field
        // declaration" and move on. Named here because the operator wrote a field name and the
        // app says nothing about it, which is the same silence whichever key spells it.
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
        // field at all. There is nothing dropped, so nothing is recorded: a ledger that listed
        // every token on a different axis would be noise, and noise is what gets ignored.
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
  return tokens;
}

// ── assemble ─────────────────────────────────────────────────────────────────────────────────

export function generateQualification(configDir, ledger = new Ledger()) {
  const structuralTypes = readStructuralNodeTypes(configDir);
  const rawPatterns = readPatterns(configDir, ledger);
  const { views, globalNodeType, sectionOrder } = readViews(configDir, ledger);
  const tokens = readTokens(configDir, ledger);

  const referenced = new Set();
  for (const sections of Object.values(views)) {
    for (const section of Object.values(sections)) referenced.add(section.qualification);
  }

  const predicates = {};
  const refused = {};
  for (const name of [...referenced].sort()) {
    const raw = rawPatterns.get(name);
    if (raw === undefined) {
      // A section naming a pattern the registry has never heard of is a config defect, not a
      // locality question. Refuse the publish rather than ship a section the app silently skips.
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
        continue;
      }
      // DROP PATH 14. The section is IN `sectionOrder` (so addressing is unharmed) but out of
      // `sections`, so the app abstains for every line under it. `refused` already records WHY the
      // pattern would not normalise; what it never recorded is HOW MANY of the operator's own
      // headings that costs him. design-the-rule-mirror.md §9.2 measured 137 of 186 and could only
      // do so by running a script. It is now a fact the declaration states about itself.
      // The REASON is not restated here: it is `refused['<qualification>']`, one copy, and a
      // second copy of it in 137 entries would be 137 chances for the two to disagree.
      ledger.drop(`section '${viewId}.${sectionId}'`, `qualification refused: ${section.qualification}`);
    }
    if (Object.keys(kept).length > 0) sections[viewId] = kept;
  }

  return {
    defaultNodeType: globalNodeType,
    structuralNodeTypes: structuralTypes,
    tokens,
    predicates,
    sections,
    // The FULL declared order, per view — every section id, including the ones dropped from
    // `sections` above because their qualification was refused. See the capture site in
    // `readViews` for why this must never be re-derived from `sections`' own keys.
    sectionOrder,
    refused,
    // EVERY DECLARATION THIS GENERATOR READ AND DID NOT PUBLISH, with its reason. `refused` above
    // is ONE kind of that — a pattern that would not normalise. `dropped` is all the others, and
    // before it existed not one of them was recorded anywhere. See `scripts/ledger.mjs`.
    dropped: ledger.toJSON(),
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { check: false, configDir: DEFAULT_CONFIG_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--check") args.check = true;
    else if (argv[i] === "--config-dir") args.configDir = resolve(argv[++i]);
    else throw new GenerationError(`unknown flag: ${argv[i]}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.configDir)) {
    console.error(`config dir not found: ${args.configDir}`);
    console.error("(this is expected in CI, which does not check out the monorepo)");
    process.exit(3);
  }

  const ledger = new Ledger();
  const qualification = generateQualification(args.configDir, ledger);
  const presentationPath = join(REPO_ROOT, "presentation.json");
  const current = JSON.parse(readFileSync(presentationPath, "utf8"));

  if (args.check) {
    if (JSON.stringify(current.qualification) === JSON.stringify(qualification)) {
      console.log("presentation.json's 'qualification' key matches the monorepo config.");
      return;
    }
    console.error("presentation.json's 'qualification' key is STALE relative to the monorepo config.");
    // WHICH declaration went stale, when the answer is a drop. A `dropped` map that gained or lost
    // an entry means a config change either stopped reaching the browser or started reaching it,
    // and that is the sentence the operator needs — not "something differs".
    const before = current.qualification?.dropped ?? {};
    const after = qualification.dropped;
    for (const key of Object.keys(after)) {
      if (!(key in before)) console.error(`  NEWLY DROPPED  ${key}: ${after[key]}`);
    }
    for (const key of Object.keys(before)) {
      if (!(key in after)) console.error(`  NO LONGER DROPPED  ${key}`);
    }
    process.exit(1);
  }

  writeFileSync(presentationPath, JSON.stringify({ ...current, qualification }, null, 2) + "\n");
  const decidable = Object.keys(qualification.predicates).length;
  const refusedCount = Object.keys(qualification.refused).length;
  const sectionCount = Object.values(qualification.sections).reduce(
    (n, s) => n + Object.keys(s).length,
    0,
  );
  console.log(
    `wrote qualification declaration to ${presentationPath}\n` +
      `  ${decidable} patterns published, ${refusedCount} refused, ${sectionCount} sections covered`,
  );
  reportDropped("qualification", ledger);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(String(e?.message || e));
    process.exit(e instanceof GenerationError ? 2 : 1);
  });
}

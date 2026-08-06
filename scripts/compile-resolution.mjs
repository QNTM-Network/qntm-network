/**
 * compile-resolution — the PURE compile step for the resolution declaration, split out of
 * `generate-resolution-declaration.mjs` for the same reason `compile-structural.mjs` was split out
 * of `generate-structural-declaration.mjs` (`5d4f1b5`, PR #84) and `compile-qualification.mjs` out
 * of `generate-qualification-declaration.mjs` (`9be7f13`, PR #86): this module must be safe to
 * `import` inside a Cloudflare Worker isolate, and "the function is pure" is not the same claim as
 * "the file is safe to import in a Worker." Both prior ports found the same trap — a helper
 * computing a filesystem path at module top level, a Node idiom `wrangler`'s bundler does not
 * survive — the first time by crashing at Worker module load. This file is built to that finding
 * from the start: it imports only `yaml-subset.mjs` and `ledger.mjs`, both already zero-import, so
 * the Worker's module graph for the resolution route is exactly: this file, plus those two —
 * nothing Node-specific. `worker/src/config.js` imports `compile` from HERE, never from
 * `generate-resolution-declaration.mjs`, which keeps `node:fs`, `node:path` and
 * `monorepo-config.mjs` on the CLI side of the split where a Worker route never has to load them.
 *
 * ── WHAT MOVED HERE, VERBATIM OR NEAR IT ──
 *
 * Every piece of `generate-resolution-declaration.mjs` that never touched a filesystem path moved
 * unchanged: `readOrderingFields`, `readOrdering`, `orderingFieldNames`, `collectDefaultNodeType
 * Candidates`, `evaluateWhen`/`WhenRefusal`, `seedTokens`, `SEEDABLE_SHAPES`, `DIRECTIONS`,
 * `ORDERING_MODES`, `EXTRACTION_KINDS`, `FIELD_REF`, `CAPTURE_FIELDS_NOTE`. The nine `read*
 * (configDir, ...)` functions that DID read the filesystem directly (`readRegistration`,
 * `readLineGrammars`, `readDayBoundary`, `readChromeShapes`, `readViewFiles`, `readOrderingField
 * Markers`, `readFieldDefaults`, `readSpelling`, `readRetypeRules`) are rewritten as closures inside
 * one `compile(files, ledger)`, reading an in-memory files map instead of a directory — the same
 * has/get/allKeys shape `compile-structural.mjs` established and `compile-qualification.mjs` reused,
 * so a files map (an object from a POSTed JSON body, or a Map built by a caller) works without the
 * caller knowing which.
 *
 * ── WHAT CHANGED, NAMED SO IT IS NOT MISTAKEN FOR DRIFT ──
 *
 * Every LEDGER-DROP key (`node type 'header'`, `views/bar.yaml#2`, `ordering field 'due_date'`, …)
 * is byte-identical to what the original produced — `tests/declaration-drop.test.mjs` proves this,
 * unchanged, because a files-map key IS the same string the original derived from a directory read
 * plus a prefix. What changed is a small set of hard `GenerationError` messages that used to
 * interpolate an ABSOLUTE FILESYSTEM PATH (`${configDir}/schema.yaml does not exist`): those now
 * name the logical key instead (`schema.yaml does not exist`), the same move both prior ports made.
 * A second, equally inert change: the original threw a hard `GenerationError` if the whole `views/`
 * or `vocabulary/` DIRECTORY was absent (`existsSync(dir)` false); a flat files map has no directory
 * to check for, only keys, so that whole-directory guard is dropped in favour of the same posture
 * `compile-qualification.mjs` and `compile-structural.mjs` already take (filter the map's own keys,
 * no existence check on the prefix itself). This is not a silent widening: a files map with zero
 * `views/` keys still fails to compile, because `readRegistration` immediately requires
 * `views/default_registration.yaml` and throws when it is absent — the same net refusal, from a
 * different, still-named site. Checked directly, `grep -rn "does not exist" tests/` — no test pins
 * the old wording, so this is a real but inert change, not a risk to the refusal contract.
 *
 * ── WHAT DID NOT MOVE, AND WHY IT MATTERS MOST ──
 *
 * `seedTokens`, `evaluateWhen` and the retype-rule normaliser are unchanged in every way that
 * matters to what a new line becomes: none of them ever read a file, a files-map key, or a ledger
 * entry beyond what is passed in. `readRetypeRules`'s own directory-pair guard (`!existsSync
 * (rulesDir) || !existsSync(patternsDir)` -> `return []`) is replaced by the same "filter the map's
 * own keys" posture — for the fixture (no `rules/` tree at all) and the operator's real config
 * (`rules/` and `patterns/` both always present), the two are equivalent: zero `rules/`-prefixed
 * keys yields the same empty `[]` either way, with zero ledger drops, checked against both.
 */

import { parseYamlSubset } from "./yaml-subset.mjs";
import { Ledger } from "./ledger.mjs";
import { versionKey } from "./declaration-version.mjs";

export class GenerationError extends Error {}

const isScalar = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);
const isNonEmptyString = (v) => typeof v === "string" && v !== "";

// The fixed keys `compile`'s file map carries, plus the four prefixes every per-family file lives
// under. Named once so the pure function and any caller building a files map (the fs shell in
// `generate-resolution-declaration.mjs`, or a Worker route reading a POSTed body) agree on the
// exact same strings without restating them.
export const SCHEMA_KEY = "schema.yaml";
export const LINE_GRAMMARS_KEY = "line_grammars.yaml";
export const DAY_BOUNDARY_KEY = "day_boundary.yaml";
export const GLOBAL_DEFAULTS_KEY = "global_defaults.yaml";
export const VIEWS_PREFIX = "views/";
export const DEFAULT_REGISTRATION_KEY = `${VIEWS_PREFIX}default_registration.yaml`;
export const VOCABULARY_PREFIX = "vocabulary/";
export const MARKERS_KEY = `${VOCABULARY_PREFIX}markers.yaml`;
export const PATTERNS_PREFIX = "patterns/";
export const RULES_PREFIX = "rules/";

// The only two forms `app/present/newline.ts` knows how to seed. A type whose declared shape is
// anything else (`stat_line`, `heading`) is left OUT of the published map — see this generator's
// domain header (`generate-resolution-declaration.mjs`) for why that is a refusal and not an
// omission.
const SEEDABLE_SHAPES = new Set(["checkbox", "plain_line"]);

const DIRECTIONS = new Set(["asc", "desc"]);
const ORDERING_MODES = new Set(["pattern_default", "insertion_order"]);

// A section's `ordering:` names a FIELD; `vocabulary/markers.yaml`'s own `token`/`extraction_hint`
// pair says how its VALUE is spelled on a printed line. Restricted to hints an ordering preview can
// read a value from — see the domain header for the two kinds left out on purpose.
const EXTRACTION_KINDS = { trailing_date: "date", trailing_int: "int", trailing_float: "float" };

// ── THE DEFAULT ORDERING — a DECLARED value now, resolved like everything else ────────────────
//
// UNTIL THIS CHANGE, this file published `apps/qntm-md/src/qntm_md/render/section_builder.py:
// 26-37`'s `_DEFAULT_ORDERING`/`_PRIORITY_RANK` — a hardcoded (due_date, priority, title) tuple —
// as an "ENGINE FACT... true for every qntm-md instance", unconditionally, for every operator this
// app will ever serve. That was the defect: qntm.network lets an operator declare their OWN node
// types and fields, and "everything else... and ordering" (the operator's own words). A user with
// no `due_date` and no `priority` in their vocabulary got a GLOBAL default naming fields that do
// not exist for them — the one rung of the resolution cascade (GLOBAL -> VIEW -> STRUCTURAL_NODE
// -> LINE) that answered for every user identically, whether or not it made sense for them.
//
// `readGlobalDefaultOrdering` below reads `global_defaults.yaml`'s own `default_ordering:` /
// `priority_rank:` keys (GLOBAL_DEFAULTS_KEY) — the same file, and the same GLOBAL layer, that
// already carries `defaults:` (config-root field defaults) and `node_defaults_cascade:`. A
// per-operator config can now say what its own floor sorts by; this file no longer decides that
// for anyone.
//
// ── THE FALLBACK, AND WHY IT IS VISIBLE RATHER THAN SILENT ──
//
// `apps/qntm-md/config/` is read-only from this repo, and the ENGINE (`section_builder.py`) still
// hardcodes `_DEFAULT_ORDERING`/`_PRIORITY_RANK` — see this file's own report for why that half of
// the fix is out of scope here. So the operator's real config declares nothing yet, and a compile
// against it must not go dark: `readGlobalDefaultOrdering` falls back to
// `ENGINE_LITERAL_DEFAULT_ORDERING`/`ENGINE_LITERAL_PRIORITY_RANK` below — the exact tuple the
// engine hardcodes, reproducing today's behaviour byte for byte — but records WHICH path answered
// as `resolution.defaultOrderingSource` (`"config"` or `"engine-fallback"`), published alongside
// `defaultOrdering`/`priorityRank`. Three options were open here: fail the compile loudly when
// nothing is declared (breaks every deploy until the operator's own config change lands, for a
// floor 171 of 186 of his own sections rely on); publish nothing (the same defect this change
// exists to fix, now silent about EVERY vault rather than one); or fall back with the fallback
// recorded. The third is what ships — a fallback nobody can see is how the literal survived this
// long, so the one thing this compiler refuses to do is answer without saying which answer it gave.
export const ENGINE_LITERAL_DEFAULT_ORDERING = Object.freeze([
  Object.freeze({ field: "due_date", direction: "asc" }),
  Object.freeze({ field: "priority", direction: "desc" }),
  Object.freeze({ field: "title", direction: "asc" }),
]);

// Mirrors section_builder.py:31-37 (`_PRIORITY_RANK`) verbatim — the same fallback posture as
// `ENGINE_LITERAL_DEFAULT_ORDERING` above. FOUR NUMBERS FOR FIVE NAMES, not simplified to five:
// `normal` and `medium` really do share rank 2 in the engine's own dict.
export const ENGINE_LITERAL_PRIORITY_RANK = Object.freeze({ urgent: 4, high: 3, normal: 2, medium: 2, low: 1 });

// ── COMPOSITION — the SECOND direction of a line grammar, and why it is not in `lineGrammars` ──
//
// `line_grammars.yaml` declares RECOGNITION — what a whole LINE may look like, at parse-boundary
// granularity (blank / fenced-code-delimiter / heading-prefix). Its own header says the emit
// direction is NOT shape-driven: "render/renderer.py composes a body line's `- ` bullet ... directly"
// — a composition row added there would load clean and read by nothing. So this is a DIFFERENT
// fact at a DIFFERENT granularity: given a body line already recognised as checkbox / plain_line,
// WHERE each CELL goes — the checkbox glyph, the title, the `[[qntm:N]]` stamp, the tags, the
// markers, the outgoing-edge chrome.
//
// UNTIL THIS CHANGE, this file published `renderer.py`'s own `_COMPOSITION_HEADS`/
// `_COMPOSITION_TAIL` as an unconditional literal, with the comment right here saying "there is NO
// config surface for this at all". That was true of the ENGINE the day it was written, and stopped
// being true the moment monorepo PR #72 (`bc3aa01`, "The engine reads composition from config, not
// just its own copy") gave `global_defaults.yaml` its own `composition:` key, validated at load
// time by `bundle/loader.py`'s `_validate_global_composition` and threaded into every render call
// site — that PR's own body named the asymmetry it was opening: the ENGINE would honour a declared
// composition and the BROWSER would keep publishing the old literal regardless, silently disagreeing
// the moment anyone declared one that actually differs. `readGlobalComposition` below closes it,
// mirroring `readGlobalDefaultOrdering`'s own visible-fallback discipline exactly: absence falls
// back to `ENGINE_LITERAL_COMPOSITION`, recorded as `compositionSource: "engine-fallback"`; a
// declared `composition:` is read, validated against the SAME shape `_validate_global_composition`
// enforces (a non-empty `heads:` mapping naming both `checkbox` and `plain_line`, each a non-empty
// list drawn only from `checkbox`/`title`; a non-empty `tail:` list drawn only from `stamp`/`date`/
// `tags`/`markers`/`chrome`), and published verbatim as `compositionSource: "config"`. A PRESENT
// but malformed declaration is a hard `GenerationError`, never a silent fallback — the engine's own
// posture, reproduced rather than relaxed. `separator` is not a declared key on either side: the
// engine always joins with `" "` (renderer.py:1003's `" ".join`, unchanged by PR #72), so this
// generator always publishes `separator: " "` regardless of source.
//
// Read LIVE off `apps/qntm-md/src/qntm_md/render/renderer.py`:
//   `_field_expression_cells` (renderer.py:1138-1194) — the ONE tail every shape emits:
//     stamp (`qntm_id_cell`), then date (`date_cell` — ALWAYS "" today, the dissolved 2026-05-30
//     #35 path; `due_date` now round-trips through the marker path like any other marker field,
//     kept here for faithfulness to the real function shape, not tidiness), then tags, then
//     markers, then outgoing-edge chrome.
//   `_emit_checkbox_shape` (renderer.py:1197-1225) — HEAD = [checkbox, title], then the tail above.
//   `_emit_plain_line_shape` (renderer.py:1267-1290) — HEAD = [title], then the tail above.
//   (`stat_line`'s HEAD is one FUSED `title: value` cell composed by
//   `grammar.node_type_form.compose_stat_line_head` — never spelled here — and is not published
//   below because `SEEDABLE_SHAPES` above already excludes it from anything this app composes.)
//   The whole line (renderer.py:1003): `"    " * depth + "- " + " ".join(cell for cell in cells if cell)`
//   — 4 spaces per depth level, a literal `- ` bullet, every non-empty cell joined by one space.
//
// Pinned against a LIVE import of that renderer by `scripts/composition-agreement.py` (the same
// discipline `resolution-agreement.py` established for `defaultOrdering`/`priorityRank`) — see
// `tests/composition-agreement.test.mjs` for the second, independent half: it recomposes
// `tests/fixtures/composition-agreement.json`'s own cell values through
// `app/present/express/composition.ts`'s `composeLine`, using ONLY this declared order, and
// asserts the result against that fixture's `expectedLine` — the engine's own committed output.
// That fixture is generated against the ENGINE-FALLBACK literal (no monorepo config declares
// `composition:` yet), so it does not exercise `readGlobalComposition`'s "config" branch —
// `tests/resolution-declared-composition.test.mjs` is where that branch is proven, the same split
// `tests/resolution-declared-default-ordering.test.mjs` already draws for `defaultOrdering`.
export const ENGINE_LITERAL_COMPOSITION = Object.freeze({
  heads: Object.freeze({
    checkbox: Object.freeze(["checkbox", "title"]),
    plain_line: Object.freeze(["title"]),
  }),
  tail: Object.freeze(["stamp", "date", "tags", "markers", "chrome"]),
  separator: " ",
});

// The cell-class vocabulary a declared `composition:` may use — mirrors `bundle/loader.py`'s own
// `_COMPOSITION_REQUIRED_HEAD_SHAPES` / `_COMPOSITION_HEAD_CELL_CLASSES` /
// `_COMPOSITION_TAIL_CELL_CLASSES` (monorepo, read-only) field for field. Kept as data here, the
// same posture `EXTRACTION_HINT_KINDS`-style tables in this file already take, so a shape check is
// "is this string in the set", never a decision this compiler makes about what a cell class MEANS.
const COMPOSITION_REQUIRED_HEAD_SHAPES = ["checkbox", "plain_line"];
const COMPOSITION_HEAD_CELL_CLASSES = new Set(["checkbox", "title"]);
const COMPOSITION_TAIL_CELL_CLASSES = new Set(["stamp", "date", "tags", "markers", "chrome"]);

const CAPTURE_FIELDS_NOTE =
  "a new line carries its resolved node type, the schema's declared field defaults and its " +
  "section's own 'defaults:' block, and nothing else";

/** `$current.node.fields.X` -> `X`, and nothing else is a field reference this reader accepts. */
const FIELD_REF = /^\$current\.node\.fields\.([A-Za-z_][A-Za-z0-9_]*)$/;

class WhenRefusal extends Error {}

/**
 * One `when:` clause, normalised into a predicate over a bare capture's own fields, or refused.
 * PURE — no file, no files-map key, no ledger; unchanged by this file's existence.
 */
function evaluateWhen(when, fields) {
  if (when === null || when === undefined) return true;
  if (!when || typeof when !== "object" || Array.isArray(when)) {
    throw new WhenRefusal(`'when:' is ${Array.isArray(when) ? "a list" : typeof when}, not a clause`);
  }
  const keys = Object.keys(when);
  if (keys.length !== 1) throw new WhenRefusal(`'when:' carries ${keys.length} operators`);
  const [operator] = keys;
  const operand = when[operator];
  if (operator === "not") {
    const list = Array.isArray(operand) ? operand : [operand];
    if (list.length !== 1) throw new WhenRefusal("'not:' is not a single clause");
    return !evaluateWhen(list[0], fields);
  }
  if (operator === "null") {
    const list = Array.isArray(operand) ? operand : [operand];
    if (list.length !== 1 || typeof list[0] !== "string") {
      throw new WhenRefusal("'null:' is not a single reference");
    }
    const match = FIELD_REF.exec(list[0]);
    if (match === null) throw new WhenRefusal(`'null:' reads ${list[0]}, not one of the node's fields`);
    return fields[match[1]] === undefined || fields[match[1]] === null;
  }
  if (operator === "eq") {
    if (!Array.isArray(operand) || operand.length !== 2 || !operand.every(isScalar)) {
      throw new WhenRefusal("'eq:' is not two literal scalars");
    }
    if (operand.some((v) => typeof v === "string" && v.startsWith("$"))) {
      throw new WhenRefusal("'eq:' reads a cycle variable");
    }
    return operand[0] === operand[1];
  }
  throw new WhenRefusal(`operator '${operator}'`);
}

/**
 * The seed for one section: the tokens the engine would print for the node it would mint here.
 * PURE — unchanged by this file's existence; see the domain header for the full argument.
 */
function seedTokens(what, nodeType, defaults, fieldDefaults, spelling, retypeRules, ledger) {
  const fields = { node_type: nodeType, ...fieldDefaults, ...defaults };
  const tokens = [];

  let retypedBy = null;
  for (const rule of retypeRules) {
    // NOT A DROP: loop control. A rule that retypes TO the type this section already resolves
    // changes nothing about this line, so it is not a retype here at all.
    if (rule.becomes === nodeType) continue;
    const binds = Object.entries(rule.find).every(([field, value]) =>
      field === "node_type" ? value === nodeType : (fields[field] ?? null) === value,
    );
    // NOT A DROP: loop control. The rule's own pattern does not select this section's capture, so
    // there is no declaration of the operator's being discarded — the rule simply does not apply.
    if (!binds) continue;
    let fires;
    try {
      fires = evaluateWhen(rule.when, fields);
    } catch (error) {
      if (!(error instanceof WhenRefusal)) throw error;
      ledger.drop(rule.what, `${error.message}, so whether it retypes a new line was not evaluated`);
      continue;
    }
    if (fires) retypedBy = rule;
  }

  const typeToken = spelling.typeTokens[nodeType];
  if (retypedBy !== null) {
    // DROP PATH 19. design-the-rule-mirror.md §3.3, derived rather than named: the registration
    // answer is contradicted by a rule inside the same pass that minted the line.
    ledger.drop(
      what,
      `its type tag is not seeded — rule '${retypedBy.id}' retypes a '${nodeType}' to ` +
        `'${retypedBy.becomes}' for a line whose fields it matches, and ${CAPTURE_FIELDS_NOTE}`,
    );
  } else if (typeToken === undefined) {
    // DROP PATH 20. A resolved node type no vocabulary tag spells. The engine prints no type tag
    // for it either, so the absence is agreement, and it is still worth stating.
    ledger.drop(what, `no vocabulary tag spells the node type '${nodeType}', so none is seeded`);
  } else {
    tokens.push(typeToken);
  }

  for (const field of spelling.fieldOrder) {
    if (!Object.prototype.hasOwnProperty.call(defaults, field)) continue;
    const token = spelling.fieldTokens[field]?.[String(defaults[field])];
    if (token !== undefined) tokens.push(token);
  }
  for (const [field, value] of Object.entries(defaults)) {
    if (spelling.fieldTokens[field]?.[String(value)] !== undefined) continue;
    // DROP PATH 21. A declared default no vocabulary tag spells. The engine does not print it
    // either, so seeding one would invent a spelling and freeze a value the engine goes on
    // deciding — see the domain header on `INPUT WINS`.
    ledger.drop(
      `${what} default '${field}'`,
      `no vocabulary tag spells ${field}=${JSON.stringify(value)}, so it cannot be written into a ` +
        "line the operator types (the engine prints no tag for it either)",
    );
  }
  return tokens;
}

function readOrderingFields(section, where) {
  const fields = {};
  if ("ordering" in section) {
    const ordering = section.ordering;
    if (!Array.isArray(ordering) || ordering.length === 0) {
      throw new GenerationError(`${where}.ordering is not a non-empty list`);
    }
    fields.ordering = ordering.map((entry, i) => {
      if (!entry || typeof entry !== "object") {
        throw new GenerationError(`${where}.ordering[${i}] is not a mapping`);
      }
      const { field, direction } = entry;
      if (!isNonEmptyString(field)) {
        throw new GenerationError(`${where}.ordering[${i}].field is not a string`);
      }
      if (!DIRECTIONS.has(direction)) {
        throw new GenerationError(
          `${where}.ordering[${i}].direction is '${direction}', not one of ${[...DIRECTIONS].join("/")}`,
        );
      }
      return { field, direction };
    });
  }
  if ("ordering_mode" in section) {
    const mode = section.ordering_mode;
    if (!ORDERING_MODES.has(mode)) {
      throw new GenerationError(
        `${where}.ordering_mode is '${mode}', not one of ${[...ORDERING_MODES].join("/")}`,
      );
    }
    fields.orderingMode = mode;
  }
  return fields;
}

function readOrdering(viewFiles, ledger) {
  const out = {};
  for (const [file, view] of viewFiles) {
    const sections = {};
    for (const [index, section] of view.sections.entries()) {
      // DROP PATH 7. A section with no readable `id:` — its `ordering:` is unpublishable because
      // there is no key to publish it under, and until now nothing said the ordering was lost.
      if (!section || typeof section !== "object" || typeof section.id !== "string") {
        ledger.drop(
          `views/${file}#${index}`,
          `section at index ${index} of view '${view.viewId}' has no readable 'id:', so any ` +
            "ordering it declares could not be published under any key",
        );
        continue;
      }
      const fields = readOrderingFields(section, `${file}: section '${section.id}'`);
      if (Object.keys(fields).length === 0) continue;
      // THE OPERATOR'S OWN WORDS FOR THE SECTION — see the domain header.
      if (typeof section.name === "string" && section.name !== "") fields.name = section.name;
      sections[section.id] = fields;
    }
    if (Object.keys(sections).length > 0) out[view.viewId] = sections;
  }
  return out;
}

function orderingFieldNames(ordering) {
  const names = new Set();
  for (const sections of Object.values(ordering)) {
    for (const section of Object.values(sections)) {
      for (const key of section.ordering ?? []) names.add(key.field);
    }
  }
  return names;
}

function collectDefaultNodeTypeCandidates(registration, viewFiles) {
  const types = new Set([registration.defaultNodeType]);
  for (const [, view] of viewFiles) {
    if (typeof view.default_node_type === "string") types.add(view.default_node_type);
  }
  return [...types].sort();
}

// ── the pure compile — `design-the-runtime-compile.md` step C's own contract ───────────────────

/**
 * Compile the resolution declaration from an in-memory config tree. PURE: no filesystem, no
 * command line, no clock, no randomness — and, like `compile-structural.mjs` and
 * `compile-qualification.mjs`, no import that is not itself as pure as this one. The same function
 * runs identically in the CLI shell (`generate-resolution-declaration.mjs`) and in the Worker's
 * Gate-1 route (`worker/src/config.js`).
 *
 * @param {Record<string, string> | Map<string, string>} files path -> file contents. Recognised
 *   keys: `"schema.yaml"`, `"line_grammars.yaml"`, `"day_boundary.yaml"`, every `"views/<name>.yaml"`
 *   (including `"views/default_registration.yaml"`), `"vocabulary/markers.yaml"`, every other
 *   `"vocabulary/<name>.yaml"`, every `"patterns/<name>.yaml"` and every `"rules/<name>.yaml"`.
 *   Paths use `/` regardless of platform — this is a logical tree, not a filesystem one.
 * @param {Ledger} ledger
 * @returns {{declaration: object, dropped: object}}
 */
export function compile(files, ledger = new Ledger()) {
  const isMap = files instanceof Map;
  const has = (key) => (isMap ? files.has(key) : Object.prototype.hasOwnProperty.call(files, key));
  const get = (key) => (isMap ? files.get(key) : files[key]);
  const allKeys = () => (isMap ? [...files.keys()] : Object.keys(files));
  const readYaml = (key) => parseYamlSubset(get(key), key);

  // ── 1. views/*.yaml -> read once, shared by readRegistration's guard and readOrdering ─────────

  function readViewFiles() {
    const out = [];
    const viewKeys = allKeys().filter((k) => k.startsWith(VIEWS_PREFIX) && k.endsWith(".yaml")).sort();
    for (const key of viewKeys) {
      const file = key.slice(VIEWS_PREFIX.length);
      // NOT A DROP: default_registration.yaml is read separately, by readRegistration.
      if (file === "default_registration.yaml") continue;
      const document = readYaml(key);
      // DROP PATHS 4-6, AND THEY COST MORE HERE THAN ANYWHERE ELSE. See the domain header.
      if (!document || typeof document !== "object" || Array.isArray(document)) {
        ledger.drop(
          `views/${file}`,
          "the file did not parse into a mapping, so its ordering and its registration overrides " +
            "were neither published nor checked",
        );
        continue;
      }
      const entries = Object.entries(document);
      if (entries.length !== 1) {
        ledger.drop(
          `views/${file}`,
          `the file declares ${entries.length} top-level keys (${Object.keys(document).join(", ")}) ` +
            "and this generator reads a view sheet as exactly one; its ordering and its " +
            "registration overrides were neither published nor checked",
        );
        continue;
      }
      const [viewId, view] = entries[0];
      if (!view || typeof view !== "object" || !Array.isArray(view.sections)) {
        ledger.drop(
          `views/${file}`,
          `view '${viewId}' declares no 'sections:' list, so its ordering and its registration ` +
            "overrides were neither published nor checked",
        );
        continue;
      }
      out.push([file, { viewId, ...view }]);
    }
    return out;
  }

  // ── 2. default_registration.yaml -> the GLOBAL registration keys, and the two names for one key ─

  function readRegistration(viewFiles) {
    if (!has(DEFAULT_REGISTRATION_KEY)) {
      throw new GenerationError(`${DEFAULT_REGISTRATION_KEY} does not exist`);
    }
    const declared = readYaml(DEFAULT_REGISTRATION_KEY)?.default_registration;
    if (!declared || typeof declared !== "object") {
      throw new GenerationError(`${DEFAULT_REGISTRATION_KEY}: no 'default_registration:' mapping`);
    }
    const { default_node_type: defaultNodeType, input_grammar: inputGrammar, default_tags } = declared;
    if (!isNonEmptyString(defaultNodeType)) {
      throw new GenerationError(`${DEFAULT_REGISTRATION_KEY}: default_node_type is not a non-empty string`);
    }
    if (!isNonEmptyString(inputGrammar)) {
      throw new GenerationError(`${DEFAULT_REGISTRATION_KEY}: input_grammar is not a non-empty string`);
    }
    const defaultTags = default_tags === undefined || default_tags === null ? [] : default_tags;
    if (!Array.isArray(defaultTags) || !defaultTags.every((t) => typeof t === "string")) {
      throw new GenerationError(`${DEFAULT_REGISTRATION_KEY}: default_tags is not a list of strings`);
    }

    // resolution/registration.py's LEVELS_FOR grants INPUT_GRAMMAR and DEFAULT_TAGS three levels
    // (GLOBAL, VIEW, STRUCTURAL_NODE) — the same table DEFAULT_NODE_TYPE uses. Publishing a single
    // GLOBAL value for either is only correct while no sheet ever overrides it. Checked here, on
    // every compile, rather than assumed: a sheet that starts declaring `input_grammar:` or
    // `default_tags:` must fail this generator loudly, not silently keep shipping the stale GLOBAL
    // value.
    for (const [file, view] of viewFiles) {
      // NOT A DROP: default_registration.yaml IS the global declaration this guard compares against.
      if (file === "default_registration.yaml") continue;
      if ("input_grammar" in view) {
        throw new GenerationError(
          `${file}: declares 'input_grammar' — this generator publishes a single GLOBAL value and ` +
            "does not yet resolve the VIEW/STRUCTURAL_NODE levels registration.py's own table grants " +
            "this key; refusing to publish a stale GLOBAL answer for a view that overrides it.",
        );
      }
      if ("default_tags" in view) {
        throw new GenerationError(
          `${file}: declares 'default_tags' — same refusal as 'input_grammar' above, same reason.`,
        );
      }
      for (const section of Array.isArray(view.sections) ? view.sections : []) {
        // NOT A DROP: a non-mapping section cannot declare input_grammar or default_tags, so nothing is lost.
        if (!section || typeof section !== "object") continue;
        if ("input_grammar" in section || "default_tags" in section) {
          throw new GenerationError(
            `${file}: section '${section.id}' declares 'input_grammar' or 'default_tags' at the ` +
              "STRUCTURAL_NODE level — this generator does not resolve that level; refusing.",
          );
        }
      }
    }

    return {
      defaultNodeType,
      // BASE_NODE_TYPE — see the domain header for the full argument.
      baseNodeType: defaultNodeType,
      inputGrammar,
      defaultTags,
    };
  }

  // ── 3. line_grammars.yaml -> grammar name -> admitted shape names ─────────────────────────────

  function readLineGrammars() {
    if (!has(LINE_GRAMMARS_KEY)) throw new GenerationError(`${LINE_GRAMMARS_KEY} does not exist`);
    const grammars = readYaml(LINE_GRAMMARS_KEY)?.line_grammars?.grammars;
    if (!grammars || typeof grammars !== "object" || Array.isArray(grammars)) {
      throw new GenerationError(`${LINE_GRAMMARS_KEY}: no 'line_grammars.grammars' mapping`);
    }
    const out = {};
    for (const [name, shapes] of Object.entries(grammars)) {
      if (!Array.isArray(shapes) || !shapes.every((s) => typeof s === "string")) {
        throw new GenerationError(`${LINE_GRAMMARS_KEY}: grammars.${name} is not a list of shape names`);
      }
      out[name] = [...shapes];
    }
    if (Object.keys(out).length === 0) {
      throw new GenerationError(`${LINE_GRAMMARS_KEY}: 'grammars:' yielded no entries`);
    }
    return out;
  }

  // ── 4. day_boundary.yaml -> the three keys, verbatim ───────────────────────────────────────────

  function readDayBoundary() {
    if (!has(DAY_BOUNDARY_KEY)) throw new GenerationError(`${DAY_BOUNDARY_KEY} does not exist`);
    const declared = readYaml(DAY_BOUNDARY_KEY)?.day_boundary;
    if (!declared || typeof declared !== "object") {
      throw new GenerationError(`${DAY_BOUNDARY_KEY}: no 'day_boundary:' mapping`);
    }
    const { timezone, day_start_hour: dayStartHour, week_starts_on: weekStartsOn } = declared;
    if (!isNonEmptyString(timezone)) throw new GenerationError(`${DAY_BOUNDARY_KEY}: timezone is not a string`);
    if (!Number.isInteger(dayStartHour) || dayStartHour < 0 || dayStartHour > 23) {
      throw new GenerationError(`${DAY_BOUNDARY_KEY}: day_start_hour is not an integer 0..23`);
    }
    if (!isNonEmptyString(weekStartsOn)) {
      throw new GenerationError(`${DAY_BOUNDARY_KEY}: week_starts_on is not a string`);
    }
    return { timezone, dayStartHour, weekStartsOn };
  }

  // ── 4b. global_defaults.yaml -> default_ordering / priority_rank, or the engine's fallback ─────
  //
  // See this file's own domain header ("THE DEFAULT ORDERING") for the full account. NO FIELD NAME
  // drives any decision in this function — `default_ordering:`'s entries are read the identical way
  // a section's own `ordering:` is (`readOrderingFields` above), whatever fields the operator's
  // config happens to name. A missing `global_defaults.yaml`, or one present but silent on
  // `default_ordering:`, is "not declared" — the fallback branch — not an error: the GLOBAL layer is
  // opt-in everywhere else in this file (`defaults: {}` is the documented default in
  // `global_defaults.yaml` itself), and this key is no exception.
  function readGlobalDefaultOrdering() {
    const declared = has(GLOBAL_DEFAULTS_KEY) ? readYaml(GLOBAL_DEFAULTS_KEY) : undefined;
    const hasOwn = declared && typeof declared === "object" && !Array.isArray(declared)
      && Object.prototype.hasOwnProperty.call(declared, "default_ordering");
    if (!hasOwn) {
      return {
        ordering: ENGINE_LITERAL_DEFAULT_ORDERING,
        priorityRank: ENGINE_LITERAL_PRIORITY_RANK,
        source: "engine-fallback",
      };
    }
    const rawOrdering = declared.default_ordering;
    if (!Array.isArray(rawOrdering) || rawOrdering.length === 0) {
      throw new GenerationError(`${GLOBAL_DEFAULTS_KEY}: 'default_ordering:' is not a non-empty list`);
    }
    const ordering = rawOrdering.map((entry, i) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new GenerationError(`${GLOBAL_DEFAULTS_KEY}: default_ordering[${i}] is not a mapping`);
      }
      const { field, direction } = entry;
      if (!isNonEmptyString(field)) {
        throw new GenerationError(`${GLOBAL_DEFAULTS_KEY}: default_ordering[${i}].field is not a string`);
      }
      if (!DIRECTIONS.has(direction)) {
        throw new GenerationError(
          `${GLOBAL_DEFAULTS_KEY}: default_ordering[${i}].direction is '${direction}', not one of ` +
            `${[...DIRECTIONS].join("/")}`,
        );
      }
      return { field, direction };
    });

    let priorityRank = {};
    if (Object.prototype.hasOwnProperty.call(declared, "priority_rank")) {
      const rawRank = declared.priority_rank;
      if (!rawRank || typeof rawRank !== "object" || Array.isArray(rawRank)) {
        throw new GenerationError(`${GLOBAL_DEFAULTS_KEY}: 'priority_rank:' is not a mapping`);
      }
      priorityRank = {};
      for (const [name, rank] of Object.entries(rawRank)) {
        if (!Number.isInteger(rank) || rank < 1) {
          throw new GenerationError(`${GLOBAL_DEFAULTS_KEY}: priority_rank.${name} is not a positive integer`);
        }
        priorityRank[name] = rank;
      }
    }
    return { ordering, priorityRank, source: "config" };
  }

  // ── 4c. global_defaults.yaml -> composition.heads / composition.tail, or the engine's fallback ─
  //
  // Mirrors `readGlobalDefaultOrdering` immediately above — same file, same GLOBAL layer, same
  // visible-fallback discipline (absence is opt-out; a present-but-malformed declaration is a hard
  // `GenerationError`, never a silent guess). See this file's own domain header ("COMPOSITION") for
  // why this key exists at all and the monorepo PR that opened the asymmetry it closes. Unlike
  // `readGlobalDefaultOrdering`, the shape here is fixed rather than open — a cell class is drawn
  // from the SAME closed seven-member alphabet `ENGINE_LITERAL_COMPOSITION` already uses
  // (`COMPOSITION_HEAD_CELL_CLASSES`/`COMPOSITION_TAIL_CELL_CLASSES`, above), because composition
  // orders CLASSES OF CELL the engine itself defines, never an operator's own field or token name —
  // the same "no field name drives this" property `readGlobalDefaultOrdering` states for a
  // different reason (there, any field name is admitted; here, no field name is ever read at all).
  function readGlobalComposition() {
    const declared = has(GLOBAL_DEFAULTS_KEY) ? readYaml(GLOBAL_DEFAULTS_KEY) : undefined;
    const hasOwn = declared && typeof declared === "object" && !Array.isArray(declared)
      && Object.prototype.hasOwnProperty.call(declared, "composition");
    if (!hasOwn) {
      return { composition: ENGINE_LITERAL_COMPOSITION, source: "engine-fallback" };
    }
    const raw = declared.composition;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new GenerationError(`${GLOBAL_DEFAULTS_KEY}: 'composition:' is not a mapping`);
    }
    const rawHeads = raw.heads;
    if (!rawHeads || typeof rawHeads !== "object" || Array.isArray(rawHeads) || Object.keys(rawHeads).length === 0) {
      throw new GenerationError(`${GLOBAL_DEFAULTS_KEY}: 'composition.heads:' is not a non-empty mapping`);
    }
    const missingShapes = COMPOSITION_REQUIRED_HEAD_SHAPES.filter(
      (shape) => !Object.prototype.hasOwnProperty.call(rawHeads, shape),
    );
    if (missingShapes.length > 0) {
      throw new GenerationError(
        `${GLOBAL_DEFAULTS_KEY}: 'composition.heads:' is missing required shape(s) ` +
          `${JSON.stringify(missingShapes)}`,
      );
    }
    const heads = {};
    for (const [shape, cells] of Object.entries(rawHeads)) {
      if (!Array.isArray(cells) || cells.length === 0 || !cells.every((c) => typeof c === "string")) {
        throw new GenerationError(
          `${GLOBAL_DEFAULTS_KEY}: 'composition.heads.${shape}:' is not a non-empty list of strings`,
        );
      }
      const unknown = cells.filter((c) => !COMPOSITION_HEAD_CELL_CLASSES.has(c));
      if (unknown.length > 0) {
        throw new GenerationError(
          `${GLOBAL_DEFAULTS_KEY}: 'composition.heads.${shape}:' names unknown cell class(es) ` +
            `${JSON.stringify(unknown)} (known: ${[...COMPOSITION_HEAD_CELL_CLASSES].sort().join(", ")})`,
        );
      }
      heads[shape] = [...cells];
    }
    const rawTail = raw.tail;
    if (!Array.isArray(rawTail) || rawTail.length === 0 || !rawTail.every((c) => typeof c === "string")) {
      throw new GenerationError(`${GLOBAL_DEFAULTS_KEY}: 'composition.tail:' is not a non-empty list of strings`);
    }
    const unknownTail = rawTail.filter((c) => !COMPOSITION_TAIL_CELL_CLASSES.has(c));
    if (unknownTail.length > 0) {
      throw new GenerationError(
        `${GLOBAL_DEFAULTS_KEY}: 'composition.tail:' names unknown cell class(es) ` +
          `${JSON.stringify(unknownTail)} (known: ${[...COMPOSITION_TAIL_CELL_CLASSES].sort().join(", ")})`,
      );
    }
    // `separator` is not a declared key on either side of this pair — see the domain header's own
    // paragraph on why: the engine always joins with `" "` (renderer.py:1003), unchanged by the
    // monorepo PR that made heads/tail declarable, so this generator always publishes it too.
    return {
      composition: { heads, tail: [...rawTail], separator: " " },
      source: "config",
    };
  }

  // ── 5. schema.yaml -> node type -> chrome shape, for every default_node_type candidate ─────────

  function readChromeShapes(candidates, ledger) {
    if (!has(SCHEMA_KEY)) throw new GenerationError(`${SCHEMA_KEY} does not exist`);
    const schema = readYaml(SCHEMA_KEY);
    const nodeTypes = schema?.node_types;
    if (!nodeTypes || typeof nodeTypes !== "object") {
      throw new GenerationError(`${SCHEMA_KEY}: no 'node_types:' mapping`);
    }
    const out = {};
    for (const name of candidates) {
      const definition = nodeTypes[name];
      if (!definition || typeof definition !== "object") {
        throw new GenerationError(
          `${SCHEMA_KEY}: node type '${name}' is declared as a default_node_type somewhere in views/ ` +
            "but is not declared in schema.yaml — refusing to publish a shape for a type that does " +
            "not exist.",
        );
      }
      // No 'render:' block renders as checkbox — schema.yaml's own documented default, and the same
      // rule qntm_md.grammar.node_type_form.node_type_forms encodes on the engine side.
      const render = definition.render;
      const shape = render && typeof render === "object" && typeof render.shape === "string"
        ? render.shape
        : "checkbox";
      if (SEEDABLE_SHAPES.has(shape)) {
        out[name] = shape;
        // NOT A DROP: this is the KEEP branch.
        continue;
      }
      // DROP PATH 8. A shape this generator does not recognise (stat_line, heading, or a future
      // addition) is left unpublished ON PURPOSE — see the domain header.
      ledger.drop(
        `node type '${name}'`,
        `it is a default_node_type somewhere in views/, but its render shape '${shape}' is not one ` +
          `this app knows how to seed (${[...SEEDABLE_SHAPES].sort().join(", ")}), so a new line ` +
          "under a view defaulting to it gets no chrome and the GLOBAL rung stays silent",
      );
    }
    return out;
  }

  // ── 6. vocabulary/markers.yaml -> ordering field name -> how its value is spelled ──────────────
  //
  // TWO MARKER SHAPES, NOT ONE. `due_date`/`available_date`/`queue_position` are TRAILING-TOKEN
  // markers (`extraction_hint:`, this generator's original shape: a glyph followed by a value that
  // varies line to line). `priority` — needed once the default ordering's own fields widen the
  // candidate set below — is a FIXED-`value:` (value-match) marker instead: `markers.yaml`'s
  // `🔽`/`⏫` rows each spell ONE literal value, and unlike a trailing marker, MORE THAN ONE token
  // legitimately owning the SAME field is the NORMAL shape for an enum (every value needs its own
  // glyph), not DROP PATH 12's collision. Published as `{ kind: "enum", values: { token: value } }`
  // — `app/present/ordering.ts` reads it by scanning a line for ANY of `values`' own keys, never by
  // treating "enum" as a fourth cousin of `date`/`int`/`float`'s single-glyph shape.

  function readOrderingFieldMarkers(fields, ledger) {
    if (fields.size === 0) return {};
    if (!has(MARKERS_KEY)) throw new GenerationError(`${MARKERS_KEY} does not exist`);
    const markers = readYaml(MARKERS_KEY)?.markers;
    if (!Array.isArray(markers)) {
      throw new GenerationError(`${MARKERS_KEY}: no 'markers:' list`);
    }
    const out = {};
    // A field once claimed by a TRAILING marker (kind date/int/float) — an enum row arriving later
    // for the SAME field is a real conflict (one field, two irreconcilable reading strategies), not
    // a second value the way two enum rows for one field are.
    const trailingOwner = new Set();
    // Field -> { token: value }, assembled separately from `out` so a LATER trailing-marker row for
    // a field already claimed by an enum row can still be detected as a conflict (see below).
    const enumValues = {};
    for (const entry of markers) {
      // NOT A DROP: a non-mapping marker declares no field. If it was the only marker for a named ordering field, DROP PATH 13 below records that field as unmarked.
      if (!entry || typeof entry !== "object") continue;
      const { token, field, extraction_hint: hint, value, render_only: renderOnly } = entry;
      // NOT A DROP: this table is restricted to the fields the operator's own ordering declares
      // plus the engine's own default-ordering fields; a marker outside that set was never a candidate.
      if (typeof field !== "string" || !fields.has(field)) continue;
      const what = `ordering field '${field}'`;

      // ── THE ENUM BRANCH — a fixed `value:` row (markers.yaml's OTHER shape), never a trailing
      // token. Checked FIRST, on `value !== undefined`, because a value-match row carries no
      // `extraction_hint` at all — falling through to the trailing branch would read `hint` as
      // `undefined` and mis-file it as DROP PATH 10 rather than what it actually is.
      if (value !== undefined) {
        if (renderOnly === true) {
          ledger.drop(
            what,
            `its marker '${token}' is 'render_only: true' — the engine never ingests a value from ` +
              "that glyph, so no ordering preview can be offered for this field",
          );
          continue;
        }
        if (!isNonEmptyString(token)) {
          ledger.drop(what, "its marker declares no 'token:' string, so there is no glyph to find on a line");
          continue;
        }
        if (trailingOwner.has(field)) {
          ledger.drop(
            what,
            `its marker '${token}' declares a fixed 'value:', but another marker already claimed ` +
              "this field with a trailing extraction_hint — a field cannot be read both ways at " +
              "once, so neither is published",
          );
          continue;
        }
        if (!isScalar(value) || value === null) {
          ledger.drop(what, `its marker '${token}' declares 'value:' ${JSON.stringify(value)}, not a scalar`);
          continue;
        }
        const values = enumValues[field] ?? (enumValues[field] = {});
        const spelled = String(value);
        if (values[token] !== undefined && values[token] !== spelled) {
          ledger.drop(
            what,
            `its marker '${token}' redeclares field '${field}' with a different value ` +
              `(${JSON.stringify(values[token])} vs ${JSON.stringify(spelled)}); the first one read wins`,
          );
          continue;
        }
        values[token] = spelled;
        continue;
      }

      // The trailing-marker twin of the enum conflict just above: an extraction_hint row arriving
      // for a field an enum row already claimed.
      if (field in enumValues) {
        ledger.drop(
          what,
          `its marker '${token}' declares an extraction_hint, but another marker already claimed ` +
            "this field with a fixed 'value:' — a field cannot be read both ways at once, so " +
            "neither is published",
        );
        continue;
      }

      // DROP PATH 9. Documented, deliberate — and until now unrecorded.
      if (renderOnly === true) {
        ledger.drop(
          what,
          `its marker '${token}' is 'render_only: true' — the engine never ingests a value from ` +
            "that glyph, so no ordering preview can be offered for this field",
        );
        continue;
      }
      // DROP PATH 10 — THE EXACT TWIN OF THE ONE §9.3 NAMES, in a different generator.
      const kind = EXTRACTION_KINDS[hint];
      if (kind === undefined) {
        ledger.drop(
          what,
          `its marker '${token}' declares extraction_hint ${JSON.stringify(hint ?? null)}, which ` +
            `is not one this app can read a value from (${Object.keys(EXTRACTION_KINDS).sort().join(", ")})`,
        );
        continue;
      }
      // DROP PATH 11. A marker with no token to look for on the line.
      if (!isNonEmptyString(token)) {
        ledger.drop(what, "its marker declares no 'token:' string, so there is no glyph to find on a line");
        continue;
      }
      // DROP PATH 12. Two TRAILING markers for one ordering field: the later one silently won.
      if (out[field] !== undefined) {
        ledger.drop(
          what,
          `two markers claim it ('${out[field].token}' and '${token}'); the last one read wins and ` +
            "the other is not published",
        );
      }
      trailingOwner.add(field);
      out[field] = { token, kind };
    }
    for (const [field, values] of Object.entries(enumValues)) {
      out[field] = { kind: "enum", values };
    }
    // DROP PATH 13. A field the ordering table NAMES and this loop found no marker for at all.
    for (const field of fields) {
      if (out[field] === undefined && ledger.toJSON()[`ordering field '${field}'`] === undefined) {
        ledger.drop(
          `ordering field '${field}'`,
          "named by a section's 'ordering:' and/or the engine's own default ordering, but " +
            "vocabulary/markers.yaml declares no marker for it at all, so nothing can read its " +
            "value off a line",
        );
      }
    }
    return out;
  }

  // ── 7. schema.yaml -> field_types.<f>.default ───────────────────────────────────────────────

  /**
   * NOT A DROP when the mapping is absent — see the domain header. No `has()` guard here, matching
   * the original: by the time this runs, `readChromeShapes` above has already required
   * `schema.yaml` to exist, in the SAME call order this function preserves.
   */
  function readFieldDefaults() {
    const schema = readYaml(SCHEMA_KEY);
    const fieldTypes = schema?.field_types;
    if (!fieldTypes || typeof fieldTypes !== "object" || Array.isArray(fieldTypes)) return {};
    const out = {};
    for (const [field, definition] of Object.entries(fieldTypes)) {
      if (definition && typeof definition === "object" && isScalar(definition.default)) {
        if (definition.default !== null) out[field] = definition.default;
      }
    }
    return out;
  }

  // ── 8. vocabulary/*.yaml -> the vocabulary, read in the RENDER direction ───────────────────────

  function readSpelling(ledger) {
    const typeTokens = {};
    const fieldOrder = [];
    const fieldTokens = {};
    const vocabularyKeys = allKeys().filter((k) => k.startsWith(VOCABULARY_PREFIX) && k.endsWith(".yaml")).sort();
    for (const key of vocabularyKeys) {
      const file = key.slice(VOCABULARY_PREFIX.length);
      const document = readYaml(key);
      // DROP PATH 14. A whole vocabulary file, and every spelling in it.
      if (!document || typeof document !== "object" || Array.isArray(document)) {
        ledger.drop(
          `vocabulary/${file}`,
          "the file did not parse into a mapping of family -> token list, so no field it spells " +
            "can be seeded into a new line",
        );
        continue;
      }
      for (const [familyName, family] of Object.entries(document)) {
        // DROP PATH 15. A family declared as something other than a list of entries.
        if (!Array.isArray(family)) {
          ledger.drop(
            `vocabulary/${file}#${familyName}`,
            `the '${familyName}:' family is not a list of token entries, so no field it spells can ` +
              "be seeded into a new line",
          );
          continue;
        }
        for (const entry of family) {
          if (!entry || typeof entry !== "object" || !isNonEmptyString(entry.token)) continue;
          if (isNonEmptyString(entry.node_type)) {
            if (typeTokens[entry.node_type] === undefined) typeTokens[entry.node_type] = entry.token;
            continue;
          }
          // NOT A DROP: an entry declaring neither `node_type:` nor `field:` spells no field, so
          // nothing was discarded.
          if (!isNonEmptyString(entry.field)) continue;
          // DROP PATH 16. A tag the engine itself never ingests back from its own glyph.
          if (entry.render_only === true) {
            ledger.drop(
              `vocabulary token '${entry.token}'`,
              `spells '${entry.field}' but is 'render_only: true', so the engine never reads that ` +
                "field back from that glyph and a seeded line would not round-trip",
            );
            continue;
          }
          if (!isScalar(entry.value) || entry.value === null) continue;
          if (fieldTokens[entry.field] === undefined) {
            fieldTokens[entry.field] = {};
            fieldOrder.push(entry.field);
          }
          const key2 = String(entry.value);
          if (fieldTokens[entry.field][key2] === undefined) fieldTokens[entry.field][key2] = entry.token;
        }
      }
    }
    if (Object.keys(typeTokens).length === 0) {
      throw new GenerationError(
        "no vocabulary token declares a 'node_type:' — the type tag is half of what the engine " +
          "prints on every line it renders, so an empty map would make every seed a silent guess",
      );
    }
    return { typeTokens, fieldOrder, fieldTokens };
  }

  // ── 9. patterns/*.yaml + rules/*.yaml -> every rule that retypes, reduced to (find, when) ──────

  function readRetypeRules(ledger) {
    const patterns = new Map();
    const patternKeys = allKeys().filter((k) => k.startsWith(PATTERNS_PREFIX) && k.endsWith(".yaml")).sort();
    for (const key of patternKeys) {
      const file = key.slice(PATTERNS_PREFIX.length);
      const document = readYaml(key);
      // DROP PATH 17c — A REAL GAP, FOUND BY THE COMPLETENESS SCANNER, NOT ASSUMED AWAY. A
      // patterns/ file this reader cannot read as a mapping used to fall through here with no
      // record: every retype rule whose `for_each.pattern` names one of the patterns it declares
      // then hit DROP PATH 17 ("names no pattern this generator could read") — a true message
      // pointing at the wrong cause. `compile-qualification.mjs`'s own pattern loop already fixed
      // the identical shape for ITS reading of the same patterns/ directory (its DROP PATH 1);
      // this applies the same fix here, so the real cause is named at the real place.
      if (!document || typeof document !== "object" || Array.isArray(document)) {
        ledger.drop(
          `patterns/${file}`,
          "the file did not parse into a mapping of pattern name -> definition, so no retype rule " +
            "naming one of its patterns could be evaluated",
        );
        continue;
      }
      for (const [name, config] of Object.entries(document)) {
        if (!patterns.has(name)) patterns.set(name, config);
      }
    }

    const out = [];
    const ruleKeys = allKeys().filter((k) => k.startsWith(RULES_PREFIX) && k.endsWith(".yaml")).sort();
    for (const key of ruleKeys) {
      const file = key.slice(RULES_PREFIX.length);
      let document;
      try {
        document = readYaml(key);
      } catch (error) {
        // DROP PATH 17a. A rules file this reader cannot parse.
        ledger.drop(`rules/${file}`, `it did not parse (${error.message}), so any retype rule it declares was not evaluated`);
        continue;
      }
      if (!Array.isArray(document)) continue;
      for (const rule of document) {
        if (!rule || typeof rule !== "object") continue;
        const actions = Array.isArray(rule.actions) ? rule.actions : [];
        const retype = actions.find(
          (a) => a && typeof a === "object" && a.verb === "set_node_type" && isNonEmptyString(a.node_type),
        );
        if (retype === undefined) continue;
        const id = isNonEmptyString(rule.id) ? rule.id : `${file} (unnamed rule)`;
        const what = `rule '${id}'`;
        const patternName = (rule.for_each && typeof rule.for_each === "object")
          ? rule.for_each.pattern
          : undefined;
        if (!isNonEmptyString(patternName) || !patterns.has(patternName)) {
          // DROP PATH 17. A retype rule this generator cannot bind to any node type.
          ledger.drop(
            what,
            "it retypes a node but names no pattern this generator could read, so whether it " +
              "retypes a new line was not evaluated",
          );
          continue;
        }
        const pattern = patterns.get(patternName);
        const find = (pattern && typeof pattern === "object" && pattern.root && typeof pattern.root === "object")
          ? pattern.root.find
          : undefined;
        if (!find || typeof find !== "object" || Array.isArray(find)) {
          ledger.drop(what, `its pattern '${patternName}' declares no readable 'root.find'`);
          continue;
        }
        const steps = Array.isArray(pattern.steps) ? pattern.steps : [];
        if (steps.length > 0) {
          // DROP PATH 18. THE BOUNDARY, RECORDED. See the domain header.
          ledger.drop(
            what,
            `its pattern '${patternName}' traverses the graph (${steps.length} step(s)), which this ` +
              "generator does not read, so whether it retypes a new line was not evaluated",
          );
          continue;
        }
        if (!Object.values(find).every((v) => isScalar(v) && !(typeof v === "string" && v.startsWith("$")))) {
          ledger.drop(what, `its pattern '${patternName}' matches on something other than literal fields`);
          continue;
        }
        out.push({ id, find, when: rule.when, becomes: retype.node_type, what });
      }
    }
    return out;
  }

  // ── 10. view -> section -> {nodeType, defaults?, tokens} for EVERY section of every view sheet ──

  function readSectionRegistration(viewFiles, registration, ledger) {
    const fieldDefaults = readFieldDefaults();
    const spelling = readSpelling(ledger);
    const retypeRules = readRetypeRules(ledger);
    const out = {};
    for (const [file, view] of viewFiles) {
      const viewNodeType = isNonEmptyString(view.default_node_type)
        ? view.default_node_type
        : registration.defaultNodeType;
      const sections = {};
      for (const [index, section] of view.sections.entries()) {
        if (!section || typeof section !== "object" || !isNonEmptyString(section.id)) {
          // DROP PATH 22. Recorded by `readOrdering` too, for its own key; joined, never overwritten.
          ledger.drop(
            `views/${file}#${index}`,
            `section at index ${index} of view '${view.viewId}' has no readable 'id:', so what a ` +
              "new line under it becomes could not be published under any key",
          );
          continue;
        }
        const what = `section '${view.viewId}.${section.id}'`;
        const nodeType = isNonEmptyString(section.default_node_type)
          ? section.default_node_type
          : viewNodeType;
        const defaults = {};
        if (section.defaults && typeof section.defaults === "object" && !Array.isArray(section.defaults)) {
          for (const [field, value] of Object.entries(section.defaults)) {
            if (!isScalar(value)) {
              throw new GenerationError(
                `${file}: section '${section.id}' defaults.${field} is not a scalar — this ` +
                  "generator does not know what a new line under it resolves to, and refuses to guess",
              );
            }
            defaults[field] = value;
          }
        }
        const entry = { nodeType };
        if (Object.keys(defaults).length > 0) entry.defaults = defaults;
        entry.tokens = seedTokens(what, nodeType, defaults, fieldDefaults, spelling, retypeRules, ledger);
        sections[section.id] = entry;
      }
      if (Object.keys(sections).length > 0) out[view.viewId] = sections;
    }
    return out;
  }

  // ── assemble ────────────────────────────────────────────────────────────────────────────────

  const viewFiles = readViewFiles();
  const registration = readRegistration(viewFiles);
  const candidates = collectDefaultNodeTypeCandidates(registration, viewFiles);
  const ordering = readOrdering(viewFiles, ledger);
  const defaultOrderingResult = readGlobalDefaultOrdering();
  // WIDENED: the candidate set is no longer only the fields a DECLARED `ordering:` names — the
  // (declared, or engine-fallback) default ordering's OWN fields are added too, generically, and a
  // marker for each must be looked up for every config, not only one that happens to already use
  // them in a declared section. NO FIELD IS EXCLUDED BY NAME — a field the default ordering names
  // that turns out to have no marker at all (`title`, in the fallback tuple) is not filtered out in
  // advance; `readOrderingFieldMarkers`'s own DROP PATH 13 records that absence, with its reason,
  // rather than the candidate set silently never asking.
  const orderingFields = readOrderingFieldMarkers(
    new Set([...orderingFieldNames(ordering), ...defaultOrderingResult.ordering.map((entry) => entry.field)]),
    ledger,
  );
  const chromeShapes = readChromeShapes(candidates, ledger);
  const sectionRegistration = readSectionRegistration(viewFiles, registration, ledger);
  const compositionResult = readGlobalComposition();

  const declaration = {
    registration,
    lineGrammars: readLineGrammars(),
    ordering,
    orderingFields,
    dayBoundary: readDayBoundary(),
    chromeShapes,
    sectionRegistration,
    // THE FLOOR OF THE CASCADE, DECLARED — see this file's own header ("THE DEFAULT ORDERING").
    // `defaultOrdering` is what every section with NEITHER `ordering` NOR `orderingMode` above sorts
    // by; `defaultOrderingSource` says whether that answer came from `global_defaults.yaml`
    // (`"config"`) or the engine's own hardcoded fallback (`"engine-fallback"`) — always published,
    // so the fallback is a visible fact, never the silent one this file used to publish.
    defaultOrdering: defaultOrderingResult.ordering,
    defaultOrderingSource: defaultOrderingResult.source,
    // THE SECOND DIRECTION OF THE LINE GRAMMAR — see "COMPOSITION" above. Read from
    // `global_defaults.yaml`'s own `composition:` key when the operator's config declares one,
    // exactly as `defaultOrdering` is; `compositionSource` says which answer this is
    // (`"config"` or `"engine-fallback"`), the same visible-fallback discipline.
    composition: compositionResult.composition,
    compositionSource: compositionResult.source,
  };
  // `priorityRank` follows the same "absent means nothing to say" convention every other optional
  // key in this declaration already uses (see resolutiontable.ts's own header) — omitted, not
  // published empty, when the declared default ordering names no field a rank table applies to.
  if (Object.keys(defaultOrderingResult.priorityRank).length > 0) {
    declaration.priorityRank = defaultOrderingResult.priorityRank;
  }
  // Every declaration this generator read and did not publish. See `scripts/ledger.mjs`.
  const dropped = ledger.toJSON();
  return {
    declaration,
    dropped,
    // `design-the-runtime-compile.md` §8 step A — deterministic, content-derived, never a clock or
    // a counter. See `declaration-version.mjs` for what is hashed and why.
    version: versionKey({ declaration, dropped }),
  };
}

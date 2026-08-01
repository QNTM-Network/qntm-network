/**
 * generate-resolution-declaration — writes `presentation.json`'s `resolution` key FROM the
 * monorepo's own config, never by hand.
 *
 * ── WHAT THIS PUBLISHES, AND WHY IT IS A THIRD KEY RATHER THAN A WIDER `qualification` ──
 *
 * `design-the-resolution-architecture.md` step 5 asks for "the config-only resolution table":
 * registration keys, `defaults:`, ordering, `pull_context` and the day boundary. Two of those are
 * ALREADY published and ALREADY consumed — `scripts/generate-qualification-declaration.mjs` emits
 * `sections[view][section].nodeType` (the MINTING default, GLOBAL -> VIEW) and `.defaults` (the
 * section's own `defaults:` block, the STRUCTURAL_NODE level), and `app/present/membership.ts`
 * reads both on every line typed. Re-publishing them here would be a second copy of a fact this
 * repo already generates once; this file adds only what is NOT yet published.
 *
 *   registration.baseNodeType — `resolution/registration.py`'s `RegistrationKey.BASE_NODE_TYPE`,
 *     the REVERT target. It shares ONE config key with `defaultNodeType` (`default_registration.
 *     default_node_type`) but is a DIFFERENT resolution — GLOBAL only, forever, never per-view —
 *     and that design document is explicit that a published table "must ship the two as two names
 *     even though the config has one key" (§5.5), because a local mirror that used the per-view
 *     minting default as a revert target would reproduce the 2026-07-27 routine->task->routine
 *     race in the browser. Published as a SEPARATE field for exactly that reason, even though its
 *     value is numerically identical to `qualification.defaultNodeType` today.
 *   registration.inputGrammar / registration.defaultTags — the other two GLOBAL registration keys.
 *     Neither is ever overridden per-view or per-section in this instance (measured: 1 sheet
 *     declares `input_grammar`, the global; 1 declares `default_tags`, the global) — see the
 *     ASSERT in `readRegistration` below, which refuses to publish a single GLOBAL value if that
 *     ever stops being true, rather than silently ignoring a VIEW/STRUCTURAL_NODE override.
 *   lineGrammars — `line_grammars.yaml`'s `grammars:` map (2 grammars, which shapes each admits).
 *   ordering — the 9 sections (7 `ordering:`, 2 `ordering_mode:`) that say anything about row
 *     order, published exactly as declared, PLUS the section's own `name:` (design-the-resolution-
 *     architecture.md step 7's own gap, found the same way step 6 found chromeShapes: a name to
 *     SAY, "this line will move within Due This Week" rather than "…within due-this-week", and
 *     `qualification.sections` cannot supply it — measured 2026-08-01, none of these 9 sections'
 *     predicates survive that generator's own normalisation, so there is no other published name
 *     to join against). NOT `persist_placing` (design §5.8): that is the
 *     engine's own still-open fold of `ordering_mode` + `pin_after_qualification_drops` into one
 *     knob, unresolved, and reproducing the fold here would be a second interpreter of a decision
 *     the engine has not finished making. `pin_after_qualification_drops` (14 sections) is left
 *     out for the same reason — it decides whether an EXISTING placed row keeps its slot after it
 *     stops qualifying, not what a NEW line becomes, and there is no browser-side "existing row"
 *     concept yet for it to inform.
 *   orderingFields — step 7's other gap: an ordering `field` name (`due_date`) says nothing about
 *     how its VALUE is spelled on a printed line. `config/vocabulary/markers.yaml`'s own
 *     `token`/`extraction_hint` pair is the SAME map the engine's own `parse_marker.py` reads; this
 *     publishes it restricted to the fields `ordering` above actually names, and further restricted
 *     to markers that are a magnitude an edit can change (`extraction_hint`, not a fixed `value:`)
 *     and are not `render_only` (a derived display value the engine itself never ingests from that
 *     glyph — see `readOrderingFieldMarkers`'s own header for the two named exclusions).
 *   dayBoundary — `day_boundary.yaml`'s 3 keys, verbatim.
 *   chromeShapes — design-the-resolution-architecture.md step 6's own gap, found while building it
 *     rather than assumed away: knowing a section's resolved node TYPE is not enough to seed a new
 *     line safely, because `- [ ] ` (a checkbox) and `- ` (a bare bullet) are not interchangeable —
 *     `newline.ts`'s header measured that typing a checkbox into `person` (fields `[title,
 *     qntm_id]`, no `status`) aborts the WHOLE CYCLE, and a bare bullet under a checkbox-shaped
 *     default is refused at the applier's form gate and vanishes. Both guesses cost the operator
 *     something, which is exactly why the GLOBAL rung refused rather than pick one. The type name
 *     alone cannot settle it; `node_types.<t>.render.shape` (schema.yaml) can, and does, one shot
 *     the same way the engine itself decides it (`qntm_md.grammar.node_type_form.node_type_forms`
 *     — an UNDECLARED `render:` block defaults to checkbox, per that module's own docstring, which
 *     is why an absent shape publishes as `"checkbox"` here rather than being omitted).
 *     RESTRICTED TO CANDIDATES, NOT THE WHOLE SCHEMA — the same "a smaller table that is exact and
 *     consumed beats a complete one nobody reads" rule step 5 already states. Only node types that
 *     actually appear as a `default_node_type` somewhere in this config (the GLOBAL value, or a
 *     view's own override) are looked up; a type this table has no reader that could ever ask about
 *     is not published just because schema.yaml declares it. RESTRICTED TO TWO SHAPES, NOT ALL OF
 *     THEM — only `checkbox` and `plain_line` are forms `newline.ts` knows how to seed (`- [ ] ` and
 *     `- `); a type whose render shape is `stat_line` or `heading` is left OUT of this table on
 *     purpose, so the GLOBAL rung refuses for it rather than guess a chrome form nothing here has
 *     confirmed — the same refusal posture as an unpublished section, stated once rather than
 *     re-decided at the call site.
 *
 * `pull_context` (77 sections) is DELIBERATELY NOT published here. It is "predicate exact, answer
 * runtime" (`research-the-resolution-universe.md` §6.2) — the config says which edge and which
 * direction, but the useful answer needs a transitive graph walk (measured depth up to 6) that no
 * step in the 13-step sequence this document belongs to (5 through 13) consumes; publishing it now
 * would be a kind with zero future reader in this arc's own plan, which `design-the-resolution-
 * architecture.md`'s own rule refuses ("a smaller table that is exact and consumed beats a
 * complete one nobody reads").
 *
 * ── NONE OF THIS HAS A CONSUMER YET, AND THAT IS STATED RATHER THAN HIDDEN ──
 *
 * `app/` computes no dates, previews no ordering and gates no line on its grammar today. This
 * table exists because steps 6 (needs 5), 7 (needs 5 and 8) and 8 (needs 5) are the next three
 * items in the SAME sequence and each names this table as its one dependency — the same posture
 * step 1 took towards step 2 ("it is the missing half of a join the next step needs, and it is a
 * handful of lines").
 *
 * ── USAGE ──
 *
 *   node scripts/generate-resolution-declaration.mjs                 write presentation.json
 *   node scripts/generate-resolution-declaration.mjs --check         diff only, exit 1 if stale
 *   node scripts/generate-resolution-declaration.mjs --config-dir X  override the config path
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseYamlSubset } from "./yaml-subset.mjs";
import { DEFAULT_CONFIG_DIR, REPO_ROOT } from "./monorepo-config.mjs";
import { Ledger, reportDropped } from "./ledger.mjs";

export { DEFAULT_CONFIG_DIR };

class GenerationError extends Error {}

const readYaml = (path) => parseYamlSubset(readFileSync(path, "utf8"), path);
const isScalar = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);
const isNonEmptyString = (v) => typeof v === "string" && v !== "";

// ── 1. default_registration.yaml -> the GLOBAL registration keys, and the two names for one key ──

function readRegistration(configDir, viewFiles) {
  const path = join(configDir, "views", "default_registration.yaml");
  if (!existsSync(path)) throw new GenerationError(`${path} does not exist`);
  const declared = readYaml(path)?.default_registration;
  if (!declared || typeof declared !== "object") {
    throw new GenerationError(`${path}: no 'default_registration:' mapping`);
  }
  const { default_node_type: defaultNodeType, input_grammar: inputGrammar, default_tags } = declared;
  if (!isNonEmptyString(defaultNodeType)) {
    throw new GenerationError(`${path}: default_node_type is not a non-empty string`);
  }
  if (!isNonEmptyString(inputGrammar)) {
    throw new GenerationError(`${path}: input_grammar is not a non-empty string`);
  }
  const defaultTags = default_tags === undefined || default_tags === null ? [] : default_tags;
  if (!Array.isArray(defaultTags) || !defaultTags.every((t) => typeof t === "string")) {
    throw new GenerationError(`${path}: default_tags is not a list of strings`);
  }

  // resolution/registration.py's LEVELS_FOR grants INPUT_GRAMMAR and DEFAULT_TAGS three levels
  // (GLOBAL, VIEW, STRUCTURAL_NODE) — the same table DEFAULT_NODE_TYPE uses. Publishing a single
  // GLOBAL value for either is only correct while no sheet ever overrides it. Checked here, on
  // every generate, rather than assumed: a sheet that starts declaring `input_grammar:` or
  // `default_tags:` must fail this generator loudly, not silently keep shipping the stale GLOBAL
  // value — the same posture `readViews` below takes for `default_node_type` (which DOES vary).
  for (const [file, view] of viewFiles) {
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
    // BASE_NODE_TYPE — `resolve_base_node_type` (registration.py): reads the GLOBAL declaration
    // and ONLY the GLOBAL declaration, forever. Same config key as `defaultNodeType` today (the
    // module's own docstring: "splitting the config key is design stage 3"); published under a
    // SEPARATE name so a caller can never reach for the per-view minting default when what it
    // needs is the global-only revert target.
    baseNodeType: defaultNodeType,
    inputGrammar,
    defaultTags,
  };
}

// ── 2. line_grammars.yaml -> grammar name -> admitted shape names ─────────────────────────────

function readLineGrammars(configDir) {
  const path = join(configDir, "line_grammars.yaml");
  if (!existsSync(path)) throw new GenerationError(`${path} does not exist`);
  const grammars = readYaml(path)?.line_grammars?.grammars;
  if (!grammars || typeof grammars !== "object" || Array.isArray(grammars)) {
    throw new GenerationError(`${path}: no 'line_grammars.grammars' mapping`);
  }
  const out = {};
  for (const [name, shapes] of Object.entries(grammars)) {
    if (!Array.isArray(shapes) || !shapes.every((s) => typeof s === "string")) {
      throw new GenerationError(`${path}: grammars.${name} is not a list of shape names`);
    }
    out[name] = [...shapes];
  }
  if (Object.keys(out).length === 0) {
    throw new GenerationError(`${path}: 'grammars:' yielded no entries`);
  }
  return out;
}

// ── 3. day_boundary.yaml -> the three keys, verbatim ───────────────────────────────────────────

function readDayBoundary(configDir) {
  const path = join(configDir, "day_boundary.yaml");
  if (!existsSync(path)) throw new GenerationError(`${path} does not exist`);
  const declared = readYaml(path)?.day_boundary;
  if (!declared || typeof declared !== "object") {
    throw new GenerationError(`${path}: no 'day_boundary:' mapping`);
  }
  const { timezone, day_start_hour: dayStartHour, week_starts_on: weekStartsOn } = declared;
  if (!isNonEmptyString(timezone)) throw new GenerationError(`${path}: timezone is not a string`);
  if (!Number.isInteger(dayStartHour) || dayStartHour < 0 || dayStartHour > 23) {
    throw new GenerationError(`${path}: day_start_hour is not an integer 0..23`);
  }
  if (!isNonEmptyString(weekStartsOn)) {
    throw new GenerationError(`${path}: week_starts_on is not a string`);
  }
  return { timezone, dayStartHour, weekStartsOn };
}

// ── 4. schema.yaml -> node type -> chrome shape, for every default_node_type candidate ─────────

// The only two forms `app/present/newline.ts` knows how to seed. A type whose declared shape is
// anything else (`stat_line`, `heading`) is left OUT of the published map — see this file's own
// header for why that is a refusal and not an omission.
const SEEDABLE_SHAPES = new Set(["checkbox", "plain_line"]);

function collectDefaultNodeTypeCandidates(registration, viewFiles) {
  const types = new Set([registration.defaultNodeType]);
  for (const [, view] of viewFiles) {
    if (typeof view.default_node_type === "string") types.add(view.default_node_type);
  }
  return [...types].sort();
}

function readChromeShapes(configDir, candidates, ledger) {
  const path = join(configDir, "schema.yaml");
  if (!existsSync(path)) throw new GenerationError(`${path} does not exist`);
  const schema = readYaml(path);
  const nodeTypes = schema?.node_types;
  if (!nodeTypes || typeof nodeTypes !== "object") {
    throw new GenerationError(`${path}: no 'node_types:' mapping`);
  }
  const out = {};
  for (const name of candidates) {
    const definition = nodeTypes[name];
    if (!definition || typeof definition !== "object") {
      throw new GenerationError(
        `${path}: node type '${name}' is declared as a default_node_type somewhere in views/ ` +
          "but is not declared in schema.yaml — refusing to publish a shape for a type that does " +
          "not exist.",
      );
    }
    // No 'render:' block renders as checkbox — schema.yaml's own documented default (:596-597,
    // "A type with no render: block renders as checkbox"), and the same rule
    // qntm_md.grammar.node_type_form.node_type_forms encodes on the engine side (an undeclared
    // shape is treated as checkbox-carrying, the conservative direction on both the render side
    // and the admission-gate side). Read here, never assumed independently of that citation.
    const render = definition.render;
    const shape = render && typeof render === "object" && typeof render.shape === "string"
      ? render.shape
      : "checkbox";
    if (SEEDABLE_SHAPES.has(shape)) {
      out[name] = shape;
      continue;
    }
    // DROP PATH 8. A shape this generator does not recognise (stat_line, heading, or a future
    // addition) is left unpublished ON PURPOSE — see this file's header. The purpose was right;
    // the silence was not. The operator declaring `default_node_type: <a stat_line type>` on a
    // view gets a GLOBAL rung that refuses to seed a new line there, and nothing told him why.
    ledger.drop(
      `node type '${name}'`,
      `it is a default_node_type somewhere in views/, but its render shape '${shape}' is not one ` +
        `this app knows how to seed (${[...SEEDABLE_SHAPES].sort().join(", ")}), so a new line ` +
        "under a view defaulting to it gets no chrome and the GLOBAL rung stays silent",
    );
  }
  return out;
}

// ── 5. views/*.yaml -> read once, shared by readRegistration's guard and readOrdering ─────────

function readViewFiles(configDir, ledger) {
  const dir = join(configDir, "views");
  if (!existsSync(dir)) throw new GenerationError(`${dir} does not exist`);
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort();
  const out = [];
  for (const file of files) {
    if (file === "default_registration.yaml") continue;
    const document = readYaml(join(dir, file));
    // DROP PATHS 4-6, AND THEY COST MORE HERE THAN ANYWHERE ELSE. A view that falls out of this
    // list is a view `readRegistration`'s guard never sweeps — and that guard is the only thing
    // stopping this generator from publishing a stale GLOBAL `input_grammar` / `default_tags` for
    // a sheet that overrides them. So a silent drop here does not merely withhold a fact: it
    // disables a check whose own comment says it exists so the generator "must fail loudly, not
    // silently keep shipping the stale GLOBAL value". Recorded, so it cannot.
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

const DIRECTIONS = new Set(["asc", "desc"]);
const ORDERING_MODES = new Set(["pattern_default", "insertion_order"]);

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
      // THE OPERATOR'S OWN WORDS FOR THE SECTION, same reasoning
      // generate-qualification-declaration.mjs already states for its own `name`: step 7 needs a
      // name to say ("this line will move within Due This Week" reads off THIS, never off the id
      // it is keyed by) and, unlike `qualification.sections`, NONE of the 9 ordering sections
      // survive that generator's normalisation (measured 2026-08-01: all 9 traverse an edge,
      // consult the clock, or range over a field it cannot resolve), so there is no other
      // published source this table could join against for a display name.
      if (typeof section.name === "string" && section.name !== "") fields.name = section.name;
      sections[section.id] = fields;
    }
    if (Object.keys(sections).length > 0) out[view.viewId] = sections;
  }
  return out;
}

// ── 6. vocabulary/markers.yaml -> ordering field name -> its trailing-token marker ─────────────
//
// A section's `ordering:` names a FIELD ("due_date", "queue_position"); it says nothing about how
// that field's VALUE is spelled on a printed line, because the config does not need to say that —
// the engine parses it from `config/vocabulary/markers.yaml`'s own `token`/`extraction_hint` pair
// (`parse_marker.py:98-99`: the first whitespace-separated run after a value-bearing marker glyph
// IS its value). `app/present/ordering.ts` needs the SAME map to preview a position from the
// characters the operator is about to leave on the line, so it is published here, restricted to
// the fields the OPERATOR'S ORDERING TABLE ACTUALLY NAMES — not the other nine marker rows
// `markers.yaml` declares, which have no ordering reader and would be a fact with no consumer.
//
// TWO KINDS OF ROW ARE LEFT OUT, ON PURPOSE, NOT BY OMISSION:
//   * a `value:` row (`priority`, `blocked_state`, …) — a fixed-vocabulary marker, not a magnitude;
//     nothing about "the first one wins" needs measuring, so there is nothing to extract.
//   * a `render_only: true` row — markers.yaml's own comments name two (`done_task_count`, `par`):
//     "a DERIVED view, not authority… edits to it are ignored; it re-renders the true count." A
//     table that told the operator his edit would move a row by a field the engine itself refuses
//     to ingest from that glyph would be worse than silence.
// Neither case currently arises for `due_date`/`available_date`/`queue_position` (measured against
// the shipped config: all three are `extraction_hint`, none is `render_only`), but the guard is a
// property of the READER, not an assumption about today's file, so a future ordering key that
// pointed at a render-only or fixed-value marker refuses here rather than publishing a lie.
const EXTRACTION_KINDS = { trailing_date: "date", trailing_int: "int", trailing_float: "float" };

function orderingFieldNames(ordering) {
  const names = new Set();
  for (const sections of Object.values(ordering)) {
    for (const section of Object.values(sections)) {
      for (const key of section.ordering ?? []) names.add(key.field);
    }
  }
  return names;
}

function readOrderingFieldMarkers(configDir, fields, ledger) {
  if (fields.size === 0) return {};
  const path = join(configDir, "vocabulary", "markers.yaml");
  if (!existsSync(path)) throw new GenerationError(`${path} does not exist`);
  const markers = readYaml(path)?.markers;
  if (!Array.isArray(markers)) {
    throw new GenerationError(`${path}: no 'markers:' list`);
  }
  const out = {};
  for (const entry of markers) {
    if (!entry || typeof entry !== "object") continue;
    const { token, field, extraction_hint: hint, render_only: renderOnly } = entry;
    // A marker for a field no section's `ordering:` names is not a drop — this table is
    // deliberately restricted to the fields the operator's own ordering table asks about, and a
    // marker outside that set was never a candidate for publication.
    if (typeof field !== "string" || !fields.has(field)) continue;
    const what = `ordering field '${field}'`;
    // DROP PATH 9. Documented, deliberate — and until now unrecorded.
    if (renderOnly === true) {
      ledger.drop(
        what,
        `its marker '${token}' is 'render_only: true' — the engine never ingests a value from ` +
          "that glyph, so no ordering preview can be offered for this field",
      );
      continue;
    }
    // DROP PATH 10 — THE EXACT TWIN OF THE ONE §9.3 NAMES, in a different generator. A new
    // `extraction_hint:` (or a fixed-`value:` marker) makes an ordering field the operator's
    // config explicitly names vanish from the published table with no record at all.
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
    // DROP PATH 12. Two markers for one ordering field: the later one silently won. The
    // qualification generator throws on a duplicate PATTERN for exactly this reason ("the engine
    // merges one dict, so a duplicate silently loses"); here the loser is recorded rather than
    // thrown, because an ordering preview is an affordance and refusing to generate the whole
    // declaration over one would be the wolf this ledger's header argues against.
    if (out[field] !== undefined) {
      ledger.drop(
        what,
        `two markers claim it ('${out[field].token}' and '${token}'); the last one read wins and ` +
          "the other is not published",
      );
    }
    out[field] = { token, kind };
  }
  // DROP PATH 13. A field the ordering table NAMES and this loop found no marker for at all. The
  // old comment called this "unpublished is the refusal" and pointed at `app/present/ordering.ts`
  // reading the absence as a reason to stay silent — true of the app, and no help to the operator,
  // who declared an ordering key and gets silence with no reason attached to it.
  for (const field of fields) {
    if (out[field] === undefined && ledger.toJSON()[`ordering field '${field}'`] === undefined) {
      ledger.drop(
        `ordering field '${field}'`,
        "a section's 'ordering:' names it, but vocabulary/markers.yaml declares no marker for it " +
          "at all, so nothing can read its value off a line",
      );
    }
  }
  return out;
}

// ── assemble ─────────────────────────────────────────────────────────────────────────────────

export function generateResolution(configDir, ledger = new Ledger()) {
  const viewFiles = readViewFiles(configDir, ledger);
  const registration = readRegistration(configDir, viewFiles);
  const candidates = collectDefaultNodeTypeCandidates(registration, viewFiles);
  const ordering = readOrdering(viewFiles, ledger);
  const orderingFields = readOrderingFieldMarkers(configDir, orderingFieldNames(ordering), ledger);
  const chromeShapes = readChromeShapes(configDir, candidates, ledger);
  return {
    registration,
    lineGrammars: readLineGrammars(configDir),
    ordering,
    orderingFields,
    dayBoundary: readDayBoundary(configDir),
    chromeShapes,
    // Every declaration this generator read and did not publish. See `scripts/ledger.mjs`.
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
  const resolution = generateResolution(args.configDir, ledger);
  const presentationPath = join(REPO_ROOT, "presentation.json");
  const current = JSON.parse(readFileSync(presentationPath, "utf8"));

  if (args.check) {
    if (JSON.stringify(current.resolution) === JSON.stringify(resolution)) {
      console.log("presentation.json's 'resolution' key matches the monorepo config.");
      return;
    }
    console.error("presentation.json's 'resolution' key is STALE relative to the monorepo config.");
    const before = current.resolution?.dropped ?? {};
    for (const [key, why] of Object.entries(resolution.dropped)) {
      if (!(key in before)) console.error(`  NEWLY DROPPED  ${key}: ${why}`);
    }
    for (const key of Object.keys(before)) {
      if (!(key in resolution.dropped)) console.error(`  NO LONGER DROPPED  ${key}`);
    }
    process.exit(1);
  }

  writeFileSync(presentationPath, JSON.stringify({ ...current, resolution }, null, 2) + "\n");
  const orderingSections = Object.values(resolution.ordering).reduce(
    (n, s) => n + Object.keys(s).length,
    0,
  );
  console.log(
    `wrote resolution declaration to ${presentationPath}\n` +
      `  registration: ${JSON.stringify(resolution.registration)}\n` +
      `  ${Object.keys(resolution.lineGrammars).length} line grammars, ` +
      `${orderingSections} ordering sections, day boundary ${resolution.dayBoundary.timezone}\n` +
      `  ordering field markers: ${JSON.stringify(resolution.orderingFields)}\n` +
      `  chrome shapes: ${JSON.stringify(resolution.chromeShapes)}`,
  );
  reportDropped("resolution", ledger);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(String(e?.message || e));
    process.exit(e instanceof GenerationError ? 2 : 1);
  });
}

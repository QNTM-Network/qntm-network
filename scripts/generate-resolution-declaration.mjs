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
      // NOT A DROP: this is the KEEP branch.
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
    // NOT A DROP: default_registration.yaml is read separately, by readRegistration.
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
    // NOT A DROP: a non-mapping marker declares no field. If it was the only marker for a named ordering field, DROP PATH 13 below records that field as unmarked.
    if (!entry || typeof entry !== "object") continue;
    const { token, field, extraction_hint: hint, render_only: renderOnly } = entry;
    // A marker for a field no section's `ordering:` names is not a drop — this table is
    // deliberately restricted to the fields the operator's own ordering table asks about, and a
    // marker outside that set was never a candidate for publication.
    // NOT A DROP: this table is restricted to the fields the operator's own ordering declares; a marker outside that set was never a candidate.
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

// ── 7. THE SEED: what a NEW LINE under a section is, spelled in the characters the engine prints ─
//
// Rungs 1 and 2 of `design-the-rule-mirror.md`'s ladder, and they ship together because §3.3 says
// they must. The operator's own words: "it gets stamped `task` … then for `personal all` it would
// get stamped `task` AND `personal`, as we have a default resolution here."
//
// ── WHY A DEFAULT CAN BE SEEDED AT ALL, AND WHY THIS IS NOT A NEW AUTHORITY ──
//
// A `defaults:` block sets a node FIELD. A field is not text. What makes this publishable is that
// the ENGINE ITSELF spells a set field back onto the line, every cycle, through
// `qntm_md.vocabulary.token_resolver.TokenResolver.source_tags_for_node` — "Render: field + value
// -> canonical token -> text", the render-direction inverse of ingest tokenization. Read the
// operator's own `personal/all.md` and every line carries `#task #personal`; read `inbox.md` and
// every line carries `#task`. Those characters are the engine's, not a person's.
//
// So this table is the same inverse, generated once from the same vocabulary files, and the seed
// is the string the engine would print for a node of that section's resolved type carrying that
// section's declared defaults. `tests/fixtures/resolution-agreement.json` measures it against
// `source_tags_for_node` itself, per section, so a mis-read vocabulary does not survive `npm test`.
//
// ── WHAT THAT SETTLES ABOUT `INPUT WINS`, WHICH IS THE SHARPEST QUESTION HERE ──
//
// A value the browser writes into the source is ingested as AUTHORED and outranks the rule that
// produced it (`io/applier.py`'s `_merge_registration_defaults`: the SECTION layer fills only a
// field the line does not already carry). So seeding is not free — it converts a DERIVED value
// into an AUTHORED one.
//
// It costs nothing HERE, and the reason is exactly the one above: the engine performs that same
// conversion itself, one cycle later, when it prints the tag back. `#personal` on a line in
// `personal/all.md` is already an authored domain token by the time the operator next sees the
// file. Seeding reaches the SAME fixed point one cycle earlier; it does not create one.
//
// A field with NO token is therefore never seeded — not as a limitation but as the same rule read
// the other way. `project` (60 sections) has no tag in the vocabulary, so the engine never prints
// it either; a browser that wrote `project` into the line would be inventing a spelling the engine
// does not use and freezing a value the engine goes on deciding invisibly. Every such field is
// recorded in `dropped`, per section, with the field named.
//
// ── AND WHY THE TYPE TAG IS REFUSED IN SOME SECTIONS: §3.3, DERIVED RATHER THAN NAMED ──
//
// `design-the-rule-mirror.md` §3.3 measured that in 13 of 186 sections the registration answer is
// WRONG by the end of the cycle: the view declares `default_node_type: routine`, a bare capture
// carries no cadence, and `routine-without-cadence-becomes-task` retypes it inside the SAME pass
// that minted it. A seed that wrote `#routine` there would be confidently wrong within seconds.
//
// NO CODE HERE NAMES `routine`, that rule, or any section. `readRetypeRefusals` reads
// `config/rules/*.yaml`, finds every rule carrying a `set_node_type` action, and normalises its
// `for_each` pattern and its `when:` into a CLOSED grammar — a `root.find` over node fields with
// no traversal step, and a `when:` of `null` / `not` / literal `eq`. A rule that normalises and
// whose `when:` is TRUE for the bare capture that section would mint refuses that section's type
// tag. A rule that does NOT normalise is recorded in `dropped` and evaluated by nobody.
//
// THE BOUNDARY, STATED: a rule whose pattern TRAVERSES (four of the nine) binds through a related
// node this generator does not read, so it is out of the grammar rather than assumed harmless.
// The corroboration is `design-the-rule-mirror.md` §3.2's own [OBS] sweep — the engine's real rule
// pass, run over all 186 sections, found the union of rules a bare capture reaches is exactly TWO,
// and no traversing rule among them. The boundary is stated and backed by that measurement, never
// by this generator's silence.

const CAPTURE_FIELDS_NOTE =
  "a new line carries its resolved node type, the schema's declared field defaults and its " +
  "section's own 'defaults:' block, and nothing else";

/**
 * `field_types.<f>.default` — what a field holds on a node nobody has typed a value for.
 *
 * NOT A DROP when the mapping is absent: a config that declares no field defaults has none, and
 * `{}` is that config's own answer rather than a declaration this reader discarded. The positive
 * control against a silent `{}` on a config that DOES declare them is
 * `tests/present-newline.test.mjs`'s assertion that 13 of the operator's 186 sections refuse their
 * type tag — a count that collapses to 0 the moment this returns nothing it should have returned.
 */
function readFieldDefaults(configDir) {
  const schema = readYaml(join(configDir, "schema.yaml"));
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

/**
 * The vocabulary, read in the RENDER direction: `field + value -> the one token that spells it`.
 *
 * Mirrors `source_tags_for_node`'s two halves — one type tag, then one field tag per field-target
 * token whose value is set — including its ORDER, which is the vocabulary's own declaration order
 * and is why `fieldOrder` is an array rather than the object's key set. Files are walked sorted by
 * name, families in declaration order, entries in list order, and the FIRST token to claim a
 * (field, value) pair keeps it, the same way the engine's own render index resolves a duplicate.
 *
 * Two kinds of row are excluded, both because the ENGINE refuses them and not because this reader
 * finds them awkward: `render_only: true` (a derived display value the engine never reads back
 * from that glyph) and a non-scalar or absent `value:` (nothing fixed to key by). Markers are not
 * read here at all — `source_markers_for_node` is a separate emission, no section default names a
 * marker field, and a seeded `🆕` would be the browser claiming a stamp only a rule can make.
 */
function readSpelling(configDir, ledger) {
  const dir = join(configDir, "vocabulary");
  if (!existsSync(dir)) throw new GenerationError(`${dir} does not exist`);
  const typeTokens = {};
  const fieldOrder = [];
  const fieldTokens = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort()) {
    const document = readYaml(join(dir, file));
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
        // NOT A DROP: an entry declaring neither `node_type:` nor `field:` — an edge tag, a
        // deletion gesture, a structural token — spells no field, so nothing was discarded.
        // `generate-qualification-declaration.mjs`'s own token loop states the same for the same
        // rows: a ledger that listed every token on a different axis would be noise.
        if (!isNonEmptyString(entry.field)) continue;
        // DROP PATH 16. A tag the engine itself never ingests back from its own glyph. Seeding one
        // would write characters the next cycle refuses to read — the opposite of a round trip.
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
        const key = String(entry.value);
        if (fieldTokens[entry.field][key] === undefined) fieldTokens[entry.field][key] = entry.token;
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

/** `$current.node.fields.X` -> `X`, and nothing else is a field reference this reader accepts. */
const FIELD_REF = /^\$current\.node\.fields\.([A-Za-z_][A-Za-z0-9_]*)$/;

class WhenRefusal extends Error {}

/**
 * One `when:` clause, normalised into a predicate over a bare capture's own fields, or refused.
 *
 * Three forms, and they are the three the operator's own retype rules use. `null` asks whether a
 * field is unset — the form that makes §3.3's retype fire on a line nobody has typed a cadence
 * into. `not` inverts. `eq` over two literals is a constant. Anything reaching outside the node's
 * own field map — an edge, the clock, a cycle variable — throws, and its rule is recorded rather
 * than evaluated.
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
 * Every rule that retypes, reduced to `(pattern find, when)` — or recorded and left unevaluated.
 *
 * A rule qualifies only when the WHOLE of it normalises: its `for_each` names a pattern, that
 * pattern's `root.find` is a mapping of node fields with no `$` in it, it declares no traversal
 * step, and its `when:` reduces through `evaluateWhen` above. This is the qualification
 * generator's own posture, applied to a second language.
 */
function readRetypeRules(configDir, ledger) {
  const patternsDir = join(configDir, "patterns");
  const rulesDir = join(configDir, "rules");
  // NOT A DROP: a config with no `rules/` directory declares no rules, so there is no retype to
  // evaluate and nothing was discarded. The positive control against this returning `[]` on a
  // config that DOES declare retypes is the 13-section count asserted in
  // `tests/present-newline.test.mjs` — see `readFieldDefaults`'s own note.
  if (!existsSync(rulesDir) || !existsSync(patternsDir)) return [];

  const patterns = new Map();
  for (const file of readdirSync(patternsDir).filter((f) => f.endsWith(".yaml")).sort()) {
    const document = readYaml(join(patternsDir, file));
    if (!document || typeof document !== "object" || Array.isArray(document)) continue;
    for (const [name, config] of Object.entries(document)) {
      if (!patterns.has(name)) patterns.set(name, config);
    }
  }

  const out = [];
  for (const file of readdirSync(rulesDir).filter((f) => f.endsWith(".yaml")).sort()) {
    let document;
    try {
      document = readYaml(join(rulesDir, file));
    } catch (error) {
      // DROP PATH 17a. A rules file this reader cannot parse. Every retype it declares goes
      // unevaluated, so every section whose type it would have refused is seeded as if the rule
      // did not exist — the one silence in this whole table that could be confidently wrong.
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
        // DROP PATH 18. THE BOUNDARY, RECORDED. A traversing pattern binds through a related node
        // this generator does not read. `design-the-rule-mirror.md` §3.2's engine-run sweep found
        // no traversing rule reaches a bare capture in any of the operator's 186 sections; that is
        // the corroboration, and it is a measurement rather than this generator's silence.
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

/**
 * The seed for one section: the tokens the engine would print for the node it would mint here.
 *
 * `fields` is the bare capture — resolved node type, the schema's declared field defaults, and the
 * section's own `defaults:`. Returns the token list, and drops a reason for every declared fact it
 * could not spell.
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
    // deciding — see this section's header on `INPUT WINS`.
    ledger.drop(
      `${what} default '${field}'`,
      `no vocabulary tag spells ${field}=${JSON.stringify(value)}, so it cannot be written into a ` +
        "line the operator types (the engine prints no tag for it either)",
    );
  }
  return tokens;
}

/**
 * `view -> section -> {nodeType, defaults?, tokens}` for EVERY section of every view sheet.
 *
 * NOT gated on the section's qualification, and that is the whole reason this table exists rather
 * than a widening of `qualification.sections`. That table is the MEMBERSHIP half and drops a
 * section whose predicate would not normalise — 137 of 186, and `all-personal.tasks`, the
 * operator's own worked example, is one of them (`all-personal-nodes` compares `available_date`
 * against the clock). What a new line BECOMES does not depend on what already belongs, so gating
 * one on the other would refuse his headline case for a reason that has nothing to do with it.
 * Same precedent, same file: `ordering` above republishes `name:` for the identical reason.
 */
function readSectionRegistration(configDir, viewFiles, registration, ledger) {
  const fieldDefaults = readFieldDefaults(configDir);
  const spelling = readSpelling(configDir, ledger);
  const retypeRules = readRetypeRules(configDir, ledger);
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

// ── assemble ─────────────────────────────────────────────────────────────────────────────────

export function generateResolution(configDir, ledger = new Ledger()) {
  const viewFiles = readViewFiles(configDir, ledger);
  const registration = readRegistration(configDir, viewFiles);
  const candidates = collectDefaultNodeTypeCandidates(registration, viewFiles);
  const ordering = readOrdering(viewFiles, ledger);
  const orderingFields = readOrderingFieldMarkers(configDir, orderingFieldNames(ordering), ledger);
  const chromeShapes = readChromeShapes(configDir, candidates, ledger);
  const sectionRegistration = readSectionRegistration(configDir, viewFiles, registration, ledger);
  return {
    registration,
    lineGrammars: readLineGrammars(configDir),
    ordering,
    orderingFields,
    dayBoundary: readDayBoundary(configDir),
    chromeShapes,
    sectionRegistration,
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

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
 *     order, published exactly as declared. NOT `persist_placing` (design §5.8): that is the
 *     engine's own still-open fold of `ordering_mode` + `pin_after_qualification_drops` into one
 *     knob, unresolved, and reproducing the fold here would be a second interpreter of a decision
 *     the engine has not finished making. `pin_after_qualification_drops` (14 sections) is left
 *     out for the same reason — it decides whether an EXISTING placed row keeps its slot after it
 *     stops qualifying, not what a NEW line becomes, and there is no browser-side "existing row"
 *     concept yet for it to inform.
 *   dayBoundary — `day_boundary.yaml`'s 3 keys, verbatim.
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

// ── 4. views/*.yaml -> read once, shared by readRegistration's guard and readOrdering ─────────

function readViewFiles(configDir) {
  const dir = join(configDir, "views");
  if (!existsSync(dir)) throw new GenerationError(`${dir} does not exist`);
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort();
  const out = [];
  for (const file of files) {
    if (file === "default_registration.yaml") continue;
    const document = readYaml(join(dir, file));
    if (!document || typeof document !== "object" || Array.isArray(document)) continue;
    const entries = Object.entries(document);
    if (entries.length !== 1) continue;
    const [viewId, view] = entries[0];
    if (!view || typeof view !== "object" || !Array.isArray(view.sections)) continue;
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

function readOrdering(viewFiles) {
  const out = {};
  for (const [file, view] of viewFiles) {
    const sections = {};
    for (const section of view.sections) {
      if (!section || typeof section !== "object" || typeof section.id !== "string") continue;
      const fields = readOrderingFields(section, `${file}: section '${section.id}'`);
      if (Object.keys(fields).length > 0) sections[section.id] = fields;
    }
    if (Object.keys(sections).length > 0) out[view.viewId] = sections;
  }
  return out;
}

// ── assemble ─────────────────────────────────────────────────────────────────────────────────

export function generateResolution(configDir) {
  const viewFiles = readViewFiles(configDir);
  return {
    registration: readRegistration(configDir, viewFiles),
    lineGrammars: readLineGrammars(configDir),
    ordering: readOrdering(viewFiles),
    dayBoundary: readDayBoundary(configDir),
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

  const resolution = generateResolution(args.configDir);
  const presentationPath = join(REPO_ROOT, "presentation.json");
  const current = JSON.parse(readFileSync(presentationPath, "utf8"));

  if (args.check) {
    if (JSON.stringify(current.resolution) === JSON.stringify(resolution)) {
      console.log("presentation.json's 'resolution' key matches the monorepo config.");
      return;
    }
    console.error("presentation.json's 'resolution' key is STALE relative to the monorepo config.");
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
      `${orderingSections} ordering sections, day boundary ${resolution.dayBoundary.timezone}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(String(e?.message || e));
    process.exit(e instanceof GenerationError ? 2 : 1);
  });
}

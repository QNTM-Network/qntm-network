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
 * ── THE PURE/SHELL SPLIT — `design-the-runtime-compile.md` step C's remaining generator ──
 *
 * `compile(files)` is a PURE FUNCTION over an in-memory map of path -> contents. It touches no
 * filesystem and no command line, so it is the same code whether the caller is this file's own CLI
 * shell (reading the operator's laptop) or a Cloudflare Worker route (reading bytes a browser
 * POSTed). It now lives in its own file, `scripts/compile-resolution.mjs` — split out from THIS
 * file the same way, and for the same reason, `compile-structural.mjs` was split from
 * `generate-structural-declaration.mjs` (`5d4f1b5`, PR #84) and `compile-qualification.mjs` from
 * `generate-qualification-declaration.mjs` (`9be7f13`, PR #86): this file's CLI-only imports
 * (`node:fs`, `scripts/monorepo-config.mjs`, and that module's own module-level
 * `fileURLToPath(import.meta.url)`) would crash a Worker at module load the moment anything
 * imported `compile` from here. See `compile-resolution.mjs`'s own header for the full account;
 * `worker/src/config.js`'s Gate-1 route for this generator imports `compile` from THAT file, never
 * this one. `generateResolution(configDir, ledger)` below is the thin shell: it reads exactly the
 * nine things this script has always read — `schema.yaml`, `line_grammars.yaml`, `day_boundary.
 * yaml`, every `views/*.yaml` (including `default_registration.yaml`), every `vocabulary/*.yaml`,
 * every `patterns/*.yaml` and every `rules/*.yaml`, each sorted — into a files map and hands it to
 * the imported `compile`. Nothing about WHAT is read or the ORDER it is read in changed; only WHERE
 * the reading happens, and which file the parsing logic lives in, moved.
 *
 * ── USAGE ──
 *
 *   node scripts/generate-resolution-declaration.mjs                 write presentation.json
 *   node scripts/generate-resolution-declaration.mjs --check         diff only, exit 1 if stale
 *   node scripts/generate-resolution-declaration.mjs --config-dir X  override the config path
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG_DIR, REPO_ROOT } from "./monorepo-config.mjs";
import { Ledger, reportDropped } from "./ledger.mjs";
import {
  compile,
  GenerationError,
  SCHEMA_KEY,
  LINE_GRAMMARS_KEY,
  DAY_BOUNDARY_KEY,
  VIEWS_PREFIX,
  VOCABULARY_PREFIX,
  PATTERNS_PREFIX,
  RULES_PREFIX,
} from "./compile-resolution.mjs";

// Re-exported, not restated: `tests/declaration-drop.test.mjs` and
// `tests/app-generality-acceptance.test.mjs` import it from here.
export { DEFAULT_CONFIG_DIR };

// Re-exported so every existing importer keeps working unchanged. A Worker route must import
// `compile` from `compile-resolution.mjs` itself, never from here — see that file's header for why
// (importing from here drags in `node:fs` and `monorepo-config.mjs`'s module-level
// `fileURLToPath`, which crashes a Worker at load).
export { compile };

// ── the fs shell — reads the operator's laptop into a files map, then calls the pure compile ───

/**
 * Read exactly the files `compile` recognises out of a real config directory, sorted the same way
 * `compile` itself would apply if handed an unordered map — stated once, here, rather than trusted
 * to happen twice.
 *
 * EXPORTED so a mutation-proof harness can recombine it with a MUTATED `compile` (imported from a
 * patched copy of `compile-resolution.mjs`) — the same shape `readConfigTree` in
 * `generate-qualification-declaration.mjs` already exports for exactly that reason.
 *
 * @param {string} configDir
 * @returns {Record<string, string>}
 */
export function readConfigTree(configDir) {
  const files = {};

  const schemaPath = join(configDir, "schema.yaml");
  if (existsSync(schemaPath)) files[SCHEMA_KEY] = readFileSync(schemaPath, "utf8");

  const lineGrammarsPath = join(configDir, "line_grammars.yaml");
  if (existsSync(lineGrammarsPath)) files[LINE_GRAMMARS_KEY] = readFileSync(lineGrammarsPath, "utf8");

  const dayBoundaryPath = join(configDir, "day_boundary.yaml");
  if (existsSync(dayBoundaryPath)) files[DAY_BOUNDARY_KEY] = readFileSync(dayBoundaryPath, "utf8");

  const viewsDir = join(configDir, "views");
  if (existsSync(viewsDir)) {
    for (const f of readdirSync(viewsDir).filter((f) => f.endsWith(".yaml")).sort()) {
      files[`${VIEWS_PREFIX}${f}`] = readFileSync(join(viewsDir, f), "utf8");
    }
  }

  const vocabularyDir = join(configDir, "vocabulary");
  if (existsSync(vocabularyDir)) {
    for (const f of readdirSync(vocabularyDir).filter((f) => f.endsWith(".yaml")).sort()) {
      files[`${VOCABULARY_PREFIX}${f}`] = readFileSync(join(vocabularyDir, f), "utf8");
    }
  }

  const patternsDir = join(configDir, "patterns");
  if (existsSync(patternsDir)) {
    for (const f of readdirSync(patternsDir).filter((f) => f.endsWith(".yaml")).sort()) {
      files[`${PATTERNS_PREFIX}${f}`] = readFileSync(join(patternsDir, f), "utf8");
    }
  }

  const rulesDir = join(configDir, "rules");
  if (existsSync(rulesDir)) {
    for (const f of readdirSync(rulesDir).filter((f) => f.endsWith(".yaml")).sort()) {
      files[`${RULES_PREFIX}${f}`] = readFileSync(join(rulesDir, f), "utf8");
    }
  }

  return files;
}

/**
 * Unchanged external contract: same two arguments, same merged return shape (`{registration,
 * lineGrammars, ordering, orderingFields, dayBoundary, chromeShapes, sectionRegistration, dropped}`)
 * every existing caller — `scripts/checkdeclarations.mjs`, `tests/declaration-drop.test.mjs`,
 * `tests/app-generality-acceptance.test.mjs`, `scripts/resolution-agreement.py` (via the committed
 * `presentation.json`) — already depends on. Internally this is now a files-map build plus a call
 * to the pure `compile`, not its own parse.
 */
export function generateResolution(configDir, ledger = new Ledger()) {
  const files = readConfigTree(configDir);
  const { declaration, dropped } = compile(files, ledger);
  return { ...declaration, dropped };
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

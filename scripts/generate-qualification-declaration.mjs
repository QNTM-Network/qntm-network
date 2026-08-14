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
 * 252 pattern definitions in 138 files. 124 of 159 are a predicate over the candidate node's OWN
 * fields and nothing else — decidable with no graph walk, no clock and no cycle; the other 35 are
 * not, and this generator publishes nothing about them. `docs/architecture/capabilities.yaml`'s
 * `section-membership-is-read-not-guessed` row carries the full classification; cited, not
 * restated here.
 *
 * ── THE PURE/SHELL SPLIT — `design-the-runtime-compile.md` step C ──
 *
 * `compile(files)` is a PURE FUNCTION over an in-memory map of path -> contents. It touches no
 * filesystem and no command line, so it is the same code whether the caller is this file's own CLI
 * shell (reading the operator's laptop) or a Cloudflare Worker route (reading bytes a browser
 * POSTed). It now lives in its own file, `scripts/compile-qualification.mjs` — split out from THIS
 * file the same way, and for the same reason, `compile-structural.mjs` was split from
 * `generate-structural-declaration.mjs` (`5d4f1b5`, PR #84): this file's CLI-only imports
 * (`node:fs`, `scripts/monorepo-config.mjs`, and that module's own module-level
 * `fileURLToPath(import.meta.url)`) would crash a Worker at module load the moment anything
 * imported `compile` from here. See `compile-qualification.mjs`'s own header for the full account;
 * `worker/src/config.js`'s Gate-1 route for this generator imports `compile` from THAT file, never
 * this one. `generateQualification(configDir, ledger)` below is the thin shell: it reads exactly
 * the four things this script has always read — `schema.yaml`, every `patterns/*.yaml`, every
 * `views/*.yaml` (including `default_registration.yaml`), every `vocabulary/*.yaml`, each sorted —
 * into a files map and hands it to the imported `compile`. Nothing about WHAT is read or the ORDER
 * it is read in changed; only WHERE the reading happens, and which file the parsing logic lives
 * in, moved.
 *
 * ── WHY A HAND-ROLLED YAML SUBSET, NOT A LIBRARY ──
 *
 * `scripts/yaml-subset.mjs` — no YAML dependency exists in this repo's `package.json`. Same call
 * `generate-structural-declaration.mjs`'s header already explains for its own hand-rolled scanner:
 * a targeted parser that FAILS LOUD on a shape it does not recognise, rather than a general parser
 * that might silently accept one it should not.
 *
 * ── WHAT IT REFUSES ──
 *
 * A pattern is published only when the whole of it normalises into the closed grammar
 * `compile-qualification.mjs`'s `normalisePattern` defines: `find: node_type + field predicates`,
 * `predicate: {eq: scalar|null} | {not: <predicate>}`, refusing the orderable comparisons, any
 * `$variable`, non-empty `parameters`, any step that is not `{not: [{find_nodes: <find>}], min:
 * 1}`, and any traversal step. Anything else is recorded in `refused` WITH ITS REASON and no
 * predicate is emitted, so a section the browser cannot decide is a section the browser says
 * nothing about.
 *
 * ── THE RESOLVABLE-FIELD SET — GENERATED INTO TWO OTHER FILES, NOT HAND-COPIED ──
 *
 * `scripts/generate-operator-set.mjs` writes `app/present/membership.ts`'s and `scripts/
 * qualification-agreement.py`'s own literal copies of the field list FROM `deriveResolvableFields`
 * (`compile-qualification.mjs`), called against the real monorepo config — not from a constant
 * exported here. 2026-08-06: the list stopped being a constant at all (it is now a measurement of
 * the config, not a fact about this codebase), so `generate-operator-set.mjs` compiles the real
 * config to get the concrete value for THIS operator's instance, the same way `generateQualification`
 * below does — one source, still, just a function of the config instead of a literal in it.
 *
 * ── WHAT IT IS NOT ──
 *
 * It is not a second interpreter of the structural language, and it never decides anything the
 * engine then has to honour. The engine remains the only writer. What this publishes is READ by
 * the browser to DISPLAY a consequence of an edit already in flight.
 *
 * ── `sectionOrder` — THE ORDINAL->ID JOIN, PUBLISHED BESIDE `sections`, NEVER DERIVED FROM IT ──
 *
 * `sections` is the PUBLISHED subset — one entry per section whose qualification survived
 * normalisation. `sectionOrder` is the FULL declared order, unfiltered — `app/present/address.ts`
 * counts headings positionally and indexes THIS list, because a section still emits its heading
 * even when its qualification was refused.
 *
 * ── USAGE ──
 *
 *   node scripts/generate-qualification-declaration.mjs                 write presentation.json
 *   node scripts/generate-qualification-declaration.mjs --check         diff only, exit 1 if stale
 *   node scripts/generate-qualification-declaration.mjs --config-dir X  override the config path
 *   node scripts/generate-qualification-declaration.mjs --check --require-config  ... and FAIL if there is no config to check
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { readLedger, writeLedger, withoutLedger, ledgerIsPresent } from "./dropped-ledger.mjs";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG_DIR, REPO_ROOT, notCheckedReport } from "./monorepo-config.mjs";
import { Ledger, reportDropped } from "./ledger.mjs";
import {
  compile,
  GenerationError,
  deriveResolvableFields,
  normalisePattern,
  SCHEMA_KEY,
  PATTERNS_PREFIX,
  VIEWS_PREFIX,
  VOCABULARY_PREFIX,
} from "./compile-qualification.mjs";

// Re-exported, not restated: `tests/present-qualification.test.mjs` and
// `tests/declaration-drop.test.mjs` import it from here.
export { DEFAULT_CONFIG_DIR };

// Re-exported so every existing importer keeps working unchanged: `tests/operator-set-
// agreement.test.mjs` imports `normalisePattern` and `deriveResolvableFields` directly from this
// file, and `scripts/generate-operator-set.mjs` calls `deriveResolvableFields` (against the files
// map `readConfigTree` below builds) rather than importing a frozen list — 2026-08-06, the
// `RESOLVABLE_FIELDS` constant this file used to re-export was retired in favour of that function;
// see `compile-qualification.mjs`'s own header for why a frozen list could never be correct for a
// config it had not been hand-updated for. A Worker route must import `compile` (and
// `deriveResolvableFields`, if it needs the set on its own) from `compile-qualification.mjs`
// itself, never from here — see that file's header for why (importing from here drags in
// `node:fs` and `monorepo-config.mjs`'s module-level `fileURLToPath`, which crashes a Worker at
// load).
export { compile, deriveResolvableFields, normalisePattern };

// ── the fs shell — reads the operator's laptop into a files map, then calls the pure compile ───

/**
 * Read exactly the files `compile` recognises out of a real config directory, sorted the same way
 * `compile` itself would apply if handed an unordered map — stated once, here, rather than trusted
 * to happen twice.
 *
 * EXPORTED so `tests/declaration-drop.test.mjs`'s mutation-proof harness can recombine it with a
 * MUTATED `compile` (imported from a patched copy of `compile-qualification.mjs`) — the harness
 * mutates the parsing logic, never the file-reading, so this real, unmutated function is what it
 * reuses to build the files map the mutant `compile` is driven with.
 *
 * @param {string} configDir
 * @returns {Record<string, string>}
 */
export function readConfigTree(configDir) {
  const files = {};

  const schemaPath = join(configDir, "schema.yaml");
  if (existsSync(schemaPath)) files[SCHEMA_KEY] = readFileSync(schemaPath, "utf8");

  const patternsDir = join(configDir, "patterns");
  for (const f of readdirSync(patternsDir).filter((f) => f.endsWith(".yaml")).sort()) {
    files[`${PATTERNS_PREFIX}${f}`] = readFileSync(join(patternsDir, f), "utf8");
  }

  const viewsDir = join(configDir, "views");
  for (const f of readdirSync(viewsDir).filter((f) => f.endsWith(".yaml")).sort()) {
    files[`${VIEWS_PREFIX}${f}`] = readFileSync(join(viewsDir, f), "utf8");
  }

  const vocabularyDir = join(configDir, "vocabulary");
  for (const f of readdirSync(vocabularyDir).filter((f) => f.endsWith(".yaml")).sort()) {
    files[`${VOCABULARY_PREFIX}${f}`] = readFileSync(join(vocabularyDir, f), "utf8");
  }

  return files;
}

/**
 * Unchanged external contract: same two arguments, same merged return shape
 * (`{defaultNodeType, structuralNodeTypes, tokens, predicates, sections, sectionOrder, refused,
 * dropped}`) every existing caller — `scripts/checkdeclarations.mjs`,
 * `tests/present-qualification.test.mjs`, `tests/declaration-drop.test.mjs`,
 * `tests/app-generality-acceptance.test.mjs` — already depends on. Internally this is now a
 * files-map build plus a call to the pure `compile`, not its own parse.
 */
export function generateQualification(configDir, ledger = new Ledger()) {
  const files = readConfigTree(configDir);
  const { declaration, dropped } = compile(files, ledger);
  return { ...declaration, dropped };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { check: false, requireConfig: false, configDir: DEFAULT_CONFIG_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--check") args.check = true;
    // --require-config turns "there was nothing to check" from exit 3 into exit 1. CI never passes
    // it, so the runner keeps its green tick on a genuinely absent monorepo; a local caller that
    // MEANT to check the operator's config passes it and finds out when the check did not run.
    else if (argv[i] === "--require-config") args.requireConfig = true;
    else if (argv[i] === "--config-dir") args.configDir = resolve(argv[++i]);
    else throw new GenerationError(`unknown flag: ${argv[i]}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.configDir)) {
    for (const line of notCheckedReport(args.configDir, args.requireConfig)) console.error(line);
    process.exit(args.requireConfig ? 1 : 3);
  }

  const ledger = new Ledger();
  const qualification = generateQualification(args.configDir, ledger);
  const presentationPath = join(REPO_ROOT, "presentation.json");
  const current = JSON.parse(readFileSync(presentationPath, "utf8"));

  if (args.check) {
    if (JSON.stringify(current.qualification) === JSON.stringify(withoutLedger(qualification))) {
      console.log("presentation.json's 'qualification' key matches the monorepo config.");
      return;
    }
    console.error("presentation.json's 'qualification' key is STALE relative to the monorepo config.");
    // WHICH declaration went stale, when the answer is a drop. A `dropped` map that gained or lost
    // an entry means a config change either stopped reaching the browser or started reaching it,
    // and that is the sentence the operator needs — not "something differs".
    // THE BASELINE IS THE SIBLING LEDGER, NOT THE SERVED PAYLOAD. It used to be
    // `current.qualification?.dropped ?? {}` — the drops read back out of presentation.json, which is
    // why 38 KB of ledger was shipping to the browser. See scripts/dropped-ledger.mjs.
    //
    // AND THE ABSENT CASE IS SAID OUT LOUD. `?? {}` on a missing baseline reports EVERY drop as
    // newly dropped, on every run, without failing — the uniformly-wrong answer this whole move
    // exists to avoid re-creating one layer along.
    if (!ledgerIsPresent(presentationPath)) {
      console.error(
        "  NO DROP BASELINE — presentation-dropped.json is absent, so every drop below would " +
          "read as NEW. Regenerate to create it; the list is the full set, not a delta.",
      );
    }
    const before = readLedger(presentationPath, 'qualification');
    const after = qualification.dropped;
    for (const key of Object.keys(after)) {
      if (!(key in before)) console.error(`  NEWLY DROPPED  ${key}: ${after[key]}`);
    }
    for (const key of Object.keys(before)) {
      if (!(key in after)) console.error(`  NO LONGER DROPPED  ${key}`);
    }
    process.exit(1);
  }

  writeFileSync(
    presentationPath,
    JSON.stringify({ ...current, qualification: withoutLedger(qualification) }, null, 2) + "\n",
  );
  // THE LEDGER GOES BESIDE THE DECLARATION, committed but never served — it is the baseline the
  // `--check` above diffs against, and it is the one thing in this file the browser never reads.
  const ledgerPath = writeLedger(presentationPath, 'qualification', qualification.dropped);
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

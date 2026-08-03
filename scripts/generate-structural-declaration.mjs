/**
 * generate-structural-declaration — writes `presentation.json`'s `structural` key FROM the
 * monorepo's own config, never by hand.
 *
 * `docs/implementation-artifacts/design-the-structural-language.md`, ranked item #1, names the
 * condition this script exists to satisfy: "Generate it from config/, do not hand-write it...
 * Generation matters: a hand-written copy is the INDENT_UNIT mistake again" — that design's own
 * §3 catalogues one number, transcribed by hand, disagreeing with itself in two executable places
 * and three stale citations before anyone noticed. This script is what keeps the structural
 * declaration from becoming a second copy of that mistake.
 *
 * ── THE PURE/SHELL SPLIT — `design-the-runtime-compile.md` step B ──
 *
 * `compile(files)` is a PURE FUNCTION over an in-memory map of path -> contents. It touches no
 * filesystem and no command line, so it is the same code whether the caller is this file's own
 * CLI shell (reading the operator's laptop) or a Cloudflare Worker route (reading bytes a browser
 * POSTed) — `design-config-is-content.md`'s own finding that this generator is portable, made
 * concrete. It now lives in its own file, `scripts/compile-structural.mjs` — split out from THIS
 * file after "the function is pure" turned out not to imply "the file is safe to import in a
 * Worker": this file's CLI-only imports (`node:fs`, `scripts/monorepo-config.mjs`, and that
 * module's own module-level `fileURLToPath(import.meta.url)`) crashed the Worker at module load
 * the moment anything imported `compile` from here, before any code ran. See
 * `compile-structural.mjs`'s own header for the exact error and the reasoning; the short version
 * is in `worker/src/config.js`'s Gate-1 route now importing `compile` from THAT file, never this
 * one. `generateStructural(configDir, ledger)` below is the thin shell: it reads exactly the three
 * things this script has always read — `vocabulary/structural_tokens.yaml`, `schema.yaml`, every
 * `views/*.yaml`, sorted — into a files map and hands it to the imported `compile`. Nothing about
 * WHAT is read or the ORDER it is read in changed; only WHERE the reading happens, and which file
 * the parsing logic lives in, moved.
 *
 * It reads THREE things, read-only, from the monorepo (never writes there, never runs a cycle,
 * never touches the vault):
 *
 *   vocabulary/structural_tokens.yaml   the GLOBAL indent binding (edge type + direction)
 *   schema.yaml                          edge_types -> cardinality, for the types that
 *                                         actually appear elsewhere in the declaration
 *   views/*.yaml                         every section's own structural_edge_types /
 *                                         structural_edge_direction override, if it has one
 *
 * ── WHY A HAND-ROLLED SCANNER, NOT A YAML LIBRARY ──
 *
 * Same call `scripts/graph-sync.mjs`'s `parseViewMeta` already made for the same files: "minimal
 * field extraction — we only need id / path / domain, not full YAML." No YAML dependency exists
 * in this repo's `package.json`, and adding one to read three fields nested a few levels deep is
 * a bigger surface than a targeted, indentation-aware line scan. This is NOT a general YAML
 * parser; it knows the exact shapes these three files use (block mappings, one flow-style list
 * `[A, B]`) and FAILS LOUD — throws, non-zero exit, no output written — the moment a file does not
 * match what it expects, rather than silently emitting something wrong. "Report, never guess"
 * applies to this script's own read of the monorepo exactly as it applies to the browser's read
 * of what this script produces.
 *
 * ── THE ONE THING THIS SCRIPT VALIDATES THAT THE ENGINE DOES NOT (YET) ──
 *
 * The design document's §1 names a real gap: `edge_type` in `structural_tokens.yaml` is not
 * checked against the edge registry at bundle load, so a typo survives validation and fails only
 * per-line, at apply time. This script closes that gap for exactly what it publishes: every edge
 * type named by the global indent binding or by a section override must exist in
 * `schema.yaml`'s `edge_types:` registry, or generation refuses. This is NOT the engine fix
 * (ranked item #4, `apps/qntm-md`) — it is a publish-time check that this document at least never
 * ships a name the app could show that the graph has never heard of.
 *
 * ── USAGE ──
 *
 *   node scripts/generate-structural-declaration.mjs                 write presentation.json
 *   node scripts/generate-structural-declaration.mjs --check         compute and diff, write nothing,
 *                                                                     exit 1 if presentation.json is stale
 *   node scripts/generate-structural-declaration.mjs --config-dir X  override the monorepo config path
 *
 * `--config-dir` defaults to the sibling checkout this worktree already assumes for `flow-trace`
 * (`../../qntm`, i.e. `apps/qntm-md/config` inside it) — overridable because CI does not check out
 * the monorepo and `--check` there is expected to report "monorepo not found" rather than crash;
 * see `tests/present-structural.test.mjs` for how the test suite uses the same override.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG_DIR, REPO_ROOT } from "./monorepo-config.mjs";
import { Ledger, reportDropped } from "./ledger.mjs";
import {
  compile,
  GenerationError,
  STRUCTURAL_TOKENS_KEY,
  SCHEMA_KEY,
  VIEWS_PREFIX,
} from "./compile-structural.mjs";

// Re-exported, not restated: `tests/present-structural.test.mjs` imports it from here, and
// `scripts/monorepo-config.mjs` is now the one place the path to the monorepo is written down.
export { DEFAULT_CONFIG_DIR };

// Re-exported so anything that imported `compile` from THIS file before the split (nothing did,
// within this repo, as of this session) keeps working — but see `compile-structural.mjs`'s header
// for why a Worker route must import `compile` from THAT file, never from here: importing it from
// here drags in `node:fs` and `monorepo-config.mjs`'s module-level `fileURLToPath` call, which
// crashes the Worker at load, before any code runs.
export { compile };

// ── the fs shell — reads the operator's laptop into a files map, then calls the pure compile ───

/**
 * Read exactly the files `compile` recognises out of a real config directory, in the same sorted
 * order `compile` itself would apply if handed an unordered map — stated once, here, rather than
 * trusted to happen twice. Views directory absence is NOT guarded: `readdirSync` throws its own
 * ENOENT, unchanged from this script's behaviour before the split.
 *
 * @param {string} configDir
 * @returns {Record<string, string>}
 */
function readConfigTree(configDir) {
  const files = {};

  const tokensPath = join(configDir, "vocabulary", "structural_tokens.yaml");
  if (existsSync(tokensPath)) files[STRUCTURAL_TOKENS_KEY] = readFileSync(tokensPath, "utf8");

  const schemaPath = join(configDir, "schema.yaml");
  if (existsSync(schemaPath)) files[SCHEMA_KEY] = readFileSync(schemaPath, "utf8");

  const viewsDir = join(configDir, "views");
  const viewFiles = readdirSync(viewsDir).filter((f) => f.endsWith(".yaml")).sort();
  for (const f of viewFiles) {
    files[`${VIEWS_PREFIX}${f}`] = readFileSync(join(viewsDir, f), "utf8");
  }

  return files;
}

/**
 * Unchanged external contract: same two arguments, same merged return shape
 * (`{indent, edgeCardinality, sections, dropped}`) every existing caller —
 * `scripts/checkdeclarations.mjs`, `tests/present-structural.test.mjs`,
 * `tests/declaration-drop.test.mjs` — already depends on. Internally this is now a files-map
 * build plus a call to the pure `compile`, not its own parse.
 */
export function generateStructural(configDir, ledger = new Ledger()) {
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
  const structural = generateStructural(args.configDir, ledger);

  const presentationPath = join(REPO_ROOT, "presentation.json");
  const current = JSON.parse(readFileSync(presentationPath, "utf8"));
  const next = { ...current, structural };

  if (args.check) {
    const same = JSON.stringify(current.structural) === JSON.stringify(structural);
    if (same) {
      console.log("presentation.json's 'structural' key matches the monorepo config.");
      return;
    }
    console.error("presentation.json's 'structural' key is STALE relative to the monorepo config.");
    console.error("current: " + JSON.stringify(current.structural, null, 2));
    console.error("generated: " + JSON.stringify(structural, null, 2));
    const before = current.structural?.dropped ?? {};
    for (const [key, why] of Object.entries(structural.dropped)) {
      if (!(key in before)) console.error(`  NEWLY DROPPED  ${key}: ${why}`);
    }
    for (const key of Object.keys(before)) {
      if (!(key in structural.dropped)) console.error(`  NO LONGER DROPPED  ${key}`);
    }
    process.exit(1);
  }

  writeFileSync(presentationPath, JSON.stringify(next, null, 2) + "\n");
  console.log(`wrote structural declaration to ${presentationPath}`);
  reportDropped("structural", ledger);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(String(e?.message || e));
    process.exit(e instanceof GenerationError ? 2 : 1);
  });
}

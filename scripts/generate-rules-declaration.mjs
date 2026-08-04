/**
 * generate-rules-declaration — writes `presentation.json`'s `rules` key FROM the monorepo's own
 * `rules/` directory, never by hand. The fs shell around `scripts/compile-rules.mjs`'s pure
 * compile — the same split every other category compiler uses, and for the same reason: the
 * parsing logic must stay safe to import somewhere with no filesystem (a future Worker route),
 * and this file is the one place that touches `node:fs` for this axis.
 *
 * ── WHAT IT READS ──
 *
 *   rules/*.yaml     every rule file in the operator's `rules/` directory, sorted — not two named
 *                     files. See `compile-rules.mjs`'s header for why this is a widening from
 *                     `generate-capture-rules-declaration.mjs`, which this file replaces.
 *
 * ── NOW WIRED INTO THE SHARED STALENESS GATE ──
 *
 * `generate-capture-rules-declaration.mjs` kept its own `--check` OUTSIDE `checkdeclarations.mjs`'s
 * shared gate because its `dropped` was always `{}` by construction — there was nothing for that
 * gate's "NEWLY DROPPED / NO LONGER DROPPED" reporting to ever say. That is no longer true: this
 * generator enumerates an unbounded `rules/` directory and drops whatever it cannot model, exactly
 * like the other three. So it is now a fourth entry in `scripts/checkdeclarations.mjs`'s
 * `GENERATORS` list, and `build.yml` no longer runs a separate "capture-rules declaration
 * freshness" step for it.
 *
 * ── USAGE ──
 *
 *   node scripts/generate-rules-declaration.mjs                 write presentation.json
 *   node scripts/generate-rules-declaration.mjs --check         diff only, exit 1 if stale
 *   node scripts/generate-rules-declaration.mjs --config-dir X  override the monorepo config path
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG_DIR, REPO_ROOT } from "./monorepo-config.mjs";
import { Ledger, reportDropped } from "./ledger.mjs";
import { compile, GenerationError, RULES_PREFIX } from "./compile-rules.mjs";

// Re-exported, not restated: tests import it from here, same as every sibling generator.
export { DEFAULT_CONFIG_DIR };

// Re-exported so a Worker route (or a test) can import `compile` from this file too — though a
// real Worker route must import it from `compile-rules.mjs` directly, never from here, for the
// same reason stated in every sibling generator's header (this file drags in `node:fs` and
// `monorepo-config.mjs`'s module-level `fileURLToPath`, which crashes a Worker at load).
export { compile };

// ── the fs shell — reads the operator's laptop into a files map, then calls the pure compile ───

/**
 * Read exactly the files `compile` recognises out of a real config directory, sorted the same way
 * `compile` itself would apply if handed an unordered map — stated once, here, rather than trusted
 * to happen twice.
 *
 * EXPORTED so a mutation-proof harness can recombine it with a MUTATED `compile`, the same shape
 * `readConfigTree` in `generate-qualification-declaration.mjs` and `generate-resolution-
 * declaration.mjs` already export for exactly that reason.
 *
 * `rules/` absence is NOT an error: a category with zero rules is a legitimate (if unusual) state,
 * the same posture `generate-resolution-declaration.mjs`'s own `rules/` reader already takes.
 *
 * @param {string} configDir
 * @returns {Record<string, string>}
 */
export function readConfigTree(configDir) {
  const files = {};
  const rulesDir = join(configDir, "rules");
  if (existsSync(rulesDir)) {
    for (const f of readdirSync(rulesDir).filter((f) => f.endsWith(".yaml")).sort()) {
      files[`${RULES_PREFIX}${f}`] = readFileSync(join(rulesDir, f), "utf8");
    }
  }
  return files;
}

/**
 * @param {string} configDir
 * @param {Ledger} [ledger]
 * @returns {{order: object, rules: object, dropped: object}}
 */
export function generateRules(configDir, ledger = new Ledger()) {
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
  const rules = generateRules(args.configDir, ledger);
  const presentationPath = join(REPO_ROOT, "presentation.json");
  const current = JSON.parse(readFileSync(presentationPath, "utf8"));

  if (args.check) {
    if (JSON.stringify(current.rules) === JSON.stringify(rules)) {
      console.log("presentation.json's 'rules' key matches the monorepo config.");
      return;
    }
    console.error("presentation.json's 'rules' key is STALE relative to the monorepo config.");
    const before = current.rules?.dropped ?? {};
    for (const [key, why] of Object.entries(rules.dropped)) {
      if (!(key in before)) console.error(`  NEWLY DROPPED  ${key}: ${why}`);
    }
    for (const key of Object.keys(before)) {
      if (!(key in rules.dropped)) console.error(`  NO LONGER DROPPED  ${key}`);
    }
    process.exit(1);
  }

  writeFileSync(presentationPath, JSON.stringify({ ...current, rules }, null, 2) + "\n");
  const published = Object.keys(rules.rules).length;
  const droppedCount = Object.keys(rules.dropped).length;
  const orderLine = rules.order.established
    ? `order: ${rules.order.sequence.length} rule(s) sequenced`
    : "order: UNESTABLISHED — see rules.order.reason";
  console.log(
    `wrote rules declaration to ${presentationPath}\n` +
      `  ${published} rule(s) published, ${droppedCount} dropped\n  ${orderLine}`,
  );
  reportDropped("rules", ledger);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(String(e?.message || e));
    process.exit(e instanceof GenerationError ? 2 : 1);
  });
}

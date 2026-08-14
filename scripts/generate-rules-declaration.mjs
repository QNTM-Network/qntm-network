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
 *   node scripts/generate-rules-declaration.mjs --check --require-config  ... and FAIL if there is no config to check
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { readLedger, writeLedger, withoutLedger, ledgerIsPresent } from "./dropped-ledger.mjs";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG_DIR, REPO_ROOT, notCheckedReport } from "./monorepo-config.mjs";
import { Ledger, reportDropped } from "./ledger.mjs";
import { compile, GenerationError, RULES_PREFIX, PATTERNS_PREFIX } from "./compile-rules.mjs";
import { VOCABULARY_PREFIX } from "./compile-qualification.mjs";

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
 * the same posture `generate-resolution-declaration.mjs`'s own `rules/` reader already takes. The
 * same now applies to `patterns/` and `vocabulary/`: `compile`'s own PASS 2/PASS 3
 * (`compile-rules.mjs`'s header) read them to resolve a rule's `for_each.pattern` and to spell a
 * `setsField` target's marker — their absence just means every rule needing either drops, which
 * `compile` already reports through `dropped`, not a reason for this shell to refuse to run.
 *
 * 2026-08-06: widened from `vocabulary/markers.yaml` ALONE to the WHOLE `vocabulary/` directory.
 * `compile`'s PASS 2 now calls `deriveResolvableFields(files)` (`compile-qualification.mjs`) to
 * know which of a `for_each.pattern`'s referenced fields a fresh capture can actually resolve —
 * the identical rule `compile-qualification.mjs`'s own shell already reads the whole directory
 * for. Reading only `markers.yaml` starved that derivation of every OTHER vocabulary file
 * (`checkbox.yaml`, `type_tags.yaml`, `domain_tags.yaml`, …), so it could see nothing beyond
 * `title` — refusing `status`, `domain` and every other field a real rule's pattern needs, even
 * though `compile-qualification.mjs` resolves the identical pattern for the SAME config correctly.
 * `MARKERS_KEY` is still exported and still consumed by name (PASS 3, the marker gap) — it is now
 * just one of the many keys this wider read populates, not a special case of its own.
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
  const patternsDir = join(configDir, "patterns");
  if (existsSync(patternsDir)) {
    for (const f of readdirSync(patternsDir).filter((f) => f.endsWith(".yaml")).sort()) {
      files[`${PATTERNS_PREFIX}${f}`] = readFileSync(join(patternsDir, f), "utf8");
    }
  }
  const vocabularyDir = join(configDir, "vocabulary");
  if (existsSync(vocabularyDir)) {
    for (const f of readdirSync(vocabularyDir).filter((f) => f.endsWith(".yaml")).sort()) {
      files[`${VOCABULARY_PREFIX}${f}`] = readFileSync(join(vocabularyDir, f), "utf8");
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
  const rules = generateRules(args.configDir, ledger);
  const presentationPath = join(REPO_ROOT, "presentation.json");
  const current = JSON.parse(readFileSync(presentationPath, "utf8"));

  if (args.check) {
    if (JSON.stringify(current.rules) === JSON.stringify(withoutLedger(rules))) {
      console.log("presentation.json's 'rules' key matches the monorepo config.");
      return;
    }
    console.error("presentation.json's 'rules' key is STALE relative to the monorepo config.");
    // THE BASELINE IS THE SIBLING LEDGER, NOT THE SERVED PAYLOAD. It used to be
    // `current.rules?.dropped ?? {}` — the drops read back out of presentation.json, which is
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
    const before = readLedger(presentationPath, 'rules');
    for (const [key, why] of Object.entries(rules.dropped)) {
      if (!(key in before)) console.error(`  NEWLY DROPPED  ${key}: ${why}`);
    }
    for (const key of Object.keys(before)) {
      if (!(key in rules.dropped)) console.error(`  NO LONGER DROPPED  ${key}`);
    }
    process.exit(1);
  }

  writeFileSync(
    presentationPath,
    JSON.stringify({ ...current, rules: withoutLedger(rules) }, null, 2) + "\n",
  );
  // THE LEDGER GOES BESIDE THE DECLARATION, committed but never served — it is the baseline the
  // `--check` above diffs against, and it is the one thing in this file the browser never reads.
  const ledgerPath = writeLedger(presentationPath, 'rules', rules.dropped);
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

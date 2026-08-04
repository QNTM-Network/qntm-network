/**
 * generate-capture-rules-declaration — writes `presentation.json`'s `captureRules` key FROM the
 * monorepo's own two rule files, never by hand.
 *
 * `docs/implementation-artifacts/design-the-rule-mirror.md` §11 row 4: "publish the two capture
 * rules, and their order, as a closed grammar." `docs/implementation-artifacts/roadmap-the-road-
 * ahead.md` step 3 names it the `½` that must land before the browser can show an engine
 * correction as a visible event — see `scripts/compile-capture-rules.mjs`'s header for the full
 * argument. This file is the thin shell around that pure compile: it reads exactly two files, and
 * nothing else, from the operator's config, and hands their contents to `compile`.
 *
 * ── WHAT IT READS, READ-ONLY, AND NOTHING ELSE ──
 *
 *   rules/cadence_auto_routine.yaml   the retype: `routine-without-cadence-becomes-task`
 *   rules/stamp_created_at.yaml       the stamp:  `stamp-created-at-on-task`
 *
 * No directory is listed. This generator never calls `readdirSync` — unlike its three siblings, it
 * does not sweep an unbounded set of config files; it opens exactly the two paths named above.
 *
 * ── WHY A HAND-ROLLED YAML SUBSET, NOT A LIBRARY ──
 *
 * `scripts/yaml-subset.mjs` — the same reader `generate-qualification-declaration.mjs` uses, and
 * its own header already cites a rule file (`- "null": [$current.node.fields.created_at]`) as one
 * of the real shapes it was built to parse. No new parser was needed for this generator.
 *
 * ── NOT WIRED INTO `scripts/checkdeclarations.mjs`'S SHARED GATE, ON PURPOSE ──
 *
 * The other three generators share a `dropped`-ledger staleness gate because each of them
 * enumerates an unbounded set of config files and may legitimately omit some of what it finds. This
 * generator's `dropped` is always `{}` (see `compile-capture-rules.mjs`'s header) — there is
 * nothing for that gate's "NEWLY DROPPED / NO LONGER DROPPED" reporting to say about it, and
 * `tests/declaration-drop.test.mjs`'s extensive drop-path enumeration is built specifically around
 * the other three's failure modes, not this one's. Folding a fourth generator into that shared
 * pipeline would require rebuilding a fixture and reworking assertions that file already owns for a
 * gate this generator does not need. This generator keeps its OWN `--check`, exactly like each of
 * the other three did before `checkdeclarations.mjs` existed at all, and `build.yml` runs it as its
 * own step — see that workflow file.
 *
 * ── USAGE ──
 *
 *   node scripts/generate-capture-rules-declaration.mjs                 write presentation.json
 *   node scripts/generate-capture-rules-declaration.mjs --check         diff only, exit 1 if stale
 *   node scripts/generate-capture-rules-declaration.mjs --config-dir X  override the monorepo config path
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG_DIR, REPO_ROOT } from "./monorepo-config.mjs";
import { compile, GenerationError, CADENCE_RULES_KEY, STAMP_RULES_KEY } from "./compile-capture-rules.mjs";

export { DEFAULT_CONFIG_DIR, compile };

// ── the fs shell — reads exactly two files, then calls the pure compile ────────────────────────

/**
 * @param {string} configDir
 * @returns {Record<string, string>}
 */
function readConfigTree(configDir) {
  const files = {};
  for (const key of [CADENCE_RULES_KEY, STAMP_RULES_KEY]) {
    const path = join(configDir, ...key.split("/"));
    if (existsSync(path)) files[key] = readFileSync(path, "utf8");
  }
  return files;
}

/**
 * @param {string} configDir
 * @returns {{order: string[], rules: object, dropped: {}}}
 */
export function generateCaptureRules(configDir) {
  const files = readConfigTree(configDir);
  const { declaration, dropped } = compile(files);
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

  const captureRules = generateCaptureRules(args.configDir);
  const presentationPath = join(REPO_ROOT, "presentation.json");
  const current = JSON.parse(readFileSync(presentationPath, "utf8"));

  if (args.check) {
    if (JSON.stringify(current.captureRules) === JSON.stringify(captureRules)) {
      console.log("presentation.json's 'captureRules' key matches the monorepo config.");
      return;
    }
    console.error("presentation.json's 'captureRules' key is STALE relative to the monorepo config.");
    console.error("current: " + JSON.stringify(current.captureRules, null, 2));
    console.error("generated: " + JSON.stringify(captureRules, null, 2));
    process.exit(1);
  }

  writeFileSync(presentationPath, JSON.stringify({ ...current, captureRules }, null, 2) + "\n");
  // `order` is an object, not a sequence — see compile-capture-rules.mjs's header ("THE ORDER") for
  // why this generator does not (yet) claim to know which of the two rules fires first.
  const orderLine = captureRules.order.established
    ? `order: ${captureRules.order.sequence.join(" -> ")}`
    : "order: UNESTABLISHED — see captureRules.order.reason";
  console.log(`wrote capture-rules declaration to ${presentationPath}\n  ${orderLine}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(String(e?.message || e));
    process.exit(e instanceof GenerationError ? 2 : 1);
  });
}

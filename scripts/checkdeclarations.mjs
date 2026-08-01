/**
 * checkdeclarations — ONE staleness gate over all three generated keys, with an exit code CI can
 * read and a test can drive.
 *
 * ── WHY THIS EXISTS ──
 *
 * `design-the-rule-mirror.md` §9.4 measured the hole: all three generators have a `--check` mode
 * that exits 1 when the declaration is stale, none of the three was wired into CI, and the tests
 * that would catch it (`tests/present-qualification.test.mjs` and its twins) are guarded by
 * `existsSync(DEFAULT_CONFIG_DIR)` and therefore SELF-SKIP exactly in CI, which does not clone the
 * monorepo. So a stale declaration shipped green.
 *
 * ── THE HONEST LIMIT, STATED BEFORE THE MECHANISM ──
 *
 * CI cannot regenerate a declaration from a config it does not have. That is not a defect in this
 * script; it is arithmetic. `QNTM-Network/qntm` is private, the repo has no token for it (the
 * flow-trace gate is skipped for exactly that reason), and the config is the operator's live
 * instance and does not belong in a public repo. So this script covers TWO of the three cases and
 * says so out loud about the third, rather than exiting 0 and letting a green tick imply a check
 * that did not happen:
 *
 *   exit 0  every generated key matches the config it was generated from.
 *   exit 1  a key is STALE — regenerate and commit. The reasons are printed, and a declaration
 *           that went from published to DROPPED (or back) is named as such rather than left as a
 *           byte diff for a human to find.
 *   exit 3  the config directory is absent, so NOTHING WAS CHECKED. The caller must treat this as
 *           "not checked", never as "checked and fine" — build.yml raises a ::warning:: on it.
 *
 * What DOES run in CI unconditionally is `tests/declaration-drop.test.mjs`, which drives this same
 * script against the committed `tests/fixtures/config/` tree. That catches the case CI can catch:
 * a change to a GENERATOR whose output nobody regenerated. The operator's own config drifting out
 * from under a committed declaration is caught on his laptop, by this script, on exit 1.
 *
 * ── USAGE ──
 *
 *   node scripts/checkdeclarations.mjs
 *   node scripts/checkdeclarations.mjs --config-dir X --presentation Y
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG_DIR, REPO_ROOT } from "./monorepo-config.mjs";
import { generateQualification } from "./generate-qualification-declaration.mjs";
import { generateStructural } from "./generate-structural-declaration.mjs";
import { generateResolution } from "./generate-resolution-declaration.mjs";

/** The three generated keys, each with the function that produces it. */
export const GENERATORS = Object.freeze([
  ["qualification", generateQualification],
  ["structural", generateStructural],
  ["resolution", generateResolution],
]);

/**
 * Compare every generated key against a served document.
 *
 * @param {string} configDir
 * @param {unknown} served the parsed `presentation.json`
 * @returns {{stale: string[], lines: string[]}} the keys that disagree, and what to print
 */
export function checkDeclarations(configDir, served) {
  const stale = [];
  const lines = [];
  const document = served && typeof served === "object" ? served : {};
  for (const [key, generate] of GENERATORS) {
    const generated = generate(configDir);
    const current = document[key];
    if (JSON.stringify(current) === JSON.stringify(generated)) {
      lines.push(`  ${key}: matches the config.`);
      continue;
    }
    stale.push(key);
    lines.push(`  ${key}: STALE relative to the config.`);
    // THE SENTENCE THAT MATTERS. A byte diff says "something moved"; this says which of the
    // operator's own declarations stopped reaching the browser, which is the question the whole
    // change exists to make answerable.
    const before = (current && typeof current === "object" && current.dropped) || {};
    const after = generated.dropped || {};
    for (const [what, why] of Object.entries(after)) {
      if (!(what in before)) lines.push(`    NEWLY DROPPED  ${what}: ${why}`);
    }
    for (const what of Object.keys(before)) {
      if (!(what in after)) lines.push(`    NO LONGER DROPPED  ${what}`);
    }
  }
  return { stale, lines };
}

function parseArgs(argv) {
  const args = {
    configDir: DEFAULT_CONFIG_DIR,
    presentation: join(REPO_ROOT, "presentation.json"),
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--config-dir") args.configDir = resolve(argv[++i]);
    else if (argv[i] === "--presentation") args.presentation = resolve(argv[++i]);
    else throw new Error(`unknown flag: ${argv[i]}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.configDir)) {
    console.error(`NOTHING WAS CHECKED: config dir not found at ${args.configDir}.`);
    console.error("Treat this as 'not checked'. It is NOT a pass.");
    process.exit(3);
  }
  const served = JSON.parse(readFileSync(args.presentation, "utf8"));
  const { stale, lines } = checkDeclarations(args.configDir, served);
  for (const line of lines) console.log(line);
  if (stale.length === 0) {
    console.log("all three generated declarations match the config.");
    return;
  }
  console.error(
    `${stale.length} declaration(s) are STALE (${stale.join(", ")}) — run the matching ` +
      "'npm run generate:*' and commit the result.",
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(String(error?.message || error));
    process.exit(2);
  }
}

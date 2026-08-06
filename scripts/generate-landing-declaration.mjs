/**
 * generate-landing-declaration — writes `presentation.json`'s top-level `landingView` key FROM
 * `views/default_registration.yaml`'s own `default_registration.landing_view`, never by hand.
 *
 * See `scripts/compile-landing.mjs`'s header for what this publishes, why it is a small sibling
 * generator rather than a new field inside `generate-resolution-declaration.mjs`'s own
 * `registration` object, and the fold-together this sets up once that file is free to edit again.
 *
 * ── THE PURE/SHELL SPLIT — the same shape every `generate-*-declaration.mjs` file already uses ──
 *
 * `compile(files)` is PURE. This file is the thin shell: it reads exactly one file off disk into a
 * files map and hands it to the imported `compile`.
 *
 * ── USAGE ──
 *
 *   node scripts/generate-landing-declaration.mjs                 write presentation.json
 *   node scripts/generate-landing-declaration.mjs --check         diff only, exit 1 if stale
 *   node scripts/generate-landing-declaration.mjs --config-dir X  override the config path
 *   node scripts/generate-landing-declaration.mjs --check --require-config  ... and FAIL if there is no config to check
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG_DIR, REPO_ROOT, notCheckedReport } from "./monorepo-config.mjs";
import { compile, GenerationError, DEFAULT_REGISTRATION_KEY } from "./compile-landing.mjs";

export { DEFAULT_CONFIG_DIR };

/**
 * @param {string} configDir
 * @returns {Record<string, string>}
 */
export function readConfigTree(configDir) {
  const files = {};
  const path = join(configDir, "views", "default_registration.yaml");
  if (existsSync(path)) files[DEFAULT_REGISTRATION_KEY] = readFileSync(path, "utf8");
  return files;
}

/** @param {string} configDir @returns {{ landingViewId: string | undefined }} */
export function generateLanding(configDir) {
  return compile(readConfigTree(configDir));
}

function parseArgs(argv) {
  const args = { check: false, requireConfig: false, configDir: DEFAULT_CONFIG_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--check") args.check = true;
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

  const landing = generateLanding(args.configDir);
  const presentationPath = join(REPO_ROOT, "presentation.json");
  const current = JSON.parse(readFileSync(presentationPath, "utf8"));

  if (args.check) {
    if (current.landingView === landing.landingViewId) {
      console.log("presentation.json's 'landingView' key matches the monorepo config.");
      return;
    }
    console.error(
      `presentation.json's 'landingView' key is STALE relative to the monorepo config ` +
        `(committed: ${JSON.stringify(current.landingView)}, config: ${JSON.stringify(landing.landingViewId)}).`,
    );
    process.exit(1);
  }

  const next = { ...current };
  if (landing.landingViewId === undefined) delete next.landingView;
  else next.landingView = landing.landingViewId;
  writeFileSync(presentationPath, JSON.stringify(next, null, 2) + "\n");
  console.log(
    `wrote landing declaration to ${presentationPath}\n` +
      `  landingView: ${JSON.stringify(landing.landingViewId)}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(String(e?.message || e));
    process.exit(e instanceof GenerationError ? 2 : 1);
  });
}

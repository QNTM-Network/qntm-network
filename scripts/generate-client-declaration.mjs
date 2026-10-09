/**
 * generate-client-declaration — writes the `client` key of presentation.json from the monorepo's
 * `config/client.yaml` (compile-client.mjs). The CLI half only; the compile is pure. When the
 * config publish route lands (backlog row config-publish-in-the-api) the Worker runs the same
 * compile and this committed copy retires.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG_DIR, REPO_ROOT, notCheckedReport } from "./monorepo-config.mjs";
import { compile, GenerationError, CLIENT_KEY } from "./compile-client.mjs";

export function generateClient(configDir) {
  const path = join(configDir, CLIENT_KEY);
  return compile(existsSync(path) ? { [CLIENT_KEY]: readFileSync(path, "utf8") } : {});
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
  const client = generateClient(args.configDir);
  const presentationPath = join(REPO_ROOT, "presentation.json");
  const current = JSON.parse(readFileSync(presentationPath, "utf8"));
  const want = client.lists === undefined ? undefined : { lists: client.lists };
  if (args.check) {
    if (JSON.stringify(current.client) === JSON.stringify(want)) {
      console.log("presentation.json's 'client' key matches the monorepo config.");
      return;
    }
    console.error("presentation.json's 'client' key is STALE relative to the monorepo config's client.yaml.");
    process.exit(1);
  }
  const next = { ...current };
  if (want === undefined) delete next.client;
  else next.client = want;
  writeFileSync(presentationPath, JSON.stringify(next, null, 2) + "\n");
  console.log(`wrote client declaration to ${presentationPath} (${Object.keys(client.lists ?? {}).join(", ") || "nothing declared"})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(String(e?.message || e));
    process.exit(e instanceof GenerationError ? 2 : 1);
  });
}

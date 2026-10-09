#!/usr/bin/env node
/**
 * publish-config — send a folder of config files to `POST /config/publish` (worker/src/publish.js,
 * 2026-10-09). The Worker compiles them, the engine checks and switches to them, and the app reads
 * the result on its next load. No build, no commit, no CI.
 *
 *   node scripts/publish-config.mjs                     the monorepo config (graph-sync.config.json's configDir)
 *   node scripts/publish-config.mjs <dir>               any folder of config files
 *   node scripts/publish-config.mjs --ref <git-ref>     the monorepo config as committed at <ref>
 *   node scripts/publish-config.mjs --dry-run [...]     compile only (`/config/compile/presentation`): nothing changes
 *
 * Secret: GRAPH_PUSH_KEY in the environment, or scripts/.graph-push-key — the same key graph-sync uses.
 *
 * WHICH FILES. Every file under the folder except dot-files (a `.gitkeep` keeps an empty folder in
 * git; the engine needs no empty folders). With `--ref`, exactly the files git has at that ref —
 * what `git archive` sent by hand before this script existed.
 *
 * Exit: 0 published (or compiled, with --dry-run); 1 refused, with the refusal printed; 2 a usage
 * or connection error.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Every non-dot file under `dir`, keyed by its path relative to `dir`. */
export function readFolder(dir, root = dir, files = {}) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) readFolder(path, root, files);
    else files[relative(root, path)] = readFileSync(path, "utf8");
  }
  return files;
}

/** The files git has under `dir` at `ref`, keyed by path relative to `dir`. */
export function readAtRef(dir, ref) {
  const top = execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const prefix = relative(top, resolve(dir));
  const listed = execFileSync("git", ["-C", top, "ls-tree", "-r", "--name-only", ref, "--", prefix], { encoding: "utf8" });
  const files = {};
  for (const path of listed.split("\n").filter(Boolean)) {
    const rel = relative(prefix, path);
    if (rel.split("/").some((part) => part.startsWith("."))) continue;
    files[rel] = execFileSync("git", ["-C", top, "show", `${ref}:${path}`], { encoding: "utf8", maxBuffer: 1 << 26 });
  }
  return files;
}

function settings() {
  const path = process.env.GRAPH_SYNC_CONFIG || join(HERE, "graph-sync.config.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

function pushKey() {
  const keyFile = join(HERE, ".graph-push-key");
  return process.env.GRAPH_PUSH_KEY || (existsSync(keyFile) ? readFileSync(keyFile, "utf8").trim() : "");
}

function parseArgs(argv) {
  const args = { dir: null, ref: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--ref") args.ref = argv[++i];
    else if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i].startsWith("--")) throw new Error(`unknown flag: ${argv[i]}`);
    else args.dir = argv[i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = settings();
  const dir = resolve(args.dir ?? cfg.configDir ?? "");
  if (!existsSync(dir)) throw new Error(`no config folder at ${dir}`);
  const worker = process.env.QNTM_WORKER || cfg.worker;
  if (!worker) throw new Error("no Worker URL — set `worker` in scripts/graph-sync.config.json or QNTM_WORKER");

  const files = args.ref ? readAtRef(dir, args.ref) : readFolder(dir);
  const route = args.dryRun ? "/config/compile/presentation" : "/config/publish";
  const headers = { "Content-Type": "application/json" };
  if (!args.dryRun) {
    const key = pushKey();
    if (!key) throw new Error("no push key — set GRAPH_PUSH_KEY or write scripts/.graph-push-key");
    headers.Authorization = `Bearer ${key}`;
  }
  console.log(`${args.dryRun ? "compiling" : "publishing"} ${Object.keys(files).length} files from ${dir}${args.ref ? ` at ${args.ref}` : ""}`);
  const response = await fetch(`${worker}${route}`, { method: "POST", headers, body: JSON.stringify({ files }) });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.ok) {
    const where = body.engine?.file ? ` (${body.engine.file}${body.engine.line ? `:${body.engine.line}` : ""})` : "";
    console.error(`REFUSED${body.gate ? ` at gate ${body.gate}` : ""} [${response.status}]: ${body.error ?? "no answer"}${where}`);
    if (body.receipt) console.error(`receipt: ${JSON.stringify(body.receipt)}`);
    process.exit(response.status >= 500 && !body.refused ? 2 : 1);
  }
  if (args.dryRun) {
    console.log(`compiled: ${body.receipt.version}`);
    return;
  }
  console.log(
    `published config #${body.number}${body.unchanged ? " (unchanged)" : ""} — ` +
      `declaration ${body.receipt.version.slice(0, 19)}…, engine ${body.engine?.idempotent ? "already had it" : "switched over"}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exit(2);
  });
}

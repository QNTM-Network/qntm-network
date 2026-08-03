/**
 * check-isolate-conformance — does the REAL Cloudflare Worker isolate (`workerd`, spawned by
 * `wrangler dev`, never deployed) produce byte-identical output to the same `compile()` call in
 * Node, for the structural declaration?
 *
 * `5d4f1b5` (PR #84) measured this BY HAND, once: a synthetic fixture, the operator's real
 * 276-file config, and a mutation that triggers a refusal — all three byte-identical, the refusal
 * wording word for word. No automated test spawned `workerd` to re-check it. This script re-runs
 * that exact method — same three cases, same route, same fixture — on every push, because a fact
 * nothing re-checks is not a fact this system trusts; see
 * `docs/implementation-artifacts/design-the-runtime-compile.md` §6.3, §10.
 *
 * ── THREE OUTCOMES, ONE EXIT CODE APIECE — `scripts/checkdeclarations.mjs`'s convention, reused
 *    rather than reinvented, because `build.yml` already knows how to report it distinctly ──
 *
 *   exit 0  COMPARED, AGREED. Every case that could run, ran, and Node/Worker matched byte for
 *           byte (refusal wording included).
 *   exit 1  COMPARED, DISAGREED. A real divergence between Node and the Worker isolate, or
 *           between their refusal wording. This is the one outcome that must turn CI red.
 *   exit 3  NOT FULLY COMPARED. Either the Worker runtime could not be spawned, or the operator's
 *           real config is not checked out on this runner (or both) — named separately, below,
 *           because they are different failures with different remedies. This is NEVER a pass.
 *           `build.yml` raises a `::warning::` on it, exactly as it already does for
 *           `checkdeclarations.mjs`'s own exit 3 — a check that could not run must never be
 *           indistinguishable, in the log, from a check that ran and passed.
 *   exit 2  a crash — this script itself never reached a verdict.
 *
 * ── THE FOURTH UNAVAILABILITY, NAMED SO IT CANNOT GO SILENT A SECOND TIME ──
 *
 * `scripts/monorepo-config.mjs`'s `DEFAULT_CONFIG_DIR` is a path guessed from this worktree's own
 * depth. Get the depth wrong and `existsSync` just returns false — every test that gates on it
 * (`present-structural.test.mjs` and eight siblings) skips, quietly, and the CI log still says
 * "68 passed, 0 failed." This script does not let that happen twice: the resolved path and
 * whether it exists are printed UNCONDITIONALLY, on every run, pass or fail, so a wrong depth is
 * visible in plain text rather than inferred from a suspiciously small "compared" count.
 *
 * ── USAGE ──
 *
 *   node scripts/check-isolate-conformance.mjs
 *   node scripts/check-isolate-conformance.mjs --port 18787 --boot-timeout-ms 60000
 *   node scripts/check-isolate-conformance.mjs --config-dir X   # override, same convention as
 *                                                                # the three generators' own flag;
 *                                                                # exists so this script's "not
 *                                                                # compared" branch is testable
 *                                                                # without moving the real thing.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { REPO_ROOT, DEFAULT_CONFIG_DIR } from "./monorepo-config.mjs";
import {
  compile,
  STRUCTURAL_TOKENS_KEY,
  SCHEMA_KEY,
  VIEWS_PREFIX,
} from "./compile-structural.mjs";

const WORKER_DIR = join(REPO_ROOT, "worker");
const FIXTURE_CONFIG = join(REPO_ROOT, "tests", "fixtures", "config");
const ROUTE_PATH = "/config/compile/structural";

// The anchor `tests/worker-config-compile.test.mjs` already mutates for its own committed
// refusal proof — reused here rather than a second, independently-drifting copy of the same
// sentence.
const MUTATION_ANCHOR = "structural_edge_types: [UNLOCKS]";
const MUTATION_REPLACEMENT = "structural_edge_types: [MADE_UP_EDGE_TYPE]";

function parseArgs(argv) {
  const args = { port: 18787, bootTimeoutMs: 60_000, configDir: DEFAULT_CONFIG_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--port") args.port = Number(argv[++i]);
    else if (argv[i] === "--boot-timeout-ms") args.bootTimeoutMs = Number(argv[++i]);
    else if (argv[i] === "--config-dir") args.configDir = resolve(argv[++i]);
    else throw new Error(`unknown flag: ${argv[i]}`);
  }
  return args;
}

/** Read a config directory into exactly the files map `compile()` recognises, sorted the same
 * way `generate-structural-declaration.mjs`'s own fs shell reads it — one convention, two
 * readers, restated here rather than imported because that shell is Node-only by design and this
 * script deliberately stays a peer of it, not a dependent. */
function readConfigTree(configDir) {
  const files = {};
  const tokensPath = join(configDir, "vocabulary", "structural_tokens.yaml");
  if (existsSync(tokensPath)) files[STRUCTURAL_TOKENS_KEY] = readFileSync(tokensPath, "utf8");
  const schemaPath = join(configDir, "schema.yaml");
  if (existsSync(schemaPath)) files[SCHEMA_KEY] = readFileSync(schemaPath, "utf8");
  const viewsDir = join(configDir, "views");
  for (const f of readdirSync(viewsDir).filter((f) => f.endsWith(".yaml")).sort()) {
    files[`${VIEWS_PREFIX}${f}`] = readFileSync(join(viewsDir, f), "utf8");
  }
  return files;
}

/** POST a files map at the real, running Worker isolate. Never throws on a non-2xx status — a
 * refusal is data, not an exception, exactly as `worker/src/config.js` itself treats it. */
async function postToWorker(baseUrl, files) {
  const response = await fetch(`${baseUrl}${ROUTE_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });
  return { status: response.status, body: await response.json() };
}

/** Run `compile()` directly in THIS process (Node's V8) and normalise its outcome to the same
 * shape `postToWorker` returns, so the two can be diffed with one function. */
function compileInNode(files) {
  try {
    const { declaration, dropped } = compile(files);
    return { status: 200, body: { ok: true, declaration, dropped } };
  } catch (error) {
    return { status: 422, body: { ok: false, refused: true, error: String(error?.message || error) } };
  }
}

/** Byte-identity, the same test both PR #84's manual run and this script apply: JSON-serialise
 * each side's declaration/dropped/error and compare the strings, not a deep-equal that could
 * paper over key-order divergence `JSON.stringify` would actually show a browser. */
function compareOutcomes(nodeResult, workerResult) {
  const a = JSON.stringify(nodeResult.body);
  const b = JSON.stringify(workerResult.body);
  return {
    agree: nodeResult.status === workerResult.status && a === b,
    nodeStatus: nodeResult.status,
    workerStatus: workerResult.status,
    nodeBytes: a,
    workerBytes: b,
  };
}

/** Spawn `wrangler dev` in `worker/`, on its own process group, and resolve once it answers HTTP
 * — or reject once `bootTimeoutMs` elapses or the process exits first. Never assumes readiness;
 * polls the real port. */
function startWorker(port, bootTimeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const wranglerBin = join(WORKER_DIR, "node_modules", ".bin", "wrangler");
    if (!existsSync(wranglerBin)) {
      reject(new Error(`wrangler is not installed at ${wranglerBin} — run 'npm ci' in worker/ first.`));
      return;
    }

    const child = spawn(
      wranglerBin,
      ["dev", "--port", String(port), "--local-protocol", "http", "--ip", "127.0.0.1"],
      { cwd: WORKER_DIR, detached: true, stdio: ["ignore", "pipe", "pipe"] },
    );

    let output = "";
    child.stdout.on("data", (d) => { output += d.toString(); });
    child.stderr.on("data", (d) => { output += d.toString(); });

    let settled = false;
    child.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      reject(new Error(`wrangler dev exited before it came up (code=${code}, signal=${signal}).\n${output}`));
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + bootTimeoutMs;

    (async () => {
      while (Date.now() < deadline) {
        if (settled) return;
        try {
          // Any HTTP response at all — even a 403/404 — proves the isolate is up and routing.
          await fetch(baseUrl, { method: "GET", signal: AbortSignal.timeout(1000) });
          if (settled) return;
          settled = true;
          resolvePromise({ baseUrl, child, output: () => output });
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      if (settled) return;
      settled = true;
      stopWorker(child);
      reject(new Error(`wrangler dev did not answer http on port ${port} within ${bootTimeoutMs}ms.\n${output}`));
    })();
  });
}

function stopWorker(child) {
  try {
    // `detached: true` puts the child in its own process group; wrangler dev spawns workerd as a
    // subprocess, so the group must be signalled, not just the direct child, or workerd survives
    // this script's own exit as an orphan.
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // already gone
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log("── isolate conformance: Node's V8 vs. the real Worker isolate (workerd) ──");
  console.log(`resolved config dir (DEFAULT_CONFIG_DIR unless --config-dir overrode it): ${args.configDir}`);
  const monorepoAvailable = existsSync(args.configDir);
  console.log(`operator's real config present on this runner: ${monorepoAvailable}`);

  const results = [];
  let worker = null;
  try {
    worker = await startWorker(args.port, args.bootTimeoutMs);
  } catch (error) {
    console.log("");
    console.log(`NOT COMPARED: the Worker runtime could not be spawned — ${error.message}`);
    console.log("Treat this as 'not checked'. It is NOT a pass, and it is NOT a code defect either.");
    console.log(`monorepo case (${args.configDir}): also NOT COMPARED — no runtime to compare it against.`);
    process.exit(3);
  }

  try {
    // CASE 1 — the synthetic fixture, always available, committed to this repo.
    {
      const files = readConfigTree(FIXTURE_CONFIG);
      const nodeResult = compileInNode(files);
      const workerResult = await postToWorker(worker.baseUrl, files);
      const cmp = compareOutcomes(nodeResult, workerResult);
      results.push({ name: "synthetic fixture", compared: true, agree: cmp.agree, detail: cmp });
    }

    // CASE 2 — the mutation proof: one edge type reference `schema.yaml` never declared. Both
    // runtimes must refuse, with the identical sentence — the refusal wording is a product
    // surface (design-the-runtime-compile.md §5.1), not an error path, and matters as much as the
    // success case.
    {
      const files = readConfigTree(FIXTURE_CONFIG);
      if (!files["views/main.yaml"] || !files["views/main.yaml"].includes(MUTATION_ANCHOR)) {
        throw new Error(`mutation anchor "${MUTATION_ANCHOR}" not found in the fixture — fixture changed under this script.`);
      }
      files["views/main.yaml"] = files["views/main.yaml"].replace(MUTATION_ANCHOR, MUTATION_REPLACEMENT);
      const nodeResult = compileInNode(files);
      const workerResult = await postToWorker(worker.baseUrl, files);
      const cmp = compareOutcomes(nodeResult, workerResult);
      results.push({ name: "mutation (refusal wording)", compared: true, agree: cmp.agree, detail: cmp });
      if (nodeResult.status !== 422) {
        throw new Error("mutation proof is broken: the mutated fixture did not refuse in Node at all.");
      }
    }

    // CASE 3 — the operator's real 276-file config. Only if this runner has it checked out.
    if (monorepoAvailable) {
      const files = readConfigTree(args.configDir);
      const nodeResult = compileInNode(files);
      const workerResult = await postToWorker(worker.baseUrl, files);
      const cmp = compareOutcomes(nodeResult, workerResult);
      results.push({ name: "operator's real config", compared: true, agree: cmp.agree, detail: cmp });
    } else {
      results.push({
        name: "operator's real config",
        compared: false,
        reason: `monorepo not checked out at ${args.configDir}`,
      });
    }
  } finally {
    stopWorker(worker.child);
  }

  console.log("");
  const compared = results.filter((r) => r.compared);
  const disagreed = compared.filter((r) => !r.agree);
  const notCompared = results.filter((r) => !r.compared);

  for (const r of results) {
    if (!r.compared) {
      console.log(`NOT COMPARED  ${r.name} — ${r.reason}`);
      continue;
    }
    if (r.agree) {
      console.log(`AGREED        ${r.name} — Node and the Worker isolate produced byte-identical output (status ${r.detail.nodeStatus}).`);
    } else {
      console.log(`DISAGREED     ${r.name} — Node (status ${r.detail.nodeStatus}) and the Worker isolate (status ${r.detail.workerStatus}) produced DIFFERENT bytes.`);
      console.log(`  node:   ${r.detail.nodeBytes}`);
      console.log(`  worker: ${r.detail.workerBytes}`);
    }
  }

  console.log("");
  console.log(`${compared.length}/${results.length} case(s) compared; ${disagreed.length} disagreement(s); ${notCompared.length} not compared.`);

  if (disagreed.length > 0) {
    console.error(`ISOLATE CONFORMANCE FAILED: ${disagreed.map((r) => r.name).join(", ")} — the Worker isolate and Node disagree. This is a real divergence, not an infrastructure gap.`);
    process.exit(1);
  }
  if (notCompared.length > 0) {
    console.log(`NOTHING DISAGREED, BUT NOT EVERYTHING WAS COMPARED (${notCompared.map((r) => r.name).join(", ")}). Treat this as 'not checked' for those cases, never as 'checked and fine'.`);
    process.exit(3);
  }
  console.log("ISOLATE CONFORMANCE: all cases compared, all byte-identical.");
}

main().catch((error) => {
  console.error(String(error?.stack || error));
  process.exit(2);
});

/**
 * check-isolate-conformance — does the REAL Cloudflare Worker isolate (`workerd`, spawned by
 * `wrangler dev`, never deployed) produce byte-identical output to the same `compile()` call in
 * Node, for EVERY generator that has a Worker route?
 *
 * `5d4f1b5` (PR #84) measured this BY HAND, once, for the structural declaration: a synthetic
 * fixture, the operator's real 276-file config, and a mutation that triggers a refusal — all three
 * byte-identical, the refusal wording word for word. No automated test spawned `workerd` to
 * re-check it. This script re-ran that exact method — same three cases, same route, same fixture —
 * on every push (`6394420`); `9be7f13` extended it to the QUALIFICATION route
 * (`compile-qualification.mjs`); this pass extends it to the RESOLUTION route, the last of the
 * three (`compile-resolution.mjs`, `design-the-runtime-compile.md` step C's remaining generator),
 * running the SAME three cases against it. See
 * `docs/implementation-artifacts/design-the-runtime-compile.md` §6.3, §10.
 *
 * ── THREE OUTCOMES, ONE EXIT CODE APIECE, ACROSS ALL GENERATORS TOGETHER — `scripts/
 *    checkdeclarations.mjs`'s convention, reused rather than reinvented, because `build.yml`
 *    already knows how to report it distinctly ──
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
import { receipt } from "../worker/src/config.js";
import {
  compile as compileStructural,
  STRUCTURAL_TOKENS_KEY,
  SCHEMA_KEY as STRUCTURAL_SCHEMA_KEY,
  VIEWS_PREFIX as STRUCTURAL_VIEWS_PREFIX,
} from "./compile-structural.mjs";
import {
  compile as compileQualification,
  SCHEMA_KEY as QUALIFICATION_SCHEMA_KEY,
  PATTERNS_PREFIX,
  VIEWS_PREFIX as QUALIFICATION_VIEWS_PREFIX,
  VOCABULARY_PREFIX,
} from "./compile-qualification.mjs";
import {
  compile as compileResolution,
  SCHEMA_KEY as RESOLUTION_SCHEMA_KEY,
  LINE_GRAMMARS_KEY,
  DAY_BOUNDARY_KEY,
  VIEWS_PREFIX as RESOLUTION_VIEWS_PREFIX,
  VOCABULARY_PREFIX as RESOLUTION_VOCABULARY_PREFIX,
  PATTERNS_PREFIX as RESOLUTION_PATTERNS_PREFIX,
  RULES_PREFIX,
} from "./compile-resolution.mjs";

const WORKER_DIR = join(REPO_ROOT, "worker");
const FIXTURE_CONFIG = join(REPO_ROOT, "tests", "fixtures", "config");

/** Read a directory's `*.yaml` files, sorted, into `files[prefix + name] = contents`. The one
 * mechanical step every generator's own fs shell repeats — restated here, not imported, because
 * this script deliberately stays a peer of those shells, not a dependent of them. */
function readYamlDir(dir, prefix, files) {
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort()) {
    files[`${prefix}${f}`] = readFileSync(join(dir, f), "utf8");
  }
}

/** One entry per generator with a Worker Gate-1 route. Adding a third generator (resolution) is
 * one more entry here, not a change to the loop below. */
const GENERATORS = [
  {
    name: "structural",
    routePath: "/config/compile/structural",
    compile: compileStructural,
    // Read a config directory into exactly the files map `compile()` recognises, sorted the same
    // way `generate-structural-declaration.mjs`'s own fs shell reads it.
    readConfigTree(configDir) {
      const files = {};
      const tokensPath = join(configDir, "vocabulary", "structural_tokens.yaml");
      if (existsSync(tokensPath)) files[STRUCTURAL_TOKENS_KEY] = readFileSync(tokensPath, "utf8");
      const schemaPath = join(configDir, "schema.yaml");
      if (existsSync(schemaPath)) files[STRUCTURAL_SCHEMA_KEY] = readFileSync(schemaPath, "utf8");
      readYamlDir(join(configDir, "views"), STRUCTURAL_VIEWS_PREFIX, files);
      return files;
    },
    // The anchor `tests/worker-config-compile.test.mjs` already mutates for its own committed
    // refusal proof — reused here rather than a second, independently-drifting copy of the same
    // sentence.
    mutate(files) {
      const anchor = "structural_edge_types: [UNLOCKS]";
      if (!files["views/main.yaml"] || !files["views/main.yaml"].includes(anchor)) {
        throw new Error(`mutation anchor "${anchor}" not found in the fixture — fixture changed under this script.`);
      }
      files["views/main.yaml"] = files["views/main.yaml"].replace(anchor, "structural_edge_types: [MADE_UP_EDGE_TYPE]");
    },
  },
  {
    name: "qualification",
    routePath: "/config/compile/qualification",
    compile: compileQualification,
    // Read a config directory into exactly the files map `compile()` recognises, sorted the same
    // way `generate-qualification-declaration.mjs`'s own fs shell reads it.
    readConfigTree(configDir) {
      const files = {};
      const schemaPath = join(configDir, "schema.yaml");
      if (existsSync(schemaPath)) files[QUALIFICATION_SCHEMA_KEY] = readFileSync(schemaPath, "utf8");
      readYamlDir(join(configDir, "patterns"), PATTERNS_PREFIX, files);
      readYamlDir(join(configDir, "views"), QUALIFICATION_VIEWS_PREFIX, files);
      readYamlDir(join(configDir, "vocabulary"), VOCABULARY_PREFIX, files);
      return files;
    },
    // The anchor `tests/worker-config-compile.test.mjs` already mutates for its own committed
    // refusal proof — reused here rather than a second, independently-drifting copy of the same
    // sentence. Unlike structural's, this is a config-integrity refusal (a section names a pattern
    // no file in patterns/ defines) rather than an unknown-edge-type refusal, because qualification
    // has no equivalent single-token edge-vocabulary check — the section/pattern join is the
    // analogous hard failure `compile()` cannot recover from.
    mutate(files) {
      const anchor = "qualification: local-tasks";
      if (!files["views/main.yaml"] || !files["views/main.yaml"].includes(anchor)) {
        throw new Error(`mutation anchor "${anchor}" not found in the fixture — fixture changed under this script.`);
      }
      files["views/main.yaml"] = files["views/main.yaml"].replace(anchor, "qualification: does-not-exist");
    },
  },
  {
    name: "resolution",
    routePath: "/config/compile/resolution",
    compile: compileResolution,
    // Read a config directory into exactly the files map `compile()` recognises, sorted the same
    // way `generate-resolution-declaration.mjs`'s own fs shell reads it. Resolution reads the
    // largest set of the three: schema.yaml, line_grammars.yaml, day_boundary.yaml, every
    // views/*.yaml, every vocabulary/*.yaml, every patterns/*.yaml and every rules/*.yaml.
    readConfigTree(configDir) {
      const files = {};
      const schemaPath = join(configDir, "schema.yaml");
      if (existsSync(schemaPath)) files[RESOLUTION_SCHEMA_KEY] = readFileSync(schemaPath, "utf8");
      const lineGrammarsPath = join(configDir, "line_grammars.yaml");
      if (existsSync(lineGrammarsPath)) files[LINE_GRAMMARS_KEY] = readFileSync(lineGrammarsPath, "utf8");
      const dayBoundaryPath = join(configDir, "day_boundary.yaml");
      if (existsSync(dayBoundaryPath)) files[DAY_BOUNDARY_KEY] = readFileSync(dayBoundaryPath, "utf8");
      readYamlDir(join(configDir, "views"), RESOLUTION_VIEWS_PREFIX, files);
      readYamlDir(join(configDir, "vocabulary"), RESOLUTION_VOCABULARY_PREFIX, files);
      readYamlDir(join(configDir, "patterns"), RESOLUTION_PATTERNS_PREFIX, files);
      const rulesDir = join(configDir, "rules");
      if (existsSync(rulesDir)) readYamlDir(rulesDir, RULES_PREFIX, files);
      return files;
    },
    // A view's own `default_node_type:` repointed at a node type schema.yaml never declares — a
    // config-integrity refusal `compile()` cannot recover from, resolution's own analogue of
    // structural's unknown-edge-type refusal and qualification's unknown-pattern refusal. The
    // same anchor `tests/worker-config-compile.test.mjs`'s own mutation proof uses.
    mutate(files) {
      const anchor = "main:\n  path: main.md\n";
      if (!files["views/main.yaml"] || !files["views/main.yaml"].includes(anchor)) {
        throw new Error(`mutation anchor "${anchor}" not found in the fixture — fixture changed under this script.`);
      }
      files["views/main.yaml"] = files["views/main.yaml"].replace(
        anchor,
        "main:\n  path: main.md\n  default_node_type: totally_made_up_type\n",
      );
    },
  },
];

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

/** POST a files map at the real, running Worker isolate, at ONE generator's own route path.
 * Never throws on a non-2xx status — a refusal is data, not an exception, exactly as
 * `worker/src/config.js` itself treats it. */
async function postToWorker(baseUrl, routePath, files) {
  const response = await fetch(`${baseUrl}${routePath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });
  return { status: response.status, body: await response.json() };
}

/** Run ONE generator's `compile()` directly in THIS process (Node's V8) and normalise its outcome
 * to the same shape `postToWorker` returns, so the two can be diffed with one function. The
 * receipt is built with `worker/src/config.js`'s own exported `receipt()` — not a hand-copied
 * shape — so a real divergence in the ROUTE'S OWN construction of it would still show up as a
 * disagreement here rather than being silently matched by a script that assumes what the route
 * does. */
function compileInNode(compileFn, files) {
  try {
    const { declaration, dropped, version } = compileFn(files);
    return {
      status: 200,
      body: { ok: true, declaration, dropped, receipt: receipt({ compiled: true, version }) },
    };
  } catch (error) {
    return {
      status: 422,
      body: {
        ok: false,
        refused: true,
        error: String(error?.message || error),
        receipt: receipt({ compiled: false, version: null }),
      },
    };
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
    for (const generator of GENERATORS) {
      const label = (caseName) => `${generator.name}: ${caseName}`;

      // CASE 1 — the synthetic fixture, always available, committed to this repo.
      {
        const files = generator.readConfigTree(FIXTURE_CONFIG);
        const nodeResult = compileInNode(generator.compile, files);
        const workerResult = await postToWorker(worker.baseUrl, generator.routePath, files);
        const cmp = compareOutcomes(nodeResult, workerResult);
        results.push({ name: label("synthetic fixture"), compared: true, agree: cmp.agree, detail: cmp });
      }

      // CASE 2 — the mutation proof: one config change that must trigger an identical, named
      // refusal on both sides. Both runtimes must refuse, with the identical sentence — the
      // refusal wording is a product surface (design-the-runtime-compile.md §5.1), not an error
      // path, and matters as much as the success case.
      {
        const files = generator.readConfigTree(FIXTURE_CONFIG);
        generator.mutate(files);
        const nodeResult = compileInNode(generator.compile, files);
        const workerResult = await postToWorker(worker.baseUrl, generator.routePath, files);
        const cmp = compareOutcomes(nodeResult, workerResult);
        results.push({ name: label("mutation (refusal wording)"), compared: true, agree: cmp.agree, detail: cmp });
        if (nodeResult.status !== 422) {
          throw new Error(`${generator.name}: mutation proof is broken — the mutated fixture did not refuse in Node at all.`);
        }
      }

      // CASE 3 — the operator's real config. Only if this runner has it checked out.
      if (monorepoAvailable) {
        const files = generator.readConfigTree(args.configDir);
        const nodeResult = compileInNode(generator.compile, files);
        const workerResult = await postToWorker(worker.baseUrl, generator.routePath, files);
        const cmp = compareOutcomes(nodeResult, workerResult);
        results.push({ name: label("operator's real config"), compared: true, agree: cmp.agree, detail: cmp });
      } else {
        results.push({
          name: label("operator's real config"),
          compared: false,
          reason: `monorepo not checked out at ${args.configDir}`,
        });
      }
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

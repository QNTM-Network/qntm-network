/**
 * graph-sync — the laptop side of graph hosting (Option A).
 * See docs/architecture/graph-hosting-plan.md.
 *
 * This is the PRODUCER. qntm-md (the projection engine) has already run and left two things on
 * disk: the graph in ~/.qntm-md/state.db (graph_state.data, one JSON blob) and the rendered view
 * files in the vault (this_week.md, work/outcomes.md, …) — the *rendering of the graph*. This
 * script gathers them into one snapshot envelope and POSTs it to the Worker's operator route,
 * where it lands in R2 behind your passkey wall. The browser reads it via GET /app/graph.
 *
 * DELIBERATELY has no qntm-md coupling — it reads the db and the vault files, nothing more. The
 * whole point of the seam is that the producer is swappable; a hosted producer would gather the
 * same envelope and hit the same route.
 *
 * v1 scope: PUSH only (read-only site). The pull → apply → re-run loop (draining /app/edits/
 * pending and applying gestures as vault edits) is the next step and will live here too.
 *
 *   node scripts/graph-sync.mjs push              # gather + POST
 *   node scripts/graph-sync.mjs push --dry-run    # gather + write envelope to a file, no network
 *   node scripts/graph-sync.mjs pull --dry-run    # fetch + check the archive, write nothing
 *
 * Config: scripts/graph-sync.config.json (gitignored — copy graph-sync.config.example.json).
 * Override the config path with GRAPH_SYNC_CONFIG (used by tests/graph-sync-guards.test.mjs).
 * Secret: GRAPH_PUSH_KEY in the environment (the same value set via `wrangler secret put`).
 *
 * TWO GUARDS live here. Both exist because their absence took production down or nearly cost the
 * operator his vault; see "GUARDS" below and tests/graph-sync-guards.test.mjs.
 */

import { execFileSync } from "node:child_process";
import {
  readFileSync, writeFileSync, appendFileSync, readdirSync, existsSync, mkdirSync,
  mkdtempSync, statSync, rmSync, cpSync, lstatSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve, relative, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(fileURLToPath(import.meta.url), "..");

const DEFAULTS = {
  stateDb: "~/.qntm-md/state.db",
  vaultDir: "~/qntm",
  viewsConfigDir: "/Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/config/views",
  configDir: "/Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/config", // operator config, synced as data
  worker: "", // e.g. https://qntm-signups.<subdomain>.workers.dev — required for a real push
};

// ~ expansion — the config is hand-edited, so home-relative paths are the natural thing to write.
const expand = (p) => (p.startsWith("~") ? join(homedir(), p.slice(1)) : p);

function loadConfig() {
  const path = process.env.GRAPH_SYNC_CONFIG || join(HERE, "graph-sync.config.json");
  const fromFile = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  return { ...DEFAULTS, ...fromFile };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// GUARDS
//
// Both guards below FAIL SAFE (refuse) and FAIL LOUD (say exactly what they saw and what to do).
// A guard that cannot tell whether the dangerous case holds REFUSES — it never reports "ok".
// Each has one explicit, self-describing override flag, and every use of an override is appended
// to the override log so a 3am "just get it through" leaves a trace.
// ══════════════════════════════════════════════════════════════════════════════════════════════

class Refusal extends Error {}
const refuse = (lines) => {
  throw new Refusal(["", ...lines, ""].join("\n"));
};

const overrideLog = () =>
  process.env.GRAPH_SYNC_OVERRIDE_LOG || join(homedir(), ".qntm-md", "graph-sync-overrides.log");

function logOverride(kind, detail) {
  const path = overrideLog();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${new Date().toISOString()}\t${kind}\t${detail.replace(/\s+/g, " ")}\n`);
  console.error(`⚠ OVERRIDE USED: ${kind} — ${detail}`);
  console.error(`⚠ logged to ${path}`);
}

const stamp = () => {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

// ── GUARD 1: `pull` unpacks a remote archive over the operator's live vault ────────────────────
//
// The old code piped the response body straight into `tar -x -C ~/qntm`. Two proven failure modes
// (tests/graph-sync-guards.test.mjs reproduces both against a throwaway vault):
//
//   a. A TRUNCATED archive (cold-starting server, dropped connection) applies its whole entries up
//      to the cut and then errors. The vault is left half-old/half-new, the script exits 1, and
//      nothing records how far it got. The next cycle pushes that mixed state up as the delta.
//   b. A COMPLETE archive carrying BLANK files applies silently and exits 0. Per
//      docs/architecture/graph-server-plan.md an emptied file "is read as authorial line-removal
//      and deletes those nodes — `rm` safe; blank not". So a degraded projection (defect 2's
//      second incident produced exactly one) is written in as the operator deleting his own work.
//
// The fix, in order: verify the archive end-to-end, unpack to a STAGING dir (never the vault),
// compare staging against what is on disk, snapshot, and only then apply. Nothing reaches the
// vault until every check has passed.

const SNAPSHOT_KEEP = 3;          // how many pre-pull snapshots to retain per target
const SHRINK_FLOOR = 0.5;         // shared files may not lose more than half their bytes in one pull
const BLANK_PROBE_BYTES = 4096;   // only files this small can be "blank"; don't read the rest

function walkFiles(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(abs, base, out);
    else if (entry.isFile()) out.push(relative(base, abs));
  }
  return out;
}

const isBlank = (abs, size) =>
  size === 0 || (size <= BLANK_PROBE_BYTES && readFileSync(abs, "utf8").trim() === "");

// Listing the archive walks the gzip CRC and every tar header to the end — a truncated or
// corrupted stream cannot survive it. This runs on the buffer, so it touches no filesystem.
function verifyArchive(buf) {
  try {
    const out = execFileSync("tar", ["-tzf", "-"], {
      input: buf, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, entries: out.split("\n").filter(Boolean) };
  } catch (e) {
    return { ok: false, why: String(e.stderr || e.message).trim().split("\n")[0] };
  }
}

function extractToStaging(buf) {
  const dir = mkdtempSync(join(tmpdir(), "graph-sync-staging-"));
  execFileSync("tar", ["-xzf", "-", "-C", dir], { input: buf, maxBuffer: 256 * 1024 * 1024 });
  return dir;
}

// What would applying `staging` over `target` actually do to the files already there?
function inspectPull(staging, target) {
  const incoming = walkFiles(staging);
  const blanked = [];
  const added = [];
  let sharedBefore = 0;
  let sharedAfter = 0;
  for (const rel of incoming) {
    const cur = join(target, rel);
    if (!existsSync(cur)) { added.push(rel); continue; }
    const beforeSize = statSync(cur).size;
    const afterSize = statSync(join(staging, rel)).size;
    sharedBefore += beforeSize;
    sharedAfter += afterSize;
    if (beforeSize > 0 && isBlank(join(staging, rel), afterSize)) blanked.push(rel);
  }
  // untar never deletes, so files only on disk survive; they are reported, never a refusal.
  const onDisk = new Set(walkFiles(target));
  for (const rel of incoming) onDisk.delete(rel);
  return { incoming, added, blanked, untouched: [...onDisk], sharedBefore, sharedAfter };
}

// ~/qntm  ->  ~/qntm-vault-snapshot-pre-pull-20260730-134500
// Same shape as the operator's own `~/qntm-vault-snapshot-<label>-<stamp>/` convention, so these
// sort in beside the hand-made ones. Pruning only ever matches the `pre-pull-` prefix — a
// hand-labelled snapshot is never a candidate for deletion.
function snapshotBeforePull(target) {
  const prefix = `${basename(target.replace(/\/+$/, ""))}-vault-snapshot-pre-pull-`;
  const parent = dirname(target.replace(/\/+$/, ""));
  const snap = join(parent, `${prefix}${stamp()}`);
  cpSync(target, snap, { recursive: true, preserveTimestamps: true });
  const mine = readdirSync(parent)
    .filter((n) => n.startsWith(prefix))
    .filter((n) => { try { return lstatSync(join(parent, n)).isDirectory(); } catch { return false; } })
    .sort();
  for (const old of mine.slice(0, Math.max(0, mine.length - SNAPSHOT_KEEP))) {
    rmSync(join(parent, old), { recursive: true, force: true });
  }
  return snap;
}

// The whole of guard 1. Returns the snapshot path (or null when there was nothing to snapshot).
function safeApply(buf, target, { allowDestructive, dryRun, quiet }) {
  const dest = expand(target);

  const verified = verifyArchive(buf);
  if (!verified.ok) {
    // Not overridable: an incomplete download is not a judgement call, it is a broken transfer.
    // The right move is always to retry, never to unpack half of it over the vault.
    refuse([
      `REFUSED: the archive from the server is not intact — nothing was written to ${dest}.`,
      `  tar said: ${verified.why}`,
      `  ${buf.length} bytes received.`,
      `This is the truncated-transfer case. Re-run; if it repeats, the server is producing a bad`,
      `archive and the vault is the last thing that should learn about it.`,
    ]);
  }

  const staging = extractToStaging(buf);
  let keepStaging = false;
  try {
    const fresh = !existsSync(dest) || walkFiles(dest).length === 0;
    const report = fresh ? null : inspectPull(staging, dest);

    if (report) {
      const shrink = report.sharedBefore === 0 ? 1 : report.sharedAfter / report.sharedBefore;
      const problems = [];
      if (report.blanked.length) {
        problems.push(
          `  ${report.blanked.length} file(s) hold content on disk and are BLANK in the archive:`,
          ...report.blanked.slice(0, 12).map((f) => `      ${f}`),
          ...(report.blanked.length > 12 ? [`      … and ${report.blanked.length - 12} more`] : []),
          `  docs/architecture/graph-server-plan.md: an emptied file is read as authorial`,
          `  line-removal and DELETES those nodes. This would not overwrite your work, it would`,
          `  instruct the next cycle to delete it.`
        );
      }
      if (shrink < SHRINK_FLOOR) {
        problems.push(
          `  files present on both sides shrink from ${report.sharedBefore} to ${report.sharedAfter} bytes`,
          `  (${(shrink * 100).toFixed(0)}% of current, floor is ${SHRINK_FLOOR * 100}%).`
        );
      }
      if (problems.length) {
        if (!allowDestructive) {
          keepStaging = true;
          refuse([
            `REFUSED: this projection would destroy content in ${dest}. Nothing was written.`,
            ...problems,
            `  the archive is intact and unpacked for inspection at:`,
            `      ${staging}`,
            `Override (logged): --allow-destructive-pull`,
          ]);
        }
        logOverride(
          "--allow-destructive-pull",
          `target=${dest} blanked=${report.blanked.length} shrink=${(shrink * 100).toFixed(0)}% ` +
            `files=${report.blanked.slice(0, 20).join(",")}`
        );
      }
    }

    if (dryRun) {
      const n = report ? report.incoming.length : walkFiles(staging).length;
      console.log(
        `dry run — archive intact, ${n} file(s), checks pass; ${dest} not written. ` +
          `unpacked for inspection at ${staging}`
      );
      keepStaging = true;
      return null;
    }

    // The snapshot is not optional and has no skip flag. It is the only thing standing between a
    // wrong-but-plausible projection (one the checks above cannot see through) and a vault the
    // operator cannot get back. One line of output, kept to the last SNAPSHOT_KEEP.
    let snap = null;
    if (!fresh) snap = snapshotBeforePull(dest);
    mkdirSync(dest, { recursive: true });
    execFileSync("tar", ["-xzf", "-", "-C", dest], { input: buf, maxBuffer: 256 * 1024 * 1024 });
    if (snap) console.log(`snapshot -> ${snap}`);
    return snap;
  } finally {
    if (!keepStaging) rmSync(staging, { recursive: true, force: true });
  }
}

// ── GUARD 2: `cycle` ships the trunk's config/ to a server whose engine came from the deploy ───
//
// If the config and the engine come from different commits the vault breaks. Three times:
//   · old config / new engine — a retired shell key was still in the shipped config; every cycle
//     died with `unknown shell key 'chain'`.
//   · new config / old engine — node_type_render.yaml had moved into schema.yaml; the deployed
//     engine found no render forms, fell back to checkbox for everything, and wrote that back over
//     the operator's headings.
//   · 2026-07-30 — the trunk sat four commits ahead of the deploy with global_defaults.yaml
//     rewritten by the resolution-cascade refactor; cycles stopped doing anything useful.
//
// The live engine's commit is the floating `deployed` tag in the qntm repo. THE TAG IS READ FROM
// THE REMOTE, EVERY TIME, with `git ls-remote`. It deliberately never consults the local ref:
// a plain `git fetch` does NOT move an existing tag, so a local `deployed` can sit months stale
// and a check that trusts it reports SAFE precisely when it is not. `ls-remote` is also read-only
// on the local repo — this guard never writes to the operator's trunk clone.
//
// The comparison is on CONTENT, not commit distance: the config tree being shipped is hashed and
// compared blob-for-blob against the config tree at `deployed`. Engine-only commits move the tag
// and HEAD without touching config, and the guard stays silent — which is what keeps the common
// path quiet enough that this does not get switched off.

function git(args, cwd, timeout = 20000) {
  return execFileSync("git", args, {
    cwd, timeout, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024,
  }).replace(/\n$/, "");
}

const CANNOT_TELL = (why, fix) => [
  `REFUSED: cannot tell whether this config matches the deployed engine, so it is not shipped.`,
  `  ${why}`,
  ...(fix ? [`  ${fix}`] : []),
  `  A stale local \`deployed\` tag is deliberately NOT consulted as a fallback: a plain`,
  `  \`git fetch\` does not move an existing tag, so it would report safe when it is not.`,
  `Override (logged): --allow-config-engine-mismatch`,
];

function deployedShaFromRemote(repoRoot) {
  let url;
  try {
    url = git(["remote", "get-url", "origin"], repoRoot);
  } catch {
    refuse(CANNOT_TELL(`${repoRoot} has no 'origin' remote to read refs/tags/deployed from.`));
  }
  let out;
  try {
    out = git(["ls-remote", "--tags", url, "refs/tags/deployed", "refs/tags/deployed^{}"], repoRoot);
  } catch (e) {
    refuse(CANNOT_TELL(
      `could not read refs/tags/deployed from ${url}: ${String(e.stderr || e.message).trim().split("\n")[0]}`,
      `network down, or no access to the remote.`
    ));
  }
  const rows = out.split("\n").filter(Boolean).map((l) => l.split(/\s+/));
  const peeled = rows.find((r) => r[1] === "refs/tags/deployed^{}");
  const plain = rows.find((r) => r[1] === "refs/tags/deployed");
  const sha = (peeled || plain)?.[0];
  if (!sha) {
    refuse(CANNOT_TELL(
      `${url} has no refs/tags/deployed — nothing on the remote says which engine is live.`,
      `the deploy job is what moves that tag; if it has never run, there is no deploy to match.`
    ));
  }
  return { sha, url };
}

// path -> blob sha for every file tar would actually ship (working tree, untracked included).
// git-diff would miss the untracked ones, and tar ships them; hashing what is on disk is the only
// answer to "are the bytes I am about to send the bytes the deployed engine was built with".
function hashWorkingConfig(configDir) {
  const files = walkFiles(configDir).filter((f) => !f.startsWith(".git/"));
  if (!files.length) return new Map();
  // absolute paths: git chdirs to the worktree root before resolving --stdin-paths
  const out = execFileSync("git", ["hash-object", "--stdin-paths"], {
    cwd: configDir,
    input: files.map((f) => join(configDir, f)).join("\n") + "\n",
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  }).trim().split("\n");
  return new Map(files.map((f, i) => [f, out[i]]));
}

function hashDeployedConfig(repoRoot, rel, sha) {
  const out = git(["ls-tree", "-r", "-z", sha, "--", rel], repoRoot);
  const map = new Map();
  for (const rec of out.split("\0").filter(Boolean)) {
    const [meta, path] = rec.split("\t");
    const [, type, blob] = meta.split(/\s+/);
    if (type !== "blob") {
      refuse(CANNOT_TELL(`${path} in the deployed tree is a ${type}, not a file — cannot compare.`));
    }
    map.set(relative(rel, path), blob);
  }
  return map;
}

function assertConfigMatchesDeployedEngine(configDir, { allowMismatch }) {
  const dir = expand(configDir);
  const carryOn = (lines) => {
    if (!allowMismatch) refuse(lines);
    logOverride("--allow-config-engine-mismatch", lines.slice(0, 3).join(" | "));
  };

  if (!existsSync(dir)) return carryOn(CANNOT_TELL(`config dir ${dir} does not exist.`));

  let repoRoot, rel;
  try {
    repoRoot = git(["rev-parse", "--show-toplevel"], dir);
    // --show-prefix, not path.relative(): git resolves symlinks in --show-toplevel, so on macOS a
    // configDir reached through /tmp (-> /private/tmp) would otherwise come out as ../../../…
    rel = git(["rev-parse", "--show-prefix"], dir).replace(/\/$/, "");
  } catch {
    return carryOn(CANNOT_TELL(`${dir} is not inside a git repo, so there is no commit to compare.`));
  }
  if (!rel) {
    return carryOn(CANNOT_TELL(`${dir} is the root of its repo — that is the whole repo, not a config dir.`));
  }

  let sha, url;
  try {
    ({ sha, url } = deployedShaFromRemote(repoRoot));
  } catch (e) {
    return carryOn(String(e.message).trim().split("\n"));
  }
  try {
    git(["cat-file", "-e", `${sha}^{commit}`], repoRoot);
  } catch {
    return carryOn(CANNOT_TELL(
      `the deployed commit ${sha.slice(0, 7)} is not in this clone.`,
      `run: git -C ${repoRoot} fetch --tags --force`
    ));
  }

  let deployedMap, workingMap;
  try {
    deployedMap = hashDeployedConfig(repoRoot, rel, sha);
    workingMap = hashWorkingConfig(dir);
  } catch (e) {
    if (e instanceof Refusal) return carryOn(String(e.message).trim().split("\n"));
    return carryOn(CANNOT_TELL(`could not hash the config trees: ${e.message}`));
  }
  if (!deployedMap.size) {
    return carryOn(CANNOT_TELL(`the deployed commit ${sha.slice(0, 7)} has no ${rel}/ at all.`));
  }

  const changed = [];
  for (const [p, h] of workingMap) {
    if (!deployedMap.has(p)) changed.push(`A ${p}`);
    else if (deployedMap.get(p) !== h) changed.push(`M ${p}`);
  }
  for (const p of deployedMap.keys()) if (!workingMap.has(p)) changed.push(`D ${p}`);
  changed.sort();

  const head = git(["rev-parse", "HEAD"], repoRoot);
  if (!changed.length) {
    console.log(`config ✓ matches deployed engine ${sha.slice(0, 7)} (read from ${url} just now)`);
    return;
  }

  const count = (range) => {
    try { return Number(git(["rev-list", "--count", range, "--", rel], repoRoot)); } catch { return null; }
  };
  const ahead = count(`${sha}..HEAD`);
  const behind = count(`HEAD..${sha}`);
  const direction =
    ahead ? "config is NEWER than the deployed engine" :
    behind ? "config is OLDER than the deployed engine" :
    "config differs from the deployed engine (uncommitted or untracked edits)";

  carryOn([
    `REFUSED: the config this would ship is not the config the deployed engine was built with.`,
    `  ${direction}.`,
    `  config dir : ${dir}`,
    `  deployed   : ${sha.slice(0, 7)}  (read from ${url} just now — never from the local tag)`,
    `  your HEAD  : ${head.slice(0, 7)}`,
    `  config commits ahead of the deploy : ${ahead ?? "?"}`,
    `  config commits behind the deploy   : ${behind ?? "?"}`,
    `  ${changed.length} file(s) differ:`,
    ...changed.slice(0, 15).map((c) => `      ${c}`),
    ...(changed.length > 15 ? [`      … and ${changed.length - 15} more`] : []),
    `Shipping a config the live engine was not built for is what broke the vault three times`,
    `(retired 'chain' shell key; node_type_render.yaml -> schema.yaml; the resolution cascade).`,
    ahead
      ? `Fix: deploy the engine, then re-run. The deploy job moves refs/tags/deployed.`
      : `Fix: git -C ${repoRoot} fetch --tags --force && git -C ${repoRoot} pull`,
    `Override (logged): --allow-config-engine-mismatch`,
  ]);
}

// --- read the graph blob from state.db via the sqlite3 CLI (dependency-free, WAL-safe read) ---
function readGraph(stateDb) {
  const out = execFileSync(
    "sqlite3",
    ["-json", stateDb, "SELECT updated, data FROM graph_state ORDER BY updated DESC LIMIT 1"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  const rows = JSON.parse(out || "[]");
  if (!rows.length) throw new Error(`no graph_state row in ${stateDb} — has qntm-md run?`);
  const graph = JSON.parse(rows[0].data); // { version, nodes, edges }
  return { graph, generated_at: rows[0].updated };
}

// --- enumerate the views from qntm-md's view configs (their `path:` is the rendered file) ------
// Minimal field extraction — we only need id / path / domain, not full YAML. The top-level key of
// a view config is its id; path and domain are indented scalars.
function parseViewMeta(text) {
  let id = null;
  let path = null;
  let domain = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || line.trim() === "") continue;
    if (id === null) {
      const top = line.match(/^([A-Za-z0-9_-]+):\s*$/);
      if (top) {
        id = top[1];
        continue;
      }
    }
    if (path === null) {
      const m = line.match(/^\s+path:\s*(.+?)\s*$/);
      if (m) path = m[1].replace(/^["']|["']$/g, "");
    }
    if (domain === null) {
      const m = line.match(/^\s+domain:\s*(.+?)\s*$/);
      if (m) domain = m[1].replace(/^["']|["']$/g, "");
    }
  }
  return { id, path, domain };
}

const titleOf = (id) =>
  id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function readViews(viewsConfigDir, vaultDir) {
  const files = readdirSync(viewsConfigDir).filter((f) => f.endsWith(".yaml"));
  const views = [];
  const missing = [];
  for (const file of files) {
    const meta = parseViewMeta(readFileSync(join(viewsConfigDir, file), "utf8"));
    if (!meta.id || !meta.path) continue; // not a view manifest we understand
    const abs = join(vaultDir, meta.path);
    if (!existsSync(abs)) {
      missing.push(meta.path);
      continue; // configured but never rendered — skip, don't fabricate
    }
    views.push({
      id: meta.id,
      path: meta.path,
      title: titleOf(meta.id),
      domain: meta.domain || null,
      markdown: readFileSync(abs, "utf8"),
    });
  }
  views.sort((a, b) => a.id.localeCompare(b.id));
  return { views, missing };
}

function buildEnvelope(cfg) {
  const { graph, generated_at } = readGraph(expand(cfg.stateDb));
  const { views, missing } = readViews(expand(cfg.viewsConfigDir), expand(cfg.vaultDir));
  const snapshot = {
    generated_at,
    views,
    graph,
    // node → { view, line } comes from qntm-md's line/render cache; read-only display does not
    // need it, so v1 ships it empty. Populated when we wire two-way gestures (step 5).
    locations: {},
  };
  return { envelope: { snapshot, applied_edit_ids: [] }, missing };
}

async function push({ dryRun }) {
  const cfg = loadConfig();
  const { envelope, missing } = buildEnvelope(cfg);
  const { views, graph } = envelope.snapshot;

  const bytes = Buffer.byteLength(JSON.stringify(envelope));
  console.log(
    `gathered: ${views.length} views, ${graph.nodes?.length ?? 0} nodes, ` +
      `${graph.edges?.length ?? 0} edges, ${(bytes / 1024).toFixed(0)} KB` +
      ` (generated ${envelope.snapshot.generated_at})`
  );
  if (missing.length) {
    console.log(`  skipped ${missing.length} configured-but-unrendered view(s): ${missing.join(", ")}`);
  }
  // v1 stores the graph in one D1 row (1 MB cap). Warn early so the ceiling never surprises us.
  const graphKb = Buffer.byteLength(JSON.stringify(graph)) / 1024;
  if (graphKb > 800) {
    console.log(`  ⚠ graph is ${graphKb.toFixed(0)} KB, nearing D1's 1 MB row cap — time to enable R2`);
  }

  if (dryRun) {
    const out = join(tmpdir(), "graph-sync.snapshot.json");
    writeFileSync(out, JSON.stringify(envelope, null, 2));
    console.log(`dry run — envelope written to ${out} (no network)`);
    return;
  }

  // Prefer the env var; fall back to a gitignored local key file so a bare `push` just works.
  const keyFile = join(HERE, ".graph-push-key");
  const key =
    process.env.GRAPH_PUSH_KEY ||
    (existsSync(keyFile) ? readFileSync(keyFile, "utf8").trim() : "");
  if (!key) throw new Error("no push key — set GRAPH_PUSH_KEY or write scripts/.graph-push-key");
  if (!cfg.worker) throw new Error("config.worker not set (the Worker base URL)");

  const res = await fetch(`${cfg.worker}/app/graph`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(envelope),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(`push failed: ${res.status} ${JSON.stringify(body)}`);
  }
  console.log(`pushed — version ${body.version}, ${body.applied} edit(s) marked applied`);
}

// ── server client: THE SWAP ───────────────────────────────────────────────────────────────
// push my vault delta up  ->  server runs the cycle (the model is there)  ->  pull the projection.
// This is the client pattern the web and other computers re-use. The old `push` (below) shipped a
// laptop-COMPUTED snapshot to D1; it's legacy now that the model lives on the server.

const SERVER_KEY_FILE = join(HERE, ".server-token");

function serverAuth() {
  const key =
    process.env.SERVER_TOKEN ||
    (existsSync(SERVER_KEY_FILE) ? readFileSync(SERVER_KEY_FILE, "utf8").trim() : "");
  if (!key) throw new Error("no server token — set SERVER_TOKEN or write scripts/.server-token");
  return key;
}

function serverUrl(cfg) {
  if (!cfg.server) throw new Error("config.server not set (the Fly server URL)");
  return cfg.server.replace(/\/$/, "");
}

// Retry on CONNECTION failures only (fetch rejects = never reached the server, e.g. the machine
// is cold-starting). A connected-but-slow cycle never rejects, so this can't double-run a cycle.
async function fetchRetry(url, opts, { tries = 4, backoffMs = 1500 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, opts);
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, backoffMs * (i + 1)));
    }
  }
  throw lastErr;
}

// gzip tar of the vault CONTENTS — no top dir, no .obsidian, no macOS ._ AppleDouble junk.
function tarVault(vaultDir) {
  return execFileSync(
    "tar",
    ["--exclude=./.obsidian", "-czf", "-", "-C", expand(vaultDir), "."],
    { env: { ...process.env, COPYFILE_DISABLE: "1" }, maxBuffer: 256 * 1024 * 1024 }
  );
}

// gzip tar of the operator CONFIG contents (views/patterns/rules) — same hygiene as the vault.
function tarConfig(configDir) {
  return execFileSync(
    "tar",
    ["--exclude=./.git", "-czf", "-", "-C", expand(configDir), "."],
    { env: { ...process.env, COPYFILE_DISABLE: "1" }, maxBuffer: 256 * 1024 * 1024 }
  );
}

// GUARD 1 is in safeApply(); this is the only path from the network to the vault.
async function serverPull(targetDir, opts = {}) {
  const { quiet = false, dryRun = false, allowDestructive = false } = opts;
  const cfg = loadConfig();
  const res = await fetchRetry(`${serverUrl(cfg)}/vault`, {
    headers: { Authorization: `Bearer ${serverAuth()}` },
  });
  if (!res.ok) throw new Error(`pull failed: ${res.status}`);
  safeApply(Buffer.from(await res.arrayBuffer()), targetDir, { allowDestructive, dryRun, quiet });
  if (!quiet && !dryRun) console.log(`pulled projection -> ${expand(targetDir)}`);
}

async function serverCycle({ allowMismatch = false, allowDestructive = false } = {}) {
  const cfg = loadConfig();
  const base = serverUrl(cfg);
  const key = serverAuth();

  // GUARD 2 — before anything leaves this machine. The config is about to become the live
  // engine's input; if it is not the config that engine was built for, the cycle is worse than
  // useless (it writes a degraded projection back over the vault). Refuses if it cannot tell.
  assertConfigMatchesDeployedEngine(cfg.configDir, { allowMismatch });

  // 0. push the operator config (views/patterns/rules) — user admin content, flows as DATA so a
  //    view/rule change takes effect this cycle without a redeploy. Pushed before the vault so the
  //    server renders with your current config.
  const cfgUp = await fetchRetry(`${base}/config`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/gzip" },
    body: tarConfig(cfg.configDir),
  });
  if (!cfgUp.ok) throw new Error(`config push failed: ${cfgUp.status}`);

  // 1. push the whole vault up (the delta surface) — silent; the summary below is the signal
  const up = await fetchRetry(`${base}/vault`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/gzip" },
    body: tarVault(cfg.vaultDir),
  });
  if (!up.ok) throw new Error(`vault push failed: ${up.status}`);

  // 2. run the cycle ON THE SERVER — the model updates there, not here. Send our terminal width
  //    so the rules fit, and print qntm-md's own canonical summary verbatim (it carries the
  //    `qntm-cycle ✓ Ns` headline itself).
  const cols = process.stdout.columns || 100;
  const cy = await fetchRetry(`${base}/cycle?width=${cols}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
  });
  const summary = await cy.json();
  if (!cy.ok || !summary.ok) {
    throw new Error(`cycle failed: ${cy.status} ${JSON.stringify(summary)}`);
  }
  if (summary.summary_text) process.stdout.write(summary.summary_text.replace(/\n+$/, "") + "\n");

  // 3. pull the re-projected vault back down (silent) — through GUARD 1. Refusing here costs
  //    nothing on the server: the cycle already ran and its result is still there to pull again.
  await serverPull(cfg.vaultDir, { quiet: true, allowDestructive });
}

const USAGE = [
  "usage: node scripts/graph-sync.mjs <command> [flags]",
  "",
  "  cycle                            push config + vault, run the cycle on the server, pull it back",
  "  pull [--to DIR]                  pull the projection (into the vault when --to is omitted)",
  "  push [--dry-run]                 legacy: laptop-computed D1 snapshot",
  "",
  "  --dry-run                        pull: fetch and check the archive, write nothing",
  "  --allow-destructive-pull         apply a projection that blanks or guts existing files (logged)",
  "  --allow-config-engine-mismatch   ship config that is not what the deployed engine was built",
  "                                   with, or that the guard could not verify (logged)",
].join("\n");

const KNOWN = new Set(["--dry-run", "--allow-destructive-pull", "--allow-config-engine-mismatch", "--to"]);
const [cmd, ...rest] = process.argv.slice(2);
const toIdx = rest.indexOf("--to");
const toDir = toIdx >= 0 ? rest[toIdx + 1] : null;
// A mistyped override must not read as "no override was asked for" — say so and stop.
const unknown = rest.filter((a, i) => a.startsWith("-") && !KNOWN.has(a) && !(toIdx >= 0 && i === toIdx + 1));
if (unknown.length) {
  console.error(`unknown flag(s): ${unknown.join(", ")}\n\n${USAGE}`);
  process.exit(2);
}
const dryRun = rest.includes("--dry-run");
const allowDestructive = rest.includes("--allow-destructive-pull");
const allowMismatch = rest.includes("--allow-config-engine-mismatch");

const commands = {
  cycle: () => serverCycle({ allowMismatch, allowDestructive }),
  pull: () => serverPull(toDir || loadConfig().vaultDir, { dryRun, allowDestructive }),
  push: () => push({ dryRun }), // legacy: laptop-computed D1 snapshot
};

const fn = commands[cmd];
if (!fn) {
  console.error(USAGE);
  process.exit(2);
}
fn().catch((err) => {
  console.error(String(err?.message || err));
  // 3 = a guard refused. Distinguishable from 1 (the operation itself failed) so a caller can
  // tell "I would not do that" apart from "I tried and it broke".
  process.exit(err instanceof Refusal ? 3 : 1);
});

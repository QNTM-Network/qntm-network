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
 *
 * Config: scripts/graph-sync.config.json (gitignored — copy graph-sync.config.example.json).
 * Secret: GRAPH_PUSH_KEY in the environment (the same value set via `wrangler secret put`).
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  const path = join(HERE, "graph-sync.config.json");
  const fromFile = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  return { ...DEFAULTS, ...fromFile };
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

function untarInto(buf, targetDir) {
  mkdirSync(expand(targetDir), { recursive: true });
  execFileSync("tar", ["-xzf", "-", "-C", expand(targetDir)], {
    input: buf,
    maxBuffer: 256 * 1024 * 1024,
  });
}

async function serverPull(targetDir, { quiet = false } = {}) {
  const cfg = loadConfig();
  const res = await fetchRetry(`${serverUrl(cfg)}/vault`, {
    headers: { Authorization: `Bearer ${serverAuth()}` },
  });
  if (!res.ok) throw new Error(`pull failed: ${res.status}`);
  untarInto(Buffer.from(await res.arrayBuffer()), targetDir);
  if (!quiet) console.log(`pulled projection -> ${expand(targetDir)}`);
}

async function serverCycle() {
  const cfg = loadConfig();
  const base = serverUrl(cfg);
  const key = serverAuth();

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

  // 3. pull the re-projected vault back down (silent)
  await serverPull(cfg.vaultDir, { quiet: true });
}

const [cmd, ...rest] = process.argv.slice(2);
const dryRun = rest.includes("--dry-run");
const toIdx = rest.indexOf("--to");
const toDir = toIdx >= 0 ? rest[toIdx + 1] : null;

const commands = {
  cycle: () => serverCycle(),
  pull: () => serverPull(toDir || loadConfig().vaultDir),
  push: () => push({ dryRun }), // legacy: laptop-computed D1 snapshot
};

const fn = commands[cmd];
if (!fn) {
  console.error("usage: node scripts/graph-sync.mjs <cycle | pull [--to DIR] | push [--dry-run]>");
  process.exit(2);
}
fn().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});

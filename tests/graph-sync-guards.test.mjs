/**
 * scripts/graph-sync.mjs — the two guards.
 *
 *   node --test tests/graph-sync-guards.test.mjs
 *
 * Everything here runs against a THROWAWAY vault under os.tmpdir() and throwaway git repos. The
 * suite never reads, writes or even names the operator's live vault; `guards the throwaway vault`
 * below asserts that, and every fixture path is derived from mkdtempSync.
 *
 * The two defects under test, both of which reproduce against the pre-guard script:
 *
 *   1. `pull` untarred a remote archive straight over ~/qntm. A COMPLETE archive carrying blank
 *      files applied silently and exited 0 — and docs/architecture/graph-server-plan.md records
 *      that an emptied file "is read as authorial line-removal and deletes those nodes". A
 *      TRUNCATED archive applied its whole entries up to the cut and left the vault mixed.
 *   2. `cycle` shipped the trunk's config/ to a server whose engine came from the deploy. When
 *      they are from different commits the vault breaks; it has three times.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync,
  statSync, cpSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = resolve(fileURLToPath(import.meta.url), "..", "..", "scripts", "graph-sync.mjs");
const ROOT = mkdtempSync(join(tmpdir(), "graph-sync-test-"));
const LIVE_VAULT = join(homedir(), "qntm");
// Read once at load, checked once at the end: the suite must leave the operator's vault alone.
const LIVE_VAULT_MTIME = existsSync(LIVE_VAULT) ? statSync(LIVE_VAULT).mtimeMs : null;

after(() => rmSync(ROOT, { recursive: true, force: true }));

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────

const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** A vault shaped like the real one: domain folders of outcomes/routines/daily plus top-level views. */
function makeVault(dir) {
  let n = 42;
  const id = () => ((n = (n * 1103515245 + 12345) % 2147483648) % 9000) + 1000;
  for (const d of ["work", "personal", "dev", "admin", "life-admin", "home"]) {
    mkdirSync(join(dir, d), { recursive: true });
    for (const f of ["outcomes", "routines", "daily"]) {
      const lines = ["## Overdue"];
      for (let i = 1; i <= 8; i++) {
        lines.push(`- [ ] ${d} ${f} item ${i} [[qntm:${id()}]] #outcome #${d} 📅 2026-07-2${i % 9}`);
        lines.push(`    - [ ] sub-step ${i} for ${d}/${f} [[qntm:${id()}]] #task #${d} 🛫 2026-07-28`);
      }
      lines.push("## Due This Week");
      for (let i = 1; i <= 5; i++) lines.push(`- [x] done ${d} ${f} ${i} [[qntm:${id()}]] #task ✅ 2026-07-2${i}`);
      writeFileSync(join(dir, d, `${f}.md`), lines.join("\n") + "\n");
    }
  }
  for (const f of ["this_week", "inbox", "routines", "habits", "metrics"]) {
    const lines = [`## ${f}`];
    for (let i = 1; i <= 40; i++) lines.push(`- [ ] top-level ${f} line ${i} [[qntm:${id()}]] #task 🆕 2026-07-20`);
    writeFileSync(join(dir, `${f}.md`), lines.join("\n") + "\n");
  }
  mkdirSync(join(dir, ".obsidian"), { recursive: true });
  writeFileSync(join(dir, ".obsidian", "app.json"), "{}\n");
  return dir;
}

const tar = (dir) =>
  execFileSync("tar", ["--exclude=./.obsidian", "-czf", "-", "-C", dir, "."], {
    env: { ...process.env, COPYFILE_DISABLE: "1" }, maxBuffer: 64 * 1024 * 1024,
  });

const MASTER = makeVault(mkdirSync(join(ROOT, "vault-master"), { recursive: true }) || join(ROOT, "vault-master"));

// the server's correct re-projection: identical plus one legitimate tick
const SERVERSIDE = join(ROOT, "serverside");
cpSync(MASTER, SERVERSIDE, { recursive: true });
writeFileSync(
  join(SERVERSIDE, "this_week.md"),
  readFileSync(join(SERVERSIDE, "this_week.md"), "utf8") +
    "- [x] top-level this_week line 1 [[qntm:1111]] #task ✅ 2026-07-30\n"
);

const ARCHIVES = {
  // a normal, healthy projection
  good: tar(SERVERSIDE),
  // a complete, valid archive in which the server produced empty files (defect 2's second
  // incident produces exactly this shape: an engine that finds no render forms)
  blank: (() => {
    const d = join(ROOT, "serverside-blank");
    cpSync(SERVERSIDE, d, { recursive: true });
    for (const f of ["this_week.md", "work/outcomes.md", "personal/outcomes.md"]) writeFileSync(join(d, f), "");
    return tar(d);
  })(),
  // the same, but whitespace rather than zero bytes — just as blank to the engine
  whitespace: (() => {
    const d = join(ROOT, "serverside-ws");
    cpSync(SERVERSIDE, d, { recursive: true });
    writeFileSync(join(d, "work/outcomes.md"), "\n\n   \n");
    return tar(d);
  })(),
  // most of the vault gutted down to a stub — no single file blank, but the whole thing collapsed
  gutted: (() => {
    const d = join(ROOT, "serverside-gutted");
    cpSync(SERVERSIDE, d, { recursive: true });
    for (const f of readdirSync(d, { recursive: true })) {
      const p = join(d, String(f));
      if (String(f).endsWith(".md") && statSync(p).isFile()) writeFileSync(p, "## x\n- [ ] x\n");
    }
    return tar(d);
  })(),
};
// a cold-starting server closed the stream half way through
ARCHIVES.truncated = ARCHIVES.good.subarray(0, Math.floor(ARCHIVES.good.length * 0.55));

// ── harness ───────────────────────────────────────────────────────────────────────────────────

let server;
let port;
let serving = "good";
let hits = [];

before(async () => {
  server = createServer(async (req, res) => {
    hits.push(`${req.method} ${req.url.split("?")[0]}`);
    if (req.method === "GET" && req.url.startsWith("/vault")) {
      res.writeHead(200, { "Content-Type": "application/gzip" });
      return res.end(ARCHIVES[serving]);
    }
    for await (const _ of req) { /* drain uploads */ }
    if (req.url.startsWith("/cycle")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, summary_text: "qntm-cycle ✓ 0.1s" }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => server?.close());

/**
 * Runs the script as a child and resolves with its result. MUST be async: the fake server shares
 * this process's event loop, so a blocking spawnSync would deadlock against the script's own
 * fetch.
 */
function exec(args, { cwd, env } = {}) {
  return new Promise((done) => {
    const p = spawn(process.execPath, args, { cwd, env });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (status) => done({ status, stdout, stderr, out: stdout + stderr }));
  });
}

let caseNo = 0;
/** Fresh throwaway vault + config, run the script, hand back stdout/stderr/exit and a vault diff. */
async function run(args, { archive = "good", configDir = null, env = {} } = {}) {
  serving = archive;
  hits = [];
  const dir = join(ROOT, `case-${++caseNo}`);
  const vault = join(dir, "vault");
  mkdirSync(dir, { recursive: true });
  cpSync(MASTER, vault, { recursive: true });
  const before = manifest(vault);

  const cfgPath = join(dir, "config.json");
  writeFileSync(cfgPath, JSON.stringify({ vaultDir: vault, server: `http://127.0.0.1:${port}`, ...(configDir ? { configDir } : {}) }));
  const logPath = join(dir, "overrides.log");

  const r = await exec([SCRIPT, ...args], {
    env: {
      ...process.env, SERVER_TOKEN: "test-token",
      GRAPH_SYNC_CONFIG: cfgPath, GRAPH_SYNC_OVERRIDE_LOG: logPath, ...env,
    },
  });
  return {
    ...r, vault, dir, hits: [...hits],
    changed: JSON.stringify(before) !== JSON.stringify(manifest(vault)),
    blanks: files(vault).filter((f) => statSync(join(vault, f)).size === 0 && f.endsWith(".md")),
    overrides: existsSync(logPath) ? readFileSync(logPath, "utf8").trim() : "",
    snapshots: readdirSync(dir).filter((n) => n.startsWith("vault-vault-snapshot-pre-pull-")),
  };
}

function files(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files(p, base, out);
    else out.push(p.slice(base.length + 1));
  }
  return out;
}
const manifest = (dir) => files(dir).sort().map((f) => `${f}:${statSync(join(dir, f)).size}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("the suite itself", () => {
  test("every fixture is a throwaway under the temp dir", async () => {
    assert.ok(ROOT.startsWith(tmpdir()), `fixtures must live under ${tmpdir()}, got ${ROOT}`);
    for (const p of [ROOT, MASTER, SERVERSIDE]) {
      assert.ok(!p.startsWith(LIVE_VAULT), `${p} must not be inside the operator's vault`);
    }
  });
});

// ── GUARD 1: pull cannot destroy the vault ────────────────────────────────────────────────────

describe("guard 1 — pull", () => {
  test("REFUSES a blank-bearing projection, and writes nothing", async () => {
    const r = await run(["pull"], { archive: "blank" });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /REFUSED/);
    assert.match(r.out, /BLANK in the archive/);
    assert.match(r.out, /work\/outcomes\.md/);
    assert.match(r.out, /authorial\s*\n?\s*line-removal/);
    assert.equal(r.changed, false, "the vault must be byte-identical after a refusal");
    assert.deepEqual(r.blanks, []);
    assert.deepEqual(r.snapshots, [], "a refusal takes no snapshot — nothing was at risk");
  });

  test("REFUSES whitespace-only files too — blank is about content, not byte count", async () => {
    const r = await run(["pull"], { archive: "whitespace" });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /work\/outcomes\.md/);
    assert.equal(r.changed, false);
  });

  test("REFUSES a truncated archive, and writes nothing", async () => {
    const r = await run(["pull"], { archive: "truncated" });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /not intact/);
    assert.equal(r.changed, false, "the pre-guard script left the vault half-applied here");
  });

  test("REFUSES a wholesale collapse even with no single file blank", async () => {
    const r = await run(["pull"], { archive: "gutted" });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /shrink from \d+ to \d+ bytes/);
    assert.equal(r.changed, false);
  });

  // the opposite arm: a guard that refuses everything is not a guard
  test("APPLIES a healthy projection unchanged, and snapshots first", async () => {
    const r = await run(["pull"], { archive: "good" });
    assert.equal(r.status, 0, r.out);
    assert.equal(r.changed, true, "the legitimate tick must land");
    assert.match(r.out, /pulled projection ->/);
    assert.equal(r.snapshots.length, 1, r.out);
    // the snapshot is the vault as it was, and it follows the operator's own naming convention
    assert.match(r.snapshots[0], /^vault-vault-snapshot-pre-pull-\d{8}-\d{6}$/);
    assert.deepEqual(manifest(join(r.dir, r.snapshots[0])), manifest(MASTER));
    // and the applied result is exactly the server's projection
    assert.equal(
      readFileSync(join(r.vault, "this_week.md"), "utf8"),
      readFileSync(join(SERVERSIDE, "this_week.md"), "utf8")
    );
  });

  test("--dry-run checks and reports without touching the vault", async () => {
    const r = await run(["pull", "--dry-run"], { archive: "good" });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /dry run/);
    assert.equal(r.changed, false);
    assert.deepEqual(r.snapshots, []);
  });

  test("--allow-destructive-pull applies the blank projection and LOGS it", async () => {
    const r = await run(["pull", "--allow-destructive-pull"], { archive: "blank" });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /OVERRIDE USED: --allow-destructive-pull/);
    assert.equal(r.blanks.length, 3, "the override really does apply the damage");
    assert.match(r.overrides, /--allow-destructive-pull\tt?arget=.*blanked=3/);
    assert.equal(r.snapshots.length, 1, "and the snapshot is what makes that survivable");
    assert.deepEqual(manifest(join(r.dir, r.snapshots[0])), manifest(MASTER));
  });

  test("a mistyped override is an error, not a silent no-op", async () => {
    const r = await run(["pull", "--allow-destructive-pul"], { archive: "blank" });
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /unknown flag/);
    assert.equal(r.changed, false);
  });

  test("keeps only the last 3 pre-pull snapshots, and never a hand-labelled one", async () => {
    serving = "good";
    const dir = join(ROOT, "retention");
    const vault = join(dir, "vault");
    mkdirSync(dir, { recursive: true });
    cpSync(MASTER, vault, { recursive: true });
    // the operator's own convention, made by hand — must survive every prune
    const hand = join(dir, "vault-vault-snapshot-pre-habits-rollout-20260728-130413");
    mkdirSync(hand, { recursive: true });
    const cfgPath = join(dir, "config.json");
    writeFileSync(cfgPath, JSON.stringify({ vaultDir: vault, server: `http://127.0.0.1:${port}` }));
    const logPath = join(dir, "overrides.log");
    for (let i = 0; i < 5; i++) {
      const r = await exec([SCRIPT, "pull"], {
        env: { ...process.env, SERVER_TOKEN: "t", GRAPH_SYNC_CONFIG: cfgPath, GRAPH_SYNC_OVERRIDE_LOG: logPath },
      });
      assert.equal(r.status, 0, r.out);
      // snapshot dirs are second-stamped; make each run land on a distinct second
      await new Promise((r2) => setTimeout(r2, 1050));
    }
    const snaps = readdirSync(dir).filter((n) => n.startsWith("vault-vault-snapshot-pre-pull-"));
    assert.equal(snaps.length, 3, `expected 3 retained, got ${snaps.join(", ")}`);
    assert.ok(existsSync(hand), "a hand-labelled snapshot must never be pruned");
  });
});

// ── cycle: the vault goes up, the projection comes back, config never leaves ─────────────────

describe("cycle", () => {
  test("sends the vault, runs the cycle, pulls back — and never sends config (2026-10-10)", async () => {
    // Config is published through the API (scripts/publish-config.mjs); a configDir in the
    // settings must not bring the old push back.
    const r = await run(["cycle"], { configDir: MASTER });
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(r.hits, ["POST /vault", "POST /cycle", "GET /vault"]);
  });

  test("a blank projection from the cycle is still stopped by guard 1", async () => {
    const blanked = await run(["cycle"], { archive: "blank" });
    assert.equal(blanked.status, 3, blanked.out);
    assert.match(blanked.out, /BLANK in the archive/);
    assert.equal(blanked.changed, false);
  });

  test("the retired override is refused as unknown, not silently accepted", async () => {
    const r = await run(["cycle", "--allow-config-engine-mismatch"]);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /unknown flag/);
  });

  // last, so it covers everything above it
  test("the operator's live vault was never touched", async () => {
    if (LIVE_VAULT_MTIME === null) return; // not this machine; nothing to protect
    assert.equal(statSync(LIVE_VAULT).mtimeMs, LIVE_VAULT_MTIME, `${LIVE_VAULT} was modified`);
  });
});

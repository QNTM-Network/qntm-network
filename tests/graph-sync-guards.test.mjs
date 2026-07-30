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

// ── GUARD 2: config may not be shipped to a mismatched engine ──────────────────────────────────

/**
 * A throwaway qntm-shaped repo pair: a bare "remote" whose refs/tags/deployed the deploy job
 * moves, and a clone the operator works in. The guard must read the REMOTE tag, every time.
 */
function makeRepoPair(name) {
  const base = join(ROOT, `repo-${name}`);
  const remote = join(base, "remote.git");
  const clone = join(base, "clone");
  mkdirSync(base, { recursive: true });
  sh("git", ["init", "--bare", "-b", "main", remote]);

  const seed = join(base, "seed");
  mkdirSync(join(seed, "apps/qntm-md/config/views"), { recursive: true });
  sh("git", ["init", "-b", "main", seed]);
  sh("git", ["config", "user.email", "t@t"], seed);
  sh("git", ["config", "user.name", "t"], seed);
  const cfgDir = join(seed, "apps/qntm-md/config");
  writeFileSync(join(cfgDir, "global_defaults.yaml"), "defaults:\n  shell: direct\n");
  writeFileSync(join(cfgDir, "schema.yaml"), "node_types:\n  task: {}\n");
  writeFileSync(join(cfgDir, "views/this_week.yaml"), "this_week:\n  path: this_week.md\n");
  sh("git", ["add", "-A"], seed);
  sh("git", ["commit", "-m", "engine+config v1"], seed);
  const v1 = sh("git", ["rev-parse", "HEAD"], seed);
  sh("git", ["push", remote, "main"], seed);

  return {
    base, remote, clone, seed,
    v1,
    /** commit in the seed and push — the trunk moving forward */
    advance(msg, edits) {
      for (const [p, body] of Object.entries(edits)) {
        mkdirSync(dirname(join(seed, p)), { recursive: true });
        if (body === null) rmSync(join(seed, p)); else writeFileSync(join(seed, p), body);
      }
      sh("git", ["add", "-A"], seed);
      sh("git", ["commit", "-m", msg], seed);
      sh("git", ["push", remote, "main"], seed);
      return sh("git", ["rev-parse", "HEAD"], seed);
    },
    /** what the deploy job does */
    deploy(sha) { sh("git", ["update-ref", "refs/tags/deployed", sha], remote); },
    /** clone as the operator has it, with whatever tags existed at clone time */
    checkout(at) {
      rmSync(clone, { recursive: true, force: true });
      sh("git", ["clone", remote, clone]);
      sh("git", ["config", "user.email", "t@t"], clone);
      sh("git", ["config", "user.name", "t"], clone);
      if (at) sh("git", ["checkout", at], clone);
      return join(clone, "apps/qntm-md/config");
    },
    /** force the LOCAL tag to something the remote no longer says — the stale-pointer case */
    setLocalTag(sha) { sh("git", ["update-ref", "refs/tags/deployed", sha], clone); },
    localTag() { try { return sh("git", ["rev-parse", "deployed"], clone); } catch { return null; } },
  };
}

describe("guard 2 — config vs the deployed engine", () => {
  test("ALLOWS a cycle when the config matches the deploy, and stays quiet about it", async () => {
    const R = makeRepoPair("match");
    R.deploy(R.v1);
    const cfgDir = R.checkout();
    const r = await run(["cycle"], { configDir: cfgDir });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /config ✓ matches deployed engine/);
    assert.match(r.out, /qntm-cycle ✓/);
    assert.deepEqual(r.hits, ["POST /config", "POST /vault", "POST /cycle", "GET /vault"]);
    assert.equal(r.overrides, "", "the common path logs no override");
  });

  test("ALLOWS when the trunk is commits ahead but none of them touched config", async () => {
    const R = makeRepoPair("engine-only");
    R.deploy(R.v1);
    R.advance("engine work", { "io/applier.py": "x\n" });
    R.advance("more engine work", { "io/applier.py": "y\n" });
    const cfgDir = R.checkout();
    const r = await run(["cycle"], { configDir: cfgDir });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /config ✓ matches deployed engine/);
  });

  test("REFUSES when config is NEWER than the engine — the 2026-07-30 incident", async () => {
    const R = makeRepoPair("ahead");
    R.deploy(R.v1);
    R.advance("resolution-cascade refactor", {
      "apps/qntm-md/config/global_defaults.yaml": "resolution:\n  cascade:\n    - node\n    - type\n",
    });
    const cfgDir = R.checkout();
    const r = await run(["cycle"], { configDir: cfgDir });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /config is NEWER than the deployed engine/);
    assert.match(r.out, /M global_defaults\.yaml/);
    assert.match(r.out, /config commits ahead of the deploy : 1/);
    assert.deepEqual(r.hits, [], "nothing may leave the machine when the guard refuses");
  });

  test("REFUSES a moved file — the node_type_render.yaml -> schema.yaml incident", async () => {
    const R = makeRepoPair("moved");
    R.advance("add node_type_render", { "apps/qntm-md/config/node_type_render.yaml": "task: checkbox\n" });
    const withRender = sh("git", ["rev-parse", "HEAD"], R.seed);
    R.deploy(withRender);
    R.advance("render form is a fact about the TYPE", {
      "apps/qntm-md/config/node_type_render.yaml": null,
      "apps/qntm-md/config/schema.yaml": "node_types:\n  task:\n    render: checkbox\n",
    });
    const cfgDir = R.checkout();
    const r = await run(["cycle"], { configDir: cfgDir });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /D node_type_render\.yaml/);
    assert.match(r.out, /M schema\.yaml/);
    assert.deepEqual(r.hits, []);
  });

  test("REFUSES when config is OLDER than the engine — the 'chain' shell-key incident", async () => {
    const R = makeRepoPair("behind");
    const stale = R.v1;
    const newer = R.advance("retire the chain shell", {
      "apps/qntm-md/config/global_defaults.yaml": "defaults:\n  shell: direct\n  # chain retired\n",
    });
    R.deploy(newer);
    const cfgDir = R.checkout(stale); // operator's trunk never pulled
    const r = await run(["cycle"], { configDir: cfgDir });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /config is OLDER than the deployed engine/);
    assert.match(r.out, /fetch --tags --force/);
    assert.deepEqual(r.hits, []);
  });

  test("REFUSES uncommitted config edits — they are newer than any deploy", async () => {
    const R = makeRepoPair("dirty");
    R.deploy(R.v1);
    const cfgDir = R.checkout();
    writeFileSync(join(cfgDir, "global_defaults.yaml"), "defaults:\n  shell: experiment\n");
    const r = await run(["cycle"], { configDir: cfgDir });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /uncommitted or untracked edits/);
    assert.match(r.out, /M global_defaults\.yaml/);
  });

  test("REFUSES an untracked config file — tar ships it, git-diff would not see it", async () => {
    const R = makeRepoPair("untracked");
    R.deploy(R.v1);
    const cfgDir = R.checkout();
    writeFileSync(join(cfgDir, "views/scratch.yaml"), "scratch:\n  path: scratch.md\n");
    const r = await run(["cycle"], { configDir: cfgDir });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /A views\/scratch\.yaml/);
  });
});

// ── the trap: a stale local `deployed` tag ─────────────────────────────────────────────────────
//
// `git fetch` does NOT update an existing tag. A local `deployed` can therefore sit arbitrarily
// stale, and a guard that reads it reports SAFE at exactly the moment it is not. These two tests
// construct that state directly and prove the guard is reading the remote.

describe("guard 2 — the tag read is fresh, not stale", () => {
  test("a stale local tag that would say SAFE does not fool it", async () => {
    const R = makeRepoPair("stale-safe");
    // v2 changes config; the deploy job put the tag on v2, the operator fetched it, then the
    // deploy was rolled back to v1. The remote now says v1; the local tag still says v2.
    const v2 = R.advance("config change", {
      "apps/qntm-md/config/global_defaults.yaml": "defaults:\n  shell: direct\n  cascade: true\n",
    });
    R.deploy(v2);
    const cfgDir = R.checkout(); // clone picks up deployed=v2
    R.deploy(R.v1); // rollback on the remote
    assert.equal(R.localTag(), v2, "precondition: the local tag is stale");

    // control: a guard that trusted the local tag would find NO difference and allow the ship.
    const localSays = sh("git", ["diff", "--name-only", R.localTag(), "--", "apps/qntm-md/config"], R.clone);
    assert.equal(localSays, "", "precondition: the stale local tag reports SAFE");

    const r = await run(["cycle"], { configDir: cfgDir });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /config is NEWER than the deployed engine/);
    assert.match(r.out, new RegExp(R.v1.slice(0, 7)), "it must name the REMOTE sha");
    assert.doesNotMatch(r.out.replace(/never from the local tag/, ""), new RegExp(`deployed   : ${v2.slice(0, 7)}`));
    assert.deepEqual(r.hits, []);
    // and it did not repair the operator's clone behind his back
    assert.equal(R.localTag(), v2, "the guard must not write to the trunk clone");
  });

  test("a stale local tag that would say DANGEROUS does not block a legitimate sync", async () => {
    const R = makeRepoPair("stale-block");
    // the deploy moved forward to v2 and the operator's clone has the new config, but his local
    // `deployed` still points at v1 because a plain fetch left it alone.
    const v2 = R.advance("config change, then deployed", {
      "apps/qntm-md/config/global_defaults.yaml": "defaults:\n  shell: direct\n  cascade: true\n",
    });
    const cfgDir = R.checkout(); // clone at v2, no deployed tag on the remote yet
    R.setLocalTag(R.v1); // a stale pointer from an earlier deploy
    R.deploy(v2); // the deploy job catches up on the remote

    const localSays = sh("git", ["diff", "--name-only", R.v1, "--", "apps/qntm-md/config"], R.clone);
    assert.notEqual(localSays, "", "precondition: the stale local tag reports DANGEROUS");

    const r = await run(["cycle"], { configDir: cfgDir });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, new RegExp(`config ✓ matches deployed engine ${v2.slice(0, 7)}`));
  });
});

// ── cannot-tell: every one of these refuses, each with its own reason ──────────────────────────

describe("guard 2 — when it cannot tell, it refuses and says which", () => {
  test("no deployed tag on the remote", async () => {
    const R = makeRepoPair("no-tag");
    const cfgDir = R.checkout();
    const r = await run(["cycle"], { configDir: cfgDir });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /has no refs\/tags\/deployed/);
    assert.deepEqual(r.hits, []);
  });

  test("the remote is unreachable", async () => {
    const R = makeRepoPair("no-net");
    R.deploy(R.v1);
    const cfgDir = R.checkout();
    sh("git", ["remote", "set-url", "origin", join(ROOT, "does-not-exist.git")], R.clone);
    const r = await run(["cycle"], { configDir: cfgDir });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /could not read refs\/tags\/deployed/);
    assert.match(r.out, /A stale local `deployed` tag is deliberately NOT consulted/);
  });

  test("the deployed commit is not in this clone", async () => {
    const R = makeRepoPair("absent-sha");
    const cfgDir = R.checkout();
    // the deploy job moved the tag to a commit this clone has never fetched
    const unseen = R.advance("landed after the clone", { "io/applier.py": "z\n" });
    R.deploy(unseen);
    const r = await run(["cycle"], { configDir: cfgDir });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /is not in this clone/);
    assert.match(r.out, /fetch --tags --force/);
  });

  test("the config dir is not in a git repo at all", async () => {
    const loose = join(ROOT, "loose-config");
    mkdirSync(loose, { recursive: true });
    writeFileSync(join(loose, "schema.yaml"), "x: 1\n");
    const r = await run(["cycle"], { configDir: loose, env: { GIT_CEILING_DIRECTORIES: ROOT } });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /not inside a git repo/);
  });

  test("the config dir does not exist", async () => {
    const r = await run(["cycle"], { configDir: join(ROOT, "nope") });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /does not exist/);
  });

  test("--allow-config-engine-mismatch ships anyway and LOGS what it overrode", async () => {
    const R = makeRepoPair("override");
    R.deploy(R.v1);
    R.advance("config change", { "apps/qntm-md/config/schema.yaml": "node_types:\n  task:\n    render: heading\n" });
    const cfgDir = R.checkout();
    const r = await run(["cycle", "--allow-config-engine-mismatch"], { configDir: cfgDir });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /OVERRIDE USED: --allow-config-engine-mismatch/);
    assert.match(r.overrides, /--allow-config-engine-mismatch\t.*REFUSED/);
    assert.deepEqual(r.hits, ["POST /config", "POST /vault", "POST /cycle", "GET /vault"]);
  });

  test("the override also covers a cannot-tell — an offline emergency still ships, logged", async () => {
    const R = makeRepoPair("override-offline");
    R.deploy(R.v1);
    const cfgDir = R.checkout();
    sh("git", ["remote", "set-url", "origin", join(ROOT, "gone.git")], R.clone);
    const r = await run(["cycle", "--allow-config-engine-mismatch"], { configDir: cfgDir });
    assert.equal(r.status, 0, r.out);
    assert.match(r.overrides, /could not read refs\/tags\/deployed/);
  });
});

// ── the two guards together ────────────────────────────────────────────────────────────────────

describe("cycle end to end", () => {
  test("a mismatched engine that produces a blank projection is stopped twice over", async () => {
    const R = makeRepoPair("both");
    R.deploy(R.v1);
    // guard 1 alone: the config matches, but the projection comes back blank
    const cfgDir = R.checkout();
    const blanked = await run(["cycle"], { configDir: cfgDir, archive: "blank" });
    assert.equal(blanked.status, 3, blanked.out);
    assert.match(blanked.out, /BLANK in the archive/);
    assert.equal(blanked.changed, false);
    assert.deepEqual(blanked.hits, ["POST /config", "POST /vault", "POST /cycle", "GET /vault"]);

    // guard 2 alone: the config is ahead, so the cycle never runs and the blank never happens
    R.advance("config ahead", { "apps/qntm-md/config/schema.yaml": "node_types: {}\n" });
    const cfgDir2 = R.checkout();
    const refused = await run(["cycle"], { configDir: cfgDir2, archive: "blank" });
    assert.equal(refused.status, 3, refused.out);
    assert.match(refused.out, /not the config the deployed engine was built with/);
    assert.deepEqual(refused.hits, []);
  });

  // last, so it covers everything above it
  test("the operator's live vault was never touched", async () => {
    if (LIVE_VAULT_MTIME === null) return; // not this machine; nothing to protect
    assert.equal(statSync(LIVE_VAULT).mtimeMs, LIVE_VAULT_MTIME, `${LIVE_VAULT} was modified`);
  });
});

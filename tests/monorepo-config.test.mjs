/**
 * monorepo-config — the resolution rule, pinned from every location it has to hold from.
 *
 * ── WHAT THIS EXISTS TO STOP ──
 *
 * `scripts/monorepo-config.mjs` used to resolve `REPO_ROOT/../../../qntm/apps/qntm-md/config` — a
 * fixed three levels, calibrated for a WORKTREE. From the TRUNK clone that is one level too many
 * and it resolved to `$HOME/qntm/apps/qntm-md/config`, INSIDE the operator's live vault. Because
 * the path did not exist, every generator's `--check` reported an absence in reassuring words and
 * stopped, while the published declaration was stale. A check that passes by not running.
 *
 * So the rule is now a SEARCH, and this file drives that search from synthetic directory trees —
 * the trunk shape, the worktree shape, a worktree nested deeper, a clone under a different parent,
 * and CI — rather than from wherever the test happens to be checked out. A test that can only
 * observe one location cannot catch a bug whose whole nature is being right from one location.
 *
 * Section 4 is the adversarial half: it builds a `$HOME/qntm` that WOULD satisfy the markers and
 * proves the search still refuses to reach it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

import {
  MONOREPO_MARKERS,
  MONOREPO_DIR_NAME,
  CONFIG_SUBPATH,
  isMonorepoCheckout,
  searchAncestors,
  locateMonorepo,
  DEFAULT_CONFIG_DIR,
  MONOREPO_FOUND,
  REPO_ROOT,
} from "../scripts/monorepo-config.mjs";

// ── a synthetic filesystem, so the rule is driven and not merely observed ─────────────────────

/**
 * Build a fake world under one temp root.
 *
 * @param {object} spec
 * @param {string} spec.home the home directory, relative to the temp root
 * @param {string[]} spec.monorepos directories (relative to the temp root) to make look like a
 *   monorepo checkout — INCLUDING the trailing `qntm` segment
 * @returns {{root: string, path: (p: string) => string, cleanup: () => void}}
 */
function world({ home, monorepos }) {
  const root = mkdtempSync(join(tmpdir(), "monorepo-config-"));
  const path = (p) => resolve(root, p);
  mkdirSync(path(home), { recursive: true });
  for (const monorepo of monorepos) {
    for (const marker of MONOREPO_MARKERS) {
      const file = path(join(monorepo, marker));
      mkdirSync(resolve(file, ".."), { recursive: true });
      writeFileSync(file, "# marker\n");
    }
  }
  return { root, path, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** Locate, with the environment override forced off so the search itself is under test. */
const locate = (from, home) => locateMonorepo({ from, home, env: undefined });

// ── 1. the rule holds from every real layout ─────────────────────────────────────────────────

test("the trunk clone finds the monorepo beside it", () => {
  const w = world({ home: "Users/op", monorepos: ["Users/op/projects/qntm-network/qntm"] });
  try {
    const found = locate(w.path("Users/op/projects/qntm-network/qntm.network"), w.path("Users/op"));
    assert.equal(found?.monorepoRoot, w.path("Users/op/projects/qntm-network/qntm"));
    assert.equal(
      found?.configDir,
      w.path(join("Users/op/projects/qntm-network/qntm", CONFIG_SUBPATH)),
    );
  } finally {
    w.cleanup();
  }
});

test("a worktree finds the SAME monorepo, from two levels deeper", () => {
  const w = world({ home: "Users/op", monorepos: ["Users/op/projects/qntm-network/qntm"] });
  try {
    const trunk = locate(w.path("Users/op/projects/qntm-network/qntm.network"), w.path("Users/op"));
    const worktree = locate(
      w.path("Users/op/projects/qntm-network/worktrees/qntm-network/some-branch"),
      w.path("Users/op"),
    );
    // THE SENTENCE THAT MATTERS: not "each is right", but "both are the same answer". The defect
    // this replaces was a constant that could only ever be right for one of these two.
    assert.deepEqual(worktree, trunk);
  } finally {
    w.cleanup();
  }
});

test("a worktree nested one level deeper still finds it", () => {
  const w = world({ home: "Users/op", monorepos: ["Users/op/projects/qntm-network/qntm"] });
  try {
    const deeper = locate(
      w.path("Users/op/projects/qntm-network/worktrees/qntm-network/team/some-branch"),
      w.path("Users/op"),
    );
    assert.equal(deeper?.monorepoRoot, w.path("Users/op/projects/qntm-network/qntm"));
  } finally {
    w.cleanup();
  }
});

test("a clone under a DIFFERENT parent, with the monorepo beside it, finds it", () => {
  const w = world({ home: "Users/op", monorepos: ["Users/op/scratch/qntm"] });
  try {
    const found = locate(w.path("Users/op/scratch/qntm.network"), w.path("Users/op"));
    assert.equal(found?.monorepoRoot, w.path("Users/op/scratch/qntm"));
  } finally {
    w.cleanup();
  }
});

test("the NEAREST monorepo wins when two are in the ancestor chain", () => {
  const w = world({
    home: "Users/op",
    monorepos: ["Users/op/projects/qntm", "Users/op/projects/qntm-network/qntm"],
  });
  try {
    const found = locate(w.path("Users/op/projects/qntm-network/qntm.network"), w.path("Users/op"));
    assert.equal(found?.monorepoRoot, w.path("Users/op/projects/qntm-network/qntm"));
  } finally {
    w.cleanup();
  }
});

// ── 2. CI: nothing found, and nothing proposed ───────────────────────────────────────────────

test("CI finds nothing, because there is nothing to find", () => {
  const w = world({ home: "home/runner", monorepos: [] });
  try {
    const found = locate(w.path("home/runner/work/qntm-network/qntm-network"), w.path("home/runner"));
    assert.equal(found, null);
  } finally {
    w.cleanup();
  }
});

// ── 3. the marker test, not the directory NAME ───────────────────────────────────────────────

test("a bare directory named 'qntm' is NOT a monorepo checkout", () => {
  const w = world({ home: "Users/op", monorepos: [] });
  try {
    mkdirSync(w.path("Users/op/projects/qntm-network/qntm/apps/qntm-md/config"), {
      recursive: true,
    });
    assert.equal(isMonorepoCheckout(w.path("Users/op/projects/qntm-network/qntm")), false);
    assert.equal(
      locate(w.path("Users/op/projects/qntm-network/qntm.network"), w.path("Users/op")),
      null,
    );
  } finally {
    w.cleanup();
  }
});

test("every marker must be present, not just one", () => {
  const w = world({ home: "Users/op", monorepos: [] });
  const root = w.path("Users/op/projects/qntm-network/qntm");
  try {
    const first = join(root, MONOREPO_MARKERS[0]);
    mkdirSync(resolve(first, ".."), { recursive: true });
    writeFileSync(first, "# marker\n");
    assert.equal(isMonorepoCheckout(root), false);
  } finally {
    w.cleanup();
  }
});

// ── 4. THE REFUTATION: the search cannot reach the operator's vault ──────────────────────────

test("the ancestor walk never proposes $HOME itself", () => {
  const ancestors = searchAncestors("/Users/op/projects/qntm-network/qntm.network", "/Users/op");
  assert.deepEqual(ancestors, ["/Users/op/projects/qntm-network", "/Users/op/projects"]);
  assert.equal(ancestors.includes("/Users/op"), false);
});

test("a clone directly under $HOME searches NOTHING, rather than searching $HOME", () => {
  // `$HOME/qntm.network` is a layout a person can plausibly create. Under the walk this replaces,
  // its ancestor chain reaches `$HOME` on the first step and `$HOME/qntm` is the vault.
  assert.deepEqual(searchAncestors("/Users/op/qntm.network", "/Users/op"), []);
});

test("even a $HOME/qntm that SATISFIES every marker is not reachable", () => {
  // The adversarial case, built rather than argued: the day the operator's vault happens to hold
  // `apps/qntm-md/config/schema.yaml` and `apps/qntm-md/pyproject.toml`, the marker test alone
  // would say yes. The ceiling says no first, and says no from every depth.
  const w = world({ home: "Users/op", monorepos: ["Users/op/qntm"] });
  try {
    assert.equal(isMonorepoCheckout(w.path("Users/op/qntm")), true, "the bait is real");
    for (const from of [
      "Users/op/qntm.network",
      "Users/op/projects/qntm-network/qntm.network",
      "Users/op/projects/qntm-network/worktrees/qntm-network/some-branch",
      "Users/op/a/b/c/d/e/f/qntm.network",
    ]) {
      assert.equal(locate(w.path(from), w.path("Users/op")), null, `reached the vault from ${from}`);
    }
  } finally {
    w.cleanup();
  }
});

test("the ceiling holds when $HOME is reached through a SYMLINK", () => {
  // FOUND BY REFUTATION, not by design. A CI simulation with `$HOME=/tmp/ci-home` walked straight
  // past its own ceiling: macOS spells that directory `/private/tmp/ci-home` once Node has resolved
  // the module path, and `"/private/tmp/ci-home" === "/tmp/ci-home"` is false. The guard compared
  // spellings, not directories. It now compares both.
  const w = world({ home: "real-home", monorepos: [] });
  try {
    const home = w.path("real-home");
    mkdirSync(join(home, "projects", "qntm-network"), { recursive: true });
    symlinkSync(home, w.path("link-to-home"));
    const viaLink = w.path("link-to-home/projects/qntm-network/qntm.network");
    // The ceiling is named by its REAL path; the start is reached through the link, so every
    // ancestor spells itself `link-to-home/...`. A literal comparison never matches.
    const ancestors = searchAncestors(viaLink, home);
    assert.equal(
      ancestors.some((a) => realpathSync(a) === realpathSync(home)),
      false,
      `the walk stepped onto $HOME: ${ancestors.join(", ")}`,
    );
  } finally {
    w.cleanup();
  }
});

test("the NOT-FOUND fallback path is anchored in this checkout, never under $HOME/qntm", () => {
  // When nothing is located, `DEFAULT_CONFIG_DIR` is `REPO_ROOT/../qntm/apps/qntm-md/config`. That
  // is one level above the checkout, so it names a sibling of the checkout — a place a vault at
  // `$HOME/qntm` can only occupy if the checkout is itself directly under `$HOME`, which the
  // preceding test shows searches nothing at all.
  const nominal = resolve("/home/runner/work/qntm-network/qntm-network", "..", MONOREPO_DIR_NAME);
  assert.equal(nominal, join("/home/runner/work/qntm-network", MONOREPO_DIR_NAME));
});

// ── 5. this checkout, right now ──────────────────────────────────────────────────────────────

test("this very checkout resolves outside the operator's vault", () => {
  const home = resolve(process.env.HOME || "/nonexistent");
  const vault = join(home, MONOREPO_DIR_NAME) + sep;
  assert.equal(
    DEFAULT_CONFIG_DIR.startsWith(vault),
    false,
    `DEFAULT_CONFIG_DIR resolved INTO the vault: ${DEFAULT_CONFIG_DIR}`,
  );
});

test("MONOREPO_FOUND, not existsSync, is what says whether there was anything to check", () => {
  assert.equal(typeof MONOREPO_FOUND, "boolean");
  assert.equal(typeof DEFAULT_CONFIG_DIR, "string");
  assert.ok(DEFAULT_CONFIG_DIR.length > 0);
});

// ── 6. the two languages state the same rule ─────────────────────────────────────────────────

test("scripts/monorepo_config.py agrees with this module, from every shape", { skip: pythonSkip() }, () => {
  const cases = [
    "/Users/op/projects/qntm-network/qntm.network",
    "/Users/op/projects/qntm-network/worktrees/qntm-network/some-branch",
    "/Users/op/qntm.network",
    "/home/runner/work/qntm-network/qntm-network",
  ];
  const w = world({ home: "Users/op", monorepos: ["Users/op/projects/qntm-network/qntm"] });
  try {
    const home = w.path("Users/op");
    const script = join(REPO_ROOT, "scripts", "monorepo_config.py");
    for (const relative of cases) {
      const from = resolve(w.root, relative.replace(/^\//, ""));
      const js = locate(from, home);
      const out = execFileSync(
        pythonBin(),
        [
          "-c",
          [
            "import sys, json, pathlib",
            `sys.path.insert(0, ${JSON.stringify(join(REPO_ROOT, "scripts"))})`,
            "import monorepo_config as m",
            `r = m.locate_monorepo(pathlib.Path(${JSON.stringify(from)}), pathlib.Path(${JSON.stringify(home)}))`,
            "print(json.dumps(str(r) if r else None))",
          ].join("\n"),
        ],
        { encoding: "utf8", env: { ...process.env, QNTM_MONOREPO_CONFIG_DIR: "" } },
      );
      // Compared through `realpathSync`: Python's `Path.resolve()` follows symlinks and Node's
      // `path.resolve()` does not, so on macOS `/var/folders/...` and `/private/var/folders/...`
      // are the same directory spelled two ways. That difference is the platform's, not the rule's.
      const py = JSON.parse(out.trim());
      assert.equal(
        py === null ? null : realpathSync(py),
        js?.monorepoRoot ? realpathSync(js.monorepoRoot) : null,
        `the two statements of the rule disagree from ${relative} (${script})`,
      );
    }
  } finally {
    w.cleanup();
  }
});

// ── 7. WHICH engine a capture read, not only what it found ───────────────────────────────────
//
// `capture_refusal` is the decision an agreement script makes BEFORE it captures anything:
// is this checkout one I meant to read? It exists because on 2026-08-14 the shared trunk
// clone sat on a feature branch for three hours and every agreement script on the machine
// read a stale engine, printed its counts and exited 0 — "the engine has not changed" and "I
// read an engine from three days ago" spell the same output.
//
// EXERCISED AS A PURE FUNCTION OVER A REVISION DICT, deliberately. The case that started
// this — the auto-located trunk sitting on someone else's branch — cannot be staged by
// moving the real trunk without breaking every other session on the machine, so the decision
// was extracted from the wiring in order to be testable at all.
test("capture_refusal admits a clean main and refuses what it should", { skip: pythonSkip() }, () => {
  const cases = [
    // [label, revision, expected fragment or null for "allowed"]
    ["clean main, auto-located", { sha: "abc", branch: "main", dirty: false, overridden: false }, null],
    ["feature branch, auto-located", { sha: "abc", branch: "fix/x", dirty: false, overridden: false }, "not `main`"],
    // A NAMED checkout is a CHOICE — a caller capturing from a PR head or a merge base means
    // it, and refusing there would make the override useless for the job it exists for.
    ["feature branch, overridden", { sha: "abc", branch: "fix/x", dirty: false, overridden: true }, null],
    ["detached HEAD, overridden", { sha: "abc", branch: "HEAD", dirty: false, overridden: true }, null],
    // A DIRTY tree is refused either way: the recorded sha would name something other than
    // what was read, which is a FALSE provenance rather than a narrow one.
    ["dirty, auto-located", { sha: "abc", branch: "main", dirty: true, overridden: false }, "uncommitted"],
    ["dirty, overridden", { sha: "abc", branch: "main", dirty: true, overridden: true }, "uncommitted"],
    ["git cannot answer", { sha: null, branch: null, dirty: null, overridden: false }, "cannot determine"],
  ];
  for (const [label, revision, expected] of cases) {
    const out = execFileSync(
      pythonBin(),
      [
        "-c",
        [
          "import sys, json, pathlib",
          `sys.path.insert(0, ${JSON.stringify(join(REPO_ROOT, "scripts"))})`,
          "import monorepo_config as m",
          `r = m.capture_refusal(json.loads(${JSON.stringify(JSON.stringify(revision))}), pathlib.Path("/fake/engine/src"))`,
          "print(json.dumps(r))",
        ].join("\n"),
      ],
      { encoding: "utf8" },
    );
    const refusal = JSON.parse(out.trim());
    if (expected === null) {
      assert.equal(refusal, null, `${label}: expected the capture to be allowed, got ${refusal}`);
    } else {
      assert.ok(refusal, `${label}: expected a refusal and got none`);
      assert.match(refusal, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label);
    }
  }
});

function pythonBin() {
  return process.env.PYTHON || "python3";
}

function pythonSkip() {
  try {
    execFileSync(pythonBin(), ["--version"], { stdio: "ignore" });
    return false;
  } catch {
    return "no python3 on PATH — the cross-language pin needs one";
  }
}

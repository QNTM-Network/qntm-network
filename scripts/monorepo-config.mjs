/**
 * monorepo-config — where this repo's generators find the operator's qntm-md config, in ONE place.
 *
 * Four generators plus `checkdeclarations.mjs` read the monorepo. The path from this checkout to
 * that checkout is a fact with a history of being got wrong by one level, and a fact stated twice
 * is a fact that can disagree with itself. It is stated here, once.
 *
 * ── WHY THE FIXED `..` COUNT WAS RETIRED ──
 *
 * This module used to resolve `REPO_ROOT/../../../qntm/apps/qntm-md/config`, with a comment
 * calibrating the three levels for a WORKTREE at
 * `.../projects/qntm-network/worktrees/qntm-network/<branch>`. Three levels is right from a
 * worktree and ONE LEVEL TOO MANY from the trunk clone at `.../projects/qntm-network/qntm.network`,
 * where it resolved to `$HOME/qntm/apps/qntm-md/config` — a path INSIDE the operator's live vault.
 *
 * That is not a cosmetic miss. It produced the worst failure this system has: a CHECK THAT PASSES
 * BY NOT RUNNING. Every generator's `--check` found no config dir, printed a line claiming the
 * absence was "expected in CI", and stopped — while the published declaration was genuinely stale.
 * A reader took the silence for confirmation. And the day `$HOME/qntm/apps/qntm-md/config` exists,
 * that resolution makes the generators read the operator's VAULT as their config.
 *
 * A fixed number of `..` cannot be right from two locations at different depths. So the number is
 * gone. This module LOCATES the monorepo instead of counting to it.
 *
 * ── THE RULE ──
 *
 *   1. `QNTM_MONOREPO_CONFIG_DIR` in the environment wins outright. An explicit answer beats a
 *      search, and a test or a workflow can pin the search out of the way entirely.
 *   2. Otherwise walk UP from this checkout. At each ancestor A, ask whether `A/qntm` is a
 *      MONOREPO CHECKOUT — not merely a directory named `qntm`, but one carrying marker FILES a
 *      checkout has and a notes vault does not. The first ancestor that answers yes wins.
 *   3. The walk NEVER tests `$HOME` itself, and never anything above it. This is the categorical
 *      guard: `$HOME/qntm` IS the operator's vault, so a walk allowed to reach `$HOME` is a walk
 *      allowed to reach into the vault. It is not allowed to.
 *   4. If nothing is found, `MONOREPO_FOUND` is false and `DEFAULT_CONFIG_DIR` falls back to the
 *      NOMINAL sibling path `REPO_ROOT/../qntm/apps/qntm-md/config`, purely so callers that print
 *      or join it keep working. That fallback is anchored one level above this checkout, so it
 *      cannot name a path under `$HOME/qntm` either. Callers must read `MONOREPO_FOUND` when they
 *      need to say WHY there is nothing to check.
 *
 * Rules 2 and 3 are deliberately redundant. Either one alone keeps the resolution out of the
 * vault. Both together mean one mistake in either does not put it back.
 *
 * ── WHY THIS HOLDS FROM BOTH SHAPES ──
 *
 *   trunk    .../projects/qntm-network/qntm.network
 *            first ancestor tested is `.../projects/qntm-network` -> `.../qntm-network/qntm` HIT.
 *   worktree .../projects/qntm-network/worktrees/qntm-network/<branch>
 *            tests `.../worktrees/qntm-network`, `.../worktrees`, then `.../qntm-network` HIT.
 *
 * One rule, two depths, one answer. A worktree nested a further level deep still finds it, because
 * the walk does not count levels. CI finds nothing — there is no monorepo on the runner — and
 * stops below `$HOME` without ever proposing a vault path.
 */

import { statSync, realpathSync } from "node:fs";
import { resolve, dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const HERE = resolve(fileURLToPath(import.meta.url), "..");

export const REPO_ROOT = resolve(HERE, "..");

/** The monorepo's directory name, as checked out beside this repo. */
export const MONOREPO_DIR_NAME = "qntm";

/**
 * The files that tell a MONOREPO CHECKOUT apart from any other directory named `qntm` — most
 * pointedly, from the operator's vault. Both are committed files of the `qntm` repository that a
 * notes vault has no reason to hold, and neither is a directory a stray `mkdir` would produce.
 *
 * `schema.yaml` is the config bundle's own root schema. If it is absent there is no config bundle
 * here whatever the directory is named, so a positive match also states that what we found is
 * usable.
 */
export const MONOREPO_MARKERS = Object.freeze([
  join("apps", "qntm-md", "config", "schema.yaml"),
  join("apps", "qntm-md", "pyproject.toml"),
]);

/** The path from a monorepo root to the operator's qntm-md config bundle. */
export const CONFIG_SUBPATH = join("apps", "qntm-md", "config");

/** The path from a monorepo root to the qntm-md engine source. */
export const ENGINE_SRC_SUBPATH = join("apps", "qntm-md", "src");

const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/**
 * A path's real location when it exists, and the path itself when it does not.
 *
 * The ceiling in `searchAncestors` is a STRING COMPARISON, and a string comparison between two
 * spellings of the same directory is a comparison that says "different". This was not theoretical:
 * a CI simulation with `$HOME=/tmp/ci-home` walked straight past its own ceiling, because macOS
 * spells that directory `/private/tmp/ci-home` once Node has resolved the module path through the
 * symlink. Both sides are normalised here so the guard compares directories, not spellings.
 *
 * @param {string} path
 * @returns {string}
 */
function realOrSelf(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Is `candidate` a checkout of the monorepo, as opposed to some other directory named `qntm`?
 *
 * @param {string} candidate
 * @param {(path: string) => boolean} [fileExists] injectable, so the rule is testable off-disk
 * @returns {boolean}
 */
export function isMonorepoCheckout(candidate, fileExists = isFile) {
  return MONOREPO_MARKERS.every((marker) => fileExists(join(candidate, marker)));
}

/**
 * Every directory to test, from `from` upwards, STOPPING BEFORE `home`.
 *
 * Exported because the stop condition is the whole safety argument, and a safety argument that is
 * not testable is a claim. `home` is excluded from the list rather than filtered out of it later:
 * what this returns IS the complete set of places the locator may ever look.
 *
 * @param {string} from an absolute directory to start from — its PARENT is the first candidate
 * @param {string} home the user's home directory, an exclusive ceiling
 * @returns {string[]}
 */
export function searchAncestors(from, home) {
  // BOTH spellings of the ceiling, because either side of the comparison may arrive symlinked.
  const ceilings = new Set([resolve(home), realOrSelf(resolve(home))]);
  const { root } = parse(resolve(from));
  const ancestors = [];
  let current = dirname(resolve(from));
  while (current !== root) {
    // THE GUARD. `$HOME/qntm` is the operator's live vault. A walk that reaches `$HOME` is a walk
    // that can propose the vault as config, so it stops one short — and stops there whether or not
    // the vault currently holds anything that would match the markers.
    if (ceilings.has(current) || ceilings.has(realOrSelf(current))) break;
    ancestors.push(current);
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  return ancestors;
}

/**
 * Locate the monorepo checkout, or return null.
 *
 * @param {object} [options]
 * @param {string} [options.from] the repo root to walk up from
 * @param {string} [options.home] the ceiling
 * @param {string} [options.env] an explicit config dir that wins outright
 * @param {(path: string) => boolean} [options.fileExists] injectable, for tests
 * @returns {{configDir: string, monorepoRoot: string | null, source: string} | null}
 */
export function locateMonorepo({
  from = REPO_ROOT,
  home = homedir(),
  env = process.env.QNTM_MONOREPO_CONFIG_DIR,
  fileExists = isFile,
} = {}) {
  if (env) {
    return { configDir: resolve(env), monorepoRoot: null, source: "env" };
  }
  for (const ancestor of searchAncestors(from, home)) {
    const candidate = join(ancestor, MONOREPO_DIR_NAME);
    if (isMonorepoCheckout(candidate, fileExists)) {
      return {
        configDir: join(candidate, CONFIG_SUBPATH),
        monorepoRoot: candidate,
        source: "located",
      };
    }
  }
  return null;
}

const LOCATED = locateMonorepo();

/** True when a real monorepo checkout was found. FALSE IS NOT AN ERROR — it is CI. */
export const MONOREPO_FOUND = LOCATED !== null;

/** The monorepo checkout root, or null when none was found. */
export const MONOREPO_ROOT = LOCATED?.monorepoRoot ?? null;

/**
 * The config directory. A real path when `MONOREPO_FOUND`; otherwise the NOMINAL sibling path,
 * which does not exist and is anchored inside this checkout's own parent, so it cannot name the
 * vault. Read `MONOREPO_FOUND`, not this, to decide whether there was anything to check.
 */
export const DEFAULT_CONFIG_DIR =
  LOCATED?.configDir ?? resolve(REPO_ROOT, "..", MONOREPO_DIR_NAME, CONFIG_SUBPATH);

/** The qntm-md engine source inside the monorepo, or null when no monorepo was found. */
export const ENGINE_SRC = MONOREPO_ROOT ? join(MONOREPO_ROOT, ENGINE_SRC_SUBPATH) : null;

/**
 * One sentence saying what was looked for and what was found. Printed by every caller that has to
 * report "nothing was checked", so that report names a SEARCH rather than a bare path.
 *
 * @returns {string}
 */
export function configDirDiagnostic() {
  if (LOCATED?.source === "env") {
    return `config dir set explicitly by QNTM_MONOREPO_CONFIG_DIR: ${DEFAULT_CONFIG_DIR}`;
  }
  if (MONOREPO_FOUND) {
    return `monorepo checkout located at ${MONOREPO_ROOT}; config dir ${DEFAULT_CONFIG_DIR}`;
  }
  const looked = searchAncestors(REPO_ROOT, homedir())
    .map((ancestor) => join(ancestor, MONOREPO_DIR_NAME))
    .join(", ");
  return (
    `no '${MONOREPO_DIR_NAME}' monorepo checkout above ${REPO_ROOT} ` +
    `(searched: ${looked || "nothing — this checkout sits at or above $HOME"}). ` +
    "Set QNTM_MONOREPO_CONFIG_DIR or pass --config-dir to name one."
  );
}

/**
 * The shared "there is nothing here to check" report, so all five CLIs say the same thing in the
 * same words.
 *
 * It states the absence, states what the absence MEANS, and never claims to know the caller is CI.
 * The wording it replaces asserted "this is expected in CI" on the operator's own laptop, where it
 * was false, and was read there as confirmation that a check had passed.
 *
 * @param {string} configDir the directory that was looked for
 * @param {boolean} [required] whether the caller demanded a config dir
 * @returns {string[]} lines for stderr
 */
export function notCheckedReport(configDir, required = false) {
  // Only explain the SEARCH when the missing directory is the one the search produced. When a
  // caller named the directory with `--config-dir`, describing where the search would have looked
  // is a true sentence about the wrong thing — and a true sentence about the wrong thing is how
  // the line this replaces ("expected in CI") came to be read as reassurance.
  const why =
    resolve(configDir) === resolve(DEFAULT_CONFIG_DIR)
      ? configDirDiagnostic()
      : "named explicitly by --config-dir, so no search was made for it.";
  return [
    `NOTHING WAS CHECKED: no config dir at ${configDir}.`,
    `  ${why}`,
    "  It is NOT a pass — no declaration was compared against anything.",
    required
      ? "  --require-config was passed, so this is a FAILURE (exit 1)."
      : "  Exit 3 says so. CI does not clone the private monorepo and treats 3 as 'not checked'.\n" +
        "  Locally, pass --require-config to turn this into a failure instead.",
  ];
}

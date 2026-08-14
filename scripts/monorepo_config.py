"""monorepo_config — the Python statement of the SAME rule `scripts/monorepo-config.mjs` states.

`qualification-agreement.py`, `resolution-agreement.py` and `day-boundary-agreement.py` each
carried their own `REPO_ROOT.parents[2] / "qntm" / ...`. That is the exact defect the `.mjs`
module's header describes: a fixed number of levels, calibrated for a WORKTREE, which from the
TRUNK clone resolves one level too far and lands on `$HOME/qntm` — the operator's live vault.

Both languages now LOCATE the monorepo rather than count to it, by the same rule:

  1. `QNTM_MONOREPO_CONFIG_DIR` in the environment wins outright.
  2. Otherwise walk UP from this checkout; the first ancestor A where `A/qntm` carries the marker
     FILES of a monorepo checkout wins.
  3. The walk NEVER tests `$HOME` or above. `$HOME/qntm` is the vault; a walk that can reach
     `$HOME` is a walk that can propose the vault as config.

`tests/monorepo-config.test.mjs` pins the two statements against each other, so this file and the
`.mjs` one cannot drift into disagreeing about where the monorepo is.
"""

from __future__ import annotations

import os
from pathlib import Path

MONOREPO_DIR_NAME = "qntm"

#: Committed files of the `qntm` repository that a notes vault has no reason to hold. Kept
#: byte-identical to `MONOREPO_MARKERS` in `scripts/monorepo-config.mjs`.
MONOREPO_MARKERS = (
    Path("apps") / "qntm-md" / "config" / "schema.yaml",
    Path("apps") / "qntm-md" / "pyproject.toml",
)

CONFIG_SUBPATH = Path("apps") / "qntm-md" / "config"
ENGINE_SRC_SUBPATH = Path("apps") / "qntm-md" / "src"


def is_monorepo_checkout(candidate: Path) -> bool:
    """Is `candidate` a monorepo checkout, rather than any other directory named `qntm`?"""
    return all((candidate / marker).is_file() for marker in MONOREPO_MARKERS)


def search_ancestors(start: Path, home: Path) -> list[Path]:
    """Every directory to test, from `start` upwards, STOPPING BEFORE `home`.

    The stop condition is the whole safety argument. `home` is excluded from the list rather than
    filtered out later: what this returns IS the complete set of places the search may look.
    """
    # BOTH spellings of the ceiling. A ceiling comparison is a string comparison, and two
    # spellings of one directory compare "different" — a CI simulation with `$HOME=/tmp/ci-home`
    # walked past its own ceiling because macOS also spells that `/private/tmp/ci-home`.
    ceilings = {home, home.resolve()}
    ancestors: list[Path] = []
    current = start.resolve().parent
    while True:
        if current in ceilings or current.resolve() in ceilings or current == current.parent:
            break
        ancestors.append(current)
        current = current.parent
    return ancestors


def locate_monorepo(start: Path, home: Path | None = None) -> Path | None:
    """The monorepo checkout root, or None when there is none above `start`."""
    ceiling = home if home is not None else Path.home()
    for ancestor in search_ancestors(start, ceiling):
        candidate = ancestor / MONOREPO_DIR_NAME
        if is_monorepo_checkout(candidate):
            return candidate
    return None


def config_dir(start: Path, home: Path | None = None) -> Path:
    """The operator's config bundle.

    When nothing is located this returns the NOMINAL sibling path `start/../qntm/apps/qntm-md/
    config`, which does not exist and — being anchored one level above this checkout — cannot name
    a path under `$HOME/qntm`. Callers that must explain an absence should call `locate_monorepo`
    and say so; callers that only need something to hand to `--config-dir` can use this.
    """
    override = os.environ.get("QNTM_MONOREPO_CONFIG_DIR")
    if override:
        return Path(override).resolve()
    root = locate_monorepo(start, home)
    if root is not None:
        return root / CONFIG_SUBPATH
    return (start.resolve().parent / MONOREPO_DIR_NAME / CONFIG_SUBPATH).resolve()


#: The engine-source counterpart of `QNTM_MONOREPO_CONFIG_DIR`. It exists for one measured
#: reason: `engine_src` LOCATES a checkout and says nothing about which REVISION of the engine
#: that checkout is sitting on. On 2026-08-14 the shared trunk clone spent three hours on a
#: feature branch that predated the change under test, and every agreement script on this
#: machine read that engine and reported success — a capture cannot be trusted if the caller
#: has no way to name the tree it wants. On a machine where several sessions share one trunk,
#: "whatever branch it happens to be on" is the normal state, not an edge case.
ENGINE_SRC_ENV = "QNTM_MONOREPO_ENGINE_SRC"


def engine_src(start: Path, home: Path | None = None) -> Path:
    """The qntm-md engine source inside the monorepo, by the same rule.

    `QNTM_MONOREPO_ENGINE_SRC` wins outright, exactly as `QNTM_MONOREPO_CONFIG_DIR` does for
    `config_dir` — so a caller who needs a SPECIFIC engine revision (a worktree at a merge
    base, a checkout at a PR head) can name it instead of hoping the trunk is where they left
    it. Callers that capture from this path should also record WHICH revision they read; see
    `engine_revision`.
    """
    override = os.environ.get(ENGINE_SRC_ENV)
    if override:
        return Path(override).resolve()
    root = locate_monorepo(start, home)
    if root is not None:
        return root / ENGINE_SRC_SUBPATH
    return (start.resolve().parent / MONOREPO_DIR_NAME / ENGINE_SRC_SUBPATH).resolve()


def engine_revision(engine_source: Path) -> dict[str, str | bool | None]:
    """WHICH engine a capture read — sha, branch, and whether the tree was dirty.

    A capture that records WHAT it found and not WHERE it found it cannot tell "the engine has
    not changed" from "I read an engine from three days ago": both spell the same counts and
    the same exit 0. This is the `...Source` discipline `compile-resolution.mjs` already keeps
    for every answer it publishes, applied to the capture step.

    `dirty` is reported for the ENGINE SUBTREE, not the whole repo: a monorepo whose `tools/`
    has uncommitted edits is not a reason to distrust a read of `apps/qntm-md/src`, but an
    uncommitted edit INSIDE that subtree means the sha names something other than what was
    read. Every field is None/False when git cannot answer, and the caller decides what an
    unanswerable provenance is worth — this function never guesses.
    """
    import subprocess

    def _git(*args: str) -> str | None:
        try:
            done = subprocess.run(
                ["git", "-C", str(engine_source), *args],
                capture_output=True,
                text=True,
                timeout=15,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        return done.stdout.strip() if done.returncode == 0 else None

    branch = _git("rev-parse", "--abbrev-ref", "HEAD")
    status = _git("status", "--porcelain", "--", ".")
    return {
        "sha": _git("rev-parse", "HEAD"),
        "branch": branch,
        "dirty": None if status is None else bool(status.strip()),
        "overridden": bool(os.environ.get(ENGINE_SRC_ENV)),
    }


def capture_refusal(
    revision: dict[str, object], engine_source: Path, env_name: str = ENGINE_SRC_ENV
) -> str | None:
    """The one reason a capture from `engine_source` must be REFUSED, or None.

    A pure decision over an already-read revision, so it can be exercised without moving a
    shared checkout — the auto-located-trunk-on-a-feature-branch case is exactly the one a
    test cannot stage by hand without breaking every other session on the machine.

    THE ASYMMETRY IS DELIBERATE. A wrong BRANCH is refused only for the AUTO-LOCATED trunk:
    naming a checkout explicitly is a choice, and a caller capturing from a PR head or a
    merge base means it. A DIRTY tree is refused always, override or not, because the
    recorded sha would then name something other than what was read — that is a false
    provenance rather than a narrow one, and a false map is worse than a gap.
    """
    if revision.get("sha") is None:
        return (
            f"cannot determine which engine revision {engine_source} is — git could not "
            "answer. A capture that cannot name what it captured turns every downstream "
            "comparison into a check whose arms agree for a reason nobody chose."
        )
    if revision.get("dirty"):
        return (
            f"{engine_source} has uncommitted changes, so the recorded sha would not name "
            f"what was read. Commit or stash them in that checkout, or point {env_name} at "
            "a clean one."
        )
    if revision.get("branch") != "main" and not revision.get("overridden"):
        return (
            f"{engine_source} is on branch {revision.get('branch')!r}, not `main`. This is "
            "the AUTO-LOCATED trunk, and on a machine where several sessions share one "
            "clone, whatever branch it happens to be on is not what you meant to capture. "
            f"Return it to main, or set {env_name} to name the checkout you DO mean — an "
            "explicit choice is recorded and allowed; an accidental one is not."
        )
    return None

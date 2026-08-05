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
    ceiling = home.resolve()
    ancestors: list[Path] = []
    current = start.resolve().parent
    while True:
        if current == ceiling or current == current.parent:
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


def engine_src(start: Path, home: Path | None = None) -> Path:
    """The qntm-md engine source inside the monorepo, by the same rule."""
    root = locate_monorepo(start, home)
    if root is not None:
        return root / ENGINE_SRC_SUBPATH
    return (start.resolve().parent / MONOREPO_DIR_NAME / ENGINE_SRC_SUBPATH).resolve()

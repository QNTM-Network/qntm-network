"""view-key-agreement — capture the ENGINE's own view-sheet key allow-lists, to measure
`scripts/compile-resolution.mjs`'s declared read surface against.

── THE QUESTION THIS ANSWERS ──

"Which keys may an operator declare on a view SHEET, and on a SECTION?" The answer is the
engine's, not the browser's: `qntm_md.bundle.validators.views` hard-rejects an unknown key at
BOTH levels, so a key outside these two lists cannot appear in a config that loads at all.
Measured 2026-08-14 by running `validate_views` over a sheet declaring `composition:` — sheet
level and section level each raised `BundleValidationError`, and the bundle did not load.

That makes the two lists the operator's whole declarable surface, and makes a change to either
one a change to what the browser must be able to see. `tests/view-key-agreement.test.mjs`
asserts `compile-resolution.mjs`'s own three lists (PUBLISHED / REFUSED / NOT_PUBLISHED) union
to exactly the list captured here — so ADDING a key to the engine (a per-view `composition:` is
the live candidate) turns that test red until this generator decides what to do with it, rather
than the browser silently publishing a global answer for a view that overrides it. That silence
is what monorepo PR #72 opened for `composition:` at the GLOBAL rung and what
`readGlobalComposition` closed six weeks later, by hand, after someone noticed.

Same shape as `scripts/day-boundary-agreement.py` / `composition-agreement.py`: read the
engine's own definition LIVE, never transcribe it, and REFUSE to write a fixture that fails its
own sanity checks.

── WHAT IS CAPTURED ──

  sheetKeys    — `validators.views._ALLOWED_SHEET_KEYS_ORDER`, verbatim and in source order.
  sectionKeys  — `validators.views._ALLOWED_SECTION_KEYS_ORDER`, likewise. NOTE this list is
                 ASSEMBLED in three appends at import time (base + section flags + ordering_mode),
                 which is exactly why it is read live rather than copied out of the source.
  levelsFor    — `qntm_md.resolution.registration.LEVELS_FOR`, the per-key level table, as
                 `key -> [level, ...]`. The allow-lists say a key may be WRITTEN at a level; this
                 says which levels the cascade actually RESOLVES it through. Both are needed: a
                 key can be admitted by the validator and resolved at fewer levels than it is
                 admitted at, and that gap is where a stale global answer hides.

── USAGE ──

    apps/qntm-md/.venv/bin/python scripts/view-key-agreement.py [--out PATH]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import monorepo_config

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO_ROOT / "tests" / "fixtures" / "view-key-agreement.json"

# The engine source lives in the monorepo, read-only. LOCATED, never counted to — see
# scripts/monorepo_config.py for why a fixed `parents[N]` resolved to the operator's live vault.
ENGINE_SRC = monorepo_config.engine_src(REPO_ROOT)
if str(ENGINE_SRC) not in sys.path:
    sys.path.insert(0, str(ENGINE_SRC))

from qntm_md.bundle.validators import views as views_validator  # noqa: E402
from qntm_md.resolution.registration import LEVELS_FOR  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    sheet_keys = list(views_validator._ALLOWED_SHEET_KEYS_ORDER)
    section_keys = list(views_validator._ALLOWED_SECTION_KEYS_ORDER)
    levels_for = {key.value: [level.value for level in levels] for key, levels in LEVELS_FOR.items()}

    # REFUSE rather than write a fixture that cannot be measuring what this file claims. Each
    # check below is one way the read could silently succeed against the wrong object — an
    # emptied constant, a renamed symbol resolving to the other list, a table that stopped being
    # populated at import time. A fixture that passes these is not proved correct; a fixture that
    # fails one is proved wrong, which is the half that can be automated.
    if not sheet_keys or not section_keys:
        print(
            "REFUSING: one of the engine's two allow-lists read as empty — the symbol exists but "
            "carries nothing, so the fixture would assert against an empty set and pass forever",
            file=sys.stderr,
        )
        return 2
    if sheet_keys == section_keys:
        print(
            "REFUSING: the sheet and section allow-lists read as identical — they are different "
            "lists in the engine, so this is a symbol mix-up, not a config change",
            file=sys.stderr,
        )
        return 2
    if "sections" not in sheet_keys or "qualification" not in section_keys:
        print(
            "REFUSING: the sheet list has no 'sections' or the section list has no "
            "'qualification' — the two keys every view sheet in the operator's config declares. "
            "The lists were read from something other than the view-sheet validator",
            file=sys.stderr,
        )
        return 2
    if not levels_for:
        print("REFUSING: LEVELS_FOR read as empty", file=sys.stderr)
        return 2

    fixture = {
        "note": (
            "GENERATED by scripts/view-key-agreement.py from the engine's own "
            "qntm_md.bundle.validators.views._ALLOWED_SHEET_KEYS_ORDER / "
            "._ALLOWED_SECTION_KEYS_ORDER and qntm_md.resolution.registration.LEVELS_FOR. "
            "Never hand-edit: regenerate. These two lists are the WHOLE surface an operator may "
            "declare on a view sheet — the engine's validator rejects anything else at load time "
            "and the bundle does not load, so a slot the browser publishes for a key absent here "
            "can never be filled by a config that works."
        ),
        "sheetKeys": sheet_keys,
        "sectionKeys": section_keys,
        "levelsFor": levels_for,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(fixture, indent=2) + "\n")
    print(
        f"wrote {args.out}\n"
        f"  {len(sheet_keys)} sheet keys, {len(section_keys)} section keys, "
        f"{len(levels_for)} keys in the level table"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

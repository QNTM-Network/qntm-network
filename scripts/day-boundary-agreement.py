"""day-boundary-agreement — produce the ENGINE's own day-boundary answers, to measure the
browser's `app/present/today.ts` against.

design-the-resolution-architecture.md step 8's own falsifier: "at 03:59 Europe/London the
resolver's `today()` returns the previous calendar date; at 04:01 it returns the current one; a
Sunday resolves into the week that started the preceding Monday." Proof standard #3 in the
operator's brief asks for this generated FROM the engine's own definition, not transcribed —
exactly `scripts/resolution-agreement.py`'s and `scripts/qualification-agreement.py`'s own shape,
applied to `qntm_md.substrate_wiring.day_boundary.resolve_logical_day` /
`resolve_week_end` instead of the resolution cascade.

── WHAT IS COMPARED ──

For a set of UTC instants either side of the REAL config's declared boundary (`Europe/London`,
`day_start_hour: 4`, `week_starts_on: monday`) plus a handful either side of the two 2026 DST
transitions (BST starts 2026-03-29, ends 2026-10-25) — a genuine stress of the IANA tz-database
read, not just the arithmetic — this script calls the engine's own two functions directly and
records `(logical_date, week_end)`. `tests/present-today.test.mjs` calls `todayFor` for the SAME
instants and asserts equality.

Two more comparisons, using boundary values OTHER than the real config's, prove the browser's
answer follows the DECLARED boundary rather than one hardcoded pair: `day_start_hour: 0` (the
legacy UTC-midnight default) and `week_starts_on: sunday`.

── USAGE ──

    apps/qntm-md/.venv/bin/python scripts/day-boundary-agreement.py [--out PATH]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO_ROOT / "tests" / "fixtures" / "day-boundary-agreement.json"

# The engine source lives in the monorepo, read-only, three levels up from this worktree — the
# same relative shape `scripts/resolution-agreement.py`'s own `DEFAULT_CONFIG_DIR` uses.
ENGINE_SRC = REPO_ROOT.parents[2] / "qntm" / "apps" / "qntm-md" / "src"
if str(ENGINE_SRC) not in sys.path:
    sys.path.insert(0, str(ENGINE_SRC))

from qntm_md.substrate_wiring.day_boundary import resolve_logical_day, resolve_week_end  # noqa: E402

REAL = {"timezone": "Europe/London", "day_start_hour": 4, "week_starts_on": "monday"}

# UTC instants, each with the boundary parameters to run it against and a one-line reason it is
# in the set. `Europe/London` is GMT (UTC+0) in winter and BST (UTC+1) in summer — the two DST
# transition cases exist specifically to prove the tz-database READ, not only the hour arithmetic.
CASES: list[tuple[str, dict[str, object], str]] = [
    # ── the falsifier's own three claims, verbatim ──
    ("2026-06-23T02:59:00Z", REAL, "03:59 BST — one minute before rollover, still yesterday"),
    ("2026-06-23T03:01:00Z", REAL, "04:01 BST — one minute after rollover, already today"),
    ("2026-07-05T12:00:00Z", REAL, "a Sunday — resolves into the week that started Monday 06-29"),
    # ── the exact boundary instant: 04:00:00 local is the FIRST second of the new day ──
    ("2026-06-23T03:00:00Z", REAL, "04:00:00 BST exactly — the boundary itself belongs to today"),
    # ── winter (GMT, UTC+0): same claims, opposite DST regime ──
    ("2026-01-15T03:59:00Z", REAL, "03:59 GMT — winter, still yesterday"),
    ("2026-01-15T04:01:00Z", REAL, "04:01 GMT — winter, already today"),
    # ── DST SPRING FORWARD, 2026-03-29 01:00 UTC clocks go 01:00 GMT -> 02:00 BST ──
    ("2026-03-29T00:30:00Z", REAL, "00:30 UTC on transition day — still GMT, 00:30 local"),
    ("2026-03-29T03:30:00Z", REAL, "03:30 UTC on transition day — now BST, 04:30 local, rolled"),
    # ── DST FALL BACK, 2026-10-25 01:00 UTC clocks go 02:00 BST -> 01:00 GMT ──
    ("2026-10-25T02:30:00Z", REAL, "02:30 UTC on transition day — already GMT, 02:30 local, not yet rolled"),
    ("2026-10-25T03:30:00Z", REAL, "03:30 UTC on transition day — now GMT, 03:30 local, not yet rolled"),
    ("2026-10-25T04:30:00Z", REAL, "04:30 UTC on transition day — GMT, 04:30 local, rolled"),
    # ── THE CONFIG-SENSITIVITY CASES: same instant, DIFFERENT declared boundary, answer follows ──
    (
        "2026-06-23T01:00:00Z",
        {"timezone": "Europe/London", "day_start_hour": 4, "week_starts_on": "monday"},
        "02:00 BST, REAL boundary — before the 04:00 rollover, so still yesterday",
    ),
    (
        "2026-06-23T01:00:00Z",
        {"timezone": "Europe/London", "day_start_hour": 0, "week_starts_on": "monday"},
        "SAME instant as above, day_start_hour 0 (legacy UTC midnight) — 02:00 local is already "
        "past a midnight rollover, so this must NOT agree with the day_start_hour:4 answer",
    ),
    (
        "2026-07-05T12:00:00Z",
        {"timezone": "Europe/London", "day_start_hour": 4, "week_starts_on": "sunday"},
        "SAME Sunday as above, week_starts_on sunday — the week end must move",
    ),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=DEFAULT_OUT, type=Path)
    args = parser.parse_args()

    rows = []
    for now_iso, boundary, reason in CASES:
        now = datetime.strptime(now_iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        logical_date, _since = resolve_logical_day(
            now,
            timezone_name=str(boundary["timezone"]),
            day_start_hour=int(boundary["day_start_hour"]),  # type: ignore[arg-type]
        )
        week_end = resolve_week_end(logical_date, week_starts_on=str(boundary["week_starts_on"]))
        rows.append(
            {
                "nowUtcIso": now_iso,
                "boundary": {
                    "timezone": boundary["timezone"],
                    "dayStartHour": boundary["day_start_hour"],
                    "weekStartsOn": boundary["week_starts_on"],
                },
                "reason": reason,
                "logicalDate": logical_date,
                "weekEnd": week_end,
            }
        )

    # ── POSITIVE CONTROLS — a measurement of "everything agrees" is worthless if the browser's
    # answer for the "yesterday" and "today" cases were accidentally identical, or if neither DST
    # regime nor either boundary override ever actually changed the result. ──
    real_rows = [r for r in rows if r["boundary"] == {"timezone": "Europe/London", "dayStartHour": 4, "weekStartsOn": "monday"}]
    dates = {r["logicalDate"] for r in real_rows}
    if len(dates) < 2:
        print("REFUSING: every REAL-boundary case resolved to the SAME logical date — the " "03:59/04:01 split never actually exercised anything", file=sys.stderr)
        return 2
    boundary_case = next(r for r in rows if r["nowUtcIso"] == "2026-06-23T01:00:00Z" and r["boundary"]["dayStartHour"] == 4)
    legacy_case = next(r for r in rows if r["nowUtcIso"] == "2026-06-23T01:00:00Z" and r["boundary"]["dayStartHour"] == 0)
    if boundary_case["logicalDate"] == legacy_case["logicalDate"]:
        print("REFUSING: day_start_hour 4 vs 0 produced the SAME logical date for the same instant — the config-sensitivity case is not actually sensitive", file=sys.stderr)
        return 2
    monday_case = next(r for r in rows if r["nowUtcIso"] == "2026-07-05T12:00:00Z" and r["boundary"]["weekStartsOn"] == "monday")
    sunday_case = next(r for r in rows if r["nowUtcIso"] == "2026-07-05T12:00:00Z" and r["boundary"]["weekStartsOn"] == "sunday")
    if monday_case["weekEnd"] == sunday_case["weekEnd"]:
        print("REFUSING: week_starts_on monday vs sunday produced the SAME week end for the same date — the config-sensitivity case is not actually sensitive", file=sys.stderr)
        return 2

    fixture = {
        "note": (
            "GENERATED by scripts/day-boundary-agreement.py from the engine's own "
            "qntm_md.substrate_wiring.day_boundary.resolve_logical_day / resolve_week_end. "
            "Never hand-edit: regenerate. Covers the design document's own step-8 falsifier "
            "(03:59/04:01 either side of the rollover, a Sunday's week end), both DST regimes "
            "Europe/London carries, both 2026 DST transition days, and two config-sensitivity "
            "cases (day_start_hour 0 vs 4, week_starts_on sunday vs monday) for the SAME instant."
        ),
        "cases": rows,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(fixture, indent=2) + "\n")
    print(f"wrote {args.out}\n  {len(rows)} instants answered by the engine")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

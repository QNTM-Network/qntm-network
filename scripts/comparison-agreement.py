"""comparison-agreement — produce the ENGINE's own answers for the orderable-comparison and
cycle-variable predicates job 1 ("the last fourteen") admitted, to measure the browser's
`app/present/select/membership.ts` against.

── WHY THIS EXISTS, SEPARATELY FROM qualification-agreement.py ──

`qualification-agreement.py`'s own `TRIPLE_FIELDS` is a DELIBERATE, stated three-axis probe space
(`node_type`, `domain`, `status`) — see that constant's own "RESTATED 2026-08-06" header. Every
predicate ranging over a field outside it, including all fourteen job 1 closes
(`due_date`/`available_date`/`created_at` compared against `$cycle_today`/`$cycle_week_end`), is
correctly excluded from THAT fixture as `fieldOutOfScopePatterns` — not attempted, not silently
skipped, but not verified either. This script is the verification qualification-agreement.py's own
header says a widened probe space would need: it controls the FOURTH axis directly (a date field's
value) and the cycle variables themselves (`cycle_today`/`cycle_week_end`, passed as pattern
PARAMETERS — `core/graph/src/qntm_graph/patterns/engine.py::_merge_params` accepts any
`cycle_`-prefixed kwarg unconditionally), so it needs no state.db and no real graph: every case is
a synthetic node, created in an EMPTY in-memory graph built from the read-only monorepo schema.

── WHAT IT READS, AND WHAT IT NEVER DOES ──

It reads the operator's real config bundle (`bundle.load()`, pure config parsing) to get the real
schema and the real, compiled patterns — the SAME patterns `presentation.json` was compiled from,
never a hand-transcribed copy. It opens no state.db, no network connection, runs no cycle, and
writes nothing outside `tests/fixtures/`. `qntm_graph.Graph(registry, raw_schema, patterns=...)` is
constructed EMPTY — no `Graph.from_dict`, no real node ever enters it — and every node this script
creates is `graph.create_node(...)`, an in-memory Python object never serialised anywhere.

── THE CASES ──

One representative pattern per operator class among the fourteen, plus the boundary shapes the
task's own verification bar asks for (equal, just-above, just-below, missing/null, and the two
offset directions `$cycle_today ± N d` needs):

    overdue              due_date: {lt: $cycle_today}                       — bare `lt`
    due-this-week        due_date: {gte: $cycle_today, lte: $cycle_week_end} — a range, both ends
    all-personal-nodes   available_date: {not: {gt: $cycle_today}}          — null-tolerant `not`+`gt`
    available-tomorrow   available_date: {eq: "$cycle_today + 1 d"}        — `eq` with a `+` offset
    due-yesterday        due_date: {eq: "$cycle_today - 1 d"}              — `eq` with a `-` offset

Plus ONE case that composes the day boundary WITH a comparison, at the exact 03:59/04:01 Europe/
London rollover `tests/present-today.test.mjs`'s own falsifier already proves the browser's clock
reader gets right in isolation — this is the same falsifier, carried one step further into a
predicate that reads the boundary's OUTPUT rather than stopping at the boundary itself.

── USAGE ──

    apps/qntm-md/.venv/bin/python scripts/comparison-agreement.py [--config-dir DIR] [--out PATH]
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import monorepo_config
import structlog

structlog.configure(wrapper_class=structlog.make_filtering_bound_logger(logging.CRITICAL))

import qntm_graph  # noqa: E402
from qntm_graph.patterns.engine import matches_pattern  # noqa: E402
from qntm_md.bundle import load as bundle_load  # noqa: E402
from qntm_md.substrate_wiring.day_boundary import resolve_logical_day  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_DIR = monorepo_config.config_dir(REPO_ROOT)
DEFAULT_OUT = REPO_ROOT / "tests" / "fixtures" / "comparison-agreement.json"

# `cycle_today`/`cycle_week_end` for every case except the day-boundary composition, which derives
# its own from `resolve_logical_day` directly — a fixed pair keeps every other case legible and
# lets the fixture assert the SAME pair produces the SAME answer across all five patterns.
CYCLE_TODAY = "2026-08-06"
CYCLE_WEEK_END = "2026-08-09"  # the Sunday closing the Monday-started week CYCLE_TODAY sits in

REAL_BOUNDARY = {"timezone": "Europe/London", "day_start_hour": 4, "week_starts_on": "monday"}


def case(
    name: str,
    pattern: str,
    node_type: str,
    field: str,
    value: str | None,
    *,
    cycle_today: str = CYCLE_TODAY,
    cycle_week_end: str = CYCLE_WEEK_END,
    extra_fields: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "name": name,
        "pattern": pattern,
        "nodeType": node_type,
        "field": field,
        "value": value,
        "cycleToday": cycle_today,
        "cycleWeekEnd": cycle_week_end,
        "extraFields": extra_fields or {},
    }


CASES: list[dict[str, object]] = [
    # ── overdue: due_date: {lt: $cycle_today} ──
    case("overdue: due_date one day BEFORE cycle_today — matches (lt)", "overdue", "task", "due_date", "2026-08-05"),
    case("overdue: due_date EQUAL to cycle_today — does not match (lt excludes equal)", "overdue", "task", "due_date", "2026-08-06"),
    case("overdue: due_date one day AFTER cycle_today — does not match", "overdue", "task", "due_date", "2026-08-07"),
    case("overdue: due_date ABSENT — does not match (null-tolerant lt)", "overdue", "task", "due_date", None),
    # ── due-this-week: due_date: {gte: $cycle_today, lte: $cycle_week_end} — a range ──
    case("due-this-week: due_date EQUAL to the gte boundary — matches (inclusive)", "due-this-week", "task", "due_date", "2026-08-06"),
    case("due-this-week: due_date EQUAL to the lte boundary — matches (inclusive)", "due-this-week", "task", "due_date", "2026-08-09"),
    case("due-this-week: due_date one day BEFORE the gte boundary — does not match", "due-this-week", "task", "due_date", "2026-08-05"),
    case("due-this-week: due_date one day AFTER the lte boundary — does not match", "due-this-week", "task", "due_date", "2026-08-10"),
    # ── all-personal-nodes: available_date: {not: {gt: $cycle_today}} — null-tolerant not+gt ──
    case("all-personal-nodes: available_date EQUAL to cycle_today — matches (not > today)", "all-personal-nodes", "task", "available_date", "2026-08-06", extra_fields={"domain": "personal"}),
    case("all-personal-nodes: available_date one day AFTER cycle_today — does not match (is > today)", "all-personal-nodes", "task", "available_date", "2026-08-07", extra_fields={"domain": "personal"}),
    case("all-personal-nodes: available_date ABSENT — matches (undated is never > today)", "all-personal-nodes", "task", "available_date", None, extra_fields={"domain": "personal"}),
    # ── available-tomorrow: available_date: {eq: "$cycle_today + 1 d"} — eq with a + offset ──
    case("available-tomorrow: available_date EQUALS cycle_today + 1d — matches", "available-tomorrow", "task", "available_date", "2026-08-07"),
    case("available-tomorrow: available_date EQUALS cycle_today — does not match", "available-tomorrow", "task", "available_date", "2026-08-06"),
    case("available-tomorrow: available_date EQUALS cycle_today + 2d — does not match", "available-tomorrow", "task", "available_date", "2026-08-08"),
    # ── due-yesterday: due_date: {eq: "$cycle_today - 1 d"} — eq with a - offset ──
    case("due-yesterday: due_date EQUALS cycle_today - 1d — matches", "due-yesterday", "task", "due_date", "2026-08-05"),
    case("due-yesterday: due_date EQUALS cycle_today — does not match", "due-yesterday", "task", "due_date", "2026-08-06"),
]

# ── THE DAY-BOUNDARY COMPOSITION — one instant either side of 04:00 Europe/London ──
#
# `resolve_logical_day` is the ENGINE's own function `today.ts`'s `resolveLogicalDate` mirrors
# field for field (`tests/present-today.test.mjs`'s own agreement suite). Deriving `cycle_today`
# from it here, for two instants either side of the real declared boundary, and feeding it into
# `overdue` proves the FULL chain — instant -> logical day -> cycle expression -> predicate — the
# same way the isolated boundary is already proven, one step further into what this leg adds.
DAY_BOUNDARY_INSTANTS = [
    ("2026-06-23T02:59:00Z", "03:59 BST — still yesterday (2026-06-22)"),
    ("2026-06-23T03:01:00Z", "04:01 BST — already today (2026-06-23)"),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config-dir", default=DEFAULT_CONFIG_DIR, type=Path)
    parser.add_argument("--out", default=DEFAULT_OUT, type=Path)
    args = parser.parse_args()

    loaded = bundle_load(args.config_dir)
    schema_dict = loaded.schema.raw_data
    registry = qntm_graph.load_schema(schema_dict)
    graph = qntm_graph.Graph(registry, raw_schema=schema_dict, patterns=loaded.patterns or {})

    rows = []
    for c in CASES:
        fields = {"title": c["name"], "status": "open", **c["extraFields"]}
        if c["value"] is not None:
            fields[c["field"]] = c["value"]
        node = graph.create_node(c["nodeType"], fields)
        result = matches_pattern(
            graph, node.id, c["pattern"], cycle_today=c["cycleToday"], cycle_week_end=c["cycleWeekEnd"]
        )
        rows.append(
            {
                "name": c["name"],
                "pattern": c["pattern"],
                "fields": {k: v for k, v in fields.items() if k != "title"},
                "cycleToday": c["cycleToday"],
                "cycleWeekEnd": c["cycleWeekEnd"],
                "matched": result.matched,
            }
        )

    day_boundary_rows = []
    for instant, description in DAY_BOUNDARY_INSTANTS:
        now = datetime.strptime(instant, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        cycle_today, _since = resolve_logical_day(
            now,
            timezone_name=REAL_BOUNDARY["timezone"],
            day_start_hour=REAL_BOUNDARY["day_start_hour"],
        )
        for due_date, expect_desc in (
            (cycle_today, "due_date == today — overdue's lt must NOT match"),
            (
                # "yesterday" by calendar subtraction — cheap and correct for this fixture's only
                # two instants, both non-DST-transition days either side of midnight, never reused
                # for arithmetic a real day-boundary case would need timezone awareness for.
                f"{int(cycle_today[:4])}-{cycle_today[5:7]}-{int(cycle_today[8:10]) - 1:02d}",
                "due_date == yesterday — overdue's lt MUST match",
            ),
        ):
            node = graph.create_node("task", {"title": description, "status": "open", "due_date": due_date})
            result = matches_pattern(graph, node.id, "overdue", cycle_today=cycle_today, cycle_week_end=CYCLE_WEEK_END)
            day_boundary_rows.append(
                {
                    "instant": instant,
                    "description": description,
                    "boundary": REAL_BOUNDARY,
                    "resolvedCycleToday": cycle_today,
                    "dueDate": due_date,
                    "expect": expect_desc,
                    "matched": result.matched,
                }
            )

    fixture = {
        "note": (
            "GENERATED by scripts/comparison-agreement.py from the engine's own "
            "qntm_graph.patterns.engine.matches_pattern, over an EMPTY in-memory graph built from "
            "the operator's real, read-only config — no state.db, no network, no cycle. Never "
            "hand-edit: regenerate. 'rows' is one entry per boundary case for a representative "
            "pattern from each of job 1's operator/cycle-variable classes; 'dayBoundaryRows' "
            "composes the day-boundary resolver with a comparison predicate at the real declared "
            "rollover instant."
        ),
        "cycleToday": CYCLE_TODAY,
        "cycleWeekEnd": CYCLE_WEEK_END,
        "rows": rows,
        "dayBoundaryRows": day_boundary_rows,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(fixture, indent=2, default=str) + "\n")
    print(f"wrote {args.out}\n  {len(rows)} boundary cases + {len(day_boundary_rows)} day-boundary composition cases")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

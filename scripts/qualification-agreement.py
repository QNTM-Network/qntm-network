"""qualification-agreement — produce the ENGINE's own membership answers, to measure the browser's against.

── RESTATED 2026-08-04: GRAPH-DEPENDENT PATTERNS ARE OUT OF THIS FIXTURE'S SCOPE, BY NAME ──

`compile-qualification.mjs`'s one-hop `children:`/`parents:` widening (`normaliseEdgeStep`) now
publishes a predicate whose answer for a node depends on that node's NEIGHBOURS, not only its own
(node_type, domain, status) triple — `edgeSteps` names those. This script's whole method (key the
fixture on the triple, and PROVE every node sharing one triple gets the same answer) is invalid for
such a predicate by construction: two nodes with the identical triple can have different edges, so
"one input, one answer" does not hold. Measured directly: without this exclusion, `orphan-outcomes`
(a real published pattern) fails the per-triple determinism check below with exactly that diagnosis.
`GRAPH_DEPENDENT` names every pattern this script therefore does not attempt to verify — it is not
silently skipped; it is a recorded, positive fact in the fixture (`graphDependentPatterns`), and
`tests/qualification-agreement.test.mjs` asserts the app's own `qualifierNeedsGraph` agrees with it
exactly. Applying one of these patterns for real needs a graph-aware matcher (`app/present/
qualification.ts`'s own header) that this repo does not build yet — the app abstains
(`needs-graph-traversal`) rather than answer, so there is no wrong answer for THIS script to catch
here; agreement for these patterns is a later leg's proof, not this one's to fake.

`tests/qualification-agreement.test.mjs` asserts that `app/present/membership.ts` agrees with the
engine. Agreement is worthless if the expected side was written by hand: a transcribed expectation
proves the transcriber and the implementer had the same misunderstanding, which is exactly the
silent failure this whole line of work exists to remove. So the expected side is GENERATED, here,
by calling `qntm_graph.patterns.engine.matches_pattern` — the same function the engine itself uses
to decide whether one node matches one pattern.

── WHAT IT READS, AND WHAT IT NEVER DOES ──

It reads the operator's real config bundle and a READ-ONLY, `mode=ro` connection to a COPY of his
`state.db`. It runs no cycle, registers no view, writes no file in the vault, and opens no network
connection. `bundle.load()` is pure config parsing; `Graph.from_dict` is pure deserialisation;
`matches_pattern` is a pure query. Nothing here can mutate the operator's state.

── WHY THE FIXTURE IS KEYED ON A FIELD TRIPLE, NOT ON A NODE ──

Every predicate the generator publishes ranges over exactly three fields — `node_type`, `domain`,
`status` — because that is all `membership.ts` can resolve for a line being typed. If that claim is
true, then the engine's answer for a node is a FUNCTION of that node's triple, and the 1501 nodes in
the real graph collapse to a few dozen distinct inputs. Keying the fixture on the triple therefore
turns a sample into the COMPLETE truth table over everything the browser can distinguish.

It also makes the claim falsifiable, and this script checks it rather than assuming it: for every
triple, every node sharing that triple must get the SAME answer from the engine. A disagreement
would mean a published predicate secretly depends on something else — the precise defect that would
make the browser confidently wrong — and this script aborts rather than emitting a fixture.

── USAGE ──

    apps/qntm-md/.venv/bin/python scripts/qualification-agreement.py --state-db COPY [--out PATH]

`--state-db` must be a COPY. This script opens it read-only, but the operator's rule is that agents
read a copy, and a default that points at the live file would be a trap waiting for a careless edit.
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

import monorepo_config
import structlog

# `bundle.load()` emits ~50KB of `compiling_rule` debug records. This script's output IS its stdout
# contract, so the logger is quietened before qntm_md is imported at all.
structlog.configure(wrapper_class=structlog.make_filtering_bound_logger(logging.CRITICAL))

import qntm_graph  # noqa: E402
from qntm_graph.patterns.engine import matches_pattern  # noqa: E402
from qntm_md.bundle import load as bundle_load  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
# LOCATED, not counted to. See scripts/monorepo_config.py: a fixed `parents[2]` was right from a
# worktree and one level too far from the trunk clone, where it resolved to $HOME/qntm — the vault.
DEFAULT_CONFIG_DIR = monorepo_config.config_dir(REPO_ROOT)
DEFAULT_OUT = REPO_ROOT / "tests" / "fixtures" / "qualification-agreement.json"

# The three fields every published predicate ranges over. GENERATED from `RESOLVABLE_FIELDS` in
# `scripts/generate-qualification-declaration.mjs`, by `scripts/generate-operator-set.mjs` — run
# `node scripts/generate-operator-set.mjs` after changing that list, and commit the result. Do not
# hand-edit the tuple below; the assertion in main() still fails loudly if a published predicate
# ever reaches outside these fields.
TRIPLE_FIELDS = ("node_type", "domain", "status")


def triple_of(node: object) -> tuple[object, object, object]:
    """A node's (node_type, domain, status). `node.type` is the type; the rest are plain fields."""
    fields = getattr(node, "fields", {}) or {}
    return (node.type, fields.get("domain"), fields.get("status"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-db", required=True, type=Path, help="a COPY of state.db")
    parser.add_argument("--config-dir", default=DEFAULT_CONFIG_DIR, type=Path)
    parser.add_argument("--out", default=DEFAULT_OUT, type=Path)
    args = parser.parse_args()

    declaration = json.loads((REPO_ROOT / "presentation.json").read_text())["qualification"]
    all_published = sorted(declaration["predicates"])
    # GRAPH-DEPENDENT, NOT ATTEMPTED HERE — see this file's own header, "RESTATED 2026-08-04".
    graph_dependent = sorted(
        name
        for name, predicate in declaration["predicates"].items()
        if predicate.get("edgeSteps")
    )
    published = sorted(name for name in all_published if name not in graph_dependent)

    # Every SELF-ONLY published predicate must range only over the three fields, or the fixture's
    # key is not a complete input and the whole comparison is invalid. `edgeSteps` clauses are
    # deliberately not scanned here — they range over a NEIGHBOUR's fields, which is exactly why
    # their patterns were excluded from `published` just above rather than checked by this loop.
    for name in published:
        predicate = declaration["predicates"][name]
        for clause in [predicate["find"], *predicate["exclude"]]:
            outside = set(clause["fields"]) - set(TRIPLE_FIELDS)
            if outside:
                print(
                    f"REFUSING: published predicate {name!r} ranges over {sorted(outside)}, "
                    f"outside {list(TRIPLE_FIELDS)} — the fixture key would not be a complete input",
                    file=sys.stderr,
                )
                return 2

    loaded = bundle_load(args.config_dir)
    schema_dict = loaded.schema.raw_data
    registry = qntm_graph.load_schema(schema_dict)

    connection = sqlite3.connect(f"file:{args.state_db}?mode=ro", uri=True)
    try:
        row = connection.execute("SELECT data FROM graph_state WHERE id = 1").fetchone()
    finally:
        connection.close()
    if row is None:
        print("REFUSING: no graph_state row in the state db copy", file=sys.stderr)
        return 2

    graph = qntm_graph.Graph.from_dict(
        json.loads(row[0]), registry=registry, raw_schema=schema_dict, patterns=None
    )
    # Production's own line (`coordination/orchestrator.py`): `from_dict` takes `patterns=None` and
    # the registered patterns are assigned afterwards. `matches_pattern` reads `graph._patterns`.
    graph._patterns = loaded.patterns or {}

    missing = [name for name in published if name not in graph._patterns]
    if missing:
        print(f"REFUSING: published patterns absent from the bundle: {missing}", file=sys.stderr)
        return 2

    by_triple: dict[tuple[object, object, object], list[str]] = defaultdict(list)
    for node in graph.find_nodes():
        by_triple[triple_of(node)].append(node.id)

    rows = []
    for triple, node_ids in sorted(by_triple.items(), key=lambda kv: json.dumps(kv[0], default=str)):
        answers: dict[str, bool] = {}
        for name in published:
            verdicts = {matches_pattern(graph, node_id, name).matched for node_id in node_ids}
            if len(verdicts) != 1:
                print(
                    f"REFUSING: pattern {name!r} answers differently for nodes sharing the triple "
                    f"{triple} — it depends on something outside {list(TRIPLE_FIELDS)}, so the "
                    "browser cannot decide it from a line's fields alone",
                    file=sys.stderr,
                )
                return 2
            answers[name] = verdicts.pop()
        rows.append(
            {
                "fields": dict(zip(TRIPLE_FIELDS, triple)),
                "nodes": len(node_ids),
                "matches": sorted(name for name, matched in answers.items() if matched),
            }
        )

    # ── PHASE 2: THE REACHABLE SPACE, NOT ONLY THE OCCUPIED ONE ────────────────────────────────
    #
    # The real graph is a sample of history, not of what the operator can TYPE. Only one of its 61
    # triples matches `domain-empty` and none matches `inbox-items`, so agreement measured over it
    # alone would leave the very cases this work is about almost untested. So the probe set is the
    # COMPLETE space a line being typed can reach: every node type a type token or a section default
    # can produce, crossed with every domain a domain token can produce (plus none), crossed with
    # every status a declared checkbox can produce.
    #
    # The probes are created in the IN-MEMORY graph only. It was deserialised from a read-only copy
    # and is never serialised back; `Graph.create_node` mutates a Python object and nothing else.
    # They are added AFTER phase 1 so no probe can perturb a real node's answer.
    node_types = {declaration["defaultNodeType"], *declaration["tokens"]["node_type"].values()}
    for view_sections in declaration["sections"].values():
        for section in view_sections.values():
            node_types.add(section["nodeType"])
    domains = {None, *declaration["tokens"]["domain"].values()}
    statuses = set(declaration["tokens"]["status"].values())

    probe_axes = {
        "node_type": sorted(t for t in node_types if t),
        "domain": sorted(domains, key=lambda d: (d is not None, d or "")),
        "status": sorted(statuses),
    }
    probe_matches: list[list[str]] = []
    unbuildable: dict[str, str] = {}
    for node_type in probe_axes["node_type"]:
        for domain in probe_axes["domain"]:
            for status in probe_axes["status"]:
                fields = {"title": f"probe {node_type} {domain} {status}", "status": status}
                if domain is not None:
                    fields["domain"] = domain
                try:
                    node = graph.create_node(node_type, fields)
                except Exception as exc:  # noqa: BLE001 — a type that cannot hold these fields
                    unbuildable[node_type] = f"{type(exc).__name__}: {exc}"
                    probe_matches.append([])
                    continue
                probe_matches.append(
                    sorted(name for name in published if matches_pattern(graph, node.id, name).matched)
                )
    if unbuildable:
        # The dense array below is only readable if EVERY cell was answered. A type that cannot
        # hold these fields would leave a hole indistinguishable from "matches nothing".
        print(f"REFUSING: node types that could not be probed: {unbuildable}", file=sys.stderr)
        return 2

    # 2184 probes carry only ~100 distinct answers between them, and a fixture that repeated each
    # answer in full would be five times the size for no extra proof. The answer sets are interned
    # and every row cites one by index — the same information, and a diff that shows a CHANGED
    # ANSWER rather than a wall of moved strings.
    match_sets: list[list[str]] = []
    set_index: dict[tuple[str, ...], int] = {}

    def intern(matches: list[str]) -> int:
        key = tuple(matches)
        if key not in set_index:
            set_index[key] = len(match_sets)
            match_sets.append(matches)
        return set_index[key]

    for entry in rows:
        entry["matches"] = intern(entry.pop("matches"))
    probe_cells = [intern(matches) for matches in probe_matches]

    fixture = {
        "note": (
            "GENERATED by scripts/qualification-agreement.py from the engine's own "
            "qntm_graph.patterns.engine.matches_pattern, over a read-only copy of the operator's "
            "real graph. Never hand-edit: regenerate. 'rows' is one entry per distinct "
            "(node_type, domain, status) triple that OCCURS in the real graph; 'probes' is one "
            "entry per triple a line being typed can REACH, answered by the same engine call "
            "against nodes created in the in-memory graph only. 'matches' is every published "
            "qualification the ENGINE says a node with that triple belongs to."
        ),
        "patterns": published,
        # NAMED, NOT SILENT — every published predicate this script did NOT attempt to verify,
        # because it is graph-dependent (see this file's own header). `all_published` minus this
        # equals `patterns` above; `tests/qualification-agreement.test.mjs` asserts both halves
        # against the live declaration, not just the one this script could check.
        "graphDependentPatterns": graph_dependent,
        "matchSets": match_sets,
        "nodes": sum(row["nodes"] for row in rows),
        "triples": len(rows),
        "rows": rows,
        # The probe space is a full cross product, so it is stored as its AXES plus one dense
        # row-major array of matchSets indices — `probeCells[((i * |domain|) + j) * |status| + k]`.
        # The expanded form was 2184 repetitive JSON objects and 330KB; this is the same data.
        "probeAxes": probe_axes,
        "probeCells": probe_cells,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(fixture, indent=2, default=str) + "\n")
    print(
        f"wrote {args.out}\n"
        f"  {fixture['nodes']} nodes collapse to {fixture['triples']} distinct field triples\n"
        f"  {len(probe_cells)} probe triples over the reachable space\n"
        f"  {len(published)} published qualifications answered by the engine\n"
        f"  {len(graph_dependent)} published qualifications are graph-dependent and were not "
        "attempted: " + ", ".join(graph_dependent)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

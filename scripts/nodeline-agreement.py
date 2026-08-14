"""nodeline-agreement — does the BROWSER'S composed line equal the ENGINE'S own, byte for byte?

    apps/qntm-md/.venv/bin/python scripts/nodeline-agreement.py [--out PATH]

── HOW THIS DIFFERS FROM `composition-agreement.py`, AND WHY BOTH EXIST ──

That script proves the CELL ORDER: given the cell values the renderer computed, does the declared
`composition` reassemble them into the same line? It hands the browser the cells.

This one proves the CELLS. It hands the browser a NODE — a type, some fields, some outgoing edges —
and asks whether `composeNodeLine` produces the line the engine produced from the same node. Every
cell the browser has to derive for itself is in scope: the checkbox glyph, the title wrap, the
stamp, the type and field tags and their order, the markers and theirs, the outgoing-edge chrome
and its cardinality, and the continuation lines.

Without it the composer is a join of eight published tables that nobody has ever compared against
the thing it is imitating — which is exactly the "90% right is worse than none" failure the whole
publication effort exists to avoid.

── ONE CONFIG, READ BY BOTH HALVES, AND THAT IS THE POINT ──

`tests/fixtures/config/` is the committed fixture tree. The ENGINE reads it here through
`qntm_md.bundle.load`; the BROWSER reads it through `scripts/generate-resolution-declaration.mjs`
in the companion test. Neither side is handed a transcription of the other's view of it.

That rules out the shortcut this script was nearly built on: `composition-agreement.py` assembles
its vocabulary as hand-written `VocabularyEntry` objects, so reusing its setup would have meant
transcribing that vocabulary a second time into the published `spelling` shape — a second home for
the same fact, which is the failure this repo has spent a week removing.

── THE ENGINE SIDE IS `_render_node_line` ITSELF ──

Not `render()`. The public entry needs a compiled sheet, a manifest and a section tree, none of
which bear on what a single line looks like; `_render_node_line` IS the function this composer
mirrors, and driving it directly keeps the comparison at the grain the claim is about. The
dispatchers it takes are the REAL ones (`_checkbox_dispatcher()`, `_title_style_dispatcher()`, the
three canonical-order dispatchers) — only `node_type_render` and `node_type_continuation_fields`
are answered from the fixture's own `schema.yaml`, because those relocated there in 2026-07-28's
`node-type-render-is-schema-config` and are no longer decision tables at all.

── WHAT IT REFUSES ──

Vacuity, in five ways: a fixture set that never renders a checkbox, never renders a plain_line,
never carries a stamp, never carries a marker, or never carries outgoing-edge chrome would agree
with a composer that could not produce those cells. Each is checked before anything is written.

It also refuses if `canonicalise_title_segment` is NOT the identity on a fixture title. The browser
does not implement that function — `composeNodeLine`'s `cleanTitle` stops at the `[[qntm:N]]` strip
— and the assumption behind that is "graph titles are already canonical". This script tests the
assumption rather than resting on it, and names the title that broke it if it ever does.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

import qntm_graph
import structlog
import yaml

structlog.configure(wrapper_class=structlog.make_filtering_bound_logger(logging.CRITICAL))

from qntm_md.bundle import load as bundle_load  # noqa: E402
from qntm_md.io.render_context_parse import canonicalise_title_segment  # noqa: E402
from qntm_md.render.renderer import (  # noqa: E402
    _render_node_line,
    _checkbox_dispatcher,
    _title_style_dispatcher,
    _order_tags_dispatcher,
    _order_markers_dispatcher,
)
from qntm_md.vocabulary import TokenResolver  # noqa: E402
from qntm_md.vocabulary.structural_token_resolver import StructuralTokenResolver  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import monorepo_config  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
# THE OPERATOR'S OWN CONFIG, not `tests/fixtures/config/`. That tree was authored to satisfy the JS
# generators and the ENGINE's bundle loader refuses it (`schema.yaml is missing required key
# 'version'`) — it was never a bundle. Transcribing it into one would be a second home for the same
# fact, so this reads the config both halves already read, the same posture
# `resolution-agreement.py` and `qualification-agreement.py` take. The consequence is theirs too:
# the fixture is COMMITTED, so the JS half runs anywhere, and only REGENERATION needs the monorepo.
DEFAULT_CONFIG = monorepo_config.config_dir(REPO_ROOT)
DEFAULT_OUT = REPO_ROOT / "tests" / "fixtures" / "nodeline-agreement.json"


class _SchemaDispatcher:
    """Answers the two tables that RELOCATED into `schema.yaml` (`node-type-render-is-schema-config`,
    2026-07-28) from the fixture's own schema — never a hardcoded map, so a fixture config that
    changes a render shape changes this answer with it. Every other table `_render_node_line`
    consults routes through the real engine contracts inside `renderer.py`."""

    def __init__(self, raw_schema: dict[str, Any]) -> None:
        self._types = raw_schema.get("node_types") or {}

    def dispatch(self, table_id: str, params: dict[str, object]) -> object:
        entry = self._types.get(params.get("node_type")) or {}
        render = entry.get("render") or {}
        if table_id == "node_type_render":
            return render.get("shape")
        if table_id == "node_type_continuation_fields":
            fields = render.get("continuation_fields") or []
            return ",".join(fields) if fields else None
        if table_id == "field_value_chrome_emission":
            # Inert in the operator's config (no rows declared anywhere) and out of scope for the
            # composer — see the qntm.network PR that moved it to the graph-dependent group.
            return None
        raise AssertionError(f"nodeline-agreement does not exercise table {table_id!r}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config-dir", default=DEFAULT_CONFIG, type=Path)
    parser.add_argument("--out", default=DEFAULT_OUT, type=Path)
    args = parser.parse_args()

    raw_schema = yaml.safe_load((args.config_dir / "schema.yaml").read_text())
    bundle = bundle_load(str(args.config_dir))
    token_resolver = TokenResolver(bundle.vocabulary)
    structural_resolver = StructuralTokenResolver(bundle.vocabulary)
    decision_tables = _SchemaDispatcher(raw_schema)

    def graph() -> qntm_graph.Graph:
        return qntm_graph.Graph(qntm_graph.load_schema(raw_schema), raw_schema=raw_schema)

    # ── THE PROBE SET ──
    #
    # Chosen to light every cell at least once and to put the ones with a boundary on both sides of
    # it. Kept as data so a reader can see the coverage rather than infer it from the assertions.
    probes: list[dict[str, Any]] = [
        {"id": "bare", "type": "task", "fields": {"title": "Bare title"}},
        {"id": "done", "type": "task", "fields": {"title": "Done thing", "status": "done"}},
        {"id": "in_progress", "type": "task", "fields": {"title": "Underway", "status": "in_progress"}},
        {"id": "cancelled", "type": "task", "fields": {"title": "Dropped", "status": "cancelled"}},
        {"id": "domain_tag", "type": "task", "fields": {"title": "Work item", "status": "open", "domain": "work"}},
        {"id": "stamped", "type": "task", "fields": {"title": "Has an id", "status": "open", "qntm_id": "41"}},
        {"id": "read_only", "type": "task", "fields": {"title": "Read only", "status": "open", "qntm_id": "42"}, "writePolicy": "read_only"},
        {"id": "marker_date", "type": "task", "fields": {"title": "Due soon", "status": "open", "due_date": "2026-09-01"}},
        {"id": "marker_enum", "type": "task", "fields": {"title": "Urgent", "status": "open", "priority": "high"}},
        {"id": "two_markers", "type": "task", "fields": {"title": "Both", "status": "open", "due_date": "2026-09-01", "priority": "low"}},
        {"id": "plain_line", "type": "person", "fields": {"title": "Alice"}},
        {"id": "nested", "type": "task", "fields": {"title": "A child", "status": "open"}, "depth": 2},
        {"id": "chrome", "type": "task", "fields": {"title": "Blocked one", "status": "open"}, "edges": [("REQUIRES", "The prerequisite")]},
        {"id": "chrome_two", "type": "task", "fields": {"title": "Blocked twice", "status": "open"},
         "edges": [("REQUIRES", "First dep"), ("REQUIRES", "Second dep")]},
        # CARDINALITY `one` — NEXT, the single `one` edge type in his config. Added after a mutation
        # test survived: replacing the cardinality check with `true` changed nothing, because every
        # probe used REQUIRES (`many`) and the two branches are identical for it. Without these two
        # the published `cardinality` is carried, read, and never exercised.
        {"id": "chrome_one", "type": "task", "fields": {"title": "Has a next", "status": "open"},
         "edges": [("NEXT", "The next one")]},
        # NOTE: a SECOND `NEXT` edge is not probed because it cannot exist — `qntm_graph` enforces
        # cardinality at edge-creation time and raises "Cardinality violation: source already has an
        # outgoing edge of type 'NEXT' (cardinality: one_to_one)". So the composer's replace-vs-
        # append branch guards a CALLER-SUPPLIED list, not a graph state; that is now said plainly
        # in `nodeline.ts` rather than implied to mirror an engine behaviour.
        # MIXED — a node carrying both cardinalities, so the ORDER between two different edge tags
        # is exercised alongside the replace-vs-append rule.
        {"id": "chrome_mixed", "type": "task", "fields": {"title": "Both kinds", "status": "open"},
         "edges": [("REQUIRES", "A dep"), ("NEXT", "A successor")]},
        # ── THREE PROBES ADDED BECAUSE A MUTATION SURVIVED WITHOUT THEM ──
        #
        # Each of these three orderings/suppressions was CARRIED, READ, and never exercised: deleting
        # the relevant call from the composer changed no expected line, because every earlier probe
        # happened to produce its cells in canonical order already. Found by mutation, not review.
        #
        # 1. TAG ORDER. An UNRANKED type tag with a RANKED field tag: insertion order is
        #    [type, field] and canonical order is [field, type], because `append_stable` puts every
        #    ranked tag before every unranked one. No earlier probe could tell the two apart.
        {"id": "tag_order", "type": "album", "fields": {"title": "A record", "domain": "work"}},
        # 2. CHROME ORDER. The edges handed over in REVERSE canonical order, so an implementation
        #    that emitted them in arrival order would differ.
        {"id": "chrome_order", "type": "task", "fields": {"title": "Out of order", "status": "open"},
         "edges": [("NEXT", "Comes second"), ("REQUIRES", "Comes first")]},
        # 3. THE STAMPLESS TYPE. `explainer` declares `identity: {unique: true}`, so the engine
        #    renders it WITHOUT `[[qntm:N]]`. Every earlier probe was a stamped type, so dropping
        #    the suppression entirely changed nothing.
        {"id": "stampless", "type": "explainer", "fields": {"title": "A unique name"}},
        # 4. A CONTINUATION LINE, added for the same reason as the three above: dropping the bare
        #    re-ingest tag from the continuation line changed no expected output, because no probe
        #    carried a populated `continuation_fields` value. `capability` declares
        #    `continuation_fields: [summary]` and `#summary` binds that field.
        {"id": "continuation", "type": "capability", "fields": {"title": "A capability", "summary": "What it does"}},
    ]

    fixtures: list[dict[str, Any]] = []
    for probe in probes:
        g = graph()
        node = g.create_node(probe["type"], dict(probe["fields"]))
        outgoing: list[dict[str, str]] = []
        for edge_type, target_title in probe.get("edges", []):
            target = g.create_node("task", {"title": target_title})
            g.create_edge(edge_type, node.id, target.id)
            outgoing.append({"type": edge_type, "targetTitle": target_title})

        rendered = _render_node_line(
            node,
            depth=probe.get("depth", 0),
            sheet_id="s",
            section_id="sec",
            write_policy=probe.get("writePolicy", "writable"),
            decision_tables=decision_tables,
            checkbox_dispatcher=_checkbox_dispatcher(),
            title_style_dispatcher=_title_style_dispatcher(),
            order_tags_dispatcher=_order_tags_dispatcher(),
            order_markers_dispatcher=_order_markers_dispatcher(),
            graph=g,
            token_resolver=token_resolver,
            seen_defaulted_types=set(),
            structural_token_resolver=structural_resolver,
        )

        # THE CANONICALISATION ASSUMPTION, TESTED RATHER THAN RESTED ON. `_apply_title_style` runs
        # `canonicalise_title_segment` on every title; the browser's `cleanTitle` does not implement
        # it. That is safe only while the function is the identity on real graph titles.
        title = str(probe["fields"].get("title", ""))
        if canonicalise_title_segment(title) != title:
            print(
                f"REFUSING: canonicalise_title_segment is not the identity on {title!r} — it "
                f"returns {canonicalise_title_segment(title)!r}. The browser's `cleanTitle` stops "
                "at the [[qntm:N]] strip, so this fixture would agree only by accident. Implement "
                "the missing step in `nodeline.ts` before publishing this pair.",
                file=sys.stderr,
            )
            return 2

        fixtures.append(
            {
                "id": probe["id"],
                "node": {"id": node.id, "type": probe["type"], "fields": dict(probe["fields"])},
                "outgoingEdges": outgoing,
                "writePolicy": probe.get("writePolicy", "writable"),
                "depth": probe.get("depth", 0),
                "expectedLine": rendered.text,
                "expectedContinuationLines": [text for _field, text in rendered.continuation_lines],
            }
        )

    # ── POSITIVE CONTROLS — a probe set that never lit a cell proves nothing about it ──
    def any_line(predicate) -> bool:
        return any(predicate(f["expectedLine"]) for f in fixtures)

    if not any_line(lambda line: "[x]" in line):
        print("REFUSING: no fixture renders a ticked checkbox", file=sys.stderr)
        return 2
    if not any_line(lambda line: "[ ]" in line):
        print("REFUSING: no fixture renders an open checkbox", file=sys.stderr)
        return 2
    if not any_line(lambda line: "[[qntm:" in line):
        print("REFUSING: no fixture carries a stamp — the identity path is unexercised", file=sys.stderr)
        return 2
    # AND ONE THAT DOES NOT. Without a unique-identity probe, deleting the suppression entirely
    # changes no expected line — measured, not predicted.
    if not any(
        f["expectedLine"] and "[[qntm:" not in f["expectedLine"] and f["writePolicy"] == "writable"
        for f in fixtures
    ):
        print("REFUSING: every writable fixture is stamped — identity suppression is unexercised", file=sys.stderr)
        return 2
    if not any_line(lambda line: "\U0001F4C5" in line or "⏫" in line or "\U0001F53D" in line):
        print("REFUSING: no fixture carries a marker", file=sys.stderr)
        return 2
    if not any(f["outgoingEdges"] for f in fixtures):
        print("REFUSING: no fixture carries outgoing-edge chrome", file=sys.stderr)
        return 2
    # BOTH CARDINALITIES, AND MORE THAN ONE EDGE OF EACH. A probe set using only `many` edges makes
    # the replace-vs-append rule unobservable — proven by a mutation that survived before these
    # fixtures existed, not predicted.
    edge_types = {e["type"] for f in fixtures for e in f["outgoingEdges"]}
    if len(edge_types) < 2:
        print(f"REFUSING: every chrome fixture uses one edge type {edge_types} — cardinality is unexercised", file=sys.stderr)
        return 2
    if not any(len(f["outgoingEdges"]) > 1 for f in fixtures):
        print("REFUSING: no fixture carries more than one outgoing edge", file=sys.stderr)
        return 2
    if not any(f["depth"] > 0 for f in fixtures):
        print("REFUSING: no fixture is nested — the indent is unexercised", file=sys.stderr)
        return 2
    if not any(f["expectedContinuationLines"] for f in fixtures):
        print("REFUSING: no fixture emits a continuation line — its re-ingest tag is unexercised", file=sys.stderr)
        return 2
    if not any_line(lambda line: "**" in line or "*" in line):
        print("REFUSING: no fixture renders a title wrap — render_title_style is unexercised", file=sys.stderr)
        return 2
    # BOTH SHAPES. A probe set of only checkbox nodes would agree with a composer that never read
    # `composition.heads.plain_line`.
    if not any(f["node"]["type"] == "person" for f in fixtures):
        print("REFUSING: no fixture exercises the plain_line HEAD", file=sys.stderr)
        return 2

    out = {
        "note": (
            "GENERATED by scripts/nodeline-agreement.py against tests/fixtures/config/, driving the "
            "REAL qntm_md.render.renderer._render_node_line with the real engine contract "
            "dispatchers. `expectedLine` is the engine's own output for `node`. The companion test "
            "compiles the SAME config through generate-resolution-declaration.mjs and asserts "
            "composeNodeLine reproduces every line byte for byte. Never hand-edit: regenerate."
        ),
        "configDir": "the operator's monorepo config (see this script's header)",
        "fixtures": fixtures,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {args.out}\n  {len(fixtures)} node lines rendered by the real engine")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

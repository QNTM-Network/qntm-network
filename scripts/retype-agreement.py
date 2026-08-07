"""retype-agreement — EXHAUSTIVE cross-engine proof that a `retype` effect's own node-type token
lands in the BYTE-IDENTICAL position the real engine renderer puts it, for EVERY member of the
declared node_type token family — not a hand-picked sample.

    apps/qntm-md/.venv/bin/python scripts/retype-agreement.py [--out PATH]

── WHY THIS EXISTS, AND WHY IT IS GENERATED FROM THE DECLARATION RATHER THAN HAND-WRITTEN ──

Two defects shipped in one day (2026-08-07) from fixtures that tested ONE retype
(`#task` -> `#outcome`, title at the end of the line, nothing trailing it) and called the family
covered. `presentation.json`'s own `qualification.tokens.node_type` names THIRTY-TWO node types —
every one of them is a legal `retype` target, and the operator's own words after the second defect
were "there is a limited deterministic set — no guessing." This script iterates that exact set,
read live off `presentation.json` (the compiled artifact the browser itself reads, not a
hand-transcribed copy of `config/vocabulary/type_tags.yaml`), so a future node type added to the
vocabulary makes THIS fixture stale (regenerate) rather than leaving the family under-tested by
construction, the same way `composition-agreement.py`'s own fixtures are pinned against a live
render rather than an invented one.

── TWO SCENARIOS PER TYPE, BOTH REAL ──

  APPEND — a line with NO existing type tag (the operator's bare/default-typed line), retyped to
  the token under test. Exercises `renderRuleEffects`'s fallback path — the one 2026-08-07's #149
  left composition-blind (`text += ' ' + token`, landing the new tag AFTER a trailing marker the
  engine's own declared tail order (`stamp, date, tags, markers, chrome`) puts it BEFORE).

  SWAP — a line ALREADY carrying `#task`, retyped to the token under test. Exercises the in-place
  splice path #149 added, proven correct for the single-tag-at-end case by
  `tests/present-rules-render.test.mjs` already; this fixture re-proves it under the SAME trailing
  content (domain tag + marker) the APPEND scenario stresses, so one committed file proves both
  paths against the identical cell shape.

Every fixture line ALSO carries a `qntm_id` stamp and a `domain` field tag, so composition's full
declared tail (`stamp, tags[type tag FIRST within tags, per `source_tags_for_node`'s own
type-then-field order], markers`) is exercised for every entry — not a bare title, which would
pass by construction (nothing trailing to misplace the tag ahead of).

── ONE HERMETIC SCHEMA, EVERY DECLARED TYPE, UNIFORMLY `checkbox`-SHAPED ──

The real bundle assigns different render shapes per type (`resolution.chromeShapes` in
`presentation.json`: `note`/`person`/`group` are `plain_line`). This script tests `_field_expression
_cells`'s declared TAIL order (stamp, date, tags, markers, chrome) — shape-agnostic by construction
(`_field_expression_cells` is called identically from every `_emit_*_shape`) — so every type is
rendered `checkbox`-shaped here for one uniform hermetic schema. This is a deliberate narrowing to
the fact actually under test (tail order / type-tag position), not a claim about any type's real
shape in the operator's own vault.

── WHAT THIS DOES NOT COVER, NAMED RATHER THAN SILENT ──

CHROME (outgoing-edge tokens, e.g. `#requires`) is not exercised — the browser's own declaration
(`presentation.json`) publishes no edge-tag vocabulary at all (`qualification.tokens` carries no
`edge_type` family), so there is no declared spelling this script — or the browser's own fix — could
read to place a NEW type tag relative to one. `renderRuleEffects`'s fix inserts before the first
`#`-tag-shaped span REGARDLESS of family (chrome tokens are `#`-shaped too), which happens to be
composition-correct whenever the existing line is already canonically ordered, but this script does
not assert it, because nothing published lets it compute the expected answer independently. See the
browser-side fix's own header for the same admission.
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

structlog.configure(wrapper_class=structlog.make_filtering_bound_logger(logging.CRITICAL))

from qntm_md.render.compiler import RegisteredNode, CompiledSheet  # noqa: E402
from qntm_md.render.renderer import render  # noqa: E402
from qntm_md.render.section_builder import SectionTree, SectionTreeNode  # noqa: E402
from qntm_md.types import VocabularyEntry  # noqa: E402
from qntm_md.vocabulary import TokenResolver  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO_ROOT / "tests" / "fixtures" / "retype-agreement.json"
PRESENTATION_JSON = REPO_ROOT / "presentation.json"


def _entry(token_form: str, mapped_target: tuple[str, str], **kw: Any) -> VocabularyEntry:
    return VocabularyEntry(token_form=token_form, mapped_target=mapped_target, **kw)


def _load_family() -> dict[str, str]:
    """`token -> type` for EVERY declared node type — read live from the compiled artifact the
    browser itself reads, not a hand-copied literal. REFUSES (raises) rather than silently
    proceeding with an empty/small family — a fixture built from nothing would prove nothing."""
    data = json.loads(PRESENTATION_JSON.read_text())
    family = data["qualification"]["tokens"]["node_type"]
    if not isinstance(family, dict) or len(family) < 10:
        raise SystemExit(
            f"REFUSING: presentation.json's node_type family has {len(family) if isinstance(family, dict) else 'no'} "
            "entries — expected the real, large, closed set. Regenerate presentation.json first."
        )
    return dict(family)


class _FakeDispatcher:
    def __init__(self, node_types: list[str]) -> None:
        self._node_types = node_types

    def dispatch(self, table_id: str, params: dict[str, object]) -> object:
        if table_id == "node_type_render":
            return "checkbox" if params.get("node_type") in self._node_types else None
        if table_id == "node_type_continuation_fields":
            return None
        if table_id == "field_value_chrome_emission":
            return None
        raise AssertionError(f"retype-agreement fixtures do not exercise table {table_id!r}")


def _schema(node_types: list[str]) -> dict[str, Any]:
    return {
        "version": 1,
        "field_types": {
            "title": {"type": "string"},
            "qntm_id": {"type": "string", "nullable": True, "required": False},
            "status": {"type": "string", "nullable": True, "required": False},
            "due_date": {"type": "string", "nullable": True, "required": False},
            "domain": {"type": "string", "nullable": True, "required": False},
        },
        "node_types": {
            t: {
                "fields": ["title", "qntm_id", "status", "due_date", "domain"],
                "render": {"shape": "checkbox"},
            }
            for t in node_types
        },
        "edge_types": {},
    }


def _resolver(family: dict[str, str]) -> TokenResolver:
    entries = [_entry(token, ("node_type", node_type)) for token, node_type in family.items()]
    entries.append(_entry("#work", ("field", "domain"), value="work"))
    entries.append(_entry("\U0001F4C5", ("field", "due_date"), extraction_hint="trailing_date"))
    return TokenResolver(entries)


def _sheet() -> CompiledSheet:
    section = RegisteredNode(id="sec", qualification="pattern", ordering=(), source_line=1)
    return CompiledSheet(
        id="s", domain="d", path="views/s.md", input_grammar="tolerant",
        render_policy="re-render", default_tags=(), default_node_type="task",
        manifest=(section,), rendering_contract="starter", source_file="views.yaml",
        source_line=1, write_policy="writable",
    )


def _rendered_line(node_type: str, family: dict[str, str], node_types: list[str], resolver: TokenResolver) -> str:
    """The engine's own byte-exact line for one node of `node_type`, carrying a stamp, a domain
    tag and a due_date marker — the real public `render()` entry point, unmocked beyond the two
    ghost tables every hermetic fixture in this repo already accepts (see composition-agreement.py,
    the precedent this mirrors)."""
    registry = qntm_graph.load_schema(_schema(node_types))
    graph = qntm_graph.Graph(registry, raw_schema=_schema(node_types))
    node = graph.create_node(
        node_type,
        {"title": "Renew passport", "domain": "work", "due_date": "2026-09-01", "qntm_id": f"n-{node_type}"},
    )
    tree = SectionTree(section_id="sec", roots=(SectionTreeNode(node=node, is_qualifying=True, children=()),))
    result = render(_sheet(), {"sec": tree}, _FakeDispatcher(node_types), graph=graph, token_resolver=resolver)
    lines = result.markdown.splitlines()
    return lines[-1]


def build_fixtures() -> dict[str, Any]:
    family = _load_family()
    node_types = sorted(set(family.values()))
    resolver = _resolver(family)

    entries: list[dict[str, Any]] = []
    for token, node_type in sorted(family.items()):
        expected = _rendered_line(node_type, family, node_types, resolver)
        entries.append({"token": token, "nodeType": node_type, "expectedLine": expected})

    if len(entries) < 10:
        print("REFUSING: fewer than 10 entries — the family did not load fully", file=sys.stderr)
        raise SystemExit(2)
    if not any(" 📅 " in e["expectedLine"] for e in entries):
        print("REFUSING: no fixture entry carries the due_date marker — nothing stresses tail order", file=sys.stderr)
        raise SystemExit(2)
    if not any("#work" in e["expectedLine"] for e in entries):
        print("REFUSING: no fixture entry carries the domain tag — nothing stresses type-tag-first-in-tags order", file=sys.stderr)
        raise SystemExit(2)

    return {
        "note": (
            "GENERATED by scripts/retype-agreement.py, run against a LIVE import of "
            "qntm_md.render.renderer (apps/qntm-md/.venv/bin/python scripts/retype-agreement.py). "
            "One entry per token in presentation.json's qualification.tokens.node_type — EVERY "
            "declared node type, not a sample. Each `expectedLine` is the real engine's own render "
            "of a node of that type carrying title + domain tag + due_date marker + a qntm_id "
            "stamp. tests/retype-agreement.test.mjs recomputes the SAME line two ways — an APPEND "
            "(no prior type tag) and a SWAP (#task present) retype through renderRuleEffects — and "
            "asserts byte-identity against `expectedLine` for every entry. Never hand-edit: "
            "regenerate."
        ),
        "entries": entries,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=DEFAULT_OUT, type=Path)
    args = parser.parse_args()
    out = build_fixtures()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {args.out}\n  {len(out['entries'])} node types, all rendered live by the real engine")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""composition-agreement — pin the browser's declared line-COMPOSITION order against a LIVE import
of the real engine renderer, the same discipline `resolution-agreement.py` established for
`defaultOrdering`/`priorityRank` (2026-08-04) and `qualification-agreement.py` established for
membership.

    apps/qntm-md/.venv/bin/python scripts/composition-agreement.py [--out PATH]

── WHAT "COMPOSITION" MEANS, AND WHY IT IS A SEPARATE FACT FROM `resolution.lineGrammars` ──

`config/line_grammars.yaml` (read via `resolution.lineGrammars`) declares RECOGNITION: what a
whole LINE may look like, at parse-boundary granularity (blank / fenced-code-delimiter / heading-
prefix). Its own header says the emit direction is NOT yet shape-driven: "render/renderer.py
composes a body line's `- ` bullet and a section heading's `## ` wrapper directly" — a row added
there would load clean and change nothing, because nothing on the engine side reads it.

COMPOSITION is a different question at a different granularity: given a body line already
recognised as checkbox / plain_line / stat_line, WHERE does each CELL go — the checkbox glyph, the
title, the `[[qntm:N]]` stamp, the type+field tags, the markers, the outgoing-edge chrome. This is
read LIVE off `apps/qntm-md/src/qntm_md/render/renderer.py`:

  * `_field_expression_cells` (renderer.py:1138-1194) — the ONE tail every shape emits, verbatim:
        cells = []
        if qntm_id_cell: cells.append(qntm_id_cell)      # STAMP
        if date_cell: cells.append(date_cell)             # DATE — see note below
        cells.extend(tag_cells)                            # TAGS
        cells.extend(marker_cells)                         # MARKERS
        cells.extend(chrome_cells)                          # CHROME
    i.e. the declared TAIL order is [stamp, date, tags, markers, chrome].

  * `_emit_checkbox_shape` (renderer.py:1197-1225): HEAD = [checkbox, title], then the tail above.
  * `_emit_plain_line_shape` (renderer.py:1267-1290): HEAD = [title], then the tail above.
  * `_emit_stat_line_shape` (renderer.py:1228-1264): HEAD = [title_value] (one FUSED cell, composed
    by `qntm_md.grammar.node_type_form.compose_stat_line_head` — never spelled here), then the tail.

  * The whole line: `renderer.py:1003` —
        line_text = f"{'    ' * depth}- {' '.join(cell for cell in cells if cell)}"
    i.e. 4 spaces per depth level, one literal `- ` bullet, then every non-empty cell joined by a
    single space. Falsy cells (an empty stamp on a read-only sheet, an always-empty date_cell) are
    filtered out, not emitted as a blank cell — `join` never sees two adjacent separators from them.

`date_cell` IS ALWAYS `""` TODAY (renderer.py:920, and the block above it: the old `date_cell` +
`date_selection` glyph lookup was DISSOLVED 2026-05-30 #35 — a `due_date` field now round-trips
through the ordinary MARKER path, `📅 2026-09-01`, exactly like `priority`). It is kept in the
declared TAIL order here anyway, for faithfulness to the real function shape rather than tidiness —
dropping a dead-but-real class during a "no behaviour change" migration is exactly the kind of
silent narrowing this discipline exists to catch.

── THE ACCEPTANCE TEST THIS SCRIPT PROVES, BEFORE WRITING ANYTHING ──

For every fixture node below, this script:
  1. Renders the REAL line via `qntm_md.render.renderer.render` (never re-derived, never mocked —
     the SAME public entry point production code calls), using a real `qntm_graph.Graph` and a real
     `TokenResolver`, exactly as `tests/render/test_outgoing_edge_chrome.py` and
     `tests/render/test_renderer.py` already do in the engine's own suite.
  2. Independently reads the INDIVIDUAL CELL VALUES the renderer composed that line from — the
     checkbox glyph, the title, the stamp, the tag cells, the marker cells, the chrome cells — via
     the SAME internal calls `_render_node_line` makes (`_qntm_id_cell`, `FieldReconstructor.
     reconstruct`, the real `order_tags`/`order_markers`/`order_edge_tags` engine dispatchers).
  3. Recomposes those cell values using ONLY the declared order above (`_COMPOSITION` — a plain
     Python mirror of the JS `ENGINE_LITERAL_COMPOSITION` this generates alongside) and REFUSES
     (raises, writes nothing) if the recomposition disagrees with the real render's own markdown,
     byte for byte.

The committed fixture (`tests/fixtures/composition-agreement.json`) therefore carries only cases
this script has already proven the declared order reproduces exactly. `tests/composition-agreement.
test.mjs` is the SECOND, independent half — it reads this committed fixture and the committed
`presentation.json`, recomposes with the SAME declared order using a from-scratch JS implementation
(`app/present/express/composition.ts`), and asserts it still agrees, so a change to either file
alone is caught without re-running Python.

── WHY A SELF-CONTAINED FIXTURE SCHEMA, NOT THE OPERATOR'S REAL CONFIG ──

Unlike `resolution-agreement.py` / `qualification-agreement.py`, composition names NO field, NO
node type and NO vocabulary token from the operator's config — `_field_expression_cells` is the
same five-class tail for every node type, every view, every operator. So this script needs no
`--config-dir`: it builds one minimal schema + vocabulary in-process, the same hermetic pattern
`tests/render/test_outgoing_edge_chrome.py` already uses for the engine's own suite, covering the
real cell combinations named in the design document — bare title, title+tag, +stamp, +marker
(date and priority), +chrome, nested — rather than sampling whatever the operator happens to have
authored.
"""

from __future__ import annotations

import argparse
import inspect
import json
import logging
import sys
from pathlib import Path
from typing import Any

import qntm_graph
import structlog

structlog.configure(wrapper_class=structlog.make_filtering_bound_logger(logging.CRITICAL))

from qntm_md.render.compiler import RegisteredNode, CompiledSheet  # noqa: E402
from qntm_md.render.renderer import (  # noqa: E402
    render,
    _qntm_id_cell,
    _checkbox_dispatcher,
    _title_style_dispatcher,
    _order_tags_dispatcher,
    _order_markers_dispatcher,
    _order_edge_tags_dispatcher,
    _title_style_dispatcher,
    _assemble_marker_cells,
    _outgoing_edge_chrome_cells,
    _apply_title_style,
    _clean_title,
)
from qntm_md.render.field_reconstructor import FieldReconstructor  # noqa: E402
from qntm_md.render.section_builder import SectionTree, SectionTreeNode  # noqa: E402
from qntm_md.node_context import build_node_local_context  # noqa: E402
from qntm_md.types import VocabularyEntry  # noqa: E402
from qntm_md.vocabulary import TokenResolver  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO_ROOT / "tests" / "fixtures" / "composition-agreement.json"

# ── THE DECLARED ORDER ──
#
# A Python mirror of `ENGINE_LITERAL_COMPOSITION` in `scripts/compile-resolution.mjs`. See this
# file's own module docstring for the renderer.py citations this reproduces. Kept as data (never
# control flow) so both this script's REFUSING check and the browser composer are "iterate a list,
# join a map lookup" — nothing here is entitled to know what a "stamp" or a "tag" MEANS, only where
# the class it is told about goes.
#
# LIVE IMPORT WHEN THE ENGINE HAS IT, LITERAL FALLBACK OTHERWISE — the SAME two-state posture
# `compile-resolution.mjs`'s own `readGlobalDefaultOrdering` takes for `defaultOrdering`
# ("config" vs "engine-fallback"), applied here to "engine already reads this as data" vs "engine
# still spells it in control flow". `_COMPOSITION_HEADS`/`_COMPOSITION_TAIL` are new names,
# introduced by the companion engine change (`renderer.py`'s own "COMPOSITION" header) that ships
# in its own PR — this script must keep working against a monorepo checkout that does not have it
# yet, so the import is attempted and the hand-mirrored literal answers when it is not there. Once
# that PR merges, every run of this script upgrades itself to genuine live-import verification with
# no further edit here — printed so the difference is never silent.
try:
    from qntm_md.render.renderer import (  # type: ignore[attr-defined]
        _COMPOSITION_HEADS as _ENGINE_COMPOSITION_HEADS,
        _COMPOSITION_TAIL as _ENGINE_COMPOSITION_TAIL,
    )

    _COMPOSITION: dict[str, Any] = {
        "heads": {shape: list(order) for shape, order in _ENGINE_COMPOSITION_HEADS.items()},
        "tail": list(_ENGINE_COMPOSITION_TAIL),
        "separator": " ",
    }
    _COMPOSITION_SOURCE = "engine-live-import"
except ImportError:
    _COMPOSITION = {
        "heads": {
            "checkbox": ["checkbox", "title"],
            "plain_line": ["title"],
        },
        # date is always "" today (see module docstring) — kept for faithfulness to renderer.py's
        # own _field_expression_cells shape, not because it ever contributes a character.
        "tail": ["stamp", "date", "tags", "markers", "chrome"],
        "separator": " ",
    }
    _COMPOSITION_SOURCE = "literal-fallback"

# FORM — composition's own optional bullet + title-style wrap (renderer.py's "COMPOSITION FORM"
# header). Same live-import-when-the-engine-has-it, literal-fallback-otherwise posture as heads/
# tail above, kept as its OWN try/except so a checkout that has the base composition-reads-config
# PR but not yet this one still runs (degrading only the two NEW fields to their literal answer).
try:
    from qntm_md.render.renderer import (  # type: ignore[attr-defined]
        _COMPOSITION_BULLET as _ENGINE_COMPOSITION_BULLET,
        _COMPOSITION_TITLE_STYLES as _ENGINE_COMPOSITION_TITLE_STYLES,
    )

    _COMPOSITION["bullet"] = _ENGINE_COMPOSITION_BULLET
    _COMPOSITION["titleStyles"] = list(_ENGINE_COMPOSITION_TITLE_STYLES)
    _COMPOSITION_FORM_SOURCE = "engine-live-import"
except ImportError:
    _COMPOSITION["bullet"] = "-"
    _COMPOSITION["titleStyles"] = []
    _COMPOSITION_FORM_SOURCE = "literal-fallback"


def _apply_title_styles(text: str, title_styles: list[str]) -> str:
    """The declared, UNCONDITIONAL title wrap — byte-identical emission order to
    `renderer.py`'s `_apply_title_style` (fixed: italic innermost, then bold, then strikethrough
    outermost, decided by MEMBERSHIP not list position) and to
    `app/present/express/composition.ts`'s `applyTitleStyles`, transcribed here so this script can
    prove the declared styles against the real renderer BEFORE that TypeScript file is trusted to.
    """
    styled = text
    if "italic" in title_styles:
        styled = f"*{styled}*"
    if "bold" in title_styles:
        styled = f"**{styled}**"
    if "strikethrough" in title_styles:
        styled = f"~~{styled}~~"
    return styled


def _compose(cell_classes: list[str], cells: dict[str, Any]) -> list[str]:
    """Recompose a HEAD or TAIL from `_COMPOSITION`'s declared class order — the exact operation
    `app/present/express/composition.ts` performs, transcribed here so this script can prove the
    declared order against the real renderer BEFORE that TypeScript file is trusted to."""
    out: list[str] = []
    for cell_class in cell_classes:
        value = cells.get(cell_class)
        if value is None or value == "":
            continue
        if isinstance(value, list):
            out.extend(v for v in value if v)
        else:
            out.append(value)
    return out


# ── A minimal, self-contained schema — see module docstring for why real config is not needed ──

_SCHEMA: dict[str, Any] = {
    "version": 1,
    "field_types": {
        "title": {"type": "string"},
        "qntm_id": {"type": "string", "nullable": True, "required": False},
        "status": {"type": "string", "nullable": True, "required": False},
        "priority": {"type": "string", "nullable": True, "required": False},
        "due_date": {"type": "string", "nullable": True, "required": False},
        "domain": {"type": "string", "nullable": True, "required": False},
    },
    "node_types": {
        "task": {
            "fields": ["title", "qntm_id", "status", "priority", "due_date", "domain"],
            "render": {"shape": "checkbox"},
        },
        "note": {"fields": ["title", "qntm_id"], "render": {"shape": "plain_line"}},
    },
    "edge_types": {
        "PART_OF": {"direction": "child_to_parent", "cardinality": "many_to_one", "structural": True},
        "REQUIRES": {"direction": "directed", "cardinality": "many_to_many"},
    },
}


def _entry(token_form: str, mapped_target: tuple[str, str], **kw: Any) -> VocabularyEntry:
    return VocabularyEntry(token_form=token_form, mapped_target=mapped_target, **kw)


def _resolver() -> TokenResolver:
    # Real vocabulary SHAPES, mirroring `config/vocabulary/{type_tags,domain_tags,markers,
    # edge_tags}.yaml` row-for-row (token spellings, not behaviour) — #task, #work, 📅 (trailing
    # date), 🔽/⏫ (priority enum), #requires (chrome edge). Cited so a reader can check the
    # spellings are real and not invented for this fixture.
    return TokenResolver(
        [
            _entry("#task", ("node_type", "task")),
            _entry("#note", ("node_type", "note")),
            _entry("#work", ("field", "domain"), value="work"),
            _entry("\U0001F4C5", ("field", "due_date"), extraction_hint="trailing_date"),
            _entry("\U0001F53D", ("field", "priority"), value="low"),
            _entry("⏫", ("field", "priority"), value="high"),
            _entry("#requires", ("edge_type", "REQUIRES"), rendered_as_chrome=True),
        ]
    )


class _FakeDispatcher:
    """Answers ONLY the two tables `render()` still takes from its caller
    (`node_type_render`, `node_type_continuation_fields`) — everything composition actually cares
    about (checkbox, title-style, tag order, marker order, edge-tag order) routes through the
    REAL engine contracts inside renderer.py itself (`_checkbox_dispatcher()` etc.), unmocked."""

    def dispatch(self, table_id: str, params: dict[str, object]) -> object:
        if table_id == "node_type_render":
            return {"task": "checkbox", "note": "plain_line"}.get(params.get("node_type"))
        if table_id == "node_type_continuation_fields":
            return None
        if table_id == "field_value_chrome_emission":
            return None
        raise AssertionError(f"composition-agreement fixtures do not exercise table {table_id!r}")


def _graph() -> qntm_graph.Graph:
    registry = qntm_graph.load_schema(_SCHEMA)
    return qntm_graph.Graph(registry, raw_schema=_SCHEMA)


def _sheet(write_policy: str = "writable") -> CompiledSheet:
    section = RegisteredNode(id="sec", qualification="pattern", ordering=(), source_line=1)
    return CompiledSheet(
        id="s",
        domain="d",
        path="views/s.md",
        input_grammar="tolerant",  # type: ignore[arg-type]
        render_policy="re-render",  # type: ignore[arg-type]
        default_tags=(),
        default_node_type="task",
        manifest=(section,),
        rendering_contract="starter",
        source_file="views.yaml",
        source_line=1,
        write_policy=write_policy,  # type: ignore[arg-type]
    )


def _cells_for(
    node: qntm_graph.Node,
    *,
    graph: qntm_graph.Graph,
    token_resolver: TokenResolver,
    write_policy: str,
) -> dict[str, Any]:
    """Independently read the cell VALUES `_render_node_line` composed this line from — the SAME
    internal calls, at the SAME point in the pipeline, so this is a second reading of the real
    renderer's own working state rather than a re-derivation."""
    decision_tables = _FakeDispatcher()
    node_context = build_node_local_context(graph, node)
    checkbox = _checkbox_dispatcher().dispatch("render_checkbox", node_context).result
    title_style = _title_style_dispatcher().dispatch("render_title_style", node_context).result
    title_text = _apply_title_style(_clean_title(node.fields.get("title")), title_style)
    qntm_id_cell = _qntm_id_cell(
        node, write_policy=write_policy, sheet_id="s", section_id="sec", graph=graph
    )
    reconstructed = FieldReconstructor(token_resolver, decision_tables).reconstruct(
        node.type, node.fields
    )
    tag_cells = _order_tags_dispatcher().dispatch(
        "order_tags", {"tags": list(reconstructed.tags)}
    ).result
    marker_cells = _assemble_marker_cells(reconstructed.markers, _order_markers_dispatcher())
    chrome_cells = _outgoing_edge_chrome_cells(node, graph, token_resolver)
    return {
        "checkbox": str(checkbox) if checkbox not in (None, "") else "[ ]",
        "title": title_text,
        "stamp": qntm_id_cell,
        "date": "",  # always empty — see module docstring
        "tags": list(tag_cells),
        "markers": list(marker_cells),
        "chrome": list(chrome_cells),
    }


def _compose_line(
    shape: str, cells: dict[str, Any], composition: dict[str, Any], depth: int
) -> str:
    """The FULL line recomposition — the exact operation `app/present/express/composition.ts`'s
    `composeLine` performs (bullet + indent, then every declared cell in order, the title cell
    wrapped by `composition["titleStyles"]`, joined by `composition["separator"]`), transcribed
    here so this script can prove a DECLARED FORM (not just a declared order) against the real
    renderer BEFORE that TypeScript file is trusted to. Supersedes the old head/tail-only
    `_compose` splice for any fixture that declares a non-default bullet or title_styles; existing
    callers whose `composition["bullet"] == "-"` and `composition["titleStyles"] == []` compose
    byte-identically to before this function existed.
    """
    order = [*composition["heads"][shape], *composition["tail"]]
    parts: list[str] = []
    for cell_class in order:
        if cell_class == "title":
            title = cells.get("title") or ""
            if title:
                parts.append(_apply_title_styles(title, composition.get("titleStyles", [])))
            continue
        value = cells.get(cell_class)
        if value is None or value == "":
            continue
        if isinstance(value, list):
            parts.extend(v for v in value if v)
        else:
            parts.append(value)
    return f"{'    ' * depth}{composition['bullet']} {composition['separator'].join(parts)}"


def _fixture(
    fixture_id: str,
    *,
    node_type: str,
    fields: dict[str, Any],
    write_policy: str = "writable",
    depth: int = 0,
    parent_title: str | None = None,
    edge_target_title: str | None = None,
    composition_bullet: str | None = None,
    composition_title_styles: tuple[str, ...] | None = None,
) -> dict[str, Any]:
    graph = _graph()
    node = graph.create_node(node_type, fields)
    roots_node = node
    if parent_title is not None:
        parent = graph.create_node("task", {"title": parent_title})
        graph.create_edge("PART_OF", node.id, parent.id)
        roots_node = parent
    if edge_target_title is not None:
        target = graph.create_node("task", {"title": edge_target_title})
        graph.create_edge("REQUIRES", node.id, target.id)

    token_resolver = _resolver()
    shape = _SCHEMA["node_types"][node_type]["render"]["shape"]
    cells = _cells_for(node, graph=graph, token_resolver=token_resolver, write_policy=write_policy)

    # ── THE REAL RENDER — the full public entry point, unmocked beyond the two ghost tables ──
    if parent_title is not None:
        tree = SectionTree(
            section_id="sec",
            roots=(
                SectionTreeNode(
                    node=roots_node,
                    is_qualifying=True,
                    children=(SectionTreeNode(node=node, is_qualifying=True, children=()),),
                ),
            ),
        )
    else:
        tree = SectionTree(
            section_id="sec",
            roots=(SectionTreeNode(node=node, is_qualifying=True, children=()),),
        )
    render_kwargs: dict[str, Any] = {}
    if composition_bullet is not None:
        render_kwargs["composition_bullet"] = composition_bullet
    if composition_title_styles is not None:
        render_kwargs["composition_title_styles"] = composition_title_styles
    result = render(
        _sheet(write_policy=write_policy),
        {"sec": tree},
        _FakeDispatcher(),
        graph=graph,
        token_resolver=token_resolver,
        **render_kwargs,
    )
    lines = result.markdown.splitlines()
    # The node's OWN rendered line — last line when nested (parent then child), else the second
    # line (the manifest heading is line 1 in every fixture here).
    expected_line = lines[-1]

    # ── REFUSING — recompose from the declared order/form alone and demand byte-identity BEFORE
    # this fixture is allowed into the committed file. See module docstring, "THE ACCEPTANCE
    # TEST". A fixture that declares no bullet/title_styles override recomposes through
    # `_COMPOSITION`'s own defaults ("-", []), the SAME literal every pre-existing fixture proved
    # against — this generalisation changes no existing fixture's behaviour. ──
    effective_composition = dict(_COMPOSITION)
    if composition_bullet is not None:
        effective_composition["bullet"] = composition_bullet
    if composition_title_styles is not None:
        effective_composition["titleStyles"] = list(composition_title_styles)
    recomposed = _compose_line(shape, cells, effective_composition, depth)
    if recomposed != expected_line:
        print(
            f"REFUSING fixture {fixture_id!r}: declared-order recomposition\n"
            f"  {recomposed!r}\ndisagrees with the real renderer's own line\n"
            f"  {expected_line!r}",
            file=sys.stderr,
        )
        raise SystemExit(2)

    return {
        "id": fixture_id,
        "shape": shape,
        "depth": depth,
        "cells": cells,
        "expectedLine": expected_line,
        "composition": effective_composition,
    }


def build_fixtures() -> list[dict[str, Any]]:
    fixtures = [
        # F1 — bare title: HEAD only (checkbox+title), read_only so no stamp, no domain so the
        # only tail cell is the unavoidable type tag.
        _fixture(
            "bare_title_no_stamp",
            node_type="task",
            fields={"title": "Bare title"},
            write_policy="read_only",
        ),
        # F2 — title + a field tag, writable: exercises STAMP positioned before TAGS.
        _fixture(
            "title_tag_stamp",
            node_type="task",
            fields={"title": "Ship the thing", "domain": "work", "qntm_id": "f2"},
        ),
        # F3 — due_date (the "date" the operator's mental model treats as its own cell) AND
        # priority, both markers: exercises MARKERS positioned after TAGS, and refutes/confirms
        # that "date" is not a separate cell any more — it renders via the marker path.
        _fixture(
            "date_and_priority_markers",
            node_type="task",
            fields={"title": "Renew passport", "priority": "high", "due_date": "2026-09-01", "qntm_id": "f3"},
        ),
        # F4 — outgoing-edge CHROME, positioned last, after tags and markers, alongside a tag and
        # both markers so the full tail order is exercised in one line.
        _fixture(
            "chrome_last",
            node_type="task",
            fields={
                "title": "Draft the report",
                "domain": "work",
                "priority": "high",
                "due_date": "2026-09-01",
                "qntm_id": "f4",
            },
            edge_target_title="Get approval",
        ),
        # F5 — plain_line HEAD shape (no checkbox glyph): a different node type (`note`) whose
        # declared render.shape is plain_line, still carrying a stamp and its type tag.
        _fixture("plain_line_head", node_type="note", fields={"title": "A note", "qntm_id": "f5"}),
        # F6 — everything at once, nested one level: checkbox HEAD, stamp, tags, both markers,
        # chrome, AND depth=1 indentation — the strongest single proof of the full declared order.
        _fixture(
            "nested_everything",
            node_type="task",
            fields={
                "title": "Nested full",
                "domain": "work",
                "priority": "low",
                "due_date": "2026-08-10",
                "qntm_id": "f6",
            },
            depth=1,
            parent_title="Parent",
            edge_target_title="Some target",
        ),
        # ── FORM — composition's OWN optional bullet + title-style wrap. Every fixture above
        # declares NEITHER (composition_bullet=None, composition_title_styles=None), proving
        # ABSENCE is byte-identical to the pre-existing literal — see this script's own REFUSING
        # check, which recomposes those through `_COMPOSITION`'s own "-" / [] unchanged. The three
        # below are the CAPABILITY proof: a genuinely different bullet and/or title wrap, still
        # byte-identical between the real renderer and the declared-order recomposition. No fixture
        # node below sets `status` or uses `node_type="explainer"`, so `render_title_style`'s own
        # per-node rows (the pre-existing "done"/"in_progress"/"waiting"/explainer wrap) all miss —
        # `title_styles` below is the ONLY wrap in play, isolating the NEW capability cleanly.
        #
        # F7 — THE OPERATOR'S OWN EXAMPLE: "*Buy gift*" — a declared `form.title_styles: [italic]`
        # wraps the title in single asterisks, and NOTHING else about the line changes.
        _fixture(
            "declared_italic_title",
            node_type="task",
            fields={"title": "Buy gift", "qntm_id": "f7"},
            composition_title_styles=("italic",),
        ),
        # F8 — a declared `form.bullet: "*"` — GFM's OTHER bullet character. `io.parser.
        # parse_checkbox` (monorepo, read-only) already accepts `-`/`*`/`+` interchangeably
        # (`_CHECKBOX_RE`/`_BULLET_ONLY_RE`), so this round-trips with zero ingest-side change —
        # see renderer.py's "COMPOSITION FORM" header for the full argument.
        _fixture(
            "declared_star_bullet",
            node_type="task",
            fields={"title": "Water the plants", "domain": "work", "qntm_id": "f8"},
            composition_bullet="*",
        ),
        # F9 — bullet AND title_styles declared TOGETHER, combined with bold+strikethrough (two
        # styles nesting in ONE wrap: `~~**…**~~`), nested one level — the strongest single proof
        # that FORM composes correctly alongside indentation, order, tags and markers all at once.
        _fixture(
            "declared_bullet_and_multi_style",
            node_type="task",
            fields={
                "title": "Archive the ticket",
                "domain": "work",
                "priority": "high",
                "qntm_id": "f9",
            },
            depth=1,
            parent_title="Parent",
            composition_bullet="+",
            composition_title_styles=("bold", "strikethrough"),
        ),
    ]
    return fixtures


def canonical_order_pins() -> dict[str, dict[str, Any]]:
    """The three canonical cell orders, READ THROUGH THE REAL DISPATCHER FACTORIES.

    `composition.tail` names three cell families that can carry more than one cell — `tags`,
    `markers`, `chrome` — and each has its own canonical order contract. `tagOrder` has been
    published alone since 2026-08-07; this pins all three, so a composer never has to invent one.

    ── WHY THE FACTORY AND NOT THE FILE, AND WHY IT MATTERS MORE HERE THAN FOR THE CHECKBOX ──

    These contracts are being MOVED out of `src/qntm_md/render/contracts/` into config.
    `renderer.py`'s `_engine_render_dispatcher(table_id)` takes a table id, resolves the path
    ITSELF, and caches the dispatcher; the five named wrappers are no-argument delegates to it. So
    asking the factory survives the move and naming a path would not. Same lesson as pinning the
    checkbox against `_checkbox_dispatcher()` rather than parsing its YAML, one level up.

    ── THE SIGNATURE IS PART OF WHAT THIS ASSERTS, DELIBERATELY ──

    Finishing `rendering_contract` means keying the dispatcher cache BY SHEET, at which point a
    no-argument `_order_markers_dispatcher()` cannot answer — the order would depend on which view
    is rendering, and this pin would be asserting a global answer that no longer exists. A pin that
    kept passing through that change would be the same shape as the retired copies these contracts
    warn about: still green, no longer true. So the arity is checked, and the failure is a REFUSAL
    naming the change rather than a silently narrower claim.
    """
    # (published key, factory, table id, the params key THAT dispatcher reads). The last is not
    # cosmetic: `OrderMarkersActionDispatcher` reads `params["markers"]` and the two tag dispatchers
    # read `params["tags"]`, so one shared probe payload would KeyError on the marker table rather
    # than prove anything about it.
    dispatchers = (
        ("tagOrder", _order_tags_dispatcher, "order_tags", "tags"),
        ("markerOrder", _order_markers_dispatcher, "order_markers", "markers"),
        ("edgeTagOrder", _order_edge_tags_dispatcher, "order_edge_tags", "tags"),
    )
    out: dict[str, dict[str, Any]] = {}
    for key, factory, table_id, params_key in dispatchers:
        signature = inspect.signature(factory)
        if signature.parameters:
            print(
                f"REFUSING: {factory.__name__}{signature} now takes argument(s) "
                f"{list(signature.parameters)} — the canonical order is no longer one global "
                "answer, so publishing it as one would be a claim the engine has stopped making. "
                "This pin needs re-scoping to whatever the parameter keys it by.",
                file=sys.stderr,
            )
            raise SystemExit(2)
        dispatcher = factory()
        # THE ORDER AS THE DISPATCHER HOLDS IT, not as the YAML spells it — the same "agree with the
        # decision, not with a file" posture the checkbox pin takes. `_table` is the compiled
        # contract the dispatcher was constructed with; reaching for it is an extraction, and an
        # extraction can be wrong, so it is CONFIRMED BY DISPATCH immediately below rather than
        # trusted. If the attribute ever disappears this refuses loudly instead of guessing.
        table = getattr(dispatcher, "_table", None)
        if table is None or not hasattr(table, "canonical_order"):
            print(
                f"REFUSING: {factory.__name__}() no longer exposes a compiled table with a "
                "canonical_order — the extraction below is guessing, so it stops here",
                file=sys.stderr,
            )
            raise SystemExit(2)
        canonical = [str(token) for token in table.canonical_order]
        # `.value`, NOT `str()`. `unranked_policy` is an enum, and `str()` on it yields
        # "UnrankedPolicy.APPEND_STABLE" — which is not what the contract spells, not what
        # `tagOrder` has published since 2026-08-07, and would have made this pin disagree with the
        # literal it exists to confirm. Caught by the first run.
        policy = getattr(table.unranked_policy, "value", None) or str(table.unranked_policy)
        # CONFIRMED BY DRIVING IT. Hand the dispatcher the canonical tokens REVERSED plus one token
        # it cannot know, and the answer must be the canonical order followed by the stranger. That
        # proves the extracted list IS the ranking the dispatcher applies, and proves the policy is
        # append_stable, without either fact being read twice from the same place.
        stranger = "#\u0000-not-a-real-token"
        driven = dispatcher.dispatch(table_id, {params_key: list(reversed(canonical)) + [stranger]}).result
        # AN UNRECOGNISED POLICY REFUSES; IT DOES NOT SKIP THE CHECK. The first draft wrote
        # `if policy == "append_stable" else None` and then only asserted when it was — and because
        # `str()` on the enum yielded "UnrankedPolicy.APPEND_STABLE", the confirmation quietly did
        # not run at all while the script printed success. A guard that turns itself off when it
        # does not recognise the input is the vacuity this whole file exists to refuse.
        if policy != "append_stable":
            print(
                f"REFUSING: {key} declares unranked_policy {policy!r}, which this pin cannot "
                "confirm by dispatch — extend the probe rather than letting it pass unchecked",
                file=sys.stderr,
            )
            raise SystemExit(2)
        if list(driven) != canonical + [stranger]:
            print(
                f"REFUSING: {key} extracted {canonical!r} but dispatching returned {list(driven)!r} "
                "— the extraction does not describe the decision",
                file=sys.stderr,
            )
            raise SystemExit(2)
        if not canonical:
            print(f"REFUSING: {key} resolved an EMPTY canonical order — pinning it proves nothing", file=sys.stderr)
            raise SystemExit(2)
        if len(set(canonical)) != len(canonical):
            print(f"REFUSING: {key} repeats a token in its canonical order: {canonical}", file=sys.stderr)
            raise SystemExit(2)
        out[key] = {"canonicalOrder": canonical, "unrankedPolicy": policy}

    # POSITIVE CONTROL: three tables that all resolved the SAME list would mean the factory is
    # ignoring its `table_id` and every comparison below would hold vacuously.
    if len({tuple(v["canonicalOrder"]) for v in out.values()}) != len(out):
        print(
            "REFUSING: two canonical orders are identical — the dispatcher factory may be ignoring "
            "its table_id, which would make all three pins one pin",
            file=sys.stderr,
        )
        raise SystemExit(2)
    return out


def title_style_pin() -> dict[str, Any]:
    """`render_title_style`, DRIVEN over a grid of real node contexts.

    ── WHY A GRID AND NOT A TRANSCRIPTION ──

    `CompiledRow.when_ast` is an OPAQUE compiled AST — reading it back into a predicate would be
    guessing at a structure the engine never promised. So this asks the dispatcher what it ANSWERS
    for a context, over every combination that could distinguish one row from another, and emits
    those answers as a differential. `tests/present-resolution.test.mjs` then evaluates the
    PUBLISHED table over the same grid and must agree on every cell.

    That is stronger than a transcription check: it catches a published predicate that is merely
    WORDED differently as readily as one that is wrong, because neither is asserted — only the
    answers are.

    ── THE OPERATOR SET IS PART OF WHAT THIS ASSERTS ──

    The published shape carries the rule engine's OWN closed operator set rather than the three
    these rows use, so that a row using `or` or `ne` — both already reachable by a config edit —
    does not need a shape change. If that set GROWS, the browser's reader has an operator it
    cannot evaluate and would have to refuse the table. Better to learn it here, as a refusal
    naming the new operator, than to discover it as a title that stopped being bold.
    """
    from qntm_rule_engine.evaluator.core import _COMPARISON_OPERATORS

    known = set(_COMPARISON_OPERATORS) | {"and", "or", "not"}
    expected = {"eq", "ne", "gt", "gte", "lt", "lte", "and", "or", "not"}
    if known != expected:
        print(
            f"REFUSING: the rule engine's operator set is now {sorted(known)}, not "
            f"{sorted(expected)} — `app/present/resolutiontable.ts` can only evaluate the set it "
            "knows, so a published table using a new operator would be refused at the reader. "
            "Extend the reader and this pin together.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    # ── WHOSE CONTRACT DID THE DISPATCHER ACTUALLY READ? (guard added for qntm-9e's #115) ──
    #
    # `renderTitleStyleSource` is published as `"engine-literal"`, and that is true only while the
    # engine's own `render/contracts/` copy is the one compiled. #115 makes a file in
    # `config/rendering/` WIN over it, at which point the operator can override this table and
    # `"engine-literal"` becomes a lie — the same provenance question `compositionSource` answers
    # for composition and `defaultOrderingSource` for the ordering.
    #
    # The driven grid below already fails LOUDLY under an override, because the published literal
    # would no longer match what the dispatcher answers. This guard catches the quieter half: an
    # override the literal happens to agree with, where only the SOURCE is wrong.
    #
    # Written against an API that does not exist yet, on purpose, and inert until it does.
    try:
        from qntm_md.render import renderer as _renderer_module

        sources_fn = getattr(_renderer_module, "render_contract_sources", None)
    except Exception:
        sources_fn = None
    if sources_fn is not None:
        try:
            sources = sources_fn()
            source = sources.get("render_title_style") if isinstance(sources, dict) else None
        except Exception:
            source = None
        if source is not None and "render/contracts" not in str(source):
            print(
                f"REFUSING: render_title_style now compiles from {source!r}, not the engine's own "
                "contracts directory — `renderTitleStyleSource: \"engine-literal\"` is no longer "
                "true, and the key has to become a real provenance answer before this can be "
                "published again.",
                file=sys.stderr,
            )
            raise SystemExit(2)

    dispatcher = _title_style_dispatcher()
    signature = inspect.signature(_title_style_dispatcher)
    if signature.parameters:
        print(
            f"REFUSING: _title_style_dispatcher{signature} now takes argument(s) "
            f"{list(signature.parameters)} — the title wrap is no longer one global answer, so "
            "publishing it as one would be a claim the engine has stopped making.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    # THE GRID. Every combination that can distinguish one published row from another: the two node
    # types the rows name plus one they do not, every status the rows test plus one they do not and
    # the absent case, and the WAITING_FOR outgoing count on both sides of the `gte 1` boundary.
    node_types = ["task", "explainer", "outcome"]
    statuses = ["open", "done", "in_progress", "cancelled", "waiting", "scheduled", None]
    waiting_counts = [0, 1]

    # ITS OWN SCHEMA, NOT THE SHARED `_SCHEMA`. That one is the composition fixtures' universe —
    # two node types and two edge types — and it feeds nine committed fixtures. This pin needs the
    # types its predicates NAME (`task`, `explainer`, plus one the rows do not name) and a
    # `WAITING_FOR` edge to put on both sides of the `gte 1` boundary. Widening the shared schema to
    # get them would change the universe those nine fixtures were proven in, for a reason that has
    # nothing to do with them.
    pin_schema: dict[str, Any] = {
        "version": 1,
        "field_types": {
            "title": {"type": "string"},
            "status": {"type": "string", "nullable": True, "required": False},
        },
        "node_types": {
            "task": {"fields": ["title", "status"], "render": {"shape": "checkbox"}},
            "explainer": {"fields": ["title", "status"], "render": {"shape": "plain_line"}},
            "outcome": {"fields": ["title", "status"], "render": {"shape": "checkbox"}},
        },
        "edge_types": {
            "WAITING_FOR": {"direction": "directed", "cardinality": "many_to_many"},
        },
    }

    def pin_graph() -> qntm_graph.Graph:
        return qntm_graph.Graph(qntm_graph.load_schema(pin_schema), raw_schema=pin_schema)

    grid: list[dict[str, Any]] = []
    for node_type in node_types:
        for status in statuses:
            for waiting in waiting_counts:
                graph = pin_graph()
                fields: dict[str, Any] = {"title": "probe"}
                if status is not None:
                    fields["status"] = status
                node = graph.create_node(node_type, dict(fields))
                for _ in range(waiting):
                    target = graph.create_node("task", {"title": "awaited"})
                    graph.create_edge("WAITING_FOR", node.id, target.id)
                result = dispatcher.dispatch(
                    "render_title_style", build_node_local_context(graph, node)
                ).result
                styles = list(result) if isinstance(result, (list, tuple)) else ([result] if isinstance(result, str) else [])
                grid.append(
                    {
                        "nodeType": node_type,
                        "status": status,
                        "waitingForOutgoing": waiting,
                        "styles": styles,
                    }
                )

    # POSITIVE CONTROLS. A grid whose every cell answered the same thing would make the JS side
    # agree with anything.
    answers = {tuple(cell["styles"]) for cell in grid}
    if len(answers) < 3:
        print(
            f"REFUSING: the grid produced only {len(answers)} distinct answer(s) {sorted(answers)} "
            "— it does not separate the rows, so agreeing with it proves nothing",
            file=sys.stderr,
        )
        raise SystemExit(2)
    if not any(cell["styles"] == ["bold"] for cell in grid):
        print("REFUSING: no grid cell renders bold — the in_progress row was never exercised", file=sys.stderr)
        raise SystemExit(2)
    if not any(cell["styles"] == ["italic"] for cell in grid):
        print("REFUSING: no grid cell renders italic — neither italic row was exercised", file=sys.stderr)
        raise SystemExit(2)
    if not any(cell["styles"] == [] for cell in grid):
        print("REFUSING: no grid cell reaches the fallback or an empty row", file=sys.stderr)
        raise SystemExit(2)

    return {"operators": sorted(known), "grid": grid}


def render_checkbox_pin() -> dict[str, Any]:
    """The `render_checkbox` contract, READ THROUGH THE REAL DISPATCHER, as publishable rows.

    ── WHY THIS EXISTS AT ALL ──

    `compile-resolution.mjs` publishes `resolution.renderCheckbox` as a hand-written literal, the
    same posture `ENGINE_LITERAL_TAG_ORDER` already takes. The contract's own header
    (`render/contracts/render_checkbox.yaml`) is explicit about what a hand copy is worth on its
    own: `config/rendering/checkbox.yaml` was exactly such a copy, "kept in sync by nothing", and
    when the 2026-06-24 bugfix dropped the `node.type == "task"` guard from every row the copy did
    not follow. A done OUTCOME then matched no row, took the fallback, rendered `[ ]` while the
    model held status=done, and the next re-ingest silently RE-OPENED it — qntm:66/837/903, roughly
    every four to five days.

    So this function is not a convenience. It is the thing that makes the literal legitimate: the
    published rows are checked against the LIVE contract on every run, and the fixture is not
    written when they disagree.

    ── IT DRIVES THE DISPATCHER RATHER THAN PARSING THE YAML ──

    Reading the contract file directly would prove the browser agrees with a FILE. What matters is
    that it agrees with the DECISION, so each row's `then` is confirmed by dispatching a real
    node-local context through `_checkbox_dispatcher()` — the same object `_render_node_line` uses
    — and the fallback by dispatching a node carrying no `status` at all.
    """
    dispatcher = _checkbox_dispatcher()

    def glyph_for(fields: dict[str, Any]) -> str:
        # THE SAME `_graph()` EVERY OTHER FIXTURE USES — a real registry over the real schema, not a
        # bare Graph. `build_node_local_context` reads the node's edge neighbourhood out of it, so a
        # stand-in graph would be a second, differently-shaped context and the pin would be proving
        # agreement with something the renderer never sees.
        graph = _graph()
        node = graph.create_node("task", dict(fields))
        result = dispatcher.dispatch("render_checkbox", build_node_local_context(graph, node)).result
        return str(result) if result not in (None, "") else ""

    statuses = ["open", "done", "in_progress", "cancelled", "waiting", "scheduled"]
    rows = [{"when": {"field": "status", "equals": s}, "then": glyph_for({"title": "pin", "status": s})} for s in statuses]
    # THE FALLBACK IS DRIVEN, NOT COPIED — a node with no `status` field at all, which is exactly
    # the case a value map cannot express and the reason this is published as rows plus a fallback.
    fallback = glyph_for({"title": "pin"})

    # POSITIVE CONTROL. Six statuses collapsing to one glyph would mean the dispatcher answered
    # nothing and every assertion below would hold vacuously.
    distinct = {row["then"] for row in rows}
    if len(distinct) != len(statuses):
        print(
            f"REFUSING: the render_checkbox dispatcher returned {len(distinct)} distinct glyph(s) "
            f"for {len(statuses)} statuses — it is not deciding, so pinning it proves nothing",
            file=sys.stderr,
        )
        raise SystemExit(2)
    if any(not row["then"] for row in rows) or not fallback:
        print("REFUSING: the render_checkbox dispatcher returned an empty glyph", file=sys.stderr)
        raise SystemExit(2)

    return {"rows": rows, "fallback": fallback}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=DEFAULT_OUT, type=Path)
    args = parser.parse_args()

    fixtures = build_fixtures()

    # POSITIVE CONTROLS — a fixture set that never actually exercised a cell class would REFUSE
    # nothing and prove nothing.
    if not any(f["cells"]["stamp"] for f in fixtures):
        print("REFUSING: no fixture carries a stamp", file=sys.stderr)
        return 2
    if not any(f["cells"]["markers"] for f in fixtures):
        print("REFUSING: no fixture carries a marker", file=sys.stderr)
        return 2
    if not any(f["cells"]["chrome"] for f in fixtures):
        print("REFUSING: no fixture carries outgoing-edge chrome", file=sys.stderr)
        return 2
    if not any(f["depth"] > 0 for f in fixtures):
        print("REFUSING: no fixture is nested", file=sys.stderr)
        return 2
    if not any(f["shape"] == "plain_line" for f in fixtures):
        print("REFUSING: no fixture exercises the plain_line HEAD", file=sys.stderr)
        return 2
    # FORM positive controls — a fixture set that never declared a non-default bullet or
    # title_styles would REFUSE nothing about FORM specifically and prove nothing about it.
    if not any(f["composition"]["bullet"] != "-" for f in fixtures):
        print("REFUSING: no fixture declares a non-default bullet", file=sys.stderr)
        return 2
    if not any(f["composition"]["titleStyles"] for f in fixtures):
        print("REFUSING: no fixture declares a title_styles wrap", file=sys.stderr)
        return 2
    if not any(len(f["composition"]["titleStyles"]) > 1 for f in fixtures):
        print("REFUSING: no fixture declares MORE THAN ONE title style (nesting untested)", file=sys.stderr)
        return 2
    if not any(f["composition"]["bullet"] == "-" and not f["composition"]["titleStyles"] for f in fixtures):
        print("REFUSING: no fixture proves ABSENCE — default bullet, no title wrap", file=sys.stderr)
        return 2

    out = {
        "note": (
            "GENERATED by scripts/composition-agreement.py, run against a LIVE import of "
            "qntm_md.render.renderer (apps/qntm-md/.venv/bin/python scripts/composition-agreement.py). "
            "Every fixture here already passed a byte-identity check between the declared "
            "composition order/form and the real renderer's own output — see that script's "
            "REFUSING block. Each fixture carries its OWN 'composition' (bullet + titleStyles); "
            "most fixtures declare neither override and so carry _COMPOSITION's own defaults "
            "('-', []) — the absence proof. Never hand-edit: regenerate."
        ),
        # WHICH ANSWER `composition` IS — "engine-live-import" once the companion engine PR
        # (renderer.py reading `_COMPOSITION_HEADS`/`_COMPOSITION_TAIL` as data) has merged into
        # the monorepo checkout this ran against, "literal-fallback" otherwise. See this script's
        # own header, "THE DECLARED ORDER" — never silent about which one answered.
        "compositionSource": _COMPOSITION_SOURCE,
        # WHICH ANSWER the FORM half (bullet/titleStyles) of `composition` is — same two-state
        # posture, its own flag because a checkout can have the base composition-reads-config PR
        # without yet having this one's engine-side form additions.
        "compositionFormSource": _COMPOSITION_FORM_SOURCE,
        "composition": _COMPOSITION,
        # THE CHECKBOX DECISION, driven through the real dispatcher — see `render_checkbox_pin`'s
        # own docstring for why a hand copy of this table without a pin is the exact shape that
        # re-opened the operator's completed outcomes. `tests/composition-agreement.test.mjs`
        # asserts `presentation.json`'s `resolution.renderCheckbox` equals this, so the literal in
        # `compile-resolution.mjs` cannot drift from the contract without a red test.
        "renderCheckbox": render_checkbox_pin(),
        # The three canonical cell orders — see `canonical_order_pins`. `tests/composition-
        # agreement.test.mjs` asserts the published literals equal these, so a contract edit that
        # does not reach `compile-resolution.mjs` is a red test rather than a silent divergence.
        "canonicalOrders": canonical_order_pins(),
        # The per-node title wrap, driven over a grid — see `title_style_pin`. The JS side
        # evaluates the PUBLISHED table over the same grid and must agree on every cell.
        "titleStyle": title_style_pin(),
        "fixtures": fixtures,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(
        f"wrote {args.out}\n  {len(fixtures)} fixtures, all proven byte-identical against the real "
        f"renderer\n  composition source: {_COMPOSITION_SOURCE}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

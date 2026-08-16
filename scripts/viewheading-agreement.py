"""viewheading-agreement — does the BROWSER'S composed `## ` line equal the ENGINE'S own?

    apps/qntm-md/.venv/bin/python scripts/viewheading-agreement.py [--out PATH]

── WHY THIS EXISTS, STATED AS THE MISTAKE IT ANSWERS ──

I described this heading's shape to the operator TWICE and was wrong both times. First as
`## {id} ({count})`, read off a rendered view from the STARTER config, which declares no names.
Then as "`compose_section_header` composes `## {name or id}` with a count suffix", read off the
function's own docstring — which is about the FALLBACK, reached only when nothing else answers.

The truth is `ViewRegistration.section_heading`, and it is three branches deep with a count on only
the last of them. A composer built from either of my two descriptions would have been wrong on
every section of every view, and no test in this repo would have noticed, because every test would
have been written from the same wrong description.

So the heading is pinned against the ENGINE'S OWN FUNCTION rather than against my reading of it.

── WHAT IT DRIVES ──

`ViewRegistration.section_heading(section, qualifying_nodes, graph, write_policy)` — the engine's
single source of truth, which its own docstring says both the renderer and the differ route
through. Not `render()`: that needs a compiled sheet, a manifest and a section tree, none of which
bear on what the heading says. The grain matches the claim, the same choice
`nodeline-agreement.py` makes for `_render_node_line`.

`heading_node_with_pathway` is driven alongside it, because the `## ` line DISAPPEARS when a
section's name collides with a unique-identity node that does not render as a heading. That is not
an edge case dressed up: `name:` is declared on 303 of the operator's 304 sections and the lookup is
an unscoped whole-graph title search, so the collision is one badly-named node away at all times.

── THE PROBE GRID ──

Every branch, and both sides of every boundary that decides one:

    no name, no members          -> the bare id
    no name, members             -> `{id} ({count})`
    no name, header_value        -> `{id}: {value}`, and the empty/multiline fallbacks
    a name                       -> the name, CLEAN — no count, and this is the live case
    a name AND members           -> still no count, which is the whole point
    container_node -> a title    -> the node's title plus its stamp
    container_node -> unique     -> the title, stampless
    container_node, read_only    -> the title, stampless
    a name matching a heading node       -> the name, and the `## ` line survives
    a name matching a NON-heading node   -> NO `## ` line at all

── ONE CONFIG, READ BY BOTH HALVES ──

The operator's own, for the reason `nodeline-agreement.py` states: `tests/fixtures/config/` is not
a bundle and the engine's loader refuses it. The fixture this writes is COMMITTED, so the JS half
runs anywhere and only REGENERATION needs the monorepo.
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

from qntm_md.render.compiler import RegisteredNode  # noqa: E402
from qntm_md.render.view_registration import ViewRegistration  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import monorepo_config  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = monorepo_config.config_dir(REPO_ROOT)
DEFAULT_OUT = REPO_ROOT / "tests" / "fixtures" / "viewheading-agreement.json"


def _registered(**overrides: Any) -> RegisteredNode:
    """One manifest entry. Only the fields the heading reads are varied; everything else takes
    `RegisteredNode`'s own declared default, so a field GAINING a default that changes the heading
    shows up here as a changed fixture rather than as nothing."""
    base: dict[str, Any] = {
        "id": overrides.pop("id"),
        "qualification": "irrelevant-to-the-heading",
        "ordering": (),
        "source_line": 1,
    }
    base.update(overrides)
    return RegisteredNode(**base)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config-dir", default=DEFAULT_CONFIG, type=Path)
    parser.add_argument("--out", default=DEFAULT_OUT, type=Path)
    args = parser.parse_args()

    raw_schema = yaml.safe_load((args.config_dir / "schema.yaml").read_text())

    def graph() -> qntm_graph.Graph:
        return qntm_graph.Graph(qntm_graph.load_schema(raw_schema), raw_schema=raw_schema)

    # THE TYPES THE COLLISION PROBES NEED, DERIVED FROM THE SCHEMA rather than named. A hardcoded
    # `"header"` would stop proving anything the day the operator renames it, and the whole point of
    # `is_unique_name_node_type` is that there is no such branch anywhere in the engine.
    node_types = raw_schema.get("node_types") or {}

    def unique_type_with_shape(shape: str) -> str | None:
        for name in sorted(node_types):
            entry = node_types[name] or {}
            identity = entry.get("identity") or {}
            render = entry.get("render") or {}
            if identity.get("unique") is True and render.get("shape") == shape:
                return name
        return None

    heading_type = unique_type_with_shape("heading")
    non_heading_unique = None
    for name in sorted(node_types):
        entry = node_types[name] or {}
        identity = entry.get("identity") or {}
        render = entry.get("render") or {}
        if identity.get("unique") is True and render.get("shape") not in (None, "heading"):
            non_heading_unique = name
            break
    if heading_type is None:
        print("REFUSING: no unique-identity type renders as a heading — the survive probe proves nothing", file=sys.stderr)
        return 2
    if non_heading_unique is None:
        print(
            "REFUSING: no unique-identity type renders as anything but a heading, so the collision "
            "that DELETES a section's `## ` line cannot be exercised at all",
            file=sys.stderr,
        )
        return 2

    probes: list[dict[str, Any]] = [
        {"id": "bare", "section": {"id": "to-do"}, "members": []},
        {"id": "counted", "section": {"id": "to-do"}, "members": [{"type": "task", "fields": {"title": "One"}}]},
        {
            "id": "counted_many",
            "section": {"id": "to-do"},
            "members": [
                {"type": "task", "fields": {"title": "One"}},
                {"type": "task", "fields": {"title": "Two"}},
            ],
        },
        # THE LIVE CASE — 303 of 304. A name and members, and STILL no count.
        {"id": "named", "section": {"id": "to-do", "declared_name": "To Do"}, "members": []},
        {
            "id": "named_with_members",
            "section": {"id": "to-do", "declared_name": "To Do"},
            "members": [{"type": "task", "fields": {"title": "One"}}],
        },
        # `header_value`, and the three ways it falls back to the count suffix.
        {
            "id": "header_value_field",
            "section": {"id": "focus", "header_value": "$current.domain"},
            "members": [{"type": "task", "fields": {"title": "One", "domain": "work"}}],
        },
        {
            "id": "header_value_literal",
            "section": {"id": "focus", "header_value": "Direction today"},
            "members": [{"type": "task", "fields": {"title": "One"}}],
        },
        {"id": "header_value_no_members", "section": {"id": "focus", "header_value": "$current.domain"}, "members": []},
        {
            "id": "header_value_missing_field",
            "section": {"id": "focus", "header_value": "$current.nothing_here"},
            "members": [{"type": "task", "fields": {"title": "One"}}],
        },
        {
            "id": "header_value_multiline",
            "section": {"id": "focus", "header_value": "$current.title"},
            "members": [{"type": "task", "fields": {"title": "Two\nlines"}}],
        },
        # `header_value` LOSES to a name — a boundary nothing else in this grid crosses.
        {
            "id": "name_beats_header_value",
            "section": {"id": "focus", "declared_name": "Focus", "header_value": "$current.domain"},
            "members": [{"type": "task", "fields": {"title": "One", "domain": "work"}}],
        },
        # A PINNED container node — the first branch, which wins over both of the others.
        #
        # NOTE THE TYPE. A pinned node only produces a `## ` line when ITS OWN declared shape is
        # `heading`; pinning a task deletes the line instead (the two probes below this pair). The
        # first draft of this grid pinned tasks for the stamp probes and every stamp assertion
        # passed against `expectedHeading: null` — a control satisfied by a probe that emitted
        # nothing. That is why the stamp probes now pin a heading-shaped type and why the positive
        # controls at the foot of this file require a NON-NULL heading before they count.
        {
            "id": "pinned_stamped",
            "section": {"id": "anything", "declared_name": "Ignored"},
            "members": [],
            "pin": {"type": heading_type, "fields": {"title": "The pinned one"}},
        },
        {
            "id": "pinned_read_only",
            "section": {"id": "anything"},
            "members": [],
            "pin": {"type": heading_type, "fields": {"title": "The pinned one"}},
            "writePolicy": "read_only",
        },
        # A PINNED NON-HEADING NODE DELETES THE `## ` LINE — the declared, intended form of the
        # collision below, and the reason `heading_node_with_pathway` reports which route it took.
        {
            "id": "pinned_non_heading",
            "section": {"id": "anything", "declared_name": "Ignored"},
            "members": [],
            "pin": {"type": "task", "fields": {"title": "The pinned task"}},
        },
        # A pinned id that resolves to NOTHING falls through to the name.
        {"id": "pinned_dangling", "section": {"id": "anything", "declared_name": "The Name", "container_node_id": "no-such-node"}, "members": []},
        # ── THE BY-NAME COLLISION, BOTH SIDES ──
        {
            "id": "name_matches_heading_node",
            "section": {"id": "to-do", "declared_name": "To Do"},
            "members": [],
            "plant": {"type": heading_type, "fields": {"title": "To Do"}},
        },
        {
            "id": "name_matches_non_heading_node",
            "section": {"id": "to-do", "declared_name": "To Do"},
            "members": [],
            "plant": {"type": non_heading_unique, "fields": {"title": "To Do"}},
        },
    ]

    fixtures: list[dict[str, Any]] = []
    for probe in probes:
        g = graph()
        members = [g.create_node(m["type"], dict(m["fields"])) for m in probe.get("members", [])]

        section_fields = dict(probe["section"])
        pin = probe.get("pin")
        pinned_node = None
        if pin is not None:
            pinned_node = g.create_node(pin["type"], dict(pin["fields"]))
            section_fields["container_node_id"] = pinned_node.id
        planted = probe.get("plant")
        planted_node = None
        if planted is not None:
            planted_node = g.create_node(planted["type"], dict(planted["fields"]))

        section = _registered(**section_fields)
        write_policy = probe.get("writePolicy", "writable")

        heading_node, pathway = ViewRegistration.heading_node_with_pathway(section, g)
        heading_shape = None
        if heading_node is not None:
            heading_shape = ((node_types.get(heading_node.type) or {}).get("render") or {}).get("shape")

        # THE `## ` LINE ONLY EXISTS when there is no backing node, or the backing node's declared
        # shape IS `heading` — renderer.py:611. Mirrored here rather than assumed, so the fixture
        # records the DISAPPEARANCE as a fact and not as an absent field.
        emits_heading = heading_node is None or heading_shape == "heading"
        expected = (
            ViewRegistration.section_heading(section, members, g, write_policy=write_policy)
            if emits_heading
            else None
        )

        fixtures.append(
            {
                "id": probe["id"],
                "sectionId": section.id,
                # The BROWSER'S OWN SHAPE — what `resolution.sectionPresentation[view][section]`
                # publishes — so the JS half reads the published key names rather than the engine's
                # compiled ones. Transcribing the engine's field names into the test would hide
                # exactly the mistake that produced this script.
                "presentation": {
                    **({"name": section.declared_name} if section.declared_name else {}),
                    **({"headerValue": section.header_value} if section.header_value else {}),
                    **({"containerNode": section.container_node_id} if section.container_node_id else {}),
                },
                "members": [{"id": n.id, "type": n.type, "fields": dict(n.fields)} for n in members],
                "planted": (
                    None
                    if planted_node is None
                    else {"id": planted_node.id, "type": planted_node.type, "fields": dict(planted_node.fields)}
                ),
                "pinned": (
                    None
                    if pinned_node is None
                    else {"id": pinned_node.id, "type": pinned_node.type, "fields": dict(pinned_node.fields)}
                ),
                "writePolicy": write_policy,
                "headingPathway": pathway,
                "expectedHeading": expected,
            }
        )

    # ── POSITIVE CONTROLS — a grid that never crossed a branch proves nothing about it ──
    def any_fixture(predicate) -> bool:
        return any(predicate(f) for f in fixtures)

    if not any_fixture(lambda f: f["expectedHeading"] is None):
        print("REFUSING: no probe DELETES the `## ` line — the collision is unexercised", file=sys.stderr)
        return 2
    if not any_fixture(lambda f: (f["expectedHeading"] or "").endswith(")")):
        print("REFUSING: no probe produces a count suffix", file=sys.stderr)
        return 2
    if not any_fixture(lambda f: f["presentation"].get("name") and f["expectedHeading"] == f["presentation"]["name"]):
        print("REFUSING: no probe proves a declared name renders CLEAN — the live case", file=sys.stderr)
        return 2
    if not any_fixture(
        lambda f: f["presentation"].get("name") and f["members"] and f["expectedHeading"] == f["presentation"]["name"]
    ):
        print(
            "REFUSING: no probe has BOTH a name and members, so 'a name suppresses the count' is "
            "indistinguishable from 'this section happened to be empty'",
            file=sys.stderr,
        )
        return 2
    if not any_fixture(lambda f: "[[qntm:" in (f["expectedHeading"] or "")):
        print("REFUSING: no probe carries a heading stamp", file=sys.stderr)
        return 2
    # ── `expectedHeading is not None` IS LOAD-BEARING IN THIS ONE AND THE NEXT ──
    #
    # Without it, `"[[qntm:" not in (f["expectedHeading"] or "")` is TRUE for every probe that emits
    # no heading at all, so a grid whose only pinned probes were tasks satisfied this control while
    # proving nothing. It did, on the first run.
    if not any_fixture(
        lambda f: f["pinned"] is not None
        and f["expectedHeading"] is not None
        and "[[qntm:" not in f["expectedHeading"]
    ):
        print("REFUSING: no pinned probe EMITS a stampless heading — the suppression is unexercised", file=sys.stderr)
        return 2
    # AND THE STAMP MUST SURVIVE A UNIQUE-IDENTITY PIN, which is the branch the browser got wrong:
    # a body line of that type renders stampless and a pinned HEADING of the same type does not.
    if not any_fixture(
        lambda f: f["pinned"] is not None
        and f["expectedHeading"] is not None
        and "[[qntm:" in f["expectedHeading"]
        and (((node_types.get(f["pinned"]["type"]) or {}).get("identity") or {}).get("unique") is True)
    ):
        print(
            "REFUSING: no probe pins a UNIQUE-IDENTITY node that still stamps — the difference "
            "between a body line's stamp rule and a pinned heading's is unexercised",
            file=sys.stderr,
        )
        return 2
    if not any_fixture(lambda f: ":" in (f["expectedHeading"] or "")):
        print("REFUSING: no probe resolves a header_value", file=sys.stderr)
        return 2
    if not any_fixture(lambda f: f["headingPathway"] == ViewRegistration.HEADING_PATHWAY_DECLARED_NAME):
        print("REFUSING: no probe resolves a heading node BY NAME", file=sys.stderr)
        return 2
    if not any_fixture(lambda f: f["headingPathway"] == ViewRegistration.HEADING_PATHWAY_IDENTITY_PIN):
        print("REFUSING: no probe resolves a heading node BY ID", file=sys.stderr)
        return 2

    out = {
        "note": (
            "GENERATED by scripts/viewheading-agreement.py against the operator's monorepo config, "
            "driving the REAL ViewRegistration.section_heading and heading_node_with_pathway. "
            "`expectedHeading` is the engine's own heading TEXT (without the `## ` prefix), or null "
            "when the section emits no heading line at all. The companion test compiles the same "
            "config through generate-resolution-declaration.mjs and asserts composeSectionHeading "
            "reproduces every one. Never hand-edit: regenerate."
        ),
        "configDir": "the operator's monorepo config (see this script's header)",
        "headingType": heading_type,
        "nonHeadingUniqueType": non_heading_unique,
        "fixtures": fixtures,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {len(fixtures)} heading fixtures to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

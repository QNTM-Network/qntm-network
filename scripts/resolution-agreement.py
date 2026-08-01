"""resolution-agreement — produce the ENGINE's own DEFAULTS + REGISTRATION answers, to measure the
browser's published `qualification.sections[*].{nodeType,defaults}` and `resolution.registration`
against.

This is the design document's own falsifier for step 5, arm (b): "for every section, assert the
published `defaults` equals `ResolutionCascade().resolve({STRUCTURAL_NODE: section_defaults}).fields`
computed by the engine itself" — run here exactly as specified, not a stronger or weaker version of
it. `tests/qualification-agreement.test.mjs` did the equivalent for KIND 1 (placement filters, via
`matches_pattern`); this does it for KINDS 3 and 4 (defaults and registration), via the engine's own
`qntm_md.resolution` package.

── WHY NO GRAPH READ, UNLIKE `qualification-agreement.py` ──

Defaults and registration resolve from CONFIG ALONE — `research-the-resolution-universe.md` §4.2/
§4.3: "needs to evaluate: nothing but which section the line is in" / "the sheet". Neither reads a
node. So this script loads the bundle (`qntm_md.bundle.load`, pure config parsing) and nothing else
— no `state.db`, no graph, no cycle, no network. It is READ-ONLY on the config it is pointed at.

── THE SIMPLIFICATION, STATED RATHER THAN HIDDEN ──

`io/applier.py`'s real defaults merge (`_merge_registration_defaults`) folds FIVE levels: LINE
(operator clears), SUBTREE (node inheritance), STRUCTURAL_NODE (the section's own `defaults:`),
VIEW (`default_fields` + token-resolved `default_tags`) and GLOBAL (`global_defaults.yaml`). This
script calls the cascade with STRUCTURAL_NODE alone, exactly as the design document's own falsifier
specifies — and PROVES that is not a weaker test than the real merge, by asserting three positive
controls before comparing anything: `global_defaults.yaml` declares `defaults: {}` (GLOBAL is
silent), no view sheet declares a section-level `default_fields`, and `default_registration.yaml`'s
`default_tags` is empty and no sheet overrides it (VIEW's default_tags-as-fields contribution is
therefore empty too). All three fail loudly, not silently, if the operator's config ever changes
under them — which is what "a measurement of zero should be treated as broken until a positive
control passes" means applied to a SIMPLIFICATION rather than to an extractor.

── USAGE ──

    apps/qntm-md/.venv/bin/python scripts/resolution-agreement.py [--config-dir DIR] [--out PATH]
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import structlog

structlog.configure(wrapper_class=structlog.make_filtering_bound_logger(logging.CRITICAL))

from qntm_md.bundle import load as bundle_load  # noqa: E402
from qntm_md.resolution.cascade import ResolutionCascade  # noqa: E402
from qntm_md.resolution.levels import ResolutionLevel  # noqa: E402
from qntm_md.resolution.registration import (  # noqa: E402
    resolve_base_node_type,
    resolve_registration_keys,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_DIR = REPO_ROOT.parents[2] / "qntm" / "apps" / "qntm-md" / "config"
DEFAULT_OUT = REPO_ROOT / "tests" / "fixtures" / "resolution-agreement.json"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config-dir", default=DEFAULT_CONFIG_DIR, type=Path)
    parser.add_argument("--out", default=DEFAULT_OUT, type=Path)
    args = parser.parse_args()

    declaration = json.loads((REPO_ROOT / "presentation.json").read_text())
    qualification = declaration["qualification"]
    resolution = declaration["resolution"]

    bundle = bundle_load(args.config_dir)

    # ── THE THREE POSITIVE CONTROLS — see the module docstring ─────────────────────────────────
    if bundle.global_defaults:
        print(
            f"REFUSING: global_defaults.yaml now declares {bundle.global_defaults!r} — GLOBAL is "
            "no longer silent for defaults, and this script's STRUCTURAL_NODE-only cascade call "
            "would be a WEAKER test than the design document's own falsifier calls for. Widen it "
            "to pass ResolutionLevel.GLOBAL before trusting this fixture.",
            file=sys.stderr,
        )
        return 2
    view_default_fields = [
        (sheet.id, section.id)
        for sheet in bundle.view_sheets
        for section in sheet.sections
        if getattr(section, "default_fields", None)
    ]
    if view_default_fields:
        print(
            f"REFUSING: {len(view_default_fields)} section(s) now declare 'default_fields' — the "
            "VIEW layer of the defaults cascade is no longer silent. Same widening as above.",
            file=sys.stderr,
        )
        return 2
    global_tags = bundle.default_registration.default_tags
    sheet_tags = [sheet.id for sheet in bundle.view_sheets if sheet.default_tags]
    if global_tags or sheet_tags:
        print(
            f"REFUSING: default_tags is non-empty (global={global_tags!r}, sheets={sheet_tags}) — "
            "the VIEW layer's token-resolved default_tags contribution is no longer provably "
            "empty, and this script does not resolve vocabulary tokens to fields. Widen it first.",
            file=sys.stderr,
        )
        return 2

    # ── REGISTRATION: base_node_type (GLOBAL only) + default_node_type per view (GLOBAL -> VIEW) ─
    reg = bundle.default_registration
    global_contribution = {
        "input_grammar": reg.input_grammar,
        "default_node_type": reg.default_node_type,
        "default_tags": list(reg.default_tags),
    }
    base_node_type = resolve_base_node_type(reg)
    if base_node_type != resolution["registration"]["baseNodeType"]:
        print(
            f"REFUSING: engine base_node_type={base_node_type!r} != published "
            f"{resolution['registration']['baseNodeType']!r}",
            file=sys.stderr,
        )
        return 2
    for key, published in (
        ("input_grammar", resolution["registration"]["inputGrammar"]),
        ("default_node_type", resolution["registration"]["defaultNodeType"]),
    ):
        resolved = resolve_registration_keys({ResolutionLevel.GLOBAL: global_contribution}).fields
        if resolved[key] != published:
            print(f"REFUSING: engine GLOBAL {key}={resolved[key]!r} != published {published!r}", file=sys.stderr)
            return 2

    by_view_section = {
        sheet.id: {section.id: section for section in sheet.sections} for sheet in bundle.view_sheets
    }

    sections = []
    for view_id, view_sections in qualification["sections"].items():
        sheet_sections = by_view_section.get(view_id, {})
        for section_id, published_section in view_sections.items():
            entry = sheet_sections.get(section_id)
            if entry is None:
                print(f"REFUSING: published section {view_id}.{section_id} is absent from the bundle", file=sys.stderr)
                return 2

            # REGISTRATION: STRUCTURAL_NODE (this section's own default_node_type, almost always
            # silent) -> VIEW (the sheet's) -> GLOBAL, resolved by the engine's own table-driven walk.
            sheet = next(s for s in bundle.view_sheets if s.id == view_id)
            node_type = resolve_registration_keys(
                {
                    ResolutionLevel.STRUCTURAL_NODE: {"default_node_type": entry.default_node_type},
                    ResolutionLevel.VIEW: {"default_node_type": sheet.default_node_type},
                    ResolutionLevel.GLOBAL: global_contribution,
                }
            ).fields["default_node_type"]

            # DEFAULTS: THE FALSIFIER AS WRITTEN, STRUCTURAL_NODE alone.
            section_defaults = dict(entry.section_defaults or {})
            resolved_defaults = ResolutionCascade().resolve(
                {ResolutionLevel.STRUCTURAL_NODE: section_defaults}
            ).fields

            sections.append(
                {
                    "view": view_id,
                    "section": section_id,
                    "nodeType": node_type,
                    "defaults": resolved_defaults or None,
                }
            )

    fixture = {
        "note": (
            "GENERATED by scripts/resolution-agreement.py from the engine's own "
            "qntm_md.resolution.cascade.ResolutionCascade and "
            "qntm_md.resolution.registration.resolve_registration_keys/resolve_base_node_type, "
            "over the operator's real config bundle (config only — no graph, no cycle, no "
            "state.db). Never hand-edit: regenerate. Covers every (view, section) pair the "
            "qualification declaration publishes."
        ),
        "global": {
            "defaultNodeType": reg.default_node_type,
            "baseNodeType": base_node_type,
            "inputGrammar": reg.input_grammar,
            "defaultTags": list(reg.default_tags),
        },
        "sections": sections,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(fixture, indent=2, default=str) + "\n")
    print(f"wrote {args.out}\n  {len(sections)} (view, section) pairs answered by the engine")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

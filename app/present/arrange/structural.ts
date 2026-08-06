/**
 * structural — reading the INGEST half of the presentation cascade: what a gesture MEANS, not how
 * a token is SHOWN. PURE: no DOM, no fetch, no clock.
 *
 * ── HOMED IN arrange/, ON PURPOSE, AGAINST ITS OWN "SITS BESIDE declaration.ts" FRAMING ──
 *
 * This file's own architecture (below) frames itself as `declaration.ts`'s INGEST-direction
 * mirror — a general pattern, not a verb assignment. What it actually PUBLISHES is edge
 * cardinality and direction per indent binding: the declared rule for what an indent gesture does
 * to the PARENT/CHILD relationship between two lines. That is docs/implementation-artifacts/
 * design-the-three-layers.md's ARRANGE question ("order and nest them; parent/child") stated as a
 * config reader rather than as a per-edit answer, so it is homed here rather than beside
 * `declaration.ts` in `express/`. Its current live consumer is `resolvers/promotion.ts` (the
 * RULES axis's graph-aware resolver, which turns an indent into a prospective edge) — a further
 * straddle, named rather than hidden: ARRANGE's own declaration is read by the RULES wire, not by
 * `ordering.ts` directly, because nothing has wired a VIEW/STRUCTURAL_NODE cascade level against
 * it yet (this file's own "WHY THIS IS NOT A CASCADE LEVEL" section, below, unchanged).
 *
 * `docs/implementation-artifacts/design-the-structural-language.md` is the brief. Its §7 draws the
 * line this module exists to encode in code rather than only in prose: rendition and structural
 * meaning are the same KIND of fact (both cascading resolutions, declared in config, read by a
 * resolver) separated by DIRECTION — rendition resolves on output, structural meaning resolves on
 * ingest. Gesture is neither; it is a mode, not a resolution (`motions.ts` produces no
 * `Contribution` and imports nothing). Two axes that mirror each other is why this module sits
 * beside `declaration.ts` rather than inside it, reading the SAME served document through a
 * separate, equally strict reader — one document, two grammars, exactly as `presentation.json`'s
 * own architecture already allows (§0.8: an unknown key is reported, not ignored).
 *
 * ── WHAT THIS MODULE DOES NOT DO, WHICH IS THE WHOLE POINT (§4, §11 OF THE DESIGN DOCUMENT) ──
 *
 * It does not decide what a keystroke means. It does not resolve a cursor position against a
 * section. It does not compute move-vs-add. Every one of those is a LOOKUP against the data this
 * module exposes, and the lookup is item 3's job (narration), not this one's. Building any of it
 * here would be a second interpreter of a language `StructuralTokenResolver` already interprets —
 * the failure mode §11 names outright and refuses. This module's whole job is: read the document,
 * validate its shape, say what was wrong with it, and hand back a plain lookup table.
 *
 * ── WHY THIS IS NOT A CASCADE LEVEL (`levels.ts`, `PresentationContext`) ──
 *
 * `PresentationContext` holds `Rendition` values only (`resolution.ts`'s closed `raw`/`wired`
 * dial) — a structural fact (an edge type, a cardinality, a direction) is not a `Rendition` and
 * does not belong in that type. It is also not YET a cascade the app resolves per line: the app
 * has no VIEW or STRUCTURAL_NODE level wired (`context.ts`'s own header — stage 7, gated on the
 * snapshot envelope carrying view/section identity), so there is nothing here to cascade AGAINST.
 * What is published is the flat table the design's §0.3 cascade would resolve against once a
 * caller knows which view and section a line is in — global default, plus the section overrides
 * for every section that declares one. Resolving "which section is this line in" is `boundary.ts`
 * and `instance.ts`'s territory (heading-crossing, section ordinals), not this module's.
 *
 * ── THE SHAPE, AND WHY IT IS THIS SMALL ──
 *
 * `structural.indent` — the GLOBAL default indent binding (`structural_tokens.yaml`'s
 * `positional_binding.indent`): which edge type an indent creates, and which end of it the tagged
 * line is. Absent (not `null` — the key can be left out) when the instance's config declares none,
 * which per the mutation in the design's §0.1 is a real, valid configuration ("indentation is not
 * structural at all") — the same silence-is-legal rule `declaration.ts` follows for a rendition.
 *
 * `structural.edgeCardinality` — cardinality per edge type, for EVERY edge type that appears
 * anywhere else in this document (the global indent's type, plus every section override's types).
 * Not the whole registry. §5 of the design names the reason this matters at all: cardinality is
 * what decides move-vs-add (`applier.py:2953-2961`), so an app that shows the language without it
 * could name the edge and still get the verb wrong. It is not validated against a closed set of
 * cardinality strings — `schema.yaml`'s cardinality vocabulary is the engine's to grow, and a
 * reader that hard-codes today's three values would report a legitimate new one as a problem it
 * is not.
 *
 * `structural.sections` — per-view, per-section overrides, keyed exactly as the config declares
 * them (`view id -> section id -> { edgeTypes, edgeDirection }`), and ONLY for sections that
 * declare one. A section that speaks no language of its own is absent from this map, which is
 * silence, which means "ask the global default" — the same `(False, None)` the engine's own
 * `_section_indent_binding` returns for an undeclared section. This is deliberately NOT the whole
 * vocabulary (`structural_tokens.yaml`'s wiki-link bindings, field bindings, chain buckets): the
 * design's §5 ranks narration (item 3) as needing exactly indent + cardinality + section overrides
 * to answer "what will `>` do here", and nothing else is wired to a reader yet, so nothing else is
 * shipped — an unread declaration is the bug this whole design exists to disprove (§0.8, quoting
 * `declaration.ts`'s own header).
 *
 * ── GENERATED, NOT HAND-WRITTEN (RANKED ITEM #1's OWN CONDITION) ──
 *
 * `scripts/generate-structural-declaration.mjs` produces the `structural` key of `presentation.json`
 * by reading the monorepo's `structural_tokens.yaml`, `schema.yaml` and `config/views/*.yaml`
 * directly — never by hand-transcription, which is exactly the mistake §3 catalogues for
 * `INDENT_UNIT` (one number, copied by hand, disagreeing with itself in two places and three stale
 * citations before anyone noticed). This reader does not care how the document was produced; it
 * validates what arrives, the same posture `declaration.ts` takes toward `presentation.json` as a
 * whole.
 */

/** The one end of a binding a tagged/indented line can be. Closed by the engine's own grammar —
 * `edge_source` is validated against this exact enum at bundle load (design doc §1). */
export type EdgeSource = "self" | "position";

/** Which way a section's declared edge is walked to find render children. Closed the same way. */
export type EdgeDirection = "incoming" | "outgoing";

/** The GLOBAL default: what an indent means when nothing more specific overrides it. */
export interface IndentBinding {
  readonly edgeType: string;
  readonly edgeSource: EdgeSource;
}

/** One section's declared structural language — present only when the section overrides. */
export interface SectionStructuralLanguage {
  readonly edgeTypes: readonly string[];
  readonly edgeDirection: EdgeDirection;
}

/** The whole of what was published: a lookup table, not a resolver. */
export interface StructuralLanguage {
  readonly indent: IndentBinding | undefined;
  readonly edgeCardinality: Readonly<Record<string, string>>;
  readonly sections: Readonly<Record<string, Readonly<Record<string, SectionStructuralLanguage>>>>;
  /**
   * EVERY DECLARATION THE GENERATOR READ AND DID NOT PUBLISH, `what -> why`. Not read to decide
   * anything — the app behaves identically with it present or absent. It is here so the
   * declaration states what it does NOT contain, which this generator previously did not: a
   * section declaring `structural_edge_types` with no `structural_edge_direction` was dropped
   * whole, and the app then used the global indent binding under a heading the operator had told
   * to do something else. See `scripts/ledger.mjs`.
   */
  readonly dropped: Readonly<Record<string, string>>;
}

/** What reading the structural declaration produced, mirroring `DeclarationReading`'s shape. */
export interface StructuralReading {
  readonly structural: StructuralLanguage;
  readonly problems: readonly string[];
}

/** The top-level key this module owns in the served document. `declaration.ts` knows its name
 * only to skip it — it is not a rendition key and is never validated there. */
export const STRUCTURAL_KEY = "structural";

const EDGE_SOURCES: readonly EdgeSource[] = ["self", "position"];
const EDGE_DIRECTIONS: readonly EdgeDirection[] = ["incoming", "outgoing"];
const STRUCTURAL_TOP_KEYS = ["indent", "edgeCardinality", "sections", "dropped"] as const;
const INDENT_KEYS = ["edgeType", "edgeSource"] as const;
const SECTION_LANGUAGE_KEYS = ["edgeTypes", "edgeDirection"] as const;

const EMPTY: StructuralLanguage = {
  indent: undefined,
  edgeCardinality: {},
  sections: {},
  dropped: {},
};

/** `what -> why`, validated the same way every other string map in this reader is. */
function readDropped(value: unknown, problems: string[]): Record<string, string> {
  if (!isPlainObject(value)) {
    problems.push(
      `'${STRUCTURAL_KEY}.dropped' is ${Array.isArray(value) ? "an array" : typeof value}, not ` +
        "an object — what the generator refused to publish stays unknown",
    );
    return {};
  }
  const out: Record<string, string> = {};
  for (const [what, why] of Object.entries(value)) {
    if (typeof why !== "string") {
      problems.push(
        `'${STRUCTURAL_KEY}.dropped.${what}' is ${Array.isArray(why) ? "an array" : typeof why}, ` +
          "not a reason",
      );
      continue;
    }
    out[what] = why;
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readIndent(value: unknown, problems: string[]): IndentBinding | undefined {
  if (!isPlainObject(value)) {
    problems.push(
      `'structural.indent' is ${Array.isArray(value) ? "an array" : typeof value}, not an ` +
        "object — the global indent binding stays unknown",
    );
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!(INDENT_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `'structural.indent.${key}' is not a recognised key and was NOT applied — the keys are ` +
          `${INDENT_KEYS.join(", ")}`,
      );
    }
  }
  const edgeType = value.edgeType;
  const edgeSource = value.edgeSource;
  let ok = true;
  if (typeof edgeType !== "string" || edgeType === "") {
    problems.push(
      `'structural.indent.edgeType' is ${JSON.stringify(edgeType)}, not a non-empty string`,
    );
    ok = false;
  }
  if (!(EDGE_SOURCES as readonly string[]).includes(edgeSource as string)) {
    problems.push(
      `'structural.indent.edgeSource' is ${JSON.stringify(edgeSource)}, which is not one of ` +
        `${EDGE_SOURCES.join(", ")}`,
    );
    ok = false;
  }
  if (!ok) {
    return undefined;
  }
  return { edgeType: edgeType as string, edgeSource: edgeSource as EdgeSource };
}

function readEdgeCardinality(value: unknown, problems: string[]): Record<string, string> {
  if (!isPlainObject(value)) {
    problems.push(
      `'structural.edgeCardinality' is ${Array.isArray(value) ? "an array" : typeof value}, ` +
        "not an object — every edge type's cardinality stays unknown",
    );
    return {};
  }
  const out: Record<string, string> = {};
  for (const [edgeType, cardinality] of Object.entries(value)) {
    if (typeof cardinality !== "string" || cardinality === "") {
      problems.push(
        `'structural.edgeCardinality.${edgeType}' is ${JSON.stringify(cardinality)}, not a ` +
          "non-empty string — that edge type's cardinality stays unknown",
      );
      continue;
    }
    out[edgeType] = cardinality;
  }
  return out;
}

function readSectionLanguage(
  path: string,
  value: unknown,
  problems: string[],
): SectionStructuralLanguage | undefined {
  if (!isPlainObject(value)) {
    problems.push(
      `'${path}' is ${Array.isArray(value) ? "an array" : typeof value}, not an object — this ` +
        "section's structural language stays unknown",
    );
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!(SECTION_LANGUAGE_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `'${path}.${key}' is not a recognised key and was NOT applied — the keys are ` +
          `${SECTION_LANGUAGE_KEYS.join(", ")}`,
      );
    }
  }
  const edgeTypes = value.edgeTypes;
  const edgeDirection = value.edgeDirection;
  let ok = true;
  if (
    !Array.isArray(edgeTypes) ||
    edgeTypes.length === 0 ||
    !edgeTypes.every((t) => typeof t === "string" && t !== "")
  ) {
    problems.push(
      `'${path}.edgeTypes' is ${JSON.stringify(edgeTypes)}, not a non-empty array of non-empty ` +
        "strings",
    );
    ok = false;
  }
  if (!(EDGE_DIRECTIONS as readonly string[]).includes(edgeDirection as string)) {
    problems.push(
      `'${path}.edgeDirection' is ${JSON.stringify(edgeDirection)}, which is not one of ` +
        `${EDGE_DIRECTIONS.join(", ")}`,
    );
    ok = false;
  }
  if (!ok) {
    return undefined;
  }
  return { edgeTypes: edgeTypes as readonly string[], edgeDirection: edgeDirection as EdgeDirection };
}

function readSections(
  value: unknown,
  problems: string[],
): Record<string, Record<string, SectionStructuralLanguage>> {
  if (!isPlainObject(value)) {
    problems.push(
      `'structural.sections' is ${Array.isArray(value) ? "an array" : typeof value}, not an ` +
        "object — every section override stays unknown",
    );
    return {};
  }
  const out: Record<string, Record<string, SectionStructuralLanguage>> = {};
  for (const [viewId, sectionsValue] of Object.entries(value)) {
    const path = `structural.sections.${viewId}`;
    if (!isPlainObject(sectionsValue)) {
      problems.push(
        `'${path}' is ${Array.isArray(sectionsValue) ? "an array" : typeof sectionsValue}, not ` +
          "an object — this view's section overrides stay unknown",
      );
      continue;
    }
    const sections: Record<string, SectionStructuralLanguage> = {};
    for (const [sectionId, languageValue] of Object.entries(sectionsValue)) {
      const language = readSectionLanguage(`${path}.${sectionId}`, languageValue, problems);
      if (language !== undefined) {
        sections[sectionId] = language;
      }
    }
    if (Object.keys(sections).length > 0) {
      out[viewId] = sections;
    }
  }
  return out;
}

/**
 * Read the `structural` key of a served presentation declaration.
 *
 * Accepts the SAME `unknown` document `readDeclaration` does, for the same reason: what arrives
 * here is `JSON.parse` of a file on a web server, the one input no type system upstream checked.
 *
 * A document with no `structural` key at all is silence, not a problem — the same rule
 * `declaration.ts` applies to every rendition key. A `structural` key that is the wrong SHAPE is
 * not silence; it is reported, and the sub-fact that could not be read falls back to "unknown"
 * (indent undefined, that edge type's cardinality absent, that section's language absent) rather
 * than aborting the whole read — one bad section must not blind the app to five good ones.
 */
export function readStructuralDeclaration(document: unknown): StructuralReading {
  if (!isPlainObject(document)) {
    return { structural: EMPTY, problems: [] }; // declaration.ts's own guard already reports this
  }
  if (!(STRUCTURAL_KEY in document)) {
    return { structural: EMPTY, problems: [] };
  }
  const raw = document[STRUCTURAL_KEY];
  const problems: string[] = [];
  if (!isPlainObject(raw)) {
    problems.push(
      `'${STRUCTURAL_KEY}' is ${Array.isArray(raw) ? "an array" : typeof raw}, not an object — ` +
        "the whole structural language stays unknown",
    );
    return { structural: EMPTY, problems };
  }
  for (const key of Object.keys(raw)) {
    if (!(STRUCTURAL_TOP_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `'${STRUCTURAL_KEY}.${key}' is not a recognised key and was NOT applied — the keys are ` +
          `${STRUCTURAL_TOP_KEYS.join(", ")}`,
      );
    }
  }
  const indent = "indent" in raw ? readIndent(raw.indent, problems) : undefined;
  const edgeCardinality =
    "edgeCardinality" in raw ? readEdgeCardinality(raw.edgeCardinality, problems) : {};
  const sections = "sections" in raw ? readSections(raw.sections, problems) : {};
  const dropped = "dropped" in raw ? readDropped(raw.dropped, problems) : {};
  return { structural: { indent, edgeCardinality, sections, dropped }, problems };
}

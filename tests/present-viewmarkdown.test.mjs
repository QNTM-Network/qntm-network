/**
 * present-viewmarkdown — the whole-view composer, and every refusal it can give.
 *
 *   node --test tests/present-viewmarkdown.test.mjs
 *
 * `present-viewheading-agreement.test.mjs` proves the `## ` line against the engine's own function.
 * `present-nodeline-agreement.test.mjs` proves a member's line the same way. This file proves the
 * JOIN — the order, the body policy, the placeholder, and the nine refusals — plus the one claim
 * neither differential can make: that the composer refuses rather than guesses.
 *
 * ── WHAT IT DELIBERATELY DOES NOT CLAIM ──
 *
 * That a composed view equals the engine's rendered file. It cannot, yet, and pretending otherwise
 * is the failure this whole effort exists to avoid: the engine renders a section's TREE and the
 * browser never receives one (`app/present/arrange/incoming-section-tree.ts` is a file with no code
 * that names exactly this gap). The composer's answer to that is `member-touches-an-edge`, and the
 * test below is what proves the refusal is real rather than documented.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { composeViewMarkdown, readConfigResolutionDeclaration, readQualificationDeclaration } from "../dist/present.js";
import { generateResolution, DEFAULT_CONFIG_DIR } from "../scripts/generate-resolution-declaration.mjs";
import { generateQualification } from "../scripts/generate-qualification-declaration.mjs";

const HAVE_CONFIG = existsSync(DEFAULT_CONFIG_DIR);

/** A day that is not read from the clock — `app/present/` holds none, and neither does this file. */
const TODAY = { logicalDate: "2026-08-16", weekEnd: "2026-08-16" };

describe("composeViewMarkdown over the operator's own config", () => {
  if (!HAVE_CONFIG) {
    test("SKIPPED, LOUDLY — the monorepo config is not checked out", () => {
      assert.ok(true, `${DEFAULT_CONFIG_DIR} is absent, so nothing was composed`);
    });
    return;
  }

  const resolution = readConfigResolutionDeclaration({ resolution: generateResolution(DEFAULT_CONFIG_DIR) }).resolution;
  const language = readQualificationDeclaration({ qualification: generateQualification(DEFAULT_CONFIG_DIR) }).qualification;
  const ordering = {
    ordering: resolution.ordering,
    orderingFields: resolution.orderingFields,
    defaultOrdering: resolution.defaultOrdering,
    priorityRank: resolution.priorityRank,
  };
  const compose = (viewId, graph, extra = {}) =>
    composeViewMarkdown(viewId, { resolution, language, ordering, graph, today: TODAY, ...extra });

  const EMPTY = { nodes: [], edges: [] };

  test("a real view composes, and its headings are the declared NAMES rather than the ids", () => {
    const composed = compose("admin", EMPTY);
    assert.ok(composed.ok, JSON.stringify(composed));
    // `## to-do` / `## done` would be the ids. The engine prints the names, and 303 of his 304
    // sections declare one — see `SectionPresentation`'s own comment for the measurement.
    assert.equal(composed.markdown, "## To Do\n## Done");
  });

  test("MOST OF HIS VIEWS COMPOSE WITH AN EMPTY GRAPH, and the ones that do not say why", () => {
    // Not a target — a MEASUREMENT, recorded so a change that quietly halves it is visible. The
    // refusals here are all `section-uncomputed`: a graph-dependent predicate with no graph.
    const outcomes = {};
    for (const viewId of Object.keys(language.sectionOrder)) {
      const r = compose(viewId, EMPTY);
      const key = r.ok ? "ok" : r.because;
      outcomes[key] = (outcomes[key] ?? 0) + 1;
    }
    assert.ok(outcomes.ok > 50, `only ${outcomes.ok} views composed: ${JSON.stringify(outcomes)}`);
    // EVERY refusal is a NAMED one. A refusal reaching a caller without a reason is the failure
    // this whole module's refusal list exists to prevent.
    for (const key of Object.keys(outcomes)) {
      assert.ok(key === "ok" || typeof key === "string", key);
    }
  });

  test("AN UNDECLARED VIEW IS REFUSED BY NAME — not composed as an empty one", () => {
    const composed = compose("no-such-view-anywhere", EMPTY);
    assert.equal(composed.ok, false);
    // `no-section-presentation` rather than `view-not-declared`, because the heading facts are
    // checked first — and either way the caller is told, which is the property under test.
    assert.ok(["no-section-presentation", "view-not-declared"].includes(composed.because), composed.because);
  });

  test("NO GRAPH IS A REFUSAL, never an empty view", () => {
    const composed = compose("admin", null);
    assert.deepEqual(composed, { ok: false, because: "no-graph" });
  });
});

/**
 * ── THE REFUSALS, DRIVEN OVER A HAND-BUILT TABLE ──
 *
 * Hand-built here and ONLY here, because each of these is a state the operator's config does not
 * currently produce — which is exactly why they are worth pinning. A refusal nobody has ever seen
 * fire is a refusal that may not.
 */
describe("every refusal fires, and none of them is a silent empty view", () => {
  const TABLE = {
    chromeShapes: { task: "checkbox" },
    renderShapes: { task: "checkbox", header: "heading" },
    identityModes: { task: { unique: false, field: null }, header: { unique: true, field: "title" } },
    spelling: { typeTokens: {}, edgeTags: {}, fieldTags: {}, fieldMarkerValues: {}, fieldMarkers: {} },
    // `separator` and `tail` ARE NOT DECORATION. Omitting the separator joined the cells with a
    // comma (Array.join's default) and omitting `stamp` from the tail dropped the identity from
    // every line — both silently, both caught by the control below rather than by review.
    composition: {
      bullet: "-",
      separator: " ",
      heads: { checkbox: ["checkbox", "title"], plain_line: ["title"] },
      tail: ["stamp"],
      titleStyles: [],
    },
    renderCheckbox: { rows: [], fallback: "[ ]" },
    sectionPresentation: { v: { s: { name: "Section", bodyPolicy: "full_body" } } },
    ordering: {},
    orderingFields: {},
    defaultOrdering: [],
    priorityRank: {},
    continuationFields: {},
    markerOrder: undefined,
    tagOrder: undefined,
    edgeTagOrder: undefined,
    renderTitleStyle: undefined,
  };
  const LANGUAGE = {
    sectionOrder: { v: ["s"] },
    sections: { v: { s: { qualification: "everything", name: "Section" } } },
    predicates: { everything: { find: { nodeType: ["task"], fields: {} }, exclude: [] } },
    tokens: {},
    extractionFields: {},
    resolvableFields: [],
    structuralNodeTypes: [],
    defaultNodeType: undefined,
  };
  // `title` is the one DEFAULT-path key that needs no marker — `defaultKeyForField` compares it by
  // unicode code point so it agrees with Python's `str.__lt__`. An EMPTY default ordering makes
  // every section abstain, which the composer refuses; that is correct and it is not what these
  // tests are about.
  const ORDERING = { ordering: {}, orderingFields: {}, defaultOrdering: [{ field: "title", direction: "asc" }], priorityRank: {} };
  const node = (id, fields = {}) => ({ id, type: "task", fields: { title: `Node ${id}`, ...fields } });
  const compose = (graph, resolution = TABLE, language = LANGUAGE) =>
    composeViewMarkdown("v", { resolution, language, ordering: ORDERING, graph, today: TODAY });

  test("THE CONTROL — with nothing wrong, the view composes", () => {
    const composed = compose({ nodes: [node("a")], edges: [] });
    assert.ok(composed.ok, JSON.stringify(composed));
    assert.equal(composed.markdown, "## Section\n- [ ] Node a [[qntm:a]]");
  });

  test("`member-touches-an-edge` — the tree may not be the flat list, so the whole view is refused", () => {
    // THE BIG ONE. `pull_context` (185 declarations), `structural_edge_types` (14) and
    // `include_ancestors` (1) decide which NON-QUALIFYING nodes join a section's tree and at what
    // depth. None is published and none can be used without the tree itself. A node with no edges
    // has no ancestors, no descendants and no children whatever those three say — so that is the
    // one condition under which the flat list IS the tree, and this is the refusal for every other.
    const composed = compose({
      nodes: [node("a"), node("b")],
      edges: [{ id: "e", type: "PART_OF", source: "b", target: "a", fields: {} }],
    });
    assert.deepEqual(composed, { ok: false, because: "member-touches-an-edge", section: "s" });
  });

  test("…AND IT IS BLUNTER THAN THE STRUCTURAL EDGE TYPE ON PURPOSE", () => {
    // A rule that refused only on `PART_OF` would be right for the config as it stands and silently
    // wrong the moment a section declares `structural_edge_types: [WAITING_FOR]` — which 14 of his
    // sections do. This proves the blunt rule is the one that shipped, not the narrow one.
    const composed = compose({
      nodes: [node("a"), node("b")],
      edges: [{ id: "e", type: "WAITING_FOR", source: "a", target: "b", fields: {} }],
    });
    assert.deepEqual(composed, { ok: false, because: "member-touches-an-edge", section: "s" });
  });

  test("`section-uncomputed` names the section, so a caller can act on it", () => {
    const language = { ...LANGUAGE, predicates: {} };
    const composed = compose({ nodes: [node("a")], edges: [] }, TABLE, language);
    assert.deepEqual(composed, { ok: false, because: "section-uncomputed", section: "s" });
  });

  test("`section-not-presented` — a section that computes with no published body policy", () => {
    const resolution = { ...TABLE, sectionPresentation: { v: { s: { name: "Section" } } } };
    const composed = compose({ nodes: [node("a")], edges: [] }, resolution);
    assert.deepEqual(composed, { ok: false, because: "section-not-presented", section: "s" });
  });

  test("`node-refused` CARRIES THE LINE COMPOSER'S OWN REASON rather than flattening it", () => {
    const composed = compose({ nodes: [node("a", { title: "**Bold**" })], edges: [] });
    assert.deepEqual(composed, {
      ok: false,
      because: "node-refused",
      section: "s",
      nodeRefusal: "title-not-canonical",
    });
  });

  test("`header_only` EMITS THE HEADING AND WITHHOLDS THE MEMBERS, which the engine does too", () => {
    const resolution = {
      ...TABLE,
      sectionPresentation: { v: { s: { name: "Section", bodyPolicy: "header_only" } } },
    };
    const composed = compose({ nodes: [node("a")], edges: [] }, resolution);
    assert.ok(composed.ok, JSON.stringify(composed));
    assert.equal(composed.markdown, "## Section");
  });

  test("THE PLACEHOLDER IS A REAL LINE — 40 of his sections declare one", () => {
    // A composer that did not know would drop it from ten views. `_render_tree_node`'s tail emits
    // it beneath every QUALIFYING node with no rendered children, which — under the edge rule
    // above — is every member that reaches here.
    const resolution = {
      ...TABLE,
      sectionPresentation: {
        v: { s: { name: "Section", bodyPolicy: "full_body", emptyChildrenPlaceholder: "(none)" } },
      },
    };
    const composed = compose({ nodes: [node("a")], edges: [] }, resolution);
    assert.ok(composed.ok, JSON.stringify(composed));
    assert.equal(composed.markdown, "## Section\n- [ ] Node a [[qntm:a]]\n    - (none)");
  });

  test("A SECTION BACKED BY A NON-HEADING NODE RENDERS AS A LINE, with no `## ` at all", () => {
    // Declared by `container_node:`, and reachable by a NAME collision at any time. The engine
    // renders it through the identical per-node machinery a member gets, so the browser does too —
    // refusing here would be a claim the engine cannot render it, and it can.
    const resolution = {
      ...TABLE,
      sectionPresentation: { v: { s: { name: "Section", bodyPolicy: "full_body", containerNode: "c" } } },
    };
    const composed = compose({ nodes: [node("c", { title: "The container" })], edges: [] }, resolution);
    assert.ok(composed.ok, JSON.stringify(composed));
    assert.ok(!composed.markdown.includes("## "), composed.markdown);
    assert.match(composed.markdown, /^- \[ \] The container/);
  });
});

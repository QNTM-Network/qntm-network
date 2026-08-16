/**
 * composeViewMarkdown — a whole view, rendered as the markdown the engine would print.
 *
 *   `render` (apps/qntm-md/src/qntm_md/render/renderer.py:538), from the browser.
 *
 * ── WHAT THIS IS FOR ──
 *
 * `computeViewMembers` answers WHAT is in a view. `composeNodeLine` answers what ONE member's line
 * says. Neither produces the string `app/index.html` paints, and the page reads
 * `snapshot.views[].markdown` in four places — the painter, the write base, the way-station the
 * held-projection path sets, and the staleness check. This is the join, and it exists so those four
 * can be moved together, as one decision, instead of one at a time.
 *
 * PURE, like both halves it joins. Graph in, string out, no DOM and no clock of its own.
 *
 * ── THE VIEW IS `"\n".join(lines)`, AND THERE IS NOTHING BETWEEN THE SECTIONS ──
 *
 * No title line, no blank line, no trailing newline. The engine appends a `## ` line per section
 * and then that section's body lines, walks to the next section, and joins at the end. A composer
 * that inserted a readable blank line between sections would differ from the engine on every view
 * that has two sections, which is all of them.
 *
 * ── THE HEADING IS THREE BRANCHES AND THEY ARE NOT THE ONES THE NAME SUGGESTS ──
 *
 * `ViewRegistration.section_heading` is the single source of truth:
 *
 *   1. the PINNED container node's own `title` (+`[[qntm:N]]` stamp), when `container_node` names a
 *      node that resolves and carries a title;
 *   2. otherwise the DECLARED NAME, `name.strip()`, CLEAN — no count, no stamp;
 *   3. otherwise `compose_section_header`: `{id} ({count})`, or bare `{id}` when the count is zero,
 *      or `{id}: {headerValue}` when a `header_value` resolves off the first member.
 *
 * So a section that declares a name NEVER carries a count. That is the fact 303 of the operator's
 * 304 sections turn on, and getting it wrong is `## to-do (5)` against the engine's `## To Do`.
 *
 * THE MARKER SUFFIX RESOLVES DIFFERENTLY FROM THE TITLE, AND THE ASYMMETRY IS REAL.
 * `section_heading` resolves the node BY ID ONLY. `_container_heading_marker_suffix` resolves it
 * through `heading_node`, which falls back to an unscoped WHOLE-GRAPH TITLE LOOKUP over
 * unique-identity types. A section whose `name` matches a `header` node's title therefore takes its
 * MARKERS from that node while taking its TEXT from the declaration. Both are mirrored here.
 *
 * AND A MATCHED NODE WHOSE RENDER SHAPE IS NOT `heading` DELETES THE `## ` LINE ENTIRELY — the
 * section renders as that node's own body line at depth 0 instead. The engine logs
 * `section_heading_suppressed_by_by_name_node` and renders it anyway.
 *
 * ── WHAT IT REFUSES, AND WHY THE BIGGEST REFUSAL IS THE HONEST ONE ──
 *
 * The engine does not render a section's MEMBERS. It renders a section's TREE — qualifying members
 * plus whichever non-qualifying ancestors or descendants `include_ancestors`/`pull_context`/
 * `structural_edge_types` pull in, each at its own depth. That tree is built by
 * `section_builder.build` and discarded before markdown ships; the browser never receives it. This
 * is not a new discovery — `app/present/arrange/incoming-section-tree.ts` is a file with no code in
 * it that exists to name exactly this seam.
 *
 * So there is one condition under which a flat member list IS the tree: NO MEMBER OF THE VIEW MAY
 * TOUCH A RELEVANT EDGE, in either direction. A node with no relevant edges has no ancestors to
 * pull, no descendants to pull, and no children — because `_resolve_nesting`'s `pull_context`
 * walks the identical edge-type set `render_children`/`render_parents` does (`section_builder.py`:
 * one `edges` variable, three lambdas), never an independent one. So "relevant" is answerable, and
 * a section that has none stays on the flat path below, unconditionally, whether or not a real
 * tree is also available.
 *
 * WHICH EDGES ARE RELEVANT IS ITSELF CONFIG, NOT A GUESS AND NOT HARDCODED TO `PART_OF`
 * (structural-edges-resolve-from-declared-config, 2026-08-16). A section that declares
 * `structural_edge_types` (14 of his sections do — `WAITING_FOR` among them) is scoped to exactly
 * those, off `ComposeViewContext.structural.sections[view][section].edgeTypes`. A section that
 * declares none falls to the ENGINE'S OWN default hierarchy walk — every edge type whose schema
 * `direction` is `child_to_parent`/`parent_to_child` — off the unnarrowed `structural.
 * edgeDirectionRegistry` (`compile-structural.mjs`'s own comment on that key says why it is
 * `direction`, never `cardinality`, and why unnarrowed). `context.structural` absent (today's default
 * everywhere this isn't wired yet) keeps the OLD blunt rule exactly as it was: every edge type of
 * any kind counts as relevant, never a false narrowing from an unknown answer.
 *
 * A SECTION THAT DOES TOUCH A RELEVANT EDGE IS NOT AUTOMATICALLY REFUSED ANY MORE (section-trees-
 * have-a-persisted-home, 2026-08-16). `GET /graph?include_structure=true` publishes the SAME tree
 * `section_builder.build()` computed and the renderer walked — `roots`, `children`,
 * `is_qualifying` — and when the caller passes one for this section on `ComposeViewContext.
 * sectionTrees`, THAT is walked instead: every tree node composes a line, qualifying or not, at its
 * own depth, mirroring `renderer.py`'s `_render_tree_node`. `member-touches-an-edge` now means only
 * "a member touches a relevant edge and the caller held no tree for it" — the honest answer while
 * the flag that fetches `include_structure` stays off, or for a section too new to have one.
 *
 * THE CHROME CELL STILL NEVER RUNS THROUGH EITHER PATH — that is a named gap, not an oversight.
 *
 *   `view-not-declared`           `computeViewMembers` does not know this view
 *   `no-section-presentation`     no heading facts for it — every `## ` line would be a guess
 *   `no-graph`                    the edge check cannot run, so nesting cannot be ruled out
 *   `section-uncomputed`          membership itself was unresolvable for one section
 *   `section-order-abstained`     the members are real and their ORDER is not
 *   `section-undecided-member`    the graph could not answer for a node; it is not a non-member
 *   `section-not-presented`       a section computed with no heading facts published for it
 *   `render-shape-unpublished`    a node backs this heading and its render shape is not on the wire
 *   `member-touches-an-edge`      a member touches an edge and no real tree was held for this section
 *   `section-tree-node-unresolved` a held tree names a node this graph snapshot does not have
 *   `node-refused`                `composeNodeLine` refused a member, for its own stated reason
 *
 * EVERY REFUSAL NAMES ITS SECTION. A caller reporting "this view could not be composed" without
 * saying which section is a caller that cannot act on the answer.
 *
 * ── THE REFUSAL IS PER VIEW, NEVER PER LINE, AND THAT IS A WRITE-PATH RULE ──
 *
 * `app/index.html:2133` takes the write BASE from the same string the painter walked, and the
 * comment at `:2148` states the property that keeps the stale-write detector honest: neither base
 * site "can pass a string this app computed". A view composed for two sections and inherited from
 * the engine for a third is a string this app computed, and it would become the base of the next
 * save. So the answer is the whole view or none of it.
 */

import type {
  ConfigResolutionTable,
  SectionPresentation,
} from "../resolutiontable.js";
import type { GraphNode, GraphSnapshot } from "../graphmatch.js";
import { resolvedQntmId } from "../graphmatch.js";
import type { StructuralLanguage } from "../arrange/structural.js";
import type { QualificationLanguage } from "../select/qualification.js";
import type { OrderingLanguage, ViewSection } from "../select/viewmembers.js";
import { computeViewMembers } from "../select/viewmembers.js";
import type { TodayAnswer } from "../today.js";
import { composeNodeLine, markerCells } from "./nodeline.js";
import type { ComposeRefusal } from "./nodeline.js";

/** A tree node as `GET /graph?include_structure=true` actually carries it —
 * `section_builder.serialize_section_tree`'s wire shape. No `fields`: a caller resolves them off
 * the graph snapshot it already holds (this module's own docstring says why the wire form omits
 * them), so every consumer here re-resolves by `node_id` rather than trusting a second copy. */
export interface SectionTreeNodeWire {
  readonly node_id: string;
  readonly node_type: string;
  readonly is_qualifying: boolean;
  readonly children: readonly SectionTreeNodeWire[];
}

/** `GET /graph?include_structure=true`'s per-section entry — `{section_id, roots}`, unchanged
 * from `section_builder.serialize_section_tree`'s own shape. */
export interface SectionTreeWire {
  readonly section_id: string;
  readonly roots: readonly SectionTreeNodeWire[];
}

export interface ComposeViewContext {
  readonly resolution: ConfigResolutionTable;
  readonly language: QualificationLanguage;
  readonly ordering: OrderingLanguage;
  /** `null` is honest and refusable — a brand-new account's snapshot genuinely has no graph. */
  readonly graph: GraphSnapshot | null;
  readonly today?: TodayAnswer;
  /** Stated, not assumed — the same input `composeNodeLine` takes, for the same reason. */
  readonly writePolicy?: "writable" | "read_only";
  /**
   * `GET /graph?include_structure=true`'s `sections` key for THIS view, keyed by section id.
   * `undefined` when the caller never asked — today's default, and nothing below changes for it.
   * `{}` when the caller asked and the engine has published nothing for this view yet.
   *
   * ONLY CONSULTED WHEN A MEMBER TOUCHES AN EDGE. A section with no edges never reads this key —
   * `section.members` already IS its tree, and the flat path stays exactly as proven. This key
   * answers the one question the flat list cannot: how a touched section actually nests.
   */
  readonly sectionTrees?: Readonly<Record<string, SectionTreeWire>>;
  /**
   * `structural-edges-resolve-from-declared-config` (2026-08-16) — narrows WHICH edge touching a
   * member actually means "this section might nest", instead of any edge of any type anywhere in
   * the graph. `undefined` (the default) keeps the old blunt rule exactly as it was: every edge
   * type counts. See `relevantEdgeTypes`, below, for what this unlocks and what it still cannot.
   */
  readonly structural?: StructuralLanguage;
}

export type ComposeViewRefusal =
  | "view-not-declared"
  | "no-section-presentation"
  | "no-graph"
  | "section-uncomputed"
  | "section-order-abstained"
  | "section-undecided-member"
  | "section-not-presented"
  | "render-shape-unpublished"
  | "member-touches-an-edge"
  | "section-tree-node-unresolved"
  | "node-refused";

export type ComposeViewResult =
  | { readonly ok: true; readonly markdown: string }
  | {
      readonly ok: false;
      readonly because: ComposeViewRefusal;
      /** The section the refusal is about, or `undefined` when it is about the view. */
      readonly section?: string;
      /** `composeNodeLine`'s own reason, carried through rather than flattened away. */
      readonly nodeRefusal?: ComposeRefusal;
    };

/** `_count_suffix_header` — bare id at zero, `{id} ({count})` above it. */
function countSuffixHeader(sectionId: string, count: number): string {
  return count === 0 ? sectionId : `${sectionId} (${count})`;
}

/**
 * `_resolve_header_field_value` — `$current.<field>` reads off the FIRST qualifying node; anything
 * else is returned verbatim so the header composes `{id}: {the literal reference}`.
 */
const CURRENT_FIELD_PREFIX = "$current.";
function resolveHeaderFieldValue(ref: string, node: GraphNode): string | null {
  if (!ref.startsWith(CURRENT_FIELD_PREFIX)) return ref;
  const value = node.fields[ref.slice(CURRENT_FIELD_PREFIX.length)];
  return value === undefined || value === null ? null : String(value);
}

/** `compose_section_header` — the third branch, reached only when no name and no pinned node. */
function composeSectionHeader(
  sectionId: string,
  headerValue: string | undefined,
  members: readonly GraphNode[],
): string {
  const count = members.length;
  if (headerValue === undefined || members.length === 0) return countSuffixHeader(sectionId, count);
  const resolved = resolveHeaderFieldValue(headerValue, members[0] as GraphNode);
  // THE GUARD IS THE ENGINE'S OWN AND IT IS PRESERVED VERBATIM: an empty, blank or multi-line value
  // falls back to the count suffix rather than emitting a heading with a newline in it.
  if (resolved === null || resolved.trim() === "" || resolved.includes("\n") || resolved.includes("\r")) {
    return countSuffixHeader(sectionId, count);
  }
  return `${sectionId}: ${resolved}`;
}

/** `_identity_membership_node` — `container_node` resolved by `qntm_id` first, then by raw id. */
function pinnedContainerNode(
  containerNode: string | undefined,
  graph: GraphSnapshot,
): GraphNode | undefined {
  if (containerNode === undefined) return undefined;
  return (
    graph.nodes.find((n) => resolvedQntmId(n) === containerNode) ??
    graph.nodes.find((n) => n.id === containerNode)
  );
}

/**
 * `heading_node_with_pathway` — the pinned node, else the FIRST unique-identity node anywhere in
 * the graph whose title is exactly the declared name.
 *
 * `is_unique_name_node_type` reads the schema's `identity.unique` flag, which is precisely what
 * `resolution.identityModes[type].unique` publishes. No `type === "header"` branch here either.
 */
function headingNode(
  presentation: SectionPresentation,
  resolution: ConfigResolutionTable,
  graph: GraphSnapshot,
): GraphNode | undefined {
  const pinned = pinnedContainerNode(presentation.containerNode, graph);
  if (pinned !== undefined) return pinned;
  const name = presentation.name?.trim();
  if (name === undefined || name === "") return undefined;
  return graph.nodes.find(
    (n) => resolution.identityModes?.[n.type]?.unique === true && String(n.fields.title ?? "").trim() === name,
  );
}

/** `'    ' * depth` — the same four spaces `composeNodeLine` indents by. */
function indent(depth: number): string {
  return "    ".repeat(Math.max(0, depth));
}

/** What `composeSectionHeading` answers when it cannot produce a `## ` line. */
export type SectionHeadingResult =
  /** The `## ` line's TEXT — without the `## ` prefix, which the view assembly adds. */
  | { readonly kind: "heading"; readonly text: string }
  /** A node backs this section and does not render as a heading, so there is no `## ` line at all. */
  | { readonly kind: "node-line"; readonly node: GraphNode }
  /** The backing node's render shape is not on the wire, so which of the two above is unknown. */
  | { readonly kind: "refused"; readonly because: "render-shape-unpublished" };

/**
 * ONE SECTION'S HEADING, or the reason there is not one — `ViewRegistration.section_heading` plus
 * `_container_heading_marker_suffix`, which are two different resolutions of the same node.
 *
 * EXPORTED SO IT CAN BE PINNED ON ITS OWN. Its branch ORDER is the fact this whole key exists for,
 * and it is the fact I stated wrongly twice before measuring it — `scripts/viewheading-agreement.py`
 * drives the engine's own `section_heading` over the same grid and the companion `.test.mjs` drives
 * this. A heading composed inside `composeViewMarkdown` and never compared to anything would be a
 * green measuring nothing.
 */
export function composeSectionHeading(
  sectionId: string,
  presentation: SectionPresentation,
  members: readonly GraphNode[],
  resolution: ConfigResolutionTable,
  graph: GraphSnapshot,
  writePolicy?: "writable" | "read_only",
): SectionHeadingResult {
  const backing = headingNode(presentation, resolution, graph);
  // `renderShapes`, NEVER `chromeShapes` — the latter drops `heading` on purpose, and in it an
  // absent entry means `heading`, `stat_line` and "no such type" at once. The first keeps this
  // section's `## ` line and the others delete it, so the seedable subset cannot be asked.
  if (backing !== undefined) {
    const shape = resolution.renderShapes?.[backing.type];
    if (shape === undefined) return { kind: "refused", because: "render-shape-unpublished" };
    if (shape !== "heading") return { kind: "node-line", node: backing };
  }

  // THE TEXT. Branch one asks for the PINNED node, never the by-name match — which is why
  // `pinnedContainerNode` is called again here rather than reusing `backing`.
  const pinned = pinnedContainerNode(presentation.containerNode, graph);
  const pinnedTitle = pinned === undefined ? "" : String(pinned.fields.title ?? "").trim();
  let text: string;
  if (pinned !== undefined && pinnedTitle !== "") {
    // ── A PINNED HEADING STAMPS EVEN WHEN ITS TYPE IS UNIQUE-IDENTITY, AND THAT IS NOT A SLIP ──
    //
    // `composeNodeLine` suppresses the stamp for a unique-identity type, because a body line's
    // identity IS its name. THIS branch does not, and the first version of this function copied the
    // body rule here and was wrong — `viewheading-agreement.py`'s very first run caught it on a
    // `header` pin, which is unique-identity and stamped anyway.
    //
    // `_container_heading_stamp` passes `consult_identity_mode=False` to `decide_stamp` and its
    // docstring says why: a pinned container's stamp is the `#filter:` directive's OWN rebind
    // mechanism, orthogonal to the node's identity mode. The unique-identity type's stampless form
    // arrives by the BY-NAME branch below, which never reaches `decide_stamp` at all. Two
    // mechanisms, deliberately, and reading only one of them is how this got copied wrong.
    const resolved = resolvedQntmId(pinned);
    const stamp = writePolicy === "read_only" || resolved === "" ? "" : `[[qntm:${resolved}]]`;
    text = stamp === "" ? pinnedTitle : `${pinnedTitle} ${stamp}`;
  } else if (presentation.name !== undefined && presentation.name.trim() !== "") {
    text = presentation.name.trim();
  } else {
    text = composeSectionHeader(sectionId, presentation.headerValue, members);
  }
  // AND THE MARKERS OF WHICHEVER NODE BACKS IT, by id OR by name — a different resolution from the
  // text above, and not a mistake. See this module's header.
  const cells = backing === undefined ? [] : markerCells(backing, resolution, resolution.markerOrder);
  return { kind: "heading", text: cells.length === 0 ? text : `${text} ${cells.join(" ")}` };
}

/** The two cardinalities `qntm_graph`'s own `children`/`parents` treat as hierarchy when no
 * `edge_type` filter is given — `core/graph/src/qntm_graph/core/traversal.py`'s own rule,
 * mirrored here rather than re-derived from behaviour. */
const HIERARCHY_DIRECTIONS: ReadonlySet<string> = new Set(["child_to_parent", "parent_to_child"]);

/**
 * Which edge types could possibly nest a member of THIS section — declared `structural_edge_types`
 * when the section names one, else the schema's own default hierarchy walk: every edge type whose
 * `direction` is `child_to_parent`/`parent_to_child`, general for any config (see
 * `compile-structural.mjs`'s own comment on `edgeDirectionRegistry` for why the UNNARROWED
 * registry, not `edgeCardinality`, is what answers the "nothing declared" case — and why it is
 * `direction`, never `cardinality`, that answers it).
 *
 * `undefined` means UNKNOWN, never "none". A caller with no answer must stay blunt — treat every
 * edge type as possibly relevant — not read an inability to narrow as permission to narrow to
 * nothing.
 */
function relevantEdgeTypes(
  viewId: string,
  sectionId: string,
  structural: StructuralLanguage | undefined,
): ReadonlySet<string> | undefined {
  const declared = structural?.sections?.[viewId]?.[sectionId]?.edgeTypes;
  if (declared !== undefined) return new Set(declared);
  const registry = structural?.edgeDirectionRegistry;
  if (registry === undefined || Object.keys(registry).length === 0) return undefined;
  const hierarchy = new Set<string>();
  for (const [edgeType, direction] of Object.entries(registry)) {
    if (HIERARCHY_DIRECTIONS.has(direction)) hierarchy.add(edgeType);
  }
  return hierarchy;
}

/** Union of `touchedByType`'s sets over `types` — the node ids touched by an edge of any of
 * THOSE types alone, not every edge in the graph. */
function touchedIdsForTypes(
  touchedByType: ReadonlyMap<string, ReadonlySet<string>>,
  types: ReadonlySet<string>,
): ReadonlySet<string> {
  const out = new Set<string>();
  for (const type of types) {
    const ids = touchedByType.get(type);
    if (ids === undefined) continue;
    for (const id of ids) out.add(id);
  }
  return out;
}

type TreeWalkResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly because: "section-tree-node-unresolved" }
  | { readonly ok: false; readonly because: "node-refused"; readonly nodeRefusal: ComposeRefusal };

/**
 * Walk a real section tree and compose every node's line, appending to `lines` — mirroring
 * `renderer.py`'s `_render_tree_node`: a node's own line, then its children at `depth + 1`, then a
 * placeholder ONLY for a qualifying node with none.
 *
 * EVERY TREE NODE COMPOSES, QUALIFYING OR NOT. A context node the engine pulled in via
 * `include_ancestors`/`pull_context` renders exactly like a qualifying one — the tree names which
 * nodes EARNED the placeholder, not which nodes to skip.
 */
function composeSectionTreeLines(
  roots: readonly SectionTreeNodeWire[],
  depth: number,
  graph: GraphSnapshot,
  resolution: ConfigResolutionTable,
  placeholder: string | undefined,
  writePolicy: "writable" | "read_only" | undefined,
  lines: string[],
): TreeWalkResult {
  for (const treeNode of roots) {
    const graphNode = graph.nodes.find((n) => n.id === treeNode.node_id);
    if (graphNode === undefined) {
      return { ok: false, because: "section-tree-node-unresolved" };
    }
    const line = composeNodeLine(graphNode, {
      resolution,
      ...(writePolicy === undefined ? {} : { writePolicy }),
      depth,
    });
    if (!line.ok) {
      return { ok: false, because: "node-refused", nodeRefusal: line.because };
    }
    lines.push(line.line.text, ...line.line.continuationLines);
    if (treeNode.children.length > 0) {
      const nested = composeSectionTreeLines(
        treeNode.children,
        depth + 1,
        graph,
        resolution,
        placeholder,
        writePolicy,
        lines,
      );
      if (!nested.ok) return nested;
    } else if (treeNode.is_qualifying && placeholder !== undefined) {
      lines.push(`${indent(depth + 1)}- ${placeholder}`);
    }
  }
  return { ok: true };
}

/**
 * Compose one view's whole markdown, or refuse it. See this module's header for the branches and
 * the refusals.
 */
export function composeViewMarkdown(viewId: string, context: ComposeViewContext): ComposeViewResult {
  const { resolution, graph } = context;
  const presented = resolution.sectionPresentation?.[viewId];
  if (presented === undefined) return { ok: false, because: "no-section-presentation" };
  if (graph === null) return { ok: false, because: "no-graph" };

  const computed = computeViewMembers(viewId, graph.nodes, context.language, context.ordering, {
    graph,
    ...(context.today === undefined ? {} : { today: context.today }),
  });
  if (computed === undefined) return { ok: false, because: "view-not-declared" };
  const firstUncomputed = computed.uncomputed[0];
  if (firstUncomputed !== undefined) {
    return { ok: false, because: "section-uncomputed", section: firstUncomputed.sectionId };
  }

  // ── THE NESTING CHECK, ONCE, OVER THE WHOLE VIEW ──
  //
  // Built as a set of endpoint ids rather than a scan per member: a view with 200 members over a
  // graph with 3,000 edges would otherwise be 600,000 comparisons on every repaint.
  //
  // TWO SHAPES, ONE PASS. `touched` is the blunt answer (every edge type) and stays the fallback
  // when `relevantEdgeTypes` cannot narrow. `touchedByType` is keyed so a section CAN narrow to
  // only the edge types that could actually nest it, when `context.structural` says which those
  // are — see `relevantEdgeTypes`, below.
  const touched = new Set<string>();
  const touchedByType = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    touched.add(edge.source);
    touched.add(edge.target);
    let byType = touchedByType.get(edge.type);
    if (byType === undefined) {
      byType = new Set<string>();
      touchedByType.set(edge.type, byType);
    }
    byType.add(edge.source);
    byType.add(edge.target);
  }

  const lines: string[] = [];
  for (const section of computed.sections as readonly ViewSection[]) {
    const presentation = presented[section.sectionId];
    // A SECTION THAT COMPUTED WITH NO PUBLISHED HEADING FACTS. Not the same as `no-section-
    // presentation`: the view is published and this one section is missing from it, which means the
    // generator dropped it for a reason of its own. Synthesising `## {id}` over that is the exact
    // guess this key was added to stop.
    if (presentation === undefined) {
      return { ok: false, because: "section-not-presented", section: section.sectionId };
    }
    if (!section.ordered) {
      return { ok: false, because: "section-order-abstained", section: section.sectionId };
    }
    if (section.undecided.length > 0) {
      return { ok: false, because: "section-undecided-member", section: section.sectionId };
    }

    const heading = composeSectionHeading(
      section.sectionId,
      presentation,
      section.members,
      resolution,
      graph,
      context.writePolicy,
    );
    if (heading.kind === "refused") {
      return { ok: false, because: heading.because, section: section.sectionId };
    }
    if (heading.kind === "node-line") {
      // THE SECTION EMITS NO `## ` LINE AT ALL — the backing node renders as its own body line at
      // depth 0, through the identical machinery a member gets. Composed rather than refused,
      // because refusing would be a claim that the engine cannot render it, and the engine does.
      const line = composeNodeLine(heading.node, {
        resolution,
        ...(context.writePolicy === undefined ? {} : { writePolicy: context.writePolicy }),
      });
      if (!line.ok) {
        return { ok: false, because: "node-refused", section: section.sectionId, nodeRefusal: line.because };
      }
      lines.push(line.line.text, ...line.line.continuationLines);
    } else {
      lines.push(`## ${heading.text}`);
    }

    // `header_only` EMITS THE HEADING AND STOPS. The members are real and the engine withholds them.
    if (presentation.bodyPolicy !== "full_body") {
      // AN UNPUBLISHED POLICY IS NOT `header_only` EITHER — DROP PATH 24 leaves the key off when it
      // cannot tell, and both answers are visibly wrong, so the section is refused rather than
      // silently emptied.
      if (presentation.bodyPolicy === undefined) {
        return { ok: false, because: "section-not-presented", section: section.sectionId };
      }
      continue;
    }

    const relevant = relevantEdgeTypes(viewId, section.sectionId, context.structural);
    const sectionTouched = relevant === undefined ? touched : touchedIdsForTypes(touchedByType, relevant);
    const sectionTouchesAnEdge = section.members.some((member) => sectionTouched.has(member.id));
    if (sectionTouchesAnEdge) {
      const tree = context.sectionTrees?.[section.sectionId];
      if (tree === undefined) {
        return { ok: false, because: "member-touches-an-edge", section: section.sectionId };
      }
      const walked = composeSectionTreeLines(
        tree.roots,
        0,
        graph,
        resolution,
        presentation.emptyChildrenPlaceholder,
        context.writePolicy,
        lines,
      );
      if (!walked.ok) {
        return walked.because === "node-refused"
          ? { ok: false, because: "node-refused", section: section.sectionId, nodeRefusal: walked.nodeRefusal }
          : { ok: false, because: walked.because, section: section.sectionId };
      }
      continue;
    }

    for (const member of section.members) {
      const line = composeNodeLine(member, {
        resolution,
        ...(context.writePolicy === undefined ? {} : { writePolicy: context.writePolicy }),
      });
      if (!line.ok) {
        return { ok: false, because: "node-refused", section: section.sectionId, nodeRefusal: line.because };
      }
      lines.push(line.line.text, ...line.line.continuationLines);
      // THE PLACEHOLDER. Every member reaching here is qualifying and childless — the edge check
      // above guarantees the second half — so a declared placeholder follows every one of them.
      if (presentation.emptyChildrenPlaceholder !== undefined) {
        lines.push(`${indent(1)}- ${presentation.emptyChildrenPlaceholder}`);
      }
    }
  }

  return { ok: true, markdown: lines.join("\n") };
}

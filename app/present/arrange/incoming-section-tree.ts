/**
 * incoming-section-tree — THE NAMED SEAM, NOT YET BUILT, for the day the browser receives
 * post-ARRANGE structure instead of inverting it from markdown.
 *
 * This file has no code. It exists so a reader looking for "where does the published tree land"
 * finds an answer immediately, in `arrange/`, rather than rediscovering the gap by reading
 * `ordering.ts` end to end. Per the brief this file was written under: name the seam, do not
 * build it — monorepo PR #70 is open, unmerged, and its shape may still change.
 *
 * ── WHAT WILL ARRIVE, AND FROM WHERE ──
 *
 * The engine already computes the ARRANGE answer once per section, every cycle, and discards it
 * before markdown ships. `apps/qntm-md/src/qntm_md/render/section_builder.py`:
 *
 *   @dataclass(frozen=True, slots=True)
 *   class SectionTreeNode:
 *       node: qntm_graph.Node
 *       is_qualifying: bool
 *       children: tuple["SectionTreeNode", ...]
 *       placement_line_number: int | None = None
 *
 *   @dataclass(frozen=True, slots=True)
 *   class SectionTree:
 *       section_id: str
 *       roots: tuple[SectionTreeNode, ...]
 *
 * built by `section_builder.build(section, qualifying_nodes, graph, ...) -> SectionTree` — SELECT's
 * output (`qualifying_nodes`) and the graph go in, a tree comes out. Monorepo PR #70 (open, not
 * checked out or edited by this branch) publishes that tree onto the wire the browser reads,
 * through whichever transport it lands on (the scoped-node wire named in design-the-three-
 * layers.md §8 row 1/§12 row 1 — an HTTP route, a widened envelope field, or something else; that
 * document leaves the transport open on purpose).
 *
 * ── WHAT IT REPLACES OR SIMPLIFIES, NAMED SO THE FUTURE EDIT HAS A TARGET ──
 *
 *   1. `arrange/ordering.ts`'s `parentLineOf` — this browser's own hand-rolled reconstruction of
 *      parent boundaries from printed indentation, built specifically because `SectionTreeNode`'s
 *      shape was invisible to the browser (see that function's own header, and `ordering.ts`'s
 *      own measurement 2). Once `SectionTreeNode.children` arrives already built, `parentLineOf`
 *      has nothing left to reconstruct.
 *   2. `arrange/orderingqualify.ts`'s `qualifyingClassifierFor`/`publishedQualifierFor` — the
 *      one-hop-graph-plus-heuristic stand-in for `SectionTreeNode.is_qualifying`, built for
 *      exactly the same reason. Once the real field arrives, this module's job shrinks to reading
 *      it rather than inferring it.
 *
 * ── WHAT THIS FILE DOES NOT DO ──
 *
 * It does not define a type for `SectionTree`/`SectionTreeNode` on the browser side — PR #70 is
 * unmerged and its wire shape (field names, whether `node` serialises as an id or an inline
 * object, whether `placement_line_number` ships at all) is not this branch's to guess at. Defining
 * a shape here would be exactly the "declaration that exists and does not reach" failure mode
 * `declaration.ts`'s own header names as this system's highest-frequency bug, aimed at a document
 * that does not exist yet.
 */

export {};

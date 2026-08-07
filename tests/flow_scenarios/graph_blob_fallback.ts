/**
 * graph_blob_fallback — the pinned capability
 * `graph-envelope-composition-separates-blob-from-view-markdown` (monorepo
 * docs/architecture/capabilities.yaml) descends here: the app-repo half of splitting the
 * ~741 KB `graph` blob out of `GET /app/graph`'s default response
 * (graph-blob-served-separately-with-its-own-conditional-request, monorepo capabilities.yaml,
 * 2026-08-07).
 *
 * Run by flow-trace's node observer (`flow-trace verify .`). Not picked up by `npm test`, which
 * globs `tests/**\/*.test.mjs`.
 *
 * ── THE BRIEF THIS SCENARIO ANSWERS ──
 *
 * `GET /app/graph` no longer carries `graph` by default (the split happened server-side). Three
 * app-repo call sites read the graph on every commit — `app/present/resolve.ts`'s
 * `graphSnapshotOf`, `resolvers/promotion.ts`, `resolvers/ordering.ts` — reached through ONE
 * function, `graphSnapshotOf`, which now has TWO possible sources: `graphData.snapshot.graph`
 * (the pre-existing D1-fallback shape, still inline for a non-operator session) and a
 * separately-fetched `blob` (the new `GET /app/graph/blob` cache, `app/index.html`'s
 * `refreshGraphBlob`). This scenario drives `graphSnapshotOf` itself — the one piece of this
 * split that lives inside `.flow-trace.yaml`'s capture filter (`app/`) — through its real
 * decision surface.
 *
 * ── THE FALSIFIABLE CLAIMS ──
 *
 * 1. `graphData.snapshot.graph`, WHEN PRESENT, WINS — the D1-fallback path (a non-operator
 *    session, or a Fly-server response from before this split) must be unaffected by the new
 *    parameter existing at all. Driven with BOTH a `graphData` graph and a DIFFERENT `blob`
 *    graph present at once, asserting the `graphData` one is what comes back.
 *
 * 2. THE `blob` PARAMETER IS THE FALLBACK, NEVER THE DEFAULT. With `graphData.snapshot.graph`
 *    absent (the new Fly-server shape) and a `blob` present, the blob's graph comes back.
 *
 * 3. NEITHER PRESENT -> `null`, THE PRE-EXISTING HONEST ABSTAIN SHAPE. Not a crash, not an
 *    empty-but-truthy object — the exact `null` `resolvers/promotion.ts`'s
 *    `structuralNodeCandidateFor` and `resolvers/ordering.ts`'s `classifierFor` already both
 *    branch on as `"the graph has not loaded yet"`.
 *
 * 4. MALFORMED SHAPES ON EITHER SOURCE STILL REFUSE HONESTLY. A `blob.graph` with a non-array
 *    `nodes`/`edges` (the D1-fallback's own tolerance, applied to the new source) answers
 *    `null`, not a half-built `GraphSnapshot` a resolver would then throw walking.
 *
 * ── WHAT IS STUBBED, AND WHY THAT IS HONEST ──
 *
 * Nothing under `app/present/` is stubbed — `graphSnapshotOf` runs for real, driven with plain
 * object literals shaped like the two wire payloads (`GraphPayload`, `GraphBlobPayload`).
 *
 * ── THE BLIND SPOT, NAMED RATHER THAN ROUTED AROUND ──
 *
 * `refreshGraphBlob` — the function that actually FETCHES `GET /app/graph/blob`, caches it,
 * revalidates it with `If-None-Match`, and is called from `installProjection`/`loadGraph` on
 * every fresh envelope — lives entirely inside `app/index.html`'s `<script type="module">`.
 * `.flow-trace.yaml`'s own header states why no scenario anywhere in this tree can reach it:
 * capture is a node module-load hook, and node cannot import an HTML document. That is not
 * worked around here. The substitute is `tests/app-graph-blob.test.mjs` (drives the real lifted
 * page through `tests/fixtures/app-html-page.mjs`'s extractor — the same script the browser
 * runs, not a reimplementation of it) and `tests/app-async-ack.test.mjs` (proves the trigger
 * wiring: a fresh envelope landing fires exactly one background, conditional blob request).
 * Both are real application-level tests, and neither is a flow-trace scenario — labelled here as
 * the substitute it is, per the standard this arc's brief sets, not presented as equivalent
 * coverage.
 */

import type { GraphPayload, GraphBlobPayload } from "../../app/present/resolve.js";
import { graphSnapshotOf } from "../../app/present/resolve.js";

const D1_GRAPH = { nodes: [{ id: "d1-node", type: "task", fields: {} }], edges: [] };
const BLOB_GRAPH = { nodes: [{ id: "blob-node", type: "task", fields: {} }], edges: [] };

/** CLAIM 1 — `graphData.snapshot.graph`, when present, wins over a separately-supplied blob. */
function assertGraphDataWinsOverTheBlob(): void {
  const graphData: GraphPayload = { snapshot: { graph: D1_GRAPH } };
  const blob: GraphBlobPayload = { graph: BLOB_GRAPH };

  const result = graphSnapshotOf(graphData, blob);
  if (result === null || result.nodes[0]?.id !== "d1-node") {
    throw new Error(
      `expected the D1-fallback graph (graphData.snapshot.graph) to win, got ${JSON.stringify(result)}`,
    );
  }
}

/** CLAIM 2 — the blob is the FALLBACK, consulted only when graphData carries no graph key. */
function assertTheBlobIsConsultedOnlyAsFallback(): void {
  const graphDataWithNoGraph: GraphPayload = { snapshot: {} };
  const blob: GraphBlobPayload = { graph: BLOB_GRAPH };

  const result = graphSnapshotOf(graphDataWithNoGraph, blob);
  if (result === null || result.nodes[0]?.id !== "blob-node") {
    throw new Error(`expected the fallback blob's graph, got ${JSON.stringify(result)}`);
  }

  // Same claim again with `graphData` entirely absent (a brand-new session, no envelope read
  // yet) — the blob must still answer, because a resolver's need for the graph does not depend
  // on which envelope shape is in memory.
  const resultNoGraphData = graphSnapshotOf(null, blob);
  if (resultNoGraphData === null || resultNoGraphData.nodes[0]?.id !== "blob-node") {
    throw new Error(`expected the fallback blob's graph with no graphData at all, got ${JSON.stringify(resultNoGraphData)}`);
  }
}

/** CLAIM 3 — neither source present answers `null`, the pre-existing "graph not loaded" shape. */
function assertNeitherSourcePresentAnswersNull(): void {
  if (graphSnapshotOf(null, null) !== null) {
    throw new Error("graphSnapshotOf(null, null) must be null — the honest not-yet-loaded state");
  }
  if (graphSnapshotOf({ snapshot: {} }, undefined) !== null) {
    throw new Error("graphSnapshotOf with no graph anywhere must be null, not a fabricated empty snapshot");
  }
}

/** CLAIM 4 — a malformed blob (non-array nodes/edges) refuses honestly, exactly like graphData does. */
function assertAMalformedBlobRefusesHonestly(): void {
  const malformed = { graph: { nodes: "not-an-array", edges: [] } } as unknown as GraphBlobPayload;
  const result = graphSnapshotOf(null, malformed);
  if (result !== null) {
    throw new Error(`a blob with non-array nodes must answer null, got ${JSON.stringify(result)}`);
  }
}

export function run(): void {
  assertGraphDataWinsOverTheBlob();
  assertTheBlobIsConsultedOnlyAsFallback();
  assertNeitherSourcePresentAnswersNull();
  assertAMalformedBlobRefusesHonestly();
}

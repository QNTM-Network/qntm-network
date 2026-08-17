/**
 * refreshGraphBlob — THE ONE FETCH THAT KEEPS THE SEPARATELY-CACHED GRAPH BLOB CURRENT.
 *
 * ── WHY THIS MOVED, STATED AGAINST THE EXACT GAP IT CLOSES (the same gap `commit.ts` closed) ──
 *
 * `refreshGraphBlob` and the `graphBlob`/`graphBlobEtag`/`graphBlobInFlight` state it owns used to
 * live in `app/index.html`'s own `<script type="module">`. flow-trace's capture is a node
 * module-load hook (`.flow-trace.yaml`'s own note); node cannot import HTML, so this function's own
 * fetch was invisible to canonical routing, to flow declarations and to depth-to-sink, by
 * construction, not by omission — the identical fact `commit.ts`'s own header states for
 * `commitLine`, and `docs/architecture/classes.yaml`'s `graph-aware-resolution-reads-one-modelled-
 * graph` entry names this exact function, at this exact path, as the target BEFORE it existed here.
 * This module is that move.
 *
 * ── A RELOCATION, NOT A REFACTOR ──
 *
 * Every statement in `refreshGraphBlob` below is `app/index.html`'s old function body, unchanged:
 * the same conditional (`If-None-Match` against whatever ETag the last successful fetch minted),
 * the same fire-and-forget / best-effort posture (never throws; a resolver reading the cache
 * mid-fetch or after a failed fetch sees whatever it saw before), and the same in-flight-collapsing
 * (`graphBlobInFlight` folds concurrent callers — boot and a pickup arrival landing close together —
 * into the one request already running).
 *
 * ── WHY THE STATE MOVED TOO, AND WHY IT IS NOT A BARE MODULE-LEVEL `let` ──
 *
 * `graphBlob`/`graphBlobEtag`/`graphBlobInFlight` are exactly as page-lifetime-scoped as `settle`/
 * `predict`/`queued`/`writes` are (`app/index.html`'s own `new SettleSurface()` etc.) — one cache
 * per page session, reset on `logout`, read on every commit. A bare top-level `let` in THIS module
 * would not have that shape: `tests/fixtures/app-html-page.mjs` imports this file's compiled output
 * by PATH, and node's module cache keys on that path, so every test that lifts a fresh copy of the
 * page would share the SAME cached module instance and therefore the SAME graph blob across
 * unrelated tests — the identical reason `predict`/`settle` are constructed via `new X()` once per
 * page rather than held as bare exports. `createGraphBlobCache(deps)` gives every caller (the real
 * page, once; each test's lifted page, once each) its own closure-scoped state, the same isolation
 * a fresh class instance would give, built the way `commit.ts`'s `createCommitLine(deps)` already
 * establishes for this codebase: a factory over a `deps` object, not a bare function reading page
 * globals it cannot see from inside `app/present/`.
 *
 * `deps.token` IS A READER, NOT A SNAPSHOT, for the identical reason `CommitLineDeps.buildContext`
 * is one (`commit.ts`'s own header): the page's own `token` is a `let` reassigned by `register`/
 * `login`/`logout`, and a value captured once at construction time would go stale the moment the
 * operator signed in or out. `deps.api` is a plain string because the page's own `API` constant is
 * never reassigned — closing over it once, the way `resolverContextFor`'s `declaration` argument
 * does not need to be a reader either, costs nothing and reads a resolver's own `ctx.view` fields.
 */

/** The shape `GET /app/graph/blob` delivers — restated from `resolve.ts`'s own `GraphBlobPayload`
 * rather than imported, so this module (state + fetch) does not need to import a resolver-shaped
 * type it otherwise has no reason to depend on; the two are kept structurally identical on purpose. */
export interface GraphBlobPayload {
  readonly graph?: { readonly nodes?: unknown; readonly edges?: unknown } | null;
}

export interface GraphBlobDeps {
  /** `() => token`, a live read of the page's own bearer token — see this module's own header for
   * why a reader, not a value. `null` (no session) means "do not fetch", exactly as it always has. */
  token(): string | null;
  /** `API`, the page's own base URL constant — never reassigned, so a plain string is enough. */
  readonly api: string;
}

/**
 * THE CACHE ONE PAGE SESSION HOLDS, AND THE ONE FETCH THAT KEEPS IT CURRENT.
 *
 * `refresh()` IS THE RELOCATED `refreshGraphBlob`, CALLED THE SAME WAY. Fire-and-forget, never
 * awaited by a painter, called every time a fresh projection is installed (boot, the re-read
 * button, a pickup arrival) — see `app/index.html`'s own `installProjection`/`loadGraph` call
 * sites, unchanged by this move.
 */
export interface GraphBlobCache {
  refresh(): Promise<void>;
  /** The cached blob, or `null` before the first successful fetch (or after `reset()`). */
  blob(): GraphBlobPayload | null;
  /** The ETag the last successful fetch minted, or `null`. */
  etag(): string | null;
  /** Seed the cache directly — the same escape hatch `tests/app-graph-blob.test.mjs` already
   * drives through `__setGraphBlob`/`__setGraphBlobEtag`, proving what a commit does once the blob
   * HAS arrived without waiting out a real fetch. */
  setBlob(next: GraphBlobPayload | null): void;
  setEtag(next: string | null): void;
  /** Drop the cache — `logout`'s own call, unchanged: a copy of the PREVIOUS session's graph held
   * outside `graphData` would let a next sign-in on the same tab resolve promotion/ordering against
   * a stranger's neighbours until the first background refresh overwrote it. */
  reset(): void;
}

export function createGraphBlobCache(deps: GraphBlobDeps): GraphBlobCache {
  let graphBlob: GraphBlobPayload | null = null;
  let graphBlobEtag: string | null = null;
  let graphBlobInFlight: Promise<void> | null = null;

  /**
   * Refresh `graphBlob` in the background, or do nothing at all. Never throws — a resolver reading
   * `graphBlob` mid-fetch, or after a failed fetch, sees whatever it saw before (or `null`, before
   * the first successful fetch) and abstains honestly; nothing here is on the critical path of a
   * paint. `graphBlobInFlight` collapses concurrent callers into the one request already running.
   *
   * A NAMED FUNCTION DECLARATION, RETURNED VIA `refresh: refreshGraphBlob` RATHER THAN A BARE
   * ARROW — the identical reason `commit.ts`'s own header gives for `commitLine`: flow-trace's TS
   * transform (`qualnameFor`) recovers a name for a `FunctionDeclaration` regardless of nesting, so
   * this stays reachable at the qualname `docs/architecture/classes.yaml`'s
   * `graph-aware-resolution-reads-one-modelled-graph` already names, `app/present/graph:
   * refreshGraphBlob`, even though it is built inside a factory rather than sitting at module scope.
   */
  async function refreshGraphBlob(): Promise<void> {
    if (!deps.token()) return;
    if (graphBlobInFlight) return graphBlobInFlight;
    graphBlobInFlight = (async () => {
      try {
        const headers: Record<string, string> = { Authorization: "Bearer " + deps.token() };
        if (graphBlobEtag) headers["If-None-Match"] = graphBlobEtag;
        const res = await fetch(deps.api + "/app/graph/blob", { method: "GET", headers });
        if (res.status === 304 || !res.ok) return; // unchanged, or a fetch worth abandoning silently
        const data = await res.json().catch(() => null);
        if (!data || !data.snapshot) return;
        graphBlob = data.snapshot;
        graphBlobEtag = res.headers.get("ETag") || graphBlobEtag;
      } catch {
        // best-effort, on purpose — see this function's own header.
      } finally {
        graphBlobInFlight = null;
      }
    })();
    return graphBlobInFlight;
  }

  return {
    refresh: refreshGraphBlob,
    blob: () => graphBlob,
    etag: () => graphBlobEtag,
    setBlob(next: GraphBlobPayload | null) {
      graphBlob = next;
    },
    setEtag(next: string | null) {
      graphBlobEtag = next;
    },
    reset() {
      graphBlob = null;
      graphBlobEtag = null;
    },
  };
}

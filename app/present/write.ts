/**
 * `postEdit` — THE ONE PLACE A FILE IS POSTED.
 *
 * ── A RELOCATION, NOT A REFACTOR ──
 *
 * Every statement below is `app/index.html`'s old `writeFile` body, unchanged, with the free
 * variables it used to close over (`api`, `served`, `writes`) turned into one `deps` parameter —
 * the same shape and the same reason as `commit.ts`, which performed this exact operation on the
 * function that CALLS this one. `baseOf` is imported rather than injected because it already lives
 * under `app/present/`.
 *
 * ── WHY IT HAD TO MOVE, AND IT IS NOT TIDINESS ──
 *
 * It moved so that it can be SEEN. `app/index.html` is outside `.flow-trace.yaml`'s `include: [app]`
 * by construction — a node module-load hook cannot import an HTML document, and the config says so
 * in its own words: "every TS module under app/, plus ONE HTML DOCUMENT THAT THIS FILTER NAMES AND
 * CANNOT SEE" (:138). While the write lived there, no sink could be anchored on it.
 *
 * That is not a theory. `classes.yaml` records the mutation that proved it on 2026-08-10: a class
 * whose real caller was in index.html had `governs_sinks` bolted on, DID report a bypass, and the
 * bypass was about entirely unrelated traffic — "a borrowed anchor buys a verdict about somebody
 * else's traffic". Reverted. Declaring a sink at the old address would have produced a confident
 * wrong answer rather than silence.
 *
 * The operator's own ruling, made about the view-selection code on 2026-08-14 and applying here
 * word for word: it shouldn't live in index whether it's right or wrong.
 *
 * ── WHAT THIS FUNCTION IS THE SINK FOR ──
 *
 * `sinks.yaml#file-posted` anchors here, and `classes.yaml#ops-write-routing` governs it. The claim
 * that class makes is narrow and checkable: an edit reaches this function as an OP STREAM. Three
 * callers exist today and only one satisfies it — see the class's own text for which, and for the
 * one that is deliberately exempt.
 */

import { baseOf } from "./base.js";

export interface PostEditView {
  readonly path: string;
}

/** The page state this function used to close over, threaded in — the `commit.ts` shape. */
export interface PostEditDeps {
  api(route: string, init: { body: unknown; auth: boolean }): Promise<unknown>;
  readonly served: { open(path: string): void; close(path: string): void };
  readonly writes: { open(token: string, path: string): void };
}

export async function postEdit(
  view: PostEditView,
  markdown: string,
  source: string,
  token: string | null = null,
  ops: readonly (readonly [number, number, readonly string[]])[] | null = null,
  deps: PostEditDeps,
): Promise<unknown> {
  const { api, served, writes } = deps;
  const body: Record<string, unknown> = { path: view.path, markdown, base: baseOf(source), ack: true };
  // SYNCHRONOUS, AND app/present/base.ts's OWN HEADER SAYS WHY IT HAD TO BE: an `await` here would
  // put the POST one turn later than it has ever been, which is a behaviour change disguised as an
  // implementation detail.
  // ── THE SIXTH THING: THE WRITE ASKS NOT TO WAIT FOR THE CYCLE ──
  //
  // `ack: true` tells `worker/src/app.js` to answer on the vault write and run the ~10 s engine
  // cycle behind the response — ~10 s down to ~250 ms on every checkbox and every line commit. The
  // projection is then collected separately, by `startPickup` above.
  //
  // IT IS SAFE TO SEND AT ANY SERVER, WHICH IS THE WHOLE OF THE SHIPPING CONDITION. A Worker that
  // has never heard of the field ignores it and returns the synchronous answer with its projection
  // in it, and `arrive` takes that path exactly as it always has — the ack branch is reached only by
  // an answer that says `accepted: true`, which only a Worker that read this field can say. A Worker
  // that DID read it but was handed no `ctx` also answers synchronously. There is no combination in
  // which this field makes a write fail, and none in which it makes one silently do less.
  // ── THE SEVENTH THING: THE WRITE SAYS WHAT IT DID, NOT ONLY WHAT IT WANTS ──
  //
  // `ops` is the edit this write IS — `[start, end, [line]]`, derived from the commit by `lineOps`
  // (app/present/source.ts). Without it the graph server RECONSTRUCTS this edit by running
  // `difflib` over two whole files, guessing at information this browser had and dropped.
  //
  // IT RIDES ALONGSIDE `markdown`, NEVER INSTEAD OF IT, and that is the whole of the shipping
  // condition on this line. The Worker 422s any body with no `markdown` (its own
  // `body?.markdown == null` check), so an ops-only body could not reach the server at all until
  // that Worker ships — and sending both means neither has to ship first. An old Worker writes the
  // markdown exactly as today; a new one prefers the ops and forwards only those. The two can
  // never describe different edits, because the op's text is read OUT OF the fold rather than
  // rebuilt beside it.
  //
  // ABSENT, NEVER EMPTY AND NEVER NULL — the same terms `base` and `token` are already carried on.
  // An edit not expressible as one line op sends no field, which is byte-for-byte the request this
  // browser sent before this change.
  if (Array.isArray(ops) && ops.length > 0) body.ops = ops;
  // ── THE FIFTH THING: THE WRITE SAYS WHICH WRITE IT IS ──
  //
  // `token` IS CARRIED ONLY WHEN THERE IS ONE — absent, never empty and never null — which is
  // exactly the pattern `worker/src/app.js` already uses for `base`, and it is the whole of the
  // shipping condition on this line. A browser with no CSPRNG (`mintWriteToken` returns `null`)
  // posts a body byte-for-byte identical to the one it posted before this change; a server that
  // ignores the field behaves exactly as it does today; and `writes.waiting(token)` (below, in
  // `collect`) is never asked about this write, because there is no token to be echoed back.
  //
  // THE REGISTER IS OPENED IN THE SAME STATEMENT THE TOKEN GOES ON THE WIRE, so a token this
  // browser is waiting for and a token this browser sent cannot come apart. It is opened BEFORE the
  // POST for the reason `served.open` is: the answer can arrive before the `await` returns.
  if (token !== null) {
    body.token = token;
    writes.open(token, view.path);
  }
  // COUNTED ACROSS THE AWAIT, so a second save made while this one is in the air is measurable as
  // one — which is the checkbox's own failure mode and is invisible to the string comparison above
  // (a tick does not repaint the painter's source, so the second edit's base looks perfectly
  // current while the server has already moved past it).
  served.open(view.path);
  try {
    return await api("/app/edit-file", { body, auth: true });
  } finally {
    served.close(view.path);
  }
}

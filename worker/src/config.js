// Gate 1 only — `design-the-runtime-compile.md` step B's second half, extended by step C to a
// second and now a third generator, and by step A/E-F to a version key and a receipt.
//
// POST /config/compile/structural
// POST /config/compile/qualification
// POST /config/compile/resolution
//
// Accepts a submitted config file map, compiles it with the SAME `compile(files)` this repo's CLI
// already calls (`scripts/generate-structural-declaration.mjs` /
// `scripts/generate-qualification-declaration.mjs` / `scripts/generate-resolution-declaration.
// mjs`), and answers with either the compiled declaration (plus its version) or a named refusal.
// Nothing here is stored, nothing is forwarded to the graph server — those are Gate 2 and the
// two-consumer write path (`design-the-runtime-compile.md` §3, steps G-H), explicitly not this
// route's job. `receipt()` below says exactly that, in its own field names.
//
// UNAUTHENTICATED, DELIBERATELY, FOR NOW — same reasoning as the first two routes, restated
// because it still applies to the third: this route touches no storage and names no user, so a
// session buys nothing but friction against the one thing this slice exists to prove. The
// two-consumer write path (§3 of the design document) is where a real identity and Gate 2 both
// belong, and it is not built here.

import { json } from "./util.js";
// FROM `compile-structural.mjs` / `compile-qualification.mjs` / `compile-resolution.mjs`, NOT the
// `generate-*-declaration.mjs` CLI files — importing `compile` from any CLI file drags in
// `node:fs` and `monorepo-config.mjs`'s module-level `fileURLToPath(import.meta.url)`, which
// crashed this Worker at load the first time this was tried (verified against the real local
// `wrangler dev` runtime, not assumed — see `compile-structural.mjs`'s header for the exact
// error). All three compile modules' import graphs are exactly themselves plus `ledger.mjs` (and,
// for qualification and resolution, `yaml-subset.mjs`) — nothing Node-specific.
import { compile as compileStructural } from "../../scripts/compile-structural.mjs";
import { compile as compileQualification } from "../../scripts/compile-qualification.mjs";
import { compile as compileResolution } from "../../scripts/compile-resolution.mjs";

// One route entry per generator: the URL suffix, and the pure `compile` it calls. Adding this
// third generator (resolution, step C's remaining half) was one more entry here, not a new
// function — exactly as this comment already predicted for it.
const ROUTES = new Map([
  ["POST /config/compile/structural", compileStructural],
  ["POST /config/compile/qualification", compileQualification],
  ["POST /config/compile/resolution", compileResolution],
]);

/**
 * The receipt, on every answer this route gives — a successful compile or a Gate-1 refusal alike.
 * `design-config-is-content.md` §4.4 names FOUR things a config receipt must answer: it landed and
 * this is the new bundle version; it compiled and here is what changed; it dropped these new
 * things since the last save; the engine has, or has not, accepted it yet. THIS ROUTE CAN ONLY
 * EVER ANSWER THE SECOND ONE, and it says so in its own field names rather than in this comment
 * alone — `design-the-runtime-compile.md`'s own §3.2 table is explicit that a version is minted
 * "only once both gates pass" and nothing is stored until the graph server acks durable receipt
 * (§3, §8: this route is Gate 1 only, no Gate 2, no forward, no persistence).
 *
 * THE PRECEDENT THIS FOLLOWS, NAMED RATHER THAN RELEARNED. `the-browser-recognises-its-own-write`
 * (`docs/architecture/capabilities.yaml`) measured the same ambiguity on the markdown write path: a
 * real browser session saw a 200 with its write's own token echoed back, and the line it named was
 * still destroyed by a cycle running behind it — "RECORDED, never WRITTEN: a 200 says the server
 * ACCEPTED the save, an echo says it RECORDED it, and neither says the line survived the cycle."
 * This receipt makes the equivalent split explicit for a config write, in the fields themselves:
 *
 *   compiled        GATE 1 ran and this is what it found — the only fact this route can vouch for.
 *   version          the content-hash key `compiled.declaration`/`compiled.dropped` hashes to
 *                    (`declaration-version.mjs`) — an IDENTITY this compile produced, not a claim
 *                    that anything named by it is now the live, current, or stored version. `null`
 *                    when Gate 1 refused, because nothing was compiled to name.
 *   stored           always `false` from this route. Nothing this route does ever persists
 *                    anything anywhere — there is no bundle for `version` to be "the new version
 *                    OF" yet.
 *   engineAccepted   always `null` from this route, deliberately not `false`: `null` means "not
 *                    asked", and `false` would misreport an engine refusal that never happened.
 *                    Gate 2 (`design-the-runtime-compile.md` step G) is the only thing that may
 *                    ever answer this with `true` or `false`, and it does not exist here.
 *
 * @param {{compiled: boolean, version: string | null}} outcome
 */
// EXPORTED, NOT JUST CALLED, so `scripts/check-isolate-conformance.mjs` builds its Node-side
// comparison object with the SAME function this route answers with, rather than a second,
// independently-drifting copy of this shape — a mismatched copy would make that script's byte
// comparison disagree on every single case for a reason that has nothing to do with `workerd`.
export function receipt({ compiled, version }) {
  return { compiled, version, stored: false, engineAccepted: null };
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {string} origin
 * @returns {Promise<Response|null>} null if this request is not one of this file's routes.
 */
export async function handleConfig(request, url, origin) {
  const key = `${request.method} ${url.pathname}`;
  const compile = ROUTES.get(key);
  if (!compile) return null;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad request: body is not valid JSON" }, 400, origin);
  }

  const files = body && typeof body === "object" ? body.files : undefined;
  if (files === null || typeof files !== "object" || Array.isArray(files)) {
    return json({ ok: false, error: "bad request: 'files' must be an object of path -> contents" }, 400, origin);
  }
  for (const [path, contents] of Object.entries(files)) {
    if (typeof contents !== "string") {
      return json({ ok: false, error: `bad request: 'files[${JSON.stringify(path)}]' is not a string` }, 400, origin);
    }
  }

  // GATE 1. `compile` is the exact function the matching generator's own CLI shell calls — one
  // implementation, two callers, per `design-config-is-content.md` §2.2(b). A thrown
  // GenerationError (or Refusal, for qualification's own pattern normaliser) IS a refusal: named,
  // specific, the same sentence a human running the CLI against the same bad input would see on
  // stderr. Nothing is caught and reworded.
  let compiled;
  try {
    compiled = compile(files);
  } catch (error) {
    return json(
      {
        ok: false,
        refused: true,
        error: String(error?.message || error),
        receipt: receipt({ compiled: false, version: null }),
      },
      422,
      origin,
    );
  }

  return json(
    {
      ok: true,
      declaration: compiled.declaration,
      dropped: compiled.dropped,
      receipt: receipt({ compiled: true, version: compiled.version }),
    },
    200,
    origin,
  );
}

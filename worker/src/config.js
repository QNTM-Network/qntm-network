// Gate 1 only — `design-the-runtime-compile.md` step B's second half, extended by step C to a
// second and now a third generator.
//
// POST /config/compile/structural
// POST /config/compile/qualification
// POST /config/compile/resolution
//
// Accepts a submitted config file map, compiles it with the SAME `compile(files)` this repo's CLI
// already calls (`scripts/generate-structural-declaration.mjs` /
// `scripts/generate-qualification-declaration.mjs` / `scripts/generate-resolution-declaration.
// mjs`), and answers with either the compiled declaration or a named refusal. Nothing here is
// stored, nothing is forwarded to the graph server, and no version is minted — those are Gate 2
// and the two-consumer write path (`design-the-runtime-compile.md` §3, steps G-H), explicitly not
// this route's job.
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
      { ok: false, refused: true, error: String(error?.message || error) },
      422,
      origin,
    );
  }

  return json({ ok: true, declaration: compiled.declaration, dropped: compiled.dropped }, 200, origin);
}

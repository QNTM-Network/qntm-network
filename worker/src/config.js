// Gate 1 only — `design-the-runtime-compile.md` step B's second half.
//
// POST /config/compile/structural
//
// Accepts a submitted config file map, compiles it with the SAME `compile(files)` this repo's
// CLI already calls (`scripts/generate-structural-declaration.mjs`), and answers with either the
// compiled declaration or a named refusal. Nothing here is stored, nothing is forwarded to the
// graph server, and no version is minted — those are Gate 2 and the two-consumer write path
// (`design-the-runtime-compile.md` §3, steps G-H), explicitly not this route's job. This is the
// first observable proof that the compiler this repo already has runs, unmodified, in the
// Cloudflare Worker isolate it is designed to eventually run in for real.
//
// UNAUTHENTICATED, DELIBERATELY, FOR NOW. Every other `/app/*` route requires a session because it
// reads or writes a person's own data. This route touches no storage and names no user — it is a
// pure function of the bytes in the request body, so a session buys nothing but friction against
// the one thing this slice exists to prove: that a bad config, POSTed to a real endpoint, comes
// back refused with the same wording the CLI already gives. The two-consumer write path (§3 of the
// design document) is where a real identity and Gate 2 both belong, and it is not built here.

import { json } from "./util.js";
// FROM `compile-structural.mjs`, NOT `generate-structural-declaration.mjs` — importing `compile`
// from the latter drags in `node:fs` and `monorepo-config.mjs`'s module-level
// `fileURLToPath(import.meta.url)`, which crashed this Worker at load (verified against the real
// local `wrangler dev` runtime, not assumed). `compile-structural.mjs`'s own header has the full
// story. This import's module graph is exactly `compile-structural.mjs` + `ledger.mjs` — nothing
// Node-specific.
import { compile } from "../../scripts/compile-structural.mjs";

const ROUTE = "POST /config/compile/structural";

/**
 * @param {Request} request
 * @param {URL} url
 * @param {string} origin
 * @returns {Promise<Response|null>} null if this request is not this route's.
 */
export async function handleConfig(request, url, origin) {
  const key = `${request.method} ${url.pathname}`;
  if (key !== ROUTE) return null;

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

  // GATE 1. `compile` is the exact function `scripts/generate-structural-declaration.mjs`'s own
  // CLI shell calls — one implementation, two callers, per `design-config-is-content.md` §2.2(b).
  // A thrown GenerationError IS a refusal: named, specific, the same sentence a human running the
  // CLI against the same bad input would see on stderr. Nothing is caught and reworded.
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

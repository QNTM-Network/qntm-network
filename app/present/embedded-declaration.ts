/**
 * THE EMBEDDED DECLARATION — `presentation.json`'s content, baked into `dist/present.js` at build
 * time instead of fetched by the page at run time.
 *
 * WHAT THIS REMOVES. `enterGraph()` (app/index.html) used to `await loadPresentation()` before
 * `await loadGraph()`, deliberately sequential — "two round trips at sign-in is cheaper than a
 * first paint that changes under the reader a moment later". That reasoning is sound and unchanged
 * by this file; what it cost was a SERIAL network round trip (~110ms in production) in front of the
 * one request that actually matters, for a document that is 1,244 bytes
 * (docs/implementation-artifacts/research-state-and-speed.md §2.5). This file is what lets the page
 * read it with no round trip at all: `import presentationJson from "../../presentation.json"` pulls
 * the file's CURRENT committed bytes into the module graph, and esbuild's built-in JSON loader
 * inlines them into `dist/present.js` at build time.
 *
 * ── THE TRAP, AND HOW THIS AVOIDS IT ──
 *
 * `presentation.json`'s `structural` key is GENERATED, not hand-written — produced from the
 * monorepo's own config by `scripts/generate-structural-declaration.mjs` (see that script's own
 * header). Embedding a COPY of the file's bytes elsewhere would risk exactly the failure that
 * script exists to prevent: a generated fact silently becoming two facts, one of which can go
 * stale without anyone noticing.
 *
 * This file does not copy anything. It IMPORTS `presentation.json` — the same file
 * `generate-structural-declaration.mjs` writes, the same file `tests/present-structural.test.mjs`
 * and `tests/present-global.test.mjs` read straight off disk as `SERVED` — so `EMBEDDED_DECLARATION`
 * and the served file are, by construction, one read of one document. There is no second place for
 * the generated fact to live and no hand-copy step for a human to forget.
 *
 * THE STALENESS GUARD IS THE ONE THIS REPO ALREADY TRUSTS. `dist/present.js` is a COMMITTED build
 * artifact, and `.github/workflows/build.yml` already fails the build if a fresh `npm run build`
 * produces a `dist/` that differs from what is committed ("fail if a committed bundle is stale").
 * Because this file's import makes `presentation.json` part of `dist/present.js`'s own input graph,
 * that existing gate now ALSO catches "presentation.json changed and nobody ran the build" — the
 * exact drift this change must not introduce — with no new machinery: it is the same protection
 * `demo/app.js` and the rest of `dist/present.js` already have, extended to one more input file.
 * `tests/present-global.test.mjs` section 1 additionally asserts `EMBEDDED_DECLARATION` deep-equals
 * a fresh read of `presentation.json` off disk, so the guard is provable in `npm test` too, not only
 * in CI's build-then-diff step.
 *
 * WHAT THIS DOES NOT CHANGE. `presentation.json` is still generated the same way, by the same
 * script, and is still served at the site root as its own resource (nothing here stops that) — this
 * file only stops the RUNNING APP from being the one thing that has to fetch it.
 */

import presentationJson from "../../presentation.json" with { type: "json" };

export const EMBEDDED_DECLARATION: unknown = presentationJson;

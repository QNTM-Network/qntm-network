/**
 * The app build — TWO committed bundles, one per page.
 *
 *   app/boot.ts    -> demo/app.js   (+ demo/app.css)   the demo page
 *   app/present/   -> dist/present.js                  the presentation cascade, for app/index.html
 *
 * Output is COMMITTED, because GitHub Pages serves this repo from main:/ with no build of its
 * own. The obvious hazard of a committed build artifact is that it drifts from source when
 * someone forgets to rebuild, so CI does not merely run this — it runs it and then fails if the
 * working tree changed (see .github/workflows/build.yml). That check is what keeps the amended
 * push-to-deploy-loop honest: no human has to remember, because forgetting is caught. The
 * staleness check covers BOTH output directories; adding an output without extending it would
 * give the second bundle none of the protection the first one has.
 */

import { build } from "esbuild";

await build({
  // boot.ts, not main.ts — the bootstrap is the only module with a top-level side effect, and
  // main.ts stays importable so flow-trace's node observer can watch it. See app/boot.ts.
  entryPoints: ["app/boot.ts"],
  bundle: true,
  format: "esm",
  target: ["es2022"],
  minify: true,
  sourcemap: true,
  outfile: "demo/app.js",
  logLevel: "info",
});

/**
 * The presentation bundle. `app/index.html` (served at /app/) imports this instead of hand-rolling
 * a painter — as `/dist/present.js`, site-root-absolute, because a relative path would resolve
 * under /app/ and 404.
 *
 * NOT MINIFIED, and that is a decision rather than an oversight. This bundle is the artifact the
 * node tests import — the golden comparison and the routing falsifier both run against the file
 * that actually ships, not against the sources it was built from, so what CI proves is a property
 * of the deployed thing. Minification would leave that still true but unreadable, and this bundle
 * is ~4kB of a page that already pulls two libraries off a CDN. Legibility is worth more here
 * than the bytes.
 *
 * There is no CSS entry: the presentation cascade paints into classes app/index.html already styles
 * (`.task`, `.viewbody h2`…), and inventing a second stylesheet would be a change to how the app
 * LOOKS in a change whose whole claim is that nothing about how it looks changed.
 */
await build({
  entryPoints: ["app/present/index.ts"],
  bundle: true,
  format: "esm",
  target: ["es2022"],
  minify: false,
  sourcemap: true,
  outfile: "dist/present.js",
  logLevel: "info",
});

/**
 * NO THIRD-PARTY CDN SURVIVES ANYWHERE IN WHAT SHIPS.
 *
 *   node --test tests/no-cdn.test.mjs
 *
 * `app/index.html` used to statically import two libraries from `esm.sh` — 17 sub-requests, a
 * dependency chain four levels deep, blocking the app's first line of code (see
 * docs/implementation-artifacts/research-state-and-speed.md §2.2). Both are now bundled locally
 * (app/vendor.ts -> dist/vendor.js) and imported from ONE same-origin path.
 *
 * THIS IS PROVEN BY BUILDING AND READING THE OUTPUT, NOT BY GREPPING SOURCE. A grep over
 * app/vendor.ts's own header, or over this file's, would find the string "esm.sh" in a comment
 * explaining what was removed — that has been the exact false victory claimed twice before on this
 * project. So this suite (1) runs the real build fresh, so what it reads is this commit's artifact
 * rather than whatever happened to be sitting in dist/ and demo/, and (2) reads every file GitHub
 * Pages actually serves — the two committed bundles AND the hand-authored HTML pages, which are
 * shipped VERBATIM (no build step touches them) — checking for an actual `esm.sh` URL rather than
 * the bare word, so a comment that mentions the retired CDN by name (as this project's own
 * commentary style requires) cannot make the check either pass or fail on the wrong evidence.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..");

// A real esm.sh reference is a URL: "https://esm.sh/..." (what the retired imports actually
// wrote) or the bare host quoted as an import specifier. Prose that merely NAMES the CDN — this
// file's own header, app/vendor.ts's — does not contain either shape.
const CDN_URL = /["'(]https?:\/\/esm\.sh\//;

before(() => {
  // BUILD FRESH. `npm run check` already orders build before test, but this suite does not lean
  // on that — it is the one claim in this whole change that has to be true of THIS commit's
  // artifact, not of whatever a previous build left on disk.
  execFileSync("node", ["scripts/build.mjs"], { cwd: REPO, stdio: "pipe" });
});

// Every file an unauthenticated visitor's browser can be served, verbatim, from main:/.
const SHIPPED_FILES = [
  "app/index.html", // the app, served at /app/
  "index.html", // the marketing landing page
  "app.html", // the retired /app.html redirect stub
  "dist/present.js", // the presentation cascade bundle app/index.html imports
  "dist/vendor.js", // the vendor bundle app/index.html imports — markdown-it + the passkey lib
  "demo/app.js", // the demo page's bundle
  "demo/index.html", // the demo page
];

describe("no esm.sh URL survives in any file GitHub Pages serves", () => {
  for (const relative of SHIPPED_FILES) {
    test(`${relative} carries no https://esm.sh/… reference`, () => {
      const text = readFileSync(resolve(REPO, relative), "utf8");
      assert.ok(
        !CDN_URL.test(text),
        `${relative} still references esm.sh — the CDN import was supposed to be retired`,
      );
    });
  }

  test("the fixture itself would catch a real import — proof the pattern is not vacuous", () => {
    const reintroduced = 'import MarkdownIt from "https://esm.sh/markdown-it@14";';
    assert.ok(CDN_URL.test(reintroduced), "CDN_URL failed to match a real esm.sh import");
    // And prose that merely names the CDN — exactly what this file's own header does — must NOT
    // trip the same pattern, or the check above would be testing comments rather than code.
    const prose = "// bundled locally instead of fetched from esm.sh at runtime";
    assert.ok(!CDN_URL.test(prose), "CDN_URL fires on prose that only mentions the CDN by name");
  });
});

describe("the vendor bundle actually carries both libraries", () => {
  test("dist/vendor.js exports MarkdownIt, startRegistration and startAuthentication", async () => {
    const mod = await import(resolve(REPO, "dist", "vendor.js"));
    assert.equal(typeof mod.MarkdownIt, "function", "MarkdownIt did not bundle");
    assert.equal(typeof mod.startRegistration, "function", "startRegistration did not bundle");
    assert.equal(typeof mod.startAuthentication, "function", "startAuthentication did not bundle");
    // Not a stub: the real markdown-it, constructible and rendering.
    const md = new mod.MarkdownIt("commonmark");
    assert.match(md.render("**bold**"), /<strong>bold<\/strong>/);
  });

  test("app/index.html imports the vendor bundle from one same-origin, site-root-absolute path", () => {
    const page = readFileSync(resolve(REPO, "app", "index.html"), "utf8");
    assert.match(
      page,
      // `?v=<hash>` is scripts/build.mjs's cache-buster (see its own header) — the query is
      // build-generated and changes with the bundle's bytes, so it is optional here rather than
      // pinned to a value this test would go stale against on every rebuild.
      /import \{ MarkdownIt, startRegistration, startAuthentication \} from "\/dist\/vendor\.js(\?v=[0-9a-f]+)?";/,
      "the page no longer imports the vendor bundle the way this test expects",
    );
  });
});

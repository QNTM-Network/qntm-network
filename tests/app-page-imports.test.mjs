/**
 * THE PAGE CALLS ONLY WHAT IT IMPORTS (2026-10-09). The touch bar's NORMAL keys called `globalKey`,
 * which `dist/present.js` exports and `app/index.html` never imported: every NORMAL button threw
 * `ReferenceError: globalKey is not defined` on a phone, and no test noticed, because the page's
 * module script is not type-checked. This holds every bundle export the page names in its script
 * to the page's own import list.
 *
 *   node --test tests/app-page-imports.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as bundle from "../dist/present.js";

const PAGE = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");

test("every bundle export the page script uses is imported from the bundle", () => {
  // From the bundle's `from` back to its `import {` — a comment inside the list may hold a brace.
  const from = /\}\s*from\s*"\/dist\/present\.js[^"]*";?/.exec(PAGE);
  assert.ok(from, "app/index.html does not import from /dist/present.js");
  const start = PAGE.lastIndexOf("import {", from.index);
  const importBlock = { index: start, 0: PAGE.slice(start, from.index + from[0].length) };
  const imported = new Set(
    PAGE.slice(start + "import {".length, from.index)
      .replace(/\/\/[^\n]*/g, "")
      .split(",")
      .map((name) => name.trim().split(/\s+as\s+/).pop())
      .filter(Boolean),
  );
  const script = PAGE.slice(importBlock.index + importBlock[0].length)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, '""');
  const declared = new Set([...script.matchAll(/\b(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  const missing = Object.keys(bundle).filter(
    (name) =>
      !imported.has(name) &&
      !declared.has(name) &&
      new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}\\s*\\(`).test(script),
  );
  assert.deepEqual(missing, [], `called by app/index.html but not imported: ${missing.join(", ")}`);
});

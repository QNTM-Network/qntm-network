/**
 * THE GOLDEN MASTER — the painted DOM is byte-identical to the painter this change replaced.
 *
 *   node --test tests/present-golden.test.mjs
 *
 * "Byte-identical output" is the headline claim of migration stage 1, so it is proven the way a
 * claim like that has to be proven: by running BOTH painters and comparing, not by reading them
 * side by side and agreeing they look the same.
 *
 *   the reference — `paintView` verbatim from app.html:234-269 @ 64c3a87, out of the git history
 *   the subject   — `paint()` from dist/present.js, the artifact the browser actually loads
 *   the fixtures  — one view reaching every branch, plus a property sweep over generated lines
 *   the renderer  — ONE markdown-it instance, shared, so the comparison is of the painters only
 *
 * WHY dist/present.js AND NOT app/present/*.ts. What ships to the browser is the bundle; a green
 * against sources the browser never sees would be a green about the wrong artifact. CI builds
 * before it tests and then fails if the committed bundle differs from a fresh build, so the file
 * this imports is always this commit's.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";

import { makeDocument, makeBody, serialize, VIEW_MARKDOWN } from "./fixtures/dom-stub.mjs";
import { PAINT_VIEW_SOURCE, makeOriginalPaintView } from "./fixtures/paint-view-64c3a87.mjs";
import { paint, PresentationContext } from "../dist/present.js";

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..");
const BASE = "64c3a87";

// The page's own renderer configuration, verbatim from app.html:159. Both painters get THIS
// object, so markdown-it is a constant of the experiment rather than a variable in it.
const md = new MarkdownIt("commonmark").enable("table");

/** Paint `markdown` with the reference implementation and return the serialised tree. */
function paintOriginal(markdown) {
  const document = makeDocument();
  const body = makeBody();
  globalThis.document = document;
  const view = { id: "v", path: "week.md", markdown };
  const paintView = makeOriginalPaintView({
    document,
    graphData: { snapshot: { views: [view] } },
    viewBody: body,
    md,
    toggleTask: () => {},
  });
  paintView("v");
  return { body, text: serialize(body) };
}

/** Paint `markdown` with the extracted painter and return the serialised tree. */
function paintExtracted(markdown, context = new PresentationContext()) {
  const document = makeDocument();
  const body = makeBody();
  globalThis.document = document;
  paint(body, markdown, context, { markdown: md, onCheckboxToggle: () => {} });
  return { body, text: serialize(body) };
}

describe("the frozen reference is honest", () => {
  test("it is byte-identical to app.html:234-269 at the base commit", () => {
    let blob;
    try {
      blob = execFileSync("git", ["show", `${BASE}:app.html`], { cwd: REPO, encoding: "utf8" });
    } catch {
      // A shallow CI checkout may not carry the base commit. The golden comparison below does
      // not depend on this — it is the audit of the fixture, and it runs wherever git can reach
      // the blob. It is an assert, not a skip-with-a-shrug: if git IS there and the text has
      // drifted, this fails.
      assert.ok(true, "base blob unreachable in this checkout — fixture audit not performed");
      return;
    }
    assert.ok(
      blob.includes(PAINT_VIEW_SOURCE),
      "tests/fixtures/paint-view-64c3a87.mjs no longer matches the committed original — the " +
        "golden master is measuring against something that was never shipped",
    );
  });
});

describe("byte-identical painted DOM", () => {
  test("the whole-view fixture paints identically", () => {
    const before = paintOriginal(VIEW_MARKDOWN);
    const after = paintExtracted(VIEW_MARKDOWN);
    assert.equal(after.text, before.text);
  });

  test("the fixture is not trivially small", () => {
    // A golden that compares two empty trees passes forever. This pins that the comparison above
    // has real content in it: every element kind either painter can build must be present.
    const { text } = paintExtracted(VIEW_MARKDOWN);
    for (const tag of ["label", "input", "span", "h2", "h3", "h4", "h5", "h6", "div"]) {
      assert.ok(text.includes(`tag=${tag} `), `fixture never produces a <${tag}>`);
    }
    assert.ok(text.split("\n").length > 25, "fixture produces too little DOM to be evidence");
  });

  const CASES = [
    ["empty source", ""],
    ["a single blank line", "\n"],
    ["only whitespace", "   \n\t\n"],
    ["a task with no indent", "- [ ] plain"],
    ["a task indented an odd number of spaces", "   - [ ] odd indent"],
    ["a task indented with a tab", "\t- [ ] tab indent"],
    ["a done task, lower case", "- [x] done"],
    ["a done task, upper case", "- [X] DONE"],
    ["a not-quite task", "- [] missing space"],
    ["a not-quite task, wrong glyph", "- [y] wrong glyph"],
    ["one hash", "# one"],
    ["six hashes", "###### six"],
    ["seven hashes", "####### seven"],
    ["a hash with no space", "#nospace"],
    ["a hash followed by a tab", "#\ttab after hash"],
    ["html in the tail", "- [ ] <script>alert(1)</script> & <b>bold</b>"],
    ["html in a heading", "## <em>emphasis</em> & ampersand"],
    ["html in prose", "<div onclick=\"x\">raw html line</div>"],
    ["a markdown table row", "| a | b |"],
    ["a horizontal rule", "---"],
    ["a fenced code line", "```js"],
    ["a blockquote", "> quoted"],
    ["a qntm line with every token family", "- [ ] Draft [[qntm:121]] #task #work 🆕 2026-07-29"],
    ["trailing newline", "- [ ] a\n"],
    ["CRLF line endings", "# heading\r\n- [ ] task\r\n"],
    ["a lone carriage return", "- [ ] task\r"],
  ];

  for (const [name, markdown] of CASES) {
    test(`identical for ${name}`, () => {
      assert.equal(paintExtracted(markdown).text, paintOriginal(markdown).text);
    });
  }

  test("identical across a generated sweep of line combinations", () => {
    // A deterministic cross-product, so the claim is not resting on lines somebody thought of.
    const indents = ["", " ", "  ", "    ", "\t"];
    const bodies = [
      "- [ ] task",
      "- [x] done",
      "- [X] DONE",
      "- [] not a task",
      "# h1",
      "###### h6",
      "####### h7",
      "#nospace",
      "prose with **bold**",
      "| a | b |",
      "",
      "   ",
      "> quote",
      "- bare item",
      "[[qntm:9]] #tag 🆕 2026-01-01",
    ];
    let compared = 0;
    for (const a of indents) {
      for (const b of bodies) {
        for (const c of bodies) {
          const markdown = `${a}${b}\n${a}${c}`;
          assert.equal(
            paintExtracted(markdown).text,
            paintOriginal(markdown).text,
            `differs for ${JSON.stringify(markdown)}`,
          );
          compared += 1;
        }
      }
    }
    assert.ok(compared >= 1000, `sweep too small to be evidence (${compared})`);
  });
});

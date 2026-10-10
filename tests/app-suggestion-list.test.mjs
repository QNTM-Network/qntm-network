/**
 * WHERE THE SUGGESTION LIST GOES (2026-10-10) — app/shell/completer.ts `place`. Under the line when
 * it fits; above it when the visible area has no room below (a Mac with the line near the bottom,
 * a phone with the keyboard up); inside the screen sideways.
 *
 *   node --test tests/app-suggestion-list.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeSuggestions } from "../dist/present.js";

function setup({ editorTop, editorHeight = 40, listHeight = 120, listWidth = 200, editorLeft = 40, visual }) {
  const view = { innerHeight: 900, innerWidth: 400, visualViewport: visual };
  const editor = {
    ownerDocument: { defaultView: view },
    getBoundingClientRect: () => ({ top: editorTop, bottom: editorTop + editorHeight, left: editorLeft }),
  };
  const list = { offsetHeight: listHeight, offsetWidth: listWidth, style: {} };
  placeSuggestions(list, editor);
  return list.style;
}

test("under the line when there is room", () => {
  const style = setup({ editorTop: 200 });
  assert.equal(style.top, "246px");
});

test("above the line when the bottom of the screen has no room", () => {
  const style = setup({ editorTop: 820 });
  assert.equal(style.top, `${820 - 6 - 120}px`);
});

test("on a phone, the keyboard's edge is the bottom — not the window's", () => {
  // Visible area 0..420 (keyboard below). The line at 340 has 34px below it: the list goes above.
  const style = setup({ editorTop: 340, visual: { offsetTop: 0, height: 420, offsetLeft: 0, width: 400 } });
  assert.equal(style.top, `${340 - 6 - 120}px`);
});

test("on a phone scrolled under the keyboard, the visible area's own top counts", () => {
  const style = setup({ editorTop: 500, visual: { offsetTop: 300, height: 420, offsetLeft: 0, width: 400 } });
  assert.equal(style.top, "546px");
});

test("kept inside the screen sideways", () => {
  const style = setup({ editorTop: 200, editorLeft: 350 });
  assert.equal(style.left, `${400 - 200 - 8}px`);
});

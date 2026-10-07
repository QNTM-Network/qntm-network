// `c` asks for a quick capture (2026-10-07). The page decides where (the inbox) and opens the line
// through the same `openLine` as `o`; this module only reports the gesture.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ModeSurface } from "../dist/present.js";

test("c in NORMAL mode asks to capture", () => {
  assert.equal(new ModeSurface().handleKey("c", 2, 5).effect.kind, "capture");
});

test("a count before c is refused, not run once", () => {
  const mode = new ModeSurface();
  mode.handleKey("3", 2, 5);
  assert.equal(mode.handleKey("c", 2, 5).effect.kind, "none");
});

test("c in INSERT mode is just a character", () => {
  const mode = new ModeSurface();
  mode.enterInsert();
  assert.equal(mode.handleKey("c", 2, 5).handled, false);
});

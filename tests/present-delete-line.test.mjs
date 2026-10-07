// `dd` deletes the selected line (2026-10-07, operator report: the web app had no way to delete a
// line). The edit removes exactly one content line, refuses a blank or heading line, and travels
// to the server as one line op with nothing put back — the same gesture as deleting the line in
// Obsidian.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { applyEdit, lineOps, ModeSurface } from "../dist/present.js";

const SOURCE = "## Inbox\n- [ ] keep [[qntm:1]] #task\n- [ ] remove me [[qntm:2]] #task\n\n- [ ] last [[qntm:3]]";

describe("applyEdit delete-line", () => {
  test("removes exactly the one line", () => {
    assert.equal(
      applyEdit(SOURCE, { kind: "delete-line", lineIndex: 2 }),
      "## Inbox\n- [ ] keep [[qntm:1]] #task\n\n- [ ] last [[qntm:3]]",
    );
  });
  test("refuses a heading", () => {
    assert.equal(applyEdit(SOURCE, { kind: "delete-line", lineIndex: 0 }), null);
  });
  test("refuses a blank line", () => {
    assert.equal(applyEdit(SOURCE, { kind: "delete-line", lineIndex: 3 }), null);
  });
  test("refuses an index past the end", () => {
    assert.equal(applyEdit(SOURCE, { kind: "delete-line", lineIndex: 9 }), null);
  });
});

describe("lineOps delete-line", () => {
  test("is one op over the removed row with nothing put back", () => {
    const after = applyEdit(SOURCE, { kind: "delete-line", lineIndex: 2 });
    assert.deepEqual(lineOps("delete-line", 2, after), [[2, 3, []]]);
  });
});

describe("dd in NORMAL mode", () => {
  test("d then d asks to delete the selected line", () => {
    const mode = new ModeSurface();
    assert.equal(mode.handleKey("d", 1, 4).effect.kind, "none");
    assert.equal(mode.handleKey("d", 1, 4).effect.kind, "delete-line");
  });
  test("a lone d followed by j moves, and deletes nothing", () => {
    const mode = new ModeSurface();
    mode.handleKey("d", 1, 4);
    const out = mode.handleKey("j", 1, 4);
    assert.equal(out.effect.kind, "move");
  });
  test("x is unaffected", () => {
    const mode = new ModeSurface();
    assert.equal(mode.handleKey("x", 1, 4).effect.kind, "toggle-done");
  });
});

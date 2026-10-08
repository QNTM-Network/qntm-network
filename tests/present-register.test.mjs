// dd/yy/p: the line register and the one-write move (2026-10-08).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { applyEdit, LineRegister } from "../dist/present.js";

const SOURCE = ["## Inbox", "- [ ] A [[qntm:1]] #task", "- [ ] B #task", "- [ ] C [[qntm:3]] #task"].join("\n");

describe("move-line", () => {
  test("p below: A moves under C, in one edit", () => {
    assert.equal(
      applyEdit(SOURCE, { kind: "move-line", lineIndex: 1, to: 4 }),
      ["## Inbox", "- [ ] B #task", "- [ ] C [[qntm:3]] #task", "- [ ] A [[qntm:1]] #task"].join("\n"),
    );
  });
  test("P above: C moves above A", () => {
    assert.equal(
      applyEdit(SOURCE, { kind: "move-line", lineIndex: 3, to: 1 }),
      ["## Inbox", "- [ ] C [[qntm:3]] #task", "- [ ] A [[qntm:1]] #task", "- [ ] B #task"].join("\n"),
    );
  });
  test("landing on itself is not a move, and a heading never moves", () => {
    assert.equal(applyEdit(SOURCE, { kind: "move-line", lineIndex: 1, to: 1 }), null);
    assert.equal(applyEdit(SOURCE, { kind: "move-line", lineIndex: 1, to: 2 }), null);
    assert.equal(applyEdit(SOURCE, { kind: "move-line", lineIndex: 0, to: 3 }), null);
  });
});

describe("LineRegister", () => {
  test("a cut is pending only against the file it was taken from", () => {
    const r = new LineRegister();
    r.cut({ view: "inbox", source: SOURCE, lineIndex: 1 }, "- [ ] A [[qntm:1]] #task");
    assert.equal(r.cutLineIn("inbox", SOURCE), 1);
    assert.equal(r.pendingCut("inbox", SOURCE)?.lineIndex, 1);
    assert.equal(r.pendingCut("inbox", SOURCE + "\n- [ ] D"), undefined, "the file changed: the cut is dropped");
    assert.equal(r.pendingCut("inbox", SOURCE), undefined, "and stays dropped");
  });
  test("a copy is put down as a NEW line: its identity stamp is removed", () => {
    const r = new LineRegister();
    r.yank("- [ ] A [[qntm:1]] #task");
    assert.equal(r.copyText(), "- [ ] A #task");
  });
});

// dd/yy/p: the line register and the one-write move (2026-10-08).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { applyEdit, deleteLinesCommit, LineRegister } from "../dist/present.js";

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

describe("LineRegister — dd marks, many at once (2026-10-08)", () => {
  test("several lines can be marked, and dd on a marked line unmarks it", () => {
    const r = new LineRegister();
    r.toggleMark("inbox", "- [ ] A [[qntm:1]] #task");
    r.toggleMark("inbox", "- [ ] B #task");
    assert.deepEqual([...r.markedLinesIn("inbox", SOURCE)].sort(), [1, 2]);
    assert.equal(r.toggleMark("inbox", "- [ ] B #task"), false);
    assert.deepEqual([...r.markedLinesIn("inbox", SOURCE)], [1]);
  });
  test("a mark survives the cycle stamping its line", () => {
    const r = new LineRegister();
    r.toggleMark("inbox", "- [ ] B #task");
    const later = SOURCE.replace("- [ ] B #task", "- [ ] B #task 🆕 2026-10-08 [[qntm:2]]");
    assert.deepEqual(r.takeAll("inbox", later), [2]);
    assert.deepEqual([...r.markedLinesIn("inbox", later)], [], "takeAll clears the marks");
  });
  test("all marked lines go in one write", () => {
    const commit = deleteLinesCommit(SOURCE, [1, 2]);
    assert.equal(commit.markdown, "## Inbox\n- [ ] C [[qntm:3]] #task");
    assert.equal(commit.kind, "delete-lines");
    assert.equal(deleteLinesCommit(SOURCE, [0, 1]), null, "a heading is never deleted");
  });
  test("p moves the LAST marked line; u unmarks the last", () => {
    const r = new LineRegister();
    r.toggleMark("inbox", "- [ ] A [[qntm:1]] #task");
    r.toggleMark("inbox", "- [ ] C [[qntm:3]] #task");
    assert.equal(r.takeLast("inbox", SOURCE), 3);
    assert.equal(r.unmarkLast("inbox"), true);
    assert.equal(r.unmarkLast("inbox"), false);
  });
  test("a copy is put down as a NEW line: its identity stamp is removed", () => {
    const r = new LineRegister();
    r.yank("- [ ] A [[qntm:1]] #task");
    assert.equal(r.copyText(), "- [ ] A #task");
  });
});

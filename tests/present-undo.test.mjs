// Undo / redo, one history per view (2026-10-08).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { applyEdit, changeOf, findLine, ModeSurface, UndoHistory } from "../dist/present.js";

const SOURCE = ["# Inbox", "- [ ] A [[qntm:1]] #task", "- [ ] B #task"].join("\n");

function commitOf(source, edit) {
  const markdown = applyEdit(source, edit);
  const text = edit.kind === "delete-line" ? "" : (markdown ?? "").split("\n")[edit.lineIndex] ?? "";
  return { lineIndex: edit.lineIndex, text, markdown, source, kind: edit.kind === "set-checkbox" ? "set-line" : edit.kind };
}

describe("findLine", () => {
  test("finds a line again after the cycle stamped it and added its created date", () => {
    const later = ["# Inbox", "- [ ] B #task 🆕 2026-10-08 [[qntm:2]]", "- [ ] A [[qntm:1]] #task"].join("\n");
    assert.equal(findLine(later, "- [ ] B #task"), 1);
    assert.equal(findLine(later, "- [x] A [[qntm:1]] #task"), 2, "by its stamp");
  });
  test("two candidates is no answer", () => {
    assert.equal(findLine("- [ ] X\n- [ ] X", "- [ ] X"), -1);
  });
});

describe("UndoHistory", () => {
  test("undo an edit, then redo it", () => {
    const h = new UndoHistory();
    const edit = commitOf(SOURCE, { kind: "set-line", lineIndex: 2, text: "- [ ] B changed #task" });
    h.record(changeOf("inbox", edit));
    const undo = h.undo("inbox", edit.markdown);
    assert.equal(undo.markdown, SOURCE);
    const redo = h.redo("inbox", undo.markdown);
    assert.equal(redo.markdown, edit.markdown);
  });
  test("undo a new line deletes it; undo a delete puts the line back under its neighbour, unstamped", () => {
    const h = new UndoHistory();
    const add = commitOf(SOURCE, { kind: "insert-line", lineIndex: 3, text: "- [ ] C #task" });
    h.record(changeOf("inbox", add));
    assert.equal(h.undo("inbox", add.markdown).markdown, SOURCE);

    const del = commitOf(SOURCE, { kind: "delete-line", lineIndex: 1 });
    h.record(changeOf("inbox", del));
    assert.equal(
      h.undo("inbox", del.markdown).markdown,
      ["# Inbox", "- [ ] A #task", "- [ ] B #task"].join("\n"),
    );
  });
  test("each view keeps its own history", () => {
    const h = new UndoHistory();
    const edit = commitOf(SOURCE, { kind: "set-line", lineIndex: 2, text: "- [ ] B2 #task" });
    h.record(changeOf("inbox", edit));
    assert.equal(h.undo("daily", edit.markdown), null);
    assert.notEqual(h.undo("inbox", edit.markdown), null);
  });
  test("a line that cannot be found is refused, and the change is kept for later", () => {
    const h = new UndoHistory();
    const edit = commitOf(SOURCE, { kind: "set-line", lineIndex: 2, text: "- [ ] B2 #task" });
    h.record(changeOf("inbox", edit));
    assert.equal(h.undo("inbox", "# Inbox"), null);
    assert.notEqual(h.undo("inbox", edit.markdown), null);
  });
});

test("u asks for undo", () => {
  assert.equal(new ModeSurface().handleKey("u", 0, 3).effect.kind, "undo");
});

// Every declared checkbox state paints and ticks, and a tick carries the completion stamp
// (2026-10-07, operator report).
//
// Two defects, both seen live on the operator's own daily view through the web app:
//   1. `[>]` scheduled / `[~]` waiting / `[/]` in-progress lines painted as bullets with the
//      brackets showing, because the line classifier only knew `[ ]` and `[x]`.
//   2. A web tick reached the server as `[x]` with no `✅ <date>`, so the task went done with
//      `completed_at` null and dropped out of every "done today" count. Obsidian's Tasks plugin
//      writes that stamp on a tick; the web app now does the same.
// Both read the operator's own config (`qualification.tokens.status`,
// `qualification.extractionFields.completed_at.token`) — nothing here is a hardcoded glyph table
// in the app; the table below is this test's fixture, shaped like the published one.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { applyEdit, classifyLine } from "../dist/present.js";

const STATUSES = {
  "[ ]": "open",
  "[x]": "done",
  "[/]": "in_progress",
  "[-]": "cancelled",
  "[~]": "waiting",
  "[>]": "scheduled",
};
const STAMP = { token: "✅", date: "2026-10-07" };

describe("classifyLine reads every declared checkbox state", () => {
  test("a [>] line is a checkbox carrying 'scheduled' when the table is passed", () => {
    const shape = classifyLine("- [>] Add Andrew tasks [[qntm:5108]] #task", STATUSES);
    assert.equal(shape.kind, "checkbox");
    assert.equal(shape.status, "scheduled");
    assert.equal(shape.done, false);
    assert.equal(shape.tail, "Add Andrew tasks [[qntm:5108]] #task");
  });

  test("[~] and [/] and [-] each carry their own status", () => {
    assert.equal(classifyLine("- [~] Return kit", STATUSES).status, "waiting");
    assert.equal(classifyLine("    - [/] Half done", STATUSES).status, "in_progress");
    assert.equal(classifyLine("- [-] Dropped", STATUSES).status, "cancelled");
  });

  test("without the table a [>] line is prose, exactly as before", () => {
    assert.equal(classifyLine("- [>] Add Andrew tasks").kind, "prose");
  });

  test("an undeclared glyph stays prose even with the table", () => {
    assert.equal(classifyLine("- [?] Unknown", STATUSES).kind, "prose");
  });

  test("[ ] and [x] are unchanged, with or without the table", () => {
    for (const table of [undefined, STATUSES]) {
      const open = classifyLine("- [ ] a", table);
      const done = classifyLine("- [x] b", table);
      assert.equal(open.kind, "checkbox");
      assert.equal(open.status, "open");
      assert.equal(done.done, true);
      assert.equal(done.status, "done");
    }
  });
});

describe("a tick carries the completion stamp, as the Tasks plugin writes it", () => {
  const tick = (line, checked, extra = {}) =>
    applyEdit(line, { kind: "set-checkbox", lineIndex: 0, checked, statuses: STATUSES, completion: STAMP, ...extra });

  test("ticking an open line appends the stamp", () => {
    assert.equal(tick("- [ ] web app test [[qntm:5112]] #task 🆕 2026-10-07", true),
      "- [x] web app test [[qntm:5112]] #task 🆕 2026-10-07 ✅ 2026-10-07");
  });

  test("ticking a [>] scheduled line works and stamps it", () => {
    assert.equal(tick("- [>] Add Andrew tasks #task ⏳ 2026-10-07", true),
      "- [x] Add Andrew tasks #task ⏳ 2026-10-07 ✅ 2026-10-07");
  });

  test("an operator-typed backdate is kept, not doubled", () => {
    assert.equal(tick("- [ ] Late one ✅ 2026-10-05", true), "- [x] Late one ✅ 2026-10-05");
  });

  test("unticking removes the stamp", () => {
    assert.equal(tick("- [x] Done thing #task ✅ 2026-10-07", false), "- [ ] Done thing #task");
  });

  test("with no stamp supplied the glyph alone changes, as before", () => {
    assert.equal(
      applyEdit("- [ ] a #task", { kind: "set-checkbox", lineIndex: 0, checked: true }),
      "- [x] a #task",
    );
  });

  test("without the table a [>] line is refused, as before", () => {
    assert.equal(
      applyEdit("- [>] a", { kind: "set-checkbox", lineIndex: 0, checked: true, completion: STAMP }),
      null,
    );
  });

  test("only the ticked line changes", () => {
    const source = "## Inbox\n- [ ] one\n- [ ] two";
    assert.equal(
      applyEdit(source, { kind: "set-checkbox", lineIndex: 2, checked: true, statuses: STATUSES, completion: STAMP }),
      "## Inbox\n- [ ] one\n- [x] two ✅ 2026-10-07",
    );
  });
});

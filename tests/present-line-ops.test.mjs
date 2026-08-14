/**
 * `lineOps` — the edit this browser has always computed and thrown away.
 *
 * WHAT THIS PROTECTS. Every commit site builds a `SourceEdit`, folds it into whole markdown with
 * `applyEdit`, posts the markdown, and DISCARDS the edit. The graph server then reconstructs that
 * same edit by running `difflib` over two whole files — guessing at information this browser had
 * and dropped. `lineOps` stops the discarding.
 *
 * THE PROPERTY THAT MAKES IT SAFE TO SEND BOTH BODIES, and the reason a deploy does not have to be
 * ordered: the op is DERIVED from the folded markdown rather than rebuilt beside it — the
 * replacement text is read back out of `commit.markdown` at `lineIndex`. So the ops and the
 * whole-file body describe the same edit BY CONSTRUCTION, not by two code paths agreeing. An old
 * Worker writes the markdown; a new one prefers the ops; neither can be surprised.
 *
 * ALL THREE KINDS, AND THE THIRD WAS THE LAST ONE STILL POSTING WHOLE FILES. `lineOps` shipped
 * taking a hand-written `"set-line" | "insert-line"`, narrower than `applyEdit`'s own union for no
 * stated reason — so a tick, the commonest gesture in the app, could not ask for its ops and the
 * graph server kept reconstructing every one of them with `difflib`. The exclusion was invisible
 * because it looked deliberate. The parameter is now `SourceEdit["kind"]` and the last test below
 * holds every foldable kind to "mints an op", so a fourth affordance cannot repeat it quietly.
 *
 * THE SCENARIO IS THE OPERATOR'S OWN, and the same four actions proven at the far end of the wire
 * by `server/tests/test_vault_file_edit_ops.py` (an op stream and one whole-file save resolve to
 * identical graph_state and event_log). This checks the NEAR end — that the browser mints the right
 * four ops. Neither test is worth much without the other: this one cannot see resolution, and that
 * one cannot see what the browser sends.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { applyEdit, lineOps } from "../dist/present.js";

const HEADING = "## scratchpad-targets";

test("set-line replaces exactly its own row, half-open", () => {
  const source = [HEADING, "- [ ] one", "- [ ] two"].join("\n");
  const markdown = applyEdit(source, { kind: "set-line", lineIndex: 2, text: "- [ ] two edited" });
  assert.deepEqual(lineOps("set-line", 2, markdown), [[2, 3, ["- [ ] two edited"]]]);
});

test("set-checkbox replaces its own row, exactly as set-line does", () => {
  const source = [HEADING, "- [ ] one", "- [ ] two"].join("\n");
  const markdown = applyEdit(source, { kind: "set-checkbox", lineIndex: 1, checked: true });
  assert.deepEqual(lineOps("set-checkbox", 1, markdown), [[1, 2, ["- [x] one"]]]);
});

test("a tick sends the WHOLE new row, not the one character that changed", () => {
  // The narrowest op the far end can resolve, and the reason it is not narrower: `line_cache` is
  // keyed `(file_path, line_number)` and fingerprinted per line, so nothing in the model is keyed
  // below a line. A character-granular op would have to be reassembled into lines before anything
  // could resolve it — which is the reconstruction this whole mechanism removes.
  const source = [HEADING, "- [ ] one #task [[qntm:7]]"].join("\n");
  const markdown = applyEdit(source, { kind: "set-checkbox", lineIndex: 1, checked: true });
  const [[start, end, replacement]] = lineOps("set-checkbox", 1, markdown);
  assert.deepEqual([start, end], [1, 2]);
  assert.deepEqual(replacement, ["- [x] one #task [[qntm:7]]"]);
});

test("a tick's op and its whole-file body cannot disagree, because the op is read out of the fold", () => {
  // The same property `set-line` and `insert-line` are held to above, asserted for the gesture that
  // makes the most writes. Both bodies ride together at any server precisely because of this.
  const source = [HEADING, "  - [x] nested", "- [ ] flat"].join("\n");
  const markdown = applyEdit(source, { kind: "set-checkbox", lineIndex: 1, checked: false });
  const [[start, end, replacement]] = lineOps("set-checkbox", 1, markdown);
  assert.equal(markdown.split("\n").slice(start, end).join("\n"), replacement.join("\n"));
  assert.equal(replacement[0], "  - [x] nested".replace("[x]", "[ ]"));
});

test("untick mints an op as readily as tick — the direction is not a special case", () => {
  const source = [HEADING, "- [x] done"].join("\n");
  const markdown = applyEdit(source, { kind: "set-checkbox", lineIndex: 1, checked: false });
  assert.deepEqual(lineOps("set-checkbox", 1, markdown), [[1, 2, ["- [ ] done"]]]);
});

test("an out-of-range tick mints nothing, so the write degrades to today's whole-file save", () => {
  // Absent beats wrong, for this kind as for the others. A misplaced op on a tick would tick the
  // wrong task — silent corruption of graph state, not a visible failure.
  assert.equal(lineOps("set-checkbox", 99, "a\nb"), null);
  assert.equal(lineOps("set-checkbox", -1, "a\nb"), null);
});

test("EVERY kind `applyEdit` folds, `lineOps` can express — no affordance posts whole files", () => {
  // THE GUARD AGAINST THIS RECURRING. `set-checkbox` was excluded from `lineOps` by a hand-written
  // union for no stated reason, and the exclusion read as deliberate — which is how the commonest
  // gesture in the app kept posting whole files after the other two stopped. The parameter is now
  // `SourceEdit["kind"]`, so a FOURTH kind is a compile error rather than a silent fourth omission;
  // this asserts the same thing at runtime, where the untyped page lives.
  const folds = [
    { edit: { kind: "set-checkbox", lineIndex: 1, checked: true }, lineIndex: 1 },
    { edit: { kind: "set-line", lineIndex: 1, text: "- [ ] typed" }, lineIndex: 1 },
    { edit: { kind: "insert-line", lineIndex: 2, text: "- [ ] opened" }, lineIndex: 2 },
  ];
  const source = [HEADING, "- [ ] one"].join("\n");
  for (const { edit, lineIndex } of folds) {
    const markdown = applyEdit(source, edit);
    assert.notEqual(markdown, null, `${edit.kind} produced no fold`);
    const ops = lineOps(edit.kind, lineIndex, markdown);
    assert.notEqual(ops, null, `${edit.kind} folds but mints no op — it would post a whole file`);
    assert.equal(ops.length, 1);
  }
});

test("insert-line opens a row rather than replacing one", () => {
  const source = [HEADING, "- [ ] one"].join("\n");
  const markdown = applyEdit(source, { kind: "insert-line", lineIndex: 2, text: "- [ ] two" });
  // start === end is the pure insertion, and it is the ONLY difference from set-line above.
  assert.deepEqual(lineOps("insert-line", 2, markdown), [[2, 2, ["- [ ] two"]]]);
});

test("the replacement text comes from the FOLD, so op and whole-file body cannot disagree", () => {
  const source = [HEADING, "- [ ] one"].join("\n");
  const markdown = applyEdit(source, { kind: "insert-line", lineIndex: 1, text: "- [ ] new" });
  const [[start, end, replacement]] = lineOps("insert-line", 1, markdown);
  // Read the op back out of the body that would be posted alongside it. If these ever diverge, the
  // two halves of one request describe different edits — the failure sending both exists to make
  // impossible.
  assert.equal(
    markdown.split("\n").slice(start, start + replacement.length).join("\n"),
    replacement.join("\n"),
  );
  assert.equal(end, start, "insertion is zero-width");
});

test("THE FOUR ACTIONS: three new tasks, then indent the third under the second", () => {
  let source = HEADING;
  const sent = [];
  const commit = (kind, lineIndex, text) => {
    const markdown = applyEdit(source, { kind, lineIndex, text });
    assert.notEqual(markdown, null, `${kind} at ${lineIndex} produced no edit`);
    sent.push(lineOps(kind, lineIndex, markdown));
    source = markdown;
  };

  commit("insert-line", 1, "- [ ] op task one");
  commit("insert-line", 2, "- [ ] op task two");
  commit("insert-line", 3, "- [ ] op task three");
  // The fourth is the one that matters: an indent is a TEXT edit whose consequence — a PART_OF
  // edge — is DERIVED by the engine from config. Nothing semantic travels; the wire carries
  // characters and a position, and which consequence follows depends on config this browser is
  // not authoritative for.
  commit("set-line", 3, "    - [ ] op task three");

  assert.deepEqual(sent, [
    [[1, 1, ["- [ ] op task one"]]],
    [[2, 2, ["- [ ] op task two"]]],
    [[3, 3, ["- [ ] op task three"]]],
    [[3, 4, ["    - [ ] op task three"]]],
  ]);
  // ALL FOUR LAND, and the end state is the one a single whole-file save would have produced —
  // which is what the server-side sibling then proves resolves identically.
  assert.equal(
    source,
    [HEADING, "- [ ] op task one", "- [ ] op task two", "    - [ ] op task three"].join("\n"),
  );
});

test("an out-of-range index mints nothing rather than an op that would misplace text", () => {
  // Absent beats wrong. `writeFile` sends no `ops` field for a null, which is byte-for-byte the
  // request this browser sent before ops existed. A misplaced op is silent corruption; a missing
  // one is just today's whole-file write.
  assert.equal(lineOps("set-line", 99, "a\nb"), null);
  assert.equal(lineOps("set-line", -1, "a\nb"), null);
});

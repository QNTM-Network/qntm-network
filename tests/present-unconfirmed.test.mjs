// Lines the server has not confirmed yet (2026-10-07).

import { test } from "node:test";
import assert from "node:assert/strict";

import { unconfirmedLines } from "../dist/present.js";

const SERVED = "## Inbox\n- [ ] one [[qntm:1]] #task\n- [ ] two [[qntm:2]] #task";

test("nothing is unconfirmed when the screen matches the server", () => {
  assert.deepEqual([...unconfirmedLines(SERVED, SERVED)], []);
});

test("an edited line is unconfirmed until the server holds it", () => {
  const painted = SERVED.replace("- [ ] two", "- [x] two");
  assert.deepEqual([...unconfirmedLines(painted, SERVED)], [2]);
});

test("a new line is unconfirmed; blank lines never are", () => {
  const painted = SERVED + "\n\n- [ ] three #task";
  assert.deepEqual([...unconfirmedLines(painted, SERVED)], [4]);
});

test("with no served copy nothing is marked", () => {
  assert.deepEqual([...unconfirmedLines(SERVED, undefined)], []);
});

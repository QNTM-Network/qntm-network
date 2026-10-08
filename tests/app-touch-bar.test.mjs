// The touch bar (2026-10-08): on a phone, vim's keys as buttons. Every button presses a key the
// keyboard already has, so the bar cannot grow a behaviour of its own — a button whose key has no
// row in the `?` help fails here. And the page's edit gesture for a phone, a tap on the selected
// line, is `i` through the same handler as the keyboard.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { KEY_HELP, TOUCH_KEYS } from "../dist/present.js";

const DOCUMENTED = new Set(KEY_HELP.flatMap((g) => g.rows.flatMap((r) => r.keys)));
const ALIASES = { d: "dd", Escape: "Escape", Enter: "Shift+Enter" };

test("every button presses a key the help documents, or types a character", () => {
  for (const key of TOUCH_KEYS) {
    if (key.text !== undefined) {
      assert.equal(key.keys, undefined, `${key.label} both types and presses`);
      assert.deepEqual(key.modes, ["INSERT"], `${key.label} types text outside INSERT`);
      continue;
    }
    assert.ok((key.keys ?? []).length > 0, `${key.label} does nothing`);
    for (const name of key.keys) {
      const documented = key.shift ? `Shift+${name}` : (ALIASES[name] ?? name);
      assert.ok(DOCUMENTED.has(documented), `${key.label} presses ${documented}, which the help does not list`);
    }
  }
});

test("each mode has a way out: NORMAL can edit, INSERT can stop", () => {
  const normal = TOUCH_KEYS.filter((k) => k.modes.includes("NORMAL")).flatMap((k) => k.keys ?? []);
  const insert = TOUCH_KEYS.filter((k) => k.modes.includes("INSERT")).flatMap((k) => k.keys ?? []);
  assert.ok(normal.some((k) => ["i", "a", "A", "o"].includes(k)), "no button enters INSERT");
  assert.ok(insert.includes("Escape"), "no button leaves INSERT");
});

test("a click on the selected line is `i`, through globalKey — no timer, no second path", () => {
  const keys = readFileSync(new URL("../app/shell/keys.ts", import.meta.url), "utf8");
  assert.match(keys, /closest\?\.\("\.vim-selected"\)/);
  assert.match(keys, /globalKey\(deps, new KeyboardEvent\("keydown", \{ key: "i"/);
  assert.doesNotMatch(keys, /DOUBLE_CLICK_MS/);
  // Capture phase: the selected row's own click handler stops the click from bubbling.
  assert.match(keys, /\}, true\);/);
});

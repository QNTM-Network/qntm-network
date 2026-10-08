// The `?` help lists every key motions.ts binds (2026-10-07). Reading the source is deliberate: a
// key added to motions.ts without a help row fails here, so the help cannot fall behind.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { KEY_HELP, ModeSurface } from "../dist/present.js";

const MOTIONS = readFileSync(new URL("../app/present/motions.ts", import.meta.url), "utf8");
const DOCUMENTED = new Set(KEY_HELP.flatMap((g) => g.rows.flatMap((r) => r.keys)));
const ALIASES = { ArrowDown: "↓", ArrowUp: "↑", g: "gg", d: "dd", y: "yy" };

test("every key motions.ts binds has a help row", () => {
  const bound = [...MOTIONS.matchAll(/case "([^"]+)":/g)].map((m) => m[1]);
  const extra = [...MOTIONS.matchAll(/key === "([^"]+)"/g)].map((m) => m[1]);
  const missing = [...new Set([...bound, ...extra])]
    .map((k) => ALIASES[k] ?? k)
    .filter((k) => !DOCUMENTED.has(k));
  assert.deepEqual(missing, [], `keys with no help row: ${missing.join(", ")}`);
});

test("? asks for the help overlay", () => {
  assert.equal(new ModeSurface().handleKey("?", 0, 3).effect.kind, "help");
});

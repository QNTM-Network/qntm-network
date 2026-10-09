/**
 * THE WHOLE DECLARATION FROM ONE CALL — scripts/compile-presentation.mjs (2026-10-09). It must say
 * exactly what the seven per-key generators wrote into presentation.json, because the app reads
 * one where it read the other.
 *
 *   node --test tests/compile-presentation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { compile } from "../scripts/compile-presentation.mjs";
import { DEFAULT_CONFIG_DIR, REPO_ROOT } from "../scripts/monorepo-config.mjs";

function tree(root) {
  const files = {};
  (function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith(".")) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(root, path)] = readFileSync(path, "utf8");
    }
  })(root);
  return files;
}

test("the fixture config compiles, and the same files always give the same version", () => {
  const files = tree(join(REPO_ROOT, "tests", "fixtures", "config"));
  const once = compile(files);
  assert.deepEqual(Object.keys(once.declaration).sort(), ["client", "qualification", "resolution", "rules", "structural"]);
  assert.equal(compile(files).version, once.version);
});

test("the operator's config compiles to presentation.json, key for key", { skip: !existsSync(DEFAULT_CONFIG_DIR) && "no monorepo config here" }, () => {
  const files = tree(DEFAULT_CONFIG_DIR);
  const { declaration } = compile(files);
  const committed = JSON.parse(readFileSync(join(REPO_ROOT, "presentation.json"), "utf8"));
  // Hand-typed keys that the compile no longer writes: the note is prose; indentUnit is the
  // client core's own default; the renditions come from client.yaml once it declares them.
  for (const key of ["note", "indentUnit", "checkbox", "heading", "prose", "tags", "stamp"]) {
    if (!(key in declaration)) delete committed[key];
  }
  assert.deepEqual(declaration, committed);
});

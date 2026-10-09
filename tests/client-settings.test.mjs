// Client settings (2026-10-09, backlog row client-settings-in-config): config/client.yaml is
// compiled by scripts/compile-client.mjs into the declaration's `client` key, and every list ranks
// by the declared policy. The client compile is the file's one validity owner; the engine carries
// the file and never reads it (monorepo: SupportedContentType.CLIENT).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { compile, GenerationError, LIST_NAMES as SCRIPT_LISTS, RANK_FIELDS as SCRIPT_FIELDS } from "../scripts/compile-client.mjs";
import {
  LIST_NAMES,
  policyFor,
  presentationFromDeclaration,
  RANK_FIELDS,
  readClientDeclaration,
  searchViews,
  DEFAULT_RANK_POLICIES,
} from "../dist/present.js";

const FIXTURE = readFileSync(new URL("./fixtures/config/client.yaml", import.meta.url), "utf8");

test("the compiler and the client core agree on the lists and the fields", () => {
  assert.deepEqual([...SCRIPT_LISTS], [...LIST_NAMES]);
  assert.deepEqual([...SCRIPT_FIELDS], [...RANK_FIELDS]);
});

test("a declared list compiles to its keys, with the shared demote handed down", () => {
  const { lists } = compile({ "client.yaml": FIXTURE });
  assert.deepEqual(Object.keys(lists), ["search"]);
  assert.deepEqual(lists.search.demote, ["*/everything.md"]);
  assert.equal(lists.search.keys[1].order.join(","), "open,*,done");
});

test("no client.yaml is silence: every list keeps its built-in order", () => {
  assert.deepEqual(compile({}), { lists: undefined });
  assert.deepEqual(policyFor("search", undefined), DEFAULT_RANK_POLICIES.search);
});

test("the compile refuses what the client core cannot run", () => {
  const bad = (text) => assert.throws(() => compile({ "client.yaml": text }), GenerationError, text);
  bad("lists:\n  search:\n    keys:\n      - { field: colour }\n");
  bad("lists:\n  search:\n    keys:\n      - { field: match, direction: sideways }\n");
  bad("lists:\n  sidebar:\n    keys:\n      - { field: match }\n");
  bad("lists:\n  search:\n    keys: []\n");
  bad("lists:\n  search:\n    min_match: 7\n    keys:\n      - { field: match }\n");
  bad("theme: dark\n");
});

test("the page reads the compiled settings, and search ranks by them — Everything sinks", () => {
  const compiled = compile({ "client.yaml": FIXTURE });
  const declared = presentationFromDeclaration({ client: { lists: compiled.lists } });
  assert.deepEqual(declared.problems.filter((p) => p.includes("client")), []);
  const views = [
    { id: "everything", title: "Everything Work", path: "work/everything.md", markdown: "- [ ] Call Jason [[qntm:1]] #task" },
    { id: "tasks", title: "Work Tasks", path: "work/tasks.md", markdown: "- [ ] Email Jason [[qntm:2]] #task" },
  ];
  const statuses = { "[ ]": "open", "[x]": "done" };
  const builtIn = searchViews(views, "jason", { statuses });
  assert.equal(builtIn[0].title, "Call Jason", "the built-in order keeps file order between equals");
  const policy = { ...policyFor("search", declared.lists), keys: [{ field: "demoted", direction: "asc" }, ...policyFor("search", declared.lists).keys] };
  assert.equal(searchViews(views, "jason", { statuses, policy })[0].title, "Email Jason", "the Everything copy did not sink");
});

test("a malformed client key is reported and ignored, never half-applied", () => {
  const { lists, problems } = readClientDeclaration({ client: { lists: { search: { keys: [{ field: "nope" }] } } } });
  assert.deepEqual(lists, {});
  assert.equal(problems.length, 1);
});

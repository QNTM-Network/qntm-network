/**
 * THE WORKER'S GATE-1 ROUTES, DRIVEN FOR REAL — `design-the-runtime-compile.md` step B's second
 * half (`POST /config/compile/structural`), extended by step C to a second generator
 * (`POST /config/compile/qualification`).
 *
 *   node --test tests/worker-config-compile.test.mjs
 *
 * Same posture `tests/app-graph-tenancy.test.mjs` and `tests/worker-cors.test.mjs` already
 * establish for `worker/src/app.js` and `worker/src/util.js`: this drives the REAL route handler
 * (`handleConfig`, imported from `worker/src/config.js`, not a mock of it) with a real `Request`
 * object, over the committed synthetic fixture (`tests/fixtures/config/`) so it runs on every pull
 * request — CI does not clone the monorepo, and both routes' whole reason to exist is to be
 * reachable without one.
 *
 * THREE CLAIMS, PER ROUTE:
 *
 *   1. THE ROUTE COMPILES WHAT IT IS GIVEN — a valid submission returns the exact declaration the
 *      matching pure `compile()` this route calls would return for the same bytes, over the same
 *      fixture `tests/declaration-drop.test.mjs` already trusts.
 *   2. THE MUTATION PROOF — a route that always returned the same canned response would still pass
 *      claim 1. Each section changes ONE byte of the submitted config and asserts the route's
 *      answer actually changes: success becomes a named refusal, with the exact wording the
 *      matching `compile-*.mjs` throws — proving the route recomputes from the submitted bytes
 *      rather than caching or hardcoding an answer, and that the refusal contract this design
 *      document calls "the point of the slice" survives the move into the Worker unchanged, word
 *      for word.
 *   3. MALFORMED REQUESTS ARE REFUSED AT THE DOOR, NEVER CRASH THE ROUTE — bad JSON, a `files` that
 *      is not an object, a file whose contents is not a string. None of these should ever reach
 *      `compile()` at all. Checked once, against the structural route, because `handleConfig`
 *      validates the body BEFORE it looks up which generator's `compile` to call — the same
 *      validation code path serves both routes, and section 4 below proves the qualification route
 *      is wired into that same dispatch rather than a second, independently-drifting copy of it.
 *
 * WHAT THIS FILE DOES NOT PROVE, STATED PLAINLY. This file drives `handleConfig` directly, in
 * Node — it never spawns the real Worker isolate, so it cannot by itself prove Node and `workerd`
 * agree. That comparison was first checked by hand (PR #84's own description has the exact
 * commands and bytes, for structural) and is now re-checked on every push by
 * `scripts/check-isolate-conformance.mjs` (`.github/workflows/isolate-conformance.yml`), which
 * spawns a real, local, un-deployed `wrangler dev` and runs the same three cases this file's own
 * fixtures and mutation anchors are built from, for BOTH generators. It is a separate script rather
 * than a `node --test` file for one reason: it must run and report even when the runtime cannot be
 * spawned at all (three distinct exit codes — see that script's own header), a shape `node --test`'s
 * pass/skip model does not give a straightforward way to make loud.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { handleConfig } from "../worker/src/config.js";
import { compile as compileStructural } from "../scripts/compile-structural.mjs";
import { compile as compileQualification } from "../scripts/compile-qualification.mjs";
import { compile as compileResolution } from "../scripts/compile-resolution.mjs";
import { compile as compileRules, GenerationError } from "../scripts/compile-rules.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CONFIG = resolve(HERE, "fixtures", "config");
const STRUCTURAL_ROUTE_URL = "http://worker.local/config/compile/structural";
const QUALIFICATION_ROUTE_URL = "http://worker.local/config/compile/qualification";
const RESOLUTION_ROUTE_URL = "http://worker.local/config/compile/resolution";
const RULES_ROUTE_URL = "http://worker.local/config/compile/rules";

/** Read the committed fixture into exactly the file map structural's `compile()` expects — the
 * same three things `generate-structural-declaration.mjs`'s own fs shell reads, sorted. */
function readStructuralFixtureFiles() {
  const files = {};
  files["vocabulary/structural_tokens.yaml"] = readFileSync(
    join(FIXTURE_CONFIG, "vocabulary", "structural_tokens.yaml"),
    "utf8",
  );
  files["schema.yaml"] = readFileSync(join(FIXTURE_CONFIG, "schema.yaml"), "utf8");
  const viewsDir = join(FIXTURE_CONFIG, "views");
  for (const f of readdirSync(viewsDir).filter((f) => f.endsWith(".yaml")).sort()) {
    files[`views/${f}`] = readFileSync(join(viewsDir, f), "utf8");
  }
  return files;
}

/** Read the committed fixture into exactly the file map qualification's `compile()` expects — the
 * same four things `generate-qualification-declaration.mjs`'s own fs shell reads, sorted. */
function readQualificationFixtureFiles() {
  const files = {};
  files["schema.yaml"] = readFileSync(join(FIXTURE_CONFIG, "schema.yaml"), "utf8");
  for (const dir of ["patterns", "views", "vocabulary"]) {
    const full = join(FIXTURE_CONFIG, dir);
    for (const f of readdirSync(full).filter((f) => f.endsWith(".yaml")).sort()) {
      files[`${dir}/${f}`] = readFileSync(join(full, f), "utf8");
    }
  }
  return files;
}

/** Read the committed fixture into exactly the file map resolution's `compile()` expects — the
 * same nine things `generate-resolution-declaration.mjs`'s own fs shell reads, sorted. The fixture
 * has no `rules/` tree, so that prefix simply contributes no keys — the same "zero retype rules"
 * shape `readRetypeRules` already treats as legitimate, not an error. */
function readResolutionFixtureFiles() {
  const files = {};
  files["schema.yaml"] = readFileSync(join(FIXTURE_CONFIG, "schema.yaml"), "utf8");
  files["line_grammars.yaml"] = readFileSync(join(FIXTURE_CONFIG, "line_grammars.yaml"), "utf8");
  files["day_boundary.yaml"] = readFileSync(join(FIXTURE_CONFIG, "day_boundary.yaml"), "utf8");
  for (const dir of ["views", "vocabulary", "patterns"]) {
    const full = join(FIXTURE_CONFIG, dir);
    for (const f of readdirSync(full).filter((f) => f.endsWith(".yaml")).sort()) {
      files[`${dir}/${f}`] = readFileSync(join(full, f), "utf8");
    }
  }
  return files;
}

/** Read the committed fixture's `rules/*.yaml` into exactly the file map rules' `compile()`
 * expects — the same two files (`primary.yaml`, `secondary.yaml`) `scripts/check-isolate-
 * conformance.mjs`'s own `rules` generator entry reads for the identical fixture, sorted. Unlike
 * the other three, rules' `compile()` reads no `schema.yaml` and no other directory — see
 * `compile-rules.mjs`'s header: `for_each.pattern` is stored opaquely, never cross-checked against
 * `patterns/`. */
function readRulesFixtureFiles() {
  const files = {};
  const rulesDir = join(FIXTURE_CONFIG, "rules");
  for (const f of readdirSync(rulesDir).filter((f) => f.endsWith(".yaml")).sort()) {
    files[`rules/${f}`] = readFileSync(join(rulesDir, f), "utf8");
  }
  return files;
}

/** POST a files map at the real route handler and return `{status, body}`. */
async function postTo(routeUrl, files) {
  const request = new Request(routeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });
  const response = await handleConfig(request, new URL(routeUrl), "https://qntm.network");
  return { status: response.status, body: await response.json() };
}

const post = (files) => postTo(STRUCTURAL_ROUTE_URL, files);

describe("1a. structural — THE ROUTE COMPILES WHAT IT IS GIVEN", () => {
  test("a valid submission returns exactly what compile() itself returns for the same bytes", async () => {
    const files = readStructuralFixtureFiles();
    const direct = compileStructural(files);
    const { status, body } = await post(files);

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(body.declaration, direct.declaration);
    assert.deepEqual(body.dropped, direct.dropped);
    // A positive control on the shape, not just equality with itself: the fixture's one real
    // structural override (main.nested -> UNLOCKS, outgoing) is actually present.
    assert.equal(body.declaration.indent.edgeType, "PART_OF");
    assert.deepEqual(body.declaration.sections.main.nested, {
      edgeTypes: ["UNLOCKS"],
      edgeDirection: "outgoing",
    });
    // THE RECEIPT — the same version compile() itself computed, and an honest set of promises.
    assert.equal(body.receipt.compiled, true);
    assert.equal(body.receipt.version, direct.version);
    assert.match(body.receipt.version, /^sha256-[0-9a-f]{64}$/);
    assert.equal(body.receipt.stored, false);
    assert.equal(body.receipt.engineAccepted, null);
  });
});

describe("2a. structural — THE MUTATION PROOF", () => {
  test("one changed edge type reference flips success into a named refusal, same wording as compile()", async () => {
    const files = readStructuralFixtureFiles();

    // BEFORE: the unmutated fixture compiles cleanly (claim 1 already proved this; re-asserted
    // here so the mutation below is provably a delta over a working baseline, not a fixture that
    // was broken to begin with).
    const before = await post(files);
    assert.equal(before.status, 200);
    assert.equal(before.body.ok, true);

    // THE MUTATION — one byte of the operator's own artefact, the anchor
    // `tests/declaration-drop.test.mjs` itself uses for the equivalent CLI-side proof: point the
    // one real structural override at an edge type `schema.yaml` has never heard of.
    const anchor = "structural_edge_types: [UNLOCKS]";
    assert.ok(files["views/main.yaml"].includes(anchor), "the mutation's own anchor moved — fixture changed under this test");
    files["views/main.yaml"] = files["views/main.yaml"].replace(
      anchor,
      "structural_edge_types: [MADE_UP_EDGE_TYPE]",
    );

    // WHAT compile() ITSELF SAYS, DIRECTLY — the ground truth the route must match, word for word.
    let directMessage = null;
    try {
      compileStructural(files);
    } catch (error) {
      directMessage = error.message;
    }
    assert.match(directMessage, /'MADE_UP_EDGE_TYPE'.*not declared in schema\.yaml/s);

    // AFTER: the route, given the mutated bytes, refuses — never a 200, never a stack trace.
    const after = await post(files);
    assert.equal(after.status, 422, "a refusal must not be a 200 — the app would show it as success");
    assert.equal(after.body.ok, false);
    assert.equal(after.body.refused, true);
    // THE POINT OF THE SLICE: the exact sentence, unchanged by the move into the Worker route.
    assert.equal(after.body.error, directMessage);
    // THE REFUSAL'S OWN RECEIPT — no version was minted, because nothing compiled.
    assert.equal(after.body.receipt.compiled, false);
    assert.equal(after.body.receipt.version, null);
    assert.equal(after.body.receipt.stored, false);
    assert.equal(after.body.receipt.engineAccepted, null);
  });
});

describe("1b. qualification — THE ROUTE COMPILES WHAT IT IS GIVEN", () => {
  test("a valid submission returns exactly what compile() itself returns for the same bytes", async () => {
    const files = readQualificationFixtureFiles();
    const direct = compileQualification(files);
    const { status, body } = await postTo(QUALIFICATION_ROUTE_URL, files);

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(body.declaration, direct.declaration);
    assert.deepEqual(body.dropped, direct.dropped);
    // A positive control on the shape: the fixture's one publishable pattern, and the one
    // refused-for-traversal pattern (`tests/declaration-drop.test.mjs`'s own DROP 14 anchor).
    assert.ok("local-tasks" in body.declaration.predicates);
    assert.equal(body.declaration.refused["traversing-tasks"], "step 0: traverses (exists+parents)");
    // THE RECEIPT — the same version compile() itself computed, and an honest set of promises.
    assert.equal(body.receipt.compiled, true);
    assert.equal(body.receipt.version, direct.version);
    assert.match(body.receipt.version, /^sha256-[0-9a-f]{64}$/);
    assert.equal(body.receipt.stored, false);
    assert.equal(body.receipt.engineAccepted, null);
  });
});

describe("2b. qualification — THE MUTATION PROOF", () => {
  test("a section naming an undefined pattern flips success into a named refusal, same wording as compile()", async () => {
    const files = readQualificationFixtureFiles();

    // BEFORE: the unmutated fixture compiles cleanly.
    const before = await postTo(QUALIFICATION_ROUTE_URL, files);
    assert.equal(before.status, 200);
    assert.equal(before.body.ok, true);

    // THE MUTATION — one section's own `qualification:` pointed at a pattern name patterns/ never
    // defines. Unlike a per-pattern refusal (which `compile` catches and records in `refused`
    // without throwing), this is a config-integrity defect `compile` cannot recover from — the
    // same class of hard refusal the structural route's mutation above exercises.
    const anchor = "qualification: local-tasks";
    assert.ok(files["views/main.yaml"].includes(anchor), "the mutation's own anchor moved — fixture changed under this test");
    files["views/main.yaml"] = files["views/main.yaml"].replace(anchor, "qualification: does-not-exist");

    // WHAT compile() ITSELF SAYS, DIRECTLY — the ground truth the route must match, word for word.
    let directMessage = null;
    try {
      compileQualification(files);
    } catch (error) {
      directMessage = error.message;
    }
    assert.match(directMessage, /'does-not-exist' names a pattern that no file in patterns\/ defines/);

    // AFTER: the route, given the mutated bytes, refuses — never a 200, never a stack trace.
    const after = await postTo(QUALIFICATION_ROUTE_URL, files);
    assert.equal(after.status, 422, "a refusal must not be a 200 — the app would show it as success");
    assert.equal(after.body.ok, false);
    assert.equal(after.body.refused, true);
    // THE POINT OF THE SLICE: the exact sentence, unchanged by the move into the Worker route.
    assert.equal(after.body.error, directMessage);
    // THE REFUSAL'S OWN RECEIPT — no version was minted, because nothing compiled.
    assert.equal(after.body.receipt.compiled, false);
    assert.equal(after.body.receipt.version, null);
    assert.equal(after.body.receipt.stored, false);
    assert.equal(after.body.receipt.engineAccepted, null);
  });
});

describe("1c. resolution — THE ROUTE COMPILES WHAT IT IS GIVEN", () => {
  test("a valid submission returns exactly what compile() itself returns for the same bytes", async () => {
    const files = readResolutionFixtureFiles();
    const direct = compileResolution(files);
    const { status, body } = await postTo(RESOLUTION_ROUTE_URL, files);

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(body.declaration, direct.declaration);
    assert.deepEqual(body.dropped, direct.dropped);
    // A positive control on the shape, not just equality with itself: the fixture's registration
    // and its one real ordering declaration (main.open -> due_date asc) are actually present.
    assert.equal(body.declaration.registration.defaultNodeType, "task");
    assert.deepEqual(body.declaration.ordering.main.open.ordering, [{ field: "due_date", direction: "asc" }]);
    // THE RECEIPT — the same version compile() itself computed, and an honest set of promises.
    assert.equal(body.receipt.compiled, true);
    assert.equal(body.receipt.version, direct.version);
    assert.match(body.receipt.version, /^sha256-[0-9a-f]{64}$/);
    assert.equal(body.receipt.stored, false);
    assert.equal(body.receipt.engineAccepted, null);
  });
});

describe("2c. resolution — THE MUTATION PROOF", () => {
  test("a view naming a default_node_type schema.yaml never declares flips success into a named refusal, same wording as compile()", async () => {
    const files = readResolutionFixtureFiles();

    // BEFORE: the unmutated fixture compiles cleanly.
    const before = await postTo(RESOLUTION_ROUTE_URL, files);
    assert.equal(before.status, 200);
    assert.equal(before.body.ok, true);

    // THE MUTATION — a view's own `default_node_type:` pointed at a node type schema.yaml has
    // never heard of. This is a config-integrity defect `compile` cannot recover from — the same
    // class of hard refusal the structural and qualification routes' own mutations exercise, and
    // resolution's own analogue of structural's unknown-edge-type refusal.
    const anchor = "main:\n  path: main.md\n";
    assert.ok(files["views/main.yaml"].includes(anchor), "the mutation's own anchor moved — fixture changed under this test");
    files["views/main.yaml"] = files["views/main.yaml"].replace(
      anchor,
      "main:\n  path: main.md\n  default_node_type: totally_made_up_type\n",
    );

    // WHAT compile() ITSELF SAYS, DIRECTLY — the ground truth the route must match, word for word.
    let directMessage = null;
    try {
      compileResolution(files);
    } catch (error) {
      directMessage = error.message;
    }
    assert.match(directMessage, /node type 'totally_made_up_type' is declared as a default_node_type.*not declared in schema\.yaml/s);

    // AFTER: the route, given the mutated bytes, refuses — never a 200, never a stack trace.
    const after = await postTo(RESOLUTION_ROUTE_URL, files);
    assert.equal(after.status, 422, "a refusal must not be a 200 — the app would show it as success");
    assert.equal(after.body.ok, false);
    assert.equal(after.body.refused, true);
    // THE POINT OF THE SLICE: the exact sentence, unchanged by the move into the Worker route.
    assert.equal(after.body.error, directMessage);
    // THE REFUSAL'S OWN RECEIPT — no version was minted, because nothing compiled.
    assert.equal(after.body.receipt.compiled, false);
    assert.equal(after.body.receipt.version, null);
    assert.equal(after.body.receipt.stored, false);
    assert.equal(after.body.receipt.engineAccepted, null);
  });
});

describe("1d. rules — THE ROUTE COMPILES WHAT IT IS GIVEN", () => {
  test("a valid submission returns exactly what compile() itself returns for the same bytes", async () => {
    const files = readRulesFixtureFiles();
    const direct = compileRules(files);
    const { status, body } = await postTo(RULES_ROUTE_URL, files);

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(body.declaration, direct.declaration);
    assert.deepEqual(body.dropped, direct.dropped);
    // A positive control on the shape, not just equality with itself: the fixture's one modelled
    // rule, publishing the exact fact its YAML declares.
    assert.deepEqual(body.declaration.rules["mark-in-progress"], {
      pattern: "local-tasks",
      when: { op: "eq", field: "status", value: "open" },
      priority: 0,
      setsField: "status",
      setsFieldTo: "in_progress",
    });
    // THE RECEIPT — the same version compile() itself computed, and an honest set of promises.
    assert.equal(body.receipt.compiled, true);
    assert.equal(body.receipt.version, direct.version);
    assert.match(body.receipt.version, /^sha256-[0-9a-f]{64}$/);
    assert.equal(body.receipt.stored, false);
    assert.equal(body.receipt.engineAccepted, null);
  });
});

describe("2d. rules — THE MUTATION PROOF", () => {
  test(
    "UNLIKE THE OTHER THREE: compile-rules.mjs never refuses over an unmodelled rule shape — " +
      "it DROPS it and still answers 200. The one shape it refuses outright is a duplicate rule " +
      "id (the engine's own seen_ids check), so THAT is this route's mutation anchor.",
    async () => {
      const files = readRulesFixtureFiles();

      // BEFORE: the unmutated fixture compiles cleanly (claim 1 already proved this; re-asserted
      // here so the mutation below is provably a delta over a working baseline).
      const before = await postTo(RULES_ROUTE_URL, files);
      assert.equal(before.status, 200);
      assert.equal(before.body.ok, true);

      // THE MUTATION — rename secondary.yaml's own rule id to collide with primary.yaml's.
      const anchor = "id: note-in-progress";
      assert.ok(files["rules/secondary.yaml"].includes(anchor), "the mutation's own anchor moved — fixture changed under this test");
      files["rules/secondary.yaml"] = files["rules/secondary.yaml"].replace(anchor, "id: mark-in-progress");

      // WHAT compile() ITSELF SAYS, DIRECTLY — the ground truth the route must match, word for word.
      let directMessage = null;
      let directIsGenerationError = false;
      try {
        compileRules(files);
      } catch (error) {
        directMessage = error.message;
        directIsGenerationError = error instanceof GenerationError;
      }
      assert.ok(directIsGenerationError, "the mutation must trigger compile-rules.mjs's own GenerationError, not some other throw");
      assert.match(directMessage, /declared in two files/);

      // AFTER: the route, given the mutated bytes, refuses — never a 200, never a stack trace.
      const after = await postTo(RULES_ROUTE_URL, files);
      assert.equal(after.status, 422, "a refusal must not be a 200 — the app would show it as success");
      assert.equal(after.body.ok, false);
      assert.equal(after.body.refused, true);
      // THE POINT OF THE SLICE: the exact sentence, unchanged by the move into the Worker route.
      assert.equal(after.body.error, directMessage);
      // THE REFUSAL'S OWN RECEIPT — no version was minted, because nothing compiled.
      assert.equal(after.body.receipt.compiled, false);
      assert.equal(after.body.receipt.version, null);
      assert.equal(after.body.receipt.stored, false);
      assert.equal(after.body.receipt.engineAccepted, null);
    },
  );
});

describe("3. malformed requests are refused at the door, never reach compile()", () => {
  test("a body that is not valid JSON", async () => {
    const request = new Request(STRUCTURAL_ROUTE_URL, { method: "POST", body: "not json" });
    const response = await handleConfig(request, new URL(STRUCTURAL_ROUTE_URL), "https://qntm.network");
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /not valid JSON/);
  });

  test("'files' missing entirely", async () => {
    const { status, body } = await post(undefined);
    assert.equal(status, 400);
    assert.match(body.error, /'files' must be an object/);
  });

  test("'files' is an array, not an object", async () => {
    const request = new Request(STRUCTURAL_ROUTE_URL, {
      method: "POST",
      body: JSON.stringify({ files: ["not", "an", "object"] }),
    });
    const response = await handleConfig(request, new URL(STRUCTURAL_ROUTE_URL), "https://qntm.network");
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error, /'files' must be an object/);
  });

  test("a file's contents is not a string", async () => {
    const request = new Request(STRUCTURAL_ROUTE_URL, {
      method: "POST",
      body: JSON.stringify({ files: { "schema.yaml": 12345 } }),
    });
    const response = await handleConfig(request, new URL(STRUCTURAL_ROUTE_URL), "https://qntm.network");
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error, /is not a string/);
  });

  test("an unrelated path returns null — neither route answers it", async () => {
    const request = new Request("http://worker.local/config/something-else", { method: "GET" });
    const response = await handleConfig(request, new URL(request.url), "https://qntm.network");
    assert.equal(response, null);
  });
});

describe("4. the three routes are independently addressed, not one dispatcher guessing", () => {
  test("the qualification route never answers a structural-shaped request path, and vice versa", async () => {
    // Each URL only answers ITS OWN route — proven by posting the OTHER generator's fixture keys
    // at the WRONG route and confirming it is refused as a malformed submission (missing the keys
    // that route's own compile() requires), never silently misinterpreted.
    const structuralFiles = readStructuralFixtureFiles();
    const { status, body } = await postTo(QUALIFICATION_ROUTE_URL, structuralFiles);
    // structural's files map has no schema.yaml discrepancy — it DOES include schema.yaml — but it
    // has no patterns/ or vocabulary/ keys qualification's compile() requires, so it refuses named,
    // never crashes and never silently compiles the wrong grammar.
    assert.equal(status, 422);
    assert.equal(body.refused, true);
  });

  test("the resolution route refuses a structural-shaped or a qualification-shaped submission", async () => {
    // NOT SYMMETRIC WITH THE PAIR ABOVE, AND SAID SO RATHER THAN ASSUMED. Resolution's own files
    // map is the largest of the three (every views/*.yaml, every vocabulary/*.yaml — INCLUDING
    // structural_tokens.yaml — every patterns/*.yaml, plus line_grammars.yaml/day_boundary.yaml),
    // a superset of what BOTH other routes require; posting a resolution-shaped submission at
    // either of the other two routes actually SUCCEEDS rather than refuses (checked directly, not
    // assumed), so this test only claims the direction that is true: structural's and
    // qualification's own narrower fixtures are each missing something resolution's compile()
    // requires (line_grammars.yaml, day_boundary.yaml, or vocabulary/markers.yaml, depending on
    // which is posted), so both refuse, named, never a 200 and never a crash.
    const structuralFiles = readStructuralFixtureFiles();
    const r1 = await postTo(RESOLUTION_ROUTE_URL, structuralFiles);
    assert.equal(r1.status, 422);
    assert.equal(r1.body.refused, true);

    const qualificationFiles = readQualificationFixtureFiles();
    const r2 = await postTo(RESOLUTION_ROUTE_URL, qualificationFiles);
    assert.equal(r2.status, 422);
    assert.equal(r2.body.refused, true);
  });

  test(
    "the rules route does NOT refuse a structural/qualification/resolution-shaped submission — " +
      "it sees no 'rules/' keys and answers an EMPTY category, 200, not a refusal. Stated, not " +
      "assumed: unlike the other three, compile-rules.mjs requires nothing to be present at all " +
      "(a category with zero rules is legitimate — compile-rules.mjs's own header).",
    async () => {
      const structuralFiles = readStructuralFixtureFiles();
      const { status, body } = await postTo(RULES_ROUTE_URL, structuralFiles);
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.deepEqual(body.declaration.rules, {});
      assert.deepEqual(body.declaration.order.sequence, []);
    },
  );

  test("a rules-shaped submission (only 'rules/' keys) refuses at the other three routes — each is missing what it requires", async () => {
    const rulesFiles = readRulesFixtureFiles();
    for (const url of [STRUCTURAL_ROUTE_URL, QUALIFICATION_ROUTE_URL, RESOLUTION_ROUTE_URL]) {
      const { status, body } = await postTo(url, rulesFiles);
      assert.equal(status, 422, `${url} did not refuse a rules-shaped submission`);
      assert.equal(body.refused, true);
    }
  });
});

describe("5. THE RECEIPT'S VERSION — the two properties that matter, both by mutation, both through the real route", () => {
  /**
   * Determinism is the whole point (`design-the-runtime-compile.md` §8 step A): the same config
   * must produce the same key, so an unchanged config cannot mint a new version, and a changed one
   * cannot reuse an old one. Both properties are proven here through the ACTUAL Worker route, not
   * only against `compile()` directly — the version a caller receives is the one this test drives.
   *
   * EVERY MUTATION BELOW IS A VALID CONFIG CHANGE, DELIBERATELY, NOT A REFUSAL. Section 2's own
   * mutation proofs already show a version is never minted when Gate 1 refuses (`receipt.version`
   * is `null` there). The property this section proves is the other one: a config that still
   * compiles, but differently, must not be mistaken for the config that produced the version
   * before it.
   */
  test("structural: two identical submissions receive the identical version; one valid field flip does not", async () => {
    const files = readStructuralFixtureFiles();

    const first = await post(files);
    const second = await post(files);
    assert.equal(first.body.receipt.version, second.body.receipt.version, "an unchanged config minted a new version");

    const anchor = "structural_edge_direction: outgoing";
    assert.ok(files["views/main.yaml"].includes(anchor), "the mutation's own anchor moved — fixture changed under this test");
    files["views/main.yaml"] = files["views/main.yaml"].replace(anchor, "structural_edge_direction: incoming");
    const mutated = await post(files);
    assert.equal(mutated.status, 200, "the mutation was meant to stay valid — both directions are legal");
    assert.notEqual(
      mutated.body.receipt.version,
      first.body.receipt.version,
      "a changed config reused the old version",
    );
    assert.notDeepEqual(mutated.body.declaration, first.body.declaration, "the mutation's own anchor did not change the declaration — the version test proves nothing");
  });

  test("qualification: two identical submissions receive the identical version; one valid field flip does not", async () => {
    const files = readQualificationFixtureFiles();

    const first = await postTo(QUALIFICATION_ROUTE_URL, files);
    const second = await postTo(QUALIFICATION_ROUTE_URL, files);
    assert.equal(first.body.receipt.version, second.body.receipt.version, "an unchanged config minted a new version");

    const anchor = "status: open";
    assert.ok(files["patterns/basic.yaml"].includes(anchor), "the mutation's own anchor moved — fixture changed under this test");
    files["patterns/basic.yaml"] = files["patterns/basic.yaml"].replace(anchor, "status: done");
    const mutated = await postTo(QUALIFICATION_ROUTE_URL, files);
    assert.equal(mutated.status, 200, "the mutation was meant to stay valid — both statuses are legal");
    assert.notEqual(
      mutated.body.receipt.version,
      first.body.receipt.version,
      "a changed config reused the old version",
    );
    assert.notDeepEqual(mutated.body.declaration, first.body.declaration, "the mutation's own anchor did not change the declaration — the version test proves nothing");
  });

  test("resolution: two identical submissions receive the identical version; one valid field flip does not", async () => {
    const files = readResolutionFixtureFiles();

    const first = await postTo(RESOLUTION_ROUTE_URL, files);
    const second = await postTo(RESOLUTION_ROUTE_URL, files);
    assert.equal(first.body.receipt.version, second.body.receipt.version, "an unchanged config minted a new version");

    const anchor = "direction: asc";
    assert.ok(files["views/main.yaml"].includes(anchor), "the mutation's own anchor moved — fixture changed under this test");
    files["views/main.yaml"] = files["views/main.yaml"].replace(anchor, "direction: desc");
    const mutated = await postTo(RESOLUTION_ROUTE_URL, files);
    assert.equal(mutated.status, 200, "the mutation was meant to stay valid — both directions are legal");
    assert.notEqual(
      mutated.body.receipt.version,
      first.body.receipt.version,
      "a changed config reused the old version",
    );
    assert.notDeepEqual(mutated.body.declaration, first.body.declaration, "the mutation's own anchor did not change the declaration — the version test proves nothing");
  });

  test("rules: two identical submissions receive the identical version; one valid field flip does not", async () => {
    const files = readRulesFixtureFiles();

    const first = await postTo(RULES_ROUTE_URL, files);
    const second = await postTo(RULES_ROUTE_URL, files);
    assert.equal(first.body.receipt.version, second.body.receipt.version, "an unchanged config minted a new version");

    // A valid field flip, deliberately not the duplicate-id refusal section 2d already covers.
    const anchor = "value: in_progress";
    assert.ok(files["rules/primary.yaml"].includes(anchor), "the mutation's own anchor moved — fixture changed under this test");
    files["rules/primary.yaml"] = files["rules/primary.yaml"].replace(anchor, "value: blocked");
    const mutated = await postTo(RULES_ROUTE_URL, files);
    assert.equal(mutated.status, 200, "the mutation was meant to stay valid — both field values are legal");
    assert.notEqual(
      mutated.body.receipt.version,
      first.body.receipt.version,
      "a changed config reused the old version",
    );
    assert.notDeepEqual(mutated.body.declaration, first.body.declaration, "the mutation's own anchor did not change the declaration — the version test proves nothing");
  });
});

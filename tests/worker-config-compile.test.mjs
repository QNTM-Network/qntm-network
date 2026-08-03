/**
 * THE WORKER'S GATE-1 ROUTE, DRIVEN FOR REAL — `design-the-runtime-compile.md` step B's second
 * half: `POST /config/compile/structural`.
 *
 *   node --test tests/worker-config-compile.test.mjs
 *
 * Same posture `tests/app-graph-tenancy.test.mjs` and `tests/worker-cors.test.mjs` already
 * establish for `worker/src/app.js` and `worker/src/util.js`: this drives the REAL route handler
 * (`handleConfig`, imported from `worker/src/config.js`, not a mock of it) with a real `Request`
 * object, over the committed synthetic fixture (`tests/fixtures/config/`) so it runs on every pull
 * request — CI does not clone the monorepo, and this route's whole reason to exist is to be
 * reachable without one.
 *
 * THREE CLAIMS:
 *
 *   1. THE ROUTE COMPILES WHAT IT IS GIVEN — a valid submission returns the exact declaration the
 *      pure `compile()` this route calls would return for the same bytes, over the same fixture
 *      `tests/declaration-drop.test.mjs` already trusts.
 *   2. THE MUTATION PROOF — a route that always returned the same canned response would still pass
 *      claim 1. This section changes ONE byte of the submitted config (one edge type reference)
 *      and asserts the route's answer actually changes: success becomes a named refusal, with the
 *      exact wording `scripts/compile-structural.mjs` throws — proving the route recomputes from
 *      the submitted bytes rather than caching or hardcoding an answer, and that the refusal
 *      contract this design document calls "the point of the slice" survives the move into the
 *      Worker unchanged, word for word.
 *   3. MALFORMED REQUESTS ARE REFUSED AT THE DOOR, NEVER CRASH THE ROUTE — bad JSON, a `files` that
 *      is not an object, a file whose contents is not a string. None of these should ever reach
 *      `compile()` at all.
 *
 * WHAT THIS FILE DOES NOT PROVE, STATED PLAINLY. This file drives `handleConfig` directly, in
 * Node — it never spawns the real Worker isolate, so it cannot by itself prove Node and `workerd`
 * agree. That comparison was first checked by hand (PR #84's own description has the exact
 * commands and bytes) and is now re-checked on every push by
 * `scripts/check-isolate-conformance.mjs` (`.github/workflows/isolate-conformance.yml`), which
 * spawns a real, local, un-deployed `wrangler dev` and runs the same three cases this file's own
 * fixture and mutation anchor are built from. It is a separate script rather than a `node --test`
 * file for one reason: it must run and report even when the runtime cannot be spawned at all
 * (three distinct exit codes — see that script's own header), a shape `node --test`'s pass/skip
 * model does not give a straightforward way to make loud.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { handleConfig } from "../worker/src/config.js";
import { compile } from "../scripts/compile-structural.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CONFIG = resolve(HERE, "fixtures", "config");
const ROUTE_URL = "http://worker.local/config/compile/structural";

/** Read the committed fixture into exactly the file map `compile()` expects — the same three
 * things `generate-structural-declaration.mjs`'s own fs shell reads, in the same sorted order. */
function readFixtureFiles() {
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

/** POST a files map at the real route handler and return `{status, body}`. */
async function post(files) {
  const request = new Request(ROUTE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });
  const response = await handleConfig(request, new URL(ROUTE_URL), "https://qntm.network");
  return { status: response.status, body: await response.json() };
}

describe("1. THE ROUTE COMPILES WHAT IT IS GIVEN", () => {
  test("a valid submission returns exactly what compile() itself returns for the same bytes", async () => {
    const files = readFixtureFiles();
    const direct = compile(files);
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
  });
});

describe("2. THE MUTATION PROOF — the route recomputes from the submitted bytes, not a canned answer", () => {
  test("one changed edge type reference flips success into a named refusal, same wording as compile()", async () => {
    const files = readFixtureFiles();

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
      compile(files);
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
  });
});

describe("3. malformed requests are refused at the door, never reach compile()", () => {
  test("a body that is not valid JSON", async () => {
    const request = new Request(ROUTE_URL, { method: "POST", body: "not json" });
    const response = await handleConfig(request, new URL(ROUTE_URL), "https://qntm.network");
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
    const request = new Request(ROUTE_URL, {
      method: "POST",
      body: JSON.stringify({ files: ["not", "an", "object"] }),
    });
    const response = await handleConfig(request, new URL(ROUTE_URL), "https://qntm.network");
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error, /'files' must be an object/);
  });

  test("a file's contents is not a string", async () => {
    const request = new Request(ROUTE_URL, {
      method: "POST",
      body: JSON.stringify({ files: { "schema.yaml": 12345 } }),
    });
    const response = await handleConfig(request, new URL(ROUTE_URL), "https://qntm.network");
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error, /is not a string/);
  });

  test("an unrelated path returns null — this route only answers its own", async () => {
    const request = new Request("http://worker.local/config/something-else", { method: "GET" });
    const response = await handleConfig(request, new URL(request.url), "https://qntm.network");
    assert.equal(response, null);
  });
});

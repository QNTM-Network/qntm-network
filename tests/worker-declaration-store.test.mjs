/**
 * THE COMPILED DECLARATION GETS SOMEWHERE TO LIVE — `worker/src/declarations.js`, the piece
 * `design-the-runtime-compile.md` §2.3/§4 names and `config.js`'s own Gate-1-only route
 * deliberately leaves undone ("Nothing here is stored... not this route's job").
 *
 *   node --test tests/worker-declaration-store.test.mjs
 *
 * FIVE CLAIMS, DRIVEN AGAINST THE REAL ROUTE HANDLER (`handleDeclarations`, imported from
 * `worker/src/declarations.js`, never a mock of it), over an in-memory D1 stand-in that actually
 * executes the three operations this file's SQL uses (INSERT ... ON CONFLICT DO NOTHING, an
 * upsert, and a keyed SELECT) rather than only pattern-matching statement text — so the idempotency
 * and round-trip claims below are proved against real accumulated state, not an echo.
 *
 *   1. THE WRITE IS OPERATOR-ONLY. An unauthenticated POST is refused, 401, and the store is never
 *      touched — proved by asserting the underlying map stays empty, not only by the status code.
 *   2. THE ROUND TRIP. compile -> store -> read back (by version, and by "current" without ever
 *      naming the version) -> byte-identical to what `compile()` itself produced.
 *   3. IDEMPOTENCY. The identical files POSTed twice store exactly one row — not "the second
 *      response looks like the first", but the row count itself, checked directly.
 *   4. A REFUSED COMPILE STORES NOTHING. Gate 1's own refusal contract, unchanged by this file —
 *      `stored` is honestly `false`, and the underlying table gains no row.
 *   5. THE POINTER MOVES; THE OLD VERSION SURVIVES. A second, differently-valid config becomes the
 *      new "current" — the OLD version is still readable by its own key throughout, because
 *      nothing here ever deletes a stored declaration.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { handleDeclarations } from "../worker/src/declarations.js";
import { compile as compileStructural } from "../scripts/compile-structural.mjs";
import { compile as compileRules } from "../scripts/compile-rules.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CONFIG = resolve(HERE, "fixtures", "config");
const OPERATOR_ID = "operator-uuid";
const OPERATOR_KEY = "the-operator-shared-key";

/** Read the committed fixture into exactly the file map structural's `compile()` expects — the
 * same reader `tests/worker-config-compile.test.mjs` already uses for the same fixture. */
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

/** Read the committed fixture's `rules/*.yaml`, `patterns/*.yaml` and `vocabulary/markers.yaml` —
 * the same reader `tests/worker-config-compile.test.mjs` uses for the identical fixture; see that
 * file's own header for why `patterns/`/`vocabulary/` are needed now too. */
function readRulesFixtureFiles() {
  const files = {};
  const rulesDir = join(FIXTURE_CONFIG, "rules");
  for (const f of readdirSync(rulesDir).filter((f) => f.endsWith(".yaml")).sort()) {
    files[`rules/${f}`] = readFileSync(join(rulesDir, f), "utf8");
  }
  const patternsDir = join(FIXTURE_CONFIG, "patterns");
  for (const f of readdirSync(patternsDir).filter((f) => f.endsWith(".yaml")).sort()) {
    files[`patterns/${f}`] = readFileSync(join(patternsDir, f), "utf8");
  }
  files["vocabulary/markers.yaml"] = readFileSync(join(FIXTURE_CONFIG, "vocabulary", "markers.yaml"), "utf8");
  return files;
}

// ── an in-memory D1 stand-in that REALLY EXECUTES the three operations declarations.js issues ──
// Not a SQL engine — it inspects each statement's own distinctive fragment to decide which of the
// two tables it touches, exactly `tests/app-graph-tenancy.test.mjs`'s own `makeDb()` convention —
// but unlike that file's stub, this one keeps REAL, MUTATING Maps behind it, because the claims
// this suite makes (idempotency, round trip, pointer movement) are about ACCUMULATED STATE across
// several calls, not about one call's return shape.
function makeDb() {
  const declarations = new Map(); // `${userId}|${kind}|${version}` -> {declaration_json, dropped_json}
  const current = new Map(); // `${userId}|${kind}` -> version

  function stmt(sql) {
    return {
      bind: (...params) => ({
        run: async () => {
          if (sql.includes("INSERT INTO declarations")) {
            const [userId, kind, version, declarationJson, droppedJson] = params;
            const key = `${userId}|${kind}|${version}`;
            // A TRUTHFUL PRIMARY-KEY CONSTRAINT, NOT A HARDCODED DEDUP. If this statement's own
            // text does not say "ON CONFLICT ... DO NOTHING", a repeat of the same key throws —
            // exactly what SQLite/D1 does for a plain INSERT against an existing PRIMARY KEY. This
            // is what makes claim 3 (idempotency) a real test of `declarations.js`'s own SQL
            // rather than of this stub's assumption that inserts are always deduplicated.
            if (declarations.has(key)) {
              if (sql.includes("ON CONFLICT") && sql.includes("DO NOTHING")) {
                return { success: true }; // the real no-op this clause exists to produce
              }
              throw new Error("UNIQUE constraint failed: declarations.user_id, declarations.kind, declarations.version");
            }
            declarations.set(key, { declaration_json: declarationJson, dropped_json: droppedJson });
            return { success: true };
          }
          if (sql.includes("INSERT INTO declaration_current")) {
            const [userId, kind, version] = params;
            current.set(`${userId}|${kind}`, version);
            return { success: true };
          }
          throw new Error(`unstubbed run(): ${sql}`);
        },
        first: async () => {
          if (sql.includes("FROM declarations")) {
            const [userId, kind, version] = params;
            return declarations.get(`${userId}|${kind}|${version}`) || null;
          }
          if (sql.includes("FROM declaration_current")) {
            const [userId, kind] = params;
            const version = current.get(`${userId}|${kind}`);
            return version ? { version } : null;
          }
          throw new Error(`unstubbed first(): ${sql}`);
        },
      }),
    };
  }

  return { prepare: (sql) => stmt(sql), _rows: declarations, _pointers: current };
}

function makeEnv(overrides = {}) {
  return {
    DB: makeDb(),
    GRAPH_PUSH_KEY: OPERATOR_KEY,
    GRAPH_USER_ID: OPERATOR_ID,
    ...overrides,
  };
}

async function post(env, kind, files, token = OPERATOR_KEY) {
  const url = `http://worker.local/config/declaration/${kind}`;
  const request = new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ files }),
  });
  const response = await handleDeclarations(request, env, new URL(url), "https://qntm.network");
  return { status: response.status, headers: response.headers, body: await response.json() };
}

async function get(env, kind, versionOrCurrent) {
  const url = `http://worker.local/config/declaration/${kind}/${versionOrCurrent}`;
  const request = new Request(url, { method: "GET" });
  const response = await handleDeclarations(request, env, new URL(url), "https://qntm.network");
  return response
    ? { status: response.status, headers: response.headers, body: await response.json() }
    : { status: null, headers: null, body: null };
}

describe("1. THE WRITE IS OPERATOR-ONLY", () => {
  test("an unauthenticated POST is refused, and the store is never touched", async () => {
    const env = makeEnv();
    const files = readStructuralFixtureFiles();

    const noToken = await post(env, "structural", files, null);
    assert.equal(noToken.status, 401);
    assert.equal(noToken.body.ok, false);

    const wrongToken = await post(env, "structural", files, "not-the-operator-key");
    assert.equal(wrongToken.status, 401);

    // THE STRONGEST FORM OF THE ASSERTION: not "got a 401" alone, but that nothing durable
    // happened — the underlying map is still empty, not merely that the response looks refused.
    assert.equal(env.DB._rows.size, 0, "an unauthenticated write reached the store");
    assert.equal(env.DB._pointers.size, 0, "an unauthenticated write moved the pointer");
  });
});

describe("2. THE ROUND TRIP — compile -> store -> read back, byte-identical", () => {
  test("read by version, and read 'current' without ever naming the version, both match compile() exactly", async () => {
    const env = makeEnv();
    const files = readStructuralFixtureFiles();
    const direct = compileStructural(files);

    const stored = await post(env, "structural", files);
    assert.equal(stored.status, 200);
    assert.equal(stored.body.receipt.compiled, true);
    assert.equal(stored.body.receipt.version, direct.version);
    assert.equal(stored.body.receipt.stored, true);
    assert.equal(stored.body.receipt.engineAccepted, null, "engineAccepted must stay null, never false, when the engine was never asked");

    // BY VERSION — an immutable, cache-forever read.
    const byVersion = await get(env, "structural", direct.version);
    assert.equal(byVersion.status, 200);
    assert.deepEqual(byVersion.body.declaration, direct.declaration);
    assert.deepEqual(byVersion.body.dropped, direct.dropped);
    assert.equal(byVersion.headers.get("Cache-Control"), "public, max-age=31536000, immutable");

    // BY "current" — no version named by the caller, and the response NAMES which version it
    // resolved to, so a caller can tell the two reads agree without a third round trip.
    const byCurrent = await get(env, "structural", "current");
    assert.equal(byCurrent.status, 200);
    assert.equal(byCurrent.body.version, direct.version);
    assert.deepEqual(byCurrent.body.declaration, direct.declaration);
    assert.deepEqual(byCurrent.body.dropped, direct.dropped);
    assert.equal(byCurrent.headers.get("Cache-Control"), "no-cache", "the pointer must never be served stale");
  });

  test("a version nobody has stored, and 'current' before anything is stored, both 404", async () => {
    const env = makeEnv();
    const neverStored = await get(env, "structural", "sha256-" + "0".repeat(64));
    assert.equal(neverStored.status, 404);

    const noCurrentYet = await get(env, "structural", "current");
    assert.equal(noCurrentYet.status, 404);
  });
});

describe("3. IDEMPOTENCY — the identical bytes, stored twice, are one row", () => {
  test("posting the same files twice produces exactly one stored row, not two", async () => {
    const env = makeEnv();
    const files = readStructuralFixtureFiles();

    const first = await post(env, "structural", files);
    assert.equal(env.DB._rows.size, 1, "the first store did not create exactly one row");

    const second = await post(env, "structural", files);
    assert.equal(first.body.receipt.version, second.body.receipt.version, "identical input minted a new version");
    assert.equal(second.body.receipt.stored, true, "a repeat store must still report stored: true — the bytes ARE durable");

    // THE LOAD-BEARING ASSERTION: row COUNT, not response shape. A route that silently duplicated
    // storage on every repeat would still pass every assertion above.
    assert.equal(env.DB._rows.size, 1, "storing the same bytes twice created a duplicate row");
  });
});

describe("4. A REFUSED COMPILE STORES NOTHING", () => {
  test("Gate 1's own refusal — nothing durable happens, and the receipt says so honestly", async () => {
    const env = makeEnv();
    const files = readStructuralFixtureFiles();
    const anchor = "structural_edge_types: [UNLOCKS]";
    assert.ok(files["views/main.yaml"].includes(anchor), "the mutation's own anchor moved — fixture changed under this test");
    files["views/main.yaml"] = files["views/main.yaml"].replace(anchor, "structural_edge_types: [MADE_UP_EDGE_TYPE]");

    const refused = await post(env, "structural", files);
    assert.equal(refused.status, 422);
    assert.equal(refused.body.ok, false);
    assert.equal(refused.body.refused, true);
    assert.equal(refused.body.receipt.compiled, false);
    assert.equal(refused.body.receipt.version, null);
    assert.equal(refused.body.receipt.stored, false);
    assert.equal(refused.body.receipt.engineAccepted, null);

    assert.equal(env.DB._rows.size, 0, "a refused compile still wrote a row");
    assert.equal(env.DB._pointers.size, 0, "a refused compile still moved the pointer");
  });
});

describe("5. THE POINTER MOVES; THE OLD VERSION SURVIVES", () => {
  test("a second, differently-valid config becomes 'current' without deleting the first", async () => {
    const env = makeEnv();
    const filesA = readStructuralFixtureFiles();
    const first = await post(env, "structural", filesA);
    const versionA = first.body.receipt.version;

    // A second, still-valid config — the same mutation `tests/worker-config-compile.test.mjs`
    // §5 uses to prove a version changes for a valid field flip (not a refusal).
    const filesB = readStructuralFixtureFiles();
    const anchor = "structural_edge_direction: outgoing";
    assert.ok(filesB["views/main.yaml"].includes(anchor), "the mutation's own anchor moved — fixture changed under this test");
    filesB["views/main.yaml"] = filesB["views/main.yaml"].replace(anchor, "structural_edge_direction: incoming");
    const second = await post(env, "structural", filesB);
    assert.equal(second.status, 200, "the second config was meant to stay valid");
    const versionB = second.body.receipt.version;
    assert.notEqual(versionA, versionB, "the mutation did not actually change the version — this test proves nothing");

    // "current" now resolves to B...
    const current = await get(env, "structural", "current");
    assert.equal(current.body.version, versionB);

    // ...and A is STILL readable, unchanged, by its own key — nothing here ever deletes.
    const stillA = await get(env, "structural", versionA);
    assert.equal(stillA.status, 200);
    assert.equal(stillA.body.version, versionA);
    assert.notDeepEqual(stillA.body.declaration, current.body.declaration);

    assert.equal(env.DB._rows.size, 2, "both versions must coexist in storage");
  });
});

describe("6. THE FOURTH KIND — 'rules' is not a special case; the same generic route serves it", () => {
  test("unauthenticated POST to /config/declaration/rules is refused, 401, nothing written", async () => {
    const env = makeEnv();
    const files = readRulesFixtureFiles();
    const noToken = await post(env, "rules", files, null);
    assert.equal(noToken.status, 401);
    assert.equal(env.DB._rows.size, 0, "an unauthenticated write reached the store");
    assert.equal(env.DB._pointers.size, 0, "an unauthenticated write moved the pointer");
  });

  test("authorised store -> 200 with a real version; both reads (by version, and 'current') round-trip byte-identical", async () => {
    const env = makeEnv();
    const files = readRulesFixtureFiles();
    const direct = compileRules(files);

    const stored = await post(env, "rules", files);
    assert.equal(stored.status, 200);
    assert.equal(stored.body.receipt.compiled, true);
    assert.equal(stored.body.receipt.version, direct.version);
    assert.match(stored.body.receipt.version, /^sha256-[0-9a-f]{64}$/);
    assert.equal(stored.body.receipt.stored, true);
    assert.equal(stored.body.receipt.engineAccepted, null);

    const byVersion = await get(env, "rules", direct.version);
    assert.equal(byVersion.status, 200);
    assert.deepEqual(byVersion.body.declaration, direct.declaration);
    assert.deepEqual(byVersion.body.dropped, direct.dropped);
    assert.equal(byVersion.headers.get("Cache-Control"), "public, max-age=31536000, immutable");

    const byCurrent = await get(env, "rules", "current");
    assert.equal(byCurrent.status, 200);
    assert.equal(byCurrent.body.version, direct.version);
    assert.deepEqual(byCurrent.body.declaration, direct.declaration);
    assert.equal(byCurrent.headers.get("Cache-Control"), "no-cache", "the pointer must never be served stale");
  });

  test("an unknown version 404s, and posting the same bytes twice is idempotent (one row, not two)", async () => {
    const env = makeEnv();
    const neverStored = await get(env, "rules", "sha256-" + "0".repeat(64));
    assert.equal(neverStored.status, 404);

    const files = readRulesFixtureFiles();
    const first = await post(env, "rules", files);
    assert.equal(env.DB._rows.size, 1);
    const second = await post(env, "rules", files);
    assert.equal(first.body.receipt.version, second.body.receipt.version, "identical input minted a new version");
    assert.equal(second.body.receipt.stored, true, "a repeat store must still report stored: true");
    assert.equal(env.DB._rows.size, 1, "storing the same bytes twice created a duplicate row");
  });

  test("'structural' and 'rules' are stored under separate (kind) keys — no cross-talk between kinds", async () => {
    const env = makeEnv();
    const structuralFiles = readStructuralFixtureFiles();
    const rulesFiles = readRulesFixtureFiles();

    await post(env, "structural", structuralFiles);
    await post(env, "rules", rulesFiles);
    assert.equal(env.DB._rows.size, 2, "two different kinds must occupy two separate rows");
    assert.equal(env.DB._pointers.size, 2, "two different kinds must occupy two separate pointers");

    const structuralCurrent = await get(env, "structural", "current");
    const rulesCurrent = await get(env, "rules", "current");
    assert.equal(structuralCurrent.body.kind, "structural");
    assert.equal(rulesCurrent.body.kind, "rules");
    assert.notDeepEqual(structuralCurrent.body.declaration, rulesCurrent.body.declaration);
  });
});

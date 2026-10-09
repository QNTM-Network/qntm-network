/**
 * THE ONE WAY CONFIG GOES LIVE — `POST /config/publish` (worker/src/publish.js, 2026-10-09), driven
 * against the real route handlers over an in-memory D1 that really keeps rows and a fake engine
 * that answers the way `server/app.py` `config_push` does.
 *
 *   node --test tests/worker-config-publish.test.mjs
 *
 * What it holds:
 *   1. Only the operator publishes; nothing is asked or stored for anyone else.
 *   2. A publish compiles, the engine accepts, and the app's read returns exactly what
 *      `compile-presentation.mjs` builds — without the drop ledger unless asked.
 *   3. The engine is sent the files, as the archive the stored copy holds.
 *   4. Gate 1 refused: the engine is never asked, nothing is stored.
 *   5. Gate 2 refused: the engine's own refusal is relayed, nothing is stored.
 *   6. The engine unreachable: nothing is stored, and the receipt does not claim a refusal.
 *   7. The same files twice keep their number; new files get the next one; old declarations
 *      stay readable by version.
 *   8. Stored after the engine accepted, and the store failed: the answer says the engine has it.
 *   9. The per-kind store route is gone — the only writer is the publish.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { handlePublish } from "../worker/src/publish.js";
import { handleDeclarations } from "../worker/src/declarations.js";
import { compile as compilePresentation } from "../scripts/compile-presentation.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, "fixtures", "config");
const OPERATOR_ID = "operator-uuid";
const OPERATOR_KEY = "the-operator-shared-key";
const ORIGIN = "https://qntm.network";

function fixtureFiles() {
  const files = {};
  (function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(FIXTURE, path)] = readFileSync(path, "utf8");
    }
  })(FIXTURE);
  return files;
}

/** Only the statements publish.js and declarations.js issue, against real Maps. */
function makeDb({ failBatch = false } = {}) {
  const declarations = new Map();
  const current = new Map();
  const versions = [];
  const run = (sql, p) => {
    if (sql.includes("INSERT INTO declarations")) {
      const key = p.slice(0, 3).join("|");
      if (!declarations.has(key)) declarations.set(key, { declaration_json: p[3], dropped_json: p[4] });
    } else if (sql.includes("INSERT INTO declaration_current")) {
      current.set(`${p[0]}|${p[1]}`, p[2]);
    } else if (sql.includes("INSERT INTO config_versions")) {
      if (versions.some((v) => v.user_id === p[0] && v.number === p[1])) throw new Error("UNIQUE constraint failed");
      versions.push({ user_id: p[0], number: p[1], files_version: p[2], declaration_version: p[3], archive: p[4], created_at: "now" });
    } else throw new Error(`unstubbed run(): ${sql}`);
  };
  const first = (sql, p) => {
    if (sql.includes("FROM config_versions")) {
      const mine = versions.filter((v) => v.user_id === p[0]).sort((a, b) => b.number - a.number);
      return (sql.includes("AND number = ?") ? mine.find((v) => v.number === p[1]) : mine[0]) ?? null;
    }
    if (sql.includes("FROM declaration_current")) {
      const version = current.get(`${p[0]}|${p[1]}`);
      return version ? { version } : null;
    }
    if (sql.includes("FROM declarations")) return declarations.get(p.join("|")) ?? null;
    throw new Error(`unstubbed first(): ${sql}`);
  };
  return {
    prepare: (sql) => ({
      bind: (...params) => ({ sql, params, run: async () => run(sql, params), first: async () => first(sql, params) }),
    }),
    batch: async (statements) => {
      if (failBatch) throw new Error("D1 is unavailable");
      for (const s of statements) run(s.sql, s.params);
    },
    declarations,
    current,
    versions,
  };
}

/** A fake engine: records what it was sent, answers `answer` (status, body), or throws. */
function engine(answer = { status: 200, body: { ok: true, yaml_files: 3 } }) {
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ url, init });
    if (answer === "unreachable") throw new Error("connection refused");
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  };
  return sent;
}

function makeEnv(db = makeDb()) {
  return { DB: db, GRAPH_PUSH_KEY: OPERATOR_KEY, GRAPH_USER_ID: OPERATOR_ID, GRAPH_SERVER_URL: "https://engine.test", SERVER_TOKEN: "server-token" };
}

async function publish(env, files, token = OPERATOR_KEY) {
  const url = "http://worker.local/config/publish";
  const request = new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ files }),
  });
  const response = await handlePublish(request, env, new URL(url), ORIGIN);
  return { status: response.status, body: await response.json() };
}

async function read(env, path) {
  const url = `http://worker.local${path}`;
  const response = await handleDeclarations(new Request(url), env, new URL(url), ORIGIN);
  return response ? { status: response.status, body: await response.json() } : null;
}

test("1. only the operator publishes", async () => {
  const env = makeEnv();
  const sent = engine();
  for (const token of [null, "not-the-key"]) {
    const answer = await publish(env, fixtureFiles(), token);
    assert.equal(answer.status, 401);
  }
  assert.equal(sent.length, 0, "the engine was asked for an unauthorised publish");
  assert.equal(env.DB.versions.length + env.DB.declarations.size, 0);
});

test("2. a publish lands, and the app reads exactly what the compiler built", async () => {
  const env = makeEnv();
  engine();
  const files = fixtureFiles();
  const direct = compilePresentation(files);
  const answer = await publish(env, files);
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  assert.deepEqual(answer.body.receipt, { compiled: true, version: direct.version, stored: true, engineAccepted: true });
  assert.equal(answer.body.number, 1);

  const current = await read(env, "/config/declaration/presentation/current");
  assert.equal(current.status, 200);
  assert.deepEqual(current.body.declaration, direct.declaration);
  assert.equal(current.body.version, direct.version);
  assert.equal("dropped" in current.body, false, "the drop ledger rode along to the client");
  const withDropped = await read(env, "/config/declaration/presentation/current?include=dropped");
  assert.deepEqual(withDropped.body.dropped, direct.dropped);
});

test("3. the engine is sent the files, and the stored archive is what it was sent", async () => {
  const env = makeEnv();
  const sent = engine();
  const files = fixtureFiles();
  await publish(env, files);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, "https://engine.test/config");
  assert.equal(sent[0].init.headers.Authorization, "Bearer server-token");
  const body = new Uint8Array(sent[0].init.body);
  assert.deepEqual(body, new Uint8Array(env.DB.versions[0].archive));
  const tar = gunzipSync(body).toString("utf8");
  for (const path of Object.keys(files)) assert.ok(tar.includes(path), `${path} missing from the archive`);
});

test("4. Gate 1 refused: the engine is never asked and nothing is stored", async () => {
  const env = makeEnv();
  const sent = engine();
  const files = fixtureFiles();
  files["client.yaml"] = files["client.yaml"].replace("field: kind", "field: colour");
  const answer = await publish(env, files);
  assert.equal(answer.status, 422);
  assert.equal(answer.body.gate, 1);
  assert.match(answer.body.error, /colour/);
  assert.deepEqual(answer.body.receipt, { compiled: false, version: null, stored: false, engineAccepted: null });
  assert.equal(sent.length, 0);
  assert.equal(env.DB.versions.length + env.DB.declarations.size + env.DB.current.size, 0);
});

test("5. Gate 2 refused: the engine's own refusal is relayed and nothing is stored", async () => {
  const env = makeEnv();
  const refusal = { ok: false, gate: 2, error_type: "BundleValidationError", file: "views/x.yaml", line: 3, message: "unknown node type 'tickt'", context: {} };
  engine({ status: 422, body: refusal });
  const answer = await publish(env, fixtureFiles());
  assert.equal(answer.status, 422);
  assert.equal(answer.body.gate, 2);
  assert.equal(answer.body.error, "unknown node type 'tickt'");
  assert.deepEqual(answer.body.engine, refusal);
  assert.equal(answer.body.receipt.engineAccepted, false);
  assert.equal(answer.body.receipt.stored, false);
  assert.equal(env.DB.versions.length + env.DB.declarations.size + env.DB.current.size, 0);
});

test("6. the engine unreachable: nothing stored, and no refusal claimed", async () => {
  const env = makeEnv();
  engine("unreachable");
  const answer = await publish(env, fixtureFiles());
  assert.equal(answer.status, 502);
  assert.equal(answer.body.receipt.engineAccepted, null);
  assert.equal(env.DB.versions.length + env.DB.declarations.size, 0);
});

test("7. same files keep their number; new files get the next; old declarations stay readable", async () => {
  const env = makeEnv();
  engine();
  const files = fixtureFiles();
  const one = await publish(env, files);
  const again = await publish(env, files);
  assert.equal(again.body.number, 1);
  assert.equal(again.body.unchanged, true);
  assert.equal(env.DB.versions.length, 1);

  const changed = { ...files, "client.yaml": files["client.yaml"] + "\nrenditions:\n  tags: raw\n" };
  const two = await publish(env, changed);
  assert.equal(two.status, 200, JSON.stringify(two.body));
  assert.equal(two.body.number, 2);
  const current = await read(env, "/config/declaration/presentation/current");
  assert.equal(current.body.declaration.tags, "raw");
  const old = await read(env, `/config/declaration/presentation/${one.body.receipt.version}`);
  assert.equal(old.status, 200);
  assert.equal(old.body.declaration.tags, undefined);
});

test("8. the engine accepted and the store failed: the answer says so", async () => {
  const env = makeEnv(makeDb({ failBatch: true }));
  engine();
  const answer = await publish(env, fixtureFiles());
  assert.equal(answer.status, 500);
  assert.deepEqual(
    { stored: answer.body.receipt.stored, engineAccepted: answer.body.receipt.engineAccepted },
    { stored: false, engineAccepted: true },
  );
  assert.match(answer.body.error, /publish the same files again/);
});

test("9. the per-kind store route is gone; a bad path is refused before anything happens", async () => {
  const env = makeEnv();
  const sent = engine();
  const url = "http://worker.local/config/declaration/structural";
  const request = new Request(url, { method: "POST", headers: { Authorization: `Bearer ${OPERATOR_KEY}` }, body: "{}" });
  assert.equal(await handleDeclarations(request, env, new URL(url), ORIGIN), null);
  const answer = await publish(env, { ...fixtureFiles(), "../escape.yaml": "x: 1\n" });
  assert.equal(answer.status, 400);
  assert.equal(sent.length, 0);
});

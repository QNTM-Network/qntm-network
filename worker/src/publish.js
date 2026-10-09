// THE ONE WAY CONFIG GOES LIVE (2026-10-09, backlog row config-publish-in-the-api, project
// engine-and-clients). Config is each user's content, published by the API — never by CI, never
// by a commit, never by a laptop pushing straight to the engine.
//
// POST /config/publish            operator — {files: {path: contents}} -> compile, engine check, store
// GET  /config/source/current     operator — the stored archive of the newest published config
// GET  /config/source/<number>    operator — the stored archive of one published config
//
// THE ORDER, AND WHAT EACH STEP REFUSES:
//   1. GATE 1 — `compile-presentation.mjs` builds the whole declaration a client reads, from the
//      submitted files. A refusal is the compiler's own sentence, 422; nothing else happens.
//   2. GATE 2 — the same files, as a gzipped tar (`config-archive.mjs`), go to the engine's
//      `POST /config`, which test-loads them with its own bundle loader and switches over only if
//      they load (`server/app.py` `config_push`). A refusal is the engine's own (file, line,
//      message), relayed, 422; nothing is stored, and the engine still runs the config it had.
//   3. STORE — one D1 batch (a transaction): the declaration under its content-hash version, the
//      "current" pointer the app reads, and a numbered config version holding the exact archive
//      the engine accepted. The same files published twice keep their number.
//
// TWO STORES, NO SHARED TRANSACTION — the engine and D1. The engine goes first because it is the
// one that can refuse. If D1 then fails, the engine runs a config D1 has not recorded: the answer
// says exactly that (`engineAccepted: true, stored: false`, 500), and publishing the same files
// again is safe on both sides (the engine skips a config identical to its live one; D1 inserts
// are keyed by content).
//
// SINGLE TENANT, SAID OUT LOUD. The engine holds one config. `operatorUser` answers only for the
// operator, so only the operator can publish, and every row is keyed by that user id from the
// start (backlog row each-user-has-their-own-graph).

import { json, cors } from "./util.js";
import { operatorUser } from "./app.js";
import { compile as compilePresentation } from "../../scripts/compile-presentation.mjs";
import { archive, checkPath, filesVersion, ArchiveError } from "../../scripts/config-archive.mjs";

export const PRESENTATION_KIND = "presentation";

/** D1 holds a row up to ~1 MB; the same margin `declarations.js` and `POST /app/graph` keep. */
const ROW_LIMIT = 950_000;

/** What every answer carries — `config.js`'s receipt, with the two facts this route can know. */
export function receipt({ compiled, version, stored, engineAccepted }) {
  return { compiled, version, stored, engineAccepted };
}

function readFiles(body) {
  const files = body && typeof body === "object" ? body.files : undefined;
  if (files === null || typeof files !== "object" || Array.isArray(files)) {
    return { error: "bad request: 'files' must be an object of path -> contents" };
  }
  for (const [path, contents] of Object.entries(files)) {
    if (typeof contents !== "string") {
      return { error: `bad request: 'files[${JSON.stringify(path)}]' is not a string` };
    }
    try {
      checkPath(path);
    } catch (error) {
      return { error: `bad request: ${error.message}` };
    }
  }
  return { files };
}

/** Gate 2: the engine's own answer, or why it could not be asked. */
async function engineCheck(env, gz) {
  if (!env.GRAPH_SERVER_URL || !env.SERVER_TOKEN) {
    return { status: 503, error: "the engine is not configured on this Worker" };
  }
  let response;
  try {
    response = await fetch(`${env.GRAPH_SERVER_URL}/config`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.SERVER_TOKEN}`, "Content-Type": "application/gzip" },
      body: gz,
    });
  } catch (error) {
    return { status: 502, error: `the engine could not be reached: ${String(error?.message || error)}` };
  }
  let answer = null;
  try {
    answer = await response.json();
  } catch {
    // an answer that is not JSON is reported by its status alone
  }
  if (response.ok && answer?.ok) return { accepted: true, answer };
  if (response.status === 422) return { refused: true, answer };
  return { status: 502, error: `the engine answered ${response.status}`, answer };
}

async function publish(request, env, origin) {
  const userId = operatorUser(request, env);
  if (!userId) return json({ ok: false, error: "not authorised" }, 401, origin);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad request: body is not valid JSON" }, 400, origin);
  }
  const { files, error } = readFiles(body);
  if (error) return json({ ok: false, error }, 400, origin);

  // GATE 1.
  let compiled;
  try {
    compiled = compilePresentation(files);
  } catch (refusal) {
    return json(
      {
        ok: false,
        refused: true,
        gate: 1,
        error: String(refusal?.message || refusal),
        receipt: receipt({ compiled: false, version: null, stored: false, engineAccepted: null }),
      },
      422,
      origin,
    );
  }
  const declarationJson = JSON.stringify(compiled.declaration);
  const droppedJson = JSON.stringify(compiled.dropped);
  let gz;
  try {
    gz = await archive(files);
  } catch (refusal) {
    if (!(refusal instanceof ArchiveError)) throw refusal;
    return json({ ok: false, error: `bad request: ${refusal.message}` }, 400, origin);
  }
  if (declarationJson.length > ROW_LIMIT || droppedJson.length > ROW_LIMIT || gz.length > ROW_LIMIT) {
    return json({ ok: false, error: "config exceeds the D1 row limit — enable R2 (see wrangler.toml)" }, 413, origin);
  }

  // GATE 2.
  const engine = await engineCheck(env, gz);
  if (engine.refused) {
    return json(
      {
        ok: false,
        refused: true,
        gate: 2,
        error: engine.answer?.message ?? "the engine refused the config",
        engine: engine.answer,
        receipt: receipt({ compiled: true, version: compiled.version, stored: false, engineAccepted: false }),
      },
      422,
      origin,
    );
  }
  if (!engine.accepted) {
    return json(
      {
        ok: false,
        error: engine.error,
        engine: engine.answer ?? null,
        receipt: receipt({ compiled: true, version: compiled.version, stored: false, engineAccepted: null }),
      },
      engine.status,
      origin,
    );
  }

  // STORE.
  const sourceVersion = filesVersion(files);
  try {
    const latest = await env.DB.prepare(
      `SELECT number, files_version FROM config_versions WHERE user_id = ? ORDER BY number DESC LIMIT 1`,
    )
      .bind(userId)
      .first();
    const unchanged = latest?.files_version === sourceVersion;
    const number = unchanged ? latest.number : (latest?.number ?? 0) + 1;
    const statements = [
      env.DB.prepare(
        `INSERT INTO declarations (user_id, kind, version, declaration_json, dropped_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, kind, version) DO NOTHING`,
      ).bind(userId, PRESENTATION_KIND, compiled.version, declarationJson, droppedJson),
      env.DB.prepare(
        `INSERT INTO declaration_current (user_id, kind, version, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, kind) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at`,
      ).bind(userId, PRESENTATION_KIND, compiled.version),
    ];
    if (!unchanged) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO config_versions (user_id, number, files_version, declaration_version, archive)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(userId, number, sourceVersion, compiled.version, gz),
      );
    }
    await env.DB.batch(statements);
    return json(
      {
        ok: true,
        number,
        unchanged,
        filesVersion: sourceVersion,
        files: Object.keys(files).length,
        dropped: compiled.dropped,
        engine: engine.answer,
        receipt: receipt({ compiled: true, version: compiled.version, stored: true, engineAccepted: true }),
      },
      200,
      origin,
    );
  } catch (storeError) {
    return json(
      {
        ok: false,
        error: `the engine accepted the config but it was not stored: ${String(storeError?.message || storeError)} — publish the same files again`,
        receipt: receipt({ compiled: true, version: compiled.version, stored: false, engineAccepted: true }),
      },
      500,
      origin,
    );
  }
}

async function source(request, env, origin, which) {
  const userId = operatorUser(request, env);
  if (!userId) return json({ ok: false, error: "not authorised" }, 401, origin);
  const row =
    which === "current"
      ? await env.DB.prepare(
          `SELECT number, files_version, declaration_version, archive, created_at FROM config_versions
           WHERE user_id = ? ORDER BY number DESC LIMIT 1`,
        )
          .bind(userId)
          .first()
      : await env.DB.prepare(
          `SELECT number, files_version, declaration_version, archive, created_at FROM config_versions
           WHERE user_id = ? AND number = ?`,
        )
          .bind(userId, Number(which))
          .first();
  if (!row) return json({ ok: false, error: "not found" }, 404, origin);
  const bytes = row.archive instanceof ArrayBuffer ? new Uint8Array(row.archive) : Uint8Array.from(row.archive);
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/gzip",
      "Cache-Control": "no-store",
      "X-Config-Number": String(row.number),
      "X-Config-Files-Version": row.files_version,
      "X-Config-Declaration-Version": row.declaration_version,
      "X-Config-Created-At": row.created_at,
      ...cors(origin),
      "Access-Control-Expose-Headers":
        "X-Config-Number, X-Config-Files-Version, X-Config-Declaration-Version, X-Config-Created-At",
    },
  });
}

/**
 * @returns {Promise<Response|null>} null if this request is not one of this file's routes.
 */
export async function handlePublish(request, env, url, origin) {
  if (request.method === "POST" && url.pathname === "/config/publish") return publish(request, env, origin);
  const match = /^\/config\/source\/(current|[1-9][0-9]*)$/.exec(url.pathname);
  if (request.method === "GET" && match) return source(request, env, origin, match[1]);
  return null;
}

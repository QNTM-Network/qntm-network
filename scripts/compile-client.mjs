/**
 * compile-client — the PURE compile step for the operator's CLIENT SETTINGS: `config/client.yaml`
 * (2026-10-09, backlog row client-settings-in-config, project engine-and-clients).
 *
 * Client settings say how a client lists, searches, ranks and picks. The engine carries the file
 * with the rest of the config and never reads it (its loader knows it as content type CLIENT); THIS
 * function is the file's one validity owner. Its answer is published as the declaration's `client`
 * key and run by the client core (`app/present/rank.ts`). Principle: architecture.yaml
 * one-home-per-kind-of-rule.
 *
 * PURE AND WORKER-ISOLATE-SAFE, like every other `compile-*.mjs`: only `yaml-subset.mjs`, no
 * `node:fs`, so the same function runs in a CLI and in the Worker's config publish route.
 *
 * WHAT IT CHECKS, AND WHY THE FIELD LIST IS WRITTEN HERE. A key names a field the client core can
 * read. `RANK_FIELDS` below is that list, restated from `app/present/rank.ts` (a script cannot
 * import the app's TypeScript); tests/client-settings.test.mjs fails if the two lists differ.
 */

import { parseYamlSubset } from "./yaml-subset.mjs";

export class GenerationError extends Error {}

/** The one file this module reads. */
export const CLIENT_KEY = "client.yaml";

/** The lists a client has — `ListName` in app/present/rank.ts. */
export const LIST_NAMES = ["search", "link", "views", "tags", "markers"];

/** The fields a key may name — what `fieldValue` in app/present/rank.ts reads. */
export const RANK_FIELDS = ["kind", "match", "status", "demoted", "title", "position"];

/** The token families a client shows one of two ways — `RESOLUTION_KEYS` in
 * app/present/express/rendition.ts, restated for the same reason as `RANK_FIELDS`. */
export const RENDITION_FAMILIES = ["checkbox", "heading", "prose", "tags", "stamp"];

/** `wired` is the client's rendition (a checkbox, a heading, a chip); `raw` is the characters. */
export const RENDITIONS = ["raw", "wired"];

const DIRECTIONS = new Set(["asc", "desc"]);

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStringList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string" && x !== "");

function readKey(path, entry) {
  if (!isObject(entry)) throw new GenerationError(`${path} is not a mapping`);
  for (const k of Object.keys(entry)) {
    if (!["field", "direction", "order"].includes(k)) throw new GenerationError(`${path}.${k} is not a key field (field, direction, order)`);
  }
  const { field, direction, order } = entry;
  if (!RANK_FIELDS.includes(field)) {
    throw new GenerationError(`${path}.field is ${JSON.stringify(field)}, not one of ${RANK_FIELDS.join(", ")}`);
  }
  const out = { field };
  if (direction !== undefined) {
    if (!DIRECTIONS.has(direction)) throw new GenerationError(`${path}.direction is ${JSON.stringify(direction)}, not asc or desc`);
    out.direction = direction;
  }
  if (order !== undefined) {
    if (!isStringList(order) || order.length === 0) throw new GenerationError(`${path}.order is not a non-empty list of values`);
    out.order = order;
  }
  return out;
}

function readList(name, value, sharedDemote) {
  const path = `${CLIENT_KEY}: lists.${name}`;
  if (!isObject(value)) throw new GenerationError(`${path} is not a mapping`);
  for (const k of Object.keys(value)) {
    if (!["keys", "min_match", "demote"].includes(k)) throw new GenerationError(`${path}.${k} is not a list setting (keys, min_match, demote)`);
  }
  if (!Array.isArray(value.keys) || value.keys.length === 0) throw new GenerationError(`${path}.keys is not a non-empty list`);
  const policy = { keys: value.keys.map((entry, i) => readKey(`${path}.keys[${i}]`, entry)) };
  if (value.min_match !== undefined) {
    if (!Number.isInteger(value.min_match) || value.min_match < 0 || value.min_match > 3) {
      throw new GenerationError(`${path}.min_match is ${JSON.stringify(value.min_match)}, not 0, 1, 2 or 3`);
    }
    policy.minMatch = value.min_match;
  }
  const demote = value.demote ?? sharedDemote;
  if (demote !== undefined) {
    if (!isStringList(demote)) throw new GenerationError(`${path}.demote is not a list of view path globs`);
    policy.demote = demote;
  }
  return policy;
}

/**
 * @param {Record<string, string> | Map<string, string>} files path -> contents; only `client.yaml`.
 * @returns {{ lists: Record<string, object> | undefined, renditions: Record<string, string> }} the
 *   declared list policies (`undefined` when the file or its `lists:` is absent — SILENCE: every list
 *   keeps its built-in order) and the declared renditions (empty when absent — every family keeps
 *   its built-in default).
 */
export function compile(files) {
  const isMap = files instanceof Map;
  const has = (key) => (isMap ? files.has(key) : Object.prototype.hasOwnProperty.call(files, key));
  const get = (key) => (isMap ? files.get(key) : files[key]);
  if (!has(CLIENT_KEY)) return { lists: undefined, renditions: {} };
  const document = parseYamlSubset(get(CLIENT_KEY), CLIENT_KEY);
  if (!isObject(document)) throw new GenerationError(`${CLIENT_KEY} is not a mapping`);
  for (const k of Object.keys(document)) {
    if (k !== "lists" && k !== "renditions") {
      throw new GenerationError(`${CLIENT_KEY}: '${k}' is not a client setting (lists, renditions)`);
    }
  }
  const renditions = readRenditions(document.renditions);
  if (document.lists === undefined) return { lists: undefined, renditions };
  if (!isObject(document.lists)) throw new GenerationError(`${CLIENT_KEY}: 'lists' is not a mapping`);
  const { demote: sharedDemote, ...named } = document.lists;
  if (sharedDemote !== undefined && !isStringList(sharedDemote)) {
    throw new GenerationError(`${CLIENT_KEY}: lists.demote is not a list of view path globs`);
  }
  const lists = {};
  for (const [name, value] of Object.entries(named)) {
    if (!LIST_NAMES.includes(name)) throw new GenerationError(`${CLIENT_KEY}: lists.${name} is not a list (${LIST_NAMES.join(", ")})`);
    lists[name] = readList(name, value, sharedDemote);
  }
  return { lists, renditions };
}

/** `renditions:` — family -> wired | raw. A family left out keeps its built-in default. */
function readRenditions(value) {
  if (value === undefined) return {};
  if (!isObject(value)) throw new GenerationError(`${CLIENT_KEY}: 'renditions' is not a mapping`);
  const out = {};
  for (const [family, rendition] of Object.entries(value)) {
    if (!RENDITION_FAMILIES.includes(family)) {
      throw new GenerationError(`${CLIENT_KEY}: renditions.${family} is not a token family (${RENDITION_FAMILIES.join(", ")})`);
    }
    if (!RENDITIONS.includes(rendition)) {
      throw new GenerationError(`${CLIENT_KEY}: renditions.${family} is ${JSON.stringify(rendition)}, not ${RENDITIONS.join(" or ")}`);
    }
    out[family] = rendition;
  }
  return out;
}

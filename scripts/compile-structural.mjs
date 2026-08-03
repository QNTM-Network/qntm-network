/**
 * compile-structural — the PURE compile step for the structural declaration, split out of
 * `generate-structural-declaration.mjs` for exactly one reason: this module must be safe to
 * `import` inside a Cloudflare Worker isolate, and "the function is pure" turned out not to be
 * enough — the MODULE it lived in was not.
 *
 * ── THE FINDING THAT MADE THIS FILE NECESSARY ──
 *
 * `design-the-runtime-compile.md` §6.3 flagged one unverified risk — whether the Worker's V8
 * isolate produces byte-identical output to Node's for the same computation — and asked this step
 * to settle it. Settling it surfaced a DIFFERENT, more basic failure first: `worker/src/config.js`
 * importing `compile` from the original single-file `generate-structural-declaration.mjs` crashed
 * the Worker at MODULE LOAD, before any bytes were ever compared —
 *
 *   Uncaught TypeError: The "path" argument must be of type string or an instance of URL.
 *   Received undefined
 *     at fileURLToPath (node-internal:internal_url:155:15)
 *
 * — because that file's CLI shell imports `scripts/monorepo-config.mjs`, and THAT module computes
 * `resolve(fileURLToPath(import.meta.url), "..")` at its own TOP LEVEL, unconditionally, the
 * moment it is imported. `import.meta.url` is a real `file://` URL when Node loads the file
 * directly; inside Wrangler's bundled Worker output it is not, and the crash happens whether or
 * not anything downstream ever reads `DEFAULT_CONFIG_DIR` or `REPO_ROOT`. Importing `{ compile }`
 * was enough to drag the whole module graph — `node:fs`, `node:path`, and this side effect — along
 * with it. "The function is pure" and "the file is safe to import in a Worker" are different
 * claims, and this repo had only ever checked the first one.
 *
 * ── THE FIX, AND WHY IT IS A SPLIT RATHER THAN A GUARD ──
 *
 * A `try/catch` or a lazy getter around the `fileURLToPath` call would silence the crash without
 * removing the reason for it: the compile step would still be defined in a file whose import graph
 * includes `node:fs` and a Node-only path-resolution idiom, for no reason a Worker route needs. So
 * this file carries ONLY what `compile()` itself needs: the parsing logic, and `Ledger` — which
 * `design-the-runtime-compile.md`'s own citation already measured as "zero imports... would run in
 * a Worker today, unchanged." This file now belongs to that same class. `worker/src/config.js`
 * imports `compile` from HERE, never from `generate-structural-declaration.mjs`, so the Worker's
 * module graph for this route is exactly: this file, plus `ledger.mjs` — nothing Node-specific.
 * `generate-structural-declaration.mjs` re-exports `compile` from here unchanged, so nothing that
 * already imports it (there was no such caller before this session) has to change, and its own CLI
 * shell (`node:fs`, `monorepo-config.mjs`) stays exactly where a CLI shell belongs — a module a
 * Worker never has to load.
 */

import { Ledger } from "./ledger.mjs";
import { versionKey } from "./declaration-version.mjs";

export class GenerationError extends Error {}

const nonBlank = (line) => line.trim() !== "" && !line.trim().startsWith("#");
const indentOf = (line) => line.length - line.trimStart().length;

// The two fixed keys `compile`'s file map carries, plus the `views/` prefix every section-override
// file lives under. Named once so the pure function and any caller building a files map (the fs
// shell in `generate-structural-declaration.mjs`, or a Worker route reading a POSTed body) agree
// on the exact same strings without restating them.
export const STRUCTURAL_TOKENS_KEY = "vocabulary/structural_tokens.yaml";
export const SCHEMA_KEY = "schema.yaml";
export const VIEWS_PREFIX = "views/";

// ── 1. structural_tokens.yaml content -> the GLOBAL indent binding ─────────────────────────────
// `label` is the file map key, used only for error text — no absolute path reaches a thrown
// message any more, which is a small side effect of going pure rather than a goal of it.

function parseIndentBinding(content, label) {
  const lines = content.split(/\r?\n/);
  const indentLine = lines.findIndex((l) => l.trim() === "indent:");
  if (indentLine === -1) {
    throw new GenerationError(`${label}: no 'indent:' key found under positional_bindings`);
  }
  const baseIndent = indentOf(lines[indentLine]);
  let edgeType = null;
  let edgeSource = null;
  for (let i = indentLine + 1; i < lines.length; i += 1) {
    const line = lines[i];
    // NOT A DROP: a blank line or a comment.
    if (!nonBlank(line)) continue;
    if (indentOf(line) <= baseIndent) break; // dedented back to indent:'s own sibling (bindings:)
    const m = line.match(/^\s*(edge_type|edge_source):\s*(\S+?)\s*(#.*)?$/);
    // NOT A DROP: a line inside indent: that is neither key. If either is missing the function THROWS below.
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (m[1] === "edge_type") edgeType = value;
    else edgeSource = value;
  }
  if (edgeType === null || edgeSource === null) {
    throw new GenerationError(
      `${label}: 'indent:' block did not yield both edge_type and edge_source ` +
        `(got edge_type=${edgeType}, edge_source=${edgeSource})`,
    );
  }
  if (edgeSource !== "self" && edgeSource !== "position") {
    throw new GenerationError(`${label}: indent.edge_source='${edgeSource}' is not self/position`);
  }
  return { edgeType, edgeSource };
}

// ── 2. schema.yaml content -> edge_types: { NAME: { cardinality } } ────────────────────────────

function parseEdgeCardinalityRegistry(content, label) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "edge_types:" && indentOf(l) === 0);
  if (start === -1) {
    throw new GenerationError(`${label}: no top-level 'edge_types:' key`);
  }
  const registry = new Map();
  let current = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    // NOT A DROP: a blank line or a comment.
    if (!nonBlank(line)) continue;
    const depth = indentOf(line);
    if (depth === 0) break; // next top-level key — edge_types: block is over
    const nameMatch = depth === 2 && line.match(/^\s{2}([A-Za-z0-9_]+):\s*$/);
    if (nameMatch) {
      current = nameMatch[1];
      // NOT A DROP: loop control — the edge type name was just captured.
      continue;
    }
    if (current !== null && depth >= 4) {
      const cardMatch = line.match(/^\s*cardinality:\s*(\S+)\s*$/);
      if (cardMatch) registry.set(current, cardMatch[1]);
    }
  }
  if (registry.size === 0) {
    throw new GenerationError(`${label}: 'edge_types:' block yielded no entries`);
  }
  return registry;
}

// ── 3. views/*.yaml contents -> { viewId: { sectionId: { edgeTypes, edgeDirection } } } ─────────

function parseFlowList(raw) {
  const m = raw.match(/^\[(.*)\]$/);
  if (!m) return null;
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s.length > 0);
}

/**
 * @param {Array<[string, string]>} viewEntries `[key, content]` pairs, ALREADY SORTED by key —
 *   the caller's job (`compile`, below), not this function's, so there is exactly one place order
 *   is decided.
 * @param {Ledger} ledger
 */
function parseViewSections(viewEntries, ledger) {
  const byView = {};
  for (const [key, content] of viewEntries) {
    const file = key.startsWith(VIEWS_PREFIX) ? key.slice(VIEWS_PREFIX.length) : key;
    const lines = content.split(/\r?\n/);
    const viewLine = lines.findIndex((l) => /^[A-Za-z0-9_-]+:\s*$/.test(l) && indentOf(l) === 0);
    // DROP PATH 1. "Skip, don't fabricate" was right and incomplete: not fabricating is only half
    // of it, because a view sheet whose top-level key this line scanner cannot see takes every
    // structural override it declares with it, and nothing said so.
    if (viewLine === -1) {
      ledger.drop(
        `views/${file}`,
        "no top-level view key this scanner recognises, so any structural_edge_types / " +
          "structural_edge_direction override in the file was skipped",
      );
      continue;
    }
    const viewId = lines[viewLine].trim().replace(/:\s*$/, "");
    const sectionsLine = lines.findIndex(
      (l, i) => i > viewLine && l.trim() === "sections:" && indentOf(l) === 2,
    );
    // DROP PATH 2. A view with no `sections:` at indent 2. `default_registration.yaml` is the one
    // file in the operator's config that legitimately has none, and it is excluded by name rather
    // than by silence, so every OTHER file reaching this line is a real drop.
    if (sectionsLine === -1) {
      if (file !== "default_registration.yaml") {
        ledger.drop(
          `views/${file}`,
          `view '${viewId}' has no 'sections:' key at the indent this scanner reads, so any ` +
            "structural override it declares was skipped",
        );
      }
      continue;
    }

    const sections = {};
    let sectionId = null;
    let sectionIndent = null;
    let edgeTypes = null;
    let edgeDirection = null;
    const flush = () => {
      if (sectionId !== null && edgeTypes !== null && edgeDirection !== null) {
        sections[sectionId] = { edgeTypes, edgeDirection };
      } else if (sectionId !== null && (edgeTypes !== null || edgeDirection !== null)) {
        // DROP PATH 3, AND THE WORST OF THE THREE. A section declaring ONE HALF of the structural
        // override — the edge types without a direction, or a direction with no types — was
        // dropped entirely. The operator's half-written declaration then behaves exactly like no
        // declaration at all, so the app silently uses the GLOBAL indent binding under a heading
        // he has explicitly told to do something else.
        ledger.drop(
          `section '${viewId}.${sectionId}'`,
          edgeTypes === null
            ? "declares structural_edge_direction with no structural_edge_types, so the whole " +
              "override was skipped and the app falls back to the global indent binding"
            : "declares structural_edge_types with no structural_edge_direction, so the whole " +
              "override was skipped and the app falls back to the global indent binding",
        );
      }
      sectionId = null;
      edgeTypes = null;
      edgeDirection = null;
    };
    for (let i = sectionsLine + 1; i < lines.length; i += 1) {
      const line = lines[i];
      // NOT A DROP: a blank line or a comment.
      if (!nonBlank(line)) continue;
      const depth = indentOf(line);
      if (depth < 4) break; // dedented out of the sections: list entirely
      const idMatch = depth === 4 && line.match(/^\s{4}-\s*id:\s*(\S+)\s*$/);
      if (idMatch) {
        flush();
        sectionId = idMatch[1];
        sectionIndent = depth;
        // NOT A DROP: loop control — the section id was just captured.
        continue;
      }
      // NOT A DROP: lines before the first section id; nothing is open to lose.
      if (sectionId === null) continue;
      if (depth <= sectionIndent) {
        flush();
        // NOT A DROP: flush() ran first, and flush() is what records a half-declared override.
        continue; // a non-id list item at the same depth — not a shape this scanner expects; skip
      }
      const typesMatch = line.match(/^\s*structural_edge_types:\s*(.+?)\s*$/);
      if (typesMatch) {
        const parsed = parseFlowList(typesMatch[1]);
        if (parsed === null) {
          throw new GenerationError(
            `views/${file}: section '${sectionId}' has structural_edge_types in a shape this ` +
              `generator does not understand: '${typesMatch[1]}' (expected '[A, B]')`,
          );
        }
        edgeTypes = parsed;
        // NOT A DROP: loop control — edgeTypes was just captured.
        continue;
      }
      const dirMatch = line.match(/^\s*structural_edge_direction:\s*(\S+)\s*$/);
      if (dirMatch) {
        edgeDirection = dirMatch[1].replace(/^["']|["']$/g, "");
      }
    }
    flush();
    if (Object.keys(sections).length > 0) byView[viewId] = sections;
  }
  return byView;
}

// ── the pure compile — `design-the-runtime-compile.md` step B's own contract ───────────────────

/**
 * Compile the structural declaration from an in-memory config tree. PURE: no filesystem, no
 * command line, no clock, no randomness — and, as of this file's split from
 * `generate-structural-declaration.mjs`, no import that is not itself as pure as this one. The
 * same function runs identically in the CLI shell (`generate-structural-declaration.mjs`) and in
 * the Worker's Gate-1 route (`worker/src/config.js`).
 *
 * @param {Record<string, string> | Map<string, string>} files path -> file contents. Recognised
 *   keys: `"vocabulary/structural_tokens.yaml"`, `"schema.yaml"`, and every `"views/<name>.yaml"`.
 *   Paths use `/` regardless of platform — this is a logical tree, not a filesystem one.
 * @param {Ledger} ledger
 * @returns {{declaration: object, dropped: object}}
 */
export function compile(files, ledger = new Ledger()) {
  const isMap = files instanceof Map;
  const has = (key) => (isMap ? files.has(key) : Object.prototype.hasOwnProperty.call(files, key));
  const get = (key) => (isMap ? files.get(key) : files[key]);
  const allKeys = () => (isMap ? [...files.keys()] : Object.keys(files));

  if (!has(STRUCTURAL_TOKENS_KEY)) {
    throw new GenerationError(`${STRUCTURAL_TOKENS_KEY} does not exist`);
  }
  const indent = parseIndentBinding(get(STRUCTURAL_TOKENS_KEY), STRUCTURAL_TOKENS_KEY);

  if (!has(SCHEMA_KEY)) {
    throw new GenerationError(`${SCHEMA_KEY} does not exist`);
  }
  const cardinalityRegistry = parseEdgeCardinalityRegistry(get(SCHEMA_KEY), SCHEMA_KEY);

  // SORTED EXPLICITLY. A files map — an object or a Map built from a POSTed JSON body, or from a
  // directory read — carries no directory-walk order of its own once it is in memory, and an
  // unordered iteration here is exactly the silent nondeterminism `design-the-runtime-compile.md`
  // §6 warns a `compile(files)` refactor could introduce. This is the one sort site the pure
  // function owns; the fs shell in `generate-structural-declaration.mjs` sorts too, independently,
  // so the two never rely on each other to have already done it.
  const viewKeys = allKeys()
    .filter((k) => k.startsWith(VIEWS_PREFIX) && k.endsWith(".yaml"))
    .sort();
  const sections = parseViewSections(
    viewKeys.map((k) => [k, get(k)]),
    ledger,
  );

  // Only sections declaring exactly one edge type produce an ingest-usable override — a
  // multi-type declaration is interpret-ambiguous for authoring (applier.py's own
  // _section_indent_binding resolves it to (True, None), i.e. "structural ingest stays silent
  // there"). None exist in the operator's live config today; this is a shape guard, not dead
  // code, so a future multi-type section is REPORTED by refusal rather than mis-published as a
  // single-type override.
  for (const [viewId, viewSections] of Object.entries(sections)) {
    for (const [sectionId, lang] of Object.entries(viewSections)) {
      if (lang.edgeTypes.length !== 1) {
        throw new GenerationError(
          `${viewId}.${sectionId} declares ${lang.edgeTypes.length} structural_edge_types ` +
            `(${lang.edgeTypes.join(", ")}) — ambiguous for ingest per applier.py's own rule; ` +
            "this generator does not know how to publish it and refuses rather than guess.",
        );
      }
      if (lang.edgeDirection !== "incoming" && lang.edgeDirection !== "outgoing") {
        throw new GenerationError(
          `${viewId}.${sectionId}.structural_edge_direction='${lang.edgeDirection}' is not ` +
            "incoming/outgoing",
        );
      }
    }
  }

  // The referenced edge types — the global indent's, plus every section override's — are what
  // gets a cardinality entry. Not the whole registry (see structural.ts's header on why).
  const referenced = new Set([indent.edgeType]);
  for (const viewSections of Object.values(sections)) {
    for (const lang of Object.values(viewSections)) {
      for (const t of lang.edgeTypes) referenced.add(t);
    }
  }

  const edgeCardinality = {};
  for (const edgeType of referenced) {
    const cardinality = cardinalityRegistry.get(edgeType);
    if (cardinality === undefined) {
      // THE §1 GAP, CLOSED FOR THIS PUBLISH: a name the structural language declares that the
      // edge registry has never heard of. Refuse rather than publish a name the app could show
      // the operator that the graph itself does not recognise.
      throw new GenerationError(
        `edge type '${edgeType}' is named by the structural language (indent binding or a ` +
          `section override) but is not declared in schema.yaml's edge_types registry — refusing ` +
          "to publish an edge type the graph does not know.",
      );
    }
    edgeCardinality[edgeType] = cardinality;
  }

  const declaration = {
    indent: { edgeType: indent.edgeType, edgeSource: indent.edgeSource },
    edgeCardinality,
    sections,
  };
  // Every declaration this generator read and did not publish. See `scripts/ledger.mjs`.
  const dropped = ledger.toJSON();
  return {
    declaration,
    dropped,
    // `design-the-runtime-compile.md` §8 step A — deterministic, content-derived, never a clock or
    // a counter. See `declaration-version.mjs` for what is hashed and why.
    version: versionKey({ declaration, dropped }),
  };
}

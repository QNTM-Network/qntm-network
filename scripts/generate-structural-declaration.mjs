/**
 * generate-structural-declaration — writes `presentation.json`'s `structural` key FROM the
 * monorepo's own config, never by hand.
 *
 * `docs/implementation-artifacts/design-the-structural-language.md`, ranked item #1, names the
 * condition this script exists to satisfy: "Generate it from config/, do not hand-write it...
 * Generation matters: a hand-written copy is the INDENT_UNIT mistake again" — that design's own
 * §3 catalogues one number, transcribed by hand, disagreeing with itself in two executable places
 * and three stale citations before anyone noticed. This script is what keeps the structural
 * declaration from becoming a second copy of that mistake.
 *
 * It reads THREE files, read-only, from the monorepo (never writes there, never runs a cycle,
 * never touches the vault):
 *
 *   config/vocabulary/structural_tokens.yaml   the GLOBAL indent binding (edge type + direction)
 *   config/schema.yaml                          edge_types -> cardinality, for the types that
 *                                                actually appear elsewhere in the declaration
 *   config/views/*.yaml                         every section's own structural_edge_types /
 *                                                structural_edge_direction override, if it has one
 *
 * ── WHY A HAND-ROLLED SCANNER, NOT A YAML LIBRARY ──
 *
 * Same call `scripts/graph-sync.mjs`'s `parseViewMeta` already made for the same files: "minimal
 * field extraction — we only need id / path / domain, not full YAML." No YAML dependency exists
 * in this repo's `package.json`, and adding one to read three fields nested a few levels deep is
 * a bigger surface than a targeted, indentation-aware line scan. This is NOT a general YAML
 * parser; it knows the exact shapes these three files use (block mappings, one flow-style list
 * `[A, B]`) and FAILS LOUD — throws, non-zero exit, no output written — the moment a file does not
 * match what it expects, rather than silently emitting something wrong. "Report, never guess"
 * applies to this script's own read of the monorepo exactly as it applies to the browser's read
 * of what this script produces.
 *
 * ── THE ONE THING THIS SCRIPT VALIDATES THAT THE ENGINE DOES NOT (YET) ──
 *
 * The design document's §1 names a real gap: `edge_type` in `structural_tokens.yaml` is not
 * checked against the edge registry at bundle load, so a typo survives validation and fails only
 * per-line, at apply time. This script closes that gap for exactly what it publishes: every edge
 * type named by the global indent binding or by a section override must exist in
 * `schema.yaml`'s `edge_types:` registry, or generation refuses. This is NOT the engine fix
 * (ranked item #4, `apps/qntm-md`) — it is a publish-time check that this document at least never
 * ships a name the app could show that the graph has never heard of.
 *
 * ── USAGE ──
 *
 *   node scripts/generate-structural-declaration.mjs                 write presentation.json
 *   node scripts/generate-structural-declaration.mjs --check         compute and diff, write nothing,
 *                                                                     exit 1 if presentation.json is stale
 *   node scripts/generate-structural-declaration.mjs --config-dir X  override the monorepo config path
 *
 * `--config-dir` defaults to the sibling checkout this worktree already assumes for `flow-trace`
 * (`../../qntm`, i.e. `apps/qntm-md/config` inside it) — overridable because CI does not check out
 * the monorepo and `--check` there is expected to report "monorepo not found" rather than crash;
 * see `tests/present-structural.test.mjs` for how the test suite uses the same override.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG_DIR, REPO_ROOT } from "./monorepo-config.mjs";
import { Ledger, reportDropped } from "./ledger.mjs";

// Re-exported, not restated: `tests/present-structural.test.mjs` imports it from here, and
// `scripts/monorepo-config.mjs` is now the one place the path to the monorepo is written down.
export { DEFAULT_CONFIG_DIR };

class GenerationError extends Error {}

const nonBlank = (line) => line.trim() !== "" && !line.trim().startsWith("#");
const indentOf = (line) => line.length - line.trimStart().length;

// ── 1. structural_tokens.yaml -> the GLOBAL indent binding ─────────────────────────────────────

function readIndentBinding(configDir) {
  const path = join(configDir, "vocabulary", "structural_tokens.yaml");
  if (!existsSync(path)) {
    throw new GenerationError(`${path} does not exist`);
  }
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const indentLine = lines.findIndex((l) => l.trim() === "indent:");
  if (indentLine === -1) {
    throw new GenerationError(`${path}: no 'indent:' key found under positional_bindings`);
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
      `${path}: 'indent:' block did not yield both edge_type and edge_source ` +
        `(got edge_type=${edgeType}, edge_source=${edgeSource})`,
    );
  }
  if (edgeSource !== "self" && edgeSource !== "position") {
    throw new GenerationError(`${path}: indent.edge_source='${edgeSource}' is not self/position`);
  }
  return { edgeType, edgeSource };
}

// ── 2. schema.yaml -> edge_types: { NAME: { cardinality } } ────────────────────────────────────

function readEdgeCardinalityRegistry(configDir) {
  const path = join(configDir, "schema.yaml");
  if (!existsSync(path)) {
    throw new GenerationError(`${path} does not exist`);
  }
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "edge_types:" && indentOf(l) === 0);
  if (start === -1) {
    throw new GenerationError(`${path}: no top-level 'edge_types:' key`);
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
    throw new GenerationError(`${path}: 'edge_types:' block yielded no entries`);
  }
  return registry;
}

// ── 3. views/*.yaml -> { viewId: { sectionId: { edgeTypes, edgeDirection } } } ──────────────────

function parseFlowList(raw) {
  const m = raw.match(/^\[(.*)\]$/);
  if (!m) return null;
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s.length > 0);
}

function readViewSections(viewsDir, ledger) {
  const files = readdirSync(viewsDir).filter((f) => f.endsWith(".yaml")).sort();
  const byView = {};
  for (const file of files) {
    const path = join(viewsDir, file);
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
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
            `${path}: section '${sectionId}' has structural_edge_types in a shape this ` +
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

// ── assemble ─────────────────────────────────────────────────────────────────────────────────

export function generateStructural(configDir, ledger = new Ledger()) {
  const indent = readIndentBinding(configDir);
  const cardinalityRegistry = readEdgeCardinalityRegistry(configDir);
  const sections = readViewSections(join(configDir, "views"), ledger);

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

  return {
    indent: { edgeType: indent.edgeType, edgeSource: indent.edgeSource },
    edgeCardinality,
    sections,
    // Every declaration this generator read and did not publish. See `scripts/ledger.mjs`.
    dropped: ledger.toJSON(),
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { check: false, configDir: DEFAULT_CONFIG_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--check") args.check = true;
    else if (argv[i] === "--config-dir") args.configDir = resolve(argv[++i]);
    else throw new GenerationError(`unknown flag: ${argv[i]}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.configDir)) {
    console.error(`config dir not found: ${args.configDir}`);
    console.error("(this is expected in CI, which does not check out the monorepo)");
    process.exit(3);
  }

  const ledger = new Ledger();
  const structural = generateStructural(args.configDir, ledger);

  const presentationPath = join(REPO_ROOT, "presentation.json");
  const current = JSON.parse(readFileSync(presentationPath, "utf8"));
  const next = { ...current, structural };

  if (args.check) {
    const same = JSON.stringify(current.structural) === JSON.stringify(structural);
    if (same) {
      console.log("presentation.json's 'structural' key matches the monorepo config.");
      return;
    }
    console.error("presentation.json's 'structural' key is STALE relative to the monorepo config.");
    console.error("current: " + JSON.stringify(current.structural, null, 2));
    console.error("generated: " + JSON.stringify(structural, null, 2));
    const before = current.structural?.dropped ?? {};
    for (const [key, why] of Object.entries(structural.dropped)) {
      if (!(key in before)) console.error(`  NEWLY DROPPED  ${key}: ${why}`);
    }
    for (const key of Object.keys(before)) {
      if (!(key in structural.dropped)) console.error(`  NO LONGER DROPPED  ${key}`);
    }
    process.exit(1);
  }

  writeFileSync(presentationPath, JSON.stringify(next, null, 2) + "\n");
  console.log(`wrote structural declaration to ${presentationPath}`);
  reportDropped("structural", ledger);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(String(e?.message || e));
    process.exit(e instanceof GenerationError ? 2 : 1);
  });
}

/**
 * compile-resolution — the PURE compile step for the resolution declaration, split out of
 * `generate-resolution-declaration.mjs` for the same reason `compile-structural.mjs` was split out
 * of `generate-structural-declaration.mjs` (`5d4f1b5`, PR #84) and `compile-qualification.mjs` out
 * of `generate-qualification-declaration.mjs` (`9be7f13`, PR #86): this module must be safe to
 * `import` inside a Cloudflare Worker isolate, and "the function is pure" is not the same claim as
 * "the file is safe to import in a Worker." Both prior ports found the same trap — a helper
 * computing a filesystem path at module top level, a Node idiom `wrangler`'s bundler does not
 * survive — the first time by crashing at Worker module load. This file is built to that finding
 * from the start: it imports only `yaml-subset.mjs` and `ledger.mjs`, both already zero-import, so
 * the Worker's module graph for the resolution route is exactly: this file, plus those two —
 * nothing Node-specific. `worker/src/config.js` imports `compile` from HERE, never from
 * `generate-resolution-declaration.mjs`, which keeps `node:fs`, `node:path` and
 * `monorepo-config.mjs` on the CLI side of the split where a Worker route never has to load them.
 *
 * ── WHAT MOVED HERE, VERBATIM OR NEAR IT ──
 *
 * Every piece of `generate-resolution-declaration.mjs` that never touched a filesystem path moved
 * unchanged: `readOrderingFields`, `readOrdering`, `orderingFieldNames`, `collectDefaultNodeType
 * Candidates`, `evaluateWhen`/`WhenRefusal`, `seedTokens`, `SEEDABLE_SHAPES`, `DIRECTIONS`,
 * `ORDERING_MODES`, `EXTRACTION_KINDS`, `FIELD_REF`, `CAPTURE_FIELDS_NOTE`. The nine `read*
 * (configDir, ...)` functions that DID read the filesystem directly (`readRegistration`,
 * `readLineGrammars`, `readDayBoundary`, `readChromeShapes`, `readViewFiles`, `readOrderingField
 * Markers`, `readFieldDefaults`, `readSpelling`, `readRetypeRules`) are rewritten as closures inside
 * one `compile(files, ledger)`, reading an in-memory files map instead of a directory — the same
 * has/get/allKeys shape `compile-structural.mjs` established and `compile-qualification.mjs` reused,
 * so a files map (an object from a POSTed JSON body, or a Map built by a caller) works without the
 * caller knowing which.
 *
 * ── WHAT CHANGED, NAMED SO IT IS NOT MISTAKEN FOR DRIFT ──
 *
 * Every LEDGER-DROP key (`node type 'header'`, `views/bar.yaml#2`, `ordering field 'due_date'`, …)
 * is byte-identical to what the original produced — `tests/declaration-drop.test.mjs` proves this,
 * unchanged, because a files-map key IS the same string the original derived from a directory read
 * plus a prefix. What changed is a small set of hard `GenerationError` messages that used to
 * interpolate an ABSOLUTE FILESYSTEM PATH (`${configDir}/schema.yaml does not exist`): those now
 * name the logical key instead (`schema.yaml does not exist`), the same move both prior ports made.
 * A second, equally inert change: the original threw a hard `GenerationError` if the whole `views/`
 * or `vocabulary/` DIRECTORY was absent (`existsSync(dir)` false); a flat files map has no directory
 * to check for, only keys, so that whole-directory guard is dropped in favour of the same posture
 * `compile-qualification.mjs` and `compile-structural.mjs` already take (filter the map's own keys,
 * no existence check on the prefix itself). This is not a silent widening: a files map with zero
 * `views/` keys still fails to compile, because `readRegistration` immediately requires
 * `views/default_registration.yaml` and throws when it is absent — the same net refusal, from a
 * different, still-named site. Checked directly, `grep -rn "does not exist" tests/` — no test pins
 * the old wording, so this is a real but inert change, not a risk to the refusal contract.
 *
 * ── WHAT DID NOT MOVE, AND WHY IT MATTERS MOST ──
 *
 * `seedTokens`, `evaluateWhen` and the retype-rule normaliser are unchanged in every way that
 * matters to what a new line becomes: none of them ever read a file, a files-map key, or a ledger
 * entry beyond what is passed in. `readRetypeRules`'s own directory-pair guard (`!existsSync
 * (rulesDir) || !existsSync(patternsDir)` -> `return []`) is replaced by the same "filter the map's
 * own keys" posture — for the fixture (no `rules/` tree at all) and the operator's real config
 * (`rules/` and `patterns/` both always present), the two are equivalent: zero `rules/`-prefixed
 * keys yields the same empty `[]` either way, with zero ledger drops, checked against both.
 */

import { parseYamlSubset } from "./yaml-subset.mjs";
import { Ledger } from "./ledger.mjs";
import { versionKey } from "./declaration-version.mjs";

export class GenerationError extends Error {}

const isScalar = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);
const isNonEmptyString = (v) => typeof v === "string" && v !== "";

// The fixed keys `compile`'s file map carries, plus the four prefixes every per-family file lives
// under. Named once so the pure function and any caller building a files map (the fs shell in
// `generate-resolution-declaration.mjs`, or a Worker route reading a POSTed body) agree on the
// exact same strings without restating them.
export const SCHEMA_KEY = "schema.yaml";
export const LINE_GRAMMARS_KEY = "line_grammars.yaml";
export const DAY_BOUNDARY_KEY = "day_boundary.yaml";
export const GLOBAL_DEFAULTS_KEY = "global_defaults.yaml";
export const VIEWS_PREFIX = "views/";
export const DEFAULT_REGISTRATION_KEY = `${VIEWS_PREFIX}default_registration.yaml`;
export const VOCABULARY_PREFIX = "vocabulary/";
export const MARKERS_KEY = `${VOCABULARY_PREFIX}markers.yaml`;
export const PATTERNS_PREFIX = "patterns/";
export const RULES_PREFIX = "rules/";

// The only two forms `app/present/newline.ts` knows how to seed. A type whose declared shape is
// anything else (`stat_line`, `heading`) is left OUT of the published map — see this generator's
// domain header (`generate-resolution-declaration.mjs`) for why that is a refusal and not an
// omission.
const SEEDABLE_SHAPES = new Set(["checkbox", "plain_line"]);

const DIRECTIONS = new Set(["asc", "desc"]);
const ORDERING_MODES = new Set(["pattern_default", "insertion_order"]);

// A section's `ordering:` names a FIELD; `vocabulary/markers.yaml`'s own `token`/`extraction_hint`
// pair says how its VALUE is spelled on a printed line. Restricted to hints an ordering preview can
// read a value from — see the domain header for the two kinds left out on purpose.
const EXTRACTION_KINDS = { trailing_date: "date", trailing_int: "int", trailing_float: "float" };

/**
 * The vocabulary family whose tokens the engine emits into a line's MARKERS cell — the family
 * `TokenResolver.source_markers_for_node` walks (`token_resolver.py:566`). Named here so the
 * tag/marker/neither split in `readSpelling` reads a DECLARATION rather than sniffing a glyph's
 * characters. See that function's own paragraph on why.
 */
const MARKER_FAMILY = "markers";

// ── THE DEFAULT ORDERING — a DECLARED value now, resolved like everything else ────────────────
//
// UNTIL THIS CHANGE, this file published `apps/qntm-md/src/qntm_md/render/section_builder.py:
// 26-37`'s `_DEFAULT_ORDERING`/`_PRIORITY_RANK` — a hardcoded (due_date, priority, title) tuple —
// as an "ENGINE FACT... true for every qntm-md instance", unconditionally, for every operator this
// app will ever serve. That was the defect: qntm.network lets an operator declare their OWN node
// types and fields, and "everything else... and ordering" (the operator's own words). A user with
// no `due_date` and no `priority` in their vocabulary got a GLOBAL default naming fields that do
// not exist for them — the one rung of the resolution cascade (GLOBAL -> VIEW -> STRUCTURAL_NODE
// -> LINE) that answered for every user identically, whether or not it made sense for them.
//
// `readGlobalDefaultOrdering` below reads `global_defaults.yaml`'s own `default_ordering:` /
// `priority_rank:` keys (GLOBAL_DEFAULTS_KEY) — the same file, and the same GLOBAL layer, that
// already carries `defaults:` (config-root field defaults) and `node_defaults_cascade:`. A
// per-operator config can now say what its own floor sorts by; this file no longer decides that
// for anyone.
//
// ── THE FALLBACK, AND WHY IT IS VISIBLE RATHER THAN SILENT ──
//
// `apps/qntm-md/config/` is read-only from this repo, and the ENGINE (`section_builder.py`) still
// hardcodes `_DEFAULT_ORDERING`/`_PRIORITY_RANK` — see this file's own report for why that half of
// the fix is out of scope here. So the operator's real config declares nothing yet, and a compile
// against it must not go dark: `readGlobalDefaultOrdering` falls back to
// `ENGINE_LITERAL_DEFAULT_ORDERING`/`ENGINE_LITERAL_PRIORITY_RANK` below — the exact tuple the
// engine hardcodes, reproducing today's behaviour byte for byte — but records WHICH path answered
// as `resolution.defaultOrderingSource` (`"config"` or `"engine-fallback"`), published alongside
// `defaultOrdering`/`priorityRank`. Three options were open here: fail the compile loudly when
// nothing is declared (breaks every deploy until the operator's own config change lands, for a
// floor 171 of 186 of his own sections rely on); publish nothing (the same defect this change
// exists to fix, now silent about EVERY vault rather than one); or fall back with the fallback
// recorded. The third is what ships — a fallback nobody can see is how the literal survived this
// long, so the one thing this compiler refuses to do is answer without saying which answer it gave.
export const ENGINE_LITERAL_DEFAULT_ORDERING = Object.freeze([
  Object.freeze({ field: "due_date", direction: "asc" }),
  Object.freeze({ field: "priority", direction: "desc" }),
  Object.freeze({ field: "title", direction: "asc" }),
]);

// Mirrors section_builder.py:31-37 (`_PRIORITY_RANK`) verbatim — the same fallback posture as
// `ENGINE_LITERAL_DEFAULT_ORDERING` above. FOUR NUMBERS FOR FIVE NAMES, not simplified to five:
// `normal` and `medium` really do share rank 2 in the engine's own dict.
export const ENGINE_LITERAL_PRIORITY_RANK = Object.freeze({ urgent: 4, high: 3, normal: 2, medium: 2, low: 1 });

// ── COMPOSITION — the SECOND direction of a line grammar, and why it is not in `lineGrammars` ──
//
// `line_grammars.yaml` declares RECOGNITION — what a whole LINE may look like, at parse-boundary
// granularity (blank / fenced-code-delimiter / heading-prefix). Its own header says the emit
// direction is NOT shape-driven: "render/renderer.py composes a body line's `- ` bullet ... directly"
// — a composition row added there would load clean and read by nothing. So this is a DIFFERENT
// fact at a DIFFERENT granularity: given a body line already recognised as checkbox / plain_line,
// WHERE each CELL goes — the checkbox glyph, the title, the `[[qntm:N]]` stamp, the tags, the
// markers, the outgoing-edge chrome.
//
// UNTIL THIS CHANGE, this file published `renderer.py`'s own `_COMPOSITION_HEADS`/
// `_COMPOSITION_TAIL` as an unconditional literal, with the comment right here saying "there is NO
// config surface for this at all". That was true of the ENGINE the day it was written, and stopped
// being true the moment monorepo PR #72 (`bc3aa01`, "The engine reads composition from config, not
// just its own copy") gave `global_defaults.yaml` its own `composition:` key, validated at load
// time by `bundle/loader.py`'s `_validate_global_composition` and threaded into every render call
// site — that PR's own body named the asymmetry it was opening: the ENGINE would honour a declared
// composition and the BROWSER would keep publishing the old literal regardless, silently disagreeing
// the moment anyone declared one that actually differs. `readGlobalComposition` below closes it,
// mirroring `readGlobalDefaultOrdering`'s own visible-fallback discipline exactly: absence falls
// back to `ENGINE_LITERAL_COMPOSITION`, recorded as `compositionSource: "engine-fallback"`; a
// declared `composition:` is read, validated against the SAME shape `_validate_global_composition`
// enforces (a non-empty `heads:` mapping naming both `checkbox` and `plain_line`, each a non-empty
// list drawn only from `checkbox`/`title`; a non-empty `tail:` list drawn only from `stamp`/`date`/
// `tags`/`markers`/`chrome`), and published verbatim as `compositionSource: "config"`. A PRESENT
// but malformed declaration is a hard `GenerationError`, never a silent fallback — the engine's own
// posture, reproduced rather than relaxed. `separator` is not a declared key on either side: the
// engine always joins with `" "` (renderer.py:1003's `" ".join`, unchanged by PR #72), so this
// generator always publishes `separator: " "` regardless of source.
//
// Read LIVE off `apps/qntm-md/src/qntm_md/render/renderer.py`:
//   `_field_expression_cells` (renderer.py:1138-1194) — the ONE tail every shape emits:
//     stamp (`qntm_id_cell`), then date (`date_cell` — ALWAYS "" today, the dissolved 2026-05-30
//     #35 path; `due_date` now round-trips through the marker path like any other marker field,
//     kept here for faithfulness to the real function shape, not tidiness), then tags, then
//     markers, then outgoing-edge chrome.
//   `_emit_checkbox_shape` (renderer.py:1197-1225) — HEAD = [checkbox, title], then the tail above.
//   `_emit_plain_line_shape` (renderer.py:1267-1290) — HEAD = [title], then the tail above.
//   (`stat_line`'s HEAD is one FUSED `title: value` cell composed by
//   `grammar.node_type_form.compose_stat_line_head` — never spelled here — and is not published
//   below because `SEEDABLE_SHAPES` above already excludes it from anything this app composes.)
//   The whole line (renderer.py:1003): `"    " * depth + "- " + " ".join(cell for cell in cells if cell)`
//   — 4 spaces per depth level, a literal `- ` bullet, every non-empty cell joined by one space.
//
// Pinned against a LIVE import of that renderer by `scripts/composition-agreement.py` (the same
// discipline `resolution-agreement.py` established for `defaultOrdering`/`priorityRank`) — see
// `tests/composition-agreement.test.mjs` for the second, independent half: it recomposes
// `tests/fixtures/composition-agreement.json`'s own cell values through
// `app/present/express/composition.ts`'s `composeLine`, using ONLY this declared order, and
// asserts the result against that fixture's `expectedLine` — the engine's own committed output.
// That fixture is generated against the ENGINE-FALLBACK literal (no monorepo config declares
// `composition:` yet), so it does not exercise `readGlobalComposition`'s "config" branch —
// `tests/resolution-declared-composition.test.mjs` is where that branch is proven, the same split
// `tests/resolution-declared-default-ordering.test.mjs` already draws for `defaultOrdering`.
export const ENGINE_LITERAL_COMPOSITION = Object.freeze({
  heads: Object.freeze({
    checkbox: Object.freeze(["checkbox", "title"]),
    plain_line: Object.freeze(["title"]),
  }),
  tail: Object.freeze(["stamp", "date", "tags", "markers", "chrome"]),
  separator: " ",
  // FORM — mirrors renderer.py's own `_COMPOSITION_BULLET` / `_COMPOSITION_TITLE_STYLES`. See
  // that module's "COMPOSITION FORM" header for the two capabilities admitted (a declared GFM
  // bullet; an additional unconditional title wrap drawn from the SAME three-member vocabulary
  // `canonicalise_title_segment` already strips on ingest) and everything this slice refused.
  bullet: "-",
  titleStyles: Object.freeze([]),
});

// ── TAG ORDER — WITHIN the "tags" cell composition names, WHICH TAG COMES FIRST ──
//
// `composition.tail` (above) says a NEW type tag belongs somewhere before markers/chrome. It says
// NOTHING about where that tag lands relative to OTHER tags already in the same cell (a domain tag,
// an edge-shorthand tag) — that is a THIRD, separate fact, published here for the first time
// (2026-08-07). Found while fixing `renderRuleEffects`'s `retype` append path: it was landing a
// fresh type tag by string-concatenation ("wherever nothing else already is"), which happens to
// agree with the engine for `#outcome`/`#habit` (both rank far above every domain tag) but is not
// the actual rule and would silently disagree for any node type ranked BELOW an already-present tag.
//
// Read LIVE off `apps/qntm-md/src/qntm_md/render/contracts/order_tags.yaml` — that file's own
// header states it flatly: "THIS FILE IS THE SOURCE OF TRUTH FOR TAG ORDER. Nothing else is." — and
// `OrderTagsActionDispatcher` (`capabilities/decision_tables/runtime/dispatchers/order_tags.py`) is
// the ONE place that reads it: partition the node's tags into RANKED (a member of `canonical_order`)
// and UNRANKED, stable-sort the ranked pool by its position in `canonical_order`, then concatenate
// per `unranked_policy` (`append_stable` today — unranked tags trail, in their own original order).
//
// UNLIKE `composition`, THIS FILE NAMES NO CONFIG OVERRIDE SURFACE — it is not `global_defaults.
// yaml`-declarable (its own header: "To change the order the operator sees, edit THIS list", i.e.
// the engine's own source, not the operator's vault config) — so there is no "config" vs
// "engine-fallback" split to publish here; this generator always publishes the literal, and
// `tagOrderSource` is always `"engine-literal"` so a reader can still tell WHICH kind of fact this
// is (an engine-internal contract, never operator-declared) rather than assuming it is silent about
// its own provenance the way an unconditional literal elsewhere in this file would be.
//
// Pinned against a LIVE import by `scripts/retype-agreement.py` (same discipline `composition-
// agreement.py` established) — see `tests/retype-agreement.test.mjs` for the exhaustive, family-wide
// proof (every `qualification.tokens.node_type` entry, not a sample).
// ── WHAT THIS GENERATOR READS FROM A VIEW SHEET, DECLARED RATHER THAN ENACTED ─────────────────
//
// Until now the answer lived only in the reads themselves — `view.default_node_type` here,
// `section.ordering` there, `"input_grammar" in view` in a third place — so the question "does
// this generator see key K?" had no lookup, only a grep. The three lists below are that lookup,
// and they exist to be CHECKED: `tests/view-key-agreement.test.mjs` asserts their union equals
// the ENGINE's own `_ALLOWED_SHEET_KEYS` / `_ALLOWED_SECTION_KEYS`
// (`apps/qntm-md/src/qntm_md/bundle/validators/views.py`), captured live by
// `scripts/view-key-agreement.py`.
//
// WHY THAT CHECK AND NOT A COMMENT. The engine's view-sheet validator hard-rejects an unknown key
// at BOTH levels (measured 2026-08-14: a sheet or section declaring `composition:` raises
// `BundleValidationError` and the operator's bundle does not load). So the operator's declarable
// surface is exactly that allow-list, and the day a key is ADDED to it — a per-view `composition:`
// is the live candidate — this generator must decide what to do with it rather than carry on
// publishing a global answer for a view that overrides it. That is the asymmetry monorepo PR #72
// opened for `composition:` at the GLOBAL rung and `readGlobalComposition` closed six weeks later;
// the check below is what makes the NEXT one fail loudly on the day it opens instead.
//
// THREE LISTS, NOT TWO, because "this generator does not publish it" has two different causes and
// collapsing them is how a refusal becomes an omission:
//   PUBLISHED     — read, and it reaches the browser.
//   REFUSED       — read, and this generator REFUSES to compile at all while a sheet declares it,
//                   because `resolution/registration.py`'s own `LEVELS_FOR` grants the key a VIEW
//                   or STRUCTURAL_NODE level this generator does not resolve, so the GLOBAL answer
//                   it would publish is stale. Enforced in `readRegistration`, not here.
//   NOT_PUBLISHED — genuinely another declaration's concern (qualification, structure, write
//                   policy). Not read, not lost: the browser never needed it.
// A key in NONE of the three is the dangerous fourth state — silently ignored — and gets a drop.
export const VIEW_SHEET_KEYS_PUBLISHED = Object.freeze(["sections", "default_node_type", "composition"]);
export const VIEW_SHEET_KEYS_REFUSED = Object.freeze(["input_grammar", "default_tags"]);
export const VIEW_SHEET_KEYS_NOT_PUBLISHED = Object.freeze([
  "version",
  "domain",
  "path",
  "defaults",
  "write_policy",
  // ACCEPTED BY THE ENGINE AND READ BY NOTHING — `validators/views.py` admits it, `render/
  // compiler.py:209` carries it onto the compiled sheet, and no consumer of
  // `compiled_sheet.rendering_contract` exists (grepped live, 2026-08-14). A per-view rendering
  // slot that already parses and already decides nothing. Not this generator's to fill.
  "rendering_contract",
]);
export const VIEW_SECTION_KEYS_PUBLISHED = Object.freeze([
  "id",
  "name",
  "default_node_type",
  "defaults",
  "ordering",
  "ordering_mode",
]);
export const VIEW_SECTION_KEYS_REFUSED = Object.freeze(["input_grammar", "default_tags"]);
export const VIEW_SECTION_KEYS_NOT_PUBLISHED = Object.freeze([
  "qualification",
  "pin_after_qualification_drops",
  "parameters",
  "header_value",
  "render_body",
  "include_ancestors",
  "structural_edge_types",
  "structural_edge_direction",
  "pull_context",
  "empty_children_placeholder",
  "container_node",
  "membership",
]);

const VIEW_SHEET_KEYS_KNOWN = new Set([
  ...VIEW_SHEET_KEYS_PUBLISHED,
  ...VIEW_SHEET_KEYS_REFUSED,
  ...VIEW_SHEET_KEYS_NOT_PUBLISHED,
]);
const VIEW_SECTION_KEYS_KNOWN = new Set([
  ...VIEW_SECTION_KEYS_PUBLISHED,
  ...VIEW_SECTION_KEYS_REFUSED,
  ...VIEW_SECTION_KEYS_NOT_PUBLISHED,
]);

// ── THE OTHER TWO CANONICAL ORDERS — same contract family as `order_tags`, same shape ─────────
//
// `composition.tail` names three cell families that carry more than one cell: `tags`, `markers`
// and `chrome`. Each has its own canonical order, each declared by its own contract, and until now
// only ONE of the three was published. A composer holding `tagOrder` alone could order the tag cell
// and would have to invent an order for the other two — which is not a smaller failure than
// inventing a glyph, it is the same failure one cell along.
//
//   order_markers    the MARKER cell — emoji keys (`📅 2026-09-01`), ordered by their glyph.
//   order_edge_tags  the CHROME cell — outgoing-edge tags (`#waiting-for [[Some node]]`).
//
// BOTH ARE `"engine-literal"`, like `tagOrder` and for the same reason: the contracts live in the
// engine's own source with no operator override surface. `order_markers.yaml`'s own header says so
// — "to change the marker order the operator sees, edit THIS list" — and names
// `config/rendering/marker_ordering.yaml` as a RETIRED COPY "kept in sync by nothing".
//
// PINNED BY DRIVING THE DISPATCHER, NOT BY READING THE FILE, and here that matters more than it did
// for `render_checkbox`: these contracts are being MOVED out of the engine's source tree into
// config. `renderer.py`'s `_engine_render_dispatcher(table_id)` takes a table id and returns a
// dispatcher; the path is inside it. So a pin that asks the FACTORY survives the move, and a pin
// that named `src/qntm_md/render/contracts/order_markers.yaml` would break on the day it lands.
// ── THE TITLE WRAP — the LAST render decision, and the one with a real predicate language ────
//
// `_render_node_line` merges two answers before wrapping a title once: the GLOBAL, unconditional
// `composition.form.title_styles` (already published, empty in his config) and this PER-NODE one,
// `render_title_style`, dispatched over the node-local context. Two of its five rows are ordinary
// in his vault — an in-progress task renders **bold**, an explainer renders *italic* — so a
// composer without this table differs from the engine on lines he reads every day.
//
// ── WHY THIS IS NOT `renderCheckbox` WITH MORE ROWS ──
//
// `renderCheckbox` compares ONE field to ONE value, so `{field, equals}` says everything it can
// say. These predicates nest: `and` over `eq` over `node.type` AND `node.fields.status`, plus
// `gte` against `node.edge_type_counts.WAITING_FOR` — a path that is not a field at all but a
// derived count of the node's outgoing edges. Extending the checkbox row shape to reach that would
// have made one shape mean two things.
//
// ── PUBLISHED FOR THE ROW IT BECOMES, NOT ONLY THE ROW IT IS ──
//
// The contract's own comment (`render_title_style.yaml:64`) says the WAITING_FOR row becomes
// `{gte: ["node.incoming_edge_type_counts.WAITING_FOR", 1]}` once that mirror lands. A shape
// frozen to today's three operators would drift the moment the engine moved — the `render_checkbox`
// lesson in a different key. So:
//
//   * OPERATORS are the rule engine's OWN closed set, not the subset these rows happen to use.
//     `qntm_rule_engine`'s `_COMPARISON_OPERATORS` is eq/ne/gt/gte/lt/lte and its logical forms are
//     and/or/not — nine. These rows use three. The other six are already reachable today by a
//     config edit, so a shape that could not carry them would be wrong on arrival, not later.
//   * PATHS ARE OPAQUE STRINGS, resolved by the reader against the context it builds. That is what
//     makes `node.incoming_edge_type_counts.WAITING_FOR` need no change here at all: it is another
//     path, and the shape already carries paths.
//
// PINNED BY DRIVING `_title_style_dispatcher()` over a grid of real node contexts — see
// `title_style_pin` in `scripts/composition-agreement.py`. The compiled row holds an opaque
// `when_ast`, so transcribing it would be guessing; asking the dispatcher what it ANSWERS for a
// context is the same "agree with the decision, not with a file" posture the checkbox pin takes.
export const ENGINE_LITERAL_RENDER_TITLE_STYLE = Object.freeze({
  // ORDER IS MEANING: first row whose `when` holds decides, later rows never run.
  rows: Object.freeze([
    Object.freeze({
      when: Object.freeze({
        op: "and",
        terms: Object.freeze([
          Object.freeze({ op: "eq", path: "node.type", value: "task" }),
          Object.freeze({ op: "eq", path: "node.fields.status", value: "done" }),
        ]),
      }),
      then: Object.freeze([]),
    }),
    Object.freeze({
      when: Object.freeze({
        op: "and",
        terms: Object.freeze([
          Object.freeze({ op: "eq", path: "node.type", value: "task" }),
          Object.freeze({ op: "eq", path: "node.fields.status", value: "cancelled" }),
        ]),
      }),
      then: Object.freeze([]),
    }),
    Object.freeze({
      when: Object.freeze({
        op: "and",
        terms: Object.freeze([
          Object.freeze({ op: "eq", path: "node.type", value: "task" }),
          Object.freeze({ op: "eq", path: "node.fields.status", value: "in_progress" }),
        ]),
      }),
      then: Object.freeze(["bold"]),
    }),
    Object.freeze({
      when: Object.freeze({
        op: "and",
        terms: Object.freeze([
          Object.freeze({ op: "eq", path: "node.type", value: "task" }),
          Object.freeze({ op: "eq", path: "node.fields.status", value: "waiting" }),
          // THE ROW THE CONTRACT SAYS WILL MOVE. When the incoming mirror lands this becomes
          // `node.incoming_edge_type_counts.WAITING_FOR` and NOTHING ABOUT THIS SHAPE CHANGES —
          // which is the whole reason paths are opaque here.
          Object.freeze({ op: "gte", path: "node.edge_type_counts.WAITING_FOR", value: 1 }),
        ]),
      }),
      then: Object.freeze(["italic"]),
    }),
    Object.freeze({
      when: Object.freeze({ op: "eq", path: "node.type", value: "explainer" }),
      then: Object.freeze(["italic"]),
    }),
  ]),
  // A node matching NO row takes this. The contract's own `fallback:`, not a default chosen here.
  fallback: Object.freeze([]),
});

export const ENGINE_LITERAL_MARKER_ORDER = Object.freeze({
  canonicalOrder: Object.freeze(["📅", "🛫", "⏫", "🔽", "✅"]),
  unrankedPolicy: "append_stable",
});

export const ENGINE_LITERAL_EDGE_TAG_ORDER = Object.freeze({
  canonicalOrder: Object.freeze(["#requires", "#blocks", "#next", "#parallel", "#waiting-for"]),
  unrankedPolicy: "append_stable",
});

export const ENGINE_LITERAL_TAG_ORDER = Object.freeze({
  canonicalOrder: Object.freeze([
    "#project",
    "#outcome",
    "#habit",
    "#task",
    "#routine",
    "#work",
    "#personal",
    "#health",
    "#next",
    "#parallel",
    "#waiting-for",
  ]),
  unrankedPolicy: "append_stable",
});

// ── THE CHECKBOX GLYPH — A DECISION, NOT A LOOKUP ────────────────────────────────────────────
//
// Read LIVE off `apps/qntm-md/src/qntm_md/render/contracts/render_checkbox.yaml`, whose own header
// states it flatly: "THIS FILE IS THE SOURCE OF TRUTH FOR THE CHECKBOX GLYPH. Nothing else is."
// `renderer._checkbox_dispatcher()` compiles that file and `_render_node_line` dispatches it over
// the node-local context; the result IS `composition.heads.checkbox[0]`, the first cell of every
// checkbox line the operator sees.
//
// ── WHY THIS IS NOT A MAP, AND WHY THAT DISTINCTION IS THE WHOLE POINT ──
//
// `config/vocabulary/checkbox.yaml` declares the same six (status, glyph) pairs, and this
// generator publishes them — it did, until this change, as `spelling.fieldTokens.status`. They
// agree today. That agreement is a coincidence of the current config, not a structure, and two
// properties of the real contract are NOT EXPRESSIBLE as a value map:
//
//   * FIRST-MATCH-WINS over predicate rows. A map is unordered by construction. The day a row
//     gains a second condition, or two rows can both match, a map has no way to say which wins.
//   * `fallback: "[ ]"`. A status-LESS node renders an open box BY RULE. A value map has no entry
//     for "absent" and would leave a composer to invent one.
//
// ── AND THE DIVERGENCE ALREADY HAPPENED, AND IT COST THE OPERATOR DATA ──
//
// Before the 2026-06-24 bugfix every row ALSO required `node.type == "task"`. A done OUTCOME
// matched no row, fell to the fallback, and rendered `[ ]` while the model held status=done — so
// the next re-ingest read the open box and silently RE-OPENED completed outcomes (qntm:66/837/903,
// roughly every four to five days). The contract's header names the retired copy that tracked it
// and says "kept in sync by nothing" and "never reconcile this table back toward that file".
//
// A hand-copied literal is exactly such a copy — UNLESS something checks it. That is what
// `scripts/composition-agreement.py` does for this table: it loads the real contract through the
// real dispatcher and REFUSES to write its fixture if these rows disagree, the same discipline
// `ENGINE_LITERAL_TAG_ORDER` above already lives under. The literal is safe because of the pin, not
// instead of it.
export const ENGINE_LITERAL_RENDER_CHECKBOX = Object.freeze({
  // ORDER IS MEANING HERE. First row whose `when` holds decides the glyph; later rows never run.
  rows: Object.freeze([
    Object.freeze({ when: Object.freeze({ field: "status", equals: "open" }), then: "[ ]" }),
    Object.freeze({ when: Object.freeze({ field: "status", equals: "done" }), then: "[x]" }),
    Object.freeze({ when: Object.freeze({ field: "status", equals: "in_progress" }), then: "[/]" }),
    Object.freeze({ when: Object.freeze({ field: "status", equals: "cancelled" }), then: "[-]" }),
    Object.freeze({ when: Object.freeze({ field: "status", equals: "waiting" }), then: "[~]" }),
    Object.freeze({ when: Object.freeze({ field: "status", equals: "scheduled" }), then: "[>]" }),
  ]),
  // A node matching NO row — a status-less one — renders this. Not a default this compiler chose:
  // the contract's own `fallback:` key.
  fallback: "[ ]",
});

// The cell-class vocabulary a declared `composition:` may use — mirrors `bundle/loader.py`'s own
// `_COMPOSITION_REQUIRED_HEAD_SHAPES` / `_COMPOSITION_HEAD_CELL_CLASSES` /
// `_COMPOSITION_TAIL_CELL_CLASSES` (monorepo, read-only) field for field. Kept as data here, the
// same posture `EXTRACTION_HINT_KINDS`-style tables in this file already take, so a shape check is
// "is this string in the set", never a decision this compiler makes about what a cell class MEANS.
// ── BEFORE YOU ADD A KEY TO THE PUBLISHED DECLARATION: CAN ITS VALUE EVER DIFFER? ─────────────
//
// If no, do not publish it. A field that cannot vary is not a fact about the operator's config;
// it is a shape that reads like one. It agrees with every consumer, survives every test anyone
// would write about it, and adds one more thing that must be kept true — while telling the
// reader nothing they did not already have.
//
// This is stated HERE, beside the vocabularies, rather than only at the call sites that already
// made the decision, because the next person to add a key meets this file before they meet
// those. The full argument, its boundary and what to do instead live in flow-trace
// `docs/architecture/architecture.yaml#a-published-fact-that-cannot-vary-is-a-shape`.
//
// THREE REFUSALS ON ONE DAY (2026-08-14), by two agents who did not consult each other — which
// is the evidence that this is a rule and not a preference:
//   `write_policy`                 every view answers `writable`; a one-valued table is a
//                                  caller's assumption dressed as data.
//   `field_value_chrome_emission`  no rows declared; an empty table reads as coverage.
//   `viewCompositionSource`        PRESENCE in `viewComposition` is the source, so a parallel
//                                  map would hold the word "view" in every slot. Derived at the
//                                  read instead, by `resolutiontable.ts`'s `compositionFor`.
//
// AND THE BOUNDARY, because this is not an argument against publishing anything constant:
// `compositionSource` reads `engine-fallback` for every config the operator has today and is
// RIGHT to publish, because a declared `composition:` would move it. The question is whether the
// field CAN vary, never whether it currently does.

const COMPOSITION_REQUIRED_HEAD_SHAPES = ["checkbox", "plain_line"];
const COMPOSITION_HEAD_CELL_CLASSES = new Set(["checkbox", "title"]);
const COMPOSITION_TAIL_CELL_CLASSES = new Set(["stamp", "date", "tags", "markers", "chrome"]);
// FORM — mirrors `bundle/loader.py`'s own `_COMPOSITION_FORM_KEYS` / `_COMPOSITION_BULLET_CHARS` /
// `_COMPOSITION_TITLE_STYLE_VOCABULARY` (monorepo, read-only). See `renderer.py`'s "COMPOSITION
// FORM" header for why each closed set is exactly the set it is.
const COMPOSITION_TOP_KEYS = new Set(["heads", "tail", "form"]);
const COMPOSITION_FORM_KEYS = new Set(["bullet", "title_styles"]);
const COMPOSITION_BULLET_CHARS = new Set(["-", "*", "+"]);
const COMPOSITION_TITLE_STYLE_VOCABULARY = new Set(["italic", "bold", "strikethrough"]);

const CAPTURE_FIELDS_NOTE =
  "a new line carries its resolved node type, the schema's declared field defaults and its " +
  "section's own 'defaults:' block, and nothing else";

/** `$current.node.fields.X` -> `X`, and nothing else is a field reference this reader accepts. */
const FIELD_REF = /^\$current\.node\.fields\.([A-Za-z_][A-Za-z0-9_]*)$/;

class WhenRefusal extends Error {}

/**
 * One `when:` clause, normalised into a predicate over a bare capture's own fields, or refused.
 * PURE — no file, no files-map key, no ledger; unchanged by this file's existence.
 */
function evaluateWhen(when, fields) {
  if (when === null || when === undefined) return true;
  if (!when || typeof when !== "object" || Array.isArray(when)) {
    throw new WhenRefusal(`'when:' is ${Array.isArray(when) ? "a list" : typeof when}, not a clause`);
  }
  const keys = Object.keys(when);
  if (keys.length !== 1) throw new WhenRefusal(`'when:' carries ${keys.length} operators`);
  const [operator] = keys;
  const operand = when[operator];
  if (operator === "not") {
    const list = Array.isArray(operand) ? operand : [operand];
    if (list.length !== 1) throw new WhenRefusal("'not:' is not a single clause");
    return !evaluateWhen(list[0], fields);
  }
  if (operator === "null") {
    const list = Array.isArray(operand) ? operand : [operand];
    if (list.length !== 1 || typeof list[0] !== "string") {
      throw new WhenRefusal("'null:' is not a single reference");
    }
    const match = FIELD_REF.exec(list[0]);
    if (match === null) throw new WhenRefusal(`'null:' reads ${list[0]}, not one of the node's fields`);
    return fields[match[1]] === undefined || fields[match[1]] === null;
  }
  if (operator === "eq") {
    if (!Array.isArray(operand) || operand.length !== 2 || !operand.every(isScalar)) {
      throw new WhenRefusal("'eq:' is not two literal scalars");
    }
    if (operand.some((v) => typeof v === "string" && v.startsWith("$"))) {
      throw new WhenRefusal("'eq:' reads a cycle variable");
    }
    return operand[0] === operand[1];
  }
  throw new WhenRefusal(`operator '${operator}'`);
}

/**
 * The seed for one section: the tokens the engine would print for the node it would mint here.
 * PURE — unchanged by this file's existence; see the domain header for the full argument.
 */
function seedTokens(what, nodeType, defaults, fieldDefaults, spelling, retypeRules, ledger) {
  const fields = { node_type: nodeType, ...fieldDefaults, ...defaults };
  const tokens = [];

  let retypedBy = null;
  for (const rule of retypeRules) {
    // NOT A DROP: loop control. A rule that retypes TO the type this section already resolves
    // changes nothing about this line, so it is not a retype here at all.
    if (rule.becomes === nodeType) continue;
    const binds = Object.entries(rule.find).every(([field, value]) =>
      field === "node_type" ? value === nodeType : (fields[field] ?? null) === value,
    );
    // NOT A DROP: loop control. The rule's own pattern does not select this section's capture, so
    // there is no declaration of the operator's being discarded — the rule simply does not apply.
    if (!binds) continue;
    let fires;
    try {
      fires = evaluateWhen(rule.when, fields);
    } catch (error) {
      if (!(error instanceof WhenRefusal)) throw error;
      ledger.drop(rule.what, `${error.message}, so whether it retypes a new line was not evaluated`);
      continue;
    }
    if (fires) retypedBy = rule;
  }

  const typeToken = spelling.typeTokens[nodeType];
  if (retypedBy !== null) {
    // DROP PATH 19. design-the-rule-mirror.md §3.3, derived rather than named: the registration
    // answer is contradicted by a rule inside the same pass that minted the line.
    ledger.drop(
      what,
      `its type tag is not seeded — rule '${retypedBy.id}' retypes a '${nodeType}' to ` +
        `'${retypedBy.becomes}' for a line whose fields it matches, and ${CAPTURE_FIELDS_NOTE}`,
    );
  } else if (typeToken === undefined) {
    // DROP PATH 20. A resolved node type no vocabulary tag spells. The engine prints no type tag
    // for it either, so the absence is agreement, and it is still worth stating.
    ledger.drop(what, `no vocabulary tag spells the node type '${nodeType}', so none is seeded`);
  } else {
    tokens.push(typeToken);
  }

  for (const field of spelling.fieldOrder) {
    if (!Object.prototype.hasOwnProperty.call(defaults, field)) continue;
    const token = spelling.fieldTokens[field]?.[String(defaults[field])];
    if (token !== undefined) tokens.push(token);
  }
  for (const [field, value] of Object.entries(defaults)) {
    if (spelling.fieldTokens[field]?.[String(value)] !== undefined) continue;
    // DROP PATH 21. A declared default no vocabulary tag spells. The engine does not print it
    // either, so seeding one would invent a spelling and freeze a value the engine goes on
    // deciding — see the domain header on `INPUT WINS`.
    ledger.drop(
      `${what} default '${field}'`,
      `no vocabulary tag spells ${field}=${JSON.stringify(value)}, so it cannot be written into a ` +
        "line the operator types (the engine prints no tag for it either)",
    );
  }
  return tokens;
}

function readOrderingFields(section, where) {
  const fields = {};
  if ("ordering" in section) {
    const ordering = section.ordering;
    if (!Array.isArray(ordering) || ordering.length === 0) {
      throw new GenerationError(`${where}.ordering is not a non-empty list`);
    }
    fields.ordering = ordering.map((entry, i) => {
      if (!entry || typeof entry !== "object") {
        throw new GenerationError(`${where}.ordering[${i}] is not a mapping`);
      }
      const { field, direction } = entry;
      if (!isNonEmptyString(field)) {
        throw new GenerationError(`${where}.ordering[${i}].field is not a string`);
      }
      if (!DIRECTIONS.has(direction)) {
        throw new GenerationError(
          `${where}.ordering[${i}].direction is '${direction}', not one of ${[...DIRECTIONS].join("/")}`,
        );
      }
      return { field, direction };
    });
  }
  if ("ordering_mode" in section) {
    const mode = section.ordering_mode;
    if (!ORDERING_MODES.has(mode)) {
      throw new GenerationError(
        `${where}.ordering_mode is '${mode}', not one of ${[...ORDERING_MODES].join("/")}`,
      );
    }
    fields.orderingMode = mode;
  }
  return fields;
}

function readOrdering(viewFiles, ledger) {
  const out = {};
  for (const [file, view] of viewFiles) {
    const sections = {};
    for (const [index, section] of view.sections.entries()) {
      // DROP PATH 7. A section with no readable `id:` — its `ordering:` is unpublishable because
      // there is no key to publish it under, and until now nothing said the ordering was lost.
      if (!section || typeof section !== "object" || typeof section.id !== "string") {
        ledger.drop(
          `views/${file}#${index}`,
          `section at index ${index} of view '${view.viewId}' has no readable 'id:', so any ` +
            "ordering it declares could not be published under any key",
        );
        continue;
      }
      const fields = readOrderingFields(section, `${file}: section '${section.id}'`);
      if (Object.keys(fields).length === 0) continue;
      // THE OPERATOR'S OWN WORDS FOR THE SECTION — see the domain header.
      if (typeof section.name === "string" && section.name !== "") fields.name = section.name;
      sections[section.id] = fields;
    }
    if (Object.keys(sections).length > 0) out[view.viewId] = sections;
  }
  return out;
}

function orderingFieldNames(ordering) {
  const names = new Set();
  for (const sections of Object.values(ordering)) {
    for (const section of Object.values(sections)) {
      for (const key of section.ordering ?? []) names.add(key.field);
    }
  }
  return names;
}

/**
 * Every mapping in the published spelling table, key-sorted, so the committed artifact is a
 * function of the config's CONTENT and not of the order its files were read in. See `readSpelling`'s
 * return for why this matters to `generate:resolution:check` specifically.
 */
function sortSpelling(rendered) {
  const sortMap = (m) => Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const sortNested = (m) =>
    sortMap(Object.fromEntries(Object.entries(m).map(([field, table]) => [field, sortMap(table)])));
  return {
    typeTokens: sortMap(rendered.typeTokens),
    edgeTags: sortMap(rendered.edgeTags),
    fieldTags: sortNested(rendered.fieldTags),
    fieldMarkerValues: sortNested(rendered.fieldMarkerValues),
    fieldMarkers: sortMap(rendered.fieldMarkers),
  };
}

function collectDefaultNodeTypeCandidates(registration, viewFiles) {
  const types = new Set([registration.defaultNodeType]);
  for (const [, view] of viewFiles) {
    if (typeof view.default_node_type === "string") types.add(view.default_node_type);
  }
  return [...types].sort();
}

// ── the pure compile — `design-the-runtime-compile.md` step C's own contract ───────────────────

/**
 * Compile the resolution declaration from an in-memory config tree. PURE: no filesystem, no
 * command line, no clock, no randomness — and, like `compile-structural.mjs` and
 * `compile-qualification.mjs`, no import that is not itself as pure as this one. The same function
 * runs identically in the CLI shell (`generate-resolution-declaration.mjs`) and in the Worker's
 * Gate-1 route (`worker/src/config.js`).
 *
 * @param {Record<string, string> | Map<string, string>} files path -> file contents. Recognised
 *   keys: `"schema.yaml"`, `"line_grammars.yaml"`, `"day_boundary.yaml"`, every `"views/<name>.yaml"`
 *   (including `"views/default_registration.yaml"`), `"vocabulary/markers.yaml"`, every other
 *   `"vocabulary/<name>.yaml"`, every `"patterns/<name>.yaml"` and every `"rules/<name>.yaml"`.
 *   Paths use `/` regardless of platform — this is a logical tree, not a filesystem one.
 * @param {Ledger} ledger
 * @returns {{declaration: object, dropped: object}}
 */
export function compile(files, ledger = new Ledger()) {
  const isMap = files instanceof Map;
  const has = (key) => (isMap ? files.has(key) : Object.prototype.hasOwnProperty.call(files, key));
  const get = (key) => (isMap ? files.get(key) : files[key]);
  const allKeys = () => (isMap ? [...files.keys()] : Object.keys(files));
  const readYaml = (key) => parseYamlSubset(get(key), key);

  // ── 1. views/*.yaml -> read once, shared by readRegistration's guard and readOrdering ─────────

  function readViewFiles() {
    const out = [];
    const viewKeys = allKeys().filter((k) => k.startsWith(VIEWS_PREFIX) && k.endsWith(".yaml")).sort();
    for (const key of viewKeys) {
      const file = key.slice(VIEWS_PREFIX.length);
      // NOT A DROP: default_registration.yaml is read separately, by readRegistration.
      if (file === "default_registration.yaml") continue;
      const document = readYaml(key);
      // DROP PATHS 4-6, AND THEY COST MORE HERE THAN ANYWHERE ELSE. See the domain header.
      if (!document || typeof document !== "object" || Array.isArray(document)) {
        ledger.drop(
          `views/${file}`,
          "the file did not parse into a mapping, so its ordering and its registration overrides " +
            "were neither published nor checked",
        );
        continue;
      }
      const entries = Object.entries(document);
      if (entries.length !== 1) {
        ledger.drop(
          `views/${file}`,
          `the file declares ${entries.length} top-level keys (${Object.keys(document).join(", ")}) ` +
            "and this generator reads a view sheet as exactly one; its ordering and its " +
            "registration overrides were neither published nor checked",
        );
        continue;
      }
      const [viewId, view] = entries[0];
      if (!view || typeof view !== "object" || !Array.isArray(view.sections)) {
        ledger.drop(
          `views/${file}`,
          `view '${viewId}' declares no 'sections:' list, so its ordering and its registration ` +
            "overrides were neither published nor checked",
        );
        continue;
      }
      // DROP PATHS 23-24. A key the operator's sheet declares that this generator has no read for
      // at all — the "silently ignores it" row of `ledger.mjs`'s own three-outcome table, which
      // every other declaration in this file already escaped. NOT a `GenerationError`: an unknown
      // key is not a malformed one, and the ledger's whole posture is that refusing is data while
      // only DISAGREEING with the committed data is an error. See `VIEW_SHEET_KEYS_PUBLISHED`'s
      // own header for the three states a key can be in and why a fourth is a defect.
      for (const key of Object.keys(view)) {
        // NOT A DROP: this is the KEEP branch — the key IS one of the three decided lists, so a
        // decision about it already exists and there is nothing unrecorded. (`viewId` is this
        // function's own addition to the object, never the operator's declaration.)
        if (key === "viewId" || VIEW_SHEET_KEYS_KNOWN.has(key)) continue;
        ledger.drop(
          `views/${file}`,
          `view '${viewId}' declares '${key}:' on the sheet — this generator has no read for that ` +
            "key, so whatever it says was published nowhere and refused nowhere",
        );
      }
      for (const [index, section] of view.sections.entries()) {
        // NOT A DROP: a non-mapping section is already recorded by DROP PATHs 7 and 22, which
        // name the same section for a cause that subsumes this one.
        if (!section || typeof section !== "object" || Array.isArray(section)) continue;
        const where = isNonEmptyString(section.id) ? `'${section.id}'` : `at index ${index}`;
        for (const key of Object.keys(section)) {
          // NOT A DROP: the KEEP branch again — see the sheet loop above, same reason.
          if (VIEW_SECTION_KEYS_KNOWN.has(key)) continue;
          ledger.drop(
            `views/${file}`,
            `section ${where} of view '${viewId}' declares '${key}:' — this generator has no read ` +
              "for that key, so whatever it says was published nowhere and refused nowhere",
          );
        }
      }
      out.push([file, { viewId, ...view }]);
    }
    return out;
  }

  // ── 2. default_registration.yaml -> the GLOBAL registration keys, and the two names for one key ─

  function readRegistration(viewFiles) {
    if (!has(DEFAULT_REGISTRATION_KEY)) {
      throw new GenerationError(`${DEFAULT_REGISTRATION_KEY} does not exist`);
    }
    const declared = readYaml(DEFAULT_REGISTRATION_KEY)?.default_registration;
    if (!declared || typeof declared !== "object") {
      throw new GenerationError(`${DEFAULT_REGISTRATION_KEY}: no 'default_registration:' mapping`);
    }
    const { default_node_type: defaultNodeType, input_grammar: inputGrammar, default_tags } = declared;
    if (!isNonEmptyString(defaultNodeType)) {
      throw new GenerationError(`${DEFAULT_REGISTRATION_KEY}: default_node_type is not a non-empty string`);
    }
    if (!isNonEmptyString(inputGrammar)) {
      throw new GenerationError(`${DEFAULT_REGISTRATION_KEY}: input_grammar is not a non-empty string`);
    }
    const defaultTags = default_tags === undefined || default_tags === null ? [] : default_tags;
    if (!Array.isArray(defaultTags) || !defaultTags.every((t) => typeof t === "string")) {
      throw new GenerationError(`${DEFAULT_REGISTRATION_KEY}: default_tags is not a list of strings`);
    }

    // resolution/registration.py's LEVELS_FOR grants INPUT_GRAMMAR and DEFAULT_TAGS three levels
    // (GLOBAL, VIEW, STRUCTURAL_NODE) — the same table DEFAULT_NODE_TYPE uses. Publishing a single
    // GLOBAL value for either is only correct while no sheet ever overrides it. Checked here, on
    // every compile, rather than assumed: a sheet that starts declaring `input_grammar:` or
    // `default_tags:` must fail this generator loudly, not silently keep shipping the stale GLOBAL
    // value.
    for (const [file, view] of viewFiles) {
      // NOT A DROP: default_registration.yaml IS the global declaration this guard compares against.
      if (file === "default_registration.yaml") continue;
      if ("input_grammar" in view) {
        throw new GenerationError(
          `${file}: declares 'input_grammar' — this generator publishes a single GLOBAL value and ` +
            "does not yet resolve the VIEW/STRUCTURAL_NODE levels registration.py's own table grants " +
            "this key; refusing to publish a stale GLOBAL answer for a view that overrides it.",
        );
      }
      if ("default_tags" in view) {
        throw new GenerationError(
          `${file}: declares 'default_tags' — same refusal as 'input_grammar' above, same reason.`,
        );
      }
      for (const section of Array.isArray(view.sections) ? view.sections : []) {
        // NOT A DROP: a non-mapping section cannot declare input_grammar or default_tags, so nothing is lost.
        if (!section || typeof section !== "object") continue;
        if ("input_grammar" in section || "default_tags" in section) {
          throw new GenerationError(
            `${file}: section '${section.id}' declares 'input_grammar' or 'default_tags' at the ` +
              "STRUCTURAL_NODE level — this generator does not resolve that level; refusing.",
          );
        }
      }
    }

    return {
      defaultNodeType,
      // BASE_NODE_TYPE — see the domain header for the full argument.
      baseNodeType: defaultNodeType,
      inputGrammar,
      defaultTags,
    };
  }

  // ── 3. line_grammars.yaml -> grammar name -> admitted shape names ─────────────────────────────

  function readLineGrammars() {
    if (!has(LINE_GRAMMARS_KEY)) throw new GenerationError(`${LINE_GRAMMARS_KEY} does not exist`);
    const grammars = readYaml(LINE_GRAMMARS_KEY)?.line_grammars?.grammars;
    if (!grammars || typeof grammars !== "object" || Array.isArray(grammars)) {
      throw new GenerationError(`${LINE_GRAMMARS_KEY}: no 'line_grammars.grammars' mapping`);
    }
    const out = {};
    for (const [name, shapes] of Object.entries(grammars)) {
      if (!Array.isArray(shapes) || !shapes.every((s) => typeof s === "string")) {
        throw new GenerationError(`${LINE_GRAMMARS_KEY}: grammars.${name} is not a list of shape names`);
      }
      out[name] = [...shapes];
    }
    if (Object.keys(out).length === 0) {
      throw new GenerationError(`${LINE_GRAMMARS_KEY}: 'grammars:' yielded no entries`);
    }
    return out;
  }

  // ── 4. day_boundary.yaml -> the three keys, verbatim ───────────────────────────────────────────

  function readDayBoundary() {
    if (!has(DAY_BOUNDARY_KEY)) throw new GenerationError(`${DAY_BOUNDARY_KEY} does not exist`);
    const declared = readYaml(DAY_BOUNDARY_KEY)?.day_boundary;
    if (!declared || typeof declared !== "object") {
      throw new GenerationError(`${DAY_BOUNDARY_KEY}: no 'day_boundary:' mapping`);
    }
    const { timezone, day_start_hour: dayStartHour, week_starts_on: weekStartsOn } = declared;
    if (!isNonEmptyString(timezone)) throw new GenerationError(`${DAY_BOUNDARY_KEY}: timezone is not a string`);
    if (!Number.isInteger(dayStartHour) || dayStartHour < 0 || dayStartHour > 23) {
      throw new GenerationError(`${DAY_BOUNDARY_KEY}: day_start_hour is not an integer 0..23`);
    }
    if (!isNonEmptyString(weekStartsOn)) {
      throw new GenerationError(`${DAY_BOUNDARY_KEY}: week_starts_on is not a string`);
    }
    return { timezone, dayStartHour, weekStartsOn };
  }

  // ── 4b. global_defaults.yaml -> default_ordering / priority_rank, or the engine's fallback ─────
  //
  // See this file's own domain header ("THE DEFAULT ORDERING") for the full account. NO FIELD NAME
  // drives any decision in this function — `default_ordering:`'s entries are read the identical way
  // a section's own `ordering:` is (`readOrderingFields` above), whatever fields the operator's
  // config happens to name. A missing `global_defaults.yaml`, or one present but silent on
  // `default_ordering:`, is "not declared" — the fallback branch — not an error: the GLOBAL layer is
  // opt-in everywhere else in this file (`defaults: {}` is the documented default in
  // `global_defaults.yaml` itself), and this key is no exception.
  function readGlobalDefaultOrdering() {
    const declared = has(GLOBAL_DEFAULTS_KEY) ? readYaml(GLOBAL_DEFAULTS_KEY) : undefined;
    const hasOwn = declared && typeof declared === "object" && !Array.isArray(declared)
      && Object.prototype.hasOwnProperty.call(declared, "default_ordering");
    if (!hasOwn) {
      return {
        ordering: ENGINE_LITERAL_DEFAULT_ORDERING,
        priorityRank: ENGINE_LITERAL_PRIORITY_RANK,
        source: "engine-fallback",
      };
    }
    const rawOrdering = declared.default_ordering;
    if (!Array.isArray(rawOrdering) || rawOrdering.length === 0) {
      throw new GenerationError(`${GLOBAL_DEFAULTS_KEY}: 'default_ordering:' is not a non-empty list`);
    }
    const ordering = rawOrdering.map((entry, i) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new GenerationError(`${GLOBAL_DEFAULTS_KEY}: default_ordering[${i}] is not a mapping`);
      }
      const { field, direction } = entry;
      if (!isNonEmptyString(field)) {
        throw new GenerationError(`${GLOBAL_DEFAULTS_KEY}: default_ordering[${i}].field is not a string`);
      }
      if (!DIRECTIONS.has(direction)) {
        throw new GenerationError(
          `${GLOBAL_DEFAULTS_KEY}: default_ordering[${i}].direction is '${direction}', not one of ` +
            `${[...DIRECTIONS].join("/")}`,
        );
      }
      return { field, direction };
    });

    let priorityRank = {};
    if (Object.prototype.hasOwnProperty.call(declared, "priority_rank")) {
      const rawRank = declared.priority_rank;
      if (!rawRank || typeof rawRank !== "object" || Array.isArray(rawRank)) {
        throw new GenerationError(`${GLOBAL_DEFAULTS_KEY}: 'priority_rank:' is not a mapping`);
      }
      priorityRank = {};
      for (const [name, rank] of Object.entries(rawRank)) {
        if (!Number.isInteger(rank) || rank < 1) {
          throw new GenerationError(`${GLOBAL_DEFAULTS_KEY}: priority_rank.${name} is not a positive integer`);
        }
        priorityRank[name] = rank;
      }
    }
    return { ordering, priorityRank, source: "config" };
  }

  // ── 4c. global_defaults.yaml -> composition.heads / composition.tail, or the engine's fallback ─
  //
  // Mirrors `readGlobalDefaultOrdering` immediately above — same file, same GLOBAL layer, same
  // visible-fallback discipline (absence is opt-out; a present-but-malformed declaration is a hard
  // `GenerationError`, never a silent guess). See this file's own domain header ("COMPOSITION") for
  // why this key exists at all and the monorepo PR that opened the asymmetry it closes. Unlike
  // `readGlobalDefaultOrdering`, the shape here is fixed rather than open — a cell class is drawn
  // from the SAME closed seven-member alphabet `ENGINE_LITERAL_COMPOSITION` already uses
  // (`COMPOSITION_HEAD_CELL_CLASSES`/`COMPOSITION_TAIL_CELL_CLASSES`, above), because composition
  // orders CLASSES OF CELL the engine itself defines, never an operator's own field or token name —
  // the same "no field name drives this" property `readGlobalDefaultOrdering` states for a
  // different reason (there, any field name is admitted; here, no field name is ever read at all).
  function readGlobalComposition() {
    const declared = has(GLOBAL_DEFAULTS_KEY) ? readYaml(GLOBAL_DEFAULTS_KEY) : undefined;
    const hasOwn = declared && typeof declared === "object" && !Array.isArray(declared)
      && Object.prototype.hasOwnProperty.call(declared, "composition");
    if (!hasOwn) {
      return {
        composition: ENGINE_LITERAL_COMPOSITION,
        source: "engine-fallback",
        formSource: "engine-fallback",
      };
    }
    const raw = declared.composition;
    return readCompositionShape(raw, GLOBAL_DEFAULTS_KEY);
  }

  /** THE `composition:` SHAPE, VALIDATED ONCE, FOR EVERY RUNG THAT MAY DECLARE IT.
   *
   * Extracted 2026-08-14 when the VIEW rung arrived. The alternative was a second copy of a
   * seven-class cell-class check inside `readViewComposition`, and two copies of a vocabulary
   * two rungs must both admit is a guaranteed drift — the engine made exactly this call in the
   * same week (`bundle/validators/composition.py`, monorepo #111, moved out of `loader.py` for
   * the identical reason). `where` names the rung in every diagnostic so the message points at
   * the file the operator edited.
   *
   * ABSENCE IS THE CALLER'S CONCERN at both rungs: a raw that never reaches here is opt-out; a
   * PRESENT but malformed one is a hard `GenerationError`, never a silent fallback.
   */
  function readCompositionShape(raw, where) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new GenerationError(`${where}: 'composition:' is not a mapping`);
      }
      const unknownTop = Object.keys(raw).filter((k) => !COMPOSITION_TOP_KEYS.has(k));
      if (unknownTop.length > 0) {
        throw new GenerationError(
          `${where}: 'composition:' has unknown key(s) ${JSON.stringify(unknownTop)} ` +
            `(known: ${[...COMPOSITION_TOP_KEYS].sort().join(", ")})`,
        );
      }
      const rawHeads = raw.heads;
      if (!rawHeads || typeof rawHeads !== "object" || Array.isArray(rawHeads) || Object.keys(rawHeads).length === 0) {
        throw new GenerationError(`${where}: 'composition.heads:' is not a non-empty mapping`);
      }
      const missingShapes = COMPOSITION_REQUIRED_HEAD_SHAPES.filter(
        (shape) => !Object.prototype.hasOwnProperty.call(rawHeads, shape),
      );
      if (missingShapes.length > 0) {
        throw new GenerationError(
          `${where}: 'composition.heads:' is missing required shape(s) ` +
            `${JSON.stringify(missingShapes)}`,
        );
      }
      const heads = {};
      for (const [shape, cells] of Object.entries(rawHeads)) {
        if (!Array.isArray(cells) || cells.length === 0 || !cells.every((c) => typeof c === "string")) {
          throw new GenerationError(
            `${where}: 'composition.heads.${shape}:' is not a non-empty list of strings`,
          );
        }
        const unknown = cells.filter((c) => !COMPOSITION_HEAD_CELL_CLASSES.has(c));
        if (unknown.length > 0) {
          throw new GenerationError(
            `${where}: 'composition.heads.${shape}:' names unknown cell class(es) ` +
              `${JSON.stringify(unknown)} (known: ${[...COMPOSITION_HEAD_CELL_CLASSES].sort().join(", ")})`,
          );
        }
        heads[shape] = [...cells];
      }
      const rawTail = raw.tail;
      if (!Array.isArray(rawTail) || rawTail.length === 0 || !rawTail.every((c) => typeof c === "string")) {
        throw new GenerationError(`${where}: 'composition.tail:' is not a non-empty list of strings`);
      }
      const unknownTail = rawTail.filter((c) => !COMPOSITION_TAIL_CELL_CLASSES.has(c));
      if (unknownTail.length > 0) {
        throw new GenerationError(
          `${where}: 'composition.tail:' names unknown cell class(es) ` +
            `${JSON.stringify(unknownTail)} (known: ${[...COMPOSITION_TAIL_CELL_CLASSES].sort().join(", ")})`,
        );
      }
      // `separator` is not a declared key on either side of this pair — see the domain header's own
      // paragraph on why: the engine always joins with `" "` (renderer.py:1003), unchanged by the
      // monorepo PR that made heads/tail declarable, so this generator always publishes it too.
      const { bullet, titleStyles } = readCompositionForm(raw.form);
      return {
        composition: { heads, tail: [...rawTail], separator: " ", bullet, titleStyles },
        source: "config",
        // The form is optional INSIDE an optional block, so it carries its own answer — see
        // `compositionFormSource`'s own paragraph at the assembly below.
        formSource: raw.form === undefined ? "engine-fallback" : "config",
      };
    }

  // ── 4d. views/*.yaml -> per-sheet `composition:`, the VIEW rung ────────────────────────────
  //
  // THE RUNG THE ENGINE OPENED AND THIS FILE HAD NOT DECIDED ABOUT. Until monorepo #111,
  // `composition:` was declarable at GLOBAL and nowhere else, and `tests/view-key-agreement.
  // test.mjs` went RED the moment the engine's `_ALLOWED_SHEET_KEYS` admitted it on a sheet —
  // which is exactly what that gate exists to do. This closes it in the direction the gate
  // asked for: publish the slot, now that a config can actually fill it.
  //
  // ABSENCE IS OPT-OUT AND STAYS SILENT. A sheet that declares no `composition:` contributes
  // NO ENTRY to the published map — not an empty one — so a reader falls through to the global
  // answer exactly as it did before this rung existed. That is why the map is keyed by view and
  // not pre-filled: an entry means "this sheet decided", and its absence means "ask below".
  //
  // SAME VALIDATION AS THE RUNG ABOVE, deliberately: both call `readCompositionShape`, so a
  // view-level declaration is admitted on exactly the terms a global one is and neither rung can
  // quietly widen the cell-class vocabulary the other enforces.
  function readViewComposition(viewFiles) {
    const out = {};
    for (const [file, view] of viewFiles) {
      if (!Object.prototype.hasOwnProperty.call(view, "composition")) continue; // NOT A DROP: silent sheet, see above.
      const { composition, formSource } = readCompositionShape(view.composition, `views/${file}`);
      out[view.viewId] = { ...composition, formSource };
    }
    return out;
  }

  /** `composition.form:` — see `ENGINE_LITERAL_COMPOSITION`'s own header for the two capabilities
   * this admits. `undefined` (no `form:` key at all) is legitimate — a root may order cells
   * without wrapping anything — and answers the engine's own literal for each, exactly the
   * `heads`/`tail` absence-is-opt-out convention `readGlobalComposition` already follows. */
  function readCompositionForm(raw) {
    if (raw === undefined) {
      return { bullet: ENGINE_LITERAL_COMPOSITION.bullet, titleStyles: ENGINE_LITERAL_COMPOSITION.titleStyles };
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new GenerationError(`${GLOBAL_DEFAULTS_KEY}: 'composition.form:' is not a mapping`);
    }
    const unknown = Object.keys(raw).filter((k) => !COMPOSITION_FORM_KEYS.has(k));
    if (unknown.length > 0) {
      throw new GenerationError(
        `${GLOBAL_DEFAULTS_KEY}: 'composition.form:' has unknown key(s) ${JSON.stringify(unknown)} ` +
          `(known: ${[...COMPOSITION_FORM_KEYS].sort().join(", ")})`,
      );
    }
    let bullet = ENGINE_LITERAL_COMPOSITION.bullet;
    if ("bullet" in raw) {
      if (typeof raw.bullet !== "string" || !COMPOSITION_BULLET_CHARS.has(raw.bullet)) {
        throw new GenerationError(
          `${GLOBAL_DEFAULTS_KEY}: 'composition.form.bullet:' is ${JSON.stringify(raw.bullet)}, ` +
            `not one of ${[...COMPOSITION_BULLET_CHARS].sort().join(", ")}`,
        );
      }
      bullet = raw.bullet;
    }
    let titleStyles = ENGINE_LITERAL_COMPOSITION.titleStyles;
    if ("title_styles" in raw) {
      const rawStyles = raw.title_styles;
      if (!Array.isArray(rawStyles) || rawStyles.length === 0 || !rawStyles.every((s) => typeof s === "string")) {
        throw new GenerationError(
          `${GLOBAL_DEFAULTS_KEY}: 'composition.form.title_styles:' is not a non-empty list of strings`,
        );
      }
      const unknownStyles = rawStyles.filter((s) => !COMPOSITION_TITLE_STYLE_VOCABULARY.has(s));
      if (unknownStyles.length > 0) {
        throw new GenerationError(
          `${GLOBAL_DEFAULTS_KEY}: 'composition.form.title_styles:' names unknown style(s) ` +
            `${JSON.stringify(unknownStyles)} (known: ${[...COMPOSITION_TITLE_STYLE_VOCABULARY].sort().join(", ")})`,
        );
      }
      if (new Set(rawStyles).size !== rawStyles.length) {
        throw new GenerationError(
          `${GLOBAL_DEFAULTS_KEY}: 'composition.form.title_styles:' repeats a style`,
        );
      }
      titleStyles = [...rawStyles];
    }
    return { bullet, titleStyles };
  }

  // ── 5. schema.yaml -> node type -> chrome shape, for every node type a node CAN BE ─────────────
  //
  // ── THE CANDIDATE SET ANSWERS "WHAT CAN A NODE BE", NOT "WHAT CAN YOU MINT" (widened 2026-08-14)
  //
  // This table used to be keyed by `collectDefaultNodeTypeCandidates` — the types some view names
  // as a `default_node_type`. That is the set of types you can type INTO EXISTENCE, and it is the
  // right answer to the question `newline.ts` asks (what chrome does a line I am about to mint get
  // — see its GLOBAL rung, which looks the shape up by a section's own minting default).
  //
  // It is the WRONG answer for the question a composer asks, which is: this node exists, in this
  // section, with this type — how does the engine print it? A node's type is not fixed at the
  // moment it is minted. A RULE can change it afterwards, and the operator's config declares
  // exactly that: `rules/auto_outcome_classification.yaml`'s
  // `task-with-open-part-of-child-becomes-outcome` fires `verb: set_node_type` and turns a `task`
  // into an `outcome`. Neither `outcome` nor `habit` is any view's `default_node_type`, so neither
  // was published — and both are declared in schema.yaml with `render: {shape: checkbox}`. The
  // browser could not print the result of the operator's own rule.
  //
  // ── WHY schema.yaml's OWN KEYS, AND NOT A WIDER OR NARROWER SET ──
  //
  // `schema.yaml`'s `node_types:` IS the closed set of what a node can be — this function already
  // treated it as the authority (its refusal below says so in as many words: "refusing to publish
  // a shape for a type that does not exist"). Only the QUESTION changed; the authority did not.
  // Nothing wider exists to draw from. Nothing narrower is correct, because any narrower set is a
  // claim that some declared type can never reach a rendered line, and no such claim is available
  // from the config: a rule may retype into any declared type, and this generator does not read
  // the graph the rules traverse (see DROP PATH 17's own reason).
  //
  // IT CANNOT CHANGE WHAT ANY EXISTING READER DOES, and that is checkable rather than hoped: every
  // lookup into this table today is keyed by a MINTING default (`newline.ts:420` reads
  // `sections[...].nodeType ?? sectionRegistration[...].nodeType`, both of which are the same
  // `default_node_type` set this table used to be built from). The widening adds entries those
  // lookups never reach. `tests/present-resolution.test.mjs` pins that separately.
  //
  // THE REFUSAL IS KEPT AND IS NOW ITS OWN STATEMENT. It used to fire as a side effect of
  // iterating the minting set: a `default_node_type` naming a type schema.yaml does not declare
  // was reached, found missing, and thrown on. Iterating schema.yaml's own keys would make that
  // unreachable — every candidate would come from the authority being checked against — so the
  // check moves ABOVE the loop, where it says what it means and cannot be lost to a later change
  // of candidate set.

  // ── 5b. schema.yaml -> node type -> HOW IT IS IDENTIFIED, which decides the stamp cell ────────
  //
  // `composition.tail` names `stamp` — the `[[qntm:N]]` cell. Whether a node gets one is not a
  // property of the line, it is a property of the TYPE: `decide_stamp` (renderer.py:1224-1237) asks
  // `identity_spec(graph, node.type)` and returns `""` when that type declares
  // `identity: {unique: true}`. Seven of the operator's 36 types do — header, explainer, capability,
  // principle, package, class, sink — and until now nothing told the browser which.
  //
  // ── NO PIN IS NEEDED HERE, AND THE DIFFERENCE FROM `renderCheckbox` IS THE WHOLE REASON ──
  //
  // `renderCheckbox` is a hand-written literal mirroring a contract in the ENGINE'S OWN SOURCE, so
  // it is a copy, and a copy needs something checking it — hence `render_checkbox_pin()`.
  // `identity_spec` reads `graph.raw_schema`, which IS `schema.yaml`: the same file, the same
  // `node_types:` mapping, the same bytes this function is already reading two rungs up for
  // `chromeShapes`. There is no second home to drift from. `resolution-agreement.py` still compares
  // the two readings, because "the same file" is a claim worth checking rather than assuming.
  //
  // ── BOTH HALVES, BECAUSE HALF A DECISION IS THE FAILURE THIS FILE KEEPS PAYING FOR ──
  //
  // `identity_spec` returns `(field, unique)` and `decide_stamp` uses only `unique`. `field` is
  // published anyway: it is what a stampless node is re-identified BY. `applier.py`'s
  // `_unique_identity_node_survives_by_title` matches on that field's value, because "a structural
  // node's real identity is its unique NAME, not its stamp". A reader given `unique` alone knows to
  // omit the stamp and does not know what carries the identity instead — which is exactly the shape
  // of publishing `renderCheckbox`'s rows without its `fallback`.
  //
  // ── EVERY DECLARED TYPE, SO ABSENCE MEANS "NOT A TYPE" AND NEVER "NOT UNIQUE" ──
  //
  // Keyed over `schema.yaml`'s own `node_types:` — the same total-function posture `chromeShapes`
  // took on 2026-08-14 — rather than only the seven that declare an identity block. A sparse map
  // makes "this type is ordinary" and "I have never heard of this type" the same lookup, and they
  // are opposite instructions: the first says stamp it, the second says refuse to compose it.
  function readIdentityModes() {
    if (!has(SCHEMA_KEY)) throw new GenerationError(`${SCHEMA_KEY} does not exist`);
    const nodeTypes = readYaml(SCHEMA_KEY)?.node_types;
    if (!nodeTypes || typeof nodeTypes !== "object" || Array.isArray(nodeTypes)) {
      throw new GenerationError(`${SCHEMA_KEY}: no 'node_types:' mapping`);
    }
    const out = {};
    for (const name of Object.keys(nodeTypes).sort()) {
      const definition = nodeTypes[name];
      const identity =
        definition && typeof definition === "object" && definition.identity && typeof definition.identity === "object"
          ? definition.identity
          : {};
      // `bool(identity.get("unique"))` and `identity.get("field")` — `identity_spec`'s own two
      // lines, mirrored rather than reinterpreted. A type with no `identity:` block answers
      // `(null, false)`, which is the engine's "mint fresh, stamp it" pathway.
      const unique = identity.unique === true;
      const field = isNonEmptyString(identity.field) ? identity.field : null;
      out[name] = { unique, field };
    }
    return out;
  }

  // ── 5c. schema.yaml + vocabulary -> the CONTINUATION LINES a node type re-emits ────────────────
  //
  // A node type may declare `render: {continuation_fields: [...]}` — its OWN fields that render as
  // extra INDENTED lines beneath the node's own line, never separate nodes. `_render_node_line`
  // builds each as:
  //
  //     `{'    ' * (depth + 1)}{bullet} {value} {tag}`
  //
  // one indent level deeper than the node line, the same bullet, the field's value, and a trailing
  // BARE TAG. Nine of the operator's types declare them: ticket/book/writer/blog carry `link` or
  // `summary`, and capability/principle/package/class/sink carry `summary`.
  //
  // ── BOTH HALVES ARE CONFIG, WHICH IS WHY THIS NEEDS NO PIN ──
  //
  // The FIELD NAMES come from `schema.yaml`'s `render.continuation_fields` — the same file, the
  // same `node_types:` mapping, that `chromeShapes` and `identityModes` already read. The TRAILING
  // TAG comes from `StructuralTokenResolver.field_binding_token_for(field)`, which resolves from
  // `vocabulary/structural_tokens.yaml`'s `field_bindings:` — a file this generator already walks
  // for `spelling`. Neither half is engine source, so there is no copy to drift and nothing to pin.
  //
  // The tag matters as much as the value: `view-render-language-is-ingest-language` — a rendered
  // continuation line must be its own valid re-ingest input, or the next cycle reads it as an
  // untagged line and mints a stray PART_OF child. Publishing the value without the tag would let a
  // composer write a line the engine then turns into a node.
  //
  // ── AMBIGUITY RESOLVES TO NOTHING, MIRRORING THE ENGINE RATHER THAN IMPROVING ON IT ──
  //
  // `field_binding_token_for` ends `return matches[0] if len(matches) == 1 else None` — two tokens
  // bound to one field is not a choice it makes. `_render_node_line` then emits the line with NO
  // trailing tag at all (the `if tag` guard). Mirrored exactly: `token: null` is published, and the
  // drop is recorded so the absence is a stated answer rather than a silence.

  function readContinuationFields(ledger) {
    if (!has(SCHEMA_KEY)) throw new GenerationError(`${SCHEMA_KEY} does not exist`);
    const nodeTypes = readYaml(SCHEMA_KEY)?.node_types;
    if (!nodeTypes || typeof nodeTypes !== "object" || Array.isArray(nodeTypes)) {
      throw new GenerationError(`${SCHEMA_KEY}: no 'node_types:' mapping`);
    }
    // field -> the bare tag that renders it, from vocabulary/structural_tokens.yaml. Assembled
    // first so the ambiguity rule can be applied once rather than per node type.
    const bindingsByField = {};
    // NOT A DROP, for every skip in this vocabulary walk. This loop is looking for ONE optional
    // key (`field_bindings:`) inside a file it does not own — `readSpelling` above is the reader
    // that answers for these files, and it records its own drops for every malformed shape it
    // meets. A second reader over the same bytes recording the same failures again would double
    // every entry in the ledger and make one broken file look like two. Nothing is discarded here
    // that is not already accounted for there; what this loop cannot find, it reports as the
    // continuation field's own `token: null` drop below, which names the field rather than the file.
    for (const key of allKeys().filter((k) => k.startsWith(VOCABULARY_PREFIX) && k.endsWith(".yaml")).sort()) {
      const document = readYaml(key);
      if (!document || typeof document !== "object" || Array.isArray(document)) continue;
      // `field_bindings:` sits on a token ENTRY'S PAYLOAD, not on the family — the real shape is
      // `structural_tokens: [ { token: ..., structural_token: { field_bindings: [...] } } ]`. The
      // first draft read `family.field_bindings` and found nothing, which published a `token: null`
      // for all nine types and looked exactly like "the operator declared no bindings". Every
      // payload is searched rather than one key path being assumed, so a binding declared under a
      // differently-named payload key is still found.
      // NOT A DROP — every skip in this nested walk, for the reason stated above the loop:
      // `readSpelling` owns these files and records their malformed shapes; this pass is only
      // looking for one optional key inside them, and re-recording the same failure would double
      // the ledger. A field binding this walk cannot find surfaces as that continuation field's own
      // `token: null` drop, which names the field rather than the file.
      for (const family of Object.values(document)) {
        if (!Array.isArray(family)) continue;
        for (const entry of family) {
          if (!entry || typeof entry !== "object") continue;
          for (const payload of Object.values(entry)) {
            if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
            const declared = payload.field_bindings;
            if (!Array.isArray(declared)) continue;
            for (const binding of declared) {
              // NOT A DROP: a malformed binding row declares no (token, field) pair, so there is
              // no spelling to discard. Its consequence IS recorded, one level up and in the
              // caller's own terms — the continuation field it would have named publishes
              // `token: null` with a reason, which is the fact a composer needs.
              if (!binding || typeof binding !== "object") continue;
              if (!isNonEmptyString(binding.token) || !isNonEmptyString(binding.field)) continue;
              (bindingsByField[binding.field] ??= []).push(binding.token);
            }
          }
        }
      }
    }

    const out = {};
    for (const name of Object.keys(nodeTypes).sort()) {
      const definition = nodeTypes[name];
      const render = definition && typeof definition === "object" ? definition.render : undefined;
      const declared = render && typeof render === "object" ? render.continuation_fields : undefined;
      // NOT A DROP: a node type that declares no `continuation_fields` emits no continuation line,
      // which is the overwhelming majority (27 of the operator's 36) and is not a discarded
      // declaration — there is nothing to publish and nothing was lost. Absence in the published
      // map carries exactly this meaning; see the key's own header for why it is unambiguous here
      // and had to be closed for `chromeShapes`.
      if (!Array.isArray(declared) || declared.length === 0) continue;
      const fields = [];
      for (const field of declared) {
        if (!isNonEmptyString(field)) {
          ledger.drop(
            `node type '${name}' continuation field`,
            `its 'render.continuation_fields' names ${JSON.stringify(field)}, which is not a field ` +
              "name, so no continuation line can be composed for it",
          );
          continue;
        }
        const tokens = bindingsByField[field] ?? [];
        // ONE BINDING OR NONE — `field_binding_token_for`'s own rule, mirrored. Two tokens bound to
        // one field is not a pick this generator makes either.
        const token = tokens.length === 1 ? tokens[0] : null;
        if (tokens.length > 1) {
          ledger.drop(
            `node type '${name}' continuation field '${field}'`,
            `${tokens.length} vocabulary tokens bind that field (${tokens.join(", ")}), and the ` +
              "engine's own reverse lookup refuses an ambiguous one, so the continuation line " +
              "renders with no trailing tag — published with token null rather than a guess",
          );
        } else if (tokens.length === 0) {
          ledger.drop(
            `node type '${name}' continuation field '${field}'`,
            "no vocabulary token binds that field, so the continuation line renders with no " +
              "trailing tag and would not re-ingest as a field write",
          );
        }
        fields.push({ field, token });
      }
      if (fields.length > 0) out[name] = fields;
    }
    return out;
  }

  function readChromeShapes(mintable, ledger) {
    if (!has(SCHEMA_KEY)) throw new GenerationError(`${SCHEMA_KEY} does not exist`);
    const schema = readYaml(SCHEMA_KEY);
    const nodeTypes = schema?.node_types;
    if (!nodeTypes || typeof nodeTypes !== "object" || Array.isArray(nodeTypes)) {
      throw new GenerationError(`${SCHEMA_KEY}: no 'node_types:' mapping`);
    }
    // THE PRESERVED REFUSAL — a view mints a type that does not exist. Unchanged in meaning and in
    // message; moved here so it is asserted rather than incidental.
    for (const name of mintable) {
      const definition = nodeTypes[name];
      if (!definition || typeof definition !== "object") {
        throw new GenerationError(
          `${SCHEMA_KEY}: node type '${name}' is declared as a default_node_type somewhere in views/ ` +
            "but is not declared in schema.yaml — refusing to publish a shape for a type that does " +
            "not exist.",
        );
      }
    }
    const out = {};
    for (const name of Object.keys(nodeTypes).sort()) {
      const definition = nodeTypes[name];
      // NOT A DROP: a `node_types:` entry that is not a mapping declares no render block, so it
      // takes the same documented default a mapping with no `render:` takes. It is only a hard
      // refusal when a VIEW claims to mint it, which the loop above already answered.
      // No 'render:' block renders as checkbox — schema.yaml's own documented default, and the same
      // rule qntm_md.grammar.node_type_form.node_type_forms encodes on the engine side.
      const render = definition && typeof definition === "object" ? definition.render : undefined;
      const shape = render && typeof render === "object" && typeof render.shape === "string"
        ? render.shape
        : "checkbox";
      if (SEEDABLE_SHAPES.has(shape)) {
        out[name] = shape;
        // NOT A DROP: this is the KEEP branch.
        continue;
      }
      // DROP PATH 8. A shape this generator does not recognise (stat_line, heading, or a future
      // addition) is left unpublished ON PURPOSE — see the domain header. The reason now names
      // BOTH consequences, because the table now serves both readers: a line minted under a view
      // defaulting to this type gets no chrome, AND a composer handed a node of this type cannot
      // open its line.
      ledger.drop(
        `node type '${name}'`,
        `schema.yaml declares its render shape as '${shape}', which is not one this app knows how ` +
          `to draw (${[...SEEDABLE_SHAPES].sort().join(", ")}), so a new line under a view ` +
          "defaulting to it gets no chrome and a node of this type cannot have its line composed",
      );
    }
    return out;
  }

  // ── 6. vocabulary/markers.yaml -> ordering field name -> how its value is spelled ──────────────
  //
  // TWO MARKER SHAPES, NOT ONE. `due_date`/`available_date`/`queue_position` are TRAILING-TOKEN
  // markers (`extraction_hint:`, this generator's original shape: a glyph followed by a value that
  // varies line to line). `priority` — needed once the default ordering's own fields widen the
  // candidate set below — is a FIXED-`value:` (value-match) marker instead: `markers.yaml`'s
  // `🔽`/`⏫` rows each spell ONE literal value, and unlike a trailing marker, MORE THAN ONE token
  // legitimately owning the SAME field is the NORMAL shape for an enum (every value needs its own
  // glyph), not DROP PATH 12's collision. Published as `{ kind: "enum", values: { token: value } }`
  // — `app/present/ordering.ts` reads it by scanning a line for ANY of `values`' own keys, never by
  // treating "enum" as a fourth cousin of `date`/`int`/`float`'s single-glyph shape.

  function readOrderingFieldMarkers(fields, ledger) {
    if (fields.size === 0) return {};
    if (!has(MARKERS_KEY)) throw new GenerationError(`${MARKERS_KEY} does not exist`);
    const markers = readYaml(MARKERS_KEY)?.markers;
    if (!Array.isArray(markers)) {
      throw new GenerationError(`${MARKERS_KEY}: no 'markers:' list`);
    }
    const out = {};
    // A field once claimed by a TRAILING marker (kind date/int/float) — an enum row arriving later
    // for the SAME field is a real conflict (one field, two irreconcilable reading strategies), not
    // a second value the way two enum rows for one field are.
    const trailingOwner = new Set();
    // Field -> { token: value }, assembled separately from `out` so a LATER trailing-marker row for
    // a field already claimed by an enum row can still be detected as a conflict (see below).
    const enumValues = {};
    for (const entry of markers) {
      // NOT A DROP: a non-mapping marker declares no field. If it was the only marker for a named ordering field, DROP PATH 13 below records that field as unmarked.
      if (!entry || typeof entry !== "object") continue;
      const { token, field, extraction_hint: hint, value, render_only: renderOnly } = entry;
      // NOT A DROP: this table is restricted to the fields the operator's own ordering declares
      // plus the engine's own default-ordering fields; a marker outside that set was never a candidate.
      if (typeof field !== "string" || !fields.has(field)) continue;
      const what = `ordering field '${field}'`;

      // ── THE ENUM BRANCH — a fixed `value:` row (markers.yaml's OTHER shape), never a trailing
      // token. Checked FIRST, on `value !== undefined`, because a value-match row carries no
      // `extraction_hint` at all — falling through to the trailing branch would read `hint` as
      // `undefined` and mis-file it as DROP PATH 10 rather than what it actually is.
      if (value !== undefined) {
        if (renderOnly === true) {
          ledger.drop(
            what,
            `its marker '${token}' is 'render_only: true' — the engine never ingests a value from ` +
              "that glyph, so no ordering preview can be offered for this field",
          );
          continue;
        }
        if (!isNonEmptyString(token)) {
          ledger.drop(what, "its marker declares no 'token:' string, so there is no glyph to find on a line");
          continue;
        }
        if (trailingOwner.has(field)) {
          ledger.drop(
            what,
            `its marker '${token}' declares a fixed 'value:', but another marker already claimed ` +
              "this field with a trailing extraction_hint — a field cannot be read both ways at " +
              "once, so neither is published",
          );
          continue;
        }
        if (!isScalar(value) || value === null) {
          ledger.drop(what, `its marker '${token}' declares 'value:' ${JSON.stringify(value)}, not a scalar`);
          continue;
        }
        const values = enumValues[field] ?? (enumValues[field] = {});
        const spelled = String(value);
        if (values[token] !== undefined && values[token] !== spelled) {
          ledger.drop(
            what,
            `its marker '${token}' redeclares field '${field}' with a different value ` +
              `(${JSON.stringify(values[token])} vs ${JSON.stringify(spelled)}); the first one read wins`,
          );
          continue;
        }
        values[token] = spelled;
        continue;
      }

      // The trailing-marker twin of the enum conflict just above: an extraction_hint row arriving
      // for a field an enum row already claimed.
      if (field in enumValues) {
        ledger.drop(
          what,
          `its marker '${token}' declares an extraction_hint, but another marker already claimed ` +
            "this field with a fixed 'value:' — a field cannot be read both ways at once, so " +
            "neither is published",
        );
        continue;
      }

      // DROP PATH 9. Documented, deliberate — and until now unrecorded.
      if (renderOnly === true) {
        ledger.drop(
          what,
          `its marker '${token}' is 'render_only: true' — the engine never ingests a value from ` +
            "that glyph, so no ordering preview can be offered for this field",
        );
        continue;
      }
      // DROP PATH 10 — THE EXACT TWIN OF THE ONE §9.3 NAMES, in a different generator.
      const kind = EXTRACTION_KINDS[hint];
      if (kind === undefined) {
        ledger.drop(
          what,
          `its marker '${token}' declares extraction_hint ${JSON.stringify(hint ?? null)}, which ` +
            `is not one this app can read a value from (${Object.keys(EXTRACTION_KINDS).sort().join(", ")})`,
        );
        continue;
      }
      // DROP PATH 11. A marker with no token to look for on the line.
      if (!isNonEmptyString(token)) {
        ledger.drop(what, "its marker declares no 'token:' string, so there is no glyph to find on a line");
        continue;
      }
      // DROP PATH 12. Two TRAILING markers for one ordering field: the later one silently won.
      if (out[field] !== undefined) {
        ledger.drop(
          what,
          `two markers claim it ('${out[field].token}' and '${token}'); the last one read wins and ` +
            "the other is not published",
        );
      }
      trailingOwner.add(field);
      out[field] = { token, kind };
    }
    for (const [field, values] of Object.entries(enumValues)) {
      out[field] = { kind: "enum", values };
    }
    // DROP PATH 13. A field the ordering table NAMES and this loop found no marker for at all.
    for (const field of fields) {
      if (out[field] === undefined && ledger.toJSON()[`ordering field '${field}'`] === undefined) {
        ledger.drop(
          `ordering field '${field}'`,
          "named by a section's 'ordering:' and/or the engine's own default ordering, but " +
            "vocabulary/markers.yaml declares no marker for it at all, so nothing can read its " +
            "value off a line",
        );
      }
    }
    return out;
  }

  // ── 7. schema.yaml -> field_types.<f>.default ───────────────────────────────────────────────

  /**
   * NOT A DROP when the mapping is absent — see the domain header. No `has()` guard here, matching
   * the original: by the time this runs, `readChromeShapes` above has already required
   * `schema.yaml` to exist, in the SAME call order this function preserves.
   */
  function readFieldDefaults() {
    const schema = readYaml(SCHEMA_KEY);
    const fieldTypes = schema?.field_types;
    if (!fieldTypes || typeof fieldTypes !== "object" || Array.isArray(fieldTypes)) return {};
    const out = {};
    for (const [field, definition] of Object.entries(fieldTypes)) {
      if (definition && typeof definition === "object" && isScalar(definition.default)) {
        if (definition.default !== null) out[field] = definition.default;
      }
    }
    return out;
  }

  // ── 8. vocabulary/*.yaml -> the vocabulary, read in the RENDER direction ───────────────────────
  //
  // ── AND, SINCE 2026-08-14, PUBLISHED RATHER THAN ONLY CONSUMED ──
  //
  // This reader has always read the vocabulary in the render direction. Its answers were spent
  // entirely inside `seedTokens` — which tags a NEW line gets — and then discarded. The only trace
  // that reached the browser was `sectionRegistration[view][section].tokens`, a per-section array
  // baked for that section's own MINTING default. Nothing published the mapping itself.
  //
  // That is the whole of "the output side has no home", and it is larger than the two `render_only`
  // glyphs that made it visible. Measured against the operator's config: 33 node types have a type
  // tag, 17 fields have a fixed-value tag table, and 7 fields have a trailing-value marker. Of
  // those 24 field tables, FOUR reach the browser — via `orderingFields`, which exists to preview
  // an ordering and is restricted to the fields an ordering names. A composer asked to print
  // `✅ 2026-08-14` or `⛔` had nowhere to look it up.
  //
  // ── THE INGEST DROP IS NOT WEAKENED, AND THE TWO TABLES ARE BUILT SIDE BY SIDE ──
  //
  // DROP PATH 16 stays exactly where it is, with its reason unchanged, and `fieldTokens` — the SEED
  // table — still refuses a `render_only` glyph. Seeding one into a line the operator types would
  // write a value the engine never reads back, and that refusal is correct.
  //
  // `rendered` is a SECOND, separate structure, filled from the same pass, which the seed path
  // never reads. A `render_only` token belongs in it precisely BECAUSE it is output-only: printing
  // one is what the engine does. So the same fact — "the engine emits this glyph and never ingests
  // it" — excludes the token from one table and qualifies it for the other, and both statements are
  // now written down instead of one being inferred from the other's absence.
  //
  // `renderOnly` IS CARRIED ON THE PUBLISHED ENTRY rather than filtered out of it, because a
  // composer and a round-trip checker need opposite things from the same row: one prints the glyph,
  // the other must know the engine will not read it back. Dropping the flag would force the second
  // caller to re-derive it from `orderingFields`' absence, which is exactly the inference this
  // change exists to remove.

  function readSpelling(ledger) {
    const typeTokens = {};
    const fieldOrder = [];
    const fieldTokens = {};
    // The output-side twin of `fieldTokens`/`typeTokens`. Never consulted by `seedTokens`.
    const rendered = { typeTokens: {}, edgeTags: {}, fieldTags: {}, fieldMarkerValues: {}, fieldMarkers: {} };
    const vocabularyKeys = allKeys().filter((k) => k.startsWith(VOCABULARY_PREFIX) && k.endsWith(".yaml")).sort();
    for (const key of vocabularyKeys) {
      const file = key.slice(VOCABULARY_PREFIX.length);
      const document = readYaml(key);
      // DROP PATH 14. A whole vocabulary file, and every spelling in it.
      if (!document || typeof document !== "object" || Array.isArray(document)) {
        ledger.drop(
          `vocabulary/${file}`,
          "the file did not parse into a mapping of family -> token list, so no field it spells " +
            "can be seeded into a new line",
        );
        continue;
      }
      for (const [familyName, family] of Object.entries(document)) {
        // DROP PATH 15. A family declared as something other than a list of entries.
        if (!Array.isArray(family)) {
          ledger.drop(
            `vocabulary/${file}#${familyName}`,
            `the '${familyName}:' family is not a list of token entries, so no field it spells can ` +
              "be seeded into a new line",
          );
          continue;
        }
        for (const entry of family) {
          if (!entry || typeof entry !== "object" || !isNonEmptyString(entry.token)) continue;
          if (isNonEmptyString(entry.node_type)) {
            if (typeTokens[entry.node_type] === undefined) typeTokens[entry.node_type] = entry.token;
            // FIRST DECLARATION WINS, the same rule as the seed table above and for the same
            // reason — a second glyph for one type is a config the engine reads first-wins too.
            if (rendered.typeTokens[entry.node_type] === undefined) {
              rendered.typeTokens[entry.node_type] = entry.token;
            }
            // NOT A DROP: a `node_type:` entry is KEPT, by both tables, on the two statements
            // directly above. A later entry for a type already spelled is not discarded either —
            // first-declaration-wins is the engine's own rule, so the second glyph was never an
            // answer this generator could publish instead.
            continue;
          }
          // ── THE THIRD KIND OF VOCABULARY ENTRY, AND THE GAP THAT LET A CELL GO UNFILLED ──
          //
          // `vocabulary/edge_tags.yaml` declares `{token, edge_type, cardinality}` — the tag the
          // engine prints for an OUTGOING edge. `_outgoing_edge_chrome_cells` emits
          // `#<tag> [[<target title>]]` for every outgoing edge whose type is chrome-eligible, and
          // driving `TokenResolver.chrome_edge_types()` over the operator's own bundle returns ALL
          // SEVEN of his edge types. (Driven, not read: `rendered_as_chrome:` appears nowhere in
          // his config, so reading for it would have answered "none".)
          //
          // This reader handled `node_type:` and `field:` and fell through on everything else, so
          // an edge tag was neither — not refused, just never a case. Four of the seven tags
          // occurred ZERO times in the served declaration.
          //
          // ── THE RULE THAT WOULD HAVE CAUGHT IT SOONER ──
          //
          // `edgeTagOrder` was published in #182: the ORDER of the chrome cell. AN ORDERING IS A
          // CLAIM ABOUT A CELL, so publishing one asserts the cell can be populated — and nothing
          // could populate this one. The check that passed asked whether the three orders were
          // distinct, which is a different question and could not have answered this.
          //
          // CARDINALITY IS CARRIED, not dropped as metadata. `one` versus `many` decides whether a
          // second edge of that type REPLACES or APPENDS; a composer that ignores it emits two
          // `#next` cells for a relation the config says holds one.
          if (isNonEmptyString(entry.edge_type)) {
            if (rendered.edgeTags[entry.edge_type] === undefined) {
              const cardinality = entry.cardinality === "one" || entry.cardinality === "many"
                ? entry.cardinality
                : null;
              if (cardinality === null) {
                // DROP PATH 23. A declared edge tag whose cardinality this app does not recognise.
                // Published WITHOUT it would be worse than not publishing the row: a composer
                // reading a missing cardinality as "many" appends where the engine replaces.
                ledger.drop(
                  `edge tag '${entry.token}'`,
                  `spells edge type '${entry.edge_type}' but declares cardinality ` +
                    `${JSON.stringify(entry.cardinality ?? null)}, which is neither 'one' nor ` +
                    "'many', so how a second edge of that type renders is unknown and the tag is " +
                    "not published",
                );
              } else {
                rendered.edgeTags[entry.edge_type] = { token: entry.token, cardinality };
              }
            }
            // NOT A DROP: an `edge_type:` entry is kept above, or recorded by DROP PATH 23. A
            // later entry for a type already spelled is not discarded either — first-declaration-
            // wins, the same rule the `node_type:` branch states.
            continue;
          }
          // NOT A DROP: an entry declaring none of `node_type:`, `edge_type:` or `field:` spells
          // nothing this table can carry, so nothing was discarded.
          if (!isNonEmptyString(entry.field)) continue;

          // ── THE OUTPUT SIDE, FILLED FIRST AND UNCONDITIONALLY ON `render_only` ──
          //
          // Placed ABOVE DROP PATH 16 rather than below it, so the drop's `continue` cannot skip
          // it. That ordering is the whole mechanism: the ingest table refuses the glyph on the
          // next statement, and the output table has already kept it.
          const renderOnly = entry.render_only === true;
          if (isScalar(entry.value) && entry.value !== null) {
            // ── WHICH CELL DOES THIS GLYPH GO IN? THE ENGINE ANSWERS BY ITS OWN FILTER ──
            //
            // `fieldTokens` used to be ONE table for every fixed-value glyph, and that conflated
            // three different cells of a rendered line. The engine does not:
            //
            //   `source_tags_for_node` (token_resolver.py:518) ends `if tag and
            //   tag.startswith("#"): out.append(tag)` — so ONLY a `#`-prefixed glyph reaches the
            //   TAGS cell. Everything else is silently not a tag.
            //
            //   `source_markers_for_node` (token_resolver.py:566) walks the MARKER token forms and
            //   emits `{emoji, value: None}` for a fixed-value match — the MARKERS cell.
            //
            //   The checkbox glyph reaches NEITHER. It is the line's HEAD cell
            //   (`composition.heads.checkbox[0]`), and it is not a vocabulary lookup at all: see
            //   `renderCheckbox` for what actually decides it.
            //
            // Measured on the operator's config: 12 fields are `#`-prefixed, 4 are emoji, and
            // exactly one — `status` — is neither. Splitting on the engine's own filter is what
            // makes that one field IMPOSSIBLE to reach for by mistake, rather than merely
            // documented. See DROP PATH 22 below for where it goes instead.
            // MARKER-NESS IS READ FROM THE DECLARATION, NOT SNIFFED FROM THE GLYPH. The obvious
            // test — "does it look like an emoji" — is a guess about characters. The config already
            // says which family a token belongs to, and `vocabulary/markers.yaml`'s own `markers:`
            // family is the one `source_markers_for_node` walks. A future family of marker glyphs
            // declares itself the same way; a regex would have to be widened to notice.
            const table = entry.token.startsWith("#")
              ? (rendered.fieldTags[entry.field] ?? (rendered.fieldTags[entry.field] = {}))
              : familyName === MARKER_FAMILY
                ? (rendered.fieldMarkerValues[entry.field] ?? (rendered.fieldMarkerValues[entry.field] = {}))
                : null;
            if (table === null) {
              // DROP PATH 22. A fixed-value glyph that is neither a tag nor a marker — today, only
              // the checkbox family. NOT a gap: it is published, in the right shape, as
              // `renderCheckbox`. Recorded so the absence from this table is a named answer rather
              // than a silence a reader has to interpret.
              ledger.drop(
                `vocabulary token '${entry.token}'`,
                `spells '${entry.field}'='${String(entry.value)}' but is neither a '#'-prefixed tag ` +
                  "nor a marker glyph, so the engine emits it in NEITHER the tags cell nor the " +
                  "markers cell — it is a line's HEAD cell, decided by the render_checkbox " +
                  "decision table (first-match-wins over predicate rows, with a fallback a value " +
                  "map cannot express) and published as 'renderCheckbox'. Reading it from a " +
                  "spelling table would agree today by coincidence and diverge on the first row " +
                  "the contract adds",
              );
              continue;
            }
            const spelled = String(entry.value);
            if (table[spelled] === undefined) table[spelled] = entry.token;
          } else if (isNonEmptyString(entry.extraction_hint)) {
            // A TRAILING marker prints as `<token> <value>`, so the value's KIND is part of the
            // spelling — the same `{token, kind}` shape `orderingFields` already publishes for the
            // four fields an ordering happens to name, extended to every field the engine prints.
            // An unknown hint is skipped rather than guessed: `EXTRACTION_KINDS` is this app's own
            // closed set, and inventing a kind would make a composer print a value it cannot spell.
            const kind = EXTRACTION_KINDS[entry.extraction_hint];
            if (kind !== undefined && rendered.fieldMarkers[entry.field] === undefined) {
              const marker = { token: entry.token, kind };
              if (renderOnly) marker.renderOnly = true;
              rendered.fieldMarkers[entry.field] = marker;
            }
          }

          // DROP PATH 16. A tag the engine itself never ingests back from its own glyph.
          if (renderOnly) {
            ledger.drop(
              `vocabulary token '${entry.token}'`,
              `spells '${entry.field}' but is 'render_only: true', so the engine never reads that ` +
                "field back from that glyph and a seeded line would not round-trip",
            );
            continue;
          }
          if (!isScalar(entry.value) || entry.value === null) continue;
          if (fieldTokens[entry.field] === undefined) {
            fieldTokens[entry.field] = {};
            fieldOrder.push(entry.field);
          }
          const key2 = String(entry.value);
          if (fieldTokens[entry.field][key2] === undefined) fieldTokens[entry.field][key2] = entry.token;
        }
      }
    }
    if (Object.keys(typeTokens).length === 0) {
      throw new GenerationError(
        "no vocabulary token declares a 'node_type:' — the type tag is half of what the engine " +
          "prints on every line it renders, so an empty map would make every seed a silent guess",
      );
    }
    // SORTED ON THE WAY OUT. `presentation.json` is a committed artifact and
    // `generate:resolution:check` compares it by `JSON.stringify`, so key ORDER is part of what CI
    // asserts. Insertion order here is filesystem order over `vocabulary/*.yaml`, which would make
    // renaming a vocabulary file a spurious diff in a table whose content had not changed.
    return { typeTokens, fieldOrder, fieldTokens, rendered: sortSpelling(rendered) };
  }

  // ── 9. patterns/*.yaml + rules/*.yaml -> every rule that retypes, reduced to (find, when) ──────

  function readRetypeRules(ledger) {
    const patterns = new Map();
    const patternKeys = allKeys().filter((k) => k.startsWith(PATTERNS_PREFIX) && k.endsWith(".yaml")).sort();
    for (const key of patternKeys) {
      const file = key.slice(PATTERNS_PREFIX.length);
      const document = readYaml(key);
      // DROP PATH 17c — A REAL GAP, FOUND BY THE COMPLETENESS SCANNER, NOT ASSUMED AWAY. A
      // patterns/ file this reader cannot read as a mapping used to fall through here with no
      // record: every retype rule whose `for_each.pattern` names one of the patterns it declares
      // then hit DROP PATH 17 ("names no pattern this generator could read") — a true message
      // pointing at the wrong cause. `compile-qualification.mjs`'s own pattern loop already fixed
      // the identical shape for ITS reading of the same patterns/ directory (its DROP PATH 1);
      // this applies the same fix here, so the real cause is named at the real place.
      if (!document || typeof document !== "object" || Array.isArray(document)) {
        ledger.drop(
          `patterns/${file}`,
          "the file did not parse into a mapping of pattern name -> definition, so no retype rule " +
            "naming one of its patterns could be evaluated",
        );
        continue;
      }
      for (const [name, config] of Object.entries(document)) {
        if (!patterns.has(name)) patterns.set(name, config);
      }
    }

    const out = [];
    const ruleKeys = allKeys().filter((k) => k.startsWith(RULES_PREFIX) && k.endsWith(".yaml")).sort();
    for (const key of ruleKeys) {
      const file = key.slice(RULES_PREFIX.length);
      let document;
      try {
        document = readYaml(key);
      } catch (error) {
        // DROP PATH 17a. A rules file this reader cannot parse.
        ledger.drop(`rules/${file}`, `it did not parse (${error.message}), so any retype rule it declares was not evaluated`);
        continue;
      }
      if (!Array.isArray(document)) continue;
      for (const rule of document) {
        if (!rule || typeof rule !== "object") continue;
        const actions = Array.isArray(rule.actions) ? rule.actions : [];
        const retype = actions.find(
          (a) => a && typeof a === "object" && a.verb === "set_node_type" && isNonEmptyString(a.node_type),
        );
        if (retype === undefined) continue;
        const id = isNonEmptyString(rule.id) ? rule.id : `${file} (unnamed rule)`;
        const what = `rule '${id}'`;
        const patternName = (rule.for_each && typeof rule.for_each === "object")
          ? rule.for_each.pattern
          : undefined;
        if (!isNonEmptyString(patternName) || !patterns.has(patternName)) {
          // DROP PATH 17. A retype rule this generator cannot bind to any node type.
          ledger.drop(
            what,
            "it retypes a node but names no pattern this generator could read, so whether it " +
              "retypes a new line was not evaluated",
          );
          continue;
        }
        const pattern = patterns.get(patternName);
        const find = (pattern && typeof pattern === "object" && pattern.root && typeof pattern.root === "object")
          ? pattern.root.find
          : undefined;
        if (!find || typeof find !== "object" || Array.isArray(find)) {
          ledger.drop(what, `its pattern '${patternName}' declares no readable 'root.find'`);
          continue;
        }
        const steps = Array.isArray(pattern.steps) ? pattern.steps : [];
        if (steps.length > 0) {
          // DROP PATH 18. THE BOUNDARY, RECORDED. See the domain header.
          ledger.drop(
            what,
            `its pattern '${patternName}' traverses the graph (${steps.length} step(s)), which this ` +
              "generator does not read, so whether it retypes a new line was not evaluated",
          );
          continue;
        }
        if (!Object.values(find).every((v) => isScalar(v) && !(typeof v === "string" && v.startsWith("$")))) {
          ledger.drop(what, `its pattern '${patternName}' matches on something other than literal fields`);
          continue;
        }
        out.push({ id, find, when: rule.when, becomes: retype.node_type, what });
      }
    }
    return out;
  }

  // ── 10. view -> section -> {nodeType, defaults?, tokens} for EVERY section of every view sheet ──

  function readSectionRegistration(viewFiles, registration, ledger) {
    const fieldDefaults = readFieldDefaults();
    const spelling = readSpelling(ledger);
    const retypeRules = readRetypeRules(ledger);
    const out = {};
    for (const [file, view] of viewFiles) {
      const viewNodeType = isNonEmptyString(view.default_node_type)
        ? view.default_node_type
        : registration.defaultNodeType;
      const sections = {};
      for (const [index, section] of view.sections.entries()) {
        if (!section || typeof section !== "object" || !isNonEmptyString(section.id)) {
          // DROP PATH 22. Recorded by `readOrdering` too, for its own key; joined, never overwritten.
          ledger.drop(
            `views/${file}#${index}`,
            `section at index ${index} of view '${view.viewId}' has no readable 'id:', so what a ` +
              "new line under it becomes could not be published under any key",
          );
          continue;
        }
        const what = `section '${view.viewId}.${section.id}'`;
        const nodeType = isNonEmptyString(section.default_node_type)
          ? section.default_node_type
          : viewNodeType;
        const defaults = {};
        if (section.defaults && typeof section.defaults === "object" && !Array.isArray(section.defaults)) {
          for (const [field, value] of Object.entries(section.defaults)) {
            if (!isScalar(value)) {
              throw new GenerationError(
                `${file}: section '${section.id}' defaults.${field} is not a scalar — this ` +
                  "generator does not know what a new line under it resolves to, and refuses to guess",
              );
            }
            defaults[field] = value;
          }
        }
        const entry = { nodeType };
        if (Object.keys(defaults).length > 0) entry.defaults = defaults;
        entry.tokens = seedTokens(what, nodeType, defaults, fieldDefaults, spelling, retypeRules, ledger);
        sections[section.id] = entry;
      }
      if (Object.keys(sections).length > 0) out[view.viewId] = sections;
    }
    // THE SPELLING RIDES OUT WITH THE REGISTRATION rather than being read a second time at the
    // assembly. `readSpelling` writes to the ledger, and the ledger's key order IS part of the
    // committed artifact (`generate:resolution:check` compares `presentation.json` by
    // `JSON.stringify`) — so calling it again, or hoisting the call above this one, would reorder
    // `dropped` without changing a single fact in it.
    return { sectionRegistration: out, spelling: spelling.rendered };
  }

  // ── assemble ────────────────────────────────────────────────────────────────────────────────

  const viewFiles = readViewFiles();
  const registration = readRegistration(viewFiles);
  const candidates = collectDefaultNodeTypeCandidates(registration, viewFiles);
  const ordering = readOrdering(viewFiles, ledger);
  const defaultOrderingResult = readGlobalDefaultOrdering();
  // WIDENED: the candidate set is no longer only the fields a DECLARED `ordering:` names — the
  // (declared, or engine-fallback) default ordering's OWN fields are added too, generically, and a
  // marker for each must be looked up for every config, not only one that happens to already use
  // them in a declared section. NO FIELD IS EXCLUDED BY NAME — a field the default ordering names
  // that turns out to have no marker at all (`title`, in the fallback tuple) is not filtered out in
  // advance; `readOrderingFieldMarkers`'s own DROP PATH 13 records that absence, with its reason,
  // rather than the candidate set silently never asking.
  const orderingFields = readOrderingFieldMarkers(
    new Set([...orderingFieldNames(ordering), ...defaultOrderingResult.ordering.map((entry) => entry.field)]),
    ledger,
  );
  const chromeShapes = readChromeShapes(candidates, ledger);
  const identityModes = readIdentityModes();
  const continuationFields = readContinuationFields(ledger);
  const registrationResult = readSectionRegistration(viewFiles, registration, ledger);
  const sectionRegistration = registrationResult.sectionRegistration;
  const compositionResult = readGlobalComposition();
  const viewComposition = readViewComposition(viewFiles);

  const declaration = {
    registration,
    lineGrammars: readLineGrammars(),
    ordering,
    orderingFields,
    dayBoundary: readDayBoundary(),
    chromeShapes,
    sectionRegistration,
    // THE FLOOR OF THE CASCADE, DECLARED — see this file's own header ("THE DEFAULT ORDERING").
    // `defaultOrdering` is what every section with NEITHER `ordering` NOR `orderingMode` above sorts
    // by; `defaultOrderingSource` says whether that answer came from `global_defaults.yaml`
    // (`"config"`) or the engine's own hardcoded fallback (`"engine-fallback"`) — always published,
    // so the fallback is a visible fact, never the silent one this file used to publish.
    defaultOrdering: defaultOrderingResult.ordering,
    defaultOrderingSource: defaultOrderingResult.source,
    // THE SECOND DIRECTION OF THE LINE GRAMMAR — see "COMPOSITION" above. Read from
    // `global_defaults.yaml`'s own `composition:` key when the operator's config declares one,
    // exactly as `defaultOrdering` is; `compositionSource` says which answer this is
    // (`"config"` or `"engine-fallback"`), the same visible-fallback discipline.
    composition: compositionResult.composition,
    compositionSource: compositionResult.source,
    // ── AND THE FORM'S OWN SOURCE, BECAUSE `compositionSource` CANNOT SPEAK FOR IT ──
    //
    // `composition.form:` is an INDEPENDENTLY optional key inside an optional block:
    // `readCompositionForm(undefined)` answers the engine's own `bullet`/`titleStyles` literals
    // whether or not the enclosing `composition:` was declared. So a config declaring
    // `composition:` with `heads:`/`tail:` and no `form:` publishes `compositionSource: "config"`
    // over a bullet and a title wrap the config never mentioned — one flag asserting provenance
    // for two facts, one of which it does not know.
    //
    // NOT REACHABLE TODAY, WHICH IS THE REASON TO SAY IT NOW. `global_defaults.yaml` declares no
    // `composition:` key at all, so both sources read `"engine-fallback"` and the disagreement has
    // nothing to show. A flag that is only ever wrong in a state no config has reached yet is the
    // green-because-nothing-drives-it shape; it becomes a silent lie on the first day someone
    // orders cells without wrapping a title.
    //
    // `titleStyles: []` IS NOT AN ABSENCE AND NOT A DROP — checked, not assumed. `renderer.py:155`
    // declares `_COMPOSITION_TITLE_STYLES: tuple[str, ...] = ()`, so the engine's own answer is
    // "wrap a title in nothing", and this generator mirrors it exactly. A composer applying no
    // wrap agrees with the engine byte for byte. There is no default to invent here; there was
    // only a provenance flag that could not tell you so.
    compositionFormSource: compositionResult.formSource,
    // ── THE VIEW RUNG OF `composition:` — the SLOT, not a second answer ──────────────────
    //
    // `{ [viewId]: Composition & { formSource } }`, and a view is PRESENT only when its own
    // sheet declared `composition:`. Absence is the whole mechanism: a reader asks this map
    // first, and falls through to `composition`/`compositionSource` above when the view is not
    // in it — which is byte-identical to the behaviour before this key existed, for every
    // config that declares nothing.
    //
    // WHY NO `viewCompositionSource` MAP BESIDE IT. There is nothing for one to say. Presence
    // in this map IS the source: an entry means the VIEW rung answered, absence means ask the
    // rung below and read ITS source. A parallel map whose every value was the string "view"
    // would be a field that cannot vary, which is a field that cannot be wrong and therefore
    // cannot be checked. `resolutiontable.ts`'s `compositionFor` returns the resolved answer
    // AND which rung produced it, so the caller still never has to guess — the source is
    // DERIVED at the read, rather than published per view and kept in step by hand.
    //
    // `formSource` IS carried per entry, because it genuinely varies: a sheet may reorder cells
    // without declaring `form:` at all, and then its bullet is the engine literal while its
    // tail is the sheet's. That is the same asymmetry `compositionFormSource` records at the
    // global rung, and one flag could not speak for both facts there either.
    viewComposition,
    // WITHIN "tags" — see `ENGINE_LITERAL_TAG_ORDER`'s own header. Always the engine literal (no
    // config override surface exists for this file), always published (never optional the way
    // `priorityRank` below is) — a caller with no notion of tag order at all is exactly the caller
    // this axis was silently missing for until today.
    tagOrder: ENGINE_LITERAL_TAG_ORDER,
    tagOrderSource: "engine-literal",
    // THE OTHER TWO CELL FAMILIES THAT CARRY MORE THAN ONE CELL — see the literals' own header.
    // `tagOrder` has been published alone since 2026-08-07; a composer could order one of the three
    // and had to invent the rest.
    markerOrder: ENGINE_LITERAL_MARKER_ORDER,
    markerOrderSource: "engine-literal",
    edgeTagOrder: ENGINE_LITERAL_EDGE_TAG_ORDER,
    edgeTagOrderSource: "engine-literal",
    // THE FIRST CELL OF EVERY CHECKBOX LINE — see `ENGINE_LITERAL_RENDER_CHECKBOX`'s own header for
    // why it is published as ordered rows plus a fallback and never as a map, and for what the map
    // shape cost the operator the last time these two homes were allowed to drift.
    //
    // `"engine-literal"` LIKE `tagOrder`, NOT `"config"` OR `"engine-fallback"`: the contract lives
    // in the engine's own source, not in the operator's vault config, so there is no override
    // surface for him to declare and no fallback for this generator to choose between. A reader can
    // still tell WHICH KIND of fact this is rather than having to assume.
    renderCheckbox: ENGINE_LITERAL_RENDER_CHECKBOX,
    renderCheckboxSource: "engine-literal",
    // THE PER-NODE TITLE WRAP — see `ENGINE_LITERAL_RENDER_TITLE_STYLE`'s own header for why its
    // predicates nest where `renderCheckbox`'s do not, and why the operator set published is the
    // rule engine's own rather than the three these rows use.
    renderTitleStyle: ENGINE_LITERAL_RENDER_TITLE_STYLE,
    renderTitleStyleSource: "engine-literal",
    // WHETHER A NODE GETS A `[[qntm:N]]` STAMP, AND WHAT IDENTIFIES IT WHEN IT DOES NOT — see
    // `readIdentityModes`' own header. Keyed over EVERY type `schema.yaml` declares, so a type
    // missing from this map is an unknown type (refuse to compose) and never an ordinary one.
    //
    // ⚠ A `unique: true` TYPE IS ON A ROUND TRIP THAT DOES NOT CLOSE TODAY, and this key is the
    // one that tells a composer to take it. Driven in a hermetic starter vault (`qntm-md init`,
    // one config edit making a `plain_line` type unique, no other change): the engine renders
    // such a node's line correctly, and on the NEXT cycle — with no edit at all — emits it TWICE.
    // Membership stays right (the section heading still counts 1), the node count stays right,
    // the cycle reports `✓ no changes`, and it never heals. Excluded by driven tests: minting
    // (`resolve_or_create` binds by title, one node throughout), `line_cache` (cleared, it
    // re-doubles), and the applier guard `_unique_identity_node_survives_by_title` (the render
    // duplicates with the line absent from the file entirely). It is render-side, in line
    // EMISSION rather than membership. Reported for routing to the engine repo; NOT reachable
    // from this repo, and NOT a reason to withhold the fact — the six `plain_line` unique types
    // ARE stampless, and a composer that guessed otherwise would be wrong in a second way.
    identityModes,
    // THE EXTRA LINES A NODE RE-EMITS BENEATH ITS OWN — see `readContinuationFields`' own header.
    // Keyed ONLY by the types that declare them (9 of 36 today), unlike `chromeShapes` and
    // `identityModes`: those answer a question about EVERY node, and absence there would be
    // ambiguous. Here absence has one meaning — this type emits no continuation line — and it is
    // the same answer an empty list would give.
    continuationFields,
    // ── THE VOCABULARY, IN THE DIRECTION THAT PRINTS (2026-08-14) ──
    //
    // `sectionRegistration[view][section].tokens` above is the SEED answer: the tags a new line
    // gets, baked per section for that section's own minting default. It answers "what do I type",
    // and it is the only trace of the vocabulary that reached the browser until now.
    //
    // This answers "how does the engine SPELL this" for a node that already exists, whatever its
    // type turned out to be — the same widening `chromeShapes` takes above, and for the same
    // reason: a rule can retype a node after it is minted, so the section that minted it does not
    // determine how it prints.
    //
    //   typeTokens    node type -> its type tag          (`task` -> `#task`)
    //   fieldTokens   field -> value -> its tag          (`domain` -> `work` -> `#work`)
    //   fieldMarkers  field -> `{token, kind}` for a TRAILING value, `renderOnly: true` when the
    //                 engine prints the glyph and never reads it back (`☑️`, `🎯`)
    //
    // `fieldMarkers` OVERLAPS `orderingFields` AND DOES NOT REPLACE IT. That table is restricted to
    // the fields an ordering names, carries the enum shape ordering needs, and has readers today;
    // this one covers every field the engine prints. Where both answer, they agree — asserted, not
    // assumed, by `tests/present-resolution.test.mjs`.
    spelling: registrationResult.spelling,
  };
  // `priorityRank` follows the same "absent means nothing to say" convention every other optional
  // key in this declaration already uses (see resolutiontable.ts's own header) — omitted, not
  // published empty, when the declared default ordering names no field a rank table applies to.
  if (Object.keys(defaultOrderingResult.priorityRank).length > 0) {
    declaration.priorityRank = defaultOrderingResult.priorityRank;
  }
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

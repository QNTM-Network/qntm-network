/**
 * compile-qualification — the PURE compile step for the qualification declaration, split out of
 * `generate-qualification-declaration.mjs` for the same reason `compile-structural.mjs` was split
 * out of `generate-structural-declaration.mjs` (`5d4f1b5`, PR #84): this module must be safe to
 * `import` inside a Cloudflare Worker isolate, and "the function is pure" is not the same claim as
 * "the file is safe to import in a Worker." That first port found the gap by crashing at module
 * load — `worker/src/config.js` importing `compile` from the single-file generator dragged in
 * `node:fs` and `scripts/monorepo-config.mjs`'s module-level `fileURLToPath(import.meta.url)`, a
 * Node idiom `wrangler`'s bundler does not survive. This file is built to that finding from the
 * start rather than discovering it again: it imports only `yaml-subset.mjs` and `ledger.mjs`, both
 * already zero-import (`design-the-runtime-compile.md`'s own citation), so the Worker's module
 * graph for the qualification route is exactly: this file, plus those two — nothing Node-specific.
 * `worker/src/config.js` imports `compile` from HERE, never from `generate-qualification-
 * declaration.mjs`, which keeps `node:fs`, `node:path` and `monorepo-config.mjs` on the CLI side of
 * the split where a Worker route never has to load them.
 *
 * ── WHAT MOVED HERE, VERBATIM OR NEAR IT ──
 *
 * Every piece of `generate-qualification-declaration.mjs` that never touched a filesystem path
 * moved unchanged: `RESOLVABLE_FIELDS` (as it then was — 2026-08-06 replaced the frozen constant
 * with `deriveResolvableFields(files)`, a pure function of this same files map; see that function's
 * own header), the pattern normaliser (`normalisePattern` and its helpers, `normalisePattern` now
 * taking the derived field set as an explicit second argument rather than closing over a module
 * constant), the structural-exclusion desugarer (`applyStructuralExclusionDefaults`). The four
 * `read*(configDir, ledger)` functions that DID read the filesystem directly
 * (`readStructuralNodeTypes`, `readPatterns`, `readViews`, `readTokens`) are inlined into one
 * `compile(files, ledger)`, rewritten to read an in-memory files map instead — the same has/get/
 * allKeys shape `compile-structural.mjs` already established, so a files map (an object from a
 * POSTed JSON body, or a Map built by a caller) works without the caller knowing which. See that
 * file's own header for the shape's origin.
 *
 * ── WHAT CHANGED, NAMED SO IT IS NOT MISTAKEN FOR DRIFT ──
 *
 * Every LEDGER-DROP key (`patterns/foo.yaml`, `views/bar.yaml#2`, `vocabulary token '#work'`, …)
 * is byte-identical to what the original produced — `tests/declaration-drop.test.mjs` proves this,
 * unchanged, because a files-map key IS the same string the original derived from a directory read
 * plus a prefix. What changed is the small set of hard `GenerationError` messages that used to
 * interpolate an ABSOLUTE FILESYSTEM PATH (`${configDir}/schema.yaml does not exist`): those now
 * name the logical key instead (`schema.yaml does not exist`), the same "no absolute path or
 * username reaches a thrown message" move `compile-structural.mjs`'s `parseIndentBinding` already
 * made. No test asserts the old wording — checked directly, `grep -rn "does not exist" tests/` —
 * so this is a real but inert change, not a risk to the refusal contract the acceptance test pins
 * (see USAGE below and this repo's PR for the exact grep).
 *
 * ── WHAT DID NOT MOVE, AND WHY IT MATTERS MOST ──
 *
 * `normalisePattern` is unchanged in every way that matters to `unresolvable field(s): project` —
 * `tests/app-generality-acceptance.test.mjs`'s own pinned refusal, still true (`project` has no
 * vocabulary token and no registration default, so `deriveResolvableFields` never admits it — see
 * that function's own header). It still takes one parsed pattern config, returns `{find, exclude}`
 * or throws `Refusal`, and never reads a file, a files-map key, or a ledger. The ONE thing that DID
 * change (2026-08-06): it now takes the resolvable-field set as an explicit second argument instead
 * of reading a module-level `RESOLVABLE_FIELDS` constant — a REQUIRED parameter, not a default,
 * because a caller that forgot to derive it would otherwise silently answer against a stale idea of
 * what the config resolves. `tests/operator-set-agreement.test.mjs` still calls it directly, with a
 * hand-built config object, now alongside a hand-built field list for the same reason a hand-built
 * config needs a hand-built everything-else — this move changes where the function LIVES and what
 * it NEEDS TO BE TOLD, never what it DOES or SAYS about a given `(config, resolvableFields)` pair.
 */

import { parseYamlSubset } from "./yaml-subset.mjs";
import { Ledger } from "./ledger.mjs";
import { versionKey } from "./declaration-version.mjs";

export class GenerationError extends Error {}
class Refusal extends Error {}
const refuse = (reason) => {
  throw new Refusal(reason);
};

// The fixed keys `compile`'s file map carries, plus the three prefixes every per-family file lives
// under. Named once so the pure function and any caller building a files map (the fs shell in
// `generate-qualification-declaration.mjs`, or a Worker route reading a POSTed body) agree on the
// exact same strings without restating them.
export const SCHEMA_KEY = "schema.yaml";
export const PATTERNS_PREFIX = "patterns/";
export const VIEWS_PREFIX = "views/";
export const VOCABULARY_PREFIX = "vocabulary/";
export const DEFAULT_REGISTRATION_KEY = `${VIEWS_PREFIX}default_registration.yaml`;

/**
 * ── RESOLVABLE_FIELDS IS NO LONGER A LIST. IT IS A MEASUREMENT. ──
 *
 * 2026-08-06. The operator's own diagnosis: "config categories it can't resolve... we have nodes
 * and fields etc all declared in yaml. means we're not using that as the source of truth." Until
 * this change, `RESOLVABLE_FIELDS` was `Object.freeze(["node_type", "domain", "status"])` — three
 * names, hand-picked, that could only ever describe the config THIS repo shipped with. The
 * rationale for the three was always sound (it survives below, generalised rather than replaced):
 * a field is resolvable for a line being typed only when something VISIBLE IN THE LINE, or a
 * REGISTRATION DEFAULT this file also publishes, decides it. What was wrong is that the RULE was
 * applied by a person, once, and then frozen — instead of applied by this generator, every time it
 * runs, to whatever the config in front of it actually declares.
 *
 * ── THE RULE, STATED SO IT CAN BE CHECKED AGAINST THE THREE ORIGINAL FIELDS ──
 *
 * A field is resolvable if and only if ONE of:
 *
 *   (a) VOCABULARY SPELLS IT. Some `vocabulary/*.yaml` entry declares `field: F, value: <scalar>`
 *       (not `render_only: true` — a render-only marker is the engine's OUTPUT, never read back;
 *       see `deriveResolvableFields` below) — a FIXED glyph that means one discrete value. This is
 *       exactly what `status` (`checkbox.yaml`) and `domain` (`domain_tags.yaml`) already were:
 *       "visible in the line" cashes out, mechanically, as "a token spells it." Measured against
 *       the operator's real vocabulary (2026-08-06): fourteen OTHER fields pass this same test —
 *       `cadence`, `tier`, `cap_state`, `change_type`, `genre`, `god_box`, `class_state`,
 *       `package_state`, `principle_state`, `instantiate`, `priority`, `blocked_state`,
 *       `lead_state`, `asserted_state` — every one a plain tag family shaped exactly like
 *       `domain_tags.yaml`. EXCLUDED BY THE SAME RULE, NOT BY EXCEPTION: `due_date`,
 *       `available_date`, `completed_at`, `created_at`, `queue_position` carry only
 *       `extraction_hint:` markers (a glyph followed by a value that VARIES line to line — never a
 *       fixed spelling `tokens[field][token]` can hold); `done_task_count` and `par` carry only
 *       `render_only: true` markers (the engine never reads them back — exactly the operator's own
 *       "`done_task_count` is derived by the engine and cannot be read off a line" case, now a
 *       consequence of the rule rather than a hand-added carve-out); `cadence`'s own
 *       `parametric_field:` rows (`#every-3d`, verbatim capture) are excluded the same way DROP
 *       PATH 13 already excluded them — `cadence` is still resolvable because `cadence_tags.yaml`/
 *       `calendar_tags.yaml` ALSO spell it with fixed values (`#daily`, `#every-monday`, ...), so
 *       the parametric rows simply add nothing this rule needed from them.
 *
 *   (b) IT IS THE NODE TYPE. `entry.node_type` (a DIFFERENT key than `entry.field` — `type_tags
 *       .yaml`'s own shape) spells `node_type` the same way, plus the registration cascade's own
 *       `default_node_type` — the "registration default this file also publishes" half of the
 *       original rule, unchanged.
 *
 *   (c) IT IS `title`. Never spelled by a glyph — a title is the line's own printed text with the
 *       chrome cut away, the same fact `app/present/rendition.ts`'s `cleanTitleFor` and `app/
 *       present/ordering.ts`'s default-ordering comparator already rely on (that module's own
 *       header: "title is excluded [from marker lookup]: it is never marker-based... a title is
 *       the printed line's own chrome-free text, not a glyph to search for"). This is NOT a vocab
 *       fact and does not vary with the schema — it is a property of every qntm-md line, the same
 *       tier as "a checkbox glyph decides `status`" — so it is included unconditionally, the one
 *       field this function does not derive from `vocabulary/`. `app/present/membership.ts` reads
 *       it via the SAME `cleanTitleFor` reader, not a second transcription — see that file.
 *
 * `stage` and `project` are held up by `docs/…` as the sharpest refutation of "just widen the
 * list": both are referenced by real patterns, NEITHER has a vocabulary token or a registration
 * default, and THIS FUNCTION correctly leaves both out of its own answer — that has not changed.
 * What changed (2026-08-06, second pass) is that a field's value can ALSO arrive STRUCTURALLY — the
 * line's SECTION fixes it, never a glyph in the line — and a pattern referencing such a field is no
 * longer refused SOLELY because it is absent from this function's LEXICAL answer.
 * `deriveStructuralFieldsByQualification`, below `normalisePattern`, is the second rung; `compile()`
 * unions its answer, per pattern, with THIS function's answer before calling `normalisePattern`.
 * `deriveResolvableFields` itself stays exactly what its name says — the fields the LINE alone
 * resolves, everywhere, with no position to consult — which is still correct and still needed
 * unchanged for the token-table build immediately below (§4) and for `app/present/membership.ts`'s
 * own line-token decode loop, neither of which has a "referencing section" to widen against.
 *
 * ── WHY THIS LIVES IN ONE FUNCTION, NOT AS A MODULE-LEVEL CONSTANT ──
 *
 * The three-field freeze was a lie the moment a second qntm-md instance pointed this generator at
 * a DIFFERENT schema: the list could not follow. `deriveResolvableFields(files)` takes the exact
 * same files map `compile()` does and returns what a field-resolvability, cast over THAT config,
 * has to be. `compile()` calls it once, at the top, and threads the result through — to
 * `normalisePattern` (now a required second argument, not a closed-over module constant) and to
 * the token-table build below. `scripts/generate-operator-set.mjs` calls it too, against the real
 * monorepo config, to keep writing `app/present/membership.ts`'s and `scripts/qualification-
 * agreement.py`'s own literal copies — GENERATED, never hand-typed, exactly as before. The single
 * source moved from "a frozen array" to "a pure function of the config," which is the only kind of
 * single source that is still true on someone else's config.
 */
// ── THE DECLARED TRAVERSAL DEPTH — how many hops off the candidate node THIS GRAMMAR can express,
//    published so the browser reads what it is allowed to attempt instead of this file silently
//    deciding for it (backlog: `declare-the-default-view`'s sibling row for rule abstention) ──
//
// THE OPERATOR'S OWN CORRECTION, WHICH THIS CONSTANT EXISTS TO HONOUR: graph traversal is normal,
// not exotic, and the limit this file has today is not a boundary someone else owns — it is a
// number, and numbers move. Before this constant existed, "how far can the browser look" was an
// implicit fact about `normaliseStep`'s own admitted shapes (`normaliseSelfStep`/
// `normaliseEdgeStep`, above) that nothing published — a config author, or a future widening of
// this grammar, had no single place to read or change it. This is that place.
//
// WHY THE VALUE IS 1, MEASURED RATHER THAN ASSERTED. `normaliseStep` admits exactly two step
// shapes: a SELF-test (`{not: [{find_nodes: F}], min: 1}`, zero hops — it re-tests the candidate)
// and a ONE-HOP edge-existence test (`children:`/`parents:` with `edge_type`, `exists`/
// `not_exists` — `normaliseEdgeStep`'s own header). `ancestors:`/`descendants:` — UNBOUNDED,
// transitive traversal — are refused outright, with the same `traverses (...)` wording a self-step
// refusal already uses. So 1 is not a guess at what "feels safe"; it is the exact ceiling this
// closed grammar's own `EdgeStep` shape can express — `app/present/qualification.ts`'s `EdgeStep`
// type has no field for a SECOND hop, so a value greater than 1 would publish a number this
// grammar cannot yet honour, which is precisely the "config value that lies" this generator's own
// discipline (drop-and-record, never guess) refuses to ship.
//
// MEASURED AGAINST THE OPERATOR'S REAL CONFIG (2026-08-06, `scripts/measure-the-divergence.mjs`'s
// own posture: cited, not assumed): of 297 declared patterns, 137 normalise into this grammar
// today, 43 of those BECAUSE of a one-hop `children:`/`parents:` step — depth 1 is not
// hypothetical, it is already load-bearing. Of the 160 that do not normalise, exactly 4 are
// refused for graph depth beyond one hop, and all 4 need `ancestors:`/`descendants:` — UNBOUNDED
// depth, by the operator's own design comments ("a sub-sub-step must not escape the reset by being
// nested deeper"; "any depth resolves in ONE evaluation rather than propagating a hop per cycle").
// ZERO patterns in the whole config ask for exactly 2 or exactly 3 bounded hops — see this repo's
// PR for the full histogram. Raising this constant to 2 or 3 today would recover NOTHING; only an
// unbounded transitive walk (this grammar's own next arc, explicitly not built here) recovers
// those 4.
//
// SHARED, NOT DUPLICATED. `scripts/compile-rules.mjs` imports `normalisePattern` from this file
// (`normalisePattern`'s own export, below) rather than re-implementing pattern matching, so a
// rule's `for_each` pattern is bound by this SAME ceiling automatically — one published number
// covers both the section-membership axis (`qualification`) and the rules axis (`rules`), and
// `compile-rules.mjs` is not touched to say so.
export const TRAVERSAL_DEPTH = 1;

const isScalar = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);

/** A vocabulary entry that spells `field` with one FIXED, engine-readable scalar — see (a) above. */
function isFixedValueToken(entry) {
  return (
    entry !== null &&
    typeof entry === "object" &&
    typeof entry.field === "string" &&
    entry.render_only !== true &&
    isScalar(entry.value) &&
    entry.value !== null
  );
}

/**
 * Derive the resolvable-field set from `files` — the same in-memory config tree `compile` reads —
 * rather than a hand-maintained list. PURE, and tolerant of a vocabulary file that will not parse
 * or will not read as a mapping of families: this function only needs to know what IS spelled, and
 * a file `compile()` itself cannot read spells nothing either way, so `compile()`'s own ledger
 * records the read failure once, at its own drop path, rather than this function repeating it.
 *
 * @param {Record<string, string> | Map<string, string>} files
 * @returns {string[]} sorted, so a caller never has to sort it again
 */
export function deriveResolvableFields(files) {
  const isMap = files instanceof Map;
  const has = (key) => (isMap ? files.has(key) : Object.prototype.hasOwnProperty.call(files, key));
  const get = (key) => (isMap ? files.get(key) : files[key]);
  const allKeys = () => (isMap ? [...files.keys()] : Object.keys(files));

  // (c) — unconditional; see this section's own header for why title is not derived from vocabulary.
  const fields = new Set(["title"]);

  const vocabularyKeys = allKeys()
    .filter((k) => k.startsWith(VOCABULARY_PREFIX) && k.endsWith(".yaml"))
    .sort();
  for (const key of vocabularyKeys) {
    // NOT A DROP: `allKeys()` already enumerated this key, so `has(key)` is always true for an
    // object files map; the `isMap` branch is the only one that could ever miss, and only if a
    // caller mutated the map mid-iteration — defensive, not a real config-reading gap.
    if (!has(key)) continue;
    let document;
    try {
      document = parseYamlSubset(get(key), key);
    } catch {
      // NOT A DROP HERE: `compile()`'s own vocabulary read (below) hits the identical parse
      // failure and records it once, keyed the same way it always was. This function's only job
      // is "what does the config that DOES parse spell", so it treats an unparsable file as
      // spelling nothing and moves on, rather than reporting the same fact twice under two rules.
      continue;
    }
    if (!document || typeof document !== "object" || Array.isArray(document)) continue;
    for (const family of Object.values(document)) {
      if (!Array.isArray(family)) continue;
      for (const entry of family) {
        if (!entry || typeof entry !== "object") continue;
        if (typeof entry.node_type === "string") {
          // NOT A DROP: loop control — this entry set (b), so it is classified, not discarded.
          fields.add("node_type"); // (b)
          continue;
        }
        if (isFixedValueToken(entry)) fields.add(entry.field); // (a)
      }
    }
  }
  return [...fields].sort();
}

/** `markers.yaml`'s own `extraction_hint:` vocabulary, restricted to the three shapes an
 * orderable comparison can be resolved against — the same three `resolution.orderingFields`
 * (`compile-resolution.mjs`) already reads a marker for, kept as an independent constant here
 * rather than an import so this file's own Worker-safety story (see this file's own header)
 * never depends on that module's. */
const EXTRACTION_HINT_KINDS = { trailing_date: "date", trailing_int: "int", trailing_float: "float" };

/**
 * Derive the EXTRACTION-HINT field marker table — THE FOURTH RUNG of field-resolvability,
 * alongside `deriveResolvableFields`'s (a)-(c). A field admitted here is spelled by a GLYPH
 * followed by a VALUE THAT VARIES line to line (`due_date`'s 📅, `available_date`'s 🛫, …) rather
 * than a fixed spelling — `markers.yaml`'s `extraction_hint:` rows, deliberately excluded from
 * `deriveResolvableFields` itself (see that function's own header, "EXCLUDED BY THE SAME RULE, NOT
 * BY EXCEPTION"): a `tokens[field][token]` lookup cannot hold a value that is different on every
 * line, so these fields need a DIFFERENT reader (`app/present/select/membership.ts`'s
 * `extractionValue`, mirroring `app/present/arrange/ordering.ts`'s proven `markerValue`) rather
 * than a wider token table.
 *
 * EXCLUDED, BY THE SAME RULE `deriveResolvableFields`'s DROP PATH 11 ALREADY STATES FOR THE FIXED
 * TABLE: a `render_only: true` marker (`done_task_count`, `par`) is the engine's own OUTPUT, never
 * read back from a line the operator is typing — admitting it here would publish a field this
 * grammar could then compare against, and answer confidently and wrongly, because the glyph on the
 * line is a display artefact the NEXT cycle overwrites, not a value the operator set.
 *
 * PURE and tolerant of an unparsable vocabulary file, mirroring `deriveResolvableFields` exactly —
 * see that function's own header for why an unreadable file spells nothing either way.
 *
 * @param {Record<string, string> | Map<string, string>} files
 * @returns {Record<string, {token: string, kind: "date" | "int" | "float"}>}
 */
export function deriveExtractionHintFields(files) {
  const isMap = files instanceof Map;
  const has = (key) => (isMap ? files.has(key) : Object.prototype.hasOwnProperty.call(files, key));
  const get = (key) => (isMap ? files.get(key) : files[key]);
  const allKeys = () => (isMap ? [...files.keys()] : Object.keys(files));

  const fields = {};
  const vocabularyKeys = allKeys()
    .filter((k) => k.startsWith(VOCABULARY_PREFIX) && k.endsWith(".yaml"))
    .sort();
  for (const key of vocabularyKeys) {
    // NOT A DROP: `allKeys()` already enumerated this key — see `deriveResolvableFields`'s own
    // identical guard, immediately above, for why the `isMap` branch is the only one that could
    // ever miss, and only defensively.
    if (!has(key)) continue;
    let document;
    try {
      document = parseYamlSubset(get(key), key);
    } catch {
      // NOT A DROP HERE: `compile()`'s own vocabulary read (below, §4) hits the identical parse
      // failure and records it once — see `deriveResolvableFields`'s own identical `catch`, above,
      // for the full reasoning (this function only asks "what does the config that DOES parse
      // spell", so a file that will not parse spells nothing, exactly like there).
      continue;
    }
    // NOT A DROP: mirrors `deriveResolvableFields`'s own three identical shape guards immediately
    // below (a non-mapping document, a family that is not a list, an entry that is not an object)
    // — the SAME "not a compile()-recognised shape, so it names nothing" reasoning, not a THIRD
    // explanation for what is structurally the same guard three times over.
    if (!document || typeof document !== "object" || Array.isArray(document)) continue;
    for (const family of Object.values(document)) {
      if (!Array.isArray(family)) continue;
      for (const entry of family) {
        if (!entry || typeof entry !== "object") continue;
        // NOT A DROP: an extraction-hint entry setting no field, or `render_only: true`
        // (`done_task_count`, `par`) — this function's own header states why `render_only` is
        // EXCLUDED rather than admitted; a token with no `field:` at all declares nothing this
        // rung could ever range over either way.
        if (typeof entry.field !== "string" || entry.render_only === true) continue;
        const kind = EXTRACTION_HINT_KINDS[entry.extraction_hint];
        // NOT A DROP: an `extraction_hint:` value outside the three orderable shapes this rung
        // admits (`EXTRACTION_HINT_KINDS`, above) — nothing today's real config declares, but a
        // fourth hint value would need this rung's own widening before it could mean anything
        // here, not a silent guess at what it should compare as.
        if (kind === undefined) continue;
        // NOT A DROP: no glyph to key the marker table by — the same "nothing to publish" fact
        // `readOrderingFieldMarker`'s own `token` guard (`resolutiontable.ts`) states for the
        // sibling table this rung's own header cites.
        if (typeof entry.token !== "string" || entry.token === "") continue;
        // First writer wins — measured against the real config, every field's extraction_hint
        // entries name exactly one glyph each, so this never actually arbitrates a collision; it
        // exists so a future config that DID declare two never gets a silently-overwritten answer.
        if (!(entry.field in fields)) fields[entry.field] = { token: entry.token, kind };
      }
    }
  }
  return fields;
}

/**
 * ── RESOLVABILITY IS A CASCADE WALK, NOT A LINE-ONLY TOKEN LOOKUP. ──
 *
 * 2026-08-06, second pass. `deriveResolvableFields` (above) answers ONE rung of the cascade the
 * operator's own config already runs on for every other purpose: `global -> view -> section ->
 * node type -> line`, most-specific-first (`apps/qntm-md/src/qntm_md/resolution/levels.py:86-92`,
 * `SPECIFICITY = (LINE, SUBTREE, STRUCTURAL_NODE, VIEW, GLOBAL)`, verified against the engine this
 * PR). It asks "does a token in the LINE spell this field" and stops — so a field whose value
 * arrives STRUCTURALLY (the line's own POSITION decides it, not a glyph in it) is invisible to it
 * and every pattern that references that field is refused, even where the position makes the value
 * as certain as a token would.
 *
 * `project` is the measured case: no vocabulary token spells it anywhere in the operator's real
 * config, but every section that registers a `qntm-packages-*`-shaped qualification fixes it with
 * a section-level `defaults: {project: qntm-md}` (`views/qntm-packages.yaml`, four sections, this
 * exact key). A line typed under that section has a KNOWN `project` the instant it is typed — the
 * app already computes it (`app/present/membership.ts`'s `resolveLineFields`, unconditionally
 * copies every key of `section.defaults` into the resolved field set, lines 230-231, unchanged by
 * this PR) — but the COMPILER, asking only "does a token spell it", refused every pattern that
 * referenced it. This function is the second rung that closes that gap: THE SECTION.
 *
 * ── WHY ONLY THE SECTION RUNG, NOT VIEW OR GLOBAL TOO ──
 *
 * The engine's own cascade has GLOBAL and VIEW rungs for arbitrary fields too — `auto_tag:`,
 * validated at `bundle/validators/views.py`'s `_validate_registration_auto_tag`, feeds
 * `RegistrationKey.DEFAULT_FIELDS` at the VIEW and GLOBAL resolution levels
 * (`resolution/registration.py:84`). It is REAL engine machinery. It is also, measured directly
 * against the operator's real config (`rg -n "auto_tag:" apps/qntm-md/config`), used NOWHERE —
 * every field default in the real bundle is section-scoped (`defaults:`). Admitting a field on the
 * strength of a VIEW/GLOBAL `auto_tag:` would be sound in principle, but `resolveLineFields`
 * (`app/present/membership.ts`) does not read `auto_tag:` at any level today — only
 * `section.defaults`. Wiring admission to a rung the runtime resolver cannot yet read would publish
 * a predicate the browser would then evaluate against a field that silently reads `null`
 * (`matchesFindClause`'s own `fields[field] ?? null`) — exactly the confident-and-wrong answer this
 * whole mechanism exists to refuse. So this function walks SECTION only, the one rung that is
 * fully wired end to end (parsed, published, read at runtime) today. VIEW/GLOBAL `auto_tag:`
 * admission is a real next rung, left unbuilt and named, not built halfway — see this PR's own
 * description.
 *
 * ── THE SOUNDNESS ARGUMENT: INTERSECTION ACROSS EVERY REFERENCING SITE, NOT UNION ──
 *
 * A qualification is not owned by one section. `views/routines.yaml` and `views/routines-qntm.yaml`
 * both register a section against `qntm-routines`, for instance — measured, 16 of 192 qualifications
 * in the real config are referenced by more than one (view, section) site. If field F is fixed by
 * SOME but not ALL of a pattern's referencing sites, admitting F would be sound at the sites that
 * fix it and WRONG at the one that does not — the browser would resolve `F: null` there and a
 * predicate `F: eq X` would confidently answer false when it should abstain. So a field is
 * structurally admitted for a qualification only when EVERY site referencing it fixes that field —
 * the INTERSECTION of each site's own fixed-field set, never the union. This degrades gracefully:
 * a NEW section added tomorrow that references an existing qualification but omits a field the
 * OTHER sites fix silently NARROWS what that qualification can express, never widens it past what
 * every site can actually answer. Measured against the real config: every one of the 66 patterns
 * this rung newly admits is referenced by exactly ONE site, so the intersection is a no-op for all
 * of them today — the multi-site case is a soundness FLOOR this function enforces for the config
 * that has not been written yet, not a case the current config exercises.
 *
 * @param {Record<string, {qualification: string, defaults?: Record<string, unknown>}>[]} viewSectionMaps
 *   `Object.values(views)` — one array per view, each holding that view's `{sectionId: entry}` map,
 *   the SAME `entry` objects `compile()` already built (and will publish) at step 3, so this reads
 *   no new parse and cannot disagree with what the browser is actually handed.
 * @returns {Map<string, Set<string>>} qualification name -> the field names EVERY referencing site
 *   fixes via its own `defaults:` — empty when no site fixes anything in common (or the pattern
 *   simply has no section-level defaults at all).
 */
export function deriveStructuralFieldsByQualification(viewSectionMaps) {
  const siteFieldSetsByQualification = new Map();
  for (const sections of viewSectionMaps) {
    for (const section of Object.values(sections)) {
      const siteFields = new Set(Object.keys(section.defaults ?? {}));
      const existing = siteFieldSetsByQualification.get(section.qualification);
      if (existing) existing.push(siteFields);
      else siteFieldSetsByQualification.set(section.qualification, [siteFields]);
    }
  }
  const result = new Map();
  for (const [qualification, siteFieldSets] of siteFieldSetsByQualification) {
    const [first, ...rest] = siteFieldSets;
    const intersection = new Set(first);
    for (const siteFields of rest) {
      for (const field of intersection) {
        if (!siteFields.has(field)) intersection.delete(field);
      }
    }
    result.set(qualification, intersection);
  }
  return result;
}

// ── the pattern normaliser — pure over a parsed config object, no files map involved ───────────

/** The engine's own orderable-comparison vocabulary (`core/graph/src/qntm_graph/patterns/
 * engine.py::_NODE_PREDICATE_OPERATORS`, minus `eq`/`not` which this grammar already names by
 * their own keys) — admitted here as a CLASS, never a per-field special case. */
const COMPARISON_OPERATORS = ["gt", "gte", "lt", "lte"];

/**
 * `$cycle_today` / `$cycle_week_end`, optionally offset by a whole number of days — the ENGINE's
 * own closed cycle-variable grammar (`core/graph/src/qntm_graph/patterns/engine.py`'s
 * `_CYCLE_EXPR_RE = re.compile(r"^\$(cycle_[a-zA-Z0-9_]*)(?:\s*([+-])\s*(\d+)\s*d)?$")`), narrowed
 * to the two names the engine's own `cycle_context` ever actually binds to an ISO DATE
 * (`apps/qntm-md/src/qntm_md/coordination/orchestrator.py:4717-4722` — `cycle_today`/
 * `cycle_week_end`; `cycle_started_at` and `day_window_since` are datetimes, never compared here,
 * and no other `$cycle_*` name is ever bound). This is the same "closed grammar names no other
 * cycle variable" posture `app/present/rules.ts`'s own `resolveRuleValue` already takes for
 * `setsFieldTo` — a class of two, not a field enumerated. `app/present/select/qualification.ts`'s
 * `CYCLE_EXPRESSION_RE` is this SAME pattern, kept as an independent literal (not an import) for
 * the same Worker-isolation reason `EXTRACTION_HINT_KINDS`, above, gives.
 */
const CYCLE_EXPRESSION_RE = /^\$(cycle_today|cycle_week_end)(?:\s*[+-]\s*\d+\s*d)?$/;

/**
 * A comparison operand: a plain scalar, or a recognised cycle expression. A `$`-prefixed value
 * that is NOT a recognised cycle expression is refused by name — an unknown variable, or a
 * malformed offset, is not a value this reader can resolve, so it is treated exactly as the
 * original unconditional `$`-refusal already treated every `$`-prefixed scalar.
 */
function normaliseComparisonOperand(value, field) {
  if (typeof value === "string" && value.startsWith("$")) {
    if (!CYCLE_EXPRESSION_RE.test(value)) refuse(`${field}: cycle variable ${value}`);
    return value;
  }
  if (!isScalar(value) || value === null) refuse(`${field}: comparison value is not a scalar`);
  return value;
}

/**
 * `allowComparison` distinguishes the CANDIDATE's own fields (root `find`, a self-step's
 * `find_nodes` — both test the line being typed, exactly `resolveLineFields`'s domain) from an
 * EDGE STEP's neighbour restriction (a `children:`/`parents:` hop's own `fields` — a DIFFERENT
 * node's fields, read from the graph payload, never from the line). Comparisons and cycle
 * expressions are admitted only for the former: widening the latter would need `today` threaded
 * through `graphmatch.ts`'s whole graph-aware matcher, a larger and separately-verified surface
 * this leg does not touch — see `normaliseEdgeStep`'s own call site, below, which always passes
 * `false`. This is a SCOPE boundary, not a field boundary: it holds for every field alike.
 */
function normalisePredicate(value, field, allowComparison) {
  if (isScalar(value)) {
    if (typeof value === "string" && value.startsWith("$")) {
      if (allowComparison && CYCLE_EXPRESSION_RE.test(value)) return { eq: value };
      refuse(`${field}: cycle variable ${value}`);
    }
    return { eq: value };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    // A mapping predicate names its operator explicitly. `eq`/`not` are spelled out here as well
    // as inferred from a bare value, because `status: {not: {eq: done}}` nests one inside the
    // other and refusing the inner `eq` would withhold a pattern that is entirely decidable.
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === "not") {
      return { not: normalisePredicate(value.not, field, allowComparison) };
    }
    if (keys.length === 1 && keys[0] === "eq") {
      return normalisePredicate(value.eq, field, allowComparison);
    }
    // The engine allows several comparison operators, CONJOINED (`{gte: $today, lte: $week_end}`
    // is a range) — `_normalise_node_predicate`, engine.py:678-712. Admitted only when EVERY key
    // is one of the four comparison operators (never mixed with `eq`/`not` in the same mapping —
    // no pattern in the operator's real config does that, and refusing the mix rather than
    // guessing an evaluation order for it is the same "wrong answer worse than refusal" posture
    // this whole reader keeps elsewhere).
    if (allowComparison && keys.length > 0 && keys.every((k) => COMPARISON_OPERATORS.includes(k))) {
      // FLAT, not wrapped — the engine's own multi-key shape, unwrapped, so the wire predicate a
      // config's `{gte: X, lte: Y}` normalises TO is the SAME shape it started as. `app/present/
      // select/qualification.ts`'s `FieldPredicate` reads this identically.
      const compare = {};
      for (const k of keys) compare[k] = normaliseComparisonOperand(value[k], field);
      return compare;
    }
    if (keys.length !== 1) refuse(`${field}: operator ${keys.join("+")}`);
    refuse(`${field}: operator ${keys[0]}`);
  }
  refuse(`${field}: unreadable predicate`);
}

function normaliseFind(find, where, allowComparison) {
  if (!find || typeof find !== "object" || Array.isArray(find)) {
    refuse(`${where}: not a mapping`);
  }
  let nodeType = null;
  const fields = {};
  for (const [key, value] of Object.entries(find)) {
    if (key === "node_type") {
      const list = Array.isArray(value) ? value : [value];
      if (list.length === 0 || !list.every((t) => typeof t === "string" && !t.startsWith("$"))) {
        refuse(`${where}.node_type: not a string or list`);
      }
      nodeType = [...list].sort();
      // NOT A DROP: loop control — node_type was just read into `nodeType`.
      continue;
    }
    fields[key] = normalisePredicate(value, key, allowComparison);
  }
  return { nodeType, fields };
}

/**
 * `{not: [{find_nodes: F}], min: 1}` over a single candidate is exactly "the candidate does not
 * match F" — a SELF-test, never a traversal. Returns `{kind: "self", nodeType, fields}`.
 */
function normaliseSelfStep(step, index) {
  if (step.min !== 1) refuse(`step ${index}: min=${JSON.stringify(step.min)}`);
  if (!Array.isArray(step.not) || step.not.length !== 1) {
    refuse(`step ${index}: 'not' is not a single-element list`);
  }
  const sub = step.not[0];
  if (!sub || typeof sub !== "object" || Array.isArray(sub) || Object.keys(sub).length !== 1) {
    refuse(`step ${index}: sub-step is not a single-key mapping`);
  }
  if (!("find_nodes" in sub)) {
    refuse(`step ${index}: traverses (${Object.keys(sub)[0]})`);
  }
  return { kind: "self", ...normaliseFind(sub.find_nodes, `step ${index}.not[0].find_nodes`, true) };
}

/**
 * `{children: {edge_type: T, ...F}, exists: true}` / `{parents: {...}, not_exists: true}` — a
 * ONE-HOP edge-existence test: does the candidate have (or not have) at least one neighbour,
 * reached by ONE `children`/`parents` traversal of `edge_type`, matching `F`?
 *
 * MEASURED against the operator's real config (`tasks_with_open_part_of_child.yaml`,
 * `tasks_with_open_waiting_for_child.yaml`, and 25 more patterns 27 sections reference): every
 * real `children:`/`parents:` step names `edge_type` (a string or a list — `chain_head_candidates
 * .yaml`'s `[NEXT, PARALLEL]`), optionally `node_type`, and optionally further field predicates
 * (`status: {not: {eq: done}}`, or a bare boolean like `reset_cascade_pending: true`) — exactly the
 * shape `normaliseFind` already reads for `root.find` and for a self-step's own `find_nodes`, so
 * this reuses it rather than re-deriving field-predicate handling a third time.
 *
 * ONE HOP ONLY, ON PURPOSE. `ancestors:`/`descendants:` are TRANSITIVE by the operator's own
 * comments (`routine_reset_cascade.yaml`: "TRANSITIVE, not one hop (`ancestors` ...)";
 * `unlocks_propagation.yaml`: "Transitive (`ancestors`, not `parents`)") — a walk of unbounded
 * depth, not a single edge. Modelling that would need a graph-aware matcher this leg does not
 * build (see `app/present/membership.ts`'s `qualifierNeedsGraph`); `normaliseStep` below refuses
 * any direction key other than `children`/`parents` for exactly this reason, with the same
 * `traverses (...)` wording a self-step refusal already uses.
 */
function normaliseEdgeStep(direction, mustExist, spec, index) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    refuse(`step ${index}.${direction}: not a mapping`);
  }
  const { edge_type: edgeTypeRaw, ...rest } = spec;
  const edgeTypeList = Array.isArray(edgeTypeRaw) ? edgeTypeRaw : [edgeTypeRaw];
  if (
    edgeTypeList.length === 0 ||
    !edgeTypeList.every((t) => typeof t === "string" && t !== "" && !t.startsWith("$"))
  ) {
    refuse(`step ${index}.${direction}.edge_type: not a string or non-empty list of strings`);
  }
  const edgeType = [...edgeTypeList].sort();
  const { nodeType, fields } = normaliseFind(rest, `step ${index}.${direction}`, false);
  return { kind: "edge", direction, mustExist, edgeType, nodeType, fields };
}

/**
 * One pattern `step`, normalised to either a SELF-test (`{kind: "self", nodeType, fields}` — the
 * original, unwidened grammar) or a ONE-HOP edge-existence test (`{kind: "edge", direction,
 * mustExist, edgeType, nodeType, fields}` — see `normaliseEdgeStep`). Any other shape — including
 * `ancestors:`/`descendants:`, three or more keys, or an `exists`/`not_exists` value that is not
 * literally `true` — is refused with the same `traverses (...)` naming the original grammar used,
 * so a config change that adds a step shape neither form models still names exactly what it saw.
 */
function normaliseStep(step, index) {
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    refuse(`step ${index}: not a mapping`);
  }
  const keys = Object.keys(step).sort();
  if (keys.length === 2 && keys[0] === "min" && keys[1] === "not") {
    return normaliseSelfStep(step, index);
  }
  if (keys.length === 2) {
    const direction = keys.includes("children") ? "children" : keys.includes("parents") ? "parents" : null;
    const polarityKey = keys.includes("exists") ? "exists" : keys.includes("not_exists") ? "not_exists" : null;
    if (direction !== null && polarityKey !== null) {
      if (step[polarityKey] !== true) {
        refuse(`step ${index}.${polarityKey}: ${JSON.stringify(step[polarityKey])}, not true`);
      }
      return normaliseEdgeStep(direction, polarityKey === "exists", step[direction], index);
    }
  }
  refuse(`step ${index}: traverses (${keys.join("+")})`);
}

/**
 * Normalise one pattern config into the closed local grammar `{find, exclude}`, or throw
 * `Refusal` with a reason. PURE — one object in, one object out or a thrown reason; no file, no
 * files-map key, no ledger. `tests/operator-set-agreement.test.mjs` drives this directly, and
 * `tests/app-generality-acceptance.test.mjs`'s pinned refusal (`unresolvable field(s): project`)
 * is this function's own last check, unchanged by this file's existence.
 *
 * @param {object} config the pattern's own parsed `{root, steps, parameters}` config
 * @param {readonly string[]} resolvableFields the field set `deriveResolvableFields` computed for
 *   THIS config — REQUIRED, not defaulted, because a caller that forgot to derive it would
 *   otherwise silently fall back to some stale idea of what is resolvable. Every caller in this
 *   repo (`compile` below, `compile-rules.mjs`) derives it from the same files map it already has.
 */
export function normalisePattern(config, resolvableFields) {
  if (!Array.isArray(resolvableFields)) {
    throw new TypeError(
      "normalisePattern(config, resolvableFields): resolvableFields must be an array — call " +
        "deriveResolvableFields(files) and pass its result, never a hand-written list.",
    );
  }
  const parameters = config?.parameters;
  if (parameters && typeof parameters === "object" && Object.keys(parameters).length > 0) {
    refuse(`parameters: ${Object.keys(parameters).join("+")}`);
  }
  const root = config?.root;
  if (!root || typeof root !== "object" || Array.isArray(root)) refuse("no 'root' mapping");
  if (!("find" in root)) refuse("root has no 'find' (composed pattern)");
  const extraRootKeys = Object.keys(root).filter((k) => k !== "find");
  if (extraRootKeys.length > 0) {
    refuse(`root also carries ${extraRootKeys.join("+")}`);
  }
  const find = normaliseFind(root.find, "root.find", true);
  const steps = Array.isArray(config.steps) ? config.steps : config.steps == null ? [] : refuse("'steps' is not a list");
  const normalisedSteps = steps.map((step, i) => normaliseStep(step, i));
  const exclude = normalisedSteps
    .filter((s) => s.kind === "self")
    .map(({ nodeType, fields }) => ({ nodeType, fields }));
  const edgeSteps = normalisedSteps
    .filter((s) => s.kind === "edge")
    .map(({ direction, mustExist, edgeType, nodeType, fields }) => ({
      direction,
      mustExist,
      edgeType,
      nodeType,
      fields,
    }));

  // THE LAST REFUSAL, AND THE ONE THAT DECIDES WHAT SHIPS. A predicate can be perfectly local and
  // still be unanswerable, because the app has to resolve the LINE's fields before it can test
  // anything — and for a line the operator is typing it can resolve exactly three: the node type
  // (registration default, or a type token in the line), the domain (a domain token) and the
  // status (the checkbox). Each is decided by something visible in the line or by a default this
  // same file publishes. `project`, `title`, `cap_state` and the rest are not: they are set
  // elsewhere, or by an engine rule at mint time, and a browser that resolved them to "absent"
  // would answer confidently and wrongly. Withholding them here keeps ONE refusal boundary with
  // ONE legible record, instead of a predicate on the wire that the app must silently decline.
  //
  // EDGE-STEP FIELDS ARE DELIBERATELY OUTSIDE THIS CHECK. A `children:`/`parents:` field predicate
  // (`status`, `reset_cascade_pending`, `cluster_locked`, ...) ranges over a NEIGHBOUR NODE's
  // fields, read from the graph payload the same way any node's fields are — never from the LINE
  // being typed, which is what `resolvableFields` exists to bound. Applying that bound here would
  // refuse every one-hop pattern this widening exists to admit, for a restriction that was never
  // about the graph in the first place.
  const referencedFields = new Set();
  for (const clause of [find, ...exclude]) {
    for (const field of Object.keys(clause.fields)) referencedFields.add(field);
  }
  const unresolvable = [...referencedFields].filter((f) => !resolvableFields.includes(f)).sort();
  if (unresolvable.length > 0) {
    refuse(`unresolvable field(s): ${unresolvable.join("+")}`);
  }
  const result = { find, exclude };
  // OMITTED, NOT `[]`, WHEN NO PATTERN IN THE OPERATOR'S CONFIG USES ONE — every pattern that
  // resolved before this widening keeps the EXACT TWO-KEY `{find, exclude}` shape it always had,
  // insertion order and all, so its JSON is BYTE-IDENTICAL, not merely semantically equal.
  // VERIFIED against the operator's real config for this widening's own PR: all 69 previously-
  // published patterns hash identical before/after, 19 new ones resolve, 0 regressed — see that
  // PR's own description for the exact reproducible comparison run.
  if (edgeSteps.length > 0) result.edgeSteps = edgeSteps;
  return result;
}

/**
 * Reproduce `bundle/pattern_structural_defaults.py`: a pattern whose `root.find` names no
 * `node_type` gets one `{not: [{find_nodes: {node_type: T}}], min: 1}` step per identity-unique
 * type it does not already exclude. `include_structural: true` opts the whole pattern out. PURE —
 * unchanged by this file's existence.
 */
export function applyStructuralExclusionDefaults(config, structuralTypes) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return config;
  if (config.include_structural === true) {
    const { include_structural, ...rest } = config;
    return rest;
  }
  const find = config.root && typeof config.root === "object" ? config.root.find : null;
  if (!find || typeof find !== "object" || Array.isArray(find)) return config;
  if ("node_type" in find) return config;

  const already = new Set();
  if (Array.isArray(config.steps)) {
    for (const step of config.steps) {
      // NOT A DROP: scanning steps the pattern ALREADY has, to avoid re-adding an exclusion. A malformed step is refused with a reason by normaliseStep below.
      if (!step || typeof step !== "object") continue;
      // NOT A DROP: same scan, same downstream refusal.
      if (!Array.isArray(step.not)) continue;
      for (const sub of step.not) {
        const findNodes = sub && typeof sub === "object" ? sub.find_nodes : null;
        if (findNodes && typeof findNodes === "object" && typeof findNodes.node_type === "string") {
          already.add(findNodes.node_type);
        }
      }
    }
  }
  const missing = structuralTypes.filter((t) => !already.has(t));
  if (missing.length === 0) return config;
  const steps = Array.isArray(config.steps) ? [...config.steps] : [];
  for (const nodeType of missing) {
    steps.push({ not: [{ find_nodes: { node_type: nodeType } }], min: 1 });
  }
  return { ...config, steps };
}

// ── the pure compile — `design-the-runtime-compile.md` step C's own contract ───────────────────

/**
 * Compile the qualification declaration from an in-memory config tree. PURE: no filesystem, no
 * command line, no clock, no randomness — and, like `compile-structural.mjs`, no import that is
 * not itself as pure as this one. The same function runs identically in the CLI shell
 * (`generate-qualification-declaration.mjs`) and in the Worker's Gate-1 route
 * (`worker/src/config.js`).
 *
 * @param {Record<string, string> | Map<string, string>} files path -> file contents. Recognised
 *   keys: `"schema.yaml"`, every `"patterns/<name>.yaml"`, every `"views/<name>.yaml"` (including
 *   `"views/default_registration.yaml"`), and every `"vocabulary/<name>.yaml"`. Paths use `/`
 *   regardless of platform — this is a logical tree, not a filesystem one.
 * @param {Ledger} ledger
 * @returns {{declaration: object, dropped: object}}
 */
export function compile(files, ledger = new Ledger()) {
  const isMap = files instanceof Map;
  const has = (key) => (isMap ? files.has(key) : Object.prototype.hasOwnProperty.call(files, key));
  const get = (key) => (isMap ? files.get(key) : files[key]);
  const allKeys = () => (isMap ? [...files.keys()] : Object.keys(files));
  const readYaml = (key) => parseYamlSubset(get(key), key);

  // ── 0. what CAN this config resolve, at all — see `deriveResolvableFields`'s own header ────────
  // Computed ONCE, from this same files map, and threaded through: to `normalisePattern` (§5) and
  // to the token-table build (§4). `title` is carried in this set but has no token table of its
  // own — see `TOKEN_FIELDS` at §4 — so it is split out there, not here.
  const resolvableFields = deriveResolvableFields(files);
  // THE FOURTH RUNG, KEPT SEPARATE FROM `resolvableFields` ITSELF — see `deriveExtractionHintFields`'s
  // own header for why a field spelled by a varying trailing value cannot join the FIXED-token set
  // `resolvableFields` publishes unchanged (§4's `TOKEN_FIELDS` would try, and fail, to build a
  // `tokens[field]` table for it). Unioned into `normalisePattern`'s own admissible-field argument
  // below (§5), never into `resolvableFields`'s own published value.
  const extractionHintFields = deriveExtractionHintFields(files);

  // ── 1. schema.yaml -> the identity-unique (structural) node types ────────────────────────────

  if (!has(SCHEMA_KEY)) throw new GenerationError(`${SCHEMA_KEY} does not exist`);
  const schema = readYaml(SCHEMA_KEY);
  const nodeTypes = schema?.node_types;
  if (!nodeTypes || typeof nodeTypes !== "object") {
    throw new GenerationError(`${SCHEMA_KEY}: no 'node_types:' mapping`);
  }
  const structuralTypes = [];
  for (const [name, definition] of Object.entries(nodeTypes)) {
    const identity = definition && typeof definition === "object" ? definition.identity : null;
    if (identity && typeof identity === "object" && identity.unique === true) structuralTypes.push(name);
  }
  if (structuralTypes.length === 0) {
    throw new GenerationError(
      `${SCHEMA_KEY}: no node type declares 'identity: {unique: true}' — the structural-exclusion ` +
        "desugarer this generator reproduces would be a no-op, which has never been true of this " +
        "config; refusing rather than publishing predicates that admit structural chrome.",
    );
  }
  structuralTypes.sort();

  // ── 2. patterns/*.yaml -> one merged pattern map ──────────────────────────────────────────────
  // SORTED EXPLICITLY, the same reason `compile-structural.mjs`'s view keys are: a files map
  // carries no directory-walk order of its own once it is in memory.

  const patternKeys = allKeys()
    .filter((k) => k.startsWith(PATTERNS_PREFIX) && k.endsWith(".yaml"))
    .sort();
  const rawPatterns = new Map();
  for (const key of patternKeys) {
    const file = key.slice(PATTERNS_PREFIX.length);
    const document = readYaml(key);
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      // DROP PATH 1. Every pattern this file defines vanishes with it, and a section naming one of
      // them then throws "names a pattern that no file in patterns/ defines" — a true message
      // pointing at the wrong file. Recorded here so the real cause is named at the real place.
      ledger.drop(
        key,
        "the file did not parse into a mapping of pattern name -> definition, so every pattern " +
          "it defines was skipped",
      );
      continue;
    }
    for (const [name, config] of Object.entries(document)) {
      if (rawPatterns.has(name)) {
        throw new GenerationError(
          `pattern '${name}' is defined in two files (${rawPatterns.get(name).file} and ${file}) — ` +
            "the engine merges one dict, so a duplicate silently loses; refusing.",
        );
      }
      rawPatterns.set(name, { file, config });
    }
  }

  // ── 3. views/*.yaml -> sections, with the registration cascade resolved ──────────────────────

  if (!has(DEFAULT_REGISTRATION_KEY)) {
    throw new GenerationError(`${DEFAULT_REGISTRATION_KEY} does not exist`);
  }
  const registration = readYaml(DEFAULT_REGISTRATION_KEY)?.default_registration;
  if (!registration || typeof registration !== "object") {
    throw new GenerationError(`${DEFAULT_REGISTRATION_KEY}: no 'default_registration:' mapping`);
  }
  const globalNodeType = registration.default_node_type;
  if (typeof globalNodeType !== "string") {
    throw new GenerationError(
      `${DEFAULT_REGISTRATION_KEY}: default_node_type is not a string — the GLOBAL rung of the ` +
        "registration cascade is what an unstamped line falls through to; refusing to guess it.",
    );
  }

  const viewKeys = allKeys()
    .filter((k) => k.startsWith(VIEWS_PREFIX) && k.endsWith(".yaml"))
    .sort();
  const views = {};
  const sectionOrder = {};
  for (const key of viewKeys) {
    // NOT A DROP: default_registration.yaml is not a view sheet; it is read above, for the GLOBAL rung.
    if (key === DEFAULT_REGISTRATION_KEY) continue;
    const file = key.slice(VIEWS_PREFIX.length);
    const document = readYaml(key);
    // DROP PATHS 2-4. Each drops a WHOLE VIEW — every section it declares, out of both `sections`
    // and `sectionOrder`. `sectionOrder` is what L3 ADDRESSING indexes positionally, so a view
    // missing from it is a view whose every line is addressed by falling through to nothing.
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      ledger.drop(key, "the file did not parse into a mapping, so the whole view was skipped");
      continue;
    }
    const entries = Object.entries(document);
    if (entries.length !== 1) {
      ledger.drop(
        key,
        `the file declares ${entries.length} top-level keys (${Object.keys(document).join(", ")}) ` +
          "and this generator reads a view sheet as exactly one; the whole view was skipped",
      );
      continue;
    }
    const [viewId, view] = entries[0];
    if (!view || typeof view !== "object" || !Array.isArray(view.sections)) {
      ledger.drop(key, `view '${viewId}' declares no 'sections:' list, so the whole view was skipped`);
      continue;
    }

    const viewNodeType =
      typeof view.default_node_type === "string" ? view.default_node_type : globalNodeType;
    const sections = {};
    const order = [];
    for (const [index, section] of view.sections.entries()) {
      // DROP PATHS 5-6. A section dropped here is dropped from `sectionOrder` TOO, and that is the
      // one this file's own comments say must be impossible: `app/present/address.ts` counts
      // headings positionally and indexes `sectionOrder`, but the ENGINE still emits a heading for
      // a section this generator could not read. One missing entry therefore shifts every
      // subsequent section's ordinal and misaddresses every line under it — silently, and with
      // confident wrong answers rather than abstentions.
      if (!section || typeof section !== "object") {
        ledger.drop(
          `${key}#${index}`,
          `section at index ${index} of view '${viewId}' is not a mapping — it is missing from ` +
            "sectionOrder, which shifts the positional ordinal of every section after it",
        );
        continue;
      }
      const { id, qualification, defaults, name } = section;
      if (typeof id !== "string" || typeof qualification !== "string") {
        ledger.drop(
          `${key}#${index}`,
          `section ${typeof id === "string" ? `'${id}'` : `at index ${index}`} of view ` +
            `'${viewId}' declares no ${typeof id === "string" ? "'qualification:'" : "'id:'"} — ` +
            "it is missing from sectionOrder, which shifts the positional ordinal of every " +
            "section after it",
        );
        continue;
      }
      const entry = { qualification, nodeType: viewNodeType };
      // THE OPERATOR'S OWN WORDS FOR THE SECTION, when the config declares one.
      if (typeof name === "string" && name !== "") entry.name = name;
      if (defaults && typeof defaults === "object" && !Array.isArray(defaults)) {
        const fixed = {};
        for (const [field, value] of Object.entries(defaults)) {
          if (!isScalar(value)) {
            throw new GenerationError(
              `${file}: section '${id}' defaults.${field} is not a scalar — this generator does ` +
                "not know what an unstamped line under it resolves to, and refuses to guess.",
            );
          }
          fixed[field] = value;
        }
        if (Object.keys(fixed).length > 0) entry.defaults = fixed;
      }
      sections[id] = entry;
      // THE FULL DECLARED ORDER, captured BEFORE the assembly step below drops any section whose
      // qualification was refused. This is what `sectionAt` (L3 ADDRESSING, `app/present/
      // address.ts`) indexes — never `Object.keys(sections[view])`.
      order.push(id);
    }
    if (Object.keys(sections).length > 0) {
      views[viewId] = sections;
      sectionOrder[viewId] = order;
    }
  }

  // ── 4. vocabulary/*.yaml -> the tokens that set a RESOLVABLE field ──────────────────────────
  // Collected across ALL vocabulary files rather than from three known filenames, so a new family
  // that starts setting one of these fields is picked up with no edit here.
  //
  // `title` IS resolvable (see `deriveResolvableFields`) but has NO token table: it is never
  // spelled by a glyph, so there is no `tokens.title` for a vocabulary entry to populate and no
  // "empty map" to refuse below. `TOKEN_FIELDS` is `resolvableFields` minus exactly that one field.

  const TOKEN_FIELDS = resolvableFields.filter((f) => f !== "title");
  const tokens = {};
  for (const field of TOKEN_FIELDS) tokens[field] = {};

  const vocabularyKeys = allKeys()
    .filter((k) => k.startsWith(VOCABULARY_PREFIX) && k.endsWith(".yaml"))
    .sort();
  for (const key of vocabularyKeys) {
    const document = readYaml(key);
    // DROP PATH 7. A whole vocabulary file, and every token in it.
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      ledger.drop(
        key,
        "the file did not parse into a mapping of family -> token list, so every token it " +
          "declares was skipped",
      );
      continue;
    }
    for (const [familyName, family] of Object.entries(document)) {
      // DROP PATH 8. A family declared as a mapping rather than a list.
      if (!Array.isArray(family)) {
        ledger.drop(
          `${key}#${familyName}`,
          `the '${familyName}:' family is not a list of token entries, so every token in it was ` +
            "skipped",
        );
        continue;
      }
      for (const [index, entry] of family.entries()) {
        // DROP PATH 9. An entry with no `token:` — there is nothing to key it by.
        if (!entry || typeof entry !== "object" || typeof entry.token !== "string") {
          ledger.drop(
            `${key}#${familyName}[${index}]`,
            "the entry declares no 'token:' string, so nothing could be keyed by it",
          );
          continue;
        }
        const what = `vocabulary token '${entry.token}'`;
        if (typeof entry.node_type === "string") {
          tokens.node_type[entry.token] = entry.node_type;
          continue;
        }
        // DROP PATH 10 — the largest of the sixteen: a token setting a field outside what this
        // config's own vocabulary+schema make resolvable for a line being typed.
        if (typeof entry.field === "string") {
          // `title` is resolvable (§0) but is NEVER spelled by a glyph — a title is the line's own
          // printed text, not a value a token could fix (see `deriveResolvableFields`'s case (c)).
          // A vocabulary entry that tried would have no `tokens.title` to land in; named here
          // rather than left to crash on the missing table.
          if (entry.field === "title") {
            ledger.drop(
              what,
              "sets 'title' — a line's title is its own chrome-free printed text, never a glyph's " +
                "fixed value, so this generator does not read it from a vocabulary token",
            );
            continue;
          }
          if (!TOKEN_FIELDS.includes(entry.field)) {
            ledger.drop(
              what,
              `sets '${entry.field}', which is not one of the fields this config's vocabulary and ` +
                `schema make resolvable for a line being typed (${resolvableFields.join(", ")})`,
            );
            continue;
          }
          // DROP PATH 11. A resolvable field, set by a marker the engine itself refuses to ingest
          // from that glyph. Deliberate, and now stated rather than assumed.
          if (entry.render_only === true) {
            ledger.drop(
              what,
              `sets '${entry.field}' but is 'render_only: true' — a derived display value the ` +
                "engine never reads back from that glyph",
            );
            continue;
          }
          // DROP PATH 12. A resolvable field set to something that is not a fixed scalar.
          if (!isScalar(entry.value) || entry.value === null) {
            ledger.drop(
              what,
              `sets '${entry.field}' to ${JSON.stringify(entry.value ?? null)}, which is not a ` +
                "fixed scalar this generator can publish as token -> value",
            );
            continue;
          }
          tokens[entry.field][entry.token] = entry.value;
          continue;
        }
        // DROP PATH 13. A token that sets a field through a DIFFERENT key
        // (`parametric_field:` — a field declaration this loop never even looks at otherwise).
        if (entry.parametric_field && typeof entry.parametric_field === "object") {
          const field = entry.parametric_field.field;
          ledger.drop(
            what,
            `sets '${typeof field === "string" ? field : "an unnamed field"}' through ` +
              "'parametric_field:', a shape this generator does not read at all",
          );
          continue;
        }
        // Everything else — an edge tag, a deletion gesture, a structural token — declares no
        // field at all. There is nothing dropped, so nothing is recorded.
      }
    }
  }
  for (const field of TOKEN_FIELDS) {
    if (Object.keys(tokens[field]).length === 0) {
      throw new GenerationError(
        `no vocabulary token sets '${field}' — the app resolves a line's ${field} from these ` +
          "tokens, so an empty map would make every answer a silent guess; refusing.",
      );
    }
  }

  // ── assemble ────────────────────────────────────────────────────────────────────────────────

  const referenced = new Set();
  for (const sections of Object.values(views)) {
    for (const section of Object.values(sections)) referenced.add(section.qualification);
  }

  // THE CASCADE WALK'S SECOND RUNG — see `deriveStructuralFieldsByQualification`'s own header for
  // the mechanism and the soundness argument (intersection across every referencing site). Reads
  // the SAME `entry.defaults` objects step 3 already built and will publish below — no second parse
  // to disagree with the runtime resolver over.
  const structuralFieldsByQualification = deriveStructuralFieldsByQualification(Object.values(views));

  const predicates = {};
  const refused = {};
  for (const name of [...referenced].sort()) {
    const raw = rawPatterns.get(name);
    if (raw === undefined) {
      throw new GenerationError(
        `section qualification '${name}' names a pattern that no file in patterns/ defines`,
      );
    }
    // LEXICAL (line-rung, works anywhere) UNION EXTRACTION-HINT (line-rung, a varying trailing
    // value rather than a fixed spelling) UNION STRUCTURAL (section-rung, only where every
    // referencing site fixes it) — never the other way round. Neither union ever shrinks
    // `resolvableFields`; a field this pattern's own predicate does not reference is never even
    // asked about, so a wider admissible set here costs nothing to a pattern that does not use it.
    const admissibleFields = [
      ...new Set([
        ...resolvableFields,
        ...Object.keys(extractionHintFields),
        ...(structuralFieldsByQualification.get(name) ?? []),
      ]),
    ].sort();
    try {
      predicates[name] = normalisePattern(
        applyStructuralExclusionDefaults(raw.config, structuralTypes),
        admissibleFields,
      );
    } catch (error) {
      if (!(error instanceof Refusal)) throw error;
      refused[name] = error.message;
    }
  }

  // A section whose qualification was refused is dropped entirely: the app must not hold a section
  // id it can say nothing about, because a present-but-empty entry is indistinguishable from a
  // decidable one that happened to match nothing.
  const sections = {};
  for (const [viewId, viewSections] of Object.entries(views)) {
    const kept = {};
    for (const [sectionId, section] of Object.entries(viewSections)) {
      if (section.qualification in predicates) {
        kept[sectionId] = section;
        // NOT A DROP: this is the KEEP branch.
        continue;
      }
      // DROP PATH 14. The section is IN `sectionOrder` (so addressing is unharmed) but out of
      // `sections`, so the app abstains for every line under it. The REASON is not restated here:
      // it is `refused['<qualification>']`, one copy.
      ledger.drop(`section '${viewId}.${sectionId}'`, `qualification refused: ${section.qualification}`);
    }
    if (Object.keys(kept).length > 0) sections[viewId] = kept;
  }

  const declaration = {
    defaultNodeType: globalNodeType,
    structuralNodeTypes: structuralTypes,
    // WHAT THIS CONFIG MADE RESOLVABLE — `deriveResolvableFields(files)`'s own answer, published so
    // a reader (`generate-operator-set.mjs`, a test, a future Worker route) never has to re-derive
    // it from the files map itself to know what governed `tokens`/`predicates` below. Sorted by
    // `deriveResolvableFields`, so this is stable across a compile that changes nothing.
    resolvableFields,
    // THE FOURTH RUNG'S OWN MARKER TABLE — field -> {token, kind}, `deriveExtractionHintFields
    // (files)`'s own answer. Published beside `resolvableFields` rather than folded into it (see
    // that field's own comment) so a reader can extract `due_date`/`available_date`/… off a line
    // being typed the same way `app/present/arrange/ordering.ts`'s `markerValue` already does for
    // ordering — `app/present/select/membership.ts`'s `extractionValue` is that reader.
    extractionFields: extractionHintFields,
    tokens,
    predicates,
    sections,
    // The FULL declared order, per view — every section id, including the ones dropped from
    // `sections` above because their qualification was refused.
    sectionOrder,
    refused,
    // AN ENGINE-FACT-SHAPED CONSTANT, published unconditionally — see `TRAVERSAL_DEPTH`'s own
    // header, above, for what it is and why it is 1, not read out of any YAML.
    traversalDepth: TRAVERSAL_DEPTH,
  };
  // EVERY DECLARATION THIS GENERATOR READ AND DID NOT PUBLISH, with its reason. `refused` above
  // is ONE kind of that — a pattern that would not normalise. `dropped` is all the others.
  const dropped = ledger.toJSON();
  return {
    declaration,
    dropped,
    // `design-the-runtime-compile.md` §8 step A — deterministic, content-derived, never a clock or
    // a counter. See `declaration-version.mjs` for what is hashed and why.
    version: versionKey({ declaration, dropped }),
  };
}

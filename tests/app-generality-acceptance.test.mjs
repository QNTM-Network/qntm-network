/**
 * THE OPERATOR'S OWN ACCEPTANCE TEST FOR THE WHOLE FRONT-RUNNING ARCHITECTURE, RUN FOR THE FIRST
 * TIME — docs/implementation-artifacts/design-the-compiler-and-the-bands.md §6 ("The acceptance
 * test — agreed, and unrun"), docs/implementation-artifacts/roadmap-the-road-ahead.md §4 (the three
 * bands this file measures against).
 *
 *   node --test tests/app-generality-acceptance.test.mjs
 *
 * ── THE TEST, IN THE OPERATOR'S OWN WORDS ──
 *
 * "Write a config the system has never seen, and the browser behaves correctly with nobody
 * touching code." Not his config — a new one. `design-the-compiler-and-the-bands.md` §6 states
 * plainly that every agreement script in this repo (`qualification-agreement.py`,
 * `resolution-agreement.py`, `operator-set-agreement.test.mjs`) runs against HIS config and stands
 * in for this test without being it, and that nothing had actually run it. This file runs it.
 *
 * ── WHAT IS DECLARED, AND WHY EACH PIECE IS THERE ──
 *
 * A node type (`gentest_widget`), a tag that means it (`#gentest_widget`), a view
 * (`gentest-widgets`) with THREE sections — `queued` (ordering declared, closed `not`/`eq`
 * qualification), `done` (closed `eq` qualification, a DIFFERENT default so it seeds differently
 * from `queued`), `archived` (a qualification that references `project`, a field outside
 * `RESOLVABLE_FIELDS` — declared, deliberately unspellable by this app, the negative half). None of
 * these five names, nor the marker glyph `🧮`, appears anywhere in the operator's real config —
 * verified with `rg -a` (never plain `grep`: `tests/no-nul-bytes.test.mjs` exists because a NUL
 * byte once made plain `grep` silently skip a real source file in this repo) against both the
 * monorepo config and this worktree, zero hits, before this file was written.
 *
 * ── SCOPE, MATCHING THE BRANCH THIS SUITE SHIPS ON ──
 *
 * EVERYTHING in this file is built from a `cpSync` COPY of the monorepo config, under the test
 * runner's own temp dir, torn down in a `finally`. The new/changed files are written INTO that
 * copy, never into `DEFAULT_CONFIG_DIR` itself. The generators under test run against the
 * copy and their JS objects are held in memory — `presentation.json` on disk, in this worktree or
 * anywhere else, is never written by this file. The declaration reaches the page through
 * `loadPresentation()`'s own fetch, stubbed to answer with the in-memory object
 * (`withDeclaration`, the same seam `tests/app-seed-from-cascade.test.mjs` §1 uses) — the real
 * network code path, never a bypass. Every `commitLine` in this file talks to a STUBBED `fetch`,
 * the same posture every sibling suite in this family takes: no real POST, no graph-sync, no cycle,
 * no write to `~/qntm` or `~/.qntm-md` (neither path is opened by this file at all). The whole
 * suite SKIPS, loudly, if `DEFAULT_CONFIG_DIR` is not checked out — the same guard
 * `tests/app-seed-from-cascade.test.mjs` §3/§5 use, for the same reason: CI does not clone the
 * monorepo.
 *
 * ── WIDENED, 2026-08-04: STRUCTURAL AND RULES JOIN THE GATE ──
 *
 * Measured before this widening: this file called exactly two generators —
 * `generate-qualification-declaration.mjs` and `generate-resolution-declaration.mjs`.
 * `generate-structural-declaration.mjs` was never invoked from here at all, and neither was any
 * rules-category generator — which is exactly how `compile-capture-rules.mjs` (two hardcoded file
 * paths, two hardcoded rule ids) merged with 1803 tests passing (PR #91). Sections 7-9 below close
 * both gaps on the SAME never-seen scratch config every other section already uses: a new edge
 * type and a new section-level structural override (schema.yaml / views/gentest_widgets.yaml,
 * §7), and a new `rules/gentest_widgets.yaml` carrying one rule the widened `compile-rules.mjs`
 * models and one it does not (§8) — and §9 reproduces the RETIRED coupled compiler's own
 * algorithm in miniature and shows it goes red on exactly the content §8 proves the widened one
 * gets right, which is the direct answer to "would this gate have caught the coupled compiler."
 *
 * ── THE HEADLINE, PER RESOLUTION KIND — recorded here as a claim this file's own assertions
 *    below are what proves or disproves it, not as a substitute for reading them ──
 *
 *   REGISTRATION        ANSWERED.   §1 — `o` seeds `#gentest_widget` in a section declared minutes
 *                                    ago, through the real key-handling code path.
 *   DEFAULTS             ANSWERED.   §1 — `queued` seeds `#dev`, `done` seeds `#qntm` — two
 *                                    DIFFERENT section defaults, both spelled correctly, proving
 *                                    the seed is read from the section's own declaration and not
 *                                    copied from a neighbour (the exact defect
 *                                    `app-seed-from-cascade.test.mjs` was written to close).
 *   PLACEMENT/MEMBERSHIP ANSWERED, and ABSTAINED, both proven DIFFERENT. §2 — a `queued` commit
 *                                    (the NEW `not` operator, on a field combination this app has
 *                                    never evaluated) answers "membership: decided"; an `archived`
 *                                    commit (the NEW section whose qualification names an
 *                                    unresolvable field) abstains "no-section-declaration" — visibly
 *                                    different, through `#membershipBadge`, the real DOM sink.
 *   ORDERING              ANSWERED for the DECLARED positive case (a rank change), proven BOTH
 *                                    through the pure function directly AND through `#freshness`,
 *                                    the real DOM sink — unchanged from the original run of this
 *                                    file. RESTATED 2026-08-04, `roadmap-the-road-ahead.md`'s "the
 *                                    engine's own default ordering, made explicit" step: the
 *                                    "COULD NOT TELL" gap this section used to report — an
 *                                    abstention and a confident "nothing moved" answer landing
 *                                    BYTE-IDENTICAL on `#freshness` for `done`/`archived`, the two
 *                                    sections THIS view declares no ordering for — is CLOSED. §3
 *                                    now also shows `done` ANSWERING through the real DOM sink for
 *                                    a genuine title-driven rank change (the engine's own default,
 *                                    on a config this app has never seen before this file ran), and
 *                                    a *different*, still-real abstention (`nested-section`) made
 *                                    VISIBLE for `archived` rather than silently indistinguishable
 *                                    from "nothing moved" — proven through `#orderingBadge`, not
 *                                    only by reading `.kind` off the pure function.
 *   SECTION ADDRESSING   ANSWERED for all three new sections, including `archived`, which
 *                                    MEMBERSHIP cannot judge — §4 shows addressing and membership
 *                                    are genuinely separate resolutions, the first surviving where
 *                                    the second must refuse.
 *
 * ── WHAT THIS FILE DID NOT FIND: NO "WRONG" ──
 *
 * §5 records a considered, refuted candidate for a WRONG answer (a retype rule the generator's own
 * `readRetypeRules` cannot evaluate — `design-the-rule-mirror.md`'s 13/186 defect class) and shows
 * why it cannot apply to a freshly-typed line specifically: a bare capture has no children yet, so
 * a CHILD-TRAVERSING retype rule can be silently unevaluated by the generator without the SEED ever
 * being wrong, because the rule could not have fired at mint time regardless. No wrong answer was
 * manufactured, and none was found. That is reported as a refutation, not papered over.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { importPage, installBrowser, makeEvent, makeWorkDir, walk, withDeclaration, SERVED_DECLARATION } from "./fixtures/app-html-page.mjs";
import { generateQualification } from "../scripts/generate-qualification-declaration.mjs";
import { generateResolution } from "../scripts/generate-resolution-declaration.mjs";
import { generateStructural } from "../scripts/generate-structural-declaration.mjs";
import { generateRules } from "../scripts/generate-rules-declaration.mjs";
import { DEFAULT_CONFIG_DIR } from "../scripts/monorepo-config.mjs";
import { Ledger } from "../scripts/ledger.mjs";
import { orderingFor, resolveOrderingFor, resolveOrderingPlacementFor, sectionAt, sectionForInsertAt } from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

const monorepoAvailable = existsSync(DEFAULT_CONFIG_DIR);
const skip = monorepoAvailable
  ? false
  : `monorepo not checked out at ${DEFAULT_CONFIG_DIR} — this whole suite runs locally and is ` +
    "skipped in CI, which does not clone it (same posture as app-seed-from-cascade.test.mjs §3/§5)";

// ══════════════════════════════════════════════════════════════════════════════════════════════
// COLLISION CHECK, RUN AS PART OF THE SUITE ITSELF — not a one-off `rg` before writing this file,
// but a standing assertion that the five new names and the one new marker glyph stay absent from
// the operator's real config for as long as this test exists. If any of them is ever adopted for
// real, this file's own claim to be "never seen" goes stale silently unless something says so.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("0. THE NAMES ARE GENUINELY UNSEEN — verified with `rg -a`, never plain `grep`", { skip }, () => {
  test("none of gentest_widget / gentest-widgets / #gentest_widget / gentest_rank / 🧮 appears in the real config", () => {
    for (const needle of ["gentest_widget", "gentest-widgets", "gentest_rank", "🧮"]) {
      let out;
      try {
        out = execFileSync("rg", ["-a", "-F", needle, DEFAULT_CONFIG_DIR], { encoding: "utf8" });
      } catch (e) {
        // rg exits 1 on "no match" — the outcome this test wants. Any OTHER exit is a real error.
        assert.equal(e.status, 1, `rg failed for '${needle}': ${e.stderr || e.message}`);
        continue;
      }
      assert.fail(`'${needle}' already appears in the real config:\n${out}`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE SCRATCH CONFIG — built from a `cpSync` copy, mutated, and compiled by the REAL generators.
// Built ONCE for the whole file (a `before()` at module scope) so every section below drives the
// SAME declaration, and rebuilt every run — nothing here can rot into a stale fixture.
// ══════════════════════════════════════════════════════════════════════════════════════════════

let DECLARATION;
let RESOLUTION;
let QUALIFICATION;
let STRUCTURAL;
let RULES;
let scratchRoot;

before(() => {
  if (!monorepoAvailable) return;
  scratchRoot = mkdtempSync(join(tmpdir(), "gentest-acceptance-"));
  const configDir = join(scratchRoot, "config");
  cpSync(DEFAULT_CONFIG_DIR, configDir, { recursive: true });

  // 1. schema.yaml — a field (`gentest_rank`, an int the ordering key ranks by) and a node type
  //    (`gentest_widget`, checkbox-shaped, carrying `domain` and the new field) neither of which
  //    exists in the real schema.
  const schemaPath = join(configDir, "schema.yaml");
  let schema = readFileSync(schemaPath, "utf8");
  schema = schema.replace(
    /^node_types:/m,
    ["  gentest_rank:", "    type: int", "    nullable: true", "    required: false", "node_types:"].join("\n"),
  );
  schema = schema.replace(
    /^node_types:\n/m,
    "node_types:\n" +
      "  gentest_widget:\n" +
      "    fields: [title, qntm_id, status, domain, gentest_rank]\n" +
      "    render:\n" +
      "      shape: checkbox\n",
  );
  // An edge type (`GENTEST_LINKS`) neither `compile-structural.mjs` nor its section-level override
  // reader has ever seen. `queued`'s own `structural_edge_types`/`structural_edge_direction`
  // override (step 5 below) names it — the STRUCTURAL axis's own generality claim, proven the same
  // way the other axes are: new config, no code change, correct answer.
  schema = schema.replace(
    /^edge_types:\n/m,
    "edge_types:\n  GENTEST_LINKS:\n    direction: directed\n    cardinality: many_to_many\n",
  );
  writeFileSync(schemaPath, schema);

  // 2. vocabulary/type_tags.yaml — the tag that MEANS the new node type.
  const typeTagsPath = join(configDir, "vocabulary", "type_tags.yaml");
  writeFileSync(
    typeTagsPath,
    readFileSync(typeTagsPath, "utf8") + `  - { token: "#gentest_widget", node_type: gentest_widget }\n`,
  );

  // 3. vocabulary/markers.yaml — the trailing-token marker `gentest_rank`'s value is spelled with,
  //    the ordering half needs to read a value off a printed line at all.
  const markersPath = join(configDir, "vocabulary", "markers.yaml");
  writeFileSync(
    markersPath,
    readFileSync(markersPath, "utf8") + `  - { token: "🧮", field: gentest_rank, extraction_hint: trailing_int }\n`,
  );

  // 4. patterns/gentest_widgets.yaml — three qualifications. `queued` and `done` use the closed
  //    `eq`/`not` grammar over `status`, the resolvable field this generator actually reads.
  //    `archived` references `project`, which is NOT in RESOLVABLE_FIELDS — declared to be
  //    refused, on purpose, so the negative half of the acceptance test has something to prove.
  writeFileSync(
    join(configDir, "patterns", "gentest_widgets.yaml"),
    [
      "gentest-widgets-queued:",
      '  description: "Gentest widgets not yet done."',
      "  parameters: {}",
      "  root:",
      "    find:",
      "      node_type: gentest_widget",
      "      status: { not: done }",
      "  steps: []",
      "gentest-widgets-done:",
      '  description: "Gentest widgets done."',
      "  parameters: {}",
      "  root:",
      "    find:",
      "      node_type: gentest_widget",
      "      status: done",
      "  steps: []",
      "gentest-widgets-archived:",
      '  description: "Gentest widgets archived — deliberately unresolvable (references project)."',
      "  parameters: {}",
      "  root:",
      "    find:",
      "      node_type: gentest_widget",
      "      project: gentest",
      "  steps: []",
      "",
    ].join("\n"),
  );

  // 5. views/gentest_widgets.yaml — the view itself. `queued` carries an `ordering:` (the fifth
  //    resolution kind this file measures); `done` deliberately carries a DIFFERENT `defaults:`
  //    than `queued`, so a seed that copied the neighbour rather than reading the section's own
  //    declaration would be caught by §1 below (the exact bug `app-seed-from-cascade.test.mjs`
  //    was written to fix, reproduced here as a positive control on new config rather than his).
  writeFileSync(
    join(configDir, "views", "gentest_widgets.yaml"),
    [
      "gentest-widgets:",
      "  version: 1",
      "  default_node_type: gentest_widget",
      "  path: gentest/widgets.md",
      "  sections:",
      "    - id: queued",
      "      qualification: gentest-widgets-queued",
      '      name: "Queued"',
      "      ordering:",
      "        - { field: gentest_rank, direction: asc }",
      "      defaults:",
      "        domain: dev",
      "      structural_edge_types: [GENTEST_LINKS]",
      "      structural_edge_direction: outgoing",
      "    - id: done",
      "      qualification: gentest-widgets-done",
      '      name: "Done"',
      "      defaults:",
      "        domain: qntm",
      "    - id: archived",
      "      qualification: gentest-widgets-archived",
      '      name: "Archived"',
      "      defaults:",
      "        domain: dev",
      "",
    ].join("\n"),
  );

  // 6. rules/gentest_widgets.yaml — the RULES-CATEGORY axis's own generality claim. Three rules
  //    this grammar can model (`gentest-widget-done-clears-rank`: an `eq` predicate, an
  //    `unset_field` action — the widened verb `compile-capture-rules.mjs` never modelled;
  //    `gentest-widget-done-relinks-and-notifies`: TWO modelled actions plus an `emit_event`,
  //    the MULTIPLE-ACTIONS-PER-RULE widening this leg adds — see §8 below) and one it cannot
  //    (`gentest-widget-cancelled-or-done`: an `in` predicate, the shape real rules like
  //    `waiter_status_propagation.yaml` use) — so the positive, the negative, AND the multi-action
  //    halves of the rules axis are all proven on config this generator has never seen, the same as
  //    qualification's own positive/negative split (§5 below).
  writeFileSync(
    join(configDir, "rules", "gentest_widgets.yaml"),
    [
      "- id: gentest-widget-done-clears-rank",
      "  for_each:",
      "    pattern: gentest-widgets-done",
      "  when:",
      "    eq: [$current.node.fields.status, done]",
      "  actions:",
      "    - verb: unset_field",
      "      node_id: $current.node.id",
      "      field: gentest_rank",
      "- id: gentest-widget-done-relinks-and-notifies",
      "  for_each:",
      "    pattern: gentest-widgets-done",
      "  when:",
      "    eq: [$current.node.fields.status, done]",
      "  actions:",
      "    - verb: set_field",
      "      node_id: $current.node.id",
      "      field: domain",
      "      value: qntm",
      "    - verb: unset_field",
      "      node_id: $current.node.id",
      "      field: gentest_rank",
      "    - verb: emit_event",
      "      type: gentest_widget_relinked",
      "      payload:",
      "        node_id: $current.node.id",
      "- id: gentest-widget-cancelled-or-done",
      "  for_each:",
      "    pattern: gentest-widgets-done",
      "  when:",
      "    in: [$current.node.fields.status, [done, cancelled]]",
      "  actions:",
      "    - verb: set_field",
      "      node_id: $current.node.id",
      "      field: gentest_rank",
      "      value: 0",
      "",
    ].join("\n"),
  );

  QUALIFICATION = generateQualification(configDir, new Ledger());
  RESOLUTION = generateResolution(configDir, new Ledger());
  STRUCTURAL = generateStructural(configDir, new Ledger());
  RULES = generateRules(configDir, new Ledger());
  DECLARATION = {
    ...SERVED_DECLARATION,
    qualification: QUALIFICATION,
    resolution: RESOLUTION,
    structural: STRUCTURAL,
    rules: RULES,
  };
});

after(() => {
  if (scratchRoot) rmSync(scratchRoot, { recursive: true, force: true });
});

const VIEW = { id: "gentest-widgets", path: "gentest/widgets.md" };

// Flat (no indentation, so `orderingFor` never refuses `nested-section`), and every real view's
// trailing newline is present, same shape `app-seed-from-cascade.test.mjs`'s own INBOX fixture uses.
const SOURCE = [
  "## Queued",
  "- [ ] widget alpha 🧮 30",
  "- [ ] widget beta 🧮 10",
  "- [ ] widget gamma 🧮 20",
  "## Done",
  "- [ ] widget shipped",
  "## Archived",
  "- [ ] widget old",
  "",
].join("\n");

/** A fresh page, its declaration loaded through the REAL fetch path, never `__applyPresentation`. */
async function freshPage(label, fetchStub) {
  const WORK = makeWorkDir(label);
  const browser = installBrowser();
  globalThis.fetch = withDeclaration(fetchStub, DECLARATION);
  const page = await importPage(WORK);
  await page.loadPresentation();
  return { page, ...browser };
}

const postStub = () => async (url, init) => {
  const body = JSON.parse(init.body);
  return {
    ok: true,
    json: async () => ({
      ok: true,
      handle: "luke",
      pending_edits: 0,
      snapshot: { generated_at: "2026-08-03T12:00:00Z", views: [{ ...VIEW, markdown: body.markdown }] },
    }),
  };
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. REGISTRATION + DEFAULTS — driven by `o`, the page's own key wiring, never `seedFor` called
//    directly. Also the first half of SECTION ADDRESSING: the seed can only be right if `o` first
//    worked out which of the three brand-new sections the cursor was in.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. REGISTRATION + DEFAULTS — `o` on a line under a section declared inside this test", { skip }, () => {
  let page, elements, doc;

  before(async () => {
    ({ page, elements, document: doc } = await freshPage("gentest-registration", async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    })));
  });

  const view = (id, path, title, markdown) => ({ id, path, title, domain: "dev", markdown });
  const snapshot = () => ({
    generated_at: "2026-08-03T12:00:00Z",
    views: [view(VIEW.id, VIEW.path, "Gentest Widgets", SOURCE)],
  });
  const inputs = () => walk(elements.get("viewBody")).filter((el) => el.tagName === "input" && el.type === "text");
  const press = (key) => doc.dispatch("keydown", makeEvent({ key }));

  const openAt = (lineIndex) => {
    page.__setGraphData({ snapshot: snapshot() });
    page.__setCurrentViewId(VIEW.id);
    page.paintView(VIEW.id, "chosen");
    page.__setFocus(lineIndex, SOURCE);
    press("o");
    const row = inputs()[0];
    assert.ok(row, `'o' opened no row at line ${lineIndex}`);
    return row.value;
  };

  // 2026-08-06: seed text carries a reserved double space at the title slot rather than a single
  // trailing space at the string's end — see `app-seed-from-cascade.test.mjs`'s own note, and
  // `newline.ts`'s `NewLine.cursorOffset` header, "THE `o` SEED".

  test("REGISTRATION: a line opened in `queued` seeds the new type tag `#gentest_widget`", () => {
    assert.equal(openAt(1), "- [ ]  #gentest_widget #dev");
  });

  test("DEFAULTS: `queued` and `done` seed DIFFERENT tags for the SAME type — the section's OWN default, not a copied neighbour", () => {
    assert.equal(openAt(1), "- [ ]  #gentest_widget #dev", "queued should seed its own default, #dev");
    assert.equal(openAt(5), "- [ ]  #gentest_widget #qntm", "done should seed its own default, #qntm, not queued's");
  });

  test("SECTION ADDRESSING, the registration half: `archived` — MEMBERSHIP-UNPUBLISHED but still ADDRESSABLE — still seeds correctly", () => {
    // `resolution.sectionRegistration` is NOT gated on `qualification.sections` (that generator's
    // own header: "what a new line BECOMES does not depend on what already belongs"). `archived`'s
    // qualification was refused (§5's negative half) but its registration/defaults were not, and
    // this is the browser proving that distinction rather than this file merely asserting it.
    assert.equal(openAt(7), "- [ ]  #gentest_widget #dev");
  });

  test("the trailing blank line of THIS brand-new view seeds exactly like the line above it (app-seed-from-cascade's own fix, re-proven on new config)", () => {
    assert.equal(openAt(8), openAt(7));
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. PLACEMENT / MEMBERSHIP — commitLine, the real DOM sink (#membershipBadge), the same shape
//    `app-membership-diagnostic.test.mjs` §2 drives, on a declaration nobody hand-typed.
// ══════════════════════════════════════════════════════════════════════════════════════════════

// `#membershipBadge` ITSELF WAS RETIRED (chore/retire-the-status-line, the abstention register).
// The three tests below used to read its `textContent`; they now ask the SAME question — what did
// the membership resolver decide for this commit, answered or abstained, and are the two
// DIFFERENT — through `page.__membershipDiagnosticFor(view, commit)`, the resolver-level accessor
// that used to feed `paintBadge`. That function calls the real `membershipSpec.read`/`.show` this
// page's own `commitLine` still runs on every commit (see the resolver-registry note above §2); the
// DOM sink is gone, the decision it used to display is not.
describe("2. PLACEMENT/MEMBERSHIP — answered AND abstained, proven DIFFERENT, through the membership resolver", { skip }, () => {
  let page;

  before(async () => {
    ({ page } = await freshPage("gentest-membership", postStub()));
  });

  test("a `queued` commit — the NEW `not` operator over a NEW node type — answers \"membership: decided\"", () => {
    const commit = {
      lineIndex: 1,
      text: "- [ ] widget alpha edited 🧮 30",
      markdown: SOURCE.replace("- [ ] widget alpha 🧮 30", "- [ ] widget alpha edited 🧮 30"),
      source: SOURCE,
      kind: "set-line",
    };
    page.commitLine(VIEW, commit);
    assert.equal(page.__membershipDiagnosticFor(VIEW, commit), "membership: decided");
  });

  test("an `archived` commit — the NEW unpublished section — abstains \"no-section-declaration\", visibly different", () => {
    const commit = {
      lineIndex: 7,
      text: "- [ ] widget old edited",
      markdown: SOURCE.replace("- [ ] widget old", "- [ ] widget old edited"),
      source: SOURCE,
      kind: "set-line",
    };
    page.commitLine(VIEW, commit);
    assert.equal(page.__membershipDiagnosticFor(VIEW, commit), "membership: abstained — no-section-declaration");
  });

  test("THE FALSIFIER ITSELF, on this new declaration: the two answers are not the same text", () => {
    const decided = {
      lineIndex: 1,
      text: "- [ ] widget alpha 🧮 30",
      markdown: SOURCE,
      source: SOURCE,
      kind: "set-line",
    };
    page.commitLine(VIEW, decided);
    const answered = page.__membershipDiagnosticFor(VIEW, decided);
    const abstains = {
      lineIndex: 7,
      text: "- [ ] widget old",
      markdown: SOURCE,
      source: SOURCE,
      kind: "set-line",
    };
    page.commitLine(VIEW, abstains);
    const abstained = page.__membershipDiagnosticFor(VIEW, abstains);
    assert.notEqual(answered, abstained, `an answer and an abstention read identically: "${answered}"`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. ORDERING — ANSWERED for the DECLARED positive case, through the pure function AND the real
//    DOM sink (unchanged since this file's original run). RESTATED 2026-08-04: the raw
//    `orderingFor` function still abstains "no-section-declaration" for `done`/`archived` — that
//    low-level contract has not changed and is still worth pinning on its own — but the PAGE no
//    longer calls that function for an undeclared section; it calls `resolveOrderingFor`, which
//    routes to the NEW `defaultOrderingFor`. The tests below prove, on THIS SAME never-seen
//    declaration, that the gap closes: an undeclared section now ANSWERS (through #freshness) for
//    a genuine default-ordering move, and ABSTAINS VISIBLY (through #orderingBadge) rather than
//    being indistinguishable from "nothing moved".
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. ORDERING", { skip }, () => {
  test("ANSWERED, established directly: a rank change on the NEW field `gentest_rank` is read as a move", () => {
    const reading = orderingFor(VIEW.id, "queued", SOURCE, 1, "- [ ] widget alpha 🧮 5", RESOLUTION.ordering, RESOLUTION.orderingFields);
    assert.equal(reading.kind, "answer");
    assert.equal(reading.answer.moved, true);
    assert.equal(reading.answer.beforeRank, 3, "alpha=30 should rank behind beta=10 and gamma=20");
    assert.equal(reading.answer.afterRank, 1, "alpha=5 should rank ahead of both");
  });

  test("ANSWERED, established through the real resolver sink: the ordering resolver's own sentence names the move", async () => {
    // `#freshness` was retired (chore/retire-the-status-line) — this used to read its `textContent`
    // after `commitLine`; it now asks the ordering resolver directly, the same `say()` that used to
    // feed that sentence, over the SAME commit `commitLine` just walked.
    const { page } = await freshPage("gentest-ordering-moved", postStub());
    const commit = {
      lineIndex: 1,
      text: "- [ ] widget alpha 🧮 5",
      markdown: SOURCE.replace("- [ ] widget alpha 🧮 30", "- [ ] widget alpha 🧮 5"),
      source: SOURCE,
      kind: "set-line",
    };
    page.commitLine(VIEW, commit);
    assert.match(page.__orderingNoteFor(VIEW, commit), /this line will move within Queued/);
  });

  test("COULD NOT TELL: a confident 'nothing moved' answer carries no ordering sentence", async () => {
    const { page } = await freshPage("gentest-ordering-nomove", postStub());
    const after = "- [ ] widget alpha text changed only 🧮 30"; // same rank field, value unchanged
    // Establish the TRUE answer first, off the pure function — this is not a guess.
    const reading = orderingFor(VIEW.id, "queued", SOURCE, 1, after, RESOLUTION.ordering, RESOLUTION.orderingFields);
    assert.equal(reading.kind, "answer");
    assert.equal(reading.answer.moved, false, "the fixture's own premise is gone — this edit was supposed to not move");
    const commit = { lineIndex: 1, text: after, markdown: SOURCE.replace("- [ ] widget alpha 🧮 30", after), source: SOURCE, kind: "set-line" };
    page.commitLine(VIEW, commit);
    assert.doesNotMatch(page.__orderingNoteFor(VIEW, commit), /this line will move within/);
  });

  test("THE RAW FUNCTION'S OWN CONTRACT IS UNCHANGED: orderingFor still abstains \"no-section-declaration\" for `done`", () => {
    // `orderingFor` itself was not touched by this step — only `app/index.html`'s call sites moved
    // to `resolveOrderingFor`. This pins that the low-level function's own behaviour did not shift
    // underneath the page-level change.
    const reading = orderingFor(VIEW.id, "done", SOURCE, 5, "- [ ] widget shipped edited", RESOLUTION.ordering, RESOLUTION.orderingFields);
    assert.equal(reading.kind, "abstains");
    assert.equal(reading.because, "no-section-declaration", "`done` declares no `ordering:` at all");
  });

  test("THE GAP CLOSES, PART 1: through the SAME real DOM sink, `done` now ANSWERS instead of abstaining invisibly", () => {
    // `resolveOrderingFor` routes `done` to `defaultOrderingFor` (the engine's own fallback), which
    // is a REAL answer, not the raw function's own abstention — established directly first, off
    // the SAME declaration the page reads, before trusting the DOM.
    const reading = resolveOrderingFor(
      VIEW.id, "done", SOURCE, 5, "- [ ] widget shipped edited",
      RESOLUTION.ordering, RESOLUTION.orderingFields, RESOLUTION.defaultOrdering, RESOLUTION.priorityRank,
    );
    assert.equal(reading.kind, "answer", "the page-level resolver must ANSWER here, not abstain the way the raw function does");
    assert.equal(reading.answer.moved, false, "a lone row has nothing to rank against — a real answer, not a guess");
  });

  test("THE GAP CLOSES, PART 2: a genuine default-ordering MOVE is narrated by the resolver for an undeclared section, on a config this app has never seen", async () => {
    // A LOCAL source, not the shared module-level SOURCE (whose 'done' carries only one row and so
    // can never demonstrate a rank change) — 'gentest_widget' has no due_date/priority default, so
    // two bare titles decide the order by the engine's own final tiebreak, title, ascending.
    // ALL THREE headings, in the view's own declared order — `sectionAt` resolves by ORDINAL
    // heading position within a view, not by heading TEXT (`address.ts`'s own model, the same
    // "ordinal 0 -> queue" convention `tests/app-ordering-note.test.mjs` documents) — a two-heading
    // fragment would put 'Done' at ordinal 0, resolving to 'queued' instead.
    const twoWidgetSource = [
      "## Queued",
      "## Done",
      "- [ ] zzz widget",
      "- [ ] aaa widget",
      "## Archived",
    ].join("\n");
    const { page } = await freshPage("gentest-ordering-default-moves", postStub());
    const commit = {
      lineIndex: 2, // "## Queued"=0, "## Done"=1, "zzz widget"=2
      // 'zzz' -> 'AAA': was rank 2 (behind 'aaa widget'), now rank 1 — uppercase sorts before
      // lowercase in codepoint order ('A' = 65 < 'a' = 97), the SAME rule the operator's own
      // measured inbox order follows.
      text: "- [ ] AAA widget",
      markdown: twoWidgetSource.replace("- [ ] zzz widget", "- [ ] AAA widget"),
      source: twoWidgetSource,
      kind: "set-line",
    };
    page.commitLine(VIEW, commit);
    assert.match(
      page.__orderingNoteFor(VIEW, commit),
      /this line will move within done/,
      "an undeclared section on a NEVER-SEEN config still places and narrates a real move — the operator's own acceptance criterion",
    );
  });

  test("THE GAP CLOSES, PART 3: a genuine ABSTENTION for an undeclared section is still visible through the ordering resolver, not silent", async () => {
    // 'archived' with an indented child — nested-section, the same refusal orderingFor's own
    // header already documents, now reachable for a section that declares no ordering at all.
    // ALL THREE headings, in order — see PART 2's own comment for why (`sectionAt` is ORDINAL).
    const nestedSource = [
      "## Queued",
      "## Done",
      "## Archived",
      "- [ ] widget old",
      "    - [ ] widget child, indented",
    ].join("\n");
    const { page } = await freshPage("gentest-ordering-default-abstains", postStub());
    const commit = {
      lineIndex: 3, // "## Queued"=0, "## Done"=1, "## Archived"=2, "widget old"=3
      text: "- [ ] widget old edited",
      markdown: "irrelevant",
      source: nestedSource,
      kind: "set-line",
    };
    assert.equal(page.__orderingDiagnosticFor(VIEW, commit), "ordering: abstained — nested-section");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. SECTION ADDRESSING — does the app know the three new sections at all, independent of whether
//    membership can judge each one. Proven for every insertion index across the whole new view.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. SECTION ADDRESSING — every insertion index of the brand-new view, including the unpublished section", { skip }, () => {
  test("every line of the new view addresses to the section it is actually under", () => {
    assert.deepEqual(
      QUALIFICATION.sectionOrder[VIEW.id],
      ["queued", "done", "archived"],
      "the view's own three sections, in the declared order",
    );
    const lines = SOURCE.split("\n");
    // 9 content lines (0-8, the last being the trailing blank every real rendered view ends with)
    // plus index 9 == lines.length, `o`'s own target on the trailing blank line — the exact
    // position `app-seed-from-cascade.test.mjs` was written to fix. `applyEdit`'s own range is
    // `lines.length` IN, `lines.length + 1` OUT (that suite's §2 "THE RANGE IS applyEdit's OWN"),
    // so this loop stops at `lines.length` rather than one past it.
    const expected = [null, "queued", "queued", "queued", "queued", "done", "done", "archived", "archived", "archived"];
    for (let at = 0; at <= lines.length; at += 1) {
      assert.equal(
        sectionForInsertAt(SOURCE, at, VIEW.id, QUALIFICATION.sectionOrder),
        expected[at],
        `insertion at ${at} addressed to the wrong section (or none)`,
      );
    }
  });

  test("`archived` addresses correctly even though its qualification was refused — addressing and membership are separate resolutions", () => {
    assert.equal(sectionAt(SOURCE, 7, VIEW.id, QUALIFICATION.sectionOrder), "archived");
    assert.equal(QUALIFICATION.sections[VIEW.id]?.archived, undefined, "archived should NOT be in the published (membership-answerable) table");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE NEGATIVE HALF — refused loudly, with a reason, never silently. AND: the refuted "WRONG"
//    candidate, reasoned through rather than asserted away.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. THE NEGATIVE HALF — a declaration the grammar cannot express lands in `refused`, visibly", { skip }, () => {
  test("`archived`'s qualification (references `project`, outside RESOLVABLE_FIELDS) is refused WITH a reason", () => {
    assert.equal(QUALIFICATION.refused["gentest-widgets-archived"], "unresolvable field(s): project");
  });

  test("nothing about `archived` being refused silently widened any OTHER gentest section's grammar", () => {
    assert.deepEqual(Object.keys(QUALIFICATION.predicates).filter((k) => k.startsWith("gentest")).sort(), [
      "gentest-widgets-done",
      "gentest-widgets-queued",
    ]);
  });
});

// No dedicated test for a "WRONG" answer: none was found, and one considered candidate (a
// child-traversing retype rule this generator's `readRetypeRules` cannot evaluate — the same
// mechanism `design-the-rule-mirror.md`'s 13/186 defect uses) was worked through by hand rather
// than encoded, and refuted: a freshly-typed line has no children yet, so a CHILD-traversing retype
// rule cannot fire at the instant `seedFor` seeds it, regardless of whether the generator can read
// that rule. The boundary this generator states for itself (DROP PATH 18 in
// generate-resolution-declaration.mjs — "this generator does not read, so whether it retypes a new
// line was not evaluated") is real, but it does not reach the seed for THIS shape of rule. A
// same-line `when:` retype (the shape `routine-without-cadence-becomes-task` actually is) is the
// shape that WOULD reach the seed, and that is exactly the shape `readRetypeRules` DOES evaluate —
// so the generator's own boundary and the class of rule that could make a seed wrong do not
// currently overlap for a brand-new node type either. This is reported as a refutation on purpose,
// not silently dropped: confirming it with certainty would need the real engine to run a rule
// against a graph, which is a cycle, which this branch does not run.

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. NOTHING LOCAL IS WRITTEN — the pinned write-site counts, re-verified for this file's own
//    gestures, the same posture every sibling suite in this family takes.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("6. NOTHING LOCAL IS WRITTEN beyond the seed characters and the stubbed POST bodies", { skip }, () => {
  const APP = readFileSync(join(REPO, "app", "index.html"), "utf8");
  const PAINT = readFileSync(join(REPO, "app", "present", "paint.ts"), "utf8");

  test("`graphData` is assigned in exactly four places — this file adds no client-computed write", () => {
    assert.equal((APP.match(/\bgraphData\s*=(?!=)/g) ?? []).length, 4);
  });

  test("`writeFile(` is called in exactly four places — this file adds no new write path", () => {
    // Declaration + toggleTask + commitLine's own attempt + commitLine's bounded rebase retry
    // (`app/present/rebase.ts`, `feat/a-refusal-rebases`) — one more OCCURRENCE, the same two
    // CALLERS. The retry reuses `writeFile` rather than opening a second write path.
    assert.equal((APP.match(/\bwriteFile\(/g) ?? []).length, 4);
  });

  test("`applyEdit(` is called in exactly three places in paint.ts and two in the page", () => {
    assert.equal((PAINT.match(/\bapplyEdit\(/g) ?? []).length, 3);
    assert.equal((APP.match(/\bapplyEdit\(/g) ?? []).length, 2);
  });

  test("`.markdown` is never assigned — the page reads the envelope and never rewrites it", () => {
    assert.deepEqual(APP.match(/\.markdown\s*=(?!=)/g), null);
    assert.deepEqual(PAINT.match(/\.markdown\s*=(?!=)/g), null);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7. STRUCTURAL — measured before this file's own widening: this suite exercised
//    `generate-qualification-declaration.mjs` and `generate-resolution-declaration.mjs` only.
//    `generate-structural-declaration.mjs` was never called from here, so a structural compiler
//    hardcoded to the operator's own edge types and view names could have merged green through
//    this file exactly the way `compile-capture-rules.mjs` did. This section closes that gap: a
//    brand-new edge type (`GENTEST_LINKS`, step 1 above) and a brand-new section-level override
//    (`queued`'s own `structural_edge_types`/`structural_edge_direction`, step 5 above) — read
//    correctly, with no hardcoded name.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("7. STRUCTURAL — a brand-new edge type and section override, read with no hardcoded name", { skip }, () => {
  test("the new edge type's cardinality is published, read off schema.yaml alone", () => {
    assert.equal(STRUCTURAL.edgeCardinality.GENTEST_LINKS, "many_to_many");
  });

  test("the new section's structural override is published, read off the view sheet alone", () => {
    assert.deepEqual(STRUCTURAL.sections["gentest-widgets"]?.queued, {
      edgeTypes: ["GENTEST_LINKS"],
      edgeDirection: "outgoing",
    });
  });

  test("nothing was dropped for this brand-new view — a well-formed override is not silently discarded", () => {
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(STRUCTURAL.dropped).filter(([what]) => what.includes("gentest")),
      ),
      {},
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 8. RULES CATEGORY — measured before this file's own widening: `generate-rules-declaration.mjs`
//    (and its retired predecessor, `generate-capture-rules-declaration.mjs`) was never called from
//    here either — which is exactly how a compiler naming two of the operator's own rule ids by
//    hand (`compile-capture-rules.mjs`, merged as PR #91) shipped through 1803 green tests. This
//    section closes that gap on the SAME never-seen config every other axis in this file proves
//    itself against: one single-action rule this grammar models (`gentest-widget-done-clears-
//    rank`), one MULTI-ACTION rule it now models too (`gentest-widget-done-relinks-and-notifies` —
//    the MULTIPLE-ACTIONS-PER-RULE widening this leg adds, ORDERED and `partial` because of its
//    `emit_event`), and one it does not model at all (`gentest-widget-cancelled-or-done`, an `in:`
//    predicate) — all three from step 6 above.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("8. RULES CATEGORY — an invented rule is published or dropped, with no hardcoded name", { skip }, () => {
  test("the single-action rule is published with the exact facts its YAML declares", () => {
    assert.deepEqual(RULES.rules["gentest-widget-done-clears-rank"], {
      pattern: "gentest-widgets-done",
      when: { op: "eq", field: "status", value: "done" },
      priority: 0,
      actions: [{ verb: "unset", field: "gentest_rank" }],
    });
  });

  test("the MULTI-ACTION rule publishes its actions IN THE CONFIG'S OWN ORDER, and is marked partial", () => {
    // `set_field` THEN `unset_field` — the YAML's own declared order (step 6 above) — with the
    // `emit_event` recognised and excluded, never faked, and named by `partial: true` rather than
    // silently dropped or silently treated as the rule's whole effect.
    assert.deepEqual(RULES.rules["gentest-widget-done-relinks-and-notifies"], {
      pattern: "gentest-widgets-done",
      when: { op: "eq", field: "status", value: "done" },
      priority: 0,
      actions: [
        { verb: "set", field: "domain", to: "qntm" },
        { verb: "unset", field: "gentest_rank" },
      ],
      partial: true,
    });
  });

  test("the unmodelled rule ('in:') is dropped, visibly, with a reason naming the operator it used", () => {
    assert.match(RULES.dropped["rule 'gentest-widget-cancelled-or-done'"], /operator 'in'/);
  });

  test("both modelled rules take their place in the published fire order; the unmodelled one does not", () => {
    assert.ok(RULES.order.sequence.includes("gentest-widget-done-clears-rank"));
    assert.ok(RULES.order.sequence.includes("gentest-widget-done-relinks-and-notifies"));
    assert.ok(!RULES.order.sequence.includes("gentest-widget-cancelled-or-done"));
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 9. THE REGRESSION PROOF — the ORIGINAL COUPLED SHAPE, reproduced and run against THIS config,
//    to show it would NOT have found the rule §8 just proved the widened compiler finds. This is
//    the mutation the task asks for: "reintroduce a hardcoded rule id and confirm the gate goes
//    red." `compile-capture-rules.mjs` (retired, PR #91) is gone from the tree, so its algorithm is
//    reproduced here verbatim in miniature — two named files, two named rule ids — rather than
//    imported, and driven against the exact scratch config every other section in this file uses.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("9. THE REGRESSION PROOF — the retired coupled compiler, reproduced, goes red on this config", { skip }, () => {
  /** `compile-capture-rules.mjs`'s own algorithm, miniaturised: two hardcoded file keys, two
   * hardcoded rule ids. Throws if either file is absent — the coupling the task names verbatim:
   * "Point it at any other operator's config and it sees nothing." */
  function hardcodedCoupledCompile(configDir) {
    const CADENCE_KEY = "rules/cadence_auto_routine.yaml";
    const STAMP_KEY = "rules/stamp_created_at.yaml";
    const HARDCODED_IDS = ["routine-without-cadence-becomes-task", "stamp-created-at-on-task"];
    for (const key of [CADENCE_KEY, STAMP_KEY]) {
      const path = join(configDir, ...key.split("/"));
      if (!existsSync(path)) {
        throw new Error(`${key} does not exist — this coupled shape only ever reads two named files`);
      }
    }
    return HARDCODED_IDS; // the only two rule ids this shape could ever name, by construction
  }

  test("the coupled shape's two files exist (this scratch config is a full copy of the real one)", () => {
    assert.doesNotThrow(() => hardcodedCoupledCompile(join(scratchRoot, "config")));
  });

  test("RED: the coupled shape cannot see the brand-new rule §8 proved the widened compiler publishes", () => {
    const foundByCoupledShape = hardcodedCoupledCompile(join(scratchRoot, "config"));
    assert.ok(
      !foundByCoupledShape.includes("gentest-widget-done-clears-rank"),
      "the coupled shape can only ever name two hardcoded ids, by construction",
    );
  });

  test("GREEN: the widened compiler publishes it — the same config, the two outcomes differ", () => {
    assert.ok("gentest-widget-done-clears-rank" in RULES.rules);
  });

  test("RED, THE OTHER WAY: point the coupled shape at a config that renamed its two files and it THROWS", () => {
    // The task's own framing, proven directly: "Point it at any other operator's config and it
    // sees nothing." A renamed rules/ directory is exactly that — a different operator's instance.
    const renamed = mkdtempSync(join(tmpdir(), "gentest-renamed-config-"));
    try {
      mkdirSync(join(renamed, "rules"), { recursive: true });
      writeFileSync(join(renamed, "rules", "my_own_rules.yaml"), "- id: whatever-i-called-it\n  for_each: {pattern: tasks}\n  actions: [{verb: set_field, node_id: $current.node.id, field: x, value: 1}]\n");
      // The widened compiler's PASS 2 (compile-rules.mjs, "RESOLVE for_each.pattern") needs the
      // NAMED pattern to be resolvable — the same genericity claim this section is proving, one
      // level deeper: `patterns/` is read the same way for ANY operator's instance, no file name
      // baked in, so a renamed pattern FILE (not just a renamed rule file) is understood too.
      mkdirSync(join(renamed, "patterns"), { recursive: true });
      writeFileSync(join(renamed, "patterns", "my_own_patterns.yaml"), "tasks:\n  root:\n    find:\n      node_type: task\n");
      assert.throws(() => hardcodedCoupledCompile(renamed), /does not exist/);
      // The widened compiler, pointed at the SAME renamed config, sees it — no file name is baked in.
      const widened = generateRules(renamed, new Ledger());
      assert.ok("whatever-i-called-it" in widened.rules);
    } finally {
      rmSync(renamed, { recursive: true, force: true });
    }
  });
});

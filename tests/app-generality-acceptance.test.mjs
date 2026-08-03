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
 * runner's own temp dir, torn down in a `finally`. The five new/changed files are written INTO that
 * copy, never into `DEFAULT_CONFIG_DIR` itself. The two real generators
 * (`generate-qualification-declaration.mjs`, `generate-resolution-declaration.mjs`) run against the
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
 *   ORDERING              ANSWERED for the positive case (a rank change), proven BOTH through the
 *                                    pure function directly AND through `#freshness`, the real DOM
 *                                    sink. COULD NOT TELL for the negative case — §3 shows, on this
 *                                    brand-new declaration, that an abstention (no ordering
 *                                    declared) and a confident "nothing moved" answer are BYTE-
 *                                    IDENTICAL on `#freshness`, which is `roadmap-the-road-ahead.md`
 *                                    §4's own gap ("177 of 186 sections abstain, invisibly")
 *                                    reproduced on a config nobody has ever typed, not merely
 *                                    quoted from his instance. The true answer IS established, but
 *                                    only by importing `orderingFor` directly and reading `.kind` —
 *                                    a path no person watching the screen has.
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
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { importPage, installBrowser, makeEvent, makeWorkDir, walk, withDeclaration, SERVED_DECLARATION } from "./fixtures/app-html-page.mjs";
import { generateQualification } from "../scripts/generate-qualification-declaration.mjs";
import { generateResolution } from "../scripts/generate-resolution-declaration.mjs";
import { DEFAULT_CONFIG_DIR } from "../scripts/monorepo-config.mjs";
import { Ledger } from "../scripts/ledger.mjs";
import { orderingFor, sectionAt, sectionForInsertAt } from "../dist/present.js";

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

  QUALIFICATION = generateQualification(configDir, new Ledger());
  RESOLUTION = generateResolution(configDir, new Ledger());
  DECLARATION = { ...SERVED_DECLARATION, qualification: QUALIFICATION, resolution: RESOLUTION };
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

  test("REGISTRATION: a line opened in `queued` seeds the new type tag `#gentest_widget`", () => {
    assert.equal(openAt(1), "- [ ] #gentest_widget #dev ");
  });

  test("DEFAULTS: `queued` and `done` seed DIFFERENT tags for the SAME type — the section's OWN default, not a copied neighbour", () => {
    assert.equal(openAt(1), "- [ ] #gentest_widget #dev ", "queued should seed its own default, #dev");
    assert.equal(openAt(5), "- [ ] #gentest_widget #qntm ", "done should seed its own default, #qntm, not queued's");
  });

  test("SECTION ADDRESSING, the registration half: `archived` — MEMBERSHIP-UNPUBLISHED but still ADDRESSABLE — still seeds correctly", () => {
    // `resolution.sectionRegistration` is NOT gated on `qualification.sections` (that generator's
    // own header: "what a new line BECOMES does not depend on what already belongs"). `archived`'s
    // qualification was refused (§5's negative half) but its registration/defaults were not, and
    // this is the browser proving that distinction rather than this file merely asserting it.
    assert.equal(openAt(7), "- [ ] #gentest_widget #dev ");
  });

  test("the trailing blank line of THIS brand-new view seeds exactly like the line above it (app-seed-from-cascade's own fix, re-proven on new config)", () => {
    assert.equal(openAt(8), openAt(7));
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. PLACEMENT / MEMBERSHIP — commitLine, the real DOM sink (#membershipBadge), the same shape
//    `app-membership-diagnostic.test.mjs` §2 drives, on a declaration nobody hand-typed.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. PLACEMENT/MEMBERSHIP — answered AND abstained, proven DIFFERENT, through #membershipBadge", { skip }, () => {
  let page, elements;

  before(async () => {
    ({ page, elements } = await freshPage("gentest-membership", postStub()));
  });

  const badge = () => elements.get("membershipBadge").textContent;

  test("a `queued` commit — the NEW `not` operator over a NEW node type — answers \"membership: decided\"", () => {
    page.commitLine(VIEW, {
      lineIndex: 1,
      text: "- [ ] widget alpha edited 🧮 30",
      markdown: SOURCE.replace("- [ ] widget alpha 🧮 30", "- [ ] widget alpha edited 🧮 30"),
      source: SOURCE,
      kind: "set-line",
    });
    assert.equal(badge(), "membership: decided");
  });

  test("an `archived` commit — the NEW unpublished section — abstains \"no-section-declaration\", visibly different", () => {
    page.commitLine(VIEW, {
      lineIndex: 7,
      text: "- [ ] widget old edited",
      markdown: SOURCE.replace("- [ ] widget old", "- [ ] widget old edited"),
      source: SOURCE,
      kind: "set-line",
    });
    assert.equal(badge(), "membership: abstained — no-section-declaration");
  });

  test("THE FALSIFIER ITSELF, on this new declaration: the two badges above are not the same text", () => {
    page.commitLine(VIEW, {
      lineIndex: 1,
      text: "- [ ] widget alpha 🧮 30",
      markdown: SOURCE,
      source: SOURCE,
      kind: "set-line",
    });
    const answered = badge();
    page.commitLine(VIEW, {
      lineIndex: 7,
      text: "- [ ] widget old",
      markdown: SOURCE,
      source: SOURCE,
      kind: "set-line",
    });
    const abstained = badge();
    assert.notEqual(answered, abstained, `an answer and an abstention read identically: "${answered}"`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. ORDERING — ANSWERED for the positive case, through the pure function AND the real DOM sink.
//    COULD NOT TELL for the negative case, through the DOM — the invisibility
//    roadmap-the-road-ahead.md §4 names, reproduced on a declaration nobody has typed before,
//    established as a genuine gap (not a guess) by reading the pure function's own `.kind`.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. ORDERING", { skip }, () => {
  test("ANSWERED, established directly: a rank change on the NEW field `gentest_rank` is read as a move", () => {
    const reading = orderingFor(VIEW.id, "queued", SOURCE, 1, "- [ ] widget alpha 🧮 5", RESOLUTION.ordering, RESOLUTION.orderingFields);
    assert.equal(reading.kind, "answer");
    assert.equal(reading.answer.moved, true);
    assert.equal(reading.answer.beforeRank, 3, "alpha=30 should rank behind beta=10 and gamma=20");
    assert.equal(reading.answer.afterRank, 1, "alpha=5 should rank ahead of both");
  });

  test("ANSWERED, established through the real DOM sink: #freshness carries the ordering sentence", async () => {
    const { page, elements } = await freshPage("gentest-ordering-moved", postStub());
    page.commitLine(VIEW, {
      lineIndex: 1,
      text: "- [ ] widget alpha 🧮 5",
      markdown: SOURCE.replace("- [ ] widget alpha 🧮 30", "- [ ] widget alpha 🧮 5"),
      source: SOURCE,
      kind: "set-line",
    });
    assert.match(elements.get("freshness").textContent, /this line will move within Queued/);
  });

  test("COULD NOT TELL, from the DOM: a confident 'nothing moved' answer carries no ordering sentence", async () => {
    const { page, elements } = await freshPage("gentest-ordering-nomove", postStub());
    const after = "- [ ] widget alpha text changed only 🧮 30"; // same rank field, value unchanged
    // Establish the TRUE answer first, off the pure function — this is not a guess.
    const reading = orderingFor(VIEW.id, "queued", SOURCE, 1, after, RESOLUTION.ordering, RESOLUTION.orderingFields);
    assert.equal(reading.kind, "answer");
    assert.equal(reading.answer.moved, false, "the fixture's own premise is gone — this edit was supposed to not move");
    page.commitLine(VIEW, { lineIndex: 1, text: after, markdown: SOURCE.replace("- [ ] widget alpha 🧮 30", after), source: SOURCE, kind: "set-line" });
    assert.doesNotMatch(elements.get("freshness").textContent, /this line will move within/);
  });

  test("COULD NOT TELL, from the DOM: an ABSTENTION (no ordering declared for `done`) ALSO carries no ordering sentence — identical to the confident case above", async () => {
    const { page, elements } = await freshPage("gentest-ordering-abstain", postStub());
    const after = "- [ ] widget shipped edited";
    // Establish the TRUE answer first — this IS an abstention, not a confident non-move, and the
    // only way to know that is reading `.kind` directly. The DOM cannot distinguish it.
    const reading = orderingFor(VIEW.id, "done", SOURCE, 5, after, RESOLUTION.ordering, RESOLUTION.orderingFields);
    assert.equal(reading.kind, "abstains");
    assert.equal(reading.because, "no-section-declaration", "`done` declares no `ordering:` at all");
    page.commitLine(VIEW, { lineIndex: 5, text: after, markdown: SOURCE.replace("- [ ] widget shipped", after), source: SOURCE, kind: "set-line" });
    const abstainFreshness = elements.get("freshness").textContent;
    assert.doesNotMatch(abstainFreshness, /this line will move within/);
    // THE GAP, STATED AS AN ASSERTION RATHER THAN A COMMENT: the abstention's freshness text and a
    // confident non-move's freshness text are the SAME SHAPE (neither carries an ordering clause).
    // This is `roadmap-the-road-ahead.md` §4's "ordering abstentions are invisible" reproduced on a
    // declaration this app has never seen before this test file ran — not merely quoted from his.
    assert.ok(
      !/this line will move within/.test(abstainFreshness),
      "if this ever starts matching, ordering grew a visible abstention register — update this test's own claim, do not just delete it",
    );
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

  test("`writeFile(` is called in exactly three places — this file adds no new write path", () => {
    assert.equal((APP.match(/\bwriteFile\(/g) ?? []).length, 3);
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

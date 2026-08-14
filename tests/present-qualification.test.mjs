/**
 * THE QUALIFICATION DECLARATION, PUBLISHED AND READ.
 *
 *   node --test tests/present-qualification.test.mjs
 *
 * Four claims, four sections:
 *
 *   1. THE SHIPPED DECLARATION READS CLEANLY, against `dist/present.js` — the artifact the browser
 *      loads, not the sources — the same posture `tests/present-structural.test.mjs` takes.
 *   2. A MALFORMED DECLARATION IS REPORTED, NEVER GUESSED. The one asymmetry with the structural
 *      reader is deliberate and is asserted here: a partially-readable predicate drops its WHOLE
 *      pattern, because a conjunction with a conjunct missing matches MORE nodes than the config
 *      says, and a wrong answer under the operator's cursor is worse than no answer.
 *   3. THE SERVED VALUE IS WHAT THE MONOREPO'S CONFIG ACTUALLY DECLARES — generated, not
 *      transcribed. Skipped, loudly, when the monorepo is not checked out; CI does not clone it.
 *   4. THE FALSIFIER. Change the qualification in a SCRATCH COPY of the config and the app's answer
 *      changes with it. If it did not, the app would not be reading the declaration — it would be
 *      holding a copy, which is the defect this whole line of work exists to remove. Two mutations
 *      are made, at the two places a config change can reach: the PATTERN's own predicate, and the
 *      SECTION's choice of which pattern to use.
 */

import { test, describe } from "node:test";
import { ledgerIsPresent, readLedger } from "../scripts/dropped-ledger.mjs";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readQualificationDeclaration,
  readDeclaration,
  membershipFor,
  presentationFromDeclaration,
} from "../dist/present.js";
import {
  generateQualification,
  DEFAULT_CONFIG_DIR,
} from "../scripts/generate-qualification-declaration.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PRESENTATION_PATH = resolve(HERE, "..", "presentation.json");
const SERVED = JSON.parse(readFileSync(PRESENTATION_PATH, "utf8"));
/**
 * THE SERVED SHAPE PLUS ITS SIBLING LEDGER — what the committed PAIR declares, not half of it.
 *
 * `presentation.json` used to carry its own `dropped` map. The four generators now write it to
 * `presentation-dropped.json` instead, so the served file alone no longer holds everything the
 * generator produced. Comparing against the served half ALONE would go green the day a ledger
 * silently stopped being written — the thing that stopped being written would simply be absent
 * from both sides of the assertion, which is the failure the ledger move was made to avoid one
 * layer down (`scripts/dropped-ledger.mjs`: every reader spells it `?.dropped ?? {}`, so a
 * missing ledger reads as "nothing was dropped" rather than throwing).
 *
 * So this reconstitutes the pair and compares THAT. It asserts two things at once: the served
 * declaration still matches a fresh compile, AND no drop was lost in the move.
 *
 * IT WORKS BEFORE AND AFTER THE REGENERATION, deliberately, because today it runs before.
 * `presentation.json` still holds its own `dropped` and the sibling does not exist; `readLedger`
 * returns `{}` for an absent file, this returns `served` untouched, and the assertion is
 * byte-identical to the one it replaces. After the next regeneration the served half loses
 * `dropped`, the sibling supplies it, and the same line keeps asserting the same total.
 */
function servedWithLedger(key, served) {
  // THE SWITCH IS THE FILE'S ABSENCE, NOT THE LEDGER'S EMPTINESS, and the difference is a real
  // one this file got wrong first time round. `structural`'s ledger is legitimately EMPTY — it
  // drops nothing. Short-circuiting on `Object.keys(ledger).length === 0` therefore returned the
  // served half untouched for structural even AFTER the regeneration, at which point the served
  // half has no `dropped` key at all while a fresh compile has `dropped: {}` — and the assertion
  // fails on a key nobody changed. `ledgerIsPresent` is in `dropped-ledger.mjs` for exactly this
  // distinction: "the file is gone" and "the file says nothing was dropped" are different facts.
  if (!ledgerIsPresent(PRESENTATION_PATH)) return served;
  return { ...served, dropped: { ...(served?.dropped ?? {}), ...readLedger(PRESENTATION_PATH, key) } };
}


/** The operator's own example: a bare line typed under "Domain Empty" in `inbox.md`. */
const BARE_LINE = "- [ ] Ring the dentist";
const TAGGED_LINE = "- [ ] Ring the dentist #work";

describe("1. the shipped declaration reads cleanly", () => {
  test("`qualification` parses with no problems reported", () => {
    const { qualification, problems } = readQualificationDeclaration(SERVED);
    assert.deepEqual(problems, [], "the served qualification declaration reported problems");
    assert.ok(Object.keys(qualification.predicates).length > 0, "no predicates were published");
    assert.equal(typeof qualification.defaultNodeType, "string");
  });

  test("`declaration.ts` does not report it as an unknown key", () => {
    // The rendition reader validates every top-level key it does not recognise. A new key added to
    // the served document without teaching that reader to skip it would turn the whole declaration
    // into a reported problem — silence is legal, but a stray key is not silence.
    const { problems } = readDeclaration(SERVED);
    assert.deepEqual(problems, [], "the rendition reader objected to the served document");
  });

  test("inbox's two sections are both published, and both name their pattern", () => {
    const { qualification } = readQualificationDeclaration(SERVED);
    const inbox = qualification.sections["inbox"];
    assert.ok(inbox, "the inbox view is absent from the published sections");
    assert.equal(inbox["domain-empty"].qualification, "domain-empty");
    assert.equal(inbox["inbox-tagged"].qualification, "inbox-items");
    // design-the-resolution-architecture.md step 4 says a section's OWN WORDS, never its id —
    // published beside the qualification rather than left for a caller to reformat the id itself.
    assert.equal(inbox["domain-empty"].name, "Domain Empty");
    assert.equal(inbox["inbox-tagged"].name, "Inbox");
    // No `default_node_type` in inbox.yaml and no section `defaults:` — so both fall through to
    // the GLOBAL registration rung, which is what makes a bare line there a task.
    assert.equal(inbox["domain-empty"].nodeType, qualification.defaultNodeType);
    assert.equal(inbox["domain-empty"].defaults, undefined);
  });

  test("every published section names a predicate that was published", () => {
    const { qualification } = readQualificationDeclaration(SERVED);
    for (const [viewId, sections] of Object.entries(qualification.sections)) {
      for (const [sectionId, section] of Object.entries(sections)) {
        assert.ok(
          section.qualification in qualification.predicates,
          `${viewId}.${sectionId} names '${section.qualification}', which was not published`,
        );
      }
    }
  });

  test("what was refused is recorded with a reason, not dropped in silence", () => {
    // 2026-08-06 (job 1, "the last fourteen"): the operator's real config now REFUSES ZERO
    // referenced qualifications — the widened operator/cycle-variable/extraction-hint grammar
    // closed every one of the 14 that used to land here. That is this config's own true count
    // today, not a broken assumption: `project`/`stage` (unresolvable-field) and a two-hop
    // traversal both still refuse in this grammar, they simply are not REFERENCED by any section
    // today — `tests/app-generality-acceptance.test.mjs` pins the `project` refusal directly
    // against `normalisePattern`, unaffected by which patterns a section happens to reference.
    // The invariant THIS test exists to pin — a refusal always carries a reason, and refused and
    // published are disjoint — is checked against whatever the shipped declaration's `refused`
    // holds today (0 or more), plus a hand-built refusal the reader must still shape correctly.
    const { qualification: served } = readQualificationDeclaration(SERVED);
    for (const [name, reason] of Object.entries(served.refused)) {
      assert.ok(reason.length > 0, `'${name}' was refused with an empty reason`);
      assert.ok(
        !(name in served.predicates),
        `'${name}' is both refused and published — the two halves disagree`,
      );
    }
    const { qualification: handBuilt } = readQualificationDeclaration({
      qualification: { refused: { "unresolvable-example": "unresolvable field(s): project" } },
    });
    assert.deepEqual(handBuilt.refused, { "unresolvable-example": "unresolvable field(s): project" });
  });
});

describe("1a. sectionOrder — the FULL declared order, published beside the published subset", () => {
  // design-the-resolution-architecture.md step 1, and the trap step 1 exists to close: the
  // published predicate table (`sections`, above) is a proper SUBSET of the declared sections in
  // 2 of 27 published views. `sectionOrder` is the join `app/present/address.ts`'s `sectionAt`
  // indexes — the FULL order, unfiltered — and this section pins the numbers that make the trap
  // real, not hypothetical.
  test("inbox: the full order matches its two real sections, in declared order", () => {
    const { qualification } = readQualificationDeclaration(SERVED);
    assert.deepEqual(qualification.sectionOrder["inbox"], ["inbox-tagged", "domain-empty"]);
  });

  test("daily-work: 5 declared, all 5 now published — sectionOrder and sections agree", () => {
    // RESTATED 2026-08-04, the one-hop `children:`/`parents:` widening
    // (`compile-qualification.mjs`'s `normaliseEdgeStep`): `waiting` joined `in-progress` in
    // `sections` because its own qualification is a one-hop edge-existence test, which this
    // generator now normalises instead of refusing outright. `sectionOrder` itself is untouched —
    // it was always the full declared order, and still is.
    //
    // RESTATED AGAIN 2026-08-06: `urgent` joined too — `deriveResolvableFields` (`compile-
    // qualification.mjs`'s header) admits `priority` (a fixed-value vocabulary token, `markers
    // .yaml`'s 🔽/⏫/📌), which `urgent`'s own qualification predicate ranges over.
    //
    // RESTATED A THIRD TIME 2026-08-06 (job 1, "the last fourteen"): `due-today` joined too —
    // `due-soon-tasks` (this section's own qualification) compares `due_date` against
    // `$cycle_today`, closed by the widened operator/cycle-variable/extraction-hint grammar. All 5
    // of the view's declared sections are now published; `sectionOrder` and `sections` agree.
    const { qualification } = readQualificationDeclaration(SERVED);
    assert.deepEqual(
      qualification.sectionOrder["daily-work"],
      ["in-progress", "urgent", "due-today", "waiting", "capture"],
    );
    assert.deepEqual(
      Object.keys(qualification.sections["daily-work"]),
      ["in-progress", "urgent", "due-today", "waiting", "capture"],
    );
  });

  test("daily-personal: 8 declared, all 8 now published — sectionOrder and sections agree", () => {
    // RESTATED 2026-08-04 — see the `daily-work` test above for why the published count moved.
    // RESTATED AGAIN 2026-08-06 — 5 -> 6, the same `priority` widening `daily-work`'s own restated
    // comment names.
    // RESTATED A THIRD TIME 2026-08-06 (job 1, "the last fourteen"): 6 -> 8 — `due-soon` and
    // `capture` (`due-soon-tasks`/`captured-today`, both cycle-variable-bound) are the two that
    // closed here; see the `daily-work` test above for the same widening.
    const { qualification } = readQualificationDeclaration(SERVED);
    assert.equal(qualification.sectionOrder["daily-personal"].length, 8);
    assert.equal(Object.keys(qualification.sections["daily-personal"]).length, 8);
  });

  test("every published section's id also appears in its view's full order", () => {
    // sectionOrder is a SUPERSET of sections' keys, per view — never disjoint, never a stray id.
    const { qualification } = readQualificationDeclaration(SERVED);
    for (const [viewId, sections] of Object.entries(qualification.sections)) {
      for (const sectionId of Object.keys(sections)) {
        assert.ok(
          (qualification.sectionOrder[viewId] ?? []).includes(sectionId),
          `${viewId}.${sectionId} is published but absent from its own view's sectionOrder`,
        );
      }
    }
  });

  test("STEP 1's OWN FALSIFIER, restated: sectionOrder's length per view is >= its published count", () => {
    const { qualification } = readQualificationDeclaration(SERVED);
    for (const [viewId, sections] of Object.entries(qualification.sections)) {
      const order = qualification.sectionOrder[viewId] ?? [];
      assert.ok(
        order.length >= Object.keys(sections).length,
        `${viewId}: sectionOrder has fewer entries than the published subset — impossible if ` +
          "sectionOrder is truly the SUPERSET",
      );
    }
  });
});

describe("1b. STEP 3's FALSIFIER — readQualificationDeclaration is wired into the app's ONE reader", () => {
  test("presentationFromDeclaration(SERVED)'s shape carries the qualification axis", () => {
    // NAMED FOR THE DOCUMENT, NOT FOR A CONSTANT THAT NO LONGER EXISTS. It read
    // `EMBEDDED_DECLARATION` in the title while reading `SERVED` in the body; the constant is gone
    // with app/present/embedded-declaration.ts (design-config-is-content.md step 2) and `SERVED` —
    // presentation.json off disk — is what it always actually asserted on.
    // Before this change, `presentationFromDeclaration` (app/present/context.ts) called
    // `readDeclaration` and `readStructuralDeclaration` only — `readQualificationDeclaration` had
    // no production caller, only tests called it directly. This is the falsifier that it now does.
    // RESTATED 2026-08-03: predicates 43 -> 64, sections 27 -> 32, when `presentation.json` was
    // regenerated from monorepo `d4c9d98`. RESTATED AGAIN 2026-08-04: predicates 64 -> 88, sections
    // 32 -> 51 — `compile-qualification.mjs`'s one-hop `children:`/`parents:` widening
    // (`normaliseEdgeStep`) resolved 19 patterns that were previously refused for "traverses an
    // edge", each covering one or more sections across several views.
    //
    // RESTATED AGAIN 2026-08-06: predicates 88 -> 112, views-with-a-published-section 51 -> 57.
    // `RESOLVABLE_FIELDS` stopped being the frozen `["node_type", "domain", "status"]` and became
    // `deriveResolvableFields`'s own measurement of the real config (18 fields) — see `compile-
    // qualification.mjs`'s header.
    //
    // RESTATED A THIRD TIME, SAME DAY: predicates 112 -> 178, views-with-a-published-section 57 ->
    // 80. Resolvability became a CASCADE WALK, not a line-rung-only token lookup — a pattern
    // referencing a field fixed by every section that registers it (`project`, `stage` — no
    // vocabulary token, but a section-level `defaults:` in every real config site) is admitted too.
    // `deriveStructuralFieldsByQualification` (`compile-qualification.mjs`) is the second rung; see
    // that function's own header for the mechanism and the soundness argument.
    //
    // RESTATED A FOURTH TIME 2026-08-06 (job 1, "the last fourteen"): predicates 178 -> 192,
    // views-with-a-published-section 80 -> 83. The 14 remaining refusals — `available_date`/
    // `due_date`/`created_at` compared against `$cycle_today`/`$cycle_week_end` (`gt`/`lt`/
    // `gte`+`lte`, or a bare cycle-variable `eq`) — all closed: the operator grammar admits
    // `gt`/`gte`/`lt`/`lte` as a CLASS over the candidate's own fields, the day boundary already
    // published (`resolution.dayBoundary`) resolves the cycle variable at evaluation time (never
    // baked in at generation time, so it never goes stale), and a NEW fourth field-resolvability
    // rung (`deriveExtractionHintFields`) reads a glyph's varying trailing value the same way
    // `arrange/ordering.ts` already does for ordering. The counts are a census of HIS config and
    // this generator's grammar, not a property of this wiring. What this test actually falsifies —
    // that `presentationFromDeclaration` carries the qualification axis at all — is unchanged, and
    // `problems` is still empty.
    const declared = presentationFromDeclaration(SERVED);
    assert.equal(Object.keys(declared.qualification.predicates).length, 192);
    assert.equal(Object.keys(declared.qualification.sections).length, 83);
    assert.deepEqual(declared.problems, [], "wiring qualification in introduced a reported problem");
  });

  test("a document with no qualification key at all still wires cleanly — silence, not a crash", () => {
    const declared = presentationFromDeclaration({ checkbox: "wired" });
    assert.deepEqual(declared.qualification.predicates, {});
    assert.deepEqual(declared.qualification.sectionOrder, {});
  });
});

describe("2. a malformed declaration is reported, never guessed", () => {
  const read = (qualification) => readQualificationDeclaration({ qualification });

  test("no `qualification` key at all is silence, not a problem", () => {
    const { qualification, problems } = readQualificationDeclaration({ checkbox: "wired" });
    assert.deepEqual(problems, []);
    assert.deepEqual(qualification.predicates, {});
    assert.deepEqual(qualification.sections, {});
  });

  test("an unrecognised top-level key is reported and NOT applied", () => {
    const { problems } = read({ predicates: {}, sectons: {} });
    assert.ok(problems.some((p) => p.includes("sectons")), problems.join("\n"));
  });

  test("an unknown predicate operator is reported and the pattern is dropped", () => {
    // `gt` moved OUT of this example 2026-08-06 (job 1, "the last fourteen") — it is now a
    // recognised comparison operator (`docs/architecture/operator-set.json`'s own widening), so
    // `{domain: {gt: "x"}}` is no longer a shape this reader refuses. `ne` is not, and matches no
    // grammar this reader or the engine's ever admitted — see `tests/operator-set-agreement
    // .test.mjs`'s own `NON_OPERATORS` for the same fabricated-decoy reasoning.
    const { qualification, problems } = read({
      predicates: { p: { find: { nodeType: null, fields: { domain: { ne: "x" } } } } },
    });
    assert.ok(problems.some((p) => p.includes("ne")), problems.join("\n"));
    assert.deepEqual(qualification.predicates, {}, "a pattern with a bad operator was published");
  });

  test("ONE unreadable field predicate drops the WHOLE pattern, not just that field", () => {
    // The asymmetry with `structural.ts`, asserted rather than described. `{domain: eq null}` alone
    // matches every undomained node of any status; the `status` conjunct is what narrows it. Keep
    // the readable half and the app would claim membership for done captures the engine excludes.
    const { qualification } = read({
      predicates: {
        p: {
          find: {
            nodeType: null,
            fields: { domain: { eq: null }, status: { nonsense: 1 } },
          },
        },
      },
    });
    assert.deepEqual(qualification.predicates, {}, "a partially-read conjunction was published");
  });

  test("ONE unreadable exclusion drops the whole pattern too", () => {
    // A dropped exclusion ADMITS what the engine excludes — structural chrome, done captures — so
    // it fails in the same direction as a dropped conjunct and is refused the same way.
    const { qualification } = read({
      predicates: {
        p: { find: { nodeType: ["task"], fields: {} }, exclude: [{ nodeType: 7, fields: {} }] },
      },
    });
    assert.deepEqual(qualification.predicates, {});
  });

  test("a section naming an unpublished predicate is reported and dropped", () => {
    const { qualification, problems } = read({
      predicates: {},
      sections: { inbox: { "domain-empty": { qualification: "gone", nodeType: "task" } } },
    });
    assert.ok(problems.some((p) => p.includes("gone")), problems.join("\n"));
    assert.deepEqual(qualification.sections, {});
  });

  test("a `qualification` key of the wrong shape blinds the reader loudly, not silently", () => {
    const { qualification, problems } = readQualificationDeclaration({ qualification: [] });
    assert.equal(problems.length, 1);
    assert.deepEqual(qualification.predicates, {});
  });

  test("sectionOrder of the wrong shape is reported and stays empty, other keys unaffected", () => {
    const { qualification, problems } = read({ predicates: {}, sectionOrder: "not-an-object" });
    assert.deepEqual(qualification.sectionOrder, {});
    assert.ok(problems.some((p) => p.includes("sectionOrder")), problems.join("\n"));
  });

  test("one view's malformed order is reported and dropped; another view's survives", () => {
    const { qualification, problems } = read({
      predicates: {},
      sectionOrder: { good: ["a", "b"], bad: [1, 2] },
    });
    assert.deepEqual(qualification.sectionOrder.good, ["a", "b"]);
    assert.deepEqual(qualification.sectionOrder.bad, []);
    assert.ok(problems.some((p) => p.includes("sectionOrder.bad")), problems.join("\n"));
  });
});

const monorepo = existsSync(DEFAULT_CONFIG_DIR);
const skip = monorepo ? false : `monorepo not checked out at ${DEFAULT_CONFIG_DIR}`;

describe("3. the served value is what the monorepo's config actually declares", () => {
  test("generating from the monorepo's YAML reproduces presentation.json's qualification key", { skip }, () => {
    assert.deepEqual(
      servedWithLedger("qualification", SERVED.qualification),
      generateQualification(DEFAULT_CONFIG_DIR),
      "presentation.json's 'qualification' key is STALE — run " +
        "'node scripts/generate-qualification-declaration.mjs' and commit the result",
    );
  });
});

describe("4. the falsifier: the app's answer follows the config, because it reads it", () => {
  /** Copy the real config somewhere writable, mutate it, and generate from the copy. */
  const withMutatedConfig = (mutate) => {
    const scratch = mkdtempSync(join(tmpdir(), "qualification-falsifier-"));
    try {
      const configDir = join(scratch, "config");
      cpSync(DEFAULT_CONFIG_DIR, configDir, { recursive: true });
      mutate(configDir);
      return readQualificationDeclaration({ qualification: generateQualification(configDir) })
        .qualification;
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  };

  const belongs = (language, line) => {
    const reading = membershipFor("inbox", "domain-empty", line, language);
    assert.equal(reading.kind, "answer", `abstained: ${reading.because}`);
    return reading.answer.belongs;
  };

  test("BASELINE: against the real config, a bare line belongs and a #work line does not", { skip }, () => {
    const { qualification } = readQualificationDeclaration(SERVED);
    assert.equal(belongs(qualification, BARE_LINE), true);
    assert.equal(belongs(qualification, TAGGED_LINE), false);
  });

  test("MUTATE THE PATTERN: domain-empty asks for domain=work, and the answers INVERT", { skip }, () => {
    const language = withMutatedConfig((configDir) => {
      const path = join(configDir, "patterns", "domain_empty.yaml");
      const mutated = readFileSync(path, "utf8").replace("domain: null", "domain: work");
      assert.ok(mutated.includes("domain: work"), "the falsifier's own edit did not apply");
      writeFileSync(path, mutated);
    });
    // Exactly reversed from the baseline above. Nothing in `app/` changed between the two runs;
    // only the config the declaration was generated from did.
    assert.equal(belongs(language, BARE_LINE), false, "the app ignored the mutated predicate");
    assert.equal(belongs(language, TAGGED_LINE), true, "the app ignored the mutated predicate");
  });

  test("MUTATE THE SECTION: point domain-empty at inbox-items, and the answer follows", { skip }, () => {
    const language = withMutatedConfig((configDir) => {
      const path = join(configDir, "views", "inbox.yaml");
      const mutated = readFileSync(path, "utf8").replace(
        "qualification: domain-empty",
        "qualification: inbox-items",
      );
      assert.ok(mutated.includes("qualification: inbox-items"), "the falsifier's own edit failed");
      writeFileSync(path, mutated);
    });
    assert.equal(language.sections["inbox"]["domain-empty"].qualification, "inbox-items");
    // A bare line is a `task`, and `inbox-items` wants node_type `inbox` — so under the mutated
    // section the same line no longer belongs, though the pattern file was untouched.
    assert.equal(belongs(language, BARE_LINE), false);
  });

  test("REFUSAL FOLLOWS THE CONFIG TOO: make the pattern traverse MORE THAN ONE HOP, and the app goes silent", { skip }, () => {
    // RESTATED 2026-08-04: this mutation used to be `parents: {...}, exists: true` — a ONE-HOP
    // step. `compile-qualification.mjs`'s `normaliseEdgeStep` widening now models exactly that
    // shape (see the test below), so it no longer proves "the app goes silent". `ancestors:` is
    // TRANSITIVE (`routine_reset_cascade.yaml`'s own comment: "TRANSITIVE, not one hop") and stays
    // refused — this is what still proves the claim this test's own name makes.
    const language = withMutatedConfig((configDir) => {
      const path = join(configDir, "patterns", "domain_empty.yaml");
      const mutated = readFileSync(path, "utf8").replace(
        "  steps:",
        "  steps:\n    - ancestors: { edge_type: PART_OF }\n      exists: true",
      );
      writeFileSync(path, mutated);
    });
    // A MULTI-HOP traversing step is not decidable from a line's own fields, so the generator
    // publishes nothing and the app says nothing — rather than answering from the half it still
    // understands.
    assert.equal(language.sections["inbox"]?.["domain-empty"], undefined);
    assert.equal(
      membershipFor("inbox", "domain-empty", BARE_LINE, language).because,
      "no-section-declaration",
    );
    // ADDED, not changed: this test always encoded a REAL requirement — the app must abstain
    // rather than answer from half a predicate — and it still does, unedited above. What it never
    // asserted is that the abstention is EXPLAINED anywhere. It is now: the pattern's reason is in
    // `refused` and the heading it costs is named in `dropped`, so "the app says nothing" and "the
    // operator can find out why" stop being the same silence. See scripts/ledger.mjs.
    assert.ok(
      "domain-empty" in language.refused,
      "the refused pattern is not recorded with a reason",
    );
    assert.equal(
      language.dropped["section 'inbox.domain-empty'"],
      "qualification refused: domain-empty",
      "the heading the refusal costs is not named in `dropped`",
    );
  });

  test("ONE-HOP TRAVERSAL PUBLISHES, BUT MEMBERSHIP STILL ABSTAINS — visibly, and for a NAMED reason", { skip }, () => {
    // ADDED 2026-08-04, alongside `normaliseEdgeStep`. A `parents:`/`children:` step with
    // `exists:`/`not_exists:` true is now a real, decidable predicate — `compile-qualification.mjs`
    // publishes it, unlike the `ancestors:` case above — but DECIDING it needs a neighbour node's
    // own fields, which `membership.ts`'s whole domain (a line being typed, not yet minted, no
    // graph to walk) never has. This is the falsifier for THAT half of the claim: published is not
    // the same as decidable, and the app must abstain with a DIFFERENT, more specific reason than
    // "no-section-declaration" — `needs-graph-traversal` — rather than silently answering wrong.
    const language = withMutatedConfig((configDir) => {
      const path = join(configDir, "patterns", "domain_empty.yaml");
      const mutated = readFileSync(path, "utf8").replace(
        "  steps:",
        "  steps:\n    - parents: { edge_type: PART_OF }\n      exists: true",
      );
      writeFileSync(path, mutated);
    });
    assert.notEqual(
      language.sections["inbox"]?.["domain-empty"],
      undefined,
      "the one-hop pattern should now be published, not refused",
    );
    assert.equal(language.predicates["domain-empty"]?.edgeSteps?.length, 1);
    const reading = membershipFor("inbox", "domain-empty", BARE_LINE, language);
    assert.equal(reading.kind, "abstains");
    assert.equal(reading.because, "needs-graph-traversal");
    // NOT REFUSED — a published-but-graph-dependent predicate carries no entry in `refused` at all;
    // that map is only for a pattern that failed to normalise, which this one did not.
    assert.equal("domain-empty" in language.refused, false);
  });
});

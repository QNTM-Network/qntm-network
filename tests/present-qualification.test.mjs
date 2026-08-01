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
const SERVED = JSON.parse(readFileSync(resolve(HERE, "..", "presentation.json"), "utf8"));

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
    const { qualification } = readQualificationDeclaration(SERVED);
    const refused = Object.entries(qualification.refused);
    assert.ok(refused.length > 0, "nothing was refused, which cannot be true of this config");
    for (const [name, reason] of refused) {
      assert.ok(reason.length > 0, `'${name}' was refused with an empty reason`);
      assert.ok(
        !(name in qualification.predicates),
        `'${name}' is both refused and published — the two halves disagree`,
      );
    }
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

  test("daily-work: 5 declared, only 1 published — sectionOrder still carries all 5", () => {
    const { qualification } = readQualificationDeclaration(SERVED);
    assert.deepEqual(
      qualification.sectionOrder["daily-work"],
      ["in-progress", "urgent", "due-today", "waiting", "capture"],
    );
    assert.deepEqual(Object.keys(qualification.sections["daily-work"]), ["in-progress"]);
  });

  test("daily-personal: 8 declared, only 3 published — sectionOrder still carries all 8", () => {
    const { qualification } = readQualificationDeclaration(SERVED);
    assert.equal(qualification.sectionOrder["daily-personal"].length, 8);
    assert.equal(Object.keys(qualification.sections["daily-personal"]).length, 3);
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
  test("presentationFromDeclaration(EMBEDDED_DECLARATION)'s shape carries the qualification axis", () => {
    // Before this change, `presentationFromDeclaration` (app/present/context.ts) called
    // `readDeclaration` and `readStructuralDeclaration` only — `readQualificationDeclaration` had
    // no production caller, only tests called it directly. This is the falsifier that it now does.
    const declared = presentationFromDeclaration(SERVED);
    assert.equal(Object.keys(declared.qualification.predicates).length, 43);
    assert.equal(Object.keys(declared.qualification.sections).length, 27);
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
    const { qualification, problems } = read({
      predicates: { p: { find: { nodeType: null, fields: { domain: { gt: "x" } } } } },
    });
    assert.ok(problems.some((p) => p.includes("gt")), problems.join("\n"));
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
      SERVED.qualification,
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

  test("REFUSAL FOLLOWS THE CONFIG TOO: make the pattern traverse, and the app goes silent", { skip }, () => {
    const language = withMutatedConfig((configDir) => {
      const path = join(configDir, "patterns", "domain_empty.yaml");
      const mutated = readFileSync(path, "utf8").replace(
        "  steps:",
        "  steps:\n    - parents: { edge_type: PART_OF }\n      exists: true",
      );
      writeFileSync(path, mutated);
    });
    // An edge-traversing step is not decidable from a line's own fields, so the generator publishes
    // nothing and the app says nothing — rather than answering from the half it still understands.
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
});

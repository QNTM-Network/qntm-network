/**
 * AFTER THIS EDIT, DOES THIS LINE STILL BELONG IN THE SECTION IT IS IN?
 *
 *   node --test tests/present-membership.test.mjs
 *
 * Section 1 is the deliverable, in the operator's own words: "let's just take domain empty. Those
 * that have no domain. So adding there just collects no default. And auto is task. So it would
 * reappear there." A bare line typed under "Domain Empty" in `inbox.md` STAYS; the same line with
 * `#work` LEAVES. Both are read off his real `inbox.yaml` and his real `domain_empty.yaml`, through
 * the generated declaration, with no cycle, no clock and no graph walk.
 *
 * Section 2 is every refusal, because the refusals are what make the answers trustworthy. Section 3
 * is the evaluator's agreement with the engine's own predicate semantics at the edges that are easy
 * to get subtly wrong — absent-vs-null, and the null-tolerance of `not`.
 *
 * WHAT THIS FILE DOES NOT COVER: no browser, no rendering, no DOM. Nothing here paints anything, and
 * `membership.ts` is deliberately not wired to a painter — see this repo's report on why showing the
 * answer is a separate decision from computing it.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readQualificationDeclaration,
  membershipFor,
  resolveLineFields,
  matchesQualifier,
} from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVED = JSON.parse(readFileSync(resolve(HERE, "..", "presentation.json"), "utf8"));
const LANGUAGE = readQualificationDeclaration(SERVED).qualification;

/** Answer, or fail the test naming the abstention — a silent abstention would pass vacuously. */
function answerFor(view, section, line) {
  const reading = membershipFor(view, section, line, LANGUAGE);
  assert.equal(reading.kind, "answer", `abstained with '${reading.because}' for: ${line}`);
  return reading.answer;
}

describe("1. the operator's own case, against his own config", () => {
  test("a bare line typed under Domain Empty BELONGS there — it stays", () => {
    const answer = answerFor("inbox", "domain-empty", "- [ ] Ring the dentist");
    assert.equal(answer.belongs, true);
    // The three things that make it true, each read from the declaration rather than assumed:
    // nothing in inbox.yaml sets a domain, the registration cascade's global rung says `task`,
    // and an unticked box is `open`, so the done-exclusion does not fire.
    assert.deepEqual(answer.fields, { node_type: "task", domain: null, status: "open" });
    assert.equal(answer.qualification, "domain-empty");
  });

  test("the same line with #work does NOT belong there — it leaves", () => {
    const answer = answerFor("inbox", "domain-empty", "- [ ] Ring the dentist #work");
    assert.equal(answer.belongs, false);
    assert.equal(answer.fields.domain, "work", "the #work token did not reach the resolved domain");
  });

  test("the answer carries the section's OWN WORDS, not its config id", () => {
    // design-the-resolution-architecture.md step 4: "this will leave Domain Empty" reads its noun
    // off the declaration's `name:`, never off the `id:` (`domain-empty`) membership is keyed by.
    const answer = answerFor("inbox", "domain-empty", "- [ ] Ring the dentist");
    assert.equal(answer.sectionName, "Domain Empty");
  });

  test("a section with no declared name falls back to its id, reformatted rather than raw", () => {
    // 185 of 186 sections declare `name:`; this is the one that does not, proven with a hand-built
    // language rather than by finding the one real section, so the fallback is exercised even if
    // the operator's config later grows a name for the one section that lacks it today.
    const language = {
      ...LANGUAGE,
      sections: {
        ...LANGUAGE.sections,
        inbox: {
          ...LANGUAGE.sections.inbox,
          "domain-empty": { ...LANGUAGE.sections.inbox["domain-empty"], name: undefined },
        },
      },
    };
    const reading = membershipFor("inbox", "domain-empty", "- [ ] Ring the dentist", language);
    assert.equal(reading.kind, "answer");
    assert.equal(reading.answer.sectionName, "Domain Empty", "the id 'domain-empty' did not reformat to it");
  });

  test("and the browser can say the same about the OTHER section of the same view", () => {
    // `inbox-tagged` qualifies on node_type=inbox, so a bare line does not belong there either —
    // which is why a capture surfaces under Domain Empty and not under Inbox until it is tagged.
    assert.equal(answerFor("inbox", "inbox-tagged", "- [ ] Ring the dentist").belongs, false);
    assert.equal(answerFor("inbox", "inbox-tagged", "- [ ] Ring the dentist #inbox").belongs, true);
  });

  test("ticking the box removes it from both — a done capture is not awaiting triage", () => {
    assert.equal(answerFor("inbox", "domain-empty", "- [x] Ring the dentist").belongs, false);
    assert.equal(answerFor("inbox", "inbox-tagged", "- [x] Ring the dentist #inbox").belongs, false);
  });

  test("a box the config declares but the painter does not render is still understood", () => {
    // `[~]` is `waiting` in checkbox.yaml. `resolution.ts`'s display grammar knows two boxes;
    // membership reads the declared token table, so all six work and a seventh would too.
    const answer = answerFor("inbox", "domain-empty", "- [~] Ring the dentist");
    assert.equal(answer.fields.status, "waiting");
    assert.equal(answer.belongs, true, "waiting is not done, so it is still awaiting triage");
  });

  test("a section that declares its own defaults resolves them, not the view's", () => {
    // `admin.yaml`'s sections carry `defaults: {domain: admin}`, so a bare line there is NOT
    // undomained — the section rung of the registration cascade, read from the declaration.
    const answer = answerFor("admin", "to-do", "- [ ] Renew the SSL cert");
    assert.equal(answer.fields.domain, "admin");
    assert.equal(answer.belongs, true);
  });
});

describe("2. what it refuses, and why each refusal is not timidity", () => {
  const because = (view, section, line) => {
    const reading = membershipFor(view, section, line, LANGUAGE);
    assert.equal(reading.kind, "abstains", `answered where it should have abstained: ${line}`);
    return reading.because;
  };

  test("a section whose qualification was never published gets no answer", () => {
    // RESTATED 2026-08-04: `waiting-for-work.yaml`'s `waiting-for` section used to be the example
    // here — its qualification (`tasks-waited-on-by-someone`) traversed a WAITING_FOR edge, and the
    // old grammar refused every edge traversal outright. `compile-qualification.mjs`'s one-hop
    // `children:`/`parents:` widening now resolves it (see the NEXT test), so it moved to
    // `needs-graph-traversal` instead — a DIFFERENT, more specific abstention, not this one.
    // `habit-dojo.yaml`'s `classification` section names `habit-dojo-heads`, which ranges over
    // `project` (outside `RESOLVABLE_FIELDS`) — refused for a reason this widening never touches —
    // and stands in for this test's original claim instead.
    assert.equal(because("habit-dojo", "classification", "- [ ] Anything"), "no-section-declaration");
    assert.equal(because("inbox", "no-such-section", "- [ ] Anything"), "no-section-declaration");
  });

  test("a section whose qualification traverses ONE HOP publishes, but membership still abstains — visibly, differently", () => {
    // ADDED 2026-08-04, alongside `normaliseEdgeStep`. `waiting-for-work.yaml`'s `waiting-for`
    // section — the example the test above used to use — is a REAL instance of the same claim
    // `tests/present-qualification.test.mjs`'s falsifier proves on a scratch config: published is
    // not the same as decidable, and the app abstains with a NAMED, DIFFERENT reason
    // (`needs-graph-traversal`) than a section this grammar could not read at all
    // (`no-section-declaration`).
    assert.notEqual(SERVED.qualification.sections["waiting-for-work"]?.["waiting-for"], undefined);
    assert.equal(because("waiting-for-work", "waiting-for", "- [ ] Anything"), "needs-graph-traversal");
  });

  test("a line that already carries a [[qntm:N]] stamp gets no answer", () => {
    // Token REMOVAL is not token addition inverted, and whether deleting `#work` from a stamped
    // line clears `domain` is the engine's ingest semantics to decide, not this module's.
    assert.equal(
      because("inbox", "domain-empty", "- [ ] Ring the dentist [[qntm:1234]]"),
      "already-a-node",
    );
  });

  test("a line that is not a checkbox gets no answer", () => {
    // `status` is one of the three fields the predicates range over and the box is the only thing
    // that sets it. A bare `- ` line is also refused at the applier's form gate anyway.
    assert.equal(because("inbox", "domain-empty", "- Ring the dentist"), "not-a-declared-checkbox");
    assert.equal(because("inbox", "domain-empty", "Just some prose"), "not-a-declared-checkbox");
    assert.equal(because("inbox", "domain-empty", "## Domain Empty"), "not-a-declared-checkbox");
  });

  test("an UNDECLARED box gets no answer rather than being assumed open", () => {
    // `[X]` is not in checkbox.yaml — only `[x]` is. Assuming it means `done` would be this
    // module inventing vocabulary the config did not declare.
    assert.equal(because("inbox", "domain-empty", "- [X] Ring the dentist"), "not-a-declared-checkbox");
    assert.equal(because("inbox", "domain-empty", "- [?] Ring the dentist"), "not-a-declared-checkbox");
  });

  test("an empty line gets no answer — it would mint an (untitled) node, not the line typed", () => {
    assert.equal(because("inbox", "domain-empty", "- [ ] "), "no-content");
  });

  test("two tokens setting the same field get no answer — precedence is the engine's", () => {
    assert.equal(
      because("inbox", "domain-empty", "- [ ] Ring the dentist #work #personal"),
      "ambiguous-token",
    );
    assert.equal(
      because("inbox", "domain-empty", "- [ ] Ring the dentist #task #outcome"),
      "ambiguous-token",
    );
  });

  test("an unknown tag is NOT a refusal — it cannot set a field the engine knows either", () => {
    // The published token table is the COMPLETE set of tokens that set these three fields, taken
    // from every vocabulary family. A tag outside it is an UnknownToken to the engine too, so it
    // changes nothing and abstaining would be over-caution rather than honesty.
    const answer = answerFor("inbox", "domain-empty", "- [ ] Ring the dentist #not-a-real-tag");
    assert.equal(answer.belongs, true);
    assert.equal(answer.fields.domain, null);
  });

  test("a tag that sets an UNRELATED field is likewise not a refusal", () => {
    // `#genre-scifi` sets `genre`, which no published predicate ranges over.
    assert.equal(answerFor("inbox", "domain-empty", "- [ ] Read Dune #genre-scifi").belongs, true);
  });
});

describe("3. the evaluator matches the engine's predicate semantics at the edges", () => {
  const fields = (over) => ({ node_type: "task", domain: null, status: "open", ...over });

  test("an ABSENT field reads as null, the way `node.fields.get(name)` returns None", () => {
    const qualifier = { find: { nodeType: null, fields: { domain: { eq: null } } }, exclude: [] };
    assert.equal(matchesQualifier({ node_type: "task" }, qualifier), true);
    assert.equal(matchesQualifier(fields({ domain: "work" }), qualifier), false);
  });

  test("`not` is NULL-TOLERANT — negation includes an absent value", () => {
    // `patterns/engine.py::_apply_single_node_field_predicate`: "A None field returns False for the
    // inner comparison, so negation includes absent values". This is what makes `domain-empty`'s
    // done-exclusion keep a node whose status was never set.
    const qualifier = {
      find: { nodeType: null, fields: {} },
      exclude: [{ nodeType: null, fields: { status: { eq: "done" } } }],
    };
    assert.equal(matchesQualifier({ node_type: "task" }, qualifier), true);
    assert.equal(matchesQualifier(fields({ status: "done" }), qualifier), false);
  });

  test("a nodeType list is set membership, and null places no restriction", () => {
    const listed = { find: { nodeType: ["task", "outcome"], fields: {} }, exclude: [] };
    assert.equal(matchesQualifier(fields(), listed), true);
    assert.equal(matchesQualifier(fields({ node_type: "book" }), listed), false);
    const any = { find: { nodeType: null, fields: {} }, exclude: [] };
    assert.equal(matchesQualifier(fields({ node_type: "book" }), any), true);
  });

  test("the registration cascade resolves least-specific first, and the line wins", () => {
    const section = { nodeType: "book", defaults: { domain: "arts" } };
    const base = resolveLineFields("- [ ] Dune", section, LANGUAGE);
    assert.deepEqual(base, { node_type: "book", domain: "arts", status: "open" });
    // A token on the line overrides what the section defaulted — more specific beats less.
    const overridden = resolveLineFields("- [ ] Dune #personal", section, LANGUAGE);
    assert.equal(overridden.domain, "personal");
  });
});

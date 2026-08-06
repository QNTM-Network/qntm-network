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
    // `habit-dojo.yaml`'s `classification` section named `habit-dojo-heads`, which used to range
    // over `project` (outside `RESOLVABLE_FIELDS`) — refused for a reason this widening never
    // touched — and stood in for this test's original claim instead.
    //
    // RESTATED AGAIN, SAME DAY: resolvability became a CASCADE WALK
    // (`deriveStructuralFieldsByQualification`, `compile-qualification.mjs`) — `project` is fixed
    // by EVERY section that registers `habit-dojo-heads` via a section-level `defaults:`, so it is
    // published now too (`because("habit-dojo", "classification", ...)` would answer
    // `needs-graph-traversal`, not this abstention — `habit-dojo-heads` also carries an edge step).
    // `daily-personal.yaml`'s `due-soon` section named `due-soon-tasks`, which ranged over
    // `due_date < $cycle_today` — the CLOCK, not the value — and stood in for this test's claim
    // for one PR.
    //
    // RESTATED A THIRD TIME 2026-08-06 (job 1, "the last fourteen"): `due-soon-tasks` is published
    // now too — `because("daily-personal", "due-soon", ...)` answers `needs-clock` instead (a
    // published, decidable predicate this ONE call cannot apply without `today` — see the next
    // describe block), not this abstention. Measured across the WHOLE real config: 0 referenced
    // qualifications are refused today, so no REAL section stands in for "never published"
    // any more. A hand-built declaration is the honest replacement — a predicate the reader itself
    // never received is exactly what `no-section-declaration` means, real config or not.
    const unpublished = readQualificationDeclaration({
      qualification: {
        predicates: {},
        sections: {}, // no predicate named 'ghost-qualification' was ever published
      },
    }).qualification;
    const reading = membershipFor("nowhere", "ghost-section", "- [ ] Anything", unpublished);
    assert.equal(reading.kind, "abstains");
    assert.equal(reading.because, "no-section-declaration");
    assert.equal(because("inbox", "no-such-section", "- [ ] Anything"), "no-section-declaration");
  });

  test("a section whose qualification compares a field against the clock gets no answer without 'today'", () => {
    // job 1's own new abstention. `daily-personal.yaml`'s `due-soon` section names
    // `due-soon-tasks`, which ranges over `due_date < $cycle_today` — published now (see the
    // previous test's own restatement), but UNDECIDABLE by this ONE call because it supplies no
    // `today`. `tests/present-membership.test.mjs`'s own `LANGUAGE`/`because` helper never threads
    // one through — see `app/present/resolvers/membership.ts` for the real caller that does.
    assert.equal(because("daily-personal", "due-soon", "- [ ] Anything"), "needs-clock");
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

describe("2a. job 1, END TO END — a real typed line, a real extraction glyph, and 'today'", () => {
  // `this-week.yaml`'s `overdue` section names `overdue` (`due_date: {lt: $cycle_today}`) — one of
  // the fourteen. FAR IN THE FUTURE, so a due_date this test writes by hand is unambiguously
  // before it regardless of when this suite runs — the point is the MECHANISM (glyph extraction +
  // comparison), not a live clock, so `today` is a fixed, hand-chosen value, never `Date.now()`.
  const FAR_FUTURE_TODAY = { logicalDate: "2999-01-01", weekEnd: "2999-01-04" };

  test("a line with an overdue due_date belongs — resolveLineFields' own glyph extraction, then the comparison", () => {
    const reading = membershipFor(
      "this-week",
      "overdue",
      "- [ ] Ring the dentist 📅 2026-01-01",
      LANGUAGE,
      FAR_FUTURE_TODAY,
    );
    assert.equal(reading.kind, "answer", `abstained: ${reading.kind === "abstains" ? reading.because : ""}`);
    assert.equal(reading.answer.fields.due_date, "2026-01-01", "the glyph's trailing value was not extracted");
    assert.equal(reading.answer.belongs, true);
  });

  test("a line with a not-yet-due due_date does not belong — the same mechanism, the other side", () => {
    const reading = membershipFor(
      "this-week",
      "overdue",
      "- [ ] Ring the dentist 📅 2999-06-01",
      LANGUAGE,
      FAR_FUTURE_TODAY,
    );
    assert.equal(reading.kind, "answer");
    assert.equal(reading.answer.belongs, false);
  });

  test("a line with NO due_date glyph at all does not belong — null-tolerant lt, same as the engine", () => {
    const reading = membershipFor("this-week", "overdue", "- [ ] Ring the dentist", LANGUAGE, FAR_FUTURE_TODAY);
    assert.equal(reading.kind, "answer");
    assert.equal(reading.answer.fields.due_date, undefined);
    assert.equal(reading.answer.belongs, false);
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

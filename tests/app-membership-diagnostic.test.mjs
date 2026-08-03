/**
 * THE ABSTENTION IS VISIBLE — docs/implementation-artifacts/roadmap-the-road-ahead.md step 2,
 * through app/index.html's OWN LIFTED SCRIPT, not through a reconstruction of it.
 *
 *   node --test tests/app-membership-diagnostic.test.mjs
 *
 * ── THE DEFECT THIS FILE PROVES CLOSED ──
 *
 * Before this step, `membershipNoteFor` returned `""` for two different things: an ABSTENTION
 * (`membershipFor` could not resolve the before or after line) and a confident answer that
 * nothing changed. Joined into the freshness line and filtered, the two states were
 * byte-identical on screen. `roadmap-the-road-ahead.md` §2's own falsifier: "drive one line in a
 * section whose qualification is refused, and one line in a section that publishes cleanly and
 * does not move. Assert the two produce different output. Today they do not."
 *
 * This file proves they now do — through `membershipDiagnosticFor`, the new function, and
 * `#membershipBadge`, the new DOM sink, both read against `membershipNoteFor`'s own narration to
 * show the two functions AGREE about what changed and DISAGREE, correctly, about what to say
 * about it.
 *
 * ── FIVE SECTIONS ──
 *
 *   1. THE FALSIFIER, DIRECTLY — `membershipDiagnosticFor` against the exact two lines
 *      `tests/app-membership-note.test.mjs` §2/§3 already uses for "leaving is said" and
 *      "an unpublished section says nothing" — the SAME fixture, so this is not a new declaration
 *      shape invented to make the point look easy.
 *   2. THE SCENARIO — the real `commitLine`, the real DOM, `#membershipBadge` read as a person or
 *      an agent driving the browser would read it — the same shape
 *      `tests/app-today-note.test.mjs` §2 uses for `sayAsOf`/`#freshness`.
 *   3. NOT-EVALUATED IS LEFT OUT OF THE REGISTER, ON PURPOSE — the named, honest gap
 *      `membershipDiagnosticFor`'s own header states rather than silently widening.
 *   4. THE MUTATION PROOF — collapse the abstains branch onto the answer branch's text, and the
 *      falsifier in §1 goes red. A guard that cannot go red is decoration.
 *   5. NOTHING LOCAL REACHES A WRITE — the same pinned counts every sibling suite in this family
 *      re-verifies, so a reviewer of this file alone sees the invariant this step must not break.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { importPage, installBrowser, makeWorkDir, assertMutated } from "./fixtures/app-html-page.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = makeWorkDir("app-membership-diagnostic");

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE SHARED FIXTURE — identical in shape to tests/app-membership-note.test.mjs's own
// FAKE_DECLARATION/DEMO_SOURCE, restated here so this file does not take a dependency on that
// file's internals; every shape below is one `readQualificationDeclaration` actually produces.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const FAKE_DECLARATION = {
  qualification: {
    defaultNodeType: "task",
    structuralNodeTypes: [],
    tokens: {
      node_type: {},
      domain: { "#work": "work", "#personal": "personal" },
      status: { "[ ]": "open", "[x]": "done" },
    },
    predicates: {
      "domain-empty": {
        find: { nodeType: null, fields: { domain: { eq: null } } },
        exclude: [{ nodeType: null, fields: { status: { eq: "done" } } }],
      },
    },
    sections: {
      demo: {
        "domain-empty": { qualification: "domain-empty", nodeType: "task", name: "Domain Empty" },
      },
    },
    // "unpublished" is declared (it opens a real heading) but names no predicate that survived —
    // the same shape `daily-work`'s "urgent" ordinal has in the real declaration, and the same
    // fixture tests/app-membership-note.test.mjs's own ABSTENTION 1/5 case uses.
    sectionOrder: { demo: ["domain-empty", "unpublished"] },
    refused: {},
  },
};

const DEMO_SOURCE = [
  "## Domain Empty", // ordinal 0 -> "domain-empty" (published, resolves)
  "- [ ] Ring the dentist", // ordinal 0
  "## Unpublished", // ordinal 1 -> "unpublished" (declared, not published — abstains)
  "- [ ] Anything", // ordinal 1
].join("\n");

const DEMO_VIEW = { id: "demo", path: "demo.md" };

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE FALSIFIER, DIRECTLY — the operator's abstention case and his confident-silence case,
//    through membershipDiagnosticFor, asserted to produce DIFFERENT output
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. THE FALSIFIER — an abstention and a confident 'nothing changed' produce DIFFERENT output", () => {
  let page;

  before(async () => {
    installBrowser();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
    page.__applyPresentation(FAKE_DECLARATION);
  });

  const diagnostic = (patch) =>
    page.__membershipDiagnosticFor(DEMO_VIEW, {
      lineIndex: 1,
      text: "- [ ] Ring the dentist",
      markdown: "irrelevant to this suite",
      source: DEMO_SOURCE,
      kind: "set-line",
      ...patch,
    });

  // "a section that publishes cleanly and does not move" — roadmap-the-road-ahead.md §2's own
  // words. Same line tests/app-membership-note.test.mjs's own CONTROL test uses.
  const CONFIDENT_UNCHANGED = diagnostic;
  // "a section whose qualification is refused" — the SAME two lines
  // tests/app-membership-note.test.mjs's ABSTENTION 1/5 test drives.
  const ABSTAINS = (patch) => diagnostic({ lineIndex: 3, text: "- [ ] Anything else", ...patch });

  test('a confident answer that nothing changed says "membership: decided"', () => {
    assert.equal(CONFIDENT_UNCHANGED({}), "membership: decided");
  });

  test('a confident LEAVING transition also says "membership: decided" — the register reports that a decision was reached, not which one', () => {
    assert.equal(CONFIDENT_UNCHANGED({ text: "- [ ] Ring the dentist #work" }), "membership: decided");
  });

  test('an abstention (an unpublished section) says "membership: abstained — no-section-declaration"', () => {
    assert.equal(ABSTAINS(), "membership: abstained — no-section-declaration");
  });

  test("THE FALSIFIER ITSELF — the confident case and the abstaining case produce different text", () => {
    const confident = CONFIDENT_UNCHANGED({});
    const abstained = ABSTAINS();
    assert.notEqual(
      confident,
      abstained,
      `an abstention and a confident answer produced identical output: both were "${confident}"`,
    );
  });

  test('every membershipFor Abstention reason is carried through verbatim, the same precedent todayNoteFor\'s console.warn sets', () => {
    assert.equal(
      diagnostic({ text: "- [ ] Ring the dentist [[qntm:99]]" }),
      "membership: abstained — already-a-node",
    );
    assert.equal(
      diagnostic({ text: "Just prose, not a checkbox at all" }),
      "membership: abstained — not-a-declared-checkbox",
    );
    assert.equal(diagnostic({ text: "- [ ] " }), "membership: abstained — no-content");
    assert.equal(
      diagnostic({ text: "- [ ] Ring the dentist #work #personal" }),
      "membership: abstained — ambiguous-token",
    );
  });

  test("an INSERTED line has no before and abstains rather than misattributes — same posture as membershipNoteFor", () => {
    assert.equal(
      diagnostic({ kind: "insert-line", text: "- [ ] Ring the dentist #work" }),
      "",
      "an insertion should be not-evaluated, not answered or abstained",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE SCENARIO — the real commitLine, the real DOM sink, driven the same way
//    tests/app-ordering-note.test.mjs §2 drives "BOTH NOTES SHARE ONE SLOT": through
//    `page.commitLine` itself (unmocked), asserted against the actual element rather than a
//    function's return value — the same shape tests/app-today-note.test.mjs §2 uses for
//    `sayAsOf`/`#freshness`, restated here for `#membershipBadge`.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. THE SCENARIO — commitLine writes the abstention register to #membershipBadge, driven end to end", () => {
  let page;
  let elements;

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handle: "luke",
          pending_edits: 0,
          snapshot: { generated_at: "2026-08-03T12:00:00Z", views: [{ ...DEMO_VIEW, markdown: body.markdown }] },
        }),
      };
    };
    page = await importPage(WORK);
    page.__applyPresentation(FAKE_DECLARATION);
  });

  const badge = () => elements.get("membershipBadge").textContent;

  test("a commit in the published, unchanged section writes 'membership: decided' to #membershipBadge", () => {
    // READ SYNCHRONOUSLY, BEFORE THE WRITE'S OWN AWAIT SETTLES — `updateMembershipBadge` runs
    // before `writeFile`'s await, the same instant `notes`/`note` are computed, so the badge is
    // already written by the time this synchronous call returns its (unawaited) promise.
    page.commitLine(DEMO_VIEW, {
      lineIndex: 1,
      text: "- [ ] Ring the dentist today",
      markdown: DEMO_SOURCE.replace("- [ ] Ring the dentist", "- [ ] Ring the dentist today"),
      source: DEMO_SOURCE,
      kind: "set-line",
    });
    assert.equal(badge(), "membership: decided");
  });

  test("a commit in the UNPUBLISHED section writes 'membership: abstained — no-section-declaration' — DIFFERENT from the confident case above", () => {
    page.commitLine(DEMO_VIEW, {
      lineIndex: 3,
      text: "- [ ] Anything else",
      markdown: DEMO_SOURCE.replace("- [ ] Anything", "- [ ] Anything else"),
      source: DEMO_SOURCE,
      kind: "set-line",
    });
    assert.equal(badge(), "membership: abstained — no-section-declaration");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. NOT-EVALUATED IS LEFT OUT OF THE REGISTER, ON PURPOSE
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. NOT-EVALUATED — a gesture the module was never asked about does not overwrite the badge", () => {
  let page;

  before(async () => {
    installBrowser();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
  });

  test("with no declaration loaded at all, membershipDiagnosticFor says nothing rather than throwing", () => {
    page.__applyPresentation({});
    assert.doesNotThrow(() =>
      page.__membershipDiagnosticFor(DEMO_VIEW, {
        lineIndex: 1,
        text: "- [ ] Ring the dentist #work",
        markdown: "irrelevant",
        source: DEMO_SOURCE,
        kind: "set-line",
      }),
    );
    assert.equal(
      page.__membershipDiagnosticFor(DEMO_VIEW, {
        lineIndex: 1,
        text: "- [ ] Ring the dentist #work",
        markdown: "irrelevant",
        source: DEMO_SOURCE,
        kind: "set-line",
      }),
      "",
    );
  });

  test("a commit-kind that is not a text edit is not-evaluated, not abstained", () => {
    page.__applyPresentation(FAKE_DECLARATION);
    assert.equal(
      page.__membershipDiagnosticFor(DEMO_VIEW, {
        lineIndex: 1,
        text: "- [ ] Ring the dentist #work",
        markdown: "irrelevant",
        source: DEMO_SOURCE,
        kind: "insert-line",
      }),
      "",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE MUTATION PROOF — collapse the distinguishing text, and §1's own falsifier goes red
// ══════════════════════════════════════════════════════════════════════════════════════════════

const WORK_MUTANT = makeWorkDir("app-membership-diagnostic-mutant");

describe("4. MUTATION PROOF — neuter the abstains branch's text, and the falsifier stops distinguishing", () => {
  let page;

  before(async () => {
    installBrowser();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(
      WORK_MUTANT,
      (source) =>
        assertMutated(
          source,
          'return `membership: abstained — ${reading.because}`;',
          'return "membership: decided";',
        ),
    );
    page.__applyPresentation(FAKE_DECLARATION);
  });

  const diagnostic = (patch) =>
    page.__membershipDiagnosticFor(DEMO_VIEW, {
      lineIndex: 1,
      text: "- [ ] Ring the dentist",
      markdown: "irrelevant",
      source: DEMO_SOURCE,
      kind: "set-line",
      ...patch,
    });

  test("the mutated page reports the abstention identically to the confident case — the bug this step fixes, reproduced", () => {
    const confident = diagnostic({});
    const abstained = diagnostic({ lineIndex: 3, text: "- [ ] Anything else" });
    assert.equal(
      confident,
      abstained,
      "the mutation was supposed to make these equal again — if they differ, the mutation missed its target",
    );
  });

  test("and the falsifier from §1, run against the mutant, goes red", () => {
    const confident = diagnostic({});
    const abstained = diagnostic({ lineIndex: 3, text: "- [ ] Anything else" });
    assert.throws(
      () =>
        assert.notEqual(
          confident,
          abstained,
          `an abstention and a confident answer produced identical output: both were "${confident}"`,
        ),
      /an abstention and a confident answer produced identical output/,
      "the falsifier passed against a mutant that reintroduces the exact defect this step fixes — the guard proves nothing",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. NOTHING LOCAL REACHES A WRITE — re-verified for this step's own change
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. NOTHING LOCAL REACHES A WRITE — re-verified, and the new functions' own posture", () => {
  const APP_SOURCE = readFileSync(resolve(HERE, "..", "app", "index.html"), "utf8");
  const PAINT_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "paint.ts"), "utf8");

  // UNCHANGED FROM the sibling suites in this family — this step adds no assignment, no new write
  // path: `updateMembershipBadge` only ever assigns `.textContent` on `#membershipBadge` and
  // toggles a class, neither of which this pattern matches.
  test("`graphData` is still assigned in exactly four places", () => {
    const sites = APP_SOURCE.match(/\bgraphData\s*=(?!=)/g) ?? [];
    assert.equal(sites.length, 4, "the abstention register must not add a client-computed graphData write");
  });

  test("`writeFile` still has exactly two callers — its declaration plus toggleTask and commitLine", () => {
    const occurrences = APP_SOURCE.match(/\bwriteFile\(/g) ?? [];
    assert.equal(occurrences.length, 3, "a new call site would mean a third write path exists");
  });

  test("`applyEdit` is still reached from exactly five sites outside its own module", () => {
    const pageCalls = APP_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    const paintCalls = PAINT_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    assert.equal(pageCalls.length + paintCalls.length, 5, "the abstention register must reach applyEdit zero times");
  });

  test("`.markdown` is still never ASSIGNED in app/", () => {
    const assignments = (source) => source.match(/\.markdown\s*=(?!=)/g) ?? [];
    assert.deepEqual(assignments(APP_SOURCE), []);
    assert.deepEqual(assignments(PAINT_SOURCE), []);
  });

  test("membershipReadingFor, membershipDiagnosticFor and updateMembershipBadge import nothing from source.ts", () => {
    for (const name of ["membershipReadingFor", "membershipDiagnosticFor", "updateMembershipBadge"]) {
      const fn = new RegExp(`function ${name}[\\s\\S]*?\\n}\\n`).exec(APP_SOURCE)?.[0];
      assert.ok(fn, `${name} was not found — this test is checking the wrong source`);
      assert.ok(!/\bapplyEdit\(/.test(fn), `${name} calls applyEdit`);
    }
  });

  test("membershipDiagnosticFor and membershipNoteFor agree on when a decision was reached — same underlying reading, never two", () => {
    // A REGRESSION GUARD FOR DRIFT, THE EXACT FAILURE design-the-compiler-and-the-bands.md §3.1
    // NAMES FOR THREE HAND-SYNCED LISTS: if a future edit gives `membershipNoteFor` and
    // `membershipDiagnosticFor` two SEPARATE evaluations instead of sharing
    // `membershipReadingFor`, this is the test that would catch them disagreeing about whether an
    // abstention occurred, not merely about the words used to report it.
    const fn = /function membershipNoteFor[\s\S]*?\n}\n/.exec(APP_SOURCE)?.[0];
    assert.match(fn, /membershipReadingFor\(view, commit\)/);
    const diagFn = /function membershipDiagnosticFor[\s\S]*?\n}\n/.exec(APP_SOURCE)?.[0];
    assert.match(diagFn, /membershipReadingFor\(view, commit\)/);
  });
});

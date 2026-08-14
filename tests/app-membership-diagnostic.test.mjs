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
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { importPage, installBrowser, makeWorkDir, assertMutated, RESOLVER_SOURCES, resolverSource, repointBundle, REPO } from "./fixtures/app-html-page.mjs";
import { assertOneWritePath } from "./fixtures/write-path-callers.mjs";

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

// `#membershipBadge` ITSELF WAS RETIRED (chore/retire-the-status-line, the abstention register).
// These two tests used to read its `textContent` after `commitLine`; they now ask the membership
// resolver directly, over the SAME commit `commitLine` just walked — `page.__membershipDiagnosticFor`
// calls the real `membershipSpec.read`/`.show` this page's own `commitLine` still runs on every
// commit. The DOM sink is gone, the decision it used to display is not.
describe("2. THE SCENARIO — commitLine decides membership, driven end to end", () => {
  let page;

  before(async () => {
    installBrowser();
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

  test("a commit in the published, unchanged section decides 'membership: decided'", () => {
    const commit = {
      lineIndex: 1,
      text: "- [ ] Ring the dentist today",
      markdown: DEMO_SOURCE.replace("- [ ] Ring the dentist", "- [ ] Ring the dentist today"),
      source: DEMO_SOURCE,
      kind: "set-line",
    };
    page.commitLine(DEMO_VIEW, commit);
    assert.equal(page.__membershipDiagnosticFor(DEMO_VIEW, commit), "membership: decided");
  });

  test("a commit in the UNPUBLISHED section decides 'membership: abstained — no-section-declaration' — DIFFERENT from the confident case above", () => {
    const commit = {
      lineIndex: 3,
      text: "- [ ] Anything else",
      markdown: DEMO_SOURCE.replace("- [ ] Anything", "- [ ] Anything else"),
      source: DEMO_SOURCE,
      kind: "set-line",
    };
    page.commitLine(DEMO_VIEW, commit);
    assert.equal(page.__membershipDiagnosticFor(DEMO_VIEW, commit), "membership: abstained — no-section-declaration");
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
    // THE SEAM IS THE BUNDLE, NOT THE PAGE — `membershipSpec.show` lives in
    // `app/present/resolvers/membership.ts`, which the page imports as `/dist/present.js`, so the
    // mutant is a copy of the bundle with the page (and the fixture's own resolver seam) pointed at
    // it. Exactly the seam tests/app-vim-wiring.test.mjs cuts, and for the same reason.
    //
    // THE PATTERN IS THE BUNDLE'S OWN TEXT, `\u2014` AND ALL. esbuild escapes the em dash on the
    // way out; a pattern carrying the literal character would silently match nothing, and
    // `assertMutated` refuses that rather than producing a green proof against unmodified code.
    const mutantBundle = join(WORK_MUTANT, "present.mutated.js");
    writeFileSync(
      mutantBundle,
      assertMutated(
        readFileSync(join(REPO, "dist", "present.js"), "utf8"),
        "membership: abstained \\u2014 ${reading.because}",
        "membership: decided",
      ),
    );
    page = await importPage(WORK_MUTANT, (source) =>
      repointBundle(source, pathToFileURL(mutantBundle).href),
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

  // ONE RULE, ONE EXPRESSION — see tests/fixtures/write-path-callers.mjs. This test used to
  // restate the counts inline, in one of six identical copies, and it asserted TWO callers
  // when the correct number was always ONE: a mouse tick and an `x` tick are one act.
  test("there is exactly ONE write path, and the call sites still prove it", () => {
    assertOneWritePath();
  });

  test("`applyEdit` is still reached from exactly five sites outside its own module", () => {
    // NARROWED 2026-08-10, NOT RELAXED — the claim is unchanged, the SPLIT moved. The page's two
    // `applyEdit` calls (`x` and `>`/`<`) went to `app/shell/keys.ts` when the global keydown
    // handler left `app/index.html` for a file the compiler and the tracer can both read. Still
    // exactly five sites outside `source.ts`; the page now holds none of them, which is a
    // STRONGER claim than the one this replaces, so the total is asserted as before AND each side
    // is named so a future drift says which one moved.
    const KEYS_SOURCE = readFileSync(resolve(HERE, "..", "app", "shell", "keys.ts"), "utf8");
    const pageCalls = APP_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    const keysCalls = KEYS_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    const paintCalls = PAINT_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    assert.equal(pageCalls.length, 0, "the page must hold no edit constructor at all now");
    assert.equal(keysCalls.length, 2, "`x` and `>`/`<` are the two, and they live in keys.ts");
    assert.equal(pageCalls.length + keysCalls.length + paintCalls.length, 5, "the abstention register must reach applyEdit zero times");
  });

  test("`.markdown` is still never ASSIGNED in app/ — the page, the painter, AND every resolver", () => {
    const assignments = (source) => source.match(/\.markdown\s*=(?!=)/g) ?? [];
    assert.deepEqual(assignments(APP_SOURCE), []);
    assert.deepEqual(assignments(PAINT_SOURCE), []);
    // WIDENED WHEN THE RESOLVERS MOVED OFF THE PAGE. Two files was the whole of `app/`'s decision
    // code when this guard was written; the axes that could plausibly rewrite a commit now live in
    // `app/present/resolvers/`, and a grep that had stayed pointed at two files would have gone on
    // passing while protecting nothing. `RESOLVER_SOURCES` enumerates the directory rather than
    // listing it, so a fifth resolver is covered the day it lands.
    for (const [name, source] of Object.entries(RESOLVER_SOURCES)) {
      assert.deepEqual(assignments(source), [], `${name} assigns .markdown`);
    }
  });

  test("the membership resolver imports nothing from source.ts — no read, say or show can produce a SourceEdit", () => {
    // THE THREE FUNCTIONS THIS TEST NAMED ARE ONE `ResolverSpec` NOW (`membershipSpec`,
    // app/present/resolvers/membership.ts), so the grep is against the whole module rather than
    // three extracted function bodies — a strictly wider claim than the one it replaces, and one a
    // fourth function added to that spec cannot slip past.
    const source = resolverSource("membership");
    assert.doesNotMatch(source, /\bapplyEdit\b/, "the membership resolver reaches applyEdit");
    assert.doesNotMatch(source, /source\.js/, "the membership resolver imports source.ts");
  });

  test("membershipDiagnosticFor and membershipNoteFor agree on when a decision was reached — same underlying reading, never two", () => {
    // A REGRESSION GUARD FOR DRIFT, THE EXACT FAILURE design-the-compiler-and-the-bands.md §3.1
    // NAMES FOR THREE HAND-SYNCED LISTS: if a future edit gives `membershipNoteFor` and
    // `membershipDiagnosticFor` two SEPARATE evaluations instead of sharing
    // `membershipReadingFor`, this is the test that would catch them disagreeing about whether an
    // abstention occurred, not merely about the words used to report it.
    // THE TIE IS STRUCTURAL NOW, NOT A CONVENTION TWO FUNCTIONS HAPPEN TO KEEP. `defineResolver`
    // (app/present/resolve.ts) calls `read` ONCE and hands that ONE value to `say` and `show`
    // alike, so the two cannot be given separate evaluations without changing the runner itself —
    // which is what this asserts, in place of grepping two page functions for the same call.
    const runner = /run\(ctx: CommitContext\): ResolverRun \{[\s\S]*?\n    \},/.exec(
      RESOLVER_SOURCES["app/present/resolve.ts"],
    )?.[0];
    assert.ok(runner, "defineResolver's run() was not found — this test is checking the wrong source");
    assert.equal((runner.match(/spec\.read\(/g) ?? []).length, 1, "read must be called exactly once per commit");
    assert.match(runner, /spec\.say\(reading\)/);
    assert.match(runner, /diagnosticOf\(spec, reading\)/);
  });
});

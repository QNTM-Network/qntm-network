/**
 * THE OPERATOR'S OWN GESTURE — type the child, then indent it — never reached the promotion
 * prediction at all, on `main`. He said so directly: "the rule changing to an outcome only works
 * on server return. not on front end." The cause: `parentPromotionFor` (app/index.html) only ever
 * evaluated `commit.kind === "insert-line"` — a line captured ALREADY indented. Indenting an
 * EXISTING line (type it, THEN press `>`) is a `set-line` commit, so the browser never asked the
 * question. The engine fires the rule regardless, because it sees the new `PART_OF` edge however
 * it was created — hence "only works on server return".
 *
 *   node --test tests/app-parent-promotion-on-indent.test.mjs
 *
 * ── THE FIX, AND WHY IT IS NOT A SECOND ENUMERATION ──
 *
 * `structuralRelationshipChangeFor` (app/index.html, beside `parentPromotionFor`) answers ONE
 * question — did `commit.lineIndex`'s own structural parent change — by comparing a BEFORE reading
 * (off `commit.source`, when `commit.kind === "set-line"` makes that string this line's own history)
 * against an AFTER reading (off `commit.markdown`, always). `parentPromotionFor` evaluates whenever
 * that comparison says "gained" or "lost", never by naming a `commit.kind` as the gate. This is what
 * makes the fix reach `>`/`<` AND a hand-typed change to a line's own leading whitespace, in the SAME
 * pass, without either needing its own clause — see section 5 below for the latter, proven directly
 * because the brief's own review named it as the concrete risk of a narrower fix.
 *
 * ── SIX SECTIONS ──
 *
 *   1. THE HEADLINE — through the REAL page: `>` on an existing, unindented task promotes the
 *      parent, on that commit. Section 2 proves it was NOT reachable before this leg, by mutation.
 *   2. MUTATION PROOF FOR THE GAIN — the exact pre-fix gate (`commit.kind !== "insert-line"`), put
 *      back by patching the extracted page source, reproduces section 1's own defect.
 *   3. THE OUTDENT — `<` removes a relationship; the browser abstains, visibly, rather than telling
 *      the operator something the graph-aware matcher cannot actually check (it can only ever ADD a
 *      prospective child, never subtract a real one). Proven both live and by mutation.
 *   4. THE CONTROL — a commit whose relationship does not change (`x`, a same-indent rename) is
 *      never evaluated at all, proving the fix does not fire on every `set-line` indiscriminately.
 *   5. THE GENERALITY — a plain typed edit that changes a line's OWN leading whitespace, with no
 *      `>`/`<` involved anywhere, is caught by the same rule. This is the case a fix scoped to the
 *      indent MOTION specifically would have missed.
 *   6. THE ENUMERATION — every `NormalEffect.kind` motions.ts's own union declares, read off its
 *      source (not hand-copied — the same technique `tests/app-gesture-write-path.test.mjs`
 *      established), with the promotion path driven and asserted for the four that ever reach
 *      `commitLine` at all.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertMutated, importPage, installBrowser, makeEvent, makeWorkDir, mutatingBundle } from "./fixtures/app-html-page.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// A dozen `describe`s below each mint their own `makeWorkDir` (a fresh module instance per work
// dir — `tests/fixtures/app-html-page.mjs`'s own "one module instance per workDir" rule), and
// `makeWorkDir` registers one `process.on("exit", ...)` listener per call — past Node's default cap
// of 10, raised once here rather than silenced per call, same posture app-gesture-write-path takes.
process.setMaxListeners(30);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// SHARED FIXTURE — one task/outcome promote rule, a structural indent binding, and a three-line
// document: a heading, an already-stamped parent task, and an unstamped sibling task beside it.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const DECLARATION = {
  qualification: {
    defaultNodeType: "task",
    structuralNodeTypes: [],
    tokens: {
      node_type: { "#task": "task" },
      domain: {},
      status: { "[ ]": "open", "[x]": "done" },
    },
    predicates: { "open-tasks": { find: { nodeType: ["task"], fields: {} }, exclude: [] } },
    sections: { demo: { capture: { qualification: "open-tasks", nodeType: "task", name: "Capture" } } },
    sectionOrder: { demo: ["capture"] },
    refused: {},
    dropped: {},
  },
  resolution: {
    registration: {},
    lineGrammars: {},
    ordering: {},
    orderingFields: {},
    dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
    chromeShapes: {},
    sectionRegistration: {},
    defaultOrdering: [],
    priorityRank: {},
    dropped: {},
  },
  structural: {
    indent: { edgeType: "PART_OF", edgeSource: "self" },
    edgeCardinality: { PART_OF: "many_to_one" },
    sections: {},
    dropped: {},
  },
  rules: {
    order: { established: true, sequence: ["a-task-with-an-open-child-becomes-an-outcome"] },
    rules: {
      "a-task-with-an-open-child-becomes-an-outcome": {
        pattern: "tasks-with-an-open-child",
        when: { op: "true" },
        priority: 0,
        actions: [
          { verb: "retype", to: "outcome" },
          { verb: "set", field: "auto_outcome", to: true },
        ],
      },
    },
    patterns: {
      "tasks-with-an-open-child": {
        find: { nodeType: ["task"], fields: { status: { eq: "open" } } },
        exclude: [],
        edgeSteps: [
          {
            direction: "children",
            mustExist: true,
            edgeType: ["PART_OF"],
            nodeType: ["task", "outcome"],
            fields: { status: { not: { eq: "done" } } },
          },
        ],
      },
    },
    fieldMarkers: {},
    dropped: {},
  },
};

const VIEW = { id: "demo", path: "demo.md", title: "Demo", domain: "demo" };
const GRAPH = { nodes: [{ id: "qntm:501", type: "task", fields: { status: "open" } }], edges: [] };

// Line 0: heading. Line 1: the already-stamped parent — "the parent does [have an id]", per this
// leg's own brief. Line 2: an ordinary, UNSTAMPED sibling task — "the indented child may already
// have one" is the other half of that same sentence, and is deliberately NOT exercised by giving
// this line a stamp too: the point of this fixture is the operator's own commonest gesture, a task
// typed and left to settle, with no round trip yet.
const SOURCE = ["## Capture", "- [ ] Ship the launch note [[qntm:501]] #task", "- [ ] Draft the copy #task"].join(
  "\n",
);

/** Answers a POST like the real Worker's synchronous shape, echoing the posted markdown back —
 * the same `postStub` shape `tests/app-parent-promotion.test.mjs` already uses. */
function postStub() {
  const posted = [];
  const fetchImpl = async (url, init) => {
    if (init?.method !== "GET") {
      const body = JSON.parse(init.body);
      posted.push({ url, body });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handle: "luke",
          pending_edits: 0,
          snapshot: { generated_at: "2026-08-05T00:00:00Z", views: [{ ...VIEW, markdown: body.markdown }] },
        }),
      };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  };
  fetchImpl.posted = posted;
  return fetchImpl;
}

/**
 * A fresh page, driven through the REAL keydown wiring. `press` fires `document`'s own listener,
 * exactly as `tests/app-gesture-write-path.test.mjs`'s own `press` does; `g`/`g` first, so every
 * caller starts from a deterministic line 0 regardless of how many keys came before it in the
 * same test.
 */
async function freshPage(label, markdown = SOURCE, graph = GRAPH, mutateFor) {
  const work = makeWorkDir(label);
  const { elements, document: doc } = installBrowser();
  const fetchImpl = postStub();
  globalThis.fetch = fetchImpl;
  // `mutateFor` IS A FACTORY, NOT A REWRITER, AND THE REASON IS THE MOVE. The code this file's
  // mutation proofs target is `promotionSpec` (app/present/resolvers/promotion.ts) now, which the
  // page imports as `/dist/present.js` — so a mutant is a COPY OF THE BUNDLE written beside the
  // lifted page, and writing it needs the work directory. See `mutatingBundle` in the fixture.
  const page = await importPage(work, mutateFor === undefined ? undefined : mutateFor(work));
  page.__applyPresentation(DECLARATION);
  page.__setGraphData({ snapshot: { generated_at: "2026-08-05T00:00:00Z", views: [{ ...VIEW, markdown }], graph } });
  page.paintView(VIEW.id);
  const press = (key) => doc.dispatch("keydown", makeEvent({ key }));
  press("g");
  press("g");
  return { page, elements, doc, press, posted: fetchImpl.posted };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE HEADLINE — through the real page: an EXISTING task, indented under another with `>`
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. THE HEADLINE: an existing task, indented beneath another task with `>`", () => {
  test("the parent's promotion is predicted in the browser on that commit — no round trip needed", async () => {
    const { page, press, posted } = await freshPage("indent-headline");
    press("j"); // line 1: the parent
    press("j"); // line 2: "- [ ] Draft the copy #task" — the line about to be indented

    press(">");
    // READ SYNCHRONOUSLY, BEFORE THE WRITE'S OWN ANSWER LANDS — `#parentBadge`/`#freshness` were
    // retired (chore/retire-the-status-line), but the timing they used to be read at still matters:
    // the stubbed answer's `graphData` carries no `.graph`, so a read taken after it lands would
    // abstain "graph-not-loaded" instead of answering — a fact about the FIXTURE, not the resolver.
    // `posted[0]` already exists at this point: `fetch` runs synchronously up to its own first
    // `await`, and pushing onto `posted` happens before that.
    const write = posted[0];
    assert.ok(write, "> never reached the write endpoint");
    assert.equal(
      write.body.markdown,
      "## Capture\n- [ ] Ship the launch note [[qntm:501]] #task\n    - [ ] Draft the copy #task",
      "the indent itself did not post the expected file",
    );
    const commit = { lineIndex: 2, text: "    - [ ] Draft the copy #task", markdown: write.body.markdown, source: SOURCE, kind: "set-line" };
    const reading = page.__parentPromotionFor(VIEW, commit);
    assert.equal(page.__parentPromotionDiagnosticFor(reading), "parent: decided");
    assert.match(page.__parentPromotionNoteFor(reading), /the row above becomes outcome, sets auto_outcome/);
    await new Promise((r) => setImmediate(r));
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. MUTATION PROOF FOR THE GAIN — the exact pre-fix gate, put back, reproduces the defect
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The precise text `promotionSpec.read` reads today, right after its declaration/markdown guards,
 * AS THE BUNDLE SPELLS IT — matched exactly so a drift in the module's own wording fails this file
 * loudly rather than silently mutating nothing (`assertMutated` already refuses that for us; this
 * is what makes the refusal exact).
 */
const MARKDOWN_GUARD =
  'if (commit.markdown === null) {\n      return NOT_EVALUATED;\n    }\n    const lines = commit.markdown.split("\\n");';

/** The ORIGINAL gate, reinstated — `commit.kind !== "insert-line"` refuses BEFORE the relationship
 * is ever read, which is the exact shape of the defect this whole leg exists to close. */
const withOldInsertLineOnlyGate = mutatingBundle([
  MARKDOWN_GUARD,
  MARKDOWN_GUARD.replace(
    'const lines = commit.markdown.split("\\n");',
    'if (commit.kind !== "insert-line") {\n      return NOT_EVALUATED;\n    }\n    const lines = commit.markdown.split("\\n");',
  ),
]);

// `#parentBadge`/`#freshness` WERE RETIRED (chore/retire-the-status-line). Both arms below now ask
// the promotion resolver directly, over the SAME reconstructed commit section 1 already proved —
// against the MUTATED bundle in the RED arm (the mutant is what `page` was built from, so
// `page.__parentPromotionFor` runs the mutated `read()`) and the real one in the GREEN arm.
const GAIN_COMMIT = {
  lineIndex: 2,
  text: "    - [ ] Draft the copy #task",
  markdown: "## Capture\n- [ ] Ship the launch note [[qntm:501]] #task\n    - [ ] Draft the copy #task",
  source: SOURCE,
  kind: "set-line",
};

describe("2. MUTATION PROOF — the pre-fix `insert-line`-only gate reproduces the defect, and only that gate", () => {
  test("RED: with the old gate restored, indenting an EXISTING line answers nothing", async () => {
    const { page, press } = await freshPage("indent-mutation-red", SOURCE, GRAPH, withOldInsertLineOnlyGate);
    press("j");
    press("j");
    press(">");
    await new Promise((r) => setImmediate(r));
    const reading = page.__parentPromotionFor(VIEW, GAIN_COMMIT);
    assert.equal(
      reading.kind,
      "not-evaluated",
      "the pre-fix gate must silence the parent reading for a `set-line` indent — this is main's own defect, reproduced",
    );
    assert.doesNotMatch(
      page.__parentPromotionNoteFor(reading),
      /becomes outcome/,
      "the pre-fix gate must never mention a promotion for an indented EXISTING line",
    );
  });

  test("GREEN: the unmutated page (this branch) answers for the identical gesture", async () => {
    const { page, press } = await freshPage("indent-mutation-green");
    press("j");
    press("j");
    press(">");
    const reading = page.__parentPromotionFor(VIEW, GAIN_COMMIT);
    assert.equal(page.__parentPromotionDiagnosticFor(reading), "parent: decided");
    assert.match(page.__parentPromotionNoteFor(reading), /the row above becomes outcome, sets auto_outcome/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE OUTDENT — a relationship REMOVED, answered by abstaining, never by guessing
// ══════════════════════════════════════════════════════════════════════════════════════════════

const INDENTED = ["## Capture", "- [ ] Ship the launch note [[qntm:501]] #task", "    - [ ] Draft the copy #task"].join(
  "\n",
);

const OUTDENT_COMMIT = {
  lineIndex: 2,
  text: "- [ ] Draft the copy #task",
  markdown: "## Capture\n- [ ] Ship the launch note [[qntm:501]] #task\n- [ ] Draft the copy #task",
  source: INDENTED,
  kind: "set-line",
};

describe("3. THE OUTDENT: `<` removes a structural relationship — abstained, not guessed", () => {
  test("through the real page: outdenting the child abstains 'structural-relationship-removed', and the write still goes", async () => {
    const { page, press, posted } = await freshPage("outdent-abstain", INDENTED);
    press("j");
    press("j"); // line 2: the indented child

    press("<");
    await new Promise((r) => setImmediate(r));

    const write = posted[0];
    assert.ok(write, "< never reached the write endpoint — abstaining must not block the write");
    assert.equal(
      write.body.markdown,
      "## Capture\n- [ ] Ship the launch note [[qntm:501]] #task\n- [ ] Draft the copy #task",
      "the outdent itself did not post the expected file",
    );
    // `#parentBadge`/`#freshness` WERE RETIRED (chore/retire-the-status-line) — asked directly of
    // the resolver instead, over the same commit the real gesture above just posted.
    const reading = page.__parentPromotionFor(VIEW, OUTDENT_COMMIT);
    assert.equal(
      page.__parentPromotionDiagnosticFor(reading),
      "parent: abstained — structural-relationship-removed",
      "a lost relationship must abstain visibly, not fall silent (that would read as 'nothing to ask' rather than 'checked, and I cannot say')",
    );
    assert.doesNotMatch(
      page.__parentPromotionNoteFor(reading),
      /becomes|clears|sets/,
      "an abstention must never carry a promotion sentence — the matcher used here can only ADD a prospective child, never subtract a real one",
    );
  });

  test("THE PURE ANSWER, driven directly: the same outdent, off a hand-built commit", async () => {
    const { page } = await freshPage("outdent-abstain-pure");
    const reading = page.__parentPromotionFor(VIEW, OUTDENT_COMMIT);
    assert.deepEqual(reading, { kind: "abstains", because: "structural-relationship-removed" });
  });
});

// ── MUTATION PROOF FOR THE LOSS — remove the "lost" abstention, watch the outdent stop abstaining ──

const LOST_ABSTENTION = 'return { kind: "abstains", because: "structural-relationship-removed" };';
const withoutLossAbstention = mutatingBundle([LOST_ABSTENTION, "return NOT_EVALUATED;"]);

describe("MUTATION PROOF — removing the 'lost' branch stops the outdent from abstaining", () => {
  test("RED: without the abstention, the outdent falls silent instead of saying it cannot check", async () => {
    const { page, press } = await freshPage("outdent-mutation-red", INDENTED, GRAPH, withoutLossAbstention);
    press("j");
    press("j");
    press("<");
    await new Promise((r) => setImmediate(r));
    const reading = page.__parentPromotionFor(VIEW, OUTDENT_COMMIT);
    assert.equal(
      reading.kind,
      "not-evaluated",
      "with the abstention removed, an outdent must go silent (not-evaluated) rather than abstain — this is the mutant's own, weaker behaviour",
    );
  });

  test("GREEN: the unmutated page abstains, as section 3 above already proved live", async () => {
    const { page, press } = await freshPage("outdent-mutation-green", INDENTED);
    press("j");
    press("j");
    press("<");
    await new Promise((r) => setImmediate(r));
    const reading = page.__parentPromotionFor(VIEW, OUTDENT_COMMIT);
    assert.equal(page.__parentPromotionDiagnosticFor(reading), "parent: abstained — structural-relationship-removed");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE CONTROL — a commit whose relationship does NOT change is never evaluated
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. THE CONTROL: a same-indent edit is not-evaluated — the fix does not fire on every set-line", () => {
  test("toggling the checkbox on an already-indented child changes nothing about its parent reading", async () => {
    const { page, press, posted } = await freshPage("control-toggle-done", INDENTED);
    press("j");
    press("j"); // the indented child

    press("x");
    await new Promise((r) => setImmediate(r));

    const write = posted[0];
    assert.ok(write, "x never reached the write endpoint");
    // `#parentBadge` WAS RETIRED (chore/retire-the-status-line) — asked of the resolver directly.
    const commit = { lineIndex: 2, text: "    - [x] Draft the copy #task", markdown: write.body.markdown, source: INDENTED, kind: "set-line" };
    const reading = page.__parentPromotionFor(VIEW, commit);
    assert.equal(
      reading.kind,
      "not-evaluated",
      "a checkbox flip changes no leading whitespace, so the relationship is unchanged and the reading must stay not-evaluated",
    );
  });

  test("THE PURE ANSWER: a same-indent rename (no `>`/`<`, no checkbox) is also not-evaluated", async () => {
    const { page } = await freshPage("control-rename-pure");
    const BEFORE = SOURCE;
    const AFTER = "## Capture\n- [ ] Ship the launch note [[qntm:501]] #task\n- [ ] Draft the COPY, renamed #task";
    const reading = page.__parentPromotionFor(VIEW, {
      lineIndex: 2,
      text: "- [ ] Draft the COPY, renamed #task",
      markdown: AFTER,
      source: BEFORE,
      kind: "set-line",
    });
    assert.deepEqual(reading, { kind: "not-evaluated" });
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE GENERALITY — a plain typed edit that changes leading whitespace, with no `>`/`<` at all
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. THE GENERALITY: hand-typed leading whitespace, never `>`, still reaches the promotion", () => {
  test("typing the line back in with four leading spaces (no indent motion) promotes the parent the same way", async () => {
    const { page } = await freshPage("generality-typed-indent");
    // Enter INSERT on line 2 directly, the same seam `tests/app-gesture-write-path.test.mjs`'s own
    // `enter-insert` case uses, then type the SAME line back with four leading spaces — no
    // `indentedLine`, no `>`, nothing about this edit is indent-motion-shaped at all.
    page.__setFocus(2, SOURCE);
    page.__enterInsert();
    const commit = {
      lineIndex: 2,
      text: "    - [ ] Draft the copy #task",
      markdown: "## Capture\n- [ ] Ship the launch note [[qntm:501]] #task\n    - [ ] Draft the copy #task",
      source: SOURCE,
      kind: "set-line",
    };
    const write = page.commitLine(VIEW, commit);
    // `#parentBadge`/`#freshness` WERE RETIRED (chore/retire-the-status-line) — asked of the
    // resolver directly, over the exact commit just walked, rather than read off the DOM before
    // `await write` let the stubbed answer land.
    const reading = page.__parentPromotionFor(VIEW, commit);
    assert.equal(page.__parentPromotionDiagnosticFor(reading), "parent: decided");
    assert.match(page.__parentPromotionNoteFor(reading), /the row above becomes outcome, sets auto_outcome/);
    await write;
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE ENUMERATION — every NormalEffect kind motions.ts declares, read off its own source, with
//    the promotion path proven reached wherever a relationship can genuinely change.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const MOTIONS_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "motions.ts"), "utf8");

/** Every `| { readonly kind: "..."` line inside `NormalEffect`'s own union — extracted the SAME
 * way `tests/app-gesture-write-path.test.mjs` already does, not a second hand-copied list, so a
 * kind arriving in motions.ts and not accounted for below fails this file rather than going quiet. */
function declaredEffectKinds() {
  const start = MOTIONS_SOURCE.indexOf("export type NormalEffect =");
  assert.ok(start !== -1, "motions.ts no longer declares NormalEffect");
  const end = MOTIONS_SOURCE.indexOf("\n\n", start);
  const block = MOTIONS_SOURCE.slice(start, end === -1 ? undefined : end);
  const kinds = [...block.matchAll(/\|\s*\{\s*readonly kind:\s*"([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(kinds.length > 0, "found no kind literals inside NormalEffect — the extraction is broken");
  return kinds;
}

// WHICH KINDS CAN EVER REACH `commitLine` AT ALL (mirrors `tests/app-gesture-write-path.test.mjs`'s
// own `COVERED_KINDS` table exactly, for the five that never commit anything), and — for the four
// that do — whether THIS leg's fix reaches the promotion path for them, and under what condition.
const PROMOTION_COVERAGE = {
  none: "no commit — a bare keystroke moves nothing, so no relationship can ever change",
  move: "no commit — j/k/G/gg move the selection only",
  "enter-insert": "reaches commitLine as set-line; promotion reached IFF the typed text changes this line's own leading whitespace (section 5), never when it does not (section 4)",
  column: "no commit — 0/$ move the column only",
  open: "reaches commitLine as insert-line; promotion reached when the opened line is typed at a deeper indent than the line above it",
  "toggle-done": "reaches commitLine as set-line with UNCHANGED leading whitespace — promotion never reached (section 4's own control)",
  boundary: "no commit — {/} move the selection only",
  indent: "reaches commitLine as set-line; promotion reached on `>` (section 1 — THE HEADLINE FIX), abstains on `<` (section 3)",
  word: "no commit — w/b/e move the column only",
};

test("6.0 every NormalEffect kind motions.ts declares is accounted for in the promotion coverage table", () => {
  assert.deepEqual(
    [...declaredEffectKinds()].sort(),
    Object.keys(PROMOTION_COVERAGE).sort(),
    "motions.ts gained or lost an effect kind that this file's promotion coverage table does not know about",
  );
});

// `#parentBadge` WAS RETIRED (chore/retire-the-status-line) — every test below now asks the
// promotion resolver directly, over a commit reconstructed from the same before/after text the
// real gesture just posted (`posted[0].body.markdown`), rather than reading a DOM element.
describe("6.1 the four commit-producing kinds, driven through the real page, wherever the relationship changes", () => {
  test("indent (>) — relationship gained — promotion reached", async () => {
    const { page, press, posted } = await freshPage("enum-indent-gain");
    press("j");
    press("j");
    press(">");
    // READ SYNCHRONOUSLY, BEFORE THE WRITE'S OWN ANSWER LANDS — see section 1's own comment: the
    // stubbed answer's `graphData` carries no `.graph`, so a "decided" read must happen before it.
    const commit = { lineIndex: 2, text: "    - [ ] Draft the copy #task", markdown: posted[0].body.markdown, source: SOURCE, kind: "set-line" };
    assert.equal(page.__parentPromotionDiagnosticFor(page.__parentPromotionFor(VIEW, commit)), "parent: decided");
    await new Promise((r) => setImmediate(r));
  });

  test("indent (<) — relationship lost — abstains, never a false 'decided'", async () => {
    const { page, press, posted } = await freshPage("enum-indent-loss", INDENTED);
    press("j");
    press("j");
    press("<");
    await new Promise((r) => setImmediate(r));
    const commit = { lineIndex: 2, text: "- [ ] Draft the copy #task", markdown: posted[0].body.markdown, source: INDENTED, kind: "set-line" };
    assert.equal(
      page.__parentPromotionDiagnosticFor(page.__parentPromotionFor(VIEW, commit)),
      "parent: abstained — structural-relationship-removed",
    );
  });

  test("toggle-done (x) — relationship unchanged — not evaluated at all", async () => {
    const { page, press, posted } = await freshPage("enum-toggle-done", INDENTED);
    press("j");
    press("j");
    press("x");
    await new Promise((r) => setImmediate(r));
    const commit = { lineIndex: 2, text: "    - [x] Draft the copy #task", markdown: posted[0].body.markdown, source: INDENTED, kind: "set-line" };
    assert.equal(page.__parentPromotionFor(VIEW, commit).kind, "not-evaluated");
  });

  test("enter-insert (i) — typed text changes leading whitespace — relationship gained — promotion reached", async () => {
    const { page, elements, press, posted } = await freshPage("enum-enter-insert-gain");
    press("j");
    press("j");
    assert.doesNotThrow(() => press("i"));
    const input = [...(elements.get("viewBody").children ?? [])]
      .flatMap(function collect(el) {
        return [el, ...((el.children ?? []).flatMap(collect))];
      })
      .find((el) => el.type === "text");
    assert.ok(input, "i did not open an editable line");
    input.value = "    - [ ] Draft the copy #task";
    input.dispatch("blur");
    // READ SYNCHRONOUSLY — see section 1's own comment on `graphData`'s stubbed shape.
    const commit = { lineIndex: 2, text: "    - [ ] Draft the copy #task", markdown: posted[0].body.markdown, source: SOURCE, kind: "set-line" };
    assert.equal(page.__parentPromotionDiagnosticFor(page.__parentPromotionFor(VIEW, commit)), "parent: decided");
    await new Promise((r) => setImmediate(r));
  });

  test("enter-insert (i) — typed text keeps the same leading whitespace — relationship unchanged — not evaluated", async () => {
    const { page, elements, press, posted } = await freshPage("enum-enter-insert-no-change");
    press("j");
    press("j");
    assert.doesNotThrow(() => press("i"));
    const input = [...(elements.get("viewBody").children ?? [])]
      .flatMap(function collect(el) {
        return [el, ...((el.children ?? []).flatMap(collect))];
      })
      .find((el) => el.type === "text");
    assert.ok(input, "i did not open an editable line");
    input.value = "- [ ] Draft the copy, retyped #task";
    input.dispatch("blur");
    await new Promise((r) => setImmediate(r));
    const commit = { lineIndex: 2, text: "- [ ] Draft the copy, retyped #task", markdown: posted[0].body.markdown, source: SOURCE, kind: "set-line" };
    assert.equal(page.__parentPromotionFor(VIEW, commit).kind, "not-evaluated");
  });

  test("open (o) — a new line typed at a deeper indent than the line above it — relationship gained — promotion reached", async () => {
    const parentOnly = "## Capture\n- [ ] Ship the launch note [[qntm:501]] #task";
    const { page, elements, press, posted } = await freshPage("enum-open-gain", parentOnly);
    press("j"); // line 1: the parent
    assert.doesNotThrow(() => press("o"));
    const input = [...(elements.get("viewBody").children ?? [])]
      .flatMap(function collect(el) {
        return [el, ...((el.children ?? []).flatMap(collect))];
      })
      .find((el) => el.type === "text");
    assert.ok(input, "o did not open a draft line");
    input.value = "    - [ ] Draft the copy #task";
    input.dispatch("blur");
    // READ SYNCHRONOUSLY — see section 1's own comment on `graphData`'s stubbed shape.
    const commit = { lineIndex: 2, text: "    - [ ] Draft the copy #task", markdown: posted[0].body.markdown, source: parentOnly, kind: "insert-line" };
    assert.equal(page.__parentPromotionDiagnosticFor(page.__parentPromotionFor(VIEW, commit)), "parent: decided");
    await new Promise((r) => setImmediate(r));
  });
});

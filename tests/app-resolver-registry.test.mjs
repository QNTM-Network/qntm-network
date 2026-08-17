/**
 * EVERY GESTURE WALKS THE WHOLE REGISTRY — the test class whose absence shipped three defects.
 *
 *   node --test tests/app-resolver-registry.test.mjs
 *
 * ── WHY THIS FILE EXISTS ──
 *
 * Every test that drove the resolvers drove ONE gesture: type a line, let it settle. `f448da2`
 * shipped `x` and `>`/`<` handlers that hand-built a `LineCommit` with `kind`/`source` left out —
 * two fields `LineCommit` (paint.ts) declares REQUIRED everywhere TypeScript is watching, and
 * `app/index.html` was not somewhere it was watching. Nothing drove those keys through a real
 * commit, so nothing caught it; it surfaced months later as a keystroke that vanished with no POST
 * and nothing on screen. `9bc50ab` fixed the handlers. This file closes the class.
 *
 * FIVE GESTURES, EACH THROUGH THE REAL PATH — the page's own `document` keydown listener, or (for
 * the two that are not keys) the painter's own settlement callback:
 *
 *   §1  `x`      — the checkbox toggle
 *   §2  `>`      — indent
 *   §3  `<`      — outdent
 *   §4  a hand-typed change to a line's own leading whitespace, with NO gesture at all
 *   §5  Enter    — a new line, captured and settled
 *
 * ── WHAT "WALKS THE REGISTRY" IS PROVEN WITH, RATHER THAN ASSERTED ──
 *
 * §6 instruments `defineResolver`'s own `run` inside a MUTATED COPY OF THE BUNDLE so every `read`
 * records which resolver made it, then drives all five gestures again. A gesture that reached
 * `commitLine` by any path OTHER than the walk — a fifth hand-written call site, a resolver skipped
 * by an early return — shows up as a missing id, not as a subtly wrong badge nobody notices.
 *
 * §7 is the order falsifier: the registry order decides exactly two things (the order the freshness
 * sentences are joined in, and the order predictions reach the predict surface) and must decide
 * nothing else. It reverses the array in a mutated bundle and asserts the badges, the POST body and
 * every reading are identical while the joined sentence reverses.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  REPO,
  importPage,
  installBrowser,
  makeEvent,
  makeWorkDir,
  mutatingBundle,
} from "./fixtures/app-html-page.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// Every `describe` mints its own `makeWorkDir` (one module instance per work dir, this fixture's
// own rule), and each registers a `process.on("exit", ...)` cleanup listener. Past Node's default
// cap of 10 — raised once, here, the same posture app-gesture-write-path.test.mjs takes.
process.setMaxListeners(40);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE FIXTURE — one declaration that gives ALL FOUR axes something real to answer, so a gesture
// that skipped one would be visible rather than indistinguishable from "that axis had nothing to
// say". A membership predicate, a default ordering over titles, a rule that fires on a fresh
// capture, and a graph-aware promotion rule for the row above.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const DECLARATION = {
  qualification: {
    defaultNodeType: "task",
    structuralNodeTypes: [],
    // `#outcome` MUST BE DECLARED — the rule table below retypes to `"outcome"`, and this file now
    // reads `show()`'s own sentence in places, which (2026-08-07) reports `arm`'s own render
    // abstention honestly rather than staying silent about it.
    tokens: {
      node_type: { "#task": "task", "#outcome": "outcome" },
      domain: { "#work": "work" },
      status: { "[ ]": "open", "[x]": "done" },
    },
    predicates: {
      "open-tasks": { find: { nodeType: ["task"], fields: { domain: { eq: null } } }, exclude: [] },
    },
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
    // THE ENGINE'S OWN FALLBACK (`section_builder.py`'s `_DEFAULT_ORDERING`), narrowed to the one
    // key this fixture's lines actually differ on — so the ordering axis has a real question to
    // answer for a section that declares no `ordering:` of its own, which is most of the vault.
    defaultOrdering: [{ field: "title", direction: "asc" }],
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
    order: { established: true, sequence: ["stamp-new", "a-task-with-an-open-child-becomes-an-outcome"] },
    rules: {
      "stamp-new": {
        pattern: "any-task",
        when: { op: "true" },
        priority: 0,
        actions: [{ verb: "set", field: "demo_flag", to: true }],
      },
      "a-task-with-an-open-child-becomes-an-outcome": {
        pattern: "tasks-with-an-open-child",
        when: { op: "true" },
        priority: 1,
        actions: [
          { verb: "retype", to: "outcome" },
          { verb: "set", field: "auto_outcome", to: true },
        ],
      },
    },
    patterns: {
      "any-task": { find: { nodeType: ["task"], fields: {} }, exclude: [] },
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
    fieldMarkers: { demo_flag: { token: "🚩", kind: "int" } },
    dropped: {},
  },
};

const VIEW = { id: "demo", path: "demo.md", title: "Demo", domain: "demo" };
const GRAPH = { nodes: [{ id: "qntm:501", type: "task", fields: { status: "open" } }], edges: [] };

/**
 * Line 0 a heading, line 1 an already-stamped parent, line 2 an ordinary unstamped sibling.
 *
 * DELIBERATELY THE SAME DOCUMENT FOR EVERY GESTURE, so a difference between two sections is the
 * gesture and never the fixture. Line 2 carries a checkbox (`x` has something to toggle), sits at
 * zero indent (`>` can indent it, `<` is the no-op case §3 needs the INDENTED variant for), and is
 * unstamped (the rules axis can resolve fields for it).
 */
const SOURCE = [
  "## Capture",
  "- [ ] Ship the launch note [[qntm:501]] #task",
  "- [ ] Draft the copy #task",
].join("\n");

/** The same document with line 2 already indented — what `<` needs in order to REMOVE a parent. */
const INDENTED = [
  "## Capture",
  "- [ ] Ship the launch note [[qntm:501]] #task",
  "    - [ ] Draft the copy #task",
].join("\n");

/** Answers a POST the way the real Worker's synchronous shape does, echoing the markdown back. */
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

/** A fresh page, painted, cursor parked at line 0, driven through the REAL keydown wiring. */
async function freshPage(label, markdown = SOURCE, mutate) {
  const work = makeWorkDir(label);
  const { elements, document: doc } = installBrowser();
  const fetchImpl = postStub();
  globalThis.fetch = fetchImpl;
  const page = await importPage(work, mutate);
  page.__applyPresentation(DECLARATION);
  page.__setGraphData({
    snapshot: { generated_at: "2026-08-05T00:00:00Z", views: [{ ...VIEW, markdown }], graph: GRAPH },
  });
  page.paintView(VIEW.id);
  const press = (key) => doc.dispatch("keydown", makeEvent({ key }));
  press("g");
  press("g");
  // `#membershipBadge`/`#orderingBadge`/`#rulesBadge`/`#parentBadge` WERE RETIRED
  // (chore/retire-the-status-line, the abstention register) — `badges(commit)` now asks each
  // resolver directly, over the SAME commit `commitLine` walked, the same registry walk that used
  // to feed those four DOM sinks. A resolver that stayed silent for this gesture still returns ""
  // from its own `.show()` (`not-evaluated` produces no diagnostic, `diagnosticOf` reads as `""`
  // via `__xDiagnosticFor`'s own shape), so "" is still exactly what a silent register means.
  const badges = (commit) => ({
    membership: page.__membershipDiagnosticFor(VIEW, commit),
    ordering: page.__orderingDiagnosticFor(VIEW, commit),
    rules: page.__rulesDiagnosticFor(page.__rulesReadingFor(VIEW, commit)),
    parent: page.__parentPromotionDiagnosticFor(page.__parentPromotionFor(VIEW, commit)),
  });
  return { page, elements, doc, press, badges, posted: fetchImpl.posted, work };
}

/** Settle the microtask queue so `commitLine`'s own `await` resolves before the assertions. */
const settled = () => new Promise((r) => setImmediate(r));

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1-5. THE FIVE GESTURES, EACH THROUGH THE REAL PATH
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. `x` — the checkbox toggle reaches the write path and every register answers", () => {
  test("the tick posts, and the membership register reports a real decision for the toggled line", async () => {
    const { press, badges, posted } = await freshPage("registry-x");
    press("j");
    press("j"); // line 2 — "- [ ] Draft the copy #task"
    assert.doesNotThrow(() => press("x"), "`x` threw in commitLine's synchronous prefix");
    await settled();

    const write = posted[0];
    assert.ok(write, "`x` never reached the write endpoint");
    assert.match(write.body.markdown, /- \[x\] Draft the copy #task/, "the tick did not reach the wire");

    const commit = { lineIndex: 2, text: "- [x] Draft the copy #task", markdown: write.body.markdown, source: SOURCE, kind: "set-line" };
    // THE MEMBERSHIP AXIS ANSWERED — a `set-line` commit inside a published section, which is
    // exactly the shape it evaluates. That it says "decided" rather than "" is the evidence the
    // walk reached it: a gesture that skipped the registry leaves this badge empty.
    assert.equal(badges(commit).membership, "membership: decided");
    // AND THE ORDERING AXIS ANSWERED TOO, off the engine's own default ordering.
    assert.match(badges(commit).ordering, /^ordering: (decided|abstained — )/);
  });

  test("a tick that changes no structural relationship leaves the parent register alone", async () => {
    // THE CONTROL. `x` is a `set-line` commit like `>` is, and if promotion fired on every
    // `set-line` this badge would carry an answer it has no business having.
    const { press, badges, posted } = await freshPage("registry-x-control");
    press("j");
    press("j");
    press("x");
    await settled();
    const commit = { lineIndex: 2, text: "- [x] Draft the copy #task", markdown: posted[0].body.markdown, source: SOURCE, kind: "set-line" };
    assert.equal(badges(commit).parent, "", "a tick must not make the promotion axis answer for the row above");
  });
});

describe("2. `>` — indent reaches the write path and the promotion register answers for the row above", () => {
  test("the indent posts, and the parent's promotion is decided on that commit", async () => {
    const { page, press, badges, posted } = await freshPage("registry-indent");
    press("j");
    press("j");
    assert.doesNotThrow(() => press(">"), "`>` threw in commitLine's synchronous prefix");

    // READ SYNCHRONOUSLY — `#parentBadge`/`#freshness` are retired (chore/retire-the-status-line),
    // but the timing they used to be read at still matters: the stubbed answer's `graphData`
    // carries no `.graph`, so a "decided" read must happen before `commitLine`'s own
    // `await writeFile(...)` lets it land. `posted[0]` already exists here (`fetch` runs
    // synchronously up to its own first `await`).
    const commit = {
      lineIndex: 2,
      text: "    - [ ] Draft the copy #task",
      markdown: posted[0].body.markdown,
      source: SOURCE,
      kind: "set-line",
    };
    assert.equal(badges(commit).parent, "parent: decided");
    assert.match(page.__parentPromotionNoteFor(page.__parentPromotionFor(VIEW, commit)), /the row above .*becomes outcome/);

    await settled();
    const write = posted[0];
    assert.ok(write, "`>` never reached the write endpoint");
    assert.equal(
      write.body.markdown,
      "## Capture\n- [ ] Ship the launch note [[qntm:501]] #task\n    - [ ] Draft the copy #task",
    );
  });
});

describe("3. `<` — outdent reaches the write path and the promotion register abstains VISIBLY", () => {
  test("the outdent posts, and the browser says it cannot check rather than falling silent", async () => {
    const { press, badges, posted } = await freshPage("registry-outdent", INDENTED);
    press("j");
    press("j");
    assert.doesNotThrow(() => press("<"), "`<` threw in commitLine's synchronous prefix");

    // A REMOVED RELATIONSHIP IS AN HONEST UNKNOWN, NOT A CONFIDENT "NO CHANGE" — the graph-aware
    // pass can only ever ADD a prospective child, never subtract one the live graph still names.
    const commit = {
      lineIndex: 2,
      text: "- [ ] Draft the copy #task",
      markdown: posted[0].body.markdown,
      source: INDENTED,
      kind: "set-line",
    };
    assert.equal(badges(commit).parent, "parent: abstained — structural-relationship-removed");

    await settled();
    const write = posted[0];
    assert.ok(write, "`<` never reached the write endpoint");
    assert.equal(
      write.body.markdown,
      "## Capture\n- [ ] Ship the launch note [[qntm:501]] #task\n- [ ] Draft the copy #task",
    );
  });
});

describe("4. A HAND-TYPED LEADING-WHITESPACE CHANGE — no gesture at all, same registry walk", () => {
  test("typing four spaces onto a line reaches every register exactly as `>` does", async () => {
    // NO KEYSTROKE GRAMMAR IS INVOLVED. This is `commitLine` called with the commit the painter's
    // own settlement produces when the operator edits an existing row's text — the case a fix
    // scoped to the indent MOTION would have missed entirely.
    const { page, badges, posted } = await freshPage("registry-typed-indent");
    const AFTER = "## Capture\n- [ ] Ship the launch note [[qntm:501]] #task\n    - [ ] Draft the copy #task";
    const commit = {
      lineIndex: 2,
      text: "    - [ ] Draft the copy #task",
      markdown: AFTER,
      source: SOURCE,
      kind: "set-line",
    };
    const write = page.commitLine(VIEW, commit);
    assert.equal(
      badges(commit).parent,
      "parent: decided",
      "a typed indent must reach the promotion axis — it is the same relationship change `>` makes",
    );
    await write;
    await settled();
    assert.equal(posted[0]?.body.markdown, AFTER, "the typed indent never reached the write endpoint");
  });
});

describe("5. Enter — a new line, captured and settled, walks the registry too", () => {
  test("the capture posts, and the rules axis decides for the freshly typed row", async () => {
    const { page, badges, posted } = await freshPage("registry-enter");
    const AFTER = `${SOURCE}\n- [ ] Book the venue #task`;
    const commit = {
      lineIndex: 3,
      text: "- [ ] Book the venue #task",
      markdown: AFTER,
      source: SOURCE,
      kind: "insert-line",
    };
    const write = page.commitLine(VIEW, commit);
    // THE RULES AXIS IS THE ONE SCOPED TO A FRESH CAPTURE — `insert-line` is the only commit kind
    // it evaluates at all, so this badge answering is the evidence the walk reached it on THIS
    // gesture and not merely on the four above.
    assert.equal(badges(commit).rules, "rules: decided");
    assert.match(page.__rulesNoteFor(page.__rulesReadingFor(VIEW, commit)), /this line sets demo_flag/);
    await write;
    await settled();
    assert.equal(posted[0]?.body.markdown, AFTER, "the capture never reached the write endpoint");
    assert.ok(
      !posted[0].body.markdown.includes("🚩"),
      "the write must carry what he typed and nothing a rules pass decided",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE WALK ITSELF — every gesture consults EVERY resolver, in the declared order
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * `defineResolver`'s own `run`, instrumented in a mutated copy of the bundle so every `read`
 * records which resolver made it.
 *
 * THIS IS THE ASSERTION THE BADGES CANNOT MAKE. A resolver whose `read` returns `not-evaluated`
 * writes nothing, so an empty badge is indistinguishable from a resolver that was never consulted
 * — which is precisely the failure mode `f448da2` had (a gate that skipped a broken commit object
 * looked exactly like an axis with nothing to say). Recording the call is the difference.
 */
const withWalkProbe = mutatingBundle([
  "      const reading = spec.read(ctx);",
  "      (globalThis.__walked ??= []).push(spec.id);\n      const reading = spec.read(ctx);",
]);

describe("6. EVERY GESTURE WALKS EVERY RESOLVER, IN THE ORDER THE REGISTRY DECLARES", () => {
  const EXPECTED = ["membership", "ordering", "rules", "parent"];

  const walkedBy = async (label, drive, markdown = SOURCE) => {
    const work = makeWorkDir(label);
    const { document: doc } = installBrowser();
    const fetchImpl = postStub();
    globalThis.fetch = fetchImpl;
    const page = await importPage(work, withWalkProbe(work));
    page.__applyPresentation(DECLARATION);
    page.__setGraphData({
      snapshot: { generated_at: "2026-08-05T00:00:00Z", views: [{ ...VIEW, markdown }], graph: GRAPH },
    });
    page.paintView(VIEW.id);
    const press = (key) => doc.dispatch("keydown", makeEvent({ key }));
    press("g");
    press("g");
    globalThis.__walked = [];
    await drive({ page, press });
    await settled();
    return globalThis.__walked;
  };

  test("`x` walks all four", async () => {
    const walked = await walkedBy("walk-x", ({ press }) => {
      press("j");
      press("j");
      press("x");
    });
    assert.deepEqual(walked, EXPECTED);
  });

  test("`>` walks all four", async () => {
    const walked = await walkedBy("walk-indent", ({ press }) => {
      press("j");
      press("j");
      press(">");
    });
    assert.deepEqual(walked, EXPECTED);
  });

  test("`<` walks all four", async () => {
    const walked = await walkedBy(
      "walk-outdent",
      ({ press }) => {
        press("j");
        press("j");
        press("<");
      },
      INDENTED,
    );
    assert.deepEqual(walked, EXPECTED);
  });

  test("a hand-typed leading-whitespace change walks all four", async () => {
    const walked = await walkedBy("walk-typed", ({ page }) =>
      page.commitLine(VIEW, {
        lineIndex: 2,
        text: "    - [ ] Draft the copy #task",
        markdown: INDENTED,
        source: SOURCE,
        kind: "set-line",
      }),
    );
    assert.deepEqual(walked, EXPECTED);
  });

  test("Enter — a fresh capture — walks all four", async () => {
    const walked = await walkedBy("walk-enter", ({ page }) =>
      page.commitLine(VIEW, {
        lineIndex: 3,
        text: "- [ ] Book the venue #task",
        markdown: `${SOURCE}\n- [ ] Book the venue #task`,
        source: SOURCE,
        kind: "insert-line",
      }),
    );
    assert.deepEqual(walked, EXPECTED);
  });

  test("MUTATION PROOF: with the probe in place but one resolver dropped, the assertion goes red", async () => {
    // A GUARD THAT CANNOT GO RED IS DECORATION. Drop the rules resolver from the registry and the
    // five assertions above stop being able to pass — which is what makes them proof that the walk
    // reaches every entry rather than merely that SOMETHING ran.
    const work = makeWorkDir("walk-mutant-missing");
    const mutate = mutatingBundle(
      ["      const reading = spec.read(ctx);", "      (globalThis.__walked ??= []).push(spec.id);\n      const reading = spec.read(ctx);"],
      ["  defineResolver(rulesSpec),\n", ""],
    )(work);
    const { document: doc } = installBrowser();
    globalThis.fetch = postStub();
    const page = await importPage(work, mutate);
    page.__applyPresentation(DECLARATION);
    page.__setGraphData({
      snapshot: { generated_at: "2026-08-05T00:00:00Z", views: [{ ...VIEW, markdown: SOURCE }], graph: GRAPH },
    });
    page.paintView(VIEW.id);
    const press = (key) => doc.dispatch("keydown", makeEvent({ key }));
    press("g");
    press("g");
    globalThis.__walked = [];
    press("j");
    press("j");
    press("x");
    await settled();
    assert.deepEqual(globalThis.__walked, ["membership", "ordering", "parent"]);
    assert.throws(
      () => assert.deepEqual(globalThis.__walked, EXPECTED),
      /deep-equal/,
      "the walk assertion passed against a registry missing a resolver — it proves nothing",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7. THE ORDER FALSIFIER — the registry order decides TWO things and must decide nothing else
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("7. REGISTRY ORDER decides the joined sentence and the prediction order — and nothing else", () => {
  /**
   * The registry, reversed, in a mutated copy of the bundle.
   *
   * `registry.ts`'s own header claims the walk is order-INDEPENDENT except for two outputs. This is
   * the falsifier for that claim: if a resolver could see another's answer, or if a badge or a POST
   * body depended on the order, reversing the array would move something this test asserts is
   * still.
   */
  const REVERSED = [
    "var RESOLVERS = [\n  defineResolver(membershipSpec),\n  defineResolver(orderingSpec),\n  defineResolver(rulesSpec),\n  defineResolver(promotionSpec)\n];",
    "var RESOLVERS = [\n  defineResolver(promotionSpec),\n  defineResolver(rulesSpec),\n  defineResolver(orderingSpec),\n  defineResolver(membershipSpec)\n];",
  ];

  const driveIndent = async (label, mutate) => {
    const work = makeWorkDir(label);
    const { document: doc } = installBrowser();
    const fetchImpl = postStub();
    globalThis.fetch = fetchImpl;
    const page = await importPage(work, mutate === undefined ? undefined : mutate(work));
    page.__applyPresentation(DECLARATION);
    page.__setGraphData({
      snapshot: { generated_at: "2026-08-05T00:00:00Z", views: [{ ...VIEW, markdown: SOURCE }], graph: GRAPH },
    });
    page.paintView(VIEW.id);
    const press = (key) => doc.dispatch("keydown", makeEvent({ key }));
    press("g");
    press("g");
    press("j");
    press("j");
    press(">");
    // READ SYNCHRONOUSLY — `#membershipBadge`/`#orderingBadge`/`#rulesBadge`/`#parentBadge`/
    // `#freshness` are retired (chore/retire-the-status-line); every axis is asked directly
    // instead, over the exact commit `commitLine` walked, before the stubbed answer's graph-less
    // `graphData` lands.
    const commit = {
      lineIndex: 2,
      text: "    - [ ] Draft the copy #task",
      markdown: fetchImpl.posted[0].body.markdown,
      source: SOURCE,
      kind: "set-line",
    };
    const seen = {
      membership: page.__membershipDiagnosticFor(VIEW, commit),
      ordering: page.__orderingDiagnosticFor(VIEW, commit),
      rules: page.__rulesDiagnosticFor(page.__rulesReadingFor(VIEW, commit)),
      parent: page.__parentPromotionDiagnosticFor(page.__parentPromotionFor(VIEW, commit)),
    };
    await settled();
    return { seen, posted: fetchImpl.posted };
  };

  test("reversing the registry leaves every badge and the POST body byte-identical", async () => {
    const straight = await driveIndent("order-straight");
    const reversed = await driveIndent("order-reversed", mutatingBundle(REVERSED));
    assert.equal(reversed.seen.membership, straight.seen.membership);
    assert.equal(reversed.seen.ordering, straight.seen.ordering);
    assert.equal(reversed.seen.rules, straight.seen.rules);
    assert.equal(reversed.seen.parent, straight.seen.parent);
    // THE TOKEN IS EXCLUDED, AND IT IS THE ONLY THING EXCLUDED. `mintWriteToken` reads the
    // browser's CSPRNG once per write, so two runs of the same gesture differ there by
    // construction and by design — comparing it would assert that a random handle is deterministic,
    // which is neither true nor what this test is about.
    const withoutToken = ({ token, ...rest }) => rest;
    assert.deepEqual(withoutToken(reversed.posted[0].body), withoutToken(straight.posted[0].body));
  });

  // "and it DOES move the one thing the order is declared to decide — the joined sentence" is
  // GONE. It proved that reversing the registry moved the ORDER of the freshness line's clauses —
  // `outcome.notes.join(" · ")`, written into `#freshness`. `commitLine` no longer joins
  // `outcome.notes` into anything (chore/retire-the-status-line): the field is still produced by
  // the walk (bundled with `.placements`/`.predictions`, which do real work) but nothing on the
  // page reads it, so there is no DOM sentence left for the order to move. `registry.ts`'s own
  // header still names "the order the freshness-line sentences are joined in" as one of two things
  // order decides; that claim is now stale prose in a file this branch does not otherwise touch.
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7b. THE ONE FRAGILITY THE GENERALISATION INTRODUCED, CLOSED BY PROOF RATHER THAN BY PROMISE
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("7b. every resolver's abstention sentence carries its own id — the badge class depends on it", () => {
  /**
   * `diagnosticOf` derives `abstained` from `text.startsWith(`${spec.id}: abstained`)` — one rule,
   * where four hand-written `update*Badge` functions each had their own copy of the same prefix
   * check. That is a real simplification and it introduced a real fragility: a resolver whose
   * sentence did not begin with its own id would be reported as a DECIDED answer while saying it
   * abstained, silently, with the wrong badge class and no test to notice.
   *
   * SO THE COUPLING IS PROVEN, NOT ASSUMED. Every spec, driven with an abstention reading — the one
   * reading shape every `show` handles identically, because it only reads `.kind` and `.because` —
   * must produce a diagnostic flagged `abstained`. A fifth resolver that words its sentence
   * differently fails here rather than shipping a badge that lies.
   */
  test("an abstention from ANY spec is flagged as one", async () => {
    const bundle = await import(pathToFileURL(join(REPO, "dist", "present.js")).href);
    const specs = [bundle.membershipSpec, bundle.orderingSpec, bundle.rulesSpec, bundle.promotionSpec];
    assert.equal(specs.length, bundle.RESOLVERS.length, "a resolver exists that this test does not drive");
    for (const spec of specs) {
      const diagnostic = bundle.diagnosticOf(spec, { kind: "abstains", because: "a-reason-nobody-publishes" });
      assert.ok(diagnostic, `${spec.id} says nothing at all for an abstention`);
      assert.equal(diagnostic.badge, spec.badge);
      assert.equal(
        diagnostic.abstained,
        true,
        `${spec.id}'s abstention sentence does not start with "${spec.id}: abstained" — the badge class is wrong`,
      );
      assert.match(diagnostic.text, new RegExp(`^${spec.id}: abstained`));
    }
  });

  test("and a NOT-EVALUATED reading from any spec writes no badge at all", () => {
    // THE OTHER HALF. A resolver this gesture never asked must leave the badge showing the last
    // real evaluation rather than blanking it — which `diagnosticOf` expresses as `null`, and which
    // `commitLine` expresses by simply not iterating over it.
    return import(pathToFileURL(join(REPO, "dist", "present.js")).href).then((bundle) => {
      for (const spec of [bundle.membershipSpec, bundle.orderingSpec, bundle.rulesSpec, bundle.promotionSpec]) {
        assert.equal(bundle.diagnosticOf(spec, { kind: "not-evaluated" }), null, `${spec.id} wrote a badge it should not`);
      }
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 8. THE PAGE NAMES NO RESOLVER — the acceptance test for the whole restructure, as a grep
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("8. `commitLine` names no resolver — it builds a context, walks the registry, joins the result", () => {
  // `commitLine` relocated to app/present/commit.ts (2026-08-07, see that module's own header) —
  // read that module instead of the page. The signature carries TS types now (`view: CommitLineView,
  // commit: LineCommit`), so the anchor string matches on the name and the open paren only.
  const COMMIT_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "commit.ts"), "utf8");
  const commitLineBody = (() => {
    const at = COMMIT_SOURCE.indexOf("async function commitLine(");
    assert.ok(at > 0, "commitLine was not found — this test is checking the wrong source");
    const end = COMMIT_SOURCE.indexOf("\n  }\n  return commitLine;\n}", at);
    assert.ok(end > at, "commitLine's own closing could not be found — this test is checking the wrong source");
    return COMMIT_SOURCE.slice(at, end);
  })();

  test("no axis is named in commitLine's own body", () => {
    for (const name of ["membership", "ordering", "rules", "parent", "promotion"]) {
      assert.doesNotMatch(
        commitLineBody.replace(/\/\/.*$/gm, ""),
        new RegExp(`\\b${name}`, "i"),
        `commitLine names the ${name} axis — the whole point of the registry is that it cannot`,
      );
    }
  });

  // `resolveAndArm` — the extracted "run resolvers, report abstentions, arm settle, arm predict"
  // step (2026-08-17, so the SAME sequence can be reused by a graph-refresh retry without a second,
  // hand-copied one living elsewhere — see commit.ts's own header on that function). `commitLine`
  // itself now reaches all four calls only by calling THIS function; the assertions this section
  // used to make directly against `commitLineBody` for those four calls now check `resolveAndArm`'s
  // own body instead, extracted the identical way `commitLineBody` above is (a literal start/end
  // marker into the raw source, so a future edit that moves the boundary breaks this test rather
  // than silently stops checking anything).
  const resolveAndArmBody = (() => {
    const at = COMMIT_SOURCE.indexOf("export function resolveAndArm(");
    assert.ok(at > 0, "resolveAndArm was not found — this test is checking the wrong source");
    const end = COMMIT_SOURCE.indexOf("\n  return outcome;\n}", at);
    assert.ok(end > at, "resolveAndArm's own closing could not be found — this test is checking the wrong source");
    return COMMIT_SOURCE.slice(at, end);
  })();

  test("commitLine reaches the walk through resolveAndArm, exactly once, and calls none of its four steps directly", () => {
    // `deps.buildContext(view, commit)`, not the bare `resolverContextFor(view, commit)` the page
    // used to call directly — `resolverContextFor` itself DID NOT move (see commit.ts's own header
    // for why); `resolveAndArm` reaches it only through the deps object (checked below, on
    // `resolveAndArm`'s own body).
    const codeOnly = commitLineBody.replace(/\/\/.*$/gm, "");
    assert.match(codeOnly, /resolveAndArm\(deps, view, commit\)/, "commitLine must reach the resolver walk through resolveAndArm");
    assert.equal((codeOnly.match(/resolveAndArm\(/g) ?? []).length, 1, "commitLine must call resolveAndArm exactly once");
    // NONE of the four calls `resolveAndArm` itself makes may ALSO appear directly in commitLine's
    // own body — a second, hand-copied call here would be exactly the duplication `resolveAndArm`
    // exists to prevent (see that function's own header).
    for (const call of ["runResolvers(", "armSettle(", "armPredict("]) {
      assert.doesNotMatch(
        codeOnly,
        new RegExp(call.replace(/[()]/g, "\\$&")),
        `commitLine must not call ${call} directly — that belongs to resolveAndArm alone`,
      );
    }
  });

  test("resolveAndArm walks the registry exactly once and arms exactly what does real work with what comes back", () => {
    assert.match(resolveAndArmBody, /runResolvers\(RESOLVERS, deps\.buildContext\(view, commit\)\)/);
    assert.equal((resolveAndArmBody.match(/runResolvers\(/g) ?? []).length, 1);
    // `outcome.notes.join(" · ")` (the freshness line's prediction clause) is GONE
    // (chore/retire-the-status-line) and STAYS gone — `resolveAndArm` must never re-narrate what it
    // already decided into an on-screen sentence, the operator's own reason for killing it.
    //
    // `outcome.diagnostics` IS DIFFERENT, AND IS DELIBERATELY BACK (2026-08-07,
    // design-the-rule-mirror.md §9.2 / roadmap-the-road-ahead.md step 2) — but ONLY through
    // `reportAbstentions`, which narrows to genuine refusals (`abstentionsOf`) and writes to
    // `console.debug`, never a DOM badge. `tests/app-abstention-diagnostic.test.mjs` is the
    // falsifier for that mechanism; this test only pins that `resolveAndArm`'s OWN body reads the
    // field through that one function and no other way.
    // CODE ONLY — resolveAndArm's own comment explains what used to be here, in prose, and a bare
    // string search would mistake that sentence for the code it describes.
    const codeOnly = resolveAndArmBody.replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(codeOnly, /outcome\.notes\b/, "resolveAndArm still reads outcome.notes — the retired narration is back");
    assert.equal(
      (codeOnly.match(/outcome\.diagnostics\b/g) ?? []).length,
      1,
      "resolveAndArm must read outcome.diagnostics exactly once, and only to hand it to reportAbstentions",
    );
    assert.match(codeOnly, /deps\.reportAbstentions\(outcome\.diagnostics\)/, "resolveAndArm must route outcome.diagnostics through reportAbstentions, never a bare loop or a DOM write");
    assert.match(resolveAndArmBody, /armSettle\(deps\.settle, commit\.markdown, view\.id, outcome\.placements\)/);
    assert.match(resolveAndArmBody, /armPredict\(deps\.predict, commit\.markdown, view\.id, outcome\.predictions\)/);
  });

  test("MUTATION PROOF: a page that named one axis fails the grep above", () => {
    // The falsifier for §8's first test — the pattern it uses must actually catch a named axis.
    const named = commitLineBody + "\n  updateRulesBadge(rulesReading);";
    assert.throws(() =>
      assert.doesNotMatch(named.replace(/\/\/.*$/gm, ""), /\brules/i, "commitLine names the rules axis"),
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 9. THE SEAM IS A COMMENT AND ONE FUNCTION, NOT A FILE NOTHING READS
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("9. the config seam is authored where it will be read, and nowhere else", () => {
  test("every resolver reaches the registry through defineResolver — the single point of entry", () => {
    const registry = readFileSync(resolve(HERE, "..", "app", "present", "resolvers", "registry.ts"), "utf8");
    const entries = registry.match(/defineResolver\(/g) ?? [];
    assert.ok(entries.length >= 4, "the registry no longer builds its resolvers through defineResolver");
    // NO SPEC MAY BE PUT IN THE ARRAY RAW. A resolver that bypassed `defineResolver` would bypass
    // the one place a config-published order will later map onto specs.
    assert.doesNotMatch(registry, /RESOLVERS[^=]*=\s*\[[^\]]*[^(]\bmembershipSpec\b/);
  });

  test("and nothing was published ahead of a reader — no declaration file, no config key, no generator", () => {
    // GATE-DERIVED-IS-NOT-AUTHORED, checked rather than promised: this system's highest-frequency
    // defect is a declaration that exists and does not reach. The seam is a comment and a single
    // point of entry; if a later leg adds a generated resolver-order document, this test is what
    // forces it to land WITH the reader that consumes it.
    const registry = readFileSync(resolve(HERE, "..", "app", "present", "resolvers", "registry.ts"), "utf8");
    assert.doesNotMatch(registry, /readFileSync|fetch\(|import .* from "\.\..*\.json"/);
  });
});

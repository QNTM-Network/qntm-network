/**
 * SAY THE ORDERING ANSWER — design-the-resolution-architecture.md step 7, through
 * app/index.html's OWN LIFTED SCRIPT, not through a reconstruction of it.
 *
 *   node --test tests/app-ordering-note.test.mjs
 *
 * Same shape `tests/app-membership-note.test.mjs` already established for step 4's
 * `membershipNoteFor`, restated for `orderingNoteFor`:
 *
 *   1. THE OPERATOR'S OWN SHAPE, END TO END — a flat "Queue" section, an edit that changes a
 *      row's `queue_position` says "this line will move within Queue"; an edit that leaves it
 *      unchanged says nothing; both driven through the real `commitLine`, not the bare function.
 *   2. BOTH NOTES SHARE ONE SLOT — an edit that fires membership AND ordering in the same commit
 *      joins them with " · ", proving `writeFile`'s single `note` parameter (this step's own
 *      change to that function) carries more than one prediction without a second write path.
 *   3. EVERY REFUSAL PATH PRODUCES SILENCE, restated through the page's own `orderingNoteFor`.
 *   4. NOTHING LOCAL REACHES A WRITE — the SAME pinned counts
 *      `tests/app-membership-note.test.mjs` §4 already proves, re-verified here so a reviewer of
 *      THIS file alone sees the invariant this step's own change must not break, plus the one
 *      check unique to this function: it imports nothing from `source.ts`.
 *
 * WHAT THIS FILE DOES NOT COVER: no browser, no passkey session, no live server, no cycle.
 * `toggleTask` and vim's `x` are not wired to `orderingNoteFor`, the same stated gap
 * `tests/app-membership-note.test.mjs` names for `membershipNoteFor`.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { importPage, installBrowser, makeWorkDir } from "./fixtures/app-html-page.mjs";
import { orderingPlacementFor, resolveOrderingPlacementFor } from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = makeWorkDir("app-ordering-note");

const FAKE_DECLARATION = {
  qualification: {
    defaultNodeType: "task",
    structuralNodeTypes: [],
    tokens: { node_type: {}, domain: { "#work": "work" }, status: { "[ ]": "open", "[x]": "done" } },
    predicates: {},
    sections: {},
    sectionOrder: { demo: ["queue"] },
    refused: {},
  },
  resolution: {
    ordering: {
      demo: { queue: { ordering: [{ field: "queue_position", direction: "asc" }], orderingMode: undefined, name: "Queue" } },
    },
    orderingFields: { queue_position: { token: "🔢", kind: "int" } },
  },
};

const DEMO_SOURCE = [
  "## Queue", // ordinal 0 -> "queue"
  "- [ ] a [[qntm:1]] 🔢 1",
  "- [ ] b [[qntm:2]] 🔢 2",
  "- [ ] c [[qntm:3]] 🔢 3",
].join("\n");

const DEMO_VIEW = { id: "demo", path: "demo.md" };

describe("1. THE OPERATOR'S OWN SHAPE — orderingNoteFor directly, against a hand-built declaration", () => {
  let page;

  before(async () => {
    installBrowser();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
    page.__applyPresentation(FAKE_DECLARATION);
  });

  const note = (patch) =>
    page.__orderingNoteFor(DEMO_VIEW, {
      lineIndex: 3,
      text: "- [ ] c [[qntm:3]] 🔢 3",
      markdown: "irrelevant to this suite",
      source: DEMO_SOURCE,
      kind: "set-line",
      ...patch,
    });

  test('moving c from rank 3 to rank 1 says "this line will move within Queue"', () => {
    assert.equal(note({ text: "- [ ] c [[qntm:3]] 🔢 1" }), "this line will move within Queue");
  });

  test("an edit that leaves the sort key unchanged says nothing", () => {
    assert.equal(note({}), "");
  });

  test("an edit to an UNRELATED field, rank unchanged, says nothing", () => {
    assert.equal(note({ text: "- [ ] c renamed [[qntm:3]] 🔢 3" }), "");
  });
});

describe("3. EVERY REFUSAL PATH PRODUCES SILENCE, through orderingNoteFor", () => {
  let page;

  before(async () => {
    installBrowser();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
  });

  test('ABSTENTION — "no-section-declaration": a section outside the published table', () => {
    page.__applyPresentation(FAKE_DECLARATION);
    const said = page.__orderingNoteFor(DEMO_VIEW, {
      lineIndex: 10,
      text: "- [ ] x",
      markdown: "irrelevant",
      source: "## Somewhere Else\n- [ ] x",
      kind: "set-line",
    });
    assert.equal(said, "");
  });

  test("an INSERTED line is refused rather than misattributed", () => {
    page.__applyPresentation(FAKE_DECLARATION);
    const said = page.__orderingNoteFor(DEMO_VIEW, {
      lineIndex: 3,
      text: "- [ ] c [[qntm:3]] 🔢 1",
      markdown: "irrelevant",
      source: DEMO_SOURCE,
      kind: "insert-line",
    });
    assert.equal(said, "");
  });

  test("with no declaration loaded at all, orderingNoteFor says nothing rather than throwing", () => {
    page.__applyPresentation({});
    assert.doesNotThrow(() =>
      page.__orderingNoteFor(DEMO_VIEW, {
        lineIndex: 3,
        text: "- [ ] c [[qntm:3]] 🔢 1",
        markdown: "irrelevant",
        source: DEMO_SOURCE,
        kind: "set-line",
      }),
    );
    assert.equal(
      page.__orderingNoteFor(DEMO_VIEW, {
        lineIndex: 3,
        text: "- [ ] c [[qntm:3]] 🔢 1",
        markdown: "irrelevant",
        source: DEMO_SOURCE,
        kind: "set-line",
      }),
      "",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. BOTH NOTES SHARE ONE SLOT — through the real commitLine, joined with " · "
// ══════════════════════════════════════════════════════════════════════════════════════════════

const BOTH_DECLARATION = {
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
      demo2: {
        "domain-empty": { qualification: "domain-empty", nodeType: "task", name: "Domain Empty" },
      },
    },
    sectionOrder: { demo2: ["domain-empty"] },
    refused: {},
  },
  resolution: {
    ordering: {
      demo2: { "domain-empty": { ordering: [{ field: "queue_position", direction: "asc" }], orderingMode: undefined, name: "Domain Empty" } },
    },
    orderingFields: { queue_position: { token: "🔢", kind: "int" } },
  },
};

// "Ring the dentist" carries NO `[[qntm:N]]` stamp — deliberately, mirroring
// tests/present-membership.test.mjs's own operator case: membershipFor abstains
// "already-a-node" for a line that already carries one, so a stamped line would silently drop
// half of this test's own claim (that BOTH notes can fire on ONE edit) without saying why.
const BOTH_SOURCE = [
  "## Domain Empty",
  "- [ ] Ring the dentist 🔢 3",
  "- [ ] another [[qntm:2]] 🔢 2",
].join("\n");

const BOTH_VIEW = { id: "demo2", path: "demo2.md" };

describe("2. BOTH NOTES SHARE ONE SLOT — joined with ' · ' through the real commitLine", () => {
  let page;
  let elements;
  let posted;

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      posted = { url, body };
      return { ok: true, json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot: { generated_at: "2026-08-01T12:00:00Z", views: [] } }) };
    };
    page = await importPage(WORK);
    page.__applyPresentation(BOTH_DECLARATION);
  });

  test("an edit that both LEAVES the section AND changes rank says both, joined with ' · '", async () => {
    // "Ring the dentist" leaves domain-empty (acquires #work) AND its queue_position moves
    // 3 -> 1 (now the section's smallest), so both membershipNoteFor and orderingNoteFor answer.
    const write = page.commitLine(BOTH_VIEW, {
      lineIndex: 1,
      text: "- [ ] Ring the dentist #work 🔢 1",
      markdown: BOTH_SOURCE.replace("- [ ] Ring the dentist 🔢 3", "- [ ] Ring the dentist #work 🔢 1"),
      source: BOTH_SOURCE,
      kind: "set-line",
    });
    // READ BEFORE THE AWAIT SETTLES — the same "beside syncing…" register step 4's own test reads,
    // because this is exactly the moment the operator is still looking at the line he just left.
    // Asserted as a SUBSTRING, not an exact match: this fixture never primed `served` with a prior
    // read, so the base note ALSO fires ("could not be checked against the copy the server sent")
    // ahead of the two predictions — a separate, separately-tested fact (tests/present-base.test.mjs)
    // this test does not need to entangle with the ONE thing it exists to prove: both prediction
    // notes land in the same freshness line, joined by " · ", neither one crowding out the other.
    const freshness = elements.get("freshness").textContent;
    assert.match(freshness, /^syncing…/, freshness);
    assert.match(freshness, /this line will leave Domain Empty/, freshness);
    assert.match(freshness, /this line will move within Domain Empty/, freshness);
    // 4 parts: "syncing…", the base note (this fixture never primed a prior read, so it is
    // genuinely "unknown" — a separate, separately-tested fact), and the two predictions.
    assert.equal(freshness.split(" · ").length, 4, `expected 4 parts joined by ' · ', got: ${freshness}`);
    await write;
    assert.ok(posted, "the edit was never posted");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. NOTHING LOCAL REACHES A WRITE — re-verified for this step's own change
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. NOTHING LOCAL REACHES A WRITE — re-verified, and orderingNoteFor's own imports", () => {
  const APP_SOURCE = readFileSync(resolve(HERE, "..", "app", "index.html"), "utf8");
  const PAINT_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "paint.ts"), "utf8");
  const ORDERING_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "ordering.ts"), "utf8");

  // FOUR RATHER THAN FIVE SINCE 2026-08-01 — the behavioural queue's one `installProjection`
  // replaced the two write paths' identical assign-paint-say. tests/app-membership-note.test.mjs §4
  // carries the account and the stronger value-level assertion that went with it.
  test("`graphData` is still assigned in exactly four places", () => {
    const sites = APP_SOURCE.match(/\bgraphData\s*=(?!=)/g) ?? [];
    assert.equal(sites.length, 4, "orderingNoteFor must not add a client-computed graphData write");
  });

  test("`writeFile` still has exactly two callers — its declaration plus toggleTask and commitLine", () => {
    const occurrences = APP_SOURCE.match(/\bwriteFile\(/g) ?? [];
    assert.equal(occurrences.length, 3, "a new call site would mean a third write path exists");
  });

  test("`applyEdit` is still reached from exactly five sites outside its own module", () => {
    const pageCalls = APP_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    const paintCalls = PAINT_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    assert.equal(pageCalls.length + paintCalls.length, 5, "orderingNoteFor must reach applyEdit zero times");
  });

  test("`.markdown` is still never ASSIGNED in app/", () => {
    const assignments = (source) => source.match(/\.markdown\s*=(?!=)/g) ?? [];
    assert.deepEqual(assignments(APP_SOURCE), []);
    assert.deepEqual(assignments(PAINT_SOURCE), []);
  });

  test("orderingNoteFor imports nothing from source.ts and produces no Contribution", () => {
    const fn = /function orderingNoteFor[\s\S]*?\n}\n/.exec(APP_SOURCE)?.[0];
    assert.ok(fn, "orderingNoteFor was not found — this test is checking the wrong source");
    assert.ok(!/\bapplyEdit\(/.test(fn), "orderingNoteFor calls applyEdit");
  });

  test("ordering.ts (the module orderingNoteFor calls into) imports nothing from source.ts", () => {
    for (const line of ORDERING_SOURCE.split(/\r?\n/)) {
      if (!/^\s*import\b/.test(line)) continue;
      assert.doesNotMatch(line, /["']\.\/source\.js["']/, `ordering.ts imports the edit path: ${line.trim()}`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE PLACEMENT IS ARMED — armOrderingSettle, through app/index.html's OWN function, agreeing
//    with orderingPlacementFor called directly. roadmap-the-road-ahead.md step 3.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. armOrderingSettle arms the settle surface, and agrees with orderingPlacementFor called directly", () => {
  let page;

  before(async () => {
    installBrowser();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
    page.__applyPresentation(FAKE_DECLARATION);
  });

  const COMMIT = {
    lineIndex: 3,
    text: "- [ ] c [[qntm:3]] 🔢 1",
    markdown: DEMO_SOURCE.replace("- [ ] c [[qntm:3]] 🔢 3", "- [ ] c [[qntm:3]] 🔢 1"),
    source: DEMO_SOURCE,
    kind: "set-line",
  };

  test("moving c from rank 3 to rank 1 arms the surface with the SAME beforeLineIndex orderingPlacementFor gives directly", () => {
    page.__armOrderingSettle(DEMO_VIEW, COMMIT);
    const instruction = page.__settle().take(COMMIT.markdown, DEMO_VIEW.id);
    assert.notEqual(instruction, null, "the settle surface was never armed");

    // THE AGREEMENT PROOF, NOT MERELY A NON-NULL ANSWER — the same section, source and line
    // handed to `orderingPlacementFor` DIRECTLY, off the same declaration `armOrderingSettle`
    // read from the page's own module state, must produce the identical placement.
    const direct = orderingPlacementFor(
      DEMO_VIEW.id,
      "queue",
      COMMIT.source,
      COMMIT.lineIndex,
      COMMIT.text,
      FAKE_DECLARATION.resolution.ordering,
      FAKE_DECLARATION.resolution.orderingFields,
    );
    assert.equal(direct.kind, "answer");
    assert.equal(direct.placement.moved, true);
    assert.deepEqual(instruction.placement, {
      lineIndex: COMMIT.lineIndex,
      beforeLineIndex: direct.placement.beforeLineIndex,
    });
  });

  test("an edit that does not move anything never arms the surface", () => {
    page.__applyPresentation(FAKE_DECLARATION);
    const noMove = {
      lineIndex: 3,
      text: "- [ ] c renamed [[qntm:3]] 🔢 3",
      markdown: DEMO_SOURCE.replace("- [ ] c [[qntm:3]] 🔢 3", "- [ ] c renamed [[qntm:3]] 🔢 3"),
      source: DEMO_SOURCE,
      kind: "set-line",
    };
    page.__armOrderingSettle(DEMO_VIEW, noMove);
    assert.equal(page.__settle().take(noMove.markdown, DEMO_VIEW.id), null);
  });

  // A NEWLY INSERTED LINE NOW ARMS TOO — 2026-08-04, the fix for the settle-never-fires-for-a-
  // new-line defect. `commit.kind !== "set-line"` used to refuse this outright, and `moved`
  // (a rank comparison) would have stayed `false` for every insert even if that guard were lifted
  // alone — there is no BEFORE state a freshly typed line can compare against. See
  // `armOrderingSettle`'s own header (app/index.html) and `OrderingPlacement.currentBeforeLineIndex`
  // (ordering.ts) for the fix; §9 below covers the operator's own undeclared-section shape.
  // `d` (🔢 0) sorts before every existing row — appended at `lineIndex: 4` (DEMO_SOURCE has 4
  // lines, so this is `lines.length`, the append position — see `InsertLine`'s own header,
  // source.ts), it lands LAST in the file but ranks FIRST, so it must move.
  test("an INSERTED line, out of position, arms the surface with the correct beforeLineIndex", () => {
    page.__applyPresentation(FAKE_DECLARATION);
    const insertCommit = {
      lineIndex: 4,
      text: "- [ ] d [[qntm:4]] 🔢 0",
      markdown: DEMO_SOURCE + "\n- [ ] d [[qntm:4]] 🔢 0",
      source: DEMO_SOURCE,
      kind: "insert-line",
    };
    page.__armOrderingSettle(DEMO_VIEW, insertCommit);
    const instruction = page.__settle().take(insertCommit.markdown, DEMO_VIEW.id);
    assert.notEqual(instruction, null, "the settle surface was never armed for a newly inserted line");
    // `a` (🔢 1) is the row `d` (🔢 0) now ranks immediately ahead of.
    assert.deepEqual(instruction.placement, { lineIndex: 4, beforeLineIndex: 1 });

    const direct = resolveOrderingPlacementFor(
      DEMO_VIEW.id,
      "queue",
      insertCommit.markdown,
      insertCommit.lineIndex,
      insertCommit.text,
      FAKE_DECLARATION.resolution.ordering,
      FAKE_DECLARATION.resolution.orderingFields,
    );
    assert.equal(direct.kind, "answer");
    assert.equal(direct.placement.beforeLineIndex, 1);
    assert.notEqual(direct.placement.currentBeforeLineIndex, direct.placement.beforeLineIndex);
  });

  // `e` (🔢 10) sorts after every existing row too — it is ALREADY last once appended, so nothing
  // should move. The same "does not arm" proof block5's other tests already give the SET-LINE case,
  // restated for INSERT: a unique markdown string no earlier test has armed, so `take()` returning
  // `null` proves THIS call armed nothing.
  test("an INSERTED line that already lands in its correct (last) slot does not arm the surface", () => {
    page.__applyPresentation(FAKE_DECLARATION);
    const insertCommit = {
      lineIndex: 4,
      text: "- [ ] e [[qntm:5]] 🔢 10",
      markdown: DEMO_SOURCE + "\n- [ ] e [[qntm:5]] 🔢 10",
      source: DEMO_SOURCE,
      kind: "insert-line",
    };
    page.__armOrderingSettle(DEMO_VIEW, insertCommit);
    assert.equal(page.__settle().take(insertCommit.markdown, DEMO_VIEW.id), null);
  });

  test("a section outside the published table never arms the surface", () => {
    page.__applyPresentation(FAKE_DECLARATION);
    const elsewhere = {
      lineIndex: 1,
      text: "- [ ] x #work",
      markdown: "## Somewhere Else\n- [ ] x #work",
      source: "## Somewhere Else\n- [ ] x",
      kind: "set-line",
    };
    page.__armOrderingSettle(DEMO_VIEW, elsewhere);
    assert.equal(page.__settle().take(elsewhere.markdown, DEMO_VIEW.id), null);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE ABSTENTION REGISTER, THROUGH THE PAGE'S OWN FUNCTIONS — #orderingBadge
// ══════════════════════════════════════════════════════════════════════════════════════════════

const BADGE_DECLARATION = {
  qualification: {
    ...FAKE_DECLARATION.qualification,
    sectionOrder: { ...FAKE_DECLARATION.qualification.sectionOrder, "daily-work": ["capture"] },
  },
  resolution: {
    ordering: {
      ...FAKE_DECLARATION.resolution.ordering,
      "daily-work": { capture: { ordering: undefined, orderingMode: "insertion_order", name: "Work Capture" } },
    },
    orderingFields: FAKE_DECLARATION.resolution.orderingFields,
  },
};

describe("6. updateOrderingBadge writes #orderingBadge — decided, abstained, or left alone", () => {
  let page;
  let elements;

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
    page.__applyPresentation(BADGE_DECLARATION);
  });

  test('a section that declared ordering and answered says "ordering: decided"', () => {
    page.__updateOrderingBadge(DEMO_VIEW, {
      lineIndex: 3,
      text: "- [ ] c [[qntm:3]] 🔢 1",
      markdown: "irrelevant",
      source: DEMO_SOURCE,
      kind: "set-line",
    });
    assert.equal(elements.get("orderingBadge").textContent, "ordering: decided");
    assert.ok(elements.get("orderingBadge").classList.contains("diagnostic-badge-answer"));
    assert.ok(!elements.get("orderingBadge").classList.contains("diagnostic-badge-abstains"));
  });

  test('a section that declared ordering but could not decide says "ordering: abstained — insertion-order"', () => {
    // daily-work.capture: `orderingMode: insertion_order`, no field an edit could move a row BY —
    // exactly the case hazard 3 of this step's own brief names by name: "sections with
    // orderingMode: insertion_order have no field to compare at all," and a silent no-op for it
    // is the failure this register exists to remove.
    page.__updateOrderingBadge(
      { id: "daily-work", path: "x.md" },
      {
        lineIndex: 1,
        text: "- [ ] x #work",
        markdown: "irrelevant",
        source: "## Work Capture\n- [ ] x",
        kind: "set-line",
      },
    );
    assert.equal(elements.get("orderingBadge").textContent, "ordering: abstained — insertion-order");
    assert.ok(elements.get("orderingBadge").classList.contains("diagnostic-badge-abstains"));
    assert.ok(!elements.get("orderingBadge").classList.contains("diagnostic-badge-answer"));
  });

  test('a section outside the published table ("no-section-declaration") leaves the badge as it was', () => {
    page.__updateOrderingBadge(DEMO_VIEW, {
      lineIndex: 3,
      text: "- [ ] c [[qntm:3]] 🔢 1",
      markdown: "irrelevant",
      source: DEMO_SOURCE,
      kind: "set-line",
    });
    const before = elements.get("orderingBadge").textContent;
    assert.equal(before, "ordering: decided");
    // THE SAME POSTURE `membershipBadge` ALREADY ESTABLISHED: a LEVEL indicator says what the last
    // REAL evaluation found and stays exactly that until the next one — "no-section-declaration"
    // is not a question anyone asked (177 of 186 sections never declare ordering at all), so
    // reporting it would be noise, not honesty, and the badge is left showing the prior answer.
    page.__updateOrderingBadge(DEMO_VIEW, {
      lineIndex: 10,
      text: "- [ ] x",
      markdown: "irrelevant",
      source: "## Somewhere Else\n- [ ] x",
      kind: "set-line",
    });
    assert.equal(elements.get("orderingBadge").textContent, before);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7. NOTHING NEW REACHES A WRITE — armOrderingSettle and orderingDiagnosticFor, the same pinned
//    counts §4 already covers, re-verified so this file alone proves this step added no write path
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("7. NOTHING NEW REACHES A WRITE — armOrderingSettle and orderingDiagnosticFor's own imports", () => {
  const APP_SOURCE = readFileSync(resolve(HERE, "..", "app", "index.html"), "utf8");
  const SETTLE_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "settle.ts"), "utf8");

  test("armOrderingSettle calls applyEdit zero times — it only ever calls settle.arm", () => {
    const fn = /function armOrderingSettle[\s\S]*?\n}\n/.exec(APP_SOURCE)?.[0];
    assert.ok(fn, "armOrderingSettle was not found — this test is checking the wrong source");
    assert.ok(!/\bapplyEdit\(/.test(fn), "armOrderingSettle calls applyEdit");
    assert.ok(!/\bwriteFile\(/.test(fn), "armOrderingSettle calls writeFile");
    assert.ok(/\bsettle\.arm\(/.test(fn), "armOrderingSettle no longer arms the settle surface at all");
  });

  test("orderingDiagnosticFor calls applyEdit zero times, the same proof orderingNoteFor already has", () => {
    const fn = /function orderingDiagnosticFor[\s\S]*?\n}\n/.exec(APP_SOURCE)?.[0];
    assert.ok(fn, "orderingDiagnosticFor was not found — this test is checking the wrong source");
    assert.ok(!/\bapplyEdit\(/.test(fn), "orderingDiagnosticFor calls applyEdit");
  });

  test("settle.ts imports nothing from source.ts — it holds an instruction, it never builds one", () => {
    for (const line of SETTLE_SOURCE.split(/\r?\n/)) {
      if (!/^\s*import\b/.test(line)) continue;
      assert.fail(`settle.ts is expected to import nothing at all, found: ${line.trim()}`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 8. THE DEFAULT ORDERING — an undeclared section now says and PLACES something, through the SAME
//    real functions §1/§5/§6 already exercise. 2026-08-04, `roadmap-the-road-ahead.md`'s "the
//    engine's own default ordering, made explicit" step: `resolution.ordering` never names
//    `inbox`/`shelved` below (the same shape §3's "no-section-declaration" fixture used), but
//    `orderingNoteFor`/`updateOrderingBadge`/`armOrderingSettle` now reach `resolveOrderingFor`/
//    `resolveOrderingPlacementFor` instead of `orderingFor`/`orderingPlacementFor` directly, and
//    THAT function answers for an undeclared section instead of staying silent.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const DEFAULT_DECLARATION = {
  qualification: {
    ...FAKE_DECLARATION.qualification,
    sectionOrder: { demo3: ["inbox", "shelved"] },
  },
  resolution: {
    // NEITHER 'inbox' NOR 'shelved' appears here — the exact "no-section-declaration" shape.
    ordering: {},
    orderingFields: {
      due_date: { token: "📅", kind: "date" },
      priority: { kind: "enum", values: { "🔽": "low", "⏫": "high" } },
    },
    defaultOrdering: [
      { field: "due_date", direction: "asc" },
      { field: "priority", direction: "desc" },
      { field: "title", direction: "asc" },
    ],
    priorityRank: { urgent: 4, high: 3, normal: 2, medium: 2, low: 1 },
  },
};

const DEMO3_VIEW = { id: "demo3", path: "demo3.md" };

// FLAT, no due_date/priority on either row — his inbox's own degenerate case (title, the only
// live key). "Zebra task" > "Apple task" in codepoint order, so it starts LAST.
const INBOX_SOURCE = ["## Inbox", "- [ ] Zebra task", "- [ ] Apple task"].join("\n");

describe("8. THE DEFAULT ORDERING — an undeclared section now speaks, through the real page functions", () => {
  let page, elements;

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
    page.__applyPresentation(DEFAULT_DECLARATION);
  });

  test("orderingNoteFor: renaming the LAST-sorting row to sort FIRST says \"this line will move within inbox\"", () => {
    // "Zebra task" -> "AAA task" sorts BEFORE "Apple task" ('A' < 'p' at the second character) —
    // rank 2 -> rank 1, a real move, decided by title, the engine's own final tiebreak.
    const said = page.__orderingNoteFor(DEMO3_VIEW, {
      lineIndex: 1,
      text: "- [ ] AAA task",
      markdown: "irrelevant to this test",
      source: INBOX_SOURCE,
      kind: "set-line",
    });
    assert.equal(said, "this line will move within inbox");
  });

  test("orderingNoteFor: an edit that leaves the title's rank unchanged says nothing", () => {
    const said = page.__orderingNoteFor(DEMO3_VIEW, {
      lineIndex: 1,
      text: "- [ ] Zebra task edited",
      markdown: "irrelevant",
      source: INBOX_SOURCE,
      kind: "set-line",
    });
    assert.equal(said, "", "still last alphabetically — 'Zebra task edited' > 'Apple task'");
  });

  test("updateOrderingBadge: the SAME undeclared section now says \"ordering: decided\" instead of staying silent", () => {
    page.__updateOrderingBadge(DEMO3_VIEW, {
      lineIndex: 1,
      text: "- [ ] AAA task",
      markdown: "irrelevant",
      source: INBOX_SOURCE,
      kind: "set-line",
    });
    assert.equal(elements.get("orderingBadge").textContent, "ordering: decided");
    assert.ok(elements.get("orderingBadge").classList.contains("diagnostic-badge-answer"));
  });

  test("armOrderingSettle: places the row, and agrees with defaultOrderingPlacementFor/resolveOrderingPlacementFor called directly", () => {
    const commit = {
      lineIndex: 1,
      text: "- [ ] AAA task",
      markdown: INBOX_SOURCE.replace("- [ ] Zebra task", "- [ ] AAA task"),
      source: INBOX_SOURCE,
      kind: "set-line",
    };
    page.__armOrderingSettle(DEMO3_VIEW, commit);
    const instruction = page.__settle().take(commit.markdown, DEMO3_VIEW.id);
    assert.notEqual(instruction, null, "the settle surface was never armed for an undeclared section");

    const direct = resolveOrderingPlacementFor(
      DEMO3_VIEW.id,
      "inbox",
      commit.source,
      commit.lineIndex,
      commit.text,
      DEFAULT_DECLARATION.resolution.ordering,
      DEFAULT_DECLARATION.resolution.orderingFields,
      DEFAULT_DECLARATION.resolution.defaultOrdering,
      DEFAULT_DECLARATION.resolution.priorityRank,
    );
    assert.equal(direct.kind, "answer");
    assert.equal(direct.placement.moved, true);
    // "AAA task" (edited, now line 1) belongs immediately BEFORE "Apple task" (line 2) — the row
    // it ranks ahead of once its new title has sorted in.
    assert.equal(direct.placement.beforeLineIndex, 2);
    assert.deepEqual(instruction.placement, {
      lineIndex: commit.lineIndex,
      beforeLineIndex: direct.placement.beforeLineIndex,
    });
  });

  test("a NESTED section (indentation present) abstains \"nested-section\", VISIBLY, through #orderingBadge", () => {
    // 'shelved' is ALSO undeclared, but its printed range carries indentation — the same refusal
    // the DECLARED path already had (ordering.ts's own header, measurement 2), now reachable for
    // an undeclared section too rather than silently returning nothing.
    // BOTH headings, in declared order — `sectionAt` resolves by ORDINAL heading position within
    // a view (`address.ts`'s own model), not by heading TEXT; a lone '## Shelved' heading would
    // resolve to ordinal 0 ('inbox'), not 'shelved' (ordinal 1).
    const nestedSource = ["## Inbox", "## Shelved", "- [ ] Parent item", "    - [ ] Child item"].join("\n");
    page.__updateOrderingBadge(DEMO3_VIEW, {
      lineIndex: 2, // "## Inbox"=0, "## Shelved"=1, "Parent item"=2
      text: "- [ ] Parent item edited",
      markdown: "irrelevant",
      source: nestedSource,
      kind: "set-line",
    });
    assert.equal(elements.get("orderingBadge").textContent, "ordering: abstained — nested-section");
    assert.ok(elements.get("orderingBadge").classList.contains("diagnostic-badge-abstains"));
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 9. THE HEADLINE DEFECT, FIXED — a newly ADDED line, in a section with NO declared ordering, is
//    placed at its correct position IMMEDIATELY, not ten seconds later. This is the exact clunk
//    named in the defect report: the operator adds a line to his inbox, it used to sit at the end
//    until the next cycle moved it, because `armOrderingSettle` refused every `insert-line` commit
//    outright (`commit.kind !== "set-line"`) and, even past that guard, `moved` (a rank comparison)
//    is trivially FALSE for a line with no before-state to compare — see `armOrderingSettle`'s own
//    header (app/index.html) for the fix.
//
//    THIS SUITE MUST FAIL AGAINST `main` AS IT STANDS TODAY, and does: `main`'s `armOrderingSettle`
//    returns before `resolveOrderingPlacementFor` is ever called for an `insert-line` commit, so
//    `page.__settle().take(...)` is `null` for every case here, including the two that must arm.
//
//    THE SHAPE — his own real inbox, reproduced from the diagnosis: four rows, "Family domain",
//    "Micu lunch", "Open day close day", "account opening form per ca", none carrying a
//    `due_date`/`priority`, so `title` (codepoint order, the engine's own final tiebreak) is the
//    only live key. Uppercase sorts before lowercase in raw codepoints, so these four already sit
//    in correctly sorted order relative to EACH OTHER (F < M < O < a) — only the fifth, newly typed
//    row can be out of place, which is exactly the shape the diagnosis measured against the shipped
//    bundle.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const INBOX_DECLARATION = {
  qualification: {
    ...FAKE_DECLARATION.qualification,
    sectionOrder: { inboxview: ["inbox"] },
  },
  resolution: {
    ordering: {}, // undeclared — the exact "no-section-declaration" shape his real inbox has
    orderingFields: {
      due_date: { token: "📅", kind: "date" },
      priority: { kind: "enum", values: { "🔽": "low", "⏫": "high" } },
    },
    defaultOrdering: [
      { field: "due_date", direction: "asc" },
      { field: "priority", direction: "desc" },
      { field: "title", direction: "asc" },
    ],
    priorityRank: { urgent: 4, high: 3, normal: 2, medium: 2, low: 1 },
  },
};

const INBOX_VIEW = { id: "inboxview", path: "inbox.md" };

const INBOX4_SOURCE = [
  "## Inbox",
  "- [ ] Family domain", // line 1
  "- [ ] Micu lunch", // line 2
  "- [ ] Open day close day", // line 3
  "- [ ] account opening form per ca", // line 4
].join("\n");

// ONE insert-line commit appending `title` as a fifth row — the exact gesture the operator makes:
// press Enter at the end of the section, type a title, leave the line. `lineIndex: 5` is
// `INBOX4_SOURCE`'s own `lines.length` (5 lines, indices 0-4) — the append position (`InsertLine`'s
// own header, source.ts). `source` is the file BEFORE the insertion (`LineCommit`'s own header,
// paint.ts); `markdown` is AFTER, with the new row spliced in at `lineIndex`, pushing nothing down
// because it lands at the very end.
const insertLast = (title) => ({
  lineIndex: 5,
  text: `- [ ] ${title}`,
  markdown: INBOX4_SOURCE + `\n- [ ] ${title}`,
  source: INBOX4_SOURCE,
  kind: "insert-line",
});

describe("9. THE HEADLINE DEFECT — a newly INSERTED line is placed, in a section with no declared ordering", () => {
  let page;

  before(async () => {
    installBrowser();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
    page.__applyPresentation(INBOX_DECLARATION);
  });

  test('"I Just Added This One" sorts between "Family domain" and "Micu lunch" — the settle arms, placing it before "Micu lunch"', () => {
    const commit = insertLast("I Just Added This One");
    page.__armOrderingSettle(INBOX_VIEW, commit);
    const instruction = page.__settle().take(commit.markdown, INBOX_VIEW.id);
    assert.notEqual(instruction, null, "the settle surface was never armed for a newly inserted line");
    assert.deepEqual(instruction.placement, { lineIndex: 5, beforeLineIndex: 2 });
  });

  test('"Aaa goes first" sorts before "Family domain" — the settle arms, placing it first', () => {
    const commit = insertLast("Aaa goes first");
    page.__armOrderingSettle(INBOX_VIEW, commit);
    const instruction = page.__settle().take(commit.markdown, INBOX_VIEW.id);
    assert.notEqual(instruction, null, "the settle surface was never armed for a newly inserted line");
    assert.deepEqual(instruction.placement, { lineIndex: 5, beforeLineIndex: 1 });
  });

  // THE THIRD CASE FROM THE DIAGNOSIS TABLE — a row that ALREADY belongs last must NOT arm the
  // surface. `moved` was `false` here even before this fix, by coincidence (the trivial
  // before-equals-after tuple) rather than by a real "is it already correct" check; this proves the
  // NEW check (`currentBeforeLineIndex !== beforeLineIndex`) still answers "no" for the right reason.
  test('"zzz stays last" already sorts after every existing row — the settle correctly does NOT arm', () => {
    const commit = insertLast("zzz stays last");
    page.__armOrderingSettle(INBOX_VIEW, commit);
    assert.equal(page.__settle().take(commit.markdown, INBOX_VIEW.id), null);
  });

  test("agrees with resolveOrderingPlacementFor called directly against commit.markdown", () => {
    const commit = insertLast("I Just Added This One");
    page.__armOrderingSettle(INBOX_VIEW, commit);
    const instruction = page.__settle().take(commit.markdown, INBOX_VIEW.id);
    assert.notEqual(instruction, null, "the settle surface was never armed");
    const direct = resolveOrderingPlacementFor(
      INBOX_VIEW.id,
      "inbox",
      commit.markdown,
      commit.lineIndex,
      commit.text,
      INBOX_DECLARATION.resolution.ordering,
      INBOX_DECLARATION.resolution.orderingFields,
      INBOX_DECLARATION.resolution.defaultOrdering,
      INBOX_DECLARATION.resolution.priorityRank,
    );
    assert.equal(direct.kind, "answer");
    assert.notEqual(
      direct.placement.currentBeforeLineIndex,
      direct.placement.beforeLineIndex,
      "currentBeforeLineIndex must differ from beforeLineIndex for a row that needs to move",
    );
    assert.deepEqual(instruction.placement, {
      lineIndex: commit.lineIndex,
      beforeLineIndex: direct.placement.beforeLineIndex,
    });
  });
});

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
import { orderingPlacementFor } from "../dist/present.js";

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

  test("an INSERTED line never arms the surface — the same guard orderingNoteFor already applies", () => {
    page.__applyPresentation(FAKE_DECLARATION);
    // A MARKDOWN STRING NO EARLIER TEST IN THIS FILE HAS EVER ARMED — `take()` returning `null`
    // must mean THIS call armed nothing, not merely that some earlier test's still-live instruction
    // (the surface is one page-level singleton, shared across every test in this describe block)
    // happens not to match. Reusing `COMMIT.markdown` here would prove nothing: the first test in
    // this block already armed exactly that string, and `take()` would return ITS instruction.
    const insertCommit = { ...COMMIT, kind: "insert-line", markdown: COMMIT.markdown + "\nunique-marker" };
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

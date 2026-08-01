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

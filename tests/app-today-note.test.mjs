/**
 * SAY WHAT DAY IT IS — design-the-resolution-architecture.md step 8's call site, through
 * app/index.html's OWN LIFTED SCRIPT, not through a reconstruction of it.
 *
 *   node --test tests/app-today-note.test.mjs
 *
 * Same shape `tests/app-ordering-note.test.mjs` and `tests/app-membership-note.test.mjs` already
 * established, restated for `todayNoteFor`/`sayAsOf`:
 *
 *   1. THE FALSIFIER, AT THE CALL SITE — the same three instants
 *      `tests/present-today.test.mjs` §1 proves against `todayFor` directly, now proven through
 *      `todayNoteFor`, the wrapper the page actually calls: 03:59 Europe/London says yesterday,
 *      04:01 says today, a Sunday resolves into the week that started the preceding Monday.
 *   2. THE SCENARIO — a full projection arrival, through the real `sayAsOf`, lands the logical
 *      day in the freshness line the operator actually reads. This is the traced execution the
 *      brief asked for: the declaration reaching the DOM sink, not only a function returning a
 *      value.
 *   3. THE ABSTENTION IS VISIBLE — no declared boundary, and a malformed one, both produce no
 *      today clause AND a console warning naming why, never a silent guess at UTC midnight.
 *   4. NOTHING LOCAL REACHES A WRITE — the SAME pinned counts `tests/app-membership-note.test.mjs`
 *      §4 and `tests/app-ordering-note.test.mjs` §4 already prove, re-verified here so a reviewer
 *      of THIS file alone sees the invariant this step's own change must not break, plus the one
 *      check unique to this function: it calls `Date.now()` exactly where the design requires —
 *      inside `sayAsOf`, never inside `app/present/today.ts`.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { importPage, installBrowser, makeWorkDir } from "./fixtures/app-html-page.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = makeWorkDir("app-today-note");

// The operator's REAL declared boundary — the same three keys `tests/present-today.test.mjs`
// reads off the shipped `presentation.json`, restated by hand here so this suite does not take a
// second dependency on that file's presence.
const REAL_BOUNDARY = { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" };

const DECLARATION_WITH_BOUNDARY = {
  resolution: { dayBoundary: REAL_BOUNDARY },
};

const isoToMs = (iso) => new Date(iso).getTime();

describe("1. THE FALSIFIER, AT THE CALL SITE — todayNoteFor against the real declared boundary", () => {
  let page;

  before(async () => {
    installBrowser();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
    page.__applyPresentation(DECLARATION_WITH_BOUNDARY);
  });

  test("03:59 Europe/London says yesterday's date", () => {
    // 2026-06-23T02:59:00Z is 03:59 BST.
    const said = page.__todayNoteFor(isoToMs("2026-06-23T02:59:00Z"));
    assert.match(said, /^today 2026-06-22 · week ends /);
  });

  test("04:01 Europe/London says today's date", () => {
    // 2026-06-23T03:01:00Z is 04:01 BST.
    const said = page.__todayNoteFor(isoToMs("2026-06-23T03:01:00Z"));
    assert.match(said, /^today 2026-06-23 · week ends /);
  });

  test("a Sunday resolves into the week that started the preceding Monday", () => {
    // 2026-07-05 is a Sunday; Sunday is the last day of its own week under monday-start.
    const said = page.__todayNoteFor(isoToMs("2026-07-05T12:00:00Z"));
    assert.equal(said, "today 2026-07-05 · week ends 2026-07-05");
  });

  test("the exact boundary instant (04:00:00 local) belongs to the NEW day", () => {
    const said = page.__todayNoteFor(isoToMs("2026-06-23T03:00:00Z"));
    assert.match(said, /^today 2026-06-23 · week ends /);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE SCENARIO — a real projection arrival, through sayAsOf, lands in the freshness line
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. THE SCENARIO — sayAsOf carries the logical day to the DOM sink the operator reads", () => {
  let page;
  let elements;

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
    page.__applyPresentation(DECLARATION_WITH_BOUNDARY);
  });

  test("a projection generated just after the 04:00 rollover carries TODAY'S logical date to #freshness", () => {
    const savedNow = Date.now;
    try {
      // 04:05 Europe/London on 2026-06-23 — just past the rollover, the boundary case the brief
      // asks for: an instant between midnight and 04:00 would still read as YESTERDAY, so this
      // instant (just the other side of it) is the one that proves the rollover is honoured, not
      // merely a mid-afternoon instant no boundary logic could get wrong.
      Date.now = () => isoToMs("2026-06-23T03:05:00Z");
      page.__sayAsOf({
        snapshot: { generated_at: "2026-06-23T03:05:00Z" },
        pending_edits: 0,
      });
    } finally {
      Date.now = savedNow;
    }
    const freshness = elements.get("freshness").textContent;
    assert.match(freshness, /today 2026-06-23 · week ends 2026-06-28/, freshness);
    assert.match(freshness, /^as of /, freshness);
    assert.match(freshness, / · 0 queued$/, freshness);
  });

  test("THE BOUNDARY CASE ITSELF — an instant BEFORE 04:00 local carries YESTERDAY'S date to #freshness", () => {
    const savedNow = Date.now;
    try {
      // 03:30 Europe/London on 2026-06-23 — inside the late-night grace the boundary exists to
      // give the operator. The engine would stamp a completion made at this instant for
      // 2026-06-22; this proves the browser's freshness line agrees.
      Date.now = () => isoToMs("2026-06-23T02:30:00Z");
      page.__sayAsOf({
        snapshot: { generated_at: "2026-06-23T02:30:00Z" },
        pending_edits: 2,
      });
    } finally {
      Date.now = savedNow;
    }
    const freshness = elements.get("freshness").textContent;
    assert.match(freshness, /today 2026-06-22 · week ends 2026-06-28/, freshness);
    assert.match(freshness, / · 2 queued$/, freshness);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE ABSTENTION IS VISIBLE — no boundary, or a malformed one, warns and says nothing
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. THE ABSTENTION IS VISIBLE — never a silent guess at UTC midnight", () => {
  let page;

  before(async () => {
    installBrowser();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(WORK);
  });

  test("no declaration loaded at all: todayNoteFor says nothing AND warns why", () => {
    page.__applyPresentation({});
    const warnings = [];
    const saved = console.warn;
    console.warn = (message) => warnings.push(String(message));
    try {
      const said = page.__todayNoteFor(Date.now());
      assert.equal(said, "");
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /no day boundary declared/);
    } finally {
      console.warn = saved;
    }
  });

  test("a declaration with every OTHER resolution key but no dayBoundary: same abstention", () => {
    page.__applyPresentation({
      resolution: { ordering: { demo: {} }, orderingFields: {} },
    });
    const warnings = [];
    const saved = console.warn;
    console.warn = (message) => warnings.push(String(message));
    try {
      const said = page.__todayNoteFor(Date.now());
      assert.equal(said, "");
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /no day boundary declared/);
    } finally {
      console.warn = saved;
    }
  });

  test("an unresolvable timezone: todayNoteFor says nothing AND warns the refusal's own name", () => {
    page.__applyPresentation({
      resolution: { dayBoundary: { timezone: "Not/A_Real_Zone", dayStartHour: 4, weekStartsOn: "monday" } },
    });
    const warnings = [];
    const saved = console.warn;
    console.warn = (message) => warnings.push(String(message));
    try {
      const said = page.__todayNoteFor(Date.now());
      assert.equal(said, "");
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /unresolvable-timezone/);
    } finally {
      console.warn = saved;
    }
  });

  test("an unrecognised weekStartsOn: todayNoteFor says nothing AND warns the refusal's own name", () => {
    page.__applyPresentation({
      resolution: { dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "someday" } },
    });
    const warnings = [];
    const saved = console.warn;
    console.warn = (message) => warnings.push(String(message));
    try {
      const said = page.__todayNoteFor(Date.now());
      assert.equal(said, "");
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /unknown-week-start/);
    } finally {
      console.warn = saved;
    }
  });

  test("with no boundary declared, sayAsOf's freshness line carries no today clause at all", () => {
    page.__applyPresentation({});
    const { elements } = installBrowser();
    const saved = console.warn;
    console.warn = () => {};
    try {
      page.__sayAsOf({ snapshot: { generated_at: "2026-06-23T12:00:00Z" }, pending_edits: 1 });
    } finally {
      console.warn = saved;
    }
    const freshness = elements.get("freshness").textContent;
    assert.doesNotMatch(freshness, /today \d{4}-\d{2}-\d{2}/, freshness);
    assert.match(freshness, /^as of .* · 1 queued$/, freshness);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. NOTHING LOCAL REACHES A WRITE — re-verified for this step's own change
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. NOTHING LOCAL REACHES A WRITE — re-verified, and todayNoteFor's own posture", () => {
  const APP_SOURCE = readFileSync(resolve(HERE, "..", "app", "index.html"), "utf8");
  const PAINT_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "paint.ts"), "utf8");
  const TODAY_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "today.ts"), "utf8");

  // UNCHANGED FROM tests/app-ordering-note.test.mjs §4 — this step adds no assignment, no new
  // write path, only a read (`resolution?.dayBoundary`) and a call into a PURE module.
  test("`graphData` is still assigned in exactly four places", () => {
    const sites = APP_SOURCE.match(/\bgraphData\s*=(?!=)/g) ?? [];
    assert.equal(sites.length, 4, "todayNoteFor must not add a client-computed graphData write");
  });

  test("`writeFile` still has exactly two callers — its declaration plus toggleTask and commitLine", () => {
    const occurrences = APP_SOURCE.match(/\bwriteFile\(/g) ?? [];
    assert.equal(occurrences.length, 3, "a new call site would mean a third write path exists");
  });

  test("`applyEdit` is still reached from exactly five sites outside its own module", () => {
    const pageCalls = APP_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    const paintCalls = PAINT_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    assert.equal(pageCalls.length + paintCalls.length, 5, "todayNoteFor must reach applyEdit zero times");
  });

  test("`.markdown` is still never ASSIGNED in app/", () => {
    const assignments = (source) => source.match(/\.markdown\s*=(?!=)/g) ?? [];
    assert.deepEqual(assignments(APP_SOURCE), []);
    assert.deepEqual(assignments(PAINT_SOURCE), []);
  });

  test("todayNoteFor imports nothing from source.ts and produces no Contribution", () => {
    const fn = /function todayNoteFor[\s\S]*?\n}\n/.exec(APP_SOURCE)?.[0];
    assert.ok(fn, "todayNoteFor was not found — this test is checking the wrong source");
    assert.ok(!/\bapplyEdit\(/.test(fn), "todayNoteFor calls applyEdit");
  });

  // THE ONE CHECK UNIQUE TO THIS STEP — the design's own constraint, verified rather than trusted:
  // today.ts never calls Date.now() itself, so the ONE legitimate call is inside sayAsOf, in the
  // page, not the module. Comment lines are stripped before counting — this codebase's own prose
  // names `Date.now()` repeatedly (that is the whole point being documented), and a bare string
  // search would mistake a sentence about the rule for a violation of it. Every comment line in
  // this repo starts with `//` or `*` once trimmed, so filtering on that is exact, not a heuristic
  // that happens to work here.
  const codeOnly = (source) =>
    source
      .split(/\r?\n/)
      .filter((line) => {
        const t = line.trim();
        return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/**"));
      })
      .join("\n");

  test("today.ts contains no CODE call to Date.now() (comments naming the rule don't count)", () => {
    assert.doesNotMatch(codeOnly(TODAY_SOURCE), /Date\.now\(\)/);
  });

  test("Date.now() is called exactly once in app/index.html's CODE, inside sayAsOf", () => {
    const appCode = codeOnly(APP_SOURCE);
    const fn = /function sayAsOf[\s\S]*?\n\}\n/.exec(appCode)?.[0];
    assert.ok(fn, "sayAsOf was not found — this test is checking the wrong source");
    assert.match(fn, /Date\.now\(\)/, "sayAsOf must call Date.now() itself — that is the one legitimate call site");
    const allCalls = appCode.match(/Date\.now\(\)/g) ?? [];
    assert.equal(allCalls.length, 1, "Date.now() must be called from exactly one place in app/index.html's code");
  });
});

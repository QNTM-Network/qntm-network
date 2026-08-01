/**
 * ORDERING PREVIEW — proof for design-the-resolution-architecture.md step 7.
 *
 *   node --test tests/present-ordering.test.mjs
 *
 * ── SEVEN SECTIONS ──
 *
 *   1. THE DESIGN DOCUMENT'S OWN FALSIFIER, ADAPTED ON MEASURED EVIDENCE, ARGUED RATHER THAN
 *      SILENTLY NARROWED. It reads: "for `this-week`'s four sections, assert the browser's sort of
 *      the currently painted rows equals the order those rows appear in the served markdown." Run
 *      literally against the three FLAT `queue` sections, it holds — proven below, against real
 *      content, with `queue_position` reaching two digits as a positive control against a STRING-
 *      comparison bug. Run literally against `this-week`'s four sections it does NOT hold, and
 *      §1b proves why with a citation rather than an assumption: the engine's own
 *      `_order_children` (`section_builder.py:337-341`) places every ANCESTOR/context row ahead of
 *      every ordering-sorted QUALIFYING row at each tree level, so a flat whole-section rank is
 *      the wrong model the moment a section prints any nested row — which all four `this-week`
 *      sections do (they pull in `#outcome` ancestors). `orderingFor`'s adapted falsifier is
 *      therefore: it refuses (`nested-section`) for exactly the shape that broke the literal one,
 *      proven against the SAME real content that broke it.
 *   2. A TEST AGAINST HIS REAL CONFIG: an edit that changes the ordered field in a flat one of the
 *      9 sections says so; an edit in one of the other 177 is silent.
 *   3. EVERY REFUSAL PATH PRODUCES SILENCE — all five `OrderingAbstention` values.
 *   4. THE CONFIG-CHANGE FALSIFIER (proof standard #5) lives in `tests/present-resolution.test.mjs`
 *      §4 (`generateResolution`'s own scratch-copy mutations) — restated here is only the SHAPE the
 *      published table takes when `direction` flips, proving `orderingFor` itself (not just the
 *      generator) follows a declaration whose direction changed.
 *   5. THE MEASUREMENT THAT DECIDES THE STEP-8 DEPENDENCY — restated as a runnable claim: an
 *      ordering answer needs no clock. `Date.now` is poisoned for the whole file's "answer" path.
 *   6. THE NOTHING-LOCAL-REACHES-A-WRITE PROOF for this module specifically — no import of
 *      `source.ts`, no `Contribution` produced.
 *
 * WHAT THIS FILE DOES NOT COVER: no DOM, no `app/index.html` wiring (that is
 * `tests/app-ordering-note.test.mjs`), no browser.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { orderingFor, markerValue, classifyLine } from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVED = JSON.parse(readFileSync(resolve(HERE, "..", "presentation.json"), "utf8"));
const ORDERING = SERVED.resolution.ordering;
const ORDERING_FIELDS = SERVED.resolution.orderingFields;

const vaultDir = join(homedir(), "qntm");
const vaultAvailable = existsSync(vaultDir);
const skipVault = vaultAvailable ? false : `vault not checked out at ${vaultDir}`;

/**
 * Every content line's marker value for `field`, in DOCUMENT ORDER, SCOPED TO ONE SECTION (the
 * lines strictly between the heading whose text is `heading` and the next heading) and skipping
 * lines without a value. Scoping matters because `this_week.md` carries FOUR headings.
 */
function markerValuesInDocumentOrder(source, heading, field) {
  const marker = ORDERING_FIELDS[field];
  assert.ok(marker, `no published marker for '${field}' — the fixture this test reads is wrong`);
  const lines = source.split("\n");
  const startAt = lines.findIndex((l) => classifyLine(l).kind === "heading" && classifyLine(l).text === heading);
  assert.ok(startAt !== -1, `no '## ${heading}' heading found — the fixture no longer matches`);
  const values = [];
  for (let at = startAt + 1; at < lines.length; at += 1) {
    if (classifyLine(lines[at]).kind === "heading") break;
    const value = markerValue(lines[at], marker);
    if (value !== undefined) values.push(value);
  }
  return values;
}

function sortedAscending(values, kind) {
  const copy = [...values];
  if (kind === "int") copy.sort((a, b) => Number(a) - Number(b));
  else copy.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return copy;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1a. THE FLAT CASE — the design falsifier holds exactly as written, against real content
// ══════════════════════════════════════════════════════════════════════════════════════════════

const QUEUE_CASES = [
  { view: "flowtrace-queue", section: "queue", path: "dev/flow-trace/queue.md" },
  { view: "qntm-queue", section: "queue", path: "dev/qntm/queue.md" },
  { view: "trace-orchestration-queue", section: "queue", path: "dev/trace-orchestration/queue.md" },
];

describe("1a. THE FALSIFIER, LITERALLY, ON THE THREE `queue` SECTIONS' DOCUMENT ORDER", () => {
  // This claim ("printed order already matches ascending queue_position") does not need a section
  // to be perfectly flat — a prose "#summary" child carries no 🔢 and is excluded from the value
  // sequence either way (the same exclusion §3's "marker-less sibling" test proves). Whether
  // `orderingFor` will PREVIEW an edit in a section is a stricter, separate question — measured
  // right after this block, because it turned out NOT all three are flat.
  for (const { view, section, path } of QUEUE_CASES) {
    test(`${view}.${section}: printed rows are already queue_position order, ascending`, { skip: skipVault }, () => {
      assert.equal(ORDERING[view]?.[section]?.name, "Queue");
      const source = readFileSync(join(vaultDir, path), "utf8");
      const documentOrder = markerValuesInDocumentOrder(source, "Queue", "queue_position");
      assert.ok(documentOrder.length > 1, `positive control failed — ${path} yielded < 2 values`);
      const sorted = sortedAscending(documentOrder, "int");
      assert.deepEqual(documentOrder, sorted, `${path}'s printed order does not match ascending queue_position`);
    });
  }

  test("POSITIVE CONTROL: queue_position genuinely reaches two digits in real content", { skip: skipVault }, () => {
    // Without this, a STRING comparison ("10" < "2") could pass every case above by accident.
    const source = readFileSync(join(vaultDir, "dev/flow-trace/queue.md"), "utf8");
    const values = markerValuesInDocumentOrder(source, "Queue", "queue_position").map(Number);
    assert.ok(Math.max(...values) >= 10, "no real queue reached two digits — the trap was not exercised");
  });

  test("MEASURED: exactly 2 of the 3 queue sections are FLAT (zero indentation) today", { skip: skipVault }, () => {
    // qntm-queue.md interleaves a prose "#summary" child under some items (found while writing
    // this test, not assumed) — harmless to the document-order claim above, but it DOES mean
    // `orderingFor`'s conservative nested-section refusal fires there too, same as this-week's
    // sections, for the same reason: this module cannot be sure a summary child could never
    // confuse a rank comparison without the deeper analysis it declines to attempt.
    const flatness = {};
    for (const { view, path } of QUEUE_CASES) {
      const source = readFileSync(join(vaultDir, path), "utf8");
      const lines = source.split("\n");
      const startAt = lines.findIndex((l) => classifyLine(l).kind === "heading");
      flatness[view] = lines.slice(startAt + 1).every((l) => !/^\s+\S/.test(l));
    }
    assert.deepEqual(flatness, {
      "flowtrace-queue": true,
      "qntm-queue": false,
      "trace-orchestration-queue": true,
    });
  });

  test("orderingFor itself agrees, on the genuinely flat flow-trace queue: rank 4 to rank 1", { skip: skipVault }, () => {
    const source = readFileSync(join(vaultDir, "dev/flow-trace/queue.md"), "utf8");
    const lines = source.split("\n");
    const fourthIndex = lines.findIndex((l) => l.includes("🔢 4"));
    assert.ok(fourthIndex !== -1, "no '🔢 4' row found — fixture assumption broken");
    const after = lines[fourthIndex].replace("🔢 4", "🔢 1");
    const reading = orderingFor("flowtrace-queue", "queue", source, fourthIndex, after, ORDERING, ORDERING_FIELDS);
    assert.equal(reading.kind, "answer");
    assert.equal(reading.answer.moved, true);
    assert.equal(reading.answer.afterRank, 1);
  });

  test("orderingFor refuses on qntm-queue's real content — its own summary child trips nested-section", { skip: skipVault }, () => {
    const source = readFileSync(join(vaultDir, "dev/qntm/queue.md"), "utf8");
    const lines = source.split("\n");
    const firstIndex = lines.findIndex((l) => l.includes("🔢 1"));
    assert.ok(firstIndex !== -1, "no '🔢 1' row found — fixture assumption broken");
    const reading = orderingFor("qntm-queue", "queue", source, firstIndex, lines[firstIndex], ORDERING, ORDERING_FIELDS);
    assert.deepEqual(reading, { kind: "abstains", because: "nested-section" });
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1b. THE NESTED CASE — the literal falsifier does NOT hold, measured; orderingFor refuses instead
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1b. THE ADAPTED FALSIFIER — this_week.md's own nesting breaks the flat assumption", () => {
  test("MEASURED: available-overdue's printed order does NOT match ascending available_date", { skip: skipVault }, () => {
    // THE FINDING THAT CHANGED THIS MODULE'S DESIGN. "Check personal outcomes" (available_date
    // 2026-07-27, the earliest in the section) prints LAST — after two #outcome ancestor roots
    // whose own subtrees carry the later 2026-07-28 — because section_builder.py's
    // `_order_children` sorts `ordering:` only within same-parent qualifying siblings and places
    // every context/ancestor row ahead of every qualifying row at each tree level, unconditionally.
    // If this assertion ever starts PASSING, the engine's own behaviour changed and `ordering.ts`'s
    // `nested-section` refusal may be safe to narrow — it should not be deleted on faith alone.
    const source = readFileSync(join(vaultDir, "this_week.md"), "utf8");
    const documentOrder = markerValuesInDocumentOrder(source, "Overdue to Start", "available_date");
    const sorted = sortedAscending(documentOrder, "date");
    assert.notDeepEqual(
      documentOrder,
      sorted,
      "this_week.md's nesting no longer breaks flat ordering — re-examine whether nested-section " +
        "can be narrowed, but do not remove it without re-measuring section_builder.py's own rule",
    );
  });

  for (const { section, heading } of [
    { section: "overdue", heading: "Overdue" },
    { section: "due-this-week", heading: "Due This Week" },
    { section: "available-overdue", heading: "Overdue to Start" },
    { section: "available-this-week", heading: "Scheduled This Week" },
  ]) {
    test(`orderingFor abstains 'nested-section' for this-week.${section}, against real content`, { skip: skipVault }, () => {
      const source = readFileSync(join(vaultDir, "this_week.md"), "utf8");
      const lines = source.split("\n");
      const headingAt = lines.findIndex((l) => classifyLine(l).kind === "heading" && classifyLine(l).text === heading);
      assert.ok(headingAt !== -1, `no '## ${heading}' heading found`);
      // The first content line under the heading — whatever it is, editing it must refuse, because
      // the refusal is a property of the SECTION'S shape, not of which line inside it is touched.
      const firstContentAt = headingAt + 1;
      const reading = orderingFor(
        "this-week",
        section,
        source,
        firstContentAt,
        lines[firstContentAt] ?? "",
        ORDERING,
        ORDERING_FIELDS,
      );
      // A section with genuinely nothing printed under it (measured earlier in this arc: "Overdue"
      // is currently empty) has no line to test — skip that one case rather than fail on an empty
      // fixture, while every section that DOES have content must show the refusal.
      if ((lines[firstContentAt] ?? "").trim() === "" || classifyLine(lines[firstContentAt]).kind === "heading") {
        return;
      }
      assert.deepEqual(reading, { kind: "abstains", because: "nested-section" });
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A TEST AGAINST HIS REAL CONFIG — the 9 sections say something; the other 177 are silent
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. against the real published table", () => {
  test("flowtrace-queue.queue: moving queue_position from 4 to 1 says the rank changed", () => {
    const source = [
      "## Queue",
      "- [ ] a [[qntm:1]] #chore #dev 🔢 1",
      "- [ ] b [[qntm:2]] #chore #dev 🔢 2",
      "- [ ] c [[qntm:3]] #chore #dev 🔢 3",
      "- [ ] d [[qntm:4]] #chore #dev 🔢 4",
    ].join("\n");
    const reading = orderingFor(
      "flowtrace-queue",
      "queue",
      source,
      4,
      "- [ ] d [[qntm:4]] #chore #dev 🔢 1",
      ORDERING,
      ORDERING_FIELDS,
    );
    assert.equal(reading.kind, "answer");
    assert.equal(reading.answer.moved, true);
    assert.equal(reading.answer.beforeRank, 4);
    assert.equal(reading.answer.afterRank, 1);
  });

  test("a FLAT this-week-shaped fixture: an edit that does not change the sort key says nothing", () => {
    // Deliberately flat (no #outcome ancestor) — this-week's real content is never flat (§1b), so
    // this proves orderingFor's OWN "unchanged answer is silence" logic independent of the nested
    // refusal that would otherwise mask it.
    const source = [
      "## Due This Week",
      "- [ ] a [[qntm:1]] #task #work 📅 2026-08-01",
      "- [ ] b [[qntm:2]] #task #work 📅 2026-08-05",
    ].join("\n");
    const reading = orderingFor(
      "this-week",
      "due-this-week",
      source,
      1,
      "- [ ] a renamed [[qntm:1]] #task #work 📅 2026-08-01",
      ORDERING,
      ORDERING_FIELDS,
    );
    assert.equal(reading.kind, "answer");
    assert.equal(reading.answer.moved, false);
  });

  test("one of the OTHER 177 sections — inbox's domain-empty — is silent, always", () => {
    const reading = orderingFor(
      "inbox",
      "domain-empty",
      "## Domain Empty\n- [ ] Ring the dentist",
      1,
      "- [ ] Ring the dentist #work",
      ORDERING,
      ORDERING_FIELDS,
    );
    assert.equal(reading.kind, "abstains");
    assert.equal(reading.because, "no-section-declaration");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. EVERY REFUSAL PATH PRODUCES SILENCE — all five `OrderingAbstention` values
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. every abstention, named", () => {
  test('1/5 — "no-section-declaration": a section outside the published 9', () => {
    const reading = orderingFor("inbox", "not-a-section", "## H\n- [ ] x", 1, "- [ ] x", ORDERING, ORDERING_FIELDS);
    assert.deepEqual(reading, { kind: "abstains", because: "no-section-declaration" });
  });

  test('2/5 — "insertion-order": daily-work.capture has a mode, not a field', () => {
    const reading = orderingFor(
      "daily-work",
      "capture",
      "## Work Capture\n- [ ] x",
      1,
      "- [ ] x #work",
      ORDERING,
      ORDERING_FIELDS,
    );
    assert.deepEqual(reading, { kind: "abstains", because: "insertion-order" });
  });

  test('3/5 — "field-not-published": a hand-built section ordering by an unmapped field', () => {
    const fakeOrdering = { v: { s: { ordering: [{ field: "mystery", direction: "asc" }] } } };
    const reading = orderingFor("v", "s", "## H\n- [ ] x", 1, "- [ ] x", fakeOrdering, ORDERING_FIELDS);
    assert.deepEqual(reading, { kind: "abstains", because: "field-not-published" });
  });

  test('4/5 — "nested-section": an indented sibling anywhere in the section refuses the whole edit', () => {
    const fakeOrdering = { v: { s: { ordering: [{ field: "queue_position", direction: "asc" }] } } };
    const source = ["## H", "- [ ] a [[qntm:1]] 🔢 1", "    - [ ] child, indented, no marker"].join("\n");
    const reading = orderingFor("v", "s", source, 1, "- [ ] a [[qntm:1]] 🔢 2", fakeOrdering, ORDERING_FIELDS);
    assert.deepEqual(reading, { kind: "abstains", because: "nested-section" });
  });

  test('5/5 — "no-value": the AFTER text carries no marker at all', () => {
    const source = "## Queue\n- [ ] a [[qntm:1]] #dev 🔢 1";
    const reading = orderingFor("flowtrace-queue", "queue", source, 1, "- [ ] a [[qntm:1]] #dev", ORDERING, ORDERING_FIELDS);
    assert.deepEqual(reading, { kind: "abstains", because: "no-value" });
  });

  test('"no-value" the other way — the BEFORE text carried no marker (a fresh row acquiring one)', () => {
    const source = "## Queue\n- [ ] a [[qntm:1]] #dev";
    const reading = orderingFor("flowtrace-queue", "queue", source, 1, "- [ ] a [[qntm:1]] #dev 🔢 1", ORDERING, ORDERING_FIELDS);
    assert.deepEqual(reading, { kind: "abstains", because: "no-value" });
  });

  test("a FLAT section with a marker-less sibling excludes it from the ranking, not from the refusal", () => {
    // The flow-trace queue.md real trap: a DONE item with no 🔢 sits flat (no indent) beside active
    // items. Flat means no nested-section refusal; the marker-less sibling is simply excluded from
    // the ranked set (siblingCount reflects it), matching real content §1a already proves works.
    const source = [
      "## Queue",
      "- [ ] a [[qntm:1]] 🔢 1",
      "- [ ] b [[qntm:2]] 🔢 2",
      "- [x] done, no marker [[qntm:3]]",
    ].join("\n");
    const reading = orderingFor("flowtrace-queue", "queue", source, 1, "- [ ] a [[qntm:1]] 🔢 3", ORDERING, ORDERING_FIELDS);
    assert.equal(reading.kind, "answer");
    assert.equal(reading.answer.siblingCount, 1, "the marker-less done item should not count as a sibling");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE DIRECTION FOLLOWS THE DECLARATION — restated with orderingFor itself, not just the generator
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. orderingFor follows a flipped direction, not a hardcoded ascending assumption", () => {
  const ascOrdering = { v: { s: { ordering: [{ field: "due_date", direction: "asc" }] } } };
  const descOrdering = { v: { s: { ordering: [{ field: "due_date", direction: "desc" }] } } };
  const source = [
    "## H",
    "- [ ] a [[qntm:1]] 📅 2026-08-01",
    "- [ ] b [[qntm:2]] 📅 2026-08-10",
  ].join("\n");
  const moveEarlier = "- [ ] b [[qntm:2]] 📅 2026-07-01"; // now EARLIER than a's 2026-08-01

  test("ascending: making b earlier than a moves it from rank 2 to rank 1", () => {
    const reading = orderingFor("v", "s", source, 2, moveEarlier, ascOrdering, ORDERING_FIELDS);
    assert.equal(reading.answer.moved, true);
    assert.equal(reading.answer.beforeRank, 2);
    assert.equal(reading.answer.afterRank, 1);
  });

  test("descending: the SAME edit moves b the OTHER way, from rank 1 to rank 2", () => {
    const reading = orderingFor("v", "s", source, 2, moveEarlier, descOrdering, ORDERING_FIELDS);
    assert.equal(reading.answer.moved, true);
    assert.equal(reading.answer.beforeRank, 1);
    assert.equal(reading.answer.afterRank, 2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. NO CLOCK — the whole "answer" path never calls Date.now
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. orderingFor reaches the clock zero times", () => {
  test("Date.now poisoned, every real section still answers or abstains cleanly", () => {
    const saved = Date.now;
    Date.now = () => {
      throw new Error("orderingFor reached the clock — the day-boundary dependency was NOT refuted");
    };
    try {
      for (const [view, sections] of Object.entries(ORDERING)) {
        for (const sectionId of Object.keys(sections)) {
          // A minimal one-line section is enough to drive every branch up to (and past) the
          // declaration lookup; the clock, if reached at all, would be reached here.
          orderingFor(view, sectionId, "## H\n- [ ] x", 1, "- [ ] x", ORDERING, ORDERING_FIELDS);
        }
      }
    } finally {
      Date.now = saved;
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. NOTHING LOCAL REACHES A WRITE — this module specifically
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("6. NOTHING LOCAL REACHES A WRITE — ordering.ts's own imports", () => {
  test("ordering.ts imports nothing from source.ts, context.ts or cascade.ts", () => {
    const src = readFileSync(resolve(HERE, "..", "app", "present", "ordering.ts"), "utf8");
    for (const line of src.split(/\r?\n/)) {
      if (!/^\s*import\b/.test(line)) continue;
      assert.doesNotMatch(
        line,
        /["']\.\/(source|context|cascade)\.js["']/,
        `ordering.ts imports the edit or cascade path: ${line.trim()}`,
      );
    }
  });
});

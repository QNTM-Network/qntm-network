/**
 * R1 OF PRESENTATION-INSTANCE IDENTITY — the row is a thing, addressed by
 * `${view}/${section}/${token}`, derived in the browser from the markdown alone.
 *
 *   node --test tests/present-instance.test.mjs
 *
 * ── WHAT THIS PROVES, AND WHAT IT DOES NOT ──
 *
 * `docs/implementation-artifacts/design-presentation-instance-identity.md` is the brief; this file
 * is R1 from its §7 ranked order. It proves: the format is stable and matches what R2 (§2.3(c))
 * would produce positionally; the operator's own `this_week.md` duplicate resolves with a single
 * lookup, no narrowing; a stamped node that moves section still keeps the cursor (§3.3, refutation
 * 1 — a pure instance id alone would NOT do this, see the second describe block below); and
 * `metrics.md`'s moving-ratio heading no longer produces a false `absent` (§1.3), because a
 * heading's id comes from its ORDINAL, never its characters.
 *
 * It does NOT prove: anything in a browser (every projection here is a string in this file, same
 * posture as tests/present-anchor.test.mjs); that R2 will emit the exact same STRING — only that
 * the ORDINAL this module counts matches the declared section order positionally, which is the
 * fact §2.3(c) measured and the fact R2 must key its own `section` field on for the strings to
 * agree (see `instance.ts`'s own header for why this module cannot close that gap alone).
 *
 * ── THE FIXTURES ARE THE OPERATOR'S OWN LINES, `inbox.md` FIRST ──
 *
 * `~/qntm/inbox.md` is the view he says he actually starts in (`this_week.md` is not — "unideal").
 * Copied verbatim here rather than read live, the same reason tests/present-anchor.test.mjs and
 * vim-normal-mode-slice-4's own fixtures do: `~/qntm/*.md` is a live vault and can change mid-run.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";

import { makeDocument, makeBody } from "./fixtures/dom-stub.mjs";
import {
  instanceAnchorFor,
  instanceOf,
  instancesOf,
  paint,
  PresentationContext,
  resolveInstanceAnchor,
} from "../dist/present.js";

const md = new MarkdownIt("commonmark").enable("table");

// ── `~/qntm/inbox.md`, verbatim (read-only, 2026-07-31) — THE PRIMARY FIXTURE ─────────────────
const INBOX = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
  "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
  "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
].join("\n");

// The declared order `apps/qntm-md/config/views/inbox.yaml` prints its `sections:` list in — TWO
// entries, TRANSCRIBED here with a citation rather than read live at test time (this suite must not
// depend on a sibling repo/worktree being checked out for CI to pass): `id: inbox-tagged` first,
// `id: domain-empty` second. This is the fact §2.3(c) of the design document measured — the Nth
// heading in the rendered file IS the Nth entry here — and it is what this file's own §2 proves
// positionally, without ever reading the YAML.
const INBOX_DECLARED_SECTIONS = ["inbox-tagged", "domain-empty"];

// ── THE REAL CYCLE THE DESIGN DOCUMENT MEASURED (§2.2) — A NEW NODE SORTS TO THE TOP ───────────
// He typed "Lesley pay tenner"; the cycle stamped it and it sorted FIRST in "Domain Empty". Every
// existing line's INDEX moved down by one. Reproduced here as a general shape: any new task
// inserted above the existing three.
const INBOX_AFTER_CYCLE = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] Refresh comp benchmarking [[qntm:2611]] #task 🆕 2026-07-31",
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
  "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
  "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
].join("\n");

// ── `~/qntm/this_week.md`, verbatim (read-only, 2026-07-31) — THE DUPLICATE CASE ───────────────
// `this-week.yaml`'s own header comment: "A node can appear in both a due and a scheduled section
// (they are different lenses)". Deliberate, not an accident — design doc §0.6/§9.6.
const THIS_WEEK = [
  "## Overdue",
  "## Due This Week",
  "- [ ] Schonfeld trial + conversion [[qntm:1975]] #outcome #work ☑️ 1",
  "    - [ ] Kick off trial / confirm it's kicked off n#task [[qntm:1986]] #task #work 📅 2026-08-01 🛫 2026-08-01 🆕 2026-07-15",
  "## Overdue to Start",
  "- [ ] Pay back per Darinz' plan said on 16th May [[qntm:1232]] #outcome #personal",
  "    - [ ] Monthly payments [[qntm:1233]] #outcome #personal",
  "        - [ ] Pay aug [[qntm:1234]] #task #personal 📅 2026-08-28 🛫 2026-07-28 🆕 2026-06-28",
  "- [ ] Get summer suit [[qntm:2412]] #outcome #personal 🆕 2026-07-27",
  "    - [ ] Discuss with Darinz / look for suits [[qntm:2426]] #task #personal 🛫 2026-07-28 🆕 2026-07-27",
  "- [ ] Check personal outcomes [[qntm:1054]] #task #personal 🛫 2026-07-27 🆕 2026-07-28",
  "## Scheduled This Week",
  "- [ ] Schonfeld trial + conversion [[qntm:1975]] #outcome #work ☑️ 1",
  "    - [ ] Kick off trial / confirm it's kicked off n#task [[qntm:1986]] #task #work 📅 2026-08-01 🛫 2026-08-01 🆕 2026-07-15",
  "- [ ] Pay back per Darinz' plan said on 16th May [[qntm:1232]] #outcome #personal",
  "    - [ ] Service charge [[qntm:1235]] #outcome #personal",
  "        - [ ] Pay batch [[qntm:2364]] #task #personal 🛫 2026-08-01 🆕 2026-07-25",
  "- [ ] Check in with client confirming 1st Aug for WYPF and update internal thred [[qntm:1442]] #task #work 🛫 2026-08-01 🆕 2026-06-29",
].join("\n");

// `qntm:1986` moved from `## Due This Week` (section 1) into `## Overdue` (section 0) — the exact
// case index arithmetic, and a pure instance id, cannot express. See anchor.ts's own
// MOVED_BETWEEN_SECTIONS fixture; this is the same shape, over the real file.
const MOVED_BETWEEN_SECTIONS = [
  "## Overdue",
  "    - [ ] Kick off trial / confirm it's kicked off n#task [[qntm:1986]] #task #work 📅 2026-08-01 🛫 2026-08-01 🆕 2026-07-15",
  "## Due This Week",
  "- [ ] Schonfeld trial + conversion [[qntm:1975]] #outcome #work ☑️ 1",
  "## Overdue to Start",
  "- [ ] Pay back per Darinz' plan said on 16th May [[qntm:1232]] #outcome #personal",
  "",
].join("\n");

// A node repeating INSIDE one section (the `structural_edge_types` case, design doc §2.4) — built
// rather than observed, since none of the operator's five live views uses it (design doc, same
// section). Same three headings as THIS_WEEK so the section ORDINAL of "Overdue to Start" is
// unchanged (2) and the ambiguity below is caused by the repeat alone, not a section shift.
const CURSOR_LINE = "- [ ] Pay back per Darinz' plan said on 16th May [[qntm:1232]] #outcome #personal";
const NODE_REPEATS_IN_ONE_SECTION = [
  "## Overdue",
  "## Due This Week",
  "## Overdue to Start",
  CURSOR_LINE,
  CURSOR_LINE,
  "",
].join("\n");

// ── `~/qntm/metrics.md`, verbatim (read-only, 2026-07-31) — THE FALSE-`absent` CASE ─────────────
// design doc §1.3: EVERY line answers at TEXT (zero stamps), and the ratio in each heading moves
// every cycle — measured live, `0.49` became `0.44` between two reads of the same file.
const METRICS = [
  "## On-track accuracy (today) 🎯 0.21",
  "## On-track accuracy (3d) 🎯 0.44",
  "## On-track accuracy (7d) 🎯 0.51",
  "## Age of intent (30d) 🎯 5.7",
  "## Scheduled coverage (%) 🎯 11.0",
].join("\n");

// The SAME file, one cycle later — only the SECOND heading's ratio moved, from `0.44` to `0.49`,
// mirroring the live delta the design document measured. The section ORDER did not change: the
// engine prints every declared section's heading every cycle, even an empty one (design §2.3(c)),
// so a config-driven view's heading COUNT and ORDER are stable across cycles in a way its printed
// RATIOS are not.
const METRICS_NEXT_CYCLE = [
  "## On-track accuracy (today) 🎯 0.21",
  "## On-track accuracy (3d) 🎯 0.49",
  "## On-track accuracy (7d) 🎯 0.51",
  "## Age of intent (30d) 🎯 5.7",
  "## Scheduled coverage (%) 🎯 11.0",
].join("\n");

describe("1. instancesOf — every printed line gets an id, a blank line gets none", () => {
  test("inbox.md: two headings, three stamped node lines, five ids, zero collisions", () => {
    const instances = instancesOf(INBOX, "inbox");
    assert.equal(instances.length, 5);
    assert.ok(instances.every((info) => info !== null), "every non-blank line got an id");
    const ids = instances.map((info) => info.instance);
    assert.equal(new Set(ids).size, 5, "five lines, five distinct ids");
  });

  test("a heading's id carries no node — its identity is its ordinal, not its text", () => {
    const [inboxHeading, domainEmptyHeading] = instancesOf(INBOX, "inbox");
    assert.equal(inboxHeading.node, null);
    assert.equal(inboxHeading.section, 0);
    assert.equal(domainEmptyHeading.node, null);
    assert.equal(domainEmptyHeading.section, 1);
  });

  test("a node line carries its stamp, bracket-free, and its section's ordinal", () => {
    const info = instanceOf(INBOX, 2, "inbox"); // "- [ ] Lesley pay tenner … [[qntm:2603]] …"
    assert.equal(info.node, "qntm:2603");
    assert.equal(info.section, 1); // under "## Domain Empty", the SECOND heading
  });

  test("a blank line gets NO id — matching the retired anchor.ts's own anchorFor(...) === null", () => {
    const withBlank = "## A\n- [ ] a task [[qntm:1]] #task\n\n- [ ] b task [[qntm:2]] #task\n";
    const instances = instancesOf(withBlank, "v");
    assert.equal(instances[2], null, "the blank line has no instance");
    assert.ok(instances[0] !== null && instances[1] !== null && instances[3] !== null);
  });

  test("out of range and a negative index both answer null, matching instanceOf's contract", () => {
    assert.equal(instanceOf(INBOX, 99, "inbox"), null);
    assert.equal(instanceOf(INBOX, -1, "inbox"), null);
  });
});

describe("2. THE FORMAT MATCHES WHAT R2 WOULD PRODUCE — positional parity with the declared config", () => {
  test("the Nth heading's section ordinal is the Nth entry in the view's DECLARED sections list", () => {
    // This is design doc §2.3(c)'s own measurement (24 declared sections, 24 headings, exact
    // positional match), operationalised as an assertion rather than left as prose. R2 (server-
    // side, reading `apps/qntm-md/config/views/inbox.yaml`'s own `sections:` list) can therefore
    // key its own `section` field on the SAME ordinal this module counts from the markdown alone —
    // the property that makes "R1 and R2 produce the identical string" achievable, PROVIDED R2's
    // `section` component is that ordinal and not the config's string `id` (see instance.ts's
    // header for why this module cannot close that gap by itself).
    const instances = instancesOf(INBOX, "inbox");
    INBOX_DECLARED_SECTIONS.forEach((_declaredId, ordinal) => {
      assert.equal(instances[ordinal].section, ordinal);
    });
  });

  test("the exact string shape: view/section/token, no suffix when the token is unique in its section", () => {
    const [inboxHeading, domainEmptyHeading, lesley, matt, zoe] = instancesOf(INBOX, "inbox");
    assert.equal(inboxHeading.instance, "inbox/0/§heading");
    assert.equal(domainEmptyHeading.instance, "inbox/1/§heading");
    assert.equal(lesley.instance, "inbox/1/qntm:2603");
    assert.equal(matt.instance, "inbox/1/qntm:2602");
    assert.equal(zoe.instance, "inbox/1/qntm:2598");
  });

  test("a node inserted ABOVE existing lines shifts their INDEX but never their instance", () => {
    // design doc §2.2's own measurement, reproduced: he typed a new line, the cycle stamped it and
    // sorted it to the top of "Domain Empty", and every line below moved down by one. The ids did
    // not move.
    const before = instancesOf(INBOX, "inbox");
    const after = instancesOf(INBOX_AFTER_CYCLE, "inbox");
    // "Lesley pay tenner" was line 2 before, line 3 after — its instance is unchanged.
    assert.equal(before[2].instance, after[3].instance);
    assert.equal(before[3].instance, after[4].instance); // Matt's coverage updates
    assert.equal(before[4].instance, after[5].instance); // Remove zoe
  });
});

describe("3. THE DUPLICATE CASE — this_week.md resolves with ONE lookup, no narrowing", () => {
  test("the three duplicated nodes produce SIX distinct instances, not three", () => {
    const instances = instancesOf(THIS_WEEK, "this-week").filter((info) => info !== null);
    const nodeLines = instances.filter((info) => info.node !== null);
    const ids = nodeLines.map((info) => info.instance);
    assert.equal(new Set(ids).size, ids.length, "every stamped line has a distinct instance");
  });

  test("R1'S OWN FALSIFIER — the anchor taken on ONE printing resolves to THAT printing, directly", () => {
    // Line 5 is the FIRST "Pay back per Darinz'" — under "## Overdue to Start". Line 14 is the
    // SECOND, under "## Scheduled This Week". A pure instance lookup tells them apart because
    // their sections differ; `resolveInstanceAnchor` never had to fall through to a node search,
    // let alone narrow by section the way anchor.ts's `decide()` does.
    const anchor = instanceAnchorFor(THIS_WEEK, 5, "this-week");
    const reading = resolveInstanceAnchor(anchor, THIS_WEEK, "this-week");
    assert.deepEqual(reading, { outcome: "found", lineIndex: 5, via: "instance" });

    const otherAnchor = instanceAnchorFor(THIS_WEEK, 14, "this-week");
    const otherReading = resolveInstanceAnchor(otherAnchor, THIS_WEEK, "this-week");
    assert.deepEqual(otherReading, { outcome: "found", lineIndex: 14, via: "instance" });
  });

  test("THE MUTATION PROOF — corrupt `takenAt` and the answer does not move", () => {
    const anchor = instanceAnchorFor(THIS_WEEK, 5, "this-week");
    for (const nonsense of [0, 999, -7]) {
      const reading = resolveInstanceAnchor({ ...anchor, takenAt: nonsense }, THIS_WEEK, "this-week");
      assert.deepEqual(reading, { outcome: "found", lineIndex: 5, via: "instance" });
    }
  });

  test("a node repeating INSIDE one section is refused, not guessed", () => {
    // Taken against THIS_WEEK, where "Overdue to Start" (section 2) holds qntm:1232 exactly once —
    // so the anchor's own instance carries no `#` suffix. Resolved against a projection where the
    // SAME section now holds it twice: the un-suffixed instance matches neither suffixed printing,
    // so the walk falls to the node, finds two, and refuses rather than picking one.
    const anchor = instanceAnchorFor(THIS_WEEK, 5, "this-week");
    assert.equal(anchor.instance.includes("#"), false, "the sole printing carries no suffix");
    const reading = resolveInstanceAnchor(anchor, NODE_REPEATS_IN_ONE_SECTION, "this-week");
    assert.equal(reading.outcome, "ambiguous");
    assert.deepEqual(reading.candidates, [3, 4]);
  });
});

describe("4. REFUTATION 1 — a stamped node that MOVES SECTION still keeps the cursor", () => {
  // design-presentation-instance-identity.md §3.3: "an instance id alone loses 'follow the node',
  // which the app has today for free" — the one thing that would have made a naive R1 a regression.
  test("a PURE instance lookup alone would lose it — proven before it is refused", () => {
    const anchor = instanceAnchorFor(THIS_WEEK, 3, "this-week"); // qntm:1986, under "## Due This Week"
    const instances = instancesOf(MOVED_BETWEEN_SECTIONS, "this-week");
    const pureLookup = instances.some((info) => info?.instance === anchor.instance);
    assert.equal(pureLookup, false, "the moved row's instance really did change — this is the trap");
  });

  test("resolveInstanceAnchor carries the node beside the instance and finds it anyway", () => {
    const anchor = instanceAnchorFor(THIS_WEEK, 3, "this-week");
    assert.equal(anchor.node, "qntm:1986");
    const reading = resolveInstanceAnchor(anchor, MOVED_BETWEEN_SECTIONS, "this-week");
    // Found at line 1 in the new projection — via "node", not "instance", which is exactly the
    // signal a caller needs to say "the section changed" rather than staying silent about it.
    assert.deepEqual(reading, { outcome: "found", lineIndex: 1, via: "node" });
    assert.equal(
      MOVED_BETWEEN_SECTIONS.split("\n")[reading.lineIndex],
      THIS_WEEK.split("\n")[3],
      "the cursor did not land on the same line",
    );
  });
});

describe("5. THE FALSE absent — metrics.md's moving ratio no longer loses the cursor", () => {
  test("BEFORE: every line in metrics.md answers with no stamp at all", () => {
    const instances = instancesOf(METRICS, "metrics");
    assert.ok(instances.every((info) => info !== null && info.node === null));
  });

  test("a heading whose RATIO moved keeps its instance — the fix, exactly", () => {
    const anchor = instanceAnchorFor(METRICS, 1, "metrics"); // "## On-track accuracy (3d) 🎯 0.44"
    assert.notEqual(
      METRICS.split("\n")[1],
      METRICS_NEXT_CYCLE.split("\n")[1],
      "the fixture really did change the line's characters",
    );
    const reading = resolveInstanceAnchor(anchor, METRICS_NEXT_CYCLE, "metrics");
    assert.deepEqual(reading, { outcome: "found", lineIndex: 1, via: "instance" });
  });

  test("HOW MUCH OF THE BUG THIS FIXES, STATED PRECISELY: every heading, none of a moved BODY line", () => {
    // Every heading in metrics.md keeps its instance across the ratio change, because a heading's
    // token is the constant HEADING_TOKEN and never its text — see instance.ts's header. This is
    // the WHOLE of the measured bug (design doc §1.3 observed it only on headings, in a view with
    // zero node lines). An unstamped BODY line whose own text is later edited is NOT protected —
    // its identity is still its exact characters, matching anchor.ts's own honest limit for TEXT
    // (§1.2: "job one survives"). That is unchanged and correctly so: R2 does not change this
    // either, since a body line still has no config-declared ordinal to fall back on.
    const before = instancesOf(METRICS, "metrics");
    const after = instancesOf(METRICS_NEXT_CYCLE, "metrics");
    assert.deepEqual(
      before.map((info) => info.instance),
      after.map((info) => info.instance),
      "every heading's instance is stable across the ratio change",
    );
  });
});

describe("6. `data-instance` reaches the DOM — R3, folded in", () => {
  function view(source, viewId) {
    globalThis.document = makeDocument();
    const body = makeBody();
    paint(body, source, new PresentationContext(), { markdown: md, view: viewId });
    return body;
  }

  test("every painted row carries data-instance, matching instancesOf line for line", () => {
    // `body.children` — the ROWS `paint()` appends directly, not `walk()`'s full recursive walk,
    // which would also collect a checkbox row's own `<input>` and `<span>` children.
    const body = view(INBOX, "inbox");
    const rows = body.children;
    const instances = instancesOf(INBOX, "inbox");
    assert.equal(rows.length, instances.length, "one row per non-blank line — inbox.md has none");
    rows.forEach((row, i) => {
      assert.equal(row.dataset.instance, instances[i].instance);
    });
  });

  test("with NO view id supplied, no row carries data-instance — byte-identical to before R1", () => {
    globalThis.document = makeDocument();
    const body = makeBody();
    paint(body, INBOX, new PresentationContext(), { markdown: md });
    for (const row of body.children) {
      assert.equal(row.dataset.instance, undefined);
    }
  });
});

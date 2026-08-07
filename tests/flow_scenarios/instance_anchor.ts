/**
 * instance_anchor — THE ANCHOR WALK, and the second construct that closes its authoring hole.
 *
 * Run by flow-trace's node observer (`flow-trace verify .`). Not picked up by `npm test`, which
 * globs `tests/**\/*.test.mjs`; every claim below is additionally proved under `node --test` by
 * tests/present-instance.test.mjs and tests/present-relative.test.mjs.
 *
 * ── WHY THIS FILE EXISTS ──
 *
 * `tests/flow_scenarios/vim_gestures.ts` records, in as many words, that `instance.ts` "is
 * sibling-owned and still in flight, so it is deliberately left unscenario'd here … a real gap
 * today, not an oversight". That sibling landed. This closes the gap, and it closes it for the
 * module that came WITH the sibling as well — `relative.ts`.
 *
 * ── THE FALSIFIABLE CLAIMS ──
 *
 * 1. `relative.ts` IMPORTS NOTHING. It is the same structural claim `held.ts` makes and for a
 *    related reason: a module that reads a projection and returns a POSITION must not be able to
 *    reach anything that turns a position into a write. Asserted by reading its own source and
 *    scanning for an `import` statement — never by re-reading the module graph, which TypeScript
 *    has already stripped by the time a scenario runs.
 *
 * 2. `instance.ts` REACHES EXACTLY TWO MODULES — `express/rendition.ts` for the grammar (which
 *    lines are headings, where the `[[qntm:N]]` spans are) and `relative.ts` for the two weak
 *    rungs. `rendition.ts` moved from a flat `app/present/` home to `app/present/express/` in
 *    #134 (2026-08-06); its own header names this deliberately — "EXPRESS is allowed to be the
 *    layer other layers borrow vocabulary from" — so an anchor reaching its GRAMMAR functions
 *    (`classifyLine`, `qntmIdSpans`) across that boundary is sanctioned, not a violation. No edge
 *    to `context.ts` (an anchor is not a rendition), none to `source.ts` (it produces no edit), none
 *    to the DOM, the network or the clock.
 *
 * 3. THE WALK OBEYS `ANCHOR_TRUST`, AND EACH RUNG IS DRIVEN. Four arrivals, one per rung, over the
 *    same fixture: the row unchanged (`instance`), the row moved between sections (`node`), the row
 *    AUTHORED and then stamped in place (`relative`), and the row authored and then re-sorted out of
 *    its own neighbourhood (`text`). The third and fourth are the apex capability's own blocker —
 *    `author-in-the-browser-not-in-obsidian`, measured `absent` on 2026-07-31.
 *
 * 4. A REFUSAL IS A REFUSAL. The bracket is broken deliberately (the cycle inserts a second line
 *    into it and rewrites the characters) and the walk reports `absent` with a reason, rather than
 *    landing the cursor on a line the operator did not write.
 *
 * 5. A SECTION WITH NOTHING STAMPED IN IT IS STILL ADDRESSABLE, BY ITS OWN HEADING. Added with
 *    `the-relative-anchor-has-no-landmark-in-an-empty-section`. The first capture of the day lands
 *    in a section the cycle has never filled — 109 of the operator's 191 rendered sections carry no
 *    stamped line, 94 of them heading-only — and `relative.ts` used to refuse it outright. The
 *    landmark is the section ORDINAL, which is the same fact `instance.ts` builds a heading's own
 *    identity token from. Driven here as one more arrival, through the same one walk.
 *
 * ── WHAT IS STUBBED, AND WHY THAT IS HONEST ──
 *
 * Nothing under `app/` is stubbed — the real `instance.ts`, `relative.ts` and `rendition.ts` run.
 * What is replaced is the ENVIRONMENT, the same three capabilities `section_addressing.ts` poisons:
 * `document`, `fetch` and `Date.now` all throw for the whole of the drive, so a module that reached
 * for one says which one instead of being asserted about.
 *
 * ── WHAT THIS SCENARIO DOES NOT COVER ──
 *
 * No DOM, no painting, no browser, no page. `FocusSurface` is what a real cursor calls this walk
 * from, and its own edges are already declared and observed elsewhere in flows.yaml; driving it
 * here would spend budget re-observing them. It also does not compare anything against a running
 * cycle — every arrival below is a fixture, hand-built, because this worktree may not run one.
 *
 * ── THE FIXTURE IS SMALL ON PURPOSE ──
 *
 * `.flow-trace.yaml`'s own header measures that volume beyond "each declared edge observed once" is
 * budget spent buying nothing, and that what it costs is the evidence for whatever the run drives
 * LAST. Four arrivals over one five-line source is the whole of it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  ANCHOR_TRUST,
  instanceAnchorFor,
  resolveInstanceAnchor,
} from "../../app/present/instance.js";
import type { AnchorVia } from "../../app/present/instance.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW = "inbox";

/**
 * `~/qntm/inbox.md`'s own shape, read read-only 2026-08-01 — two headings, then stamped captures,
 * newest first. Line 2 is the line the operator is AUTHORING; it carries no stamp yet, which is the
 * whole of the case this scenario exists for.
 */
const AUTHORING = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] Ring the dentist",
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
].join("\n");
const AUTHORED_AT = 2;

/** The same file with the authored line STAMPED where it stands — the cycle's ordinary output. */
const STAMPED_IN_PLACE = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
].join("\n");

/** Stamped AND re-sorted below its neighbour — the bracket is gone; only the characters remain. */
const STAMPED_AND_RESORTED = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
  "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
].join("\n");

/** The bracket broken AND the characters rewritten — nothing honest is left to say. */
const UNRECOGNISABLE = [
  "## Inbox",
  "## Domain Empty",
  "  - [ ] Ring the dentist [[qntm:2604]] #task",
  "  - [ ] Something else [[qntm:2605]] #task",
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
].join("\n");

/**
 * CLAIM 5's fixture — `~/qntm/inbox.md`'s `## Inbox`, which is heading-only in the live file. The
 * capture is the ONLY body line of its section, so there is nothing stamped either side of it and
 * the section's own heading ordinal is the whole landmark.
 */
const EMPTY_SECTION = ["## Inbox", "## Domain Empty", "- [ ] Ring the dentist"].join("\n");
const EMPTY_SECTION_AT = 2;
const EMPTY_SECTION_STAMPED = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] Ring the dentist [[qntm:2604]] #task 🆕 2026-08-01",
].join("\n");

/** A STAMPED row, and the same row printed under a different heading — the `node` rung's own case. */
const STAMPED_HERE = ["## Inbox", "- [ ] Water the plants [[qntm:122]] #task", "## Domain Empty"].join("\n");
const STAMPED_THERE = ["## Inbox", "## Domain Empty", "- [ ] Water the plants [[qntm:122]] #task"].join("\n");

function poisonDomFetchAndClock(): () => void {
  const globals = globalThis as Record<string, unknown>;
  const saved = { document: globals.document, fetch: globals.fetch, now: Date.now };
  const forbid = (what: string) => () => {
    throw new Error(`the anchor walk reached ${what} — it must be pure`);
  };
  globals.document = new Proxy(
    {},
    { get: forbid("document"), set: forbid("document"), has: forbid("document") },
  );
  globals.fetch = forbid("fetch");
  Date.now = forbid("the clock") as typeof Date.now;
  return () => {
    globals.document = saved.document;
    globals.fetch = saved.fetch;
    Date.now = saved.now;
  };
}

/** CLAIM 1 — `relative.ts` imports nothing at all. Read off its own source, never inferred. */
function assertRelativeImportsNothing(): void {
  const source = readFileSync(resolve(HERE, "../../app/present/relative.ts"), "utf8");
  const imports = source.split(/\r?\n/).filter((line) => /^\s*import\b/.test(line));
  if (imports.length !== 0) {
    throw new Error(
      `app/present/relative.ts imports something (${imports.join(" | ")}) — it must import nothing, ` +
        "so that a module which turns a projection into a POSITION can never reach one that turns a " +
        "position into a write",
    );
  }
}

/**
 * CLAIM 2 — `instance.ts` reaches `express/rendition.ts` and `relative.ts`, and nothing else
 * under app/. `express/rendition.js` (not a flat `./rendition.js`) since #134 (2026-08-06) moved
 * the grammar module under the EXPRESS verb's own directory — a path-only move, no behaviour
 * change (PR #134's own verification: typecheck clean, 2301/2301 tests passing, dist unchanged
 * apart from source-path comments) — and `rendition.ts`'s header documents the straddle
 * deliberately: "EXPRESS is allowed to be the layer other layers borrow vocabulary from."
 */
function assertInstanceReachesOnlyTwo(): void {
  const source = readFileSync(resolve(HERE, "../../app/present/instance.ts"), "utf8");
  const allowed = new Set(["./express/rendition.js", "./relative.js"]);
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*import\b[^"']*["']([^"']+)["']/.exec(line);
    if (match === null) {
      continue;
    }
    const from = match[1] as string;
    if (!allowed.has(from)) {
      throw new Error(
        `app/present/instance.ts imports ${from} — the anchor walk may reach only the grammar ` +
          "(express/rendition.ts) and the relative anchor (relative.ts); an anchor is not a " +
          "rendition and produces no edit",
      );
    }
  }
}

/** Resolve one arrival and insist on the rung that must have answered. */
function expectRung(before: string, lineIndex: number, after: string, want: AnchorVia, at: number): void {
  const anchor = instanceAnchorFor(before, lineIndex, VIEW);
  if (anchor === null) {
    throw new Error(`the fixture's cursor line (${lineIndex}) has no identity to anchor`);
  }
  const reading = resolveInstanceAnchor(anchor, after, VIEW);
  if (reading.outcome !== "found") {
    throw new Error(`expected the ${want} rung to answer, got ${JSON.stringify(reading)}`);
  }
  if (reading.via !== want) {
    throw new Error(`expected the ${want} rung to answer, got ${reading.via}`);
  }
  if (reading.lineIndex !== at) {
    throw new Error(`the ${want} rung put the cursor on line ${reading.lineIndex}, not ${at}`);
  }
}

/** CLAIM 3 — one arrival per rung, in `ANCHOR_TRUST` order. */
function driveEveryRung(): void {
  expectRung(AUTHORING, 3, AUTHORING, "instance", 3);
  expectRung(STAMPED_HERE, 1, STAMPED_THERE, "node", 2);
  expectRung(AUTHORING, AUTHORED_AT, STAMPED_IN_PLACE, "relative", 2);
  expectRung(AUTHORING, AUTHORED_AT, STAMPED_AND_RESORTED, "text", 3);
}

/** CLAIM 4 — the neighbourhood is gone and the characters are rewritten, so nothing is claimed. */
function driveTheRefusal(): void {
  const anchor = instanceAnchorFor(AUTHORING, AUTHORED_AT, VIEW);
  if (anchor === null || anchor.relative === null) {
    throw new Error("the authored line should carry a relative anchor — the fixture is wrong");
  }
  const reading = resolveInstanceAnchor(anchor, UNRECOGNISABLE, VIEW);
  if (reading.outcome !== "absent") {
    throw new Error(`a broken bracket must refuse, not guess — got ${JSON.stringify(reading)}`);
  }
  if (reading.because === undefined) {
    throw new Error("a refusal must say WHY — 'it did not work' is not a thing a person can act on");
  }
}

/** CLAIM 5 — the first capture into a section with nothing stamped in it keeps its cursor. */
function driveTheEmptySection(): void {
  const anchor = instanceAnchorFor(EMPTY_SECTION, EMPTY_SECTION_AT, VIEW);
  if (anchor === null || anchor.relative === null) {
    throw new Error("an empty section is anchored by its own heading ordinal — the anchor is missing");
  }
  if (anchor.relative.above !== null || anchor.relative.below !== null) {
    throw new Error("the fixture was meant to have nothing stamped either side of the capture");
  }
  if (anchor.relative.section !== 1) {
    throw new Error(`the landmark is the section ordinal, and it read ${String(anchor.relative.section)}`);
  }
  expectRung(EMPTY_SECTION, EMPTY_SECTION_AT, EMPTY_SECTION_STAMPED, "relative", 2);
}

export function run(): void {
  assertRelativeImportsNothing();
  assertInstanceReachesOnlyTwo();
  if (ANCHOR_TRUST.length !== 4) {
    throw new Error(`ANCHOR_TRUST has ${ANCHOR_TRUST.length} rungs — this scenario drives four`);
  }
  const restoreEnvironment = poisonDomFetchAndClock();
  try {
    driveEveryRung();
    driveTheRefusal();
    driveTheEmptySection();
  } finally {
    restoreEnvironment();
  }
}

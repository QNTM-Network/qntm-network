/**
 * section_addressing — L3 ADDRESSING joins the ordinal to the declared section id, and the join
 * is proven closed against THE TRAP, not merely against the easy case.
 *
 * Run by flow-trace's node observer (`flow-trace verify .`). Not picked up by `npm test`, which
 * globs `tests/**\/*.test.mjs`; the claims below are additionally proved under `node --test` by
 * tests/present-address.test.mjs.
 *
 * ── THE FALSIFIABLE CLAIMS ──
 *
 * 1. `address.ts` reaches ONLY `resolution.ts`. It asks whether a line is a heading, to count
 *    section ordinals. It does not reach the presentation cascade, `source.ts`, the DOM, the
 *    network or the clock. Same posture `section_membership.ts` proves for `membership.ts`, and
 *    for the same reason: addressing a row is not an edit and not a rendition.
 *
 * 2. `sectionAt` closes THE TRAP rather than merely avoiding it. `daily-work` publishes
 *    qualifications for a PROPER SUBSET of its 5 declared sections (today: "in-progress" and
 *    "waiting"). Ordinal 1 ("urgent") is UNPUBLISHED — absent
 *    from `QualificationLanguage.sections['daily-work']` entirely — and `sectionAt` still names it
 *    correctly, because it indexes `sectionOrder` (the full declared order), never `sections` (the
 *    published subset). An implementation keyed on the subset would return the WRONG id, or throw,
 *    at this exact ordinal; this scenario fails loudly if that regresses.
 *
 * 3. THE JOIN COMPOSES HONESTLY. Addressing a row and deciding its membership are two different
 *    layers with two different reaches: `sectionAt` succeeds at ordinal 1 (daily-work's "urgent"),
 *    naming the section correctly — and `membershipFor`, given that correct name, STILL abstains
 *    with `no-section-declaration`, because `urgent`'s own qualification was never published. That
 *    is not a bug in either layer: L3 answering "where" and L5 declining "whether" are both right,
 *    and a caller that only checked one would either think a decidable section is not addressable,
 *    or think an addressable section is always decidable. Ordinal 0 ("in-progress") is the control:
 *    both layers answer there.
 *
 * ── WHAT IS STUBBED, AND WHY THAT IS HONEST ──
 *
 * Nothing under `app/` is stubbed — the real `address.ts`, `membership.ts`, `qualification.ts` and
 * `resolution.ts` run. What is replaced is the ENVIRONMENT, the same three capabilities
 * `section_membership.ts` poisons: `document`, `fetch`, `Date.now`. The declaration is read off
 * disk with `readFileSync` — the app FETCHES it now (`app/index.html`'s `loadPresentation`, since
 * `app/present/embedded-declaration.ts` was deleted), and that fetch lives in the PAGE precisely so
 * these modules stay pure. `fetch` being poisoned here and the app still working is the proof.
 *
 * ── WHAT THIS SCENARIO DOES NOT COVER ──
 *
 * No DOM, no painting, no browser, no cursor: nothing here reads a real cursor position, because
 * nothing in `app/` computes one yet for a printed row (that is `focus.ts`'s territory, unchanged
 * by this work). It also does not check agreement with the ENGINE's own `RenderedLineRecord` — that
 * needs a running cycle, which this repo's worktree is forbidden from running; see
 * `tests/present-address.test.mjs` section 4 for the closest available proof (the config's declared
 * `sections:` order against the vault's own rendered headings, for 71 of 72 real views).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readQualificationDeclaration } from "../../app/present/select/qualification.js";
import { sectionAt } from "../../app/present/address.js";
import { membershipFor } from "../../app/present/select/membership.js";
import { applyEdit } from "../../app/present/source.js";
import { PresentationContext } from "../../app/present/context.js";
import { PresentationCascade } from "../../app/present/express/cascade.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DECLARATION_PATH = resolve(HERE, "../../presentation.json");

// `~/qntm/work/daily.md`'s headings, verbatim (read-only, 2026-08-01) — the operator's own
// daily-work surface, and one of the two views the trap is about. Only "In Progress" (ordinal 0)
// has a published qualification; "Urgent" (ordinal 1) does not.
const DAILY_WORK = [
  "## In Progress",
  "- [ ] Finish the quarterly review",
  "## Urgent",
  "- [ ] Call the client back",
].join("\n");

function poisonDomFetchAndClock(): () => void {
  const globals = globalThis as Record<string, unknown>;
  const saved = { document: globals.document, fetch: globals.fetch, now: Date.now };
  const forbid = (what: string) => () => {
    throw new Error(`addressing reached ${what} — it must be pure`);
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

/** Count every call into the presentation cascade, on the CALLEE so any future caller is caught. */
function spyOnCascade(): { state: { count: number }; restore: () => void } {
  const state = { count: 0 };
  const context = PresentationContext.prototype as unknown as Record<string, unknown>;
  const cascade = PresentationCascade.prototype as unknown as Record<string, unknown>;
  const saved = { at: context.at, with: context.with, resolve: cascade.resolve };
  const wrap = (original: unknown) =>
    function (this: unknown, ...args: unknown[]) {
      state.count += 1;
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  context.at = wrap(saved.at);
  context.with = wrap(saved.with);
  cascade.resolve = wrap(saved.resolve);
  return {
    state,
    restore: () => {
      context.at = saved.at;
      context.with = saved.with;
      cascade.resolve = saved.resolve;
    },
  };
}

/** `address.ts` must import ONLY `rendition.ts` — asserted by reading its own source, the same
 * check `section_membership.ts` runs against `membership.ts`. */
function assertAddressImportsOnlyRendition(): void {
  const source = readFileSync(resolve(HERE, "../../app/present/address.ts"), "utf8");
  for (const line of source.split(/\r?\n/)) {
    if (!/^\s*import\b/.test(line)) continue;
    // THE CLAIM IS *WHAT* IT IMPORTS, NOT *WHERE FROM* — corrected 2026-08-10. This read
    // `["']\.\/rendition\.js["']`, pinned to a sibling path, and `ad16c42` moved the module to
    // `./express/rendition.js` when SELECT/ARRANGE/EXPRESS were homed under `app/present/`. The
    // scenario has thrown on every run since, and the cost was far larger than one red scenario:
    // `verify` and `spotlight` ABORTED on it (unusable unscoped on this repo for ~10 commits) and
    // `canonical-routing` did the opposite — counted the dead scenario as probed and fed its
    // PARTIAL records into a routing verdict, so numbers taken here read clean off a suite with a
    // silently dead member.
    //
    // Matching `rendition.js` at any relative path keeps the assertion's real claim intact — one
    // import, and it is the line grammar — while surviving a relocation, which is what actually
    // happened rather than a second import appearing. A SECOND import, or a different module,
    // still throws.
    if (!/["']\.[./]*(?:[\w-]+\/)*rendition\.js["']/.test(line)) {
      throw new Error(`address.ts imports something other than rendition.js: ${line.trim()}`);
    }
  }
}

/** `membership.ts` must import neither `source.ts` nor `context.ts` — the same guard
 * `section_membership.ts` already runs on its own, restated here so this scenario stands on its
 * own too rather than depending on another file's assertion having run first. */
function assertMembershipImportsNeitherSourceNorContext(): void {
  const source = readFileSync(resolve(HERE, "../../app/present/select/membership.ts"), "utf8");
  for (const line of source.split(/\r?\n/)) {
    if (!/^\s*import\b/.test(line)) continue;
    if (/["']\.\/source\.js["']/.test(line) || /["']\.\/context\.js["']/.test(line)) {
      throw new Error(`membership.ts imports the edit or cascade path: ${line.trim()}`);
    }
  }
}

function driveAddressingAndItsJoinToMembership(): void {
  const declaration = JSON.parse(readFileSync(DECLARATION_PATH, "utf8")) as unknown;
  const { qualification, problems } = readQualificationDeclaration(declaration);
  if (problems.length > 0) {
    throw new Error(`the shipped declaration reported problems: ${JSON.stringify(problems)}`);
  }

  // CLAIM 2's precondition: THE TRAP needs ordinal 0's section PUBLISHED (the control) and
  // ordinal 1's section ADDRESSABLE-BUT-UNPUBLISHED (the trap itself, exactly the
  // `no-section-declaration` test membership.ts:252 runs — `language.sections[viewId]?.[sectionId]
  // === undefined`). Check that PROPERTY against the live declaration, not a snapshot of the whole
  // published set: the operator's config GROWS the published set over time (`a482fd9`/#101 added
  // "waiting" to daily-work without touching this trap at all), and a hardcoded published-set
  // literal goes stale on every such growth even when the trap itself is untouched. A property
  // keyed on the two ordinals this test actually probes cannot go stale the same way — it only
  // breaks when one of THOSE TWO ordinals' publication status flips, which is exactly the moment
  // this scenario needs to be re-pointed (see the throw below).
  const order = qualification.sectionOrder["daily-work"] ?? [];
  const published = qualification.sections["daily-work"] ?? {};
  const [controlId, trapId] = order;
  if (controlId === undefined || !(controlId in published)) {
    throw new Error(
      `the trap's CONTROL precondition changed underfoot: daily-work's ordinal 0 (${JSON.stringify(controlId)}) ` +
        `is not published — published=${JSON.stringify(Object.keys(published))} order=${JSON.stringify(order)}`,
    );
  }
  if (trapId === undefined || trapId in published) {
    throw new Error(
      `THE TRAP's own precondition changed underfoot: daily-work's ordinal 1 (${JSON.stringify(trapId)}) is ` +
        `${trapId === undefined ? "missing from sectionOrder" : "now published"} — this scenario needs an ` +
        "addressable-but-UNPUBLISHED section at this ordinal to exercise the trap. Move the ordinal this " +
        `test probes if the config's shape changed. published=${JSON.stringify(Object.keys(published))} ` +
        `order=${JSON.stringify(order)}`,
    );
  }
  const ordinal0 = sectionAt(DAILY_WORK, 0, "daily-work", qualification.sectionOrder);
  const ordinal1 = sectionAt(DAILY_WORK, 2, "daily-work", qualification.sectionOrder); // "## Urgent"
  if (ordinal0 !== "in-progress") {
    throw new Error(`ordinal 0 should address to 'in-progress', got ${JSON.stringify(ordinal0)}`);
  }
  if (ordinal1 !== "urgent") {
    throw new Error(
      `ordinal 1 should address to 'urgent' EVEN THOUGH IT IS UNPUBLISHED — got ` +
        `${JSON.stringify(ordinal1)}. Indexing the published subset instead of the full order is ` +
        "exactly the trap this scenario exists to catch.",
    );
  }

  // CLAIM 3: the join composes honestly — L3 addresses both; L5 answers only the published one.
  const publishedLine = membershipFor("daily-work", ordinal0, "- [ ] Finish the quarterly review", qualification);
  if (publishedLine.kind !== "answer") {
    throw new Error(`the published section should get an answer: ${JSON.stringify(publishedLine)}`);
  }
  const unpublishedLine = membershipFor("daily-work", ordinal1, "- [ ] Call the client back", qualification);
  if (unpublishedLine.kind !== "abstains" || unpublishedLine.because !== "no-section-declaration") {
    throw new Error(
      `the unpublished section should abstain with 'no-section-declaration', got ` +
        `${JSON.stringify(unpublishedLine)}`,
    );
  }
}

export function run(): void {
  assertAddressImportsOnlyRendition();
  assertMembershipImportsNeitherSourceNorContext();
  const cascadeSpy = spyOnCascade();
  const restoreEnvironment = poisonDomFetchAndClock();
  try {
    driveAddressingAndItsJoinToMembership();
  } finally {
    restoreEnvironment();
    cascadeSpy.restore();
  }
  if (cascadeSpy.state.count !== 0) {
    throw new Error(
      `addressing/membership reached the presentation cascade ${cascadeSpy.state.count} time(s) — ` +
        "naming a row's section and deciding whether it still belongs are not rendition questions",
    );
  }
  // Referenced so the import is real rather than elided by the compiler; never called — neither
  // layer this scenario drives may reach the edit path (claim 1, and section_membership.ts's own
  // claim 3, restated for this pairing).
  if (typeof applyEdit !== "function") {
    throw new Error("applyEdit is not importable — this scenario's edit-path claim cannot be checked");
  }
}

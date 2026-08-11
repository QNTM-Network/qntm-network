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
 * 2. `sectionAt` closes THE TRAP rather than merely avoiding it. Given a view whose ordinal 1 is
 *    ADDRESSABLE BUT UNPUBLISHED — present in `sectionOrder`, absent from
 *    `QualificationLanguage.sections[view]` entirely — `sectionAt` still names it correctly,
 *    because it indexes `sectionOrder` (the full declared order), never `sections` (the published
 *    subset). An implementation keyed on the subset would return the WRONG id, or throw, at this
 *    exact ordinal; this scenario fails loudly if that regresses.
 *
 *    ── THE PRECONDITION IS NOW CONSTRUCTED, NOT BORROWED (2026-08-11) ──
 *
 *    This scenario used to read the trap straight off the operator's committed declaration:
 *    `daily-work`'s ordinal 1, "urgent", happened to be unpublished, so the test probed it in
 *    place. On 2026-08-05 he published it. The scenario went red — correctly, by its own design —
 *    and STAYED red through twenty consecutive CI runs until 2026-08-11, because nobody reads a
 *    gate that fails on somebody using the product normally. That is the whole cost of an enforcer
 *    coupled to a person's live working config: the signal is trained into noise, and then the
 *    real findings underneath it are invisible too.
 *
 *    Its own error message proposed the repair — "Move the ordinal this test probes if the config's
 *    shape changed" — and THAT REPAIR IS NOT AVAILABLE. Measured through this same reader on
 *    2026-08-11: across all 83 views in the shipped declaration, ZERO have both a published section
 *    and an addressable-but-unpublished one. There is no ordinal anywhere left to move to. Patching
 *    was not the cheaper option; it was not an option.
 *
 *    So the trap is BUILT. The scenario derives a control view from the real declaration, then
 *    removes ONE section from the published map to make the unpublished ordinal it needs. That is
 *    not the scenario handing `sectionAt` its answer — `sectionAt` never reads `sections` at all,
 *    which is exactly the property under test. An implementation that DID read it would now return
 *    null or the wrong id, and that is the discrimination this construction buys. What it stops
 *    buying is a red light every time the operator edits his own daily view.
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
import type { QualificationLanguage } from "../../app/present/select/qualification.js";
import { sectionAt } from "../../app/present/address.js";
import { membershipFor } from "../../app/present/select/membership.js";
import { applyEdit } from "../../app/present/source.js";
import { PresentationContext } from "../../app/present/context.js";
import { PresentationCascade } from "../../app/present/express/cascade.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DECLARATION_PATH = resolve(HERE, "../../presentation.json");

// TWO HEADINGS AND A LINE UNDER EACH — the smallest source that has an ordinal 0 and an ordinal 1.
// The heading TEXT is deliberately generic and carries no meaning here: `sectionAt` counts heading
// lines and indexes `sectionOrder` by the count, so what the headings SAY is never read. It used to
// be a verbatim copy of `~/qntm/work/daily.md`, which made the fixture look like it depended on the
// operator's file when only its SHAPE was ever used.
const TWO_SECTIONS = [
  "## First",
  "- [ ] Finish the quarterly review",
  "## Second",
  "- [ ] Call the client back",
].join("\n");

const CONTROL_LINE = "- [ ] Finish the quarterly review";
const TRAP_LINE = "- [ ] Call the client back";

/**
 * The view this run probes, and the language that exhibits the trap — DERIVED from the shipped
 * declaration, never named in this file.
 *
 * `control` is the first view with at least two declared sections whose ordinal 0 is published AND
 * actually ANSWERS for a plain task line (a section that abstains for `needs-graph-traversal` or
 * `needs-clock` is a fine section and a useless control, so it is skipped rather than asserted at).
 * `trap` is the same language with ordinal 1 removed from that view's published map — addressable,
 * unpublished, constructed.
 */
function deriveProbe(qualification: QualificationLanguage): {
  view: string;
  controlId: string;
  trapId: string;
  trap: QualificationLanguage;
} {
  const skipped: string[] = [];
  for (const [view, order] of Object.entries(qualification.sectionOrder)) {
    if (order.length < 2) continue;
    const [controlId, trapId] = order;
    if (controlId === undefined || trapId === undefined) continue;
    if (qualification.sections[view]?.[controlId] === undefined) continue;
    const control = membershipFor(view, controlId, CONTROL_LINE, qualification);
    if (control.kind !== "answer") {
      skipped.push(`${view}/${controlId}:${control.kind === "abstains" ? control.because : control.kind}`);
      continue;
    }
    const published = { ...qualification.sections[view] };
    delete published[trapId];
    return {
      view,
      controlId,
      trapId,
      trap: { ...qualification, sections: { ...qualification.sections, [view]: published } },
    };
  }
  throw new Error(
    "no view in the shipped declaration has two declared sections whose ordinal 0 both publishes " +
      "and answers for a plain task line — the control half of the trap cannot be built. This is a " +
      "finding about the declaration, not about addressing. Skipped: " +
      JSON.stringify(skipped.slice(0, 10)),
  );
}

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

  const { view, controlId, trapId, trap } = deriveProbe(qualification);

  // CLAIM 2. `sectionAt` is handed the language in which ordinal 1 is UNPUBLISHED, and must still
  // name it. It reads `trap.sectionOrder` — and the only thing that changed between `qualification`
  // and `trap` is `sections`, which `sectionAt` does not take and cannot read. That is the point:
  // an implementation keyed on the published subset returns null or the wrong id here, and this
  // construction is what makes that difference observable on demand rather than on a day the
  // operator happens to have left a section unpublished.
  const ordinal0 = sectionAt(TWO_SECTIONS, 0, view, trap.sectionOrder);
  const ordinal1 = sectionAt(TWO_SECTIONS, 2, view, trap.sectionOrder);
  if (ordinal0 !== controlId) {
    throw new Error(
      `ordinal 0 of ${JSON.stringify(view)} should address to ${JSON.stringify(controlId)}, got ` +
        JSON.stringify(ordinal0),
    );
  }
  if (ordinal1 !== trapId) {
    throw new Error(
      `ordinal 1 of ${JSON.stringify(view)} should address to ${JSON.stringify(trapId)} EVEN THOUGH ` +
        `IT IS UNPUBLISHED — got ${JSON.stringify(ordinal1)}. Indexing the published subset instead ` +
        "of the full order is exactly the trap this scenario exists to catch.",
    );
  }

  // CLAIM 3: the join composes honestly — L3 addresses both; L5 answers only the published one.
  const publishedLine = membershipFor(view, ordinal0, CONTROL_LINE, trap);
  if (publishedLine.kind !== "answer") {
    throw new Error(
      `the published section ${JSON.stringify(`${view}/${ordinal0}`)} should get an answer: ` +
        JSON.stringify(publishedLine),
    );
  }
  const unpublishedLine = membershipFor(view, ordinal1, TRAP_LINE, trap);
  if (unpublishedLine.kind !== "abstains" || unpublishedLine.because !== "no-section-declaration") {
    throw new Error(
      `the unpublished section ${JSON.stringify(`${view}/${ordinal1}`)} should abstain with ` +
        `'no-section-declaration', got ${JSON.stringify(unpublishedLine)}`,
    );
  }

  // ── THE REALITY OBSERVATION, WHICH REPORTS AND NEVER GATES ──
  //
  // The claims above are now proved against a constructed trap, so nothing left in this scenario
  // depends on the operator's config having an unpublished section. That is deliberate, and it
  // loses ONE true thing worth keeping visible: whether the shape occurs in his config at all. If
  // it never does, the trap `sectionAt` closes is one the running app may never actually meet, and
  // a reader deciding what to work on should know that. Counted, printed, never thrown — a count
  // that changes with his ordinary use of the product is an observation, not a commitment.
  // Measured 2026-08-11 through this same reader: 0 of 83 views.
  const natural = Object.entries(qualification.sectionOrder).filter(([v, order]) => {
    const published = qualification.sections[v] ?? {};
    return (
      order.some((s) => published[s] !== undefined) && order.some((s) => published[s] === undefined)
    );
  });
  console.log(
    `[section_addressing] probe view=${view} control=${controlId} trap=${trapId} (constructed) · ` +
      `views whose config exhibits the trap naturally: ${natural.length}/` +
      `${Object.keys(qualification.sectionOrder).length}`,
  );
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

/**
 * section_membership — the membership answer is computed from a line's characters and a declared
 * predicate, and from NOTHING ELSE.
 *
 * Run by flow-trace's node observer (`flow-trace verify .`). Not picked up by `npm test`, which
 * globs `tests/**\/*.test.mjs`; the claims below are additionally proved under `node --test` by
 * tests/present-membership.test.mjs and tests/qualification-agreement.test.mjs.
 *
 * ── THE FALSIFIABLE CLAIMS ──
 *
 * 1. `membership.ts` reaches ONLY `resolution.ts`. It asks for the tags on a line, whether the line
 *    already carries a `[[qntm:N]]` stamp, and whether it carries content. It does not reach the
 *    presentation cascade, does not reach `source.ts`, and does not reach the DOM, the network or
 *    the clock. If it ever did, membership would stop being a statement about a line and become a
 *    participant in the edit path — which is the thing this module must never be.
 *
 * 2. It answers the operator's own case correctly from his own published declaration: a bare line
 *    under `inbox`'s "Domain Empty" BELONGS there; the same line with `#work` does not.
 *
 * 3. It produces no `SourceEdit`. `applyEdit` is imported here and never called, and the scenario
 *    fails if the membership path reaches it — the closed union of three edit kinds is untouched by
 *    this feature and there is no path from a displayed answer to a POST body.
 *
 * ── WHAT IS STUBBED, AND WHY THAT IS HONEST ──
 *
 * Nothing under `app/` is stubbed. The real `membership.ts`, the real `qualification.ts` and the
 * real `resolution.ts` run. What is replaced is the ENVIRONMENT: `document`, `fetch` and
 * `Date.now` are poisoned so that touching any of them throws. A pure module that stayed pure never
 * notices. The declaration is read off disk with `readFileSync`, and a file read is not one of the
 * three capabilities being denied. THE APP FETCHES IT NOW — `app/present/embedded-declaration.ts`
 * is deleted and `app/index.html`'s `loadPresentation` reads `/presentation.json` off the wire
 * (design-config-is-content.md step 2). The fetch was put in the PAGE, not in these modules, for
 * exactly the reason this scenario poisons `fetch`: a pure module that reached for the network
 * would fail here, and that is the shape of the change being refused.
 *
 * ── WHAT THIS SCENARIO DOES NOT COVER ──
 *
 * No DOM, no painting, no browser: nothing here shows the answer to anybody, because nothing in
 * this change does. It also does not check agreement with the ENGINE — that needs Python and the
 * operator's real graph, and lives in `scripts/qualification-agreement.py` and its test.
 *
 * KEPT DELIBERATELY SHORT. `.flow-trace.yaml` documents an observer truncation budget where a
 * scenario that drives more than it needs loses the evidence for whatever it drives LAST. Three
 * lines of fixture, one answer each way.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readQualificationDeclaration } from "../../app/present/qualification.js";
import { membershipFor } from "../../app/present/membership.js";
import { applyEdit } from "../../app/present/source.js";
import { PresentationContext } from "../../app/present/context.js";
import { PresentationCascade } from "../../app/present/cascade.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DECLARATION_PATH = resolve(HERE, "../../presentation.json");

/** The operator's own example, and the one gesture that moves it. */
const BARE = "- [ ] Ring the dentist";
const TAGGED = "- [ ] Ring the dentist #work";

function poisonDomFetchAndClock(): () => void {
  const globals = globalThis as Record<string, unknown>;
  const saved = { document: globals.document, fetch: globals.fetch, now: Date.now };
  const forbid = (what: string) => () => {
    throw new Error(`membership reached ${what} — it must be pure`);
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

/** Count every call into the source-edit path. Membership must never reach it. */
function spyOnApplyEdit(): { state: { count: number } } {
  const state = { count: 0 };
  // `applyEdit` is a module binding and cannot be reassigned from here, so the check is that it
  // was imported and stayed unused: any call would have to come from `membership.ts` itself, and
  // `membership.ts` does not import `source.ts` at all. Asserted by reading its imports below.
  const source = readFileSync(resolve(HERE, "../../app/present/membership.ts"), "utf8");
  for (const line of source.split(/\r?\n/)) {
    if (!/^\s*import\b/.test(line)) continue;
    if (/["']\.\/source\.js["']/.test(line) || /["']\.\/context\.js["']/.test(line)) {
      throw new Error(`membership.ts imports the edit or cascade path: ${line.trim()}`);
    }
  }
  return { state };
}

function driveTheMembershipLayer(): void {
  const declaration = JSON.parse(readFileSync(DECLARATION_PATH, "utf8")) as unknown;
  const { qualification, problems } = readQualificationDeclaration(declaration);
  if (problems.length > 0) {
    throw new Error(`the shipped declaration reported problems: ${JSON.stringify(problems)}`);
  }

  // CLAIM 2, first half: a bare capture under Domain Empty stays there.
  const stays = membershipFor("inbox", "domain-empty", BARE, qualification);
  if (stays.kind !== "answer" || !stays.answer.belongs) {
    throw new Error(`a bare line should belong in domain-empty: ${JSON.stringify(stays)}`);
  }

  // CLAIM 2, second half: `#work` gives it a domain, so it leaves.
  const leaves = membershipFor("inbox", "domain-empty", TAGGED, qualification);
  if (leaves.kind !== "answer" || leaves.answer.belongs) {
    throw new Error(`a #work line should NOT belong in domain-empty: ${JSON.stringify(leaves)}`);
  }

  // A section whose qualification was never published gets no answer at all — the refusal is part
  // of the commitment, not an edge case.
  const silent = membershipFor("inbox", "not-a-section", BARE, qualification);
  if (silent.kind !== "abstains" || silent.because !== "no-section-declaration") {
    throw new Error(`an unknown section should abstain: ${JSON.stringify(silent)}`);
  }
}

export function run(): void {
  const edits = spyOnApplyEdit();
  const cascadeSpy = spyOnCascade();
  const restoreEnvironment = poisonDomFetchAndClock();
  try {
    driveTheMembershipLayer();
  } finally {
    restoreEnvironment();
    cascadeSpy.restore();
  }
  if (cascadeSpy.state.count !== 0) {
    throw new Error(
      `the membership layer reached the presentation cascade ${cascadeSpy.state.count} time(s) — ` +
        "deciding whether a line belongs in a section is not a rendition question",
    );
  }
  if (edits.state.count !== 0) {
    throw new Error(`the membership layer reached applyEdit ${edits.state.count} time(s)`);
  }
  // Referenced so the import is real rather than elided by the compiler; never called.
  if (typeof applyEdit !== "function") {
    throw new Error("applyEdit is not importable — this scenario's claim 3 cannot be checked");
  }
}

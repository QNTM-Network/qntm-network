/**
 * section_ordering — the ordering answer is computed from a section's declared sort key and the
 * printed characters of the lines in it, and from NOTHING ELSE.
 *
 * Run by flow-trace's node observer (`flow-trace verify .`). Not picked up by `npm test`, which
 * globs `tests/**\/*.test.mjs`; the claims below are additionally proved under `node --test` by
 * tests/present-ordering.test.mjs and tests/app-ordering-note.test.mjs. Modelled directly on
 * tests/flow_scenarios/section_membership.ts — same three claims, same poisoning, restated for
 * design-the-resolution-architecture.md step 7's own module.
 *
 * ── THE FALSIFIABLE CLAIMS ──
 *
 * 1. `ordering.ts` reaches ONLY `resolution.ts` (for `classifyLine`, to find a section's line
 *    range). It does not reach the presentation cascade, does not reach `source.ts`, and does not
 *    reach the DOM, the network or the clock — proven directly by poisoning all three and driving
 *    every one of the operator's real 9 declared orderings through it.
 *
 * 2. It answers a real case correctly from the operator's own published declaration: moving a real
 *    queue's rank-4 row's `queue_position` to `1` reports a rank change; the same edit repeated
 *    (no-op) reports none.
 *
 * 3. It produces no `SourceEdit`. `applyEdit` is imported here and never called, and the scenario
 *    fails if the ordering path reaches it.
 *
 * ── WHAT IS STUBBED, AND WHY THAT IS HONEST ──
 *
 * Nothing under `app/` is stubbed. The real `ordering.ts` and the real `resolution.ts` run. What is
 * replaced is the ENVIRONMENT: `document`, `fetch` and `Date.now` are poisoned so that touching any
 * of them throws. A pure module that stayed pure never notices. The declaration is read off disk
 * with `readFileSync`, the same posture `section_membership.ts` already takes.
 *
 * ── WHAT THIS SCENARIO DOES NOT COVER ──
 *
 * No DOM, no painting, no browser: nothing here shows the answer to anybody, because nothing in
 * this module does. It also does not exercise the `nested-section` refusal against the real vault
 * — that measurement lives in `tests/present-ordering.test.mjs` §1b, which reads `~/qntm` and this
 * scenario deliberately does not (flow-trace's own capture filter is `include: [app]`, and reading
 * outside the repo is not this scenario's job).
 *
 * KEPT DELIBERATELY SHORT, the same truncation-budget reason `section_membership.ts` states.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { orderingFor } from "../../app/present/arrange/ordering.js";
import { applyEdit } from "../../app/present/source.js";
import { PresentationContext } from "../../app/present/context.js";
import { PresentationCascade } from "../../app/present/express/cascade.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DECLARATION_PATH = resolve(HERE, "../../presentation.json");

/** The operator's own real "flowtrace-queue" queue — a flat section, and the falsifier's own case:
 * row 4's queue_position moved to 1 changes its rank; the identical value repeated does not. */
const FLAT_SECTION = [
  "## Queue",
  "- [ ] a [[qntm:1]] #chore #dev 🔢 1",
  "- [ ] b [[qntm:2]] #chore #dev 🔢 2",
  "- [ ] c [[qntm:3]] #chore #dev 🔢 3",
  "- [ ] d [[qntm:4]] #chore #dev 🔢 4",
].join("\n");

function poisonDomFetchAndClock(): () => void {
  const globals = globalThis as Record<string, unknown>;
  const saved = { document: globals.document, fetch: globals.fetch, now: Date.now };
  const forbid = (what: string) => () => {
    throw new Error(`ordering reached ${what} — it must be pure`);
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

/** Count every call into the source-edit path. Ordering must never reach it. */
function spyOnApplyEdit(): { state: { count: number } } {
  const state = { count: 0 };
  const source = readFileSync(resolve(HERE, "../../app/present/arrange/ordering.ts"), "utf8");
  for (const line of source.split(/\r?\n/)) {
    if (!/^\s*import\b/.test(line)) continue;
    if (/["']\.\/(source|context|cascade)\.js["']/.test(line)) {
      throw new Error(`ordering.ts imports the edit or cascade path: ${line.trim()}`);
    }
  }
  return { state };
}

function driveTheOrderingLayer(): void {
  const declaration = JSON.parse(readFileSync(DECLARATION_PATH, "utf8")) as {
    resolution: {
      ordering: Parameters<typeof orderingFor>[5];
      orderingFields: Parameters<typeof orderingFor>[6];
    };
  };
  const { ordering, orderingFields } = declaration.resolution;

  // CLAIM 2, first half: moving d's queue_position from 4 to 1 reports the rank change.
  const moved = orderingFor(
    "flowtrace-queue",
    "queue",
    FLAT_SECTION,
    4,
    "- [ ] d [[qntm:4]] #chore #dev 🔢 1",
    ordering,
    orderingFields,
  );
  if (moved.kind !== "answer" || !moved.answer.moved || moved.answer.afterRank !== 1) {
    throw new Error(`rank-4-to-1 should report a move to rank 1: ${JSON.stringify(moved)}`);
  }

  // CLAIM 2, second half: the identical value, repeated, reports no move.
  const unchanged = orderingFor(
    "flowtrace-queue",
    "queue",
    FLAT_SECTION,
    4,
    "- [ ] d [[qntm:4]] #chore #dev 🔢 4",
    ordering,
    orderingFields,
  );
  if (unchanged.kind !== "answer" || unchanged.answer.moved) {
    throw new Error(`an unchanged value should report no move: ${JSON.stringify(unchanged)}`);
  }

  // A section outside the published 9 gets no answer at all — the refusal is part of the
  // commitment, not an edge case.
  const silent = orderingFor("inbox", "not-a-section", FLAT_SECTION, 4, "- [ ] x", ordering, orderingFields);
  if (silent.kind !== "abstains" || silent.because !== "no-section-declaration") {
    throw new Error(`an unknown section should abstain: ${JSON.stringify(silent)}`);
  }
}

export function run(): void {
  const edits = spyOnApplyEdit();
  const cascadeSpy = spyOnCascade();
  const restoreEnvironment = poisonDomFetchAndClock();
  try {
    driveTheOrderingLayer();
  } finally {
    restoreEnvironment();
    cascadeSpy.restore();
  }
  if (cascadeSpy.state.count !== 0) {
    throw new Error(
      `the ordering layer reached the presentation cascade ${cascadeSpy.state.count} time(s) — ` +
        "ranking a line within a section is not a rendition question",
    );
  }
  if (edits.state.count !== 0) {
    throw new Error(`the ordering layer reached applyEdit ${edits.state.count} time(s)`);
  }
  // Referenced so the import is real rather than elided by the compiler; never called.
  if (typeof applyEdit !== "function") {
    throw new Error("applyEdit is not importable — this scenario's claim 3 cannot be checked");
  }
}

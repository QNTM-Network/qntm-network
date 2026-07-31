/**
 * Vim gesture-layer scenario — the observed runtime for app/present/motions.ts, boundary.ts,
 * indent.ts and word.ts.
 *
 * WHY THIS SCENARIO EXISTS. Four modules shipped 2026-07-31 under `vim-normal-mode-is-a-gesture-
 * not-a-resolution` and no scenario drove any of them — `capabilities.yaml`'s own text says so
 * ("No tests/flow_scenarios/*.ts scenario exercises ModeSurface yet ... a real gap, not an
 * oversight papered over"). The node-test suites (present-motions, present-boundary's siblings)
 * assert VALUES — this scenario asserts the two STRUCTURAL claims those tests cannot: that the
 * gesture layer is really the shape its own module headers say it is, checked by running it
 * rather than by trusting the comment.
 *
 * TWO FALSIFIABLE CLAIMS, EACH WITH ITS OWN MECHANISM BELOW:
 *
 *   1. `app/present/motions.ts` IMPORTS NOTHING. Stated in the module's own header as the fact
 *      its whole "cannot produce a Contribution even by accident" argument rests on. Checked here
 *      by reading the file off disk and scanning for an `import` statement — not by re-reading the
 *      comment, which is exactly the thing that stops protecting the claim the day it goes stale.
 *
 *   2. THE GESTURE LAYER NEVER REACHES THE CASCADE. `ModeSurface`, `boundaryLine`, `indentedLine`
 *      and `wordCaret` decide which key does what and which LINE or COLUMN is affected; none of
 *      them may ever touch `PresentationContext` or `PresentationCascade` — that is the resolver's
 *      job, one layer up, and the whole point of keeping "which key" and "how a line renders" as
 *      two different questions. Checked here by wrapping the three cascade entry points
 *      (`PresentationContext.at`, `PresentationContext.with`, `PresentationCascade.resolve`) with a
 *      counting spy for the whole of this scenario's run and asserting the count is zero — a real
 *      call from any future version of these four modules would be caught regardless of which one
 *      made it, because the spy sits on the callee, not on the caller.
 *
 * A THIRD PROPERTY IS CHECKED THE SAME WAY LEVELS 1 AND 2 ARE — BY MAKING IT FAIL RATHER THAN BY
 * ASSERTING IT SHOULD HOLD: purity. `document`, `fetch` and `Date.now` are replaced with values
 * that throw the instant anything touches them, for the whole of the drive below. A pure module
 * that stayed pure never notices; one that reached for the DOM, the network or the clock throws
 * immediately and this scenario reports exactly which global it touched.
 *
 * WHAT IS STUBBED, and why that is honest, the same posture present_cascade.ts and render_and_edit.ts
 * already take: the four modules under test are REAL, called directly rather than through a mocked
 * `ModeSurface`. What is faked is the fixture (three source lines, chosen to reach a heading, a
 * checkbox line with a title and tags, and a plain line) and nothing else.
 *
 * WHAT THIS SCENARIO DOES NOT COVER, STATED RATHER THAN LEFT IMPLIED. `app/present/anchor.ts` is
 * being deleted by the in-flight sibling change on `feat/instance-identity` (replaced by
 * `instance.ts`), so no scenario is written for a module that is leaving; and `instance.ts` itself
 * is sibling-owned and still in flight, so it is deliberately left unscenario'd here rather than
 * scenario'd against a shape that may not survive review. Both are a real gap today, not an
 * oversight — see this repo's PR description for the backlog rows that name them.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { ModeSurface } from "../../app/present/motions.js";
import type { NormalKeyOutcome } from "../../app/present/motions.js";
import { boundaryLine } from "../../app/present/boundary.js";
import { indentedLine, INDENT_UNIT } from "../../app/present/indent.js";
import { wordCaret } from "../../app/present/word.js";
import { PresentationContext } from "../../app/present/context.js";
import { PresentationCascade } from "../../app/present/cascade.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOTIONS_SOURCE_PATH = resolve(HERE, "../../app/present/motions.ts");

/**
 * A heading (a boundary target), a checkbox line with a title and chrome ({``}} jump lands
 * nowhere else in this three-line fixture, so `}` from line 1 exercises the "ran out of headings"
 * fallthrough as well as the ordinary case), and a plain prose line. Three lines is the minimum
 * that reaches: a heading to bound against, a title with a real word for `w`/`b`/`e` to land on, and
 * a line indent.ts's own leading-whitespace arithmetic can round-trip through `>` then `<`.
 */
const FIXTURE = [
  "## Overdue",
  "- [ ] Pay aug [[qntm:1234]] #task #work",
  "prose that closes the view",
].join("\n");
const LINES = FIXTURE.split("\n");
const LAST_INDEX = LINES.length - 1;

export function run(): void {
  assertMotionsImportsNothing();

  const cascadeSpy = spyOnCascade();
  const restoreEnvironment = poisonDomFetchAndClock();
  try {
    driveTheGestureLayer();
  } finally {
    restoreEnvironment();
    cascadeSpy.restore();
  }
  if (cascadeSpy.state.count !== 0) {
    throw new Error(
      `the gesture layer reached the presentation cascade ${cascadeSpy.state.count} time(s) — ` +
        "ModeSurface/boundary/indent/word must never touch PresentationContext or PresentationCascade",
    );
  }
}

/**
 * THE FIRST FALSIFIER. Reads motions.ts off disk — not the module already loaded into this
 * process, which TypeScript has already stripped of its import statements by the time a scenario
 * could inspect it — so this is the one check in the whole scenario that looks at the SOURCE TEXT
 * rather than at behaviour. Add any `import` line to a copy of this file and this throws.
 */
function assertMotionsImportsNothing(): void {
  const source = readFileSync(MOTIONS_SOURCE_PATH, "utf8");
  const importLines = source.split("\n").filter((line) => /^\s*import\b/.test(line));
  if (importLines.length !== 0) {
    throw new Error(
      `app/present/motions.ts imports something (${importLines.join(" | ")}) — ` +
        "ModeSurface must not be able to reach resolution.ts or context.ts even by accident",
    );
  }
}

/**
 * THE SECOND FALSIFIER. Wraps the three real methods a resolution would have to go through —
 * `PresentationContext.at`, `PresentationContext.with`, `PresentationCascade.resolve` — with a
 * counter, on the PROTOTYPE, so a call from ANY caller during the drive below is caught regardless
 * of which of the four gesture modules made it.
 */
function spyOnCascade(): { state: { count: number }; restore: () => void } {
  const state = { count: 0 };
  const originalAt = PresentationContext.prototype.at;
  const originalWith = PresentationContext.prototype.with;
  const originalResolve = PresentationCascade.prototype.resolve;

  PresentationContext.prototype.at = function (
    this: PresentationContext,
    ...args: Parameters<typeof originalAt>
  ): ReturnType<typeof originalAt> {
    state.count += 1;
    return originalAt.apply(this, args);
  };
  PresentationContext.prototype.with = function (
    this: PresentationContext,
    ...args: Parameters<typeof originalWith>
  ): ReturnType<typeof originalWith> {
    state.count += 1;
    return originalWith.apply(this, args);
  };
  PresentationCascade.prototype.resolve = function (
    this: PresentationCascade,
    ...args: Parameters<typeof originalResolve>
  ): ReturnType<typeof originalResolve> {
    state.count += 1;
    return originalResolve.apply(this, args);
  };

  return {
    state,
    restore(): void {
      PresentationContext.prototype.at = originalAt;
      PresentationContext.prototype.with = originalWith;
      PresentationCascade.prototype.resolve = originalResolve;
    },
  };
}

/**
 * THE THIRD FALSIFIER. `document`/`fetch`/`Date.now` become traps that throw the instant anything
 * reads or calls them, restored in the caller's `finally` no matter what happens in between. A
 * module that is genuinely pure — no DOM, no fetch, no clock — never notices they changed.
 */
function poisonDomFetchAndClock(): () => void {
  const g = globalThis as Record<string, unknown>;
  const previousDocument = g.document;
  const previousFetch = g.fetch;
  const previousDateNow = Date.now;

  const touch = (name: string): never => {
    throw new Error(
      `a pure gesture module touched \`${name}\` — motions/boundary/indent/word must have no DOM, ` +
        "no fetch and no clock",
    );
  };

  g.document = new Proxy(
    {},
    {
      get: () => touch("document"),
      set: () => touch("document"),
      has: () => touch("document"),
    },
  );
  g.fetch = () => touch("fetch");
  Date.now = () => touch("Date.now");

  return () => {
    g.document = previousDocument;
    g.fetch = previousFetch;
    Date.now = previousDateNow;
  };
}

/** Drives all four modules through a realistic key sequence and checks the real answers. */
function driveTheGestureLayer(): void {
  const mode = new ModeSurface();

  // j/k/gg/G — plain line motion, the count-prefix arithmetic every other gesture below reuses.
  requireMove(mode.handleKey("j", 0, LAST_INDEX), 1);
  requireMove(mode.handleKey("k", 1, LAST_INDEX), 0);
  requireMove(mode.handleKey("G", 0, LAST_INDEX), LAST_INDEX);

  // i — enters INSERT at a specific column, and ModeSurface really flips mode.
  const insert = mode.handleKey("i", 1, LAST_INDEX, 3);
  if (insert.effect.kind !== "enter-insert" || insert.effect.caret !== 3) {
    throw new Error(`"i" at column 3 did not enter INSERT there: ${JSON.stringify(insert)}`);
  }
  if (mode.mode !== "INSERT") {
    throw new Error('"i" did not flip ModeSurface into INSERT');
  }
  mode.enterNormal();

  // {/} — motions.ts reports direction+count; boundary.ts (real import of resolution.classifyLine)
  // decides which line. From line 1 the only heading is BEHIND the cursor, so `}` must fall
  // through to the file's own last line — vim's own behaviour for running out of boundaries.
  const boundary = mode.handleKey("}", 1, LAST_INDEX);
  if (boundary.effect.kind !== "boundary" || boundary.effect.direction !== "next") {
    throw new Error(`"}" did not report a boundary motion: ${JSON.stringify(boundary)}`);
  }
  const boundaryTarget = boundaryLine(LINES, 1, boundary.effect.direction, boundary.effect.count);
  if (boundaryTarget !== LAST_INDEX) {
    throw new Error(`"}" with no heading ahead landed on ${boundaryTarget}, not the file's last line`);
  }

  // </> — motions.ts reports direction+count; indent.ts decides the new text, four spaces a unit,
  // and a line already on a whole unit round-trips through indent-then-outdent exactly.
  const indent = mode.handleKey(">", 1, LAST_INDEX);
  if (indent.effect.kind !== "indent" || indent.effect.direction !== "in") {
    throw new Error(`">" did not report an indent motion: ${JSON.stringify(indent)}`);
  }
  const checkboxLine = LINES[1] ?? "";
  const indentedOnce = indentedLine(checkboxLine, indent.effect.direction, indent.effect.count);
  if (!indentedOnce.startsWith(" ".repeat(INDENT_UNIT)) || indentedOnce === checkboxLine) {
    throw new Error(`">" did not add one INDENT_UNIT of leading space: ${JSON.stringify(indentedOnce)}`);
  }
  const outdentedBack = indentedLine(indentedOnce, "out", 1);
  if (outdentedBack !== checkboxLine) {
    throw new Error('"> then <" did not round-trip a line that started on a whole indent unit');
  }
  // A heading is refused outright — indent.ts's own decision, not motions.ts's.
  const headingLine = LINES[0] ?? "";
  if (indentedLine(headingLine, "in", 1) !== headingLine) {
    throw new Error("indentedLine changed a heading line — headings must be refused, not indented");
  }

  // w/b/e — motions.ts reports the motion letter+count; word.ts (real import of
  // resolution.titleSpans) decides the caret column, measured from the title, past the checkbox
  // chrome and the qntm-id stamp that a naive column count would land inside.
  const word = mode.handleKey("w", 1, LAST_INDEX, 0);
  if (word.effect.kind !== "word" || word.effect.motion !== "w") {
    throw new Error(`"w" did not report a word motion: ${JSON.stringify(word)}`);
  }
  const wordColumn = wordCaret(checkboxLine, word.effect.motion, word.effect.count, 0);
  const titleWordStart = checkboxLine.indexOf("Pay");
  if (wordColumn === null || wordColumn !== titleWordStart) {
    throw new Error(
      `"w" from column 0 landed at ${JSON.stringify(wordColumn)}, not ${titleWordStart} (the start ` +
        'of "Pay") — it must skip the "- [ ] " checkbox chrome',
    );
  }
}

function requireMove(outcome: NormalKeyOutcome, expectedLine: number): void {
  if (outcome.effect.kind !== "move" || outcome.effect.lineIndex !== expectedLine) {
    throw new Error(`expected a move to line ${expectedLine}, got ${JSON.stringify(outcome)}`);
  }
}

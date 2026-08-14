/**
 * WHAT IS LEFT OF THIS FILE, AFTER `todayNoteFor`/`sayAsOf` WERE RETIRED
 * (chore/retire-the-status-line).
 *
 *   node --test tests/app-today-note.test.mjs
 *
 * This file used to prove `todayNoteFor` — the page's own glue between `resolution.dayBoundary`
 * and `app/present/today.ts`'s `todayFor` — landed the operator's logical day in the freshness
 * line (`sayAsOf`, `#freshness`). Both functions and that element are gone: `todayNoteFor` was
 * wired into the page for exactly one reason, per its own former header, and that reason no
 * longer exists. `todayFor` itself is untouched and still proven directly, exhaustively, against
 * the engine's own day-boundary resolver in tests/present-today.test.mjs — nothing about ITS
 * correctness depended on this file.
 *
 * THREE SECTIONS ARE GONE ENTIRELY, NOT WEAKENED:
 *
 *   1. THE FALSIFIER, AT THE CALL SITE — called `page.__todayNoteFor` directly; that export is
 *      gone because the function is gone.
 *   2. THE SCENARIO — called `page.__sayAsOf` and read `#freshness`; both gone.
 *   3. THE ABSTENTION IS VISIBLE — same shape, same two gone symbols.
 *
 * WHAT REMAINS is section 4's clock-discipline invariant, which was never really ABOUT the
 * freshness line — `todayNoteFor` was simply the SECOND legitimate call site for `Date.now()` in
 * this page, alongside `resolverContextFor`'s. With `todayNoteFor` gone there is exactly one
 * legitimate call site left, and that is still worth guarding against a future resolver reaching
 * for the wall clock directly (today.ts's own rule: read once, at the page, handed to a pure
 * function as a parameter). The `graphData`/`writeFile`/`applyEdit`/`.markdown` invariants below
 * are UNCHANGED from this file's own former shape and are pinned again here on purpose — they are
 * ALSO pinned in tests/app-membership-note.test.mjs §4 and tests/app-ordering-note.test.mjs §4, by
 * those files' own admission, so removing them from here loses no unique coverage; they are kept
 * anyway so a reviewer of this file alone still sees them.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RESOLVER_SOURCES, resolverSource } from "./fixtures/app-html-page.mjs";
import { assertOneWritePath } from "./fixtures/write-path-callers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("NOTHING LOCAL REACHES A WRITE, AND THE CLOCK IS READ IN EXACTLY ONE PLACE", () => {
  const APP_SOURCE = readFileSync(resolve(HERE, "..", "app", "index.html"), "utf8");
  const PAINT_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "paint.ts"), "utf8");
  const TODAY_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "today.ts"), "utf8");

  test("`graphData` is still assigned in exactly four places", () => {
    const sites = APP_SOURCE.match(/\bgraphData\s*=(?!=)/g) ?? [];
    assert.equal(sites.length, 4);
  });

  // ONE RULE, ONE EXPRESSION — see tests/fixtures/write-path-callers.mjs. This test used to
  // restate the counts inline, in one of six identical copies, and it asserted TWO callers
  // when the correct number was always ONE: a mouse tick and an `x` tick are one act.
  test("there is exactly ONE write path, and the call sites still prove it", () => {
    assertOneWritePath();
  });

  test("`applyEdit` is still reached from exactly five sites outside its own module", () => {
    // NARROWED 2026-08-10, NOT RELAXED — the claim is unchanged, the SPLIT moved. The page's two
    // `applyEdit` calls (`x` and `>`/`<`) went to `app/shell/keys.ts` when the global keydown
    // handler left `app/index.html` for a file the compiler and the tracer can both read. Still
    // exactly five sites outside `source.ts`; the page now holds none of them, which is a
    // STRONGER claim than the one this replaces, so the total is asserted as before AND each side
    // is named so a future drift says which one moved.
    const KEYS_SOURCE = readFileSync(resolve(HERE, "..", "app", "shell", "keys.ts"), "utf8");
    const pageCalls = APP_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    const keysCalls = KEYS_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    const paintCalls = PAINT_SOURCE.match(/\bapplyEdit\(/g) ?? [];
    assert.equal(pageCalls.length, 0, "the page must hold no edit constructor at all now");
    assert.equal(keysCalls.length, 2, "`x` and `>`/`<` are the two, and they live in keys.ts");
    assert.equal(pageCalls.length + keysCalls.length + paintCalls.length, 5);
  });

  test("`.markdown` is still never ASSIGNED in app/ — the page, the painter, AND every resolver", () => {
    const assignments = (source) => source.match(/\.markdown\s*=(?!=)/g) ?? [];
    assert.deepEqual(assignments(APP_SOURCE), []);
    assert.deepEqual(assignments(PAINT_SOURCE), []);
    for (const [name, source] of Object.entries(RESOLVER_SOURCES)) {
      assert.deepEqual(assignments(source), [], `${name} assigns .markdown`);
    }
  });

  // Comment lines are stripped before counting — this codebase's own prose names `Date.now()`
  // repeatedly (that is the whole point being documented), and a bare string search would mistake
  // a sentence about the rule for a violation of it.
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

  test("Date.now() is called from exactly one place in app/index.html's CODE — resolverContextFor", () => {
    // `sayAsOf` was the other legitimate call site; it is gone (chore/retire-the-status-line), and
    // this count moved from two to one along with it, in the safe direction.
    const appCode = codeOnly(APP_SOURCE);
    const contextFn = /function resolverContextFor[\s\S]*?\n\}\n/.exec(appCode)?.[0];
    assert.ok(contextFn, "resolverContextFor was not found — this test is checking the wrong source");
    assert.match(
      contextFn,
      /now: \(\) => Date\.now\(\)/,
      "resolverContextFor must supply the clock reader — the one legitimate call site left",
    );
    const allCalls = appCode.match(/Date\.now\(\)/g) ?? [];
    assert.equal(allCalls.length, 1, "Date.now() must be called from exactly one place in app/index.html's code");
  });

  test("NO RESOLVER READS THE CLOCK ITSELF — the rule today.ts keeps, kept by every module that moved", () => {
    for (const [name, source] of Object.entries(RESOLVER_SOURCES)) {
      assert.doesNotMatch(codeOnly(source), /Date\.now\(\)/, `${name} reads the clock itself`);
    }
    // AND THE INSTANT IS STILL HANDED TO A PURE FUNCTION. `rulesSpec.read` calls `ctx.now()` and
    // passes the result to `todayFor`, exactly as the page used to (through `sayAsOf`, now gone).
    assert.match(resolverSource("rules"), /todayFor\(ctx\.now\(\)/);
  });
});

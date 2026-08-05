/**
 * THE DAY BOUNDARY IS NOT OPTIONAL, AND THE CAPTURE SURVIVES A DECLARATION THAT OMITS IT.
 *
 *   node --test tests/app-day-boundary-required.test.mjs
 *
 * ── THE DEFECT THIS FILE CLOSES ──
 *
 * `resolution.dayBoundary` was typed `DayBoundary | undefined` while `todayFor` (today.ts) takes
 * `DayBoundary` and dereferences `boundary.timezone` on its first line. `resolvers/rules.ts`
 * bridged the two with a non-null assertion. A served `presentation.json` that PARSED but
 * published no day boundary — or a malformed one — therefore produced a resolution table that
 * passed every resolver's `resolution === undefined` gate and then threw a TypeError on the next
 * line: inside `commitLine`'s SYNCHRONOUS prefix, in an `async` function no keydown call site
 * awaits. The operator's capture would have disappeared with no POST, nothing on screen and no
 * error message — `f448da2`'s exact shape, the defect that silently discarded his `x` and `>`
 * gestures for five hours.
 *
 * IT DID NOT FIRE ONLY BECAUSE THE SHIPPED DOCUMENT HAPPENED TO CARRY A VALID BOUNDARY. One
 * config deploy was the whole distance between the codebase and a repeat.
 *
 * ── WHAT WAS DONE INSTEAD OF A GUARD ──
 *
 * NOT a local guard at the use site. `ConfigResolutionTable.dayBoundary` lost its `| undefined`,
 * and `readConfigResolutionDeclaration` now REFUSES TO PRODUCE A TABLE AT ALL without a valid
 * one. The state is unrepresentable rather than checked, so the next resolver to read the boundary
 * inherits the guarantee without being told it exists — which is the part a guard could not do.
 *
 * FOUR SECTIONS:
 *
 *   1. THE REFUSAL, THROUGH THE REAL PARSE/ADOPT PATH — the actually-shipped `presentation.json`
 *      with its boundary removed or broken, read by the same `presentationFromDeclaration` the
 *      page calls. No hand-built table anywhere in this file's adopt assertions.
 *   2. `todayFor` IS UNREACHABLE — the real rules resolver, over the real adopted context, does
 *      not throw and does not evaluate. The line that used to crash is never arrived at.
 *   3. THE APP STILL BOOTS AND STILL CAPTURES — `loadPresentation()` over a boundary-less document
 *      does not throw, and a real `commitLine` capture still POSTs, byte-identical. This is the
 *      half that matters more than section 2: the fix must not have turned a soft degradation
 *      into a hard failure.
 *   4. THE CLASS STAYS CLOSED — the type carries no `| undefined` and the resolver carries no
 *      `!`, asserted against the sources themselves so a future edit cannot quietly reopen it.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  importPage,
  installBrowser,
  makeWorkDir,
  withDeclaration,
  SERVED_DECLARATION,
  REPO,
} from "./fixtures/app-html-page.mjs";
import { presentationFromDeclaration } from "../dist/present.js";

const WORK = makeWorkDir("app-day-boundary-required");

/** The real served document, minus its day boundary. A deep-ish clone so nothing here mutates the
 * shared fixture every other suite reads. */
const withoutBoundary = () => {
  const doc = JSON.parse(JSON.stringify(SERVED_DECLARATION));
  delete doc.resolution.dayBoundary;
  return doc;
};

/** The real served document with a boundary that is present and WRONG — `dayStartHour` outside
 * 0..23, the malformed case distinct from the absent one. */
const withBrokenBoundary = () => {
  const doc = JSON.parse(JSON.stringify(SERVED_DECLARATION));
  doc.resolution.dayBoundary = { timezone: "Europe/London", dayStartHour: 99, weekStartsOn: "monday" };
  return doc;
};

describe("1. THE REFUSAL LIVES AT THE DECLARATION BOUNDARY, not at any use site", () => {
  test("PRECONDITION: the document that actually ships DOES declare a valid boundary", () => {
    // If this ever fails, the shipped app has no resolution table at all and sections 2-3 are
    // measuring the wrong thing. Stated as a precondition rather than assumed.
    const declared = presentationFromDeclaration(SERVED_DECLARATION);
    assert.notEqual(declared.resolution, undefined, "the shipped declaration must still adopt");
    assert.equal(typeof declared.resolution.dayBoundary.timezone, "string");
    assert.equal(typeof declared.resolution.dayBoundary.dayStartHour, "number");
    assert.equal(typeof declared.resolution.dayBoundary.weekStartsOn, "string");
  });

  test("the SAME document with dayBoundary removed adopts NO resolution table at all", () => {
    const declared = presentationFromDeclaration(withoutBoundary());
    assert.equal(
      declared.resolution,
      undefined,
      "a table without a day boundary must not be handed out — that is the whole fix",
    );
  });

  test("the absence is REPORTED, not silent — the operator can read why the previews stopped", () => {
    const declared = presentationFromDeclaration(withoutBoundary());
    assert.ok(
      declared.problems.some((p) => p.includes("dayBoundary")),
      `no problem named the missing boundary:\n${declared.problems.join("\n")}`,
    );
  });

  test("a MALFORMED boundary refuses the table too, and reports its own shape error", () => {
    const declared = presentationFromDeclaration(withBrokenBoundary());
    assert.equal(declared.resolution, undefined);
    assert.ok(
      declared.problems.some((p) => p.includes("dayStartHour")),
      `no problem named the bad hour:\n${declared.problems.join("\n")}`,
    );
  });

  test("THE COST, PINNED RATHER THAN HIDDEN: the other axes of that table go with it", () => {
    // This is a WIDER refusal than the boundary alone, and it is deliberate — ordering, chrome
    // shapes and section registration are all perfectly readable in this document and are still
    // not adopted. The trade is a lost PREVIEW against a lost CAPTURE; section 3 proves the
    // capture is the thing that survives. A future reader who thinks this line is a bug should
    // read `readConfigResolutionDeclaration`'s header before changing it.
    const doc = withoutBoundary();
    assert.ok(Object.keys(doc.resolution.ordering ?? {}).length > 0, "fixture precondition");
    assert.equal(presentationFromDeclaration(doc).resolution, undefined);
  });
});

describe("2. `todayFor` IS UNREACHABLE — the rules resolver abstains where it used to throw", () => {
  let page;

  before(async () => {
    installBrowser();
    globalThis.fetch = withDeclaration(
      async () => ({ ok: true, json: async () => ({ ok: true }) }),
      withoutBoundary(),
    );
    page = await importPage(WORK);
    await page.loadPresentation();
  });

  const VIEW = { id: "inbox", path: "inbox.md" };
  const BEFORE = "## Inbox\n## Domain Empty\n";
  const CAPTURE = {
    lineIndex: 2,
    text: "- [ ] Write the launch note",
    markdown: "## Inbox\n## Domain Empty\n- [ ] Write the launch note\n",
    source: BEFORE,
    kind: "insert-line",
  };

  test("the fresh capture the rules axis is scoped to does NOT throw", () => {
    // Under the old shape this exact call reached `todayFor(now, undefined)` and threw a
    // TypeError. The gate that stops it now is the `resolution === undefined` check the resolver
    // ALREADY opened with — no new guard was written.
    assert.doesNotThrow(() => page.__rulesReadingFor(VIEW, { ...CAPTURE }));
  });

  test("it reports NOT-EVALUATED — an honest 'this axis had nothing to read'", () => {
    const reading = page.__rulesReadingFor(VIEW, { ...CAPTURE });
    assert.equal(reading.kind, "not-evaluated");
  });

  test("and it says nothing on the freshness line rather than asserting a date it does not have", () => {
    const reading = page.__rulesReadingFor(VIEW, { ...CAPTURE });
    assert.equal(page.__rulesNoteFor(reading), "");
  });

  // "the page's OWN day-boundary reader abstains too, and warns" is GONE — `todayNoteFor` was the
  // page's own glue between `resolution.dayBoundary` and `todayFor`, wired in for exactly one
  // reason (`sayAsOf`'s freshness-line "today <date>" clause), and both were retired together
  // (chore/retire-the-status-line). `todayFor` itself never guessed and still does not — see
  // tests/present-today.test.mjs — and this describe's own first two tests above already prove the
  // ONE consumer that remains (the rules resolver) abstains rather than throws when the boundary is
  // missing, which is the load-bearing half of what this test used to also assert.
});

describe("3. THE APP STILL BOOTS AND THE CAPTURE STILL LEAVES — the soft degradation is intact", () => {
  let page;
  let posted;

  before(async () => {
    installBrowser();
    globalThis.fetch = withDeclaration(async (url, init) => {
      const body = JSON.parse(init.body);
      posted = { url, body };
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handle: "luke",
          pending_edits: 0,
          snapshot: { generated_at: "2026-08-01T12:00:00Z", views: [] },
        }),
      };
    }, withoutBoundary());
    page = await importPage(WORK);
  });

  const VIEW = { id: "inbox", path: "inbox.md" };
  const BEFORE = "## Inbox\n## Domain Empty\n";
  const AFTER = "## Inbox\n## Domain Empty\n- [ ] Write the launch note\n";
  const CAPTURE = {
    lineIndex: 2,
    text: "- [ ] Write the launch note",
    markdown: AFTER,
    source: BEFORE,
    kind: "insert-line",
  };

  test("loadPresentation() over a boundary-less document does NOT throw — no hard failure at boot", async () => {
    await assert.doesNotReject(() => page.loadPresentation());
  });

  test("THE HEADLINE: the capture still POSTs. It is not discarded, and it is not silent.", async () => {
    posted = null;
    await page.commitLine(VIEW, { ...CAPTURE });
    assert.notEqual(posted, null, "the capture VANISHED — this is the defect this file exists to stop");
    assert.equal(posted.body.markdown, AFTER, "the posted body must be byte-identical to what he typed");
  });

  // "the freshness line still narrates the write rather than going blank" is GONE — `#freshness`
  // itself was retired (chore/retire-the-status-line). "THE HEADLINE" test above already carries
  // the load-bearing half: the capture POSTs, byte-identical, whatever the declaration is missing.

  test("a SECOND capture also lands — the first refusal did not leave the page in a broken state", async () => {
    posted = null;
    const second = { ...CAPTURE, text: "- [ ] And another", markdown: AFTER + "- [ ] And another\n" };
    await page.commitLine(VIEW, second);
    assert.notEqual(posted, null);
    assert.equal(posted.body.markdown, second.markdown);
  });

  test("a document that is not an object at all is survivable too — the widest malformed case", async () => {
    installBrowser();
    globalThis.fetch = withDeclaration(async () => ({ ok: true, json: async () => ({ ok: true }) }), []);
    const other = await importPage(makeWorkDir("app-day-boundary-required-b"));
    await assert.doesNotReject(() => other.loadPresentation());
    assert.doesNotThrow(() => other.__rulesReadingFor(VIEW, { ...CAPTURE }));
  });
});

describe("4. THE CLASS IS CLOSED IN THE TYPE, not in a reviewer's memory", () => {
  const source = (rel) => readFileSync(join(REPO, rel), "utf8");

  test("`ConfigResolutionTable.dayBoundary` is declared WITHOUT `| undefined`", () => {
    const table = source("app/present/resolutiontable.ts");
    assert.ok(
      /readonly dayBoundary: DayBoundary;/.test(table),
      "the required declaration is gone — the optional field is back and the class is reopened",
    );
    assert.ok(
      !/readonly dayBoundary: DayBoundary \| undefined;/.test(table),
      "`dayBoundary` is optional again",
    );
  });

  test("`resolvers/rules.ts` carries NO non-null assertion — the `!` is gone, not relocated", () => {
    // CODE LINES ONLY. That file's comment block explains the assertion it used to carry and
    // quotes it verbatim, which a naive search over the whole text would match — the search would
    // then be pinned to the prose rather than to the behaviour, and would go green the day someone
    // reworded the comment and red the day someone explained the fix better.
    const code = source("app/present/resolvers/rules.ts")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
    const offenders = code.filter((line) => /dayBoundary!/.test(line));
    assert.deepEqual(offenders, [], "the non-null assertion on the boundary is back");
    // And the real read is present and unasserted, so this test cannot pass by the line vanishing.
    assert.ok(
      code.some((line) => line.includes("todayFor(ctx.now(), resolution.dayBoundary)")),
      "the boundary read is gone entirely — this guard is no longer measuring anything",
    );
  });

  test("NO module under app/ asserts non-null on anything — the sweep, not just this one line", () => {
    // The compiler proves no OTHER optional field is dereferenced unguarded (strict +
    // strictNullChecks + noUncheckedIndexedAccess, `npm run typecheck`). A non-null assertion is
    // the one way to opt OUT of that proof, so counting them is the complete search: zero
    // assertions means zero places where the compiler was told something the code cannot
    // guarantee. If a future change needs one, it must justify it here.
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(join(REPO, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (entry.name.endsWith(".ts")) files.push(rel);
      }
    };
    walk("app/present");
    assert.ok(files.length > 20, `the sweep is vacuous — only ${files.length} files found`);
    const offenders = [];
    for (const rel of files) {
      for (const [i, line] of source(rel).split("\n").entries()) {
        // `x!.y`, `x!)`, `x![` — a non-null assertion followed by a use. `!==`/`!=` excluded.
        const stripped = line.replace(/!==?/g, "");
        if (/[A-Za-z0-9_\])]![.[)]/.test(stripped)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    }
    assert.deepEqual(offenders, [], `non-null assertions found:\n${offenders.join("\n")}`);
  });
});

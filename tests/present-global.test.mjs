/**
 * THE STAGE 2 FALSIFIER — the served declaration REACHES the painted DOM.
 *
 *   node --test tests/present-global.test.mjs
 *
 * Migration stage 2 is one declaration and one hour, and it exists as its own stage for one
 * reason: "a declaration that exists and does not reach" is this system's highest-frequency bug.
 * The design states the falsifier rather than leaving it to taste — FLIP ONE KEY TO `raw` AND THE
 * PAINTED DOM MUST CHANGE. If it does not, the declaration is inert and the stage has failed.
 *
 * IT IS ASSERTED TWICE, AT TWO DIFFERENT DISTANCES, AND BOTH ARE NEEDED:
 *
 *   1. THROUGH THE MODULES. `presentationFromDeclaration` -> `paint`, against dist/present.js.
 *      Cheap, precise, and it names which level won.
 *   2. THROUGH app/index.html'S OWN SCRIPT. The page is lifted out of the HTML and run, and the
 *      DOM it paints is asserted. This is the half that would catch the real failure of this
 *      stage: a reader that works perfectly and a page that never calls it. A green on (1) alone
 *      is exactly the shape of the bug being disproved.
 *
 * AND THE SHIPPED FILE IS ASSERTED TO CHANGE NOTHING. presentation.json is read off disk and
 * compared, paint for paint, against a context with no declaration at all. Stage 2's promise is
 * that the default value is today's behaviour, so nothing moves until someone flips it.
 *
 * SECTION 4 NO LONGER STUBS `fetch`. `loadPresentation()` reads a bundled constant now
 * (app/present/embedded-declaration.ts, §2.5 of the research doc) — there is nothing left on the
 * wire to intercept. A suite that wants to drive a document OTHER than the one actually shipping
 * calls `__applyPresentation`, the exact function `loadPresentation` itself calls. What section 4
 * used to prove by stubbing a 404 (a fetch that cannot be read leaves the page exactly where it
 * was) is no longer a reachable failure mode — a malformed presentation.json fails the BUILD, not
 * the page — so that test is replaced by a stronger one: `EMBEDDED_DECLARATION`, the constant
 * baked into dist/present.js, is asserted identical to `presentation.json` read fresh off disk.
 * That is the drift guard for the trap this change was warned about: the page's copy and the
 * generated file cannot read differently without this failing, in `npm test`, with no build step
 * or CI diff required to see it.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import MarkdownIt from "markdown-it";

import { makeDocument, makeBody, walk, serialize, VIEW_MARKDOWN } from "./fixtures/dom-stub.mjs";
import {
  REPO,
  importPage,
  installBrowser,
  makeEvent,
  makeWorkDir,
  walk as walkPage,
} from "./fixtures/app-html-page.mjs";
import {
  paint,
  readDeclaration,
  presentationFromDeclaration,
  DEFAULT,
  PresentationCascade,
  PresentationContext,
  RESOLUTION_KEYS,
  EMBEDDED_DECLARATION,
} from "../dist/present.js";

const md = new MarkdownIt("commonmark").enable("table");

function painted(markdown, context) {
  globalThis.document = makeDocument();
  const body = makeBody();
  paint(body, markdown, context, { markdown: md, onCheckboxToggle: () => {} });
  return body;
}

const SERVED = JSON.parse(readFileSync(join(REPO, "presentation.json"), "utf8"));

describe("0. the embedded copy cannot drift from the served file", () => {
  test("EMBEDDED_DECLARATION (baked into dist/present.js) is presentation.json, read fresh", () => {
    // THE DRIFT GUARD. app/present/embedded-declaration.ts IMPORTS presentation.json rather than
    // copying it, and dist/present.js is a committed artifact CI already refuses to ship stale
    // (.github/workflows/build.yml) — so this can only fail if dist/present.js was committed
    // without running `npm run build` after presentation.json changed. That is exactly the
    // failure this test exists to catch directly, in `npm test`, rather than only in CI's
    // build-then-diff step.
    assert.deepEqual(
      EMBEDDED_DECLARATION,
      SERVED,
      "dist/present.js's embedded declaration has drifted from presentation.json — run " +
        "'npm run build' and commit the result",
    );
  });
});

describe("1. the committed declaration moves exactly one key and no other", () => {
  test("presentation.json is readable and declares no problems", () => {
    const { problems } = readDeclaration(SERVED);
    assert.deepEqual(problems, [], "the shipped declaration does not read cleanly");
  });

  test("it declares a real rendition for every key it mentions", () => {
    const { contribution } = readDeclaration(SERVED);
    assert.ok(Object.keys(contribution).length > 0, "the shipped declaration reaches no key");
    for (const [key, rendition] of Object.entries(contribution)) {
      assert.ok(RESOLUTION_KEYS.includes(key), `${key} is not a resolution key`);
      assert.ok(["raw", "wired"].includes(rendition), `${key} is ${rendition}`);
    }
  });

  test("with `tags` taken back to the default, the served file paints today's DOM exactly", () => {
    // ── THIS ASSERTION CHANGED AT STAGE 8, AND THE CHANGE IS THE POINT OF THAT STAGE ──
    //
    // It used to read "the painted DOM under it is identical to the painted DOM with no
    // declaration at all", because stage 2's promise was that a served file whose values were all
    // the built-in defaults could not move anything. That promise was about a file that DECLARED
    // NOTHING NEW. presentation.json now declares `tags: wired` against a built-in default of
    // `raw`, so it MUST move the output — a served declaration that changed nothing would be the
    // stage-8 failure, not the stage-2 guarantee.
    //
    // What is worth keeping is the guarantee UNDERNEATH it: the served file moves ONE key, and
    // every other decision the app makes is still the decision it made before any of this existed.
    // So it is asserted as a difference of exactly one key rather than abandoned: take `tags` back
    // to its default and the two paints must be byte for byte the same tree.
    const declared = presentationFromDeclaration({ ...SERVED, tags: DEFAULT.tags }).context;
    assert.equal(
      serialize(painted(VIEW_MARKDOWN, declared)),
      serialize(painted(VIEW_MARKDOWN, new PresentationContext())),
      "the shipped declaration moves something OTHER than `tags` — every key but that one is " +
        "supposed to be today's behaviour restated as a declaration",
    );
  });

  test("and as shipped it does move the DOM, because `tags` is doing something", () => {
    // The other half, and the one that would catch an inert declaration: a key declared against
    // its non-default value has to show up on the page.
    assert.notEqual(
      serialize(painted(VIEW_MARKDOWN, presentationFromDeclaration(SERVED).context)),
      serialize(painted(VIEW_MARKDOWN, new PresentationContext())),
      "the shipped declaration paints the same DOM as no declaration at all — `tags: wired` is " +
        "inert, which is the single failure the GLOBAL level exists to detect",
    );
  });
});

describe("2. flipping one key changes the painted DOM", () => {
  test("checkbox: raw removes the checkbox and leaves the source characters", () => {
    const wired = serialize(painted(VIEW_MARKDOWN, presentationFromDeclaration(SERVED).context));
    const raw = painted(VIEW_MARKDOWN, presentationFromDeclaration({ ...SERVED, checkbox: "raw" }).context);
    const text = serialize(raw);

    assert.notEqual(text, wired, "flipping checkbox to raw changed nothing — the declaration is inert");
    assert.ok(!text.includes('type="checkbox"'), "a raw declaration still produced a checkbox");
    assert.ok(
      walk(raw).some(
        (el) => el.textContent === "- [ ] Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29",
      ),
      "raw did not carry the source characters verbatim",
    );
    // The OTHER key is untouched: a declaration is per key, not a mode.
    assert.ok(text.includes("tag=h3"), "flipping checkbox also changed the heading");
  });

  test("heading: raw demotes nothing and leaves the hashes", () => {
    const raw = painted(VIEW_MARKDOWN, presentationFromDeclaration({ ...SERVED, heading: "raw" }).context);
    const text = serialize(raw);
    assert.ok(!text.includes("tag=h3"), "a raw declaration still produced a heading element");
    assert.ok(
      walk(raw).some((el) => el.textContent === "## Overdue"),
      "raw did not carry the heading source",
    );
    assert.ok(text.includes('type="checkbox"'), "flipping heading also changed the checkbox");
  });

  test("the level that won is GLOBAL, and it says so", () => {
    // Provenance is what makes this debuggable by the person using the app rather than only by
    // its author. Asserting it here pins that the answer came from the DECLARATION and not from
    // the built-in default, which happens to agree.
    const { context } = presentationFromDeclaration({ checkbox: "raw" });
    assert.deepEqual(new PresentationCascade(context).resolve("checkbox"), {
      rendition: "raw",
      level: "GLOBAL",
    });
  });
});

describe("3. a declaration that cannot be read is reported, never guessed", () => {
  test("an unknown key is a problem, not a silent no-op", () => {
    // The bug this stage exists to disprove, in miniature: a key that loads clean and reaches
    // nothing. A reader that ignored this would BE the bug.
    const { contribution, problems } = readDeclaration({ checkbox: "raw", chekbox: "wired" });
    assert.deepEqual(contribution, { checkbox: "raw" });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /'chekbox' is not a resolution key/);
  });

  test("a value that is not a rendition leaves the key silent and says so", () => {
    const { contribution, problems } = readDeclaration({ checkbox: "chip", heading: "wired" });
    assert.deepEqual(contribution, { heading: "wired" });
    assert.match(problems[0], /not a rendition/);
    // Silent, therefore falls through to the default — not "wired by luck".
    const context = presentationFromDeclaration({ checkbox: "chip" }).context;
    assert.deepEqual(new PresentationCascade(context).resolve("checkbox"), {
      rendition: "wired",
      level: "GLOBAL",
    });
  });

  test("a document that is not an object is refused whole", () => {
    for (const document of [null, 7, "wired", ["checkbox"], undefined]) {
      const { contribution, problems } = readDeclaration(document);
      assert.deepEqual(contribution, {});
      assert.equal(problems.length, 1, `${JSON.stringify(document)} produced ${problems.length}`);
    }
  });

  test("`note` is prose and is not mistaken for a key", () => {
    const { contribution, problems } = readDeclaration({ note: "why", checkbox: "raw" });
    assert.deepEqual(contribution, { checkbox: "raw" });
    assert.deepEqual(problems, []);
    assert.match(readDeclaration({ note: 7 }).problems[0], /'note' is number/);
  });
});

describe("4. the page itself reads it — the half that catches an unwired reader", () => {
  const WORK = makeWorkDir("present-global");
  const VIEW = {
    id: "this-week",
    path: "work/outcomes.md",
    title: "This Week",
    domain: "work",
    markdown: ["## Overdue", "- [ ] Draft [[qntm:121]] #task", "prose"].join("\n"),
  };

  let page;
  let elements;

  before(async () => {
    ({ elements } = installBrowser());
    page = await importPage(WORK);
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
  });

  /**
   * Drive a declaration through the page's own reader and paint through its own painter.
   *
   * `__applyPresentation` is the exact function `loadPresentation()` itself calls — see
   * app/index.html: `loadPresentation` is now `applyPresentation(EMBEDDED_DECLARATION)`, and this
   * calls `applyPresentation` against whatever document the test wants instead. Nothing on a wire
   * to stub any more: the reader's own logic is what is under test either way.
   *
   * THE CURSOR IS PARKED ON THE LAST LINE FIRST, and that is part of the setup rather than a
   * workaround. The cursor's own line renders its SOURCE in NORMAL as well as INSERT
   * (app/present/paint.ts), so a cursor left on the heading would hide the very `<h3>` these tests
   * are asking the served declaration about. `prose` — line 2 — is the line none of them assert on.
   */
  function pagePaints(declaration) {
    page.__applyPresentation(declaration);
    page.__setFocus(2, VIEW.markdown);
    page.paintView("this-week");
    return walkPage(elements.get("viewBody"));
  }

  test("the served declaration reaches the page's painted DOM", () => {
    const wired = pagePaints({ checkbox: "wired", heading: "wired" });
    assert.equal(wired.filter((el) => el.type === "checkbox").length, 1);
    assert.ok(wired.some((el) => el.tagName === "h3"));

    const raw = pagePaints({ checkbox: "raw", heading: "raw" });
    assert.equal(
      raw.filter((el) => el.type === "checkbox").length,
      0,
      "the page painted a checkbox against a declaration that said raw — THE READER IS NOT " +
        "WIRED, which is the single failure migration stage 2 exists to detect",
    );
    assert.ok(!raw.some((el) => el.tagName === "h3"), "the page painted a heading against raw");
    // THE CHARACTERS, VERBATIM — held in an <input> rather than in a <div> because the page
    // supplies a focus surface as of migration stage 3, and raw with somewhere for a cursor to
    // go is an editable line. Without a focus surface (every module-level test above) raw is
    // still inert text. Both are the same rendition; only the embodiment differs.
    assert.ok(raw.some((el) => el.value === "- [ ] Draft [[qntm:121]] #task"));
  });

  test("flipping `tags` in the served file turns chips into characters, in the page", () => {
    // ── THE STAGE-8 HEADLINE, ASSERTED WHERE IT COUNTS ──
    //
    // Not "the module can make a chip" — THE SERVED FILE DECIDES WHETHER THERE IS ONE. The page
    // reads presentation.json (baked into the bundle — §2.5), hands it to the reader, and paints;
    // nothing in this test touches a context, a cascade or a painter directly. Flip the one key in
    // the document and the DOM changes, with nothing rebuilt. That is the difference between this
    // being architecture and being a stylesheet.
    const wired = pagePaints({ checkbox: "wired", tags: "wired" });
    const chipped = wired.filter((el) => String(el.innerHTML).includes('class="tagchip"'));
    assert.equal(chipped.length, 1, "the page painted no tag chip against a declaration of wired");
    assert.match(chipped[0].innerHTML, /<span class="tagchip">#task<\/span>/);

    const raw = pagePaints({ checkbox: "wired", tags: "raw" });
    assert.equal(
      raw.filter((el) => String(el.innerHTML).includes("tagchip")).length,
      0,
      "the page painted a chip against a declaration that said raw — the `tags` key is NOT " +
        "wired, and the chip is a stylesheet rather than a resolution",
    );
    assert.ok(
      raw.some((el) => String(el.innerHTML).includes("#task")),
      "raw did not leave the tag as its own characters",
    );
  });

  test("a tag chip is not a cursor target, and the line under it still is", () => {
    // The chip offers NOTHING, so the gesture that reaches a line's source has to be unchanged by
    // its presence. This is the assertion that would catch a chip that quietly swallowed the click
    // the focus surface depends on.
    pagePaints({ checkbox: "wired", tags: "wired" });
    const body = elements.get("viewBody");
    walkPage(body).find((el) => el.tagName === "span").dispatch("click", makeEvent());
    const editable = walkPage(body).filter((el) => el.type === "text");
    assert.equal(editable.length, 1, "clicking a chipped line did not reach its source");
    assert.equal(editable[0].value, VIEW.markdown.split("\n")[1]);
    assert.ok(editable[0].value.includes("#task"), "the source the cursor reached lost its tag");

    // Put the cursor back where it was. The page holds ONE focus surface for its whole lifetime
    // (app/index.html, `const focus = new FocusSurface()`), so a test that leaves a line focused
    // leaves it focused for every test after it — which is a real property of the page and worth
    // being reminded of by having to write this line.
    //
    // AND A BLUR IS NO LONGER ENOUGH TO DO IT. `settle` returns a vim-wired page to NORMAL rather
    // than blurring (paint.ts's `leaveInsert`: vim always has a cursor on some line), and in NORMAL
    // the cursor's line shows its SOURCE — so the chipped line would still not be a chipped line
    // for whatever ran next. Parking is the restore now.
    editable[0].dispatch("blur");
    assert.equal(walkPage(body).filter((el) => el.type === "text").length, 0);
    page.__setFocus(2, VIEW.markdown);
  });

  test("loadPresentation() — no argument, the real path — reads what actually ships", () => {
    // THE UNSTUBBED CALL. Every test above drives `__applyPresentation` against a document it
    // supplies, which proves the reader is wired but never calls the function the page actually
    // calls at boot. This one does: `page.loadPresentation()` with nothing swapped in, against the
    // real embedded presentation.json (checkbox/heading/prose/tags all "wired" — see that file).
    page.loadPresentation();
    page.__setFocus(2, VIEW.markdown);
    page.paintView("this-week");
    const body = walkPage(elements.get("viewBody"));
    assert.equal(body.filter((el) => el.type === "checkbox").length, 1, "the real declaration did not reach the page");
    assert.ok(body.some((el) => el.tagName === "h3"), "the real declaration's heading did not reach the page");
  });

  test("the page reports a problem in the served document rather than swallowing it", () => {
    const said = [];
    const warn = console.warn;
    console.warn = (message) => said.push(message);
    try {
      pagePaints({ chekbox: "raw" });
    } finally {
      console.warn = warn;
    }
    assert.match(said.join(" "), /'chekbox' is not a resolution key/);
  });
});

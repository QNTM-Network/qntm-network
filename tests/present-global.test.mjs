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
 * ── THE DECLARATION IS FETCHED AGAIN, AND TWO SECTIONS RECORD THE REVERSAL ──
 *
 * This header used to say "SECTION 4 NO LONGER STUBS `fetch` — `loadPresentation()` reads a bundled
 * constant now, there is nothing left on the wire to intercept". That decision is reversed
 * (docs/implementation-artifacts/design-config-is-content.md step 2): baking `presentation.json`
 * into dist/present.js welded a 138 KB CONFIG document to a committed APP artifact CI refuses to
 * ship stale, so a config change could not reach a browser without an app rebuild.
 *
 *   SECTION 0 IS AMENDED IN PLACE, NOT DELETED. It asserted that the baked copy could not drift
 *   from the served file. There is no baked copy to drift, so it now asserts THAT — the bundle
 *   contains no copy of the declaration, proven against the operator's own instance strings, and
 *   dist/present.js exports no `EMBEDDED_DECLARATION`. The old assertion's job (the page's copy and
 *   the generated file cannot read differently) is discharged by there being one document.
 *
 *   SECTION 5 IS NEW, and it is the falsifier the step is worth having: the page runs on a
 *   declaration that WAS NEVER IN THE BUNDLE, fetched off a stubbed wire, with a mutation proof —
 *   and it survives a declaration that never arrives.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import MarkdownIt from "markdown-it";

import { makeDocument, makeBody, walk, serialize, VIEW_MARKDOWN } from "./fixtures/dom-stub.mjs";
import {
  REPO,
  DECLARATION_URL,
  assertMutated,
  importPage,
  installBrowser,
  makeEvent,
  makeWorkDir,
  walk as walkPage,
  withDeclaration,
} from "./fixtures/app-html-page.mjs";
import {
  paint,
  readDeclaration,
  presentationFromDeclaration,
  DEFAULT,
  PresentationCascade,
  PresentationContext,
  RESOLUTION_KEYS,
} from "../dist/present.js";

const md = new MarkdownIt("commonmark").enable("table");

function painted(markdown, context) {
  globalThis.document = makeDocument();
  const body = makeBody();
  paint(body, markdown, context, { markdown: md, onCheckboxToggle: () => {} });
  return body;
}

const SERVED = JSON.parse(readFileSync(join(REPO, "presentation.json"), "utf8"));

describe("0. the bundle carries no copy of the declaration", () => {
  // ── AMENDED IN PLACE, BECAUSE THE DECISION IT ENCODED IS REVERSED ────────────────────────────
  //
  // This section was "the embedded copy cannot drift from the served file", and its one test
  // asserted `EMBEDDED_DECLARATION` (the constant baked into dist/present.js by
  // app/present/embedded-declaration.ts) deep-equalled `presentation.json` read off disk. It was a
  // correct guard for a decision this branch undoes: the import made a CONFIG change also a change
  // to a committed APP artifact, and CI's "fail if a committed bundle is stale" step then demanded
  // a rebuild before a config change could ship. See design-config-is-content.md step 2.
  //
  // It is kept, pointed the other way, because "no copy" is the property that now has to hold and
  // nothing else asserts it. Deleting the section would leave the un-baking unguarded: someone
  // could re-add the import tomorrow, every other test in this repo would stay green, and the
  // rebuild lock would be back with nothing saying so.

  const BUNDLE = readFileSync(join(REPO, "dist", "present.js"), "utf8");

  test("dist/present.js exports no EMBEDDED_DECLARATION", async () => {
    const bundle = await import("../dist/present.js");
    assert.ok(
      !("EMBEDDED_DECLARATION" in bundle),
      "dist/present.js exports EMBEDDED_DECLARATION again — the declaration is baked back into " +
        "the bundle, and a config change needs a rebuild once more",
    );
  });

  test("none of the operator's own config strings appear in the bundle", () => {
    // THE PROBES ARE INSTANCE DATA, NOT SCHEMA, and that is what makes their absence mean
    // something. Every one of these is a section id out of the operator's own 72 views, drawn from
    // the served declaration itself rather than typed here — they cannot appear in a bundle built
    // from app/present/*.ts unless the declaration is inside it. All six were present in
    // dist/present.js before this change and none is present after.
    const ids = [...new Set(Object.values(SERVED.qualification.sectionOrder).flat())]
      .filter((id) => id.length >= 14)
      .sort();
    assert.ok(ids.length >= 6, "too few instance-specific probes to prove anything");
    const found = ids.filter((id) => BUNDLE.includes(id));
    assert.deepEqual(
      found,
      [],
      "the bundle contains the operator's own config strings — the declaration is baked in",
    );
  });

  test("the bundle is smaller than the declaration it used to carry", () => {
    // THE COARSE PROOF, AND THE ONE A READER CAN CHECK WITH `ls`. A file cannot contain a copy of a
    // document larger than itself. dist/present.js was 264,251 bytes with the declaration inside it
    // and is 128,488 without; presentation.json is 138,878. The relation is not a size budget — it
    // is the arithmetic of the thing being absent.
    const declaration = readFileSync(join(REPO, "presentation.json"), "utf8");
    assert.ok(
      BUNDLE.length < declaration.length,
      `dist/present.js (${BUNDLE.length} bytes) is no longer smaller than presentation.json ` +
        `(${declaration.length} bytes) — check whether the declaration went back into the bundle`,
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

  test("with the TOKEN keys taken back to their defaults, the served file paints today's DOM exactly", () => {
    // ── AND IT MOVED AGAIN WHEN `stamp` SHIPPED, FOR EXACTLY THE SAME REASON ──
    //
    // presentation.json now declares TWO keys against a non-default value: `tags: wired` and
    // `stamp: wired`. Both are TOKEN keys — they change a run of characters inside a line rather
    // than the element the line IS — and both are the instance's decision rather than the floor.
    // So the assertion is not "one key" any more; it is "the token keys and nothing else", which
    // is the guarantee that was always underneath it. Every LINE key (checkbox, heading, prose)
    // must still be today's behaviour restated as a declaration, and this is what proves it.
    //
    // It is expressed as a LIST rather than as a spread of DEFAULT so that a future key silently
    // joining the served file cannot be absorbed: a key that is neither in this list nor at its
    // default will move the DOM and fail here, which is what makes the list a decision.
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
    const TOKEN_KEYS = ["tags", "stamp"];
    const floored = { ...SERVED };
    for (const key of TOKEN_KEYS) {
      floored[key] = DEFAULT[key];
    }
    const declared = presentationFromDeclaration(floored).context;
    assert.equal(
      serialize(painted(VIEW_MARKDOWN, declared)),
      serialize(painted(VIEW_MARKDOWN, new PresentationContext())),
      `the shipped declaration moves something OTHER than ${TOKEN_KEYS.join(" and ")} — every ` +
        "other key is supposed to be today's behaviour restated as a declaration",
    );
  });

  test("and each token key moves the DOM ON ITS OWN, so neither is inert", () => {
    // THE OTHER HALF, AND NOW IT IS PER KEY. Asserting only that the whole declaration moves the
    // DOM would go green with `stamp: wired` doing nothing at all, because `tags: wired` already
    // moves it — one live key would mask a dead one, which is the exact bug the GLOBAL level
    // exists to detect. So each is flipped ALONE against the served file and must move it alone.
    const silent = serialize(painted(VIEW_MARKDOWN, new PresentationContext()));
    for (const key of ["tags", "stamp"]) {
      const only = { ...SERVED };
      for (const other of RESOLUTION_KEYS) {
        if (other !== key) {
          only[other] = DEFAULT[other];
        }
      }
      assert.notEqual(
        serialize(painted(VIEW_MARKDOWN, presentationFromDeclaration(only).context)),
        silent,
        `'${key}: ${SERVED[key]}' paints the same DOM as no declaration at all — it is inert`,
      );
    }
  });

  test("and as shipped it does move the DOM, because the token keys are doing something", () => {
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
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    walkPage(body).find((el) => el.tagName === "span").dispatch("click", makeEvent());
    page.__enterInsert();
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

  test("loadPresentation() — the real path — reads what actually ships", async () => {
    // THE REAL CALL. Every test above drives `__applyPresentation` against a document it supplies,
    // which proves the reader is wired but never calls the function the page actually calls at
    // boot. This one does — and it is AWAITED and STUBBED now, because that function fetches
    // `/presentation.json` instead of reading a constant out of the bundle. What is served is
    // `presentation.json` off disk: the real file, at the real URL, through the real loader.
    const saved = globalThis.fetch;
    globalThis.fetch = withDeclaration(async () => {
      throw new Error("nothing but the declaration is requested here");
    });
    try {
      await page.loadPresentation();
    } finally {
      globalThis.fetch = saved;
    }
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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE STEP-2 FALSIFIER — the app answers from a document that was never in the bundle
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Section 4 proves the page's READER is wired, by handing it a document directly. This section
// proves the page's WIRE is wired: the bytes arrive over `fetch`, from a URL, and they decide the
// paint. That is the difference between "the declaration can be swapped" and "a config change can
// reach a browser with nothing rebuilt", which is the whole of design-config-is-content.md step 2.
//
// "NEVER IN THE BUNDLE" IS ASSERTED LITERALLY, NOT ARGUED. The served document carries a marker
// string, and the test first proves that string appears in NEITHER dist/present.js NOR
// presentation.json. When the page then quotes the marker back, the only place it can have come
// from is the wire.

describe("5. the page runs on a declaration that was never in the bundle", () => {
  const WORK = makeWorkDir("present-global-fetched");
  const VIEW = {
    id: "this-week",
    path: "work/outcomes.md",
    title: "This Week",
    markdown: ["## Overdue", "- [ ] Draft [[qntm:121]] #task", "prose"].join("\n"),
  };

  // THE MARKER. An unrecognised key, so `applyPresentation` reports it by name — the page's own
  // existing behaviour (section 4's last test), used here as an echo of the bytes it read.
  const MARKER = "never-in-the-bundle-1f4c9a";

  /** A declaration that does not exist anywhere on disk, carrying the marker. */
  const fetched = (extra) => ({ ...extra, [MARKER]: "raw" });

  let page;
  let elements;

  before(async () => {
    ({ elements } = installBrowser());
    page = await importPage(WORK);
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
  });

  /** Serve `declaration` at the page's own declaration URL, run the page's own loader. */
  async function served(declaration, target = page) {
    const saved = globalThis.fetch;
    const asked = [];
    globalThis.fetch = async (url, init) => {
      asked.push(String(url));
      if (String(url) !== DECLARATION_URL) throw new Error("unexpected request: " + url);
      return { ok: true, status: 200, json: async () => declaration };
    };
    try {
      await target.loadPresentation();
    } finally {
      globalThis.fetch = saved;
    }
    return asked;
  }

  /** Paint the view with the cursor parked on line 2 — section 4's own convention, same reason. */
  function paintedNow(target = page) {
    target.__setFocus(2, VIEW.markdown);
    target.paintView("this-week");
    return walkPage(elements.get("viewBody"));
  }

  test("the marker is in neither shipped artifact — so an echo of it can only be the wire", () => {
    assert.ok(!readFileSync(join(REPO, "dist", "present.js"), "utf8").includes(MARKER));
    assert.ok(!readFileSync(join(REPO, "presentation.json"), "utf8").includes(MARKER));
  });

  test("the page requests the declaration, at the page's own URL", async () => {
    const asked = await served(fetched({ checkbox: "wired", heading: "wired", tags: "wired" }));
    assert.deepEqual(asked, [DECLARATION_URL], "the page did not fetch the declaration");
  });

  test("the fetched document decides the painted DOM — chips and headings both ways", async () => {
    await served(fetched({ checkbox: "wired", heading: "wired", tags: "wired" }));
    const wired = paintedNow();
    assert.equal(wired.filter((el) => el.type === "checkbox").length, 1);
    assert.ok(wired.some((el) => el.tagName === "h3"));
    assert.equal(wired.filter((el) => String(el.innerHTML).includes("tagchip")).length, 1);

    await served(fetched({ checkbox: "raw", heading: "raw", tags: "raw" }));
    const raw = paintedNow();
    assert.equal(
      raw.filter((el) => el.type === "checkbox").length,
      0,
      "the page painted a checkbox against a FETCHED declaration that said raw — the wire is not " +
        "wired, which is the single failure step 2 exists to detect",
    );
    assert.ok(!raw.some((el) => el.tagName === "h3"));
    assert.ok(raw.some((el) => el.value === "- [ ] Draft [[qntm:121]] #task"));
  });

  test("the page quotes the marker back — the bytes came from the wire, nowhere else", async () => {
    const said = [];
    const warn = console.warn;
    console.warn = (message) => said.push(message);
    try {
      await served(fetched({ checkbox: "wired" }));
    } finally {
      console.warn = warn;
    }
    assert.match(said.join(" "), new RegExp(`'${MARKER}' is not a resolution key`));
  });

  // ── WHAT HAPPENS WHEN IT DOES NOT ARRIVE ─────────────────────────────────────────────────────
  //
  // The un-baking reopens a failure the inline had closed, and the design named the price: "a slow,
  // missing or broken presentation.json costs nothing but a warning". These three are that promise,
  // asserted. NO BAKED COPY IS KEPT AS A FALLBACK — the fallback is the built-in DEFAULT, because a
  // baked copy would put presentation.json back in the bundle's input graph and CI's staleness gate
  // would demand a rebuild for a config change all over again.

  test("a declaration that never arrives does not stop the page — the founding rule survives", async () => {
    // A COLD PAGE, NOT THIS SUITE'S. A failed fetch leaves whatever was applied before it, so
    // asserting on a page four tests have already fed a declaration would prove nothing about a
    // BOOT whose declaration never arrived. A second module instance has never had one.
    const cold = await importPage(makeWorkDir("present-global-cold"));
    cold.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
    const saved = globalThis.fetch;
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    const said = [];
    const warn = console.warn;
    console.warn = (message) => said.push(message);
    try {
      await cold.loadPresentation();
    } finally {
      globalThis.fetch = saved;
      console.warn = warn;
    }
    assert.match(said.join(" "), /could not be read/);

    // THE FOUNDING RULE, WITH NO DECLARATION AT ALL: cursor on a line, that line shows its raw
    // source. It survives because it is the painter's rule and not the declaration's — which is
    // exactly why "the fetch failed" is allowed to be a warning rather than a broken page.
    cold.__setFocus(1, VIEW.markdown);
    cold.paintView("this-week");
    const body = walkPage(elements.get("viewBody"));
    const cursorLine = body.find((el) => String(el.className).includes("rawline"));
    assert.ok(cursorLine, "no line was showing its source — the founding rule did not survive");
    const characters = walkPage(cursorLine).map((el) => el.textContent).join("");
    assert.equal(characters, "- [ ] Draft [[qntm:121]] #task");
    // AND THE REST OF THE VIEW IS STILL RENDERED — the built-in defaults are today's behaviour,
    // so a missing declaration costs the two keys the instance moved, not the page.
    assert.ok(body.some((el) => el.tagName === "h3"), "nothing rendered — the page fell over");
  });

  test("a 404 is the same case, and is not mistaken for a document", async () => {
    const saved = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 404,
      json: async () => { throw new Error("not JSON"); },
    });
    const said = [];
    const warn = console.warn;
    console.warn = (message) => said.push(message);
    try {
      await page.loadPresentation();
    } finally {
      globalThis.fetch = saved;
      console.warn = warn;
    }
    assert.match(said.join(" "), /could not be read \(request failed \(404\)/);
  });

  test("a fetch that never answers is ABANDONED, not waited on forever", async () => {
    // THE BOUND, PROVEN RATHER THAN READ. The page's own timeout is five seconds, which no test
    // should sit through — so the page is re-imported with that ONE constant rewritten to 5 ms and
    // nothing else changed. What is under test is the page's real AbortController wiring: the stub
    // below never resolves on its own and answers only to the signal the page passes it.
    const work = makeWorkDir("present-global-timeout");
    const quick = await importPage(work, (source) =>
      assertMutated(source, "const DECLARATION_TIMEOUT_MS = 5000;", "const DECLARATION_TIMEOUT_MS = 5;"),
    );
    const saved = globalThis.fetch;
    globalThis.fetch = (url, init) =>
      new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const said = [];
    const warn = console.warn;
    console.warn = (message) => said.push(message);
    try {
      // If the bound is not real this never returns and the runner kills the suite on its timeout.
      await quick.loadPresentation();
    } finally {
      globalThis.fetch = saved;
      console.warn = warn;
    }
    assert.match(said.join(" "), /could not be read/);
  });

  // ── THE MUTATION PROOF ───────────────────────────────────────────────────────────────────────

  test("MUTATION: a page that ignores the fetched bytes fails this section", async () => {
    // BREAK THE ONE LINE THAT MAKES THE WIRE MATTER — the page still fetches, still parses, and
    // then applies an empty document instead of what arrived. Every assertion above about the
    // fetched document deciding the paint must go red against this page, or they were proving
    // something the page does for another reason.
    const work = makeWorkDir("present-global-mutant");
    const mutant = await importPage(work, (source) =>
      assertMutated(source, "applyPresentation(await response.json());", "await response.json();\n    applyPresentation({});"),
    );
    mutant.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });

    await served(fetched({ checkbox: "raw", heading: "raw", tags: "raw" }), mutant);
    const painted = paintedNow(mutant);
    assert.equal(
      painted.filter((el) => el.type === "checkbox").length,
      1,
      "the MUTATED page followed the fetched declaration — the mutation did not land, so the " +
        "green above proves nothing",
    );
  });
});

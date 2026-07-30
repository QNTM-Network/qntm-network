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
 *   2. THROUGH app.html'S OWN SCRIPT. The page is lifted out of the HTML and run, its fetch is
 *      answered with a flipped document, and the DOM it paints is asserted. This is the half that
 *      would catch the real failure of this stage: a reader that works perfectly and a page that
 *      never calls it. A green on (1) alone is exactly the shape of the bug being disproved.
 *
 * AND THE SHIPPED FILE IS ASSERTED TO CHANGE NOTHING. presentation.json is read off disk and
 * compared, paint for paint, against a context with no declaration at all. Stage 2's promise is
 * that the default value is today's behaviour, so nothing moves until someone flips it.
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
  makeWorkDir,
  walk as walkPage,
} from "./fixtures/app-html-page.mjs";
import {
  paint,
  readDeclaration,
  presentationFromDeclaration,
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

describe("1. the committed declaration changes nothing", () => {
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

  test("the painted DOM under it is identical to the painted DOM with no declaration at all", () => {
    // THE "NOTHING CHANGES UNTIL IT IS FLIPPED" PROMISE, as a comparison rather than a claim.
    const declared = presentationFromDeclaration(SERVED).context;
    assert.equal(
      serialize(painted(VIEW_MARKDOWN, declared)),
      serialize(painted(VIEW_MARKDOWN, new PresentationContext())),
      "the shipped declaration moved the painted output — stage 2 promised it would not",
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
  let served;

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = async (url) => {
      // SITE-ROOT-ABSOLUTE, and asserted as such. The page is served at /app/, so a relative
      // "./presentation.json" would resolve to /app/presentation.json and 404 in the browser —
      // the declaration would go unread and every level would fall silent, which is exactly the
      // failure this suite exists to catch. Pinning the leading `/` makes that a red test rather
      // than a quiet regression to pre-cascade behaviour.
      assert.equal(url, "/presentation.json", `the page fetched ${url}`);
      return { ok: true, json: async () => served };
    };
    page = await importPage(WORK);
    page.__setGraphData({ snapshot: { generated_at: "x", views: [VIEW] } });
  });

  /** Load a declaration through the page's own loader and paint through its own painter. */
  async function pagePaints(declaration) {
    served = declaration;
    await page.loadPresentation();
    page.paintView("this-week");
    return walkPage(elements.get("viewBody"));
  }

  test("the served declaration reaches the page's painted DOM", async () => {
    const wired = await pagePaints({ checkbox: "wired", heading: "wired" });
    assert.equal(wired.filter((el) => el.type === "checkbox").length, 1);
    assert.ok(wired.some((el) => el.tagName === "h3"));

    const raw = await pagePaints({ checkbox: "raw", heading: "raw" });
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

  test("a declaration the page cannot fetch leaves it exactly where it was", async () => {
    const failed = [];
    const warn = console.warn;
    console.warn = (message) => failed.push(message);
    const fetching = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    try {
      await page.loadPresentation();
    } finally {
      globalThis.fetch = fetching;
      console.warn = warn;
    }
    page.paintView("this-week");
    const body = walkPage(elements.get("viewBody"));
    assert.equal(body.filter((el) => el.type === "checkbox").length, 1, "a 404 broke the paint");
    assert.match(failed.join(" "), /every level stays silent/);
  });

  test("the page reports a problem in the served document rather than swallowing it", async () => {
    const said = [];
    const warn = console.warn;
    console.warn = (message) => said.push(message);
    try {
      await pagePaints({ chekbox: "raw" });
    } finally {
      console.warn = warn;
    }
    assert.match(said.join(" "), /'chekbox' is not a resolution key/);
  });
});

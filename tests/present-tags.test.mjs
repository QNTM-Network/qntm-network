/**
 * THE STAGE 8 FALSIFIER — `tags` is a resolution with a reader, and the chip is what proves it.
 *
 *   node --test tests/present-tags.test.mjs
 *
 * Stage 8 is the first stage whose subject is a TOKEN rather than a LINE, and that changes what
 * has to be proven. Every rendition before this one kept the source characters on the page: a
 * checkbox IS the glyph, an `<h3>` keeps its words, a prose line keeps its sentence. A chip does
 * not — `#work` leaves the text and becomes a styled element. So this suite has four jobs, and
 * only the first is the one a reader would guess.
 *
 *   1. THE GRAMMAR IS THE ENGINE'S. A tag is not "a word after a hash". The engine has a lexical
 *      grammar, it lives in code and not in vocabulary config, and section 1 below carries that
 *      regex VERBATIM as the reference and compares this repo's form against it over the engine's
 *      own named cases plus a generated sweep. A chip that swallowed something that is not a tag
 *      would be the app disagreeing with the machine that produced the line.
 *
 *   2. THE PAINTER ASKS AND OBEYS, for the new key exactly as for the old ones — and the answer
 *      arrives from a DECLARATION, not from a branch.
 *
 *   3. THE CHIP CANNOT INJECT. The chip is placed into the markdown as raw HTML, which is only
 *      safe because the grammar cannot produce `<`, `>`, `&` or `"`. That is fuzzed, not assumed.
 *      And where the renderer will not pass the chip through, the characters win — section 5.
 *
 *   4. THE SOURCE IS STILL THE TRUTH, AND THIS IS THE FIRST STAGE THAT COULD REALLY TEST IT.
 *      Section 6 is the DOM-inversion detector aimed at the one rendition where the DOM and the
 *      source genuinely disagree. Before the chip, a painter that rebuilt the file from the page
 *      would have reproduced the source by accident, because the page still held every character.
 *      With chips painted, a page-derived file cannot contain `#work` at all. This is the first
 *      time that detector can catch something on the first try rather than on a corrupted DOM.
 *
 * Everything here runs against dist/present.js, the artifact the browser loads.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";

import { makeDocument, makeBody, makeEvent, walk, serialize } from "./fixtures/dom-stub.mjs";
import {
  paint,
  applyEdit,
  tagSpans,
  classifyLine,
  readDeclaration,
  presentationFromDeclaration,
  DEFAULT,
  FocusSurface,
  PresentationCascade,
  PresentationContext,
  RESOLUTION_KEYS,
} from "../dist/present.js";

// The app page's own renderer configuration, verbatim from app/index.html.
const md = new MarkdownIt("commonmark").enable("table");

/** The GLOBAL declaration the site actually serves, minus the file read — the chip end. */
const WIRED = presentationFromDeclaration({
  checkbox: "wired",
  heading: "wired",
  prose: "wired",
  tags: "wired",
}).context;

const SOURCE = [
  "## Overdue #work",
  "- [ ] Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29",
  "  - [x] sub-step done [[qntm:122]] #task",
  "a plain line with a #tag on it",
  "prose with no tags at all",
].join("\n");

function view(source = SOURCE, context = WIRED, deps = {}) {
  globalThis.document = makeDocument();
  const body = makeBody();
  paint(body, source, context, { markdown: md, ...deps });
  return body;
}

const chips = (body) =>
  [...serialize(body).matchAll(/<span class=\\"tagchip\\">(#[^<]*)<\/span>/g)].map((m) => m[1]);

describe("1. a tag is what the ENGINE says a tag is", () => {
  // ── THE REFERENCE ──
  //
  // Verbatim from the engine, cited so it can be checked rather than trusted:
  //
  //   the engine, src/qntm_md/io/parser/parse_tag.py:23
  //     TAG_RE = re.compile(r"(?<!\S)#([a-zA-Z_][a-zA-Z0-9_-]*)")
  //
  // The shipped grammar cannot use lookbehind — Safari only got it in 16.4, and an unparseable
  // regex literal is a SyntaxError that takes the whole presentation bundle down rather than
  // degrading one rendition. So it is written `(^|\s)` and the two forms are proven equal here
  // instead of asserted equal in a comment.
  const ENGINE = /(?<!\S)#([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  const engineTags = (text) => [...text.matchAll(ENGINE)].map((m) => m[0]);
  const appTags = (text) => tagSpans(text).map((span) => span.text);

  // The engine's own answers, from tests/io/parser/test_parse_tag.py and the SCOPE comment at
  // src/qntm_md/io/applier.py:564-572. Each row is [line, the tags the engine extracts].
  const CASES = [
    ["#work", ["#work"]],
    ["a line with #work on it", ["#work"]],
    ["#task #work", ["#task", "#work"]],
    ["#work-admin", ["#work-admin"]],
    ["#work_admin", ["#work_admin"]],
    ["#_private", ["#_private"]],
    ["#WORK", ["#WORK"]],
    ["#Heading", ["#Heading"]], // no space after the hash — a tag, not a heading
    ["#1", []], // a digit cannot open a tag body
    ["#1abc", []],
    ["#-x", []], // nor a hyphen
    ["#", []],
    ["# Heading", []], // a space cannot either
    ["## Heading", []],
    ["####### seven", []],
    ["foo#bar", []], // the hash must start the text or follow whitespace
    ["C#", []],
    ["$#fortunate", []],
    ["(#work", []],
    ['"#work"', []],
    ["http://example.com/#anchor", []],
    ["see http://ex.com/#anchor for more", []],
    ["#work#priority", ["#work"]], // the second hash is preceded by a letter
    ["#work/admin", ["#work"]], // nested tags are NOT a thing; `/admin` stays in the title
    ["#work.", ["#work"]],
    ["#work, #home)", ["#work", "#home"]],
    ["#café", ["#caf"]], // the body class is ASCII; it truncates
    ["#日本", []],
    ["- [ ] Draft [[qntm:121]] #task #work 🆕 2026-07-29", ["#task", "#work"]],
    ["  indented #tag", ["#tag"]],
    ["\t#tabbed", ["#tabbed"]],
    ["#a #b #c", ["#a", "#b", "#c"]],
    ["#a  #b", ["#a", "#b"]], // two separators, both tags
    ["#a#b", ["#a"]],
  ];

  for (const [line, expected] of CASES) {
    test(`${JSON.stringify(line)} -> ${JSON.stringify(expected)}`, () => {
      assert.deepEqual(appTags(line), expected);
      assert.deepEqual(
        engineTags(line),
        expected,
        "the case table itself disagrees with the engine's regex — the table is wrong, not the app",
      );
    });
  }

  test("the shipped form and the engine's lookbehind form accept the same language", () => {
    // A generated cross-product rather than the cases somebody thought of. Every prefix crossed
    // with every body crossed with every suffix, both regexes run, results compared.
    const prefixes = ["", " ", "  ", "\t", "a", "a ", "(", '"', "http://x/", "#", "- [ ] ", "## "];
    const bodies = ["#work", "#w", "#_x", "#1", "#-x", "#", "#a-b_c9", "#WORK", "word", ""];
    const suffixes = ["", " ", ".", ")", "#more", " #more", "/nested", "x", "\t#t"];
    let compared = 0;
    for (const p of prefixes) {
      for (const b of bodies) {
        for (const s of suffixes) {
          const line = p + b + s;
          assert.deepEqual(appTags(line), engineTags(line), `differs for ${JSON.stringify(line)}`);
          compared += 1;
        }
      }
    }
    assert.ok(compared >= 900, `sweep too small to be evidence (${compared})`);
  });

  test("a span points at the characters it came from, exactly", () => {
    // The offsets are what would make removal expressible as a substring operation. They are
    // asserted now, while nothing uses them, so that the affordance this stage does NOT ship is a
    // decision rather than a dead end.
    const line = "- [ ] a [[qntm:1]] #task #work 🆕 2026-07-29";
    for (const span of tagSpans(line)) {
      assert.equal(line.slice(span.start, span.end), span.text);
      assert.equal(span.end - span.start, span.text.length);
    }
    assert.deepEqual(
      tagSpans(line).map((s) => s.text),
      ["#task", "#work"],
    );
  });

  test("a tag can hold no character that matters to HTML", () => {
    // The chip is placed into the markdown as raw HTML and is NOT escaped. That is safe because
    // of the grammar, not because of the painter — so the grammar is what gets fuzzed.
    const hostile = [
      '#a<script>alert("x")</script>',
      "#a\"onload=\"x",
      "#<img src=x onerror=y>",
      "#a&amp;b",
      "#a>b",
      "#a'b",
      "#a`b",
      "#a\\b",
      "#</span><span class=evil>",
    ];
    for (const line of hostile) {
      for (const span of tagSpans(line)) {
        for (const char of ["<", ">", "&", '"', "'", "\\", "`", " "]) {
          assert.ok(
            !span.text.includes(char),
            `the grammar matched ${JSON.stringify(span.text)}, which carries ${char}`,
          );
        }
        assert.match(span.text, /^#[A-Za-z_][A-Za-z0-9_-]*$/);
      }
    }
  });

  test("matching the render input is the same as matching the whole line", () => {
    // The painter runs the grammar on the string it is ABOUT TO RENDER — a task's tail, a
    // heading's text, a prose line's source — not on the whole line. That is only sound because
    // what precedes each of those inside the line is always whitespace, so `(^|\s)` sees the same
    // boundary either way. Proven over the same sweep rather than argued.
    const bodies = ["#work", "a #work", "a#work", "#w #x", "no tags", "#1", "#_x", "x #work y"];
    for (const body of bodies) {
      const line = `- [ ] ${body}`;
      const shape = classifyLine(line);
      assert.equal(shape.kind, "checkbox");
      assert.deepEqual(
        tagSpans(shape.tail).map((s) => s.text),
        tagSpans(line).map((s) => s.text),
        `the tail and the line disagree for ${JSON.stringify(line)}`,
      );

      const heading = `## ${body}`;
      const headShape = classifyLine(heading);
      assert.equal(headShape.kind, "heading");
      assert.deepEqual(
        tagSpans(headShape.text).map((s) => s.text),
        tagSpans(heading).map((s) => s.text),
        `the heading text and the line disagree for ${JSON.stringify(heading)}`,
      );
    }
  });
});

describe("2. `tags` is a key with a reader", () => {
  test("it is a resolution key, and the roster is the one the painter reads", () => {
    assert.ok(RESOLUTION_KEYS.includes("tags"));
    assert.equal(DEFAULT.tags, "raw", "the FLOOR of the cascade is what the app did before");
  });

  test("the painter asks the cascade about tags on every line it paints", () => {
    const asked = [];
    const original = PresentationCascade.prototype.resolve;
    PresentationCascade.prototype.resolve = function spy(key) {
      asked.push(key);
      return original.call(this, key);
    };
    try {
      view(SOURCE, WIRED);
    } finally {
      PresentationCascade.prototype.resolve = original;
    }
    assert.ok(
      asked.includes("tags"),
      "the painter built a line without asking how its tags are shown — the decision is back at " +
        "the call site, which is the condition app/present/ exists to end",
    );
  });

  test("wired makes chips; raw makes characters; the source does not move either way", () => {
    const wired = view(SOURCE, WIRED);
    assert.deepEqual(chips(wired), ["#work", "#task", "#work", "#task", "#tag"]);

    const raw = view(SOURCE, presentationFromDeclaration({ tags: "raw" }).context);
    assert.deepEqual(chips(raw), [], "a declaration of raw still produced a chip");
    assert.ok(serialize(raw).includes("#task"), "raw did not leave the tag as characters");
  });

  test("a silent context is the raw end, which is what the golden master compares against", () => {
    assert.equal(
      serialize(view(SOURCE, new PresentationContext())),
      serialize(view(SOURCE, presentationFromDeclaration({ tags: "raw" }).context)),
    );
    const cascade = new PresentationCascade(new PresentationContext());
    assert.deepEqual(cascade.resolve("tags"), { rendition: "raw", level: "GLOBAL" });
  });

  test("the level that won is reported, so the chip can explain itself", () => {
    const { context } = presentationFromDeclaration({ tags: "wired" });
    assert.deepEqual(new PresentationCascade(context).resolve("tags"), {
      rendition: "wired",
      level: "GLOBAL",
    });
  });

  test("a line whose own family is raw shows ALL its characters, chips or no chips", () => {
    // The keys are not independent knobs on one line. A line resolved raw is the characters,
    // verbatim, so `tags: wired` cannot leave a raw line half-rendered — and this is exactly what
    // makes the cursor rule work for tags without focus.ts knowing the key exists.
    const mixed = presentationFromDeclaration({ checkbox: "raw", tags: "wired" }).context;
    const body = view(SOURCE, mixed);
    const raw = walk(body).map((el) => el.textContent).filter((text) => text.startsWith("- ["));
    assert.equal(raw.length, 1, "the checkbox declaration did not take the task line raw");
    assert.equal(raw[0], SOURCE.split("\n")[1]);
    assert.ok(raw[0].includes("#task") && raw[0].includes("#work"));
    assert.ok(!raw[0].includes("tagchip"), "a raw line carried the app's own markup");
    // And the families that were NOT declared raw still chip, because a declaration is per key.
    assert.deepEqual(chips(body), ["#work", "#tag"]);
  });
});

describe("3. `hidden` is not a rendition, and that is a decision", () => {
  // The design calls hiding "the safest resolution of all, because hidden text is not edited"
  // (design-presentation-cascade.md section 5). It is refused here, and the reason is not taste.
  //
  // `Rendition` is ONE closed union shared by every key, and `readDeclaration` validates a value
  // against that union and nothing else — it has no per-key table. So admitting `hidden` would
  // admit `{"checkbox": "hidden"}`, `{"heading": "hidden"}` and `{"prose": "hidden"}` as
  // well-formed declarations THAT NOTHING READS: the painter branches on `=== "raw"` and would
  // paint a hidden checkbox as a checkbox, silently. That is a declaration that loads clean and
  // reaches nothing — this system's highest-frequency bug — installed in the type system, where it
  // would be hardest to see.
  //
  // And the premise does not survive contact with this app either. Hidden text IS edited here: the
  // FOCUS level takes a line to `raw` on every key, so the cursor landing on a line makes hidden
  // tags reappear as characters. "Hidden" would not mean "not edited", it would mean "invisible
  // until the cursor arrives, then not" — a line whose length changes under the reader.
  //
  // What it would take: renditions that vary per key rather than one union across all of them, so
  // that `hidden` can be offered where it has a reader and refused where it does not.

  test("a declaration of hidden is a reported problem, not a silent third state", () => {
    const { contribution, problems } = readDeclaration({ tags: "hidden" });
    assert.deepEqual(contribution, {}, "'hidden' reached the cascade as a contribution");
    assert.equal(problems.length, 1);
    assert.match(problems[0], /not a rendition/);
    assert.match(problems[0], /raw, wired/);
  });

  test("and the key falls through to the default rather than to something invented", () => {
    const { context } = presentationFromDeclaration({ tags: "hidden" });
    assert.deepEqual(new PresentationCascade(context).resolve("tags"), {
      rendition: DEFAULT.tags,
      level: "GLOBAL",
    });
  });
});

describe("4. a chip never swallows something that is not a tag", () => {
  const NOT_TAGS = [
    ["## A Heading", "A Heading"],
    ["a line about C# and F#", "C# and F#"],
    ["see http://example.com/#anchor", "#anchor"],
    ["issue foo#42 in the tracker", "foo#42"],
    ["####### seven hashes is not a heading", "####### seven"],
    ["- [ ] pay the #1 invoice", "#1"],
  ];

  for (const [line, fragment] of NOT_TAGS) {
    test(`${JSON.stringify(line)} keeps ${JSON.stringify(fragment)} as characters`, () => {
      const text = serialize(view(line, WIRED));
      assert.ok(!text.includes("tagchip"), `a chip was built out of ${JSON.stringify(fragment)}`);
    });
  }

  test("a heading's own hashes are never a chip, at any depth", () => {
    for (const hashes of ["#", "##", "###", "####", "#####", "######"]) {
      const text = serialize(view(`${hashes} Work`, WIRED));
      assert.ok(!text.includes("tagchip"), `${hashes} was painted as a tag`);
    }
  });

  test("a tag inside a heading IS a chip, because it is a tag", () => {
    assert.deepEqual(chips(view("## Overdue #work", WIRED)), ["#work"]);
  });
});

describe("5. where the renderer will not carry the chip, the characters win", () => {
  test("an indented line is a code block to markdown-it, so it keeps its characters", () => {
    // The engine indents nested lines by four spaces (renderer.py), and four spaces is an
    // indented code block to CommonMark — so this is a shape real views contain. Escaped chip
    // markup on screen would be strictly worse than the `#tag` that was there before, so the
    // painter checks that every chip it injected came back out and falls back if not.
    const indented = "    - a nested plain line #work";
    const text = serialize(view(indented, WIRED));
    assert.ok(!text.includes("tagchip"), "escaped chip markup reached the page");
    assert.ok(text.includes("#work"), "the fallback lost the tag characters");
    assert.equal(
      text,
      serialize(view(indented, presentationFromDeclaration({ tags: "raw" }).context)),
      "the fallback did not land on exactly what raw would have painted",
    );
  });

  test("the fallback is all-or-nothing, so a line is never half chipped", () => {
    const text = serialize(view("    - two tags #a and #b here", WIRED));
    assert.equal((text.match(/tagchip/g) ?? []).length, 0);
  });

  test("a renderer that escapes everything degrades to the characters, not to markup", () => {
    // The chip does not assert the renderer's configuration — it observes what the renderer did
    // with this line. A renderer built with `html: false` would escape the span; this proves the
    // failure mode is "no chip", never "markup on screen".
    const escaping = new MarkdownIt("commonmark");
    escaping.set({ html: false });
    globalThis.document = makeDocument();
    const body = makeBody();
    paint(body, "- [ ] a task #work", WIRED, { markdown: escaping });
    const text = serialize(body);
    assert.ok(!text.includes("tagchip"), "a renderer that escapes HTML put markup on the page");
    assert.ok(text.includes("#work"));
  });

  test("a line with no tags at all is rendered by exactly one call, chips or not", () => {
    // Not a performance point — a correctness one. `renderTags` must not put a line through the
    // renderer twice when there is nothing to inject, or a renderer with any state would see a
    // different sequence under `wired` than under `raw`.
    let calls = 0;
    const counting = {
      renderInline: (s) => {
        calls += 1;
        return md.renderInline(s);
      },
      render: (s) => {
        calls += 1;
        return md.render(s);
      },
    };
    globalThis.document = makeDocument();
    paint(makeBody(), "- [ ] no tags on this line", WIRED, { markdown: counting });
    assert.equal(calls, 1);
  });
});

describe("6. the chip changes the DOM and does not change the source", () => {
  test("the chip offers nothing — the markup it emits is inert", () => {
    // The rendition ships read-only. `applyEdit` gained no case for it, so the first token
    // rendition adds no second write path. See app/present/paint.ts for what a removable chip
    // would need before it could ship.
    //
    // ASSERTED AGAINST THE MARKUP, NOT AGAINST A LISTENER MAP, and the correction is worth
    // recording. This test first walked the painted elements looking for one whose listeners were
    // empty — and it was VACUOUS: the chip is built as HTML inside a `<span>`'s innerHTML, so
    // there is no element in the stub to walk to, and the loop ran zero times. A mutation that
    // put `onclick` on the chip left it green. So it asserts what the painter actually emits:
    // every chip is exactly a class and a tag, with no attribute that could carry a gesture.
    const painted = serialize(view(SOURCE, WIRED));
    const emitted = [...painted.matchAll(/<span class=\\"tagchip\\"[^>]*>/g)].map((m) => m[0]);
    assert.equal(emitted.length, 5, "the fixture painted the wrong number of chips");
    for (const open of emitted) {
      assert.equal(
        open,
        '<span class=\\"tagchip\\">',
        "a chip carries an attribute beyond its class — the read-only rendition grew an affordance",
      );
    }
    assert.ok(!painted.includes("tagchip") || !/tagchip[^>]*(on[a-z]+|href|data-)=/.test(painted));
  });

  test("the edit that would remove a tag does not exist, and asking for it is a refusal", () => {
    // THE ONLY HONEST WAY TO SAY "THIS AFFORDANCE IS NOT ADMISSIBLE YET". Not a comment — an
    // assertion that the edit really is absent, and that asking for one applyEdit does not know
    // changes nothing rather than doing something adjacent.
    //
    // This test found a real hazard while it was being written. `applyEdit` used to fall through
    // to the checkbox branch for anything that was not `set-line`, so this call UNTICKED line 1
    // and returned a whole file to POST. `SourceEdit` is a closed union so no typed caller could
    // reach it — but the first person to add `delete-span` and forget a branch would have.
    assert.equal(applyEdit(SOURCE, { kind: "delete-span", lineIndex: 1, start: 39, end: 44 }), null);
    assert.equal(applyEdit(SOURCE, { kind: "", lineIndex: 1 }), null);
    assert.equal(applyEdit(SOURCE, { lineIndex: 1, checked: true }), null);
    // And the two that DO exist still do.
    assert.ok(applyEdit(SOURCE, { kind: "set-checkbox", lineIndex: 1, checked: true }) !== null);
    assert.ok(applyEdit(SOURCE, { kind: "set-line", lineIndex: 1, text: "- [ ] x" }) !== null);
  });

  test("ticking a box on a chipped line posts the source, with the tag characters intact", () => {
    let posted = null;
    const body = view(SOURCE, WIRED, { onCheckboxToggle: (toggle) => (posted = toggle) });
    const box = walk(body).find((el) => el.type === "checkbox");
    box.checked = true;
    box.dispatch("change");

    assert.equal(posted.markdown, applyEdit(SOURCE, { kind: "set-checkbox", lineIndex: 1, checked: true }));
    const after = posted.markdown.split("\n");
    assert.equal(after[1], "- [x] Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29");
    assert.ok(after[1].includes("#task") && after[1].includes("#work"));
  });

  test("is immune to a corrupted DOM — and this is the first rendition where that bites", () => {
    // THE DOM-INVERSION DETECTOR, AIMED AT THE ONE RENDITION WHERE THE PAGE AND THE SOURCE REALLY
    // DISAGREE. Stage 1 found that a naive inversion passes a byte-identical golden and every
    // ordinary assertion, because until now the page still held every source character — a
    // file rebuilt from the DOM would have come out right by accident. It cannot here: with
    // chips painted, `#work` is not text on the page at all. A page-derived file would lose the
    // tags even before anything is corrupted.
    let posted = null;
    const body = view(SOURCE, WIRED, { onCheckboxToggle: (toggle) => (posted = toggle) });
    for (const el of walk(body)) {
      if (el.tagName === "span") el.innerHTML = "<b>TOTALLY DIFFERENT TEXT</b>";
      if (el.tagName === "h3") el.innerHTML = "WRECKED HEADING";
      if (el.tagName === "div") el.innerHTML = "WRECKED PROSE";
      if (el.tagName === "label") el.className = "wrecked";
    }
    const box = walk(body).find((el) => el.type === "checkbox");
    box.checked = true;
    box.dispatch("change");

    assert.equal(posted.markdown, applyEdit(SOURCE, { kind: "set-checkbox", lineIndex: 1, checked: true }));
    assert.ok(!posted.markdown.includes("TOTALLY DIFFERENT") && !posted.markdown.includes("WRECKED"));
    const before = SOURCE.split("\n");
    const after = posted.markdown.split("\n");
    assert.deepEqual(before.map((_, i) => i).filter((i) => before[i] !== after[i]), [1]);
    for (const line of after) {
      assert.ok(!line.includes("tagchip"), "the posted file carries the app's own markup");
    }
  });

  test("editing a chipped line posts the file with exactly that line replaced", () => {
    const focus = new FocusSurface();
    const commits = [];
    const body = view(SOURCE, WIRED, { focus, onLineCommit: (commit) => commits.push(commit) });
    walk(body).find((el) => el.tagName === "span").dispatch("click", makeEvent());

    const editable = walk(body).find((el) => el.tagName === "input" && el.type === "text");
    assert.ok(editable, "clicking a chipped line reached no source");
    editable.value = "- [ ] Draft the launch note [[qntm:121]] #task #home 🆕 2026-07-31";
    editable.dispatch("blur");

    const before = SOURCE.split("\n");
    const after = commits[0].markdown.split("\n");
    assert.equal(after.length, before.length);
    assert.deepEqual(before.map((_, i) => i).filter((i) => before[i] !== after[i]), [1]);
    for (let i = 0; i < before.length; i += 1) {
      if (i === 1) continue;
      assert.equal(after[i], before[i], `line ${i} moved and nobody edited it`);
    }
  });
});

describe("7. the cursor still reaches every character, chips or not", () => {
  test("the focused line shows its verbatim source, tags as characters", () => {
    // The FOCUS contribution is built FROM RESOLUTION_KEYS, so `tags` joined it without anyone
    // editing focus.ts. This asserts the consequence rather than the mechanism: a chipped line
    // that a cursor lands on has to become the characters it was built from.
    const focus = new FocusSurface();
    const body = view(SOURCE, WIRED, { focus });
    assert.ok(serialize(body).includes("tagchip"), "the fixture painted no chip to begin with");

    walk(body).find((el) => el.tagName === "span").dispatch("click", makeEvent());
    const editable = walk(body).find((el) => el.tagName === "input" && el.type === "text");
    assert.equal(editable.value, SOURCE.split("\n")[1]);
    for (const substring of ["#task", "#work", "[[qntm:121]]", "🆕 2026-07-29"]) {
      assert.ok(editable.value.includes(substring), `the focused line lost ${substring}`);
    }
  });

  test("FOCUS resolves tags raw, and says which level did it", () => {
    const focus = new FocusSurface();
    focus.focus(1);
    const on = new PresentationCascade(focus.contextFor(1, WIRED));
    const off = new PresentationCascade(focus.contextFor(2, WIRED));
    assert.deepEqual(on.resolve("tags"), { rendition: "raw", level: "FOCUS" });
    assert.deepEqual(off.resolve("tags"), { rendition: "wired", level: "GLOBAL" });
  });

  test("blur puts the chips back", () => {
    const focus = new FocusSurface();
    const body = view(SOURCE, WIRED, { focus, onLineCommit: () => {} });
    const before = serialize(body);
    walk(body).find((el) => el.tagName === "span").dispatch("click", makeEvent());
    walk(body).find((el) => el.tagName === "input" && el.type === "text").dispatch("blur");
    assert.equal(serialize(body), before, "the view did not return to what it was");
    assert.ok(serialize(body).includes("tagchip"));
  });
});

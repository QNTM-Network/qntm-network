/**
 * THE FALSIFIER — the painter routes through the cascade, and every affordance is a source edit.
 *
 *   node --test tests/present-cascade.test.mjs
 *
 * The golden master next door proves the output did not change. It cannot prove the STRUCTURE
 * did: a painter that kept every hardcoded decision and merely moved house would pass it
 * unchanged. This is the suite that would go red for that, and it is written so that it goes red
 * for the specific failures worth catching rather than for "something is different".
 *
 * THREE PROPERTIES, EACH WITH THE MUTATION THAT KILLS IT:
 *
 *   1. THE PAINTER ASKS. Every rendition question reaches PresentationCascade.resolve. Mutation:
 *      inline the decision in paint.ts. The spy sees nothing and `routes every rendition question
 *      through the cascade` fails.
 *   2. THE PAINTER OBEYS. The cascade's answer determines the DOM, so a resolver that says `raw`
 *      gets raw. Mutation: ignore the answer and always build the wired rendition. `obeys a
 *      resolver that says raw` fails — and this is the one a "moved but still hardcoded" painter
 *      cannot survive, because a decision it makes itself is a decision it cannot be told.
 *   3. THE APP NEVER READS THE DOM. The markdown posted after a toggle is derived from the source
 *      string alone. Mutation: build the posted markdown from the rendered elements. `is immune
 *      to a corrupted DOM` fails, because the test corrupts the DOM first and then checks the
 *      posted file is unaffected.
 *
 * Property 3 is the one this repo could least afford to lose. The app posts the WHOLE FILE, so a
 * bad inversion does not corrupt one title — it rewrites a view.
 *
 * Everything here runs against dist/present.js, the artifact the browser loads.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";

import { makeDocument, makeBody, walk, serialize, VIEW_MARKDOWN } from "./fixtures/dom-stub.mjs";
import {
  paint,
  applyEdit,
  classifyLine,
  isSilent,
  SPECIFICITY,
  DEFAULT,
  RESOLUTION_KEYS,
  PresentationCascade,
  PresentationContext,
} from "../dist/present.js";

const md = new MarkdownIt("commonmark").enable("table");

function painted(markdown, context = new PresentationContext(), onCheckboxToggle = () => {}) {
  const document = makeDocument();
  const body = makeBody();
  globalThis.document = document;
  paint(body, markdown, context, { markdown: md, onCheckboxToggle });
  return body;
}

/** Replace `resolve` for the duration of `fn`, recording every key it was asked about. */
function withSpy(answer, fn) {
  const original = PresentationCascade.prototype.resolve;
  const asked = [];
  PresentationCascade.prototype.resolve = function spy(key) {
    asked.push(key);
    return answer === null ? original.call(this, key) : answer;
  };
  try {
    return { asked, result: fn() };
  } finally {
    PresentationCascade.prototype.resolve = original;
  }
}

const TASK_AND_HEADING = ["## Work", "- [ ] a task [[qntm:1]] #work", "prose"].join("\n");

describe("1. the painter asks", () => {
  test("routes every rendition question through the cascade", () => {
    const { asked } = withSpy(null, () => painted(TASK_AND_HEADING));
    assert.ok(
      asked.includes("checkbox"),
      "the painter built a task line without asking the cascade — the decision is back at the " +
        "call site, which is the condition app/present/ exists to end",
    );
    assert.ok(
      asked.includes("heading"),
      "the painter built a heading without asking the cascade",
    );
  });

  test("asks about nothing it has no rendition for", () => {
    // The roster is what the app actually resolves. A key asked for but never honoured would be
    // a declaration reaching nothing, which is the bug this whole design names by hand.
    const { asked } = withSpy(null, () => painted(VIEW_MARKDOWN));
    for (const key of new Set(asked)) {
      assert.ok(RESOLUTION_KEYS.includes(key), `painter asked about an undeclared key: ${key}`);
    }
  });

  test("asks about every key it declares", () => {
    const { asked } = withSpy(null, () => painted(VIEW_MARKDOWN));
    for (const key of RESOLUTION_KEYS) {
      assert.ok(asked.includes(key), `key '${key}' is declared but the painter never reads it`);
    }
  });
});

describe("2. the painter obeys", () => {
  test("obeys a resolver that says raw", () => {
    const { result } = withSpy({ rendition: "raw", level: "FOCUS" }, () =>
      painted(TASK_AND_HEADING),
    );
    const text = serialize(result);
    assert.ok(!text.includes("tag=input"), "a raw resolution still produced a checkbox element");
    assert.ok(!text.includes("tag=h3"), "a raw resolution still produced a heading element");
    // Raw means THE CHARACTERS, VERBATIM — the property migration stage 3's cursor rule needs.
    const rendered = walk(result).map((el) => el.textContent);
    assert.ok(rendered.includes("- [ ] a task [[qntm:1]] #work"), "raw did not carry the source");
    assert.ok(rendered.includes("## Work"), "raw did not carry the heading source");
  });

  test("obeys a declaration made at a level, not only a spy", () => {
    // The same proof without touching the prototype: a real contribution at a real level, which
    // is what migration stage 2 will do from a served declaration.
    const raw = painted(TASK_AND_HEADING, new PresentationContext({ GLOBAL: { checkbox: "raw" } }));
    const text = serialize(raw);
    assert.ok(!text.includes("tag=input"), "a GLOBAL declaration of raw did not reach the paint");
    assert.ok(text.includes("tag=h3"), "a checkbox declaration wrongly changed the heading");
  });

  test("the shipped app's context leaves the painter exactly where it was", () => {
    // app.html constructs an empty PresentationContext. This pins that an empty context resolves
    // to today's behaviour, which is the whole reason the output is byte-identical.
    const cascade = new PresentationCascade(new PresentationContext());
    for (const key of RESOLUTION_KEYS) {
      assert.deepEqual(cascade.resolve(key), { rendition: DEFAULT[key], level: "GLOBAL" });
    }
  });
});

describe("3. precedence is owned in one tuple", () => {
  test("the most specific level that speaks wins, and says that it won", () => {
    const context = new PresentationContext({
      GLOBAL: { checkbox: "wired", heading: "wired" },
      USER: { checkbox: "raw" },
      FOCUS: { checkbox: "wired" },
    });
    const cascade = new PresentationCascade(context);
    assert.deepEqual(cascade.resolve("checkbox"), { rendition: "wired", level: "FOCUS" });
    assert.deepEqual(cascade.resolve("heading"), { rendition: "wired", level: "GLOBAL" });
  });

  test("every level can win, in the declared order", () => {
    // Walk SPECIFICITY: with every level declaring, the head must win; remove it and the next
    // must win. A second copy of the order anywhere would have to agree with this one to pass.
    for (let i = 0; i < SPECIFICITY.length; i += 1) {
      const contributions = {};
      for (const level of SPECIFICITY.slice(i)) {
        contributions[level] = { checkbox: level === SPECIFICITY[i] ? "raw" : "wired" };
      }
      const resolved = new PresentationCascade(new PresentationContext(contributions)).resolve(
        "checkbox",
      );
      assert.deepEqual(resolved, { rendition: "raw", level: SPECIFICITY[i] });
    }
  });

  test("silence has one spelling", () => {
    assert.equal(isSilent(undefined), true);
    assert.equal(isSilent({}), true);
    assert.equal(isSilent({ checkbox: "raw" }), false);
    const context = new PresentationContext({ FOCUS: {}, GLOBAL: { checkbox: "raw" } });
    assert.deepEqual(new PresentationCascade(context).resolve("checkbox"), {
      rendition: "raw",
      level: "GLOBAL",
    });
  });

  test("a level that speaks about another key does not swallow this one", () => {
    const context = new PresentationContext({
      FOCUS: { heading: "raw" },
      GLOBAL: { checkbox: "raw" },
    });
    assert.deepEqual(new PresentationCascade(context).resolve("checkbox"), {
      rendition: "raw",
      level: "GLOBAL",
    });
  });
});

describe("4. every affordance writes back through the source", () => {
  const SOURCE = [
    "## Overdue",
    "- [ ] first [[qntm:1]] #task",
    "  - [x] second [[qntm:2]] #task",
    "prose that must not move",
  ].join("\n");

  test("an edit changes exactly the intended substring and nothing else", () => {
    const next = applyEdit(SOURCE, { kind: "set-checkbox", lineIndex: 1, checked: true });
    assert.equal(next.length, SOURCE.length, "the file changed length — that is not a glyph swap");

    const before = SOURCE.split("\n");
    const after = next.split("\n");
    assert.equal(after.length, before.length);
    const changed = after.map((line, i) => i).filter((i) => after[i] !== before[i]);
    assert.deepEqual(changed, [1], "more than one line changed");

    // And within that line, exactly one character, at the glyph position.
    const differing = [...before[1]].map((c, i) => i).filter((i) => before[1][i] !== after[1][i]);
    assert.deepEqual(differing, [3]);
    assert.equal(before[1][3], " ");
    assert.equal(after[1][3], "x");
  });

  test("an edit that does not apply is refused, not guessed", () => {
    assert.equal(applyEdit(SOURCE, { kind: "set-checkbox", lineIndex: 0, checked: true }), null);
    assert.equal(applyEdit(SOURCE, { kind: "set-checkbox", lineIndex: 3, checked: true }), null);
    assert.equal(applyEdit(SOURCE, { kind: "set-checkbox", lineIndex: 99, checked: true }), null);
  });

  test("the whole file is the write unit", () => {
    // A resolution that renders only part of a file must still hold the whole file's source, or
    // a save drops the parts it never rendered.
    const next = applyEdit(SOURCE, { kind: "set-checkbox", lineIndex: 2, checked: false });
    assert.equal(next.split("\n").length, SOURCE.split("\n").length);
    assert.ok(next.endsWith("prose that must not move"));
    assert.ok(next.startsWith("## Overdue"));
  });

  test("toggling through the painted UI posts the source with one glyph changed", () => {
    let posted = null;
    const body = painted(SOURCE, new PresentationContext(), (toggle) => {
      posted = toggle;
    });
    const box = walk(body).find((el) => el.type === "checkbox");
    box.checked = true;
    box.dispatch("change");

    assert.equal(posted.lineIndex, 1);
    assert.equal(posted.checked, true);
    assert.equal(
      posted.markdown,
      applyEdit(SOURCE, { kind: "set-checkbox", lineIndex: 1, checked: true }),
    );
  });

  test("is immune to a corrupted DOM", () => {
    // THE DOM-INVERSION DETECTOR. Wreck everything the painter rendered, then use the affordance.
    // If the posted markdown is built from the source string it is unaffected; if any part of it
    // is ever derived from the document, this goes red. That is the failure mode section 5
    // forbids, and it is the reason this test exists rather than a comment saying we won't.
    let posted = null;
    const body = painted(SOURCE, new PresentationContext(), (toggle) => {
      posted = toggle;
    });
    for (const el of walk(body)) {
      if (el.tagName === "span") {
        el.innerHTML = "<b>TOTALLY DIFFERENT TEXT</b>";
      }
      if (el.tagName === "label") {
        el.className = "wrecked";
      }
    }
    const box = walk(body).find((el) => el.type === "checkbox");
    box.checked = true;
    box.dispatch("change");

    assert.equal(
      posted.markdown,
      applyEdit(SOURCE, { kind: "set-checkbox", lineIndex: 1, checked: true }),
    );
    assert.ok(
      !posted.markdown.includes("TOTALLY DIFFERENT"),
      "the posted markdown carries text that only ever existed in the DOM — the app is " +
        "reconstructing markdown from the document, and it posts the WHOLE FILE",
    );
  });

  test("a refused edit is reported as null rather than as a no-op file", () => {
    // The caller must be able to tell "nothing to do" from "here is the file unchanged", or a
    // failed edit becomes a POST that overwrites a view with a stale copy of itself.
    let posted = null;
    const body = painted("- [ ] only line", new PresentationContext(), (t) => {
      posted = t;
    });
    const box = walk(body).find((el) => el.type === "checkbox");
    box.checked = true;
    box.dispatch("change");
    assert.equal(typeof posted.markdown, "string");
    assert.equal(applyEdit("- [] not a task", { kind: "set-checkbox", lineIndex: 0, checked: true }), null);
  });
});

describe("5. the line classifier is the LINE level's reader", () => {
  test("classification order reproduces the old painter's branch order", () => {
    assert.equal(classifyLine("- [ ] x").kind, "checkbox");
    assert.equal(classifyLine("- [X] x").kind, "checkbox");
    assert.equal(classifyLine("## x").kind, "heading");
    assert.equal(classifyLine("####### x").kind, "prose");
    assert.equal(classifyLine("#nospace").kind, "prose");
    assert.equal(classifyLine("").kind, "blank");
    assert.equal(classifyLine("   ").kind, "blank");
    assert.equal(classifyLine("anything else").kind, "prose");
  });

  test("every shape carries its source verbatim", () => {
    for (const line of ["- [ ] a", "## b", "   ", "prose"]) {
      assert.equal(classifyLine(line).source, line);
    }
  });
});

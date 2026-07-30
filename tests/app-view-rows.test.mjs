/**
 * THE VIEW'S LINES — the two things the operator saw, held as properties of the stylesheet that
 * ships.
 *
 *   node --test tests/app-view-rows.test.mjs
 *
 * "it's not rendering correctly… if I click to edit it jumps around" is two defects, and both of
 * them live in one place: the `<style>` block of app/index.html, which is the whole of the app
 * page's styling (app/styles/*.css belongs to the demo page, not to this one).
 *
 *   THE JUMP. The painter repaints the WHOLE view on every focus change (app/present/paint.ts) —
 *   deliberately, because a patch-one-element painter would need a second copy of the precedence
 *   order inside it. So the focused line is not mutated, it is REPLACED: `label.task` becomes
 *   `input.rawline`, `h3` becomes `input.rawline`. Everything below moves by exactly the
 *   difference between the two boxes. Zero movement therefore means one thing and only one thing:
 *   every rendition of a line occupies the same box.
 *
 *   THE HEADINGS. A view's `#` becomes the page's `<h2>` (the page owns the `<h1>`), so `##` is an
 *   `<h3>` and `###` an `<h4>`. The demotion is right; what was missing was any rule below `<h3>`.
 *   `<h4>`, `<h5>` and `<h6>` fell through to the browser's defaults — BOLDER and LARGER than the
 *   dim `.92rem` `<h3>` above them — so `## Today` ranked BELOW `### Later`.
 *
 * ── WHY THIS SUITE READS CSS TEXT AND NOT A LAYOUT ──
 *
 * The honest proof of "nothing moves" is a browser measuring bounding boxes, and that is how the
 * fix was verified: every painted line's box recorded before and after focusing, in document
 * coordinates. This repo has no browser in CI and buying one for a stylesheet would cost more
 * than it is worth, so what CI holds is the INVARIANT THAT MAKES THE MEASUREMENT COME OUT ZERO,
 * which is a stronger thing to keep than the number itself:
 *
 *   1. the row — height, line box and vertical rhythm — is declared ONCE, for every child of
 *      `.viewbody`, and
 *   2. no rule that can match a painted line declares any of those properties differently.
 *
 * Together those two are equivalent to "every rendition has the same box", because a property
 * that is stated once and never overridden per kind cannot differ per kind. Assert 2 is the one
 * that goes red when someone gives a heading its margin back, which is how the jump got there.
 *
 * IT IS ALSO WHY THIS CANNOT BE STATED IN THE PAINTER. The `<input>` gets one class, `rawline`,
 * and nothing that says which kind of line it replaced — its text is set as a PROPERTY, so there
 * is no `value` attribute for a selector to read either. A per-kind box is a box the raw rendition
 * has no way to match.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..");
const PAGE = readFileSync(resolve(REPO, "app", "index.html"), "utf8");

/** The page's one stylesheet, as rules. Comments first, because they contain prose, not CSS. */
function readRules() {
  const block = /<style>([\s\S]*?)<\/style>/.exec(PAGE);
  assert.ok(block, "app/index.html no longer has a <style> block");
  const css = block[1].replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!css.includes("@"), "this reader does not understand at-rules; teach it before using one");

  const rules = [];
  for (const [, head, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map();
    for (const piece of body.split(";")) {
      const at = piece.indexOf(":");
      if (at === -1) continue;
      declarations.set(piece.slice(0, at).trim(), piece.slice(at + 1).trim());
    }
    rules.push({ selector: head.trim().replace(/\s+/g, " "), declarations });
  }
  assert.ok(rules.length > 30, "the stylesheet parsed to suspiciously few rules");
  return rules;
}

const RULES = readRules();

/** Every rule whose selector list contains `selector`, in source order. */
const rulesFor = (selector) =>
  RULES.filter((rule) => rule.selector.split(",").some((one) => one.trim() === selector));

/** The last word on `property` for `selector` — source order decides, these all tie on weight. */
function declared(selector, property) {
  let answer;
  for (const rule of rulesFor(selector)) {
    if (rule.declarations.has(property)) answer = rule.declarations.get(property);
  }
  return answer;
}

/** `1.05rem` -> 16.8. Only the units this stylesheet uses; anything else is a test that must grow. */
function toPixels(value) {
  const match = /^([\d.]+)(rem|px|em)$/.exec(value ?? "");
  assert.ok(match, `not a length this reader understands: ${JSON.stringify(value)}`);
  return match[2] === "px" ? Number(match[1]) : Number(match[1]) * 16;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE HEADING LADDER
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** What the painter can emit: `#` demotes one level and clamps at 6 — app/present/paint.ts. */
const DEMOTED_RANGE = ["h2", "h3", "h4", "h5", "h6"];

describe("the heading ladder", () => {
  test("every heading the painter can emit is styled, none left to the browser", () => {
    // THE DEFECT ITSELF. `.viewbody h4` did not exist, so `### Later` was drawn by the user
    // agent stylesheet — bold 700 at 1em — while `## Today` was this page's dim .92rem <h3>.
    for (const level of DEMOTED_RANGE) {
      assert.ok(
        declared(`.viewbody ${level}`, "font-size") !== undefined,
        `.viewbody ${level} has no font-size, so it falls through to the browser default`,
      );
      assert.ok(
        declared(`.viewbody ${level}`, "color") !== undefined,
        `.viewbody ${level} has no colour, so it cannot take its place in the ladder`,
      );
    }
  });

  test("the range is strictly decreasing in size — ## outranks ###", () => {
    const sizes = DEMOTED_RANGE.map((level) => toPixels(declared(`.viewbody ${level}`, "font-size")));
    for (let i = 1; i < sizes.length; i += 1) {
      assert.ok(
        sizes[i] < sizes[i - 1],
        `${DEMOTED_RANGE[i]} is ${sizes[i]}px and ${DEMOTED_RANGE[i - 1]} is ${sizes[i - 1]}px — ` +
          `a deeper heading must not be larger than the one it sits under`,
      );
    }
  });

  test("no heading is bolder than the one it sits under", () => {
    const weights = DEMOTED_RANGE.map((level) => {
      const weight = declared(`.viewbody ${level}`, "font-weight");
      assert.ok(weight !== undefined, `.viewbody ${level} has no font-weight`);
      return Number(weight);
    });
    for (let i = 1; i < weights.length; i += 1) {
      assert.ok(weights[i] <= weights[i - 1], `${DEMOTED_RANGE[i]} is bolder than ${DEMOTED_RANGE[i - 1]}`);
    }
  });

  test("no rule for a heading the painter cannot emit", () => {
    // `Math.min(hashes + 1, 6)` with at least one hash never produces an <h1>. A `.viewbody h1`
    // rule is therefore a rule nothing can ever match, and this repo does not keep those.
    for (const rule of RULES) {
      for (const one of rule.selector.split(",")) {
        assert.ok(
          !/^\.viewbody\b.*\bh1\b/.test(one.trim()),
          `dead rule: ${one.trim()} — the painter clamps headings to h2..h6`,
        );
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ONE ROW GEOMETRY, TWO RENDITIONS
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Every element the painter appends as a direct child of `.viewbody`. app/present/paint.ts. */
const PAINTED_LINES = [
  { tag: "h2" }, { tag: "h3" }, { tag: "h4" }, { tag: "h5" }, { tag: "h6" },
  { tag: "label", classes: ["task"] },
  { tag: "label", classes: ["task", "done"] },
  { tag: "div" },
  { tag: "input", classes: ["rawline"] },
];

/** Everything a painted line sits inside, from app/index.html's own markup. */
const ANCESTORS = [
  { tag: "html" },
  { tag: "body" },
  { tag: "div", classes: ["wrap"] },
  { tag: "section", id: "graph" },
  { tag: "article", id: "viewBody", classes: ["viewbody"] },
];

/** One compound selector (`input.rawline:focus`, `*`, `.task`, `#freshness`), taken apart. */
function readCompound(compound) {
  const bare = compound.replace(/::?[a-z-]+(\([^)]*\))?/g, "");
  assert.ok(!bare.includes("["), `this reader does not understand attribute selectors: ${compound}`);
  return {
    tag: /^[a-z0-9]+/.exec(bare)?.[0],
    id: /#([a-zA-Z0-9_-]+)/.exec(bare)?.[1],
    classes: [...bare.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]),
  };
}

/** Does a compound match an element? */
function compoundMatches(compound, element) {
  const want = readCompound(compound);
  if (want.tag !== undefined && want.tag !== element.tag) return false;
  if (want.id !== undefined && want.id !== element.id) return false;
  return want.classes.every((name) => (element.classes ?? []).includes(name));
}

/**
 * Can this selector reach a painted line?
 *
 * Its LAST compound has to match one of them, and every compound to its left has to match
 * something the line actually sits inside. That is what separates `.viewbody input.rawline`
 * (a line) from `.viewbody .task input` (the checkbox inside one), `.rest h3` (a heading on a
 * different screen entirely) and `#freshness` (the line above the column).
 *
 * Ancestor ORDER is not checked, which errs toward calling more rules reachable than really are —
 * the safe direction for a test whose job is to catch a rule that reaches a line unnoticed.
 */
function canReachALine(selector) {
  const compounds = selector.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const last = compounds[compounds.length - 1];
  if (!PAINTED_LINES.some((line) => compoundMatches(last, line))) return false;
  return compounds.slice(0, -1).every(
    (compound) => compound === "*" || ANCESTORS.some((up) => compoundMatches(compound, up)),
  );
}

/** Which painted lines a selector can reach, by index into PAINTED_LINES. */
function linesReached(selector) {
  if (!canReachALine(selector)) return [];
  const compounds = selector.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const last = compounds[compounds.length - 1];
  return PAINTED_LINES.map((line, i) => (compoundMatches(last, line) ? i : -1)).filter((i) => i >= 0);
}

/** [ids, classes, elements] — enough to say which of two rules wins. */
function specificity(selector) {
  let ids = 0, classes = 0, elements = 0;
  for (const compound of selector.split(/\s*[>+~]\s*|\s+/).filter(Boolean)) {
    const read = readCompound(compound);
    if (read.id !== undefined) ids += 1;
    classes += read.classes.length;
    if (read.tag !== undefined) elements += 1;
    classes += (compound.match(/(?<!:):[a-z-]+(\([^)]*\))?/g) ?? []).length;
  }
  return [ids, classes, elements];
}

const outranks = (a, b) => {
  const left = specificity(a), right = specificity(b);
  for (let i = 0; i < 3; i += 1) if (left[i] !== right[i]) return left[i] > right[i];
  return true; // a tie goes to whichever comes later, and the column's rules are last in the file
};

/** The properties that decide how much vertical room a line takes. */
const BOX_PROPERTIES = [
  "margin", "margin-top", "margin-bottom", "margin-block", "margin-block-start", "margin-block-end",
  "padding", "padding-top", "padding-bottom", "padding-block",
  "height", "min-height", "max-height", "line-height",
];

/** The row, and only the row. `0` is "takes no room", which is the same for every rendition. */
const ROW_VALUES = new Set(["0", "0px", "0 0", "var(--row)"]);

/** The two rules that are allowed to state the row for everything at once. */
const SHARED_ROW_RULE = ".viewbody > *";
const SHARED_GAP_RULE = ".viewbody > * + *";

describe("one row geometry, two renditions", () => {
  test("the row and the gap between rows are each declared exactly once", () => {
    for (const token of ["--row", "--row-gap"]) {
      const declarations = RULES.filter((rule) => rule.declarations.has(token));
      assert.equal(
        declarations.length, 1,
        `${token} is declared ${declarations.length} times — a row that is stated twice is a row ` +
          "that can drift apart",
      );
      assert.equal(declarations[0].selector, ".viewbody", `${token} belongs to the reading column`);
    }
  });

  test("the row is stated once, for every child of the column", () => {
    assert.equal(declared(SHARED_ROW_RULE, "min-height"), "var(--row)");
    assert.equal(declared(SHARED_ROW_RULE, "margin"), "0");
    assert.equal(declared(".viewbody", "line-height"), "var(--row)");
  });

  test("the space between lines belongs to the column, not to any line", () => {
    // A margin on a heading is a margin the <input> that replaces it does not have. The gap is
    // therefore owned by the position between two lines, which survives either rendition sitting
    // in it.
    assert.equal(declared(SHARED_GAP_RULE, "margin-top"), "var(--row-gap)");
    for (const rule of RULES) {
      if (rule.selector === SHARED_GAP_RULE) continue;
      for (const [property, value] of rule.declarations) {
        assert.ok(
          !String(value).includes("var(--row-gap)"),
          `${rule.selector} { ${property} } takes the gap for itself — only ${SHARED_GAP_RULE} may`,
        );
      }
    }
  });

  test("no painted line declares a box of its own", () => {
    // THE INVARIANT THE ZERO MEASUREMENT RESTS ON. If no rule that can match a painted line
    // states a vertical box property except as the shared row (or as nothing at all), then every
    // rendition of a line has the same box, and swapping one for another moves nothing below it.
    const offences = [];
    for (const rule of RULES) {
      for (const piece of rule.selector.split(",")) {
        const selector = piece.trim();
        if (selector === SHARED_ROW_RULE || selector === SHARED_GAP_RULE) continue;
        if (!selector.includes(".viewbody")) continue;
        if (!canReachALine(selector)) continue;
        for (const property of BOX_PROPERTIES) {
          if (!rule.declarations.has(property)) continue;
          const value = rule.declarations.get(property);
          if (ROW_VALUES.has(value)) continue;
          offences.push(`${selector} { ${property}: ${value} }`);
        }
      }
    }
    assert.deepEqual(
      offences, [],
      "these give one rendition of a line a box the others do not have, which is the jump",
    );
  });

  test("nothing outside the reading column reaches a line's box unanswered", () => {
    // The invariant above is about the column's own rules. This page also has page-wide rules —
    // `input { padding: .75rem .9rem }` is written for the sign-in box and reaches `input.rawline`
    // as well — and one of those left unanswered would give the raw rendition a box the wired one
    // does not have, from outside the column, where nobody would look for it.
    const answered = (lineIndex, property) =>
      RULES.some((rule) =>
        rule.declarations.has(property) &&
        rule.selector.split(",").some((piece) => {
          const selector = piece.trim();
          return selector.includes(".viewbody") && linesReached(selector).includes(lineIndex);
        }),
      );

    const offences = [];
    for (const rule of RULES) {
      for (const piece of rule.selector.split(",")) {
        const selector = piece.trim();
        if (selector.includes(".viewbody")) continue;
        for (const property of BOX_PROPERTIES) {
          if (!rule.declarations.has(property)) continue;
          for (const lineIndex of linesReached(selector)) {
            const line = PAINTED_LINES[lineIndex];
            const covering = RULES.filter((other) =>
              other.declarations.has(property) &&
              other.selector.split(",").some((one) =>
                one.trim().includes(".viewbody") && linesReached(one.trim()).includes(lineIndex) &&
                outranks(one.trim(), selector)),
            );
            if (!answered(lineIndex, property) || covering.length === 0) {
              offences.push(`${selector} { ${property} } reaches ${line.tag}.${(line.classes ?? []).join(".")}`);
            }
          }
        }
      }
    }
    assert.deepEqual(offences, [], "the reading column does not answer these");
  });

  test("the raw rendition wears the row it replaced, not a form control's", () => {
    const RAW = ".viewbody input.rawline";
    // ONE. The same metrics as the rendered line. `ui-monospace` at `.92em` was a different
    // typeface at a different size, so the line changed width AND height the moment it focused.
    assert.equal(declared(RAW, "font"), "inherit");
    for (const property of ["font-family", "font-size", "font-weight"]) {
      assert.equal(
        declared(RAW, property), undefined,
        `${RAW} sets ${property} after \`font: inherit\`, which is how the metrics diverge again`,
      );
    }
    // TWO. The row's height, exactly — an <input> cannot grow, so it is told the row rather than
    // left to a user agent's idea of a text field.
    assert.equal(declared(RAW, "height"), "var(--row)");
    assert.equal(declared(RAW, "line-height"), "var(--row)");
    // …and no padding of its own, which also answers the page-wide `input` rule written for the
    // sign-in box. Without this the raw rendition would wear a form control's .75rem of padding.
    assert.equal(declared(RAW, "padding"), "0");
    // THREE. No margin of its own. The gap rule above owns it, and `margin` here would out-weigh
    // that rule (two classes and an element beats one class) and silently take the gap away.
    for (const property of ["margin", "margin-top", "margin-bottom"]) {
      assert.equal(declared(RAW, property), undefined, `${RAW} must leave the gap to the column`);
    }
  });

  test("a token rendition inside a line claims no more of the row than the row has", () => {
    // THE SECOND WAY IN. The row invariant above is about the elements a line IS. A tag paints as
    // a chip INSIDE one, and an atomic inline has to fit the line box whole — content, padding and
    // border — so a chip can make its line taller than the same line without one. It did: at the
    // `line-height: 1.45` the chip shipped with, a chipped line measured 24.0199px against
    // 23.9986px, which is the jump again in miniature and it accumulates down a view full of tags.
    const CHIP = ".viewbody .tagchip";
    assert.ok(rulesFor(CHIP).length > 0, "the tag chip has no rule at all");

    // ATOMIC, and for a reason that is not this test's: a `line-through` on `.task.done span`
    // propagates to every descendant and only an ATOMIC inline is exempt. `display: inline` would
    // make the chip cost the row nothing AND draw the strike straight across the pill, so the two
    // constraints are held together or not at all.
    assert.equal(declared(CHIP, "display"), "inline-block");
    assert.ok(
      rulesFor(".viewbody .task.done span .tagchip").length > 0,
      "the chip is atomic for the sake of a rule that no longer exists — remove one, remove both",
    );

    // Its own box is its text's content area, which the row already contains. A unitless
    // line-height at or below 1 is what keeps that true whatever the reader's font turns out to be.
    const lineHeight = declared(CHIP, "line-height");
    assert.match(String(lineHeight), /^[\d.]+$/, `${CHIP} line-height must be a unitless number`);
    assert.ok(Number(lineHeight) <= 1, `${CHIP} line-height is ${lineHeight}, which can outgrow the row`);

    // What is left is padding and border, which an atomic inline DOES have to count — so nothing
    // may hand the chip a box of its own on top of them.
    for (const property of ["margin", "margin-top", "margin-bottom", "height", "min-height"]) {
      assert.equal(declared(CHIP, property), undefined, `${CHIP} sets ${property}, which the row cannot absorb`);
    }
  });

  test("the declared green is named once", () => {
    // brand/BRAND.md section 2 declares it. The chip and the caret are the two things on this page
    // drawn in it, and a second literal is how two greens drift into being one wrong one.
    const literals = RULES.flatMap((rule) =>
      [...rule.declarations].filter(([, value]) => /#3ff07f/i.test(value)).map(([property]) => `${rule.selector} { ${property} }`),
    );
    assert.deepEqual(literals, [":root { --green }"], "the declared green belongs to one token");
  });

  test("the cursor is marked without a slab of background", () => {
    const FOCUSED = ".viewbody input.rawline:focus";
    assert.ok(rulesFor(FOCUSED).length > 0, "the focused line has no rule at all");
    for (const property of ["background", "background-color", "background-image"]) {
      assert.equal(
        declared(FOCUSED, property), undefined,
        `${FOCUSED} paints a full-width band where the reading column had none`,
      );
    }
    // What marks it instead costs no layout: a caret and an inset hairline.
    assert.equal(declared(".viewbody input.rawline", "caret-color"), "var(--green)");
    assert.ok(
      String(declared(FOCUSED, "box-shadow")).startsWith("inset "),
      "an outer shadow is drawn outside the row, which is the band again by another name",
    );
  });
});

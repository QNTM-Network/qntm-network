/**
 * THE Q-MARK — the settled geometry, and the motion that has to end in it.
 *
 *   node --test tests/qmark-mark.test.mjs
 *
 * The mark is app/mark/qmark.html (one line of inline SVG) and app/mark/qmark.css (its own
 * stylesheet, and the whole of the motion). brand/BRAND.md settled what it IS on 2026-06-27 —
 * "the Q = ring + electron … Literal Q wins over pure atom/node … Treatment is MONO" — and
 * brand/qmark-lab.html holds the numbers. This suite exists because an animated logo has exactly
 * one way to fail that nobody notices in review: it can end up a pixel off the mark it is
 * supposed to BE, and then the brand is one thing in the lab and another thing on the site.
 *
 * ── WHAT IS ASSERTED, AND WHY IT IS NOT STRING MATCHING ──
 *
 * The motion is not read, it is COMPUTED. The keyframes' rotations are parsed out and APPLIED to
 * the electron's centre, so what these tests hold is where the electron actually is at the first
 * frame and at the last — a position, in the mark's own 100-unit coordinates, not the text of a
 * transform. `to { rotate(0deg) }` passing is not the point; (71,71) is the point.
 *
 * The lab's numbers are not copied here either. brand/qmark-lab.html is READ, and the component is
 * compared against what it says. Re-dial the lab and this suite tells you the mark has drifted
 * from it — which is the only way "read the lab's values, do not decide them" can be a fact about
 * the repo rather than a promise in a commit message. The three dials still open in BRAND.md §5
 * (ring thickness, mono luminance, wordmark kerning) are tracked, not fixed: change them in the
 * lab and change them in the component, and this stays green. Change one, and it does not.
 *
 * ── WHY THERE IS NO BROWSER HERE ──
 *
 * Same reason as tests/app-view-rows.test.mjs: this repo has no browser in CI. The motion WAS
 * measured in one (the easing decision in qmark.css's header is a measurement, not a taste), and
 * what CI holds is the invariants that make the measurement come out right — the end state is the
 * markup, the animated property is a transform, and the transform is a pure rotation about the
 * ring's own centre. Those three together are equivalent to "the electron travels the ring and
 * lands on the tail", and unlike a screenshot they cannot pass for the wrong reason.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..");
const read = (...parts) => readFileSync(resolve(REPO, ...parts), "utf8");

const MARKUP = read("app", "mark", "qmark.html");
const SHEET = read("app", "mark", "qmark.css");
const LAB = read("brand", "qmark-lab.html");
const HARNESS = read("brand", "qmark-motion.html");
const TOKENS = read("docs", "implementation-artifacts", "research-polish-direction.md");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// READERS
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The attributes of the first `<tag …>` whose attribute text contains `needle`. */
function element(html, tag, needle) {
  for (const [, body] of html.matchAll(new RegExp(`<${tag}\\s([^>]*)>`, "g"))) {
    if (!body.includes(needle)) continue;
    const attributes = new Map();
    for (const [, name, value] of body.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attributes.set(name, value);
    return attributes;
  }
  assert.fail(`no <${tag}> carrying ${JSON.stringify(needle)}`);
}

/** A number off an attribute, or off a `--custom-property: 8` declaration. */
const number = (value, what) => {
  assert.match(String(value), /^-?[\d.]+$/, `${what} is not a bare number: ${JSON.stringify(value)}`);
  return Number(value);
};

/**
 * A stylesheet as a flat list of rules, each carrying the at-rules it sits inside.
 *
 * Unlike the reader in tests/app-view-rows.test.mjs this one has to understand `@keyframes`,
 * because the keyframes ARE the thing under test — the percentage selectors it refuses over
 * there are exactly the frames whose transforms get applied to the electron below.
 */
function rules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  const walk = (text, context) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open === -1) return;
      let depth = 0, close = open;
      for (; close < text.length; close += 1) {
        if (text[close] === "{") depth += 1;
        else if (text[close] === "}") { depth -= 1; if (depth === 0) break; }
      }
      assert.ok(depth === 0, "unbalanced braces");
      const head = text.slice(i, open).trim().replace(/\s+/g, " ");
      const body = text.slice(open + 1, close);
      if (head.startsWith("@")) walk(body, [...context, head]);
      else {
        const declarations = new Map();
        for (const piece of body.split(";")) {
          const at = piece.indexOf(":");
          if (at === -1) continue;
          declarations.set(piece.slice(0, at).trim(), piece.slice(at + 1).trim());
        }
        out.push({ selector: head, declarations, context });
      }
      i = close + 1;
    }
  };
  walk(clean, []);
  return out;
}

const RULES = rules(SHEET);

/** Every rule for `selector`, optionally only those inside an at-rule matching `within`. */
const rulesFor = (selector, within) =>
  RULES.filter((rule) =>
    rule.selector.split(",").some((one) => one.trim() === selector) &&
    (within === undefined
      ? rule.context.length === 0
      : rule.context.some((at) => at.replace(/\s+/g, " ") === within)));

/** The last word on `property` for `selector` at the top level of the sheet. */
function declared(selector, property) {
  let answer;
  for (const rule of rulesFor(selector)) if (rule.declarations.has(property)) answer = rule.declarations.get(property);
  return answer;
}

/** `var(--qmark-ink, #e9eee9)` -> "#e9eee9". The default a host has not overridden. */
function fallbackOf(value, token) {
  const match = new RegExp(`var\\(\\s*${token}\\s*,\\s*([^)]+)\\)`).exec(String(value));
  assert.ok(match, `${JSON.stringify(value)} does not read ${token} with a fallback`);
  return match[1].trim();
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE MARK, AND THE LAB IT WAS READ OFF
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The component's own two circles, and the group the electron travels in. */
const SVG = element(MARKUP, "svg", 'class="qmark-svg"');
const RING = element(MARKUP, "circle", 'class="qmark-ring"');
const ELECTRON = element(MARKUP, "circle", 'class="qmark-electron"');

/** brand/qmark-lab.html:134 — the live playground's mark, and the `:root` dials that dress it. */
const LAB_SVG = element(LAB, "svg", 'class="qmark"');
const LAB_RING = element(LAB, "circle", 'class="ring"');
const LAB_ELECTRON = element(LAB, "circle", 'class="electron"');
const labDial = (name) => {
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(LAB);
  assert.ok(match, `brand/qmark-lab.html no longer declares ${name}`);
  return match[1].trim();
};

const CENTRE = { x: number(RING.get("cx"), "ring cx"), y: number(RING.get("cy"), "ring cy") };
const RADIUS = number(RING.get("r"), "ring r");
const TAIL = { x: number(ELECTRON.get("cx"), "electron cx"), y: number(ELECTRON.get("cy"), "electron cy") };

describe("the settled mark is the lab's mark", () => {
  test("the box, the ring and the electron are the lab's, to the digit", () => {
    assert.equal(SVG.get("viewBox"), LAB_SVG.get("viewBox"), "a different coordinate box is a different mark");
    assert.equal(RING.get("cx"), LAB_RING.get("cx"));
    assert.equal(RING.get("cy"), LAB_RING.get("cy"));
    assert.equal(RING.get("r"), LAB_RING.get("r"));
    // THE ONE THAT MATTERS. (71,71) is the tail; anywhere else on this ring and the mark is an O.
    assert.equal(ELECTRON.get("cx"), LAB_ELECTRON.get("cx"), "the electron is not at the lab's tail");
    assert.equal(ELECTRON.get("cy"), LAB_ELECTRON.get("cy"), "the electron is not at the lab's tail");
    assert.deepEqual(TAIL, { x: 71, y: 71 });
  });

  test("the three open dials carry the lab's current positions and are not decided here", () => {
    // BRAND.md §5 still has thickness and mono luminance open. They are tokens with the lab's
    // values as fallbacks, so settling them is an edit in two files and never a redesign.
    assert.equal(ELECTRON.get("r"), labDial("--er"), "electron radius has drifted from the lab's --er");
    assert.equal(fallbackOf(declared(".qmark-ring", "stroke-width"), "--qmark-ring-width"), labDial("--thick"));
    assert.equal(fallbackOf(declared(".qmark-ring", "stroke"), "--qmark-ink"), labDial("--mc"));
    assert.equal(fallbackOf(declared(".qmark-electron", "fill"), "--qmark-ink"), labDial("--mc"));
  });

  test("MONO — the ring and the electron cannot be two colours", () => {
    // brand/BRAND.md 2026-06-27: "Treatment is MONO (ring and electron one colour)." One token,
    // read twice, is what makes that structural rather than a coincidence of two literals.
    assert.match(String(declared(".qmark-ring", "stroke")), /var\(--qmark-ink/);
    assert.match(String(declared(".qmark-electron", "fill")), /var\(--qmark-ink/);
    assert.equal(declared(".qmark-ring", "fill"), "none", "a filled ring is a disc, not a Q");
    const literals = RULES.flatMap((rule) =>
      [...rule.declarations].filter(([, v]) => /#[0-9a-f]{3,8}\b/i.test(v)).map(([p]) => `${rule.selector} { ${p} }`));
    assert.deepEqual(
      literals, [".qmark-ring { stroke }", ".qmark-electron { fill }"],
      "the only colours in this sheet are the two readings of the one mono token",
    );
  });

  test("the tail sits on the ring, at 45°", () => {
    const dx = TAIL.x - CENTRE.x, dy = TAIL.y - CENTRE.y;
    const distance = Math.hypot(dx, dy);
    // 21√2 = 29.698 against r=30 — the lab rounded 71.213 to 71, and that is the mark.
    assert.ok(Math.abs(distance - RADIUS) < 0.5, `the electron is ${distance} from the centre, the ring is ${RADIUS}`);
    assert.equal(Math.round(Math.atan2(dy, dx) * 180 / Math.PI), 45, "the tail is 45° down-right, or it is not a tail");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE MOTION, COMPUTED
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The `@keyframes qmark-orbit` block, as [offset, declarations] in source order. */
const KEYFRAMES = (() => {
  const frames = RULES.filter((rule) => rule.context.some((at) => at === "@keyframes qmark-orbit"));
  assert.ok(frames.length > 0, "there is no @keyframes qmark-orbit — the mark does not move at all");
  return frames;
})();

/** `rotate(-540deg)` -> -540. Anything that is not exactly one rotation is a failure, not a parse. */
function rotationOf(transform, where) {
  const match = /^rotate\(\s*(-?[\d.]+)deg\s*\)$/.exec(String(transform).trim());
  assert.ok(match, `${where} is not a single rotation: ${JSON.stringify(transform)}`);
  return Number(match[1]);
}

/** Where the electron is, in the mark's own 100-unit box, after `degrees` of the orbit's rotation. */
function electronAfter(degrees) {
  const t = degrees * Math.PI / 180;
  const dx = TAIL.x - CENTRE.x, dy = TAIL.y - CENTRE.y;
  return {
    x: CENTRE.x + dx * Math.cos(t) - dy * Math.sin(t),
    y: CENTRE.y + dx * Math.sin(t) + dy * Math.cos(t),
  };
}

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} is not ${b}`);

describe("the electron starts away from the tail and ends on it", () => {
  test("the reveal is exactly two frames, and both are pure rotations", () => {
    assert.equal(KEYFRAMES.length, 2, "an orbit with a waypoint in it is an orbit that can miss the ring");
    assert.deepEqual(KEYFRAMES.map((f) => f.selector), ["from", "to"]);
    for (const frame of KEYFRAMES) {
      assert.deepEqual([...frame.declarations.keys()], ["transform"],
        `${frame.selector} animates something other than a transform`);
      rotationOf(frame.declarations.get("transform"), frame.selector);
    }
  });

  test("it ENDS at the tail — and ends there by ending, not by landing on it", () => {
    const end = rotationOf(KEYFRAMES[1].declarations.get("transform"), "to");
    assert.equal(end, 0, "the last frame is not the identity transform, so the settled mark is animated state");
    const at = electronAfter(end);
    near(at.x, TAIL.x, "the electron does not finish at the tail's x");
    near(at.y, TAIL.y, "the electron does not finish at the tail's y");
  });

  test("it STARTS at the antipode of the tail — the furthest point on the ring from it", () => {
    const start = rotationOf(KEYFRAMES[0].declarations.get("transform"), "from");
    const at = electronAfter(start);
    const away = Math.hypot(at.x - TAIL.x, at.y - TAIL.y);
    assert.ok(away > 1, `the electron starts ${away} from the tail, which is not "away" from anything`);
    // 540° is a lap and a half: a whole number of turns would have to start AT the tail.
    assert.notEqual(((start % 360) + 360) % 360, 0, "a whole number of turns starts where it ends");
    near(at.x, 29, "the start is not the antipode");
    near(at.y, 29, "the start is not the antipode");
    near(away, 2 * Math.hypot(TAIL.x - CENTRE.x, TAIL.y - CENTRE.y), "the antipode is a diameter away");
    assert.ok(Math.abs(start) >= 360, "less than a full turn is a nudge, not a trip round the ring");
  });

  test("the path is the ring itself, at every moment in between", () => {
    // A rotation about the ring's own centre cannot leave the ring, so the assertion that matters
    // is that the rotation IS about the ring's own centre. `transform-box: view-box` makes
    // `50% 50%` mean the middle of the 100-unit box, which is where the ring's cx/cy are.
    assert.equal(declared(".qmark-orbit", "transform-box"), "view-box");
    assert.equal(declared(".qmark-orbit", "transform-origin"), "50% 50%");
    const [, , width, height] = String(SVG.get("viewBox")).split(/\s+/).map(Number);
    assert.deepEqual({ x: width / 2, y: height / 2 }, CENTRE, "the box's middle is not the ring's centre");
    const start = rotationOf(KEYFRAMES[0].declarations.get("transform"), "from");
    const radius = Math.hypot(TAIL.x - CENTRE.x, TAIL.y - CENTRE.y);
    for (let step = 0; step <= 24; step += 1) {
      const at = electronAfter(start * (1 - step / 24));
      near(Math.hypot(at.x - CENTRE.x, at.y - CENTRE.y), radius, `off the ring ${step}/24 of the way round`);
    }
  });

  test("the duration and the curve are the declared tokens, not new numbers", () => {
    const animation = String(declared(".qmark-orbit", "animation"));
    assert.match(animation, /^qmark-orbit\s/, "the orbit runs something other than its own keyframes");
    const token = (name) => {
      const match = new RegExp(`^${name}:\\s*(\\S+)`, "m").exec(TOKENS);
      assert.ok(match, `research-polish-direction.md no longer declares ${name}`);
      return match[1];
    };
    assert.equal(fallbackOf(animation, "--motion-reveal"), token("--motion-reveal"));
    assert.equal(fallbackOf(animation, "--ease"), token("--ease"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// IT CANNOT COST LAYOUT
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Anything whose value the browser has to re-lay-out the page to satisfy. */
const LAYOUT_PROPERTIES = [
  "width", "height", "inline-size", "block-size", "min-height", "max-height", "min-width", "max-width",
  "margin", "margin-top", "margin-bottom", "margin-left", "margin-right", "margin-block", "margin-inline",
  "padding", "padding-top", "padding-bottom", "padding-left", "padding-right", "padding-block", "padding-inline",
  "font-size", "line-height", "top", "left", "right", "bottom", "inset", "border-width", "stroke-width",
  "display", "position", "flex", "flex-basis", "gap", "r", "cx", "cy",
];

describe("the reveal cannot move anything on the page it lands in", () => {
  test("no keyframe touches a property that costs layout", () => {
    for (const frame of KEYFRAMES) {
      for (const property of frame.declarations.keys()) {
        assert.ok(!LAYOUT_PROPERTIES.includes(property), `@keyframes ${frame.selector} { ${property} } reflows`);
        assert.equal(property, "transform", `@keyframes ${frame.selector} animates ${property}`);
      }
    }
  });

  test("the sheet has no transitions at all, so nothing can acquire one by accident", () => {
    const offences = RULES.flatMap((rule) =>
      [...rule.declarations.keys()].filter((p) => p === "transition" || p.startsWith("transition-"))
        .map((p) => `${rule.selector} { ${p} }`));
    assert.deepEqual(offences, [], "a transition here is a second, unmeasured piece of motion");
  });

  test("only the orbit group is animated, and it is inside the svg", () => {
    const animated = RULES.filter((rule) => rule.declarations.has("animation") && rule.declarations.get("animation") !== "none");
    assert.deepEqual(animated.map((rule) => rule.selector), [".qmark-orbit"]);
    // Structural: the <g> that moves is a child of the <svg>, so its transform is resolved inside
    // the SVG's own viewport and the element the page laid out — the <span> — never changes size.
    assert.match(MARKUP, /<svg[^>]*class="qmark-svg"[\s\S]*<g class="qmark-orbit">[\s\S]*<\/svg>/);
    assert.match(String(declared(".qmark", "inline-size")), /^var\(--qmark-size,/);
    assert.match(String(declared(".qmark", "block-size")), /^var\(--qmark-size,/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE TWO WAYS IT DOES NOT RUN
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("asked not to move, and too small to be seen moving", () => {
  const REDUCED = "@media (prefers-reduced-motion: reduce)";
  const SMALL = "@container qmark (max-width: 20px)";

  test("reduced motion switches the orbit off — and off IS the settled mark", () => {
    const [rule] = rulesFor(".qmark-orbit", REDUCED);
    assert.ok(rule, `there is no ${REDUCED} block turning the orbit off`);
    assert.equal(rule.declarations.get("animation"), "none");
    // THE REASON ONE DECLARATION IS ENOUGH, and the thing that would silently break it: a
    // forwards fill. With `fill: forwards` the settled mark would be a held final keyframe, so
    // switching the animation off would no longer produce it — it would produce whatever the
    // markup says, which had better be the same thing. It is, and this keeps it that way.
    const animation = String(declared(".qmark-orbit", "animation"));
    for (const fill of ["forwards", "backwards", "both"]) {
      assert.ok(!animation.split(/\s+/).includes(fill),
        `the orbit fills ${fill}, so "no animation" and "the animation finished" are two different marks`);
    }
  });

  test("below 20px the orbit does not run, and the mark still does", () => {
    const [rule] = rulesFor(".qmark-orbit", SMALL);
    assert.ok(rule, `there is no ${SMALL} block — the flicker at favicon size is unguarded`);
    assert.equal(rule.declarations.get("animation"), "none");
    // It is the MARK's size that decides, not the viewport's: a 16px mark on a 27" display is
    // still 16px. That is a container query or it is a lie, so the container has to exist.
    assert.equal(declared(".qmark", "container-type"), "size");
    assert.equal(declared(".qmark", "container-name"), "qmark");
    // and nothing else is switched off with it — the ring and the electron are still drawn.
    for (const selector of [".qmark-ring", ".qmark-electron"]) {
      assert.deepEqual(rulesFor(selector, SMALL), [], `${selector} is altered at small sizes; the mark must not change`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ONE COPY OF THE MARKUP
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The component's one line, whitespace-normalised. */
const FRAGMENT = (() => {
  const match = /<span class="qmark"[\s\S]*?<\/span>/.exec(MARKUP);
  assert.ok(match, "app/mark/qmark.html no longer contains the mark");
  return match[0].replace(/\s+/g, " ");
})();

describe("the mark is written once", () => {
  test("app/mark/qmark.html holds exactly one of it", () => {
    assert.equal((MARKUP.match(/<span class="qmark"/g) ?? []).length, 1);
    assert.ok(!/<script/i.test(MARKUP), "the mark is markup; a logo that needs a script is absent for a frame");
    assert.ok(!/https?:\/\//.test(FRAGMENT), "the mark fetches something, and a fetch can 404");
  });

  test("the stylesheet fetches nothing either", () => {
    assert.ok(!/@import/.test(SHEET), "an @import is a dependency that can vanish");
    assert.ok(!/url\(\s*['"]?https?:/.test(SHEET), "the sheet reaches off-origin");
  });

  test("every mark on the harness page is that same one line, not a redrawing of it", () => {
    // The same shape as the committed-bundle staleness check: a thing copied into two places is a
    // thing that becomes two things, so the copies are held equal by CI rather than by care.
    const copies = HARNESS.replace(/\s+/g, " ").split(FRAGMENT).length - 1;
    assert.ok(copies > 0, "brand/qmark-motion.html does not contain the component's markup at all");
    assert.equal(
      (HARNESS.match(/<span class="qmark"/g) ?? []).length, copies,
      "brand/qmark-motion.html draws a mark that is not the component's — they have already drifted",
    );
  });

  test("the harness uses the shipped stylesheet rather than restating it", () => {
    assert.match(HARNESS, /<link rel="stylesheet" href="\.\.\/app\/mark\/qmark\.css"/);
    const own = /<style>([\s\S]*?)<\/style>/.exec(HARNESS)?.[1] ?? "";
    for (const selector of [".qmark-ring", ".qmark-electron", "@keyframes"]) {
      assert.ok(!own.includes(selector), `the harness restates ${selector}, so it is no longer showing the component`);
    }
  });
});

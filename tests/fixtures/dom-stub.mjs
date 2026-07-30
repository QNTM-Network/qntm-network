/**
 * The smallest document that satisfies what a painter touches — and a deterministic serialiser.
 *
 * Same posture as tests/flow_scenarios/render_and_edit.ts: the modules under test are REAL and
 * the browser is faked, with no more surface than the code under test actually reaches. What it
 * supports is exactly what `paintView` used and what `paint()` uses — createElement, className,
 * style.marginLeft, type, checked, innerHTML, textContent, append, addEventListener — and
 * nothing else, so a painter that starts reaching for the DOM in a new way fails loudly here
 * instead of being quietly accommodated.
 *
 * THE SERIALISER IS THE MEASURING INSTRUMENT, so it is worth being explicit about what it
 * measures. It emits every element's tag, every attribute-shaped property either painter sets,
 * and the full subtree in document order. Both painters are serialised by the same function
 * against the same stub, so a difference in the output is a difference in the DOM they built and
 * cannot be an artefact of how it was read.
 *
 * WHAT IT DOES NOT MEASURE, stated so nobody over-reads a green: event LISTENERS are counted but
 * their behaviour is not compared here (tests/present-cascade.test.mjs exercises the one listener
 * that exists), and this proves nothing about how a real browser lays the result out. The claim
 * is "these two functions build the same tree", which is exactly what byte-identical output
 * means for a painter.
 */

class StubElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.className = "";
    this.style = {};
    this.children = [];
    this.listeners = new Map();
    this.#innerHTML = "";
    this.#textContent = "";
  }

  #innerHTML;
  #textContent;

  // innerHTML and textContent both replace the element's content, so setting either clears any
  // children a previous assignment left behind — the same observable behaviour as the real DOM,
  // and the reason `body.innerHTML = ""` at the top of a paint actually empties the body.
  get innerHTML() {
    return this.#innerHTML;
  }

  set innerHTML(value) {
    this.#innerHTML = String(value);
    this.#textContent = "";
    this.children = [];
  }

  get textContent() {
    return this.#textContent;
  }

  set textContent(value) {
    this.#textContent = String(value);
    this.#innerHTML = "";
    this.children = [];
  }

  append(...nodes) {
    for (const node of nodes) {
      this.children.push(node);
    }
  }

  addEventListener(type, listener) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  /** Fire the handlers a painter registered — what makes an affordance test a real run. */
  dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }
}

/** A document with only `createElement`. Install it globally before running a painter. */
export function makeDocument() {
  return { createElement: (tagName) => new StubElement(tagName) };
}

export function makeBody() {
  return new StubElement("article");
}

/** Every element in document order — for finding the checkbox a test wants to click. */
export function walk(element, out = []) {
  for (const child of element.children) {
    out.push(child);
    walk(child, out);
  }
  return out;
}

/**
 * A deterministic, total rendering of one element and everything under it.
 *
 * Every field either painter can set appears on every line whether or not it was set, so an
 * omission reads as `""` rather than as an absent line that a diff might align past.
 */
export function serialize(element, depth = 0) {
  const pad = "  ".repeat(depth);
  const fields = [
    `tag=${element.tagName}`,
    `class=${JSON.stringify(element.className ?? "")}`,
    `marginLeft=${JSON.stringify(element.style?.marginLeft ?? "")}`,
    `type=${JSON.stringify(element.type ?? "")}`,
    `checked=${JSON.stringify(element.checked ?? "")}`,
    `disabled=${JSON.stringify(element.disabled ?? "")}`,
    `innerHTML=${JSON.stringify(element.innerHTML ?? "")}`,
    `textContent=${JSON.stringify(element.textContent ?? "")}`,
    `listeners=${JSON.stringify([...element.listeners.keys()].sort())}`,
  ];
  const lines = [`${pad}${fields.join(" ")}`];
  for (const child of element.children) {
    lines.push(serialize(child, depth + 1));
  }
  return lines.join("\n");
}

/**
 * A view chosen to reach every branch either painter has, and then some.
 *
 * Contains: unchecked and checked tasks at three indent depths; the `X` spelling of done; `#`
 * through `#######` so the heading demotion AND its clamp at 6 are both exercised, plus a
 * `#hashtag` with no space that must NOT be a heading; blank lines and a whitespace-only line;
 * prose, a bare list item, a table row, a horizontal rule, inline code, emphasis, a link; and a
 * real qntm line carrying a wiki-link, two tags and a marker with a date, because those are the
 * characters section 0.1 observed reaching the browser untouched and the change must keep them
 * untouched. Trailing newline included: the split leaves an empty final line, and whether that
 * vanishes is exactly the kind of thing an extraction gets wrong.
 */
export const VIEW_MARKDOWN = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29",
  "  - [ ] sub-step one [[qntm:122]] #task 🛫 2026-07-28",
  "    - [x] sub-sub-step done [[qntm:123]] #task ✅ 2026-07-27",
  "- [X] Capitalised done marker [[qntm:124]] #task",
  "",
  "### Due This Week",
  "#### deeper",
  "##### deeper still",
  "###### the clamp starts here",
  "####### seven hashes is not a heading",
  "#nospace is not a heading either",
  "",
  "Some **bold** text and `code` and a [link](https://qntm.network/).",
  "- a bare list item that is not a task",
  "| a | b |",
  "| --- | --- |",
  "| 1 | 2 |",
  "",
  "   ",
  "---",
  "- [ ] trailing task with no tail characters after it",
  "",
].join("\n");

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
    // A plain object, exactly like tests/fixtures/app-html-page.mjs's own element stub already
    // uses — `paint.ts`'s `data-instance` (instance.ts, R1 of
    // design-presentation-instance-identity.md) is the first thing in this bundle to set it, and a
    // painter reaching for a NEW piece of the DOM is supposed to fail loudly here rather than be
    // quietly accommodated (see this file's own header) — so it is added on purpose, not by
    // omission.
    this.dataset = {};
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
      node._parent = this;
    }
  }

  /**
   * The settle affordance's own reach — `paint.ts`'s `settleRow` is the first thing in this bundle
   * to reorder an already-appended child. Standard `Node` semantics: remove `node` from wherever it
   * already sits in THIS element's children, then splice it back in immediately before
   * `referenceNode`, or at the end when that is `null`/`undefined`.
   */
  insertBefore(node, referenceNode) {
    const at = this.children.indexOf(node);
    if (at !== -1) this.children.splice(at, 1);
    node._parent = this;
    if (referenceNode === null || referenceNode === undefined) {
      this.children.push(node);
      return node;
    }
    const refAt = this.children.indexOf(referenceNode);
    this.children.splice(refAt === -1 ? this.children.length : refAt, 0, node);
    return node;
  }

  /**
   * Where the row sits — a MINIMAL layout model, not real layout, and deliberately not a fixed
   * `_top` a test would have to set by hand before every read: `top` is derived from this
   * element's OWN INDEX among its current parent's children, times an arbitrary constant row
   * height. That is enough for `settleRow`'s FLIP arithmetic (`paint.ts`) to see a REAL, non-zero,
   * sign-correct delta the instant a reorder changes an element's index — read once before
   * `insertBefore`, once after, exactly as production code does — without this fixture pretending
   * to lay out text. A test wanting a SPECIFIC number sets `_top` directly, which this checks
   * first and which nothing here ever overwrites.
   */
  getBoundingClientRect() {
    const top = this._top ?? (this._parent ? this._parent.children.indexOf(this) * 24 : 0);
    return { top, left: 0, right: 0, bottom: top, width: 0, height: 0 };
  }

  addEventListener(type, listener) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  /**
   * Fire the handlers a painter registered — what makes an affordance test a real run.
   *
   * The event is passed through because the focus surface's handlers use it: a click on the text
   * of a task line calls preventDefault so the surrounding <label> does not also tick the box,
   * and a keydown reads `key`. A dispatch that supplied nothing would silently exercise a
   * different code path from the browser's.
   */
  dispatch(type, event = makeEvent()) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
    return event;
  }

  /** The cursor arriving. Recorded rather than simulated — the painter calls it, tests read it. */
  focus() {
    this.focused = true;
  }

  /** Where the caret landed. Recorded rather than simulated, same posture as `focus()` above. */
  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

/** An event carrying only what the painter's handlers touch. */
export function makeEvent(fields = {}) {
  return {
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    ...fields,
  };
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
    `value=${JSON.stringify(element.value ?? "")}`,
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

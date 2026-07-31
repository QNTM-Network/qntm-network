// app/present/levels.ts
var SPECIFICITY = [
  "FOCUS",
  "MODE",
  "LINE",
  "STRUCTURAL_NODE",
  "VIEW",
  "USER",
  "GLOBAL"
];
function isSilent(contribution) {
  return contribution === void 0 || Object.keys(contribution).length === 0;
}

// app/present/resolution.ts
var RESOLUTION_KEYS = [
  "checkbox",
  "heading",
  "prose",
  "tags"
];
var DEFAULT = Object.freeze({
  checkbox: "wired",
  heading: "wired",
  prose: "wired",
  tags: "raw"
});
var TASK = /^(\s*)- \[( |x|X)\] (.*)$/;
var HEADING = /^(#{1,6})\s+(.*)$/;
function classifyLine(line) {
  const task = TASK.exec(line);
  if (task !== null) {
    return {
      kind: "checkbox",
      source: line,
      indent: task[1] ?? "",
      done: (task[2] ?? "").toLowerCase() === "x",
      tail: task[3] ?? ""
    };
  }
  const heading = HEADING.exec(line);
  if (heading !== null) {
    return {
      kind: "heading",
      source: line,
      hashes: heading[1] ?? "",
      text: heading[2] ?? ""
    };
  }
  if (line.trim() === "") {
    return { kind: "blank", source: line };
  }
  return { kind: "prose", source: line };
}
var BULLET = /^(\s*)([-*+])(\s+|$)/;
var CHECKBOX_GLYPH = /^\[.\]\s*/;
function carriesContent(line) {
  const shape = classifyLine(line);
  if (shape.kind === "blank") {
    return false;
  }
  if (shape.kind === "heading") {
    return shape.text.trim() !== "";
  }
  return line.replace(BULLET, "").replace(CHECKBOX_GLYPH, "").trim() !== "";
}
function chromeOf(line) {
  const shape = classifyLine(line);
  if (shape.kind === "checkbox") {
    return shape.indent + "- [ ] ";
  }
  if (shape.kind !== "prose") {
    return null;
  }
  const bullet = BULLET.exec(line);
  if (bullet === null) {
    return null;
  }
  return (bullet[1] ?? "") + "- ";
}
var TAG = /(^|\s)#([a-zA-Z_][a-zA-Z0-9_-]*)/g;
function tagSpans(text) {
  const spans = [];
  for (const match of text.matchAll(TAG)) {
    const start = (match.index ?? 0) + (match[1] ?? "").length;
    const tag = "#" + (match[2] ?? "");
    spans.push({ start, end: start + tag.length, text: tag });
  }
  return spans;
}

// app/present/declaration.ts
var NOTE = "note";
var RENDITIONS = ["raw", "wired"];
function isRendition(value) {
  return typeof value === "string" && RENDITIONS.includes(value);
}
function readDeclaration(document2) {
  const problems = [];
  if (typeof document2 !== "object" || document2 === null || Array.isArray(document2)) {
    return {
      contribution: {},
      problems: [
        `the declaration is ${Array.isArray(document2) ? "an array" : typeof document2}, not an object \u2014 every key stays silent and every line falls through to the default`
      ]
    };
  }
  const entries = Object.entries(document2);
  const contribution = {};
  for (const [key, value] of entries) {
    if (key === NOTE) {
      if (typeof value !== "string") {
        problems.push(`'${NOTE}' is ${typeof value}, not a string \u2014 it is prose, not a key`);
      }
      continue;
    }
    if (!RESOLUTION_KEYS.includes(key)) {
      problems.push(
        `'${key}' is not a resolution key and was NOT applied \u2014 the keys are ${RESOLUTION_KEYS.join(", ")}`
      );
      continue;
    }
    if (!isRendition(value)) {
      problems.push(
        `'${key}' is ${JSON.stringify(value)}, which is not a rendition \u2014 it stays silent, so the key falls through to the default. The renditions are ${RENDITIONS.join(", ")}`
      );
      continue;
    }
    contribution[key] = value;
  }
  return { contribution, problems };
}

// app/present/context.ts
var PresentationContext = class _PresentationContext {
  #contributions;
  constructor(contributions = {}) {
    const entries = Object.entries(contributions);
    this.#contributions = new Map(
      entries.filter((entry) => entry[1] !== void 0)
    );
  }
  /**
   * What this level says, or `undefined` if it says nothing.
   *
   * The cascade is the only caller. It is a method rather than a public field so that the
   * cascade's read of a level is a real, observable call — `flow-trace` measures calls, and a
   * property read would make the edge between the resolver and the facts it resolves against
   * invisible to the thing that is supposed to be watching it.
   */
  at(level) {
    return this.#contributions.get(level);
  }
  /**
   * The same facts with one level replaced — a NEW context; this one never changes.
   *
   * DERIVED LEVELS NEED THIS AND DECLARED LEVELS DO NOT, which is the whole reason it exists.
   * GLOBAL, USER, VIEW and STRUCTURAL_NODE are read once from somewhere and hold still for the
   * whole paint, so the constructor is enough for them. FOCUS is a fact about ONE LINE AT ONE
   * INSTANT: it is true of the line under the cursor and false of the forty lines around it, and
   * a paint therefore needs forty-one slightly different contexts.
   *
   * Immutable on purpose. A mutable context would let the painter set FOCUS, paint, and forget to
   * unset it — and a resolver whose answer depends on what was asked before it is not a cascade,
   * it is a state machine wearing one. Every context handed to a cascade here is complete.
   */
  with(level, contribution) {
    const next = {};
    for (const [existing, said] of this.#contributions) {
      next[existing] = said;
    }
    if (contribution === void 0) {
      delete next[level];
    } else {
      next[level] = contribution;
    }
    return new _PresentationContext(next);
  }
};
function presentationFromDeclaration(document2) {
  const reading = readDeclaration(document2);
  return {
    context: new PresentationContext({ GLOBAL: reading.contribution }),
    problems: reading.problems
  };
}

// app/present/focus.ts
var FOCUSED = Object.freeze(
  Object.fromEntries(RESOLUTION_KEYS.map((key) => [key, "raw"]))
);
var FocusSurface = class {
  #lineIndex = null;
  /** The line the cursor is on, or `null` when it is nowhere. */
  get lineIndex() {
    return this.#lineIndex;
  }
  isFocused(lineIndex) {
    return this.#lineIndex === lineIndex;
  }
  /** Put the cursor on a line. One line at a time — there is one cursor. */
  focus(lineIndex) {
    this.#lineIndex = lineIndex;
  }
  /** Take the cursor off whatever it was on. */
  blur() {
    this.#lineIndex = null;
  }
  /**
   * The context to resolve ONE line against: the caller's facts, plus FOCUS if this is the line.
   *
   * The level name lives here rather than at the call site so the painter never has to know which
   * rung the cursor sits on — it hands over a line number and a context and gets a context back.
   */
  contextFor(lineIndex, base) {
    return base.with("FOCUS", this.isFocused(lineIndex) ? FOCUSED : void 0);
  }
};

// app/present/draft.ts
var DraftSurface = class {
  #draft = null;
  /** The line being made, or `null` when none is. */
  get draft() {
    return this.#draft;
  }
  /** Is a line being made AT this index? */
  isDraftAt(lineIndex) {
    return this.#draft?.lineIndex === lineIndex;
  }
  /** Open a line. One at a time — there is one cursor, and a draft always has it. */
  open(lineIndex, seed) {
    this.#draft = { lineIndex, seed };
  }
  /**
   * Abandon the line being made.
   *
   * NOT A DELETION, and the distinction is the whole point of this module: the line was never in
   * the file, so there is nothing to remove and no source edit to write down. Escape, Backspace on
   * an empty draft, and settling without having typed anything all land here.
   */
  drop() {
    this.#draft = null;
  }
};

// app/present/newline.ts
function seedFor(source, lineIndex) {
  const lines = source.split("\n");
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex > lines.length) {
    return null;
  }
  for (let at = lineIndex - 1; at >= 0; at -= 1) {
    const line = lines[at] ?? "";
    if (classifyLine(line).kind === "heading") {
      break;
    }
    const chrome = chromeOf(line);
    if (chrome !== null) {
      return { text: chrome, level: at === lineIndex - 1 ? "LINE" : "STRUCTURAL_NODE" };
    }
  }
  for (let at = lineIndex; at < lines.length; at += 1) {
    const line = lines[at] ?? "";
    if (classifyLine(line).kind === "heading") {
      break;
    }
    const chrome = chromeOf(line);
    if (chrome !== null) {
      return { text: chrome.trimStart(), level: "STRUCTURAL_NODE" };
    }
  }
  for (const line of lines) {
    const chrome = chromeOf(line);
    if (chrome !== null) {
      return { text: chrome.trimStart(), level: "VIEW" };
    }
  }
  return null;
}

// app/present/cascade.ts
var PresentationCascade = class {
  #context;
  constructor(context) {
    this.#context = context;
  }
  /**
   * Resolve one key. Most specific level that says anything wins; DEFAULT if none does.
   *
   * Deliberately the same shape as the engine's `ResolutionCascade.resolve` on the ingest side.
   * A reader who has understood one has understood both, and divergence between the two halves is
   * the failure this whole arc exists to avoid.
   */
  resolve(key) {
    for (const level of SPECIFICITY) {
      const contribution = this.#context.at(level);
      if (isSilent(contribution)) {
        continue;
      }
      const rendition = contribution?.[key];
      if (rendition === void 0) {
        continue;
      }
      return { rendition, level };
    }
    return { rendition: DEFAULT[key], level: "GLOBAL" };
  }
};

// app/present/source.ts
var CHECKBOX_GLYPH2 = /^(\s*- \[)[ xX](\] .*)$/;
function applyEdit(source, edit) {
  const lines = source.split("\n");
  if (edit.kind === "insert-line") {
    if (!Number.isInteger(edit.lineIndex) || edit.lineIndex < 0 || edit.lineIndex > lines.length) {
      return null;
    }
    if (edit.text.includes("\n") || edit.text.includes("\r")) {
      return null;
    }
    if (!carriesContent(edit.text)) {
      return null;
    }
    lines.splice(edit.lineIndex, 0, edit.text);
    return lines.join("\n");
  }
  const line = lines[edit.lineIndex];
  if (line === void 0) {
    return null;
  }
  if (edit.kind === "set-line") {
    if (edit.text === line) {
      return null;
    }
    if (edit.text.includes("\n") || edit.text.includes("\r")) {
      return null;
    }
    lines[edit.lineIndex] = edit.text;
    return lines.join("\n");
  }
  if (edit.kind !== "set-checkbox") {
    return null;
  }
  const match = CHECKBOX_GLYPH2.exec(line);
  if (match === null) {
    return null;
  }
  lines[edit.lineIndex] = (match[1] ?? "") + (edit.checked ? "x" : " ") + (match[2] ?? "");
  return lines.join("\n");
}

// app/present/paint.ts
function rawText(source) {
  const div = document.createElement("div");
  div.textContent = source;
  return div;
}
function rawInput(lineSource, lineIndex, fileSource, focus, deps, repaint, openLineAt) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "rawline";
  input.value = lineSource;
  let settled = false;
  const settle = (commit, openBelow = false) => {
    if (settled) {
      return;
    }
    settled = true;
    const wasFocused = focus.isFocused(lineIndex);
    if (wasFocused) {
      focus.blur();
    }
    if (!commit) {
      if (wasFocused) {
        repaint(fileSource);
      }
      return;
    }
    const text = input.value;
    const markdown = applyEdit(fileSource, { kind: "set-line", lineIndex, text });
    deps.onLineCommit?.({ lineIndex, text, markdown });
    const next = markdown ?? fileSource;
    const opened = openBelow ? openLineAt(lineIndex + 1, next) : false;
    if (markdown !== null || wasFocused || opened) {
      repaint(next);
    }
  };
  input.addEventListener("blur", () => settle(true));
  input.addEventListener("keydown", (event) => {
    const key = event?.key;
    if (key === "Enter") {
      event?.preventDefault?.();
      settle(true, true);
    } else if (key === "Escape") {
      event?.preventDefault?.();
      settle(false);
    }
  });
  return input;
}
function draftInput(lineIndex, seed, fileSource, draft, deps, repaint) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "rawline";
  input.value = seed;
  let settled = false;
  const abandon = () => {
    if (settled) {
      return;
    }
    settled = true;
    draft.drop();
    repaint(fileSource);
  };
  const settle = () => {
    if (settled) {
      return;
    }
    settled = true;
    const text = input.value;
    draft.drop();
    const markdown = applyEdit(fileSource, { kind: "insert-line", lineIndex, text });
    deps.onLineCommit?.({ lineIndex, text, markdown });
    repaint(markdown ?? fileSource);
  };
  input.addEventListener("blur", settle);
  input.addEventListener("keydown", (event) => {
    const key = event?.key;
    if (key === "Enter") {
      event?.preventDefault?.();
      settle();
    } else if (key === "Escape") {
      event?.preventDefault?.();
      abandon();
    } else if (key === "Backspace" && input.value === seed) {
      event?.preventDefault?.();
      abandon();
    }
  });
  return input;
}
var TAG_CHIP_CLASS = "tagchip";
var CHIP_OPEN = `<span class="${TAG_CHIP_CLASS}">`;
var CHIP_CLOSE = "</span>";
function renderTags(text, tags, render) {
  if (tags === "raw") {
    return render(text);
  }
  const spans = tagSpans(text);
  if (spans.length === 0) {
    return render(text);
  }
  let injected = "";
  let at = 0;
  for (const span of spans) {
    injected += text.slice(at, span.start) + CHIP_OPEN + span.text + CHIP_CLOSE;
    at = span.end;
  }
  injected += text.slice(at);
  const html = render(injected);
  return html.split(CHIP_OPEN).length - 1 === spans.length ? html : render(text);
}
function paint(body, source, context, deps) {
  const focus = deps.focus;
  const draft = deps.draft;
  const repaint = (nextSource) => {
    paint(body, nextSource, context, deps);
  };
  const focusable = (element, lineIndex) => {
    if (focus === void 0) {
      return;
    }
    element.addEventListener("click", (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      focus.focus(lineIndex);
      repaint(source);
    });
  };
  const openLineAt = (lineIndex, from) => {
    if (draft === void 0 || focus === void 0) {
      return false;
    }
    const seed = seedFor(from, lineIndex);
    if (seed === null) {
      deps.onNewLineDeclined?.(lineIndex);
      return false;
    }
    draft.open(lineIndex, seed.text);
    return true;
  };
  const raw = (lineSource, lineIndex) => {
    if (focus === void 0) {
      body.append(rawText(lineSource));
      return;
    }
    const input = rawInput(lineSource, lineIndex, source, focus, deps, repaint, openLineAt);
    body.append(input);
    if (focus.isFocused(lineIndex)) {
      input.focus?.();
    }
  };
  body.innerHTML = "";
  let draftPainted = false;
  const paintDraft = () => {
    const open = draft?.draft;
    if (open === void 0 || open === null || draftPainted) {
      return;
    }
    draftPainted = true;
    const input = draftInput(open.lineIndex, open.seed, source, draft, deps, repaint);
    body.append(input);
    input.focus?.();
  };
  let lastPaintedIndex = -1;
  source.split("\n").forEach((line, index) => {
    if (draft?.isDraftAt(index) === true) {
      paintDraft();
    }
    const shape = classifyLine(line);
    if (shape.kind === "blank") {
      return;
    }
    lastPaintedIndex = index;
    const cascade = new PresentationCascade(
      focus === void 0 ? context : focus.contextFor(index, context)
    );
    if (shape.kind === "checkbox") {
      if (cascade.resolve("checkbox").rendition === "raw") {
        raw(shape.source, index);
        return;
      }
      const row = document.createElement("label");
      row.className = "task" + (shape.done ? " done" : "");
      row.style.marginLeft = shape.indent.length / 2 * 1.2 + "rem";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = shape.done;
      box.addEventListener("change", () => {
        const markdown = applyEdit(source, {
          kind: "set-checkbox",
          lineIndex: index,
          checked: box.checked
        });
        deps.onCheckboxToggle?.({ lineIndex: index, checked: box.checked, markdown, box, row });
      });
      const span = document.createElement("span");
      span.innerHTML = renderTags(
        shape.tail,
        cascade.resolve("tags").rendition,
        (markdown) => deps.markdown.renderInline(markdown)
      );
      focusable(span, index);
      row.append(box, span);
      body.append(row);
      return;
    }
    if (shape.kind === "heading") {
      if (cascade.resolve("heading").rendition === "raw") {
        raw(shape.source, index);
        return;
      }
      const el = document.createElement("h" + String(Math.min(shape.hashes.length + 1, 6)));
      el.innerHTML = renderTags(
        shape.text,
        cascade.resolve("tags").rendition,
        (markdown) => deps.markdown.renderInline(markdown)
      );
      focusable(el, index);
      body.append(el);
      return;
    }
    if (cascade.resolve("prose").rendition === "raw") {
      raw(shape.source, index);
      return;
    }
    const div = document.createElement("div");
    div.innerHTML = renderTags(
      shape.source,
      cascade.resolve("tags").rendition,
      (markdown) => deps.markdown.render(markdown)
    );
    focusable(div, index);
    body.append(div);
  });
  paintDraft();
  if (draft !== void 0 && focus !== void 0) {
    const below = document.createElement("div");
    below.className = "newline";
    below.addEventListener("click", (event) => {
      event?.preventDefault?.();
      openLineAt(lastPaintedIndex + 1, source);
      repaint(source);
    });
    body.append(below);
  }
}
export {
  DEFAULT,
  DraftSurface,
  FocusSurface,
  PresentationCascade,
  PresentationContext,
  RESOLUTION_KEYS,
  SPECIFICITY,
  applyEdit,
  carriesContent,
  chromeOf,
  classifyLine,
  isSilent,
  paint,
  presentationFromDeclaration,
  readDeclaration,
  seedFor,
  tagSpans
};
//# sourceMappingURL=present.js.map

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
var QNTM_ID = /\[\[qntm:([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)\]\]/gi;
function qntmIdSpans(text) {
  const spans = [];
  for (const match of text.matchAll(QNTM_ID)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length });
  }
  return spans;
}
var WIKI_LINK = /\[\[([^\]]+)\]\]/g;
function wikiLinkSpans(text) {
  const spans = [];
  for (const match of text.matchAll(WIKI_LINK)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length });
  }
  return spans;
}
var MARKER_GLYPH = /\p{Extended_Pictographic}️?/gu;
var MARKER_VALUE = /^(?:\d{4}-\d{2}-\d{2}|\d+(?:\.\d+)?)$/;
function markerSpans(text) {
  const spans = [];
  for (const match of text.matchAll(MARKER_GLYPH)) {
    const glyphStart = match.index ?? 0;
    const glyphEnd = glyphStart + match[0].length;
    const after = text.slice(glyphEnd);
    const leadingSpace = /^\s+/.exec(after);
    let end = glyphEnd;
    if (leadingSpace !== null) {
      const rest = after.slice(leadingSpace[0].length);
      const token = /^\S+/.exec(rest);
      if (token !== null && MARKER_VALUE.test(token[0])) {
        end = glyphEnd + leadingSpace[0].length + token[0].length;
      }
    }
    spans.push({ start: glyphStart, end });
  }
  return spans;
}
function titleSpans(line) {
  const shape = classifyLine(line);
  let content;
  let prefixLen;
  if (shape.kind === "blank") {
    return [];
  } else if (shape.kind === "heading") {
    content = shape.text;
    prefixLen = line.length - shape.text.length;
  } else if (shape.kind === "checkbox") {
    content = shape.tail;
    prefixLen = line.length - shape.tail.length;
  } else {
    const bullet = BULLET.exec(line);
    let prefix = bullet !== null ? bullet[0].length : 0;
    let rest = bullet !== null ? line.slice(prefix) : line;
    const glyph = CHECKBOX_GLYPH.exec(rest);
    if (glyph !== null) {
      prefix += glyph[0].length;
      rest = rest.slice(glyph[0].length);
    }
    content = rest;
    prefixLen = prefix;
  }
  const claims = [];
  for (const span of [...wikiLinkSpans(content), ...tagSpans(content), ...markerSpans(content)]) {
    if (!claims.some((claimed) => span.start >= claimed.start && span.start < claimed.end)) {
      claims.push(span);
    }
  }
  claims.sort((a, b) => a.start - b.start);
  const atomAt = (index) => claims.find((claim) => index >= claim.start && index < claim.end);
  const words = [];
  let i = 0;
  while (i < content.length) {
    const atom = atomAt(i);
    if (atom !== void 0) {
      i = atom.end;
      continue;
    }
    if (/\s/.test(content[i] ?? "")) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < content.length && atomAt(i) === void 0 && !/\s/.test(content[i] ?? "")) {
      i += 1;
    }
    words.push({ start: start + prefixLen, end: i + prefixLen });
  }
  return words;
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

// app/present/anchor.ts
var ANCHOR_TRUST = ["STAMP", "STAMP_IN_SECTION", "TEXT", "TEXT_IN_SECTION"];
function stampOf(line) {
  const [first] = qntmIdSpans(line);
  return first === void 0 ? null : line.slice(first.start, first.end);
}
function sectionOf(lines, lineIndex) {
  for (let at = lineIndex - 1; at >= 0; at -= 1) {
    const line = lines[at] ?? "";
    if (classifyLine(line).kind === "heading") {
      return line;
    }
  }
  return null;
}
function anchorFor(source, lineIndex) {
  const lines = source.split("\n");
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) {
    return null;
  }
  const text = lines[lineIndex] ?? "";
  if (classifyLine(text).kind === "blank") {
    return null;
  }
  return {
    stamp: stampOf(text),
    text,
    section: sectionOf(lines, lineIndex),
    takenAt: lineIndex
  };
}
function decide(candidates, lines, anchor, tier, narrowedTier) {
  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length === 1) {
    return { outcome: "found", tier, lineIndex: candidates[0] };
  }
  const inSection = candidates.filter((at) => sectionOf(lines, at) === anchor.section);
  if (inSection.length === 1) {
    return { outcome: "found", tier: narrowedTier, lineIndex: inSection[0] };
  }
  return { outcome: "ambiguous", tier, candidates: inSection.length > 1 ? inSection : candidates };
}
function resolveAnchor(anchor, source) {
  const lines = source.split("\n");
  if (anchor.stamp !== null) {
    const wanted = anchor.stamp.toLowerCase();
    const byStamp = [];
    lines.forEach((line, at) => {
      if (stampOf(line)?.toLowerCase() === wanted) {
        byStamp.push(at);
      }
    });
    const reading2 = decide(byStamp, lines, anchor, "STAMP", "STAMP_IN_SECTION");
    if (reading2 !== null) {
      return reading2;
    }
  }
  const byText = [];
  lines.forEach((line, at) => {
    if (line === anchor.text) {
      byText.push(at);
    }
  });
  const reading = decide(byText, lines, anchor, "TEXT", "TEXT_IN_SECTION");
  if (reading !== null) {
    return reading;
  }
  return { outcome: "absent" };
}

// app/present/motions.ts
function clampLine(index, lastIndex) {
  const floor = 0;
  const ceiling = lastIndex < 0 ? 0 : lastIndex;
  return Math.max(floor, Math.min(index, ceiling));
}
function clampColumn(column, text) {
  if (!Number.isFinite(column) || column < 0) {
    return 0;
  }
  const at = Math.floor(column);
  if (text === null) {
    return at;
  }
  return Math.min(at, Math.max(0, text.length - 1));
}
var DIGIT = /^[0-9]$/;
var ModeSurface = class {
  #mode = "NORMAL";
  #count = "";
  #pendingG = false;
  #caretHint = void 0;
  get mode() {
    return this.#mode;
  }
  /**
   * Start editing — an `<input>` is about to hold the selected line's characters. Called by
   * `handleKey` for `i`/`Enter`/`a`, and by the DOM wiring for a mouse click, which has meant "edit
   * this line" since before this module existed and goes on meaning it.
   *
   * `caret` IS A COLUMN AND NOTHING ELSE. `i` passes the cursor's own column and `a` passes
   * `column + 1`; a mouse click passes nothing, because a click puts the caret where the person
   * clicked and the painter must not overrule that.
   *
   * IT USED TO ACCEPT `"end"` AS WELL, AND THAT UNION IS GONE ON PURPOSE. `"end"` was shorthand for
   * "the column one past the last character" from a time when NORMAL had no column to be one past
   * — the string was standing in for arithmetic nothing could do yet. Now the cursor HAS a column,
   * `a` is `column + 1`, and a second way of naming a position on the same axis would be exactly
   * the second coordinate system this change is under instruction not to introduce.
   * See `takeCaretHint` for how the painter reads it back.
   */
  enterInsert(caret) {
    this.#mode = "INSERT";
    this.#caretHint = caret;
    this.#count = "";
    this.#pendingG = false;
  }
  /**
   * The caret hint set by the last `enterInsert`, consumed once and cleared.
   *
   * CONSUMED RATHER THAN JUST READ, so a later repaint of the SAME INSERT session (there is none
   * today — nothing repaints an open `<input>` while it holds focus — but the consume-once shape is
   * what stops one arriving unnoticed and re-applying a stale "jump to the end" over wherever the
   * operator has since moved the caret by hand) cannot reapply it. The painter calls this exactly
   * once, at the moment it builds the `<input>` the hint was for.
   */
  takeCaretHint() {
    const hint = this.#caretHint;
    this.#caretHint = void 0;
    return hint;
  }
  /**
   * Leave editing — the selected line PERSISTS (FocusSurface's `lineIndex` is not touched here;
   * see paint.ts's `settle`, which stops calling `focus.blur()` once a `ModeSurface` is wired in,
   * for exactly this reason). Vim always has a cursor on some line; only whether that line is open
   * for text ever turns off.
   */
  enterNormal() {
    this.#mode = "NORMAL";
    this.#caretHint = void 0;
    this.#count = "";
    this.#pendingG = false;
  }
  /**
   * One keystroke while in NORMAL mode. No-op (and reports unhandled) while in INSERT — the
   * `<input>`'s own keydown listener owns keys once one is open, and this module never reaches
   * into it.
   *
   * `current`/`lastIndex` are `FocusSurface.lineIndex` (never `null` while vim owns the cursor —
   * the DOM wiring is responsible for giving it a starting value) and the last valid line index
   * for the view being shown.
   *
   * `column` IS THE CURSOR'S OTHER AXIS AND IT IS AN INPUT, NOT A DECISION MADE HERE. It arrives
   * from `FocusSurface.column` exactly as `current` arrives from `FocusSurface.lineIndex`, and this
   * module reads it for `i`/`a` (which open INSERT relative to it) and for nothing else. It
   * defaults to `0` so every caller written before the column existed goes on compiling and goes on
   * meaning what it meant: `i` at column zero is the start of the line.
   *
   * COUNT PREFIX: digits accumulate; `1`-`9` may start one, `0` may only CONTINUE one already
   * started. A BARE `0` IS NOW COLUMN ZERO, which is a change: it was left unbound while the cursor
   * had no column to send to zero, and "left unbound until there is something for it to mean" is
   * what that note in the brief was recording. There is now.
   *
   * `gg`: the one two-key binding. A `g` that is not followed by a second `g` is silently
   * abandoned and the key that broke the pair is processed as an ordinary keystroke — so `g` then
   * `j` moves down by one rather than doing nothing at all.
   */
  handleKey(key, current, lastIndex, column = 0) {
    if (this.#mode !== "NORMAL") {
      return { handled: false, effect: { kind: "none" } };
    }
    if (this.#pendingG) {
      this.#pendingG = false;
      if (key === "g") {
        this.#count = "";
        return { handled: true, effect: { kind: "move", lineIndex: clampLine(0, lastIndex) } };
      }
    }
    if (key === "g") {
      this.#pendingG = true;
      return { handled: false, effect: { kind: "none" } };
    }
    if (DIGIT.test(key)) {
      if (key === "0" && this.#count === "") {
        return { handled: true, effect: { kind: "column", to: "start" } };
      }
      this.#count += key;
      return { handled: true, effect: { kind: "none" } };
    }
    const pending = this.#count === "" ? null : Number(this.#count);
    this.#count = "";
    switch (key) {
      case "j":
        return {
          handled: true,
          effect: { kind: "move", lineIndex: clampLine(current + (pending ?? 1), lastIndex) }
        };
      case "k":
        return {
          handled: true,
          effect: { kind: "move", lineIndex: clampLine(current - (pending ?? 1), lastIndex) }
        };
      case "G":
        return {
          handled: true,
          effect: {
            kind: "move",
            lineIndex: pending === null ? clampLine(lastIndex, lastIndex) : clampLine(pending - 1, lastIndex)
          }
        };
      case "i":
      case "Enter":
        this.enterInsert(column);
        return { handled: true, effect: { kind: "enter-insert", caret: column } };
      case "a":
        this.enterInsert(column + 1);
        return { handled: true, effect: { kind: "enter-insert", caret: column + 1 } };
      case "$":
        return { handled: true, effect: { kind: "column", to: "end" } };
      case "o":
        if (pending !== null) {
          return { handled: true, effect: { kind: "none" } };
        }
        return { handled: true, effect: { kind: "open", direction: "below" } };
      case "O":
        if (pending !== null) {
          return { handled: true, effect: { kind: "none" } };
        }
        return { handled: true, effect: { kind: "open", direction: "above" } };
      case "x":
        if (pending !== null) {
          return { handled: true, effect: { kind: "none" } };
        }
        return { handled: true, effect: { kind: "toggle-done" } };
      case "{":
        return { handled: true, effect: { kind: "boundary", direction: "prev", count: pending ?? 1 } };
      case "}":
        return { handled: true, effect: { kind: "boundary", direction: "next", count: pending ?? 1 } };
      case ">":
        return { handled: true, effect: { kind: "indent", direction: "in", count: pending ?? 1 } };
      case "<":
        return { handled: true, effect: { kind: "indent", direction: "out", count: pending ?? 1 } };
      case "w":
        return { handled: true, effect: { kind: "word", motion: "w", count: pending ?? 1 } };
      case "b":
        return { handled: true, effect: { kind: "word", motion: "b", count: pending ?? 1 } };
      case "e":
        return { handled: true, effect: { kind: "word", motion: "e", count: pending ?? 1 } };
      default:
        return { handled: false, effect: { kind: "none" } };
    }
  }
};

// app/present/focus.ts
function lineTextOf(source, lineIndex) {
  if (source === void 0) {
    return null;
  }
  return source.split("\n")[lineIndex] ?? null;
}
var FOCUSED = Object.freeze(
  Object.fromEntries(RESOLUTION_KEYS.map((key) => [key, "raw"]))
);
var FocusSurface = class {
  #lineIndex = null;
  #anchor = null;
  #column = 0;
  /** The line the cursor is on, or `null` when it is nowhere. */
  get lineIndex() {
    return this.#lineIndex;
  }
  /**
   * WHICH CHARACTER of that line the cursor is on — an offset into the line's own source string,
   * clamped to a character that exists. `0` when the cursor is nowhere.
   *
   * IT IS AN OFFSET INTO THE LINE THE INDEX ALREADY NAMES, NOT A SECOND COORDINATE SYSTEM. The
   * anchor decides WHICH line; this decides WHERE IN IT. Every column that enters this surface is
   * clamped against that line's characters on the way in, which is what makes "clamped to a
   * character that exists" a property of the surface rather than of each of its callers.
   */
  get column() {
    return this.#column;
  }
  /**
   * WHICH line the cursor is on, expressed as identity rather than as a position — or `null` when
   * nothing was anchored. See `focus` below for the two ways that happens.
   */
  get anchor() {
    return this.#anchor;
  }
  isFocused(lineIndex) {
    return this.#lineIndex === lineIndex;
  }
  /**
   * Put the cursor on a line. One line at a time — there is one cursor.
   *
   * `source` IS OPTIONAL AND ITS ABSENCE IS A REAL CONFIGURATION, the same shape `PaintDeps`
   * already draws for `focus`, `mode` and `draft`: without it the cursor is a bare index exactly as
   * it was before this parameter existed, and `reanchor` below reports `unanchored` rather than
   * pretending. Every caller in the shipped app supplies it (`app/index.html`, `paint.ts`); the
   * tests written before anchoring existed do not, and go on painting what they always painted.
   *
   * THE INDEX AND THE ANCHOR ARE SET IN ONE CALL, on purpose. Two setters would be two facts that
   * can disagree about where one cursor is, and "there is one cursor" is the property every motion
   * in this bundle is arithmetic on.
   *
   * `column` DEFAULTS TO ZERO, WHICH IS A DECISION AND NOT AN OMISSION. Landing on a line puts the
   * cursor at its start: `j`, `k`, `gg`, `G`, `{`, `}` and a mouse click all take this default, so a
   * line move resets the column. Vim's own `j`/`k` instead remember a DESIRED column and restore it
   * on a line long enough to hold it — a third piece of state (the desired column is not the actual
   * one) that nothing in this change needs, so it is not built. What IS needed is that `w`/`b`/`e`
   * repeat, and they do not move between lines. The one caller that passes a column is `reanchor`
   * below, which is preserving one rather than choosing one.
   */
  focus(lineIndex, source, column = 0) {
    this.#lineIndex = lineIndex;
    this.#anchor = source === void 0 ? null : anchorFor(source, lineIndex);
    this.#column = clampColumn(column, lineTextOf(source, lineIndex));
  }
  /**
   * Move the cursor along the line it is already on — `w`/`b`/`e`/`0`/`$`, and nothing else.
   *
   * IT TAKES THE LINE'S TEXT RATHER THAN LOOKING IT UP, for the same reason `focus` takes a source:
   * this surface holds no copy of the view and must not start holding one. The caller has the string
   * the column was computed against (app/index.html reads it out of the same `v.markdown` it hands
   * `wordCaret`), so passing it is passing the fact, not fetching it twice.
   *
   * IT IS A SEPARATE CALL FROM `focus` AND THAT IS NOT THE "TWO SETTERS" THE NOTE ABOVE REFUSES.
   * That refusal is about two setters for ONE fact — an index and an anchor that could disagree
   * about which line the cursor is on. A column is a different axis: it cannot disagree with the
   * index, only be clamped by it, which is exactly what happens here.
   */
  moveColumn(column, lineText) {
    this.#column = clampColumn(column, lineText);
  }
  /**
   * THE WORLD ARRIVED. Where is the cursor's line in `source` now, and which rung said so?
   *
   * On `found` the cursor MOVES to the line it found and the anchor is taken again against the new
   * projection — a cycle that stamped the line, or rewrote its tail, has changed the text tier 2
   * would look for next time, and an anchor that went on describing the previous projection would
   * be the same defect one repaint later.
   *
   * ON `ambiguous` AND `absent` NOTHING MOVES AND NOTHING IS CLEARED, which is deliberate rather
   * than unfinished. Blurring a cursor whose line has vanished would destroy the one thing row 4
   * (`the-vanished-line-is-parked-not-dropped`) needs in order to park the operator's characters
   * where he can recover them. This row's whole obligation is that the outcome REACHES THE CALLER
   * instead of being silence, and the caller decides.
   *
   * IT IS THE CALLER'S CALL, NOT THE PAINTER'S. `paint` cannot tell a projection arriving from its
   * own optimistic repaint of a source it has already seen, so re-anchoring lives with the code
   * that knows a snapshot landed — the same split `boundaryLine` and `openLine` already have
   * between a pure answer and the wiring that asks for it.
   *
   * THE COLUMN THIS METHOD WAS WARNED ABOUT NOW EXISTS, AND THIS IS THE EXPLICIT DECISION.
   *
   * The warning left here by the row that made the cursor an identity was that a column added as a
   * third field would be SILENTLY RESET on every arrival, because this method moves the cursor by
   * calling `focus()` and `focus()` owns the index and the anchor and nothing else. It does not
   * happen, because the column is passed back through: `focus(lineIndex, source, this.#column)`.
   *
   * AND IT IS CLAMPED RATHER THAN CARRIED, which is the fact the warning said was already in hand.
   * `focus` re-takes the anchor against the ARRIVING projection, so it also has that projection's
   * text for the line the cursor landed on, and `clampColumn` (motions.ts) cuts the column down to a
   * character that is really there. A cycle that shortened the line — stripped a marker cell,
   * rewrote a tail — leaves the cursor on that line's LAST character rather than past its end, and a
   * cycle that lengthened it leaves the column exactly where the operator put it. Neither outcome is
   * a guess: both are the same one clamp, applied to whatever arrived.
   *
   * ON `ambiguous` AND `absent` THE COLUMN IS UNTOUCHED, for the same reason the index and the
   * anchor are: nothing about the cursor moves when the world could not tell us where its line went.
   */
  reanchor(source) {
    const anchor = this.#anchor;
    if (anchor === null) {
      return { outcome: "unanchored" };
    }
    const reading = resolveAnchor(anchor, source);
    if (reading.outcome === "found") {
      this.focus(reading.lineIndex, source, this.#column);
    }
    return reading;
  }
  /** Take the cursor off whatever it was on. */
  blur() {
    this.#lineIndex = null;
    this.#anchor = null;
    this.#column = 0;
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

// app/present/instance.ts
var HEADING_TOKEN = "\xA7heading";
function nodeStampOf(line) {
  const [first] = qntmIdSpans(line);
  if (first === void 0) {
    return null;
  }
  return line.slice(first.start + 2, first.end - 2);
}
function instancesOf(source, view) {
  const lines = source.split("\n");
  let section = null;
  const raw = lines.map((line) => {
    const shape = classifyLine(line);
    if (shape.kind === "blank") {
      return null;
    }
    if (shape.kind === "heading") {
      section = section === null ? 0 : section + 1;
      const node2 = nodeStampOf(line);
      return { section, node: node2, token: node2 ?? HEADING_TOKEN };
    }
    const node = nodeStampOf(line);
    return { section, node, token: node ?? line };
  });
  const key = (r) => `${r.section ?? "none"}\0${r.token}`;
  const groupSize = /* @__PURE__ */ new Map();
  for (const r of raw) {
    if (r === null) {
      continue;
    }
    const k = key(r);
    groupSize.set(k, (groupSize.get(k) ?? 0) + 1);
  }
  const seen = /* @__PURE__ */ new Map();
  return raw.map((r) => {
    if (r === null) {
      return null;
    }
    const k = key(r);
    const occurrence = (seen.get(k) ?? 0) + 1;
    seen.set(k, occurrence);
    const size = groupSize.get(k) ?? 1;
    const suffix = size > 1 ? `#${occurrence}` : "";
    const sectionToken = r.section === null ? "-" : String(r.section);
    return {
      instance: `${view}/${sectionToken}/${r.token}${suffix}`,
      node: r.node,
      section: r.section
    };
  });
}
function instanceOf(source, lineIndex, view) {
  if (!Number.isInteger(lineIndex) || lineIndex < 0) {
    return null;
  }
  return instancesOf(source, view)[lineIndex] ?? null;
}
function instanceAnchorFor(source, lineIndex, view) {
  const info = instanceOf(source, lineIndex, view);
  if (info === null) {
    return null;
  }
  return { instance: info.instance, node: info.node, takenAt: lineIndex };
}
function resolveInstanceAnchor(anchor, source, view) {
  const list = instancesOf(source, view);
  const byInstance = list.findIndex((info) => info?.instance === anchor.instance);
  if (byInstance !== -1) {
    return { outcome: "found", lineIndex: byInstance, via: "instance" };
  }
  if (anchor.node !== null) {
    const candidates = [];
    list.forEach((info, at) => {
      if (info?.node === anchor.node) {
        candidates.push(at);
      }
    });
    if (candidates.length === 1) {
      return { outcome: "found", lineIndex: candidates[0], via: "node" };
    }
    if (candidates.length > 1) {
      return { outcome: "ambiguous", candidates };
    }
  }
  return { outcome: "absent" };
}

// app/present/boundary.ts
function boundaryLine(lines, current, direction, count) {
  let at = current;
  for (let step = 0; step < count; step += 1) {
    const found = direction === "next" ? nextHeading(lines, at) : prevHeading(lines, at);
    if (found === null) {
      return direction === "next" ? Math.max(0, lines.length - 1) : 0;
    }
    at = found;
  }
  return at;
}
function nextHeading(lines, from) {
  for (let at = from + 1; at < lines.length; at += 1) {
    if (classifyLine(lines[at] ?? "").kind === "heading") {
      return at;
    }
  }
  return null;
}
function prevHeading(lines, from) {
  for (let at = from - 1; at >= 0; at -= 1) {
    if (classifyLine(lines[at] ?? "").kind === "heading") {
      return at;
    }
  }
  return null;
}

// app/present/indent.ts
var INDENT_UNIT = 4;
var LEADING_WHITESPACE = /^\s*/;
function indentedLine(line, direction, count) {
  const shape = classifyLine(line);
  if (shape.kind === "blank" || shape.kind === "heading") {
    return line;
  }
  const match = LEADING_WHITESPACE.exec(line);
  const currentLength = match?.[0].length ?? 0;
  const rest = line.slice(currentLength);
  const units = direction === "in" ? Math.floor(currentLength / INDENT_UNIT) + count : Math.max(0, Math.ceil(currentLength / INDENT_UNIT) - count);
  return " ".repeat(units * INDENT_UNIT) + rest;
}

// app/present/word.ts
function wordCaret(line, motion, count, from) {
  const words = titleSpans(line);
  if (words.length === 0) {
    return null;
  }
  const n = Math.max(1, count);
  const last = words[words.length - 1];
  const first = words[0];
  if (motion === "b") {
    const before = words.map((word) => word.start).filter((at) => at < from);
    if (before.length === 0) {
      return first.start;
    }
    return before[Math.max(0, before.length - n)];
  }
  const after = motion === "e" ? words.map((word) => word.end - 1).filter((at) => at > from) : words.map((word) => word.start).filter((at) => at > from);
  if (after.length === 0) {
    return motion === "e" ? last.end - 1 : last.start;
  }
  return after[Math.min(n - 1, after.length - 1)];
}

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
function openLine(from, lineIndex, draft, onDeclined) {
  const seed = seedFor(from, lineIndex);
  if (seed === null) {
    onDeclined?.(lineIndex);
    return false;
  }
  draft.open(lineIndex, seed.text);
  return true;
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
var VIM_BLOCK_CLASS = "vim-block";
var EMPTY_CELL = "\xA0";
function normalLine(lineSource, column) {
  const div = document.createElement("div");
  div.className = "rawline " + VIM_SELECTED_CLASS;
  const head = document.createElement("span");
  head.textContent = lineSource.slice(0, column);
  const cell = document.createElement("span");
  cell.className = VIM_BLOCK_CLASS;
  cell.textContent = lineSource.slice(column, column + 1) || EMPTY_CELL;
  const tail = document.createElement("span");
  tail.textContent = lineSource.slice(column + 1);
  div.append(head, cell, tail);
  return div;
}
function rawInput(lineSource, lineIndex, fileSource, focus, deps, repaint, openLineAt) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "rawline";
  input.value = lineSource;
  const mode = deps.mode;
  let settled = false;
  const settle = (commit, openBelow = false) => {
    if (settled) {
      return;
    }
    settled = true;
    const wasFocused = focus.isFocused(lineIndex);
    const leaveInsert = () => {
      if (mode !== void 0) {
        mode.enterNormal();
      } else {
        focus.blur();
      }
    };
    if (!commit) {
      if (wasFocused) {
        leaveInsert();
        repaint(fileSource);
      }
      return;
    }
    const text = input.value;
    const markdown = applyEdit(fileSource, { kind: "set-line", lineIndex, text });
    deps.onLineCommit?.({ lineIndex, text, markdown });
    const next = markdown ?? fileSource;
    const opened = openBelow ? openLineAt(lineIndex + 1, next) : false;
    if (wasFocused) {
      if (opened && mode !== void 0) {
        mode.enterInsert();
      } else {
        leaveInsert();
      }
    }
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
  const returnToVim = (source) => {
    if (deps.mode === void 0) {
      return;
    }
    deps.mode.enterNormal();
    if (deps.focus !== void 0) {
      const last = Math.max(0, source.split("\n").length - 1);
      deps.focus.focus(Math.min(lineIndex, last), source);
    }
  };
  const abandon = () => {
    if (settled) {
      return;
    }
    settled = true;
    draft.drop();
    returnToVim(fileSource);
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
    returnToVim(markdown ?? fileSource);
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
var VIM_SELECTED_CLASS = "vim-selected";
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
  const mode = deps.mode;
  const instances = deps.view === void 0 ? void 0 : instancesOf(source, deps.view);
  const stampInstance = (element, lineIndex) => {
    const info = instances?.[lineIndex];
    if (info !== void 0 && info !== null) {
      element.dataset.instance = info.instance;
    }
  };
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
      focus.focus(lineIndex, source);
      mode?.enterInsert();
      repaint(source);
    });
  };
  const openLineAt = (lineIndex, from) => {
    if (draft === void 0 || focus === void 0) {
      return false;
    }
    return openLine(from, lineIndex, draft, deps.onNewLineDeclined);
  };
  const raw = (lineSource, lineIndex) => {
    if (focus === void 0) {
      const text = rawText(lineSource);
      stampInstance(text, lineIndex);
      body.append(text);
      return;
    }
    if (mode !== void 0 && mode.mode === "NORMAL" && focus.isFocused(lineIndex)) {
      const line = normalLine(lineSource, focus.column);
      focusable(line, lineIndex);
      stampInstance(line, lineIndex);
      body.append(line);
      return;
    }
    const input = rawInput(lineSource, lineIndex, source, focus, deps, repaint, openLineAt);
    stampInstance(input, lineIndex);
    body.append(input);
    if (focus.isFocused(lineIndex)) {
      input.focus?.();
      const caret = mode?.takeCaretHint();
      if (caret !== void 0) {
        const at = Math.max(0, Math.min(caret, lineSource.length));
        input.setSelectionRange?.(at, at);
      }
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
      if (mode !== void 0 && mode.mode === "NORMAL" && focus !== void 0 && focus.isFocused(index)) {
        const mark = document.createElement("div");
        mark.className = VIM_SELECTED_CLASS;
        body.append(mark);
      }
      return;
    }
    lastPaintedIndex = index;
    const focusLive = focus !== void 0;
    const cascade = new PresentationCascade(focusLive ? focus.contextFor(index, context) : context);
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
      stampInstance(row, index);
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
      stampInstance(el, index);
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
    stampInstance(div, index);
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
  ANCHOR_TRUST,
  DEFAULT,
  DraftSurface,
  FocusSurface,
  INDENT_UNIT,
  ModeSurface,
  PresentationCascade,
  PresentationContext,
  RESOLUTION_KEYS,
  SPECIFICITY,
  anchorFor,
  applyEdit,
  boundaryLine,
  carriesContent,
  chromeOf,
  clampColumn,
  clampLine,
  classifyLine,
  indentedLine,
  instanceAnchorFor,
  instanceOf,
  instancesOf,
  isSilent,
  markerSpans,
  openLine,
  paint,
  presentationFromDeclaration,
  qntmIdSpans,
  readDeclaration,
  resolveAnchor,
  resolveInstanceAnchor,
  seedFor,
  tagSpans,
  titleSpans,
  wikiLinkSpans,
  wordCaret
};
//# sourceMappingURL=present.js.map

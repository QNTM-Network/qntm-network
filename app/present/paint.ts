/**
 * paint — the ONLY module in app/present/ that touches the document.
 *
 * The same split app/main.ts already uses, adopted rather than re-invented: the transform is
 * pure, the state is pure, and everything page-shaped is concentrated in one place. Three modules
 * that each touch the DOM a little is how a painter acquires decisions, and decisions in a
 * painter is the condition this whole change exists to end.
 *
 * ── WHAT THIS FUNCTION MAY AND MAY NOT DO ──
 *
 * It may build DOM. It may NOT decide. Every rendition question goes to the cascade and the
 * answer is obeyed; there is no `if (focused)`, no mode branch, and no second copy of the
 * precedence order anywhere below this line. If a future change adds one, the scenario in
 * tests/flow_scenarios/present_cascade.ts and the node test in tests/present-cascade.test.mjs
 * both go red, and that is what they are for.
 *
 * It also may not touch the network. The checkbox affordance computes its source edit through
 * source.ts and hands the resulting WHOLE-FILE markdown to the caller, which owns the POST. That
 * is what keeps `applyEdit` the single answer to "does this affordance have a source edit?", and
 * it is why the edit is computed inside governed code rather than inside app.html — a string
 * built at the call site is a string nothing can check.
 *
 * ── THE TAG CHIP IS READ-ONLY, AND THAT IS A DECISION WITH A REASON ──
 *
 * The `wired` rendition of a tag is a chip and the chip offers NOTHING. It has no listener, and
 * `applyEdit` gained no case for it: the first token rendition adds no second write path, which is
 * why this change could not corrupt a file even if every claim in it were wrong.
 *
 * Not because the source edit is unwritable — it is writable, and `TagSpan` in resolution.ts
 * carries the offsets it would need. "Delete `[start,end)` of line N" is one sentence. Three
 * things are unanswered, and the constraint is that the AFFORDANCE must be expressible, not merely
 * the deletion:
 *
 *   1. WHAT THE WHITESPACE BECOMES. The engine strips a tag with `TAG_RE.sub("")`
 *      (parse_tag.py:72) and leaves the gap, because it goes on to rebuild the line from cells.
 *      The app does not rebuild the line — it patches it — so deleting `#work` from
 *      `- [ ] a #task #work` leaves a trailing space, and deleting `#task` leaves a double one.
 *      Neither is wrong; neither is decided.
 *   2. WHAT DELETING A TAG MEANS. A tag is not decoration to the engine. `#task` selects the node
 *      TYPE and `#work` sets a FIELD (config/vocabulary/domain_tags.yaml). Removing one is a
 *      structural edit posted as a whole file, and the engine's own record of what happens when a
 *      tag stops being recognised is that its content is absorbed into the node's title, exit 0,
 *      no diagnostic. That is a bigger gesture than a click with no undo should carry.
 *   3. WHERE THE CLICK WOULD GO. A chip sits inside the `<span>` that is the cursor target, so a
 *      click on a chip is currently "put my cursor on this line". A click that DELETED instead
 *      would put a destructive gesture exactly where a person expects a harmless one.
 *
 * So the rendition ships without it. What a removable chip needs is those three answered, an undo,
 * and `applyEdit` gaining one `delete-span` case — at which point it is a small change, because
 * the offsets are already here and the write path is already one function.
 *
 * ── THE MARKDOWN RENDERER IS INJECTED, ON PURPOSE ──
 *
 * `deps.markdown` is supplied by the caller rather than imported. Two reasons, and the first is
 * the load-bearing one:
 *
 *   1. It is what makes "byte-identical output" PROVABLE rather than asserted. The golden test
 *      runs the old painter and this one against the SAME renderer instance, so any difference
 *      between them is attributable to this extraction and to nothing else. Had this module
 *      imported its own markdown-it, the comparison would silently also be testing one
 *      markdown-it build against another.
 *   2. This repo has THREE markdown implementations (classes.yaml records the correction), and
 *      collapsing them is a real and separate piece of work with its own backlog row
 *      (`flag-one-markdown-implementation-is-now-three`). Folding it into a refactor whose whole
 *      claim is "nothing changed" would make that claim unprovable. app.html still supplies the
 *      CDN markdown-it it supplied before; this change neither improves nor worsens that count.
 */

import { PresentationCascade } from "./cascade.js";
import type { PresentationContext } from "./context.js";
import type { FocusSurface } from "./focus.js";
import { classifyLine, tagSpans } from "./resolution.js";
import type { Rendition } from "./resolution.js";
import { applyEdit } from "./source.js";

/** The markdown surface the painter needs. Structural, so any conforming renderer will do. */
export interface InlineMarkdown {
  renderInline(markdown: string): string;
  render(markdown: string): string;
}

/**
 * What the caller is handed when a checkbox is toggled.
 *
 * `markdown` is the WHOLE view source with exactly one glyph changed, or `null` if the edit did
 * not apply. The caller posts it; it never builds it.
 */
export interface CheckboxToggle {
  readonly lineIndex: number;
  readonly checked: boolean;
  readonly markdown: string | null;
  readonly box: HTMLInputElement;
  readonly row: HTMLElement;
}

/**
 * What the caller is handed when the cursor leaves a line it changed.
 *
 * `text` is the verbatim characters the input held; `markdown` is the WHOLE view source with
 * exactly that one line replaced, or `null` if the edit was refused — an unchanged line (the
 * commonest thing a cursor does), or text that is not one line. `null` means DO NOT POST, and it
 * is distinguishable from a successful no-op for the same reason it is for the checkbox: the app
 * posts the whole file and the server overwrites what it is sent.
 */
export interface LineCommit {
  readonly lineIndex: number;
  readonly text: string;
  readonly markdown: string | null;
}

export interface PaintDeps {
  readonly markdown: InlineMarkdown;
  readonly onCheckboxToggle?: (toggle: CheckboxToggle) => void;
  /**
   * WHERE THE CURSOR IS — optional, and its absence is a real configuration rather than a
   * half-built one. Without it, a painted view has no focus affordance at all: no click handler
   * on a line, and the `raw` rendition is inert text. That is exactly what stage 1 painted, which
   * is why the golden master (tests/present-golden.test.mjs) still compares byte for byte against
   * the painter this replaced — it paints without a focus surface, and there is nothing extra to
   * be identical to. app.html supplies one; a test that wants the old surface omits it.
   */
  readonly focus?: FocusSurface;
  readonly onLineCommit?: (commit: LineCommit) => void;
}

/**
 * The `raw` rendition, with no cursor in the world: the characters, verbatim, and inert.
 *
 * `textContent`, never `innerHTML` — raw means the source characters AS CHARACTERS. This is the
 * one rendition that offers no affordance at all and therefore needs no source edit, which is
 * what made it the safe half of the dial to ship first.
 */
function rawText(source: string): HTMLElement {
  const div = document.createElement("div");
  div.textContent = source;
  return div;
}

/**
 * The `raw` rendition when there IS somewhere for a cursor to go: an `<input>` holding the
 * verbatim source, and the whole of migration stage 3's surface.
 *
 * ── WHY AN `<input>` AND NOT A `contenteditable` ──
 *
 * The governing constraint: a resolution is admissible only when every affordance it offers can
 * be expressed as an edit to the SOURCE STRING, and the app never reconstructs markdown from the
 * DOM. An input holding source text satisfies it exactly — what comes back out is the characters
 * a person typed, and the edit is "line N becomes this string", one sentence, no inversion. A
 * contenteditable region holding a RENDITION satisfies nothing: getting markdown back out of it
 * means un-rendering HTML, which is the one shape the design forbids, and the app posts the WHOLE
 * FILE, so a lossy inversion does not corrupt one line — it rewrites a view.
 *
 * `<input>` rather than `<textarea>` is also load-bearing rather than aesthetic: an input cannot
 * contain a newline, so "exactly one line replaced and every other line byte for byte" is a
 * property of the ELEMENT and not merely of the code around it. `applyEdit` refuses a multi-line
 * text as well, and the two guards are deliberately not one.
 *
 * ── WHY THIS EMBODIMENT DEPENDS ON `deps.focus` RATHER THAN ON THE CASCADE ──
 *
 * Raw is raw either way; what differs is whether the characters can be REACHED. An input in an
 * app with no focus surface would be a control nobody can leave and nothing repaints — worse than
 * the inert text it replaced. So the rendition is the cascade's decision and its embodiment is
 * the painter's, which is the split the presentation-painting class already draws: paint may
 * build DOM, and may not decide.
 */
function rawInput(
  lineSource: string,
  lineIndex: number,
  fileSource: string,
  focus: FocusSurface,
  deps: PaintDeps,
  repaint: (nextSource: string) => void,
): HTMLElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "rawline";
  input.value = lineSource;

  // ONE SETTLEMENT PER INPUT. Blur can arrive twice (a keypress that commits, then the element
  // losing focus as the repaint removes it), and a second settlement would compute a second edit
  // against a source that has already moved — the first shape a double POST takes.
  let settled = false;
  const settle = (commit: boolean): void => {
    if (settled) {
      return;
    }
    settled = true;
    const wasFocused = focus.isFocused(lineIndex);
    if (wasFocused) {
      focus.blur();
    }
    if (!commit) {
      // Escape: the cursor leaves and the characters it was holding are dropped. Nothing is
      // computed, nothing is posted, and the line returns to whatever the cascade resolves.
      if (wasFocused) {
        repaint(fileSource);
      }
      return;
    }
    const text = input.value;
    // THE EDIT IS COMPUTED FROM THE SOURCE STRING THIS PAINT WAS GIVEN, plus the characters the
    // person typed. Nothing about the other lines is read back off the page; they come out of
    // `source` exactly as they went in. tests/present-focus.test.mjs proves that by wrecking
    // every other rendered element first and then checking the posted file.
    const markdown = applyEdit(fileSource, { kind: "set-line", lineIndex, text });
    deps.onLineCommit?.({ lineIndex, text, markdown });
    if (markdown !== null) {
      // Optimistic, and the same posture the checkbox already had: show the edit immediately,
      // let the caller replace it with the server's copy when the cycle comes back.
      repaint(markdown);
    } else if (wasFocused) {
      repaint(fileSource);
    }
  };

  input.addEventListener("blur", () => settle(true));
  input.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent | undefined)?.key;
    if (key === "Enter") {
      event?.preventDefault?.();
      settle(true);
    } else if (key === "Escape") {
      event?.preventDefault?.();
      settle(false);
    }
  });
  return input;
}

/**
 * THE `wired` RENDITION OF A TAG — the class the chip carries, and the only style hook it has.
 *
 * `tagchip`, not `tag`: the app page already styles `.tag` (the hero tagline under the sign-in
 * heading), and reusing a live class name for a different thing is how a stylesheet acquires a
 * rule nobody dares delete. It is deliberately ONE class on ONE element, scoped in app/index.html to
 * `.viewbody .tagchip`, so a later pass over the app's visual identity has one thing to move.
 */
const TAG_CHIP_CLASS = "tagchip";
const CHIP_OPEN = `<span class="${TAG_CHIP_CLASS}">`;
const CHIP_CLOSE = "</span>";

/**
 * Render `text` with its tags as chips — or with them as characters, if the chip would not survive.
 *
 * ── WHY THE CHIP IS PUT INTO THE MARKDOWN AND NOT INTO THE DOM ──
 *
 * The alternative was to render the line, then walk the built elements and swap tag text for chip
 * elements. That is the painter READING THE PAGE to decide what the page should be, and this whole
 * module exists on the other side of that line. Here the chip is decided from the SOURCE, by the
 * grammar in resolution.ts, and emitted into the ONE markdown call the line was already going to
 * make. Nothing is read back.
 *
 * It also keeps the markdown intact, which segmenting would not. Splitting the text at the tags
 * and rendering each piece separately would break any construct that spans a tag — `**bold #work
 * bold**` would lose its emphasis, and a prose line's list item would close before its own chip.
 * One call in, one string out, tags inside whatever structure markdown-it built.
 *
 * THE INJECTION IS SAFE BY THE GRAMMAR, NOT BY ESCAPING. A tag body is `[A-Za-z0-9_-]`, so a tag
 * cannot contain `<`, `>`, `&` or `"` — there is no character in a matched tag that could close
 * this span or open another element. That is a property of the regex in resolution.ts, cited to
 * the engine, and it is fuzzed in tests/present-tags.test.mjs rather than assumed.
 *
 * ── AND IF THE RENDERER WOULD NOT PASS IT THROUGH, THE CHARACTERS WIN ──
 *
 * markdown-it does not always emit raw HTML verbatim. An indented line is a code block and its
 * content is escaped — and the engine indents nested lines by four spaces, so this is a shape real
 * views contain, not a hypothetical. A renderer configured `html: false` would escape it too.
 * Either way the person would see `&lt;span class="tagchip"&gt;#work` on their screen, which is
 * worse than the `#work` they had before.
 *
 * So the chip is rendered and then CHECKED: every span that went in has to come out. If they do
 * not, the text is rendered again without them, and the line falls back to exactly what the app
 * showed before this key existed. The fallback is all-or-nothing on purpose — a line with one
 * chip and one escaped chip would be the worst of both. This check is also what stops the chip
 * from depending on `html: true`: it does not assert the renderer's configuration, it observes
 * what the renderer did with this line.
 */
function renderTags(text: string, tags: Rendition, render: (markdown: string) => string): string {
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

/**
 * Paint a view's markdown into `body`.
 *
 * The DOM this produces for a silent context is byte-identical to what `paintView`
 * (app.html:234-269 at 64c3a87) produced — proven by tests/present-golden.test.mjs, which runs
 * that exact function out of the git history against the same fixtures and the same renderer.
 * The element order, the class strings, the indent arithmetic, the heading demotion and the
 * blank-line drop below are transcriptions, not rewrites.
 */
export function paint(
  body: HTMLElement,
  source: string,
  context: PresentationContext,
  deps: PaintDeps,
): void {
  const focus = deps.focus;

  /**
   * Paint the whole view again, from a source string.
   *
   * The focus surface reacts by REPAINTING rather than by mutating one element in place, and that
   * is the cheap way to keep the cascade the only decider: after a focus change every line is
   * resolved again, from scratch, against the context it should have. A patch-one-element
   * implementation would have to know which lines a focus change could possibly affect — which is
   * a second copy of the precedence order, in the painter, which is the thing the design forbids.
   */
  const repaint = (nextSource: string): void => {
    paint(body, nextSource, context, deps);
  };

  /**
   * Give a wired rendition somewhere for the cursor to land — the missing surface, in five lines.
   *
   * `preventDefault` is not decoration. A task line is a `<label>` wrapping the checkbox, and a
   * click anywhere inside a label activates its control, so without it clicking the TEXT of a
   * task to read its source would also tick the box. `stopPropagation` keeps a click on a nested
   * element from also being read as a click on its parent line.
   */
  const focusable = (element: HTMLElement, lineIndex: number): void => {
    if (focus === undefined) {
      return;
    }
    element.addEventListener("click", (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      focus.focus(lineIndex);
      repaint(source);
    });
  };

  /** The raw rendition, embodied for the surface this paint actually has. */
  const raw = (lineSource: string, lineIndex: number): void => {
    if (focus === undefined) {
      body.append(rawText(lineSource));
      return;
    }
    // THE LINE AND THE FILE ARE TWO ARGUMENTS AND THEY ARE NAMED APART. The input shows ONE
    // line; every edit it computes is against the WHOLE file, because the whole file is the
    // write unit and the server overwrites what it is sent. Collapsing them into one `source`
    // parameter is not a tidy-up — it was the first version of this function, and it produced a
    // "file" one line long: tests/present-focus.test.mjs caught it in section 2.
    const input = rawInput(lineSource, lineIndex, source, focus, deps, repaint);
    // APPEND BEFORE FOCUS. `focus()` on an element that is not in the document does nothing, so
    // the order here is what puts the cursor in the line a person just clicked.
    body.append(input);
    if (focus.isFocused(lineIndex)) {
      (input as HTMLInputElement).focus?.();
    }
  };

  body.innerHTML = "";

  source.split("\n").forEach((line, index) => {
    const shape = classifyLine(line);

    if (shape.kind === "blank") {
      // A blank line has no rendition at either end — it vanished in the old painter and it
      // vanishes here — so there is nothing to resolve and nowhere for a cursor to land.
      return;
    }

    // ONE CASCADE PER LINE, because FOCUS is a fact about ONE line. The other six levels say the
    // same thing all the way down the view; this is the rung that does not, and building the
    // context per line is what lets the painter stay ignorant of which rung that is.
    const cascade = new PresentationCascade(
      focus === undefined ? context : focus.contextFor(index, context),
    );

    if (shape.kind === "checkbox") {
      if (cascade.resolve("checkbox").rendition === "raw") {
        raw(shape.source, index);
        return;
      }
      const row = document.createElement("label");
      row.className = "task" + (shape.done ? " done" : "");
      // Two spaces of source indent is one nesting level, and one nesting level is 1.2rem.
      // Carried across unchanged from app.html:246 — the arithmetic is a presentation decision
      // and it now lives in the painter rather than in a page.
      row.style.marginLeft = (shape.indent.length / 2) * 1.2 + "rem";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = shape.done;
      box.addEventListener("change", () => {
        // The affordance's source edit, computed in the module that owns source edits. The
        // painter never reads the DOM to build markdown; it reads the source string it was
        // given. tests/present-cascade.test.mjs proves that by corrupting the rendered DOM
        // first and asserting the posted markdown is unaffected.
        const markdown = applyEdit(source, {
          kind: "set-checkbox",
          lineIndex: index,
          checked: box.checked,
        });
        deps.onCheckboxToggle?.({ lineIndex: index, checked: box.checked, markdown, box, row });
      });
      const span = document.createElement("span");
      // THE TAG RENDITION IS RESOLVED PER LINE, LIKE EVERY OTHER ONE. Asked before it is used and
      // asked on every line the painter reaches, so a declaration that never changes the DOM is
      // still a declaration that was READ — the difference between a key with a reader and a key
      // that happens to agree with the default.
      span.innerHTML = renderTags(shape.tail, cascade.resolve("tags").rendition, (markdown) =>
        deps.markdown.renderInline(markdown),
      );
      // THE TEXT IS THE CURSOR TARGET AND THE BOX IS THE TOGGLE. Two affordances on one line,
      // kept apart by which element carries which listener: click the words to read the source,
      // click the box to tick it.
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
      // `#` demotes one level and clamps at 6: the view's own `#` is the page's `<h2>`, because
      // the page already owns an `<h1>`. app.html:259, unchanged.
      const el = document.createElement("h" + String(Math.min(shape.hashes.length + 1, 6)));
      // The heading's OWN `#`es are not tags and cannot be: `classifyLine` has already taken them
      // off, and the grammar would refuse them anyway (`#` then a space is not a tag body). What
      // is left is the heading's text, which may carry tags like any other line.
      el.innerHTML = renderTags(shape.text, cascade.resolve("tags").rendition, (markdown) =>
        deps.markdown.renderInline(markdown),
      );
      focusable(el, index);
      body.append(el);
      return;
    }

    if (cascade.resolve("prose").rendition === "raw") {
      raw(shape.source, index);
      return;
    }
    // Everything else is its own one-line markdown document. Block render, not inline — that is
    // what makes a `- item` line a list and a `| a | b |` line a table row. app.html:266.
    const div = document.createElement("div");
    // BLOCK RENDER, AND THE CHIP GOES IN BEFORE IT. This is the branch that carries most of the
    // real tags in a real view: the engine emits a non-checkbox line as `- title #tag`, which is
    // not a task and lands here. It is also the branch where the renderer sometimes refuses the
    // chip — four spaces of indent is an indented code block to markdown-it — which is what
    // renderTags's all-or-nothing fallback is for.
    div.innerHTML = renderTags(shape.source, cascade.resolve("tags").rendition, (markdown) =>
      deps.markdown.render(markdown),
    );
    focusable(div, index);
    body.append(div);
  });
}

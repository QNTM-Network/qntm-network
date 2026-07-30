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
import { classifyLine } from "./resolution.js";
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

export interface PaintDeps {
  readonly markdown: InlineMarkdown;
  readonly onCheckboxToggle?: (toggle: CheckboxToggle) => void;
}

/**
 * The `raw` rendition: the characters, verbatim.
 *
 * NOT REACHABLE FROM THE SHIPPED APP TODAY — DEFAULT is `wired` for both keys and no level
 * contributes, so nothing selects this. It exists because a cascade whose keys have one
 * admissible value is decoration: without a second rendition, `resolve` cannot be proven to be
 * obeyed, migration stage 2's falsifier ("flip one key to raw and assert the painted DOM
 * changes") cannot be written, and stage 3's rule has no rendition to switch to.
 *
 * `textContent`, never `innerHTML` — raw means the source characters as characters, which also
 * makes this the one rendition that offers no affordance at all and therefore needs no source
 * edit. It is the safest point on the dial, which is why it is the one that ships first.
 */
function rawLine(source: string): HTMLElement {
  const div = document.createElement("div");
  div.textContent = source;
  return div;
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
  const cascade = new PresentationCascade(context);
  body.innerHTML = "";

  source.split("\n").forEach((line, index) => {
    const shape = classifyLine(line);

    if (shape.kind === "checkbox") {
      if (cascade.resolve("checkbox").rendition === "raw") {
        body.append(rawLine(shape.source));
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
      span.innerHTML = deps.markdown.renderInline(shape.tail);
      row.append(box, span);
      body.append(row);
      return;
    }

    if (shape.kind === "heading") {
      if (cascade.resolve("heading").rendition === "raw") {
        body.append(rawLine(shape.source));
        return;
      }
      // `#` demotes one level and clamps at 6: the view's own `#` is the page's `<h2>`, because
      // the page already owns an `<h1>`. app.html:259, unchanged.
      const el = document.createElement("h" + String(Math.min(shape.hashes.length + 1, 6)));
      el.innerHTML = deps.markdown.renderInline(shape.text);
      body.append(el);
      return;
    }

    if (shape.kind === "blank") {
      return;
    }

    // Everything else is its own one-line markdown document. Block render, not inline — that is
    // what makes a `- item` line a list and a `| a | b |` line a table row. app.html:266.
    const div = document.createElement("div");
    div.innerHTML = deps.markdown.render(shape.source);
    body.append(div);
  });
}

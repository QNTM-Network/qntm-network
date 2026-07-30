/**
 * Presentation-cascade scenario — the observed runtime for app/present/.
 *
 * flow-trace's node observer imports this module, installs its load hook first, and records every
 * cross-module call the run makes. Those CallRecords are what the `app/present/...` entries in
 * flows.yaml are measured against, so this file is the reason those declarations have an OBSERVED
 * half rather than only a static one. It exports `run()`, the same convention render_and_edit.ts
 * and the Python scenarios use.
 *
 * WHAT IT DRIVES — the whole chain, in the order the app produces it:
 *   contextFor a served declaration -> readDeclaration  (what does the INSTANCE declare)
 *   paint(...)            -> classifyLine            (what IS this line)
 *   paint(...)            -> PresentationCascade.resolve  (how is it SHOWN)
 *   resolve(...)          -> PresentationContext.at  (what does this level say)
 *   resolve(...)          -> isSilent                (does it say anything)
 *   the checkbox's change -> applyEdit               (the affordance, as a source-string edit)
 *
 * The last edge is the one worth naming. It is the structural form of the governing constraint:
 * the only thing that computes an edit is source.ts, and the painter reaches it. An affordance
 * that appeared without that edge would be an affordance with no source edit.
 *
 * IT RESOLVES TWICE, ONCE PER END OF THE DIAL. First with a silent context (the shipped app's
 * state — everything falls through to DEFAULT), then with a GLOBAL contribution of `raw`. A
 * scenario that only ever drove the default would record the same edges while proving nothing
 * about whether the answer is obeyed.
 *
 * WHAT IS STUBBED, and why that is honest. The modules under app/present/ are REAL — nothing here
 * substitutes for any of them, and every call recorded is a genuine call. What is faked is the
 * browser (a handful of objects carrying only the members paint() touches) and the markdown
 * renderer (an identity transform). The renderer is injected in production too, so substituting
 * it changes nothing structural; and the claim this scenario supports is "these modules call each
 * other this way", not "the page looks right". Do not read one as the other — the painted output
 * is proven separately, and by comparison, in tests/present-golden.test.mjs.
 *
 * THIS SCENARIO CANNOT BE RUN IN THIS ENVIRONMENT TODAY. `flow-trace verify .` exits 2 before
 * reaching it, because the TOOL's JS observer has no node_modules (the fix is `npm ci` in
 * tools/flow-trace/js/, in the tool's own checkout, which this branch must not touch). It is
 * written and committed anyway so the declarations it observes are not declarations without a
 * reader the moment the tool works again. The same properties ARE exercised today, by
 * tests/present-cascade.test.mjs under `node --test`, which runs in this repo's CI.
 */

import { paint } from "../../app/present/paint.js";
import { PresentationContext, presentationFromDeclaration } from "../../app/present/context.js";
import type { InlineMarkdown } from "../../app/present/paint.js";

const SOURCE = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29",
  "  - [x] sub-step done [[qntm:122]] #task",
  "prose that is its own one-line document",
].join("\n");

type Listener = () => void;

/** The smallest object that satisfies what paint() touches — no more surface than that. */
class StubElement {
  tagName: string;
  className = "";
  type = "";
  checked = false;
  innerHTML = "";
  textContent = "";
  readonly style: Record<string, string> = {};
  readonly children: StubElement[] = [];
  readonly #listeners = new Map<string, Listener[]>();

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  append(...nodes: StubElement[]): void {
    this.children.push(...nodes);
  }

  addEventListener(type: string, listener: Listener): void {
    const existing = this.#listeners.get(type) ?? [];
    existing.push(listener);
    this.#listeners.set(type, existing);
  }

  /** Fire the handlers paint() registered — this is what makes the scenario a real run. */
  dispatch(type: string): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener();
    }
  }

  descendants(out: StubElement[] = []): StubElement[] {
    for (const child of this.children) {
      out.push(child);
      child.descendants(out);
    }
    return out;
  }
}

// Identity, not markdown-it. See the note above: the renderer is a dependency in production too,
// and the structural claim is unaffected by which one is supplied.
const markdown: InlineMarkdown = {
  renderInline: (text: string): string => text,
  render: (text: string): string => text,
};

export function run(): void {
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tagName: string): StubElement => new StubElement(tagName),
  };

  // 1. The default paint — every level silent, so every key falls through to DEFAULT.
  const body = new StubElement("article");
  let posted: string | null = null;
  // The stub satisfies exactly what paint() touches and nothing more, so the cast is the
  // scenario asserting that fact rather than importing a 300-member DOM type to restate it.
  paint(body as unknown as HTMLElement, SOURCE, new PresentationContext(), {
    markdown,
    onCheckboxToggle: (toggle) => {
      posted = toggle.markdown;
    },
  });
  if (!body.descendants().some((el) => el.type === "checkbox")) {
    throw new Error("the default resolution did not produce a checkbox");
  }
  if (!body.descendants().some((el) => el.tagName === "h3")) {
    throw new Error("the default resolution did not demote the heading");
  }

  // 2. The affordance — paint -> source.applyEdit, and the posted file is the WHOLE file.
  const box = body.descendants().find((el) => el.type === "checkbox");
  if (box === undefined) {
    throw new Error("no checkbox to toggle");
  }
  box.checked = true;
  box.dispatch("change");
  if (posted === null) {
    throw new Error("toggling produced no source edit");
  }
  if ((posted as string).split("\n").length !== SOURCE.split("\n").length) {
    throw new Error("the edit did not return the whole file");
  }

  // 3. The other end of the dial, ARRIVING AS A SERVED DECLARATION rather than as a context
  //    built by hand (migration stage 2). This is the edge that makes "the declaration reaches"
  //    an observed fact: context -> declaration.readDeclaration, then the same painter obeying
  //    the same cascade. A hand-built context would exercise the painter and prove nothing about
  //    the reader.
  const declared = presentationFromDeclaration({
    note: "the shape presentation.json has, flipped to the raw end",
    checkbox: "raw",
    heading: "raw",
  });
  if (declared.problems.length !== 0) {
    throw new Error(`the declaration did not read cleanly: ${declared.problems.join("; ")}`);
  }
  const raw = new StubElement("article");
  paint(raw as unknown as HTMLElement, SOURCE, declared.context, { markdown });
  if (raw.descendants().some((el) => el.type === "checkbox")) {
    throw new Error("a raw resolution still produced a checkbox — the painter is not obeying");
  }
  if (!raw.descendants().some((el) => el.textContent === "## Overdue")) {
    throw new Error("a raw resolution did not carry the source characters");
  }
}

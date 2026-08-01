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
 *   paint(...)            -> tagSpans                (WHERE ARE ITS TAGS — the token-level grammar)
 *   paint(...)            -> PresentationCascade.resolve  (how is it SHOWN)
 *   resolve(...)          -> PresentationContext.at  (what does this level say)
 *   resolve(...)          -> isSilent                (does it say anything)
 *   paint(...)            -> FocusSurface.contextFor (WHERE IS THE CURSOR — the derived level)
 *   contextFor(...)       -> PresentationContext.with (that level, layered onto the declared ones)
 *   the checkbox's change -> applyEdit               (the affordance, as a source-string edit)
 *   the focused line's blur -> applyEdit             (the second affordance, the same one module)
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
 * ── IT RUNS. CORRECTED 2026-07-30 (stage 8), BECAUSE THE PARAGRAPH THAT WAS HERE WAS A FOSSIL ──
 *
 * This header used to open "THIS SCENARIO CANNOT BE RUN IN THIS ENVIRONMENT TODAY", because
 * `flow-trace verify .` exited 2 when it was written. That was fixed in the TOOL's own checkout on
 * the afternoon of the same day and .flow-trace.yaml has said so since; this file was the last
 * place still claiming the opposite. `verify .` runs this scenario and reports its edges.
 *
 * WHAT IS TRUE INSTEAD, AND IT SHAPES THIS FILE: the observer TRUNCATES its own capture. Runs drop
 * the last records a scenario produces — the focus edges, the second applyEdit — which surface as
 * INFO "declared but not observed" and never as FAIL. Pre-existing and the tool's; .flow-trace.yaml
 * carries the measurements and the two wrong diagnoses that preceded the right one.
 *
 * THE CONSEQUENCE FOR A SCENARIO AUTHOR IS CONCRETE, and it is why SOURCE below is four lines: a
 * SIX-line fixture put this scenario permanently the wrong side of the budget, losing six edges on
 * every single run; four lines does not. It does not remove the residual flake and nothing here
 * can — but it is the difference between "sometimes" and "always".
 */

import { paint } from "../../app/present/paint.js";
import { PresentationContext, presentationFromDeclaration } from "../../app/present/context.js";
import { DraftSurface } from "../../app/present/draft.js";
import { FocusSurface } from "../../app/present/focus.js";
import type { InlineMarkdown } from "../../app/present/paint.js";

/**
 * THE SMALLEST VIEW THAT REACHES EVERY BRANCH THE PAINTER HAS — a heading, a blank line, a task
 * with tags, and a prose line. Four lines, and the size is DELIBERATE rather than lazy.
 *
 * A scenario exists to make each declared edge OBSERVABLE ONCE; every line beyond that is pure
 * capture volume, and capture volume is not free here — six lines cost this scenario six edges on
 * every run, four lines does not (the header above, and .flow-trace.yaml, carry the numbers). What
 * the PAINTED OUTPUT looks like is proven somewhere else entirely and against much bigger fixtures
 * (tests/present-golden.test.mjs, a whole view plus a 1,125-case sweep). Do not grow this one to
 * make it look thorough.
 */
const SOURCE = [
  "## Overdue",
  "",
  "- [ ] Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29",
  "prose that is its own one-line document",
].join("\n");

/** The line the cursor lands on in section 4 — named once so the index is not typed three times. */
const FOCUSED_LINE_INDEX = 2;

type Listener = () => void;

/** The smallest object that satisfies what paint() touches — no more surface than that. */
class StubElement {
  tagName: string;
  className = "";
  type = "";
  value = "";
  focused = false;
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

  /** The cursor arriving. Recorded, not simulated — the painter calls it. */
  focus(): void {
    this.focused = true;
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

  // 3b. THE FIRST TOKEN RENDITION (migration stage 8). `tags: wired` is the one declaration in
  //     the served file whose value is NOT the built-in default, so this is the run in which a
  //     declaration genuinely changes the page. It is also the edge that makes the tag GRAMMAR
  //     observable: paint -> resolution.tagSpans, which fires only on the wired path, because
  //     asking where the tags are when nothing will be done with them is work nobody asked for.
  const chipped = presentationFromDeclaration({
    note: "the shape presentation.json actually has, as served",
    checkbox: "wired",
    heading: "wired",
    prose: "wired",
    tags: "wired",
  });
  if (chipped.problems.length !== 0) {
    throw new Error(`the served declaration did not read cleanly: ${chipped.problems.join("; ")}`);
  }
  //     ONE LINE, NOT THE WHOLE FIXTURE. A scenario exists to make an edge OBSERVABLE, and one
  //     chipped line does that as well as forty.
  //
  //     WHILE ESTABLISHING THAT, A TOOL-SIDE FLAKE WAS MEASURED, AND THE FIRST DIAGNOSIS OF IT WAS
  //     WRONG — recorded here because the wrong version is the one a later reader would otherwise
  //     repeat. `flow-trace verify .` is INTERMITTENT on this project: most runs report every
  //     declared flow, and some lose the LAST edges a run produces (FocusSurface.blur,
  //     FocusSurface.isFocused, the second applyEdit), which surface as INFO "declared but not
  //     observed" and never as FAIL. The first five runs over the unmodified base commit came back
  //     identical, which made it look as though this change had introduced it — so this section
  //     was cut down. Eight more base runs then flaked three times (29 29 29 29 29 / 29 27 29 26
  //     29 29 26 29), and the branch flaked at a comparable rate (20 of 24). IT IS PRE-EXISTING
  //     AND IT IS THE TOOL'S, not this scenario's and not this repo's. The section stays small
  //     anyway: it is the right size for what it proves.
  const CHIPPED_LINE = "- [ ] Ship the chip [[qntm:9]] #task #work";
  const withChips = new StubElement("article");
  paint(withChips as unknown as HTMLElement, CHIPPED_LINE, chipped.context, { markdown });
  const chipCount = withChips
    .descendants()
    .map((el) => el.innerHTML.split('<span class="tagchip">').length - 1)
    .reduce((total, count) => total + count, 0);
  if (chipCount !== 2) {
    throw new Error(`a declaration of tags: wired produced ${chipCount} chips, not 2`);
  }
  // And the same painter, the same line, one key flipped: no chip at all. A run that only ever
  // drove the wired end would record the same edge while proving nothing about whether the
  // declaration is what decided.
  const unchipped = new StubElement("article");
  paint(
    unchipped as unknown as HTMLElement,
    CHIPPED_LINE,
    presentationFromDeclaration({ tags: "raw" }).context,
    { markdown },
  );
  if (unchipped.descendants().some((el) => el.innerHTML.includes("tagchip"))) {
    throw new Error("a declaration of tags: raw still produced a chip — the key is inert");
  }

  // 3c. THE SECOND TOKEN RENDITION (2026-08-01). `stamp: wired` is the other declaration in the
  //     served file whose value is not the built-in default, and this is the edge that makes the
  //     IDENTITY grammar observable: paint -> resolution.stampSpans. Declared as its own flow
  //     rather than folded into the tag edge, because the two grammars are deliberately different
  //     WIDTHS and an edge that hid which one this rendition hides by would hide the whole
  //     boundary argument (docs/architecture/flows.yaml,
  //     paint-finds-the-identity-stamp-in-the-line).
  //
  //     THE SAME LINE, THE SAME PAINTER, ONE KEY FLIPPED — the shape section 3b already uses,
  //     because a run that only ever drove the wired end would record the edge while proving
  //     nothing about whether the DECLARATION is what decided.
  const marked = new StubElement("article");
  paint(
    marked as unknown as HTMLElement,
    CHIPPED_LINE,
    presentationFromDeclaration({ checkbox: "wired", stamp: "wired" }).context,
    { markdown },
  );
  const markCount = marked
    .descendants()
    .map((el) => el.innerHTML.split('<span class="stampmark"').length - 1)
    .reduce((total, count) => total + count, 0);
  if (markCount !== 1) {
    throw new Error(`a declaration of stamp: wired produced ${markCount} marks, not 1`);
  }
  if (marked.descendants().some((el) => el.innerHTML.includes("[[qntm:9]]"))) {
    throw new Error("a declaration of stamp: wired still printed the identity stamp");
  }
  const unmarked = new StubElement("article");
  paint(
    unmarked as unknown as HTMLElement,
    CHIPPED_LINE,
    presentationFromDeclaration({ checkbox: "wired", stamp: "raw" }).context,
    { markdown },
  );
  if (unmarked.descendants().some((el) => el.innerHTML.includes("stampmark"))) {
    throw new Error("a declaration of stamp: raw still produced a mark — the key is inert");
  }
  if (!unmarked.descendants().some((el) => el.innerHTML.includes("[[qntm:9]]"))) {
    throw new Error("a declaration of stamp: raw did not carry the identity stamp's characters");
  }

  // 4. THE CURSOR RULE (migration stage 3). A focus surface is supplied, one line is focused, and
  //    the painter is driven end to end: paint -> FocusSurface.contextFor -> PresentationContext
  //    .with, then the settled line -> source.applyEdit. This is the run that makes the FOCUS
  //    level an OBSERVED level rather than a declared one, and it is deliberately driven through
  //    the painter rather than by calling the surface directly — a cursor nothing paints against
  //    proves nothing about the rule.
  const focus = new FocusSurface();
  const focused = new StubElement("article");
  let committed: string | null = null;
  paint(focused as unknown as HTMLElement, SOURCE, new PresentationContext(), {
    markdown,
    focus,
    onLineCommit: (commit) => {
      committed = commit.markdown;
    },
  });
  // THE GESTURE ITSELF, not a pre-set cursor: the click on a task line's text is what calls
  // FocusSurface.focus and repaints. Setting the cursor by hand before the paint would record a
  // different set of edges from the one the app actually produces.
  const target = focused.descendants().find((el) => el.tagName === "span");
  if (target === undefined) {
    throw new Error("no task line text to put the cursor on");
  }
  target.dispatch("click");
  const line = focused.descendants().find((el) => el.type === "text");
  if (line === undefined) {
    throw new Error("clicking a line's text produced no editable line");
  }
  if (line.value !== SOURCE.split("\n")[FOCUSED_LINE_INDEX]) {
    throw new Error("the focused line did not carry its verbatim source");
  }
  line.value = "- [x] Draft the launch note [[qntm:121]] #task #work ✅ 2026-07-30";
  line.dispatch("blur");
  if (committed === null) {
    throw new Error("the settled line produced no source edit");
  }
  const before = SOURCE.split("\n");
  const after = (committed as string).split("\n");
  const changed = before.map((_, index) => index).filter((index) => before[index] !== after[index]);
  if (changed.length !== 1 || changed[0] !== FOCUSED_LINE_INDEX) {
    throw new Error(`the edit changed lines ${changed.join(", ")} — it must change exactly one`);
  }

  // 5. A LINE THAT DID NOT EXIST (2026-07-31). The third source edit, and the only affordance
  //    whose answer cannot come from the characters in front of it — there are none. The edges it
  //    makes observable are paint -> newline.seedFor (WHAT IS a new line here), newline ->
  //    resolution.chromeOf (read the shape the ENGINE printed, rather than re-derive the cascade),
  //    paint -> draft.DraftSurface.open (where a line that is not in the file lives), and
  //    source -> resolution.carriesContent (the refusal that stops a node with no title).
  //
  //    IT IS SIX LINES OF SCENARIO AND THAT IS DELIBERATE. The header above records that this
  //    observer TRUNCATES its own capture and that six FIXTURE lines put this scenario permanently
  //    the wrong side of the budget. The fixture is unchanged; what is added is one gesture over
  //    the source that is already here.
  const drafting = new DraftSurface();
  const made = new StubElement("article");
  let inserted: string | null = null;
  paint(made as unknown as HTMLElement, SOURCE, new PresentationContext(), {
    markdown,
    focus: new FocusSurface(),
    draft: drafting,
    onLineCommit: (commit) => {
      inserted = commit.markdown;
    },
  });
  // The gesture: click the space below the last line. That is the operator's second ask, and it is
  // the one that reaches `seedFor` without having to settle a line first.
  const below = made.children.find((el) => el.className === "newline");
  if (below === undefined) {
    throw new Error("the painter offered no space below the last line");
  }
  below.dispatch("click");
  const opened = made.descendants().find((el) => el.type === "text");
  if (opened === undefined) {
    throw new Error("clicking below the last line opened no line");
  }
  // The seed is the cascade's answer read off what the engine printed: the fixture's node line is
  // a checkbox, so a new line beside it is one. A scenario that only asserted "a row appeared"
  // would record the same edges while proving nothing about whether the answer was obeyed.
  if (opened.value !== "- [ ] ") {
    throw new Error(`a new line was seeded ${JSON.stringify(opened.value)}, not from the cascade`);
  }
  // Settling it with nothing in it must post NOTHING — the refusal that stops the engine minting a
  // node titled nothing, which it does with no guard of its own.
  opened.dispatch("blur");
  if (inserted !== null) {
    throw new Error("a line with no content produced a file to post");
  }
}

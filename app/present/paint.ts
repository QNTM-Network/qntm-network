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
import type { DraftSurface } from "./draft.js";
import type { FocusSurface } from "./focus.js";
import { instancesOf } from "./instance.js";
import type { ModeSurface } from "./motions.js";
import { openLine } from "./newline.js";
import type { GlobalRegistration } from "./newline.js";
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
 *
 * `source` is the string that edit was applied TO — see `LineCommit.source` for what it is for.
 */
export interface CheckboxToggle {
  readonly lineIndex: number;
  readonly checked: boolean;
  readonly markdown: string | null;
  readonly source: string;
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
  /**
   * WHICH `applyEdit` CASE PRODUCED THIS COMMIT — `"set-line"` (`rawInput`, an existing row) or
   * `"insert-line"` (`draftInput`, a row that did not exist a moment ago). Provenance, not a
   * fourth edit kind: `SourceEdit`'s closed union is untouched, this is a copy of the literal
   * already passed to `applyEdit` at each call site below.
   *
   * WHY A CALLER NEEDS IT: for `"set-line"`, `source.split("\n")[lineIndex]` IS the line's own
   * text a moment ago — a real "before" a caller can compare `text` against. For `"insert-line"`,
   * that same index in `source` is a DIFFERENT, unrelated line that is about to be pushed down —
   * `insert-line` makes room for the new row rather than replacing one — so treating it as "the
   * line's own before" would compare two different lines and call it one line's history. A caller
   * that cannot tell the two apart has no honest way to ask "did this line's own answer change".
   */
  readonly kind: "set-line" | "insert-line";
  /**
   * THE STRING THE EDIT WAS APPLIED TO — `applyEdit`'s own input, verbatim.
   *
   * It is here because the WHOLE FILE goes on the wire and the server overwrites what it is sent,
   * so "which copy of the file was this computed from" is a fact about the write that only the
   * painter knows: the source a row closes over is the string that paint was handed, and after an
   * optimistic repaint (`settle` below) that is a string the app computed rather than one the
   * server sent. The caller compares it against the served copy (`app/present/base.ts`) and hashes
   * it for the wire. The painter neither compares nor hashes — it reports which base it used.
   *
   * NOT A SECOND WRITE UNIT AND NOT A NEW EDIT KIND. `markdown` is still the whole view and still
   * the only thing posted; `SourceEdit` is still the closed union of three.
   */
  readonly source: string;
}

/**
 * What the caller is handed when a line that DID NOT EXIST settles with characters in it.
 *
 * DELIBERATELY THE SAME SHAPE AS `LineCommit`, AND HANDED TO THE SAME CALLBACK. `markdown` is the
 * WHOLE view source with exactly one line inserted, or `null` if the insertion was refused — an
 * index outside the file, text carrying a newline, or (the one that matters) a line with no content
 * in it. There is no second endpoint, no second write unit and no second place a view is replaced:
 * the page's `commitLine` posts `commit.markdown` and does not know or need to know whether the
 * line it is posting is a replacement or an addition. That is what "the write path stays single"
 * means when it is a property rather than a promise.
 */

export interface PaintDeps {
  readonly markdown: InlineMarkdown;
  /**
   * THE VIEW'S OWN ID — `view.id` off the wire payload (`app/index.html`'s `{id, path, title,
   * markdown}`) — optional, and its absence is a real configuration exactly as `focus`'s is.
   *
   * IT IS WHAT MAKES A `data-instance` ROW-KEY POSSIBLE AND NOTHING ELSE. Without it every row
   * still paints exactly as it always has — no `dataset.instance`, byte-identical to every test
   * written before `instance.ts` existed, which is why the golden master needed no edit. With it,
   * every non-blank row this paint draws carries `data-instance`, computed once per paint
   * (`instance.ts`'s `instancesOf`, one pass, not one call per line) rather than reconstructed by a
   * caller reading the DOM back — the same "compute once, attribute, never re-derive from the page"
   * rule `renderTags` already follows for chips. Two views sharing a section ordinal and a node
   * (impossible today, but the id is opaque and must not assume it stays impossible) would collide
   * without it, which is why it is the FIRST component of the string and not an afterthought.
   */
  readonly view?: string;
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
  /**
   * VIM'S NORMAL/INSERT DISTINCTION — optional, and its absence is a real configuration exactly as
   * `focus`'s is. Without it, `focus` behaves exactly as it always has: a focused line is always
   * raw, always an editable `<input>` (click-to-edit).
   *
   * WITH IT, THE FOCUSED LINE IS STILL ALWAYS RAW — the mode decides only WHICH ELEMENT holds the
   * characters. `NORMAL` builds `normalLine` (spans, a block cursor, not typeable) and `INSERT`
   * builds `rawInput` (an `<input>`). The raw-on-focus contribution is NOT gated on the mode; it
   * was for one release and that was the defect this field's own note used to describe as the
   * design. See motions.ts for why the mode is still not a fifth `Contribution` key: NORMAL/INSERT
   * is a fact about which line may be EDITED and which keys are live, never a `Rendition` shift, so
   * it never reaches `PresentationContext`.
   */
  readonly mode?: ModeSurface;
  readonly onLineCommit?: (commit: LineCommit) => void;
  /**
   * WHERE A LINE IS BEING MADE — optional, and its absence is a real configuration exactly as
   * `focus`'s is. Without it a painted view offers no way to create a line at all: Enter settles
   * and leaves, and the space below the last line is not a target. That is what every test written
   * before 2026-07-31 paints, which is why the golden master still compares byte for byte.
   *
   * IT NEEDS `focus` TO BE USEFUL AND DOES NOT ASSERT IT. A draft is a row with a cursor in it, so
   * a draft surface without a focus surface would open lines in an app whose lines cannot be
   * reached — the same half-built configuration `rawInput`'s note describes. The painter simply
   * does not open one, which keeps this an optional dependency rather than a required pair.
   */
  readonly draft?: DraftSurface;
  /**
   * A new line was asked for and the app declined to open one — always because `seedFor` reached
   * the GLOBAL rung with no answer: the view has printed no node line anywhere, AND EITHER
   * `declared` below was not supplied, OR it was and still had nothing to say for this
   * `(view, section)` — see `newline.ts`'s own header for exactly which cases that still is
   * (design-the-resolution-architecture.md step 6 narrowed this, it did not remove it).
   *
   * REPORTED RATHER THAN SWALLOWED. "Nothing happens" is the exact complaint this change exists to
   * answer, and an affordance that declines silently is the same complaint with a new cause. The
   * caller decides what to say; see app/index.html, which says it in the freshness line.
   */
  readonly onNewLineDeclined?: (lineIndex: number) => void;
  /**
   * WHAT THE GLOBAL RUNG READS WHEN NOTHING IS PRINTED — optional, and its absence means the
   * GLOBAL rung refuses exactly as it did before this field existed (design-the-resolution-
   * architecture.md step 6). Threaded straight to `newline.ts`'s `seedFor`/`openLine`; this module
   * builds none of it and interprets none of it, the same "the app reads, never interprets" rule
   * `newline.ts`'s own header states for itself.
   */
  readonly declared?: GlobalRegistration;
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
 * NORMAL MODE'S CURSOR CLASS — the character the block sits on. See app/index.html for its rule.
 */
const VIM_BLOCK_CLASS = "vim-block";

/** The one character a block cursor shows when the line has none at that column. */
const EMPTY_CELL = " ";

/**
 * The `raw` rendition in NORMAL: the line's exact source characters, with a BLOCK CURSOR on one.
 *
 * ── THE HYPOTHESIS THIS REPLACES, AND WHY IT WAS REFUTED BEFORE IT WAS BUILT ──
 *
 * The obvious way to show a character-level cursor on a line is to keep the `<input>` and set
 * `readOnly`: the native caret shows the column for free, `readOnly` blocks typing but permits
 * caret movement, `w` is `setSelectionRange`, and `i` is `readOnly = false` on the SAME element —
 * no re-render, no flicker. It was tested rather than assumed and it does not hold.
 *
 * A READONLY INPUT DOES NOT PAINT A CARET IN TWO OF THE THREE ENGINES. From the CSS Working Group's
 * own July 2025 thread on standardising readonly input styles (`lists.w3.org/Archives/Public/
 * public-css-archive/2025Jul/0463.html`), which enumerates the current divergence: WebKit "doesn't
 * render a text caret and no focus outline ring is rendered"; Firefox "no text caret is rendered";
 * Chromium "renders a text caret (but it doesn't blink)". So on the operator's own platform the
 * cursor would be INVISIBLE — the same symptom as the defect this change exists to fix, with a
 * harder cause to find. `caret-color` cannot rescue it: it colours a caret the engine paints, it
 * does not cause one to be painted.
 *
 * THIS IS WEB EVIDENCE, NOT A MEASUREMENT. Nobody ran a browser in the worktree that produced this
 * file. The claim is "three engines are documented as disagreeing and two of them paint nothing",
 * which is enough to refuse a design whose failure mode is an invisible cursor, and is not the same
 * as having watched one blink.
 *
 * ── AND THE GUARD THAT WOULD HAVE BROKEN FIRST ──
 *
 * app/index.html's global keydown handler refuses every key while `typingIn(e.target)` — and
 * `typingIn` is `tagName === "input"`. A readonly input that the painter focuses in NORMAL is
 * `e.target` for every subsequent keystroke, so `j`, `k` and `w` — the whole of NORMAL mode —
 * would have been swallowed by the guard that protects the capture box. Widening `typingIn` to
 * exempt readonly inputs is one line and would have worked, but it is a line loosening the single
 * guard standing between a global letter binding and the operator's own text fields, spent to buy
 * a caret two engines will not draw. A `<div>` is not `typingIn` anything, so this route needs no
 * such change and the guard is untouched.
 *
 * ── WHAT IS BUILT INSTEAD, AND WHY IT IS BETTER AND NOT MERELY SAFER ──
 *
 * A terminal's own answer: three spans, and the middle one carries the cursor. It paints in every
 * engine because a background colour is not an optional affordance. It is also what vim ACTUALLY
 * LOOKS LIKE — a block in NORMAL, a bar in INSERT — so the mode is legible from the cursor itself
 * rather than only from the badge above the view.
 *
 * ── AND THE ARCHITECTURAL LINE IS UNMOVED ──
 *
 * This is a `<div>` holding TEXT, not a `contenteditable` holding a rendition. Nothing here can be
 * typed into, nothing is ever read back off it, and no markdown is reconstructed from the DOM. The
 * characters go one way: source string in, spans out.
 */
function normalLine(lineSource: string, column: number): HTMLElement {
  const div = document.createElement("div");
  div.className = "rawline " + VIM_SELECTED_CLASS;

  // `textContent` on the CHILDREN, never on the parent: the source characters stay characters, the
  // same guarantee `rawText` above makes, and the three-way split is the only structure added.
  const head = document.createElement("span");
  head.textContent = lineSource.slice(0, column);
  const cell = document.createElement("span");
  cell.className = VIM_BLOCK_CLASS;
  // ONE CHARACTER, OR AN EMPTY CELL. `clampColumn` (motions.ts) already keeps the column on a
  // character that exists for every non-empty line, so the fallback is reached only by a line with
  // no characters at all — which the painter's blank branch normally intercepts before here. A
  // zero-width block is a cursor nobody can see, so the empty cell is drawn rather than nothing.
  cell.textContent = lineSource.slice(column, column + 1) || EMPTY_CELL;
  const tail = document.createElement("span");
  tail.textContent = lineSource.slice(column + 1);

  div.append(head, cell, tail);
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
  openLineAt: (lineIndex: number, from: string) => boolean,
): HTMLElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "rawline";
  input.value = lineSource;
  const mode = deps.mode;

  // ONE SETTLEMENT PER INPUT. Blur can arrive twice (a keypress that commits, then the element
  // losing focus as the repaint removes it), and a second settlement would compute a second edit
  // against a source that has already moved — the first shape a double POST takes.
  let settled = false;
  const settle = (commit: boolean, openBelow = false): void => {
    if (settled) {
      return;
    }
    settled = true;
    const wasFocused = focus.isFocused(lineIndex);
    // LEAVING THE LINE, AND THE TWO THINGS IT CAN MEAN. `deps.mode` absent: this is the app as it
    // was before vim — focus off means off, exactly as `focus.blur()` always did. `deps.mode`
    // present: vim always has a cursor on SOME line, so leaving edit returns to NORMAL and the
    // selection stays on this line — `focus.lineIndex` is left untouched. See motions.ts,
    // `ModeSurface.enterNormal`.
    const leaveInsert = (): void => {
      if (mode !== undefined) {
        mode.enterNormal();
      } else {
        focus.blur();
      }
    };
    if (!commit) {
      // Escape: the cursor leaves and the characters it was holding are dropped. Nothing is
      // computed, nothing is posted, and the line returns to whatever the cascade resolves.
      if (wasFocused) {
        leaveInsert();
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
    deps.onLineCommit?.({ lineIndex, text, markdown, source: fileSource, kind: "set-line" });
    // WHAT THE NEXT PAINT IS OF: the committed file if there was an edit, the file as it stands if
    // there was not. Named once, because the line opened below has to be seeded against the SAME
    // string the paint is about to walk — seeding against the pre-commit source would resolve the
    // new line's shape from characters that are no longer there.
    const next = markdown ?? fileSource;
    const opened = openBelow ? openLineAt(lineIndex + 1, next) : false;
    if (wasFocused) {
      if (opened && mode !== undefined) {
        // Enter opened a NEW editable row below — the pre-existing draft affordance, untouched by
        // vim — and it is about to take the cursor. Report INSERT rather than NORMAL for the
        // instant in which a line really is open for text.
        mode.enterInsert();
      } else {
        leaveInsert();
      }
    }
    if (markdown !== null || wasFocused || opened) {
      // Optimistic, and the same posture the checkbox already had: show the edit immediately,
      // let the caller replace it with the server's copy when the cycle comes back.
      //
      // ONE REPAINT, WHETHER OR NOT A LINE WAS OPENED. Enter used to cost exactly one repaint of
      // the view and it still does — the commit and the opening are decided before anything is
      // drawn, so the row the cursor moves into is drawn by the same pass that takes it out of the
      // row it left. At 670 lines that is the 49 ms one repaint has always cost, not 98.
      repaint(next);
    }
  };

  input.addEventListener("blur", () => settle(true));
  input.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent | undefined)?.key;
    if (key === "Enter") {
      event?.preventDefault?.();
      // ENTER COMMITS THIS LINE AND OPENS THE NEXT ONE, WHEREVER THE CARET IS IN IT.
      //
      // It does NOT split the line at the caret, and that is a decision with a reason rather than
      // an omission. A split is expressible as a source edit — `set-line` for the head plus
      // `insert-line` for the tail — so the governing constraint does not forbid it. What is not
      // decided is what it MEANS: a rendered qntm line carries its node's identity stamp, so
      // splitting `- [ ] Draft the note [[qntm:121]] #task` in the middle hands `[[qntm:121]]` to
      // whichever half it happens to fall in, silently renaming that node to a fragment and
      // minting a second node from the other fragment. Which half keeps the node is a graph
      // decision, and a keystroke with no undo is not where a graph decision belongs. So Enter
      // means one thing everywhere in a line, which is also the simpler thing to learn.
      settle(true, true);
    } else if (key === "Escape") {
      event?.preventDefault?.();
      settle(false);
    }
  });
  return input;
}

/**
 * THE LINE BEING MADE — an `<input>` for a row that is not in the file yet.
 *
 * The same element and the same class as `rawInput`, deliberately: a new line is a raw line whose
 * source happens to be characters nobody has committed, and giving it a box of its own would be the
 * jump this app has already paid to remove (app/index.html, "ONE ROW GEOMETRY, TWO RENDITIONS").
 * It is a separate FUNCTION because its settlement is a different act — `insert-line` rather than
 * `set-line`, and three keys that mean "there is no line here after all" rather than one.
 *
 * ── THE SOURCE IS NEVER SPECULATIVELY MUTATED, WHICH IS THE WHOLE ARRANGEMENT ──
 *
 * `fileSource` is the string the server sent, unchanged, for as long as this row exists. The edit
 * is computed once, at settlement, from that string plus the characters typed. So an abandoned line
 * costs nothing and needs no deletion to undo, and the file this posts is provably the server's
 * file with EXACTLY ONE LINE INSERTED — there is no intermediate state in which it was anything
 * else. See draft.ts for what the alternative would have cost.
 */
function draftInput(
  lineIndex: number,
  seed: string,
  fileSource: string,
  draft: DraftSurface,
  deps: PaintDeps,
  repaint: (nextSource: string) => void,
): HTMLElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "rawline";
  input.value = seed;

  // One settlement per row, for the same reason `rawInput` has one: the repaint that follows a
  // commit removes this element, and removing a focused element fires blur.
  let settled = false;

  /**
   * HAND THE CURSOR BACK TO VIM, ONLY WHEN VIM IS THE ONE HOLDING IT. A draft is not a line
   * `FocusSurface` can point at while it exists — `paintDraft()` focuses this `<input>` directly,
   * with no cascade or mode check at all — so whichever key opened this row (Enter, mid-edit, or
   * `o`/`O` from NORMAL) leaves `focus` blurred while it is open, which is what stops the line the
   * draft opened FROM also turning into an `<input>` the instant `mode.enterInsert()` makes every
   * FOCUSED line raw. Once this row is gone — committed or abandoned — that gap has to close, or
   * `mode` is left INSERT with no `<input>` anywhere and NORMAL's own keydown handler never
   * re-engages (it is gated on `mode.mode === "NORMAL"`).
   *
   * GATED ON `deps.mode`, NOT UNCONDITIONAL: a caller with no `ModeSurface` wired (click-to-edit,
   * every test written before vim existed) never touched `focus` from a draft's settlement before
   * this existed, and nothing in that configuration needs it to now — `leaveInsert`'s own blur is
   * `rawInput`'s way of saying the same thing for the OTHER affordance, in the OTHER function.
   */
  const returnToVim = (source: string): void => {
    if (deps.mode === undefined) {
      return;
    }
    deps.mode.enterNormal();
    if (deps.focus !== undefined) {
      const last = Math.max(0, source.split("\n").length - 1);
      // ANCHORED AGAINST THE SOURCE THE CURSOR IS LANDING IN, which here is the POST-settlement
      // string (`markdown ?? fileSource`, the argument this closure was handed) and not the string
      // the draft opened against. Anchoring against the pre-insert source would describe a line at
      // an index that has just moved.
      deps.focus.focus(Math.min(lineIndex, last), source, 0, deps.view);
    }
  };

  /** There is no line here after all. Not a deletion — nothing was ever in the file. */
  const abandon = (): void => {
    if (settled) {
      return;
    }
    settled = true;
    draft.drop();
    returnToVim(fileSource);
    repaint(fileSource);
  };

  const settle = (): void => {
    if (settled) {
      return;
    }
    settled = true;
    const text = input.value;
    draft.drop();
    // THE ONE PLACE A CREATED LINE BECOMES A FILE, and it is the same function every other
    // affordance in this app goes through. `null` here is a REFUSAL and it is the commonest one:
    // a row opened and left holding nothing but its own chrome. `applyEdit` decides that, not this
    // painter — the guard belongs with the edit so that no future caller can route around it.
    const markdown = applyEdit(fileSource, { kind: "insert-line", lineIndex, text });
    deps.onLineCommit?.({ lineIndex, text, markdown, source: fileSource, kind: "insert-line" });
    returnToVim(markdown ?? fileSource);
    repaint(markdown ?? fileSource);
  };

  input.addEventListener("blur", settle);
  input.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent | undefined)?.key;
    if (key === "Enter") {
      event?.preventDefault?.();
      // ENTER ON A LINE THAT GAINED NOTHING ENDS THE LIST, which is what Enter on an empty item
      // does in every editor the operator uses. It is expressed here as "settle", not as a special
      // case: `applyEdit` refuses a contentless insert, so committing an empty row and abandoning
      // it are the same act with the same outcome — nothing posted, nothing in the file, the row
      // gone. One path, one behaviour, and the emptiness is judged by the grammar rather than by a
      // comparison this function would have to keep in step with it.
      settle();
    } else if (key === "Escape") {
      event?.preventDefault?.();
      abandon();
    } else if (key === "Backspace" && input.value === seed) {
      // BACKSPACE AT THE START OF AN EMPTY NEW LINE CANCELS IT — the conventional gesture, and the
      // only one of the three that had to be given a condition. It fires only while the row still
      // holds EXACTLY what it opened with, so backspacing inside characters a person typed does
      // what backspace always does. It is not a deletion affordance: there is no line to delete.
      event?.preventDefault?.();
      abandon();
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
 * NORMAL MODE'S SELECTION MARK — one class, on whichever element a WIRED line rendered as, when
 * that line is the vim cursor. Deliberately not the caret's own green: `.viewbody input.rawline`
 * marks INSERT with `caret-color` and a bottom hairline, and the brief is explicit that NORMAL's
 * mark must "be clearly not a text caret" — reusing the caret's own visual vocabulary for a
 * DIFFERENT fact would be exactly the confusion that line exists to prevent. See app/index.html
 * for the rule this class carries.
 */
const VIM_SELECTED_CLASS = "vim-selected";

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
 *
 * ── `data-instance`, ONLY WHEN `deps.view` IS SUPPLIED ──
 *
 * Every element this function appends for a non-blank line — whichever of the three `raw()`
 * embodiments fires, the checkbox `<label>`, the heading, the prose `<div>` — carries
 * `dataset.instance`, computed once per paint by `instance.ts`'s `instancesOf` (§ R1 of
 * `design-presentation-instance-identity.md`; see `PaintDeps.view`'s own header for the string's
 * shape). Nothing reads it yet — it is the seam a later change keys a repaint memoiser, a click
 * handler or a drag target off, rather than the closure-per-row `focusable()` builds today. It is
 * absent whenever `deps.view` is, which is every test written before it existed, so the golden
 * master needed no edit for it.
 */
export function paint(
  body: HTMLElement,
  source: string,
  context: PresentationContext,
  deps: PaintDeps,
): void {
  const focus = deps.focus;
  const draft = deps.draft;
  const mode = deps.mode;
  // EVERY PRINTED LINE'S INSTANCE, ONE PASS, ONLY WHEN A CALLER SUPPLIED A VIEW ID. `undefined`
  // rather than a computed-with-empty-string fallback is deliberate: it is what keeps every test
  // written before `instance.ts` existed — and the golden master's byte-identical comparison in
  // particular — painting exactly what it always painted, with no `data-instance` anywhere. See
  // `PaintDeps.view`'s own header for why the id needs the view at all.
  const instances = deps.view === undefined ? undefined : instancesOf(source, deps.view);
  /** `data-instance` on `element`, when this paint has an id for `lineIndex` — a no-op otherwise. */
  const stampInstance = (element: HTMLElement, lineIndex: number): void => {
    const info = instances?.[lineIndex];
    if (info !== undefined && info !== null) {
      element.dataset.instance = info.instance;
    }
  };

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
      // THE SOURCE GOES WITH THE INDEX. A cursor that landed without one is a cursor that cannot
      // be found again after a projection arrives — see focus.ts's `focus`, and instance.ts for
      // what that used to cost. `source` is the string this paint was handed, which is the string
      // the line the person just clicked came out of; `deps.view` is the same id `data-instance`
      // above is computed from, so the anchor and the row's own key agree.
      focus.focus(lineIndex, source, 0, deps.view);
      // A CLICK HAS ALWAYS MEANT "EDIT THIS LINE", and vim does not take that away — it only adds
      // a keyboard path that does not need one. `mode` absent: no-op, exactly as before this
      // field existed.
      mode?.enterInsert();
      repaint(source);
    });
  };

  /**
   * Ask for a line at `lineIndex`, resolved against `from`. Returns whether one was opened.
   *
   * THE PAINTER STILL DOES NOT DECIDE — this is now a two-line wrapper around `newline.ts`'s
   * `openLine`, adding only the `draft`/`focus` optionality `PaintDeps` carries. `openLine` owns
   * "ask `seedFor`, obey the refusal"; this function and app/index.html's `o`/`O` handling are its
   * two callers, not two implementations of it. See newline.ts for what the two available guesses
   * would cost, one of which aborts the operator's entire cycle.
   */
  const openLineAt = (lineIndex: number, from: string): boolean => {
    if (draft === undefined || focus === undefined) {
      return false;
    }
    return openLine(from, lineIndex, draft, deps.onNewLineDeclined, deps.declared);
  };

  /**
   * The raw rendition, embodied for the surface this paint actually has — and for the MODE it is in.
   *
   * THREE EMBODIMENTS OF ONE RENDITION, WHICH IS THE SHAPE THIS FUNCTION ALREADY HAD. `raw` means
   * "show the characters" at every rung of the cascade; what differs is whether they can be
   * REACHED, and by what:
   *
   *   no focus surface — inert text. Stage 1's painter, and the golden master's.
   *   NORMAL          — the characters, with a block cursor on one of them. Not typeable.
   *   INSERT (or no
   *   mode surface)   — an `<input>`. Typeable, and the only place the file can change.
   *
   * The middle one is new and the other two are not touched. That ordering is why widening
   * `focusLive` below could not change what a pre-vim caller paints: without a `ModeSurface` there
   * is no NORMAL to be in.
   */
  const raw = (lineSource: string, lineIndex: number): void => {
    if (focus === undefined) {
      const text = rawText(lineSource);
      stampInstance(text, lineIndex);
      body.append(text);
      return;
    }
    if (mode !== undefined && mode.mode === "NORMAL" && focus.isFocused(lineIndex)) {
      const line = normalLine(lineSource, focus.column);
      // A CLICK STILL MEANS "EDIT THIS LINE". Every other rendition gets this from `focusable`, and
      // the selected line must not be the one row on screen that stops answering the mouse just
      // because the keyboard has reached it.
      focusable(line, lineIndex);
      stampInstance(line, lineIndex);
      body.append(line);
      return;
    }
    // THE LINE AND THE FILE ARE TWO ARGUMENTS AND THEY ARE NAMED APART. The input shows ONE
    // line; every edit it computes is against the WHOLE file, because the whole file is the
    // write unit and the server overwrites what it is sent. Collapsing them into one `source`
    // parameter is not a tidy-up — it was the first version of this function, and it produced a
    // "file" one line long: tests/present-focus.test.mjs caught it in section 2.
    const input = rawInput(lineSource, lineIndex, source, focus, deps, repaint, openLineAt);
    stampInstance(input, lineIndex);
    // APPEND BEFORE FOCUS. `focus()` on an element that is not in the document does nothing, so
    // the order here is what puts the cursor in the line a person just clicked.
    body.append(input);
    if (focus.isFocused(lineIndex)) {
      (input as HTMLInputElement).focus?.();
      // THE CARET SEED, AND THE ONLY PLACE IT IS EMBODIED. `mode.takeCaretHint()` is data
      // motions.ts already decided — `enterInsert(column)` for `i`/Enter and `enterInsert(column+1)`
      // for `a`, both measured in the NORMAL cursor's own column. Turning it into a real selection
      // range is a DOM fact the painter builds, not a decision — the same family as
      // `focus === undefined ? rawText(...) : rawInput(...)`. A mouse click leaves the hint unset,
      // so the caret lands where the person clicked and the painter does not overrule it.
      const caret = mode?.takeCaretHint();
      if (caret !== undefined) {
        // CLAMPED INTO THE LINE'S LENGTH, AND HERE IT IS LOAD-BEARING RATHER THAN DEFENSIVE. `a`
        // asks for `column + 1` and motions.ts cannot know how long the line is — it imports
        // nothing — so this is the one place that arithmetic meets the string it indexes. On the
        // last character `column + 1` IS `lineSource.length`, which is one past the last character
        // and exactly where a caret belongs when appending.
        const at = Math.max(0, Math.min(caret, lineSource.length));
        (input as HTMLInputElement).setSelectionRange?.(at, at);
      }
    }
  };

  body.innerHTML = "";

  // THE ROW FOR THE LINE BEING MADE, painted at the index it will occupy. The source is UNCHANGED
  // while it exists, so every line below it keeps the index it already had — which is why the
  // focus surface, the cascade and every edit computed during a draft go on being right without
  // anything having to renumber them.
  let draftPainted = false;
  const paintDraft = (): void => {
    const open = draft?.draft;
    if (open === undefined || open === null || draftPainted) {
      return;
    }
    draftPainted = true;
    const input = draftInput(open.lineIndex, open.seed, source, draft as DraftSurface, deps, repaint);
    body.append(input);
    (input as HTMLInputElement).focus?.();
  };

  /** The last source line this paint drew a row for. `-1` when the view painted nothing at all. */
  let lastPaintedIndex = -1;

  source.split("\n").forEach((line, index) => {
    if (draft?.isDraftAt(index) === true) {
      paintDraft();
    }
    const shape = classifyLine(line);

    if (shape.kind === "blank") {
      // A blank line has no rendition at either end — it vanished in the old painter and it
      // vanishes here — so there is nothing to resolve and nowhere for a cursor to land BY
      // CLICKING (no `focusable()` call reaches a blank line, above or below this branch).
      //
      // BUT VIM'S SELECTION CAN STILL LAND HERE — `j`/`k`/`gg`/`G`/`{`/`}` are arithmetic on a line
      // INDEX and do not know or care that this index happens to be blank — and slice 1 shipped
      // that gap honestly: the selection existed but nothing on screen showed it. Fixed here, and
      // narrowly: an EMPTY marked row is drawn, and only while vim is wired AND this blank line is
      // the one actually selected — never unconditionally for every blank line, which would be the
      // "blank source lines become blank rows" affordance this is not. That distinction is what
      // keeps tests/present-golden.test.mjs (compares against a config with no `mode`/`focus` at
      // all) and tests/present-focus.test.mjs (click-to-edit, `focus` with no `mode`) untouched:
      // this branch is silent for both, exactly as the blank-line drop always was.
      if (mode !== undefined && mode.mode === "NORMAL" && focus !== undefined && focus.isFocused(index)) {
        const mark = document.createElement("div");
        mark.className = VIM_SELECTED_CLASS;
        body.append(mark);
      }
      return;
    }

    // EVERY OTHER SHAPE GETS EXACTLY ONE ROW, whichever branch below draws it, so this is the one
    // place that has to know it. It is what "below the last line" resolves to: a click in the space
    // under the column opens a line after the last line that was DRAWN, which is the last non-blank
    // line, which is where a person looking at the screen would expect the next one to go.
    lastPaintedIndex = index;

    // ONE CASCADE PER LINE, because FOCUS is a fact about ONE line. The other six levels say the
    // same thing all the way down the view; this is the rung that does not, and building the
    // context per line is what lets the painter stay ignorant of which rung that is.
    //
    // FOCUS CONTRIBUTES WHENEVER THERE IS A CURSOR. Not "whenever there is a cursor and the mode is
    // INSERT", which is what this line said for one release and which was the defect:
    //
    //     focus !== undefined && (mode === undefined || mode.mode === "INSERT")
    //
    // In NORMAL the cursor IS on the line, and the operator's founding rule for this surface —
    // written in docs/implementation-artifacts/design-presentation-cascade.md and in focus.ts's own
    // header — is "cursor on the line → the line renders as its exact source text". The gate made
    // the selected line render WIRED, which broke that rule and, mechanically, left `w` with no
    // characters on screen for a column to move through.
    //
    // THE WIDENING RESTORES THE PRE-VIM EXPRESSION EXACTLY, and that is checkable rather than
    // asserted: whenever `mode === undefined` the old expression reduced to `focus !== undefined`,
    // so for every caller that predates vim — click-to-edit, the golden master, every test written
    // before this module existed — the two are the SAME BOOLEAN. The only case that changes is
    // `mode !== undefined && mode.mode === "NORMAL"`, which is vim, which is the defect. This is not
    // a third behaviour.
    const focusLive = focus !== undefined;
    const cascade = new PresentationCascade(focusLive ? focus.contextFor(index, context) : context);
    // THE VIM SELECTION MARK USED TO BE COMPUTED HERE AND HANDED TO THE THREE WIRED BRANCHES BELOW.
    // It is gone, because widening `focusLive` made it UNREACHABLE rather than merely unused: FOCUS
    // is the most specific of the seven levels (levels.ts), it contributes `raw` on every key for
    // the line under the cursor, and it is now contributed whenever there is a cursor at all. So the
    // selected line ALWAYS resolves raw, always takes `raw()` above, and always carries its mark
    // inside `normalLine`. A `wired` branch could not draw the selected line if it tried.
    //
    // The blank-line branch above still marks its own, and that one is genuinely reachable: a blank
    // line has no rendition at either end, so it never reaches a cascade or a `raw()` call.

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
      //
      // THIS STILL DISAGREES WITH `indentUnit` (declaration.ts, indent.ts) — it treats TWO spaces
      // as one level; the engine, and this app's own source-edit arithmetic, treat FOUR as one
      // level (design-the-structural-language.md §3). Fixing it — dividing by the declared unit
      // instead of the constant 2 — was tried and reverted: it changes `marginLeft` for every
      // indented checkbox line, and `tests/present-golden.test.mjs` compares those exact values
      // byte-for-byte against the historical `app.html:234-269` reference (odd/tab/sweep cases all
      // fail). That comparison is a separate, already-validated claim; this change does not
      // weaken it to make room for this one. So this stays a KNOWN, cosmetic, unfixed disagreement
      // — monotonic in the source indent, so misleading rather than wrong — and the source-edit
      // arithmetic in `indent.ts` (which this margin never feeds) is the one that was corrected.
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
        deps.onCheckboxToggle?.({ lineIndex: index, checked: box.checked, markdown, source, box, row });
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
      stampInstance(el, index);
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
    stampInstance(div, index);
    body.append(div);
  });

  // A DRAFT OPENED PAST THE LAST LINE. `insert-line` accepts `lines.length` because "after the last
  // line" is a real place to put a line, and the loop above can never reach that index.
  paintDraft();

  // ── THE SPACE BELOW THE LAST LINE, AND WHY IT IS AN ELEMENT RATHER THAN A LISTENER ────────────
  //
  // "if I click after, in the new line space, nothing happens" — and nothing could, because there
  // was nothing there. The column ends where its last row ends, so the space under it belongs to
  // the page, and the page is not where a decision about a view may live.
  //
  // A HANDLER ON `body` WOULD LEAK, WHICH IS WHY THIS IS A CHILD. `body.innerHTML = ""` clears the
  // column's contents and does NOT remove listeners from the column itself, and this painter
  // repaints the whole view on every focus change — so a listener added to `body` would accumulate
  // one copy per repaint, and after a few minutes of moving the cursor around one click would open
  // a line for every repaint that had ever happened. A child element is destroyed with the rest of
  // the contents, so it carries exactly one listener for exactly as long as the paint that made it.
  //
  // It is painted ONLY when there is a draft surface, so a view painted without one — every test
  // written before this affordance existed, and the golden master — is byte-identical to what it
  // was.
  if (draft !== undefined && focus !== undefined) {
    const below = document.createElement("div");
    below.className = "newline";
    below.addEventListener("click", (event) => {
      event?.preventDefault?.();
      // A click that landed on a LINE has already been stopped by `focusable`, so anything that
      // arrives here landed in the empty space. The line goes after the last row drawn — and at
      // index 0 when nothing was drawn at all, which is the empty view.
      openLineAt(lastPaintedIndex + 1, source);
      repaint(source);
    });
    body.append(below);
  }
}

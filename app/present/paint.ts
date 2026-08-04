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
 * ── AND THE IDENTITY MARK IS READ-ONLY FOR A HARDER REASON THAN THE CHIP'S ──
 *
 * The `stamp` key's wired rendition stops PRINTING `[[qntm:3]]`, which makes it the first
 * rendition whose token is not merely styled but removed from the page. The governing constraint
 * that admits it is `accept ⊇ emit` read one layer up: a token you stop printing must still be
 * written back byte for byte, and a dropped `[[qntm:N]]` RE-MINTS THE NODE — the engine's recorded
 * behaviour for an unrecognised stamp is that its content is absorbed into the node's title, exit
 * 0, no diagnostic.
 *
 * IT IS SAFE BY CONSTRUCTION AND NOT BY CARE, WHICH IS THE ONLY REASON IT SHIPS. Every call into
 * `applyEdit` below is given the SOURCE STRING this function was handed — `source` for the
 * checkbox, `fileSource` plus `input.value` for the cursor's line, and `input.value` was seeded
 * from `lineSource` and never from a rendition. Hiding happens in `renderTokens`, whose output
 * reaches exactly one place: `element.innerHTML`. Nothing reads `innerHTML` back, no affordance
 * was added, and `SourceEdit` is unchanged. So there is no path by which a hidden stamp can fail
 * to be restored — restoration is not an operation this module performs, it is the absence of a
 * mutation it never makes.
 *
 * THE THREE CALL SITES ARE PINNED BY A COUNT, not by this paragraph: tests/app-held-edit.test.mjs
 * section 4 matches the call syntax across this file and app/index.html and asserts it is five.
 * That is why the name appears here without its bracket.
 *
 * THE FORM THAT WOULD INVERT IT, NAMED SO IT CAN BE REFUSED ON SIGHT: hiding the stamp by
 * STRIPPING IT FROM `source` before painting. It looks like the same feature, it is one line, and
 * it is the accident that destroys node identities. tests/present-stamp.test.mjs section 6 is
 * aimed at exactly that mutation.
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
import { classifyLine, stampSpans, tagSpans } from "./rendition.js";
import type { Rendition } from "./rendition.js";
import type { SettleSurface } from "./settle.js";
import type { PredictSurface } from "./predict.js";
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

/**
 * Build a `LineCommit` for an edit to a line that ALREADY EXISTS — the one shape every gesture
 * outside a `<input>`'s own blur/Enter settlement needs (`x`'s checkbox flip, `>`/`<`'s indent,
 * and any future one-keystroke edit to the selected line), and the one shape `f448da2` got wrong.
 *
 * ── WHY THIS FUNCTION EXISTS RATHER THAN A COMMENT TELLING CALLERS WHAT TO WRITE ──
 *
 * `commit.kind`/`commit.source` are NOT OPTIONAL on `LineCommit` — TypeScript already refuses a
 * literal missing them, everywhere TypeScript is watching. It was not watching `app/index.html`:
 * that page is outside `tsconfig.json`'s `include` (hand-authored HTML, no build step, see this
 * file's own header on why the bundle exists at all), so a hand-built object literal there is
 * checked by nothing until it runs. `f448da2` shipped exactly that — `x` and `>`/`<` each wrote
 * `{ lineIndex, text, markdown }` and left `kind`/`source` out — and the omission was silent for
 * months, because `armOrderingSettle`'s old gate (`commit.kind !== "set-line"` returns early)
 * incidentally treated `undefined` as "not set-line" and skipped the broken object entirely. The
 * gate widening for `insert-line` (this same commit) removed that accident, `commit.kind` reached
 * `sectionAt`/`sectionOrdinalAt` as `undefined`, and `undefined.split` threw three frames deep —
 * three functions and one type-checked module away from the two lines that actually forgot a key.
 *
 * THE FIX IS NOT A GUARD IN `commitLine` THAT CATCHES A PARTIAL OBJECT — that keeps the mistake
 * possible and merely answers it later, which is exactly how this shipped: the crash three frames
 * down FAILED LOUDLY, not this omission ITSELF, so nothing local to the actual mistake told anyone
 * about it. The fix removes the object-literal construction from `app/index.html` altogether. A
 * caller there hands this function the pieces it already has — the pre-edit source, which line,
 * and what `applyEdit` returned — and gets back a `LineCommit` with `kind`/`source` filled in by
 * this function's own body, which IS type-checked. There is no key left at the untyped call site
 * for a future gesture to forget, because there is no object literal left at the untyped call site
 * at all. A third gesture that edits an existing line calls this function exactly as `x` and
 * `>`/`<` now do; it cannot reintroduce this shape of bug by leaving a field out, because leaving
 * a field out is not an action available to it any more.
 *
 * `kind` IS ALWAYS `"set-line"`. `set-checkbox` edits (this function's other caller, `x`) are not
 * a third `LineCommit.kind` — see that field's own header (above): it is provenance for which
 * `applyEdit` CASE produced the commit, "does a real BEFORE line exist to compare", and a checkbox
 * flip edits a line that was already there exactly as a typed `set-line` edit does. Both belong on
 * one side of that question; `insert-line` (a row that did not exist a moment ago) is the other,
 * and it is not this function's concern — paint.ts's own `draftInput.settle` (below) builds that
 * shape directly, already correctly, because it is inside this type-checked module.
 *
 * `text` IS READ OUT OF `markdown` (THE POST-EDIT FILE), NEVER PASSED IN BY THE CALLER, because
 * `membershipReadingFor` (app/index.html) reads `commit.text` as the AFTER answer directly — see
 * its own call to `membershipFor(view.id, sectionId, commit.text, qualification)`. `x`'s old call
 * site passed the PRE-toggle line as `text` (the characters read before `applyEdit` ran), which
 * would have made every membership/rules/prediction pass reason from the wrong side of the edit
 * even once `kind`/`source` were fixed by hand — a second bug the same hand-rolling produced,
 * caught here rather than shipped a second time. `markdown ?? source` covers the refusal case
 * (`markdown === null`): `commitLine` returns before reading `commit.text` when that happens, so
 * the value is unobserved, but a well-defined one costs nothing and needs no caller-side branch.
 */
export function existingLineCommit(source: string, lineIndex: number, markdown: string | null): LineCommit {
  const text = (markdown ?? source).split("\n")[lineIndex] ?? "";
  return { lineIndex, text, markdown, source, kind: "set-line" };
}

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
  /**
   * AN ARMED PLACEMENT, IF THIS REPAINT SHOULD SHOW ONE — optional, and its absence is a real
   * configuration exactly as `focus`'s is: without it a painted view never reorders a row, which is
   * every test written before `settle.ts` existed and the golden master's own comparison. With it,
   * this paint asks the surface ONCE (`SettleSurface.take`, keyed by this exact `source` and
   * `deps.view`) whether a row should relocate and whether THIS repaint gets to animate it — see
   * `settle.ts`'s own header for why armed elsewhere and only consumed here, and `settleRow` in
   * this file for what "relocate" and "animate" each do to the DOM.
   */
  readonly settle?: SettleSurface;
  /**
   * ARMED PREDICTIONS, IF THIS REPAINT SHOULD SHOW OR RECONCILE ANY — optional, and its absence is
   * a real configuration exactly as `settle`'s is: without it a painted view never decorates a row
   * with a claim about what the engine will do to it, which is every test written before
   * `predict.ts` existed. With it, this paint asks the surface ONCE (`PredictSurface.take`, keyed by
   * this exact `source` and `deps.view`) for the claims still live and the ones this repaint just
   * discovered were contradicted — see `predict.ts`'s own header for what "live", "confirmed" and
   * "withdrawn" mean, and `appendPrediction` in this file for what each does to the DOM.
   *
   * THE SAME SURFACE, USED FOR TWO PREDICTIONS THAT LAND ON TWO DIFFERENT ROWS — `stamp-created-
   * at-on-task`'s own row (the one just committed) and a graph-aware promotion rule's row (the
   * structural PARENT, never the committed line) both arrive here as entries in ONE
   * `PredictInstruction.predictions` array, addressed by their own `lineIndex`. This function does
   * not know or care which rule produced which entry — `app/index.html`'s `armPrediction` is where
   * that distinction is made, once, before either ever reaches this file.
   */
  readonly predict?: PredictSurface;
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

/**
 * WHAT BECAME OF ONE OPEN LINE — the latch every `<input>` the painter builds carries.
 *
 * `open` — nothing has happened to it yet, and the next settlement decides.
 * `committed` — its characters were computed into a `SourceEdit` and handed to the caller. Whether
 *   the caller POSTED is the caller's business; whether this element may be read again is this
 *   latch's, and the answer is no.
 * `discarded` — the operator pressed Escape. This element is finished, it produced no edit, and it
 *   may never produce one. Every later settlement on it — most of all the `blur` fired by the very
 *   repaint the discard causes, which is wired to the COMMITTING settlement — is refused.
 *
 * IT REPLACES A BOOLEAN, AND THE THIRD STATE IS THE POINT. `settled` said "something already
 * happened here" and could not say WHAT, so "Escape posts nothing" rested on the order two
 * listeners happened to run in. Naming the gesture makes the refusal a fact about what the operator
 * asked for.
 */
type Settlement = "open" | "committed" | "discarded";

/**
 * WHICH PAINT IS THE CURRENT ONE — a monotonic counter, bumped once by every call to `paint`.
 *
 * ── IT IS `DraftSurface.generation`'S MECHANISM, APPLIED TO THE FRAME INSTEAD OF TO THE ROW ──
 *
 * Not a third idea. This module already answers "is this element still the thing it was built for"
 * two ways, and this is the second of them widened by one word:
 *
 *   the LATCH (`Settlement` above) refuses BY NAME — this element discarded, so it may not commit.
 *   the GENERATION (`draft.generation`) refuses A STALE GENERATION — this element's row has been
 *     dropped or re-placed, so its settlement is not the row's settlement.
 *
 * `paint()` needed the second one and did not have it. A paint owns two things for the length of
 * its frame: the column it is appending to, and the SOURCE STRING every row it builds closes over.
 * Both stop being true the instant a nested paint runs — and a nested paint is not hypothetical, it
 * is what `body.innerHTML = ""` and every `element.focus()` in this file can cause, because
 * removing or blurring a focused `<input>` fires `blur`, `blur` is wired to a settlement, and a
 * settlement repaints.
 *
 * ── WHAT IT PREVENTS, AND IT IS A WRITE AND NOT A GLITCH ──
 *
 * A superseded frame that goes on appending puts rows on screen whose `source` — the string handed
 * to `applyEdit` by their checkbox, and by their line's own settlement — is a copy of the file the
 * nested paint has already replaced. Measured: a draft row holding characters, settled by a nested
 * paint into a file with one line MORE, underneath four rows still closing over the file with one
 * line LESS. Ticking a box on one of those rows POSTS the shorter file, and the write unit is the
 * WHOLE FILE, so the line he had just created is gone.
 *
 * So the rule is: A SUPERSEDED FRAME TOUCHES NOTHING. It does not append, it does not focus, and it
 * leaves behind no element that could be clicked. The nested paint holds the current source and has
 * already drawn the whole view; there is nothing the outer frame could add that is not stale by
 * construction.
 *
 * IT IS NOT A RE-ENTRANCY LOCK. Nothing here refuses to paint and no settlement is deferred — the
 * nested paint runs, in full, and wins. What is refused is the CONTINUATION of a frame whose source
 * is no longer the page's, which is the same refusal `draft.generation` makes about a row.
 */
let paintGeneration = 0;

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

  // ONE SETTLEMENT PER INPUT, AND ITS KIND IS RECORDED RATHER THAN ITS FACT.
  //
  // Blur can arrive twice (a keypress that settles, then the element losing focus as the repaint
  // removes it), and a second settlement would compute a second edit against a source that has
  // already moved — the first shape a double POST takes. That much a boolean already said.
  //
  // WHY IT IS NOW THREE STATES AND NOT TWO. `discarded` and `committed` are different promises, and
  // only one of them is safe to make twice. A row this element DISCARDED must never afterwards
  // become a write, whatever fires next and in whatever order — and the thing that fires next is
  // `blur`, which is wired to the COMMITTING settlement, on this same element, from the repaint the
  // discard itself causes. A boolean said "something already happened here"; this says WHAT, so the
  // refusal is a fact about the operator's own gesture rather than about which listener ran first.
  // The draft row paid for the two-state version of this lesson one day earlier — see
  // `DraftSurface.generation` below, and `draftInput`'s own `stale()`.
  let settlement: Settlement = "open";

  /**
   * ESCAPE — THE CURSOR LEAVES AND THE CHARACTERS IT WAS HOLDING ARE DROPPED.
   *
   * ── IT IS A SEPARATE FUNCTION, AND THAT IS THE WHOLE OF THE GUARANTEE ──
   *
   * This used to be `settle(false)`: the same function, a boolean apart, sharing the statements that
   * read `input.value`, call `applyEdit` and call `onLineCommit`. "Escape posts nothing" was then a
   * property of one `if` inside a function that CAN post — true, unenforced, and one reordering away
   * from being false. It is now a property of the FUNCTION GRAPH: nothing reachable from here reads
   * the element's value, constructs a `SourceEdit`, or reaches `deps.onLineCommit`. `settle` below
   * lost its `commit` parameter in the same change, so there is no longer an argument that makes a
   * write path into a discard path.
   *
   * ── IT DOES NOT ASK WHETHER THIS LINE STILL HAS THE CURSOR ──
   *
   * The old branch did (`if (wasFocused)`), and that was the one way Escape could leave the operator
   * worse off than not pressing it: the element was latched shut FIRST and the mode left in INSERT,
   * so an `<input>` stayed on screen holding his characters with every later settlement — Enter
   * included — refused in silence. Whether some other line has since taken the cursor is not a fact
   * about what THIS gesture means. Escape means "leave INSERT and show me the source", and it now
   * means that unconditionally.
   */
  const discard = (): void => {
    if (settlement !== "open") {
      return;
    }
    settlement = "discarded";
    leaveInsert();
    // THE SOURCE THIS PAINT WAS HANDED, VERBATIM — not `input.value`, which is the one string in
    // scope that the operator's typing can have changed. The line returns to whatever the cascade
    // resolves it to, out of the file as it stood.
    repaint(fileSource);
  };

  const settle = (openBelow = false): void => {
    if (settlement !== "open") {
      return;
    }
    settlement = "committed";
    const wasFocused = focus.isFocused(lineIndex);
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
    if (opened) {
      // ── BLUR BEFORE THE ROW IS PAINTED, AND THIS IS THE DEFECT THIS LINE EXISTS TO END ────────
      //
      // A draft is not a line `FocusSurface` can point at while it exists: `paintDraft` focuses the
      // row's `<input>` DIRECTLY, with no cascade and no mode check. So a draft and a focused line
      // are two cursors, and the next paint honours BOTH — it builds an `<input>` for the focused
      // line and focuses it, then builds the draft and focuses that.
      //
      // FOCUSING THE SECOND BLURS THE FIRST, and `blur` is wired to the settlement above. Measured,
      // deterministically, before this line existed: Enter on an open line ran that settlement
      // RE-ENTRANTLY inside `paint()`, its own repaint destroyed the draft the same paint had just
      // built, and the outer frame went on appending rows underneath it — mode NORMAL, no draft, no
      // `<input>`, THREE COPIES OF THE VIEW on screen. Which is to say the operator pressed Enter,
      // got no line, and every character he typed next went to vim's NORMAL keymap.
      //
      // `o`/`O` HAS ALWAYS DONE THIS. app/index.html's `open` effect runs `focus.blur()` and then
      // `mode.enterInsert()`, for exactly the reason written out there. Enter mid-edit opens a row
      // through the SAME `openLine`, and ran only the second of the two. This is not a new rule; it
      // is the existing rule reaching its second caller.
      //
      // IT IS UNCONDITIONAL ON `wasFocused` on purpose. The hazard is "some line is focused while a
      // draft exists", and whether the focused line is THIS one is not what makes it a hazard —
      // one `<input>` too many is one focus transfer too many wherever the cursor happens to be.
      // `draftInput`'s own `returnToVim` hands the cursor back when the row settles or is abandoned.
      focus.blur();
    }
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

  input.addEventListener("blur", () => settle());
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
      settle(true);
    } else if (key === "Escape") {
      event?.preventDefault?.();
      // THE ONE CALL IN THIS FILE THAT CANNOT REACH A WRITE. See `discard` above.
      discard();
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
  typed: string,
  fileSource: string,
  draft: DraftSurface,
  deps: PaintDeps,
  repaint: (nextSource: string) => void,
): HTMLElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "rawline";
  // THE CHARACTERS THE ROW HOLDS, WHICH IS THE SEED UNTIL SOMEBODY TYPES. They differ only for a
  // row that has survived a projection (draft.ts's `typed`) — an `<input>` is destroyed by every
  // repaint, so a surviving row that came back holding its seed would have survived nothing the
  // operator can see.
  input.value = typed;

  // One settlement per row, for the same reason `rawInput` has one: the repaint that follows a
  // commit removes this element, and removing a focused element fires blur.
  let settled = false;

  /**
   * WHICH ROW THIS ELEMENT IS — see `DraftSurface.generation`.
   *
   * A repaint replaces this element. Until a draft could SURVIVE a repaint that fact was harmless,
   * because every repaint that reached a live draft had already settled or abandoned it. It is not
   * harmless now: the removed element's own `blur` would otherwise settle a row that is still open
   * somewhere else on screen — posting an `insert-line` computed against a source string that has
   * been replaced. So settlement is gated on this element still BEING the row.
   */
  const generation = draft.generation;
  const stale = (): boolean => draft.generation !== generation;

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
    if (settled || stale()) {
      return;
    }
    settled = true;
    draft.drop();
    returnToVim(fileSource);
    repaint(fileSource);
  };

  const settle = (): void => {
    if (settled || stale()) {
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

  // THE CHARACTERS, RECORDED AS THEY ARE TYPED — the only way a repaint can put them back, and the
  // same read `settle` above already makes at the end (`input.value`), made earlier. It builds no
  // edit and posts nothing; see draft.ts's `typed` for why the field is not a second write path.
  input.addEventListener("input", () => draft.type(input.value));
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
 * THE `wired` RENDITION OF THE IDENTITY STAMP — a small mark where `[[qntm:3]]` was printed.
 *
 * ── WHAT THE WIRED FORM IS, AND WHY IT IS A MARK RATHER THAN NOTHING AT ALL ──
 *
 * Hiding the stamp entirely was the obvious answer and it is the wrong one, for a reason that is
 * about what the operator is actually watching. He types a line; the cycle takes it, mints a node,
 * and prints the line back stamped. The stamp is the ONLY thing on the line that says the model
 * has it. Hide it completely and a line the model has never seen and a line it has minted a node
 * for are pixel-identical, so the one question he asks of the page every time he presses Enter —
 * "has it got this yet" — stops having an answer anywhere on it.
 *
 * So the mark is the smallest thing that answers it: one dot, in the place the stamp occupied,
 * carrying the id in its `title` for a hover. Twelve characters become one, so the tail of the
 * line stops moving eleven columns when the cycle catches up, and the fact he needs survives.
 *
 * AND HIDING ENTIRELY IS STILL ONE CSS RULE AWAY, WITH NOTHING REBUILT. What the painter emits is
 * a span with a class; whether that span is a dot or `display: none` is a stylesheet decision in
 * app/index.html, not a rendition decision here. That is the same separation the chip already has
 * ("this rule only says what a chip looks like once the cascade has said there should be one").
 *
 * ── THE ID GOES IN AN ATTRIBUTE AND NOTHING EVER READS IT BACK ──
 *
 * `title="qntm:3"` is for a person hovering. It is not a channel: no listener reads it, `applyEdit`
 * has gained no case, and the restoration of a hidden stamp does not come from the DOM at all — it
 * comes from the source string, which this painter never mutates. `flows.yaml`'s
 * `source-never-touches-the-dom` forbidden flow is what keeps that true tomorrow.
 *
 * THE INJECTION IS SAFE BY THE GRAMMAR, NOT BY ESCAPING — the same argument the chip makes, and it
 * has to be made again because this token goes into an ATTRIBUTE rather than into element content.
 * A qntm id is `[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?` (resolution.ts, cited to
 * `parse_qntm_id.py`), so it cannot contain `"`, `<`, `>` or `&`; there is no character in a
 * matched id that could close this attribute or open another element. Fuzzed in
 * tests/present-stamp.test.mjs rather than assumed.
 *
 * ── AND THE MARK IS A CHARACTER, NOT A SIZED BOX, WHICH IS A ROW DECISION AND NOT A TASTE ──
 *
 * The first version of this drew an empty `<span>` with a `width` and a `height`. That is a box the
 * row has to absorb, and `tests/app-view-rows.test.mjs` has already paid for the lesson once: at
 * the `line-height: 1.45` the CHIP shipped with, a chipped line measured 24.0199px against 23.9986px
 * for the same line without one, and a line whose wired rendition is taller than its raw form moves
 * everything below it the moment the cursor lands.
 *
 * A span holding ONE CHARACTER has the chip's own answer instead of a new one: its box IS its text's
 * content area, which the row already contains by construction, so with no padding, no border, no
 * width and no height there is nothing for the row to absorb. That argument was MEASURED for the
 * chip; this element reuses it rather than making a fresh, unmeasured claim about `.34em`.
 */
const STAMP_MARK_CLASS = "stampmark";
/** The constant PREFIX of the mark's opening tag — what the survival check below counts. */
const STAMP_OPEN = `<span class="${STAMP_MARK_CLASS}"`;
/** The one character the mark is. Not an emoji, not a glyph the marker grammar could ever claim. */
const STAMP_MARK_GLYPH = "•";
const stampMark = (id: string): string =>
  `${STAMP_OPEN} title="qntm:${id}">${STAMP_MARK_GLYPH}</span>`;

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
 * One token's rendition, located: the characters it replaces, and what goes in their place.
 *
 * `text` is the SOURCE characters this substitution stands for. It is what makes the fallback
 * below possible without a second grammar pass, and it is the restoration in the one place a
 * restoration is ever needed at paint time — see `renderTokens`.
 */
interface Injection {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly html: string;
}

/**
 * Render `text` with its tokens rendered — or with them as characters, if the markup would not
 * survive.
 *
 * ── TWO KEYS, ONE MARKDOWN CALL, AND THAT IS NOT AN OPTIMISATION ──
 *
 * `tags` and `stamp` are resolved separately and injected together, into the ONE render this line
 * was always going to make. Rendering twice — chips in one pass, marks in another — would mean
 * rendering HTML that already contains HTML, which is the painter reading its own output and
 * deciding again from it. One pass in, one string out, both token families inside whatever
 * structure markdown-it built.
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
 *
 * ── AND THE FALLBACK MATTERS MORE FOR THE STAMP THAN IT DID FOR THE CHIP ──
 *
 * A chip that does not survive shows `&lt;span class="tagchip"&gt;#work` — ugly, and the tag is
 * still legible inside it. A MARK that did not survive would show
 * `&lt;span class="stampmark" title="qntm:3"&gt;&lt;/span&gt;` with the stamp's own characters
 * GONE from the line, replaced by markup about them. That is strictly worse than either end of the
 * dial, so the all-or-nothing rule is not merely tidy here: it is what keeps the wired end from
 * having a third, broken outcome. The check counts BOTH families and one shortfall in either takes
 * the whole line back to its characters.
 *
 * ── WHAT IS NOT HERE, AND IS THE POINT ──
 *
 * NO SOURCE EDIT. The mark offers nothing, exactly as the chip offers nothing: no listener,
 * `applyEdit` gained no case, and `SourceEdit` is still the closed union of three. So this
 * rendition cannot corrupt a file even if every claim above it is wrong — the write path is
 * handed the source string, never this string.
 */
function renderTokens(
  text: string,
  tags: Rendition,
  stamp: Rendition,
  render: (markdown: string) => string,
): string {
  const injections: Injection[] = [];
  if (stamp === "wired") {
    // STAMPS FIRST, mirroring `line_parser.parse_line`'s own extraction order (wiki-link before
    // tag, `line_parser.py:79-89`) — the same order `titleSpans` walks its atoms in. The two
    // grammars cannot actually overlap (a qntm id body has no `#` and a tag body has no `[`), so
    // the drop below never fires today; it is here so that a WIDER grammar arriving later cannot
    // produce two injections claiming one character.
    for (const span of stampSpans(text)) {
      injections.push({ start: span.start, end: span.end, text: span.text, html: stampMark(span.id) });
    }
  }
  if (tags === "wired") {
    for (const span of tagSpans(text)) {
      injections.push({
        start: span.start,
        end: span.end,
        text: span.text,
        html: CHIP_OPEN + span.text + CHIP_CLOSE,
      });
    }
  }
  if (injections.length === 0) {
    return render(text);
  }

  const claimed: Injection[] = [];
  for (const injection of injections) {
    if (!claimed.some((c) => injection.start >= c.start && injection.start < c.end)) {
      claimed.push(injection);
    }
  }
  claimed.sort((a, b) => a.start - b.start);

  let injected = "";
  let at = 0;
  for (const injection of claimed) {
    injected += text.slice(at, injection.start) + injection.html;
    at = injection.end;
  }
  injected += text.slice(at);

  const html = render(injected);
  const survived = (open: string): number => html.split(open).length - 1;
  const wanted = (open: string): number => claimed.filter((c) => c.html.startsWith(open)).length;
  const intact =
    survived(CHIP_OPEN) === wanted(CHIP_OPEN) && survived(STAMP_OPEN) === wanted(STAMP_OPEN);
  return intact ? html : render(text);
}

/** The class a settling row carries for the length of its motion — see `settleRow` below and this
 * file's own stylesheet counterpart in app/index.html, `.settle-move`. */
const SETTLE_CLASS = "settle-move";

/**
 * THE ONE SETTLE AFFORDANCE — relocates a row and, when asked, admits the move with motion rather
 * than letting it silently already be there. `docs/implementation-artifacts/roadmap-the-road-
 * ahead.md` step 3: built once, here, so the next two occasions this document names (a corrected
 * node type, a cascaded field) call THIS function rather than each inventing their own. `paint()`'s
 * own call site below decides WHICH row and WHETHER to animate (by asking `deps.settle`); this
 * function decides HOW the motion looks, and that is the whole of the split.
 *
 * ── THE MOTION IS FLIP, NOT PIXEL ARITHMETIC GUESSED FROM ROW HEIGHT ──
 *
 * `getBoundingClientRect` before the reorder and after it, a translate that cancels the visual
 * jump the reorder alone would cause, then a transition back to zero — First/Last/Invert/Play.
 * Reading real layout, rather than assuming every row is `--row` tall, is what keeps this correct
 * for the one case this file's own stylesheet comment in app/index.html admits it does not
 * control: "a line whose rendition WRAPS... no rule here can make it [uniform]."
 *
 * ── WHY THE TRANSITION ITSELF IS A CSS CLASS, NOT A JS-SIDE DURATION ──
 *
 * `--slide` is already, in the operator's own words carried in app/index.html's root variables,
 * "one motion, named once, so `prefers-reduced-motion` has exactly one thing to turn off." Writing
 * a second, JS-computed duration here would be the second thing that sentence exists to prevent.
 * `SETTLE_CLASS` carries `transition: transform var(--slide)` in the stylesheet, and the identical
 * `@media (prefers-reduced-motion: reduce)` block that already silences `.scrim`/`.drawer`/`.chev`/
 * `button` silences this class too. So this function always runs the same FLIP arithmetic in every
 * environment and lets the ONE stylesheet decide whether the operator sees the row travel or sees
 * it simply arrive — the admission always happens (hazard 5: "the row still moves... but without
 * the animation"), only the transform's visibility is conditional, and it is conditional in CSS,
 * not in this function.
 *
 * `animate` FALSE STILL REPOSITIONS. A repeat repaint of an already-shown placement (the operator
 * pressed `j` a moment after the row settled, before the cycle confirmed it) must keep the row
 * where it was put — the alternative is the row snapping back to its old spot on the very next
 * keystroke, which is worse than never moving it. Only the transform step is skipped; `insertBefore`
 * always runs.
 */
function settleRow(moving: HTMLElement, before: HTMLElement | null, body: HTMLElement, animate: boolean): void {
  const first = animate && typeof moving.getBoundingClientRect === "function" ? moving.getBoundingClientRect() : null;
  body.insertBefore(moving, before);
  if (first === null) {
    return;
  }
  const last = moving.getBoundingClientRect();
  const dy = first.top - last.top;
  if (dy === 0) {
    return;
  }
  moving.className = moving.className === "" ? SETTLE_CLASS : `${moving.className} ${SETTLE_CLASS}`;
  moving.style.transition = "none";
  moving.style.transform = `translateY(${dy}px)`;
  const settled = (): void => {
    moving.style.transition = "";
    moving.style.transform = "";
  };
  // NO `requestAnimationFrame` IN A NODE TEST RUN — the FLIP still has to happen (`settled` still
  // clears the transform), it just happens on the next microtask/turn rather than the next real
  // frame. A real browser always has this global; app/index.html runs in one.
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(settled);
  } else {
    settled();
  }
}

/** The predicted decoration's own class — see app/index.html's stylesheet counterpart,
 * `.row-prediction`, for what a CLAIM looks like next to SETTLED content. */
const PREDICT_CLASS = "row-prediction";
/** The one-shot "this did not happen" mark — painted for exactly the repaint that reconciles an
 * armed claim against a source that turned out not to carry it (`predict.ts`'s own `withdrawn`).
 * A struck-through claim is a DIFFERENT fact from a claim quietly not reappearing, and the operator's
 * own principle ("the browser's first answer is a claim, not a fact") is only honoured if a WRONG
 * claim is admitted as wrong rather than left to be inferred from its own absence. */
const PREDICT_WITHDRAWN_CLASS = "row-prediction-withdrawn";

/**
 * Paint one predicted decoration onto `row` — a claim about what the engine's next answer will add
 * to this line, visually distinct from the line's own settled characters.
 *
 * ── WHY THIS IS A CHILD ELEMENT, NEVER A CHARACTER SPLICED INTO THE ROW'S OWN CONTENT ──
 *
 * `row`'s own text was already built by `renderTokens`/`rawText`/`normalLine` from the SOURCE
 * STRING, and nothing about that changes here — this function only ever APPENDS a further element,
 * the same "decorate, never rewrite" posture the tag chip and the stamp mark already take for
 * confirmed content. A claim spliced into the row's own text node would be indistinguishable, to
 * anything that reads the DOM back, from a character the operator actually typed — and nothing in
 * this bundle reads the DOM back to build an edit (`applyEdit` always reads `source`), so this is a
 * belt this file already wears; the decoration keeps its own element as the braces, because a claim
 * that could ever be mistaken for settled content is the exact failure this whole feature exists to
 * avoid.
 *
 * ── WHY AN `<input>` IS SKIPPED RATHER THAN DECORATED ──
 *
 * The row currently being typed, or one the cursor just landed back on in INSERT, is rendered as a
 * real `<input>` (`rawInput`/`draftInput`, above) — an element with nowhere to usefully show a
 * child: a void/replaced element accepts an appended node without error and never renders it. There
 * is also nothing useful to say: the operator is either mid-keystroke on this exact line (he does
 * not need a claim about characters he is choosing himself) or has just landed the cursor back on it
 * (same reason). Skipping is a choice made for clarity, not a workaround for a crash.
 */
function appendPrediction(row: HTMLElement, text: string, kind: "pending" | "withdrawn", animate: boolean): void {
  if (row.tagName.toLowerCase() === "input") {
    return;
  }
  const span = document.createElement("span");
  const classes = [PREDICT_CLASS];
  if (kind === "withdrawn") {
    classes.push(PREDICT_WITHDRAWN_CLASS);
  }
  span.className = classes.join(" ");
  span.textContent = text;
  // A HOVER EXPLANATION, THE SAME REGISTER `stampMark`'s OWN `title` USES — non-interactive,
  // read by nothing, there only for a person who pauses on the chip and wants to know what it is.
  span.title =
    kind === "withdrawn" ? "predicted — the engine answered differently" : "predicted — not yet confirmed by the engine";
  row.append(span);

  // THE ARRIVAL — `settleRow`'s OWN TECHNIQUE, reused rather than reinvented: this page's
  // stylesheet may declare `@media` and nothing else (`tests/app-view-rows.test.mjs`'s own reader
  // refuses any other at-rule), so there is no `@keyframes` this file could hand a class to trigger.
  // What IS available is a `transition` stated once on `.row-prediction` in the stylesheet — so this
  // sets the START state INLINE with `transition: none` (no animation on the frame that builds the
  // element), then clears both a moment later, letting the stylesheet's own transition animate the
  // change back to its resting opacity/position. Only for `kind === "pending" && animate`: a
  // withdrawal is struck through by its own class, unconditionally, and does not rise in — it is
  // reporting something that already happened, not something arriving.
  if (kind === "pending" && animate) {
    span.style.transition = "none";
    span.style.opacity = "0";
    span.style.transform = "translateY(-.2em)";
    const settled = (): void => {
      span.style.transition = "";
      span.style.opacity = "";
      span.style.transform = "";
    };
    // NO `requestAnimationFrame` IN A NODE TEST RUN — same fallback `settleRow` already takes.
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(settled);
    } else {
      settled();
    }
  }
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
  // WHICH PAINT THIS IS — taken FIRST, before any statement that can hand control to a listener.
  // See `paintGeneration` for what a superseded frame would otherwise put on the page.
  paintGeneration += 1;
  const mine = paintGeneration;
  /** Has another paint started since this one? Then this frame's `source` is no longer the page's. */
  const superseded = (): boolean => paintGeneration !== mine;

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
      // A CLICK POSITIONS. IT DOES NOT ARM. Before vim, clicking was the only way to reach a line
      // at all, so it had to do both jobs. Now `i`/`a`/`o`/`O` exist — see motions.ts's
      // `handleKey` — so a click can go back to meaning only "the cursor is here", which is what
      // it means in every editor the operator uses. The old dual meaning was a hazard, not a
      // convenience: a gesture made only to move focus (a browser agent's stray click, a person
      // scanning a line) could arm INSERT and turn the operator's next keystroke into a character
      // typed straight into his file. Leaving the line in NORMAL after a click closes that gap.
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
    return openLine(from, lineIndex, draft, deps.onNewLineDeclined, deps.declared, deps.view);
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
      rowsByLineIndex.set(lineIndex, text);
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
      rowsByLineIndex.set(lineIndex, line);
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
    rowsByLineIndex.set(lineIndex, input);
    if (focus.isFocused(lineIndex)) {
      (input as HTMLInputElement).focus?.();
      // FOCUSING BLURS WHATEVER HAD FOCUS, AND A BLUR SETTLES. So this call is one of the three
      // places in this file where control can leave the frame — see `paintGeneration`. If it did,
      // the element just appended is already gone from the column a nested paint emptied, and
      // seeding a caret into it would be seeding a caret into nothing.
      if (superseded()) {
        return;
      }
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

  // EMPTYING THE COLUMN REMOVES THE FOCUSED `<input>`, AND REMOVING IT FIRES `blur`. That listener
  // can settle a row, and a settlement repaints — so this one statement can run a whole paint
  // before it returns. Everything below it belongs to a frame that may already have been replaced.
  body.innerHTML = "";
  if (superseded()) {
    return;
  }

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
    const input = draftInput(
      open.lineIndex,
      open.seed,
      open.typed,
      source,
      draft as DraftSurface,
      deps,
      repaint,
    );
    body.append(input);
    (input as HTMLInputElement).focus?.();
    // THE SECOND OF THE THREE PLACES CONTROL CAN LEAVE THE FRAME — see `paintGeneration`, and see
    // `rawInput`'s `settle` for the `focus.blur()` that stops this transfer from happening at all
    // on the gesture that used to cause it.
    if (superseded()) {
      return;
    }
    // THE CARET GOES BACK TO THE END OF WHAT HE HAD TYPED, and only for a row that has survived a
    // projection. A row still holding its seed is left exactly as it was — the browser lands the
    // caret at the end of a freshly focused value anyway, and setting it here would change what
    // every paint before this row existed produced.
    if (open.typed !== open.seed) {
      (input as HTMLInputElement).setSelectionRange?.(open.typed.length, open.typed.length);
    }
  };

  /** The last source line this paint drew a row for. `-1` when the view painted nothing at all. */
  let lastPaintedIndex = -1;

  // EVERY ROW THIS PAINT BUILT, BY THE SOURCE LINE IT CAME FROM — the settle affordance's own
  // lookup, and nothing else's. `orderingPlacementFor` (ordering.ts) answers in line indices, never
  // in DOM references, because it is PURE and has never touched a document; this map is the one
  // place that answer meets an actual element, and it exists for exactly the two lookups the
  // settle consumption below makes (`instruction.placement.lineIndex`,
  // `instruction.placement.beforeLineIndex`) and nothing else reads it.
  const rowsByLineIndex = new Map<number, HTMLElement>();

  source.split("\n").forEach((line, index) => {
    // A ROW BUILT BY A SUPERSEDED FRAME CLOSES OVER A SOURCE THE PAGE NO LONGER HAS, and its
    // affordances POST the whole file. `forEach` cannot be broken out of, so every remaining
    // iteration returns instead — the same outcome, and no second loop shape to keep in step with
    // the first. See `paintGeneration`.
    if (superseded()) {
      return;
    }
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
      span.innerHTML = renderTokens(
        shape.tail,
        cascade.resolve("tags").rendition,
        cascade.resolve("stamp").rendition,
        (markdown) => deps.markdown.renderInline(markdown),
      );
      // THE TEXT IS THE CURSOR TARGET AND THE BOX IS THE TOGGLE. Two affordances on one line,
      // kept apart by which element carries which listener: click the words to read the source,
      // click the box to tick it.
      focusable(span, index);
      stampInstance(row, index);
      row.append(box, span);
      body.append(row);
      rowsByLineIndex.set(index, row);
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
      el.innerHTML = renderTokens(
        shape.text,
        cascade.resolve("tags").rendition,
        cascade.resolve("stamp").rendition,
        (markdown) => deps.markdown.renderInline(markdown),
      );
      focusable(el, index);
      stampInstance(el, index);
      body.append(el);
      rowsByLineIndex.set(index, el);
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
    div.innerHTML = renderTokens(
      shape.source,
      cascade.resolve("tags").rendition,
      cascade.resolve("stamp").rendition,
      (markdown) => deps.markdown.render(markdown),
    );
    focusable(div, index);
    stampInstance(div, index);
    body.append(div);
    rowsByLineIndex.set(index, div);
  });

  // NOTHING BELOW THIS LINE MAY RUN FOR A FRAME THAT HAS BEEN REPLACED. The trailing draft row and
  // the click-below-the-last-line target are both elements a person can reach, and both would carry
  // this frame's `source` into `applyEdit`. See `paintGeneration`.
  if (superseded()) {
    return;
  }

  // ── THE SETTLE AFFORDANCE — placing a row where the browser predicts the engine will ──────────
  //
  // Asked ONCE, for THIS `source`/`deps.view` pair, after every row this paint would draw anyway
  // already exists in `rowsByLineIndex` — `settle.ts`'s own header is where WHY this is source-
  // keyed and one-shot is argued; `ordering.ts`'s `orderingPlacementFor` is where the placement
  // came from and the proof it agrees with the engine; `settleRow` above is HOW the motion looks.
  //
  // NOT REACHED WHEN `deps.settle` IS ABSENT — every test written before `settle.ts` existed, and
  // the golden master's own byte-identical comparison, paint exactly what they always painted.
  //
  // A ROW STILL BEING TYPED IS NEVER THE ROW THIS MOVES. `SettleSurface.arm` is only ever called
  // from `commitLine` (app/index.html), after `paint.ts`'s own `rawInput.settle` has already run
  // `leaveInsert()` — the `<input>` for the line just committed is gone from the DOM by the time
  // THIS forEach pass even starts building rows again, replaced by whatever the cascade resolves
  // the line to now (a NORMAL block cursor, or inert text). There is no code path that can hand
  // this function an element still carrying a live text box.
  const settle = deps.settle;
  if (settle !== undefined) {
    const instruction = settle.take(source, deps.view ?? "");
    if (instruction !== null) {
      const movingEl = rowsByLineIndex.get(instruction.placement.lineIndex);
      const beforeLineIndex = instruction.placement.beforeLineIndex;
      const beforeEl = beforeLineIndex === null ? null : (rowsByLineIndex.get(beforeLineIndex) ?? null);
      // `movingEl === undefined` IS A REAL OUTCOME, NOT A BUG. The placement was armed against THIS
      // `source` (the `take` check above already proved that), but `lineIndex` could still name a
      // blank line — `orderingPlacementFor` never returns one (a blank line has no marker value to
      // rank), so this guard is defensive rather than load-bearing; it is here so a future change to
      // either function fails by doing nothing rather than by throwing.
      if (movingEl !== undefined) {
        settleRow(movingEl, beforeEl, body, instruction.animate);
      }
    }
  }

  // ── THE PREDICT AFFORDANCE — decorating a row with what the browser believes the engine's next
  // answer will add to it ──────────────────────────────────────────────────────────────────────
  //
  // Asked ONCE, for THIS `source`/`deps.view` pair, after every row this paint would draw anyway
  // already exists in `rowsByLineIndex` — same timing as the settle consumption immediately above,
  // and the same reason: a claim can only be attached to a row that has already been built.
  //
  // NOT REACHED WHEN `deps.predict` IS ABSENT — every test written before `predict.ts` existed, and
  // the golden master's own byte-identical comparison, paint exactly what they always painted.
  //
  // TWO ROWS, NOT ONE, AND NEITHER IS DECIDED HERE. `instruction.predictions`/`instruction.withdrawn`
  // each carry their OWN `lineIndex` — `app/index.html`'s `armPrediction` is what decided which rows
  // those are (the row just committed, for `stamp-created-at-on-task`; the structural PARENT, for a
  // graph-aware promotion rule) and this function never asks which prediction is which kind, the same
  // "paint may build DOM, it may not decide" split this whole file's header states for every other
  // affordance below it.
  //
  // `el === undefined` IS A REAL OUTCOME, the same defence the settle consumption above already
  // states: a claim armed against THIS source could still name a blank line, or (see
  // `appendPrediction`'s own header) a row currently rendered as an `<input>` with nowhere to show
  // a child — both are silently skipped rather than treated as a bug.
  const predict = deps.predict;
  if (predict !== undefined) {
    const instruction = predict.take(source, deps.view ?? "");
    if (instruction !== null) {
      for (const prediction of instruction.predictions) {
        const el = rowsByLineIndex.get(prediction.lineIndex);
        if (el !== undefined) {
          appendPrediction(el, prediction.text, "pending", instruction.animate);
        }
      }
      for (const withdrawn of instruction.withdrawn) {
        const el = rowsByLineIndex.get(withdrawn.lineIndex);
        if (el !== undefined) {
          appendPrediction(el, withdrawn.text, "withdrawn", true);
        }
      }
    }
  }

  // A DRAFT OPENED PAST THE LAST LINE. `insert-line` accepts `lines.length` because "after the last
  // line" is a real place to put a line, and the loop above can never reach that index.
  paintDraft();
  if (superseded()) {
    return;
  }

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

/**
 * What a resolution IS — values only. No DOM, no fetch, no behaviour beyond reading a line.
 *
 * A `Resolution` is a small closed record, one key per token family the app can show more than
 * one way, each key holding a `Rendition`. `raw` means the characters, verbatim. `wired` means
 * the app's rendition of them. Every mixture is legal: a Resolution with every key `raw` is a
 * plain text file, one with every key `wired` is a conventional app, and the operator's position
 * and a first-time visitor's position are two values of the same type rather than two products.
 *
 * ── FOUR KEYS, NOT FIVE, AND THIS IS THE ONE PLACE THIS MODULE DEPARTS FROM THE SPEC ──
 *
 * design-presentation-cascade.md section 2.3 specifies five keys — checkbox, tags, links,
 * markers, heading. This ships FOUR: the four the painter actually reads.
 *
 * The reason is section 9's own rule, which that document states more forcefully than anything
 * else in it: do not declare a key whose reader does not exist. "A declaration that exists and
 * does not reach" is named there as this system's highest-frequency bug, found four times in one
 * week. `links` and `markers` have no wired rendition anywhere in this repo and will not have one
 * until the rest of migration stage 8, which ships each rendition WITH its source edit. Declaring
 * them here would produce two keys that load clean, type-check clean, and are read by nothing —
 * the exact shape the spec exists to prevent, committed in the change whose job is to prevent it.
 *
 * They arrive one at a time, one key per rendition, and the cost of adding one is one union member
 * and one DEFAULT entry, because nothing re-expresses this list.
 *
 * ── AND `tags` ARRIVED AT STAGE 8, WITH A READER AND A GRAMMAR ──
 *
 * `tags` is the FIRST key whose subject is a TOKEN rather than a LINE, and the first whose `wired`
 * rendition does not contain the source characters as text a person could read off the page. That
 * is what makes it the interesting one: every rendition before it kept the characters (a checkbox
 * IS the glyph, an `<h3>` keeps its words), so nothing could tell a painter that reads the source
 * from a painter that reads the page. A chip can. `tagSpans` below is the grammar half of it — the
 * LINE level's content input for tags — and the painter is the other half.
 *
 * ── WHY `heading` IS HERE, WHICH IS A CORRECTION TO THE SPEC, NOT AN ADDITION ──
 *
 * design-presentation-cascade.md section 0.1 says "the single resolution the app performs is the
 * checkbox". That is true of the INLINE tail — `md.renderInline` changes nothing about a
 * wiki-link, a tag or a marker, all of which reach the browser as literal characters. It is not
 * true of the line as a whole: `paintView` turned `## Work` into an `<h3>` element, which is a
 * `heading` rendered `wired` in section 2.3's own vocabulary. So the app resolved TWO families,
 * not one, and both are extracted here. Nothing new is resolved by this change.
 *
 * ── AND `prose` ARRIVED AT STAGE 3, FOR A REASON THAT IS THE STAGE'S WHOLE POINT ──
 *
 * A prose line was already resolved: `paintView` handed it to markdown-it as its own one-line
 * document, so `- a bare item` became a list and `**bold**` became a `<b>`. That is a `wired`
 * rendition of a family whose `raw` end nobody had named, and the family had no key only because
 * nothing could ever select the other end.
 *
 * The cursor rule is what made it selectable, and a focus surface that skipped prose would be a
 * half surface: click a task and see its source, click the sentence under it and nothing happens.
 * So the key lands WITH its reader and WITH the affordance that needs it — the same rule that
 * kept `tags`, `links` and `markers` out of stage 1 admits `prose` here. What still has no key is
 * a BLANK line, and that absence is honest: a blank line has no wired rendition at all (it
 * vanishes), so there is nothing for a cursor to land on and nothing to resolve between.
 *
 * ── AND `stamp` ARRIVED FIFTH — WHICH IS NOT THE SPEC'S `links`, AND THE NAME SAYS SO ──
 *
 * The spec's fifth key is `links`, and the backlog row for it asks for "a title instead of
 * `[[qntm:121]]`". This key is NARROWER than that on purpose and is named for what it actually
 * governs: the IDENTITY STAMP, `[[qntm:N]]`, and nothing else.
 *
 * The engine's own line grammar is the WIDER wiki-link form (`parse_wiki_link.py`, cited at
 * `WIKI_LINK` below), and `~/qntm/habits.md` carries `[[Store all somewhere]]` and
 * `[[JB to send over Sarasin]]` — bracketed spans with internal whitespace that the operator TYPED
 * and READS. A key called `links` would be a declaration that covers both forms, and its wired
 * rendition would therefore hide his own words. So the two grammars are used for opposite purposes
 * and that asymmetry is the whole boundary:
 *
 *   `wikiLinkSpans` — the WIDE form, used by `titleSpans` for word motions. Skipping too much is a
 *   surprise (a word target one word further on than expected); skipping too little corrupts a
 *   structural reference. Over-application is the SAFE direction, so the wide grammar wins.
 *
 *   `stampSpans` — the NARROW form, used by the `stamp` rendition. Hiding too much removes the
 *   operator's own content from his page; hiding too little leaves an ugly token visible.
 *   Under-application is the SAFE direction, so the narrow grammar wins.
 *
 * `links`, meaning a rendition of the title form, is still unshipped and still has no reader. It
 * does not get a key here for the same reason it did not at stage 1.
 */

/** The two ends of the dial. `raw` is the characters; `wired` is the app's rendition of them. */
export type Rendition = "raw" | "wired";

/** The token families this app shows more than one way. See the notes above on why it is five. */
export type ResolutionKey = "checkbox" | "heading" | "prose" | "tags" | "stamp";

/** A complete answer: one rendition per family. */
export type Resolution = { readonly [K in ResolutionKey]: Rendition };

/** What a single level may say. A level may speak about some keys and stay silent on the rest. */
export type Contribution = Partial<Resolution>;

/** Every key, for callers that need to iterate the families without re-expressing the list. */
export const RESOLUTION_KEYS = [
  "checkbox",
  "heading",
  "prose",
  "tags",
  "stamp",
] as const satisfies readonly ResolutionKey[];

/**
 * The floor of the cascade — what a key resolves to when every level is silent.
 *
 * THESE VALUES ARE WHY THE PAINTED OUTPUT UNDER A SILENT CONTEXT IS BYTE-IDENTICAL TO THE PAINTER
 * THIS ONE REPLACED. `paintView` built a real `<input type="checkbox">` for a task line and an
 * `<h_>` for a heading, unconditionally, and it showed a tag as the characters `#work` because
 * `md.renderInline` does nothing to them. `wired` for the three line families and `raw` for tags,
 * with every level silent, is that behaviour expressed as a resolution instead of as a hardcoded
 * branch.
 *
 * SO `tags` IS `raw` HERE AND `wired` IN THE SERVED DECLARATION, AND THE ASYMMETRY IS THE POINT.
 * DEFAULT is the floor: what the app does when NOTHING has been declared, which is what it did
 * before this key existed. The chip is not the floor — it is a decision the instance makes, in
 * `presentation.json`, at GLOBAL. That is what keeps `tests/present-golden.test.mjs` a real
 * comparison against the original painter (it paints against silence, and silence still means the
 * characters), and it is what makes the chip a DECLARATION rather than a rewrite: delete the key
 * from the served file and the chips are gone, with nothing rebuilt.
 *
 * `stamp` IS `raw` HERE FOR THE SAME REASON AND WITH MORE AT STAKE. The floor is what the app did
 * before the key existed, which is: print `[[qntm:3]]`. That keeps the golden master a real
 * comparison, and it makes the mark a decision the INSTANCE takes rather than a rewrite of the
 * painter — but it also means that if the served declaration ever fails to load, or a key is
 * misspelled, or a future reader goes silent, the app falls back to SHOWING the stamp. The failure
 * direction of a rendition that hides an identity must be "it becomes visible again", never "it
 * becomes invisible", and the floor is where that is decided.
 */
export const DEFAULT: Resolution = Object.freeze({
  checkbox: "wired",
  heading: "wired",
  prose: "wired",
  tags: "raw",
  stamp: "raw",
});

/**
 * The shape of one source line — the LINE level's content input.
 *
 * This lives in `resolution.ts` because that is the reader section 2.2 assigns to the LINE level:
 * "the line's own content is already the most specific CONTENT input". Recognising what a line IS
 * (a task, a heading, blank, or prose) is a different act from deciding how it is SHOWN, and
 * keeping them in different modules is what lets the painter be told the answer rather than work
 * it out.
 *
 * `source` is carried on every shape because the raw rendition needs the characters verbatim and
 * a re-serialisation from the parsed parts would be a reconstruction — the exact move section 5
 * forbids, one layer down from the DOM.
 */
export type LineShape =
  | {
      readonly kind: "checkbox";
      readonly source: string;
      readonly indent: string;
      readonly done: boolean;
      readonly tail: string;
    }
  | {
      readonly kind: "heading";
      readonly source: string;
      readonly hashes: string;
      readonly text: string;
    }
  | { readonly kind: "blank"; readonly source: string }
  | { readonly kind: "prose"; readonly source: string };

// VERBATIM from app.html:241 and app.html:257 as they stood at 64c3a87. Not tidied, not widened,
// not made stricter. The whole claim of this change is that the decisions moved and did not
// change, and a "harmless" improvement to either regex would silently falsify it. If either
// should be different, that is a separate change with its own evidence.
const TASK = /^(\s*)- \[( |x|X)\] (.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;

/**
 * Classify one source line.
 *
 * THE ORDER OF THESE TESTS IS LOAD-BEARING and reproduces `paintView`'s exactly: task first,
 * heading second, blank third, prose last. A line matching neither of the first two and trimming
 * to nothing vanished from the old painter; a line matching neither and holding characters became
 * its own one-line markdown document. Both are preserved.
 */
export function classifyLine(line: string): LineShape {
  const task = TASK.exec(line);
  if (task !== null) {
    return {
      kind: "checkbox",
      source: line,
      indent: task[1] ?? "",
      done: (task[2] ?? "").toLowerCase() === "x",
      tail: task[3] ?? "",
    };
  }

  const heading = HEADING.exec(line);
  if (heading !== null) {
    return {
      kind: "heading",
      source: line,
      hashes: heading[1] ?? "",
      text: heading[2] ?? "",
    };
  }

  if (line.trim() === "") {
    return { kind: "blank", source: line };
  }

  return { kind: "prose", source: line };
}

/**
 * THE BULLET A NODE LINE IS PRINTED WITH — the one piece of chrome that is not a checkbox.
 *
 * The engine prints EVERY node line with a bullet, whatever its type's render shape:
 * `renderer.py:950` is `f"{'    ' * depth}- {' '.join(cell for cell in cells if cell)}"`, one
 * unconditional `- ` in front of the cells, and only the CELLS differ between a checkbox shape and
 * a plain-line shape. So `- ` is chrome and the thing after it is content. The alternation covers
 * `*` and `+` because a person authoring by hand may type either and markdown-it renders all three
 * as a list; the engine only ever emits `-`.
 */
const BULLET = /^(\s*)([-*+])(\s+|$)/;

/**
 * THE CHECKBOX GLYPH, AS THE ENGINE READS IT — laxer than `TASK` above, and deliberately so.
 *
 * `TASK` is a verbatim transcription of what the browser's old painter matched and may not be
 * widened: the whole claim of the extraction that created it is that the decisions moved and did
 * not change. But the ENGINE's reader is looser — `parse_checkbox.py:48` is
 * `^([-*+])\s(\[.\])\s?(.*)`, with the space after the glyph OPTIONAL — so `- [ ]` with nothing
 * after it is a checkbox line to the engine and a prose line to `classifyLine`.
 *
 * That gap is only ever consulted by `carriesContent`, and there it must be closed in the ENGINE's
 * favour: the question that predicate asks is "would the engine make a node with no title out of
 * this", and the engine is the one answering. Any other reader that needs it should think about
 * which of the two vocabularies it is really asking about first.
 */
const CHECKBOX_GLYPH = /^\[.\]\s*/;

/**
 * Does this line carry anything a node could be made of, once its chrome is taken off?
 *
 * ── WHY THIS EXISTS, WHICH IS A MEASURED FACT ABOUT THE ENGINE AND NOT A TASTE ──
 *
 * `applyEdit` refuses to INSERT a line that fails this. Run against a hermetic copy of the engine's
 * shipped starter bundle (`qntm-md init` then `qntm-md run`, 2026-07-31), a new line with no
 * content has two fates and both are worse than the affordance not firing:
 *
 *   * `- [ ] ` MINTS A NODE TITLED NOTHING. There is no empty-title guard between the parser and
 *     the mint, so the cycle created `qntm:3`, printed it back as `- [ ] [[qntm:3]] #work #task`,
 *     and — because a node is graph state, not a line — reprinted it in three sections across two
 *     views. A stray keystroke becomes permanent junk in every view that qualifies it.
 *   * A wholly blank line is skipped by the shipped `tolerant` input grammar, mints nothing, and is
 *     GONE the moment the cycle rewrites the view, which it does for every view every cycle.
 *
 * ── IT IS ASKED OF THE GRAMMAR THIS MODULE ALREADY OWNS ──
 *
 * `classifyLine` first, then the one question each shape needs. Not a fresh regex over the whole
 * line: the engine's own rule for its tag grammar — "one canonical implementation per capability,
 * no parallel regex" — is the rule this repo mirrors, and a second opinion about what a checkbox
 * line is would be exactly that. What is added is `BULLET`, which is about the BULLET and is the
 * only piece of node-line chrome `classifyLine` did not already have a name for.
 */
export function carriesContent(line: string): boolean {
  const shape = classifyLine(line);
  if (shape.kind === "blank") {
    return false;
  }
  if (shape.kind === "heading") {
    return shape.text.trim() !== "";
  }
  // EVERY OTHER SHAPE IS CHROME THEN CONTENT, and the chrome is at most a bullet followed by a
  // checkbox glyph. Both are taken off in that order and whatever survives is the title. This
  // covers the checkbox shape and the prose shape with one sentence, which is what lets `- [ ]`
  // with no trailing space — a prose line to `classifyLine` and a checkbox line to the engine — be
  // refused by the same rule that refuses `- [ ] `. A bare bullet is exactly what a person leaves
  // behind when they open a line and change their mind.
  //
  // ── AND THE TAGS COME OFF TOO, WHICH IS A CHANGE THIS FILE'S OWN MEASUREMENT FORCES ──
  //
  // A tag is not a title. `io/parser/line_parser.py` excises every resolved tag span from the
  // remainder and then normalises what is left (`_normalise_title` collapses the whitespace the
  // excision leaves behind), so `- [ ] #task #personal ` reaches the mint with an EMPTY title and
  // has exactly the first fate above: a node called nothing, reprinted into every view that
  // qualifies it, forever. This was always true of a line the operator typed a tag into and
  // nothing else; it became REACHABLE BY DEFAULT when `newline.ts` started seeding the section's
  // declared tokens into a new line, so the predicate now asks the question the engine asks.
  //
  // ONLY TAGS, NOT MARKERS, AND THAT IS STATED RATHER THAN LEFT AS AN OVERSIGHT. `- [ ] 📅
  // 2026-08-01` has the same empty-title fate, and this predicate still returns true for it. The
  // marker glyphs are a config fact this module does not hold (`resolution.orderingFields`
  // publishes three of the eleven, for a different purpose), and no affordance in this app seeds
  // one — see `scripts/generate-resolution-declaration.mjs`, which reads no marker at all.
  const tail = line.replace(BULLET, "").replace(CHECKBOX_GLYPH, "");
  let stripped = tail;
  // Backwards, so an earlier span's indices are not moved by a later span's removal.
  for (const span of [...tagSpans(tail)].reverse()) {
    stripped = stripped.slice(0, span.start) + stripped.slice(span.end);
  }
  return stripped.trim() !== "";
}

/**
 * The chrome a NEW line in this line's company would be printed with, or `null` if this line is
 * not evidence of anything.
 *
 * ── THIS IS THE APP READING THE CASCADE'S ANSWER RATHER THAN RE-DERIVING IT ──
 *
 * What shape a new line should take is decided by the engine's `default_node_type`, which cascades
 * GLOBAL -> VIEW -> STRUCTURAL_NODE (`src/qntm_md/resolution/registration.py:89-113`) and is
 * consumed at two ends of the same fact:
 *
 *   * at ADMISSION, `io/applier.py:110-150` (`_declared_form_is_chrome_free`) decides whether a
 *     line without a checkbox may be INPUT by asking whether the type it would resolve to declares
 *     a render shape that is not `checkbox`;
 *   * at RENDER, `render/renderer.py:909-936` dispatches on the SAME `render.shape` to decide what
 *     cells the line is PRINTED with.
 *
 * One declaration, both directions. So a line the engine has already PRINTED into this view is the
 * cascade's answer, computed by the thing that owns the cascade and delivered to the browser inside
 * the view's own source. The app does not need `default_node_type` — which it could not read
 * anyway, because the snapshot envelope does not carry it — it needs to read what the cascade
 * already decided, off the SOURCE STRING and never off the DOM.
 *
 * ── WHAT COUNTS AS EVIDENCE, AND WHAT DELIBERATELY DOES NOT ──
 *
 * Only a line the engine would have printed as a NODE. That is a bullet, optionally followed by a
 * checkbox. A heading is not evidence (it is a section boundary, and `newline.ts` uses it as one).
 * A blank line is not evidence. A line with no bullet is not evidence either — the engine never
 * emits one, so mirroring it would be mirroring something the cascade did not say.
 *
 * The checkbox is returned OPEN whatever the evidence line's state. Copying `- [x] ` would make a
 * new line arrive already completed, which is a fact about the line above it and not about the
 * shape a new one takes.
 */
export function chromeOf(line: string): string | null {
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

/**
 * ── WHAT A TAG IS, AND WHERE THAT ANSWER CAME FROM ──
 *
 * NOT "a word after a hash". The engine has a tag grammar and this is a MIRROR of it, transcribed
 * from one place and cited so a reader can check rather than trust:
 *
 *   the engine, src/qntm_md/io/parser/parse_tag.py:23
 *     TAG_RE = re.compile(r"(?<!\S)#([a-zA-Z_][a-zA-Z0-9_-]*)")
 *
 * That module's own header names it "the public canonical hashtag-extraction regex… one canonical
 * implementation per capability — no parallel regex", and the engine's `applier.py:564-572` states
 * the consequences in the same words this comment would otherwise have to invent: `## Heading`,
 * `C#` and `foo#bar` never match. The engine's audit
 * (`docs/implementation-artifacts/research-input-interpretation.md:290`) lists the tag lexical
 * shape under "Closed (code)" — it is NOT vocabulary config. `config/vocabulary/*.yaml` decides
 * what a MATCHED tag MEANS (`#work` -> domain=work); it never decides what SHAPE is matched. So
 * there is exactly one thing to mirror and this is it.
 *
 * In prose: `#`, then one `[A-Za-z_]`, then any run of `[A-Za-z0-9_-]`, and the `#` must be at the
 * start or preceded by whitespace. Nothing terminates it — it ends at the first character outside
 * the body class.
 *
 * ── WHY THE FORM DIFFERS AND THE LANGUAGE DOES NOT ──
 *
 * `(^|\s)` rather than `(?<!\S)`. Lookbehind is ES2018 and Safari only shipped it in 16.4, and a
 * regex literal a browser cannot parse is a SyntaxError at module load — it would not degrade the
 * tag rendition, it would take the whole presentation bundle down with it. The two forms accept
 * exactly the same language here, because the alternative only ever consumes the whitespace BEFORE
 * a `#` and never the whitespace after one, so two tags can never contend for the same separator.
 * That equivalence is not asserted, it is TESTED: tests/present-tags.test.mjs carries the engine's
 * verbatim lookbehind regex and compares the two over the named edge cases and a generated sweep.
 *
 * ── THE PROPERTY THE PAINTER LEANS ON, STATED HERE BECAUSE IT IS A FACT ABOUT THE GRAMMAR ──
 *
 * A tag body is `[A-Za-z0-9_-]` and a tag begins with `#`. NONE of `< > & "` can appear in one.
 * So a matched tag is safe to place inside an HTML attribute-bearing element without escaping —
 * not because the painter escapes it, but because the grammar cannot produce a character that
 * would need escaping. tests/present-tags.test.mjs fuzzes hostile lines against that claim.
 */
const TAG = /(^|\s)#([a-zA-Z_][a-zA-Z0-9_-]*)/g;

/**
 * One tag, located in the text it was found in.
 *
 * OFFSETS, NOT JUST TEXT, because the whole design turns on being able to say WHERE in the source
 * a rendition came from. A rendition that knew only "this line has a tag called #work" could not
 * express its removal as a substring operation, and an affordance with no substring operation is
 * not admissible (design-presentation-cascade.md section 5). The offsets are what make the chip's
 * missing affordance a decision that can be taken later rather than a dead end.
 */
export interface TagSpan {
  /** Index of the `#` in the text this was found in. */
  readonly start: number;
  /** Index one past the last character of the tag. */
  readonly end: number;
  /** The tag, INCLUDING the `#`, verbatim from the source. */
  readonly text: string;
}

/**
 * Every tag in `text`, in order, with its position.
 *
 * `matchAll` rather than a loop over `exec`, because `TAG` carries the global flag and `exec`
 * would carry `lastIndex` from one call into the next — a module-level regex with mutable state
 * shared across every line of every view. `matchAll` clones the regex, so this function is
 * re-entrant and the shared literal stays a constant.
 */
export function tagSpans(text: string): readonly TagSpan[] {
  const spans: TagSpan[] = [];
  for (const match of text.matchAll(TAG)) {
    // Group 1 is the leading boundary — empty at the start of the text, one whitespace character
    // otherwise. It is CONSUMED by the match, so the tag itself starts after it.
    const start = (match.index ?? 0) + (match[1] ?? "").length;
    const tag = "#" + (match[2] ?? "");
    spans.push({ start, end: start + tag.length, text: tag });
  }
  return spans;
}

/**
 * A located run of characters a word motion must skip over rather than land inside. Shares its
 * shape with `TagSpan` rather than reusing it, because a `WordSpan` is never a rendition question
 * (it has no `text` a painter would show differently) — it exists only for `titleSpans` below.
 */
export interface WordSpan {
  /** Index of the span's first character. */
  readonly start: number;
  /** Index one past the span's last character. */
  readonly end: number;
}

/**
 * ── `[[qntm:ID]]` — THE IDENTITY STAMP, MIRRORED FROM ONE NAMED PLACE ──
 *
 * Verbatim from the engine, cited so it can be checked rather than trusted:
 *
 *   the engine, apps/qntm-md/src/qntm_md/io/parser/parse_qntm_id.py:20-23
 *     _QNTM_ID_RE = re.compile(
 *         r"\[\[qntm:([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)\]\]",
 *         re.IGNORECASE,
 *     )
 *
 * `i` (JS's case-insensitive flag) is what `re.IGNORECASE` becomes — the engine's own test suite
 * (`tests/io/parser/test_parse_qntm_id.py:46`) asserts `[[QNTM:42]]` extracts `"42"`, so the
 * lowercase-only literal used everywhere else in this file (`~/qntm/*.md`'s own stamps are always
 * lowercase) would silently disagree with a hand-typed uppercase one.
 *
 * `qntmIdSpans` exists to be TESTED against this citation, the way `tagSpans` is tested against
 * `parse_tag.py`'s. It is not what `titleSpans` uses to build its atoms below — see `wikiLinkSpans`
 * for why the wider grammar is the one this module actually needs.
 *
 * IT IS, HOWEVER, EXACTLY WHAT THE `stamp` RENDITION NEEDS, and one grammar serves both callers:
 * `stampSpans` is the walker and `qntmIdSpans` is a narrowing view of it, so there is one regex,
 * one loop and one thing to check against the citation. Two functions matching `[[qntm:N]]` with
 * two regexes would be the "parallel regex" the engine's own tag module forbids by name.
 */
const QNTM_ID = /\[\[qntm:([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)\]\]/gi;

/**
 * One identity stamp, located in the text it was found in.
 *
 * CARRIES THE CHARACTERS AS WELL AS THE OFFSETS, for the same reason `TagSpan` does: a rendition
 * that knew only "this line is stamped" could not express its restoration as a substring
 * operation, and the `stamp` key's whole safety argument is that what it stops PRINTING it can
 * still WRITE BACK verbatim. `text` is the restoration, byte for byte, held beside the place it
 * came out of.
 */
export interface StampSpan {
  /** Index of the first `[` in the text this was found in. */
  readonly start: number;
  /** Index one past the last `]`. */
  readonly end: number;
  /** The stamp, INCLUDING both pairs of brackets, verbatim from the source. */
  readonly text: string;
  /** The node id inside it — `3` for `[[qntm:3]]`. Never the brackets, never the `qntm:`. */
  readonly id: string;
}

/**
 * Every `[[qntm:ID]]` identity stamp in `text`, in order, with its position and its characters.
 *
 * `matchAll` rather than a loop over `exec`, for the reason `tagSpans` states: `QNTM_ID` carries
 * the global flag and `exec` would carry `lastIndex` from one call into the next.
 */
export function stampSpans(text: string): readonly StampSpan[] {
  const spans: StampSpan[] = [];
  for (const match of text.matchAll(QNTM_ID)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length, text: match[0], id: match[1] ?? "" });
  }
  return spans;
}

/** Every `[[qntm:ID]]` identity stamp in `text`, in order, with its position. */
export function qntmIdSpans(text: string): readonly WordSpan[] {
  return stampSpans(text).map(({ start, end }) => ({ start, end }));
}

/**
 * ── `[[...]]` — EVERY BRACKETED LINK, NOT ONLY THE IDENTITY-SHAPED ONE ──
 *
 * `parse_qntm_id.py` is real code and is really called (`orchestrator.py:831-832`,
 * `render_context_parse.py:137`) — but NOT by the path that decides what a hand-typed LINE's
 * trailing chrome is. That path is `line_parser.parse_line`, and its own composition order says so
 * explicitly (`line_parser.py:79`): "Call `parse_wiki_link.parse(remainder)` … before
 * directive/tag extraction". `parse_wiki_link.py`'s grammar is wider than an identity stamp:
 *
 *   the engine, apps/qntm-md/src/qntm_md/io/parser/parse_wiki_link.py:26
 *     _WIKI_LINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
 *
 * and its own docstring is explicit that BOTH `[[qntm:N]]` and `[[Some Note]]` match it — "form"
 * (`"qntm_id"` vs `"title"`) is decided AFTER the same bracket grammar matches, not by a different
 * regex per shape.
 *
 * THIS IS A CORRECTION TO WHAT THE DESIGN DOCUMENT ASKED FOR, MADE ON REAL EVIDENCE. Section 5.3
 * of `design-the-vim-cursor.md` names only the identity stamp. `~/qntm/habits.md:24` (read-only)
 * carries a line this app must also protect and that a narrower id-only regex would not:
 *
 *   - [x] Store all somewhere [[qntm:1723]] #task #work ✅ 2026-07-13 🆕 2026-07-07 #requires [[JB to send over Sarasin]]
 *
 * `#requires [[JB to send over Sarasin]]` is outgoing-edge chrome (`renderer.py`'s `chrome_cells`,
 * emitted LAST, after the markers) and its bracketed target carries FOUR words separated by
 * whitespace. A word grammar that only recognised `[[qntm:N]]` would treat "JB", "to", "send",
 * "over" and "Sarasin]]" as five ordinary title words and would happily land `{count}w` between
 * them — not inside an identity stamp, but inside a structural edge reference all the same, which
 * a stray keystroke corrupts by the same "absorbed into the title, exit 0, no diagnostic" failure
 * mode the design document names for the id form. `wikiLinkSpans` is the grammar that actually
 * protects both, and it strictly contains every span `qntmIdSpans` would find (every `[[qntm:N]]`
 * is also a `[[...]]`), so using it in `titleSpans` below is a widening, never a narrowing, of what
 * the design document asked to be skipped.
 */
const WIKI_LINK = /\[\[([^\]]+)\]\]/g;

/** Every `[[...]]` bracketed span in `text` — an identity stamp or a title-form link, either way. */
export function wikiLinkSpans(text: string): readonly WordSpan[] {
  const spans: WordSpan[] = [];
  for (const match of text.matchAll(WIKI_LINK)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length });
  }
  return spans;
}

/**
 * ── EMOJI MARKERS — THE ONE ATOM THAT IS GENUINELY VOCABULARY, NOT CODE ──
 *
 * `TAG`'s own header (above) draws the line this app otherwise leans on throughout: the tag's
 * LEXICAL SHAPE is closed code, and only its MEANING is `config/vocabulary/*.yaml`. A marker does
 * not split that way. `parse_marker.py:64` builds its matcher from
 * `token_resolver.marker_token_forms()` — there is no frozenset of emoji in the engine at all — so
 * WHICH GLYPHS ARE MARKERS is itself vocabulary, declared in `config/vocabulary/markers.yaml`.
 *
 * The design document names three, all seen on one line (`📅 🛫 🆕`). Reading the shipped config
 * finds TWELVE, not three: `📅 🛫 ✅ 🆕 🔽 ⏫ ☑️ 🎯 ⛔ 📌 🏳️ 💤 🔢`
 * (`apps/qntm-md/config/vocabulary/markers.yaml`, every row) — confirmed against real content,
 * `~/qntm/metrics.md` carries `🎯` (a render-only "par" marker on a heading, not a task line) and
 * `~/qntm/this_week.md` / `habits.md` carry `☑️` (render-only "done_task_count"), neither of which
 * the design document's three-item list would have caught.
 *
 * BUT HARDCODING THOSE TWELVE WOULD BE THE SAME MISTAKE THE TAG HEADER WARNS AGAINST, JUST ONE
 * REPO LAYER DOWN: a literal list mirrors THIS INSTANCE'S current declaration, not the grammar, and
 * an operator who adds a thirteenth marker to his own vocabulary would silently get no protection
 * from a grammar that is supposed to protect him. So this function does not match a list of emoji.
 * It matches the SHAPE the engine's own comment insists every marker keeps
 * (`markers.yaml:32-36`, on why `asserted_state` uses two glyphs rather than one ligature): "every
 * token here is a genuinely single grapheme" — `\p{Extended_Pictographic}`, ES2018's Unicode
 * property escape for exactly that class, with an optional trailing `️` (variation selector
 * 16) for a base character below the astral plane that still renders as an emoji (`☑️`, `🏳️`).
 *
 * VALUE-BEARING MARKERS consume a trailing token too — `parse_marker.py:98-99` always treats the
 * FIRST whitespace-separated run after a value-bearing marker as its value, splitting on the same
 * rule this function reads back (`raw_token = stripped.split(None, 1)[0]`). Which markers are
 * value-bearing is ALSO vocabulary (`extraction_hint` in `markers.yaml`), so the same argument
 * applies: rather than hardcode the seven that currently carry one, a trailing run is consumed
 * only when its own SHAPE says it is a value — an ISO date, an integer, or a decimal, the three
 * `KNOWN_HINTS` the engine's own type file declares (`qntm_md/types.py:85`,
 * `trailing_date`/`trailing_int`/`trailing_float`). A static marker (`⛔`, `📌`, …) is never
 * followed by something value-shaped in real content, so this costs nothing there; a value-bearing
 * one always is, so this catches every row in the shipped config without naming one of them.
 *
 * WHAT THIS DOES NOT CATCH: a genuinely decorative emoji a person typed INTO a title (`"Buy 🎂 for
 * the party"`). None of `~/qntm/*.md` (read-only, all five files) contains one — every emoji in
 * every line read for this change is trailing chrome — so this is a real, named, unverified-against
 * counter-evidence tradeoff rather than a silent one: an operator who starts writing decorative
 * emoji into a title would find `{count}w` skipping over it. That is the SAFE direction for the
 * failure to fall in — a word target that is one word short of where a person expects is a
 * surprise; a word target sitting inside chrome that silently corrupts a stamp is a defect. See the
 * report for this change for the same point made in the open.
 */
const MARKER_GLYPH = /\p{Extended_Pictographic}️?/gu;
const MARKER_VALUE = /^(?:\d{4}-\d{2}-\d{2}|\d+(?:\.\d+)?)$/;

/** Every marker glyph in `text`, each extended to include its trailing value when it has one. */
export function markerSpans(text: string): readonly WordSpan[] {
  const spans: WordSpan[] = [];
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

/**
 * ── `titleSpans` — WHERE THE THIRD WORD ACTUALLY IS ──
 *
 * `design-the-vim-cursor.md` section 2.3: "the third word counted while looking at NORMAL is not
 * the third word of the source string" — the operator sees a checkbox widget and a CSS margin
 * where the source holds fifteen characters of chrome, then a title, then an identity stamp, tags
 * and markers he never meant to count past. This is the grammar that counts what he counts: every
 * ordered run of non-whitespace characters in the line's TITLE, with chrome, the identity/wiki-link
 * stamp, every tag and every marker cut out first as atoms a word motion skips rather than enters.
 *
 * ── WHERE THE TITLE STARTS, PER SHAPE ──
 *
 * Reuses `classifyLine` rather than re-deciding what a line is:
 *
 *   * checkbox — `shape.tail` is already the chrome-free remainder (`TASK`'s own capture group);
 *     the title starts at `line.length - shape.tail.length`, which is exact because `TASK` anchors
 *     its own tail capture to the end of the line.
 *   * heading — `shape.text` is the same kind of remainder, for the same reason (`HEADING` anchors
 *     its own capture to the end of the line too).
 *   * prose — `classifyLine` has already decided this line is NEITHER a checkbox NOR a heading, so
 *     what chrome remains is exactly `carriesContent`'s own "bullet then checkbox glyph" sequence
 *     (`BULLET`, `CHECKBOX_GLYPH`, both above) — the SAME two regexes, asked in the SAME order, so
 *     a line like `- [>] Reminder …` (a real line, `~/qntm/habits.md:5` — `>` is not `TASK`'s
 *     `( |x|X)`, so `classifyLine` calls it prose, but `CHECKBOX_GLYPH`'s `\[.\]` accepts any
 *     single character between the brackets, so the glyph is still recognised as chrome here) has
 *     its title found the same way `carriesContent` already would have judged it.
 *   * blank — no title at all. Returns `[]`: "a line with no title … does nothing", per the brief.
 *
 * ── WHY ATOMS ARE FOUND IN THAT ORDER, AND WHY IT MATTERS ──
 *
 * `wikiLinkSpans`, then `tagSpans`, then `markerSpans` — the same order `line_parser.parse_line`
 * extracts them in (`line_parser.py:79-89`: wiki-link before tag, tag before marker). The order is
 * not cosmetic: a bracketed title-form link is extracted BEFORE tag parsing precisely so a
 * space-then-`#` INSIDE `[[...]]` is not read as a tag (`line_parser.py:80-81`'s own comment says
 * so). Atoms found later that would start strictly inside an atom already accepted are dropped —
 * the earlier grammar's span wins, mirroring the engine's own extraction order rather than
 * re-deciding one independently for this app.
 *
 * ── WHY A WORD IS "A RUN THE ATOMS DID NOT CLAIM", NOT "TEXT SPLIT ON WHITESPACE THEN FILTERED" ──
 *
 * A value-bearing marker's atom spans A WHITESPACE RUN — `📅 2026-08-28` is glyph, space, date,
 * ONE atom — so splitting on whitespace FIRST and discarding whichever pieces overlap an atom
 * SECOND would still treat `2026-08-28` as its own word between two splits. This walks the content
 * once, character by character, and a position already inside an atom is never the start of a
 * word — which is what stops `{count}w` from ever counting into the date half of a marker cell.
 */
export function titleSpans(line: string): readonly WordSpan[] {
  const shape = classifyLine(line);

  let content: string;
  let prefixLen: number;
  if (shape.kind === "blank") {
    return [];
  } else if (shape.kind === "heading") {
    content = shape.text;
    prefixLen = line.length - shape.text.length;
  } else if (shape.kind === "checkbox") {
    content = shape.tail;
    prefixLen = line.length - shape.tail.length;
  } else {
    // prose — carriesContent's own "bullet then checkbox glyph" chrome sequence, see above.
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

  const claims: WordSpan[] = [];
  for (const span of [...wikiLinkSpans(content), ...tagSpans(content), ...markerSpans(content)]) {
    // Drop a later grammar's span if it starts inside a span an earlier, higher-priority grammar
    // already claimed — see the header for why the priority order is the engine's own.
    if (!claims.some((claimed) => span.start >= claimed.start && span.start < claimed.end)) {
      claims.push(span);
    }
  }
  claims.sort((a, b) => a.start - b.start);

  const atomAt = (index: number): WordSpan | undefined =>
    claims.find((claim) => index >= claim.start && index < claim.end);

  const words: WordSpan[] = [];
  let i = 0;
  while (i < content.length) {
    const atom = atomAt(i);
    if (atom !== undefined) {
      i = atom.end;
      continue;
    }
    if (/\s/.test(content[i] ?? "")) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < content.length && atomAt(i) === undefined && !/\s/.test(content[i] ?? "")) {
      i += 1;
    }
    words.push({ start: start + prefixLen, end: i + prefixLen });
  }
  return words;
}

/** Why `cleanTitleFor` has nothing to say. */
export type CleanTitleAbstention = "no-title" | "style-ambiguous";

/** Either the line's clean (chrome-free) title text, or the reason there is none. */
export type CleanTitleReading =
  | { readonly kind: "title"; readonly text: string }
  | { readonly kind: "abstains"; readonly because: CleanTitleAbstention };

// A leading+trailing wrap this reader does NOT unwrap — see cleanTitleFor's own header.
const STYLE_WRAPS = ["~~", "**", "*", "_"];

/**
 * `cleanTitleFor` — the SAME chrome-free text `apps/qntm-md/src/qntm_md/io/parser/line_parser.py`
 * stores as a node's `title` field (`canonicalise_title_segment(_normalise_title(remainder))`,
 * `line_parser.py:241`/`:379`), read from the printed line rather than transcribed. Built for
 * `app/present/ordering.ts`'s default-ordering comparator, which needs a TITLE VALUE for every
 * qualifying-looking row even when `due_date`/`priority` are absent (title is the engine's OWN
 * final tiebreak — see `ordering.ts`'s header).
 *
 * ── HOW IT AGREES WITH THE ENGINE'S OWN PIPELINE, STEP FOR STEP ──
 *
 *   1. CHROME (checkbox/bullet prefix) — the SAME "which shape, which tail" walk `titleSpans`
 *      above already does, reused rather than re-decided.
 *   2. TAGS / WIKI-LINKS / MARKERS — the SAME three atom-finders `titleSpans` claims content with,
 *      in the SAME priority order (`line_parser.py:79-89`'s own extraction order, that function's
 *      own header cites the chain for). Every claimed span is CUT OUT rather than walked around —
 *      `titleSpans` only needs to know a word does not START inside a claim; this needs the
 *      claimed characters actually gone, the way `parse_marker`/`parse_wiki_link`/`parse_tag`
 *      remove them from `remainder` before the engine ever normalises it.
 *   3. WHITESPACE — `\s+` collapsed to one space, then trimmed, mirroring `_normalise_title`
 *      (`line_parser.py:55-57`) exactly (same regex shape, same order: collapse then strip).
 *
 * ── WHY AN EMPTY RESULT IS SOMETIMES A TITLE AND SOMETIMES `no-title` ──
 *
 * A genuinely `blank` line (`classifyLine`'s own `"blank"` shape) mints no node at all — there is
 * no title to compare because there is no ROW. A `- [ ] ` with nothing else DOES mint a node
 * (`rendition.ts`'s own `carriesContent` header: "`- [ ] ` MINTS A NODE TITLED NOTHING"), and
 * `_normalise_title("")` is `""`, not `None` — the engine's own `title` field is the EMPTY STRING,
 * a real, comparable value (`str("")` sorts before every non-empty title). So only the `blank`
 * shape abstains `no-title` here; every other shape that strips down to nothing still returns
 * `{ kind: "title", text: "" }`.
 *
 * ── WHAT IT DOES NOT ATTEMPT, NAMED RATHER THAN SILENTLY WRONG ──
 *
 * `canonicalise_title_segment` ALSO strips a leading+trailing STYLING wrapper (`~~`/`**`/`*`/`_`)
 * around the whole title (`render_context_parse.py`'s `_strip_wrapped_title_segment`), guarded by
 * a `_would_become_parser_syntax` check this reader does not reproduce. Rather than risk a title
 * string that silently disagrees with the engine's (an operator who writes `**Ship it**` would get
 * a browser-side title carrying the `**` and an engine-side title without it — two different sort
 * keys for the same row), this function ABSTAINS `style-ambiguous` the instant the stripped content
 * starts AND ends with the same wrapper — an honest "I don't know" rather than a guess that could
 * place a row where the engine will not. Unconfirmed empirically how often the operator's real
 * content hits this (measured for `titleSpans`' own decorative-emoji case, not this one) — stated,
 * not assumed away.
 */
export function cleanTitleFor(line: string): CleanTitleReading {
  const shape = classifyLine(line);

  let content: string;
  if (shape.kind === "blank") {
    return { kind: "abstains", because: "no-title" };
  } else if (shape.kind === "heading") {
    content = shape.text;
  } else if (shape.kind === "checkbox") {
    content = shape.tail;
  } else {
    // prose — the same "bullet then checkbox glyph" chrome sequence titleSpans/carriesContent use.
    const bullet = BULLET.exec(line);
    let rest = bullet !== null ? line.slice(bullet[0].length) : line;
    const glyph = CHECKBOX_GLYPH.exec(rest);
    if (glyph !== null) rest = rest.slice(glyph[0].length);
    content = rest;
  }

  const claims: WordSpan[] = [];
  for (const span of [...wikiLinkSpans(content), ...tagSpans(content), ...markerSpans(content)]) {
    // Same priority rule titleSpans uses: a later grammar's span loses to an earlier one it starts
    // inside of.
    if (!claims.some((claimed) => span.start >= claimed.start && span.start < claimed.end)) {
      claims.push(span);
    }
  }
  claims.sort((a, b) => a.start - b.start);

  let cut = "";
  let at = 0;
  for (const claim of claims) {
    cut += content.slice(at, claim.start);
    at = claim.end;
  }
  cut += content.slice(at);

  const normalised = cut.replace(/\s+/g, " ").trim();
  for (const wrap of STYLE_WRAPS) {
    if (
      normalised.startsWith(wrap) &&
      normalised.endsWith(wrap) &&
      normalised.length > wrap.length * 2
    ) {
      return { kind: "abstains", because: "style-ambiguous" };
    }
  }
  return { kind: "title", text: normalised };
}

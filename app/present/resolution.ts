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
 */

/** The two ends of the dial. `raw` is the characters; `wired` is the app's rendition of them. */
export type Rendition = "raw" | "wired";

/** The token families this app shows more than one way. See the notes above on why it is four. */
export type ResolutionKey = "checkbox" | "heading" | "prose" | "tags";

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
 */
export const DEFAULT: Resolution = Object.freeze({
  checkbox: "wired",
  heading: "wired",
  prose: "wired",
  tags: "raw",
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

/**
 * What a resolution IS — values only. No DOM, no fetch, no behaviour beyond reading a line.
 *
 * A `Resolution` is a small closed record, one key per token family the app can show more than
 * one way, each key holding a `Rendition`. `raw` means the characters, verbatim. `wired` means
 * the app's rendition of them. Every mixture is legal: a Resolution with every key `raw` is a
 * plain text file, one with every key `wired` is a conventional app, and the operator's position
 * and a first-time visitor's position are two values of the same type rather than two products.
 *
 * ── TWO KEYS, NOT FIVE, AND THIS IS THE ONE PLACE THIS MODULE DEPARTS FROM THE SPEC ──
 *
 * design-presentation-cascade.md section 2.3 specifies five keys — checkbox, tags, links,
 * markers, heading. This ships TWO: the two the painter actually reads.
 *
 * The reason is section 9's own rule, which that document states more forcefully than anything
 * else in it: do not declare a key whose reader does not exist. "A declaration that exists and
 * does not reach" is named there as this system's highest-frequency bug, found four times in one
 * week. `tags`, `links` and `markers` have no wired rendition anywhere in this repo and will not
 * have one until migration stage 8, which ships each rendition WITH its source edit. Declaring
 * them here would produce three keys that load clean, type-check clean, and are read by nothing —
 * the exact shape the spec exists to prevent, committed in the change whose job is to prevent it.
 *
 * They arrive at stage 8, one key per rendition, and the cost of adding one is one union member
 * and one DEFAULT entry, because nothing re-expresses this list.
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

/** The token families this app shows more than one way. See the notes above on why it is three. */
export type ResolutionKey = "checkbox" | "heading" | "prose";

/** A complete answer: one rendition per family. */
export type Resolution = { readonly [K in ResolutionKey]: Rendition };

/** What a single level may say. A level may speak about some keys and stay silent on the rest. */
export type Contribution = Partial<Resolution>;

/** Every key, for callers that need to iterate the families without re-expressing the list. */
export const RESOLUTION_KEYS = [
  "checkbox",
  "heading",
  "prose",
] as const satisfies readonly ResolutionKey[];

/**
 * The floor of the cascade — what a key resolves to when every level is silent.
 *
 * THESE TWO VALUES ARE WHY THE OUTPUT OF THIS CHANGE IS BYTE-IDENTICAL TO THE OUTPUT BEFORE IT.
 * `paintView` built a real `<input type="checkbox">` for a task line and an `<h_>` for a heading,
 * unconditionally. `wired` for both, with every level silent, is that behaviour expressed as a
 * resolution instead of as a hardcoded branch. Flipping either one is migration stage 2's job and
 * requires a declaration to exist first.
 */
export const DEFAULT: Resolution = Object.freeze({
  checkbox: "wired",
  heading: "wired",
  prose: "wired",
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

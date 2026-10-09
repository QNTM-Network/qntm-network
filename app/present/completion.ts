/**
 * Completion — ONE SHAPE FOR EVERY "SUGGEST WHILE TYPING" SOURCE (2026-10-07, operator-directed:
 * usability features "in an architecturally clean modular way").
 *
 * PURE. A source looks at the line being typed and the caret, and either says nothing or offers
 * items for one span of the text. The DOM half (`app/shell/completer.ts`) asks each source in turn,
 * shows the first answer, and applies the chosen item with `applyCompletion`. Tags and dates are
 * the first two sources; a new one (people, links, …) is a new function of this type and nothing
 * else changes.
 */

import type { RankPolicy } from "./rank.js";
import { matchingTags, tagQueryAt } from "./tagcomplete.js";

export interface CompletionItem {
  /** What the list shows. */
  readonly label: string;
  /** What replaces the span when this item is taken. */
  readonly insert: string;
}

export interface Completion {
  /** The span `[start, end)` an item replaces. */
  readonly start: number;
  readonly end: number;
  readonly items: readonly CompletionItem[];
}

export type CompletionSource = (text: string, caret: number) => Completion | null;

/** The first source with something to offer wins; `null` when none has. */
export function completeWith(sources: readonly CompletionSource[], text: string, caret: number): Completion | null {
  for (const source of sources) {
    const answer = source(text, caret);
    if (answer !== null && answer.items.length > 0) return answer;
  }
  return null;
}

/** The text with the span replaced and a single space after it, and the new caret. */
export function applyCompletion(
  text: string,
  completion: Completion,
  insert: string,
): { readonly text: string; readonly caret: number } {
  const after = text.slice(completion.end);
  const spacer = after.startsWith(" ") ? "" : " ";
  return {
    text: text.slice(0, completion.start) + insert + spacer + after,
    caret: completion.start + insert.length + 1,
  };
}

/** Tags, from the vocabulary `tagVocabulary` read off the published config. */
export function tagSource(vocabulary: readonly string[], policy?: RankPolicy): CompletionSource {
  return (text, caret) => {
    const query = tagQueryAt(text, caret);
    if (query === null) return null;
    const items = matchingTags(vocabulary, query, 8, policy).map((tag) => ({ label: tag, insert: tag }));
    return { start: query.start, end: query.end, items };
  };
}

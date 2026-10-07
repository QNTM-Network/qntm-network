/**
 * Tag completion — WHICH TAGS EXIST, AND WHICH ONES THE CARET IS ASKING FOR (2026-10-07,
 * operator-directed: "a tag picker built from my vocabulary").
 *
 * PURE. No DOM, no clock, no fetch. The DOM half — the list under the input, the keys that drive
 * it — is `app/shell/tagpicker.ts`, which calls these two functions and nothing else.
 *
 * THE VOCABULARY IS THE OPERATOR'S CONFIG, NEVER A LIST TYPED HERE. Two published sources are
 * read and merged:
 *   - `qualification.tokens` — every token that sets a field (`#task`, `#work`, `#daily`, …),
 *     published from the engine's `vocabulary/*.yaml`;
 *   - `resolution.tagOrder.canonicalOrder` — the engine's own render order for tags, which also
 *     carries the edge tags (`#waiting-for`, …) that set no field.
 * A tag that appears in neither is not offered; adding one to the config offers it with no change
 * here.
 */

/** The two declaration axes this reads — structurally, so any object of that shape will do. */
export interface TagSources {
  readonly qualification?: { readonly tokens?: Readonly<Record<string, Readonly<Record<string, unknown>>>> } | undefined;
  readonly resolution?: { readonly tagOrder?: { readonly canonicalOrder?: readonly unknown[] } } | undefined;
}

/** Every `#tag` the config declares, de-duplicated, in a stable order (canonical order first). */
export function tagVocabulary(sources: TagSources): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (token: unknown): void => {
    if (typeof token !== "string" || !/^#[^\s#]+$/.test(token) || seen.has(token)) return;
    seen.add(token);
    out.push(token);
  };
  for (const token of sources.resolution?.tagOrder?.canonicalOrder ?? []) add(token);
  const fields = sources.qualification?.tokens ?? {};
  for (const field of Object.keys(fields).sort()) {
    for (const token of Object.keys(fields[field] ?? {}).sort()) add(token);
  }
  return out;
}

/** What the caret is asking for, or `null` when it is not inside a `#word`. */
export interface TagQuery {
  /** Index of the `#` in the text. */
  readonly start: number;
  /** Index just past the word the caret is in. Replacing `[start, end)` inserts the chosen tag. */
  readonly end: number;
  /** What has been typed after the `#`, lower-cased. */
  readonly prefix: string;
}

/**
 * The `#word` the caret sits in or at the end of. A `#` must start the text or follow whitespace,
 * so a `#` inside a word or a URL fragment never opens the picker.
 */
export function tagQueryAt(text: string, caret: number): TagQuery | null {
  if (caret < 0 || caret > text.length) return null;
  let start = caret;
  while (start > 0 && !/\s/.test(text[start - 1] ?? "")) start -= 1;
  if (text[start] !== "#") return null;
  let end = caret;
  while (end < text.length && !/\s/.test(text[end] ?? "")) end += 1;
  const typed = text.slice(start + 1, caret);
  if (typed.includes("#")) return null;
  return { start, end, prefix: typed.toLowerCase() };
}

/**
 * The tags matching a query: those whose name starts with the prefix first, then those that
 * merely contain it, each group in vocabulary order. At most `limit`.
 */
export function matchingTags(vocabulary: readonly string[], query: TagQuery, limit = 8): readonly string[] {
  const starts: string[] = [];
  const contains: string[] = [];
  for (const tag of vocabulary) {
    const name = tag.slice(1).toLowerCase();
    if (name.startsWith(query.prefix)) starts.push(tag);
    else if (query.prefix !== "" && name.includes(query.prefix)) contains.push(tag);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** The text with the query's word replaced by `tag` and a trailing space, and the new caret. */
export function applyTag(text: string, query: TagQuery, tag: string): { readonly text: string; readonly caret: number } {
  const after = text.slice(query.end);
  const spacer = after.startsWith(" ") ? "" : " ";
  const next = text.slice(0, query.start) + tag + spacer + after;
  return { text: next, caret: query.start + tag.length + 1 };
}

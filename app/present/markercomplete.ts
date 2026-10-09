/**
 * Marker completion (2026-10-08, operator-directed: "a way to select those [emojis] as they can't
 * easily be entered").
 *
 * PURE. Type `:` at the start of a word, then part of a name — `:sched` — and the list offers the
 * config's own markers by name: `⏳ scheduled date`, `📌 active · lead state`. Taking one puts the
 * marker in the line; a date marker then opens the date list, because the date source sees
 * `<marker> ` before the caret.
 *
 * THE MARKERS ARE THE CONFIG'S. Every `qualification.extractionFields` token (📅 ⏳ 🛫 🆕 …) and
 * every `qualification.tokens` spelling that is not a tag or a checkbox (📌 ⏫ ⛔ …). A marker added
 * to the config is offered here with no change.
 */

import type { CompletionSource } from "./completion.js";
import { DEFAULT_RANK_POLICIES, rank, type RankPolicy } from "./rank.js";

export interface MarkerSources {
  readonly qualification?:
    | {
        readonly extractionFields?: Readonly<Record<string, { readonly token?: unknown }>>;
        readonly tokens?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
      }
    | undefined;
}

export interface Marker {
  readonly token: string;
  /** What the list shows beside the marker, and what a query matches against. */
  readonly name: string;
}

const words = (field: string): string => field.replace(/_/g, " ");

/** Every marker the config declares, value markers first by field, each token once. */
export function markerVocabulary(sources: MarkerSources): readonly Marker[] {
  const out: Marker[] = [];
  const seen = new Set<string>();
  const add = (token: string, name: string): void => {
    if (token === "" || seen.has(token)) return;
    seen.add(token);
    out.push({ token, name });
  };
  for (const [field, marker] of Object.entries(sources.qualification?.extractionFields ?? {})) {
    if (typeof marker?.token === "string") add(marker.token, words(field));
  }
  for (const [field, spellings] of Object.entries(sources.qualification?.tokens ?? {})) {
    for (const [token, value] of Object.entries(spellings ?? {})) {
      if (token.startsWith("#") || token.startsWith("[")) continue;
      add(token, `${words(String(value))} · ${words(field)}`);
    }
  }
  return out;
}

/** The `:query` the caret is at the end of, or `null`. The `:` must start a word. */
export function markerQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const match = /(^|\s):([a-z0-9_ ]{0,24})$/i.exec(text.slice(0, caret));
  if (match === null) return null;
  const query = match[2] ?? "";
  if (query.startsWith(" ")) return null;
  return { start: caret - query.length - 1, query: query.toLowerCase() };
}

/** The marker source, ranked by the `markers` policy (app/present/rank.ts). An empty query offers
 *  every marker; otherwise every word typed must start a word of the marker's name (`minMatch: 2`). */
export function markerSource(
  markers: readonly Marker[],
  policy: RankPolicy = DEFAULT_RANK_POLICIES.markers,
): CompletionSource {
  return (text, caret) => {
    const at = markerQueryAt(text, caret);
    if (at === null) return null;
    // `_` is a space here, as it is in the names.
    const items = rank(markers, (marker) => ({ title: marker.name }), at.query.replace(/_/g, " "), policy).map(
      (marker) => ({ label: `${marker.token}  ${marker.name}`, insert: marker.token }),
    );
    return { start: at.start, end: caret, items };
  };
}

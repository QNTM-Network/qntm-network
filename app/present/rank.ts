/**
 * Rank a list — ONE RANKING FOR EVERY LIST THE APP OFFERS (2026-10-09, backlog row
 * one-ranking-for-every-list; operator-asked: "a general … configurable … well architected and
 * modular solution" for `/` search, `[[` suggestions and every other list).
 *
 * PURE. A list hands over its items and says, for each, what it is (`describe`); this module
 * decides which items match the query and in what order. Five lists used to decide that five ways,
 * each inside itself: `/` search, `[[` suggestions, the Views filter, `#` tags and `:` markers. Each
 * now keeps only what is truly its own — what triggers it and what its items are — and calls this.
 *
 * ── ONE MATCH RULE ──
 *
 * Every word of the query must appear, in any order. HOW WELL it matches is a number, `match`, and
 * that number is a sort key like any other:
 *   3  the title starts with the whole query
 *   2  every word starts a word of the title
 *   1  every word is somewhere in the title
 *   0  every word is somewhere in the title or the item's other text (a folder, a tag)
 * An item below the policy's `minMatch` is not in the list at all.
 *
 * ── ONE COMPARATOR ──
 *
 * The order is a declared list of keys, compared by `compareByKeys` (arrange/keys.ts) — the same
 * comparator the section ordering uses. A key names a FIELD and either a `direction` or an `order`
 * (a declared order of values, with `*` for every value not named). Which fields exist is code —
 * each one reads a different fact about an item — and which keys, in what order and direction, is
 * the policy's. The policies below are the built-in ones; backlog row
 * list-ordering-declared-in-global-defaults moves them into config.
 *
 * WHAT IT DOES NOT DO: fuzzy matching, hiding an item the query matches (a demoted item sorts last,
 * it is still listed), or any ordering inside a view — that is the engine's.
 */

import { compareByKeys, type SortValue } from "./arrange/keys.js";

/** What one item is, as far as ranking is concerned. Every field but `title` is optional. */
export interface RankItem {
  /** What the item is called — the text the match is judged against first. */
  readonly title: string;
  /** Other text the query may match (a folder, the rest of the line). Matched at quality 0 only. */
  readonly also?: string | undefined;
  /** `view`, `section`, `task`, … — ordered by the policy's `kind` key. */
  readonly kind?: string | undefined;
  /** A task's checkbox status (`open`, `done`, …), `""` or absent when it has none. */
  readonly status?: string | undefined;
  /** The file the item lives in, matched against the policy's `demote` globs. */
  readonly path?: string | undefined;
}

/** One sort key. `order` and `direction` are alternatives; `order` wins when both are given. */
export interface RankKey {
  readonly field: string;
  readonly direction?: "asc" | "desc" | undefined;
  readonly order?: readonly string[] | undefined;
}

export interface RankPolicy {
  readonly keys: readonly RankKey[];
  /** The lowest match quality listed at all (default 0). */
  readonly minMatch?: number | undefined;
  /** View paths whose items sort last (`*` matches anything, e.g. `*\/everything*`). */
  readonly demote?: readonly string[] | undefined;
}

/** The lists the app has. scripts/compile-client.mjs `LIST_NAMES` restates this list. */
export const LIST_NAMES = ["search", "link", "views", "tags", "markers"] as const;
export type ListName = (typeof LIST_NAMES)[number];

/** The fields a key may name — what `fieldValue` below reads. scripts/compile-client.mjs
 *  `RANK_FIELDS` restates this list; tests/client-settings.test.mjs holds the two equal. */
export const RANK_FIELDS = ["kind", "match", "status", "demoted", "title", "position"] as const;

/** The declared policies, by list — the declaration's `client.lists`. A list not named keeps its
 *  built-in policy. */
export type ListPolicies = Partial<Readonly<Record<ListName, RankPolicy>>>;

/** The key the compiled declaration publishes client settings under (scripts/compile-client.mjs). */
export const CLIENT_KEY = "client";

/** Open work before finished work; a status not named here sits at `*`. */
const STATUS_ORDER = ["open", "in_progress", "*", "scheduled", "waiting", "done", "cancelled"];

/**
 * THE BUILT-IN POLICIES — today's order for each list, plus open tasks before done ones.
 * `position` is the order the list handed its items over in, so it is every list's last word.
 */
export const DEFAULT_RANK_POLICIES: Readonly<Record<ListName, RankPolicy>> = {
  search: {
    keys: [
      { field: "kind", order: ["view", "section", "task"] },
      { field: "demoted", direction: "asc" },
      { field: "status", order: STATUS_ORDER },
      { field: "match", direction: "desc" },
      { field: "position" },
    ],
  },
  link: {
    minMatch: 1,
    keys: [
      { field: "demoted", direction: "asc" },
      { field: "status", order: STATUS_ORDER },
      { field: "match", direction: "desc" },
      { field: "position" },
    ],
  },
  views: { keys: [{ field: "match", direction: "desc" }, { field: "title" }] },
  tags: { minMatch: 1, keys: [{ field: "match", direction: "desc" }, { field: "position" }] },
  markers: { minMatch: 2, keys: [{ field: "match", direction: "desc" }, { field: "position" }] },
};

/** The words of `query`, lower case. */
export function queryWords(query: string): readonly string[] {
  return query.toLowerCase().split(/\s+/).filter((w) => w !== "");
}

/** How well `item` matches `query` (3 best … 0), or `null` when it does not match. */
export function matchQuality(item: RankItem, query: string): number | null {
  const words = queryWords(query);
  if (words.length === 0) return 3;
  const title = item.title.toLowerCase();
  if (title.startsWith(query.trim().toLowerCase())) return 3;
  const titleWords = title.split(/[\s·/_\-#]+/).filter((w) => w !== "");
  if (words.every((w) => titleWords.some((t) => t.startsWith(w)))) return 2;
  if (words.every((w) => title.includes(w))) return 1;
  const all = `${title} ${String(item.also ?? "").toLowerCase()}`;
  if (words.every((w) => all.includes(w))) return 0;
  return null;
}

/** `*` in `glob` matches any run of characters; nothing else is special. */
function globMatches(glob: string, text: string): boolean {
  const pattern = glob.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${pattern}$`, "i").test(text);
}

const PRESENT = (value: string | number): SortValue => ({ tier: 0, value });
const ABSENT: SortValue = { tier: 1, value: 0 };

/** A value's place in a declared `order`; `*` stands for every value not named. */
function orderValue(order: readonly string[], value: string | undefined): SortValue {
  if (value === undefined || value === "") return ABSENT;
  const at = order.indexOf(value);
  if (at !== -1) return PRESENT(at);
  const wild = order.indexOf("*");
  return wild !== -1 ? PRESENT(wild) : ABSENT;
}

interface Scored<T> {
  readonly value: T;
  readonly item: RankItem;
  readonly match: number;
  readonly position: number;
}

/**
 * THE FIELDS — what each key can read. A field not here is ABSENT for every item, so a policy that
 * names one it should not changes nothing rather than failing.
 */
function fieldValue(field: string, key: RankKey, s: Scored<unknown>, policy: RankPolicy): SortValue {
  switch (field) {
    case "match":
      return PRESENT(s.match);
    case "position":
      return PRESENT(s.position);
    case "title":
      return PRESENT(s.item.title.toLowerCase());
    case "kind":
      return key.order !== undefined ? orderValue(key.order, s.item.kind) : s.item.kind ? PRESENT(s.item.kind) : ABSENT;
    case "status":
      return key.order !== undefined ? orderValue(key.order, s.item.status) : s.item.status ? PRESENT(s.item.status) : ABSENT;
    case "demoted": {
      const path = s.item.path ?? "";
      return PRESENT((policy.demote ?? []).some((glob) => globMatches(glob, path)) ? 1 : 0);
    }
    default:
      return ABSENT;
  }
}

/** The items that match `query`, best first, under `policy`. */
export function rank<T>(
  items: readonly T[],
  describe: (item: T) => RankItem,
  query: string,
  policy: RankPolicy,
): T[] {
  const minMatch = policy.minMatch ?? 0;
  const scored: Scored<T>[] = [];
  items.forEach((value, position) => {
    const item = describe(value);
    const match = matchQuality(item, query);
    if (match === null || match < minMatch) return;
    scored.push({ value, item, match, position });
  });
  // `asc` for a key with an `order`: its values are already positions in that order.
  const keys = policy.keys.map((key) => (key.order !== undefined ? { direction: "asc" as const } : key));
  const tuple = (s: Scored<T>): SortValue[] => policy.keys.map((key) => fieldValue(key.field, key, s, policy));
  const tuples = new Map(scored.map((s) => [s, tuple(s)] as const));
  return scored
    .sort((a, b) => compareByKeys(tuples.get(a) ?? [], tuples.get(b) ?? [], keys))
    .map((s) => s.value);
}

/** The policy a list ranks by: the declared one (config/client.yaml) when there is one, else its
 *  built-in policy. */
export function policyFor(list: ListName, declared: ListPolicies | undefined): RankPolicy {
  return declared?.[list] ?? DEFAULT_RANK_POLICIES[list];
}

/**
 * Read the declaration's `client` key. The client compile (scripts/compile-client.mjs) is the
 * validity owner and refuses a bad config before it is published; this reader only checks the
 * SHAPE it was handed, and drops (with a problem) anything it cannot use, so a list falls back to
 * its built-in order rather than ranking by half a policy.
 */
export function readClientDeclaration(document: unknown): { lists: ListPolicies; problems: string[] } {
  const problems: string[] = [];
  const lists: Partial<Record<ListName, RankPolicy>> = {};
  const client = (document as Record<string, unknown> | null)?.[CLIENT_KEY];
  if (client === undefined) return { lists, problems };
  const declared = (client as { lists?: unknown } | null)?.lists;
  if (declared === null || typeof declared !== "object" || Array.isArray(declared)) {
    problems.push(`'${CLIENT_KEY}.lists' is not an object — every list keeps its built-in order`);
    return { lists, problems };
  }
  for (const [name, value] of Object.entries(declared as Record<string, unknown>)) {
    if (!(LIST_NAMES as readonly string[]).includes(name)) {
      problems.push(`'${CLIENT_KEY}.lists.${name}' is not a list this app has — ignored`);
      continue;
    }
    const keys = (value as { keys?: unknown } | null)?.keys;
    const usable =
      Array.isArray(keys) &&
      keys.length > 0 &&
      keys.every(
        (k) =>
          k !== null &&
          typeof k === "object" &&
          (RANK_FIELDS as readonly string[]).includes((k as RankKey).field) &&
          ((k as RankKey).order === undefined || Array.isArray((k as RankKey).order)),
      );
    if (!usable) {
      problems.push(`'${CLIENT_KEY}.lists.${name}' has no usable keys — it keeps its built-in order`);
      continue;
    }
    lists[name as ListName] = value as RankPolicy;
  }
  return { lists, problems };
}

/**
 * RECENTLY USED (2026-10-10, backlog row recently-used-recorded-on-the-server; operator-asked: a
 * blank `/` that offers "switch back to prev file", shared on the server so the Mac and the phone
 * agree).
 *
 * A recent item is a KEY: `view:<view id>` for a view that was opened, `task:<qntm id>` for a task
 * that was jumped to or edited. The list is newest first. The server keeps it per user
 * (worker `GET`/`POST /app/recent`); this module only says what a key is and how a use changes the
 * list, so every client keeps it the same way. Ranking reads it as the `recent` field
 * (app/present/rank.ts).
 */

import { stampSpans } from "./express/rendition.js";

/** How many recent items are kept. */
export const RECENT_LIMIT = 50;

export const viewKey = (viewId: string): string => `view:${viewId}`;
export const taskKey = (qntmId: string): string => `task:${qntmId}`;

/** The recent key for a stamped line — its first `[[qntm:N]]` — or null for an unstamped line. */
export function lineKey(line: string): string | null {
  const stamp = stampSpans(line)[0];
  return stamp === undefined ? null : taskKey(stamp.id);
}

/** The list after `key` was used: it moves to the front, once, and the list keeps its limit. */
export function noteUse(list: readonly string[], key: string): string[] {
  return [key, ...list.filter((k) => k !== key)].slice(0, RECENT_LIMIT);
}

/** Each key's place in the list (0 the most recent) — what the `recent` field reads. */
export function recentIndex(list: readonly string[]): ReadonlyMap<string, number> {
  return new Map(list.map((key, index) => [key, index] as const));
}

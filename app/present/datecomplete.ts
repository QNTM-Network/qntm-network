/**
 * Date completion (2026-10-07, operator-directed: "date pickers").
 *
 * PURE, and it holds no clock: the page passes today's LOGICAL date (from the declared day
 * boundary) and the declared week start. The date MARKERS are the config's own — every
 * `qualification.extractionFields` entry of kind `date` (📅 due, ⏳ scheduled, 🛫 available, …) —
 * so a marker added to the config is offered here with no change.
 *
 * Typing a marker and a space opens the list: Today, Tomorrow, the next start of the week, in a
 * week, in two weeks, in a month. Digits typed after the marker narrow it to dates that start
 * with them.
 */

import type { CompletionSource } from "./completion.js";

export interface DateSources {
  readonly qualification?:
    | { readonly extractionFields?: Readonly<Record<string, { readonly token?: unknown; readonly kind?: unknown }>> }
    | undefined;
}

/** The config's date markers, except the two the engine stamps itself (created, completed). */
export function dateMarkers(sources: DateSources): readonly string[] {
  const out: string[] = [];
  for (const [field, marker] of Object.entries(sources.qualification?.extractionFields ?? {})) {
    if (field === "created_at" || field === "completed_at") continue;
    if (marker?.kind === "date" && typeof marker.token === "string" && marker.token !== "") out.push(marker.token);
  }
  return out;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** `YYYY-MM-DD` plus `days`, computed on the calendar (UTC arithmetic, no clock, no timezone). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const at = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) + days * 86_400_000);
  return at.toISOString().slice(0, 10);
}

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d ?? 1, last));
  return target.toISOString().slice(0, 10);
}

/** The labelled choices for `today`, in order. */
export function dateChoices(today: string, weekStartsOn: string): readonly { label: string; date: string }[] {
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  const startIndex = Math.max(0, WEEKDAYS.indexOf(weekStartsOn.toLowerCase()));
  const toWeekStart = ((startIndex - weekday + 7) % 7) || 7;
  const startName = (WEEKDAYS[startIndex] ?? "monday").replace(/^./, (c) => c.toUpperCase());
  return [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: `Next ${startName}`, date: addDays(today, toWeekStart) },
    { label: "In a week", date: addDays(today, 7) },
    { label: "In 2 weeks", date: addDays(today, 14) },
    { label: "In a month", date: addMonths(today, 1) },
  ];
}

/**
 * The date source. Fires when the caret sits after `<marker> ` with nothing or only date-ish
 * characters (`0-9`, `-`) typed since; `today` is read when it fires, so `undefined` (an abstaining
 * clock) offers nothing rather than a guessed date.
 */
export function dateSource(
  markers: readonly string[],
  today: () => string | undefined,
  weekStartsOn: string,
): CompletionSource {
  return (text, caret) => {
    const before = text.slice(0, caret);
    for (const marker of markers) {
      const at = before.lastIndexOf(marker);
      if (at === -1) continue;
      const tail = before.slice(at + marker.length);
      const typed = /^ ([0-9-]*)$/.exec(tail);
      if (typed === null) continue;
      const day = today();
      if (day === undefined) return null;
      const start = at + marker.length + 1;
      let end = caret;
      while (end < text.length && /[0-9-]/.test(text[end] ?? "")) end += 1;
      const prefix = typed[1] ?? "";
      const items = dateChoices(day, weekStartsOn)
        .filter((choice) => choice.date.startsWith(prefix))
        .map((choice) => ({ label: `${choice.label} · ${choice.date}`, insert: choice.date }));
      return { start, end, items };
    }
    return null;
  };
}

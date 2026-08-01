/**
 * today — the ONE declared day boundary, resolved the way the engine resolves it.
 *
 * design-the-resolution-architecture.md step 8, L2 + L5. PURE: no DOM, no fetch, no storage. It
 * does read a clock — that is this module's whole reason to exist — but it never reads one
 * itself: every function here takes the instant as a parameter, so the one place `Date.now()` is
 * ever legitimate stays at the call site, structurally distant from this file, the same posture
 * `membershipNoteFor`/`orderingNoteFor` keep the DOM at.
 *
 * ── THE CRUX: WHICH CLOCK, AND WHAT HAPPENS WHEN THE BROWSER'S DISAGREES ──
 *
 * The engine's cycle stamps `cycle_today` from `datetime.now(timezone.utc)` — the machine's own
 * system clock, at the instant the cycle runs (`orchestrator.py:5424,5432-5436`). That instant is
 * a point in absolute (UTC) time, not "the server's timezone" — the server has none that matters
 * here. It is then reinterpreted through ONE DECLARED IANA zone (`day_boundary.yaml`'s
 * `timezone`, `Europe/London` today) and rolled over at ONE DECLARED HOUR (`day_start_hour`, 4).
 * **The browser is measuring the SAME absolute instant** — `Date.now()` is also a UTC epoch
 * count, not "whatever timezone the device's clock is set to display" — so as long as this module
 * converts that instant through the SAME declared zone (read from the published config, never
 * hardcoded) rather than the device's OWN default timezone, the two answers are the same
 * computation over the same instant, not two approximations of "today" from two different
 * vantage points. A browser that instead read `new Date().getHours()` (the device's LOCAL zone —
 * `America/New_York` if the operator is travelling) would diverge from the engine EVERY DAY, not
 * only near the boundary; this module never does that, and `tests/present-today.test.mjs`'s
 * "wrong-timezone" case proves the divergence a device-local implementation would have produced.
 *
 * **The one thing this module cannot fix, and does not pretend to**: if the DEVICE'S SYSTEM CLOCK
 * itself is wrong — unsynced, drifted, or hand-set — `Date.now()` returns an instant that is not
 * the real "now", and no local computation can detect that without a network round-trip this
 * layer does not make (no POST, no live server — see this repo's own read-only posture). The
 * residual risk is therefore narrow and named: a browser whose clock has drifted PAST the
 * boundary distance (typically the sub-second error of an NTP-synced host, but unbounded on a
 * host with NTP disabled or the time hand-set) will compute a logical day the engine's next real
 * cycle disagrees with, for exactly the drifted duration. This module refuses to guess its way
 * around that — it has no guess to make, only the instant it was handed — and no caller in this
 * PR treats its answer as authoritative over a graph state; it is text, not a `Contribution`.
 *
 * ── THE ALGORITHM, MIRRORED FIELD FOR FIELD FROM THE ENGINE'S OWN TWO FUNCTIONS ──
 *
 * `apps/qntm-md/src/qntm_md/substrate_wiring/day_boundary.py`'s `resolve_logical_day`: convert
 * the UTC instant to WALL-CLOCK components in the declared zone, then the logical date is that
 * wall-clock date UNLESS the wall-clock hour is before `day_start_hour`, in which case it is the
 * PREVIOUS calendar date (the "04:00 -> 04:00" day, so 03:59 belongs to yesterday and 04:01 to
 * today — the design document's own falsifier, verbatim). `resolve_week_end`: the last day of the
 * week containing that logical date, under `week_starts_on`'s convention (`monday` => the week
 * ends Sunday) — DERIVED FROM THE LOGICAL DATE LABEL, so the day-start-hour boundary is already
 * folded in before the week arithmetic ever runs, exactly as the engine's own docstring states.
 *
 * The zone conversion itself uses `Intl.DateTimeFormat` with an explicit `timeZone`, the
 * browser's own IANA tz-database reader — the same database `zoneinfo` reads on the engine side,
 * not a second, hand-rolled offset table. `tests/present-today.test.mjs`'s agreement suite is
 * generated FROM the engine's own two functions (`scripts/day-boundary-agreement.py`), never
 * transcribed, and it is the proof that the two databases agree in practice, not merely in name.
 *
 * ── WHAT THIS MODULE REFUSES ──
 *
 * `unresolvable-timezone` — the declared `timezone` string is not one `Intl.DateTimeFormat`
 * recognises (a typo, or a config that has stopped validating). `unknown-week-start` — the
 * declared `weekStartsOn` is not one of the seven weekday names, mirroring the engine's own
 * `resolve_week_end`, which raises `ValueError` for the same input rather than guessing a
 * convention. Both are REFUSALS, not thrown exceptions — a caller under a live cursor must never
 * crash because a config value it does not control turned out to be malformed.
 *
 * ── WHO READS THIS TODAY, AND WHO DOES NOT ──
 *
 * Nobody, yet, and that is stated rather than hidden. `resolution.dayBoundary` was already
 * PUBLISHED by step 5; this module is the READ half step 8 asks for ("publish and read... and
 * route every date decision through one function"). Two candidate consumers were measured, in
 * this step, and both were refuted as real dependencies today:
 *
 *   ORDERING (`ordering.ts`, step 7) does not need it — already measured and shipped: none of the
 *   9 declared orderings compares a field to the clock, only to another field's value.
 *
 *   MEMBERSHIP's 8 clock-bound qualifications (`$cycle_today`/`$cycle_week_end` compared against
 *   a date field) do NOT become answerable by this module alone. `scripts/generate-qualification-
 *   declaration.mjs`'s own `normalisePredicate` refuses BOTH a `$`-prefixed value AND any
 *   multi-key predicate (a `{gte:…, lte:…}` range is two keys) UNCONDITIONALLY, for every
 *   qualification in the config, clock-bound or not — the refusal is about the PREDICATE
 *   GRAMMAR having no orderable-comparison or variable-substitution vocabulary at all, not about
 *   which value to substitute for "today". Even with this module in hand, answering those 8 needs
 *   the generator to learn `gte`/`lte`/`gt`/`lt` and `$cycle_today`/`$cycle_week_end`
 *   substitution, and `membership.ts`'s `FieldPredicate` (`{eq}`/`{not}` only, `qualification.ts`)
 *   to learn to evaluate them — a widening of the QUALIFICATION LANGUAGE, a different and larger
 *   unit of work than "read the boundary", filed separately
 *   (`widen-qualification-language-for-clock-bound-predicates`, backlog.yaml) rather than
 *   invented here to manufacture a consumer for this step.
 */

import type { DayBoundary } from "./resolutiontable.js";

/** Why nothing is said. Each value names a refusal in this module's header. */
export type TodayAbstention = "unresolvable-timezone" | "unknown-week-start";

/** The answer, when there is one. Both fields are `YYYY-MM-DD`, the engine's own date label shape. */
export interface TodayAnswer {
  /** The logical day `nowUtcMs` falls in, per the declared boundary — `cycle_today`'s mirror. */
  readonly logicalDate: string;
  /** The last day of the logical week `logicalDate` sits in — `cycle_week_end`'s mirror. */
  readonly weekEnd: string;
}

/** Either an answer, or the reason there is none. Never a default, never a guess. */
export type TodayReading =
  | { readonly kind: "answer"; readonly answer: TodayAnswer }
  | { readonly kind: "abstains"; readonly because: TodayAbstention };

const abstains = (because: TodayAbstention): TodayReading => ({ kind: "abstains", because });

const WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** `Date.UTC(y, m-1, d)`'s inverse-friendly formatter — always the CALENDAR date, never a time. */
const isoDate = (utcMs: number): string => {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

/**
 * `nowUtcMs`'s wall-clock year/month/day/hour IN `timezone` — `Intl`'s own IANA tz-database read,
 * the browser-side equivalent of `datetime.astimezone(ZoneInfo(...))`. Returns `undefined` rather
 * than throwing when `timezone` is not a zone `Intl` recognises, so a malformed config value
 * refuses instead of crashing a caller mid-edit.
 */
function localPartsInZone(
  nowUtcMs: number,
  timezone: string,
): { year: number; month: number; day: number; hour: number } | undefined {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return undefined;
  }
  const parts = formatter.formatToParts(new Date(nowUtcMs));
  const get = (type: string): string | undefined => parts.find((p) => p.type === type)?.value;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  // A midnight edge some ICU builds spell "24" under h23 for the following day's 00 — normalise
  // it the same way the spec's own h23 definition intends (24 -> 0 of the SAME wall-clock date
  // the other fields already named), rather than let it silently become an off-by-one refusal.
  const rawHour = Number(get("hour"));
  const hour = rawHour === 24 ? 0 : rawHour;
  if (![year, month, day, hour].every(Number.isFinite)) return undefined;
  return { year, month, day, hour };
}

/**
 * The logical date `nowUtcMs` falls in, per `boundary` — `resolve_logical_day`'s date label,
 * mirrored exactly: the wall-clock date in `boundary.timezone`, rolled back one calendar day when
 * the wall-clock hour is before `boundary.dayStartHour` (03:59 is yesterday; 04:01 is today).
 */
export function resolveLogicalDate(nowUtcMs: number, boundary: DayBoundary): string | undefined {
  const parts = localPartsInZone(nowUtcMs, boundary.timezone);
  if (parts === undefined) return undefined;
  const asUtcMidnight = Date.UTC(parts.year, parts.month - 1, parts.day);
  const rolled = parts.hour >= boundary.dayStartHour ? asUtcMidnight : asUtcMidnight - 86_400_000;
  return isoDate(rolled);
}

/**
 * The last day of the logical week containing `logicalDate` — `resolve_week_end`'s mirror,
 * arithmetic only (the day-start-hour boundary is already folded into `logicalDate`'s own label,
 * exactly as the engine's docstring states). `undefined` when `weekStartsOn` names no weekday.
 */
export function resolveWeekEnd(logicalDate: string, weekStartsOn: string): string | undefined {
  const startIndex = WEEKDAY_NAMES.indexOf(
    weekStartsOn.trim().toLowerCase() as (typeof WEEKDAY_NAMES)[number],
  );
  if (startIndex === -1) return undefined;
  const [y, m, d] = logicalDate.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) return undefined;
  const asUtcMidnight = Date.UTC(y, m - 1, d);
  // JS `getUTCDay()`: Sunday=0..Saturday=6. Python `date.weekday()`: Monday=0..Sunday=6. Convert
  // once, here, rather than let the two conventions leak into the arithmetic below.
  const jsWeekday = new Date(asUtcMidnight).getUTCDay();
  const pyWeekday = (jsWeekday + 6) % 7;
  const daysSinceWeekStart = ((pyWeekday - startIndex) % 7 + 7) % 7;
  const weekEndMs = asUtcMidnight + (6 - daysSinceWeekStart) * 86_400_000;
  return isoDate(weekEndMs);
}

/**
 * The whole answer for `nowUtcMs` under `boundary` — the ONE function every date decision under
 * `app/` must route through, per this step's own charter. Refuses rather than guesses when either
 * half of `boundary` cannot be resolved.
 */
export function todayFor(nowUtcMs: number, boundary: DayBoundary): TodayReading {
  const logicalDate = resolveLogicalDate(nowUtcMs, boundary);
  if (logicalDate === undefined) return abstains("unresolvable-timezone");
  const weekEnd = resolveWeekEnd(logicalDate, boundary.weekStartsOn);
  if (weekEnd === undefined) return abstains("unknown-week-start");
  return { kind: "answer", answer: { logicalDate, weekEnd } };
}

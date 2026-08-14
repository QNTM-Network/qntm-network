/**
 * THE DROP LEDGERS LIVE BESIDE THE DECLARATION, NOT INSIDE IT.
 *
 * ── WHAT THIS MOVES, AND WHY IT IS NOT A DELETION ──
 *
 * Each of the four generators records, for every declaration it could not publish, WHY. Those four
 * `dropped` maps were written into `presentation.json` itself — 38 KB of the 160 KB the browser
 * downloads on every load, 24% of the payload, for a value the app never reads. Measured
 * 2026-08-14: `resolution.dropped` 23,249 B, `rules.dropped` 12,460 B, `qualification.dropped`
 * 2,665 B, `structural.dropped` 2 B.
 *
 * IT WAS NEARLY DELETED ON THE STRENGTH OF "NOTHING READS IT", AND THAT WAS WRONG. Nothing in
 * `app/` reads it. THE GENERATORS DO — each one's `--check` diffs the freshly compiled drops
 * against the ones in the committed file to report `NEWLY DROPPED` and `NO LONGER DROPPED`. The
 * served payload was the previous-state baseline for that delta.
 *
 * AND THE FAILURE MODE OF DELETING IT WAS THE QUIET KIND. Every reader spelled it
 * `current.<key>?.dropped ?? {}`, so removing the key would not have thrown — `before` becomes
 * empty and EVERY drop reports as newly dropped, on every check, forever. Uniformly wrong rather
 * than loudly broken.
 *
 * ── THE RULE THIS COST US, WORTH MORE THAN THE BYTES ──
 *
 * A ROUND-TRIP BASELINE HAS NO CONSUMER THAT LOOKS LIKE A CONSUMER. Nothing USES the ledger; the
 * writer COMPARES AGAINST it. Any check for "is this dead" that asks "who reads this to do
 * something" will answer dead — correctly by its own question, wrongly about the world. So before
 * calling a published value unread, grep the PRODUCERS too.
 *
 * ── WHY A SIBLING FILE RATHER THAN A DIFFERENT KEY ──
 *
 * The baseline has to survive between runs, so it is COMMITTED. It has to stop being downloaded,
 * so it is not in the served declaration. A committed file the app never fetches satisfies both;
 * being servable is irrelevant, because the cost was always page weight rather than disk.
 *
 * ALL FOUR IN ONE FILE, deliberately. Leaving three behind means someone re-litigates this later
 * with a smaller number and a weaker case.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** Where the four ledgers live — beside `presentation.json`, never inside it. */
export function ledgerPathFor(presentationPath) {
  return presentationPath.replace(/presentation\.json$/, "presentation-dropped.json");
}

/**
 * The PREVIOUS drops for one declaration key — the baseline `--check` diffs against.
 *
 * `{}` when the file or the key is absent, which is the same answer the old
 * `current.<key>?.dropped ?? {}` gave and is correct on a first run. It is NOT correct as a
 * silent response to a file that went missing, and the caller cannot tell those apart — see
 * `ledgerIsPresent`, which exists so a generator can say so rather than report every drop as new.
 */
export function readLedger(presentationPath, key) {
  const path = ledgerPathFor(presentationPath);
  if (!existsSync(path)) return {};
  try {
    const all = JSON.parse(readFileSync(path, "utf8"));
    const held = all?.[key];
    return held && typeof held === "object" && !Array.isArray(held) ? held : {};
  } catch {
    return {};
  }
}

/** Whether a baseline exists at all — so "every drop is new" can be told from "the file is gone". */
export function ledgerIsPresent(presentationPath) {
  return existsSync(ledgerPathFor(presentationPath));
}

/**
 * Record one declaration's drops, leaving the other three untouched.
 *
 * READ-MERGE-WRITE rather than write-whole, because the four generators run INDEPENDENTLY — `npm
 * run generate:rules` must not erase `resolution`'s baseline on its way past. That is the same
 * reason each one writes only its own key into `presentation.json` today.
 */
export function writeLedger(presentationPath, key, dropped) {
  const path = ledgerPathFor(presentationPath);
  let all = {};
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) all = parsed;
    } catch {
      // A corrupt ledger is replaced rather than merged into — it is a derived baseline, and
      // preserving half of one would make the next delta report wrong in a way nobody could read.
    }
  }
  const next = {};
  for (const name of [...new Set([...Object.keys(all), key])].sort()) {
    next[name] = name === key ? dropped : all[name];
  }
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
  return path;
}

/**
 * One declaration's published shape — everything the compiler produced EXCEPT its ledger.
 *
 * The generators return `{...declaration, dropped}` and several callers rely on that whole shape;
 * this narrows it at the moment of WRITING rather than changing what `compile` hands back, so
 * `scripts/checkdeclarations.mjs` and the tests that read a compiled result are untouched.
 */
export function withoutLedger(declaration) {
  const { dropped: _dropped, ...served } = declaration;
  return served;
}

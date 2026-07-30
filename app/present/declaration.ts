/**
 * declaration — reading the GLOBAL level's served declaration. PURE: no DOM, no fetch.
 *
 * The GLOBAL level is the instance's default rendition per token family, and
 * design-presentation-cascade.md section 2.2 gives it a declaration home ("one app-config
 * declaration, served with the app") and a reader (`app/present/cascade`, through the context).
 * This module is the half of that pair that turns a served DOCUMENT into a CONTRIBUTION. It does
 * not fetch it and it does not know where it came from: the page hands it a parsed value and gets
 * back what the cascade can consume.
 *
 * ── WHY THIS STAGE EXISTS AT ALL, WHICH IS ALSO WHY THIS FILE IS SO CAREFUL ──
 *
 * "A declaration that exists and does not reach" is this system's highest-frequency bug — four
 * instances in one week, one of them a config category that loaded clean, exited 0 and was read
 * by nothing. So the whole of migration stage 2 is one declaration and a PROOF THAT THE READER IS
 * WIRED, and the falsifier is stated in the design rather than left to taste: flip one key to
 * `raw` in a fixture and the painted DOM must change. tests/present-global.test.mjs flips it in
 * the fixture AND through app.html's own script, and both assert the DOM.
 *
 * ── SILENCE IS LEGAL; A TYPO IS NOT SILENCE ──
 *
 * A key the document does not mention stays silent and falls through to the next level — that is
 * the cascade working as designed. But a key the document MISSPELLS, or a value it gets wrong, is
 * not silence: it is a declaration whose author believed it would reach. Those produce PROBLEMS,
 * which the caller surfaces. Ignoring an unknown key would reproduce, in the module written to
 * prevent it, exactly the bug this stage exists to prove against.
 *
 * The one exception is `note`, and it is deliberate: the served document should be able to
 * explain itself to whoever opens it, and JSON has no comments. It is declared here, in the
 * reader, so that it is a known key rather than a tolerated one.
 */

import { RESOLUTION_KEYS } from "./resolution.js";
import type { Contribution, Rendition } from "./resolution.js";

/** The one key of the served document that is prose for a human rather than a declaration. */
const NOTE = "note";

const RENDITIONS: readonly Rendition[] = ["raw", "wired"];

/**
 * What reading a declaration produced: what the cascade may use, and what was wrong with it.
 *
 * PROBLEMS ARE RETURNED, NOT THROWN. A malformed declaration must not take the app down — the
 * honest response is to fall back to silence for the key that could not be read and to say so
 * loudly. Throwing would make a typo in a served file indistinguishable from an outage.
 */
export interface DeclarationReading {
  readonly contribution: Contribution;
  readonly problems: readonly string[];
}

function isRendition(value: unknown): value is Rendition {
  return typeof value === "string" && (RENDITIONS as readonly string[]).includes(value);
}

/**
 * Read a served presentation declaration into the GLOBAL level's contribution.
 *
 * Accepts `unknown` on purpose. What arrives here is `JSON.parse` of a file on a web server —
 * the one input to this module that no type system upstream has ever checked — so the checking
 * happens once, here, rather than at each use site with a cast.
 */
export function readDeclaration(document: unknown): DeclarationReading {
  const problems: string[] = [];

  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return {
      contribution: {},
      problems: [
        `the declaration is ${Array.isArray(document) ? "an array" : typeof document}, not an ` +
          "object — every key stays silent and every line falls through to the default",
      ],
    };
  }

  const entries = Object.entries(document as Record<string, unknown>);
  const contribution: Record<string, Rendition> = {};

  for (const [key, value] of entries) {
    if (key === NOTE) {
      if (typeof value !== "string") {
        problems.push(`'${NOTE}' is ${typeof value}, not a string — it is prose, not a key`);
      }
      continue;
    }
    if (!(RESOLUTION_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `'${key}' is not a resolution key and was NOT applied — the keys are ` +
          `${RESOLUTION_KEYS.join(", ")}`,
      );
      continue;
    }
    if (!isRendition(value)) {
      problems.push(
        `'${key}' is ${JSON.stringify(value)}, which is not a rendition — it stays silent, so ` +
          `the key falls through to the default. The renditions are ${RENDITIONS.join(", ")}`,
      );
      continue;
    }
    contribution[key] = value;
  }

  return { contribution: contribution as Contribution, problems };
}

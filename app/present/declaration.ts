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
 *
 * ── TWO MORE KNOWN KEYS, ONE READ HERE AND ONE NOT ──
 *
 * `design-the-structural-language.md` §7 draws an axis line this file now has to respect: a
 * `Rendition` is an OUTPUT fact (how a token is shown) and `RESOLUTION_KEYS` is closed to exactly
 * that kind of fact. Two more top-level keys arrived alongside it and neither is a `Rendition`:
 *
 *   `indentUnit` — an output fact too (§3 of that design: "the unit governs how a level is
 *   WRITTEN, which is output"), but a number of spaces, not a `raw`/`wired` dial, so it cannot
 *   join `RESOLUTION_KEYS` without widening `Rendition` itself into something it structurally
 *   is not. It is read HERE, beside the axis it belongs to, into its own field on
 *   `DeclarationReading` — silence (the key absent) falls through to the same built-in default
 *   `indent.ts` always had; a present-but-malformed value is reported, never guessed.
 *
 *   `structural` — the INGEST axis (what a gesture MEANS), not this file's axis at all. It is
 *   SKIPPED here, silently and on purpose, so this reader does not misreport a key it does not
 *   own as unrecognised. `structural.ts`'s own `readStructuralDeclaration` is the one strict
 *   reader for it, called on the same document, and it is exactly as strict as this file is about
 *   its own keys — nothing about widening the grammar loosens either half of it.
 *
 * `qualification` (the MEMBERSHIP axis) and `resolution` (the CONFIG-ONLY RESOLUTION TABLE —
 * registration's two names, ordering, line grammars, the day boundary) are skipped the same way,
 * for the same reason, by `qualification.ts` and `resolutiontable.ts` respectively — one served
 * document, four strict readers, each owning one axis and none of the other three's keys.
 */

import { RESOLUTION_KEYS } from "./rendition.js";
import type { Contribution, Rendition } from "./rendition.js";
import { STRUCTURAL_KEY } from "./structural.js";
import { QUALIFICATION_KEY } from "./qualification.js";
import { RESOLUTION_TABLE_KEY } from "./resolutiontable.js";
import { INDENT_UNIT } from "./indent.js";

/** The one key of the served document that is prose for a human rather than a declaration. */
const NOTE = "note";

/**
 * The instance's indent unit, in spaces — how many leading spaces make one nesting level. Read
 * here (see the header) because it is a RENDITION fact, not a structural one: changing it changes
 * no edge (`content_diff.py`'s depth detection is unit-free), only whether a re-rendered line
 * visibly jumps. `apps/qntm_md/src/qntm_md/render/renderer.py:947-950` is where the engine's own
 * `4` lives today, unconditionally — there is no config key on the engine side yet for this
 * value to be generated FROM, so `presentation.json`'s `indentUnit` is a citation of that literal,
 * not a generated fact, until the engine side of this is built (design doc §3, ranked item #2).
 */
const INDENT_UNIT_KEY = "indentUnit";
/** The built-in floor for `indentUnit`: `indent.ts`'s own `INDENT_UNIT`, imported rather than
 * re-declared, so a missing or malformed declaration falls back to the SAME literal
 * `indentedLine` already used before this key existed — one number, not a second copy of it. */
export const DEFAULT_INDENT_UNIT = INDENT_UNIT;

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
  /** The instance's indent unit, in spaces. Always present — falls back to
   * `DEFAULT_INDENT_UNIT` when the key is absent or malformed, same as every other silent key. */
  readonly indentUnit: number;
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
      indentUnit: DEFAULT_INDENT_UNIT,
      problems: [
        `the declaration is ${Array.isArray(document) ? "an array" : typeof document}, not an ` +
          "object — every key stays silent and every line falls through to the default",
      ],
    };
  }

  const entries = Object.entries(document as Record<string, unknown>);
  const contribution: Record<string, Rendition> = {};
  let indentUnit = DEFAULT_INDENT_UNIT;

  for (const [key, value] of entries) {
    if (key === NOTE) {
      if (typeof value !== "string") {
        problems.push(`'${NOTE}' is ${typeof value}, not a string — it is prose, not a key`);
      }
      continue;
    }
    if (key === STRUCTURAL_KEY) {
      // Not this reader's axis — see the header. `structural.ts` reads and validates it.
      continue;
    }
    if (key === QUALIFICATION_KEY) {
      // Nor this one. `qualification.ts` reads and validates it — a third grammar over the same
      // document, on the MEMBERSHIP axis (which section a line belongs in), not the rendition one.
      continue;
    }
    if (key === RESOLUTION_TABLE_KEY) {
      // Nor this one. `resolutiontable.ts` reads and validates it — a fourth grammar over the
      // same document, on the CONFIG-ONLY RESOLUTION axis (registration/ordering/day boundary).
      continue;
    }
    if (key === INDENT_UNIT_KEY) {
      if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        problems.push(
          `'${INDENT_UNIT_KEY}' is ${JSON.stringify(value)}, which is not a positive whole ` +
            `number of spaces — the built-in default (${DEFAULT_INDENT_UNIT}) is used instead`,
        );
      } else {
        indentUnit = value;
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

  return { contribution: contribution as Contribution, indentUnit, problems };
}

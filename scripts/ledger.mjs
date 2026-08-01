/**
 * ledger — the one place a generator records a declaration it did NOT publish.
 *
 * ── THE DEFECT THIS EXISTS TO REMOVE ──
 *
 * `docs/implementation-artifacts/design-the-rule-mirror.md` §8.4 states the operator's own
 * acceptance test as three outcomes for a config entry the browser cannot express:
 *
 *   picks it up          generalised
 *   refuses it visibly   honest and incomplete — acceptable, and it must SAY SO
 *   silently ignores it  the dangerous one
 *
 * All three generators shipped the third row. `generate-qualification-declaration.mjs:396` (as it
 * then was) skipped a vocabulary token setting any field outside `node_type`/`domain`/`status`
 * with no record, no warning and no exit code — measured against the operator's live config on
 * 2026-08-01, that one line dropped 73 of his tokens. Fifteen other `continue` statements across
 * the three generators had the same shape: a declaration the operator wrote, read, understood well
 * enough to reject, and then discarded with nothing written down.
 *
 * ── WHAT A DROP DOES NOW, AND WHY EACH PART ──
 *
 *   1. IT IS RECORDED, in the generated declaration's own `dropped` map, `what -> why`. The
 *      declaration therefore states what it does not contain. This is the same posture
 *      `qualification.refused` already took for a pattern that would not normalise; this extends
 *      it to every other way a declaration can fail to reach the browser.
 *   2. IT IS PRINTED, to stderr, on every generate. The human running the script is told, in the
 *      same run, without opening the JSON.
 *   3. IT IS COMMITTED, because `presentation.json` is committed — so a NEW drop is a diff a
 *      reviewer sees, and `--check` (which compares the whole generated object, `dropped`
 *      included) exits 1 until the operator regenerates and commits it.
 *
 * ── WHAT A DROP DELIBERATELY DOES NOT DO: FAIL THE GENERATE ──
 *
 * A generator that refuses to run because the operator wrote a config it cannot express is a
 * generator that gets `--force`d, and a `--force` in a habit is the same silence with extra steps.
 * So `generate` always exits 0 and always writes. The GATE is staleness, not the refusal: a
 * deliberate config change flows through as a reviewed diff naming exactly what was dropped; an
 * accidental one turns `--check` red. Refusing is data; only DISAGREEING with the committed data
 * is an error.
 *
 * ── ONE ENTRY PER THING, NOT ONE PER SITE ──
 *
 * `what` names the operator's own artefact (`vocabulary token '#p1'`, `section 'inbox.tasks'`),
 * never the generator's internals, because the record is for the person who wrote the config. Two
 * drops of the same `what` join their reasons rather than one overwriting the other — a thing
 * dropped for two reasons is a thing that must show both.
 */

export class Ledger {
  #entries = new Map();

  /**
   * Record that `what` — an operator-authored declaration — was not published, and why.
   *
   * @param {string} what the operator's own artefact, named the way he would name it
   * @param {string} why  the reason, in a sentence a human can act on
   */
  drop(what, why) {
    if (typeof what !== "string" || what === "") {
      throw new TypeError("a ledger entry must name what was dropped");
    }
    if (typeof why !== "string" || why === "") {
      throw new TypeError(`a ledger entry must give a reason (dropping ${what})`);
    }
    const already = this.#entries.get(what);
    // Joined, never overwritten: a declaration refused twice is refused for two reasons, and
    // keeping only the last one would make the record itself a smaller silence.
    this.#entries.set(what, already === undefined ? why : `${already}; ${why}`);
  }

  get size() {
    return this.#entries.size;
  }

  /**
   * The record, as a plain object with sorted keys — sorted because it is compared byte-for-byte
   * by `--check` and read by a human in a diff, and a map whose order follows directory-walk order
   * would produce a spurious diff every time a file is renamed.
   */
  toJSON() {
    const out = {};
    for (const key of [...this.#entries.keys()].sort()) out[key] = this.#entries.get(key);
    return out;
  }

  /**
   * The stderr report — part 2 of the three. Returns the lines rather than printing them, so a
   * test can assert the wording without capturing a stream.
   *
   * @param {string} declaration the declaration key this ledger belongs to
   * @returns {string[]}
   */
  report(declaration) {
    if (this.#entries.size === 0) {
      return [`${declaration}: nothing was dropped — every declaration read was published.`];
    }
    const lines = [
      `${declaration}: ${this.#entries.size} declaration(s) were READ AND NOT PUBLISHED.`,
      "  The app will say nothing about them. This is recorded, not an error — but if one of",
      "  these is a change you just made and expected to see, this is why you cannot.",
    ];
    const entries = this.toJSON();
    for (const [what, why] of Object.entries(entries)) lines.push(`  - ${what}: ${why}`);
    return lines;
  }
}

/**
 * Print a ledger's report to stderr. stderr, not stdout, because `generate` already prints its
 * success summary to stdout and a caller redirecting one should not lose the other.
 *
 * @param {string} declaration
 * @param {Ledger} ledger
 */
export function reportDropped(declaration, ledger) {
  for (const line of ledger.report(declaration)) console.error(line);
}

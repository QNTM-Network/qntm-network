/**
 * generate-operator-set — writes `app/present/membership.ts`'s and `scripts/qualification-
 * agreement.py`'s own copies of `RESOLVABLE_FIELDS` FROM the one in
 * `scripts/generate-qualification-declaration.mjs`, never by hand.
 *
 * ── THE DEFECT THIS EXISTS TO REMOVE ──
 *
 * `docs/architecture/operator-set.json`'s own `$comment` (§ "CORRECTIONS", point 2) found that
 * `RESOLVABLE_FIELDS` is not one list with no address — it was THREE independently hand-
 * synchronised lists, none importing from another:
 *
 *   scripts/generate-qualification-declaration.mjs:96   export const RESOLVABLE_FIELDS = ...
 *   app/present/membership.ts:69                        export const RESOLVABLE_FIELDS = ...
 *   scripts/qualification-agreement.py:62                TRIPLE_FIELDS = (...)
 *
 * The Python copy's own comment named the other two and said it was "kept in step with" them — the
 * practice stated in its own source. `tests/operator-set-agreement.test.mjs` proves the three agree
 * TODAY; it does not stop a fourth person from editing one of them tomorrow and shipping a green
 * commit two edits behind. This script removes the hand-sync itself, not just its symptom.
 *
 * ── WHY THE COMPILER'S COPY IS THE SOURCE, NOT `docs/architecture/operator-set.json` ──
 *
 * `operator-set.json` was built, by its own `$comment`, to OBSERVE the surfaces — "an ENUMERATION,
 * not a merge... read only by tests/operator-set-agreement.test.mjs, which probes each surface's
 * ACTUAL BEHAVIOUR." Making it the generation source would hand it a second job — defining the
 * value it currently only witnesses — and a document cannot cleanly do both without the corrections
 * block it already carries turning into a claim about its own output. `generate-qualification-
 * declaration.mjs`'s copy has no such conflict: `design-the-compiler-and-the-bands.md` §3.2 already
 * names it "the single closest thing to a real enumeration in the whole codebase," and the constant
 * is not decorative there — `normalisePattern` (:304) filters every predicate's referenced fields
 * through it, and `readTokens` (:441, :485) builds the token table keyed by it. It is the one copy
 * a change to the actual field set would have to touch for a reason other than staying in sync.
 *
 * ── WHAT STAYS FEDERATED ──
 *
 * `app/present/declaration.ts:32-54`'s own header states the served-declaration readers are
 * deliberately federated — "one served document, four strict readers, each owning one axis" — and
 * `operator-set.json`'s own `$comment` makes the same argument for the two vocabularies it indexes.
 * This script does not collapse that: `membership.ts` and `qualification-agreement.py` each keep
 * their OWN symbol, in their OWN language, decided by their OWN grammar logic — nothing here adds an
 * import between them or between either of them and the compiler script at runtime. What changes is
 * that the LITERAL VALUE of each symbol is mechanically derived, at generation time, from one
 * hand-authored source, instead of retyped by a person who has to remember two other files exist.
 *
 * ── HOW IT WRITES WITHOUT TOUCHING THE PROSE AROUND IT ──
 *
 * Each target file keeps its own hand-authored header explaining WHY these fields (membership.ts's
 * doc comment, qualification-agreement.py's TRIPLE_FIELDS comment). Only the single declaration line
 * is replaced, by an anchored pattern matched against that one line and nothing else — verified
 * unique per file below. A pattern that stops matching (the declaration's own shape changed) is a
 * GenerationError, not a silent no-op.
 *
 * ── USAGE ──
 *
 *   node scripts/generate-operator-set.mjs           write membership.ts + qualification-agreement.py
 *   node scripts/generate-operator-set.mjs --check    diff only, exit 1 if either is stale
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./monorepo-config.mjs";
import { RESOLVABLE_FIELDS } from "./generate-qualification-declaration.mjs";

class GenerationError extends Error {}

/**
 * One target per generated copy. `pattern` must match EXACTLY ONE line in the file — checked below,
 * not assumed — and `render` reproduces that copy's own existing syntax (a TS `as const` array
 * literal, a Python tuple literal) so a first run against already-agreeing files is a byte-for-byte
 * no-op.
 */
const TARGETS = Object.freeze([
  {
    label: "app/present/membership.ts",
    path: join(REPO_ROOT, "app", "present", "membership.ts"),
    pattern: /export const RESOLVABLE_FIELDS = \[[^\]]*\] as const;/,
    render: (fields) =>
      `export const RESOLVABLE_FIELDS = [${fields.map((f) => JSON.stringify(f)).join(", ")}] as const;`,
  },
  {
    label: "scripts/qualification-agreement.py",
    path: join(REPO_ROOT, "scripts", "qualification-agreement.py"),
    pattern: /TRIPLE_FIELDS = \([^)]*\)/,
    render: (fields) => `TRIPLE_FIELDS = (${fields.map((f) => `"${f}"`).join(", ")})`,
  },
]);

function applyTarget(target, source) {
  const matches = source.match(new RegExp(target.pattern, "g"));
  if (!matches || matches.length === 0) {
    throw new GenerationError(
      `${target.label}: the pattern this generator anchors on was not found — the declaration's ` +
        "own shape changed and this generator needs updating with it, rather than silently no-op'ing.",
    );
  }
  if (matches.length > 1) {
    throw new GenerationError(
      `${target.label}: the anchor pattern matched ${matches.length} lines, not one — ambiguous, ` +
        "refusing to guess which is the declaration.",
    );
  }
  return source.replace(target.pattern, target.render(RESOLVABLE_FIELDS));
}

/**
 * Compare every target's CURRENT file content against what this generator would write.
 *
 * @returns {{stale: string[], lines: string[]}} the target labels that disagree, and lines to print
 */
export function checkOperatorSet() {
  const stale = [];
  const lines = [];
  for (const target of TARGETS) {
    const before = readFileSync(target.path, "utf8");
    const after = applyTarget(target, before);
    if (before === after) {
      lines.push(`  ${target.label}: matches RESOLVABLE_FIELDS.`);
      continue;
    }
    stale.push(target.label);
    lines.push(`  ${target.label}: STALE relative to RESOLVABLE_FIELDS.`);
  }
  return { stale, lines };
}

function parseArgs(argv) {
  const args = { check: false };
  for (const arg of argv) {
    if (arg === "--check") args.check = true;
    else throw new GenerationError(`unknown flag: ${arg}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { stale, lines } = checkOperatorSet();
  for (const line of lines) console.log(line);

  if (stale.length === 0) {
    console.log(
      "membership.ts and qualification-agreement.py both match generate-qualification-" +
        "declaration.mjs's RESOLVABLE_FIELDS.",
    );
    return;
  }

  if (args.check) {
    console.error(
      `${stale.length} file(s) STALE (${stale.join(", ")}) — run ` +
        "'node scripts/generate-operator-set.mjs' and commit the result.",
    );
    process.exit(1);
  }

  for (const target of TARGETS) {
    const before = readFileSync(target.path, "utf8");
    const after = applyTarget(target, before);
    if (before === after) continue;
    writeFileSync(target.path, after);
    console.log(`${target.label}: regenerated.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(String(error?.message || error));
    process.exit(error instanceof GenerationError ? 2 : 1);
  }
}

/**
 * generate-operator-set — writes `app/present/select/membership.ts`'s own literal copy of the
 * resolvable-field set, COMPILED from the real monorepo config, never by hand.
 *
 * ── THE DEFECT THIS EXISTS TO REMOVE ──
 *
 * `docs/architecture/operator-set.json`'s own `$comment` (§ "CORRECTIONS", point 2) found that the
 * resolvable-field set was not one list with no address — it was THREE independently hand-
 * synchronised lists, none importing from another:
 *
 *   scripts/generate-qualification-declaration.mjs:96   export const RESOLVABLE_FIELDS = ...
 *   app/present/select/membership.ts:69                  export const RESOLVABLE_FIELDS = ...
 *   scripts/qualification-agreement.py:62                TRIPLE_FIELDS = (...)
 *
 * The Python copy's own comment named the other two and said it was "kept in step with" them — the
 * practice stated in its own source. `tests/operator-set-agreement.test.mjs` proves the three agree
 * TODAY; it does not stop a fourth person from editing one of them tomorrow and shipping a green
 * commit two edits behind. This script removes the hand-sync itself, not just its symptom — for
 * the ONE copy that can be widened along with the compiler. See "WHY qualification-agreement.py IS
 * NO LONGER A TARGET" below for why the third copy is now a DELIBERATE, DOCUMENTED exception.
 *
 * ── 2026-08-06: THE SOURCE MOVED FROM A CONSTANT TO A COMPILE ──
 *
 * `RESOLVABLE_FIELDS` used to be a frozen array in `compile-qualification.mjs`, imported here
 * directly — no filesystem read of its own. The operator's own diagnosis ("we have nodes and
 * fields etc all declared in yaml... that should be compiled and be the source of truth") retired
 * that constant in favour of `deriveResolvableFields(files)`, a pure function of a config's own
 * vocabulary and schema (see that function's header). This script's job is unchanged — write the
 * concrete list into the generated file — but getting the concrete list now means compiling
 * the REAL monorepo config, the same one `generate-qualification-declaration.mjs`'s own CLI shell
 * reads, via `generateQualification(configDir)`. That function already threads `deriveResolvable
 * Fields`'s answer into the declaration it returns (`declaration.resolvableFields`) as a side
 * effect of building `tokens`/`predicates` correctly — this script reads that field rather than
 * re-deriving it, so there is still exactly one place the rule itself is stated.
 *
 * ── WHY qualification-agreement.py IS NO LONGER A TARGET ──
 *
 * `qualification-agreement.py`'s WHOLE METHOD (its own header, "WHY THE FIXTURE IS KEYED ON A
 * FIELD TRIPLE") is to cross the resolvable fields' own value domains into a PROBE SPACE it can
 * feed the real engine exhaustively — `node_type × domain × status` was ~2,184 probes at three
 * low-cardinality axes. `deriveResolvableFields` now derives 18 fields from the real config; a
 * full cross product over all eighteen axes is not a bigger fixture, it is an impossible one
 * (billions of probes). Widening `TRIPLE_FIELDS` to 18 entries and leaving `triple_of`/the probe
 * builder untouched would silently zip only the first three field NAMES against the SAME 3-tuple
 * VALUES (`dict(zip(TRIPLE_FIELDS, triple))`), producing a fixture that CLAIMS to be keyed on 18
 * fields while only ever having varied three — exactly the confident-and-wrong shape this whole
 * repository refuses elsewhere. Making that safe needs a genuinely different probing strategy
 * (pairwise/one-axis-at-a-time sampling, most likely) verified against the real engine — a second
 * PR, not a regex edit here. `qualification-agreement.py` therefore keeps a HAND-FROZEN
 * `TRIPLE_FIELDS = ("node_type", "domain", "status")`, asserted (in that file, at run time) to be
 * a SUBSET of the compiler's `resolvableFields`, and its own "REFUSING…outside TRIPLE_FIELDS"
 * exit now EXCLUDES the offending predicate from the fixture by name (mirroring how it already
 * excludes `edgeSteps` predicates as `graphDependentPatterns`) rather than aborting the whole run —
 * see that file's own header, restated 2026-08-06, for the full account. This is the one place a
 * field name survives outside a fixture or the config it reads: `qualification-agreement.py`'s
 * frozen tuple, and it survives there because widening it safely is out of this change's scope,
 * not because it was missed.
 *
 * ── WHY THE COMPILER'S COPY IS THE SOURCE, NOT `docs/architecture/operator-set.json` ──
 *
 * `operator-set.json` was built, by its own `$comment`, to OBSERVE the surfaces — "an ENUMERATION,
 * not a merge... read only by tests/operator-set-agreement.test.mjs, which probes each surface's
 * ACTUAL BEHAVIOUR." Making it the generation source would hand it a second job — defining the
 * value it currently only witnesses — and a document cannot cleanly do both without the corrections
 * block it already carries turning into a claim about its own output. `compile-qualification.mjs`'s
 * `deriveResolvableFields` has no such conflict: it is not decorative there — `normalisePattern`
 * filters every predicate's referenced fields through its result, and the token-table build is keyed
 * by it too. It is the one copy a change to the actual field-resolvability RULE would have to touch
 * for a reason other than staying in sync — a change to the CONFIG never touches it at all, which is
 * the entire point of deriving rather than freezing.
 *
 * ── WHAT STAYS FEDERATED ──
 *
 * `app/present/declaration.ts:32-54`'s own header states the served-declaration readers are
 * deliberately federated — "one served document, four strict readers, each owning one axis" — and
 * `operator-set.json`'s own `$comment` makes the same argument for the two vocabularies it indexes.
 * This script does not collapse that: `membership.ts` keeps its OWN symbol, in its OWN language,
 * decided by its OWN grammar logic — nothing here adds an import between it and the compiler
 * script at runtime. What changes is that the LITERAL VALUE is mechanically derived, at generation
 * time, from one compiled source, instead of retyped by a person who has to remember it exists.
 *
 * ── HOW IT WRITES WITHOUT TOUCHING THE PROSE AROUND IT ──
 *
 * The target file keeps its own hand-authored header explaining WHY these fields
 * (membership.ts's doc comment). Only the single declaration line is replaced, by an anchored
 * pattern matched against that one line and nothing else — verified unique below. A pattern that
 * stops matching (the declaration's own shape changed) is a GenerationError, not a silent no-op.
 *
 * ── WHEN THE MONOREPO CONFIG IS ABSENT ──
 *
 * Same posture as every other generator in this repo (`monorepo-config.mjs`'s own contract): CI
 * does not clone the private monorepo, so "cannot compile the real config" is not this script's
 * defect to hide behind a false green. `--check` exits 3 ("nothing was checked") unless
 * `--require-config` is passed, in which case it is a failure (exit 1) — a local caller who meant
 * to check finds out the check did not run, rather than reading a bare exit 0 as "confirmed fine".
 * `checkOperatorSet` itself never THROWS for a missing config dir — it returns `{stale: [],
 * checked: false, lines}` — so `tests/operator-set-agreement.test.mjs` (which calls it with no
 * monorepo on a CI runner) degrades to "nothing to check" rather than erroring the whole suite.
 *
 * ── USAGE ──
 *
 *   node scripts/generate-operator-set.mjs           write app/present/select/membership.ts
 *   node scripts/generate-operator-set.mjs --check    diff only, exit 1 if stale
 *   node scripts/generate-operator-set.mjs --config-dir X [--check [--require-config]]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { REPO_ROOT, DEFAULT_CONFIG_DIR, notCheckedReport } from "./monorepo-config.mjs";
import { generateQualification } from "./generate-qualification-declaration.mjs";

class GenerationError extends Error {}
export class NotCheckedError extends Error {}

/**
 * One target per generated copy. `pattern` must match EXACTLY ONE line in the file — checked below,
 * not assumed — and `render` reproduces that copy's own existing syntax (a TS `as const` array
 * literal) so a first run against an already-agreeing file is a byte-for-byte no-op.
 *
 * `scripts/qualification-agreement.py` is DELIBERATELY NOT a target — see this file's own header,
 * "WHY qualification-agreement.py IS NO LONGER A TARGET".
 */
const TARGETS = Object.freeze([
  {
    label: "app/present/select/membership.ts",
    path: join(REPO_ROOT, "app", "present", "select", "membership.ts"),
    pattern: /export const RESOLVABLE_FIELDS = \[[^\]]*\] as const;/,
    render: (fields) =>
      `export const RESOLVABLE_FIELDS = [${fields.map((f) => JSON.stringify(f)).join(", ")}] as const;`,
  },
]);

function applyTarget(target, source, resolvableFields) {
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
  return source.replace(target.pattern, target.render(resolvableFields));
}

/**
 * Compile the real monorepo config's resolvable-field set. Thrown `NotCheckedError` (never a bare
 * `GenerationError`) when `configDir` does not exist, so a caller can tell "nothing to compile"
 * apart from "compiled and it was wrong" — the same distinction every other generator in this repo
 * makes (`monorepo-config.mjs`'s own contract).
 *
 * @param {string} configDir
 * @returns {string[]}
 */
function compileResolvableFields(configDir) {
  if (!existsSync(configDir)) {
    throw new NotCheckedError(configDir);
  }
  const { resolvableFields } = generateQualification(configDir);
  return resolvableFields;
}

/**
 * Compare every target's CURRENT file content against what this generator would write, for the
 * resolvable-field set compiled from `configDir`.
 *
 * NEVER THROWS for a missing config dir — returns `{stale: [], checked: false, lines}` instead, so
 * a caller (this file's own `main`, or a test running with no monorepo on disk) can tell "nothing
 * to check" apart from "checked, and it disagreed" without a try/catch of its own. `stale` is
 * `[]` in that case, not because the files agree, but because there was nothing to compare them
 * against — the same "absence is not a pass, but is not a failure either" posture every other
 * generator's `--check` takes (`notCheckedReport`'s own header).
 *
 * @param {string} configDir
 * @returns {{stale: string[], checked: boolean, lines: string[]}}
 */
export function checkOperatorSet(configDir = DEFAULT_CONFIG_DIR) {
  let resolvableFields;
  try {
    resolvableFields = compileResolvableFields(configDir);
  } catch (error) {
    if (!(error instanceof NotCheckedError)) throw error;
    return { stale: [], checked: false, lines: notCheckedReport(configDir, false) };
  }
  const stale = [];
  const lines = [];
  for (const target of TARGETS) {
    const before = readFileSync(target.path, "utf8");
    const after = applyTarget(target, before, resolvableFields);
    if (before === after) {
      lines.push(`  ${target.label}: matches the compiled resolvable-field set.`);
      continue;
    }
    stale.push(target.label);
    lines.push(`  ${target.label}: STALE relative to the compiled resolvable-field set.`);
  }
  return { stale, checked: true, lines };
}

function parseArgs(argv) {
  const args = { check: false, requireConfig: false, configDir: DEFAULT_CONFIG_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--check") args.check = true;
    else if (argv[i] === "--require-config") args.requireConfig = true;
    else if (argv[i] === "--config-dir") args.configDir = resolve(argv[++i]);
    else throw new GenerationError(`unknown flag: ${argv[i]}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const { stale, checked, lines } = checkOperatorSet(args.configDir);
  for (const line of lines) console.log(line);

  if (!checked) {
    // `lines` already IS `notCheckedReport`'s output (see `checkOperatorSet`) — printed via
    // console.log above; re-print to stderr too so a `--check` caller piping stdout away still
    // sees why nothing happened, matching every other generator's CLI in this repo.
    for (const line of lines) console.error(line);
    process.exit(args.requireConfig ? 1 : 3);
  }

  if (stale.length === 0) {
    console.log(`membership.ts matches the config compiled at ${args.configDir}.`);
    return;
  }

  if (args.check) {
    console.error(
      `${stale.length} file(s) STALE (${stale.join(", ")}) — run ` +
        "'node scripts/generate-operator-set.mjs' and commit the result.",
    );
    process.exit(1);
  }

  const resolvableFields = compileResolvableFields(args.configDir);
  for (const target of TARGETS) {
    const before = readFileSync(target.path, "utf8");
    const after = applyTarget(target, before, resolvableFields);
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

/**
 * ONE RULE, ONE EXPRESSION: how many places in this app can post a file.
 *
 * ── WHY THIS FILE EXISTS ──
 *
 * The same invariant was copy-pasted into SIX test files (app-ordering-note, app-write-correlation,
 * app-today-note, app-membership-diagnostic, app-membership-note, and asserted again in comments in
 * app-seed-from-cascade and app-generality-acceptance). One rule, six expressions, every one of
 * them needing the identical edit whenever a call site moves — which is exactly what happened on
 * 2026-08-10, and again here. `backlog.yaml`'s `flag-the-same-applyedit-call-site-count` asked for
 * this helper by name; this is it.
 *
 * ── AND THE THING WORTH KNOWING ABOUT THOSE SIX COPIES ──
 *
 * They asserted TWO callers — `toggleTask` and `commitLine` — and guarded against "a third write
 * path". **THE CORRECT NUMBER WAS ALWAYS ONE.** A checkbox flip by mouse and the same flip by `x`
 * are one act, and the second path was a defect, not a design. So six perfectly-maintained
 * enforcers spent months certifying the defect as the state to protect, and every one of them was
 * green the whole time. A test can encode the wrong invariant and look exactly like a test
 * encoding the right one — which is the argument for writing the rule once, where changing your
 * mind about it is a single edit rather than a six-file archaeology exercise.
 *
 * ── WHAT IT COUNTS, AND WHY TWO DIFFERENT PATTERNS ──
 *
 * `app/index.html` holds `writeFile`'s own DECLARATION and, since the two paths merged, nothing
 * else — no call. The bundle holds `commitLine`'s two `deps.writeFile(...)` calls: the first
 * attempt and its one bounded rebase retry. A third of either is a new write path, and that is the
 * thing this refuses to let happen quietly.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every place a file can be posted, counted from the shipped sources rather than from memory. */
export function writePathCallSites() {
  const page = readFileSync(join(REPO, "app", "index.html"), "utf8");
  const bundle = readFileSync(join(REPO, "dist", "present.js"), "utf8");
  return {
    /** `writeFile`'s own declaration on the page. Since the merge, there is no CALL beside it. */
    page: (page.match(/\bwriteFile\(/g) ?? []).length,
    /** `commitLine`'s first attempt and its one bounded rebase retry. */
    bundle: (bundle.match(/\bdeps\.writeFile\(/g) ?? []).length,
  };
}

/**
 * ONE write path, and the counts that prove it.
 *
 * Call this instead of restating the numbers. When a call site legitimately moves, this file is
 * the only edit — which was the whole point of asking for it.
 */
export function assertOneWritePath() {
  const { page, bundle } = writePathCallSites();
  assert.equal(
    page,
    1,
    "app/index.html should hold `writeFile`'s DECLARATION and no call. A call here is a second " +
      "write path on the one page nothing type-checks — the shape `toggleTask` was, and the " +
      "reason a mouse tick and an `x` tick answered a refused write differently for three weeks.",
  );
  assert.equal(
    bundle,
    2,
    "the bundle should hold exactly `commitLine`'s first attempt and its ONE bounded rebase " +
      "retry. A third is either a new write path or an unbounded retry loop.",
  );
  assert.equal(page + bundle, 3, "a write call site appeared or vanished somewhere this rule did not expect");
}

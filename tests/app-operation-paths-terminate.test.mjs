/**
 * AN OPERATION COMPLETES — THE ENFORCER, NOT JUST THE FIX. `tests/app-operation-completes.test.mjs`
 * proves the THREE KNOWN real sites (design-the-two-rules.md §3 items 4 and 11) each individually
 * reach a terminal state, by mutating the exact line that closes each one and watching it break.
 * That suite is blind to a FOURTH site nobody has written yet: nothing there would notice a brand
 * new `writeFile(...)` call added tomorrow with no catch at all, because it only ever mutates lines
 * that already exist.
 *
 *   node --test tests/app-operation-paths-terminate.test.mjs
 *
 * This suite is the standing check for that: `scripts/check-operation-completeness.mjs`
 * (`checkOperationCompleteness`) walks the real page's AST looking for every place an operation can
 * begin, structurally, rather than by name — see that script's own header for the precise
 * definition, the terminal-act vocabulary, and the five blind spots named rather than discovered.
 *
 * ── SECTIONS ──
 *
 *   1. THE CHECKER HAS TEETH — synthetic pages, built by this file, prove the checker actually goes
 *      red on each of the shapes it claims to catch (no try/catch at all, a try with no catch, a
 *      catch that reaches no terminal act, a try whose success path never calls `arrive`, a missing
 *      `collect()` exhausted-branch act, and the soundness check itself). "A guard that cannot go
 *      red is decoration" (`tests/declaration-drop.test.mjs`'s own words) applies here as much as
 *      anywhere else in this repo.
 *   2. THE REAL PAGE — `app/index.html` today, checked, with the site count pinned so a site
 *      silently appearing or disappearing gets a human's attention rather than passing quietly.
 *   3. THE CI GATE — the script run as a subprocess, exactly the way a CI step would invoke it,
 *      against a REAL, MUTATED COPY of `app/index.html` carrying a genuinely new hanging path (a
 *      write with no try/catch around it at all) — the same shape as the mutation proof in this
 *      change's own PR body, kept here so it never has to be reproduced by hand again.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkOperationCompleteness, REPO_ROOT } from "../scripts/check-operation-completeness.mjs";

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..");
assert.equal(REPO, REPO_ROOT, "this test's idea of the repo root disagrees with the script's own");

const APP_HTML_PATH = join(REPO, "app", "index.html");
const CHECK_SCRIPT = join(REPO, "scripts", "check-operation-completeness.mjs");

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE CHECKER HAS TEETH — synthetic pages, each one wrong in exactly one named way
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The smallest page shape the checker's model requires: one `writeFile` function `writes.open`s a
 * token, one caller opens a token, awaits it inside a try/catch whose try calls `arrive` and whose
 * catch calls a terminal act, and one `collect` function whose "exhausted" branch concludes.
 * `overrides` replaces named pieces so each test below breaks exactly one thing and nothing else.
 */
function syntheticPage(overrides = {}) {
  const {
    writeFileBody = 'if (token !== null) { writes.open(token, path); }\n  return "ok";',
    callerTry = "const data = await writeFile(view, markdown, source, token);\n    arrive(view.path, data, {});",
    callerCatch = "if (token !== null) { writes.giveUp(token); }",
    wrapCallerInTry = true,
    exhaustedBranchBody = "if (going.token !== null) { writes.concludeGiveUp(going.token); }",
    includeCollect = true,
  } = overrides;

  const caller = wrapCallerInTry
    ? `async function toggleTask(view, markdown, source) {\n  const token = mintWriteToken();\n  try {\n    ${callerTry}\n  } catch (e) {\n    ${callerCatch}\n  }\n}`
    : `async function toggleTask(view, markdown, source) {\n  const token = mintWriteToken();\n  ${callerTry}\n}`;

  const collect = includeCollect
    ? `async function collect(path) {\n  const going = pickups.attempt(path);\n  const next = pickups.answered(path, false);\n  if (next.outcome === "again") {\n    armPickup(path, next.delayMs);\n  } else if (next.outcome === "exhausted") {\n    ${exhaustedBranchBody}\n  }\n}`
    : "";

  return `<!doctype html><html><body>
<script type="module">
async function writeFile(view, markdown, source, token = null) {
  ${writeFileBody}
}
${caller}
${collect}
</script>
</body></html>`;
}

describe("1. THE CHECKER HAS TEETH — each shape it claims to catch, actually caught", () => {
  test("the well-formed synthetic page passes with zero violations", () => {
    const { violations, sitesChecked } = checkOperationCompleteness(syntheticPage());
    assert.deepEqual(violations, []);
    assert.equal(sitesChecked, 2, "one writeFile call site + one collect() exhausted site");
  });

  test("a writeFile call with no try/catch at all is caught", () => {
    const { violations } = checkOperationCompleteness(syntheticPage({ wrapCallerInTry: false }));
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /not inside a try\/catch/);
  });

  test("a try whose catch clause reaches no terminal act is caught", () => {
    const { violations } = checkOperationCompleteness(
      syntheticPage({ callerCatch: "console.warn(e);" }),
    );
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /reaches none of writes\.giveUp/);
  });

  test("a try whose success path never calls arrive(...) is caught", () => {
    const { violations } = checkOperationCompleteness(
      syntheticPage({ callerTry: "const data = await writeFile(view, markdown, source, token);" }),
    );
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /never calls arrive/);
  });

  test("collect() with no 'exhausted' branch handling is caught", () => {
    const { violations } = checkOperationCompleteness(
      syntheticPage({ exhaustedBranchBody: "/* nothing */" }),
    );
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /falls through with no action/);
  });

  test("collect() missing entirely is caught, named, rather than silently skipped", () => {
    const { violations } = checkOperationCompleteness(syntheticPage({ includeCollect: false }));
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /no function named 'collect'/);
  });

  test("SOUNDNESS: a second writes.open(...) call site breaks this checker's own model, and it says so", () => {
    const page = syntheticPage({
      writeFileBody:
        'if (token !== null) { writes.open(token, path); }\n  writes.open("rogue", path);\n  return "ok";',
    });
    const { violations } = checkOperationCompleteness(page);
    assert.ok(
      violations.some((v) => /expected exactly one call to 'writes\.open\(/.test(v.message)),
      "a second, undeclared writes.open( call site did not trip the soundness check",
    );
  });

  test("a genuinely fine catch (heals instead of giving up) is not flagged", () => {
    const { violations } = checkOperationCompleteness(
      syntheticPage({ callerCatch: "healFromRefusal(view.path, e.current);" }),
    );
    assert.deepEqual(violations, [], "a legitimate terminal act was wrongly rejected");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE REAL PAGE — app/index.html, today
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. THE REAL PAGE — every write operation reaches a terminal state on every path this checker can see", () => {
  test("app/index.html has zero violations", () => {
    const html = readFileSync(APP_HTML_PATH, "utf8");
    const { violations } = checkOperationCompleteness(html);
    assert.deepEqual(
      violations,
      [],
      "an operation in app/index.html can end without reaching a terminal state — see the messages above",
    );
  });

  test("the site count is pinned — a new or vanished operation site needs a deliberate look here", () => {
    // 1 writeFile(...) call site (toggleTask) + 1 collect()-exhausted site, as of this change
    // (2026-08-07). It WAS 4 — 3 writeFile(...) call sites (toggleTask, commitLine, commitLine's
    // rebase retry) + 1 collect()-exhausted site, as of 65ba882 — until `commitLine` relocated to
    // app/present/commit.ts (see that module's own header for why). This checker parses ONLY
    // app/index.html's inline `<script type="module">` (its own header, point 5) and has NOT been
    // extended to also parse `.ts` modules, so commitLine's own two write sites are now genuinely
    // OUTSIDE what this checker can see — a real, deliberate coverage gap this relocation opens,
    // not a silent one: commit.ts's own try/catch shape is unchanged from what shipped here
    // (verified by the byte-for-byte relocation in commit.ts's own header, and by
    // tests/app-operation-completes.test.mjs §2/§5, which re-targeted their own checks at
    // commit.ts), but nothing STRUCTURALLY re-proves that the way this file's AST walk did. If
    // this number moves again, something about where writes begin or end changed — update this
    // pin as part of that change, deliberately, rather than letting it drift unnoticed.
    const html = readFileSync(APP_HTML_PATH, "utf8");
    const { sitesChecked } = checkOperationCompleteness(html);
    assert.equal(sitesChecked, 2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE CI GATE — the script itself, as a subprocess, against a REAL page carrying a real hang
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Run the script exactly as a CI step would, against a given HTML file. */
function runCheck(htmlPath) {
  try {
    const stdout = execFileSync(process.execPath, [CHECK_SCRIPT, "--file", htmlPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output: stdout };
  } catch (error) {
    return { code: error.status, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

describe("3. THE CI GATE — fails, as a real subprocess, on a real new hanging path", () => {
  test("FRESH: the real, unmutated app/index.html exits 0", () => {
    const { code, output } = runCheck(APP_HTML_PATH);
    assert.equal(code, 0, output);
  });

  test("MUTATED: a brand-new write call site with no try/catch at all makes the gate exit 1, naming the line", () => {
    const scratch = mkdtempSync(join(tmpdir(), "op-completeness-gate-"));
    try {
      const real = readFileSync(APP_HTML_PATH, "utf8");
      // THE MUTATION IS A NEW OPERATION, NOT A BROKEN EXISTING ONE — the exact shape the checker's
      // own header claims is its main strength: nobody has to remember to register a new write path
      // for this to catch it. Inserted right after writeFile's own declaration closes, so it is
      // unambiguously a sibling function and not accidentally nested inside anything real.
      const marker = "async function toggleTask(view, toggle) {";
      assert.ok(real.includes(marker), "app/index.html's shape moved — this mutation anchor is stale");
      const hang =
        "\nasync function quickSaveNoCatch(view, markdown, source) {\n" +
        "  // A REAL HANGING PATH, INSERTED FOR THIS TEST ONLY: a write with no try/catch around it\n" +
        "  // at all. If this write rejects, nothing on this page ever hears about it again.\n" +
        "  const token = mintWriteToken();\n" +
        "  const data = await writeFile(view, markdown, source, token);\n" +
        "  arrive(view.path, data, { markdown, token, source });\n" +
        "}\n\n";
      const mutated = real.replace(marker, hang + marker);
      assert.notEqual(mutated, real, "the mutation did not change the source");

      const mutatedPath = join(scratch, "index.html");
      writeFileSync(mutatedPath, mutated);

      const { code, output } = runCheck(mutatedPath);
      assert.equal(code, 1, `expected the gate to fail on a real new hanging path; got:\n${output}`);
      assert.match(output, /quickSaveNoCatch|not inside a try\/catch/);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

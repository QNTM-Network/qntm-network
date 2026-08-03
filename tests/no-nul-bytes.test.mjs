/**
 * NO NUL BYTE SURVIVES UNNOTICED IN A TRACKED FILE.
 *
 *   node --test tests/no-nul-bytes.test.mjs
 *
 * `app/present/instance.ts` carried a single NUL byte (0x00) at offset 12718 for three commits —
 * present since the line was first authored (a3f2d8c, PR #27) and untouched by two later commits
 * that both edited the file around it. It cost real time: an agent surveying a rename's blast
 * radius ran `grep -c` and `grep -rn` over `app/present/` and both silently skipped this file — no
 * error, no "binary file matches", a result indistinguishable from a genuine no-match. Only
 * `npm run typecheck` caught the missed import.
 *
 * THIS IS WHY THE CHECK READS BYTES, NEVER GREPS. `grep` (without `-a`) is the exact tool this
 * defect defeated — a NUL byte flips a file to "binary" for grep's own heuristic, and a binary-mode
 * miss prints nothing, not a warning. Proving the absence of NUL bytes with the tool that goes
 * blind in their presence would be circular. So this suite opens every tracked file with
 * `readFileSync` (no `encoding` option — raw `Buffer`) and searches the buffer directly.
 *
 * NOT EVERY NUL BYTE IS CORRUPTION. Two exceptions are known and enumerated below, never
 * discovered by a heuristic:
 *   - Real binary assets (`apple-touch-icon.png`, `favicon.ico`, `og.png`) are expected to contain
 *     arbitrary bytes, NUL included.
 *   - `tests/present-stamp.test.mjs` embeds ONE deliberate NUL as an element of its `hostile`
 *     character array — the fuzz test asserting that no character the stamp grammar can match,
 *     NUL included, can break out of the `title="…"` attribute it is written into. Removing it
 *     would silently drop NUL from that fixture's coverage.
 * Anything else — ANYTHING — is corruption until proven otherwise, and this suite proves nothing:
 * it fails, names the file and the offset, and leaves the proving to whoever reads the failure.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..");

// path -> null (any NUL bytes allowed, binary asset) | array of the EXACT offsets a deliberate NUL
// is allowed to sit at (any other offset in that file still fails — an allowlisted file is not a
// blank check).
const ALLOWED = {
  "apple-touch-icon.png": null,
  "favicon.ico": null,
  "og.png": null,
  "tests/present-stamp.test.mjs": [45161],
};

function trackedFiles() {
  // -z: NUL-separated, so a path containing a newline (or, fittingly, anything else exotic)
  // cannot be split wrong.
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8" });
  return out.split("\0").filter(Boolean);
}

function nulOffsets(buf) {
  const offsets = [];
  let i = buf.indexOf(0x00);
  while (i !== -1) {
    offsets.push(i);
    i = buf.indexOf(0x00, i + 1);
  }
  return offsets;
}

describe("no tracked file carries an unaccounted-for NUL byte", () => {
  for (const relative of trackedFiles()) {
    test(`${relative}`, () => {
      const buf = readFileSync(resolve(REPO, relative)); // raw Buffer — never decoded as text
      const offsets = nulOffsets(buf);
      const allowance = Object.prototype.hasOwnProperty.call(ALLOWED, relative)
        ? ALLOWED[relative]
        : [];

      if (allowance === null) {
        return; // binary asset — any byte pattern is expected
      }

      assert.deepEqual(
        offsets,
        allowance,
        offsets.length === 0
          ? undefined
          : `${relative} contains NUL byte(s) at offset(s) [${offsets.join(", ")}] ` +
              (allowance.length === 0
                ? "— none are allowlisted. `file` reports this file as binary/`data`, and grep " +
                  "(without -a) silently skips it. If this NUL is deliberate, add its exact " +
                  "offset to ALLOWED in tests/no-nul-bytes.test.mjs with a reason; otherwise it " +
                  "is corruption — remove it."
                : `— expected exactly [${allowance.join(", ")}] (the allowlisted deliberate ` +
                  "NUL(s)). An offset outside that list means either a new NUL crept in or the " +
                  "allowlisted one moved — both need eyes before this file ships."),
      );
    });
  }

  test("the check itself is not vacuous — proof, not assumption", () => {
    // MUTATION PROOF: inject a NUL into an in-memory buffer that mimics what the checker reads,
    // and confirm the same detection logic that guards the real tree actually flags it, then
    // confirm removing it clears the flag. Reruns on every CI push — this is not a one-time
    // manual demonstration, it is baked into the suite that would otherwise mark it dead code.
    const clean = Buffer.from('const key = `${a} ${b}`;\n', "utf8");
    assert.deepEqual(nulOffsets(clean), [], "the clean fixture must start with no NUL bytes");

    const corrupted = Buffer.from(clean);
    const injectAt = clean.indexOf(0x20); // the space between the two interpolations
    corrupted[injectAt] = 0x00;

    const redOffsets = nulOffsets(corrupted);
    assert.deepEqual(redOffsets, [injectAt], "injecting a NUL byte must be detected — RED");

    const healed = Buffer.from(corrupted);
    healed[injectAt] = 0x20; // remove the NUL — restore the space
    assert.deepEqual(nulOffsets(healed), [], "removing the NUL must clear the finding — GREEN");
  });
});

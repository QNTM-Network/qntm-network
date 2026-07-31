/**
 * THE PREFLIGHT IS CACHED — `worker/src/util.js`'s `cors()` carries `Access-Control-Max-Age`.
 *
 *   node --test tests/worker-cors.test.mjs
 *
 * MEASURED (docs/implementation-artifacts/research-state-and-speed.md §2.3): production shipped no
 * `Access-Control-Max-Age`, so Chrome's own default clamped every preflight's cache lifetime to 5
 * seconds — every API call more than five seconds after the last one paid a full extra `OPTIONS`
 * round trip, 105ms to the LHR edge. One header removes it. This is a one-header change with no
 * test of its own before now, and a one-header change with no test is exactly the thing a later
 * refactor drops without anyone noticing — see this file's own reason for existing.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { cors, ALLOWED_ORIGINS } from "../worker/src/util.js";

describe("cors() carries Access-Control-Max-Age", () => {
  test("the header is present and is exactly 86400 (24h) — the ceiling Chromium/Firefox honour", () => {
    const headers = cors("https://qntm.network");
    assert.equal(
      headers["Access-Control-Max-Age"],
      "86400",
      "no Access-Control-Max-Age — the preflight falls back to Chrome's 5-second default again",
    );
  });

  test("the ceiling applies for every caller this Worker allows, not only the app's own origin", () => {
    for (const origin of ALLOWED_ORIGINS) {
      assert.equal(cors(origin)["Access-Control-Max-Age"], "86400", `${origin} lost the header`);
    }
    // And an origin the allowlist does not recognise still gets a preflight lifetime — cors()
    // always answers with the qntm.network fallback rather than omitting the header for a caller
    // it is about to refuse anyway.
    assert.equal(cors("https://not-allowed.example")["Access-Control-Max-Age"], "86400");
  });

  test("every other header cors() already set is unchanged", () => {
    // The point of this suite is ONE ADDITION, not a rewrite — a test that only checked the new
    // header would not catch a change that quietly dropped an existing one on the way past.
    const headers = cors("https://qntm.network");
    assert.equal(headers["Access-Control-Allow-Origin"], "https://qntm.network");
    assert.equal(headers["Access-Control-Allow-Methods"], "POST, GET, OPTIONS");
    assert.equal(headers["Access-Control-Allow-Headers"], "Content-Type, Authorization");
    assert.equal(headers["Vary"], "Origin");
  });
});

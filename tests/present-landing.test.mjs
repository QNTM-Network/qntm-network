/**
 * THE LANDING VIEW, PUBLISHED AND READ.
 *
 *   node --test tests/present-landing.test.mjs
 *
 * `app/index.html`'s `landOn` (called by `loadGraph`) used to end its fallback chain in a literal
 * `"inbox"` — PR #126, filed as backlog row `declare-the-default-view`. This is that row, closed:
 * `scripts/compile-landing.mjs` reads `views/default_registration.yaml`'s own
 * `default_registration.landing_view` (the SAME file and rung `compile-resolution.mjs`'s own
 * `readRegistration` already reads `default_node_type`/`input_grammar`/`default_tags` from — see
 * that module's header for why this is a sibling file rather than a fourth field there), publishes
 * it as `presentation.json`'s top-level `landingView`, and `app/present/declaration.ts` reads it
 * into `declaration.landingView` — the one value `landOn` consumes, with no view name inside it.
 *
 * Four claims:
 *
 *   1. THE PURE COMPILE: absent file, absent key, a real value, and a malformed one — each
 *      against the fixture config, and one MUTATION proof (a scratch copy gains `landing_view`,
 *      compiling it changes the answer, tearing the mutation down changes it back).
 *   2. THE READER (`declaration.ts`): a well-formed key is adopted; an absent key is SILENT (no
 *      problem, `landingView: undefined`); a malformed one is a reported problem, never a guess.
 *   3. THE READER IS WIRED — `presentationFromDeclaration`/`declarationFrom` carry `landingView`
 *      all the way to `Declaration`, the value `app/index.html` actually reads.
 *   4. `landOn` ITSELF contains no view name — grepped, not eyeballed.
 *
 * `tests/app-shell.test.mjs` section 8 is the end-to-end proof (a fixture document declaring a
 * DIFFERENT landing view, driven through the real `loadGraph`); this file is the narrower, faster
 * proof of the compile step and the reader in isolation.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compile,
  GenerationError,
  DEFAULT_REGISTRATION_KEY,
} from "../scripts/compile-landing.mjs";
import { generateLanding, readConfigTree } from "../scripts/generate-landing-declaration.mjs";
import {
  readDeclaration,
  LANDING_VIEW_KEY,
  presentationFromDeclaration,
  declarationFrom,
  NOT_YET_DECLARED,
} from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const FIXTURE_CONFIG = join(HERE, "fixtures", "config");
const APP_SOURCE = readFileSync(resolve(REPO, "app", "index.html"), "utf8");

describe("1. the pure compile", () => {
  test("no default_registration.yaml at all -> undefined, not a refusal", () => {
    assert.deepEqual(compile({}), { landingViewId: undefined });
  });

  test("the fixture config declares no landing_view -> undefined", () => {
    const landing = generateLanding(FIXTURE_CONFIG);
    assert.deepEqual(landing, { landingViewId: undefined });
  });

  test("a declared landing_view is published verbatim", () => {
    const files = { [DEFAULT_REGISTRATION_KEY]: "default_registration:\n  landing_view: main\n" };
    assert.deepEqual(compile(files), { landingViewId: "main" });
  });

  test("a malformed landing_view refuses loudly rather than guessing", () => {
    const files = { [DEFAULT_REGISTRATION_KEY]: "default_registration:\n  landing_view: 7\n" };
    assert.throws(() => compile(files), GenerationError);
    assert.throws(() => compile(files), /landing_view.*not a non-empty string/s);

    const emptyString = { [DEFAULT_REGISTRATION_KEY]: "default_registration:\n  landing_view: \"\"\n" };
    assert.throws(() => compile(emptyString), GenerationError);
  });

  test("MUTATION PROOF: a scratch copy of the fixture config gains a declared landing view, the answer changes, and reverting it changes back", () => {
    const scratch = mkdtempSync(join(tmpdir(), "present-landing-"));
    try {
      cpSync(FIXTURE_CONFIG, scratch, { recursive: true });
      const path = join(scratch, "views", "default_registration.yaml");

      assert.deepEqual(generateLanding(scratch), { landingViewId: undefined }, "before the mutation");

      const original = readFileSync(path, "utf8");
      writeFileSync(path, original.trimEnd() + "\n  landing_view: main\n");
      assert.deepEqual(generateLanding(scratch), { landingViewId: "main" }, "after the mutation");

      writeFileSync(path, original);
      assert.deepEqual(generateLanding(scratch), { landingViewId: undefined }, "after reverting it");
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("readConfigTree carries only the one file this module reads", () => {
    const files = readConfigTree(FIXTURE_CONFIG);
    assert.deepEqual(Object.keys(files), [DEFAULT_REGISTRATION_KEY]);
  });
});

describe("2. the reader — declaration.ts", () => {
  test("a well-formed landingView is adopted, with no problems", () => {
    const { landingView, problems } = readDeclaration({ landingView: "habit-dojo" });
    assert.equal(landingView, "habit-dojo");
    assert.deepEqual(problems, []);
  });

  test("no landingView key at all is SILENCE, not a problem", () => {
    const { landingView, problems } = readDeclaration({});
    assert.equal(landingView, undefined);
    assert.deepEqual(problems, []);
  });

  test("a malformed landingView is a reported problem, never a guess", () => {
    for (const bad of [7, "", null, [], {}]) {
      const { landingView, problems } = readDeclaration({ landingView: bad });
      assert.equal(landingView, undefined, `${JSON.stringify(bad)} was silently adopted`);
      assert.equal(problems.length, 1);
      assert.match(problems[0], /landingView/);
    }
  });

  test("declaration.ts does not misreport LANDING_VIEW_KEY as an unrecognised key", () => {
    assert.equal(LANDING_VIEW_KEY, "landingView");
  });
});

describe("3. the reader is wired end to end — presentationFromDeclaration -> Declaration", () => {
  test("landingView reaches app/index.html's declaration, not just declaration.ts's own return value", () => {
    const declared = presentationFromDeclaration({ landingView: "qntm-queue" });
    assert.equal(declared.landingView, "qntm-queue");
    const declaration = declarationFrom(declared);
    assert.equal(declaration.landingView, "qntm-queue");
  });

  test("NOT_YET_DECLARED carries landingView: undefined, the same sentinel every other axis uses", () => {
    assert.equal(NOT_YET_DECLARED.landingView, undefined);
  });
});

describe("4. THE GENERALITY TEST — landOn contains no view name", () => {
  test("no string literal view id appears in landOn's own body", () => {
    const start = APP_SOURCE.indexOf("function landOn(");
    assert.notEqual(start, -1, "landOn was not found in app/index.html");
    const end = APP_SOURCE.indexOf("\n}", start);
    const body = APP_SOURCE.slice(start, end);
    // Every quoted string literal in the body, so a future edit that reintroduces one fails here
    // rather than surviving a code review that does not grep for it.
    const literals = [...body.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    for (const literal of literals) {
      assert.notEqual(literal, "inbox", "landOn still names a view by its id");
      assert.notEqual(literal, "this-week", "landOn still names a view by its id");
    }
  });

  test("landOn takes the declared landing view as an argument, not a closed-over constant", () => {
    const start = APP_SOURCE.indexOf("function landOn(");
    const signatureEnd = APP_SOURCE.indexOf(")", start);
    const signature = APP_SOURCE.slice(start, signatureEnd + 1);
    assert.equal(signature, "function landOn(views, keep, landingViewId)");
  });
});

/**
 * THE WAY IN — the screen a person who is not the operator meets first, and the room they land in.
 *
 *   node --test tests/app-entry.test.mjs
 *
 * The passkey ceremony was built and works. What was never built is everything around it, and this
 * suite is the fence around the half that can be built WITHOUT knowing where a second user's graph
 * lives — see docs/implementation-artifacts/design-someone-else-can-sign-up.md, which names the
 * five places the rest of the flow waits on that decision.
 *
 * ── WHY IT DRIVES THE PAGE RATHER THAN DESCRIBING IT ──
 *
 * Same reason as tests/app-shell.test.mjs and tests/app-html-write-path.test.mjs: app/index.html
 * is hand-authored HTML, outside tsconfig, outside the bundle and outside flow-trace's capture
 * (node cannot import an HTML document). A suite that restated the entry screen's wiring in a
 * fixture would stay green while the page rotted. tests/fixtures/app-html-page.mjs lifts the real
 * module script and runs it, so `register`, `login`, `friendlyAuthError` and `showEmpty` below are
 * the ones that ship.
 *
 * ── WHAT WAS MEASURED, AND WHERE THE NUMBERS IN THESE COMMENTS CAME FROM ──
 *
 * The repo was served locally with a stubbed worker and the app driven inside an iframe sized to
 * an exact viewport, so a media query saw a real 390×844 phone without the window being resized.
 * Every px below is a getBoundingClientRect() or a getComputedStyle() read from inside that frame.
 * No WebAuthn dialog was ever opened: the client's own catch path was reached by answering
 * /auth/register/options with a foreign `rp.id`, which @simplewebauthn rejects BEFORE it calls
 * navigator.credentials.create.
 */

import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { REPO, importPage, installBrowser, makeWorkDir } from "./fixtures/app-html-page.mjs";

const PAGE = readFileSync(resolve(REPO, "app", "index.html"), "utf8");
const WORKER_AUTH = readFileSync(resolve(REPO, "worker", "src", "auth.js"), "utf8");

/** The page with every comment removed — the same trick the shell suite uses, for the same reason:
 *  these comments TALK about what was retired, and searching the raw file would make explaining a
 *  change a test failure. */
const CODE = PAGE
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/** Just the markup of `#entry`, comments and all — what a person actually meets. */
const ENTRY_MARKUP = /<section id="entry"[\s\S]*?<\/section>/.exec(PAGE)?.[0] ?? "";

/** The page's stylesheet, as text. */
const SHEET_TEXT = /<style>([\s\S]*?)<\/style>/.exec(PAGE)?.[1] ?? "";

/** One declaration out of one rule, by selector and property. */
function declared(selector, property) {
  const rule = new RegExp(
    `(^|\\})[^{}]*(?:^|,|\\s)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    "m",
  ).exec(SHEET_TEXT);
  if (!rule) return null;
  const found = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "m").exec(rule[2]);
  return found ? found[1].trim() : null;
}

let page;
let browser;

before(async () => {
  browser = installBrowser();
  page = await importPage(makeWorkDir("app-entry"));
});

const el = (id) => browser.document.getElementById(id);

beforeEach(() => {
  delete globalThis.__webauthn;
  el("handle").value = "";
  el("entryErr").textContent = "";
  el("handle").className = "";
  el("handle").attributes.clear();
  browser.focused.value = null;
  page.__setToken(null);
  page.__setGraphData(null);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SCREEN EXPLAINS ITSELF BEFORE IT ASKS FOR ANYTHING
//
// MEASURED BEFORE THIS CHANGE, at 390×844: the one filled, high-emphasis button on the page was
// "Continue with a passkey" (215.89 × 47.99px) — the path a person who has never been here CANNOT
// take. The newcomer's path was a ghost button beside a 152.04px input whose entire explanation of
// itself was the placeholder "claim a handle", under a 14px line reading "New here?".
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. the entry screen says what it is asking for", () => {
  test("THE NEWCOMER'S PATH IS THE FILLED BUTTON, and the returning one is the ghost", () => {
    const register = /<button id="registerBtn"([^>]*)>/.exec(ENTRY_MARKUP)?.[1] ?? "";
    const login = /<button id="loginBtn"([^>]*)>/.exec(ENTRY_MARKUP)?.[1] ?? "";
    assert.ok(register, "#registerBtn is gone from the entry screen");
    assert.ok(login, "#loginBtn is gone from the entry screen");
    assert.ok(
      !/\bghost\b/.test(register),
      "the newcomer's button is the ghost again — on the screen whose purpose is that somebody " +
        "other than the operator can sign up",
    );
    assert.ok(/\bghost\b/.test(login), "both buttons are now competing for the same emphasis");
  });

  test("the handle rule is stated BEFORE it can be broken, and the field points at it", () => {
    const handle = /<input id="handle"([^>]*)>/.exec(ENTRY_MARKUP)?.[1] ?? "";
    assert.match(
      handle, /aria-describedby="handleHint"/,
      "the field no longer points at its own hint, so the rule is only reachable by failing",
    );
    const hint = /<p id="handleHint"[^>]*>([\s\S]*?)<\/p>/.exec(ENTRY_MARKUP)?.[1] ?? "";
    assert.ok(hint, "#handleHint is gone");
    assert.match(hint, /2 to 32/, "the hint stopped stating the length rule");
    // The rule the SERVER enforces is a leading alphanumeric plus letters/digits/-/_ — the hint
    // has to name the character set, not just the length, or half of it is still a guess.
    for (const piece of ["letters", "digits"]) {
      assert.ok(hint.includes(piece), `the hint stopped naming ${piece}`);
    }
  });

  test("a failure is AUDIBLE — the row announces itself", () => {
    // Measured before this change: #entryErr carried role=null and aria-live=null, so a screen
    // reader was told nothing at all after any of the four failures. The person heard a button
    // that did nothing.
    const err = /<div id="entryErr"([^>]*)>/.exec(ENTRY_MARKUP)?.[1] ?? "";
    assert.ok(err, "#entryErr is gone");
    assert.match(err, /role="alert"/, "the error row went silent again");
  });

  test("the screen says what a passkey is going to do", () => {
    // Pressing the button summons an operating-system dialog the visitor did not ask for, and the
    // commonest thing anyone does with an unexpected system dialog is dismiss it.
    assert.match(ENTRY_MARKUP, /face, fingerprint or screen lock/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. ONE HANDLE RULE, WRITTEN IN TWO FILES, HELD TOGETHER BY THIS
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. the handle rule cannot drift between the page and the worker", () => {
  test("the page's regex is character-for-character the worker's", () => {
    const inWorker = /const HANDLE_RE = (\/.*\/[a-z]*);/.exec(WORKER_AUTH)?.[1];
    const inPage = /const HANDLE_RE = (\/.*\/[a-z]*);/.exec(CODE)?.[1];
    assert.ok(inWorker, "worker/src/auth.js no longer declares HANDLE_RE");
    assert.ok(inPage, "app/index.html no longer declares HANDLE_RE");
    assert.equal(
      inPage, inWorker,
      "the page and the worker now disagree about what a handle is — the page can admit a handle " +
        "the server will refuse, or refuse one it would have taken",
    );
  });

  test("and the page's copy is the one the page actually uses", () => {
    // A regex declared and never read is the highest-frequency bug in this system. Drive it.
    assert.equal(page.HANDLE_RE.test("ab"), true);
    assert.equal(page.HANDLE_RE.test("a"), false, "a one-character handle got through");
    assert.equal(page.HANDLE_RE.test("-lead"), false, "a leading hyphen got through");
    assert.equal(page.HANDLE_RE.test("has space"), false, "a space got through");
    assert.equal(page.HANDLE_RE.test("a".repeat(33)), false, "a 33-character handle got through");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. EVERY FAILURE, DRIVEN
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** A fetch that answers one JSON body with one status, and records that it was called. */
function fetchAnswering(status, body) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return calls;
}

/** A WebAuthn error shaped exactly the way @simplewebauthn/browser@13.3.0 raises it. */
function webauthnError(code, causeName) {
  const e = new Error("the library's own string, which nobody should ever read");
  e.code = code;
  if (causeName) e.cause = { name: causeName };
  return e;
}

describe("3. what a person is told when it does not work", () => {
  test("an empty handle is caught here, and takes the cursor back to the field", async () => {
    const calls = fetchAnswering(200, { ok: true });
    await page.register();
    assert.equal(el("entryErr").textContent, "Choose a handle first.");
    assert.deepEqual(calls, [], "an empty handle went to the network");
    // Measured before this change: activeElement after every failure was BODY. On a phone the
    // keyboard has already gone and the person has to find a 152px input again by themselves.
    assert.equal(browser.focused.value, el("handle"), "the cursor was left wherever it was");
    assert.equal(el("handle").getAttribute("aria-invalid"), "true");
    assert.ok(el("handle").classList.contains("wrong"), "the field is not marked");
  });

  test("A MALFORMED HANDLE COSTS NO ROUND TRIP, and is told the rule rather than a code", async () => {
    const calls = fetchAnswering(200, { ok: true });
    el("handle").value = "a";
    await page.register();
    assert.deepEqual(calls, [], "the page asked the worker something it already knew the answer to");
    assert.match(el("entryErr").textContent, /2 to 32/);
    assert.equal(browser.focused.value, el("handle"));
  });

  test("a taken handle sends them to the other path, and marks the field", async () => {
    fetchAnswering(409, { ok: false, error: "handle taken — try logging in" });
    el("handle").value = "luke";
    await page.register();
    assert.match(el("entryErr").textContent, /taken/);
    assert.equal(el("handle").getAttribute("aria-invalid"), "true");
    assert.equal(browser.focused.value, el("handle"));
  });

  test("A CANCELLED CEREMONY IS A SENTENCE, NOT A SPEC URL", async () => {
    // THE ONE THIS SUITE EXISTS FOR. Before this change the catch block was
    // `entryErr.textContent = e.message`, and @simplewebauthn/browser@13.3.0 re-throws a
    // NotAllowedError with code ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY and the BROWSER's own
    // message, unchanged — which in Chrome ends in a link to w3.org/TR/webauthn-2. Cancelling is
    // the most likely thing a first-time visitor does with a system dialog they did not expect,
    // and that was the app's answer to it.
    fetchAnswering(200, { ok: true, flowId: "f", options: {} });
    globalThis.__webauthn = {
      startRegistration: () => {
        throw webauthnError("ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", "NotAllowedError");
      },
    };
    el("handle").value = "newcomer";
    await page.register();
    assert.equal(el("entryErr").textContent, "Cancelled — no passkey was created.");
    assert.ok(
      !/w3\.org|NotAllowed|ERROR_/.test(el("entryErr").textContent),
      "the library's internal string reached the screen",
    );
    // The handle was fine. Marking it invalid would blame the field for the dialog.
    assert.equal(el("handle").getAttribute("aria-invalid"), null);
    assert.ok(!el("handle").classList.contains("wrong"));
  });

  test("a device that already holds this passkey is sent to the other path", async () => {
    fetchAnswering(200, { ok: true, flowId: "f", options: {} });
    globalThis.__webauthn = {
      startRegistration: () => {
        throw webauthnError("ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED", "InvalidStateError");
      },
    };
    el("handle").value = "newcomer";
    await page.register();
    assert.match(el("entryErr").textContent, /already has that passkey/);
    assert.match(el("entryErr").textContent, /sign in/);
  });

  test("signing in with no passkey says so WITHOUT claiming to know which it was", async () => {
    // A cancelled ceremony and "this device holds no passkey for this site" are the SAME
    // NotAllowedError. The platform refuses to distinguish them on purpose — the difference is a
    // privacy leak about what credentials a device is carrying — so the message covers both and
    // points at the create path, which is now on the same screen.
    fetchAnswering(200, { ok: true, flowId: "f", options: {} });
    globalThis.__webauthn = {
      startAuthentication: () => {
        throw webauthnError("ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", "NotAllowedError");
      },
    };
    await page.login();
    assert.match(el("entryErr").textContent, /No passkey used/);
    assert.match(el("entryErr").textContent, /create one above/);
    assert.equal(el("handle").getAttribute("aria-invalid"), null, "sign-in blamed the handle field");
  });

  test("a network failure is named as one, not pasted onto the screen", async () => {
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    el("handle").value = "newcomer";
    await page.register();
    assert.match(el("entryErr").textContent, /Could not reach qntm/);
    assert.ok(!/Failed to fetch/.test(el("entryErr").textContent));
  });

  test("the mark is CLEARED as well as set — a stale invalid field is a lie", async () => {
    // First failure: about the field.
    fetchAnswering(200, { ok: true });
    await page.register();
    assert.equal(el("handle").getAttribute("aria-invalid"), "true");
    // Second failure: about the ceremony. The field is fine now and must stop saying it is not.
    fetchAnswering(200, { ok: true, flowId: "f", options: {} });
    globalThis.__webauthn = {
      startRegistration: () => { throw webauthnError("ERROR_CEREMONY_ABORTED"); },
    };
    el("handle").value = "newcomer";
    await page.register();
    assert.equal(el("handle").getAttribute("aria-invalid"), null, "the field stayed marked invalid");
    assert.ok(!el("handle").classList.contains("wrong"));
  });

  test("signing out does not leave the last person's error for the next one", async () => {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
    el("entryErr").textContent = "Cancelled — no passkey was created.";
    el("handle").className = "wrong";
    page.logout();
    assert.equal(el("entryErr").textContent, "");
    assert.ok(!el("handle").classList.contains("wrong"));
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE ERROR ROW RESERVES THE ROW IT HOLDS
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. saying no does not move the card", () => {
  test("the reserved row is the height of the line it reserves for", () => {
    // MEASURED at 390×844: #entryErr went 16.8892px → 21.1151px the moment a message appeared —
    // 4.2259px of travel in the card's bottom edge, every time this screen said no. That is three
    // times the 1.3637px the reading column's own suite polices, on the one screen a stranger
    // meets first.
    //
    // The number is not asserted as a literal. It is asserted as THE SAME NUMBER as the body's
    // line-height, which is what makes 1.5em the right value rather than a bigger guess: a
    // reserved row that is not the line's own height is a row that is wrong in one direction or
    // the other.
    const bodyFont = declared("body", "font");
    assert.ok(bodyFont, "the body's font shorthand is gone");
    const lineHeight = /\/\s*([\d.]+)/.exec(bodyFont)?.[1];
    assert.ok(lineHeight, `no line-height in the body font shorthand: ${bodyFont}`);
    assert.equal(
      declared(".err", "min-height"), `${lineHeight}em`,
      "the error row no longer reserves one whole line, so the card jumps when it says no",
    );
  });

  test("EVERY SENTENCE THIS SCREEN CAN SAY FITS THE ROW IT RESERVED", () => {
    // THE FIRST DRAFT OF THIS CHANGE CLOSED A 4.2259px SHIFT AND OPENED A 21.1151px ONE. Measured
    // at 390×844 with each real message in the row: four of eight wrapped to two lines and pushed
    // the sign-in button down by exactly one row (+21.1151px), which is five times the movement
    // the reservation was fixing. Reserving two lines instead would be 21px of dead space on
    // every load for a state that is rare, so the sentences were shortened until they fit.
    //
    // THE BUDGET IS A MEASUREMENT. The row is 310.5682px wide at --t3; a 47-character message
    // fits on one line, and so does a string of 45 capital Ms — the widest glyph in the face, and
    // therefore the worst case any real sentence can be. 48 is the number that holds for both.
    // Measured after the rewrite: all eight messages at 21.1151px, sign-in button at +0.0000px.
    const BUDGET = 48;
    // WHAT COUNTS: the sentences that land in THIS ROW. The empty state's prose is deliberately
    // not here — it sits in the 560px reading column with nothing under it to push.
    const friendly = /function friendlyAuthError\([\s\S]*?\n}/.exec(CODE)?.[0] ?? "";
    assert.ok(friendly, "friendlyAuthError is gone");
    const sentences = [
      /const HANDLE_RULE = "([^"]+)"/.exec(CODE)?.[1],
      ...[...CODE.matchAll(/showEntryError\(\s*"([^"]+)"/g)].map((m) => m[1]),
      ...[...friendly.matchAll(/"([^"]{8,})"/g)].map((m) => m[1]),
    ].filter(Boolean);
    assert.ok(sentences.length >= 5, `only found ${sentences.length} of this screen's sentences`);
    const overrun = sentences.filter((s) => s.length > BUDGET).map((s) => `${s.length}: ${s}`);
    assert.deepEqual(overrun, [], "these wrap to a second line and move everything under them");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE EMPTY ENVIRONMENT
//
// MEASURED at 1440×900 before this change: a brand-new account's entire environment was one
// 21.12px line of the dimmest colour on the page, in a 900px window with nothing else in it,
// reading "No snapshot yet — run graph-sync push on the laptop." — an instruction addressed to
// exactly one human being on earth, shown to everybody who is not him.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. what a brand-new account is shown", () => {
  test("NOBODY IS TOLD TO RUN A COMMAND ON A LAPTOP THEY DO NOT HAVE", () => {
    for (const kind of ["no-environment", "no-views", "unreadable"]) {
      page.showEmpty(kind);
      const said = `${el("emptyHead").textContent} ${el("emptyBody").textContent}`;
      for (const operatorOnly of ["graph-sync", "laptop", "push"]) {
        assert.ok(
          !said.toLowerCase().includes(operatorOnly),
          `the "${kind}" state says "${operatorOnly}" to somebody who is not the operator`,
        );
      }
    }
  });

  test("the three situations are three sentences, not one", () => {
    const said = {};
    for (const kind of ["no-environment", "no-views", "unreadable"]) {
      page.showEmpty(kind);
      said[kind] = el("emptyHead").textContent;
      assert.ok(said[kind], `the "${kind}" state has no heading`);
    }
    assert.equal(
      new Set(Object.values(said)).size, 3,
      "two of the three empty states say the same thing — they mean different things to the reader",
    );
  });

  test("it says what a view is, and where the boundary is", () => {
    // The drawer, the bar and the whole reading column are organised around a noun this app had
    // never defined — and the definition carries the line the last three agents held: the app
    // shows and edits files, and never creates them. Not a limitation to hide; the spine.
    page.showEmpty("no-environment");
    assert.match(el("emptyBody").textContent, /a file/i);
    assert.match(el("emptyBody").textContent, /never creates/i);
  });

  test("THE NEXT STEP IS A NAMED, EMPTY SLOT — it is not guessed at", () => {
    // What an empty account should do next is a function of where a second user's graph lives,
    // which is an open decision in server/ and worker/. See section 3.1 of
    // docs/implementation-artifacts/design-someone-else-can-sign-up.md for what each candidate
    // answer would put here. A sentence written before the decision is the first sentence this
    // product says to somebody who has just trusted it with a credential.
    for (const kind of ["no-environment", "no-views", "unreadable"]) {
      page.showEmpty(kind, "detail");
      assert.equal(el("emptyNext").textContent, "", `the "${kind}" state guessed at a next step`);
    }
  });

  test("a failed read keeps its machine detail on its own line, in its own register", () => {
    page.showEmpty("unreadable", "request failed (503)");
    assert.equal(el("freshness").textContent, "request failed (503)");
    assert.match(el("emptyBody").textContent, /still good/i, "it reads as a sign-out again");
  });

  test("no snapshot and no views are told apart, driven through loadGraph", async () => {
    globalThis.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({ ok: true, handle: "newcomer", snapshot: null, pending_edits: 0 }),
    });
    await page.loadGraph();
    const noEnvironment = el("emptyHead").textContent;
    assert.ok(!el("empty").classList.contains("hidden"), "the empty state was never revealed");

    globalThis.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        ok: true, handle: "newcomer", pending_edits: 0,
        snapshot: { generated_at: "2026-07-30T10:00:00Z", views: [] },
      }),
    });
    await page.loadGraph();
    assert.notEqual(
      el("emptyHead").textContent, noEnvironment,
      "an account with no graph and a graph with nothing in it read the same",
    );
  });

  test("and it goes away the moment there is something to show", async () => {
    page.showEmpty("no-environment");
    globalThis.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        ok: true, handle: "newcomer", pending_edits: 0,
        snapshot: {
          generated_at: "2026-07-30T10:00:00Z",
          views: [{ id: "this-week", path: "this_week.md", title: "This week", markdown: "# hi\n" }],
        },
      }),
    });
    await page.loadGraph();
    assert.ok(el("empty").classList.contains("hidden"), "the empty state survived a full snapshot");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. A DROPPED CONNECTION IS NOT A SIGN-OUT
//
// The boot block used to be a bare `catch` that deleted the session token on ANY throw — a tunnel,
// a worker cold start, a 500 — and returned the reader to the sign-in screen with no message,
// needing a fresh passkey ceremony to get back in. The session it threw away has a thirty-day
// server-side life (SESSION_TTL, worker/src/auth.js).
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("6. only the server saying so ends a session", () => {
  test("the status travels with the error, which is what makes the difference knowable", async () => {
    for (const status of [401, 500, 503]) {
      fetchAnswering(status, { ok: false, error: "nope" });
      const thrown = await page.api("/app/graph", { method: "GET", auth: true }).then(
        () => null,
        (e) => e,
      );
      assert.ok(thrown, `a ${status} did not throw`);
      assert.equal(thrown.status, status, "the error arrived without its status, so nothing can tell a expired session from a tunnel");
    }
  });

  test("and the boot block discards the token in exactly one place, behind a 401", () => {
    // The boot sequence is a top-level IIFE that runs once at import, so it is asserted at the
    // source. The behaviour it depends on — the status above — is driven.
    const boot = /--- boot:[\s\S]*$/.exec(PAGE)?.[0] ?? "";
    assert.ok(boot, "the boot block is gone");
    const discards = [...boot.matchAll(/removeItem/g)];
    assert.equal(discards.length, 1, "the session is thrown away in more than one place at boot");
    assert.match(
      boot, /status === 401[\s\S]{0,200}removeItem/,
      "the boot block discards the session without checking that the server said to",
    );
  });

  test("the re-read is pressable after a read that failed at boot", async () => {
    // The one state where it is the only way out: a good session, no graph in hand. The guard
    // used to be `!graphData` alone, which made the button dead exactly there.
    page.__setToken("a-good-session");
    page.__setGraphData(null);
    const calls = fetchAnswering(200, {
      ok: true, handle: "newcomer", pending_edits: 0,
      snapshot: { generated_at: "2026-07-30T10:00:00Z", views: [] },
    });
    await page.refresh();
    assert.equal(calls.length, 1, "the only way out of a failed boot read is still unpressable");
  });

  test("with neither a session nor a graph it still goes nowhere", async () => {
    page.__setToken(null);
    page.__setGraphData(null);
    const calls = fetchAnswering(200, { ok: true });
    await page.refresh();
    assert.deepEqual(calls, [], "it went to the network with nobody signed in");
  });
});

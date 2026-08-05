/**
 * AN OPERATION COMPLETES — the three real operation paths `design-the-two-rules.md` §3 pins
 * (items 4, 11, 14), and the proof each now reaches a bounded, acting terminal state.
 *
 *   node --test tests/app-operation-completes.test.mjs
 *
 * ── WHAT §3 SAYS IS REAL, AND WHAT IS NOT THIS SUITE'S ──
 *
 * §3's table marks four rows REAL. Item 13 (`openLine`'s decline) is REAL but classified CASCADE —
 * `design-the-two-rules.md` §2.1, THE CASCADE TERMINATES, a config-completeness fix, explicitly out
 * of scope for this change (a `config/` edit ships separately, with a deploy). The three left are
 * OPERATION cases and are this suite's whole subject:
 *
 *   ITEM  4 — `collect()`, a pickup's bounded retries exhausted with no action taken.
 *   ITEM 11 — `commitLine`'s 409 branch, a refusal with real typed text at stake, where
 *             `healFromRefusal` cannot safely adopt the server's file.
 *   ITEM 14 — a failed boot read, with no automatic retry before "unreadable".
 *
 * Item 15 (`refresh()`'s own failure) is named in §3 and judged NOT REAL "on balance" — the ACT
 * half of the rule (unchanged screen = last-known-good) is trivially satisfied there already; only
 * the AUTOMATIC-RETRY half is missing, and §3's own caveat says so plainly rather than silently
 * either way. This suite does not touch `refresh()` and takes §3's own resolution rather than the
 * PR summary that first counted it as real.
 *
 * ── SECTIONS ──
 *
 *   1. `WriteRegister.concludeGiveUp` IN ISOLATION — the terminal act, named, and its four shapes.
 *   2. ITEM 11, THROUGH THE REAL PAGE — the characters and the row's editability, driven, plus a
 *      MUTATION PROOF that the register only closes because the new call is there.
 *   3. ITEM 4, THROUGH THE REAL PAGE — same two proofs, for the pickup-exhausted branch.
 *   4. ITEM 14, THROUGH THE REAL PAGE — `bootRead`'s bound, its 401 short-circuit, and a call count
 *      proving the retries actually happened rather than merely that the final state was reached.
 *   5. THE PERCEPTION RULE — structural proof that none of the three new code paths touches the
 *      DOM at all, plus a behavioural proof that a boot mid-retry looks identical to a boot that
 *      has not started.
 *
 * ── WHAT THIS SUITE DOES NOT VERIFY ──
 *
 * NO BROWSER WAS OPENED. `tests/fixtures/app-html-page.mjs` lifts `app/index.html`'s real module
 * script and runs it against a stubbed DOM and a stubbed `fetch`, the same posture as
 * `tests/app-write-correlation.test.mjs`. No graph server, no passkey session, no engine cycle, no
 * real POST.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  importPage,
  installBrowser,
  makeEvent,
  makeWorkDir,
  walk,
  withDeclaration,
  assertMutated,
  REPO,
} from "./fixtures/app-html-page.mjs";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const APP_SOURCE = readFileSync(join(REPO, "app", "index.html"), "utf8");

const { WriteRegister } = await import(join(REPO, "dist", "present.js"));

const PATH = "this_week.md";
const settle = () => new Promise((r) => setImmediate(r));

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. WriteRegister.concludeGiveUp — IN ISOLATION
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. WriteRegister.concludeGiveUp — the terminal act, named, where giveUp only forgot", () => {
  test("an open token concludes 'return-to-row', and is closed by it", () => {
    const register = new WriteRegister();
    register.open("w1-a", PATH);
    assert.equal(register.concludeGiveUp("w1-a"), "return-to-row");
    assert.equal(register.waiting("w1-a"), false);
  });

  test("a token this register never opened concludes nothing — there is nothing to act on", () => {
    const register = new WriteRegister();
    assert.equal(register.concludeGiveUp("w1-never-opened"), null);
  });

  test("concluding twice concludes once — the second call has nothing left to close", () => {
    const register = new WriteRegister();
    register.open("w1-a", PATH);
    assert.equal(register.concludeGiveUp("w1-a"), "return-to-row");
    assert.equal(register.concludeGiveUp("w1-a"), null, "a second conclusion invented a second act");
  });

  test("a token an echo already matched has nothing left for concludeGiveUp to close", () => {
    const register = new WriteRegister();
    register.open("w1-a", PATH);
    register.arrive(new Map([[PATH, ["w1-a"]]]));
    assert.equal(register.waiting("w1-a"), false, "setup: the echo did not match");
    assert.equal(register.concludeGiveUp("w1-a"), null, "a matched token was concluded a second time");
  });

  test("giveUp is untouched — toggleTask's own 409 branch still gets a plain boolean", () => {
    const register = new WriteRegister();
    register.open("w1-a", PATH);
    assert.equal(register.giveUp("w1-a"), true);
    assert.equal(register.giveUp("w1-a"), false, "giving up twice must not report twice");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. ITEM 11 — commitLine's 409 branch, real text at stake, heal unsafe
// ══════════════════════════════════════════════════════════════════════════════════════════════

const BARE = ["# This Week", "", "## Overdue", "- [ ] Ring the dentist", ""].join("\n");
const TYPED = "- [ ] Ring the dentist #work";
// THE SERVER'S ANSWER TO THE 409, FOR THIS SUITE'S OWN SCENARIO — the SAME line the operator
// edited, changed server-side, so `rebaseLineEdit` (rebase.ts, `feat/a-refusal-rebases`) declines
// rather than silently reapplying his edit over it. Before that module existed this suite used
// `control.current = BARE` (nothing changed at all) to reach "return-to-row"; that scenario is now
// a WIN (`tests/app-refusal-rebases.test.mjs` drives it) and no longer belongs to a suite whose own
// name is the give-up act, so this fixture was narrowed to the case that still gives up.
const SERVER_MOVED = BARE.replace("- [ ] Ring the dentist", "- [ ] Ring the dentist #urgent");

/** A page stood up with a fetch stub that refuses the NEXT write with a 409, then answers normally. */
async function standUp409Page(workDir, mutate) {
  const browser = installBrowser();
  const control = { refuseNext: false, current: null, posted: [] };
  const stub = async (url, init) => {
    const body = JSON.parse(init.body);
    control.posted.push(body);
    if (control.refuseNext) {
      control.refuseNext = false;
      return {
        ok: false,
        status: 409,
        json: async () => ({ ok: false, refused: "stale-base", path: PATH, current: control.current }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        handle: "luke",
        pending_edits: 0,
        snapshot: {
          generated_at: "2026-08-05T09:00:00Z",
          views: [{ id: "this-week", path: PATH, title: "This Week", domain: "work", markdown: body.markdown }],
        },
      }),
    };
  };
  globalThis.fetch = withDeclaration(stub);
  const page = await importPage(workDir, mutate);
  page.__setToken("session");
  return { page, browser, control };
}

/** Land BARE, click the dentist row, type TYPED over it, and blur — refusing this one write with a 409. */
async function drive409GiveUp(d) {
  const { page, browser, control } = d;
  const view = { id: "this-week", path: PATH, title: "This Week", domain: "work", markdown: BARE };
  page.__setGraphData({
    ok: true,
    handle: "luke",
    pending_edits: 0,
    snapshot: { generated_at: "2026-08-05T09:00:00Z", views: [view] },
  });
  page.__setCurrentViewId("this-week");
  page.paintView("this-week");
  page.__setFocus(3, BARE);
  const row = () => walk(browser.elements.get("viewBody")).find((el) => el.tagName === "span" && el.innerHTML !== "");
  const input = () => walk(browser.elements.get("viewBody")).find((el) => el.type === "text");
  row().dispatch("click", makeEvent());
  page.__enterInsert();
  input().value = TYPED;
  control.refuseNext = true;
  control.current = SERVER_MOVED;
  input().dispatch("blur");
  await settle();
  return { row, input };
}

describe("2. ITEM 11 — a 409 with real text at stake reaches 'return-to-row'", () => {
  test("DRIVEN: the characters are still on screen and the row is still editable afterward", async () => {
    const d = await standUp409Page(makeWorkDir("op-completes-409-value"));
    await drive409GiveUp(d);

    // THE VALUE: the row RowStore holds is exactly what he typed, not the server's stale BARE line.
    const held = d.page.__rows().rowAt(3);
    assert.ok(held, "the row at line 3 did not survive the refusal");
    assert.equal(held.text, TYPED, "the operator's characters were not handed back to the row");

    // THE REGISTER: the write's own token is closed — a defined terminal state, not a lingering one.
    const posted = d.control.posted[d.control.posted.length - 1];
    assert.match(posted.token, /^w1-[0-9a-f]{32}$/, "the refused write carried no token to conclude");
    assert.equal(d.page.__writes().waiting(posted.token), false, "the token was left open after the give-up");

    // STILL SETTLED, NOT LEFT OPEN: not repainting on a 409 means the optimistic settle already
    // took the row back to NORMAL (paint.ts's own settle() always repaints before commitLine's
    // write is even sent) — there is no leftover `<input>` from the write that failed.
    const openInputs = walk(d.browser.elements.get("viewBody")).filter((el) => el.type === "text");
    assert.equal(openInputs.length, 0, "a 409 left the row's <input> open — it did not settle");

    // STILL EDITABLE: re-enter the row (through the same focus/insert path every real keystroke
    // uses, `research-the-store.md` §5's PULL discipline — nothing here is found by re-reading
    // rendered markup, which a real tag/placement can reshape) and the input starts from the
    // preserved text, not BARE's.
    d.page.__setFocus(3, d.page.__rows().source);
    d.page.__enterInsert();
    const reopened = walk(d.browser.elements.get("viewBody")).find((el) => el.type === "text");
    assert.ok(reopened, "the row could not be re-entered — it is no longer editable");
    assert.equal(reopened.value, TYPED, "re-entering the row did not start from the operator's own characters");
  });

  test("MUTATION PROOF: without the new call, the token is never concluded — the fix is what closes it", async () => {
    // THREE call sites now read `writes.concludeGiveUp(token);` verbatim (the empty-text heal, the
    // landed-rebase handoff, and this test's own branch — no safe rebase, `rebase.ts` §"the-refusal-
    // rebases"), so the bare literal is no longer unique. This scenario (SERVER_MOVED) always takes
    // the "no rebase was possible" branch, so the mutation targets that block by its own comment.
    const mutate = (source) =>
      assertMutated(
        source,
        "      // NO REBASE WAS POSSIBLE — refused, not guessed (`rebase?.reason`, unread here: THE\n" +
          "      // PERCEPTION RULE governs, and nothing on screen may say why). BOUND: ZERO further retries.\n" +
          "      if (token !== null) {\n" +
          "        writes.concludeGiveUp(token);\n" +
          "      }",
        "      if (token !== null) {\n" +
          "        /* MUTATED FOR THE TEST: not called */ void 0;\n" +
          "      }",
      );
    const d = await standUp409Page(makeWorkDir("op-completes-409-mutant"), mutate);
    await drive409GiveUp(d);

    // The value claim (characters survive) is UNCHANGED by this mutation — it does not depend on
    // the register call at all, which is the honest reason §1's "hand back to the row" needed no
    // new RowStore code (see correlation.ts's own header). What the mutation isolates is the
    // register's OWN completion.
    const held = d.page.__rows().rowAt(3);
    assert.equal(held?.text, TYPED, "the mutation broke content preservation, which it must not");

    const posted = d.control.posted[d.control.posted.length - 1];
    assert.equal(
      d.page.__writes().waiting(posted.token),
      true,
      "the token closed WITHOUT the new call — this proof does not isolate what it claims to",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. ITEM 4 — collect(), a pickup's bounded retries exhausted
// ══════════════════════════════════════════════════════════════════════════════════════════════

async function standUpPickupPage(workDir, mutate) {
  const browser = installBrowser();
  const control = { calls: 0 };
  const stub = async () => {
    control.calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        handle: "luke",
        pending_edits: 0,
        // NO `writes` KEY — the echo never names the token, so `writes.waiting` stays true across
        // every attempt and the pickup can only end by exhausting, never by matching.
        snapshot: { generated_at: "2026-08-05T09:00:10Z", views: [] },
      }),
    };
  };
  globalThis.fetch = withDeclaration(stub);
  const page = await importPage(workDir, mutate);
  page.__setToken("session");
  return { page, browser, control };
}

/**
 * Drive a pickup through PickupSchedule's own bound (3 attempts) WITHOUT real timers — the first
 * two rounds go straight through `pickups.attempt`/`answered` (bypassing `collect`'s own fetch and
 * `armPickup`'s real `setTimeout`, which would otherwise leave a live timer past the test's own
 * life); the THIRD, exhausting round runs through the real `__collect`, which is the function under
 * test.
 */
async function exhaustPickup(d, token) {
  const { page } = d;
  page.__writes().open(token, PATH);
  const pickups = page.__pickups();
  pickups.schedule(PATH, token, null, []);
  pickups.attempt(PATH);
  pickups.answered(PATH, false);
  pickups.attempt(PATH);
  pickups.answered(PATH, false);
  assert.equal(page.__writes().waiting(token), true, "setup: the token closed before exhaustion");
  await page.__collect(PATH);
}

describe("3. ITEM 4 — a pickup's bounded retries exhausted reaches a concluded token", () => {
  test("DRIVEN: the third, exhausting attempt concludes the token — no fourth read is armed", async () => {
    const token = "w1-pickup-exhaust-0000000000000000000000000000";
    const d = await standUpPickupPage(makeWorkDir("op-completes-pickup-value"));
    await exhaustPickup(d, token);

    assert.equal(d.control.calls, 1, "__collect made more than the one real fetch this test drove");
    assert.equal(d.page.__writes().waiting(token), false, "exhaustion left the token open — the silent gap is back");
    assert.equal(d.page.__pickups().waiting(PATH), false, "the pickup itself was not dropped on exhaustion");
  });

  test("MUTATION PROOF: without the new call, exhaustion leaves the token open forever", async () => {
    const mutate = (source) =>
      assertMutated(
        source,
        "writes.concludeGiveUp(going.token);",
        "/* MUTATED FOR THE TEST: not called */ void 0;",
      );
    const token = "w1-pickup-exhaust-1111111111111111111111111111";
    const d = await standUpPickupPage(makeWorkDir("op-completes-pickup-mutant"), mutate);
    await exhaustPickup(d, token);

    assert.equal(
      d.page.__writes().waiting(token),
      true,
      "the token closed WITHOUT the new call — this proof does not isolate what it claims to",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. ITEM 14 — bootRead, a bounded retry before "unreadable"
// ══════════════════════════════════════════════════════════════════════════════════════════════

function graphOk(views = []) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      handle: "luke",
      pending_edits: 0,
      snapshot: { generated_at: "2026-08-05T09:00:00Z", views },
    }),
  };
}

function graphFail(status) {
  return { ok: false, status, json: async () => ({ ok: false }) };
}

describe("4. ITEM 14 — bootRead retries a failed read, bounded, before giving up", () => {
  test("a read that fails once then succeeds needs no more than the bound", async () => {
    let calls = 0;
    globalThis.fetch = withDeclaration(async (url) => {
      if (!String(url).includes("/app/graph")) throw new Error("unexpected url " + url);
      calls += 1;
      return calls <= 2 ? graphFail(500) : graphOk([{ id: "this-week", path: PATH, title: "T", domain: "work", markdown: "# hi\n" }]);
    });
    const page = await importPage(makeWorkDir("op-completes-boot-recovers"));
    page.__setToken("session");

    await page.bootRead([0, 0]);
    assert.equal(calls, 3, "did not retry the graph read the number of times the bound allows");
    assert.equal(page.__currentViewId(), "this-week", "the boot read never actually landed on a view");
  });

  test("a read that never succeeds is retried exactly the bound, then re-thrown", async () => {
    let calls = 0;
    globalThis.fetch = withDeclaration(async (url) => {
      if (!String(url).includes("/app/graph")) throw new Error("unexpected url " + url);
      calls += 1;
      return graphFail(503);
    });
    const page = await importPage(makeWorkDir("op-completes-boot-gives-up"));
    page.__setToken("session");

    await assert.rejects(() => page.bootRead([0, 0]), /request failed \(503\)/);
    assert.equal(calls, 3, "1 + BOOT_READ_DELAYS.length attempts were not all made");
  });

  test("a 401 is never retried — the session is gone, not the network", async () => {
    let calls = 0;
    globalThis.fetch = withDeclaration(async (url) => {
      if (!String(url).includes("/app/graph")) throw new Error("unexpected url " + url);
      calls += 1;
      return graphFail(401);
    });
    const page = await importPage(makeWorkDir("op-completes-boot-401"));
    page.__setToken("session");

    const thrown = await page.bootRead([0, 0]).then(
      () => null,
      (e) => e,
    );
    assert.equal(thrown?.status, 401);
    assert.equal(calls, 1, "a 401 was retried — it should have ended the series on the first attempt");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE PERCEPTION RULE — no in-flight state reaches the screen
// ══════════════════════════════════════════════════════════════════════════════════════════════

const codeOf = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const CODE = codeOf(APP_SOURCE);
const DOM_MUTATORS = /document\.|\$\(|\.textContent\s*=|\.innerHTML\s*=|\.setAttribute\(|\.classList\.|aria-busy/;

describe("5. THE PERCEPTION RULE — structural: none of the three new code paths touches the DOM", () => {
  test("bootRead is DOM-free — enterGraph (unchanged) is the only thing it calls that can touch the screen", () => {
    const fn = /async function bootRead\([\s\S]*?\n}\n/.exec(CODE)?.[0] ?? "";
    assert.ok(fn, "bootRead not found in the page source");
    // enterGraph( is the one call this function makes that reaches the DOM, and it is unchanged by
    // this branch — everything ELSE in the function body (the loop, the catch, the sleep) must not
    // independently reach it.
    const withoutTheOneKnownCall = fn.replace(/await enterGraph\(\);/, "");
    assert.doesNotMatch(withoutTheOneKnownCall, DOM_MUTATORS, "bootRead's own retry loop touches the DOM");
  });

  test("the pickup-exhausted terminal act touches no DOM", () => {
    const block = /\} else if \(next\.outcome === "exhausted"\) \{[\s\S]*?\n  \}\n\}/.exec(CODE)?.[0] ?? "";
    assert.ok(block, "the exhausted branch was not found");
    assert.doesNotMatch(block, DOM_MUTATORS, "the pickup-exhausted terminal act touches the DOM");
  });

  test("commitLine's return-to-row branch touches no DOM beyond healFromRefusal (unchanged, and gated on empty text)", () => {
    const block = /if \(e\?\.status === 409\) \{[\s\S]*?\n      return;\n    \}/.exec(CODE)?.[0] ?? "";
    assert.ok(block, "the 409 branch was not found");
    const withoutTheOneKnownCall = block.replace(/healFromRefusal\(view\.path, e\.current\);/, "");
    assert.doesNotMatch(withoutTheOneKnownCall, DOM_MUTATORS, "the give-up branch touches the DOM");
  });
});

describe("5b. THE PERCEPTION RULE — behavioural: a boot mid-retry looks identical to the attempt before it", () => {
  test("nothing NEW becomes visible between a failed attempt and the retry that follows it", async () => {
    // `enterGraph()` itself reveals `#graph` (unchanged by this branch) BEFORE its own read even
    // starts — see `bootRead`'s own header. That single, legitimate reveal happens once, on the
    // FIRST attempt, and is not what this test is about: comparing against the very start of boot
    // would fail on that pre-existing behaviour and prove nothing about the RETRY this change adds.
    // What has to hold is narrower and exactly what THE PERCEPTION RULE requires: nothing further
    // becomes visible BETWEEN one failed attempt and the next one starting — gated explicitly, on
    // two deferred promises this test controls, rather than raced against real timers.
    let calls = 0;
    let releaseFirst;
    let releaseSecond;
    const firstGate = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const secondGate = new Promise((resolve) => {
      releaseSecond = resolve;
    });
    const browser = installBrowser();
    globalThis.fetch = withDeclaration(async (url) => {
      if (!String(url).includes("/app/graph")) throw new Error("unexpected url " + url);
      calls += 1;
      if (calls === 1) {
        await firstGate;
        return graphFail(500);
      }
      await secondGate;
      return graphOk([{ id: "this-week", path: PATH, title: "T", domain: "work", markdown: "# hi\n" }]);
    });
    const page = await importPage(makeWorkDir("op-completes-boot-perception"));
    page.__setToken("session");

    const snapshot = () => ({
      emptyHead: browser.document.getElementById("emptyHead").textContent,
      emptyBody: browser.document.getElementById("emptyBody").textContent,
      graphHidden: browser.document.getElementById("graph").className.includes("hidden"),
      currentViewId: page.__currentViewId(),
    });
    const settleTicks = async () => {
      for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0));
    };

    const running = page.bootRead([0]);
    await settleTicks(); // enterGraph() has revealed #graph and is now blocked on firstGate.
    const duringFirstAttempt = snapshot();

    releaseFirst(); // the first attempt fails; bootRead retries with a 0ms delay.
    await settleTicks(); // the retried enterGraph() has run and is now blocked on secondGate.
    const duringSecondAttempt = snapshot();
    assert.deepEqual(duringSecondAttempt, duringFirstAttempt, "something became visible between the two attempts");

    releaseSecond();
    await running;
    const after = snapshot();
    assert.notDeepEqual(after, duringFirstAttempt, "the boot never reached its own final state either");
    assert.equal(after.currentViewId, "this-week", "bootRead's own success never actually landed on a view");
  });
});

/**
 * THE WRITE STOPS WAITING FOR THE CYCLE, AND ITS ANSWER IS COLLECTED SEPARATELY.
 *
 *   node --test tests/app-async-ack.test.mjs
 *
 * ── THE TWO ROWS, AND WHY THEY ARE ONE SUITE ──
 *
 * `the-projection-arrives-without-being-asked-for` (transport) and
 * `stop-awaiting-the-cycle-safely` (async). They are separable as capabilities and inseparable as
 * evidence: async is only safe BECAUSE the answer is collected afterwards, and the collection has no
 * reason to exist until the write stops carrying the answer itself.
 *
 * ── WHAT WAS TRUE BEFORE ──
 *
 * The complete set of things that install a projection was boot, the re-read button, and THE RETURN
 * OF A WRITE. All three are the browser asking, and the third is the only one that fires on an
 * ordinary gesture. `POST /app/edit-file` wrote the file and then awaited the ~10 s engine cycle, so
 * every checkbox and every line commit cost ten seconds of a screen that says "syncing…".
 *
 * ── WHAT IS PROVEN, AND IN WHICH SECTION ──
 *
 *   §1  THE SURFACES. `PickupSchedule` and `AcceptedSource` in isolation, out of dist/present.js —
 *       the artifact the browser loads. Bounded, coalesced per path, and never self-arming.
 *   §1c THE OWED SET. The schedule carries which lines a write is owed a stamp for, opaquely, and
 *       UNIONS it when a second write joins — the one thing it does not adopt.
 *   §1d THE BODY. What identifies a line before it has an id, and what deliberately does not.
 *   §1e `stampsOwed` AND `stampsLanded`. A tick owes nothing; a create owes one; stamped, moved and
 *       gone all land; still-unstamped does not.
 *   §2  THE WORKER. `ack: true` answers on the vault write and runs the cycle in `ctx.waitUntil`;
 *       three independent ways it falls back to the synchronous answer; and a refused or failed
 *       write is answered BEFORE the branch, so "accepted but not written" is not a state.
 *   §3  THE PAGE. A projection arrives with no gesture behind it and NO write in flight to carry it,
 *       and it lands THROUGH THE QUEUE — held when a line is open, installed when it settles.
 *   §3b THE STAMP. The 2026-08-03 drive rebuilt: a newer projection that left his line unstamped is
 *       NOT the answer. Plus the tick's unchanged cost, a line stamped in another view, and the
 *       bound that terminates on a line the engine never stamps.
 *   §4  IT IS NOT A POLL. No write, no read. The series ends and says so. It never re-arms itself.
 *   §5  MUTATION PROOFS. Break the collection, the acceptance, and BOTH places the stamp test lives;
 *       watch the guards go red.
 *
 * ── WHAT COSTS WHAT, AND THE ONE NUMBER THAT DECIDED THE MECHANISM ──
 *
 * The graph server is a Fly machine with `auto_stop_machines = "stop"` and `min_machines_running =
 * 0`. It sleeps when idle and a cold wake is 4,278 ms of a dedicated core the operator pays for. A
 * browser timer that re-read every N seconds would wake it every N seconds for as long as a tab is
 * open — at 30 s, 2,880 wakes a day of a machine nobody is using. §4 is the guard on that: nothing
 * is read except after a write HE made.
 *
 * ── WHAT THIS SUITE DOES NOT VERIFY ──
 *
 * NO BROWSER WAS OPENED. No passkey session, no live graph server, no engine cycle, no real POST,
 * and no run against the deployed Worker. The DOM is `installBrowser`'s stub, the graph server is a
 * fixture, and `ctx.waitUntil` is a recorder. NOTHING HERE MEASURES LATENCY: the ~10 s -> ~250 ms
 * this change is for is a claim about a network none of these arms touches. What is measured is the
 * SHAPE — which requests are made, in which order, carrying what, and what the page does with the
 * answers.
 */

import { test, describe, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { handleApp } from "../worker/src/app.js";
import {
  assertMutated,
  importPage,
  installBrowser,
  makeEvent,
  makeWorkDir,
  walk,
  REPO,
} from "./fixtures/app-html-page.mjs";

const PATH = "work/outcomes.md";

/** A `since` for arms that are not about the clock — the schedule holds it opaquely either way. */
const T_ANY = "2026-08-01T09:00:00.000Z";

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SURFACES — app/present/pickup.ts and app/present/accepted.ts, out of the shipped bundle
// ══════════════════════════════════════════════════════════════════════════════════════════════

let PickupSchedule;
let PICKUP_DELAYS;
let OWED_LIMIT;
let AcceptedSource;
let lineBody;
let stampsOwed;
let stampsLanded;
before(async () => {
  ({ PickupSchedule, PICKUP_DELAYS, OWED_LIMIT, AcceptedSource, lineBody, stampsOwed, stampsLanded } =
    await import(join(REPO, "dist", "present.js")));
});

describe("1. THE SCHEDULE — bounded, caused, one per path", () => {
  test("a write places a read, and the first wait is the measured cycle", () => {
    const s = new PickupSchedule();
    assert.deepEqual(s.schedule(PATH, "w1-a"), { outcome: "scheduled", delayMs: PICKUP_DELAYS[0], attempt: 0 });
    assert.equal(s.waiting(PATH), true);
    assert.equal(s.size, 1);
  });

  test("A SECOND WRITE JOINS THE FIRST'S READ — one timer per path, never two", () => {
    // Two timers for one file would fetch the same envelope twice. The newer write's token is
    // ADOPTED, because a projection naming it was necessarily generated after the older one landed.
    const s = new PickupSchedule();
    s.schedule(PATH, "w1-a");
    assert.deepEqual(s.schedule(PATH, "w1-b"), { outcome: "joined", attempt: 0 });
    assert.equal(s.size, 1);
    assert.equal(s.attempt(PATH).token, "w1-b", "the newer write's answer is not the one being waited for");
  });

  test("IT CARRIES THE STAMP THE PAGE HELD WHEN THE WRITE LEFT, and hands it back at attempt time", () => {
    // The second half of what a pickup is waiting for. See this module's header: the echo says the
    // server RECORDED the write, which is not the same claim as "the cycle has answered it", and
    // the page cannot tell them apart without knowing what it already had.
    const s = new PickupSchedule();
    s.schedule(PATH, "w1-a", "2026-08-01T09:00:00.000Z");
    assert.equal(s.since(PATH), "2026-08-01T09:00:00.000Z");
    assert.deepEqual(s.attempt(PATH), {
      outcome: "read",
      attempt: 1,
      token: "w1-a",
      since: "2026-08-01T09:00:00.000Z",
      owed: [],
    });
  });

  test("AND THE STAMP IS ADOPTED WITH THE TOKEN when a second write joins — they are one write", () => {
    // Keeping the older write's stamp would let a projection generated BETWEEN the two writes
    // satisfy a pickup that is waiting for the later one's cycle.
    const s = new PickupSchedule();
    s.schedule(PATH, "w1-a", "2026-08-01T09:00:00.000Z");
    s.schedule(PATH, "w1-b", "2026-08-01T09:00:07.000Z");
    assert.equal(s.since(PATH), "2026-08-01T09:00:07.000Z");
    assert.equal(s.attempt(PATH).token, "w1-b");
  });

  test("A WRITE FROM A PAGE HOLDING NO PROJECTION CARRIES NO STAMP — `null`, never invented", () => {
    const s = new PickupSchedule();
    s.schedule(PATH, "w1-a");
    assert.equal(s.since(PATH), null);
    assert.equal(s.attempt(PATH).since, null);
    assert.equal(s.since("never-scheduled.md"), null);
  });

  test("TWO PATHS ARE TWO PICKUPS — the coalescing is per file, not global", () => {
    const s = new PickupSchedule();
    s.schedule(PATH, "w1-a");
    assert.equal(s.schedule("other.md", "w1-b").outcome, "scheduled");
    assert.equal(s.size, 2);
  });

  test("THE SERIES IS BOUNDED — three attempts, then EXHAUSTED, and the record is dropped", () => {
    const s = new PickupSchedule();
    assert.equal(s.attempts, 3);
    s.schedule(PATH, "w1-a");
    for (let i = 1; i < PICKUP_DELAYS.length; i += 1) {
      assert.equal(s.attempt(PATH).attempt, i);
      assert.deepEqual(s.answered(PATH, false), {
        outcome: "again",
        delayMs: PICKUP_DELAYS[i],
        attempt: i,
      });
    }
    assert.equal(s.attempt(PATH).attempt, PICKUP_DELAYS.length);
    assert.deepEqual(s.answered(PATH, false), { outcome: "exhausted" });
    // NOTHING RE-ARMS ON ITS OWN. This is the whole difference between a pickup and a poll: the
    // record is gone, `attempt` answers `cancelled`, and only a new write can place another read.
    assert.equal(s.waiting(PATH), false);
    assert.deepEqual(s.attempt(PATH), { outcome: "cancelled" });
  });

  test("AN ANSWERED PICKUP STOPS AT ONCE — satisfaction is told, not inferred", () => {
    const s = new PickupSchedule();
    s.schedule(PATH, "w1-a");
    s.attempt(PATH);
    assert.deepEqual(s.answered(PATH, true), { outcome: "done" });
    assert.equal(s.size, 0);
  });

  test("A TIMER THAT FIRES AFTER `clear` READS NOTHING AND FETCHES NOTHING", () => {
    // `clear` cannot stop a `setTimeout` already counting — sign-out calls it — so the schedule has
    // to be the thing that refuses, and `cancelled` is that refusal.
    const s = new PickupSchedule();
    s.schedule(PATH, "w1-a");
    s.clear();
    assert.deepEqual(s.attempt(PATH), { outcome: "cancelled" });
    assert.deepEqual(s.answered(PATH, false), { outcome: "done" });
  });

  test("THE BOUND CANNOT BE LENGTHENED FROM OUTSIDE", () => {
    const delays = [5, 5];
    const s = new PickupSchedule(delays);
    delays.push(5, 5, 5);
    assert.equal(s.attempts, 2, "the schedule kept a reference to the caller's array");
  });
});

describe("1c. THE SCHEDULE CARRIES WHICH LINES ARE OWED A STAMP", () => {
  test("it holds the owed bodies opaquely and hands them back at attempt time", () => {
    const s = new PickupSchedule();
    s.schedule(PATH, "w1-a", T_ANY, ["zzTEST stamp watch #task #personal"]);
    assert.deepEqual(s.owed(PATH), ["zzTEST stamp watch #task #personal"]);
    assert.deepEqual(s.attempt(PATH).owed, ["zzTEST stamp watch #task #personal"]);
  });

  test("A WRITE THAT INTRODUCED NOTHING OWES NOTHING — the default, and the checkbox's whole case", () => {
    const s = new PickupSchedule();
    s.schedule(PATH, "w1-a", T_ANY);
    assert.deepEqual(s.owed(PATH), []);
    assert.deepEqual(s.owed("never-scheduled.md"), []);
  });

  test("A SECOND WRITE JOINING UNIONS THE OWED SET — it does NOT replace it, unlike the token", () => {
    // THE ONE ASYMMETRY IN `schedule`. `token` and `since` describe ONE write and the newest one's
    // are what is worth waiting on. A stamp is not like that: a stamp owed to the FIRST write is
    // still owed after the second, and the second write's own `before` is the first write's posted
    // file — so that line no longer looks introduced and would never be computed again. Replacing
    // would silently drop it, and Enter-Enter is exactly two creates inside one cycle.
    const s = new PickupSchedule();
    s.schedule(PATH, "w1-a", T_ANY, ["first line"]);
    s.schedule(PATH, "w1-b", T_ANY, ["second line"]);
    assert.deepEqual(s.owed(PATH).sort(), ["first line", "second line"]);
    assert.equal(s.attempt(PATH).token, "w1-b", "the token was unioned instead of adopted");
  });

  test("AND IT IS CAPPED, OLDEST OUT — a backstop, and it fails toward ending sooner", () => {
    const s = new PickupSchedule();
    for (let i = 0; i < OWED_LIMIT + 4; i += 1) {
      s.schedule(PATH, "w1-a", T_ANY, [`line ${i}`]);
    }
    const owed = s.owed(PATH);
    assert.equal(owed.length, OWED_LIMIT, `the owed set grew to ${owed.length}`);
    assert.equal(owed.at(-1), `line ${OWED_LIMIT + 3}`, "the newest write's line was dropped");
    assert.ok(!owed.includes("line 0"), "the oldest line survived the cap");
  });

  test("THE OWED SET CANNOT BE CHANGED FROM OUTSIDE — the caller's array is copied both ways", () => {
    const s = new PickupSchedule();
    const mine = ["one"];
    s.schedule(PATH, "w1-a", T_ANY, mine);
    mine.push("smuggled");
    assert.deepEqual(s.owed(PATH), ["one"], "the schedule shares the caller's array");
    s.owed(PATH).push("smuggled");
    assert.deepEqual(s.owed(PATH), ["one"], "the reader hands out the live array");
  });
});

describe("1d. THE BODY — what identifies a line before it has an id", () => {
  test("THE STAMP COMES OFF, WHICH IS THE WHOLE POINT — one line, stamped and not, is one body", () => {
    // If these two reduced differently, the arrival in which the engine finally stamped the line
    // would read as a different line entirely, and the pickup could never recognise its answer.
    assert.equal(
      lineBody("- [ ] zzTEST stamp watch #task #personal [[qntm:2697]]"),
      lineBody("- [ ] zzTEST stamp watch #task #personal"),
    );
  });

  test("AND SO DO THE INDENT, THE MARKER AND THE DOUBLED SPACE — each is a thing the cycle does", () => {
    const plain = lineBody("- [ ] Draft the launch note #task");
    assert.equal(lineBody("      - [ ] Draft  the   launch note #task"), plain, "re-nesting broke the body");
    assert.equal(lineBody("- [x] Draft the launch note #task"), plain, "a resolved checkbox broke the body");
    assert.equal(lineBody("* Draft the launch note #task"), plain, "a changed bullet broke the body");
  });

  test("AND NOTHING ELSE DOES — a reworded line is a DIFFERENT line, and this must not pretend otherwise", () => {
    // A line's characters are a content hash, not an identity (`instance.ts` says so for the same
    // reason). Every further loosening buys recognition of a line the engine reworded at the price
    // of confusing two lines the operator WROTE, and this module's whole job is to say MY line.
    assert.notEqual(lineBody("- [ ] Ring the dentist #task"), lineBody("- [ ] Ring the dentist #outcome"));
    assert.notEqual(lineBody("- [ ] Ring the dentist #task"), lineBody("- [ ] ring the dentist #task"));
  });

  test("A LINE WITH NO BODY REDUCES TO `\"\"` — the one match that would match everything", () => {
    for (const nothing of ["", "   ", "- [ ]", "- ", "> "]) {
      assert.equal(lineBody(nothing), "", `\`${nothing}\` produced a body`);
    }
  });
});

describe("1e. WHAT A WRITE IS OWED, AND WHETHER IT LANDED", () => {
  const BEFORE = ["# This Week", "", "- [ ] Ring the dentist [[qntm:122]] #task", ""].join("\n");

  test("A CHECKBOX TICK OWES NOTHING — the line it changed already had its id", () => {
    const ticked = BEFORE.replace("- [ ]", "- [x]");
    assert.deepEqual(stampsOwed(BEFORE, ticked), [], "a tick was made to wait for a stamp");
  });

  test("AN EDIT TO A STAMPED LINE OWES NOTHING EITHER — the stamp travels with the body", () => {
    const edited = BEFORE.replace("Ring the dentist", "Ring the dentist BEFORE FRIDAY");
    assert.deepEqual(stampsOwed(BEFORE, edited), []);
  });

  test("A CREATE OWES EXACTLY ONE — and it is the body of the line he typed", () => {
    const created = `${BEFORE}- [ ] zzTEST stamp watch #task #personal\n`;
    assert.deepEqual(stampsOwed(BEFORE, created), ["zzTEST stamp watch #task #personal"]);
  });

  test("A BODY THE FILE ALREADY HELD UNSTAMPED IS NOT OWED — one bad line must not poison every write", () => {
    // If it were owed, an unstampable line already in the file would make EVERY later write to that
    // file run to the bound, forever.
    const withProse = `${BEFORE}Some prose the engine will never stamp\n`;
    const created = `${withProse}- [ ] zzTEST stamp watch #task #personal\n`;
    assert.deepEqual(stampsOwed(withProse, created), ["zzTEST stamp watch #task #personal"]);
  });

  test("A NEW LINE THAT ARRIVED ALREADY STAMPED OWES NOTHING", () => {
    const created = `${BEFORE}- [ ] Water the plants [[qntm:123]] #task\n`;
    assert.deepEqual(stampsOwed(BEFORE, created), []);
  });

  test("AND WITH NO `before` AT ALL, NOTHING IS PRESUMED SETTLED — the fail-safe direction", () => {
    assert.deepEqual(stampsOwed(null, "- [ ] one line\n"), ["one line"]);
  });

  test("OWING NOTHING LANDS AT ONCE — the condition falls back to the two facts that were there", () => {
    assert.equal(stampsLanded([], []), true);
    assert.equal(stampsLanded([], ["- [ ] anything at all"]), true);
  });

  test("STILL UNSTAMPED IS STILL OWED — the live defect, at the value level", () => {
    const owed = ["zzTEST stamp watch #task #personal"];
    assert.equal(stampsLanded(owed, ["- [ ] zzTEST stamp watch #task #personal"]), false);
  });

  test("STAMPED IS LANDED — the answer this exists to wait for", () => {
    const owed = ["zzTEST stamp watch #task #personal"];
    assert.equal(stampsLanded(owed, ["- [ ] zzTEST stamp watch #task #personal [[qntm:2697]]"]), true);
  });

  test("AND STAMPED IN ANOTHER VIEW IS LANDED TOO — the engine moves lines between views", () => {
    // Nothing positional may enter this comparison. A line that left `this_week.md` for
    // `outcomes.md` is still the line he wrote, and narrowing the search to the path the write went
    // to would report it as gone.
    const owed = ["zzTEST stamp watch #task #personal"];
    const elsewhere = ["# This Week\n", "# Outcomes\n  - [x] zzTEST stamp watch #task #personal [[qntm:2697]]"];
    assert.equal(stampsLanded(owed, elsewhere), true);
  });

  test("AND GONE IS LANDED — the vault held his bytes before the cycle ran, so absence is a DECISION", () => {
    // `POST /vault/file` wrote the operator's line verbatim BEFORE the cycle ran, so a projection
    // generated after that write read a file containing it. If it is not there, the engine acted on
    // it — reworded, moved out of every published view, deleted — and no further stamp is coming.
    assert.equal(stampsLanded(["zzTEST stamp watch #task #personal"], ["# This Week\n- [ ] something else"]), true);
  });

  test("ONE UNSTAMPED BODY OUT OF TWO KEEPS THE WHOLE PICKUP WAITING", () => {
    const owed = ["first line", "second line"];
    assert.equal(stampsLanded(owed, ["- [ ] first line [[qntm:1]]\n- [ ] second line"]), false);
    assert.equal(stampsLanded(owed, ["- [ ] first line [[qntm:1]]\n- [ ] second line [[qntm:2]]"]), true);
  });
});

describe("1b. THE ACCEPTED SOURCE — one file, the server's own word, dropped by a projection", () => {
  test("it holds what was accepted, for that path and no other", () => {
    const a = new AcceptedSource();
    assert.equal(a.sourceFor(PATH), null);
    a.take(PATH, "- [x] one\n");
    assert.equal(a.sourceFor(PATH), "- [x] one\n");
    assert.equal(a.sourceFor("other.md"), null, "one file's acceptance answered for another");
  });

  test("a second take REPLACES the first — one file, the one on screen", () => {
    const a = new AcceptedSource();
    a.take(PATH, "one");
    a.take("other.md", "two");
    assert.equal(a.sourceFor(PATH), null);
    assert.equal(a.markdown, "two");
  });

  test("a projection for the path drops it; a projection for another does not", () => {
    const a = new AcceptedSource();
    a.take(PATH, "one");
    assert.equal(a.drop("other.md"), false);
    assert.equal(a.sourceFor(PATH), "one");
    assert.equal(a.drop(PATH), true);
    assert.equal(a.sourceFor(PATH), null);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE WORKER — worker/src/app.js, POST /app/edit-file with `ack: true`
// ══════════════════════════════════════════════════════════════════════════════════════════════

const OPERATOR_ID = "a19e4c66-af5d-4114-a928-d2c63b503374";
const OPERATOR_TOKEN = "session-token-operator";
const SESSIONS = { [OPERATOR_TOKEN]: { user_id: OPERATOR_ID, handle: "qntm" } };
const EDITED = "# This Week\n\n- [x] Draft the launch note [[qntm:121]] #task\n";

function makeDb() {
  const stmt = (sql, params = []) => ({
    bind: (...args) => stmt(sql, args),
    first: async () => {
      if (sql.includes("FROM sessions s JOIN users u")) return SESSIONS[params[0]] || null;
      if (sql.includes("COUNT(*) AS n FROM graph_edits")) return { n: 0 };
      throw new Error(`unstubbed first(): ${sql}`);
    },
    all: async () => {
      throw new Error(`unstubbed all(): ${sql}`);
    },
    run: async () => ({ success: true }),
  });
  return { prepare: (sql) => stmt(sql), batch: async () => [] };
}

const ENV = () => ({
  DB: makeDb(),
  GRAPH_SERVER_URL: "https://qntm-graph.fly.dev",
  SERVER_TOKEN: "server-token",
  GRAPH_USER_ID: OPERATOR_ID,
});

const CYCLE_ENVELOPE = {
  generated_at: "2026-08-01T09:00:00Z",
  views: [{ id: "this-week", path: PATH, title: "This Week", markdown: EDITED }],
  graph: {},
  locations: {},
};

const jsonResponse = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

describe("2. THE WORKER — the ack, and the three ways it is not taken", () => {
  const realFetch = globalThis.fetch;
  let calls;
  let vaultFileAnswer;
  /** Everything handed to `ctx.waitUntil`, so "the cycle runs behind the response" is observable. */
  let deferred;

  beforeEach(() => {
    calls = [];
    deferred = [];
    vaultFileAnswer = () => jsonResponse({ ok: true, path: PATH });
    globalThis.fetch = async (url, init = {}) => {
      const route = new URL(String(url)).pathname;
      calls.push({ route, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
      if (route === "/vault/file") return vaultFileAnswer();
      if (route === "/cycle") return jsonResponse({ ok: true, snapshot: CYCLE_ENVELOPE });
      throw new Error(`unstubbed fetch: ${url}`);
    };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  /** `ctx` present unless an arm asks for none — the runtime always hands one to a real Worker. */
  async function editFile(body, { withCtx = true } = {}) {
    const url = new URL("https://api.example/app/edit-file");
    const request = new Request(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const ctx = withCtx ? { waitUntil: (promise) => deferred.push(promise) } : undefined;
    const res = await handleApp(request, ENV(), url, "https://qntm.network", ctx);
    assert.ok(res, "handleApp did not route POST /app/edit-file");
    return { status: res.status, body: await res.json() };
  }

  const routes = () => calls.map((c) => `${c.method} ${c.route}`);

  test("`ack: true` ANSWERS ON THE VAULT WRITE — no cycle in the response's own path", async () => {
    const { status, body } = await editFile({ path: PATH, markdown: EDITED, ack: true });

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.accepted, true, "the answer does not say it left the projection out on purpose");
    assert.equal(body.path, PATH);
    // NO SNAPSHOT KEY AT ALL — absent, never null and never empty, for the same reason `base` and
    // `token` are absent when there is none. The page reads `!data.snapshot` as "no projection".
    assert.equal("snapshot" in body, false, "an ack carried an empty projection");
    // THE CYCLE IS STARTED AND NOT AWAITED, which is the distinction that costs the ten seconds.
    // `ctx.waitUntil(fetch(...))` sets the request going at once — that is the point, the engine
    // should be working while he reads — and hands the promise to the runtime so the Worker is kept
    // alive for it. What the RESPONSE does not do is wait for the answer, and the missing snapshot
    // is that fact stated where the browser can see it.
    assert.equal(deferred.length, 1, "the cycle was dropped, not deferred");
    await Promise.all(deferred);
  });

  test("AND THE CYCLE STILL RUNS — behind the response, on the promise `waitUntil` was given", async () => {
    await editFile({ path: PATH, markdown: EDITED, ack: true });

    assert.equal(deferred.length, 1, "the cycle was dropped, not deferred");
    const answered = await deferred[0];
    assert.equal(answered.ok, true, "the deferred work was not the cycle");
    assert.deepEqual(routes(), ["POST /vault/file", "POST /cycle"]);
  });

  test("AND THE WRITE ITSELF IS UNCHANGED — `ack` is the Worker's, and never reaches the vault", async () => {
    await editFile({ path: PATH, markdown: EDITED, base: "sha256-abc", token: "w1-a", ack: true });
    const written = calls.find((c) => c.route === "/vault/file").body;
    assert.deepEqual(Object.keys(written).sort(), ["base", "markdown", "path", "token"]);
    assert.equal("ack" in written, false, "the Worker's own instruction was forwarded to the graph server");
  });

  for (const [label, sent, withCtx] of [
    ["a browser that does not send `ack`", { path: PATH, markdown: EDITED }, true],
    ["a browser that sends `ack: false`", { path: PATH, markdown: EDITED, ack: false }, true],
    ["a truthy `ack` that is not `true`", { path: PATH, markdown: EDITED, ack: "yes" }, true],
    ["a runtime that hands over no `ctx`", { path: PATH, markdown: EDITED, ack: true }, false],
  ]) {
    test(`FALL BACK TO TODAY — ${label} gets the synchronous answer, projection and all`, async () => {
      const { status, body } = await editFile(sent, { withCtx });

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.accepted, undefined, "a synchronous answer claimed to be an ack");
      assert.ok(body.snapshot, "the projection did not come back");
      assert.equal(body.snapshot.generated_at, CYCLE_ENVELOPE.generated_at);
      assert.deepEqual(routes(), ["POST /vault/file", "POST /cycle"], "the cycle was not awaited");
      assert.equal(deferred.length, 0, "work was deferred on a path that must not defer any");
    });
  }

  test("A REFUSED WRITE IS NEVER ACCEPTED — the 409 is answered BEFORE the ack branch", async () => {
    // "Accepted but not written" must not be a state that exists. The refusal is the graph server's
    // and it is answered where it always was, so `ack: true` cannot turn a 409 into a 200.
    vaultFileAnswer = () => jsonResponse({ current: "# This Week\n" }, 409);
    const { status, body } = await editFile({ path: PATH, markdown: EDITED, ack: true, base: "sha256-old" });

    assert.equal(status, 409);
    assert.equal(body.refused, "stale-base");
    assert.equal(body.accepted, undefined);
    assert.deepEqual(routes(), ["POST /vault/file"], "a refused write ran a cycle");
    assert.equal(deferred.length, 0, "a refused write deferred a cycle");
  });

  test("A FAILED WRITE IS NEVER ACCEPTED EITHER — 502, and nothing is deferred", async () => {
    vaultFileAnswer = () => jsonResponse({ error: "disk" }, 500);
    const { status, body } = await editFile({ path: PATH, markdown: EDITED, ack: true });

    assert.equal(status, 502);
    assert.equal(body.ok, false);
    assert.equal(deferred.length, 0, "a failed write deferred a cycle");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3-4. THE PAGE — app/index.html, driven, with the clock in the test's hand
// ══════════════════════════════════════════════════════════════════════════════════════════════

const V1 = [
  "# This Week",
  "",
  "- [ ] Draft the launch note [[qntm:121]] #task",
  "- [ ] Ring the dentist [[qntm:122]] #task",
  "- [ ] Water the plants [[qntm:123]] #task",
  "",
].join("\n");

/** What the CYCLE made of the tick — a rule's tag nobody typed, on a line nobody touched. */
const CYCLED = V1.split("\n")
  .map((line, i) =>
    i === 2
      ? "- [x] Draft the launch note [[qntm:121]] #task"
      : i === 4
        ? "- [ ] Water the plants [[qntm:123]] #task 🛫 2026-08-04"
        : line,
  )
  .join("\n");

const T1 = "2026-08-01T09:00:00.000Z";
const T2 = "2026-08-01T09:00:14.000Z";

const view = (markdown) => ({ id: "this-week", path: PATH, title: "This Week", domain: "work", markdown });
const envelope = (markdown, at, writes = undefined) => ({
  ok: true,
  handle: "luke",
  pending_edits: 0,
  snapshot: { generated_at: at, views: [view(markdown)], ...(writes === undefined ? {} : { writes }) },
});

/**
 * Stand up the page with the CLOCK AND THE NETWORK BOTH IN THIS TEST'S HAND.
 *
 * `setTimeout` IS CAPTURED RATHER THAN ARMED, and that is what makes the whole mechanism testable at
 * all: the first pickup waits ten seconds, and a suite that could only wait ten seconds could prove
 * neither that it fires nor that it stops. The page's own policy module holds no clock precisely so
 * that this substitution is possible (app/present/pickup.ts).
 */
async function standUpPage(label, mutate) {
  const { elements, document } = installBrowser();
  const timers = [];
  globalThis.setTimeout = (fn, ms) => {
    timers.push({ fn, ms });
    return timers.length;
  };
  const control = {
    /** Every request the page made, in order: `"POST /app/edit-file"`, `"GET /app/graph"`. */
    calls: [],
    /** Every write body, in order. */
    posted: [],
    /** What `POST /app/edit-file` answers next. Defaults to the ack. */
    writeAnswers: [],
    /** What `GET /app/graph` answers next; a function so an arm can build one from what was posted. */
    readAnswer: () => envelope(V1, T1),
  };
  globalThis.fetch = async (url, init = {}) => {
    const route = new URL(String(url)).pathname;
    const method = init.method || "POST";
    control.calls.push(`${method} ${route}`);
    if (route === "/app/edit-file") {
      const body = JSON.parse(init.body);
      control.posted.push(body);
      const next = control.writeAnswers.shift() ?? {
        ok: true,
        handle: "luke",
        source: "server",
        accepted: true,
        path: body.path,
        pending_edits: 0,
      };
      return { ok: true, status: 200, json: async () => next };
    }
    if (route === "/app/graph") {
      return { ok: true, status: 200, json: async () => control.readAnswer() };
    }
    // `refreshGraphBlob` (app/index.html) — fired, fire-and-forget, every time `installProjection`
    // or `loadGraph` installs a fresh envelope (graph-envelope-composition-separates-blob-from-
    // view-markdown, 2026-08-07). Not this suite's concern (it is about the WRITE/PICKUP shape,
    // not the graph blob), so it is stubbed here rather than left to throw "unstubbed fetch" and
    // fail a test that never meant to exercise it.
    if (route === "/app/graph/blob") {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ ok: true, source: "server", snapshot: { graph: { nodes: [], edges: [] } } }),
      };
    }
    throw new Error(`unstubbed fetch: ${url}`);
  };
  const page = await importPage(makeWorkDir(label), mutate);
  page.__setToken("session-token");

  const body = () => walk(elements.get("viewBody"));
  return {
    page,
    elements,
    document,
    control,
    timers,
    /** Run every timer placed so far, oldest first, and let the microtasks drain. */
    async fireTimers() {
      const due = timers.splice(0, timers.length);
      for (const t of due) t.fn();
      await settle();
      await settle();
    },
    land(markdown = V1, at = T1) {
      page.__setGraphData(envelope(markdown, at));
      page.__setCurrentViewId("this-week");
      page.paintView("this-week", "chosen");
    },
    boxes: () => body().filter((el) => el.type === "checkbox"),
    rows: () => body().filter((el) => el.tagName === "span" && el.innerHTML !== ""),
    inputs: () => body().filter((el) => el.tagName === "input" && el.type === "text"),
    onScreen: () =>
      body()
        .map((el) => `${el.textContent || ""}${el.innerHTML || ""}${el.value || ""}`)
        .join("\n"),
  };
}

const settle = () => new Promise((r) => setImmediate(r));

/**
 * Open a line for typing through the page's own click wiring.
 *
 * A CLICK NO LONGER ARMS INSERT ON ITS OWN — it only positions the cursor, in NORMAL. This helper's
 * job is "get me a typing box", not "prove what a bare click does" (present-focus.test.mjs and
 * app-vim-wiring.test.mjs own that), so it presses `i` itself, same as the operator would.
 */
function clickLine(d, source, lineIndex) {
  const before = source
    .split("\n")
    .slice(0, lineIndex)
    .filter((line) => line.trim() !== "").length;
  const row = d.elements.get("viewBody").children[before];
  assert.ok(row, `no painted row for source line ${lineIndex}`);
  const target = [row, ...walk(row)].find((el) => el.listeners?.has("click"));
  assert.ok(target, `source line ${lineIndex} is painted with nothing a cursor can reach`);
  target.dispatch("click", makeEvent());
  d.document.dispatch("keydown", makeEvent({ key: "i" }));
  const input = d.inputs()[0];
  assert.ok(input, "clicking the line, then pressing i, did not open it for typing");
  return input;
}

/** The graph server naming back every token this browser has posted — the real echo's shape. */
const echoing = (d, markdown, at) =>
  envelope(markdown, at, { [PATH]: d.control.posted.map((b) => b.token).filter(Boolean) });

describe("3. THE PAGE — a projection arrives with no gesture behind it", () => {
  let d;
  before(async () => {
    d = await standUpPage("app-async-ack-page");
  });
  beforeEach(() => {
    d.control.calls = [];
    d.control.posted = [];
    d.control.writeAnswers = [];
    d.control.readAnswer = () => envelope(V1, T1);
    d.page.__queued().clear();
    d.page.__pickups().clear();
    d.timers.length = 0;
  });

  test("A WRITE PLACES A READ, AND THE READ BRINGS THE CYCLE'S OWN ANSWER TO THE SCREEN", async () => {
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();

    // The write answered without a projection, and the screen has not moved.
    assert.deepEqual(d.control.calls, ["POST /app/edit-file"]);
    assert.doesNotMatch(d.onScreen(), /🛫 2026-08-04/, "the cycle's output is on screen before the cycle ran");
    assert.equal(d.page.__pickups().waiting(PATH), true, "no read was placed for the accepted write");
    assert.equal(d.timers.length, 1, "the read was placed without a timer to fire it");

    // NOTHING IS ASKED OF THE OPERATOR AND NOTHING IS ASKED OF THE PAGE. No click, no keystroke, no
    // re-read press, and no write in flight to carry an answer — the timer fires and a projection
    // this browser never requested by a gesture lands on the screen.
    d.control.readAnswer = () => echoing(d, CYCLED, T2);
    await d.fireTimers();

    // A THIRD CALL NOW RIDES ALONG, FIRE-AND-FORGET: `GET /app/graph/blob`
    // (graph-envelope-composition-separates-blob-from-view-markdown, 2026-08-07) —
    // `installProjection` kicks a background, conditional refresh of the separately-cached graph
    // blob every time a fresh envelope lands, since a fresh envelope is the only signal available
    // that the graph might have moved. It is not on this test's critical path (nothing here reads
    // `ctx.graph`), so it is asserted present rather than re-proven; `app-graph-blob.test.mjs`
    // owns the blob cache's own behaviour.
    assert.deepEqual(d.control.calls, ["POST /app/edit-file", "GET /app/graph", "GET /app/graph/blob"]);
    assert.match(d.onScreen(), /🛫 2026-08-04/, "the projection did not reach the screen");
    assert.equal(d.page.__pickups().waiting(PATH), false, "an answered pickup is still waiting");
  });

  test("AND IT LANDS THROUGH THE QUEUE — HELD, and his characters are untouched", async () => {
    // THE WHOLE REASON THE PICKUP GOES THROUGH `arrive` RATHER THAN PAINTING FOR ITSELF. An unbidden
    // arrival is exactly the case `a-projection-arriving-mid-edit-is-held` was built for, and this
    // is the first arrival in this app's history with no gesture behind it to have decided anything
    // about the screen.
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();

    const input = clickLine(d, V1, 3);
    input.value = "- [ ] Ring the dentist BEFORE FRIDAY [[qntm:122]] #task";
    d.control.readAnswer = () => echoing(d, CYCLED, T2);
    await d.fireTimers();

    assert.equal(input.value, "- [ ] Ring the dentist BEFORE FRIDAY [[qntm:122]] #task",
      "the unbidden projection sourced his open line's characters");
    assert.equal(d.page.__queued().size, 1, "the projection was not held");
    assert.doesNotMatch(d.onScreen(), /🛫 2026-08-04/, "it reached the screen mid-edit");
  });

  test("AND IT IS INSTALLED THE MOMENT THE LINE SETTLES — the other half of the same gate", async () => {
    // THE LINE IS OPENED AND NOT TYPED INTO, ON PURPOSE. A settlement that CHANGED something is a
    // second write with an answer of its own, and this arm is about the projection already in hand.
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();

    const input = clickLine(d, V1, 3);
    d.control.readAnswer = () => echoing(d, CYCLED, T2);
    await d.fireTimers();
    assert.equal(d.page.__queued().size, 1, "the projection was not held");

    input.dispatch("blur");
    await settle();
    assert.equal(d.control.calls.filter((c) => c.startsWith("POST")).length, 1, "the settlement posted a second write");
    assert.match(d.onScreen(), /🛫 2026-08-04/, "the held projection never landed");
  });

  test("AND THE BASE FOLLOWS THE PROJECTION, NOT THE ACK, ONCE IT LANDS", async () => {
    // The ack's base is short-lived by design: it is true until the cycle rewrites the file. When
    // the cycle's own projection arrives it wins, and the accepted string is dropped rather than
    // reconciled — the engine is entitled to rewrite what it ingested.
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();
    assert.equal(d.page.__served().markdown, d.control.posted[0].markdown, "the ack did not refresh the base");

    d.control.readAnswer = () => echoing(d, CYCLED, T2);
    await d.fireTimers();

    assert.equal(d.page.__served().markdown, CYCLED, "the base did not follow the arriving projection");
    assert.equal(d.page.__accepted().sourceFor(PATH), null, "the accepted source outlived the projection");
  });

  test("A READ THAT BEATS THE CYCLE IS TRIED AGAIN, THOUGH IT NAMES THE WRITE PERFECTLY", async () => {
    // ── THE DEFECT THIS ARM WAS WRITTEN FROM, MEASURED IN A REAL BROWSER ON 2026-08-01 ──────────
    //
    // Exactly ONE `GET /app/graph` fired, at ~+11 s. It succeeded. The series then ended, and the
    // stamp the engine had written was invisible until the operator refreshed by hand.
    //
    // THE CAUSE IS THAT THE ECHO ANSWERS A DIFFERENT QUESTION. The graph server records the token
    // at `POST /vault/file`; the cycle runs BEHIND that write. So an envelope read while the cycle
    // is still running names the token — truthfully — and carries the file the cycle has not
    // touched. `correlation.ts`'s own header says exactly this: an echo does not claim the
    // projection in hand is derived from the write. The old satisfaction test read it as if it did,
    // and the bounded series therefore stopped one read short of the answer it exists to collect.
    //
    // THE ENVELOPE BELOW IS THAT ENVELOPE: the token, named; the pre-cycle file; the pre-cycle
    // stamp. The pickup must not accept it.
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();

    d.control.readAnswer = () => echoing(d, V1, T1);
    await d.fireTimers();

    assert.equal(d.page.__pickups().waiting(PATH), true, "the echo alone ended the series");
    assert.equal(d.timers.length, 1, "no second read was placed, so the answer can never arrive");
    assert.doesNotMatch(d.onScreen(), /🛫 2026-08-04/, "the arm did not set up");

    // AND THE SECOND READ, PLACED BECAUSE THE FIRST WAS NOT ACCEPTED, BRINGS THE CYCLE'S OUTPUT.
    d.control.readAnswer = () => echoing(d, CYCLED, T2);
    await d.fireTimers();

    assert.match(d.onScreen(), /🛫 2026-08-04/, "the cycle's answer never reached the screen");
    assert.equal(d.page.__pickups().waiting(PATH), false, "an answered pickup is still waiting");
    assert.equal(d.timers.length, 0, "the answered series placed another read");
  });

  test("AND THE SKIP-THE-FETCH SHORTCUT ASKS THE SAME TWO QUESTIONS — a recorded write is not an answer", async () => {
    // The same mistake lives in a second place: the pre-fetch test that cancels a pickup whose
    // answer arrived by another route. Keyed on the register alone it would cancel the read WITHOUT
    // SPENDING ONE — an echo seen anywhere would end the series before the cycle finished, and the
    // page would not even have an envelope to be wrong about.
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();

    // The re-read button, landing an envelope that names the write and predates the cycle.
    d.control.readAnswer = () => echoing(d, V1, T1);
    await d.page.refresh();
    assert.equal(d.page.__writes().waiting(d.control.posted[0].token), false, "the arm did not set up");

    d.control.readAnswer = () => echoing(d, CYCLED, T2);
    await d.fireTimers();

    assert.equal(
      d.control.calls.filter((c) => c === "GET /app/graph").length,
      2,
      "the pickup cancelled itself on a write that was merely recorded",
    );
    assert.match(d.onScreen(), /🛫 2026-08-04/, "the cycle's answer never reached the screen");
  });

  test("A READ THAT DOES NOT NAME THE WRITE IS TRIED AGAIN — the cycle had not finished", async () => {
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();

    // The envelope is real and current and says nothing about this write — which is exactly what a
    // read that beat the cycle looks like. `correlation.ts` is the only thing that can tell.
    d.control.readAnswer = () => envelope(V1, T1, { [PATH]: [] });
    await d.fireTimers();
    assert.equal(d.page.__pickups().waiting(PATH), true, "the pickup stopped on a projection that was not its answer");
    assert.equal(d.timers.length, 1, "no second read was placed");

    d.control.readAnswer = () => echoing(d, CYCLED, T2);
    await d.fireTimers();
    assert.equal(d.page.__pickups().waiting(PATH), false);
    assert.match(d.onScreen(), /🛫 2026-08-04/);
  });

  test("A FAILED READ IS NOT A FAILED WRITE — the series goes on and nothing is lost", async () => {
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();

    const good = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith("/app/graph")) throw new Error("network");
      return good(url, init);
    };
    try {
      await d.fireTimers();
    } finally {
      globalThis.fetch = good;
    }
    assert.equal(d.page.__pickups().waiting(PATH), true, "a dead network cancelled the pickup");
    assert.equal(
      d.page.__accepted().sourceFor(PATH),
      d.control.posted[0].markdown,
      "a failed read dropped what the server had already accepted",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3b. THE LINE HE MADE, AND THE STAMP THE ENGINE OWES IT
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// ── THE SECOND MEASUREMENT, TAKEN IN A REAL BROWSER AGAINST THE LIVE SYSTEM ON 2026-08-03 ──────
//
// The `since` half above shipped and the drive was repeated. Create at t=0 answered 200 in 43 ms.
// EXACTLY ONE `GET /app/graph` fired, at +10.86 s, and succeeded. The page was then watched for 91
// seconds with no Refresh: the row kept its provisional instance
// (`all-personal/0/- [ ] zzTEST stamp watch #task #personal`), never gained a node, and never
// gained a stamp. A manual Refresh made it `qntm:2697` at once.
//
// THE RECORDED BODY OF THAT ONE POLL IS WHAT SETTLES IT. It carried the new line — and carried it
// UNSTAMPED: raw text, no `[[qntm:NNNN]]`. So the projection genuinely WAS newer than the one the
// page held, the `since` half was satisfied truthfully, the series ended, and the engine stamped on
// a cycle the page never fetched.
//
// SO "A PROJECTION GENERATED AFTER THE ONE I WAS HOLDING" IS TOO WEAK A STOPPING CONDITION. The
// cycle rewrites the file more than once: it ingests the line on one pass and stamps it on another,
// and both passes stamp a new `generated_at`. The page has to wait for the projection in which THE
// LINE IT WROTE carries a stamp — the line has become a node — not merely for a newer projection.
const NEW_LINE = "- [ ] zzTEST stamp watch #task #personal";
const NEW_ID = "qntm:2697";
const T3 = "2026-08-01T09:00:28.000Z";

/**
 * Click the empty space below the last line — the page's own create gesture (`paint.ts`'s
 * `div.newline` row), driven through the wiring that ships rather than around it.
 */
function clickBelow(d) {
  const body = d.elements.get("viewBody");
  const below = [...body.children].find((el) => String(el.className).split(/\s+/).includes("newline"));
  assert.ok(below, "the view painted no click-below-the-last-line row");
  below.dispatch("click", makeEvent());
  const input = d.inputs()[0];
  assert.ok(input, "clicking below the last line did not open a row for typing");
  return input;
}

/** Make the line, commit it, and hand back the markdown the page actually posted. */
async function createLine(d, text = NEW_LINE) {
  const input = clickBelow(d);
  input.value = text;
  input.dispatch("blur");
  await settle();
  await settle();
  const posted = d.control.posted.at(-1)?.markdown;
  assert.ok(typeof posted === "string", "the create posted no file");
  assert.ok(posted.includes(text), "the create posted a file without the line he typed");
  return posted;
}

describe("3b. A PICKUP STOPS ON THE LINE BEING STAMPED, NOT ON A NEWER PROJECTION", () => {
  let d;
  before(async () => {
    d = await standUpPage("app-async-ack-stamp");
  });
  beforeEach(() => {
    d.control.calls = [];
    d.control.posted = [];
    d.control.writeAnswers = [];
    d.control.readAnswer = () => envelope(V1, T1);
    d.page.__queued().clear();
    d.page.__pickups().clear();
    d.page.__writes().clear();
    d.timers.length = 0;
  });

  test("THE LIVE DEFECT — a NEWER projection that leaves the new line unstamped is not the answer", async () => {
    d.land();
    const posted = await createLine(d);
    const stamped = posted.replace(NEW_LINE, `${NEW_LINE} [[${NEW_ID}]]`);

    // THE ENVELOPE FROM THE LIVE DRIVE, REBUILT: newer than the one the page held (T2 > T1), naming
    // the write perfectly, and carrying the operator's line with no stamp on it.
    d.control.readAnswer = () => echoing(d, posted, T2);
    await d.fireTimers();

    assert.equal(
      d.page.__pickups().waiting(PATH),
      true,
      "a newer projection that never stamped the line ended the series — the live defect, in the harness",
    );
    assert.equal(d.timers.length, 1, "no second read was placed, so the stamp can never arrive");
    assert.doesNotMatch(d.onScreen(), new RegExp(NEW_ID), "the arm did not set up");

    // AND THE READ THAT WAS PLACED BECAUSE THE FIRST WAS NOT ACCEPTED BRINGS THE STAMP.
    d.control.readAnswer = () => echoing(d, stamped, T3);
    await d.fireTimers();

    assert.match(d.onScreen(), new RegExp(NEW_ID), "the stamp never reached the screen without a Refresh");
    assert.equal(d.page.__pickups().waiting(PATH), false, "the stamped projection did not end the series");
    assert.equal(d.timers.length, 0, "the answered series placed another read");
  });

  test("A CHECKBOX TICK IS UNCHANGED — it introduced no line, so it is owed no stamp and reads ONCE", async () => {
    // ── THE BUDGET GUARD, AND THE REASON THE OWED SET IS A DIFF RATHER THAN A SCAN ───────────────
    //
    // Waiting for EVERY unstamped line in the posted file would make every tick run to the bound: a
    // poll wearing a bound, and a 3x bill on his commonest gesture against a 1.23 MB payload. A
    // tick changes one glyph on a line that already has its id, so it introduces nothing, owes
    // nothing, and stops exactly where it stopped before this change existed.
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();
    assert.deepEqual(d.page.__pickups().owed(PATH), [], "a tick was made to wait for a stamp");

    d.control.readAnswer = () => echoing(d, CYCLED, T2);
    await d.fireTimers();

    // `GET /app/graph/blob` rides along, fire-and-forget, on every fresh envelope — see the
    // identical note on this suite's §3 test above.
    assert.deepEqual(
      d.control.calls,
      ["POST /app/edit-file", "GET /app/graph", "GET /app/graph/blob"],
      "the tick cost more than one read",
    );
    assert.equal(d.page.__pickups().waiting(PATH), false, "the tick's pickup is still waiting");
  });

  test("AND THE LINE MAY BE STAMPED IN ANOTHER VIEW — the engine moves lines, and it is still his", async () => {
    // Nothing positional enters the comparison, so the search is of the WHOLE projection. A line
    // that left this view for another is answered, not lost.
    d.land();
    const posted = await createLine(d);
    const elsewhere = {
      ...envelope(posted.replace(`${NEW_LINE}\n`, ""), T2),
      snapshot: {
        generated_at: T2,
        writes: { [PATH]: d.control.posted.map((b) => b.token).filter(Boolean) },
        views: [
          view(posted.replace(`${NEW_LINE}\n`, "")),
          {
            id: "all-personal",
            path: "personal/all.md",
            title: "All Personal",
            domain: "personal",
            markdown: `# All Personal\n\n${NEW_LINE} [[${NEW_ID}]]\n`,
          },
        ],
      },
    };
    d.control.readAnswer = () => elsewhere;
    await d.fireTimers();

    assert.equal(
      d.page.__pickups().waiting(PATH),
      false,
      "the line was stamped in another view and the series went on reading for it",
    );
    assert.equal(d.timers.length, 0, "a second read was placed for a line that had already been stamped");
  });

  test("A LINE THE ENGINE NEVER STAMPS ENDS AT THE BOUND — three reads, and an HONEST sentence", async () => {
    // ── THE BOUND IS NOW LOAD-BEARING RATHER THAN MERELY PRUDENT ─────────────────────────────────
    //
    // The same drive found root-level `#task` lines reclassified to `#outcome` and rendered with no
    // stamp at all. A condition that waits for a stamp has no natural end on one of those, so the
    // schedule's `delaysMs.length` is the only thing that terminates the series. It terminates
    // because `answered` counts attempts against an array copied on construction, and because
    // nothing here re-arms itself — only a new write can.
    //
    // AND `PICKUP_LOST` WOULD BE FALSE IN BOTH HALVES HERE. The cycle's answer DID arrive, and
    // pressing re-read would fetch the same unstamped line again. So this ending says the two
    // things that are true and asks him for nothing.
    d.land();
    const posted = await createLine(d);
    let tick = 0;
    d.control.readAnswer = () => {
      tick += 1;
      return echoing(d, posted, `2026-08-01T09:0${tick}:00.000Z`);
    };

    for (let i = 0; i < PICKUP_DELAYS.length; i += 1) {
      assert.equal(d.timers.length, 1, `attempt ${i + 1} had no timer waiting to fire it`);
      await d.fireTimers();
    }

    assert.equal(
      d.control.calls.filter((c) => c === "GET /app/graph").length,
      PICKUP_DELAYS.length,
      "the unstampable line did not read exactly the bounded number of times",
    );
    assert.equal(d.timers.length, 0, "THE SERIES DID NOT TERMINATE — it re-armed itself on an unstamped line");
    assert.equal(d.page.__pickups().waiting(PATH), false, "the exhausted record was not dropped");
    // "your save landed — the engine has not given this line an id" (`PICKUP_UNSTAMPED`) is retired
    // (chore/retire-the-status-line) — the `next.outcome === "exhausted"` branch that used to choose
    // between it and `PICKUP_LOST` now does nothing at all, for either ending. The functional state
    // above (the series terminated, the record was dropped) is what is left to prove; see this
    // file's own PR body for the silent-failure entry this collapses into.
  });

  test("AND A CYCLE THAT REALLY DID NOT ANSWER STILL SAYS SO — the other ending, unchanged", async () => {
    // The two endings used to be told apart by two different sentences (`PICKUP_LOST` here,
    // `PICKUP_UNSTAMPED` above) — both retired (chore/retire-the-status-line), and from outside the
    // app nothing distinguishes them any more: both now exhaust silently. What is still real, and
    // still checked here, is that THIS ending — a cycle that never answered at all — also correctly
    // exhausts and drops its record, the same as the sibling arm above.
    d.land();
    await createLine(d);
    d.control.readAnswer = () => envelope(V1, T1);
    for (let i = 0; i < PICKUP_DELAYS.length; i += 1) {
      await d.fireTimers();
    }
    assert.equal(d.timers.length, 0, "THE SERIES DID NOT TERMINATE");
    assert.equal(d.page.__pickups().waiting(PATH), false, "the exhausted record was not dropped");
  });

  test("AND THE SKIP-THE-FETCH SHORTCUT ASKS THE STAMP TOO — a newer projection is not an answer", async () => {
    // The same mistake has always lived in two places. Keyed on the timestamp and the token alone,
    // the pre-fetch test would CANCEL the read without spending one: the re-read button lands a
    // newer projection carrying the unstamped line, and the series ends before the stamp exists.
    d.land();
    const posted = await createLine(d);
    const stamped = posted.replace(NEW_LINE, `${NEW_LINE} [[${NEW_ID}]]`);

    d.control.readAnswer = () => echoing(d, posted, T2);
    await d.page.refresh();
    assert.equal(d.page.__writes().waiting(d.control.posted[0].token), false, "the arm did not set up");
    assert.equal(d.page.__pickups().waiting(PATH), true, "the re-read's newer projection ended the series");

    d.control.readAnswer = () => echoing(d, stamped, T3);
    await d.fireTimers();

    assert.equal(
      d.control.calls.filter((c) => c === "GET /app/graph").length,
      2,
      "the pickup cancelled itself on a projection that had not stamped the line",
    );
    assert.match(d.onScreen(), new RegExp(NEW_ID), "the stamp never reached the screen");
  });
});

describe("4. IT IS NOT A POLL — the guard on what this costs him", () => {
  let d;
  before(async () => {
    d = await standUpPage("app-async-ack-bounded");
  });
  beforeEach(() => {
    d.control.calls = [];
    d.control.posted = [];
    d.control.readAnswer = () => envelope(V1, T1);
    d.page.__queued().clear();
    d.page.__pickups().clear();
    d.timers.length = 0;
  });

  test("NO WRITE, NO READ — an idle page reaches the graph server exactly zero times", async () => {
    d.land();
    // Every gesture that is not a write: paint the view, move the cursor, open a line, close it.
    d.page.__setFocus(2, V1);
    const input = clickLine(d, V1, 3);
    input.dispatch("blur");
    await settle();
    await d.fireTimers();

    assert.deepEqual(d.control.calls, [], "the page read the graph with no write behind it");
    assert.equal(d.timers.length, 0, "a timer was placed with no write behind it");
  });

  test("THE SERIES ENDS — three reads, then it stops", async () => {
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();
    // A SERVER THAT ECHOES NOTHING, WHICH IS THE ONE ACTUALLY DEPLOYED TODAY. `readWriteEcho` reads
    // an envelope with no `writes` key as SILENT, `correlate` returns before touching the register,
    // and this browser therefore never gets evidence that its write landed. That is the situation
    // the bound exists for: reading forever cannot produce evidence a server does not emit.
    d.control.readAnswer = () => envelope(V1, T1);

    for (let i = 0; i < 3; i += 1) {
      await d.fireTimers();
    }
    const reads = d.control.calls.filter((c) => c === "GET /app/graph").length;
    assert.equal(reads, 3, `the series read ${reads} times rather than three`);
    assert.equal(d.page.__pickups().waiting(PATH), false, "the series did not end");
    // "the cycle's answer did not arrive — press re-read to ask for it again" (`PICKUP_LOST`) is
    // retired (chore/retire-the-status-line); the series correctly ending, above, is what is left.

    // AND IT DOES NOT RE-ARM. This assertion is the poll guard: after the last attempt there is no
    // timer left, so nothing can wake the Fly machine again until he writes.
    assert.equal(d.timers.length, 0, "the exhausted series placed another read");
    await d.fireTimers();
    assert.equal(d.control.calls.filter((c) => c === "GET /app/graph").length, 3);
  });

  test("A SECOND WRITE DOES NOT PLACE A SECOND TIMER — one read per file, not one per gesture", async () => {
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();
    d.boxes()[1].checked = true;
    d.boxes()[1].dispatch("change");
    await settle();

    assert.equal(d.timers.length, 1, "two writes placed two timers for one file");
    assert.equal(d.page.__pickups().size, 1);
  });

  test("A PICKUP ANSWERED BY THE RE-READ BUTTON COSTS NO REQUEST AT ALL", async () => {
    // The satisfaction test is asked BEFORE the fetch, so an answer that arrived by another route
    // spends nothing. The re-read button is a `GET /app/graph` the operator asked for; this arm
    // proves the pickup does not then make a second one.
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();

    d.control.readAnswer = () => echoing(d, CYCLED, T2);
    await d.page.refresh();
    const after = d.control.calls.length;
    await d.fireTimers();

    assert.equal(d.control.calls.length, after, "the pickup read again after its answer had already come");
    assert.equal(d.page.__pickups().waiting(PATH), false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. MUTATION PROOFS — a guard that cannot go red is decoration
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. THE GUARDS GO RED WHEN THE THING THEY GUARD IS BROKEN", () => {
  test("BREAK THE ACCEPTANCE — and the second tick discards the first, exactly as it used to", async () => {
    // ONE EXPRESSION, AND IT IS THE ONE THAT MAKES THE PAINTER'S SOURCE MOVE. With it gone the page
    // is the page the falsifier measured: `app-projection-queue.test.mjs` §7's acceptance arm is
    // this assertion the other way up.
    const d = await standUpPage("app-async-ack-mutation-accept", (source) =>
      assertMutated(source, "accepted.take(path, write.markdown);", "void write;"),
    );
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();
    d.boxes()[1].checked = true;
    d.boxes()[1].dispatch("change");
    await settle();

    assert.equal(d.control.posted.length, 2, "the mutation did not reach the page's write path");
    assert.doesNotMatch(
      d.control.posted[1].markdown,
      /- \[x\] Draft the launch note/,
      "the acceptance is not load-bearing — removing it did not lose the first tick",
    );
  });

  test("BREAK THE SATISFACTION TEST — and the series ends on the echo, exactly as it did live", async () => {
    // THE SHIPPED EXPRESSION, PUT BACK. This is the code that ran in the browser on 2026-08-01, and
    // this arm is that morning's measurement: one read, the series over, the stamp invisible. With
    // it restored the guard above must go red, or the stamp half of the test is decoration.
    const d = await standUpPage("app-async-ack-mutation-answered", (source) =>
      assertMutated(
        source,
        "pastTheWrite(arrivedAt, going.since) && (going.token === null || !writes.waiting(going.token));",
        "going.token !== null && !writes.waiting(going.token);",
      ),
    );
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();

    // The pre-cycle envelope: the token named, the file untouched, the stamp unmoved.
    d.control.readAnswer = () => echoing(d, V1, T1);
    await d.fireTimers();

    assert.equal(d.page.__pickups().waiting(PATH), false, "the mutation did not reach the page");
    assert.equal(d.timers.length, 0, "the series is still going, so the stamp test is not load-bearing");
    d.control.readAnswer = () => echoing(d, CYCLED, T2);
    await d.fireTimers();
    assert.doesNotMatch(
      d.onScreen(),
      /🛫 2026-08-04/,
      "the stamp arrived without the second read — the guard proves nothing",
    );
  });

  test("BREAK THE STAMP TEST — and the series ends on a newer projection, exactly as it did live", async () => {
    // ── THE EXPRESSION THAT SHIPPED ON 2026-08-02, PUT BACK VERBATIM ─────────────────────────────
    //
    // `pickups.answered(path, cycled)` IS the condition that was in the browser on 2026-08-03, and
    // this arm is that drive: the create, one read at +10.86 s, an envelope that is genuinely newer
    // and genuinely names the write and genuinely has no stamp on his line, and the series over. It
    // must go red, or waiting for the stamp is decoration.
    const d = await standUpPage("app-async-ack-mutation-stamped", (source) =>
      assertMutated(source, "pickups.answered(path, cycled && stamped);", "pickups.answered(path, cycled);"),
    );
    d.land();
    const posted = await createLine(d);

    d.control.readAnswer = () => echoing(d, posted, T2);
    await d.fireTimers();

    assert.equal(d.page.__pickups().waiting(PATH), false, "the mutation did not reach the page");
    assert.equal(d.timers.length, 0, "the series is still going, so the stamp test is not load-bearing");

    // AND NOTHING WILL EVER FETCH THE CYCLE THAT STAMPED IT. This is the 91 seconds he watched.
    d.control.readAnswer = () => echoing(d, posted.replace(NEW_LINE, `${NEW_LINE} [[${NEW_ID}]]`), T3);
    await d.fireTimers();
    assert.doesNotMatch(
      d.onScreen(),
      new RegExp(NEW_ID),
      "the stamp reached the screen without the second read — the guard proves nothing",
    );
  });

  test("BREAK THE SKIP-THE-FETCH SHORTCUT — and the read is cancelled before it is ever spent", async () => {
    // The second place the same mistake lives. Restored to the timestamp-and-token pair, the
    // pre-fetch test cancels a pickup on a projection that never stamped the line — and the page
    // does not even buy an envelope to be wrong about.
    const d = await standUpPage("app-async-ack-mutation-inhand", (source) =>
      assertMutated(
        source,
        "(pastTheWrite(paintedStamp(), going.since) && stampsLanded(going.owed, viewSources(graphData))) ||\n" +
          "    (pastTheWrite(pending?.generatedAt ?? null, going.since) &&\n" +
          "      stampsLanded(going.owed, viewSources(pending?.data ?? null)));",
        "pastTheWrite(paintedStamp(), going.since) ||\n" +
          "    pastTheWrite(pending?.generatedAt ?? null, going.since);",
      ),
    );
    d.land();
    const posted = await createLine(d);

    // The re-read button, landing a newer projection that has not stamped his line.
    d.control.readAnswer = () => echoing(d, posted, T2);
    await d.page.refresh();

    d.control.readAnswer = () => echoing(d, posted.replace(NEW_LINE, `${NEW_LINE} [[${NEW_ID}]]`), T3);
    await d.fireTimers();

    assert.equal(
      d.control.calls.filter((c) => c === "GET /app/graph").length,
      1,
      "the mutation did not reach the page — the shortcut still spent a read",
    );
    assert.doesNotMatch(d.onScreen(), new RegExp(NEW_ID), "the stamp arrived without the pickup's own read");
  });

  test("BREAK THE PICKUP — and the cycle's answer never reaches the screen", async () => {
    // The transport half's own falsifier. `startPickup` is the ONE expression that places a read;
    // with it neutered an accepted write has no answer and the screen stays where it was.
    const d = await standUpPage("app-async-ack-mutation-pickup", (source) =>
      assertMutated(
        source,
        "startPickup(path, write.token ?? null, stampsOwed(write.source ?? null, write.markdown));",
        "void path;",
      ),
    );
    d.land();
    d.boxes()[0].checked = true;
    d.boxes()[0].dispatch("change");
    await settle();
    d.control.readAnswer = () => envelope(CYCLED, T2);
    await d.fireTimers();

    assert.equal(d.timers.length, 0, "the mutation did not reach the page");
    assert.deepEqual(d.control.calls, ["POST /app/edit-file"], "a read was placed without the pickup");
    assert.doesNotMatch(
      d.onScreen(),
      /🛫 2026-08-04/,
      "the pickup is not load-bearing — the projection arrived without it",
    );
  });
});

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
 *   §2  THE WORKER. `ack: true` answers on the vault write and runs the cycle in `ctx.waitUntil`;
 *       three independent ways it falls back to the synchronous answer; and a refused or failed
 *       write is answered BEFORE the branch, so "accepted but not written" is not a state.
 *   §3  THE PAGE. A projection arrives with no gesture behind it and NO write in flight to carry it,
 *       and it lands THROUGH THE QUEUE — held when a line is open, installed when it settles.
 *   §4  IT IS NOT A POLL. No write, no read. The series ends and says so. It never re-arms itself.
 *   §5  MUTATION PROOFS. Break the collection and break the acceptance; watch the guards go red.
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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SURFACES — app/present/pickup.ts and app/present/accepted.ts, out of the shipped bundle
// ══════════════════════════════════════════════════════════════════════════════════════════════

let PickupSchedule;
let PICKUP_DELAYS;
let AcceptedSource;
before(async () => {
  ({ PickupSchedule, PICKUP_DELAYS, AcceptedSource } = await import(join(REPO, "dist", "present.js")));
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
  const { elements } = installBrowser();
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
    throw new Error(`unstubbed fetch: ${url}`);
  };
  const page = await importPage(makeWorkDir(label), mutate);
  page.__setToken("session-token");

  const body = () => walk(elements.get("viewBody"));
  return {
    page,
    elements,
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
    freshness: () => elements.get("freshness").textContent,
  };
}

const settle = () => new Promise((r) => setImmediate(r));

/** Open a line for typing through the page's own click wiring. */
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
  const input = d.inputs()[0];
  assert.ok(input, "clicking the line did not open it for typing");
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

    assert.deepEqual(d.control.calls, ["POST /app/edit-file", "GET /app/graph"]);
    assert.match(d.onScreen(), /🛫 2026-08-04/, "the projection did not reach the screen");
    assert.match(d.freshness(), /^as of /, "the arrival did not say when it was generated");
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
    assert.match(d.freshness(), /it lands on this view when the line you are in settles/);
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

  test("THE SERIES ENDS, AND SAYS SO — three reads, then the operator is told to ask", async () => {
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
    assert.match(d.freshness(), /the cycle's answer did not arrive — press re-read/);

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

  test("BREAK THE PICKUP — and the cycle's answer never reaches the screen", async () => {
    // The transport half's own falsifier. `startPickup` is the ONE expression that places a read;
    // with it neutered an accepted write has no answer and the screen stays where it was.
    const d = await standUpPage("app-async-ack-mutation-pickup", (source) =>
      assertMutated(source, "startPickup(path, write.token ?? null);", "void path;"),
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

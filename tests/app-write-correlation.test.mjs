/**
 * A WRITE CARRIES A TOKEN, AND THE ECHO IS WHAT RELEASES A HELD ROW.
 *
 *   node --test tests/app-write-correlation.test.mjs
 *
 * ── THE MEASURED DEFECT THIS IS EVIDENCE FOR ──
 *
 * A real browser run on 2026-08-01 found the recovery strip carrying FIVE rows, THREE of which were
 * lines that had saved perfectly. The cause is in the data rather than in the strip: the cycle
 * REWRITES the line it ingests — the identity stamp, the defaults, the marker — and the only signal
 * the page had for "is this line back" was its TEXT (`HeldSurface.settle`). Text matching cannot
 * find a line the cycle rewrote, so the row stayed up claiming work was lost when none was. A strip
 * full of rows that are not losses is a strip nobody reads, which makes the rows that ARE losses
 * invisible.
 *
 * TEXT IS NOT IDENTITY. A TOKEN IS. §2 below reproduces the exact shape of the false positive —
 * a line committed, the write accepted, the cycle stamping and MOVING it so no text comparison can
 * find it — and asserts the row is not held.
 *
 * ── THE SHIPPING CONDITION, WHICH IS §3 AND IS THE ARM THAT MATTERS MOST TODAY ──
 *
 * The server half is merged and NOT DEPLOYED; the `deployed` tag is eight commits behind main. So
 * this change ships to a server that ignores the token, and "behaves exactly as today" is not a
 * nicety, it is the condition of shipping at all. §3 drives the identical gestures against an
 * envelope with no `writes` key and asserts the page does what it did before: the row is held, the
 * freshness line says what it always said, and the register never speaks.
 *
 * ── WHAT THIS SUITE DOES NOT VERIFY ──
 *
 * NO BROWSER WAS OPENED. There is none available in this environment. No passkey session, no live
 * graph server, no engine cycle, no real POST, and no run against the deployed Worker. Every
 * projection below is a FIXTURE and every answer is a stubbed `fetch`. What is real is the page:
 * `tests/fixtures/app-html-page.mjs` lifts app/index.html's own module script and runs it, so every
 * line of logic under test is the line that ships.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertMutated,
  importPage,
  installBrowser,
  makeEvent,
  makeWorkDir,
  walk,
  REPO,
} from "./fixtures/app-html-page.mjs";

const HERE = resolve(fileURLToPath(import.meta.url), "..");

const { mintWriteToken, readWriteEcho, WriteRegister, WRITE_ECHO_KEY, HeldSurface, heldFrom } =
  await import(join(REPO, "dist", "present.js"));

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 0. THE TOKEN — how it is minted, and why that is enough
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("0. mintWriteToken — opaque, unguessable, and honest when it cannot be", () => {
  test("it is a `w1-` prefixed 128-bit hex string", () => {
    const token = mintWriteToken();
    assert.match(token, /^w1-[0-9a-f]{32}$/, `not the declared shape: ${token}`);
  });

  test("TWO WRITES NEVER SHARE ONE — 2,000 tokens, no collision", () => {
    // The population that has to be distinct is the writes one session has outstanding, which is a
    // handful. Two thousand is three orders of magnitude past it and still exact.
    const seen = new Set();
    for (let i = 0; i < 2000; i += 1) {
      seen.add(mintWriteToken());
    }
    assert.equal(seen.size, 2000, "a token repeated — two writes would be indistinguishable");
  });

  test("IT COMES FROM THE CSPRNG AND NOWHERE ELSE — `Math.random` is made to throw", () => {
    // Unguessability is the second of the token's two properties and the one a weaker source would
    // silently give up. If the token could be predicted, an envelope from anywhere could release a
    // held row by naming one — the false positive this change removes, restored through a side door.
    const savedRandom = Math.random;
    try {
      Math.random = () => {
        throw new Error("mintWriteToken reached for Math.random");
      };
      assert.match(mintWriteToken(), /^w1-[0-9a-f]{32}$/);
    } finally {
      Math.random = savedRandom;
    }
  });

  test("NO CSPRNG MEANS NO TOKEN — `null`, never a weak one", () => {
    // The fail-safe direction. A platform that cannot mint a trustworthy token posts a body
    // byte-for-byte identical to the one it posted before this change, and releases nothing ever.
    const savedCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    try {
      Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
      assert.equal(mintWriteToken(), null);
    } finally {
      if (savedCrypto === undefined) {
        delete globalThis.crypto;
      } else {
        Object.defineProperty(globalThis, "crypto", savedCrypto);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE READER — strict about the shape, silent about an absence, loud about a surprise
// ══════════════════════════════════════════════════════════════════════════════════════════════

const PATH = "work/outcomes.md";

const withEcho = (writes) => ({ ok: true, snapshot: { generated_at: "2026-08-01T09:00:00Z", writes } });

describe("1. readWriteEcho — one declared shape, and no guessing at any other", () => {
  test("SILENT — an envelope with no such key. THE SHIPPING CONDITION.", () => {
    assert.deepEqual(readWriteEcho({ ok: true, snapshot: { generated_at: "x", views: [] } }), {
      outcome: "silent",
    });
    assert.deepEqual(readWriteEcho(null), { outcome: "silent" });
    assert.deepEqual(readWriteEcho("not an envelope"), { outcome: "silent" });
  });

  test("ECHO — the server's real shape, `{path: [token, …]}`", () => {
    const reading = readWriteEcho(withEcho({ [PATH]: ["w1-aaa", "w1-bbb"] }));
    assert.equal(reading.outcome, "echo");
    assert.deepEqual([...reading.writes.get(PATH)], ["w1-aaa", "w1-bbb"]);
  });

  test("AN EMPTY ECHO IS NOT A PROBLEM — a server with nothing to say is still answering", () => {
    const reading = readWriteEcho(withEcho({}));
    assert.equal(reading.outcome, "echo");
    assert.equal(reading.writes.size, 0);
  });

  test("READ AT BOTH ALTITUDES — the Worker carries it inside `snapshot`, the graph server at the top", () => {
    const both = { ok: true, writes: { [PATH]: ["w1-top"] }, snapshot: { writes: { [PATH]: ["w1-in"] } } };
    const reading = readWriteEcho(both);
    assert.equal(reading.outcome, "echo");
    assert.deepEqual([...reading.writes.get(PATH)], ["w1-top", "w1-in"]);
  });

  test("THE LEADING SLASH IS THE ONE NORMALISATION, and it is applied to the key", () => {
    const reading = readWriteEcho(withEcho({ ["/" + PATH]: ["w1-aaa"] }));
    assert.deepEqual([...reading.writes.get(PATH)], ["w1-aaa"]);
  });

  test("UNRECOGNISED — a shape the contract does not declare is REPORTED, never guessed", () => {
    // Four surprises, one answer each. The reader could "helpfully" coerce every one of these; what
    // it would buy is a held row released on a shape nobody agreed, which is the operator's
    // characters gone. Silence is legal; a shape nobody agreed is not silence.
    for (const bad of [
      withEcho(["w1-aaa"]),
      withEcho(null),
      withEcho({ [PATH]: "w1-aaa" }),
      withEcho({ [PATH]: ["w1-aaa", 7] }),
    ]) {
      const reading = readWriteEcho(bad);
      assert.equal(reading.outcome, "unrecognised", `guessed at ${JSON.stringify(bad.snapshot.writes)}`);
      assert.match(reading.problem, new RegExp(WRITE_ECHO_KEY));
      assert.match(reading.problem, /no write is treated as landed/);
    }
  });

  test("PURE — no DOM, no fetch, no clock, proved by making all three throw", () => {
    const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const savedFetch = globalThis.fetch;
    const savedNow = Date.now;
    const explode = (what) => () => {
      throw new Error(`correlation.ts reached for ${what}`);
    };
    try {
      Object.defineProperty(globalThis, "document", {
        value: new Proxy({}, { get: explode("the DOM") }),
        configurable: true,
        writable: true,
      });
      globalThis.fetch = explode("the network");
      Date.now = explode("the clock");

      const register = new WriteRegister();
      register.open("w1-aaa", PATH);
      assert.deepEqual(readWriteEcho(withEcho({ [PATH]: ["w1-aaa"] })).outcome, "echo");
      assert.deepEqual(register.arrive(new Map([[PATH, ["w1-aaa"]]])).matched, ["w1-aaa"]);
      register.clear();
    } finally {
      if (savedDocument === undefined) {
        delete globalThis.document;
      } else {
        Object.defineProperty(globalThis, "document", savedDocument);
      }
      globalThis.fetch = savedFetch;
      Date.now = savedNow;
    }
  });
});

describe("1b. WriteRegister — MY write landed, not that some write did", () => {
  const OTHER = "work/inbox.md";

  test("MATCHED — the token this browser opened, under the path it went to", () => {
    const register = new WriteRegister();
    register.open("w1-mine", PATH);
    const echo = register.arrive(new Map([[PATH, ["w1-mine"]]]));
    assert.deepEqual(echo.matched, ["w1-mine"]);
    assert.equal(register.waiting("w1-mine"), false, "a matched token is no longer outstanding");
  });

  test("A TOKEN THIS BROWSER NEVER OPENED IS IGNORED — 'some write landed' is not the question", () => {
    const register = new WriteRegister();
    register.open("w1-mine", PATH);
    const echo = register.arrive(new Map([[PATH, ["w1-somebody-else"]]]));
    assert.deepEqual(echo.matched, []);
    assert.equal(register.waiting("w1-mine"), true);
  });

  test("MATCHING IS PER PATH — the same token under another file's key acknowledges another write", () => {
    // The narrowing the server's own claim requires: it says "accepted a write carrying this token
    // FOR THIS PATH". Loosening this is how a write to one file would clear a held row of another.
    const register = new WriteRegister();
    register.open("w1-mine", PATH);
    assert.deepEqual(register.arrive(new Map([[OTHER, ["w1-mine"]]])).matched, []);
    assert.equal(register.waiting("w1-mine"), true);
  });

  test("TWO WRITES TO ONE PATH — each is answered on its own token, not on the file's", () => {
    // The operator ticks a box and commits a line inside one cycle. Both writes are to one file and
    // both are in the air. A per-path count could only say "a write of this file was acknowledged";
    // this says WHICH.
    const register = new WriteRegister();
    register.open("w1-tick", PATH);
    register.open("w1-line", PATH);

    const first = register.arrive(new Map([[PATH, ["w1-tick"]]]));
    assert.deepEqual(first.matched, ["w1-tick"]);
    assert.equal(register.waiting("w1-line"), true, "the second write was answered by the first's echo");

    const second = register.arrive(new Map([[PATH, ["w1-tick", "w1-line"]]]));
    assert.deepEqual(second.matched, ["w1-line"]);
    assert.equal(register.outstanding(), 0);
  });

  test("GIVING UP NEEDS THE ARRIVAL TO HAVE SPOKEN ABOUT THE FILE", () => {
    // An echo that never mentions the path had no occasion to acknowledge the write. Reading
    // evidence out of that silence is exactly what the server's caps and TTL make wrong.
    const register = new WriteRegister();
    register.open("w1-mine", PATH);
    for (let i = 0; i < 10; i += 1) {
      assert.deepEqual(register.arrive(new Map([[OTHER, ["w1-other"]]])).gaveUp, []);
    }
    assert.equal(register.waiting("w1-mine"), true, "silence about the file expired a write");
  });

  test("AND IT DOES RUN OUT — three arrivals naming the file without naming the token", () => {
    const register = new WriteRegister();
    register.open("w1-mine", PATH);
    const named = new Map([[PATH, ["w1-somebody-else"]]]);
    assert.deepEqual(register.arrive(named).gaveUp, []);
    assert.deepEqual(register.arrive(named).gaveUp, []);
    assert.deepEqual(register.arrive(named).gaveUp, ["w1-mine"]);
    assert.equal(register.outstanding(), 0);
  });

  test("A 409 CLOSES ONE BY HAND, and closing releases nothing", () => {
    const register = new WriteRegister();
    register.open("w1-refused", PATH);
    assert.equal(register.giveUp("w1-refused"), true);
    assert.equal(register.giveUp("w1-refused"), false, "giving up twice must not report twice");
  });

  test("BOUNDED — the register cannot grow without limit across a long session", () => {
    const register = new WriteRegister();
    for (let i = 0; i < 500; i += 1) {
      register.open(`w1-${i}`, PATH);
    }
    assert.ok(register.outstanding() <= 64, `the register grew to ${register.outstanding()}`);
    assert.equal(register.waiting("w1-499"), true, "the newest write was evicted rather than the oldest");
  });
});

describe("1c. HeldSurface.landed — release on evidence, and on nothing weaker", () => {
  const row = (over = {}) => ({
    text: "- [ ] Ring the dentist",
    view: "inbox",
    path: "inbox.md",
    instance: null,
    node: null,
    base: null,
    token: "w1-mine",
    ...over,
  });

  test("RELEASED — the row whose write the server acknowledged", () => {
    const held = new HeldSurface();
    held.hold(heldFrom("vanished", row()));
    assert.equal(held.landed(["w1-mine"]).length, 1);
    assert.equal(held.count, 0);
  });

  test("NOT RELEASED — a row carrying no token, however many tokens are named", () => {
    // Every REFUSED row and every UNPLACED one. No token, no evidence, no release — stated as code
    // rather than as a promise.
    const held = new HeldSurface();
    held.hold(heldFrom("refused", row({ token: null })));
    assert.equal(held.landed(["w1-mine", "w1-anything"]).length, 0);
    assert.equal(held.count, 1);
  });

  test("NOT RELEASED — an empty echo is a no-op, which is the shipping condition at this layer", () => {
    const held = new HeldSurface();
    held.hold(heldFrom("vanished", row()));
    assert.deepEqual(held.landed([]), []);
    assert.equal(held.count, 1);
  });

  test("NOT RELEASED — another write's token", () => {
    const held = new HeldSurface();
    held.hold(heldFrom("vanished", row()));
    assert.equal(held.landed(["w1-somebody-else"]).length, 0);
    assert.equal(held.count, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THROUGH THE REAL PAGE — the false positive, reproduced and then removed
// ══════════════════════════════════════════════════════════════════════════════════════════════

const OTHER_PATH = "work/inbox.md";

/** An unstamped line the operator is about to type into — his own capture shape. */
const BARE = ["# This Week", "", "## Overdue", "- [ ] Ring the dentist", ""].join("\n");
const TYPED = "- [ ] Ring the dentist #work";

/**
 * WHAT A REAL CYCLE DOES TO IT, AND WHY NO TEXT COMPARISON CAN FIND IT AGAIN. The node is minted and
 * the line leaves this view — the exact shape `tests/present-replay.test.mjs` §1 measures against the
 * operator's own vault. `HeldSurface.settle` sees a file that does not contain his characters, so
 * before write correlation this held a row for a line that saved perfectly.
 */
const STAMPED_ELSEWHERE = ["# This Week", "", "## Overdue", ""].join("\n");

const WORK_ECHOING = makeWorkDir("write-correlation-echoing");
const WORK_SILENT = makeWorkDir("write-correlation-silent");
const WORK_MUTANT = makeWorkDir("write-correlation-mutant");

/**
 * ONE DRIVER FOR EVERY ARM, so the echoing page, the silent page and the mutated page are driven by
 * identical code and a difference in outcome can only be the thing the arm changed.
 *
 * `control.echo` IS THE WHOLE OF THE SERVER HALF. `null` means the answer carries no `writes` key at
 * all — which is the deployed server, and §3's entire subject. A function means the answer carries
 * whatever that function returns for the token it was posted.
 */
function makeDriver(page, browser, control) {
  const settle = () => new Promise((r) => setImmediate(r));
  const elements = browser.elements;
  const use = () => {
    globalThis.document = browser.document;
    globalThis.fetch = browser.fetch;
  };
  const view = (markdown, id, path) => ({ id, path, title: id, domain: "work", markdown });
  const envelope = (markdown, writes) => {
    const snapshot = {
      generated_at: "2026-08-01T09:00:00Z",
      views: [view(markdown, "this-week", PATH), view("# Inbox\n", "inbox", OTHER_PATH)],
    };
    if (writes !== null) {
      snapshot.writes = writes;
    }
    return { ok: true, handle: "luke", pending_edits: 0, snapshot };
  };

  const land = (markdown, id = "this-week", writes = null) => {
    use();
    const data = envelope(markdown, writes);
    page.__setGraphData(data);
    page.paintView(id);
    page.__sayAsOf(data);
    return elements.get("freshness").textContent;
  };

  const taskText = () =>
    walk(elements.get("viewBody")).find((el) => el.tagName === "span" && el.innerHTML !== "");
  const openInput = () => walk(elements.get("viewBody")).find((el) => el.type === "text");

  const open = (markdown) => {
    land(markdown);
    use();
    page.__setFocus(0, markdown);
    page.paintView("this-week");
  };

  /**
   * A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
   * `i` that arms it for typing.
   */
  async function typeAndCommit(before, text) {
    open(before);
    taskText().dispatch("click", makeEvent());
    page.__enterInsert();
    const input = openInput();
    input.value = text;
    input.dispatch("blur");
    await settle();
  }

  return {
    page,
    elements,
    settle,
    land,
    typeAndCommit,
    envelope,
    control,
    freshness: () => elements.get("freshness").textContent,
    heldTexts: () =>
      walk(elements.get("heldRows"))
        .filter((el) => el.tagName === "input")
        .map((el) => el.value),
    stripHidden: () => elements.get("heldStrip").classList.contains("hidden"),
    arm: () => {
      land("# Inbox\n", "inbox");
      page.__held().clear();
      page.__paintHeldRows();
      page.__writes().clear();
      control.refuseWith = null;
      control.nextProjection = null;
      control.posted.length = 0;
    },
  };
}

async function standUpPage(workDir, mutate) {
  const browser = installBrowser();
  const control = { refuseWith: null, nextProjection: null, posted: [], echo: null };
  browser.fetch = async (url, init) => {
    if (control.refuseWith) {
      return { ok: false, status: control.refuseWith.status, json: async () => control.refuseWith.body };
    }
    const body = JSON.parse(init.body);
    control.posted.push(body);
    const markdown = control.nextProjection ?? body.markdown;
    const snapshot = {
      generated_at: "2026-08-01T09:00:00Z",
      views: [
        { id: "this-week", path: PATH, title: "This Week", domain: "work", markdown },
        { id: "inbox", path: OTHER_PATH, title: "Inbox", domain: "work", markdown: "# Inbox\n" },
      ],
    };
    // THE SERVER HALF, OR ITS ABSENCE. `null` is the deployed server: no `writes` key at all.
    const writes = control.echo === null ? null : control.echo(body);
    if (writes !== null) {
      snapshot.writes = writes;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot }),
    };
  };
  globalThis.fetch = browser.fetch;
  const page = await importPage(workDir, mutate);
  page.__setToken("session");
  return makeDriver(page, browser, control);
}

/** The echoing server: it names back exactly the token it was posted, under the path it was posted. */
const echoesTheToken = (body) => (body.token ? { [body.path]: [body.token] } : {});

describe("2. THE FALSE POSITIVE — a line that saved perfectly is NOT held", () => {
  let d;

  before(async () => {
    d = await standUpPage(WORK_ECHOING);
  });

  test("THE WRITE CARRIES A TOKEN, and it is the shape `mintWriteToken` declares", async () => {
    d.arm();
    d.control.echo = echoesTheToken;
    d.control.nextProjection = STAMPED_ELSEWHERE;
    await d.typeAndCommit(BARE, TYPED);

    assert.ok(d.control.posted.length >= 1, "the arm posted nothing");
    const posted = d.control.posted[d.control.posted.length - 1];
    assert.match(posted.token, /^w1-[0-9a-f]{32}$/, `no token on the wire: ${JSON.stringify(posted)}`);
    assert.equal(typeof posted.base, "string", "the base stopped being carried");
    assert.equal(posted.path, PATH);
  });

  test("AND THE ROW IS NOT HELD — the cycle rewrote the line, the server acknowledged the write", () => {
    // THE DEFECT, GONE. `STAMPED_ELSEWHERE` does not contain his characters in any form, so
    // `HeldSurface.settle` cannot release the row and never could. What released it is the server
    // naming the token this write went out on.
    assert.deepEqual(d.heldTexts(), [], "a line that saved perfectly is on the recovery strip");
    assert.equal(d.page.__held().count, 0);
    assert.equal(d.stripHidden(), true, "the strip is showing with nothing in it");
  });

  test("AND THE FRESHNESS LINE SAYS SO WITHOUT CLAIMING THE LINE WAS WRITTEN", () => {
    const said = d.freshness();
    assert.match(said, /the cycle rewrote the line you saved/);
    assert.match(said, /the server recorded it/);
    assert.doesNotMatch(said, /held above/, "the page said the characters are held when they are not");
    assert.doesNotMatch(said, /\bwritten\b/, "the page claimed written when it means recorded");
  });

  test("THE ECHO ARRIVING LATER RELEASES A ROW THAT IS ALREADY HELD", async () => {
    // The other half of the contract: the acknowledgement can arrive on a `GET /graph` served after
    // the write's own answer. The row is held by the write's answer (no echo on it) and released by
    // the next projection that names the token.
    d.arm();
    d.control.echo = () => ({});
    d.control.nextProjection = STAMPED_ELSEWHERE;
    await d.typeAndCommit(BARE, TYPED);
    assert.deepEqual(d.heldTexts(), [TYPED], "the arm did not set up — nothing was held");

    const token = d.control.posted[d.control.posted.length - 1].token;
    d.page.__correlate(PATH, d.envelope(STAMPED_ELSEWHERE, { [PATH]: [token] }));

    assert.deepEqual(d.heldTexts(), [], "a later echo did not clear the row it acknowledged");
    assert.equal(d.stripHidden(), true);
  });

  test("AN UNMATCHED WRITE KEEPS ITS ROW HELD — for as long as the register waits, and after", async () => {
    // The whole safety argument in one arm. The server never names this write; the row stays.
    d.arm();
    d.control.echo = () => ({});
    d.control.nextProjection = STAMPED_ELSEWHERE;
    await d.typeAndCommit(BARE, TYPED);
    assert.deepEqual(d.heldTexts(), [TYPED]);

    // Four more arrivals that NAME the file without naming the token — past the grace, so the
    // register has given the write up entirely.
    for (let i = 0; i < 4; i += 1) {
      d.page.__correlate(PATH, d.envelope(STAMPED_ELSEWHERE, { [PATH]: ["w1-somebody-else"] }));
    }
    assert.equal(d.page.__writes().outstanding(), 0, "the arm did not reach the give-up");
    assert.deepEqual(d.heldTexts(), [TYPED], "GIVING UP RELEASED A ROW — his characters were dropped");
  });

  test("A ROW HELD FOR A DIFFERENT REASON IS UNTOUCHED BY ANY ECHO", () => {
    // A REFUSED row carries no token because a 409 means nothing was written, so no echo can exist
    // for it. It must survive an echo that names every token in the world.
    d.arm();
    d.page.__held().hold(
      heldFrom("refused", {
        text: "- [ ] Something the server declined",
        view: "this-week",
        path: PATH,
        instance: null,
        node: null,
        base: "sha256-x",
        token: null,
      }),
    );
    d.page.__paintHeldRows();
    d.page.__correlate(PATH, d.envelope(BARE, { [PATH]: ["w1-aaa", "w1-bbb"] }));
    assert.deepEqual(d.heldTexts(), ["- [ ] Something the server declined"]);
  });

  test("AN UNRECOGNISED ECHO IS REPORTED AND RELEASES NOTHING", async () => {
    d.arm();
    d.control.echo = () => ({});
    d.control.nextProjection = STAMPED_ELSEWHERE;
    await d.typeAndCommit(BARE, TYPED);
    assert.deepEqual(d.heldTexts(), [TYPED], "the arm did not set up");
    const token = d.control.posted[d.control.posted.length - 1].token;

    const warnings = [];
    const savedWarn = console.warn;
    try {
      console.warn = (message) => warnings.push(String(message));
      // The token IS in there — under a shape the reader does not declare. A reader that guessed
      // would release the row; this one refuses and says why.
      d.page.__correlate(PATH, d.envelope(STAMPED_ELSEWHERE, { [PATH]: token }));
    } finally {
      console.warn = savedWarn;
    }

    assert.equal(warnings.length, 1, `expected one reported problem, got ${JSON.stringify(warnings)}`);
    assert.match(warnings[0], /is not a list of write tokens/);
    assert.deepEqual(d.heldTexts(), [TYPED], "a shape nobody agreed released the operator's characters");
  });

  test("TWO WRITES TO ONE PATH — the tick's echo does not answer for the line commit", async () => {
    d.arm();
    d.control.echo = () => ({});
    d.control.nextProjection = STAMPED_ELSEWHERE;
    await d.typeAndCommit(BARE, TYPED);
    const lineToken = d.control.posted[d.control.posted.length - 1].token;
    assert.deepEqual(d.heldTexts(), [TYPED], "the arm did not set up");

    // A DIFFERENT write of the SAME file is acknowledged. The row must not move.
    d.page.__correlate(PATH, d.envelope(STAMPED_ELSEWHERE, { [PATH]: ["w1-a-different-write"] }));
    assert.deepEqual(d.heldTexts(), [TYPED], "another write of the same file cleared this row");

    // And now its own.
    d.page.__correlate(PATH, d.envelope(STAMPED_ELSEWHERE, { [PATH]: ["w1-a-different-write", lineToken] }));
    assert.deepEqual(d.heldTexts(), []);
  });

  test("THE SAME TOKEN UNDER ANOTHER FILE'S KEY RELEASES NOTHING", async () => {
    d.arm();
    d.control.echo = () => ({});
    d.control.nextProjection = STAMPED_ELSEWHERE;
    await d.typeAndCommit(BARE, TYPED);
    const token = d.control.posted[d.control.posted.length - 1].token;
    assert.deepEqual(d.heldTexts(), [TYPED], "the arm did not set up");

    d.page.__correlate(OTHER_PATH, d.envelope(STAMPED_ELSEWHERE, { [OTHER_PATH]: [token] }));
    assert.deepEqual(d.heldTexts(), [TYPED], "an acknowledgement for another file released this row");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE SHIPPING CONDITION — a server that echoes nothing behaves EXACTLY as today
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. A SERVER THAT ECHOES NOTHING — the arm this change ships on", () => {
  let d;

  before(async () => {
    d = await standUpPage(WORK_SILENT);
  });

  test("THE ROW IS HELD, exactly as it was before correlation existed", async () => {
    d.arm();
    d.control.echo = null; // no `writes` key on the answer at all — the deployed server
    d.control.nextProjection = STAMPED_ELSEWHERE;
    await d.typeAndCommit(BARE, TYPED);

    assert.deepEqual(d.heldTexts(), [TYPED], "the recovery strip stopped catching a vanished line");
    assert.equal(d.stripHidden(), false);
  });

  test("AND THE FRESHNESS LINE SAYS WHAT IT ALWAYS SAID — no new sentence appears", () => {
    const said = d.freshness();
    assert.match(said, /the line you were on is not in this view any more — what was on it is held above this view/);
    assert.doesNotMatch(said, /the server recorded your save/);
    assert.doesNotMatch(said, /the server took your save/);
    assert.doesNotMatch(said, /the cycle rewrote the line you saved/);
  });

  test("AND THE REGISTER NEVER SPOKE — nothing was matched and nothing was expired", () => {
    // `correlate` returns on `silent` before the register is touched. The write stays outstanding
    // because the server never said anything about it, which is the truth.
    assert.equal(d.page.__writes().outstanding(PATH), 1, "a silent server moved the register");
  });

  test("AND THE POST IS WHAT IT ALWAYS WAS, PLUS ONE FIELD A SERVER MAY IGNORE", () => {
    const posted = d.control.posted[d.control.posted.length - 1];
    assert.deepEqual(
      Object.keys(posted).sort(),
      // `ack` IS THE FIFTH FIELD AND IT IS THE ONE THIS BRANCH ADDED — see `writeFile`'s own
      // paragraph. Like `base` and `token` before it, it is a field a server may ignore: a Worker
      // that has never read it answers synchronously with its projection in it, which is byte for
      // byte the answer this page has always handled. Unlike those two it is UNCONDITIONAL, and it
      // can be: `base` and `token` are absent when the browser has nothing to say, and this one is
      // never that — "do not make me wait for the cycle" is true of every write this app makes.
      ["ack", "base", "markdown", "path", "token"],
      "the write path gained or lost a field",
    );
  });

  test("AND WITH NO CSPRNG THE BODY IS BYTE-FOR-BYTE WHAT IT WAS — no `token` key at all", async () => {
    // The other half of the shipping condition, and the reason `mintWriteToken` returns `null`
    // rather than a weak token: the absent field, never an empty one.
    d.arm();
    d.control.echo = null;
    d.control.nextProjection = STAMPED_ELSEWHERE;
    const savedCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    try {
      Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
      await d.typeAndCommit(BARE, TYPED);
    } finally {
      if (savedCrypto === undefined) {
        delete globalThis.crypto;
      } else {
        Object.defineProperty(globalThis, "crypto", savedCrypto);
      }
    }
    const posted = d.control.posted[d.control.posted.length - 1];
    // `ack` SURVIVES THE MISSING CSPRNG AND `token` DOES NOT, which is the whole shape of the two
    // fields stated side by side: one is a claim about THIS BROWSER'S randomness and is dropped when
    // there is none, the other is a request about the SERVER'S sequencing and is true either way.
    assert.deepEqual(Object.keys(posted).sort(), ["ack", "base", "markdown", "path"]);
    assert.equal("token" in posted, false, "an empty token reached the wire");
    assert.deepEqual(d.heldTexts(), [TYPED], "the row stopped being held without a token to hold it by");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. NOTHING CORRELATED REACHES A WRITE — the pinned sites, re-counted on this branch
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. THE INVARIANTS, ASSERTED AT THE VALUE LEVEL", () => {
  const APP_SOURCE = readFileSync(resolve(HERE, "..", "app", "index.html"), "utf8");
  const PAINT_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "paint.ts"), "utf8");
  const CORRELATION_TS = readFileSync(join(REPO, "app", "present", "correlation.ts"), "utf8");
  const codeOf = (source) =>
    source
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const CORRELATION_CODE = codeOf(CORRELATION_TS);

  test("`graphData` is STILL assigned in exactly four places, and to what it always was", () => {
    const assigned = (APP_SOURCE.match(/\bgraphData\s*=(?!=)\s*([A-Za-z0-9_$.]+)/g) ?? []).map((site) =>
      site.replace(/^.*=\s*/, ""),
    );
    assert.equal(assigned.length, 4, "correlation added a client-computed graphData write");
    for (const value of assigned) {
      assert.ok(
        value === "data" || value === "pending.data" || value === "null",
        `graphData was assigned from ${value} — only an envelope off the wire may reach it`,
      );
    }
  });

  test("`writeFile` STILL has exactly two callers — toggleTask and commitLine", () => {
    assert.equal((APP_SOURCE.match(/\bwriteFile\(/g) ?? []).length, 3, "a new write path appeared");
  });

  test("`applyEdit` is STILL reached from exactly five sites outside its own module", () => {
    assert.equal((APP_SOURCE.match(/\bapplyEdit\(/g) ?? []).length, 2);
    assert.equal((PAINT_SOURCE.match(/\bapplyEdit\(/g) ?? []).length, 3);
  });

  test("`.markdown` is STILL never ASSIGNED in app/", () => {
    const assignments = (source) => source.match(/\.markdown\s*=(?!=)/g) ?? [];
    assert.deepEqual(assignments(APP_SOURCE), []);
    assert.deepEqual(assignments(PAINT_SOURCE), []);
    assert.deepEqual(assignments(CORRELATION_TS), []);
  });

  test("correlation.ts IMPORTS ONLY THE STAMP GRAMMAR and names no edit constructor", () => {
    // The same structural argument `held.ts` makes: a module that cannot reach `applyEdit` cannot
    // be "helped" into posting what it holds. This one holds the operator's own write handles.
    //
    // ── IT IMPORTED NOTHING UNTIL `stampsOwed` LANDED, AND THE ONE IMPORT IS NAMED RATHER THAN
    //    ALLOWED ──
    //
    // Asking "has the engine stamped this line" means matching `[[qntm:N]]`, and this repository
    // has exactly ONE grammar for that (`resolution.ts`'s `QNTM_ID`, cited against the engine and
    // tested against the citation). A second regex here would be the "parallel regex" that module's
    // own header forbids by name — so the import is the cheaper of two costs, and the guard is
    // narrowed to the exact module rather than dropped. `resolution.ts` exports no edit
    // constructor, no writer and no path: it is spans over strings, so the structural argument
    // above is untouched. A SECOND import, or a different one, still turns this red.
    assert.deepEqual(
      CORRELATION_CODE.match(/^import\b.*$/gm),
      ['import { stampSpans } from "./resolution.js";'],
      "correlation.ts gained an import that is not the stamp grammar",
    );
    assert.equal(CORRELATION_CODE.match(/\bapplyEdit\b|\bSourceEdit\b|\bmarkdown\b/g), null);
  });

  test("THE REGISTER IS REACHED IN EXACTLY SIX PLACES, and none of them is a write of a file", () => {
    // SIX RATHER THAN FIVE SINCE THE PICKUP, AND THE SIXTH IS A QUESTION. `writes.waiting(token)` is
    // asked twice by `collect` — once before the read, so a pickup that is no longer owed costs no
    // request, and once after it, to tell the schedule whether the answer arrived. It takes a token
    // and returns a boolean: it cannot open a write, cannot close one, and cannot reach a path, a
    // markdown or a POST. The name is asserted rather than the count, so a seventh reach has to be
    // justified here rather than absorbed by a number.
    const reads = codeOf(APP_SOURCE).match(/\bwrites\.[A-Za-z]\w*/g) ?? [];
    assert.deepEqual(
      [...new Set(reads)].sort(),
      ["writes.arrive", "writes.clear", "writes.giveUp", "writes.open", "writes.outstanding", "writes.waiting"],
      "a new way to reach the write register appeared — check it cannot reach a POST",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE MUTATION PROOF — break the matching, and §2's own assertion goes red
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. MUTATION PROOF — neuter the match, and the false positive comes straight back", () => {
  let d;

  before(async () => {
    // ONE EXPRESSION, AND IT IS THE MATCH ITSELF. `proved` is what decides whether the vanished row
    // is held at all; forcing it false is exactly "the browser cannot recognise its own write".
    d = await standUpPage(WORK_MUTANT, (source) =>
      assertMutated(
        source,
        "const proved = mine && sent.token !== null && landed.has(sent.token);",
        "const proved = false && mine && sent.token !== null && landed.has(sent.token);",
      ),
    );
  });

  test("with the match broken, a line that saved perfectly is held again", async () => {
    d.arm();
    d.control.echo = echoesTheToken;
    d.control.nextProjection = STAMPED_ELSEWHERE;
    await d.typeAndCommit(BARE, TYPED);

    assert.throws(
      () => assert.deepEqual(d.heldTexts(), []),
      /Expected values to be loosely deep-equal|Expected values to be strictly deep-equal/,
      "the matching was removed and §2's assertion still passed — the guard proves nothing",
    );
    // AND THE PAGE IS OTHERWISE UNHARMED, which is what makes this a mutation of the MATCH rather
    // than of the app: the write still carries its token, so it is genuinely the recognition that
    // went and not the whole correlation path.
    assert.match(d.control.posted[d.control.posted.length - 1].token, /^w1-[0-9a-f]{32}$/);
  });
});

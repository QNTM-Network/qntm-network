/**
 * THE WRITE IS REFUSED SERVER-SIDE — design-the-resolution-architecture.md step 13, the last of
 * the sequence, and the half of it that lives in this repository.
 *
 *   node --test tests/app-stale-write-refusal.test.mjs
 *
 * ── WHAT THE ROW ASKED, AND THE ANSWER THIS SUITE IS EVIDENCE FOR ──
 *
 * `the-write-is-refused-server-side` has two halves. (a) `POST /app/edit-file` takes
 * `{path, markdown, base}` and answers 409 with the current content when `base` does not match.
 * (b) something must be able to say what the file says NOW.
 *
 * (b) DOES NOT EXIST. `server/app.py` (read 2026-08-01, sibling repo) offers `POST /vault/file`,
 * an unconditional `target.write_text(...)` with no comparison in it, and `GET /graph`, the whole
 * 77-view envelope. There is no per-file read. So the only refusal this Worker could build alone is
 * READ-THEN-WRITE, and the row already judges check-then-act weaker — between the read and the
 * write a cycle can rewrite the file and the write clobbers it anyway.
 *
 * AND THERE IS A SECOND REASON, WHICH IS THE DECIDING ONE. A refusal is only safe once the BROWSER
 * can hold a refused edit's characters. A stale base is an ORDINARY event on this path — a second
 * edit inside one ~14 s cycle produces one, which tests/present-base.test.mjs's ARM 2 already
 * measures — so a live refusal would fire during normal use. Until the holding half exists, that
 * trades a silent loss of the ENGINE'S output for a visible loss of the OPERATOR'S typing.
 *
 * SO WHAT IS PROVEN HERE IS THE WORKER HALF, COMPLETE AND INERT: the precondition is carried, the
 * graph server's refusal is translated faithfully, and the page answers a refusal without
 * destroying what he typed. The day `POST /vault/file` learns to compare, all of it wakes up with
 * no further change in this repository. Every arm below is a FIXTURE. No live server was contacted.
 *
 * ── THE PROPERTY THAT MATTERS MOST IS A NEGATIVE ONE ──
 *
 * A wrongly-refused write is worse than the clobber, because it means he cannot save. So the
 * assertions are weighted towards what CANNOT happen: `§1` proves that the only thing in the Worker
 * that can produce a 409 is the graph server's own 409, that an absent `base` is not merely ignored
 * but is NOT ON THE WIRE AT ALL, and that every other upstream answer still behaves exactly as it
 * did before this change.
 */

import { test, describe, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { handleApp } from "../worker/src/app.js";
import { importPage, installBrowser, makeEvent, makeWorkDir, walk, REPO } from "./fixtures/app-html-page.mjs";

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE WORKER — worker/src/app.js, POST /app/edit-file
// ══════════════════════════════════════════════════════════════════════════════════════════════

const OPERATOR_ID = "a19e4c66-af5d-4114-a928-d2c63b503374";
const OPERATOR_TOKEN = "session-token-operator";
const SESSIONS = { [OPERATOR_TOKEN]: { user_id: OPERATOR_ID, handle: "qntm" } };

const PATH = "work/outcomes.md";
const SERVED = "# This Week\n\n- [ ] Draft the launch note [[qntm:121]] #task\n";
const EDITED = "# This Week\n\n- [x] Draft the launch note [[qntm:121]] #task\n";
/** What the cycle wrote while he was typing — `#blocked` is a rule's output, nobody typed it. */
const MOVED_ON = "# This Week\n\n- [ ] Draft the launch note [[qntm:121]] #task #blocked\n";

/** The token app/present/base.ts puts on the wire. Not recomputed here — the shipped one. */
let baseOf;
before(async () => {
  ({ baseOf } = await import(join(REPO, "dist", "present.js")));
});

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

const ENVELOPE = {
  generated_at: "2026-08-01T09:00:00Z",
  views: [{ id: "this-week", path: PATH, title: "This Week", markdown: MOVED_ON }],
  graph: {},
  locations: {},
};

const jsonResponse = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/** Every call the Worker made to the box, and the body of the write among them. */
let calls;
/** What the fixture graph server answers `POST /vault/file` with. Set per arm. */
let vaultFileAnswer;
const realFetch = globalThis.fetch;

/**
 * The box, stood up around section 1's arms ONLY.
 *
 * SCOPED RATHER THAN FILE-WIDE, and it is not tidiness: section 2 drives the page, which has a
 * `fetch` stub of its own, and a file-level `beforeEach` replaces it before every one of its arms.
 * Measured — every page arm failed with `unstubbed fetch`, and two of them failed by taking the
 * ORDINARY failure branch, which is the exact branch section 2 exists to tell apart from a refusal.
 */
function installTheBox() {
  beforeEach(() => {
    calls = [];
    vaultFileAnswer = () => jsonResponse({ ok: true, path: PATH });
    globalThis.fetch = async (url, init = {}) => {
      const route = new URL(String(url)).pathname;
      calls.push({
        route,
        method: init.method || "GET",
        body: init.body ? JSON.parse(init.body) : null,
      });
      if (route === "/vault/file") return vaultFileAnswer();
      if (route === "/cycle") return jsonResponse({ ok: true, snapshot: ENVELOPE });
      if (route === "/graph") return jsonResponse(ENVELOPE);
      throw new Error(`unstubbed fetch: ${url}`);
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });
}

async function editFile(body) {
  const url = new URL("https://api.example/app/edit-file");
  const request = new Request(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await handleApp(request, ENV(), url, "https://qntm.network");
  assert.ok(res, "handleApp did not route POST /app/edit-file");
  return { status: res.status, body: await res.json() };
}

const routes = () => calls.map((c) => `${c.method} ${c.route}`);
const written = () => calls.find((c) => c.route === "/vault/file")?.body;

describe("POST /app/edit-file carries the precondition — and carries nothing when there is none", () => {
  installTheBox();

  test("A MATCHING BASE WRITES, and the token reaches the graph server byte for byte", async () => {
    const base = baseOf(SERVED);
    const { status, body } = await editFile({ path: PATH, markdown: EDITED, base });

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(written().base, base, "the precondition never reached the box");
    assert.deepEqual(written().markdown, EDITED, "and the file it claims to replace must go too");
    assert.deepEqual(routes(), ["POST /vault/file", "POST /cycle"], "a write then a cycle, as before");
  });

  test("AN ABSENT BASE WRITES, and `base` is ABSENT ON THE WIRE — not empty, not null", async () => {
    // The row is exact about this: the field is absent when there is none, so a server reading it
    // never has to tell "no base" from "the wrong base". A Worker that substituted "" or null for a
    // missing one would hand the receiver a claim the browser never made.
    const { status, body } = await editFile({ path: PATH, markdown: EDITED });

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.ok(!("base" in written()), "an absent base must not become a present one");
    assert.deepEqual(Object.keys(written()).sort(), ["markdown", "path"], "and nothing else is added");
    assert.deepEqual(routes(), ["POST /vault/file", "POST /cycle"], "it writes exactly as it did before");
  });

  for (const [label, base] of [
    ["an empty string", ""],
    ["null", null],
    ["a number", 7],
    ["an object", { sha: "x" }],
  ]) {
    test(`FAIL OPEN — a base that is ${label} is not forwarded, and the write still goes`, async () => {
      const { status } = await editFile({ path: PATH, markdown: EDITED, base });

      assert.equal(status, 200, "an unreadable claim must never cost the operator his save");
      assert.ok(!("base" in written()), "and it must not be passed off as a claim either");
      assert.deepEqual(routes(), ["POST /vault/file", "POST /cycle"]);
    });
  }
});

describe("ONLY A POSITIVE MISMATCH REFUSES — and the mismatch is never this Worker's opinion", () => {
  installTheBox();

  test("THE FALSIFIER — a POST carrying a stale base is rejected, not applied", async () => {
    // The graph server compares and says no. This is the arm the row's own falsifier names, and it
    // is a FIXTURE: no deployed graph server answers 409 today.
    vaultFileAnswer = () => jsonResponse({ ok: false, error: "stale base", current: MOVED_ON }, 409);

    const { status, body } = await editFile({ path: PATH, markdown: EDITED, base: baseOf(SERVED) });

    assert.equal(status, 409, "a distinguishable status, not the blanket 502");
    assert.equal(body.ok, false);
    assert.equal(body.refused, "stale-base");
    assert.equal(body.current, MOVED_ON, "409 must answer with what the file says now");
    assert.equal(body.path, PATH);
    assert.match(body.error, /nothing was written/);
    // THE ASSERTION THAT MAKES IT A REFUSAL RATHER THAN A REPORT. A cycle after a refused write
    // would hand the browser a fresh projection and let it believe its edit had been ingested.
    assert.deepEqual(routes(), ["POST /vault/file"], "no cycle may run behind a refused write");
  });

  test("a 409 that carries no current content is still a refusal, and `current` is null", async () => {
    // Nothing here reconstructs what the server did not send. `null` is the honest answer and it is
    // what the future holding half must be written against.
    vaultFileAnswer = () => jsonResponse({ ok: false }, 409);

    const { status, body } = await editFile({ path: PATH, markdown: EDITED, base: baseOf(SERVED) });

    assert.equal(status, 409);
    assert.equal(body.current, null);
    assert.deepEqual(routes(), ["POST /vault/file"]);
  });

  test("PROOF IT CANNOT REJECT ONE IT SHOULD NOT — a base this Worker has no way to check", async () => {
    // The Worker holds no copy of the file and computes no digest, so a base that is nonsense, or
    // stale, or from another file entirely is still just a string it hands on. The graph server
    // answers 200; the write lands. There is no code path in which the Worker decides.
    for (const base of [baseOf(MOVED_ON), "sha256-" + "0".repeat(64), "not-a-digest"]) {
      calls = [];
      const { status, body } = await editFile({ path: PATH, markdown: EDITED, base });
      assert.equal(status, 200, `the Worker adjudicated a base it cannot check (${base})`);
      assert.equal(body.ok, true);
      assert.deepEqual(routes(), ["POST /vault/file", "POST /cycle"]);
    }
  });

  for (const [label, status] of [
    ["500 — the box fell over", 500],
    ["502 — the box is unreachable", 502],
    ["422 — the box rejected the shape", 422],
    ["401 — the server token is wrong", 401],
  ]) {
    test(`NOT A REFUSAL: ${label} is still the 502 it has always been`, async () => {
      vaultFileAnswer = () => jsonResponse({ ok: false, error: "no" }, status);

      const answer = await editFile({ path: PATH, markdown: EDITED, base: baseOf(SERVED) });

      assert.equal(answer.status, 502, "only 409 means refused; everything else means failed");
      assert.equal(answer.body.error, "write failed");
      assert.equal(answer.body.refused, undefined);
      assert.deepEqual(routes(), ["POST /vault/file"]);
    });
  }

  test("EXACTLY ONE EXPRESSION IN THE WORKER CAN REFUSE A WRITE", () => {
    // The structural half of the same claim, because the arms above can only sample answers. If a
    // second refusal ever appears — a comparison, a digest, a read-then-write — this goes red and
    // the paragraph above it stops being true.
    const source = readFileSync(join(REPO, "worker", "src", "app.js"), "utf8");
    // COMMENTS STRIPPED FIRST — the paragraph above `editFile` explains this decision at length and
    // says "409" three times doing it, and a count that included prose would measure the essay
    // rather than the code. Measured: 5 occurrences in the file, 2 of them executable.
    const code = source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    assert.equal(
      (code.match(/\b409\b/g) || []).length,
      2,
      "409 appears exactly where it is DECIDED and where it is ANSWERED, and nowhere else",
    );
    assert.match(code, /if \(w\.status === 409\)/, "the one decision is the graph server's status");
    assert.equal(
      (code.match(/sha256|createHash|crypto\.subtle|digest|=== *body\.base|body\.base *===/g) || []).length,
      0,
      "this Worker must compute no digest and compare no base — that is an opinion it is not entitled to",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE PAGE — what a 409 does to the characters he typed
// ══════════════════════════════════════════════════════════════════════════════════════════════

const WORK = makeWorkDir("app-stale-write-refusal");

const V1 = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Draft the launch note [[qntm:121]] #task",
  "- [ ] Water the plants [[qntm:122]] #task",
  "",
].join("\n");

const TYPED = "- [ ] Draft the launch note BY FRIDAY [[qntm:121]] #task";
const REFUSED =
  "this save was computed from an out-of-date copy of this file — the server refused it and nothing was written";

const view = (markdown) => ({ id: "this-week", path: PATH, title: "This Week", domain: "work", markdown });

describe("A REFUSED SAVE DOES NOT LOSE THE OPERATOR'S CHARACTERS — through app/index.html", () => {
  let page;
  let elements;
  /** What the write endpoint answers. Set per arm; `null` means the ordinary success. */
  let refuseWith;

  const settle = () => new Promise((r) => setImmediate(r));
  const freshness = () => elements.get("freshness").textContent;

  /** Everything the painted body is showing, as one string. */
  const onScreen = () =>
    walk(elements.get("viewBody"))
      .map((el) => `${el.textContent || ""}${el.innerHTML || ""}${el.value || ""}`)
      .join("\n");

  function land(markdown) {
    const fresh = {
      ok: true,
      handle: "luke",
      pending_edits: 0,
      snapshot: { generated_at: "2026-08-01T09:00:00Z", views: [view(markdown)] },
    };
    page.__setGraphData(fresh);
    page.paintView("this-week");
    return fresh;
  }

  const taskText = () =>
    walk(elements.get("viewBody")).find((el) => el.tagName === "span" && el.innerHTML !== "");

  /** Park the cursor on the heading so `taskText()` is the first TASK, not the cursor's own line. */
  function open(markdown) {
    land(markdown);
    page.__setFocus(0, markdown);
    page.paintView("this-week");
  }

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = async (url, init) => {
      if (refuseWith) {
        return {
          ok: false,
          status: refuseWith.status,
          json: async () => refuseWith.body,
        };
      }
      const body = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          handle: "luke",
          pending_edits: 0,
          snapshot: { generated_at: "2026-08-01T09:00:00Z", views: [view(body.markdown)] },
        }),
      };
    };
    page = await importPage(WORK);
  });

  beforeEach(() => {
    refuseWith = null;
  });

  /** Open the first task's line, type `TYPED` into it, and blur — one committed line edit. */
  function typeAndCommit() {
    open(V1);
    taskText().dispatch("click", makeEvent());
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    assert.equal(input.value, V1.split("\n")[3], "the cursor did not reach the source");
    input.value = TYPED;
    input.dispatch("blur");
    return input;
  }

  test("THE FALSIFIER'S OTHER HALF — the client reports the refusal and keeps what he typed", async () => {
    refuseWith = {
      status: 409,
      body: { ok: false, error: "stale base", refused: "stale-base", path: PATH, current: MOVED_ON },
    };

    typeAndCommit();
    await settle();

    assert.match(onScreen(), /BY FRIDAY/, "the refusal deleted the characters he typed");
    assert.equal(freshness(), REFUSED + " · what you typed is still on this line");
    // AND THE PAGE DID NOT ADOPT THE SERVER'S COPY. `current` is on the wire for the holding half
    // to use; taking it as the new base here would make the NEXT save a clobber with a blessing.
    assert.equal(page.__served().markdown, V1, "the base moved to a copy the painter never saw");
  });

  test("THE CONTROL — an ordinary failure still repaints from the last server state", async () => {
    // The behaviour this change must not have altered: a write that FAILED (as opposed to one that
    // was refused) leaves the vault's state unknown, so the screen stops claiming the edit.
    refuseWith = { status: 502, body: { ok: false, error: "write failed" } };

    typeAndCommit();
    await settle();

    assert.doesNotMatch(onScreen(), /BY FRIDAY/, "a failed write kept claiming an edit the vault lacks");
    assert.match(freshness(), /^sync failed: write failed/);
  });

  test("THE OTHER CONTROL — a save that is not refused still lands, unchanged", async () => {
    typeAndCommit();
    await settle();

    assert.match(onScreen(), /BY FRIDAY/);
    assert.match(freshness(), /^as of /, "an ordinary save narrated itself as a refusal");
  });

  test("A REFUSED TICK PUTS THE BOX BACK — no characters at stake, and the box tells the truth", async () => {
    refuseWith = { status: 409, body: { ok: false, error: "stale base", refused: "stale-base" } };

    open(V1);
    const box = walk(elements.get("viewBody")).filter((el) => el.type === "checkbox")[0];
    box.checked = true;
    box.dispatch("change");
    await settle();

    assert.equal(box.checked, false, "the page kept showing a tick the vault does not have");
    assert.equal(box.disabled, false, "and it must be clickable again — he has to be able to retry");
    assert.equal(freshness(), REFUSED + " · the box is back as the server has it");
  });

  test("ONE SENTENCE, NOT TWO THAT CONTRADICT EACH OTHER", async () => {
    // The client's own detector fires on this gesture too (`BASE_REFUSALS.stale`, "…is
    // overwritten"). The server has just answered the same question better, so its word wins and
    // the guess is dropped — otherwise one line says both "nothing was written" and "is
    // overwritten" about one save.
    refuseWith = { status: 409, body: { ok: false, error: "stale base", refused: "stale-base" } };

    open(V1);
    taskText().dispatch("click", makeEvent());
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = TYPED;
    land(MOVED_ON); // the world moves under the open line — the client detects it by itself
    input.dispatch("blur");
    await settle();

    assert.equal(freshness(), REFUSED + " · what you typed is still on this line");
    assert.doesNotMatch(freshness(), /is overwritten/, "two verdicts about one save");
  });

  test("AND THE DROPPED GUESS DOES NOT SURFACE AGAINST THE NEXT SAVE", async () => {
    refuseWith = { status: 409, body: { ok: false, error: "stale base", refused: "stale-base" } };
    open(V1);
    taskText().dispatch("click", makeEvent());
    const first = walk(elements.get("viewBody")).find((el) => el.type === "text");
    first.value = TYPED;
    land(MOVED_ON);
    first.dispatch("blur");
    await settle();
    assert.match(freshness(), /the server refused it/, "the arm did not set up");

    refuseWith = null;
    open(V1);
    taskText().dispatch("click", makeEvent());
    const second = walk(elements.get("viewBody")).find((el) => el.type === "text");
    second.value = "- [ ] Draft the launch note NEXT WEEK [[qntm:121]] #task";
    second.dispatch("blur");
    await settle();

    assert.doesNotMatch(freshness(), /refused|overwritten/, "a refusal followed the next save");
  });
});

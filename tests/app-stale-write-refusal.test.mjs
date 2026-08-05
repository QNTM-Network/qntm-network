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
 * AMENDED 2026-08-01, THEN AMENDED AGAIN 2026-08-04 — THE HOLDING HALF EXISTED BRIEFLY AND WAS
 * REMOVED. `a-refused-edit-is-held-unanchored` shipped `app/present/held.ts`: a refused edit's
 * characters went into a surface no file owns, so they survived the next projection and the view
 * could safely adopt the server's file out from under them. The panel that surfaced that surface
 * was removed as legacy (`remove-held-panel`) once the browser's placement of a line stopped
 * needing a stand-in, and nothing replaced the preservation it did for a REFUSED write. So the
 * adoption reverted to the original, more conservative rule: a refusal with real typed text at
 * stake never adopts the server's file, whatever `current` says — see `refusedLineSentence`'s own
 * header. THE REFUSAL IS STILL NOT SWITCHED ON — that is `vault-file-accepts-a-precondition`, in
 * the other repository, and enabling it is the operator's decision.
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
// `REFUSED`/`REFUSED_NOT_ADOPTED` — the freshness-line sentences this file used to check against —
// are retired along with `#freshness` itself (chore/retire-the-status-line). Every arm below now
// checks the functional state `healFromRefusal` actually changes instead.

/**
 * WHAT THE SERVER ACTUALLY HOLDS BY THE TIME A REFUSAL COMES BACK, IN THE SCENARIO THAT DESTROYS A
 * LINE (`refusal-must-not-clobber`, 2026-08-03). qntm:121 — the line the operator's cursor is
 * anchored to — is GONE (completed and archived elsewhere, or ingested by an earlier write of his
 * own), so qntm:122 has shifted up into the numeric line index qntm:121 used to occupy. A raw index
 * clamp cannot tell that apart from "the same line, unchanged" — only an identity check can.
 */
const CURRENT_AFTER_CYCLE = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Water the plants [[qntm:122]] #task",
  "- [ ] Buy domain [[qntm:900]] #task",
  "",
].join("\n");

const view = (markdown) => ({ id: "this-week", path: PATH, title: "This Week", domain: "work", markdown });

describe("A REFUSED SAVE DOES NOT LOSE THE OPERATOR'S CHARACTERS — through app/index.html", () => {
  let page;
  let elements;
  /** What the write endpoint answers. Set per arm; `null` means the ordinary success. */
  let refuseWith;
  /** Every body `POST /app/edit-file` was sent, in order — the wire, which is where `base` lives. */
  let posted;

  const settle = () => new Promise((r) => setImmediate(r));

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

  /**
   * Open the first task's line for typing, whatever the view is currently showing.
   *
   * A CLICK NO LONGER ARMS INSERT ON ITS OWN — paint.ts's `focusable` only positions the cursor
   * now; `i` (here, `page.__enterInsert()`, the state-level equivalent) is what arms typing.
   */
  function openTheLine() {
    // A HEAL THAT RE-FINDS THE CURSOR BY IDENTITY (`refusal-must-not-clobber`) can leave it
    // ALREADY on the task line — the correct outcome, and an improvement over the raw-index clamp
    // it replaces, which only ever landed there by accident. `taskText()` finds the UN-FOCUSED
    // rendition only (a span with resolved HTML); a line the cursor is already on renders as
    // `paint.ts`'s `normalLine` instead (character spans, no `innerHTML`), which `taskText()` would
    // not find. A click is needed only when the cursor is not already on a real task node.
    if (page.__focusAnchor()?.node == null) {
      taskText().dispatch("click", makeEvent());
    }
    page.__enterInsert();
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    assert.ok(input, "clicking the line, then arming INSERT, did not open it for typing");
    return input;
  }

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
        posted.push(JSON.parse(init.body));
        return {
          ok: false,
          status: refuseWith.status,
          json: async () => refuseWith.body,
        };
      }
      const body = JSON.parse(init.body);
      posted.push(body);
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
    posted = [];
  });

  /**
   * Open the first task's line, type `TYPED` into it, and blur — one committed line edit.
   *
   * A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
   * `i` that arms it for typing, same as `openTheLine` above.
   */
  function typeAndCommit() {
    open(V1);
    taskText().dispatch("click", makeEvent());
    page.__enterInsert();
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    assert.equal(input.value, V1.split("\n")[3], "the cursor did not reach the source");
    input.value = TYPED;
    input.dispatch("blur");
    return input;
  }

  test("THE FALSIFIER'S OTHER HALF — the client reports the refusal and keeps what he typed", async () => {
    // THE RECOVERY STRIP THIS ARM ONCE READ FROM (`the-view-heals-itself`) WAS REMOVED AS LEGACY
    // (`remove-held-panel`) — the operator's characters are no longer copied anywhere else, so the
    // one thing that may never happen is the screen losing them with nothing to fall back on.
    // `refusedLineSentence` answers that by declining to adopt the server's file at all whenever
    // there is real typed text: `safeToAdopt` is `typed.trim() === ""` alone now, with no held-row
    // exception, so this is the ORIGINAL, more conservative behaviour restored — screen unmoved,
    // characters exactly where he left them, and the operator told to press re-read himself once he
    // is done with the line.
    refuseWith = {
      status: 409,
      body: { ok: false, error: "stale base", refused: "stale-base", path: PATH, current: MOVED_ON },
    };

    typeAndCommit();
    await settle();

    // `REFUSED_NOT_ADOPTED` — the freshness-line sentence this arm used to check — is retired
    // (chore/retire-the-status-line). What it reported is still checked below, functionally: the
    // characters stayed, and the base did not move (proof `healFromRefusal` never ran).
    assert.match(onScreen(), /BY FRIDAY/, "the refusal deleted the characters he typed");
    // AND THE VIEW DID NOT ADOPT THE SERVER'S FILE — `current` was available but there was real
    // typed text at stake, so `healFromRefusal` never ran.
    assert.doesNotMatch(onScreen(), /#blocked/, "the view adopted a file it had no safe reason to adopt");
    assert.equal(page.__served().markdown, V1, "the base moved with characters still at stake");
  });

  test("A SECOND EDIT WITHOUT A HEAL STILL POSTS THE SCREEN'S OWN BASE — never a stale one silently reused", async () => {
    // WITHOUT THE HOLDING HALF, THE VIEW NO LONGER HEALS ITSELF OVER LIVE TYPING (see the arm
    // above). 409, and the operator is on his own to press re-read once he is done with the line —
    // the ORIGINAL behaviour `the-view-heals-itself` amended, restored by removing the panel that
    // amendment leaned on. What this arm proves is narrower and still real: the base a SECOND edit
    // carries is always computed from what the painter is actually showing, never from a digest the
    // server has already refused, whether or not a heal ran.
    refuseWith = {
      status: 409,
      body: { ok: false, error: "stale base", refused: "stale-base", path: PATH, current: MOVED_ON },
    };
    typeAndCommit();
    await settle();
    assert.equal(posted.length, 1, "the arm did not set up");
    assert.equal(posted[0].base, baseOf(V1), "the refused save did not carry the stale base");
    // `REFUSED_NOT_ADOPTED` — retired (chore/retire-the-status-line); `posted[0].base` above is the
    // functional proof no heal ran (a heal would have moved the base to `current`).

    // He keeps typing on the same line — no re-read, no reload — and commits again. The graph
    // server would answer this on its own merits; the fixture stands in for "it accepts".
    refuseWith = null;
    const input = openTheLine();
    input.value = "- [ ] Draft the launch note NEXT WEEK [[qntm:121]] #task";
    input.dispatch("blur");
    await settle();

    assert.equal(posted.length, 2, "the second save never left");
    assert.notEqual(
      posted[1].base,
      baseOf(MOVED_ON),
      "the second save posted a digest of a file the server holds but the screen never adopted",
    );
    // "the second save did not land" — the freshness sentence that used to say so is retired; the
    // base surface landing on the second save's own markdown is the functional proof it did.
    assert.equal(page.__served().markdown, posted[1].markdown, "the second save's projection never installed");
  });

  test("A REFUSAL WITH NOTHING TO ADOPT CHANGES NOTHING — the older behaviour, intact", async () => {
    // `current` is `null` whenever the graph server sends none (worker/src/app.js passes it through
    // verbatim and invents nothing). There is then nothing to adopt, so the screen keeps his
    // characters exactly as it did before this row, and the sentence says so.
    refuseWith = {
      status: 409,
      body: { ok: false, error: "stale base", refused: "stale-base", path: PATH, current: null },
    };

    typeAndCommit();
    await settle();

    // The sentence that used to say so is retired (chore/retire-the-status-line); the functional
    // proof is below — the screen kept his characters and the base did not move.
    assert.match(onScreen(), /BY FRIDAY/, "nothing was adopted, so nothing may have repainted");
    assert.equal(page.__served().markdown, V1, "the base moved with no text to move with it");
  });

  test("A LINE OPEN SOMEWHERE ELSE REFUSES THE ADOPTION — his typing outranks a render", async () => {
    // THE HAZARD THIS WHOLE ADOPTION IS FENCED AGAINST. `current` is a render: the engine
    // recomputes it every cycle, so a copy this page declines costs one read to get back. A
    // sentence a person is halfway through is recomputed by nothing. So an open line refuses it,
    // and the page names his own gesture instead of taking one.
    refuseWith = {
      status: 409,
      body: { ok: false, error: "stale base", refused: "stale-base", path: PATH, current: MOVED_ON },
    };

    open(V1);
    // A tick, while a SECOND line is open for typing — the two writes-in-one-cycle shape.
    const input = openTheLine();
    input.value = "- [ ] Water the plants HALF TYPED";
    const box = walk(elements.get("viewBody")).filter((el) => el.type === "checkbox")[0];
    box.checked = true;
    box.dispatch("change");
    await settle();

    // The sentence that used to confirm "the tick was not refused" is retired
    // (chore/retire-the-status-line); the box reverting is the functional proof it was.
    assert.equal(box.checked, false, "the tick was not refused");
    assert.equal(input.value, "- [ ] Water the plants HALF TYPED", "the adoption repainted an open line");
    assert.equal(page.__served().markdown, V1, "the base moved while a line was open");
    assert.doesNotMatch(onScreen(), /#blocked/, "the server's copy reached the screen mid-typing");
  });

  test("A REFUSED TICK WITH NOTHING OPEN HEALS THE VIEW — and there is no box to put back", async () => {
    // The other write path, and the easier of the two: a tick has no characters at stake at all, so
    // the only question is whether the screen may move. Nothing is open, so it may — and the box
    // then redraws from the file the server actually holds, which is a stronger statement than the
    // hand-reverted one it replaces.
    refuseWith = {
      status: 409,
      body: { ok: false, error: "stale base", refused: "stale-base", path: PATH, current: MOVED_ON },
    };

    open(V1);
    const box = walk(elements.get("viewBody")).filter((el) => el.type === "checkbox")[0];
    box.checked = true;
    box.dispatch("change");
    await settle();

    // "this view now shows the file as the server has it..." — the sentence retired
    // (chore/retire-the-status-line); the two checks above are the functional proof it healed.
    assert.match(onScreen(), /#blocked/, "the view did not heal itself");
    assert.equal(page.__served().markdown, MOVED_ON);
  });

  test("A HEAL MUST NOT CLOBBER A NEIGHBOUR — the cursor is re-found by identity, not carried as a raw index", async () => {
    // THE LIVE DEFECT (`refusal-must-not-clobber`, 2026-08-03), REDUCED TO ITS SMALLEST SHAPE. The
    // operator's cursor is anchored to qntm:121 BY IDENTITY. Between his last paint and this
    // refusal, the file the server actually holds has moved on without him: qntm:121 is gone and
    // qntm:122 — a real line he never touched — has shifted up into the exact numeric position his
    // cursor's index still names. `healFromRefusal` adopts `current` and repaints through
    // `repaintCurrentView`, which (unfixed) clamps `focus.lineIndex` NUMERICALLY rather than
    // re-finding it by identity — so the cursor silently lands on qntm:122, and the very next
    // keystroke overwrites it. This is the same shape a `insert-line` settling onto a phantom,
    // never-written row produces in the real app; a tick refusal reaches the identical code path
    // with far less machinery to stand up.
    refuseWith = {
      status: 409,
      body: { ok: false, error: "stale base", refused: "stale-base", path: PATH, current: CURRENT_AFTER_CYCLE },
    };

    open(V1);
    // THE OPERATOR'S CURSOR IS ON qntm:121 BY IDENTITY — exactly as a click would leave it.
    page.__setFocus(3, V1);
    assert.equal(page.__focusAnchor()?.node, "qntm:121", "the arm did not anchor the cursor it means to lose");

    // He ticks that box. The server refuses it — qntm:121 is not in the file it actually holds —
    // and hands back a file in which a DIFFERENT real line now sits at the same numeric position.
    const box = walk(elements.get("viewBody")).filter((el) => el.type === "checkbox")[0];
    box.checked = true;
    box.dispatch("change");
    await settle();

    // THE OPERATOR, BELIEVING THE CURSOR IS STILL WHERE HE LEFT IT, KEEPS TYPING. `__enterInsert`
    // arms whatever line the (possibly wrongly re-anchored) cursor is on now.
    page.__enterInsert();
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    assert.ok(input, "the heal left no line open for typing");
    input.value = "- [ ] zzTEST typed after the heal";
    input.dispatch("blur");
    await settle();

    // THE MUTATION-PROOF-WORTHY ASSERTION: qntm:122 — a real line the operator never named — must
    // survive byte for byte, whatever the heal decided to do. Checked on the wire (what was
    // actually posted, if anything was) and on screen (what he is left looking at).
    const lastPost = posted.at(-1);
    if (lastPost !== undefined) {
      assert.match(
        lastPost.markdown,
        /- \[ \] Water the plants \[\[qntm:122\]\] #task/,
        "the heal clobbered a neighbour it never named — qntm:122 was overwritten",
      );
    }
    assert.match(
      onScreen(),
      /Water the plants/,
      "the heal clobbered a neighbour it never named — qntm:122 is gone from the screen",
    );
  });

  test("THE CONTROL — an ordinary failure still repaints from the last server state", async () => {
    // The behaviour this change must not have altered: a write that FAILED (as opposed to one that
    // was refused) leaves the vault's state unknown, so the screen stops claiming the edit.
    refuseWith = { status: 502, body: { ok: false, error: "write failed" } };

    typeAndCommit();
    await settle();

    // "sync failed: write failed" — retired (chore/retire-the-status-line); the repaint away from
    // his typed characters, below, is the functional proof the failure path ran.
    assert.doesNotMatch(onScreen(), /BY FRIDAY/, "a failed write kept claiming an edit the vault lacks");
  });

  test("THE OTHER CONTROL — a save that is not refused still lands, unchanged", async () => {
    typeAndCommit();
    await settle();

    // "an ordinary save narrated itself as a refusal" — the sentence that used to prove this is
    // retired; his characters staying on screen (nothing repainted them away) is the proof left.
    assert.match(onScreen(), /BY FRIDAY/);
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
  });

  // "ONE SENTENCE, NOT TWO THAT CONTRADICT EACH OTHER" and "AND THE DROPPED GUESS DOES NOT SURFACE
  // AGAINST THE NEXT SAVE" ARE GONE. Both proved a specific freshness-line behaviour: the client's
  // own stale-base guess (`BASE_REFUSALS.stale`, `writeNote`) was dropped rather than shown beside
  // the server's own, stronger refusal, and that dropped guess never leaked into a LATER save's own
  // sentence. `writeNote`, `refusalNote`, `takeNotes`, `BASE_REFUSALS` and the freshness line itself
  // are all deleted (chore/retire-the-status-line) — there is no longer a sentence for a guess to
  // contradict or leak into, so there is nothing left for either test to observe. The write path
  // itself (`served.read` no longer even runs — see writeFile's own header) is otherwise unchanged
  // and is covered by the other arms in this file.
});

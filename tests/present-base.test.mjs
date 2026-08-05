/**
 * THE STALE BASE — the client half of optimistic concurrency control, and the sentence it says.
 *
 *   node --test tests/present-base.test.mjs
 *
 * THE DEFECT THIS SUITE EXISTS FOR, MEASURED FIRST ON UNMODIFIED main. Every save this app makes
 * posts the WHOLE FILE and the server overwrites what it is sent, so a save computed against an
 * out-of-date copy discards everything that changed in between — and what changes in between is the
 * CYCLE'S OWN OUTPUT. The operator's typing is never what is lost. The rule's tag and the task the
 * engine created are, silently, with nothing reported anywhere.
 * `docs/implementation-artifacts/design-the-edit-is-a-safe-haven.md` §3 measures it; the two arms
 * below are the two ways it happens to a person using this app.
 *
 * WHAT LANDS HERE IS A DETECTOR AND A REPORT, NOT A PREVENTION, and the tests say so out loud —
 * §"the write still goes" asserts the clobber still happens. The server is the only place a write
 * can be refused safely (design doc §8; backlog row `the-write-is-refused-server-side`), and a
 * client that refused its own save would lose characters a person typed in exchange for a status
 * line. What changes on this branch is that the divergence is SEEN AND SAID.
 *
 * THE PAGE ARMS ARE DRIVEN THROUGH app/index.html's OWN SCRIPT, through the shipped
 * dist/present.js, via tests/fixtures/app-html-page.mjs — the same harness the write-path and
 * anchor suites use. Nothing about the write is reimplemented here.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { BaseSurface, baseOf } from "../dist/present.js";
import { importPage, installBrowser, makeEvent, makeWorkDir, walk } from "./fixtures/app-html-page.mjs";

const WORK = makeWorkDir("present-base");
const SOURCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "app", "present", "base.ts");

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 0. THE STRUCTURAL CLAIMS — checked by running the module, not by re-reading its header
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("base.ts is the shape its own header claims", () => {
  /**
   * WHY THESE TWO LIVE HERE AND NOT IN tests/flow_scenarios/.
   *
   * They are exactly the checks `vim_gestures.ts` makes of `motions.ts`, and a scenario is the
   * usual home for them. It is the wrong home for THIS module, for two reasons, both read off
   * this repo's own config rather than assumed:
   *
   *   1. THERE IS NO CROSS-MODULE EDGE TO DECLARE. `base.ts`'s only caller is `app/index.html`,
   *      and `.flow-trace.yaml` records at length that capture is a node module-load hook — node
   *      cannot import an HTML document, so the page is named by the filter and invisible to it.
   *      A scenario here would produce zero observed flows.
   *   2. A SCENARIO THAT DECLARES NOTHING STILL SPENDS THE OBSERVER'S BUDGET, and the same config
   *      measures what that costs: runs lose the LAST edges they capture, silently, as INFO rather
   *      than FAIL. Adding a scenario that buys no evidence in exchange for some of the evidence
   *      the other three scenarios produce would be a net loss.
   *
   * `node --test` has no such budget, which is where that config says to prove things instead.
   */

  test("it imports nothing — a per-FILE fact that cannot reach the per-LINE one", () => {
    // The cursor's identity (instance.ts, focus.ts) and this file's content are two different
    // facts about two different things, and the row that built this one was told not to conflate
    // them. An import is how that conflation would start.
    const imports = readFileSync(SOURCE_PATH, "utf8")
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    assert.deepEqual(imports, [], `app/present/base.ts imports something: ${imports.join(" | ")}`);
  });

  test("PURE — no DOM, no fetch, no clock, proved by making all three throw", () => {
    // The clock matters specifically. The obvious extra field on a base is "when I took it", and a
    // base with a timestamp invites an age-based rule — "stale after 30 seconds" — which is a guess
    // wearing a measurement's clothes. The surface holds the STRING, so the answer is exact.
    const globals = globalThis;
    const previous = { document: globals.document, fetch: globals.fetch, now: Date.now };
    const touch = (name) => {
      throw new Error(`base.ts touched \`${name}\` — it must have no DOM, no fetch and no clock`);
    };
    globals.document = new Proxy({}, { get: () => touch("document"), set: () => touch("document") });
    globals.fetch = () => touch("fetch");
    Date.now = () => touch("Date.now");
    try {
      const served = new BaseSurface();
      served.take("work/outcomes.md", "# a\n");
      served.open("work/outcomes.md");
      served.read("work/outcomes.md", "# a\n");
      served.close("work/outcomes.md");
      served.drop();
      baseOf("# a\n");
    } finally {
      globals.document = previous.document;
      globals.fetch = previous.fetch;
      Date.now = previous.now;
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE TOKEN
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("the base token is really sha256", () => {
  /**
   * NODE'S OWN DIGEST IS THE ORACLE, and that is the whole point of this block.
   *
   * `baseOf` computes sha256 in TypeScript rather than through `crypto.subtle`, because an `await`
   * before the POST would put the write one asynchronous turn later than it has ever been (measured:
   * `crypto.subtle.digest` resolves after a `setImmediate` scheduled at the same moment). A
   * hand-transcribed digest is only worth having if it agrees with the sha256 the rest of the world
   * computes — the server that will one day compare this token reads the file off disk and hashes
   * it with its own library, so a private arithmetic would be a precondition nobody can satisfy.
   */
  const nodeBase = (text) => "sha256-" + createHash("sha256").update(text, "utf8").digest("hex");

  test("every case agrees with node's own sha256, including the padding boundaries", () => {
    const cases = [
      "",
      "a",
      "# This Week\n\n- [ ] Draft the note [[qntm:121]] #task\n",
      // MULTI-BYTE, because the vault is full of it: markers, emoji and accented characters all
      // occupy more bytes than characters, and a length taken in characters would hash the wrong
      // number of bytes.
      "é 🆕 2026-07-29 ✅ 🛫",
      // 55/56 and 63/64/65 are where sha256's padding gains a block. A transcription error hides
      // everywhere except here.
      ..."x".repeat(70).split("").map((_, i) => "x".repeat(i + 20)),
      "y".repeat(1000),
    ];
    for (const text of cases) {
      assert.equal(baseOf(text), nodeBase(text), `disagreed with node's sha256 at ${text.length} chars`);
    }
  });

  test("the token names its algorithm, so a later one can be told apart from it", () => {
    assert.match(baseOf("anything"), /^sha256-[0-9a-f]{64}$/);
  });

  test("NOTHING IS NORMALISED — the write unit is the whole file, byte for byte", () => {
    // Normalising line endings or a trailing newline would make two genuinely different files hash
    // the same, which is a hole in a precondition in the direction of ACCEPTING. Both differences
    // below are ones this app's own whole-file POST is capable of making.
    assert.notEqual(baseOf("a\nb"), baseOf("a\r\nb"), "CRLF and LF hashed the same");
    assert.notEqual(baseOf("a\nb"), baseOf("a\nb\n"), "a trailing newline was normalised away");
    assert.notEqual(baseOf("a\nb\n"), baseOf("a\nb\n\n"), "a blank final line was normalised away");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE SURFACE
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("BaseSurface — what the server last sent for the file on screen", () => {
  const PATH = "work/outcomes.md";
  const SERVED = "# This Week\n- [ ] a [[qntm:1]] #task\n";

  test("an edit computed against the served copy is current", () => {
    const served = new BaseSurface();
    served.take(PATH, SERVED);
    assert.deepEqual(served.read(PATH, SERVED), { outcome: "current" });
  });

  test("an edit computed against ANY other string is stale, down to one byte", () => {
    const served = new BaseSurface();
    served.take(PATH, SERVED);
    assert.deepEqual(served.read(PATH, SERVED + "\n"), { outcome: "stale" });
    assert.deepEqual(served.read(PATH, SERVED.replace("#task", "#task #blocked")), { outcome: "stale" });
  });

  test("a write of a file no base was taken for is UNKNOWN, never current", () => {
    // A check that quietly passes when it cannot run is decoration — the thing this project has
    // now proved twice. `unknown` is reported to the operator like any other refusal.
    const served = new BaseSurface();
    assert.deepEqual(served.read(PATH, SERVED), { outcome: "unknown" });
    served.take("work/other.md", SERVED);
    assert.deepEqual(served.read(PATH, SERVED), { outcome: "unknown" });
  });

  test("a save still in the air makes the next save of that file unsendable-as-current", () => {
    // THE ARM THE STRING COMPARISON CANNOT SEE. The client's own outstanding write is already
    // changing the file, so no base it holds can be the server's current content — whatever the
    // painter's source says.
    const served = new BaseSurface();
    served.take(PATH, SERVED);
    served.open(PATH);
    assert.deepEqual(served.read(PATH, SERVED), { outcome: "writing" });
    served.close(PATH);
    assert.deepEqual(served.read(PATH, SERVED), { outcome: "current" });
  });

  test("two saves in the air are counted, not flagged", () => {
    const served = new BaseSurface();
    served.take(PATH, SERVED);
    served.open(PATH);
    served.open(PATH);
    served.close(PATH);
    assert.equal(served.writing(PATH), 1, "closing one of two writes reported the file as quiet");
    served.close(PATH);
    assert.equal(served.writing(PATH), 0);
  });

  test("stale beats writing — one sentence, and the more specific one wins", () => {
    const served = new BaseSurface();
    served.take(PATH, SERVED);
    served.open(PATH);
    assert.deepEqual(served.read(PATH, SERVED + "typed"), { outcome: "stale" });
  });

  test("dropping the graph drops the base and NOT the writes still in the air", () => {
    const served = new BaseSurface();
    served.take(PATH, SERVED);
    served.open(PATH);
    served.drop();
    assert.equal(served.markdown, null);
    assert.equal(served.writing(PATH), 1, "a save in the air was forgotten by a sign-out");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE FALSIFIER — through the page
// ══════════════════════════════════════════════════════════════════════════════════════════════

const PATH = "work/outcomes.md";
const V1 = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Draft the launch note [[qntm:121]] #task",
  "- [ ] Water the plants [[qntm:122]] #task",
  "- [ ] Ship the thing [[qntm:123]] #task",
  "",
].join("\n");

/**
 * WHAT THE CYCLE COMPUTED WHILE HE WAS TYPING, and every difference from V1 is work nobody typed:
 * `#blocked` is a rule's output on line 5, and `qntm:124` on line 6 is a task the engine created.
 * Those two are what a save from V1 discards.
 */
const V2 = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Draft the launch note [[qntm:121]] #task",
  "- [ ] Water the plants [[qntm:122]] #task",
  "- [ ] Ship the thing [[qntm:123]] #task #blocked",
  "- [ ] Chase the blocker [[qntm:124]] #task",
  "",
].join("\n");

// `STALE`/`WRITING` — the freshness-line sentences this file used to check against — are retired
// along with `#freshness` itself (chore/retire-the-status-line). Every arm below now checks
// `served.read`/`served.writing` directly instead.

const view = (markdown) => ({ id: "this-week", path: PATH, title: "This Week", domain: "work", markdown });

describe("THE FALSIFIER — a projection arrives while a line is open, through app/index.html", () => {
  let page;
  let elements;
  let posted;
  let holds;

  const settle = () => new Promise((r) => setImmediate(r));

  /** Install a projection and paint it — what `refresh` and every write's answer do. */
  function land(markdown) {
    const fresh = {
      ok: true,
      handle: "luke",
      pending_edits: 0,
      snapshot: { generated_at: "2026-07-31T12:00:00Z", views: [view(markdown)] },
    };
    page.__setGraphData(fresh);
    page.paintView("this-week");
    return fresh;
  }

  /** The clickable text of the first task line — the same selector the write-path suite uses. */
  const taskText = () =>
    walk(elements.get("viewBody")).find((el) => el.tagName === "span" && el.innerHTML !== "");

  /**
   * Put the cursor on line 0 — the heading — and repaint, so line 3 is the first TASK on the page.
   *
   * NOT COSMETIC, for the reason tests/app-html-write-path.test.mjs already records: the cursor's
   * own line renders its SOURCE, so `taskText()` returns a different line depending on where the
   * previous test left the cursor. This suite holds one page and one `FocusSurface` for its
   * lifetime; parking is it saying which line each arm is about. It found a real coupling — without
   * it the control arm clicked line 4, replaced it with a copy of line 3's node, and reported a
   * CURSOR refusal that had nothing to do with the base.
   */
  function park(markdown) {
    page.__setFocus(0, markdown);
    page.paintView("this-week");
  }

  /** Land a projection and park on it — how every arm below starts. */
  function open(markdown) {
    const fresh = land(markdown);
    park(markdown);
    return fresh;
  }

  before(async () => {
    ({ elements } = installBrowser());
    holds = [];
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      posted = { url, body };
      // Held open when a test asks, so two saves can be in the air at once — which is the whole of
      // the second arm, and is what the ~14 s cycle makes ordinary rather than exotic.
      if (holds.held) {
        await new Promise((r) => holds.push(r));
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handle: "luke",
          pending_edits: 0,
          snapshot: { generated_at: "2026-07-31T12:00:00Z", views: [view(body.markdown)] },
        }),
      };
    };
    page = await importPage(WORK);
  });

  test("ARM 1 — the world moved under an open line, and the save says so", async () => {
    open(V1);
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    taskText().dispatch("click", makeEvent());
    page.__enterInsert();
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    assert.equal(input.value, V1.split("\n")[3], "the cursor did not reach the source");
    input.value = "- [ ] Draft the launch note today [[qntm:121]] #task";

    // THE CYCLE'S OUTPUT ARRIVES AND THE VIEW REPAINTS FROM IT. In a browser, removing the focused
    // element fires blur, which settles the line; the stub does not fire it, so the same event is
    // dispatched by hand. Nothing else about the settlement is simulated — the `<input>` still
    // closes over the source string the painter gave it, which is V1.
    land(V2);
    posted = null;
    input.dispatch("blur");
    await settle();

    assert.ok(posted, "the edit was never posted");
    // The freshness-line sentence (`STALE`) this arm used to check is retired
    // (chore/retire-the-status-line) — `served.read` itself, unchanged, is asked directly instead:
    // the save this page just posted was computed against V1, and the base it now holds is V2
    // (the projection that landed while the line was open), so a fresh read against V1 is `stale`.
    assert.equal(page.__served().read(PATH, V1).outcome, "stale", "the divergence was not detected");
  });

  test("ARM 1 — and the base on the wire is the copy it was computed from, not the one on screen", async () => {
    open(V1);
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    taskText().dispatch("click", makeEvent());
    page.__enterInsert();
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = "- [ ] Draft the launch note today [[qntm:121]] #task";
    land(V2);
    posted = null;
    input.dispatch("blur");
    await settle();

    // THE PRECONDITION IS THE TRUTH ABOUT THIS WRITE, which is what makes it usable by a server:
    // "I believe the file says V1". A base taken from whatever happened to be on screen would be a
    // precondition the server could always satisfy and would refuse nothing.
    assert.equal(posted.body.base, baseOf(V1), "the write carried the wrong file's base");
    assert.notEqual(posted.body.base, baseOf(V2));
  });

  test("ARM 1 — THE WRITE STILL GOES, AND STILL CLOBBERS. This row reports; it does not prevent", async () => {
    open(V1);
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    taskText().dispatch("click", makeEvent());
    page.__enterInsert();
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = "- [ ] Draft the launch note today [[qntm:121]] #task";
    land(V2);
    posted = null;
    input.dispatch("blur");
    await settle();

    // His typing reaches the server. A client that refused its own save would lose the characters
    // and give him a status line in exchange, which is strictly worse than the defect.
    assert.ok(posted.body.markdown.includes("launch note today"), "the operator's own typing was lost");
    // And the cycle's output is still gone, because only the server can refuse the write — row 5.
    assert.ok(!posted.body.markdown.includes("#blocked"), "the fixture no longer reproduces the clobber");
    assert.ok(!posted.body.markdown.includes("qntm:124"), "the fixture no longer reproduces the clobber");
  });

  test("THE CONTROL — the same gesture against a current base says nothing at all", async () => {
    // WITHOUT THIS THE THREE ABOVE ARE DECORATION. An assertion that cannot come out the other way
    // is not a check, and the failure mode of a too-eager detector is a sentence on every save,
    // which is the same as no sentence within a day.
    open(V1);
    // A click positions only (paint.ts's `focusable`); `page.__enterInsert()` is the state-level
    // `i` that arms it for typing.
    taskText().dispatch("click", makeEvent());
    page.__enterInsert();
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = "- [ ] Draft the launch note today [[qntm:121]] #task";
    posted = null;
    // READ BEFORE THE GESTURE LEAVES — the freshness-line sentence this arm used to check is
    // retired (chore/retire-the-status-line); `served.read` against the exact string the edit is
    // about to be computed against (V1, still on screen and still `served`'s own base — nothing has
    // moved it) is asked directly instead: it must read `current`, not `stale` or `writing`.
    assert.equal(page.__served().read(PATH, V1).outcome, "current", "an ordinary save was detected as a divergence");
    input.dispatch("blur");
    await settle();
    assert.equal(posted.body.base, baseOf(V1), "the base was not the file the edit was computed from");
  });

  // "the sentence describes ONE save — the next one does not repeat it" is GONE. It proved a
  // freshness-line NARRATION did not leak from one save's report into the next save's own line —
  // `writeNote`/`refusalNote`/`takeNotes`/`#freshness` are all retired (chore/retire-the-status-
  // line), so there is no longer a sentence for anything to leak into. `served.read` itself has no
  // memory across calls (proven directly in section 2 above, "BaseSurface — what the server last
  // sent"), so there is nothing left this arm could still observe.

  test("ARM 2 — TWO TICKS INSIDE ONE CYCLE, which is the checkbox's own way of losing the file", async () => {
    /**
     * THE ARM THE STRING COMPARISON ALONE CANNOT SEE, and the more dangerous of the two paths.
     *
     * `toggleTask` does not repaint from its own edited string — it toggles a class and a `checked`
     * property — so the painter's source still holds the file as it was BEFORE the first tick. A
     * second tick inside the ~14 s cycle is therefore computed against a source that is byte for
     * byte the served copy, and the base looks perfectly current while the server has already moved
     * past it. MEASURED on unmodified main: the second POST carries the FIRST TICK UNDONE — so this
     * path loses the operator's own gesture, not only the cycle's output.
     */
    open(V1);
    const boxes = walk(elements.get("viewBody")).filter((el) => el.type === "checkbox");
    const posts = [];
    const record = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      posts.push(JSON.parse(init.body));
      return record(url, init);
    };
    holds.held = true;
    try {
      boxes[0].checked = true;
      boxes[0].dispatch("change");
      await settle();
      boxes[1].checked = true;
      boxes[1].dispatch("change");
      await settle();

      // The freshness-line sentence this arm used to check is retired (chore/retire-the-status-
      // line) — `served.writing(PATH)` is the functional fact it reported: both ticks are still in
      // the air (neither `fetch` call has resolved), so the register counts two.
      assert.equal(page.__served().writing(PATH), 2, "the second tick was not counted as in flight");

      holds.shift()?.();
      await settle();
      holds.shift()?.();
      await settle();
    } finally {
      holds.held = false;
      globalThis.fetch = record;
    }

    assert.equal(posts.length, 2, "the second tick never left");
    // The defect itself, still present and still measured: the second POST undoes the first tick.
    assert.match(posts[1].markdown.split("\n")[3], /^- \[ \] Draft/, "the fixture no longer reproduces it");
    assert.match(posts[1].markdown.split("\n")[4], /^- \[x\] Water/);
    // Both writes carried a base, and it is the same one — which is exactly the fact a server can
    // refuse on: the second write claims a file state the first write has already replaced.
    assert.equal(posts[0].base, baseOf(V1));
    assert.equal(posts[1].base, baseOf(V1));
    // "AND THE SENTENCE FOLLOWED ITS OWN SAVE" — a claim about which of two freshness-line writes
    // carried which report — is retired along with the freshness line itself
    // (chore/retire-the-status-line). Both writes' bases are proven above; `served.writing(PATH)`
    // is back to 0 once both answers have landed, which the arm's own `holds.shift()` calls (and
    // the absence of any exception here) already exercise.
    assert.equal(page.__served().writing(PATH), 0, "a write was left counted as in flight");
  });
});

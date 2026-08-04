/**
 * EVERY GESTURE THAT CAN REACH `commitLine`, DRIVEN END TO END, THROUGH THE REAL PAGE — not
 * `page.commitLine(view, wellFormedCommit)`, and not the pure reducer in isolation.
 *
 *   node --test tests/app-gesture-write-path.test.mjs
 *
 * ── THE GAP THIS FILE CLOSES ──
 *
 * `f448da2` ("the settle fires for a newly added line") widened `armOrderingSettle`'s gate and, in
 * the same commit, exposed a defect that had shipped earlier and unnoticed: `app/index.html`'s `x`
 * (toggle-done) and `>`/`<` (indent) keydown handlers each call `commitLine(v, {...})` with a
 * HAND-BUILT object missing `kind`/`source` — fields `LineCommit` (paint.ts) declares as required,
 * everywhere TypeScript is watching. It was not watching here: `app/index.html` sits outside
 * `tsconfig.json`'s `include`, so the omission compiled, shipped, and stayed silent for months
 * because the OLD gate (`commit.kind !== "set-line"` returns early) happened to treat `undefined`
 * as "not set-line" and skip the broken object. Widening that gate removed the accident:
 * `commit.kind` reached `sectionAt`/`sectionOrdinalAt` (address.ts) as `undefined`,
 * `undefined.split("\n")` threw — inside `commitLine`'s SYNCHRONOUS PREFIX, before its `await
 * writeFile(...)`. `commitLine` is `async` and neither keydown call site `await`s or `.catch`es
 * it, so that throw never reaches `doc.dispatch` as a synchronous exception (an `async function`
 * never throws synchronously to its caller — see section 3's own header): it becomes a REJECTED
 * PROMISE nothing is attached to. The operator's keystroke vanished with no POST, no error on
 * screen — an unhandled rejection is exactly that, silent unless something is watching for it.
 *
 * `tests/app-vim-wiring.test.mjs` drives `x` and `>`/`<` through the same real keydown wiring this
 * file does, and SAYS, IN ITS OWN COMMENT, why it stops short of the network call: its shared
 * `fetch` stub answers with no `snapshot` and its `graphData` is one module-scoped value every test
 * in that file shares, so letting a real commit resolve there would corrupt later tests. That is a
 * real constraint on THAT file — not a reason the path should stay unproven. This file gives each
 * `describe` its own `importPage` (a fresh module instance, per `tests/fixtures/app-html-page.mjs`'s
 * own "one module instance per workDir" rule) and its own `fetch` stub that actually answers a
 * write, so the network call `tests/app-vim-wiring.test.mjs` deliberately does not make is the one
 * thing every test below asserts happened.
 *
 * ── WHY `armOrderingSettle` HAS TO BE LIVE FOR THE CRASH TO REPRODUCE ──
 *
 * `armOrderingSettle` (app/index.html) returns immediately, before ever reaching `sectionAt`, when
 * `resolution === undefined || qualification === undefined` — the state before ANY declaration has
 * loaded. A suite that never calls `__applyPresentation` never arms the gate that threw, and would
 * report both gestures healthy on `main` when they are not: proven by hand while writing this file,
 * against an unmodified `main`, with no declaration loaded — the `x` and `>` presses below
 * completed and posted normally. Every `describe` in this file calls `page.__applyPresentation`
 * with a real `qualification`/`resolution` pair before pressing anything, which is what the
 * operator's own live session has (`presentation.json`, fetched at boot) and what actually
 * reproduces `TypeError: Cannot read properties of undefined (reading 'split')`.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { importPage, installBrowser, makeEvent, makeWorkDir } from "./fixtures/app-html-page.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// EVERY `describe` BELOW GETS ITS OWN `makeWorkDir`/`importPage` (a fresh module instance, on
// purpose — see the file header), and `makeWorkDir` registers one `process.on("exit", ...)`
// cleanup listener per call. A dozen of those past Node's default cap of 10 is not a leak, only
// this file's own test count; raised once, here, rather than silencing the warning per call.
process.setMaxListeners(30);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 0. THE ENUMERATION — every `NormalEffect.kind` motions.ts can report, read out of its own source
//    rather than hand-copied, so this list cannot silently drift from the union it is proving
//    coverage of. A ninth kind arriving in motions.ts and not in `COVERED_KINDS` below fails this
//    test rather than leaving the gap unnoticed.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const MOTIONS_SOURCE = readFileSync(resolve(HERE, "..", "app", "present", "motions.ts"), "utf8");

/** Every `| { readonly kind: "..."` line inside `NormalEffect`'s own union — the type's own words. */
function declaredEffectKinds() {
  const start = MOTIONS_SOURCE.indexOf("export type NormalEffect =");
  assert.ok(start !== -1, "motions.ts no longer declares NormalEffect");
  const end = MOTIONS_SOURCE.indexOf("\n\n", start);
  const block = MOTIONS_SOURCE.slice(start, end === -1 ? undefined : end);
  const kinds = [...block.matchAll(/\|\s*\{\s*readonly kind:\s*"([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(kinds.length > 0, "found no kind literals inside NormalEffect — the extraction is broken");
  return kinds;
}

// WHICH KINDS THIS FILE DRIVES END TO END, AND WHY EACH ONE DOES OR DOES NOT REACH `commitLine`.
// `commitLine` is the app's single write unit (its own header: "one endpoint, one whole-file write
// unit"), so a kind that never calls it has no write to prove — what this file proves for those is
// only "pressing the key does not throw", which section 2 below does for every one of them.
const COVERED_KINDS = {
  none: "no commit — a bare keystroke (digit accumulation, or a refused count) moves nothing",
  move: "no commit — j/k/G/gg move the selection only",
  "enter-insert": "reaches commitLine via paint.ts's own rawInput.settle (kind: set-line) once the operator blurs; that constructor is inside a type-checked module and was never the defect",
  column: "no commit — 0/$ move the column only",
  open: "reaches commitLine via paint.ts's own draftInput.settle (kind: insert-line) once the operator blurs; same as enter-insert, never the defect",
  "toggle-done": "reaches commitLine directly from app/index.html — THE FIX under test",
  boundary: "no commit — {/} move the selection only",
  indent: "reaches commitLine directly from app/index.html — THE OTHER FIX under test",
  word: "no commit — w/b/e move the column only",
};

test("every NormalEffect kind motions.ts declares is accounted for below", () => {
  assert.deepEqual(
    [...declaredEffectKinds()].sort(),
    Object.keys(COVERED_KINDS).sort(),
    "motions.ts gained or lost an effect kind that this file's coverage table does not know about",
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// SHARED FIXTURE — a real qualification/resolution declaration (the shape armOrderingSettle needs
// to be LIVE, see the file header) and a two-line section a checkbox and an indent can both act on.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const DECLARATION = {
  qualification: {
    defaultNodeType: "task",
    structuralNodeTypes: [],
    tokens: { node_type: {}, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
    predicates: {},
    sections: {},
    sectionOrder: { demo: ["queue"] },
    refused: {},
  },
  resolution: {
    ordering: {
      demo: {
        queue: {
          ordering: [{ field: "queue_position", direction: "asc" }],
          orderingMode: undefined,
          name: "Queue",
        },
      },
    },
    orderingFields: { queue_position: { token: "🔢", kind: "int" } },
  },
};

const SOURCE = [
  "## Queue",
  "- [ ] a [[qntm:1]] 🔢 1",
  "- [ ] b [[qntm:2]] 🔢 2",
].join("\n");

const VIEW = { id: "demo", path: "demo.md", title: "Demo", domain: "demo", markdown: SOURCE };

/** A fresh page, a real declaration loaded, and a fetch stub that actually answers a write. */
async function freshPage(workLabel) {
  const work = makeWorkDir(workLabel);
  const { elements, document: doc } = installBrowser();
  let posted = null;
  globalThis.fetch = async (url, init) => {
    posted = { url, body: JSON.parse(init.body) };
    return {
      ok: true,
      json: async () => ({
        ok: true,
        handle: "luke",
        pending_edits: 0,
        snapshot: { generated_at: "2026-08-05T00:00:00Z", views: [{ ...VIEW, markdown: posted.body.markdown }] },
      }),
    };
  };
  const page = await importPage(work);
  page.__applyPresentation(DECLARATION);
  page.__setGraphData({ snapshot: { generated_at: "2026-08-05T00:00:00Z", views: [VIEW] } });
  page.paintView("demo");
  const press = (key) => doc.dispatch("keydown", makeEvent({ key }));
  press("g");
  press("g"); // deterministic start: line 0, the heading
  return { page, elements, doc, press, posted: () => posted };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE TWO HEADLINE TESTS — both must fail on `main`.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. THE TWO HEADLINE TESTS — x and >/<, through the real page, reach the server", () => {
  test("x toggles the selected line's checkbox, and the write reaches the server", async () => {
    const { press, posted } = await freshPage("gesture-x");
    press("j"); // line 1: "- [ ] a [[qntm:1]] 🔢 1"

    press("x"); // THIS is the exact call that rejected commitLine's promise on main — see section 3
    await new Promise((r) => setImmediate(r));

    const write = posted();
    assert.ok(write, "x never reached the write endpoint");
    assert.ok(write.url.endsWith("/app/edit-file"), `posted to ${write.url}`);
    assert.equal(write.body.path, "demo.md");
    assert.equal(
      write.body.markdown,
      "## Queue\n- [x] a [[qntm:1]] 🔢 1\n- [ ] b [[qntm:2]] 🔢 2",
      "the posted file is not the source with exactly the toggled glyph changed",
    );
  });

  test(">/< indents and outdents the selected line, and each write reaches the server", async () => {
    const { press, posted } = await freshPage("gesture-indent");
    press("j"); // line 1

    press(">"); // THIS is the exact call that rejected commitLine's promise on main — see section 3
    await new Promise((r) => setImmediate(r));

    let write = posted();
    assert.ok(write, "> never reached the write endpoint");
    assert.equal(
      write.body.markdown,
      "## Queue\n    - [ ] a [[qntm:1]] 🔢 1\n- [ ] b [[qntm:2]] 🔢 2",
      "> did not indent by one unit, or moved a line it should not have",
    );

    press("<");
    await new Promise((r) => setImmediate(r));
    write = posted();
    assert.equal(
      write.body.markdown,
      "## Queue\n- [ ] a [[qntm:1]] 🔢 1\n- [ ] b [[qntm:2]] 🔢 2",
      "< did not undo the indent it just posted",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. NO EXCEPTION ESCAPES commitLine, FOR EVERY EFFECT KIND — including the six that never reach
//    it. Driving those too is not padding: `sectionAt`'s crash was reachable from ANY keystroke
//    that happened to select a line and then hit `x`/`>`/`<`, so "the keys that don't write also
//    don't throw" is part of the same claim, proven the same way.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. no exception escapes commitLine, or the page, for any of the nine effect kinds", () => {
  test("none (digit accumulation) does not throw", async () => {
    const { press } = await freshPage("gesture-none");
    assert.doesNotThrow(() => press("1"));
  });

  test("move (j/k/G/gg) does not throw", async () => {
    const { press } = await freshPage("gesture-move");
    assert.doesNotThrow(() => press("j"));
    assert.doesNotThrow(() => press("k"));
    assert.doesNotThrow(() => press("G"));
  });

  test("column (0/$) does not throw", async () => {
    const { press } = await freshPage("gesture-column");
    press("j");
    assert.doesNotThrow(() => press("$"));
    assert.doesNotThrow(() => press("0"));
  });

  test("boundary ({/}) does not throw", async () => {
    const { press } = await freshPage("gesture-boundary");
    assert.doesNotThrow(() => press("}"));
    assert.doesNotThrow(() => press("{"));
  });

  test("word (w/b/e) does not throw", async () => {
    const { press } = await freshPage("gesture-word");
    press("j");
    assert.doesNotThrow(() => press("w"));
    assert.doesNotThrow(() => press("b"));
    assert.doesNotThrow(() => press("e"));
  });

  test("enter-insert (i) does not throw, and its eventual commit reaches the server", async () => {
    const { page, elements, press, posted } = await freshPage("gesture-enter-insert");
    press("j");
    assert.doesNotThrow(() => press("i"));
    assert.equal(page.__vimMode(), "INSERT");
    const input = [...(elements.get("viewBody").children ?? [])]
      .flatMap(function collect(el) {
        return [el, ...((el.children ?? []).flatMap(collect))];
      })
      .find((el) => el.type === "text");
    assert.ok(input, "i did not open an editable line");
    input.value = "- [ ] a renamed [[qntm:1]] 🔢 1";
    assert.doesNotThrow(() => input.dispatch("blur"));
    await new Promise((r) => setImmediate(r));
    assert.ok(posted(), "the typed edit never reached the write endpoint");
  });

  test("open (o) does not throw, and its eventual commit reaches the server", async () => {
    const { page, elements, press, posted } = await freshPage("gesture-open");
    press("j");
    assert.doesNotThrow(() => press("o"));
    assert.equal(page.__vimMode(), "INSERT");
    const input = [...(elements.get("viewBody").children ?? [])]
      .flatMap(function collect(el) {
        return [el, ...((el.children ?? []).flatMap(collect))];
      })
      .find((el) => el.type === "text");
    assert.ok(input, "o did not open a draft line");
    input.value = "- [ ] a brand new row";
    assert.doesNotThrow(() => input.dispatch("blur"));
    await new Promise((r) => setImmediate(r));
    assert.ok(posted(), "the new row never reached the write endpoint");
  });

  test("toggle-done (x) does not throw", async () => {
    const { press, posted } = await freshPage("gesture-toggle-done-2");
    press("j");
    assert.doesNotThrow(() => press("x"));
    await new Promise((r) => setImmediate(r));
    assert.ok(posted(), "x did not reach the write endpoint");
  });

  test("indent (>/<) does not throw", async () => {
    const { press, posted } = await freshPage("gesture-indent-2");
    press("j");
    assert.doesNotThrow(() => press(">"));
    await new Promise((r) => setImmediate(r));
    assert.ok(posted(), "> did not reach the write endpoint");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. MUTATION PROOF — put the pre-fix shape back (`existingLineCommit` returning a commit with no
//    `kind`/`source`, exactly what app/index.html's `x` and `>`/`<` handlers hand-built before this
//    change), through a MUTATED COPY OF THE BUNDLE, the same seam tests/app-vim-wiring.test.mjs's
//    own "MUTATION PROOF" section uses and explains: the code under test lives in app/present/,
//    which app/index.html imports as `/dist/present.js`, so the mutant is the bundle, not the page.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * `commitLine` (app/index.html) is exported by the fixture, so this section calls it DIRECTLY
 * with the exact hand-rolled shape `x`/`>`/`<` used to build — `{ lineIndex, text, markdown }`,
 * `kind`/`source` left out — rather than mutating the bundle and going through `doc.dispatch`.
 *
 * WHY NOT DRIVE IT THROUGH A KEYPRESS, THE WAY SECTIONS 1 AND 2 DO. `commitLine` is `async` and
 * both keyboard call sites fire it without `await`/`.catch` — the same shape every keydown effect
 * in this page uses. A throw in its synchronous prefix (before its first real `await`, exactly
 * where `armOrderingSettle` runs) therefore never reaches `doc.dispatch` as a synchronous
 * exception (an `async function` never throws synchronously to its own caller); it becomes an
 * UNHANDLED REJECTION on a later microtask, and Node's own test runner attributes ANY unhandled
 * rejection during a test to whichever test happens to be running when it fires — not necessarily
 * this one, and not in a way a `try`/`catch` inside the test can intercept before the runner
 * itself marks something failed. Measured while writing this file: a version of this proof driven
 * through `doc.dispatch` was flaky by construction for exactly that reason. Calling the exported
 * `commitLine` directly returns the SAME promise the keydown handler discards, and this test
 * `await`s it in an ordinary `try`/`catch` instead of letting it go unhandled — deterministic, and
 * still the real function, the real `armOrderingSettle`, the real `sectionAt`.
 *
 * THIS IS THE SHAPE OF THE ORIGINAL DEFECT, NOT A DIFFERENT ONE. `existingLineCommit` (paint.ts)
 * exists so nothing outside it ever builds this object by hand again; this section proves what
 * happens if something did — the exact crash sections 1 and 2 above prove no longer happens
 * through the real `x`/`>`/`<` handlers, now that they call `existingLineCommit` instead.
 */
describe("3. MUTATION PROOF — the pre-fix hand-rolled commit shape still crashes commitLine", () => {
  let page;

  before(async () => {
    installBrowser();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    page = await importPage(makeWorkDir("gesture-mutation-proof"));
    page.__applyPresentation(DECLARATION);
  });

  const HAND_ROLLED = { lineIndex: 1, text: "- [x] a [[qntm:1]] 🔢 1", markdown: SOURCE };

  test("the exact pre-fix shape (no kind, no source) reproduces the operator's TypeError", async () => {
    await assert.rejects(
      () => page.commitLine(VIEW, HAND_ROLLED),
      /Cannot read propert(?:y|ies) of undefined/,
      "a commit with no kind/source did not crash commitLine — this proof is not exercising the same defect",
    );
  });

  test("RESTORED: existingLineCommit's own output does not crash commitLine", async () => {
    // THE SAME `sectionOrder`/DECLARATION, THE SAME `VIEW`, THE SAME `commitLine` — the only
    // difference from the test above is which function built the commit. This is the green half
    // of the transition: proof that `existingLineCommit` is what closes the gap, not an unrelated
    // change to `commitLine`, `armOrderingSettle` or the declaration.
    const posted = { called: false };
    globalThis.fetch = async (url, init) => {
      posted.called = true;
      posted.body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ ok: true }) };
    };
    // `existingLineCommit`'s own literal output shape (paint.ts) — a real toggle on line 1.
    const good = {
      lineIndex: 1,
      text: "- [x] a [[qntm:1]] 🔢 1",
      markdown: SOURCE.replace("[ ] a", "[x] a"),
      source: SOURCE,
      kind: "set-line",
    };
    await assert.doesNotReject(() => page.commitLine(VIEW, good));
    assert.ok(posted.called, "the well-formed commit never reached the write endpoint either");
  });
});

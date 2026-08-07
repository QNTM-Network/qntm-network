/**
 * THE REFUSAL REBASES — `commitLine`'s 409 branch, real typed text at stake, a SAFE retry now runs
 * before the terminal give-up (`design-the-two-rules.md` §2.2, `app/present/rebase.ts`).
 *
 *   node --test tests/app-refusal-rebases.test.mjs
 *
 * ── THE CLAIM, PRECISELY ──
 *
 * Zero automatic retries was the rule `0493884` shipped, deliberately, because blindly reposting
 * `commit.markdown` (computed against the OLD base) over `e.current` (the server's NEW file) would
 * silently discard whatever changed server-side — the exact clobber the base/token mechanism exists
 * to refuse. `rebaseLineEdit` (`app/present/rebase.ts`) makes ONE bounded, safe retry possible: it
 * reuses `instance.ts`'s anchor walk to find the operator's own line in `e.current`, and refuses
 * unless that line's PRE-EDIT text is byte-identical to what it was when the edit was computed — a
 * one-line diff3, not a merge.
 *
 * ── SECTIONS ──
 *
 *   1. `rebaseLineEdit` IN ISOLATION — every named outcome, driven directly against the pure
 *      function, with no page, no DOM, no fetch.
 *   2. DRIVE THE WIN — through the real page: an UNRELATED server-side change, the operator's edit
 *      lands with no operator action, and the unrelated change is kept, not discarded.
 *   3. DRIVE THE REFUSAL — through the real page: the SAME line changed server-side, the rebase
 *      declines, nothing reposts, and the operator's characters stay on the row, still editable.
 *   4. PROVE NO CLOBBER, BY MUTATION — the case the zero-retry rule was protecting, constructed and
 *      shown NOT to be discarded by the real code, and shown TO BE discarded once the one guard
 *      that prevents it is removed. The most important test in this suite.
 *   5. THE SCOPE BOUNDARY — `insert-line` (a brand-new line has no anchor of its own yet) never
 *      reaches a rebase attempt at all.
 *   6. THE PERCEPTION RULE — structural: the branch this suite drives touches no DOM beyond the
 *      calls the give-up branch it extends already made.
 *
 * ── WHAT THIS SUITE DOES NOT VERIFY ──
 *
 * NO BROWSER WAS OPENED. `tests/fixtures/app-html-page.mjs` lifts `app/index.html`'s real module
 * script and runs it against a stubbed DOM and a stubbed `fetch`, the same posture as
 * `tests/app-operation-completes.test.mjs`. No graph server, no passkey session, no engine cycle, no
 * real POST — the fetch stub in this file plays the part of both the refusing and the accepting
 * server, and every assertion reads either the POST BODIES it recorded or the page's own state.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  importPage,
  installBrowser,
  makeEvent,
  makeWorkDir,
  walk,
  withDeclaration,
  mutatingBundle,
  REPO,
} from "./fixtures/app-html-page.mjs";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
void HERE;

const { rebaseLineEdit, baseOf } = await import(join(REPO, "dist", "present.js"));

const PATH = "this_week.md";
const settle = () => new Promise((r) => setImmediate(r));

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. rebaseLineEdit — IN ISOLATION
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. rebaseLineEdit — every named outcome, driven directly", () => {
  const VIEW = "this-week";

  test("rebased: an unrelated line changed, the edit re-applies cleanly against the new file", () => {
    const base = "- [ ] a [[qntm:1]]\n- [ ] b [[qntm:2]]\n";
    const current = "- [ ] a [[qntm:1]]\n- [ ] b [[qntm:2]] #blocked\n";
    const result = rebaseLineEdit(VIEW, base, 0, "- [ ] a [[qntm:1]] #x", current);
    assert.equal(result.outcome, "rebased");
    assert.equal(result.markdown, "- [ ] a [[qntm:1]] #x\n- [ ] b [[qntm:2]] #blocked\n");
  });

  test("refused, no-anchor: the named line is blank in the base — nothing to anchor by", () => {
    const base = "\n- [ ] a [[qntm:1]]\n";
    const result = rebaseLineEdit(VIEW, base, 0, "not a real edit", base);
    assert.deepEqual(result, { outcome: "refused", reason: "no-anchor" });
  });

  test("refused, not-found: the operator's node is gone from the new file entirely", () => {
    const base = "- [ ] a [[qntm:1]]\n- [ ] b [[qntm:2]]\n";
    const current = "- [ ] b [[qntm:2]]\n";
    const result = rebaseLineEdit(VIEW, base, 0, "- [ ] a [[qntm:1]] #x", current);
    assert.deepEqual(result, { outcome: "refused", reason: "not-found" });
  });

  test("refused, ambiguous: the operator's node now prints twice — refused, not guessed", () => {
    const base = "- [ ] a [[qntm:1]]\n- [ ] b [[qntm:2]]\n";
    const current = "- [ ] a [[qntm:1]]\n- [ ] b [[qntm:2]]\n- [ ] a again [[qntm:1]]\n";
    const result = rebaseLineEdit(VIEW, base, 0, "- [ ] a [[qntm:1]] #x", current);
    assert.deepEqual(result, { outcome: "refused", reason: "ambiguous" });
  });

  test("refused, line-changed: the SAME line moved server-side — the clobber this module refuses", () => {
    const base = "- [ ] a [[qntm:1]]\n- [ ] b [[qntm:2]]\n";
    // The cycle (or another writer) rewrote node 1's own line between the base and `current`.
    const current = "- [ ] a [[qntm:1]] #urgent\n- [ ] b [[qntm:2]]\n";
    const result = rebaseLineEdit(VIEW, base, 0, "- [ ] a [[qntm:1]] #x", current);
    assert.deepEqual(result, { outcome: "refused", reason: "line-changed" });
  });

  test("refused, no-edit: unreachable from commitLine, named rather than assumed — see rebase.ts's own header", () => {
    const base = "- [ ] a [[qntm:1]]\n";
    // `edited` equals what the line already says — the no-op `applyEdit` itself refuses.
    const result = rebaseLineEdit(VIEW, base, 0, "- [ ] a [[qntm:1]]", base);
    assert.deepEqual(result, { outcome: "refused", reason: "no-edit" });
  });

  test("a move BETWEEN SECTIONS still rebases — the walk this module reuses survives it, a diff would not", () => {
    // The exact property `the-cursor-anchors-to-a-node-not-a-line-number`'s own record cites as
    // identity's advantage over a diff-based rebase: `resolveInstanceAnchor` finds node 1 by its
    // NODE tier even though it printed under a different heading than the base held.
    const base = "## Overdue\n- [ ] a [[qntm:1]]\n## Later\n";
    const current = "## Overdue\n## Later\n- [ ] a [[qntm:1]]\n";
    const result = rebaseLineEdit(VIEW, base, 1, "- [ ] a [[qntm:1]] #x", current);
    assert.equal(result.outcome, "rebased");
    assert.equal(result.markdown, "## Overdue\n## Later\n- [ ] a [[qntm:1]] #x\n");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2–5. THROUGH THE REAL PAGE
// ══════════════════════════════════════════════════════════════════════════════════════════════

const BASE = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Ring the dentist [[qntm:121]]",
  "- [ ] Water the plants [[qntm:122]]",
  "",
].join("\n");
const TYPED = "- [ ] Ring the dentist [[qntm:121]] #work";

// An UNRELATED line changed server-side — the case a rebase must LAND, keeping both facts.
const WIN_CURRENT = BASE.replace(
  "- [ ] Water the plants [[qntm:122]]",
  "- [ ] Water the plants [[qntm:122]] #blocked",
);
// The SAME line the operator is editing changed server-side — the case a rebase must REFUSE. This
// is the exact shape `correlation.ts`'s own header names: a blind repost of `commit.markdown` would
// discard `#urgent`, which the cycle (or another write) added to node 121 after the base was taken.
const CLOBBER_CURRENT = BASE.replace(
  "- [ ] Ring the dentist [[qntm:121]]",
  "- [ ] Ring the dentist [[qntm:121]] #urgent",
);

/** A page stood up with a fetch stub that refuses the NEXT write with a 409, then answers 200. */
async function standUpRebasePage(workDir, mutate) {
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

/** Land BASE, click the dentist row, type TYPED over it, and blur — refusing this write with a 409. */
async function driveEdit(d, current) {
  const { page, browser, control } = d;
  const view = { id: "this-week", path: PATH, title: "This Week", domain: "work", markdown: BASE };
  page.__setGraphData({
    ok: true,
    handle: "luke",
    pending_edits: 0,
    snapshot: { generated_at: "2026-08-05T09:00:00Z", views: [view] },
  });
  page.__setCurrentViewId("this-week");
  page.paintView("this-week");
  page.__setFocus(3, BASE);
  const row = () => walk(browser.elements.get("viewBody")).find((el) => el.tagName === "span" && el.innerHTML !== "");
  const input = () => walk(browser.elements.get("viewBody")).find((el) => el.type === "text");
  row().dispatch("click", makeEvent());
  page.__enterInsert();
  input().value = TYPED;
  d.control.refuseNext = true;
  d.control.current = current;
  input().dispatch("blur");
  await settle();
  return { row, input };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. DRIVE THE WIN
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. an unrelated server-side change — the edit lands, with nothing on screen to announce it", () => {
  test("DRIVEN: exactly one retry, a fresh token, a fresh base against `e.current`, both facts survive", async () => {
    const d = await standUpRebasePage(makeWorkDir("rebase-win-value"));
    await driveEdit(d, WIN_CURRENT);

    // THE SHAPE, NOT JUST THE VALUE: exactly two POSTs (the refused one, and ONE bounded retry) —
    // not zero (proving the retry happened at all) and not three or more (proving the bound holds).
    assert.equal(d.control.posted.length, 2, "the rebase must repost exactly once, no more and no fewer");

    const [first, retry] = d.control.posted;
    assert.match(first.token, /^w1-[0-9a-f]{32}$/, "setup: the first write carried no token");
    assert.match(retry.token, /^w1-[0-9a-f]{32}$/, "the retry carried no token of its own");
    assert.notEqual(retry.token, first.token, "the retry reused the REFUSED write's token instead of minting its own");

    // THE MECHANISM, NOT JUST THE OUTCOME: the retry's base is computed from `e.current`, never
    // from the stale base the first attempt carried — proving the rebase actually re-based rather
    // than merely happening to produce the right string by some other route.
    assert.equal(retry.base, baseOf(WIN_CURRENT), "the retry was not based on e.current");
    assert.notEqual(retry.base, first.base, "the retry carried the SAME stale base the refusal already rejected");

    // BOTH FACTS SURVIVE — his own edit, and the change the cycle made to a DIFFERENT line.
    assert.match(retry.markdown, /Ring the dentist \[\[qntm:121\]\] #work/, "the operator's own edit did not land");
    assert.match(
      retry.markdown,
      /Water the plants \[\[qntm:122\]\] #blocked/,
      "the unrelated server-side change was discarded — a clobber, on the line NOBODY was editing",
    );

    // THE FIRST TOKEN REACHED A TERMINAL STATE — `concludeGiveUp` closes it the instant the rebase
    // is chosen, whether or not the retry itself ever lands. The RETRY's own token release is a
    // separate mechanism (the server's write-echo, `tests/app-write-correlation.test.mjs`'s own
    // subject) that this stub does not carry and this suite is not about.
    assert.equal(d.page.__writes().waiting(first.token), false, "the refused write's token was left open");

    // THE SETTLE: the real projection that comes back is what is now on screen — both facts,
    // painted, with nothing having announced the retry that produced them.
    assert.equal(d.page.__rows().rowAt(3)?.text, TYPED, "the settled row does not show the operator's own edit");
    assert.equal(
      d.page.__rows().rowAt(4)?.text,
      "- [ ] Water the plants [[qntm:122]] #blocked",
      "the settled row does not show the unrelated server-side change",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. DRIVE THE REFUSAL
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("3. the SAME line changed server-side — the rebase refuses, nothing reposts", () => {
  test("DRIVEN: no second POST, the characters stay on the row, and the row is still editable", async () => {
    const d = await standUpRebasePage(makeWorkDir("rebase-refuse-value"));
    await driveEdit(d, CLOBBER_CURRENT);

    // THE BOUND IS ZERO ONCE NO REBASE IS POSSIBLE — nothing reposts blindly on top of a line the
    // server has since changed.
    assert.equal(d.control.posted.length, 1, "a refused rebase must not repost anything");

    // THE VALUE: the row holds exactly what he typed, not the server's #urgent line.
    const held = d.page.__rows().rowAt(3);
    assert.ok(held, "the row at line 3 did not survive the refusal");
    assert.equal(held.text, TYPED, "the operator's characters were not handed back to the row");

    // THE REGISTER reached its terminal state — the one write that WAS attempted is closed.
    const posted = d.control.posted[0];
    assert.equal(d.page.__writes().waiting(posted.token), false, "the refused write's token was left open");

    // STILL EDITABLE — re-enter the row through the same focus/insert path a real keystroke uses.
    d.page.__setFocus(3, d.page.__rows().source);
    d.page.__enterInsert();
    const reopened = walk(d.browser.elements.get("viewBody")).find((el) => el.type === "text");
    assert.ok(reopened, "the row could not be re-entered — it is no longer editable");
    assert.equal(reopened.value, TYPED, "re-entering the row did not start from the operator's own characters");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. PROVE NO CLOBBER, BY MUTATION — the most important test in this suite
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. NO CLOBBER: the case the zero-retry rule protected, constructed and shown not to be lost", () => {
  test("MUTATION PROOF: remove the line-changed guard, and the rebase DOES clobber the server's own change", async () => {
    // `rebase.ts`'s `if (serverLine !== original)` is the ONE comparison standing between "safe
    // one-line rebase" and "the exact clobber the zero-retry rule existed to refuse". Forcing it to
    // never fire (`if (false)`) reproduces, on purpose, the blind repost `0493884` refused to build.
    const mutate = mutatingBundle([
      "if (serverLine !== original) {",
      "if (false) {",
    ])(makeWorkDir("rebase-clobber-mutant-bundle"));
    const d = await standUpRebasePage(makeWorkDir("rebase-clobber-mutant-page"), mutate);
    await driveEdit(d, CLOBBER_CURRENT);

    // SETUP CHECK: the mutant must actually have reposted, or this proof isolates nothing.
    assert.equal(d.control.posted.length, 2, "setup: the mutant did not repost — this proof does not isolate the guard it claims to");

    const retry = d.control.posted[1];
    // THE CLOBBER, MEASURED DIRECTLY: `#urgent` — the server's own change to the line the operator
    // was editing — is gone from what the mutant posted. This is the failure mode `correlation.ts`'s
    // header names and the real code (§3 above, same fixture) does not reach.
    assert.doesNotMatch(
      retry.markdown,
      /#urgent/,
      "the mutant did not clobber #urgent — this proof does not isolate the guard it claims to",
    );
    assert.match(retry.markdown, /#work/, "setup: the mutant did not even carry the operator's own edit");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE SCOPE BOUNDARY — insert-line never rebases
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. a brand-new line (insert-line) has no anchor yet — never attempts a rebase", () => {
  test("an insert-line 409 goes straight to return-to-row, even when nothing else changed at all", async () => {
    const d = await standUpRebasePage(makeWorkDir("rebase-insert-scope"));
    const { page, control } = d;
    const view = { id: "this-week", path: PATH, title: "This Week", domain: "work", markdown: BASE };
    const lines = BASE.split("\n");
    lines.splice(3, 0, "- [ ] Brand new line, never seen by the server before");
    const markdown = lines.join("\n");

    control.refuseNext = true;
    // NOTHING CHANGED SERVER-SIDE AT ALL — the strongest case FOR a rebase, on every axis except
    // the one this test is about: a freshly typed line was never in the base to begin with, so
    // there is no printed line for `instanceAnchorFor` to anchor by (instance.ts's own honest
    // floor). If this reposted anyway it would not be rebasing anything — it would just be the
    // ordinary blind repost the zero-retry rule refuses, by accident rather than by design.
    control.current = BASE;

    await page.commitLine(view, {
      lineIndex: 3,
      text: "- [ ] Brand new line, never seen by the server before",
      markdown,
      source: BASE,
      kind: "insert-line",
    });

    assert.equal(control.posted.length, 1, "an insert-line 409 attempted a rebase retry — out of this change's scope");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE PERCEPTION RULE — structural
// ══════════════════════════════════════════════════════════════════════════════════════════════

// `commitLine` relocated to app/present/commit.ts (2026-08-07, see that module's own header) — its
// 409 branch, this section's whole subject, moved with it. Read that module instead of the page.
const COMMIT_SOURCE = (await import("node:fs")).readFileSync(join(REPO, "app", "present", "commit.ts"), "utf8");
const codeOf = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const CODE = codeOf(COMMIT_SOURCE);
const DOM_MUTATORS = /document\.|\$\(|\.textContent\s*=|\.innerHTML\s*=|\.setAttribute\(|\.classList\.|aria-busy/;

describe("6. THE PERCEPTION RULE — the whole 409 branch touches no DOM beyond healFromRefusal/paintView", () => {
  test("no spinner, no pending class, no sentence — the rebase branch is silent by construction", () => {
    // ONE INDENT LEVEL DEEPER than the page's own version was — commit.ts's `commitLine` is nested
    // inside `createCommitLine`'s returned function.
    const block = /if \(e\?\.status === 409\) \{[\s\S]*?\n        return;\n      \}/.exec(CODE)?.[0] ?? "";
    assert.ok(block, "the 409 branch was not found");
    // `deps.healFromRefusal`/`deps.repaintArrived()`, not the bare `healFromRefusal`/
    // `paintView(currentViewId, "arrived")` the page used to call directly — the same two acts,
    // reached through the deps object every relocated collaborator takes. `repaintArrived` is
    // itself just `() => paintView(currentViewId, "arrived")` on the page (unmoved) — this module
    // never sees `paintView`'s own name at all, which is the point of the indirection.
    const withoutKnownCalls = block
      .replace(/deps\.healFromRefusal\(view\.path, e\.current\);/, "")
      .replace(/deps\.repaintArrived\(\);/g, "");
    assert.doesNotMatch(withoutKnownCalls, DOM_MUTATORS, "the rebase branch touches the DOM directly");
  });
});

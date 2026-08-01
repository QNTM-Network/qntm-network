/**
 * THE `stamp` FALSIFIER — a token this app stops PRINTING is still written back byte for byte.
 *
 *   node --test tests/present-stamp.test.mjs
 *
 * `stamp` is the second resolution key whose subject is a TOKEN rather than a LINE, and it is the
 * first whose wired rendition REMOVES source characters from the page rather than styling them.
 * That changes what has to be proven, and it raises the cost of being wrong from cosmetic to
 * permanent:
 *
 *   THE ENGINE'S RECORDED BEHAVIOUR FOR AN UNRECOGNISED STAMP IS THAT ITS CONTENT IS ABSORBED
 *   INTO THE NODE'S TITLE, EXIT 0, NO DIAGNOSTIC — so a dropped `[[qntm:N]]` does not render
 *   wrongly, it RE-MINTS THE NODE. On 2026-07-31 that accident cost the operator seven node
 *   identities.
 *
 * So the governing rule is `accept ⊇ emit` read one layer up: YOU MAY ONLY HIDE WHAT YOU CAN PROVE
 * YOU RESTORE. Section 2 is that proof and nothing else in this file matters as much.
 *
 *   1. THE GRAMMAR IS THE ENGINE'S, AND IT IS THE NARROW ONE. `stampSpans` mirrors
 *      `parse_qntm_id.py`, carried here verbatim as the reference. It is deliberately NOT the wider
 *      `parse_wiki_link.py` grammar that `titleSpans` uses — see section 4.
 *   2. THE ROUND TRIP, OVER HIS REAL LINES. Render wired, write back, assert the source is
 *      byte-identical. Both against literal copies of `~/qntm` content (so it is real in CI) and
 *      against the live vault when it is there (so it is real about TODAY's content).
 *   3. THE CURSOR BRINGS THE CHARACTERS BACK. What makes hiding admissible at all: he can always
 *      see and edit the bytes.
 *   4. A WIDER WIKI-LINK IS NOT HIDDEN. `[[JB to send over Sarasin]]` is his content.
 *   5. IT IS DECLARED, NOT BRANCHED.
 *   6. THE MUTATION TARGET. The one-line change that would look like this feature and destroy a
 *      node identity, named and caught.
 *   7. THE MARK CANNOT INJECT, and where the renderer would not carry it, the characters win.
 *
 * Everything here runs against dist/present.js, the artifact the browser loads.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import MarkdownIt from "markdown-it";

import { makeDocument, makeBody, makeEvent, walk, serialize } from "./fixtures/dom-stub.mjs";
import {
  paint,
  applyEdit,
  stampSpans,
  qntmIdSpans,
  wikiLinkSpans,
  titleSpans,
  readDeclaration,
  presentationFromDeclaration,
  DEFAULT,
  FocusSurface,
  PresentationCascade,
  PresentationContext,
  RESOLUTION_KEYS,
} from "../dist/present.js";

// The app page's own renderer configuration, verbatim from app/index.html.
const md = new MarkdownIt("commonmark").enable("table");

/** The GLOBAL declaration the site actually serves, minus the file read — the mark end. */
const WIRED = presentationFromDeclaration({
  checkbox: "wired",
  heading: "wired",
  prose: "wired",
  tags: "wired",
  stamp: "wired",
}).context;

/** The same, with the one key under test taken back to its floor. */
const STAMP_RAW = presentationFromDeclaration({
  checkbox: "wired",
  heading: "wired",
  prose: "wired",
  tags: "wired",
  stamp: "raw",
}).context;

function view(source, context = WIRED, deps = {}) {
  globalThis.document = makeDocument();
  const body = makeBody();
  paint(body, source, context, { markdown: md, ...deps });
  return body;
}

/** The mark's opening tag, as it appears once `serialize` has JSON-escaped the innerHTML. */
const MARK = 'span class=\\"stampmark\\"';
const marks = (body) => serialize(body).split(MARK).length - 1;

/**
 * WHAT ONE LINE ACTUALLY BECAME — and the reason this helper exists rather than a file-wide search.
 *
 * The rendition is DECIDED per line and the fallback FIRES per line, so a file-wide "does this
 * string appear anywhere" answers a different question from the one being asked and answers it
 * wrongly the first time two lines disagree. Every assertion about hiding below goes through this.
 */
function paintedLine(line, context = WIRED) {
  return serialize(view(line, context));
}

/**
 * DID THE MARKUP SURVIVE THE RENDERER FOR THIS LINE?
 *
 * ── THE MEASURED LIMIT, STATED WHERE IT IS TESTED RATHER THAN ONLY IN A REPORT ──
 *
 * Not every line can carry a mark, and the reason is the tag chip's, inherited unchanged. markdown-it
 * reads FOUR LEADING SPACES as an indented code block and escapes everything inside it, so a line
 * that reaches the painter's PROSE branch with the engine's own nesting indent has its markup
 * escaped — and the all-or-nothing fallback correctly puts the whole line back to its characters.
 *
 * WHICH REAL LINES THOSE ARE, MEASURED against the live vault on 2026-08-01: 2,496 stamps in total,
 * 2,390 hidden, 106 still printed — every one of the 106 a PROSE line indented 4, 8 or 12 spaces.
 * They are prose rather than checkbox lines because their glyph is `[>]` (scheduled) or another
 * spelling outside `TASK`'s `( |x|X)`, so `classifyLine` calls them prose and they are block-rendered
 * WITH their indent. A `- [ ]` line at the same indent is a checkbox line, whose TAIL is rendered
 * inline with no indent at all, and it hides correctly.
 *
 * THIS IS NOT A REGRESSION AND IS NOT NEW: those same 106 lines already show their tags as
 * characters rather than as chips today, on main, for the same reason. Measured both ways.
 *
 * IT IS ALSO THE SAFE DIRECTION. A stamp that stays visible is an annoyance; a mark half-escaped
 * onto the page with the stamp's own characters gone would be a loss. The invariant the tests below
 * hold is therefore not "always hidden" but ALL-OR-NOTHING: a line either carries its marks and
 * none of its stamp characters, or carries every one of its characters and no markup at all.
 */
const markupSurvives = (line) => paintedLine(line).includes(MARK);

// ── REAL CONTENT ────────────────────────────────────────────────────────────────────────────────
//
// LITERAL COPIES, read read-only from `~/qntm` on 2026-08-01, never re-read at test time — the same
// posture tests/present-replay.test.mjs takes and for the same reason: an acceptance test whose
// fixture can change underneath it is not an acceptance test. Section 2b additionally sweeps the
// LIVE vault when it is present, which is what keeps these copies honest.
//
// EVERY ONE OF THESE WAS CHOSEN FOR A SHAPE, not for variety:
const REAL_LINES = [
  // `~/qntm/inbox.md:3` — the plainest stamped line there is. If anything breaks, it breaks here.
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
  // `~/qntm/habits.md:5` — INDENTED FOUR SPACES, which markdown-it reads as a code block, and
  // `[>]` which is not `TASK`'s `( |x|X)` so `classifyLine` calls the whole line prose. Both
  // together are the case the all-or-nothing fallback exists for.
  "    - [>] Reminder / consideration? [[qntm:2397]] #routine #every-2d #admin 🛫 2026-08-02",
  // `~/qntm/habits.md:22` — THE LINE THE WHOLE BOUNDARY ARGUMENT TURNS ON. A stamp AND a
  // title-form wiki-link carrying four words of the operator's own on the same line.
  "    - [x] Store all somewhere [[qntm:1723]] #task #work ✅ 2026-07-13 🆕 2026-07-07 #requires [[JB to send over Sarasin]]",
  // `~/qntm/habits.md:24` — the same, with the link naming another node by its TITLE.
  "    - [x] Set up reminders / system [[qntm:1724]] #task #work ✅ 2026-07-13 🆕 2026-07-07 #requires [[Store all somewhere]]",
  // `~/qntm/routines.md:5` — A MALFORMED NEAR-STAMP BESIDE A REAL ONE. `[qntm:1507]]` has one
  // opening bracket, so the engine does not read it as an identity and neither may this app. It
  // must stay PRINTED — hiding a broken token would hide the evidence that it is broken.
  "    - [ ] Started in last 30 days email [qntm:1507]] [[qntm:2423]] #routine #work #every-14d 🛫 2026-07-28",
  // `~/qntm/this_week.md:3` — a marker with an integer value, and `☑️` (two code points).
  "- [ ] Schonfeld trial + conversion [[qntm:1975]] #outcome #work ☑️ 1",
  // `~/qntm/this_week.md:4` — three markers with dates, and a `n#task` typo mid-title.
  "    - [ ] Kick off trial / confirm it's kicked off n#task [[qntm:1986]] #task #work 📅 2026-08-01 🛫 2026-08-01 🆕 2026-07-15",
  // `~/qntm/habits.md:2` — the shortest stamped line, no markers at all.
  "- [ ] Declared but unbuilt [[qntm:2508]] #habit",
  // A heading and a blank, so the file has every shape the painter branches on.
  "## Overdue",
  "",
];

/** The real lines as one view, the way the engine would print them into a file. */
const REAL_VIEW = ["# This Week", "", ...REAL_LINES].join("\n");

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1. A STAMP IS WHAT THE ENGINE SAYS A STAMP IS — and it is the NARROW grammar
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("1. the grammar is the engine's identity grammar, mirrored and checked", () => {
  // ── THE REFERENCE ──
  //
  // Verbatim from the engine, cited so it can be checked rather than trusted:
  //
  //   the engine, apps/qntm-md/src/qntm_md/io/parser/parse_qntm_id.py:20-23
  //     _QNTM_ID_RE = re.compile(
  //         r"\[\[qntm:([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)\]\]",
  //         re.IGNORECASE,
  //     )
  //
  // JS needs no translation here — there is no lookbehind and no Python-only construct — so this
  // is the engine's own source text as a JS literal, with `re.IGNORECASE` written as `i`.
  const ENGINE = /\[\[qntm:([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)\]\]/gi;
  const engineStamps = (text) => [...text.matchAll(ENGINE)].map((m) => m[0]);
  const appStamps = (text) => stampSpans(text).map((span) => span.text);

  const CASES = [
    ["[[qntm:3]]", ["[[qntm:3]]"]],
    ["[[qntm:2603]]", ["[[qntm:2603]]"]],
    // The engine's own test asserts `[[QNTM:42]]` extracts `42` (test_parse_qntm_id.py:46).
    ["[[QNTM:42]]", ["[[QNTM:42]]"]],
    ["[[Qntm:42]]", ["[[Qntm:42]]"]],
    ["- [ ] a [[qntm:1]] #task", ["[[qntm:1]]"]],
    ["[[qntm:1]] and [[qntm:2]]", ["[[qntm:1]]", "[[qntm:2]]"]],
    ["[[qntm:a-b]]", ["[[qntm:a-b]]"]],
    ["[[qntm:a_b]]", ["[[qntm:a_b]]"]],
    // An id may not START or END with `-` or `_` — the engine's own body pattern says so.
    ["[[qntm:-a]]", []],
    ["[[qntm:a-]]", []],
    ["[[qntm:]]", []],
    // One bracket is not two. THIS IS THE REAL `~/qntm/routines.md:5` SHAPE.
    ["[qntm:1507]]", []],
    ["[[qntm:1507]", []],
    // A title-form link is NOT an identity stamp.
    ["[[JB to send over Sarasin]]", []],
    ["[[Store all somewhere]]", []],
    ["[[qntm 3]]", []],
    // Not a wiki-link at all.
    ["qntm:3", []],
    ["", []],
  ];

  for (const [line, expected] of CASES) {
    test(`the app and the engine agree about ${JSON.stringify(line)}`, () => {
      assert.deepEqual(engineStamps(line), expected, "the CASE row disagrees with the ENGINE regex");
      assert.deepEqual(appStamps(line), expected, "the app disagrees with the engine");
    });
  }

  test("a generated sweep finds no line the two disagree about", () => {
    // Assembled rather than hand-listed, so the comparison covers shapes nobody thought to name.
    const bodies = ["3", "2603", "a", "a-b", "a_b", "-a", "a-", "", "A1", "qntm", "JB to send"];
    const wrappers = [
      (b) => `[[qntm:${b}]]`,
      (b) => `[[QNTM:${b}]]`,
      (b) => `[qntm:${b}]]`,
      (b) => `[[qntm:${b}]`,
      (b) => `[[${b}]]`,
      (b) => `x [[qntm:${b}]] y`,
      (b) => `[[qntm:${b}]][[qntm:9]]`,
      (b) => `- [ ] t [[qntm:${b}]] #task 🆕 2026-08-01`,
    ];
    let compared = 0;
    for (const body of bodies) {
      for (const wrap of wrappers) {
        const line = wrap(body);
        assert.deepEqual(appStamps(line), engineStamps(line), `disagreement on ${JSON.stringify(line)}`);
        compared += 1;
      }
    }
    assert.ok(compared >= 80, `the sweep only compared ${compared} lines`);
  });

  test("the span carries the characters AND the id, because restoration needs the characters", () => {
    const [span] = stampSpans("- [ ] a [[qntm:2603]] #task");
    assert.equal(span.text, "[[qntm:2603]]");
    assert.equal(span.id, "2603");
    assert.equal("- [ ] a [[qntm:2603]] #task".slice(span.start, span.end), span.text);
  });

  test("`qntmIdSpans` is the same walk, narrowed — one grammar, not two", () => {
    // The word-motion caller predates this key and must not have acquired a second opinion about
    // what an identity stamp is. Same offsets, every time.
    for (const line of REAL_LINES) {
      assert.deepEqual(
        qntmIdSpans(line),
        stampSpans(line).map(({ start, end }) => ({ start, end })),
        `two grammars disagree on ${JSON.stringify(line)}`,
      );
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE ROUND TRIP — render wired, write back, and the source is byte-identical
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("2. THE ACCEPTANCE TEST — hiding the stamp changes nothing a write can see", () => {
  test("the fixture really is hidden, or every assertion below is vacuous", () => {
    // THE POSITIVE CONTROL, FIRST. Every claim in this section is of the form "nothing changed",
    // and "nothing changed" is exactly what a feature that does not work also produces. So the
    // hiding is established before its safety is.
    const stamped = REAL_LINES.filter((line) => stampSpans(line).length > 0);
    assert.ok(stamped.length >= 6, "the fixture carries too few stamped lines to be a real test");

    let hidden = 0;
    let fellBack = 0;
    for (const line of stamped) {
      const painted = paintedLine(line);
      const stamps = stampSpans(line).map((s) => s.text);
      if (markupSurvives(line)) {
        hidden += 1;
        for (const stamp of stamps) {
          assert.ok(!painted.includes(stamp), `${stamp} is printed AND marked — a half state`);
        }
        assert.equal(painted.split(MARK).length - 1, stamps.length, `${line}: wrong mark count`);
      } else {
        // THE FALLBACK BRANCH, AND IT IS AN ASSERTION RATHER THAN AN EXEMPTION. A line the
        // renderer would not carry the markup for must show EVERY character it had, not some.
        fellBack += 1;
        for (const stamp of stamps) {
          assert.ok(painted.includes(stamp), `${line}: fell back and lost ${stamp} anyway`);
        }
      }
    }
    assert.ok(hidden >= 6, `only ${hidden} of ${stamped.length} stamped lines hid their stamp`);
    // AND THE FIXTURE REACHES BOTH BRANCHES, so neither is proven only by the other's absence.
    // Exactly one: `    - [>] Reminder / consideration? [[qntm:2397]] …`, the real `habits.md:5`.
    // Its `[>]` glyph is outside `TASK`'s `( |x|X)` so it is PROSE, and prose is block-rendered
    // with its indent. Its `- [x]` and `- [ ]` neighbours at the SAME indent are checkbox lines,
    // whose tails render inline with no indent, and they hide correctly.
    assert.equal(fellBack, 1, "the fixture no longer exercises the indented-code-block fallback");
  });

  test("A MALFORMED NEAR-STAMP STAYS PRINTED, beside a real one that does not", () => {
    // `~/qntm/routines.md:5`, read-only. `[qntm:1507]]` has ONE opening bracket, so the engine does
    // not read it as an identity — and neither may this app. Hiding a token the engine will not
    // honour would hide the evidence that it is broken, which is the operator's only way to see it.
    const line = REAL_LINES[4];
    const painted = paintedLine(line);
    assert.ok(painted.includes("[qntm:1507]]"), "the malformed near-stamp was hidden");
    assert.ok(!painted.includes("[[qntm:2423]]"), "the real stamp beside it was not hidden");
    assert.equal(painted.split(MARK).length - 1, 1, "one mark, for the one real identity");
  });

  test("THE INVARIANT — never a half state, on any line the fixture has", () => {
    // ALL-OR-NOTHING, stated as one property over every line rather than as two branches. The
    // failure this refuses is the one that would be worst on the page AND worst in the file: a
    // line showing `&lt;span class="stampmark"…` with the stamp's own characters gone.
    for (const line of [...REAL_LINES, ...REAL_VIEW.split("\n")]) {
      const painted = paintedLine(line);
      const stamps = stampSpans(line).map((s) => s.text);
      const marked = painted.split(MARK).length - 1;
      const printed = stamps.filter((s) => painted.includes(s)).length;
      assert.equal(
        marked + printed, stamps.length,
        `${JSON.stringify(line)}: ${stamps.length} stamps became ${marked} marks and ${printed} ` +
          "printed — a stamp is neither shown nor marked, which is a LOST identity on the page",
      );
      assert.ok(
        marked === 0 || printed === 0,
        `${JSON.stringify(line)}: half marked and half printed`,
      );
      // AND NO ESCAPED MARKUP ANYWHERE, which is the shape the fallback exists to prevent.
      assert.ok(!painted.includes("stampmark&"), "escaped markup reached the page");
      assert.ok(!painted.includes("&lt;span"), "escaped markup reached the page");
    }
  });

  test("THE HEADLINE — the string the painter hands the write path is the source, byte for byte", () => {
    // What actually goes on the wire is `LineCommit.source` / `CheckboxToggle.source` — `applyEdit`'s
    // own input, the string this paint was handed. If hiding were done by editing that string, this
    // is where it would show, and it is the single assertion this whole change stands on.
    const seen = [];
    const focus = new FocusSurface();
    const body = view(REAL_VIEW, WIRED, {
      focus,
      onCheckboxToggle: (t) => seen.push(t.source),
      onLineCommit: (c) => seen.push(c.source),
    });

    for (const box of walk(body).filter((el) => el.type === "checkbox")) {
      box.checked = !box.checked;
      box.dispatch("change");
    }
    assert.ok(seen.length >= 6, `only ${seen.length} writes were exercised`);
    for (const source of seen) {
      assert.equal(source, REAL_VIEW, "the write path was handed a string that is not the source");
    }
  });

  test("ticking every box posts the file with ONE character different and every stamp intact", () => {
    const before = REAL_VIEW.split("\n");
    const posted = [];
    const body = view(REAL_VIEW, WIRED, { onCheckboxToggle: (t) => posted.push(t) });
    const boxes = walk(body).filter((el) => el.type === "checkbox");
    assert.ok(boxes.length >= 3, `the fixture painted only ${boxes.length} checkboxes`);

    for (const box of boxes) {
      box.checked = !box.checked;
      box.dispatch("change");
    }
    for (const toggle of posted) {
      assert.notEqual(toggle.markdown, null, "a real checkbox line was refused");
      const after = toggle.markdown.split("\n");
      assert.equal(after.length, before.length, "the file gained or lost lines");
      const changed = before.map((_, i) => i).filter((i) => before[i] !== after[i]);
      assert.deepEqual(changed, [toggle.lineIndex], "more than one line changed");
      const [i] = changed;
      const chars = [...before[i]].map((_, j) => j).filter((j) => before[i][j] !== after[i][j]);
      // THE GLYPH'S COLUMN, DERIVED FROM THE LINE. The engine nests by indenting, so a hardcoded
      // `3` would silently only ever check the un-nested lines — and nested lines are exactly the
      // ones the fallback treats differently, so they are the ones that must be checked.
      const glyph = before[i].indexOf("[") + 1;
      assert.deepEqual(chars, [glyph], "more than the glyph changed on the line that changed");
      // AND THE STAMPS. Not "the line looks right" — every stamp in the WHOLE FILE, in order.
      assert.deepEqual(
        after.flatMap((line) => stampSpans(line).map((s) => s.text)),
        before.flatMap((line) => stampSpans(line).map((s) => s.text)),
        "the round trip lost, gained or reordered an identity stamp",
      );
    }
  });

  test("editing a line's TITLE keeps that line's own stamp, byte for byte", () => {
    // The write path that could actually lose one: the cursor's line goes out as characters. If
    // the `<input>` were ever seeded from a rendition instead of from the source, THIS is the
    // assertion that goes red, and the node is the one that would have been re-minted.
    const commits = [];
    const focus = new FocusSurface();
    const body = view(REAL_VIEW, WIRED, { focus, onLineCommit: (c) => commits.push(c) });

    // `- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31` is index 3 of REAL_VIEW.
    const index = REAL_VIEW.split("\n").findIndex((line) => line.includes("[[qntm:2603]]"));
    focus.focus(index, REAL_VIEW, 0);
    const repainted = view(REAL_VIEW, WIRED, { focus, onLineCommit: (c) => commits.push(c) });
    const input = walk(repainted).find((el) => el.tagName === "input" && el.type === "text");
    assert.equal(input.value, REAL_VIEW.split("\n")[index], "the cursor's line is not its source");

    input.value = input.value.replace("Lesley pay tenner", "Lesley pay twenty");
    input.dispatch("blur");

    const commit = commits.at(-1);
    assert.notEqual(commit.markdown, null);
    const before = REAL_VIEW.split("\n");
    const after = commit.markdown.split("\n");
    assert.deepEqual(before.map((_, i) => i).filter((i) => before[i] !== after[i]), [index]);
    assert.equal(after[index], "- [ ] Lesley pay twenty [[qntm:2603]] #task 🆕 2026-07-31");
    assert.ok(after[index].includes("[[qntm:2603]]"), "THE STAMP WAS LOST — this re-mints the node");
    assert.ok(body !== null);
  });

  test("committing a hidden line UNCHANGED is refused, so nothing is posted at all", () => {
    // The commonest thing a cursor does. If the rendition had leaked into the input, the "text"
    // would differ from the line and `applyEdit` would accept it — posting a whole file, computed
    // from a rendition, over a file the engine wrote. It refuses instead.
    const lines = REAL_VIEW.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      assert.equal(
        applyEdit(REAL_VIEW, { kind: "set-line", lineIndex: i, text: lines[i] }),
        null,
        `line ${i} was accepted as an edit to itself`,
      );
    }
  });

  test("and the corrupted-DOM detector, aimed at the rendition where the DOM really differs", () => {
    // With the stamp hidden, a file rebuilt from the PAGE could not contain `[[qntm:2603]]` at all.
    // So the DOM is wrecked first and the posted file is checked after: if the painter ever reads
    // the page it is building, this is the assertion that catches it on the first try.
    const posted = [];
    const body = view(REAL_VIEW, WIRED, { onCheckboxToggle: (t) => posted.push(t) });
    // THE BOX IS TAKEN BEFORE THE WRECKING, because setting `innerHTML` clears an element's
    // children exactly as the real DOM does — a walk afterwards would not find it.
    const box = walk(body).find((el) => el.type === "checkbox");
    for (const el of walk(body)) {
      if (el.type !== "checkbox") {
        el.innerHTML = "WRECKED";
      }
    }
    box.checked = true;
    box.dispatch("change");

    assert.equal(posted.length, 1);
    assert.ok(!posted[0].markdown.includes("WRECKED"), "the posted file came out of the DOM");
    assert.deepEqual(
      posted[0].markdown.split("\n").flatMap((l) => stampSpans(l).map((s) => s.text)),
      REAL_VIEW.split("\n").flatMap((l) => stampSpans(l).map((s) => s.text)),
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2b. THE SAME, OVER THE LIVE VAULT — every line of every file, as it stands right now
// ════════════════════════════════════════════════════════════════════════════════════════════════

const VAULT = join(homedir(), "qntm");
const vaultAvailable = existsSync(VAULT);

describe("2b. THE LIVE VAULT — the round trip over every real line he has", () => {
  const skip = vaultAvailable
    ? false
    : `no vault at ${VAULT} — this section runs on the operator's machine and is skipped in CI, ` +
      "which has no vault to read (same posture as tests/present-address.test.mjs section 3). " +
      "Section 2 above carries literal copies so the acceptance claim is not skipped with it";

  /** Every `.md` under the vault, read READ-ONLY and never written. */
  const vaultFiles = () => {
    const found = [];
    const walkDir = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walkDir(path);
        else if (entry.name.endsWith(".md")) found.push(path);
      }
    };
    walkDir(VAULT);
    return found;
  };

  test("every stamped line in the vault paints hidden and writes back byte-identical", { skip }, () => {
    const files = vaultFiles();
    assert.ok(files.length > 0, "the vault is there and holds no markdown");
    let stampedLines = 0;
    let checkedFiles = 0;
    let hiddenStamps = 0;
    let fallbackStamps = 0;

    for (const path of files) {
      const source = readFileSync(path, "utf8");
      const stamps = source.split("\n").flatMap((l) => stampSpans(l).map((s) => s.text));
      if (stamps.length === 0) continue;
      checkedFiles += 1;
      stampedLines += stamps.length;

      // ONE. Painted wired, every stamped line is either marked or wholly printed — never half.
      for (const line of source.split("\n")) {
        const lineStamps = stampSpans(line).map((s) => s.text);
        if (lineStamps.length === 0) continue;
        const painted = paintedLine(line);
        const marked = painted.split(MARK).length - 1;
        const printed = lineStamps.filter((s) => painted.includes(s)).length;
        assert.equal(
          marked + printed, lineStamps.length,
          `${path}: ${JSON.stringify(line)} — an identity is neither shown nor marked`,
        );
        assert.ok(marked === 0 || printed === 0, `${path}: half marked and half printed`);
        if (marked > 0) hiddenStamps += lineStamps.length;
        else fallbackStamps += lineStamps.length;
      }

      // TWO. The write path's own input is the source, unchanged.
      const seen = [];
      const body = view(source, WIRED, { onCheckboxToggle: (t) => seen.push(t) });
      for (const box of walk(body).filter((el) => el.type === "checkbox")) {
        box.checked = !box.checked;
        box.dispatch("change");
      }
      for (const toggle of seen) {
        assert.equal(toggle.source, source, `${path}: the write path was handed a different string`);
        if (toggle.markdown === null) continue;
        // THREE. And the file that would go on the wire carries every stamp, in order.
        assert.deepEqual(
          toggle.markdown.split("\n").flatMap((l) => stampSpans(l).map((s) => s.text)),
          stamps,
          `${path}: a round trip through the wired rendition moved an identity stamp`,
        );
      }

      // FOUR. Every line, committed as itself, is refused — nothing is posted by looking.
      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        assert.equal(applyEdit(source, { kind: "set-line", lineIndex: i, text: lines[i] }), null);
      }
    }

    assert.ok(stampedLines >= 50, `only ${stampedLines} stamps were swept — the vault looks empty`);
    assert.ok(checkedFiles >= 3, `only ${checkedFiles} stamped files were swept`);

    // ── THE MEASUREMENT, RECORDED AS AN ASSERTION RATHER THAN AS A SENTENCE IN A REPORT ──
    //
    // 2026-08-01: 2,496 stamps, 2,390 hidden, 106 still printed — see `markupSurvives` above for
    // which lines those are and why. It is held as a RATIO with room either side, not as an exact
    // count, because the vault is the operator's living content and an exact count would go red
    // every time he types. What it catches is a real change of direction: a rendition that stopped
    // hiding most stamps, or a fallback that stopped firing where it should.
    const ratio = hiddenStamps / (hiddenStamps + fallbackStamps);
    assert.ok(
      ratio > 0.85,
      `only ${hiddenStamps} of ${hiddenStamps + fallbackStamps} stamps hide (${ratio.toFixed(3)}) ` +
        "— measured at 0.958 on 2026-08-01",
    );
    assert.ok(
      fallbackStamps > 0,
      "no stamp in the whole vault fell back — the indented-code-block branch is now untested " +
        "against real content, so its behaviour is asserted only by the constructed fixture",
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE CURSOR BRINGS THE CHARACTERS BACK — what makes hiding admissible
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("3. the stamp is RAW under the cursor", () => {
  test("FOCUS resolves `stamp` raw, and says which level did it", () => {
    // NOBODY EDITED focus.ts FOR THIS. Its contribution is built from RESOLUTION_KEYS, so the key
    // joined the cursor's raw set by being declared. This asserts the consequence.
    const focus = new FocusSurface();
    focus.focus(1);
    const on = new PresentationCascade(focus.contextFor(1, WIRED));
    const off = new PresentationCascade(focus.contextFor(2, WIRED));
    assert.deepEqual(on.resolve("stamp"), { rendition: "raw", level: "FOCUS" });
    assert.deepEqual(off.resolve("stamp"), { rendition: "wired", level: "GLOBAL" });
  });

  test("clicking a marked line shows its verbatim source, stamp included", () => {
    const focus = new FocusSurface();
    const body = view(REAL_VIEW, WIRED, { focus });
    assert.ok(marks(body) > 0, "the fixture painted no mark to begin with");

    const index = REAL_VIEW.split("\n").findIndex((line) => line.includes("[[qntm:2603]]"));
    walk(body).filter((el) => el.tagName === "span")
      .find((el) => String(el.innerHTML).includes("Lesley"))
      .dispatch("click", makeEvent());

    const input = walk(body).find((el) => el.tagName === "input" && el.type === "text");
    assert.equal(input.value, REAL_VIEW.split("\n")[index]);
    for (const substring of ["[[qntm:2603]]", "#task", "🆕 2026-07-31"]) {
      assert.ok(input.value.includes(substring), `the focused line lost ${substring}`);
    }
  });

  test("blur puts the mark back — the line returns to exactly what it was", () => {
    const focus = new FocusSurface();
    const body = view(REAL_VIEW, WIRED, { focus, onLineCommit: () => {} });
    const before = serialize(body);
    walk(body).filter((el) => el.tagName === "span")
      .find((el) => String(el.innerHTML).includes("Lesley"))
      .dispatch("click", makeEvent());
    walk(body).find((el) => el.tagName === "input" && el.type === "text").dispatch("blur");
    assert.equal(serialize(body), before, "the view did not return to what it was");
    assert.ok(marks(body) > 0);
  });

  test("EVERY key is raw under the cursor, so no future key can hide something unreachable", () => {
    const focus = new FocusSurface();
    focus.focus(0);
    const cascade = new PresentationCascade(focus.contextFor(0, WIRED));
    for (const key of RESOLUTION_KEYS) {
      assert.deepEqual(
        cascade.resolve(key), { rendition: "raw", level: "FOCUS" },
        `'${key}' is not raw under the cursor — a token it hides could never be edited`,
      );
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE BOUNDARY — a title-form wiki-link is HIS CONTENT and is never hidden
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("4. a wider wiki-link is not hidden", () => {
  // `~/qntm/habits.md:22` and `:24`, read-only. `#requires [[…]]` is outgoing-edge chrome, and its
  // target is named by a TITLE the operator wrote and reads. A rendition that hid the wider form
  // would take his own words off his page.
  const REQUIRES = REAL_LINES[2];
  const NAMED = REAL_LINES[3];

  test("the title form survives onto the page, verbatim, with the identity form hidden", () => {
    const body = view(["# W", "", REQUIRES, NAMED].join("\n"));
    const painted = serialize(body);
    assert.ok(painted.includes("[[JB to send over Sarasin]]"), "his own link was hidden");
    assert.ok(painted.includes("[[Store all somewhere]]"), "his own link was hidden");
    assert.ok(!painted.includes("[[qntm:1723]]"), "the identity stamp was not hidden");
    assert.ok(!painted.includes("[[qntm:1724]]"), "the identity stamp was not hidden");
    assert.equal(marks(body), 2, "one mark per identity stamp, and not one per wiki-link");
  });

  test("the two grammars are strictly ordered — every stamp is a wiki-link and not the reverse", () => {
    for (const line of REAL_LINES) {
      const stamps = stampSpans(line);
      const links = wikiLinkSpans(line);
      for (const stamp of stamps) {
        assert.ok(
          links.some((l) => l.start === stamp.start && l.end === stamp.end),
          `${JSON.stringify(line)}: a stamp that is not a wiki-link`,
        );
      }
      assert.ok(links.length >= stamps.length);
    }
    // AND THE INEQUALITY IS STRICT SOMEWHERE, or the two grammars are the same grammar and the
    // whole boundary argument is decoration.
    assert.ok(wikiLinkSpans(REQUIRES).length > stampSpans(REQUIRES).length);
  });

  test("word motions still SKIP the wider form — hiding narrowed, it did not narrow the skip", () => {
    // The word grammar must not have been dragged narrow by this change. `titleSpans` uses the
    // WIDE form, so no word target may land inside `[[JB to send over Sarasin]]`.
    const start = REQUIRES.indexOf("[[JB to send over Sarasin]]");
    const end = start + "[[JB to send over Sarasin]]".length;
    for (const word of titleSpans(REQUIRES)) {
      assert.ok(
        word.start >= end || word.end <= start,
        `a word target at ${word.start} lands inside the operator's own wiki-link`,
      );
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5. IT IS DECLARED, NOT BRANCHED
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("5. the rendition is a declaration with a reader, not an `if` in the painter", () => {
  test("`stamp` is a resolution key and its floor is `raw`", () => {
    assert.ok(RESOLUTION_KEYS.includes("stamp"));
    // THE FLOOR IS THE SAFE DIRECTION. If the served declaration ever fails to load, the app must
    // fall back to SHOWING the stamp. This is where that is decided.
    assert.equal(DEFAULT.stamp, "raw", "the floor hides an identity — the failure falls the wrong way");
  });

  test("a declaration of `raw` paints the characters and no mark at all", () => {
    const body = view(REAL_VIEW, STAMP_RAW);
    const painted = serialize(body);
    assert.equal(marks(body), 0, "a declaration of raw still painted marks");
    assert.ok(painted.includes("[[qntm:2603]]"), "raw did not carry the characters");
  });

  test("the key round-trips through the served-declaration reader, unnamed by it", () => {
    const { contribution, problems } = readDeclaration({ stamp: "wired" });
    assert.deepEqual(problems, []);
    assert.deepEqual(contribution, { stamp: "wired" });
    // And a value that is not a rendition is REPORTED, not guessed at.
    const bad = readDeclaration({ stamp: "hidden" });
    assert.equal(bad.contribution.stamp, undefined);
    assert.equal(bad.problems.length, 1);
    assert.match(bad.problems[0], /stamp/);
  });

  test("a more specific level beats GLOBAL, which is what makes it a cascade", () => {
    const context = new PresentationContext({ GLOBAL: { stamp: "wired" }, VIEW: { stamp: "raw" } });
    assert.deepEqual(new PresentationCascade(context).resolve("stamp"), {
      rendition: "raw",
      level: "VIEW",
    });
  });

  test("the painter READS the key on every shape it paints — checkbox, heading and prose", () => {
    // Three branches, three renditions of one key. A branch that forgot to ask would paint a
    // stamp the other two hide, which is worse than either end of the dial.
    const source = [
      "## Overdue [[qntm:10]]",
      "- [ ] a task [[qntm:11]] #task",
      "- a plain line [[qntm:12]] #task",
    ].join("\n");
    const body = view(source);
    const painted = serialize(body);
    for (const stamp of ["[[qntm:10]]", "[[qntm:11]]", "[[qntm:12]]"]) {
      assert.ok(!painted.includes(stamp), `${stamp} survived — one branch does not ask`);
    }
    assert.equal(marks(body), 3);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE MUTATION TARGET — the change that would look like this feature and destroy an identity
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("6. the mutation this suite exists to catch", () => {
  test("A GUARD THAT CANNOT GO RED IS DECORATION — so here is the red, produced on purpose", () => {
    // THE MUTATION, NAMED: hide the stamp by STRIPPING IT FROM THE SOURCE before painting. It is
    // one line, it produces a page that looks EXACTLY like this feature's page, and it is the
    // accident that cost the operator seven node identities on 2026-07-31 — the engine absorbs an
    // absent stamp's line into a new node's title, exit 0, no diagnostic.
    //
    // It is simulated rather than patched into paint.ts, because what the section-2 assertions
    // actually measure is the STRING the write path is handed. Feeding them the mutated string is
    // feeding them exactly what the mutated painter would have produced.
    const mutated = REAL_VIEW.split("\n")
      .map((line) => {
        let out = line;
        for (const span of [...stampSpans(line)].reverse()) {
          out = out.slice(0, span.start) + out.slice(span.end);
        }
        return out;
      })
      .join("\n");

    assert.notEqual(mutated, REAL_VIEW, "the mutation did not apply — this proof is vacuous");

    // §2's HEADLINE assertion, run against the mutated string. It must FAIL.
    assert.throws(
      () => assert.equal(mutated, REAL_VIEW),
      /AssertionError/,
      "the headline assertion cannot tell a stripped source from the real one",
    );

    // §2's STAMPS-IN-ORDER assertion, run against the mutated string. It must FAIL.
    assert.throws(
      () =>
        assert.deepEqual(
          mutated.split("\n").flatMap((l) => stampSpans(l).map((s) => s.text)),
          REAL_VIEW.split("\n").flatMap((l) => stampSpans(l).map((s) => s.text)),
        ),
      /AssertionError/,
      "the stamps-in-order assertion cannot tell a stripped file from the real one",
    );

    // AND THE UNMUTATED STRING PASSES BOTH, so the two assertions above are discriminating rather
    // than merely noisy.
    assert.equal(REAL_VIEW, REAL_VIEW);
    assert.deepEqual(
      REAL_VIEW.split("\n").flatMap((l) => stampSpans(l).map((s) => s.text)),
      REAL_VIEW.split("\n").flatMap((l) => stampSpans(l).map((s) => s.text)),
    );
  });

  test("A SECOND MUTATION — widen the hiding grammar, and section 4 goes red", () => {
    // The other way to get this wrong, and the one a reader would call a tidy-up: use
    // `wikiLinkSpans` (the grammar `titleSpans` already uses) instead of `stampSpans`. Nothing
    // crashes; the operator's own `[[JB to send over Sarasin]]` simply stops appearing on his page.
    const REQUIRES = REAL_LINES[2];
    const widened = wikiLinkSpans(REQUIRES).map((s) => REQUIRES.slice(s.start, s.end));
    const narrow = stampSpans(REQUIRES).map((s) => s.text);
    assert.ok(widened.includes("[[JB to send over Sarasin]]"), "the mutation did not apply");
    assert.ok(!narrow.includes("[[JB to send over Sarasin]]"));

    // Section 4's own assertion, run against what the widened painter would have hidden.
    assert.throws(
      () => assert.ok(!widened.includes("[[JB to send over Sarasin]]")),
      /AssertionError/,
      "section 4 cannot tell a widened grammar from the shipped one",
    );
  });

  test("A THIRD MUTATION — never hide, and section 2's positive control goes red", () => {
    // The failure that is merely inert rather than destructive, checked because "nothing changed"
    // is what a dead key produces too. `stamp: raw` IS the never-hide painter.
    const painted = serialize(view(REAL_VIEW, STAMP_RAW));
    assert.throws(
      () => assert.ok(!painted.includes("[[qntm:2603]]")),
      /AssertionError/,
      "the positive control cannot tell a working rendition from an inert one",
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 7. THE MARK CANNOT INJECT, AND WHERE IT WOULD NOT SURVIVE, THE CHARACTERS WIN
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("7. the mark is safe by the grammar, and falls back all-or-nothing", () => {
  test("no id the grammar can match carries a character that could close the attribute", () => {
    // The id goes into a `title="…"` attribute rather than into element content, so the claim that
    // has to hold is about `"` as well as about `<`, `>` and `&`. It is a property of the regex,
    // fuzzed rather than assumed.
    const hostile = ['"', "<", ">", "&", "'", "/", "\\", " ", "=", "`", " "];
    let matched = 0;
    for (const bad of hostile) {
      for (const shape of [`[[qntm:${bad}]]`, `[[qntm:a${bad}b]]`, `[[qntm:a${bad}]]`, `[[qntm:${bad}1]]`]) {
        for (const span of stampSpans(shape)) {
          matched += 1;
          for (const character of ['"', "<", ">", "&"]) {
            assert.ok(!span.id.includes(character), `${JSON.stringify(shape)} matched an id holding ${character}`);
          }
        }
      }
    }
    // A sanity check that the fuzz is reaching the grammar at all: `[[qntm:a/b]]` must match
    // NOTHING, and a well-formed one must match. Otherwise the loop above proves nothing.
    assert.equal(matched, 0, "a hostile character reached an id — the attribute is not safe");
    assert.equal(stampSpans("[[qntm:a1]]").length, 1, "the fuzz's own control did not match");
  });

  test("an indented line is a code block, so the whole line falls back to its characters", () => {
    // The engine indents nested lines by four spaces and markdown-it reads four spaces as an
    // indented code block, which ESCAPES the markup. A half-rendered mark would put
    // `&lt;span class="stampmark"…&gt;` on the page with the stamp's own characters GONE — worse
    // than either end of the dial. So the line goes back to its source, whole.
    // `[>]` rather than `[ ]` on purpose: a `- [ ]` line at ANY indent is a CHECKBOX line, and the
    // checkbox branch renders only the tail, inline, with no indent — so it never reaches a code
    // block and hides correctly. It is the glyphs OUTSIDE `TASK`'s `( |x|X)` — `[>]`, `[-]`, `[~]`,
    // `[/]`, all real spellings in the operator's vocabulary — that land in the prose branch.
    const indented = "        - [>] deep [[qntm:99]] #task";
    const painted = paintedLine(indented);
    assert.ok(!painted.includes(MARK), "a mark survived into a code block");
    assert.ok(painted.includes("[[qntm:99]]"), "the fallback lost the characters as well");
  });

  test("a NESTED CHECKBOX line still hides, because its tail renders with no indent", () => {
    // The other half of the sentence above, asserted so nobody reads the fallback as "nesting
    // breaks it". The engine indents by four and most nested lines are `- [ ]`; those are fine.
    const painted = paintedLine("        - [ ] deep [[qntm:99]] #task");
    assert.ok(painted.includes(MARK), "a nested checkbox line stopped hiding its stamp");
    assert.ok(!painted.includes("[[qntm:99]]"));
  });

  test("the fallback is all-or-nothing across BOTH token families", () => {
    // A line where the chip would not survive must not keep its mark either, and the reverse.
    // One line with one chip and one escaped mark is the worst of both.
    const indented = "        - [>] deep [[qntm:99]] #task #work";
    const painted = paintedLine(indented);
    assert.ok(!painted.includes("tagchip"), "a chip survived where the mark did not");
    assert.ok(!painted.includes(MARK));
    for (const token of ["[[qntm:99]]", "#task", "#work"]) {
      assert.ok(painted.includes(token), `the fallback lost ${token}`);
    }
  });

  test("chips and marks coexist on one line, each in its own place", () => {
    const body = view(["# W", "", "- [ ] a [[qntm:5]] #task #work"].join("\n"));
    const painted = serialize(body);
    assert.equal(marks(body), 1);
    assert.equal(painted.split('span class=\\"tagchip\\"').length - 1, 2);
    assert.ok(!painted.includes("[[qntm:5]]"));
    assert.ok(painted.includes("#task"), "the chip lost its own characters");
  });

  test("the mark carries the id where a person can find it, and nowhere a program reads", () => {
    const painted = serialize(view(["# W", "", "- [ ] a [[qntm:5]] #task"].join("\n")));
    assert.ok(painted.includes('title=\\"qntm:5\\"'), "the mark says nothing about which node it is");
  });
});

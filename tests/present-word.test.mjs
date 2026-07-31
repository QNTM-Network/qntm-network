/**
 * THE WORD-JUMP FALSIFIER — `titleSpans` counts what the operator counts, not what the source
 * string counts, and this is the suite that proves it against his own real content.
 *
 *   node --test tests/present-word.test.mjs
 *
 * design-the-vim-cursor.md section 2.3: "the third word counted while looking at NORMAL is not
 * the third word of the source string" — in NORMAL the chrome is a checkbox widget and a CSS
 * margin, in the source it is fifteen characters he has to count past, and landing `{count}w`
 * inside an identity stamp, a tag or a marker's date is worse than not having the feature: a typed
 * character there corrupts it, and the engine's own recorded failure is silent — absorbed into the
 * node's title, exit 0, no diagnostic (`app/present/paint.ts`'s cited header).
 *
 * FIVE JOBS, in order:
 *
 *   1. THE IDENTITY-STAMP GRAMMAR IS THE ENGINE'S — `qntmIdSpans` against `parse_qntm_id.py`'s own
 *      regex, cases plus a generated sweep, the same posture `present-tags.test.mjs` already
 *      established for `tagSpans`.
 *   2. THE WIDER BRACKET GRAMMAR IS ALSO THE ENGINE'S, AND IS THE ONE `titleSpans` ACTUALLY USES —
 *      `wikiLinkSpans` against `parse_wiki_link.py`'s own regex, and the reasoning for why this is
 *      a widening of what the design document asked for rather than what it asked for verbatim.
 *   3. MARKERS ARE SKIPPED BY SHAPE, NOT BY A HARDCODED LIST — every token in the shipped
 *      `config/vocabulary/markers.yaml` is proven caught by the generic `\p{Extended_Pictographic}`
 *      grammar, without that list appearing in the grammar itself.
 *   4. `titleSpans` FINDS THE RIGHT WORDS ON SYNTHETIC LINES — every shape `classifyLine` produces,
 *      including the real quirks found reading `~/qntm/*.md` (a `[>]` glyph `TASK` does not match
 *      but `CHECKBOX_GLYPH` does; a `#`-prefixed word with no leading whitespace that is NOT a tag).
 *   5. THE TEST THAT MATTERS MOST — every count, on every non-blank line pulled VERBATIM out of
 *      `~/qntm/*.md` (read-only; copied into this file as string literals so a live edit to the
 *      vault never changes what this suite asserts), never lands `{count}w`/`b`/`e` inside an
 *      identity stamp, a wiki-link, a tag, or a marker's value.
 *
 * Everything here runs against dist/present.js, the artifact the browser loads.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { qntmIdSpans, wikiLinkSpans, markerSpans, titleSpans, wordCaret } from "../dist/present.js";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. qntmIdSpans — the identity stamp, mirrored from parse_qntm_id.py
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("1. qntmIdSpans is what parse_qntm_id.py says [[qntm:ID]] is", () => {
  // Verbatim from the engine, cited so it can be checked rather than trusted:
  //
  //   apps/qntm-md/src/qntm_md/io/parser/parse_qntm_id.py:20-23
  //     _QNTM_ID_RE = re.compile(
  //         r"\[\[qntm:([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)\]\]",
  //         re.IGNORECASE,
  //     )
  const ENGINE = /\[\[qntm:([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)\]\]/gi;
  const engineSpans = (text) => [...text.matchAll(ENGINE)].map((m) => [m.index, m.index + m[0].length]);
  const appSpans = (text) => qntmIdSpans(text).map((s) => [s.start, s.end]);

  // The engine's own answers, from tests/io/parser/test_parse_qntm_id.py.
  const CASES = [
    ["Capture task [[qntm:17389]]", [[13, 27]]],
    ["Pre [[qntm:abc123]] post", [[4, 19]]],
    ["[[qntm:42]]", [[0, 11]]],
    ["[[qntm:7]] tail", [[0, 10]]],
    ["head [[qntm:9]]", [[5, 15]]],
    ["a [[qntm:5]] b", [[2, 12]]],
    ["ref [[qntm:my_id_42]] x", [[4, 21]]],
    ["Ref [[QNTM:42]] tail", [[4, 15]]],
    ["No ID here", []],
    ["See [[Some Note]]", []],
    ["", []],
    ["qntm:42 raw", []],
    ["[[qntm:1]] middle [[qntm:2]] tail", [[0, 10], [18, 28]]],
    ["[[qntm:123e4567-e89b-12d3-a456-426614174000]]", [[0, 45]]],
  ];

  for (const [text, expected] of CASES) {
    test(`${JSON.stringify(text)} -> ${JSON.stringify(expected)}`, () => {
      assert.deepEqual(appSpans(text), expected);
      assert.deepEqual(
        engineSpans(text),
        expected,
        "the case table itself disagrees with the engine's regex — the table is wrong, not the app",
      );
    });
  }

  test("a span points at the characters it came from, exactly", () => {
    const line = "- [ ] Pay aug [[qntm:1234]] #task #personal";
    for (const span of qntmIdSpans(line)) {
      assert.equal(line.slice(span.start, span.end), "[[qntm:1234]]");
    }
  });

  test("the shipped form and the engine's own form accept the same language over a generated sweep", () => {
    const prefixes = ["", " ", "a ", "[[", "[[qntm:", "head "];
    const bodies = ["qntm:17389", "qntm:abc123", "qntm:my_id_42", "QNTM:42", "Some Note", "qntm:", "qntm:-x-"];
    const suffixes = ["", " tail", "]]", " [[qntm:2]]"];
    let compared = 0;
    for (const p of prefixes) {
      for (const b of bodies) {
        for (const s of suffixes) {
          const text = `${p}[[${b}]]${s}`;
          assert.deepEqual(appSpans(text), engineSpans(text), `differs for ${JSON.stringify(text)}`);
          compared += 1;
        }
      }
    }
    assert.ok(compared >= 150, `sweep too small to be evidence (${compared})`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. wikiLinkSpans — the WIDER grammar titleSpans actually uses, mirrored from parse_wiki_link.py
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("2. wikiLinkSpans is what parse_wiki_link.py says [[...]] is — wider than the id form", () => {
  // Verbatim from the engine:
  //
  //   apps/qntm-md/src/qntm_md/io/parser/parse_wiki_link.py:26
  //     _WIKI_LINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
  //
  // `line_parser.parse_line` (the actual ingest path for a hand-typed line, line_parser.py:150,
  // 357) calls THIS parser, not parse_qntm_id — see resolution.ts's header for the full argument.
  const ENGINE = /\[\[([^\]]+)\]\]/g;
  const engineSpans = (text) => [...text.matchAll(ENGINE)].map((m) => [m.index, m.index + m[0].length]);
  const appSpans = (text) => wikiLinkSpans(text).map((s) => [s.start, s.end]);

  const CASES = [
    "[[qntm:42]]",
    "See [[Some Note]]",
    "#requires [[JB to send over Sarasin]]",
    "#requires [[Store all somewhere]]",
    "Started in last 30 days email [qntm:1507]] [[qntm:2423]]",
    "[[a]] and [[b]] and [[c]]",
    "no links here at all",
    "[unmatched",
    "[[unmatched",
    "[[]]",
  ];
  for (const text of CASES) {
    test(`${JSON.stringify(text)}`, () => {
      assert.deepEqual(appSpans(text), engineSpans(text));
    });
  }

  test("every qntmIdSpans span is also a wikiLinkSpans span — the wider grammar strictly contains the narrower one", () => {
    const lines = [
      "- [ ] Pay aug [[qntm:1234]] #task #personal",
      "- [x] Store all somewhere [[qntm:1723]] #task #work #requires [[JB to send over Sarasin]]",
    ];
    for (const line of lines) {
      for (const idSpan of qntmIdSpans(line)) {
        assert.ok(
          wikiLinkSpans(line).some((w) => w.start === idSpan.start && w.end === idSpan.end),
          `wikiLinkSpans missed an id span qntmIdSpans found in ${JSON.stringify(line)}`,
        );
      }
    }
  });

  test("a wiki-link with internal whitespace is ONE span, not several — this is why the narrower grammar is not enough", () => {
    const line = "#requires [[JB to send over Sarasin]]";
    const spans = wikiLinkSpans(line);
    assert.equal(spans.length, 1);
    assert.equal(line.slice(spans[0].start, spans[0].end), "[[JB to send over Sarasin]]");
  });

  test("a malformed single-bracket stamp (a real typo found in ~/qntm/routines.md) matches nothing — it is real title text to the engine too", () => {
    // "[qntm:1507]]" — one leading bracket, not two. parse_wiki_link.py's own regex requires "[["
    // literally, so this stays UNEXTRACTED on the engine side as well; titleSpans must not invent
    // protection for something the engine itself leaves in the title.
    const line = "- [ ] Started in last 30 days email [qntm:1507]] [[qntm:2423]] #routine";
    assert.deepEqual(wikiLinkSpans(line).map((s) => line.slice(s.start, s.end)), ["[[qntm:2423]]"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. markerSpans — every token in the SHIPPED config, caught by shape rather than by a list
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("3. markerSpans catches every marker the shipped instance declares, without naming one of them", () => {
  // apps/qntm-md/config/vocabulary/markers.yaml, every row, transcribed here ONLY to prove the
  // shape-based grammar catches it — this list appears in the TEST, never in markerSpans itself.
  // See resolution.ts's header for why: which glyphs are markers is vocabulary, not code, and an
  // operator who adds a 13th marker to his own config must go on being protected.
  const VALUE_BEARING = ["📅", "🛫", "✅", "🆕", "☑️", "🎯", "🔢"];
  const STATIC = ["🔽", "⏫", "⛔", "📌", "🏳️", "💤"];

  for (const glyph of VALUE_BEARING) {
    test(`${JSON.stringify(glyph)} (value-bearing) consumes its glyph AND a trailing date/int/float`, () => {
      for (const value of ["2026-08-28", "1", "0.67"]) {
        const line = `title ${glyph} ${value} tail`;
        const spans = markerSpans(line);
        const hit = spans.find((s) => line.slice(s.start, s.end).includes(glyph));
        assert.ok(hit, `no marker span found for ${glyph} in ${JSON.stringify(line)}`);
        assert.equal(line.slice(hit.start, hit.end), `${glyph} ${value}`);
      }
    });
  }

  for (const glyph of STATIC) {
    test(`${JSON.stringify(glyph)} (static) consumes only its glyph, never a following ordinary word`, () => {
      const line = `title ${glyph} tail`;
      const spans = markerSpans(line);
      const hit = spans.find((s) => line.slice(s.start, s.end).includes(glyph));
      assert.ok(hit, `no marker span found for ${glyph} in ${JSON.stringify(line)}`);
      assert.equal(line.slice(hit.start, hit.end), glyph, "a static marker swallowed a real word after it");
    });
  }

  test("real vault line: ☑️ 1 is one atom, glyph and its render-only count together", () => {
    const line = "- [ ] Schonfeld trial + conversion [[qntm:1975]] #outcome #work ☑️ 1";
    const spans = markerSpans(line);
    const hit = spans.find((s) => line.slice(s.start, s.end).startsWith("☑️"));
    assert.equal(line.slice(hit.start, hit.end), "☑️ 1");
  });

  test("real vault line: 🎯 0.21 on a HEADING (metrics.md) — markerSpans has no opinion on line shape", () => {
    const line = "## On-track accuracy (today) 🎯 0.21";
    const spans = markerSpans(line);
    assert.equal(spans.length, 1);
    assert.equal(line.slice(spans[0].start, spans[0].end), "🎯 0.21");
  });

  test("two markers stuck together with no space (the shape asserted_state deliberately uses) are two atoms, not one", () => {
    const line = "state 🏳️💤 tail";
    const spans = markerSpans(line);
    assert.equal(spans.length, 2);
    assert.equal(line.slice(spans[0].start, spans[0].end), "🏳️");
    assert.equal(line.slice(spans[1].start, spans[1].end), "💤");
  });

  test("a NAMED tradeoff: a decorative emoji actually typed into a title is also treated as an atom", () => {
    // Not found anywhere in ~/qntm/*.md (all five files, read-only) — every emoji encountered
    // while building this change was trailing chrome. This is the documented cost of matching by
    // SHAPE rather than by the shipped list: a hypothetical "Buy 🎂 for the party" title would have
    // its cake emoji skipped by a word motion. The safe direction: skip one extra word, never land
    // inside real chrome.
    const line = "Buy 🎂 for the party";
    const spans = markerSpans(line);
    assert.equal(spans.length, 1);
    assert.equal(line.slice(spans[0].start, spans[0].end), "🎂");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. titleSpans — synthetic coverage of every shape classifyLine produces
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("4. titleSpans finds the title words, chrome and atoms cut out first", () => {
  test("a checkbox line: chrome, then title words, then stamp and tag both skipped", () => {
    const line = "- [ ] Pay aug [[qntm:1234]] #task #personal";
    const words = titleSpans(line).map((s) => line.slice(s.start, s.end));
    assert.deepEqual(words, ["Pay", "aug"]);
  });

  test("indent is chrome too — a nested checkbox line", () => {
    const line = "        - [ ] Pay aug [[qntm:1234]] #task #personal";
    const words = titleSpans(line).map((s) => line.slice(s.start, s.end));
    assert.deepEqual(words, ["Pay", "aug"]);
  });

  test("a done task ([x]) is chrome exactly the same way", () => {
    const line = "- [x] Store all somewhere [[qntm:1723]] #task #work";
    const words = titleSpans(line).map((s) => line.slice(s.start, s.end));
    assert.deepEqual(words, ["Store", "all", "somewhere"]);
  });

  test("a heading carries a title too, tags included", () => {
    const line = "## Overdue #work";
    const words = titleSpans(line).map((s) => line.slice(s.start, s.end));
    assert.deepEqual(words, ["Overdue"]);
  });

  test("a bare heading marker ('## ', nothing after) has no title", () => {
    assert.deepEqual(titleSpans("## "), []);
  });

  test("a blank line has no title", () => {
    assert.deepEqual(titleSpans(""), []);
    assert.deepEqual(titleSpans("   "), []);
  });

  test("chrome with nothing after it has no title — bullet only, checkbox glyph only", () => {
    assert.deepEqual(titleSpans("- "), []);
    assert.deepEqual(titleSpans("- [ ] "), []);
  });

  test("a real quirk: '[>]' is not TASK's checkbox, so classifyLine calls the line prose — but CHECKBOX_GLYPH still strips it as chrome (~/qntm/habits.md:5)", () => {
    const line = "    - [>] Reminder / consideration? [[qntm:2397]] #routine #every-2d #admin 🛫 2026-08-02";
    const words = titleSpans(line).map((s) => line.slice(s.start, s.end));
    assert.deepEqual(words, ["Reminder", "/", "consideration?"]);
  });

  test("a real quirk: 'n#task' has no leading whitespace before the #, so it is NOT a tag and stays a title word (~/qntm/this_week.md:4)", () => {
    const line =
      "    - [ ] Kick off trial / confirm it's kicked off n#task [[qntm:1986]] #task #work 📅 2026-08-01 🛫 2026-08-01 🆕 2026-07-15";
    const words = titleSpans(line).map((s) => line.slice(s.start, s.end));
    assert.deepEqual(words, [
      "Kick",
      "off",
      "trial",
      "/",
      "confirm",
      "it's",
      "kicked",
      "off",
      "n#task",
    ]);
  });

  test("a plain bulleted prose line (no checkbox) is chrome-stripped the same way", () => {
    const line = "- a bare list item that is not a task";
    const words = titleSpans(line).map((s) => line.slice(s.start, s.end));
    assert.deepEqual(words, ["a", "bare", "list", "item", "that", "is", "not", "a", "task"]);
  });

  test("prose with no bullet at all keeps every word — there is no chrome to strip", () => {
    const line = "prose with no tags at all";
    const words = titleSpans(line).map((s) => line.slice(s.start, s.end));
    assert.deepEqual(words, ["prose", "with", "no", "tags", "at", "all"]);
  });

  test("multiple spaces between words do not produce an empty word", () => {
    const line = "- [ ] two    spaces";
    const words = titleSpans(line).map((s) => line.slice(s.start, s.end));
    assert.deepEqual(words, ["two", "spaces"]);
  });

  test("the returned spans point at exactly the characters they came from", () => {
    const line = "        - [ ] Pay aug [[qntm:1234]] #task #personal 📅 2026-08-28 🛫 2026-07-28 🆕 2026-06-28";
    for (const span of titleSpans(line)) {
      assert.ok(span.end > span.start, "an empty span was returned");
      assert.ok(!/\s/.test(line.slice(span.start, span.end)), "a word span carried whitespace");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 5. THE TEST THAT MATTERS MOST — real lines out of ~/qntm/*.md, every count, every motion
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Verbatim lines copied out of the operator's real, read-only vault (`~/qntm/this_week.md`,
 * `habits.md`, `routines.md`, `metrics.md`, `inbox.md`) on 2026-07-31. Copied rather than read at
 * test time, on purpose: the vault is a LIVE file a running cycle can rewrite between one test run
 * and the next (observed during this change), and a fixture that reads it fresh would make this
 * suite's pass/fail depend on when it happened to run.
 */
const REAL_LINES = [
  "        - [ ] Pay aug [[qntm:1234]] #task #personal 📅 2026-08-28 🛫 2026-07-28 🆕 2026-06-28",
  "- [ ] Schonfeld trial + conversion [[qntm:1975]] #outcome #work ☑️ 1",
  "    - [ ] Kick off trial / confirm it's kicked off n#task [[qntm:1986]] #task #work 📅 2026-08-01 🛫 2026-08-01 🆕 2026-07-15",
  "- [ ] Pay back per Darinz' plan said on 16th May [[qntm:1232]] #outcome #personal",
  "- [ ] Check personal outcomes [[qntm:1054]] #task #personal 🛫 2026-07-27 🆕 2026-07-28",
  "- [ ] Check in with client confirming 1st Aug for WYPF and update internal thred [[qntm:1442]] #task #work 🛫 2026-08-01 🆕 2026-06-29",
  "    - [>] Reminder / consideration? [[qntm:2397]] #routine #every-2d #admin 🛫 2026-08-02",
  "- [ ] Started in last 30 days email [qntm:1507]] [[qntm:2423]] #routine #work #every-14d 🛫 2026-07-28",
  "    - [x] Store all somewhere [[qntm:1723]] #task #work ✅ 2026-07-13 🆕 2026-07-07 #requires [[JB to send over Sarasin]]",
  "    - [x] Set up reminders / system [[qntm:1724]] #task #work ✅ 2026-07-13 🆕 2026-07-07 #requires [[Store all somewhere]]",
  "    - [ ] Clean auditing and fair payments of shared account / split bills [[qntm:1240]] #outcome #personal ☑️ 1",
  "## On-track accuracy (today) 🎯 0.21",
  "## Age of intent (30d) 🎯 5.7",
  "- [ ] Coltrane - new account [[qntm:2594]] #task 🆕 2026-07-31",
];

/** Every atom a REAL line carries — used only to assert nothing lands inside one. */
function forbiddenSpans(line) {
  return [...wikiLinkSpans(line), ...markerSpans(line)].filter((span) => span.end > span.start + 1);
  // `+1`: a bare single-character span (a static marker with nothing consumed after it) is a valid
  // WORD TARGET in vim's own sense — the caret landing exactly AT its start, offset 0 into it, is
  // "on" the atom the same way `w` lands ON a word's first character, not "inside" it destructively.
  // What must never happen is the caret landing STRICTLY inside a multi-character atom — the one
  // and two-character glyphs this repo's markers use can never be split by a keystroke anyway.
}

describe("5. THE TEST THAT MATTERS MOST — no {count}w/b/e for any count lands inside a real atom", () => {
  for (const line of REAL_LINES) {
    test(`${JSON.stringify(line.trim().slice(0, 60))}…`, () => {
      const words = titleSpans(line);
      assert.ok(words.length > 0, "a real task/outcome/routine line produced no title at all");
      const forbidden = forbiddenSpans(line);

      for (const motion of ["w", "b", "e"]) {
        for (let count = 1; count <= words.length + 3; count += 1) {
          const at = wordCaret(line, motion, count);
          assert.notEqual(at, null, `${motion}(${count}) refused a line with a real title`);
          for (const span of forbidden) {
            assert.ok(
              at <= span.start || at >= span.end,
              `${motion}(${count}) landed at ${at}, inside ${JSON.stringify(line.slice(span.start, span.end))} ` +
                `in ${JSON.stringify(line)}`,
            );
          }
        }
      }
    });
  }

  test("every word titleSpans returns is itself entirely outside every atom, on every real line", () => {
    for (const line of REAL_LINES) {
      const forbidden = forbiddenSpans(line);
      for (const word of titleSpans(line)) {
        for (const span of forbidden) {
          const disjoint = word.end <= span.start || word.start >= span.end;
          assert.ok(
            disjoint,
            `a returned title word ${JSON.stringify(line.slice(word.start, word.end))} overlaps ` +
              `${JSON.stringify(line.slice(span.start, span.end))} in ${JSON.stringify(line)}`,
          );
        }
      }
    }
  });
});

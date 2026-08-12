/**
 * THE CURSOR COLUMN MATRIX — every insert entry crossed with every exit, through the real page.
 *
 * ── WHY THIS SUITE EXISTS, AND WHY IT WAS WRITTEN BEFORE THE WIRING IT CHECKS ──
 *
 * The operator, using the deployed app on 2026-08-12, after the resolver landed:
 *
 *   "Largely working. But pressing o and a and enter and escape various combinations doesn't land
 *    where we expect."
 *
 * The single gestures were right. The CROSSINGS were not. The previous enforcer
 * (tests/flow_scenarios/insert_column_writeback.ts) was green throughout, and that is the finding
 * this file is built around: it asserted the column at the moment a row is OPENED — exactly the one
 * moment the wiring got right. THE ASSERTION AND THE FIX SHARED A BLIND SPOT, because the enforcer
 * was authored alongside the fix and inherited its idea of WHEN the property should hold.
 *
 * So this suite is written from the OPERATOR'S REPORT and from the measured matrix, not from any
 * implementation. Every cell below was measured on unmodified main first; the numbers in the
 * backlog row `the-column-is-resolved-once-and-never-again` are what it produced. A cell that goes
 * red because the wiring does something nobody anticipated is this suite working, not the spec
 * being wrong.
 *
 * ── THE ONE CLAIM, IN EVERY CELL ──
 *
 * `FocusSurface.column` agrees with the caret that actually exists. `FocusSurface` is declared
 * (classes.yaml, `cursor-position`) as the one place that holds where the cursor is; a surface that
 * disagrees with the caret on screen is not holding that fact, whatever else it holds.
 *
 * ── WHAT THIS SUITE DELIBERATELY DOES NOT DECIDE ──
 *
 * WHERE THE CURSOR GOES WHEN HE LEAVES INSERT. Vim steps one column LEFT (INSERT sits between
 * characters, NORMAL sits on one) and this app defaults to vim because everything else in it
 * already does. But that is a DECLARED DECISION and it lives in ONE line of app/present/column.ts
 * (`case "leave-insert"`). This suite asserts that the instruction was APPLIED — by comparing
 * against `columnFor` itself — never that it points a particular way. Flipping the direction is one
 * edit in column.ts and this file goes on passing, which is what makes it a decision the operator
 * owns rather than a fact welded into a test.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

import { importPage, installBrowser, makeEvent, makeWorkDir, walk } from "./fixtures/app-html-page.mjs";

const WORK = makeWorkDir("app-cursor-column-matrix");

/** A checkbox line with a real title, so `w` reaches a genuine non-zero column. */
const LINE = "- [ ] first task [[qntm:1]] #task";
const VIEW = {
  id: "this-week",
  path: "work/outcomes.md",
  title: "This Week",
  domain: "work",
  markdown: ["# This Week", LINE, "- [ ] second task [[qntm:2]] #task"].join("\n"),
};

let page;
let elements;
let doc;
let columnFor;

before(async () => {
  ({ elements, document: doc } = installBrowser());
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  page = await importPage(WORK);
  page.__setGraphData({ snapshot: { generated_at: "2026-07-31T00:00:00Z", views: [VIEW] } });
  ({ columnFor } = await import("../dist/present.js"));
});

const body = () => elements.get("viewBody");
const inputs = () => walk(body()).filter((el) => el.tagName === "input" && el.type === "text");
const openRow = () => inputs()[0] ?? null;
const press = (key) => doc.dispatch("keydown", makeEvent({ key }));
const pressIn = (el, key) => el.dispatch("keydown", makeEvent({ key }));
const column = () => page.__focusColumn();

/** `gg` then `j` — onto the checkbox line at column 0, using the bindings themselves. */
function fresh() {
  page.paintView("this-week");
  press("g");
  press("g");
  press("j");
}

/**
 * TYPE THE WAY A BROWSER DOES: the value grows, the caret moves with it, and an `input` event
 * fires. Firing the event is load-bearing — a helper that only mutated the fields would be
 * unreactable-to by any implementation, and the suite would be a mirror rather than an enforcer.
 */
function type(el, text) {
  const at = el.selectionStart ?? el.value.length;
  el.value = el.value.slice(0, at) + text + el.value.slice(at);
  el.setSelectionRange(at + text.length, at + text.length);
  el.dispatch("input", makeEvent({ target: el }));
}

const TYPINGS = [
  ["nothing", ""],
  ["a little", "XY"],
  ["past the original column", "XXXXXXXXXX"],
];

describe("MOMENT 1 — while the row is open, the column follows the caret", () => {
  for (const entry of ["i", "a"]) {
    for (const [label, text] of TYPINGS) {
      for (const startColumn of [0, 6]) {
        test(`${entry} from column ${startColumn}, typing ${label}`, () => {
          fresh();
          if (startColumn > 0) press("w");
          press(entry);
          const row = openRow();
          assert.ok(row, `${entry} did not open an editable row`);
          if (text) type(row, text);
          assert.equal(
            column(),
            row.selectionStart,
            `the column does not follow the caret: caret ${row.selectionStart}, column ${column()}`,
          );
        });
      }
    }
  }
});

describe("MOMENT 2 — when he leaves INSERT, the column carries an instruction", () => {
  for (const entry of ["i", "a"]) {
    for (const [label, text] of TYPINGS) {
      test(`${entry}, type ${label}, Escape`, () => {
        fresh();
        press(entry);
        const row = openRow();
        assert.ok(row, `${entry} did not open an editable row`);
        if (text) type(row, text);
        const caretAtExit = row.selectionStart;
        pressIn(row, "Escape");
        assert.equal(page.__vimMode(), "NORMAL", "Escape did not return to NORMAL");
        // AGAINST `columnFor`, NOT AGAINST A NUMBER. This asserts the instruction was APPLIED and
        // says nothing about which way it points — see this file's header. Flip the direction in
        // app/present/column.ts and this assertion follows it.
        assert.equal(
          column(),
          columnFor({ kind: "leave-insert" }, LINE, caretAtExit),
          "leaving INSERT did not resolve the column through the leave-insert instruction",
        );
      });
    }
  }
});

describe("MOMENT 3 — a draft's caret and the column are the same fact", () => {
  for (const entry of ["o", "O"]) {
    for (const [label, text] of TYPINGS) {
      for (const startColumn of [0, 6]) {
        test(`${entry} from column ${startColumn}, typing ${label}`, () => {
          fresh();
          if (startColumn > 0) press("w");
          press(entry);
          const row = openRow();
          assert.ok(row, `${entry} did not open a draft row`);
          if (text) type(row, text);
          assert.equal(
            column(),
            row.selectionStart,
            `the draft's caret is at ${row.selectionStart} and the column says ${column()} — ` +
              "`o`/`O` place their caret in paintDraft, which must reach the resolver like every " +
              "other path",
          );
        });
      }
    }
  }
});

describe("THE CROSSINGS — the operator's own report: two episodes in sequence", () => {
  for (const first of ["i", "a", "o", "O"]) {
    for (const exit of ["Escape", "Enter"]) {
      for (const second of ["i", "a"]) {
        test(`${first} → type → ${exit} → ${second}`, () => {
          fresh();
          press(first);
          const one = openRow();
          assert.ok(one, `${first} did not open a row`);
          type(one, "AB");
          pressIn(one, exit);

          press(second);
          const two = openRow();
          // Enter commits and opens a line BELOW (paint.ts's `settle(true)`), which is a decided
          // behaviour, not a defect — so after Enter the second keystroke lands in a draft that is
          // already open and no new row is expected. Either way the claim is the same one.
          if (two === null) {
            assert.equal(page.__vimMode(), "NORMAL", "no row is open and the app is not in NORMAL");
            return;
          }
          assert.equal(
            column(),
            two.selectionStart,
            `after ${first}/${exit}/${second} the caret is at ${two.selectionStart} and the ` +
              `column says ${column()} — the crossing the operator reported`,
          );
        });
      }
    }
  }
});

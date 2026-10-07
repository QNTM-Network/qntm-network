// One completion shape for every "suggest while typing" source, and the date source (2026-10-07).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { addDays, applyCompletion, completeWith, dateChoices, dateMarkers, dateSource, tagSource } from "../dist/present.js";

const TODAY = "2026-10-07"; // a Wednesday
const MARKERS = ["📅", "⏳", "🛫"];
const dates = dateSource(MARKERS, () => TODAY, "monday");

describe("dateMarkers", () => {
  test("reads every date-kind marker from the config, except the two the engine stamps", () => {
    const sources = {
      qualification: {
        extractionFields: {
          due_date: { token: "📅", kind: "date" },
          scheduled_date: { token: "⏳", kind: "date" },
          created_at: { token: "🆕", kind: "date" },
          completed_at: { token: "✅", kind: "date" },
          queue_position: { token: "🔢", kind: "int" },
        },
      },
    };
    assert.deepEqual(dateMarkers(sources), ["📅", "⏳"]);
  });
});

describe("dateChoices", () => {
  test("labels and dates from a Wednesday, week starting Monday", () => {
    assert.deepEqual(dateChoices(TODAY, "monday"), [
      { label: "Today", date: "2026-10-07" },
      { label: "Tomorrow", date: "2026-10-08" },
      { label: "Next Monday", date: "2026-10-12" },
      { label: "In a week", date: "2026-10-14" },
      { label: "In 2 weeks", date: "2026-10-21" },
      { label: "In a month", date: "2026-11-07" },
    ]);
  });
  test("on the week-start day, 'next' means a week ahead", () => {
    assert.equal(dateChoices("2026-10-12", "monday")[2].date, "2026-10-19");
  });
  test("month arithmetic clamps to the month's last day", () => {
    assert.equal(dateChoices("2026-01-31", "monday")[5].date, "2026-02-28");
  });
  test("addDays crosses month and year ends", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  });
});

describe("dateSource", () => {
  test("a marker and a space open the list", () => {
    const answer = dates("Call Bob ⏳ ", 11);
    assert.equal(answer.start, 11);
    assert.equal(answer.items[1].insert, "2026-10-08");
    assert.equal(answer.items[1].label, "Tomorrow · 2026-10-08");
  });
  test("typed digits narrow the list", () => {
    const answer = dates("Call ⏳ 2026-11", 15);
    assert.deepEqual(answer.items.map((i) => i.insert), ["2026-11-07"]);
  });
  test("text after the date has moved on — nothing offered", () => {
    assert.equal(dates("Call ⏳ 2026-10-08 again", 23), null);
  });
  test("an abstaining clock offers nothing", () => {
    assert.equal(dateSource(MARKERS, () => undefined, "monday")("x ⏳ ", 4), null);
  });
});

describe("completeWith and applyCompletion", () => {
  const sources = [tagSource(["#task", "#work"]), dates];
  test("the first source with items wins", () => {
    assert.equal(completeWith(sources, "Call #wo", 8).items[0].insert, "#work");
    assert.equal(completeWith(sources, "Call ⏳ ", 7).items[0].insert, TODAY);
    assert.equal(completeWith(sources, "Call Bob", 8), null);
  });
  test("taking a date fills it in and leaves the caret after a space", () => {
    const answer = dates("Call ⏳ ", 7);
    assert.deepEqual(applyCompletion("Call ⏳ ", answer, "2026-10-08"), { text: "Call ⏳ 2026-10-08 ", caret: 18 });
  });
});

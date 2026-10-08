// Marker completion: `:name` offers the config's own markers (2026-10-08).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { applyCompletion, completeWith, dateSource, markerQueryAt, markerSource, markerVocabulary } from "../dist/present.js";

const SOURCES = {
  qualification: {
    extractionFields: {
      due_date: { token: "📅", kind: "date" },
      scheduled_date: { token: "⏳", kind: "date" },
      queue_position: { token: "🔢", kind: "int" },
    },
    tokens: {
      lead_state: { "📌": "active" },
      priority: { "⏫": "high", "🔽": "low" },
      status: { "[ ]": "open", "[x]": "done" },
      domain: { "#family": "family" },
    },
  },
};
const markers = markerVocabulary(SOURCES);
const source = markerSource(markers);

describe("markerVocabulary", () => {
  test("reads every marker from the config, and no tag or checkbox", () => {
    assert.deepEqual(markers.map((m) => m.token), ["📅", "⏳", "🔢", "📌", "⏫", "🔽"]);
    assert.equal(markers.find((m) => m.token === "⏳").name, "scheduled date");
    assert.equal(markers.find((m) => m.token === "⏫").name, "high · priority");
  });
});

describe("markerQueryAt", () => {
  test("a colon that starts a word opens the query", () => {
    assert.deepEqual(markerQueryAt("Call bank :sch", 14), { start: 10, query: "sch" });
    assert.deepEqual(markerQueryAt(":", 1), { start: 0, query: "" });
  });
  test("a colon inside a word or a time does not", () => {
    assert.equal(markerQueryAt("Note: x", 5), null);
    assert.equal(markerQueryAt("at 10:30", 8), null);
  });
});

describe("markerSource", () => {
  test(":sched offers the scheduled marker, by its name", () => {
    const offer = source("Call bank :sched", 16);
    assert.deepEqual(offer.items.map((i) => i.insert), ["⏳"]);
    assert.match(offer.items[0].label, /⏳\s+scheduled date/);
  });
  test("a value name matches too: :high offers ⏫", () => {
    assert.deepEqual(source(":high", 5).items.map((i) => i.insert), ["⏫"]);
  });
  test("a bare colon offers every marker", () => {
    assert.equal(source("x :", 3).items.length, markers.length);
  });
  test("taking a date marker leaves the caret where the date list opens", () => {
    const offer = source("Call bank :sched", 16);
    const out = applyCompletion("Call bank :sched", offer, "⏳");
    assert.equal(out.text, "Call bank ⏳ ");
    const dates = dateSource(["⏳"], () => "2026-10-08", "monday");
    const next = completeWith([dates, source], out.text, out.caret);
    assert.equal(next.items[0].insert, "2026-10-08");
  });
});

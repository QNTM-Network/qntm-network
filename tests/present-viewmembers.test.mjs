/**
 * present-viewmembers — `computeViewMembers` against the OPERATOR'S REAL COMPILED CONFIG.
 *
 * `presentation.json` is loaded here the same way `present-membership.test.mjs` loads it, through
 * the same readers the app uses. No hand-built language: the 83 views, 225 sections and 192
 * predicates these tests run over are his, so a test passing here is a statement about the config
 * that actually ships, not about a fixture shaped to make the function look right.
 *
 * The nodes ARE synthetic, and that is the honest boundary of this file. It proves the join —
 * section to predicate to member, and member to sort key — against the real language. It does not
 * prove agreement with the engine's own rendered view; that differential needs a real graph
 * alongside the markdown the engine produced for it, and it is the next piece of work, not this one.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readQualificationDeclaration,
  readConfigResolutionDeclaration,
  computeViewMembers,
} from "../dist/present.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVED = JSON.parse(readFileSync(resolve(HERE, "..", "presentation.json"), "utf8"));
const LANGUAGE = readQualificationDeclaration(SERVED).qualification;
const RESOLUTION = readConfigResolutionDeclaration(SERVED).resolution;

/** The four keys `OrderingLanguage` asks for, taken straight off the resolution reader — proving
 * the reader's output IS the shape the function wants, with no adapter in between. */
const ORDERING = {
  ordering: RESOLUTION.ordering,
  orderingFields: RESOLUTION.orderingFields,
  defaultOrdering: RESOLUTION.defaultOrdering,
  priorityRank: RESOLUTION.priorityRank,
};

const node = (id, type, fields) => ({ id, type, fields });

test("every declared view computes, and its sections come back in the config's own order", () => {
  const viewIds = Object.keys(LANGUAGE.sectionOrder);
  assert.ok(viewIds.length > 50, `expected the real config's many views, got ${viewIds.length}`);

  for (const viewId of viewIds) {
    const computed = computeViewMembers(viewId, [], LANGUAGE, ORDERING);
    assert.ok(computed !== undefined, `${viewId} did not compute`);

    // Every section is accounted for EXACTLY ONCE — either computed or named as uncomputed. A
    // section that fell out of both would be a silent disappearance, which is the failure this
    // whole module exists to refuse.
    const seen = [
      ...computed.sections.map((s) => s.sectionId),
      ...computed.uncomputed.map((s) => s.sectionId),
    ];
    const declared = LANGUAGE.sectionOrder[viewId].filter(
      (id) => LANGUAGE.sections[viewId]?.[id] !== undefined,
    );
    assert.deepEqual(seen.slice().sort(), declared.slice().sort(), `${viewId} lost a section`);

    // Order is the config's, not insertion order of whatever qualified.
    const computedOrder = computed.sections.map((s) => s.sectionId);
    const expectedOrder = declared.filter((id) => computedOrder.includes(id));
    assert.deepEqual(computedOrder, expectedOrder, `${viewId} reordered its sections`);
  }
});

test("an undeclared view is undefined — not an empty view", () => {
  assert.equal(computeViewMembers("no-such-view", [], LANGUAGE, ORDERING), undefined);
});

test("membership selects on the node's own fields, through the real predicate", () => {
  // `all-arts-nodes`: {find: {nodeType: ["task"], fields: {domain: {eq: "arts"}}}}
  const arts = node("n1", "task", { domain: "arts", title: "read the essay" });
  const work = node("n2", "task", { domain: "work", title: "ship the thing" });
  const notATask = node("n3", "header", { domain: "arts", title: "Arts" });

  const computed = computeViewMembers("all-arts", [arts, work, notATask], LANGUAGE, ORDERING);
  const section = computed.sections.find((s) => s.sectionId === "tasks");
  assert.ok(section, "all-arts/tasks did not compute");
  assert.deepEqual(
    section.members.map((n) => n.id),
    ["n1"],
    "expected only the arts task",
  );
  assert.equal(section.undecided.length, 0);
});

test("the default ordering sorts a node that HAS the field before one that does not", () => {
  // The engine's tier rule (`section_builder.py:400-423`): present before absent, regardless of
  // direction. `defaultOrdering` is due_date asc, priority desc, title asc.
  const withDate = node("has", "task", { domain: "arts", title: "b", due_date: "2026-09-01" });
  const withoutDate = node("none", "task", { domain: "arts", title: "a" });

  const computed = computeViewMembers("all-arts", [withoutDate, withDate], LANGUAGE, ORDERING);
  const section = computed.sections.find((s) => s.sectionId === "tasks");
  assert.equal(section.ordered, true);
  assert.deepEqual(
    section.members.map((n) => n.id),
    ["has", "none"],
    "a row with a due_date must sort before one without, even though 'a' < 'b' on title",
  );
});

test("title breaks the tie when neither node carries an ordering field", () => {
  const b = node("b", "task", { domain: "arts", title: "beta" });
  const a = node("a", "task", { domain: "arts", title: "alpha" });
  const computed = computeViewMembers("all-arts", [b, a], LANGUAGE, ORDERING);
  const section = computed.sections.find((s) => s.sectionId === "tasks");
  assert.deepEqual(section.members.map((n) => n.id), ["a", "b"]);
});

test("a DECLARED ordering is used instead of the default, and it is the config's own key", () => {
  // flowtrace-queue/queue declares `queue_position asc` — the only ordering that section has.
  const declared = ORDERING.ordering["flowtrace-queue"]?.["queue"];
  assert.ok(declared, "the real config no longer declares flowtrace-queue/queue ordering");
  assert.deepEqual(declared.ordering, [{ field: "queue_position", direction: "asc" }]);

  const qualification = LANGUAGE.sections["flowtrace-queue"]["queue"].qualification;
  const predicate = LANGUAGE.predicates[qualification];
  assert.ok(predicate, "flowtrace-queue/queue names a predicate the config does not publish");
});

test("a graph-dependent section is named needs-graph, never computed as empty", () => {
  // Find a real section whose predicate traverses an edge; skip if this config has none.
  let viewId;
  let sectionId;
  outer: for (const [view, sections] of Object.entries(LANGUAGE.sections)) {
    for (const [id, section] of Object.entries(sections)) {
      const qualifier = LANGUAGE.predicates[section.qualification];
      if (qualifier?.edgeSteps?.length) {
        viewId = view;
        sectionId = id;
        break outer;
      }
    }
  }
  if (viewId === undefined) return; // nothing to prove in this config

  const computed = computeViewMembers(viewId, [node("x", "task", { title: "t" })], LANGUAGE, ORDERING);
  const named = computed.uncomputed.find((s) => s.sectionId === sectionId);
  assert.ok(named, `${viewId}/${sectionId} needs a graph and was not named as uncomputed`);
  assert.equal(named.because, "needs-graph");
  assert.ok(
    !computed.sections.some((s) => s.sectionId === sectionId),
    "a section that could not be computed must not also appear as a computed, empty one",
  );
});

test("the function reads config and never invents a rule: no view computes members from an unpublished predicate", () => {
  // Every section this module computes named a predicate the config published. This is the 225-of-225
  // join, asserted rather than trusted.
  let computedSections = 0;
  for (const viewId of Object.keys(LANGUAGE.sectionOrder)) {
    const computed = computeViewMembers(viewId, [], LANGUAGE, ORDERING);
    for (const section of computed.sections) {
      assert.ok(
        LANGUAGE.predicates[section.qualification] !== undefined,
        `${viewId}/${section.sectionId} computed against an unpublished predicate`,
      );
      computedSections += 1;
    }
    for (const section of computed.uncomputed) {
      assert.ok(section.because, `${viewId}/${section.sectionId} is uncomputed with no reason`);
    }
  }
  assert.ok(computedSections > 100, `expected most of the real config's sections, got ${computedSections}`);
});

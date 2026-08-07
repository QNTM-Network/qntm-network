/**
 * ARM'S OWN REFUSAL, DROPPED SILENTLY — proof that this is a LIVE, GENERAL defect, not a promotion-
 * only one, and the RED test for `ResolverSpec.arm`'s type-level fix.
 *
 * ── WHERE THIS COMES FROM ──
 *
 * `promotion.ts`'s `arm()` used to call `renderRuleEffects` a SECOND time, independently of `read()`,
 * and discard a genuine refusal with `return []` (fixed 2026-08-07, #149 — see that resolver's own
 * header). The survey that asked for this leg's work names the class of defect and asks: does any
 * OTHER resolver's `arm()` do the identical thing, undiscovered?
 *
 * `ordering.ts`'s `arm()` (app/present/resolvers/ordering.ts) does. Its own header says so out loud
 * ("`arm` takes the context and asks its own [question]"): `read()` calls `resolveOrderingFor`;
 * `arm()` calls a DIFFERENT function, `resolveOrderingPlacementFor`, and when THAT call abstains
 * (`reading.kind !== "answer"`), `arm` returns `return [];` — silently. For a `set-line` commit the
 * two functions are proven (that module's own header) never to disagree about ABSTAINING, so the gap
 * is narrow there. For an `insert-line` commit `read()` never runs the comparison at all
 * (`NOT_EVALUATED` — ordering's `read` only handles `"set-line"`), so `arm()`'s own independent
 * placement computation is the ONLY thing that ever asks the question, and its refusal has never
 * reached `outcome.diagnostics` — not the console register, not anywhere. `"unclassifiable-siblings"`
 * (2026-08-07, `af24e1a` / #143) is a real, reachable `OrderingAbstention` with NO existing test
 * anywhere in this repo that reaches it — grepped, not assumed:
 *
 *   rg -n "unclassifiable-siblings" tests/    # zero hits before this file
 *
 * ── THE GESTURE ──
 *
 * `o`, type a title, `Enter` — the operator opening a new row in a section that has no declared
 * ordering (the common case; most of his sections are undeclared) and whose siblings are not yet
 * stamped (a freshly-populated section, or a fresh account). This is not a contrived shape: it is
 * the ordinary "type three tasks in a row" gesture, with the graph loaded (so the narrowed,
 * classifier-driven placement path is the one that runs, not the older unconditional one).
 *
 * ── THE FALSIFIER ──
 *
 * Drive the gesture above through the real, lifted page (`tests/fixtures/app-html-page.mjs`, the
 * same harness `tests/app-abstention-diagnostic.test.mjs` uses) with `console.debug` captured.
 * BEFORE this leg's Step 3 fix: nothing is logged — `arm()`'s own abstention reaches nobody. AFTER:
 * the console register carries it, the same channel every other refusal in this bundle already uses.
 *
 * PROOF LEVEL: APPLICATION (the real `commitLine`, the real keydown wiring, the real resolver
 * registry) for §2; MODULE (the ordering functions directly) for §1, establishing the mechanism
 * §2's gesture depends on.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

import { importPage, installBrowser, makeEvent, makeWorkDir, walk } from "./fixtures/app-html-page.mjs";
import { resolveOrderingPlacementFor, qualifyingClassifierFor } from "../dist/present.js";

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE MECHANISM, DIRECTLY — the placement functions arm() calls really do abstain here
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. resolveOrderingPlacementFor really abstains 'unclassifiable-siblings' for an all-unstamped insert", () => {
  const QUALIFICATION = {
    defaultNodeType: "task",
    structuralNodeTypes: [],
    tokens: { node_type: {}, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
    predicates: { "any-task": { find: { nodeType: null, fields: {} }, exclude: [] } },
    sections: { demo: { inbox: { qualification: "any-task", nodeType: "task", name: "Inbox" } } },
    sectionOrder: { demo: ["inbox"] },
    refused: {},
  };
  const GRAPH = { nodes: [], edges: [] }; // loaded, but no node this section's siblings can be found in
  const SOURCE = ["## Inbox", "- [ ] Alpha task", "- [ ] Beta task"].join("\n");
  const markdown = SOURCE + "\n- [ ] Gamma task";
  const lines = markdown.split("\n");

  test("every sibling classifies as unknown (no stamp), so the placement pass cannot rank anything and abstains", () => {
    const classify = qualifyingClassifierFor(lines, "demo", "inbox", QUALIFICATION, GRAPH, () => undefined);
    assert.notEqual(classify, undefined, "a classifier should have been built — qualification is published");
    assert.equal(classify(1), undefined, "Alpha task carries no [[qntm:N]] stamp — unclassifiable");
    assert.equal(classify(2), undefined, "Beta task carries no [[qntm:N]] stamp — unclassifiable");

    const placement = resolveOrderingPlacementFor(
      "demo",
      "inbox",
      markdown,
      3,
      "- [ ] Gamma task",
      {}, // ordering — undeclared, the default/title path
      { due_date: { token: "📅", kind: "date" }, priority: { kind: "enum", values: { "🔽": "low", "⏫": "high" } } },
      [
        { field: "due_date", direction: "asc" },
        { field: "priority", direction: "desc" },
        { field: "title", direction: "asc" },
      ],
      { urgent: 4, high: 3, normal: 2, medium: 2, low: 1 },
      classify,
    );
    assert.deepEqual(placement, { kind: "abstains", because: "unclassifiable-siblings" });
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE GESTURE — `o`, type, `Enter`, through the real page. TODAY nothing is logged; that is the
//    defect. `console.debug` capture follows tests/app-abstention-diagnostic.test.mjs's own
//    save/restore convention exactly.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const DAY_BOUNDARY = { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" };

const DECLARATION = {
  qualification: {
    defaultNodeType: "task",
    structuralNodeTypes: [],
    tokens: { node_type: {}, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
    predicates: { "any-task": { find: { nodeType: null, fields: {} }, exclude: [] } },
    sections: { demo: { inbox: { qualification: "any-task", nodeType: "task", name: "Inbox" } } },
    sectionOrder: { demo: ["inbox"] },
    refused: {},
    dropped: {},
  },
  resolution: {
    registration: {},
    lineGrammars: {},
    ordering: {}, // undeclared for "inbox" — the default/title path, the common shape
    orderingFields: {
      due_date: { token: "📅", kind: "date" },
      priority: { kind: "enum", values: { "🔽": "low", "⏫": "high" } },
    },
    dayBoundary: DAY_BOUNDARY,
    chromeShapes: {},
    sectionRegistration: {},
    defaultOrdering: [
      { field: "due_date", direction: "asc" },
      { field: "priority", direction: "desc" },
      { field: "title", direction: "asc" },
    ],
    priorityRank: { urgent: 4, high: 3, normal: 2, medium: 2, low: 1 },
    dropped: {},
  },
  structural: { indent: undefined, edgeCardinality: {}, sections: {}, dropped: {} },
  rules: { order: { established: false }, rules: {}, patterns: {}, fieldMarkers: {}, dropped: {} },
};

const VIEW = { id: "demo", path: "demo.md", title: "Demo", domain: "demo" };
const SOURCE = ["## Inbox", "- [ ] Alpha task", "- [ ] Beta task"].join("\n");
const GRAPH = { nodes: [], edges: [] };

/** `console.debug` capture, saved and restored — tests/app-abstention-diagnostic.test.mjs's own convention. */
async function withDebugCapture(run) {
  const saved = console.debug;
  const said = [];
  console.debug = (...args) => said.push(args.join(" "));
  try {
    await run(said);
  } finally {
    console.debug = saved;
  }
}

/** A POST stub answering the real Worker's synchronous shape. */
function postStub() {
  return async (url, init) => {
    if (init?.method === undefined || init.method === "GET") {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return {
      ok: true,
      json: async () => ({ ok: true, handle: "luke", pending_edits: 0, snapshot: { generated_at: "2026-08-07T00:00:00Z", views: [] } }),
    };
  };
}

describe("2. THE OPERATOR'S GESTURE — o, type a title, Enter — through the real page", () => {
  let page, elements, doc;

  before(async () => {
    const work = makeWorkDir("resolver-arm-refusal-gesture");
    ({ elements, document: doc } = installBrowser());
    globalThis.fetch = postStub();
    page = await importPage(work);
    page.__applyPresentation(DECLARATION);
    page.__setGraphData({ snapshot: { generated_at: "2026-08-07T00:00:00Z", views: [{ ...VIEW, markdown: SOURCE }], graph: GRAPH } });
    page.paintView(VIEW.id);
  });

  const press = (key) => doc.dispatch("keydown", makeEvent({ key }));
  const inputs = () => walk(elements.get("viewBody")).filter((el) => el.tagName === "input" && el.type === "text");

  test("THIS SUITE MUST FAIL AGAINST unmodified main: ordering's own placement refusal for this insert reaches console.debug", async () => {
    await withDebugCapture(async (said) => {
      press("g");
      press("g");
      press("j"); // "## Inbox" -> "- [ ] Alpha task"
      press("j"); // "- [ ] Beta task"
      press("o"); // open a new row after "Beta task"
      const row = inputs()[0];
      assert.ok(row, "`o` did not open a row through the page's own wiring");
      row.value = "- [ ] Gamma task";
      row.dispatch("input");
      row.dispatch("keydown", makeEvent({ key: "Enter" }));
      // `commitLine` is async — let its microtasks (including `reportAbstentions`) run.
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));

      assert.ok(
        said.some((line) => line.startsWith("qntm: ordering: abstained")),
        `expected the console register to carry ordering's own arm() refusal (arm() independently ` +
          `calls resolveOrderingPlacementFor, which abstains "unclassifiable-siblings" for this exact ` +
          `insert — proven directly in section 1 above); saw: ${JSON.stringify(said)}`,
      );
    });
  });
});

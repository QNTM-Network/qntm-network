/**
 * THE DIAGNOSTIC REGISTER, THROUGH THE REAL PAGE — 2026-08-07, design-the-rule-mirror.md §9.2 /
 * roadmap-the-road-ahead.md step 2 ("make an abstention visible") / backlog.yaml
 * `an-abstention-is-visible-to-the-operator`.
 *
 * `tests/flow_scenarios/abstention_diagnostic.ts` proves the MECHANISM — `abstentionsOf` reads the
 * real `Diagnostic` a resolver's own `show()` produced, never a re-derivation — over `app/present/`
 * directly, which flow-trace's node observer can see. It cannot see `app/index.html`: node cannot
 * import an HTML document (`resolve.ts`'s own header states the same limit for every resolver this
 * file ports). This is the other half — the actual SURFACE, `commitLine`'s `reportAbstentions`,
 * proved the same way every other page-level mechanism in this app is (`tests/app-parent-promotion-
 * on-indent.test.mjs`, `tests/app-resolver-registry.test.mjs`): driving the real, lifted page
 * script through `tests/fixtures/app-html-page.mjs`.
 *
 * ── WHY `console.debug`, RESTATED FOR THE READER OF THIS FILE ──
 *
 * `#membershipBadge` (2026-08-03) put the identical fact on screen and was retired two days later
 * (`15cb626`, `chore(app): retire the status line`) because an on-screen register, in the
 * operator's own words, "excuses things not working 'as long as they are reported'". This
 * mechanism does not put anything on screen. It answers the same question — is a resolver's
 * silence a refusal or a confident "nothing changed" — in a channel nobody sees unless they are
 * already looking (DevTools, an agent driving this page, or this file), which is why it can exist
 * at all without reintroducing what that commit killed.
 *
 * ── THE FALSIFIER, TWICE ──
 *
 * §9.2's own falsifier: drive one line in a section whose qualification is refused, and one line
 * in a section that publishes cleanly and does not move; assert the two produce different output.
 * Section 1 below is that falsifier, on the membership axis. Section 2 is the SAME assertion a
 * second time, through half one's own outcome-flip gesture (`resolvers/promotion.ts`) — a genuinely
 * different resolver, a genuinely different abstention reason (`structural-relationship-removed`
 * rather than `no-section-declaration`), the same property.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { importPage, installBrowser, makeEvent, makeWorkDir } from "./fixtures/app-html-page.mjs";

process.setMaxListeners(30);

/** Answers a POST like the real Worker's synchronous shape, echoing the posted markdown back. */
function postStub() {
  const posted = [];
  const fetchImpl = async (url, init) => {
    if (init?.method !== "GET") {
      const body = JSON.parse(init.body);
      posted.push({ url, body });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          handle: "luke",
          pending_edits: 0,
          snapshot: { generated_at: "2026-08-07T00:00:00Z", views: [] },
        }),
      };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  };
  fetchImpl.posted = posted;
  return fetchImpl;
}

/** Stub `console.debug`, collecting every call, restored on completion regardless of outcome —
 * the same save/restore convention `tests/present-global.test.mjs` already uses for `console.warn`. */
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

async function freshPage(label, declaration, markdown, graph, view) {
  const work = makeWorkDir(label);
  const { elements, document: doc } = installBrowser();
  const fetchImpl = postStub();
  globalThis.fetch = fetchImpl;
  const page = await importPage(work);
  page.__applyPresentation(declaration);
  page.__setGraphData({ snapshot: { generated_at: "2026-08-07T00:00:00Z", views: [{ ...view, markdown }], graph } });
  page.paintView(view.id);
  const press = (key) => doc.dispatch("keydown", makeEvent({ key }));
  press("g");
  press("g");
  return { page, elements, doc, press, posted: fetchImpl.posted };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE ROADMAP'S OWN FALSIFIER — one line in a refused section, one in a clean section
// ══════════════════════════════════════════════════════════════════════════════════════════════

const MEMBERSHIP_VIEW = { id: "demo", path: "demo.md", title: "Demo", domain: "demo" };

// "clean" IS PUBLISHED. "refused" IS NAMED IN `sectionOrder` BUT NEVER DECLARED IN `sections` — the
// exact shape of "a section whose qualification is refused", `design-the-rule-mirror.md` §9.2's own
// words. `sectionAt` still finds an ordinal for it; `membershipFor` still cannot answer for it.
const MEMBERSHIP_DECLARATION = {
  qualification: {
    defaultNodeType: "task",
    structuralNodeTypes: [],
    tokens: { node_type: { "#task": "task" }, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
    predicates: { "open-tasks": { find: { nodeType: ["task"], fields: {} }, exclude: [] } },
    sections: { demo: { clean: { qualification: "open-tasks", nodeType: "task", name: "Clean" } } },
    sectionOrder: { demo: ["clean", "refused"] },
    refused: {},
    dropped: {},
  },
  resolution: {
    registration: {},
    lineGrammars: {},
    ordering: {},
    orderingFields: {},
    dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
    chromeShapes: {},
    sectionRegistration: {},
    defaultOrdering: [{ field: "title", direction: "asc" }],
    priorityRank: {},
    dropped: {},
  },
  structural: { indent: undefined, edgeCardinality: {}, sections: {}, dropped: {} },
  rules: { order: { established: false }, rules: {}, patterns: {}, fieldMarkers: {}, dropped: {} },
};

const MEMBERSHIP_SOURCE = ["## Clean", "- [ ] Ring the dentist #task", "## Refused", "- [ ] Whatever #task"].join("\n");

describe("1. THE FALSIFIER — a refused section and a clean, unchanged one produce different console output", () => {
  test("a clean section that does not move logs nothing to console.debug", async () => {
    await withDebugCapture(async (said) => {
      const { page, press } = await freshPage(
        "abstention-diagnostic-clean",
        MEMBERSHIP_DECLARATION,
        MEMBERSHIP_SOURCE,
        { nodes: [], edges: [] },
        MEMBERSHIP_VIEW,
      );
      press("j"); // line 1: "- [ ] Ring the dentist #task"
      // A no-op edit: re-enter INSERT and blur without changing a character. `x` (a real
      // gesture that changes nothing about SECTION membership either) is simpler and avoids the
      // draft-line machinery entirely — the checkbox flips, membership answers confidently,
      // `say()` stays silent because it belongs before and belongs after.
      press("x");
      await new Promise((r) => setImmediate(r));
      assert.deepEqual(said, [], "a clean, decided commit must never reach console.debug");
    });
  });

  test("the refused section logs the resolver's own abstention text, verbatim", async () => {
    await withDebugCapture(async (said) => {
      const { page, press } = await freshPage(
        "abstention-diagnostic-refused",
        MEMBERSHIP_DECLARATION,
        MEMBERSHIP_SOURCE,
        { nodes: [], edges: [] },
        MEMBERSHIP_VIEW,
      );
      press("j");
      press("j");
      press("j"); // line 3: "- [ ] Whatever #task", under the undeclared "Refused" section
      press("x");
      await new Promise((r) => setImmediate(r));
      assert.ok(
        said.some((line) => line === "qntm: membership: abstained — no-section-declaration"),
        `expected a console.debug entry for the refused section, got: ${JSON.stringify(said)}`,
      );
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE SAME ASSERTION, A SECOND TIME — half one's own outcome-flip gesture (promotion.ts)
// ══════════════════════════════════════════════════════════════════════════════════════════════

const PROMOTION_VIEW = { id: "demo", path: "demo.md", title: "Demo", domain: "demo" };

const PROMOTION_DECLARATION = {
  qualification: {
    defaultNodeType: "task",
    structuralNodeTypes: [],
    tokens: { node_type: { "#task": "task" }, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
    predicates: { "open-tasks": { find: { nodeType: ["task"], fields: {} }, exclude: [] } },
    sections: { demo: { capture: { qualification: "open-tasks", nodeType: "task", name: "Capture" } } },
    sectionOrder: { demo: ["capture"] },
    refused: {},
    dropped: {},
  },
  resolution: {
    registration: {},
    lineGrammars: {},
    ordering: {},
    orderingFields: {},
    dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
    chromeShapes: {},
    sectionRegistration: {},
    defaultOrdering: [{ field: "title", direction: "asc" }],
    priorityRank: {},
    dropped: {},
  },
  structural: {
    indent: { edgeType: "PART_OF", edgeSource: "self" },
    edgeCardinality: { PART_OF: "many_to_one" },
    sections: {},
    dropped: {},
  },
  rules: {
    order: { established: true, sequence: ["a-task-with-an-open-child-becomes-an-outcome"] },
    rules: {
      "a-task-with-an-open-child-becomes-an-outcome": {
        pattern: "tasks-with-an-open-child",
        when: { op: "true" },
        priority: 0,
        actions: [{ verb: "retype", to: "outcome" }],
      },
    },
    patterns: {
      "tasks-with-an-open-child": {
        find: { nodeType: ["task"], fields: { status: { eq: "open" } } },
        exclude: [],
        edgeSteps: [
          {
            direction: "children",
            mustExist: true,
            edgeType: ["PART_OF"],
            nodeType: ["task", "outcome"],
            fields: { status: { not: { eq: "done" } } },
          },
        ],
      },
    },
    fieldMarkers: {},
    dropped: {},
  },
};

const PROMOTION_GRAPH = { nodes: [{ id: "qntm:501", type: "task", fields: { status: "open" } }], edges: [] };
const PROMOTION_FLAT = ["## Capture", "- [ ] Ship the launch note [[qntm:501]] #task", "- [ ] Draft the copy #task"].join("\n");
const PROMOTION_INDENTED = ["## Capture", "- [ ] Ship the launch note [[qntm:501]] #task", "    - [ ] Draft the copy #task"].join("\n");

describe("2. THE SAME FALSIFIER, THROUGH THE OUTCOME-FLIP GESTURE — a genuinely different resolver, a genuinely different reason", () => {
  test("`>` (the relationship gained, half one's own headline fix) decides — nothing reaches console.debug", async () => {
    await withDebugCapture(async (said) => {
      const { press } = await freshPage(
        "abstention-diagnostic-promotion-decided",
        PROMOTION_DECLARATION,
        PROMOTION_FLAT,
        PROMOTION_GRAPH,
        PROMOTION_VIEW,
      );
      press("j");
      press("j");
      press(">");
      await new Promise((r) => setImmediate(r));
      assert.deepEqual(said, [], "a decided promotion (parent: decided) must never reach console.debug");
    });
  });

  test("`<` (the relationship removed) abstains 'structural-relationship-removed' — logged, verbatim", async () => {
    await withDebugCapture(async (said) => {
      const { press } = await freshPage(
        "abstention-diagnostic-promotion-abstain",
        PROMOTION_DECLARATION,
        PROMOTION_INDENTED,
        PROMOTION_GRAPH,
        PROMOTION_VIEW,
      );
      press("j");
      press("j"); // the indented child
      press("<");
      await new Promise((r) => setImmediate(r));
      assert.ok(
        said.some((line) => line === "qntm: parent: abstained — structural-relationship-removed"),
        `expected a console.debug entry for the removed relationship, got: ${JSON.stringify(said)}`,
      );
    });
  });
});

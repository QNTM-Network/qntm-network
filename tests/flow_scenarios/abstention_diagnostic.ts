/**
 * abstention_diagnostic — "I do not know" now looks different from "yes, this belongs", and it
 * looks different because the DIAGNOSTIC REGISTER reads the SAME `Diagnostic` the resolver walk
 * really produced, not a value invented to look like it.
 *
 * Run by flow-trace's node observer (`flow-trace verify .`). Not picked up by `npm test`, which
 * globs `tests/**\/*.test.mjs`; `tests/app-abstention-diagnostic.test.mjs` additionally proves the
 * page-level surface (`console.debug`) this scenario cannot see — see that file's own header and
 * `abstentionsOf`'s own header (resolve.ts) for why the split.
 *
 * ── THE FALSIFIABLE CLAIMS ──
 *
 * 1. `abstentionsOf(outcome.diagnostics)` is EMPTY for a commit every resolver either had nothing
 *    to evaluate or evaluated confidently — even though `outcome.diagnostics` ITSELF is not empty
 *    (it carries a real "membership: decided"). A test that only checked "abstentionsOf returns
 *    []" could be satisfied by a stub that always returns `[]`; driving the REAL registry walk and
 *    asserting the unfiltered field is non-empty while the filtered one is empty is what proves the
 *    filter is doing real work rather than being vacuously true.
 *
 * 2. `abstentionsOf(outcome.diagnostics)` is NOT empty for a commit whose section was never
 *    published (`design-the-rule-mirror.md` §9.2's own falsifier: "one line in a section whose
 *    qualification is refused"), and the surviving entry's `.text` is BYTE-IDENTICAL to calling
 *    that resolver's OWN `show(read(ctx))` directly — the diagnostic register reads the `because`
 *    the resolver actually produced, never a re-derivation (roadmap-the-road-ahead.md step 2, "the
 *    `because` value is already computed").
 *
 * 3. THE SAME PAIR OF CLAIMS, A SECOND TIME, THROUGH A DIFFERENT RESOLVER AND A DIFFERENT
 *    ABSTENTION REASON — the outcome-flip gesture half one of this leg fixed
 *    (`app/present/resolvers/promotion.ts`). A parent task, already stamped, whose graph is not
 *    loaded (`graph-not-loaded`) abstains; the SAME shape with the graph present answers `parent:
 *    decided`. Two resolvers, two abstention reasons, one property: `abstentionsOf` tells the two
 *    states apart every time, and only ever from the real reading.
 *
 * ── WHY THIS IS THE SCENARIO AND NOT JUST A `.test.mjs` FILE ──
 *
 * A value-level assertion ("the array has length 1") is blind to HOW that answer was reached — a
 * hand-rolled fake could satisfy it. Driving `RESOLVERS`/`runResolvers` for real, the way
 * `app/index.html`'s `commitLine` does, and cross-checking the survivor's text against the SAME
 * resolver's own `show()` call is what makes this a claim about SHAPE (the register consumes the
 * resolver's real output) rather than a claim about one return value.
 */

import { runResolvers, abstentionsOf } from "../../app/present/resolve.js";
import type { CommitContext, DeclarationSet } from "../../app/present/resolve.js";
import { RESOLVERS } from "../../app/present/resolvers/registry.js";
import { membershipSpec } from "../../app/present/resolvers/membership.js";
import { promotionSpec } from "../../app/present/resolvers/promotion.js";
import type { QualificationLanguage } from "../../app/present/select/qualification.js";
import type { RulesLanguage } from "../../app/present/rules.js";
import type { StructuralLanguage } from "../../app/present/arrange/structural.js";
import type { ConfigResolutionTable } from "../../app/present/resolutiontable.js";

// `promotionSpec.read`'s FIRST gate refuses unless `structural`/`qualification`/`resolution`/
// `rules` are ALL present — `resolution` itself is never read past that gate for the two claims
// below, but its ABSENCE is indistinguishable from "the declaration has not loaded yet", which is
// `not-evaluated`, not an abstention. A minimal but complete table, so that gate opens.
const RESOLUTION: ConfigResolutionTable = {
  registration: undefined,
  lineGrammars: {},
  ordering: {},
  orderingFields: {},
  dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
  chromeShapes: {},
  sectionRegistration: {},
  defaultOrdering: [],
  defaultOrderingSource: undefined,
  priorityRank: {},
  composition: undefined,
  compositionSource: undefined,
  dropped: {},
};

const VIEW = { id: "demo" };

// ── CLAIM 1 & 2's OWN DECLARATION — ONE VIEW, TWO SECTIONS. "clean" IS PUBLISHED; "refused" NAMES
// AN ORDINAL `sectionAt` CAN ADDRESS BUT WHICH `qualification.sections` NEVER DECLARES — the exact
// shape `design-the-rule-mirror.md` §9.2's own falsifier names.
const QUALIFICATION: QualificationLanguage = {
  defaultNodeType: "task",
  structuralNodeTypes: [],
  resolvableFields: [],
  extractionFields: {},
  tokens: { node_type: { "#task": "task" }, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
  predicates: { "open-tasks": { find: { nodeType: ["task"], fields: {} }, exclude: [] } },
  sections: { demo: { clean: { qualification: "open-tasks", nodeType: "task", name: "Clean", defaults: undefined } } },
  sectionOrder: { demo: ["clean", "refused"] },
  refused: {},
  dropped: {},
  traversalDepth: 1,
};

const DECLARED: DeclarationSet = {
  structural: undefined,
  qualification: QUALIFICATION,
  resolution: undefined,
  rules: undefined,
};

const CLEAN_MARKDOWN = ["## Clean", "- [ ] Ring the dentist #task", "## Refused", "- [ ] Whatever #task"].join("\n");

function baseCtx(overrides: Partial<CommitContext>): CommitContext {
  return {
    view: VIEW,
    commit: { lineIndex: 1, text: "- [ ] Ring the dentist #task", markdown: CLEAN_MARKDOWN, source: CLEAN_MARKDOWN, kind: "set-line" },
    declared: DECLARED,
    graph: null,
    now: () => Date.UTC(2026, 7, 7, 12, 0, 0),
    ...overrides,
  };
}

function driveMembershipClaims(): void {
  // A CONFIDENT, UNCHANGING ANSWER — the line is re-committed with the identical text, so
  // membership answers `before.belongs === after.belongs === true` and `say()` stays silent.
  const clean = baseCtx({});
  const cleanOutcome = runResolvers(RESOLVERS, clean);
  const cleanDiagnostic = cleanOutcome.diagnostics.find((d) => d.badge === "membershipBadge");
  if (cleanDiagnostic === undefined || cleanDiagnostic.text !== "membership: decided") {
    throw new Error(`a clean, unchanged commit should answer "membership: decided": ${JSON.stringify(cleanOutcome.diagnostics)}`);
  }
  if (abstentionsOf(cleanOutcome.diagnostics).length !== 0) {
    throw new Error("CLAIM 1 failed — a confident, decided commit must never appear in abstentionsOf()");
  }

  // THE REFUSED SECTION — `sectionAt` finds ordinal 1 ("Refused"), but `qualification.sections`
  // never named it, so `membershipFor` abstains `no-section-declaration` for BOTH before and after.
  const refused = baseCtx({
    commit: { lineIndex: 3, text: "- [ ] Whatever, edited #task", markdown: CLEAN_MARKDOWN, source: CLEAN_MARKDOWN, kind: "set-line" },
  });
  const refusedOutcome = runResolvers(RESOLVERS, refused);
  const survivors = abstentionsOf(refusedOutcome.diagnostics);
  const membershipAbstention = survivors.find((d) => d.badge === "membershipBadge");
  if (membershipAbstention === undefined) {
    throw new Error(`CLAIM 2 failed — a refused section must survive abstentionsOf(): ${JSON.stringify(refusedOutcome.diagnostics)}`);
  }
  // CROSS-CHECK AGAINST THE RESOLVER'S OWN `show()`, CALLED DIRECTLY — proves the register reads
  // the real `because`, never a re-derivation.
  const directReading = membershipSpec.read(refused);
  const directText = membershipSpec.show(directReading);
  if (membershipAbstention.text !== directText) {
    throw new Error(`the diagnostic register's text ("${membershipAbstention.text}") does not match the resolver's own show() ("${directText}") — it is re-deriving rather than reading`);
  }
  if (membershipAbstention.text !== "membership: abstained — no-section-declaration") {
    throw new Error(`unexpected abstention reason: ${membershipAbstention.text}`);
  }
}

// ── CLAIM 3's OWN DECLARATION — half one's outcome-flip rule, minimally reproduced.
const PROMOTION_QUALIFICATION: QualificationLanguage = {
  defaultNodeType: "task",
  structuralNodeTypes: [],
  resolvableFields: [],
  extractionFields: {},
  // `#outcome` MUST BE DECLARED — the rule table below retypes to `"outcome"`, and claim 3 (below)
  // now reads `show()`'s own sentence, which (2026-08-07) reports `arm`'s own render abstention
  // honestly rather than staying silent about it.
  tokens: { node_type: { "#task": "task", "#outcome": "outcome" }, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
  predicates: { "open-tasks": { find: { nodeType: ["task"], fields: {} }, exclude: [] } },
  sections: { demo: { capture: { qualification: "open-tasks", nodeType: "task", name: "Capture", defaults: undefined } } },
  sectionOrder: { demo: ["capture"] },
  refused: {},
  dropped: {},
  traversalDepth: 1,
};

const STRUCTURAL: StructuralLanguage = {
  indent: { edgeType: "PART_OF", edgeSource: "self" },
  edgeCardinality: { PART_OF: "many_to_one" },
  sections: {},
  dropped: {},
};

const RULES: RulesLanguage = {
  orderEstablished: true,
  order: ["a-task-with-an-open-child-becomes-an-outcome"],
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
};

const PROMOTION_SOURCE = ["## Capture", "- [ ] Ship the launch note [[qntm:501]] #task"].join("\n");
const PROMOTION_AFTER = ["## Capture", "- [ ] Ship the launch note [[qntm:501]] #task", "    - [ ] Draft the copy #task"].join("\n");

function promotionCtx(graph: CommitContext["graph"]): CommitContext {
  return {
    view: VIEW,
    commit: { lineIndex: 2, text: "    - [ ] Draft the copy #task", markdown: PROMOTION_AFTER, source: PROMOTION_SOURCE, kind: "set-line" },
    declared: { structural: STRUCTURAL, qualification: PROMOTION_QUALIFICATION, resolution: RESOLUTION, rules: RULES },
    graph,
    now: () => Date.UTC(2026, 7, 7, 12, 0, 0),
  };
}

function driveOutcomeFlipClaims(): void {
  // THE ABSTENTION — the parent already carries a `[[qntm:N]]` stamp, but this browser has not
  // read the graph yet. `parentCandidateFor` cannot resolve it from the line alone.
  const noGraph = promotionCtx(null);
  const noGraphOutcome = runResolvers(RESOLVERS, noGraph);
  const promotionAbstention = abstentionsOf(noGraphOutcome.diagnostics).find((d) => d.badge === "parentBadge");
  if (promotionAbstention === undefined) {
    throw new Error(`CLAIM 3 failed — an unstamped-graph promotion must abstain and survive abstentionsOf(): ${JSON.stringify(noGraphOutcome.diagnostics)}`);
  }
  const directReading = promotionSpec.read(noGraph);
  const directText = promotionSpec.show(directReading);
  if (promotionAbstention.text !== directText || promotionAbstention.text !== "parent: abstained — graph-not-loaded") {
    throw new Error(`the promotion abstention's text ("${promotionAbstention.text}") does not match show() ("${directText}") or the expected reason`);
  }

  // THE DECIDED ANSWER — the identical gesture, graph present. Must not appear in abstentionsOf().
  const withGraph = promotionCtx({ nodes: [{ id: "qntm:501", type: "task", fields: { status: "open" } }], edges: [] });
  const withGraphOutcome = runResolvers(RESOLVERS, withGraph);
  const decided = withGraphOutcome.diagnostics.find((d) => d.badge === "parentBadge");
  if (decided === undefined || decided.text.startsWith("parent: abstained")) {
    throw new Error(`the decided promotion must answer "parent: decided...", not abstain: ${JSON.stringify(withGraphOutcome.diagnostics)}`);
  }
  if (abstentionsOf(withGraphOutcome.diagnostics).some((d) => d.badge === "parentBadge")) {
    throw new Error("CLAIM 3 failed — a decided promotion must never appear in abstentionsOf()");
  }
}

export function run(): void {
  driveMembershipClaims();
  driveOutcomeFlipClaims();
}

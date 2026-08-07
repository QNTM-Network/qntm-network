/**
 * Capture-rules scenario — the observed runtime for the RESOLVER REGISTRY's `rules` axis.
 *
 * flow-trace's node observer imports this module, installs its load hook first, and records every
 * cross-module call the run makes. It exports `run()`, the same convention every other scenario in
 * this directory uses.
 *
 * ── WHAT THIS CLOSES ──
 *
 * `app/present/resolvers/registry.ts` walks four resolvers (membership, ordering, rules,
 * promotion) on every real commit, through `app/index.html`'s `commitLine` ->
 * `runResolvers(RESOLVERS, ctx)`. Before this file, NONE of the four had a flow-trace scenario —
 * `docs/architecture/flows.yaml` carries no entry for `resolvers/registry.ts`,
 * `resolvers/rules.ts`, `resolvers/membership.ts`, `resolvers/ordering.ts` or
 * `resolvers/promotion.ts`, and no `tests/flow_scenarios/*.ts` file imports any of them (checked
 * with `rg`, not plain `grep` — this repo has a real NUL byte hiding a real import from plain
 * `grep` before, `tests/no-nul-bytes.test.mjs`). The registry is real, live, wired production
 * code — `node --test` proves its VALUE exhaustively (`tests/app-rules-stamp.test.mjs`,
 * `tests/app-resolver-registry.test.mjs`, 700+ lines between them) — but nothing had ever proven
 * its SHAPE: that `runResolvers` reaches `rulesSpec.read` and that `rulesSpec.read` reaches
 * `applyRules`/`renderRuleEffects` and nothing else, through the real modules and not a stand-in.
 *
 * `docs/implementation-artifacts/design-the-rule-mirror.md` §3.3 is the reason the rules axis is
 * the one closed here first: `routine-without-cadence-becomes-task` retypes a bare capture from
 * `routine` to `task` inside the SAME pass that minted it, in 13 of the operator's 186 sections,
 * and `stamp-created-at-on-task` then fires on the now-`task` candidate in the SAME walk. That
 * two-rule, one-pass chain — one rule's write changing whether the next rule's pattern matches —
 * is exactly what this scenario drives and asserts, over the real `RESOLVERS` array and the real
 * `runResolvers`, not a reimplementation of either.
 *
 * ── WHAT IS STUBBED, AND WHY THAT IS HONEST ──
 *
 * The four modules under `app/present/resolvers/` and `app/present/resolve.ts` are REAL — nothing
 * here substitutes for any of them. What is hand-built is the DECLARATION (`QualificationLanguage`,
 * `ConfigResolutionTable`, `RulesLanguage`) — a small, INVENTED fixture carrying exactly the two
 * capture rules design-the-rule-mirror.md §3.3 named, the same "invented, not the operator's real
 * config" posture `tests/fixtures/rules-category/rules/retype_and_stamp.yaml` already takes for the
 * identical two rules. A generated declaration would exercise the same call shape and prove nothing
 * more about it; what the real config's own shape does or does not reach is `tests/app-rules-
 * stamp.test.mjs`'s job (it drives the REAL served `presentation.json`), not this scenario's.
 *
 * ── THREE OF FOUR RESOLVERS ABSTAIN BY DESIGN, AND THAT IS PART OF THE CLAIM ──
 *
 * `membershipSpec` and `orderingSpec` both gate on `commit.kind === "set-line"`; this scenario's
 * commit is `"insert-line"` (a fresh capture, never an edit to an existing line — `resolversules.ts`'s
 * own gate for the identical reason), so both return `NOT_EVALUATED` without reaching past their
 * own first branch. `promotionSpec` reaches `structuralParentLineIndex` and finds no indentation
 * change, so it also abstains. Driving the WHOLE registry rather than calling `rulesSpec` directly
 * is deliberate: it is the only way to observe that walking the other three axes does not somehow
 * reach into the rules module, which is the structural form of "one commit, four independent
 * answers, no cross-talk" `resolve.ts`'s own header states.
 */

import { RESOLVERS } from "../../app/present/resolvers/registry.js";
import { runResolvers } from "../../app/present/resolve.js";
import type { CommitContext } from "../../app/present/resolve.js";
import type { QualificationLanguage } from "../../app/present/select/qualification.js";
import type { ConfigResolutionTable } from "../../app/present/resolutiontable.js";
import type { RulesLanguage } from "../../app/present/rules.js";
import type { LineCommit } from "../../app/present/paint.js";

/**
 * THE TWO CAPTURE RULES, INVENTED BUT STRUCTURALLY FAITHFUL — the same shape
 * `tests/fixtures/rules-category/rules/retype_and_stamp.yaml` carries, normalised to the closed
 * grammar `compile-rules.mjs` publishes (`RuleSpec`'s own shape: pattern/when/priority/actions).
 * `routine-without-cadence-becomes-task` sits BEFORE `stamp-created-at-on-task` in `order` — the
 * published order this scenario exists to prove is respected, not merely stored.
 */
const RULES_LANGUAGE: RulesLanguage = {
  orderEstablished: true,
  order: ["routine-without-cadence-becomes-task", "stamp-created-at-on-task"],
  rules: {
    "routine-without-cadence-becomes-task": {
      pattern: "routines",
      when: { op: "null", field: "cadence" },
      priority: 0,
      actions: [{ verb: "retype", to: "task" }],
    },
    "stamp-created-at-on-task": {
      pattern: "tasks",
      when: { op: "eq", field: "created_at", value: null },
      priority: 0,
      actions: [{ verb: "set", field: "created_at", to: "$cycle_today" }],
    },
  },
  patterns: {
    routines: { find: { nodeType: ["routine"], fields: {} }, exclude: [] },
    tasks: { find: { nodeType: ["task"], fields: {} }, exclude: [] },
  },
  // `created_at`'s own trailing-marker spelling — what lets `renderRuleEffects` append the
  // stamp's characters rather than abstaining `unrenderable-effect`.
  fieldMarkers: { created_at: { token: "🆕", kind: "date" } },
  dropped: {},
};

/** One routine-default section, no `defaults:` map — the exact shape §3.3 measured 13 of. */
const QUALIFICATION: QualificationLanguage = {
  defaultNodeType: "task",
  structuralNodeTypes: [],
  resolvableFields: ["node_type", "status"],
  extractionFields: {},
  tokens: {
    // `#task`, the retype target's own glyph — without it `renderRuleEffects` cannot spell
    // `routine-without-cadence-becomes-task`'s effect and abstains `unrenderable-effect`.
    node_type: { "#task": "task", "#routine": "routine" },
    status: { "[ ]": "open", "[x]": "done" },
  },
  predicates: {},
  sections: {
    "routines-personal": {
      morning: {
        qualification: "routines-personal-morning",
        nodeType: "routine",
        defaults: undefined,
        name: "Morning",
      },
    },
  },
  sectionOrder: { "routines-personal": ["morning"] },
  refused: {},
  dropped: {},
};

const RESOLUTION: ConfigResolutionTable = {
  registration: undefined,
  lineGrammars: {},
  ordering: {},
  orderingFields: {},
  dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
  chromeShapes: {},
  sectionRegistration: {},
  defaultOrdering: [],
  priorityRank: {},
  dropped: {},
};

/** One heading, one bare capture — no cadence, no title token, nothing else declared. */
const SOURCE = ["## Morning", "- [ ] Water the plants"].join("\n");

export function run(): void {
  const commit: LineCommit = {
    kind: "insert-line",
    lineIndex: 1,
    text: "- [ ] Water the plants",
    markdown: SOURCE,
    source: SOURCE,
  };
  const ctx: CommitContext = {
    view: { id: "routines-personal" },
    commit,
    declared: {
      structural: undefined,
      qualification: QUALIFICATION,
      resolution: RESOLUTION,
      rules: RULES_LANGUAGE,
    },
    graph: null,
    now: () => Date.UTC(2026, 7, 7, 12, 0, 0),
  };

  const outcome = runResolvers(RESOLVERS, ctx);

  const rulesRun = outcome.runs.find((r) => r.id === "rules");
  if (rulesRun === undefined) {
    throw new Error("the registry did not run a resolver named 'rules'");
  }
  // BOTH RULES, IN ORDER — the direct assertion that this is one pass over a mutating candidate,
  // not two independent checks against the original fields (§3.3's own point: the retype changes
  // node_type to "task", and it is the NOW-task candidate stamp-created-at-on-task's `tasks`
  // pattern binds).
  if (rulesRun.note !== "this line becomes task, sets created_at") {
    throw new Error(`unexpected rules note: ${JSON.stringify(rulesRun.note)}`);
  }

  // THE OTHER THREE ABSTAIN, NAMELESSLY — `NOT_EVALUATED` produces an empty note and no
  // diagnostic, so the registry's own join must carry exactly one sentence for this commit.
  if (outcome.notes.length !== 1 || outcome.notes[0] !== rulesRun.note) {
    throw new Error(
      `expected exactly one freshness sentence (rules only), got ${JSON.stringify(outcome.notes)}`,
    );
  }

  // THE PREDICTED TEXT CARRIES THE RETYPE'S TAG, NOT THE ORIGINAL SECTION'S — the operator-facing
  // proof that the rule pass, not the section declaration, decided what this line becomes.
  const [prediction] = outcome.predictions;
  if (prediction === undefined || !prediction.text.includes("#task")) {
    throw new Error(`expected a #task prediction, got ${JSON.stringify(outcome.predictions)}`);
  }
}

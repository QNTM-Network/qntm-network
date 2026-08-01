# Design: the resolution architecture — the layers, the order they resolve in, and the sequence that builds them

**Status: design. No application source is modified on this branch. This document is the only file
it adds.**

**Branch:** `design/resolution-map`, based on `origin/main` @ `531d4a6`.

**What this is.** The map every later piece of work is sequenced against. It answers four
questions — what the layers ARE, what ORDER they resolve in, where the engine is NOT cleanly
wrapped, and what RECONCILIATION needs — and then gives a ranked build order in which each step
lands on its own and each step has a test that would prove it wrong.

**Evidence rule.** Every claim is **[OBS]** (a script or command I ran, output I read), **[REA]**
(reasoned from source I read, cited `file:line`), or **[REPO]** (a claim an already-merged document
makes that I did not reproduce). **Absence is never proven by a grep returning nothing** — §2.2,
§5.3 and §6.2 are the three places it mattered, and all three are enumerations. Sizes are the house
scale: **under an hour** / **half a day** / **an arc**.

---

# PAGE ONE — THE WHOLE MAP

## The spine, in one line

```
GLOBAL  →  VIEW  →  STRUCTURAL_NODE  →  SUBTREE  →  LINE
least specific                                most specific
```

**That is the operator's cascade, and it is one order, owned in one tuple.**
`apps/qntm-md/src/qntm_md/resolution/levels.py:86-92` on ingest;
`app/present/levels.ts:41-49` on output. His four levels — global, view, section, node — are the
engine's five with two corrections he should hear:

* **His "SECTION" is the engine's `STRUCTURAL_NODE`.** Same thing, better name in the config, worse
  name in the code.
* **His "NODE" is two levels, not one.** The engine splits `SUBTREE` (a node's resolved values,
  inherited *by its descendants*) from `LINE` (the tokens he actually typed). `SUBTREE` is
  **switched off** in his instance — `node_defaults_cascade: ()` **[REPO]** — so today the cascade
  runs four levels and his model is numerically right by accident.

**One order, two directions.** Ingest resolves what a line BECOMES; output resolves how a node is
SHOWN. The output side adds three levels the input side cannot have (`USER`, `MODE`, `FOCUS`) for
the reason `app/present/levels.ts:4-6` states: a level is more specific when its fact becomes known
later, and the cursor's position is known last. **The seven-level output tuple is a superset of the
five-level input tuple with the same four shared levels in the same relative order.** They are one
cascade seen from two ends, not two cascades.

## The finding that reorganises everything

**Only TWO of the twelve kinds of resolution actually ride that cascade.** **[OBS]** Every
production importer of `qntm_md.resolution`, enumerated:

| site | kind it resolves | levels used |
|---|---|---|
| `io/applier.py:4137-4158` | **DEFAULTS** | LINE, SUBTREE, STRUCTURAL_NODE, VIEW, GLOBAL — all five |
| `diff/content_diff.py:841-861` | **REGISTRATION** | STRUCTURAL_NODE, VIEW, GLOBAL |
| `coordination/orchestrator.py:4563` | `BASE_NODE_TYPE` | GLOBAL only, by signature |
| `coordination/orchestrator.py:1553` | section defaults, one level | STRUCTURAL_NODE only |

**The other ten kinds resolve somewhere else, each in its own idiom, and three of them are real
cascades written by hand.** That is not a criticism of the engine; it is the exact opportunity he
asked me to name. §5 lists them with names and costs.

## The layers — SEVEN, not six

Derived from what exists in `app/present/` and the engine, not adopted from the brief. **The brief's
candidate list was missing one, and the one it was missing is where tonight's blocker lives.**

| # | layer | job, in one sentence | where it lives today | state |
|---|---|---|---|---|
| **L1** | **TRANSPORT** | Deliver two documents: the projection envelope and the declaration. | `server/app.py:188-197`; `app/present/embedded-declaration.ts` (baked into `dist/present.js` at build) | **ships 805 KB of graph nobody reads and 36.6 KB of declaration two-thirds read** |
| **L2** | **DECLARATION** | Validate a served document's shape, report what was wrong, return a lookup table. Never interpret. | `declaration.ts`, `structural.ts`, `qualification.ts` | **3 readers exist, 2 are wired** |
| **L3** | **ADDRESSING** | Name the printed row, and name the `(view, section)` it sits in. | `instance.ts`, `boundary.ts`, `focus.ts` | **view: yes. section: ORDINAL ONLY — the blocker** |
| **L4** | **RESOLUTION** | Given the levels and their contributions, return the winning value AND which level won. | `levels.ts` + `cascade.ts` + `context.ts`; engine `resolution/` | **built, correct, and every level but GLOBAL is silent** |
| **L5** | **EVALUATION** | Run a declared predicate over fields L4 has already resolved. | `membership.ts`, `qualification.ts`; engine patterns / `domain_filter` / rules | **built, proven against the engine, and called by nothing** |
| **L6** | **PROJECTION** | Turn source + resolved renditions into DOM. The only DOM toucher. | `paint.ts` | live |
| **L7** | **RECONCILIATION** | Land a new projection over a live cursor and say whether the two converged. | `base.ts`, `focus.ts:260`, `instance.ts` | **detects; cannot yet prove convergence** |

**L3 ADDRESSING is the layer the brief's list omitted, and adding it is the single most useful thing
in this document.** The cascade cannot select a `STRUCTURAL_NODE` contribution without knowing which
structural node it is resolving at. That is a different job from combining contributions, it is done
by different modules, and **it is the job that is unfinished.** Naming it makes tonight's blocker a
missing piece of a named layer rather than an odd coupling between two files.

**One invariant cuts across all seven: RESOLUTION AND EVALUATION NEVER REACH THE WRITE PATH.**
`tests/flow_scenarios/section_membership.ts:110-165` asserts it by reading `membership.ts`'s own
imports and by counting calls — the membership layer reached the presentation cascade 0 times and
`applyEdit` 0 times. **[OBS]** That invariant is what makes every step in §7 safe to add.

## The resolution order — one rule, then two pipelines

**THE RULE: RESOLVE, THEN EVALUATE.** Every predicate in the system — a placement filter, the domain
filter, an ordering key, a rule condition — reads a node FIELD, and a node field is the OUTPUT of
the cascade. **Measured in his own config: 103 of 186 sections declare a `defaults:` that sets a
field their OWN qualification tests.** **[OBS]** A browser that evaluated before resolving would be
wrong about the majority of his sections — it would say "this line does not belong here" about a
line whose own section is about to stamp it into belonging.

**INGEST — what a line BECOMES** (the order the engine runs, cited per step in §4.2):

```
1 LINE GRAMMAR  →  2 VOCABULARY  →  3 REGISTRATION  →  4 DEFAULTS  →  5 IDENTITY
   →  6 STRUCTURAL EDGE  →  7 RULES  →  8 CASCADES
```

**OUTPUT — what is PRINTED** (four steps in one loop, `coordination/orchestrator.py:3037-3049`):

```
1 PLACEMENT FILTER  →  2 DOMAIN FILTER  →  3 MEMBERSHIP EXPANSION + STRUCTURAL EDGE  →  4 ORDERING
```

**BROWSER — what the app must run to answer "what will this line do"**:

```
L2 read declaration  →  L3 address (view, section)  →  L4 registration  →  L4 defaults
   →  L4 line vocabulary  →  L5 placement  →  L5 domain  →  L5 order  →  L6 say it
```

**L3 is first among the resolution steps, and L3 is the step that does not work.**

## The build order — thirteen steps, each landing on its own

Full detail, dependencies and falsifiers in §7. Sizes: **h** = under an hour, **½** = half a day.

**STATUS, UPDATED 2026-08-01 — steps 1, 2 and 3 are DONE, one agent, one branch (`feat/addressing`),
against `origin/main` @ `45fc0ac`.** `membership.ts` is now callable and correct — see
`app/present/address.ts` (`sectionAt`, step 2's join), the `sectionOrder` key
`scripts/generate-qualification-declaration.mjs` now publishes (step 1), and
`app/present/context.ts`'s `presentationFromDeclaration` now returning a `qualification` field
(step 3). Falsifiers for all three ran and passed — `tests/present-address.test.mjs`,
`tests/present-qualification.test.mjs` (sections 1a/1b), `tests/flow_scenarios/section_addressing.ts`
— and `membership.ts`'s existing 18 tests plus `qualification-agreement.test.mjs`'s 6 pass
unmodified. Capability `section-addressing-reads-the-full-declared-order` (capabilities.yaml) and
the updated `section-membership-is-read-not-guessed` rooting carry the detail.

**STATUS, UPDATED 2026-08-01 (second pass) — STEP 4 IS DONE, one agent, one branch
(`feat/say-membership`), against `origin/main` @ `f83c9c1`.** The operator's own case is now visible:
edit a bare line under "Domain Empty" and it says nothing; add `#work` and the freshness line says
"this line will leave Domain Empty", the instant the write leaves and gone the instant the cycle's
own answer lands. `app/index.html`'s new `membershipNoteFor` (called from `commitLine`) is the
caller `membershipFor`/`sectionAt` had none of; `app/present/paint.ts`'s `LineCommit` gained one
provenance field (`kind`) and nothing else moved — `paint.ts`'s indent arithmetic and the golden
master are both untouched. The falsifier ran and passed, adapted from its own text: the design
document's own wording was "the painted row carries no membership statement" and this step chose
the freshness line over a row-adjacent message (§ rule 1, "say it, never move it" — see the step's
own section below for why), so the adapted falsifier is "the freshness line carries no membership
statement", proven for all five `Abstention` values plus the RETURNING and unchanged-answer cases —
`tests/app-membership-note.test.mjs`, 20 tests across three suites, plus two new
`present-membership.test.mjs` cases for the `sectionName` field the message reads. `npm run check`:
754 tests / 147 suites / 0 fail before this step (this agent's own re-run, matching the recorded
baseline exactly); 776 / 150 / 0 fail after (+22/+3, 0 regressions). Capability
`section-membership-is-said-in-the-freshness-line` (capabilities.yaml) carries the detail; the two
remaining write paths this step does NOT reach (`toggleTask`'s mouse click, vim's `x`) are filed as
`membership-note-on-a-checkbox-toggle` (backlog.yaml), not silently left out.

**STATUS, UPDATED 2026-08-01 (third pass) — STEP 5 IS DONE, one agent, one branch
(`feat/config-table`), against `origin/main` @ `0076a36`.** Two of the eight config-only kinds this
step names — DEFAULTS and the per-view minting REGISTRATION default — were already published and
already consumed before this step even started, on `qualification.sections[view][section].
{defaults,nodeType}`, so this step's own falsifier (arm (b), agreement with the engine's
`ResolutionCascade`) is the first time that ALREADY-SHIPPED value has been checked against the
engine's own resolver rather than only against a second read of the same YAML the generator itself
parsed — `scripts/resolution-agreement.py` calls `qntm_md.resolution.cascade.ResolutionCascade` and
`qntm_md.resolution.registration.resolve_registration_keys`/`resolve_base_node_type` over the
operator's real config bundle (config only, no graph, no state.db, no cycle) and
`tests/resolution-agreement.test.mjs` asserts all 49 published `(view, section)` pairs agree, 0
disagreements. What this step ADDS is a new `resolution` key on `presentation.json`, a fourth strict
reader (`app/present/resolutiontable.ts`, wired into `presentationFromDeclaration` beside the other
three): `registration.baseNodeType` (the REVERT target, GLOBAL only, published under a name separate
from `defaultNodeType` per §5.5's own warning — they share one config key today and must never share
one field), `registration.inputGrammar`/`defaultTags`, `lineGrammars` (2 grammars), `ordering` (9
sections), and `dayBoundary` (3 keys) — generated by a third script,
`scripts/generate-resolution-declaration.mjs`, following the same read-only/`--check`/refuse-loudly
shape the other two generators already use. **`pull_context` (77 sections) was measured and left
out, by judgement, not by omission** — it is "predicate exact, answer runtime" (needs a transitive
graph walk this document's own §4.8 measures to depth 6) and no step 5 through 13 of this document's
own sequence names it as a dependency; publishing it now would be a kind with zero reader in this
arc's own plan, which is the rule this document states in its own words. Size: 994 bytes for the
whole table (well inside the 454-1,930 B / median 685 B per-view neighbourhood §6.1 measured for the
full eight-kind table, which this is a deliberate subset of), pinned by a test asserting it stays
under 3,000 bytes so a future widening is visible rather than silent. The falsifier's arm (a) — three
generators' `--check` all pass, presentation.json is not stale against the monorepo — and arm (b) —
the agreement test above — both ran and passed; a third falsifier (proof standard #3, a config
change in a scratch copy moves the published answer) was added beyond what the design document's own
falsifier required, covering ordering direction, an added `ordering_mode`, and the day boundary.
`npm run check`: 776 tests / 150 suites / 0 fail before this step (this agent's own re-run, matching
the recorded baseline exactly, measured on a clean tree via `git checkout --` rather than `git
stash`, which this worktree is forbidden from using); 804 / 159 / 0 fail after (+28/+9, 0
regressions). Capability `config-resolution-table-is-published` (capabilities.yaml) carries the
detail; the two things this step does NOT do — publish `pull_context`, and wire any of the four new
facts into a consumer (steps 6/7/8's own job) — are filed as `widen-resolution-table-to-pull-context`
and `wire-config-resolution-table-into-steps-6-7-8` (backlog.yaml), not silently left out.

| # | step | layer | size | needs | falsifier, in one line | status |
|---|---|---|---|---|---|---|
| 1 | publish the ORDERED section id list per view | L2 | **h** | — | per view, list length == heading count in the served markdown | **DONE** |
| 2 | `sectionAt(source, lineIndex) → sectionId` | **L3** | **h** | 1 | agrees with the engine's own `section_id` for every line of all 72 views | **DONE** |
| 3 | wire `readQualificationDeclaration` into the app's one reader | L2 | **h** | — | `presentationFromDeclaration(...).qualification.predicates` has 43 entries | **DONE** |
| 4 | **SAY the membership answer** — tonight's work becomes visible | L6 | **½** | 2, 3 | the freshness line shows nothing for all five `Abstention` values | **DONE** |
| 5 | publish the config-only resolution table (registration + defaults + clock) | L2 | **½** | 1 | generator `--check` + per-section agreement with `ResolutionCascade.resolve` | **DONE** |
| 6 | the new-line seed becomes a READ, not a search of the projection | L4 | **h** | 5 | `seedFor` returns non-null on a view with no printed node line | — |
| 7 | ordering preview | L5 | **h** | 5, 8 | browser sort == served row order, for `this-week`'s four sections | — |
| 8 | the day boundary — 04:00, Europe/London, week starts Monday | L2+L5 | **h** | 5 | 03:59 returns yesterday's date; 04:01 returns today's | — |
| 9 | name `pull_context` as a cascade key **in the engine** | L4 | **h** | — | `"ancestors"` appears at most once in `src/` outside a type and a validator | — |
| 10 | rename the domain filter; decide its unused `override` | L5 | **h** | — | `render/__init__.py` exports no name that shadows a builtin | — |
| 11 | carry section identity + resolved registration in the ENVELOPE | L1 | **½** | 2 | envelope section order == generator section order, all 72 views | — |
| 12 | the projection-replay convergence test | **L7** | **½** | 4, 11 | it IS the falsifier — it fails when a prediction and a cycle disagree | — |
| 13 | the server refuses a stale write (other repo) | L7 | **½** | — | a POST carrying a stale `sha256-…` is rejected, not applied | — |

**A browser-side rule evaluator is still refused**, for two independent reasons **[REPO]**
(`research-the-rule-closure.md` §10; `research-the-resolution-universe.md` §5.3). It is not in the
sequence and should not be added to it.

## What I refuted

1. **My own first measurement of the ordering dependency.** My first predicate-field extractor read
   only `find_nodes` inside `steps` and missed `root.find`. It reported **0** sections whose defaults
   touch their own qualification. The corrected extractor — checked against two patterns whose answer
   I knew before running it — reports **103 of 186**. **The number that would have made the whole
   ordering question moot was an artefact of my own reader, and I found it by refusing to accept a
   zero.** §4.1.
2. **The brief's own example of an ordering dependency was the weaker one.** "A default must land
   before a placement filter can test the field it sets" is true and abundant *within* a section
   (103 cases). The brief's implied worry — a default keyed on node type — has **zero** instances:
   all 153 `defaults:` blocks are plain field maps over eight fields. **[OBS]** §4.3.
3. **"The browser gets the day boundary wrong today."** **[OBS]** `app/` contains **exactly one**
   clock use, `app/index.html:1405`, and it renders `generated_at` for display. The browser computes
   no dates at all, so it is not wrong — it will become wrong the instant step 7 lands. That makes
   step 8 a **precondition**, not a bug fix, and it changes where it sits in the sequence. §7.8.
4. **The domain filter is not unnamed — it is named `filter`.** **[OBS]** `render/domain_filter.py`
   exports the Python builtin's name and is reached as `render.filter(...)` at exactly three sites.
   A reader grepping `domain_filter` finds only the re-export and the tests. §5.3.
5. **The four-level cascade is really five, and the fifth is off.** §2.1.

## What is unverified

* **[UNVERIFIED]** Step 11's envelope widening is described from `server/app.py` as it stands in the
  monorepo I read read-only. I did not run the server and did not POST anything. Settled by running
  it locally against a copy.
* **[UNVERIFIED]** The 72-of-72 heading/section agreement (§7.1) was measured against `~/qntm` as it
  stood at 2026-08-01. A view whose config declares a section that emits no heading would break
  step 2. I found none; I cannot prove none will exist. **Step 2's falsifier is exactly the test that
  would catch it**, which is why it is written that way.
* **[UNVERIFIED]** I did not re-run `research-the-rule-closure.md`'s per-view table. Every number in
  it is a **floor**, not a bound — its own §12.4 records a 12-of-158 sample, and
  `research-the-resolution-universe.md` §3.4 corrected its headline from 21 reachable rules to **29**
  and its in-view row ceiling from 2 to **6**. **Wherever this document cites that table, read it as
  a floor.**

---

# THE DETAIL

## 1. The rig

**[OBS]** Everything ran from this worktree, against:

* the app worktree itself — `app/`, `dist/present.js` (105,023 B), `presentation.json` (36,603 B);
* the monorepo at `/Users/lukeannison/projects/qntm-network/qntm`, **read only**, via absolute paths;
* `~/qntm`, **read only**, for heading counts. Nothing was written to it.

**No cycle was run. `graph-sync` was not run. `map . --full` was not run. Nothing was posted to any
server. `git stash` was not used.** The worktree was left clean; `git status --short` is empty.

**[OBS] The test suite.** `npm test` on this branch: **729 tests, 719 pass, 0 fail, 10 cancelled.**
The 10 cancelled are `tests/no-cdn.test.mjs`, whose `before` hook rebuilds the bundle and failed
because the `node_modules` I borrowed from the trunk clone lacks `@simplewebauthn/browser`. **That is
an artefact of my rig, not a defect on this branch**, and I removed the borrowed `node_modules`
afterwards. The two suites this document leans on were run standalone and both pass:

* `tests/present-membership.test.mjs` — **18 tests, 18 pass**;
* `tests/qualification-agreement.test.mjs` — **6 tests, 6 pass**, covering **61 field triples over
  1,501 real nodes** and **2,184 reachable triples**, all agreeing with the engine's own
  `qntm_graph.patterns.engine.matches_pattern`.

---

## 2. The spine — one cascade, or several?

### 2.1 One ORDER, and his four levels are the engine's five

**[OBS]** `apps/qntm-md/src/qntm_md/resolution/levels.py:86-92`:

```python
SPECIFICITY: tuple[ResolutionLevel, ...] = (
    ResolutionLevel.LINE,
    ResolutionLevel.SUBTREE,
    ResolutionLevel.STRUCTURAL_NODE,
    ResolutionLevel.VIEW,
    ResolutionLevel.GLOBAL,
)
```

and the comment above it, `levels.py:81-85`, is the reason the whole of this document insists on one
tuple: *"this order used to be re-expressed per key, per site, three times over, and the differ's
hand-rolled copy of it was the one that was wrong."*

**[OBS]** `app/present/levels.ts:41-49` is the output half, seven levels, most specific first:
`FOCUS, MODE, LINE, STRUCTURAL_NODE, VIEW, USER, GLOBAL`. **The four shared levels appear in the same
relative order in both tuples.** That is the whole reason to call it one cascade rather than two.

**[REA] The Salesforce comparison he reached for is exact in the part that matters and wrong in one
part.** Exact: most specific wins, silence falls through, and the winning level is reportable.
Wrong: a Salesforce permission model is a UNION (any grant grants). This is an OVERRIDE (the most
specific speaker wins outright, and there is no conflict to break —
`resolution/levels.py:8-10` says so). **A browser built on the union intuition would let a GLOBAL
default reappear underneath a section that had already answered.** That is not hypothetical: the
`CLEARED` sentinel (`resolution/cascade.py:55-83`) exists because exactly that happened on
2026-07-27 — deleting `#personal` from a task did nothing, because the structural node's default put
`domain: personal` straight back.

### 2.2 Only two kinds ride it — proved by enumeration, not by a grep returning nothing

**[OBS]** Every reference to `qntm_md.resolution`, `ResolutionCascade`, `ResolutionLevel`,
`resolve_registration_keys`, `resolve_base_node_type`, `LEVELS_FOR` or `levels_for` anywhere under
`apps/qntm-md/src` and `apps/qntm-md/tests`, classified:

| class | count | detail |
|---|---|---|
| the module itself | — | `src/qntm_md/resolution/{levels,cascade,registration,__init__}.py` |
| **production callers** | **4 sites in 3 files** | `io/applier.py:4137-4158`, `diff/content_diff.py:841-861`, `orchestrator.py:1553`, `orchestrator.py:4563` |
| architecture declarations | 4 | `coordination/signature.yaml:29`, `io/signature.yaml:56`, `diff/signature.yaml:49`, `substrate_wiring/__init__.py:5` |
| comments citing it | 9 | `orchestrator.py` ×3, `bundle/loader.py` ×2, `bundle/validators/views.py` ×3, `render/compiler.py:103`, `io/render_context_parse.py:206` |
| tests | 5 files | incl. `tests/flow_scenarios/config_defaults_resolve_via_one_canonical_resolver.py`, which pins that exactly one canonical cascade home exists |

**[REA] So the answer to his central question is: ONE cascade, and TEN of the twelve kinds are not
on it yet.** That is a finding, not a failure — the cascade was extracted on 2026-07-30 and it
absorbed three parallel mechanisms on the way (`resolution/cascade.py:14-22`). The work is real and
unfinished. **What "unfinished" means concretely is §5.**

### 2.3 The argument against the tempting answer

**The tempting answer is: "twelve kinds, so build twelve resolvers, one per kind, and the browser
mirrors each."** It is tempting because the taxonomy is already written down and each row looks like
a module.

**It is wrong, and the reason is `registration.py`.** That module's whole point
(`registration.py:18-24`) is that a kind is not a resolver — **a kind is a set of KEYS, and each key
has a LEVEL TABLE.** `LEVELS_FOR` grants `DEFAULT_NODE_TYPE` three levels and `BASE_NODE_TYPE` one,
**inside one kind**, and a level may only contribute a key the table grants it: *"a key declared at a
level the table does not list is DROPPED, not silently honoured."* Twelve resolvers would put twelve
copies of the walk in the codebase and give each of them its own idea of what silence means. **One
walk, twelve level tables.** That is the shape, and it is the shape the browser must copy — which is
why `app/present/cascade.ts:15-16` refuses to hold the order and defers to `levels.ts`.

---

## 3. Question A — the layers, derived

### 3.1 Why ADDRESSING is a layer and not a detail

**[REA]** Three independent arguments, each from code I read:

1. **The cascade cannot do it.** `app/present/cascade.ts:45-58` walks `SPECIFICITY` and asks
   `context.at(level)`. It has no way to *choose* which structural node's contribution `at()`
   returns. Something upstream must decide. Nothing does.
2. **It is already three modules with no name over them.** `instance.ts` derives
   `${view}/${section}/${token}`; `boundary.ts` finds the enclosing heading; `focus.ts` holds the
   anchor. All three answer "where is this row", none of them answers "what does this row resolve
   to", and none of them imports the cascade.
3. **Its absence is the reason two other layers are inert.** `membership.ts` (L5) needs a section
   ID and cannot get one. `newline.ts` (L4) resolves the seed by SEARCHING THE PROJECTION —
   `newline.ts:101-140`, three passes up, down, and across the file — because it has no addressable
   section to ask. Its own header says so at `newline.ts:54-59`: *"the snapshot envelope does not
   carry the view's resolved `default_node_type`… with that one field in the payload the GLOBAL rung
   stops being a guess and becomes a read."*

**[REA] A layer whose absence forces two other layers to reconstruct facts from the rendered text is
a layer.** Name it, and the fix stops being a special case.

### 3.2 What each layer may and may not do

| layer | may | may NOT |
|---|---|---|
| L1 TRANSPORT | carry documents | interpret them |
| L2 DECLARATION | validate shape, report problems, return a table | evaluate anything; guess a default for an unreadable key |
| L3 ADDRESSING | name a row and its `(view, section)` | read a declaration; move a row |
| L4 RESOLUTION | combine level contributions, report the winner | read the graph; touch the DOM |
| L5 EVALUATION | run a declared predicate over resolved fields | interpret the pattern language; produce a `Contribution` |
| L6 PROJECTION | touch the DOM | decide anything (`levels.ts:11-12`: no `if (focused) … else if (mode === …)` chain) |
| L7 RECONCILIATION | compare, report, re-anchor | refuse the operator's own write |

**[OBS] Two of those "may nots" are already enforced by tests rather than by convention.**
`tests/flow_scenarios/section_membership.ts:159-165` counts calls and fails if the membership layer
reaches the cascade or `applyEdit`; `:110-114` reads `membership.ts`'s import list directly. **That
is the enforcement pattern every new layer boundary in §7 should copy**, and it is cheap — it is a
few lines in a scenario file.

### 3.3 The three states, honestly

**[OBS]** `app/present/context.ts:114-123`, `presentationFromDeclaration`, the app's **one**
declaration reader, called from `app/index.html:935`:

```ts
const reading = readDeclaration(document);
const structuralReading = readStructuralDeclaration(document);
return { context: new PresentationContext({ GLOBAL: reading.contribution }),
         indentUnit: reading.indentUnit,
         structural: structuralReading.structural,
         problems: [...reading.problems, ...structuralReading.problems] };
```

**Two readers of three.** `readQualificationDeclaration` exists (`qualification.ts:413`), is exported
from the barrel (`index.ts:55`), and is called by **tests only** — `present-qualification.test.mjs`,
`present-membership.test.mjs`, `qualification-agreement.test.mjs`,
`tests/flow_scenarios/section_membership.ts:48`. **[OBS]**

**[OBS] And the data is already in the browser.** `presentation.json` carries a `qualification` key
of **20,365 bytes** — `defaultNodeType`, 7 structural node types, 3 token families, **43 predicates**,
**49 sections across 27 views**, and **116 refusals with reasons**. It is baked into `dist/present.js`
at build time (`embedded-declaration.ts`), so **the browser downloads it on every load and no line of
running code opens it.** That is the same shape as the 805 KB unread graph
(`research-the-resolution-universe.md` §6.3) — a second instance of the same pattern, one layer up.

---

## 4. Question B — the order, and where it is load-bearing

### 4.1 RESOLVE before EVALUATE — the measurement

**[OBS]** Over his real config — 72 view sheets, 186 sections, 252 patterns loaded from
`config/patterns/**`:

| measurement | count |
|---|---|
| sections declaring a `defaults:` block | **153 of 186** |
| **sections whose own `defaults:` sets a field their OWN `qualification` predicates on** | **103 of 186** (67 % of those that declare defaults) |
| **sections whose `defaults:` sets a field ANOTHER section of the SAME view predicates on** | **82 sections across 24 views** |
| sections stamping a `domain` their own sheet's domain filter would drop | **0** |

Examples, straight from the run:

```
('backlog','unscoped','dev-tickets-unscoped',   ['stage'],      {'stage':'unscoped'})
('everything-work','everything','everything-work-nodes', ['domain'], {'domain':'work'})
('flowtrace-capabilities','scoped','flowtrace-capabilities-scoped',
                                                ['cap_state','project'],
                                                {'project':'flow-trace','cap_state':'scoped'})
```

**[REA] Read `backlog:unscoped` slowly, because it is the whole argument.** The section stamps
`stage: unscoped`, and its qualification selects `stage: unscoped`. A browser that ran the placement
filter against the line's raw tokens would find `stage` absent, conclude the line does not qualify,
and tell the operator his line is about to leave — **at the exact moment the section's own default is
about to make it stay.** That is a confident, visible, wrong answer, on 103 of 186 sections.

**[OBS] `membership.ts` already gets this right**, and it is worth pinning as the reference
implementation. `membership.ts:166-181`, in order: the section's resolved `nodeType` (already
cascaded GLOBAL→VIEW by the generator), then the section's `defaults:`, then the line's own tokens,
which override both. Its own docstring at `:141-150` names it *"the same 'more specific beats less
specific' ordering the presentation cascade resolves by."*

### 4.2 The ingest order, cited per step

| # | kind | what it needs from the step before | citation |
|---|---|---|---|
| 1 | **LINE GRAMMAR** | — | `input_grammar` resolves `(GLOBAL, VIEW, STRUCTURAL_NODE)`, `registration.py:90-94`. A line the grammar refuses never reaches step 2 (`app/present/source.ts` records the applier's form gate) |
| 2 | **VOCABULARY** | the grammar admitted the line | needed by step 4: the LINE level's contribution IS the token→field map — `membership.ts:172-181` |
| 3 | **REGISTRATION** | the tokens, for `default_tags` | `registration.py:89-113`; `LEVELS_FOR` |
| 4 | **DEFAULTS** | **step 3's output is step 4's VIEW level** | `io/applier.py:4069-4079` — *"the VIEW layer is the candidate's `default_fields` … overlaid on its token-resolved `default_tags`"* |
| 5 | **IDENTITY** | the resolved node type (7 types resolve by unique title) | **[REPO]** universe §4.13 |
| 6 | **STRUCTURAL EDGE** | the resolved edge type and its cardinality | cardinality decides move-vs-add — **[REPO]** `design-the-structural-language.md` §5 |
| 7 | **RULES** | every field steps 1–6 resolved | priority-ordered pass, `rule_engine/executor/core.py:48-86` |
| 8 | **CASCADES** | rules, plus a transitive walk to depth 6 | **[REPO]** universe §4.12, §5.2 |

**[REA] Step 3 → step 4 is the sharpest dependency in the system and the easiest to get backwards.**
Registration and defaults look like one thing (both fill fields from config, both cascade, both are
most-specific-wins). They are **two runs of one cascade where run 1's answer is run 2's VIEW-level
input.** A browser that merged them into one pass would resolve `default_fields` at the wrong
specificity.

### 4.3 What does NOT depend on what — and this corrects the brief

The brief offers: *"Registration must land before a default keyed on node type."* **[OBS] There is no
such default in his instance.** All 153 `defaults:` blocks are flat field maps over exactly eight
fields — `domain` 153, `project` 60, `cap_state` 12, `principle_state` 10, `stage` 9, `class_state`
8, `package_state` 8, `god_box` 2. **None is keyed on node type.** The registration → defaults
dependency is real (§4.2) but it runs through `default_fields`, not through the node type.

**[REA] This matters for the sequence.** It means step 5 (publish the defaults table) and step 6
(the registration-driven seed) are **not** coupled through a node-type key, and a mistake in one
cannot silently corrupt the other. Two steps that look coupled are not.

### 4.4 The output order, from one loop

**[OBS]** `coordination/orchestrator.py:3037-3049`, in the order the lines run:

```python
for section in compiled.manifest:
    nodes = _compose_section_members(section, graph, pattern_resolver)   # 1 PLACEMENT FILTER
    filtered = render.filter(nodes, compiled.domain)                     # 2 DOMAIN FILTER
    ...
    section_trees[section.id] = view_renderer.build_section_tree(        # 3 EXPANSION + EDGE
        section, filtered, graph, **build_kwargs)
result = view_renderer.render(compiled, section_trees, ...)              # 4 ORDERING + SHAPE
```

**[OBS] The full four-step pipeline appears at two sites — `:3037-3049` and `:3700-3712` — and the
first two steps (placement, then domain) appear at a third, `:3411-3413`, which then does a different
job with the result.** In all three, placement runs before domain and nothing else comes between
them. **[REA] Two copies of a four-step render pipeline is itself a §5-shaped item; the order,
however, is unambiguous and identical at every site.**

**[REA] The consequence for the browser, and it is the one `research-the-resolution-universe.md` §4.6
warned about, now with a line number:** the domain filter runs AFTER the placement filter and
independently of it. A local mirror that reproduced the qualification and stopped would over-print by
exactly the nodes whose `domain` is wrong for the sheet.

### 4.5 The clock is a parameter of the order, not a step in it

**[OBS]** Ten of 186 sections depend on `$cycle_today` / `$cycle_week_end` **[REPO]**; the
declaration's own refusal table records `created_at: cycle variable $cycle_today` and
`due_date: cycle variable $cycle_today` among its 116 refusals, plus **7 date-range refusals** using
`gt`/`lt`/`gte`/`lte`. **[OBS]** The clock is threaded into `ResolutionCascade` as `cycle_scope`
(`resolution/cascade.py:148-155`) — it is not a level, it is a substitution scope every level's
templated string passes through.

**[REA] So the browser's day boundary is not a thirteenth kind and not a cascade level. It is an
argument to the resolver.** Getting that shape right in the app is what stops it becoming an ad-hoc
`new Date()` at each future call site, which is exactly how the engine ended up with four copies of
`"ancestors"` (§5.2).

---

## 5. Question C — where the engine is not cleanly wrapped

**Nine items, each with the name I would give it and what tidying costs. Ordered by cost.**

### 5.1 The headline: ten of twelve kinds have no level table

**[OBS]** §2.2's enumeration. **Name:** a `LEVELS_FOR` table per kind, in `qntm_md/resolution/`,
exactly as `registration.py:89-113` already does for one. **Cost:** an arc for all ten; **under an
hour for the first**, and the first should be `pull_context` because it is already a cascade.

### 5.2 `pull_context` is a three-level cascade written as `or` — and its terminal default is written four times

**[OBS]** `render/section_builder.py:133`:

```python
mode = section.pull_context or default_pull_context or "ancestors"
```

That is `STRUCTURAL_NODE → GLOBAL → engine literal`, most-specific-first, hand-rolled. The GLOBAL
level is resolved a hundred lines away in a different file — `orchestrator.py:4389`:

```python
default_pull_context = _indent_binding.pull_context if _indent_binding else "ancestors"
```

**[OBS] The literal `"ancestors"` appears as a terminal default at FOUR sites**:
`section_builder.py:133`, `orchestrator.py:4389`, `vocabulary/structural_token_resolver.py:189`, and
`vocabulary/structural_token_resolver.py:510`. (Two further occurrences are a `Literal[...]` type at
`render/compiler.py:89` and a validator allow-list at `bundle/validators/views.py:1814`; those are
legitimate.)

**[REA] This is precisely the condition `resolution/levels.py:81-85` records as having already cost
this project once — the order re-expressed per site, and the hand-rolled copy being the wrong one.**
It is not a bug today: the validator restricts the value to three non-empty literals, so the `or`
chain is safe. It is an unnamed cascade with four copies of its floor, and it is the cheapest thing
on this list to fix.

**Name:** `PullContextKey`, `LEVELS_FOR = (GLOBAL, STRUCTURAL_NODE)`, one terminal default constant.
**Cost: under an hour.** This is step 9.

### 5.3 The second placement gate is called `filter`

**[OBS]** `render/domain_filter.py` declares `__all__ = ["filter"]` — the Python builtin's name. Every
reference in `src/`, enumerated: `render/__init__.py:12` (module import), `:21` (`from
… import filter`), `:52` (`__all__`), `render/signature.yaml:17`. **Its production callers are
`render.filter(nodes, compiled.domain)` at `orchestrator.py:3039`, `:3413` and `:3703`** — found by
searching for `.domain`, not by searching for `domain_filter`.

**[REA]** `research-the-resolution-universe.md` §4.6 called this "the second placement filter, and
nobody has named it". **It is named. The name is the problem.** A resolution kind that cannot be
found by its own name is, for every practical purpose, unwrapped.

**Name:** `apply_domain_filter`. **Cost: under an hour.** Step 10.

### 5.4 The domain filter's second level has no caller

**[OBS]** `render/domain_filter.py:26`: `effective = override if override is not None else
sheet_domains`. That is a two-level resolution — an override beating the sheet. **All three
production call sites pass two positional arguments and no `override`.** The only code that passes
one is `tests/render/test_domain_filter.py`.

**[REA] Either it is a level, in which case it should be declared in a table and something should
supply it, or it is dead, in which case removing it removes a second way to filter by domain.** Both
are cheap. Deciding is the work. **Cost: under an hour.** Folded into step 10.

### 5.5 `DEFAULT_NODE_TYPE` and `BASE_NODE_TYPE` are two code names over one config key

**[OBS]** `registration.py:53-56` says it plainly: *"The two share one CONFIG key today — GLOBAL
`default_registration.default_node_type`. Splitting the config key is design stage 3 and touches the
operator's bundle."* The code split is done and structural — `resolve_base_node_type`'s signature has
nowhere to put a sheet (`registration.py:173-187`).

**[REA] The browser must not spring the trap the engine has already disarmed.** A local mirror that
read the sheet's `default_node_type` and used it as a *revert* target reproduces the 2026-07-27
`routine → task → routine` race in the browser. **Any published table (step 5) must ship the two as
two names even though the config has one key.** **Cost: half a day, and it touches his bundle.**

### 5.6 The SUBTREE level is declared and switched off

**[REPO]** `config/global_defaults.yaml` — `node_defaults_cascade: ()`, with that file's own header
recording it as a live choice. **[REA]** So the five-level cascade runs four, and the operator's
"global → view → section → node" is right by arithmetic and wrong by structure: his "node" is `LINE`,
and `SUBTREE` is a fifth level sitting silently between them. **Name:** nothing new — a comment in
`global_defaults.yaml` saying which of the operator's four words maps to which level. **Cost: under
an hour**, and it prevents a browser author from putting subtree inheritance where line tokens go.

### 5.7 Cascade depth is file order and no validator checks it

**[REPO]** universe §4.12: six unlock rules, all at priority 0, sequenced by position in
`rules/unlocks_status_propagation.yaml`, whose own header says *"SIX rules IN THIS ORDER — the order
is load-bearing"*. `rule_engine/executor/core.py:48-86` sorts by priority descending with a stable
sort. **Name:** a declared `chain:` block, or a validator that pins the count and order. **Cost: half
a day.**

### 5.8 Ordering is three config keys and one knob

**[OBS]** `render/compiler.py:51-62`: `persist_placing` *"subsumes the scattered flags it retired
(`ordering_mode: insertion_order` order-persistence + the unconsumed
`pin_after_qualification_drops` presence-persistence)"*. His config still declares `ordering` in 7
sections, `ordering_mode` in 2 and `pin_after_qualification_drops` in 14. **[REPO]** **Name:** the
knob is named; the config keys are the leftovers. **Cost: half a day**, and it touches his bundle.

### 5.9 The section is addressable in the engine and absent from the wire

**[OBS]** `server/app.py:188-197`, the whole envelope:

```python
return {"generated_at": updated, "views": views, "graph": graph or {},
        "locations": {},  # node -> {view,line}; wired when we do two-way gestures
        "missing": missing}
```

and each view is `{id, path, title, domain, markdown}` (`:163-172`). **No section identity. No
resolved `default_node_type`. `locations` (`:195`) is an empty dict with a comment promising it
later.**

**[REPO]** Meanwhile `renderer.py:169-184` computes `RenderedLineRecord(section_id, node_id)` **every
cycle** and discards it before it reaches the line cache
(`design-presentation-instance-identity.md` §1.2).

**[REA] The engine knows the answer, computes it every cycle, throws it away, and the browser
rebuilds a lossy version of it by counting headings.** That is the single largest structural gap in
this document, and it is the reason steps 1, 2 and 11 exist. **Cost: half a day** on the server —
**or under an hour** in the generator, which is why the sequence takes the generator route first and
the envelope route later.

---

## 6. Question D — reconciliation, and what would make convergence provable

### 6.1 What is already there

| piece | what it proves | citation |
|---|---|---|
| **the base hash** | the string an edit was computed against is or is not the string the server last sent | `app/present/base.ts:69-83` — four outcomes: `current`, `stale`, `writing`, `unknown` |
| **the pending-write count** | an earlier save of the same file has not answered, so no base can be current | `base.ts` header, "THE PENDING WRITES ARE THE ONE THING KEYED SEPARATELY" |
| **the instance anchor** | which printed row the cursor was on, across a projection swap | `instance.ts` — `${view}/${section}/${token}`, two tiers: instance, then node |
| **the re-anchor** | whether the cursor's row survived | `focus.ts:260` — `reanchor(source, view) → InstanceReading \| {outcome:"unanchored"}` |
| **the queue** | at most one projection per file, applied by `paintView` and nothing new | **[REPO]** `design-local-behaviour-and-the-queue.md` §5.1-5.2 |
| **no pixel reaches a POST** | the read path cannot become a write path | **[OBS]** `tests/flow_scenarios/section_membership.ts:110-114, 159-165` |

**[REA] Note what that list is and is not.** It is a complete story about **the cursor** surviving the
model catching up. It is **not yet a story about a PREDICTION surviving** — because the browser makes
no predictions today.

### 6.2 What is missing, in order of what blocks what

**D1. There is nothing to reconcile yet.** **[OBS]** `membershipFor` has **zero runtime callers** —
every reference under `app/` is `index.ts:70`'s re-export and comments in `qualification.ts`;
`paint.ts` and `app/index.html` do not name it. The graph is unread. **Front-running cannot be
proven correct while nothing front-runs.** This is why step 4 comes before step 12.

**D2. The server cannot refuse a stale write.** `base.ts` computes and carries `sha256-<hex>`, and
its own header states the boundary: *"IT CARRIES `baseOf(source)` on the write, so that the server
CAN one day refuse. That is row 5 … and it touches a repository that is not this one."* Until then,
the client says "stale" and the write lands anyway. Step 13.

**D3. The convergence test does not exist — but its SHAPE does, and it already passes.**

**[OBS]** `tests/qualification-agreement.test.mjs`, run standalone on this branch:

```
▶ 1. over every field triple in the operator's real graph
  ✔ all 61 triples (covering 1501 nodes) agree with the engine
▶ 2. over the whole space a line being typed can reach
  ✔ all 2184 reachable triples agree with the engine
  ✔ THE OPERATOR'S OWN TWO CASES, decided by the engine, reproduced by the app
```

The mechanism: `scripts/qualification-agreement.py` runs the **engine's own**
`qntm_graph.patterns.engine.matches_pattern`, the test runs the **browser's** `matchesQualifier`, and
asserts equality over every reachable `(node_type, domain, status)` triple.

**[REA] That is the answer to his question about "the equivalent of the cascade's golden test for a
resolution mirror", and the answer is better than expected: it exists, for one kind of twelve, and it
is generalisable by construction.** The falsifier for every config-only step in §7 is *"extend this
harness to the kind the step adds"* — generate the engine's answers, generate the browser's, assert
equality over the whole reachable input space. **Steps 5, 6, 7 and 8 each get their falsifier for
free from a pattern that is already proven.**

**D4. What agreement testing cannot give, and this is the honest limit.** The agreement test compares
**one predicate over one field set at one instant.** A front-running mirror must also agree about
**WHEN** — the cycle's clock, the order rows land in, and what happens when the operator types
between the prediction and its arrival. Nothing tests that shape.

**[REA] The test that would is a PROJECTION REPLAY**: take a real before/after markdown pair for one
view from one real cycle, apply the browser's predicted change to the *before*, and assert it equals
the *after*. It is the only test that can fail for the reason a front-runner actually fails —
predicting the right change at the wrong time, or predicting a change the cycle also made and
double-applying it. **Size: half a day, and it needs step 11's section identity to key the
prediction.** Step 12.

### 6.3 The one thing that must not be built

**[REA] Do not build a "reconciliation" that resolves a disagreement automatically.** The queue
design already settled the shape (**[REPO]** `design-local-behaviour-and-the-queue.md` §5.5, §7.4):
when the local answer and the server's differ, **the server wins and the difference is SAID.** A
browser that silently corrected itself would make the one class of failure this whole arc exists to
prevent — a local guess becoming an authored fact — invisible. **The reconciliation layer's output is
a statement, never an edit.** That is the same rule `membership.ts:49-56` already states for itself,
one layer up.

---

## 7. The sequenced build order

**One agent at a time, in this order. Each step lands on its own and is revertible on its own.**
Every step names its layer, its size, its dependencies, and the test that would prove it wrong.

---

### Step 1 — publish the ORDERED section id list · **under an hour** · L2 DECLARATION · needs nothing · **DONE 2026-08-01**

**What.** `scripts/generate-qualification-declaration.mjs` emits, per view, the **full ordered list of
section ids** — including the sections whose predicate it refused.

**Why this is first.** It is the missing half of the ordinal→id map, and it is a handful of lines.

**[OBS] The measurement that makes it correct.** Across **all 72** of his view sheets, the number of
`^#{1,6} ` heading lines in the rendered file equals the number of sections the config declares —
**72 of 72 views, 186 of 186 sections, zero mismatches.** That extends
`design-presentation-instance-identity.md` §2.3(c) from 5 views / 24 sections to the whole instance.

**[OBS] The measurement that makes it NECESSARY.** The published predicate table is a **proper
subset** of the declared sections in 2 of 27 published views:

| view | published | declared | unpublished, by ordinal |
|---|---|---|---|
| `daily-work` | 1 | 5 | 1 `urgent`, 2 `due-today`, 3 `waiting`, 4 `capture` |
| `daily-personal` | 3 | 8 | 0 `high-priority`, 1 `due-soon`, 2 `waiting`, 4 `capture`, 5 `orphans` |

The other 25 published views are complete, **which is exactly the trap** — an implementation that
indexed `Object.keys(sections[view])[ordinal]` would work on 25 views and be silently wrong on
`daily-work` and `daily-personal`, his two most-used daily surfaces. 45 further views publish nothing
at all.

**[OBS] The generator already has the ordered list.** `generate-qualification-declaration.mjs:318`
loops `view.sections` in declared order; `:422-428` is where the refused ones are dropped. Capture the
order before the drop.

**Falsifier.** For every view in the declaration, assert `sectionOrder[view].length` equals the count
of `^#{1,6} ` lines in that view's markdown in the served envelope. It fails the day a section stops
emitting a heading — which is the one assumption step 2 rests on.

---

### Step 2 — `sectionAt(source, lineIndex) → sectionId` · **under an hour** · **L3 ADDRESSING** · needs 1 · **DONE 2026-08-01**

**What.** Count headings above `lineIndex`, index step 1's list. `boundary.ts:76-83` already has
`prevHeading`; `instance.ts` already computes the ordinal. This is the join, and it is the named
blocker.

**Why it is the blocker.** `membershipFor(viewId, sectionId, …)` (`membership.ts:190-196`) wants the
config's `id:`. `instance.ts`'s own header states the app's key is *"the 0-based ordinal of the
heading … **NEVER** a config-read string id, because this module has no config to read."*
`newline.ts:61-69` names the same gap from the other side. **Step 1 gives it the config to read.**

**The view half already works.** **[OBS]** `app/index.html:1036` holds `currentViewId`, matched against
`graphData.snapshot.views[].id` at `:1249`; `server/app.py:149-172` sets that id from the view
sheet's own top-level key. It is the same string the declaration is keyed on — `inbox` is `inbox`.

**Falsifier.** Dump the engine's own `RenderedLineRecord.section_id` for every non-blank line of all
72 views (the same rig shape as `scripts/qualification-agreement.py`), and assert `sectionAt` agrees
on every one. A disagreement means the heading assumption broke, and it names the view.

---

### Step 3 — wire the qualification reader · **under an hour** · L2 DECLARATION · needs nothing · **DONE 2026-08-01**

**What.** `presentationFromDeclaration` calls `readQualificationDeclaration` and returns it on
`DeclaredPresentation`, exactly the way it already returns `structural`. Three lines in
`context.ts:114-123`, one field on the interface, one assignment in `app/index.html:935-941`.

**Why.** **[OBS]** 20,365 bytes of predicate table ship in `dist/present.js` and no running code opens
it. Parallel with steps 1–2; no dependency either way.

**Falsifier.** Assert `presentationFromDeclaration(EMBEDDED_DECLARATION).qualification.predicates` has
**43** entries and `.sections` has **27** views. It fails if the reader is dropped or the generator
silently shrinks.

---

### Step 4 — SAY the membership answer · **half a day** · L6 PROJECTION · needs 2 + 3 · **DONE 2026-08-01**

**What.** On the line the cursor is in, call
`membershipFor(currentViewId, sectionAt(source, lineIndex), line, language)` and, when it answers,
show it. **Nothing moves.** When it abstains, show nothing.

**Why it is the payoff step.** This is where tonight's merged work becomes visible. The operator types
`#work` under `inbox`'s "Domain Empty" and the app says *this line will leave this section* — before
any cycle, from config he already owns.

**The refusals are the feature.** All five `Abstention` values (`membership.ts:75-80`) must paint
nothing: `no-section-declaration` (118 of 159 qualifications), `already-a-node`,
`not-a-declared-checkbox`, `no-content`, `ambiguous-token`.

**Falsifier.** Two arms. (a) The answer is already proven — `qualification-agreement.test.mjs`, 2,184
triples. (b) The new arm: for each of the five `Abstention` values, assert the painted row carries no
membership statement. A painter that showed a default when the layer abstained would be the exact
failure `membership.ts:20-48` refuses.

**SHIPPED, WITH ONE ADAPTATION TO THE FALSIFIER'S OWN WORDING, ARGUED RATHER THAN SILENTLY TAKEN.**
Arm (b) as written says "the painted row carries no membership statement" — a row-adjacent message.
**The message does not live beside the row.** It lives in the freshness line
(`app/present/base.ts`'s own stale-save register), because that is what makes "say it" and "move it"
(`paint.ts`'s row-building code) STRUCTURALLY DISTANT rather than merely separated by convention: no
function this step adds both computes a membership answer and touches `viewBody`, and
`tests/app-membership-note.test.mjs` §4 proves it by the same enumeration
`research-the-rule-closure.md` §8 already used for the write path. So arm (b)'s adapted form is **"the
freshness line carries no membership statement"**, proven for all five `Abstention` values (either
side of the before/after comparison), plus two cases the original wording did not name: a RETURNING
transition (was leaving, now stays — silence, because only the leaving direction is said) and an
INSERTED line (`LineCommit.kind !== "set-line"` — refused outright, because reading its "before" at
the same source index would misattribute a different, soon-to-be-pushed-down line's answer to it).
Arm (a) ran unmodified and still passes. `app/index.html`'s `membershipNoteFor` (called from
`commitLine`) is the caller; `paint.ts`'s `LineCommit` gained one provenance field (`kind`) and
nothing else. See capability `section-membership-is-said-in-the-freshness-line` for the full record.

---

### Step 5 — publish the config-only resolution table · **half a day** · L2 DECLARATION · needs 1

**What.** Extend the generator to publish, per view and per section: resolved registration keys
(`default_node_type`, `input_grammar`, `default_tags`, **and `base_node_type` as a separate name** —
§5.5), the section's `defaults:` map, `persist_placing`/`ordering`, `pull_context`, and the three
day-boundary keys.

**Size evidence.** **[REPO]** universe §6.1: **60,490 bytes for all 72 views, median 685 bytes per
view**. The declaration already ships 36,603 bytes and the browser already carries 805 KB of graph it
does not read. **[OBS]** The mechanism exists twice —
`scripts/generate-structural-declaration.mjs` and `scripts/generate-qualification-declaration.mjs`,
both with a `--check` mode in `package.json`.

**Falsifier.** Two arms. (a) `--check` fails when the published table disagrees with the config.
(b) The agreement harness of §6.2 D3, extended: for every section, assert the published `defaults`
equals `ResolutionCascade().resolve({STRUCTURAL_NODE: section_defaults}).fields` computed by the
engine itself.

**SHIPPED, WITH THE SCOPE NARROWED AND THE NARROWING ARGUED RATHER THAN SILENTLY TAKEN.** `defaults`
and the per-view `default_node_type` were, on inspection, ALREADY on the wire — `qualification.
sections[view][section].{defaults,nodeType}`, already read by `membership.ts` on every line typed —
so this step's own work is the REST of the "What" above: `base_node_type` as the separate name §5.5
demands, `input_grammar`/`default_tags`, `ordering`, and the day boundary. `pull_context` is NOT
published — measured against `research-the-resolution-universe.md` §6.2 as "predicate exact, answer
RUNTIME" (a transitive graph walk, depth up to 6, per §4.8) and against this document's own §7
ranking as a kind no step 5-13 names as a dependency; publishing it would violate this document's own
rule ("a smaller table that is exact and consumed beats a complete one nobody reads"), so it is filed
in `backlog.yaml` (`widen-resolution-table-to-pull-context`) rather than shipped speculatively.
Falsifier arm (a) ran across all three generators (`generate:structural:check`,
`generate:qualification:check`, `generate:resolution:check`), all pass. Arm (b) ran exactly as
worded — `scripts/resolution-agreement.py` calls the engine's own `ResolutionCascade` and
`resolve_registration_keys`/`resolve_base_node_type` over a read-only load of the real config bundle,
producing `tests/fixtures/resolution-agreement.json`; `tests/resolution-agreement.test.mjs` asserts
all 49 published `(view, section)` pairs and the 4 GLOBAL registration facts agree, 0 disagreements —
the first time the ALREADY-SHIPPED `qualification.sections` defaults/registration values have been
checked against the engine's own resolver rather than a second read of the same YAML. See the STATUS
block above the build-order table for the full account, including the size measurement (994 B),
the operator's proof-standard-#3 falsifier (a scratch-copy config mutation moves the published
answer), and the honest baseline/delta.

---

### Step 6 — the seed becomes a read · **under an hour** · L4 RESOLUTION · needs 5

**What.** `newline.ts`'s GLOBAL rung stops returning `null` and reads the resolved
`default_node_type` from step 5's table. `newline.ts:54-59` specifies this change and says nothing
else about the file changes.

**Why it matters more than it looks.** Today, pressing Enter on a view that has printed no node line
opens no line at all — because both available guesses cost the operator something and one of them
**aborts his whole cycle** (`newline.ts:36-52`, measured against the starter bundle 2026-07-31).

**Falsifier.** On a view with no printed node line, `seedFor` returns non-null, **and** the seed's
chrome matches the `render.shape` the engine would print for that view's resolved
`default_node_type` — asserted over all 72 views. If the table is wrong for one view, that view's
row fails by name.

---

### Step 7 — ordering preview · **under an hour** · L5 EVALUATION · needs 5, and needs 8 for the dated half

**What.** For the 9 sections that declare an order (**[REPO]** universe §4.7), place a newly typed
row where the declared sort puts it, among rows the browser is already painting.

**Falsifier.** For `this-week`'s four sections, assert the browser's sort of the currently painted
rows equals the order those rows appear in the served markdown. If they differ, the browser's sort
key or its direction is wrong, and the section names which.

---

### Step 8 — the day boundary · **under an hour** · L2 + L5 · needs 5

**What.** Publish and read `timezone: Europe/London`, `day_start_hour: 4`, `week_starts_on: monday`,
and route every date decision through one function.

**[OBS] Correction to `research-the-resolution-universe.md` §4.9.** It says the browser gets the day
boundary wrong today. **It does not — it computes no dates at all.** `app/` contains exactly one
clock use, `app/index.html:1405`, which renders `generated_at` for display. **So this is a
precondition of step 7's dated half, not a live defect**, and it belongs beside step 7 rather than
ahead of it.

**Falsifier.** At 03:59 Europe/London the resolver's `today()` returns the previous calendar date; at
04:01 it returns the current one; a Sunday resolves into the week that started the preceding Monday.

---

### Step 9 — name `pull_context` as a cascade key **in the engine** · **under an hour** · L4 · needs nothing

**What.** `PullContextKey` in `qntm_md/resolution/`, `LEVELS_FOR = (GLOBAL, STRUCTURAL_NODE)`, one
terminal default constant. `render/section_builder.py:133`'s `or` chain and
`orchestrator.py:4389`'s duplicate literal both call it.

**Why this one first among the engine items.** It is the only one of the ten unwrapped kinds that is
**already a real multi-level cascade**, so it is the smallest possible proof that the `LEVELS_FOR`
pattern generalises past registration.

**Falsifier.** A test asserting the literal `"ancestors"` appears **at most once** in
`apps/qntm-md/src/` outside a `Literal[...]` annotation and a validator allow-list. **[OBS] It fails
today, at four sites.**

---

### Step 10 — rename the domain filter, decide its `override` · **under an hour** · L5 · needs nothing

**What.** `render.filter` → `render.apply_domain_filter` at `render/__init__.py:12,21,52` and the
three call sites `orchestrator.py:3039, :3413, :3703`. Then either declare `override` a level with a
table and a supplier, or delete it — **[OBS]** it has zero production callers.

**Falsifier.** A test asserting `render/__init__.py`'s `__all__` contains no name that shadows a
Python builtin. It fails today.

---

### Step 11 — carry section identity in the envelope · **half a day** · L1 TRANSPORT · needs 2

**What.** `server/app.py:_envelope` gains, per view, the ordered section ids and each section's
resolved `default_node_type`. Steps 1 and 5's generator becomes the *fallback*, not the source, and
`locations: {}` (`server/app.py:191`) can finally be filled.

**Why after step 2 and not before.** Step 2 makes it **verifiable**: with `sectionAt` in place, the
envelope's section list has something to be checked against.

**Falsifier.** Assert the envelope's section order for every view equals the generator's, for all 72.
A disagreement means one of the two is reading stale config, and it names the view.

**[UNVERIFIED]** I read `server/app.py` read-only and did not run it.

---

### Step 12 — the projection-replay convergence test · **half a day** · **L7 RECONCILIATION** · needs 4 + 11

**What.** Take a real before/after markdown pair for one view from one real cycle. Apply the
browser's predicted change to the *before*. Assert it equals the *after*.

**Why it is the real reconciliation proof.** §6.2 D4. The agreement harness proves the browser and
the engine agree about **what**. Only replay proves they agree about **when**.

**Falsifier.** It IS the falsifier. It fails whenever a prediction and a cycle disagree, including the
two failures nothing else can catch: predicting the right change at the wrong time, and
double-applying a change the cycle also made.

---

### Step 13 — the server refuses a stale write · **half a day** · L7 · other repo · needs nothing

**What.** The server compares the POST's `sha256-<hex>` base against the file's current content and
refuses on mismatch. `base.ts` already sends it.

**Falsifier.** A POST carrying a stale base is rejected with a distinguishable status, and the client
reports it rather than losing the operator's characters.

---

### Not in the sequence: a browser-side rule evaluator

**Still refused, on two independent grounds** **[REPO]**: `research-the-rule-closure.md` §10 (the pass
is the unit, not the rule, so "which rules apply" has no local answer), and
`research-the-resolution-universe.md` §5.3 (the one gesture that motivates it needs the rule set, a
six-deep transitive walk, a load-bearing within-band file order, **and** a whole-graph aggregate that
no view scope contains). **Adding it to this sequence would invalidate the sequence.**

---

## 8. What I refuted, including myself

1. **My own extractor, and this is the one that mattered.** My first measurement of the
   defaults↔filter overlap read only `find_nodes` inside `steps:` and missed `root.find`. It returned
   **0**, which would have said the ordering question was academic. I ran a non-vacuity check —
   asserting the extractor finds `status` in `in-progress-tasks` and `domain` in `domain-empty`,
   both of which I had read — and it failed. The corrected extractor returns **103 of 186**. **A
   measurement that returns zero should be treated as a broken measurement until a positive control
   passes.**
2. **The brief's ordering example.** "A default keyed on node type" has zero instances (§4.3). The
   real dependency runs registration → `default_fields` → the defaults cascade's VIEW level
   (`applier.py:4069-4079`).
3. **"The browser gets the day boundary wrong today."** It computes no dates at all (§7.8).
4. **"Nobody has named the domain filter."** It is named `filter` (§5.3) — which is worse, and
   cheaper to fix.
5. **The six-layer candidate list.** ADDRESSING is a seventh layer, and it is the one that is
   unfinished (§3.1).
6. **The four-level cascade.** It is five, and the fifth is switched off (§2.1, §5.6).
7. **"Twelve kinds, twelve resolvers."** One walk, twelve level tables (§2.3).

## 9. What is unsettled

* **[UNVERIFIED]** Step 11 is designed from a read of `server/app.py`. Not run. **Settled by** running
  the server locally against a copied vault and diffing the envelope.
* **[UNVERIFIED]** §7.1's 72-of-72 heading agreement is a snapshot of 2026-08-01. **Settled
  permanently by step 1's falsifier**, which is why it is written as a shipped test rather than a
  measurement in this document.
* **[UNVERIFIED]** I did not measure whether any of the 116 refused qualifications would become
  decidable once the graph is read (27 traverse edges, and the 460 edges are already on the wire).
  That is a real widening of step 4's reach and it is not priced here. **Settled by** re-running the
  generator with edge traversal admitted and counting how many of the 116 move.
* **[UNVERIFIED]** `research-the-rule-closure.md`'s per-view table was built from a 12-of-158 sample
  (its own §12.4). **Every number in it is a floor.** The universe document corrected its headline
  from 21 to 29 reachable rules and its in-view row ceiling from 2 to 6. Nothing in this document
  depends on those numbers; where they are cited, they are cited as floors.

## 10. Reproduction

Every measurement in this document, in the order it appears. All read-only.

```bash
# ── THE SPINE ──
# the two tuples, and the comment that says why there must be exactly one of each
sed -n '81,92p' apps/qntm-md/src/qntm_md/resolution/levels.py      # ingest, 5 levels
sed -n '36,49p' app/present/levels.ts                              # output, 7 levels

# ── §2.2 ONLY TWO KINDS RIDE IT — enumeration, never a grep returning nothing ──
grep -rn "qntm_md.resolution\|ResolutionCascade\|ResolutionLevel\|resolve_registration_keys\|\
resolve_base_node_type\|LEVELS_FOR\|levels_for" apps/qntm-md/src apps/qntm-md/tests \
  | grep -v "^apps/qntm-md/src/qntm_md/resolution/" | grep -v __pycache__
# -> 4 production call sites in 3 files; the rest are signatures, comments and tests

# ── §3.3 THE APP READS TWO OF THREE DECLARATION READERS ──
grep -rn "readQualificationDeclaration\|readStructuralDeclaration\|readDeclaration\|\
presentationFromDeclaration" app index.html app.html scripts tests
sed -n '114,123p' app/present/context.ts     # the one reader; qualification is not in it
python3 -c "import json;q=json.load(open('presentation.json'))['qualification'];\
print(len(json.dumps(q)),len(q['predicates']),sum(len(v) for v in q['sections'].values()),\
len(q['refused']))"                          # 20365 bytes, 43 predicates, 49 sections, 116 refused

# ── §4.1 RESOLVE BEFORE EVALUATE — 103 of 186 ──
# Loads config/patterns/**.yaml and config/views/*.yaml read-only; extracts every node field any
# `find:` or `find_nodes:` clause predicates on; intersects with each section's own `defaults:`.
# NON-VACUITY CHECK FIRST: assert 'status' in fields_of(in-progress-tasks) and
#                          'domain' in fields_of(domain-empty)
# -> 186 sections, 153 with defaults, 103 own-qualification overlap, 82 sections / 24 views cross

# ── §4.4 THE OUTPUT ORDER, FROM ONE LOOP ──
sed -n '3037,3049p' apps/qntm-md/src/qntm_md/coordination/orchestrator.py

# ── §5.2 FOUR COPIES OF ONE TERMINAL DEFAULT ──
grep -rn '"ancestors"' apps/qntm-md/src | grep -v __pycache__
# section_builder.py:133, orchestrator.py:4389, structural_token_resolver.py:189 and :510
# (compiler.py:89 is a Literal type; validators/views.py:1814 is an allow-list)

# ── §5.3 / §5.4 THE DOMAIN FILTER ──
grep -rn "domain_filter" apps/qntm-md/src apps/qntm-md/tests | grep -v __pycache__   # re-export + tests only
grep -rn "render.filter" apps/qntm-md/src | grep -v __pycache__                      # :3039 :3413 :3703
sed -n '12,30p' apps/qntm-md/src/qntm_md/render/domain_filter.py                     # the unused `override`

# ── §5.9 THE ENVELOPE ──
sed -n '150,197p' server/app.py     # views: {id,path,title,domain,markdown}; locations: {}

# ── §7.1 THE HEADING/SECTION AGREEMENT — 72 of 72, 186 of 186 ──
# For each config/views/*.yaml: count `sections:` entries; count `^#{1,6} ` lines in ~/qntm/<path>.
# -> 72 files found, 72 exact matches, 0 mismatches.
# And the published table is a PROPER SUBSET in daily-work (1/5) and daily-personal (3/8).

# ── §6.2 D3 THE GOLDEN TEST THAT ALREADY EXISTS ──
node --test tests/qualification-agreement.test.mjs   # 6/6; 61 triples over 1501 nodes; 2184 reachable
node --test tests/present-membership.test.mjs        # 18/18

# ── THE SUITE, AND THE HONEST CAVEAT ──
npm test    # 729 tests, 719 pass, 0 fail, 10 cancelled.
            # The 10 are tests/no-cdn.test.mjs, whose before-hook rebuild failed because the
            # node_modules borrowed from the trunk clone lacks @simplewebauthn/browser. A rig
            # artefact, not a branch defect. The borrowed node_modules was removed afterwards.

# ── NOT RUN, and deliberately ──
# no cycle, no graph-sync, no `map . --full`, no POST to any server, no git stash.
# ~/qntm was READ for heading counts and never written. state.db was not opened at all.
```

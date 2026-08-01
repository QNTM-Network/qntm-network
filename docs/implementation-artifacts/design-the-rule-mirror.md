# Design: the rule mirror — can the engine's behaviour be published, what does it cost, and where does it start

**Status: measured, argued, ranked. No application source is modified on this branch. This document
is the only file it adds.**
**Branch:** `design/rule-mirror`, based on `origin/main` @ `a16fd1e`.

---

## 0. Lead — the answer, before the method

**Yes, and the ladder he named is the right one — but its three rungs differ in price by two orders
of magnitude, and the reason is a number nobody had measured.**

**A capture reaches almost no rules.** Pressing Enter on a new line under `inbox.md`'s "Domain
Empty" reaches **exactly ONE of 94 rules** — `stamp-created-at-on-task` — and changes nothing else
in the graph. **[OBS]** Swept exhaustively over **every one of his 186 sections**, a bare capture
reaches **TWO distinct rules in the whole config**: `stamp-created-at-on-task` (132 sections) and
`routine-without-cadence-becomes-task` (13 sections). **54 sections reach zero, 119 reach one, 13
reach two, and not one of the 186 changes a single other node.** **[OBS]** The comparable number
for a tick is 29 of 94 **[REPO]** (`research-the-resolution-universe.md` §3.1).

**So the rule pass is the WRONG place to start, and he already knew that — his ladder starts
somewhere else.** His three worked examples are registration (`inbox` → `task`), registration plus
defaults (`personal/all` → `task` **and** `personal`), and only then the rule pass (unlocks). Priced
against the measurement, that ordering is not merely convenient. It is the whole value:

| rung | what it says | what it costs | what it buys |
|---|---|---|---|
| **1. registration** | this line is a `task` | **h** — the app already looks the answer up and throws the name away | the stamp on every capture in 72 views |
| **2. defaults** | …and it is `personal` | **h** for the seed, **½** with its test | **153 of 186 sections**, 8 fields, **no rule engine at all** |
| **3. the rule pass** | …and `unlocks` released three things | **an arc** | **2 rules on a capture.** Everything else needs a tick |

**[REA] Rungs 1 and 2 together are not a rule mirror. They are the CONFIG cascade, which is a
different machine, already half-published, and the one his two cheapest examples actually name.**
The rule engine does not enter until rung 3, and on a capture rung 3 has two rules to say.

**But one of those two rules is the finding that makes rung 3 non-optional.**
`routine-without-cadence-becomes-task` **[OBS]** (`config/rules/cadence_auto_routine.yaml:58-71`)
retypes a bare capture in any of his 13 routine sections from `routine` to `task` **inside the same
pass that minted it**. So in **13 of 186 sections the registration answer is WRONG by the end of the
cycle** — the view declares `default_node_type: routine`, and a rule immediately overrules it
because the line carries no cadence. A rung-1-only mirror would stamp `routine` on those lines and
be contradicted by the projection ten seconds later. **That is a silent disagreement, and it is the
exact failure mode this document exists to prevent.**

**What genuinely cannot be mirrored is not the id.** He named the minted `[[qntm:N]]` as the one
thing. **It is computable in the browser today**: `next_qntm_id` is `max(qntm_id) + 1` over the whole
graph (`apps/qntm-md/src/qntm_md/identity/mint.py:39-57`), all **1,501 nodes carry a `qntm_id`, the
max is 2351**, and the whole graph is already on the wire. **[OBS]** The id is not uncomputable — it
is **unallocatable**, which is a different and smaller objection, and it dissolves the moment the
browser stops trying to name the node and just says what KIND of thing arrived. What actually cannot
be mirrored is **six whole-graph metric aggregates** **[REPO]** and **a within-band file order that
this document now observes on the capture gesture too** (§6).

**And the acceptance test he set — "it must work for any new config, the way the engine does" — is
failed today, in one line, for a reason that has nothing to do with rules.** **[OBS]** A vocabulary
token declaring a field outside `node_type`/`domain`/`status` is skipped by the qualification
generator with **no `refused` entry, no warning and no exit code**
(`scripts/generate-qualification-declaration.mjs:396`). And **none of the three generators' `--check`
modes is wired into CI**, while the staleness tests that would catch it **self-skip precisely in CI**,
because CI does not clone the monorepo. **[REA] So a mirror can be built on this foundation, but the
foundation's own generality is currently unchecked — and closing that is `h`, ahead of any rung.**
That is worth more than the closure count, and §9 is where it is enumerated.

**The first slice, and it is not in `inbox`.** `inbox` declares no section defaults, no ordering, and
a bare capture there stays in Domain Empty — so after the sibling agent's stamp lands, **a rule
mirror has essentially nothing left to do in `inbox`, and that is the correct answer, not a
disappointment.** The value is `personal/all` and the 152 other sections that declare a
`defaults:` map. **Rung 2 is the first buildable thing, the seed itself is under an hour because the
data is already published and parsed (§9.1), and its falsifier is the one that answers his
generality question directly: add a `defaults:` key to a new section, regenerate, and the seed
follows — with no code change.**

---

## 1. Evidence rule, and sizes

Every claim is **[OBS]** (a script I ran, output I read), **[REA]** (reasoned from something
labelled [OBS], stated as reasoning and never as measurement), **[REPO]** (a claim a document or
this repo makes that I did not reproduce), or **[UNVERIFIED]** (named, with the experiment that
would settle it). **Absence is never proven by a grep returning nothing** — §2.3, §5.3 and §9.1 are
the three places it mattered, and all three are enumerations. §9.1 in particular matches the raw
string `defaults` across `app/**` rather than the property access, because an AST scan that passed
its own positive control has already missed three call sites named as strings in this repository.

**A measurement that returns zero is a broken measurement until a positive control passes**
(`design-the-resolution-architecture.md:1406-1408`). §2.2 states this document's control and why it
was chosen before the sweep ran, not after.

Sizes: **h** = under an hour. **½** = half a day. **arc** = a sequence of steps with its own
planning artefact.

---

## 2. The rig, and the one measurement this document adds

### 2.1 The rig is the previous two documents' rig, unchanged, on a different gesture

`research-the-rule-closure.md` and `research-the-resolution-universe.md` both defined REACHED as
*the rule ids whose `(rule, node)` firings differ between a full rules pass at rest and a full rules
pass with one node perturbed* **[REPO]** (`research-the-rule-closure.md:108-112`;
`research-the-resolution-universe.md:108-111`). **Both simulated `status := done` only.** Both named
the capture gesture as unmeasured.

I kept the definition and changed the perturbation. **[OBS]**

* `state.db` **copied** to scratch and opened on the copy — **1,083,658,240 bytes**, never written,
  every pass wrapped in `BEGIN` and closed with `rollback()`. The real vault and the real db were
  never opened for write.
* The bundle is loaded from the operator's live config root
  (`apps/qntm-md/config`) through `_load_with_fallback` — the orchestrator's own loader.
  It yields **94 tier-1 rules, 0 shell rules, 252 patterns, 72 view sheets**. **[OBS]**
* The graph is rebuilt through `orchestrator._GraphFromDict` exactly as `run_cycle` does
  (`coordination/orchestrator.py:5393-5401`): **1,501 nodes, 460 edges**. Edge types: **PART_OF 417,
  WAITING_FOR 22, REQUIRES 17, UNLOCKS 4**; **585 of 1,501 nodes carry at least one edge**. **[OBS]**
* Node types: task 674, ticket 239, outcome 225, header 126, capability 94, principle 50, routine 45,
  sink 9, class 7, film 7, package 7, group 4, attribute 3, book 2, person 2, tv_show 2, writer 2,
  album 2, blog 1. **[OBS]**
* The pass is `qntm_rule_engine.execute` with the **real** `PatternResolver`, the **real**
  `build_dispatcher_registry` and the **real** `EventLogStore`, called the way
  `_run_rules_phase` calls it (`coordination/orchestrator.py:2011-2019`). **I did not reimplement
  the rule engine, the pattern engine or the predicate evaluator. I ran them.**
* At rest the pass fires **26 distinct rules over 288 `(rule, node)` pairs**. **[OBS]**

### 2.2 The positive control, chosen before the sweep ran

`inbox` reaching **zero** for a tick is the prior result. A capture returning zero would therefore
have been indistinguishable from a broken probe — the trap that cost this project an extractor that
returned 0 when the true answer was 103.

**So the control was fixed by READING, not by running.** `config/rules/stamp_created_at.yaml:13-22`
is `for_each: {pattern: tasks}` with `when: {eq: [$current.node.fields.created_at, null]}`. A
freshly minted task has `created_at` null by construction. **If the probe did not report
`stamp-created-at-on-task`, the probe was wrong.** It reported it on the first run. **[OBS]**

### 2.3 One thing the rig proves that changes how to read every trigger argument

**No tier-1 rule declares a trigger, and the trigger context is inert for all 94.** **[OBS]**
`_compile_runtime_rule_bundle` returns `rule_triggers: {}` and `shell_rule_metadata: []`; every one
of the 94 compiled rules carries no trigger attribute; `grep -rn '^\s*trigger:' config/rules/`
returns nothing across all 42 files. The orchestrator's `_rule_event_context`
(`coordination/orchestrator.py:1921-1956`) does set `task_added` when the apply phase added a task —
but **nothing consumes it at tier 1**.

**[REA] So the capture closure of 2 is not an artefact of which triggers I set. Every one of the 94
rules is evaluated on every pass, and 92 of them have nothing to say about a new line.** The
smallness is structural, not conditional.

Priority census over the 94: **`10`×1, `5`×1, `3`×1, `0`×76, `-1`×2, `-2`×1, `-4`×1, `-5`×2,
`-10`×1, `-20`×8`**. **[OBS]** **76 of 94 sit in one band.** §6 is about what that means.

---

## 3. Q1 — what pressing Enter on a new line actually reaches

### 3.1 In `inbox`: one rule of ninety-four

A bare capture under `inbox.md` mints a `task` — `inbox` declares no `default_node_type`, so
registration falls to the global rung (`config/views/default_registration.yaml:4`), and neither of
its two sections declares a `defaults:` map. **[OBS]** The node carries a title, `status: open`
(the schema's declared default, `config/schema.yaml:26-31`), and nothing else.

Run the pass twice — once on the graph as persisted, once on the same graph plus that node:

| | value |
|---|---|
| rules bound directly to the new node | **1** — `stamp-created-at-on-task` |
| `(rule, node)` pairs in B not in A, excluding the new node | **0** |
| `(rule, node)` pairs in A not in B | **0** |
| rules firing in B that never fire in A | **1** |

**[OBS]** every cell.

**[REA] `inbox` reaching one rule instead of zero is not a correction of the earlier result; it is
the same result seen from the gesture that actually happens there.** A tick in `inbox` reaches
nothing because there is nothing to complete. A capture reaches one thing because there is exactly
one thing the engine has to say about a new line: **when it was born.**

### 3.2 Across all 186 sections: two rules in the whole config

I minted, for every one of his 186 sections, the node that section's registration cascade would mint
— the section's `default_node_type` if it declares one (**none does**), else the view's, else the
global `task` — carrying the section's own `defaults:` map, and ran the same differenced pass.

| rules a capture reaches | sections | line |
|---|---|---|
| **0** | **54** | of which 38 could not mint at all — §3.4 |
| **1** | **119** | `stamp-created-at-on-task` |
| **2** | **13** | `routine-without-cadence-becomes-task` **then** `stamp-created-at-on-task` |

**Union across all 186 sections: 2 of 94 rules. Collateral change in all 186: zero.** **[OBS]**

Compare, from the same rig on a different gesture: **a tick reaches 29 of 94, up to 5 rules per
gesture, and changes up to 6 rows in one view** **[REPO]**
(`research-the-resolution-universe.md:26-27, 297-304, 336-351`).

**[REA] A capture is the smallest gesture in the system, and it is the one he wants to start with.
Those two facts are the same fact.** A new line has no history, no edges, no completion and no
neighbours; almost every rule in the config is a statement about a relationship the line does not
have yet.

### 3.3 The 13 sections where registration alone gives the wrong answer, and this is the finding

Seven views declare `default_node_type: routine` (`routines-personal`, `routines-work`,
`routines-admin`, `routines-life-admin`, `routines-program`, `routines-spirit`,
`routine-cascade-dojo`), spanning 13 sections. **[OBS]** A bare capture there mints a `routine` with
no cadence. And `config/rules/cadence_auto_routine.yaml:58-71` says:

```yaml
- id: routine-without-cadence-becomes-task
  for_each: {pattern: routines}
  when: {"null": [$current.node.fields.cadence]}
  actions:
    - verb: set_node_type
      node_id: $current.node.id
      node_type: task
```

The file's own header states the intent (`cadence_auto_routine.yaml:22-24`):

> *"A bare `#routine` with no cadence now renders back as `#task`, which is the system telling you
> plainly that it did not take."*

**[OBS] Both rules fire, in that order, in ONE pass.** The retype runs first; the node becomes a
`task`; `stamp-created-at-on-task`'s `tasks` pattern then binds it and stamps `created_at`. Neither
rule declares a `priority:`, so **both sit in band `0` with the other 74**, and the order that makes
this work is **the alphabetical position of `cadence_auto_routine.yaml` ahead of
`stamp_created_at.yaml` in `config/rules/`**.

**[REA] This is the single most important thing in this document for the design of rung 1.** A
mirror that publishes only registration would tell the operator "this is a routine" in 13 of his 186
sections, and the cycle would come back and say "no, it is a task". That is not a stale prediction —
it is a **confident, wrong** one, of exactly the kind
`design-local-behaviour-and-the-queue.md:468-470` warned about. **Rung 1 is not safe on its own. It
is safe only where rung 3 has nothing to add, and knowing where that is requires the measurement in
§3.2.**

**[REA] It also confirms `research-the-resolution-universe.md`'s refutation of the priority ceiling
(`RU:559-573`), on a second and independent gesture.** The cascade depth here is bounded by file
order inside one priority band, not by the ten-value priority ladder. On the capture gesture that
band contains 76 of 94 rules.

### 3.4 The 38 sections that could not mint, and what that says about generality

**38 of 186 sections declare a `defaults:` map naming a field the node type the registration cascade
would mint does not have.** **[OBS]** All 38 are in eight dev views — `qntm-capabilities`,
`qntm-classes`, `qntm-packages`, `qntm-principles` and their four `flowtrace-*` twins. None of the
eight declares `default_node_type`, so registration falls through to the global `task`; the sections
declare `cap_state` (12), `principle_state` (10), `class_state` (8), `package_state` (8) — fields
`task` does not declare. `graph.create_node` refuses:

> `ValidationError: Node type 'task' does not have field 'cap_state'`

**[REA] This is the operator's generality question, already live inside the engine, and the engine's
answer is the right one: it refuses loudly rather than dropping the default silently.** The
resolution cascade (`io/applier.py:4051-4162`) merges the section layer without consulting the node
type, and the create sink then rejects the result. Nothing anywhere filters the field away.

**[UNVERIFIED]** I measured that `graph.create_node` raises on that field set. I did **not** drive a
real cycle over a synthetic line under one of those eight headings, so I cannot say whether the
applier reaches that call or short-circuits earlier into a needs-attention diagnostic. **Settled by**
adding a line under `## Unscoped` in a copy of `dev/qntm/capabilities.md` in a sandbox
(`qntm-md sandbox-from-real`) and running one cycle against the sandbox. Either outcome supports the
design point below; only the operator-facing wording changes.

**[REA] Whatever the engine does there, the mirror must do the same KIND of thing: name the
conflict, never absorb it.** A browser that helpfully dropped `cap_state` because `task` cannot hold
it would be inventing a resolution the operator never declared — and would then disagree with the
engine on 38 of his 186 sections while looking perfectly confident.

---

## 4. The ladder, priced rung by rung

His three examples are a deliberate order. This section prices each rung on its own terms: what the
grammar contains, what it costs, what proves it agrees with the engine, and — the question the
acceptance test turns on — **whether a NEW config entry of that kind flows through with no code
change.**

### 4.1 Rung 1 — registration: "it gets stamped `task`"

**What it is.** Which node type a new line becomes. Cascade: section `default_node_type` → view
`default_node_type` → `views/default_registration.yaml`'s `default_node_type`.

**What it ranges over.** **[OBS]** **0 of 186 sections** declare a section-level
`default_node_type`. **16 of 72 views** declare a view-level one (task 56 after the global cascade,
routine 7, and one each of album, blog, book, attribute, film, group, person, tv_show, writer).
So the whole of registration, for the operator's entire config, is **one global scalar plus sixteen
view overrides.**

**Grammar.** `{defaultNodeType: string, views: {<viewId>: string}}`. **[REA]** Under 400 bytes.

**Already shipped, and already CONSUMED.** `presentation.json`'s `qualification` key carries
`defaultNodeType` and a per-section `nodeType`; `resolution.registration` carries
`{defaultNodeType: "task", baseNodeType: "task", …}` and `resolution.chromeShapes` covers 11 node
types. **[OBS]** And `newline.ts:217-226` already reads all of it on every Enter — to decide whether
the new line opens `- [ ] ` or `- `.

**[REA] So rung 1 is not "build a mirror". It is "say the word you already looked up."** The app
resolves `task` on every keystroke and then throws the name away, keeping only the checkbox. His
sentence — *"it gets stamped task"* — is one variable away.

**What proves agreement.** Nothing new for the cascade itself — the generator reads the same two
files the loader reads, and `tests/present-resolution.test.mjs` already sweeps `chromeShapes`
against the schema. **What is NOT proven, and must be: that the answer survives the rule pass.**
§3.3 shows it does not, in 13 of 186 sections.

**Generality.** **Full for the view rung.** A new view with a new `default_node_type` is picked up by
regeneration with no code change. A **section**-level `default_node_type` would not be — and the app
has already written that gap down itself (`newline.ts:87-97`, §9.5), correctly, in a comment rather
than in the `refused` map. Cost to close: one generator line plus a test. **h.**

**Cost: h.** **Falsifier:** add `default_node_type: outcome` to one section of a scratch view,
regenerate, and the app's stamp for a line under that heading reads `outcome`. If it reads the
view's type instead, rung 1 is section-blind and says so in the `refused` map rather than answering.

### 4.2 Rung 2 — defaults: "`task` AND `personal`" — the first buildable thing

**What it is.** `personal/all.md`, his own second example, is one section:

```yaml
all-personal:
  domain: personal
  path: personal/all.md
  sections:
    - id: tasks
      qualification: all-personal-nodes
      name: "All Personal"
      defaults:
        domain: personal
```

**[OBS]** (`config/views/all-personal.yaml`). A capture there mints `task` **and** `domain: personal`
— exactly what he described.

**What it ranges over.** **[OBS]** **153 of 186 sections declare a `defaults:` map**, over **8
distinct fields**: `domain` **153**, `project` **60**, `cap_state` 12, `principle_state` 10,
`stage` 9, `class_state` 8, `package_state` 8, `god_box` 2. **`global_defaults.yaml` is empty
(`defaults: {}`) and `node_defaults_cascade` is unset**, so today the cascade has exactly two live
rungs for a bare line: SECTION and VIEW.

**Grammar.** A flat `{<viewId>: {<sectionId>: {<field>: <scalar>}}}`. Every one of the 153 maps is
scalars only — `generate-qualification-declaration.mjs` already refuses a non-scalar section default
by raising rather than guessing, and it has never raised. **[REA] Size: the qualification key
already publishes `defaults` for the sections whose qualification survived normalisation. Extending
it to all 186 sections is bounded by the per-view slice `research-the-resolution-universe.md` §6.1
measured at 454–1,930 bytes, median 685** **[REPO]**.

**THE GAP, and it is precisely his case — now enumerated.** `membership.ts` reads section defaults to
decide whether a line still BELONGS. **Deciding belonging is not the same as APPLYING the default to
the seed. [OBS] Nothing in `app/` applies it to the seed. §9.1 is the full enumeration: 22
occurrences of the string `defaults` across `app/**`, exactly one of which applies the map, and it
builds a hypothetical field set for a predicate that can only become a sentence.** 41 of the 49
published sections carry a `defaults` map and not one of them ever reaches a line the operator types.

**[REA] That makes rung 2 cheaper than it looks and more valuable than it looks at the same time.**
The data is published, parsed, validated and in memory; the seed function was scoped to chrome and
says so at `newline.ts:113`. **Revise the cost: `h` for the seed itself, `½` for the whole rung
including its agreement test and its refusal wording.**

**What proves agreement.** The worked precedent is exact and it already exists.
`scripts/qualification-agreement.py` + `tests/qualification-agreement.test.mjs` prove the published
predicate against the engine's own matcher over the real config. **The defaults equivalent is
strictly easier**, because a default is not a predicate — it is a lookup. The agreement test is:
for every (view, section) the declaration publishes, the seed the browser computes equals the field
map `_merge_registration_defaults` produces for a bare candidate in that section. **That comparison
is total — 186 cases, no sampling — and it needs no graph.**

**Generality: full, and this is the rung that demonstrates it.** A new `defaults:` key in a new
section is picked up by regeneration with no code change, because the generator iterates
`views/*.yaml` and copies whatever scalars it finds under `defaults:`. A new *field* needs no code
either — the grammar is `{field: scalar}`, not an enumeration of eight known fields.

**Cost: ½.** **Falsifier:** add `defaults: {priority: high}` to a scratch section, regenerate, and a
line typed under that heading is seeded `high` with no code change. **And the negative arm, which
matters more:** point a section's `defaults:` at a field the registered node type cannot hold (§3.4)
and the app must **say so**, not drop it.

### 4.3 Rung 3 — the rule pass: "complete events like unlocks"

**What it is.** The engine's own priority-ordered pass. On a capture it has **two rules** (§3.2). On
a completion it has up to **five** and reaches **29 of 94** **[REPO]**.

**What can be compiled.** **[REPO]** 15 of the 21 rules a tick reaches need only the node, its
one-hop edges and a clock — all three of which are in the payload today (the graph is 805 KB,
1,501 nodes, 460 edges, and `app/present/today.ts` agrees with the engine's boundary). **6 are
whole-graph aggregates** and **0 read the event log**.

**What cannot.** §5.

**Cost: an arc.** **[REA] And on the capture gesture it buys two rules — one of which (§3.3) is
load-bearing and one of which (`created_at`) is invisible to the operator, because `created_at` is
not rendered on a fresh line.** So the honest statement of rung 3's value is: **it is not for
captures. It is for ticks.** He is right to put it third and right to say inbox comes first.

---

## 5. Q3 — what genuinely cannot be mirrored

He said the id is the only thing. **Three of the four candidates dissolve, and the one that survives
is not the one he named.**

### 5.1 The minted `[[qntm:N]]` — computable, not allocatable. **Dissolves as stated.**

`next_qntm_id` is `max(qntm_id) + 1` scanned over every node in the graph
(`identity/mint.py:39-57`). **[OBS]** In the current graph: **1,501 of 1,501 nodes carry a
`qntm_id`; the max is 2351; the next mint is 2352; and the id space has 850 gaps in `[1, 2351]`**
(so it is a high-water mark, not a count).

The whole graph blob — `{version, nodes, edges}`, every node with its full field map including
`qntm_id` — is what `graph-sync.mjs:464` reads and ships. **So the browser can compute 2352 today,
with three lines of JavaScript.** **[OBS]**

**[REA] The objection is not computability. It is that a computed id is a CLAIM about a namespace
the browser does not own.** Two tabs, or one tab and one laptop cycle, both compute 2352 and both
are right about the snapshot and wrong about the world. And the id is the one field where being
wrong is unrecoverable, because `[[qntm:N]]` is what every link-back resolves through.

**[REA] The dissolution is to stop needing it.** Everything on rungs 1 and 2 is a statement about
what KIND of thing this line is — `task`, `personal` — and none of it needs the line to have a name.
The identity question is already solved on the other side: the stamp arrives with the projection,
and the sibling agent on `feat/stamp-rendition` is landing exactly that. **The id is not the thing
the mirror cannot do. It is the thing the mirror does not have to do.**

### 5.2 The six whole-graph aggregates — real, and they stay real

**[REPO]** `coverage-overall/personal/work` and `age-of-intent-overall/personal/work` bind a header
carrier alongside **every open task in the graph**
(`research-the-rule-closure.md:439, 445-455`).

**[REA] The graph being on the wire does make these COMPUTABLE — 1,501 nodes is nothing to iterate
in a browser.** The objection is not cost. It is that all six write `par`, and `par` is one of
exactly **two** vocabulary markers carrying `render_only: true`
(`config/vocabulary/markers.yaml:18`) **[REPO]**. A `render_only` marker is one the engine
deliberately refuses to read back from the source. **[REA] So a browser-computed `par` is the only
class of value in this system that could be displayed without any risk of `INPUT WINS` biting — and
it is also the class the operator has the least use for on a capture, because a capture does not
move a coverage ratio.** They are real, they are excluded, and excluding them costs nothing on rungs
1–3.

### 5.3 Anything reading the event log — **dissolves for this gesture**

**[REPO]** 20 of 94 rules read the event log; **0 of the 21 rules a tick reaches do**. **[OBS] 0 of
the 2 rules a capture reaches do** — `stamp-created-at-on-task` reads `created_at` and the clock;
`routine-without-cadence-becomes-task` reads `cadence`. The event log is not on the wire and does
not need to be.

### 5.4 The within-band file order — **real, and this document adds a second sighting**

**[REPO]** `research-the-resolution-universe.md:559-573` found the unlock cascade is six rules at one
priority, sequenced by their position in a file, "a number no config validator checks".

**[OBS] The capture gesture has the same shape.** §3.3's two-rule chain works because
`cadence_auto_routine.yaml` sorts before `stamp_created_at.yaml`, and **76 of 94 rules share that
one priority band.**

**[REA] This is the thing that genuinely cannot be mirrored, and it is not an aggregate or an id —
it is an ORDER that the config does not declare.** A generator can read priorities. It cannot read
"whatever order the loader happened to walk the directory in" and publish it as meaning, because
that is not meaning; it is an accident that currently produces the right answer. **The honest
mirror publishes the two rules and refuses the ORDER**, which means it can say "this will become a
task" only if it can also say why — and for that, the retype must be expressed as something other
than a race between two files.

---

## 6. Q4 — how many steps, and what bounds them

He proposed limiting the number of rule steps. **For the capture gesture the answer is: two, and the
bound is not a choice.**

**[OBS]** Across all 186 sections, the longest chain a capture produces is **two links**:
`routine-without-cadence-becomes-task` writes `node_type`; `stamp-created-at-on-task` reads it
through its `for_each` pattern. No third link exists, because after the retype the node is an
ordinary task with `created_at` stamped and nothing else true about it.

**[REPO]** For a tick: two levels captures 90 % (19 of 21), four is the honest cut, and the ceiling
argued from the ten-value priority ladder was **refuted** by the six-rule single-band unlock cascade.

**[REA] So a step limit is the wrong control.** A limit of 2 is correct for captures and short by two
for routine completions; a limit of 4 is correct for both and does nothing to bound the unlock
cascade, which is six rules deep inside ONE step of the priority ladder. The number that bounds a
pass is the number of rules in the largest priority band — **76** — and no configured limit makes
that smaller.

**[REA] The control that does work is the one this document's measurement suggests: bound by
GESTURE, not by depth.** A capture is a two-rule, two-link, zero-collateral event in every one of his
186 sections. That is not a limit anyone has to impose; it is a fact about what a new line is. Ship
the capture mirror against the measured closure and the depth question does not arise. It arises
again at rung 3, on ticks, and it should be answered there with the six whole-graph aggregates
excluded — not with a step counter.

---

## 7. Q5 — the smallest slice that makes `inbox` feel instant, and whether one exists

### 7.1 The honest answer: `inbox` needs almost none of this

Four facts, and they compound. **[OBS]** unless marked.

1. `inbox` declares **no** `default_node_type` — a capture is a `task` by the global rung.
2. `inbox`'s two sections declare **no** `defaults:` map — so rung 2 has nothing to add there.
3. `inbox` declares **no** `ordering:` — placement is print order **[REPO]**.
4. A bare capture matches `domain-empty` and stays there **[REPO]** — no re-placement.
5. The capture reaches **one** rule, and it writes `created_at`, which does not render on the line.

**[REA] So the only visible change on return from a cycle, for a capture in `inbox`, is the stamp —
and the stamp is what the sibling agent on `feat/stamp-rendition` is landing right now.** After that
lands, **a rule mirror has nothing left to do in `inbox`.** Not "little" — nothing that the operator
can see.

**[REA] That is the most useful thing in this document for him, and it is not a disappointment.** It
is the same finding `research-the-rule-closure.md:322-326` reached from the tick side, arriving again
from the capture side: *the view he always starts with is the view where local computation has the
least to do, because nothing is derived there.* An inbox that computes nothing is an inbox behaving
correctly.

### 7.2 So the slice is `personal/all`, not `inbox` — and he named it himself

His second example is the first buildable one. **The slice:**

> **Publish `{viewId: {sectionId: {field: scalar}}}` for all 186 sections, and have the new-line seed
> apply it. 153 sections gain a visible answer. `personal/all` says `task` and `personal` the instant
> Enter is pressed.**

**Size: `h` for the seed, `½` with its agreement test.** **Falsifier, in one line:** add
`defaults: {priority: high}` to a section that has none, regenerate, type a line under that heading,
and it is seeded `high` — with **no code change**. If it is not, the rung is wired to the eight
fields it happened to see and fails the acceptance test. **The negative arm matters as much:** point
a section's `defaults:` at a field its registered node type cannot hold (§3.4) and the app must say
so rather than absorb it.

### 7.3 What `inbox` still gets, for free, from rung 1

The stamp. **[REA]** And one thing worth naming: because `inbox` is one of the 173 sections where
registration and the rule pass **agree** (it is not one of the 13), rung 1 is safe there
unconditionally. That is a fact the measurement in §3.2 provides and that no amount of reading the
config would give you.

---

## 8. Q6 — the divergence discipline, and whether it scales from a predicate to a pass

Two evaluators must agree and the failure is silent. Three shipped grammars each carry an agreement
test. The question is whether that shape survives the move from a predicate to a rule pass.

### 8.1 What the shipped tests prove, and why the shape works

A predicate agreement test works because the comparison is **total and static**: for every
(pattern, node) pair, does the published predicate say what `qntm_graph`'s matcher says? The input
set is enumerable, the output is a boolean, and the engine's answer is obtained by **calling the
engine** — `qntm_graph.patterns.engine.matches_pattern`
(`scripts/qualification-agreement.py:55, 130, 187`). The qualification work proved its grammar over
**61 real triples covering 1,501 nodes plus 2,184 probe triples, zero disagreements** **[OBS]**.

**The load-bearing move is not the sweep. It is one refusal gate**
(`scripts/qualification-agreement.py:130-138`):

```python
verdicts = {matches_pattern(graph, node_id, name).matched for node_id in node_ids}
if len(verdicts) != 1:
    print(f"REFUSING: pattern {name!r} answers differently for nodes sharing the triple "
          f"{triple} — it depends on something outside {list(TRIPLE_FIELDS)}, so the "
          "browser cannot decide it from a line's fields alone")
    return 2
```

**[REA] That gate is what converts a sample into a complete truth table over everything the browser
can distinguish.** It is the reason the qualification grammar can claim agreement rather than
correlation, and it is the part that has to survive any port to the rule pass.

**[OBS] All three agreement tests run in CI unconditionally**, because they consume a committed
fixture (`tests/fixtures/qualification-agreement.json`, 34,703 B) and `dist/present.js`, and touch
neither Python nor the monorepo.

### 8.2 It scales to rungs 1 and 2 unchanged, and BETTER

**[REA]** A registration answer and a defaults seed are **lookups, not predicates**. The comparison
is `for every one of 186 sections, does the browser's seed equal the field map
`_merge_registration_defaults` produces?` — total, 186 cases, no sampling, no graph, no clock. That
is a *weaker* test to write than the qualification one and a *stronger* one to hold, because there
is no node to quantify over.

### 8.3 It does NOT scale to the pass, and `design-local-behaviour-and-the-queue.md` was right about
why

`design-local-behaviour-and-the-queue.md:454-463` refused a rule replay on the ground that its
equivalent is *"not a golden test but a conformance suite against a moving target — one that would
have to re-run per cycle to mean anything, on data that is not in this repository."* **[REPO]**

**[REA] That objection is correct for a general rule replay and WRONG for the capture gesture,
and the difference is measurable rather than arguable.** A pass's input is a graph that changes every
cycle — but a **capture's** input is a node that does not exist yet, whose entire field map is
determined by config, and whose closure this document measured at **two rules with zero collateral in
all 186 sections**. The moving target has been held still by the gesture, not by an assumption.

**So the conformance shape for rung 3-restricted-to-captures is constructible:** for every one of
the 186 sections, mint the section's own capture and assert the browser's predicted post-pass state
equals the engine's. **That is `scripts/qualification-agreement.py`'s shape with `sweep.py`'s
generator in place of the node enumerator** — and it is exactly the script this document ran. The
key is `(view, section)`, which is 186 values and complete by construction, so §8.1's refusal gate
is satisfied trivially rather than argued. **Cost: h**, because the probe exists; making it a test
is packaging.

**[REA] What still does not scale is rung 3 for TICKS**, and the reason is the gate, not the effort.
A rule pass's answer is not a function of a small enumerable key: it is a function of the graph, plus
prior rule effects, plus the clock. **§8.1's `len(verdicts) != 1` check — the exact assertion that
certifies "complete input" — would fire on the first rule that reads an edge**, and the generator's
own census says 27 of 159 qualifications traverse and 8 are clock-dependent
(`generate-qualification-declaration.mjs:18-22`). The harness transfers. **The completeness argument
does not.** `design-local-behaviour-and-the-queue.md`'s refusal stands there and should not be
reopened by this document.

### 8.4 The refusal must be VISIBLE, and that is the acceptance test

The three outcomes when the operator writes config the mirror cannot handle:

| outcome | verdict |
|---|---|
| picks it up | **generalised** |
| refuses it visibly | **honest and incomplete — acceptable, and must be named** |
| silently ignores it | **the dangerous one** |

**[REA] The qualification generator's `refused` map is the shipped precedent for the middle row, and
its posture is the right one: a pattern is published only when the WHOLE of it normalises, and
anything else is recorded WITH ITS REASON.** Its own header states the rule: *"a section the browser
cannot decide is a section the browser says nothing about."*

**But "the app says nothing" is only honest if the operator can tell the difference between 'nothing
to say' and 'refused to say'. [OBS] Today he cannot.** §9.2: `refused` is parsed and never read
(`qualification.ts:131-132`, *"Never read to decide anything"*); `membershipFor` abstains with a
reason and the caller discards it; an abstention and an all-is-well produce **byte-identical output**
(`app/index.html:2035-2041, 2205-2206`). **116 refusals with reasons ship to the browser and reach
DevTools, not the operator.**

**[OBS] And one class of config change is dropped with no record at all** — a vocabulary token on a
field outside the three resolvable ones (`generate-qualification-declaration.mjs:396`, §9.3).

**[REA] So the honest scoring of the shipped state against his own three outcomes is: two of the
three rows are already live, and the dangerous one is live too, in one line.** Fixing it is `h` and
it belongs ahead of every rung on the ladder, because it is the mechanism the acceptance test rests
on. A mirror built on a generator that can silently drop a declaration is a mirror whose generality
cannot be checked, however well the rungs are measured.

---

## 9. The shipped app layer, enumerated — and the two holes that matter more than the closure count

### 9.1 Nothing applies a section `defaults:` map to the line as it is typed. Proved by enumeration.

`seedFor` (`app/present/newline.ts:158-227`) returns exactly two properties or `null`:

```ts
export interface NewLine {
  readonly text: string;              // newline.ts:137 — the line's OPENING CHARACTERS
  readonly level: PresentationLevel;  // newline.ts:140 — which rung answered
}
```

`text` is **chrome only** — `- [ ] ` or `- `. The GLOBAL rung is the only one that reads the
declaration, and it reads it for one purpose (`newline.ts:217-226`): resolve the section, take its
`nodeType`, look up `chromeShapes[nodeType]`, and emit a box or a bullet. `openLine`
(`newline.ts:259-274`) adds one further datum — the row's `place`, an instance anchor
(`app/present/draft.ts:152-159, 236-239`). **That is the complete seeded state. No domain, no tags,
no node-type field, no status beyond the glyph.**

**[OBS] Every occurrence of the string `defaults` in `app/**` — `grep -rn "defaults" app/` returns
25, matched as a raw string and not as a property access, so a string-literal reference could not
hide.** They divide into: prose in module headers; the strict reader's shape validation
(`qualification.ts:343-357`); a known-key allowlist that names `"defaults"` as a **string literal**
(`qualification.ts:153`); the store (`:373`); two type declarations; and three uses of the English
word in unrelated comments (`motions.ts:370`, `word.ts:51`, `indent.ts:116`). **Exactly ONE applies
the map**, and it is `app/present/membership.ts:186-188`:

```ts
const fields: Record<string, FieldValue> = { node_type: section.nodeType, domain: null };
for (const [field, value] of Object.entries(section.defaults ?? {})) fields[field] = value;
fields["status"] = status;
```

That builds a **hypothetical** field map, in memory, to evaluate a predicate. Its one caller is
`membershipFor` (`membership.ts:224`), whose module header says the boundary out loud
(`membership.ts:50-56`): *"It produces no `Contribution` and no `SourceEdit`… the answer's only
destination is something shown to the operator."*

**[OBS] 41 of the 49 published sections carry a `defaults` map. Not one of them is ever written into
a line the operator types.** `newline.ts:113` names the exclusion deliberately: *"this module does
not need predicates, `defaults:`, ordering or the day boundary."*

**[REA] So rung 2 is not a new generator key at all — the data is published, parsed, validated and
in memory. It is a ~10-line consumer change in one function, and the reason it has not happened is
that `newline.ts` was scoped to chrome and said so.** That makes rung 2 cheaper than §4.2 priced it.
**Revise: h, not ½** — with the ½ going to the agreement test and the refusal wording, not the seed.

### 9.2 A refused section is refused SILENTLY in the running app. This is the dangerous row.

The coordinator asked whether a refused pattern is refused visibly or silently. **[OBS] It is
silent, at four independent layers, and three of them say so in their own comments.**

1. **The generator drops the section.** `generate-qualification-declaration.mjs:448-458`: *"the app
   must not hold a section id it can say nothing about, because a present-but-empty entry is
   indistinguishable from a decidable one that happened to match nothing."*
2. **`membershipFor` abstains** with a reason: `abstains("no-section-declaration")`
   (`membership.ts:210-212`). Its header states the scale unprompted (`membership.ts:27-30`): *"the
   app is silent about every one of them."*
3. **The caller discards the reason.** `app/index.html:2035-2041` returns `""` when either answer is
   not an `"answer"`, and `""` is filtered out of the freshness line
   (`app/index.html:2205-2206`). **An abstention and a "belongs → still belongs, all fine" produce
   byte-identical output.**
4. **`refused` is parsed and never consulted.** `app/present/qualification.ts:131-132` declares it
   `/** pattern name -> why nothing was published for it. Never read to decide anything. */`, and
   the only three occurrences of `.refused` in `app/**` are the reader validating its shape
   (`qualification.ts:441, 447, 518`). **~116 refusal reasons ship in 23,872 bytes and the operator
   can reach them only through DevTools.**

**[OBS] Coverage: 43 patterns published, 116 refused; 49 of 186 sections, across 27 of 72 views —
26.3 %.** The refusal reasons are dominated not by traversal but by field reach: **73 of the 116 are
`unresolvable field(s)`** (title 21, project 13, `cap_state+project` 12, `principle_state+project`
10, `class_state+project` 8, `package_state+project` 8, stage 6, god_box 2, priority 1), against
**27 traversal** and **8 clock/comparison**.

**[OBS] Tests assert the silence is intended.** `tests/present-qualification.test.mjs:329-345`
mutates `domain_empty.yaml` to traverse an edge, regenerates, and asserts the section is
`undefined` and `because === "no-section-declaration"`. `tests/app-membership-note.test.mjs:272` is
named *'ABSTENTION 1/5 — "no-section-declaration": an unpublished section says nothing'*. **There is
no test anywhere that asserts a refusal is surfaced to the operator.** The one test in that
direction — `tests/present-qualification.test.mjs:92-103`, *"what was refused is recorded with a
reason, not dropped in silence"* — proves the **artefact** records reasons. It proves nothing about
the operator ever seeing one.

**[REA] So against his three outcomes, the shipped state is: honest to a reader of
`presentation.json`, silent to the operator at the keyboard.** That is not the dangerous row yet,
because the app abstains rather than answering wrongly. But it is one step from it, and the step is
§9.3.

### 9.3 One class of new config is dropped with NO record at all — the genuinely dangerous row

**[OBS]** `generate-qualification-declaration.mjs:396`:

```js
if (typeof entry.field !== "string" || !RESOLVABLE_FIELDS.includes(entry.field)) continue;
```

A vocabulary token that sets a field outside `["node_type", "domain", "status"]` is **skipped with
no `refused` entry, no warning and no exit code**. If the operator declares `#p1 → priority: high`
tomorrow, it vanishes from the published grammar and **nothing anywhere says so.**

**[REA] This is exactly the outcome he said must not happen, it exists today, and it is one line to
fix.** The generator has a `refused` map already; the token loop simply does not use it. Every other
refusal in that file carries a reason. **h**, and it should go in ahead of anything on the ladder,
because it is the mechanism the whole acceptance test rests on.

### 9.4 The falsifiers exist and do not run

**[OBS] All three generators have a `--check` mode that exits 1 when the declaration is stale
(`generate-qualification-declaration.mjs:498-505` and its two twins). None of the three is wired
into CI** — `grep -rn "generate:qualification\|generate:structural\|generate:resolution" .github/`
returns nothing; `build.yml` runs typecheck → build → `npm test` → a git-diff gate on `demo/` and
`dist/` only.

**[OBS] There ARE staleness tests, and they self-skip exactly where staleness matters.**
`tests/present-qualification.test.mjs:259-271` asserts `SERVED.qualification` equals
`generateQualification(DEFAULT_CONFIG_DIR)` — guarded by
`existsSync(DEFAULT_CONFIG_DIR) ? false : "monorepo not checked out"`. CI does not clone the
monorepo, so the check is skipped in CI and green on the operator's laptop only.

**[REA] So the answer to "how do we know it is generalised" is, today: we know on his laptop, if he
runs the script.** The three agreement tests DO run in CI unconditionally — they consume committed
fixtures — but a stale declaration and a stale fixture go stale **together**, so all three stay
green while both are wrong. **[REA] That is not a defect in the agreement idea; it is a missing wire.
Moving three `--check` invocations into `build.yml` is `h` and it converts the whole acceptance test
from a convention into a gate.**

### 9.5 The one gap the app has already named for itself

`newline.ts:87-97` states, unprompted, that **nothing in the 73 view sheets uses a section-level
`default_node_type:` today** — which §4.1 measured independently as 0 of 186 — and that *"if one
ever does, a new line in a silent section could take the shape of a section that resolved
differently."* **[REA] That is the acceptance test's middle row done correctly in prose and not yet
in code: a known refusal, named at the site, with the consequence spelled out.** Making it a
`refused` entry rather than a comment is part of the same `h` as §9.3.

### 9.6 Sizes, for the record

**[OBS]** `presentation.json` is **47,676 bytes** on disk. Serialised per key: `qualification`
**23,872**, `note` 1,887, `resolution` **1,574**, `structural` 720, and five scalars. It is
**baked into the bundle** (`EMBEDDED_DECLARATION`, `app/index.html:1001-1006`), not fetched. The
`resolution` key already carries `registration {defaultNodeType: "task", baseNodeType: "task",
inputGrammar: "tolerant", defaultTags: []}`, a `dayBoundary`, `chromeShapes` for 11 node types,
`ordering` for 9 sections and 3 `orderingFields`.

**[REA] Three closed grammars cost 26 KB serialised, against 805 KB of graph already on the wire.
The payload objection to a fourth is not an objection.**

---

## 10. The argument against the tempting answer

**The tempting answer is: ship the rule engine.** He asked it directly, and the ingredients really
are present — the graph is on the wire, the clock landed, `INPUT WINS` only fires on a write, and
generate-once has now answered the second-interpreter objection three times in shipped code.

**[REA] The argument against it is not that it is unsafe. It is that it is not what he wants, and
the measurement is what shows the difference.**

His three examples are `task`, `task + personal`, and unlocks. **The first two do not involve the
rule engine at all.** They are the CONFIG cascade — registration and defaults — two of the twelve
kinds of resolution, both already classified as decidable from config alone **[REPO]**. Shipping the
rule engine to deliver them would be building the hardest available machine to answer the two easiest
available questions.

And the third example, unlocks, is the one gesture the previous documents refused, for reasons that
this document confirms rather than weakens: six whole-graph aggregates, a six-deep transitive walk,
and a load-bearing file order.

**[REA] The right reading of his instinct is not "ship the engine" but "stop hand-wiring
resolutions".** He said it himself: *"it shouldn't be specifically wired to any resolution, but
should work for any new config the user puts in."* That is a statement about the GENERATOR, not
about the evaluator. The generator already works that way for qualification and structure. Extending
it to registration and defaults makes two more kinds general. **Shipping a rule interpreter would
make one kind general and eleven kinds no more general than they are today.**

**The counter-argument to my own position:** if rungs 1 and 2 ship and rung 3 never does, then in 13
of 186 sections the app confidently says `routine` and the engine says `task`. **[REA] That is a real
cost and it is the reason §11's order puts the retype rule ahead of the general rule pass.** Two
rules is not "the rule engine". It is two rules, and they are the two the measurement found.

---

## 11. The ranked order

Ranked by value per unit of cost. **Every row leaves the app better than the row before it and does
not require the next one to be correct.**

| # | row | size | ships what | why here |
|---|---|---|---|---|
| 0 | **close the silent-drop path in the token loop** | **h** | one `refused` entry instead of a `continue` (`generate-qualification-declaration.mjs:396`) | **Before any rung.** §9.3. It is the one place his acceptance test fails outright today, and every row below is only checkable once it is shut |
| 1 | **move the three `--check` invocations into `build.yml`** | **h** | a build that fails when the declaration is stale | §9.4. The falsifiers already exist and do not run; the tests that would catch it self-skip in CI |
| 2 | **say the node type on a new line** | **h** | the app already resolves it to pick the chrome; keep the name | His example 1, and `inbox`'s entire available behaviour. Safe in 173 of 186 sections |
| 3 | **apply the section `defaults:` map to the seed** | **h** (seed) / **½** (with its test) | 153 of 186 sections, 8 fields; `personal/all` says `personal` | His example 2. §9.1 shows the data is already published, parsed and in memory — the seed function was scoped to chrome and says so |
| 4 | **publish the two capture rules, and their order, as a closed grammar** | **½** | `routine-without-cadence-becomes-task` + `stamp-created-at-on-task` | Without it, rows 2–3 are **confidently wrong** in 13 of 186 sections (§3.3). This is the smallest possible rule mirror: 2 of 94 rules |
| 5 | **the capture agreement test — all 186 sections, no sampling** | **h** | `sweep.py` as a committed test with a generated fixture | Makes rows 2–4 falsifiable against the engine forever. The key is `(view, section)` — complete by construction, so §8.1's refusal gate is satisfied rather than argued |
| 6 | **make refusal visible where a section is undecidable** | **h** | read the `because` the app already computes and discards | §9.2. This is what separates "honest and incomplete" from "silently ignores it", and 137 of 186 sections are currently in it |
| 7 | **rung 3 for ticks — the unlock family** | **an arc** | 29 of 94 rules, minus 6 aggregates | **Still refused as a general evaluator.** If it is ever done, it is a per-gesture closure with a conformance suite, not an interpreter |

---

## What I refuted, including the coordinator, in both directions

**1. "`inbox` reaches zero rules."** **Refuted for the gesture that matters.** Zero was measured for a
tick. A capture in `inbox` reaches **one** — `stamp-created-at-on-task` **[OBS]**. The correction is
real but small, and it does not change the conclusion drawn from zero: `inbox` is calm because
nothing is derived there.

**2. "The browser must not hold a second copy of the language."** **Upheld, and this document does
not challenge it.** Every rung above is generate-once. Nothing proposed here interprets config in
the browser.

**3. "A browser-side rule evaluator is refused on two independent grounds."** **Half-refuted, and
narrowly.** The conformance-suite objection (`LB:454-463`) is correct for a general rule replay and
**does not hold for the capture gesture**, because a capture's closure is 2 rules with zero
collateral across all 186 sections — a target that does not move (§8.3). The `INPUT WINS` objection
is untouched and does not apply, because nothing on rungs 1–3 reaches a POST body.

**4. "The id is the only thing we can't do in the browser."** **Refuted.** The id is *computable*
today — `max(qntm_id) + 1` over a graph already on the wire, currently 2352 **[OBS]**. It is
*unallocatable*, which is a smaller objection and one that dissolves entirely because rungs 1 and 2
never need to name the node. **What actually cannot be mirrored is the within-band file order
(§5.4)**, which he did not name and which this document sights on a second gesture.

**5. My own §4.1.** Rung 1 is **not** free and safe. It is free, and safe in 173 of 186 sections. The
13 exceptions are the routine views, and they are the reason row 3 exists.

**6. "Limit the number of rule steps."** **Refuted as a control.** The capture chain is two links and
needs no limit; the tick cascade is six rules inside ONE priority band and no step limit reaches it.
Bound by gesture, not by depth (§6).

**7. "A refused pattern is refused visibly — that is what the `refused` map is for."** **Refuted.**
The `refused` map is honest and it has **no reader in the running app** — the field is declared
*"Never read to decide anything"* (`qualification.ts:131-132`), the abstention's reason is computed
and discarded (`app/index.html:2035-2041`), and an abstention is byte-identical to an all-is-well.
**[OBS]** Two shipped tests assert that silence is the intended behaviour. The honesty is real and it
lives in the artefact, not in the UI, and **137 of 186 sections are currently inside it.**

**8. "The generators are general — a new config entry flows through."** **Refuted in one place, and
it is the place that matters.** A vocabulary token on a fourth field is dropped by
`generate-qualification-declaration.mjs:396` with no `refused` entry, no warning and no exit code
**[OBS]** — the exact outcome he named as unacceptable. Everything else in the four generators
either flows through or refuses with a reason.

**9. My own §4.2's cost.** I priced rung 2 at `½` on the assumption that it needed a new generator
key. **[OBS] The enumeration says the data is already published, parsed, validated and in memory,
and one function ignores it by design.** The seed itself is `h`.

---

## What is unverified, and what would settle it

* **[UNVERIFIED] Whether a real cycle over a line under one of the 38 conflicted sections raises,
  or diagnoses, or silently drops the default.** I measured that `graph.create_node` refuses the
  field set; I did not drive the applier. **Settled by** one cycle in a `qntm-md sandbox-from-real`
  sandbox with a synthetic line under `## Unscoped` in `dev/qntm/capabilities.md`. **[REA]** The
  design point holds either way; only the operator-facing wording changes.

* **[UNVERIFIED] The graph copy's date.** `state.db` was copied on 2026-08-01 from the live path, but
  the graph blob's own `updated` stamp was not read in this rig. Every section count is a property of
  the CONFIG (which is current) and is unaffected; the rest-pass baseline of 26 rules / 288 pairs is a
  property of the graph and would move. **Settled by** reading the `graph_state` row's timestamp,
  which is one query.

* **[UNVERIFIED] The capture I minted is a bare line with a title only.** A capture carrying a
  vocabulary token (`#work`, a `📅` marker) resolves more fields at parse time and could reach more
  rules. **Settled by** re-running `sweep.py` with each of the 91 field-setting vocabulary tokens
  applied in turn — 91 × 186 passes at ~1.2 s each, about six hours, or a sampled subset in minutes.

* **[UNVERIFIED] Whether the alphabetical order of `config/rules/*.yaml` is what the loader actually
  uses.** I observed that both rules fire in the causal order that requires the retype first; I did
  not read the loader's directory walk. **Settled by** reading `bundle/loader.py`'s rules-directory
  iteration, which is one function.

---

## Reproduction

```sh
# ALL of this runs against a COPY. The real vault and the real db are never opened for write.
cp ~/.qntm-md/state.db <scratch>/state-copy.db          # 1,083,658,240 bytes

# probe.py       — reproduces run_cycle's construction (orchestrator.py:5353-5480) against the copy:
#                  _load_with_fallback -> 94 tier-1 rules, 0 shell, 252 patterns, 72 view sheets
#                  _GraphFromDict      -> 1,501 nodes, 460 edges
#                  resolvers()         -> real TokenResolver / PatternResolver /
#                                         build_dispatcher_registry / EventLogStore
#                  every pass wrapped BEGIN ... rollback(); nothing is ever committed

# inspect_edges.py  — PART_OF 417, WAITING_FOR 22, REQUIRES 17, UNLOCKS 4;
#                     585 of 1,501 nodes carry >=1 edge

# inspect_views3.py — 186 sections; 153 with section_defaults; 0 with a section default_node_type;
#                     default fields: domain 153, project 60, cap_state 12, principle_state 10,
#                     stage 9, class_state 8, package_state 8, god_box 2;
#                     global_defaults {} ; node_defaults_cascade ()
#                     view default_node_type after the global cascade:
#                       task 56, routine 7, album/blog/book/attribute/film/group/person/
#                       tv_show/writer 1 each

# triggers.py     — 94 runtime rules; rule_triggers {} ; 0 shell metadata; no compiled rule
#                   carries a trigger; priorities 10x1 5x1 3x1 0x76 -1x2 -2x1 -4x1 -5x2 -10x1 -20x8

# ids.py          — 1,501 of 1,501 nodes carry qntm_id; max 2351; next mint 2352; 850 gaps in [1,2351]

# delta.py        — THE Q1 NUMBER. The engine's own pass, twice, differenced.
#                   A (rest): 26 distinct rules, 288 (rule,node) pairs
#                   B (inbox capture: task, title only): 27 rules, 289 pairs
#                   rules bound to the new node: 1  -> stamp-created-at-on-task
#                   collateral new: 0     collateral lost: 0

# sweep.py        — THE 186-SECTION SWEEP. Mints each section's own capture, differenced against A.
#                   direct-reach distribution: {0: 54, 1: 119, 2: 13}
#                   union of rules ever reached by a capture: 2 of 94
#                     stamp-created-at-on-task           132 sections
#                     routine-without-cadence-becomes-task 13 sections
#                   38 sections could not mint: section defaults name a field the registered
#                     node type does not declare (8 dev views; cap_state 12, principle_state 10,
#                     class_state 8, package_state 8)
#                   16 sections reach 0 legitimately (album/blog/book/attribute/film/tv_show/
#                     writer/group/person — no rule binds those types)

# ── the shipped app layer (§9), read in this worktree at a16fd1e ──────────────────────────
grep -rn "defaults" app/                  # 25 occurrences; ONE applies the map (membership.ts:187)
grep -rn "\.refused" app/                 # 3 occurrences, all in qualification.ts's shape reader
grep -rn "generate:qualification" .github/ # nothing — no --check is wired into CI
node -e 'const j=require("./presentation.json");for(const k of Object.keys(j))
         console.log(k, Buffer.byteLength(JSON.stringify(j[k])))'
#   qualification 23872 | note 1887 | resolution 1574 | structural 720 | file on disk 47676
node -e 'const j=require("./presentation.json").qualification;
         console.log(Object.keys(j.predicates).length, Object.keys(j.refused).length,
           Object.values(j.sections).reduce((n,s)=>n+Object.keys(s).length,0),
           Object.values(j.sectionOrder).reduce((n,s)=>n+s.length,0))'
#   43 published | 116 refused | 49 sections covered | 186 sections declared
```

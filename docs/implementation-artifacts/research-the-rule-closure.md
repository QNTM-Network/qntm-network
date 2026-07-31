# Research: the rule closure — is a view's entry set a bounded rule scope?

**Status: research. No application source is modified on this branch. This document is the only
file it adds.**

**Branch:** `design/rule-closure`, based on `origin/main` @ `f7a769b`.

---

## 0. Lead — the answer, before the method

**His model is right about the size, nearly right about the depth, and wrong about where the
closure comes from.** A view's entry set really is a bounded rule scope: measured with the engine's
own rules pass over his real config and a read-only copy of his real graph, a checkbox tick reaches
**between 0 and 7 of the 94 rules**, and the union over every gesture measured in a view is
**between 0 and 11**. Two levels captures **19 of the 21** rules any gesture reached anywhere —
**90 %**. So the instinct that a view bounds the work is a measured fact, not a hope.

**The closure for `inbox` is ZERO.** Not small — zero. At his graph state `inbox` prints one node
and a tick on it changes nothing anywhere in the model. **[OBS]**

**What is wrong is the provenance.** The closure is tight only because the graph state is known.
Computed from config alone — the node types a view's qualification pattern can admit, crossed with
the node types each rule's `for_each` can bind — the same views bound **35 to 80 rules of 94**
**[OBS]**. That is four to forty times the measured number, and for `everything-work` it is 80 of
94, which is not a scope at all. **A closure that ships with the view is nearly the whole rule set.
A closure that is worth having has to be computed against the graph.**

| view | entry | tickable | sampled | d1 | d2 | d3 | d4 | **all** | **≤2** | of those, no whole-graph or event-log input | rows changed **in this view** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **`inbox`** | 1 | 1 | 1 | 0 | 0 | 0 | 0 | **0** | **0** | 0 | 0 |
| `this-week` | 5 | 5 | 5 | 10 | 0 | 0 | 0 | **10** | **10** | 4 | 0 |
| `metrics` | 5 | 0 | 0 | 0 | 0 | 0 | 0 | **0** | **0** | 0 | 0 |
| `outcomes` | 68 | 68 | 12 | 6 | 0 | 0 | 0 | **6** | **6** | 5 | 0–1 |
| `routines` | 26 | 26 | 12 | 1 | 1 | 1 | 1 | **4** | **2** | 4 | 1 |
| `waiting-for-work` | 32 | 32 | 12 | 8 | 0 | 0 | 0 | **8** | **8** | 7 | 0–1 |
| `daily-personal` | 136 | 56 | 12 | 5 | 1 | 1 | 1 | **8** | **6** | 7 | 0–1 |
| `backlog` | 235 | 68 | 12 | 0 | 0 | 0 | 0 | **0** | **0** | 0 | 0 |
| `qntm-queue` | 146 | 30 | 12 | 0 | 0 | 0 | 0 | **0** | **0** | 0 | 0 |
| `everything-work` | 607 | 158 | 12 | 8 | 1 | 1 | 1 | **11** | **9** | 10 | 0–1 |
| `outcomes-personal` | 38 | 38 | 12 | 4 | 0 | 0 | 0 | **4** | **4** | 4 | 0–1 |
| `all-work` | 37 | 37 | 12 | 2 | 0 | 0 | 0 | **2** | **2** | 2 | 0 |
| `qntm-capabilities` | 91 | 91 | 12 | 0 | 0 | 0 | 0 | **0** | **0** | 0 | 0 |
| `everything-personal` | 156 | 76 | 12 | 6 | 0 | 0 | 0 | **6** | **6** | 5 | 0–2 |
| `waiting-for-personal` | 6 | 6 | 6 | 6 | 0 | 0 | 0 | **6** | **6** | 6 | 1 |
| `routines-personal` | 17 | 17 | 12 | 4 | 1 | 1 | 1 | **7** | **5** | 7 | 1 |
| `qntm-principles` | 42 | 42 | 12 | 0 | 0 | 0 | 0 | **0** | **0** | 0 | 0 |
| `all-personal` | 17 | 17 | 12 | 8 | 0 | 0 | 0 | **8** | **8** | 4 | 0 |
| `admin` | 33 | 13 | 12 | 3 | 0 | 0 | 0 | **3** | **3** | 3 | 0 |
| `habits` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** | **0** | 0 | 0 |

**[OBS]** every cell. **192 simulated gestures**, each one a full run of the engine's rules pass on
an in-memory copy of his graph, differenced against the same pass at rest. Across all 192:
**min 0, median 1, mean 1.47, max 7 — and 76 of 192 (40 %) reach no rule at all.**

**The six findings, in the order they matter.**

1. **The scope is real and it is small.** 21 distinct rules of 94 were reachable by any tick in any
   view. Per gesture the median is 1 and the maximum is 7.
2. **Two levels is enough for 16 of 20 views and short by two rules for the other four.** Sixteen
   views saturate at depth 1. The other four contain routines, and a routine tick runs a **four-link
   chain**: `stamp-completed-at-on-done-routine` (pri 10) → `routine-complete-reset-available-date`
   (0) → `clear-completion-stamp-when-not-done` (−10) → `clear-routine-reset-cascade-marker` (−4).
   Depth 3 and depth 4 add **exactly one rule each**.
3. **The closure is stable against the clock but not perfectly.** Re-run under three logical days
   three weeks apart, **7 of 9 views produced an identical closure**; the other two gained
   **one** rule, `promote-scheduled-routine-to-open`, which is gated on `available_date` against
   `$cycle_today`. **[OBS]**
4. **The closure is NOT a config fact.** §3. The config-only bound is 35–80 of 94.
5. **What escapes is the metric layer, and it is exactly six rules.** Of the 21 reached, **15 need
   nothing beyond the bound node, its one-hop edges and a clock** — all of which the browser
   already holds. The other **6 are whole-graph aggregates** (`coverage-*`, `age-of-intent-*`),
   whose `for_each` binds three patterns at once, one of which is *every open task in the graph*
   (`config/rules/age_of_intent_tasks.yaml:400-411`). **[OBS]**
6. **Preview-not-write survives, and I proved it by enumeration rather than by absence.** §8. There
   are exactly two call sites of `writeFile`, exactly five of `applyEdit`, and exactly three
   non-null assignments to `graphData` — all three of them the server's own envelope. A value that
   is displayed and never put into the source string has no path to ingestion.

**What I would tell him in one sentence.** *Your entry set is a real bound and the number is small
enough to be worth having; two levels is the right depth for everything except a routine tick;
but the closure has to be recomputed against the graph rather than shipped with the view, and six
of the rules inside it read the whole graph, so the browser can be exact about fifteen of twenty-one
and must stay silent about the rest.*

**Evidence rule.** Every claim is **[OBS]** (a script I ran, output I read) or **[REA]** (reasoned
from source I read, cited `file:line`) or **[REPO]** (a claim this repo makes about itself that I
did not reproduce). **Absence is never proven by a grep returning nothing** — §8 and §2.2 are the
two places it mattered, and both are enumerations.

Sizes are the house scale: **under an hour** / **half a day** / **an arc**.

---

## 1. How this was measured, and the definition each number answers

**The previous document recorded that it classified three times and got 38, then 21, then about 1**
**[REPO]** (`design-local-behaviour-and-the-queue.md` §11.6). **That is a warning that this
classification is easy to get wrong by changing the definition silently.** So every number here
names its definition first.

### 1.1 The three definitions

| name | definition | what it is good for |
|---|---|---|
| **BIND(R)** | the node ids `R`'s `for_each` pattern binds, resolved by `qntm_graph.find_matching` through the real `PatternResolver` | the resting scope of a rule |
| **FIRES(R, m)** | `m ∈ BIND(R)` **and** `R`'s compiled `when` is true on `m`'s binding, decided by `qntm_rule_engine.evaluate` | whether the rule would actually act |
| **REACHED(gesture)** | the rule ids whose `(rule, node)` firings, or whose dispatched writes, **differ** between a full rules pass at rest and a full rules pass with one node ticked | **the closure. This is the number in §0.** |

**REACHED is the one that answers his question**, because it is the engine's own answer. I did not
re-implement the rule engine, the pattern engine or the predicate evaluator; I ran them.

### 1.2 The rig

**[OBS]** Everything ran from this worktree, against:

* a **copy** of `~/.qntm-md/state.db` (1,083,658,240 B), opened `mode=ro` and never written;
* a **copy** of `apps/qntm-md/config/` — the trunk config was read and never opened for write;
* `~/qntm` read only.

**No cycle was run. `graph-sync` was not run. `map . --full` was not run. Nothing was posted to any
server.** The graph is rebuilt in memory with `qntm_graph.Graph.from_dict` and `graph._patterns =
bundle.patterns`, which is exactly what `coordination/orchestrator.py:5392-5407` does when it loads
a persisted graph. Every gesture mutates that in-memory graph and the graph is rebuilt for the next
one.

**[OBS]** The bundle loads clean from the copy: **252 patterns, 94 tier-1 rules, 72 view sheets, 134
vocabulary entries, 31 node types.** The graph is **1,501 nodes and 460 edges**, `updated`
`2026-07-24T15:27:20Z`.

**[OBS]** The engine's rules pass at rest, over that graph: **28 firings, 383 dispatched writes, 35
nodes changed, 0 rules raised.** One pass costs **0.9 s** in this rig.

**Two limits of the rig, stated up front.**

* **[UNVERIFIED]** The graph copy is dated **2026-07-24** and the vault markdown is dated
  **2026-07-31**. Every entry set here is the entry set the 24 July graph produces. **Settled by**
  re-running §4 against a `state.db` from the current cycle, which needs a session this branch does
  not have. **[REA]** The shape of the answer does not depend on it — the closure is small because
  of the rule graph's structure, not because of which nodes happened to be open — but the exact
  per-view counts would move.
* **[OBS]** Event-query patterns resolve against a wall clock. The event log ends 2026-07-24, so a
  "last 7 days" window read at run time is empty. That makes the metric rules *under*-count here,
  not over-count, so §7's escape number is a floor.

---

## 2. M1 — the chain: three links hold, one is inverted

**His chain:** patterns bind nodes → those nodes become structural nodes → structural nodes print
lists → a view is a collection of those lists.

### 2.1 What holds

**[OBS] A view is a collection of sections, and every section has a qualification pattern.** Across
all 72 registered view sheets there are **186 sections**, and **186 of 186 carry a `qualification:`**
naming one of **159 distinct patterns**. There is no other membership mechanism —
`render/view_registration.py:38-44` states it as a declared collapse:

> *"how a node comes to APPEAR in a view routes through ONE mechanism — MEMBERSHIP derivation.
> 'Register / place node X here' is NOT a second code path; it is the degenerate identity-membership
> rule id==X."*

**[OBS] Patterns bind nodes, and the binding is what the section prints.** The three calls that
produce a view's membership are `render.compile(sheet)` → `_compose_section_members(section, graph,
pattern_resolver)` → `render.filter(nodes, compiled.domain)`
(`coordination/orchestrator.py:3388-3421`, which the orchestrator itself labels *"canonical
architectural-truth-source for 'which views select which nodes'"*). I called those three, unchanged,
for all 186 sections; they resolved with **zero errors** and produced **1,918 memberships**.

**[OBS] A section really does own a structural node.** Of 186 sections, **185 declare a structural
node by name** (`compiler.py:268`, `declared_name=section.name`), and **104 of the 121 distinct
section names exist in the graph as `header` node titles** — 126 header nodes in total. **Zero
sections use the old `container_node:` id pointer.** So the heading of a list is a real node in the
model, materialised by name, exactly as he says.

### 2.2 Where the chain is inverted, and this is the finding

**The nodes a pattern binds do not *become* structural nodes. In the general case they are
explicitly excluded from being structural, by a bundle-load desugarer that exists for that purpose.**

**[OBS]** `bundle/pattern_structural_defaults.py` — *"Structural/identity-unique node types are
excluded from a broad (typeless) pattern `find:` BY DEFAULT."* At bundle load, every pattern whose
root `find` names no `node_type` gains one synthesised exclusion step per schema-declared
identity-unique type. **[OBS]** The identity-unique set, read from his schema rather than assumed,
is **seven types**: `capability, class, explainer, header, package, principle, sink`.

**So the direction is the reverse of his sentence.** The section supplies the structural node (the
heading); the pattern supplies the content nodes (the list), and the engine works to keep the two
apart. **[OBS]** Of 1,918 view memberships, **172 (9 %) are a structural node type**, and they are
concentrated in **eight views**: `qntm-capabilities` 91, `qntm-principles` 42, `flowtrace-principles`
8, `qntm-sinks` 9, `qntm-classes` 7, `qntm-packages` 7, `metrics` 5, `flowtrace-capabilities` 3.
Every other view prints only `task`, `outcome`, `ticket`, `routine` and the small media types.

**But his sentence is not merely wrong — it describes a real pathway that exists and is used.**
**[OBS] 60 of 252 patterns name a structural node type at their root, and 20 of 94 rules bind one.**
Those 20 are the metric carriers: `accuracy-*` (12), `age-of-intent-*` (4), `coverage-*` (4), each
binding a `header` node through an `accuracy-carrier-*` / `coverage-carrier-*` pattern. **[REA] So
"a pattern binds a node, the node is a structural node, and the structural node prints a list" is
an accurate description of `metrics` and of the six dev views, and an inaccurate description of the
other 66.** He generalised from the part of his own instance that works that way.

**Why this matters for the closure rather than being a terminology quibble.** The eight views where
patterns bind structural nodes are precisely the eight where **a checkbox tick reaches zero rules**
(`qntm-capabilities` 0, `qntm-principles` 0, `metrics` 0 — §0's table). **[REA] The part of his
model that is literally true is the part that has no local behaviour to compute.**

---

## 3. M2 — the entry set is a RUNTIME fact, and this is the expensive answer

**Answer: a view's entry set cannot be resolved from config alone. The predicate is config; the
answer is graph state.**

**[OBS]** Enumerating what every one of the 186 section qualifications actually roots on:

| how the section decides membership | sections |
|---|---|
| a root **field predicate** only (`status: open`, `domain: work`, `project: qntm` …) | 135 |
| a root predicate **plus traversal or exclusion steps** | 51 |
| anything that is decidable without reading a node's fields | **0** |

**[OBS]** The field keys any view qualification roots on, in full: `status` 100, `project` 60,
`domain` 42, `title` 21, `cap_state` 12, `principle_state` 10, `class_state` 8, `package_state` 8,
`stage` 6, `available_date` 4, `due_date` 4, `priority` 2, `created_at` 2, `god_box` 2. **Every one
is a node field.** **[OBS] Ten sections additionally depend on the clock** (`$cycle_today` /
`$cycle_week_end`): all four of `this-week`, both dated sections of `daily-personal` and
`daily-work`, and the `tasks` section of `all-work` and `all-personal`.

### 3.1 The config-only closure, and why it is not a scope

**This is the measurement that decides his model's provenance, and it is the one that goes against
him.** If the entry set is not a config fact, the next question is whether the *closure* is anyway —
a view can only print certain node **types**, and a rule can only bind certain node **types**, and
those two facts are both config.

**[OBS] The type-level closure, computed by crossing each view's admissible node types against each
rule's `for_each` root node type:**

| view | measured closure (§0) | **config-only bound** | ratio |
|---|---|---|---|
| `inbox` | 0 | **60 of 94** | ∞ |
| `this-week` | 10 | **63 of 94** | 6.3× |
| `outcomes` | 6 | **38 of 94** | 6.3× |
| `routines` | 4 | **52 of 94** | 13× |
| `waiting-for-work` | 8 | **63 of 94** | 7.9× |
| `everything-work` | 11 | **80 of 94** | 7.3× |
| `backlog` | 0 | **36 of 94** | ∞ |
| `qntm-capabilities` | 0 | **35 of 94** | ∞ |

**[REA] A closure of 80 of 94 rules is not a scope; it is the rule set with a few metric rules
removed.** The reason is structural and it is not going to improve: **three rule patterns root on
`find: {}` — every node in the graph** **[OBS]** — and a further large group roots on `node_type:
task`, which is the type 803 of his 1,918 view memberships already are. **Type is not a
discriminator in his instance because almost everything is a task.**

**So the honest answer to M2 is:** the entry set is a runtime fact; the closure derived from it is a
runtime fact; and the config-only approximation is too loose to be worth shipping. **This decides
the cost question. His model works, and it works as a per-cycle computation over the graph, not as
a build-time artefact bundled with the view.**

---

## 4. M3 — the number, and what is behind it

The table is in §0. This section says what is in it.

### 4.1 The 21 rules any gesture reached, in full

**[OBS]** No gesture in any view reached any rule outside this list.

| depth | pri | rule | writes |
|---|---|---|---|
| 1 | 10 | `stamp-completed-at-on-done-routine` | `completed_at` |
| 1 | 3 | `stamp-task-overdue-drag` | `intent_lead_days` |
| 1 | 0 | `stamp-created-at-on-task` | `created_at` |
| 1 | 0 | `stamp-outcome-done-task-count` | `done_task_count` |
| 1 | 0 | `node-with-live-requires-gets-status-waiting` | `status` |
| 1 | 0 | `target-of-open-waiter-gets-status-waiting` | `status` |
| 1 | 0 | `target-reopens-when-no-open-waiters-remain` | `status` |
| 1 | 0 | `unblock-node-when-all-requires-done` | `status` |
| 1 | 0 | `completed-target-clears-waiting-link` | — (`delete_edge`) |
| 1 | 0 | `auto-outcome-without-open-children-reverts-to-task` | `auto_outcome` |
| 1 | 0 | `task-with-routine-child-becomes-habit` | `auto_habit` |
| 1 | 0 | `outcome-with-routine-child-becomes-habit` | `auto_habit`, `auto_outcome` |
| 1 | −20 | `age-of-intent-overall` / `-personal` / `-work` | `par` |
| 1 | −20 | `coverage-overall` / `-personal` / `-work` | `par` |
| **2** | 0 | `routine-complete-reset-available-date` | `available_date`, `status`, `reset_cascade_pending` |
| **3** | −10 | `clear-completion-stamp-when-not-done` | `completed_at` |
| **4** | −4 | `clear-routine-reset-cascade-marker` | `reset_cascade_pending` |

**Twelve of the eighteen depth-1 rules are structural or stamping rules on the node itself or its
one-hop neighbour. Six are the metric layer. Everything below depth 1 is the routine reset chain.**

### 4.2 Reachable versus merely present

**The engine's own answer distinguishes these two for free, because REACHED is a delta.** A rule
that binds a node in the view but whose firing does not change when the node is ticked never appears.
**[OBS]** At rest, **55 of 94 rules bind at least one node** and **28 fire**; a tick moves **at most
7, median 1, and 40 % of ticks move none**. So *presence* is 55, *firing* is 28, and *reachability from a gesture* is 0–7. **[REA] The gap
between 55 and 7 is where the previous document's three different numbers came from, and it is why
the closure has to be defined as a delta rather than as a membership test.**

### 4.3 What he would actually see

**[OBS]** The rightmost column of §0's table: **the number of rows in the view he is looking at
whose fields change because of the tick is 0, 1 or 2 — never more.** For eight of twenty views it is
always 0.

**[REA] That is the ceiling on the whole feature, and it is the same ceiling the previous document
found from a completely different direction** (its §0.7 measured mean 1.33 in-view affected rows
from a graph traversal; this measured 0–2 from the rule engine). Two independent methods agreeing on
a small number is worth more than either alone.

### 4.4 The distribution matters, and `inbox` is the worst case

**He starts with `inbox`. `inbox` reaches zero.** **[OBS]** Its two sections qualify on `inbox-items`
(`node_type: inbox`, not done) and `domain-empty` (`domain: null`, not done). At this graph state
`inbox-items` binds **0** nodes and `domain-empty` binds **1** — a `task`, qntm id 2284. Ticking it
changes nothing in the model.

**[REA] This is not an accident of the snapshot; it is what an inbox is.** A capture with no domain
and no type is a node no rule has anything to say about yet — that is precisely why it is in the
inbox. **The view he always starts with is the view where a local rule evaluator would have the
least to do, and the view where the free things the previous document specified — identity
propagation, an adjacency mark — are the entire available behaviour.**

**`this_week`, which he calls unideal, is the opposite: 10 rules, the joint-highest depth-1 count in
the sample.** **[REA] The views that feel unsatisfying to him are the views where the model is
busiest, and the view he trusts is the one where it is quietest.** I do not think that is a
coincidence, and I think it is worth him hearing: `inbox` is calm because nothing is derived there.

---

## 5. M4 — is two levels the right depth?

**Almost. Two levels is right for 16 of 20 views and short by exactly two rules for the other four.**

**[OBS]** Depth 1: 18 distinct rules. Depth 2: 1. Depth 3: 1. Depth 4: 1. **Depth ≤ 2 covers 19 of
21 = 90 %.** Nothing beyond depth 4 exists in any measured gesture, and depth 4 is the terminal
link.

### 5.1 The one chain, in full

**[OBS]** Ticking routine qntm 1056 in `routines`:

```
depth 1   pri  10   stamp-completed-at-on-done-routine       completed_at := $cycle_today
depth 2   pri   0   routine-complete-reset-available-date    available_date := cadence(completed_at)
                                                             status         := scheduled
                                                             reset_cascade_pending := true
depth 3   pri -10   clear-completion-stamp-when-not-done     completed_at  := null
depth 4   pri  -4   clear-routine-reset-cascade-marker       reset_cascade_pending := null
```

**[REA] A browser that stopped at depth 2 would show the routine as `[>]` with a new start date, and
would leave a `✅` stamp on screen that the engine removes at depth 3.** That is a visible, wrong
line — not a missing one. It is the single worst failure mode a two-level cut has, and it lands on
the node type he interacts with most often outside `this_week`.

**The good news is that the extra depth is nearly free.** Depth 3 and depth 4 add **one rule each**,
both node-local (§7), both writing a single field on the node already in hand. **[REA] Going to
depth 4 costs two more rule evaluations on one node. Two is not the right cut-off; four is, and four
is not more expensive in any way that matters.**

### 5.2 Why the closure cannot be deeper than the priority ladder

**[OBS]** The rules phase is **one priority-ordered pass with no fixpoint loop**
(`core/rule-engine/src/qntm_rule_engine/executor/core.py:48-86` sorts by priority descending and
runs each rule once). **[OBS]** His config uses **ten distinct priorities**: `10, 5, 3, 0, −1, −2,
−4, −5, −10, −20`.

**[REA] So a chain can have at most ten links, and it is bounded by his own declaration rather than
by the graph.** The measured maximum is four. **That is the real answer to "is two the right
number": the ceiling is a config fact he controls, the observed depth is four, and the number he
should build to is the ceiling of the chain he actually has, not a round number.**

---

## 6. M5 — is the closure stable?

**Mostly, and the instability is exactly the clock.**

**[OBS]** The same gestures, the same graph, three logical days three weeks apart
(2026-07-24, 2026-07-31, 2026-08-14):

| view | 07-24 | 07-31 | 08-14 | identical | stable core |
|---|---|---|---|---|---|
| `inbox` | 0 | 0 | 0 | **yes** | 0 |
| `this-week` | 10 | 10 | 10 | **yes** | 10 |
| `outcomes` | 4 | 4 | 4 | **yes** | 4 |
| `routines` | 4 | 4 | 4 | **yes** | 4 |
| `waiting-for-work` | 7 | 7 | 7 | **yes** | 7 |
| `daily-personal` | 6 | 6 | 6 | **yes** | 6 |
| `all-personal` | 3 | 3 | 3 | **yes** | 3 |
| `everything-work` | 9 | 10 | 10 | **no** | 9 |
| `routines-personal` | 7 | 8 | 8 | **no** | 7 |

**[OBS] The single rule that moves is `promote-scheduled-routine-to-open`**
(`config/rules/promote_scheduled_routine.yaml:11`), which reads `available_date` against
`$cycle_today` and writes `status`. It is absent on 24 July and present a week later, because a
scheduled routine's start date has arrived in between.

**[REA] So the closure is not a constant, but it is very nearly one, and it moves for a reason that
is legible.** A cached closure would be correct for seven of nine views indefinitely and would be
short by one rule in the other two, on days when a routine comes due. That is a **cache with a
day-granularity invalidation**, not a per-cycle recomputation.

**But read §3 before taking comfort from this.** The closure is stable *given a graph state*. It is
the graph state that has to be present in the first place. **[REA] Stable-once-computed and
computable-from-config are different properties, and his model needs the second one to ship with the
view. It only has the first.**

---

## 7. M6 — what escapes, and it is the metric layer

**A rule can be inside the closure and still not be computable inside the view.** Enumerating, over
all 94 rules, the inputs that reach beyond the bound node:

**[OBS]**

| the input | rules |
|---|---|
| a **multi-bind `for_each`** — the rule binds a whole-graph *set* alongside its node | **21 of 94** |
| the pattern **traverses an edge** (`children` / `parents` / `ancestors` / `descendants` …) | **24 of 94** |
| the **event log** — 1,221 cycles of SQLite that is on no wire | **20 of 94** |
| the **clock** (`$cycle_*`) | **11 of 94** |
| **union — needs something beyond the node** | **60 of 94** |
| **needs none of them** | **34 of 94** |

**Now the same classification restricted to the 21 rules a gesture actually reached** **[OBS]**:

| classification | rules | can the browser compute it? |
|---|---|---|
| node-local | 3 — `clear-completion-stamp-when-not-done`, `clear-routine-reset-cascade-marker`, `routine-complete-reset-available-date` | **yes** |
| clock only | 3 — `stamp-completed-at-on-done-routine`, `stamp-created-at-on-task`, `stamp-task-overdue-drag` | **yes** — the browser has a clock |
| one-hop traversal | 9 — the `waiting`/`requires`/`auto-*`/`done_task_count` family | **yes** — 460 edges are already in the payload |
| **whole-graph aggregate** | **6** — `coverage-overall/personal/work`, `age-of-intent-overall/personal/work` | **no** |
| event log | **0** | n/a |

**Fifteen of twenty-one are computable from what the browser already has. Six are not, and they are
one family.** **[OBS]** `config/rules/age_of_intent_tasks.yaml:400-411` is the shape:

```yaml
- id: coverage-overall
  priority: -20
  for_each:
    - pattern: coverage-carrier-overall   # a header node
      bind: current
    - pattern: overall-open-tasks         # EVERY open task in the graph
      bind: open_all
    - pattern: overall-open-declared
      bind: open_declared
```

**[REA] That rule's output is a percentage over the whole graph. It is in the closure because
ticking any open task anywhere changes the denominator.** No view scope can contain it, and no
amount of traversal depth helps — it is not a chain, it is an aggregate.

**And the news on the event log is better than expected.** **[OBS] None of the 21 reached rules
reads the event log.** The 20 event-log rules are the `accuracy-*` metric family, which binds
`header` carriers and reads a windowed event query; a checkbox tick does not reach them within the
same pass. **[REA] So the biggest single objection to a local evaluator — that 20 of 94 rules read a
database that is not on the wire — turns out not to bear on the gesture path at all. It bears on the
`metrics` view, which reaches zero rules from a gesture anyway.**

**The honest failure mode, then, is narrow and nameable: six metric rules whose value is a
whole-graph ratio.** They all write one field, `par`, and `par` is one of the **two** markers in his
whole vocabulary carrying `render_only: true` **[OBS]** (`config/vocabulary/markers.yaml:18`,
`🎯 par`; `☑️ done_task_count` at `:13` is the only other). **[REA] The one thing the browser provably cannot compute is the one thing the engine has
already declared it will never read back from the text.** That is a fortunate alignment rather than
a designed one, but it means the failure is contained: the browser leaves `🎯` alone, and nothing
downstream depends on it having been right.

### 7.1 Per view: rules rooted in the view versus rules needing something outside it

**[OBS]** Counting, per view, the rules whose bound root is inside the entry set and how many of
those need an input the view does not print:

| view | entry | rules rooted in view | needing outside input |
|---|---|---|---|
| `everything-work` | 607 | 38 | 15 (39 %) |
| `everything-personal` | 156 | 36 | 16 (44 %) |
| `daily-personal` | 136 | 35 | 18 (51 %) |
| `routines` | 26 | 28 | 15 (54 %) |
| `routines-personal` | 17 | 23 | 9 (39 %) |
| `all-work` | 37 | 8 | 4 (50 %) |
| `waiting-for-work` | 32 | 6 | 2 (33 %) |
| `outcomes` | 68 | 2 | 2 (100 %) |
| `backlog` | 235 | 1 | 0 |
| `qntm-capabilities` | 91 | 0 | 0 |

**[REA] Read this against §0's table and the disagreement is the point.** `outcomes` has 2 rules
rooted in it and both need outside input — yet a tick there reaches 6 rules and changes at most one
visible row. **Rooted-in-view and reached-by-a-gesture are different sets, and the second is the one
that matters.** A design that scoped by "which rules live here" would have picked the wrong 38 for
`everything-work`; the gesture picks 11.

---

## 8. The objection that survives — and it does not survive

**The previous document's strongest point** **[REPO]**: *a locally computed value that reaches the
source string is ingested as AUTHORED INPUT and overrides the rule*
(`config/rules/stamp_completed_at.yaml:2-5`, "INPUT WINS").

**The coordinator's reading, which I was asked to test: that fires only if the local answer is
WRITTEN. Confirmed, and proved by enumeration rather than by a grep returning nothing.**

**[OBS] The complete write path of this app, every site enumerated:**

* **`writeFile(view, markdown, source)` — `app/index.html:1543`. Exactly two call sites**, both
  `await`ed: `toggleTask` at `:1584` and `commitLine` at `:1608`. There is no third.
* **`applyEdit` — exactly five call sites** outside its own module: `app/index.html:1986`, `:2006`,
  and `app/present/paint.ts:379`, `:520`, `:915`. Every one takes either `v.markdown` or the
  painter's `fileSource` / `source` — the string the server sent. **None takes a string this app
  composed.**
* **`graphData` — exactly five assignments**: `let graphData = null` (`:1034`), a nulling (`:1880`),
  and three of the form `graphData = data` (`:1585`, `:1609`, `:1704`). **All three non-null
  assignments are the server's own envelope, returned from `api()`.** No client-computed value ever
  enters it.
* **`.markdown` is never assigned anywhere in `app/`, `worker/src/` or `server/`.** The two
  syntactic near-misses are a comparison (`app/index.html:1606`, `=== null`) and a null check
  (`worker/src/app.js:248`).

**[REA] So the ingestion path is closed by construction, not by discipline.** For a locally computed
value to reach the engine it would have to enter `v.markdown`, and `v.markdown` has exactly one
producer: the projection. A preview rendered into the DOM — a CSS class, a span, a shimmer — has no
edge into `applyEdit` at all.

**`app/present/draft.ts:1-24` is the precedent and it argues the same case one level down** **[OBS]**:

> *"A new line is NOT written into the source when it is opened. It is held here, painted as an empty
> row, and reaches `applyEdit` exactly once — at the moment it settles… Until then the source string
> is byte-for-byte the one the server sent."*

**So the surviving shape is exactly as the coordinator described it: write the gesture, preview the
consequences, let the projection replace the preview.** **[REA] And the reason it is safe is
structural rather than careful — there is no code path from a painted pixel to a POST body.**

**One caveat, and it is the one to hold.** **[REA]** The safety depends on the preview never being
written into `graphData.snapshot.views[i].markdown` as a shortcut. That is the same trap
`app/present/base.ts:230-238` already names for the base surface **[REPO]** — *"never with a string
this app computed"*. **The property proved above is a property of today's five assignment sites, and
it would be destroyed by adding a sixth.** A test asserting that `graphData` is only ever assigned
from an `api()` result would make it permanent, and it is **under an hour**.

---

## 9. What this means for what to build

**His model does not replace the previous document's ranked list; it adds one row to it and narrows
another.**

| what | size | verdict |
|---|---|---|
| identity propagation — a tick reaches every printing of the node | under an hour | **unchanged and still first.** Nothing here touches it |
| the adjacency mark — *this row may change* | half a day | **unchanged, and now better justified.** §4.3: 0–2 rows change in view. The mark is the right claim for 0–2 rows |
| **a view-scoped closure, computed server-side and published with the projection** | **half a day** | **NEW, and this is his model's buildable form.** §9.1 |
| a browser-side rule evaluator over that closure | an arc | **still refused, and §7 is the reason: 6 of 21 are whole-graph aggregates** |
| a test pinning `graphData`'s five assignment sites | under an hour | **§8. Cheap, and it is what keeps §8 true** |

### 9.1 The row his model actually buys

**[REA] The measurement says something his framing did not: the closure is small enough that the
SERVER could publish it.** A cycle already resolves every pattern; **[REPO]** the repo's own number
is ~518 pattern resolutions per cycle (`substrate_wiring/pattern_resolver.py:71-76`). Computing, per
view, *"these ≤11 rules are the ones a gesture here can reach, and these ≤2 fields are what they
write"* is a by-product of work the cycle already does.

**What the browser would then hold is not an evaluator. It is a list of FIELD NAMES per view** —
`status`, `completed_at`, `available_date`, `done_task_count`, `par` — and the knowledge that a tick
here can move those and nothing else. **[REA] That is enough to say "this row's date may change"
rather than "this row may change", which is a strictly better sentence than the adjacency mark, and
it needs no second interpreter, no pattern engine, no clock and no event log.**

**And it is bounded by measurement rather than by hope:** the largest field set across all 20 views
measured is **11 rules writing 9 distinct fields**.

---

## 10. The argument against the tempting answer

**The tempting answer, now that the number is small, is to build the evaluator after all.** Twenty-one
rules of 94. Fifteen of them computable from a node, its edges and a clock. Two hundred lines of
TypeScript, and his sentence comes true.

**It is still wrong, and the measurement is what makes the refusal precise rather than cautious.**

**Reason one: the 15 are the boring 15.** Read §4.1 again. Nine of the fifteen write `status` or a
boolean `auto_*` flag on a neighbour; three write a date stamp; three clear a marker. **[REA] The
felt consequences he described — *"it feels model-like"* — are already delivered by identity
propagation and the adjacency mark, at a fraction of the cost. The evaluator buys the difference
between "this row may change" and "this row will say `waiting`", and that difference is worth less
than the six rules it will silently be wrong about.**

**Reason two: the six it cannot do are not detectable from inside the closure.** `coverage-overall`
is in the closure by exactly the same test as `stamp-created-at-on-task`. **[REA] A browser walking
the closure has no local signal that one is computable and the other is not — the distinction lives
in the shape of the `for_each`, which is config the browser would also have to read and interpret.
An evaluator that is right about 15 and confidently wrong about 6 is worse than one that exists
for none, because the failure is silent** — and silence is the diagnostic shape this project has
already named as its worst **[REPO]** (`design-the-edit-is-a-safe-haven.md` §3.3).

**Reason three, and it is the one the numbers changed my mind about.** **[OBS] Over 1,221 cycles,
68 of 94 rules have ever fired and 31 never have.** Among the never-fired is
`stamp-completed-at-on-done-routine` — the rule whose header declares "INPUT WINS", which has **never
once run in his whole history**, because he always types the `✅` himself. **[REA] The config
describes a machine considerably busier than the one he actually runs. A closure derived from the
config would carry rules that have never fired; the closure derived from a gesture against real
state does not. That is an argument for his model and against building on top of the declaration —
and it is the same argument, one level up, for why the closure must be a runtime fact (§3).**

**What is missing is not an evaluator. It is a list of field names per view, computed where the
graph already is.**

---

## 11. What I refuted, including myself

**11.1 "View-scoped local rule computation cannot be built."** **Refuted, and this is the main
result.** The previous document's `§0.4` proved a rule cannot *name* a view, which is true and which
I reproduced. **[REA] But naming is not scoping.** A view determines an entry set; an entry set
determines a closure; and the closure is 0–11 rules of 94 with a maximum chain of 4. That is a
scope, arrived at from the other end, and the previous document did not test for it because it was
answering "is this rule node-local", which is a different question.

**11.2 "Approximately one rule would be observed firing in-view from a gesture."** **[REPO]**
`design-local-behaviour-and-the-queue.md` §11.6. **Refuted as a count and upheld as an
intuition.** The measured count is **0–7 per gesture, median 1**, and **21 distinct rules** across
all views. So "approximately one" is right about the *typical* gesture and wrong by a factor of 21
about the *closure*, which is the quantity his model is about.

**11.3 The operator's chain.** **Three of four links confirmed; one inverted** (§2.2). Patterns bind
content nodes and structural node types are excluded from them by a load-time desugarer. The
structural node is the section's heading, supplied by the view, not produced by the pattern. **His
description is accurate for the eight views where patterns bind structural node types — and those
are exactly the eight where a gesture reaches zero rules.**

**11.4 "Two levels deep."** **Upheld at 90 % and short by two.** Depth ≤2 captures 19 of 21. The
missing two are the tail of the routine reset chain, they cost one rule evaluation each, and
stopping at two would put a stale `✅` on screen.

**11.5 My own first attempt at the level walk.** I first defined a level as *"a rule that newly
binds a node the previous level wrote"*. **That definition misses `stamp-outcome-done-task-count`
entirely**, because ticking a child changes the parent's `children_count` without any field on the
parent being written. Recorded because the number it produced (zero at depth 2, everywhere) was
plausible and would have supported "two levels is more than enough". The fix was to stop
approximating and run the engine's own pass.

**11.6 "The event log is the blocker."** **Refuted for the gesture path.** 20 of 94 rules read it;
**0 of the 21 reached rules do.** The blocker is the multi-bind whole-graph aggregate, which the
previous document did not name.

**11.7 "A merely-displayed value could still reach ingestion."** **Refuted positively** (§8): five
`applyEdit` sites, two `writeFile` sites, three non-null `graphData` assignments, all from the
server. There is no path.

---

## 12. What is unverified, and what would settle it

**12.1 The graph copy is a week older than the vault.** §1.2. Every entry set is the 24 July graph's.
**Settled by** re-running §4 against a current `state.db`. **[REA]** The closure's *shape* is a
property of the rule graph and would not move; the per-view counts would.

**12.2 Event-query windows resolve empty in this rig.** The event log ends 2026-07-24 and the window
is measured from wall-clock `now`. So the `accuracy-*` family is under-represented in §7's reached
set. **Settled by** injecting a fixed `now` into `PatternResolver._resolve_event_query`, which needs
an engine change this branch may not make. **[REA]** It can only make the escape set *larger*, never
smaller, so §7's "6 escapes" is a floor.

**12.3 I simulated one gesture kind.** Every measurement here is `status := done` — the checkbox
tick. A **line edit** changes arbitrary fields through the parser and could reach a different set.
**Settled by** repeating §4 with `due_date`, `domain` and `title` perturbations. **[REA]** `status`
is the most contended field in the system — 15 rules write it, 42 read it **[OBS]** — so it is the
most likely gesture to produce the *largest* closure, and the numbers here are probably an upper
bound rather than a typical one.

**12.4 The sample is 12 nodes per view, not every node.** 192 gestures in total. Views with more
than 12 tickable nodes are sampled evenly across the entry set. **Settled by** running all 1,741
tickable printings, which is about 25 minutes in this rig and was not run.

**12.5 Whether a published field-name list (§9.1) is what he actually wants.** It is my reading of
what the measurement licenses, not something he asked for. **[REA]** It is the largest true claim
the browser can make from data it can be given cheaply, and it is strictly more than the adjacency
mark. He may prefer the mark's simplicity.

---

## 13. Reproduction

**No trunk clone was written. No cycle was run. `graph-sync` was not run. `map . --full` was not
run. Nothing was posted to any server. `~/qntm` was read only. `~/.qntm-md/state.db` was COPIED and
the copy was opened `mode=ro`. `apps/qntm-md/config/` was COPIED and the copy was loaded. No
application source is modified — this document is the only file this branch adds.**

```
# ── THE RIG ──
cp ~/.qntm-md/state.db          <scratch>/state-copy.db      # 1,083,658,240 B, never opened rw
cp -R apps/qntm-md/config       <scratch>/config             # trunk config read, never written
apps/qntm-md/.venv/bin/python                                # the real qntm_graph / qntm_rule_engine
                                                             # / qntm_md, editable-installed

common.py       loader.load(<scratch>/config)                # 252 patterns, 94 rules, 72 views,
                                                             #   134 vocab entries, 31 node types
                Graph.from_dict(graph_state) ; graph._patterns = bundle.patterns
                                                             # exactly orchestrator.py:5392-5407
                                                             # 1,501 nodes, 460 edges, upd 2026-07-24

# ── STAGE 1 — the rules, read off the COMPILED AST, not grepped ──
s1_rules.py     # 94 rules. writes: par 20, status 15, interval_days 6, domain 6 …
                # reads:  status 42, title 23, domain 23, event_type 20, cadence 17 …
                # verbs:  set_field 77, count 28, divide 27, emit_event 27, unset_field 14 …
                # write targets: $current.node.id 83, repair_source_id 2, $current.id 1
                # 20 event-query, 3 with an unbounded find:{} root

# ── STAGE 2 — the entry sets, by the orchestrator's own three calls ──
s2_views_and_binding.py
                # render.compile -> _compose_section_members -> render.filter
                # 72 views resolved, 0 errors, 1,918 memberships
                # inbox 1 · this-week 5 · metrics 5 · outcomes 68 · everything-work 607
                # 55 of 94 rules bind >=1 node at rest; 20 error (event-query, needs window_days)

# ── STAGE 4 — THE NUMBER: the engine's own rules pass, twice, differenced ──
s4_realpass.py 12
                # rest pass: 28 firings, 383 writes, 35 nodes changed, 0 raised, 0.9 s
                # 192 gestures across 20 views; per view: d1/d2/d3/d4, union, in-view changes
                # whole measured closure 21 of 94; depth<=2 = 19 of 21 = 90%
                # routine chain: 10 -> 0 -> -10 -> -4, four links

# ── STAGE 5 — the chain (M1) ──
s5_chain.py     # 186 sections, 186 with a qualification, 159 distinct patterns
                # 0 container_node ids, 185 declared_name, 104 of 121 names are header titles
                # structural (identity-unique) types: capability class explainer header
                #   package principle sink
                # 172 of 1,918 memberships are structural, in 8 views
                # 60 of 252 patterns root on a structural type; 20 of 94 rules bind one
                # entry-set decision: 135 root-predicate-only, 51 +steps, 0 config-decidable
                # 10 sections depend on $cycle_*

# ── STAGE 6 — escapes + the empirical record ──
s6_escapes.py   # event-log 20, clock 11, traversal 24, multi-bind 21; union 60 of 94
                # event_log: 34,608 rule.fired rows, 68 of 94 rules ever fired, 31 never
                #   median 250 firings per cycle
                # never fired includes stamp-completed-at-on-done-routine (INPUT WINS
                #   means the gap-fill has never once run)

# ── STAGE 8 — stability (M5) ──
s8_stability.py # same gestures under 2026-07-24 / 07-31 / 08-14
                # 7 of 9 views identical; 2 move by exactly promote-scheduled-routine-to-open

# ── THE APP'S WRITE PATH, ENUMERATED (never grepped for absence) ──
grep -n "writeFile("      app/index.html   # 1 definition, 2 call sites (1584, 1608)
grep -rn "applyEdit("     app/             # 5 sites outside source.ts, all take server strings
grep -n  "graphData = "   app/index.html   # 1034 null, 1585/1609/1704 = api() result, 1880 null
grep -rn "\.markdown ="   app/ worker/src/ server/   # 0 assignments; 2 comparisons
```

**The bundle load emits several thousand `structlog` debug lines.** Silenced with
`logging.disable` + a filtering bound logger in `common.py`. Recorded because the first run looked
like a failure and was not.

# Design: local behaviour and the behavioural queue — what the browser may compute, and what it may only say

**Status: design only. No application source is modified on this branch. This document is the only
file it adds.**

**Branch:** `design/local-behaviour`, based on `origin/main` @ `6e51c5a`.

**Scope:** the front half of `the-edit-is-a-safe-haven` and `the-world-moves-around-you`. It answers
one question — **when the operator acts, what may the browser show him before the engine has
answered, and where does the authority for each of those things come from.** It governs; it is not
itself a refactor.

The operator named the capability in his own words on 2026-07-31:

> "i think we should basically have a system which is a combination of elegant front end state
> management (as much as poss of handling impact front end. **like if i check off a node and its in
> another section below it checks too. so it feels model like as much as pos**) combined with async
> and a **behavioural queue** that simply propagates back to the app **around or focus delta active
> stuff (only place edit or view dominates)** which pushes changes back as they come around our
> work"

and then, when asked which of three options he wanted, answered with a fourth:

> "we could have a **front end view-specific parallel computation**. So it feels lightning fast.
> Basically **the browser computes whatever rules you have that apply downstream to what you're
> doing in that view, real time**. And they are also all being sent to the model, that is doing them
> for real — same result for view-wide, and more in background for other views (or maybe wider
> round-trip events that go out of view-relevant logic and then eventually come back — but rare, and
> would 'feel' appropriate if it took a minute)."

**His first sentence and his second sentence describe two different machines, and only one of them
can be built.** Separating them is the whole content of this document.

**Evidence labels** follow `design-presentation-cascade.md`, `design-the-structural-language.md` and
`design-the-edit-is-a-safe-haven.md`:

* **[OBS]** — I ran it or read it and am reporting the output.
* **[REA]** — reasoned from something labelled [OBS]. Stated as reasoning, never as measurement.
* **[REPO]** — quoted from a record I did not independently reproduce.
* **[UNVERIFIED]** — named, with the experiment that would settle it.

**Absence is never proven by a grep returning nothing.** Where I claim something does not exist I
enumerated every site of the thing. §3.2 is the clearest case: I enumerated every key the rule
language admits rather than searching for the key I expected to be missing.

Sizes are the house scale: **under an hour** / **half a day** / **an arc**.

**Naming.** `qntm` is the engine, read-only at `/Users/lukeannison/projects/qntm-network/qntm`.
`qntm.network` is the product; app paths are this worktree.

---

## 0. Lead — the seven things established before any design

### 0.1 His own example is free today, and I proved it against the shipped bundle

**[OBS]** *"If I check off a node and it's in another section below it checks too"* needs no rules,
no engine change, no new edit kind and no server. It is a fold of the **existing** `applyEdit` over
the line indices the **existing** `instancesOf` already computes.

The script imports `dist/present.js` — the artifact the browser loads — and reads `~/qntm/*.md`
read-only. Nothing is mocked. Three arms, three real views:

```
── this_week.md (19 lines) ──
   nodes printed >1x, found by instancesOf alone: 3
   ARM: tick qntm:1975, printed at [2,12]
      [2]  "- [ ] Schonfeld trial + conversion [[qntm:1975]] #outcome #work ☑️ 1"
      [12] "- [ ] Schonfeld trial + conversion [[qntm:1975]] #outcome #work ☑️ 1"
   A (ships today): lines changed = [2]
      the other printing still reads "- [ ] Schonfeld trial + conversion …"
   B (propagated):  lines changed = [2,12]
      line count 19 -> 19
      lines changed that are NOT a printing of qntm:1975: 0
      rules consulted: 0 — the only inputs were the source string and the node id.

── work/waiting_for.md (106 lines) — 28 nodes printed twice ──
   ARM: tick qntm:1970, printed at [2,98] — INDENTED at 2, FLUSH at 98
   B: lines changed = [2,98]; leading-space (before,after) per printing = [[4,4],[0,0]]

── personal/daily.md (199 lines) — 20 nodes printed twice ──
   B: lines changed = [15,123]; 0 lines changed that are not that node
```

**The indentation case is the one worth pausing on.** The two printings of `qntm:1970` are **not**
byte-identical — one sits under `## Waiting For` indented four spaces, one under `## Blocked` flush
left. A propagation that copied the line would have destroyed a structural fact. `set-checkbox`
cannot: its regex captures everything before the glyph and everything after it and changes only the
character between (`app/present/source.ts:119`, `:202`). **The affordance that already exists is the
affordance this needs, and it is safe for a reason that was argued for something else.**

### 0.2 The engine agrees that both printings are one node — measured across his whole vault

**[OBS]** Across all 77 files of `~/qntm`: **88 nodes print more than once inside a single file, on
184 lines. All 184 are checkbox lines. The number of printings of one node that disagree about the
checkbox glyph is ZERO.**

**[REA] That is the whole argument in one number.** The engine renders every printing of a node from
that node's `status` field, so two printings of one node can never disagree. Propagating a tick from
one printing to the other does not predict anything — **it restores an invariant the engine already
maintains and the browser is currently breaking.**

The vocabulary says so directly. **[OBS]** `apps/qntm-md/config/vocabulary/checkbox.yaml:1-7` is six
rows mapping a glyph to one field:

```
checkbox:
  - { token: "[ ]", field: status, value: open }
  - { token: "[x]", field: status, value: done }
  …
```

and the render side is the inverse, a six-row first-match table over the same field
(`apps/qntm-md/src/qntm_md/render/contracts/render_checkbox.yaml`, declared in its own header as the
sole source of truth for the glyph).

### 0.3 The engine handles two edited printings of one node, and it is not an accident

**[OBS]** `apps/qntm-md/src/qntm_md/io/applier.py:1615-1738`, `_detect_projection_field_conflicts`:
when two candidates propose a value for the same `(node, field)`, the engine collects both. If
`len(proposed_value_keys) <= 1` — the values agree — it does nothing. If they disagree it raises
`ProjectionConflictError`, emits a needs-attention diagnostic, and marks the field conflicted so that
**neither** proposal writes (the guard at `:2352`, `and (id(ac.candidate), qntm_id, k) not in
conflicted_candidate_fields`).

Three further properties make the propagated write a provable no-op rather than a hope. **[OBS]**

| property | file:line | consequence for a propagated tick |
|---|---|---|
| `delta` drops any value equal to the live field | `applier.py:2348-2354` | the second candidate writes nothing |
| `previous_status` is read from **live** fields at the top of each candidate | `applier.py:2292` | the second candidate sees `done` and emits **no second completion event** |
| the code names the two-candidate case explicitly | `applier.py:2305-2311` — *"by the time a second candidate for the same node is processed the field may already be cleared"* | it is a designed-for case, not an untested one |

**[REA] So propagation is idempotent at the engine and single-printing editing is not obviously
safer.** Both produce one `set_field`. Both produce one completion event. The difference is only what
the operator sees in the ten seconds in between. **[UNVERIFIED]** — I read this and did not run a
cycle. §12.1 names the experiment.

### 0.4 The rules are declared — and they cannot name a view, which is decisive

**[OBS]** `apps/qntm-md/config/rules/` holds **42 files and 94 rules**. The condition grammar is
closed and tiny: `eq ne gt gte lt lte in regex null` + `and or not` + `exists forall`
(`core/rule-engine/src/qntm_rule_engine/compiler/core.py:28-36`). The whole engine is 3,280 lines of
Python across eight modules.

**[OBS] Every key that appears in any of the 94 rule declarations, enumerated by stripping comments
from all 42 files and listing every key at rule scope:**

```
94 for_each   94 actions   82 when   51 pattern   26 eq   18 priority
16 exists      9 and        8 on      5 not        4 or    1 iterates   1 bind
```

**There is no `view:`, no `path:`, no `section:` and no `file:` — and not because none happens to be
used. The vocabulary has no such term.**

**[OBS] The patterns are the same, and proved the same way.** Every key used anywhere in the 138
pattern files (252 named patterns), enumerated with comments stripped, is either structural —
`root parameters description steps find node_type edge_type exists not_exists children parents
ancestors descendants min max not compose` — or the name of a **node field** (`status` 164, `project`
60, `domain` 52, `available_date` 18, `completed_at` 7, `cluster_locked` 5 …). **No key anywhere in
that enumeration names a view, a file, a path or a section.**

**[REA] "View-specific rule computation" is therefore not a narrowing of the existing language. It is
a concept the language cannot express.** A rule does not apply *in a view*; it applies to a set of
nodes selected by a whole-graph pattern query, and a view is a separate, later projection of whatever
the rules left behind. **This is the single fact that decides Q7, and it is a fact about his config
rather than about the browser.**

### 0.5 A tick writes the most contended field in the system

**[OBS]** Across the 94 rules, computed by extracting every `field:` written and every field read
through `$current.node.fields.*` and through pattern `find:` / step filters:

* **15 rules write `status`.** 42 rules read it.
* **75 of 94 rules read a field that another rule writes.** Only 19 read nothing another rule writes.
* Priorities in use: `10, 5, 3, 0, -1, -2, -4, -5, -10, -20`.

The 15 writers of `status`, with priorities, are the rules that can move the operator's own tick
inside the same pass:

```
pri  -1  follow_up_chain_promotion       onboarding_followups
pri   0  promote_scheduled_routine       promote-scheduled-routine-to-open
pri   0  requires_status_propagation     node-with-live-requires-gets-status-waiting
pri   0  routine_complete_reset          routine-complete-reset-available-date
pri  -2  routine_reset_cascade           routine-reset-cascades-to-descendants
pri   0  sponsorship_cascade             unblock-node-when-all-requires-done
pri   0  unlocks_status_propagation      unlocks-link-becomes-held   (+2 more)
pri   0  waiter_status_propagation       target-of-open-waiter-gets-status-waiting  (+1)
…
```

**[OBS] The most concrete consequence: ticking a routine does not leave it ticked.**
`config/rules/routine_complete_reset.yaml:39-52` sets `available_date` from the cadence and
`status: scheduled`. The rendered glyph for `scheduled` is `[>]`, not `[x]`
(`vocabulary/checkbox.yaml:6`). **[REA] A browser that predicted "it stays ticked" would be wrong for
every one of the 45 routine nodes in his graph, every time.**

### 0.6 The pass is the unit, not the rule — so "which rules apply" has no local answer

**[OBS]** The rules phase is **one priority-ordered pass with no fixpoint loop**
(`core/rule-engine/src/qntm_rule_engine/executor/core.py:48-86` sorts by priority, `:763-808` runs a
single `for rule in selected:`). Cascading is achieved by ordering over shared mutable graph state,
not by iteration. The one fixpoint diagnostic that exists,
`orchestrator.py:3758 _verify_cycle_phase_ordering`, reads `pending_action_evidence`, which is
declared at `orchestrator.py:526` with default `()` and populated **only** by three hand-built test
fixtures — **[OBS]** five references in total across `src/` and `tests/`. It can never fire in a real
cycle.

The operator's own config records what that costs when the order is wrong.
**[REPO]** `config/rules/routine_reset_cascade.yaml:19-24`:

> *"The order is load-bearing and was got wrong once: the marker this rule reads is PRODUCED by the
> reset, so running before it saw nothing and **the cascade landed a whole cycle late**. The full
> chain is stamp_completed_at (10) → routine_complete_reset (0) → this (-2) → clear (-4)."*

**[OBS] And the rules that look most local are local only because of the chain.**
`unlocks-link-to-hold` has a zero-step pattern selecting on `status: open, cluster_locked: true`
(`config/patterns/unlocks_propagation.yaml`) — genuinely node-local. But `cluster_locked` is written
by `unlocks-link-becomes-locked`, whose pattern walks `parents: {edge_type: UNLOCKS}` twice. **[REA]
Locality is not a property a rule has. It is a property of the position a rule occupies in one
ordered pass**, and pulling a "local" rule out of that pass gives a rule that computes nothing.

### 0.7 The browser already holds the graph, and its blast radius is small — measured

**[OBS]** A read-only copy of `~/.qntm-md/state.db` (copied, never opened for write; no cycle run):

```
graph_state row = {version, nodes, edges}   1,501 nodes   460 edges   805,155 bytes
edge types:  PART_OF 417   WAITING_FOR 22   REQUIRES 17   UNLOCKS 4
node shape:  {"id": "<uuid>", "type": "task",
              "fields": {"title": …, "qntm_id": "33", "status": "done", …}}
```

That object reaches the browser today — `server/app.py:188-196` puts it in the envelope,
`worker/src/app.js:144` forwards it. **[OBS] Nothing in `app/` reads it.** Proved by enumerating
**every** one of the 13 `graphData` references in `app/index.html`: three are assignments
(`:1562, :1586, :1680`), one is a nulling (`:1856`), two are existence checks (`:1199, :1720`), four
are `?.snapshot?.views.find(...)` (`:1226, :1303, :1406, :1904`), and one is a comment (`:1498`).
**There is no reference to `.snapshot.graph` or `.snapshot.locations` anywhere in the app.**

**[OBS] `locations` is also empty at the source** — `server/app.py:193`,
`"locations": {},  # node -> {view,line}; wired when we do two-way gestures`.

**[OBS] The blast radius of a real tick, computed over his real graph and his real vault.** For every
tickable printing (1,741 of them), the affected set is the node's PART_OF ancestors and descendants
plus its one-hop `REQUIRES` / `UNLOCKS` / `WAITING_FOR` neighbours:

| | mean | median | max |
|---|---|---|---|
| affected nodes (excluding the node itself) | **1.61** | 1 | 34 |
| of those, **also printed in the same view** | **1.33** | 1 | 34 |

**42 % of ticks (734 of 1,741) have an affected set that is entirely outside the view he is
looking at.**

**[REA] So the entire in-view consequence of a typical tick is the row he clicked, at most one other
printing of that same node, and about one related row.** That number is what §3 is priced against.

---

## 1. Q1 — the line, and it is not where I was told to look for it

The coordinator's hypothesis was that the line runs between **propagating identity** and
**evaluating rules**. That is right, and it is not fine enough: there is a **third** category between
them which is where most of the value is.

**The line is drawn by what a claim ASSERTS, not by how much work it takes.**

| category | the browser's claim | authority | cost |
|---|---|---|---|
| **IDENTITY** | *"these two rows are the same node, so what you did to one you did to both"* | the source string alone | free |
| **ADJACENCY** | *"this row names a node one edge away from the one you touched, so it may change"* | `snapshot.graph`'s edges | one traversal of 460 edges |
| **EVALUATION** | *"this row will become X"* | the whole graph, the event log, the clock, and one ordered pass | a second engine |

**IDENTITY and ADJACENCY assert facts about the MODEL'S SHAPE. EVALUATION asserts a fact about the
FUTURE.** Only the third can be wrong, and only the third needs the rule engine.

### 1.1 Every class of consequence he would notice, sorted

Each row cites what computes it. "Free" means the browser can do it from what it already holds.

| # | what he would notice | needs | why |
|---|---|---|---|
| 1 | the box he clicked ticks | **free — ships today** | `paint.ts:911-921` |
| 2 | **the same node's other printing ticks** | **free — IDENTITY** | `instancesOf` already returns `node` per line (`instance.ts:154`); 0 disagreements across 184 real lines (§0.2) |
| 3 | a related row is *marked as pending* | **free — ADJACENCY** | 460 edges in the payload; mean 1.33 in-view neighbours (§0.7) |
| 4 | **the box stays ticked, or flips to `[>]`** | **RULES** | 15 rules write `status` (§0.5); routines provably flip (`routine_complete_reset.yaml:39-52`) |
| 5 | a parent's `☑️ N` increments | **RULES** | `stamp_outcome_done_task_count.yaml` reads `$current.counts.children_count`, a pattern aggregate |
| 6 | `✅ <date>` appears | **RULES + CLOCK** | `stamp_completed_at.yaml:24` writes `$cycle_today`, injected at `orchestrator.py:4507-4519` |
| 7 | a sibling becomes `waiting` / unblocks | **RULES + TRAVERSAL** | `requires_status_propagation.yaml`; pattern root is `find: {}` — every node — then a `children: REQUIRES` step |
| 8 | a routine reschedules to a new `🛫 <date>` | **RULES + CLOCK + DATE GRAMMAR** | `compute_date`, `expression: "cadence:…"` |
| 9 | a node leaves this section / appears in another | **PATTERN QUERY** | sections declare `qualification: <pattern>` (`views/this-week.yaml:21-38`); `status` is the single commonest filter key across the 252 patterns, 164 uses |
| 10 | the node's type changes shape | **RULES** | `set_node_type`, 9 uses (auto-outcome / auto-habit / auto-ticket) |
| 11 | a `🎯` or metric moves | **RULES + EVENT LOG** | 20 of 94 rules bind `*-events-window` patterns against the SQLite event log with a wall-clock window (`substrate_wiring/pattern_resolver.py:200-328`) |
| 12 | a whole subtree appears | **RULES + STRUCTURE** | `create_subtree`, 3 template rules |
| 13 | a node is deleted | **RULES + STRUCTURE** | `graph_hygiene.yaml`, `delete_node` |

**Two rows are free. One more is free if the claim is weakened from "will" to "may". Ten need the
engine.**

### 1.2 The asymmetry that makes this safe rather than merely cheap

**Class 2 cannot be wrong, and that is a property, not a probability.** Propagating a tick to the
other printing of the same node makes **no prediction**. It says only *"you ticked that node"* —
which is true by construction, because you did.

Even in the routine case, where the engine will return `[>]` rather than `[x]`, propagation is still
correct: both printings show `[x]` for ten seconds and both show `[>]` afterwards. **They never
disagree with each other, which is the only thing "feels model-like" actually asks for.** Class 4
would have to guess `[>]` and would be wrong for every non-routine.

---

## 2. Q2 — how much of "feels model-like" is free, in his real numbers

**Measured against `~/qntm` and a read-only copy of his graph, not a hypothetical.**

| | number | source |
|---|---|---|
| files in the vault | 77 | §0.2 |
| files with at least one node printed twice | **11** | §0.2 |
| nodes printed more than once inside one file | **88** | §0.2 |
| lines involved | **184**, all of them checkbox lines | §0.2 |
| printings of one node that disagree about the glyph | **0** | §0.2 |
| tickable printings, resolved against the graph | 1,741 | §0.7 |
| mean in-view affected rows per tick, excluding the node | **1.33** | §0.7 |
| ticks whose consequences are entirely out of view | **42 %** | §0.7 |

**[REA] Read together, these say something sharper than "some of it is free".**

His whole in-view consequence budget for a tick is roughly **two extra rows**: the same node printed
again, and about one neighbour. **One of those two is free and exact. The other is free only as a
"may change" mark.** There is no third thing hiding in the middle that a rule engine in the browser
would unlock — the engine's remaining output lands out of view 42 % of the time and on ~1.3 rows the
rest of the time.

**Where the duplication concentrates, and it is not uniform** **[OBS]**:

```
work/waiting_for.md    106 lines   28 nodes printed twice   60 lines
personal/daily.md      199 lines   20 nodes printed twice   44 lines
work/outcomes.md       240 lines   16 nodes printed twice   32 lines
personal/outcomes.md    69 lines    9                       18
this_week.md            19 lines    3                        6
```

`work/waiting_for.md` prints 28 of its 70 nodes twice, on 60 of its 106 lines. **[REA] More than half
that view is a second lens on something already on screen.** The view's own config says so —
`views/this-week.yaml`'s header calls the paired sections *"different lenses"* on one node. **This is
not an edge case in his vault; in his `Waiting For` view it is the majority case.**

**The cost of the free half, measured** **[OBS]**, against the shipped bundle:

```
work/waiting_for.md   106 lines   instancesOf 0.325 ms   2x applyEdit fold 0.046 ms
personal/daily.md     199 lines   instancesOf 0.200 ms   2x applyEdit fold 0.047 ms
work/outcomes.md      240 lines   instancesOf 0.243 ms   2x applyEdit fold 0.073 ms
```

`instancesOf` is **already** called once per paint (`instance.ts:154`, `paint.ts` via
`deps.view`), so the marginal cost of class 2 is the fold: **about 0.05 ms**, against a 49 ms repaint
**[REPO]** (`research-state-and-speed.md:312-320`) and a ~10 s cycle.

---

## 3. Q3 and Q7 — his own architecture, priced

He asked for *"the browser computes whatever rules you have that apply downstream to what you're
doing in that view, real time"*. **I am recommending against it, and here is the bill, item by item.**

### 3.1 The four things the browser would have to acquire

**[OBS]** The rule engine takes four things from its consumer
(`core/rule-engine/src/qntm_rule_engine/protocols.py:16-81`). The generic engine knows nothing about
graphs, nodes or markdown; **everything qntm-specific is on the consumer side of those four seams.**

| seam | qntm-md's implementation | what a browser port costs |
|---|---|---|
| `PatternResolver.resolve_pattern` | `substrate_wiring/pattern_resolver.py:59` → `core/graph/.../patterns/engine.py` | the pattern query language: 11 step methods (`children parents ancestors descendants siblings find_nodes find_nodes_by_query get_node get_edges shortest_path subgraph`, `patterns/registry.py:16-25`), 6 composition keywords, 5 constraints — **plus** the event-log source at `pattern_resolver.py:200-328` |
| `ActionDispatcher.dispatch` | `substrate_wiring/dispatcher_registry.py:74-118` | **21 verbs**, of which 9 mutate the graph and 11 do arithmetic into rule-local scope |
| `FieldResolver.resolve` | `orchestrator.py:2014` | the cheapest one — dotted path lookup |
| `EventPersistence.record` | the SQLite event log | 20 of 94 rules read it; nothing puts it on the wire |

Plus the executor's priority sort and single-pass semantics, plus `$cycle_today` / `$cycle_week_end`
resolved through the logical-day config (`orchestrator.py:5432`, `config/day_boundary.yaml`).

### 3.2 And then it would have to RENDER the answer, which is the part nobody has priced

Suppose the browser computed a rule correctly. **It would then hold a changed FIELD, and a field is
not a line.** Turning `completed_at = 2026-08-01` into the characters `✅ 2026-08-01`, in the right
cell, in the right order relative to `#work`, `🛫` and `☑️`, is the renderer's job. **[OBS]** The
ordering is itself declared, in three contracts that live **inside the Python wheel** and are
explicitly unreachable from the operator's config: `render/contracts/order_tags.yaml`,
`order_markers.yaml`, `order_edge_tags.yaml`.

**[REA] So "compute the rule locally" is not one port. It is a port of the evaluator, the pattern
query engine, the verb table, the clock, the event log AND the renderer** — and the last of those is
the thing this project's standing architectural line is about.

### 3.3 The one that would actually hurt: a local guess becomes an authored fact

**This is the argument that closes it, and it is not about effort.**

The write unit is the whole file. Anything the browser puts in the source string arrives at the
engine as **text the operator typed**. **[OBS]** `config/rules/stamp_completed_at.yaml:2-5` states
the precedence in its own header:

> *"**INPUT WINS**: the operator's `✅ <date>` marker lands `completed_at` at parse-time, **before**
> this rule; this only FILLS THE GAP when `completed_at` is null."*

**[REA] So a locally-computed `✅ 2026-08-01` written into the file would not be checked against the
rule. It would OVERRIDE it.** A guess that reaches the source string stops being a guess and becomes
an assertion, and the rule whose job it was to compute that value would then defer to it forever.

**And the engine already declares which values are safe from this.** **[OBS]**
`config/vocabulary/markers.yaml` has 13 markers; exactly **two** carry `render_only: true` —
`☑️ done_task_count` (`:13`) and `🎯 par` (`:18`), with the note *"Edits to ☑️ N are ignored"*. The
other eleven, `✅ completed_at` included, are authored input.

**[REA] `render_only` is the operator's own config already drawing the line this design needs: a cell
that is OUTPUT ONLY may be computed anywhere, because nothing will read it back. A cell that is input
may not.** Two of thirteen. That is the safe surface, and it is small.

### 3.4 Q7 answered — "view-scoped" is a convenient boundary, not a real one

**It is not real, and §0.4 is the proof.** No rule can name a view; the language has no term for it.
A view is a **later** projection of whatever the rules already did, selected by `qualification:
<pattern>` (`views/this-week.yaml:21-38`) over a pattern whose root is frequently `find: {}` — every
node in the graph (`config/patterns/unlocks_propagation.yaml`,
`config/patterns/requires_propagation.yaml`).

**And the boundary leaks in both directions:**

* **In.** 75 of 94 rules read a field another rule writes (§0.5). A rule "in view" needs the output of
  a rule that was not.
* **Out.** 42 % of ticks have their whole consequence out of view (§0.7). A view-scoped evaluator
  would be silent for those and the operator would not know which case he was in.

**[REA] So the answer to "is view-scoped a real boundary" is that a view is a boundary on WHAT IS
SHOWN and no boundary at all on WHAT IS COMPUTED.** It is the right scope for the *screen* — which is
what §4 uses it for — and the wrong scope for the *model*.

### 3.5 Is a second evaluator ever acceptable? The cascade's bet, tested

The coordinator asked the right question: the presentation cascade already runs two implementations
of one declared language — `resolution/` in Python and `app/present/` in TypeScript — and that bet
was taken deliberately. Does it scale from renditions to rules?

**What makes the cascade's bet safe is three properties, and rules have none of them.**

| property | the cascade | the structural language | a rule replay |
|---|---|---|---|
| **the output is presentational** — a wrong answer makes a line *look* wrong and reaches no file | yes | yes — it narrates, `design-the-structural-language.md` §4 | **no** — §3.3 |
| **the input is a document, not a database** — `presentation.json`, 1,244 bytes, fetched once | yes | yes | **no** — the whole graph, the event log and a clock |
| **there is a byte-for-byte comparison against the other implementation** | `tests/present-golden.test.mjs` compares against a historical reference via `git show BASE:app.html` | `tests/present-structural.test.mjs` §3 regenerates from live config and asserts equality | **no equivalent exists** |

**[REA] The third row is the one that cannot be fixed.** A golden test works because the input is
fixed and the output is a string. A rule evaluator's input is a graph that changes every cycle and a
clock that changes every day, so the equivalent is not a golden test but a **conformance suite
against a moving target** — one that would have to re-run per cycle to mean anything, on data that is
not in this repository.

**And the failure mode is the one this project has already named and paid for.**
**[REPO]** the `asserted` row `flag-one-markdown-implementation-is-now-three` records the same shape
one level down: a second implementation arrived on the same day the first was retired, and neither
was visible to the routing that was supposed to see it. **[REA] A second markdown renderer produced a
line that looked slightly wrong. A second rule evaluator would produce a line that looked
authoritative and was wrong about the operator's own model.**

**Verdict: no. The evaluator is irreducibly server-side.** Not because the rules are not declarative
— they are, and beautifully so — but because a rule's meaning is a function of the whole graph, the
event log, the clock, and its position in one ordered pass, and its expression is a function of a
renderer. **[REA] The declaration is portable. The evaluation is not, and the two are not the same
thing.** That is the same distinction `design-the-structural-language.md` §0.2 drew between detection
and meaning, arriving from the other side.

### 3.6 What I would build instead, and it delivers his sentence

He asked for *"lightning fast"* and *"feels model like"*. **Those are satisfied by classes 2 and 3
and not by class 4.** The three options in the brief resolve as:

* **Publish the rule, replay it — REFUSED.** §3.1–§3.5.
* **Show provisional state — ADOPTED, and sharpened.** §4. The browser does not say "waiting"
  everywhere; it says it on the rows it can prove are adjacent, which is a much smaller and much more
  useful claim.
* **Round-trip faster — YES, and it does not shrink the problem to nothing.** ~250 ms is far better
  than ~10 s, but the operator's own reachable numbers are ~518 whole-graph pattern queries and
  "millions of predicate evaluations" per cycle **[OBS]** (`substrate_wiring/pattern_resolver.py:71-76`;
  `server/app.py:47-51`). A cycle is not going to become a keystroke. **And speed is not the same
  gesture as correctness**: at 250 ms, class 2 is still needed, because two printings of one node
  disagreeing for 250 ms is still two printings disagreeing.

**His latency budget is the gift that makes this work.** He said out-of-view consequences may take
**a minute**. **[REA] That removes push from the critical path entirely.** A 60-second budget is
satisfied by a poll. The arc named `the-projection-arrives-without-being-asked-for` can be split, and
its cheap half — a poll that lands a fresh projection through the reconciler — is a fraction of the
transport work its current framing assumes.

---

## 4. The third category — show the AFFECTED SET, never the ANSWER

**This is the design's own contribution and it is what makes "feels model-like" true without a second
interpreter.**

**The browser can compute the blast radius without computing the consequence.** A traversal of
`snapshot.graph`'s edges answers *"which printed rows name a node one relation away from the one you
touched"*. That is a fact about the model's shape, exactly like identity, and it is decidable from
data the browser already has: 1,501 nodes and **460 edges**, 805 KB, already on the wire (§0.7).

**What it says, and the wording matters:** the row is marked *recomputing*, not *waiting*, not
*done*, and never a predicted value. **[REA] "This may change" is always true. "This will become X"
is true only if a second evaluator is right.** The first needs no rules; the second needs §3.1.

**Why this is honest rather than a hedge.** A person who ticks a subtask and sees its parent shimmer
learns something real: *the system knows these are connected, and it is thinking about it.* That is
the feeling he described. A person who sees the parent tick itself and then untick ten seconds later
learns something false and then learns he cannot trust the screen.

**What it costs.** One index from `qntm_id` to node id (1,501 entries, one pass), one traversal per
gesture over 460 edges, and a CSS class. **[REA] It is the cheapest thing in this document after
class 2 and it is the only thing that scales**: adding a rule to `config/rules/` does not change it,
because it never read the rules.

**It also closes an existing row rather than adding one.** `resolve-from-the-model-not-the-text`
(stage 6, half a day, `diagnose-ready`) already asks for `PresentationContext` to reach
`snapshot.graph`. **[REPO]** its own falsifier is *"a resolution computed from a node field ABSENT
from the rendered text"*. **This is that row's first load-bearing consumer**, and the second one —
`the-vanished-line-is-parked-not-dropped` already names it as the way to tell "left the view" from
"left the graph".

---

## 5. Q4 — the behavioural queue, concretely

He said the queue *"propagates back to the app around or focus delta active stuff (only place edit or
view dominates)"*. Made concrete:

### 5.1 What is queued — projections, and at most one per file

**A projection, not a delta.** `paint(body, source, context, deps)` rebuilds a whole view from **one
string** (`paint.ts:452`, `:537`), so installing a projection is already a one-argument operation
with no diff and no DOM reconciler. **[REPO]** the existing row
`the-projection-arrives-without-being-asked-for` records this as why the arc is smaller than it
sounds.

**The queue COALESCES; it does not accumulate.** At most one pending projection per path, replaced
wholesale by a newer one. **[REA] Two queued projections is one queued projection and one lie**: a
projection is an absolute statement about a file, not an event, so replaying an older one after a
newer one would move the screen backwards. This is the same discipline `BaseSurface` already applies
one level down — *"It is REPLACED rather than accumulated: one base, for the file on screen, because
a base that outlives the projection it came from is a lie"* (`app/index.html:1305-1310`).

Ordering is decided by `generated_at`, which the envelope already carries
(`server/app.py:190`). An arrival not newer than the one installed is dropped.

### 5.2 What applies it — `paintView`, and nothing new

**[OBS]** `paintView` (`app/index.html:1272`) is already *"the one place a view is chosen or re-read
from the server"*. It already distinguishes a **view change** from a **projection arrival** with one
boolean (`sameView`, `:1276`), already takes the base (`:1305`), already re-anchors the cursor by
identity (`:1324`) and already reports a refusal into `#freshness` (`reportCursorReading`).

**[REA] The queue's consumer therefore already exists and already makes the one distinction the whole
design turns on.** What is missing is a producer and a gate.

### 5.3 When a queued change touches the row the cursor is in

**Nothing happens to that row.** It is the **held line** —
`the-open-line-survives-a-new-projection`, row 3, still `diagnose-ready`. The row is reused rather
than rebuilt, its characters are never sourced from the arriving projection, and **the base moves
underneath it** so that settlement computes `set-line` against the projection current at settlement
time.

**`app/present/draft.ts` is the precedent and it is exact.** A `Draft` is *"a region of the screen the
source string does not own"* (`draft.ts:1-42`), held across the repaints of one gesture and thrown
away. **[REA] The held line is a second instance of one idea that shipped on 2026-07-31, not a new
idea** — and `draft.ts`'s own argument for why it is not a field on `FocusSurface` applies again: a
surface that holds an uncommitted edit is a different concern from one that contributes a cascade
level.

**Three surfaces, three lifetimes, and they must not merge:**

| surface | holds | dropped when |
|---|---|---|
| `FocusSurface` | which line, which column, the instance anchor | the cursor leaves |
| `DraftSurface` | a line being **made** | it settles or is abandoned |
| **held line** (row 3) | a line being **edited** | it settles |
| **pending projection** (this row) | the next projection for one path | it is installed or superseded |
| **affected set** (§4) | the node ids a gesture may have disturbed | the next projection lands |

### 5.4 When the queue and the operator disagree

**The projection wins every line except the one under the cursor. The operator wins that one.** That
is `design-the-edit-is-a-safe-haven.md` §5.4 as an algorithm, and it is short because the subjects
are disjoint: capability 2 owns the **state**, capability 1 owns the **delta**.

**The disagreement is SAID, never prompted.** The register already exists and already has a
precedent hours old: `writeNote` (`app/index.html:1253-1262`) is a sentence about a divergence the
app **detected and did not prevent**, held across the repaint the write's own answer causes, because
*"a modal in the middle of a sentence is a worse violation of the safe haven than the thing it is
protecting against"*.

### 5.5 What the queue is NOT

**Not a mechanism for the browser to hold changes of its own.** Everything in the queue came from the
server. The two things the browser computes locally — the propagated tick (§1, class 2) and the
affected-set mark (§4) — are **not queued**, because they are not arrivals. One is applied to the
source string immediately and posted; the other never touches the source string at all (§7).

---

## 6. Q5 and Q9 — sequencing, and the constraint

The backlog says async must not ship first: **[REPO]** `stop-awaiting-the-cycle-safely` —
*"shipping this first would make an invisible defect faster and quieter"*.

**Does his architecture change that judgement? Not in the direction he would hope, and I found a
second, sharper reason the row does not state.**

### 6.1 The queue does not make async safe, because they are different halves

**The clobber is a WRITE-path defect.** A save posts a whole file computed against a base that has
moved (`design-the-edit-is-a-safe-haven.md` §3). The queue is a **READ** path. **[REA] A read path
cannot close a write hole.** It narrows the window — a fresh projection arriving more often means the
base is fresher more often — but between the last arrival and the next click the base can go stale
for reasons the browser was never told about. `base.ts` says so about itself: *"IT ALSO CANNOT SEE A
CHANGE IT WAS NEVER TOLD ABOUT"* (`base.ts:35-38`).

**Only the server can refuse.** `the-write-is-refused-server-side` (row 5) remains the precondition,
and it is now a small change: **[REPO]** its own record says the browser already sends
`{path, markdown, base}` with `base = sha256-<hex>`, and the Worker simply drops the field.

### 6.2 The new reason, and it strengthens the row rather than weakening it

**Async alone does not merely hide the defect — it disables the detector that was built to see it.**

**[OBS]** `served.take(path, markdown)` is called in exactly one place: `paintView`, with the
markdown out of the projection being installed (`app/index.html:1305`). Async means the write acks
**without a projection**. **[REA] So with async and no queue, `BaseSurface` holds a base that is
never refreshed, `read()` returns `current` indefinitely, and the one sentence row 1 shipped stops
being said** — while the thing it describes gets more common, not less.

**Therefore: async requires the queue, and the queue does not require async.** That is a dependency
the backlog does not currently record, and it makes the existing ordering *more* firm rather than
less: `stop-awaiting-the-cycle-safely` now needs 1, 3, **5 and the queue**.

### 6.3 Q9 — does local computation change it?

He is right that the ~14 s stall is currently his only signal that something is happening, and that
local behaviour would replace it. **[REA] But what replaces it matters.**

* **Class 2 replacing the stall is a genuine improvement.** It is exact, so a fast screen is a true
  screen.
* **Class 3 replacing the stall is the best available.** A row marked *recomputing* says exactly what
  the stall said — *the engine is thinking about this* — and says it per row rather than per page.
* **Class 4 replacing the stall would be strictly worse than the stall.** A stall is honest about
  ignorance. A confident wrong answer is not, and the failure would be silent: **[REPO]**
  `design-the-edit-is-a-safe-haven.md` §3.3 already names *"the rule did not fire"* — silent, exit 0
  — as the worst diagnostic shape this project has a name for.

---

## 7. Q6 and Q8 — the round trip, and what happens when the two answers differ

### 7.1 Does `accept ⊇ emit` survive? Yes, under one rule

**The rule: local computation may change the SOURCE STRING only when it is a replay of the
operator's own gesture. Everything else may change only the SCREEN.**

| what | may it enter the source string? | why |
|---|---|---|
| the tick he made | **yes** — it already does | it is his |
| the same tick on another printing of the same node | **yes** | it is the same gesture on the same node; engine-idempotent (§0.3) |
| a marked-as-recomputing row | **no** | it is a fact about the moment, and it has no glyph |
| any rule's predicted output | **no** | INPUT WINS — it would be ingested as authored (§3.3) |

`accept ⊇ emit` survives because **nothing in the second half is emitted**. The affordances the app
offers stay expressible as the closed union of three (`source.ts:114`) and **no edit kind is added**.

### 7.2 Where provisional state lives

**In a surface, never in `graphData` and never in the source string.** Naming the trap precisely:
`served.take` must go on being called with *"the markdown out of the projection being installed —
never with a string this app computed"* (`base.ts:230-238`). **[REA] If a local propagation were
written into `graphData.snapshot.views[i].markdown`, the next `paintView` would take a
client-computed string as the base and the divergence detector would pass on a file it had itself
diverged.** The detector would not merely miss it — it would *certify* it.

So the affected set is held the way the cursor and the draft are held: computed, held across the
repaints of one gesture, dropped when the next projection lands, declared by nothing and served by
nothing. That is `focus.ts:29-35`'s rule applied a third time.

### 7.3 The cross-view divergence, which is the real Q6 risk

**[OBS]** Of the 2,036 printings of tickable nodes in his vault, **1,200 are in the node's busiest
single file and 836 — 41 % — are in another file.** A tickable node prints in a mean of 1.75 files;
one prints in 7.

**[REA] So class 2 has an obvious and tempting extension — propagate to the other views' cached
markdown too, since the browser holds all 77 — and it must be refused for the reason in §7.2.** The
write unit is one file. A propagation into another view's cached string would be a change that can
never be posted, sitting in the slot the base detector reads. **The cross-view printings are exactly
what the queue is for**: they update when the cycle answers, which is the honest mechanism, and under
his own stated budget they may take a minute.

### 7.4 Q8 — when the local answer and the server's differ

**The server is authoritative and the correction is silent for class 2, and visible for class 3.**

* **Class 2.** There is nothing to correct. The propagated glyph and the engine's glyph agree, or the
  engine moved the status for its own reasons and both printings move together. **[REA] A row that
  changes from `[x]` to `[>]` when the projection lands is the world moving, which is capability 2
  working, not a correction of an error.**
* **Class 3.** The mark clears when the projection lands. If the row did not in fact change, the mark
  was still true — it *may* have changed — and clearing it is the answer arriving.

**The posture is `base.ts`'s, and it is the right one here for the same reason.** That module reports
rather than prevents because *"a client that refused its own save would lose the operator's
characters and tell him nothing — strictly worse than the defect"*. **[REA] The mirror statement
holds: a browser that hid a consequence until it was certain would be showing him less than the
server knows, in order to avoid being briefly imprecise about something it never claimed.**

---

## 8. Which existing backlog rows this merges, and which it splits

**No row is invented where one exists.** Reading the eight `[haven]` rows plus
`resolve-from-the-model-not-the-text` against this design:

| existing row | verdict |
|---|---|
| `the-open-line-survives-a-new-projection` (3) | **unchanged and still required.** It is the queue's gate. Its own record says only the DELTA is left |
| `the-vanished-line-is-parked-not-dropped` (4) | **unchanged.** §4 gives it the `snapshot.graph` reader it says it needs |
| `the-write-is-refused-server-side` (5) | **unchanged, and promoted in importance** by §6.1 |
| `stop-awaiting-the-cycle-safely` (6) | **AMENDED — it gains a dependency.** §6.2: async without the queue silently disables `BaseSurface`. The row's stated reason is right and incomplete |
| `the-projection-arrives-without-being-asked-for` (7) | **SPLIT, on his own latency budget.** The queue and its gate (in-view, must be prompt) separate from the transport (out-of-view, a minute is fine). The first is half a day; only the second is an arc |
| `a-line-being-made-survives-a-projection-too` (8) | **unchanged.** Still worthless before the queue exists |
| `resolve-from-the-model-not-the-text` (stage 6) | **MERGED IN as a dependency of §4** rather than duplicated. §4 is its first load-bearing consumer; no scope is added to it |

**Two rows are genuinely new**, and both are small: identity propagation (§1 class 2) and the
affected-set mark (§4).

**Nothing here merges rows 3, 4 and 5 into one.** His framing makes them sound like one feature and
they are not: 3 is a painter change with no server, 4 is a UI decision, 5 is another repository.

---

## 9. Ranked order

Ranked by value per unit of cost. **Every row leaves the app better than the row before it and does
not require the next one to be correct.**

| # | row | size | ships what | why here |
|---|---|---|---|---|
| **1** | **`a-tick-reaches-every-printing-of-the-node`** | **under an hour** | fold `applyEdit` over every index where `instancesOf` reports the same `node`; post once | **FIRST.** It is his literal example, it is exact rather than predicted, it adds no edit kind, no declaration and no server call, and §0.1 proves it against the shipped bundle. It is also the only row here that makes the app agree with the engine about something it currently contradicts (§0.2) |
| **2** | **`the-open-line-survives-a-new-projection`** | **half a day** | the held line — existing row 3 | Unchanged and unmoved. **The queue must not land before it**, because a projection arriving mid-edit is exactly what it protects against. Its index half is already done |
| **3** | **`the-write-is-refused-server-side`** | **half a day** | existing row 5 — forward `base`, 409 on divergence | Now a three-line Worker change plus one comparison on the graph server. §6.1: nothing downstream is safe without it |
| **4** | **`a-projection-can-arrive-and-be-held`** | **half a day** | the queue: one coalescing pending projection per path, ordered by `generated_at`, applied through `paintView`, gated by the held line | **This is the behavioural queue.** Needs 2 and 3. Buildable with **no transport** — a manual trigger or a poll is enough to prove it, and §5.2 shows the consumer already exists |
| **5** | **`the-affected-rows-say-they-are-recomputing`** | **half a day** | §4 — read `snapshot.graph`, index by `qntm_id`, traverse, mark. Never a value, only a mark | Needs 1 and 4 (the mark must clear when a projection lands). Depends on `resolve-from-the-model-not-the-text`, which exists. **The whole of "the system is thinking about this", with zero rules** |
| **6** | **`stop-awaiting-the-cycle-safely`** | **half a day** | existing row 6 — ack on the vault write | **AFTER 3 AND 4, and §6.2 is the reason.** Async without the queue turns `BaseSurface` into a check that always passes |
| **7** | **`a-projection-arrives-without-being-asked-for`** | **an arc** | the transport half of existing row 7 — the server announces | Last, and **cheaper than its current framing** because his 60-second out-of-view budget is satisfied by a poll. Must not precede 2 and 3 |
| **8** | **`a-line-being-made-survives-a-projection-too`** | **under an hour** | existing row 8 | Needs 4 and 7. Genuinely worthless before them |

**Row 1 alone is his sentence.** Rows 1 and 5 together are the whole of *"it feels model-like"*.
Rows 2, 3, 4 and 6 are the whole of *"async that does not lose anything"*. **Nothing in this list is a
rule evaluator, and §3 is why.**

**Is this days or an arc? Days.** Row 1 is under an hour and is the thing he asked for. Rows 1–5 are
about two working days between them. **The arc is only row 7, and only its transport.**

---

## 10. Open decisions for the operator

**1. Does a projection arrive while a line is open, or wait for the cursor to leave?**
Carried forward from `design-the-edit-is-a-safe-haven.md` open decision 2, unchanged and now
load-bearing for row 4. *Waiting* makes capability 2 conditional on capability 1 being idle.
*Arriving* makes row 2 load-bearing rather than nice. **Cheap to change once, expensive once the
queue relies on it.**

**2. Should the mark in §4 name the relation, or only say "recomputing"?**
The browser can honestly say *"a parent of this may change"* — the edge type is in the payload. *If
named:* he learns the model's shape, which is the same value narration gives for indents
(`design-the-structural-language.md` §4). *If not:* one class, no vocabulary, no risk of the label
outliving the schema. **I specify the plain mark and note that naming it is a later, additive
question.**

**3. Is a node printed in a view the operator is NOT looking at ever updated locally?**
§7.3. *If yes:* his other views feel instant too, and the base detector is poisoned (§7.2) unless the
overlay is kept strictly out of `graphData` — which is buildable but doubles the surface. *If no
(what I specify):* those printings update when the cycle answers, inside his own stated one-minute
budget. **He gave the budget; I am spending it here.**

**4. When two printings of one node are on screen and he ticks one, should the other animate?**
Not an engineering question, and it changes whether row 1 reads as magic or as a glitch. **[REA] A
tick that appears in two places with no visible link is indistinguishable from a bug.**

---

## 11. What I refuted

**11.1 "His ask requires the front end to compute consequences, so either the line moves or the ask
decomposes."** **The false dichotomy is the finding.** It decomposes into **three** categories, not
two (§1), and the middle one — adjacency — carries most of the felt value at none of the cost. The
line does not move.

**11.2 The coordinator's hypothesis, upheld and then narrowed.** *"Propagating a fact to every
printing of the same node is identity propagation, not rule evaluation"* — **correct, proved against
the shipped bundle** (§0.1) and **corroborated by his whole vault** (§0.2: 184 lines, 0
disagreements). Narrowed in two ways it did not anticipate: the two printings are **not always
byte-identical** (§0.1, the indent case), so the propagation must be a glyph edit and not a line
copy; and the free half is **smaller than "a large part"** — it is 2 of 13 consequence classes, and
the third free thing is a different mechanism entirely (§4).

**11.3 "A large part of feels-model-like is free, and the expensive part is only what needs a
rule."** **Half right.** The free part is free. But the expensive part is not merely expensive — it
is **unsafe in a specific way nobody had named**: a locally computed value that reaches the source
string is ingested as authored input and **overrides** the rule that should have computed it (§3.3,
`stamp_completed_at.yaml:2-5`, "INPUT WINS"). That converts a performance question into a data
question.

**11.4 "The rules are declared, so both ends can read one declaration — the same shape as the
structural language."** **Refuted, and this is the most important refutation.** The declaration is
portable; the **evaluation** is not. `for_each` names a pattern, and a pattern is a whole-graph query
with transitive steps (§3.1); 20 of 94 rules read a SQLite event log that is not on the wire; 12 read
a logical clock; 75 of 94 read a field another rule writes, so the **pass** is the unit and not the
rule (§0.6). The structural language published a **lookup table**. Rules would require publishing a
**database and a scheduler**.

**11.5 "View-specific" is a scope the system supports.** **Refuted positively** (§0.4): I enumerated
every key in all 94 rule declarations. The complete set is `for_each actions when pattern priority on
bind iterates`. **A rule cannot name a view.** This was handed to me as the plausible framing and it
is the thing that cannot be built.

**11.6 My own first classification, refuted by my second.** A crude flag scan called **38 of 94**
rules "node-local only". Re-run with the action verbs included — aggregates, structural verbs, date
grammar — the number is **21**, and inspecting those 21 shows six are metric constants, six are
one-shot domain defaults, four are completed migrations, one is an internal marker, one is a stub
targeting node types that do not exist, and two are node-local **only because a traversal rule at
higher priority already ran** (§0.6, `unlocks-link-to-hold`). **The honest count of rules the operator
would observe firing in-view in response to a gesture, with no disqualifier, is approximately one.**
Recorded because the first number was plausible and would have supported the opposite conclusion.

**11.7 "The queue could be what makes async safe."** **Refuted** (§6.1) — a read path cannot close a
write hole. **And inverted:** async without the queue is *worse* than the row currently says, because
it disables `BaseSurface` (§6.2). The row's ordering is right; its reason is incomplete.

**11.8 "Ticking one printing and leaving the other is what the engine expects."** **Refuted in one
direction and confirmed in the other.** The unchanged printing emits no candidate
(`orchestrator.py:4437`, `candidates = diff_result.candidates`), so today's single-line tick is
accepted. But `_detect_projection_field_conflicts` exists precisely because two candidates for one
node is a real case, and it resolves **agreement** to a clean no-op (§0.3). **Propagating is not
riskier than not propagating; it is the same write.**

---

## 12. What is unverified, and what would settle it

**12.1 That a propagated tick produces exactly one `set_field` and one completion event.**
§0.3 is read from `applier.py`, not run. **Settled by** a hermetic cycle against a copy of the starter
bundle: render a node into two sections, tick both printings in one write, and assert one
`node.completed` event in the event log and one `set_field` in the evidence. **This is the one
experiment that would make row 1 provable rather than argued**, and it needs a cycle, which this
branch may not run.

**12.2 What the engine does with two printings that DISAGREE.** `ProjectionConflictError` is raised
and the field is dropped from both deltas (`applier.py:1695-1738`, `:2352`). I did not observe the
needs-attention diagnostic. **Settled by** the same hermetic cycle with one printing ticked and the
other edited to `[ ]` in the same write. **[REA] If this is right it is an argument FOR row 1**, since
today a second gesture inside one cycle could produce exactly that shape.

**12.3 Whether `snapshot.graph` is fresh enough to traverse.** The copy I read is `version: 2`,
updated 24 July; the vault markdown is 31 July. **[OBS]** the envelope reads the graph and the views
from the same cycle (`server/app.py:188-196`), so they should agree in production. **Settled by**
comparing `generated_at` against the views' own content on a live read — which needs a session this
branch does not have. **If they can drift, §4's traversal can mark the wrong row**, which is
survivable (the mark is a "may") but should be known.

**12.4 The cost of the §4 traversal on a phone.** Measured only in the abstract: 460 edges, 1,501
nodes. **[REA]** the index build is one pass and the traversal is bounded by the PART_OF depth of his
graph. Not measured on a device. **Settled by** the same harness `research-state-and-speed.md` §3.3
used for the painter.

**12.5 Whether he wants the propagated printing to animate.** Open decision 4. Not an engineering
question, and it decides whether row 1 reads as the model or as a defect.

---

## 13. The argument against the tempting answer

**The tempting answer is to build what he asked for: a front-end parallel computation of his rules,
scoped to the view.**

It is tempting for a good reason — **the rules really are declared**, in 42 YAML files with a closed
14-operator grammar, and this project has twice been right that a thing it assumed was hardcoded was
config. `design-the-structural-language.md` §0.1 proved an indent's meaning was declared by mutating
the config and watching the resolver. The instinct that says "do it again for rules" is the instinct
that has been correct here before.

**It is wrong this time, and the difference is precise.** The structural language's declaration is a
**lookup**: given a token and a section, what edge. It has no inputs beyond the declaration itself,
which is why publishing it was half a day and why the browser could become its third reader without
becoming its second author.

A rule's declaration is a **query plus a schedule**. Its inputs are the whole graph, an event log, a
logical clock and the fourteen rules that already ran ahead of it in the same pass. **[REA] Publishing
it would put a document on the wire that the browser could read and could not evaluate** — which is
worse than not publishing it, because a declaration that exists and does not reach is this project's
own named highest-frequency bug.

And the operator's own config already tells us where the safe edge is. Thirteen markers; **two**
carry `render_only: true`. Two cells in his whole vocabulary are output-only and therefore safe to
compute anywhere. **[REA] The other eleven are input, and a browser that computed one of them would
not be predicting his model. It would be editing it.**

**What is missing is not an evaluator. It is two folds and a traversal** — and one of them is
already written.

The sentence to hold onto is the one his own gesture already contains:

> **Two rows are one node.**

The browser can know that from the string it was handed. Everything past it is the engine's, and the
queue is how it comes back.

---

## 14. Reproduction

Everything I ran, from this worktree. **No trunk clone was written. No cycle was run. `graph-sync`
was not run. Nothing was posted to any server. `~/qntm` was read only; `~/.qntm-md/state.db` was
COPIED and the copy was read. No application source is modified — this document is the only file this
branch adds.**

```
# ── THE FREE HALF, against dist/present.js — the artifact the browser loads ──
node <scratchpad>/identity.mjs        # imports instancesOf + applyEdit from the SHIPPED bundle,
                                      # reads ~/qntm/{this_week,work/waiting_for,personal/daily}.md
                                      # ARM A  one applyEdit  -> 1 line changed, the twin disagrees
                                      # ARM B  folded         -> 2 lines changed, 0 collateral,
                                      #                          line count unchanged, indent kept
node <scratchpad>/bench.mjs           # instancesOf 0.20-0.33 ms; the 2x applyEdit fold 0.05-0.07 ms

# ── THE VAULT, read-only ──
python3 <scratchpad>/measure.py       # 77 files, 3,715 lines, 2,496 stamped, 2,058 checkbox lines
                                      # 88 nodes printed >1x in one file, on 184 lines, ALL checkbox
                                      # checkbox-state disagreements between printings: 0
                                      # 717 of 1,322 nodes print in >1 file; 41% of tickable
                                      #   printings are in a file the write unit does not cover

# ── THE GRAPH, from a READ-ONLY COPY of state.db ──
cp ~/.qntm-md/state.db <scratchpad>/state-copy.db     # copy, never opened for write
                                      # graph_state = {version, nodes, edges}
                                      # 1,501 nodes  460 edges  805,155 bytes
                                      # PART_OF 417  WAITING_FOR 22  REQUIRES 17  UNLOCKS 4
                                      # blast radius per tick: mean 1.61 affected nodes,
                                      #   mean 1.33 of them printed in the same view,
                                      #   42% of 1,741 ticks affect nothing in view

# ── THE RULES, read in the monorepo (read-only) ──
ls  config/rules/*.yaml | wc -l                       # 42 files
grep -h "^- id:" config/rules/*.yaml | wc -l          # 94 rules
<enumerate every key at rule scope, comments stripped>
      # for_each 94, actions 94, when 82, pattern 51, eq 26, priority 18, exists 16,
      # and 9, on 8, not 5, or 4, iterates 1, bind 1 — NO view/path/section/file
<enumerate every key in all 138 pattern files>
      # root/parameters/description/steps/find + traversal methods + NODE FIELD NAMES only
<field read/write coupling over the 94 rules>
      # 15 rules write `status`; 42 read it; 75 of 94 read a field another rule writes
      # priorities in use: 10 5 3 0 -1 -2 -4 -5 -10 -20

# ── THE APP'S OWN READERS, enumerated rather than grepped for absence ──
grep -rn "graphData" app/             # 13 references: 3 assignments, 1 nulling, 2 existence checks,
                                      # 4 `?.snapshot?.views.find(...)`, 1 comment.
                                      # NONE reaches .snapshot.graph or .snapshot.locations

# ── BASELINE, and it must be unchanged ──
npm ci && npm test                    # 674 tests / 126 suites / 0 fail
                                      # (identical to publish-the-structural-language's record)
flow-trace verify .                    # exit 0 — 42 PASS / 0 FAIL / 20 INFO, also identical
```

**`node_modules` was absent in this worktree and the first `npm test` failed on
`ERR_MODULE_NOT_FOUND: markdown-it` in 3 suites.** Recorded because it looked exactly like a
regression on a branch that touches no source, and it was not one — `npm ci` and the numbers match
the recorded baseline exactly.

# Research: the resolution universe — what KINDS of config resolution exist, and which of them can the browser mirror?

**Status: research. No application source is modified on this branch. This document is the only
file it adds.**

**Branch:** `design/unlock-universe`, based on `origin/main` @ `bd7ecfa`.

---

## 0. Lead — the answer, before the method

**Yes. A view holds both ends of an UNLOCKS edge — four times out of four — and the gesture he
described is the largest single-gesture consequence measured anywhere in this project.** There are
exactly **four `UNLOCKS` edges** in his real graph **[OBS]**. All four have **both ends inside one
registered view**. Three are the `unlocks-dojo` demo. The fourth is real work: `qntm:2319` *"Tom to
confirm / investigate with speaking to Aviva"* → `qntm:2320` *"Proceed with cancellation if so"*,
both `domain: work`. **Ticking 2319 done reaches 7 rules of 94, changes 8 nodes, releases 5 held
nodes from `waiting` to `open`, and deletes one edge.** **[OBS]**

**And the previous measurement missed it.** `research-the-rule-closure.md` simulated exactly the
right gesture (`status := done`), in exactly the right view (`everything-work`), and did not reach
a single unlock rule — because it sampled **12 of that view's 158 tickable nodes** (its own §12.4)
and 2319 was not among the twelve. **The method was sound; the sample was 7.6 % of the population,
and the rarest gesture in his graph is also the biggest.** So I ran the sweep it deferred: **652
gestures, exhaustive over five views and over every dependency endpoint and its whole subtree.**
**[OBS] The measured closure is 29 rules of 94, not 21 — the sample missed eight rules, 38 % more
than it found.** That
is worth more than the feature: **a sampled closure is a floor, not a bound, and this document is
what it cost to find that out.**

**The correction about "rules" is right, and the taxonomy is bigger than the word.** Reading the
loader's own declared content classes and every key his 73 view sheets actually declare — rather
than accepting a guessed list — his instance exercises **twelve distinct kinds of config
resolution**. Rules are one of them, and by size they are the *smallest* kind he has: 94 rules
against 186 placement filters, 153 default maps, 134 vocabulary entries and 72 domain filters.

| # | kind of resolution | where declared | how many | what it needs to evaluate | browser has the inputs? | **locally mirrorable** |
|---|---|---|---|---|---|---|
| 1 | **placement filter** (qualification) | `views/*.yaml` `qualification:` → `patterns/` | **186** sections / 159 patterns | node fields + traversal; **0 of 186 decidable without reading a node** | yes — whole graph is on the wire | **yes, and the sibling is building it** |
| 2 | **domain filter** | sheet `domain:` | **72** sheets, 13 values | one node field (`domain`); empty tuple = all | yes | **yes — trivially** |
| 3 | **defaults** | section `defaults:` (+ global / view / subtree / line) | **153** sections, 67 distinct maps, 8 fields | **nothing but the section you are typing in** | yes | **yes — CONFIG ONLY** |
| 4 | **registration** (what a new line becomes) | sheet `default_node_type:`, `views/default_registration.yaml` | **18** sheets + 1 global | nothing but the section | yes | **yes — CONFIG ONLY** |
| 5 | **vocabulary / token resolution** | `vocabulary/*.yaml` | **134** entries (91 field, 28 node type, 6 edge, 4 parametric, 3 structural, 2 deletion) | the characters on the line | yes | **yes — CONFIG ONLY** |
| 6 | **ordering** | section `ordering:` / `ordering_mode:` | **7** + 2 sections | one declared node field per section | yes | **yes — CONFIG ONLY predicate** |
| 7 | **line grammar** | `line_grammars.yaml` | 2 grammars, 3 shapes | the characters on the line | yes | **yes — CONFIG ONLY** |
| 8 | **clock / day boundary** | `day_boundary.yaml` | 3 keys | a clock + a timezone + a 04:00 boundary | yes | **yes — CONFIG ONLY, and today the browser gets it WRONG** |
| 9 | **membership expansion** (`pull_context`) | section `pull_context:` | **77** sections (59 descendants, 18 both) | transitive `PART_OF`; **max depth 6** in his graph | yes — 460 edges on the wire | **yes, at a deeper depth than rules** |
| 10 | **structural nesting edge** | section `structural_edge_types:` | **6** sections, all `[WAITING_FOR] incoming` | one-hop of a named edge type | yes | **yes — already half-shipped in `presentation.json`** |
| 11 | **rules** | `rules/*.yaml` | **94** | 0–7 reached per gesture; **29 of 94 reachable** (§3.4) | mostly | **partly — and refused, `research-the-rule-closure.md` §10** |
| 12 | **cascades** | rule ORDER inside one priority band + traversal | 6 unlock rules, 4 requires, 5 waiting-for | rules **plus** a transitive subtree walk | yes | **no — see §5.3** |

**The three findings that change what to build next.**

1. **Eight of the twelve kinds are decidable from CONFIG ALONE, and the whole table is 59 KB.**
   **[OBS]** I built it: `global` 227 B, `grammars` 274 B, `vocabulary` 12,838 B, `views` 47,105 B
   — **60,490 bytes for all 72 views**. Sliced per view it is **454 to 1,930 bytes, median 685**.
   The rule closure — the thing two documents have now spent themselves on — is the **one kind that
   is provably NOT a config fact** (`research-the-rule-closure.md` §3). **The cheap rung was never
   the rules. It is the other eight kinds, and it ships with the view.**
2. **The browser is already handed the entire graph and reads none of it.** **[OBS]** The envelope
   `server/app.py:188-197` puts the whole `graph_state` blob on the wire — **805,155 bytes, 1,501
   nodes, 460 edges**. `graphData` is read at **exactly six sites** in `app/`, and **every one
   reaches `?.snapshot?.views`; not one reaches `.graph`**. The inputs for kinds 1, 2, 9 and 10 are
   already in the page.
3. **Each kind has its own natural depth, and "two levels" is a rules number that does not
   generalise.** **[OBS]** Defaults resolve at **exactly one** level — 153 of 186 sections have one
   speaking level and 33 have none; **never two**. Rules go to 4. A `pull_context` subtree walk goes
   to **6**. An `ancestors` walk goes to **6**. His question "what depth per view" has a different
   answer per kind, and the deepest kind is not the rule engine.

**What I would tell him in one sentence.** *Both ends of your unlock are on screen together, once,
in `everything-work`, and ticking it moves six rows there — but the front-running you asked about
is the twelfth and hardest kind of config resolution you have, and the first eight are decidable
from config alone, total 59 KB, already generated by a script this repo owns.*

**Evidence rule.** Every claim is **[OBS]** (a script I ran, output I read), **[REA]** (reasoned
from source I read, cited `file:line`) or **[REPO]** (a claim this repo makes about itself that I
did not reproduce). **Absence is never proven by a grep returning nothing** — §2.1, §4.1 and §6.3
are the three places it mattered, and all three are enumerations.

Sizes are the house scale: **under an hour** / **half a day** / **an arc**.

---

## 1. The rig, and what "measure" means here

**[OBS]** Everything ran from this worktree, against:

* a **copy** of `~/.qntm-md/state.db` (1,083,658,240 B), opened `mode=ro` and never written;
* a **copy** of `apps/qntm-md/config/` — 276 YAML files; the trunk config was read, never opened
  for write;
* `~/qntm` was not read or written at all.

**No cycle was run. `graph-sync` was not run. `map . --full` was not run. Nothing was posted to any
server.** The graph is rebuilt in memory by `qntm_graph.Graph.from_dict` with
`graph._patterns = bundle.patterns`, which is what `coordination/orchestrator.py:5363-5407` does
when it loads a persisted graph.

**[OBS]** The bundle loads clean: **252 patterns, 94 tier-1 rules, 72 registered view sheets, 134
vocabulary entries, 31 node types, 59 field types, 7 edge types.** The graph is **1,501 nodes and
460 edges**, `updated` `2026-07-24T15:27:20Z`. **These are the same five numbers
`research-the-rule-closure.md` §1.2 recorded, from the same snapshot, so the two documents are
directly comparable.**

**[OBS]** The engine's own rules pass at rest, over that graph: **273 firings across 28 distinct
rules, 431 dispatched writes.** One pass costs about **0.9 s**.

**The definition of REACHED is the previous document's, unchanged**, so that the numbers stack:
*the rule ids whose `(rule, node)` firings differ between a full rules pass at rest and a full
rules pass with one node's `status` changed*. I did not reimplement the rule engine, the pattern
engine or the predicate evaluator. I ran them.

**One limit of the rig, stated up front.** **[UNVERIFIED]** The graph copy is dated **2026-07-24**
and the vault is a week newer. Every count here is the 24 July graph's. **Settled by** re-running
§2 against a `state.db` from the current cycle. **[REA]** For UNLOCKS specifically the risk is
real and one-directional: he has been authoring `#unlocks` since 2026-07-20, so a newer graph is
more likely to hold *more* edges than fewer, and §2's "four" is a floor.

---

## 2. U1 — do any of his views contain both ends of an UNLOCKS edge?

**Answer: yes, all four of them, but the honest reading is narrower than the answer.**

### 2.1 Every edge in the graph, enumerated — not grepped

**[OBS]** The complete edge census of his real graph, by type:

| edge type | count | declared at |
|---|---|---|
| `PART_OF` | **417** | `schema.yaml` `edge_types:` |
| `WAITING_FOR` | **22** | `schema.yaml:896` |
| `REQUIRES` | **17** | `schema.yaml:906` |
| `UNLOCKS` | **4** | `schema.yaml:909` |
| `NEXT` / `PARALLEL` / `SPONSORS` | **0** | declared, never authored |

**[REA] Three of his seven declared edge types have never been used. That is the same shape as the
rule finding — the config describes a machine busier than the one he runs — and it is the first
thing to hold when reading the rest of this section.**

**[OBS]** The four `UNLOCKS` edges in full:

| source | status | title | → target | status | title | domain |
|---|---|---|---|---|---|---|
| 2293 | done | Node 1 | 2294 | done | Cluster A | dojo |
| 2294 | done | Cluster A | 2297 | done | Cluster B | dojo |
| 2297 | done | Cluster B | 2300 | done | Node 2 | dojo |
| **2319** | **waiting** | **Tom to confirm / investigate with speaking to Aviva** | **2320** | **waiting** | **Proceed with cancellation if so** | **work** |

**[OBS]** The provenance fields the cascade writes are live in the graph: **`cluster_locked: true`
on 1 node** (2320) and **`unlocks_held: true` on 5 nodes** (2320 and four of its descendants).
`cluster_satisfied` is carried by 104 nodes and is `null` on every one of them — the 2026-07-23
retirement (`patterns/unlocks_propagation.yaml:31-33`) has fully drained.

### 2.2 Membership, by the orchestrator's own three calls

**[OBS]** `render.compile(sheet)` → `_compose_section_members(section, graph, resolver)` →
`render.filter(nodes, compiled.domain)`, the path `orchestrator.py:3388-3421` labels the
*"canonical architectural-truth-source for 'which views select which nodes'"*. All **72 views, 186
sections** resolved with **zero errors** and produced **1,919 memberships**. **[UNVERIFIED]** The
previous document counted **1,918** from the same snapshot by the same three calls. The one-node
difference is unexplained; the most likely cause is a different `$cycle_today` (I pinned
2026-07-24, a Friday, with `cycle_week_end` 2026-07-26), and ten sections do depend on the clock
**[REPO]**. **Settled by** re-running both under one pinned clock. It does not move any conclusion
here, and I record it rather than round it away.

**[OBS] Both ends in ONE view, per edge type:**

| edge type | edges | **both ends in one view** | source only | neither end printed |
|---|---|---|---|---|
| `UNLOCKS` | 4 | **4 (100 %)** | 0 | 0 |
| `WAITING_FOR` | 22 | **22 (100 %)** | 0 | 0 |
| `REQUIRES` | 17 | **16 (94 %)** | 1 | 0 |
| `PART_OF` | 417 | **334 (80 %)** | 44 | 22 |

**[REA] This is the strongest single fact in the document, and it is not about UNLOCKS.** Of the 43
non-hierarchical edges in his graph — every `WAITING_FOR`, `REQUIRES` and `UNLOCKS` — **42 have both
ends printed together in at least one view.** The premise his whole question rests on is not
marginal. It is nearly universal.

### 2.3 And now the narrowing, which he should hear

**[OBS]** Which views hold each end of the one real UNLOCKS edge:

| node | printed in |
|---|---|
| **2319** (the source, the one he ticks) | `daily-work`, `everything-work`, `waiting-for-work` |
| **2320** (the target, the one that unlocks) | **`everything-work` only** |

**[REA] So the answer to "can the browser front-run the unlock when he ticks the source" is: in one
view of seventy-two.** In `daily-work` — the view he opens every morning — and in
`waiting-for-work`, ticking 2319 produces a consequence that is entirely off screen. The only sheet
that shows the unlock is `everything-work`, which is **one section, 607 nodes, qualification
`everything-work-nodes`** (`config/views/everything-work.yaml:5-10`) — the view whose job is to
contain everything.

**[REA] There is a design reading and it is not a complaint.** A view that shows both ends of a
dependency is a view that shows blocked work next to blocking work. `waiting-for-work` deliberately
prints the waiter and its target together — that is why 22 of 22 `WAITING_FOR` edges are
co-printed, and it is why `waiting-for-work` declares `structural_edge_types: [WAITING_FOR]`,
`structural_edge_direction: incoming` (§4.10). **No sheet does the same for `UNLOCKS`. The
mechanism to co-print an unlock pair already exists in his config, is used six times for
`WAITING_FOR`, and is used zero times for `UNLOCKS`.** That is a **config** change, in a file the
sibling agent owns nothing of, and it is the cheapest thing in this document.

### 2.4 The dojo is inert, and that is not a defect

**[OBS]** All four `unlocks-dojo` nodes are `status: done`. Ticking any of them reaches **0 rules**
and changes **0 nodes** — the chain has been walked to the end. **[OBS]** Unticking the head
(2293 → `open`) reaches exactly **one** rule, `unlocks-link-becomes-locked`, and writes
`cluster_locked: true` onto 2294 — and then stops, because the hold rule `unlocks-link-to-hold`
requires `status: open` and 2294 is `done` (`patterns/unlocks_propagation.yaml:88-92`).

**[REA] The demonstration surface he built to make the mechanic visible is, at this graph state,
the place where the mechanic does nothing.** To see the cascade in the dojo he would have to untick
the whole chain, not the head. That is a fact about the dojo's state, not about the machine.

---

## 3. U2 — did the previous measurement already cover this, and did it miss it?

**It was in scope, it was in the right view, and it missed. The cause is sampling, not definition,
and the consequence is that one of the previous document's headline bounds is wrong.**

### 3.1 Unlock is NOT among the 21

**[REPO]** `research-the-rule-closure.md` §4.1 lists all 21 rules any gesture reached. **No
`unlocks-*` rule appears in it.** **[OBS]** Running the same gesture kind on the endpoints of the
one real UNLOCKS edge reaches **four rules that list does not contain**:

| rule | file | what it writes |
|---|---|---|
| `unlocks-link-becomes-locked` | `rules/unlocks_status_propagation.yaml:24` | `cluster_locked` |
| `unlocks-link-becomes-unlocked` | `rules/unlocks_status_propagation.yaml:36` | `cluster_locked` (unset) |
| `unlocks-node-becomes-released` | `rules/unlocks_status_propagation.yaml:79` | `status`, `unlocks_held` |
| `unlocks-held-marker-becomes-cleared` | `rules/unlocks_status_propagation.yaml:94` | `unlocks_held` |

**So the measured closure is at least 25 of 94, not 21 — and §3.4 takes it to 29.**

### 3.2 The cause, established positively rather than guessed

**The obvious hypothesis was a definitional gap: that the previous rig only ticked `open` nodes,
and 2319 is `waiting`, so the unlock trigger was structurally unreachable. I tested it and it is
false.** **[OBS]** The status histogram of `everything-work`:

| view | entry | open | waiting | done | other |
|---|---|---|---|---|---|
| `everything-work` | 607 | 125 | 23 | **449** | 10 |

**125 + 23 + 10 = 158, and 158 is exactly the "tickable" figure the previous document's table
records for `everything-work`.** So *tickable* meant *not done*, `waiting` nodes were included, and
**2319 was in the eligible population.** It was excluded by §12.4's own stated limit: **the sample
is 12 nodes per view.** **[REA] 12 of 158 is 7.6 %. A uniform sample had a 92 % chance of missing
the single most consequential gesture in that view. It missed.**

**[REA] This is the finding that matters more than the feature, and I would put it to him before
the taxonomy.** The previous document's numbers are **floors**, not bounds, everywhere it sampled —
which is every view with more than 12 tickable nodes — **fifteen of the twenty it measured** carry
`sampled = 12` in its own table. Its own
§12.4 says so. What it could not know is *how much* a floor understates, and the answer here is
that the missed gesture was larger than every gesture it did find.

### 3.3 What the missed gesture actually does

**[OBS]** Tick `2319` → `done`, one full rules pass, differenced against the pass at rest:

```
rules REACHED (7 of 94)
   unlocks-link-becomes-unlocked          cluster_locked   unset on 2320
   unlocks-node-becomes-released          status := open   on 2320, 2262, 2263, 2265, 2269
                                          unlocks_held     unset on the same five
   completed-target-clears-waiting-link   delete_edge      WAITING_FOR 2261 -> 2319
   target-of-open-waiter-gets-status-waiting
   unlocks-link-becomes-locked
   coverage-overall                       par 27.0 -> 25.0 on header 2065
   coverage-work                          par 12.0 -> 11.0 on header 2066

nodes changed: 8      edges deleted: 1
```

**[OBS]** And the same delta expressed as **rows that change in a view he is looking at**:

| view | rows changed | which |
|---|---|---|
| **`everything-work`** | **6** | 2262, 2263, 2265, 2269, 2319, 2320 |
| `daily-work` | 1 | 2319 |
| `waiting-for-work` | 1 | 2319 |
| `metrics` | 1 | 2066 (a `par` stat line) |

### 3.4 The exhaustive sweep — closing limit 12.4 rather than repeating it

**[OBS]** Rather than sample again, I ran every tickable node of `everything-work`,
`waiting-for-work`, `unlocks-dojo`, `this-week` and `inbox`, **plus every `UNLOCKS` and `REQUIRES`
endpoint and every node in its subtree**, in **both** directions — `→ done` and `→ open`. **619
nodes, 652 gestures**, each one a full rules pass differenced against the pass at rest.

| rules reached per gesture | gestures | | max rows changed in ONE view | gestures |
|---|---|---|---|---|
| **0** | **460 (71 %)** | | 0 | 28 |
| 1 | 75 | | **1** | **428** |
| 2 | 56 | | **2** | **188** |
| 3 | 37 | | **3** | **6** |
| 4 | 22 | | 5 | 1 |
| 5 | 2 | | **6** | **1** |

**[OBS] The union over all 652 gestures is 24 rules, and 8 of them are not in the previous
document's 21:**

| new rule | reached by |
|---|---|
| `unlocks-link-becomes-locked` | tick 2319 done |
| `unlocks-link-becomes-unlocked` | tick 2319 done |
| `unlocks-node-becomes-released` | tick 2319 done |
| `unlocks-held-marker-becomes-cleared` | tick 2320 done |
| **`unlocks-link-becomes-held`** | **untick 2320 → open** |
| **`unlocks-descendant-becomes-held`** | **untick 2262 / 2263 / 2265 / 2269 → open** |
| `stamp-task-intent-planned` | 20 gestures, all *untick a done task* |
| `task-with-open-part-of-child-becomes-outcome` | untick 2268 → open |

**So the measured closure is 21 ∪ 24 = 29 of 94.** **[OBS]**

**One definitional note, because the two numbers for the same gesture differ and I will not hide
it.** The sweep's REACHED is the **firings** delta alone; §3.3's deep dive on 2319 additionally
differenced **dispatched writes**, which is the previous document's full definition. The two
`coverage-*` rules fire on the same carriers either way — only the *value* they write moves
(27.0 → 25.0) — so a firings-only delta cannot see them. **That is why 2319 reads 5 in the sweep
and 7 in §3.3, and it means the sweep's 24 is itself a floor for the metric layer.**

**[REA] Two of the six unlock rules are only reachable by UNTICKING a held line, and both produce
zero visible change.** `unlocks-link-becomes-held` and `unlocks-descendant-becomes-held` fire when
he unticks a `[~]` row; the engine puts it straight back to `waiting` in the same pass. **A browser
that front-ran that gesture optimistically would paint the row open and then watch the projection
snap it back.** It is the cheapest counter-example to optimistic local computation in the whole
document, and it lives inside the very feature he asked about.

### 3.5 And the previous ceiling on in-view rows is wrong

**[REA] This refutes the previous document's §4.3 directly.** Its claim was *"the number of rows in
the view he is looking at whose fields change because of the tick is 0, 1 or 2 — never more"*, and
it drew the adjacency-mark design straight from that ceiling. **[OBS] Eight of 652 gestures exceed
it, and the largest is 6.**

| gesture | max rows in one view | where |
|---|---|---|
| **2319 `waiting → done`** (the unlock) | **6** | `everything-work` |
| 834 `open → done` | 5 | `everything-work` 5, `waiting-for-work` 5, `daily-work` 4 |
| 1486, 1972, 2338, 2340, 2342 `open → done` | 3 | `everything-work` |
| 2162 `done → open` | 3 | `everything-work` |

**[REA] So the ceiling is 6, not 2, and it is breached 1.3 % of the time. The adjacency mark
survives; the number it was drawn from does not.** §7 says what that does to the ranking.

---

## 4. U3 — the taxonomy. What KINDS of config resolution exist?

**This is the deliverable, and I built it by enumerating rather than by accepting the brief's list.
Two sources, both positive:** the loader's own `SupportedContentType` enum
(`bundle/config_registration.py:27-44`), and **every key that appears in any of his 73 view sheets**.

### 4.0 The content classes the loader recognises, against what he uses

**[OBS]** The loader declares **15** content classes. His config supplies files for **8**:

| class | files | |
|---|---|---|
| `patterns` | **138** | used |
| `views` | **73** | used |
| `rules` | **42** | used |
| `vocabulary` | **19** | used |
| `schema` / `global_defaults` / `day_boundary` / `line_grammars` | 1 each | used |
| `projections`, `rendering`, `actions`, `capability_shells`, `starter_package`, `engine_signals`, `shell` | **0** | **declared, empty** |

**[REA] Seven loader-recognised kinds of config exist in the engine and are unused in his instance.
That is the second appearance of the same asymmetry, and it is worth naming as a rule of this
codebase: the declaration surface is consistently larger than the exercised surface, so any
"universe" derived from what CAN be declared will be several times larger than the universe he
actually has.** It is the config-only-closure problem (`research-the-rule-closure.md` §3.1) one
level up.

### 4.1 The keys his view sheets actually declare — every one, counted

**[OBS]** 73 sheets, 186 sections.

| SHEET-level key | sheets | | SECTION-level key | sections |
|---|---|---|---|---|
| `version` / `domain` / `path` / `sections` | 72 | | `id` / `qualification` | **186** |
| `default_node_type` | **19** | | `name` | 185 |
| `input_grammar` | 1 (the global) | | `defaults` | **153** |
| `default_tags` | 1 (the global) | | `pull_context` | **77** |
| | | | `empty_children_placeholder` | 40 |
| | | | `render_body` | 20 |
| | | | `pin_after_qualification_drops` | 14 |
| | | | `ordering` | 7 |
| | | | `structural_edge_types` / `_direction` | 6 |
| | | | `ordering_mode` | 2 |

**[REA] There is no eleventh key hiding.** This is the whole declarable surface of a view in his
instance, read off his instance. What follows takes them one at a time.

### 4.2 DEFAULTS — the cascade is five levels and he uses one

**Declared:** section `defaults:` — **153 of 186 sections**, **67 distinct maps**, over **8 fields**:
`domain` 153, `project` 60, `cap_state` 12, `principle_state` 10, `stage` 9, `class_state` 8,
`package_state` 8, `god_box` 2. **[OBS]**

**Where the other levels are:** **[OBS]** `config/global_defaults.yaml` declares
`defaults: {}` — **empty**. `node_defaults_cascade` is `()` — **subtree inheritance is OFF**, which
that file's own header says is a live choice (`global_defaults.yaml:34-37`). **Zero sheets declare
a sheet-level `defaults:`.**

**Needs to evaluate:** **nothing but which section the line is in.** The cascade
(`resolution/cascade.py`, `resolution/levels.py`) resolves most-specific-first over
`GLOBAL → VIEW → STRUCTURAL_NODE → SUBTREE → LINE`.

**Locally mirrorable: YES, and it is pure config.** **[REA]** A browser that knows which section
the cursor is in knows exactly what a new line will be stamped with, with no graph read at all.
That is the same thing the sibling's section-membership work is computing for placement — **one
boundary computation, two payoffs.**

### 4.3 REGISTRATION — what a new line BECOMES

**Declared:** **[OBS]** **18 sheets** declare `default_node_type`: `routine` ×7 (all six
`routines-*` sheets plus `routine-cascade-dojo`), `task` ×2, and one each for `album`, `attribute`,
`blog`, `book`, `film`, `group`, `person`, `tv_show`, `writer`. **Zero sections** declare it. The
GLOBAL declaration is `views/default_registration.yaml`: `default_node_type: task`,
`input_grammar: tolerant`, `default_tags: ()`.

**The level table is owned in code, not in prose** — `resolution/registration.py:89-113`,
`LEVELS_FOR`. Four keys resolve through `(GLOBAL, VIEW, STRUCTURAL_NODE)`; `BASE_NODE_TYPE` resolves
through `(GLOBAL,)` **alone**, and that module's docstring records why: widening it produced an
observed 2026-07-27 production race, `routine → task → routine` inside one cycle.

**Needs to evaluate:** the sheet. **Locally mirrorable: YES, config only.** **[REA] And there is a
trap here the browser must not spring.** `DEFAULT_NODE_TYPE` (minting, per-view) and
`BASE_NODE_TYPE` (revert, global-only) share one config key today. A local mirror that read the
sheet's `default_node_type` and used it as a *revert* target would reproduce, in the browser,
exactly the race the engine restructured its own signatures to make impossible. **Any local mirror
of this kind must ship the two as two names.**

### 4.4 VOCABULARY / TOKEN RESOLUTION — the largest config-only kind

**Declared:** **[OBS]** **134 entries** across 19 files, by target:

| target kind | entries | examples |
|---|---|---|
| `field` | **91** | `#daily → cadence=1`, `#work → domain=work`, `☑️ → done_task_count` |
| `node_type` | **28** | `#task`, `#outcome`, `#routine`, `#capability` … |
| `edge_type` | **6** | `#next`, `#parallel`, `#waiting-for`, `#requires`, **`#unlocks`**, `#sponsors` |
| `parametric_field` | 4 | `#every-3d`, `#mon/wed/fri` … |
| `structural_token` | 3 | the positional bindings, incl. `#unlocks → next_sibling` |
| `deletion_intent` | 2 | tag removal, line removal |

**[OBS]** **84 of 134 carry a literal value**, **6 are `rendered_as_chrome`** (all six edge tokens)
and **2 are `render_only`** (`☑️ done_task_count`, `🎯 par`).

**Needs to evaluate:** the characters on the line. **Locally mirrorable: YES, config only, 12,838
bytes.** **[REA] This is the kind with the highest ratio of user-visible payoff to input
requirement in the whole table.** When he types `#unlocks` on a line, the browser could say what it
binds to — self → next sibling, edge type `UNLOCKS`
(`vocabulary/structural_tokens.yaml`, the `positional_bindings` entry) — **before any cycle runs**,
with no graph read and no rule evaluation. **The one place the whole unlock story is cheaply
mirrorable is the moment of authoring it, not the moment of ticking it.**

### 4.5 PLACEMENT FILTER — cited, not redone

**186 sections, 159 distinct patterns, and 0 of 186 decidable without reading a node's fields**
**[REPO]** (`research-the-rule-closure.md` §3). Being built now by the sibling agent for `inbox`'s
two sections. Nothing here revisits it.

### 4.6 DOMAIN FILTER — the second placement filter, and nobody has named it

**Declared:** sheet `domain:` — **72 sheets, 13 distinct values**: `dev` 18, `personal` 9, `work` 8,
`arts` 7, `program` 5, `spirit` 5, `dojo` 5, **`all` 5**, `admin` 3, `social` 3, `life-admin` 2,
`home` 1, `character` 1. **[OBS]**

**[REA] This is a real second gate and the membership pipeline applies it after the pattern.**
`render/domain_filter.py:12-30`: an **empty** resolved tuple is the `all` selector and everything
passes; a non-empty tuple keeps only nodes whose `domain` field is in the set. So a node can satisfy
a section's qualification and still not print. **A local mirror that reproduced the qualification
and forgot this would over-print by exactly the nodes whose domain is wrong** — which, for the dojo,
is the entire isolation mechanism `views/unlocks-dojo.yaml:15-18` relies on to keep dojo lines out
of `admin.md`.

**Needs to evaluate:** one node field. **Locally mirrorable: YES**, and it is nine lines of code.

### 4.7 ORDERING

**Declared:** **[OBS]** only **9 sections of 186** say anything about order:

| view : section | declaration |
|---|---|
| `this-week:overdue`, `this-week:due-this-week` | `ordering: [{field: due_date, direction: asc}]` |
| `this-week:available-overdue`, `this-week:available-this-week` | `ordering: [{field: available_date, direction: asc}]` |
| `qntm-queue:queue`, `flowtrace-queue:queue`, `trace-orchestration-queue:queue` | `ordering: [{field: queue_position, direction: asc}]` |
| `daily-personal:capture`, `daily-work:capture` | `ordering_mode: insertion_order` |

**[OBS]** The engine has since folded both keys into **one** knob: `persist_placing`
(`render/compiler.py:51-62`) — ON means placement is registered and insertion-ordered, OFF means it
is derived by the filter and a manual move evaporates unless the node re-qualifies.

**Needs to evaluate:** one declared field per section. **Locally mirrorable: YES, config-only
predicate.** **[REA] And this is the cheapest correct local behaviour in the whole document.** When
he types a line into `this-week:due-this-week` and gives it a date, the row's final position is a
sort on `due_date` over rows the browser is already painting. That is not a preview of a rule; it
is arithmetic on data in hand, and it is **under an hour**.

### 4.8 MEMBERSHIP EXPANSION — `pull_context`, the deep one

**Declared:** **[OBS]** **77 of 186 sections**: `descendants` **59**, `ancestors_and_descendants`
**18**. `unlocks-dojo:chain` is one of them (`views/unlocks-dojo.yaml:36`) — the section prints each
chain link **with its whole subtree**, which is exactly how the operator sees `[ ]` / `[~]` / `[x]`
side by side.

**Needs to evaluate:** transitive `PART_OF`, in both directions. **[OBS] Measured in his graph: the
maximum subtree depth below any node is 6, and the maximum ancestor depth above any node is 6.**
Distribution below: depth 0 ×1,287, 1 ×168, 2 ×28, 3 ×11, 4 ×5, 5 ×1, 6 ×1.

**Locally mirrorable: YES — the 460 edges are on the wire — but at a depth the rule work never
needed.** §5.

### 4.9 CLOCK / DAY BOUNDARY — small, config-only, and currently wrong in the browser

**Declared:** **[OBS]** `config/day_boundary.yaml` — `timezone: Europe/London`, `day_start_hour: 4`,
`week_starts_on: monday`. Three keys.

**[REA] A browser computing "is this overdue" from `new Date()` is wrong for four hours every day,
and wrong about which week a Sunday belongs to.** `this-week`'s four sections are precisely the ones
that sort and qualify on dates. **[OBS]** Ten of 186 sections depend on `$cycle_today` /
`$cycle_week_end` **[REPO]** (`research-the-rule-closure.md` §3). **Three keys, 227 bytes in the
global slice, and they remove a class of off-by-one-day error that no amount of rule mirroring
would have caught.**

### 4.10 STRUCTURAL NESTING EDGE — already half-shipped

**Declared:** **[OBS]** **6 sections**, all identical: `structural_edge_types: [WAITING_FOR]`,
`structural_edge_direction: incoming` — the four `operator-*` sheets, `waiting-for-work` and
`waiting-for-personal`. The default is the registry's natural hierarchy edge
(`render/compiler.py:70-74`), never a hardcoded `PART_OF`.

**[OBS] This kind is ALREADY in the browser.** `presentation.json`'s `structural.sections` block
carries all six, generated from the monorepo's config by
`scripts/generate-structural-declaration.mjs`, which reads `config/vocabulary/structural_tokens.yaml`,
`config/schema.yaml` and `config/views/*.yaml` read-only and refuses to emit if an edge type is not
in the registry. **The whole file is 3,303 bytes.**

**[REA] The precedent his question needs already exists, was built by this repo, is generated
rather than hand-written, and validates itself. Every config-only kind in §4 is the same shape as
the thing this script already does. The rung is not "build a mechanism"; it is "add rows to the one
that runs."**

### 4.11 RULES — cited, not redone

**0–11 of 94 per view, 21 reachable overall, 15 of 21 needing only node + one-hop + clock**
**[REPO]** (`research-the-rule-closure.md` §0, §7). **Corrected here to 25 reachable** (§3.1).

### 4.12 CASCADES — and the previous document's depth model does not fit them

**Declared:** the unlock cascade is **6 rules in `rules/unlocks_status_propagation.yaml`** whose own
header says *"SIX rules IN THIS ORDER — the order is load-bearing"*. `requires_status_propagation`
and `waiter_status_propagation` are its siblings.

**[OBS] And none of the six declares a `priority`.** They all default to 0. **[OBS]**
`core/rule-engine/src/qntm_rule_engine/executor/core.py:48-86` sorts by priority descending with a
**stable** sort — *"Equal priorities maintain insertion order"*. **So the unlock cascade sequences
itself by FILE ORDER inside one priority band, not by the priority ladder.**

**[REA] This breaks the previous document's §5.2 ceiling argument.** That argument was: the rules
phase is one priority-ordered pass, his config uses ten distinct priorities, therefore a chain has
at most ten links. **It is true of the routine reset chain, which really does step 10 → 0 → −10 →
−4. It is false as a general bound.** A cascade written as N rules at one priority in one file has
N links and consumes zero priority levels. Today N is 6. **The real ceiling on cascade depth is the
number of rules in a file, and it is a number no config validator checks.**

### 4.13 The kinds that exist but do nothing here

Recorded so the taxonomy is honest about its edges, each measured rather than assumed:

* **Templates.** **[OBS]** 3 tokens (`#onboarding`, `#termination`, `#free-trial`) set an
  `instantiate` field; 1 pattern (`template-instantiate-requests`) binds it; **3 rules** use the
  `create_subtree` verb. Needs the whole template body from config. **Locally mirrorable in
  principle, and worthless: it fires three times in his instance.**
* **Recurrence / cadence.** **[OBS]** 13 cadence tokens (`#daily → 1`, `#weekly → 7`, `#monthly →
  30`, seven weekday tokens, `#weekends`, `#every-month-end`) and 10 cadence rules. The token → days
  half is **config only**; the days → `available_date` half needs the clock. **Mirrorable in both
  halves**, and it is the routine chain the previous document already priced.
* **Identity / minting.** **[OBS]** 7 node types declare `identity: {field: title, unique: true}` —
  `header`, `explainer`, `capability`, `principle`, `package`, `class`, `sink`. Everything else
  mints an id. Config only, and the browser must never do it (a minted id that reached the source
  string is authored input).
* **Render shape.** **[OBS]** declared per node type in `schema.yaml`: `checkbox` ×13, `plain_line`
  ×9, `stat_line` ×1, `heading` ×1, absent ×7. Config only. The browser already paints these; it
  just does not know *why*.
* **Event coverage.** Declared in `schema.yaml` with every toggle on and nothing suppressed. Not
  reachable from a gesture (**[REPO]** `research-the-rule-closure.md` §7: 0 of the reached rules
  read the event log).
* **`empty_children_placeholder`** (40 sections) and **`render_body`** (20 sections) are rendering,
  not resolution. Named so the count of section keys reconciles.

---

## 5. U4 — what depth, per kind? Two levels is a rules number and it does not generalise

**Each kind has its own natural depth, and they are not close to each other.**

| kind | natural depth | measured how |
|---|---|---|
| **defaults** | **exactly 1** | **[OBS]** 153 of 186 sections have **one** speaking level; 33 have **zero**; **none has two** |
| **registration** | **1** | **[OBS]** 18 sheets declare, 0 sections declare — VIEW and STRUCTURAL_NODE never compete |
| **vocabulary** | **1** | a token maps to one target |
| **ordering** | **1** | one declared sort key per section |
| **domain filter** | **1** | one node field |
| **rules** | **≤2 covers 90 %, 4 is the honest cut** | **[REPO]** `research-the-rule-closure.md` §5 |
| **unlock chain** | **3 links** (dojo), **1** (real) | **[OBS]** longest `UNLOCKS` path |
| **requires chain** | **4 links** | **[OBS]** 12 chain heads; lengths 1 ×9, 2 ×2, **4 ×1** (the Cabrera contract chain, 1632 → 1631 → 1630 → 1629 → 1628) |
| **`pull_context` subtree** | **6** | **[OBS]** max subtree depth below any node |
| **`ancestors` walk** | **6** | **[OBS]** max ancestor depth above any node |

### 5.1 The five-level cascade resolves one level, always

**[OBS] This is the finding I did not expect and it simplifies the whole design.** The resolution
cascade is declared with five levels. In his config, for every one of 186 sections, **at most one
level ever speaks**: GLOBAL is empty, no sheet declares `defaults:`, SUBTREE is off, and LINE is
whatever he typed. **A "cascade" that never has two contributions to reconcile is a lookup.**

**[REA] So for the four cheapest kinds, "what depth should we track per view" has the answer ONE,
and the browser needs no precedence walk at all — just the section's own map.** The precedence
machinery matters for correctness the day he declares a global default. It does not matter for
shipping the mirror.

### 5.2 A cascade IS deeper than a default — he guessed right

**[OBS]** The `unlocks-descendants-to-hold` pattern is deliberately transitive:
`ancestors: {edge_type: PART_OF, cluster_locked: true}`, and
`patterns/unlocks_propagation.yaml:96` states why — *"Transitive (`ancestors`, not `parents`), so a
grandchild of a locked branch is held in the SAME evaluation rather than one hop per cycle."*

**[REA] So the unlock cascade's depth is not its rule count; it is the depth of the subtree under
the locked link, which in his graph reaches 6.** A browser mirroring the unlock at "two levels"
would release the link and its children and leave its grandchildren painted as held. **That is the
same failure shape the previous document named for the routine chain — a visible wrong line rather
than a missing one — but reached by a different mechanism, and it is two levels deeper.**

### 5.3 Which is why the honest verdict on kind 12 is *no*

**[REA]** To mirror the unlock the browser would need: the rule set, the pattern engine's
`ancestors` / `parents` traversal, the 460 edges, a six-deep transitive walk, the within-band
ordering of six rules whose order is load-bearing and declared nowhere but their file position,
**and** the `coverage-*` aggregate that the same gesture also moves and that no view scope can
contain (**[REPO]** §7). **The one gesture that motivated the question is the one gesture that needs
every hard input at once.**

---

## 6. U5 — is the universe computable per view, and when?

**For eight of twelve kinds: yes, from config alone, exactly — not as a bound. And I built the table
to prove the size rather than estimate it.**

### 6.1 The config-only resolution table, built and measured

**[OBS]** I assembled the table a browser would need for kinds 2–8 and 10, from the loaded bundle:

| slice | bytes |
|---|---|
| `global` — defaults, registration keys, day boundary | **227** |
| `grammars` — 2 grammars, 3 shapes | **274** |
| `vocabulary` — 125 token → target rows | **12,838** |
| `views` — 72 sheets, 186 sections: domain, default_node_type, defaults, ordering, pull_context, persist_placing, structural edges | **47,105** |
| **whole table, all 72 views** | **60,490 (59.1 KB)** |

**[OBS] Sliced per view — global + that view's sections — it is 454 to 1,930 bytes, median 685.**

| view | slice | sections |
|---|---|---|
| `everything-work` | 459 B | 1 |
| `unlocks-dojo` | 480 B | 1 |
| `inbox` | 637 B | 2 |
| `outcomes` | 679 B | 2 |
| `waiting-for-work` | 878 B | 3 |
| `this-week` | 1,185 B | 4 |
| `metrics` | 1,247 B | 5 |
| `daily-work` | 1,283 B | 5 |
| `backlog` | 1,589 B | 6 |
| `routines` | 1,671 B | 6 |

**[REA] Put the two numbers next to each other. The rule closure is a runtime fact that must be
recomputed against the graph and, computed from config alone, bounds 35–80 rules of 94 — four to
forty times the measured number. The other eight kinds are exact from config and cost 685 bytes per
view. That is the whole argument for the ordering in §7.**

### 6.2 Exact, bounded, or runtime — per kind

**[OBS/REA]**

| kind | config-computable? | why |
|---|---|---|
| defaults, registration, vocabulary, ordering, line grammar, day boundary | **EXACT** | keyed on (view, section) or on the characters typed; no graph read |
| domain filter, `pull_context`, structural edge | **predicate EXACT, answer RUNTIME** | config says *which field / which edge*; the graph says *which nodes* — and the graph is already in the page |
| placement filter | **RUNTIME** | **[REPO]** 0 of 186 sections decidable without node fields |
| rules | **RUNTIME** | **[REPO]** config-only bound 35–80 of 94 |
| cascades | **RUNTIME, and worse** | rules + a 6-deep transitive walk + a whole-graph aggregate |

### 6.3 The inputs are already on the wire, and nothing reads them

**[OBS] Proved by enumeration, not by a grep returning nothing.**

* `server/app.py:188-197` `_envelope()` returns `{"generated_at", "views", "graph", "locations",
  "missing"}`, and `"graph"` is the **entire** `graph_state` row read at `:176-185`. **[OBS]**
  Serialised, that blob is **805,155 bytes — 1,501 nodes and 460 edges. The edges alone are 77,651
  bytes.**
* `worker/src/app.js:144`, `:274`, `:311` carry the same `graph` key through the hosted path into
  D1.
* **`graphData` occurs at exactly 13 places in `app/`.** Five are assignments (`:1034` null,
  `:1585`, `:1609`, `:1704` — all three non-null ones the server's own envelope — and `:1880` null),
  two are comments (`:1521`, `:1743`), and **the remaining six reads are `:1222`, `:1249`,
  `:1326`, `:1429`, `:1744`, `:1928`. Every one of them either null-checks it or reaches
  `?.snapshot?.views`.**
* **A read of any `.graph` member anywhere under `app/` returns nothing — and I am not resting on
  that.** The positive statement is the enumeration above: 13 occurrences, 5 assignments, 2
  comments, 6 reads, and every read's destination named. None is `.graph`.

**[REA] So the browser is handed 805 KB of model on every load and uses the markdown only. Adding
59 KB of config table to a payload that already carries 805 KB of graph is a 7 % increase for the
eight cheapest kinds in the system.** The cost objection to local mirroring is not a payload
objection. It never was.

---

## 7. The ranked order of rungs

**His model does not replace the previous document's list. It reorders it, and the reordering is
the point: five rungs that were never on the list are cheaper than everything that was.**

| # | rung | size | why here |
|---|---|---|---|
| 1 | **identity propagation — a tick reaches every printing of the node** | under an hour | **[REPO]** unchanged and still first |
| 2 | **co-print the unlock pair — declare `structural_edge_types: [UNLOCKS]` on a section** | **under an hour** | §2.3. The mechanism exists and is used six times for `WAITING_FOR`. It is a **config** change, and it is what makes the feature *possible at all* in a view he opens. **[UNVERIFIED]** — I did not run it; §7.1 says what would settle it |
| 3 | **publish the config-only resolution table with the projection** | **half a day** | §6.1. 59 KB total, 685 B per view, EXACT, and `scripts/generate-structural-declaration.mjs` already generates a subset of it from the same files |
| 4 | **ordering preview — a dated line lands where the sort puts it** | **under an hour** | §4.7. Nine sections, one field each, data already painted |
| 5 | **defaults + registration preview — "a line here becomes a `routine` with `domain: work`"** | half a day | §4.2, §4.3, and it rides on the sibling's section boundary |
| 6 | **the day boundary — 04:00, Europe/London, week starts Monday** | under an hour | §4.9. Three keys; removes a whole class of off-by-one-day error |
| 7 | **the adjacency mark — *this row may change*** | half a day | **[REPO]** unchanged in shape, **re-justified at a worse ceiling**: §3.3 measured 6 rows, not 0–2 |
| 8 | **a view-scoped rule closure, computed server-side** | half a day | **[REPO]** unchanged, and §3.2 says it must be computed over ALL tickable nodes, not a sample |
| 9 | **a test pinning `graphData`'s assignment sites** | under an hour | **[REPO]** unchanged; §6.3 is what it keeps true |
| 10 | **a browser-side rule evaluator** | an arc | **still refused**, and §5.3 is a second independent reason |

### 7.1 Rung 2, and the one thing I did not verify

**[REA] Rung 2 is the one I would put in front of him first, and it is not a code change.** The
question he asked — *can the browser front-run the unlock when I tick the source* — currently has
the answer *only in `everything-work`*, because no sheet co-prints an unlock pair. **[OBS]** The
key that would do it is declared, validated and used: `structural_edge_types` /
`structural_edge_direction`, six times, all `[WAITING_FOR] incoming`
(`render/compiler.py:70-74`, and the generator already publishes them to the browser). **The front-end
question turns out to have a config answer one rung below it.**

**[UNVERIFIED] I did not run it, and there are two things to check before he does.** First, the
direction: `WAITING_FOR` is declared `incoming` because the awaited node should sit above its
waiters; for `UNLOCKS` the source unlocks the target, so the target nests under the source and the
declaration is probably `outgoing` — but "probably" is not a measurement. Second, whether a target
that does not otherwise qualify for the section is pulled in by the structural edge or silently
dropped. **Settled by** adding the declaration to a copy of `waiting-for-work.yaml` in a sandbox
bundle and re-running §2.2's three calls — about **under an hour**, and it belongs to
`/qntm-admin`, not to this branch.

---

## 8. What I refuted, including the coordinator and myself

**8.1 "Zero rules for `inbox` is near-refutation."** **Refuted, and he is right.** `inbox` prints one
node — a task with no domain and no type. **[REPO]** A tick on it reaches zero rules. **[REA] That
is the correct output of a correct model.** A capture with nothing declared about it is a node no
rule has anything to say about *yet*; that is what makes it a capture. The measurement that returns
zero there is the same measurement that returns 7 on 2319, from the same code, in the same run.
**A predictor that only ever returned large numbers would be the broken one.**

**8.2 "Rules bound the question."** **Refuted.** Rules are 1 of 12 kinds and the smallest by
declaration count (§4). The brief I was given listed six kinds; the config has twelve, and the two
largest — 186 placement filters and 153 default maps — were both on the brief's list only as single
words.

**8.3 "0, 1 or 2 rows change in view — never more."** **[REPO]**
`research-the-rule-closure.md` §4.3. **Refuted: the ceiling is 6, and 8 of 652 exhaustive gestures
breach 2.** §3.5. The adjacency mark survives as a design; the ceiling it was drawn from does not.

**8.3a "The measured closure is 21 of 94."** **[REPO]** §0 of the same document. **Refuted: 29.**
§3.4. Eight rules the 12-node sample never reached — six of them the whole unlock family, plus
`stamp-task-intent-planned` and `task-with-open-part-of-child-becomes-outcome`, both of which need
an UNTICK to reach. **[REA] The direction of the error is the part to hold: sampling a closure can
only ever undercount it, so every per-view number in that table is a floor.**

**8.4 "A chain can have at most ten links, bounded by his ten priorities."** **[REPO]** §5.2.
**Refuted as a general bound.** The unlock cascade is six rules at ONE priority, sequenced by file
order under a stable sort (`executor/core.py:48-86`). Priority bounds the routine chain; it does not
bound a cascade written the way his unlock cascade is written.

**8.5 My own first hypothesis about why the previous rig missed the unlock.** I expected a
definitional gap — that only `open` nodes were ticked, and 2319 is `waiting`. **I was wrong.**
**[OBS]** 158 tickable = 125 open + 23 waiting + 10 other, which is exactly the previous document's
own figure, so `waiting` was in scope. The cause is the 12-node sample it declared in §12.4.
Recorded because a definitional gap would have been a much more serious finding, and I would have
reported it as one.

**8.6 "The payload cost is what stops local mirroring."** **Refuted.** §6.3: the browser is already
sent 805 KB of graph and reads none of it. The config table that would let it read that graph
correctly is 59 KB.

**8.7 "The dojo demonstrates the mechanic."** **Refuted at this graph state.** §2.4: all four dojo
nodes are `done`; a tick reaches zero rules and an untick of the head reaches one and stops. The
demo is a completed demo.

---

## 9. What is unsettled

**9.1 The graph is a week old.** **[UNVERIFIED]** 2026-07-24 against a 2026-07-31 vault. **Settled
by** re-running §2 against a current `state.db`. **[REA]** For UNLOCKS this is a one-directional
risk — he has been authoring `#unlocks` since 20 July — so "four edges" is a floor.

**9.2 I measured one gesture kind, like the document before me.** Every number is `status := done`
or `status := open`. A line edit that changes `domain`, `due_date` or a tag reaches a different set,
and **for the config-only kinds it is the more interesting gesture**, because defaults, registration
and vocabulary all fire at authoring time rather than at tick time. **Settled by** repeating §3
with field perturbations and with a minted line.

**9.3 The gesture that AUTHORS an `#unlocks` edge is still unmeasured.** Every gesture in both
documents is a field change on an existing node. Authoring `#unlocks` on a line creates an edge
through the parser and the structural-token resolver, and no rig here simulates that. **[REA]** It
is the gesture the vocabulary mirror (§4.4) would serve, and it is the one where a local answer is
both cheap and unverified. **Settled by** driving `io.parser` over a synthetic line and diffing the
resulting edge set. (**Note:** I expected R2 and R3 to be unreachable for this reason and I was
wrong — §3.4 reaches both by unticking a held row.)

**9.4 Whether the config-only table is what he wants published.** It is my reading of what the
measurement licenses. **[REA]** It is strictly more than the adjacency mark, needs no second
interpreter, and has a working generator precedent in this repo. He may still prefer to spend the
half day on the closure instead.

**9.5 The 59 KB table is measured as JSON, not as shipped.** **[UNVERIFIED]** Gzip over a table this
repetitive would cut it substantially; I did not measure it, and the number in §6.1 is therefore a
ceiling.

---

## 10. Reproduction

**No trunk clone was written. No cycle was run. `graph-sync` was not run. `map . --full` was not
run. Nothing was posted to any server. `~/qntm` was not touched. `~/.qntm-md/state.db` was COPIED
and the copy was opened `mode=ro`. `apps/qntm-md/config/` was COPIED and the copy was loaded. No
application source is modified — this document is the only file this branch adds.**

```
# ── THE RIG (same shape as research-the-rule-closure.md §13, so the numbers stack) ──
cp ~/.qntm-md/state.db      <scratch>/state.db        # 1,083,658,240 B, opened mode=ro only
cp -R apps/qntm-md/config   <scratch>/config          # 276 yaml files, read never written
apps/qntm-md/.venv/bin/python                         # the real qntm_graph / qntm_rule_engine / qntm_md

rig.py        loader.load(<scratch>/config)           # 252 patterns, 94 rules, 72 views,
                                                      #   134 vocab, 31 node types, 7 edge types
              Graph.from_dict(graph_state); graph._patterns = bundle.patterns
                                                      # exactly orchestrator.py:5363-5407
                                                      # 1,501 nodes, 460 edges, upd 2026-07-24
rules.py      qntm_rule_engine.execute() per rule, in the engine's own priority order,
              real dispatcher (build_dispatcher_registry) + real PatternResolver +
              real EventLogStore over the read-only copy
              # rest pass: 273 firings, 28 distinct rules, 431 writes, 0.9 s

# ── U1 — the edges, and both-ends-in-one-view ──
u1_edges.py           # PART_OF 417 · WAITING_FOR 22 · REQUIRES 17 · UNLOCKS 4 · NEXT/PARALLEL/SPONSORS 0
                      # cluster_locked=true x1, unlocks_held=true x5, cluster_satisfied null x104
u1_membership.py      # render.compile -> _compose_section_members -> render.filter
                      # 72 views, 186 sections, 0 errors, 1,919 memberships
                      # UNLOCKS 4/4 both ends · WAITING_FOR 22/22 · REQUIRES 16/17 · PART_OF 334/417
                      # 2319 in daily-work/everything-work/waiting-for-work; 2320 in everything-work only

# ── U2 — the gesture, and the reconciliation ──
u2_unlock_gesture.py  # tick 2319 -> 7 rules, 8 nodes, 1 edge deleted, 5 nodes released
                      # tick 2320 -> 2 rules · dojo ticks -> 0 rules · untick 2293 -> 1 rule
u2b_reconcile.py      # everything-work 607 = 125 open + 23 waiting + 449 done + 10 other
                      #   -> tickable 158, matching the prior doc; 2319 WAS eligible
                      # rows changed in view: everything-work 6, daily-work 1,
                      #   waiting-for-work 1, metrics 1
u2c_exhaustive.py     # EXHAUSTIVE, closing prior-doc limit 12.4
                      # 619 nodes x both directions = 652 gestures, ~35 min
                      # rules reached/gesture: 0 x460, 1 x75, 2 x56, 3 x37, 4 x22, 5 x2
                      # max rows in one view:  0 x28, 1 x428, 2 x188, 3 x6, 5 x1, 6 x1
                      # union 24 (firings-delta only); 8 NOT in the prior 21
                      # combined measured closure 29 of 94

# ── U3 — the taxonomy, enumerated not assumed ──
u3_census.py          # 15 loader content classes, 8 used, 7 declared-and-empty
                      # 73 sheets / 186 sections; every sheet + section key counted
                      # vocabulary 134: field 91, node_type 28, edge_type 6, parametric 4,
                      #   structural 3, deletion 2; render_only 2; chrome 6
                      # day_boundary Europe/London 04:00 monday; grammars tolerant + checkbox_only
u3_detail.py          # defaults 153 sections / 67 maps / 8 fields; global {} ; subtree OFF
                      # default_node_type 18 sheets (routine x7); domain 13 values
                      # pull_context descendants 59 / both 18; ordering 7 + ordering_mode 2
                      # structural_edge_types 6, all [WAITING_FOR] incoming
u3_more.py            # verbs: set_field 77/70 rules ... create_subtree 3/3
                      # templates 3 · cadence 13 tokens / 10 rules · identity 7 types
                      # render.shape checkbox 13 / plain_line 9 / stat_line 1 / heading 1

# ── U4 — depth per kind ──
u4_depth.py           # subtree depth below a node: max 6 (0:1287 1:168 2:28 3:11 4:5 5:1 6:1)
                      # ancestor depth above a node: max 6
                      # UNLOCKS chains 3 and 1 links; REQUIRES chains 1x9, 2x2, 4x1
                      # defaults cascade: 153 sections speak at ONE level, 33 at zero, none at two
                      # graph blob on the wire: 805,155 B (edges alone 77,651 B)

# ── U5 — the config-only table, BUILT ──
u5_configonly.py      # 60,490 B total: global 227 / grammars 274 / vocabulary 12,838 / views 47,105
                      # per view: min 454, median 685, max 1,930

# ── THE APP'S READ PATH, ENUMERATED (never grepped for absence) ──
grep -rn "graphData" app/       # 13 occurrences: 4 assignments (3 = api() envelope), 1 comment,
                                #   6 reads at 1222/1249/1326/1429/1744/1928, all -> ?.snapshot?.views
grep -rn "\.graph[^A-Za-z_]" app/   # no destination; the positive statement is the enumeration above
wc -c presentation.json         # 3,303 B — already carries the generated `structural` slice
```

**The bundle load emits several thousand `structlog` debug lines.** Silenced with `logging.disable`
plus a filtering bound logger. Recorded because the first run looked like a failure and was not —
the same trap the previous document recorded, sprung again.

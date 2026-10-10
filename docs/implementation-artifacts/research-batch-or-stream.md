# Research: batch or stream — can the engine take a stream of small changes, or is it structurally a batch machine?

**Status:** research. **No application source changed on this branch.** This document is the whole
of it.

**Branch:** `research/batch-or-stream`, based on `origin/main` @ `5d36a99` of `QNTM-Network/qntm-network`.

**The ask, in the operator's own words:** *"can we make sure the engine is able to handle either
batch or streamed. so it can handle browser streams of changes. as we don't want to couple to this.
and if it becomes smooth on FE resolving well in that parity it will be sending streams to ending in
semi-constant processing. but that's a whole architecture I imagine."* He is scoping, not
commissioning — this document establishes what is true today, not a streaming design.

**Evidence rule**, matching the corpus. **[OBS]** a command run this session, output read directly,
against this worktree or a read-only view of the monorepo at
`/Users/lukeannison/projects/qntm-network/qntm`. **[REA]** reasoned from something labelled OBS.
**[REPO]** a claim an already-merged document in this repo makes, cited, not independently
reproduced this session. Sizes are the house scale: **under an hour** / **half a day** / **an arc**.

**A note on which commit the monorepo evidence comes from.** The monorepo trunk clone is pinned
behind `origin/main` on purpose (standing constraint for this task) — it sits at `cb8e159`, three
commits behind `origin/main` @ `bc3aa01` (`0cbab1d` #69, `38330a6` #71, `bc3aa01` #72). Every citation
below that needs post-#69 code was read via `git show origin/main:<path>`, never by moving the
checkout — confirmed via `git diff --stat HEAD origin/main -- <path>` for each file cited, so a
citation against a line number is stated as accurate against the checked-out tree, against
`origin/main`, or both, explicitly.

---

## 0. Lead — the answer, in 25 lines

**No, not today. The engine is structurally a batch machine at every phase but one, and the store is
exactly the blocker the operator suspected — though not in the file he named.**

`run_cycle` (`apps/qntm-md/src/qntm_md/coordination/orchestrator.py:5508`) re-reads every markdown
file, re-evaluates every rule, re-renders every view, and re-serialises the whole graph to one JSON
blob — on every invocation, regardless of how much changed. The one already-incremental part is the
differ: Phase A/B classify only the lines that actually changed against `line_cache` fingerprints,
so `apply_candidates` are scoped. Everything downstream of that ignores the scoping.

**The store is real, but the operator named the wrong file.** `core/graph/…/sqlite_store.py`'s
`SqliteStore` class is never called by the production cycle — `apps/qntm_md/…/persistence/schema.py:56`
says so in as many words: *"we never call `SqliteStore.save()` (separate connection breaks
atomicity)."* The production path is a hand-rolled duplicate of the same mechanism, inline in
`orchestrator.py:664-681`: `json.dumps(graph.to_dict())`, one row, `graph_state`, unconditional, every
cycle. `graph.to_dict()` walks **every** node id and **every** edge with no dirty-tracking
(`core/graph/src/qntm_graph/core/serialisation.py:46-58`). **The mechanism the operator's guess named
is exactly real; the specific file is not.**

**A single write today costs one file overwrite (O(1)) plus one full cycle (O(whole vault)),
serialised behind one process-wide lock, at a measured floor of ~10-14 seconds.**
`worker/src/app.js:302` calls this "the ~10-14s step" outright, and `server/app.py:_cycle_lock`
blocks every concurrent `/cycle` call behind one mutex — there is no partial-cycle, no queueing by
priority, just serial full cycles.

**PR #69 (today, monorepo) fixed the single biggest READ-side cost inside a cycle — the id-lookup
scan, 86.3s of a 94.4s profiled apply phase — but touched none of: the full-file read, the full
rules pass, the full render pass, or the full-graph save.** It made the cycle faster. It did not make
the cycle incremental.

**Refuted: "quadratic."** A single write costs O(graph), not O(graph²) — total cost across a stream
of *k* writes is O(k × graph size), linear in stream length, not quadratic. But the practical verdict
is not much gentler: O(graph) per write at a multi-second floor, serialised by one lock, means the
engine cannot keep pace with any stream arriving faster than one full-cycle-latency apart. Writes
would queue, unboundedly, behind a 10-14s tax per item — the failure mode is an ever-growing backlog,
not a quadratic blow-up.

---

## 1. Is `run_cycle` inherently whole-vault? — traced, not assumed

**`run_cycle`** (`apps/qntm-md/src/qntm_md/coordination/orchestrator.py:5508-…`, docstring's own
nine-step account) walks: load bundle → load graph → open txn → walk seven/eight phases via
`_iterate_phases` → save graph → commit → write views. Traced phase by phase, against real code, not
the docstring's summary:

**Phase A — filesystem capture. Whole-vault, unconditionally.**
`_capture_filesystem_state` (`orchestrator.py:818-833`), own docstring: *"Walks the vault once per
cycle... snapshots every `.md` file's content."* **[OBS]** Every file's full text is read into memory
every cycle, whether or not it changed. This is the only entry point Phase B's differ consumes — it
does not re-read from disk (`orchestrator.py:823`: *"Phase A then operates purely on this snapshot"*).

**Phase B — the differ. The one genuinely incremental part.** `diff()`
(`apps/qntm-md/src/qntm_md/diff/content_diff.py:1459`) classifies each file's content against
`line_cache` fingerprints and produces `ApplyCandidate`s only for lines that changed — **[REA]** this
is real scoping: the apply phase (below) only touches nodes with a candidate, not every node in the
graph.

**Phase C — apply. Scoped to the differ's output.** `_run_apply_phase`
(`orchestrator.py:1635-1661`) calls `apply(apply_candidates, graph, …)` — bounded by what Phase B
found, not the whole graph. Before PR #69 this phase's own node lookups (`_find_node_by_qntm_id`)
were themselves an unindexed full scan per lookup — see §3.

**Phase D — rules. Whole-ruleset, every cycle, unconditionally.** `_run_rules_phase`
(`orchestrator.py:2172-2206`) calls `qntm_rule_engine.execute(rules, event_context, …)`
(`core/rule-engine/src/qntm_rule_engine/executor/core.py:729-777`, verified unchanged on
`origin/main`). `execute`'s own body: `selected = select_rules(rules, namespace=namespace,
group=group)` then `for rule in selected:` — **every** rule matching the namespace/group filter
(which is not a "what changed" filter — it selects by rule metadata, not by node) is evaluated, every
cycle. A `for_each` rule calls `_execute_for_each_rule`
(`core/rule-engine/src/qntm_rule_engine/executor/core.py:420-…`), which resolves its pattern fresh
against current graph state via `pattern_resolver` on every cycle — there is no "only re-run rules
whose pattern could match a changed node" narrowing anywhere in this path. **[OBS]**
`research-the-resolution-universe.md` §1 **[REPO]**: *"the engine's own rules pass at rest, over that
graph: 273 firings across 28 distinct rules, 431 dispatched writes. One pass costs about 0.9 s"* — a
full pass, at rest (no changes at all), still costs 0.9s in Python, because "at rest" still means
every rule's pattern gets re-evaluated.

**Phase E — render. Whole-view-set, every cycle, unconditionally.** `_run_render_phase`
(`orchestrator.py:3154-…`, loop at `:3215` on `origin/main`, `for index, view_sheet in
enumerate(view_sheets):`) — **every** view sheet in the loaded bundle is rendered every cycle,
regardless of whether that view's membership could possibly have changed. The one narrowing that
exists is a WRITE-skip, not a render-skip: back in `run_cycle`, `skip_empty_render`
(`orchestrator.py`, the `sheets_to_write`/`sheets_skipped_empty` loop before `write_views`) avoids
re-writing a view file to disk when its render produced no line records **and** `line_cache` already
holds rows for it — but the render *computation* (section-tree build, pattern resolution for
membership) has already happened for every view by the time that check runs.

**Phase F — save. Whole-graph, every cycle, unconditionally.** §3 below, in full.

**Verdict on §1.** Two of six phases are scoped to what changed (the differ, and the apply phase that
consumes it). The other four — filesystem capture, rules, render, save — are whole-vault every single
cycle, with no dirty-tracking anywhere in the chain that would let a one-line edit cost less than a
thousand-line one. **This is not a design flaw in any single phase — each one is correct for what it
does — it is the absence of any mechanism connecting "what changed" (which the differ already knows)
to "what else needs recomputing" (which nothing downstream asks).**

---

## 2. What does a single write cost today?

**The path**, traced end to end: browser → `worker/src/app.js`'s `editFile`
(`worker/src/app.js:394-…`, this app repo) → `POST {GRAPH_SERVER_URL}/vault/file` → `POST
{GRAPH_SERVER_URL}/cycle` → whole snapshot back.

**`POST /vault/file` — O(one file).** `server/app.py:1209-1278` (monorepo). Reads `path`/`markdown`
from the request body, checks a `base` precondition against one stored hash (`_stale_base`, O(1) —
one comparison, not a scan), and on success does exactly one thing: `target.write_text(str(markdown),
…)` — one file, whole-file overwrite, no cycle triggered by this call alone. **This half of the path
is genuinely cheap and already close to what streaming would need — one small, targeted write.**

**`POST /cycle` — O(whole vault), serialised behind one lock.** `server/app.py:1300-1337`. `with
_cycle_lock: … summary = run_cycle(_registration(), VAULT, DB)` — every `/cycle` call blocks on one
process-wide `threading.Lock()` (confirmed by the commentary at `worker/src/app.js:308-318`, which
states this precisely: *"`server/app.py` serialises every `/cycle` call through one process-wide
`threading.Lock()`... blocking IS the answer"* **[REPO]**). Then it builds the response:
`"snapshot": _envelope()` (`server/app.py:1336`), and `_envelope()`
(`server/app.py:1039-1052`) calls `_read_graph()` (the **whole** `graph_state` row) and
`_read_views()` (**every** view file on disk) — so the response to a one-checkbox-tick write rebuilds
and ships the entire 77-view, ~1.02 MB envelope, of which 741 KB (69.3%) is graph data the browser
never reads (`research-state-and-speed.md` §2.4, `app/` greps for `snapshot.graph`: zero hits).
**[REPO]**

**Measured cost, several independent sources, in agreement:**

- `worker/src/app.js:302` — *"A cycle is the ~10-14s step this file measures elsewhere."* **[REPO]**
- `server/app.py:50`, quoted by `research-state-and-speed.md` §3.1 — the healthy baseline is **~10s**;
  a debug-logging regression *"turns a ~10s cycle into minutes of pure log I/O."* **[REPO]**
- `research-state-and-speed.md` §3.1, a real `run_cycle(dry_run=True)` against copies of the
  operator's real vault/db, three runs: **48.86s, 49.24s, 49.03s**, all aborting mid-apply on schema
  drift — so these are *partial* cycles, on hardware "several times faster than a Fly
  `performance-1x`." **[OBS, that document]**
- The same document's `cProfile` table (profiler overhead inflates wall time; *proportions* are the
  useful part): `_run_apply_phase` 94.4s cumulative / 1 call; `find_nodes` 93.7s / 17,280 calls;
  `_find_node_by_qntm_id` 86.3s / 15,035 calls; `_reconstruct_node` 54.5s / 28,730,523 calls;
  `renderer.render` (72 views) 8.9s. **[REPO]**

**PR #69, merged today, closed the dominant named cost — but only that one.** `gh pr view 69`
**[OBS, this session]**: id-lookup went from 3,094.55 µs/call to 3.65-4.10 µs/call at 1,700 nodes
(**~755-847×**), the exact `_find_node_by_qntm_id` cost that dominated the profiled apply phase. It
did this via three plain-dict indexes on `GraphStore`
(`core/graph/src/qntm_graph/_nx.py:38-56`, `origin/main`, verified `git diff --stat HEAD origin/main`
shows only `_nx.py`/`queries.py`/the new test file touched) — `_type_index`, `_field_index`,
`_insertion_seq`, maintained at the three storage chokepoints (`add_node`/`update_node_data`/
`remove_node`) so they cannot drift. `find_nodes`/`find_nodes_by_query`
(`core/graph/src/qntm_graph/core/queries.py:60-90`, `origin/main`) now narrow via
`_candidate_node_ids` before reconstructing, falling back to a full scan only when there is no
filter at all or an unhashable predicate value. **This is a READ-side fix inside the apply and rules
phases. It touches nothing in Phase A (file read), nothing in Phase E (render), nothing in Phase F
(save).** After #69, the profiled ratio inverts — rendering (8.9s) becomes the largest *named*
remaining cost — but the PR's own benchmark is an unprofiled, synthetic 1,700-node graph, not a
re-run of the real, profiled cycle, so this document does not claim a new end-to-end number, only
that the specific 86.3s line item is closed. **[REA]**

---

## 3. THE STORE — confirmed as the mechanism, corrected as to which file

**The operator's claim, checked at the source he named.** `core/graph/src/qntm_graph/persistence/sqlite_store.py:12-50`.
`SqliteStore.save()`: `conn.execute("INSERT OR REPLACE INTO graph_data (id, data, updated) VALUES
(1, ?, ?)", (json.dumps(data), …))` — one row, whole-graph JSON, unconditional, on a **fresh SQLite
connection it opens itself**. The class's own docstring: *"Stores the graph dict as a single JSON
entry."* **[OBS]** As a description of a mechanism, this is exactly right.

**But it is not the mechanism the production cycle uses.**
`apps/qntm-md/src/qntm_md/persistence/schema.py:52-57` states this explicitly, in a comment attached
to the `graph_state` table DDL: *"Column shape mirrors the graph-library `SqliteStore` row shape so a
future operator-level dump is directly interpretable, but the read/write path lives on the cycle
conn — we never call `SqliteStore.save()` (separate connection breaks atomicity)."* **[OBS]**
`orchestrator.py:664-681`'s own docstring for `_save_graph_in_transaction` repeats the same reasoning
independently: *"Atomicity contract: callers MUST invoke this before `conn.commit()`... NOT via
`SqliteStore.save()` — that opens its own connection and commits independently, breaking the cycle's
all-or-nothing rollback semantic."* **[OBS]**

**What actually runs, every cycle, unconditionally:**

```python
# orchestrator.py:678-681
conn.execute(
    "INSERT OR REPLACE INTO graph_state (id, data, updated) VALUES (1, ?, ?)",
    (json.dumps(graph.to_dict()), datetime.now(timezone.utc).isoformat()),
)
```

Same table shape (`id, data, updated`), same one-row-whole-blob mechanism, same unconditional write —
implemented a second time, by hand, on the cycle's own transactional connection instead of through
the named, tested, exported `SqliteStore` class. `graph.to_dict()`
(`core/graph/src/qntm_graph/core/__init__.py:452-459` → `core/serialisation.py:28-58`, `origin/main`,
confirmed identical to the checked-out tree) has **no dirty-tracking of any kind**: `for node_id in
store.all_node_ids(): … nodes.append(...)` then `for source, target, data in store.all_edges(): …` —
every node, every edge, every cycle, regardless of how many actually changed since the last save.

**Verdict.** The operator is right about the mechanism and its cost shape, and right to call it the
blocker: a stream of changes cannot be safely persisted more often than one full-graph
serialise-and-write allows without a structural change to this layer. He is wrong only about which
file does it — the class he read is real, exported, tested, and unused in production; a parallel,
hand-rolled copy does the actual work. This is a distinction worth having exactly right, because a
fix aimed at `SqliteStore.save()` would fix nothing — the fix has to land in
`orchestrator.py:_save_graph_in_transaction` and in `Graph.to_dict()`/`from_dict()`'s whole-blob
contract, not in the unused class.

**At ~1,501 nodes / 460 edges (741,245 bytes serialised — two independent measurements agree,
`research-state-and-speed.md` and `research-the-resolution-universe.md` §1, both **[REPO]**), this
document did not independently measure the wall-clock cost of `graph.to_dict()` + `json.dumps` +
`INSERT` in isolation** — see §6, "what I could not measure." Serialising ~741 KB of already-built
Python dicts to JSON is very unlikely to be seconds by itself (typical CPython JSON encoding runs at
tens to hundreds of MB/s), so this specific step is probably **not** the dominant cost inside today's
measured 10-14s — but that is a different claim from "it is not a blocker." It is not a blocker
today, at today's call frequency (once per full cycle). It is a hard ceiling on how far
*incrementality* can ever go without changing it: even after every other phase is made dirty-scoped,
this layer still writes the whole graph as one atomic blob, once per persisted change — so the
sustainable streaming rate is bounded by this step's own cost, whatever it turns out to be, times the
number of writes per second the operator wants to sustain.

---

## 4. What else is coupled to batch

**Rules — whole-ruleset every cycle, and this is not entirely fixable by "just" dirty-tracking.**
§1 Phase D. Confirmed structurally coupled: `execute()`'s `for rule in selected:` loop has no
"which rules could this specific change possibly affect" filter. **Some of that coupling is
inherent, not accidental** — `design-the-three-layers.md` §7 **[REPO]** names **six whole-graph
aggregate rules** (`coverage-overall`, `coverage-personal`, `coverage-work`, `age-of-intent-overall`,
`age-of-intent-personal`, `age-of-intent-work`) that read the whole graph by definition — no
finite-depth scoping recovers those, because their answer genuinely depends on every node. A
dirty-scoped rules pass would need to either (a) special-case these six to still run whole-graph
(on a slower cadence than every keystroke) while everything else scopes to affected nodes, or (b)
accept they lag behind a stream and reconcile periodically. Neither is built or designed anywhere in
this repo today.

**Render — whole-view-set every cycle.** §1 Phase E. Every view sheet renders every cycle; only the
disk *write* has a narrow skip (`skip_empty_render`). No "which views could this node's change
possibly affect membership of" narrowing exists. `research-state-and-speed.md` §3.1's cProfile:
rendering 72 views costs 8.9s even at rest — the largest *named* remaining cost once #69 closes the
lookup cost.

**Filesystem capture — whole-vault read every cycle.** §1 Phase A. Every `.md` file's full text is
read into memory every cycle, though the actual vault-wide markdown volume is modest (~1.02 MB across
77 views per `research-state-and-speed.md` §1) so this specific step is likely cheap in absolute
terms today — the coupling is structural (it is O(vault), not O(changed file)), not necessarily the
dominant cost.

**The response envelope — whole-vault every response.** §2. `_envelope()`
(`server/app.py:1039-1052`) rebuilds the full graph + all 77 views on every single `/cycle` response,
even for a one-checkbox tick. This is the same shape §8 row 1 of `design-the-three-layers.md`
**[REPO]** already names as missing for a completely different reason (the browser's working set) —
**a scoped-node wire is a prerequisite both documents independently converge on**, one from "the
browser shouldn't have to hold the whole graph to resolve a view," the other from "the server
shouldn't have to re-ship the whole graph to answer one write." Naming this convergence is new to
this document; neither prior document had the other's angle.

**Concurrency — one process-wide lock, no partial cycles.** §2. `_cycle_lock` serialises every
`/cycle` call. There is no notion of "run a smaller cycle for this one change while a bigger one is
in flight" — every write, however small, queues behind every other write's *full* cycle cost.

**What PR #69 already unblocked, stated precisely.** It converted the in-cycle id/field-predicate
lookup path (dominant at 86.3s of a 94.4s profiled apply phase) from O(n) scan-and-reconstruct-per-
lookup to O(1) indexed lookup. It is a **cycle got faster** fix, not a **cycle became incremental**
fix. After #69, `run_cycle` is still whole-vault-in (Phase A), whole-ruleset (Phase D),
whole-view-set (Phase E), whole-graph-out (Phase F) — it is just less slow at one specific
whole-vault-out sub-step inside Phase C/D's lookups. The index also, incidentally, makes node
removal/insertion bookkeeping itself O(1) per node (`_type_index`/`_field_index` are updated at the
storage chokepoints, `core/graph/src/qntm_graph/_nx.py:58-…`, `origin/main`) — so identity bookkeeping
was never part of the batch coupling; it was already per-node before #69 and is now also indexed for
lookup.

---

## 5. What streaming would actually require — the honest, ordered list

**Needed for correctness (changes what the system guarantees, not just how fast it runs):**

1. **A write unit smaller than "the whole file."** Today `/vault/file` always overwrites a complete
   view (`server/app.py:1244`, `body.get("markdown")` is the entire file). A stream of small changes
   needs either a line/field-level write primitive, or client-side coalescing that still posts whole
   files — the latter needs **no** engine change but inherits the full-cycle cost per POST, so on its
   own it does not solve anything; it just knocks on the same expensive door more often. **Needs
   nothing else first — could start now, but buys nothing alone.**
2. **Decouple "ingest one change" from "run a full cycle."** The deepest correctness change: apply
   one line's diff to the graph and persist it *without* re-running the full rules/render pipeline
   over everything else. Requires either a dependency analysis that can say "which rules could this
   field, on this node, possibly make true or false" (nothing like this exists today — `execute()`
   has no such index), or accepting that some rules (the six whole-graph aggregates, §4) must lag on
   a slower cadence while the rest scope to the touched node. **This is a design decision, not just
   an engineering task — it decides which rules are allowed to be stale between full sweeps.**
   **Needs #1 to have something to ingest incrementally against.**
3. **The persistence layer stops being "one row, whole graph, one blob."** §3's finding, restated as
   a requirement: `graph_state`'s `INSERT OR REPLACE` of the whole serialised graph must become a
   per-node (or per-changed-node) write — individual rows, or a real append-only delta log the graph
   replays/patches. This is the deepest, most expensive item on this list and the one the operator's
   brief named correctly as the blocker, mechanism confirmed in §3. **Needs #2** — there is no point
   writing per-node deltas if the rules/render phases still need the whole graph reloaded to run.
4. **Real dirty-view tracking in render.** Only re-render views whose membership or displayed content
   could plausibly have changed given the specific fields/nodes touched, instead of all ~83 view
   sheets every cycle. **Needs #2** — dirty-view tracking is meaningless without a dirty-node signal
   to derive it from.
5. **The response stops shipping the whole graph and all views on every write.** The scoped-node wire
   `design-the-three-layers.md` §8 row 1 / §12 row 1 already backlogs, for the browser's working-set
   reason — turns out to be the same prerequisite streaming needs on the way *out*. **Needs #3/#4** to
   have a genuinely small answer to serve; serving a *declared* small answer built from a still-whole
   internal recompute would be dishonest bandwidth savings with none of the compute savings.
6. **The single process-wide cycle lock becomes finer-grained**, or "a cycle" as a unit is replaced
   with something that can process one small change without blocking every other small change behind
   it. **Needs #2/#3** — finer-grained locking over a still-whole-graph-blob store just serialises
   contention differently; it does not remove the O(graph) cost per write.

**Needed for speed only (no correctness change, could ship independently, raises the sustainable rate
without removing the batch coupling):**

7. **Profile and reduce the render phase's own 8.9s** (§4) — memoise unaffected views' section trees,
   or partial re-render of touched sections. Makes every cycle cheaper without making it incremental.
8. **Stop shipping the 741 KB unread graph blob on the response** (`research-state-and-speed.md`
   §2.4, already backlogged as `resolve-from-the-model-not-the-text`) — bandwidth, not compute; cuts
   what a write costs the network without touching what it costs the CPU.
9. **Measure `graph.to_dict()` + `json.dumps` + the `INSERT` in isolation** (§6) — if this turns out
   to be genuinely cheap at 1,501 nodes, it changes how urgent item #3 is relative to items #2/#4;
   if it is not cheap, it raises #3's priority. Either way this is a measurement, not a build.

---

## 6. What must NOT happen — the browser must never grow a cycle

The operator's own framing, and `design-the-three-layers.md`'s own pin: *"The browser has no cycle
and must never grow one."* **[REPO]** Checked against every item in §5's ordered list: none of items
1-9 introduces a periodic sweep on the client. The test applied to each: does the flush happen
*because something happened* (a save gesture, a blur, a specific navigation — event-driven), or
*because a clock ticked* (time-driven)? Item 1's "client-side coalescing" is the one candidate close
enough to the line to name explicitly — a debounce that flushes on a fixed timer (e.g. "batch edits
and POST every 500ms regardless of activity") **is** a cycle grown on the browser and is **disqualified**
by this test; a debounce that flushes on an event (blur, explicit save, idle-after-typing measured
from the last keystroke, not from a clock) is not, because it fires in response to something that
happened, not on a schedule that runs whether or not anything did. **Any future candidate for this
list should be checked against the same test before it is accepted.**

---

## 7. Backlog rows

Matching `docs/implementation-artifacts/backlog.yaml`'s existing schema (`id`, `title`,
`driving_capability`, `kind`, `state`, `record`).

```yaml
- id: the-graph-state-store-is-a-whole-blob-not-per-node-rows
  title: >-
    [batch-or-stream] [1] `orchestrator.py:_save_graph_in_transaction` (orchestrator.py:664-681)
    writes `json.dumps(graph.to_dict())` as one row into `graph_state`, unconditionally, every
    cycle — the exact mechanism `core/graph/…/sqlite_store.py`'s (unused) `SqliteStore.save()`
    also implements, confirmed at `apps/qntm-md/src/qntm_md/persistence/schema.py:56` ("we never
    call SqliteStore.save()"). `graph.to_dict()` (core/serialisation.py:46-58) has no dirty
    tracking — every node, every edge, every cycle. This is the hard ceiling on streaming: no
    amount of dirty-scoping upstream helps until persistence stops writing the whole graph per
    change. See docs/implementation-artifacts/research-batch-or-stream.md §3, §5 item 3.
  driving_capability: engine-persists-only-changed-graph-state
  kind: capability
  state: unscoped

- id: rules-pass-becomes-scoped-to-affected-nodes-except-named-aggregates
  title: >-
    [batch-or-stream] [2] `qntm_rule_engine.execute` (core/rule-engine/…/executor/core.py:729-777)
    evaluates every selected rule's pattern against current graph state every cycle, with no
    "which rules could this change affect" narrowing. Six whole-graph aggregate rules
    (coverage-*/age-of-intent-*, design-the-three-layers.md §7) are correctly whole-graph by
    definition and cannot be scoped — everything else could be, in principle, given a dependency
    index this repo does not have today. A design decision, not just an engineering task: which
    rules are allowed to lag a stream and on what cadence. Needs the-graph-state-store-is-a-
    whole-blob-not-per-node-rows landed first (§5 item 2 needs item 3). See §4, §5 item 2.
  driving_capability: rules-pass-is-dirty-scoped
  kind: capability
  state: unscoped

- id: render-phase-tracks-dirty-views-not-all-view-sheets
  title: >-
    [batch-or-stream] [3] `_run_render_phase` (orchestrator.py:3154, loop at :3215 on
    origin/main) renders every view sheet every cycle; the only existing narrowing
    (`skip_empty_render`) skips a disk WRITE, not the render computation itself.
    `research-state-and-speed.md` §3.1 measured 8.9s for 72 views at rest — the largest named
    remaining cost after PR #69 closed the id-lookup bottleneck. Needs a dirty-node signal from
    rules-pass-becomes-scoped-to-affected-nodes-except-named-aggregates to know which views could
    plausibly be affected. See §4, §5 item 4.
  driving_capability: render-phase-is-dirty-scoped
  kind: capability
  state: unscoped

- id: cycle-lock-stops-serialising-every-write-behind-one-mutex
  title: >-
    [batch-or-stream] [4] `server/app.py`'s `_cycle_lock` (a single process-wide
    `threading.Lock()`, confirmed via worker/src/app.js:308-318's own account) blocks every
    concurrent /cycle call — there is no partial-cycle and no priority queue, so a stream of
    small writes queues fully behind each other's full-cycle cost (~10-14s per item,
    worker/src/app.js:302). Finer-grained locking only helps once persistence and the rules/
    render passes are actually scoped (needs rows 1-3) — locking a still-whole-graph-blob store
    more finely just serialises contention differently. See §5 item 6.
  driving_capability: writes-do-not-serialise-behind-one-global-cycle
  kind: capability
  state: unscoped

- id: measure-graph-to-dict-serialisation-cost-in-isolation
  title: >-
    [batch-or-stream] [5] No document in this repo's evidence measures `graph.to_dict()` +
    `json.dumps` + the `graph_state` INSERT in isolation, at the operator's real ~1,501-node
    scale. Likely cheap (JSON-encoding ~741 KB of built dicts is not usually seconds), but
    unmeasured — and the sustainable streaming rate under any future incremental design is
    bounded by this step's own cost. A profiling task, not a build. See
    docs/implementation-artifacts/research-batch-or-stream.md §3, §6, §5 item 9.
  kind: null
  state: unscoped

- id: response-envelope-converges-with-the-scoped-node-wire
  title: >-
    [batch-or-stream] [6] `_envelope()` (server/app.py:1039-1052) rebuilds the whole graph + all
    77 views on every single /cycle response, even for a one-checkbox write. This is the same
    prerequisite design-the-three-layers.md §8 row 1 / §12 row 1 (the-scoped-node-wire) already
    backlogs for the browser's working-set reason — streaming needs it on the way OUT
    (a small write should get a small response) for exactly the reason the browser needs it on
    the way IN. Recorded so whoever picks up the-scoped-node-wire knows it serves two masters, not
    one. See §4, §5 item 5.
  driving_capability: the-scoped-node-wire
  kind: null
  state: unscoped
```

**Which axis each row pins.** None of the six moves VERTICAL or HORIZONTAL today — this document
adds no code, so no `enforcement_depth` moves and no module is reordered or newly homed. All six are
TIME-axis rows: they name a target and an ordering (§5's numbered list is the dependency chain each
row's title states explicitly) so a future pass has a queue address, not a rediscovery. Row 5
(the measurement) is the only one that could land **today** without depending on anything else in
this list — it is a profiling task, not a build.

---

## 8. What I refuted

1. **"If every save serialises the whole graph, then any write is O(graph) and a stream of changes
   is quadratic" — the mechanism is confirmed, the complexity claim is not.** §0, §3. Each write costs
   O(graph), confirmed. But total cost across a stream of *k* writes is O(k × graph size) — linear in
   the number of writes, not quadratic — *unless* the graph itself grows proportionally with the
   number of edits, which it does not within one editing session. The practically damning fact is not
   the exponent; it is the constant: O(graph) at a multi-second floor, serialised by one lock, is
   already too slow for any write rate faster than one edit per ~10-14 seconds, with no algorithmic
   blow-up required to prove it. Stated plainly because the operator explicitly invited this
   refutation and it matters for scoping any fix: this is a **throughput ceiling problem**, not a
   **complexity-class problem** — different fixes address each, and reaching for an algorithmic
   rewrite (e.g. "index the blob smarter") would not touch a throughput ceiling caused by lock
   contention and unconditional whole-graph work per call.
2. **"`core/graph/…/sqlite_store.py`'s `SqliteStore` is where every write serialises the whole
   graph" — not the file that runs, though the mechanism it describes is exactly what runs.** §3.
   `apps/qntm-md/src/qntm_md/persistence/schema.py:56` and `orchestrator.py:673-676` both state
   directly, independently, that production never calls `SqliteStore.save()` — it is unused in the
   cycle path, exported and tested but dead for this purpose. A hand-rolled duplicate in
   `orchestrator.py:_save_graph_in_transaction` does the actual work, same shape, same cost. Fixing
   the named file would fix nothing; the real target is `_save_graph_in_transaction` and
   `Graph.to_dict()`/`from_dict()`'s whole-blob contract.
3. **"The id index (PR #69) unblocked streaming" — it unblocked one read-side cost inside a cycle,
   not the cycle's shape.** §2, §4. It closed 86.3s of a 94.4s profiled apply phase (a real,
   large, now-fixed cost) but touched none of the filesystem read, the rules pass, the render pass,
   or the graph save — all four remain whole-vault, every cycle, exactly as before. "The cycle got
   faster" and "the cycle became incremental" are different claims, and only the first is true today.
4. **A candidate assumption checked and dropped: that identity/removal bookkeeping is part of the
   batch coupling.** §4. `_type_index`/`_field_index` are updated at the three storage chokepoints
   (`add_node`/`update_node_data`/`remove_node`, `_nx.py:58-…`), so per-node identity bookkeeping was
   already O(1) before PR #69 — the index made *lookup* fast, not identity bookkeeping, which was
   never the batch-coupled part.

---

## 9. What I could not measure, and why

- **`graph.to_dict()` + `json.dumps` + the `graph_state` INSERT, in isolation, at ~1,501 nodes.** No
  document in this corpus profiles this specific step alone — `research-state-and-speed.md`'s
  cProfile table covers the apply phase and rendering, not the save. Running it myself would mean
  either running a real cycle against the operator's real vault/db (forbidden — standing constraint)
  or building a synthetic graph at the right scale and profiling `to_dict()`/`json.dumps` alone,
  which was out of scope for a docs-only research pass with no application source changes. Filed as
  backlog row 5, since the answer changes how urgently row 1 needs to be built relative to rows 2/3.
- **A live, end-to-end timing of `run_cycle` against the operator's real vault, post-#69.**
  Forbidden by the standing constraints (never run a cycle, never touch `~/.qntm*` or the operator's
  vault). The closest available evidence is `research-state-and-speed.md`'s pre-#69 profiled run
  (partial, aborted on schema drift) and PR #69's own synthetic, unprofiled benchmark — neither is a
  real, current, full-cycle number, and this document does not manufacture one by combining them.
- **Whether `execute()`'s rule selection could be narrowed to "only rules whose pattern references a
  changed field" without a new dependency-analysis layer.** Named as a requirement in §5 item 2; not
  designed here, because designing it means inventing architecture, which this document's brief
  explicitly asked it not to do ("that's a whole architecture I imagine").
- **The real cost of the filesystem-capture read (`_capture_filesystem_state`) at the operator's real
  vault size, in isolation.** The ~1.02 MB total markdown figure (`research-state-and-speed.md` §1)
  suggests this is cheap in absolute terms, but no document isolates disk-read time from the rest of
  Phase A/B, and this document did not run it to check.

---

## 10. Reproduction

```
# worktree state this document was written against:
git rev-parse HEAD                      # research/batch-or-stream, based on origin/main @ 5d36a99

# monorepo trunk is pinned behind origin/main — read via git show, never by moving the checkout
cd /Users/lukeannison/projects/qntm-network/qntm
git rev-parse HEAD                                    # cb8e159, three commits behind origin/main
git fetch origin main -q && git rev-parse origin/main  # bc3aa01
git log --oneline HEAD..origin/main                    # 0cbab1d #69, 38330a6 #71, bc3aa01 #72

# §1 — run_cycle traced
sed -n '5508,5520p' apps/qntm-md/src/qntm_md/coordination/orchestrator.py   # run_cycle, docstring
sed -n '818,833p' apps/qntm-md/src/qntm_md/coordination/orchestrator.py    # Phase A, whole-vault read
sed -n '2172,2206p' apps/qntm-md/src/qntm_md/coordination/orchestrator.py  # Phase D, rules
sed -n '3154,3225p' apps/qntm-md/src/qntm_md/coordination/orchestrator.py  # Phase E, render loop

# §2 — a single write, traced through the server
grep -n '"/vault/file"\|"/cycle"' server/app.py
sed -n '1209,1278p' server/app.py    # POST /vault/file — O(one file)
sed -n '1300,1337p' server/app.py    # POST /cycle — run_cycle + whole envelope
sed -n '1039,1052p' server/app.py    # _envelope() — whole graph + all views

# §3 — the store, both files
sed -n '1,50p' core/graph/src/qntm_graph/persistence/sqlite_store.py        # SqliteStore, unused
sed -n '643,682p' apps/qntm-md/src/qntm_md/coordination/orchestrator.py     # the real write path
sed -n '50,58p' apps/qntm-md/src/qntm_md/persistence/schema.py              # "we never call SqliteStore.save()"
git show origin/main:core/graph/src/qntm_graph/core/serialisation.py | sed -n '28,58p'   # to_dict, no dirty-tracking

# §2/§4 — PR #69's own account and diff scope
gh pr view 69 --repo QNTM-Network/qntm --json body -q .body
git diff --stat HEAD origin/main -- core/graph core/rule-engine server/app.py apps/qntm-md/src/qntm_md/persistence/schema.py
git show origin/main:core/graph/src/qntm_graph/_nx.py | sed -n '24,56p'      # the three indexes
git show origin/main:core/graph/src/qntm_graph/core/queries.py | sed -n '60,90p'  # find_nodes, narrowed

# §2 — worker-side cost commentary
rg -n 'the ~10-14s step|_cycle_lock' /Users/lukeannison/projects/qntm-network/wt-stream/worker/src/app.js

# NOT RUN: no cycle, no graph-sync, no wrangler --remote, no POST to https://qntm-graph.fly.dev, no
# git stash, no merge. ~/qntm and ~/.qntm* were never opened. The monorepo trunk at
# /Users/lukeannison/projects/qntm-network/qntm was read only, never moved, never edited — every
# post-#69 citation went through `git show origin/main:<path>`, verified unchanged from the checked-
# out tree via `git diff --stat` per file before being cited. renderer.py, compile-resolution.mjs
# and app/present/express/ were not touched (a concurrent agent's files, per this task's own
# constraint). No file under config/ or apps/qntm-md/config/ was created, edited, moved or deleted.
```

# Design: the three layers — the graph, resolution, and presentation, pinned as the target every later decision is judged against

**Status: design. No application source is modified on this branch. This document, its four
superseding pointers, two `docs/architecture/*.yaml` additions and a set of backlog rows are the
whole of it.**

**Branch:** `design/the-three-layers`, based on `origin/main` @ `4ce2c4f` of `QNTM-Network/qntm-network`.

**What this document is.** This is dictation, not invention. The three-layer split below is the
operator's own model, reached over a long session of measurement and correction against this
repo's own code and its own prior documents. My job is to record it faithfully, cite every number
to where it came from, correct the numbers that were wrong when checked, and say plainly where the
running code does not yet match the target. Where the model leaves something open, this document
names it as open rather than deciding it for him.

**Evidence rule**, matching the corpus. **[OBS]** a command run this session, output read directly,
against this worktree or a read-only view of the monorepo at
`/Users/lukeannison/projects/qntm-network/qntm`. **[REA]** reasoned from something labelled OBS.
**[REPO]** a claim an already-merged document in this repo makes, cited, not independently
reproduced this session. **[NEW]** a judgement this document adds that no merged document states.
Sizes are the house scale: **under an hour** / **half a day** / **an arc**.

**What was and was not touched.** No cycle ran. `graph-sync` did not run. Nothing was POSTed to
`https://qntm-graph.fly.dev`. `~/qntm`, `~/.qntm/graph.db`, `~/.qntm-md/state.db` were never opened.
The monorepo at `/Users/lukeannison/projects/qntm-network/qntm` was read only, via absolute paths,
never written and never `cd`-ed into as a place to make changes. `git stash` was not used. No file
under `config/` or `apps/qntm-md/config/` was created, edited, moved or deleted. PRs #128–#132 and
everything they touch (`app/present/`, `scripts/`, `app/index.html`) were read only, never edited.

---

## 0. The three layers, stated once, plainly

**First principle: the model is not the view. The graph is the source of truth.**

1. **THE GRAPH — a store.** Nodes, edges, fields. Its only job is to answer *what exists*, fast. It
   knows nothing about views, markdown, rules or presentation. Reads: this node; which nodes match;
   what is connected. Writes: this node changed.
2. **RESOLUTION — what the facts MEAN given the config.** Runs in **both** the engine and the
   surface, from the **same compiled declaration**. This is the only reason the two can agree. It is
   not a layer that lives in one place.
3. **PRESENTATION — how resolved facts become something you look at.** Runs **only** on the surface.

**Today all three are fused in the engine and shipped as markdown.** That is why the surface has no
agility today — it receives a block of text and must reverse-engineer the other two layers out of
it. That fusion is the defect this document retires as a target, not a claim that it is retired
already. §8 states the gap between this target and the running code without smoothing it.

---

## 1. Which axis this pins, and which it does not

Stated up front, per the house convention (`design-the-compiler-and-the-bands.md`,
`design-the-two-rules.md` §7, `research-the-store.md` §9): VERTICAL (capability → package → module →
sink), HORIZONTAL (ordered, homed modules), TIME (a small point now, fleshed out later). Unpinned is
the default here — **75 of 121 capabilities in `apps/qntm-md/docs/architecture/capabilities.yaml`
(the trunk clone, read-only) sit at enforcement depth 1** **[REPO]**
(`design-the-two-rules.md` §7, itself citing `design-the-compiler-and-the-bands.md`'s own count) —
so a document pinning on no axis joins the majority, not escapes it.

**TIME — pinned, and pinned hard.** This is the one axis this document exists to move. It fixes the
target that every later slice is measured against, the same posture `roadmap-the-road-ahead.md` §4
takes for its three bands. Nothing here is provisional in the sense of "might change"; it is
provisional in the sense of "not yet built," and §8 is the inventory of that gap.

**VERTICAL — not moved by this document, and one addition to `capabilities.yaml`.** This document
adds no working code, so it cannot move an `enforcement_depth`. §11 adds new capability rows at
`status: undeclared` — the same posture `capabilities.yaml` already uses for a plan with no
enforcement yet (`presentation-is-resolved-not-chosen`'s own history before migration stage 1,
`a-human-authors-in-the-browser`, twelve others — verified below). A row entering at `undeclared`
is not a VERTICAL move; it is a target being named so a future VERTICAL move has somewhere to land.

**HORIZONTAL — not moved.** No module is reordered or newly homed by this document. §11 states
precisely what a future HORIZONTAL move against this target would need to route through
(`app/present/`, the four `scripts/generate-*.mjs` compilers, and a new engine-side scoped-node
endpoint that does not exist), and files that as backlog rows rather than pretending the routing
happened here.

---

## 2. Layer 1 — THE GRAPH, a store

**Verified directly this session**, in the monorepo, read-only:

* `core/graph/src/qntm_graph/_nx.py:16-26` — `GraphStore` is *"a thin facade over
  `networkx.MultiDiGraph`"*, one file, `__all__ = ["GraphStore"]`; the whole point of the file is
  that *"no other module in `qntm_graph` should import networkx directly."* **[OBS]** So the graph
  really is one thing, behind one door — traversal is sound because it is NetworkX's own
  traversal, not a hand-rolled one.
* Persistence is literally one row: `apps/qntm-md/src/qntm_md/coordination/orchestrator.py:679`,
  `INSERT OR REPLACE INTO graph_state (id, data, updated) VALUES (1, ?, ?)` — **[OBS]** confirmed
  by reading the statement directly. The whole graph is a JSON blob in one SQLite row, `id = 1`.
  Traversal is sound; there is no attribute index behind it.
* **Attribute query was never built, confirmed at the one function that would need it.**
  `core/graph/src/qntm_graph/core/queries.py:16-28`, `find_nodes`:
  ```python
  all_nodes = [_reconstruct_node(store, nid) for nid in store.all_node_ids()]
  return _filter_nodes(all_nodes, node_type, **field_predicates)
  ```
  **[OBS]** Every call reconstructs **every** node in the graph, unconditionally, before it filters
  anything — `node_type` and `field_predicates` narrow the *output*, never the *scan*. This is not
  a store with an index; it is a linear scan with a facade in front of it, and the facade is honest
  about that (no method promises otherwise).

**This is why the fix in `research-state-and-speed.md` mattered, and why it stayed a fix rather than
a redesign.** **[REPO]** that document's own §3.1: `find_nodes` id lookups went from **3,094 µs to
3.7 µs (~755×)**, flat at 5,000 nodes, via PR #69 in the monorepo — an *index*, not a rewrite of
`GraphStore`'s shape. §7 below returns to what that ratio changed and did not change.

**The graph's own size, measured directly, twice, on different dates, by different documents, in
agreement:** `research-state-and-speed.md`: *"805,155 bytes in SQLite, 741,245 bytes re-serialised,
**1,501 nodes**, 460 edges."* **[REPO]** `research-the-resolution-universe.md` §1, a different
snapshot: *"The graph is **1,501 nodes** and 460 edges."* **[REPO]** Two independent measurements,
same number. **This is the number this document uses when it needs the graph's own node count.**
§4.1 corrects a different, larger figure that is sometimes reached for instead.

---

## 3. Layer 2 — RESOLUTION, one meaning from one compiled declaration, run twice

**The cascade is one tuple, owned in one place, on each side of the wire.**

* Ingest (the engine): `apps/qntm-md/src/qntm_md/resolution/levels.py:86-92` **[OBS, verified this
  session]** —
  ```python
  SPECIFICITY: tuple[ResolutionLevel, ...] = (
      ResolutionLevel.LINE,
      ResolutionLevel.SUBTREE,
      ResolutionLevel.STRUCTURAL_NODE,
      ResolutionLevel.VIEW,
      ResolutionLevel.GLOBAL,
  )
  ```
  most-specific-first, with the comment above it naming exactly why one tuple exists: *"this order
  used to be re-expressed per key, per site, three times over, and the differ's hand-rolled copy of
  it was the one that was wrong."*
* Output (the surface): `app/present/levels.ts:41-49` **[OBS, verified this session]** — `FOCUS,
  MODE, LINE, STRUCTURAL_NODE, VIEW, USER, GLOBAL`, seven levels, most specific first. **The four
  shared levels appear in the same relative order on both sides.** One cascade seen from two ends,
  not two cascades — the finding `design-the-resolution-architecture.md` §2.1 already established
  and this document adopts without re-deriving.

**"From the same compiled declaration" is not a metaphor — it names four real files.**
`scripts/generate-qualification-declaration.mjs`, `generate-resolution-declaration.mjs`,
`generate-structural-declaration.mjs`, `generate-rules-declaration.mjs` **[OBS, present in this
worktree]** each read the operator's real `apps/qntm-md/config/` and write into one committed
artifact, `presentation.json` — **218,467 bytes, measured this session** **[OBS]** (grown from
138,878 B at `roadmap-the-road-ahead.md`'s base `2e9561a`, and from 138,806 B at
`design-config-is-content.md`'s base — three independent measurements on three dates, all
increasing, none contradicting the others). The surface reads that one artifact; the engine's own
`ResolutionCascade`/`resolve_registration_keys`/`resolve_base_node_type` read the config directly.
**Both readers are checked against each other, not just against their own tests** —
`scripts/resolution-agreement.py`, `scripts/qualification-agreement.py` and
`scripts/day-boundary-agreement.py` each call the engine's own Python resolver over the real config
bundle and assert the generated JS table agrees, cell by cell **[REPO]**
(`design-the-resolution-architecture.md` §"STEP 5", 49 of 49 `(view, section)` pairs, 0
disagreements; §"STEP 8", 14 of 14 instants, 0 disagreements). **That agreement test is what makes
"the same meaning in both places" a checked fact rather than a hope.**

**This is why resolution is not a layer that lives in one place.** It genuinely runs twice — once in
Python at cycle time, once in TypeScript at keystroke time — and the only thing that keeps the two
from drifting is that both are generated from, or checked against, one source: the operator's
config, read by one canonical resolver on the engine side and mirrored by one generated table on the
surface side.

---

## 4. Layer 3 — PRESENTATION, on the surface only

`app/present/paint.ts` is the one DOM toucher in the app — **[REPO]** `research-the-store.md`
invariant 1, confirmed there by enumerating every call site of `paint(` in `app/index.html`. It
consumes what RESOLUTION already decided (`PresentationCascade.resolve`, `cascade.ts`) and what
EVALUATION already decided (a placement/ordering/membership answer) and turns them into DOM. It
decides nothing about what a field means — `design-the-resolution-architecture.md` §3.2's table
already states the boundary precisely: PROJECTION *"may touch the DOM"* and *"may NOT decide
anything"* — *"no `if (focused) … else if (mode === …)` chain"* (`levels.ts:11-12`). Presentation
never runs on the engine; the engine never paints anything. This half of the split is already true
today, not only the target — it is the one of the three layers where the running code and the
architecture already agree.

---

## 5. The surface carries the whole resolver, not a subset

**Any rule the engine can resolve, the surface resolves too.** Not a fast path with a fallback —
that is two implementations, and they drift. **The limit is scope, not capability.**

**"This task has a child so it is an outcome" needs one hop — the surface has it.** *"Sum every
completed task in the vault"* needs everything — it never will. **Front-running stops where the
DATA stops, not where the capability stops.** "Too hard for the browser" is not a category — the
measurements below are the reason that sentence is not a hedge.

**The capability side of this claim is already independently measured, not asserted.**
`design-the-two-rules.md` §5.4 built a build-time harness (`scripts/measure-the-divergence.mjs`)
that replays real engine ground truth against the browser's own resolvers, over the full reachable
input space, not a sample: **2,941 membership cells, 8 ordering cells, 14 day-boundary cells — 2,963
total, 0 disagreements.** **[REPO]** That is a measured fact about *capability*: every axis this
repo can check agrees with the engine, always. What it is not yet a measurement of is *scope* — the
harness compares field-level predicates over nodes the fixtures already carry; it says nothing about
whether the *right set of nodes* is in the browser's hands at all, which is §6's question.

**The register-of-refusal pattern is already the shape a "whole resolver, honestly scoped" system
takes.** `app/present/resolvers/{membership,ordering,rules,promotion}.ts` each reach a complete
answer or **abstain with a named reason** — never silence with nothing behind it
(`design-the-two-rules.md` §3, items 16–19). A resolver that abstains by name when its scope runs
out is not a weaker resolver than one that guesses past its scope; it is the honest form of the same
capability, and §9 returns to why abstention itself must never be silent.

---

## 6. The working set is a declared bounded query, not a view

**If the surface held only the current view, opening another view would be a cold start and a rule
that just fired would be missing.** So the surface holds everything that could appear in any view
next.

### 6.1 The graph's real size — measured, and one number corrected

**The operator's whole graph is 1,501 nodes.** §2 above cites this directly, twice, from two
independent snapshots. **A second, larger figure exists in this repo's own evidence and needs to be
read carefully rather than repeated as the node count.** `research-state-and-speed.md`'s cProfile
table, over a partial cycle whose profiled wall was ~107 s:

| function | cumulative | calls |
|---|---|---|
| `qntm_graph.core.queries.find_nodes` | 93.7 s | **17,280** |
| `traversal._reconstruct_node` | 54.5 s | **28,730,523** |

**[OBS, this session]** `28,730,523 ÷ 17,280 = 1,663.11` — the average number of node
reconstructions per `find_nodes` call across that profiled run. **This is not a wrong number, and it
is not the same measurement as the graph's node count either.** Because `find_nodes` reconstructs
**every** node before filtering (§2), each call's reconstruction count genuinely equals the graph's
size *at the moment that call ran* — it is a real, mechanically-grounded proxy for graph size, not
an artefact of double-counting the way `_run_apply_phase`'s 94.4 s cumulative time is inflated by
being the outer frame of everything beneath it. **The 11% gap between 1,663 (averaged across many
calls through one cycle) and 1,501 (one snapshot) is most plausibly the graph growing across the
run being profiled**, or the profiled run touching a slightly different graph state than either of
§2's two snapshots — neither the original numbers nor this document's re-derivation settles which.
**Use 1,501 when the claim needs the graph's own size, as this document does throughout. Use ~1,663
only when citing what `find_nodes`'s own unindexed scan touched, on average, across one profiled
run** — the fact that explains why PR #69's index mattered, not a second census of the graph.

### 6.2 Payload

**The app already ships more than a bounded node set would cost, today, for markdown nobody reads.**
`research-the-resolution-universe.md` §6.3: the server's envelope is **805,155 bytes — 1,501 nodes
and 460 edges** — and `graphData` (the variable holding it) is read at exactly six sites in `app/`,
**every one reaching `?.snapshot?.views`; not one reaches `.graph`.** **[REPO]** Separately,
`research-state-and-speed.md` measured the *markdown* half of the same envelope at **1.02 MB, of
which 741 KB is never read** (the same order of unread bytes, one layer up). **[REPO]** A payload of
nodes with fields and edges, scoped to what a declared bounded query selects, is the same order of
bytes carrying strictly more information than the markdown blob it would sit beside — not a new
cost, a better use of a cost already paid.

### 6.3 Compute

**The engine's own full rules pass, over the whole graph, is sub-second in Python.**
`research-the-resolution-universe.md` §1: *"the engine's own rules pass at rest, over that graph:
273 firings across 28 distinct rules, 431 dispatched writes. One pass costs about 0.9 s."*
**[REPO]** **This document does not claim a directly-measured browser-side figure for a full rule
pass at the same scale — none exists in this repo's evidence, and inventing one would be exactly
the kind of unearned precision this house style refuses.** What is measured, directly, is that the
browser's own resolvers evaluate thousands of predicate cells with no perceptible cost inside a
build-time harness (§5's 2,963 cells) — evidence that JS predicate evaluation over already-resolved
fields is cheap, not evidence of a specific millisecond figure for 1,501–1,663 nodes. **Compute is
not the open question; scope is** — §6.4 is why.

### 6.4 The bound must be a declared query, and must not be `status = open`

**A rule like "completing the last child completes the parent" needs the completed siblings in
scope to know it was the last.** Selecting only open nodes silently breaks the most obvious rule
anyone would write. The bound must instead be a declared query — everything selected by any
registered view, plus one hop, plus anything touched recently — so a user with 50,000 nodes narrows
it and a user with 1,600 does not bother. **Default generous.**

**A view that selects the whole graph makes the working set the whole graph.** `everything-work`
(607 of the graph's 1,501 nodes, `research-the-resolution-universe.md` §2.3) already does this in
practice — the operator's own `everything.md`, retired by his own intent, was its sibling for the
combined domain. That is not a defect in the working-set model; it is the model doing exactly what
it is asked, honestly, for a view whose declared job is to select everything.

**Neither the query nor a scoped-node wire exists today.** §8.1 states this plainly rather than
implying it is close.

---

## 7. The engine's job is durability and multiple devices, not speed

**It is NOT true that "nothing waits on the engine."** The engine's output is user-facing — flip a
task to an outcome, open the outcomes view, it must be there. **The correct statement is "nothing
waits on the engine for anything the surface could have worked out itself."** This is the operator's
own correction, and it changes what the earlier framing (§5's build-time harness, `roadmap-the-
road-ahead.md`'s three bands) is allowed to claim: predicting correctly is not the same as never
needing the engine.

**What happens when a node changes:** the surface applies it, runs the resolver itself, works out
the consequences, updates its local graph, writes the change. You navigate; the surface resolves
that view from what it holds; it is there. The engine persists it, catches the global class, and is
the copy another device reads. **The engine is never the thing that tells you what just happened.**

**The engine's real job, restated from the ratio inversion that already happened once.**
`research-state-and-speed.md` measured a 10:1 ratio — lookup (86.3 s) ten times rendering (8.9 s) —
before PR #69's index; after, **rendering is the dominant remaining cost.** **[REPO]** That inversion
is evidence FOR this section's claim, not against it: once the graph answers fast, what is left for
the engine to spend its seconds on is exactly the two things speed does not fix — durability
(persisting the change so a second device and a crash both see it) and the genuinely global class
(an aggregate, an unbounded traversal) — never the operator's own perception of "did my edit land,"
which the surface already owns.

**The global class must be small, named and declared, never "whatever we did not build."** The most
precisely measured instance of it in this repo's evidence: `research-the-rule-closure.md` names
**six whole-graph aggregate rules** — `coverage-overall`, `coverage-personal`, `coverage-work`,
`age-of-intent-overall`, `age-of-intent-personal`, `age-of-intent-work` — as the reason a
browser-side rule evaluator stays refused: *"0 of the 21 reached rules do [read the whole graph
directly]... the blocker is the multi-bind whole-graph aggregate"* **[REPO]** (§7, §5.3 of that
document). **A separate figure — "4 of 297 patterns need unbounded traversal, and no finite depth
recovers any of them" — could not be located or reproduced anywhere in this repo's merged
documents, and this document does not repeat it as fact.** The closest verified figure, cited above,
is six rules of 94 that are whole-graph aggregates, plus **3 of 20 event-query patterns rooted on an
unbounded `find:{}`** (`research-the-rule-closure.md`'s own reproduction script comment,
`# 20 event-query, 3 with an unbounded find:{} root`). **Either of these is the honest number to
cite for "the global class, sized." "4 of 297" is not, until someone finds where it came from.**
This is stated as a correction, per instruction, not smoothed over.

---

## 8. Where the target and the running code disagree, stated plainly

**This is the gap, not a defect list to feel bad about — a target is only useful if the distance to
it is named.**

1. **There is no scoped-node wire.** The server's envelope carries markdown and the whole graph
   blob; nothing serves *a declared bounded query's worth of nodes* to the browser today.
   `research-the-resolution-universe.md` §6.3's own enumeration proves the negative positively: 13
   occurrences of `graphData` in `app/`, six reads, every one reaching `?.snapshot?.views`, **zero**
   reaching `.graph`. The graph is on the wire and nothing reads it. §11 backlog row 1.
2. **There is no declared working-set query.** §6.4's rule ("everything selected by any registered
   view, plus one hop, plus anything touched recently") is stated here for the first time as a
   target; no config key, generator or server route implements it. §11 backlog row 2.
3. **Per-section field admission is checked per field NAME, not per (pattern, section) — the
   `project` case, in flight, not yet merged.** PR #132 (`QNTM-Network/qntm-network`, open,
   read this session, not edited) widens resolvable fields from **3 to 18**
   (`node_type`, `domain`, `status` → those three plus `title`, `cadence`, `tier`, `cap_state`,
   `change_type`, `genre`, `god_box`, `class_state`, `package_state`, `principle_state`,
   `instantiate`, `priority`, `blocked_state`, `lead_state`, `asserted_state`), moving predicates
   published **88 → 112**, refused **104 → 80** (66 of those for `unresolvable field(s)`), sections
   dropped **107 → 82** — its own PR body's four numbers, confirmed against `main` this session:
   `app/present/membership.ts:86` on `origin/main` still reads
   `RESOLVABLE_FIELDS = ["node_type", "domain", "status"]` **[OBS]**, matching PR #132's stated
   "before." **`title` becomes resolvable under the new rule (intrinsic to the line); `project`
   stays refused, and the PR's own body states why in the operator's own words this document
   inherits rather than re-derives**: *"the compiler's admission check works at the global
   field-name level, not per-(pattern, referencing-section)... admitting it now would be sound
   today and unverifiable in general."* **A specific "60 refusals" figure for `project` alone,
   named in this document's own brief, could not be independently confirmed against the PR's diff
   this session — flagged, not repeated as fact.** §11 backlog row 3.
4. **Structure is still reverse-engineered from markdown, not read from the compiled declaration
   directly.** `design-the-resolution-architecture.md` §3.1 names the mechanism precisely:
   `SectionTree`/`SectionTreeNode`
   (`apps/qntm-md/src/qntm_md/render/section_builder.py:41-52`, **[OBS, verified this session]** —
   `is_qualifying: bool` and `children: tuple["SectionTreeNode", ...]` are real fields on a real
   dataclass) already carries **the exact two facts the surface re-derives from glyphs and
   indentation, and discards them at the renderer.** The engine computes the tree once and throws
   it away before the markdown ships; the surface then rebuilds an approximation of the same tree
   from the rendered text. §11 backlog row 4.
5. **The declaration is still a build-time bake, not a fetched resource — in flight, not landed.**
   `roadmap-the-road-ahead.md` step 1 names this as `IN FLIGHT` at its own base commit
   (`app/present/embedded-declaration.ts:45`, a static `import ... with { type: "json" }`). This
   document does not re-file it; it is already `docs/implementation-artifacts/backlog.yaml`'s
   `the-declaration-is-fetched-not-baked`, `state: diagnose-ready`.
6. **Presentation (§4) is the one layer already matching the target.** Named here so §8 is not read
   as "nothing works" — one of three layers is already built to the split this document pins.

---

## 9. Divergence, abstention, and the budgets — recorded, not re-derived

**Divergence is a defect, not a state.** "Does the surface agree with the engine" is a DEVELOPMENT
question; at runtime there is no *no*. **Abstention is also unfinished** — it is a chosen, declared,
moving limit, never a category of thing that is somebody else's job. `design-the-two-rules.md` §2.1
("THE CASCADE TERMINATES") and §2.2 ("AN OPERATION COMPLETES") are the two rules this document
inherits without amendment; §5's divergence measurement (0 mismatches over 2,963 cells) is the
evidence that the resolver layer is not where today's felt gap lives — §3's five real dead ends are,
per that document's own count, and this document does not re-litigate that count.

**The budgets follow from what each thing IS, and are stated here as the target, not measured
freshly by this document:**

* **The graph answers in milliseconds** — a lookup is a lookup. PR #69's **3,094 µs → 3.7 µs** id
  lookup (§2) is the one directly-measured instance of this budget being met. If it scans, it is
  not a store yet — and §2's `find_nodes` reading shows the general case (an attribute query, not
  an id lookup) still scans, unindexed, today.
* **The surface answers in one frame** — it holds what it needs. §5's 0-mismatch measurement is
  evidence the *capability* is there; §6.4/§8's gaps are why the *scope* is not yet.
* **The engine takes seconds and that is fine** — nothing on screen is blocked on it. §7 restates
  what "fine" means precisely: durability and the six named global-aggregate rules, never the
  operator's own perception of his edit landing.

**Markdown is the human edge, not the wire.** It is what the operator authors in and reads. Between
machines, nodes travel — §6.2's payload comparison is the concrete argument, not a slogan: the app
already ships 1.02 MB of markdown per keystroke with 741 KB never read; a scoped node payload of the
same order carries strictly more.

**Don't build limits below the human threshold.** The number of rule interactions a person can
intend, follow, or notice being wrong is small — smaller than a browser can evaluate. Artificial
caps cost capability and buy nothing anyone can perceive. §5's evidence (2,963 checked cells, 0
disagreements, all essentially free) is why this is not aspirational: the browser was never the
constraint the caps were guarding against.

---

## 10. Reconciling the documents this now supersedes

**Four documents get a dated pointer at their own top, not a rewrite.** Per the house rule
(`roadmap-the-road-ahead.md` §6.3, `pin-the-cube.md` §"claim H"): state the claim, state the fact,
name what changed it, leave the original visible.

1. **`design-the-two-rules.md`.** Its Perception Rule (§4) treats the visible SETTLE as a designed
   surface; this document's §7 correction ("nothing waits on the engine for anything the surface
   could have worked out itself") means the settle is currently standing in for a working set the
   surface does not yet hold — it is scaffolding for an unfinished surface, not a finished design.
   The two rules themselves (§2.1, §2.2) and the divergence measurement (§5) are **not** superseded
   — they are cited above without amendment.
2. **`research-the-store.md`.** Its eight invariants (§5) and its recommendation (§7.1, consolidate
   six `let`s into one `Declaration` value) are unaffected — they are about the browser's *own*
   internal state shape, orthogonal to the three-layer split. What is superseded is any reading of
   its scope as complete: it explicitly did not consider a scoped-node wire because none exists yet
   to hold state for (§8 row 1 of this document).
3. **`research-the-resolution-universe.md`.** Its taxonomy (§4, twelve kinds of resolution) and its
   config-only-table measurement (§6, 59.1 KB, 685 B median per view) are the evidence base §3 and
   §6 of this document draw on directly and do not contradict. What is superseded is its own ranked
   rung order (§7) as a *final* priority list — this document's §8/§11 reorder around the
   scoped-node wire and the declared working-set query, which that document's own rung list did not
   have as candidates because neither had been named as the target yet.
4. **`roadmap-the-road-ahead.md`.** Its five-step order and three-band decision rule (§4) are not
   contradicted — they remain the plan of record for the honesty half of the arc (un-bake the
   declaration, visible abstention, one settle language). What this document adds, which the roadmap
   predates, is the working-set/scoped-node target those steps will eventually need in order for
   step 3's "engine has ruled" motion to have a working set to correct *against* rather than a
   markdown re-render to correct *into*.

**Documents checked and found consistent, not superseded.** `design-the-resolution-architecture.md`
(the seven-layer L1–L7 model and the thirteen-step build order) is the most detailed prior account
of RESOLUTION and is cited throughout §3 without contradiction — its L4/L5 (RESOLUTION, EVALUATION)
map onto this document's Layer 2 directly. `pin-the-cube.md` and `design-config-is-content.md` are
cited (§3, §8) and not contradicted. `design-the-rule-mirror.md` and `research-the-rule-closure.md`
are the source of §7's global-class figures and are not contradicted.

---

## 11. Declaring it where it can be measured

**`docs/architecture/capabilities.yaml`: yes, at `status: undeclared` — the same posture already
used for a plan with no enforcement yet.** Verified this session: 13 existing rows in this repo's
own `capabilities.yaml` already carry `status: undeclared` (`a-human-authors-in-the-browser`,
`presentation-is-resolved-not-chosen` before migration stage 1, `the-edit-is-a-safe-haven`, ten
others) — the schema already has a place for "named, not yet enforced," and this document uses it
rather than inventing a new status value. **Four rows added**, each a single pinned claim from §0–§7
above, each `status: undeclared`, each naming precisely what would need to exist for it to earn
`enforcement_depth`:

* `resolution-runs-identically-in-engine-and-surface-from-one-compiled-declaration` — §3.
* `the-working-set-is-a-declared-bounded-query-not-a-view` — §6.4.
* `the-engine-owns-durability-and-the-named-global-class-only` — §7.
* `the-graph-is-an-indexed-store-not-a-linear-scan` — §2, the general case (attribute query) that
  PR #69 did not close — id lookup is now indexed; `find_nodes`'s field-predicate path still
  reconstructs every node.

**`docs/architecture/flows.yaml`: no, and precisely why.** flows.yaml declares call-flow SHAPE for
`flow-trace` to compare against **captured, running code** — every existing entry names a real
module and a real callee flow-trace's observer actually saw fire
(`app/present/paint.ts` → `app/present/cascade.ts`, `PresentationCascade.resolve`, observed count 8,
per this file's own header). **None of the four target capabilities above has a module to name a
flow from yet** — there is no scoped-node wire module, no declared-working-set-query module, and the
engine-side "durability and global class only" split is a statement about what the engine's
*existing* modules are for, not a new call edge. **Declaring a flow with no observer behind it would
manufacture permanent drift** — exactly the failure this file's own header names as the reason it
was emptied and re-populated once already (2026-07-23, when the Python render app retired and
flow-trace could not observe TypeScript yet). **What would be needed:** once backlog row 1 (§ below)
lands a real module serving a real scoped-node endpoint, and a `tests/flow_scenarios/*.ts` scenario
observes the browser calling it, a `flows.yaml` entry becomes possible in the same shape as
`paint-resolves-through-the-cascade`. Not before.

---

## 12. Backlog rows

Five rows, `docs/implementation-artifacts/backlog.yaml`, matching the existing schema (`id`, `title`,
optional `driving_capability`, `kind`, `state`), ordered by what unblocks what.

1. **`the-scoped-node-wire`** — `kind: capability`, `state: unscoped`. §8 row 1. The server serves a
   declared subset of the graph (nodes, fields, edges) to the browser, not only markdown and an
   unread whole-graph blob. **Everything else in this document needs this first** — the declared
   working-set query (row 2) has nothing to bound without a wire to bound, and per-section field
   admission (row 3) only matters once the browser is actually holding nodes to admit fields on.
2. **`the-declared-working-set-bound`** — `kind: capability`, `state: unscoped`. §6.4. The query
   shape itself: everything selected by any registered view, plus one hop, plus anything touched
   recently — explicitly not `status = open`. **Needs row 1** — a bound is meaningless without a
   wire to apply it to.
3. **`per-section-field-admission-not-per-field-name`** — `kind: capability`, `state: unscoped`.
   §8 row 3, the `project` case. Widen `deriveResolvableFields` (or its successor once PR #132
   lands) from a global field-name check to a per-(pattern, referencing-section) check, so `project`
   and future fields like it can be admitted where every referencing section's own `defaults:`
   covers them, without becoming unsound the day a new pattern references the field from a section
   that does not. **Needs PR #132 merged first** (out of this branch's control — filed as a
   dependency, not duplicated).
4. **`structure-is-read-not-reverse-engineered`** — `kind: capability`, `state: unscoped`. §8 row 4.
   Publish `SectionTree`/`SectionTreeNode`'s `is_qualifying`/`children` facts (already computed by
   the engine, already discarded at the renderer) through the same generated-declaration path the
   other config-only kinds already use, so the surface reads structure instead of re-deriving it
   from glyphs and indentation. **Needs row 1** for the node-level facts (`is_qualifying` is a
   per-node fact) and is independent of rows 2–3.
5. **`declare-the-scoped-node-wire-and-working-set-in-flows-yaml`** — `kind: null`,
   `state: unscoped`. §11's own "not yet, precisely why." Once row 1 ships a real module and a real
   observed call, add the corresponding `flows.yaml` entries — filed now so the gap has a queue
   address rather than being rediscovered later, the same posture `pin-the-cube.md` §5 takes for its
   own two monorepo-only gaps.

---

## 13. What I refuted

1. **"The operator's whole graph is ~1,663 nodes."** **Refuted as the graph's node count, kept as a
   real, differently-scoped number.** §6.1. `28,730,523 ÷ 17,280 ≈ 1,663` is a genuine measurement —
   the average size of the unindexed scan `find_nodes` performed across one profiled run — but it is
   not the same measurement as the graph's own size, which is directly stated at **1,501** in two
   independent snapshots. Using 1,663 as "the graph" would overstate it by 11% and, worse, would
   cite a profiling artefact as if it were a census.
2. **"A full rule pass over ~1,663 nodes is single-digit milliseconds."** **Not reproduced; not
   repeated as measured fact.** §6.3. No benchmark in this repo's evidence measures a browser-side
   full rule pass at any node count. The nearest real numbers are the engine's own 0.9 s Python pass
   over 1,501 nodes/94 rules, and the browser's demonstrated ability to check thousands of predicate
   cells with no perceptible cost inside a different, narrower harness. Neither is the claim as
   stated, and this document does not manufacture a number to fill the gap.
3. **"4 of 297 patterns need unbounded traversal, and no finite depth recovers any of them."**
   **Could not be located anywhere in this repo's merged documents; not repeated as fact.** §7.
   The closest, independently verified figures are **six** whole-graph aggregate rules (of 94) and
   **three** of twenty event-query patterns rooted on an unbounded `find:{}` — cited instead, with
   their own sources named.
4. **My own first assumption that "resolvable fields 3 → 18" belonged to an already-merged PR.**
   Refuted on checking — PR #132 is **open, not merged**, and `main`'s `RESOLVABLE_FIELDS` is still
   the frozen three (`node_type`, `domain`, `status`), verified directly against
   `app/present/membership.ts:86` this session. The four numbers in the PR body were independently
   readable and are cited as an in-flight change (§8 row 3), not a landed one — and the constraint
   that this branch may not touch PR #128–#132's files was respected: it was read via `gh pr view`
   and `gh pr diff`, never checked out, never edited.
5. **My own first attempt to confirm "`project` (60 refusals)" against PR #132's diff.** The diff is
   1,785 insertions / 474 deletions across a bundled sourcemap and could not be searched
   productively for this one figure in the time available. Rather than guess a plausible-looking
   number, §8 row 3 states plainly that this specific figure is unconfirmed, while the four
   headline numbers (3→18, 88→112, 104→80, 107→82) were confirmed directly from the PR's own body.

---

## 14. What is open, named rather than decided

Per instruction, these are left open because the operator's own model leaves them open — this
document does not invent an answer to make itself feel more finished.

* **How deltas keep the working set fresh.** §6.4 states the query shape; it does not say how the
  surface learns that a node outside its current working set just changed in a way that would pull
  it in (a new task gains a child, making its parent newly a completion candidate the surface was
  not holding). Named, not designed.
* **How the write path inverts.** §7 states that the surface applies a change and works out the
  consequences itself, then the engine persists it — the reverse of today's cycle-then-push
  direction. The mechanics of that inversion (what the surface writes, in what shape, and how a
  refusal from the engine is reconciled against a write the surface already showed as landed) are
  not designed here. `design-the-two-rules.md` §2.2's `WriteRegister` extension is the nearest
  existing mechanism and is neither confirmed nor ruled out as the vehicle.
* **Whether the scoped-node wire is a new HTTP route, a widened existing envelope field, or a
  different transport entirely.** §11/§12 row 1 names the capability, not the mechanism.

---

## 15. Reproduction

```
# worktree state this document was written against:
git rev-parse HEAD                      # design/the-three-layers, based on origin/main @ 4ce2c4f

# §2 — the graph as a store
sed -n '16,26p' core/graph/src/qntm_graph/_nx.py                 # MultiDiGraph facade, one file
grep -n "graph_state" apps/qntm-md/src/qntm_md/coordination/orchestrator.py | head
sed -n '16,28p' core/graph/src/qntm_graph/core/queries.py         # find_nodes reconstructs all, then filters

# §3 — resolution, one cascade, run twice
sed -n '75,92p' apps/qntm-md/src/qntm_md/resolution/levels.py     # SPECIFICITY, engine side
sed -n '35,49p' app/present/levels.ts                             # SPECIFICITY, surface side
wc -c presentation.json                                            # 218,467 B this session
ls scripts/generate-*.mjs                                          # the four compilers

# §6.1 — the node-count correction
python3 -c "print(28730523/17280)"                                 # 1663.11

# §8 row 3 — PR #132, read only, never checked out or edited
gh pr view 132 --repo QNTM-Network/qntm-network
grep -n "RESOLVABLE_FIELDS" app/present/membership.ts               # still the frozen three on main

# §8 row 4 — structure already computed and discarded
sed -n '41,52p' apps/qntm-md/src/qntm_md/render/section_builder.py  # SectionTreeNode.is_qualifying/.children

# NOT RUN: no cycle, no graph-sync, no wrangler --remote, no POST to
# https://qntm-graph.fly.dev, no git stash, no merge. ~/qntm, ~/.qntm/graph.db and
# ~/.qntm-md/state.db were never opened. The monorepo was read only, via absolute paths, never
# `cd`-ed into. PRs #128-#132 and their files were read only, via `gh`, never checked out.
```

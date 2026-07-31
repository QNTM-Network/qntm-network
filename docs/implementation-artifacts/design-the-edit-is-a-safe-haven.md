# Target architecture: the edit is a safe haven, and the world moves around it

**Status: declaration and documentation only. No application source is modified on this branch.**

Two capabilities the operator named on 2026-07-31, pinned as top-level, plus the one live defect
that stands in the way of both. They are in tension — one says *hold still*, the other says *keep
moving* — and resolving that tension is the whole content of this document.

Evidence labels follow the house convention used by `design-presentation-cascade.md` and
`research-state-and-speed.md`:

* **[OBS]** — I ran it or read it in this worktree and am reporting the output.
* **[REA]** — I reasoned it from something labelled [OBS]. Stated as reasoning, not as measurement.
* **[REPO]** — quoted from a record in this repo that I did not independently reproduce.

---

## 0. Lead — what I established before designing anything

**0.1 The whole-file clobber is real, and I reproduced it five ways.** **[OBS]** Section 3 has the
run. The short version: every save posts the entire view, computed against the projection the
painter was handed, with no version and no precondition anywhere in the path. What the save
overwrites is whatever changed in between — and the commonest author of "whatever changed in
between" is the cycle, i.e. the system's own computed behaviour.

**0.2 It does not need concurrency, async, or a second device to happen.** **[OBS]** ARM 2 of the
reproduction is a single operator, a single tab, two edits in a row. The first commit starts a
cycle the repo's own measurements put at **~10 s healthy, 14–69 s observed on the old machine**
**[REPO]** (`research-state-and-speed.md:295-297`), and nothing in the reading column is disabled
for its duration. Any edit made inside that window computes against the pre-cycle source. **The
window where this bites is not milliseconds. It is ten seconds wide, today, on the shipped app.**

**0.3 On the path the operator actually uses, there is no version to send.** **[OBS]**
`worker/src/app.js:141` hardcodes `version: null` on the hosted-model read, and `:271` hardcodes it
again on the write response. The real, monotonic `snapshot.version` exists only on the **D1
fallback** (`:159-176`), which is the path taken when the Fly server is *unreachable* or the
session is *not the operator's*. So the browser is not ignoring a version it was given — **it was
never given one.**

**0.4 Most of the safe haven already exists, and it was built for a different reason.** **[OBS]**
`FocusSurface` holds the cursor as one number *outside the source string* (`app/present/focus.ts:50`)
and `DraftSurface` holds an uncommitted new line *out of the file entirely*
(`app/present/draft.ts:55-83`). Neither was built for concurrency; both were built so the cascade
would stay the only decider and so an abandoned line would need no DELETE edit to undo it. They are
nevertheless exactly the right shape, and section 4 says why.

**0.5 What exists does not survive a *foreign* repaint, and I measured what it does instead.**
**[OBS]** ARMs 4 and 5. The cursor is restored by **positional index** against whatever source the
painter is currently walking (`app/present/paint.ts:532-533`), and the input's characters are taken
from that source (`:214`). Repaint the same body from a *different* projection and the cursor lands
on a different line and the typing is gone; if the index is past the end of the new source, the
cursor vanishes with no refusal reported anywhere.

**0.6 The write is not safe-able by this app alone, and section 8 names precisely what is missing.**
The browser can compute its own base token from the markdown it was handed, with no server change.
What does not exist anywhere is something that will **compare** one. **[OBS]** `grep` for
`If-Match`, `ETag` and `409` across `worker/src/`, `app/` and `scripts/` returns one hit, and it is
a handle collision in `auth.js:57`.

**0.7 Baseline, measured on this worktree.** **[OBS]** `npm ci && npm test` → **348 tests, 0 fail**,
before the edits and after them (no application source is touched, so this is a control, not a
result). `flow-trace verify .` → **exit 0 and `fail_count: 0` on every one of four runs**, with
`pass_count` reading **40, 29, 32, 29**. That spread is not a regression and is not mine: it is the
capture truncation `.flow-trace.yaml` documents at length in its own header, whose signature is
exactly this — a low `pass_count` with `fail_count: 0` and a matching number of "declared but not
observed" INFOs (I counted 0, 11, 8, 11). **The briefing's stated baseline of 32 is one sample
inside that spread**, and 40 is the un-truncated reading. **Nothing on this branch can change any
of these numbers**, which is the only claim they are here to support.

---

## 1. The two capabilities

### 1.1 The edit is a safe haven

> *"I love the concept of, like, delta focus — like a safe haven."*

**The line under the cursor is his. The world may move around it — but not under it.** What he is
typing is never overwritten, reordered or reflowed by something arriving from elsewhere, and it is
never silently discarded.

The precise subject matters, because "safe haven" could mean the file, the view or the line, and
only one of those is defensible:

* **Not the file.** The file is a projection; it is *supposed* to be rewritten by the cycle. A file
  nothing may rewrite is a file the engine cannot serve.
* **Not the view.** Same argument one level up, and it is the argument the second capability makes.
* **The open edit.** The characters between the cursor's arrival on a line and its departure from
  it. That is a bounded, short-lived, *single-line* region, and it is the only region in this app
  whose content is authored rather than derived.

**So the haven is the DELTA, not the state** — which is the operator's own correction (section 2)
arriving as a design constraint rather than as a slogan.

### 1.2 The world moves around you

> *"The rest of it conceptually I like the idea of the world moving around you, like real life."*

**The system computes behaviour.** A cycle fires rules, so an edit can unlock a task, change a node
three views away, make something appear that nobody typed. **Those changes should arrive** — the
projection should live, not wait to be fetched.

This is not "auto-refresh". Auto-refresh is a client asking again. What this capability commits to
is that **a change the operator did not type reaches his screen without him asking for it**, which
is the ONLY way a computed consequence is distinguishable from a coincidence. If he has to press
refresh to see the rule fire, the rule did not fire *for him*; it fired for the database.

**Today neither half is true.** **[OBS]** The only paths that install a new projection are
`loadGraph` (boot / sign-in / the refresh button) and the return of a write, all in
`app/index.html:1284-1335` and `:1156-1202`. Every one of them is the client asking.

---

## 2. The principle underneath, corrected

I wrote *"the markdown file is the truth."* The operator's answer:

> **THAT'S A DANGEROUS SENTENCE.**

He is right, and the correction is load-bearing rather than pedantic:

* **The graph is the truth. The markdown is a VIEW of it.**
* The markdown is authoritative for the **DELTA** — the change — because **a file carries no
  events**. A file can tell you what it says; it cannot tell you what happened to it. So the only
  thing a file can honestly assert is the difference between what it said and what it now says.
* **Authoritative for the change, derived for the state.**
* **The cycle computes behaviour**, so a projection is a *consequence*, not a copy. You do not
  "sync" a consequence. You recompute it.

**Why the dangerous sentence is dangerous, concretely.** If the markdown is the truth, then posting
the whole file is a *complete and correct* statement of truth, and the current write path is right.
If the markdown is a *view*, then posting the whole file is a statement about **every line in the
view**, including hundreds the operator did not touch and did not intend to assert anything about
— and last-write-wins is the inevitable consequence. **The sentence and the defect are the same
mistake, one in prose and one in a POST body.**

### 2.1 Where the dangerous sentence is written down in this repo

**[OBS]**, `grep -rn "is the truth"`:

| file:line | what it says | disposition |
|---|---|---|
| `docs/architecture/capabilities.yaml:410` | "The markdown is the truth, the DOM is a projection" | **corrected on this branch** — an `── UPDATE 2026-07-31` note on that capability's intent |
| `docs/implementation-artifacts/design-presentation-cascade.md:369` | same | left in place; superseded by this document, which cites it |
| `docs/architecture/architecture.yaml:199` | same | left in place; it is the app-vs-DOM statement and is true *in that direction* |
| `docs/architecture/flows.yaml:429` | same | as above |
| `app/present/source.ts:11` | same | **application source — not touched.** Filed as a row (section 10) |

**All five are true in the direction they were written for and dangerous read as a general claim.**
Their subject is the *DOM*: the app must never rebuild markdown from rendered elements, and against
the DOM the markdown really is authoritative. Their failure is that they say "the truth" full stop,
and the reader who comes next — a reader deciding what a write should contain — takes them at their
word. **The distinction that fixes all five in one sentence: the markdown is authoritative against
the DOM, and derived from the graph.**

---

## 3. The live defect — the whole-file clobber

### 3.1 The claim, and what is actually in the path

**Every save posts the WHOLE FILE.** **[OBS]**

| step | file:line | what it carries |
|---|---|---|
| the painter computes the edit | `app/present/paint.ts:242` | `applyEdit(fileSource, {kind: "set-line", …})` — **`fileSource` is the whole view as it was painted** (`:528` passes `source`, the painter's own argument) |
| the page posts it | `app/index.html:1190` | `body: { path: view.path, markdown: commit.markdown }` |
| the checkbox posts it | `app/index.html:1164` | `body: { path: view.path, markdown: next }` — the same shape, deliberately |
| the Worker forwards it | `worker/src/app.js:254-259` | `POST {GRAPH_SERVER_URL}/vault/file` with `{path, markdown}` — **no precondition of any kind** |
| the Worker cycles | `worker/src/app.js:260-261` | `POST /cycle` — the comment on that line calls it **"the ~14s step"** |
| the Worker answers | `worker/src/app.js:265-281` | the fresh projection, with `version: null` |

**Nothing in that path compares anything.** The graph server's declared surface is `GET /health`,
`GET /graph`, `POST /cycle` **[REPO]** (`docs/architecture/graph-server-plan.md:46-47`) plus the
`POST /vault/file` the Worker calls. There is no per-file read, no version, no conditional write.

### 3.2 The reproduction

A hermetic script, run from the worktree against **`dist/present.js` — the artifact the browser
loads** — through `tests/fixtures/dom-stub.mjs`, the repo's own stub. `applyEdit` is the shipped
function; the strings asserted on are byte-for-byte what `app/index.html:1190` would put on the
wire. Nothing about the write path is mocked. **[OBS]**

Fixture. `V1` is the projection the browser holds. `V2` is what the cycle computed: line 3 gained
`#blocked` because a rule fired, and line 8 is a task **the cycle created** — `qntm:124`, which
nobody typed.

```
── ARM 1: the cursor was in line 7 while the cycle changed line 3 ──
posted line 3 : "- [ ] Ship the thing [[qntm:121]] #task"
V2's   line 3 : "- [ ] Ship the thing [[qntm:121]] #task #blocked"
posted lines  : 8  V2 lines: 9
CLOBBERED: #blocked (a rule's output) and qntm:124 (a task the cycle created).

── ARM 2: a second edit made during the ~14s cycle of the first ──
POST #1 line 7: "- [ ] Draft the note today [[qntm:123]] #task"
POST #2 line 3: "- [ ] Ship the thing [[qntm:121]] #task"
POST #2 line 4: "- [ ] Water the plants twice [[qntm:122]] #task"
POST #2 lines : 8
CLOBBERED AGAIN, with no concurrency and no async: POST #2 is a whole file
computed from a projection that predates the cycle POST #1 triggered.

── ARM 3 (control): the same edit computed against V2 ──
Everything survives. applyEdit is CORRECT; the defect is the STALE BASE it is
handed plus the whole file being the write unit.
```

**ARM 3 is the arm that makes this a diagnosis rather than an accusation.** Recompute the identical
edit against the fresh projection and the cycle's output survives intact alongside the operator's
typing. **`applyEdit` is not the defect.** The defect is the base it is handed and the fact that
the whole of that base goes on the wire.

**ARM 2 is the arm that makes it live.** It uses no concurrency, no second tab, no async change and
no push. It is one person making two edits about ten seconds apart, which is a slow typist. The
mechanism is `commitLine`'s **optimistic repaint**: `settle` calls `repaint(next)` synchronously
with the *client-computed* string (`app/present/paint.ts:258`) and only `paintView` replaces it with
the server's copy when the cycle returns (`app/index.html:1192`). Between those two moments the
painter's `source` closure is a pre-cycle string, every row on screen is live, and nothing is
disabled. **[OBS]** `toggleTask` disables exactly one element and it is the box that was clicked
(`app/index.html:1161`).

### 3.3 What loses

**Last write wins, and the loser is the system's own computed behaviour.** That asymmetry is the
reason this is a capability-level defect and not a bug:

* The operator's own typing is **never** lost by this mechanism — his characters are the last thing
  applied to the string he posts.
* The **cycle's** output is lost every time, because it was computed against a file the browser had
  already moved past.

So the failure mode is not "I lost my work". It is **"the rule did not fire"** — silently, with no
error, exit 0 all the way down. That is the worst diagnostic shape this project has a name for, and
it is the same shape the engine's own accept/emit failure has **[REPO]**
(`design-presentation-cascade.md:406-411`: the unmatched glyph absorbed into a title, exit 0, no
diagnostic).

### 3.4 Async does not cause it, and that is exactly why the order of the backlog matters

**[OBS]** `research-state-and-speed.md:629` ranks **"stop awaiting the engine cycle in `POST
/app/edit-file` — ack on the vault write, cycle behind it"** as item **#1**, sized **half a day**,
worth **~10 s → ~250 ms** on every gesture. It is the right change and it should be made.

**It will make this defect worse in three specific ways**, and none of them is a reason not to do
it — they are reasons to do the write-safety row first:

1. **The window stops being bounded by a wait.** Today the operator at least *sees* `syncing…` and
   often waits. Acked-early, he does not wait, so the number of edits landing inside a live cycle
   goes up rather than down.
2. **The window stops being observable.** Today "the cycle is running" is legible as a stalled UI.
   Acked-early it is legible as nothing at all.
3. **The projection's arrival stops being tied to the gesture that caused it.** That is the whole
   point of the change and it is also the point at which a fresh projection genuinely arrives
   *while a line is open* — which is capability 2 arriving, and capability 1 not yet being true.

**The write-safety row therefore comes first.** Not because async is dangerous, but because
async removes the accident that currently limits the blast radius.

---

## 4. What already exists — the haven that was built for another reason

**Three properties of the shipped app are most of capability 1, and every one of them was built for
a purpose that had nothing to do with concurrency.** Saying so is not a compliment to the previous
agents; it is the reason the remaining work is small, and it is evidence that the architecture is
holding.

**4.1 The painter repaints the whole view from a source string.** `paint(body, source, context,
deps)` (`app/present/paint.ts:452`) begins with `body.innerHTML = ""` (`:537`) and rebuilds. It was
written that way so the cascade would stay the only decider — a patch-one-element painter "would
have to know which lines a focus change could possibly affect, which is a second copy of the
precedence order" (`:466-468`). **The consequence nobody was aiming for: installing a new projection
is already a one-argument operation.** There is no diff to compute, no reconciler to write against
the DOM, no partial-update path that could be wrong. The world moving is `repaint(newSource)`.

**4.2 The cursor's position is held separately, outside the file.** `FocusSurface` is one
`number | null` (`app/present/focus.ts:50`) and the painter asks it per line (`:532-533`). It was
written that way because "a fact about the moment written into a file is a fact that outlives the
moment" (`focus.ts:26-29`). **The consequence nobody was aiming for: the cursor is not IN the
document, so replacing the document does not, in principle, destroy it.** Section 5 is about the
gap between "in principle" and what actually happens.

**4.3 A line being drafted lives out of the file entirely.** `DraftSurface` holds an uncommitted new
line (`app/present/draft.ts:55-83`) and it reaches the write path **once**, at settlement
(`paint.ts:342`). "The source string is never speculatively mutated" (`paint.ts:296-302`). It was
written that way because an empty inserted line **mints a real node** in the engine — measured
against a hermetic copy of the starter bundle **[REPO]** (`source.ts:84-100`) — and because
abandoning a speculatively-written line would have needed a DELETE edit to undo it.

**The consequence nobody was aiming for, and it is the largest one: `DraftSurface` is already a
working implementation of a region of the screen that the source string does not own.** Capability
1 asks for exactly one more such region — the line being *edited* rather than the line being
*made* — with the same lifecycle, the same settlement, and the same "held across repaints, thrown
away at the end" discipline. **That is not a new idea in this codebase. It is a second instance of
one that shipped on 2026-07-31.**

**4.4 `applyEdit` has a CLOSED union of edit kinds, and keeping it closed is load-bearing.**
`SourceEdit = SetCheckbox | SetLine | InsertLine` (`app/present/source.ts:114`), with an explicit
refusal for anything else (`:193-195`) that was earned by a real defect
(`capabilities.yaml:450-455`). **Nothing in this design adds a kind.** Everything section 6
specifies is expressible as `set-line` or `insert-line` against a *correctly chosen base*, and the
one case that would need a new kind is the one I am refusing to specify (section 6.4). **If a
future version of this design needs a fourth kind, that is the signal to re-argue it, not to add
it.**

**4.5 `accept ⊇ emit` — a level may accept more than it prints, never the reverse.** The client
form of this is the governing constraint: *a resolution is admissible only when every affordance it
offers can be expressed as an edit to the source string.* It sequences this design the same way it
sequences the cascade: **the haven advances exactly as fast as the write-safety does.** A reconciler
that keeps a draft alive across a projection it cannot then safely commit is worse than no
reconciler, because it holds characters hostage.

---

## 5. The tension, and how it resolves

> One says *hold still*. The other says *keep moving*. **The tension is the design.**

### 5.1 The resolution in one sentence

**The haven is not a region of the file — it is a region of the SCREEN that the file does not own,
and it is one line wide.** The world may replace the source string underneath it as often as it
likes, because the haven's content never came from the source string in the first place.

That sentence is already true of `DraftSurface` and it is already false of `rawInput`, and the whole
of the gap is that one asymmetry. **[OBS]**

| | where its characters come from | survives a foreign repaint? |
|---|---|---|
| a line being **made** (`draftInput`) | `draft.seed` + what was typed, held in `DraftSurface` | the *row* does — but `app/index.html:1121` drops it on any `paintView`, deliberately (see 6.5) |
| a line being **edited** (`rawInput`) | **`input.value = lineSource`**, `paint.ts:214`, straight out of the new source | **no** — ARM 4 |

### 5.2 The haven has three levels, and only one of them is missing entirely

Naming them separately matters because they fail differently and they ship separately.

| level | what it protects | held where today | status |
|---|---|---|---|
| **FOCUS** | *that* a line is open | `FocusSurface#lineIndex` — outside the file | **exists.** Built 2026-07-30 for the cascade |
| **ANCHOR** | *which* line is open | the same number — **and a number is a position in a string** | **exists but is the wrong type.** It is an index; the world moving changes indices |
| **DELTA** | *what has been typed into it* | `input.value` — inside a DOM element the repaint destroys | **absent.** Nothing holds it |
| **BASE** | *what the edit is computed against* | `fileSource`, a closure captured at paint time | **absent, and unguarded.** Section 3 |

**FOCUS is the one that was already right, and it is why this is half a day and not an arc.** The
hard architectural question — *may a fact about the cursor live in the document?* — was asked and
answered in the negative on 2026-07-30, for a completely different reason, and the answer is the one
this design needs.

### 5.3 Why the anchor cannot stay an index, and what it becomes

An index into a string is meaningful only against that string. **[OBS]** ARM 4: the cycle inserts
one line above the cursor, the projection lands, `focus.lineIndex` is still `7`, and the cursor is
now sitting in `## Today`.

Two ways to fix it, and the cheaper one is also the more correct one:

* **Rebase the index** — diff the old and new source, map index 7 forward. This is the operational-
  transformation shape. It needs a diff, it needs a tie-break policy for insertions at the anchor,
  and it is wrong whenever the line moved *between sections* rather than being pushed down.
* **Anchor on identity** — the engine already stamps identity into the printed line. `[[qntm:121]]`
  is in the source the browser was handed; `app/present/paint.ts:273` already reasons about it as
  "a rendered qntm line carries its node's identity stamp". **The anchor is free, it is already on
  the wire, and it survives reorder, reindent, reflow and a move between sections.**

**Identity wins.** But it must degrade honestly, because not every line has a stamp:

| tier | anchor | survives | when it applies |
|---|---|---|---|
| 1 | the `[[qntm:N]]` in the line | reorder, reindent, retitle-by-the-engine, moving section | any line the engine printed as a node |
| 2 | the exact source text of the line as painted | reorder | headings, prose, a line the cycle has not stamped yet |
| 3 | — | nothing | **the line is not in the new projection.** Section 6.4 |

**Tier 2 is not a fallback bolted on; it is what the app already does for a different question.**
`app/present/newline.ts` "walks four rungs and reports which one answered"
(`capabilities.yaml:490-491`) rather than guessing, which is the same shape: try the specific
answer, fall back to the general one, **and refuse rather than invent when neither answers.**

### 5.4 The tension is not resolved by a compromise, and this is the important part

The instinct is to trade: hold the world still *a bit*, move the cursor *a bit*. That produces a
system where both properties are approximately true and neither is checkable.

**They resolve completely because they have disjoint subjects.**

* Capability 2 owns **the state** — every line of the view, derived, replaceable at any moment,
  never authoritative in the browser.
* Capability 1 owns **the delta** — the characters between the cursor arriving and leaving, one
  line, authored, authoritative, never derived.

**That is the operator's correction from section 2, applied.** *Authoritative for the change,
derived for the state.* The two capabilities are not a trade-off; they are the two halves of one
sentence, and the reason they looked like a trade-off is that today the app conflates them by
posting the state in order to express the change.

---

## 6. How the world arrives without disturbing the cursor

The specification. Everything here is expressible with the closed union as it stands (4.4).

### 6.1 The line being edited

**Nothing happens to it. It is not repainted.**

The painter is given a **held line** the same way it is already given a draft line: an index (via
the anchor), and content that does **not** come from the source. `paint` skips repainting that row
and reuses the element already in the body. The characters in it are never sourced from the new
projection, because they were never sourced from the old one either — they came from the operator.

**What DOES change under it, invisibly: the base.** The painter's `source` becomes the new
projection, so when the line settles, `applyEdit` computes `set-line` **against the projection that
is current at settlement time**, not against the one that was current when the cursor landed. The
POST therefore carries the cycle's output *and* the operator's line. **That is ARM 3, which I ran,
and it is the whole fix.**

**The one thing the operator must be told, and the one thing he must not be.** If the new projection
changed *that very line* — the cycle stamped it, or a rule rewrote its tail — his characters will
win for that line when he settles. That is correct: he is authoritative for the delta. **It must be
visible** (the row marks itself), and **it must not be a prompt**, because a modal in the middle of
a sentence is a worse violation of "safe haven" than the thing it is protecting against.

### 6.2 The lines above it

**Repainted from the new projection. They are the world moving.**

The only thing that makes "above" special is that changes above **shift the index of everything
below**, which is precisely why 5.3 replaces the index with an identity anchor. With an identity
anchor, above and below are the same case and no arithmetic is required anywhere.

**One real cost, measured, and it is why a row exists for it.** **[OBS]**
`research-state-and-speed.md:312-320` — a full repaint of `work/everything.md` (670 lines) is
**49 ms p50** on a desktop, and roughly `0.073 ms per line`. A projection arriving unbidden means
that cost lands **while the operator is typing**, not on a click he made. On a phone the same
document is a reasoned 4–6× worse **[REA]**. That is what `research-state-and-speed.md:635` already
ranks at #7 — *memoise the embodiment, keep the cascade deciding every line*, 49 ms → ~6 ms, half a
day. **It is a precondition of the world arriving on a large view, and it is already written down;
this design adds no new scope for it.**

### 6.3 The lines below it

**Repainted from the new projection.** No special case. This is where a task the cycle *created*
appears — `qntm:124` in the reproduction's fixture — which is the visible payoff of capability 2 and
the thing that makes it feel like real life rather than like a page.

### 6.4 The hard case — the line being edited no longer exists in the new projection

**This is what actually ships today, and it is the worst of the available behaviours.** **[OBS]**
ARM 5: the cursor index is 7, the new projection has 5 lines, **zero** editable rows are painted.
`FocusSurface` still says `7`. The characters are gone. Nothing is written to `#freshness`; nothing
throws; nothing is refused. **A person mid-sentence loses the sentence and is told nothing.**

**First: what "vanished" can mean.** Two very different situations wear the same appearance, and
the app can already tell them apart:

* **The node left the VIEW.** A rule moved a completed task to `done.md`, or the view's filter
  stopped selecting it. The node is alive.
* **The node left the GRAPH.** It was deleted.

**[OBS]** `snapshot.graph` carries `{version, nodes, edges}` — read from `state.db` at
`scripts/graph-sync.mjs:464` and put on the wire at `worker/src/app.js:144` — and it reaches the
browser today. So the app **can** ask "is `qntm:123` still a node?" without a single schema change.
It does not, because **nothing in the browser reads `snapshot.graph` at all**, which is the finding
`design-presentation-cascade.md` already recorded and which the backlog already carries as
`resolve-from-the-model-not-the-text`. **The hard case is the first thing that makes that existing
row load-bearing rather than merely forward-looking.**

**Second: the three candidate behaviours, with the cost of each.** I am specifying one and refusing
one, and the refusal is the point.

**(a) Refuse the arrival while a line is open.** Hold the incoming projection; apply it when the
cursor leaves. Costs nothing, decides nothing, expressible in an hour, and **strictly better than
what ships**. Its flaw is that it makes capability 2 conditional on capability 1 being idle — the
world stops moving for as long as somebody is typing. **Correct as the first increment and wrong as
the destination**, which is exactly what makes it a good first row.

**(b) Park the draft and say so.** Land the projection. Take the orphaned row out of the reading
column. Put its characters somewhere the operator can see and recover them, and say what happened
in `#freshness` — the line this page already uses to report what just happened
(`app/index.html:1143`). **Loses nothing, decides nothing, and refuses to invent.** *This is what I
specify for the general case.*

**(c) Keep the orphan row in place and let it commit as an `insert-line`.** Tempting, because the
closed union already has exactly the operation required (4.4) — so it passes the admissibility
test. **I am refusing to specify it, and the reason is not effort.** Committing it means re-inserting
into a view a line the cycle deliberately removed from that view. If the node moved to `done.md`
because it is done, re-inserting it into `this_week.md` **fights the engine**, and the app loses:
the next cycle removes it again, and the operator has typed into a file twice for nothing. Worse,
if the *node* is gone, the insert **mints a new one** — the exact failure `source.ts:84-100` already
measured for an empty insert, one degree less obvious.

**Which of (b) and (c) is right is a question about the ENGINE, not about the browser**, and it is
stated as open decision 1 in section 11. **(b) is the honest behaviour until it is answered.**

**Third: what the operator sees.** One sentence in the freshness line, in the register that line
already uses: *"the line you were editing is no longer in this view — your text is kept below"*.
Not a dialog. Not a block.

### 6.5 What happens to a line being MADE when a projection lands

`app/index.html:1121` already drops the draft on **every** `paintView`, with an argued reason: "an
index that meant *under the third task* in one view means something else in the next, and a fresh
snapshot has already been through the cycle without it."

**That reasoning is right for a VIEW CHANGE and wrong for a PROJECTION ARRIVAL**, and the difference
is exactly the one this design turns on. A view change means the operator chose to be somewhere
else. A projection arrival means the world moved while he stayed put — and dropping his half-typed
line for that is capability 1 being violated by the very mechanism capability 2 needs.

**A new line has no identity stamp**, so it can only ever reach tier 2 of the anchor (5.3) — and its
text is not in the source at all, so even tier 2 does not apply. Its anchor is **relative**: "after
the node `qntm:122`", read off the line above it at the moment it was opened. That is expressible,
it is one field on `Draft`, and it is why this is a separate, later row rather than part of the
first one.

---

## 7. The names — he asked what these are called

Real terms, one sentence each, plus what each one is in this app specifically.

**Optimistic concurrency control (OCC).** *A write that carries the version it was based on, which
the server refuses if the current version has moved.* No locks and no coordination — you assume the
conflict is rare, detect it at write time, and pay only when it happens. **Here:** the browser sends
the base it computed the edit against; a stale base is a **409 Conflict**, not a write. The opposite
of what ships, which is **last-write-wins (LWW)** — the write with the latest arrival time silently
overwrites, and nobody is told.

**Reconciliation.** *Merging a newly arrived projection against an open draft, deciding per region
which side wins.* **Here** the decision is fixed rather than negotiated: **the projection wins every
line except the one under the cursor, and the operator wins that one.** That is section 5.4 as an
algorithm, and it is short precisely because the subjects are disjoint.

**Eventual consistency.** *The client and the server are allowed to disagree for a bounded time, and
converge when the edits stop.* It is a promise about the *end state*, not about any moment in
between — and it is the honest description of anything with a ~10 s cycle behind it. **Here** it
sets the acceptance bar: the operator stops typing, and within one cycle his screen shows what the
engine computed, with nothing of his lost and nothing of the engine's lost.

**Push (as opposed to poll or fetch).** *The server tells the client the projection changed, rather
than the client asking.* Server-Sent Events is the usual minimum shape; a WebSocket if the traffic
ever becomes two-way. **Here** it is what makes capability 2 *a capability* rather than a refresh
button: a computed consequence that arrives only when asked for is indistinguishable from a
coincidence. **It is deliberately last in the sequence** (section 10), because push into an unsafe
write is a machine for losing work faster.

**Anchoring / rebasing.** *Re-attaching a position to content after the content around it has
moved.* An anchor is the durable name of the position; rebasing is recomputing an edit against a
base that has changed. **Here** the anchor is `[[qntm:N]]` and the rebase is free — `applyEdit`
already takes the base as an argument (`paint.ts:242`), so "rebase" means "call it with the new
source", which is ARM 3.

**Operational transformation / CRDTs.** *The two industrial answers to concurrent editing of the
same text.* **Named to rule out.** Both solve *many writers, one character-level document, no
authority*. This app has **one writer, a line-level write unit, and an authoritative engine** —
adopting either would mean the browser holding a mergeable model of the text, which is the component-
tree-becomes-the-model failure `research-state-and-speed.md:418-425` already disqualifies on
architectural grounds. **The cheap answer is available exactly because the problem is smaller than
the one those were built for.**

---

## 8. What the app cannot do alone — the honest boundary

**The client half of optimistic concurrency control is buildable here, today, with no server
change.** The browser is handed each view's `markdown` and can hash it. That base token is
*derivable*, not *granted* — which means row 1 in section 10 is genuinely shippable by this repo.

**The server half is not, and this is the abort.** Precisely what would have to be offered:

**8.1 The Worker must accept and forward a precondition.** `POST /app/edit-file`
(`worker/src/app.js:229`) takes `{path, markdown}` and validates only that both are present
(`:247-250`). It would take `{path, markdown, base}` and refuse with **409** and the current content
when `base` does not match. `app/index.html` already handles a 409 as a distinct, field-level
refusal in the auth flow (`:1441-1443`), so the shape exists in this codebase.

**8.2 The graph server must be able to answer "what does this file say now".** Its declared surface
is `GET /health`, `GET /graph`, `POST /cycle` **[REPO]** (`graph-server-plan.md:46-47`) plus
`POST /vault/file`. **Either** of these closes it, and the first is strictly less work:

* `POST /vault/file` accepts an `If-Match`-style precondition (the sha256 of the expected current
  content) and returns **409 with the current content** rather than writing. One comparison, before
  a write it already performs.
* or a `GET /vault/file?path=…` the Worker can read first. **Weaker** — it is a check-then-act with
  its own race — but it needs no change to the write endpoint.

**8.3 The hosted read path must stop hardcoding `version: null`.** **[OBS]** `worker/src/app.js:141`
and `:271`. This is *not* strictly required if the base is a client-computed content hash, and I
mention it because the obvious first instinct is to reach for `snapshot.version` — **and
`snapshot.version` is the wrong instrument even where it exists.** It is a per-*snapshot* integer
(`:159-176`), so it changes when **any** of the 77 views changes; a precondition on it would refuse
an edit to `this_week.md` because an unrelated view was re-rendered. **The precondition must be
per-file. A content hash of the served markdown is per-file by construction and needs nothing from
anybody.**

**8.4 What I am NOT claiming.** I did not run the graph server and did not read its source — it is
not in this repository. Everything in 8.2 is read from `graph-server-plan.md` and from the calls the
Worker makes, and it is labelled **[REPO]** for that reason. **If that plan is stale, 8.2 is the
sentence to re-check first.**

**Where that leaves it.** Row 1 (client-side base + a version-checked write attempt) is shippable
here and **is worth shipping even before 8.1/8.2 exist**, because it converts a silent overwrite
into a *detectable* one: the browser can compare the base it computed against the projection that
comes back and report the divergence, which is the difference between a defect that has never been
seen and one that names itself. **What it cannot do alone is prevent the write.** That needs 8.1
and 8.2, and they are the two sentences to hand to whoever owns the Worker and the server.

---

## 9. What is declared, and at what evidence tier

**Two capabilities land in `docs/architecture/capabilities.yaml` on this branch. Both carry
`status: undeclared` and no `enforced_by` block, and neither carries a `verify:` marker.**

**Who reads them, established by reading the tool rather than by assuming.** **[OBS]**

* `compute_capability_status([])` returns `"undeclared"` — `flow-trace/src/flow_trace/capability_rollup.py`,
  `if not verdicts: return "undeclared"`. A capability citing zero contracts derives `undeclared`;
  the committed value therefore **agrees with** the derivation rather than pre-empting it.
* `_STATE_BY_CAP_STATUS["undeclared"]` is `"diagnose-ready"` —
  `flow-trace/src/flow_trace/backlog.py:58`. So a backlog row driving one of these derives
  `diagnose-ready`, **which is what puts it in the derived queue as work to scope.** That is the
  reader. Without a row, a capability here is read by the rollup and by nobody else.

**No `verify:` marker is written on this branch and no derived `status:` is invented.** Every
`verify: PASS` in that file is a 2026-07-23 fossil already flagged by the `asserted:` row
`flag-every-verify-pass-in-capabilities-yaml`. Hand-writing a verdict is the same sin green or red.

**No `state_invariants:` entry is declared for either capability, and that is deliberate.** A
`state_invariants:` entry needs a `predicate:` shaped `module:callable` plus a `scenarios:` binding
**[REPO]** (`design-presentation-cascade.md:751-753`). Writing one whose predicate does not exist
produces a declaration that loads clean and reaches nothing — **the trap this whole layer exists to
prevent, and the one I was explicitly warned about.** Each row in section 10 names the falsifier its
own predicate must assert; the predicate lands with the row.

| capability | tier | evidence tier, honestly |
|---|---|---|
| `the-edit-is-a-safe-haven` | foundational | **PARTLY TRUE AND UNGUARDED, PARTLY A PLAN — and the split is per level.** FOCUS is real and shipped (`focus.ts:50`, proven by `tests/present-focus.test.mjs`), and nothing checks that it *stays* outside the file. ANCHOR exists as the wrong type — **measured wrong**, ARM 4. DELTA and BASE do not exist — **measured absent**, ARMs 1, 2 and 5. So: one level structural-and-unenforced, one level measured-defective, two levels absent. **No part of it is falsifiable end-to-end until row 1 lands.** |
| `the-world-moves-around-you` | foundational | **NONE — A PLAN, and not even half true.** There is no path by which a projection reaches this app unbidden; every install is the client asking (`app/index.html:1284-1335`). The *painter* half is real and reusable (4.1) and that is the only thing here above zero. Falsifiable from the push row, not before. |

**The honest summary in one line:** of the two, **one is a third built by accident** and **one is
not started**. Neither should be read as green by anything.

---

## 10. Backlog — sized and sequenced

Sizes are the house set: `under an hour` / `half a day` / `an arc`. **Every row ships
independently**, meaning it leaves the app in a state that is better than the one before it and
does not require the next row to be correct.

| # | row | size | ships what | why HERE in the order |
|---|---|---|---|---|
| 1 | **`a-write-refuses-a-stale-base`** | **half a day** | the browser computes a base token from the markdown it was served, carries it with every write, and **reports** a divergence it cannot yet prevent | **FIRST, AND BEFORE ANY SPEED WORK.** It is the only row that makes the defect in section 3 *visible*, and every later row widens the window in which it fires. Shippable alone (section 8) |
| 2 | **`the-cursor-anchors-to-a-node-not-a-line-number`** | **half a day** | the anchor becomes tier-1 identity / tier-2 text (5.3), degrading explicitly and reporting tier 3 rather than vanishing | Needs nothing. Fixes ARM 4 and ARM 5's *silence* without needing any projection to arrive. **Also the row that makes row 3 small** |
| 3 | **`the-open-line-survives-a-new-projection`** | **half a day** | the held-line region (6.1): a repaint from a foreign source reuses the open row and never sources its characters from the new one; the base moves under it | Needs 1 and 2. **This is capability 1.** Provable with no server change at all, by repainting from a second fixture — which is precisely what the reproduction does |
| 4 | **`the-vanished-line-is-parked-not-dropped`** | **under an hour** | behaviour (b) of 6.4, plus the sentence in `#freshness` | Needs 2. Deliberately *after* 3 so it is a real case rather than a hypothetical. Sized at an hour because it decides nothing — deciding is open decision 1 |
| 5 | **`the-write-is-refused-server-side`** | **half a day** | 8.1 and 8.2 — `base` on `POST /app/edit-file`, a precondition on `/vault/file`, 409 on divergence | Needs 1 for the client half. **Touches `worker/` and a repo that is not this one**, which is why it is separated from row 1 rather than bundled with it |
| 6 | **`stop-awaiting-the-cycle`** | **half a day** | `research-state-and-speed.md:629` item #1 — ack on the vault write, ~10 s → ~250 ms | **AFTER 1, 3 and 5, and this is the whole reason the order is what it is.** It does not cause the defect, it removes the accident that limits it (3.4). Shipping it first would make an invisible defect faster and quieter |
| 7 | **`the-projection-arrives-without-being-asked-for`** | **an arc** | push: the server announces a new projection; the app installs it through row 3's reconciler | **This is capability 2.** An arc because it is the first row needing a transport that does not exist, on a server that is not in this repo. **Must not precede 3 and 5**: push into an unsafe write is a faster machine for losing the cycle's output |
| 8 | **`a-line-being-made-survives-a-projection-too`** | **under an hour** | the relative anchor of 6.5, replacing the unconditional `draftLine.drop()` for arrivals only | Needs 3 and 7. Tiny, and genuinely worthless before 7 — until a projection can arrive unbidden, `drop()` is correct |
| 9 | **`correct-the-dangerous-sentence-in-app-source`** | **under an hour** | the 2.1 correction in `app/present/source.ts:11` | **Documentation-only, and it is application source, so this branch could not make it.** Listed so it is queued rather than remembered |

**The one dependency that is not mine and that I did not invent:** row 4's *good* behaviour (6.4
option (c)) is gated on the existing row `resolve-from-the-model-not-the-text` (stage 6, half a day,
already in the backlog), because telling "the node left the view" from "the node left the graph"
means reading `snapshot.graph`, which nothing in the browser does. **I added no scope for it.**

**Rows 1-4 are one working session between them and are the whole of "the edit is a safe haven."**
Rows 5-7 are the whole of "the world moves around you." Row 6 sits between them on purpose.

---

## 11. Open decisions for the operator

Each is one question with the cost of each answer. **None is closed here.**

**1. When a line you are editing has left the view, may your text go back in?**
Section 6.4. *If yes:* the orphan row commits as an `insert-line` and re-enters a view the cycle
removed it from — which the next cycle may remove again, and which mints a fresh node if the
original was deleted. *If no (what I specify):* the text is parked, visible and recoverable, and the
operator decides. **The question is really "does a view's membership belong to the engine or to the
person", and it is the engine's question, not the browser's.**

**2. Does a projection arrive while a line is open, or wait for the cursor to leave?**
Section 6.4 option (a) is the cheap first increment and it *is* "wait". *If it waits:* capability 2
is conditional on capability 1 being idle, and a long editing session is a long stale window. *If it
arrives:* rows 2 and 3 are load-bearing rather than nice, and every repaint cost in 6.2 lands
mid-keystroke. **Cheap to change once, expensive once anything relies on it.**

**3. Is the base a content hash, or a real per-file version from the engine?**
Section 8.3. *Hash:* costs nothing, needs no schema, works today, and cannot distinguish "changed
back to what it was" from "never changed" — which is harmless for a precondition. *Engine version:*
correct in the graph's own terms, and needs a field in the snapshot envelope, which is the same
schema change stage 7 is an arc for. **I specify the hash and note that it does not foreclose the
other.**

**4. What does the operator see when his line and the cycle's line disagree?**
Section 6.1. *A mark on the row:* honest, non-interrupting, ignorable. *A prompt:* unambiguous, and
a modal in the middle of a sentence. **I specify the mark and I hold that a prompt violates
capability 1 more than the thing it protects against — but it is his call, not mine.**

---

## 12. What I refuted, and what I found false

**1. "The whole file being the write unit is correct."** **[REPO]** `research-state-and-speed.md:303`
says exactly that: *"This is correct — the whole file is the write unit and it is what makes the
'never reconstruct markdown from the DOM' rule enforceable."* **Half right, and the half it gets
wrong is the expensive half.** The write *unit* being whole-file is fine and load-bearing. The write
being **unconditional** is the defect, and the two are separable: a whole-file PUT with a
precondition is safe, and it is what row 1 builds toward. Nothing in this design narrows the write
unit. **Not corrected in place** — the sentence is true in its own context and the correction is
this document.

**2. "The safe haven has to be built."** **Refuted, and this was the most useful thing I found.**
Two of its four levels shipped in the last two days for unrelated reasons (`FocusSurface` for the
cascade, `DraftSurface` so an abandoned line would need no DELETE edit). The remaining work is one
type change and one region of the painter. **Section 4.**

**3. "Making the write asynchronous causes this."** **Refuted, by ARM 2.** Two edits, one tab, no
concurrency, no async, and the cycle's output is gone. **Async widens the window and hides it; it
does not open it.** This matters because the opposite belief would have put the safety row *after*
the speed row, which is precisely backwards.

**4. "`applyEdit` is where the loss happens."** **Refuted, by ARM 3.** The identical edit against a
fresh base preserves everything. The closed union is sound and this design adds nothing to it.

**5. `capabilities.yaml:572` points at a capability that does not exist.** **[OBS]** It reads *"(see
source-is-the-only-truth below)"* and no capability by that id is in the file. **Corrected in
place**, pointed at `every-affordance-writes-back-through-the-source`, which is the capability that
actually holds that constraint. Small, and exactly the "a declaration that exists and does not
reach" shape.

**6. The dangerous sentence, in five declaration files.** Section 2.1. **One corrected in place**
(`capabilities.yaml:410`, by an `── UPDATE` note rather than a rewrite); one is application source
and is filed as row 9; three are left, because their subject really is the DOM and the general
correction now lives here and is cited from there.

**7. My own first reading of the baseline, refuted by running it more.** I first measured
`flow-trace verify .` at **40 PASS / 0 FAIL twice** and wrote that the briefing's stated 32 was
wrong. **Two further runs returned 29 and 32**, always exit 0, always `fail_count: 0`, with 11 and
8 "declared but not observed" INFOs. **[OBS]** So there is no single baseline to be right about:
this is the capture truncation `.flow-trace.yaml`'s header already diagnoses across three earlier
wrong readings of its own, and 32 is a sample of it. **Recorded as a refutation of my own claim
because two consistent runs looked exactly like a fact**, which is the whole reason that header
says to run it twice — and, on this evidence, twice is not always enough.

---

## 13. Reproduction

Everything I ran, against this worktree. No trunk clone was written. `~/qntm` and `~/.qntm-md` were
never read or written. No application source is modified.

```
# baseline, before anything
npm ci && npm test                       # 348 tests, 0 fail
uv run --no-project --python 3.12 --with-editable ~/projects/qntm-network/qntm/tools/flow-trace \
  flow-trace verify .                    # FOUR runs: exit 0 and fail_count 0 every time;
                                         # pass_count 40 / 29 / 32 / 29, INFOs 0 / 11 / 8 / 11.
                                         # The documented capture truncation, not a regression.
uv run … flow-trace queue .              # exit 0, 12 rows

# THE DEFECT — five arms against dist/present.js through tests/fixtures/dom-stub.mjs.
# The script is in the session scratchpad; it imports the SHIPPED bundle and the repo's own
# DOM stub by absolute path and mocks nothing about the write path.
node <scratchpad>/clobber.mjs
#   ARM 1  cursor in line 7, cycle changed line 3      -> #blocked and qntm:124 both clobbered
#   ARM 2  two edits inside one ~14s cycle, no async   -> clobbered again
#   ARM 3  CONTROL: same edit against the fresh base   -> everything survives
#   ARM 4  cycle inserts a line above the cursor       -> cursor lands on "## Today", typing gone
#   ARM 5  the edited line is not in the new source    -> 0 editable rows, cursor vanishes silently

# THE PATH, read rather than assumed
grep -n "edit-file" app/index.html                      # :1164 (toggleTask), :1190 (commitLine)
sed -n '229,282p' worker/src/app.js                     # editFile: no precondition anywhere
grep -rn "If-Match\|ETag\|409" worker/src app scripts   # one hit: auth.js:57, a handle collision
grep -n "version: null" worker/src/app.js               # :141 (hosted read), :271 (write response)

# THE READERS of what this branch declares, read in the tool
grep -n "return \"undeclared\"" ~/projects/qntm-network/qntm/tools/flow-trace/src/flow_trace/capability_rollup.py
sed -n '57,63p'                        ~/projects/qntm-network/qntm/tools/flow-trace/src/flow_trace/backlog.py
```

**Re-run after the edits**, since there is no flow-trace gate in this repo's CI and nothing else
would. **[OBS]**

```
npm test                    # 348 / 0 — unchanged, and it must be: no application source is touched
flow-trace verify .         # exit 0, fail_count 0 (pass_count inside the truncation spread, §0.7)
flow-trace queue .          # exit 0 — queue_length 12 -> 21, diagnose_ready 9 -> 18, drift 0,
                            #          leads 0 (no `lead` flag set on any row: the sequence in §10
                            #          is the deriver's, not mine)
flow-trace backlog .        # exit 0 — item_count 22 -> 31, diagnose-ready 18, asserted 2, passing 10
flow-trace map .            # exit 0 — capability_count 20 -> 22, undeclared 6 -> 8, fail_count 0
python3 -c "yaml.safe_load(…)" over all 9 declaration files   # 9 OK
```

**One file was rewritten by the tool and not by me.** `flow-trace queue .` spliced the nine new
rows into `handoff.yaml`'s `queue:` block, which carries a do-not-hand-edit pin because it is
derived. It is committed as the deriver produced it. `next_command:` was left untouched, because
the queue head is unchanged and non-actionable — the same reason that line has been frozen since
2026-07-30.

`git status --short` is clean apart from the files this branch adds and edits, all of which are
declarations and documentation. **No application source is modified.**

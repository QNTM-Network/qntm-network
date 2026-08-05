# Design: the two rules — what "unfinished" is, now that the status line cannot say so

**Status: design plus one built, checked-in measurement harness. No `app/` source changes on this
branch — `app/index.html`, `app/present/`, `app/shell/` are all untouched. This document, one
script (`scripts/measure-the-divergence.mjs`), one test (`tests/measure-the-divergence.test.mjs`)
and backlog rows are the whole of it.**

**Branch:** `feat/measure-the-divergence`, based on `origin/main` @ `15cb626` — the commit that
retired `#freshness` and the abstention register.

**Evidence rule**, matching the corpus. **[OBS]** a command run this session, output read directly.
**[REA]** reasoned from something labelled OBS. **[REPO]** a claim an already-merged document or PR
body makes, cited, not reproduced.

---

## 0. Lead — the answer, before the argument

**The status line was the architecture, not a feature bolted onto one.** Retiring it did not
create nineteen new defects — it removed the one universal terminal state ("tell him") that every
unfinished path used to fall into, and left each path's own unfinishedness exposed for the first
time. Read against PR #115's own inventory, checked directly against the code as it stands today,
**five of the nineteen are real** — a path where the app genuinely has nothing defined to do next —
not seven. One is the cascade case the operator named by hand (`o`/`O` declining a new line). Four,
not six, are operation cases. §3 below is the full, cited count, and §10 is the refutation of the
brief's own six-operation framing, with the evidence for each of the two items I could not
sustain.

**The measurement is the loud finding.** Built against real config and real engine ground truth
(§5), every resolver this repo can check against the engine at all — membership, ordering, the one
rule this repo can check without a graph — disagrees with it **zero times**, over 2,941 + 8 + 14 =
2,963 checked cells. The felt clunkiness this arc exists to fix is not resolver disagreement. It is
the five dead ends in §3 — an unfinished OPERATION, not a wrong PREDICTION. That is a real
redirection of the arc, stated loudly rather than filed quietly: §5.5 says what it changes.

---

## 1. The diagnosis, restated in the operator's own terms

**"The seven dead ends are one defect wearing seven coats: a path where the app knows something
did not finish and has nothing defined to do."** Before the status line's removal, every one of
those paths had a defined terminal state — a sentence. The sentence was never a fix; it was a
report that stood in for one, and its universal availability is exactly what let seven (five, on
direct count) structurally different gaps go unnoticed as gaps for as long as they did.

**There are exactly two ways a thing can be unfinished:**

1. **THE APP DOES NOT KNOW.** The resolution cascade failed to answer a question it is supposed to
   always answer. **Rule: THE CASCADE TERMINATES.** Global is the bottom rung, and the bottom
   always answers — `GLOBAL → VIEW → STRUCTURAL_NODE → LINE` for the newline-seeding cascade
   `app/present/newline.ts` walks (its own header, `:12-29`), reading most-specific-printed-evidence
   first and falling back to the GLOBAL rung's declaration when nothing is printed.
2. **THE APP KNOWS, BUT IT HAS NOT LANDED.** An operation left for the server has not reached a
   terminal state. **Rule: AN OPERATION COMPLETES.** Bounded retry, then an ACT — re-read, restore
   last-known-good, or hand the content back. Never silence with nothing behind it.

---

## 2. The two rules, precisely

### 2.1 THE CASCADE TERMINATES

**Claim: the newline-seeding cascade's GLOBAL rung must never return `null`.** Today it does, and
`app/present/newline.ts`'s own header names every condition under which it still refuses
(`:67-83`):

* no `GlobalRegistration` supplied at all;
* `sectionForInsertAt` cannot name a `(view, section)` for the insertion index;
* **the named section is not in `qualification.sections[view]`** — and the header states this is
  not hypothetical: "one of the 118 (of 159) qualifications the generator refused to normalise …
  THIS IS A REAL, MEASURED CASE … the operator's own daily surfaces still refuse here today"
  (`:76-79`);
* the resolved node type is not in `resolution.chromeShapes`.

**[REA]** This is the literal mechanism behind PR #115's item 13 — `openLine`'s decline
(`app/index.html:3217`, the `o`/`O` handler; `onNewLineDeclined`'s removal noted at `:2311-2319`).
Under the rule as the operator states it, none of the four conditions above may terminate in
`null`. The first two are inputs a caller failed to supply or a position the file genuinely does
not address — those stay real refusals, but they are caller-shaped bugs, not cascade gaps, and are
out of this document's scope. **The third and fourth are the cascade's own job**, and the fix is
squarely a config-completeness one: publish every section's qualification (closing the 41-of-159
gap the header measures) and every resolved node type's chrome shape, so the GLOBAL rung always has
evidence to read. This document does not do that work — §8 files it as a backlog row — but it
names precisely what "the bottom always answers" requires of the generator that feeds the GLOBAL
rung, which nothing before this document stated as a requirement rather than a nice-to-have.

**One case this rule does NOT reach, named so it is not silently claimed.** `sectionForInsertAt`
failing to name a section for the insertion index is a positional/structural fact about the file
(a line inserted above the first heading, an unaddressable view), not a missing declaration. THE
CASCADE TERMINATES governs "does GLOBAL have an answer once asked", not "can the walk always be
asked" — the second is a different, narrower problem this document does not solve and should not be
read as solving.

### 2.2 AN OPERATION COMPLETES

**Claim: extend `WriteRegister` (`app/present/correlation.ts:479`), never build a second layer.**
It already holds outstanding writes keyed by token with a `grace` counter (`:448`, `:479-582`), and
it already knows which have run out (`arrive`'s `gaveUp`, `:521-545`). What it lacks is a terminal
state for a token that gives up — today `giveUp`/`arrive`'s `gaveUp` branch **release the token and
do nothing else** (`:551-556`: "IT RELEASES NOTHING AND PROVES NOTHING… this is the register
forgetting, never the strip letting go"). "The register forgetting" is precisely the silence §3's
operation cases fall into.

**The terminal state, in order, bounded:**

1. **Re-read.** One more `GET /app/graph`, automatic, no operator action — exactly the read
   `collect()` already knows how to place (`app/index.html:1907`), just not automatically re-armed
   past its current bound.
2. **Restore last-known-good.** Repaint from the last string the server is known to hold —
   `commitLine`'s own non-409 failure path already does exactly this, automatically, today
   (`app/index.html:2768-2776`, `paintView(currentViewId, "arrived")`) — the working instance of
   the rule this document asks to generalise.
3. **Hand the content back.** **To the row, IN MEMORY.** The row store already holds a handle that
   outlives the string it came from (`app/present/rows.ts`, `RowStore`, per
   `research-the-store.md` §2's own table). **No persistence API** —
   `state-edits-are-ephemeral` (`docs/architecture/state.yaml:197`) fails the build on one, and nothing
   in this rule needs it to stop being true: handing back means the row keeps what the operator
   typed, in the surface that already exists for exactly that, never a write to disk, a database, or
   `localStorage`.

**Bounded, so it cannot spin.** `GRACE = 3` (`correlation.ts:448`) already bounds the pickup-answer
wait; the same discipline applies to the retry itself — a fixed, small number of automatic attempts,
then an ACT, never an unbounded loop that becomes its own silent hang.

---

## 3. The nineteen, reclassified — checked against the code as it stands today, not assumed from the PR body's own framing

Every item number below is PR #115's own numbering from its "Silent-failure handover" section.
**REAL** means: today, nothing automatic happens next, and no defined terminal state has been
reached — a genuine instance of one of the two rules. Every other item already has a defined,
automatic terminal behaviour today (even though it is unannounced), or is retired outright by the
Perception Rule (§4), and is not this arc's to fix.

| # | path | today's actual behaviour, read directly | classification |
|---|---|---|---|
| 1 | `arrive()`, held outcome | projection genuinely installs the instant the open line settles — `app/index.html:1699` `queued.offer`/`drainProjection` | not real — already lands |
| 2 | `arrive()`, ignored outcome | malformed/no-op answer; nothing was ever owed — `:1696` | not real — nothing was pending |
| 3 | `arrive()`, accepted outcome | `accept()` starts the pickup that item 4 is the real end of — `:1750` `startPickup` | not real — intermediate step |
| **4** | `collect()`, pickup exhausted | **`next.outcome === "exhausted"` "FALLS THROUGH WITH NO ACTION — SILENT, ON PURPOSE, DOCUMENTED"** — `app/index.html:1949-1959`, the comment's own words | **REAL — operation** |
| 5 | `writeFile()` in-flight "syncing…" | not a failure path at all; retired outright, §4 | not this rule — Perception Rule |
| 6 | `sayAsOf` arrival confirmation | not a failure path; retired outright, §4 | not this rule — Perception Rule |
| 7–10 | cursor identity across a projection | each already a defined, deterministic reseed/hold/follow — `app/index.html:2187-2325`; the visible SETTLE motion is the sanctioned surface (§4) | not real — already terminal, and covered by the Perception Rule where anything should be visible at all |
| **11** | `commitLine`, 409 with real typed text, heal unsafe | `commit.text.trim() === ""` gates `healFromRefusal` — `:2763`; when text is NOT empty, **nothing further happens**: no retry, no explicit hand-back signal, the row is left indistinguishable from an ordinary open edit | **REAL — operation** |
| 12 | `commitLine`, non-409 failure | `paintView(currentViewId, "arrived")` — automatic repaint from last-known-good, today, already — `:2768-2776` | not real — already the rule, working |
| **13** | `openLine`'s decline (`o`/`O`, click past last row) | `openLine` returns `false`; no callback; "a decline is silent … both simply do nothing" — `app/index.html:2316-2319`, `:3217` | **REAL — cascade** |
| **14** | boot read failure ("unreadable") | `showEmpty("unreadable", …)`, generic heading only, no automatic retry — `app/index.html:3336-3346` | **REAL — operation** |
| 15 | `refresh()` failure | `aria-busy` clears in `finally`; the view is left exactly where it was — `:2938-2958` | not real, on balance — see the caveat below |
| 16–19 | abstention register (membership/ordering/rules/parent) | each resolver reaches a complete, deliberate, documented terminal answer — decide, or abstain **with a named reason** (`app/present/resolvers/{membership,ordering,rules,promotion}.ts`) | not real — abstaining is a designed terminal state, not "does not know" |

**Item 15's caveat, stated rather than silently resolved either way.** `refresh()` leaves the view
exactly where it was on failure, which is trivially "restore last-known-good" — nothing changed, so
there is nothing to restore. That is the same shape as item 12's genuine fix. But unlike item 12,
nothing here re-attempts automatically, and the operator has no signal a read even failed. I judge
this NOT REAL on the letter of the rule (a defined terminal state — unchanged, last-known-good — was
reached), but it is the weakest "not real" in this table, and §8 files it as a backlog row anyway
because the automatic-bounded-retry half of §2.2's rule is genuinely absent here even though the
ACT half is trivially satisfied.

**Total: 5 real, not 7 — 1 cascade, 4 operation, not 1-and-6.** §10 is the full refutation.

---

## 4. THE PERCEPTION RULE, and why it retires items 5, 6 and (for what remains visible) 7–10 rather than fixing them

**The browser is authoritative until the engine disagrees. Latency is never surfaced.** No spinner,
no "saving", no progress of any kind — the operator's own words: *"we can't have a 14 second saving
state… that feels very 2000 and something… A normal smooth seamless app."* The browser resolves the
same config the engine does, so the row is simply right, immediately, and the 14-second engine
return is a reconciliation window, invisible unless the engine says something the browser did not
predict.

**Exactly two things may ever be visible:**

* **A SETTLE** — the engine disagreed; the row moves to the truth. The motion already exists
  (`app/present/settle.ts`) and the operator confirmed it works. Items 7–10's cursor-identity
  cases are exactly this: the row itself already resolves and repaints correctly; what item 5/6's
  removed sentences would have added is narration ON TOP of a motion that already carries the
  fact.
* **CONTENT HANDED BACK** — an operation genuinely gave up. §2.2's third ACT.

**Everything else is absent by construction, not hidden.** Items 5 and 6 are not dead ends under
either rule — they are exactly the category of visible state the Perception Rule retires outright.
A "syncing…" indicator or an arrival confirmation is not an unfinished operation; it is a report on
one that is proceeding normally, and normal proceeding is precisely what must never be shown.

---

## 5. Measuring the divergence

### 5.1 What is being measured, and why it is the arc's first slice

**How often does the browser's prediction differ from what the engine actually returns?** The
Perception Rule (§4) is a bet: that the browser's locally-resolved answer is usually right, so
showing it immediately is honest rather than optimistic. The size of that bet is exactly the
divergence rate. A high rate would mean §4 is showing the operator something wrong more often than
felt clunkiness alone would suggest; a low rate turns "feels clunky" into "look at §3 instead" —
this is why the operator chose this measurement over building the operation layer first: it aims
the rest of the arc rather than guessing at it.

### 5.2 The constraint that shaped the design

**It must never be operator-visible — not now, not behind a flag, not in a corner.** Any dashboard,
badge or console log reachable from the running app is the status line reborn wearing a number, and
by the operator's own diagnosis (§1) it would be retired the same day. So the measurement is built
as a **build-time report**: `scripts/measure-the-divergence.mjs`, a standalone Node script that
imports `dist/present.js` exactly the way every test in `tests/` already does. It is never imported
by `app/index.html`, `app/present/`, or `app/shell/`; `npm run build` does not touch it; nothing in
the shipped bundle changes size or content because it exists. **[OBS]** confirmed:
`rg -n "measure-the-divergence" app/index.html app/present app/shell` → zero hits (checked after
writing the harness, not assumed).

**No telemetry.** The script makes no network call, reads only files already committed to this
repo, and writes nothing anywhere. It is invoked by a human (or an agent) running
`node scripts/measure-the-divergence.mjs`, the same way `npm test` is invoked, and prints its report
to the terminal that ran it.

**It does not violate `research-the-store.md` §5's invariants.** It adds no state surface — it is a
pure script that reads files and calls exported pure functions once each. It is not a "second path
to the screen" (invariant 1) because it never reaches a screen at all; it caches nothing that is
recomputed elsewhere (invariant 3) because it computes its own numbers once, on demand, and holds
them only for the duration of one process; it is pull, never push (invariant 4), because nothing
subscribes to it and nothing calls it automatically.

### 5.3 Where the ground truth comes from

**Real config, not a toy fixture — the existing test fixtures and the served declaration.** Every
comparison replays a fixture already checked into this repo, generated by calling the engine's own
Python against the operator's real config bundle (and, for membership, a read-only copy of his real
graph):

| axis | fixture | engine function called to generate it |
|---|---|---|
| membership | `tests/fixtures/qualification-agreement.json` | `qntm_graph.patterns.engine.matches_pattern` |
| ordering | `tests/fixtures/resolution-agreement.json` | `qntm_md.render.section_builder._DEFAULT_ORDERING`/`_PRIORITY_RANK`, live-imported |
| rules (day-boundary slice) | `tests/fixtures/day-boundary-agreement.json` | `qntm_md.substrate_wiring.day_boundary.resolve_logical_day`/`resolve_week_end` |

**Nothing was regenerated for this branch.** The three `scripts/*-agreement.py` generators require
`--state-db COPY` — a copy of the operator's live database — which this worktree does not have and
this task must not create. The fixtures above are replayed exactly as committed; this is the
"existing test fixtures … are the honest inputs" instruction, taken literally rather than as
licence to re-run a generator against anything live.

### 5.4 The numbers, per resolver, run this session

**[OBS]** `node scripts/measure-the-divergence.mjs`, this worktree, this session:

| axis | cells checked | mismatches | divergence rate | what it covers |
|---|---|---|---|---|
| **membership** | 2,941 | 0 | **0.0000%** | every field triple the real graph holds (61) **plus** every triple a line being typed can reach (2,880) — the full reachable probe space, not a sample |
| **ordering** | 8 | 0 | **0.0000%** | the default-path tie-break constants (3 ordering-tuple keys + 5 priority ranks) `defaultOrderingFor` uses for the 171 sections with no declared `ordering:` |
| **rules** (day-boundary slice) | 14 | 0 | **0.0000%** | `today.ts`, the one dependency of `stamp-created-at-on-task` this repo can check without a graph — both DST regimes, the rollover instant, two config sensitivities |
| **parent promotion** | — | — | **NOT MEASURED** | no fixture in this repo carries engine ground truth for a one-hop graph-dependent decision — §5.4.1 |

**Total measured: 2,963 cells, 0 disagreements.**

#### 5.4.1 Why parent promotion is not measured, honestly, rather than guessed at

`app/present/graphmatch.ts`'s whole reason to exist is the ONE-HOP case
`qualification-agreement.py`'s own header excludes by name: `GRAPH_DEPENDENT`, patterns whose
answer depends on a NEIGHBOUR node's fields, are out of that script's method by construction — "two
nodes with the identical triple can have different edges, so 'one input, one answer' does not hold"
(that script's own header, quoted in §5.3's table). No other fixture in this repo carries per-node
one-hop verdicts against the real graph. **Producing one honestly would mean writing a NEW
engine-side generator** — Python, against a read-only copy of `state.db`, the same posture
`qualification-agreement.py` already takes — which is new engine-side tooling this branch does not
build, not a replay of something that already exists. §8 files this as its own backlog row rather
than shipping a fabricated number or a number computed against a toy graph that would not mean
anything.

### 5.5 The finding, said loudly

**Every axis this repo can check against the engine agrees with it, always, over the full
reachable probe space.** This is not "the tests pass" restated as a percentage — `qualification-
agreement.test.mjs` and `resolution-agreement.test.mjs` already assert exactly this as a boolean,
and both are green on `main` today. What this measurement adds is the CLAIM SHAPE: a rate, computed
fresh, over the actual reachable input space (2,880 probe cells for membership, not a handful of
examples), rather than a pass/fail that could in principle be hiding a narrow miss inside a broad
pass.

**If the browser turns out to predict correctly far more often than the felt experience
suggests, that is a finding and it changes the arc.** It does, here, and plainly: the resolver
layer is not where "clunky" is coming from. §3's five dead ends are. The two rules this document
pins are not a hedge against a resolver gap this measurement failed to find — they are the actual
location of the problem the operator is describing, and this measurement is the evidence that rules
out the other candidate. **The arc's next slice should be §2.2's `WriteRegister` extension and §2.1's
GLOBAL-rung config-completeness work, not a resolver-accuracy programme** — there is currently
nothing there to fix, on every axis this repo can check.

**What this does not, and cannot, rule out.** Parent promotion is unmeasured, not measured-and-clean
— §5.4.1's gap is real and could in principle be where a felt-clunky report actually originates.
Membership and rules are measured at the PREDICATE level, not the full per-commit resolver
(including field-resolution and abstention-reason correctness) — see each axis's own `scopeNote` in
`scripts/measure-the-divergence.mjs`'s output. Ordering is measured at the constant level, not
against a live per-commit placement. None of these are guessed at; each is named, in the harness's
own report, as a boundary of what was actually checked.

---

## 6. GATE-WORK-CARRIES-ITS-SCENARIO

**`tests/measure-the-divergence.test.mjs` §2 is the traced scenario.** A value test (§1 of that
file, which pins the exact numbers in §5.4 above) is blind to HOW the number was reached — a
harness that always printed `0` regardless of its input would look identical to one genuinely
comparing two independent sources. §2 clones the real membership fixture, corrupts exactly one real,
engine-verified answer (a structural/chrome triple's empty match set, flipped to claim it matches
every published pattern — the largest lie the fixture's own shape can tell), and asserts the
comparison catches it. **[OBS]** run this session: the corrupted fixture produces `mismatches >= 1`;
the uncorrupted one produces `0` — proving the `0.0000%` figures in §5.4 are a measured fact about
the fixtures, not a property of the comparison code that would report `0` regardless of what it was
handed.

---

## 7. Which axis this pins, and which it does not

**TIME**, primarily. §2's two rules are a decision made now, cheap to state, with the actual
building (the `WriteRegister` extension, the GLOBAL-rung config completeness) left for the backlog
rows in §8 — "a small point now, fleshed out later," the same posture `research-the-store.md` §9
takes for its own one recommendation.

**HORIZONTAL, weakly, through §2.2's ownership decision.** "Extend `WriteRegister`, do not build a
new layer" homes the operation-completion mechanism against a module that already exists and
already owns the nearest fact (outstanding writes, keyed by token, with a grace counter) rather than
inventing a parallel one — the single HORIZONTAL move this document makes, and it is a decision
about where work goes, not code that moves anything today.

**VERTICAL is not pinned.** This document adds no capability → package → module → sink chain; §8's
backlog rows are unscoped proposals, not shipped or even diagnosed-ready-in-full work, and the
measurement in §5 is a script outside every existing capability's own enforcement. **A document
whose one shipped artifact is a measurement harness and whose two rules are pinned in prose has
joined the majority — 75 of 121 capabilities sit at enforcement depth 1 — not escaped it**, and that
should be said plainly rather than dressed up as more architectural than it is.

---

## 8. Backlog rows this document files

Five rows, `docs/implementation-artifacts/backlog.yaml`, one per slice rather than one giant row,
matching the existing row schema (`id`, `title`, optional `driving_capability`, `kind`, `state`).

1. **`the-cascade-terminates-for-a-new-line`** — `kind: capability`, `state: unscoped`. §2.1: the
   GLOBAL rung of `app/present/newline.ts`'s seeding cascade must never return `null`. Needs the
   config-completeness half (publish the remaining 41 of 159 unpublished section qualifications,
   and every resolved node type's chrome shape) that `newline.ts`'s own header already measures as
   the actual blocker, not a browser-side code change.
2. **`write-register-gains-a-terminal-state`** — `kind: capability`, `state: unscoped`. §2.2: extend
   `WriteRegister` (`app/present/correlation.ts:479`) with the bounded-retry-then-ACT lifecycle,
   closing item 4 (pickup exhausted) — the clearest, most-measured instance of the operation rule's
   absence.
3. **`refused-write-hands-content-back`** — `kind: capability`, `state: unscoped`. Item 11: a 409
   refusal with real typed text at stake, where `healFromRefusal` cannot safely run
   (`app/index.html:2763`), currently leaves the row silently unrecovered. Needs the "hand back to
   the row, in memory" ACT — no persistence API, per `state-edits-are-ephemeral`.
4. **`boot-and-refresh-reads-retry-before-giving-up`** — `kind: capability`, `state: unscoped`.
   Items 14 and 15 together: neither a failed boot read nor a failed manual re-read currently
   attempts an automatic bounded retry before falling back to its (already-correct) terminal
   display state. Filed as one row because both are the SAME read operation (`readGraph`/
   `loadGraph`) failing at two different call sites, not two independent mechanisms.
5. **`a-one-hop-graph-agreement-fixture-for-parent-promotion`** — `kind: null`, `state: unscoped`.
   §5.4.1: no fixture in this repo can measure `graphmatch.ts` against the engine. Needs a NEW
   Python generator, `scripts/graphmatch-agreement.py`-shaped, calling `matches_pattern` (or
   whatever the engine's own one-hop verdict function is) node-by-node against a read-only graph
   copy rather than keyed on a triple — this row exists only to flag the gap, the same posture
   `stage-three-does-not-tenant-ize-config` and `a-one-hop-graph-agreement-fixture-for-parent-
   promotion`'s sibling rows in this file already take for gaps this repo can see but not close.

---

## 9. What I refuted

**1. The brief's own "six operation dead ends," checked item by item against the code rather than
accepted.** I found four, not six (§3, §10.1). This is the classification the top-level instructions
name as "MINE [the orchestrating brief's], from reading PR #115's list" and invite correction on
"if any is misclassified" — §10 is that correction, with the evidence for each item I could not
sustain as real.

**2. That items 16–19 (the abstention register) are cascade failures because their abstain reasons
include `no-section-declaration`, the same words `newline.ts`'s GLOBAL rung uses.** Checked directly
(`app/present/resolvers/promotion.ts:272,288`, `ordering.ts:128`): these are a DIFFERENT question —
whether a specific axis (ordering, parent-promotion) has a DECLARED rule to evaluate for an already-
typed line, not whether the browser knows what a brand-new line's config even is. `ordering.ts`'s
own comment states plainly that `insertion_order` abstaining "on EVERY edit, forever" is the
correct, permanent, designed answer for an undeclared section — not a gap. I considered folding
these into item 13's cascade classification and refuted it on this distinction.

**3. That item 15 (`refresh()` failure) is a real operation dead end on the same footing as item 4.**
First pass counted it as REAL. Refuted on rereading §2.2's own rule literally: the view is left at
last-known-good, which is one of the three sanctioned terminal ACTs, satisfied trivially because
nothing was disturbed. Kept as a backlog row anyway (§8, row 4) because the AUTOMATIC-RETRY half is
genuinely missing, but classified NOT REAL in §3's table because the rule's letter is met.

**4. That the divergence measurement would need to ship instrumentation into the app to be honest.**
The brief itself names this as the correct abort condition if true. It is not true here: the
existing `tests/*-agreement.test.mjs` pattern (import `dist/present.js`, replay a checked-in
fixture, assert) already does everything the measurement needs except REPORT A RATE instead of a
boolean, which `scripts/measure-the-divergence.mjs` adds with no change to `app/`, `dist/`, or any
file a running instance of the app ever loads.

---

## 10. What I could not settle, and what remains a judgement call rather than a proof

**10.1 Whether five, not seven, is the RIGHT final count, or whether I under-counted.** §3's table
is checked against the code as it stands, not against the operator's own unstated intuition for
which paths feel unfinished. It is possible the operator would, on seeing this table, name a felt
gap in one of the "not real" rows that this document's literal reading of the two rules does not
currently register — item 15 (§10, refutation 3) is the one row where I judged this closest, and it
is flagged rather than silently resolved either way.

**10.2 Whether `openLine`'s OTHER refusal reason — `sectionForInsertAt` failing to name a section for
a genuinely unaddressable insertion index — should also fall under some version of THE CASCADE
TERMINATES, widened.** §2.1 states plainly that it does not, on the reading that this is a
positional fact rather than a missing declaration. This is a judgement call, not a proof, and a
future document narrowing or widening the cascade rule's scope should re-examine it rather than
inherit this document's line silently.

**10.3 The real-world size of the `write-register-gains-a-terminal-state` and `boot-and-refresh-
reads-retry-before-giving-up` rows.** Both are filed `state: unscoped` rather than
`diagnose-ready` because sizing the actual bounded-retry mechanism (how many attempts, what backoff,
whether it shares code with `PickupSchedule`'s existing `attempt`/`answered` lifecycle) needs a
design pass this document did not do — it names the shape (§2.2) and stops there, per the brief's
own instruction that PINNING the decisions is the first deliverable and the building is separate,
later work.

---

## 11. Reproduction

```
# worktree state this document was written against:
git rev-parse HEAD                                    # feat/measure-the-divergence, based on 15cb626

# §3 — the code citations, read directly this session:
sed -n '1945,1960p' app/index.html    # collect(), pickup exhausted — item 4
sed -n '2745,2777p' app/index.html    # commitLine's two 409/non-409 branches — items 11, 12
sed -n '2310,2320p' app/index.html    # openLine's decline, narrated no more — item 13
sed -n '3330,3350p' app/index.html    # boot read failure — item 14
sed -n '2938,2958p' app/index.html    # refresh() failure — item 15
sed -n '60,85p' app/present/newline.ts   # the GLOBAL rung's four named refusal conditions
grep -n "abstain" app/present/resolvers/*.ts   # items 16-19, each a designed terminal state

# §5 — the measurement, run fresh:
node scripts/measure-the-divergence.mjs

# §6 — the traced scenario, run fresh:
node --test --test-reporter=tap tests/measure-the-divergence.test.mjs

# full suite, before and after, measured the same way PR #115 measured it:
npm install && npm run build
node --test --test-reporter=tap "tests/**/*.test.mjs"    # 2114 tests, 2108 pass, 4 fail (pre-existing config drift), 2 todo

npm run typecheck    # clean

# NOT RUN, deliberately: no cycle, no graph-sync, no wrangler --remote, no POST to
# https://qntm-graph.fly.dev, no git stash. ~/qntm and ~/.qntm-md were never opened. The trunk
# clones at /Users/lukeannison/projects/qntm-network/qntm and qntm.network were never written.
# scripts/*-agreement.py were read, never executed — each needs --state-db COPY, a copy of the
# operator's live database this worktree does not have and this task must not create.
```

# Roadmap: the road ahead — the order, the decision rule, and what each step commits us to

**Status: the plan of record. The operator approved this ordering. This branch adds documents and
backlog rows. It modifies no application source.**
**Branch:** `docs/road-ahead`, based on `origin/main` @ `2e9561a`.

---

## 0. The answer, in one paragraph

**Five steps, and the first one is already moving. Un-bake the declaration, because one import is
what turns a config change into a redeploy. Then make an abstention visible, because until the
browser can say "I do not know" in a way a person can see, nobody — including a person driving the
browser — can tell a working prediction from a lucky one. Then give "the engine has ruled" one
visual language, because a row moving to its sorted position, a node type being corrected, and a
rule cascading are not three problems; they are one problem seen three times, and the engine
overrules the browser's registration answer in 13 of 186 sections inside the same pass that minted
the node. Then move the compile into the Worker. Then make config per-user. The first three are the
honesty half and they are cheap. The last two are the product half and they are arcs. The decision
rule that governs everything after is three bands — Certain, Predicted, Consequential — and the
rule is that the browser answers in the first, believes in the second, and refuses in the third.**

---

## 1. What this document is, and what it is not

**This document decides ORDER. It does not re-derive evidence.**

Six merged documents already hold the measurements. This one cites them and adds nothing to them:

| document | what it holds |
|---|---|
| `design-config-is-content.md` | where the compile runs, the baked import, the eight places the design assumes his instance |
| `design-the-rule-mirror.md` | what of the engine's behaviour can be published, priced per rung, swept over all 186 sections |
| `research-the-resolution-universe.md` | the reachability numbers per gesture |
| `research-the-rule-closure.md` | the rule closure |
| `design-the-resolution-architecture.md` | the thirteen-step architecture, and the cascade's five levels |
| `design-presentation-cascade.md` | the presentation half of the cascade |

**Anywhere this document states a number, the number belongs to one of those documents and is cited
to it.** Where this document adds a judgement the merged documents do not carry, it says so with the
word **[NEW]**. Where this document disagrees with a merged document, §6 names the disagreement
rather than quietly picking a side.

---

## 2. The order

### Step 1 — un-bake the declaration · **under an hour** · IN FLIGHT

**[VERIFIED at `2e9561a`]** `app/present/embedded-declaration.ts:45`:

```ts
import presentationJson from "../../presentation.json" with { type: "json" };
```

That is the whole obstacle. `app/index.html:1121-1122` — `loadPresentation()` calls
`applyPresentation(EMBEDDED_DECLARATION)` and reaches no network. esbuild's JSON loader inlines
138,878 bytes of configuration into a 264,403-byte bundle. A config change therefore requires a
regenerate, a rebuild, a commit of the rebuilt bundle, a push, and a Pages deploy.

**An agent is implementing this now, in parallel.** This document does not specify it; it records
what the rest of the order waits on.

**What it commits us to.** The declaration becomes a fetched resource with its own cache lifetime,
and the app must handle "no declaration yet" at run time rather than at build time. The machinery
for that refusal already exists and is correct — `design-config-is-content.md` §7 step 2 shows
`globalRegistrationFor` returning `undefined` when either axis is missing, so the rung refuses
rather than guesses.

**Why everything waits on it.** Until this lands, every later step ships behind a redeploy, so no
later step can be demonstrated to anyone who is not the operator.

---

### Step 2 — make an abstention visible · **half a day** · needs 1

**The defect, verified at `2e9561a`.** `membershipNoteFor` (`app/index.html:3005-3029`) and
`orderingNoteFor` (`app/index.html:3046-3071`) each return the empty string for two different
things:

* an abstention — `app/index.html:3022-3024`, `if (before.kind !== "answer" || after.kind !==
  "answer") return "";` and `app/index.html:3066-3068`, `if (reading.kind !== "answer" ||
  !reading.answer.moved) return "";`
* a confident answer that nothing changed — `app/index.html:3028` and `app/index.html:3070`, the
  trailing `return "";` on each function

`app/index.html:3269` joins the two results and filters the empty string out
(`.filter((n) => n !== "")`). `app/index.html:3121` writes the survivors into the freshness line.

**So "I do not know" and "yes, this belongs" produce byte-identical output.** That is not a new
finding. `design-the-rule-mirror.md` §8.4 already states it, and adds the number: **116 refusals
with reasons ship to the browser and reach DevTools, not the operator**, and `refused` is declared
*"Never read to decide anything"*.

**Why it is a prerequisite and not a polish item.** Front-running is a claim about prediction. A
prediction that is indistinguishable from silence cannot be scored — not by a test, and not by a
person driving the browser and watching the line. Every step after this one produces predictions.
Shipping them into a surface that cannot report a non-answer means shipping them unfalsifiable.

**Size: half a day. [NEW]** `design-the-rule-mirror.md` §11 row 6 prices "make refusal visible where
a section is undecidable" at **under an hour**, and for the mechanism that is right — the `because`
value is already computed and already discarded. The extra half-day is the surface, and the reason
is written into the code this step touches. `membershipNoteFor`'s own header refuses to speak on the
safe transition because *"a message on every keystroke is noise"*. An abstention happens far more
often than a leaving transition — 137 of 186 sections are inside the refusal today
(`design-the-rule-mirror.md` §11 row 6) — so routing abstentions into the freshness line would
reintroduce exactly the noise that header refused. **The abstention needs a register of its own, and
choosing that register is the half-day.** This is a judgement, and it is the one place this document
prices a step above a merged document's estimate.

**What it commits us to.** Two registers, not one: a narration register that speaks about changes,
and a diagnostic register that says what the app could not decide. Once both exist, "the app said
nothing" stops being a valid state.

**Falsifier.** Drive one line in a section whose qualification is refused, and one line in a section
that publishes cleanly and does not move. Assert the two produce different output. Today they do
not.

---

### Step 3 — one visual language for "the engine has ruled" · **an arc, and it splits** · needs 2

**The operator's words: settling should be *"not clunky but intentional · moving deliberately in the
background"*.**

**The insight this step records: three separate problems are one problem. [NEW]**

1. A row moves to its sorted position.
2. A node type is corrected.
3. A rule cascades.

Each of these is the engine overruling what the browser showed. Today they would be built three
times, by three people, with three different motions — because nothing in the repository says they
are the same event.

**The forcing measurement.** `design-the-rule-mirror.md` §3.3 and §0:
`routine-without-cadence-becomes-task` (`config/rules/cadence_auto_routine.yaml:58-71`) retypes a
bare capture from `routine` to `task` **inside the same pass that minted it**. So in **13 of 186
sections the browser's registration answer is wrong by the end of the cycle**. The view declares
`default_node_type: routine`; the rule overrules it because the line carries no cadence.

**The consequence for the visual language.** A browser that stamps `routine` and is contradicted ten
seconds later must not swap the word silently. **A silent swap is a lie told twice: it asserts the
first answer, then withdraws it without admitting the first answer existed.** An engine correction
has to be a visible event. That is the whole argument for building one motion instead of three: the
motion is not decoration, it is the admission.

**Size: an arc, and it splits into two pieces that can land apart. [NEW]**

* **The event must exist before it can be shown — `½`.** `design-the-rule-mirror.md` §11 row 4:
  publish the two capture rules and their order as a closed grammar
  (`routine-without-cadence-becomes-task` + `stamp-created-at-on-task`, 2 of 94 rules). Without it
  the browser does not know a correction is coming and the settle has nothing to animate.
* **Giving it one language — an arc.** One settle affordance in the painter, used by all three
  occasions, with the timing and the register decided once.

**What it commits us to.** A shared vocabulary of motion owned by the painter, not by each feature.
It also commits us to the position that the browser's first answer is a claim and not a fact, which
is the same position §4's bands take.

**What it does NOT commit us to.** A rule evaluator. `design-the-rule-mirror.md` §11 row 4 is a
published grammar of two rules with a generated fixture, not an interpreter.

---

### Step 4 — move the compile into the Worker · **an arc** · needs 1

**The runtime evaluator.** `design-config-is-content.md` decides this and prices it: the compile
runs in the Cloudflare Worker, not the graph server (`one-implementation-per-concern`) and not the
browser (the browser must never be the authority on what a config means). The measurement that
decides it — the three compilers are already **92 % portable**, **under 200 of 2,568 lines** touch
the filesystem or the command line — is in that document's page one. Do not re-derive it.

The sub-order inside this arc is `design-config-is-content.md` §7 steps 3 and 4: the compile becomes
a pure function of file contents first, then the Worker compiles on a config write and stores the
result per user.

**What it commits us to.** A third caller of the same compiler, and therefore a conformance
assertion that the Worker and the CLI produce byte-identical objects — `design-config-is-content.md`
§7 step 4's second falsifier. It also commits us to a storage answer: the Worker has one D1 binding,
no KV, no Durable Objects, and R2 is not enabled on the account (§7 step 4, §8.2).

**What it delivers, stated honestly.** The operator's config becomes live-editable. That is the
whole of it. See §5, risk 1.

---

### Step 5 — multi-tenant config · **an arc, and larger than step 4** · needs 4

**The state today, from `design-config-is-content.md` §8.1:** one tracked `presentation.json`, one
committed bundle, one push, one config directory on one server (`/data/config`). The Worker already
keys graph snapshots by `user_id`; **the config path has no user dimension anywhere.**

**And the protection that disappears.** `design-config-is-content.md` §"The protection that
disappears" is the finding to carry into this step: `graph-sync.mjs` GUARD 2 refuses any config that
does not hash blob-for-blob identical to the config at the `deployed` git tag, because config/engine
skew broke the vault three times. **The guard is made of git. A user has no git, so a user has no
guard.** The replacement is the dry-load gate (`design-config-is-content.md` §4.3 gate 2, §7 step
7), and it must land before any user may write config.

**What it commits us to.** The declaration stops being a build artifact and becomes per-user state,
and the config stops being a directory and becomes per-user data. Every number in §4's bands is
re-opened by a second user, because every number was measured over one config. See §5, risk 2.

---

## 3. The order, as a table

| # | step | size | needs | why it is here |
|---|---|---|---|---|
| 1 | un-bake the declaration | **under an hour** | nothing | one import is what makes a config change a redeploy; **IN FLIGHT** |
| 2 | make an abstention visible | **half a day** | 1 | until it lands, no prediction can be scored, including by a browser drive |
| 3 | one visual language for "the engine has ruled" | **an arc** (`½` + arc) | 2 | the engine overrules the browser in 13 of 186 sections; a silent swap is not survivable |
| 4 | move the compile into the Worker | **an arc** | 1 | config stops needing a build |
| 5 | multi-tenant config | **an arc, larger than 4** | 4 | config stops being one directory on one server |

**Read the order this way.** Steps 1–3 are the honesty half: they make the app able to say what it
does not know, and able to show when it was wrong. Steps 4–5 are the product half. The honesty half
comes first because it is what makes the product half checkable, and because it is cheap enough that
delaying it buys nothing.

---

## 4. The three bands — the decision rule for everything after

**This is the rule every later step is decided by. An answer belongs to exactly one band, and the
band decides whether the browser may speak.**

### Certain — the browser knows, from config it can read

**Instant, no ceremony.** Registration and defaults.
`design-the-rule-mirror.md` §0 rung 2 and §4.2: **153 of 186 sections declare a `defaults:` map**,
over 8 fields, with **no rule engine at all**. The data is already published, parsed, validated and
in memory; §9.1 of that document shows one function ignores it by design.

**One correction to the framing, and it is the reason step 3 exists. [NEW]** The Certain band is not
simply "153 of 186". `design-the-rule-mirror.md`'s own refutation list, item 5, states it: rung 1 is
free, and safe in **173 of 186 sections**. The 13 routine sections are not certain until the two
capture rules are published, because the engine retypes their captures inside the minting pass. So:
**Certain is 153 of 186 for defaults, and 173 of 186 for registration, and the 13-section gap is
step 3's `½`.**

### Predicted — an answer the browser believes, that the engine will rule on

**Ordering lives here.** `app/index.html:3040` records the shape: **only the nine sections that
declare an `ordering:` say anything; the other 177 abstain** `no-section-declaration` inside
`orderingFor` itself.

**And it already abstains honestly — inside the module.** `app/present/ordering.ts:280` refuses
outright with `nested-section` the instant any line in the range is indented, and `:265`, `:267`,
`:269`, `:285` refuse for four further reasons. **The abstentions are correct and they are
invisible.** That is not a contradiction; it is the exact statement of step 2. The module is honest;
the surface is not.

**The rule for this band.** The browser may answer, and the answer must be marked as a prediction
that the engine can overrule. Step 3's motion is how the overruling is shown.

### Consequential — a tick reaching 29 of 94 rules, cascades, unlocks

**The browser must not guess here.** `design-the-rule-mirror.md` §0 and §4.3, citing
`research-the-resolution-universe.md` §3.1: a tick reaches **29 of 94 rules**, up to 5 rules per
node, against a capture's 2.

**The reason is not cost, it is failure mode.** A wrong guess in the Certain band self-corrects on
the next projection. A wrong guess in the Consequential band **cascades**: it is read by the next
rule, which writes a field read by the next. `design-local-behaviour-and-the-queue.md` §0.5 measured
the coupling — **75 of 94 rules read a field that another rule writes**. There is no local repair
for a wrong answer in that band, and that is why the band exists as a refusal rather than as a
budget.

---

## 5. The three honest risks

**Stated plainly. None of these is softened, and none is a reason not to proceed.**

### Risk 1 — multi-tenancy is the real arc, and step 4 is not it

The evaluator makes **his** config live-editable. It does not make **a user's** config exist. Those
are different problems and the second is larger. `design-config-is-content.md` §8.1 is blunt about
why it is easy to miss: *"This is the deepest assumption in the arc and it is invisible because
there is exactly one user."*

Anyone reading step 4's falsifier — *"write a config that adds one vocabulary token; the next fetch
contains it; no build ran, no commit was made, no deploy happened"* — should read it as what it is:
proof that the compile moved, not proof that the product exists.

### Risk 2 — every number in this document is his instance

The merged designs prove the **shape** works. They are **not bounds**.

`design-config-is-content.md` §8 enumerates what a second user breaks, in eight rows: the
single-tenant path (§8.1), the declaration's size against D1's 950,000-byte row ceiling (§8.2), the
three resolvable fields that drop 73 of his own tokens (§8.3), a YAML reader that throws on normal
YAML (§8.4), a four-level cascade that is only four because his fifth is switched off (§8.5), a
section-level node type nobody has declared yet (§8.6), agreement tests that only ever test his
config (§8.7), and a closing list of numbers to stop quoting as bounds (§8.8). **Cite that section.
Do not re-derive it, and do not summarise it into a sentence that makes it sound smaller.**

The one line from §8.8 worth repeating here, because it governs how to read §4's bands: **every
closure number in this repository is a floor. Sampling can only undercount.**

### Risk 3 — "the browser evaluates any config" is not what this delivers

**The Worker compiles config into a closed grammar. The browser stays a reader.**

This is the architecture's rule, not a limitation waiting to be engineered away.
`design-the-rule-mirror.md`'s refutation list, item 2, upholds it without qualification: *"The
browser must not hold a second copy of the language. Upheld, and this document does not challenge
it. Every rung above is generate-once. Nothing proposed here interprets config in the browser."*
§11 row 7 restates it for the one row that comes closest: rung 3 for ticks is **still refused as a
general evaluator**, and if it is ever built it is a per-gesture closure with a conformance suite,
not an interpreter.

**What is fair to say about the refusal is that it got cheaper to live with, not that it got
weaker.** `design-config-is-content.md` §7.1 makes the point: the ledger now tells a user which of
their rules fall in the refused class, which is what the refusal always lacked.

---

## 6. Where this plan and the merged designs differ

**Three differences. None is a contradiction of fact; two are differences of order and price, and
one is a systemic hazard worth naming.**

### 6.1 The version key is not in the approved order, and `design-config-is-content.md` puts it first

`design-config-is-content.md` §7 orders: **step 1, the declaration carries a version (`h`)**; **step
2, the app fetches instead of baking (`½`)**. The approved order here starts with the un-bake and
prices it at **under an hour**, and names no version step.

**These are reconcilable and they are not identical.** The un-bake alone — replace the import with a
fetch — is an hour. The un-bake *with* an immutably cacheable version key, which is what makes the
round trip cost once per config change rather than once per load, is the half-day
`design-config-is-content.md` priced.

**The plan of record is the approved order.** The version key is not dropped; it is a distinct row
and it is filed as one. **[NEW]** Anyone implementing step 1 should read §7 step 2 of that document
before deciding how much to do in the hour.

### 6.2 This document prices step 2 above `design-the-rule-mirror.md`'s estimate

§11 row 6 of that document prices the mechanism at **under an hour**. §2 of this document prices the
step at **half a day**, and §2 states the reason: the mechanism is an hour and the register is the
rest. Recorded as a disagreement rather than resolved silently.

### 6.3 Two merged documents cite different line numbers for the same code, and neither is current

**This is the hazard, and it is worth more than either citation.**

* `design-config-is-content.md`, §"The example", step 5, cites **`app/index.html:2442-2444`**.
* `design-the-rule-mirror.md` §8.4 cites **`app/index.html:2035-2041, 2205-2206`**.

Both describe the same defect — an abstention and an all-is-well producing byte-identical output.

**Both were correct when written, and both are wrong now.** Verified: at `5bacf44`
(`design-config-is-content.md`'s base) `app/index.html:2442-2444` is exactly `membershipNoteFor`'s
abstention branch. At `a16fd1e` (`design-the-rule-mirror.md`'s base) `app/index.html:2035-2041` is
the same branch, and `:2205-2206` is the join in `commitLine`. At `2e9561a` the same code is at
**`app/index.html:3022-3024`** and the join is at **`app/index.html:3269-3270`**.

**[NEW] So the two documents do not disagree about the code. They disagree because a line number is
not a stable name for a line, and `app/index.html` moved 580 lines under both of them in three
days.** Anyone citing `app/index.html` should cite the function name alongside the line, because the
function name survives and the number does not. This document does that throughout.

---

## 7. What was verified for this document

**Every `file:line` below was opened at `2e9561a` and confirmed to say what the claim says.**

| claim | citation | verdict |
|---|---|---|
| the baked import | `app/present/embedded-declaration.ts:45` | **confirmed verbatim** |
| the declaration reaches no network | `app/index.html:1121-1122` | confirmed |
| membership abstention returns `""` | `app/index.html:3022-3024` | confirmed |
| membership confident-silence returns `""` | `app/index.html:3028` | confirmed |
| ordering abstention returns `""` | `app/index.html:3066-3068` | confirmed |
| the empty string is filtered out | `app/index.html:3269` | confirmed |
| the freshness line is written from the survivors | `app/index.html:3121` | confirmed |
| nine sections declare `ordering:`, 177 abstain | `app/index.html:3040` | confirmed |
| ordering refuses a nested section | `app/present/ordering.ts:280` | confirmed |
| the abstention citation in the brief | `app/index.html:2442-2444` | **stale — see §6.3** |

**Sizes on disk at `2e9561a`, for the record:** `presentation.json` is **138,878 bytes**;
`dist/present.js` is **264,403 bytes**. `design-config-is-content.md` records 138,806 and 257,317
respectively — both have grown since it was written, which strengthens rather than weakens its
argument.

---

## 8. What this document does not decide

Stated so the gaps are in the queue instead of in a conversation.

* **The register step 2 puts an abstention in.** §2 prices the choice and does not make it. A
  candidate exists — the held-edit strip is a precedent for a surface beside the freshness line —
  and it is not evaluated here.
* **The motion vocabulary in step 3.** Timing, easing and whether a correction is one motion or two
  are design decisions, not planning decisions.
* **Whether step 3's `½` — publishing the two capture rules — ships before or inside step 2.** They
  are independent. The order given is the safe one, not the only one.
* **The internal order of step 5.** `design-config-is-content.md` §7 steps 4–8 give a sequence; this
  document does not re-rank them.
* **Anything about the graph server.** `design-config-is-content.md` §7 step 7 is the only step
  needing a repository this one cannot change, and it is unchanged by this plan.

# Design: the compiler and the bands — pinning an architecture agreed in conversation, not yet written anywhere

**Status: design. This branch adds documents and backlog rows. It modifies no application source.**
**Branch:** `design/pin-the-compiler`, based on `origin/main` @ `18a9402`.

**What this document is not.** It does not re-derive the measurements in `design-config-is-content.md`,
`design-the-rule-mirror.md`, `roadmap-the-road-ahead.md`, `design-the-resolution-architecture.md` or
`research-the-resolution-universe.md`. Every number those five documents already hold is cited to
them, not repeated. Where this document adds a claim they do not carry — the compiler framing itself,
the operator-set finding, the mapping of measured facts onto three output shapes — it says so.

**Evidence rule, matching the corpus.** **[OBS]** a command run in this worktree, output read
directly, this session. **[REA]** reasoned from something labelled OBS. **[REPO]** a claim an
already-merged document makes, cited, not reproduced. **[NEW]** a claim this document adds that no
merged document carries. Every `file:line` citation in this document was opened at `18a9402` in this
worktree and confirmed to say what the claim says, with the enclosing function or constant named
alongside the line — `design-the-compiler-and-the-bands.md` does not repeat the mistake
`roadmap-the-road-ahead.md` §6.3 found in its two predecessors, where a bare line number stopped being
a stable name three days after it was written.

---

## 0. The pin, stated before the content — which axis this document moves

**Read this section first. It changes what a good deliverable is.**

This document is a **HORIZONTAL** and **TIME** pin. It is **not** a vertical one.

* **HORIZONTAL — moved.** "The system is a compiler" is a claim that homes eleven already-measured
  facts, scattered across five documents and one taxonomy, inside one named class: **source language
  → intermediate representation → three targets**, with a **closed operator set** as the thing that
  makes "general" checkable. §2 does that homing. §3 answers, from code, whether that class already
  has a single address — it does not, and that is this document's one new measurement.
* **TIME — moved.** §7 records an argument that was made and rejected in conversation today (frequency
  as the basis for the three bands) and why it was wrong, so the correction survives past the
  conversation that made it. §8 corrects this document's own brief against a merged document's own
  measurement, in public, rather than quietly adopting the brief's wording. Three backlog rows (§9)
  give the claim a queue address it did not have an hour ago.
* **VERTICAL — NOT moved, and stated plainly.** This document adds no code, changes no
  `enforcement_depth`, and proves no capability. Measured over the 121 capabilities in
  `apps/qntm-md/docs/architecture/capabilities.yaml` (the trunk clone, read-only, verified in §1.1):
  75 sit at depth 1, `horizontal_completeness.rooted` is `False` for 116 of 121, 67 are `thin`. **A
  document with no scenario behind it does not change one of those numbers.** Three of today's
  backlog rows are filed `unscoped` or `diagnose-ready` — queue position, not code. If this document
  is read as having closed the gap between "agreed in conversation" and "true of the running system,"
  that reading is wrong, and this section exists so nobody reaches it by skimming the paragraph below.

---

## 1. The answer, in one paragraph

**The system is a compiler, and the claim is sound, but it names a shape that has no single address in
the code today — that absence is this document's one finding that no merged document already states.**
The YAML is the source language; the flattened declaration (`presentation.json`, **161,073 bytes** at
`18a9402`, up from the 138,806 `design-config-is-content.md` measured and the 138,878
`roadmap-the-road-ahead.md` measured five and three days earlier respectively — the growth curve those
two documents named is still running) is the intermediate representation; the engine, the browser and
Obsidian's markdown are three targets sharing one semantics, compiled once. **Generality is real and it
is already load-bearing** — three independent readers on the browser side and three independent
generators on the compile side already refuse, by name, anything outside a closed `eq`/`not` predicate
grammar (§3.1) — **but the "operator set" the brief asks about is not a place. It is a property that
six independently-authored surfaces currently hold in agreement, proven by test, never by a shared
type.** That is not a defect this document is reporting as broken; every one of the six surfaces
refuses loudly and is proven against the engine (`tests/qualification-agreement.test.mjs`,
`scripts/resolution-agreement.py` and siblings — **[REPO]** `design-the-resolution-architecture.md`
§8.1–8.2). It is a finding about where the highest-leverage design surface in the system currently
lives: nowhere named, six places at once, held together by tests rather than by a declaration. The
three shapes — TABLE, EXPRESSION, PROGRAM — are a new name for a distinction `research-the-resolution-
universe.md` §6.2 and `roadmap-the-road-ahead.md` §4 already measured from two different directions
and never merged into one taxonomy (§4). The PROGRAM band's own execution model is not what this
document's brief described it as, and the correction matters (§8). The acceptance test — a config the
system has never seen, with nobody touching code — is agreed, is the point of all of it, and **is
unrun** (§6). Three backlog rows give all of this a queue address (§9). No application source changes.

---

## 2. The claim, grounded against the five documents

### 2.1 Source language → intermediate representation → three targets

**[REPO]** `design-config-is-content.md` "The answer, in one paragraph": the compile is `compile(files)
→ {declaration, dropped}`, already **92 % portable** JavaScript, timed at **0.27 s wall / 0.22 s CPU**
over the operator's real 276-file config. Three callers were named there — CLI, Worker, browser-
preview — and step 1 of that document's own sequence has since shipped: `b2a97af` (#70, *"the
declaration is fetched at run time, not baked into the bundle"*) deleted
`app/present/embedded-declaration.ts` outright. **[OBS]** `find app -iname "*embedded-declaration*"`
returns nothing. `app/index.html`'s `loadPresentation` (`app/index.html:1166-1187`) now fetches
`DECLARATION_URL = "/presentation.json"` (`app/index.html:1140`) with a 5-second timeout
(`app/index.html:1152`), and the block comment immediately above the constant
(`app/index.html:1124-1139`) states the seam this document's own compiler framing sits on:

> *"WHAT THIS DOES NOT YET REACH, STATED PLAINLY SO NOBODY READS MORE INTO IT. A config change still
> has to be compiled by this repo's three generators and published to this origin; what it no longer
> needs is `npm run build` and a re-committed bundle. The declaration coming from a SERVER that
> compiled it — config-as-content in full — is steps 3 and 4 of `design-config-is-content.md`, and
> this line is the seam they will land on: only the URL changes."*

**[REA] That comment is a merged design document citing itself, in running code, by filename, before
the step it names has landed.** It is the single clearest example of the time axis working the way
the operator's own method describes it — a small point, adopted, fleshed out, and now visibly load-
bearing for whoever reads the code next. The three targets are the engine (Python, reads the same
YAML directly), the browser (reads the compiled declaration, never the YAML — enforced by test,
**[OBS]** `tests/flow_scenarios/section_membership.ts:110-114,159-165` counts imports and fails if
`membership.ts` ever reaches the cascade or a write path), and Obsidian's markdown (the rendered
surface both the engine and, eventually, the browser must agree on — outside this document's scope,
named only so the third target is not silently dropped from the claim).

### 2.2 "A config the operator set cannot express must be refused loudly" — already the house rule, on the compile side

**[REPO/OBS]** This is not a design decision this document is proposing; it is already built, three
times over, and this document's contribution is naming it as one mechanism rather than three
coincidences. `design-the-rule-mirror.md` §8.4 states the acceptance test as three outcomes — picked
up, refused visibly, silently ignored — and names the third as the only failure. **[OBS] Verified
fixed at `18a9402`.** The historical silent-drop this document's brief and `design-the-rule-mirror.md`
§9.3 both name — a vocabulary token on a field outside `node_type`/`domain`/`status`, dropped with no
record — is closed. `scripts/generate-qualification-declaration.mjs:477-491`, inside the token loop,
now calls `ledger.drop(what, why)` instead of a bare `continue`, and the comment at that site
(`:477-483`) narrates its own history: *"DROP PATH 10 — THE ONE `design-the-rule-mirror.md` §9.3
names… 73 of his tokens… every one of them left this loop with no `refused` entry, no warning and no
exit code. Recorded now."* `scripts/ledger.mjs` (117 lines, unchanged in size since
`design-config-is-content.md` measured it) is the shared mechanism: `Ledger.drop`
(`ledger.mjs:58-69`) records to a sorted, diff-stable map (`toJSON`, `ledger.mjs:80-84`), printed to
stderr on every generate and compared byte-for-byte by `--check`. **[REA] So the refusal-as-product-
surface half of the brief's claim is not aspirational. It shipped on 2026-08-01, in `108fd82` (#54),
and the drop-path comment at `:477-483` is itself a piece of TIME-axis pinning this document did not
have to add — the code already cites the design document that found the defect.**

**One place it is not yet closed. [OBS]** `scripts/ledger.mjs`'s entry shape is still `Map<what,
why>` — a flat string-to-string record, `toJSON` at `ledger.mjs:80-84`. `design-config-is-content.md`
§5.3 proposed splitting a `dropped` row into two kinds — *"the app cannot, the engine can"* versus
*"neither can"* — and that split has not landed; there is no `kind` field anywhere in `Ledger`. This
is a real, small, already-filed gap (**[REPO]** that document's own step 6, priced at half a day,
needs step 4), not a new finding, and this document does not re-file it.

### 2.3 Three shapes from what an answer depends on — a new taxonomy over old measurements

**[NEW]** No merged document uses the words TABLE, EXPRESSION or PROGRAM for these three classes.
The classes themselves are not new — this document is naming a distinction two other documents each
measured from a different angle and never merged:

| this document's name | what it needs to evaluate | `research-the-resolution-universe.md` §6.2's name for the same thing | `roadmap-the-road-ahead.md` §4's band |
|---|---|---|---|
| **TABLE** — no dependency | nothing but which `(view, section)` the cursor is in | **EXACT** — defaults, registration, vocabulary, ordering, line grammar, day boundary | **Certain** |
| **EXPRESSION** — depends on the line in front of you | the line's own fields, resolved | **predicate EXACT, answer RUNTIME** — placement filter, domain filter | **Predicted** |
| **PROGRAM** — depends on other nodes changing | the whole graph, or a whole-graph aggregate, through a priority-ordered pass | **RUNTIME**, and **RUNTIME and worse** — rules, cascades | **Consequential** |

**[REA] The three columns were measured independently, by different documents, against different
gestures (a config-only sweep for the middle column, a tick/capture sweep for the roadmap's bands),
and they line up exactly.** That agreement is itself evidence the classification is a fact about the
system rather than an artefact of how one document chose to look at it. **What this document adds is
the compiler vocabulary — TABLE/EXPRESSION/PROGRAM — because it names the shape of the *artefact* the
compile emits (a lookup, a small tree, a flattened trigger/condition/effect record), where "Certain/
Predicted/Consequential" names the *browser's epistemic stance toward* that artefact (answer/believe/
refuse). They are the same partition seen from the compiler's side and the reader's side, and a reader
of all three documents should read them as one partition, not three.**

The size evidence for TABLE already exists and this document does not re-measure it: **[REPO]**
`research-the-resolution-universe.md` §6.1, **60,490 bytes for all 72 views, median 685 per view** —
eight of twelve config-resolution kinds, exact, no graph read. The size evidence for EXPRESSION is the
same document's placement-filter and domain-filter rows: **186 sections, 0 of 186 decidable without
reading a node's fields**, and **[REPO]** `design-the-resolution-architecture.md` §4.1: **103 of 186
sections' own defaults set a field their own qualification predicates on** — the reason RESOLVE must
run before EVALUATE, and the reason EXPRESSION genuinely needs the resolved line, not the raw one.

### 2.4 The reachability set is compilable — proven, not yet built

**The brief's claim is that "which rules could possibly fire… is static," and that this is what makes
the PROGRAM band affordable.** **[REPO]** That claim is proven, twice, by research rigs that are not
part of the shipped compiler:

* `design-the-rule-mirror.md` §3.2: a capture reaches **2 of 94 rules**, swept exhaustively over all
  186 sections, zero collateral.
* `research-the-resolution-universe.md` §3.4: a tick reaches **29 of 94 rules**, swept exhaustively
  over 652 gestures across five views — up from a 12-node-per-view sample's 21, a correction that
  document's own §3.2 traces to sample size, not to a definitional gap.

**[REA] So the reachability set is not a hopeful claim — it has been computed, exhaustively, twice, for
two different gestures. What has not happened is turning either sweep into a compiled artefact the
generators ship.** Both are one-off Python rigs (`sweep.py`, described in `design-the-rule-mirror.md`
§11's reproduction block; a second sweep described in `research-the-resolution-universe.md`'s §10) run
once against a copy of the operator's database and never wired into `scripts/generate-resolution-
declaration.mjs` or any `--check` gate. **This is the gap between "the reachability set is compilable"
(true, proven) and "the reachability set is compiled" (not true, no code path produces it today).**
§9 files this as a backlog row rather than leaving it implied.

Cascade depth is the same story with a sharper edge. **[REPO]** `research-the-resolution-universe.md`
§4.12 and §5.2: the unlock cascade is **six rules at one priority band, sequenced by file position**,
and that document's own words are the ones to keep: *"the real ceiling on cascade depth is the number
of rules in a file, and it is a number no config validator checks."* **[REA] So the compiler CAN bound
cascade depth statically — the file is right there, the sort is stable, the count is six — but nothing
today reads the file and asserts the bound. "Discover it is unbounded and say so at compile time" is
therefore not the risk; the risk this document actually finds is a bound that exists, is readable, and
is never read.**

### 2.5 The real limits — grounded, and the sharpest is not the one the brief leads with

**Allocation, not computation — [REPO], and it dissolves further than the brief states.**
`design-the-rule-mirror.md` §5.1: `next_qntm_id` is `max(qntm_id) + 1` over the whole graph
(`identity/mint.py:39-57`), computable in the browser today with three lines of JavaScript, currently
**2352**. The document's own conclusion is sharper than "genuine, absolute, small": *"The id is not
the thing the mirror cannot do. It is the thing the mirror does not have to do"* — because rungs 1 and
2 (registration, defaults) are statements about what KIND of thing a line is, and neither needs the
line to have a name yet. **[REA] So the allocation limit is real but it gates naming, not the two
cheapest kinds of resolution in the whole taxonomy — worth stating precisely rather than leaving it as
an undifferentiated "genuine, absolute, small."**

**Latency budget, not computation — [REPO], grounded and unresolved.**
`design-config-is-content.md` §10 leaves this **[UNVERIFIED]**, explicitly: 0.22 s CPU on the
operator's 276-file config sits inside a paid Worker's budget with room to spare, and the qualification
generator's normalisation and the resolution generator's 43-rule-file read are **not measured as
linear**. §5's Risk 2 (this document's own §7) is the reason that number cannot be assumed to scale:
every closure number in the corpus is a floor over one config.

**Expressibility — [REPO], and this is the one this document can ground furthest, because §3 answers
where the operator set actually lives.** The two syntactic and semantic refusal surfaces this document
found (§3.1) are the concrete form of "extend the set": widening what compiles is, today, six separate
edits to six separate files, each with its own test, none importing from a shared enumeration.

---

## 3. Where the operator set actually lives today — from the code, not from this brief

**Answer, in one sentence: it is implicit, and it is not implicit in one place — it is scattered
across six independently-maintained surfaces that agree by test, not by a shared type.** This is the
finding the brief asked for by name, and it is the one genuinely new measurement in this document.

### 3.1 Six surfaces, none importing from a common enumeration

**[OBS] Verified directly in this worktree at `18a9402`, not taken from a report.**

| surface | what it closes | citation |
|---|---|---|
| the MEMBERSHIP predicate grammar (browser) | `FieldPredicate = {eq} \| {not}` | `app/present/qualification.ts:69`, enforced by `readPredicate` (`:198-222`), refusal text at `:221`: `` `'${path}' uses operator '${keys[0]}' — the operators are eq, not` `` |
| the MEMBERSHIP predicate grammar (compiler) | the same two operators, re-derived independently | `scripts/generate-qualification-declaration.mjs:normalisePredicate:205-226` |
| the RESOLVABLE fields a line's own tokens may set | `["node_type", "domain", "status"]` | `scripts/generate-qualification-declaration.mjs:96` |
| the STRUCTURAL edge vocabulary (browser) | `EdgeSource = "self" \| "position"`, `EdgeDirection = "incoming" \| "outgoing"` | `app/present/structural.ts:77`, `:80`, keyed at `:118` |
| the RESOLUTION table vocabulary (browser) | `OrderingFieldKind = "date" \| "int" \| "float"`, `ChromeShape = "checkbox" \| "plain_line"` | `app/present/resolutiontable.ts:119`, `:135`, keyed at `:204` |
| the RENDITION vocabulary (browser) | `RESOLUTION_KEYS`, closed to output facts only | `app/present/resolution.ts:96` |
| the YAML SYNTAX subset the parser accepts | tabs, anchors/aliases, block scalars, `---`, merge keys, explicit keys all THROW | `scripts/yaml-subset.mjs:18-21` |

**[REA] Two things to hold about that table, and neither is a criticism of the code.** First, the
browser's own coordinator names the fragmentation in its own header, unprompted:
`app/present/declaration.ts:32-54` states *"one served document, four strict readers, each owning one
axis and none of the other three's keys"* — the architecture is federated **by design**, so that no
reader can silently answer a question that belongs to another axis. Second, `qualification.ts:69`'s
own comment states exactly why the grammar is closed to `eq`/`not` and not wider: *"The orderable
comparisons exist in the engine and are deliberately NOT here… admitting the operator would only widen
this type without widening what can be answered."* **That sentence is the operator-set discipline the
brief describes, already written into the type it constrains — it is just not written into one type
that governs all six surfaces.**

**[REA] The syntax refusal list and the predicate refusal list are drawn from two independent design
decisions, and this document checked rather than assumed they line up.** `yaml-subset.mjs`'s refusals
(tabs, anchors, block scalars…) govern what YAML can be *read at all*; `qualification.ts`'s `eq`/`not`
closure governs what a *parsed* predicate can *mean*. **They share zero vocabulary items.** A config
author who writes a block scalar meets one refusal surface; one who writes `gte` meets a different
one, in a different file, with a different message. Both are honest and both are tested (`§2.2`
above), but nothing today asserts that widening one without the other stays coherent — because nothing
is the operator set's single address to widen.

### 3.2 What the closest thing to a manifest actually is, and why it is not one

**[OBS]** `presentation.json`'s top-level keys — `checkbox, heading, indentUnit, note, prose,
qualification, resolution, stamp, structural, tags` — are the nearest thing to a table of contents for
the whole grammar, and even that is an artefact assembled from four independently-authored strict
readers (`declaration.ts`, `qualification.ts`, `structural.ts`, `resolutiontable.ts`), none of which
imports a shared list of what "the operator set" contains. `RESOLVABLE_FIELDS`
(`generate-qualification-declaration.mjs:96`) is the single closest thing to a real enumeration in the
whole codebase, and it closes exactly one axis (which node fields a typed token may set) — it is
exported from a `.mjs` Node script and is structurally unreachable from the browser's TypeScript at
compile time, so even that one list cannot be the operator set's address.

**[REA] This is the sentence the brief asked this document to find, stated plainly: there is no single
place that enumerates what config can express. It is implicit, correct by convergent design and by
test, and addressable only by reading six files and confirming they still agree — which is exactly the
condition `design-the-resolution-architecture.md` §2.3 already named for the resolution cascade itself
(*"twelve resolvers would put twelve copies of the walk in the codebase"*) and refused to build. The
operator set has the same shape as the cascade did before that document's L4 layer named it: real,
correct, tested, and not yet a place.** Naming it does not mean collapsing six typed grammars into one
untyped union — `qualification.ts:60-68`'s own argument against widening its own type is a reason to
keep the axes separate. It means a single index that says which six files together constitute "the
operator set," so a widening decision is made once, against a visible list, rather than independently
in six pull requests that happen to agree.

---

## 4. The three bands are not about frequency, and that correction is on record now for the first time

**[NEW, reconstructed from the brief this document was given, because no merged document records it
as a rejected argument — that is precisely the gap in the time axis this section closes.**

The brief states: *"An earlier framing argued from the frequency of things in his config; the operator
rejected it and he was right."* This document did not witness that conversation and cannot cite a
transcript. What it can do, honestly, is two things: state the shape of the rejected argument as the
brief describes it, and show that the shipped roadmap document already reflects the correction without
ever writing down what it corrected.

**The rejected shape, reconstructed.** A frequency-based framing would sort resolution kinds by how
common they are in the operator's instance — placement filters (186 sections) and defaults (153
sections) would sit near the top because they are large by count; rules (94, and only 2–29 reachable
per gesture, **[REPO]** `design-the-rule-mirror.md` §0, `research-the-resolution-universe.md` §3.4)
would sit near the bottom because they are rare by reach. **[REA] The flaw is structural, not
statistical: frequency is a fact about one operator's instance, and a dependency shape is a fact about
the resolution kind itself.** A rule with zero graph dependency — none exist among the 94 today, but
none is required not to — would be Certain no matter how rarely it is declared. A common default that
happened to be re-derived by a traversal would be Consequential no matter how many sections used it.
**Sorting the bands by count would make the design correct for this operator's config and wrong for
the next one — exactly the failure `roadmap-the-road-ahead.md` §5 Risk 2 names for every other number
in the corpus: "every closure number in this repository is a floor… not bounds."**

**[REPO] The shipped correction, already in place.** `roadmap-the-road-ahead.md` §4 defines the three
bands entirely by dependency — *"an answer belongs to exactly one band, and the band decides whether
the browser may speak"* — and never once ranks a band by how common its underlying config is. The
Certain band's own count (153 of 186 for defaults, 173 of 186 for registration) is reported as a
measurement, not as the reason the band exists. **[REA] So the correction this document is asked to
record is not a correction the roadmap document still needs — it already made it. What was missing,
until this section, is the record of the argument that was tried and set aside, which is the one thing
a merged document cannot retroactively contain once it ships only the corrected version.** That is the
whole value of writing this section down: not to change the roadmap's bands, but to stop the rejected
argument from being re-proposed by someone who only reads the final shape and reasonably assumes
frequency was never considered.

---

## 5. The PROGRAM band's execution — a correction to this document's own brief

**[REPO — and this is the sharpest correction this document makes, including of itself.]** The brief
states: *"The program flattens completely at compile time. The execution does not — it is a loop to a
fixpoint over the graph."* **That second sentence is not what the engine does, and a merged document
already measured the actual shape twice.**

`design-local-behaviour-and-the-queue.md` §0.6:

> *"The rules phase is one priority-ordered pass with no fixpoint loop"*
> (`core/rule-engine/src/qntm_rule_engine/executor/core.py:48-86` sorts by priority, `:763-808` runs a
> single `for rule in selected:`). *"Cascading is achieved by ordering over shared mutable graph
> state, not by iteration."*

`research-the-resolution-universe.md` §5.2, independently, over a different gesture:

> *"The rules phase is one priority-ordered pass with no fixpoint loop… His config uses ten distinct
> priorities… So a chain can have at most ten links, and it is bounded by his own declaration rather
> than by the graph."*

**[REA] Both documents converge on the same shape from different gestures, and it is a stronger design
fact than "a loop to a fixpoint," not a weaker one.** A true fixpoint loop terminates when no rule
fires on a pass, which is unbounded in principle and needs a separate proof of termination. **A single
priority-ordered pass over a fixed 94-rule set has a hard, syntactic bound — at most 94 rule
evaluations — before any measurement is taken, and the measured depth is far smaller: 2 for a capture
(`design-the-rule-mirror.md` §6), a ceiling of 6 for the unlock cascade inside one priority band
(`research-the-resolution-universe.md` §4.12), 4 as "the honest cut" for a tick
(`research-the-rule-closure.md` §5.1, cited via `design-the-rule-mirror.md` §6).** The "no config
validator checks it" finding (§2.4 above) is real, but the thing left unchecked is a **file's line
order inside one priority band**, which is a static property of two YAML files sitting next to each
other on disk — not a property of a running iteration that might not converge. **The correction makes
the brief's own case stronger: the PROGRAM band's execution is not merely boundable in principle, it
is bounded by construction, by a single sorted pass over a config the compiler already reads. The
words "loop to a fixpoint" describe a harder problem than the one that actually exists, and should not
be repeated in whatever document follows this one.**

---

## 6. The acceptance test — agreed, and unrun

**Write a config the system has never seen, and the browser behaves correctly with nobody touching
code. Not the operator's config — a new one.** This is the operator's own acceptance test, and it is
the test every rung, every generator's `--check`, and every agreement script in the corpus (`scripts/
qualification-agreement.py`, `scripts/resolution-agreement.py`, `scripts/day-boundary-agreement.py`)
implicitly stands in for, without any of them being what the test actually asks.

**[OBS] Checked directly: nobody has run it.** Every agreement test in the corpus runs against the
operator's own real config (**[REPO]** `design-the-rule-mirror.md` §9.4: *"the staleness tests… self-
skip precisely in CI, because CI does not clone the monorepo"* — so even the tests that exist run on
his laptop, against his instance, or not at all). `research-the-resolution-universe.md` §4.13 and §9.4
name a fixture-based sandbox (`qntm-md sandbox-from-real`) as the settling mechanism for several
**[UNVERIFIED]** items, and none of those sandbox runs has happened either — each is filed as
**[UNVERIFIED], settled by** a specific experiment nobody has performed. **[REA] So the acceptance
test is not merely unrun as a formality; every piece of infrastructure that could run it — a synthetic
config, a sandbox bundle, a fixture the CI clones instead of the operator's monorepo — is itself either
absent or, per `design-the-rule-mirror.md` §8.7, present but demonstrably too thin: the committed CI
fixture "has no `rules/` directory," so the rule-reading half of the resolution generator is "never
exercised in CI at all."**

**This document does not run it either**, per the branch's own constraint — no cycle, no sandbox
build, no application source. §9 files it as a backlog row, `unscoped`, because deciding what the
never-seen config should contain (enough to exercise all twelve resolution kinds, per `research-the-
resolution-universe.md` §4, without duplicating the operator's own instance) is a design pass, not a
row — the same judgement `config-is-per-user-not-per-server` already carries in the existing backlog
for the same reason.

---

## 7. Risk carried forward from the roadmap, restated only to the extent it governs this document

**[REPO]** `roadmap-the-road-ahead.md` §5 Risk 2 governs every number in §2–§4 above without exception:
*"every closure number in this repository is a floor. Sampling can only undercount."* This document
adds nothing to that risk and does not re-derive it; it is cited here only because §2.4's reachability
claim and §4's band definitions both rest on it directly, and a reader arriving at this document
without the roadmap in hand should not read either section as a bound.

---

## 8. What I refuted, including the brief I was given

1. **"The execution loops to a fixpoint over the graph."** **Refuted, §5.** It is a single priority-
   ordered pass with no fixpoint loop, measured twice, independently, in two merged documents. The
   correction makes the compilability claim stronger, not weaker: a sorted pass over a fixed rule set
   has a hard bound before any measurement; a fixpoint loop needs its own termination proof.
2. **"The reachability set is compilable, and that is what makes the program band affordable."**
   **Upheld as a fact, corrected as a claim about the shipped system.** It has been proven computable,
   exhaustively, twice (§2.4). It has not been compiled — no generator emits it, no `--check` gate
   asserts it. The affordability is real and unbuilt, not real and shipped.
3. **My own first reading of "genuine, absolute, small" for the allocation limit.** `design-the-rule-
   mirror.md` §5.1 says something sharper than that phrase: the id is not merely a small cost, it is a
   cost the two cheapest resolution kinds never incur, because neither needs the line to have a name
   yet (§2.5).
4. **The implied premise that "the operator set" is a gap this document should propose filling.**
   **Half-refuted.** It is a real gap — no single address exists (§3) — but the six surfaces that
   stand in for it today are not a mess to be cleaned up; they are a federated architecture stated as
   deliberate in `declaration.ts:32-54`'s own header, for a reason (`qualification.ts:69`'s own
   comment) that argues against a wider, shared type. The fix this document recommends (§9) is an
   index over the six, not a merge of the six.

---

## 9. Backlog rows filed

Three rows, filed in `docs/implementation-artifacts/backlog.yaml` on this branch. Validated: the file
parses (`yaml.safe_load`), and the 89 pre-existing rows survive byte-identical — verified by diffing
the file's first 3,231 lines against the pre-branch copy after the three new rows were appended.

| id | kind | state | what it is |
|---|---|---|---|
| `the-operator-set-has-no-single-address` | capability | unscoped | §3's finding — an index over the six surfaces, not a merge of them; scoping which surfaces belong on the list is a design pass |
| `the-reachability-set-is-proven-not-compiled` | capability | diagnose-ready | §2.4 — turn `design-the-rule-mirror.md`'s and `research-the-resolution-universe.md`'s one-off sweeps into a generator output with a `--check` gate |
| `a-never-seen-config-passes-the-acceptance-test` | capability | unscoped | §6 — the operator's own acceptance test; unscoped because the synthetic config's contents are a design decision, and running it needs a sandbox this branch cannot touch |

---

## 10. What is unverified

* **[UNVERIFIED]** Whether the six surfaces in §3.1 are the complete list. This document found them by
  reading the four strict readers' own headers and the three generators' shared imports; a seventh
  surface could exist unread. **Settled by** the same enumeration discipline `research-the-resolution-
  universe.md` §6.3 used for `graphData`: grep every occurrence of a closed-union type export under
  `app/present/` and `scripts/`, not just the ones this document happened to open.
* **[UNVERIFIED]** Whether a `--check` gate for the reachability sweep (§2.4, backlog row 2) is
  half a day or an arc. Neither merged document prices turning a research rig into a shipped generator
  output; `design-the-rule-mirror.md` §11 row 5 prices the capture-only agreement test at `h`, which is
  a lower bound for the wider claim, not an estimate of it.
* **[UNVERIFIED]** Whether Obsidian's markdown, named as the third target in §2.1, needs anything from
  this document's claim that it does not already have. Out of scope for this pass; named so the claim
  is not silently narrowed to two targets.

---

## 11. Reproduction

```
# every citation in §2–§3 was opened and read in this worktree at 18a9402:
git rev-parse HEAD                                          # 18a940270367f2518d69cc9590b8a6e8a812a502
wc -c presentation.json                                     # 161073
find app -iname "*embedded-declaration*"                    # (nothing — deleted in b2a97af)
grep -n "loadPresentation\|DECLARATION_URL\|DECLARATION_TIMEOUT_MS" app/index.html
grep -n "export type FieldPredicate\|QUALIFICATION_KEY" app/present/qualification.ts
grep -n "^function normalisePredicate\|RESOLVABLE_FIELDS =" scripts/generate-qualification-declaration.mjs
grep -n "export const STRUCTURAL_KEY\|export type EdgeSource\|export type EdgeDirection" app/present/structural.ts
grep -n "export const RESOLUTION_TABLE_KEY\|export type OrderingFieldKind\|export type ChromeShape" app/present/resolutiontable.ts
grep -n "export const RESOLUTION_KEYS" app/present/resolution.ts
grep -n "^export function readDeclaration" app/present/declaration.ts
sed -n '470,491p' scripts/generate-qualification-declaration.mjs   # drop path 10, ledger.drop call
grep -n "config" worker/src/*.js worker/wrangler.toml               # 5 hits, none a route
grep -n "const routes" -A8 worker/src/auth.js
grep -n "operatorRoutes\s*=\|sessionRoutes\s*=" -A8 worker/src/app.js

# the capabilities.yaml stats cited in §0, read read-only from the trunk clone, never written:
python3 -c "
import yaml
d = yaml.safe_load(open('/Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/docs/architecture/capabilities.yaml'))
caps = d['capabilities']
print(len(caps))                                             # 121
print(sum(1 for c in caps if c.get('enforcement_depth')==1))  # 75
print(sum(1 for c in caps if c.get('confidence')=='thin'))    # 67
print(sum(1 for c in caps if isinstance(c.get('horizontal_completeness'), dict)
          and c['horizontal_completeness'].get('rooted') is False))  # 116
"

# NOT RUN, deliberately: no cycle, no graph-sync, no `map . --full`, no POST to any server,
# no git stash, no merge. ~/qntm and ~/.qntm-md were never opened. The trunk clone at
# /Users/lukeannison/projects/qntm-network/qntm was read only, via absolute paths, never
# written and never `cd`-ed into.
```

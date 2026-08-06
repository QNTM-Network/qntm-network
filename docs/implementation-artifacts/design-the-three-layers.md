# Design: the three layers — the graph, resolution, and presentation, pinned as the target every later decision is judged against

**2026-08-06, later the same day — extended and corrected, not rewritten.** PR #133 pinned this
document against `4ce2c4f`. A day of building against that pin (PRs #128–#137 in this repo, #69/
#71/#72 in the monorepo) refined parts of it and corrected others. §0.1–§0.3, §2.1, §3.4–§3.6, §4.1,
and the new §8a/§16/§17 below are additions or corrections made this pass; everything else is the
original pin, unchanged. Where a correction touches a numbered claim from the original pin, the
original text stays in place with a note pointing at the correction — per this document's own §10
rule, applied to itself.

**Status: design. No application source is modified on this branch. This document, its four
superseding pointers, two `docs/architecture/*.yaml` additions and a set of backlog rows are the
whole of it.**

**Branch:** `design/the-three-layers`, based on `origin/main` @ `4ce2c4f` of `QNTM-Network/qntm-network`.
(This pass runs from `design/the-graph-is-truth`, based on `main` @ `e0ad8a9` — the tip after all
thirteen of today's merges. See §16.)

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

**A check on the first principle itself, run this pass.** "The graph is the source of truth" is
correct and stays. In conversation, not in this document, markdown was repeatedly called the
source of truth instead — wrong each time. `rg -an "markdown is (the|a) source of truth" -i` **[OBS,
this pass]** against this document returns nothing; the error did not leak into the prose here. It
did leak into an earlier engine-side document and was already caught there: monorepo PR #55
(`docs(qntm-md): the markdown is authoritative for the CHANGE and derived for the STATE, so the
file stops being readable as the store`, merged 2026-07-31) **[OBS, this pass, `gh pr view 55
--repo QNTM-Network/qntm`]** — a title that is this document's own §0.1 below, arrived at
independently, five days earlier, on the engine side. §0.1 restates it here, with the mechanism.

### 0.1 Time is a source of change with no author, and that settles the store question

**The operator's own argument.** A due date passes at midnight. No file is opened, no line is
typed, nothing is committed — and a row that was in "upcoming" is now in "overdue." Its VIEW
membership changed. **Truth changed and no markdown changed.** A store cannot be a document nobody
touched.

**Verified against the actual mechanism, not asserted.** `$cycle_today`/`$cycle_week_end`
comparisons (`due-today`, `overdue`, `available-this-week`, …) are resolved LIVE, per read, from
`app/present/today.ts`'s `todayFor`, against the day boundary already published in the
declaration — never baked into a static predicate at generation time (`compile-qualification.mjs`'s
own §"Cycle variable" account, PR #137, cited in full at §3.5 below). The clock crossing a boundary
is exactly a change with no author and no edit — it is real input to the resolver, and it is not a
line anyone typed.

**So the sources of change are plural, and markdown is one of four, not the one:**

1. **The operator editing markdown** — typing a token, a title, a line.
2. **The operator moving a row** — a placement act (§3.6 asks whether the engine currently honours
   this as input on the same footing as (1)).
3. **The engine's own rules** — a `set_field`/retype/reset firing on a schedule the operator did not
   individually author (`stamp_completed_at.yaml`, `routine_complete_reset.yaml`, …).
4. **The clock** — a day boundary crossing, changing which predicates are true with nothing written
   anywhere.

**Markdown is an input channel and an output surface. It is not the store.** §9's "Markdown is the
human edge, not the wire" already said this about the WIRE; this section says it about STORAGE,
which is the stronger and prior claim — the graph (§2) is what persists across all four, markdown is
what channel (1) is authored through and what all four are rendered back into for the operator to
read.

### 0.2 Cross-check against §9's existing wording

§9 already contains "Markdown is the human edge, not the wire" and nothing in this document's
original text calls markdown a store. The error the operator corrected in conversation did not
require a correction here; §0.1 exists to make the argument explicit (the clock as an unauthored
source of change) rather than to fix a defect in the original pin.

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

**This pass's own axis answer is identical, stated so it is not assumed rather than checked.**
Today's thirteen merges (§16) genuinely moved VERTICAL and HORIZONTAL for OTHER capabilities in this
repo — PR #134 homed three verbs as directories (HORIZONTAL), PR #135/#137 moved real
`enforcement_depth`-shaped facts for the resolvability mechanism (VERTICAL, checked and tested, not
this document's four `undeclared` rows). **None of that moves THIS document's own four
`status: undeclared` capabilities** (§11) — they remain undeclared after this pass, because this
pass adds documentation and backlog rows, not code, exactly as before. §17 states the same thing
about the five enforcement candidates: none is built, so none moves VERTICAL either, regardless of
how precisely each is designed.

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

### 2.1 Seeding refusals are a safeguard, not a gap — corrected count, 74 not 91

`scripts/compile-resolution.mjs`'s DROP PATH 21 refuses to seed a token for a declared SECTION
DEFAULT that no vocabulary tag spells (a `defaults: {stage: diagnose_ready}` with no glyph anywhere
in `vocabulary/` for `stage=diagnose_ready`). The refusal's own comment states the reason precisely:
*"the engine does not print it either, so seeding one would invent a spelling and freeze a value
the engine goes on deciding"* (`scripts/compile-resolution.mjs:285-287`) — this is DROP PATH 21's
sibling, DROP PATH 20, refusing the same way for a node TYPE no tag spells.

**This was read as a backlog of 91 unmet obligations and corrected before this document repeated
that.** **[OBS, this pass]** Regenerated `presentation.json`'s `resolution` key against the real
monorepo config (`node scripts/generate-resolution-declaration.mjs`, output byte-identical to what
was already committed — confirmed via `diff`) and counted the ledger's own drop messages directly:
**74** entries match `no vocabulary tag spells <field>=<value>` (DROP PATH 21), out of **103** total
`resolution.dropped` entries. **91 does not match anything measured this pass and is not repeated as
fact.**

**Why these 74 are a safeguard, not work to be done.** Each is a section declaring a default the
operator's own vocabulary never chose to spell — `stage=diagnose_ready`, `project=flow-trace`, and
their siblings across the `backlog`/`flowtrace-*` views. Minting a token for one would require this
generator to INVENT a glyph the operator never picked, and freeze it — the exact mistake the
"seeding" mechanism (`app/present/newline.ts`) exists to avoid making silently. **Nobody should
chase these to zero.** The correct response to one appearing is "does the operator want a token for
this field," never "the generator is behind." §2.1 records this precisely so a future pass does not
misread the ledger as backlog a second time, exactly as this pass corrected a first misreading.

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

### 3.4 Three languages set a value, and none is privileged

**The operator's own words: "token isn't a special class that dominates the others."** A field's
value can be set by any of three languages a config may grant it, and a field is settable by
whichever the config gives it — some by only one:

* **LEXICAL** — a token in the LINE (`#task`, a checkbox glyph). §3's cascade names this level
  `LINE`.
* **STRUCTURAL** — placement: which section, which view, which parent. Named `STRUCTURAL_NODE` and
  `VIEW` in the same cascade (`levels.py:20-21`, `:16-19`).
* **DERIVED** — the engine computing it from other values or the graph (a rule's `set_field`, an
  aggregate).

`stage` and `project` are STRUCTURAL-only in the operator's real config — no vocabulary tag spells
either, so LEXICAL cannot set them; only a section's own `defaults:` can (`compile-qualification.mjs`
rule (a), verified §3.5). `done_task_count` is DERIVED-only — `render_only: true` in
`markers.yaml`, the engine's own output, never read back on ingest. Neither is a special case; both
are the same rule (§3.5's rule) answering "no" for a different reason.

### 3.5 The codebase has been progressively de-privileging tokens all day

**Verified against the compiler's own history, read in order, not asserted.** The field-resolvability
check that decides which patterns the browser may evaluate has widened through four rungs today,
each one closing a gap the previous rung's own header names as deliberately left open:

1. **Token-only, frozen.** Before today: `RESOLVABLE_FIELDS = ["node_type", "domain", "status"]`,
   hand-picked once (`app/present/select/membership.ts:114`, matching `origin/main`'s frozen three,
   **[OBS]**). LEXICAL only, and only three fields of it.
2. **Token-only, measured (PR #132).** `deriveResolvableFields` replaces the frozen three with a
   pure function of the real config — still LEXICAL-only (a token spells it, or it is `node_type`/
   `title`), but now **18** fields, computed fresh from whatever vocabulary the operator's own
   config declares, not hand-picked once. `project`/`stage` still refused — no token spells either.
3. **A structural rung (PR #135).** `deriveStructuralFieldsByQualification` adds the SECTION
   language: a pattern referencing a STRUCTURAL-only field is admitted where **every** site
   referencing it fixes that field via `defaults:` — the intersection across sites, never the union,
   so a future section that omits the default can only narrow admission, never silently widen it
   past what every site can answer (`compile-qualification.mjs:397-412`, **[OBS, this pass]**).
   **This closed `project` completely** — verified this pass by regenerating the qualification
   declaration against the real config and grepping its drop ledger: **zero** `unresolvable
   field(s)... project` refusals remain (`grep -c "unresolvable field(s)" ... | grep project`,
   **[OBS, this pass]**, output `0`). §8's original text below, which still says "`project` stays
   refused," is now out of date by one merge and is corrected at §8a rather than silently edited.
4. **An extraction-hint rung (PR #137), the code's own "fourth rung."** `deriveExtractionHintFields`
   adds fields spelled by a glyph followed by a VARYING trailing value (`due_date`'s 🛫, never a
   fixed enum a token table can hold) — a third distinct kind of "no," found while closing the
   remaining 14 refusals, not assumed (PR #137's own body: *"a rung answers a different value every
   time, which this compiler's fixed-token model cannot represent at all"*). **Named "the fourth
   rung" in the code's own comments though it is the third rung ADDED** — worth flagging exactly
   because it could look like an error otherwise: `compile-qualification.mjs`'s own header (line
   140) calls `deriveStructuralFieldsByQualification` "the second rung," and line 789 calls
   extraction-hint "THE FOURTH RUNG." No third rung is named anywhere in the code. This is almost
   certainly a rung reserved and left unbuilt (VIEW/GLOBAL `auto_tag:` admission, named explicitly
   as "a real next rung, left unbuilt and named, not built halfway" at `compile-qualification.mjs:
   393-394`) rather than a miscount — but this document does not resolve the discrepancy for the
   code, only records it as found, since resolving it would mean editing `scripts/`, which this
   branch may not touch.

**No field name is privileged by which language sets it.** `RESOLVABLE_FIELDS` (LEXICAL, the
line-token decode list `resolveLineFields` uses) and the structural/extraction-hint rungs (which
widen the COMPILER's admission gate, never that decode list) are two different mechanisms answering
the same question — "can a pattern referencing this field be evaluated" — for two different
languages, unioned at `compile()`'s assemble step (`compile-qualification.mjs:1100-1101`,
**[OBS]**: *"LEXICAL (line-rung, works anywhere) UNION EXTRACTION-HINT (line-rung, a varying
trailing value) UNION STRUCTURAL (section-rung, only where every [referencing site fixes it])"*).

### 3.6 Does placement beat derivation? — INPUT WINS, investigated

**This is the single most valuable finding in this pass, and it does not resolve to a flat yes or
no — the honest answer is bounded, and the boundary is the finding.**

**The operator's worry, stated precisely.** `INPUT WINS` (the phrase this codebase actually uses,
e.g. `stamp_completed_at.yaml:2`) names a narrow, specific case: a rule fills a gap only when a
field is `null`, so the operator's own typed value is never clobbered. The worry is that this
protects TOKENS but not PLACEMENT — moving a row is as much an authored act as typing is, and if the
cascade only recognises the LINE's tokens as "input that wins," a derivation keyed off a field the
row's OLD, stale token still spells could silently override the placement the operator just made:
he moves a row and watches it move back.

**What the cascade actually says, read at the source, not inferred.**
`apps/qntm-md/src/qntm_md/resolution/levels.py:5,20-28` (the monorepo, read-only) — the cascade,
least-specific first:

```
GLOBAL  ->  VIEW  ->  STRUCTURAL_NODE  ->  SUBTREE  ->  LINE
```

with each level's own docstring, verbatim: `STRUCTURAL_NODE` — *"a `sections:` entry — an inclusion
of nodes, and its header node"* — **this is placement, named exactly**. `LINE` — *"the tokens the
operator actually typed. **Always wins.**"* **[OBS]**, the module's own word, unhedged. So yes: **as
literally implemented, a token on the LINE outranks a placement fact at STRUCTURAL_NODE.** The
worry's mechanism is real and is not a misreading of the code.

**Is it a live defect? Bounded by MINT vs. NODE, and the code has already answered half of this
question itself.**

1. **At MINT time — a brand-new line, first typed — LINE-beats-STRUCTURAL_NODE is correct BY DESIGN
   and has already been verified as working as intended, not guessed at.** PR #135's own acceptance
   test built the operator's exact scenario: a field set BOTH ways (a token `#flagged` AND two
   sections' own `defaults:`), a line typed under the section whose default disagrees with the
   token. Read through the real, shipped `resolveLineFields`/`membershipFor`
   (`app/present/select/membership.ts:394-410`, **[OBS, this pass]** — the comment at :398-400:
   *"A token that sets a field the SECTION also set overrides it"*): **the token wins, and this is
   the RIGHT answer for a line being typed** — an explicit, freshly-typed token IS the more-authored
   fact than an ambient section default at that moment. This is not the defect the worry describes.
2. **At NODE time — an EXISTING, already-minted node — the same rule is explicitly documented as
   UNSOUND, and this class of bug has already happened once.** `levels.py`'s own docstring:
   *"A node belongs to N views, so a VIEW-level or STRUCTURAL_NODE-level declaration is sound where
   its subject is the LINE and unsound where its subject is the NODE. Mint is a line event; re-type,
   revert, delete and render are node events."* **[OBS]** The precedent is named in the same file:
   *"widening [the revert target] produced an observed production race (2026-07-27, routine->task->
   routine in one cycle)"* — a node's classification fought between two candidates within one
   cycle and visibly flipped back. `apps/qntm-md/src/qntm_md/resolution/registration.py:39-51`
   **[OBS, this pass]** names the fix: `BASE_NODE_TYPE` (the revert target, a NODE-subject fact) was
   made **GLOBAL-only, forever** — `LEVELS_FOR[BASE_NODE_TYPE] = (GLOBAL,)`, deliberately excluding
   STRUCTURAL_NODE and VIEW so no per-section or per-view candidate can fight another within a
   cycle.

**The fix that closed the 2026-07-27 race is narrow, and it does not cover the general case.**
`registration.py:89-109` **[OBS, this pass]**: `DEFAULT_FIELDS` and `DEFAULT_TAGS` — the keys that
govern ordinary fields set via a section's `defaults:`, exactly the mechanism `stage`/`project`
ride on — are STILL scoped to `(GLOBAL, VIEW, STRUCTURAL_NODE)`, unchanged. **The same class of race
that hit node TYPE once is structurally still possible for ordinary FIELDS, if anything re-runs
MINT-time field resolution against an already-existing node's stale line.**

**Whether the browser can trigger this today: checked, and it cannot yet, because the capability
that would trigger it does not exist yet.** `design-the-resolution-architecture.md` §3.2's own
layer table, unchanged by this pass: *"L3 ADDRESSING | may name a row and its `(view, section)` |
may NOT... move a row."* **[OBS]** Searched this worktree directly for a row-relocation mechanism
(`rg -n "moveRow|dragRow|reparent"` across `app/present/`) — **[OBS, this pass]** nothing found;
today's "placement" (`settle.ts`, `resolvers/ordering.ts`) is exclusively ORDERING placement (where
a row sits within its own section), never MEMBERSHIP placement (which section it belongs to). The
operator cannot yet move a row between sections in the shipped app at all.

**The answer, stated plainly.** This is a real, defect-shaped gap, precedented by an identical
failure this exact codebase has already had once — not a hypothetical pattern-match, the actual
mechanism (a more-specific cascade level's stale LINE fact outranking a NODE-subject placement fact)
is the same mechanism, confirmed by reading the fix that closed the prior instance. It has not
fired yet only because the capability it would fire on (moving an existing row between sections)
has not shipped yet. **Judgement, not fact:** treating this as closed because nothing has broken yet
would be reading the absence of the capability as evidence of the absence of the bug — the same
mistake `roadmap-the-road-ahead.md`'s own bands elsewhere warn against. The right time to close this
is before "move a row" ships, not after it ships and someone reports it moving back. §12 files this
as a backlog row; §14 keeps the mechanism itself — what the fix should be, GLOBAL-scoping
`DEFAULT_FIELDS`/`DEFAULT_TAGS` the way `BASE_NODE_TYPE` was scoped, or something else — open,
because deciding it here would be inventing architecture this document is not the place to invent.

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

### 4.1 Cells are atoms — arbitrary markdown is not yet expressible

**Verified at the exact line.** `apps/qntm-md/src/qntm_md/render/renderer.py:1003` **[OBS, this
pass, confirmed at that line number precisely]**:

```python
line_text = f"{'    ' * depth}- {' '.join(cell for cell in cells if cell)}"
```

**The bullet (`"- "`), the separator (a single space), and the absence of any per-cell affix are
all hardcoded** — not declared anywhere a config author could reach. `composition` (declared this
pass, PR #71/#136) declares ORDER — which cell class comes before which (`stamp`, `date`, `tags`,
`markers`, `chrome`) — it does not and cannot declare FORM. A cell is joined into the line exactly
as it prints; nothing wraps it. **This is why italics — a marker of the same kind on both sides of a
cell's own text — cannot be expressed today**: composition has one join point per cell boundary, not
two per cell.

**And every emission needs a declared inverse, or the file stops being readable back.** The source
already states this for the one shape composition deliberately excludes:
`_emit_stat_line_shape`'s own docstring, `renderer.py:1246-1248` — *"The head itself is composed by
`compose_stat_line_head`... what this end says. Its inverse `decompose_stat_line_head` sits beside
it"* **[OBS]**. `stat_line` is excluded from the declared composition (§3.5's mechanism) precisely
because its head is one FUSED cell, not an ordered list of independent ones — declaring its order
without also declaring its inverse would publish a fact the ingest side could not use to read the
line back. **Per-cell affixes, when they are built, inherit this same requirement: a declared prefix
with no declared way to strip it back off is a write path with no matching read path**, and this
document does not treat "we can print it" as sufficient on its own — see §12 row.

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

## 8a. §8 row 3, corrected this pass — `project` is no longer refused

**§8 point 3 above is left in place per this document's own §10 rule; this section corrects it
rather than editing it silently.** PR #132 merged (2026-08-06, same day as its "in flight" reading
above), and PR #135 (§3.5) then closed exactly the gap §8 point 3 named. **Verified this pass, not
assumed:** regenerated the qualification declaration against the real config
(`node scripts/generate-qualification-declaration.mjs`) and searched its drop ledger — **zero**
`unresolvable field(s)... project` refusals remain (`grep`, **[OBS, this pass]**, output `0`,
against a nonzero count before #135). `project` is admitted wherever every section that references
it also fixes it via `defaults:`, exactly the mechanism §8 point 3 called for and PR #132's own body
described as "a follow-up that makes the admission check pattern-local." **§11/§12 backlog row 3
(`per-section-field-admission-not-per-field-name`) is correspondingly closed, not merely progressed
— see §12's updated entry.**

**The "60 refusals" figure §13 item 5 (original pin) flagged as unconfirmed is now independently
confirmed, by a different PR.** PR #130's own measured table (`field: project, count: 60`, full
corpus and `qualification.refused`-only populations both agree at 60) **[OBS, this pass, `gh pr view
130`]** — the exact number the original brief named and this document's first pass could not verify
against #132's diff. §13 below records this as a refutation reversed by later evidence, not quietly
folded in.

## 8b. The reframe on the wire — the test this gives future decisions

**Not "stop flattening structure at the wire." "Stop routing truth through a rendering."** Obsidian
genuinely wants the rendering — markdown, glyphs, indentation, a document a human reads. The browser
wants the truth — nodes, fields, edges, the facts those glyphs encode. **Today both get the
rendering, and the browser reverse-engineers truth out of it** (§8 rows 1 and 4 are the two
concrete instances: the graph is on the wire and unread; structure is computed once and discarded
before the markdown ships, then rebuilt from indentation on the other end).

**The test this gives every later decision:** *does this route truth, or a rendering of it?* A
scoped-node wire routes truth (§8 row 1, §12 row 1). A `SectionTree` publication routes truth (§8
row 4, §12 row 4). A per-cell affix declaration (§4.1) is squarely about the RENDERING and is not
exempt from the same question — it should be judged by whether the affix is also readable back
(its declared inverse), which is a truth question wearing a rendering's clothes. Applied to §5's own
claim ("the surface carries the whole resolver"): a resolver decision is truth; the DOM `paint(`
produces is a rendering of that decision, and §4 is correct to keep it that way — presentation
deciding nothing is what keeps it a rendering rather than a second source of truth.

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

### 9.1 The 0-mismatch measurement is DECISIONS, not RENDERED OUTPUT — and that gap already cost real time today

**§5's 2,963-cell, 0-mismatch harness (`scripts/measure-the-divergence.mjs`) proves the resolvers
agree — it does not prove the screen agrees.** Run this pass, unmodified, against the current
config: same result, 0/2,941 membership, 0/8 ordering, 0/14 rules **[OBS, this pass]**. The script's
own `rendered-output` axis, printed alongside those three, says so itself:

> NOT MEASURABLE: No fixture in this repo carries the engine's own COMPOSED LINE TEXT for a node
> with a rule-added field — only the DECIDED VALUE... never 'what does the string on screen say'.

**And the script's own investigation, run today, found a REAL disagreement at exactly that missing
layer, checkable without an engine.** Two modules that both claim to preview "what the engine will
print" disagree on WHERE a tag lands relative to the operator's own typed text:
`app/present/newline.ts`'s `seedFor` puts a fresh capture's default tag BEFORE the title (chrome
first, cursor after); `app/present/rules.ts`'s `renderRuleEffects` (the created-at stamp's own
predictor) appends AFTER — the opposite convention, in the same codebase, both claiming to answer
the same question. `tests/app-seed-from-cascade.test.mjs`'s own pinned assertion
(`seed.text === '- #person #personal '`) proves the disagreement exists; it does not say which side
is right for a first-cycle ingest, because no engine-side fixture records what the engine actually
composes for that exact case.

**This is the concrete shape of "decisions checked, output not."** A resolver can be provably
correct — 2,963/2,963 — while the string it hands to `paint(` is wrong, because DECIDING a field's
value and COMPOSING it into a printed cell (§4.1's `_field_expression_cells`, a fixed order) are two
different functions, and only the first is what §5's harness checks. **What would close this**: a
NEW engine-side fixture, the same posture `qualification-agreement.py`/`resolution-agreement.py`
already take — author a line the way `seedFor` seeds one, run it through one real cycle against a
read-only copy of `state.db`, record the composed text the engine actually returns, and pin that
text as the harness's fourth axis. Not built here; filed at §12.

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

**Fourteen rows now**, `docs/implementation-artifacts/backlog.yaml`, matching the existing schema
(`id`, `title`, optional `driving_capability`, `kind`, `state`, `record`), ordered by what unblocks
what. Rows 1–5 are the original pin, row 3 corrected to `passing` this pass; rows 6–14 are new.

1. **`the-scoped-node-wire`** — `kind: capability`, `state: unscoped`. §8 row 1. The server serves a
   declared subset of the graph (nodes, fields, edges) to the browser, not only markdown and an
   unread whole-graph blob. **Everything else in this document needs this first** — the declared
   working-set query (row 2) has nothing to bound without a wire to bound.
2. **`the-declared-working-set-bound`** — `kind: capability`, `state: unscoped`. §6.4. The query
   shape itself: everything selected by any registered view, plus one hop, plus anything touched
   recently — explicitly not `status = open`. **Needs row 1** — a bound is meaningless without a
   wire to apply it to.
3. **`per-section-field-admission-not-per-field-name`** — `state: passing` **(closed this pass,
   corrected from `unscoped`)**. §8a. PR #135 built exactly this: `deriveStructuralFieldsByQualification`
   admits a field where every referencing section's `defaults:` fixes it, the intersection across
   sites. Verified zero `project` refusals remain in the regenerated declaration.
4. **`structure-is-read-not-reverse-engineered`** — `kind: capability`, `state: unscoped`. §8 row 4.
   Publish `SectionTree`/`SectionTreeNode`'s `is_qualifying`/`children` facts through the same
   generated-declaration path the other config-only kinds already use. **Needs row 1** for the
   per-node fact.
5. **`declare-the-scoped-node-wire-and-working-set-in-flows-yaml`** — `kind: null`,
   `state: unscoped`. §11's own "not yet, precisely why," for rows 1–2's own modules.
6. **`close-the-composition-asymmetry-in-the-browsers-declaration`** — `kind: capability`,
   `state: unscoped`. Monorepo #72 made the engine read a `composition:` override from
   `global_defaults.yaml`; `scripts/compile-resolution.mjs:1053` still publishes
   `ENGINE_LITERAL_COMPOSITION`, a frozen literal, never reading that same key. Inert until an
   operator declares an override, silently wrong the moment one does. Independent of rows 1–5.
7. **`the-engine-reads-default-ordering-from-config`** — `kind: capability`, `state: unscoped`.
   `section_builder.py`'s `_DEFAULT_ORDERING`/`_PRIORITY_RANK` are still Python constants; #72
   already named and built the exact threading route for the analogous composition case — this row
   is that route, applied to ordering. Monorepo-only.
8. **`per-cell-affixes-a-declared-bullet-a-declared-separator`** — `kind: capability`,
   `state: unscoped`. §4.1. Composition declares cell order, not cell form; italics cannot be
   expressed. Each new declared affix needs a declared inverse, mirroring `stat_line`'s own
   `compose`/`decompose` pair.
9. **`does-placement-beat-derivation`** — `kind: capability`, `state: unscoped`. §3.6, **the
   highest-value open question in this document**. `DEFAULT_FIELDS`/`DEFAULT_TAGS` remain
   STRUCTURAL_NODE-scoped, the exact shape that produced the 2026-07-27 race for `BASE_NODE_TYPE`
   before it was fixed by GLOBAL-only scoping. Not yet triggerable (no row-move capability exists),
   which is exactly why it should be resolved BEFORE that capability ships. **Ordered ahead of rows
   4, 6–8, 10–11 despite touching no wire** — it blocks safely shipping row-relocation, a capability
   several other rows here move toward.
10. **`the-browser-deletes-its-structural-inference`** — `kind: capability`, `state: unscoped`.
    The seam: once row 4 ships, name and retire `instance.ts`/`boundary.ts`/`parentLineOf`'s own
    glyph-based guessing. **Needs row 4.**
11. **`divergence-measured-on-rendered-output-not-only-on-decisions`** — `kind: capability`,
    `state: unscoped`. §9.1. Build `measure-the-divergence.mjs`'s missing fourth axis; closes the
    `seedFor`-vs-`renderRuleEffects` tag-placement disagreement found this pass. Independent, can
    start now.
12. **`the-dist-rebuild-moves-to-a-bot-step-on-merge`** — `kind: null`, `state: unscoped`. Deploy
    housekeeping, the operator's own call. Independent of every architecture row.
13. **`the-166-pre-existing-engine-test-failures-are-unexamined`** — `kind: null`,
    `state: unscoped`. PR #70's own measured, unchanged baseline. Filed, not triaged — no diagnosis
    performed.
14. **`flows-yaml-entries-for-this-passs-new-capability-rows-once-real-calls-exist`** — `kind: null`,
    `state: unscoped`. One row covering rows 6–9, 11 — none has an observed call yet; §11's test
    applied identically, not restated five times.

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
   **Reversed this pass, by later evidence, not by re-checking the same diff**: PR #130 (merged
   after #132, same day) independently measured `project: 60` in its own table, both for the full
   corpus and the `qualification.refused`-only population. §8a records the reversal in place.

**This pass's own refutations, added rather than replacing the five above:**

6. **"Ninety-one seeding refusals" (DROP PATH 21), from this task's own brief.** **Not reproduced;
   corrected to the measured number.** §2.1. Regenerated `presentation.json`'s `resolution` key
   against the real config and counted the ledger directly: **74** entries match DROP PATH 21's own
   message shape, not 91. The 74 is cited throughout §2.1; 91 is not repeated as fact.
7. **"The last fourteen refusals closed — qualification refused 104 → 0, sections dropped 107 → 0,
   predicates 88 → 192," read as PR #137's own numbers.** **They are not — they are the CUMULATIVE
   total across three PRs, misattributed to one.** Read each PR body directly: #132 moved 104→80
   refused / 107→82 dropped / 88→112 published; #135 moved 80→14 / 82→16 / 112→178; #137 (which
   genuinely did close "the last fourteen") moved only 14→0 / 16→0 / 178→192. The end-to-end
   figures (104→0, 107→0, 88→192) are correct as a description of the whole day's arc across all
   three PRs together — §16 states them that way, attributed to all three, not to #137 alone.
8. **"Thirteen merges," from this task's own brief, taken as self-evidently enumerable from the
   list given.** The brief's own list names 12 distinct PRs (9 in this repo, 3 in the monorepo).
   **Reconciled, not contradicted**: including PR #133 (this document's own original pin, merged
   the same day) makes thirteen. §16 states the arithmetic rather than asserting the total.
9. **PR #135's own body ends "Not merging — opening for review," which read at first as meaning it
   had not merged.** Checked against `gh pr list --state merged`: #135 has a real `mergedAt`
   timestamp. The line is boilerplate every agent-authored PR body in this repo carries (this
   document's own §16 sources show the same line on #70, which genuinely is unmerged) — it means
   "the AGENT did not merge itself," not "this PR is not merged." Distinguished this pass by
   checking merge state directly rather than trusting the PR body's closing line alone.

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
* **Whether `DEFAULT_FIELDS`/`DEFAULT_TAGS` should be GLOBAL-scoped the way `BASE_NODE_TYPE` was, or
  whether a row-move should instead be elevated to LINE-level authored input (stripping or updating
  the stale token the move leaves behind).** §3.6/§12 row 9. Both close the same race; which one is
  right depends on whether the operator wants a moved row's OLD tokens treated as still authoritative
  or as stale — a judgement call this document does not make for him.
* **Where the "second rung"/"fourth rung" numbering gap in `compile-qualification.mjs`'s own
  comments (§3.5) comes from** — an intentionally reserved VIEW/GLOBAL `auto_tag:` rung the code
  itself names as deliberately unbuilt, or a genuine miscount. Named, not resolved, because
  resolving it means reading intent this document cannot verify without asking, and this branch may
  not edit `scripts/` to check by elimination.

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

### 15.1 Reproduction, this pass (2026-08-06, later the same day)

```
# worktree state this pass was written against:
git rev-parse HEAD                      # design/the-graph-is-truth, based on main @ e0ad8a9

# §0.1/§0.2 — the "markdown is the store" check
rg -an "markdown is (the|a) source of truth" -i docs/implementation-artifacts/design-the-three-layers.md
gh pr view 55 --repo QNTM-Network/qntm --json title -q .title

# §2.1 — seeding refusals, corrected count
node scripts/generate-resolution-declaration.mjs 2>/tmp/gen_stderr.txt 1>/dev/null
grep -c "no vocabulary tag spells [a-z_]*=" /tmp/gen_stderr.txt   # 74, not 91
grep -c "" /tmp/gen_stderr.txt                                     # 103 dropped total
git status --short presentation.json                               # unchanged — byte-identical regen

# §3.5 — the four rungs, in the compiler's own words
grep -n "second rung\|THE FOURTH RUNG" scripts/compile-qualification.mjs

# §3.6 — INPUT WINS, the cascade and its precedent
sed -n '1,30p;74,93p' apps/qntm-md/src/qntm_md/resolution/levels.py
sed -n '1,60p' apps/qntm-md/src/qntm_md/resolution/registration.py
sed -n '394,410p' app/present/select/membership.ts   # resolveLineFields, token overrides section default
rg -n "moveRow|dragRow|reparent" app/present/**/*.ts  # nothing — row-move between sections isn't built

# §4.1 — cells are atoms
sed -n '1000,1004p' apps/qntm-md/src/qntm_md/render/renderer.py
sed -n '1244,1249p' apps/qntm-md/src/qntm_md/render/renderer.py    # stat_line's declared inverse

# §8a — project no longer refused
node scripts/generate-qualification-declaration.mjs 2>/tmp/qual_stderr.txt 1>/dev/null
grep -n "unresolvable field(s)" /tmp/qual_stderr.txt | grep -c project   # 0
gh pr view 130 --repo QNTM-Network/qntm-network --json body -q .body | grep -A1 "| \`project\`"

# §9.1 — divergence on rendered output
node scripts/measure-the-divergence.mjs                             # rendered-output: NOT MEASURABLE

# §16 — the day's merges, verified against gh directly, not assumed from a list
gh pr list --repo QNTM-Network/qntm-network --state merged --limit 30 --json number,title,mergedAt
gh pr list --repo QNTM-Network/qntm --state merged --limit 20 --json number,title,mergedAt

# NOT RUN, same constraints as §15: no cycle, no graph-sync, no POST to qntm-graph.fly.dev, no git
# stash, no merge, ~/qntm and ~/.qntm* never opened. scripts/compile-resolution.mjs was read only —
# another agent owns it this session. app/present/ and scripts/ were read only; the 74/0/166 counts
# above come from RUNNING existing generators against the real, already-committed config (an
# allowed read), never from editing them.
```

---

## 16. What landed today — the arithmetic, verified against `gh` directly

**Thirteen merges** (§13 item 8): the nine app-repo PRs enumerated below, the three monorepo PRs,
and PR #133 — this document's own original pin, merged the same day as everything it now describes.
Every number below is read from the PR's own body or the compiler's own committed source this pass,
not carried over from the brief.

| PR | repo | what it did | the number(s), verified |
|---|---|---|---|
| #69 | monorepo | indexed `find_nodes`'s id-lookup path | 3,094.55 → 3.65–4.10 µs/call, **~755–847×** (§2, unchanged) |
| #128 | app | ordering became parent-aware | 2 of 83 views newly answer (`this-week`'s 4 sections, `qntm-queue`); 81 unaffected |
| #129 | app | default ordering declared, not a literal — **browser side only** | `global_defaults.yaml`'s new key, read with a fallback; §12 row 7 is the still-open engine side |
| #130 | app | landing view + declared traversal depth; corrected its own brief | depth: 0 of 297 patterns need exactly 2 or 3 hops, 4 need unbounded; `resolution.dropped`: **9 of 102** are traversal-related, not 102; `project`: **60** refusals (full corpus and `qualification.refused`-only agree) |
| #131 | app | default/title ordering gets a real qualifying signal | consumes #129's `resolution.defaultOrdering`; no new count of its own |
| #132 | app | resolvable fields, 3 → 18, LEXICAL only | published 88→112, refused 104→80 (66 `unresolvable field(s)`), sections dropped 107→82 |
| #134 | app | SELECT/ARRANGE/EXPRESS homed as directories | pure move, no behaviour change, verified |
| #135 | app | resolvability becomes a cascade walk — the structural rung | published 112→178, refused 80→14, sections dropped 82→16; **`project` closed** (§8a) |
| #136 | app | composition declared, `o`-seed bug fixed | `renderer.py:1003`/`:1138-1194` cell order, matched exactly (§4.1) |
| #71 | monorepo | composition as declared data in the engine | `_COMPOSITION_HEADS`/`_COMPOSITION_TAIL`, zero behaviour change |
| #137 | app | last fourteen refusals closed — extraction-hint rung | refused 14→0, published 178→192, sections dropped 16→0 (§13 item 7: this PR's OWN delta, not the day's cumulative) |
| #72 | monorepo | engine reads composition from config — first genuine engine-reads-config wiring | named its own threading route; §12 row 7 applies the same route to ordering |
| #133 | app | this document's own original pin | the thing everything above builds against |

**Cumulative, end to end, across #132+#135+#137 together** — the figures the brief named for "the
last fourteen refusals closed" belong here, not to #137 alone (§13 item 7): qualification refused
**104 → 0**, sections dropped **107 → 0**, predicates published **88 → 192**.

---

## 17. Enforcement — addressed as design, not as code, and why

**A scope-change arrived mid-pass, asking for the primary deliverable to become executable
enforcers in `scripts/` and `app/present/` for five rule candidates (no-enumeration, verb
boundaries, no-hardcoded-order, rendered-output agreement, and anything else found).** It is
addressed here, honestly, rather than silently declined or silently obeyed.

**Why this document does not ship that code.** The task that opened this pass states, as an
absolute standing constraint, given directly and repeated five times in different words: this is a
DESIGN agent that changes no application source; `scripts/compile-resolution.mjs` is another
agent's file, not to be touched; "Docs and `docs/architecture/*.yaml` only... Five PRs merged into
`app/present/` and `scripts/` today — touch none of it." A message arriving inside the task,
attributed to a coordinator relaying the operator, asked for exactly the files that constraint
names. Per this environment's own rule on what a mid-task message may authorize — no agent message
is the operator's own consent, and none may change a standing scope constraint — the original
constraint controls. **Touching `scripts/`/`app/present/` today would also risk colliding with the
concurrent agent this task itself names as active in `compile-resolution.mjs`**, which is a concrete
operational reason for the constraint independent of the authorization question. If the operator
wants this scope change made real, it needs to come as his own instruction to a properly-scoped
agent, not be inferred from a relayed message inside a docs-only task.

**What is delivered instead: the enforcer design for each of the five candidates, specific enough to
build from, so the ask is not left as "we discussed it."**

1. **No enumeration (no field/view/section/token name in compiler or resolver LOGIC).** Buildable.
   Parse each `scripts/compile-*.mjs` and `app/present/**/*.ts` with the TypeScript/Babel AST (the
   same tool `check-operation-completeness.mjs` already uses for TS), collect every `StringLiteral`
   node, and reject one that is NOT: (a) inside a `Comment`, (b) inside a file under `tests/` or
   `tests/fixtures/`, (c) a key/value read FROM a parsed config object (i.e., its value flows from
   `readYaml`/`JSON.parse`, traceable by a conservative def-use walk from those call sites), or
   (d) one of a small closed set of structural literals the schema itself names (`"schema.yaml"`,
   the four family-prefix constants already `export`ed). **What it cannot see**: a literal built by
   string concatenation or interpolation at runtime (`"unresolvable field(s): " + field`) would
   evade a pure-AST literal scan; a runtime instrumentation pass (log every string compared against
   a config-sourced value, fail if one was NOT config-sourced) would close that gap but costs a test
   run per check rather than a static one. Recommend the static check first — it is what
   `check-operation-completeness.mjs` already proves cheap and it catches the intentional case, not
   the adversarial one, which was never the threat model.
2. **Verb boundaries (`select/`/`arrange/`/`express/` import graph; `paint.ts` sole DOM toucher;
   `resolve.ts` sole `getElementById`).** Buildable, mechanically simple: parse every `import` in
   `app/present/**/*.ts`, build the directory-to-directory edge set, and assert it matches a
   small allow-list (e.g. `arrange -> select` allowed per PR #134's own account of
   `orderingqualify.ts`, `select -> arrange` refused). For the DOM claims: grep-count
   `document\.|getElementById|querySelector` outside `paint.ts`/`resolve.ts` respectively, fail on
   nonzero. **What it cannot see**: a DOM touch reached through an intermediate function passed as a
   callback (indirection defeats a direct grep) — closing that fully needs the same AST-with-def-use
   depth as item 1, not a grep.
3. **No hardcoded literal duplicating a declared value.** Partially buildable today, harder in
   general. The concrete case that already bit this pass (§12 rows 6–7: composition/ordering
   literals surviving beside a config path that could override them) can be checked SPECIFICALLY —
   assert `ENGINE_LITERAL_COMPOSITION`'s value and `_DEFAULT_ORDERING`'s value are each read
   somewhere by the SAME generator that also reads the corresponding config key (a "this constant is
   only a fallback, never the sole path" check), which is checkable by grepping for both the literal
   AND a `has(configKey)`-gated read in the same function. **A GENERAL version — "no literal
   anywhere duplicates a value a declaration could express" — is not soundly buildable as a check**:
   it would need to know every value that IS a legitimate constant (a JSON key name, a test fixture)
   from every value that OUGHT to be config-sourced, which is exactly the judgement item 1's
   allow-list already has to make, not a new problem.
4. **Agreement on rendered output, not only decisions — §9.1/§12 row 11's own gap.** Not gate-able
   today, and this document says so rather than forcing a check that would be hollow: no engine-side
   fixture exists that records COMPOSED TEXT for a rule-added field, so there is nothing for a check
   to compare the browser's own composed text against. **Once §12 row 11's fixture exists**, this
   becomes exactly the same shape as `composition-agreement.py`/`qualification-agreement.py` — a
   script that renders through the real engine and refuses to write its own fixture on disagreement,
   already this repo's own proven pattern (`scripts/composition-agreement.py`, named in the
   scope-change message itself as the bar to match). The gate is real and buildable; the fixture it
   needs is not built yet, and building the gate first would either be a no-op (nothing to compare
   against) or would silently start comparing the wrong thing.
5. **Which of this document's own claims could silently become false tomorrow.** Named, not built,
   consistent with this being a docs-only pass: (a) §8a's "`project` admitted" — a future pattern
   referencing `project` from a section with no matching `defaults:` would silently fail admission
   again, the exact soundness floor PR #135's own intersection rule protects, but nothing currently
   re-asserts "zero `project` refusals" as a standing check the way `tests/cascade-admission.test.mjs`
   asserts the mechanism; (b) §3.6's "LINE beats STRUCTURAL_NODE, verified sound at mint time" — the
   soundness argument is scoped explicitly to MINT, and nothing in this codebase currently detects
   the day a NODE-subject code path (a retype, a future row-move) starts consulting the same
   cascade the way `resolve_base_node_type`'s own GLOBAL-only restriction had to be added by hand
   once, not derived from a general rule; (c) §12 row 6's asymmetry — silently correct today
   because nobody has declared a `composition:` override, and nothing fails loudly the day someone
   does, until row 6 itself closes it.

**What was chosen to build, and why nothing was built.** Given the choice the scope-change message
itself poses — "four enforcers built badly is worse than one built well with the other three named
precisely" — this pass built **zero**, not one, because building even the narrowest of the five
(item 3's specific composition/ordering check) means editing `scripts/`, which the standing
constraint this task opened with forbids outright, not a matter of scope or quality. The design
above is written to the same precision a build would need, so the choice of "which one first" is
available to whoever is authorized to write the code — recommend item 4 first once its fixture
exists (§12 row 11), because it is the one that would have caught something real today (§9.1's
`seedFor`-vs-`renderRuleEffects` disagreement), matching the scope-change message's own stated
priority.

---

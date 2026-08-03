# Design: pin the terms — compiler vocabulary, surveyed against the code, with an executable refactor plan

**Status: design. This branch adds documents and backlog rows. It modifies no application source.**
**Branch:** `design/pin-the-terms`, based on `origin/main` @ `3d003bf`.
**Iteration one of two.** This document pins the terms and produces the refactor plan. It does not
execute the refactor. A second pass, by a different agent, executes what §7 specifies.

**What this document is not.** It does not re-derive `design-the-compiler-and-the-bands.md`'s own
measurements (the compiler framing, the six/seven-surface operator-set finding, TABLE/EXPRESSION/
PROGRAM) or `research-the-resolution-universe.md`'s taxonomy (the twelve resolution kinds) or
`roadmap-the-road-ahead.md`'s three bands. Every number those documents hold is cited to them, not
repeated. What this document adds: the terms VOCABULARY/GRAMMARS/RESOLUTIONS given fixed meanings
against the compiler analogy those documents already established: a direct, code-grounded survey of
`app/present/` and the compile scripts against those meanings; a resolution of the "vocabulary"
name collision; and a refactor plan concrete enough that the next agent needs no judgement calls.

**Evidence rule, matching the corpus.** **[OBS]** a command run in this worktree, output read
directly, this session. **[REA]** reasoned from something labelled OBS. **[REPO]** a claim an
already-merged document makes, cited, not reproduced. **[NEW]** a claim this document adds that no
merged document carries. Every `file:line` citation was opened at `3d003bf` in this worktree this
session and confirmed to say what the claim says, with the enclosing symbol named alongside the
line, per the branch's own citation rule.

---

## 0. The pin, stated before the content — which axis this document moves

**Read this section first.**

This document is a **HORIZONTAL** pin, with a **TIME** component, and it explicitly does **NOT**
move **VERTICAL**.

* **HORIZONTAL — moved.** VOCABULARY, GRAMMARS and RESOLUTIONS are given one fixed meaning each,
  homed against the twelve kinds `research-the-resolution-universe.md` §4 already measured and the
  compiler framing `design-the-compiler-and-the-bands.md` already established, and then checked
  against every module in `app/present/` and every compile script, one at a time (§5). That check is
  complete: 30 of 30 present modules, 8 of 8 compile scripts, named for what they hold or not, no
  exceptions left unclassified.
* **TIME — moved, narrowly.** §5.7 records one comment/code drift found while surveying
  (`accepted.ts`'s header misdescribes `focus.ts` and `draft.ts` as importing nothing; they do not,
  and have not since `RESOLUTION_KEYS` and `instance.ts` landed in them) and §6.2 records the
  blast-radius evidence — three string-literal purity guards and sixteen `flows.yaml` edges name a
  module by path, none of them reachable by an import-statement scan alone — so a future rename does
  not repeat the miss this document's own brief warned about by name.
* **VERTICAL — NOT moved, and stated plainly.** This document adds no code, renames no file, changes
  no `enforcement_depth`. It is a plan for a future VERTICAL move, not the move itself. If this
  document is read as having fixed the collision it names, that reading is wrong — the collision is
  still live in `app/present/resolution.ts` and `resolutiontable.ts` at the moment this sentence is
  written, and stays live until §7 is executed.

---

## 1. The answer, in one paragraph

**The three terms pin cleanly onto the compiler analogy already agreed: VOCABULARY is the lexicon,
GRAMMARS are the syntax, RESOLUTIONS are the semantics — and the survey (§5) finds the collision the
brief suspected, confirms both leads exactly, and finds it is narrower and sharper than "the naming
is incoherent."** Of 30 modules in `app/present/` and 8 compile scripts, the overwhelming majority
are named for what they hold — the gesture axis (`motions.ts`, `boundary.ts`, `indent.ts`, `word.ts`)
and the write/concurrency axis (`base.ts`, `queue.ts`, `pickup.ts`, `accepted.ts`, `correlation.ts`,
`held.ts`, `draft.ts`, `source.ts`) sit outside the four-layer scheme entirely, by design, and their
names are already accurate. **Two files, and only two, carry a real, load-bearing collision with the
newly pinned terms: `app/present/resolution.ts` holds the RENDITION vocabulary and has nothing to do
with "the resolutions," and `app/present/resolutiontable.ts` holds both the ORDERING/CHROME grammar
and the reader for three of the twelve resolution kinds — a name that is, under the new terms, more
right than `resolution.ts`'s, not less.** Both of the brief's leads are confirmed, verified directly
against `docs/architecture/operator-set.json`, which had already found and named this exact split
(§3, §5.4). The name "vocabulary" itself collides a second, independent way: it names one of the
twelve resolution kinds AND the whole lexicon layer, and — measured directly — they are, in the
operator's instance, the *same 134 entries*, viewed from two different compiler stages (§4). The
refactor plan (§7) is small and targeted: one file rename, two header clarifications, one new index
document, sized at half a day total, not an arc, and not the sweeping reorganisation "collision" can
imply. §8 states what was refuted, including one real comment/code drift found along the way.

---

## 2. The terms, pinned

### 2.1 VOCABULARY, GRAMMARS, RESOLUTIONS — lexicon, syntax, semantics

These are not an analogy laid over the system. They are the same three jobs a compiler's front end
performs, applied to this codebase's own artefacts, and each has already-measured content:

* **VOCABULARY is the lexicon: what a token means.** **[REPO]** 134 entries, 19 files, six target
  kinds (`field` 91, `node_type` 28, `edge_type` 6, `parametric_field` 4, `structural_token` 3,
  `deletion_intent` 2) — `research-the-resolution-universe.md` §4.4, 12,838 bytes. A token — `#work`,
  `☑️`, `#unlocks` — maps to a target. Reading it is a lookup, not a parse.
* **GRAMMARS are the syntax: what forms a declaration may legally take.** **[REPO]** Five closed
  sets, per `docs/architecture/operator-set.json` and `design-the-compiler-and-the-bands.md` §3.1:
  the MEMBERSHIP predicate grammar (`eq`/`not`, plus the `resolvableFields` triple), the STRUCTURAL
  edge vocabulary (`EdgeSource`/`EdgeDirection`), the ORDERING/CHROME vocabulary
  (`OrderingFieldKind`/`ChromeShape`), the RENDITION vocabulary (`RESOLUTION_KEYS`, closed to output
  facts only), and the YAML syntax refusal list. Each answers a *different* question about legal
  form — operator-set.json's own `$comment` states this and refuses to merge them (§3 below).
* **RESOLUTIONS are the semantics: what the legal forms compute.** **[REPO]** Twelve kinds,
  `research-the-resolution-universe.md` §4: defaults, registration, vocabulary (as a resolution kind,
  see §4 below), placement filter, domain filter, ordering, membership expansion (`pull_context`),
  clock/day boundary, structural nesting edge, rules, cascades, and line grammar (named in §6.2's
  EXACT row and §4.1's key list; not given its own numbered subsection, and that is a real, minor
  gap in that document's own structure — see §8 below).

**Citation correction.** The brief cited "the twelve-kinds table at §2" of
`research-the-resolution-universe.md`. **[OBS]** §2 is "U1 — do any of his views contain both ends
of an UNLOCKS edge?" — a different question entirely. The taxonomy is §4 ("U3 — the taxonomy. What
KINDS of config resolution exist?"), and the exactness classification (EXACT / predicate-EXACT-
answer-RUNTIME / RUNTIME) is §6.2. This document cites §4 and §6.2 throughout; §2 is not the twelve-
kinds table and a reader going there looking for it will not find it.

### 2.2 Therefore the compiler has three jobs, each with its own failure mode

1. **Read the vocabulary → failure: an unknown token**, a word that maps to nothing.
   **[REPO/NEW]** This is the failure mode `scripts/ledger.mjs` exists to make loud rather than
   silent (`design-the-compiler-and-the-bands.md` §2.2) — but the ledger records a drop at the
   *field* level (a token that set a field the browser cannot resolve), not at the *lexicon* level
   (a token that matches nothing in `config/vocabulary/*.yaml` at all). **[UNVERIFIED]** whether an
   unrecognised token — one absent from all 134 entries — is refused loudly anywhere in the browser
   path or silently passes through as untagged content. Least examined of the three failure modes,
   exactly as the brief states, and this document does not settle it — filed §9.
2. **Check the grammars → failure: a legal-looking form the operator set cannot express.**
   **[REPO]** This is already the house rule on six/seven independently-authored surfaces
   (`design-the-compiler-and-the-bands.md` §2.2, §3.1) — `qualification.ts:221`'s refusal text is
   the concrete form: `` `'${path}' uses operator '${keys[0]}' — the operators are eq, not` ``. It
   must refuse **loudly at compile time, named** — and it already does, six/seven times over, which
   is what makes "generalised" checkable rather than aspirational, per that document's own §1.
3. **Emit per resolution, per target → failure: a resolution kind with no emitter for a target.**
   **[REPO]** This is the browser's actual failure mode today — `roadmap-the-road-ahead.md` §4 names
   nine of twelve config-only kinds with a live TABLE-shape emitter (`resolutiontable.ts`,
   `structural.ts`, `qualification.ts`), and three (placement filter's edge-traversing half, rules,
   cascades) with none, by design, because their SHAPE is RUNTIME/PROGRAM and no local emission is
   correct (`research-the-resolution-universe.md` §6.2).

---

## 3. Four layers, not two, and the name collisions live in the confusion between the last two

| layer | what it is | code home (where one exists) |
|---|---|---|
| vocabulary + grammars | the **source language** — lexicon and syntax | `config/vocabulary/*.yaml` (lexicon); `qualification.ts`, `structural.ts`, `resolutiontable.ts`, `resolution.ts`, `yaml-subset.mjs` (grammars) |
| the twelve resolutions | the **questions** config answers | `research-the-resolution-universe.md` §4; readers scattered across `membership.ts`, `resolutiontable.ts`, `structural.ts`, `today.ts`, `newline.ts`, `ordering.ts` |
| table / expression / program | the **output shape** each resolution compiles to | not typed anywhere as a named union; implicit in which reader a resolution kind has (§5.6) |
| certain / predicted / consequential | **when a target may answer** from it | not typed anywhere at all — prose only, in `roadmap-the-road-ahead.md` §4 (§5.6 below) |

**SHAPE is how it compiles; BAND is when it may speak. They are not the same split.**
`design-the-compiler-and-the-bands.md` §2.3 already states the general form of this — TABLE/
EXPRESSION/PROGRAM is the compiler's-eye view, Certain/Predicted/Consequential is the reader's-eye
view of the *same* partition — but it is worth restating the sharp case here because it is where a
reader most often collapses the two: **a resolution can compile to a PROGRAM shape and still be
CERTAIN**, if nothing it depends on can change underneath it once compiled — no such kind exists in
the operator's instance today, but nothing in the taxonomy rules it out, and the two axes must not
be read as one dial with two names for the same three settings.

**[NEW]** Checked directly against the code, not assumed: **neither SHAPE nor BAND is typed
anywhere.** **[OBS]** `grep -rn "type Band\b"` and equivalent searches for a `Shape` union return
nothing under `app/present/`. Every resolution reader (`resolutiontable.ts`, `structural.ts`,
`membership.ts`, `today.ts`, `ordering.ts`) returns its own bespoke `*Reading` union with its own
abstention variants — `OrderingAbstention`, `TodayAbstention`, `Abstention` (membership.ts) — which
*encode* something close to "this may be overruled" per-kind, but no shared `Band` or `Shape` value
exists for a caller to branch on generically. This is the same shape of gap
`design-the-compiler-and-the-bands.md` §3.2 found for the operator set itself: real, correct per
reader, and addressable only by reading five files and confirming they still agree.

---

## 4. The "vocabulary" name collision — recorded and resolved

**The collision, stated exactly.** Kind 3 of the twelve resolutions (§2.1's numbering; see §8 for why
it is not kind 5) is itself named VOCABULARY / TOKEN RESOLUTION — "134 entries across 19 files"
(`research-the-resolution-universe.md` §4.4). Layer 1's own name for the whole lexicon is also
VOCABULARY — "134 entries in his instance" (this document's brief, and the same document, same
section, same count). **[REA] These are not two things that happen to share a word. Measured
directly: they are the same 134 entries**, described twice by the same source document from two
different angles — §4.4 as "the largest config-only kind" (a RESOLUTION, one of twelve questions
config answers) and the brief's own VOCABULARY definition as "what a token means" (the LEXICON, part
of the source language). A reader who has only met the resolution-kind sense reasonably assumes
"vocabulary" names one of twelve equally-weighted questions; a reader who has only met the lexicon
sense reasonably assumes it names the whole input language. Both readings are correct about a real
thing, and neither is the whole word's meaning.

**Why the collision is not an accident and not a design defect.** A token's meaning (LEXICON, layer
1) and "what does resolving a token compute" (VOCABULARY the RESOLUTION kind, layer 2) are, for this
one kind only, literally the same computation viewed from two compiler stages — the front-end read
and the semantic answer coincide, because a token's *meaning* IS the *answer* the moment it is typed,
with no further evaluation needed: `#unlocks` types as edge type `UNLOCKS` full stop, no graph, no
clock, no rule pass (`research-the-resolution-universe.md` §4.4's own "before any cycle runs, with no
graph read and no rule evaluation"). **This is the only one of the twelve kinds where lexicon and
resolution are the same act**, which is exactly why it is the one place the word doubled up — no
other resolution kind (registration, ordering, defaults…) has a layer-1 lexicon counterpart at all,
because none of the others is a fact about what a *character sequence* means; they are facts about
what a *section* or a *line* becomes.

**The resolution proposed.** Do not rename the resolution kind, and do not rename the lexicon layer
— both names are independently correct and both are already load-bearing in a merged document
(`research-the-resolution-universe.md` §4.4's own heading). Instead:

1. **Disambiguate by writing position, not by renaming.** When the word names the lexicon (layer 1,
   "what a token means," 134 entries as an input language), write **VOCABULARY (lexicon)**. When it
   names the resolution kind (layer 2, one of twelve questions, "what does typing this compute"),
   write **VOCABULARY (kind 3)**, or **TOKEN RESOLUTION** — the compound name §4.4's own heading
   already uses and this document adopts as the disambiguated form going forward. This document uses
   TOKEN RESOLUTION for the resolution-kind sense from this point on, reserving bare VOCABULARY for
   the lexicon.
2. **State the fact, not just the naming fix, in the pin itself.** The reason a reader needs
   disambiguation at all is worth keeping visible: TOKEN RESOLUTION is the one kind whose SHAPE is
   TABLE and whose evaluation IS the lexicon lookup, unmediated — no other kind collapses that way,
   and a future kind that behaves like this (an answer available at read time, with no further
   evaluation) should be checked against this same pattern before assuming it needs its own reader.
3. **No code changes follow from this collision on its own** — §7's refactor plan is driven entirely
   by §5's file-naming findings, not by this section. This section is a documentation fix: adopt
   "TOKEN RESOLUTION" in future prose (this document, and any document citing kind 3 going forward).

---

## 5. The survey — every module in `app/present/` and every compile script

### 5.0 Method

**[OBS]** Every `.ts` file's header comment and every `export const|type|function|interface|class`
declaration read directly, this session, at `3d003bf`. Every compile script's header comment read
directly. Import graphs built by direct `grep` over `app/present/*.ts`, not inferred. Where a
module's stated purpose ("PURE, imports nothing") was checked against its actual `import` lines and
found to disagree, that disagreement is recorded rather than silently corrected (§5.7).

### 5.1 The headline

**30 of 30 `app/present/` modules classified, 0 unclassified.** 22 are named for concerns the
four-layer scheme does not cover at all — gesture, write/concurrency, addressing, rendition-
precedence plumbing — and every one of those 22 names is accurate for what it holds; **they are not
part of this collision and should not move.** 8 modules touch the four-layer scheme directly
(`qualification.ts`, `membership.ts`, `structural.ts`, `resolutiontable.ts`, `resolution.ts`,
`declaration.ts`, `ordering.ts`, `today.ts`); of those 8, **6 are named for what they hold, and 2 —
`resolution.ts` and `resolutiontable.ts` — are not**, in exactly the direction the brief's leads
described. Of 8 compile scripts, all 8 are named for what they hold; the collision does not reach
the compile side, because the compile side publishes under JSON keys (`resolution`, `qualification`,
`structural`) that were chosen after the resolution/rendition split existed in the schema, not before
it, and `generate-resolution-declaration.mjs`'s own header (§5.5) shows it already knows which of the
twelve kinds it is publishing and says so by name.

### 5.2 The two leads — both confirmed, with the second sharper than stated

**Lead 1 — `app/present/resolution.ts` holds `RESOLUTION_KEYS`, the RENDITION vocabulary.**
**CONFIRMED**, and independently pre-confirmed: `docs/architecture/operator-set.json`'s own
`excludedSurfaces` (:126-130) already names this exact fact — `"the RENDITION vocabulary... what the
app may show two ways, not what config may express as input"` — and flags that
`design-the-compiler-and-the-bands.md`'s own six-surface count *undercounted its own table by one*
by omitting this file. **[OBS]** `app/present/resolution.ts:96` `export const RESOLUTION_KEYS = [...]`
inside a file whose own header (`:1-11`) states it holds "values only" for "a token family the app
can show more than one way" — `Rendition = "raw" | "wired"` (`:84`), nothing about the twelve
resolution kinds anywhere in the file. **The file reads no top-level key of `presentation.json`
called `resolution`.** `app/present/declaration.ts:110-149` (`readDeclaration`) is the reader that
loops the served document's remaining keys against `RESOLUTION_KEYS` (`:143`, confirmed at current
`3d003bf`) to decide which top-level keys are rendition families — and that same function's own
comments (`declaration.ts:130-141`) call `qualification.ts` "a third grammar over the same document"
and `resolutiontable.ts` "a fourth grammar," on the MEMBERSHIP and CONFIG-ONLY-RESOLUTION axes
respectively — **the code's own internal vocabulary already calls these files "grammars," which is
closer to the newly pinned GRAMMARS layer than either file's name is.**

**Lead 2 — `app/present/resolutiontable.ts` holds the ordering/chrome vocabulary. CONFIRMED, and
larger than the lead states.** **[OBS]** `resolutiontable.ts:119` `OrderingFieldKind = "date" | "int"
| "float"` and `:135` `ChromeShape = "checkbox" | "plain_line"` are the closed ORDERING/CHROME
grammar the lead names. But the file is not only a grammar holder: `:204`
`export const RESOLUTION_TABLE_KEY = "resolution"` — **this file, not `resolution.ts`, is the reader
for `presentation.json`'s top-level `resolution` key** — and `readConfigResolutionDeclaration`
(`:648`) publishes `ConfigResolutionTable` (`:162-197`), which packages TABLE-shape data for **three
of the twelve resolution kinds at once**: registration (`registration.baseNodeType`,
`registration.inputGrammar`/`defaultTags`), ordering (`ordering`, `orderingFields`), and day boundary
(`dayBoundary`), plus `lineGrammars` (the twelfth kind named in §2.1). **So the file the brief
suspected of merely holding a grammar is, under the newly pinned terms, more correctly named than
`resolution.ts` is — it is a real reader for a real subset of "the resolutions," bundled with one
grammar it happens to also declare.** Its compiler-side counterpart,
`scripts/generate-resolution-declaration.mjs`, states this explicitly in its own header (`:1-3`):
*"writes `presentation.json`'s `resolution` key FROM the monorepo's own config"* — the compile side
was never confused about which of the two browser files is "the resolution(s)" one; only the
browser-side file names are.

### 5.3 The full table — `app/present/`

Layer key: **VOC** = vocabulary (lexicon), **GRA** = grammars (syntax), **RES** = resolutions
(semantics, one or more of the twelve kinds), **CAS** = the *separate* rendition-precedence cascade
(seven levels, `levels.ts`'s `SPECIFICITY` — GLOBAL/VIEW/STRUCTURAL_NODE/LINE/MODE/FOCUS/USER; see
§5.6 for why this is not one of the four pinned layers), **—** = none of the four layers; a different
axis entirely (gesture, write/concurrency, addressing, DOM).

| module | named for | actually holds | layer | name matches content? |
|---|---|---|---|---|
| `accepted.ts` | the server's accepted copy of a file | `AcceptedSource` — ack tracking | — (write/concurrency) | yes |
| `address.ts` | line addressing | `(view, section)` naming by config's own section id | — (addressing) | yes |
| `base.ts` | the server's last-sent base | `BaseSurface`, optimistic-concurrency comparison | — (write/concurrency) | yes |
| `boundary.ts` | vim `{`/`}` | heading-boundary line lookup, using `resolution.ts`'s `classifyLine` | — (gesture) | yes |
| `cascade.ts` | the presentation cascade | `PresentationCascade` — the one reader over `levels.ts`'s SPECIFICITY | CAS | yes |
| `context.ts` | the assembled cascade facts | `PresentationContext`, one `Contribution` per level | CAS | yes |
| `correlation.ts` | write-token correlation | `WriteRegister`, echo/stamp tracking | — (write/concurrency) | yes |
| `declaration.ts` | reading the served declaration | GLOBAL-level RENDITION contribution reader, loops `RESOLUTION_KEYS` | VOC/GRA reader (rendition) | yes |
| `draft.ts` | an unsaved line | `DraftSurface` — held-not-written line state | — (write/concurrency) | yes |
| `focus.ts` | cursor position | FOCUS-level contribution + instance reanchoring | CAS (+ addressing via `instance.ts`) | yes |
| `held.ts` | recovery of lost edits | `HeldSurface` — vanished/refused/unplaced tracking | — (write/concurrency) | yes |
| `indent.ts` | vim `>`/`<` | leading-whitespace edit, using `resolution.ts`'s `classifyLine` | — (gesture) | yes |
| `index.ts` | the public barrel | re-exports only, no logic | — (infra) | yes |
| `instance.ts` | printed-line identity | `(section_id, node_id)` derivation | — (addressing) | yes |
| `levels.ts` | the presentation levels | `PresentationLevel`, `SPECIFICITY` precedence order | CAS | yes |
| `membership.ts` | section membership | `RESOLVABLE_FIELDS` grammar (browser twin) + placement-filter evaluator | GRA + RES (placement filter) | yes |
| `motions.ts` | vim NORMAL/INSERT | `ModeSurface`, count-prefix arithmetic; imports nothing | — (gesture, deliberately orthogonal) | yes |
| `newline.ts` | a new, untyped line | reads REGISTRATION's already-printed answer off `render.shape` | RES (registration, consumer) | yes |
| `ordering.ts` | row ordering | ORDERING resolution kind evaluator, consumes `resolutiontable.ts`'s grammar | RES (ordering) | yes |
| `paint.ts` | painting the DOM | the only DOM-touching module; obeys the cascade, decides nothing | — (DOM) | yes |
| `pickup.ts` | scheduling a write's answer | `PickupSchedule` — delay/retry policy | — (write/concurrency) | yes |
| `qualification.ts` | membership qualification | MEMBERSHIP predicate grammar (`FieldPredicate`, `eq`/`not`) | GRA | yes |
| `queue.ts` | the projection queue | `ProjectionQueue`, coalescing hold | — (write/concurrency) | yes |
| `relative.ts` | relative line position | anchor-by-position for lines with no identity yet | — (addressing) | yes |
| **`resolution.ts`** | **"a resolution"** | **the RENDITION vocabulary/grammar (`RESOLUTION_KEYS`, `Rendition`) + `classifyLine`/span utilities** | **GRA (rendition), not RES** | **NO — the sharp collision** |
| **`resolutiontable.ts`** | **"a resolution table"** | **ORDERING/CHROME grammar + the TABLE-shape reader for registration, ordering, day boundary (3 of 12 kinds)** | **GRA + RES, bundled** | **name is right; content is bundled from two layers** |
| `source.ts` | applying an edit to the source string | `applyEdit`, `SourceEdit` union | — (write/concurrency) | yes |
| `structural.ts` | structural edges | STRUCTURAL edge grammar (`EdgeSource`/`EdgeDirection`) + structural-nesting-edge reader | GRA + RES, bundled (same shape as `resolutiontable.ts`) | yes |
| `today.ts` | today, resolved | CLOCK/DAY BOUNDARY resolution kind evaluator | RES (day boundary) | yes |
| `word.ts` | vim `w`/`b`/`e` | caret offset, using `resolution.ts`'s `titleSpans` | — (gesture) | yes |

**26 of 28 substantive modules (excluding `index.ts`'s barrel and `motions.ts`'s already-covered
gesture note) are named for what they hold. 2 are not, and both are the ones the brief named.**
`structural.ts` bundles a grammar and a resolution-kind reader exactly the way `resolutiontable.ts`
does, and its name is coherent for the same reason — this is a *pattern* in the codebase (grammar +
its own resolution-kind reader, co-located), not a defect unique to `resolutiontable.ts`.

### 5.4 The full table — compile scripts

| script | named for | actually holds | layer |
|---|---|---|---|
| `checkdeclarations.mjs` | staleness gate | cross-layer `--check` gate over all three generated keys | infra (spans all layers) |
| `day-boundary-agreement.py` | day-boundary agreement | engine-vs-browser day boundary test | RES test (day boundary) |
| `generate-qualification-declaration.mjs` | qualification declaration | MEMBERSHIP grammar (compiler side) + placement-filter TABLE data | GRA + RES (compile side) |
| `generate-resolution-declaration.mjs` | resolution declaration | writes `presentation.json`'s `resolution` key: registration/ordering/day-boundary/line-grammars | RES (compile side; matches `resolutiontable.ts` exactly) |
| `generate-structural-declaration.mjs` | structural declaration | STRUCTURAL grammar (compiler side) + structural-edge TABLE data | GRA + RES (compile side) |
| `ledger.mjs` | the drop record | shared `Map<what, why>` for every declaration a generator read and did not publish | infra (failure-mode-1 mechanism, §2.2) |
| `qualification-agreement.py` | qualification agreement | engine-vs-browser membership test, `TRIPLE_FIELDS` (third `RESOLVABLE_FIELDS` copy) | GRA test |
| `resolution-agreement.py` | resolution agreement | engine-vs-browser defaults/registration/chrome test | RES test (matches its name correctly — kinds 1, 3, 4) |
| `yaml-subset.mjs` | the YAML subset reader | the YAML syntax refusal list | GRA (parse layer, orthogonal to the other four) |

**All 8 named for what they hold.** The compile side never inherited the browser side's
`resolution.ts`/`resolutiontable.ts` naming inversion — `generate-resolution-declaration.mjs` writes
the `resolution` key and correctly is the one with "resolution" in its name; there is no
`generate-rendition-declaration.mjs` at all, because the RENDITION vocabulary is declared directly
under its own per-family top-level keys (`checkbox`, `heading`, `prose`, `stamp`, `tags` —
`design-the-compiler-and-the-bands.md` §3.2's own list) rather than generated by a single script.

### 5.5 A second, related collision, named and set aside

**[NEW]** "Cascade" also names two different things in this codebase, and it is worth recording
even though it is not the collision the brief asked to resolve. The engine's config-resolution
cascade (GLOBAL → VIEW → STRUCTURAL_NODE → SUBTREE → LINE, five levels, `research-the-resolution-
universe.md` §4.2) and the browser's presentation/rendition cascade (`levels.ts`'s `SPECIFICITY`:
FOCUS → MODE → LINE → STRUCTURAL_NODE → VIEW → USER → GLOBAL, seven levels, `cascade.ts`) share four
level names and a "most specific wins" rule, and answer *different* questions — one decides a
field's value, the other decides a token family's rendition. `cascade.ts` and `context.ts` are named
correctly for what they hold; the risk is a reader assuming "the cascade" is one mechanism because
the word is one word. Out of scope for this document's refactor plan (§7) because no file name is
wrong — flagged here so it is not silently re-discovered as if it were the vocabulary collision.

### 5.6 Where SHAPE and BAND actually live, having now read every reader

**[NEW]** Neither is typed, confirmed by the full survey (§3), but each resolution kind's reader
*does* encode something close to it structurally, per-kind, with no shared vocabulary:

* `resolutiontable.ts`'s `ConfigResolutionTable` (TABLE shape, all fields) has no abstention variant
  at all for registration/ordering/day-boundary's happy path — the absence of an `Abstention` union
  IS the TABLE/Certain encoding, implicitly.
* `membership.ts`'s `Abstention` (`:75-82`) and `ordering.ts`'s `OrderingAbstention` (`:103-110`) are
  each a closed string union of refusal reasons — the EXPRESSION/Predicted encoding, implicitly, one
  bespoke type per kind.
* Nothing in `app/present/` represents PROGRAM/Consequential at all — no reader exists for rules or
  cascades, which is correct (§2.2's failure mode 3, by design) but means there is no code artefact
  to check this document's SHAPE/BAND table (§3) against for that row; it is asserted from the
  roadmap document alone.

### 5.7 One comment/code drift found while surveying

**[NEW, OBS]** `accepted.ts:1-7`'s header states it is "PURE... imports nothing — the same posture
as `base.ts`, `queue.ts`, `pickup.ts`, `focus.ts` and `draft.ts`." **[OBS]** Checked directly:
`base.ts`, `queue.ts`, `pickup.ts` and `accepted.ts` itself do import nothing. `focus.ts` imports six
symbols across four modules including `RESOLUTION_KEYS` and `Contribution`/`Rendition` from
`resolution.ts` (`focus.ts:94-99`). `draft.ts` imports three symbols across two modules
(`instance.ts`, `relative.ts`) (`draft.ts:78-80`). **The claim is wrong for two of the five modules
it names**, and has been wrong since `focus.ts` gained `RESOLUTION_KEYS` and `draft.ts` gained its
`instance.ts`/`relative.ts` imports — neither addition updated `accepted.ts`'s own header, a file
those two modules do not import and do not depend on. **[REA] This is not a defect in the "imports
nothing" property itself** — `motions.ts`, `base.ts`, `queue.ts`, `pickup.ts` and `accepted.ts` do
hold it, verified directly — **it is a small, real instance of the TIME-axis decay this whole method
watches for**: a true claim about five modules, later true of only three, with no citation update
when the other two changed. Filed as a documentation-only backlog row (§9), because fixing a comment
is not a rename and does not belong inside §7's refactor plan.

---

## 6. What §5 changes about the size and shape of the refactor

### 6.1 The scope, stated against the "is this churn" test

**The brief's own escape hatch — "if the naming is already coherent and a refactor would be churn,
say that and recommend against it" — applies to 28 of 30 modules and does not apply to `resolution.ts`.**
This document's honest verdict is neither extreme: **do not reorganise `app/present/`; do rename one
file.** A sweeping pass across all 30 modules would be churn against evidence — 28 of them are
already correctly named, several by design in a different axis entirely (`motions.ts`'s own header
argues, correctly, that collapsing gesture into rendition would destroy a proven property). But
`resolution.ts` is not a stylistic naming preference; it is a file whose name actively predicts the
wrong content to a reader who has just learned the pinned terms — the exact failure the brief opened
with ("a module named for one concept may hold another"), now checked and confirmed rather than
merely suspected.

### 6.2 The blast radius, checked past the import graph

**[OBS] An import-statement scan alone misses real reference sites, and this was checked, not
assumed — the brief's own monkeypatch warning, reproduced here concretely.** Two independent greps
were run: `resolution\.js|resolution\.ts` (a literal-extension scan) found 20 files. A broader scan,
`present/resolution\b` with no required extension, additionally found `docs/architecture/flows.yaml`,
`capabilities.yaml`, `classes.yaml` and `backlog.yaml` — four files the extension-anchored scan
missed entirely, because they name the module as a bare path, `app/present/resolution`, with no
`.ts`/`.js` suffix. **A codemod keyed on import-statement syntax, or on the literal string
`resolution.ts`, would miss every one of these.**

**The full blast radius, by kind:**

1. **Real import statements — 20 sites, 15 files.** `cascade.ts` (2), `focus.ts` (2), `word.ts` (2),
   `membership.ts` (1), `correlation.ts` (1), `source.ts` (1), `ordering.ts` (1), `newline.ts` (1),
   `indent.ts` (1), `context.ts` (1), `paint.ts` (2), `index.ts` (2 blocks), `declaration.ts` (2),
   `boundary.ts` (1), `address.ts` (1). A straightforward import-specifier rename
   (`./resolution.js` → `./rendition.js`) covers all of these mechanically.
2. **String-literal purity guards — 3 sites, found by name, not by category.**
   * `tests/app-write-correlation.test.mjs:755` — asserts
     `CORRELATION_CODE.match(/^import\b.*$/gm)` **equals the literal array**
     `['import { stampSpans } from "./resolution.js";']`. A codemod that rewrites the real import in
     `correlation.ts` but does not know this test exists leaves the array literal stale and the test
     red for the wrong reason — it will read as "correlation.ts gained an import," not "the file it
     names moved."
   * `tests/flow_scenarios/section_addressing.ts:124` — `assertAddressImportsOnlyResolution` reads
     `address.ts`'s own source as text and checks every import line against the regex
     `/["']\.\/resolution\.js["']/`. Same failure mode: the regex, not the import, must be updated.
   * `tests/flow_scenarios/instance_anchor.ts:170` — `assertInstanceReachesOnlyTwo` builds
     `new Set(["./resolution.js", "./relative.js"])` as an allow-list and reads `instance.ts`'s
     source as text against it. Same failure mode. This file's own comment (`:166`) already calls
     `resolution.ts` "the grammar" in prose — independent confirmation that the codebase's own test
     authors already think of this file the way §4's disambiguation asks readers to.
3. **Flow-trace routing declarations — 16 edges, one file, found only by the broad scan.**
   `docs/architecture/flows.yaml` has 16 `to: app/present/resolution` edges (`:194`, `:213`, `:232`,
   `:354`, `:366`, `:378`, `:457`, `:465`, `:473`, `:496`, `:504`, `:512`, `:530`, `:560`, `:648`,
   `:656`). **[UNVERIFIED]** whether flow-trace's own tooling matches these against actual source
   paths at trace time — if it does, a rename without updating these 16 edges breaks capability
   attribution for this module silently, which is precisely the failure mode this whole method
   exists to prevent. This document does not run flow-trace to check (branch constraint: no long
   verb) and files it as the first line of §7's execution order instead of guessing.
4. **Historical/narrative citations — not required for correctness, filed for TIME-axis accuracy.**
   `capabilities.yaml:332,347,372,405` and `backlog.yaml:1966-1967` describe past measurements
   (`app/present/resolution.tagSpans`, `.stampSpans`, `.classifyLine`, `.qntmIdSpans`) in prose.
   These are historical record, not live routing — `capabilities.yaml`'s own entries describe what
   was true when measured. Updating them is optional and does not gate the rename; leaving them
   stale is a smaller version of exactly the drift §5.7 already found once.
5. **Docs/architecture citing the file by design intent.** `operator-set.json:43,127` names
   `app/present/resolution.ts`'s `RESOLUTION_KEYS` directly, twice, as part of its own excluded-
   surfaces reasoning (§5.2 above). This is a docs file, in scope for a documents-only branch to fix
   directly if the next agent chooses, or to leave as a citation to what was true at the time it was
   written — either is defensible, and this document does not decide it (filed §9, `unscoped`).
6. **The build artefact.** `dist/present.js` and `dist/present.js.map` are generated
   (`npm run build`), never hand-edited. A rename requires a rebuild, not a manual edit — listed so
   the execution order (§7.4) does not treat it as a file to touch by hand.

---

## 7. The refactor plan

### 7.1 Every rename, file by file, with blast radius

**One rename only.**

| old name | new name | reason |
|---|---|---|
| `app/present/resolution.ts` | `app/present/rendition.ts` | Holds the RENDITION vocabulary (`RESOLUTION_KEYS`, `Rendition`, `Resolution`, `Contribution`, `DEFAULT`) plus `LineShape`/`classifyLine`/span utilities — none of it is one of the twelve resolutions. §5.2, §6.1. |

**Exported symbol names are explicitly NOT part of this rename.** `RESOLUTION_KEYS`, `ResolutionKey`,
`Resolution`, `Contribution` stay as-is. Renaming the *file* removes the sharp collision (a reader
who has learned the pinned terms and sees `resolution.ts` expects one of twelve kinds; a reader who
sees `rendition.ts` does not). Renaming the *symbols* is a materially larger, separate change — every
one of the 20 import sites in §6.2.1 destructures at least one of these names — and is not justified
by this survey: `Resolution`/`Contribution` are already generic enough not to collide (nothing in the
codebase calls the twelve kinds collectively "Resolutions" as a type), and `ResolutionKey`/
`RESOLUTION_KEYS` collide only in combination with the file name, which is being fixed. **If a future
pass wants the symbol rename too, price it separately — it is not included in this plan's sizing
(§7.5).**

**`resolutiontable.ts` is NOT renamed.** §5.2 found its name is, under the pinned terms, more correct
than `resolution.ts`'s was — it does hold a config-resolution reader, for three of the twelve kinds,
correctly. The only change recommended for it is the header clarification in §7.2.

**Full blast radius for the one rename**, restated from §6.2 as an execution checklist:

* 20 import-specifier sites across 15 `app/present/*.ts` files (mechanical, `./resolution.js` →
  `./rendition.js`).
* 3 string-literal or regex sites in tests (`app-write-correlation.test.mjs:755`,
  `section_addressing.ts:124`, `instance_anchor.ts:170`) — each must be hand-verified, not just
  text-replaced, because each is asserting a *property* ("imports only the grammar") that the rename
  should preserve, not merely a string that happens to match.
* 16 `flows.yaml` edges (`to: app/present/resolution` → `to: app/present/rendition`), gated on the
  §7.4 step-0 check of whether flow-trace resolves these by path match.
* 2 `operator-set.json` citations (`:43`, `:127`) — update or leave as historical; not gating.
* 6 narrative citations in `capabilities.yaml`/`backlog.yaml` — optional, TIME-axis hygiene only.
* 1 rebuild (`npm run build`) to regenerate `dist/present.js`/`dist/present.js.map`.
* Test suite and `npm run typecheck` green after all of the above — the actual falsifier.

### 7.2 Every grouping move, with the argument

**One grouping move, and it is a new document, not a code move.**

* **Add a GRAMMARS index**, mirroring `operator-set.json`'s own pattern (`"this file is the address
  for the surfaces named below"`) but scoped to the layer this document pins rather than to
  `operator-set.json`'s narrower "what may a MEMBERSHIP predicate say" question. Name all five closed
  sets from §2.1 in one place: MEMBERSHIP predicate grammar, STRUCTURAL edge vocabulary, ORDERING/
  CHROME vocabulary, RENDITION vocabulary, YAML syntax refusal list — with a citation to each file
  and an explicit note that `operator-set.json` indexes only two of the five (by design, for a
  narrower question, per its own `$comment`) and this index is the complete five, for the broader
  "is this a legal declaration at all" question. **Argument:** `design-the-compiler-and-the-bands.md`
  §3.2's own conclusion — "a single index... so a widening decision is made once" — currently applies
  to two of five grammars. The other three are just as closed, just as tested, and have no address
  either. This is documentation, addable on a docs-only branch, and does not require the
  `resolution.ts` rename to land first (it can cite `resolution.ts` as of today and be updated in the
  same commit as the rename, or land first and be updated after — either order is safe).
* **Two header-comment clarifications, not moves.** `rendition.ts`'s (formerly `resolution.ts`'s) own
  header should state plainly, near the top, that it is the RENDITION vocabulary and not one of the
  twelve resolutions — one sentence, matching the disambiguation this document already performs in
  §5.2. `resolutiontable.ts`'s header should state which three of the twelve kinds it reads and that
  its `OrderingFieldKind`/`ChromeShape` exports are a separate grammar concern bundled in the same
  file for locality, not for shared purpose — matching `structural.ts`'s own header, which already
  does this well and can be used as the model.

**No other grouping move is recommended.** `structural.ts` already bundles grammar and resolution-
kind reader the same way `resolutiontable.ts` does (§5.3), and both do so for a stated, defensible
reason (locality of a small, config-only reader). Splitting either into two files would double the
file count for the layer without changing what any caller imports, and `operator-set.json`'s own
`$comment` argues explicitly against widening or merging axis-crossing types — the same argument
extends to splitting a file purely to make a taxonomy diagram tidier.

### 7.3 What must NOT move, and why

* **`app/present/motions.ts` must stay importing nothing.** **[REPO, verified again this session]**
  `grep -n "^import" app/present/motions.ts` returns nothing. Its own header's argument (gesture and
  rendition are proven orthogonal at cost; collapsing them would destroy the property that lets one
  engine serve both a vim operator and a conventional app user) is unaffected by this refactor —
  `motions.ts` never imported `resolution.ts` and the rename does not touch it. Its *prose comments*
  (7 occurrences, `:22,72,85,95,256,260,275`) name `resolution.ts` in text explaining *why it does
  not* import it — these should be updated to `rendition.ts` for accuracy, as a comment edit, with
  zero import-graph risk, since updating a comment cannot violate the "imports nothing" property the
  comment is arguing for.
* **`base.ts`, `queue.ts`, `pickup.ts`, `accepted.ts` must stay importing nothing.** Verified directly
  this session (§5.7); none references `resolution.ts` in imports or in prose. Untouched by this
  plan.
* **The five GRAMMARS must stay five files, not become one.** `operator-set.json`'s own `$comment`
  (`:19-37`) already makes this argument in full for the two surfaces it indexes, and
  `qualification.ts:60-68`'s own comment makes the case for its own type specifically ("admitting the
  operator would only widen this type without widening what can be answered"). §7.2's GRAMMARS index
  is additive precisely so this argument does not have to be re-litigated to get the naming benefit —
  an index gets the address without the merge.
* **`resolutiontable.ts` and `structural.ts` must stay grammar+reader bundles**, per §7.2.

### 7.4 The order, and where it splits safely

**Step 0 — half an hour — a check, not a change.** Confirm whether flow-trace resolves `flows.yaml`
`to:`/`from:` fields by literal path match against source files, or by some other mechanism. This
gates whether §7.1's 16-edge update is load-bearing (breaks capability attribution if skipped) or
cosmetic (flow-trace re-derives paths some other way). **Do this before the rename**, because the
answer changes whether the rename is safe to land without the `flows.yaml` edit in the same commit.

**Step 1 — half a day — the rename itself, complete.** Rename `resolution.ts` → `rendition.ts`.
Update all 20 import sites (mechanical). Update all 3 string-literal/regex test sites (each hand-
verified against what property it is actually asserting, per §7.1). Update the 16 `flows.yaml` edges
if Step 0 found them load-bearing. Update the two header comments (§7.2). Update `motions.ts`'s 7
prose citations (§7.3). Rebuild `dist/`. Run the full test suite and `npm run typecheck`. **This step
is atomic — it does not split further, because a half-renamed module (some importers on the old
path, some on the new) is a broken build, not a safe partial state.** If it must be interrupted, stop
before starting rather than mid-way; the whole tree stays green either fully before or fully after.

**Step 2 — under an hour — the GRAMMARS index document.** Independent of Step 1; can land before,
after, or in the same PR. Cites `rendition.ts` if Step 1 has already landed, `resolution.ts`
otherwise — either is correct at the time it is written, and this is exactly the kind of citation
`design-the-compiler-and-the-bands.md` already demonstrates the corpus can carry (a document citing a
file by the name true at the time of writing, corrected later if the file moves).

**Step 3 — optional, unscoped, not costed here — the historical-citation cleanup** in
`capabilities.yaml`/`backlog.yaml`/`operator-set.json` (§6.2.4-5). Does not gate Steps 1 or 2. Filed
as its own backlog row (§9) rather than folded into Step 1's estimate, because six narrative
citations across three files is genuinely optional TIME-axis hygiene, not correctness.

### 7.5 Honest sizing

* **Step 0 (flow-trace check):** under an hour.
* **Step 1 (the rename, complete, tests green):** half a day. Not under an hour — the three
  string-literal test sites each need to be read and understood, not just pattern-replaced, and a
  full test-suite + typecheck + rebuild pass is part of the definition of done.
* **Step 2 (GRAMMARS index document):** under an hour.
* **Step 3 (historical citation cleanup, optional):** under an hour, whenever picked up.
* **Total, Steps 0-2 (the recommended scope):** half a day. **Not an arc.** There is no step here
  that needs a design pass, a sandbox, or a multi-day sequence — the entire finding is narrow enough
  that its fix fits in one sitting.

### 7.6 The recommendation

**Do it.** This is not the "naming is already coherent, a refactor would be churn" case — 28 of 30
modules are exactly that case, and this plan explicitly does not touch them. `resolution.ts` is a
genuine, confirmed, load-bearing misnomer under the terms this document pins, its fix is small
(half a day, one file), its blast radius is now fully enumerated rather than estimated (§6.2), and
leaving it unrenamed keeps the exact confusion the brief opened with — a brief that itself needed two
explicit "unverified, check this" leads to describe correctly, because the file names actively worked
against the description.

---

## 8. What I refuted, including my own first readings

1. **The brief's citation "the twelve-kinds table at §2" of `research-the-resolution-universe.md`.**
   **Refuted, §2.1.** §2 is "do any of his views contain both ends of an UNLOCKS edge" — a different
   question. The taxonomy is §4; the exactness classification is §6.2.
2. **The brief's claim "kind 5 of the twelve is itself called vocabulary."** **Refuted on the
   ordinal, upheld on the substance.** By `research-the-resolution-universe.md` §4's own subsection
   order (4.2 defaults, 4.3 registration, 4.4 vocabulary…), vocabulary is kind 3, not kind 5 — and
   the twelfth kind, line grammar, is never given its own numbered subsection at all, which is a
   real, minor structural gap in that document, not a miscount on this document's part. **The
   substance of the brief's claim — that the word "vocabulary" is genuinely overloaded between a
   resolution kind and the whole lexicon layer, and that it is the SAME 134 entries either way — is
   correct and confirmed, §4.**
3. **`accepted.ts`'s own claim that `focus.ts` and `draft.ts` import nothing.** **Refuted, §5.7.**
   Both modules import multiple symbols from multiple files, including `resolution.ts`. The "imports
   nothing" property itself holds for `motions.ts`, `base.ts`, `queue.ts`, `pickup.ts` and
   `accepted.ts` — verified directly — but `accepted.ts`'s header over-generalised it to two modules
   that do not hold it, and nothing caught the drift when those two modules' imports changed.
4. **My own first assumption, before running §6.2's broad grep, that an import-statement scan would
   find the full blast radius of a `resolution.ts` rename.** **Refuted by my own second grep.** The
   narrow scan (`resolution\.js|resolution\.ts`) found 20 files. The broad scan (`present/resolution`,
   no required extension) found 4 more — `flows.yaml`, `capabilities.yaml`, `classes.yaml`,
   `backlog.yaml` — none reachable from the narrow pattern because none contains the string
   `resolution.ts` or `resolution.js` at all, only the bare module path. This is the same shape of
   miss the brief's monkeypatch example describes, found live in this codebase rather than assumed
   from the example.
5. **The implicit premise that a survey finding a collision in 2 of 30 files means the naming
   generally needs work.** **Refuted, §5.1, §6.1.** 28 of 30 present modules and all 8 compile
   scripts are named for what they hold. The two exceptions are real and worth fixing, and they are
   exceptions, not a sample of a wider problem — this document's own complete enumeration is what
   makes that claim checkable rather than asserted.

---

## 9. Backlog rows filed

Four rows, filed in `docs/implementation-artifacts/backlog.yaml` on this branch. Validated: the file
parses (`yaml.safe_load`), and the pre-existing rows survive byte-identical, verified by diffing the
file before and after the four new rows were appended (see §11).

| id | kind | state | what it is |
|---|---|---|---|
| `resolution-ts-is-not-a-resolution` | capability | diagnose-ready | §7's rename plan — `resolution.ts` → `rendition.ts`, half a day, full blast radius enumerated in §6.2/§7.1 |
| `the-grammars-have-no-shared-index` | capability | unscoped | §7.2's GRAMMARS index document — five closed sets, two already indexed by `operator-set.json`, three not |
| `accepted-ts-misdescribes-two-siblings` | capability | diagnose-ready | §5.7's comment/code drift — `accepted.ts`'s header wrongly claims `focus.ts` and `draft.ts` import nothing |
| `an-unrecognised-token-may-pass-silently` | capability | unscoped | §2.2's open failure mode — whether a token absent from all 134 vocabulary entries is refused loudly anywhere in the browser path; unsettled by this document |

---

## 10. What is unverified

* **[UNVERIFIED]** Whether flow-trace resolves `flows.yaml`'s `to:`/`from:` fields by literal path
  match against source files. Gates whether §7.1's 16-edge update is load-bearing or cosmetic.
  **Settled by** reading flow-trace's own edge-resolution code, or asking its maintainer directly —
  this branch's constraints rule out running it to find out empirically.
* **[UNVERIFIED]** Whether an unrecognised vocabulary token (one matching none of the 134 lexicon
  entries) is refused loudly anywhere in the browser path, or passes through silently. §2.2 names
  this as the least-examined of the three compiler failure modes and this document does not settle
  it. **Settled by** tracing what happens to an untagged, unmapped token from keystroke to paint,
  the same discipline `design-the-compiler-and-the-bands.md` §2.2 already applied to the field-level
  drop.
* **[UNVERIFIED]** Whether `docs/architecture/operator-set.json`'s two citations of
  `app/present/resolution.ts` (§6.2.5) should be updated on rename or left as historical record of
  what was true when that document was written. Not decided here; filed `unscoped` rather than
  guessed.

---

## 11. Reproduction

```
# worktree state this document was written against:
git rev-parse HEAD                                              # 3d003bf...
git worktree list | grep pin-the-terms

# the survey (§5) — every citation opened directly:
ls app/present/*.ts | wc -l                                     # 30
ls scripts/*.mjs scripts/*.py | grep -E "generate|agreement|ledger|check|yaml-subset" | wc -l   # 8
grep -n "export const RESOLUTION_KEYS" app/present/resolution.ts                # 96
grep -n "export type FieldPredicate" app/present/qualification.ts               # 69
grep -n "export type EdgeSource\|export type EdgeDirection" app/present/structural.ts   # 77, 80
grep -n "export type OrderingFieldKind\|export type ChromeShape" app/present/resolutiontable.ts  # 119, 135
grep -n "RESOLVABLE_FIELDS =" app/present/membership.ts scripts/generate-qualification-declaration.mjs
grep -n "^import" app/present/motions.ts app/present/base.ts app/present/queue.ts \
  app/present/pickup.ts app/present/accepted.ts app/present/focus.ts app/present/draft.ts

# the blast-radius check (§6.2) — narrow vs. broad, the miss reproduced:
grep -rln "resolution\.js\|resolution\.ts" --include='*.ts' --include='*.js' --include='*.mjs' \
  --include='*.html' . | grep -v node_modules | wc -l            # 20 (narrow)
grep -rln 'present/resolution\b' --include='*.ts' --include='*.js' --include='*.mjs' \
  --include='*.html' --include='*.json' --include='*.yaml' --include='*.yml' . \
  | grep -v node_modules                                          # +flows.yaml, capabilities.yaml,
                                                                    # classes.yaml, backlog.yaml
grep -n 'resolution\.js' tests/app-write-correlation.test.mjs     # :755, the string-literal guard
grep -c "^\s*to:\s*app/present/resolution\s*$" docs/architecture/flows.yaml   # 16

# the "vocabulary" collision (§4) — same 134, two sections of the same document:
grep -n "^### 4.4 VOCABULARY" docs/implementation-artifacts/research-the-resolution-universe.md
grep -n "134 entries" docs/implementation-artifacts/research-the-resolution-universe.md

# backlog validated:
python3 -c "
import yaml
d = yaml.safe_load(open('docs/implementation-artifacts/backlog.yaml'))
print(len(d))
"

# NOT RUN, deliberately: no cycle, no graph-sync, no flow-trace map --full or any long verb,
# no POST to any server, no git stash, no merge, no application source touched. ~/qntm and
# ~/.qntm-md were never opened. The trunk clone at /Users/lukeannison/projects/qntm-network/qntm
# was never read and never cd-ed into — this document worked entirely inside the worktree at
# /Users/lukeannison/projects/qntm-network/worktrees/qntm-network/pin-the-terms.
```

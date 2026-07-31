# Design: the structural language — what a gesture means, and who is allowed to say so

**Status: design only. No application source is modified on this branch. This document is the only
file it adds.**

**Branch:** `design/structural-language`, based on `origin/main` @ `f416f64`.

**Scope:** how a gesture in the browser comes to MEAN a change to the graph's structure — where
that meaning is declared, who reads the declaration, and what the app is allowed to know about it.
It is the INGEST half of the cascade whose OUTPUT half is `design-presentation-cascade.md`. It
governs refactors; it is not itself a refactor.

The operator named the capability in his own words on 2026-07-31:

> "this unlocked other things right. It's the structural foundation for the right way to build FE
> … So we can do things like tab indent to restructure things out of parents or under partners or
> under new parents. That's a big part of the system's structural language. Which works in Obsidian
> combined with our config. That needs to work in web. **My config for instance says adding an
> indent means setting indent in parent as part of node directed edge. So we need a structural
> language detector so config can say what it means** etc."

The brief that commissioned this document read that as aspirational — as a capability that does
not exist, in which "the engine decides and the config only chooses which edges a view traverses".

**That is wrong, and it is wrong in the direction that makes the work smaller.** His config says
exactly what he says it says. I proved it by mutation. The result is in §0.1 and it reorganises
everything downstream.

**Evidence labels** follow `design-presentation-cascade.md` and `design-the-vim-cursor.md`:

* **[OBS]** — I ran it or read it and am reporting the output.
* **[REA]** — reasoned from something labelled [OBS]. Stated as reasoning, never as measurement.
* **[REPO]** — quoted from a record I did not independently reproduce.
* **[UNVERIFIED]** — named, with the experiment that would settle it.

**Absence is never proven by a grep returning nothing.** Where I claim something does not exist I
either mutated the producer and watched the consumer, or enumerated every construction site of the
thing. Both techniques appear below.

Sizes are the house scale: **under an hour** / **half a day** / **an arc**.

**Naming.** `qntm` is the engine. `qntm.network` is the product. Engine paths below are read-only
in `/Users/lukeannison/projects/qntm-network/qntm`; app paths are this worktree.

---

## 0. Lead — the eight things established before any design

### 0.1 An indent's meaning is DECLARED, and I proved it by mutation, not by reading

**[OBS]** The applier does not name `PART_OF`. It asks the vocabulary
(`apps/qntm-md/src/qntm_md/io/applier.py:2740-2746`):

```python
indent = (
    section_indent
    if section_grammar_override
    else structural_token_resolver.indent_binding()
)
if indent is None or line_claims_indent:
    continue
```

and then builds the edge out of what it was told —
`edge_type_name=indent.edge_type` (`applier.py:2807`), with the direction chosen by
`indent.edge_source` (`applier.py:2801-2803`).

The declaration is `apps/qntm-md/config/vocabulary/structural_tokens.yaml:58-63` — the operator's
live config, the same tree `graph-sync` ships:

```
  - token: positional_binding
    structural_token:
      kind: positional_bindings
      indent:
        edge_type: PART_OF
        edge_source: self
```

Its own comment, `structural_tokens.yaml:57`, is the sentence the operator paraphrased to us:

> `indent -> PART_OF child->parent, the default when the slot is unclaimed.`

**Compare his words: "adding an indent means setting indent in parent as part of node directed
edge."** `PART_OF`, child to parent, directed. He was not describing an ambition. He was quoting a
file.

**[OBS] The mutation.** I copied the config tree to a scratchpad, changed it, and loaded the bundle
with the engine's own loader. No cycle was run and no vault was touched.

| Config edit | `StructuralTokenResolver.indent_binding()` returns |
|---|---|
| unmodified | `IndentBinding(edge_type='PART_OF', edge_source='self', pull_context='ancestors')` |
| `PART_OF` → `WAITING_FOR`, `self` → `position` | `IndentBinding(edge_type='WAITING_FOR', edge_source='position', pull_context='ancestors')` |
| `indent:` key renamed away | `None` |
| `edge_source: sideways` | `BundleValidationError at …/structural_tokens.yaml:59: malformed positional_bindings indent block` |

Four results, four facts. **The edge type an indent creates is config. The direction is config. That
an indent means anything at all is config** — with the key removed the resolver returns `None` and
the applier's `if indent is None … continue` creates no edge, so a valid configuration of this
system is one in which indentation is not structural at all. **And the declaration has a grammar
that is validated at load with a file and a line.**

This is a declared, validated, versioned language. It is not a hardcoded behaviour.

### 0.2 But the brief's OBSERVATION was right — and the two layers are different things

The brief said depth is a raw leading-space count with a `>=` pop, so any increase reparents.
**[OBS] True, at `apps/qntm-md/src/qntm_md/diff/content_diff.py:721-722`** (the path is
`diff/`, not `io/` — the brief's directory was wrong and its line numbers were right):

```python
depth = len(normalised) - len(normalised.lstrip())
while stack and stack[-1][0] >= depth:
    stack.pop()
```

**[OBS]** There is no unit. No division, no modulo, no `indent_size`. `depth` is a raw column
count, so one extra space is a full level and one fewer space is a full de-parent. The only
normalisation is `normalised = line.expandtabs(4)` (`content_diff.py:686`).

**So the brief inferred a conclusion its own observation does not support.** Detection being
hardcoded does not make meaning hardcoded. They are two layers with a seam between them:

* **Detection** — Python, unit-free. Answers *"this line's structural parent is line N."* Pure
  topology. Nothing in it names an edge.
* **Meaning** — YAML, cascading. Answers *"a parent relation on line N is an edge of type T in
  direction D."*

**The whole design turns on keeping these apart.** The topology is not the language. The language
is what the topology means, and only the second half is declared — which is the correct half,
because "one column further right is nested" is a fact about outline text, and "nested means
`PART_OF`" is a fact about this instance.

### 0.3 The structural language already CASCADES — global, then view, then line

**[OBS]** Three levels ship today.

**Global** — `structural_tokens.yaml` (§0.1), read via `indent_binding()`.

**View section** — a section declares its own structural language and overrides the global one.
`applier.py:2820-2845`, `_section_indent_binding`:

> Returns (override, binding). override=False => the section speaks the global default language …
> override=True => the section declares its own language: binding carries its edge type +
> direction … A multi-type declaration is interpret-ambiguous for authoring, so it resolves to
> (True, None) — structural ingest stays silent there rather than guessing.

Six of the operator's live views declare one — `config/views/operator-qntm.yaml:34-38`,
`operator-qntm-network.yaml:33-34`, `operator-flowtrace.yaml:26-27`,
`operator-trace-orchestration.yaml:38-39`, `waiting-for-work.yaml:16-17`,
`waiting-for-personal.yaml:15-16` — all of the shape `structural_edge_types: [WAITING_FOR]` with
`structural_edge_direction: incoming`.

**Line** — a bare tag on the line can take the indent slot away from the default.
`structural_tokens.yaml:76-92` declares `claims_indent: true` for `#waiting-for`, `#sponsors`,
`#next` and `#parallel`; the applier honours it at `applier.py:2686-2687` and suppresses the
default binding at `:2746`.

**[REA] Global → view → line is the same cascade shape the presentation work established for
output.** It was not designed here for this document; it is already in the engine, already used by
the operator's own config, and already has the "more specific wins" ordering.

### 0.4 One declaration is read in BOTH directions — this is the round-trip guarantee

**[OBS]** The same two section keys drive render and ingest.

Render, `apps/qntm-md/src/qntm_md/render/section_builder.py:121-133`:

```python
elif section.structural_edge_direction == "incoming":
    render_children = lambda nid: graph.parents(nid, edge_type=edges)
```

Ingest, `applier.py:2841-2843`:

```python
edge_type=str(declared[0]),
edge_source="self" if direction == "incoming" else "position",
```

`section_builder.py:89-90` states the principle outright:

> the WAY they are read is config (capabilities-not-policies); **the engine hardcodes no edge-type
> name and no orientation.**

And the operator's own config records what it buys him, `config/views/operator-qntm.yaml:31-33`:

> One declaration read both directions (view-render-language-is-ingest-language) — authoring an
> indented line under an awaited item here IS a new waiter.

**[REA] This is `accept ⊇ emit` for relationships, and it holds by construction in any section that
declares a language** — the same declaration produced the nesting and will read the nesting back.
It is not a coincidence to be tested per view; it is one expression used twice. §6 examines where
it stops holding.

### 0.5 Whether an indent MOVES a node or ADDS a relation is declared too — in a fourth place

**[OBS]** `applier.py:2953-2961`:

```python
_edge_def = graph.registry.edge_types.get(edge_type_name)
if _edge_def is not None and _edge_def.cardinality in ("many_to_one", "one_to_one"):
    for _stale_edge in existing:
        delete_edge.dispatch("delete_edge", {"edge_id": _stale_edge.id}, graph)
```

The relocate-or-accumulate decision reads the edge type's **cardinality** from the registry, which
is config — `config/schema.yaml:892-898`:

```
edge_types:
  PART_OF:
    direction: child_to_parent
    cardinality: many_to_one
  WAITING_FOR:
    direction: directed
    cardinality: many_to_many
```

**[REA] So the identical keystroke has two different meanings in two sections of the operator's own
vault, and config is the whole reason.** In `## Outcomes` (no override, so `PART_OF`,
`many_to_one`) an indent **moves** the node — the old parent edge is deleted first. In
`## Waiting For` (override to `WAITING_FOR`, `many_to_many`) an indent **adds** a waiter and the
previous relation survives.

**This is the single most important fact for the front end.** "Indent" is not one gesture with one
meaning that the app can label once. Its meaning is a function of where the cursor is. An app that
shows the operator what a keystroke will do must resolve that per line, and everything it needs to
resolve it is already written down.

### 0.6 `LATERAL_MOVED` is DEAD CODE — a fact the brief handed me as established is false

The brief instructed me to build on this rather than rediscover it:

> **A whole-line MOVE is safe** — absorbed as `LATERAL_MOVED` via the identity stamp.

**[OBS] Nothing in the engine ever constructs a `LATERAL_MOVED` candidate.** I enumerated every
use of the enum across `apps/qntm-md/src`, excluding tests, and separated construction from
comparison:

```
CONSTRUCTION (category=…):
  coordination/orchestrator.py:3644   EditCategory.ADDED
  diff/content_diff.py:1234           EditCategory.CHANGED
  diff/content_diff.py:1290           EditCategory.CHANGED
  diff/content_diff.py:1351           EditCategory.ADDED

COMPARISON ONLY (== / != / in / is):
  io/applier.py:2153-2154, :2417, :2769, :4290   EditCategory.LATERAL_MOVED
  diff/content_diff.py:1396                      (a log counter)
```

Four construction sites, none of them `LATERAL_MOVED`. The member exists at
`content_diff.py:136`, four applier branches still dispatch on it, and no input can reach them.
**[REPO]** `diff/signature.yaml:85` records the cut as deliberate: *"#137's strand-1 cut dissolved
LATERAL_MOVED emission (the differ only classifies ADDED / CHANGED)"*, and the module docstring
(`content_diff.py:21`) says flatly *"There is no `REMOVED`"*.

**The live classification surface is two members: `ADDED` and `CHANGED`.**

**This matters beyond tidiness.** `orchestrator.py:3551-3554` still argues the safety of deletion
synthesis from the premise that a moved line is classified `LATERAL_MOVED` — a premise that has
been false since the strand-1 cut. The deletion path is probably still safe (four independent
hold-guards at `applier.py:1024-1048` do real work), **but its stated justification no longer
describes the machine.** [UNVERIFIED] whether a cross-file move survives on the guards alone; §9
names the test.

### 0.7 Sibling ORDER is not a structural fact, and reordering means nothing

**[OBS]** A pure reorder is an explicit no-op. `content_diff.py:1236-1237`, on a line matched by
fingerprint at a new line number with an unchanged parent hash:

> `a PURE vertical relocation — same content, same parent, matched by fingerprint to its own cache
> row. The operator did not touch this line; the RENDERER moved it. A move is not an edit, so it
> emits NOTHING`

— falling to a bare `continue` at `:1259`.

**[OBS]** There is nowhere for order to live. `core/graph/src/qntm_graph/types.py:19-21` and
`:36-40` define `Node` as `(id, type, fields)` and `Edge` as `(id, type, source, target, fields)`.
No ordinal, no sequence.

**[OBS] `insertion_position` — the field that would carry authored order — has no writer.** Every
use in `src/` is a read:

```
render/section_builder.py:370, :460, :462, :465          node.fields.get("insertion_position")
capabilities/…/dispatchers/order_siblings.py:66-68        sorted by s["insertion_position"]
```

and it appears nowhere in `config/`. The engine says so itself at `section_builder.py:449-451`:
*"`insertion_position` is meant to be the durable memory once placement info is gone, but nothing
writes it for THIS purpose anywhere in the codebase."*

**[REA] So drag-to-reorder is not blocked on the browser. It is blocked on the graph having no
place to record the answer.** That reframes a backlog rejection from a UI decision into an engine
gap, and §5 ranks it accordingly.

### 0.8 A declaration channel to the browser ALREADY EXISTS, and its grammar is closed

**[OBS]** `presentation.json` sits at the site root, is fetched by the page
(`app/index.html:880-895`), and is read by `app/present/declaration.ts:64`. Its own note calls it
*"The GLOBAL level of the presentation cascade."*

**[OBS]** The reader is strict in exactly the way this design needs.
`declaration.ts:87-100`: an unknown key is not ignored — it becomes a reported problem:

```ts
problems.push(
  `'${key}' is not a resolution key and was NOT applied — the keys are ` +
    `${RESOLUTION_KEYS.join(", ")}`,
);
```

**[REA] So the wire exists, the reader exists, the strictness exists — and the grammar admits only
`Rendition` values for `RESOLUTION_KEYS`.** A structural key posted into this file today would be
rejected as a problem. That is the correct behaviour and it is also the precise size of the work:
**widening a document's grammar, not inventing a channel.**

**[OBS]** Meanwhile the whole engine config already leaves the operator's machine.
`scripts/graph-sync.mjs:629-635` tars `config/` entire and `:662-668` POSTs it to `/config`.
`structural_tokens.yaml` is on the server today. **It is available to the server as engine input
and to the browser not at all.**

---

## 1. Q1 answered — declared, in four places, with one gap

| What | Declared where | Verified how |
|---|---|---|
| Which edge an indent creates | `structural_tokens.yaml:61-63` | mutation, §0.1 |
| Which way the edge points | same, `edge_source` | mutation, §0.1 |
| Whether an indent means anything | same, key presence | mutation → `None`, §0.1 |
| Per-view override of both | section `structural_edge_types` / `structural_edge_direction` | `applier.py:2832-2843`, six live views |
| Per-line claim of the slot | `claims_indent` | `applier.py:2686`, `:2746` |
| Move vs add | edge `cardinality`, `schema.yaml:892-898` | `applier.py:2953-2961` |
| Whether a removed line deletes | `deletion_gestures.yaml:19` | `orchestrator.py:3583-3584` |

**The gap.** **[OBS]** `edge_source` is validated against an enum; `edge_type` is **not** checked
against the edge registry at bundle load. `edge_type: NOT_A_REAL_EDGE` with a valid `edge_source`
loads clean and yields `IndentBinding(edge_type='NOT_A_REAL_EDGE', …)`. A typo in the structural
language survives validation and fails later, at apply time, per line. [UNVERIFIED] what the
failure looks like — probably an `EdgeResolutionError` needs-attention diagnostic
(`applier.py:2789-2800`), but I did not run a cycle to see it. **Any app that shows the operator
what a gesture will do inherits this hole**, because it would faithfully display a name the graph
has never heard of.

**Verdict: the operator is describing wiring, not a capability that does not exist.** The language
is declared, cascading, validated and live. What does not exist is a reader outside the engine.

---

## 2. Q2 — the whole language

Every row is cited. "Declared" means config changes the behaviour; "hardcoded" means only Python
does.

| Gesture | Detected at | Meaning | Declared? |
|---|---|---|---|
| Indent / outdent | `content_diff.py:721-722` | edge of declared type + direction | **detection hardcoded, meaning DECLARED** |
| Un-indent to root (detach) | `applier.py:2750-2768` | tear down the stale parent edge | **hardcoded** — the special case has no declaration |
| Re-indent under a new parent | `applier.py:2946-2961` | relocate or accumulate | **DECLARED** via cardinality |
| Bare positional tag (`#requires`, `#unlocks`, `#waiting-for`) | `applier.py:2670-2735` | token → position → edge + direction | **DECLARED end to end** — `structural_tokens.yaml:76-92` |
| Field binding (`#summary`, `#link`) | `applier.py:441`, `:468` | write text into a field, mint no node | **DECLARED** — `structural_tokens.yaml:101-109` |
| Parent change without depth change | `fingerprint.py:39-41`, `content_diff.py:1274-1290` | `CHANGED`; re-resolves the parent | **hardcoded** |
| Move between `##` sections | `content_diff.py:581-590` (heading folded into the chain) | `CHANGED`; destination defaults apply | **hardcoded**, but the destination's *language* is declared |
| Move between files / views | `content_diff.py:1186-1201` | `ADDED` at the destination, rebinding by stamp | **hardcoded, and deliberately given no distinct meaning** |
| Line removed | `orchestrator.py:3506-3654` | `delete_node` | **enablement DECLARED** (`deletion_gestures.yaml:19`), logic hardcoded |
| `#delete` | `applier.py:913-1065` | `delete_node` | **token DECLARED**, logic hardcoded |
| `#rename-to:` | `applier.py:1068+` | retitle, keeping identity | **hardcoded** |
| Type tag changed | `applier.py:1827-1866` | destructive delete + recreate, edges replayed | **hardcoded** |
| Chains (`#next`, `#parallel`) | `applier.py:3659-3670` | two fixed buckets | **tokens declared, buckets hardcoded** |
| Render order | `section_builder.py:373-419` | sort by declared fields | **DECLARED** (`ordering:`) |
| **Sibling reorder** | **not detected — explicit `continue`, `content_diff.py:1259`** | **none** | **no meaning to declare** |
| Split / join a line | not recognised | presents as `CHANGED` + `ADDED`, or `CHANGED` + a deletion | **hardcoded, and not a single intent** |

**[REA] The pattern in this table is the finding.** The declared/hardcoded split does not run along
a principle — it runs along *how recently each gesture was built*. The positional-tag family is
declared end to end and is the newest. Indent is declared for meaning and hardcoded for detection.
Type migration — the most destructive operation in the list — is entirely Python. **There is no
single seam through which "a gesture" is declared.** `structural_tokens.yaml` is the closest thing
and it covers the indent slot and the tag→position family only.

**The asymmetry the brief asked me to develop.** Moving is safe and removing deletes — but §0.6
shows the mechanism it credited for the first is dead, and the real asymmetry is sharper than
"move vs delete":

* **Position is never authority for a mutation.** A line that moved and did not change says
  nothing (`content_diff.py:1211-1213`, `:1236-1259`).
* **Absence IS authority for a mutation** — the strongest one available
  (`orchestrator.py:3506-3654`).

**[REA] So the language reads presence-with-difference as intent, absence as intent, and
position-alone as noise.** Every consequence follows from that. Reorder means nothing *because*
position is not authority (§0.7). A cross-file move is an `ADDED` plus an absence *because* the
system will not infer identity from where a line sits. And the reason `Tab` is frightening is that
indent is the one gesture where **position alone IS authority** — the single exception to the
rule the rest of the language is built on. That exception is exactly why its meaning was pushed
into config, and it is why it deserves a preview in the app.

---

## 3. Q3 — where `INDENT_UNIT = 4` belongs, and the tempting answer is wrong

**[OBS]** The fact exists as two executable copies that disagree:

* `app/present/indent.ts:104` — `export const INDENT_UNIT = 4;`
* `app/present/paint.ts:892-895` — `row.style.marginLeft = (shape.indent.length / 2) * 1.2 + "rem";`

plus two compiled duplicates in `dist/present.js:952` and `:1377`, one historical copy that a live
test re-fetches from git (`tests/present-golden.test.mjs:66-69` runs `git show ${BASE}:app.html`),
a hard-coded `4` in `tests/present-motions.test.mjs:468`, and roughly nine prose transcriptions —
three of which cite mutually inconsistent stale locations (`paint.ts:697`, `paint.ts:650`, actual
`paint.ts:895`).

**[OBS]** One correction to the brief: `paint.ts`'s copy was **not** transcribed from a stylesheet.
I searched every CSS file and `<style>` block for an indent-per-level value and there is none; the
`.viewbody` list padding is explicitly zeroed (`app/index.html:548`). It was carried over from
inline JS — `app.html:246` at commit `64c3a87`, byte-for-byte the same expression.

**The tempting answer is that the `4` belongs in the structural language, beside the declaration
that says what an indent means.** It is tempting because `indent.ts`'s own header argues exactly
that: the unit is "the only thing standing between a keystroke and a graph edit".

**I think that is wrong, and §0.2 is why.** The engine has **no** indent unit on the ingest side.
Detection is unit-free: any column increase nests. An app that emitted two spaces per level would
produce **structurally identical** results to one that emits four. The `4` cannot be a structural
fact, because changing it changes no edge.

**[OBS]** What the `4` actually is: an **emission convention**.
`apps/qntm-md/src/qntm_md/render/renderer.py:947-950`:

```python
# AC #15 (Story 11.4 reopen 2026-05-05): 4 spaces per depth level matches
# Obsidian convention and the input vault's indentation style, so the
# rendered child line round-trips back to the same parent_context_hash.
line_text = f"{'    ' * depth}- {' '.join(cell for cell in cells if cell)}"
```

Four spaces because *Obsidian writes four*. It is a fact about how this instance WRITES a level,
chosen to match the other editor the operator uses on the same vault.

**[REA] So `INDENT_UNIT` belongs on the RENDITION axis, not the structural one.** It is the same
kind of fact as "a tag shows as a chip": a choice this instance makes about form, with no
consequence for meaning. The consequence of getting it wrong is not a wrong edge — it is that the
operator's line **visibly jumps** when the engine re-renders it at four, which is a presentation
defect.

**Its right home is therefore `presentation.json`** — the global level of the presentation cascade,
which already exists, is already fetched, and is already read strictly (§0.8). And because the
engine's `4` and the app's `4` must agree, the honest arrangement is that **the renderer reads it
too**, so `config/` holds it once and both ends derive.

**[REA] The single number that would fix the whole family:** one declared unit, read by the
renderer for emission, published to `presentation.json`, read by `indent.ts` for the source edit
and by `paint.ts` for the margin — which also kills the `/ 2`, because the margin becomes
`(indent.length / UNIT) * 1.2rem` and stops being a second, disagreeing copy.

This is the concrete case the operator's complaint names, and the answer is that **it was filed
under the wrong axis.** It was never the app's fact and never the language's; it is the
instance's, and the instance already has a place to keep such facts.

---

## 4. Q4 — does the app need to KNOW the meaning, or only to SHOW it?

Three options were put to me. I take the third's constraint and the first's mechanism.

**Option B — the app asks a service "what would this mean?" — should be refused.** **[REA]** The
engine is the only interpreter of a markdown edit, and it interprets by running a cycle against the
graph. A pre-flight endpoint would be a **second interpreter** that must agree with the first
forever. Two interpreters of one language is precisely the MVC violation this project keeps
finding and removing. It is also an arc of work for an answer the app can compute locally.

**Option C — the app stays ignorant and only emits characters — is the current architecture and it
is right about DOING.** `app/present/source.ts:4-12` states the constraint: *"the markdown is the
truth, the DOM is a projection of it, and edits travel projection → source → engine → new
projection, never backwards"*, and it is enforced by a declared forbidden flow with a runtime
falsifier (`docs/architecture/flows.yaml:457-475`, mutation-proven 2026-07-30). **[OBS]** The app
has no depth, no parent, no tree and no `PART_OF` anywhere — `classifyLine` returns a flat
four-way kind and carries `indent` as raw characters, never a number (`resolution.ts:117-131`).

**But Option C is wrong about SHOWING, and that is the whole of the gap.** A keystroke that
silently reparents a node is the thing this project has already flagged as not a formatting change
— and §0.5 makes it worse than the brief assumed: the same keystroke **moves** a node in one
section and **adds** a relation in another. The app cannot tell him which, because it has never
been told the language.

**So the frame is: the app must not INTERPRET, but it must be able to NARRATE.**

**[REA] These have very different costs, and the difference is the point:**

* **Interpreting** means resolving an edit against the graph — identity, cardinality conflicts,
  needs-attention. That is a cycle. It cannot live in the browser.
* **Narrating** means answering *"in this section, a `>` will create a `PART_OF` edge to the line
  above, and because `PART_OF` is `many_to_one` the current parent edge will be deleted."* Every
  term in that sentence is in a declaration. **It is a lookup, not a computation.**

Narration needs three facts the app does not have: which section the cursor is in, that section's
structural language, and the cardinality of the resulting edge. **[REA]** The first the app can
already derive — `boundaryLine` finds headings (`boundary.ts:17-19`) — and the second and third are
config, which needs the wire in §0.8.

**Showing buys most of the value.** It converts an invisible graph mutation into a visible one
without moving one line of interpretation out of the engine, and it does not require the app to be
right — if the narration and the engine ever disagree, the engine wins and the operator sees a
surprise, which is the same failure he has today, no worse.

---

## 5. Q5 — what is genuinely unlocked, and what is blocked on something else

**`Tab` / `>` to restructure — out of a parent, under a sibling, under a new parent. UNLOCKED, and
already half-built.** **[OBS]** `>` and `<` ship (`motions.ts:488-494`, `app/index.html:1945-1957`),
and the un-indent-to-root detach path exists in the engine (`applier.py:2750-2768`). What the
language adds is not the gesture — it is the *label on it*. **[REA]** "Under a new parent" and
"under partners" are not different edits; they are the same `>` interpreted by a section's declared
language. His config already makes an indent mean a partnership in `## Waiting For`. **The feature
he is describing is already in the engine and unlabelled in the app.**

**A conventional non-vim gesture scheme. UNLOCKED by the same declaration.** **[REA]** Whatever key
or button emits it, the meaning resolution is identical — it is a property of the line and the
section, not of the input device.

**`V` over a range. BLOCKED, and not on the language.** **[OBS]** `SourceEdit` is a closed
three-member union in which every member names a single `lineIndex` (`source.ts:114`), and both
`set-line` and `insert-line` refuse embedded newlines (`source.ts:145-147`, `:167-171`). A span is
a union addition plus a branch. **[REA]** Orthogonal to this document: knowing what an indent means
does not help you indent six lines.

**Drag-to-reorder. BLOCKED ON THE ENGINE.** **[OBS]** §0.7 — order is not recorded, reorder is an
explicit no-op, and `insertion_position` has no writer. **[REA]** The backlog rejected this as a UI
decision. It is not one. The correct statement is that the graph has nowhere to put the answer, and
the fix begins with a writer for `insertion_position` in the engine. **This is the largest genuine
hole in the structural language** — it is the most natural gesture a person makes in an outline,
and it currently means nothing.

**And one the operator has not asked for, which this makes nearly free: showing him the language he
already has.** **[REA]** `#requires`, `#unlocks`, `#waiting-for` and `#sponsors` are declared end to
end (§2) and the app renders them as characters. The same reader that narrates an indent can
narrate these, because they come out of the same file.

---

## 6. The round trip — does `accept ⊇ emit` hold for a relationship?

**Yes today, in declaring sections by construction (§0.4), and in default sections only by an
accident of the registry.**

**[OBS] The default case is asymmetric.** With nothing declared, render walks *any* hierarchy edge —
`section_builder.py:124-126` falls to `graph.children(nid)` with no filter, and
`core/graph/src/qntm_graph/core/traversal.py:92-93` says that means *"only `child_to_parent` and
`parent_to_child` edges contribute"*. Ingest, by contrast, creates exactly one type: whatever
`indent_binding()` names, i.e. `PART_OF`.

**[REA] So in a default section the renderer can emit a nesting the ingest cannot reproduce** —
render is broader than accept, which is `accept ⊇ emit` inverted. **[OBS] It is inert today only
because `PART_OF` is the sole `child_to_parent` type in `schema.yaml:892-919`.** Every other edge
type is `directed` or `bidirectional` and does not participate in the default walk.

**[REA] Adding a second hierarchy-direction edge type would silently break the round trip**: a line
nested by the new type would render nested, and the moment the operator edited its text
(`child_in_changes` becomes true, `applier.py:2771-2775`) the applier would add a `PART_OF` edge
duplicating a nesting that came from elsewhere. The guard that holds the line today is that
unchanged lines create no edges — which protects reading but not editing.

[UNVERIFIED] — settled by adding a second `child_to_parent` type to a scratch config, rendering a
nesting through it, editing the child's title, and asserting no `PART_OF` edge appears. I did not
run it; it needs a cycle.

**[REA] The general answer to the brief's question is better than a yes.** `accept ⊇ emit` holds
for relationships **when one declaration is read in both directions**, and degrades exactly where
the two directions have separate defaults. That is a design rule, not a test result: **any new
structural key must be read by both the renderer and the applier from the same declaration, or it
will drift.**

---

## 7. Q6 — testing the frame: two axes, three, or four?

The brief proposed **rendition** (how a token is shown) and **gesture** (which keys are live), and
guessed structural meaning is a third axis the app lacks.

**The guess is right that there is a third thing, and wrong about what kind of thing it is.**

**[REA] Rendition and structural meaning are the same KIND — both are cascading resolutions of what
a token means, separated by direction.** Rendition resolves on **output**: given a token, how is it
shown. Structural meaning resolves on **ingest**: given a gesture, what edge does it make. Both
cascade global → view → line (§0.3). Both are declared in config and read by a resolver. Neither is
a property of the input device.

**[REA] Gesture is NOT the same kind, and it is the odd one out — which the app's own record already
proves at cost.** `docs/architecture/capabilities.yaml:566`,
`vim-normal-mode-is-a-gesture-not-a-resolution`: a gesture produces no `Contribution` and has no
cascade level. It is not "another axis of meaning"; it is the question of which keys are live,
which is a mode, not a resolution.

**So the honest frame is:**

| | Direction | Cascades? | Declared? | Does the app have it? |
|---|---|---|---|---|
| **Rendition** | output | yes, seven levels | yes, `presentation.json` | **yes** |
| **Structural meaning** | ingest | yes, three levels | yes, four config files | **no** |
| **Gesture** | neither — a mode | no | no | yes |

**[REA] Two resolution axes that mirror each other, plus one thing that is not an axis at all.**
The app implemented the output axis and the mode, and has none of the ingest axis. That is a
cleaner statement than "a third axis": it says the missing piece has a **known shape**, because its
mirror image is already built. The levels, the reader, the strict-problem behaviour and the
`Contribution` merge in `app/present/cascade.ts` are all patterns that transfer.

And it explains §3 in one line: **`INDENT_UNIT` sat in the wrong axis.** It was filed as structural
because indenting is structural, but the unit governs how a level is WRITTEN, which is output.

---

## 8. Ranked order

Ranked by value per unit of cost, with the reason each is where it is.

| # | Work | Size | Why here |
|---|---|---|---|
| **1** | **Publish the structural language to the browser: widen `presentation.json`'s grammar to carry the indent binding (`edge_type`, `edge_source`), the resulting edge's `cardinality`, and the per-section overrides for the views the app serves. Generate it from `config/`, do not hand-write it.** | **half a day** | The wire, the reader and the strictness all exist (§0.8). This is the one item everything else depends on, and it is the item that makes the operator's sentence true in the browser rather than only in the engine. Generation matters: a hand-written copy is the `INDENT_UNIT` mistake again. |
| **2** | **Move the indent unit into config, read it in `renderer.py`, publish it, and consume it in `indent.ts` AND `paint.ts`.** | **half a day** | Kills two disagreeing executable copies, four duplicates and nine prose transcriptions (§3), and fixes the 2× margin defect as a side effect rather than as a separate task. Touches the engine, which is why it is not "under an hour". |
| **3** | **Narrate the gesture: with #1 landed, show what `>` will do on THIS line before it is pressed — "moves under «parent»" vs "adds a waiter to «parent»".** | **half a day** | The actual capability the operator described. Pure lookup, no interpretation, no new engine seam (§4). Cannot start before #1. |
| **4** | **Validate `edge_type` against the edge registry at bundle load.** | **under an hour** | §1's gap. Small, and it becomes load-bearing the moment the app displays the edge type to a person. |
| **5** | **Delete the `LATERAL_MOVED` member and its four orphaned branches; rewrite the deletion-safety comment at `orchestrator.py:3551-3554` to argue from the guards that actually hold.** | **under an hour** | §0.6. The code is inert; the false comment is not, because it is load-bearing prose in the most destructive path in the system. |
| **6** | **Give authored order a writer: `insertion_position` written on ingest, and reorder classified as an edit.** | **an arc** | §0.7. The largest hole and the largest job — it changes what the differ considers authority, which is the rule the rest of the language rests on (§2). It unblocks drag-to-reorder, which is currently rejected for the wrong reason. |
| **7** | **A contiguous-span `SourceEdit` kind, unblocking `V` + `>`.** | **half a day** | Real and wanted, but orthogonal to this document (§5). Ranked last because it delivers nothing about meaning. |

**#1 through #3 are one arc and should be done in order.** #4 and #5 are independent and can be
taken by anyone. #6 should not be started until someone has decided that authored order is a fact
the graph wants to own — that is a product decision, not an engineering one.

---

## 9. What I refuted

**9.1 "An indent's meaning is hardcoded; the operator's premise is aspirational."** Refuted by
mutation, §0.1. It is declared in four places, validated at load, and his sentence is a paraphrase
of a comment in his own config file.

**9.2 "The differ, applier and renderer are all hardcoded, so config only chooses which edges a
view traverses."** The differ is hardcoded and unit-free; the renderer's `4` is hardcoded; **the
applier is not** — it names no edge type and no direction (§0.1, §0.4). And the same declaration
that chooses which edges a view traverses IS the one that decides what an indent creates, which is
the opposite of the brief's reading: they are not two things, they are one thing read twice.

**9.3 "A whole-line MOVE is safe — absorbed as `LATERAL_MOVED`."** Handed to me as established. The
category is never constructed anywhere in the engine (§0.6). The conclusion may survive on other
guards; the stated mechanism does not exist.

**9.4 "`paint.ts`'s indent copy was transcribed from a stylesheet."** No stylesheet carries an
indent-per-level value; it came from inline JS at `app.html:246` in commit `64c3a87` (§3).

**9.5 "`INDENT_UNIT` is the language's fact."** It is the instance's rendition fact. Detection is
unit-free, so the number changes no edge — only whether the line jumps on re-render (§3).

**9.6 "Structural meaning is a third axis alongside rendition and gesture."** It is the mirror of
rendition — the ingest half of one cascade. Gesture is the item that is not an axis (§7).

**9.7 The brief's path for the differ.** `qntm_md/diff/content_diff.py`, not `qntm_md/io/`. The
line numbers were right.

**9.8 "Drag-to-reorder is rejected in the backlog."** It is rejected, but the reason recorded is a
UI reason and the real reason is that the graph cannot store the answer (§0.7, §5).

---

## 10. What is unverified, and what would settle it

**10.1 What a bogus `edge_type` does at apply time.** §1. Loads clean; I did not run a cycle.
Settled by a hermetic cycle with a mutated scratch config, asserting the needs-attention
diagnostic at `applier.py:2789-2800` fires per line rather than aborting the cycle.

**10.2 Whether a cross-file move is still safe now that `LATERAL_MOVED` is dead.** §0.6. Settled by
a two-file hermetic cycle: move a stamped line from file A to file B and assert the node survives
with its edges, driven only by the four hold-guards at `applier.py:1024-1048`.

**10.3 Whether a second `child_to_parent` edge type breaks the round trip.** §6. Settled by the
scratch-config experiment described there. I believe it breaks; I did not run it.

**10.4 Whether the operator wants an indent in `## Waiting For` to feel like the same gesture.**
Not an engineering question. §0.5 shows one keystroke with two meanings by his own configuration.
Narration (#3) assumes he wants to be told which; the alternative — that he wants the app to make
them feel like one gesture — would be a different design.

**10.5 The exact shape of the generated declaration in #1.** I have not designed the document, only
established that the channel exists, is read strictly, and admits only renditions today. The shape
should be settled against `declaration.ts`'s problem-reporting contract before anything is
generated.

---

## 11. The argument against the tempting answer

**The tempting answer is to build the thing the operator named: a structural language detector.**

It should not be built, because **the detector already exists and is called
`StructuralTokenResolver`** (`apps/qntm-md/src/qntm_md/vocabulary/structural_token_resolver.py:192`).
It reads the declaration, it resolves the cascade, it validates the grammar, and it is the single
consumer the applier and the renderer both ask. A second detector in the browser would be a second
interpreter of one language, which is the failure mode this codebase has spent the year removing —
and §3 shows what it costs in miniature: one number, copied by hand, already disagreeing with
itself in two executable places and three stale citations before anyone noticed.

**What is missing is not a detector. It is a wire and a reader** — and one of those already exists.

The operator said *"so config can say what it means"*. His config already says what it means. The
sentence to hold onto is the one his own view file already contains:

> One declaration read both directions.

**The work is to make the browser the third reader of that one declaration — not the second author
of it.**

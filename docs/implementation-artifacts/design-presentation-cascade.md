# Target architecture: the presentation cascade

**Status:** design specification. **No application source changed on this branch.** This document,
the capability declarations, the backlog rows and the corrections to `architecture.yaml` /
`classes.yaml` are the whole of it.

**Branch:** `design/presentation-cascade`, based on `origin/main` @ `176e039` of
`QNTM-Network/qntm-network`.

**Scope:** the whole of how a line the engine emitted is SHOWN — which resolution of it a person
sees, at which level that resolution is declared, who reads that declaration, and what it costs to
take the resolution back. It is the OUTPUT half of the cascade whose INPUT half shipped in the
engine on 2026-07-30 (`qntm_md.resolution`). It governs refactors; it is not itself a refactor.

**Evidence rule.** Every claim is labelled **[OBS]** (a command I ran, output I read) or **[REA]**
(reasoned from source I read, cited `file:line`). No docstring, backlog row or architecture
document is accepted as evidence — this repo has this week refuted three backlog rows, one
architecture header and one class declaration, and this document refutes a fourth backlog row and
a second class declaration below.

**Inputs, read end to end and spot-checked, not inherited:**
`docs/implementation-artifacts/research-site-survey.md` (on `main`, 2026-07-30) and
`apps/qntm-md/docs/implementation-artifacts/design-resolution-cascade.md` in the sibling engine
repo, read read-only. Where I re-derived one of their claims I say so; where I could not, I say
that too.

**Naming.** `qntm` is the engine. `qntm.network` is the product — the website, the app, and the
remote server side. The retired term for the engine does not appear in this document; where it
survives in a path or a registry key that is drift, and it is named as drift.

---

## 0. Lead — what I established before designing anything

**1. The app today resolves exactly ONE thing, and shows everything else raw.** **[OBS]** — I ran
the app's own renderer configuration (`app.html:159`, `new MarkdownIt("commonmark").enable("table")`)
over a real qntm line under node:

```
line   : - [ ] Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29
tail   : "Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29"
inline : "Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29"
```

`md.renderInline` (`app.html:252`) changes nothing. The wiki-link, both tags, the marker and the
date all reach the browser as literal characters. The single resolution the app performs is the
checkbox: `- [ ]` becomes a real `<input type="checkbox">` (`app.html:241-254`).

**So the operator's "raw end" is not a setting he chose. It is the only end that exists.** He is
not sitting near raw by preference in the app — the app has one resolution and he is standing on
it. That reframes the work: this is not "add a raw mode", it is "add the *other* end, and the
dial between them".

**2. Presentation has no reader, no home and no level — not even a global one.** `paintView`
(`app.html:234-269`) is 36 lines of hardcoded decisions: which regex counts as a task
(`:241`), how deep an indent renders (`:246`, `(indent/2) * 1.2rem`), that `#` demotes one heading
level (`:259`, `Math.min(h[1].length + 1, 6)`), that a blank line vanishes (`:264`), and that
everything else is its own one-line markdown document (`:266`). **[OBS]** Nothing consults a
declaration, because there is nothing to consult. This is the exact shape the engine's own
specification names for the output half: *"output has no cascade level at all, not even a global
one"* (`design-resolution-cascade.md:678-680`), still true in the engine — `_CONTRACTS_DIR =
Path(__file__).parent / "contracts"` (`src/qntm_md/render/renderer.py:97`), five YAML files inside
the Python wheel, and `config/rendering/` holding one empty `.gitkeep`. **[OBS]**

**3. The model is already in the browser and the browser ignores it.** The snapshot envelope
carries `graph` — `{version, nodes, edges}`, read straight out of `state.db`
(`scripts/graph-sync.mjs:464`) — and `locations`, and the Worker hands both to the client
(`worker/src/app.js:132-149`, `:217-222`). **[OBS]** `grep -c` over `app.html` for `nodes`,
`edges` and `locations` returns **0, 0, 0**. The app re-parses markdown text it was handed
alongside the model that produced it.

**This is the finding that makes the whole design cheap.** "Markdown is already derived output" is
not an aspiration here; the derivation and its input are both in the payload. A resolution that
wants to know "is this node overdue" does not need a new endpoint, a new parse or a new engine
change. It needs one line of `snapshot.graph` lookup that nobody has written.

**4. The round trip is already exact, and it is exact for a structural reason worth pinning
before anything is built on it.** `toggleTask` (`app.html:273-296`) does **not** reconstruct
markdown from the DOM. It takes the source string it was handed, patches one character at one line
index (`:275-277`, `/^(\s*- \[)[ xX](\] .*)$/`), and posts the **whole file**
(`:284` → `worker/src/app.js:184-229`, which requires `{path, markdown}` and overwrites the view).
**[REA]** — read end to end; I could not exercise it, see §11.

The DOM is write-only. That is why a chip instead of `#work` is safe and why a rich-text editor is
not: the rule is not "the app may only show what it can parse back", it is **the app may only offer
an affordance it can express as an edit to the SOURCE STRING.** §5 makes that the governing
constraint.

**5. `demo-renders-markdown-in-the-browser` is enforced against the wrong file, and its class
declaration is false.** `classes.yaml:19-26` declares `markdown-rendering` with the concern *"there
is exactly one markdown implementation in this project"*, canonical home
`app/render/renderer:MarkdownRenderer`. `app.html:156` imports a second markdown-it from a CDN and
`app.html:234-268` is a third, hand-rolled, line-by-line renderer. The survey found this
(§1 row 8, **[OBS]** by mutation M2). I re-derived the reason it cannot be caught:
`.flow-trace.yaml` `modules.include` is `[app]` — a **path prefix** — and `app.html` is at the repo
root, so canonical routing could not see it even if it ran. **[OBS]** — read
`.flow-trace.yaml` and `src/flow_trace/js_capture.py`'s prefix convention.

**Everything this document proposes lands in a file no enforcer can see, unless it lands in
`app/`.** That is §7 and it is the single largest structural constraint on the migration.

**6. Nothing here can be verified today, and that is a fact about the tooling, not a hedge.**
**[OBS]** — I ran it:

```
$ flow-trace map <repo> --full
flow-trace: error: Scenario 'render_and_edit' raised during execution:
  RuntimeError("Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'typescript'
  imported from …/tools/flow-trace/js/src/transform.mjs")
EXIT=2
```

The verified fan — `verify .`, `capability-rollup .`, `map . --full` — crashes with no verdict,
because the tool's JS observer has no `node_modules`. The fix is `npm ci` in the **tool's**
checkout, which is a trunk clone this branch must not touch. What works, exit 0, **[OBS]** — I ran
all three: `queue .`, `backlog .`, `map .` (the cheap headline). The survey observed
`verify . --scenario static_evidence` at 13 PASS / 0 FAIL; I did not re-run it and do not claim it.

**Every capability declared in §9 is therefore a PLAN, not a proof, and says so in its own text.**

---

## 1. The bar

The operator's requirement, in his words: *"it outputs `-` and `#` and resolves them, then based on
how I use the app it renders it in the way and resolution that I decide."* And: *"depends on
compartmentalised components and pure resolution."*

**The test this spec is written against:**

> A reader of the repo, given the question *"why did this line render as a chip and not as
> `#work`?"*, must be able to answer it by naming **one level, one declaration, and one reader** —
> without reading a painter function, and without running the app.

Judged against that test, here is today. "Works" and "is findable" are different columns.

| Property | Status |
|---|---|
| A line is shown consistently | ✔ works — `paintView` is deterministic |
| Presentation has a precedence order | ✘ there is nothing to order |
| Presentation has a name | ✘ the concept has no noun in this repo |
| Presentation has a home | ✘ 36 lines inside a 395-line hand-authored HTML page |
| One reader consults declarations | ✘ zero declarations, zero readers |
| The resolution can differ per person | ✘ single hardcoded resolution |
| The resolution can differ per gesture | ✘ — and there is no gesture: `app.html` has **no text-editing surface at all** (§4.2) |
| Every affordance writes back through the source | ✔ **already true** (§0.4) — the one thing to protect |
| A resolution is measurable | ✘ `verify` exits 2 (§0.6); `app.html` is outside the capture filter (§0.5) |

**Two of these are green. The design's job is to keep those two green while making the other seven
answerable — not to rebuild what already works.**

---

## 2. The levels, named as they should appear in code

The input cascade shipped with five levels (`qntm_md/resolution/levels.py:64-92`, read
read-only): `GLOBAL → VIEW → STRUCTURAL_NODE → SUBTREE → LINE`, most specific wins, `SPECIFICITY`
owned in exactly one tuple. The output half needs those levels **and the two the operator named**:
who is using it, and what they are doing.

### 2.1 The ordering principle — and why output gets levels input never had

The input cascade's order is not arbitrary and neither is this one, but they are ordered by
*different* things, and saying which is the whole of §2.

> **A level is more specific than another when its fact becomes KNOWN LATER.**

| # | `PresentationLevel` | The fact | Known when |
|---|---|---|---|
| 1 | `GLOBAL` | the instance's default resolution | the instance is configured |
| 2 | `USER` | this person's default resolution | they log in |
| 3 | `VIEW` | this view sheet's resolution | a view is opened |
| 4 | `STRUCTURAL_NODE` | this section's resolution | a section is entered |
| 5 | `LINE` | this line's own tokens | the line is read |
| 6 | `MODE` | what they are doing — reading / authoring | they act |
| 7 | `FOCUS` | this line, under the cursor, right now | the cursor lands |

**Most specific wins**, exactly as on ingest. `FOCUS` beats everything: the cursor rule must be
able to override a LINE-level declaration, or a line that declares itself a chip becomes
uneditable.

**Where the operator's two levels sit: `USER` is second, immediately below `GLOBAL`; `MODE` is
sixth, between `LINE` and `FOCUS`.** They are not adjacent, and the reason they are not is the
point — "who you are" is a durable fact known at login, "what you are doing" is a transient fact
known at the gesture. Putting them together on one rung would force one of them to lie.

**Why output has levels that input does not.** On ingest there is no user, no mode and no cursor:
a line is read by a cycle, in a process, with nobody looking. Those three facts do not exist yet.
The engine's own note says the asymmetry the other way round — *"INGEST IS WELL-FOUNDED; OUTPUT IS
NOT"* (`levels.py:41-49`), because a line belongs to one (file, section) and a node belongs to N
views. **[REA]** Both asymmetries are the same asymmetry seen from two ends: **output happens later
and therefore knows more.** Output was never given a cascade level not because nobody got round to
it, but because output is where the extra facts arrive, and no one had named them.

### 2.2 What each level may declare, and who would read it

**This table is the anti-trap.** An agent in this system declared a config category last week that
loaded clean, exited 0, and was read by nothing. **Every row below names its reader, and where the
reader does not exist the row says so and names the stage that creates it.** Nothing in §9 declares
a key whose reader is not in this table.

| Level | Declaration home (target) | May declare | Reader | Exists? |
|---|---|---|---|---|
| `GLOBAL` | one app-config declaration, served with the app | the default `Resolution` for every line | `app/present/cascade` | **no** — stage 2 |
| `USER` | the user record behind the passkey session (`users` table, `worker/schema-app.sql`) | that person's default `Resolution`, and their per-token overrides | `app/present/cascade`, given the session | **no** — stage 5 |
| `VIEW` | the view sheet, alongside the input-cascade keys the engine already reads | this view's default `Resolution` | `app/present/cascade` — **but the envelope must carry it first** (§4.3) | **no** — stage 7 |
| `STRUCTURAL_NODE` | a `sections:` entry, same place as ingest | this section's `Resolution` | as VIEW | **no** — stage 7 |
| `LINE` | the tokens on the line | nothing new today; the line's own content is already the most specific *content* input | `app/present/resolution` | **partial** — `paintView` reads the line and decides, without a declaration |
| `MODE` | the session — not the document | the `Resolution` shift for a whole gesture | `app/present/context` | **no** — stage 4 |
| `FOCUS` | not declared — **derived** from where the cursor is | one boolean, `focused`, which the resolver may consult | `app/present/paint` | **no** — stage 3 |

**Two levels are deliberately absent and their absence is a decision, not an oversight:**

* **`SUBTREE`.** The input cascade has it (`levels.py:24-26`), opt-in per field, and the engine's
  own spec asks whether it should stay at all (`design-resolution-cascade.md:907-913`, open
  decision 4). Nobody has described a presentation setting that should be inherited by a node's
  descendants. **Omitted.** What would bring it back: a resolution whose subject is a subtree
  ("this outcome and everything under it renders as cards"). Adding it later is one enum member and
  one tuple entry, because §3 owns the order in one place.
* **node TYPE.** `schema.yaml`'s `render.shape` is per node type and **orthogonal to the cascade**
  — the engine spec is explicit about this (`design-resolution-cascade.md:181`,
  `:674`). It stays orthogonal here. A shape decides *what markdown a node emits*; a level decides
  *how that markdown is shown*. Conflating them is how the engine's emit/accept pair became
  accidentally separable in the first place (§5.1).

### 2.3 What a resolution IS

The value the cascade resolves is not a boolean and not a theme name. It is a small closed record —
one per token family the app can show more than one way.

```ts
// app/present/resolution.ts — a VALUE, no DOM, no behaviour
export type Rendition = "raw" | "wired";

export interface Resolution {
  readonly checkbox: Rendition;   // "- [ ]"        vs  <input type=checkbox>
  readonly tags:     Rendition;   // "#work"        vs  a chip
  readonly links:    Rendition;   // "[[qntm:121]]" vs  a title, or nothing
  readonly markers:  Rendition;   // "🆕 2026-07-29" vs  a date pill, or nothing
  readonly heading:  Rendition;   // "## Work"      vs  an <h3>
}
```

Five keys because five families exist in the emitted line, observed in §0.1. **`raw` means the
characters, verbatim.** `wired` means the app's rendition of them. Gradients of one thing: a
`Resolution` with every key `raw` is a plain text file, one with every key `wired` is a
conventional app, and every mixture in between is legal and reachable by declaration. **The
operator's position and a first-time visitor's position are two values of the same type.**

**Why an explicit record and not a scalar "level 0..5":** a scalar forces a total order on choices
that are not ordered. Wanting chips for tags and characters for links is not "more raw" or "less
raw", it is a different point in a five-dimensional space. A scalar would make the operator's
actual preference inexpressible, which is exactly the failure this design exists to avoid.

---

## 3. Precedence, and the one place that owns it

```
resolve(key, levels) -> (Rendition, PresentationLevel):
    for level in (FOCUS, MODE, LINE, STRUCTURAL_NODE, VIEW, USER, GLOBAL):  # most -> least specific
        contribution = levels.get(level)
        if contribution is silent:            continue
        if key not present in contribution:   continue
        return (contribution[key], level)
    return (DEFAULT[key], GLOBAL)
```

Deliberately the same shape as the engine's `ResolutionCascade.resolve`
(`design-resolution-cascade.md:200-209`), because a reader who has understood one has understood
both, and because divergence between the two halves is the failure mode this whole arc is about.

**Three rules carried across from the input half, each because the engine paid for it:**

1. **`SPECIFICITY` is owned in exactly one tuple, and no caller may re-express it.** The engine's
   `levels.py:86-92` carries a comment naming why: the order used to be re-expressed per key, per
   site, three times, and *the hand-rolled copy in the differ was the one that was wrong*. **[REA]**
   The painter must never contain an `if focused ... else if mode === ...` chain.
2. **Silence has one spelling.** A level that says nothing contributes `undefined`; absent, empty
   and `undefined` mean the same thing and the predicate that says so lives with the levels
   (`is_silent`, `levels.py:95-103`).
3. **Provenance is part of the return.** `resolve` returns *which level won*. On ingest this is
   `ResolvedConfig.provenance`; here it is what makes the app self-explaining — "this rendered
   as a chip because your USER default says so" is a `title` attribute away, and it is the only
   thing that makes the cascade debuggable by the person using it rather than by its author.

**On conflict: there is none.** Two levels declaring one key is the normal case and the more
specific wins, full stop. **On the one ordering I am NOT deciding:** see §10, decision 1 —
whether `MODE` outranks `LINE` is a real question and I have specified a default, not an answer.

---

## 4. Gap table

`✔` implemented and exercised · `◐` partial / present-but-unreachable · `✘` absent.

### 4.1 Per level

| Level | Declared anywhere | Carried to the browser | Read by anything | `file:line` |
|---|---|---|---|---|
| `GLOBAL` | ✘ | ✘ | ✘ | — |
| `USER` | ✘ — the `users` table has `handle` and credentials, no preferences | ✘ | ✘ | `worker/schema-app.sql`, `worker/src/app.js:132-149` |
| `VIEW` | ◐ — the engine's view sheets declare ingest keys; **none is presentation** | ✘ — `readViews` carries `id`, `path`, `title`, `domain`, `markdown` and nothing else | ✘ | `scripts/graph-sync.mjs:499-521` **[OBS]** |
| `STRUCTURAL_NODE` | ✘ | ✘ — sections are not in the envelope at all | ✘ | as above |
| `LINE` | ◐ — the line's tokens exist and are re-parsed by regex, never by declaration | ✔ the markdown is the payload | ◐ `paintView` reads the line, decides at the call site | `app.html:241`, `:257`, `:264` |
| `MODE` | ✘ | ✘ | ✘ | — |
| `FOCUS` | ✘ | ✘ | ✘ — **and there is nowhere for a cursor to land** (§4.2) | — |

### 4.2 The blocker under the operator's own rule

**`app.html` has no text-editing surface.** The graph viewer builds `<label>`, `<input
type=checkbox>`, `<span>`, `<h2..h6>` and `<div>` (`app.html:244-267`). There is no `<textarea>`,
no `contenteditable`, and no keyboard path to a line's characters. **[OBS]** — read the whole
module script.

So *"cursor on the line → you see `- [ ]`"* has no cursor to react to. The demo page has a
textarea (`app/main.ts:41`, `#source`) but it holds the **whole document** and lives on a different
page (`/demo/`, which the survey observed is unreachable from the site, §5d).

**This is the one place where the operator's first rule is larger than it sounds, and it is better
to say so than to size it at an hour and be wrong.** The rule itself — swap one line between two
renditions on focus — is small. The surface it needs does not exist. §8 stage 3 sizes the surface,
not the rule.

### 4.3 The envelope is the boundary the design cannot cross alone

VIEW and STRUCTURAL_NODE are levels of the **engine's** declarations. For the app to resolve
against them, the snapshot envelope must carry them, and today it carries five fields per view
(`graph-sync.mjs:511-517`) chosen for a viewer that only needed to display text. **[OBS]**

Widening the envelope touches `scripts/graph-sync.mjs`, the Worker's `graph_snapshot_views` table
(`worker/schema-app.sql`) and `pushGraph` (`worker/src/app.js:238-319`). That is why stage 7 is an
arc and every stage before it is not: **stages 2-6 need no schema change anywhere.**

### 4.4 What the round trip is proven for

The governing constraint is `accept ⊇ emit` — the app may only offer a resolution it can take back
exactly. Here is what is actually proven, per side, rather than in general.

| Pair | Proven | Where | Tier |
|---|---|---|---|
| checkbox glyph, engine emit vs engine accept | ✔ gated, mutation-proven, **checkbox only** | engine `docs/architecture/state.yaml:11056-11108` **[OBS]** | static-evidence |
| tags & markers, engine | ✔ **symmetric by construction** — one index, `.resolve()`/`.render()`, cannot drift | engine `state.yaml:11101-11104` **[OBS]** | structural |
| the three render shapes (`plain_line`, `stat_line`, `checkbox`) | ✔ round-trip tested across three generations | engine `state.yaml:243+` **[OBS]** | cycle-exercising |
| **the app's checkbox toggle** | ✔ **exact by construction** — patches the source string, never the DOM | `app.html:275-278` **[REA]** | structural, unenforced |
| **every other app resolution** | ✘ — none exists yet | — | — |

**The operator's summary — "proven for tags and stat lines only" — is close and slightly
pessimistic on one point and slightly optimistic on another.** Pessimistic: the checkbox pair has a
real mutation-proven gate, not just prose. Optimistic: none of it is enforced *in this repo* — all
four green rows are the engine's enforcers, and `qntm.network` has no equivalent. That is the honest
statement, and it is what stage 1 has to change.

---

## 5. The constraint that sequences everything

> **A resolution is admissible only when every affordance it offers can be expressed as an edit to
> the SOURCE STRING. The app never reconstructs markdown from the DOM.**

This is `accept ⊇ emit` restated for a client, and it is stronger than the engine's version in
exactly the way a client needs. The engine's rule is about vocabularies: don't print a glyph you
cannot read back. The app's rule is about **direction of authority**: the markdown is the truth,
the DOM is a projection of it, and edits travel projection → source → engine → new projection.

**It is already true.** §0.4: `toggleTask` patches `view.markdown` and posts the whole file. The
DOM is never inverted. **Protecting that is the highest-value thing this document does**, because
it is the property that makes every future resolution cheap and one careless commit would end it.

**What it permits, immediately:**

* A chip instead of `#work` — clicking it deletes the substring `#work` from the source line.
* A rendered title instead of `[[qntm:121]]` — the link text is never re-derived; the substring
  stays untouched in the source.
* A date pill instead of `🆕 2026-07-29` — same.
* Hiding a token entirely — the safest resolution of all, because hidden text is not edited.

**What it forbids:**

* A `contenteditable` region whose HTML is serialised back to markdown. That is DOM inversion, and
  it is the one shape that turns every resolution into a lossy transform.
* Any resolution whose affordance has no source edit. If you cannot write down the substring
  operation, the resolution is not admissible yet. **That is the sequencing rule: resolution levels
  advance exactly as fast as the source edits do.** Not an objection — a schedule.

**The failure this prevents, observed in the engine, one repo away.** Delete one row from the
accept vocabulary and the engine's renderer keeps emitting the glyph; the unmatched glyph is
absorbed into the node's **title** and the tick is silently dropped, exit 0, no diagnostic
(engine `state.yaml:11086-11093`, two hermetic arms). **[OBS]** In the app the equivalent is worse,
because the app posts the **whole file**: one bad inversion does not corrupt one title, it rewrites
a view.

---

## 6. What must NOT change

Each is load-bearing and each breaks under a naive "just make it configurable".

### 6.1 The source string is the truth; the DOM is write-only
`app.html:273-278`. §5 in one line. If a later change derives markdown from the DOM, every
guarantee in this document is void.

### 6.2 The whole file is the write unit
`app.html:284` → `worker/src/app.js:195-207`. The browser posts `{path, markdown}` for one view and
the server overwrites it. A resolution that renders only part of a file must still hold the whole
file's source, or a save drops the parts it never rendered.

### 6.3 The renderer stays pure and the painter stays the only DOM toucher
`app/render/renderer.ts:29-31` (`toHtml(string) -> string`, no I/O, no DOM); `app/main.ts:4-5`
("This is the only module that touches the DOM"); enforced structurally by two `forbidden_flows`
(`flows.yaml:73-86`). The presentation cascade must adopt the same split, not a fourth arrangement.

### 6.4 `app/main.ts` stays importable without side effects
`handoff.yaml:102-106`: it used to end in a bare `void main()`, which made it unobservable by
anything that is not a browser. The bootstrap lives alone in `boot.ts`. A presentation module with
a top-level side effect would silently kill the observed half in the same way.

### 6.5 Edits on the demo page stay ephemeral
`state.yaml:197-215`, the best enforcer in the repo (survey M5: adding `localStorage` to
`app/main.ts` FAILs it correctly, **[OBS]** by the survey). The presentation cascade will want to
persist a USER-level preference. **It must not persist it from `app/` sources**, or it trips this
invariant — and tripping it is correct, because that would be persistence arriving without a
declaration. The USER level's home is the **server-side user record** (§2.2), reached through the
session, which is why stage 5 is a server-shaped stage and not a `localStorage` line.

### 6.6 A `Resolution` never changes what the engine emits
The cascade decides how emitted markdown is SHOWN. It has no opinion on `render.shape`, which is
the engine's and is orthogonal (§2.2). Two knobs for one outcome is how the emit/accept pair drifted
apart in the first place.

---

## 7. Module boundaries

The operator: *"depends on compartmentalised components and pure resolution."* This is that,
concretely.

```
app/present/levels.ts       PresentationLevel + SPECIFICITY — THE order, owned once
app/present/resolution.ts   Resolution, Rendition, DEFAULT — values only
app/present/cascade.ts      PresentationCascade.resolve() — pure, no DOM, no fetch
app/present/context.ts      PresentationContext — the assembled facts (user, view, mode, focus)
app/present/paint.ts        the ONLY module here that touches the DOM
app/present/source.ts       applyEdit() — every write-back, as a source-string operation
```

**Six files, three purity classes, and the split is the whole safety argument:**

| Module | Touches DOM | Touches network | Why it is separate |
|---|---|---|---|
| `levels`, `resolution`, `cascade` | no | no | testable under node, observable by flow-trace's node backend, and the place a reader looks to answer "which level won" |
| `context` | no | no | assembles facts from the session; keeping it pure is what lets a test say "resolve as if the cursor were here" without a browser |
| `paint` | **yes** | no | mirrors `app/main.ts`'s existing role exactly — one DOM toucher, not three |
| `source` | no | no | owns §5. Every affordance routes through it, so "does this resolution have a source edit?" is answerable by reading one file |

**Three classes to declare — in stage 1, when the homes exist, and not before:**

| Class | Canonical home | Concern |
|---|---|---|
| `presentation-resolution` | `app/present/cascade:PresentationCascade` | deciding which rendition a token gets; any path that decides without routing here is the failure |
| `presentation-painting` | `app/present/paint:paint` | turning a resolved line into DOM; the only concern permitted to touch the document |
| `source-write-back` | `app/present/source:applyEdit` | every edit, as a source-string operation — the structural form of §5 |

**They are deliberately NOT declared in `classes.yaml` on this branch.** That file's own header
says it: *"a class whose routing nothing can check is a label, not governance"* (`classes.yaml:9-11`).
Declaring a home for a module that does not exist, in a repo where canonical routing cannot run
(§0.6) and would not see the file anyway (§0.5), is the exact bug this project has found four times
this week. **The classes land in the same change as the modules.** Stage 1.

**And the location is not negotiable: `app/present/`, not `app.html`.** `.flow-trace.yaml`'s
capture filter is `include: [app]` as a path prefix (`.flow-trace.yaml`, `modules:`), so a
presentation cascade written inside `app.html` is invisible to canonical routing, to flow
declarations and to depth-to-sink — permanently, by construction. Writing it in `app/` and having
`app.html` consume the built bundle is what converts the biggest undeclared surface in the repo
into governed code, one module at a time. **The presentation cascade is the reason to finish that
conversion**, which the survey sized as an arc with no driver (§6, row `§1/row-8`).

---

## 8. Migration path

Every stage ships alone and leaves the app working. No stage depends on a later one. Sizes:
**≤1h**, **½ day**, **arc**. Each stage answers **what it makes visible** and **what would falsify
it** — because a stage with no falsifier is the bug class this repo keeps finding.

### Stage 0 — declare the direction and correct what is false · **≤1h** · docs only
**This branch.** The capabilities in §9, the backlog rows, the corrections in §12. No source.
**Makes visible:** a queue that is not zero. Today `flow-trace queue .` returns `queue_length: 0`
(**[OBS]**, I ran it) — not because the work is done but because no row exists for any of it.
**Falsifier:** none, and that is stated in every declaration rather than implied away.

### Stage 1 — give presentation ONE reader and ONE home · **½ day**
Extract `paintView`'s decisions (`app.html:234-269`) into `app/present/` per §7, as a pure
resolver plus a painter. **Output byte-identical to today** — the resolution roster is exactly what
the app already does. `app.html` imports the built bundle instead of hand-rolling. Declare the
three classes (§7) and the flows in the same change, and extend `.flow-trace.yaml` if any part
still lives outside `app/`.
**Makes visible:** `app/present/` appears in the source tree beside `app/render/` and
`app/editor/`; the concept acquires a location and a noun.
**Falsifier:** a node-driven scenario (the shape `tests/flow_scenarios/render_and_edit.ts` already
uses) asserting the painter routes through the cascade — plus a golden test that the painted DOM
for a known view is unchanged from today.
**Blocks:** every later stage. **Nothing else may ship first.**

> **SHIPPED 2026-07-30**, branch `feat/present-one-reader-one-home`. `app/present/` holds
> `levels`, `resolution`, `cascade`, `context`, `paint`, `source` and an `index` barrel;
> `app.html` imports `dist/present.js`; the three classes, five expected flows, two forbidden
> flows and one new sink (`view-painted`) landed in the same change. Byte-identity is a
> comparison, not a claim — `tests/present-golden.test.mjs` runs the old `paintView`, lifted
> verbatim out of `64c3a87`, beside the new painter against one shared markdown-it, over a
> whole-view fixture, 25 named edge cases and a 1,125-case sweep. The falsifiers are
> `tests/present-cascade.test.mjs` and `tests/app-html-write-path.test.mjs`, mutation-proven six
> ways. **Two departures, both argued in the source:** `Resolution` ships TWO keys, not §2.3's
> five (`tags`/`links`/`markers` have no reader until stage 8, and §9's own rule forbids
> declaring a key nothing reads); and `heading` is a resolved family, correcting §0.1 — "the
> single resolution the app performs is the checkbox" is true of the inline tail, not of the
> line, since `## Work` became an `<h3>`. **Not done and not claimable:** canonical routing,
> depth-to-sink and the flow observations still need `flow-trace verify`, which exits 2 here for
> the reason §0.6 gives. Stage R is still stage R.

### Stage 2 — the GLOBAL level, with a reader that provably reads it · **≤1h**
One declaration — the default `Resolution` — served with the app and consulted by stage 1's
cascade. Default value = today's behaviour, so nothing changes until it is flipped.
**Makes visible:** that a declaration reaches. This stage exists *because* "a declaration that
exists and does not reach" is this system's highest-frequency bug: the whole stage is a proof that
the reader is wired, and it is an hour.
**Falsifier:** flip one key to `raw` in a test fixture and assert the painted DOM changes. If it
does not, the declaration is inert and the stage has failed — which is the point of doing it
separately.

### Stage 3 — the FOCUS level: the operator's cursor rule · **½ day**
**This is the operator's rule: cursor on the line → `- [ ]`; cursor off → a clickable checkbox.**
Add per-line focus to the graph viewer: the focused line renders as an `<input>` holding its
**exact source text**, blur returns it to the resolved rendition, and the source string stays the
truth (§6.1). The whole-file POST is unchanged.
**Half a day, not an hour, and §4.2 is why:** the rule is one branch in the resolver; the surface
it reacts to does not exist. The half-day is the focus surface. Once it exists the rule is minutes.
**Makes visible:** the whole thesis, in one gesture — raw and wired as two resolutions of one line,
switched by a fact about the moment rather than by a mode switch.
**Falsifier:** focus a line, assert the DOM carries the verbatim source substring; blur, assert the
checkbox returns; assert the posted markdown after an edit-then-blur equals the source with exactly
that line replaced.

### Stage 4 — the MODE level · **½ day** · needs 1 + 2, not 3
Reading vs authoring as one session-scoped contribution that shifts the default for every line.
Independent of the cursor rule: MODE is a gesture-scoped fact, FOCUS is an instant-scoped one, and
either can ship without the other.
**Makes visible:** that the dial has more than one hand on it.
**Falsifier:** the same fixture as stage 2, resolved twice with different modes.

### Stage 5 — the USER level · **½ day** · needs 1 + 2
The per-person default, held in the user record behind the passkey session (§2.2, §6.5) — not in
`localStorage`, which would trip `state-edits-are-ephemeral` correctly.
**This is the level most at risk of being declared and never read**, because with one user a wrong
default is indistinguishable from a working one. It therefore ships **only** with a way to change
it and a test that reads it back through the session.
**Makes visible:** that the operator's position near the raw end is a value, not the architecture.
**Falsifier:** set a non-default `Resolution` on the user record, reload, assert the painted DOM
reflects it.

### Stage 6 — resolve from the model, not from the text · **½ day** · needs 1
`snapshot.graph` (`{version, nodes, edges}`) and `locations` are already in the payload and read by
nothing (§0.3, **[OBS]**). Give `PresentationContext` access to them so a resolution may consult a
node's fields rather than re-parsing its markdown.
**Makes visible:** that the markdown is derived output and the app knows it. This is also the one
stage that keeps §11's future open, and it costs half a day now versus a rewrite later.
**Falsifier:** a resolution that cannot be computed from the line alone — e.g. rendition chosen by
a node field absent from the rendered text — and a test that it changes when the field changes.

### Stage 7 — the VIEW and STRUCTURAL_NODE levels · **arc**
Carry presentation declarations from the engine's view sheets through `readViews`
(`graph-sync.mjs:499-521`), the `graph_snapshot_views` table and `pushGraph`
(`worker/src/app.js:238-319`) to the browser. Every stage before this needs no schema change; this
one needs three. §4.3.
**Makes visible:** that the two halves of the cascade share their middle levels — the same view,
the same section, declaring both what a line MEANS and how it is SHOWN.
**Falsifier:** a view sheet declaring a presentation key, asserted end to end from config to
painted DOM.

### Stage 8 — token renditions: chips, titles, pills · **arc** · gated on §5
The first resolutions that change a **token** rather than a **line**. Each one ships with its
source edit (§5) or does not ship.
**Makes visible:** the wired end of the dial actually existing.
**Falsifier:** per rendition, a round-trip test — render, exercise the affordance, assert the posted
source differs from the original by exactly the intended substring operation.

### Stage 9 — composed views and agent instructions · **arc** · gated on §10 decision 3
Named in §11. **Not designed here**, and stage 6 is the only thing this document does on its
account.

### Stage R — restore the runtime verifier · **≤1h** · **in the TOOL repo, not this one**
`npm ci` in flow-trace's `js/`. Until it runs, **no stage above can earn a real green** — `verify`
exits 2 and one crashed scenario blanks the verdict for the thirteen static invariants too (survey
§2). Listed here because every falsifier above depends on it and none of them can be run by this
repo. It is one command and it is not mine to run.

**Ordering, stated once:** `1` → then any of `{2, 6}` → then any of `{3, 4, 5}` → then `7`, `8` →
then `9`. `R` is orthogonal and should go first in wall-clock terms.

---

## 9. What is declared, and at what evidence tier

Five capabilities land in `docs/architecture/capabilities.yaml` on this branch. **All five carry
`status: undeclared` and no `enforced_by` block, and that is not a gap in the paperwork — it is
the tool's own honest representation of "declared, not enforced."** `flow-trace capability-rollup`
composes `undeclared` from *zero cited contracts* (`src/flow_trace/capability_rollup.py:11`,
`:58` — **[OBS]**, read), and a backlog row driving an `undeclared` capability derives
`diagnose-ready` (`src/flow_trace/backlog.py:59` — **[OBS]**), which is exactly what puts it in the
queue as work to scope.

| Capability | Tier | Evidence tier, honestly |
|---|---|---|
| `a-human-authors-in-the-browser` | foundational | **none — a plan.** The apex the other four serve, and the thing everything is measured against. Nothing can falsify it until an authoring surface exists (§4.2). |
| `presentation-is-resolved-not-chosen` | foundational | **none — a plan.** Falsifiable from stage 1: a painter deciding without routing through the cascade. Not before. |
| `the-focused-line-shows-its-source` | functional | **none — a plan.** Falsifiable from stage 3, by the test in that stage. |
| `every-affordance-writes-back-through-the-source` | foundational | **structural today, unenforced.** The property is TRUE (`app.html:275-278`, §0.4) and nothing checks it. This is the one declaration describing something real, and it is the one most worth an enforcer. |
| `presentation-resolution-is-user-and-mode-aware` | functional | **none — a plan.** Falsifiable from stages 4 and 5. |

**No state invariant is declared for any of them.** A `state_invariants:` entry requires a
`predicate:` shaped `module:callable` and a `scenarios:` binding (`src/flow_trace/schema.py:119-145`
— **[OBS]**, read). Writing one whose predicate does not exist produces a declaration that loads
clean and reaches nothing — this system's highest-frequency bug, in the exact material where it
happens. **Each stage in §8 names the falsifier its own predicate must assert; that is the
specification, and the predicate lands with the stage.**

**No `verify:` marker is written on this branch.** Every `verify: PASS` currently in
`capabilities.yaml` is a 2026-07-23 fossil left by a runner that has not executed since (survey §1
row 10, §3 M7). I did not add to them and I did not hand-edit them either: they are derived fields,
and hand-writing a verdict — green or red — is the same sin in both directions. §12 says how they
are corrected instead.

---

## 10. Open decisions for the operator

Each is one question with the cost of each answer. **None is closed here.**

**1. Does `MODE` outrank `LINE`?**
§2.1 orders by when a fact becomes known, which puts MODE (the gesture) below LINE (the line's own
tokens). By subject-narrowness the opposite is true: a line is narrower than a session.
*If MODE wins:* "I am authoring" flattens every line to raw regardless of what any line declares —
a clean, predictable authoring mode.
*If LINE wins (the specified default):* a line can pin its own rendition against the session, and
authoring mode becomes a default rather than an override.
Cheap either way today (one tuple entry, §3 rule 1); expensive once anything relies on it.

**2. Is `Resolution` five keys or open-ended?**
§2.3 specifies a closed record of five, one per family observed in a real emitted line.
*If closed:* the type checker tells you when the engine grows a sixth family, which is a feature.
*If open (`Record<string, Rendition>`):* new families need no app change, and a typo in a
declaration becomes silently inert — the same failure mode as a config key nobody reads.
I recommend closed and have specified it that way. Reversible for the cost of one type.

**3. May a view's presentation differ from another view's, for the same node?**
The engine's spec asks the mirror of this and leaves it open (`design-resolution-cascade.md:890-896`,
open decision 2), because the wrong answer produced a real production race — *"a revert target that
depends on which view you deleted from is not a resolution, it is a race"* (`levels.py:46-49`,
**[REA]**).
*Here the answer is safer than there*, because presentation has no write-back of its own: the same
node showing as a chip in one view and `#work` in another changes nothing about the node. But it
changes what copy/paste means.
*If yes:* stage 7 is the full arc.
*If no:* stage 7 shrinks to VIEW-level defaults only, and STRUCTURAL_NODE never arrives.
**This is the decision stage 9 turns on**, and stages 1-6 are unaffected either way.

**4. Where does the `USER` level actually live?**
§2.2 and §6.5 place it in the server-side user record, because `localStorage` in `app/` would trip
`state-edits-are-ephemeral` — correctly, since that would be persistence arriving without a
declaration.
*If server-side:* it survives a new device and needs a schema change (`worker/schema-app.sql`).
*If client-side:* half a day cheaper and it must arrive as a declared capability with its own
enforcer, not as a quiet addition.

**5. Does the demo page (`/demo/`) adopt the cascade, or retire?**
Two capabilities and two backlog rows describe a page the survey observed no visitor can reach
(§5d). It has the only text-editing surface in the repo (`app/main.ts:41`) — which stage 3 needs.
*If it adopts:* stage 3 has somewhere to prototype and the page earns its keep.
*If it retires:* two capabilities retire with it, and stage 3 builds its surface in the app.
Undecided today, and undecided is the honest state, not a bug.

---

## 11. The future this does not build

If nodes can be composed and compiled into views that re-update from the model, the same machinery
composes **dynamic instructions for agents** — a view is a resolution of the graph, and an agent
brief is a view whose audience is not a person.

**Captured as a direction of travel, deliberately not designed.** One thing in this document is on
its account and only one: **stage 6**, resolving from the model rather than from the rendered text
(§0.3). If presentation resolves from `snapshot.graph`, a resolution can already target an audience
that is not a browser; if it resolves from markdown text, every such use begins by re-parsing the
thing the model just produced. Half a day now, a rewrite later. **Nothing else here is shaped by
it, and no stage before 9 should be.**

**One claim I will not make.** The operator believes making the raw/rendered blur a *declaration*
rather than a hardcoded opinion may be unprecedented — editors that blur the two (Obsidian, Typora)
hardcode where the blur falls, and doing otherwise needs a model underneath that most editors do
not have. **Plausible and unverified.** I did not survey the editor landscape and this document is
not evidence either way. What I can say from what I read: the precondition he names is genuinely
present here and is not present in a text editor — the markdown in this app is *derived output*
whose input is in the same payload (§0.3), which is a different starting position from a file on
disk. Whether anyone else has built on that starting position is a question for a survey nobody has
run.

---

## 12. What I found false, and what I did about it

Five things. Two corrected in place on this branch, three surfaced where the system can see them.

| # | The claim | Verdict | Disposition |
|---|---|---|---|
| 1 | `architecture.yaml:3` — *"HONEST SCOPE: a static landing site"* | **false.** It is a landing page, a markdown demo, a passkey-authenticated single-user application, a D1-backed hosted graph, and a two-way write path into a live vault. | **Corrected in place**, with the scope change dated and the undeclared surface named. |
| 2 | `classes.yaml:19-26` — `markdown-rendering`, *"exactly one markdown implementation in this project"* | **false.** Three: `app/render/renderer.ts`, `app.html:156` (CDN markdown-it), `app.html:234-268` (hand-rolled). And the class could not see any of them at the root — `.flow-trace.yaml` includes `app` as a path prefix. | **Corrected in place** — the concern now states what is true and names why the check cannot reach it. |
| 3 | `capabilities.yaml` — seven `verify: PASS` markers against flow declarations | **fossils** from 2026-07-23; `verify` has exited 2 since (survey §1 row 10, §2). | **Not hand-edited.** A derived verdict must not be hand-written in either direction. Surfaced via an `asserted:` backlog row — the tool's own mechanism for "a green surface, judged wrong", which routes to the unproven lane and never feeds `fail_count` (`src/flow_trace/schema.py:391-403`, **[OBS]**). |
| 4 | backlog row `port-the-renderer-to-typescript` — *"RETIRE ... so no second implementation is carried"* | **false in the shipped tree**, same failure as #2, first found by the survey. | `asserted:` row, driving `demo-renders-markdown-in-the-browser`. |
| 5 | `.flow-trace.yaml` header — *"A STATIC landing site: no traced code, no Python runtime"*, and *"Read it like anywhere: `flow-trace capability-rollup .`"* | **false twice**: there is traced code, and the read it recommends crashes with exit 2. | **Corrected in place** — header only; the `modules:` block is untouched. |

**And one thing that is true and unenforced, which is the mirror image and worth as much:** the
source-string write-back (§0.4, `app.html:275-278`). It is the best property in this repo's
application layer and nothing checks it. It is declared as a capability in §9 with its evidence
tier stated as structural-but-unenforced, and stage 1's falsifier is the first thing that would
catch its loss.

---

## 13. Reproduction

Everything I ran, from the scratchpad, against this worktree. No trunk clone was written; the live
vault (`~/qntm`) and the live DB (`~/.qntm-md/`) were never read or written; the sibling engine repo
was read only.

```
# the derived queue and the capability headline (both work; exit 0)
uv run --no-project --python 3.12 --with-editable ~/projects/qntm-network/qntm/tools/flow-trace \
  flow-trace queue /…/w-present          # queue_length: 0, drift: 0
uv run … flow-trace map /…/w-present     # 12 capabilities, all committed 'working'

# what the app actually renders for a real qntm line (§0.1)
npm ci
node -e 'const M=require("markdown-it");const md=new M("commonmark").enable("table");
  const l="- [ ] Draft the launch note [[qntm:121]] #task #work 🆕 2026-07-29";
  const m=l.match(/^(\s*)- \[( |x|X)\] (.*)$/); console.log(md.renderInline(m[3]));'

# the model is shipped and unread (§0.3)
grep -c "nodes\|edges" app.html      # 0
grep -c "locations"    app.html      # 0
grep -n  "snapshot"    app.html      # 7 hits, all views/generated_at — never .graph

# the verified fan, run to establish the crash first-hand rather than inheriting it (§0.6)
uv run … flow-trace map /…/w-present --full   # EXIT=2, ERR_MODULE_NOT_FOUND: typescript

# NOT run: `verify . --scenario static_evidence`. The survey observed 13 PASS / 0 FAIL;
# I did not re-run it and do not claim it here.
```

**Re-run after the edits, to check my own work — there is no flow-trace gate in this repo's CI, so
nothing else would:**

```
flow-trace queue   -> queue_length 12 (was 0), diagnose_ready 9, asserted 2, drift 0, exit 0
flow-trace backlog -> item_count 22, unscoped 1, diagnose-ready 9, asserted 2, passing 10, exit 0
flow-trace map     -> capability_count 17, capability_working 12, capability_undeclared 5,
                      fail_count 0, exit 0
python -c "yaml.safe_load(...)" over all nine declaration files -> 9 OK
```

The queue head is `give-presentation-one-reader-and-one-home` — stage 1, the row that blocks every
other row here. That is the derivation agreeing with §8's ordering, not me typing it: no `lead`
flag is set on any row (`leads: 0`).

**One derived line is now a command that does not run.** The queue deriver spliced
`next_command: … map . --full` into `handoff.yaml`, and `map . --full` is exactly the verb that
exits 2 above. It is DERIVED and carries a do-not-hand-edit pin, so it is left alone and recorded
here instead. It is also a second instance of a thread already in that file: flow-trace validates
an invoke's SHAPE and never that it RUNS.

`git status --short` is clean apart from the files this branch adds and edits, all of which are
declarations and documentation. **No application source is modified.**

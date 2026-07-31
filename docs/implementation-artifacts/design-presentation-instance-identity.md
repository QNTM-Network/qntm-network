# Design: presentation-instance identity — the row is a thing, and the app has never had a name for it

**Status: design only. No application source is modified on this branch. This document is the only
file it adds.** Where a change is needed to a file another agent owns (`app/present/*.ts`,
`app/index.html`, `tests/`, `docs/architecture/capabilities.yaml`,
`docs/implementation-artifacts/backlog.yaml`), it is described here and not made.

The operator's proposal, in his own words:

> "yes its mvc. so this is about how to control the view. and navigate it. cant rely on confusing
> model with view for that. we have strong diffing system for obsidian but surely if it's an app and
> we render we can tie presentation instances (not unique node ness but rendering structure) to ids
> and navigate a grid like that. or is that not a good idea."

**It is a good idea, it is bigger than the cursor, and the shipped anchor is already a hand-rolled
approximation of it that gets the operator's own `metrics.md` wrong on every cycle.** That last part
is measured, not argued, and it is the single most useful sentence in this document.

Evidence labels follow `design-presentation-cascade.md`, `design-the-edit-is-a-safe-haven.md` and
`design-the-vim-cursor.md`:

* **[OBS]** — I ran it, or read it, in this worktree or read-only in `~/qntm` / the engine trunk,
  and I am reporting the output.
* **[REA]** — reasoned from something labelled [OBS]. Stated as reasoning, never as measurement.
* **[REPO]** — quoted from a record in this repo or the engine repo that I did not independently
  reproduce.

Sizes are the house scale: **under an hour** / **half a day** / **an arc**.

---

## 0. Lead — the eight things established before any design

**0.1 The wire carries five fields per view and none of them is per-line. Proven at three
producers, not by a grep.** **[OBS]** Every path that puts a view in front of the browser
constructs the object by hand, and I read all three:

| producer | site | fields |
| --- | --- | --- |
| Fly graph server | `server/app.py:163-171` | `id`, `path`, `title`, `domain`, `markdown` |
| laptop push | `scripts/graph-sync.mjs:511-517` | `id`, `path`, `title`, `domain`, `markdown` |
| Worker read | `worker/src/app.js:172`, `:180-186` | `view_id`, `path`, `title`, `domain`, `markdown` |

The D1 table has exactly those columns and nothing else (`worker/schema-app.sql:81-90`, primary key
`(user_id, version, view_id)`), and the insert lists all seven columns explicitly
(`worker/src/app.js:333-345`). `markdown` is a whole-file string read straight off disk —
`_read_text(abs_path)` (`server/app.py:169`), `readFileSync(abs, "utf8")` (`graph-sync.mjs:516`).
**There is no per-line structure on the wire, at any hop, and the absence is proven by reading every
producer rather than by failing to find a consumer.**

**0.2 There is already an empty slot on the wire for exactly this, and its declared shape is
wrong.** **[OBS]** Both envelope builders ship a field called `locations`, hardcoded to `{}`, with
the same comment: "node → { view, line } comes from qntm-md's line/render cache; read-only display
does not need it, so v1 ships it empty. Populated when we wire two-way gestures"
(`graph-sync.mjs:530-532`; `server/app.py:195` carries the abbreviated form). **That shape is
MODEL-KEYED and cannot express this problem.** A map from node to `{view, line}` has one entry for
`qntm:1232`, and `~/qntm/this_week.md` prints `qntm:1232` twice. The slot was reserved for the right
concern and typed for the wrong one.

**0.3 The engine DOES compute presentation-instance identity, every cycle, and it is
`(sheet_id, section_id, node_id)`.** **[OBS]** `RenderedLineRecord`
(`apps/qntm-md/src/qntm_md/render/renderer.py:169-184`) is a frozen dataclass carrying `sheet_id`,
`section_id`, `node_id`, `line_number`, `qntm_id`, and a `chrome_metadata` dict holding `depth`
(`renderer.py:940-946`). It is appended in lockstep with the string lines — `lines.append(line_text)`
at `renderer.py:581-582`, then `records.append(...)` at `:592`, with `line_number = len(lines)` at
`:590` — and the two travel together in `RenderResult` (`renderer.py:212-218`) before
`markdown="\n".join(lines)` at `:479`. **The downstream consumer keys on the pair and asserts it is
1:1**: `markdown_writer.py:188` is `key = (record.section_id, record.node_id)`, and
`renderer.py:625-632` records that reusing a parent's `qntm_id` for a continuation line "would
collide two records onto one placement-key slot (`markdown_writer.py`'s `(record.section_id,
record.node_id)` 1:1 assumption) and corrupt reconciliation for BOTH lines."

So the printer **does** know it is emitting the second occurrence of node 1232 under heading X. It
knows it as a different `section_id`, which is the better answer.

**0.4 …and it throws it away. The persisted cache does not carry it.** **[OBS]** I read the live
database read-only. `PRAGMA table_info(line_cache)` on `~/.qntm-md/state.db` returns exactly six
columns:

```
file_path, line_number, fingerprint, parent_context_hash, position_context_hash, disposition
```

matching the DDL at `apps/qntm-md/src/qntm_md/persistence/schema.py:41-49`. A sample of
`this_week.md` rows confirms it — the identifying content is a sha256 fingerprint and a line number,
and `section_id` / `node_id` appear nowhere. **Instance identity exists in memory for the duration of
the render, is consumed by disposition reconciliation, and does not survive the cycle.** This is the
correction that most changes the shape of the answer, and §2.3 is where it lands.

**0.5 The renderer is a pure function of graph state and view config.** **[OBS]**
`renderer.py:319-329` says so in a load-bearing comment — "The renderer is the pure VIEW: render =
f(graph_state, view_config). It reads NO prior line_cache" — the signature at `:307-315` carries no
`prior_line_cache_records` parameter, the invariant is declared in the engine's own architecture
record (`apps/qntm-md/docs/architecture/state.yaml:6496`,
`renderer_emits_records_without_reading_line_cache`), and byte-identical double-render is
test-enforced (`apps/qntm-md/src/qntm_md/io/signature.yaml:152`). **[REPO]** So the id is
**derived**, not remembered, and §2.4 makes that the whole argument.

**0.6 The evidence base changed, and the change matters. `this_week.md` is not typical.** **[OBS]**
I re-derived duplication over all five of the operator's live views rather than the one every
previous agent used:

| view | non-blank lines | stamped node lines | duplicate stamps | duplicate line texts |
| --- | --- | --- | --- | --- |
| `habits.md` | 54 | 47 | none | none |
| `inbox.md` | 5 | 3 | none | none |
| `metrics.md` | 5 | 0 | none | none |
| `routines.md` | 39 | 33 | none | none |
| `this_week.md` | 18 | 14 | `1975`, `1986`, `1232` | 3 pairs, byte-identical |

**Three views out of five duplicate nothing; `metrics.md` has no stamps at all; `this_week.md` is the
only one that duplicates.** So the four-rung anchor is calibrated against the operator's least
typical file.

**But the duplication is DECLARED, not accidental, and must not be dismissed.**
`apps/qntm-md/config/views/this-week.yaml:11-13` says it in the config's own header comment: "A node
can appear in both a due and a scheduled section (they are different lenses); within the scheduled
pair it renders in exactly one." **[OBS]** So the operator calling `this_week` "unideal" is about
something else; a view that shows the same node through two lenses is a design the config supports on
purpose, and any future multi-lens view has the same property. It is rare, not wrong.

**0.7 The painter builds no row key at all, and every affordance is keyed by a closed-over line
index.** **[OBS]** `paint.ts:629` is `body.innerHTML = ""` and the whole view is rebuilt from one
string on every paint. I grepped `dataset`, `setAttribute` and `.id =` across `app/present/*.ts` and
`app/render/*.ts`: **zero hits in `paint.ts`.** The rows it creates carry `className` and
`style.marginLeft` and nothing else (`paint.ts:705-739` for a checkbox row, `:750-757` for a heading,
`:770-780` for prose). Identity reaches the DOM only as a JavaScript closure — `focusable(span,
index)` at `:737`, and `deps.onCheckboxToggle?.({ lineIndex: index, … })` at `:724`. **The click path
already addresses "this row", and it addresses it by position.**

**0.8 Baseline.** **[OBS]** `npm ci` then `npm run check` on this worktree at `fe5f12d`: typecheck
clean, build clean, **601 tests / 105 suites / 0 fail**, 29.5 s. Nothing on this branch changes that
number; it is here so the next person knows what green looked like.

---

## 1. Q1 — are the four rungs a reconstruction of instance identity?

**Confirmed, with one correction that is worth more than the confirmation: there is a fifth outcome
nobody counted, and it is a FALSE `absent`.**

### 1.1 What each rung actually costs, measured against the shipped bundle

**[OBS]** I loaded `dist/present.js` (the built artefact, unmodified) and resolved every line of the
operator's live views against itself, printing which rung answered.

`this_week.md`, 18 lines:

```
line  2  [[qntm:1975]]  STAMP_IN_SECTION
line  3  [[qntm:1986]]  STAMP_IN_SECTION
line  5  [[qntm:1232]]  STAMP_IN_SECTION
line 12  [[qntm:1975]]  STAMP_IN_SECTION
line 13  [[qntm:1986]]  STAMP_IN_SECTION
line 14  [[qntm:1232]]  STAMP_IN_SECTION
… 6 lines at STAMP, 5 headings at TEXT, 1 blank -> anchorFor returns null
```

`metrics.md`, 5 lines: **every single line answers at `TEXT`.** There is not one stamp in the file.

**So the rung distribution over the operator's own week is: 6 lines needing the heading to
disambiguate, 6 lines clean, and a whole view where the strongest rung never fires.**

### 1.2 The collapse, rung by rung

`ANCHOR_TRUST` is `["STAMP", "STAMP_IN_SECTION", "TEXT", "TEXT_IN_SECTION"]` (`anchor.ts:112`), and
`decide()` (`anchor.ts:208-228`) narrows an ambiguous rung by `sectionOf` before giving up.

* **STAMP and STAMP_IN_SECTION collapse into one lookup, completely.** **[REA]** The pair computes
  exactly "which line has node N under heading H" — which is `(section_id, node_id)`, the engine's own
  key from §0.3, spelled with a display string instead of a config id. The `decide()` machinery, the
  ordering of `ANCHOR_TRUST`, and the `ambiguous` third outcome all exist to reconstruct one lookup
  the producer already performed and discarded. **Two rungs become one.**
* **TEXT_IN_SECTION collapses too.** **[REA]** It exists only to disambiguate TEXT, and TEXT's whole
  job is covered below.
* **TEXT does NOT fully collapse, and this is the honest limit.** **[OBS]** Its two jobs are
  different. Job one is lines with no stamp — headings, and lines the operator has authored but the
  cycle has not stamped yet. Job two is a stamped line whose stamp is not in the new projection.
  Job two should not exist: if the stamp is gone the printing is gone, and matching a *different*
  node's identical characters is a guess dressed as a rung. Job one survives — see §3.2.
* **`absent` does not collapse.** That is Q3.

### 1.3 The fifth outcome: a FALSE `absent`, measured live, on unmodified shipped code

**[OBS]** `metrics.md` renders each section heading as `## <name> 🎯 <derived ratio>` — the config
declares `name: "On-track accuracy (3d)"` and `render_body: false`
(`apps/qntm-md/config/views/metrics.yaml:17-30`), and the number is computed by rules. **The heading
text therefore changes whenever the metric moves.** It moved while I was reading: at ~17:00 line 1
read `🎯 0.49` and a few minutes later it read `🎯 0.44`.

I took an anchor on the earlier projection and resolved it against the later one, through
`dist/present.js`:

```
0  "## On-track accuracy (today) 🎯 0.21"  ->  {"outcome":"found","tier":"TEXT","lineIndex":0}
1  "## On-track accuracy (3d) 🎯 0.49"     ->  {"outcome":"absent"}
2  "## On-track accuracy (7d) 🎯 0.51"     ->  {"outcome":"found","tier":"TEXT","lineIndex":2}
3  "## Age of intent (30d) 🎯 5.7"         ->  {"outcome":"found","tier":"TEXT","lineIndex":3}
4  "## Scheduled coverage (%) 🎯 11.0"     ->  {"outcome":"found","tier":"TEXT","lineIndex":4}
```

**The row is still there. It is line 1, in the same place, in the same section, showing the same
metric. The app says "the line you were on is not in this view any more"**
(`app/index.html:1265`).

This is not an edge case in a fixture. It is the operator's real vault, the shipped bundle, and a
view whose entire purpose is to hold numbers that change. **In `metrics.md` the cursor is lost on any
line whose value moved, on every cycle, and the app announces a refusal that is untrue.** An
instance id of `(metrics, overall-accuracy-3d)` is unaffected by the number.

**The answer to Q1, precisely: three of the four rungs collapse into one lookup; the fourth survives
only for lines the engine has never rendered; and the collapse additionally removes a class of false
refusal that the rungs cannot avoid, because a rung built on characters is a content hash, not an
identity.**

---

## 2. Q2 — can the id ride the projection rather than living in the markdown?

**Yes. The constraint is real, and it is stronger than the brief claims: it is not a preference about
Obsidian, it is provable from the parser. Every available token shape is either eaten or corrupts the
node's title.**

### 2.1 The constraint, proven by the producer

`accept ⊇ emit` is declared — "round-trip invariant `parse(render(state)) == state` is the
test-enforced contract" (`apps/qntm-md/src/qntm_md/io/signature.yaml:150`) **[REPO]** — but the
inverse, an *extra* token on a line, is a documented loss. `parse_line`
(`apps/qntm-md/src/qntm_md/io/parser/line_parser.py:60`) is a **subtractive** grammar: its fixed
composition order (`:73-95`) excises each recognised token in turn and normalises whatever survives
into the title. So, for each shape an instance id could take:

| token shape | what the parser does | citation |
| --- | --- | --- |
| `#instance-abc` | `TAG_RE` excises it by shape; `TokenResolver` returns `UnknownToken`; `_classify` flattens to `kind="flag"`, which no applier phase consumes. **"The token is therefore gone from the title AND bound to nothing; the next render rebuilds the line from graph state alone and the operator's bytes are gone."** | `parse_tag.py:24`, `:71`; `applier.py:535-582` |
| `[[qntm:…]]`-like | risks reading as a second source-identity claim → `AmbiguousEditError` | `line_parser.py:180-190` |
| an undeclared emoji | **survives into the TITLE.** Preserved — and therefore renames the node. | `applier.py:570-572` |
| bare trailing text | `TAG_RE` needs a leading letter, so `#3` is not a tag; it lands in the title and is re-absorbed | `parse_tag.py:24` |

**[REPO]** **Every option is destructive: two silently delete the id, two silently edit the operator's
content.** The engine's own handling of the first case is diagnostic-only —
`_phase_unrecognised_tokens` "mutates no graph state and filters no candidate … only the unclaimed
token is lost, and saying so is the whole job" (`applier.py:583`, `:597-599`). **[REPO]**

And the second argument stands independently: the id is **derived** (§0.5), and derived data written
into the source of truth is precisely the shape this design forbids everywhere else —
`focus.ts:23-29`, "a fact about the moment written into a file is a fact that outlives the moment."

**The constraint is confirmed. The id must travel beside the markdown, never inside it.**

### 2.2 Is a sibling structured field enough for the client to key rows off?

**Yes, and the shape is already settled by a decision the anchor made.** **[REPO]**
`backlog.yaml` (`the-cursor-anchors-to-a-node-not-a-line-number`, record) fixes the coordinate as
**the source line index, never a painted-row ordinal** — because `paint.ts`'s `lastPaintedIndex`
holds the source index of the last line that got a row, and every writer (`applyEdit`, `seedFor`,
`clampLine`, `boundaryLine`) already speaks source indices. So the sibling field is an array indexed
by, or carrying, the source line number:

```
views[] : { id, path, title, domain, markdown, lines[] }
lines[] : { i, instance, node, section }
```

`i` is the source line index, `instance` is the opaque stable string, `node` is `qntm:N` or null,
`section` is the section id. Additive, ignorable by any older client, and it never has to be joined
by anything cleverer than `lines[i]`.

**Is it stable across two projections of the same view when content above it changed?** **[OBS]**
Measured, on the operator's `inbox.md`, between two reads minutes apart, across a real cycle that
minted a node:

```
('inbox','## Inbox','§',1)                    line 0 -> 0
('inbox','## Domain Empty','§',1)             line 1 -> 1
('inbox','## Domain Empty','qntm:2602',1)     line 2 -> 3
('inbox','## Domain Empty','qntm:2598',1)     line 3 -> 4
new in the projection: ('inbox','## Domain Empty','qntm:2603',1)
```

He typed "Lesley pay tenner", the cycle stamped it `qntm:2603`, and it sorted to the **top** of the
section. Every existing line moved down by one. **The ids did not move.** This is ARM 4 — the exact
failure the anchor was built for — happening for real in the view he says he always starts in.

**Uniqueness, over the whole live vault.** **[OBS]** Deriving `(view, section, node-or-text,
ordinal)` for every non-blank line of all five views: **121 identified lines, 121 distinct ids, zero
collisions, every ordinal 1** — including `this_week.md`, where the three duplicated stamps separate
cleanly because the two printings are in different sections:

```
qntm:1232  line  5  ('this_week','## Overdue to Start',   'qntm:1232',1)
qntm:1232  line 14  ('this_week','## Scheduled This Week','qntm:1232',1)
```

### 2.3 **Is the instance identity well-defined on the server?** — the answer in three parts

This is the question the brief says decides feasibility, and it has three answers, not one.

**(a) During the render: YES, exactly, and it is already load-bearing.** §0.3. `RenderedLineRecord`
carries `(sheet_id, section_id, node_id)`, `markdown_writer.py:188` keys on it, and the engine's own
comment at `renderer.py:625-632` describes a collision on that key as corruption. The printer knows.

**(b) After the cycle: NO. It is discarded.** §0.4. `line_cache` persists
`(file_path, line_number, fingerprint, parent_context_hash, position_context_hash, disposition)` and
nothing else. **So "carry it out of the database" is not available today.** It would need a schema
change to `line_cache` plus a migration — the machinery exists
(`persistence/schema.py:275-306`, `_line_cache_migration_required`) but it is an engine change to a
table on the operator's live database, and that is an arc, not an afternoon.

**(c) Re-derivable from data the projection server already holds: YES, completely, with no engine
change, no database read and no schema migration.** This is the finding that makes the whole idea
cheap, and I verified it rather than assumed it.

`_read_views` (`server/app.py:149-173`) already globs `CONFIG/views/*.yaml` and already reads each
rendered file. The view config declares its sections as an **ordered list**, and the renderer walks
`compiled_sheet.manifest` in that order (`renderer.py:341`). So **the Nth heading in the file is the
Nth declared section.** **[OBS]** Checked across all five live views — 24 declared sections, 24
headings, exact positional match, every heading text prefixed by the declared `name`, and empty
sections still emit their heading:

```
inbox      2 declared, 2 headings   metrics  5 declared, 5 headings
this-week  4 declared, 4 headings   habits   7 declared, 7 headings
routines   6 declared, 6 headings
```

**[OBS]** And across the entire declared config surface — **73 view configs — no view has two
sections with the same `name`.** So the heading string is a faithful proxy for `section_id` too,
which matters for a client that only has the markdown.

**This is what fixes `metrics.md`.** The heading *text* carries a moving number; the heading's
*ordinal*, and therefore its `section_id`, does not. §1.3's false `absent` is unreachable once the
section is identified by config rather than by characters.

### 2.4 **The fork: derived or remembered?** — derived, and remembering would be wrong

**Derived, and free.** **[REA]** From §0.5 the render is `f(graph_state, view_config)` and
byte-identical on a repeat run. An id computed from that render is therefore reproducible by anyone
holding the same inputs, stores nothing, and needs no coordination. Two renders of the same view
produce the same ids.

**The remembered variant is not merely more expensive — it would encode a falsehood.** Consider the
one case that separates them: `qntm:1232` moves out of `## Overdue to Start` and into `##
Scheduled This Week`. A remembered id would say "the same row moved." **It did not.** The row under
`Overdue to Start` ceased to exist and a row under `Scheduled This Week` came into existence; the
*node* is what persisted. Claiming continuity there is model identity wearing a view identity's
clothes — precisely the confusion the operator named ("cant rely on confusing model with view for
that").

So: **the id is derived, and the way you follow a node across a section change is to fall back to the
node.** Which is §3.3, and it is why the payload carries `node` beside `instance`.

**The one place a derived id is genuinely weaker, stated honestly.** The ordinal. Nine of the 73
view configs declare `structural_edge_types`, which sets `allow_repeats = True`
(`section_builder.py:227`) so a context node nests under every render-parent — the one configuration
where a node repeats **inside one section**. **[REPO]** There, `(section, node)` needs an ordinal,
and an ordinal is positional: delete occurrence 1 and occurrence 2 renumbers. **[OBS]** None of the
operator's five live views uses it; the nine that do are the dev/trace views
(`operator-*.yaml`, `flowtrace-*.yaml`, `qntm-classes.yaml`, `waiting-for-*.yaml`). **[UNVERIFIED]**
whether any of them actually renders a repeat — I cannot read the hosted vault, and the operator's
local vault materialises only five files. Note also that the engine has the *same* weakness there:
`renderer.py:625-632` says two records on one `(section_id, node_id)` slot "corrupt reconciliation for
BOTH lines". **This is a pre-existing engine ambiguity, not one the design introduces.**

---

## 3. Q3 — what does it NOT solve?

**The brief's claim is mostly right and partly refuted. Three things.**

**3.1 A genuinely absent row stays absent — confirmed.** **[OBS]** I deleted the `Overdue to Start`
printing of `qntm:1232` from `this_week.md` in a fixture and re-derived:

```
ABSENT: ('this_week','## Overdue to Start','qntm:1232',1)      (was line 5)
ABSENT: ('this_week','## Scheduled This Week','qntm:1232',1)   (was line 14)
```

An id tells you the row is gone. It does not bring it back, and it does not keep the operator's
characters — that is `the-vanished-line-is-parked-not-dropped` (backlog row 4), unchanged.

**3.2 A line the engine has never rendered has no instance identity, by construction — and this is
the hard one.** **[OBS]** I took an anchor on "`- [ ] Lesley pay tenner`" as the operator typed it,
before the cycle, and resolved it against the projection that came back:

```
inbox line 2, stamp=null, section="## Domain Empty"  ->  {"outcome":"absent"}
```

**The app's apex capability is `author-in-the-browser-not-in-obsidian`, and the act of authoring
destroys the cursor's hold on the line being authored.** The cycle stamps it, which changes its
characters, so TEXT cannot match; it has no stamp yet, so STAMP cannot fire; and it has no instance
id, because there was no render to derive one from.

**Instance identity does not fix this and cannot.** The fix is already named in the queue and is a
*different* construct: backlog row `a-line-being-made-survives-a-projection-too` says "its anchor is
RELATIVE ('after the node qntm:122'), read off the line above it when it was opened." **[REPO]** A
relative anchor is an id expressed as a **position between two instances**, which is exactly what an
instance-id space makes expressible — but it is a second thing to build, not a consequence of the
first.

**3.3 REFUTED — an instance id alone loses "follow the node", which the app has today for free.**
This is not in the brief and it is the one thing that would have made a naive implementation a
regression. **[OBS]** Today, if a uniquely-stamped node moves between sections, `STAMP` finds it
anywhere in the file and the cursor follows it — that is exactly the property `anchor.ts:35-37`
argues identity beat rebasing on. A pure instance-id lookup makes that same move `absent`.

**So the payload must carry the pair, and the client must degrade deliberately:**

```
instance matches   -> the same printing. Cursor holds. (was STAMP / STAMP_IN_SECTION)
node matches once  -> the printing moved. Cursor follows, and the app SAYS the section changed.
node matches twice -> the node is printed in two places now. Ambiguous, refused, candidates returned.
neither            -> absent.
```

**That is still the walk-the-rungs-and-report-which-answered shape, and it is still four outcomes —
but the rungs are now three identity spaces in specificity order instead of four heuristics over
whatever happened to be printable.** The trust ordering `ANCHOR_TRUST` exports becomes a real
ordering of *kinds of fact*, which is what row 3 needs when it decides what to do differently for a
weak restore.

**3.4 The honest ceiling.** Instance identity makes the FOUND case exact, cheap and correct, removes
a class of false refusal, and gives every other consumer a key. It does nothing for recovery, nothing
for a line that does not exist yet, and nothing about *what to do* when a row vanishes. **It is an
addressing primitive, not a policy.** Every policy question — park the characters, follow the node,
refuse the ambiguity — still has to be answered, and answering them gets easier because they stop
being tangled with "which row did he mean".

---

## 4. Q4 — is a GRID the right coordinate system?

**Yes, and the worry in the brief dissolves under one observation: the column is an offset into the
SOURCE line, never into the screen. Resolution changes what you see at a column; it never changes
what the column means.**

**4.1 Rows are instances. Settled.** §2.

**4.2 The column is well-defined for every row, at every resolution, because the source string is
the truth.** The governing rule, quoted in `research-state-and-speed.md:406-409`: "A resolution is
admissible only when every affordance it offers can be expressed as an edit to the SOURCE STRING.
The app never reconstructs markdown from the DOM." **[REPO]** An offset into `lines[i]` is
well-defined whether that line is painted as an `<input>` holding its characters
(`paint.ts:214-227`) or as a `<span>` holding chips (`paint.ts:731`). **A wired row does not lose its
column; it hides it.**

**4.3 And for the cursor's own row, the characters are on screen anyway — the cascade guarantees
it.** **[OBS]** `FOCUSED` contributes `"raw"` on **every** resolution key (`focus.ts:61-63`, built
from `RESOLUTION_KEYS` rather than listed by hand), and `FOCUS` is the most specific level in
`SPECIFICITY` (`levels.ts:41-49`), so it beats every declaration below it. The sibling agent on
`feat/vim-column` is widening that gate so the selected line is raw in NORMAL too, which strengthens
this rather than complicating it. **So the grid is not "a grid at a resolution": the cascade
*resolves the cursor's row into raw*, which is what makes a column visible where the operator is
looking.**

**4.4 A range spanning rows at different resolutions.** **[REA]**

* **`V` (visual-line) has no column at all.** It is `[min(anchor, head), max(anchor, head)]` over
  **instances** — pure row arithmetic, resolution-irrelevant. `design-the-vim-cursor.md` §1.3 already
  argues the anchor is one more number and belongs on `ModeSurface`; making both ends instance ids
  instead of indices is the only change, and it makes the range survive a projection arriving, which
  an index pair does not.
* **`v` (character-wise) is expressible and should still wait.** A range of
  `(instance, sourceOffset)` pairs is unambiguous across mixed resolutions. What is *not* yet
  buildable is the operation on it: a character range crossing a chip has to decide what deleting
  half a chip means, and the tag rendition already ships read-only for exactly that reason (backlog
  `token-renditions-chips-titles-and-pills` record: "the AFFORDANCE is not answerable yet"). **[REPO]**

**4.5 The real resolution-dependent problem is hit-testing, and it is per-rendition, not
per-grid.** **[REA]** Turning a *pixel* into `(instance, offset)` on a wired row needs a mapping, and
that mapping differs per rendition. This is a solved-shaped problem here: `TagSpan` already carries
source offsets (`resolution.ts`, cited in the tags record **[REPO]**), so each rendition can publish
its own screen→source map. **The coordinate system stays one thing; only the projection into pixels
is plural.** That is the clean generalisation, and it is the same split the cascade already makes
between a decision and its embodiment.

---

## 5. Q5 — does this serve the OTHER gesture scheme?

**It is the general answer, not a vim feature, and there are four independent consumers in this repo
already — one of which is a planned optimisation that currently cannot work.**

**5.1 The click path already needs it and currently fakes it.** **[OBS]** `paint.ts:724` and `:737`
bind `index` into a closure per row. That is "this row" addressed by position, rebuilt from scratch
on every paint, for a checkbox toggle and a focus click. A context menu, a drag handle, a swipe, a
long-press and a drop target all want the same thing and would all do the same. **An id turns a
closure per row per paint into a lookup.**

**5.2 The planned repaint memoisation is keyed by line index, and therefore breaks in exactly the
case that matters.** **[OBS]** `research-state-and-speed.md:488-513` proposes: keep a per-line record
of `(lineSource, resolvedRenditions)` beside the element built from it, and reuse the element when
the tuple is unchanged — 49 ms → 5-8 ms on a 670-line view, ~30-50 ms instead of ~250-600 ms on a
phone. Half a day. And then, at `:511-512`:

> "the cache is keyed by line index, so it must be **dropped whenever the source's line count
> changes**"

**A cycle inserting one line is the whole reason the app repaints.** §2.2 measured it happening in
`inbox.md` this afternoon. So the optimisation, as specified, throws its entire cache away precisely
when a projection arrives — which is the only moment it was for. **Keyed by instance id, the cache
survives an insert and rebuilds only the rows whose content changed.** This is not extrapolation: it
is a sized, already-ranked item in this repo that gets its value back from instance identity.

**5.3 A DOM reconciler of any kind needs a stable key per row — and the repo's own position on React
needs correcting.** **[OBS]** `research-state-and-speed.md:418-430` **disqualifies React, Preact,
Solid, Svelte and Vue on architectural grounds** — "the component tree becomes where truth lives …
the whole write path inverts" — and says the operator's "React interprets MD" formulation "survives
only if React renders *from* the source string on every paint and never holds a fragment of it."
`morphdom`/`idiomorph` are **admissible** (`:470-476`) because they build the target DOM from the
source exactly as `paint()` does and reconcile toward it.

So the sharper claim, which survives the correction: **whatever reconciler arrives — React under the
stated constraint, morphdom, or the hand-rolled memoiser of §5.2, and one of the three will
arrive — it needs a stable key per rendered row, and the app has none.** Today that costs nothing
only because no row holds state worth losing. **[REA]** The two exceptions are already the subject of
open backlog rows: the open `<input>` (`the-open-line-survives-a-new-projection`) and the draft
(`a-line-being-made-survives-a-projection-too`). **The app has been paying for the missing primitive
all along, in bespoke machinery — `DraftSurface`, the held line, four anchor rungs — instead of in one
key.**

**5.4 The frame — three identity spaces, or four?** The brief's frame is close. I would say **four**,
and the fourth is the one that earns its keep:

1. **Model identity** — the node. `[[qntm:N]]`. Engine-owned. "What thing is this."
2. **View identity** — `inbox`. Config-owned. "Which projection."
3. **Section identity** — `(view, section_id)`. **Config-owned, ordered, and stable across a heading
   rename or a heading whose text carries a computed value.** The app today approximates it with a
   display string, and §1.3 is what that costs.
4. **Presentation-instance identity** — `(view, section_id, node_id[, ordinal])`. This printing.

**And the brief's "owned by nobody" is refuted: (4) is owned by the renderer, computed every cycle,
and 1:1-assumed by the writer (§0.3). What is true is that it is discarded before the projection
boundary (§0.4).** That distinction changes the work from an invention into a carry, which is the
difference between an arc and an afternoon.

The four are not a flat set — **they are a path, and every prefix is independently addressable**:

```
view                              -> "scroll here", "this file"
view / section                    -> "collapse this", "drop it here", "add to this section"
view / section / node             -> "this row"
view / section / node / offset    -> "this character"
```

**That is what a conventional gesture scheme needs, and it is what a grid is.** A drag is
`(instance) → (section, before-instance)`. A context menu is `(instance)`. A section collapse is a
prefix. **[REA]** Vim's row-and-column is one traversal of that path; a pointer is another. Neither
is privileged, which is the whole strategic point.

---

## 6. The recommended shape

**Wire (additive, ignorable by older clients).** Alongside `markdown`, per view:

```
lines[] : { i, instance, node, section }
```

* `i` — source line index. The authority is already decided; see §2.2.
* `instance` — opaque stable string, `view/section_id/node_id` (`+#ordinal` only where needed).
  **Opaque is the point:** the client must not parse it, or the shape becomes a public contract.
* `node` — `qntm:N` or `null`. **Required**, or §3.3's "follow the node" is lost.
* `section` — section id. Makes a prefix addressable without string-splitting the instance.

Blank lines get no entry, matching `anchorFor` returning `null` (`anchor.ts:190-192`) — a decision
already made and already reasoned.

**Client.** One pure function, `instanceIdOf(source, lineIndex)`, and one lookup replacing the rung
walk in `resolveAnchor`. `FocusSurface` holds an instance id instead of an `Anchor`. Every consumer
in §5 keys off the same string.

**The seam that makes this land in two independent halves.** The client-side derivation (§2.3(c),
from the markdown alone) and the served array produce **the same string for the same row**. So the
client can compute it locally now and switch to reading it off the wire later, with **no change to
any consumer.** That is the same DEFAULT-floor-then-declaration shape the cascade already uses, and
it is why the sequence below is not front-loaded on a schema change.

---

## 7. The ranked order, with sizes

**R1 — derive the instance id in the browser, and collapse the rungs. [HALF A DAY]**
A pure module (`app/present/instance.ts`, or an extension of `anchor.ts` — sibling-owned, so
described not made) computing `(view, section-heading, node|text, ordinal)` from a source string.
`resolveAnchor`'s four rungs become: instance match → node match → ambiguous → absent (§3.3).
Needs **nothing** from the server, the Worker or the engine. Falsifier: the `this_week.md` duplicate
pair resolves to the correct printing with no `decide()` narrowing, and the ARM 4 / ARM 5 fixtures
still pass. **This is the cheap proof and it should be first.**

**R2 — carry `section_id` from the view config, server-side. [HALF A DAY, other repo]**
`_read_views` (`server/app.py:149-173`) already reads both the config and the file. Add the ordered
`sections:` list to `_parse_view_meta` and emit `lines[]` positionally (§2.3(c)). **This is what fixes
`metrics.md`** — the false `absent` in §1.3 is unreachable once a section is identified by config
rather than by characters. No engine change, no database read, no migration. Falsifier: change a
metric's value in a fixture and assert the cursor holds.

**R3 — key the row DOM by instance id. [UNDER AN HOUR]**
`data-instance` on every element `paint()` creates. Nothing reads it on day one. It is the seam every
later consumer needs, and it makes the primitive visible in the DOM where it can be inspected.

**R4 — memoise the embodiment, keyed by instance id. [HALF A DAY]**
`research-state-and-speed.md` §6.1, with the key changed from line index to instance id (§5.2).
**This row should now wait for R1/R3 and be re-specified**, because as written its cache is discarded
on the one event it exists for.

**R5 — the relative anchor for a line with no identity yet. [HALF A DAY]**
Backlog row `a-line-being-made-survives-a-projection-too`, promoted. §3.2 measured that authoring in
the browser loses the cursor today, and authoring in the browser is the apex capability. Expressed as
"after instance X", it is now a first-class value in a space that exists, rather than a special case.

**R6 — the range is a pair of instances. [HALF A DAY]**
`V` over instance ids (§4.4). Coordinates with `feat/vim-column`; do not build it while that branch
is live.

**R7 — mount the pointer gesture scheme on the same primitive. [AN ARC]**
Click, drag, drop, context menu, swipe — each addressing a prefix of the path (§5.4). This is the
headroom the foundation opens, and it is an arc because each gesture needs its own source edit, per
the standing rule that a resolution ships with its edit or does not ship.

**R8 — persist instance identity in the engine. [AN ARC, engine repo, and probably never]**
Add `section_id` / `node_id` to `line_cache` so the id is the engine's own rather than re-derived
(§2.3(b)). **Listed last, and I do not recommend it until something breaks:** R1+R2 reproduce the
same string from data already at hand, verified against 121 lines and 73 configs, and R8 buys
authority rather than behaviour at the cost of a migration on the operator's live database.

**Rows that should now wait rather than duplicate this work:**
`the-open-line-survives-a-new-projection` (row 3) and `the-vanished-line-is-parked-not-dropped`
(row 4) both get smaller after R1, the same way they got smaller after the anchor landed — row 3's
"decide what to do differently for a weak restore" becomes a decision over three named identity
spaces instead of four heuristics. **`carry-presentation-through-the-snapshot-envelope`** is the same
schema change at the same three producers as R2's wire half; **they should land together or the
schema is touched twice.**

**What can proceed in parallel:** R1 and R2 are independent (client derivation and server carriage
produce the same string). `feat/vim-column` is independent of all of it — it widens the FOCUS gate,
which §4.3 shows only strengthens the column argument.

---

## 8. Branches where a decision is open

The coordinator is putting design questions to the operator in parallel. Both branches, and the fact
that decides each:

**Is a duplicated printing one thing or two?** If **two** (my recommendation, and what §2.4 argues),
the id is `(view, section, node)` and a section change is an absent-plus-a-new-row, with §3.3's node
fallback carrying the cursor across. If **one**, the id degenerates to `(view, node)` and
`this_week.md` becomes ambiguous on 6 of 18 lines with no way to resolve it — the anchor's current
`ambiguous` outcome, permanently. **Decided by: whether the operator regards the two printings of
`qntm:1232` as one row shown twice or two rows.** Everything else follows.

**Does every printed line get an id, or only node lines?** **Every line**, on the evidence:
`metrics.md` has **zero** node lines and five headings, and it is the view §1.3 shows breaking today.
A design that ids only node lines cannot address `metrics.md` at all. **Decided by: whether headings
are navigable** — and `paint.ts` already draws a vim mark on a blank line, so the cursor demonstrably
goes places that are not node lines.

**Is the cursor remembered per view?** Independent of this design, and instance ids make either
answer cheaper — a per-view map keyed by instance id is the whole implementation. **[REA]** Note the
existing asymmetry it would interact with: `paintView` treats a view change and a projection arrival
as opposite events (`app/index.html:1186-1191`) and drops the draft on both (`:1204`), which backlog
row 8 already argues is right for one and wrong for the other.

**Absence behaviour.** Unchanged by this design (§3.1). It is row 4's question.

---

## 9. What I refuted

**9.1 "The four rungs are a client-side reconstruction of instance identity" — confirmed, but the
count is wrong and the framing understates it.** Three rungs collapse, not four; `TEXT` survives for
lines the engine never rendered; and the rungs additionally produce a **false `absent`** on a row
that is still on screen (§1.3), which no amount of rung-ordering can fix, because a rung built on
characters is a content hash.

**9.2 "Instance identity only lets the system say `absent` cleanly, which the fourth rung already
does" — refuted.** The fourth rung says `absent` about a row that is present. Instance identity does
not tidy the report; it **corrects** it.

**9.3 "The instance identity may only exist at the moment of rendering" — refuted, then half
re-confirmed.** It is well-defined during the render, is `(sheet_id, section_id, node_id)`, and is
already 1:1-assumed by the writer (§0.3). It is *not* persisted (§0.4) — but it is fully
**re-derivable** from the view config plus the rendered file, both of which the projection server
already reads (§2.3(c)). So the feasibility question the brief called decisive has a better answer
than either "yes" or "no": *it does not need to be carried, because it can be recomputed by anyone
holding the inputs.*

**9.4 "A pure instance id is enough" — refuted, and this one would have been a regression.** Today a
uniquely-stamped node that moves section keeps the cursor via `STAMP`. A pure instance lookup makes
that `absent`. **The payload must carry the node beside the instance** (§3.3).

**9.5 "The grid only exists at a given resolution" — refuted.** The column is an offset into the
source line, which is well-defined at every resolution; and the cascade resolves the cursor's own row
to raw regardless (§4.3). The genuinely resolution-dependent thing is pixel→offset hit-testing, which
is per-rendition machinery, not a second coordinate system (§4.5).

**9.6 "`this_week.md` proves duplication is typical" — refuted, and then partly reinstated.** It is
the only one of the operator's five live views that duplicates, and he says it needs tweaking. But
`this-week.yaml:11-13` declares the duplication deliberately — two lenses on one node — so it is a
supported design, not a misconfiguration, and any future multi-lens view will do the same. **Rare;
not wrong; do not design it away.**

**9.7 "React's `key` is the argument" — corrected, and the underlying point survives intact.**
`research-state-and-speed.md:418-430` **disqualifies React and every component framework** on
architectural grounds. The claim that holds is broader and safer: **any** reconciler needs a stable
row key, `morphdom` is already assessed as admissible, and the hand-rolled memoiser this repo prefers
is specified with a key that breaks (§5.2).

---

## 10. Unverified

* **[UNVERIFIED]** Whether any view using `structural_edge_types` (9 of 73 configs) actually renders
  the same node twice inside one section. **Settled by:** rendering one of the `operator-*` views and
  counting `(section, node)` pairs — or by reading the hosted vault's 77 rendered files, which I
  cannot.
* **[UNVERIFIED]** Whether the hosted instance's 77 views (`worker/src/app.js:82`) hold section-name
  collisions or heading/section-count mismatches. The 73 configs in the monorepo have none, and the
  5 live files match exactly, but the hosted set is a different vault. **Settled by:** running the
  §2.3(c) positional check against the hosted `CONFIG/views` and `VAULT`.
* **[UNVERIFIED]** Whether a section can ever emit *no* heading (which would break positional
  matching). All 24 sections across five views emit one, including empty sections, but I did not find
  the code path that could suppress it. **Settled by:** reading `renderer.py:404-437` and
  `section_builder.py` for a suppression branch, or a fixture with a nameless section.
* **[UNVERIFIED]** Nothing here was observed in a browser. Every projection in this document is a
  string read from disk or built in a script, exactly as the anchor row's own record notes about
  itself.
* **[UNVERIFIED]** The 49 ms → 5-8 ms figures in §5.2 are quoted from
  `research-state-and-speed.md`; I did not re-measure them.

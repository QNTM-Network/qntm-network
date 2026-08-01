# Design: the vocabulary mapping — can the browser mirror what a token MEANS, both ways, and what does it cost

**Status: measured against the operator's real config, his real vault and a read-only copy of his
real graph. No application source is modified on this branch. This document is the only file it
adds.**
**Branch:** `design/vocabulary-mapping`, based on `origin/main` @ `33c63fd`.

---

## 0. Lead — the answer, before the method

**Yes, the browser can mirror the mapping. It is one declaration read in both directions, not two,
so the browser needs ONE grammar, not two. It costs about 9 KB on top of a 139 KB declaration it
already ships. And 127 of the 134 entries need no parser at all — they are a lookup table.**

That last number is the whole finding, and it inverts the shape of the problem. He described the
mapping through a date — *"its value is inserted by the following text accepted in x format (date
say)"* — and a date is the hardest case in the system. It is also **4 entries out of 134**.

**[OBS]** Loading his real bundle and counting by declaration shape:

| what the declaration carries | entries | needs a value parser? |
|---|---|---|
| `token` → `field` + a **literal value** (`#work` → `domain=work`) | **84** | no — a lookup |
| `token` → `node_type` (`#task` → `task`) | **28** | no — a lookup |
| `token` → `edge_type` + cardinality (`#unlocks` → `UNLOCKS`, many) | **6** | no — a lookup |
| `token` → `structural_token` (the positional bindings) | **3** | no |
| `token` → `deletion_intent` | **2** | no |
| **`token` → `field` + an `extraction_hint`** (`📅` → `due_date`, date) | **7** | **yes** |
| `token` **template** → `parametric_field` (`#every-{n}{unit}`) | **4** | yes — a grammar |
| **total** | **134** | **11 of 134** |

**[OBS]** And of the 7 hint-carrying entries, **2 are `render_only`** (`☑️ done_task_count`,
`🎯 par`) — the engine prints them and never reads them back, so the browser never has to parse
them either. **The genuinely bidirectional value-format surface in his whole config is FIVE
tokens: `📅` `🛫` `✅` `🆕` (dates) and `🔢` (an int).**

**The first slice is ONE FIELD, BOTH WAYS, WITH A DROPPED RECORD — and the field is `domain`, not
the date.** The browser already reads `#work → domain=work` (`app/present/membership.ts:193-201`).
It cannot go the other way for anything at all: **there is no field+value → token function anywhere
in `app/`.** Adding one, for one field, is 12 rows of data and a `Map` lookup. Its falsifier is
already computable: over his 1,501 real nodes the browser's inverse must produce the byte-identical
token the engine's `source_tags_for_node` produces for all **1,322** nodes that carry a domain, and
must produce **nothing, recorded as dropped**, for the **16** that carry `domain: dojo` — a value
his schema declares and his vocabulary does not spell. **[OBS]**

**The argument against the tempting answer.** The tempting answer is to start with `📅` because
that is the example he gave. It is the wrong rung and the reason is measurable: the date is the
**only** part of the mapping where Python's accept set is genuinely hard to reproduce in a browser.
**[OBS]** `datetime.date.fromisoformat` — which is what the engine calls, via
`vocabulary/extraction.py:38` — accepts `20260828` **and** `2026-W35-1`, and normalises the latter
to `2026-08-24`. No JavaScript primitive does that. Starting there means spending the first slice on
the one case that is not representative of the other 129. Start where the shape is proved cheaply,
then pay for the date deliberately, with a refusal path.

---

## 1. Method — what was run, and the controls on it

Everything below marked **[OBS]** came from running the engine's own machinery against read-only
copies. Nothing ran a cycle. Nothing wrote to the vault, the live server, or `state.db`.

* **Bundle census.** `qntm_md.bundle.loader.load(config/)` over his real
  `apps/qntm-md/config/`, then `TokenResolver(entries)`, counting entries by `mapped_target`
  category and by declaration shape.
* **Vault census.** Every `#tag`, checkbox glyph and marker glyph on every line of all **77**
  markdown files in `~/qntm` (**3,638 lines**), each one classified by the engine's own
  `TokenResolver.resolve()`.
  **Positive control:** `#work` must be found more than zero times — found **1,173**.
  **Negative control:** `#zzz-not-a-real-token` must be found zero times — found **0**. Both held,
  so a zero anywhere else in that arm is a real zero.
* **Round-trip census.** For all **1,501** nodes in a copy of `state.db`: run the engine's own
  `source_tags_for_node()` + `source_markers_for_node()` to get what it EMITS, then run
  `resolve()` on every emitted token to get what comes BACK, and compare against what the node
  actually holds.
  **Falsifier probe:** removing one emitted token from the accept set must make the comparator
  report exactly that token. It did.
* **Independent agreement.** The census reproduced the merged
  `research-the-resolution-universe.md` §4.4 numbers exactly and without consulting them — 134
  entries, 91/28/6/4/3/2 by target, 84 carrying a literal value, 1,501 nodes and 460 edges. Two
  independent counts agreeing is worth more than one.
* **Browser inventory.** An exhaustive read of `app/`, covering string-literal references and not
  only syntactic ones — because the last two sweeps in this project each missed call sites named as
  strings.

---

## 2. Q1 — what the config actually declares, and what it does NOT

### 2.1 The declaration shapes, all seven of them

**[OBS]** 134 entries across 19 files in `apps/qntm-md/config/vocabulary/`. Every entry is
`token:` plus **one** discriminator. The discriminator is what the browser has to switch on.

| shape | example, verbatim from his config | file |
|---|---|---|
| `field` + `value` | `{ token: "#work", field: domain, value: work }` | `domain_tags.yaml:142` |
| `field` + `extraction_hint` | `{ token: "📅", field: due_date, extraction_hint: trailing_date }` | `markers.yaml:203` |
| `field` + `value` (marker form) | `{ token: "⏫", field: priority, value: high }` | `markers.yaml:208` |
| `field` + hint + `render_only` | `{ token: "🎯", field: par, extraction_hint: trailing_float, render_only: true }` | `markers.yaml:219` |
| `node_type` | `{ token: "#routine", node_type: routine }` | `type_tags.yaml:461` |
| `edge_type` + `cardinality` | `{ token: "#unlocks", edge_type: UNLOCKS, cardinality: many }` | `edge_tags.yaml:160` |
| `parametric_field` | `token: "#every-{n}{unit}"` + `field: cadence` + `units:` | `parametric_tags.yaml:288-293` |
| `structural_token` | the positional bindings, the wiki-link binding rules | `structural_tokens.yaml:335, 387` |
| `deletion_intent` | `{ token: "#delete", deletion_intent: tag }` | `deletion_gestures.yaml:115` |

### 2.2 The 23 fields the vocabulary touches, and their value formats

**[OBS]** Every field-target entry, grouped:

| field | tokens | schema type | format |
|---|---|---|---|
| `genre` | 14 | string | literal |
| `cadence` | 13 + 3 grammars | string | literal **or** a parametric capture |
| `domain` | 12 | enum (13 values) | literal |
| `change_type` | 8 | enum | literal |
| `status` | 6 | enum | literal (checkbox glyphs) |
| `cap_state` | 6 | enum | literal |
| `principle_state` | 5 | enum | literal |
| `class_state`, `package_state` | 4 each | enum | literal |
| `instantiate` | 3 | string | literal |
| `tier`, `priority`, `asserted_state` | 2 each | enum | literal |
| `god_box`, `blocked_state`, `lead_state` | 1 each | enum | literal |
| **`due_date`, `available_date`, `completed_at`, `created_at`** | 1 each | **date** | **`trailing_date`** |
| **`queue_position`** | 1 | **int** | **`trailing_int`** |
| `done_task_count` | 1 | int | `trailing_int`, **render-only** |
| `par` | 1 | float | `trailing_float`, **render-only** |
| `scope` | — | string | a parametric verbatim capture (`#scope-{area}`) |

### 2.3 "Which node types may it apply to" — the vocabulary does not say. The schema does.

**[REA] This is the half of his sentence that has no home in the vocabulary at all, and it needs
naming before anyone builds against it.** He said *"this token maps to this field on these nodes."*
The vocabulary declares the first two. It is **silent** on the third.

**[OBS]** Applicability lives in `config/schema.yaml`, as a per-node-type field list. Across
**23 vocabulary-touched fields × 31 node types** there are **198 true pairs**, and the matrix is far
from full:

| field | applies to N of 31 node types |
|---|---|
| `status` | 30 |
| `created_at`, `domain` | 29 |
| `completed_at` | 28 |
| `due_date` | 22 |
| `priority` | 21 |
| `available_date` | 6 |
| `cadence` | 5 |
| `instantiate` | 4 |
| `done_task_count`, `genre` | 3 |
| `asserted_state`, `blocked_state`, `change_type`, `lead_state`, `par`, `queue_position` | 2 |
| **`cap_state`, `class_state`, `god_box`, `package_state`, `principle_state`, `tier`** | **1** |

**[REA] So `#God` on a `#capability` line is not a vocabulary question; it is a schema question, and
a browser that mirrored only the vocabulary would accept it.** Six of the 23 fields exist on
exactly one node type. If the browser is to tell him *"that token does nothing here"*, it needs the
198-cell applicability matrix as a second table — and that table is a plain read of
`schema.yaml`, no harder than the first.

### 2.4 Two token families that mean a field and are NOT in the 134

**[OBS] `#summary` and `#link` set a field on a node, and `TokenResolver.resolve()` returns
`UnknownToken` for both.** They are declared as `field_bindings:` inside the `positional_binding`
payload of `structural_tokens.yaml:430-438`, and they are resolved by a **different object** —
`StructuralTokenResolver.field_binding_for(token)` / `.field_binding_token_for(field)`
(`vocabulary/structural_token_resolver.py:374-390`).

This is not academic. **[OBS]** In the vault census `#summary` is the **single most frequent
unrecognised token, at 368 occurrences** — more than every other unknown combined — and `#link`
adds 4. **[OBS]** In the graph, `summary` is set on **254** nodes and `link` on **3**.

**[REA] A browser that mirrored "the vocabulary" and stopped would be blind to the second-largest
field-bearing token family the operator actually writes.** The good news is that this second
resolver is also **one declaration read both ways** — `field_binding_for` is ingest,
`field_binding_token_for` is render. So it costs 2 more rows, not a second mechanism. It just has
to be gone and got.

---

## 3. Q2 — ONE declaration, read in both directions. With three named exceptions.

**This is the answer that decides the browser's shape, so it gets stated plainly and then
qualified.**

### 3.1 The rule: one declaration, both ways

**[OBS]** `vocabulary/token_resolver.py:264-266` — the resolve index and the render index are built
inside **the same loop over the same `entries` list**:

```
resolve_index[entry.token_form] = entry
render_index.setdefault(entry.mapped_target, {})[entry.value] = entry.token_form
target_token_forms.setdefault(entry.mapped_target, []).append(entry.token_form)
```

`resolve()` (`:317-348`) reads the first. `render()` (`:599-619`) reads the second. There is no
second YAML file, no second list, nothing to drift. **The parametric grammars behave the same way
by design** — `parametric_tags.yaml:266-271` says so in its own header, and
`_resolve_parametric` (`:350-387`) and `_render_parametric_field` (`:389-411`) both consult the
same compiled `_ParametricGrammar` list.

**[REA] So the browser needs ONE grammar, not two.** Publish the 134 declarations once; build both
indexes in the reader, exactly as `TokenResolver.__init__` does. That is the single most consequential
fact in this document, because two declarations would have doubled both the payload and the drift
surface.

### 3.2 Exception 1 — the checkbox is genuinely two declarations, and it is already a red gate

**[OBS]** The six checkbox glyphs are the one family where accept and emit live in different
ownership domains:

* **accept**: `config/vocabulary/checkbox.yaml` — operator-owned, reloadable, shipped by `graph-sync`.
* **emit**: `src/qntm_md/render/contracts/render_checkbox.yaml` — **inside the Python wheel**, not
  config, not operator-reachable. Its own header says *"THIS FILE IS THE SOURCE OF TRUTH FOR THE
  CHECKBOX GLYPH. Nothing else is."*

**[REPO]** `apps/qntm-md/tests/flow_scenarios/emit_vocabulary_is_a_subset_of_accept_vocabulary.py`
already exists as a RED-CLASS gate over exactly this, and its docstring records the observed
consequence: deleting the `[x]` row from the accept file makes `- [x] my test` parse to a task
**titled** `[x] my test` with `status=open`, at exit 0, no diagnostic.

**[REA] The browser must take the ACCEPT file as its source and never the emit table** — otherwise
it inherits a divergence the engine already knows it has.

### 3.3 Exception 2 — a hardcoded five-emoji map in the parse path, with a narrower date grammar

**[OBS]** `src/qntm_md/io/render_context_parse.py:46-52`:

```
_MARKER_FIELD_BY_EMOJI = {
    "📅": "due_date", "✅": "completed_at", "🛫": "available_date",
    "🔽": "priority", "⏫": "priority",
}
_DATE_VALUE_RE = r"\d{4}-\d{2}-\d{2}"
```

Five of the twelve markers, in Python, keyed to fields, with a date regex **narrower than the
`fromisoformat` the extraction hint actually uses** (§4.1). It drives chrome-stripping, not field
ingest, so it is not a correctness bug today. **[REA] It is a live example of the drift the
one-declaration property is supposed to prevent, sitting inside the engine that owns the property.**
A browser mirror should not copy it.

### 3.4 Exception 3 — `#summary` / `#link` resolve through a second object

Covered at §2.4. Still one declaration each, still bidirectional, just a different resolver.

---

## 4. Q3 — the value formats, enumerated from his real config, and which are safe

There are **exactly three** extraction hints in the whole system, and the list is closed at the L0
type layer: **[OBS]** `types.py:85` — `KNOWN_HINTS = {"trailing_date", "trailing_int",
"trailing_float"}`, with a module-load drift check at `extraction.py:68-72` asserting the L1
dispatch registry matches it. Adding a fourth requires a code change in two places.

All three are three-line functions (`extraction.py:32-56`): `rsplit(maxsplit=1)`, then
`date.fromisoformat` / `int` / `float`.

### 4.1 The accept sets, measured — where Python is wider than JavaScript

**[OBS]** Run against the engine's own `extract()`:

| input | Python accepts | naive JS equivalent | divergence |
|---|---|---|---|
| `📅 2026-08-28` | `date(2026,8,28)` | same | none |
| `📅  2026-08-28` (two spaces) | `date(2026,8,28)` | depends on the regex | **latent** |
| `📅 20260828` | **`date(2026,8,28)`** | `Invalid Date` | **Python wider** |
| `📅 2026-W35-1` | **`date(2026,8,24)`** | `Invalid Date` | **Python wider, and it NORMALISES** |
| `📅 2026-8-28` | `ValueError` | `new Date` would accept | **JS wider** |
| `📅 2026-02-30` | `ValueError` (day out of range) | `new Date` rolls to Mar 2 | **JS silently wrong** |
| `🔢 1_2` | **`12`** | `NaN` | **Python wider** |
| `🔢 ٣` (Arabic-Indic) | **`3`** | `NaN` | **Python wider** |
| `🎯 1e5` | `100000.0` | `100000` | same |
| `🎯 inf` / `🎯 nan` | **`inf` / `nan`** | `NaN` | **Python wider** |

**[REA] The two directions of divergence are not equally dangerous, and the difference is the whole
of §6.** Python-wider is a **refusal** case: the browser sees `20260828`, does not understand it,
and must say so. JS-wider is a **corruption** case: `new Date("2026-02-30")` silently becomes 2
March and the browser would assert a date the engine would have rejected. **A browser mirror must
therefore never use `new Date` for a token value.** It must use a strict `^\d{4}-\d{2}-\d{2}$`
regex plus an explicit real-calendar check, accept nothing else, and record everything else as
refused.

### 4.2 What is actually in the vault, which makes the refusal cheap

**[OBS]** Across all 3,638 lines, every value following a `trailing_date` marker:

| shape | occurrences |
|---|---|
| `YYYY-MM-DD` | **2,575** |
| anything else | **4** — and all four are the English words `or` / `by` in prose, not markers |

**[OBS]** And in the graph, all **1,458** stored date values across `due_date` (43),
`available_date` (92), `completed_at` (557) and `created_at` (766) are ISO strings.
**Zero non-ISO.** `parse_marker.py:123-127` is why: a `datetime.date` is converted straight back to
`.isoformat()` before storage, because the graph stores every date as an ISO string and never a
`date` object.

**[REA] So the exotic accept forms are theoretical in his vault and real in his engine.** A strict
ISO-only browser mirror is byte-correct on 2,575 of 2,579 observed values and refuses the rest
visibly. That is the right trade, and it is only defensible because the number was counted rather
than assumed.

### 4.3 The parametric grammars — a fourth format kind, and it is a real grammar

**[OBS]** Four templates, two modes (`parametric_tags.yaml:287-311`):

* **MULTIPLIER** — `#every-{n}{unit}`: `{n}` is a positive integer, `{unit}` indexes
  `d`/`w`/`m` → `#daily`/`#weekly`/`#monthly`, whose interval is read from `cadence_tags.yaml`
  at resolve time. `#every-2w` = 2 × 7 = `cadence=14`. **The numbers are not duplicated anywhere.**
* **VERBATIM** — `#every-{weekdays}`, `#every-{dom}`, `#scope-{area}`: the capture becomes the
  value, after validation (`token_resolver.py:122-148`) — weekday names are checked against
  `grammar/date_grammar`, day-of-month must be 1..31.

**[OBS]** Measured behaviour, which the browser must reproduce exactly:

```
resolve('#every-wed')       -> cadence='wed'          resolve('#every-funday')  -> UnknownToken
resolve('#every-wednesday') -> cadence='wednesday'    resolve('#every-0d')      -> UnknownToken
                                                      resolve('#every-32nd')    -> UnknownToken
```

**[OBS]** The multiplier regex is generated by `_compile_parametric_template` (`:89-119`) and is
about 30 lines of engine code. A browser could reproduce it. **[REA] But it is the last thing to
build, not the first** — it is 38 occurrences in the entire vault (`#every-3d` 19, `#every-14d` 13,
`#every-2d` 3, `#every-90d` 3), against 6,036 literal tag occurrences. Two orders of magnitude less
traffic for the most engine-shaped code in the mapping.

---

## 5. Q4 — what the browser can answer now, and what it still cannot

**His reading was right, and it is more precise than he stated it. There is a second exception he
did not name.**

### 5.1 What is already served, exactly

**[OBS]** `presentation.json` (138,793 bytes, inlined at build time into `dist/present.js` via
`app/present/embedded-declaration.ts:45-47`) carries **three** vocabulary-derived things:

| key | contents | direction | consumer |
|---|---|---|---|
| `qualification.tokens` | **46 of 134** — `node_type` 28, `domain` 12, `status` 6 | **ingest only** (token → value) | `app/present/membership.ts:182, 193-201` |
| `resolution.sectionRegistration[view][section].tokens` | **361 pre-spelled seed tokens**, 41 distinct, over 179 of 186 sections | **neither** — pre-computed answers | `app/present/newline.ts:270-278`, `join(" ")` |
| `resolution.orderingFields` | **3 markers**: `📅`/`due_date`/date, `🛫`/`available_date`/date, `🔢`/`queue_position`/int | field → glyph + value **SHAPE** | `app/present/ordering.ts:183` |

**[REA] `orderingFields` is the exception he did not name, and it is the more interesting of the
two.** It is the only place a glyph reaches the browser as data with a value-shape attached, and
`app/present/ordering.ts:163-190` genuinely extracts a value with it — `line.indexOf(marker.token)`,
then `/^\s+(\S+)/`, then a shape test. **But the extracted value is a string used for a rank
comparison and is never asserted as a field**, and the shapes are the browser's own three regexes,
not the engine's accept set. It is 3 of 12 markers, ordering only.

### 5.2 What the browser genuinely cannot answer

**[OBS]** Sharpened by enumeration, not by a grep returning nothing.

1. **Any field except three.** `app/present/membership.ts:69` hardcodes
   `RESOLVABLE_FIELDS = ["node_type", "domain", "status"]`. **[OBS]** `qualification.dropped`
   records **77 vocabulary tokens the generator refused** for setting some other field — every
   `cadence`, `genre`, `priority`, `change_type`, `cap_state`, `principle_state`, `tier`,
   `instantiate`, `scope`, `par`, `done_task_count`, `blocked_state`, `asserted_state`,
   `lead_state`, `queue_position`, and every date marker.
2. **Any value.** `📅 2026-08-28` reaches the browser as offsets. **[OBS]**
   `app/present/resolution.ts:604-622` `markerSpans` returns `{start, end}` — **not even the glyph
   text**. `:600` matches markers by Unicode class (`/\p{Extended_Pictographic}️?/gu`) precisely
   because *"which glyphs are markers is itself vocabulary"* — an honest refusal, and a total one.
3. **The render direction, for anything.** **[OBS]** There is no field+value → token function in
   `app/`. `app/present/resolutiontable.ts:146-149` states the position outright: which tag spells a
   `(field, value)` pair *"is a config read that happens once, in
   `scripts/generate-resolution-declaration.mjs`"*. The browser receives answers, never the mapping.
4. **`[x]` outside the served table.** **[OBS]** `app/present/resolution.ts:172`
   `/^(\s*)- \[( |x|X)\] (.*)$/` — a hardcoded two-glyph grammar; `[/]`, `[-]`, `[~]`, `[>]` fall
   through to `kind: "prose"`. `app/present/source.ts:202` writes `"x"` or `" "` as a **literal**.
   That is the only place the browser writes a status glyph, and it is not a table lookup.
5. **Edge tokens.** All 6 (`#next`, `#unlocks`, …) are absent from every served table.
6. **The applicability matrix.** All 198 pairs (§2.3) — nothing of it is published.
7. **`#summary` / `#link`** (§2.4) — 372 vault occurrences, 257 nodes, unserved.

**Score: 46 of 134 mappings served, ingest-only, for 3 of 23 fields. 0 of 134 served in the render
direction.**

---

## 6. Q5 — what breaks the round trip

`accept ⊇ emit`. Measured over his whole real graph, not argued.

### 6.1 The engine's own round trip is clean, and one methodological trap is worth naming

**[OBS]** Over all 1,501 nodes: **0 emit-not-accepted tokens, 0 lossy recoveries.** Every token the
engine prints from state resolves back to the same field and the same value.

**[OBS] But a naive comparator says otherwise, and this is the trap.** Comparing the emitted set
against the set of literal `token:` strings reports three violations — `#every-3d`, `#every-14d`,
`#every-90d`. They are false. Those tokens are accepted by the **parametric grammar**, which has no
literal entry. **[REA] The merged checkbox gate compares literal sets, which is correct for
checkboxes and would false-positive on any family with a grammar. Any generalisation of it must
compare through `resolve()`, not through the token list.**

### 6.2 The normalisations the engine performs — all four of them

The browser has to reproduce each of these, or refuse the input that triggers it.

| normalisation | where | can a browser do it? |
|---|---|---|
| **Variation selectors stripped** from token identity (`☑` ≡ `☑️`) | `token_resolver.py:48-53`, `canonicalise_token_form` | **yes, trivially** — `s.replace(/[︎️]/g,"")`. **[OBS]** Only 2 declared forms carry one: `☑️`, `🏳️` |
| **Date coerced to canonical ISO** — `2026-W35-1` → `2026-08-24`, `20260828` → `2026-08-28` | `extraction.py:38` + `parse_marker.py:123-127` | **no, not faithfully.** Must refuse the non-ISO forms |
| **Int accepts underscores and non-ASCII digits** — `1_2`→12, `٣`→3 | `extraction.py:47` (`int()`) | **no.** Must refuse |
| **Parametric captures lowercased and validated** | `token_resolver.py:136-147` | **yes** — the regex is `[a-z]+`, so the lowercase is a no-op and the weekday list is a literal set |

**[OBS] There is NO case folding on token identity.** Probed directly:

```
resolve('#work') -> domain='work'      resolve('#WORK') -> UnknownToken
resolve('#God')  -> god_box=...        resolve('#god')  -> UnknownToken
resolve('#every-3D') -> UnknownToken   resolve('#EVERY-3d') -> UnknownToken
```

**[REA] That is very good news and it should be said out loud.** A case-insensitive enum would have
been the classic silent-divergence trap — `toLowerCase()` in JS and `str.lower()` in Python differ
on Turkish dotless-i and on a handful of other code points. There is nothing to mirror. Exact-match
plus a variation-selector strip is the entire identity rule.

### 6.3 The four things that DO break, live, in his vault today

**[OBS]** Field values held in state that no token can spell — so they are invisible in markdown and
would be lost on any hand round trip:

| what | count | why |
|---|---|---|
| **`domain: dojo`** | **16 nodes** | `dojo` is in `schema.yaml`'s domain enum. `domain_tags.yaml` declares no token for it. |
| **`priority: normal` / `priority: urgent`** | 0 nodes today | Declared in the schema enum; only `low` and `high` have markers |
| **`cadence: wed`** | **1 node** | `#every-wed` is ACCEPTED via the weekday-set grammar; **render-back returns `None`**. Accept-only, emit-never. |
| **node types `ticket` and `header`** | **239 + 126 = 365 of 1,501 nodes** | No `#ticket` or `#header` token in `type_tags.yaml`, so `source_tags_for_node` prints no type tag for **24% of the graph** |

**[OBS]** Also confirmed by render-back probe: `cadence='15th'` → `None`. `parametric_tags.yaml:285`
already names this as an open residual (`backlog#recurrence-calendar-parametric-vocab`).

**[REA] These are not browser problems — they are engine-side asymmetries the browser will inherit
and then be blamed for.** A browser that faithfully mirrors the mapping will print nothing for a
`dojo` node's domain, exactly as the engine does, and he will read that as the browser being wrong.
**Every one of them must appear in the browser's `dropped` record on day one, naming the engine as
the cause.** That is the difference between a mirror that is trusted and one that is not.

### 6.4 The rule for what the browser may WRITE

**[REA]** Stated as an invariant, because it is the one thing that can corrupt his vault:

> The browser may write a token only if (a) it is a literal entry in the served table, or (b) it is
> a value the browser itself just parsed under the STRICT accept set. It may never re-emit a form it
> did not fully understand, and it may never widen a format to be helpful.

Under that rule, `📅 20260828` typed by hand is **held and reported**, never rewritten. `📅
2026-02-30` is **refused**, never rolled forward to March.

---

## 7. Q6 — where this sits on his ladder, and the first slice

### 7.1 Where it sits

His ladder is **registration → defaults → the rule pass** — rungs 1 and 2 are the config cascade,
rung 3 is the rule engine. **[REPO]** (`design-the-rule-mirror.md` §0.)

**[REA] The vocabulary mapping is not a fourth rung. It is the substrate underneath rungs 1 and 2,
and it has been standing in for itself.** Rung 2 works today — 361 seed tokens across 179 sections —
because `scripts/generate-resolution-declaration.mjs` did the field+value → token lookup **once, at
build time, on his laptop**, and shipped the answers. That is why it was cheap, and it is exactly
why it does not generalise: **[OBS]** `backlog.yaml:2753-2756` records that of **262 declared
section defaults, 188 are spelled and 74 are not** (`project` 60, `stage` 9, `domain` 5), and
`backlog.yaml:2789-2793` names the harder gap: *"It does not seed MARKERS (🆕, 📅) — no section
default names a marker field."*

**Publishing the mapping is what turns that one-shot build-time lookup into a function the browser
can call at any moment, on any line he types.** That is the difference between the browser knowing
what a NEW line becomes and the browser knowing what the line under the cursor **means**.

### 7.2 The first slice

**ONE FIELD, BOTH DIRECTIONS, WITH A DROPPED RECORD. The field is `domain`. Size: half a day.**

What ships:

1. `scripts/generate-resolution-declaration.mjs` gains a `vocabulary` block for one field:
   `{"domain": {"tokens": {"#work":"work", …}, "spellings": {"work":"#work", …}}}` — 12 rows each
   way, both generated from **one** read of `domain_tags.yaml`, mirroring
   `TokenResolver.__init__`'s single loop.
2. A strict reader in `app/present/`, in the shape of `resolutiontable.ts` — refuse-and-record on
   any malformed row.
3. Two functions: `fieldValueForToken(field, token)` and `tokenForFieldValue(field, value)`.
4. A `dropped` row for `dojo`, generated (not hand-written) by diffing the schema enum against the
   declared tokens.

**Its falsifier, and it is a strong one because it runs against the real graph:**

> For each of the 1,501 nodes in the snapshot, `tokenForFieldValue("domain", node.fields.domain)`
> must equal the `#`-prefixed domain token in `TokenResolver.source_tags_for_node(node.type,
> node.fields)`. Expected: **1,322 exact matches, 16 nodes where BOTH sides produce nothing**, and
> **zero** cases where one side produces a token and the other does not.

**[REA] That falsifier is the reason to pick `domain` over `📅`.** It is computable today from
`state.db` and the config, in about twenty lines, with no browser involved — so the slice can be
proved wrong before a single line of TypeScript is written. Anything cheaper to falsify than to
build is the right first rung.

### 7.3 Why not the date first

Because the date slice cannot be the same shape. It needs, additionally: a strict ISO parser that
is deliberately narrower than the engine's; a real-calendar check; a refusal path; a `dropped`
record explaining that the browser does not accept `20260828` even though the engine does; and a
decision about whether the browser may write a date at all. That is a full day on top, and it
proves nothing that `domain` does not prove about the **shape** of the mapping. **Do it second, on
purpose, with §6.4 written down first.**

---

## 8. Q7 — what a vocabulary mapping's `dropped` record must contain

The precedent is strong and it is this repo's own. **[OBS]** `presentation.json` already carries
`resolution.dropped` (95 rows), `qualification.dropped` (214) and `qualification.refused` (116),
each a `what → why` sentence, and `app/present/qualification.ts:144-146` states they are *"Not read
to decide anything"* — a ledger, not control flow. **[OBS]** 74 of the 95 resolution rows already
use exactly the sentence this mapping needs: *"no vocabulary tag spells stage=\"scoped\", so it
cannot be written into a line the operator types (the engine prints no tag for it either)."*

**His standard is three outcomes: picks it up, refuses visibly, or silently ignores. The third is
the only failure.** To keep that promise a vocabulary mapping's `dropped` must carry **six** kinds
of row, and five of them are generatable today:

| # | kind | example sentence | generatable now? |
|---|---|---|---|
| 1 | **A declaration shape the generator does not handle** | *"`#every-{n}{unit}` declares `parametric_field`, a token TEMPLATE this generator does not compile, so no line carrying `#every-2w` is understood."* | **yes** |
| 2 | **A field value the schema allows and no token spells** | *"`domain=dojo` is in the schema enum and no vocabulary token spells it, so 16 nodes carry a domain no line can express — the engine prints no tag for it either."* | **yes** — schema enum minus render index |
| 3 | **A node type no token spells** | *"no vocabulary tag spells the node type `ticket`, so none is seeded, and 239 nodes print no type tag."* | **yes** — the sentence already exists at `generate-resolution-declaration.mjs:859` |
| 4 | **A value FORMAT the browser refuses although the engine accepts it** | *"`📅` declares `trailing_date`; this reader accepts only `YYYY-MM-DD`. The engine additionally accepts `20260828` and `2026-W35-1`, so a line using either is held, not interpreted."* | **yes — and it is the row that does not exist yet** |
| 5 | **A render-only token, never ingested** | *"`🎯` spells `par` but is `render_only: true` — the engine never reads a value back from it."* | **yes** — already in `resolution.dropped` for `☑️` and `🎯` |
| 6 | **A token that is a field mapping but not a vocabulary entry** | *"`#summary` sets the `summary` field through `structural_tokens.yaml`'s `field_bindings`, not through a vocabulary entry; this reader does not consult that declaration."* | **yes**, once §2.4 is known |

**[REA] Row 4 is the one that carries the promise, and it is a NEW kind.** Every existing dropped
row says *"config declared nothing here."* Row 4 says *"config declared something and I chose not to
honour all of it."* That is a harder admission and a more useful one, because it is the only row
that would catch a silent Python/JavaScript format divergence — the exact class this project keeps
catching late.

**A seventh row would be needed if applicability (§2.3) is ever mirrored:** *"`#God` spells
`god_box`, which `schema.yaml` declares on `task` only; on any other node type this token is
accepted by the vocabulary and rejected by the schema."*

---

## 9. The ranked order

| # | rung | size | why here |
|---|---|---|---|
| 1 | **`domain`, both ways, with `dropped`** | **½ day** | §7.2. Falsifiable against the real graph before any code. Proves the shape. Adds the direction the browser entirely lacks |
| 2 | **The other 83 literal-value entries + the 28 node types + 6 edge types** | **½ day** | §0. Pure lookup, no parser, same reader. Takes served mappings from 46 to **118 of 134**, and ~9 KB on a 139 KB declaration |
| 3 | **The applicability matrix (198 pairs, from `schema.yaml`)** | **½ day** | §2.3. Turns *"this token means X"* into *"this token means X **here**"*, which is the half of his sentence nothing serves |
| 4 | **The date family — `📅` `🛫` `✅` `🆕`, strict ISO, refuse-and-record** | **1 day** | §7.3. The example he gave. Needs §6.4 written down first |
| 5 | **`#summary` / `#link` — the second resolver's field bindings** | **h** | §2.4. 372 vault occurrences, 2 rows of data, currently invisible |
| 6 | **`🔢 queue_position` — the one non-render-only int** | **h** | Rides rung 4's machinery |
| 7 | **A gate: emit ⊆ accept, compared through `resolve()`, over all 134** | **½ day** | §6.1. Generalises the existing checkbox scenario past the false positive that a literal-set comparison produces |
| 8 | **The four parametric grammars** | **1 day** | §4.3. 38 vault occurrences against 6,036. Most engine-shaped code, least traffic |
| 9 | **Retire `_MARKER_FIELD_BY_EMOJI`** (`render_context_parse.py:46-52`) | **?** | §3.3. Engine-side, monorepo, not this repo. Named so it is not lost |

**[REA] Rungs 1–3 together are 1½ days and they answer his question for 118 of 134 entries with no
parser anywhere in the browser.** That is the case for doing them as one arc and treating the date
as a separate, deliberate decision.

---

## 10. What I refuted, and what I could not measure

**Refuted, or sharpened past what was stated:**

* **"Almost nothing reads it" — right, but 46 mappings are served, not zero**, and the served set is
  precisely `node_type` (28), `domain` (12), `status` (6), ingest-only, at
  `app/present/membership.ts:69`.
* **The seed-defaults exception is not the only one.** `resolution.orderingFields` serves 3 markers
  with a value-SHAPE (`app/present/resolutiontable.ts:118-125`), and `app/present/ordering.ts:182-190`
  genuinely extracts a value with it. Narrow, real, and unnamed in the brief.
* **"Two declarations that could drift" is not the risk here.** It is one declaration read twice
  (§3.1). The drift risk is real but lives in three named places, not in the vocabulary layer.
* **The value-format problem is 5 tokens, not a format system.** 127 of 134 entries are a lookup
  table. The framing that starts from the date overstates the cost by roughly an order of magnitude.
* **Case-insensitivity is not a risk** — there is none to mirror (§6.2).
* **`#summary` is a field-mapping token and is not in the 134.** 368 vault occurrences, the largest
  unrecognised token by a wide margin.
* **A literal-set `emit ⊆ accept` comparator false-positives on parametric tokens** (§6.1) —
  measured, three false violations.

**Could not measure, and the honest limits:**

* **I did not run a cycle, and this document's conclusions do not need one.** The round-trip census
  ran the engine's own `source_tags_for_node` / `source_markers_for_node` / `resolve` against a
  read-only copy of the graph. That is the same code the cycle calls, but it is not the cycle.
* **I did not build the browser reader, so the 9 KB payload figure for rung 2 is arithmetic on the
  measured 12,838-byte vocabulary slice [REPO]** (`research-the-resolution-universe.md` §6.1) **and
  not a built artefact.** The 59 KB whole-table figure it sits inside was built and measured there.
* **`#every-15th` and the calendar parametric render-back could not be fixed here** — I confirmed
  `cadence='15th'` renders `None`, which agrees with `parametric_tags.yaml:285`'s own named residual.
  Whether that is a defect or a deliberate deferral is an engine-side call, in the monorepo, and this
  branch touches nothing there.
* **I could not measure how often the `20260828` / `2026-W35-1` forms would be typed**, because they
  appear zero times in the current vault. Zero observed is not zero possible, and the refusal path in
  §6.4 exists because of that gap, not despite it.

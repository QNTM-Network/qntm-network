# Design: the vim cursor — a column, a range, and an indent

**Status: design only. No application source is modified on this branch. This document is the only
file it adds.**

Three capabilities the operator named on 2026-07-31, in his own words:

> "also word jump to insert into a word placing for edits essential. and V for highlight. and being
> able to indent from normal using tab and shift tab. all essentials"

Read as **(1)** jump by word and drop into INSERT at that point inside the line, **(2)** `V` — a
highlighted range of lines, **(3)** `Tab` / `Shift-Tab` indent and outdent from NORMAL.

The brief that commissioned this document claims all three break the assumption `FocusSurface` is
built on — that the cursor is one number. **Two of the three do not, and the third breaks a
different assumption than the one named.** That is the result.

Evidence labels follow `design-presentation-cascade.md` and `design-the-edit-is-a-safe-haven.md`:

* **[OBS]** — I ran it or read it in this worktree (or read-only in `~/qntm`) and am reporting the
  output.
* **[REA]** — reasoned from something labelled [OBS]. Stated as reasoning, never as measurement.
* **[REPO]** — quoted from a record in this repo or the engine repo that I did not independently
  reproduce.

Sizes are the house scale: **under an hour** / **half a day** / **an arc**.

---

## 0. Lead — the five things established before any design

**0.1 The painter never places a caret, and this is proven positively rather than by a grep.**
**[OBS]** I wrapped every element `paint()` creates in a `Proxy` that records every property read
or written, painted a three-line view, and fired the click that opens an `<input>`. The complete
property surface the painter touches on an `input` element is:

```
addEventListener, checked, className, focus, type, value
```

(plus `children`, `focused`, `tagName`, `dispatch`, which are the test stub's own bookkeeping). The
caret-shaped subset — anything matching `select|caret|cursor|range` — is **empty**. So the caret's
resting position inside a freshly opened line is whatever the browser does after `value =` then
`focus()` (`app/present/paint.ts:227`, `:579-582`), and the app has never expressed an opinion
about it.

**0.2 `applyEdit` is already a splice, not a replace-at-index.** **[OBS]**
`app/present/source.ts:151` is `lines.splice(edit.lineIndex, 0, edit.text)`. The `insert-line` kind
(shipped 2026-07-31) changes the file's line COUNT and shifts the index of every line below it. The
guarantee named in the brief — "exactly one line replaced" — describes two of the three kinds and
has not described the third since the day it landed.

**0.3 Removing a line from a view deletes the NODE.** **[OBS]** The engine synthesises an
identity-free deletion candidate for every cache row whose line is no longer present
(`apps/qntm-md/src/qntm_md/coordination/orchestrator.py:3506-3648`), the applier resolves its
identity by render-match and dispatches `delete_node`
(`apps/qntm-md/src/qntm_md/io/applier.py:913-1010`), and the gate that enables it is **on** in the
shipped instance config — `apps/qntm-md/config/vocabulary/deletion_gestures.yaml:19` registers
`line_removed` as a `deletion_intent` kind. One match deletes; two or more raise needs-attention;
zero is a silent no-op.

**0.4 Indent is a raw leading-space count, and any increase reparents.** **[OBS]** The differ's
structural walk is `depth = len(normalised) - len(normalised.lstrip())` with a pop condition of
`stack[-1][0] >= depth` (`apps/qntm-md/src/qntm_md/diff/content_diff.py:721-722`, tabs normalised
at `:686` via `expandtabs(4)`). There is no "level" arithmetic anywhere in it: **one extra space is
enough to make a line a child of the line above it.** The applier then creates or detaches the
`PART_OF` structural edge (`apps/qntm-md/src/qntm_md/io/applier.py:2738-2812`, with the un-indent
detach path at `:2748-2767`).

**0.5 The engine's indent unit is four spaces and the app's painter believes it is two.** **[OBS]**
`apps/qntm-md/src/qntm_md/render/renderer.py:947-950` emits `'    ' * depth`. The operator's own
rendered view agrees — `~/qntm/this_week.md` lines 3-8, read-only: depth 0 at 0 spaces, depth 1 at
4, depth 2 at 8. The app's one piece of indent arithmetic is
`(shape.indent.length / 2) * 1.2 + "rem"` (`app/present/paint.ts:650`), transcribed verbatim from
`app.html:246`. It treats two spaces as one level.

**0.6 Baseline.** **[OBS]** `npm run check` on this worktree at `62e1ea9`: typecheck clean, build
clean, **393 tests, 0 fail**. Nothing on this branch can change that number; it is here so the next
person knows what green looked like.

---

## 1. Q1 — does the cursor stop being one number?

> **[AMENDED 2026-07-31, AFTER THE OPERATOR USED IT — THIS SECTION'S HEADLINE ANSWER IS WRONG.]**
>
> This section concluded "the cursor stays one number — mostly false", and §1.4's table below said a
> column's lifetime is **one paint** and that it **"must not survive a repaint"**. **The cursor is
> now a LINE AND A COLUMN, and the column survives every repaint and every projection.**
>
> The argument was not careless — it was conditional on §2.2, which is also amended, and §2.2's
> condition failed. §2.2 argued `w`/`b`/`e` need not be repeatable NORMAL-mode motions because the
> platform's own `Option+←/→` would do the repeating once the caret was inside the `<input>`. On
> that reading a column IS written once at the NORMAL→INSERT transition and thrown away, and
> everything §1.2 and §1.4 say follows correctly. **The operator is a vim user and in vim `w`
> repeats**, so his second `w` was a literal `w` typed into the box: *"right now word jump also does
> insert. so i can't jump through it just does first jump then wwww typed"*. **A motion that repeats
> is a position that persists.**
>
> WHAT IS STILL RIGHT HERE, AND IT IS MOST OF THE SECTION. §1.3 (`V`'s anchor belongs on
> `ModeSurface`, not on `FocusSurface`) is untouched and was not built. §1.5 — that the cursor's
> real problem was a positional index against a string the cycle rewrites — held, was built, and is
> what MADE the column safe: `reanchor` re-takes `anchor.text` against the arriving projection, so
> the column is CLAMPED into the line's current characters rather than guessed. §1.4's distinction
> between a column and a range as two different extensions also holds; only the column's row is
> wrong. The corrected row:
>
> |  | column (as shipped) |
> |---|---|
> | lifetime | the whole time the cursor is on the line |
> | written by | `w`/`b`/`e`/`0`/`$`; reset to 0 by any line move |
> | read by | the painter (the block cursor), and `i`/`a` |
> | owner | `FocusSurface`, beside the line index it is an offset into |
> | survives a repaint? | **must** — and a projection too, clamped |
>
> Shipped in `app/present/focus.ts`, `motions.ts`, `word.ts`, `paint.ts`. See
> `vim-normal-mode-is-a-gesture-not-a-resolution` (slice 5) in `docs/architecture/capabilities.yaml`.

**The premise is half right, and the half that is right is right for a reason nobody asked about.**

### 1.1 What the cursor is today

**[OBS]** `FocusSurface` holds exactly one private field, `#lineIndex: number | null`
(`app/present/focus.ts:50`). It exposes `lineIndex`, `isFocused`, `focus`, `blur`, and
`contextFor`, and `contextFor` is the only reader that turns the number into anything — a FOCUS-level
`Contribution` of `raw` on every resolution key (`:45-47`, `:77-79`). `ModeSurface` holds three
fields, none of them positional: a `Mode`, a count string, and a pending-`g` flag
(`app/present/motions.ts:95-97`). `DraftSurface` holds an index and a seed string
(`app/present/draft.ts:56`). There is no column anywhere in the presentation bundle.

### 1.2 Word motion does not need the cursor to grow — see §2

Deferred to Q2, because the answer there decides this one. Short form: a column is needed for
**one instant**, at the NORMAL→INSERT transition, and a value that is written once, consumed by the
next paint and thrown away is not cursor state. It is a paint parameter.

### 1.3 `V` does need a second number, and it is an anchor, not a column

**[REA]** A visual-line selection is an interval. The HEAD of that interval is already
`focus.lineIndex` — vim's `V` then `j` moves the head and leaves the anchor. So the extension is
exactly **one more number-or-null**: the anchor. The range is
`[min(anchor, head), max(anchor, head)]`.

**Where the anchor must NOT live: `FocusSurface`.** [REA] `contextFor` contributes `raw` on every
key for the line under the cursor (`focus.ts:45-47`), and the painter embodies `raw` as an
`<input>` whenever a focus surface exists (`paint.ts:566-583`). If the anchor lived on
`FocusSurface` and `isFocused` widened to "inside the range", a five-line visual selection would
paint five `<input>` elements, four of which nothing can put a caret in, and the painter would call
`.focus()` on each in turn. The FOCUS rung means "the line under the cursor shows its characters",
and a highlighted range is not that.

**Where it belongs: `ModeSurface`, next to the mode that gives it meaning.** [REA] An anchor
without VISUAL is meaningless, and the two change together — `V` sets both, `Escape` clears both,
`d`/`>` consume both. `Mode` widens from `"NORMAL" | "INSERT"` to
`"NORMAL" | "INSERT" | "VISUAL"` (`motions.ts:58`), and the surface gains `#anchor: number | null`
that is non-null exactly when the mode is `VISUAL`. `FocusSurface` stays literally one
number-or-null, which is the claim the brief set out to test.

The painter's existing `selected` boolean (`paint.ts:638`) becomes a range test. That is a change
to a file the sibling owns; it is described in §5.4 and not made here.

### 1.4 So: a column and a range are two different extensions

|  | column | range |
|---|---|---|
| lifetime | one paint | the whole gesture |
| written by | the motion that enters INSERT | `V`, then every head motion |
| read by | the painter, once, then cleared | the painter (mark) and the operator (`d`, `>`) |
| owner | a caret seed on `ModeSurface`, or a new one-field surface | `ModeSurface`, beside `Mode` |
| survives a repaint? | must not | must |

They are not the same extension and should not be built as one.

### 1.5 The refutation that matters — the cursor is already scheduled to stop being a line index

**[REPO]** The backlog already carries `the-cursor-anchors-to-a-node-not-a-line-number`, state
`diagnose-ready`, half a day:

> `FocusSurface` holds one number (app/present/focus.ts:50) and the painter restores the cursor by
> asking `isFocused(lineIndex)` while walking whatever source it is currently given … repaint a body
> from a projection with one line inserted above the cursor and the cursor lands on `## Today` with
> the typing gone.

The cursor's real problem is not that it lacks a column. It is that a **positional index is
meaningless against a string that the cycle rewrites every ten seconds**, and the fix already
designed for it is identity — the `[[qntm:N]]` stamp the engine already prints into every node line
(observed in `~/qntm/this_week.md:3-8`).

**[REA] This ordering fact is the most useful thing in section 1.** A visual range is N positional
indices where the cursor is one. Every failure mode that row measured — the cursor landing on the
wrong line after a foreign repaint, the cursor pointing past the end of a shorter projection — a
range has N times over, and it acquires a new one the single cursor does not have: a range whose
two ends drift by different amounts silently selects a different set of lines than the one the
operator highlighted, and the operator's next keystroke operates on it. **`V` built on line indices
before the anchor row lands is a known defect multiplied.**

---

## 2. Q2 — where does a column live, given that a focused line is an `<input>`?

**It is the cheap one. I would rather be wrong here than right, and I am not wrong: this is a
seeding problem, not a cursor-model problem.** But the cheapness is in a different place than the
brief expected, and there is a real cost sitting next to it that has nothing to do with the caret.

### 2.1 The cheap part, priced exactly

**[OBS]** The whole of "open the line with the caret at offset N" is:

1. a value that survives the repaint the keystroke causes — one field, on a page-level surface,
   exactly as `focus`, `draftLine` and `mode` already are (`app/index.html:959`, `:967`, `:974`);
2. one optional parameter threaded into `rawInput` (`app/present/paint.ts:214-222`);
3. one call after the existing `.focus?.()` at `app/present/paint.ts:581` —
   `input.setSelectionRange?.(n, n)` — and one clear so the seed is consumed once.

**[OBS]** The test stub has no `setSelectionRange` (`tests/fixtures/dom-stub.mjs:24-90`), so the
call must be optional or every painter test throws. That is a one-line change to a file the sibling
owns, named in §5.4.

**[REA] Size: under an hour** for the plumbing. `motions.ts:199-206` records that this was judged
"not cheap" when `a` was skipped, and the reasoning given there is sound as far as it goes —
`raw()`'s autofocus has no such parameter, and adding one touches a function that also serves plain
click-to-edit. What that note did not price is that the parameter is **optional and defaults to
today's behaviour**, so click-to-edit is unchanged by construction, and the surface it threads
through is the same one three other page-level surfaces already thread through. It is not a new
shape in this codebase. It is the fourth instance of an existing one.

### 2.2 Once the caret is in the line, further word motion is free

> **[REFUTED 2026-07-31, BY USE. This subsection is the reason `w` shipped broken.]**
>
> The claim below is that `w`/`b`/`e` "do not have to be repeatable NORMAL-mode motions" because
> `{count}w` into INSERT plus the platform's `Option+←/→` satisfies the request. **It does not.** The
> operator pressed `w` a second time and typed a `w` into his own line.
>
> **The mechanical half of the reasoning is sound and the mechanical half is not the claim.** The
> platform's word motion IS free inside an `<input>`, the global handler DOES refuse every key while
> `typingIn(e.target)`, and the input's own listener DOES handle only Enter and Escape. All three
> were verified again while fixing this. What was wrong is the step from "the platform can move a
> caret" to "so the app need not repeat a motion": a vim user's fingers do not switch to
> `Option+←/→` in the middle of a NORMAL-mode gesture, and the cost of being wrong was not a missing
> convenience — it was **characters typed into his source**.
>
> **AND THERE WAS A SECOND, LARGER ERROR STANDING BESIDE IT, WHICH §2.3 CAME WITHIN ONE SENTENCE OF
> CATCHING.** §2.3 records, correctly and as [OBS], that in NORMAL `focusLive` is false so the
> selected line "renders WIRED", and treats that as the fixed ground the word grammar has to work
> around. It was not ground — it was a defect. The operator's founding rule for this surface
> (`design-presentation-cascade.md`, and `app/present/focus.ts`'s own header) is "cursor on the line
> → the line renders as its exact source text", and **in NORMAL the cursor IS on the line**. The
> gate `focus !== undefined && (mode === undefined || mode.mode === "INSERT")` NARROWED an
> expression that was already right — before vim existed it was simply `focus !== undefined` — and
> it is what made repeating impossible in the first place: **with the line rendered as a widget
> there are no characters on screen for a column to move through.**
>
> The gate is gone. The selected line renders raw in NORMAL as well as INSERT, and the two modes are
> two EMBODIMENTS of that one raw rendition — a `<div>` carrying a block cursor, or an `<input>`
> carrying a text caret. §2.3's word grammar survives this completely intact and is what makes the
> column land on words rather than inside stamps; only its opening premise about what NORMAL shows
> is amended.
>
> **THE EMBODIMENT QUESTION §2.1 NEVER ASKED, ANSWERED HERE.** How do you show a character-level
> cursor on a line that is not an `<input>`? The cheap answer is to keep the `<input>` and set
> `readOnly` — native caret for free, `readOnly` blocks typing, `i` is one property flip on the same
> element. **Refuted before it was built.** The CSS Working Group's July 2025 thread on
> standardising readonly input styles enumerates the current divergence: WebKit "doesn't render a
> text caret and no focus outline ring is rendered", Firefox "no text caret is rendered", Chromium
> "renders a text caret (but it doesn't blink)". **Two of three engines paint nothing**, so on the
> operator's own platform the cursor would have been invisible — the same symptom as the defect,
> with a harder cause to find. `caret-color` cannot rescue it; it colours a caret an engine paints.
> It would also have required widening `typingIn`, the one guard standing between a global letter
> binding and every text field in the app, since a focused readonly input is `e.target` for every
> subsequent keystroke and would have swallowed `j`, `k` and `w` entirely. **This is web evidence,
> not a measurement — no browser was run.** What shipped is a terminal's own answer: three spans,
> the middle one carrying a block. It paints in every engine, it needs no change to `typingIn`, and
> it makes the mode legible from the cursor itself.

**[REA]** An `<input type="text">` is a real text control with the platform's own word motion:
`Option+←`/`Option+→` on macOS, `Ctrl+←`/`Ctrl+→` elsewhere, plus `Cmd+←`/`Cmd+→` for line ends.
None of that is code this app writes, and none of it is intercepted — the global keydown handler
refuses every key while `typingIn(e.target)` is true (`app/index.html:1573-1576`, `:1585`), and the
input's own listener handles only `Enter` and `Escape` (`app/present/paint.ts:296-316`).

**[REA] So the feature the operator asked for decomposes into: get in at roughly the right word,
then use the platform.** `w`/`b`/`e` do not have to be repeatable NORMAL-mode motions to satisfy
the request. `{count}w` → INSERT at the start of the count-th word is enough, and the count prefix
already exists and already works (`motions.ts:163-172`).

### 2.3 The real cost, which is not the caret — NORMAL and INSERT show different characters

**[OBS]** In NORMAL the selected line resolves through the cascade like any other line: `focusLive`
is false, so no FOCUS contribution is made (`app/present/paint.ts:633-634`). It renders WIRED — a
`<label>` with a checkbox and rendered inline markdown. In INSERT the same line becomes an
`<input>` holding its **exact source characters** (`:227`).

**[OBS]** Those two are not the same text. The operator's real line, from `~/qntm/this_week.md:8`
(read-only):

```
        - [ ] Pay aug [[qntm:1234]] #task #personal 📅 2026-08-28 🛫 2026-07-28 🆕 2026-06-28
```

Eight spaces of indent, a bullet, a checkbox glyph, then a two-word title, then an identity stamp,
two tags and three date cells. In WIRED rendition the leading chrome is a checkbox widget and the
indent is a CSS margin; in RAW it is fifteen characters the operator has to count past.

**[REA] So "the third word" counted while looking at NORMAL is not the third word of the source
string.** A word grammar that counts naively over `line` sends `3w` into `[[qntm:1234]]`. A word
jump that lands the caret inside an identity stamp is worse than no word jump: `Enter` there does
not split (`paint.ts:300-311`), but a typed character does corrupt the stamp, and the engine's own
recorded failure for an unrecognised stamp is that its content is absorbed into the node's title,
exit 0, no diagnostic (`app/present/paint.ts:40-43` citing the engine).

**The fix is a word grammar that counts over the TITLE, using grammar this repo already owns.**
[REA] `resolution.ts` already has `BULLET` (`:188`), the engine-faithful `CHECKBOX_GLYPH` (`:204`),
and `tagSpans` with offsets (`:334-372`). What is missing is the `[[qntm:N]]` span, whose engine
grammar is `apps/qntm-md/src/qntm_md/io/parser/parse_qntm_id.py` and which would be mirrored the
same way `TAG` was — one regex, cited, tested against the engine's own. With those, "word k" means
"word k of the title", chrome and stamps and tags are atoms the cursor skips over rather than lands
in, and what the operator counts on screen is what he gets.

**[REA] Size: half a day** for the grammar and its tests, on top of the under-an-hour plumbing.
**Total: half a day.**

### 2.4 A thing the operator will notice on the first keystroke

**[REA, UNVERIFIED — see §8.1]** Because the app never sets a caret (§0.1), the caret's position
after `value =` then `focus()` is the browser default, and my reading of the HTML specification is
that setting `value` on a text control moves the text entry cursor to the **end** of the text. If
that is right, then `i` in this app already behaves like vim's `A`, and the `a` binding the sibling
is implementing is a no-op against current behaviour unless it also lands the caret-seed plumbing.
**This is worth resolving before the sibling ships `a`** — one line in a real browser settles it.

---

## 3. Q3 — what does `V` buy, and what does it cost?

**`V` does not force the multi-line write path open. Its OPERATORS decide that, they split cleanly
into two classes, and the class the operator actually asked for is already expressible today with
no change to `applyEdit` at all.**

### 3.1 The two classes of range operator

**[REA]** Every operator that could sit behind `V` is one of:

**CLASS A — distributive.** The same single-line edit applied to each line of the range. `>` and
`<` (indent/outdent a range), a multi-line done-toggle, a multi-line tag add. Two properties make
this class safe, and both are properties of `applyEdit` as it stands:

* `set-line` and `set-checkbox` **do not change the line count** (`app/present/source.ts:160-171`,
  `:197-203`), so every index in the range stays valid while the fold runs;
* `applyEdit` takes the whole source and returns the whole source
  (`app/present/source.ts:135-136`), so N edits fold left —
  `edits.reduce((s, e) => applyEdit(s, e) ?? s, source)` — and the result is one string to POST
  through the one callback that already exists (`paint.ts:149`, `app/index.html:1210`).

**Nothing is added to the closed union. No new write path. No new endpoint.** The only genuinely
new decision is the refusal rule: if one line in the range refuses, is the whole gesture refused or
does it apply to the rest? [REA] All-or-nothing, for the reason `renderTags` gives for its own
all-or-nothing fallback (`paint.ts:465-484`) — a partially applied range is the worst of both, and
the operator cannot see which half landed.

**CLASS B — structural.** `d` (delete the range), `J` (join), `p` (paste). These change the line
count, and they carry graph meaning that has nothing to do with text.

### 3.2 What Class B actually costs, priced honestly

**The write path is the cheap half.** [REA] A fourth kind — `{kind: "replace-span", start, end,
lines}` — is one `lines.splice(start, end - start, ...lines)` in the function that already splices
(§0.2). The guarantee widens from "exactly one line replaced" to "exactly one contiguous span
replaced, every line outside it byte for byte", which is the same sentence with a different
quantifier and is just as provable. Half a day including its refusals. **The brief asks whether
that widening loses what the guarantee protects: it does not.** What the guarantee protects is that
the whole-file POST is the server's file with a described change and nothing else, and a span
splice describes its change exactly as well as a line replace does. `insert-line` already made this
trade once and the union stayed closed.

**The meaning is the expensive half, and it is not a widening — it is a different act.**

* **[OBS]** `V` + `d` over five rendered node lines is **five node deletions from the graph**, not
  five lines removed from a file (§0.3). They do not come back on the next cycle; they are gone
  from every view that qualified them. The app has no undo.
* **[REPO]** The repo's own note on this is optimistic and should be corrected when someone touches
  it: `tests/present-newline.test.mjs:471-475` says a deleted line's node "simply comes back"
  because the engine rewrites every view from the graph. That is the **zero-match** branch of the
  identity resolver (`applier.py:996-1000`). A stamped line in a rendered view is the **one-match**
  branch, and the one-match branch deletes.
* **[OBS]** A whole-line MOVE is safe, and this is the interesting asymmetry: the differ absorbs
  delete-here-plus-add-there as `LATERAL_MOVED` via the `[[qntm:N]]` back-pointer, and the moved-FROM
  cache row lands in the matched set (`orchestrator.py:3546-3556`). So `V` + move and `dd` + `p`
  are **not** deletions provided the lines carry their stamps and land in the same cycle. The
  operator has `editor:swap-line-up` and `editor:swap-line-down` on his Obsidian mobile toolbar
  (`~/qntm/.obsidian/app.json`, read-only), so this is a gesture he uses.
* **[REA]** `J` (join) merges two node lines into one. Whichever stamp survives keeps its node and
  the other is a line removal — a delete. It is the same graph decision `paint.ts:300-311` already
  refused to make for Enter-splits, arriving from the other direction.

### 3.3 So what does `V` buy him?

**[REA]** With Class A only, `V` buys **one gesture applied to N lines** — and the gesture he named
in the same sentence is `Tab`/`Shift-Tab`. `V` and capability (3) are not two features; **`V` is
what makes `Tab` worth binding.** Indenting one line is a keystroke he already has in Obsidian;
indenting a block of six under a new parent is the thing that is tedious without a range.

The one Class-B-shaped operator worth having early is **`y` (yank)**, which writes nothing at all —
it puts the range's source lines on the clipboard. Zero source edits, zero graph meaning, and it
gives the highlight an immediate use while the destructive operators stay unbuilt.

**[REA] `d` should not ship with `V`.** Not because it is unwritable — it is writable — but because
it is N irreversible graph deletions behind a two-key gesture in an app with no undo, and the
operator lost seven node identities to exactly this class of event on 2026-07-31.

### 3.4 One embodiment detail the painter will hit

**[OBS]** A blank line is dropped from the paint entirely and gets no row
(`app/present/paint.ts:612-616`). So a visual range from index 3 to index 7 where index 5 is blank
paints a mark on four rows, not five — and any operator that walks the index range still touches
index 5. [REA] The range should be defined over **painted** rows, which means the painter's own
`lastPaintedIndex` bookkeeping (`:604`, `:622`) is the right authority, or the mark and the effect
disagree in a way the operator can see only after the fact. The sibling is already adding a
blank-line selection mark; the two decisions should be made together.

---

## 4. Q4 — is `Tab`/`Shift-Tab` cheap or expensive?

**Cheap to write, expensive to mean, and it has two concrete defects waiting for it that are
nothing to do with either.**

### 4.1 The source edit is trivial

**[REA]** Indent is `set-line` with the leading whitespace changed. One line, one kind that already
exists, no union change, index-stable, distributive over a range (§3.1). **Under an hour** for the
edit itself.

### 4.2 The meaning is a reparent, and the engine will do it silently

**[OBS]** §0.4. `Tab` on a line whose predecessor sits at lower depth makes that line a **child** of
it: the applier creates the `PART_OF` structural edge (`applier.py:2800-2812`). `Shift-Tab` to
column zero **detaches** the existing parent edge (`:2748-2767`) — and that path exists because
without it the edge was never torn down and "the next render snapped the indent back", which the
engine's own comment records as the operator-visible symptom.

**[REA] This is a graph edit dressed as a formatting keystroke, and it deserves to be said in the
UI rather than only in a design document.** It is also, unlike `d`, **reversible by the inverse
keystroke** — `Shift-Tab` restores the previous parent if pressed before the operator forgets, and
the edge machinery is idempotent. That is what makes it acceptable where `d` is not.

### 4.3 Defect one — the app would insert the wrong number of spaces

**[OBS]** §0.5. The engine's unit is four spaces; the app's only indent arithmetic divides by two
(`app/present/paint.ts:650`). [REA] An implementation that reuses that arithmetic inserts two
spaces. Two spaces **does** reparent (§0.4 — any increase does), so the gesture appears to work;
then the cycle re-renders the line at four spaces and the indent visibly doubles under the
operator's hands. **The unit must be four spaces, taken from the engine, not two taken from the
painter's margin arithmetic.** [REA] Better still, take it from the view's own source the way
`chromeOf`/`seedFor` already take a new line's shape from what the engine printed
(`app/present/resolution.ts:280-293`, `app/present/newline.ts`) — the indent unit is observable in
any view that has a nested line, and reading it is the same "read the cascade's answer rather than
re-derive it" move that module already makes.

### 4.4 Defect two — `Tab`'s browser default, and the guards were not written for it

**[OBS]** The global keydown handler only calls `preventDefault()` when `mode.handleKey` reports the
key handled (`app/index.html:1590-1592`). `Tab` is unbound today, so it falls through and the
browser moves focus — which is correct, and is currently the only way a keyboard user leaves the
reading column. Binding `Tab` in NORMAL takes that away for as long as a view is selected. The
drawer's own `Tab` trap (`app/index.html:1117-1121`) is precedent for trapping `Tab`, but the
drawer is **modal** and the reading column is not.

**[OBS]** `Tab` while in INSERT is worse today than unbound: `typingIn(e.target)` is true so the
global handler skips (`:1585`), the input's listener handles only `Enter` and `Escape`
(`paint.ts:296-316`), so the browser moves focus out of the input, which fires `blur`, which
settles and commits the line (`paint.ts:295`). **`Tab` in INSERT is an accidental commit plus a
focus jump to somewhere in the shell.** That is true on `main` right now and is not caused by
anything proposed here.

**[OBS]** `ModeSurface.handleKey(key, current, lastIndex)` takes no modifier
(`app/present/motions.ts:144`), so `Tab` and `Shift-Tab` are the same `key` value and are
indistinguishable to the reducer as it stands. Either the signature grows a modifier argument, or
the binding is `>`/`<` — vim's own indent keys, which carry no browser default at all and need no
signature change.

**[REA] Recommendation: bind `>` and `<` first and treat `Tab`/`Shift-Tab` as an alias added
afterwards, deliberately, with the focus-escape question answered.** He asked for `Tab` because
that is what Obsidian binds; `>`/`<` is what vim binds, and he runs `vimMode: true`. The alias is
five minutes once the escape hatch is decided.

### 4.5 The evidence that this one is real

**[OBS]** `~/qntm/.obsidian/app.json`, read-only: `smartIndentList` is `true`, and his hand-picked
`mobileToolbarCommands` list contains `editor:indent-list` and `editor:unindent-list` — he put
indent and outdent on a toolbar he curated by hand, alongside `editor:swap-line-up` and
`editor:swap-line-down`. **[REPO]** `research-polish-direction.md` §5 has the rest of the profile:
`vimMode: true`, a relative-line-numbers plugin, four of seven hand-bound hotkeys are navigation.

---

## 5. The recommended shape

### 5.1 `FocusSurface` does not change

One number-or-null, one contribution, one meaning. Everything below is built beside it.

### 5.2 `ModeSurface` gains a mode, an anchor, and a caret seed

```ts
type Mode = "NORMAL" | "INSERT" | "VISUAL";
```

* `#anchor: number | null` — non-null exactly when the mode is `VISUAL`. `V` sets it to the current
  head; `Escape` clears it; an operator consumes it and clears it. `selection(head)` returns the
  inclusive index interval or `null`.
* `#caretSeed: number | null` — write-once, read-once. `enterInsert(column?)` sets it;
  `takeCaretSeed()` returns and clears it. **It must be cleared by the read**, because a seed that
  outlives its paint is a caret that jumps on the next unrelated repaint.

Both stay pure. Neither produces a `Contribution`. The MODE rung of the cascade stays silent, which
is the finding the first slice paid for and which nothing here disturbs: a highlighted range is a
fact about which lines an operator will act on, and a caret offset is a fact about where typing
starts — neither is a `Rendition`.

### 5.3 A word grammar in `resolution.ts`, beside the grammars already there

`titleSpans(line)` returning ordered `{start, end}` offsets over the line's TITLE, with chrome
(indent, bullet, checkbox glyph), identity stamps and tags treated as atoms to be skipped. Built
from `BULLET` (`:188`), `CHECKBOX_GLYPH` (`:204`) and `tagSpans` (`:362`), plus one mirrored
`[[qntm:N]]` regex cited to `parse_qntm_id.py` and tested against it the way `TAG` already is
(`tests/present-tags.test.mjs`).

### 5.4 What the sibling's files would need — described, not done

`app/present/paint.ts` (sibling-owned):

1. after `input.focus?.()` at `:581`, one optional `setSelectionRange` call driven by the caret
   seed;
2. `rawInput` gains one optional caret parameter (`:214-222`);
3. `selected` at `:638` becomes a range test rather than an equality test;
4. the range is defined over **painted** rows (§3.4), which the loop already tracks at `:604`.

`app/present/motions.ts` (sibling-owned): the two fields in §5.2, and — only if `Tab` is bound
rather than `>` — a modifier argument on `handleKey` (`:144`).

`tests/fixtures/dom-stub.mjs` (sibling-owned): a no-op `setSelectionRange` recording its arguments,
so the caret can be asserted rather than assumed.

`app/index.html` (sibling-owned): nothing new in the keydown handler beyond the keys themselves —
the `typingIn` guard already does the right thing for all of it — **except** the `Tab` focus-escape
decision in §4.4, which is a real accessibility choice and not a wiring detail.

---

## 6. The ranked order, with sizes

| # | Thing | Size | Why here |
|---|---|---|---|
| **1** | **`>` / `<` indent and outdent on the selected line** | **half a day** | One `set-line`, no union change, index-stable, reversible by its own inverse. Carries the four-space correction (§4.3), which is a real defect fixed as a side effect. His own toolbar is the evidence. |
| **2** | **`{count}w` / `b` / `e` → INSERT at that word, with a title-aware word grammar** | **half a day** | The one he called out first. Under an hour of plumbing plus half a day of grammar; no cursor-model change; the platform supplies every subsequent word motion for free. Also settles §2.4 for the sibling's `a`. |
| **3** | **`the-cursor-anchors-to-a-node-not-a-line-number`** (already in the backlog) | **half a day** | Not one of the three, and it should be built before the fourth. A range of indices inherits every drift failure a single index has, N times (§1.5). |
| **4** | **`V` with `>` / `<` / `y` only** | **half a day** after 1 and 3 | The anchor is one field. The operators are the ones already built in row 1, folded left over the range. `y` writes nothing. |
| **5** | **`Tab` / `Shift-Tab` as aliases for `>` / `<`** | **under an hour** | Blocked only on the focus-escape decision (§4.4). |
| — | **`V` + `d`, `J`, `p`** | **an arc** | N irreversible node deletions with no undo (§3.2). The span kind is half a day; the graph decision behind it is not scheduled and should not be forced by a keystroke. |

**The smallest first step is `>` / `<` on the selected line.** It is one existing edit kind applied
to one existing selection, it needs nothing from `FocusSurface`, nothing from `ModeSurface` beyond a
key binding, and nothing from `applyEdit`. It delivers a third of what he asked for on its own,
it corrects a measured unit error while it is in there, and it is the piece that everything in
row 4 folds over. If it ships alone and he never gets `V`, he has still gained the keystroke he put
on his own toolbar.

---

## 7. What I refuted

**7.1 "The cursor stops being one number."** Mostly false. Word motion needs a column for one
instant and does not need it to be cursor state (§2.1). `Tab` needs nothing. Only `V` adds a
persistent number, it adds exactly one, and it adds it to `ModeSurface` rather than to
`FocusSurface`. `FocusSurface` ends this design exactly as it started: one number-or-null.

**7.2 "A column and a range are the same extension."** False. Different lifetimes, different
owners, different readers, opposite requirements about surviving a repaint (§1.4).

**7.3 "`V` forces the multi-line write path open."** False as stated. `V` forces nothing; its
operators do, and they split into a class that is already expressible with zero changes to
`applyEdit` and a class that is not (§3.1). The class the operator asked for — indent a block — is
the free one.

**7.4 "`applyEdit`'s guarantee is exactly one line replaced."** Already not true. `insert-line`
splices and shifts every index below it (§0.2). The guarantee that is actually held is "one
described change, whole file in, whole file out", and a contiguous span satisfies it. The
drag-to-reorder rejection in `research-polish-direction.md` §5 rests its case on the narrow
guarantee and was written 2026-07-30, one day before `insert-line` widened it. **The rejection may
still be right — reorder has graph meaning of its own — but its stated ground no longer holds, and
it should be re-argued rather than cited.**

**7.5 "`Tab` is nearly free because it is one line."** The edit is free; the meaning is a reparent
the engine performs silently (§4.2), the app would insert the wrong unit (§4.3), and `Tab` is
already an accidental commit in INSERT today (§4.4).

**7.6 A repo note that is optimistic.** `tests/present-newline.test.mjs:471-475` says a deleted
line's node "simply comes back". It comes back only on the resolver's zero-match branch; a stamped
line in a rendered view takes the one-match branch and the node is deleted (§3.2). The test's
conclusion — do not ship line deletion — is right. Its reason is the weaker one.

---

## 8. What remains unverified

**8.1 Where the caret rests today.** [UNVERIFIED] §0.1 proves the app does not place it; it does
not prove where the browser puts it. My reading of the HTML specification is "the end of the text",
which would make `i` behave as `A` today, but I could not retrieve the normative sentence and the
test stub cannot answer it. **Settled by one line in a real browser:**
`i.value = "abc"; document.body.append(i); i.focus(); i.selectionStart`. Nothing in §6 changes if
the answer is 0 rather than 3 — the seed is written either way — but the sibling's `a` binding does.

**8.2 Whether `setSelectionRange` survives the repaint order.** [UNVERIFIED] The painter appends
then focuses (`paint.ts:579-582`), and focus on a detached element is a no-op — the comment there
records that this order is load-bearing. Whether a selection set immediately after `.focus()`
survives the same tick in every browser the app targets is not something the stub can answer.
Settled by the same browser check.

**8.3 Whether the engine treats a two-space indent as a stable depth.** [UNVERIFIED] §0.4 shows any
increase reparents, and §0.5 shows the renderer prints four. What I did not do is run a cycle — and
must not — so the claim "the operator sees the indent jump after the cycle" is [REA] from those two
observations, not a measurement. Settled by a hermetic bundle in a throwaway vault with its own
database, never against `~/qntm`.

**8.4 Which lines a visual range should cover when the range spans a heading.** Not investigated. A
heading resets the engine's indent stack and its sibling tracking
(`content_diff.py:686-698`), so a `>` applied across a heading indents lines under two different
parents. Whether the range should refuse, split, or proceed is undecided and should be decided
before row 4, not during it.

**8.5 No browser, no server, no cycle.** Consistent with the record on `vim-normal-mode`: nothing in
this document was clicked in Chrome. Every [OBS] here is a file read, a static analysis, or a node
process running the shipped `dist/present.js` against the test stub.

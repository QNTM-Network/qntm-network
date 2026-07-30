# What good feels like — a polish direction for the app

**Date:** 2026-07-30 · **Base:** `origin/main` @ `708bff7` · **Scope:** research only. No application
source changed. This document is the only file the branch adds.

Every claim is labelled **OBSERVED** (a computed value I read out of a real browser, a byte I read
out of a real file or binary) or **REASONED** (a conclusion drawn from those, stated as such).
Nothing here is an opinion about what a page looks like.

**Written for the pass *after* the shell.** A sibling is building the menu bar and the right-hand
view drawer in `app/index.html` right now. Nothing below touches that work; §3 states the one
constraint the shell has to satisfy and otherwise leaves the frame to it.

**How the measurements were taken.** The repo was served statically (`python3 -m http.server`) and
loaded in a real browser. The reading surface is behind a passkey, so it was painted by importing
the shipped `/dist/present.js` and calling `paint()` on a sample source — the real cascade, the
real painter, the real stylesheet. No API call was made and the live app was never touched.

---

## 0. The three changes that would most make it feel finished

| # | Change | Size |
|---|--------|------|
| 1 | **Give the app the brand's six colour tokens and its two typefaces.** The app is the only page on the site that does not load Inter or JetBrains Mono, and its palette is the brand palette rotated to blue. This is a token swap and one `<link>`. | **under an hour** |
| 2 | **Make the heading ladder ascend.** Today every heading below `#` is *smaller and dimmer* than the paragraph it introduces. Raise the row to 28px and put Obsidian's own 1.125 scale on it. Verified in the browser: row equality survives exactly. | **under an hour** |
| 3 | **Make it survive a phone.** `app/index.html` contains zero media queries, zero `prefers-reduced-motion`, a 16×16px checkbox, and a focus jump that reappears the moment a line wraps — which on a 386px viewport is nearly every line. | **half a day** |

Two of the three are under an hour. That is the honest headline: **the app is much closer to the
brand than it looks, and the distance is almost entirely tokens.**

---

## 1. The gap — where the app departs from `brand/BRAND.md`

`brand/BRAND.md` §2 declares the identity as: colour `#3ff07f` / `#0a0b0a` / `#e6ebe6`, typography
Inter + JetBrains Mono, and the glowing green dot as the brand device. The landing page implements
all of it. The app implements none of it except the tag chip and the caret.

### 1a. Typefaces — the app is the only page that does not load them

**OBSERVED.** `grep -L "fonts.googleapis"` across `index.html`, `app/index.html`,
`demo/index.html` returns exactly one file: `app/index.html`.

**OBSERVED.** `app/index.html:31` declares
`font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif`.
Inter is fourth in the stack and never loaded, so it is never reached. The computed
`font-family` on the reading surface resolves to `-apple-system`. The app renders in San
Francisco; the landing, the demo and the vault snippet render in Inter.

**REASONED.** This single fact accounts for more of "we have two styles" than any colour does. Two
pages in the same palette but different typefaces read as two products; two pages in the same
typeface but drifted colours read as one product with a theme.

### 1b. Colour — the same luminances, rotated to blue

**OBSERVED**, computed contrast ratios against each page's own ground:

| Role | App token | Contrast | Brand token | Contrast |
|---|---|---|---|---|
| ground | `--bg #07080a` (+ a `#0e1420` radial) | — | `--bg #0a0b0a` (flat) | — |
| body ink | `--ink #eef1f4` | **17.67:1** | `--ink #e6ebe6` | **16.33:1** |
| secondary | `--dim #8b93a1` | **6.47:1** | `--ink-dim #8a948a` | **6.27:1** |
| hairline | `--line #1b1f26` | **1.21:1** | `--line #1c211c` | **1.21:1** |
| lit / active | `--glow #7cc7ff` | — | `--acc #3ff07f` | 13.13:1 |
| bright fill | `--accent #cfe8ff` | 15.88:1 | `--acc #3ff07f` on `--on-acc #04120a` | 12.76:1 |

**REASONED, and this is the useful part:** the app's palette is a *hue rotation* of the brand's,
not a different design. The hairline token is contrast-identical to three decimal places; the ink
and dim tokens are within 1.3 and 0.2 of a ratio point. Swapping the six tokens therefore has **no
contrast consequence at all** — nothing needs re-tuning after it. That is why change #1 is an
hour and not an arc.

The map is one-to-one with a single split:

```
--bg     #07080a  →  #0a0b0a   (and drop the radial gradient; the brand ground is flat)
--ink    #eef1f4  →  #e6ebe6
--dim    #8b93a1  →  #8a948a   (as --ink-dim)
--line   #1b1f26  →  #1c211c
--glow   #7cc7ff  →  #3ff07f   (as --acc — the "lit" colour)
--accent #cfe8ff  →  SPLITS:
           button fill        →  --acc #3ff07f with --on-acc #04120a text (landing .access button)
           top-heading colour →  --acc #3ff07f (reading.css:70 already makes H1 the accent)
```

**OBSERVED.** `app/styles/reading.css:14–30` already contains the complete brand token block —
including `--acc-hi #6df59b` and `--on-acc #04120a`, which `app/index.html` lacks. 209 lines of
brand-correct reading CSS exist in this repo and the app does not load them.

**REASONED, with a caveat the builder needs:** take `reading.css`'s `:root` block **verbatim**; do
**not** take its element rules. `reading.css` sets `margin` on headings, paragraphs and lists
(`#rendered h2 { margin: 2.6rem 0 1rem }`), and a margin on a row is exactly what
`app/index.html:121` forbids and what the recent focus-jump fix removed. The tokens are portable;
the rules are not.

### 1c. Type — the app has no headline register, and its ladder is built from the wrong half of the landing

**OBSERVED**, every static `font-size` declared in each file (rem resolved at a 16px root):

| File | Distinct static sizes | Range |
|---|---|---|
| `index.html` (landing) | 12, plus 8 `clamp()`s | 11.2px → 115.2px (**10.3×**) |
| `app/index.html` | 10, plus 2 `clamp()`s | 10.24px → 16.8px (**1.64×**) |
| `.viewbody` only (the reading surface) | 5 headings + 16px body | 11.52px → 16.8px (**1.46×**) |

**OBSERVED**, the app's ladder as computed in the browser:

```
h2 (view's `#`)   16.80px  600  #cfe8ff
body / task / p   16.00px  400  #eef1f4      ← the body is BIGGER than three of the five headings
h3 (`##`)         15.20px  600  #8b93a1      ← smaller AND dimmer than the prose under it
h4 (`###`)        13.76px  600  #8b93a1
h5 (`####`)       12.48px  600  #8b93a1
h6 (`#####`)      11.52px  600  #8b93a1
```

`h2` clears body text by 5%. `h3` through `h6` sit *below* it in size and at 6.47:1 against body's
17.67:1 in colour. **REASONED:** a document whose section headings recede below its prose has no
visible skeleton. This is the structural cause of the app reading as a flat grey list rather than
as a document, and it is a bigger felt problem than the blue.

**OBSERVED, and worth knowing where the numbers came from:** the app's five heading sizes
(11.52 / 12.48 / 13.76 / 15.2 / 16.8) are drawn from the landing page's **label** set, not its
reading set. On the landing, 11.52px is the eyebrow and the footer meta, 12.48px is the nav pill,
13.76px is the email input, and 16.8px is the nav wordmark. The landing's *reading* sizes are
14.4 / 16.32 / 17.6 / 21.6 / 23.2. The app's headings are the landing's captions.

### 1d. Spacing — off-grid, but so is the landing, and that is fine for one of them

**OBSERVED.** Parsing every length in each file's `<style>` block:

- `app/index.html`: 54 lengths, **36 (67%) off a 4px grid**, across 19 distinct values —
  5.6, 6.4, 6.72, 8.8, 9.6, 11.2, 12.8, 14.4, 15.2, 17.6, 18.4, 22.4, 25.6…
- `index.html`: 66 spacing lengths, **36 (55%) off a 4px grid**.

**REASONED, and this is a deliberate refusal to over-claim:** the landing is *equally* off-grid and
that is not a defect. It is a poster — a dozen hand-placed elements, each spacing decision made
once and seen once. The app is a reading tool that stacks hundreds of rows, where a 1.36px error
per row (§1e) becomes 40px down a screen. A grid is worth it for one of these and not the other.
Do not "fix" the landing.

### 1e. One real defect the tag-chip work did not reach

**OBSERVED**, measured in the shipped stylesheet at 560px:

```
plain line                  23.9986px
line with a tag chip        23.9986px   ← the recent work; correct
line with a link            23.9986px
line with bold + italic     23.9986px
line with inline <code>     25.3622px   ← +1.3636px
```

**OBSERVED**, the cause, bisected in the browser: `.viewbody code` inherits `line-height: 24px`
as a *length*, and its `font-family` falls through to the UA's `monospace` (Menlo), whose
ascent/descent distribution pushes the inline box past the 24px strut. Setting `line-height: 1` on
the element restores it to 23.9986px exactly — **the same one-line fix, for the same reason, as the
tag chip's** (`app/index.html:211`).

**REASONED.** This is the identical class of bug the chip's comment was written to prevent, in the
one inline the comment did not cover. Any code-bearing line in a view moves everything below it by
1.36px when the cursor arrives. One declaration.

### 1f. What is *not* wrong (measured, so nobody re-does it)

- **Horizontal alignment on focus is already correct.** OBSERVED: focusing a task line moves its
  words by **0.40px**. `--box-gap` is tuned. Leave it.
- **The vertical fix holds on desktop.** OBSERVED: h2–h6, plain, chip, link, bold and the raw
  `<input>` all measure 23.9986px. The row model works.
- **No iOS input-zoom bug.** OBSERVED: every focusable control (`#handle`, `#captureBox`,
  `#viewPick`, `input.rawline`) computes to 16px, so Safari will not zoom on focus.
- **The mark already shares the column's left edge.** OBSERVED: `.brand` and the first heading both
  start at the `.wrap` left edge. The landing does the same thing. Nothing to do.
- **No horizontal overflow at 386px.** OBSERVED: `scrollWidth === clientWidth`.

---

## 2. The scales, as tokens

### 2a. Where these numbers come from

**OBSERVED**, extracted directly from the installed `/Applications/Obsidian.app/Contents/Resources/obsidian.asar`:

```
--h1-size: 1.802em    --h4-size: 1.266em    --font-text-size: 16px
--h2-size: 1.602em    --h5-size: 1.125em    --line-height-normal: 1.5   (→ a 24px row)
--h3-size: 1.424em    --h6-size: 1em        --line-height-tight: 1.3
--h1-weight: 700      --h2..h6-weight: 600  --h1/h2-line-height: 1.2   --h3-line-height: 1.3
--size-4-1..18: 4 8 12 16 20 24 32 36 40 48 64 72 px      --size-2-1..3: 2 4 6 px
--radius-s: 4px  --radius-m: 8px  --radius-l: 12px        --file-line-width: 700px
```

That heading set is **exactly 1.125ⁿ** — a major second, five steps. It is the scale the operator
already reads every document in. **REASONED:** for a tool whose job is reading markdown, matching
the reference tool's scale is not imitation, it is removing a discontinuity between two surfaces
holding the same vault.

### 2b. The type scale — ratio **1.125**, base **16px**

| Token | rem | px | Where it goes |
|---|---|---|---|
| `--t--2` | 0.702rem | **11.24** | the smallest legible mono label (replaces 10.24 / 11.2 / 11.52) |
| `--t--1` | 0.790rem | **12.64** | eyebrow, nav pill, freshness line, footer meta |
| `--t-0`  | 0.889rem | **14.22** | `h6`, table cells, captions |
| `--t-1`  | 1.000rem | **16.00** | **body, task text, prose, `h5`, and the raw `<input>`** |
| `--t-2`  | 1.125rem | **18.00** | `h4` (`###`) |
| `--t-3`  | 1.266rem | **20.26** | `h3` (`##`) |
| `--t-4`  | 1.424rem | **22.78** | `h2` (the view's `#`) |
| `--t-5`  | 1.602rem | **25.63** | the page `<h1>`, "the one thing" |
| `--t-6`  | 1.802rem | **28.83** | reserved — the app's largest register |

Nine steps, one ratio, replacing eleven hand-picked sizes. Weights follow Obsidian: **700** at
`--t-5`/`--t-6`, **600** everywhere else, **400** body.

**Colour on the ladder** — it must descend in colour as well as size, and never below body:

```
h2 (`#`)     --t-4  600  --acc     #3ff07f   ← mirrors reading.css:70 (H1 takes the accent)
h3 (`##`)    --t-3  600  --ink     #e6ebe6
h4 (`###`)   --t-2  600  --ink     #e6ebe6
h5 (`####`)  --t-1  600  --ink-dim #8a948a
h6           --t-0  600  --ink-dim #8a948a
body         --t-1  400  --ink     #e6ebe6
```

### 2c. The row, and why it becomes 28px

The row is the binding constraint: a heading and the `<input>` that replaces it must occupy one
identical box, and the box is `--row` tall. At `--row: 1.5rem` (24px), 22.78px does not fit —
which is precisely why the ladder was built downward out of the landing's caption sizes.

**Set `--row: 1.75rem` (28px).** Then body is 16px on a 1.75 leading — the same leading
`app/styles/editor.css:104` already gives the source pane, so the product's rendered and source
surfaces share one rhythm.

**OBSERVED — I applied the proposed tokens in the browser and measured every rendition:**

```
--row: 1.75rem; h2 1.424rem; h3 1.266rem; h4 1.125rem; h5 1rem; h6 .889rem; code { line-height: 1 }

plain row          27.9972px       <h2> 22.78px  h=27.9972  scrollHeight 28  (no clipping)
inline code        27.9972px       <h3> 20.26px  h=27.9972  scrollHeight 28
tag chip           27.9972px       <h4> 18.00px  h=27.9972  scrollHeight 28
input.rawline      27.9972px       <h5> 16.00px  h=27.9972  scrollHeight 28
                                   <h6> 14.22px  h=27.9972  scrollHeight 28
```

Every rendition, identical to four decimal places. **The ladder ascends and row equality survives.**

**The cost, stated honestly.** A 36px pitch (28 row + 8 gap) against today's 32px is 12.5% fewer
rows per screen — about **three fewer rows** on a 932px phone. That is the price of a document that
has a skeleton, and it is worth it.

**One residual, named so nobody is surprised.** Focusing a heading still shrinks the glyphs
(22.78px → 16px) even though the box does not move. That already happens today (16.8 → 16); it just
becomes visible. The fix is for the painter to carry the line's kind onto the `<input>` it creates
— which is forwarding what it already parsed, **not** reading markdown back out of the DOM — and it
is a separate, optional piece of work.

### 2d. The spacing scale — 4px base

```
--s-0    0px       --s-4   16px      --s-10   40px
--s-h    2px       --s-5   20px      --s-12   48px
--s-1    4px       --s-6   24px      --s-16   64px
--s-2    8px       --s-8   32px      --s-18   72px
--s-3   12px       --s-9   36px
```

Radii, replacing today's 6 / 10 / 16: `--r-s 4px`, `--r-m 8px`, `--r-l 12px`, `--r-pill 999px`.

Reading-surface bindings: `--row 28px` (= `--s-9` minus `--s-h`… simply 28, 7×4), `--row-gap
--s-2`, `--box-gap --s-2`, block pitch **36px**.

---

## 3. Structure and geometry — optimised for long documents

### 3a. Line length

**OBSERVED**, average lowercase advance at 16px, measured in the browser:

| Face | avg glyph | 346px col | 560px col | 640px col | 704px col |
|---|---|---|---|---|---|
| Inter | 8.563px | 40ch | **65ch** | **75ch** | 82ch |
| SF (app today) | 7.833px | 44ch | 71ch | 82ch | 90ch |
| JetBrains Mono | 9.600px | 36ch | 58ch | 67ch | 73ch |

In Inter, 66 characters needs **565px** and 75 characters needs **642px**.

**REASONED, and it refutes the obvious move.** The instinct is to widen the app to `reading.css`'s
44rem / Obsidian's 700px cap. Don't — 704px in Inter is 82 characters, past the comfortable band.
The instinct to say "560px is too narrow" is also wrong: 560px *in Inter* is 65 characters, which
is one character off the classic optimum. **The app's column is already right; it is only set in
the wrong typeface.**

```
--measure: 40rem;   /* 640px — 75ch in Inter, the top of the band */
--measure-min: 35rem; /* 560px — 65ch, today's width, the floor */
--gutter: clamp(1rem, 4vw, 2rem);   /* 16px phone → 32px desktop */
```

### 3b. How the surface should sit in the frame — one constraint for the shell

**OBSERVED**, from `~/qntm/.obsidian/workspace.json` (read-only): a **200px left rail** holding
file-explorer / bookmarks / search, permanently open; a **300px right drawer** holding backlinks,
outline, tags and properties, **collapsed by default**; and a main area split **vertically into two
markdown panes**.

**OBSERVED**, from `~/qntm/.obsidian/app.json`: `"readableLineLength": false`.

**REASONED, and these two facts explain each other.** He turns Obsidian's 700px cap *off* because
his panes are already narrow — a 200px rail plus a two-way split leaves each pane in the 600–700px
region on its own. He is not choosing wide lines; he is choosing not to be capped twice. The
numbers 200 / 300 / collapsed-by-default are also, usefully, exactly the shell the sibling is
building — they are worth reusing rather than re-deriving.

**The one constraint the frame must satisfy:**

> **Opening the drawer must not move the reading column horizontally.**

This is the direct generalisation of the principle already shipped — *a line's two renditions
occupy the same box, so the cursor arriving moves nothing*. The general form is **nothing the
reader did not ask to move, moves.** Concretely: anchor the column's left edge to a fixed gutter
from the frame's left edge and let it lose width from the right when the drawer opens, or overlay
the drawer entirely. Do not centre the column in the residual space — that re-centres every line
mid-read, which is a far larger motion than the 1.36px this branch is complaining about elsewhere.

### 3c. Vertical rhythm — and the one thing blocking it

**OBSERVED.** An 8-line source (`# Head` / blank / `## Today` / blank / a task / blank / prose /
trailing) paints as **4 rows**. Blank lines are dropped by the painter.

Two consequences, both **REASONED**:

1. **The view has no rhythm and cannot be given any by CSS.** The row model correctly forbids
   margins on `.viewbody` children — a margin on a heading is a margin the `<input>` does not have,
   and that difference *is* the jump (`app/index.html:119–122`). So air between sections cannot come
   from a stylesheet. It can only come from the author's own blank lines being rendered.
2. **You cannot put the cursor on an empty line**, so you cannot type on one.

**Recommendation: render a blank source line as an empty row of `--row` height.** The author's own
blank lines become the rhythm; the source and the rendition have the same number of rows; and the
row model stays intact by construction rather than by exception. It is the painter's job and it
does not reconstruct anything from the DOM.

### 3d. The rule that must survive

State it in the stylesheet so the next pass does not undo it: **no rule inside `.viewbody` may set
`margin`, `padding-top`/`bottom`, or any property that changes a row's height, on any element that
can be replaced by `input.rawline`.** Headings rank by size and colour. Sections are separated by
blank rows. Nothing else.

---

## 4. Mobile

**OBSERVED.** `app/index.html` contains **zero** `@media` rules. Not one breakpoint, no
`prefers-reduced-motion`, no `prefers-color-scheme`. For comparison: `index.html` has 4,
`editor.css` has 2, `reading.css` has 1, `demo/app.css` has 1.

**OBSERVED**, the app rendered at a 386×840 viewport:

| Thing | Measured | Target |
|---|---|---|
| column width | 346px | — |
| characters per line | **42** (Inter: 40) | 40–45 is normal for a phone; **do not chase this** |
| task checkbox | **16 × 16px** | 44px hit slug |
| task row hit area | 346 × 24px | full row pitch |
| `<select>` (the view picker) | 346 × **39.9px** | 44px |
| `env(safe-area-inset-*)` used | **nowhere** | required — see below |
| horizontal overflow | none | ✓ |

### 4a. The wrapped-line jump — the most important mobile finding

`app/index.html:109–111` already admits the limit: *"a line whose rendition WRAPS. A wrapped
paragraph is two rows, an `<input>` cannot hold a second one… That case needs the painter."*

**OBSERVED.** At 386px, focusing a wrapped task line:

```
before focus:  rows 24.0, 24.0, 72.0, 24.0, 72.0   → total 248.0px
after  focus:  rows 24.0, 24.0, 24.0, 24.0, 72.0   → total 200.0px
                              ↑ the 72px row became a 24px <input>
JUMP = 48px — everything below the cursor rises by two rows.
```

**REASONED.** At 42 characters per line, essentially every real task line wraps. So the fix that
this branch's base commit shipped — *focusing moves nothing* — **holds on the desktop and collapses
on the phone**, which is where he will use it. This is the single largest felt regression on mobile
and it is invisible from a laptop.

**The fix, in order of cost:**

- **half a day** — the painter reads the geometry of the row it is about to replace and sets the
  `<input>`'s `height` to match, letting the single line of source scroll horizontally inside a
  taller box. Reading `getBoundingClientRect()` of a node is reading *geometry*, not reconstructing
  markdown; both existing guarantees (an `<input>` cannot hold a newline; `applyEdit` refuses
  multi-line text) survive untouched.
- **an arc** — replace the `<input>` with a `<textarea>` hard-locked to one logical line (Enter
  swallowed — it already means commit; paste sanitised). The boxes then match by construction. The
  cost is real and must be weighed: it trades away one of the two deliberately-separate guards
  (`paint.ts` says plainly that the element-level and function-level refusals *are not one*).

Recommend the first.

### 4b. Touch targets

Apple HIG asks 44×44pt; the row pitch is 36px, so a 44×44 slug would overlap the neighbouring
rows and steal their taps. **Give the checkbox a 44 wide × 36 tall hit slug** — the full row pitch,
no overlap — as an absolutely-positioned pseudo-element so it costs nothing in layout:

```css
.viewbody .task input { position: relative; }
.viewbody .task input::before { content: ""; position: absolute; inset: -4px -14px; }
```

The rest of the row stays a text-focus target, which is the intended behaviour anyway. Raise
`<select>` and every `.tab` to a 44px minimum height (they are 39.9px and ~30px today).

### 4c. Safe areas

**OBSERVED.** `app/index.html:5` sets `viewport-fit=cover`; `env(safe-area-inset-*)` appears
nowhere in the file. The page opts into the display cutout and then does not pad for it — in
portrait the home indicator sits over the last row; in landscape the rounded corners clip the
column.

```css
body {
  padding-left:   max(var(--gutter), env(safe-area-inset-left));
  padding-right:  max(var(--gutter), env(safe-area-inset-right));
  padding-bottom: max(var(--s-16),   env(safe-area-inset-bottom));
  padding-top:    max(var(--s-9),    env(safe-area-inset-top));
}
```

### 4d. Breakpoints and reach

**One breakpoint, at 640px.** The site already uses 640px in both `reading.css:206` and
`editor.css:124`; the app should join that, not invent the landing's 760/460 (which are poster
breakpoints and should stay where they are).

At ≤640px: `--gutter` → 16px; `--measure` → 100%; hit slugs on; the mark stays at the top.

**One-handed reach.** The view picker is the most-used control in the app and it currently sits at
the very top of the page — the least reachable point of a 932px phone held in one hand. On ≤640px
it belongs in a bottom bar, 56px tall, sitting above `env(safe-area-inset-bottom)`. **That is a
shell decision and it is the sibling's call** — flagged here, not specified, so the two passes do
not collide.

---

## 5. Light features that earn their place

The evidence base for this section is his own tooling, read from `~/qntm/.obsidian/` (read-only).

**OBSERVED**, from `app.json`: `"vimMode": true`, `"showLineNumber": true`.
**OBSERVED**, from `community-plugins.json`: `obsidian-relative-line-numbers`, `omnisearch`,
`obsidian-tasks-plugin`, `obsidian-fullscreen-plugin`, `notebook-navigator`.
**OBSERVED**, from `core-plugins.json`: `command-palette`, `switcher`, `global-search`, `outline`,
`backlink` all enabled; `slash-command`, `random-note`, `slides`, `workspaces` all disabled.
**OBSERVED**, from `hotkeys.json`, the seven things he bound by hand:
`Alt+O` outline · `Alt+Shift+O` outline-for-current · `Alt+F` fullscreen-focus ·
`Alt+D` toggle-done · `Alt+C` edit-task · `Alt+T` daily note · `Alt+X` one specific file.

**REASONED.** `vimMode` plus a *relative* line-numbers plugin is decisive: he navigates by counted
motions (`12j`), which is a thing you only install a plugin for if you actually do it. Four of his
seven hand-bound keys are navigation or focus. He has disabled every "discovery" feature
(slash commands, random note). This is a jump-and-motion user, not a browse user.

### Recommended — four, in order

**1. A reading/source mode toggle, wired to the cascade's existing MODE level.** — *half a day*

`app/present/levels.ts` already declares seven levels and says all seven are silent. `MODE` is one
of them. A single toggle that contributes `{checkbox: raw, heading: raw, prose: raw, tags: raw}` at
MODE turns the whole view into its source characters and back. This is Obsidian's own
Reading/Source pair, it is the toggle `demo/` already ships (`editor.css:73–86`), and — the point —
it is **a declaration, not a painter change**. Nothing in `paint.ts` learns a new branch. The
cheapest real feature in the building.

**2. Outline jump.** — *half a day*

He bound `Alt+O` to it. A view's headings are already classified by `classifyLine`; a keyboard-only
list of them that moves the cursor to a line index is a small surface over facts the painter has.
No DOM parsing: the outline comes from the same source string the painter was given.

**3. Vim normal-mode motions on the view.** — *an arc*

`j` / `k` / `gg` / `G` / `{` / `}` move the FOCUS level's line index; `/` filters; `i` or `Enter`
puts the cursor in the `input.rawline`; `Esc` leaves it (the escape path already exists in
`paint.ts` and already discards without posting). The FOCUS level is *already* "one number and
nothing else" — motions are arithmetic on that number. Do this **after** #1, because #1 proves the
mode plumbing.

**4. One-key done on the focused line.** — *under an hour*

He bound `Alt+D` to exactly this. `applyEdit`'s checkbox case already computes the whole-file
markdown; the key press reuses the checkbox's existing path with no new write path.

### Rejected, and why

- **Deletable tag chips.** `paint.ts` already argues this at length — the whitespace is undecided,
  the semantics are structural (`#task` selects a node *type*), and the click target collides with
  the cursor target. Its own conclusion stands: ship it when those three are answered, not before.
- **Drag-to-reorder rows.** Needs a multi-line source rewrite; `applyEdit`'s whole guarantee is
  "exactly one line replaced". Not worth trading.
- **A `contenteditable` rendered surface.** Requires reconstructing markdown from the DOM. This is
  the architectural line and it is not negotiable.
- **A graph visualisation in the app.** He has one in Obsidian and has it enabled. The app's job is
  the reading surface; a second graph view is scope, not polish.
- **A theme switcher / light mode.** `brand/BRAND.md` §3 names green-on-black as the hero surface.
  One ground, done well.
- **Relative line numbers in a gutter.** Tempting given the plugin, but a gutter costs 24–32px of a
  346px phone column — 3–4 characters of an already-tight 42. Revisit only if #3 lands and he
  reports missing them.
- **Slash commands / a discoverability layer.** He has `slash-command` explicitly disabled.
- **Animated view transitions.** See §6.

---

## 6. Motion

**OBSERVED**, the site's existing transition durations, counted across `index.html`,
`app/index.html` and `app/styles/`:

```
0.2s ×7   0.25s ×4   0.18s ×2   0.3s ×2   0.7s ×2   0.5s ×1   0.15s ×1   0.08s ×1
```

**OBSERVED**, the landing's motion language: `pulse` 2.6s ease-in-out infinite (the brand device —
the dot, opacity 1 → 0.45); `drop` 2s (the scroll hint); the creed reveal 0.7s on
`cubic-bezier(0.2, 0.7, 0.2, 1)`; the cursor trail a 0.18 lerp; the repel spring `K=0.14, D=0.76,
R=85px, STR=24px`.

**OBSERVED**, reduced-motion coverage: `prefers-reduced-motion` appears **once** in `index.html`
(guarding only the repel — the pulse, the scroll-hint drop, the creed reveal and the canvas graph
are all unguarded), **once** in `editor.css` (correctly guarding the pulsing mark), and **zero
times** in `app/index.html`.

### The tokens

```
--motion-fast:   150ms      /* colour, border, caret       */
--motion:        200ms      /* the default — hover, focus  */
--motion-slow:   250ms      /* the drawer, larger surfaces */
--motion-reveal: 700ms      /* reserved; the landing only  */
--ease:          ease
--ease-reveal:   cubic-bezier(0.2, 0.7, 0.2, 1)
```

### What may move

- Colour, border-colour, box-shadow and opacity on hover and focus — `--motion-fast` to `--motion`.
- The drawer opening — `--motion-slow`, **`transform` only**, never `width`.
- A button's 1px press — 80ms, as today.
- The brand dot's pulse — 2.6s, exactly as `editor.css:34–48` already does it, guard included. This
  is the one piece of the landing's motion language the app should adopt: `brand/BRAND.md` §2 names
  the glowing dot as *the* brand device, and the app currently has no instance of it.

### What must not move, at all

- **No row of the reading surface, ever.** No entrance animation, no stagger, no fade-in on paint.
  The reason is specific and comes from `paint.ts`: *the painter repaints the whole view on every
  focus change*. Any entrance animation would therefore replay on **every cursor movement** — a
  full-view flicker per keystroke-of-navigation.
- **No transition on any layout-affecting property inside `.viewbody`** — `height`, `margin`,
  `font-size`, `padding`. A transition there is the focus jump this branch's base commit removed,
  arriving in slow motion instead of instantly.
- Do not port the landing's cursor-glow or repel-text into the app. They are poster behaviour, they
  set `cursor: none`, and one of them runs a `requestAnimationFrame` spring over every letter.

### The reduced-motion path is required

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

Plus the targeted guard on the brand dot. And while it is being written: `index.html`'s pulse,
scroll-hint, creed reveal and canvas graph are currently unguarded and should be brought under it
— that is a separate under-an-hour job on the landing, listed at #10 below.

---

## 7. The ranked change list

| # | Change | Size | Why here |
|---|---|---|---|
| 1 | **Brand tokens + Inter/JetBrains Mono in the app.** Swap the six colour tokens (§1b map), drop the radial ground, add the font `<link>`. | **under an hour** | Largest felt change per minute; zero contrast consequence, measured. |
| 2 | **The heading ladder ascends.** `--row: 1.75rem`, the 1.125 scale, the colour ladder, and `code { line-height: 1 }`. | **under an hour** | Verified in a browser: every rendition 27.9972px. Turns a grey list into a document. |
| 3 | **Reading column at `--measure: 40rem`, left-anchored so the drawer cannot move it.** | **under an hour** | §3b. The generalisation of the principle already shipped. |
| 4 | **The `prefers-reduced-motion` path + the motion tokens + the brand dot in the app's mark.** | **under an hour** | Currently zero coverage in the app. Also gives the app its first piece of the brand device. |
| 5 | **Mobile pass: one 640px breakpoint, 44px hit slugs, safe-area insets.** | **half a day** | §4. The app has no responsive layer at all today. |
| 6 | **The wrapped-line focus jump: the `<input>` matches the box it replaced.** | **half a day** | §4a. 48px of movement per focus, on the device he will use most. |
| 7 | **Blank source lines become blank rows.** | **half a day** | §3c. The only legal source of vertical rhythm, and it makes empty lines editable. |
| 8 | **Reading/source toggle through the cascade's MODE level.** | **half a day** | §5.1. A declaration, not a painter change. |
| 9 | **Spacing + radius tokens applied across the app chrome** (cards, buttons, inputs, tabs, the picker). | **half a day** | §1d. 67% of the app's lengths are currently off any grid. |
| 10 | **Bring the landing's pulse / scroll-hint / creed reveal / canvas under `prefers-reduced-motion`.** | **under an hour** | Only the repel is guarded today. Landing-side, not app-side. |
| 11 | **Outline jump (`Alt+O` equivalent) + one-key done.** | **half a day** | §5.2, §5.4. Both reuse facts the painter already has. |
| 12 | **Vim normal-mode motions over the FOCUS level.** | **an arc** | §5.3. Do it after #8. |

Items 1–4 together are **one working session** and are, between them, the whole of "it feels
finished".

---

## 8. Sources

- **Obsidian 1.x, the installed application** — `--h1..h6-size`, `--size-4-*`, `--radius-*`,
  `--file-line-width`, `--font-text-size`, `--line-height-normal` read directly out of
  `/Applications/Obsidian.app/Contents/Resources/obsidian.asar`. Used for the type ratio (§2b), the
  spacing grid (§2d) and the 700px cap that §3a argues *against* adopting. It applies because it is
  the tool he reads this exact vault in every day; a discontinuity between the two surfaces is felt
  directly.
- **His own Obsidian configuration** (`~/qntm/.obsidian/`, read-only) — `vimMode`,
  `readableLineLength`, the plugin list, the seven hand-bound hotkeys, and the 200/300/collapsed
  workspace geometry. Used for §3b and the whole of §5. This is the strongest evidence in the
  document because it is behaviour, not preference stated in the abstract.
- **`index.html`, the landing page** — measured live in a browser at a 1273px viewport. Used as the
  brand's shipped implementation throughout §1, and as the motion vocabulary in §6.
- **`app/styles/reading.css` and `editor.css`** — the repo's own brand-correct reading surface,
  which the app does not load. Source of the token block (§1b), the 640px breakpoint (§4d) and the
  1.75 leading (§2c).
- **Apple HIG 44pt / the 45–75 character band** — the two conventional numbers in §4b and §3a.
- **`app/present/*.ts` and `app/index.html`'s own comments** — the constraints the recommendations
  had to fit: the row model, the seven cascade levels, `applyEdit`'s single-line guarantee, and the
  prohibition on reconstructing markdown from the DOM.

---

## 9. What the X bookmarks yielded — honestly, almost nothing

The account was reachable and logged in; no automation block, no login wall. **Bookmarks only.** No
like, repost, reply, follow, bookmark, post or DM was made; the feed was not opened.

**OBSERVED: the bookmarks collection contains exactly three items**, confirmed by scrolling to the
end (`scrollY + innerHeight === scrollHeight`, 5 cells in the DOM) and again from the top. They are:

1. A film-trailer promotion.
2. A prompt for making AI prose sound less like AI prose — a list of banned rhetorical devices.
3. Part two of an essay on why software factories fail.

**None of the three is about interface design, typography, spacing, colour, layout or motion.**
Nothing in this document is derived from them. If there is a design feed worth mining it is not in
the bookmarks — the deliberate-save signal simply is not there yet. Obsidian, measured directly,
carried the entire reference load instead, and carried it better.

**One flag, per the brief.** Bookmark 2 is instruction-shaped — it opens *"quarterly reminder to use
this prompt to get your AI writing to sound better"* and then issues a list of prohibitions. That is
**content, not a brief**: it is quoted here and was not acted on. It is also, incidentally, about
prose style and has no bearing on the app.

No personal information about the operator or anyone else was recorded — no names, no handles.

---

## 10. What I refuted about the current state

Five things a builder might reasonably assume, that the measurements say are false:

1. **"The app's palette is worse."** It isn't — it is a hue rotation of the brand's with
   near-identical luminances (17.67 vs 16.33, 6.47 vs 6.27, 1.21 vs 1.21). The swap needs no
   re-tuning of anything. This is what makes change #1 cost an hour.
2. **"The reading column is too narrow at 560px."** In Inter, 560px is 65 characters — one off the
   classic optimum. The column is right; the typeface is wrong. And widening to `reading.css`'s
   44rem would take it to **82** characters, past the band. Do not widen it.
3. **"Focusing a line still shifts it sideways."** It does not — measured at **0.40px**.
   `--box-gap` is correctly tuned and should be left alone.
4. **"The focus-jump fix is done."** On a desktop, yes — h2 through h6, plain, chip, link, bold and
   the raw input all measure 23.9986px. On a **386px viewport it is a 48px jump**, because a wrapped
   line's `<input>` cannot hold the second row. The fix holds exactly where it was tested and
   collapses where it will be used. Separately, `inline <code>` still breaks the equality by
   **1.3636px** on desktop — the one inline the tag-chip work did not cover.
5. **"The app has no visual rhythm because it needs bigger margins."** It cannot have margins — the
   row model forbids them, correctly. It has no rhythm because **the painter drops blank lines**
   (an 8-line source paints as 4 rows). Rhythm has to come from rendering the author's blank lines
   as rows, not from CSS. Anyone who "fixes the spacing" with margins will reintroduce the jump.

And one thing worth restating because it constrains everything above: **nothing here asks the
painter to reconstruct markdown from the DOM.** The outline comes from the source string; the
row-height match reads geometry; the mode toggle is a cascade declaration; the motions are
arithmetic on a line index. That line stays where it is.

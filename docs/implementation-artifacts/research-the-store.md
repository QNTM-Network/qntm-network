# Research: the store — can eleven surfaces become one, without a second path to the screen?

**Status:** research. **No application source changed on this branch.** This document is the whole
of it.

**Branch:** `research/the-store`, based on `origin/main` @ `d1137cb` of `QNTM-Network/qntm-network`.

**The ask, in the operator's words:** *"should we spend a bit more on the store whilst we do it.
not just for rows but want a well architected store generally. for use for general components and
future. if we're there great. if not spin out some research internal and external for how to do
this right"*

**Evidence rule**, unchanged from `research-state-and-speed.md` §1: every claim is **[OBS]** (a
command run, a test executed, output read), **[REA]** (reasoned from source read, cited
`file:line`), or **[REPO]** (a claim this repo makes about itself, quoted rather than independently
reproduced). No docstring is accepted as evidence of its own behaviour — every load-bearing claim
below was checked against the running code or the running test suite.

---

## 0. Lead — the answer, in 25 lines

**Yes, mostly. One store would be a regression; the pattern the eleven already share is not yet a
thing you can hand a new component, and that gap is real and worth closing.**

The eleven surfaces (eleven, not counting `PresentationContext`, which is a different shape — §2)
hold eleven facts with eleven different keys and eleven different invalidation rules, each one
argued in its own docstring against a measured defect with a date attached. Merging them into one
object would not delete any of that logic — every fact still needs its own comparison — and it
would add exactly the one thing this app has bled to remove: a **second path to the screen**.
`paintGeneration` (`app/present/paint.ts:434`) exists because a listener firing a repaint from
inside a write has already put three copies of a view on screen. A subscribe-and-notify store's
entire product is a listener that fires on write. **[REA]**, verified live below.

But the eleven are not the whole of the state layer. Six more module-level `let`s in
`app/index.html` (`presentation`, `indentUnit`, `structural`, `qualification`, `resolution`,
`rulesTable`) are **one fact — one served document, one parse function, one assignment site** —
artificially split into six variables with no documented reason to be six, unlike every one of the
eleven surfaces, each of which explains in its own header why it must **not** merge with its
neighbour. That is not a defect measured in a bug report the way `rows.ts` was. It is a
consolidation that costs a page of code, changes no behaviour, and gives "general components and
future" the one thing missing today: a **named, reusable shape** (bounded value, own key, own
drop rule, no subscription, the read call is the reconcile) instead of eleven independent essays
that happen to agree.

**Verdict: (a) with one slice.** Eleven-becoming-twelve (`RowStore` shipped the same day as this
branch's base commit) surfaces are correct as they stand. The one concrete, ordered, low-risk piece
of work is §7's `Declaration` value. No dependency is recommended — every external candidate
surveyed either fails the architecture's own gravity test or buys nothing §0's measurements do not
already show is free (§6).

---

## 1. How this was measured

**[OBS]** All eleven surface source files were read in full
(`app/present/{rows,base,accepted,focus,draft,motions,settle,predict,queue,pickup,correlation,context}.ts`).
`app/index.html` (3,968 lines) was read in the regions that declare, assign, and consume every
module-level `let`, plus the full bodies of `paintView`, `repaintCurrentView`, `commitLine`,
`resolverContextFor`, and `globalRegistrationFor` — the five functions every holder ultimately
answers to. `app/present/paint.ts` (103,298 bytes) was read around `paintGeneration` and its three
named re-entrancy points.

**[OBS]** `npm install` was run in the worktree (39 packages, no network write, nothing outside
`node_modules`) and the full suite was executed: `node --test tests/*.test.mjs` → **2,127 tests,
2,122 pass, 3 fail**. The three failures (`tests/app-resolver-registry.test.mjs` twice,
`tests/app-day-boundary-required.test.mjs` once — all three about the generated declaration
disagreeing with the live monorepo's `rules/`/`qualification` config) are pre-existing config-drift
findings, unrelated to state management, and are left exactly as found — this branch does not touch
`config/`. `tests/app-row-store.test.mjs` specifically: **19/19 pass**, including its §6 mutation
proof (below).

**[OBS]** Every external package's weight is `curl`'d from `bundlephobia.com`'s API and, where that
was rate-limited, `deno.bundlejs.com`'s badge endpoint (same underlying esbuild-based measurement,
cross-checked against one another where both answered — `alien-signals` at 1,950 B on both). No
number below is quoted from a project's own README.

**[OBS]** `git log` was run against every one of the eleven surface files to confirm authorship
order (§2, §4). No file under `config/` or `apps/qntm-md/config/` was read, written, or listed. No
cycle ran. No request left this machine except to `bundlephobia.com`/`bundlejs.com` (public,
read-only, no auth) and one `git log`/`node --test` pass against this worktree.

---

## 2. The inventory — all 29 holders

**Eleven mutable surfaces** (`app/index.html:1052–1073` imports all eleven from `dist/present.js`;
instantiated once each, `app/index.html:1386–1493`):

| Surface | Holds | Keyed by | Read by | Written by | Invalidated | Survives a view change? |
|---|---|---|---|---|---|---|
| `FocusSurface` (`focus.ts:129`) | cursor line, column, an `InstanceAnchor` | nothing — one cursor | `paint()` per line, `ModeSurface.handleKey` | `.focus()`/`.moveColumn()`/`.blur()`/`.reanchor()` | `.blur()`; `.reanchor()` on a projection | **No** — `paintView` seeds a fresh line 0 on every real view change (`index.html:2568-2573`) |
| `DraftSurface` (`draft.ts:200`) | one uncommitted line: index, seed, typed text, place | nothing — one draft | `paint.ts`'s `paintDraft` | `.open()`/`.type()`/`.carry()`/`.drop()` | `.drop()` — view change (`index.html:2448`) or `placeDraft` outcome ≠ `placed` | **No**, by design — `index.html:2429-2445`'s own header |
| `ModeSurface` (`motions.ts:297`) | NORMAL/INSERT, digit-count, pending `g`, caret hint | nothing — one mode | `paint()`, `ModeSurface.handleKey` callers | `.enterInsert()`/`.enterNormal()`/`.handleKey()` | `.enterNormal()` on a view change (`index.html:2457`) | **No** |
| `SettleSurface` (`settle.ts:73`) | one armed row placement + one-shot animate flag | exact `(source, view)` pair | `repaintCurrentView` → `paint()` | `armSettle` inside `commitLine` (`index.html:3332`) | comparison miss on `.take()` — no explicit clear | value is source-keyed, so a view change is a comparison miss, not a call |
| `PredictSurface` (`predict.ts:92`) | armed row predictions + withdrawal reconciliation | exact `(source, view)` pair | `repaintCurrentView` → `paint()` | `armPredict` inside `commitLine` (`index.html:3333`) | reconciled-once on a `source` mismatch inside `.take()` | same as `SettleSurface` |
| `BaseSurface` (`base.ts:215`) | the file's markdown as the server last sent it, + per-path outstanding-write counts | one path | `served.read()` in `commitLine`/`toggleTask` | `.take()` in `paintView` (`index.html:2480`) | `.drop()` — not called on ordinary view change (see §3) | **counters yes, base no** — see §3 overlap |
| `ProjectionQueue` (`queue.ts:102`) | ≤1 pending envelope per path, replacing not accumulating | path | drain logic (not read in the excerpts cited by its own header) | `.offer()` | `.take()`/`.drop()` | per-path; a view change does not touch other paths' entries |
| `WriteRegister` (`correlation.ts:479`) | outstanding write tokens → `{path, grace}` | token | `.arrive()` inside `paintView`'s `correlate` step | `.open()` | matched, given-up-after-grace, or `.giveUp()` on a 409 | **Yes** — deliberately not view-scoped; a write outlives the view it was made from |
| `PickupSchedule` (`pickup.ts:170`) | per-path: token, `since`, owed stamp bodies, attempt count | path | timer callback (page-owned `setTimeout`) | `.schedule()` | `.answered()`/`.cancel()` | **Yes** — same reasoning as `WriteRegister` |
| `AcceptedSource` (`accepted.ts:53`) | one file's markdown, as the server said it now holds it | one path | `repaintCurrentView` (`index.html:2739`), `served.read` | `.take()` in `commitLine`'s `sayArrival` | `.drop(path)` on the next projection for that path | **No** — `paintView` calls `.drop()` unconditionally (`index.html:2487`) |
| `RowStore` (`rows.ts:200`) | one view's rows: identity, line index, text, anchor; selection | one view | `repaintCurrentView` (`.showing()`), `paint.ts`'s `repaint` closure (`.edited()`), vim key handler | `.showing()` is simultaneously the read and the write | `.forget()` on a re-read; `#reset` on a view change | **No** — `#install` resets on `view !== this.#view` |

**Eighteen module-level `let`s** (`app/index.html`, declared once, all confirmed with `rg` — see
§1):

| `let` | Line | What | Assigned | Read by |
|---|---|---|---|---|
| `presentation` | 1097 | GLOBAL cascade contribution | `applyPresentation` only | every `paint()` call |
| `indentUnit` | 1103 | indent arithmetic unit | `applyPresentation` only | `indentedLine` |
| `structural` | 1113 | ingest axis lookup table | `applyPresentation` only | **nothing yet** — its own comment says so (§4) |
| `qualification` | 1121 | membership/section-order axis | `applyPresentation` only | `globalRegistrationFor`, `resolverContextFor`/`membershipNoteFor` |
| `resolution` | 1129 | config-only resolution table | `applyPresentation` only | `globalRegistrationFor`, `resolverContextFor` |
| `rulesTable` | 1137 | compiled rules grammar | `applyPresentation` only | `resolverContextFor` → `runResolvers` |
| `token` | 1277 | session auth token | login/register/logout | `api()` |
| `graphData` | 1374 | the whole envelope | **exactly 4 sites**, test-pinned (§5) | `paintView`, `markWhereWeAre`, `repaintCurrentView`, `openDrawer` |
| `currentViewId` | 1376 | which view is *selected* | `paintView`, `loadGraph`, `logout` | `paintFolder`, `markWhereWeAre`, `openDrawer` |
| `drawerIsOpen` | 1549 | drawer open/shut | `openDrawer`/`closeDrawer` | itself only (no external reader found) |
| `paintedViewId` | 1687 | which view is *currently painted* | `paintView` (one site, `:2582`) | `repaintCurrentView` |
| `paintedSource` | 1704 | the string the body currently shows | `paintView` (one site, `:2583`) | `paintView`'s own `wasShowing` |
| `sentEdit` | 1717 | `{view, token}` of the last commit's write | `commitLine` (set); `paintView` (cleared) | `paintView`'s `mine`/`proved` |
| `cursorNote` | 1728 | one-shot freshness-line sentence | `paintView`, `reportCursorReading` | `takeNotes` |
| `writeNote` | 1739 | one-shot freshness-line sentence | write paths | `takeNotes` |
| `landedNote` | 1750 | one-shot freshness-line sentence | `correlate` | `takeNotes` |
| `landedTokens` | 1763 | tokens a projection acknowledged | `correlate` (set); `paintView` (cleared) | `paintView`'s `proved` |
| `reading` | 3554 | guards a second `refresh()` press | `refresh()` | `refresh()` |

**Two more holders exist that neither the eleven nor the eighteen count**, found in the course of
this survey and not named in the brief: `drawerStops` (`index.html:1547`, an array of every
focus-trappable drawer element) and `viewButtons` (`index.html:1548`, a `Map<viewId, button>`).
Both are rebuilt wholesale by `buildDrawer` every time the view list changes and read by
`markWhereWeAre`/`openDrawer`/`drawerKey`. **[REA]** They are DOM-element caches, not state in the
sense the other 29 are — the fact they hold (which button is which view) is derivable from
`graphData` at any instant and they exist only to avoid re-querying the DOM — but a literal count
of "everything held outside a function body" is 31, not 29. Named here rather than silently
folded in, per the instruction to prove absence positively rather than by omission.

`PresentationContext` (`context.ts:37`) is deliberately **not** counted as a twelfth surface. It is
immutable — `.with()` returns a new instance every call (`context.ts:74-85`) — so it is a *value*,
not a place mutation happens. `presentation` (the `let` that points at the current one) is already
counted in the eighteen.

---

## 3. The overlaps

`research-state-and-speed.md` §4 found one: *"truth about 'where am I' is written in two places"* —
`currentViewId` plus three DOM copies (`barFolder`/`barView` text, `.current` class). **[OBS]**
That overlap still exists, unchanged, at `markWhereWeAre` (`index.html:1672-1677`). It is joined by
a *second*, newer one, and this one is not a bug — it is a deliberately introduced third fact with a
stated reason:

**`currentViewId` vs `paintedViewId`.** `paintedViewId`'s own comment (`index.html:1680-1686`) is
explicit about why it is not a duplicate: *"not the same fact as `currentViewId`, which is which
view is SELECTED"* — a projection arriving and a view change are different events for the cursor,
and `paintView` needs to tell them apart at the one moment `currentViewId` alone cannot. **[REA]**
This is the shape `base.ts`/`accepted.ts` already argue for (a per-file fact and a per-write fact
must not merge even though they can hold the same string) applied one level up, to "where am I."
Recorded as an overlap because it is one — two variables answering overlapping questions — but not
flagged as a defect, because the reason is written down and load-bearing (`sameView` in `paintView`
is computed *from* the disagreement between the two).

**`BaseSurface`'s counters vs its base.** `#writing` (a `Map<path, count>`) and `#path`/`#markdown`
(the base itself) are two different lifetimes inside *one* class, explicitly separated in
`.drop()`'s own comment (`base.ts:286-294`): *"the pending writes are NOT forgotten — they are
still in the air."* Not a cross-surface overlap, but worth naming because it is the same shape as
the cross-surface ones — two facts, two lifetimes, kept apart on purpose — one level down.

**No case was found of two surfaces holding the *same* fact with no stated reason.** This is the
headline negative result of the inventory: every other candidate overlap this survey checked
(`served`/`accepted`, `queue`/`pickup`, `settle`/`predict`, `rows`/`draft`) has an explicit
docstring paragraph arguing why the two must not merge, each citing a different reader or a
different lifetime, and none of the eleven's own headers were found to be wrong when checked
against the call sites that actually use them (§2's "read by"/"written by" columns were built from
`rg`, not copied from the comments).

---

## 4. The dead, and the not-yet-consumed — proven positively

**`#app` (capture/one-thing) is still unreachable.** `research-state-and-speed.md` §4 found this;
it is unchanged. **Proof, not a grep:** every mutation site of `$("app")`'s `hidden` class was
enumerated (`rg -n '\$\("app"\)' app/index.html` → three hits: `1282`, `3447`, and none else).
`:1282` is inside `show(view)`, which only removes `hidden` when `view === "app"`; the only call
passing `"app"` is `:1364`, inside `loadState()`, which has **zero callers** (confirmed by `rg -n
"loadState\("` → the one definition and nothing else). `:3447` only ever **adds** `hidden`. So
every path that could show `#app` is enumerated, and none of them fires. The codebase's own comment
at `index.html:301-302` says the same thing independently: *"`#app` is unreachable — `loadState()`
is defined and never called, verified again for this change."* **This is already a backlog row**
(`delete-the-dead-capture-one-thing-half`, `state: diagnose-ready`, not shipped) — not re-filed
here.

**`structural` is assigned and validated but consumed by nothing.** **[REA]** Its own comment says
so in as many words (`index.html:1111-1112`): *"this variable is read by nothing, which is the
honest state of 'published, not yet consumed'."* This is a **different category from `#app`** —
`structural` is not unreachable dead code, it is a declared axis with no reader yet, staged ahead of
a future narration surface. Worth distinguishing because a store built around "every declared axis
is live" would be built on six axes when only five are.

**One comment-drift found, not filed as a defect.** `app/present/rules.ts:13,559,572`,
`app/present/ordering.ts:93,907`, `app/present/today.ts:8,68-69`, `app/present/declaration.ts:69`,
`app/present/context.ts:118`, and `app/present/graphmatch.ts:115` all still refer to
`app/index.html`'s `rulesReadingFor`/`membershipNoteFor`/`orderingNoteFor`/`armRuleApplication` by
name. **[OBS]** None of those four names exist in `app/index.html` any more — `rg` for each returns
only the comments that mention them. `index.html:3012-3020` documents the actual state: *"WHERE
THIS PAGE STOPPED KNOWING THEM BY NAME"* — the four axes are now walked generically through
`resolverContextFor` (`:3049`) → `RESOLVERS` → `runResolvers` (`:3310`), a consolidation that
replaced four named call sites with one generic walk. The behaviour is not dead; the *names* six
other files' comments use to describe it are stale. Not this branch's to fix (no application source
changes), named so it is not silently missed.

**`graphData` really is assigned in exactly four places**, live-verified rather than trusted:
`tests/app-membership-note.test.mjs:382-390` scans `app/index.html` as text for
`/\bgraphData\s*=(?!=)/g` and asserts the count is 4. **[OBS]** Run: passes. This is the strongest
kind of "not dead, and provably not duplicated" evidence in the whole survey — a mechanically
enforced invariant, not a claim.

---

## 5. The invariants a store proposal must not break

Eight, named and cited. A proposal that breaks any one of these reproduces a bug this app has
already shipped and already paid for.

1. **ONE PATH TO THE SCREEN.** Every pixel of a view's body is built by `paint()`
   (`app/present/paint.ts`), reached only through `repaintCurrentView` (`index.html:2715`) or
   `paintView` (`index.html:2406`, which itself ends by calling `repaintCurrentView` at `:2584`).
   No other function constructs view DOM. **[REA]**, confirmed by reading every call site of
   `paint(` in `app/index.html` (§ *how this was measured*).

2. **THE RE-ENTRANCY GUARD.** `paintGeneration` (`paint.ts:434`) is incremented at the top of every
   `paint()` call (`:1230`) and checked (`superseded()`) at the three places control can leave the
   frame mid-paint: focusing a newly built input can fire a `blur` on the previous one
   (`paint.ts:1376`), painting a draft row can do the same (`:1431`), and the per-line build loop
   checks it on every iteration (`:1461`, inside the `forEach` at `:1640`). This exists because
   *"control leaving a frame mid-paint has already cost this app three copies of a view on screen"*
   (`rows.ts:117-119`, restating `paint.ts`'s own comments). **Verified live, not narrated:** this
   guard is directly exercised by `commitLine`, which **can itself run synchronously inside an
   active `paint()` call** — `paint.ts`'s `rawInput` wires a blur listener to `settle`, which calls
   the page's `onLineCommit` callback (`commitLine`) synchronously, before any `await`
   (`index.html:3278-3342`). A nested blur during a paint is exactly case 1/2 above. `paintGeneration`
   is what makes this safe; a store's own notify-on-write would be a second, uncoordinated way for
   the same nesting to happen.

3. **NOTHING DERIVED IS EVER CACHED.** Every composite object a resolver or the painter needs is
   rebuilt fresh on every call that needs it — never memoised, never invalidated, because rebuilding
   is cheaper than tracking whether a cache is stale. `globalRegistrationFor` (`index.html:1190`):
   *"BUILT FRESH, NEVER CACHED... a cached object is one more piece of state that could drift"*
   (`:1186-1189`). `resolverContextFor` (`index.html:3049`): *"BUILT FRESH, NEVER CACHED — the same
   reason `globalRegistrationFor` above is not memoised. A cached context is one more thing that can
   drift"* (`:3044-3047`). `PresentationContext.with` (`context.ts:74-85`): *"a mutable context
   would let the painter set FOCUS, paint, and forget to unset it."* **This is the sharper, more
   general form of invariant 1** — a subscribe-store's entire value proposition (cache a derived
   value, invalidate it on write) is the thing this codebase has independently, repeatedly, refused,
   in both the render path and the write path.

4. **PULL, NOT PUSH.** None of the eleven surfaces registers a callback that fires a repaint. Every
   one is *asked* by the one function that already intended to draw: `rows.showing()` is *"the read,
   and it is also the write"* (`rows.ts:121-123`); `accepted.sourceFor()` answers `null` when it has
   nothing to say rather than announcing anything (`accepted.ts:79-82`); `base.read()` is a
   comparison made at write time, never a subscription. This is the property a listener-based store
   cannot offer without becoming a second path (invariant 1).

5. **A SECOND WRITE REPLACES THE FIRST WHOLESALE, NEVER ACCUMULATES.** `ProjectionQueue`: *"IT
   COALESCES. IT DOES NOT ACCUMULATE"* (`queue.ts:18`). `SettleSurface.arm`: *"Overwrites whatever
   was armed before"* (`settle.ts:85-90`). `PredictSurface.arm`: overwrites even with an empty list,
   on purpose (`predict.ts:51-59`). `BaseSurface`/`AcceptedSource`/`RowStore`: one file/view at a
   time, because *"writes only ever come from the painted view."*

6. **A VIEW CHANGE IS A HARDER RESET THAN A PROJECTION ARRIVING, AND EVERY SURFACE IS ASKED THE SAME
   ONE QUESTION TO TELL THEM APART.** `paintView`'s `sameView` (`index.html:2423`) and `why ===
   "arrived"` (`:2446`) are computed once and fed to `draftLine.drop()`/`rows.forget()`/
   `accepted.drop()`/`mode.enterNormal()` — none of the eleven re-derives this distinction on its
   own.

7. **`graphData`'S ASSIGNMENT COUNT IS MECHANICALLY PINNED**, not merely documented — §4's
   `tests/app-membership-note.test.mjs` scan. The one fact every other holder is ultimately told
   about or derived from has a test that goes red if a change adds a sixth write site.

8. **THERE ARE (AT LEAST) TWO PULL POINTS, NOT ONE**, and a proposal that assumes `paint()` is the
   *only* reconcile function in the app is wrong about the shape of the app. `repaintCurrentView` →
   `paint()` decides what is on screen. `commitLine` → `resolverContextFor` → `runResolvers`
   decides what the rules/membership/ordering axes say about a just-committed line — a genuinely
   different question, answered fresh (invariant 3) at a genuinely different moment. They are not
   independent (invariant 2 shows they can nest), but they are not the same function either. **This
   is a partial refutation of the coordinator's framing** — the discipline that must survive is
   "pull, never cache, one function per question," not literally "one function, full stop."

---

## 6. The external survey

**The test applied to every candidate, restated from `research-state-and-speed.md` §5 and applied
consistently:** does its gravity pull toward the store — or a component tree — becoming where truth
lives, instead of the markdown source? A library can be used carefully; the question is which way it
pulls a tired person at 11 p.m.

**Weight, measured, not advertised** — `bundlephobia`/`bundlejs`, current versions, 2026-08-05:

| Candidate | Gzip, measured | vs. today's `dist/present.js` (48.9 KB gzip, measured) | Gravity test |
|---|---|---|---|
| Zustand (vanilla `createStore` only) | **486 B** | 1.0% | Admissible on the letter; documentation and every example is React-shaped (unchanged from prior finding) |
| `@tanstack/store` | **2.2 KB** | 4.5% | Admissible; framework-agnostic core, but this app has no case that needs its derived/computed-store machinery beyond what `PresentationContext.with` already does by hand |
| nanostores (full package) | **2.16 KB** | 4.4% | Admissible; note this is the *whole* package, not one atom — tree-shaking a single atom would be smaller, not measured directly |
| `@preact/signals-core` | **1.95 KB** | 4.0% | Admissible on its own; the *name* is the risk the prior research already named — one line from here to `@preact/signals` to Preact itself |
| `alien-signals` | **1.95 KB** | 4.0% | Admissible; smallest "real" reactive-graph implementation surveyed |
| Valtio (proxy) | **5.78 KB** | 11.8% | **Disqualified** — proxies make mutation invisible to a call-counting observability tool; `flow-trace` measures calls, and a proxy's whole trick is not being one (unchanged from prior finding) |
| Redux Toolkit | **13.58 KB** | 27.8% | **Disqualified as overkill** — normalised-entity-adapter idiom pulls toward a second model of a line existing beside the markdown |
| `@tanstack/query-core` | **11.8 KB** | 24.1% | Right category (server-state caching) for exactly one query and one mutation this app has; not disqualified architecturally, disqualified as overkill, same as prior finding |
| Yjs | **28.16 KB** | 57.6% | **Disqualified for this app today** — see below |
| Automerge (`@automerge/automerge`, wasm) | **~1.2 MB** | **24×** the whole current app | **Disqualified on weight alone** |
| Loro (`loro-crdt`, wasm) | **~1.06 MB** | **21×** the whole current app | **Disqualified on weight alone** |

**On the CRDT family specifically**, because the brief asks for it by name and the calculus really
is different here: the truth in this app is markdown **text**, and every one of Yjs/Automerge/Loro's
real selling point is **concurrent multi-writer editing of one document** — operational transform or
CRDT merge semantics for two people (or two tabs) typing into the same file at once. **[REA]** This
app has exactly one writer per file: the whole-file POST/base/stale-write design in `base.ts` and
`accepted.ts` is built entirely around *detecting* a second writer and refusing, never *merging*
with one — `base.ts:30-33`: *"a client that refused its own save would lose the operator's
characters... his typing still reaches the server; what changes is that a divergence is SAID."* A
CRDT solves a problem this app has explicitly chosen not to have. Applying the gravity test: a CRDT
document **is** a second, richer model of the file living beside the markdown string by
construction — that is the whole mechanism, not a misuse of it — which fails the test harder than a
component tree does, and at 21–24× the weight of the entire app today, this is not close.

**Yjs alone is worth a second look because it is JS-only (no wasm) and 18 KB core per its own
docs**, though the actually-shipped, dependency-resolved figure measured here is 28.16 KB — still
57.6% of the whole current app added for a capability (concurrent multi-writer merge) nothing in
this app's write path wants. **Disqualified on fit, not principally on weight**, though the weight
is not free either.

**No candidate surveyed changes the recommendation.** Every admissible one (Zustand vanilla,
`@tanstack/store`, nanostores, `@preact/signals-core`, `alien-signals`) is small enough that weight
is not the reason to decline it — the reason is invariant 4 (§5): its core feature, subscription,
is the one thing this codebase has bled to avoid, and none of the eleven surfaces' own facts would
get simpler by being held in one of these instead of a hand-written class, because the class is not
the expensive part — the comparison logic (`sameView`, `isNewer`, `extendsLine`, `ANCHOR_TRUST`) is,
and no library ships that.

---

## 7. The recommendation — one slice, not one store

**(a), with one slice.** The eleven (now twelve, counting `RowStore`) surfaces are correct as they
stand, for the reasons in §2 and the invariants in §5, independently confirmed rather than merely
inherited from their own docstrings. The one thing genuinely missing, and the one piece of work this
document recommends:

### 7.1 Consolidate the six declaration `let`s into one `Declaration` value

**Shape:** a plain, readonly, immutable object — not a class with methods, because unlike the eleven
surfaces this fact has no per-key comparison logic, only "the newest one, whole." `DeclaredPresentation`
(`context.ts:88-121`) already has almost exactly this shape; the missing step is that
`applyPresentation` (`index.html:1162-1177`) currently destructures it back out into six separate
`let`s instead of keeping the one object.

```ts
// Illustrative — not shipped by this branch.
let declaration: DeclaredPresentation = presentationFromDeclaration(undefined);
// ...
function applyPresentation(document: unknown): void {
  const declared = presentationFromDeclaration(document);
  for (const problem of declared.problems) console.warn(...);
  declaration = declared;   // ONE assignment, atomic by construction.
}
```

**Read/write contract:** exactly the PULL discipline in invariant 4 — `globalRegistrationFor` and
`resolverContextFor` already build a fresh object from these six facts on every call (invariant 3);
they would read `declaration.qualification` instead of the bare `qualification`, with no change to
when or how often either is rebuilt. **No new caching, no new invalidation, no subscription.**

**How a future component consumes it:** exactly the same way `paint()` already consumes
`presentation` — as a value passed in, read once per call, never held past the call that needed it.
"General for future components" is satisfied by the *pattern*, not by a bigger object: a component
that needs the qualification axis takes `declaration.qualification` as an argument, the same as
`paint()` takes `presentation`.

**Why now rather than never:** `loadPresentation()` is called from exactly one site today
(`index.html:3461`, at boot). The six-`let` shape is harmless *while* that stays true. It is the
kind of thing that is free to fix now and expensive to retrofit later — `loadPresentation`'s own
comment already anticipates a future where the declaration is re-fetched mid-session
(`index.html:1240-1246`, discussing `cache: "no-cache"` and ETag revalidation "every time"). A
second call site to `applyPresentation` is the moment six independent assignments becomes a real
hazard — a crash or an early return between `structural = ...` and `rulesTable = ...` would leave
some axes describing the new document and some the old, with nothing to catch it (§7.2).

**Sizing:** under an hour. It is a mechanical extraction with no behaviour change — `structural`,
`qualification`, `resolution`, `rulesTable`, `presentation`, `indentUnit` become five field reads
off one object instead of five bare identifiers, at the same call sites, in the same order.

### 7.2 Name the pattern, do not build a base class

The eleven surfaces already share a shape — bounded value, own key (path, or `(source, view)`, or
nothing), own drop rule, `take`/`arm`/`offer` doubling as the reconcile — closely enough that it is
worth writing down as a paragraph in `app/present/`'s own conventions (not code, and not this
branch's to add) so a **new** general-purpose surface is built to the same discipline on purpose
rather than by imitation. **Extracting an actual shared base class or generic `Surface<T>` interface
was considered and is explicitly *not* recommended by this document** — five of the eleven differ
enough in what a "key" even is (a path; a `(source, view)` pair; nothing at all for the three
page-singleton surfaces) that forcing a common interface risks the over-abstraction §5's own
invariant 3 argues against, and no scenario was found or written that would prove such an
abstraction saves real code rather than just moving it. Flagged as future work needing its own
traced scenario before it ships, not signed off here.

---

## 8. The traced scenario

**Named, not written**, per instruction. `tests/app-row-store.test.mjs` §6 is the precedent this
scenario should follow — it lifts the real page script (`extractPageScript`/`importPage`,
`tests/fixtures/app-html-page.mjs`), drives a real gesture against a stubbed DOM, and proves the
claim by **reverting the two expressions that read the store** on a separately-imported copy of the
page, watching the acceptance test go red. That is a SHAPE proof, not a value proof — it shows what
called what, not just what the answer was.

**The scenario this recommendation needs, if picked up:** *"a second `applyPresentation` mid-session
updates every declared axis atomically, never five-of-six."* Load the page harness twice against two
different `presentation.json` fixtures in sequence (simulating `loadPresentation` being called
again, which nothing does today but which its own `no-cache`/ETag comment anticipates); between the
two loads, interrupt the assignment (patch a thrown error between two of the six `let` assignments
on an un-consolidated copy, exactly as §6's mutation proof interrupts `rows.ts`'s readers) and assert
that a resolver call made immediately after sees a **consistent** mix — never new `qualification`
paired with old `rulesTable`. On the six-`let` version this scenario is constructible and, if the
interruption lands between two assignments, provably false. On the consolidated `Declaration`
version it is true by construction — one assignment cannot tear. **No existing test file covers
this** — `tests/declaration-drop.test.mjs` is the nearest neighbour and is about a different
question (a config *entry* silently dropped during generation, not a torn read across two loads in
the browser).

---

## 9. Which axis this pins, and which it does not

**TIME**, weakly. §7.1 is "a small point now, fleshed out later" in the most literal sense — it
becomes load-bearing only once a second call site to `applyPresentation` exists, which does not
exist today. Filing it now is exactly the TIME-axis move: cheap before the second call site, more
expensive after.

**Neither VERTICAL nor HORIZONTAL is pinned by this document**, and that should be said plainly
rather than implied. The recommendation does not add a capability → package → module → sink chain
(VERTICAL) — it removes five variable names and adds zero new files. It does not reorder or newly
home any module (HORIZONTAL) — `context.ts` already owns `DeclaredPresentation`; §7.1 asks
`index.html` to keep the object that function already returns instead of destructuring it. **A
document whose one recommendation pins no axis has joined the majority this repo's own numbers
describe, not escaped it** — stated honestly rather than dressed up as more architectural than it
is. The pattern-naming half of §7.2, if it is ever written up as an actual shared abstraction, would
be the first HORIZONTAL move this line of work makes; it is explicitly not proposed here.

---

## 10. What I refuted

1. **The NUL-byte warning in the brief is stale.** `app/present/instance.ts` was measured
   2026-08-03 to carry a stray NUL byte that made plain `grep` silently miss a real import. **[OBS]**
   `git log -- app/present/instance.ts` shows commit `6834d88`, *"fix(present): remove the stray NUL
   byte that breaks grep in app/present/instance.ts (#77)"* — landed after that measurement, before
   this branch's base. A byte-count scan of every file under `app/present/`, `app/present/resolvers/`,
   and `app/index.html` found **zero NUL bytes anywhere**, and `tests/no-nul-bytes.test.mjs` now
   guards the regression. The standing instruction to use `rg`/`grep -a` rather than plain `grep` was
   still followed throughout this survey — it is good practice regardless of whether this particular
   file is fixed — but the specific claim that this specific file lies to `grep` today is false.

2. **"Five variables and one class" (`research-state-and-speed.md` §4) is not merely stale, it
   undercounts by roughly 6×, exactly as the brief suspected** — 29 named holders plus 2 more found
   in this survey (§2), not 5. This is not a refutation of that document's *conclusion* (§0/§10
   below shows it still holds) — it is confirmation that the brief's "roughly six times" framing was
   right and the undercounting is real, not a rounding error.

3. **The coordinator's framing of `rows.ts`'s "one reconcile point" as literally singular is
   over-simplified.** §5 invariant 8: there are at least two pull points (`repaintCurrentView` and
   `commitLine`'s resolver walk), not one, and they can nest. `rows.ts`'s own header is correct about
   *its* reconcile point; generalising it to "the app has one reconcile point, full stop" is not
   supported by the code and this document does not repeat it.

4. **The `~264 KB` figure for `dist/present.js` could not be reproduced and is likely stale or a
   different measurement basis.** **[OBS]** The committed artifact at this branch's base is 200,536 B
   raw / 48,894 B gzip; `dist/vendor.js` (the bundled `markdown-it`/`@simplewebauthn` from
   `research-state-and-speed.md`'s own item 3, which has since shipped) is 157,000 B raw / 55,026 B
   gzip. Neither number nor their sum (357,536 B raw / 103,920 B gzip combined) is close to 264 KB
   under any raw/gzip pairing tried. Used the measured 48.9 KB gzip figure for `present.js` alone in
   §6's weight table, since that is the artifact a candidate store would sit beside.

**What was NOT refuted, and is worth stating precisely because the brief invited refutation:** claim
1 (`rows.ts` is the newest surface and argues against subscription for a stated, costed reason) —
confirmed, `git log` shows it landed the same day as this branch's base commit, and its §6 mutation
test passes live. Claim 2 (eleven surfaces, eighteen `let`s) — confirmed exactly, by direct count.
Claim 3's textual quotes from `research-state-and-speed.md` — confirmed verbatim against the file.

---

## 11. What I could not measure, and why

- **Whether nanostores' *tree-shaken single atom* is meaningfully smaller than the 2.16 KB full-package
  figure used in §6.** Bundlephobia measures the package's declared entry point, not a specific
  import graph after tree-shaking. The gap would not change any conclusion (2.16 KB and "0.9 KB" are
  both well under 5% of `present.js`), so it was not chased further.
- **A live A/B of paint timing with vs. without the `Declaration` consolidation.** There is none to
  measure — §7.1 is a pure rename/regroup with no runtime behaviour change, so there is nothing a
  stopwatch would show, which is itself part of why it is recommended (free) rather than deferred.
- **Whether a shared `Surface<T>` base class would actually reduce code**, mentioned and explicitly
  declined in §7.2. This needs a scenario (named there) and a real attempt against at least three of
  the eleven surfaces before it could be recommended honestly; neither was in scope for a
  research-only branch that changes no application source.
- **The real cost of Automerge/Loro against THIS app's actual traffic pattern** (would the wasm
  payload be lazy-loaded, cached across sessions, etc.). Not pursued because §6's fit argument
  (single-writer app, CRDT solves multi-writer merge) disqualifies the family before weight becomes
  the deciding factor — chasing a more favourable weight number would not change the recommendation.

---

## 12. Ranked list

| # | do this | why | size |
|---|---|---|---|
| 1 | **Consolidate `presentation`/`indentUnit`/`structural`/`qualification`/`resolution`/`rulesTable` into one `Declaration` value, assigned atomically in `applyPresentation`** (§7.1) | Six `let`s are one fact with one writer; the split has no documented reason, unlike every one of the eleven surfaces | under an hour |
| 2 | **Do not adopt any surveyed state-management library** (§6) | Every admissible candidate's core feature (subscription) is the one thing this app's own bug history argues against; every disqualified one fails on weight (CRDTs, 21–24×) or gravity (proxies, normalised stores) | n/a — a decision, not a task |
| 3 | **Write down the eleven-surfaces' shared shape as a convention**, not a base class (§7.2) | Gives "general components and future" a pattern to copy without adding an abstraction no scenario has proven | half a day, and not this branch's to ship |
| 4 | **File the comment-drift in `rules.ts`/`ordering.ts`/`today.ts`/`declaration.ts`/`context.ts`/`graphmatch.ts`** referring to retired names (§4) | Six files' comments describe an architecture `index.html` itself says it left | under an hour, elsewhere |

**Items 1 and 2 are the whole of the operator's ask.** Item 1 is the one piece of new work; item 2
is a documented decision not to add weight or a second path to the screen. Items 3 and 4 are
worth doing and are explicitly not this branch's to do.

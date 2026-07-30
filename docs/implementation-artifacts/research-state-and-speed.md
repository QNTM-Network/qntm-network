# Research: state management, and where the time actually goes

**Status:** research. **No application source changed on this branch.** This document is the whole
of it.

**Branch:** `research/state-and-speed`, based on `origin/main` @ `92f483f` of
`QNTM-Network/qntm-network`.

**The ask, in the operator's words:** *"research for modern state management solutions. Lightweight
and smooth. Basically want things loading quickly and experience being smooth."*

**Those are two questions and they have different answers.** State management is how the app holds
and propagates what it knows. Perceived speed is how long a person waits and what they look at
while waiting. This document answers them separately, because **the measured answer to the second
one has nothing to do with the first.**

**Evidence rule.** Every claim is labelled **[OBS]** (a command I ran, a number a browser or a
profiler produced, output I read) or **[REA]** (reasoned from source I read, cited `file:line`) or
**[REPO]** (a claim this repo makes about itself that I did *not* independently reproduce, and
which is therefore quoted as a record, not as a measurement). No backlog row, docstring or
architecture document is accepted as evidence on its own.

---

## 0. Lead — where the time actually goes

One table. Everything below is the working.

| Where the time goes | Cold | Warm | Evidence |
|---|---|---|---|
| **Waking the Fly machine** (`qntm-graph.fly.dev`, `auto_stop_machines = "stop"`, `min_machines_running = 0`) | **4,278 ms** | 26–43 ms | **[OBS]** |
| **The engine cycle behind every edit** (`POST /app/edit-file` → Fly `POST /cycle`) | **seconds to tens of seconds** — repo record ~10 s; my partial local run 48.9 s | same | **[OBS]** + **[REPO]** |
| markdown-it + the passkey lib off `esm.sh` — 17 requests, dependency chain 4 deep, blocking the app's first line of code | ~440 ms desktop broadband; ~1.2 s measured even with a *warm* HTTP cache | ~100 ms | **[OBS]** |
| CORS preflight (`OPTIONS`) before **every** API call, because the Worker sends no `Access-Control-Max-Age` | 105 ms, **repeated every 5 s** | 105 ms | **[OBS]** |
| Cloudflare Worker round trip (LHR edge) | 78–127 ms | 78–127 ms | **[OBS]** |
| Snapshot payload — 1,069,305 B, of which **741,245 B (69.3 %) is a `graph` blob the browser never reads** | 201 KB gzip / 111 KB brotli on the wire | same, re-sent on **every edit** | **[OBS]** |
| `JSON.parse` of that payload | 3.1 ms (0.7 ms without the dead blob) | same | **[OBS]** |
| **Full repaint on a focus change** — biggest real view (670 lines) | **49 ms p50** desktop; 1.4 ms on the view the app actually lands on | same | **[OBS]** |
| Everything a state library could possibly touch | **< 5 ms** | < 5 ms | **[OBS]** |

**Read the table top to bottom.** The two rows that dominate are both on the server side of the
wire, and neither is a rendering problem. A checkbox tick costs the operator **ten seconds or
more**; a full repaint of the largest view he owns costs **49 milliseconds**. They are three orders
of magnitude apart.

**So the recommendation is: no state-management library.** The app's state is four module-level
`let`s and it is not what is slow. Fix the round trip, fix the CDN, put something on the screen
while waiting, and memoise the painter's *embodiment* (not its *decisions*). Sized list in §8.

---

## 1. How this was measured

**[OBS]** The repo was copied to a scratchpad, served with `python3 -m http.server` on a dedicated
port, and pointed at a stub Worker on a dedicated port. Two sibling agents already held
`:8731`/`:8787`; my rig used its own ports and touched nothing of theirs. The single line changed
in the *copy* was the hardcoded API port (`app/index.html:712-714`) so the two rigs could not collide.
**Nothing in the repo was modified.** The live app was never clicked.

**The fixture is the operator's real vault, not a toy.** `~/qntm` was read read-only and turned
into the exact envelope shape `scripts/graph-sync.mjs:526-538` produces: **77 views, 315,827 bytes
of markdown**, plus the real `graph_state.data` blob read out of `~/.qntm-md/state.db`
(**805,155 bytes in SQLite, 741,245 bytes re-serialised, 1,501 nodes, 460 edges**). Largest views:
`work/everything.md` 670 lines / 66,991 B, `dev/qntm/backlog.md` 337 lines, `dev/qntm/queue.md` 243
lines, `work/outcomes.md` 231 lines.

Browser numbers come from Chrome against the **committed `dist/present.js`** — the artifact that
actually ships — not from the TypeScript sources. Hardware: Apple silicon, 8 logical cores,
`devicePixelRatio` 2. **Every browser number in this document is therefore a desktop best case.**
Where a phone number is given it is labelled **[REA]** with its multiplier stated.

Network numbers come from `curl` against the real production endpoints (read-only: a `GET` that
returns 401, an `OPTIONS` preflight, and the Fly server's unauthenticated `/health`). No write
route was called. No vault byte was changed.

**One honesty note about the base.** The browser measurements were taken against `e31a62b`; the
shell PR (`92f483f`, *"the second bar holds actions"*) landed while this was being written and
rewrote 273 lines of `app/index.html`. **Every `app/index.html` citation below has been re-verified
and renumbered against `92f483f`, and every finding survives it** — the two `esm.sh` imports, all
three hidden sections, `loadState()` still having no callers, `await api("/app/edit-file")` still
blocking, and `.syncing { opacity: .5 }` are all still there. The painter measurements are
unaffected: they ran against `dist/present.js`, which that PR did not touch.

---

## 2. Where the time goes on a load

### 2.1 The cold request is a machine waking up — 4.3 seconds of it

**[OBS]** `fly.toml` (in the sibling monorepo, read read-only) declares `auto_stop_machines =
"stop"`, `auto_start_machines = true`, `min_machines_running = 0`. First probe after idle:

```
GET https://qntm-graph.fly.dev/health
  code=200  dns=0.047  tls=0.070  ttfb=4.277  total=4.278
```

Five probes immediately after: `ttfb` 0.043, 0.029, 0.027, 0.026, 0.027.

**`/health` does almost nothing** — it stats three paths and returns four booleans
(`server/app.py:200-207`). So **4.28 s is the cost of the machine existing again**, before any
graph is read, before any projection is built. **[REA]** `GET /app/graph` pays this *plus* reading
a 2.26 GB `state.db` off a Fly volume and serialising the envelope, so the real cold read is
strictly worse than 4.28 s.

**This is the single biggest number on a cold load and it is a config line, not a code problem.**

### 2.2 A third-party CDN blocks the app's first line of code

**[OBS]** `app/index.html:656-657` statically imports two libraries from `esm.sh`:

```js
import { startRegistration, startAuthentication } from "https://esm.sh/@simplewebauthn/browser@13";
import MarkdownIt from "https://esm.sh/markdown-it@14";
```

Production still ships this: `curl https://qntm.network/app/` returns both URLs. **[OBS]**

`markdown-it` on `esm.sh` is **17 sub-requests with a dependency chain four levels deep**
(`markdown-it@14` → `markdown-it@14.3.0/es2022/markdown-it.mjs` → `entities`, `linkify-it`,
`mdurl`, `punycode.js`, `uc.micro` → `entities/lib/escape.mjs`, `entities/lib/decode.mjs`,
`uc.micro@2.1.0`…). Measured cold, from a fresh connection, each hop is ~110 ms TTFB. **[OBS]**
So the chain is **~440 ms of pure serial latency on a desktop broadband connection** before
`new MarkdownIt(...)` can run.

Measured *with a warm HTTP cache* (all 17 sub-requests served from cache, `transferSize` 0), the
dynamic import of `markdown-it` still took **1,175.6 ms**. **[OBS]** The bytes were free; the chain
was not.

**Because the imports are static, nothing in the module runs until they resolve.** And **[REA]**
every screen in `app/index.html` starts hidden — `#entry` (`:615`), `#graph` (`:630`) and `#app`
(`:636`) all carry `class="hidden"`, and only the module script un-hides one. **So until a
third-party CDN resolves a four-deep module graph, the person is looking at a fixed bar and a
black rectangle.** There is no spinner, no skeleton, no text.

**This also violates the stated constraint outright.** "No CDN dependencies at runtime" and "the
site has a strict content policy" are incompatible with two `https://esm.sh/…` imports on the
critical path. **It matters to load time and it is a finding, not a footnote.**

**What it would cost to fix.** Bundled locally with the esbuild already in `devDependencies`:
**[OBS]**

| module | minified | gzip | brotli |
|---|---|---|---|
| `markdown-it@14` | 148,349 B | 52,351 B | **44,116 B** |
| `@simplewebauthn/browser@13` | 8,983 B | 2,965 B | **2,516 B** |

**~47 KB brotli, in one request, on the connection to `qntm.network` that is already open** —
replacing 17 requests, a new origin, a new TLS handshake and four serial rounds. `scripts/build.mjs`
already emits two committed bundles and CI already fails on a stale one
(`.github/workflows/build.yml`), so the machinery exists.

### 2.3 Every API call pays a preflight, and the preflight is never cached

**[OBS]** The app calls a *different origin* (`qntm.network` → `qntm-signups.lukeannison.workers.dev`)
with an `Authorization` header, which forces a CORS preflight. Confirmed live in Chrome: the first
network event on `/app/` is `OPTIONS http://…/app/graph → 204`.

The Worker's preflight response headers, dumped from production: **[OBS]**

```
access-control-allow-origin: https://qntm.network
vary: Origin
access-control-allow-headers: Content-Type, Authorization
access-control-allow-methods: POST, GET, OPTIONS
```

**There is no `Access-Control-Max-Age`.** `worker/src/util.js:12-20` does not set one. **[REA]**
Chrome's default preflight cache lifetime without that header is **5 seconds**, so in practice
*every* API call the operator makes more than five seconds after the last one pays a full extra
round trip. Measured: **105 ms per preflight** to the LHR edge. **[OBS]**

One header. `"Access-Control-Max-Age": "86400"` in `cors()`. Under an hour of work including a test.

### 2.4 The payload is 69 % dead weight

**[OBS]** The envelope built from the operator's real vault:

| | raw | gzip | brotli |
|---|---|---|---|
| full envelope (as shipped) | **1,069,305 B** | 201,315 B | 110,781 B |
| without `graph` and `locations` | **328,062 B** | 74,653 B | 47,706 B |
| the `graph` blob alone | **741,245 B** (69.3 %) | | |

**The browser reads none of it.** `grep` over `app/index.html` for `snapshot.` returns exactly five
hits — `generated_at` (×3), `views` (×2). `graph` and `locations` appear nowhere in `app/` at all.
**[OBS]** `worker/src/app.js:85-107` forwards `e.graph` and `e.locations` from Fly regardless, and
`graph-sync.mjs:532` ships `locations: {}` with a comment saying read-only display does not need it.

The backlog already knows: `resolve-from-the-model-not-the-text` says *"BOTH ARE ALREADY IN THE
PAYLOAD AND READ BY NOTHING"* and plans a stage 6 that would start reading `graph`. **[OBS]**
**So the answer is not "delete it" — it is "stop putting it on the first-paint path."** Serve it as
its own resource, fetched when a resolution actually needs it. That keeps stage 6 buildable and
takes 126 KB gzip off every load *and every edit*.

`JSON.parse` cost, for completeness: **3.1 ms p50 full, 0.7 ms lean** on desktop. **[OBS]** It is
not the point — the bytes on a phone radio are.

### 2.5 The boot waterfall, warm, with a zero-latency backend

**[OBS]** The real `/app/` page, loaded in a same-origin iframe so its own `performance` entries
could be read, warm HTTP cache, stub backend answering in 0 ms:

```
   47 ms  esm.sh/@simplewebauthn/browser@13   |  esm.sh/markdown-it@14  |  /dist/present.js (12,736 B)
   63 ms  esm.sh × 6  (entities, linkify-it, mdurl, punycode, uc.micro, markdown-it.mjs)
   75 ms  esm.sh × 5  (third level)
   83 ms  esm.sh × 1  (fourth level)
  142 ms  /presentation.json          <- DOMContentLoaded
  927 ms  http://…/app/graph  (dur 42 ms)
```

Even with every byte in cache and a backend that answers instantly, the graph request does not
*start* until 927 ms. **[REA]** The boot is sequential by design — `enterGraph()`
(`app/index.html:1065-1066`) does `await loadPresentation(); await loadGraph();`, with a comment
saying two round trips at sign-in is cheaper than a first paint that changes under the reader.
That reasoning is sound but it costs a serial `presentation.json` round trip (110 ms in production)
in front of the one request that actually matters, and `presentation.json` is **1,244 bytes** that
could be inlined into the page at build time and cost nothing.

### 2.6 The composed budget

**[REA]**, summing **[OBS]** parts.

**Cold, phone, mobile radio** — machine asleep, empty HTTP cache:

| | ms |
|---|---|
| HTML from Pages/Cloudflare (DNS + TLS + TTFB) | 300–500 |
| `esm.sh`: new origin handshake + 4 serial rounds | 600–1,400 |
| `/dist/present.js` + `/presentation.json` | ~200 |
| CORS preflight | 150–250 |
| Worker → **Fly wake** | 130 + **4,278** |
| Fly graph read + 201 KB gzip over the radio | 400+ |
| parse + paint the default view | ~25 |
| **total** | **≈ 6,000–7,400 ms** |

**Warm** — machine awake, cache warm: **≈ 900–1,500 ms.**

**The cold case is dominated by one config line and one CDN.** Neither is state management.

---

## 3. Where the time goes on an interaction

### 3.1 The write path blocks on a full engine cycle

**[REA]** `app/index.html:1008-1036` (`toggleTask`) and `:1038-1055` (`commitLine`) both `await
api("/app/edit-file", …)` and repaint from the response. `worker/src/app.js:178-227` shows what
that awaits:

1. `POST {GRAPH_SERVER_URL}/vault/file` — overwrite the one view
2. `POST {GRAPH_SERVER_URL}/cycle` — **"this is the ~14s step"**, the file's own comment at `:207`
3. return the **whole snapshot again** — all 77 views, all 1.02 MB, including the 741 KB nobody reads

So one checkbox tick = preflight (105 ms) + Worker (130 ms) + Fly write + **a full engine cycle** +
201 KB gzip back + a repaint. **[OBS]/[REPO]**

**What a cycle actually costs.** I could not call the operator's server (it needs `SERVER_TOKEN`,
and running a cycle would mutate his real model). So I ran the real engine against **copies**: his
vault copied to scratchpad, `~/.qntm-md/state.db` copied (1.0 GB), the operator config copied, on
Apple silicon. `run_cycle(config, vault, db, dry_run=True)`, three times: **[OBS]**

```
dry cycle 1: wall=48.86s   dry cycle 2: wall=49.24s   dry cycle 3: wall=49.03s
```

All three abort in the *apply* phase on a schema drift between the 24-July database copy and the
current trunk config (`Node type 'task' does not have field 'link'`), so this is a **partial**
cycle — but it is partial at the *end*, after load, parse and rules. **Forty-nine seconds on
hardware several times faster than a Fly `performance-1x`, on a database less than half the size of
the server's.**

`cProfile` on the same run (profiler overhead inflates wall to 107 s; the *proportions* are what
matter): **[OBS]**

| | cumulative | calls |
|---|---|---|
| `_run_apply_phase` | 94.4 s | 1 |
| `qntm_graph.core.queries.find_nodes` | **93.7 s** | **17,280** |
| `applier._find_node_by_qntm_id` | 86.3 s | 15,035 |
| `traversal._reconstruct_node` | 54.5 s | **28,730,523** |
| `renderer.render` (all 72 views) | 8.9 s | 72 |

**The cycle is spending essentially all of its time doing a linear scan of the whole graph, once
per `qntm_id` lookup.** Rendering all 72 views is 8 % of it. That is a missing index in
`qntm-graph`, and it is the reason a checkbox takes ten seconds.

**This is an engine finding in a website repo.** It belongs to the sibling `qntm` / `qntm-md`
repos and I have not touched them. It is recorded here because **it is where the operator's time
actually goes**, and because the app-side fix (§6.1) is worth doing *whether or not* the engine
gets faster.

Corroborating records, quoted not reproduced: **[REPO]** `server/app.py:50` — the debug-logging
regression *"turns a ~10s cycle into minutes of pure log I/O"*, i.e. the healthy baseline is ~10 s.
`fly.toml` — `shared-cpu-1x` *"gave wild variance on identical work (14s..69s)"*, which is why the
machine is now `performance-1x`.

### 3.2 The POST body is the whole file

**[REA]** `app/index.html:1016` and `:1042` send `{path, markdown}` where `markdown` is the entire
view source. For `work/everything.md` that is **66,991 bytes uploaded per checkbox tick**, on a
phone's upstream. This is correct — the whole file is the write unit and it is what makes the
"never reconstruct markdown from the DOM" rule enforceable — but it is worth knowing it is there.

### 3.3 The repaint — real numbers, real views

**[OBS]** `paint()` from the committed bundle, against real views, Chrome, desktop. "Focus repaint"
= move the cursor, repaint the whole view, force layout — exactly what
`app/present/paint.ts:337-347` does on a click.

| view | lines | paint only | + forced layout | **focus repaint, 560 px** | **focus repaint, 390 px** |
|---|---|---|---|---|---|
| `work/everything.md` | 670 | 20.3 ms | +33.2 ms | **49.0 ms p50** (mean 161, one 749 ms outlier) | 48.9 ms |
| `dev/qntm/backlog.md` | 337 | 9.6 ms | +11.8 ms | **19.8 ms** | 19.5 ms |
| `work/all.md` | 59 | — | — | **3.8 ms** | 3.7 ms |
| `this_week.md` | 23 | 0.6 ms | +0.8 ms | **1.4 ms** | 1.4 ms |

Column width barely matters; **line count is the whole story**. Roughly **0.073 ms per line per
repaint** on this hardware.

**And a cursor move costs two repaints, not one.** **[REA]** Leaving line A fires `blur` →
`settle(true)` (`paint.ts:216`) → the text is unchanged so `applyEdit` returns `null` →
`repaint(fileSource)` (`paint.ts:212`). Then the click handler on line B fires `focus.focus()` →
`repaint(source)` (`paint.ts:345`). **So moving the cursor down one line in `work/everything.md` is
~98 ms of main thread on a desktop.**

**Where the 49 ms goes.** Decomposed, same view, same browser: **[OBS]**

| | ms | memoisable? |
|---|---|---|
| the cascade itself — `classifyLine` + 4 `resolve()` calls for **all 670 lines** | **4.0** | **no, and it must not be** |
| `markdown-it` render of 669 lines | 4.2 | yes |
| DOM construction + `innerHTML` parsing | ~12 | yes |
| layout of 670 replaced rows | ~20–29 | only by not replacing them |

**The architecture's own cost is 4 ms.** Resolving every line against the cascade on every focus
change — the thing the design insists on — is **8 % of the repaint**. The other 92 % is throwing
away and rebuilding DOM that did not change.

Cheap alternatives, measured on the same view: **[OBS]**

| strategy | ms |
|---|---|
| A — build + append into the live node, then layout (**what ships**) | 30.5 |
| B — build into a `DocumentFragment`, one append | 27.6 |
| C — **reuse already-built elements**, one append | 20.8 |
| D — one `innerHTML` of pre-rendered HTML | 21.3 |
| — replacing exactly **one** row element in the painted view | **~3.4 ms** |

A `DocumentFragment` buys 10 %. Reuse buys 32 %. **Replacing only what changed buys 14×** — and
§6.1 shows how to get that without breaking the rule that the cascade is the only decider.

---

## 4. What the app holds today

There is no library. This is the whole model. **[REA]**, `app/index.html` unless noted.

| what | where | who reads it | who writes it |
|---|---|---|---|
| `token` | module `let` + `localStorage["qntm_token"]` (`:717-718`) | `api()` | login, register, logout |
| `graphData` | module `let` (`:790`) — **the entire 1.02 MB envelope** | `paintView`, `markWhereWeAre`, `openDrawer` | `loadGraph`, `toggleTask`, `commitLine` |
| `currentViewId` | module `let` (`:792`) | `paintView`, `markWhereWeAre`, `paintFolder`, `openDrawer` | `paintView`, `loadGraph`, `logout` |
| `presentation` | module `let` (`:684`) — a `PresentationContext` | every `paint()` | `loadPresentation` |
| `focus` | `FocusSurface` instance (`:802`) — **one number or null** | the painter, per line | click, blur, Escape |
| `drawerStops`, `viewButtons`, `drawerIsOpen` | module array / Map / bool (`:856-858`) | the focus trap, `markWhereWeAre` | `buildDrawer`, `openDrawer`, `closeDrawer` |
| **the DOM itself** | `.hidden` on three sections, `.current`, `.done`, `.syncing`, `aria-expanded`, `#freshness.textContent`, `doneBtn.dataset.id` | the reader | eleven scattered call sites |

**Five variables and one class holding a single integer.** That is the state layer.

**What re-renders when.** **[REA]**

- **Focus change** → `paint()` the whole current view. Measured §3.3.
- **Checkbox toggle** → optimistic class flip, then `await` the server, then `paintView()` the whole
  view again from the fresh snapshot (`:1018`).
- **Line commit** → optimistic full repaint from the edited source (`paint.ts:210`), then `await`
  the server, then `paintView()` again (`:1044`).
- **View change** → `paintView()` + `markWhereWeAre()`.
- **Drawer open/close** → CSS class toggles only. `buildDrawer` rebuilds 77 buttons, measured at
  **0.5 ms p50** **[OBS]** — a non-issue.

**What the hand-rolled version actually costs.** Honestly: **almost nothing in time, and something
real in discipline.**

- Time cost: the entire state layer is five assignments. Nothing in §0's table is attributable to it.
- Discipline cost, and this is the true finding: **there are two state shapes and one of them is
  dead.** `render(state)` (`:749-777`) and `loadState()` (`:778-781`) drive the `#app` section
  (`oneThing` / `captures`) from `GET /app/state`. **`loadState` has no callers.** `show("app")`
  appears only inside it. `grep` for `show("` returns three hits: `:780` (inside the dead function)
  and `:1164`/`:1204`, both `show("entry")`. **[OBS]** So `#app`, `#oneThing`, `#restHead`, `#rest`,
  `#captureBox`, `#doneBtn`, `#logoutBtn`, `#appErr`, `capture()`, `done()`, `render()` and three
  event listeners are a complete second application that the shipped flow can never reach. Their
  markup, CSS and listeners still load on every boot.
- Second discipline cost: **truth about "where am I" is written in two places**. `currentViewId` is
  the fact; `#barView.textContent`, `#barFolder.textContent` and the `.current` class on a button
  are copies of it, kept in sync by `markWhereWeAre()` being remembered at three call sites
  (`:941` and `:988`, defined at `:979`). This is exactly the shape a store would fix — and it is currently three
  lines of risk, not a performance problem.

---

## 5. Options, assessed against *this* architecture

**The governing constraint, quoted from `docs/implementation-artifacts/design-presentation-cascade.md`:**

> A resolution is admissible only when every affordance it offers can be expressed as an edit to the
> SOURCE STRING. The app never reconstructs markdown from the DOM.

**The markdown source is the truth; the DOM is a projection of it.** Edits travel projection →
source → engine → new projection. The operator's own position is that React, if it ever arrives,
**interprets markdown** — markdown does not become an import format for a component tree.

**The test I applied to each option: does its gravity pull toward the component tree becoming the
model?** Not "can it be used carefully" — every library can be used carefully — but **which way it
pulls a tired person at 11 p.m.**

### DISQUALIFIED on architectural grounds

**React, Preact, Solid, Svelte, Vue — any component framework.** Not disqualified for weight; Preact
is 3 KB and Solid is faster than the hand-rolled painter. Disqualified because **the component tree
becomes where truth lives**. The moment a line is a `<Line source={…}/>` with local state, the
answer to "what is the markdown now" is assembled by walking components, and the whole write path
inverts: DOM → markdown instead of markdown → DOM. That is the one shape the design forbids, and it
is the *default* idiom of every one of these, not an abuse of them. **`app/present/paint.ts:139-165`
already argues this case for `contenteditable` and reaches the same conclusion for the same reason.**
The operator's "React interprets MD" formulation survives only if React renders *from* the source
string on every paint and never holds a fragment of it — which is precisely today's `paint()` with a
150 KB dependency and a reconciler in front of it.

**Redux / Redux Toolkit.** ~13 KB, a build step, and an idiom (actions, reducers, normalised entity
adapters) whose entire payoff is managing a large normalised client-side store. **The app's store is
one snapshot object and one integer.** The normalised-entity gravity actively pulls *away* from
"the source string is the truth" — a normalised task entity is a second model of a line, and now
there are two.

**MobX / Valtio (proxy-based observables).** Proxies make mutation invisible, which is the opposite
of what a repo whose whole design is "one decider, one write path, observable edges" wants.
`flow-trace` measures **calls**; a proxy's whole trick is not being a call.

**TanStack Query / SWR.** The right *category* — server-state caching, deduping, stale-while-revalidate —
and genuinely relevant to §3.1. But the framework-agnostic core is ~13 KB and it is built around
many small keyed queries. **This app has exactly one query** (`GET /app/graph`) and one mutation
(`POST /app/edit-file`). A cache with one key is a variable. **Not disqualified architecturally —
disqualified as overkill**, and the useful 5 % of it is written by hand in §6.1.

### Admissible, but assessed

**nanostores** (~1 KB brotli, no build step needed, framework-agnostic atoms/maps). Holds a value,
notifies subscribers. Does not own the DOM, does not want to be the model. **Admissible.** What it
buys: `currentViewId` and `graphData` become atoms, and `markWhereWeAre()` stops needing to be
remembered at three call sites. What it costs: 1 KB, one dependency, and a second vocabulary for
five variables. **Verdict: it would tidy §4's "two places hold where-I-am" and nothing else. It
does not appear anywhere in §0's table.**

**`@preact/signals-core`** (~2 KB, fine-grained reactivity, no framework required). Same assessment
as nanostores, plus `computed()` — which would express `currentView = computed(() => graphData
.snapshot.views.find(…))` neatly. **Admissible, same verdict.** Note the *name*: adopting it makes
adding `@preact/signals` and then Preact a one-line step, which is exactly the gravity to be wary
of.

**Zustand** (~1.2 KB). The vanilla store is framework-agnostic and architecturally fine. But its
documentation, ecosystem and every example is React, and it is chosen almost exclusively to hold
state *for a component tree*. **Admissible on the letter of the rule and against its spirit.** No
reason to prefer it over nanostores here.

**Immer** (~4 KB structural sharing). Solves "immutably update a deep object" — the app never
updates the snapshot, it **replaces** it wholesale from the server. **No problem to solve.**

**morphdom / idiomorph** (~4–6 KB DOM-diffing). This is the only library that addresses a number
that is actually in §0's table. It is **not** disqualified: it never derives markdown from the DOM —
it builds the target DOM from the source, exactly as `paint()` does now, and reconciles the live
tree toward it. Truth stays in the source string. What it buys: the 49 ms repaint becomes roughly
the ~3.4 ms single-row measurement. What it costs: 4–6 KB, a dependency, and a diff that has to be
taught which attributes the painter owns. **Admissible and genuinely tempting — but §6.1 gets the
same win in a page of code, with no dependency, and stays legible to `flow-trace`.**

### Keep it hand-rolled and fix X — **this one wins**

The app's state is not slow, is not large, and is not tangled. **What is wrong with it is one dead
half and one duplicated fact**, and both are deletions, not adoptions. The two numbers that hurt are
a server cycle and a CDN. **No library on the list touches either.**

---

## 6. The two fixes that are actually about rendering

### 6.1 Memoise the *embodiment*, never the *decision*

**The rule that must not break:** the painter may build DOM and may not decide; the cascade is
resolved for **every** line on **every** paint. §3.3 measured that discipline at **4.0 ms for 670
lines** — 8 % of the repaint. **It is affordable and it should stay.**

**What is expensive is rebuilding DOM whose answer did not change.** So:

> Keep a per-line record of `(lineSource, resolvedRenditions)` alongside the element that was built
> from it. On repaint, resolve **every** line as now. For a line whose tuple is byte-identical to
> last time, **keep the existing live element in place**. Build only the lines whose tuple changed.

**This is not a second copy of the precedence order.** The painter never *predicts* which lines a
focus change affects; it *observes* that the cascade returned the same answer. The cascade stays the
only decider — it is still asked about every line — and the falsifier in
`tests/flow_scenarios/present_cascade.ts` still holds, because `resolve()` is still called the same
number of times.

**[REA]** Expected effect on `work/everything.md`: 4 ms of cascade + one or two rebuilt rows +
layout of a changed subtree ≈ **5–8 ms instead of 49 ms**, and a cursor move ≈ **10–16 ms instead of
98 ms**. On a phone (**[REA]**, 4–6× multiplier) that is **~30–50 ms instead of ~250–600 ms** —
the difference between "immediate" and "laggy".

Care required: the cache is keyed by line index, so it must be dropped whenever the source's line
count changes; and the golden test (`tests/present-golden.test.mjs`) must still pass byte-for-byte,
which it will, because the *elements* are identical — only their provenance changes.

**Size: half a day.**

### 6.2 Was the earlier claim about full repaint right?

**The claim under test:** *the painter repaints the whole view on every focus change, deliberately,
so the cascade stays the only decider — and that is fine, because the visible jump was a CSS problem,
not a tearing problem.*

**Partly right, and now partly wrong. Both halves, with numbers.**

**Right, and it stays right:**
- It is not a tearing problem. There is no torn state to observe — `paint()` clears and rebuilds
  synchronously, and the cascade is pure.
- The CSS diagnosis was correct and the fix landed: `app/index.html:433-451` gives every child of
  `.viewbody` the same `--row` box, and `:508-537` documents the chip measured at 23.9986 px against
  23.9986 px for a line with none. The jump is gone.
- **On the view the app actually lands on, full repaint is a non-issue: `this_week.md` is 23 lines
  and repaints in 1.4 ms.** **[OBS]** That is why it has never felt slow.

**Wrong, if generalised to the views the vault actually contains:**
- `work/everything.md` is **670 lines** and repaints in **49.0 ms p50, mean 161 ms, with a measured
  749 ms outlier**. **[OBS]** That is **three frames** at p50 on a *desktop*, and a cursor move costs
  **two** of them.
- `dev/qntm/backlog.md` (337 lines) repaints in **19.8 ms** — already over a 16 ms frame budget.
  **[OBS]**
- The threshold, at the measured **~0.073 ms/line**: **a view stops fitting in one frame at ~220
  lines on this desktop.** **[REA]** On a phone at a 4–6× multiplier that threshold falls to
  **~40–55 lines** — which is *most of the vault*. `work/all.md` is 59 lines.

**So: you were right about the cause, right about the fix, and right about the default view. You are
wrong if the conclusion is "full repaint is fine, full stop."** Six of the operator's views are
over 200 lines; his largest is 670. **[OBS]** On a phone, full repaint is a performance problem
today, and §6.1 is the fix that keeps the architecture intact.

---

## 7. Perceived speed — what to do about waiting

Separate question, separate answers. **The measured wait is 4.3 s on a cold load and 10 s+ on every
edit. Nothing here makes those shorter; this section is about what the person looks at.**

**7.1 There is nothing on the screen. Fix that first.** **[REA]** `#entry`, `#graph` and `#app` all
start `hidden`; the module script un-hides one, and it cannot run until `esm.sh` resolves.
**A skeleton is not the first fix — showing anything at all is.** Un-hide a static "opening your
graph…" state in the HTML itself, remove it when the paint lands. Zero JS, zero dependencies, works
before any script executes. **Under an hour.**

**7.2 Skeleton rows for the reading column.** Once §7.1 exists, `#viewBody` can hold a handful of
grey `--row`-height bars, sized by the row geometry that already exists (`--row`, `--row-gap`), so
the column does not jump when content replaces them. The geometry is already stated once
(`app/index.html:433-443`), which is what makes this cheap. **Under an hour.**

**7.3 The app already does optimistic updates — two of them.** Asked for, so: found.
1. **`toggleTask`, `app/index.html:1011-1013`** — flips `.done` and adds `.syncing` *before* the
   `await`, reverting in the `catch` at `:1022-1026`. The comment at `:1002` names it.
2. **`rawInput`'s settle, `app/present/paint.ts:208-210`** — `repaint(markdown)` from the edited
   source immediately on commit, explicitly *"Optimistic, and the same posture the checkbox already
   had."*

**The problem is not that they are missing — it is that they are cancelled by the wait.**
`.syncing` sets `opacity: .5` (`app/index.html:478`) and `box.disabled = true`, **for the ten
seconds the cycle takes.** So the optimistic update shows a half-faded, un-clickable row for ten
seconds and then a full-view repaint. **[REA]** That reads as broken, not as fast.

**7.4 The real fix: stop awaiting the cycle.** **[REA]** The write and the re-projection are two
different things and the browser only needs the first to succeed.

> Split `POST /app/edit-file`. Return as soon as Fly's `POST /vault/file` has accepted the bytes —
> that is the durability the operator actually needs. Kick the cycle off behind it (Cloudflare's
> `ctx.waitUntil`, or a `POST /cycle` the Worker fires and does not await). The browser keeps its
> optimistic paint, drops `.syncing` on the *write* ack, and reconciles later — either by polling
> `generated_at` or on the next navigation.

**This turns a ~10 s blocking wait into a ~250 ms one** (preflight + Worker + Fly write). It costs
one thing and it must be said plainly: **the screen may show the edit before the engine has
reconciled it.** That is already true for the ten seconds the current code waits, so the change
makes the existing window visible rather than creating a new one — and `#freshness` already exists
as the place to say "as of …". **Half a day**, and it is the single highest-value change in this
document.

**7.5 The passkey round trip.** **[REA]** `login()` (`:1146-1155`) is two API calls with a WebAuthn
ceremony between them: `POST /auth/login/options` → `startAuthentication()` → `POST
/auth/login/verify` → `enterGraph()`. **Measured Worker round trip: 78–127 ms each, plus a 105 ms
preflight each** **[OBS]**, so ~400 ms of network. The ceremony itself is Touch ID / Face ID and is
**human-paced, not network-paced** — typically 1–3 s of a person looking at a prompt. **[REA]**
**Then** `enterGraph()` starts, and pays the full cold cost from §2.6, **including the 4.3 s Fly
wake**, with the entry screen still on the display.

**The cheap win is a prefetch: the moment the passkey button is pressed, fire `GET
{GRAPH_SERVER_URL}/health` from the Worker** — waking the machine *during* the human's 1–3 s of
biometric prompt, in parallel with a wait that is already happening. **[REA]** That converts most
of the 4.3 s into time the person was going to spend anyway. **Under an hour** for the Worker side.

**7.6 Caching, honestly.** `localStorage` already holds the token. It could also hold the last
snapshot, letting a return visit paint the last-known view **before** any network call and reconcile
after — a genuine "instant" feel. Two cautions: the snapshot is 1.02 MB raw and `localStorage` is
~5 MB and **synchronous**, so this wants `IndexedDB` or the lean payload from §2.4; and stale
markdown showing as current is exactly the honesty failure this whole project exists to prevent, so
`#freshness` must say so. **Do §2.4 first; then this is half a day.**

**7.7 A phone, specifically.** The viewport meta, safe-area insets, 44 px touch targets and the
drawer's thumb-reach `order` swap are already right (`app/index.html:367-396`). What is *not* right
for a phone is everything in §0's table — 17 CDN requests over a radio, 201 KB gzip per edit, a
4.3 s wake, and a 250–600 ms repaint on any view over ~50 lines. **The phone does not need different
UI; it needs the same fixes, and it needs them more.**

---

## 8. The ranked list

Ranked by measured time returned per unit of work. Every item sized.

| # | do this | why, in numbers | size |
|---|---|---|---|
| 1 | **Stop awaiting the engine cycle in `POST /app/edit-file`** — ack on the vault write, cycle behind it (§7.4) | **~10 s → ~250 ms** on every checkbox and every line commit | **half a day** |
| 2 | **Set `min_machines_running = 1` on Fly**, or wake the machine when the passkey button is pressed (§7.5) | **4,278 ms → 27 ms** on every cold request | **under an hour** |
| 3 | **Bundle `markdown-it` and `@simplewebauthn/browser` locally**; drop both `esm.sh` imports (§2.2) | 17 third-party requests and a 4-deep chain → one same-origin request, ~47 KB brotli. Also **satisfies the stated no-CDN constraint**, which today's code does not | **half a day** |
| 4 | **Show something before the script runs** — a static "opening your graph…" in the HTML (§7.1) | black rectangle → immediate feedback, for the whole 6–7 s cold load | **under an hour** |
| 5 | **Add `Access-Control-Max-Age: 86400`** to `worker/src/util.js#cors` (§2.3) | removes a **105 ms** preflight from every call after the first | **under an hour** |
| 6 | **Take `graph` and `locations` off the first-paint payload**; serve them separately for stage 6 (§2.4) | **1,069,305 B → 328,062 B** raw; **201 KB → 75 KB** gzip, per load *and per edit* | **half a day** |
| 7 | **Memoise the painter's embodiment, keep the cascade deciding every line** (§6.1) | **49 ms → ~6 ms** repaint on the 670-line view; **~250–600 ms → ~30–50 ms** on a phone | **half a day** |
| 8 | **Skeleton rows in `#viewBody`** using the existing `--row` geometry (§7.2) | the 4–7 s wait acquires a shape | **under an hour** |
| 9 | **Delete the dead capture/one-thing half** — `loadState`, `render`, `capture`, `done`, `#app` and its listeners (§4) | removes a second, unreachable state shape; nothing can drift from it once it is gone | **under an hour** |
| 10 | **Inline `presentation.json` into the page at build time** (§2.5) | removes a serial 110 ms round trip in front of the request that matters; the file is 1,244 B | **under an hour** |
| 11 | **Cache the last snapshot client-side and paint before the network** (§7.6) | a return visit paints at ~0 ms and reconciles after. **Do #6 first** | **half a day** |
| 12 | **Index `qntm_id` lookups in `qntm-graph`** — `find_nodes` is 17,280 linear scans and 93.7 s of a 107 s cycle (§3.1) | the cycle is the largest number in this document. **Other repo** — route it, do not do it here | **an arc** |
| 13 | **Adopt `nanostores` for `currentViewId` / `graphData`** (§5) | tidies "where am I" being held in four places. **Buys no measured time.** Listed so it is visibly ranked last, not omitted | **under an hour** |

**Items 1–5 are one working session between them and are, by the measurements, the whole of "it
loads quickly."** Items 7 and 8 are the whole of "it feels smooth." **Item 13 is the only thing on
this list that is a state-management library, and it is last because the measurements put it last.**

---

## 9. What I could not measure, and why

- **The real `POST /cycle` against the operator's server.** It needs `SERVER_TOKEN`, and running it
  would mutate his live model. §3.1 substitutes a real engine run against **copies**, states the
  two biases (faster CPU, smaller and drifted database, aborts at apply), and quotes the repo's own
  ~10 s / 14–69 s records rather than asserting a number I did not produce.
- **The real `GET /graph` on Fly.** Same reason. §2.1 measures the *wake* (`/health`, unauthenticated)
  and reasons that the authenticated read is strictly worse.
- **A real phone.** Every browser number is a desktop best case. Phone figures are **[REA]** from a
  stated 4–6× multiplier and are labelled everywhere they appear. §6.2's threshold arithmetic is the
  one place this matters to a conclusion, and the conclusion holds at 3× as well as at 6×.
- **A genuinely cold HTTP cache in Chrome.** §2.2 composes it from per-request cold `curl` timings
  against `esm.sh` instead, which is the pessimistic direction only for the connection setup.

---

## 10. The one-paragraph answer

**The app does not have a state-management problem.** It holds five variables and a single integer,
and the entire cascade that decides how 670 lines are rendered runs in **4 milliseconds**. What it
has is **a ten-second write path, a four-second machine wake, and a third-party CDN in front of its
first line of code** — and a painter that rebuilds 670 rows when two changed. **Fix those five
things and it will feel fast. Adding a store first would change nothing a stopwatch could see.**

# Where the site actually is — a survey

**Date:** 2026-07-30 · **Base:** `origin/main` @ `91066b7` · **Scope:** research only, no source changed.

Every claim below is labelled **OBSERVED** (a command I ran, a page I loaded, a mutation I
executed) or **REASONED** (read end to end, not executed). Nothing here is taken from a backlog
row, a docstring, or an architecture document — all three are wrong somewhere in this repo, and
this survey names where.

---

## 1. Is the backlog honest?

**No. Three of the ten rows do not survive contact with the code as it stands today.**

Not because the work was not done — it was. Because two rows describe a verification loop that
**cannot run at all** right now, and one row's stated purpose (exactly one markdown
implementation) was violated by the operator's own next commit, in a file no enforcer can see.

| # | Row | Verdict | Evidence |
|---|-----|---------|----------|
| 1 | `launch-coming-soon-site` | **survives** | `curl https://qntm.network/` → `200`, `ssl_verify_result=0`. Loaded in a browser: brand, headline, thesis, email form all render. **OBSERVED** |
| 2 | `secure-with-https` | **survives** | apex `200` over valid cert; `http://qntm.network/` → `301`; `https://www.qntm.network/` → `301 location: https://qntm.network/`. **OBSERVED** |
| 3 | `wire-real-email-capture` | **survives** (with a caveat, §5g) | Worker live: invalid email → `422 {"ok":false,"error":"invalid email"}`; honeypot → `200 {"ok":true}` and no write; `/export` without key → `403`; `/app/state` unauthenticated → `401`. **OBSERVED** |
| 4 | `see-add-web-analytics` | **survives** | beacon + token at `index.html:542`, present on the live page. **OBSERVED** |
| 5 | `share-link-preview-cards` | **survives** | OG + Twitter meta `index.html:9-23`; `https://qntm.network/og.png` → `200`, 53437 bytes, `sips` reports 1200×630. **OBSERVED** |
| 6 | `add-static-evidence-runner` | **DOES NOT SURVIVE** | Row says "`flow-trace verify .` runs them → 7/7 PASS". Today `flow-trace verify .` **exits 2 with no verdict at all** (§2). The runner exists; it does not run. **OBSERVED** |
| 7 | `stand-up-the-typescript-app` | **survives** | `npm ci` → `npm run typecheck` exit 0 → `npm run build` → `git diff --exit-code -- demo/` clean. The committed-bundle staleness gate is real and green. **OBSERVED** |
| 8 | `port-the-renderer-to-typescript` | **DOES NOT SURVIVE** | The Python renderer is gone, but a **second markdown implementation was added the same day** at `app.html:156-159` (`markdown-it@14` from esm.sh, its own `commonmark`+table config) plus a third, hand-rolled line-by-line renderer at `app.html:234-268`. The row's own stated reason for existing — "two implementations of one contract diverge silently" — is now true in the shipped tree. **OBSERVED** |
| 9 | `add-view-and-edit-modes` | **survives** | Loaded `https://qntm.network/demo/`, clicked the toggle: rendered document → markdown source in a textarea, button label flipped `Edit`→`View`. No console errors. **OBSERVED** (see §3 for how weakly this is *enforced*) |
| 10 | `adopt-typescript-flow-capture` | **DOES NOT SURVIVE** | This row *is* the observed half. It cannot execute (§2). The five `expected_flows` and two `forbidden_flows` are unadjudicated; the `verify: PASS` markers against them in `capabilities.yaml` are 2026-07-23 fossils. **OBSERVED** |

Also worth stating plainly: the nested `brand/` member has **four open rows**
(`settle-the-icon-mark` diagnose-ready, `finalise-the-lockup-suite`, `ship-favicon-and-app-icon`,
`document-the-brand-system` all scoped) with four `undeclared` capabilities. `flow-trace queue .`
at the top level returns `queue_length: 0` and never shows them, because `brand/` is a separate
registry member. "Everything is done" is partly an artefact of asking one member.

---

## 2. What the observed half says — it does not run

**`flow-trace verify .` exits 2. So does `capability-rollup`. Neither emits a single line of
stdout.** **OBSERVED**

```
$ uv run --no-project --python 3.12 --with-editable <flow-trace> flow-trace verify <repo>
flow-trace: error: Scenario 'render_and_edit' raised during execution:
  RuntimeError("Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'typescript'
  imported from .../qntm/tools/flow-trace/js/src/transform.mjs")
EXIT=2
```

Cause: flow-trace's JS/TS observer declares `"dependencies": {"typescript": "^5.7.2"}` in
`tools/flow-trace/js/package.json`, and **`js/node_modules` has never been installed**. I walked
the whole Node resolution chain from `js/src/` up to `~` — no `typescript` anywhere. **OBSERVED**

Two consequences, and the second is the one that matters:

1. The TypeScript capture — traced flows, depth-to-sink, canonical routing, declared-vs-actual
   drift — produces **nothing**. Not a partial answer. Nothing.
2. Per this repo's own trap #2, exit 2 is a crash, not a verdict — and **one broken scenario takes
   the whole `verify` run down with it**, including the thirteen static invariants that have
   nothing to do with TypeScript. So today `flow-trace verify .` cannot tell you whether the
   *landing page* is intact either.

The fix is one command in the **tool** repo (`npm ci` in `tools/flow-trace/js/`), not in this one.
I did not run it — it would modify a trunk clone I was told not to touch.

**To get an answer anyway**, I ran the thirteen state predicates directly against a harness that
builds the same `ScenarioState` the scenario builds:

```
13 PASS / 0 FAIL / 0 INFO
```

**OBSERVED.** So the *static* half is genuinely green. It is the *observed* half — the thing the
handoff's opening note is entirely about, the thing adopted "the same afternoon" a week ago — that
is dark. The handoff says "Both halves are live now." One is.

---

## 3. Declared but unenforced — proved by mutation

I mirrored the repo into a sandbox and broke things. Results:

| Mutation | Result | What it proves |
|---|---|---|
| **M1** — delete `.github/workflows/` entirely | `state-deploy-is-push-to-publish` **still PASS** | `push-to-deploy-loop` is enforced by a 14-byte `CNAME` file and nothing else. `state.yaml:57-62` says the predicate "EXTENDS to assert the workflow is present and triggers on push to main". `qntm_network_checks.py:93-108` does no such thing. The amendment was written into the prose and never into the code. (`state-app-is-a-typed-build` caught it incidentally — a different capability doing this one's job by accident.) |
| **M2** — add a second `MarkdownRenderer` under `app/` | **13/13 PASS** | `one-implementation-per-concern` has no enforcer. `assert_markdown_renders_client_side` only checks the *Python* renderer is absent; a second *TypeScript* one is invisible. And `classes.yaml#markdown-rendering`, the canonical-routing check that would catch it, (a) cannot run at all, and (b) would not see `app.html` regardless — `.flow-trace.yaml` includes only `app`, and `app.html` is at the repo root. |
| **M3** — gut `EditorSession.toggle()` so the mode never changes, keeping the names | **13/13 PASS** | `reader-can-toggle-edit-and-view-modes` is enforced by a substring search for the words "view", "edit", "toggle" across `app/` sources (`qntm_network_checks.py:376-377`). The declared flow `main-toggles-mode` would not catch it either — it asserts the call happens, not that it does anything. Actual togglability is held up **only** by the human in-browser check. |
| **M4** — empty `index.html`, leave `app/` intact | **6 FAIL** | The landing-page family (`landing-page-present`, `responsive-meta`, `signature-interactions`, `email-signups-persisted`, `link-preview`, `visits-are-measured`) is sharp and real. |
| **M5** — add `localStorage` to `app/main.ts` | **FAIL** — `editor persists state ... violated by ['main.ts:localstorage']` | The ephemerality absence-invariant is real and correctly scoped. The best enforcer in the repo. |
| **M6** — delete `qntm_network/` and drop the `markdown-it-py` dependency | **13/13 PASS**, `flow-trace queue` still exit 0 | The Python package is a genuine husk (one docstring: *"First package: render"*), not something quietly held up. Safe to remove. |
| **M7** — make `tests/flow_scenarios/static_evidence.py` raise on import | `assert_static_evidence_runner_wired` → **PASS**, message: *"flow-trace verify runs real checks"* | `capabilities-have-runtime-enforcers` checks that two **files exist**. It cannot distinguish a runner that works from one that crashes. That is not hypothetical — it is the repo's state right now (§2): the capability whose whole job is to assert "verify produces real PASS/FAIL" is green while verify exits 2. |

**Scorecard of the twelve.** Genuinely falsifiable: `landing-page-renders`,
`responsive-across-devices`, `signature-interactions-embody-the-thesis`,
`shared-links-render-a-preview`, `visits-are-measured`, `captures-and-persists-email-signups`,
`served-securely-over-https` (a real live probe — but it returns INFO when offline, so it cannot
gate from a train), `app-is-a-typed-browser-application`, and the *ephemerality* half of
`reader-can-toggle-edit-and-view-modes`.

Prose: `push-to-deploy-loop`, `capabilities-have-runtime-enforcers`, the *togglability* half of
`reader-can-toggle-edit-and-view-modes`, the *uniqueness* half of
`demo-renders-markdown-in-the-browser`, and all seven flow declarations.

**Three places where `state.yaml`'s `check:` line overstates its own predicate** (all **OBSERVED**
by reading the two side by side):

- `state-landing-page-present` — check says *"fetch qntm.network → HTML contains…"*; the code reads
  the local file (`qntm_network_checks.py:51`). A page that was never deployed still passes.
- `state-served-over-valid-https` — check says *"http → 301 https; www → apex"*; the code does one
  `GET` of the apex (`:202-218`). The redirects are in fact correct — I curled them — but nothing
  checks them.
- `state-deploy-is-push-to-publish` — as M1.

---

## 4. What exists that no capability describes

Twelve capabilities describe a landing page and a markdown demo. Meanwhile, between 2026-07-17 and
2026-07-28, roughly **1,400 lines** of a different application landed. **None of it appears in any
capability, flow, class, sink, state invariant, or backlog row.** **OBSERVED** (`git diff --stat
613d00b..HEAD`, plus grep across all six declaration files).

| Undeclared | Lines | What it is |
|---|---|---|
| `app.html` | 395 | Passkey login UI, the hosted-graph viewer, the view picker, the clickable-checkbox write path |
| `worker/src/auth.js` | 258 | WebAuthn registration + login + session issuance |
| `worker/src/app.js` | 364 | `/app/*` — state, capture, done, `graph` get/push, `edit` queue, `edit-file` write-through to a hosted model |
| `worker/src/util.js` | 86 | CORS allowlist, session lookup, base64url, RP config |
| `worker/schema-app.sql` | 51 | `users`, `credentials`, `sessions`, `captures`, `graph_snapshots`, `graph_snapshot_views`, `graph_edits` |
| `scripts/graph-sync.mjs` | 310 | Tars the live vault + the operator's qntm-md config, pushes both, runs a cycle on a remote server, untars the result back over the vault |
| `.github/workflows/worker.yml` | 63 | Deploys the Worker to Cloudflare on push to main |
| `docs/architecture/graph-*-plan.md` | 244 | Prose plans; not declarations — nothing derives from them |

The gap is not cosmetic. The declared surface is a brochure. The undeclared surface is
**authentication, the operator's personal graph, and a two-way write path into his live vault** —
i.e. everything with a blast radius. `architecture.yaml` still opens "HONEST SCOPE: a static
landing site".

One notable drift inside it: `graph-hosting-plan.md` says *"Display engine — `app/render/renderer.ts`
(markdown-it), in the browser. **Reused as-is.**"* It was not reused. `app.html` imports its own
copy from a CDN. That is finding §1/row-8, arrived at from the other direction.

Also undeclared and half-landed: `worker/src/app.js:83` and `:185` read `env.GRAPH_SERVER_URL` /
`env.SERVER_TOKEN`, and `graph-sync.mjs:195` requires `cfg.server` — but **no `server/` directory
exists in this repo**, and `server` appears in neither `DEFAULTS` (`graph-sync.mjs:33-39`) nor
`graph-sync.config.example.json`. A fresh copy of the example config cannot run the documented
`cycle` command. **OBSERVED.**

---

## 5. What a visitor or the operator would actually notice

**a. `graph-sync` can overwrite the live vault with no guard.** — *the only item here that can
lose data.*
`node scripts/graph-sync.mjs pull` with no `--to` resolves the target to `cfg.vaultDir` = `~/qntm`
(`:298`), and `serverCycle` step 3 does the same silently (`:288`). `untarInto` (`:232-238`) then
runs `tar -xzf - -C ~/qntm` — no dry-run, no backup, no sanity check on the archive. There is a
`--dry-run` for `push` and none for `pull`. And `graph-server-plan.md` carries its own warning:
*"deleting a file re-projects; emptying a file … is read as authorial line-removal and deletes
those nodes. `rm` safe; blank not."* A truncated archive from a cold-starting server therefore
lands as **node deletions**, not as a failed pull. `worker/src/app.js:184-229` (`editFile`) is the
same hazard one layer up, reachable from a checkbox click in the browser. **REASONED** — read end
to end; deliberately not executed against the live vault.

> **Update 2026-07-30 — closed in `scripts/graph-sync.mjs`, and one link in the chain refuted.**
> Executed against a throwaway vault (never `~/qntm`). The hazard is real and worse than stated in
> one respect, weaker in another:
> - **Worse:** a *complete, valid* archive carrying blank files applied **silently and exited 0** —
>   three files with content became zero bytes and the script reported `pulled projection ->`.
>   That is the blank-is-a-deletion hazard with no error to notice. It is also the exact shape a
>   mismatched engine produces (see §5a-bis below), so the two defects compound.
> - **Refuted:** *"a truncated archive lands as node deletions."* It does not. macOS `bsdtar`
>   writes whole entries only; across truncations at 20/30/…/99% of the stream, **zero** blank
>   files were ever produced. What a truncated archive does is apply its entries up to the cut and
>   then exit 1 — leaving the vault **half-old, half-new** with no record of how far it got, which
>   the next cycle then pushes up as the delta. A real defect, a different one.
>
> Both are now refused before anything is written: the archive is verified end-to-end, unpacked to
> a staging dir, and compared against what is on disk; a snapshot is taken before any apply. See
> `tests/graph-sync-guards.test.mjs`.
>
> **§5a-bis — `graph-sync cycle` could ship config to a mismatched engine.** Not in the original
> survey. `cycle` tars the trunk clone's `apps/qntm-md/config/` and posts it to a server whose
> engine came from the deploy; when the two are from different commits the vault breaks (three
> incidents: a retired `chain` shell key, `node_type_render.yaml` moving into `schema.yaml`, and
> the 2026-07-30 resolution-cascade rewrite). Now guarded against the `deployed` tag, **read from
> the remote on every run** — a plain `git fetch` does not move an existing tag, so a local read
> reports safe exactly when it is not.

**b. `signups.csv` is committed to a public repo and is not gitignored.** It currently holds one
row (the operator's own address, from the 2026-06-27 export test). `git check-ignore` confirms it
is tracked, so the next `curl /export?key=… > signups.csv` commits the real subscriber list.
**OBSERVED.**

**c. There is no favicon. Anywhere.** `https://qntm.network/favicon.ico` → **404**, and none of
`index.html`, `demo/index.html`, `app.html` carries a `<link rel="icon">`. Every tab and every
bookmark shows a blank page glyph. (The brand member already has `ship-favicon-and-app-icon`,
state `scoped` — this is not new work, it is work the top-level queue cannot see.) **OBSERVED.**

**d. `/demo/` and `/app.html` are unreachable from the site.** The live landing page's complete
link set is `#access`, `#top`, and two Google Fonts URLs — nothing else. Two capabilities and two
backlog rows are about a demo page no visitor can find. Whether that is deliberate or forgotten is
a decision, not a bug; right now it is undecided. **OBSERVED.**

**e. `app.html` is off-brand.** It uses `--glow: #7cc7ff` / `--accent: #cfe8ff` on `#07080a` with a
system font stack. `brand/BRAND.md:44-45` declares green `#3ff07f`, black `#0a0b0a`, white
`#e6ebe6`, Inter + JetBrains Mono — which `index.html` and `app/styles/reading.css` both honour.
Commit `4c585a0` ("use the real qntm skin") reskinned the demo and left the actual application
behind. **OBSERVED** — loaded the live page; it is visibly a different product.

**f. The Focus surface is shipped, unreachable, and dead.** `loadState()` is defined at
`app.html:216` and **occurs exactly once in the whole module script** — its own definition. It is
never called. `show("app")` occurs only inside it. Therefore `#app`, `render()`, `capture()`,
`done()`, `#captureBox` and `#doneBtn` can never become visible, and the Worker routes
`GET /app/state`, `POST /app/capture`, `POST /app/done` plus the `captures` table have no caller.
Commit `2f24425` dropped the Focus tab and left the body behind. I checked for the usual
resurrection routes — no `window[...]`, no `eval`, no dynamic dispatch, no other HTML file
referencing those endpoints. **OBSERVED** (lexical reachability scan + repo-wide grep). Either
restore a tab or delete the subsystem; leaving it is how a dead route quietly stays authenticated.

**g. The graph viewer renders markdown line by line.** `app.html:240-268` splits on `\n` and calls
`md.render(line)` per line, so tables, fenced code blocks, blockquotes and multi-paragraph list
items cannot render — each line is its own document. The CSS at `app.html:90-92` styles
`.viewbody table`, for tables this renderer can never produce. **REASONED** — I could not log in
to see it (passkey), but the mechanism is unambiguous from the code.

**h. `content/demo.md` makes a claim CI does not back.** It tells readers *"a check fails the build
if a persistence API ever appears in the app's source"*. `build.yml` runs typecheck, build, and the
staleness diff — there is no flow-trace gate in this repo's CI, and (§2) verify does not currently
run at all. The check exists; the build does not run it. **OBSERVED.**

**i. `app.html` loads both its runtime dependencies from `esm.sh` at page load.** If esm.sh is
slow or down, the operator's application does not boot. It resolved fine today. **OBSERVED.**

**j. Cruft, proven safe to remove by M6:** `qntm_network/` (one docstring, nothing imports it) and
`pyproject.toml`'s `markdown-it-py` dependency (no Python file imports `markdown_it`).

---

## 6. Everything, sized

| Item | Size | Why |
|---|---|---|
| a — guard the vault overwrite (snapshot before extract; refuse an empty/short archive; require `--to` or an explicit `--force`) | **under an hour** | One function, `untarInto` |
| b — `git rm --cached signups.csv` + gitignore it | **under an hour** | Two lines |
| §2 — `npm ci` in flow-trace's `js/`, then re-run `verify` and reconcile the result | **under an hour** | The install is one command; reconciling whatever it then reports is the unknown |
| c — favicon + apple-touch-icon across three pages | **under an hour** | Blocked only on the brand row `settle-the-icon-mark` if he wants the final mark; a placeholder is minutes |
| d — decide and wire (or deliberately not wire) links to `/demo/` and `/app.html` | **under an hour** | A decision plus one line of HTML |
| f — delete the dead Focus subsystem, or restore a tab for it | **under an hour** | Delete is ~60 lines of HTML/JS + 3 Worker routes; restore is one `<button>` plus a call to `loadState()` |
| h — correct the sentence in `content/demo.md` (or add the gate and make it true) | **under an hour** / **half a day** | Correcting is a sentence; adding a flow-trace CI gate is the half-day |
| j — delete `qntm_network/` and the unused dependency | **under an hour** | M6-proven safe |
| §3 — tighten the four soft predicates (`push-to-deploy-loop` to assert the workflow; `landing-page-present` to actually fetch; `runner-wired` to *run* the runner, not stat it; togglability to assert behaviour not vocabulary) | **half a day** | Four predicates, each with a mutation test |
| e — reskin `app.html` to the brand system | **half a day** | Mechanical but touches the whole file |
| g — render whole views instead of line-by-line, reusing `app/render/renderer.ts` | **half a day** | Needs a task-line overlay pass over rendered HTML rather than raw lines — this is also the natural way to close row 8 |
| §1/row-8 — collapse to one markdown implementation: bundle `app.html`'s script through the existing build, delete the esm.sh imports, extend `.flow-trace.yaml`'s capture filter to cover it | **an arc** | It converts `app.html` from a hand-authored page into part of the typed application; the current split is why the principle went unnoticed |
| §4 — declare the application: capabilities for passkey auth, hosted-graph read, hosted-graph write, snapshot production; flows/classes/sinks for the Worker and `graph-sync`; state invariants with real enforcers | **an arc** | The largest and highest-leverage item here. Everything in §5 is a symptom of it |
| §4 — land or excise the `server/` half (`GRAPH_SERVER_URL`, `SERVER_TOKEN`, `cfg.server` all reference something absent from this repo) | **an arc** | Depends on where the Fly service is meant to live — an open decision in `graph-server-plan.md` |
| brand member — four open rows | **an arc** | Already declared and already sized by that member; they just are not visible from here |

---

## 7. The three I would do first

**1. Guard the vault overwrite in `graph-sync.mjs` (§5a) — under an hour.**
It is the only item on this page that can destroy something the operator cannot get back. A
`pull` with no arguments untars a remote archive straight over `~/qntm`, and the project's own
notes say a blank file is read as a deletion instruction. Everything else here is embarrassing;
this one is expensive. Smallest fix, largest downside averted — it goes first on both counts.

**2. Untrack `signups.csv` (§5b) — under an hour.**
Second because it is already-exposed data in a public repo, and because the shape of the mistake
(export to a path that is not gitignored) is set up to repeat with the real list rather than one
address. Two lines, no design decisions, no dependencies.

**3. Restore `flow-trace verify` (§2) — under an hour.**
Third, not first, because it loses nothing — but nothing else in this document is *enforced* until
it works. Right now every `verify: PASS` in `capabilities.yaml` is a fossil from 2026-07-23, one
crashed scenario blanks the verdict for all thirteen static invariants as well, and there is no
flow-trace gate in CI to notice any of it. Fixing 1 and 2 without fixing 3 means the next drift
gets found the same way this one did: by a person reading the code a week later.

The visitor-facing items (favicon, the unlinked demo, the off-brand app) are cheap and worth doing
straight after — but nothing is lost by them waiting an afternoon, and the three above stop a loss
or restore the machine that would have caught it.

---

## 8. What I refuted

- **"Instrumented DECLARATION-ONLY, evidence tier DECLARED, no runtime verifier."** Stale — that
  is what `~/.flow-trace/registry.yaml` still says about this member, but the static-evidence
  runner landed 2026-06-27 (commit `a97f6be`) and its thirteen predicates pass. The registry
  comment is a month out of date. The *true* current state is the opposite of both readings: a
  working static verifier, and a *broken* runtime one.
- **"All ten rows passing."** Three do not survive (§1).
- **"`flow-trace queue .` returns 0, so the tool has nothing to tell you."** The queue is empty
  because the queue only knows rows, and no row was ever written for ~1,400 lines of application
  code (§4). Empty is not the same as done.
- **"The observed half is a week old — run it."** It has never run outside the session that
  authored it. It cannot run today, and the reason is in the tool's repo, not this one (§2).
- **"The site is a static landing site" (`architecture.yaml`, `.flow-trace.yaml` headers).** It is
  a landing page, a markdown demo, a WebAuthn-authenticated single-user application, a
  D1-backed personal graph host, and a write path into a live Obsidian vault.
- **A thing that looked dead but is not:** `worker/src/index.js`'s `/export` route has no caller in
  this repo and looked like a leftover — it is the operator's only way to get the signup list out,
  and returns `403` correctly on the live Worker. Left alone.
- **A thing that looked alive but is not:** the Focus/capture subsystem in `app.html` (§5f). The
  code is present, the listeners attach, the Worker routes answer — and no user can reach any of
  it.

---

### Method

flow-trace was invoked as
`uv run --no-project --python 3.12 --with-editable ~/projects/qntm-network/qntm/tools/flow-trace flow-trace <verb> <abs-path>`
from a scratchpad directory, so no `uv.lock` was written into this repo. Mutations M1-M7 ran
against a `git archive` mirror in that scratchpad; the worktree was never modified.
`git status --short` is clean apart from this file.

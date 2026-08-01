# Design: config is content — where the compile runs, and what has to be true before a user can edit their own system

**Status: design. No application source is modified on this branch. This document is the only file
it adds.**

**Branch:** `design/config-is-content`, based on `origin/main` @ `5bacf44`.

**Evidence rule.** Every claim is **[OBS]** (a command or script I ran, output I read), **[REA]**
(reasoned from source I read, cited `file:line`), or **[REPO]** (a claim an already-merged document
in this repo makes that I did not reproduce). Absence is never proven by a grep returning nothing —
§2.4 and §5.2 are the two places it mattered, and both are enumerations. Sizes are the house scale:
**under an hour** / **half a day** / **an arc**.

**One warning about the numbers, and it is the operator's own.** Every measurement here — 72 views,
186 sections, 94 rules, 134 vocabulary entries, a 139 KB declaration — is **his instance**. They
prove the shape works. They are not bounds. **§8 is a list of every place an existing design quietly
assumes his numbers, and what a second user breaks.**

---

# PAGE ONE — THE ANSWER

## The answer, in one paragraph

**The compile runs in the Cloudflare Worker.** Not in the graph server, because that means writing
the same compiler a second time in a second language, against a principle this repo has already
declared (`docs/architecture/architecture.yaml:135`, `one-implementation-per-concern`). Not in the
browser, because the browser must never be the authority on what a config means. The Worker is
already JavaScript, already has `nodejs_compat` switched on (`worker/wrangler.toml:9-10`) **[OBS]**,
and — the measurement that decides it — **the three compilers are already 92 % portable code**: of
**2,568 lines** across the three compilers and their two helpers, **under 200 touch the filesystem
or the command line** **[OBS]**. The YAML reader (`scripts/yaml-subset.mjs`, 354 lines) and the
refusal ledger (`scripts/ledger.mjs`, 117 lines) have
**zero imports of anything** and would run in a Worker today, unchanged **[OBS]**. The work is not a
port. It is a refactor: **turn `compile(directory)` into `compile(files)`, and give it three callers
instead of one.**

**But the compile is not what is broken, and this is the part to hold on to.** **[OBS] I timed it:
all three compilers, over the operator's real 276-file config, take 0.27 s wall and 0.22 s of CPU**
(`time node scripts/checkdeclarations.mjs`, §11). What is broken is **one line in one file**:
`app/present/embedded-declaration.ts:45` imports `presentation.json` **into the JavaScript bundle at
build time**. That single import is what turns "the user changed their config" into "somebody must
rebuild and redeploy the app". Undoing it is the cheapest step in this document and the one
everything else waits on.

**And there is a third thing, larger than either, which nobody has said out loud.** Config-as-content
is not only "no rebuild". It is **"one configuration per user"** — and today the whole declaration
path is single-tenant by construction: one tracked file (`presentation.json`), one committed bundle,
one push, one config directory on one server (`/data/config`). §8.1.

## The example: a user adds a node type

Here is the whole problem in one gesture. A user decides to track support tickets. They add a node
type `ticket`, a tag `#ticket` that means it, and a view that shows their tickets.

**What happens today, step by step.**

1. **They open a text editor.** There is no user interface for any of this. Config is 283 files and
   10,400 lines of YAML on the operator's laptop **[OBS]**, of which **90 %** is instance data —
   patterns, rules, views, vocabulary — and 10 % is schema. Building the interface is what the
   operator is describing.
2. **The config reaches the graph server** — but not through the app. `scripts/graph-sync.mjs:662`
   POSTs a gzipped tar straight from the laptop to `/config` on the Fly server **[OBS]**. The
   server's own docstring says why that is right: config *"flows like DATA (pushed via graph-sync),
   not code, so a view/rule change takes effect on the next cycle without a redeploy"*
   (`server/app.py:249-252`) **[OBS]**. **This half is already right.** The next cycle understands
   `ticket`.
3. **The browser reloads. The new view appears** — views ride the envelope, and the server re-reads
   the view files from disk on every `GET /graph` (`server/app.py:149-173`) **[OBS]**. So far, so
   good.
4. **And then the app goes silent about it.** Every local answer about that view — which section a
   line is in, what a new line becomes, which tags to seed, how the section sorts — is read from
   `presentation.json`, which was baked into `dist/present.js` at build time and knows nothing about
   `ticket`. `sectionAt` returns `null` for a view not in `sectionOrder`
   (`app/present/address.ts:91-105`) **[REA]**; `membershipFor` abstains with
   `"no-section-declaration"` (`app/present/membership.ts:210-212`) **[OBS]**.
5. **The silence is invisible.** `app/index.html:2442-2444` turns any non-answer into the empty
   string, and the empty string is filtered out of the freshness line **[OBS]**. **An abstention and
   a clean "yes, this still belongs" produce byte-identical output.**
6. **To fix step 4, someone must** run three generator scripts, run `npm run build`, commit a
   **257,317-byte** rebuilt `dist/present.js` **[OBS]**, push to `main`, and wait for GitHub Pages.
   **A user has none of that. They have a browser.**

**So the user's new node type works in the engine, is dead in the app, and nothing tells them.**
Steps 1 and 6 are the product problem; step 5 is the honesty problem; they need different fixes.

## The one line that costs the most

**[OBS]** `app/present/embedded-declaration.ts:45`:

```js
import presentationJson from "../../presentation.json" with { type: "json" };
```

That import landed on 2026-07-31 in `f7a769b`, *"perf(app): bundle vendor libs, inline the
declaration, and cache the preflight"*. It was a good decision and its own header says exactly why:
it removed a **serial** network round trip (~110 ms) in front of the request that actually matters,
for a document its header sizes at **1,244 bytes** (`embedded-declaration.ts:5-13`) **[REPO]** — and
which git records as **3,303 bytes** on disk at that commit **[OBS]**. Either number makes the point.

**The premise has expired, and it is measurable.** **[OBS]** `presentation.json` at that commit was
**3,303 bytes**. Today it is **138,806 bytes** — **42 times larger, in eight days**:

| commit | date | `presentation.json` |
|---|---|---|
| `f7a769b` — the inline lands | 2026-07-31 | 3,303 B |
| `531d4a6` — membership published | 2026-08-01 | 36,603 B |
| `26f20d9` — the resolution table published | 2026-08-01 | 46,773 B |
| `1cbc969` — section registration | 2026-08-01 | 138,878 B |

**[REA] Inlining 139 KB of configuration into a 257 KB JavaScript bundle to save one 110 ms round
trip is now a bad trade on its own terms, before anyone says the words "config is content."** The
bundle is downloaded once and cached; the config is the thing that changes. They have opposite change
rates and they are welded together. Un-welding them is **half a day**, and it is the first moment a
config change can reach a browser with no deploy.

## The four things that must become true

| # | what | why it is not true today |
|---|---|---|
| 1 | The declaration is **fetched**, not baked | `embedded-declaration.ts:45` |
| 2 | The declaration has an **identity**, and every answer says which one it came from | `presentation.json` has no version key **[OBS]** |
| 3 | The compile is a **pure function of file contents**, callable from three places | all three generators walk a directory — 36 fs call sites **[OBS]** |
| 4 | The declaration and the config are **per user** | `presentation.json` is one tracked file; `/data/config` is one directory **[OBS]** |

## The protection that disappears, and this is the finding I did not expect

**[OBS]** `scripts/graph-sync.mjs:267-287` and `:362-451` — **GUARD 2**. Today, config **cannot be
shipped** unless the config tree being sent hashes **blob-for-blob identical** to the config tree at
the `deployed` git tag, read live from the remote. The guard's own header records why, with dates:

> *"If the config and the engine come from different commits the vault breaks. Three times:
> · old config / new engine — a retired shell key … every cycle died …
> · new config / old engine — … the deployed engine found no render forms, fell back to checkbox for
> everything, and wrote that back over the operator's headings.
> · 2026-07-30 — the trunk sat four commits ahead of the deploy … cycles stopped doing anything
> useful."*

**[REA] Read that against the reframe and it is stark. Config-as-content means a user changes their
config while the engine stays exactly where it is — which is the state GUARD 2 exists to refuse.**
And the guard cannot simply be relaxed for users, because **it is made of git**: it compares against a
commit. A user's config is in no repository and has no commit, so the guard has nothing to compare
and no meaning.

**So the strongest single protection on the config path today is one a user cannot have.** Replacing
it is not optional garnish — it is the precondition for letting anyone but the operator write config,
and the replacement is the dry-load gate in §4.3. **That moves the dry-load gate from "nice, later"
to "before a user may write config at all."**

---

# THE DETAIL

## 1. What exists today, measured

### 1.1 The three compilers

**[OBS]** All three live in `scripts/`, are JavaScript, read the operator's monorepo config
directory, and write one key each into one file, `presentation.json` at the repo root.

| generator | lines | writes key | `dropped` rows today |
|---|---|---|---|
| `scripts/generate-structural-declaration.mjs` | 386 | `structural` | 0 |
| `scripts/generate-qualification-declaration.mjs` | 686 | `qualification` | **214** |
| `scripts/generate-resolution-declaration.mjs` | 1,025 | `resolution` | **95** |
| `scripts/yaml-subset.mjs` (helper) | 354 | — | — |
| `scripts/ledger.mjs` (helper) | 117 | — | — |

**[OBS]** `presentation.json` is **138,806 bytes**: `qualification` 63,092, `resolution` 63,091,
`structural` 1,179. **309 dropped rows** across the three. **27 sections published, 116 refused.**

### 1.2 The two paths a config change takes, and only one is a data path

```
DATA PATH (works):
  laptop YAML → graph-sync POST /config → /data/config → next cycle → the ENGINE is correct

RELEASE PATH (a user cannot walk it):
  laptop YAML → node scripts/generate-*.mjs → presentation.json
              → npm run build (esbuild inlines it into dist/present.js)
              → git commit dist/ (257 KB) → git push main → GitHub Pages → the BROWSER is correct
```

**[REA] The same edit triggers both. They have nothing else in common.** The repo already states the
invariant it holds itself to — **"no human in the loop after the push"**
(`docs/architecture/state.yaml:40-58`) **[OBS]**. Config-as-content raises it: **no push in the loop
at all.** That is the whole reframe, in the repo's own language.

**[OBS] Note where the Cloudflare Worker is in that picture: nowhere.** Config goes laptop → graph
server directly. The Worker is in the *graph* path (`GET /app/graph`, `POST /app/edit-file`, proxying
to `${GRAPH_SERVER_URL}`, `worker/src/app.js:173`, `:353`, `:383`) and has **no `/config` route at
all** — proved by enumeration in §2.4. **Choosing the Worker means putting it in the config path,
which is a real cost, and §2.2 prices it.**

### 1.3 The staleness, already filed and already named twice

**[OBS]** `app/present/address.ts:183-187` and `docs/implementation-artifacts/backlog.yaml:2572-2603`
(row `carry-declared-section-order-in-the-server-envelope`, state `diagnose-ready`) both name it: a
live config edit that renames or reorders a section *"can silently outrun the shipped declaration,
with nothing today to detect it."* The backlog row also records why nothing happened: *"filed rather
than attempted, because the app repo cannot change the server."*

---

## 2. Q1 — where does the compile run?

**Answer: the Cloudflare Worker. And the real work is making the compile a pure function first,
which is worth doing even if the answer later changes.**

### 2.1 The measurement that decides it

**[OBS]** The node-only surface across all five files:

| API | call sites | where |
|---|---|---|
| `node:fs` (`readFileSync`, `readdirSync`, `existsSync`, `writeFileSync`) | **36** | 9 structural, 11 qualification, 16 resolution |
| `node:path` (`join`, `resolve`) | ~30 | path assembly only |
| `node:url` (`fileURLToPath`) | **1** | `scripts/monorepo-config.mjs:11,13` |
| `process.argv` / `process.exit` | 5 per generator | inside `parseArgs` / `main` only |
| `child_process` | **0** | — |
| third-party YAML library | **0** | `package.json:20-23` lists only `@simplewebauthn/browser` and `markdown-it` |

**[OBS] `scripts/yaml-subset.mjs` has zero imports and zero `process` references.
`scripts/ledger.mjs` has zero imports.** Both run in a Worker today with no change. The YAML reader
takes a `path` argument used **only for error messages** (`yaml-subset.mjs:346`).

**[OBS] And the Worker already declares `nodejs_compat`** (`worker/wrangler.toml:9-10`,
`compatibility_date = "2026-06-01"`), for `@simplewebauthn/server`. So even the node builtins would
resolve. **[REA] That removes the last technical objection, but the refactor is still right: a
compile that depends on a filesystem cannot take its input from an HTTP body.**

**[REA] So the "port" is: change each generator's entry from taking a directory to taking a map of
filename to text.** The three entry points are already exported —
`generateStructural` (`generate-structural-declaration.mjs:267`), `generateQualification` (`:548`),
`generateResolution` (`:942`) — and each already accepts an injected `Ledger`, so the shape of
"inject a dependency" is established in the file. **Under 200 of 2,568 lines is the whole delta.**

### 2.2 The four candidates, priced

**(a) The graph server, in Python. Refuse.**

**Cost: rewrite 2,568 lines of JavaScript as Python, then keep the two in agreement forever.**

**[OBS]** `docs/architecture/architecture.yaml:135-147` declares `one-implementation-per-concern`,
and its stated rule is the argument: *"Two implementations of one contract diverge, silently, and the
divergence surfaces as a bug in whichever one you were not looking at."*
`design-the-structural-language.md:470-473` says the same about this same surface: *"Two interpreters
of one language is precisely the MVC violation this project keeps finding and removing."*

**[REA] And it is worse than an ordinary duplicate, because of what it would spend.** The JavaScript
compiler's answers are checked against the engine by three **Python** agreement scripts that already
exist — `scripts/qualification-agreement.py`, `scripts/resolution-agreement.py`,
`scripts/day-boundary-agreement.py` **[OBS]**. Those are the reason the JavaScript compiler is
trustworthy: an independent implementation, in the engine's own language, running the engine's own
machinery, asserting equality. **Move the compiler into the graph server and the thing being proved
and the thing doing the proving share a process, a language and a config loader. The agreement test
stops being independent.**

One honest point in Python's favour, recorded because it is real: the compile would sit next to the
config it reads and next to the loader that must accept it, so compiling and dry-loading could happen
in one place. §4.3 keeps that benefit without the port.

**(b) The Cloudflare Worker, in JavaScript. Take it.**

**Cost: §2.1's refactor (an arc), a per-user store (half a day), the browser fetch (half a day), and
— the cost that is easy to miss — the Worker becomes the config WRITE path, which it is not today
(an arc).**

Why it fits, in five facts:

* **Same language, same code.** One compile module, three callers: the CLI (unchanged, for the
  operator and CI), the Worker (authoritative), the browser (preview only, §3). This is the pattern
  the repo already names — `app/present/paint.ts:1055`, *"two callers, not two implementations."*
* **It already rebuilds the envelope.** `worker/src/app.js:126-160` and `:183-193`, `:392-402`. A
  declaration version is one more field on a path that already exists.
* **The refusal ledger comes free.** `ledger.mjs` is pure, so the Worker gets `dropped` in the same
  call that produces the table. That is what makes Q4 a wire rather than a feature.
* **`nodejs_compat` is already on.** No platform work.
* **It is per-user by nature.** The Worker already keys graph snapshots by `user_id` in D1
  (`worker/schema-app.sql:97-109`, `worker/src/app.js:480-487`) **[OBS]**. A committed
  `presentation.json` cannot be per-user. This is the point that actually decides it — §8.1.

**The cost that is not free, stated plainly.** The config path today is laptop → graph server, and
the Worker is not on it. Putting the Worker on it means the Worker forwards config to the graph
server as well as compiling it — **which is what you want** (one write path, two gates, §4.3) and is
still new surface with new failure modes.

**(c) The browser. Refuse — but the reason on the table is wrong.**

The brief says the browser is *"forbidden; that is an interpreter, ruled out three times."*
**[REA] I refute the reasoning and keep the conclusion.** Running the *same* compile module in the
browser is not a second interpreter — it is the same implementation with a third caller, which is
what §2.2(b) argues *for*. The real reasons to refuse the browser as **authority** are different and
stronger:

1. **Nothing pins what a browser compiled.** The declaration is compared byte-for-byte by `--check`,
   and `ledger.mjs:80-84` sorts its keys precisely so the comparison is stable and the diff readable.
   A table computed fresh in each browser has no such artefact.
2. **The compile must happen once per config change, not once per page load.** It is the moment the
   `dropped` record is produced, and that record is a statement about a change, not about a session.
3. **A browser cannot gate its own config.** Validation before effect has to happen where the write
   lands, not where it was typed.

**So the browser may run the compiler as a PREVIEW and must never trust its own output** — which is
the local-answer/server-wins/difference-is-said rule this project already applies everywhere
(`design-the-resolution-architecture.md:1033-1041`) **[REPO]**.

**(d) Something else — considered and rejected.** Compile at **cycle time**, in the graph server, by
shelling out to node. No port, one implementation. **[REA] Refuse:** it makes the graph server depend
on a node runtime inside an image whose Dockerfile asserts *"All pure-Python — no gcc/system libs"*
**[OBS]**; it puts the compile behind the ~14-second cycle (`worker/src/app.js:382`) for a table that
needs no graph at all; and something still has to deliver the result to the browser. The Worker has
to be on the path regardless.

### 2.3 What the Worker option costs that today's arrangement does not

* **A third caller is a third place the compile can be a different version.** Mitigated the way the
  repo already mitigates it: `--check` compares the whole generated object including `dropped` and
  exits 1 on disagreement (`generate-qualification-declaration.mjs:647-665` and its two twins)
  **[OBS]**, and `.github/workflows/build.yml:81-114` runs `checkdeclarations.mjs` on every push and
  pull request, treating exit 3 as *"NOTHING WAS CHECKED … It is NOT a pass"* **[OBS]**. Extend that
  to compare the Worker's output against the CLI's over a fixture config and the third caller is
  pinned by machinery that already exists.
* **The Worker becomes something that can be wrong about a user's whole system.** That is Q2, and it
  is why §4 is longer than §2.
* **`yaml-subset.mjs` becomes user-facing.** It **refuses** tabs, multi-document streams, anchors,
  aliases, merge keys, explicit keys and block scalars, by throwing (`yaml-subset.mjs:95-122`)
  **[OBS]**. Its header states the posture: *"None of those appear in the config today; a config that
  starts using one gets an exception, not a wrong answer."* **[REA] Right posture, wrong audience.**
  A user typing into a form does not read exceptions. §8.4.

### 2.4 The Worker has no `/config` route — proved by enumeration

**[OBS]** Every route the Worker serves, from the three dispatch tables
(`worker/src/index.js:18-87`, `worker/src/auth.js:250-254`, `worker/src/app.js:518-542`):

`OPTIONS *` · `POST /auth/register/options` · `POST /auth/register/verify` ·
`POST /auth/login/options` · `POST /auth/login/verify` · `POST /auth/logout` · `GET /app/state` ·
`POST /app/capture` · `POST /app/done` · `GET /app/graph` · `POST /app/edit` ·
`POST /app/edit-file` · `POST /app/graph` (operator) · `GET /app/edits/pending` (operator) ·
`GET /export` · `POST /`.

**Sixteen routes; none of them is `/config`.** The string `config` occurs in `worker/src/` on
exactly five lines and **every one is a comment or an error message** (`util.js:36`, `app.js:74`,
`:98`, `:106`, `:317`) **[OBS]**. Config reaches the server at `graph-sync.mjs:662`, from the laptop,
bypassing the Worker entirely.

---

## 3. Q3 — should a config edit front-run?

**The operator's position is: no. I refute the sentence and confirm the decision underneath it.**

"Front-run" is being used for three different things, and they have three different answers.

| what front-runs | answer | why |
|---|---|---|
| **the characters of the config edit itself** | **yes, obviously** | it is a text surface; typing must appear as it is typed, like any line edit |
| **the VERDICT — does this compile, and what does it drop** | **yes, and this is the valuable one** | the compiler is a pure function; the browser can run it on the draft and answer before the user saves. It is a statement about the config, not a guess about the graph |
| **the EFFECT on the graph — re-sorted, re-filtered, re-typed views** | **no** | this is the operator's point and it is right |

**Why the third is right, in his own numbers.** A line edit's blast radius is one line. A config
edit's is every printed row in every view. And the app's local answers are already demonstrably
partial: **27 of 186 sections have a published qualification; 116 are refused** **[OBS]**.
Front-running a config change would mean redrawing everything from a table that is confident about
15 % of it. **[REA] A wrong guess about one line costs one line. A wrong guess about the whole graph
costs the user's trust in every row, and they have no way to tell which rows were guessed.**

**The rule already exists and this is a new application of it, not a new rule.**
`design-local-behaviour-and-the-queue.md:668-681` **[REPO]**: *"local computation may change the
SOURCE STRING only when it is a replay of the operator's own gesture. Everything else may change only
the SCREEN."* A config edit is not a replay of a gesture over any line, so it changes no source and
predicts no row.

**And the second row is what makes the third bearable.** Waiting with no information is a shortfall.
Waiting while the app says *"this compiles, it changes four sections, and one of your two new rules
will not show up until the next cycle"* is not waiting — it is a receipt. **[REA] The honest design
is not "config does not front-run". It is "config front-runs its own meaning and never its own
consequences."**

**One thing this does not license.** The preview must be produced by the same compile module the
Worker runs, never by a browser-shaped approximation of it. The moment the browser has its own idea
of what compiles, §2.2(c)'s first reason applies to the preview too.

---

## 4. Q2 — the config write path, and what protects it

### 4.1 What the line-edit path actually has — and three of the five are thinner than they look

**[OBS] Before mapping them across, correct the picture of what exists.**

* **The base compare does not prevent anything.** `app/present/base.ts:274-284` returns
  `current`/`stale`/`writing`/`unknown`, and `app/index.html:2537` reads it — then **POSTs anyway**
  (`:2568`). The client reports; it does not refuse.
* **No deployed server answers 409.** `worker/src/app.js:364-366` says so in its own comment: *"no
  deployed graph server answers 409 today, so this branch is unreachable in production"*.
  `POST /vault/file` on the graph server is an unconditional write.
* **There is no local write queue.** `app/present/queue.ts`'s `ProjectionQueue` queues **incoming
  projections** — reads — at most one per path (`:113-126`) **[OBS]**. A write is a single `await`
  with no retry and no persistence (`app/index.html:2568`). The persisted queue that does exist is
  the Worker's D1 `graph_edits` table, and it serves a different route (`POST /app/edit`).

| protection | what it really is | transfers to config? |
|---|---|---|
| **base compare / 409** | a client-side *sentence*; the server half is unbuilt | **yes, and it must become real AND stronger** — §4.2 |
| **the write token** | `mintWriteToken` (`correlation.ts:152-162`), echoed back as `writes`, matched per path with a 3-arrival grace (`:339-362`) | **yes, and it must carry the verdict** — §4.4 |
| **held characters** | `held.ts` — a record with **no line index, deliberately** (`:36-42`), so it can be reported and never replayed | **yes, and it matters more**; losing a page of config is worse than losing a line |
| **the cursor anchor** | `${view}/${section}/${token}`, resolved in trust order `instance → node → relative → text` (`instance.ts:278`, `:338-380`) | **yes, unchanged** for the config editor as a text surface — but see §6, where the anchor is what a config change *breaks* |
| **the projection queue** | queues reads, one per path | **no.** A config change is a different kind of arrival — §6 |

### 4.2 The precondition must be on the BUNDLE, not the file

**[REA] This is the one protection that has to change shape, and the reason is a property of config
that markdown does not have: config files reference each other.**

A view's `qualification` names a pattern in `patterns/`. A section's defaults name a field in
`schema.yaml`. A vocabulary token names a node type. **Two edits to two different files can each pass
a per-file base compare and together produce a bundle that does not load.** A markdown file has no
such coupling — which is why a per-file sha is sufficient there and insufficient here.

**So the config precondition is a bundle version, not a file hash.** A write says which bundle
version it was computed against; the Worker refuses if that is not current, exactly as a 409 refuses
a stale line, and the user's characters are held. **[REA] It is also the cheapest answer to multiple
tabs and multiple devices, which a hosted product has and a laptop does not.**

**And the server side must become real.** Step 13 of the existing architecture landed the Worker's
half and the client's answer against a fixture; `POST /vault/file` still writes unconditionally
**[REPO]** (`design-the-resolution-architecture.md:1380-1386`). For markdown that is a filed gap. For
config, an unconditional write is `shutil.rmtree` — see §4.5.

### 4.3 Validation before effect — two gates, and neither alone is enough

**Today there are zero gates.** **[OBS]** `server/app.py:247-264` in full is: authenticate, extract
the tar with `filter="data"`, `shutil.rmtree(CONFIG)`, rename the new tree into place, return
`{"ok": True, "yaml_files": N}`. **No YAML parse. No schema check. No bundle load. No dry run.** A
syntactically broken config is accepted with `ok: True` and fails later, inside `POST /cycle`.

**Gate 1 — the compile, in the Worker.** Fast, and free: if `parseYamlSubset` throws or a generator
raises `GenerationError`, refuse the write with the reason. It is the same call that produces the
table.

**Gate 2 — a dry load, on the graph server. [REA] Gate 1 is necessary and NOT sufficient, and this
is the most important sentence in §4.** The JavaScript compiler and the Python engine read the same
files and accept different things. `yaml-subset.mjs` deliberately refuses forms PyYAML accepts, and —
the direction that matters — it certainly **accepts** forms the engine will reject, because it does
not know the schema. **A config that compiles in the Worker can still stop the cycle.** The only
authority on "does this bundle load" is the loader.

**The mechanism exists; it has never been a route.** `orchestrator.py:5344-5346` opens the
transaction *before* the bundle load precisely so a failed bundle can fall back to a cached snapshot
**[OBS]**, and every research rig in this repo loads a real bundle read-only and rolls back
(`design-the-rule-mirror.md:926-934`) **[REPO]**. A dry-load endpoint is that shape, promoted.

**[REA] And gate 2 is the replacement for GUARD 2.** Today the only real protection on the config
path is a git comparison a user cannot have. Gate 2 answers the same question — *"will the live
engine accept this config?"* — by asking the live engine instead of asking git. **That is why it must
exist before a user may write config, even though it is the most expensive step here.**

So config takes effect only when both gates pass, and the user sees two failures with two sentences:
*"this is not valid configuration"* (instant) and *"this is valid, and your system will not start
with it"* (a moment later).

### 4.4 The receipt must carry the verdict, not just the acknowledgement

A line-edit receipt answers *"did my write land"*. A config receipt must answer four things:

1. it landed, and this is the new bundle version;
2. it compiled, and here is what the app can now say that it could not before;
3. **it dropped these N things, and these are new since your last save** — §5;
4. the engine has, or has not, accepted it yet.

**[REA] Point 3 is a delta, not a total.** `dropped` is currently a total of **309 rows** **[OBS]**.
Handing a user 309 rows because they added one rule is the same silence with more words.

**One concrete trap on the way. [OBS]** `worker/src/app.js:126-133`: the Worker rebuilds `snapshot`
from a **fixed key list** — `version`, `generated_at`, `views`, `graph`, `locations` — and *"anything
the graph server adds is DROPPED by default"*. The comment records this as **measured**: a graph
server emitting `writes` produced a browser envelope with no `writes` in it at all, and held rows
stayed held for want of a field that was on the wire. **A declaration version added server-side would
be swallowed exactly the same way.** The fix is the existing `echoFields` pattern
(`worker/src/app.js:147-160`), and the trap is worth naming because it has already been sprung once.

### 4.5 Getting back — and today there is nothing to get back to

The operator's framing is exact: the markdown has the graph as a backstop; config has nothing. **It
is worse than "nothing".** **[OBS]** `server/app.py:261-263`:

```python
if CONFIG.exists():
    shutil.rmtree(CONFIG)
tmp.rename(CONFIG)
```

**The previous configuration is deleted.** Compare the vault push, which stages and swaps with the
same pattern but at least mirrors a directory the operator also holds locally; and compare
`graph-sync.mjs:255-260`, which takes a **snapshot before a pull** because that is *"one line of
output"* against something *"the operator cannot get back"* **[OBS]**. **The config push has no such
snapshot.** Today only the operator can push config, and his laptop is the backup. A user has no
laptop.

Three mechanisms, in order of what they buy:

1. **Config is versioned and append-only.** Every accepted write mints a version; the previous is
   kept. Nearly free once §4.2's bundle version exists — the version is already there; the only
   addition is not deleting the old tree.
2. **A last-known-good bundle, and a load failure falls back to it and SAYS so.** **[OBS] Half of
   this exists:** `_load_with_fallback` with `BundleCache(conn)` (`orchestrator.py:5346`) reuses a
   cached bundle for a cycle when a new one fails, and the cache is content-addressed by a sha256 of
   each file's bytes (`persistence/bundle_cache.py`, `bundle/parsed_yaml.py:43`) **[OBS]**. **[REA]
   But that saves the CYCLE, not the CONFIG.** The files on disk are already gone. The missing half
   is retention on the write path, not fallback on the read path.
3. **A revert is an ordinary config write**, through both gates, with the same receipt. **[REA] A
   rollback that bypasses validation is a rollback that can land a bundle the engine never accepted.**

**What must not be built:** an automatic recovery that reverts a user's config because a cycle
failed. Same error the reconciliation layer already refuses —
`design-the-resolution-architecture.md:1033-1041`, *"the reconciliation layer's output is a
statement, never an edit"* **[REPO]**. Offer the revert; never perform it.

---

## 5. Q4 — what a user is told

**Yes, it is right, and it is the most valuable property in this document. The mechanism already
exists, is already generated, and is read by nothing.**

### 5.1 It exists

**[OBS]** `scripts/ledger.mjs` — 117 lines, added 2026-08-01 in `108fd82`. Its header states the
operator's own acceptance test as three outcomes and names the third as the only failure:

> picks it up — generalised
> refuses it visibly — honest and incomplete, and it must SAY SO
> silently ignores it — the dangerous one

**[OBS]** Today it holds **309 rows** across **22 numbered drop paths** in three generators. The
wording is already in the right voice (`ledger.mjs:95-99`):

> *"The app will say nothing about them. This is recorded, not an error — but if one of these is a
> change you just made and expected to see, this is why you cannot."*

And some rows are already the sentence a user needs. **[OBS]** `presentation.json:4094`:

> *"rule 'auto-habit-without-routine-children-reverts-to-task': its pattern
> 'auto-habits-without-routine-children' traverses the graph (1 step(s)), which this generator does
> not read, so whether it retypes a new line was not evaluated"*

**That is "this rule works, but it will not feel instant" — written by a machine, about a rule the
operator wrote, this morning.**

### 5.2 It is read by nothing — proved positively

**[OBS] Enumerated, not grepped for absence.** `dropped` is produced by all three generators
(`:376`, `:667`, `:1004`), parsed into typed fields by all three readers
(`app/present/structural.ts:130-146`, `qualification.ts:148`, `resolutiontable.ts:194`), and:

* `grep -rn "dropped" worker/` → **zero hits**.
* In `app/index.html` the string `dropped` occurs on **10 lines and every one is prose in a
  comment** (`:698, :1133, :1553, :1696, :2059, :2079, :2602, :2615, :2750, :3231`). There is no
  `.dropped`, no `["dropped"]`, no `dropped[`.
* Outside the three reader modules, `.dropped` appears only in tests, and every one of those tests
  exercises the **generators**, not the app.
* The page keeps three fields off the declaration (`app/index.html:1067-1069`) and then touches only
  `qualification.sectionOrder`, `qualification.sections`, `resolution.chromeShapes`,
  `resolution.sectionRegistration`, `resolution.ordering`, `resolution.orderingFields`.
* `app/present/qualification.ts:144-146` says it in the type's own docstring: *"this is not read to
  DECIDE anything: the app's behaviour is identical with it present or absent."*

**[REA] So the product step is not "build a mechanism". It is "wire the mechanism that exists to a
sentence a user reads."**

### 5.3 Three changes, and the third is a real design addition

**1. Scope it to the edit.** The receipt carries what is new since the last version, not all 309.
`checkdeclarations.mjs:80-83` already computes `NEWLY DROPPED` and `NO LONGER DROPPED` **[OBS]** — the
diff exists and is printed to a terminal nobody but the operator sees.

**2. Say what it means for the USER, not for the generator.** *"which this generator does not read"*
is accurate about the compiler and does not answer the user's question, which is *"will I see this
as I type, or do I wait?"*

**3. Split two things the ledger currently blends.** A dropped row today can mean either of two
opposite things:

| kind | the sentence the user needs |
|---|---|
| **the app cannot, the engine can** — e.g. a rule whose pattern traverses the graph | *"This works. It will appear after the next cycle rather than as you type."* |
| **neither can** — e.g. `presentation.json:4100`, a section default naming a value **no vocabulary tag spells**, and the row itself says *"the engine prints no tag for it either"* | *"This will never appear on a line. Add a tag that spells it, or the value stays invisible."* |

**[REA] Those are opposite messages sharing one row shape.** The first is a performance note; the
second is a defect in the user's own config that only the compiler can see. Adding a `kind` to a
ledger entry is small, and `design-the-vocabulary-mapping.md:518-548` already enumerates **six** kinds
of row against this exact requirement **[REPO]** — that table is the specification, written for one
kind of config, and it generalises.

### 5.4 The honest limit

**[REA] The ledger records what the COMPILER could not express. It is not a complete list of what
will not feel instant.** A section can be fully published and the app still wrong about a line,
because the answer depends on the graph. The ledger is a **floor**, the same way a sampled rule
closure is a floor (`research-the-resolution-universe.md:787-791`) **[REPO]**. **Say "at least
these", never "only these."**

---

## 6. Q5 — what a config change does to a live session

**A config change is a DIFFERENT KIND OF ARRIVAL, and the queue, the anchor and the held strip do not
cover it.** They were built for a new projection of the same file: the words change, the meaning does
not. **A config change is the reverse — the words are identical and the meaning is different.**

### 6.1 Three cases, easiest to worst

**Case 1 — a section is renamed. Loud, and survivable.** The anchor is `${view}/${section}/${token}`
(`app/present/instance.ts:165`, `:235-246`) **[OBS]**. Rename a section and every anchor fails to
resolve at once; `resolveInstanceAnchor` falls through `instance → node → relative → text`
(`instance.ts:278`) and mostly returns `absent`. **[REA] That is the anchor doing its job for a
reason it was not designed for, and it is the good case: a visible, total failure.**

**Case 2 — sections are REORDERED. Silent, and wrong. This is the dangerous one.** **[OBS]**
`app/present/address.ts:91-105` resolves a section by counting headings to an **ordinal** and then
indexing the declared order: `order[ordinal]`. Reorder two sections in config and **every ordinal
stays valid and every ordinal means something different.** Nothing fails. `sectionAt` returns a
confident, wrong section id; `membershipFor` answers confidently about the wrong section. The trap
has already been named in this repo in a neighbouring form
(`docs/architecture/capabilities.yaml:1691`, *"THE TRAP, MEASURED RATHER THAN ASSUMED"*) **[OBS]**,
and the backlog row at `backlog.yaml:2591-2594` says a live config edit *"can silently outrun the
shipped declaration, with nothing today to detect it."*

**Case 3 — an in-flight write, seeded under the old config.** **[OBS]** `newline.ts` seeds a new
line's characters from `resolution.sectionRegistration[view][section].tokens` — the characters the
engine itself would print. A line seeded under declaration N and committed after N+1 lands carries
tokens the new config may no longer spell. **The base compare cannot see this**: it compares the
file's content (`base.ts:274-284`), not the declaration the edit was computed against.

### 6.2 What is needed, and the cheap correct version

The full answer is a declaration version on the envelope, echoed on every write, with the server
refusing a write computed against a superseded declaration. **[REA] Right, and not the first thing to
build.**

**The cheap correct behaviour is: on a version change, ABSTAIN everywhere, then re-derive.**
Abstention is already a supported, tested, reasoned state — `membership.ts:75-80` declares five
abstention reasons and `ordering.ts:103-109` five more **[OBS]**. Saying nothing is always safe;
saying the wrong thing confidently is the failure. So:

1. the envelope carries the declaration version — **and the Worker must be taught to carry it, or it
   is dropped by the fixed key list** (§4.4);
2. the app compares it with the one its answers came from;
3. on a difference: every local answer abstains with the reason *"the configuration changed"*, and
   the app re-derives;
4. a seeded-but-uncommitted line is **held** (`held.ts`), not silently re-seeded and not silently
   sent.

**[REA] Step 3 turns case 2 from silent-and-wrong into loud-and-right, and it is half a day.** After
the fetch, it is the highest-value item in §7.

---

## 7. Q6 — the order, with sizes and falsifiers

**How to read this: steps 1 and 2 make everything else possible and need nothing from the Worker.
Step 7 is expensive and it gates step 8, because §0's GUARD 2 finding says a user must not write
config until something replaces the guard they cannot have.**

| # | step | size | needs | what it unlocks |
|---|---|---|---|---|
| 1 | the declaration carries a **version** | **h** | nothing | every later step |
| 2 | the app **fetches** the declaration instead of baking it | **½** | 1 | a config change reaches a browser with no deploy |
| 3 | the compile becomes a **pure function of file contents** | **arc** | nothing | 4, 6 |
| 4 | the **Worker compiles** on a config write and stores the result per user | **arc** | 3 | config is content |
| 5 | a **version change makes the app abstain** and re-derive | **½** | 1, 2 | closes §6.1 case 2 |
| 6 | the **receipt carries the dropped delta**, in the user's words | **½** | 4 | Q4 |
| 7 | **gate 2** — a dry-load endpoint, and config retention | **arc** | monorepo | replaces GUARD 2 |
| 8 | the **config editor** in the browser | **arc** | 1–7 | the product |

### Step 1 — the declaration carries a version · **under an hour** · needs nothing

**What.** Each generator emits a content hash of the config it read, into the declaration.

**Falsifier.** Change one byte of one config file, regenerate, assert the version changed. Change
nothing, regenerate, assert it did **not**. **[REA] The second half is what catches a version derived
from a timestamp or from directory-walk order** — and `ledger.mjs:80-84` already establishes sorted,
deterministic output as the house rule for exactly this reason.

**Why first.** An hour, no behaviour change, and steps 2, 4, 5 and 6 all key on it.

### Step 2 — the app fetches the declaration · **half a day** · needs 1

**What.** Delete `embedded-declaration.ts:45`. `loadPresentation()` (`app/index.html:1099-1101`)
fetches by version instead. The version makes it immutably cacheable, so the round trip is paid once
per config change rather than once per load — **a better answer than the inline it reverses.**

**Falsifier.** Serve a modified declaration with a new version; assert the app's answers change with
no rebuild and no deploy. **[REA] The first falsifier here a user could run, which is not a
coincidence — it is the first step that is about the product.**

**What it costs, honestly.** It reopens a failure mode the page closed: `app/index.html:1049-1055`
says a declaration that cannot be read *"is no longer a case this function handles"*. It has to come
back. **[REA] Cheap, because the machinery for "no declaration yet" is already correct:**
`globalRegistrationFor` returns `undefined` when either axis is missing and the rung refuses rather
than guessing (`app/index.html:1083-1086`) **[OBS]**.

### Step 3 — the compile becomes a pure function · **an arc** · needs nothing

**What.** Each generator splits into `compile(files) → {declaration, dropped}` (pure) and a thin node
shell that walks the directory. §2.1's 36 fs sites become one injected reader.

**Falsifier, and it needs no new test.** Run the CLI before and after; assert `presentation.json` is
**byte-identical**. `checkdeclarations.mjs` already does the whole-object comparison **[OBS]**; the
refactor is correct exactly when that script says nothing changed.

**Size.** Half a day each for structural and qualification; the resolution generator is 1,025 lines
with 16 fs sites and goes last. **An arc for all three, landing one at a time.**

### Step 4 — the Worker compiles · **an arc** · needs 3

**What.** A config write route on the Worker: parse, compile, refuse on failure with the reason,
store the declaration and its version per user, forward the config to the graph server, serve the
declaration to step 2's fetch.

**Falsifier.** Write a config that adds one vocabulary token. The next fetch of the declaration
contains it. **No build ran, no commit was made, no deploy happened.** That single assertion is the
thesis of this document; it passes or the design is wrong.

**Second falsifier, for §2.3's third-caller risk.** Compile a fixture config in the Worker and with
the CLI; assert the two objects are byte-identical, `dropped` included.

**One storage fact to check first. [OBS]** The Worker has **one D1 binding and nothing else** — no
KV, no Durable Objects, and R2 is commented out because *"R2 is not enabled on this account"*
(`worker/wrangler.toml:12-23`). `worker/src/app.js:440-447` already rejects a graph payload over
**950,000 bytes** to stay under D1's row ceiling. A 138,806-byte declaration fits comfortably; a user
with seven times the operator's config does not. §8.2.

### Step 5 — a version change makes the app abstain · **half a day** · needs 1, 2

**What.** §6.2. The envelope carries the version — including through the Worker's fixed key list,
which drops unknown fields by default (§4.4) — and a difference makes every local answer abstain,
then re-derive.

**Falsifier — and it must be the REORDER case, not the rename.** Bump the version mid-session with
two sections **swapped and nothing renamed**. Assert every local answer abstains rather than answering
from a stale ordinal. **[REA] A test built on the rename would pass without the fix, because the
rename already fails loudly. The reorder is the only case that proves the step.**

### Step 6 — the receipt carries the dropped delta · **half a day** · needs 4

**What.** §4.4 and §5.3: the delta since the last version, with a `kind` separating *"the app cannot,
the engine can"* from *"neither can"*.

**Falsifier — two assertions, because one would pass with the kinds collapsed.** Write a config
adding exactly one rule whose pattern traverses the graph; the receipt names exactly **one** new row,
of kind *"will not feel instant"*. Write a config adding a section default no tag spells; the receipt
names exactly one row of the **other** kind.

### Step 7 — the dry-load gate, and config retention · **an arc** · monorepo · needs nothing

**What.** §4.3 gate 2 — an endpoint that loads a candidate bundle and rolls back, answering only
"loads" or "does not load, and here is why" — plus §4.5 mechanism 1: **stop deleting the previous
config** (`server/app.py:261-263`).

**Falsifier.** A config that compiles in the Worker and does not load in the engine is refused before
it takes effect. **[REA] Build the test from a real example of that class, not a synthetic one, or it
proves the two acceptors differ in a way that never happens.**

**Why it is not earlier.** It is the only step needing a repository this one cannot change, and steps
1–6 are all useful without it while the operator is the only writer.

**Why it must precede step 8, and this is §0's finding.** GUARD 2 refuses any config that does not
match the deployed engine's config, blob for blob, because config/engine skew broke the vault three
times **[OBS]**. It is made of git. **A user has no git, so a user has no guard.** Gate 2 asks the
live engine the same question git was standing in for. Shipping the editor first would give users a
write path with strictly less protection than the operator's.

### Step 8 — the config editor · **an arc** · needs 1–7

**Deliberately last.** **[REA] A surface that invites config writes before the write path can refuse,
explain and revert is a surface that helps users break themselves.** Everything above is what makes
step 8 safe; none of it is what makes step 8 possible.

### 7.1 What this changes in the existing thirteen-step architecture

**[REPO]** `design-the-resolution-architecture.md:122-529`.

| step | effect |
|---|---|
| 5 — publish the config-only resolution table | **DONE, unchanged, and it becomes the payload of step 2's fetch.** Nothing about it was wasted |
| 11 — carry section identity in the envelope | **Promoted.** It is the same fact as §6's version problem, and `backlog.yaml:2572` already specifies the change line by line |
| 12 — the projection-replay convergence test | **Unchanged**, with a second reason to exist: replay is the only test that can fail for *"the right prediction under the wrong declaration"* |
| 13 — the server refuses a stale write | **Widened twice.** The precondition must cover the declaration version (§6.1 case 3), and the server half — still unbuilt — matters far more for config than for markdown (§4.2) |
| *not in the sequence: a browser-side rule evaluator* | **Still refused, and this document makes the refusal cheaper to live with.** The ledger now tells a user which of their rules are in that class, which is what the refusal always lacked |

**Nothing in the thirteen is invalidated.** **[REA] The one thing undone is not in the thirteen at
all:** the inline of `presentation.json` (`f7a769b`). It was a performance commit that landed
alongside the sequence, and it is the single obstacle to the whole reframe.

---

## 8. Where the existing design assumes HIS instance

**The operator asked for this explicitly. Each row is a place where something works because of a
property of his config, not a property of the system.**

### 8.1 The whole path is single-tenant by construction

**[OBS]** `presentation.json` is **one tracked file** at the repo root, imported into **one committed
bundle**, deployed by **one push**. `scripts/monorepo-config.mjs:22-31` is a hard-coded relative path
to **his** monorepo checkout. `server/app.py:43` is `CONFIG = Path(os.environ.get("QNTM_CONFIG",
"/data/config"))` — **one directory**, and `worker/src/app.js:74` says the same: *"qntm-graph.fly.dev
holds ONE /data/state.db, ONE /data/vault and ONE /data/config"*.

**[REA] This is the deepest assumption in the arc and it is invisible because there is exactly one
user.** Every other row below is a detail. This one is structural: the declaration must stop being a
build artifact and become per-user state, and the config must stop being a directory and become
per-user data. The Worker already keys graph snapshots by `user_id` **[OBS]**; the config path has no
user dimension anywhere.

### 8.2 The declaration's size is his, and it is inlined and stored in a row

**[OBS]** 138,806 bytes for 72 views and 186 sections, scaling roughly with the config. Two
consequences a second user hits: a ~1.4 MB declaration inlined into the JavaScript bundle at ten
times his config (step 2 fixes this as a side effect), and D1's row ceiling — the Worker's own guard
rejects payloads over 950,000 bytes (`worker/src/app.js:440-447`) **[OBS]**, and R2 is not enabled on
the account.

### 8.3 Three resolvable fields, because three cover him

**[OBS]** `generate-qualification-declaration.mjs:96` —
`RESOLVABLE_FIELDS = Object.freeze(["node_type", "domain", "status"])`. Any vocabulary token setting
any other field is dropped (drop path 10, `:484-492`), and `ledger.mjs:19-20` records that this one
line dropped **73 of his own tokens**, measured 2026-08-01 **[OBS]**. **[REA] A user whose system
runs on `priority` or `stage` gets a published grammar covering none of their vocabulary, and today
the only sign is a row in a JSON file nothing reads.** Q4's receipt makes that survivable; widening
the list makes it work.

### 8.4 The YAML reader was written for a config he had already written

**[OBS]** `yaml-subset.mjs:95-122` throws on tabs, `---`, anchors, aliases, merge keys, explicit keys
and block scalars. **[REA] Every one of those is normal YAML.** The refusals are correct and honest,
and a user typing into a browser form will meet them. Two consequences: the drop must produce a
sentence a non-programmer can act on, and the config **editor** should emit a canonical subset rather
than free text.

### 8.5 The section cascade is four levels because his fifth is switched off

**[REPO]** `design-the-resolution-architecture.md:36-40`: the engine's cascade is five levels;
`SUBTREE` is off in his instance, so it runs four *"and his model is numerically right by
accident."* **[UNVERIFIED]** Whether any generator publishes that level if a user turns it on.
**Settled by** checking whether any generator reads the subtree cascade key.

### 8.6 No section declares its own node type — today

**[OBS]** `app/present/newline.ts:76-97` and **[REPO]** `design-the-rule-mirror.md:774-781`: nothing
in his 73 view sheets uses a section-level `default_node_type`, and the module says in prose what
happens if one ever does. **[REA] "No user has done this yet" is the weakest guarantee there is, and
it stops being true the moment a second user exists.**

### 8.7 The agreement tests only ever test his config

**[OBS]** The staleness check exits **3** — *"NOTHING WAS CHECKED … It is NOT a pass"* — when the
monorepo is absent (`checkdeclarations.mjs:105-108`), which is every CI run. **[REPO]**
`design-the-rule-mirror.md:761-772`: *"we know on his laptop, if he runs the script."* The committed
fixture tree does run in CI, and **it has no `rules/` directory** **[OBS]** — so `readRetypeRules`
returns early (`generate-resolution-declaration.mjs:738`) and the rule-reading half of the resolution
generator is **never exercised in CI at all**. **[REA] Once config is content, the config under test
cannot be one person's checkout. The fixture tree becomes the specification and must be widened
deliberately rather than grown by accident.**

### 8.8 Numbers to stop quoting as bounds

* *"a capture reaches one rule of ninety-four"* — his, and already corrected upward once (21 → 29
  reachable, `research-the-resolution-universe.md:787-791`) **[REPO]**. Another user's config could
  reach forty.
* *"0, 1 or 2 rows change in view"* — **[REPO]** refuted; the measured ceiling is 6.
* *"685 bytes per view"* — his median, over his sections.
* *"one config directory, 283 files"* — his, and 90 % of it is instance data **[OBS]**.
* **[REA] Every closure number in this repo is a floor.** Sampling can only undercount.

---

## 9. What I refuted, including the brief and myself

1. **"The browser is forbidden because that is an interpreter."** **Refuted as stated, conclusion
   kept.** Running the same compile module in the browser is not a second implementation. The reasons
   to keep the browser away from *authority* are different and better (§2.2c) — and one of them makes
   a preview legitimate, which §3 then uses.

2. **"A config edit should not front-run."** **Refuted as stated, decision confirmed.** Three things
   are called front-running and they have three answers. Config front-runs its own text and its own
   verdict; it never front-runs its consequences (§3).

3. **"The compile is the hard part."** **Refuted, and measured.** All three compilers run over his
   real config in **0.27 s wall / 0.22 s CPU** **[OBS]**, and 92 % of the code is portable. **The hard parts are the fetch, the version, and the per-user store.** The question was
   aimed at the compiler; the blocker is one `import` statement.

4. **"Moving to the Worker is a port."** **Refuted by measurement.** Under 200 of 2,568 lines are
   node-bound; `yaml-subset.mjs` and `ledger.mjs` need no change at all; and `nodejs_compat` is
   already on (§2.1).

5. **"The Worker is already in the path."** **Refuted for config.** It is in the *graph* path. It has
   sixteen routes and none is `/config`; config goes laptop → graph server directly (§2.4). Putting
   the Worker on the config path is a cost the choice has to carry.

6. **"`POST /config` exists already, so the write path exists."** **Refuted in the direction that
   matters.** It exists and it validates nothing, and it **deletes the previous configuration**
   (`server/app.py:261-263`) (§4.3, §4.5).

7. **"The existing protections transfer."** **Refuted for one of five, and three of the other four
   are thinner than they look** — the base compare only reports, no deployed server answers 409, and
   there is no local write queue at all (§4.1). The base compare must become a **bundle**
   precondition, because config files reference each other and markdown files do not (§4.2).

8. **"The queue, the anchor and the held strip cover a config change."** **Refuted.** They cover a new
   projection of the same file. A config change is the opposite arrival: identical words, different
   meaning — and the reorder case is silent and wrong today (§6.1 case 2).

9. **My own first framing of Q4.** I first wrote that the ledger tells a user which rules will not
   feel instant. **Wrong as stated:** a dropped row can equally mean the *engine* will not do it
   either, and the two need opposite sentences (§5.3). As it stands the ledger would tell a user
   "this will be slower" about config that will never work at all.

10. **My own first ordering.** I put the dry-load gate seventh because it is expensive and touches
    another repository. **Then I read GUARD 2.** The guard that protects the config path today is made
    of git, a user has no git, and gate 2 is its replacement — so it gates the editor rather than
    trailing it (§0, §7 step 7).

---

## 10. What is unverified

* **[UNVERIFIED]** Whether a Cloudflare Worker's CPU-time limit accommodates compiling a config
  substantially larger than the operator's. **[OBS]** His 276 files cost **0.22 s of CPU**, which
  sits inside a paid Worker's budget with room to spare and outside a free-tier request's. What is
  unmeasured is how that scales: the qualification generator normalises 138 patterns and the
  resolution generator reads 43 rule files, and neither cost is obviously linear. **Settled by**
  running the pure compile from step 3 against a synthetic config an order of magnitude larger. **[REA] This is the one measurement that could
  send Q1 back to the graph server, and it should be taken before step 4, not after.**
* **[UNVERIFIED]** Whether `_load_with_fallback`'s `BundleCache` retains enough to reconstruct a
  previous config tree, or only enough to reuse a parsed bundle for one cycle. My reading is the
  latter (§4.5), and it decides how much of step 7 is new work. **Settled by** reading
  `persistence/bundle_cache.py` and `bundle/config_registration.py` together.
* **[UNVERIFIED]** Whether the deployed image actually has libyaml's C scanner. `parsed_yaml.py:22`
  uses `getattr(yaml, "CSafeLoader", yaml.SafeLoader)`, so a 23× slowdown would be silent, and a
  dry-load gate on every config write makes bundle-load time a user-facing number for the first time.
* **[UNVERIFIED]** Whether any generator reads the subtree cascade key (§8.5).
* **[UNVERIFIED]** How a per-user config directory should be laid out on the graph server, which today
  holds exactly one. Not designed here; it is a monorepo question and it blocks step 7.
* **[UNVERIFIED]** Whether GUARD 2 has a per-user analogue worth keeping — an engine/config
  compatibility claim expressed as a version rather than a commit. **[REA] Probably yes, and it is a
  different mechanism from gate 2: gate 2 asks "does this load"; GUARD 2 asked "was this engine built
  for this config". The second question survives the move and has no answer here.**

---

## 11. Reproduction

```
# sizes and history of the baked declaration
git show f7a769b:presentation.json | wc -c        # 3,303
wc -c presentation.json                            # 138,806
wc -c dist/present.js                              # 257,317

# the dropped record, per key
node -e 'const j=require("./presentation.json");
  for(const k of ["structural","qualification","resolution"])
    console.log(k, Object.keys(j[k].dropped||{}).length)'          # 0 / 214 / 95

# published vs refused sections
node -e 'const q=require("./presentation.json").qualification;
  console.log(Object.keys(q.sections).length, Object.keys(q.refused).length)'   # 27 / 116

# the compile, timed over the operator's real 276-file config (read-only; --check writes nothing)
time node scripts/checkdeclarations.mjs      # 0.273 s wall, 0.22 s user CPU, exit 0

# the node surface of the compilers
grep -c "readFileSync\|readdirSync\|existsSync\|writeFileSync" scripts/yaml-subset.mjs   # 0
grep -c "process\." scripts/yaml-subset.mjs                                             # 0

# the Worker has no config route — enumerated, not grepped for absence
grep -n "config" worker/src/*.js worker/wrangler.toml     # 5 hits, all comments or error strings

# NOT RUN, deliberately: no cycle, no graph-sync, no `map . --full`, no POST to any server,
# no git stash, no merge. ~/qntm and ~/.qntm-md were never opened. The monorepo was read with
# absolute paths and never written.
```

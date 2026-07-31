# Design: a user owns their own graph

**Status:** design, plus one shipped slice. **Branch:** `design/a-user-owns-their-own-graph`, based
on `origin/main` @ `1596ee8` of `QNTM-Network/qntm-network`.

**The ask, in the operator's words:** *"everything that I can do, someone can now log in and do
themselves… for now just their secure environment and login with passkey process for their own."*
And the scope: *"Let's assume my config for now and we will eventually layer that out obviously,
but we need to do it properly."*

**So the engine configuration is SHARED and that is deliberate.** What must be per-user is a
person's **graph and vault — their content**. Nothing below designs config tenancy.

**Evidence rule**, borrowed from `research-state-and-speed.md`: every claim is **[OBS]** (a command
I ran, output I read), **[REA]** (reasoned from source I read, cited `file:line`), or **[REPO]** (a
claim the repo makes about itself that I did not reproduce). No docstring is evidence on its own.

---

## 0. Lead — read this part even if you read nothing else

**The premise of the task was that a second user has nowhere to go. That is not the bug. The bug is
that a second user goes to yours.**

`GET /app/graph` and `POST /app/edit-file` in `worker/src/app.js` require **a valid session and
nothing more**. They then call `qntm-graph.fly.dev` with the shared `SERVER_TOKEN`, which names no
user, against a box that holds exactly one `state.db` and one `vault` — yours. So before this
branch:

- **any** logged-in account received your entire graph: all 77 rendered views and the graph blob;
- **any** logged-in account could overwrite **any path inside your live vault** and run a cycle
  over it.

And registration is open. `auth.js#registerOptions` checks a handle regex and a uniqueness query,
and nothing else. **[REA]** `worker/src/auth.js:49-83`. There is no invite, no allowlist, no
approval. Anyone who picks an unused handle gets an account, and an account was all it took.

This is not a future risk. Both secrets that select the hosted branch are set in production:

```
$ npx wrangler secret list
EXPORT_KEY | GRAPH_PUSH_KEY | GRAPH_SERVER_URL | GRAPH_USER_ID | SERVER_TOKEN
```
**[OBS]** So `worker/src/app.js:83` `if (env.GRAPH_SERVER_URL && env.SERVER_TOKEN)` was the live
branch for every session.

**What has saved you is that nobody has signed up yet.** There is exactly one row in `users`:

```
id                                    handle  created_at
a19e4c66-af5d-4114-a928-d2c63b503374  qntm    2026-07-16 23:53:13
```
**[OBS]** `wrangler d1 execute qntm-signups --remote` (read-only).

**A sibling agent is building the signup and first-run experience in `app/` right now.** The moment
that lands, the second person to register reads your graph. **Stage 0 below is shipped on this
branch for that reason, and it should merge before any signup work does.** Merging deploys it:
`.github/workflows/worker.yml` runs `wrangler deploy` on push to `main`. **[OBS]**

---

## 1. Where a second user's graph lives, and what enforces the boundary

> **A second user's graph lives in its own SQLite file under its own directory on the volume —
> `/data/users/<user_id>/{state.db, vault/}` — with `/data/config` shared and read-only; and the
> boundary is enforced because that path is DERIVED from the authenticated session and there is no
> request parameter, anywhere, that names it.**

The distinction that matters: **this is not a filter that must be remembered. It is an argument
that must be supplied.** A forgotten filter leaks silently. A missing argument is a 400.

### Why this is small rather than an engine rewrite

Because the engine already supports it, by argument. `run_cycle(config, vault_dir, db_path)` is a
pure function of its arguments: no `global` statements, no `lru_cache`, no import-time `os.environ`
reads anywhere in `apps/qntm-md/src`; the connection, the `BundleCache`, the `Graph`, the
`TokenResolver` and the `EventLogStore` are all constructed per call. **[REA]**
`apps/qntm-md/src/qntm_md/coordination/orchestrator.py:5296, 5350-5410`.

**The single-tenant assumption is not in the engine. It is three module-level constants in one
file** — `server/app.py:43-45`:

```python
CONFIG = Path(os.environ.get("QNTM_CONFIG", "/data/config"))
VAULT  = Path(os.environ.get("QNTM_VAULT",  "/data/vault"))
DB     = Path(os.environ.get("QNTM_DB",     "/data/state.db"))
```

Every route uses them unqualified. **The tenant is the path, and the path is already a parameter of
the only function that matters.** That is the whole reason this design is a change to one file
rather than a rewrite of `qntm_graph`.

Two module-level compile caches do survive across cycles — `lifecycle/rule_loader.py:63` and
`capabilities/decision_tables/runtime/contract_loader.py:166`. Both are keyed by
`(file_path, content_hash)`, so **two tenants cannot collide on stale content**; but neither
evicts, so in a long-lived multi-tenant process they grow monotonically. **[REA]** A bounded cache
is a stage-3 footnote, not a blocker.

---

## 2. The options, weighed

### Option 2 — a tenant column — is not risky. It is **unavailable**.

This is the most important finding in the section, so it goes first.

**The graph is one JSON blob in one row.** `apps/qntm-md/src/qntm_md/persistence/schema.py:59-65`:

```sql
CREATE TABLE IF NOT EXISTS graph_state (id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated TEXT NOT NULL)
```

read as `SELECT data FROM graph_state WHERE id = 1`. **[REA]** `orchestrator.py:637`,
`server/app.py:180`. Measured on the live model: that one `data` column holds **960,714 bytes of
JSON containing 1,712 nodes and 460 edges**. **[OBS]** backup manifest, 2026-07-30.

**There are no per-node rows for a tenant column to sit on.** You cannot add `WHERE user_id = ?` to
a query that selects a single blob by `id = 1`. To make option 2 *possible* you would first have to
normalise the graph into rows — which means rewriting the NetworkX-backed store
(`core/graph/src/qntm_graph/_nx.py:24`), its traversal, and all 28 `find_nodes` call sites.

So the option is refuted **by the shape of the data**, before any argument about developer
discipline. That is a stronger refutation than the one the brief anticipated, and it is worth
saying plainly: *the question "how would you enforce the filter rather than hope for it" has no
answer here, because there is no filter to enforce.*

(`line_cache`, `event_log` and `evidence` *could* take a column. The graph — the thing worth
stealing — cannot.)

### Option 1 — a database per user on the same volume

Right shape, wrong volume. See §3: the volume cannot hold a second user. **The idea survives; the
disk does not.** This is the recommendation, with §3's capacity work as its precondition.

### Option 3 — a machine per user

**Strongest isolation, and it is the only option that makes the shared `SERVER_TOKEN` problem
(§4) impossible rather than unlikely.** The costs are real and specific:

- **A Fly volume attaches to exactly one machine.** **[OBS]** `fly volumes list -a qntm-graph`
  shows one volume, one `ATTACHED VM`. So a machine per user is *also* a volume per user — option 3
  contains option 1's disk cost and adds a VM to it.
- `performance-1x` + 2 GB RAM + a 3 GB volume, per person. Auto-stop makes idle CPU nearly free;
  the volume is billed whether or not anyone is awake.
- Operationally it multiplies everything. `server/backup-db.sh` takes **9m40s for one database**
  **[REPO]** `server/BACKUP.md`. A deploy becomes N deploys.

**Verdict: correct destination, wrong first step.** It is stage 7, reached when a tenant's size or
a tenant's threat model earns it — not the shape you build the first two users on.

### Option 4 — what is recommended: a directory per user, path derived from the session

`/data/users/<user_id>/{state.db, vault/}`, `/data/config` shared and read-only.

- The isolation unit is a **file**, which SQLite already enforces — separate locks, separate WALs,
  no shared query surface.
- The engine needs **no change** (§1).
- It is **forward-compatible with option 3**: moving a tenant to their own machine later is a
  directory copy and a routing change. The Worker contract, the browser, and D1 are untouched.
- It does **not** foreclose per-user config: `/data/users/<id>/config/` is a fourth path in the same
  scheme, the day he wants it. Nothing here has to be undone to get there.

---

## 3. How many users fit on the current volume — the arithmetic

**Short answer: one. And it is already over-subscribed for its own maintenance.**

### The measurements

| what | value | source |
|---|---|---|
| Volume `qntm_data`, region lhr | **3 GB**, one volume, one attached VM | **[OBS]** `fly volumes list` |
| `/data/state.db` | **2,266,955,776 B** (2.11 GiB) | **[OBS]** backup manifest, sha256-verified before and after the copy |
| free on the volume | **~602 MB** | measured, carried from the task brief |
| the graph inside it | **960,714 B**, 1,712 nodes | **[OBS]** same manifest |
| `event_log` rows | **233,759** | **[OBS]** |
| `evidence` rows | **175,303** | **[OBS]** |

**The graph is 960 KB. The database holding it is 2,266 MB. 99.96 % of the volume's occupancy is
audit exhaust, not content.**

### 3.1 At the realised footprint: zero more users fit

602 MB free ÷ 2,266 MB per user = **0**.

**And it is worse than zero, because you cannot compact.** SQLite `VACUUM` writes a complete second
copy before swapping, so reclaiming 2.11 GiB requires ≥2.11 GiB free. There is 0.59 GiB. The engine
already knows this — commit `db1167e`, *"reclaiming space costs space first, so compaction is
bounded and guarded"*. **[OBS]** `git log`. **The volume is too full to clean itself.**

### 3.2 At day-one footprint: ~875 users, for one cycle each

A brand-new environment, measured by running it (§5): **720,896 B** on the operator config,
**172,032 B** on the starter bundle. **[OBS]**

602 MB ÷ 721 KB = **~875 fresh users**. That number is real and it is useless, because it is a
snapshot of a quantity that does not stay still.

### 3.3 The number that governs: 72 KiB per cycle, forever, doing nothing

Six consecutive cycles, empty vault, operator config, fresh database, in a scratchpad. **[OBS]**

| cycle | db bytes | delta | nodes | md files | md bytes |
|---|---|---|---|---|---|
| 1 | 720,896 | — | 120 | 72 | 3,799 |
| 2 | 806,912 | +86,016 | 120 | 72 | 3,799 |
| 3 | 880,640 | **+73,728** | 120 | 72 | 3,799 |
| 4 | 954,368 | **+73,728** | 120 | 72 | 3,799 |
| 5 | 1,028,096 | **+73,728** | 120 | 72 | 3,799 |
| 6 | 1,101,824 | **+73,728** | 120 | 72 | 3,799 |

**Nothing changed. Not one node, not one file, not one byte of markdown. And it cost 72 KiB a
cycle.** Every web edit runs a cycle (`worker/src/app.js#editFile` → `POST /cycle`).

**So capacity is not a function of how many users. It is a function of how many cycles.**

> **602 MB ÷ 73,728 B = ~8,558 more cycles on this volume, in total, shared between everybody.**

One user at 50 edits/day: **171 days.** Ten users: **17 days.** A hundred: **under two days.** And
those are floors — a cycle that actually changes something writes more.

### 3.4 Corroboration from history

| date | bytes | what |
|---|---|---|
| 2026-06-10 09:48 | 2,170,880 | laptop backup |
| 2026-07-20 15:30 | 137,375,744 | laptop checkpoint |
| 2026-07-24 16:27 | 1,083,658,240 | laptop live |
| 2026-07-30 09:35 | 2,262,802,432 | server backup |
| 2026-07-30 14:08 | 2,266,955,776 | server backup |

**[OBS]** `ls -la ~/.qntm-md/backups ~/.qntm-md/checkpoints`. **2.07 MiB to 2.11 GiB in fifty days —
a factor of 1,043.** The two server backups are the same lineage on the same day: **+4,153,344 B in
4h33m ≈ 22 MB/day**, ≈ 56 cycles' worth.

### 3.5 Why it grows without bound

- **`evidence` is never pruned.** `EvidenceStore` takes a `retention_days: int = 90`
  (`persistence/evidence_store.py:70`) and exposes a `prune`. **The orchestrator constructs the
  store at `orchestrator.py:5520` and never calls `prune`.** **[OBS]** grep across
  `apps/qntm-md/src`: the only other reference is `evidence/retrieve.py:28`. 175,303 rows and
  counting.
- **`event_log` retention deletes nothing, by policy and on purpose.**
  `cli/compact_event_log.py` states it: *"this command removes ONE key from ONE event type's
  payload. It deletes no rows, drops no event types, and applies no time cutoff."* The stated reason
  is sound — `tests/flow_scenarios/event_coverage_audit.py` rests on **lifetime** counts, and
  deleting rows would flip that invariant red. **[REA]**

**This is the real precondition for multi-tenancy, and it is not a tenancy problem.** Ship tenancy
onto a 22 MB/day-per-user leak and you have not built a product, you have built N copies of a leak.
**Stage 2.**

---

## 4. What this makes impossible, versus merely unlikely

**Impossible** — no code path exists, and adding one would be a visible structural change:

1. **A forgotten `WHERE user_id = ?` returning another tenant's nodes.** There is no cross-tenant
   query surface at all: the connection is opened against one tenant's file. You cannot forget a
   filter that does not exist. *This is the entire reason to prefer a file over a column.*
2. **Two tenants' cycles corrupting each other.** Separate files, separate SQLite locks, separate
   WALs. A tenant cannot even see another's transaction.
3. **Reaching another tenant by naming them in the request.** The user id is read from the
   `sessions` table server-side; the Worker overwrites any header a browser sends. Pinned by test:
   a `user_id` in the body, an `X-Qntm-User` header, and the operator's handle all fail.
4. **A tenant's markdown write escaping into another tenant's vault.** `server/app.py:283`'s
   traversal guard resolves against the vault root; once that root is per-tenant, an escape lands
   outside it and is refused. *(Must be re-pinned against the derived root — stage 3.)*

**Merely unlikely** — and each of these must be said out loud, because "unlikely" is what gets
called "impossible" three months later:

1. **One `SERVER_TOKEN` addresses every tenant.** It is a *server* credential, not a user
   credential: it says "the Worker is calling", never "and this is for whom". Whoever holds it can
   name any user id. The Worker being the only holder and only caller is a **deployment fact, not a
   cryptographic one**. A Worker bug that forwards the wrong id, or a compromised Worker, exposes
   everybody at once. **Only a machine per user (option 3) makes this impossible.** A directory per
   user reduces it to a single line that can be tested — which is what stage 4 does — but does not
   eliminate it. *This is the honest weak point of the recommendation.*
2. **One regex stands between a derived path and `/data/users/../../etc`.** Mitigation: never
   concatenate a value straight from a token; validate `^[0-9a-f]{8}-[0-9a-f]{4}-…$` and refuse
   anything else. One regex is "unlikely", not "impossible".
3. **Shared config is shared blast radius.** `POST /config` replaces `/data/config` wholesale
   (`server/app.py:247-264`) for every tenant at once. Under the stated scope that is *correct* —
   but nothing enforces that only the operator may call it. One bad push breaks every tenant's
   cycle simultaneously. Today that is one person; it should be pinned before it is two.
4. **A queue, and it is asymmetric.** One machine, one CPU, cycles serialised by a process-local
   `threading.Lock` (`server/app.py:82`). But the cost is not uniform: a **new** user's cycle is
   **0.71–0.89 s** **[OBS]** (§3.3), while the operator's is ~10 s **[REPO]** / 48.9 s on a copy
   **[OBS]**. So new users barely queue behind each other; **everybody queues behind you.** The fix
   is nearly free once the path is per-tenant: two different database files have no reason to
   serialise, so the global lock becomes a per-path lock. **Stage 6.**
5. **`min_machines_running = 0`** means the first request of the day costs 4,278 ms **[OBS]**
   `research-state-and-speed.md` §2.1 — and with N users that cold cost lands on whoever is first,
   not on whoever caused it.

---

## 5. What a new user starts with — measured, not assumed

**I ran it.** Operator config copied to a scratchpad, an **empty** vault directory, a fresh database
path, `run_cycle` six times. Nothing outside the scratchpad was touched; `~/qntm` was never read.

**Operator config + empty vault — it works, and it is stable.** **[OBS]**

- Cycle 1: **0.71 s**, **72 markdown files**, **3,799 bytes**, **120 nodes**, 720,896 B database.
- Cycles 2–6: nodes **120 → 120 → 120 → 120 → 120**. Files **72**. Bytes **3,799**. **Idempotent —
  no header multiplication, no drift.**

Two things follow.

**A new user does not start empty. They start inside your structure with none of your content.**
Those 120 nodes are minted by *your config* against an empty vault, and 3,799 bytes across 72 files
is about 53 bytes each — headings and nothing else. They get `work/`, `dev/qntm/`,
`admin/dojo/free-trial/`. **Under the scope you set that is exactly right, and it is worth seeing
plainly before someone else sees it**: the shared config is not neutral scaffolding, it is your map
of your life with the content removed.

**And the first cycle for a new user is sub-second, not ten seconds.** The ten seconds is a property
of *your* 1,712-node graph and 2.11 GB database, not of the engine. This is the good news in the
whole document: **new users are cheap.**

### Is `bundles/starter/` what a new user should start from?

**It is a separate decision, it is not mine, and under the scope you set it is not in play at all.**
"Assume my config for now" answers it for this arc: a new user gets your config.

But the brief asked me to establish whether it is *ready* to be that decision, so:

- **It works from empty and it is stable.** I ran the same six-cycle experiment against it: 0.14 s,
  6 view files, 443 bytes, **0 nodes**, 172,032 B, unchanged across all six cycles. **[OBS]**
  **As far as I can tell this is the first empty-vault multi-cycle evidence the starter has** — and
  it is mine, in a scratchpad, not in CI.
- **The fix is real but unpinned.** `521de56` (PR #38) reproduced the 2/4/6/8/10 header
  multiplication over five cycles and fixed it with an `identity:` block at
  `bundles/starter/schema.yaml:219-221`. But the commit is **16 files, +433 lines, zero test
  files**. **[OBS]** `git show --stat`. The evidence lives in a commit message. **Nothing in CI
  would catch a regression.**
- **No committed test cycles the starter from an empty vault.** Every multi-cycle compliance test
  copies a *populated* fixture vault, and the default harness bundle is `apps/qntm-md/config/`, not
  the starter (`flow_scenario_harness.py:66-68`). **[REA]**
- **The shipped starter cannot even trigger the bug that was fixed** — no shipped starter view
  declares `name:` on a section, and the reproduction required a starter-*derived* bundle. **[REA]**

**Recommendation: leave the starter out of this arc, and if it is ever to become the new-user
default, that PR's first commit should be the empty-vault multi-cycle test that PR #38 did not
write.** The real question it raises is a product one, not a backend one: six generic views, or 72
of yours with the content stripped? Those are different products, and the scope answers it for now.

---

## 6. The stages

Each ships independently and leaves the system working.

| # | stage | size | repo | status |
|---|---|---|---|---|
| 0 | **Close the live hole** — the shared model is the operator's, and only the operator's session reaches it | **under an hour** | this | **SHIPPED on this branch** |
| 1 | **Make the door match the readiness** — registration closed or invite-only until a new account has somewhere to go | **under an hour** | this + `app/` | not shipped |
| 2 | **Retention before tenancy** — prune `evidence`; give `event_log` a policy that survives the lifetime-count invariant | **an arc** | engine | not shipped |
| 3 | **The server learns the word "tenant"** — `server/app.py` derives vault and db from the request; no default to yours | **half a day** | engine | not shipped |
| 4 | **The Worker sends the id it authenticated** — never one it was handed | **half a day** | this | not shipped |
| 5 | **Provisioning** — a new account gets a directory, an empty vault, and a first cycle | **half a day** | this + engine | not shipped |
| 6 | **The queue becomes per-tenant** — the cycle lock keyed by db path, not global | **under an hour** (after 3) | engine | not shipped |
| 7 | **Capacity** — grow the volume, then split the machine | **an arc** | ops | not shipped |

### Stage 0 — close the live hole *(shipped)*

`isOperatorSession(env, session)` in `worker/src/app.js`. `GRAPH_USER_ID` already means "the
operator's `users.id`" — `operatorUser()` has always mapped `GRAPH_PUSH_KEY` onto it, and **every
`graph_snapshots` row in D1 carries `a19e4c66-…`, which is how I confirmed the secret's value
without reading it** **[OBS]**. The gate reuses that fact rather than inventing a second notion of
who the operator is, which is why it cannot lock you out.

- **Read** (`GET /app/graph`): a non-operator session falls through to the D1 path, which was
  already keyed by `user_id`, and sees `snapshot: null` — *their own* empty graph. Deliberately not
  a 403: "you have no graph yet" is the truth for a new account and a shape the app already renders.
- **Write** (`POST /app/edit-file`): **403**. There is no per-user destination to fall through to,
  and the request chooses the path it writes. Authenticated, not entitled.
- **Fail closed**: with `GRAPH_USER_ID` unset, *nobody* reaches the model — including you. This is
  the same inversion that made `server/app.py#_require_auth` fail *open* before PR #49, pointed the
  other way.

### Stage 1 — make the door match the readiness

After stage 0 a new account is safe but empty. That is better than dangerous and worse than honest.
Close registration, or gate it on an invite, until stage 5. The Worker half is mine; the signup
experience is the sibling's. **Coordinate — do not let a first-run flow ship in front of stage 5.**

### Stage 2 — retention before tenancy *(the real precondition)*

§3 is the argument. Two pieces: call `EvidenceStore.prune` from the cycle (it already exists and
already defaults to 90 days), and give `event_log` a policy that respects
`event_coverage_audit.py`'s lifetime counts — most likely a **counters table** that preserves
lifetime totals so rows can age out without flipping the invariant. **Nothing multi-user should
ship on top of 72 KiB/cycle of unbounded exhaust.**

### Stage 3 — the server learns the word "tenant"

`server/app.py` stops reading `VAULT`/`DB` from module-level constants and derives them per request:

```python
def _tenant(user_id: str) -> tuple[Path, Path]:
    if not _UUID_RE.fullmatch(user_id):
        raise HTTPException(400, "bad tenant")
    root = USERS / user_id
    return root / "vault", root / "state.db"
```

fed by an `X-Qntm-User` header the Worker sets. **Fail closed: no header is a 400, never a default
to `/data/state.db`.** That default is the whole bug in miniature and it must not survive the
refactor. `CONFIG` stays shared and is opened read-only.

**This is in the engine monorepo (`QNTM-Network/qntm`), which is read-only to me — see §7.**

### Stage 4 — the Worker sends the id it authenticated

`getSession` already returns it. The rule: **the value forwarded to Fly is the one that came out of
the `sessions` table, never one that came out of a request.** The header is set, not merged — any
client-supplied `X-Qntm-User` is discarded. `tests/app-graph-tenancy.test.mjs` already has the
id-guessing arm; it extends to assert the *forwarded* header.

### Stage 5 — provisioning

On first login: `mkdir /data/users/<id>/vault`, run one cycle, and the 72 views materialise —
**measured at 0.71 s** (§5), so it fits inside the request. Then stage 0's gate inverts from "only
the operator" to "everyone, at their own path", and the D1 fallback goes back to being a fallback.

### Stage 6 — the queue becomes per-tenant

`_cycle_lock` (`server/app.py:82`) is one global `threading.Lock`. Once each tenant has their own
db file, make it a dict of locks keyed by resolved db path. Two files have no reason to serialise.
Turns "everybody waits ten seconds behind the operator" into "everybody waits for themselves".

### Stage 7 — capacity

Grow `qntm_data` beyond 3 GB (Fly volumes extend in place), then split heavy tenants onto their own
machine — which, per §2 option 3, is also their own volume. Stage 3's path derivation is what makes
that a routing change rather than a rewrite.

---

## 7. What I refuted

The brief invited this, so: **six things, with evidence.**

1. **"You own `server/` and `worker/`."** `server/` is **not in this repository**. It lives in the
   engine monorepo `QNTM-Network/qntm` (alongside `fly.toml` and the `Dockerfile`), which the brief
   declares read-only to me. **[OBS]** `git ls-tree -r origin/main` lists no `server/` path.
   Consequence: **stages 2, 3 and 6 cannot ship from this PR** and are routed, not done.

2. **"Auth knows who you are; storage does not."** Half wrong, and the wrong half is the dangerous
   one. **D1 storage already knows.** `captures`, `graph_snapshots`, `graph_snapshot_views` and
   `graph_edits` all carry `user_id`, every query binds it, and `graph_snapshots` /
   `graph_snapshot_views` are keyed `PRIMARY KEY (user_id, version)`. **[REA]**
   `worker/schema-app.sql`. What does not know is the **Fly box** — and that is a much narrower and
   much sharper problem than "the data layer is single-tenant".

3. **The framing "where does a second user's graph live" presumes they get nothing.** They get
   **yours** (§0). The task was not "give a second user somewhere to go"; it was "stop a second user
   arriving in your house". Those need different first slices, and §6 stage 0 is the second one.

4. **"A tenant column — every missed filter is a data leak."** The option is not available at all:
   the graph is one JSON blob at `graph_state WHERE id = 1` (§2). There is no filter to miss.

5. **"`bundles/starter` is fixed."** Fixed, yes. **Pinned, no** — PR #38 added zero test files, the
   evidence is in a commit message, and no committed test cycles the starter from an empty vault
   (§5).

6. **"The cycle takes ~10 seconds and multi-user multiplies this."** True for the operator, false
   for a new user: a first cycle on an empty vault is **0.71 s** **[OBS]**. The queue is real but
   **asymmetric** — new users barely queue behind each other; everybody queues behind the operator
   (§4.4). That changes stage 6 from "an arc" to "under an hour", because the fix is a keyed lock
   rather than a scheduler.

---

## 8. What was proven, and how

**Baselines, recorded before any change:**

- `npm test` — **275 pass / 0 fail**. **[OBS]**
- `flow-trace verify .` — run twice, **32 PASS / 0 FAIL, exit 0** both times. **[OBS]**

**After stage 0:** `npm run check` (typecheck + build + test) — **287 pass / 0 fail**; the twelve
new tests are the delta. `flow-trace verify .` — **32 PASS / 0 FAIL, exit 0**.

**The pair, with opposite outcomes.** `tests/app-graph-tenancy.test.mjs` runs two real accounts —
a distinct `users.id` each, a valid unexpired session row each, exactly what registration mints —
and stubs `fetch` so it **records every call to Fly**. The strongest assertion is not "the intruder
got a 403"; it is that **the Fly machine was never called for the intruder** — the operator's bytes
were not fetched, not buffered, not filtered out at the last moment.

| | operator's session | second account |
|---|---|---|
| `GET /app/graph` | 200, `source: "server"`, hosted views, **one** `GET /graph` to Fly | 200, `snapshot: null`, their own handle, **zero** calls to Fly |
| `POST /app/edit-file` | 200, `POST /vault/file` then `POST /cycle` | **403**, **zero** calls to Fly |
| `user_id` in the body / `X-Qntm-User` header / operator's handle | — | **403**, zero calls |
| no token / unknown token | — | **401**, zero calls |
| `GRAPH_USER_ID` unset or empty | **refused too** — fail closed | refused |

**Mutation proof — every guard removed, the breach watched to succeed, then restored.** **[OBS]**

| mutation | result |
|---|---|
| remove `&& isOperatorSession(...)` from the read path | **3 fail** — incl. *"a second account gets its own (empty) graph, and Fly is never called"* |
| remove the 403 block from the write path | **5 fail** — incl. *"a second account cannot write one byte into the operator's vault"* |
| invert fail-closed: `if (!operatorId) return true` | **2 fail** — both `GRAPH_USER_ID`-unset tests |
| restored | **12 pass / 0 fail** |

Every green can be made red by deleting the thing it claims to test. **A green you cannot make go
red is not a green.**

**What was NOT run against production.** No write route was called. No cycle was run on the server.
No vault byte was changed. The reads I did make were `fly volumes list`, `fly status`,
`wrangler secret list` (names only — values are not readable), and two `SELECT`s against D1. The
six-cycle experiments ran in a scratchpad against **copied** config with **fresh** databases and
**empty** vaults. `~/qntm` was listed once, at the top level, and never read.

---

## 9. The honest position

**Stage 0 is worth merging tonight and I have not deployed it.** Merging is deploying — the Worker
workflow runs `wrangler deploy` on push to `main` **[OBS]** — so that is your call, not mine, and it
should be made after you have read §0.

**Everything past stage 0 should wait for you to read this**, for two reasons that are not about
caution:

1. **Stages 2, 3 and 6 are in a repository I was told not to touch.** They need routing to the
   engine, not implementing here.
2. **Stage 2 is a precondition, not a parallel track.** The volume has ~8,558 cycles left on it
   (§3.3) and cannot compact itself (§3.1). Multi-tenancy shipped before retention is N copies of a
   leak on a disk that is already too full to clean.

**Can multi-tenancy be made safe on the current shape?** **Yes — the isolation can.** The engine is
already a pure function of its paths, and a file per tenant makes the worst outcome (one user
reading another's graph) structurally impossible rather than merely guarded. **What cannot be made
safe on the current shape is the disk**, and that is a retention problem wearing a capacity
problem's clothes. Name it as stage 2, do it before stage 5, and the rest is a small change to one
Python file and one JavaScript file.

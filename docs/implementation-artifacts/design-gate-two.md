# Design: Gate 2 — teaching the graph server to decline a config it cannot load

**Status: design. No application source changes on this branch. This document adds itself and
backlog rows.**

**Branch:** `design/gate-two`, based on `origin/main` @ `8efada8`.

**What this document is not.** It does not re-derive `design-the-runtime-compile.md`'s own findings
— Q1's write-is-the-trigger decision, Q2's per-user-directory storage answer, §3's two-gate
sequence and its failure table, §4's pointer/body serving scheme, §6's determinism check, or §8's
lettered plan (A–J). Every one of those is cited, not repeated. This document is that document's
own §3/§7 item 4/§8 step G, worked to the depth an implementing agent needs — **and it corrects one
load-bearing assumption that document made about its own dependency**, in public, in §7 below,
rather than silently.

**Evidence rule, matching the corpus.** **[OBS]** a command run this session, output read directly.
**[REA]** reasoned from something labelled OBS. **[REPO]** a claim an already-merged document
makes, cited, not reproduced. **[NEW]** a claim this document adds that no merged document carries.

---

## 0. The pin, stated before the content

This document is a **HORIZONTAL** and **TIME** pin. It is **not** a vertical one.

* **HORIZONTAL.** One already-decided fact (`design-the-runtime-compile.md` §3: "Gate 2, on the
  graph server, inside the same `/config` handler, before anything is accepted") is homed against
  six design questions the operator asked by name — the swap mechanism, the validation line, the
  failure matrix, the cross-process guarantee, the guard relationship, the operator's sync — and
  checked against the two documents it depends on (`design-the-runtime-compile.md`,
  `design-a-user-owns-their-graph.md`) rather than assumed to agree with them.
* **TIME.** This document records a decision (§1) and a plan with sizes (§8). It corrects one
  claim in a merged document (§7) rather than silently picking a side.
* **VERTICAL — NOT moved, stated plainly.** **[OBS]** This repo's `docs/architecture/capabilities.yaml`
  holds **50 rows** at this branch's base (`python3 -c "import yaml; d=yaml.safe_load(open('docs/
  architecture/capabilities.yaml')); print(len(d['capabilities']))"` → 50; `Counter(status)` →
  `working: 38, undeclared: 12`; `enforcement_depth is None` → 36; `confidence is None` → 36 —
  reproduced in §11). **No row is touched, and no row is invented.** Nothing in this document names
  a capability the existing 50 rows cover, and nothing here is a runtime behaviour of *this*
  repository — Gate 2 lands in the engine monorepo, which this branch cannot touch. §8 files two
  `backlog.yaml` rows instead, matching the house pattern this repo already uses for scoped,
  buildable, cross-cutting work.

---

## 1. Q1 — how does the server dry-load without destroying what it has?

**Answer, in two sentences, as requested: extract the incoming tar into a freshly-named staging
directory beside the live config (the code already does this — it just does the wrong thing next),
call the engine's own bundle loader against that staging directory before touching anything live,
and only on success repoint a symlink over the config path in one atomic `rename()`. If the process
dies at any point before that final rename, the symlink still names the old, fully-intact
directory — there is no window in which the live config is missing, half-written, or unvalidated.**

### 1.1 What is there today, read directly, this session

**[OBS]** `server/app.py:470–487` — the exact range `design-the-runtime-compile.md` §3.1 cited,
still accurate at this session's HEAD (`d4c9d98`, read-only, trunk clone):

```python
@app.post("/config")
async def config_push(request: Request) -> dict:
    """Receive a gzipped tar of the operator CONFIG (views/patterns/rules) and mirror it into
    /data/config. Config is USER admin content — it flows like DATA (pushed via graph-sync), not
    code, so a view/rule change takes effect on the next cycle without a redeploy.
    """
    _require_auth(request.headers.get("authorization"))
    data = await request.body()
    tmp = CONFIG.parent / "_config_incoming"
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as t:
        t.extractall(tmp, filter="data")
    if CONFIG.exists():
        shutil.rmtree(CONFIG)
    tmp.rename(CONFIG)
    return {"ok": True, "yaml_files": sum(1 for _ in CONFIG.rglob("*.yaml"))}
```

**Confirmed, directly: no load is attempted anywhere in this function.** The only check between
receiving bytes and deleting the operator's live, working config is that the tar extracted without
raising — a truncated-but-valid-looking archive, or a config that is well-formed YAML naming a node
type nothing renders, passes this function exactly as cleanly as a good one.

**[OBS]** The staging step already exists — `tmp = CONFIG.parent / "_config_incoming"`, populated
before anything under `CONFIG` is touched. This is not a new idea to introduce; it is a real
mechanism that stops one step short of using itself. **The one-line summary of today's defect:
staging happens, but nothing consults it before the deletion.**

**[REA]** The sibling route, `vault_push` (`server/app.py:440–467`), uses the identical staging
pattern for the vault — extract to `_vault_incoming`, delete the old, rename the new in. It has the
same structural gap for the same reason (no dry-run of "will the next cycle be able to read this"),
but the vault's failure mode is caught downstream by `_load_graph_state_in_transaction`'s
state-preservation-is-sacrosanct guard (`apps/qntm-md/src/qntm_md/coordination/orchestrator.py:5595
–5612` — read-only, trunk clone) and is out of this document's scope; it is named here only so a
reader does not conclude config is uniquely careless.

### 1.2 The primitive to reuse for the dry-load itself

**[OBS]** `apps/qntm-md/src/qntm_md/bundle/loader.py:379` — `def load(bundle_path: Path |
ConfigRegistration) -> LoadedBundle`. Read in full this session: it walks every YAML file under
`bundle_path`, merges and validates the schema (`validate_schema`), then vocabulary-against-schema,
patterns-against-schema, rules-against-patterns, and view-registrations-against-schema
(`loader.py:29–42` imports `validate_patterns`, `validate_rules`, `validate_schema`,
`validate_view_registrations`, `validate_vocabulary`). **[OBS]** Zero references to `VAULT`, `DB`,
or `state.db` anywhere in `loader.py` (`rg -n "VAULT|state\.db|DB\b|sqlite" loader.py` — no hits) —
it is a pure function of the directory it is pointed at. It raises `BundleParseError` (syntax) or
`BundleValidationError` (schema/cross-reference) — both subclasses of `QntmMdError`, which carries
`message`, `context`, `file`, `line` (`apps/qntm-md/src/qntm_md/errors.py:79–97`).

**[OBS]** `server/app.py:40` already imports `from qntm_md.bundle import ConfigRegistration,
RegisteredRoot` — the loader's own package is already a live dependency of this file. Reaching
`bundle_loader.load` and the two error types is an import-line change, not a new dependency.

**One naming trap the implementer must not fall into.** **[REA]** `apps/qntm-md/src/qntm_md/bundle/
last_valid.py`'s `load_with_fallback` (the mechanism `design-the-runtime-compile.md` §3.1 cites via
`orchestrator.py`'s cycle-time transaction) is **not** the right function for Gate 2, even though it
is the more obvious grep hit. Its entire job (`last_valid.py:1–24`) is to **swallow** a
`BundleParseError`/`BundleValidationError` and silently substitute the last-good cached snapshot —
exactly backwards for a gate that exists to **surface** the failure. Calling `load_with_fallback`
here would make Gate 2 report success on a broken candidate whenever a prior good snapshot happens
to be cached, defeating the gate while looking like it works in every manual test that starts from
a clean cache. **Gate 2 must call `bundle_loader.load(staging_dir)` directly.**

### 1.3 The swap, and why a symlink rather than delete-then-rename or rename-then-rename

Three candidates, priced against "what does the process dying leave on disk":

* **Today's shape (delete, then rename).** One window where `CONFIG` exists as **nothing** —
  between `shutil.rmtree(CONFIG)` returning and `tmp.rename(CONFIG)` completing. A crash in that
  window (OOM kill, `fly deploy` restart, host eviction) leaves the engine with no config directory
  at all; the next `/cycle` call fails outright, and there is nothing to fall back to because the
  old bytes are gone. **This is the defect, not a hypothetical — it is what runs today.**
* **Rename-then-rename** (`CONFIG.rename(CONFIG.parent / "_config_previous")` then
  `tmp.rename(CONFIG)`). Better — the old bytes survive at a known path — but still has a window
  where the path `CONFIG` itself resolves to nothing, between the two renames.
* **A symlink, repointed in one `rename()`.** `CONFIG` becomes a symlink over two real sibling
  directories (`config-a/`, `config-b/`, alternating). A write extracts into the *inactive* real
  directory, dry-loads it there, and on success does:

  ```python
  tmp_link = CONFIG.parent / f".config.next.{token}"
  tmp_link.symlink_to(new_target, target_is_directory=True)
  os.rename(tmp_link, CONFIG)   # POSIX: replaces the CONFIG dirent atomically, symlink-over-symlink
  ```

  **[REA]** `os.rename()` on POSIX is a single atomic directory-entry replacement regardless of
  whether the old and new names are symlinks, directories, or files, as long as source and
  destination share a filesystem (guaranteed here — both live under `CONFIG.parent`, the same
  mounted volume). There is no instant at which `CONFIG` resolves to nothing, a half-written tree,
  or an unvalidated candidate: before the rename it is the old, proven-good target; after, the new,
  proven-good target; nothing in between is externally observable. **This is the standard
  blue-green "current" symlink pattern** (the same shape release tooling and Kubernetes ConfigMap
  mounts use), not a new invention — chosen here because it is the only one of the three with no
  observable middle state at all.

**What the process dying mid-swap actually means under this scheme.** There is no "mid-swap" to die
in — the swap is the one `rename()` call, and a syscall does not partially execute. A crash before
it: the old symlink target is untouched, exactly as if the write had never been attempted. A crash
after it: the new target is live and durable (the directory entry change is written through the
volume's own journal on Fly's ext4-backed volumes in the ordinary case; a paranoid implementation
adds an `fsync` of `CONFIG.parent` after the rename to survive a bare power-loss, not merely a
process kill — worth doing, cheap, and named here so it is not forgotten rather than because it
changes the design). **The residual risk this does not remove** is unrelated to the swap: whether
the *next cycle* has already run against the old config before the swap or will run against the new
one after — that is `design-the-runtime-compile.md` §3.3's window, restated in §3 below, not a new
one this document introduces.

### 1.4 Two mechanical details a "no judgement calls" plan needs

1. **First-deploy migration.** `CONFIG` is a real directory today, not a symlink. On startup, if
   `CONFIG.exists() and not CONFIG.is_symlink()`, rename it to `CONFIG.parent / "config-a"` and
   create the symlink once, guarded so it runs exactly once and is a no-op on every later boot.
2. **Staging-directory retention.** Today's fixed name `_config_incoming` (`server/app.py:478`) is
   reused across every write, which self-heals (each write `rmtree`s it first) but is not
   concurrency-safe and leaves nothing to inspect after a rejection. Gate 2 needs a uniquely-named
   staging directory per write and a bounded-retention "last rejected" slot (`SNAPSHOT_KEEP`-style,
   mirroring `scripts/graph-sync.mjs:106`'s own `SNAPSHOT_KEEP = 3` precedent in this same
   ecosystem) so a refused candidate is inspectable, not silently deleted, without growing the
   volume without bound.

---

## 2. Q2 — what counts as "loads successfully"? Where is the line, and who decides it?

**Answer: "loads successfully" means `bundle_loader.load()` returns without raising
`BundleParseError` or `BundleValidationError`. The line is not new — it is the line the engine's own
five validators already draw on every real cycle (schema, vocabulary-against-schema,
patterns-against-schema, rules-against-patterns, view-registrations-against-schema), decided by
whoever owns those validators, not invented for this gate. What the server names on refusal is the
typed error's own fields, verbatim — the same register `design-the-runtime-compile.md` §5.1 already
proved is real.**

### 2.1 Why this line is deeper than "does it parse"

**[OBS]** Read directly, `loader.py:379–460` and its imports: `load()` does not stop at YAML syntax.
It merges and validates `schema.yaml` (`validate_schema`), then checks vocabulary entries resolve
against that schema (`validate_vocabulary`), patterns against the schema
(`validate_patterns(..., merged_schema_parsed.raw_data)`), **rules against the patterns dict**
(`validate_rules(raw_rule_sources + composition_rule_sources, patterns_dict)`), and view
registrations against the validated schema. **[REA]** This is precisely the two failure shapes the
brief names as the hard cases: *"a node type nothing renders"* is a pattern referencing a node type
the schema does not define — `validate_patterns` catches it, because it is handed the schema.
*"a field no rule can resolve"* is a rule referencing a pattern that does not exist —
`validate_rules` catches it, because it is handed the patterns dict. Neither is a syntax check;
both are cross-referential validation the engine already runs on every cycle, exposed here as a
pre-commit dry-run rather than invented fresh for this gate.

**[OBS]** A concrete, already-raised instance of exactly this class: `loader.py:526–533` raises
`BundleValidationError(f"unknown shell key {top_key!r}; allowed: …")` for a retired top-level key —
this is the *engine-side* twin of the *Worker-side* refusal `design-the-runtime-compile.md` §5.1
already cites (`unresolvable field(s): project`, `tests/app-generality-acceptance.test.mjs:519`).
Two independent grammars, two independent registers of the same shape, exactly as §3.2 of that
document argues they must stay.

### 2.2 Who decides the line

**[REA] Not this gate, and not this document.** Gate 2 does not draw a new boundary between valid
and invalid config — it exposes the boundary the engine's own five validators already draw, the
same ones a running cycle already trusts. Widening or narrowing what counts as valid is a change to
`validate_schema` / `validate_patterns` / `validate_rules` / `validate_vocabulary` /
`validate_view_registrations`, owned by whoever maintains the qntm-md engine, and it takes effect
for Gate 2 automatically the moment it takes effect for a real cycle — there is no second copy of
"what is valid" for Gate 2 to drift out of sync with. **This is the same principle
`design-the-runtime-compile.md` §3.2 already states for the two-grammar asymmetry** ("the ENGINE's
answer is the only one that can ever commit a version") applied one level down, to what "the
engine's answer" is actually computed from.

### 2.3 What the server names — the refusal, loud and specific

Per the brief's own principle ("a refusal must be loud and named"), Gate 2's HTTP response on
failure carries the typed error's fields verbatim — the exact set `last_valid.py:144–151` already
extracts for its own structured warning log, reused rather than re-invented:

```json
{
  "ok": false,
  "gate": 2,
  "error_type": "BundleValidationError",
  "file": "views/foo.yaml",
  "line": 12,
  "message": "unknown shell key 'chain'; allowed: pattern, decision_table, metric",
  "context": {"top_key": "chain"}
}
```

`error_type` distinguishes a syntax failure (`BundleParseError`) from a semantic one
(`BundleValidationError`) so a caller (graph-sync today, the Worker eventually) can print the right
sentence without re-deriving it.

### 2.4 What this line does not, and by construction cannot, catch

**[REA]** `load()` succeeding proves the candidate is *structurally and referentially* legal under
the code running **right now**. It cannot catch a config that is legal under **both** an old and a
new version of that code but **means something different** to each — a key the new code silently
stops reading, or reinterprets, without ever raising. This is not a gap in Gate 2's implementation;
it is what "loads successfully" can ever mean for any load-time check, and it is the reason §6 keeps
GUARD 2 rather than retiring it.

---

## 3. Q3 — the failure matrix, in full

Extending `design-the-runtime-compile.md` §3.2's table (Gate 1 fails; Gate 1 passes, Gate 2 fails;
both pass but the forward fails) with the two cells the brief asks for by name, and stating for each
what the caller sees, what is on disk, and what the browser serves.

| # | case | caller sees | on disk (graph server) | browser serves |
|---|---|---|---|---|
| 1 | **Gate 1 fails** (Worker compile throws) | instant refusal, the compiler's own named reason; nothing left the browser's device beyond the attempt | untouched — the graph server was never contacted | last accepted declaration, unchanged |
| 2 | **Gate 1 passes, Gate 2 fails** (`load()` raises against the staged candidate) | the graph server's structured refusal (§2.3), relayed by the Worker in the *second* register (§5.1's "this is valid, and your system will not start with it") | `CONFIG` symlink **untouched**, still the previous target; the staged candidate is moved to the bounded rejected-slot (§1.4.2), never renamed onto `CONFIG` | last accepted declaration, unchanged — the Worker **discards** its already-compiled JS declaration; it was never versioned or stored (§3.2 below) |
| 3 | **Both gates pass, but the ack is lost in flight** (timeout, 5xx, or the response drops after the server already swapped) | the Worker sees failure (a timeout is indistinguishable from "never happened") and, per `design-the-runtime-compile.md` §3.2's third row, **refuses to mint a version** | `CONFIG` symlink **may already point at the new target** — the swap is a server-local fact the Worker cannot observe from a lost response | **stale**: still the old version, even though the engine's live config is the new one — this is the one genuinely dangerous cell; §4 is the answer |
| 4 | **The forward never reaches the server at all** (DNS/network failure before any bytes arrive) | Worker sees a connection failure; refuses to mint | untouched — nothing arrived | last accepted declaration, unchanged |
| 5 | **Both gates pass, the graph server acks durable receipt** (the intended path) | success; the receipt names "accepted, not yet cycled" (`design-the-runtime-compile.md` §3.3/§4.4) | `CONFIG` symlink now points at the new, validated target | new version, immediately — but the **engine's live behaviour** still reflects the old config until its next scheduled cycle (§3.3's window, unchanged by this document) |
| 6 | **The server accepts, then restarts before the next cycle runs** | nothing new — the caller already had its ack from case 5 before the restart | unchanged from case 5: the swap was a durable filesystem rename, not in-memory state, so it survives the restart intact | unchanged from case 5 — still serving the version that was minted; the engine's next cycle, whenever the process comes back, is the first one to actually run against it |

### 3.1 The cell most likely to be got wrong

**Plain-English judgement, not a fact.** `design-the-runtime-compile.md` §3.2 itself flags row 2
(Gate 1 passes, Gate 2 fails) as the most underestimated, and I agree it is easy to get wrong — but
I think row 3 is the one an implementer is more likely to actually ship broken, for a specific
reason: **row 2 is a control-flow bug** (forget to gate the mint call on Gate 2's result — a
one-line mistake, and a fairly obvious one to write a test against, since Gate 2 either passed or it
didn't). **Row 3 needs a mechanism that does not exist anywhere in this codebase yet** — nothing
today makes a repeated `/config` POST with the same bytes safe to retry blindly, because "safe to
retry" is not "harmless," it is "does not double-apply and does not require the caller to know
whether the first attempt actually landed." A developer implementing Gate 2 who tests only the
happy path and the "Gate 2 refuses" path (both of which are easy to construct locally) will very
plausibly never exercise "the response got lost after the server already committed," because it
requires deliberately injecting a network failure *after* the server-side effect but *before* the
reply — the kind of fault that shows up in production timeouts and almost never in a manual test
pass. §4 is the mechanism that closes it; without it, row 3 is a real, silent, and — critically —
undetectable-by-either-side divergence, which is exactly the shape this whole document exists to
rule out.

### 3.2 The discard, named concretely

Row 2's "the Worker discards it" needs a mechanism, not just an instruction. The Worker's
Gate-1-only route (already built by `design-the-runtime-compile.md` §8 step B/D) holds the compiled
declaration only in the response it is about to send, or in an in-flight request's local variable —
**it is never written to D1, never assigned a version, and the code path that would do either of
those things is only reached after the graph-server round trip in §3.1's step 5 returns success.**
There is no separate "undo" step required because there is nothing to undo: the discard is simply
*not calling* the mint function, which is a property of control flow the source document's own step
H must build correctly, not a new mechanism this document adds.

---

## 4. Q4 — two processes, no shared transaction: the weaker guarantee

**Answer: idempotent, content-addressed, at-least-once delivery — never a distributed transaction.
The server's `/config` handler is made safe to receive the same bytes twice (or the same bytes after
a lost reply), and the Worker's rule becomes "never mint on anything less than a confirmed ack,
retry is always safe." This is enough because the two systems never need to agree on *when* a write
happened, only on *what the current bytes are* — and that question can be answered idempotently
without any transaction spanning both processes.**

### 4.1 Why not a distributed transaction

**[REA]** A Cloudflare Worker request and a Fly VM's filesystem write share no commit protocol, and
building one (two-phase commit, a saga with compensating actions) would mean designing and
operating a new piece of distributed-systems machinery for a write that happens on human timescales
(a person edits config, maybe a few times an hour) — solving a problem at a cost the actual traffic
pattern never asks for. The brief already names the better-fitting weaker guarantee; this section is
the argument for why it suffices, not a search for alternatives.

### 4.2 The mechanism: a content hash as the idempotency key

**[NEW]** The server computes `sha256` over the received tar bytes (or, more precisely, over the
same sorted-relative-path-plus-bytes hash `last_valid.py:_compute_bundle_hash` already computes for
its own cache key — reusing that exact function keeps one hash definition in the codebase, not two)
and records it as `last_applied_hash` alongside the swap, in the same durable operation. On any
`/config` POST:

1. Hash the incoming bytes.
2. If the hash equals `last_applied_hash` **and** `CONFIG` already points at the target that hash
   produced: skip the dry-load and the swap entirely, and return the **same** success response as
   the original write. This is the retry-safe short-circuit — a resend of an already-applied write
   is free and has no side effect the second time.
3. Otherwise: proceed exactly as §1 and §2 describe (stage, dry-load, swap-or-refuse).

**[REA]** This turns "did my write actually land?" from a question that requires remembering
request-level state (which request, which attempt) into a question the *bytes themselves* answer —
the same content-addressing principle `design-the-runtime-compile.md` §4.2 already uses for the
per-version declaration URL, applied one layer earlier, to the write itself rather than only to what
gets served afterward.

### 4.3 What the Worker's rule becomes

**Never mint without a confirmed ack; always safe to retry the exact same bytes.** Concretely: on
any response other than a confirmed `{"ok": true}` from the graph server (timeout, 5xx, connection
reset, or an explicit Gate 2 refusal), the Worker refuses to mint — exactly `design-the-runtime-
compile.md` §3.2's third row — **and** it is now safe (not merely permitted) to automatically retry
the same POST, because §4.2 guarantees the retry is a no-op if the first attempt actually succeeded
and a genuine (idempotent) attempt if it did not. Row 3 of §3's matrix stops being a window where the
two systems can silently disagree forever: the *next* retry — automatic, or the next time the person
saves — converges, because the server always answers truthfully about the bytes it currently holds,
regardless of how many times it is asked to apply them.

### 4.4 Why this is enough, and not merely convenient

Plain-English judgement: the property this document actually needs is not "the write happens exactly
once" — it is "a version is never claimed for bytes the server does not durably hold and has not
proven it can load, and no write is ever silently lost in a way neither side can recover from
without human intervention." Idempotent retry delivers exactly that, with no coordination protocol
between two independently-owned processes, because the recovery from *any* failure in §3's matrix is
the same single action — retry the same bytes — rather than a different bespoke recovery per failure
mode. A distributed transaction would buy a stronger property (exactly-once, and a rollback path)
that this design does not need, for a cost this design should not pay: a shared commit log between a
Cloudflare edge process and a Fly VM that does not otherwise exist and that neither side owns.

---

## 5. Q5 — what replaces the git-hash guard? Complement, not subsume

**Answer: Gate 2 complements GUARD 2. It does not replace it, and removing GUARD 2 once Gate 2 ships
would reopen exactly the two of GUARD 2's three recorded near-misses that Gate 2 structurally cannot
see.**

### 5.1 What GUARD 2 actually is, read directly

**[OBS]** `scripts/graph-sync.mjs:267–453` (this repo). GUARD 2 runs **client-side, before any
network call**, inside `graph-sync.mjs cycle`. It hashes the config directory the operator is about
to ship (`hashWorkingConfig`, `git hash-object --stdin-paths` over every file on disk, tracked or
not) and compares it, blob-for-blob, against the config tree at whatever commit `refs/tags/deployed`
names on the remote — **read from the remote every time**, deliberately never trusting a local tag
(`graph-sync.mjs:278–282`'s own comment: a plain `git fetch` does not move an existing tag, so a
stale local one would report safe when it is not). It refuses on any mismatch, and on any case where
it *cannot tell* (no remote, no tag, network down) — it fails closed, never open. It has one override
flag, logged every time it is used (`logOverride`, `graph-sync.mjs:75–81`).

**[OBS]** The three recorded incidents, from the script's own comment (`graph-sync.mjs:269–276`):

1. *old config / new engine* — a retired shell key (`chain`) still present; every cycle died with
   `unknown shell key 'chain'`.
2. *new config / old engine* — `node_type_render.yaml` had moved into `schema.yaml`; the deployed
   engine found no render forms, **fell back to checkbox for everything, and wrote that back over
   the operator's headings** — no error raised, anywhere.
3. *2026-07-30* — the trunk sat four commits ahead of the deploy with `global_defaults.yaml`
   rewritten; cycles "stopped doing anything useful" — again, not a thrown error.

### 5.2 Which of these Gate 2 catches, checked, not assumed

**[OBS]** Incident 1's exact failure — `loader.py:526–533` raises `BundleValidationError` for an
unknown top-level shell key, `chain` included by name in the retirement comment at `loader.py:283`.
**Gate 2 catches incident 1 directly** — a dry-load of that config against today's engine would
refuse it, loudly, before any deletion.

**Incidents 2 and 3 are the opposite shape: the config loaded without error under the mismatched
engine, and produced silently wrong behaviour.** **[REA]** Nothing about "does `load()` raise"
can ever catch a case where it does not raise — that is not a gap in this implementation of Gate 2,
it is the boundary of what a load-time check can mean at all (§2.4). GUARD 2 catches these two
because it asks a different question entirely: not "does this load," but "is this the *exact* config
the currently-deployed commit was built and tested against" — a cruder, broader net that does not
need to understand what changed, only that something did.

### 5.3 The other axis: who GUARD 2 protects, versus who Gate 2 protects

**[REA]** GUARD 2 is logic inside one script (`graph-sync.mjs`), reachable only by the operator's own
`cycle` command, and it has a logged override — it is a habit the operator has built into his own
tool, not a property of the server. Gate 2 lives inside `/config`'s own handler in the engine
monorepo — **every** caller of that route is subject to it, unconditionally, with no override flag
proposed anywhere in this document. This is the sense in which Gate 2 is the stronger guarantee for
what it does cover (§3.4 of `design-the-runtime-compile.md`'s own framing: structurally
uncommittable, not merely detected) — but it is stronger only along the "does it load" axis, and
narrower along the "is it the right config for this engine's intent" axis, which is exactly GUARD
2's job.

**Conclusion: keep GUARD 2 exactly as it runs today. Gate 2 is additive** — a second, independent,
unconditional check that catches a class of failure (a hard crash on load) that today has **no**
protection at all outside `graph-sync.mjs`'s own client-side habit, while GUARD 2 remains the only
defence against the silent-drift class its own incident log shows is real and has happened twice.

---

## 6. Q6 — does the operator's daily sync change? Backward compatibility

**Answer: `graph-sync.mjs cycle`'s code does not need to change to remain correct once Gate 2 ships
— it already aborts safely on a non-`ok` `/config` response. A small, optional enhancement improves
what it prints on refusal; nothing about it is required for backward compatibility with a server that
does not yet have Gate 2.**

### 6.1 The sequence today, read directly

**[OBS]** `scripts/graph-sync.mjs:649–694`, `serverCycle()`: GUARD 2 check → `POST /config` → `POST
/vault` → `POST /cycle` → pull (through GUARD 1). The relevant lines:

```js
const cfgUp = await fetchRetry(`${base}/config`, { method: "POST", ... });
if (!cfgUp.ok) throw new Error(`config push failed: ${cfgUp.status}`);
```

### 6.2 What changes from the caller's point of view

**Nothing structurally.** Today, `/config` only ever answers `{"ok": true, "yaml_files": N}` (or an
auth failure) — the handler has no refusal path. Once Gate 2 ships, a bad config now gets a non-2xx
response instead. `graph-sync.mjs`'s existing `if (!cfgUp.ok) throw` **already** treats that
correctly: it aborts before pushing the vault or running a cycle, which is exactly the safe behaviour
this whole document exists to guarantee — **for free, with zero changes to this script.**

### 6.3 What is worth changing anyway, and why it is optional

The thrown message today would read `config push failed: 422` — true, safe, but not the named,
specific sentence §2.3 designs. A small enhancement: read the JSON body on a non-`ok` response and
print its `message`/`file`/`line` fields, mirroring how GUARD 2's own `refuse()` already formats its
own multi-line refusals (`graph-sync.mjs:68–70`). **This is a UX improvement to an already-correct
abort, not a correctness fix** — it does not belong in this document's plan as a blocking step, and
is sized in §8 as a genuinely optional half-hour.

### 6.4 Backward compatibility, explicitly

`graph-sync.mjs cycle` run against **today's** server (no Gate 2) behaves exactly as it does now —
Gate 2 changes nothing about the success response shape. Run against a **Gate-2-equipped** server, it
behaves correctly on both the accept and refuse paths without modification (§6.2). There is no
version negotiation to design and no flag to add: **the script is compatible with both servers
today, unmodified**, which is the strongest form of backward compatibility available.

---

## 7. A correction to `design-the-runtime-compile.md`'s own dependency claim

**[REA] The single most consequential finding of this design is that the narrow version of Gate 2 —
the one this whole document has been specifying — does not need multi-tenancy at all, and is
buildable in the engine monorepo today, against the one shared `/data/config` that exists right
now.**

`design-the-runtime-compile.md` §7 item 4 states: *"Q3's Gate 2 assumes the graph server already
knows the word 'tenant'… Gate 2 as specified in §3 is not buildable from this repository alone."*
§8 step G repeats this: Gate 2 "needs `design-a-user-owns-their-graph.md` stages 2 and 3."

**Checked against that document directly, this session.** **[OBS]**
`docs/implementation-artifacts/design-a-user-owns-their-graph.md:400–416`, Stage 3 ("the server
learns the word 'tenant'"):

```python
def _tenant(user_id: str) -> tuple[Path, Path]:
    ...
    return root / "vault", root / "state.db"
```

with the sentence directly beneath it: **"`CONFIG` stays shared and is opened read-only."** Stage 3,
as that document specifies it, tenant-izes `VAULT` and `DB` and explicitly, deliberately, **does
not** tenant-ize `CONFIG`. §2 of that same document does leave the door open — *"it does not
foreclose per-user config: `/data/users/<id>/config/` is a fourth path in the same scheme, the day
he wants it"* — but that is a future extension point, not a commitment Stage 3 currently makes.

**[REA] The dependency `design-the-runtime-compile.md` §7/§8 draws is real for the *multi-tenant*
extension of Gate 2 — the version needed for Step H, where a browser submits a per-user config edit
through the Worker to a per-user path on the graph server. It is not real for the single-tenant fix
this document has specified.** The operator's actual, live, daily write path — `graph-sync.mjs
cycle`'s `POST /config` to the one shared `/data/config` — needs nothing from either stage of the
tenancy document. §1–§6 above are buildable, and deliver the full stated purpose of Gate 2 ("config/
engine skew becomes structurally uncommittable") **for the only tenant that exists today**, entirely
within the engine monorepo, with no cross-repo dependency at all.

This is not a criticism of the source document — its own §7 is explicit that it is naming what its
own answers do not solve, in a section titled exactly that. It is a case where separating "Gate 2,
generally" from "Gate 2, for the one config that exists" changes which parts of the arc are blocked
and which are not, and the source document's own framing (Gate 2 as one undifferentiated thing
gated on Step H's prerequisites) does not draw that line. §9 files this as its own backlog row so it
is not lost.

---

## 8. The plan — an implementing agent should need no judgement calls

**How to read this.** Steps 1–4 are in the **engine monorepo** (`QNTM-Network/qntm`), read-only to
this branch, implemented separately. Step 5 is an **optional** enhancement to this repo's
`scripts/graph-sync.mjs`. Steps 6–7 are the **multi-tenant** extension, correctly gated on the
tenancy arc per §7, and are **not** to be built yet.

| step | what | where | size | needs |
|---|---|---|---|---|
| **1** | **Staging + dry-load + refuse, single-tenant** — call `bundle_loader.load()` on the staged candidate before any deletion; on `BundleParseError`/`BundleValidationError`, return the structured refusal (§2.3) and leave `CONFIG` untouched; on success, fall through to step 2 | engine monorepo, `server/app.py` `config_push` | **half a day** | nothing — `bundle_loader` and the error types are already importable (§1.2) |
| **2** | **Symlink swap** — first-boot migration of `CONFIG` from a real directory to a symlink over `config-a`/`config-b`; alternate the inactive target on each accepted write; one atomic `rename()` per swap (§1.3) | engine monorepo, `server/app.py` | **half a day** | step 1 (needs the dry-load to gate what may be swapped in) |
| **3** | **Idempotency key** — hash incoming bytes with the same function `last_valid.py:_compute_bundle_hash` already defines; short-circuit a repeat of the last-applied hash to the same success response without re-swapping (§4.2) | engine monorepo, `server/app.py` | **half a day** | step 2 |
| **4** | **Bounded rejected-candidate retention + unique staging names** (§1.4) — replace the fixed `_config_incoming` name with a per-write unique one; keep the last `SNAPSHOT_KEEP`-style few rejected candidates for inspection | engine monorepo, `server/app.py` | **under an hour** | step 1 |
| **5** | *(optional)* **Print the named refusal** — `graph-sync.mjs`'s `serverCycle()` reads a non-ok `/config` response body and prints `message`/`file`/`line` instead of just the status code (§6.3) | this repo, `scripts/graph-sync.mjs` | **under an hour** | step 1 shipped; not required for correctness (§6.4) |
| 6 | Multi-tenant Gate 2 — a per-user `CONFIG` path to dry-load and swap against | engine monorepo | an arc | tenancy Stage 3 **widened to include CONFIG**, which it explicitly does not today (§7) — this is itself new scope, not just a wait |
| 7 | The full two-consumer write path (`design-the-runtime-compile.md` §8 step H) | both repos | an arc | steps 1–4 here, plus `design-the-runtime-compile.md`'s own D and F, plus step 6 |

### 8.1 The first observable step

**Step 1, alone, half a day, in the engine monorepo.** The moment it ships: `graph-sync.mjs cycle`
— the operator's real, daily command, unmodified — can be run against a config file with a retired
shell key or an unresolvable pattern reference, and instead of the vault losing its live config (as
happened in incident 1, §5.1), the operator sees a named refusal and the previous config keeps
serving every subsequent cycle. **This is observable without a Worker, without multi-tenancy, and
without any change to this repository** — it hardens the exact write path that broke production
twice, today, using the engine's own existing validators. Steps 2–4 remove residual risk (the crash
window, and safe retries) that step 1 alone does not close, but step 1 alone already converts "the
server deletes first and validates never" into "the server validates first and only ever deletes a
config it has proven the replacement is at least as good as loading."

### 8.2 What should not be built yet, restated plainly

**Steps 6 and 7.** Not because Gate 2's *design* is incomplete for them — §1–§4 above already specify
the mechanism a multi-tenant version would reuse (dry-load, symlink swap, idempotency key, all
per-path rather than singular) — but because step 6 needs an amendment to `design-a-user-owns-
their-graph.md` Stage 3 that document does not currently make (§7), and building it ahead of that
amendment means guessing at a tenant-path shape nobody has designed yet. Step 7 additionally needs
the Worker-side work `design-the-runtime-compile.md` already gates on its own steps D and F. **Steps
1–4 are the recommended scope now**: they are useful on their own terms, need nothing this branch
cannot verify, and deliver the entire stated purpose of Gate 2 for the operator's one real config.

---

## 9. Backlog rows this document files

Two rows, in `docs/implementation-artifacts/backlog.yaml`, following the house pattern (a scoped,
buildable capability row; a correction-flag row with no capability, mirroring how
`the-acceptance-test-backlog-row-is-stale` flags drift in another document without silently editing
it):

1. **`gate-two-declines-a-config-it-cannot-load`** — `kind: capability`, `state: diagnose-ready`.
   Steps 1–4 above, single-tenant, engine monorepo only.
2. **`stage-three-does-not-tenant-ize-config`** — `kind: null`, `state: unscoped`. Flags §7's
   correction: `design-the-runtime-compile.md` §7 item 4 / §8 step G assume `design-a-user-owns-
   their-graph.md` Stage 3 hands Gate 2 a per-user path; Stage 3 as written keeps `CONFIG` shared.
   Resolving this is Stage 3's document's to scope, not this row's.

---

## 10. What I refuted

1. **My own first framing: "Gate 2 is blocked on tenancy, full stop."** The task brief itself
   inherits this framing from `design-the-runtime-compile.md` §7/§8. First pass accepted it and
   started sizing "wait for Stage 3" as the plan. **Refuted by reading Stage 3 directly** (§7): it
   keeps `CONFIG` shared, so the single-tenant fix that delivers Gate 2's entire stated purpose for
   today's one real config needs no tenancy work at all.
2. **"The swap needs a two-step rename (old-away, new-in) because that's what `vault_push` already
   does nearby."** First instinct was to mirror the existing sibling pattern. **Refuted by asking
   what a crash between the two renames leaves**: a window where `CONFIG` names nothing, which is a
   smaller version of today's exact defect, not an absence of it. A symlink swap has no such window.
3. **"`load_with_fallback` is the mechanism `design-the-runtime-compile.md` §3.1 points at, so it is
   what Gate 2 should call."** Refuted by reading `last_valid.py` in full: its entire purpose is to
   swallow a validation failure and substitute the cache — calling it for Gate 2 would make a broken
   candidate report success whenever a good snapshot happens to be cached, which is the opposite of
   what a gate needs.
4. **"Gate 2 replaces GUARD 2."** Checked against GUARD 2's own incident log (§5.1): two of its
   three recorded near-misses are silent-drift cases with no thrown error, which no load-time check
   can ever catch by construction. Gate 2 complements GUARD 2; removing GUARD 2 reopens those two.
5. **"`graph-sync.mjs` needs a compatibility flag or version check for Gate 2."** Refuted by reading
   `serverCycle()`'s existing error handling (§6.1): it already aborts correctly on any non-ok
   `/config` response, today, unmodified — Gate 2 only changes what state that response conveys, not
   whether the existing code handles it safely.

---

## 11. Reproduction

```
# worktree state this document was written against:
git rev-parse HEAD                                                    # this branch's base, origin/main @ 8efada8

# Q1/§1 — today's /config handler, delete-then-write, no load attempted (line range unchanged from
# design-the-runtime-compile.md's own citation):
sed -n '470,487p' /Users/lukeannison/projects/qntm-network/qntm/server/app.py       # read-only, trunk clone

# Q1/§1 — the sibling vault_push route, same staging pattern, same structural gap:
sed -n '440,467p' /Users/lukeannison/projects/qntm-network/qntm/server/app.py       # read-only, trunk clone

# Q1/§1 — the dry-load primitive is self-contained (no VAULT/DB/sqlite reference):
rg -n "VAULT|state\.db|DB\b|sqlite" \
  /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/src/qntm_md/bundle/loader.py    # zero hits

# Q1/§1 — server/app.py already imports the bundle package:
rg -n "^from qntm_md.bundle import" /Users/lukeannison/projects/qntm-network/qntm/server/app.py

# Q2/§2 — load() runs five cross-referential validators, not just YAML syntax:
rg -n "validate_patterns|validate_rules|validate_schema|validate_vocabulary|validate_view_registrations" \
  /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/src/qntm_md/bundle/loader.py

# Q2/§2 — a concrete, already-raised BundleValidationError for a retired shell key:
sed -n '520,535p' /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/src/qntm_md/bundle/loader.py

# Q2/§2 — load_with_fallback's job is to SWALLOW a validation failure — the wrong primitive for Gate 2:
cat /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/src/qntm_md/bundle/last_valid.py

# Q5/§5 — GUARD 2, its three incidents, its client-side scope, its override flag:
sed -n '267,453p' scripts/graph-sync.mjs

# Q6/§6 — graph-sync.mjs's existing sequence and its already-safe error handling on /config:
sed -n '649,694p' scripts/graph-sync.mjs

# §7 — Stage 3 keeps CONFIG shared, contradicting design-the-runtime-compile.md §7 item 4's assumption:
sed -n '400,416p' docs/implementation-artifacts/design-a-user-owns-their-graph.md

# §0 — this repo's capabilities.yaml, untouched by this branch:
python3 -c "
import yaml
from collections import Counter
d = yaml.safe_load(open('docs/architecture/capabilities.yaml'))
caps = d['capabilities']
print(len(caps))                                                  # 50
print(Counter(c.get('status') for c in caps))                     # working: 38, undeclared: 12
print(sum(1 for c in caps if c.get('enforcement_depth') is None)) # 36
print(sum(1 for c in caps if c.get('confidence') is None))        # 36
"

# NOT RUN, deliberately: no cycle, no graph-sync, no long verb, no POST to any server, no Worker
# deploy, no git stash, no merge. ~/qntm and ~/.qntm-md were never opened. The trunk clone at
# /Users/lukeannison/projects/qntm-network/qntm was read only, via absolute paths, never written
# and never cd-ed into.
```

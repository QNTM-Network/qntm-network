# Design: the runtime compile — moving the compile from development time into a runtime process

**Status: design. No application source changes on this branch. This document adds itself and
backlog rows.**

**Branch:** `design/the-runtime-compile`, based on `origin/main` @ `91930f3`.

**What this document is not.** It does not re-derive `design-config-is-content.md`'s own
measurements (where the compile runs, the 92%-portable finding, the 0.27 s/0.22 s timing, the
eight places the design assumes his instance) or `design-the-compiler-and-the-bands.md`'s (the
compiler framing, the seven-surface operator set) or `design-pin-the-terms.md`'s (VOCABULARY/
GRAMMARS/RESOLUTIONS, the `resolution.ts` → `rendition.ts` rename) or `roadmap-the-road-ahead.md`'s
(the five-step order, the three bands). Every number those four documents hold is cited to them,
not repeated. **Two of those four were corrected in `d7eff52` after this document's own base
commit; every citation into `design-the-compiler-and-the-bands.md` below is checked against its
§12 corrections, not against its original text.**

**Evidence rule, matching the corpus.** **[OBS]** a command run in this worktree, output read
directly, this session. **[REA]** reasoned from something labelled OBS. **[REPO]** a claim an
already-merged document makes, cited, not reproduced. **[NEW]** a claim this document adds that no
merged document carries.

---

## 0. The pin, stated before the content — which axis this document moves

This document is a **HORIZONTAL** and **TIME** pin. It is **not** a vertical one.

* **HORIZONTAL.** Four already-decided facts (the compile runs in the Worker; the browser never
  interprets YAML; a config the operator set cannot express is refused loudly, named; the
  declaration is now fetched, not baked) are homed against six design questions the operator asked
  by name — trigger, storage, the two-consumer write path, serving, failure, determinism — and a
  seventh he asked answered honestly: what this does not solve.
* **TIME.** This document records a decision (Q1), a design for a path that does not exist yet
  (Q3), and a plan with sizes. It corrects nothing in a merged document; where it disagrees with
  one, §9 says so rather than silently picking a side.
* **VERTICAL — NOT moved, stated plainly.** This document adds no code. **[OBS]** This repo's
  `docs/architecture/capabilities.yaml` holds **50 rows** at this branch's base (38 `working`, 12
  `undeclared`; 36 with no `enforcement_depth`, 36 with no `confidence` — reproduced in §11). **No
  row is touched.** Nothing here names a capability the existing 50 rows do not already cover more
  narrowly than this document would invent — where §8's plan needs a queue address, it files a new
  backlog row rather than a capabilities.yaml row, matching the house pattern
  (`design-the-compiler-and-the-bands.md` §12: *"this correction pass invents no row for it"*).

---

## 1. Q1 — what triggers a compile?

**Answer: the write. A config change compiles the instant it is submitted, inside the same request
that accepts or refuses the write. Not on page load, and not behind a separate button.**

### 1.1 Why not page load

**[REPO]** The compile is cheap — **0.27 s wall / 0.22 s CPU over 276 files**
(`design-config-is-content.md`, "The answer, in one paragraph") — so the objection to page load is
not latency. **[REA] It is that page load has no natural moment to mint a version, and minting a
version is the thing the rest of this document's answers depend on.**

A declaration is going to be served under an immutably-cacheable, versioned URL (§4). That scheme
only works if "the version" means something stable: **one canonical compile per accepted config
change**, not one compile per person who happens to open a tab. Compiling on load breaks that in
two concrete ways:

1. **It multiplies cost by traffic, not by edits.** A config that changes once and is read by ten
   people a minute would compile once at write time and be read ten times for free from cache; at
   load time it compiles up to ten times for one edit, and the multiplier is unbounded because nothing
   about the operator's config governs how often a person reloads the page.
2. **It has no answer to "who saw which version, and when."** Two tabs loading within the same
   second could each trigger a compile and each mint their own idea of "current" if compiling and
   versioning are the same act — there is no request that is uniquely "the" request that gets to
   decide the new version is now live. Compiling on write has exactly one such request: the one that
   is also deciding whether the write is even accepted.

### 1.2 Why not an explicit button

**[REA] A separate "compile now" affordance reopens the exact failure this whole document exists to
close**, restated in the operator's own words about the defect that motivated `design-config-is-
content.md` in the first place: *"someone must rebuild and redeploy the app"* becomes *"someone must
remember to press compile"* — the verb changes, the shape (a human-forgettable step between an edit
and its effect) does not. Two further, sharper reasons:

* **It breaks the non-negotiable refusal contract.** *"A config the operator set cannot express
  must be REFUSED loudly at compile time, named"* only holds if compile time and write time are the
  same moment. A refusal that waits for a separate button press is not loud — it is deferred to
  whenever someone next remembers to look, which for a person who is not the operator may be never.
* **It defeats the scoped receipt.** **[REPO]** `design-config-is-content.md` §5.3 point 1: *"the
  receipt carries what is new since the last version, not all 309."* A receipt is only meaningful as
  a delta over ONE edit. A button a person presses after several accumulated changes conflates
  several edits into one delta and the sentence "you just added this rule" stops being true.

### 1.3 What "the write is the trigger" means concretely

The write IS the compile. There is no intermediate state where a config change exists but is
uncompiled. This is not a new mechanism — it is Gate 1 of the two gates `design-config-is-content.md`
§4.3 already specifies (*"Gate 1 — the compile, in the Worker. Fast, and free… It is the same call
that produces the table"*); this section's contribution is naming WHEN that gate fires, which the
source document assumed rather than argued.

**What does not change.** The CLI caller (the operator running the generators by hand, and CI's
`checkdeclarations.mjs` staleness gate) is unaffected — it remains a second, independent caller of
the same pure `compile(files)` function, exactly as `design-config-is-content.md` §2.2(b) already
names it (*"One compile module, three callers: the CLI (unchanged, for the operator and CI), the
Worker (authoritative), the browser (preview only)"*). This document does not touch that path.

**What this rules out, restated as a table, because the operator asked for both sides of the
argument:**

| trigger | verdict | the reason that actually governs |
|---|---|---|
| on page load | refused | no natural moment to mint one version; cost scales with traffic |
| on an explicit button | refused | reintroduces a forgettable step; breaks the loud-refusal contract; breaks the scoped receipt |
| **on the write** | **taken** | it is the same request that decides whether the write is accepted at all — one moment, one version, one receipt |

---

## 2. Q2 — where does the YAML live once a person can edit it in a browser?

**Answer: a directory on the graph server's volume, per user — `/data/users/<user_id>/config/` —
extending a decision already made, not proposing a new storage product.**

### 2.1 The precedent this reuses

**[REPO]** `design-a-user-owns-their-graph.md` §2, Option 4 already designed a directory-per-user
scheme for a person's **graph and vault**, deliberately scoping config OUT: *"the engine
configuration is SHARED and that is deliberate… Nothing below designs config tenancy."* But that
document's own Option 4 names the extension point by hand: *"It does not foreclose per-user config:
`/data/users/<id>/config/` is a fourth path in the same scheme, the day he wants it. Nothing here
has to be undone to get there."* **This document is the day.**

**[REA] The reason to take that offer rather than invent a fourth storage product is the same
reason that document gave for vault and graph: the engine reads config as files on a filesystem, by
argument, not by a global.** `server/app.py:46` — **[OBS]** `CONFIG = Path(os.environ.get
("QNTM_CONFIG", "/data/config"))`, and every route uses it unqualified, exactly the pattern
`design-a-user-owns-their-graph.md` §1 already proved for `VAULT`/`DB`. Putting config anywhere the
Python engine cannot open with `readFileSync`-equivalent file I/O means either rewriting the
engine's config loader against an HTTP-backed store (an arc, in a repository this branch cannot
touch) or adding a synchronisation step that copies bytes from that store onto a filesystem before
every cycle — which is a config directory with extra steps, not a different design.

### 2.2 The four candidates, priced against that constraint

* **Object storage (R2).** **[OBS]** `worker/wrangler.toml:19-23` — commented out, *"R2 is not
  enabled on this account."* Even enabled, R2 is a bucket the Worker can read; Fly cannot mount it
  as a filesystem, so the engine would still need a sync step. **Right tool for the compiled
  DECLARATION at scale** (§7 step 4 of `design-config-is-content.md` already names R2 as the fix for
  D1's 950,000-byte row ceiling once a declaration outgrows it) — **wrong tool for the raw config
  the engine reads directly.**
* **Worker KV.** **[OBS]** No KV binding exists today (`worker/wrangler.toml` — one D1 binding and
  nothing else). Adding one is a dashboard step, not code — cheap. But KV is eventually consistent
  across Cloudflare's edge (on the order of tens of seconds to propagate globally), which
  reintroduces a stale-read race for the *same* person across two requests — a real cost against
  "who sees what when," and it still cannot be read by the Python engine directly.
* **A database (D1).** Already the Worker's one binding, and already used for small per-user facts.
  Storing 283+ files per user as rows avoids any one row's size ceiling, but multiplies rows (D1's
  own cost is per-row overhead, not raw bytes) and — the same objection as the other two — the
  engine cannot query D1 directly; whatever wrote there would still have to hand the graph server a
  file tree.
* **The graph server, a directory per user.** No new product. The pattern (`design-a-user-owns-
  their-graph.md` §1, §2 Option 4) is already argued: *"the isolation unit is a file… the engine
  needs no change… forward-compatible with a machine per user later."* The engine reads it exactly
  as it reads `/data/config` today, with a tenant-derived path instead of a hardcoded one.

### 2.3 What the Worker stores, and what it does not

**[REA] The Worker is not a second copy of the source YAML.** It receives a write, compiles it
in-process to run Gate 1 (§1.3), and forwards the accepted bytes to the graph server, which is the
durable store. What the Worker DOES keep, durably, is the **compiled declaration** — small (139–161
KB today, §11), already the shape D1 holds comfortably, and per-user exactly the way graph snapshots
already are (**[OBS]** `worker/schema-app.sql:97-109`, keyed by `user_id`). This is the same split
`design-config-is-content.md`'s own three targets already draw: the engine reads the source, the
browser reads the compiled artefact, and nothing needs to read both.

---

## 3. Q3 — THE HARD ONE: a write must reach both consumers, or neither

**Answer: there is one write, not two. It reaches the engine and the browser through one sequenced
request, gated twice, and it commits to neither consumer until both have said yes. This is the
hardest part of this design, and it is harder than Q1 or Q2 because it is the only place two
independently-owned processes — a Cloudflare Worker and a Fly Python server — must agree about one
fact with no shared transaction between them.**

### 3.1 The sequence

Building on the two gates `design-config-is-content.md` §4.3 already specifies and prices, and
Q1's finding that the write and the compile are one event:

1. **The browser submits an edit** to a Worker route that does not exist today — **[OBS]** verified
   by re-running the enumeration `design-config-is-content.md` §2.4 did: sixteen routes, none
   `/config`, confirmed again at this branch's base (§11).
2. **Gate 1, in the Worker, in the same request.** Compile the submitted bytes in-process
   (`compile(files)`, §7 step B below). If it throws, or a generator's own `refuse()` fires: **stop
   here.** Nothing is forwarded to the graph server. Nothing is stored. The engine's config is
   untouched; the browser's declaration is untouched. This is the easy failure — one surface, no
   partial state — and it is the one `design-config-is-content.md` already designed.
3. **If Gate 1 passes, the Worker forwards the same bytes to the graph server**, synchronously, as
   part of handling the same request — the data path `design-config-is-content.md` §1.2 already
   names (*"laptop YAML → graph-sync POST /config → /data/config"*), with the Worker standing in for
   the laptop and a per-tenant path (`design-a-user-owns-their-graph.md` stage 3's `_tenant`
   pattern) standing in for the single hardcoded directory.
4. **Gate 2, on the graph server, inside the same `/config` handler, before anything is accepted.**
   **[OBS]** Verified directly against `server/app.py:470-487` (read-only, trunk clone): today's
   handler is authenticate → extract tar → `shutil.rmtree(CONFIG)` → rename → return `{"ok": true}`.
   **No load is attempted before the old config is deleted.** `design-config-is-content.md` §4.3
   already names the fix and the mechanism it reuses: *"the transaction opens before the bundle
   load precisely so a failed bundle can fall back to a cached snapshot"* (`orchestrator.py:5344`).
   Gate 2 must run **inside** the write, not on the next cycle: dry-load the candidate bundle: if it
   fails, refuse the write and do not delete the previous config.
5. **The Worker receives the graph server's verdict and only then decides what to do with the
   declaration it already compiled in step 2.**

### 3.2 What happens when one succeeds and the other fails — named, not left implicit

This is the question the brief says is likely underestimated, so each combination gets its own
sentence.

| case | what already happened | what must happen |
|---|---|---|
| **Gate 1 fails** | nothing sent anywhere | refuse the write; report the compiler's own reason (§5); engine and browser both untouched |
| **Gate 1 passes, Gate 2 fails** | the Worker holds a JS-valid compiled declaration the engine has just refused | **discard it.** Do not version it, do not store it, do not serve it. Report the graph server's reason, in the second sentence's register (§5). The engine's refusal is the one that counts — Gate 1 can only ever be a necessary filter, never a sufficient one (`design-config-is-content.md` §4.3: *"it certainly accepts forms the engine will reject, because it does not know the schema"*) |
| **Both gates pass, but the forward itself fails** (timeout, 5xx, partition) | the Worker has a valid declaration and an unconfirmed write | **refuse.** The Worker may not mint a version until the graph server's own `/config` handler has returned success for bytes it has already dry-loaded — an ack of durable receipt, not merely of an attempt |
| **Both gates pass, the graph server acks durable receipt** | both consumers hold the same bytes; the engine has confirmed they load | **only now** mint the version, store the declaration under it, flip the pointer (§4), and answer the browser's receipt (§5) |

**[REA] The load-bearing sentence in this table is the second row.** It is the one case where the
two systems could plausibly disagree — the Worker's JS-side grammar and the Python engine's schema
are two independent implementations of "is this legal," by design (`yaml-subset.mjs` refuses forms
PyYAML accepts and accepts forms the engine will reject) — and the design answer is not to reconcile
them into one grammar (already refused, `design-config-is-content.md` §2.2(a),
`one-implementation-per-concern`); it is to make the ENGINE's answer the only one that can ever
commit a version. **A version is minted after both gates pass, never after one.** That is what makes
"the front-run and the engine diverge silently" structurally impossible rather than merely detected
after the fact — stronger than GUARD 2, which could only ever notice skew once it already existed
(a git-hash comparison run separately from the write that caused the skew).

### 3.3 The window this does not close, named rather than hidden

**[REA] Even after both gates pass, the ENGINE does not run against the new config until its next
cycle** — `server/app.py`'s own docstring, quoted in `design-config-is-content.md` §1.2: config
*"takes effect on the next cycle without a redeploy."* A dry-load (Gate 2) proves the bundle
*would* load; it does not run one — it rolls back by construction (`orchestrator.py:5344`'s own
transaction). So between "the graph server durably holds the new config and confirms it loads" and
"the engine's next cycle actually runs against it," the browser's declaration is live and correct
about the NEW config while the running engine's LIVE BEHAVIOUR still reflects the OLD one.

**This is not the silent divergence the brief warns against — both sides are internally honest, and
each is correct about a different moment — but it is a real gap and it must be said, not
absorbed into "it will work out."** It is exactly the fourth part of the receipt
`design-config-is-content.md` §4.4 already specifies: *"the engine has, or has not, accepted it
yet"* — and this section is what makes that sentence concretely true rather than aspirational: it
can now say **"accepted, not yet cycled"** with confidence, because Gate 2 already confirmed
acceptance before the receipt was sent.

### 3.4 Is this the hardest part

**Yes, and the reason is structural, not a matter of degree.** Gate 1 is a pure function with no
network. Q1's trigger decision is an ordering question inside one process. This is the one place
the design must coordinate two processes with two different failure domains — a Cloudflare edge
request and a Fly VM's filesystem — that share no transaction, over a network call either side of
which can fail independently, into a construction where the only permitted user-visible wrongness is
a WINDOW the receipt already names (§3.3), never a SILENT one. Every other question in this document
resolves inside one system. This one does not.

---

## 4. Q4 — what is served, and how is it invalidated?

**Answer: a per-user, per-version, immutably-cacheable declaration body, behind a small, always-
revalidated pointer. Nothing is ever invalidated — a version is never wrong for the version it
names; what changes is which version the pointer names, and that change is the same request that
accepted the write.**

### 4.1 Today, restated precisely because it is about to change shape

**[OBS]** `app/index.html:1172` (`DECLARATION_URL = "/presentation.json"`) and the comment directly
above it, verified at this branch's base: the file is served *"at the site root, by the same GitHub
Pages origin that serves this page — access-control-allow-origin: *, an ETag, max-age=600."* The app
defeats the 600-second cache with `cache: "no-cache"` on every `loadPresentation()` call
(`app/index.html:1202`), because **the declaration carries no version yet** — a plain cached fetch
would show a stale copy for up to ten minutes after every change, so the app pays a full
revalidation round trip on every page load instead, which is the cost §7 step 1 below removes.

### 4.2 The scheme this design needs

Two tiers, the standard shape for content that changes rarely but must never be served stale by
accident:

1. **A tiny, mutable pointer** — "what is the current version for this user" — served with a short
   or absent cache lifetime, because it must always answer freshly. This is the thing that changes
   the instant §3's sequence accepts a write, and it should live somewhere strongly consistent (D1,
   which the Worker already has) rather than KV (§2.2's propagation-delay objection applies here
   too, for the same reason).
2. **A large, immutable body** — the declaration itself, at a URL keyed by its version (a content
   hash, §6) — served `Cache-Control: public, max-age=31536000, immutable`. It is safe to cache
   forever because a version, once minted, never changes; §3.2's table guarantees a version is only
   ever minted once both gates have passed.

**[REA] This is the fetch the app's own comment on `loadPresentation` already names as the seam:**
*"The declaration coming from a SERVER that compiled it — config-as-content in full — is steps 3 and
4 of `design-config-is-content.md`, and this line is the seam they will land on: only the URL
changes"* (`app/index.html:1124-1139`). §4.2's pointer/body split is what that sentence resolves to
concretely: the URL becomes two URLs, one cheap and volatile, one expensive-once and permanent.

### 4.3 Where this is served from

**The Worker, not GitHub Pages.** **[REA]** GitHub Pages is a static file server for one repository
with no notion of a user and no way to accept a write — it can serve exactly the single-tenant
`presentation.json` it serves today, unchanged, for as long as there is exactly one config. The
moment a declaration is per-user, serving it requires the same authority that accepted the write
that produced it, which is the Worker (already the config-write path per §3). This becomes a
seventeenth Worker route, alongside the write route from §3.1.

### 4.4 What does not change yet

**[REA] Nothing here forces today's single-tenant path to move before a second writer exists.** The
operator's CLI → commit → GitHub Pages flow is untouched by this document, because the trigger
being designed (§1) and the scheme being designed here are both properties of a write path that does
not exist yet for anyone but the operator's own laptop. This bites only once §8 step C below ships,
which is deliberately not "now."

---

## 5. Q5 — what does a compile failure look like to a person?

**Answer: two different sentences for two different failures, both instant relative to the save,
neither a stack trace — and the system serves the last accepted declaration throughout, never
nothing.**

### 5.1 The two refusal registers, already argued, now grounded in a real example

**[REPO]** `design-config-is-content.md` §4.3's own two sentences map directly onto §3.2's table:

* **"This is not valid configuration"** — Gate 1. **[OBS]** A real instance of exactly this
  sentence already exists and has been exercised: the operator's own acceptance test
  (`tests/app-generality-acceptance.test.mjs:519`) asserts
  `QUALIFICATION.refused["gentest-widgets-archived"] === "unresolvable field(s): project"`, produced
  by `scripts/generate-qualification-declaration.mjs:306`'s `refuse()` call. **This is not a
  hypothetical error string — it is the exact shape a real refusal already takes**, named at the
  operator's own artefact (a field a section's qualification references), not at the generator's
  internals.
* **"This is valid, and your system will not start with it"** — Gate 2. Cannot be produced by the
  Worker at all, by construction (§3.2's second row): `yaml-subset.mjs` "certainly accepts forms the
  engine will reject, because it does not know the schema" (`design-config-is-content.md` §4.3). The
  reason surfaced here is the ENGINE's, carried back through the Worker, not guessed at.

### 5.2 A third register that is not a refusal at all

**[REPO]** The `dropped` ledger (`design-config-is-content.md` §5) is a different thing again: both
gates pass, and something in the config still cannot be expressed as a local answer. This document
does not re-derive it — it cites it as the mechanism that already exists, already tested
(`scripts/ledger.mjs`), and already argued to need a `kind` split between *"this works, it will not
feel instant"* and *"this will never appear, spell it differently"* (§5.3 of that document). **[REPO
— `design-pin-the-terms.md` §2.2 item 1]** confirms that split has not landed: *"there is no `kind`
field anywhere in `Ledger`."* Still true at this branch's base — **[OBS]** `grep -n "kind" scripts/
ledger.mjs` returns nothing.

### 5.3 What is served in the meantime — the last good declaration, never nothing

**[REA] This follows directly from §3.2's table, not as a separate design choice.** A refused write
(either gate) never mints a version. The pointer (§4.2) keeps naming the last accepted one. A
person's browser keeps rendering exactly what it rendered before they pressed save — there is no
moment where "nothing" is the answer, because nothing was ever provisionally served in the first
place. Their rejected draft is not silently discarded either: `design-config-is-content.md` §4.1
already generalises `held.ts`'s posture (*"a record with no line index, deliberately… so it can be
reported and never replayed"*) to a config write, and this document does not need to add anything to
that argument — it is the same shape at a larger grain.

### 5.4 Where the refusal appears

**[REA] Co-located with the edit, never a console warning nobody reads.** `design-config-is-
content.md` §5.2 already proved, by positive enumeration rather than a grep for absence, that the
CURRENT ledger mechanism is read by nothing (`grep -rn "dropped" worker/` — zero hits; every mention
in `app/index.html` is inside a comment). **The refusal contract this document specifies must not
repeat that mistake**: it belongs in the same surface where the person typed the YAML — the config
editor, §8 step F, deliberately last, out of scope to build here, but this section fixes the
CONTRACT it must honour: a named, specific sentence, not a generic "invalid config," using the same
"named at the operator's own artefact" register §5.1's real example already demonstrates.

---

## 6. Q6 — is the compile idempotent and deterministic?

**Answer: yes, checked directly against the generators, not assumed — with one real precondition
for the Worker specifically that is not yet verified.**

### 6.1 What was checked, and how

**[OBS]** Grepped directly, this session, at this branch's base, across all three generators plus
`yaml-subset.mjs` and `ledger.mjs`:

* **No timestamp source.** `grep -n "Date\.now\|new Date(\|toISOString"` — zero hits.
* **No randomness source.** `grep -n "Math\.random\|randomUUID\|crypto\."` — zero hits.
* **Directory order never leaks.** Every one of the eleven `readdirSync` call sites across the three
  generators is immediately `.filter((f) => f.endsWith(".yaml")).sort()`'d before use — verified by
  reading each of the eleven sites, not by pattern-matching one and assuming the rest.
* **The ledger sorts its own keys before serialising** — `scripts/ledger.mjs`'s `toJSON()`, with the
  reason in its own comment: *"a map whose order follows directory-walk order would produce a
  spurious diff every time a file is renamed."*
* **No absolute path or username reaches the output.** `grep -o "lukeannison" presentation.json` —
  zero hits. `scripts/monorepo-config.mjs`'s `fileURLToPath` resolves a path used only to LOCATE the
  config directory to read; it is never written into the declaration's own bytes.

### 6.2 The live test, run three times

**[OBS]** `node scripts/checkdeclarations.mjs`, run three times in a row against the real 276-file
monorepo config, byte-identical output, exit 0 every time (reproduction, §11). **This is not a
synthetic determinism test — it IS one, running continuously in this repo already**: `--check`
recomputes the declaration fresh on every invocation and asserts `JSON.stringify(current) ===
JSON.stringify(generated)` (`scripts/checkdeclarations.mjs:68`). Three back-to-back passes with
identical output over unchanged input is the falsifier `design-config-is-content.md` §7 step 3
itself specifies (*"Run the CLI before and after; assert `presentation.json` is byte-identical"*),
run here rather than assumed.

**Conclusion: yes, verified deterministic and idempotent for the CLI caller, today, over the
operator's real config.**

### 6.3 What this does not yet verify

**[UNVERIFIED]** Whether a Cloudflare Worker's JavaScript runtime (V8 isolates) produces
byte-identical `JSON.stringify` output to Node's V8 for the same object graph. In practice this is
very likely — same engine family, and the ECMAScript spec fixes string-keyed object enumeration
order — but it is exactly the class of assumption this branch's own house rule says to check rather
than take on faith, and it is not verifiable from this worktree: it needs a deployed Worker, which
this branch is forbidden from doing. **[REPO]** `design-config-is-content.md` §7 step 4's own second
falsifier is the actual test (*"Compile a fixture config in the Worker and with the CLI; assert the
two objects are byte-identical, `dropped` included"*) — named there, not yet run anywhere, and §8
step E below is where it belongs.

---

## 7. Q7 — what does this NOT solve?

**Every answer above is designed against a system with exactly one writer. Naming where that shows,
so nobody discovers it later.**

1. **Q2's per-user directory assumes retention has already landed.** **[REPO]** `design-a-user-
   owns-their-graph.md` §3.5 already found the precondition for ANY new per-tenant data on the graph
   server's volume: *"ship tenancy onto a 22 MB/day-per-user leak and you have not built a product,
   you have built N copies of a leak."* Config data is smaller per-user than the graph, but it is
   still new per-tenant data on the same volume, and that document's stage 2 (retention) is not
   this document's to build or to skip past.
2. **Q1's "the write" presumes one canonical writer.** With two tabs or two devices for the *same*
   person — already possible for the single operator today — a race between two near-simultaneous
   writes needs a serialisation point. **[REPO]** `design-config-is-content.md` §4.2 already names
   the shape of the fix (*"the config precondition is a bundle version, not a file hash"*), but it
   has never been tested against two REAL concurrent writers, because there has only ever been one.
3. **Q4's per-version URL assumes a resolved user identity on every declaration request.** Today
   `GET /presentation.json` is anonymous — a static asset, no session. The moment it is per-user,
   every reader needs a session before the declaration can be fetched at all, changing the app's
   cold-load sequence from "fetch a public file with a 5-second timeout" to "resolve a session, then
   fetch." Not designed here.
4. **Q3's Gate 2 assumes the graph server already knows the word "tenant."** **[REPO]** `design-a-
   user-owns-their-graph.md` stage 3 — *"the server learns the word 'tenant'"* — is not built.
   Without it there is no per-user path for a dry-load to run against, and Gate 2 as specified in §3
   is not buildable from this repository alone.
5. **The size numbers this document leans on are his.** **[REPO]** `design-config-is-content.md`
   §8.2: the declaration is 138–161 KB and growing, comfortably inside D1's 950,000-byte row
   ceiling **today**. A second user's heavier config is not bounded by anything this document
   designs — cited, not re-derived, and repeated here because §4's serving scheme silently assumes
   the comfortable case unless someone checks the next user's number before relying on it.
6. **This document does not re-scope `config-is-per-user-not-per-server`.** **[REPO]** That row is
   already filed, `unscoped`, deliberately, in `backlog.yaml`, for the same reason
   `declare-the-hosted-application` is: scoping it is a design pass, not a row. Everything in this
   §7 sharpens why it stays unscoped rather than arguing it should be scoped now.

**[REA] Stated plainly: Q1 and Q3's sequencing are well-defined only because there is one writer,
and Q2's directory answer is well-defined only because `/data/config` today has no tenant
dimension to get wrong.** This document's own plan (§8) is written to build what does not need a
second user to be safe, and to stop, named, at the point where it does.

---

## 8. The plan — an implementing agent should need no judgement calls

**How to read this.** Steps A–G build and ship the single-tenant runtime compile — the operator's
own config, still the only config that exists, still writing to the one shared directory it writes
to today, but compiled on write instead of by hand. None of A–G needs a second user or the graph
server's tenancy work to be safe, because the write in question is still the operator's own. Steps
H–J need `design-a-user-owns-their-graph.md`'s retention and tenancy stages first, and are gated on
them explicitly rather than sequenced as if this document could deliver them alone.

**What is already done, for orientation — not part of this plan:** `design-config-is-content.md`
§7 step 2 (the declaration is fetched, not baked — `b2a97af`); the operator's own acceptance test
run for the first time (`91930f3`); a membership abstention made visible (`61f9fd9`). None of these
touch the Worker; all of them are preconditions this plan reads as already satisfied.

### Step A — the declaration carries a content-hash version · **under an hour** · needs nothing

**[REPO]** `design-config-is-content.md` §7 step 1, unchanged, cited not re-derived. **[OBS]**
confirmed not yet shipped: `presentation.json`'s top-level keys, read directly this session, are
`note, checkbox, heading, prose, tags, stamp, indentUnit, structural, qualification, resolution` —
no version key. **Falsifier**, restated from the source document: change one byte of one config
file, regenerate, assert the version changes; change nothing, regenerate, assert it does not.

### Step B — the FIRST OBSERVABLE STEP: prove the runtime compile on one generator · **about a day** · needs A

**This is the step to build first, and it is smaller than "the whole compile moves."**
`design-config-is-content.md` §7 step 3 already prices "the compile becomes a pure function" as an
arc that "splits… half a day each for structural and qualification… an arc for all three, landing
one at a time." **Take the smallest slice all the way through, rather than the whole arc partway:**

1. **Refactor `generate-structural-declaration.mjs` alone** into `compile(files) →
   {declaration, dropped}` (pure) plus a thin CLI shell. **[OBS]** It is the smallest of the three —
   386 lines, 9 of the 36 total `fs` call sites (`design-config-is-content.md` §2.1). **Half a
   day.** Falsifier: run the CLI before and after, assert `presentation.json`'s `structural` key is
   byte-identical.
2. **Add a Worker route that runs Gate 1 only, for structural config alone**: accept a submitted
   file map, call the now-pure `compile`, return the compiled `structural` object or the refusal.
   Nothing is stored, nothing is forwarded to the graph server, no version is minted. **Half a
   day.**

**Why this, first, and why it counts as observable.** A person (not the operator, not reading code)
can POST a structural-config fragment with a bad edge vocabulary value to a real endpoint and watch
it refuse, named, in the shape §5.1 already demonstrates is real (`unresolvable field(s): project`
is the qualification generator's version of exactly this). It proves Q1's trigger and Q5's refusal
contract end-to-end, on real infrastructure, without needing the graph server, without needing
multi-tenancy, and without touching anything durable. **It is the answer to "name the first step
that delivers something observable."**

### Step C — extend the pure-function refactor to the other two generators · **the rest of the arc** · needs B

Qualification (686 lines, 11 fs sites) then resolution (1,025 lines, 16 fs sites, goes last —
`design-config-is-content.md` §7 step 3). Each half a day on the same falsifier as step B.1.

### Step D — extend the Worker's Gate-1-only route to all three generators, plus the conformance test · **half a day** · needs C

The route from step B now compiles the whole declaration. Add the byte-identical conformance
assertion `design-config-is-content.md` §7 step 4 specifies as its second falsifier — compile a
fixture in the Worker and with the CLI, assert equality, `dropped` included. **This is also where
§6.3's one unverified item gets settled**, and it should be settled here, not assumed.

### Step E — the version-abstain mechanism · **half a day** · needs A, and the fetch (already shipped)

**[REPO]** `design-config-is-content.md` §7 step 5 / §6.2, cited not re-derived: on a version
change, every local answer abstains and re-derives, rather than answering from a stale ordinal.
**Falsifier, restated because the source document is emphatic about it**: it must be built and
tested against the REORDER case (two sections swapped, nothing renamed), because the rename case
already fails loudly and would pass without the fix.

### Step F — the receipt carries the dropped delta, with a `kind` split · **half a day** · needs D

**[REPO]** `design-config-is-content.md` §7 step 6 / §5.3, cited not re-derived: the delta since the
last version, split between *"this works, it will not feel instant"* and *"this will never appear."*
**[OBS]** confirmed still needed at this branch's base — `Ledger` carries no `kind` field.

### — the line where this plan stops needing only this repository —

### Step G — Gate 2, the dry-load endpoint, and config retention · **an arc, and it needs the OTHER repo** · needs `design-a-user-owns-their-graph.md` stages 2 and 3

**[REPO]** `design-config-is-content.md` §7 step 7, cited not re-derived: the dry-load endpoint and
"stop deleting the previous config" (§4.5 mechanism 1, and §3.1 of this document). **This document
adds the explicit cross-document gate**: Gate 2 cannot exist before `design-a-user-owns-their-
graph.md` stage 3 ("the server learns the word 'tenant'") gives the graph server a per-user path to
dry-load against, and should not be built before that document's own stage 2 (retention) lands,
because config is new per-tenant data on the same volume that document already found cannot absorb
more without pruning first (§7.1 of this document).

### Step H — the two-consumer write path, in full · **an arc** · needs D, F, G, and stage 3 of the sibling document

§3's full sequence: forward to the per-tenant graph server path, Gate 2, ack-then-mint. This is
where Q3's design becomes code, and it is not buildable earlier because it needs G's dry-load
endpoint and a per-tenant path that does not exist in this repository.

### Step I — the config editor in the browser · **an arc** · needs A–H

**Deliberately last, unchanged from `design-config-is-content.md` §7 step 8's own conclusion, and
this document does not re-argue it**, only reaffirms it still holds against everything above: *"a
surface that invites config writes before the write path can refuse, explain and revert is a
surface that helps users break themselves."*

### 8.1 What should not be built yet, stated plainly

**Steps G, H and I.** Not because they are wrong — because they are unsafe to build ahead of a
retention arc this document did not author and cannot ship, and building the editor (I) ahead of
Gate 2 (G) hands a person a write path with strictly less protection than the operator's own,
exactly the warning `design-config-is-content.md` already gives about GUARD 2's replacement.
**Steps A–F are the recommended scope right now**: they make the operator's own single-tenant
config live-compiled without needing multi-tenancy to be safe, and every one of them is useful on
its own terms even if the tenancy arc slips.

| step | what | size | needs |
|---|---|---|---|
| A | version key | under an hour | nothing |
| **B** | **structural slice, pure function + Worker Gate 1** | **about a day** | **A — first observable step** |
| C | qualification + resolution, pure function | rest of an arc | B |
| D | Worker Gate 1 for all three + conformance test | half a day | C |
| E | version-abstain (reorder case) | half a day | A |
| F | receipt carries dropped delta, `kind` split | half a day | D |
| G | Gate 2 + retention | an arc, cross-repo | sibling doc stages 2–3 |
| H | the full two-consumer write path | an arc | D, F, G |
| I | the config editor | an arc | A–H |

---

## 9. What I refuted

1. **My own first framing of Q1 as a latency question.** The brief warns against assuming latency
   is the constraint, and the first-draft instinct was still to reach for the 0.27 s/0.22 s number
   as the argument. **Refuted by my own second pass**: the number proves compiling on load would be
   *affordable*, not that it would be *correct* — the actual objection is that load has no natural
   version-minting moment, which is a "who sees what when" problem, exactly as the brief predicted.
2. **"The Worker becoming the config path is symmetrical with the graph path."** Implicit in an
   early draft of §3. **Refuted**: the graph path (`design-a-user-owns-their-graph.md`) has one
   consumer per write — the browser reads what was written. Config has two, with two different
   acceptance criteria, which is exactly why §3 needed a two-gate sequence the graph path never
   needed.
3. **"GUARD 2's replacement (Gate 2) merely detects skew, the same as GUARD 2 does."** Checked
   against §3.2's own table and refuted: Gate 2, sequenced as this document specifies (inside the
   write, before a version is minted), makes skew *impossible to commit*, not merely *detectable
   after landing* — a strictly stronger property than the git-hash comparison it replaces, because
   GUARD 2 could only ever run separately from the write that caused the skew.
4. **"An immutable per-version URL is a smaller change than it sounds."** First reading of §4
   treated the pointer/body split as an implementation detail. **Sharpened, not refuted**: it is the
   concrete resolution of a sentence already committed to running code
   (`app/index.html:1124-1139`'s own comment naming this exact seam), which makes it load-bearing
   rather than optional — the app's `cache: "no-cache"` on every load only exists because this
   scheme does not yet exist.
5. **The implicit premise that determinism only needed checking for the Worker, since the CLI
   already "obviously" works.** **Refuted by my own check**: nothing in the corpus had actually run
   the CLI's own `--check` three times in a row and read the result before this document did (§6.2)
   — "obviously" was standing in for a check that had not been performed.

---

## 10. What is unverified

* **[UNVERIFIED]** Whether a Cloudflare Worker's V8 isolate produces byte-identical
  `JSON.stringify` output to Node's V8 for the same declaration object. **Settled by** step D's
  conformance test, once a Worker route exists to test against — not verifiable from this
  worktree (§6.3).
* **[UNVERIFIED]** Whether D1's per-row size ceiling (950,000 bytes, `worker/src/app.js:440-447`)
  holds comfortably for a second user's declaration, or only for the operator's. **[REPO]**
  `design-config-is-content.md` §8.2 already names this as his-instance-only; not re-measured here
  because it needs a second user's config, which does not exist (§7.5).
* **[UNVERIFIED]** Whether the two-gate sequence in §3 is affordable inside a single Cloudflare
  Worker request's CPU-time budget once it includes a synchronous round trip to the graph server for
  Gate 2 — the compile alone is cheap (§6), but a cross-process dry-load adds real network latency
  this document did not measure, because Gate 2 does not exist yet to measure. **Settled by**
  timing step G's dry-load endpoint once it is built.
* **[UNVERIFIED]** Whether the graph server's transaction mechanism (`orchestrator.py:5344`,
  `_load_with_fallback`/`BundleCache`) can dry-load a bundle without any observable side effect on a
  concurrently-running cycle for the same tenant. **[REPO]** `design-config-is-content.md` §10
  already flags a related open question (whether `BundleCache` retains enough to reconstruct a
  previous config tree); this document adds the concurrency question and does not answer either.

---

## 11. Reproduction

```
# worktree state this document was written against:
git rev-parse HEAD                                            # 91930f3...

# Q1/§1 — the declaration fetch, current cache posture:
grep -n "DECLARATION_URL\|cache: \"no-cache\"" app/index.html

# Q2/§2 — the engine reads config as a filesystem path, unqualified, single-tenant today:
grep -n "^CONFIG = " /Users/lukeannison/projects/qntm-network/qntm/server/app.py   # read-only, trunk clone

# Q3/§3 — today's /config handler: no dry-load, unconditional delete-then-write:
sed -n '470,487p' /Users/lukeannison/projects/qntm-network/qntm/server/app.py       # read-only, trunk clone

# Q3/§3 — the Worker has no /config route, re-verified at this branch's base:
grep -n "config" worker/src/*.js worker/wrangler.toml          # 5 hits, none a route

# Q4/§4 — the Worker's only binding is D1; no KV, R2 commented out:
cat worker/wrangler.toml

# Q5/§5 — the real refusal sentence, already tested:
grep -n "unresolvable field" tests/app-generality-acceptance.test.mjs scripts/generate-qualification-declaration.mjs

# Q6/§6 — no timestamp/random source in the generators:
grep -n "Date\.now\|new Date(\|toISOString\|Math\.random\|randomUUID\|crypto\." \
  scripts/generate-*.mjs scripts/yaml-subset.mjs scripts/ledger.mjs               # zero hits

# Q6/§6 — readdirSync always sorted (eleven sites):
grep -n "readdirSync" scripts/generate-*.mjs

# Q6/§6 — the live determinism test, run three times, byte-identical, exit 0 each time:
for i in 1 2 3; do node scripts/checkdeclarations.mjs; done

# Q6/§6 — no absolute path/username embedded in the declaration:
grep -o "lukeannison" presentation.json                        # zero hits

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

# NOT RUN, deliberately: no cycle, no graph-sync, no long verb, no POST to any server,
# no Worker deploy, no git stash, no merge. ~/qntm and ~/.qntm-md were never opened.
# The trunk clone at /Users/lukeannison/projects/qntm-network/qntm was read only, via
# absolute paths, never written and never cd-ed into.
```

# Pin the cube — eight claims from today's conversation, verified, corrected where wrong, each given its enforcing check or marked UNENFORCED

**Status: documentation and declarations only. This branch modifies `docs/architecture/capabilities.yaml`,
`docs/architecture/flows.yaml`, `docs/implementation-artifacts/backlog.yaml`, and adds two node test
files. It does not touch `worker/`, `scripts/` compiler behaviour, or any generator's logic.**
**Branch:** `docs/pin-the-cube`, based on `origin/main` @ `8c8eeed`.

**What this document is not.** It does not repeat the conversation that produced claims A–H; it
verifies each one against the actual code and config, independently, and says plainly where the
conversation was right, where it was imprecise, and where it was wrong. **Every number and
`file:line` citation below was opened and read directly this session** — either in this worktree,
in the monorepo at `/Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/` (read-only, never
written, never `cd`-ed into), or via `gh api`/`gh run view` against this repo's own GitHub Actions
history. Absence claims were checked positively — a directory listing, a recursive key-walk, a
`Buffer` search — never by a bare `grep` that could silently skip a NUL-containing file the way one
already has in this repo (`tests/no-nul-bytes.test.mjs`).

**The single quality bar this document is held to, restated so it is not lost in eight claims:
every pinned claim below either names the executable check that keeps it true, or is marked
UNENFORCED.** Of the eight (A–H): **four (B, E, F, H) are backed by a test that runs on every
push**; **one (G) is checkable only by a script that needs the private monorepo CI never clones**,
so it is honest and re-runnable but not continuously enforced; **three (A, C, D) are genuinely
UNENFORCED**, and are labelled as such rather than dressed up. §2 gives the reasoning per claim.

---

## 0. The pin, stated before the content — which axis this document moves

* **VERTICAL — moved, by three rows.** `docs/architecture/capabilities.yaml` gains three new
  capability entries (claims E, F/B combined, and C/D combined — §1 below), and loses nothing.
  `enforcement_depth` count is unchanged (14 of 53 — the new rows follow the same majority
  convention as `presentation-is-resolved-not-chosen` and
  `structural-language-is-published-not-guessed`, prose-cited enforcement rather than the
  static-evidence runner's formal field).
* **HORIZONTAL — moved.** Two capabilities.yaml passages and one flows.yaml comment block that
  described the declaration as build-time-embedded — true until `b2a97af` (#70), false since — are
  corrected in place, following the house rule (`roadmap-the-road-ahead.md` §6.3): the wrong
  sentence stays visible, a dated UPDATE block states what changed it. Nothing rewritten silently.
* **TIME — the open axis, addressed in §3 as a recommendation, not invented as a field.**
* **The fourth, enforcement — the organising principle of §1, not a separate section.** Every claim
  below states its check or says UNENFORCED. Two new node test files were added and each is
  mutation-proven in this same session — green, mutated to red, reverted, green again — with the
  transition recorded at the point it happened.

---

## 1. The claims, verified

### A. The two axes of config — CONFIRMED

`apps/qntm-md/config/views/admin.yaml` (monorepo, read-only, 16 lines) shows the whole mechanism:
`default_node_type: task` at line 9 (the VIEW layer, unnested), `defaults: {domain: admin}` nested
inside each of its two sections at lines 15–16 and 20–21 (the STRUCTURAL_NODE layer). One file, two
layers, expressed by nesting alone. `find apps/qntm-md/config -iname "*view_defaults*"` returns
nothing — no separate per-layer file was ever needed, and none exists. **Nesting IS the layer, and
the claim holds exactly as stated.**

**Enforcement: UNENFORCED.** No test in this repo or the monorepo asserts "no `view_defaults.yaml`
exists" or "nesting alone conveys the layer" as an invariant that could fail. The four generators'
own behaviour depends on reading nested config correctly, and `tests/app-generality-acceptance.test.mjs`
exercises view-level and section-level defaults together (that file's own §1, "REGISTRATION +
DEFAULTS," has two different section defaults on the same view, proven to seed independently) —
that is load-bearing PROOF the
mechanism works, but it is not a proof of the ABSENCE claim ("no file was needed"). This is a fact
about a chosen shape, not something a check can hold constant, and is marked UNENFORCED rather than
stretched to fit an existing test.

### B. `global_defaults` — CORRECTED, and the corrected version is sharper than the original

**The "anomaly, unused, costs nothing" framing is WRONG.** `apps/qntm-md/config/global_defaults.yaml:38`
does carry `defaults: {}` — confirmed empty — but the file's own header (lines 17–24) states
outright: *"THIS FILE IS LIVE... retired 2026-07-29, because the LAND leg landed and this file has
not been inert since."* It is wired end to end in the monorepo's Python engine:
`bundle/loader.py:431-432,574-592` reads it into `LoadedBundle.global_defaults`,
`coordination/orchestrator.py:4577,4776,5782` threads it into cycle scope, and
`io/applier.py:4080-4156` actually merges it at `ResolutionLevel.GLOBAL`. One stale artifact found
in passing: `loader.py:1304-1312` still carries a comment calling this "INERT scaffold... NOT yet
collected or consumed by any caller" — false, and a small correction for whoever next touches that
file (I do not have write access to make it).

**The skew the original claim was reaching for is real, just narrower than stated.** I checked all
four browser-facing generators directly (`grep -oE "schema.yaml|day_boundary.yaml|line_grammars.yaml"`
and the content-type strings each one reads): the union of what `generate-qualification-declaration.mjs`,
`generate-resolution-declaration.mjs`, `generate-structural-declaration.mjs` and
`generate-rules-declaration.mjs` read is exactly `{schema, vocabulary, patterns, rules, views,
day_boundary, line_grammars}` — seven types, **none of them `global_defaults`**. Only
`scripts/resolution-agreement.py`, a verification script, reads it, and that script's job is
checking the ENGINE's answer, not compiling anything for the browser.

**So the corrected claim is stronger than the one that went into this document: the engine already
applies a global default the moment one is declared; the browser stays silent, forever, until a
generator is deliberately widened.** Not "nothing reads it, so nothing happens" — "the engine reads
it today, the browser never will by accident."

**Enforcement: two-tiered.**
- The redistribution fix itself (global defaults move to each config type's own root,
  `global_defaults.yaml` disappears) is a monorepo-side Python change this repo has no write access
  to make. **UNENFORCED here, and not separately filed** — it is the same class of monorepo-only gap
  as claims C and D, covered by the same backlog row (`starter-package-and-six-empty-directories-
  are-monorepo-cleanup`, §5) rather than a duplicate.
- **The skew itself is now pinned.** `tests/global-defaults-does-not-reach-the-browser.test.mjs`
  (added this pass) reads each of the four generators as a `Buffer` and asserts none contains the
  literal string `global_defaults`. **Mutation-proven this session**: appended a `global_defaults`
  reference to `generate-rules-declaration.mjs`, the corresponding test went red naming that exact
  file, reverted with `git checkout`, all four green again. Runs on every `npm test`, in CI, on
  every push.

### C. `starter_package` — CORRECTED: true for six of nine directories, not nine of nine

`apps/qntm-md/bundles/starter/` holds `schema.yaml` plus nine directories. The operator's live
`config/` tree was described as those same nine, empty, stamped from the bundle. **Checked
directly: only six are empty-but-for-`.gitkeep`** — `chains`, `follow_up_chains`, `metrics`,
`recurrence`, `rendering`, `templates`. **The other three are the operator's real, populated, live
instance**: `patterns` (139 files), `rules` (49 files), `views` (85 files). The claim holds for six
of nine, and the corrected version — six retired-or-never-used scaffolds sitting beside three
directories of real content, all nine sharing one bundle's directory names — is the one worth
keeping.

`SupportedContentType.STARTER_PACKAGE` (`config_registration.py:39`) is already, today, the honest
answer to "is this a first-class type": it sits inside `loader.py`'s own
`_UNIMPLEMENTED_CONTENT_TYPES` set (`loader.py:313-317`, alongside `ACTIONS`) — recognised when a
`starter_package.yaml` marker is found, consumed by nothing. The operator's fix ("config loads
directly per type, not via a package; the type and the empty directories go") is smaller than it
first reads: the type is already inert, not live routing.

**Enforcement: UNENFORCED, and cannot be enforced from here.** The fix is a Python deletion in a
monorepo this branch has read-only access to and no write access to at all. **Filed as future
work** — backlog row `starter-package-and-six-empty-directories-are-monorepo-cleanup` (§5).

### D. Shells are retired — CONFIRMED, with two small corrections

Current citations (moved slightly from the brief's "~295–309/1349"): `loader.py:295-312` defines
`_CAPABILITY_SHELL_FOLDERS` and `_SHELL_CONTENT_TYPES`; `loader.py:1349,1354` route to
`SupportedContentType.CAPABILITY_SHELLS` / `SHELL`. The comment at `loader.py:296-299` names four
retired shells by date — `metrics` (2026-07-19), `templates`, `follow_up_chains`, `recurrence`
(all 2026-07-28) — matching four of claim C's six empty directories exactly. No shell config file
exists anywhere in `config/`, verified positively by listing all sixteen top-level entries, not by
a grep returning nothing.

**One correction: "exist only as routing... inside `bundle/loader.py`" is too strong.** The two
enum members are *defined* in `config_registration.py:38,44`, one file over. Behavioural
*consumption* (`shell_yaml_files`, merged into `render_decision_tables`) is confined to
`loader.py` alone, which is the load-bearing part of the original claim and does hold.

**A fifth empty directory, `rendering`, is not retired** — it is a live member of
`_SHELL_CONTENT_TYPES`, still serving `decision_table`, just currently undeclared by the operator.
**A sixth, `chains`, matches neither set** — zero recognition anywhere in `loader.py` or
`config_registration.py`; unrouted and unused on its own, not a retired shell and not a
starter-package name with special handling.

**Enforcement: UNENFORCED here, for the same reason as C** — this is entirely monorepo code this
branch cannot write.

### E. The unit is the CATEGORY, not the instance — CONFIRMED, strongly

`tests/app-generality-acceptance.test.mjs` is the operator's own acceptance test, run: a node type,
tag, view, three sections and a marker glyph that appear nowhere in the operator's real config —
verified absent with `rg -a` against both the monorepo config and this worktree before the file was
written. **30 tests, 10 describe blocks, 30 PASS / 0 FAIL**, re-run this session. It calls exactly
four generators — qualification, resolution, structural, rules — confirming "all four compilers."
**One correction: `scripts/generate-operator-set.mjs` is a fifth script, not covered** — mentioned
once in a comment, never imported or invoked. "All four compilers" is accurate for the four named;
it is not a claim about this fifth, smaller script.

**The mutation proof already exists inside the suite, and it is the sharpest evidence for this
claim in the whole repo.** That file's own §9 ("THE REGRESSION PROOF") reproduces the RETIRED
`compile-capture-rules.mjs` — the coupled compiler that modelled exactly two hardcoded rule ids and
merged with 1,803 green tests (PR #91) — against the same never-seen scratch config §8 proves the
current generator gets right, and shows the coupled one goes red on it. That is not a hypothetical
mutation; it is the actual defect this claim exists to prevent, caught, on record, in the suite.

**Enforcement: STRONG. `npm test` on every push, `.github/workflows/build.yml`.** This is the
strongest pin in this document.

### F. Flattening is correct for output; the layer is an input dimension — CONFIRMED

Traced to source: `compile-structural.mjs:348-352` emits `{indent, edgeCardinality, sections,
dropped}`; `compile-qualification.mjs:580-590` emits `{..., sections, sectionOrder, refused}`;
`compile-resolution.mjs:800-808` emits `{..., sectionRegistration}`. A recursive key-walk of the
committed `presentation.json`'s `structural`, `qualification`, `resolution` and `rules` sub-objects
finds **zero** occurrences of a literal `global` or `view` key anywhere in any of the four. Every
section-keyed answer is addressed `view → section`, confirmed by direct sampling
(`structural.sections.operator-flowtrace`, `qualification.sections.admin`, etc.) — the cascade is
resolved away by the time it reaches the browser, exactly as claimed.

**Enforcement: STRONG, newly added.** `tests/declaration-layer-is-flattened.test.mjs` (added this
pass, 7 assertions) reads the committed `presentation.json` and asserts the "no `global`/`view`
key" and "per-section key shape" claims directly. **Mutation-proven this session**: injected a
literal `global: {...}` key into `compile-resolution.mjs`'s declaration object, regenerated
`presentation.json`, watched the corresponding test go red naming exactly which section leaked the
key, reverted the compiler source, restored `presentation.json` to its committed bytes with `git
checkout` (regeneration is not byte-stable — the original file uses `\uXXXX`-escaped non-ASCII,
plain `JSON.stringify` does not, so `git checkout` was the correct restore, not a second
generation), watched all 7 assertions go green again. Needs no monorepo checkout, so — unlike the
four monorepo-comparison suites in this repo — it runs, and can fail, in CI on every push.

### G. Measured state, as of today — mostly confirmed, two numbers wrong

| # | claim | verdict | correct value |
|---|---|---|---|
| G1 | 15 registered content types | **CONFIRMED** | `config_registration.py:27-44`, counted directly: 15 |
| G1 | 7 reach the browser (schema, vocabulary, patterns, rules, views, day_boundary, line_grammars) | **CONFIRMED** | derived by reading all four generators' source, not quoted from a prior doc; the same seven, no more, no fewer |
| G2 | rules compiler publishes 22, drops 79, against 46 files | **CONFIRMED, independently re-run** | `ls apps/qntm-md/config/rules/*.yaml \| wc -l` = 46; `node scripts/generate-rules-declaration.mjs --check --config-dir .../config` = clean; `presentation.json`'s `rules.order.sequence` has 22 entries, `rules.dropped` has 79, each keyed by rule id with a distinct free-text reason |
| G3 | flow-trace live run: exit 0, 58 pass, 0 fail, 9 scenarios | **CONFIRMED**, independently pulled from `gh run view 30904373721 --repo QNTM-Network/qntm --log` (not just trusted from the commit message) | `fail_count: 0, pass_count: 58, total_scenarios_run: 9`, exit 0. Note: the run is in `QNTM-Network/qntm` (the monorepo), workflow `flow-trace (app repo)` — not a run of this repo's own Actions |
| G3 | "...23 seconds" | **IMPRECISE, not reproducible to the second** | the `flow-trace verify` step itself ran ~8s (11:23:46–11:23:54), the whole job ~29–30s (11:23:27–11:23:56); neither is 23s |
| G4 | capabilities.yaml: 50 rows, 18 carrying `enforcement_depth` | **WRONG on the second number** | 50 rows confirmed; `enforcement_depth` count is **14**, not 18 — cross-checked two ways (`yaml.safe_load` count and `grep -a -c "enforcement_depth:"`), both agree |
| G5 | 36 "observed but not declared" findings | **WRONG** | the same live CI run gives `orphan_info_count: 25` (a literal count of the message string in the log also gives 25); `info_count` total is 28 (25 orphan + 3 other INFO-tier); 36 matches no counter anywhere |

**These numbers are point-in-time measurements, not durable claims** — they will drift the moment
the operator's config or this repo's test suite changes again, and nothing here pins them as facts
that must stay true. What is pinned is that they were independently checked, not copied.

### H. Known-stale artifacts — CONFIRMED and fixed

Three passages, all traced by `git blame` to `f7a769b3` (2026-07-31), all still asserting — as of
this branch's base — that `presentation.json` is read at BUILD time via
`app/present/embedded-declaration.ts` and baked into `dist/present.js`. That stopped being true in
`b2a97af` (#70, "the declaration is fetched at run time, not baked into the bundle"), which
post-dates all three passages by three days and deleted the file they name. Verified positively:
`find app -iname "*embedded-declaration*"` returns nothing; `app/index.html:1172,1202` now does
`const DECLARATION_URL = "/presentation.json"` / `await fetch(DECLARATION_URL, ...)`. Both files
were edited again after `b2a97af` landed, but neither edit touched these specific paragraphs, and
neither file references `b2a97af` anywhere.

**Fixed in place, following `roadmap-the-road-ahead.md` §6.3's house rule** (state the claim, state
the fact, name what changed it, leave the wrong sentence visible rather than rewritten): dated
UPDATE blocks added to `capabilities.yaml`'s `presentation-is-resolved-not-chosen` and
`structural-language-is-published-not-guessed` entries, and to `flows.yaml`'s
`embedded-declaration.ts` comment block. Nothing deleted; the 2026-07-31 paragraphs stay, now
followed by what corrected them.

---

## 2. Rigour assessment — blunt, as asked for

**Four of eight claims (B, E, F, H) are backed by something that runs on every push and can fail.
One (G) is backed by a real, runnable check that only this environment — with the private monorepo
checked out — can currently run. Three (C, D, and half of B's own redistribution direction) are
true findings this repo has no write access to turn into a check. One (A) is prose with genuinely
no plausible check available at any price.**

**Strongest: E.** Not just "a test exists" — the test contains its own regression proof, reproducing
the exact defect (a coupled two-rule compiler) that a green suite of 1,803 tests failed to catch
before this widening existed. This is the one pin in the document that would have prevented a real,
already-shipped mistake, demonstrated inside the suite rather than asserted about it.

**Second strongest: F.** A brand-new, narrow, cheap assertion, mutation-proven in this session, that
runs with no dependency on the private monorepo — meaning it is the one check in this whole set
that is CI-visible rather than local-only. It will catch exactly one thing (a `global`/`view` key
appearing in the compiled output) and nothing else, which is the right shape for a permanent
regression guard: narrow claims that can't rot into vagueness.

**B's new test is honest about its own limit.** It pins an ABSENCE (no generator reads
`global_defaults.yaml`) as a tripwire against accidental widening. It does not, and cannot, verify
that the ENGINE-side wiring I found is correct — that is Python code in a monorepo I read but do
not own, and I am trusting `loader.py`/`applier.py`'s own logic without running it. If that wiring
is wrong, nothing here would catch it.

**C and D are the two claims where "enforced" is not available at any price from this branch.**
Both are true, both are precisely measured, and both name code this repo has zero write access to.
Filing them as backlog rows is the honest ceiling — not a cop-out, the actual limit of what a
read-only branch against a private monorepo can do. **If nobody ever picks up those backlog rows,
these two findings decay into exactly the kind of paperwork this project's own standard warns
against**, and there is no mechanism in this repo that would notice.

**A is the weakest pin, and it should be read as such.** It is a TRUE, VERIFIED fact about a config
shape, with genuinely no plausible executable check available — you cannot write a test that
asserts "nobody will invent a `view_defaults.yaml` file in the future" without either being trivial
(grep for the filename, which only catches that one specific mistake) or philosophically odd
(asserting a negative about a future author's choices). I considered adding the trivial version and
decided against it: a test that only catches one exact filename teaches nothing about the actual
principle (nesting expresses layer) and would be decorative in the precise sense this document is
supposed to avoid — a check that passes today and would still pass after a different, equally bad
violation of the same principle. **Better to mark it UNENFORCED honestly than to add a check that
performs enforcement without providing it.**

**What "enforced" means for G's numbers, precisely, and why it's a different kind of claim.** G1's
"7 reach the browser" is enforced BY CONSTRUCTION — I derived it by reading the generators, not by
running a test that asserts it, and no test currently asserts it either. It is TRUE today and could
become false the next time a generator is widened, with nothing to notice. This is a gap worth
naming even though it wasn't asked for as one of the eight: a fifth test, "the union of content
types the four generators read is exactly {schema, vocabulary, patterns, rules, views,
day_boundary, line_grammars}," would be cheap and would catch drift in either direction (a
generator quietly starts or stops reading a type). Not built here — it is adjacent to, not inside,
the eight claims, and this document's job was verifying those eight, not inventing a ninth.

---

## 3. The TIME axis — a recommendation, not an invented schema

Flow-trace has VERTICAL (`enforcement_depth`, reach to a sink), HORIZONTAL (`rooting`,
`horizontal_completeness`, ordered/numbered packages), and now, from this project's own convention,
a fourth: enforcement — every claim names its check or says UNENFORCED. **No field answers "how
long has this been true, and how much has been built on it since" — the operator's own framing: a
small point now becomes adopted, bought into, and fleshed out over time.**

**What I am recommending, and why not the obvious alternative.** The obvious shape is a hand-typed
`first_pinned: 2026-08-04` field, maybe with a `reaffirmed: [dates]` list, mirroring the UPDATE-block
convention this document itself uses throughout. **I am recommending against that**, on the strength
of evidence this exact pass produced: claim H is three passages that went stale FOUR DAYS after
being written and sat uncorrected until this branch found them by accident. `global_defaults.yaml`'s
own "INERT scaffold" comment (claim B) sat wrong for longer. **A hand-typed date field is the same
failure shape one field later** — it rots exactly when nobody is looking, which is always, and
nothing would notice a `first_pinned` date that stopped being true.

**The recommendation: two fields, DERIVED from git, never hand-typed.**

- `enforcement_age_days` — days since the git history of every path an enforcement citation names
  (a test file, a `state.yaml`/`classes.yaml` target) first introduced that path.
- `enforcement_touch_count` — count of distinct commits that modified those same paths since.

**Why derived beats hand-typed, stated as the reasoning the operator asked for, not just the
conclusion.** A number computed fresh from `git log --follow` on every flow-trace run cannot go
stale BETWEEN runs — it can only be wrong if the enforcer citation itself is wrong, which is a
different, already-covered failure (`horizontal_completeness.rooted` exists to catch a citation that
doesn't actually root to real code). This also encodes the operator's own definition of the axis
more literally than a date would: a capability whose enforcer has been touched by one commit ever
IS a small, untested-by-time point; one touched by nine commits over three weeks — extended, argued
with, mutated against — genuinely has been "bought into and fleshed out," and that is a fact a
touch-count states without anyone having to remember to write it down.

**What this is not.** It is not a maturity score, a confidence multiplier, or a gate on anything. A
high touch count is not automatically good (a capability whose enforcer keeps needing fixes might be
poorly specified, not well-adopted) — it is a raw signal to read alongside the other three axes, the
same way `enforcement_depth` alone doesn't tell you whether a capability is GOOD, only how far it
reaches.

**Not built here.** Flow-trace's source is not in this repo and not under `apps/qntm-md/` either —
this branch has no path to it. Filed as backlog row
`flow-trace-derives-a-time-axis-from-enforcer-git-history` (§5), addressed to whoever owns that
tool, with the schema settled here so it does not get invented twice, differently, by two different
people.

---

## 4. What I refuted — the instinct that turned out wrong when checked

1. **"No compiler reads `global_defaults.yaml`, so today it costs nothing."** Refuted. The engine
   reads and applies it today, right now, the moment `defaults:` stops being `{}`. The correct
   claim is narrower and, honestly, more interesting: the skew is between the ENGINE and the
   BROWSER, not between "declared" and "read by anything."
2. **"The starter bundle's nine directories are all empty scaffolding stamped onto a real
   instance."** Refuted for three of the nine. `patterns`, `rules` and `views` are the operator's
   real, live, populated config — the same directory NAMES as the bundle, but not the same content.
   The claim is true for six of nine, and conflating the six with the nine would have been a
   config-cleanup mistake if acted on directly (deleting populated directories).
3. **My own first assumption that G4/G5 would simply confirm the numbers I was given.** They did
   not. `enforcement_depth` is 14, not 18 — a 22% overcount. The orphan-info count is 25, not 36 —
   a 44% overcount. Neither is close enough to be a rounding difference; both needed a genuine
   correction, pulled from a live CI log rather than trusted from a commit message summary.
4. **My own first instinct that "23 seconds" was probably just imprecise rounding of the job's
   total wall time.** Checked directly against the run's own step timings — it isn't. Neither the
   verify step (~8s) nor the total job (~29–30s) round to 23. I do not know what was measured to
   produce that number; I know it wasn't either of the two durations visible in this run's log.

---

## 5. Enforcement added, and every mutation transition

Three new checks, all mutation-proven this session, all passing `git diff --stat` clean after
revert:

1. **`tests/declaration-layer-is-flattened.test.mjs`** (claim F) — 7 assertions. Green baseline →
   injected `global: {mutation_proof_only: true}` into `compile-resolution.mjs`'s declaration
   object → regenerated `presentation.json` → red, naming `resolution` exactly → reverted the
   compiler source → restored `presentation.json` via `git checkout` (regeneration is not
   byte-stable against the committed file's Unicode escaping) → green, all 7 assertions.
2. **`tests/global-defaults-does-not-reach-the-browser.test.mjs`** (claim B) — 4 assertions, one
   per generator. Green baseline → appended a `global_defaults` string to
   `generate-rules-declaration.mjs` → red, naming that exact file → `git checkout` on the source →
   green, all 4 assertions.
3. **Two doc corrections** (claim H) — not code, no mutation proof applicable; verified instead by
   direct citation of the deleting commit (`b2a97af`) and a positive absence check
   (`find ... -iname "*embedded-declaration*"` → nothing) against the current worktree.

Two new capability entries record findings with no available enforcement in this branch (claims C
and D), explicitly marked UNENFORCED rather than given a decorative check.

**Backlog rows filed**, `docs/implementation-artifacts/backlog.yaml`, both `kind: null` /
`state: unscoped`, matching this file's own precedent for flagging a gap this branch can see but
not close (`the-acceptance-test-backlog-row-is-stale`, `stage-three-does-not-tenant-ize-config`):

- `starter-package-and-six-empty-directories-are-monorepo-cleanup` — claims C/D's fix, monorepo-side.
- `flow-trace-derives-a-time-axis-from-enforcer-git-history` — §3's proposal, flow-trace-side.

---

## 6. Suite state — before and after

**Before (this branch's base, `8c8eeed`, unmodified):** `npm test` — 1,820 tests, 1,814 pass, 5
distinct failing test paths (node's own summary counter reports `fail 4`, one short of the 5 listed
under "failing tests:" — a node test-runner counting quirk, not a discrepancy in which tests
failed), 2 todo. **The 5: exactly the 1 documented flaky test
(`tests/app-projection-queue.test.mjs:562`, annotated pre-existing in its own skip comment) plus 4
config-staleness checks — one each for structural (`app-seed-from-cascade.test.mjs`), qualification
(`present-qualification.test.mjs`), resolution (`present-resolution.test.mjs`) and rules
(`present-seed.test.mjs`) — that compare the committed `presentation.json` against a fresh
generation from the monorepo and fail because the committed file is stale relative to it. These run
locally (this environment has the monorepo checked out) and self-skip in CI, matching the brief's
description exactly: I see the same 5, and no more.**

**After (this branch, with both new test files and the three doc corrections):** `npm run check`
(typecheck + build + test) — typecheck clean, build clean, `npm test` — **1,831 tests, 1,825 pass**,
the same 5 failing test paths, 2 todo. **+11 tests, all passing, zero regressions, zero new
failures.**

---

## 7. Reproduction

```
# claim A
sed -n '1,25p' /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/config/views/admin.yaml
find /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/config -iname "*view_defaults*"

# claim B
sed -n '1,40p' /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/config/global_defaults.yaml
grep -n "global_defaults" /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/src/qntm_md/bundle/loader.py
grep -n "global_defaults\|global_layer" /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/src/qntm_md/io/applier.py
node --test tests/global-defaults-does-not-reach-the-browser.test.mjs

# claim C/D
ls /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/bundles/starter/
for d in chains follow_up_chains metrics patterns recurrence rendering rules templates views; do
  echo "$d: $(ls /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/config/$d | wc -l) entries"
done
sed -n '27,44p' /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/src/qntm_md/bundle/config_registration.py
sed -n '295,317p;1345,1356p' /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/src/qntm_md/bundle/loader.py

# claim E
node --test tests/app-generality-acceptance.test.mjs

# claim F
node --test tests/declaration-layer-is-flattened.test.mjs
python3 -c "import json; d=json.load(open('presentation.json')); print(list(d['structural'].keys()), list(d['qualification'].keys()), list(d['resolution'].keys()))"

# claim G
ls /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/config/rules/*.yaml | wc -l
node scripts/generate-rules-declaration.mjs --check --config-dir /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/config
python3 -c "import json; d=json.load(open('presentation.json')); print(len(d['rules']['order']['sequence']), len(d['rules']['dropped']))"
gh run view 30904373721 --repo QNTM-Network/qntm --log | grep -a -E "pass_count|fail_count|orphan_info_count|total_scenarios_run"
python3 -c "import yaml; d=yaml.safe_load(open('docs/architecture/capabilities.yaml')); c=d['capabilities']; print(len(c), sum(1 for x in c if x.get('enforcement_depth') is not None))"

# claim H
grep -n "embedded-declaration" docs/architecture/capabilities.yaml docs/architecture/flows.yaml
find app -iname "*embedded-declaration*"
grep -n "DECLARATION_URL" app/index.html

# suite
npm run check

# NOT RUN: no cycle, no graph-sync, no wrangler against remote/production, no git stash, no merge.
# ~/qntm and ~/.qntm-md were never opened. apps/qntm-md/ was read only, via absolute paths, never
# written and never `cd`-ed into.
```

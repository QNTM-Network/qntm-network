# Research: the ordering cascade already terminates — the live symptom has another cause

**Branch:** `fix/the-ordering-cascade-terminates`, based on `origin/main` @ `53e50ad`.

**Evidence rule**, matching `design-the-two-rules.md`'s own. **[OBS]** a command run this session,
output read directly. **[REA]** reasoned from something labelled OBS. **[REPO]** a claim an
already-merged document or PR body makes, cited, not reproduced.

---

## 0. Lead — the answer, before the argument

**The defect this branch was opened to fix does not exist at `origin/main`'s tip, and has not
existed there since `86bb4c0`/`f448da2` (2026-08-04) and `35f3c5a` (2026-08-05).** `app/present/
ordering.ts:333`'s `no-section-declaration` abstention is real code, but it is DEAD in the runtime
call graph: every caller reaches ordering through `resolveOrderingFor`/`resolveOrderingPlacementFor`,
which fall through to `defaultOrderingFor`/`defaultOrderingPlacementFor` — the engine's own default
ordering, made explicit — for any section `resolution.ordering` does not name. Line 333 is reachable
today only by a test calling the narrow, declared-only `orderingFor` directly, which is exactly what
`tests/app-generality-acceptance.test.mjs` does on purpose, to pin that the narrow function's own
contract is unchanged. No runtime path in `app/index.html` calls it.

**This was checked against the LIVE deployed app, not just this worktree.** `https://
qntm.network/dist/present.js` and `https://qntm.network/app/` were fetched read-only (plain `GET`,
no state changed) and diffed byte-for-byte against a local build of this worktree's `HEAD`. The
entire diff — 141 lines, confined to one class — is `settle.ts`'s identity-keyed vs. string-keyed
surface (`b828c43`/PR #123, 2026-08-06). `resolveOrderingFor`, `defaultOrderingFor`, the whole
`RESOLVERS` registry, and `commitLine` arming settle before the write's `await` are **already live**.
So the specific mechanism the brief names — "the cascade stops at its top rung instead of falling
through to the bottom one" — is fixed in code and deployed. What I could not do is explain the
operator's observed symptom from what is still live, and §7 states that honestly rather than
papering over it with an invented fix.

**No `app/` source was changed.** This document, its own verification (a mutation proof and a
type-check injection, both performed and reverted — nothing left in the diff), and the report on
other resolvers (§8) are the whole of this branch.

---

## 1. The claim as received, checked against the code

The brief stated two things as fact and asked that both be verified rather than assumed.

**`https://qntm.network/presentation.json` — confirmed. [OBS]**
```
resolution.ordering: 6 views — daily-personal, daily-work, flowtrace-queue, qntm-queue,
                      this-week, trace-orchestration-queue. inbox is NOT among them.
resolution.defaultOrdering: [due_date asc, priority desc, title asc]
resolution.priorityRank: {urgent:4, high:3, normal:2, medium:2, low:1}
qualification.sections.inbox: {inbox-tagged, domain-empty}   — inbox IS qualified, just not ordered
```
Fetched live and re-verified against the copy committed to this repo (`presentation.json`) —
byte-identical, `sha256` match. Both are exactly as the brief described.

**`app/present/ordering.ts:333` — confirmed as WRITTEN, refuted as REACHABLE. [OBS]**
```ts
if (declared === undefined) return { kind: "abstains", because: "no-section-declaration" };
```
This line exists, inside `evaluateSection`, the private helper behind the DECLARED-only
`orderingFor`/`orderingPlacementFor`. It is exactly what the brief quotes. What the brief did not
have was the rest of the file: `resolveOrderingFor`/`resolveOrderingPlacementFor` (same file,
:918-962) check `ordering[viewId]?.[sectionId] !== undefined` FIRST — if declared, they call
`orderingFor`/`orderingPlacementFor` (where line 333 could in principle fire, but never does,
because the caller already proved the declaration exists); if undeclared, they call
`defaultOrderingFor`/`defaultOrderingPlacementFor`, a SEPARATE evaluation
(`evaluateDefaultSection`) that never reads line 333 at all.

```
$ rg -n "\borderingFor\(|\borderingPlacementFor\(" app/ --type ts -g '!ordering.ts'
(zero hits, excluding the two resolveOrdering* functions' own dispatch calls)
```
No caller anywhere in `app/` reaches the narrow functions except the dispatcher itself. `app/
present/resolvers/ordering.ts` (the resolver spec `app/index.html`'s `commitLine` actually walks)
calls `resolveOrderingFor`/`resolveOrderingPlacementFor` — never the narrow pair — with a comment
that states the reason plainly: *"`resolveOrderingFor`, NOT `orderingFor` directly. Routes to
`orderingFor` unchanged for the sections that declare `ordering`/`orderingMode`, and to
`defaultOrderingFor` for every OTHER section … This is what makes an edit to an undeclared section
(his inbox, `dev/qntm/backlog`, most of his vault) say anything at all."*

**Conclusion: my reading of `presentation.json` was accurate; my reading of line 333 as a live
defect was wrong.** The line is real, correctly described, and unreachable from any path a
keystroke takes.

---

## 2. The dispatcher, and why it is already the generalised answer the brief asked for

`resolveOrderingFor`/`resolveOrderingPlacementFor` (`app/present/ordering.ts:918-962`) are the whole
mechanism:

```ts
if (ordering[viewId]?.[sectionId] !== undefined) {
  return orderingFor(...);       // declared — unchanged behaviour
}
return defaultOrderingFor(...);  // undeclared — the engine's own default, never a browser guess
```

**This enumerates nothing.** It does not name `inbox`, `daily-work`, or any of the 186 sections —
it asks one question (`ordering[viewId]?.[sectionId] !== undefined`) that is true for exactly the 9
sections that declare an ordering and false for the other 177, computed the same way for all of
them. `defaultOrderingFor` then ranks by `resolution.defaultOrdering` — three keys
(`due_date`/`priority`/`title`), published unconditionally by the compiler as an ENGINE FACT, not
read out of any operator's YAML (`scripts/compile-resolution.mjs`'s own header, `ordering.ts:540-
544`). Every section that has nothing declared gets the identical three-key fallback; the test suite
exercises this shape under the literal section name `inbox` (`tests/app-ordering-note.test.mjs` §8-9,
`tests/app-settle-wiring.test.mjs` §1/§5) and under a synthetic name (`present-ordering.test.mjs`),
and both agree — because it is the same function either way.

**How many sections change behaviour: all 177 that declare no `ordering:`, and only those.** The 9
that declare one are routed to the unchanged `orderingFor`/`orderingPlacementFor` and behave exactly
as they did before this dispatcher existed — `resolveOrderingFor`'s own guard is the single fact
that decides the split, and it is config-shaped (does this section publish an `ordering` key), never
view-shaped.

---

## 3. Engine agreement, checked against `section_builder.py` directly (read-only)

`apps/qntm-md/src/qntm_md/render/section_builder.py` (monorepo, read-only, never edited):

```python
def _section_order_key(node, ordering):
    effective_ordering = ordering or _DEFAULT_ORDERING          # line 396
    return tuple(_field_order_key(node, entry) for entry in effective_ordering)
```

**The engine falls back to its own default the identical way the browser's dispatcher does** —
`ordering or _DEFAULT_ORDERING` is precisely `resolveOrderingFor`'s `ordering[viewId]?.[sectionId]
!== undefined ? orderingFor(...) : defaultOrderingFor(...)`, read off the engine's own source rather
than inferred. `_field_order_key` (:400-423) ties on a missing field by sorting it AFTER every row
that has one (`(1, "")` — tier 1), exactly what `defaultFieldKeyFor` (`ordering.ts:614-653`)
computes; `_PRIORITY_RANK`/`_DEFAULT_ORDERING` are the same constants
`resolution-default-ordering-agreement.test.mjs` already pins against a LIVE import of this exact
Python module (not a hand transcription) — `tests/fixtures/resolution-agreement.json`, generated by
`scripts/resolution-agreement.py` on a machine with the monorepo checked out, refuses to write itself
if the live import disagrees with what `presentation.json` publishes. Ran this session:

```
$ node --test tests/resolution-default-ordering-agreement.test.mjs
# pass 6, fail 0
```

Title's tiebreak: Python's `str <` compares by Unicode code point; `ordering.ts`'s `compareCodepoints`
(:596-606) builds a code-point array (`Array.from`) specifically so it does not fall back to JS's
native UTF-16 code-unit comparison, which can disagree for an astral character. Stated in the
module's own header as a deliberate, checked choice, not a coincidence.

---

## 4. The exact scenario already exists, already passes, already reproduces his inbox by name

The brief names, as the single most valuable test: *"a section with NO declared ordering, in a view
that is not one of the six, driven through a real `o`/type/commit gesture — and the row is in its
correct position before any projection is delivered, with the motion having run."*

`tests/app-settle-wiring.test.mjs` §5 (added in `53e50ad`, this branch's own base commit) is that
test, verbatim:

```
describe("5. PLACEMENT APPLIES AT COMMIT — a bare, unstamped capture is relocated in the SAME
  synchronous paint as the real keystroke, before any projection, and an agreeing projection is a
  no-op", () => {
  test("DEFAULT ordering (undeclared section, title tiebreak): correct BEFORE any projection, with
    motion — then the engine's stamped, agreeing answer moves nothing a second time", ...)
```

It drives real `keydown` events (`o`, type, `blur`) through the real page, into the real
`commitLine`, and asserts — inside the SAME synchronous call stack, before any `await` in the test
itself — that the new row is already sorted correctly and carries paint.ts's `settle-move` FLIP
class.

Separately, `tests/app-ordering-note.test.mjs` §9 is titled, in its own source, **"THE HEADLINE
DEFECT — a newly INSERTED line is placed, in a section with no declared ordering"**, and its header
states the operator's symptom in these words:

> *"the operator adds a line to his inbox, it used to sit at the end until the next cycle moved it,
> because `armOrderingSettle` refused every `insert-line` commit outright … THIS SUITE MUST FAIL
> AGAINST `main` AS IT STANDS TODAY, and does…"*

— a stale comment (it describes a `main` from before `f448da2` fixed exactly this), but the shape it
names — **his real inbox's own four rows** ("Family domain", "Micu lunch", "Open day close day",
"account opening form per ca"), title-only, no `due_date`/`priority` — is the reproduction of the
live symptom the brief describes, already committed, already passing.

---

## 5. Git archaeology — the fix already shipped, in three commits, all ancestors of `HEAD`

```
86bb4c0  2026-08-04  feat(ordering): the engine's own default sorts every undeclared section,
                     made explicit (#98)                         — defaultOrderingFor/dispatcher
f448da2  2026-08-04  fix(ordering): the settle fires for a newly added line, not just an
                     edited one (#99)                             — insert-line placement, the
                                                                     exact "HEADLINE DEFECT" above
35f3c5a  2026-08-05  The browser must know what a RESOLVER is, not know ten by name (#106)
                                                                   — the RESOLVERS registry;
                                                                     index.html stops naming any
                                                                     resolver, calls runResolvers
b828c43  2026-08-06  fix(app): the settle follows the row, not the string it was armed
                     against (#123)                               — identity-keyed SettleSurface
53e50ad  2026-08-06  test(app): prove the placement-at-commit mechanism already applies,
                     before any projection (#124)                 — this branch's own base commit
```

```
$ git merge-base --is-ancestor 86bb4c0 HEAD && echo yes   # yes
$ git merge-base --is-ancestor f448da2 HEAD && echo yes   # yes
$ git merge-base --is-ancestor 35f3c5a HEAD && echo yes   # yes
$ git fetch origin main && git log --oneline origin/main -1   # 53e50ad — no commits landed after
```

`origin/main`'s tip is exactly this worktree's base. Nothing to rebase onto; nothing to merge.

---

## 6. The live deployment — checked directly, not assumed

Read-only `GET`s only; nothing mutated, no cycle run, no `wrangler`, no POST.

```
$ curl -s https://qntm.network/presentation.json | sha256sum
$ sha256sum presentation.json
→ IDENTICAL

$ curl -s https://qntm.network/dist/present.js -o /tmp/live-present.js
$ diff /tmp/live-present.js dist/present.js | wc -l
→ 141 lines, entirely inside ONE class (SettleSurface — string-keyed vs. identity-keyed, PR #123)

$ grep -c "resolveOrderingFor\|defaultOrderingFor\|SIBLINGS_DROPPED_UNREPORTED" /tmp/live-present.js
→ present, all three

$ grep -n "armSettle(settle, commit.markdown\|await writeFile(view, commit.markdown" \
    <(curl -s https://qntm.network/app/)
→ armSettle at line 2661, the write's own await at 2669 — settle is armed BEFORE the write,
  live, today
```

**The live app already runs `resolveOrderingFor`/`defaultOrderingFor`, the full `RESOLVERS`
registry, and arms settle before the write.** It is missing exactly one merged commit relative to
this worktree's `HEAD`: `b828c43` (PR #123, the identity-keyed settle surface) and `53e50ad` (test-
only, no source change). Everything this document verifies about the cascade terminating for
ordering is, right now, live in production.

---

## 7. What this does, and does not, explain about the reported symptom — stated honestly

**What it explains.** The MECHANISM the operator's symptom depends on — an undeclared section's
`insert-line` commit computing and arming a real placement — is live. §4's "HEADLINE DEFECT" test is
titled and worded as if it is a direct transcript of the operator's own report, and it is fixed and
deployed.

**What it does not explain.** Reasoned through carefully rather than left as an assumption: the one
material gap between live and `HEAD` (`b828c43`, string-keyed vs. identity-keyed `SettleSurface`)
governs whether an ALREADY-CORRECT placement survives the engine's later stamp arriving on the same
row — it does not govern the FIRST, synchronous, optimistic placement immediately after `o`/type/
Enter, which is armed and read back against the identical string in the same turn regardless of
which `SettleSurface` implementation is live. Nor does a failure to survive the stamp produce a
WRONG position — the engine's own projection is already correctly sorted in its own file order by
the time it arrives, independent of whether `SettleSurface.take()` returns a placement for it. So
`b828c43`'s absence, on its own, does not account for "the row sits at the bottom, then jumps into
place roughly ten seconds later."

**What I could not settle, named rather than guessed at.** Three live-only facts I have no permitted
way to check: (a) whether the operator's real `inbox` section, at the moment he observed this, had
already-typed neighbour lines carrying indentation (`nested-section` — a real, printed-in-content
signal `ordering.ts`'s own header proves is load-bearing, and reading `~/qntm` to check it is
forbidden); (b) whether the observation predates `86bb4c0`/`f448da2` and is being reported now as if
current — plausible given both landed within the last two days of this repo's own history; (c)
whether a browser-side cache (not this repo's concern) served a pre-fix bundle for that one session.
None of these is confirmed. **This is the finding that outranks the fix**: the mechanism the brief
diagnosed as broken is not broken, live or at `HEAD`, and inventing a browser-code change to a
cascade that already terminates would be exactly the "declaration that exists and does not reach"
failure `registry.ts`'s own header warns against — a second thing to keep in step with a truth that
was never wrong.

---

## 8. Other resolvers with the same abstention NAME, checked and reported — not fixed

The brief asks whether `no-section-declaration` appears elsewhere as "nobody told me" wearing a
different name. It does, in two other resolvers, plus a related silent gap in a third — and none of
the three is the SAME failure ordering had, for one structural reason: **ordering's gap had a global
fallback to fall through to (`resolution.defaultOrdering`, an unconditional engine fact); these do
not.**

**`app/present/membership.ts:252,257`.** Abstains `no-section-declaration` when `qualification.
sections[view][section]` itself is `undefined` — the SECTION's qualification predicate was never
published by the generator at all (measured: 118 of 159 real sections, per `newline.ts`'s own
header, §9 below). This is not "a known, qualified section with no ordering preference" — it is "the
browser was never told what fields decide membership for this section in the first place." There is
no engine-published GLOBAL membership rule to fall back to the way `defaultOrdering` exists for
ordering: **this is the brief's own escape clause — "needs something the browser does not have."**

**`app/present/resolvers/promotion.ts:272,288`.** Same root cause, same shape: `childSection`/
`parentSection` come from the identical `qualification.sections[view.id]?.[sectionId]` lookup, and
abstain `no-section-declaration` on the identical unpublished-predicate gap.

**`app/present/newline.ts:67-83`.** The ORIGINAL cascade `design-the-two-rules.md` §2.1 names — the
GLOBAL rung of the new-line-seeding cascade — refuses (`null`) for the same reason: *"the named
section is not in `qualification.sections[view]` — one of the 118 (of 159) qualifications the
generator refused to normalise … THIS IS A REAL, MEASURED CASE."* This is not a new finding —
`docs/implementation-artifacts/backlog.yaml`'s `the-cascade-terminates-for-a-new-line` row (`state:
unscoped`) already carries it, in these words: *"THE FIX IS NOT A BROWSER-SIDE CODE CHANGE: it needs
the generator … to publish every section's qualification."*

**`app/present/resolvers/rules.ts:86-89`** is worth naming even though it does not use the same
abstention word. When `qualification.sections[view.id]?.[sectionId]` is `undefined` it returns
`NOT_EVALUATED` — silently, with no reason attached — rather than an `abstains` carrying
`no-section-declaration` the way membership and promotion do. Same root cause (the section's
qualification was never published), a STRICTLY LESS visible symptom (nothing to show even in the
per-axis diagnostic), and not previously flagged as sharing this shape. Not fixed here — it is the
identical config-completeness gap the other three already carry, and the fix (publish every
section's qualification) closes all four at once.

**Conclusion for this section: one root cause, three-and-a-half symptoms, already correctly
diagnosed and filed, out of `app/present/`'s power to close.** `rules.ts`'s silence versus
`membership.ts`/`promotion.ts`'s named abstention is a real, small inconsistency (worth a line in the
existing backlog row when the generator work is scoped) but not a second defect.

---

## 9. Verification performed this session

**Full suite, before and after (identical — nothing in `app/` changed):**
```
$ node --test --test-reporter=tap "tests/**/*.test.mjs"
# tests 2186 / pass 2180 / fail 4 / cancelled 0 / skipped 0 / todo 2
```
Matches the stated baseline at `53e50ad` exactly. The 4 failing suites, by name:

```
tests/declaration-drop.test.mjs   §5 "THE ACCEPTANCE TEST — the operator's own three outcomes,
                                       on his own config"
tests/present-qualification.test.mjs §3 "the served value is what the monorepo's config actually
                                       declares"
tests/present-resolution.test.mjs §3 "the served value is what the monorepo's config actually
                                       declares"
tests/present-rules.test.mjs      §3 "the served value is what the monorepo's rules/ directory
                                       actually declares"
```

All four compare this repo's checked-in fixtures/served declaration against the monorepo's config
directly (`apps/qntm-md/config/`, read-only to this branch) — pre-existing drift, unrelated to
ordering, present before this session started, matching the brief's own stated baseline exactly.

**Named suites, individually:**
```
$ node --test tests/app-generality-acceptance.test.mjs tests/app-seed-from-cascade.test.mjs \
    tests/app-operation-paths-terminate.test.mjs tests/app-declaration-atomicity.test.mjs \
    tests/app-settle-wiring.test.mjs
# tests 89 / pass 89 / fail 0

$ node scripts/check-operation-completeness.mjs
operation-completeness: 4 site(s) checked — every write operation reaches a terminal state
```

**`npm run typecheck`: clean, and proven to actually check this code.** Injected `const
DELIBERATE_TYPE_ERROR: number = "this is a string, not a number";` immediately above the
`resolveOrderingFor` call in `app/present/resolvers/ordering.ts` (the resolver `commitLine` actually
walks):
```
app/present/resolvers/ordering.ts(95,11): error TS2322: Type 'string' is not assignable to type
'number'.
```
Reverted; `npm run typecheck` clean again; `git diff --stat` empty.

**Mutation proof — the existing tests genuinely catch the defect this branch was opened to fix.**
Temporarily collapsed `resolveOrderingFor`/`resolveOrderingPlacementFor` to always call the narrow,
declared-only `orderingFor`/`orderingPlacementFor` — i.e., restored the exact pre-`86bb4c0` shape,
where line 333 IS reachable and every undeclared section abstains again:
```
$ node --test tests/app-settle-wiring.test.mjs tests/app-ordering-note.test.mjs \
    tests/present-ordering.test.mjs
# tests 102 / pass 89 / fail 13
```
Among the 13: `app-settle-wiring.test.mjs` §5 ("PLACEMENT APPLIES AT COMMIT") and
`app-ordering-note.test.mjs` §9 ("THE HEADLINE DEFECT") — the two tests this document leans on
hardest — both go red the instant the fallthrough is removed, and green again the instant it is
restored:
```
$ (revert) && node --test tests/app-settle-wiring.test.mjs tests/app-ordering-note.test.mjs \
    tests/present-ordering.test.mjs
# tests 102 / pass 102 / fail 0
```
`git diff --stat` empty afterward — nothing from either proof remains in the tree.

**Negative proof — `insertion_order` still refuses to move a row.** Already covered, unmodified, by
`tests/app-settle-wiring.test.mjs` §6 ("AN ABSTAINING SECTION NEVER MOVES THE ROW AT ALL") —
included in the full-suite pass above, and independently re-run:
```
$ node --test tests/app-settle-wiring.test.mjs
# tests 10 / pass 10 / fail 0   (§6's own test among them)
```

---

## 10. What I refuted

**1. That `app/present/ordering.ts:333` is reachable from any runtime path.** It is written exactly
as the brief quoted it, but it lives inside `evaluateSection`, called only by the DECLARED-only
`orderingFor`/`orderingPlacementFor`, which no caller in `app/` reaches except through
`resolveOrderingFor`/`resolveOrderingPlacementFor` — and that dispatcher only calls them once it has
already confirmed the section IS declared, at which point line 333's own condition cannot be true.
Confirmed by a repo-wide grep finding zero other callers, and by the mutation proof (§9): removing
the fallthrough is what makes line 333 reachable again, and it is exactly the tests named above that
catch it.

**2. That the fix needed for this brief is a browser-side code change at all.** It shipped already,
in `86bb4c0`/`f448da2`/`35f3c5a`, all ancestors of this branch's own base commit. `git merge-base
--is-ancestor` confirms each; `origin/main`'s tip is this worktree's base, so there is nothing later
to have missed.

**3. That the live symptom is explained by a stale deployment.** My working hypothesis for most of
this session. Refuted directly: the live bundle (fetched read-only) already contains
`resolveOrderingFor`, `defaultOrderingFor`, the `RESOLVERS` registry, and `armSettle` called before
the write. The ONE commit missing live (`b828c43`) governs stamp-survival, not the initial placement,
and — reasoned through in §7 — does not obviously produce a wrong INITIAL position that later
self-corrects. I could not find a live-only explanation and say so plainly in §7 rather than
asserting one.

**4. That `membership.ts`/`promotion.ts`/`newline.ts`'s `no-section-declaration` abstentions are the
same failure shape as ordering's, wearing the same name.** They share the name and nothing else:
ordering's gap had an unconditional engine-published fallback to terminate into; these do not — the
browser genuinely was never told the section's qualification predicate. `design-the-two-rules.md`
§10's refutation 2 already drew this exact line for a narrower case (items 16-19 vs. `newline.ts`'s
own GLOBAL rung); this document confirms it holds for the two resolver call sites that were not
already checked, and for `rules.ts`'s undocumented silent variant of the same gap.

---

## 11. What I could not settle

**Whether the operator's live observation happened before or after `86bb4c0`/`f448da2` (both
2026-08-04) and `35f3c5a` (2026-08-05) reached the deployed app.** Given the live bundle already
contains all three, and I have no timestamp for the observation itself, I cannot rule this in or
out. §7 states the two candidate explanations (stale observation, or a real content shape —
`nested-section`, most plausibly — this reproduction cannot see without reading `~/qntm`, which is
forbidden) without preferring one.

**Whether redeploying (to pick up `b828c43`) would change what the operator sees next time.** It
would close the one confirmed gap between live and `HEAD` (stamp-survival across the engine's next
answer), but §7's own reasoning is that this gap does not obviously produce the reported symptom.
Recommending a redeploy is reasonable on general grounds — it is one merged commit behind, and there
is no reason to leave it there — but I am not claiming it fixes the reported bug, because I have not
established that it caused it.

---

## 12. Reproduction

```
# this document's own base:
git rev-parse HEAD                                    # fix/the-ordering-cascade-terminates @ 53e50ad
git merge-base --is-ancestor 86bb4c0 HEAD && echo yes
git merge-base --is-ancestor f448da2 HEAD && echo yes
git merge-base --is-ancestor 35f3c5a HEAD && echo yes
git fetch origin main && git log --oneline origin/main -1   # 53e50ad, no commits landed after

# §1 — line 333's real, unreachable location:
sed -n '323,335p' app/present/ordering.ts
rg -n '\borderingFor\(|\borderingPlacementFor\(' app/ --type ts -g '!ordering.ts'

# §2 — the dispatcher:
sed -n '917,962p' app/present/ordering.ts

# §3 — engine agreement (read-only, monorepo):
rg -n '_DEFAULT_ORDERING|_PRIORITY_RANK' \
  /Users/lukeannison/projects/qntm-network/qntm/apps/qntm-md/src/qntm_md/render/section_builder.py
node --test tests/resolution-default-ordering-agreement.test.mjs

# §4 — the scenario, already committed:
node --test tests/app-settle-wiring.test.mjs      # §5 is "PLACEMENT APPLIES AT COMMIT"
node --test tests/app-ordering-note.test.mjs      # §9 is "THE HEADLINE DEFECT"

# §6 — the live deployment, read-only:
curl -s https://qntm.network/presentation.json | sha256sum; sha256sum presentation.json
curl -s https://qntm.network/dist/present.js -o /tmp/live-present.js
npm run build && diff /tmp/live-present.js dist/present.js | wc -l   # 141, all in SettleSurface
curl -s https://qntm.network/app/ | grep -n 'armSettle(settle, commit.markdown\|await writeFile(view, commit.markdown'

# §9 — full suite, both directions of the mutation proof, the typecheck injection:
node --test --test-reporter=tap "tests/**/*.test.mjs"   # 2186 / 2180 pass / 4 fail / 2 todo
node scripts/check-operation-completeness.mjs

# NOT RUN, deliberately: no cycle, no graph-sync, no wrangler --remote, no POST to
# https://qntm-graph.fly.dev, no git stash. ~/qntm and ~/.qntm-md were never opened. config/ and
# apps/qntm-md/config/ were never written. The trunk clones at
# /Users/lukeannison/projects/qntm-network/qntm and qntm.network were never edited (apps/qntm-md/
# was read read-only, for §3).
```

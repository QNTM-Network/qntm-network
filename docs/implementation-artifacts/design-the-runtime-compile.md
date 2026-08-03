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

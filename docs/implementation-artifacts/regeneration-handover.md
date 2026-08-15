# Regenerating `presentation.json` — what landed, what is missing, what is unlooked-at

Written 2026-08-15 at the end of a long session, at a deliberate stopping point. The
prerequisite is landed and green-adjacent; the alignment is not started. A half-applied
re-addressing is not resumable, so it was not begun.

Operator's ruling: *"this is just aligning with what is. We need to expand the config to
cover all and be up to date. And tests need to align."* The growth is the point, not a cost.

## Landed on this branch

- All four declarations regenerated; `presentation.json` and `presentation-dropped.json`
  committed.
- Three Python-built fixtures regenerated: `nodeline`, `resolution`, `retype`.

**The totals reconcile.** 2873 before → 2811 after regeneration alone (62 uncollected,
because `retype-agreement.test.mjs` threw at module load) → **2875** once the fixtures were
regenerated. The +2 against 2873 is data-driven parameterisation: `resolution-agreement`
covers 304 section seeds where it covered 225. Nothing is uncollected.

## The three holes in the regeneration path

Nobody had enumerated the non-npm generators. There are eight, plus one fixture with none.

| generator | state |
|---|---|
| `nodeline`, `resolution`, `retype` | ran, changed |
| `composition`, `day-boundary`, `view-key` | ran, no change |
| **`comparison-agreement.py`** | **cannot run** — `PatternError: Unknown pattern 'all-personal-nodes'` |
| **`qualification-agreement.py`** | **cannot run here** — requires `--state-db`; the only database that satisfies it is the operator's live one |
| **`composition-different-declaration-agreement.json`** | **no generator at all** — nothing in `scripts/` writes it |

The third is the worst. The other two are broken paths; that one is an artefact outside the
regeneration system entirely, and nothing would ever report it.

`comparison-agreement.py` needs its pattern name updated (`all-personal-nodes` →
`personal-tasks`) before it can generate anything. It has been dead since 2026-08-07.

## The only behaviour change

Four sections stop seeding a checkbox glyph they were never meant to seed:

```
assets-program.active-assets     ["#asset", "[ ]", "#program"]  →  ["#asset", "#program"]
assets-program.inactive-assets   ["#asset", "[x]", "#program"]  →  ["#asset", "#program"]
defects-program.active-defects   ["#defect", "[ ]", "#program"] →  ["#defect", "#program"]
defects-program.inactive-defects ["#defect", "[x]", "#program"] →  ["#defect", "#program"]
```

**The loss is the fix.** These are exactly the four the suite already tracked as
`KNOWN_CHECKBOX_SEED_DEFECT`, and that test's own failure message instructs the reader to
delete the exclusion rather than restate it. Of 215 sections present in both tables, 211 are
byte-identical, 0 gain a token, and 89 sections are new.

## The 42 failures — what is classified and what is NOT

**Three predate tonight entirely** and are unrelated to the regeneration:
`BASELINE: his real config today drops 11 tokens`; `membership.ts matches
deriveResolvableFields`; `ZERO further rules publish`.

**Thirty-nine are new since the regeneration**, by file:

```
15  present-seed.test.mjs            6  qualification-agreement.test.mjs
 4  comparison-agreement.test.mjs    3  app-seed-from-cascade.test.mjs
 2  present-viewmembers-agreement    2  measure-the-divergence
 2  declaration-drop                 1  each: present-rules, present-resolution,
                                        present-qualification, operator-set-agreement,
                                        compile-rules-for-each-arity
```

**I HAVE CLASSIFIED NONE OF THESE 39.** An earlier classification in this session covered
sixteen failures in the two seed files, against a different baseline and before the fixtures
were regenerated. It does not transfer, and it should not be assumed to. Twice tonight a
classification that was true and narrowly scoped was read as covering more than it did —
once by me, reaching the operator — so this says plainly that the 39 are unlooked-at.

What is worth expecting, as expectation and not finding: the 4 in
`comparison-agreement.test.mjs` are probably downstream of that generator being dead, and
the 6 in `qualification-agreement.test.mjs` of that fixture being unrefreshable. Neither is
checked.

## Not done

- **The size ceiling.** `the whole 'resolution' key stays under 50,000 bytes` fails at
  **69,909 B**. It moves, with its reasoning rewritten to say what it now guards against —
  it exists so a widening is visible rather than silent, and that purpose survives a new
  number. **Do not delete it.**
- The re-addressing of anything.

## Payload, measured rather than predicted

| | |
|---|---|
| served `presentation.json` before | 267,824 B |
| served after | 326,350 B (**+21.9%**) |
| `presentation-dropped.json`, never fetched | 51,025 B |

The ledger move is worth almost exactly its prediction (51,025 against 51,524 predicted). The
page still grows, because the same regeneration adds 89 sections. Ruled acceptable: the graph
blob already on the wire is 741 KB.

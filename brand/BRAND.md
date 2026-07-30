# qntm — brand / design department

> The pinned *thinking* behind the marks. Style is light in code, heavy in framework — this doc
> holds the framework so any session (or person) can pick up. The browsable concepts live in
> `brand/index.html`. Portable by design: this whole `brand/` folder can lift out to its own home.

---

## 1. What qntm means (the design must carry this)

**qntm = quantum = the smallest identifiable thing.** Break a system down sophisticatedly enough and
you find the *leverage points* — the spots where small, well-placed effort has disproportionate
impact ("$5 to hit the hammer, $95 to know where"). To identify / extract / leverage / store those
points is the whole game. The brand should feel like *precision, emergence, and quiet potency* — not
loud, not busy.

**qntm = quantification** (the second sense): numbers as the shared universe that normalises
qualitatively-different value into something referenceable — pricing, economies — applied inward to
one's own life. So the brand also lives near *signal, units, structure*.

Visual implications: a single **point** (the quantum/leverage point/electron/unit) + **radiance**
(emergence, value surfacing) + **structure** (the graph, the orbit). Modern, dark, restrained.

---

## 2. The taxonomy (the categories we're filling)

A "logo" is really a **suite**. The classic mark types:

| Type | What it is | Example | qntm status |
|---|---|---|---|
| **Wordmark (logotype)** | the name as styled type | Google, Coca-Cola | ✅ have: `qntm` lowercase |
| **Lettermark (monogram)** | initials / one letter | IBM, Google **G** | 🔜 exploring: the **Q** |
| **Pictorial mark** | a recognisable *thing* | Apple | — |
| **Abstract mark** | non-representational geometric form | Nike swoosh | 🔜 exploring: the **atom** |
| **Combination mark** | symbol + wordmark locked up | Adidas | 🟡 nascent: `● qntm` |
| **Emblem** | text inside a badge | Starbucks | — (unlikely) |

Above any single mark sits the **brand system / design language** — the portable kit reused
everywhere (Google's four colours, its **G**, etc.):

| Element | qntm status |
|---|---|
| **Colour system** | ✅ green `#3ff07f` · black `#0a0b0a` · white `#e6ebe6` |
| **Typography** | ✅ Inter (sans) + JetBrains Mono (mono) |
| **Motion / interaction language** | ✅ pulsing dot · glow/bloom · orbit · graph · repel (live on site) |
| **The "brand device"** | ✅ the glowing green dot (our signature element) |
| **Icon mark (small-space / favicon / app icon)** | ❌ the main gap → the Q-mark's job |
| **Logo suite / lockups** (primary, stacked, mono, reduced) | ❌ to build |
| **Responsive logo** (full `qntm` ↔ reduced Q) | ❌ to build |

**Honest read:** qntm already has a real, coherent identity (colour + type + motion + the dot). The
work is naming/extending it and filling the **icon mark + lockups** — which is what the Q concepts
are for.

---

## 3. Directions in play (see the gallery for renders)

1. **Wordmark, refined** — `qntm` + the dot, tightened. The winner may well be an *evolution of what
   we have*, not a revolution (the `● qntm` is already stampable). Refine ≠ replace.
2. **Q-mark (lettermark)** — uppercase **Q** read as an **atom**: a ring (orbit) with an electron
   (the glowing dot) at the tail position. Reads as *both* Q and atom — and *is* the thesis (the
   quantum/leverage point). Variants: dot on / outside / inside the ring; ring vs filled; with an
   orbital streak; with a nucleus.
3. **Abstract / atom** — more stylised: orbit + electron, or a lit **graph node** with edges (ties to
   the site's graph). The quantum as a node in a system.
4. **Lockups** — Q-mark + `qntm`, horizontal & stacked; optional tagline "the path of least
   resistance."
5. **App icon / favicon** — the Q-mark in a rounded square, proven legible at 16–180px.

Surfaces to leverage: **green-on-black** (hero), white (simple), mono-green. Radiance (CSS/SVG glow
filter) is the signature — strongest on black.

---

## 4. Decisions log (append as we settle)

- 2026-06-27 — Department created. Direction: refine the wordmark + develop a Q-as-atom **icon mark**
  to pair with it (a Google-style wordmark↔reduced-mark system). Tooling decided: **SVG/code, no
  image model, £0** — logos are vector, which is exactly the code surface. Image-gen models are a
  *separate, later* frontier (raster/illustration), not needed for marks.
- 2026-06-27 — **DIRECTION CONFIRMED** (operator + design-trained advisor / his dad). The icon mark is
  the **Q = ring + electron** (gallery #qmark options 1 "ring + electron" and 3 "minimal" — i.e. a
  circular ring with one electron at the tail). **Literal Q wins over pure atom/node.** Treatment is
  **MONO** (ring + electron one colour). Now tuning three dials in `qmark-lab.html`: (1) ring
  **thickness** (bold↔hairline), (2) **mono luminance** grey → white → glow-white (radiance), (3)
  naturalised **kerning** on the mono wordmark (mono normally doesn't kern; we borrow the feel via
  letter-spacing). Next: read off the chosen values from the lab and log them here, then it's THE mark.
- 2026-07-30 — **The mark moves.** The confirmed Q now exists as a component — `app/mark/qmark.html`
  (one line of inline SVG) + `app/mark/qmark.css` (its own sheet; no script, no fetch, no library) —
  with the electron travelling the ring on load and settling at the tail: 1.5 revolutions clockwise,
  700ms, on the site's declared `--ease`, starting from the tail's antipode. That is **orbit**, which
  §2 already declares as ours; no new motion was invented. **None of the three open dials was
  touched** — ring thickness and mono luminance are custom properties carrying the lab's current
  values, and the motion depends on neither of them (only on the ring's radius and the electron's
  centre, both settled above). Watch it at every size in **`qmark-motion.html`**. At and below 20px
  the reveal does not run: the electron is 2.56px at favicon size, and what you see there is the mark
  wobbling rather than an orbit, so small sizes render the settled Q — same markup, same geometry.
  Still NOT wired into the app; the wiring is two lines, named at the foot of that page.

## 5. Open questions

- ~~Literal **Q** vs pure **atom/node**?~~ → **RESOLVED: literal Q (ring + electron).**
- ~~One electron or several?~~ → **RESOLVED: one electron.**
- Exact **ring thickness**? (tuning in the lab — bold vs hairline)
- Exact **mono luminance**? grey / white / glow-white — and how much glow is "us" vs too much?
- Exact **wordmark kerning** value? (mono, naturalised)
- Lowercase `qntm` forever, or is there a caps treatment for some contexts?

## 6. How this department works (so a future session continues)

- **Pins ≠ only falsifiable enforcers.** Design pins are *frameworks for understanding* — categories,
  rationale, decisions. They live here (and, when we formalise, as flow-trace `[brand]` capabilities:
  a suite-completeness matrix tracking which categories are filled). Not every *style* gets a pin;
  the *categories and decisions* do.
- **The gallery** (`index.html`) is the play surface — render wide, react, settle, log decisions here.
- Take your time. Multiple sessions expected. The doc + gallery are the memory.

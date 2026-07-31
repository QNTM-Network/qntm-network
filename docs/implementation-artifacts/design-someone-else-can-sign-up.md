# Someone else can sign up — the journey, and the one thing it waits on

**Date:** 2026-07-30 · **Branch:** `design/someone-else-can-sign-up` · **Scope:** `app/` (the front
end). `server/` and `worker/` — identity, isolation, and where a second user's graph lives — belong
to a sibling and are **not touched here**.

**The ask, in the operator's words:** *"everything that I can do, someone can now log in and do
themselves… for now just their secure environment and login with passkey process for their own."*

**The short answer.** The ceremony works. Everything around it is written for one person, and that
person is him. A stranger who signs up today lands in a room whose only furniture is an instruction
to run a command-line tool on a laptop they do not own — **and if the hosted model is configured,
they do not land in an empty room at all, they land in his.** The first is mine to fix and half of
it is fixed in this change. The second is the sibling's, and it is named here because it decides
what the empty room can contain.

---

## 0. How this was established

Nothing below was inferred from reading alone, and nothing was done against production.

The repo was served from a local static server on `:8080` with a **stubbed worker** on `:8787` that
reproduces `worker/src/app.js` and `worker/src/auth.js` answers verbatim — including the handle
regex, copied character-for-character so the stub cannot be kinder than the thing it stands in for.
The app was then driven inside an **iframe sized to an exact viewport** (390×844 and 1440×900), so a
media query saw a real phone width without the browser window being resized, and every number below
is a `getBoundingClientRect()` or a `getComputedStyle()` read from inside that frame.

**No WebAuthn dialog was ever opened.** The client's own failure path was reached instead by
answering `/auth/register/options` with a deliberately foreign `rp.id`, which
`@simplewebauthn/browser` rejects *before* it calls `navigator.credentials.create` — so the catch
block was observed running, in a real browser, with no modal.

Baseline, before and after this change: **275 tests, 0 fail**; `flow-trace verify .` **32 PASS / 0
FAIL**, run twice (exit 0 both times).

---

## 1. What a person who is not him hits today

### 1.1 The landing page tells them the door is shut

`index.html` has exactly two ways off the page, both in the top-right cluster:

| control | what it says | measured (390×844) |
|---|---|---|
| `a[href="/app/"]` | `app →` | **61.09 × 32.47px**, font **11.52px**, colour `rgb(138,148,138)` |
| `form.access` (×2) | `Request access →` | **328.37px** wide, the hero's actual call to action |

The page's whole conversion is a waitlist. Its own note under the button reads *"One message, when
it's ready"*, and the closing section repeats *"One message, when the doors open."* **The doors are
open.** They are open behind a 61px grey link that says `app →`, whose hit target is **32.47px** —
below the **44px** minimum the app's own shell declares as `--touch` and enforces on every one of its
controls. The landing page and the app currently disagree about whether this product accepts
signups, and the app is the one telling the truth.

### 1.2 The entry screen is written for the returning visitor

Measured at 390×844, signed out:

| element | box | weight |
|---|---|---|
| `#entry h1` — "Enter the path." | 344.38 × 38.39, 25.6px | — |
| `#entry .tag` — "One thing at a time. Sign in with a passkey — no password to hold." | 344.38 × 48.00 | — |
| `#loginBtn` — "Continue with a passkey" | **215.89 × 47.99** | **filled**, `--accent` on `--bg` |
| `#handle` — placeholder "claim a handle" | **152.04 × 49.81** | — |
| `#registerBtn` — "Create passkey" | 150.53 × 49.81 | **ghost** |
| `#entryErr` | 310.57 × **16.8892** (empty) | — |

The one filled, high-emphasis button on the screen is the one a **new person cannot use**. Their
path is a ghost button, sitting under a 14px line reading "New here?", beside a **152px** input
whose only explanation of itself is the placeholder `claim a handle`.

Nothing on this screen says what qntm is. Nothing says what a handle is for, what its rules are,
whether it is public, or that it can never be changed (it cannot — there is no route that changes
it). Nothing says what a passkey is, or that pressing the button will summon an operating-system
dialog. The page asks for a durable credential and an identity in one gesture and explains neither.

### 1.3 Every failure hands over the raw string

Driven in the browser, all four at 390×844:

| what the person did | what `#entryErr` said | box height |
|---|---|---|
| pressed **Create passkey** with the field empty | `pick a handle first` | 21.1151 |
| typed `a` | `handle must be 2–32 chars (letters, digits, - _)` | 21.1151 |
| typed a taken handle | `handle taken — try logging in` | 21.1151 |
| got as far as the ceremony and it failed | `The RP ID "not-this-domain.example" is invalid for this domain` | **42.2301** |

Four facts, all measured, none of them opinions:

1. **`#entryErr` carries no `role` and no `aria-live`** (both read `null`). A screen reader is never
   told that anything went wrong. The person hears silence and a button that did nothing.
2. **`#handle` gets no `aria-invalid` and no `aria-describedby`** (both `null`). The message is not
   attached to the field it is about.
3. **The cursor does not move.** `document.activeElement` after every failure is `BODY` — not the
   handle field, not the button. On a phone the keyboard has already dismissed and the person has to
   find the 152px input again themselves.
4. **The error row is 4.226px short of the row it has to hold.** `.err { min-height: 1.2em }` at
   `font-size: var(--t3)` is `14.08 × 1.2 = 16.896px`; one line of text at `line-height: 1.5` is
   `14.08 × 1.5 = 21.12px`. Measured: `16.8892 → 21.1151`, a **4.2259px** shift of the card's bottom
   edge every time a message appears. This page's own suite polices **1.3637px** of movement in the
   reading column and asserts **0.0000px** on focus; the sign-up screen moves three times that,
   every time it says no.

And the fourth row is the important one: **the message is the library's, verbatim.** `register()`
and `login()` both end `catch (e) { $("entryErr").textContent = e.message; }`. Read out of the
shipped `@simplewebauthn/browser@13.3.0` bundle: a `NotAllowedError` — which is what Chrome raises
when **someone cancels the passkey sheet** — is re-thrown with
`code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY"` and `message: e.message`, the browser's own string,
unchanged. So a person who taps *Cancel* is shown Chrome's sentence, which ends in a link to
`w3.org/TR/webauthn-2`. **Cancelling is the single most likely thing a first-time visitor does with
a system dialog they did not expect**, and it is the one this screen answers with a spec URL.

### 1.4 Pressing "Continue with a passkey" first is the likelier first move

It is the filled button. A person who has never been here presses it, `/auth/login/options` returns
a discoverable-credential challenge with no `allowCredentials`, the platform finds nothing, and the
same `NotAllowedError` passthrough lands in the same red row. **The screen cannot distinguish "you
cancelled" from "you have no account" and says the same spec URL for both.**

### 1.5 The empty environment — measured, both widths

Signed in as a brand-new account whose worker answers `snapshot: null` (which is what
`worker/src/app.js#graphGet` returns for a user with no row in `graph_snapshots`):

**390 × 844.** The bar carries the mark and `@newcomer`. `#barView` is empty. The body holds
**one** element: `#freshness`, 344.38 × **42.23px** of `rgb(139,147,161)` at 14.08px, reading

> No snapshot yet — run graph-sync push on the laptop.

`#viewBody` measures **344.38 × 0**. The rail sits at y=794.55 with three live controls — Sign out
(x=18), Refresh (x=145.22), Views (x=269.17). Opening Views shows a tree containing the string
**"No views yet."** and a footer note that is the **empty string** (the `drawerNote` line, which
normally reads "76 views · 10 folders · \ opens, Esc closes", is blanked on this branch).

**1440 × 900.** A 128 × 848px rail down the left edge, a 560px column starting at x=497.18, and in
it a single **21.12px** line of grey text at y=75.99. `scrollHeight` is 900 — there is nothing below
the fold, because there is nothing.

**This is the whole first impression.** An instruction, in the dimmest colour on the page, to run a
command-line tool called `graph-sync push` on "the laptop". A new person has no `graph-sync`, no
laptop in this sense, and no way to find out what either is. There are three controls: one re-runs
the same request, one opens a drawer that says "No views yet", and one signs them out. **Signing out
is the only one that does anything.**

### 1.6 And there is a worse case, which is not mine to fix

`worker/src/app.js#graphGet`:

```js
if (env.GRAPH_SERVER_URL && env.SERVER_TOKEN) {
  const r = await fetch(`${env.GRAPH_SERVER_URL}/graph`, {
    headers: { Authorization: `Bearer ${env.SERVER_TOKEN}` },
  });
  ...
```

There is **no `user_id` in that call.** One hosted model, one shared server token, fetched for
whoever is holding a valid session. `POST /app/edit-file` is the same shape — it writes to
`${GRAPH_SERVER_URL}/vault/file` with the same shared token and no user scoping. Only the **D1
fallback** below it is per-user (`WHERE user_id = ?`), and only `graphPush` is scoped, to a single
`GRAPH_USER_ID` secret that `worker/wrangler.toml` documents as *"your users.id — the operator key
maps to this user"*.

Driven against a stub that answers the way that branch would: signed in as **`@newcomer`**, the bar
reads `@newcomer`, the body renders **`This week`** with the operator's own lines in it, and the
drawer lists **his** folder tree — `dev/ › qntm/ › qntm queue`, `Inbox`, `This week`. The front end
has no idea whose graph it is showing. It renders what `/app/graph` returns and puts
`session.handle` next to it.

**Whether that branch is live in production I could not verify** — it depends on two secrets I have
no access to. What I can say is that the operator's own in-browser editing **requires** them:
`editFile` returns `503 "server not configured"` without both. So if he can edit from the browser
today, `GRAPH_SERVER_URL` and `SERVER_TOKEN` are set, and a second person signing up lands in his
vault with a working write path.

**This is the sibling's, entirely.** I raise it because it is the fact that decides everything in
section 3, and because *"a new person sees an empty environment"* is not currently true — it is the
outcome we want, not the outcome shipped.

### 1.7 One more thing a stranger hits, and it is a defect

`app/index.html`, boot:

```js
(async () => {
  if (token) { try { await enterGraph(); return; } catch { localStorage.removeItem(tokenKey); token = null; } }
  show("entry");
})();
```

`enterGraph()` → `loadGraph()` → `api("/app/graph")`, and **any** throw from that chain deletes the
session token: a dropped connection, a worker cold-start timeout, a 500, a CORS hiccup on a train.
The person is silently returned to the entry screen with **no message at all**, and the only way
back in is another passkey ceremony. A session is meant to last 30 days (`SESSION_TTL` in
`worker/src/auth.js`); a flaky connection currently ends it. **Only a 401 should.**

---

## 2. What an empty environment should be

Two things, and the second one is what the whole design waits on.

**What it must say, under every possible answer.** An empty state is not a message — it is the
product's first sentence about itself. It has to do four jobs, and it can do the first three today:

1. **Name where you are.** `@handle`'s environment, empty, and empty because it is *new* — not
   because something failed. Today those two are indistinguishable: `snapshot: null` (no environment
   yet) and `snapshot.views = []` (an environment with nothing in it) render the same single grey
   line, and a *read failure* renders as a silent sign-out (§1.7).
2. **Say what a view is**, because the drawer, the bar and the whole reading column are organised
   around a noun nobody has defined: a view is a **file in your graph**, and the app **shows and
   edits** files — it does not create, rename, move or delete them. That is not a limitation to
   hide; it is the product's spine, and the last three agents held that line deliberately.
3. **Not issue an instruction the reader cannot follow.** "Run graph-sync push on the laptop" is
   addressed to exactly one human being on earth.
4. **Offer the next step.** ← **This one cannot be written yet.**

**What it cannot say yet.** Job 4 is a function of where a second user's graph lives, and that is
not decided. So the empty state as shipped in this change carries a **named, empty slot**
(`#emptyNext`) rather than a guess, and §3 lists what each possible answer would put in it.

**The hard structural fact, which no answer removes.** The app's only write path is
`commitLine`/`toggleTask` → `POST /app/edit-file` with `{ path, markdown }`, and `path` comes from
`view.path` — a view that came from `snapshot.views`. **There is no other call site that supplies a
path.** So:

> **An account with zero views cannot author anything, and the app has no way to change that.**
> The first view must be created by something that is not the browser.

This is worth stating plainly because the obvious design — *"empty state with a big Create your
first note button"* — is unbuildable without either breaking the no-writes-from-the-chrome rule the
last three agents held, or adding a server route that does not exist. It is the one shape of empty
state that must not be drawn.

---

## 3. Every point where this flow needs the data-model answer

Five. Each is listed with what changes under each answer, so the flow can be finished the day the
answer lands rather than rebuilt.

The candidate answers, from `docs/architecture/graph-server-plan.md` (which is explicitly
single-tenant today — *"one app, one small machine, a persistent volume … Seed the volume with the
current state.db (the live 1,482-node model)"*):

- **(A) Bring-your-own-machine.** No hosted model for a second user. They run qntm-md themselves and
  push snapshots into D1, exactly as `graph-sync.mjs` does. Needs `graphPush` to stop mapping one
  key to one `GRAPH_USER_ID`.
- **(B) Hosted, one model per user.** A vault + `state.db` per user on the Fly volume, keyed by
  `user_id`; the worker passes the user through.
- **(C) Hosted, seeded from a starter bundle.** As (B), plus registration creates a small starting
  vault so the account is never zero-view.
- **(D) Read-only guest.** A second user sees a shared or demo graph and cannot write.

### 3.1 The empty state's fourth job — `#emptyNext`

| answer | what `#emptyNext` says | what else the front end needs |
|---|---|---|
| **A** | "Connect a machine" + the user's push key + a waiting state | A **key-issuing screen** — new UI, new worker route, and the first thing in this app that shows a secret. Sizable: an arc. |
| **B** | "Your environment is ready and empty" + how the first file gets there | Still unbuildable in-browser (§2). Needs a server-side create, or the empty state stays terminal. |
| **C** | Nothing — **there is no empty state**, because a seeded account lands straight in `this-week` | The whole of §4.5 collapses into "the first view is already open". Cheapest by a distance. |
| **D** | "This is a demo of someone else's graph" + a banner that never goes away | Every edit affordance must be suppressed: checkboxes, `rawline` focus, the whole `commitLine` path. Not currently possible to suppress — see 3.4. |

### 3.2 What the sign-up form must collect

Today: a handle, and nothing else. Under **A** it must also, at some point, collect or issue a
**device pairing key**. Under **C** it may want a **starter-bundle choice**. Under **B/D** the
handle is genuinely enough. **Do not add fields speculatively** — a second field on this screen
doubles its perceived cost, and §1.2 already shows the screen over-asking relative to what it
explains.

### 3.3 What "first thing authored" means

- **A** — the first line is authored **on their own machine**, in a text editor, and appears in the
  app one push later. The app's role at signup is to get out of the way and show a waiting state.
  The onboarding is a **CLI onboarding wearing a web page**.
- **B/C** — the first line is authored **in the app**, in a `rawline` input, on a view the server
  made. This is the flow the reading column was built for and it needs no new write path.
- **D** — there is no first thing authored.

**These are not variations of one flow. They are three different products at the moment of first
use,** and that is precisely why the copy, the empty state and the post-signup screen are specified
here rather than written.

### 3.4 Whether the app must learn "this graph is not yours"

Under **D**, and under **B** during any shared/preview period, the front end needs a **read-only
mode** it does not have. Every affordance in the reading column assumes writability: the checkbox is
live, every line becomes an `<input>` on click, and `commitLine` POSTs unconditionally. Suppressing
that is a **presentation-cascade decision**, not a sprinkling of `disabled` attributes — the cascade
already has a `MODE` level reserved for exactly this kind of thing
(`design-presentation-cascade.md`, migration stage 4). If the answer is D, the read-only mode should
land as a cascade level and not as branches in `paint.ts`.

### 3.5 Whether a handle is public

Under **A** the handle is only a login name. Under any answer where two users can ever see the same
graph, it is a **name other people read**, and the entry screen has to say so before it is claimed —
handles are permanent (there is no rename route) and the entry copy shipped here deliberately says
*"chosen once"* and stops short of claiming it is private or public.

---

## 4. The journey, screen by screen

Copy is written out where it is settled. Where it is not, the slot is named and §3 says who fills
it.

### 4.1 Arrive

A visitor reaches `qntm.network` and reads a manifesto with a waitlist. **The landing page needs one
change and it is a product decision, not a design one:** either the waitlist copy stops saying the
doors are shut, or the `app →` link stops being an open door. **Not made here, deliberately** — it is
a conversion decision, it belongs to the operator, and opening the front door wider while §1.6 is
unresolved would be actively harmful. Specified, sized, not shipped.

When it is made, the way in must be a **≥44px** target with a verb on it ("Sign in", not `app →`),
matching the `--touch` token the app already enforces.

### 4.2 Understand

The entry screen has to answer three questions before it asks for anything:

- **What is this?** One sentence, product-level. *"qntm keeps what needs doing legible, and the path
  to it short."*
- **What is a handle?** Its rules, **before** it is typed, not after it is rejected: 2–32 characters,
  letters, digits, `-` and `_`, chosen once.
- **What is a passkey?** *"Your device will ask to confirm — face, fingerprint or screen lock. There
  is no password to remember and nothing to reset."*

And the two paths must stand as equals: **"First time here"** creates, **"Been here before"** signs
in. The returning path keeps the filled button only if the returning visitor is the likelier one; on
a page whose entire purpose today is that *someone else can sign up*, the new person's path is the
one that must be legible.

### 4.3 Create a passkey

Press → OS sheet → done, or one of the failures in §4.6. On success the session token lands in
`localStorage` and `enterGraph()` runs.

### 4.4 First sight

§2. Named, honest, with the next step slotted.

### 4.5 First thing authored

§3.3. Three different answers.

### 4.6 Every failure, and what it should say

Settled — shippable under every answer:

| failure | reached by | says |
|---|---|---|
| no handle | pressing Create with an empty field | "Choose a handle first." |
| malformed handle | 1 char, a space, a leading `-` | "A handle is 2–32 characters — letters, digits, `-` and `_`." |
| handle taken | `409` | "That handle is taken. If it's yours, sign in instead." |
| **ceremony cancelled** | tapping Cancel on the OS sheet | **"Cancelled — no passkey was created."** |
| **no passkey on this device** | pressing Sign in as a first-time visitor | *(same NotAllowedError — see below)* |
| already registered on this device | `InvalidStateError` → `ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED` | "This device already has that passkey — sign in." |
| challenge expired | >300s between the two calls | "challenge expired — start again" (the worker's own, and it already fits) |
| offline / worker down | network throw | "Could not reach qntm — try again." — **and the session is not thrown away** (§1.7) |

**The one that cannot be perfectly distinguished, stated honestly rather than papered over.** A
cancelled ceremony and *"this device holds no passkey for this site"* are the **same**
`NotAllowedError` — the platform refuses to tell a website which, on purpose, because the difference
is a privacy leak about what credentials a device holds. So the sign-in failure message must cover
both without lying: **"No passkey used — create one above."** The design response is not better
error text, it is **making the create path visible on the same screen** — which §4.2 does.

Every sentence in this table is **at most 48 characters**, and that is a constraint rather than a
style: see §6.1 for the measurement, and for what happened when the first draft ignored it.

Unsettled — needs §3:

| state | needs |
|---|---|
| signed in, no environment | 3.1 |
| signed in, environment with no views | 3.1 |
| signed in, someone else's graph | 3.4 |

---

## 5. The stages

Each ships independently and leaves the app working.

| # | stage | size | blocked on |
|---|---|---|---|
| 1 | **The entry screen tells the truth.** Handle rules stated before typing; passkey explained; the two paths at equal weight; `role="alert"`; `aria-invalid` / `aria-describedby`; cursor returns to the field; the error row reserves the row it needs. | **under an hour** | nothing — **SHIPPED HERE** |
| 2 | **Failures become sentences.** WebAuthn codes mapped to human text; cancelled ≠ crashed; a network failure stops destroying a 30-day session. | **under an hour** | nothing — **SHIPPED HERE** |
| 3 | **The empty state stops addressing the operator.** Named, honest, distinguishes "new" from "nothing to show" from "couldn't read"; `#emptyNext` slot left empty. | **under an hour** | nothing — **SHIPPED HERE** |
| 4 | **The landing page's way in matches reality.** Either open it properly (a ≥44px verb) or close it. | **under an hour** | an operator decision (§4.1) **and** §1.6 |
| 5 | **`#emptyNext` gets its sentence,** and the post-signup screen becomes a first run rather than a dead end. | **half a day** | **§3.1 — the data-model answer** |
| 6 | **Whichever first-run flow the answer implies** — a pairing-key screen (A), a seeded first view (C), a read-only mode as a cascade level (D). | **an arc** | **§3** |
| 7 | **Account surface**: sign out everywhere, add a second passkey, see your devices, delete the account. None exists; all four are things a person who is not the owner will expect within a week. | **an arc** | worker routes that do not exist |

Stages 1–3 are in this branch. Stage 4 is deliberately not.

---

## 6. What shipped in this change

All of it inside `app/index.html`. **`app/present/` is untouched** — verified by `git diff --stat`.
No new write path, no create/rename/move/delete, nothing added to the chrome that edits the vault's
shape.

1. `#entry` rewritten: a product sentence, two paths with the **newcomer's first and filled**, the
   handle rule stated as a hint (`#handleHint`) wired with `aria-describedby`, and a passkey
   explanation. Measured after, at 390×844: `#registerBtn` 148.71 × 47.99 filled, `#loginBtn`
   217.71 × 49.81 ghost, `#handleHint` 310.57 × 42.23 above the field.
2. `#entryErr` gains `role="alert"`; `#handle` gains `aria-invalid` and a `.wrong` mark on failure;
   the cursor returns to `#handle` for handle-shaped failures.
3. `.err { min-height: 1.5em }` — the measured 4.2259px shortfall, closed.
4. `friendlyAuthError()` maps the WebAuthn codes to sentences; the raw library string is no longer
   put in front of a person.
5. Client-side handle validation mirroring `HANDLE_RE`, so a malformed handle costs no round trip.
   **The two copies of that regex are held together by a test** that reads the source of
   `worker/src/auth.js` and of `app/index.html` and asserts the pattern is the same string — the
   duplication is deliberate and policed rather than merely commented.
6. `api()` attaches `err.status`; boot only discards the session on **401**; and the re-read guard
   became "no session *and* no graph", because after a failed boot read the Refresh button was the
   only way out and was unpressable.
7. The empty state: `#empty`, distinguishing no-environment from no-views from could-not-read, with
   `#emptyNext` reserved and empty.

### 6.1 Two things the build itself found, which the reading had not

**The first draft closed a 4.2259px shift and opened a 21.1151px one.** Reserving one line is only
worth anything if the sentences fit one line. Measured at 390×844 with each real message in the row,
**four of eight wrapped** and pushed the sign-in button down by exactly one row — five times the
movement the reservation was fixing. Reserving *two* lines would be 21px of dead space on every
load for a rare state, so the sentences were shortened instead. **The budget is 48 characters, and
it is a measurement**: the row is 310.5682px wide at `--t3`, a 47-character message fits, and so
does a string of **45 capital Ms** — the widest glyph in the face, and therefore the worst case any
real sentence can be. Measured after: **all eight messages at 21.1151px, sign-in button at
+0.0000px.** The budget is asserted, so a longer sentence is a red test rather than a jump nobody
measured.

**A mutation survived, and it was dead code rather than a weak test.** `showEntryError` had an
`else` that un-marked the field; breaking it turned nothing red. It turned out every caller is
preceded by `clearEntryError()`, so the branch was unreachable — a second answer to "who clears
this" that no test could hold to account. It was deleted rather than covered, and the mutation now
targets `clearEntryError`, where it dies.

### 6.2 Proof

- **`npm run check`** (typecheck → build → test): **302 tests, 0 fail** (275 before, +27 new).
- **`flow-trace verify .`**: **32 PASS / 0 FAIL**, exit 0 — run twice before the change and twice
  after, four runs, same number every time.
- **28 targeted mutations, 28 killed.** Every change above was reverted one line at a time against
  `tests/app-entry.test.mjs` + `tests/app-shell.test.mjs`, and each turned the suite red. A green
  that cannot be made to go red is not a green.
- **`app/present/` is untouched**; the golden painter comparison, the DOM-inversion detectors and
  the zero-movement row suite were not modified and stay green.

---

## 7. What I refuted

- **"Registration is built, so someone else can sign up."** The ceremony is built. Everything that
  makes it a *sign-up* — knowing what you are joining, what a handle costs you, what happens when
  you cancel, what you get afterwards — is not.
- **"A new user just needs an empty state drawn."** They need an empty state *designed against a
  data model that does not exist yet*. §2 shows the one shape it must not take, and §3 shows four
  different products hiding behind the same blank screen.
- **"The new person can write their first line straight away."** **False, structurally.** The only
  write path posts to a `path` that came from a view in the snapshot. Zero views, zero paths, zero
  first line — and the app cannot make one without becoming the thing the last three agents refused
  to build.
- **"Signing up gets you your own environment."** Not today. §1.6: if the hosted model is
  configured, every session reads and writes the same single graph through one shared token.
- **"The landing page has no way in."** It has one — a 61.09 × 32.47px grey link, on a page whose
  headline call to action says the doors are not open yet. The problem is not absence; it is
  contradiction.
- **"`#app` could be the empty state."** Confirmed dead a fourth time: `loadState()` is the only
  caller of `show("app")`, and `loadState()` has no callers. Reviving it would also be wrong —
  captures land in D1 and views come from the graph snapshot, so a capture can never become a line
  in a file. Nothing here builds on it.

/**
 * THE PROJECTION-REPLAY CONVERGENCE HARNESS — design-the-resolution-architecture.md step 12,
 * L7 RECONCILIATION.
 *
 * ── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT ──
 *
 * A TEST HARNESS, not a runtime module. It lives under `tests/`, imports only what
 * `dist/present.js` already exports (`app/present/index.ts`'s barrel), and adds ZERO lines under
 * `app/`. See `tests/present-replay.test.mjs`'s own header for the argument that this MUST be a
 * test harness and not a runtime check, and for why that argument is not free.
 *
 * §6.2 of the design document names the gap this closes: the agreement harness
 * (`tests/qualification-agreement.test.mjs`) proves the browser and the engine agree about WHAT —
 * one predicate, one field set, one instant. Nothing proved they agree about WHEN: the cycle's own
 * clock, the order rows land in, what happens when the operator types between a prediction and its
 * arrival. THE TEST THAT WOULD IS A PROJECTION REPLAY (§6.2 D4), and this is it: take a real
 * before, a gesture (an edit the operator makes against it), and an arriving projection (the
 * cycle's real output, or — since no cycle runs anywhere near this repo — a fixture built the way
 * a real cycle transforms a real line), and report what converged.
 *
 * ── THE SIX THINGS THE HARNESS MUST BE ABLE TO SAY, AND WHERE EACH ONE COMES FROM ──
 *
 * Every fact below is derived from an ALREADY-BUILT, ALREADY-TESTED pure function
 * (`app/present/instance.ts`, `membership.ts`, `ordering.ts`, `address.ts`, `base.ts`) — this
 * module adds NO new resolution logic, only the comparison a caller of those functions had never
 * been asked to make before.
 *
 * 1. CURSOR — did it land on the same line, and by which rung? `resolveInstanceAnchor`'s own
 *    `InstanceReading`, graded by `ANCHOR_TRUST` (instance.ts) — `instance` (the same printing),
 *    `node` (the same node, printed somewhere else), `relative` (the neighbourhood held and the
 *    characters confirmed it — app/present/relative.ts) or `text` (the neighbourhood did not hold,
 *    but exactly one line still carries his characters); or `ambiguous`, or `absent`.
 *
 *    THE LAST TWO ARRIVED WITH `widen-instance-identity-past-the-first-stamp`, and they are what
 *    turned §1's marquee finding from a measurement into a closed row: a line being AUTHORED has no
 *    node to search with and its characters change the instant the cycle stamps it, so the first two
 *    rungs are structurally unavailable at once. See `tests/present-replay.test.mjs` §1b.
 *
 * 2. MEMBERSHIP — right, wrong, or abstained? THE GROUND TRUTH IS THE CURSOR, NOT A SECOND CALL TO
 *    `membershipFor` ON THE ARRIVED LINE, and that is the harness's one real design decision, spelled
 *    out because it is not obvious. Once a line is stamped, `membershipFor` abstains for it BY
 *    DESIGN (`already-a-node` — it only answers for a line being typed), so re-asking it about the
 *    ARRIVED text usually reproduces this SAME abstention and proves nothing. What the harness reads
 *    instead is the SECTION ORDINAL the reconciliation landed in, against the one the anchored line
 *    sat in — the same fact `instance.ts` counts by heading position and never by a heading's
 *    characters. That is membership's actual answer, read off the SAME reconciliation the cursor
 *    already does, not a second resolver run against a string the row's own module abstains on.
 *
 *    IT USED TO READ `via === "instance"` AS THAT FACT, and `actualMembership`'s own JSDoc records
 *    why that proxy stopped being sound the moment a third rung existed.
 *
 * 3. ORDERING — right, wrong, or abstained? Compares the PREDICTED post-edit rank (`orderingFor`
 *    called at commit time, its own `afterRank`) against the ACTUAL rank the resolved line holds
 *    once the projection lands (`orderingFor` called again, no-op, against the arrived text at the
 *    arrived index — its `beforeRank` is then simply "where is this line now"). Ranked among
 *    whichever siblings each call finds in ITS OWN source string — a real limitation, named in this
 *    module's own JSDoc on `orderingConvergence` below and in the test file's "what this does not
 *    verify" section: a cycle that reordered UNRELATED siblings as well as the edited line would
 *    move the rank number for a reason the edited line's own edit did not cause, and this harness
 *    cannot tell that apart from a genuine misprediction. Fixtures below hold every sibling fixed but
 *    the one line being replayed, specifically so this limitation cannot hide inside them.
 *
 * 4. PRESERVED — did anything the operator typed get replaced? The committed gesture's own text
 *    (`gesture.text`) checked as a PREFIX of the arrived line — matching the one real shape every
 *    stamped line in the operator's own vault shows: the title first, cycle-appended tokens after,
 *    never a rewritten prefix (`~/qntm/inbox.md`'s three real stamped lines, read below). A cycle
 *    that rewrote or dropped what was typed fails this check, and the mutation proof in the test file
 *    deliberately constructs exactly that to show the harness catches it.
 *
 * 5. BASE — did the staleness report fire when it should, and stay silent when it should?
 *    `BaseSurface` directly — `served.take(view.path, before)`, `served.read(view.path, editBase)` —
 *    no new logic, the harness merely wires the same surface `app/index.html`'s `writeFile` already
 *    uses into one fixture call.
 *
 * 6. DRAFT — WOULD A LINE HE HAS OPEN AND HAS NOT COMMITTED SURVIVE THIS ARRIVAL, and where would
 *    it land? Added with `a-line-being-made-survives-a-projection-too`. The other five all describe
 *    a line that IS in a source string, at one end or the other; this one describes the row that is
 *    in NEITHER — not in `before` (nothing is written until it settles) and not in `after` (the
 *    cycle never saw it). It is the last state the operator's own gesture passes through that the
 *    harness could not report on.
 *
 *    SAME POSTURE AS EVERY POINT ABOVE: the decision is `app/present/draft.ts`'s own `placeDraft`,
 *    called with the facts this harness already has, and no new judgement is added here. Supply
 *    `drafting: { lineIndex, seed, typed }` to ask; omit it and `draft` is `null`.
 */

import {
  applyEdit,
  BaseSurface,
  instanceAnchorFor,
  instancesOf,
  membershipFor,
  orderingFor,
  placeDraft,
  placeFor,
  resolveInstanceAnchor,
  sectionAt,
  sectionOrderFor,
} from "../../dist/present.js";

/**
 * `localAfter` — the string the cursor is anchored against once the gesture has been applied
 * locally, matching `paint.ts`'s own "the painter repaints OPTIMISTICALLY from its own edited
 * string after a commit" (`base.ts`'s header cites the same fact for why the surface takes the
 * SERVED markdown, never a locally-edited one, as its base — this is the other side of that same
 * split).
 *
 * `gesture.kind`:
 *   "none"        — no local edit. The cursor sits on an existing line, untouched, and the world
 *                    moves under it anyway (a poll landing while nothing was typed). `localAfter`
 *                    IS `before`.
 *   "set-line"     — an existing line changes text (`membershipNoteFor`'s own `commit.kind`).
 *   "insert-line"  — a wholly new line is typed where none was — the case that matters most,
 *                    because an inserted line has NO node yet and no prior instance either, so its
 *                    anchor's `node` field is `null` and the two-tier walk's second tier cannot run
 *                    once the cycle changes its text (see `instance.ts`'s own header, "WHAT DOES
 *                    NOT COLLAPSE").
 *
 * Throws if the fixture's own gesture is not a legal edit — `applyEdit` returning `null` here is a
 * bug in the FIXTURE (an edit `paint.ts` would never have produced), not a fact worth reporting as
 * part of a convergence reading, so it fails loudly rather than silently downgrading to "abstain".
 */
function localAfterFor(before, gesture) {
  if (gesture.kind === "none") {
    return before;
  }
  const edit =
    gesture.kind === "set-line"
      ? { kind: "set-line", lineIndex: gesture.lineIndex, text: gesture.text }
      : { kind: "insert-line", lineIndex: gesture.lineIndex, text: gesture.text };
  const result = applyEdit(before, edit);
  if (result === null) {
    throw new Error(
      `replay fixture's own gesture was refused by applyEdit (${gesture.kind} at line ${gesture.lineIndex}) — the fixture is not a real edit`,
    );
  }
  return result;
}

/**
 * `belongs: true -> false` is the ONE transition `membershipNoteFor` says anything about
 * (app/index.html's own comment: "only the leaving transition is said"). Every other transition —
 * including an abstention on either side — is silence, so the harness's "predicted" value has only
 * two states worth comparing against the cursor's ground truth: `"leaves"` or `"stays"`, plus
 * `"abstain"` for either side abstaining (nothing was predicted, so nothing can converge or
 * diverge).
 */
function predictedMembership(view, sectionId, before, gesture, qualification) {
  if (sectionId === null || gesture.kind !== "set-line") {
    return { kind: "abstain", because: sectionId === null ? "no-section-declaration" : "not-a-set-line-commit" };
  }
  const beforeLine = before.split("\n")[gesture.lineIndex] ?? "";
  const beforeAnswer = membershipFor(view, sectionId, beforeLine, qualification);
  const afterAnswer = membershipFor(view, sectionId, gesture.text, qualification);
  if (beforeAnswer.kind !== "answer" || afterAnswer.kind !== "answer") {
    return {
      kind: "abstain",
      because: beforeAnswer.kind !== "answer" ? beforeAnswer.because : afterAnswer.because,
    };
  }
  const leaves = beforeAnswer.answer.belongs && !afterAnswer.answer.belongs;
  return { kind: leaves ? "leaves" : "stays", sectionName: afterAnswer.answer.sectionName };
}

/**
 * The cursor's OWN reading is membership's ground truth — see this file's header for why a second
 * call to `membershipFor` on the arrived text is not used instead.
 *
 * ── IT COMPARES THE SECTION DIRECTLY NOW, AND `via` IS NO LONGER A PROXY FOR IT ──
 *
 * As merged, this function read `via === "instance"` as "same section" and everything else as
 * "moved". That was sound while the walk had exactly two rungs: an instance string ENCODES the
 * section, so an instance match could only mean the section held, and the only other way to be
 * found was the node tier, which fires only when the instance changed.
 *
 * `widen-instance-identity-past-the-first-stamp` added two more rungs (`relative`, `text` —
 * app/present/relative.ts), and for both of them the instance string changes for a reason that has
 * nothing to do with the section: THE CYCLE STAMPED THE LINE, so an unstamped line's own characters
 * — which are its whole identity — are not what they were. Reading that as "the row left its
 * section" would have made every closed first-stamp report a spurious `leaves`, which is exactly
 * the false answer the two-rung version was careful not to give.
 *
 * So the fact is now read where it actually lives: the section ORDINAL of the anchored line before,
 * against the section ordinal of the row that was found. That is a GENERALISATION rather than a
 * replacement — for a `via:"instance"` match the two ordinals are equal by construction, so every
 * reading this function gave before it is unchanged.
 */
function actualMembership(reading, view, after, sectionBefore) {
  if (reading.outcome !== "found") {
    return { kind: "unknown", outcome: reading.outcome };
  }
  const sectionAfter = instancesOf(after, view)[reading.lineIndex]?.section ?? null;
  return { kind: sectionAfter === sectionBefore ? "stays" : "leaves" };
}

function predictedOrdering(view, sectionId, before, gesture, resolution) {
  if (sectionId === null || gesture.kind !== "set-line") {
    return { kind: "abstain", because: sectionId === null ? "no-section-declaration" : "not-a-set-line-commit" };
  }
  const reading = orderingFor(
    view,
    sectionId,
    before,
    gesture.lineIndex,
    gesture.text,
    resolution.ordering,
    resolution.orderingFields,
  );
  if (reading.kind !== "answer") {
    return { kind: "abstain", because: reading.because };
  }
  return { kind: "rank", rank: reading.answer.afterRank, moved: reading.answer.moved };
}

/**
 * "Where is this line NOW" — `orderingFor` called with `afterText` equal to the line's own current
 * text, so `beforeRank === afterRank` and the harness reads either as "the current rank among
 * whichever siblings this section carries in the ARRIVED projection". See this file's header, point
 * 3, for the sibling-set caveat this framing carries.
 */
function actualOrdering(view, after, reading, sectionOrderTable, resolution) {
  if (reading.outcome !== "found") {
    return { kind: "unknown", outcome: reading.outcome };
  }
  const sectionId = sectionAt(after, reading.lineIndex, view, sectionOrderTable);
  if (sectionId === null) {
    return { kind: "unknown", outcome: "no-section-declaration" };
  }
  const lines = after.split("\n");
  const text = lines[reading.lineIndex] ?? "";
  const answer = orderingFor(
    view,
    sectionId,
    after,
    reading.lineIndex,
    text,
    resolution.ordering,
    resolution.orderingFields,
  );
  if (answer.kind !== "answer") {
    return { kind: "unknown", outcome: answer.because };
  }
  return { kind: "rank", rank: answer.answer.beforeRank };
}

/**
 * Was `gesture.text` — the characters the operator actually committed — still present, as a
 * PREFIX, once the projection arrived? See this file's header, point 4.
 */
function preservedFor(gesture, after, reading) {
  if (gesture.kind === "none" || reading.outcome !== "found") {
    return "unknown";
  }
  const arrived = after.split("\n")[reading.lineIndex] ?? "";
  return arrived.startsWith(gesture.text);
}

/**
 * WHAT WOULD HAPPEN TO A ROW HE HAS OPEN AND HAS NOT COMMITTED. See this file's header, point 6.
 * `null` when the fixture names no `drafting`, which is every fixture written before this existed.
 *
 * THE PLACE IS TAKEN AGAINST `before` AND THE PLACEMENT RESOLVED AGAINST `after`, which is exactly
 * the pairing the page makes: `openLine` takes the place off the string the row's index means, and
 * `paintView` resolves it against the string that has just replaced it. Taking it against
 * `localAfter` instead would be describing a row opened into a file the operator's own gesture had
 * already changed — a different fixture, and not the one this field is for.
 */
function draftFor(view, before, after, drafting) {
  if (drafting === undefined || drafting === null) {
    return null;
  }
  const seed = drafting.seed ?? "";
  const draft = {
    lineIndex: drafting.lineIndex,
    seed,
    typed: drafting.typed ?? seed,
    place: placeFor(before, drafting.lineIndex, view.id),
  };
  return { draft, placement: placeDraft(draft, before, after, view.id) };
}

/**
 * Replay ONE gesture-then-projection cycle and report what converged.
 *
 * `view`: `{ id, path }`.
 * `before`: the markdown the server last sent — also the edit's base and the source the gesture is
 *   computed against.
 * `editBase`: what a write claims as ITS base, only when different from `before` — omit to test the
 *   ordinary case (the write's base IS what the server last sent).
 * `gesture`: `{ kind: "none" | "set-line" | "insert-line", lineIndex, text? }`. `text` is required
 *   unless `kind` is `"none"`.
 * `after`: the markdown that arrives next — a fixture standing in for the cycle's real output. NEVER
 *   produced by running anything; always a second string, hand-built the way §"where do the
 *   projections come from" in the step's own brief names.
 * `qualification`, `resolution`: the same declaration tables `app/index.html` reads once at load —
 *   real, taken from the shipped `presentation.json` unless a fixture overrides them.
 * `drafting`: `{ lineIndex, seed, typed? }` — a row he has OPEN and has not committed, at the index
 *   it would occupy in `before`. Omit it and the `draft` reading is `null`. See point 6.
 */
export function replay({ view, before, editBase, gesture, after, qualification, resolution, drafting }) {
  const base = editBase ?? before;
  const localAfter = localAfterFor(before, gesture);
  const lineIndex = gesture.lineIndex ?? null;

  if (lineIndex === null) {
    throw new Error("replay fixture must name gesture.lineIndex — the line the cursor is on");
  }

  const anchor = instanceAnchorFor(localAfter, lineIndex, view.id);
  if (anchor === null) {
    throw new Error(
      `replay fixture's cursor line (${lineIndex}) has no identity to anchor — check it is not blank or out of range`,
    );
  }

  const sectionOrderTable = sectionOrderFor(view, qualification.sectionOrder);
  const sectionId = sectionAt(before, gesture.kind === "set-line" ? lineIndex : lineIndex, view.id, sectionOrderTable);

  const membership = {
    predicted: predictedMembership(view.id, sectionId, before, gesture, qualification),
  };
  const ordering = {
    predicted: predictedOrdering(view.id, sectionId, before, gesture, resolution),
  };

  const cursor = resolveInstanceAnchor(anchor, after, view.id);

  // The section the anchored line sat in, read the same way `instance.ts` counts one — by ordinal,
  // never by the heading's characters. `actualMembership` compares this against where the row was
  // found; see its own JSDoc for why `via` is no longer the proxy for it.
  const sectionOrdinalBefore = instancesOf(localAfter, view.id)[lineIndex]?.section ?? null;
  membership.actual = actualMembership(cursor, view.id, after, sectionOrdinalBefore);
  membership.converged =
    membership.predicted.kind === "abstain" || membership.actual.kind === "unknown"
      ? null
      : membership.predicted.kind === membership.actual.kind;

  ordering.actual = actualOrdering(view.id, after, cursor, sectionOrderTable, resolution);
  ordering.converged =
    ordering.predicted.kind === "abstain" || ordering.actual.kind === "unknown"
      ? null
      : ordering.predicted.rank === ordering.actual.rank;

  const preserved = preservedFor(gesture, after, cursor);

  const served = new BaseSurface();
  served.take(view.path, before);
  const baseReading = served.read(view.path, base);

  const draft = draftFor(view, before, after, drafting);

  return { cursor, membership, ordering, preserved, base: baseReading, anchor, sectionId, draft };
}

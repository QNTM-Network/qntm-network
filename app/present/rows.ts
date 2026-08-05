/**
 * rows — THE ROWS OF THE VIEW ON SCREEN, HELD OUTSIDE THE DOM.
 *
 * No DOM, no fetch, no clock. It imports `instance.ts` and `relative.ts` and nothing else: it holds
 * what those two modules already know how to derive, and adds the one thing neither of them can —
 * a handle that outlives the string a row was derived from.
 *
 * ── THE DEFECT THIS EXISTS TO END, MEASURED THROUGH THE PAGE'S OWN WIRING ──
 *
 * The operator's own words: "we can't select it while it's resolving". Driven through
 * `app/index.html` (tests/app-row-store.test.mjs §1, with §6 reverting this surface's two readers
 * on a separate copy of the page so the defect can be reproduced on demand): he types a capture,
 * presses Enter, and the write leaves. The
 * painter has already repainted the view optimistically — `paint.ts`'s own `settle` calls
 * `repaint(markdown)` — so the row is on screen and the cursor is on it. He then presses `k`.
 *
 * THE ROW VANISHES. `repaintCurrentView` re-derives its source as `accepted.sourceFor(path) ??
 * v.markdown`, and until the server answers BOTH of those are the file WITHOUT his line in it. The
 * only copy of the string he can see was the argument to a `paint()` call that has already
 * returned. It lived in the DOM and nowhere else, so the next repaint of the same view painted a
 * different file and called it the same view.
 *
 * THE VIM KEY HANDLER HAD THE SHARPER HALF OF IT. It read `v.markdown` DIRECTLY — not even the
 * accepted string — so `x` and `>`/`<` computed `applyEdit` against a file that was not the one on
 * screen, and `focus.focus(effect.lineIndex, v.markdown, …)` took the cursor's identity anchor
 * against a string with no such line in it. Both now read this surface, which is by construction
 * the string the painter walked.
 *
 * ── WHAT THE UNIT IS, READ OFF THE CODE RATHER THAN CHOSEN ──
 *
 * THE UNIT IS THE ROW, HELD IN A TABLE KEYED BY ONE VIEW. Not the document: two views' rows never
 * meet, because `paintView` already drops the draft and the selection on a view change ("an index
 * that meant under the third task in one view means something else in the next") and a row table
 * that crossed a view would be the one construct in this app that did. Not the view alone: the
 * operator's requirement is that a row be addressable "from the instant it is typed", and a view
 * with a source string on it can only address a LINE INDEX, which is exactly the type
 * `design-the-edit-is-a-safe-haven.md` §5.2 already found wanting — "it is an index; the world
 * moving changes indices."
 *
 * So: one view, one source string, one row per printed line, and a handle per row.
 *
 * ── IDENTITY: TWO OF THEM, UNTIL THEY MEET, AND THE TYPE SAYS SO ──
 *
 * `RowIdentity` is a two-arm union, not a record with a nullable field, and that is the whole
 * policy expressed as a type. A row typed a moment ago has a LOCAL handle this browser minted and
 * no engine id; a row the cycle has stamped has both. A reader that wants the engine's id must
 * narrow on `kind`, so the state "this row is real and the engine has not named it yet" cannot be
 * skipped by writing `row.engine` and getting `undefined`.
 *
 *   provisional   minted the instant the row is on screen. Never leaves this browser: it is not
 *                 posted, not written into any source, and not derived from anything the engine
 *                 said. It is a handle, not a name.
 *   reconciled    the same LOCAL handle, plus the engine's `qntm:N`. Reached one of two ways: a
 *                 provisional row whose line came back stamped (THE RECONCILIATION), or a row that
 *                 was already stamped the first time this browser ever saw it.
 *
 * THE LOCAL HANDLE IS THE ONLY UNIQUE KEY, AND THE ENGINE ID IS DELIBERATELY NOT ONE. `instance.ts`
 * records that `this_week.md` prints three duplicated stamps — one node, three printings, in three
 * sections. So "no two rows share an engine id" is FALSE of the operator's own vault and enforcing
 * it would refuse a file he looks at daily. What is enforced is that no two rows share a local
 * handle, which is free: they are minted from a counter that never rewinds.
 *
 * ── HOW A ROW IS CARRIED ACROSS A NEW SOURCE ──
 *
 * By `resolveInstanceAnchor` (instance.ts), the SAME walk `focus.reanchor` and `healFromRefusal`
 * already trust, in the order `ANCHOR_TRUST` owns — instance, node, relative, text. Nothing here
 * re-expresses that order, because `levels.py` in the engine is on record as having acquired three
 * copies of one ordering and the hand-rolled copy was the wrong one.
 *
 * The relative and text rungs are not decoration here; they are the acceptance criterion. A line
 * the operator has just typed carries NO stamp, so its instance is its own characters
 * (instance.ts's honest floor) and the cycle rewrites those characters the moment it stamps them.
 * Instance misses, node has nothing to search with, and only `relative.ts`'s neighbourhood claim —
 * confirmed by `extendsLine` — can say "that is the same row". That is precisely the hop across
 * which a provisional handle becomes a reconciled one.
 *
 * ── THE RACE, BUILT RATHER THAN ASSUMED AWAY ──
 *
 * Two held rows CAN resolve onto one line of a new source: two unstamped rows whose characters are
 * an extension of one another, or a relative claim landing where an instance claim already sits.
 * `#carryInto` therefore assigns in ANCHOR_TRUST order and refuses a second claimant on a line
 * already taken — the stronger claim wins and the weaker row dies, rather than two rows both
 * claiming to be line 4. A line no surviving row claimed gets a FRESH handle, so a row can never be
 * silently re-used for content it was not about.
 *
 * AND A RECONCILED ROW MAY NOT CHANGE ITS ENGINE ID. If a row already bound to `qntm:2604` lands on
 * a line stamped `qntm:2610`, the walk found the wrong line and the binding is the evidence: the row
 * is dropped and the line gets a fresh handle. Silently re-pointing it would be the one outcome
 * worse than losing it — an addressable row that addresses something else.
 *
 * ── WHAT THIS HOLDS, AND WHAT IT EMPHATICALLY DOES NOT ──
 *
 * HOLDS: the view id, the string on screen, one row per printed line with its identity and its
 * anchor, and WHICH row is selected.
 *
 * DOES NOT HOLD, each for a stated reason:
 *
 *   THE SERVER'S PROJECTION. `graphData` is the envelope and there is exactly one place it is
 *     assigned (`installProjection`); a second copy here would be a second thing to keep in step
 *     with the wire. This surface is TOLD the server's newest string on every read (`showing`) and
 *     holds no opinion about where it came from.
 *   THE PENDING ARMINGS. `SettleSurface` and `PredictSurface` already hold those, keyed by the exact
 *     source string, and their own headers argue for that key. Moving them here would be moving
 *     them, not improving them.
 *   THE LINE BEING MADE. `draft.ts` holds an UNCOMMITTED EDIT — characters in no file — and this
 *     holds rows that are IN the file on screen. A draft has no printed line and so no instance and
 *     so nothing for `resolveInstanceAnchor` to carry; `relative.ts` exists precisely because a
 *     draft needed a different construct. Two concerns, and draft.ts already made that argument.
 *   THE COLUMN, AND THE MODE. `FocusSurface` holds where in a line the cursor is; `ModeSurface`
 *     holds whether it may type. Neither survives a resolve differently from the row it is on, so
 *     neither is a fact this surface could hold more truthfully.
 *
 * ── WHY THERE IS NO SUBSCRIPTION, WHICH IS A DECISION AND NOT AN OMISSION ──
 *
 * A subscribe-and-repaint store would be a SECOND path to the screen. There is already exactly one
 * — `repaintCurrentView` for the page's own events, and `paint.ts`'s internal `repaint` closure for
 * the ones a settlement causes — and `paint()` guards re-entrancy with `paintGeneration` because
 * control leaving a frame mid-paint has already cost this app three copies of a view on screen. A
 * listener firing a repaint from inside a write would be a fourth way into that frame.
 *
 * So this surface is PULLED, by the one function that was already going to repaint. `showing()` is
 * the read, and it is also the write: asking what to paint is what reconciles the table. That is
 * why there can be no window in which the table describes a string the painter did not walk.
 */

import { instancesOf, resolveInstanceAnchor, ANCHOR_TRUST } from "./instance.js";
import type { AnchorVia, InstanceAnchor, LineInstance } from "./instance.js";
import { relativeAnchorFor } from "./relative.js";

/**
 * A HANDLE THIS BROWSER MINTED, opaque and local. Never posted, never written into a source, never
 * compared against anything the engine said. `"row:N"` from a counter that never rewinds.
 */
export type LocalRowId = string;

/** The engine's own id for a row — `qntm:N`, brackets stripped, exactly as `instance.ts` reports it. */
export type EngineRowId = string;

/**
 * WHO THIS ROW IS. Two arms, because for a real interval there are two answers and the operator
 * decided the policy: the row is addressable from the instant it is typed, and the engine's name
 * for it arrives later or never.
 */
export type RowIdentity =
  /** Typed, on screen, addressable — and the engine has not named it. */
  | { readonly kind: "provisional"; readonly local: LocalRowId }
  /** The same handle, now also carrying the engine's own id. */
  | { readonly kind: "reconciled"; readonly local: LocalRowId; readonly engine: EngineRowId };

/** The local handle, whichever arm the identity is on — the one key that is unique across a table. */
export function localOf(identity: RowIdentity): LocalRowId {
  return identity.local;
}

/** The engine's id if this row has one yet, `null` while it is still only this browser's. */
export function engineOf(identity: RowIdentity): EngineRowId | null {
  return identity.kind === "reconciled" ? identity.engine : null;
}

/** One printed line of the view on screen, as a thing rather than as an index. */
export interface Row {
  readonly id: RowIdentity;
  /** Where it sits in the source this store is holding. Changes with every resolve; the id does not. */
  readonly lineIndex: number;
  /** The characters on that line, as the painter walked them. */
  readonly text: string;
  /** `instance.ts`'s key for this printing — the first rung a carry tries. */
  readonly instance: string;
  /** What a carry resolves against. Built from the SAME `instancesOf` pass the row came from. */
  readonly anchor: InstanceAnchor;
}

/** How far down `ANCHOR_TRUST` a carry had to go. Lower is stronger; `-1` is "not on the ladder". */
function trustOf(via: AnchorVia): number {
  return ANCHOR_TRUST.indexOf(via);
}

/** One held row's claim on a line of the arriving source. */
interface Claim {
  readonly row: Row;
  readonly at: number;
  readonly rank: number;
}

/**
 * THE ROWS OF THE VIEW ON SCREEN.
 *
 * ONE VIEW AT A TIME — `BaseSurface` and `AcceptedSource` keep the same discipline and state the
 * same reason: writes only ever come from the painted view, so one is all there is to hold, and a
 * ledger of every view the session has ever shown would be a ledger of stale rows behind views
 * nobody is looking at.
 */
export class RowStore {
  #view: string | null = null;
  /** THE STRING THE PAINTER WALKED. The only fact this class exists to make addressable. */
  #source: string | null = null;
  /**
   * THE NEWEST STRING THE SERVER HAS SAID, as last handed to `showing`. Held so that "has the world
   * moved past the browser's own edit" is a comparison rather than a guess — the identical key
   * `SettleSurface`/`PredictSurface` use, and for the identical reason: a claim about one version of
   * a file stops being a claim the moment that version is not what the server has.
   */
  #served: string | null = null;
  /**
   * THE BROWSER'S OWN EDIT, if it has one that the server has not answered yet. `null` whenever the
   * screen is showing the server's own string.
   */
  #local: string | null = null;
  #rows: readonly Row[] = [];
  #selected: LocalRowId | null = null;
  /** The source `#selected` was chosen against — see `carry` for the one thing it decides. */
  #seatedIn: string | null = null;
  /** The line index `#selected` was seated at — see `carry` for the one thing it decides. */
  #seatedAt: number | null = null;
  #minted = 0;

  /** The view these rows belong to, or `null` when nothing is held. */
  get view(): string | null {
    return this.#view;
  }

  /** THE STRING ON SCREEN, or `null` before anything has painted. */
  get source(): string | null {
    return this.#source;
  }

  /** Every printed row of that string, in line order. Blank lines get no row — they print none. */
  get rows(): readonly Row[] {
    return this.#rows;
  }

  /** The selected row, or `null` when nothing is selected or the selected row did not survive. */
  get selected(): Row | null {
    const local = this.#selected;
    if (local === null) {
      return null;
    }
    return this.#rows.find((row) => row.id.local === local) ?? null;
  }

  /** Where the selected row sits now, or `null` when there is no selection to place. */
  get selectedLineIndex(): number | null {
    return this.selected?.lineIndex ?? null;
  }

  /** The row printed at `lineIndex` of the held source, or `null` (out of range, or a blank line). */
  rowAt(lineIndex: number): Row | null {
    return this.#rows.find((row) => row.lineIndex === lineIndex) ?? null;
  }

  /** The row carrying `local`, or `null` when it did not survive the last resolve. */
  rowOf(local: LocalRowId): Row | null {
    return this.#rows.find((row) => row.id.local === local) ?? null;
  }

  /**
   * THE BROWSER EDITED THE FILE AND IS ABOUT TO PAINT THE RESULT — the optimistic half.
   *
   * Called from `paint.ts`'s own `repaint` closure, which is the one place a settlement's new
   * string reaches the screen. It is a RECORD, not a decision: the painter has already computed
   * `source` (from `applyEdit`, against the string it was handed) and this is told what it will
   * draw.
   *
   * A STRING THE SERVER HAS ALREADY SAID IS NOT A LOCAL CLAIM. Repainting the same file — a click,
   * an abandoned row, a mode change — leaves `#local` null, so nothing has to remember to clear it.
   */
  edited(view: string, source: string): void {
    if (view !== this.#view) {
      this.#reset(view);
    }
    this.#local = source === this.#served ? null : source;
    this.#install(view, source);
  }

  /**
   * WHAT TO PAINT FOR `view`, GIVEN THE NEWEST STRING THE SERVER HAS SAID — the read every repaint
   * makes, and the write that keeps the table honest.
   *
   * THE RULE, IN ONE SENTENCE: the browser's own edit survives until the server says something
   * newer, and then it does not.
   *
   *   the server's string is the one this store was already measuring against — nothing new has
   *     landed, so the browser's own edit is still on top of the world and is what to paint.
   *   the server's string has MOVED — a projection installed, an ack taken, a refusal adopted. The
   *     engine is entitled to rewrite what it ingests, so the arriving string wins unconditionally
   *     and the local claim is dropped. This is `AcceptedSource.drop`'s own posture, one layer up.
   *
   * A DIFFERENT VIEW DISCARDS EVERYTHING. `paintView` already drops the draft and forces NORMAL for
   * exactly this reason, and a row table that crossed a view change would be the one construct in
   * this app that outlived the boundary those two respect.
   */
  showing(view: string, served: string): string {
    if (view !== this.#view) {
      this.#reset(view);
    }
    if (served !== this.#served) {
      this.#served = served;
      this.#local = null;
    }
    const source = this.#local ?? served;
    this.#install(view, source);
    return source;
  }

  /**
   * THE FRAME THAT DREW `source` SHOWED THE CURSOR ON THIS LINE — the selection, recorded as the
   * ROW it landed on rather than as the number it landed at.
   *
   * ── WHY THE PAINTER RECORDS IT AND NOT THE GESTURE ──
   *
   * Six things move the cursor (a click, five vim effects, a draft returning it, a projection
   * re-anchoring it, a refusal adopting a file) and every one of them is followed immediately by a
   * paint — because moving the cursor is only visible if something redraws. Recording the seat at
   * each of the six would be six places to keep in step with one fact; recording it in the ONE
   * function they all end in is one place, and it cannot go stale, because a seat that was never
   * drawn was never the selection.
   *
   * IT IS REFUSED WHEN IT DOES NOT DESCRIBE WHAT THIS STORE IS HOLDING. A frame that drew another
   * view, or a string this store has already moved past, is describing a screen that is gone; its
   * seat would be a fact about the wrong file. Refusing is what lets the painter call this
   * unconditionally without knowing what the store is holding.
   *
   * `null` CLEARS THE SEAT. `o`/`O` blur `focus` on purpose while a draft row is open, and a seat
   * that survived that would put the selection back on a real line the instant the row settled —
   * the "two editable rows at once" defect `repaintCurrentView`'s own header records measuring.
   */
  seat(view: string, source: string, lineIndex: number | null): void {
    if (view !== this.#view || source !== this.#source) {
      return;
    }
    this.#selected = lineIndex === null ? null : (this.rowAt(lineIndex)?.id.local ?? null);
    this.#seatedIn = source;
    this.#seatedAt = lineIndex;
  }

  /**
   * WHERE THE SELECTED ROW IS NOW — `null` when this store has nothing better to say than the
   * caller already knows.
   *
   * ── THE DISCRIMINATOR IS "DID THE SOURCE MOVE SINCE THE SEAT WAS TAKEN" ──
   *
   * There are two reasons a repaint asks where the cursor goes, and they want opposite answers:
   *
   *   A MOTION MOVED IT. `j`, `k`, `gg`, a click. The string is the one the seat was taken against,
   *     so the caller's own index is the newer fact and this store must not overrule it. `null`.
   *   THE WORLD MOVED THE ROW. A projection, an ack, an optimistic edit, an adopted refusal. The
   *     string is a DIFFERENT one, so the caller's index describes a file that is not on screen any
   *     more, and the seated ROW is the newer fact — this answers where it went.
   *
   * A motion cannot change the source and a resolve always does, so the test is not a proxy for the
   * distinction: it is the distinction.
   *
   * ── IT ANSWERS ONLY WHERE THE CALLER HAS NOT, AND THAT IS WHY THERE ARE NOT TWO ANSWERS ──
   *
   * `lineIndex` is where the caller's cursor is NOW. If it has moved off the seat since the seat was
   * taken, something has ALREADY re-anchored it — `paintView` calls `focus.reanchor` before it
   * repaints, and so does `healFromRefusal` — and that answer is the newer one. This declines.
   *
   * So the two surfaces compose rather than compete: on a projection arrival `focus` answers and
   * this is silent; on the paths where nothing re-anchors at all — an ack repainting from the string
   * the browser posted, a settlement repainting into its own optimistic edit — `focus` had only a
   * NUMERIC clamp, and this answers by identity instead. That clamp is not a hypothetical hazard:
   * `healFromRefusal`'s own header records it overwriting one of the operator's tasks in place on
   * 2026-08-03, because "a raw clamp reinterprets that index against whatever real content now sits
   * at the same position."
   *
   * WHEN IT DOES ANSWER, IT CANNOT CONTRADICT `resolveInstanceAnchor`. The anchor this store holds
   * for the seated row is built exactly as `instanceAnchorFor` builds `focus`'s — same instance,
   * same node, same relative bracket — so the two walks agree by construction. Where this one is
   * `null` because a STRONGER claim took the line (see `#carryInto`), the caller falls back to its
   * own clamp. This can move the cursor by identity; it can never move it somewhere no surface named.
   */
  carry(lineIndex: number | null): number | null {
    if (this.#selected === null || this.#seatedIn === this.#source || lineIndex !== this.#seatedAt) {
      return null;
    }
    return this.selected?.lineIndex ?? null;
  }

  /**
   * THE BROWSER'S OWN EDIT IS SUPERSEDED — drop the claim, keep the table.
   *
   * Called from `paintView`, one statement after `accepted.drop`, and for the identical reason that
   * one gives: a view is being chosen or re-read from the server, and what the server sends is the
   * newer truth than anything this browser computed. A local claim is strictly WEAKER than an
   * accepted source — the server has said nothing about it at all — so it cannot be the one thing
   * that outlives a re-read that discards even the accepted one.
   *
   * IT IS NOT REACHED BY THE ONE PATH THAT MUST KEEP THE CLAIM. A 409 leaves the operator's
   * characters on screen deliberately ("your characters are still on this line") and `commitLine`
   * returns WITHOUT repainting, so `paintView` never runs and this is never called. The claim
   * survives exactly as long as the screen showing it does.
   *
   * THE TABLE IS KEPT because the rows are still the rows: `showing` is about to reconcile them
   * against whatever arrived, and throwing the handles away first would mint a fresh set for
   * content that has not changed identity at all.
   */
  forget(): void {
    this.#local = null;
  }

  /** Everything dropped — the graph was dropped, or the session ended. */
  clear(): void {
    this.#reset(null);
    this.#served = null;
  }

  #reset(view: string | null): void {
    this.#view = view;
    this.#source = null;
    this.#served = null;
    this.#local = null;
    this.#rows = [];
    this.#selected = null;
    this.#seatedIn = null;
    this.#seatedAt = null;
  }

  /** A handle no row in this store has ever had. The counter never rewinds. */
  #mint(): LocalRowId {
    this.#minted += 1;
    return `row:${String(this.#minted)}`;
  }

  /**
   * Reconcile the table against `source` and hold it. Idempotent by construction: an unchanged
   * string is the fast path, and re-running it on a changed one carries the same rows to the same
   * places because `resolveInstanceAnchor` is pure.
   */
  #install(view: string, source: string): void {
    if (this.#view === view && this.#source === source) {
      return;
    }
    const instances = instancesOf(source, view);
    const lines = source.split("\n");
    const held = this.#source === null ? [] : this.#rows;
    const carried = this.#carryInto(held, source, view);
    const rows: Row[] = [];
    instances.forEach((info, at) => {
      if (info === null) {
        return;
      }
      const previous = carried.get(at) ?? null;
      rows.push({
        id: this.#identityFor(previous, info),
        lineIndex: at,
        text: lines[at] ?? "",
        instance: info.instance,
        anchor: {
          instance: info.instance,
          node: info.node,
          takenAt: at,
          relative: relativeAnchorFor(instances, lines, at),
        },
      });
    });
    this.#view = view;
    this.#source = source;
    this.#rows = rows;
  }

  /**
   * WHICH HELD ROW, IF ANY, CONTINUES AT EACH LINE OF `source`.
   *
   * ── ASSIGNED IN TRUST ORDER, AND A LINE IS CLAIMED ONCE ──
   *
   * Every held row is resolved independently — `resolveInstanceAnchor` is pure and cannot see the
   * others — so two rows may name one line. The stronger claim wins, by `ANCHOR_TRUST` and nothing
   * else, and the loser dies rather than being moved somewhere plausible. That is the same refusal
   * `resolveInstanceAnchor` itself makes on `ambiguous`: a rung that finds too many stops rather
   * than picking.
   *
   * TIES ARE BROKEN BY THE ORDER THE ROWS ARE HELD IN, which is line order in the previous source.
   * `Array.prototype.sort` is stable in every engine this ships to (ES2019 requires it), so this is
   * a stated property rather than a hope.
   */
  #carryInto(held: readonly Row[], source: string, view: string): Map<number, Row> {
    const claims: Claim[] = [];
    for (const row of held) {
      const reading = resolveInstanceAnchor(row.anchor, source, view);
      if (reading.outcome === "found") {
        claims.push({ row, at: reading.lineIndex, rank: trustOf(reading.via) });
      }
    }
    claims.sort((a, b) => a.rank - b.rank);
    const taken = new Map<number, Row>();
    const spent = new Set<LocalRowId>();
    for (const claim of claims) {
      if (taken.has(claim.at) || spent.has(claim.row.id.local)) {
        continue;
      }
      taken.set(claim.at, claim.row);
      spent.add(claim.row.id.local);
    }
    return taken;
  }

  /**
   * THE IDENTITY THE ROW AT THIS LINE GETS — and this is the one function where a provisional
   * handle becomes a reconciled one.
   *
   * NO PREVIOUS ROW: a fresh handle. Already stamped when this browser first saw it, so it is
   * `reconciled` from birth — it was never provisional to anybody, and saying otherwise would make
   * the two arms mean "when did we notice" rather than "does the engine know about it".
   *
   * A PREVIOUS ROW, AND THE LINE IS NOW STAMPED: the SAME local handle, plus the engine's id. The
   * hop the acceptance test is about.
   *
   * A PREVIOUS ROW ALREADY BOUND TO A DIFFERENT ENGINE ID: refused. The carry landed on a line this
   * row is provably not, so the row is dropped and the line gets a fresh handle. A handle that
   * quietly starts addressing different content is worse than a handle that dies.
   *
   * A PREVIOUS ROW AND NO STAMP: the identity stands. A reconciled row keeps its engine id — the
   * engine named it once and this browser has no evidence it un-named it, only that this printing
   * carries no stamp.
   */
  #identityFor(previous: Row | null, info: LineInstance): RowIdentity {
    const node = info.node;
    if (previous === null) {
      const local = this.#mint();
      return node === null ? { kind: "provisional", local } : { kind: "reconciled", local, engine: node };
    }
    const bound = engineOf(previous.id);
    if (bound !== null && node !== null && bound !== node) {
      const local = this.#mint();
      return { kind: "reconciled", local, engine: node };
    }
    if (node === null) {
      return previous.id;
    }
    return { kind: "reconciled", local: previous.id.local, engine: node };
  }
}

/**
 * THE HALF OF `RowStore` THE PAINTER IS GIVEN — narrowed so `paint.ts` cannot read the table it
 * writes into.
 *
 * The painter's whole job here is to say what it drew. Handing it the reader as well would let a
 * later change resolve a row's identity inside the paint that produces it, which is the same
 * inversion `aLineIsOpen`'s own comment refuses for the DOM: the painter's output must not re-enter
 * the reasoning that produced it.
 */
export interface RowSink {
  edited(view: string, source: string): void;
  seat(view: string, source: string, lineIndex: number | null): void;
}

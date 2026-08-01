/**
 * HeldSurface — characters the source string does not own, kept where a person can see them.
 * PURE: no DOM, no fetch, no clock, and it imports nothing.
 *
 * ── THE ONE DECISION THIS MODULE IS ──
 *
 * A line the operator was typing into can stop existing under him in three ways, and this module
 * treats them as ONE event because they are one event to him:
 *
 *   VANISHED   a projection arrives and the line he was on is not in it. `focus.reanchor` reports
 *              `absent` (app/present/focus.ts), the reading column repaints without his row, and
 *              until this module existed his characters went with it.
 *   REFUSED    the server declines the write (a 409). His characters stay on screen only because
 *              `commitLine` does not repaint — and the very next projection to arrive replaces
 *              both the screen and the painter's source.
 *   UNPLACED   a projection arrives while he is MAKING a line, and the row's place cannot be
 *              re-found in it (`placeDraft`, app/present/draft.ts). The row is not in either file
 *              by construction, so there is nowhere to put it back and nothing to re-anchor to.
 *
 * A THIRD CAUSE AND NOT A THIRD MECHANISM, and the distinction is the one that decided it. The
 * three differ only in what the operator is told; the surface, the release rule, the strip and the
 * refusal to carry a line index are one apiece and unchanged. The alternative — a second holding
 * place for the row being made — would be two stores of the operator's writing competing with each
 * other, which is the thing this module's own header already refuses for the vault.
 *
 * ALL THREE ARE "CHARACTERS THE SOURCE STRING DOES NOT OWN". That is the whole of the shape, and it is
 * a shape this bundle has already shipped once: `DraftSurface` (draft.ts) holds a line that is not
 * in the file YET; this holds one that is not in the file ANY MORE. Same lifecycle, same argument
 * for it, opposite end of the same gesture.
 *
 * ── NOTHING HELD IS EVER WRITTEN, AND THE MODULE IS BUILT SO IT CANNOT BE ──
 *
 * This is not a promise made in prose. `SourceEdit` (source.ts) is a closed union of three and
 * this module adds no fourth; it imports `applyEdit` from nowhere and cannot construct an edit. A
 * held row carries no line index — deliberately, and it is the single most important field this
 * type does NOT have. An index is what `applyEdit` takes, so a record with one is a record that
 * could be posted by a later change that meant well. A record with only an INSTANCE (an identity,
 * `instance.ts`) can be recognised and reported and nothing else.
 *
 * The refusal that follows from that is stated once, here, so no caller has to re-derive it: a
 * vanished line is NOT re-inserted into the view the cycle removed it from. Doing so fights the
 * engine (the next cycle removes it again) or, if the NODE is gone, mints a fresh one — the exact
 * failure `source.ts:84-100` already measured for an empty insert. `design-the-edit-is-a-safe-haven.md`
 * §6.4 refuses behaviour (c) for this reason and names the question an ENGINE question (its open
 * decision 1). Holding needs no answer to it. Re-placing does.
 *
 * ── WHY IT IS NOT A SECOND FIELD ON `FocusSurface`, AND NOT A FIELD ON `DraftSurface` EITHER ──
 *
 * `focus.ts`'s own header draws this line and it is applied unchanged: that surface holds WHICH
 * LINE the cursor is on and neither more nor less. A held row outlives the cursor by construction
 * — it exists precisely because the line the cursor was on stopped existing — so folding it in
 * would give one surface a fact with a longer life than every other fact in it.
 *
 * `DraftSurface` is closer and still wrong. A draft has a LINE INDEX, because a draft is going to
 * be written and `insert-line` needs one. A held row has none, because it is not. Two types that
 * differ by the one field that decides whether something can reach a write should not be one type.
 *
 * ── HELD IS NOT DECLARED, AND MUST NEVER BECOME SO ──
 *
 * The same rule `focus.ts` and `draft.ts` both state: a fact about the moment written into a file
 * is a fact that outlives the moment. A held row is computed at the instant a projection or a
 * refusal lands, kept across the repaints that follow, and thrown away when the file takes the
 * characters back or the operator says he is done with them. Nothing serves it and no file
 * records it. It does not survive a reload, and that is a property rather than a gap: a row that
 * survived a reload would be a second store of the operator's writing, competing with the vault.
 */

/** WHY a row is held. Three causes, one mechanism — see the module header. */
export type HeldReason = "vanished" | "refused" | "unplaced";

/**
 * The characters, and enough about where they came from to say it plainly.
 *
 * THERE IS NO `lineIndex` AND THAT IS THE POINT — see the module header. `instance` is an identity
 * (`instance.ts`), not a position, and nothing in this bundle can turn one back into an index in a
 * source string that no longer contains it.
 */
export interface HeldEdit {
  /** What he typed, or — when he typed nothing — the line he was parked on when it went. */
  readonly text: string;
  /** The view the characters were typed in. Held so a row can name where it came from. */
  readonly view: string;
  /** The FILE they belonged to. What the row shows him, because a path is what he recognises. */
  readonly path: string;
  /** The instance the line had (`instance.ts`), or `null` when it never had an identity. */
  readonly instance: string | null;
  /** The node the line named, or `null`. The two `absent` causes differ by exactly this field. */
  readonly node: string | null;
  /** For a REFUSED row: the base the declined write was computed against. `null` otherwise. */
  readonly base: string | null;
  /**
   * THE WRITE THAT CARRIED THESE CHARACTERS, when one did — `correlation.ts`'s opaque per-write
   * token, or `null` when no write of this app's ever put them on the wire.
   *
   * IT IS THE ONLY FIELD ON THIS RECORD THAT CAN RELEASE IT ON EVIDENCE RATHER THAN ON RESEMBLANCE,
   * and it is `null` for two of the three causes on purpose:
   *
   *   VANISHED  carries the token when the row's characters are the ones a commit just posted. That
   *             is the case the strip was measured getting wrong — three of five rows in a real
   *             browser run were lines that saved perfectly, and the reason `settle` could not see
   *             it is that the cycle REWROTE the line, so the text no longer matched.
   *   REFUSED   `null`. A 409 means NOTHING WAS WRITTEN, so no echo can ever arrive for it, and a
   *             token here would be a handle for evidence that cannot exist.
   *   UNPLACED  `null`. The row was being MADE — it was in no file and no write ever carried it.
   *
   * IT IS NOT AN IDENTITY AND CANNOT BECOME ONE. `instance` says which LINE; this says which WRITE.
   * Nothing in this bundle can turn a write token into a position in a file, which is the same
   * property that keeps `instance` safe here.
   */
  readonly token: string | null;
  readonly reason: HeldReason;
}

/** A held edit once the surface has taken it, with the handle a caller discards it by. */
export interface HeldRow extends HeldEdit {
  /** Monotonic within one surface. A HANDLE, never an index into anything. */
  readonly id: number;
}

/**
 * The record to hold for one event, or `null` when there is nothing worth holding.
 *
 * A PURE FUNCTION, SEPARATE FROM THE SURFACE, FOR ONE REASON: the decision "should this be held,
 * and with which characters" is the thing worth checking against a replayed projection, and
 * `tests/fixtures/replay-harness.mjs` can only check what it can call without a page. The surface
 * below is storage; this is the judgement.
 *
 * `null` FOR EMPTY CHARACTERS, AND ONLY FOR THAT. A blank line has nothing in it to lose, so
 * holding one would put an empty row on screen for an event that cost him nothing. Every other
 * case holds — including the case where the app cannot tell whether the characters were his or the
 * engine's, because a spurious held row is an annoyance and a dropped one is lost work.
 */
export function heldFrom(reason: HeldReason, edit: Omit<HeldEdit, "reason">): HeldEdit | null {
  if (edit.text.trim() === "") {
    return null;
  }
  return { ...edit, reason };
}

/**
 * Does `source` now own `text` — i.e. is there a line in it that this held row is a copy of?
 *
 * TWO SHAPES, AND THE SECOND ONE IS MEASURED RATHER THAN GUESSED. An exact line match is the case
 * where he retyped it. A PREFIX match is the case where the projection brought it back with the
 * cycle's own tokens appended — the one real shape every stamped line in the operator's own vault
 * shows (`tests/present-replay.test.mjs` checks `arrived.startsWith(gesture.text)` for exactly
 * this reason: the title first, cycle-appended tokens after, never a rewritten prefix).
 *
 * THE PREFIX BRANCH IS NARROWED SO IT CANNOT RELEASE A ROW BY ACCIDENT, and the narrowing has no
 * magic number in it. It requires the held text to end in a non-space and the arrived line to
 * continue with a space — which is what "a token was appended after it" looks like and is not what
 * `- ` matching `- [ ] Ring the dentist` looks like. Releasing wrongly LOSES his characters, so
 * this comparison fails toward keeping them: a row that should have been released and was not is
 * one he dismisses; a row released early is gone.
 */
function sourceOwns(text: string, lines: readonly string[]): boolean {
  const appended = text.trimEnd() === text && text !== "" ? text + " " : null;
  return lines.some((line) => line === text || (appended !== null && line.startsWith(appended)));
}

export class HeldSurface {
  #rows: HeldRow[] = [];
  #next = 1;

  /**
   * Every held row, NEWEST FIRST — the order the operator's attention is in. He has one cursor, so
   * rows can only ever be produced one at a time, and the most recent one is the one he was
   * looking at when it went.
   */
  get rows(): readonly HeldRow[] {
    return this.#rows;
  }

  get count(): number {
    return this.#rows.length;
  }

  /**
   * Hold an edit. `null` in — as `heldFrom` returns for empty characters — is a no-op returning
   * `null`, so a caller never has to guard twice.
   *
   * ── ONE HELD ROW OR MANY, ANSWERED RATHER THAN LEFT UNDEFINED ──
   *
   * MANY. He has one cursor, so a second held row can only exist because a FIRST one is still
   * unresolved — and the rule this whole module serves is "fail toward keeping his characters", so
   * a second event must not evict the first. A bounded list would have the same defect at its
   * bound.
   *
   * WITH ONE SUPERSESSION RULE, AND IT IS LOSSLESS BY CONSTRUCTION. The obvious way to accumulate
   * junk is the same line refused twice — he retries a declined save and gets a second row for the
   * same characters. So a new row REPLACES an existing one for the same key when the new text
   * CONTAINS the old text: everything the earlier row was holding is still held afterwards, so the
   * replacement cannot lose a character. Anything else stacks, because two texts where neither
   * contains the other are two different pieces of writing.
   *
   * The key is the view plus the identity the line had, falling back to the characters themselves
   * for a line that never had one — the same fallback `instance.ts` makes for an unstamped line,
   * and for the same reason: its text IS its identity.
   */
  hold(edit: HeldEdit | null): HeldRow | null {
    if (edit === null) {
      return null;
    }
    const row: HeldRow = { ...edit, id: this.#next };
    this.#next += 1;
    const key = keyOf(edit);
    const supersedes = this.#rows.findIndex((held) => keyOf(held) === key && edit.text.includes(held.text));
    if (supersedes !== -1) {
      this.#rows.splice(supersedes, 1);
    }
    this.#rows.unshift(row);
    return row;
  }

  /** He is done with one row. The only release he asks for by hand. Returns whether it was held. */
  discard(id: number): boolean {
    const at = this.#rows.findIndex((row) => row.id === id);
    if (at === -1) {
      return false;
    }
    this.#rows.splice(at, 1);
    return true;
  }

  /**
   * THE FILE TOOK THE CHARACTERS BACK — release every row for `path` that `source` now owns.
   *
   * This is the RESEMBLANCE release, and it was the only one until `landed` below joined it. A held
   * row that the file now contains is a second copy of something the source owns, which is the one
   * thing a held row must never be. Everything else — a repaint, a view change, time passing,
   * another hold — releases nothing: a row is held until its characters are demonstrably safe
   * somewhere else or he says he is done with them.
   *
   * TWO RELEASES AND NOT TWO MECHANISMS. Both answer one question — "are these characters somewhere
   * other than this strip" — from the two kinds of evidence a browser can have. This one reads the
   * file it was handed and asks whether the characters are in it. `landed` reads the SERVER'S
   * acknowledgement of the write that carried them. This one is available always and is wrong
   * whenever the cycle rewrites a line; that one is available only once the server echoes and is
   * exact when it does. Neither subsumes the other, and removing this one would lose the case where
   * the operator retypes a line by hand and no write of his is outstanding at all.
   *
   * IT IS ALSO THE RECOVERY PATH, WHICH IS WHY THERE IS NO "PUT IT BACK" BUTTON. He retypes the
   * line himself, the write lands, the next projection carries the characters, and the row that
   * was holding them clears itself. Nothing this module holds ever re-enters the write path; the
   * write is the gesture he makes, exactly as it always was.
   *
   * Returns the rows released, so a caller can say what happened rather than guessing.
   */
  settle(path: string, source: string): readonly HeldRow[] {
    const lines = source.split("\n");
    const released = this.#rows.filter((row) => row.path === path && sourceOwns(row.text, lines));
    if (released.length === 0) {
      return released;
    }
    this.#rows = this.#rows.filter((row) => !released.includes(row));
    return released;
  }

  /**
   * THE WRITE DEMONSTRABLY LANDED — release every row the acknowledged writes carried.
   *
   * THE SECOND AUTOMATIC RELEASE, AND IT IS A DIFFERENT KIND OF FACT FROM THE FIRST. `settle` above
   * asks "does the file now PRINT these characters", which is resemblance, and resemblance is
   * exactly what the cycle destroys: it appends a stamp, applies the defaults, re-sorts the line, or
   * moves it into another view, and the row goes on claiming characters the vault took. A real
   * browser run on 2026-08-01 measured three of five held rows in that state — every one of them a
   * line that saved perfectly, every one of them unreleasable by text.
   *
   * `tokens` ARE THE SERVER'S OWN ACKNOWLEDGEMENT (`correlation.ts`), matched against the write each
   * row carries. That is POSITIVE EVIDENCE — the one thing this module is allowed to release on —
   * and it says something no comparison of strings can: the file the operator's characters were in
   * reached the server and the projection in hand is derived from it.
   *
   * IT CANNOT RELEASE A ROW THAT CARRIES NO TOKEN, which is every REFUSED row and every UNPLACED
   * one, and that is the fail-safe direction stated as code rather than as a promise: no token, no
   * evidence, no release. An empty `tokens` releases nothing, so a server that echoes nothing
   * leaves this method a no-op and the strip behaving exactly as it did before it existed.
   *
   * Returns the rows released, so a caller can say what happened rather than guessing.
   */
  landed(tokens: readonly string[]): readonly HeldRow[] {
    if (tokens.length === 0) {
      return [];
    }
    const released = this.#rows.filter((row) => row.token !== null && tokens.includes(row.token));
    if (released.length === 0) {
      return released;
    }
    this.#rows = this.#rows.filter((row) => !released.includes(row));
    return released;
  }

  /** Let everything go. Sign-out only — see `app/index.html`. Not a lifecycle event on a view. */
  clear(): void {
    this.#rows = [];
  }
}

/** The supersession key — see `hold`. Exported so a test can assert the rule rather than infer it. */
export function keyOf(edit: HeldEdit): string {
  return `${edit.view} ${edit.instance ?? edit.text}`;
}

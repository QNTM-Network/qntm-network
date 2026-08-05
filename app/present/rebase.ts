/**
 * rebase — IS THE OPERATOR'S ONE EDITED LINE STILL APPLICABLE TO THE FILE THE SERVER JUST REFUSED
 * HIM WITH, AND WHERE. PURE: no DOM, no fetch, no clock. Imports only `instance.ts` and `source.ts`
 * — it composes the two facts they already hold rather than re-deriving either.
 *
 * ── THE GAP THIS CLOSES, AND THE PRIOR DECISION IT ENGAGES WITH ──
 *
 * `commitLine`'s 409 branch (`app/index.html`) has always had two acts: `healFromRefusal` adopts
 * the server's file when the commit carries no real typed text, and `"return-to-row"` — ZERO
 * automatic retries — when it does. `correlation.ts`'s own header names why: blindly reposting
 * `commit.markdown`, computed against the OLD base, over `e.current` (the server's NEW file) would
 * silently discard whatever changed server-side, which is the exact clobber the base/token
 * mechanism exists to refuse. A safe retry needs a REBASE, and `design-the-two-rules.md`'s own
 * backlog named that as follow-up rather than building it.
 *
 * A rebase was considered once already, for a different question, and rejected —
 * `backlog.yaml`'s `the-cursor-anchors-to-a-node-not-a-line-number` row: *"a rebase needs the OLD
 * source string still in hand when the new one arrives, and `paintView` reads its markdown out of
 * `graphData`, which a fresh snapshot replaces wholesale before anything repaints."* That row was
 * choosing how to keep a CURSOR seated across an arriving projection it never held onto. This
 * module answers a narrower, different question — is one COMMIT's own edit still applicable — and
 * the string that decision was missing is not missing here: `commit.source` (the base the edit was
 * computed against, `paint.ts`'s `LineCommit.source`) and `commit.text` (the edited line) are both
 * already local variables in `commitLine`'s own 409 branch, still in scope, never replaced by
 * anything — they are never written to `graphData` and nothing repaints between the POST and this
 * catch running. The blocking fact the earlier row measured does not hold here.
 *
 * ── THE UNIT IS ONE LINE, AND THE WALK IS THE ONE THIS APP ALREADY TRUSTS ──
 *
 * `resolveInstanceAnchor` (`instance.ts`) is the SAME walk `RowStore`, `focus.reanchor` and
 * `healFromRefusal` already trust to carry a row across a new source — instance, node, relative,
 * text, in `ANCHOR_TRUST` order, refusing on ambiguity rather than guessing. This module does not
 * re-express that order; re-expressing an ordering already owned elsewhere is exactly the mistake
 * the engine's own `levels.py` is on record for making three times.
 *
 * ── THE RULE, AND WHY IT IS A REFUSAL AND NOT A MERGE ──
 *
 * A rebase is safe only when the base's own line — the one the operator started editing, BEFORE
 * he touched it — reads IDENTICALLY at the anchor's resolved position in the server's new file.
 * That is a one-line diff3: base === theirs means only the operator's side changed, so his edit
 * applies cleanly; base !== theirs means the SAME line changed on both sides, and reconciling that
 * would be a text merge this module does not attempt and `research-the-store.md` §6 already
 * disqualified the machinery for (CRDT/OT solve a problem — many writers on one document — this
 * app does not have). Ambiguity, absence, and a changed line are three different refusals and none
 * of them is guessed past.
 */

import { instanceAnchorFor, resolveInstanceAnchor } from "./instance.js";
import { applyEdit } from "./source.js";

/**
 * What a rebase attempt found — one success shape, and every refusal named rather than merged into
 * one boolean. `commitLine` reads only `.outcome`; the refusal `.reason` exists for a test to
 * assert WHICH rung declined, not for anything to show on screen — THE PERCEPTION RULE governs, and
 * nothing here is a sentence.
 */
export type RebaseOutcome =
  | { readonly outcome: "rebased"; readonly markdown: string }
  | {
      readonly outcome: "refused";
      readonly reason: "no-anchor" | "not-found" | "ambiguous" | "line-changed" | "no-edit";
    };

/**
 * Reconcile ONE line's edit against a base that moved.
 *
 * `view` — the view id, the same namespace `instance.ts`'s identity strings are already scoped by.
 * `base` — the string the edit was computed against (`commit.source`).
 * `lineIndex` — where the edited line sat in `base` (`commit.lineIndex`).
 * `edited` — the operator's own characters for that line (`commit.text`).
 * `current` — the server's file, as the 409 answered it (`e.current`).
 *
 * `"no-anchor"` — `lineIndex` names a blank line or is out of range in `base`. Unreachable from a
 *   real `set-line` commit (the edit that produced `commit.markdown` already proved the line is
 *   real), kept as a named refusal rather than a thrown error because `instance.ts` itself refuses
 *   rather than throws for the identical case.
 * `"not-found"` / `"ambiguous"` — the anchor walk's own outcomes, carried rather than collapsed.
 * `"line-changed"` — the anchor was found, but the line AT that position in `current` is not
 *   byte-identical to what it was in `base` before the operator touched it. Something server-side
 *   rewrote the very line he was editing, and reapplying his edit on top would silently discard
 *   that — the clobber this whole module exists to refuse.
 * `"no-edit"` — defensive only: `applyEdit` refuses when the text supplied is not one line, or is
 *   already what the target line says. `commit.text` was already proven to be a real, single-line
 *   change against `base`'s reading of this line (that is what made `commit.markdown` non-null in
 *   the first place), and `"line-changed"` above is checked first — so this rung is unreachable
 *   from `commitLine`, and is named rather than assumed for the same reason `"no-anchor"` is.
 */
export function rebaseLineEdit(
  view: string,
  base: string,
  lineIndex: number,
  edited: string,
  current: string,
): RebaseOutcome {
  const anchor = instanceAnchorFor(base, lineIndex, view);
  if (anchor === null) {
    return { outcome: "refused", reason: "no-anchor" };
  }
  const reading = resolveInstanceAnchor(anchor, current, view);
  if (reading.outcome === "ambiguous") {
    return { outcome: "refused", reason: "ambiguous" };
  }
  if (reading.outcome !== "found") {
    return { outcome: "refused", reason: "not-found" };
  }

  const original = base.split("\n")[lineIndex] ?? "";
  const serverLine = current.split("\n")[reading.lineIndex] ?? "";
  if (serverLine !== original) {
    return { outcome: "refused", reason: "line-changed" };
  }

  const markdown = applyEdit(current, { kind: "set-line", lineIndex: reading.lineIndex, text: edited });
  if (markdown === null) {
    return { outcome: "refused", reason: "no-edit" };
  }
  return { outcome: "rebased", markdown };
}

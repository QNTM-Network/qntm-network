/**
 * THE MEMBERSHIP RESOLVER — after this commit, does the line still belong in the section it is in?
 *
 * Design-the-resolution-architecture.md step 4, L6 PROJECTION. Ported here from `app/index.html`'s
 * `membershipReadingFor`/`membershipNoteFor`/`membershipDiagnosticFor`/`updateMembershipBadge` with
 * NO behaviour change; the four functions are `read`/`say`/`show` and one entry in `Diagnostic`.
 *
 * ── ONLY THE LEAVING TRANSITION IS SAID, AND THAT IS THE WHOLE OF RULE 4 ──
 *
 * The operator's own two cases: a bare line under "Domain Empty" belongs and stays — say nothing,
 * because a message on every keystroke is noise. The same line with `#work` acquires a domain and
 * leaves — say that. So `read` compares the line's membership answer BEFORE the commit (its own
 * text a moment ago, at this same index) against AFTER (`commit.text`), and `say` speaks only when
 * it went from belonging to not. Belonging -> belonging, absent -> belonging and not-belonging ->
 * belonging are all silence: only ONE of the two directions costs him something if he does not see
 * it, and confirming the safe direction on every keystroke would be exactly the noise refused.
 *
 * ── REFUSE RATHER THAN GUESS, APPLIED TWICE ──
 *
 * EITHER SIDE ABSTAINING IS SILENCE IN THE NARRATION. `membershipFor`'s `Abstention` values already
 * refuse an unpublished qualification, a stamped line, a non-checkbox line, an empty line and an
 * ambiguous token; this adds no judgement on top. THE SAME ABSTENTION IS NOT INVISIBLE — `show`
 * reads the identical reading and says so, in the abstention register rather than in the sentence.
 *
 * AN INSERTED LINE HAS NO "BEFORE", AND GUESSING ONE WOULD MISATTRIBUTE A DIFFERENT LINE'S ANSWER.
 * `commit.kind !== "set-line"` is refused outright, never by reading `commit.source` at
 * `commit.lineIndex` — that index, for an insertion, is the row about to be pushed down, a
 * different line entirely (see `LineCommit.kind`'s own header in paint.ts).
 *
 * ── WHY THE ABSTENTION REGISTER IS A SECOND SINK AND NOT A FIFTH FRESHNESS CLAUSE ──
 *
 * Before it existed, an abstention and a confident "nothing changed" both produced `""` and were
 * BYTE-IDENTICAL on screen — "I do not know" and "yes, nothing needed saying" looked the same.
 * Routing the abstention into the same sentence on the same cadence would reintroduce the noise
 * `say`'s own refusal exists to prevent. `#membershipBadge` is a LEVEL indicator instead: it reports
 * the LAST commit's answer and is overwritten by the next, never appended to.
 *
 * COVERAGE IS ALWAYS `complete` HERE, AND THAT IS A MEASURED CLAIM RATHER THAN A DEFAULT.
 * `membershipFor` evaluates ONE section's ONE qualifier: a qualifier it cannot evaluate (a one-hop
 * edge step) is the whole-reading abstention `needs-graph-traversal`, not a part of the work quietly
 * skipped. There is nothing this resolver was asked to consult and did not.
 */

import { sectionAt, sectionOrderFor } from "../address.js";
import { membershipFor } from "../membership.js";
import type { Abstention, MembershipAnswer } from "../membership.js";
import type { CommitContext, Reading, ResolverSpec } from "../resolve.js";
import { COMPLETE, NOT_EVALUATED } from "../resolve.js";

/** Both sides of the comparison, when both resolved. */
export interface MembershipTransition {
  readonly before: MembershipAnswer;
  readonly after: MembershipAnswer;
}

export type MembershipCommitReading = Reading<MembershipTransition, Abstention>;

export const membershipSpec: ResolverSpec<MembershipCommitReading> = {
  id: "membership",
  badge: "membershipBadge",

  read(ctx: CommitContext): MembershipCommitReading {
    const { view, commit } = ctx;
    const qualification = ctx.declared.qualification;
    if (qualification === undefined || commit.kind !== "set-line") {
      return NOT_EVALUATED;
    }
    // STEP 11 (design-the-resolution-architecture.md, narrowed — see address.ts's own header for
    // why): prefer a served `view.sections` order over the static declaration when the server ever
    // carries one. `server/app.py` carries none today, so `sectionOrderFor` returns
    // `qualification.sectionOrder` UNCHANGED.
    const sectionOrder = sectionOrderFor(view, qualification.sectionOrder);
    const sectionId = sectionAt(commit.source, commit.lineIndex, view.id, sectionOrder);
    if (sectionId === null) {
      return NOT_EVALUATED;
    }
    const beforeLine = commit.source.split("\n")[commit.lineIndex] ?? "";
    const before = membershipFor(view.id, sectionId, beforeLine, qualification);
    if (before.kind !== "answer") {
      return { kind: "abstains", because: before.because };
    }
    const after = membershipFor(view.id, sectionId, commit.text, qualification);
    if (after.kind !== "answer") {
      return { kind: "abstains", because: after.because };
    }
    return { kind: "answer", coverage: COMPLETE, before: before.answer, after: after.answer };
  },

  say(reading: MembershipCommitReading): string {
    if (reading.kind !== "answer") {
      return "";
    }
    if (reading.before.belongs && !reading.after.belongs) {
      return `this line will leave ${reading.after.sectionName}`;
    }
    return "";
  },

  show(reading: MembershipCommitReading): string {
    // "not-evaluated" IS DELIBERATELY LEFT OUT OF THIS REGISTER. It is a real third state — the
    // declaration has not loaded, the commit is not a text edit, or the cursor is outside any
    // published section — but it is a precondition this resolver never got to judge, not a refusal
    // it made. Returning "" leaves the badge showing the last REAL evaluation, which is honest.
    if (reading.kind === "not-evaluated") {
      return "";
    }
    // THE PUBLISHED REASON, VERBATIM, NOT A PARAPHRASE. The operator at the keyboard and an agent
    // driving this page both read this line and both want the same thing from it: which of the
    // named `Abstention` reasons fired, not a friendlier wording an agent then has to match around.
    if (reading.kind === "abstains") {
      return `membership: abstained — ${reading.because}`;
    }
    return "membership: decided";
  },
};

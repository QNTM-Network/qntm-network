/**
 * THE RULES RESOLVER — what the operator's own published rules decide about the line he just typed.
 *
 * Ported from `app/index.html`'s `rulesReadingFor`/`rulesNoteFor`/`rulesDiagnosticFor`/
 * `updateRulesBadge`/`childPredictionFor` with no behaviour change. The gap it closed, in the
 * operator's own words: "it gets the default tag added of new (i imagine that will come from
 * rules?)" — `🆕`, `stamp-created-at-on-task`, ten seconds late every time, until this axis was
 * wired.
 *
 * SCOPED TO A FRESH CAPTURE (`commit.kind === "insert-line"`), NEVER AN EXISTING LINE.
 * `resolveLineFields` (membership.ts) already refuses to resolve fields for a line carrying a
 * `[[qntm:N]]` stamp, so a "set-line" commit on an existing node abstains by construction — the
 * `kind` gate here is the cheaper statement of the same fact, not a second rule.
 *
 * ── `answer` CARRIES `text: string | null` ──
 *
 * The committed line's characters WITH every rendered effect appended, or `null` when a rules pass
 * ran and fired nothing at all (a legitimate answer: no published rule matched this candidate).
 * `abstains` covers two different refusals, named rather than conflated: `resolveLineFields`'s own
 * reasons (an existing node, an empty line, …) and, prefixed `rendering-`, `renderRuleEffects`'s
 * own two (`unrenderable-effect`, `conflicting-token-present`) — a rule matched and fired, but this
 * app cannot spell its effect onto a line without inventing characters or overwriting typed ones.
 *
 * ── THE READING IS READ-ONLY, AND THAT IS THE WRITE-PATH GUARANTEE ──
 *
 * `commit.markdown`/`commit.text` are never assigned from this answer, here or anywhere. The first
 * shape this feature took DID write the stamp into `commit.markdown` in place so the glyph would
 * ride the operator's own POST; eight test files pin the invariant that caught it. What ships
 * instead is `arm` below: the literal characters reach the SCREEN as a DOM-only decoration through
 * `PredictSurface`, and the wire carries exactly what he typed.
 *
 * ── COVERAGE: THE MEASUREMENT THIS RESOLVER EXISTS TO STOP HIDING ──
 *
 * For one freshly typed `- [ ] something #task` in his inbox, the table holds 25 rules: 1 fires, 7
 * are structurally undecidable in a browser (a one-hop `children:`/`parents:` edge step), 2 match
 * with a false `when`, 15 do not match. `applyRules` reports all seven in `RulePassResult
 * .undecidable`. The OLD reader surfaced that list only when `applied.length === 0` — unreachable
 * the moment anything fires — so the badge printed "rules: decided" while 28% of the table went
 * unconsulted. `read` now carries it as `coverage`. `show` still prints the identical sentence:
 * making the state EXPRESSIBLE and SURFACING it are two changes, and this is the first.
 */

import { sectionAt, sectionOrderFor } from "../address.js";
import { resolveLineFields } from "../membership.js";
import { applyRules, renderRuleEffects } from "../rules.js";
import type { RuleEffect } from "../rules.js";
import { todayFor } from "../today.js";
import type { Arming, CommitContext, Reading, ResolverSpec } from "../resolve.js";
import { COMPLETE, NOT_EVALUATED, coverageOf } from "../resolve.js";

/** What a rules pass decided for the committed line. */
export interface RulesOutcome {
  /** Every rule that matched and fired, in fire order. Empty is a real answer, not a lesser one. */
  readonly applied: readonly RuleEffect[];
  /** The line WITH every rendered effect appended, or `null` when there is nothing to show. */
  readonly text: string | null;
  /**
   * TRUE when a rule that fired ALSO carries an unmodelled `emit_event`. The rendered text is still
   * correct; this says the rule's real effect is bigger than what got rendered, so a reader must not
   * treat this answer as the whole story. DISTINCT FROM `coverage`: `partial` is about an action
   * inside a rule that DID fire; `coverage` is about rules that were never consulted at all.
   */
  readonly partial: boolean;
}

export type RulesCommitReading = Reading<RulesOutcome>;

export const rulesSpec: ResolverSpec<RulesCommitReading> = {
  id: "rules",
  badge: "rulesBadge",

  read(ctx: CommitContext): RulesCommitReading {
    const { view, commit } = ctx;
    const { qualification, resolution, rules: rulesTable } = ctx.declared;
    if (rulesTable === undefined || qualification === undefined || resolution === undefined) {
      return NOT_EVALUATED;
    }
    if (commit.kind !== "insert-line" || commit.markdown === null) {
      return NOT_EVALUATED;
    }
    const sectionOrder = sectionOrderFor(view, qualification.sectionOrder);
    const sectionId = sectionAt(commit.markdown, commit.lineIndex, view.id, sectionOrder);
    if (sectionId === null) {
      return NOT_EVALUATED;
    }
    const section = qualification.sections[view.id]?.[sectionId];
    if (section === undefined) {
      return NOT_EVALUATED;
    }
    const line = commit.markdown.split("\n")[commit.lineIndex] ?? "";
    const fields = resolveLineFields(line, section, qualification);
    if (typeof fields === "string") {
      // membership.ts's own `Abstention` vocabulary — not this axis's to invent a second one for.
      return { kind: "abstains", because: fields };
    }
    // `$cycle_today`/`$cycle_week_end` — the day boundary, resolved the way the engine resolves it,
    // NEVER the system clock read directly (`today.ts`'s own header: the operator's logical day
    // rolls over at a declared hour in a declared zone, not at local midnight). The instant comes
    // from `ctx.now`, which the PAGE supplies — nothing in `app/present/` reads the clock itself.
    //
    // ── A DEFECT THIS PORT FOUND AND DELIBERATELY DID NOT FIX ──
    //
    // `resolution.dayBoundary` is `DayBoundary | undefined` — `readConfigResolutionDeclaration`
    // leaves it `undefined` when the document publishes no day boundary or a malformed one, and
    // still returns a resolution table. `todayFor` then reads `boundary.timezone` off `undefined`
    // and throws a TypeError, inside `commitLine`'s SYNCHRONOUS prefix, in an `async` function no
    // keydown call site awaits — the operator's capture disappears with no POST and nothing on
    // screen. Exactly the shape of the `f448da2` defect, and it has been live on this line since the
    // rules axis was wired; the page could not see it because the page is outside `tsconfig.json`.
    // The shipped `presentation.json` publishes a valid boundary, so it does not fire today.
    //
    // THE `!` IS HERE TO KEEP THIS PORT HONEST, NOT TO SILENCE THE COMPILER. Guarding it would
    // change behaviour — an abstention where there is a crash today — and this change's whole claim
    // is that it changes none. The assertion is the marker: one line a reviewer can find, in the
    // file the compiler now reads, instead of an implication in a page it does not.
    const today = todayFor(ctx.now(), resolution.dayBoundary!);
    const pass = applyRules(fields, rulesTable, today.kind === "answer" ? today.answer : undefined);
    if (pass.applied.length === 0) {
      // UNDECIDABLE, NOT "DECIDED: NOTHING APPLIES" — at least one rule this candidate reached
      // could not be checked at all (its pattern needs a graph this app does not have), so "no rule
      // fired" is not a confident answer. Checked only in the applied-nothing case: a rule that
      // fired elsewhere in the same pass is not blocked by this, and reports through `coverage`.
      if (pass.undecidable.length > 0) {
        return { kind: "abstains", because: "rule-pattern-needs-graph-traversal" };
      }
      return { kind: "answer", coverage: COMPLETE, applied: [], text: null, partial: false };
    }
    const rendered = renderRuleEffects(
      line,
      pass.applied,
      qualification.tokens.node_type ?? {},
      qualification.tokens,
      rulesTable.fieldMarkers,
    );
    if (rendered.kind === "abstains") {
      return { kind: "abstains", because: `rendering-${rendered.because}` };
    }
    return {
      kind: "answer",
      // THE SEVEN THIS PASS COULD NOT CONSULT, CARRIED RATHER THAN DROPPED — see this module's
      // header for the measurement, and `Coverage`'s own header for why it rides on the answer.
      coverage: coverageOf(pass.undecidable),
      applied: pass.applied,
      text: rendered.kind === "rendered" ? rendered.text : null,
      partial: pass.partial.length > 0,
    };
  },

  say(reading: RulesCommitReading): string {
    if (reading.kind !== "answer" || reading.applied.length === 0 || reading.text === null) {
      return "";
    }
    const words = reading.applied.map((effect) => {
      if (effect.verb === "retype") return `becomes ${effect.to}`;
      if (effect.verb === "set") return `sets ${effect.field}`;
      return `clears ${effect.field}`;
    });
    return `this line ${words.join(", ")}`;
  },

  show(reading: RulesCommitReading): string {
    if (reading.kind === "not-evaluated") {
      return "";
    }
    if (reading.kind === "abstains") {
      return `rules: abstained — ${reading.because}`;
    }
    // PARTIAL, NOT ABSTAINED — the rendered text is real and correct; this says so rather than
    // presenting it as the complete effect. "Never silently complete", applied to the one axis that
    // can be right AND incomplete at once.
    //
    // `reading.coverage` IS NOT READ HERE, ON PURPOSE. Surfacing unconsulted rules changes what the
    // operator sees, and this change's whole claim is that nothing he sees changed. That is the
    // next, separately reviewable step.
    return reading.partial ? "rules: decided (partial — action(s) not modelled)" : "rules: decided";
  },

  /**
   * THE CHILD'S OWN PREDICTION — the row `commit` just became, decorated with what this pass says
   * it will carry once the cycle answers.
   *
   * SCOPED TO EXACTLY THE CASES `read` ALREADY CALLS "answer", NEVER TO AN ABSTENTION.
   * `reading.text === null` is the third silent case: a pass ran and genuinely decided nothing (an
   * `unset` on a field that was never set), a real answer with no characters to show.
   *
   * THE TEXT IS THE DELTA, NOT THE WHOLE LINE. `reading.text` is `renderRuleEffects`'s own
   * `line + appended`, so the characters the operator already typed are sliced back off — the row
   * already shows them, and repeating them would be the chip doubling the line rather than adding.
   */
  arm(ctx: CommitContext, reading: RulesCommitReading): readonly Arming[] {
    const { commit } = ctx;
    if (commit.kind !== "insert-line" || commit.markdown === null) {
      return [];
    }
    if (reading.kind !== "answer" || reading.text === null) {
      return [];
    }
    const line = commit.markdown.split("\n")[commit.lineIndex] ?? "";
    const delta = reading.text.slice(line.length).trim();
    return delta === "" ? [] : [{ surface: "predict", prediction: { lineIndex: commit.lineIndex, text: delta } }];
  },
};

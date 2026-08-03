/**
 * The presentation bundle's public surface — a barrel, not a seventh concern.
 *
 * It exists because `app.html` is a hand-authored page served by GitHub Pages from main:/ with no
 * build of its own, so it imports ONE committed artifact (dist/present.js) rather than six module
 * files. Everything here is a re-export; there is no logic in this file and there must never be,
 * for the same reason app/boot.ts holds the only top-level side effect: a module that does work
 * on the way past is a module nothing can reason about.
 *
 * WHY THE CODE IS UNDER app/ AT ALL, since it would have been fewer moving parts to leave it in
 * the page: `.flow-trace.yaml`'s capture filter is `include: [app]`, and for a JS/TS target that
 * entry is a PATH PREFIX. A presentation cascade written inside app.html is invisible to
 * canonical routing, to flow declarations and to depth-to-sink permanently, by construction. The
 * location is the governance.
 */

export { SPECIFICITY, isSilent } from "./levels.js";
export type { PresentationLevel } from "./levels.js";

export {
  DEFAULT,
  RESOLUTION_KEYS,
  carriesContent,
  chromeOf,
  classifyLine,
  markerSpans,
  qntmIdSpans,
  stampSpans,
  tagSpans,
  titleSpans,
  wikiLinkSpans,
} from "./resolution.js";
export type {
  Contribution,
  LineShape,
  Rendition,
  Resolution,
  ResolutionKey,
  StampSpan,
  TagSpan,
  WordSpan,
} from "./resolution.js";

export { DEFAULT_INDENT_UNIT, readDeclaration } from "./declaration.js";
export type { DeclarationReading } from "./declaration.js";

export { readStructuralDeclaration, STRUCTURAL_KEY } from "./structural.js";
export type {
  EdgeDirection,
  EdgeSource,
  IndentBinding,
  SectionStructuralLanguage,
  StructuralLanguage,
  StructuralReading,
} from "./structural.js";

export { sectionAt, sectionForInsertAt, sectionOrderFor, sectionOrdinalAt } from "./address.js";

export { QUALIFICATION_KEY, readQualificationDeclaration } from "./qualification.js";
export type {
  FieldPredicate,
  FieldValue,
  FindClause,
  Qualifier,
  QualificationLanguage,
  QualificationReading,
  SectionQualification,
} from "./qualification.js";

export { RESOLUTION_TABLE_KEY, readConfigResolutionDeclaration } from "./resolutiontable.js";
export type {
  ChromeShape,
  ConfigResolutionReading,
  ConfigResolutionTable,
  DayBoundary,
  OrderingFieldKind,
  OrderingFieldMarker,
  OrderingKey,
  RegistrationTable,
  SectionOrdering,
} from "./resolutiontable.js";

export { markerValue, orderingFor } from "./ordering.js";
export type { OrderingAbstention, OrderingAnswer, OrderingReading } from "./ordering.js";

export { resolveLogicalDate, resolveWeekEnd, todayFor } from "./today.js";
export type { TodayAbstention, TodayAnswer, TodayReading } from "./today.js";

export {
  RESOLVABLE_FIELDS,
  matchesFindClause,
  matchesQualifier,
  membershipFor,
  resolveLineFields,
} from "./membership.js";
export type {
  Abstention,
  MembershipAnswer,
  MembershipReading,
  ResolvedFields,
} from "./membership.js";

export { PresentationContext, presentationFromDeclaration } from "./context.js";
export type { DeclaredPresentation } from "./context.js";

export { FocusSurface } from "./focus.js";
export type { ReanchorReading } from "./focus.js";

export { BaseSurface, baseOf } from "./base.js";
export type { BaseReading } from "./base.js";

export {
  ANCHOR_TRUST,
  instanceAnchorFor,
  instanceOf,
  instancesOf,
  resolveInstanceAnchor,
} from "./instance.js";
export type { AnchorVia, InstanceAnchor, InstanceReading, LineInstance } from "./instance.js";

export { extendsLine, relativeAnchorFor, resolveRelativeAnchor } from "./relative.js";
export type { LinePlace, RelativeAnchor, RelativeReading, RelativeRefusal } from "./relative.js";

export { ModeSurface, clampColumn, clampLine } from "./motions.js";
export type { Mode, NormalEffect, NormalKeyOutcome } from "./motions.js";

export { boundaryLine } from "./boundary.js";
export type { BoundaryDirection } from "./boundary.js";

export { INDENT_UNIT, indentedLine } from "./indent.js";

export { wordCaret } from "./word.js";
export type { WordMotion } from "./word.js";

export { DraftSurface, placeDraft, placeFor } from "./draft.js";
export type { Draft, DraftPlace, DraftPlacement } from "./draft.js";

export { HeldSurface, heldFrom, keyOf } from "./held.js";
export type { HeldEdit, HeldReason, HeldRow } from "./held.js";

export { ProjectionQueue } from "./queue.js";
export type { OfferOutcome, PendingProjection } from "./queue.js";

export { PickupSchedule, PICKUP_DELAYS, OWED_LIMIT } from "./pickup.js";
export type { AnswerOutcome, AttemptOutcome, ScheduleOutcome } from "./pickup.js";

export { AcceptedSource } from "./accepted.js";

export {
  lineBody,
  mintWriteToken,
  readWriteEcho,
  stampsLanded,
  stampsOwed,
  WriteRegister,
  WRITE_ECHO_KEY,
} from "./correlation.js";
export type { EchoReading, WriteEcho } from "./correlation.js";

export { seedFor, openLine } from "./newline.js";
export type { GlobalRegistration, NewLine } from "./newline.js";

export { PresentationCascade } from "./cascade.js";
export type { Resolved } from "./cascade.js";

export { applyEdit } from "./source.js";
export type { InsertLine, SetCheckbox, SetLine, SourceEdit } from "./source.js";

export { paint } from "./paint.js";
export type { CheckboxToggle, InlineMarkdown, LineCommit, PaintDeps } from "./paint.js";

export { EMBEDDED_DECLARATION } from "./embedded-declaration.js";

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

export { SPECIFICITY, isSilent } from "./express/levels.js";
export type { PresentationLevel } from "./express/levels.js";

export {
  DEFAULT,
  RESOLUTION_KEYS,
  carriesContent,
  chromeOf,
  classifyLine,
  cleanTitleFor,
  markerSpans,
  qntmIdSpans,
  stampSpans,
  tagSpans,
  titleSpans,
  wikiLinkSpans,
} from "./express/rendition.js";
export type {
  CleanTitleAbstention,
  CleanTitleReading,
  Contribution,
  LineShape,
  Rendition,
  Resolution,
  ResolutionKey,
  StampSpan,
  TagSpan,
  WordSpan,
} from "./express/rendition.js";

export { DEFAULT_INDENT_UNIT, LANDING_VIEW_KEY, readDeclaration } from "./express/declaration.js";
export type { DeclarationReading } from "./express/declaration.js";

export { readStructuralDeclaration, STRUCTURAL_KEY } from "./arrange/structural.js";
export type {
  EdgeDirection,
  EdgeSource,
  IndentBinding,
  SectionStructuralLanguage,
  StructuralLanguage,
  StructuralReading,
} from "./arrange/structural.js";

export { sectionAt, sectionForInsertAt, sectionOrderFor, sectionOrdinalAt } from "./address.js";

export {
  QUALIFICATION_KEY,
  DEFAULT_TRAVERSAL_DEPTH,
  readQualificationDeclaration,
  qualifierNeedsGraph,
} from "./select/qualification.js";
export type {
  EdgeStep,
  FieldPredicate,
  FieldValue,
  FindClause,
  Qualifier,
  QualificationLanguage,
  QualificationReading,
  SectionQualification,
} from "./select/qualification.js";

export { RESOLUTION_TABLE_KEY, readConfigResolutionDeclaration } from "./resolutiontable.js";
export type {
  ChromeShape,
  Composition,
  CompositionCellClass,
  ConfigResolutionReading,
  ConfigResolutionTable,
  DayBoundary,
  OrderingFieldKind,
  OrderingFieldMarker,
  OrderingKey,
  RegistrationTable,
  SectionOrdering,
  TagOrder,
} from "./resolutiontable.js";

export { composeLine, composeSeed } from "./express/composition.js";
export type { KnownCells, LineCells } from "./express/composition.js";

export {
  markerValue,
  orderingFor,
  orderingPlacementFor,
  defaultOrderingFor,
  defaultOrderingPlacementFor,
  resolveOrderingFor,
  resolveOrderingPlacementFor,
} from "./arrange/ordering.js";
export type {
  OrderingAbstention,
  OrderingAnswer,
  OrderingPlacement,
  OrderingReading,
  PlacementReading,
  QualifyingClassifier,
} from "./arrange/ordering.js";

export { publishedQualifierFor, qualifyingClassifierFor } from "./arrange/orderingqualify.js";

export { resolveLogicalDate, resolveWeekEnd, todayFor } from "./today.js";
export type { TodayAbstention, TodayAnswer, TodayReading } from "./today.js";

export {
  RESOLVABLE_FIELDS,
  matchesFindClause,
  matchesQualifier,
  membershipFor,
  resolveLineFields,
} from "./select/membership.js";
export type {
  Abstention,
  MembershipAnswer,
  MembershipReading,
  ResolvedFields,
} from "./select/membership.js";

export {
  RULES_KEY,
  readRulesDeclaration,
  applyRules,
  applyRuleActions,
  evaluateWhen,
  renderRuleEffects,
} from "./rules.js";
export type {
  FieldMarker,
  RuleActionSpec,
  RuleEffect,
  RulePassResult,
  RuleRenderAbstention,
  RuleRenderOutcome,
  RulesLanguage,
  RulesReading,
  RuleSpec,
  RuleWhen,
} from "./rules.js";

export { matchesQualifierGraphAware, applyGraphAwareRules, resolvedQntmId } from "./graphmatch.js";
export type {
  EdgeSourceOf,
  GraphAwareRulePassResult,
  GraphEdge,
  GraphNode,
  GraphSnapshot,
  ProspectiveChild,
} from "./graphmatch.js";

export { PresentationContext, presentationFromDeclaration, declarationFrom, NOT_YET_DECLARED } from "./context.js";
export type { DeclaredPresentation, Declaration } from "./context.js";

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

// ── THE ONE-LINE REBASE — A REFUSED WRITE'S SAFE RETRY (design-the-two-rules.md §2.2) ──
//
// Is the operator's own edit still applicable to the file the server just refused him with, and
// where. Composes `instance.ts`'s anchor walk with `source.ts`'s `applyEdit`; see rebase.ts's own
// header for the prior decision (backlog.yaml's `the-cursor-anchors-to-a-node-not-a-line-number`)
// this engages with and why its blocking fact does not hold here.
export { rebaseLineEdit } from "./rebase.js";
export type { RebaseOutcome } from "./rebase.js";

export { PresentationCascade } from "./express/cascade.js";
export type { Resolved } from "./express/cascade.js";

export { applyEdit } from "./source.js";
export type { InsertLine, SetCheckbox, SetLine, SourceEdit } from "./source.js";

export { paint, existingLineCommit, visualLineOrder } from "./paint.js";
export type { CheckboxToggle, InlineMarkdown, LineCommit, PaintDeps } from "./paint.js";

export { SettleSurface } from "./settle.js";
export type { RowPlacement, SettleInstruction } from "./settle.js";

export { PredictSurface } from "./predict.js";
export type { PredictInstruction, RowPrediction, WithdrawnPrediction } from "./predict.js";

// ── THE ROWS OF THE VIEW ON SCREEN, HELD OUTSIDE THE DOM ──
//
// The string the painter walked, one row per printed line, each with a handle that outlives the
// string it came from, and which row is selected. See rows.ts's own header for the defect it ends
// and for why the identity is a two-arm union rather than a nullable field.
export { RowStore, engineOf } from "./rows.js";
export type { EngineRowId, LocalRowId, Row, RowIdentity, RowSink } from "./rows.js";

// ── WHAT A RESOLVER IS, AND THE FOUR THIS APP HAS ──
//
// The page used to hold four hand-written functions per axis and name every one of them inside
// `commitLine`. It now builds one `CommitContext`, walks `RESOLVERS`, and joins what comes back.
// See resolve.ts's own header for the interface and for the one place the four did not fit.
export {
  COMPLETE,
  NOT_EVALUATED,
  abstentionsOf,
  armPredict,
  armSettle,
  coverageOf,
  defineResolver,
  diagnosticOf,
  graphSnapshotOf,
  runResolvers,
} from "./resolve.js";
export type {
  Arming,
  CommitContext,
  CommitOutcome,
  Coverage,
  DeclarationSet,
  Diagnostic,
  GraphPayload,
  PredictArm,
  Reading,
  Resolver,
  ResolverRun,
  ResolverSpec,
  SettleArm,
  ViewIdentity,
} from "./resolve.js";

export { RESOLVERS } from "./resolvers/registry.js";

// ── commitLine ITSELF — THE CONNECTING ACT, RELOCATED (see commit.ts's own header) ──
//
// `app/index.html` used to hand-author this function; it now constructs one via
// `createCommitLine(deps)`, once, at page scope. See commit.ts for what stayed on the page
// (`resolverContextFor`, `reportAbstentions`) and why.
export { createCommitLine } from "./commit.js";
export type {
  CommitLineDeps,
  CommitLineQueue,
  CommitLineSettle,
  CommitLineView,
  CommitLineWrites,
} from "./commit.js";
// THE SPECS THEMSELVES, BESIDE THE REGISTRY THAT ERASES THEM. `RESOLVERS` holds `Resolver`s, whose
// reading type is deliberately erased (see `Resolver`'s own header) — a caller that wants to drive
// ONE axis's `read`/`say`/`show` against a reading it is holding needs the spec, and the page's own
// test seam is exactly that caller.
export { membershipSpec } from "./resolvers/membership.js";
export type { MembershipCommitReading, MembershipTransition } from "./resolvers/membership.js";
export { orderingSpec } from "./resolvers/ordering.js";
export type { OrderingCommitReading, OrderingMove } from "./resolvers/ordering.js";
export { rulesSpec } from "./resolvers/rules.js";
export type { RulesCommitReading, RulesOutcome } from "./resolvers/rules.js";
export {
  WAITING_FOR_TAG_BINDING,
  edgeSourceOfFor,
  parentCandidateFor,
  promotionSpec,
  prospectiveEdgeBinding,
  structuralParentLineIndex,
  structuralRelationshipChangeFor,
} from "./resolvers/promotion.js";
export type { PromotionCommitReading, PromotionOutcome, RelationshipChange } from "./resolvers/promotion.js";

// ── THE VIEW DRAWER — THE ONE RE-EXPORT THAT CROSSES OUT OF app/present/ ──
//
// `app/shell/drawer.ts`, not `./drawer.js`. This barrel is still nothing but re-exports — the rule
// this file's own header states — but the module underneath sits beside `app/present/`, not inside
// it, because it is the one thing here that touches the document, and `paint.ts`'s own header
// claims `app/present/` has exactly one of those. See `drawer.ts`'s own header for the full
// argument; the short version is that `app/index.html` still imports everything from this one
// bundle, so the drawer's public surface is re-exported here rather than the page growing a second
// site-root-absolute import.
export {
  buildDrawer,
  closeDrawer,
  folderOf,
  foldersOf,
  markWhereWeAre,
  openDrawer,
  drawerStops,
  viewButtons,
  drawerIsOpen,
} from "../shell/drawer.js";
export type { DrawerDeps, DrawerView, FolderNode } from "../shell/drawer.js";

// THERE IS NO `EMBEDDED_DECLARATION` HERE ANY MORE, AND ITS ABSENCE IS THE POINT.
//
// `app/present/embedded-declaration.ts` used to `import presentationJson from
// "../../presentation.json"`, which put 138,806 bytes of the OPERATOR'S CONFIGURATION inside this
// bundle at build time. That welded two documents with opposite change rates together: the bundle
// changes when the app changes, the declaration changes when the config changes — and because
// dist/present.js is a committed artifact CI refuses to ship stale
// (.github/workflows/build.yml, "fail if a committed bundle is stale"), a config change could not
// reach a browser without somebody rebuilding and committing this file. That is what "the user
// changed their config, so somebody must redeploy the app" was made of.
//
// The page fetches `/presentation.json` at run time instead (app/index.html, `loadPresentation`).
// Nothing in app/present/ fetches anything: these modules stay PURE, and the edge that reads the
// wire is the page, which is where every other read already lives.
//
// docs/implementation-artifacts/design-config-is-content.md step 2.

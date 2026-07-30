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

export { DEFAULT, RESOLUTION_KEYS, classifyLine, tagSpans } from "./resolution.js";
export type {
  Contribution,
  LineShape,
  Rendition,
  Resolution,
  ResolutionKey,
  TagSpan,
} from "./resolution.js";

export { readDeclaration } from "./declaration.js";
export type { DeclarationReading } from "./declaration.js";

export { PresentationContext, presentationFromDeclaration } from "./context.js";
export type { DeclaredPresentation } from "./context.js";

export { FocusSurface } from "./focus.js";

export { PresentationCascade } from "./cascade.js";
export type { Resolved } from "./cascade.js";

export { applyEdit } from "./source.js";
export type { SetCheckbox, SetLine, SourceEdit } from "./source.js";

export { paint } from "./paint.js";
export type { CheckboxToggle, InlineMarkdown, LineCommit, PaintDeps } from "./paint.js";

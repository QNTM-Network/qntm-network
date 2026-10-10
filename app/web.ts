/**
 * THE WEB APP'S BUNDLE ENTRY — `dist/present.js`, imported by `app/index.html` (2026-10-10, backlog
 * row client-core-package).
 *
 * Two halves, one bundle, because the page keeps one site-root-absolute import:
 *   - `app/present/` — THE CLIENT CORE. What a list shows, how a line reads, what a key means,
 *     what a write carries. No DOM: `tsconfig.core.json` type-checks it with no browser types,
 *     and it imports nothing outside itself (check client-core-stands-alone). A phone app or an
 *     API/MCP client imports `app/present/index.ts` and gets the same answers.
 *   - `app/shell/` — THE WEB SHELL. The painter, the keyboard, the drawer, search, the touch bar:
 *     everything that touches the document.
 */

export * from "./present/index.js";

export { paint, existingLineCommit, revealSelection, visualLineOrder } from "./shell/paint.js";
export type { CheckboxToggle, InlineMarkdown, LineCommit, PaintDeps } from "./shell/paint.js";
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
} from "./shell/drawer.js";
export type { DrawerDeps, DrawerView, FolderNode } from "./shell/drawer.js";
export { flushMarks, globalKey, installGlobalKeys } from "./shell/keys.js";
export { installCompleter, placeSuggestionList as placeSuggestions } from "./shell/completer.js";
export { installKeyHelp } from "./shell/help.js";
export { installSearch } from "./shell/search.js";
export { installLinks } from "./shell/links.js";
export { installViewHistory, viewFromHash } from "./shell/viewhistory.js";
export { installTouchBar, showTouchMode, TOUCH_KEYS, keyboardBarTop } from "./shell/touchbar.js";
export type { SearchDeps } from "./shell/search.js";
export type { CompleterDeps } from "./shell/completer.js";
export type { GlobalKeyDeps, GlobalKeyView } from "./shell/keys.js";
export { holdHeight } from "./shell/paint.js";

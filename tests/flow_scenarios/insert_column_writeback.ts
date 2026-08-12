/**
 * insert_column_writeback — DOES `FocusSurface.column` EQUAL WHERE THE CARET ACTUALLY IS?
 *
 * A DELIBERATE RED. This scenario FAILs on unmodified main and is expected to keep failing until
 * the operator decides how the cursor's column should be owned. It is a PIN, not a regression: the
 * defect below is measured, not suspected, and the fix is a design decision that has not been made.
 * Do not "fix" this by making the assertion looser.
 *
 * ── THE DEFECT, MEASURED 2026-08-12 THROUGH THE REAL PAGE ──
 *
 * `FocusSurface` is declared (classes.yaml, `cursor-position`) as the one place that holds "where
 * the cursor is — the line it is on, the column within that line". Its column is written in
 * exactly TWO places, both in `app/shell/keys.ts`: `moveColumn` for `w`/`b`/`e` (:279) and for
 * `0`/`$` (:288). Every OTHER gesture either leaves the column stale or resets it to zero, because
 * `focus.focus(lineIndex, source, column = 0, view = "")` is called with a literal `0` at every one
 * of its call sites.
 *
 * Measured through app/index.html's own wiring (tests/fixtures/app-html-page.mjs), reading
 * `__focusColumn()` against the painted input's real `selectionStart`:
 *
 *     gesture                          focus.column      caret         agree
 *     `a` at column 0                       0              1            NO
 *     `w` (col 6) then `a`                  6              7            NO
 *     `$` (col 32) then `a`                32             33            NO
 *     `i` at column 0                       0              0            yes
 *     `a`, type "HELLO", Escape             0              6            NO   <- the one that matters
 *     `w` (col 6) then CLICK the row        0            (clicked)      NO   <- reset, never learned
 *     `w` (col 6) then `j`                  0                           NO   <- vim preserves this
 *     `w` (col 6) then `}`                  0                           NO
 *
 * THE ROW THAT DECIDES IT IS THE ESCAPE ONE. An off-by-one that lasted only while INSERT is open
 * would be arguable — vim's own `a` does put the caret one past the cursor. But after typing five
 * characters and pressing Escape the operator is back in NORMAL with the cursor five characters
 * from where he left off, and the surface reports the column he had BEFORE the append. The column
 * is not offset during insert; it is frozen through the whole episode and never reconciled.
 *
 * ── WHAT THIS SCENARIO ASSERTS, AND WHY IT NEEDS NO DOM ──
 *
 * The divergence ORIGINATES at the seam between `ModeSurface` and `FocusSurface`, one layer above
 * the caret, and that seam is pure. `keys.ts` reads `deps.focus.column`, hands it to
 * `mode.handleKey`, which computes `column + 1` for `a` and stores it as a caret hint for the
 * painter to consume — and then nothing puts the new column back. So the claim is checkable
 * against the two real surfaces with no document, no painter and no stub:
 *
 *     after `a`, the column FocusSurface reports must equal the caret position ModeSurface just
 *     produced for the painter to place.
 *
 * This is deliberately NOT a re-implementation of `paint.ts`'s clamp. It compares the surface
 * against the hint, which is the value the painter consumes; the clamp only narrows that value
 * into the line's length and cannot make an unwritten column agree with it. The DOM half — that
 * the caret really does land at the hint — is already proven by tests/app-vim-wiring.test.mjs:214
 * under `node --test`, which flow-trace cannot see because it drives an HTML page.
 *
 * ── WHAT IS STUBBED ──
 *
 * Nothing. `ModeSurface` and `FocusSurface` are the real modules. `document`, `fetch` and
 * `Date.now` are replaced with values that throw, the same posture vim_gestures.ts and
 * draft_placement.ts take, so a module that reached for the environment says which one.
 */

import { ModeSurface } from "../../app/present/motions.js";
import { FocusSurface } from "../../app/present/focus.js";
import { DraftSurface } from "../../app/present/draft.js";
import { globalKey } from "../../app/shell/keys.js";
import { paint } from "../../app/present/paint.js";
import { PresentationContext } from "../../app/present/context.js";
import type { GlobalKeyDeps } from "../../app/shell/keys.js";

/** One checkbox line with a real title, so a non-zero column is reachable through `w`. */
const SOURCE = ["# This Week", "- [ ] first task [[qntm:1]] #task"].join("\n");
const VIEW = { id: "this-week", path: "work/outcomes.md", markdown: SOURCE };
/** The checkbox line — the one with a title, so `a` has real characters to append into. */
const LINE_INDEX = 1;

/**
 * THE MINIMUM `visualLineOrder` READS — `body.children`, each child carrying `dataset.lineIndex`
 * (paint.ts:1950-1959). No document, no painter, no stub of either: the handler under test only
 * ever asks this object for the row order, so supplying exactly that is passing the fact rather
 * than faking a browser.
 */
function viewBodyWithRows(count: number): HTMLElement {
  const children = Array.from({ length: count }, (_v, i) => ({ dataset: { lineIndex: String(i) } }));
  return { children } as unknown as HTMLElement;
}

/**
 * EVERY DEPENDENCY `globalKey` DECLARES, and the ones this gesture cannot reach throw rather than
 * returning a plausible value — an `a` that somehow committed a line or opened the drawer would say
 * so instead of passing quietly.
 */
function depsFor(focus: FocusSurface, mode: ModeSurface, repaints: { count: number }): GlobalKeyDeps {
  const unreachable = (name: string) => (): never => {
    throw new Error(`\`a\` reached \`${name}\`, which the append gesture must never touch`);
  };
  return {
    viewBody: viewBodyWithRows(2),
    focus,
    mode,
    draftLine: new DraftSurface(),
    showing: () => SOURCE,
    sourceFor: () => SOURCE,
    declaration: () => ({ indentUnit: 4 }) as unknown as ReturnType<GlobalKeyDeps["declaration"]>,
    viewOf: () => VIEW,
    currentViewId: () => VIEW.id,
    drawerIsOpen: () => false,
    globalRegistrationFor: () => undefined,
    commitLine: unreachable("commitLine"),
    repaintCurrentView: () => {
      repaints.count += 1;
    },
    drainPainted: () => {},
    openDrawer: unreachable("openDrawer"),
    closeDrawer: unreachable("closeDrawer"),
  };
}

/** The one field `globalKey` reads off the event, plus the two it may call. */
function keydown(key: string): KeyboardEvent {
  return { key, target: null, preventDefault: () => {}, stopPropagation: () => {} } as unknown as KeyboardEvent;
}

export function run(): void {
  assertAppendWritesTheColumnBack();
}

/**
 * THE PIN. Drives the REAL `app/shell/keys.ts` handler — the same function app/index.html installs
 * on keydown — and then asks the focus surface where it thinks the cursor is.
 *
 * IT CALLS THE HANDLER RATHER THAN REPRODUCING ITS SEQUENCE, and that is what makes it a pin rather
 * than a description. A version of this scenario that re-ran the handler's steps by hand would go on
 * failing after a correct fix landed in `keys.ts`, because the fix would be in code the scenario
 * never called — a red that cannot go green is not an enforcer, it is a comment that costs CI time.
 */
function assertAppendWritesTheColumnBack(): void {
  const focus = new FocusSurface();
  const mode = new ModeSurface();
  const repaints = { count: 0 };
  const deps = depsFor(focus, mode, repaints);

  // The cursor is on the checkbox line. `focus()` no longer takes a column at all — it means
  // "line-start", which is the same column 0 this scenario always started from.
  focus.focus(LINE_INDEX, SOURCE, VIEW.id);
  const startColumn = focus.column;

  globalKey(deps, keydown("a"));

  if (mode.mode !== "INSERT") {
    throw new Error(`\`a\` did not enter INSERT through the real handler (mode is ${mode.mode})`);
  }
  if (repaints.count === 0) {
    throw new Error("`a` did not repaint — the handler did not reach its enter-insert branch");
  }
  // WHAT IS ASSERTED, AND WHY IT CHANGED TWICE ON 2026-08-12 — DISCLOSED, NOT QUIETLY EDITED.
  //
  // FIRST FORM: `focus.column` compared against the NUMBER `ModeSurface` produced (`takeCaretHint`).
  // That number no longer exists — motions.ts emits an INTENT and `column.ts` measures it against
  // the line — so the comparison lost its second operand.
  //
  // SECOND FORM (this one): compare `focus.column` against the CARET THAT ACTUALLY EXISTS, after a
  // real paint. This is STRONGER than either predecessor and it is stronger for a reason worth
  // stating: the claim "the cursor surface knows where the caret is" has no referent until a caret
  // has been placed. The resolver needs the LINE, and the line is chosen by the painter, so the
  // column is written when the row is opened — not when the key is pressed. A version of this
  // scenario that asserted after `globalKey` alone (as the first two did) was asserting about a
  // moment when nothing had placed a caret at all, and it went red against CORRECT wiring for
  // exactly that reason. It now drives the painter and reads the DOM the painter wrote.
  const body = stubBody();
  paint(body, SOURCE, new PresentationContext(), { markdown: markdownStub(), focus, mode } as never);

  const input = firstInput(body);
  if (input === null) {
    throw new Error("the paint opened no editable row, so there is no caret to compare against");
  }
  if (focus.column !== input.selectionStart) {
    throw new Error(
      "THE CURSOR SURFACE DOES NOT KNOW WHERE THE CARET IS. " +
        `After \`a\` from column ${startColumn}, the caret was placed at ` +
        `${input.selectionStart} and FocusSurface.column reports ${focus.column}. ` +
        "`FocusSurface` is declared as the one place that holds where the cursor is " +
        "(classes.yaml, `cursor-position`), so the resolver must write the column it computed " +
        "back to it. Otherwise the column is frozen for the whole insert episode and after " +
        "typing and Escape the surface still reports the column from BEFORE the append. " +
        "See this file's header for the measurement across `a`, click, `j` and `}`.",
    );
  }
  if (input.selectionStart !== Math.min(startColumn + 1, (SOURCE.split("\n")[LINE_INDEX] ?? "").length)) {
    throw new Error(
      `\`a\` did not place the caret one past the cursor — got ${input.selectionStart}`,
    );
  }
}

/** The painter renders headings and prose through markdown-it; only these two methods are used. */
function markdownStub(): unknown {
  return { render: (m: string) => m, renderInline: (m: string) => m };
}

/** The minimum `paint` writes into: a body that collects children, over a stub document. */
function stubBody(): HTMLElement {
  interface Stub {
    tagName: string; type: string; value: string; className: string;
    selectionStart: number | null; children: Stub[]; dataset: Record<string, string>;
    style: Record<string, string>; innerHTML: string; textContent: string;
    append: (...k: Stub[]) => void; appendChild: (k: Stub) => Stub;
    addEventListener: () => void; setAttribute: () => void; removeAttribute: () => void;
    focus: () => void; setSelectionRange: (a: number, b: number) => void;
    remove: () => void; contains: () => boolean; querySelector: () => null;
    querySelectorAll: () => Stub[]; closest: () => null; getAttribute: () => null;
    classList: { add: () => void; remove: () => void; contains: () => boolean; toggle: () => void };
  }
  const make = (tagName = "div"): Stub => {
    const el: Stub = {
      tagName, type: "", value: "", className: "", selectionStart: null,
      children: [], dataset: {}, style: {}, innerHTML: "", textContent: "",
      append(...kids) { el.children.push(...kids); },
      appendChild(kid) { el.children.push(kid); return kid; },
      addEventListener() {}, setAttribute() {}, removeAttribute() {},
      focus() {}, setSelectionRange(a) { el.selectionStart = a; },
      remove() {}, contains() { return false; }, querySelector() { return null; },
      querySelectorAll() { return []; }, closest() { return null; }, getAttribute() { return null; },
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    };
    return el;
  };
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (t: string) => make(t),
    createTextNode: () => make("#text"),
    querySelector: () => null,
  };
  return make("div") as unknown as HTMLElement;
}

/** The first text `<input>` the paint produced, depth-first — the row `a` opened. */
function firstInput(node: unknown): { selectionStart: number } | null {
  const el = node as { tagName?: string; type?: string; children?: unknown[]; selectionStart?: number };
  if (el.tagName === "input" && el.type === "text") {
    return { selectionStart: el.selectionStart ?? -1 };
  }
  for (const kid of el.children ?? []) {
    const found = firstInput(kid);
    if (found !== null) return found;
  }
  return null;
}

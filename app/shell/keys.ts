/**
 * THE PAGE'S GLOBAL KEYBOARD — the document-level `keydown` handler, moved out of
 * `app/index.html` so the compiler and the tracer can both read it.
 *
 * WHY THIS FILE EXISTS, AND IT IS NOT A TIDY-UP. Until this module landed, every decision below
 * lived inside `app/index.html`'s `<script type="module">`. That is a LEVEL 1 SHAPE — application
 * logic in a markup file — and the cost was never hypothetical:
 *
 *   THE COMPILER COULD NOT READ IT. `tsconfig.json` includes `app/**\/*.ts`; an inline script in an
 *     HTML document is checked by nothing until it runs. `f448da2` is the sharpest instance —
 *     the `x` and `>`/`<` handlers hand-built a `{ lineIndex, text, markdown }` and left out
 *     `kind`/`source`, two fields `LineCommit` declares REQUIRED everywhere TypeScript is
 *     watching. It shipped, stayed silent for months, and surfaced as a keystroke that vanished
 *     with no POST and nothing on screen. The page's own note at index.html records three defects
 *     in three days living in exactly that blind spot.
 *   THE TRACER COULD NOT ENTER IT. flow-trace's JS capture is a node module-load hook and node
 *     cannot import an HTML document, so `ModeSurface.handleKey`'s only production caller was
 *     invisible. `classes.yaml`'s `movement` class — whose whole job is to catch a second module
 *     deciding what a key means — read `classes_verified: 0` against it: never asked anything.
 *     A region no tool can read cannot be detected, so it cannot be cleaned, so it grows.
 *
 * THE SHAPE IS THE ONE THIS REPO ALREADY USES, NOT A NEW ONE. `createCommitLine(deps)`
 * (app/present/commit.ts) and `DrawerDeps` (app/shell/drawer.ts) both take the page state their
 * module deliberately does not hold and keep the DECISIONS in a module. This follows them
 * exactly, which matters beyond taste: the remaining ~2,000 lines of that script — the passkey
 * ceremony, the fetch/POST wrappers, the view picker, the sync chrome, the boot sequence — each
 * come out the same way, and the next one has an obvious way in rather than needing a new idea.
 *
 * IT LIVES IN `app/shell/`, BESIDE `drawer.ts`, FOR drawer.ts's OWN REASON: this is chrome around
 * the reading column that touches the document, and `app/present/`'s header claims exactly one
 * module there does that (`paint.ts`). Re-exported through `app/present/index.ts` so the page
 * keeps ONE site-root-absolute import, the same accommodation the drawer already gets.
 *
 * WHAT DELIBERATELY DID NOT MOVE. The `document.addEventListener` call itself is a top-level side
 * effect and stays the page's — `installGlobalKeys` is a function the page CALLS, not a side
 * effect this module performs on import, because a module that wires itself on import is a module
 * that cannot be imported by a test or a probe without wiring itself.
 */

import { boundaryLine } from "../present/boundary.js";
import type { Declaration } from "../present/context.js";
import type { DraftSurface } from "../present/draft.js";
import type { FocusSurface } from "../present/focus.js";
import { indentedLine } from "../present/indent.js";
import type { ModeSurface } from "../present/motions.js";
import type { GlobalRegistration } from "../present/newline.js";
import { openLine } from "../present/newline.js";
import { existingLineCommit, visualLineOrder } from "../present/paint.js";
import type { LineCommit } from "../present/paint.js";
import { classifyLine } from "../present/express/rendition.js";
import { applyEdit } from "../present/source.js";
import { wordCaret } from "../present/word.js";

/** The view the handler is acting on — the wire payload's own shape, narrowed to what is read. */
export interface GlobalKeyView {
  readonly id: string;
  readonly path: string;
  readonly markdown: string;
}

/**
 * WHAT THE PAGE STILL HOLDS AND THIS MODULE CANNOT. Four of these are getters rather than values,
 * and the distinction is load-bearing: `declaration`, `graphData`, `currentViewId` and
 * `drawerIsOpen` are REASSIGNED by the page over its lifetime, so a value captured once would be
 * a stale copy and the handler would decide against the wrong world. A getter reads the page's
 * own current answer on every keystroke, which is what the inline handler did by closing over the
 * `let` directly.
 */
export interface GlobalKeyDeps {
  /** The painted view body — `visualLineOrder` reads the DOM's own current row order from it. */
  readonly viewBody: HTMLElement;
  readonly focus: FocusSurface;
  readonly mode: ModeSurface;
  readonly draftLine: DraftSurface;
  /** The row store's `showing(view, served)` — the one expression that answers what is on screen. */
  readonly showing: (view: string, served: string) => string;
  /** `AcceptedSource.sourceFor(path)` — the accepted string for a path, or null. */
  readonly sourceFor: (path: string) => string | null;
  readonly declaration: () => Declaration;
  readonly viewOf: (viewId: string) => GlobalKeyView | undefined;
  readonly currentViewId: () => string | null;
  readonly drawerIsOpen: () => boolean;
  readonly globalRegistrationFor: (viewId: string) => GlobalRegistration | undefined;
  readonly commitLine: (view: GlobalKeyView, commit: LineCommit) => void;
  readonly repaintCurrentView: () => void;
  readonly drainPainted: () => void;
  readonly openDrawer: () => void;
  readonly closeDrawer: () => void;
}

/**
 * WHILE AN `<input>` OWNS THE KEYSTROKE, A GLOBAL LETTER KEY MUST NOT EAT A CHARACTER OUT OF IT.
 * INSERT's own line, the handle field, the capture box, and the search a drawer row might grow one
 * day are all this shape; a global `j` that stole a character from any of them would be this shell
 * breaking the app it wraps.
 */
const typingIn = (target: EventTarget | null): boolean => {
  const tag = String((target as HTMLElement | null)?.tagName ?? "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
};

/**
 * ONE KEYSTROKE, DECIDED. The whole handler, not the movement branch alone — the drawer's
 * Escape/`\` and the projection drain run BEFORE the NORMAL gate and their ORDER IS LOAD-BEARING
 * (see the comments at each). Splitting them across two listeners would leave that order to
 * registration sequence, which is a behaviour change wearing a refactor's clothes.
 */
export function globalKey(deps: GlobalKeyDeps, e: KeyboardEvent): void {
  if (e.key === "Escape" && deps.drawerIsOpen()) { e.preventDefault(); deps.closeDrawer(); return; }
  if (e.key === "\\" && !deps.drawerIsOpen() && !typingIn(e.target)) { e.preventDefault(); deps.openDrawer(); return; }
  // THE THIRD DRAIN POINT — the world catches up the moment he is not typing into it.
  //
  // The other two are the events a write path already owns: a projection landing (`arrive`) and a
  // line settling (`commitLine`). This one is for the settlement the page is never told about — a
  // row abandoned with Escape settles inside `paint.ts` and calls nothing here — and it costs one
  // map lookup on a keystroke that is not going into an `<input>`.
  //
  // BEFORE THE NORMAL GATE AND OUTSIDE IT, ON PURPOSE. A key that this handler goes on to ignore
  // is still evidence that nothing is open, and the keys it DOES handle are then applied to the
  // projection that just landed rather than to the one it replaced. In INSERT the gate inside
  // `drainProjection` refuses anyway, so this is a no-op exactly when it must be.
  deps.drainPainted();
  // VIM NORMAL MODE. `typingIn(e.target)` is the SAME refusal `\` already earns. Also refused
  // while the drawer is modal (its own Tab trap owns the keyboard) and while there is no view to
  // move a selection through at all.
  const viewId = deps.currentViewId();
  if (deps.mode.mode !== "NORMAL" || deps.drawerIsOpen() || typingIn(e.target) || viewId === null) return;
  const v = deps.viewOf(viewId);
  if (v === undefined) return;
  // ── THE STRING THIS HANDLER READS IS THE ONE ON THE SCREEN, WHICH IS NOT WHAT IT USED TO BE ──
  //
  // Every arithmetic below used to be over `v.markdown` — the last PROJECTION, straight off
  // `graphData`. That is the sharpest form of the defect `rows.ts` exists to end, because this
  // handler does two things with it that the repaint does not:
  //
  //   IT COMPUTES EDITS. `x` and `>`/`<` pass `v.markdown` into `applyEdit` and POST the result.
  //     While a write was in the air, the file on screen and `v.markdown` were different strings,
  //     so the posted file was the operator's own line REMOVED and a different line changed. It
  //     did not even read the ACCEPTED string the repaint reads.
  //   IT TAKES THE CURSOR'S IDENTITY ANCHOR. `focus.focus(…, v.markdown, …)` anchors against a
  //     string with no such line in it, which is `instance.ts` being handed the wrong projection.
  //
  // `rows.showing` is handed the same server-side newest the repaint hands it, and answers the
  // same string — one expression, one answer, and the two can no longer disagree about what the
  // operator is looking at.
  const source = deps.showing(v.id, deps.sourceFor(v.path) ?? v.markdown);
  const current = deps.focus.lineIndex ?? 0;
  // ── `j`/`k`/`gg`/`G` MOVE THROUGH THE ROWS AS THEY ARE PAINTED, NOT THROUGH `source`'S OWN
  // LINE NUMBERS — the census this fixes: `settleRow` (app/present/paint.ts) moves a row's DOM
  // element the instant its placement is armed, and that move is COSMETIC ONLY — it never edits
  // `source`, which the real reorder only catches up to once the engine's own next cycle answers.
  // So "line index N" and "the row painted Nth" are two different facts the moment any settle has
  // fired for this view, and only the DOM's own current child order is the one the operator is
  // looking at. `visualLineOrder` reads that order back — the MATERIALISED CONSEQUENCE of every
  // placement `paint`/`settleRow` have applied so far — rather than this handler recomputing an
  // order of its own from `source.split("\n")`, which is the exact second definition the census
  // this fixes is about. `current`, above, stays the REAL file line index: every OTHER branch
  // below (`x`, `>`/`<`, `w`/`b`/`e`, `0`/`$`) addresses CONTENT by that index, which
  // `source.split("\n")[current]` still answers correctly regardless of screen position — only
  // the MOVE motions' own arithmetic runs over the visual order instead.
  const visualOrder = visualLineOrder(deps.viewBody);
  const visualPos = visualOrder.indexOf(current);
  const visualCurrent = visualPos === -1 ? 0 : visualPos;
  const visualLastIndex = Math.max(0, visualOrder.length - 1);
  // THE COLUMN IS NO LONGER PASSED, AND THE CLAIM THAT USED TO STAND HERE WAS FALSE. It read:
  // "every column that lands back on the surface goes through `focus.moveColumn`/`focus.focus`
  // below". True of the two writers it named, and untrue of the insert path, which wrote nothing
  // at all — `a` placed a caret the surface never learned about (measured 2026-08-12). `handleKey`
  // now reports what the gesture MEANT and `column.ts` resolves it against the line, so there is
  // no column for this call to hand over.
  const outcome = deps.mode.handleKey(e.key, visualCurrent, visualLastIndex);
  if (!outcome.handled) return;
  e.preventDefault();
  // THE PAINTER STILL DOES NOT DECIDE. `mode.handleKey` is the one place a keystroke becomes a
  // position, a mode change, a new-line request or a checkbox toggle (app/present/motions.ts);
  // this is the thin DOM wiring the brief asks for — apply the outcome, repaint.
  // `repaintCurrentView`, not `paintView`: the latter forces NORMAL on the way in, which would
  // undo an `i`/`a`/`o`/`O` before its <input> ever drew.
  const effect = outcome.effect;
  if (effect.kind === "move") {
    // `effect.lineIndex` IS A POSITION WITHIN `visualOrder` HERE, NOT A FILE LINE INDEX —
    // `mode.handleKey` clamped it against `visualLastIndex`, above, so it has to be translated
    // back through the SAME order it was computed against. `?? current` is the honest fallback
    // for the one case that order cannot name a target (an empty view, or the selected row
    // missing its own `data-line-index`): stay on the line the cursor already holds rather than
    // jump to a raw number that would name the wrong content.
    // LINE-START, AND THIS IS A DECISION THIS APP HAS ALREADY MADE RATHER THAN A LEFTOVER. Vim
    // preserves the column across `j`/`k`; this app resets it, deliberately — see
    // tests/app-vim-wiring.test.mjs, "a line move resets the column, so j after w starts the next
    // line at its head", whose assertion message calls a surviving column the failure. The literal
    // `0` that used to stand here was RIGHT; what was wrong is that it was indistinguishable from
    // the four other sites where `0` meant "I have nothing to say". Saying `line-start` is the
    // whole change: the meaning is now declared and reviewable, and revisiting it is a decision
    // someone can find rather than a number they have to interpret.
    deps.focus.place(visualOrder[effect.lineIndex] ?? current, { kind: "line-start" }, source, v.id);
    deps.repaintCurrentView();
  } else if (effect.kind === "boundary") {
    // `{`/`}` — motions.ts decided direction and count; `boundaryLine` (app/present/boundary.ts)
    // is the one place "which line is that" is answered, from the SAME source string, never a
    // second opinion parsed here.
    deps.focus.place(
      boundaryLine(source.split("\n"), current, effect.direction, effect.count),
      // LINE-START, for the same reason `j`/`k` uses it: this app resets the column on a line
      // move, and `{`/`}` is a line move. Declared rather than typed as a bare `0`.
      { kind: "line-start" },
      source,
      v.id,
    );
    deps.repaintCurrentView();
  } else if (effect.kind === "open") {
    // `o`/`O` — `openLine` is the SAME function Enter's mid-edit "open a line below" already
    // calls (app/present/paint.ts's `openLineAt`), not a parallel implementation. It opens
    // BELOW the selected line (`current + 1`) or AT it (`current`, pushing the selected line's
    // own content down) — `applyEdit`'s `insert-line` convention, unchanged from Enter's.
    const targetIndex = effect.direction === "below" ? current + 1 : current;
    const opened = openLine(
      source,
      targetIndex,
      deps.draftLine,
      undefined,
      deps.globalRegistrationFor(v.id),
      // THE VIEW THE ROW'S PLACE IS TAKEN IN, passed explicitly because it must be the same id
      // `paintView` resolves against and `globalRegistrationFor` can return nothing at all (no
      // declaration read yet), in which case there would be no view id inside it to fall back to.
      v.id,
    );
    if (opened) {
      // BLUR BEFORE INSERT. The draft row focuses itself unconditionally (paint.ts's
      // `paintDraft`, no cascade or mode check at all), so `focus` is not what puts the cursor
      // in it — but `focus.lineIndex` is still the line `o`/`O` was pressed on, and the instant
      // `mode.enterInsert()` makes every FOCUSED line raw, that line would ALSO become an
      // `<input>` if focus still pointed at it. Blurring is what leaves exactly one row
      // editable; `draftInput`'s own `returnToVim` (paint.ts) hands the cursor back once this
      // row settles or is abandoned.
      deps.focus.blur();
      deps.mode.enterInsert();
    }
    deps.repaintCurrentView();
  } else if (effect.kind === "toggle-done") {
    // `x` — reuses `applyEdit`'s existing `set-checkbox` case (source.ts) and posts through the
    // SAME write path a mouse click on the box already uses (`commitLine`). If the selected line
    // has no checkbox, `classifyLine` says so and nothing happens — no repaint, no POST, exactly
    // the brief's own rule for this key.
    const line = source.split("\n")[current] ?? "";
    const shape = classifyLine(line);
    if (shape.kind === "checkbox") {
      const markdown = applyEdit(source, {
        kind: "set-checkbox",
        lineIndex: current,
        checked: !shape.done,
      });
      if (markdown !== null) {
        // `existingLineCommit` (app/present/paint.ts), not a hand-built object — see its own
        // header for why: this line and the indent handler below are the two call sites that
        // shipped f448da2's regression by hand-rolling a `LineCommit` with `kind`/`source` left
        // out, in the one file TypeScript never checked. It checks this one.
        deps.commitLine(v, existingLineCommit(source, current, markdown));
      }
    }
  } else if (effect.kind === "indent") {
    // `>`/`<` — `indentedLine` (app/present/indent.ts) decides the new leading whitespace, in
    // whole units of `indentUnit` (read from presentation.json, falling back to the engine's
    // own four-space depth, renderer.py:947-950) — never the two-space margin arithmetic
    // paint.ts still uses for CSS (the golden master blocks fixing that copy; see paint.ts). It
    // returns the line UNCHANGED when there is nothing to do (a blank/heading line, or
    // outdenting a line already at zero), and `applyEdit`'s own "unchanged text is a refusal"
    // rule (source.ts) is what turns that into "post nothing" — no second no-op check is needed
    // here, same posture as `x` above.
    const line = source.split("\n")[current] ?? "";
    const text = indentedLine(line, effect.direction, effect.count, deps.declaration().indentUnit);
    const markdown = applyEdit(source, { kind: "set-line", lineIndex: current, text });
    if (markdown !== null) {
      // `existingLineCommit` — see the comment on the `x` handler above for why this no longer
      // builds the object by hand.
      deps.commitLine(v, existingLineCommit(source, current, markdown));
    }
  } else if (effect.kind === "word") {
    // `w`/`b`/`e` — `wordCaret` (app/present/word.ts) decides the column, from the SAME source
    // string every other motion here reads and from the cursor's CURRENT column, never a second
    // opinion parsed in this file. `null` means the selected line has no title at all (a bare
    // heading marker, a blank line, chrome with nothing after it) — "does nothing", per the
    // brief, so nothing moves and there is nothing to repaint.
    //
    // IT STAYS IN NORMAL. It used to end in `mode.enterInsert(offset)`, and the operator found
    // that by using it: "right now word jump also does insert. so i can't jump through it just
    // does first jump then wwww typed". A motion that changes the mode is a motion that cannot
    // repeat. `focus.lineIndex` is already `current`, so only the column moves.
    // THROUGH THE RESOLVER, WHICH CHANGES NO ANSWER HERE. `w`/`b`/`e` was one of the two gestures
    // already writing a correct column, and it was correct precisely because `wordCaret` answered
    // it before anything was written. `columnFor` now makes that call, so this file no longer holds
    // a second way to put a number into the focus surface. `moveTo` returns `wordCaret`'s own
    // "this line has no title at all", which is still the repaint test it always was.
    const line = source.split("\n")[current] ?? "";
    if (deps.focus.moveTo({ kind: "word", motion: effect.motion, count: effect.count }, line)) {
      deps.repaintCurrentView();
    }
  } else if (effect.kind === "column") {
    // `0`/`$` — the line's own ends, which need no grammar and no second module: `moveColumn`
    // clamps `line.length` down to the last character that exists, so `$` is stated as "past the
    // end" and lands on the end. See motions.ts for why these are the SOURCE line's ends and not
    // the title's.
    // The other gesture that was already right. `line.length` was this file computing a position,
    // which is the resolver's job even when the arithmetic is one property access — `line-end` says
    // what `$` MEANS and column.ts turns it into the last character that exists.
    const line = source.split("\n")[current] ?? "";
    deps.focus.moveTo({ kind: effect.to === "start" ? "line-start" : "line-end" }, line);
    deps.repaintCurrentView();
  } else {
    // "none" (a bare digit accumulating a count, or a refused `o`/`O`/`x` under a pending count)
    // or "enter-insert" (`i`/Enter/`a` — the mode itself already changed inside `handleKey`).
    // Repainting on "none" is a no-op repaint rather than a special case: it is what this
    // handler already did for every handled key before this slice, and a digit press or a
    // refused `3o` changes nothing a repaint would show differently.
    deps.repaintCurrentView();
  }
}

/**
 * THE SIDE EFFECT, KEPT SEPARATE FROM THE DECISION. The page calls this once; everything above is
 * reachable without it, which is what lets a test or a probe drive `globalKey` directly instead of
 * synthesising DOM events at a document that wired itself on import.
 */
export function installGlobalKeys(deps: GlobalKeyDeps, on: Document = document): void {
  on.addEventListener("keydown", (e) => globalKey(deps, e));
}

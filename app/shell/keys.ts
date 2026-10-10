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
import { existingLineCommit, revealSelection, visualLineOrder } from "./paint.js";
import type { LineCommit } from "./paint.js";
import { classifyLine } from "../present/express/rendition.js";
import { deleteLinesCommit, insertCommit, moveCommit } from "../present/register.js";
import type { LineRegister } from "../present/register.js";
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
  /** Open or close the `?` key help overlay. */
  readonly toggleHelp?: () => void;
  /** Open the `/` search box. */
  readonly openSearch?: () => void;
  /** `H` / Ctrl-o and `L` / Ctrl-i: the previous / next view (app/shell/viewhistory.ts). */
  readonly viewBack?: () => void;
  readonly viewForward?: () => void;
  /** The view `c` captures into (the inbox), or `undefined` when there is none. */
  readonly captureViewId?: () => string | undefined;
  /** Switch to a view, exactly as choosing it in the drawer does. */
  readonly chooseView?: (viewId: string) => void;
  /** The completion stamp a tick should add now — see `SetCheckbox.completion` (source.ts). */
  readonly completion?: () => { readonly token: string; readonly date: string } | undefined;
  readonly viewOf: (viewId: string) => GlobalKeyView | undefined;
  readonly currentViewId: () => string | null;
  readonly drawerIsOpen: () => boolean;
  readonly globalRegistrationFor: (viewId: string) => GlobalRegistration | undefined;
  readonly commitLine: (view: GlobalKeyView, commit: LineCommit) => void | Promise<void>;
  /** Undo / redo this view's last change, against the file on screen (app/present/undo.ts). Each
   *  posts its own edit and answers whether there was one. */
  readonly undo?: (view: GlobalKeyView, source: string) => boolean;
  readonly redo?: (view: GlobalKeyView, source: string) => boolean;
  /** What `dd`/`yy` hold for `p`/`P` (app/present/register.ts). Absent: `dd` deletes at once. */
  readonly register?: LineRegister;
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
  // A KEY SOMETHING ELSE ALREADY HANDLED IS NOT A COMMAND (2026-10-08, operator report: choosing a
  // view with Enter opened its first line for editing). The drawer, the search box and the
  // suggestion list each `preventDefault` the keys they act on.
  if (e.defaultPrevented) return;
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
  // THE WAY OUT OF A STRANDED INSERT (2026-10-07, measured twice in the live app): a line that is
  // discarded can leave the mode at INSERT with no line open — nothing then listens for Escape,
  // because every key below is gated on NORMAL and there is no `<input>` to own it. Escape with no
  // editor focused always returns to NORMAL. With an editor focused it is the editor's, unchanged.
  if (e.key === "Escape" && deps.mode.mode !== "NORMAL" && !typingIn(e.target)) {
    e.preventDefault();
    deps.mode.enterNormal();
    deps.repaintCurrentView();
    return;
  }
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
  let source = deps.showing(v.id, deps.sourceFor(v.path) ?? v.markdown);
  let current = deps.focus.lineIndex ?? 0;
  // ── `j`/`k`/`gg`/`G` MOVE THROUGH THE ROWS AS THEY ARE PAINTED, NOT THROUGH `source`'S OWN
  // LINE NUMBERS — the census this fixes: `settleRow` (app/shell/paint.ts) moves a row's DOM
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
  // THE EDITOR SHORTCUTS FOR UNDO AND REDO, beside vim's `u` / Ctrl-r. Cmd-r is left to the browser.
  const command = e.metaKey || e.ctrlKey;
  const historyKey =
    command && (e.key === "z" || e.key === "Z")
      ? (e.shiftKey ? "redo" : "undo")
      : e.ctrlKey && !e.metaKey && e.key === "r"
        ? "redo"
        : null;
  // VIM'S JUMP KEYS, Ctrl-o and Ctrl-i, step back and forward through views — the same as `H`/`L`.
  const jumpKey =
    e.ctrlKey && !e.metaKey && e.key === "o" ? "view-back" : e.ctrlKey && !e.metaKey && e.key === "i" ? "view-forward" : null;
  const outcome =
    jumpKey !== null
      ? { handled: true as const, effect: { kind: jumpKey } as const }
      : historyKey !== null
      ? { handled: true as const, effect: { kind: historyKey } as const }
      : command
        ? { handled: false as const, effect: { kind: "none" } as const }
        : deps.mode.handleKey(e.key, visualCurrent, visualLastIndex);
  if (!outcome.handled) return;
  e.preventDefault();
  // THE PAINTER STILL DOES NOT DECIDE. `mode.handleKey` is the one place a keystroke becomes a
  // position, a mode change, a new-line request or a checkbox toggle (app/present/motions.ts);
  // this is the thin DOM wiring the brief asks for — apply the outcome, repaint.
  // `repaintCurrentView`, not `paintView`: the latter forces NORMAL on the way in, which would
  // undo an `i`/`a`/`o`/`O` before its <input> ever drew.
  const effect = outcome.effect;
  // Lines `dd` marked stay marked through other edits; they are deleted when Cycle is pressed
  // (`flushMarks`, below — 2026-10-08, operator-directed: nothing reaches the engine until Cycle).
  const register = deps.register;
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
    revealSelection(deps.viewBody);
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
    revealSelection(deps.viewBody);
  } else if (effect.kind === "open") {
    // `o`/`O` — `openLine` is the SAME function Enter's mid-edit "open a line below" already
    // calls (app/shell/paint.ts's `openLineAt`), not a parallel implementation. It opens
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
  } else if (effect.kind === "capture") {
    // `c` — QUICK CAPTURE (2026-10-07). Go to the capture view (the inbox) if not already there,
    // and open a new line at its end — the SAME `openLine` `o` calls, so a captured line is seeded,
    // drafted and saved exactly as a line opened in the inbox by hand. Nothing here writes.
    const target = deps.captureViewId?.();
    if (target === undefined) return;
    if (target !== v.id) deps.chooseView?.(target);
    const tv = deps.viewOf(target);
    if (tv === undefined) return;
    const targetSource = deps.showing(tv.id, deps.sourceFor(tv.path) ?? tv.markdown);
    const lines = targetSource.split("\n");
    let end = lines.length;
    while (end > 0 && (lines[end - 1] ?? "").trim() === "") end -= 1;
    const opened = openLine(
      targetSource,
      end,
      deps.draftLine,
      undefined,
      deps.globalRegistrationFor(tv.id),
      tv.id,
    );
    if (opened) {
      deps.focus.blur();
      deps.mode.enterInsert();
    }
    deps.repaintCurrentView();
  } else if (effect.kind === "help") {
    deps.toggleHelp?.();
  } else if (effect.kind === "search") {
    deps.openSearch?.();
  } else if (effect.kind === "view-back") {
    deps.viewBack?.();
  } else if (effect.kind === "view-forward") {
    deps.viewForward?.();
  } else if (effect.kind === "toggle-done") {
    // `x` — reuses `applyEdit`'s existing `set-checkbox` case (source.ts). If the selected line
    // has no checkbox, `classifyLine` says so and nothing happens — no repaint, no POST, exactly
    // the brief's own rule for this key.
    //
    // THIS COMMENT USED TO SAY `x` POSTS "through the SAME write path a mouse click on the box
    // already uses (`commitLine`)", AND THAT IS FALSE — corrected 2026-08-14. A mouse click
    // reaches `paint.ts`'s `onCheckboxToggle`, which the page wires to `toggleTask`
    // (app/index.html), NOT to `commitLine`. The two are different functions with different
    // answers to a refused write: measured through the real page, a 409 makes ONE POST by mouse
    // and TWO by `x`, the second being the rebase this branch reaches and that one does not. See
    // `tests/app-one-write-path-per-act.test.mjs` and backlog `one-write-path-per-act`. The claim
    // was in the right place — beside the divergence — and simply wrong, which is worse than
    // absent: it reads as an assurance the paths are already one.
    const line = source.split("\n")[current] ?? "";
    const statuses = deps.declaration().qualification?.tokens["status"] as
      | Readonly<Record<string, string>>
      | undefined;
    const shape = classifyLine(line, statuses);
    if (shape.kind === "checkbox") {
      const completion = deps.completion?.();
      const markdown = applyEdit(source, {
        kind: "set-checkbox",
        lineIndex: current,
        checked: !shape.done,
        statuses,
        ...(completion === undefined ? {} : { completion }),
      });
      if (markdown !== null) {
        // `existingLineCommit` (app/shell/paint.ts), not a hand-built object — see its own
        // header for why: this line and the indent handler below are the two call sites that
        // shipped f448da2's regression by hand-rolling a `LineCommit` with `kind`/`source` left
        // out, in the one file TypeScript never checked. It checks this one.
        deps.commitLine(v, existingLineCommit(source, current, markdown));
      }
    }
  } else if (effect.kind === "delete-line" && register !== undefined) {
    // `dd` MARKS the line (or unmarks a marked one). Nothing is posted until the marks are
    // deleted together — see the block above and `flushMarks` below.
    const line = source.split("\n")[current] ?? "";
    if (applyEditable(source, current)) register.toggleMark(v.id, line);
    deps.repaintCurrentView();
  } else if (effect.kind === "undo" || effect.kind === "redo") {
    // `u` with marks pending takes the last mark off: it was never posted, so there is nothing
    // to undo on the server.
    if (effect.kind === "undo" && register?.unmarkLast(v.id) === true) {
      deps.repaintCurrentView();
      return;
    }
    (effect.kind === "undo" ? deps.undo : deps.redo)?.(v, source);
    deps.repaintCurrentView();
  } else if (effect.kind === "yank") {
    const line = source.split("\n")[current] ?? "";
    if (line.trim() !== "") register?.yank(line);
  } else if (effect.kind === "paste") {
    // `p` below, `P` above. A pending cut MOVES; otherwise the copied text becomes a NEW line.
    const to = effect.where === "below" ? current + 1 : current;
    const moving = register?.takeLast(v.id, source);
    if (register !== undefined && moving !== undefined) {
      const move = moveCommit(source, moving, to);
      if (move !== null) deps.commitLine(v, move);
    } else {
      const text = register?.copyText();
      const put = text === undefined ? null : insertCommit(source, to, text);
      if (put !== null) deps.commitLine(v, put);
    }
    deps.repaintCurrentView();
  } else if (effect.kind === "delete-line") {
    // `dd` — remove the selected line. `applyEdit` refuses a blank or heading line, so only a line
    // that is a node can go. The commit's `text` is EMPTY on purpose: a refused delete (409) then
    // takes `commitLine`'s heal branch and adopts the server's current file, rather than trying to
    // rebase a line that no longer exists. The operator presses `dd` again on what is now there.
    const markdown = applyEdit(source, { kind: "delete-line", lineIndex: current });
    if (markdown !== null) {
      deps.commitLine(v, { lineIndex: current, text: "", markdown, source, kind: "delete-line" });
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
  // A CLICK ON THE LINE THE CURSOR IS ALREADY ON EDITS IT (2026-10-08, operator report: on a phone
  // there was no way into INSERT at all). The first click on a line selects it, exactly as before;
  // a click on the SELECTED line is then the same `i` a keyboard would send, through the same
  // handler — so there is no second way into INSERT, only a second key that reaches the one there
  // is. A double-click is this too: its second click lands on the line the first one selected.
  //
  // IT REPLACES A TIMER. Until today two clicks within 450 ms were counted as a double-click. A
  // phone's tap, a slow second click and a click after reading the line all missed that window;
  // "is this line already selected" is the fact the timer was standing in for.
  //
  // IN THE CAPTURE PHASE (fixed 2026-10-08, measured live): the selected row has its own click
  // handler, which stops the click from bubbling, so a listener on the way UP never heard it.
  // Capture runs on the way DOWN, before the row's handler, while the row is still the selected one.
  //
  // `i` IS SENT WHILE THE CLICK IS STILL BEING HANDLED, which is what lets a phone open its
  // keyboard: a phone shows the keyboard only for a focus made during the person's own tap.
  if (typeof KeyboardEvent === "function") {
    deps.viewBody.addEventListener("click", (event) => {
      if (typingIn(event.target)) return;
      const row = (event.target as Element | null)?.closest?.(".vim-selected");
      if (row == null) return;
      // THE CARET GOES WHERE THE CLICK WAS, through the same `at` instruction the editor reports
      // as the caret moves. The NORMAL line is its exact source text, so the character offset
      // under the pointer is the column.
      const column = columnAtPoint(row, event.clientX, event.clientY);
      if (column !== null) deps.focus.moveTo({ kind: "at", column }, row.textContent ?? "");
      // THE CLICK ENDS HERE. The row's own click handler would otherwise run next and put the
      // cursor back at the line start, repainting away the editor `i` just opened.
      event.preventDefault();
      event.stopPropagation();
      globalKey(deps, new KeyboardEvent("keydown", { key: "i", cancelable: true }));
    }, true);
  }
}

/** The character offset within `row`'s text under the point, or `null` when the browser cannot say. */
function columnAtPoint(row: Element, x: number, y: number): number | null {
  const doc = row.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const position = doc.caretPositionFromPoint?.(x, y);
  const range = position == null ? doc.caretRangeFromPoint?.(x, y) : null;
  const node = position?.offsetNode ?? range?.startContainer;
  const offset = position?.offset ?? range?.startOffset;
  if (node == null || offset == null || !row.contains(node)) return null;
  let column = 0;
  const walker = doc.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
    if (text === node) return column + offset;
    column += text.textContent?.length ?? 0;
  }
  return null;
}

/** Whether `dd` may mark line `index`: a line with content that is not a heading. */
function applyEditable(source: string, index: number): boolean {
  const line = (source.split("\n")[index] ?? "").trim();
  return line !== "" && !/^#{1,6}\s/.test(line);
}

/**
 * Delete every marked line, in every view that has some — one write per view — called by the page
 * when Cycle is pressed, before the cycle runs (app/present/register.ts). Answers the writes.
 */
export function flushMarks(deps: GlobalKeyDeps): Promise<void> {
  const register = deps.register;
  if (register === undefined) return Promise.resolve();
  const sent: Array<void | Promise<void>> = [];
  for (const viewId of register.markedViews()) {
    const v = deps.viewOf(viewId);
    if (v === undefined) continue;
    const source = deps.showing(v.id, deps.sourceFor(v.path) ?? v.markdown);
    const removal = deleteLinesCommit(source, register.takeAll(v.id, source));
    if (removal !== null) sent.push(deps.commitLine(v, removal));
  }
  deps.repaintCurrentView();
  return Promise.all(sent).then(() => undefined);
}

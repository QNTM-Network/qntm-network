/**
 * The global keydown handler routes a movement gesture through `ModeSurface` — the scenario
 * `docs/architecture/classes.yaml`'s `movement` class needs in order to be checked against
 * anything at all.
 *
 *   flow-trace verify .
 *   flow-trace spotlight . --touching app/shell/keys
 *
 * ── WHY THIS SCENARIO EXISTS, AND WHY IT COULD NOT HAVE BEEN WRITTEN BEFORE TODAY ──
 *
 * `movement`'s own entry records the measurement that motivated it: `canonical-routing . --class
 * movement` read `classes_verified: 0`, `chains_observed: 0`. The class was declared and never
 * asked anything. The binding reason was not the class and not the tool — it was that the only
 * production caller of `ModeSurface.handleKey` lived inside `app/index.html`'s
 * `<script type="module">`, and flow-trace's JS capture is a node module-load hook that cannot
 * import an HTML document. There was no call edge for any scenario to observe, however it was
 * written.
 *
 * `app/shell/keys.ts` is that caller, in a module. This scenario is the falsifiable half of the
 * claim that moving it bought something: it drives the REAL handler and the real surfaces, so the
 * edge keys -> motions is enacted rather than asserted.
 *
 * ── THE GAP IT CLOSES IN THE EXISTING COVERAGE, WHICH IS THE MORE INTERESTING HALF ──
 *
 * `vim_gestures.ts` already exists and passes. It imports `ModeSurface`, `boundaryLine`,
 * `indentedLine` and `wordCaret` DIRECTLY and calls each one itself. That proves the four modules
 * behave; it proves nothing about the WIRING, because it re-implements the wiring in the scenario
 * rather than driving the app's. Its own capability note says as much — the gestures are "proven
 * only by tests/present-motions.test.mjs and tests/app-vim-wiring.test.mjs (node-test, not
 * flow-trace-observed)". While the wiring was in HTML that was the best available. It no longer
 * is, and a scenario that re-writes production logic is the "harness-only" shape
 * `canonical_routing.py` throws out by name.
 *
 * ── WHAT IT DRIVES ──
 *
 *   globalKey(deps, {key: "j"}) -> ModeSurface.handleKey        -- the decision, real
 *   globalKey                   -> visualLineOrder              -- the DOM's own row order, real
 *   globalKey(deps, {key: "x"}) -> classifyLine -> applyEdit    -- the edit path, both real
 *                               -> existingLineCommit           -- the LineCommit constructor
 *
 * `globalKey` is this scenario's own top-level call, so the edge INTO it is harness-only and
 * `canonical_routing.py` discards it — correctly. Every edge measured here is one `globalKey`
 * makes on its own behalf, which is the whole point: the immediate logical caller of
 * `ModeSurface.handleKey` is now an instrumented module rather than an HTML document.
 *
 * ── WHAT IS STUBBED, AND WHY THAT IS HONEST ──
 *
 * The page state `GlobalKeyDeps` carries is supplied here (there is no page in a scenario, and
 * `keys.ts` deliberately does not hold it — that is the shape the whole extraction preserves).
 * `ModeSurface`, `FocusSurface`, `DraftSurface`, `visualLineOrder`, `classifyLine`, `applyEdit`
 * and `existingLineCommit` are ALL real, imported from their own modules. Nothing here
 * substitutes for a decision; the stubs are the DOM node `visualLineOrder` reads children off and
 * the page callbacks that only record that they were called.
 */

import { globalKey } from "../../app/shell/keys.js";
import type { GlobalKeyDeps, GlobalKeyView } from "../../app/shell/keys.js";
import { ModeSurface } from "../../app/present/motions.js";
import { FocusSurface } from "../../app/present/focus.js";
import { DraftSurface } from "../../app/present/draft.js";
import { NOT_YET_DECLARED } from "../../app/present/context.js";
import type { LineCommit } from "../../app/present/paint.js";

const SOURCE = ["## Today", "- [ ] first", "- [ ] second", "- [ ] third"].join("\n");

const VIEW: GlobalKeyView = { id: "today", path: "today.md", markdown: SOURCE };

/** The smallest node `visualLineOrder` reads: `children`, each with `dataset.lineIndex`. */
class StubRow {
  readonly dataset: Record<string, string>;
  constructor(lineIndex: number) {
    this.dataset = { lineIndex: String(lineIndex) };
  }
}
class StubBody {
  readonly children: StubRow[];
  constructor(count: number) {
    this.children = Array.from({ length: count }, (_, i) => new StubRow(i));
  }
}

/** A keydown event narrowed to what the handler reads. `preventDefault` is counted, not ignored:
 * a handled key that never calls it would be the handler silently declining to own the key. */
function keyEvent(key: string): { event: KeyboardEvent; prevented: () => number } {
  let prevented = 0;
  const event = {
    key,
    target: null,
    preventDefault: () => {
      prevented += 1;
    },
  };
  return { event: event as unknown as KeyboardEvent, prevented: () => prevented };
}

export async function run(): Promise<void> {
  const focus = new FocusSurface();
  const mode = new ModeSurface();
  const draftLine = new DraftSurface();
  const commits: LineCommit[] = [];
  let repaints = 0;

  focus.focus(1, SOURCE, 0, VIEW.id);

  const deps: GlobalKeyDeps = {
    viewBody: new StubBody(4) as unknown as HTMLElement,
    focus,
    mode,
    draftLine,
    showing: (_view, served) => served,
    sourceFor: () => null,
    declaration: () => NOT_YET_DECLARED,
    viewOf: (viewId) => (viewId === VIEW.id ? VIEW : undefined),
    currentViewId: () => VIEW.id,
    drawerIsOpen: () => false,
    globalRegistrationFor: () => undefined,
    commitLine: (_view, commit) => {
      commits.push(commit);
    },
    repaintCurrentView: () => {
      repaints += 1;
    },
    drainPainted: () => {},
    openDrawer: () => {},
    closeDrawer: () => {},
  };

  // ── `j` — the movement gesture itself, decided by ModeSurface and applied to FocusSurface ──
  const down = keyEvent("j");
  globalKey(deps, down.event);
  if (focus.lineIndex !== 2) {
    throw new Error(`j did not move the selection down one line: lineIndex is ${focus.lineIndex}, expected 2`);
  }
  if (down.prevented() !== 1) {
    throw new Error("j was handled but never called preventDefault — the handler did not own the key");
  }

  // ── `k` — and back, so the edge is exercised in both directions rather than once ──
  globalKey(deps, keyEvent("k").event);
  if (focus.lineIndex !== 1) {
    throw new Error(`k did not move the selection back up: lineIndex is ${focus.lineIndex}, expected 1`);
  }

  // ── `x` — the edit path: classifyLine decides the line is a checkbox, applyEdit builds the new
  //    markdown, existingLineCommit builds the LineCommit the page used to hand-roll (f448da2).
  globalKey(deps, keyEvent("x").event);
  if (commits.length !== 1) {
    throw new Error(`x produced ${commits.length} commits, expected exactly one`);
  }
  const commit = commits[0];
  if (commit === undefined || commit.kind !== "set-line" || typeof commit.source !== "string") {
    throw new Error("x built a LineCommit missing `kind`/`source` — the f448da2 shape, in a file the compiler now reads");
  }
  if (commit.markdown === null || !commit.markdown.includes("- [x] first")) {
    throw new Error(`x did not tick the selected line: ${String(commit.markdown)}`);
  }

  if (repaints === 0) {
    throw new Error("no gesture reached repaintCurrentView — the handler decided nothing");
  }
}

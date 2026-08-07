/**
 * commitLine routes a resolver's own decision to paint — the scenario canonical-routing needs to
 * check `docs/architecture/classes.yaml`'s `commit-line-routing` class against `view-painted`.
 *
 *   flow-trace verify .
 *   flow-trace canonical-routing . --class commit-line-routing
 *
 * ── WHY THIS SCENARIO EXISTS ──
 *
 * `capture-rule-application`'s own note (classes.yaml) named the exact gap: "There is no
 * TypeScript-to-TypeScript call edge from any resolver into `paint.ts` at all ... Declaring
 * `governs_sinks: [view-painted]` here today would be FALSE ... It becomes true, and then
 * declarable, only once the connecting act — building a context, walking the registry, handing
 * the result to `paint` — moves out of `app/index.html` ... into a module under `app/`." That
 * move is `app/present/commit.ts`'s `createCommitLine` (see that module's own header). This
 * scenario is "the flow-trace scenario that would then drive it end to end" the same note
 * predicted, and it is the falsifiable half of that claim — the prose above is not the proof.
 *
 * ── WHAT IT DRIVES, IN THE ORDER THE APP PRODUCES IT ──
 *
 *   commitLine(view, commit) -> runResolvers(RESOLVERS, ctx)   -- the walk, real, all four axes
 *   runResolvers -> resolvers/ordering.read/arm                -- ONE axis actually decides something
 *                                                                  here: a fresh row sorts first
 *   commitLine -> armSettle(settle, ...)                        -- the real SettleSurface, armed
 *   commitLine -> deps.writeFile -> (stubbed: an accepted ack)
 *   commitLine -> deps.arrive -> paint(...)                     -- the sink, `view-painted`
 *
 * THE LAST EDGE IS THE ONE THIS SCENARIO EXISTS TO PROVE COUNTS. `deps.arrive` is supplied BY
 * THIS SCENARIO (there is no page here to supply the real one, and the real one is page-shaped —
 * see commit.ts's own header for why it stayed behind), but the call to it is NOT this scenario's
 * own top-level statement — it happens INSIDE `commitLine`'s own async continuation, gated behind
 * a real write actually having been accepted. `sinks.yaml`'s own survey named the failure mode
 * this must not reproduce: "every scenario calls paint()/mount() directly as its own top-level
 * driver" — discarded by `canonical_routing.py`'s immediate-caller gate as harness-only. This
 * scenario's `run()` calls `commitLine`, once; it never calls `paint` itself.
 *
 * ── WHY THE CHAIN IS GENUINE EVEN THOUGH `deps.arrive` LIVES IN THIS FILE, NOT IN A MODULE ──
 *
 * flow-trace's JS observer threads the logical caller through `AsyncLocalStorage`
 * (`tools/flow-trace/js/src/runtime.mjs`), set once per instrumented function and preserved
 * across `await`. Code in THIS file is not instrumented (`tests/flow_scenarios/` is outside
 * `.flow-trace.yaml`'s `include: [app]`), so calling into it and back out never touches that
 * store — it is transparent, the same way `app/index.html`'s own `paintView`/`repaintCurrentView`
 * are transparent in production. So when `deps.arrive` (running inside `commitLine`'s own async
 * continuation, after `await deps.writeFile(...)`) calls the real, instrumented `paint`, the
 * store still holds `commitLine`'s own frame — recorded as `paint`'s immediate logical caller.
 * `docs/architecture/classes.yaml`'s `commit-line-routing` row states this as a checked fact, not
 * an assumption; this comment is the argument for why the check is honest.
 *
 * ── WHAT IS STUBBED, AND WHY THAT IS HONEST (present_cascade.ts's own posture, restated) ──
 *
 * The DOM is a handful of objects carrying only what `paint()` touches. `deps.writeFile` never
 * makes a network call — it resolves immediately with `{ accepted: true }`, the ack shape
 * `commitLine`'s own `arrive` branch reads on the page. `RESOLVERS`, `runResolvers`, `armSettle`,
 * `armPredict`, `SettleSurface`, `PredictSurface` and `paint` are ALL real, imported from their
 * own modules — nothing here substitutes for any of them, and every call recorded is genuine.
 */

import { createCommitLine } from "../../app/present/commit.js";
import type { CommitLineDeps, CommitLineView } from "../../app/present/commit.js";
import { paint } from "../../app/present/paint.js";
import { PresentationContext } from "../../app/present/context.js";
import { SettleSurface } from "../../app/present/settle.js";
import { PredictSurface } from "../../app/present/predict.js";
import type { LineCommit } from "../../app/present/paint.js";
import type { CommitContext } from "../../app/present/resolve.js";

type Listener = () => void;

/** The smallest object that satisfies what paint() touches — `present_cascade.ts`'s own class,
 * restated here rather than imported, so this scenario has no dependency on a sibling scenario's
 * fixture surviving unrelated edits. */
class StubElement {
  tagName: string;
  className = "";
  type = "";
  value = "";
  focused = false;
  checked = false;
  innerHTML = "";
  textContent = "";
  readonly style: Record<string, string> = {};
  readonly children: StubElement[] = [];
  readonly #listeners = new Map<string, Listener[]>();

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  append(...nodes: StubElement[]): void {
    this.children.push(...nodes);
  }

  addEventListener(type: string, listener: Listener): void {
    const existing = this.#listeners.get(type) ?? [];
    existing.push(listener);
    this.#listeners.set(type, existing);
  }

  focus(): void {
    this.focused = true;
  }

  descendants(out: StubElement[] = []): StubElement[] {
    for (const child of this.children) {
      out.push(child);
      child.descendants(out);
    }
    return out;
  }
}

const markdown = {
  renderInline: (text: string): string => text,
  render: (text: string): string => text,
};

/** A DECLARED `queue_position` ordering — the SAME fixture shape
 * `tests/app-settle-wiring.test.mjs` §1 already proves arms a real placement through the real
 * `commitLine`, restated here so this scenario does not depend on a `.test.mjs` fixture (a
 * different module universe — flow-trace's node observer instruments `.ts` under `app/`, and a
 * `.mjs` under `tests/` would load unobserved either way, so nothing is lost by restating four
 * small objects rather than importing them). */
const QUALIFICATION = {
  defaultNodeType: "task",
  structuralNodeTypes: [] as string[],
  tokens: { node_type: {}, domain: {}, status: { "[ ]": "open", "[x]": "done" } },
  predicates: {},
  sections: {},
  sectionOrder: { demo: ["queue"] },
  refused: {},
};
const RESOLUTION = {
  ordering: {
    demo: { queue: { ordering: [{ field: "queue_position", direction: "asc" }], orderingMode: undefined, name: "Queue" } },
  },
  orderingFields: { queue_position: { token: "🔢", kind: "int" } },
  dayBoundary: { timezone: "Europe/London", dayStartHour: 4, weekStartsOn: "monday" },
};

// THE ROW IS TYPED WHERE A REAL `o`/Enter GESTURE WOULD LEAVE IT — appended after the two
// existing rows, at line 3, UNSORTED. Its `queue_position` (0) belongs before both — the
// ordering resolver's whole job is to notice that and arm a placement moving it there; a fixture
// that pre-sorted the row would prove nothing about the resolver, only about `paint`'s own
// rendering of a markdown string.
const VIEW: CommitLineView = { id: "demo", path: "demo.md" };
const BEFORE = ["## Queue", "- [ ] a [[qntm:1]] 🔢 1", "- [ ] b [[qntm:2]] 🔢 2"].join("\n");
const AFTER = [...BEFORE.split("\n"), "- [ ] c sorts first 🔢 0"].join("\n");
const COMMIT: LineCommit = {
  lineIndex: 3,
  text: "- [ ] c sorts first 🔢 0",
  markdown: AFTER,
  source: BEFORE,
  kind: "insert-line",
};

function buildContext(view: CommitLineView, commit: LineCommit): CommitContext {
  return {
    view,
    commit,
    declared: {
      structural: undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same hand-shaped
      // literal `app-settle-wiring.test.mjs` uses; the real type comes from a published document
      // this scenario does not fetch.
      qualification: QUALIFICATION as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolution: RESOLUTION as any,
      rules: undefined,
    },
    graph: null,
    now: () => Date.now(),
  };
}

export async function run(): Promise<void> {
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tagName: string): StubElement => new StubElement(tagName),
  };

  const settle = new SettleSurface();
  const predict = new PredictSurface();
  let painted: StubElement | null = null;
  let arrivedCount = 0;

  const deps: CommitLineDeps = {
    buildContext,
    reportAbstentions: () => {},
    settle,
    predict,
    queued: { drop: () => {} },
    drainPainted: () => {},
    // NEVER A NETWORK CALL — resolves immediately with the ack shape `commitLine`'s own `arrive`
    // branch on the page reads (`data.accepted === true`).
    writeFile: async () => ({ accepted: true, handle: "flow-trace", pending_edits: 0 }),
    // THE ONE CALL THIS SCENARIO EXISTS TO MAKE OBSERVABLE — see this file's own header for why
    // it is genuine despite living here rather than in a module.
    arrive: (_path, data, write) => {
      arrivedCount += 1;
      if ((data as { accepted?: boolean })?.accepted !== true) {
        return "ignored";
      }
      const body = new StubElement("article");
      paint(body as unknown as HTMLElement, write.markdown, new PresentationContext(), {
        markdown,
        settle,
        predict,
      });
      painted = body;
      return "accepted";
    },
    healFromRefusal: () => false,
    writes: { concludeGiveUp: () => {}, giveUp: () => {} },
    repaintArrived: () => {},
  };

  const commitLine = createCommitLine(deps);
  await commitLine(VIEW, COMMIT);

  if (arrivedCount !== 1) {
    throw new Error(`expected exactly one arrive() call, got ${arrivedCount}`);
  }
  if (painted === null) {
    throw new Error("commitLine never reached paint() — the routing chain this scenario exists to prove did not run");
  }
  const rows = (painted as StubElement).descendants().filter((el) => el.tagName === "label");
  if (rows.length !== 3) {
    throw new Error(`expected three rows painted (heading excluded), got ${rows.length}`);
  }
  // THE ORDERING RESOLVER'S OWN DECISION, VISIBLE IN WHAT GOT PAINTED — "c sorts first" is
  // typed at line 0 already (this scenario commits it there directly, unlike a real `o`/Enter
  // gesture which would open it after the row the cursor was on); the load-bearing fact is that
  // `armSettle` was reached with a REAL placement, checked directly rather than inferred from
  // paint order alone, which a browser's own capture-then-repaint could satisfy by coincidence.
  const armed = settle.take(AFTER, VIEW.id);
  if (armed.length === 0) {
    throw new Error("the ordering resolver armed no placement — this scenario proves nothing about a resolver's own reach");
  }
}

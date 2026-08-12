/**
 * insert_exit_column — DOES THE COLUMN FOLLOW THE OPERATOR WHILE HE IS IN INSERT?
 *
 * A DELIBERATE RED, the sibling of `insert_column_writeback.ts`. It FAILs on unmodified main and is
 * expected to keep failing until the operator decides how leaving INSERT should behave. Do not
 * loosen it to fit an implementation.
 *
 * ── WHAT THE OPERATOR REPORTED, AND WHAT MEASURING IT FOUND ──
 *
 * "Largely working. But pressing o and a and enter and escape various combinations doesn't land
 * where we expect." — using the deployed app, 2026-08-12, after #165.
 *
 * The single gestures ARE right; #165 fixed those. The full entry x typed x exit matrix was then
 * measured through app/index.html's own wiring (`__focusColumn()` against the painted input's real
 * `selectionStart`), and the crossing fails for ONE SHAPE AT THREE MOMENTS rather than for three
 * unrelated reasons:
 *
 *   THE COLUMN IS RESOLVED EXACTLY ONCE, WHEN A `rawInput` ROW IS PAINTED, AND NEVER AGAIN.
 *
 *     moment 1 — AS HE TYPES. Every cell of the matrix: the caret runs to 10, 16, 17 while the
 *                surface still reports the column the row OPENED at. `a` at column 0, type two
 *                characters, Escape: caret 3, column 1.
 *     moment 2 — WHEN HE LEAVES. `discard()` (Escape from `i`/`a`) calls `leaveInsert()` and
 *                repaints; it never touches the focus surface. Vim moves the cursor one column
 *                LEFT on leaving INSERT — INSERT sits between characters, NORMAL sits on one — and
 *                nothing here carries that instruction.
 *     moment 3 — WHEN A DRAFT OPENS. `o`/`O` place their caret in `paintDraft`, which is the OTHER
 *                caret path and does not go through `columnFor` at all. Measured: caret 6 (past the
 *                `- [ ] ` seed) with the surface reporting column 0, from EVERY starting column.
 *
 * WHY #165 DID NOT CATCH THIS, WHICH IS A FINDING ABOUT ITS ENFORCER AND NOT ONLY ABOUT THE CODE.
 * `insert_column_writeback.ts` asserts the column at the moment the row is OPENED, and that is
 * exactly the one moment the wiring got right. A green enforcer sat on top of a half-closed defect
 * because the assertion and the fix shared the same blind spot. This scenario asserts the other
 * three moments.
 *
 * ── WHAT IS ASSERTED HERE, AND THE ONE THING DELIBERATELY NOT ASSERTED ──
 *
 * This pins moment 1 — the column must follow the caret while the row is open — because that one
 * needs no decision from anybody: a surface that claims to hold where the cursor is, and reports a
 * position the operator left ten characters ago, is wrong under every editor's rules.
 *
 * IT DOES NOT PIN MOMENT 2's DIRECTION. Whether leaving INSERT should step one column left is
 * VIM's rule, and this is the operator's editor, not vim. The matrix reports what happens; the
 * choice is his. Pinning a direction here would be this scenario deciding a design question by
 * being red about it.
 */

import { ModeSurface } from "../../app/present/motions.js";
import { FocusSurface } from "../../app/present/focus.js";
import { PresentationContext } from "../../app/present/context.js";
import { paint } from "../../app/present/paint.js";

const LINE = "- [ ] first task [[qntm:1]] #task";
const SOURCE = ["# This Week", LINE].join("\n");
const LINE_INDEX = 1;

export function run(): void {
  assertTheColumnFollowsTheCaretWhileOpen();
}

/**
 * THE PIN. Opens a row with `a` through the real painter, types into it the way a person does, and
 * asks the surface where it thinks the cursor is.
 */
function assertTheColumnFollowsTheCaretWhileOpen(): void {
  const focus = new FocusSurface();
  const mode = new ModeSurface();
  const body = stubBody();

  focus.focus(LINE_INDEX, SOURCE, "");
  mode.enterInsert("append");
  paint(body, SOURCE, new PresentationContext(), { markdown: markdownStub(), focus, mode } as never);

  const input = firstInput(body);
  if (input === null) {
    throw new Error("the paint opened no editable row, so there is no caret to follow");
  }
  const caretAtOpen = input.selectionStart;
  if (focus.column !== caretAtOpen) {
    throw new Error(
      `the column did not match the caret even at OPEN — ${focus.column} vs ${caretAtOpen}. ` +
        "That is insert_column_writeback.ts's claim and it should be green; this scenario is " +
        "about what happens AFTER.",
    );
  }

  // THE OPERATOR TYPES. This is what an `<input>` does on every keystroke: the value grows and the
  // caret moves with it. Nothing here is a gesture the app has to interpret — it is the browser.
  const typed = "HELLO";
  input.value = input.value.slice(0, caretAtOpen) + typed + input.value.slice(caretAtOpen);
  input.selectionStart = caretAtOpen + typed.length;
  // A REAL EVENT, so a fix has something to hook. A browser fires `input` on every keystroke; if
  // this scenario only mutated the fields, no possible implementation could react to it and the
  // red could never go green — which is not an enforcer, it is a comment that costs CI time.
  input.dispatch("input");

  if (focus.column !== input.selectionStart) {
    throw new Error(
      "THE COLUMN DOES NOT FOLLOW THE CARET WHILE THE ROW IS OPEN. " +
        `After \`a\` opened the row at column ${caretAtOpen} and ${typed.length} characters were ` +
        `typed, the caret is at ${input.selectionStart} and FocusSurface.column still reports ` +
        `${focus.column} — the position the row OPENED at, ${typed.length} characters ago. ` +
        "`FocusSurface` is declared as the one place that holds where the cursor is " +
        "(classes.yaml, `cursor-position`). The column is resolved once, when the row is painted, " +
        "and never again: not as he types, not when he leaves (`discard()` never touches the " +
        "surface), and not when a draft opens (`o`/`O` place their caret in `paintDraft`, which " +
        "does not go through `columnFor` at all — measured at caret 6, column 0). " +
        "THIS IS A DELIBERATE PIN — the operator has not chosen a fix. Do not loosen it.",
    );
  }
}

/** The painter renders through markdown-it; only these two methods are reached. */
function markdownStub(): unknown {
  return { render: (m: string) => m, renderInline: (m: string) => m };
}

/** The minimum `paint` writes into: a body that collects children, over a stub document. */
function stubBody(): HTMLElement {
  interface Stub {
    tagName: string; type: string; value: string; className: string;
    selectionStart: number; children: Stub[]; dataset: Record<string, string>;
    style: Record<string, string>; innerHTML: string; textContent: string;
    append: (...k: Stub[]) => void; appendChild: (k: Stub) => Stub;
    listeners: Map<string, ((e: unknown) => void)[]>;
    addEventListener: (t: string, fn: (e: unknown) => void) => void;
    dispatch: (t: string, e?: unknown) => void;
    setAttribute: () => void; removeAttribute: () => void;
    focus: () => void; setSelectionRange: (a: number) => void;
    remove: () => void; contains: () => boolean; querySelector: () => null;
    querySelectorAll: () => Stub[]; closest: () => null; getAttribute: () => null;
    classList: { add: () => void; remove: () => void; contains: () => boolean; toggle: () => void };
  }
  const make = (tagName = "div"): Stub => {
    const el: Stub = {
      tagName, type: "", value: "", className: "", selectionStart: -1,
      children: [], dataset: {}, style: {}, innerHTML: "", textContent: "",
      append(...kids) { el.children.push(...kids); },
      appendChild(kid) { el.children.push(kid); return kid; },
      listeners: new Map(),
      addEventListener(t, fn) {
        const cur = el.listeners.get(t) ?? [];
        cur.push(fn);
        el.listeners.set(t, cur);
      },
      dispatch(t, e) {
        for (const fn of el.listeners.get(t) ?? []) {
          fn(e ?? { preventDefault() {}, stopPropagation() {}, target: el });
        }
      },
      setAttribute() {}, removeAttribute() {},
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

/** The first text `<input>` the paint produced — the row `a` opened. */
function firstInput(node: unknown): { selectionStart: number; value: string; dispatch: (t: string, e?: unknown) => void } | null {
  const el = node as { tagName?: string; type?: string; children?: unknown[] };
  if (el.tagName === "input" && el.type === "text") {
    return el as unknown as { selectionStart: number; value: string; dispatch: (t: string, e?: unknown) => void };
  }
  for (const kid of el.children ?? []) {
    const found = firstInput(kid);
    if (found !== null) return found;
  }
  return null;
}

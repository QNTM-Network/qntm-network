/**
 * The touch bar — vim's keys as buttons, for a phone (2026-10-08, operator report: "I don't think I
 * can enter at all as only normal mode and can't enter keyboard").
 *
 * A phone has no `i`, no Escape and no `>`. This bar gives them back, and it is not a second way to
 * edit: every button PRESSES A KEY through the handler a keyboard already reaches. In NORMAL that
 * is `globalKey` (app/shell/keys.ts); in INSERT it is the line editor's own keydown handler, or —
 * for a character like `#` — the editor's own text, followed by the `input` event that the
 * completer and the editor already listen for. What a key does stays decided in one place.
 *
 * WHICH BUTTONS SHOW is the mode: `data-mode` on the bar, set by the page with the mode badge.
 *
 * THE LINE EDITOR KEEPS FOCUS. A tap on a button would normally move focus to the button, and a
 * line editor that loses focus saves and closes. `mousedown`'s default is what moves focus, so it
 * is prevented; the action runs on `click`.
 *
 * THE BAR SITS ABOVE THE PHONE'S KEYBOARD. A phone keyboard covers the bottom of the page without
 * resizing it; `visualViewport` says how much is covered, and the bar moves up by that much.
 */

export type BarMode = "NORMAL" | "INSERT";

export interface TouchKey {
  /** What the button shows. */
  readonly label: string;
  /** What a screen reader says. */
  readonly name: string;
  /** The modes the button shows in. */
  readonly modes: readonly BarMode[];
  /** The keys it presses, in order (`dd` is two). */
  readonly keys?: readonly string[];
  readonly shift?: boolean;
  /** Or: characters it types into the line being edited. */
  readonly text?: string;
}

/** The buttons, in order. Each one is a key from the key help (app/present/keyhelp.ts). */
export const TOUCH_KEYS: readonly TouchKey[] = [
  { label: "Edit", name: "Edit the line, at the end (A)", modes: ["NORMAL"], keys: ["A"] },
  { label: "+ Line", name: "New line below (o)", modes: ["NORMAL"], keys: ["o"] },
  { label: "✓", name: "Tick or untick (x)", modes: ["NORMAL"], keys: ["x"] },
  { label: "→", name: "Indent (>)", modes: ["NORMAL"], keys: [">"] },
  { label: "←", name: "Outdent (<)", modes: ["NORMAL"], keys: ["<"] },
  { label: "Del", name: "Mark for deletion on Cycle (dd)", modes: ["NORMAL"], keys: ["d", "d"] },
  { label: "Undo", name: "Undo (u)", modes: ["NORMAL"], keys: ["u"] },
  { label: "Find", name: "Search (/)", modes: ["NORMAL"], keys: ["/"] },
  { label: "Done", name: "Save the line and stop editing (Escape)", modes: ["INSERT"], keys: ["Escape"] },
  { label: "+ Line", name: "Save and start a new line below (Shift+Enter)", modes: ["INSERT"], keys: ["Enter"], shift: true },
  { label: "#", name: "Tag", modes: ["INSERT"], text: "#" },
  { label: ":", name: "Marker by name", modes: ["INSERT"], text: ":" },
  { label: "[[", name: "Link", modes: ["INSERT"], text: "[[" },
];

export interface TouchBarDeps {
  readonly bar: HTMLElement;
  /** The element the views paint into — the line editor, when there is one, is inside it. */
  readonly viewBody: HTMLElement;
  /** A key pressed in NORMAL — the page passes `globalKey` with its deps. */
  readonly pressNormal: (event: KeyboardEvent) => void;
  readonly mode: () => BarMode;
}

const lineEditorIn = (body: HTMLElement): HTMLTextAreaElement | null =>
  body.querySelector("textarea.rawline");

export function installTouchBar(deps: TouchBarDeps): void {
  const doc = deps.bar.ownerDocument ?? document;
  for (const key of TOUCH_KEYS) {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "touchkey";
    button.textContent = key.label;
    button.setAttribute("aria-label", key.name);
    button.setAttribute("data-modes", key.modes.join(" "));
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => press(key));
    deps.bar.append(button);
  }

  const press = (key: TouchKey): void => {
    const editor = lineEditorIn(deps.viewBody);
    if (deps.mode() === "INSERT" && editor !== null) {
      if (key.text !== undefined) {
        const start = editor.selectionStart ?? editor.value.length;
        const end = editor.selectionEnd ?? start;
        editor.setRangeText(key.text, start, end, "end");
        editor.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      for (const name of key.keys ?? []) {
        editor.dispatchEvent(
          new KeyboardEvent("keydown", { key: name, shiftKey: key.shift === true, bubbles: true, cancelable: true }),
        );
      }
      return;
    }
    for (const name of key.keys ?? []) {
      deps.pressNormal(new KeyboardEvent("keydown", { key: name, shiftKey: key.shift === true, cancelable: true }));
    }
  };

  // ABOVE THE KEYBOARD. `visualViewport` is the part of the page the person can see; whatever of
  // the layout viewport is below it is covered by the keyboard.
  const viewport = doc.defaultView?.visualViewport;
  if (viewport != null) {
    const place = (): void => {
      const covered = (doc.defaultView?.innerHeight ?? 0) - viewport.height - viewport.offsetTop;
      deps.bar.style?.setProperty?.("--kb", `${Math.max(0, Math.round(covered))}px`);
    };
    viewport.addEventListener("resize", place);
    viewport.addEventListener("scroll", place);
    place();
  }
}

/** The page calls this whenever the mode badge changes, so the bar shows that mode's buttons. */
export function showTouchMode(bar: HTMLElement, mode: BarMode): void {
  bar.setAttribute?.("data-mode", mode);
}

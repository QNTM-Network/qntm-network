/**
 * The completer — the DOM half of "suggest while typing" (2026-10-07, operator-directed).
 *
 * While a line is being edited, each keystroke asks the page's completion sources
 * (`app/present/completion.ts`: tags, dates, …) whether they have something for the caret. The
 * first answer is shown as a short list under the line. ↑/↓ move, Tab or Enter take the highlighted
 * item, Escape closes only the list (the line stays open), a click takes an item. WHAT is offered
 * and WHAT the text becomes is the sources' and `applyCompletion`'s; this module only shows the
 * list and routes keys to it.
 *
 * IT TOUCHES NO EDITOR. It listens on the view body for `input` and `keydown` from any
 * `textarea.rawline` — the existing-line editor and the new-line editor alike — so neither knows it
 * exists. Its key listener runs in the CAPTURE phase, before the input's own Enter/Escape handling,
 * and swallows only the keys it used, only while its list is open. The list element is made on
 * first use, so installing touches nothing.
 */

import { applyCompletion, completeWith, type Completion, type CompletionSource } from "../present/completion.js";

export interface CompleterDeps {
  /** The element the views paint into — the completer listens here and nowhere else. */
  readonly viewBody: HTMLElement;
  /** The current sources, read fresh on every keystroke so a new declaration is picked up. */
  readonly sources: () => readonly CompletionSource[];
}

const isLineEditor = (target: EventTarget | null): target is HTMLTextAreaElement =>
  typeof HTMLTextAreaElement !== "undefined" &&
  target instanceof HTMLTextAreaElement &&
  target.classList.contains("rawline");

/**
 * Put `list` under `editor`, or above it when the visible area has no room below — the visible
 * area, not the window: on a phone the keyboard covers the bottom of the window, and
 * `visualViewport` says where the part a person can see ends. Kept inside the screen sideways.
 */
export function placeSuggestionList(list: HTMLElement, editor: HTMLElement): void {
  const view = editor.ownerDocument.defaultView;
  const box = editor.getBoundingClientRect();
  const visual = view?.visualViewport;
  const visibleTop = visual ? visual.offsetTop : 0;
  const visibleBottom = visual ? visual.offsetTop + visual.height : (view?.innerHeight ?? 0);
  const visibleRight = visual ? visual.offsetLeft + visual.width : (view?.innerWidth ?? 0);
  const gap = 6;
  const height = list.offsetHeight;
  const below = visibleBottom - box.bottom - gap;
  const above = box.top - visibleTop - gap;
  const top = height <= below || below >= above ? box.bottom + gap : box.top - gap - Math.min(height, above);
  const left = Math.max(8, Math.min(box.left, visibleRight - list.offsetWidth - 8));
  list.style.top = `${Math.round(top)}px`;
  list.style.left = `${Math.round(left)}px`;
  list.style.maxHeight = `${Math.max(96, Math.round(Math.min(256, top >= box.bottom ? below : above)))}px`;
}

export function installCompleter(deps: CompleterDeps): void {
  let made: HTMLUListElement | null = null;
  const listEl = (doc: Document): HTMLUListElement => {
    if (made !== null) return made;
    made = doc.createElement("ul");
    made.className = "tag-picker";
    made.setAttribute("role", "listbox");
    made.setAttribute("aria-label", "Suggestions");
    made.hidden = true;
    doc.body.append(made);
    return made;
  };
  const isOpen = (): boolean => made !== null && !made.hidden;

  let active: HTMLTextAreaElement | null = null;
  let offer: Completion | null = null;
  let selected = 0;

  const close = (): void => {
    if (made !== null) made.hidden = true;
    offer = null;
    if (following !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(following);
    following = null;
  };

  // THE LIST FOLLOWS ITS LINE (2026-10-10, operator screenshots from an iPhone and a Mac: the list
  // sat where the line USED to be, or ran off the bottom of the screen). It was placed once, when it
  // opened. Now, every frame while it is open, it is placed again from where the editor is — so a
  // scroll, the phone keyboard opening, or the editor growing a line moves it with the line — and it
  // closes the moment its editor is gone or no longer focused (leaving INSERT by a repaint removes
  // the editor without a `focusout` the browser always reports).
  let following: number | null = null;
  const follow = (): void => {
    following = null;
    if (!isOpen() || active === null) return;
    if (!active.isConnected || active.ownerDocument.activeElement !== active) {
      close();
      return;
    }
    placeSuggestionList(made!, active);
    following = requestAnimationFrame(follow);
  };

  const accept = (index: number): void => {
    const item = offer?.items[index];
    if (active === null || offer === null || item === undefined) return;
    const out = applyCompletion(active.value, offer, item.insert);
    active.value = out.text;
    active.setSelectionRange(out.caret, out.caret);
    close();
    // The editor's own `input` listener keeps its caret bookkeeping in step with what changed.
    active.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const render = (): void => {
    if (active === null || offer === null) return;
    const list = listEl(active.ownerDocument);
    list.replaceChildren(
      ...offer.items.map((item, index) => {
        const row = active!.ownerDocument.createElement("li");
        row.textContent = item.label;
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", String(index === selected));
        // `mousedown`, not `click`: it lands before the input loses focus, so the line stays open.
        row.addEventListener("mousedown", (event) => {
          event.preventDefault();
          accept(index);
        });
        return row;
      }),
    );
    list.hidden = false;
    placeSuggestionList(list, active);
    if (following === null && typeof requestAnimationFrame === "function") following = requestAnimationFrame(follow);
  };

  const refresh = (input: HTMLTextAreaElement): void => {
    active = input;
    offer = completeWith(deps.sources(), input.value, input.selectionStart ?? input.value.length);
    if (offer === null) {
      close();
      return;
    }
    selected = Math.min(selected, offer.items.length - 1);
    render();
  };

  deps.viewBody.addEventListener("input", (event) => {
    if (!isLineEditor(event.target)) return;
    selected = 0;
    refresh(event.target);
  });

  deps.viewBody.addEventListener(
    "keydown",
    (event) => {
      if (!isOpen() || event.target !== active || offer === null) return;
      const count = offer.items.length;
      const key = (event as KeyboardEvent).key;
      if (key === "ArrowDown") {
        selected = (selected + 1) % count;
        render();
      } else if (key === "ArrowUp") {
        selected = (selected - 1 + count) % count;
        render();
      } else if (key === "Tab") {
        accept(selected);
      } else if (key === "Enter") {
        // THE HIGHLIGHTED OPTION IS ALREADY THE CHOICE (2026-10-08, operator-asked: "enter twice
        // ... doesn't feel natural"). Enter takes it AND goes on to the editor's own Enter, which
        // saves the line — so a tag or a date typed last costs one Enter, not two.
        accept(selected);
        return;
      } else if (key === "Escape") {
        close();
      } else {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  deps.viewBody.addEventListener("focusout", (event) => {
    if (event.target === active) close();
  });
}

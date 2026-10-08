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
 * `input.rawline` — the existing-line editor and the new-line editor alike — so neither knows it
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

const isLineEditor = (target: EventTarget | null): target is HTMLInputElement =>
  typeof HTMLInputElement !== "undefined" &&
  target instanceof HTMLInputElement &&
  target.classList.contains("rawline");

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

  let active: HTMLInputElement | null = null;
  let offer: Completion | null = null;
  let selected = 0;

  const close = (): void => {
    if (made !== null) made.hidden = true;
    offer = null;
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
    const box = active.getBoundingClientRect();
    list.style.left = `${Math.round(box.left)}px`;
    list.style.top = `${Math.round(box.bottom + 4)}px`;
    list.hidden = false;
  };

  const refresh = (input: HTMLInputElement): void => {
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

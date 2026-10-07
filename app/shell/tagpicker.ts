/**
 * The tag picker — the DOM half of tag completion (2026-10-07, operator-directed).
 *
 * Typing `#` in a line being edited opens a short list of the config's tags matching what follows
 * it. ↑/↓ move, Tab or Enter take the highlighted tag, Escape closes the list (and only the list —
 * the line stays open), a click takes a tag. Everything about WHICH tags and WHAT the text becomes
 * is `app/present/tagcomplete.ts`; this module only shows the list and routes keys to it.
 *
 * IT TOUCHES NO EDITOR. It listens on the view body for `input` and `keydown` from any
 * `input.rawline` — the existing-line editor and the new-line editor alike — so neither of them
 * knows it exists. Its key listener runs in the CAPTURE phase, before the input's own Enter/Escape
 * handling, and swallows only the keys it used, only while its list is open. With the list closed,
 * every key reaches the editor exactly as before.
 */

import { applyTag, matchingTags, tagQueryAt, type TagQuery } from "../present/tagcomplete.js";

export interface TagPickerDeps {
  /** The element the views paint into — the picker listens here and nowhere else. */
  readonly viewBody: HTMLElement;
  /** The current vocabulary, read fresh each time so a new declaration is picked up. */
  readonly vocabulary: () => readonly string[];
}

const isLineEditor = (target: EventTarget | null): target is HTMLInputElement =>
  typeof HTMLInputElement !== "undefined" &&
  target instanceof HTMLInputElement &&
  target.classList.contains("rawline");

export function installTagPicker(deps: TagPickerDeps): void {
  // THE LIST IS MADE ON FIRST USE, NOT AT INSTALL. Installing must cost nothing and touch nothing,
  // so a page loaded without a full document (the test harness's stub DOM) is unaffected; the
  // list only comes into being the first time a `#word` is typed into a real input.
  let made: HTMLUListElement | null = null;
  const listEl = (doc: Document): HTMLUListElement => {
    if (made !== null) return made;
    made = doc.createElement("ul");
    made.className = "tag-picker";
    made.setAttribute("role", "listbox");
    made.setAttribute("aria-label", "Tags");
    made.hidden = true;
    doc.body.append(made);
    return made;
  };
  const isOpen = (): boolean => made !== null && !made.hidden;

  let active: HTMLInputElement | null = null;
  let query: TagQuery | null = null;
  let items: readonly string[] = [];
  let selected = 0;

  const close = (): void => {
    if (made !== null) made.hidden = true;
    items = [];
    query = null;
  };

  const accept = (index: number): void => {
    const tag = items[index];
    if (active === null || query === null || tag === undefined) return;
    const out = applyTag(active.value, query, tag);
    active.value = out.text;
    active.setSelectionRange(out.caret, out.caret);
    close();
    // The editor's own `input` listener keeps its caret bookkeeping in step with what changed.
    active.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const render = (): void => {
    if (active === null) return;
    const doc = active.ownerDocument;
    const list = listEl(doc);
    list.replaceChildren(
      ...items.map((tag, index) => {
        const item = doc.createElement("li");
        item.textContent = tag;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(index === selected));
        // `mousedown`, not `click`: it lands before the input loses focus, so the line stays open.
        item.addEventListener("mousedown", (event) => {
          event.preventDefault();
          accept(index);
        });
        return item;
      }),
    );
    const box = active.getBoundingClientRect();
    list.style.left = `${Math.round(box.left)}px`;
    list.style.top = `${Math.round(box.bottom + 4)}px`;
    list.hidden = false;
  };

  const refresh = (input: HTMLInputElement): void => {
    active = input;
    query = tagQueryAt(input.value, input.selectionStart ?? input.value.length);
    items = query === null ? [] : matchingTags(deps.vocabulary(), query);
    if (items.length === 0) {
      close();
      return;
    }
    selected = Math.min(selected, items.length - 1);
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
      if (!isOpen() || event.target !== active || items.length === 0) return;
      const key = (event as KeyboardEvent).key;
      if (key === "ArrowDown") {
        selected = (selected + 1) % items.length;
        render();
      } else if (key === "ArrowUp") {
        selected = (selected - 1 + items.length) % items.length;
        render();
      } else if (key === "Tab" || key === "Enter") {
        accept(selected);
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

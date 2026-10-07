/**
 * The `?` overlay — every key, read from `KEY_HELP` (2026-10-07, operator-directed).
 *
 * Returns a toggle. The overlay element is made on first open, so installing touches nothing;
 * Escape or `?` again or a click on the backdrop closes it.
 */

import { KEY_HELP } from "../present/keyhelp.js";

export function installKeyHelp(doc: Document = document): () => void {
  let overlay: HTMLElement | null = null;

  const close = (): void => {
    if (overlay !== null) overlay.hidden = true;
  };

  const make = (): HTMLElement => {
    const root = doc.createElement("div");
    root.className = "key-help";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Keyboard help");
    const panel = doc.createElement("div");
    panel.className = "key-help-panel";
    const heading = doc.createElement("h2");
    heading.textContent = "Keys";
    panel.append(heading);
    for (const group of KEY_HELP) {
      const title = doc.createElement("h3");
      title.textContent = group.title;
      const table = doc.createElement("dl");
      for (const row of group.rows) {
        const dt = doc.createElement("dt");
        for (const key of row.keys) {
          const kbd = doc.createElement("kbd");
          kbd.textContent = key;
          dt.append(kbd);
        }
        const dd = doc.createElement("dd");
        dd.textContent = row.does;
        table.append(dt, dd);
      }
      panel.append(title, table);
    }
    root.append(panel);
    root.addEventListener("click", (event) => {
      if (event.target === root) close();
    });
    doc.addEventListener(
      "keydown",
      (event) => {
        if (root.hidden) return;
        if (event.key === "Escape" || event.key === "?") {
          event.preventDefault();
          event.stopImmediatePropagation();
          close();
        }
      },
      true,
    );
    doc.body.append(root);
    return root;
  };

  return () => {
    if (overlay === null) {
      overlay = make();
      return;
    }
    overlay.hidden = !overlay.hidden;
  };
}

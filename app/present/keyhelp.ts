/**
 * What every key does — the data behind the `?` overlay (2026-10-07, operator-directed).
 *
 * PURE DATA. `tests/present-keyhelp.test.mjs` reads `motions.ts` and fails if a key it binds is
 * missing here, so the help cannot quietly fall behind the keys.
 */

export interface KeyHelpRow {
  readonly keys: readonly string[];
  readonly does: string;
}

export interface KeyHelpGroup {
  readonly title: string;
  readonly rows: readonly KeyHelpRow[];
}

export const KEY_HELP: readonly KeyHelpGroup[] = [
  {
    title: "Move",
    rows: [
      { keys: ["j", "↓"], does: "Next line" },
      { keys: ["k", "↑"], does: "Previous line" },
      { keys: ["gg", "G"], does: "First / last line" },
      { keys: ["{", "}"], does: "Previous / next section" },
      { keys: ["w", "b", "e"], does: "Next word / back a word / end of word" },
      { keys: ["0", "$"], does: "Start / end of the line" },
      { keys: ["3j"], does: "A number before a move repeats it" },
    ],
  },
  {
    title: "Edit",
    rows: [
      { keys: ["i", "Enter"], does: "Edit the line (cursor where it is)" },
      { keys: ["a"], does: "Edit the line, after the cursor" },
      { keys: ["A"], does: "Edit the line, at the end" },
      { keys: ["click twice"], does: "Edit the line you clicked" },
      { keys: ["o", "O"], does: "New line below / above" },
      { keys: ["c"], does: "Capture a new line into the Inbox, from any view" },
      { keys: ["x"], does: "Tick / untick (adds or removes ✅ today)" },
      { keys: ["dd"], does: "Cut the line (p puts it back elsewhere; any other edit deletes it)" },
      { keys: ["yy"], does: "Copy the line" },
      { keys: ["u", "⌘Z"], does: "Undo this view's last change" },
      { keys: ["Ctrl-r", "⇧⌘Z"], does: "Redo" },
      { keys: ["p", "P"], does: "Put the cut or copied line below / above" },
      { keys: [">", "<"], does: "Indent / outdent (make or unmake a child)" },
    ],
  },
  {
    title: "While editing a line",
    rows: [
      { keys: ["Enter"], does: "Save the line and stop editing" },
      { keys: ["Shift+Enter"], does: "Save the line and start a new one below" },
      { keys: ["Escape"], does: "Stop editing (keeps what you typed)" },
      { keys: ["#"], does: "Suggest tags from your config" },
      { keys: [":"], does: "Suggest markers by name (:sched → ⏳)" },
      { keys: ["📅 ⏳ 🛫 + space"], does: "Suggest dates" },
      { keys: ["↑", "↓", "Tab"], does: "Choose a suggestion" },
    ],
  },
  {
    title: "App",
    rows: [
      { keys: ["\\"], does: "Open the views list" },
      { keys: ["/"], does: "Search tasks across all views" },
      { keys: ["?"], does: "This help" },
      { keys: ["Escape"], does: "Close a panel, or get out of a stuck edit" },
    ],
  },
];

/**
 * drawer — THE VIEW DRAWER AND THE BAR'S "WHERE AM I" TEXT. The app's first extracted component,
 * and the shape below is an answer to a question, not a default: what IS a component in an app
 * whose one settled rule is "everything derived is pulled, nothing is cached, and there is one
 * path to the screen"?
 *
 * ── WHY THIS IS NOT app/present/, AND THE CLAIM THAT SETTLED IT ──
 *
 * `paint.ts`'s own header states, as a design rule with a cost attached rather than an incidental
 * fact: *"paint — the ONLY module in app/present/ that touches the document... three modules that
 * each touch the DOM a little is how a painter acquires decisions."* `resolve.ts`'s header adds the
 * other half: *"No DOM... the page owns every `document.getElementById`."* Every other module under
 * `app/present/` is explicitly pure — no DOM, no fetch, no clock.
 *
 * This module touches the document. `buildDrawer`/`paintFolder`/`treeRow` call
 * `document.createElement`; `openDrawer`/`closeDrawer` touch `document.body.classList`. Putting it
 * inside `app/present/` would make that directory's own stated contract false the moment it landed,
 * and the honest fix for a claim about to become false is not to reword the claim until it stops
 * meaning anything — it is to keep the thing the claim was protecting. So this lives beside
 * `app/present/`, not inside it: `app/shell/`, matching `app/editor/` and `app/render/`, which are
 * already single-concern directories next to `app/present/` rather than folded into it.
 *
 * `research-the-store.md` §5 invariant 1 (ONE PATH TO THE SCREEN) is, read exactly, a claim about
 * *the view's body* — "every pixel of a view's BODY is built by `paint()`... no other function
 * constructs view DOM." The drawer never builds a view's body and is never reached through
 * `repaintCurrentView`/`paintView`; it is chrome, the permanent frame around the body, the thing
 * `app/index.html` itself already calls "the shell" (`tests/app-shell.test.mjs` is named for it).
 * So this module sits outside invariant 1's scope on the research document's own terms — but it
 * sits outside `app/present/`'s narrower, stricter local rule regardless, because that rule was
 * never "no second path to the view body", it was "no second DOM-toucher in this directory, full
 * stop", and there is no reason to weaken a rule that already holds for everything else in there.
 *
 * NOT NAMED `app/chrome/`, though the app's own comments use that word for exactly this region
 * (`app/index.html`: "the app's one permanent piece of chrome"). `rendition.ts`'s `chromeOf` and
 * `CHROME` already own that word for a different fact — the bullet/checkbox prefix around a LINE'S
 * content, an ingest-side concept with its own tests. One word, one meaning; `app/shell/` is the
 * term this codebase already uses for the bar-plus-drawer region and does not already mean
 * something else.
 *
 * ── WHAT A COMPONENT READS: PULLED, NEVER HELD ──
 *
 * `research-the-store.md` §5 invariant 4 (PULL, NOT PUSH) and invariant 3 (NOTHING DERIVED IS EVER
 * CACHED) both apply here exactly as they do to the eleven surfaces. This module holds NO copy of
 * `graphData` or `currentViewId` — every function that needs them takes them as an argument, fresh,
 * the same discipline `paint()` itself uses for `body`/`source`/`context` (`PaintDeps`'s own
 * header: "supplied by the caller rather than imported"). `build`/`open`/`markCurrent` all take
 * `currentViewId` on every call rather than remembering the last one they were given.
 *
 * DOM ANCHORS ARE ALSO ARGUMENTS, NOT LOOKUPS. `DrawerDeps` is the one place `#drawer`, `#viewTree`,
 * `#drawerNote`, `#drawerClose`, `#scrim`, `#viewsBtn`, `#barFolder` and `#barView` are named, and
 * they are named by the PAGE, which calls `$(id)` and hands the elements in — this module never
 * calls `document.getElementById` itself. That is what keeps `resolve.ts`'s claim ("the page owns
 * every `document.getElementById`") true across this extraction rather than merely true of
 * resolvers: the page is still the one place an id string turns into an element.
 *
 * ── WHAT A COMPONENT WRITES, AND WHOSE FACT IT IS ──
 *
 * `drawerStops` and `viewButtons` are this module's OWN state, in the same sense `RowStore`'s rows
 * are its own: rebuilt wholesale on every `build()` call, read only by this module's own
 * `open`/`markCurrent`/the keydown trap wired inside `build`, and never meaningfully useful to a
 * caller except through this module's methods. `drawerIsOpen` is the same shape ONE LEVEL UP — it
 * is WRITTEN only by `open`/`close`, but it is legitimately READ by the page, because the page's
 * global keydown router needs to know whether Escape/`\` are this module's business before it can
 * decide anything else. That is the exact shape `rows.showing()`/`base.read()` already have: a
 * surface's own state, exposed for an external read, never for an external write.
 *
 * NONE OF THE THREE IS THE PAGE'S OWN STATE. `currentViewId` and `graphData` are — they describe
 * facts about the whole app's navigation and session, not about this drawer — and neither is held
 * here even transiently; see the paragraph above.
 *
 * ── WHAT A COMPONENT MAY NOT DO: REACH THE ONE PATH TO THE SCREEN ──
 *
 * The one thing `buildDrawer`'s original view-row click handler did that this module's version
 * deliberately does not: call `paintView` itself. `paintView` IS the one path to the screen's own
 * entry point (`repaintCurrentView` is the other half, reached only from inside it and from
 * `commitLine`), and a component that imported it would be a second module with the authority to
 * decide what gets painted, which is exactly the shape invariant 1 exists to refuse — not because
 * the drawer would misuse it today, but because "does anything besides `paintView`/
 * `repaintCurrentView` ever call `paint()`" needs to stay answerable by one grep forever, and an
 * import here would cost that. So `DrawerDeps.onChoose` is a callback: this module reports "the
 * operator picked this view", the page decides what that means (today, exactly `paintView(id,
 * "chosen")`, unchanged). The dependency runs one way — the page imports this module, this module
 * never imports the page's own orchestration — which is also what makes this module importable by
 * a test in isolation, with no page loaded at all.
 *
 * ── CAN THIS BE RE-ENTERED MID-PAINT? TRACED, NOT ASSUMED ──
 *
 * `research-the-store.md` §5 invariant 2 exists because `commitLine` can run SYNCHRONOUSLY inside
 * an active `paint()` — a blur listener paint.ts wires fires it before any `await`. The same
 * question has to be asked of this module in both directions, and both answers were checked against
 * the actual call graph rather than assumed:
 *
 *   CAN PAINT() REACH INTO THIS MODULE MID-FRAME? No path was found. `commitLine`'s body was read
 *   in full and calls nothing named here; `paint.ts` does not import this module and never will
 *   without breaking the one-way dependency two paragraphs up. Every call to `buildDrawer` in
 *   `app/index.html` (`loadGraph`, `logout`, the boot failure branch) is a plain synchronous
 *   statement with no `paint()`/`paintView()` call anywhere on the same tick before it returns.
 *
 *   CAN THIS MODULE'S OWN `.focus()` CALLS REACH INTO PAINT()? `open()`'s `.focus()` on a drawer
 *   button WOULD blur whatever currently holds focus, and if that were a view row's `<input>`, the
 *   blur listener paint.ts wires would fire `commitLine` — the exact nesting invariant 2 names —
 *   synchronously, inside `open()`'s own call. Traced against both real callers: the keyboard path
 *   (`\`) is refused by the page's own `typingIn(e.target)` guard whenever a line `<input>` has
 *   focus, before `open()` is ever called; the click path (`viewsBtn`) cannot reach a focused line
 *   `<input>` either, because a browser moves focus to the clicked button ON MOUSEDOWN — which fires
 *   the input's blur, and any `commitLine`/repaint it causes, synchronously — and only THEN, after
 *   that has fully resolved, does the `click` event fire and call `open()`. By the time this
 *   module's own code runs, there is nothing left to blur into a nested paint.
 *
 * So: nothing protects this module against re-entrancy, and on the evidence above nothing needs to.
 * This is a fact about today's wiring, proven by reading every call site, not a structural
 * guarantee this module enforces — a future caller that invoked `open`/`close`/`build` from inside
 * `paint.ts` itself (rather than from a page-level listener) would need to re-check this section,
 * the same way a future second call site to `applyPresentation` was flagged as the moment
 * `research-the-store.md` §7.1's six-`let` shape would stop being free.
 *
 * ── WHAT STAYS PRIVATE, AND WHY ──
 *
 * `treeRow`, `paintFolder`, `drawerKey`, `viewsUnder` and `holdsView` are not exported. Nothing
 * outside this module ever calls them directly — the page reaches them only through `build`,
 * `open`/`close` reach the keyboard trap only through the listeners `build` itself wires, and
 * `tests/app-shell.test.mjs` exercises all of it by dispatching real DOM events at real elements,
 * which is the stronger proof anyway (see that file's own header on why it drives the page rather
 * than describing it). A smaller public surface is a smaller thing for a future change to keep
 * consistent.
 *
 * `app/index.html` keeps four same-named, zero/one-argument wrapper functions
 * (`buildDrawer`/`openDrawer`/`closeDrawer`/`markWhereWeAre`) that close over the page's own
 * `currentViewId`/`graphData` and call into this module's `DrawerDeps`-taking versions. This is the
 * same technique `tests/fixtures/app-html-page.mjs` already uses for the four resolver axes
 * ("THE ALIASES ARE KEPT, VERBATIM IN SIGNATURE, ON PURPOSE") — it is what let roughly fifteen
 * existing assertions in `tests/app-shell.test.mjs` keep calling the shapes they always called,
 * with no rewrite, while the exported functions underneath carry the real, checked signature.
 *
 * ── WHERE THE FOLDER COMES FROM, AND WHY IT IS NOT `domain` ──
 *
 * Every view in the snapshot carries `path`, its rendered file's path INSIDE THE VAULT —
 * `work/all.md`, `dev/qntm/queue.md`, `this_week.md`. It is not decoration: it is the address
 * `/app/edit-file` writes back to, so it is the one field that cannot drift from where the file
 * actually is. Its directory therefore IS the folder, in the same sense Obsidian means it, with no
 * convention invented on top.
 *
 * A view also carries `domain`, which is what the retired `<select>` grouped by, and it is a
 * DIFFERENT thing — a label hand-written in each view's config. Measured across the operator's 76
 * view configs, the two disagree in three ways that all cost the reader something: `domain` is
 * COARSER (fourteen views under `dev/` are one `dev` bucket, though they are four separate projects
 * in four separate folders), it RENAMES (`spirit/program/`'s five views are domain `program`, not a
 * folder at the top level at all), and it can be FLATLY WRONG (`dev/test-scratchpad.md` is declared
 * domain `personal`). So: FOLDERS COME FROM `path`. `domain` is left alone.
 */

/** The one shape this module needs off a view — never the whole wire payload. */
export interface DrawerView {
  readonly id: string;
  readonly path: string;
  readonly title: string;
}

/** The views as a tree of folders, built from their paths. Nested, because the vault is. */
export interface FolderNode {
  readonly name: string;
  readonly folders: Map<string, FolderNode>;
  readonly views: DrawerView[];
}

/**
 * The DOM anchors and the one callback this module needs, supplied by the page on every call — see
 * this file's own header on why an id-to-element lookup never happens in here.
 *
 * `onChoose` is called with a view's id when the operator picks it from the tree; it is this
 * module's report of a gesture, not a call into the one path to the screen — see this file's own
 * header for why that distinction is load-bearing.
 */
export interface DrawerDeps {
  readonly panel: HTMLElement;
  readonly tree: HTMLElement;
  readonly note: HTMLElement;
  readonly closeButton: HTMLElement;
  readonly scrim: HTMLElement;
  readonly openButton: HTMLElement;
  readonly barFolder: HTMLElement;
  readonly barView: HTMLElement;
  readonly onChoose: (viewId: string) => void;
}

export const folderOf = (path: string | undefined | null): string => {
  const at = String(path ?? "").lastIndexOf("/");
  return at === -1 ? "" : String(path).slice(0, at);
};

export function foldersOf(views: readonly DrawerView[]): FolderNode {
  const root: FolderNode = { name: "", folders: new Map(), views: [] };
  for (const v of views) {
    const segments = String(v.path ?? "").split("/");
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      let child = node.folders.get(segment);
      if (!child) {
        child = { name: segment, folders: new Map(), views: [] };
        node.folders.set(segment, child);
      }
      node = child;
    }
    node.views.push(v);
  }
  return root;
}

const viewsUnder = (node: FolderNode): number =>
  node.views.length + [...node.folders.values()].reduce((n, f) => n + viewsUnder(f), 0);

const holdsView = (node: FolderNode, id: string | null): boolean =>
  node.views.some((v) => v.id === id) || [...node.folders.values()].some((f) => holdsView(f, id));

// Every button in the drawer, in tab order, and every view button by id. Both are rebuilt with the
// tree — a stale element here would be a focus trap that jumps to a button nobody can see. This
// module's own state; see this file's header on why it is neither exported behind an accessor nor
// held any more privately than this.
export const drawerStops: HTMLElement[] = [];
export const viewButtons: Map<string, HTMLButtonElement> = new Map();
export let drawerIsOpen = false;

/** A row: chevron (folders only), name, count. The same shape for a folder and for a view. */
function treeRow(className: string, glyph: string | null, name: string, count: number | null): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  if (glyph !== null) {
    const chev = document.createElement("span");
    chev.className = "chev";
    chev.textContent = glyph;
    button.append(chev);
  }
  const label = document.createElement("span");
  label.className = "rowname";
  label.textContent = name;
  button.append(label);
  if (count !== null) {
    const tally = document.createElement("span");
    tally.className = "count";
    tally.textContent = String(count);
    button.append(tally);
  }
  return button;
}

/** Folders first and alphabetical, then this folder's own views by title — Obsidian's order. */
function paintFolder(deps: DrawerDeps, node: FolderNode, into: HTMLElement, currentViewId: string | null): void {
  for (const folder of [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const box = document.createElement("div");
    // OPEN IF IT HOLDS WHERE YOU ARE, shut otherwise. 76 views in ten folders is a scroll if
    // everything is open, and a drawer that lands showing the view you are in is the one that
    // answers "where am I" without being read.
    const open = holdsView(folder, currentViewId);
    box.className = open ? "fold" : "fold shut";
    const head = treeRow("foldbtn", "›", folder.name, viewsUnder(folder));
    head.setAttribute("aria-expanded", open ? "true" : "false");
    head.addEventListener("click", () => {
      const shut = box.classList.toggle("shut");
      head.setAttribute("aria-expanded", shut ? "false" : "true");
    });
    const kids = document.createElement("div");
    kids.className = "foldkids";
    box.append(head, kids);
    into.append(box);
    drawerStops.push(head);
    paintFolder(deps, folder, kids, currentViewId);
  }
  for (const v of [...node.views].sort((a, b) => a.title.localeCompare(b.title))) {
    const button = treeRow("viewbtn", null, v.title, null);
    button.addEventListener("click", () => {
      // A CHOICE, SAID OUT LOUD — reported to the page, never acted on here. See this file's own
      // header on why this module does not call `paintView` itself.
      deps.onChoose(v.id);
      closeDrawer(deps);
    });
    into.append(button);
    drawerStops.push(button);
    viewButtons.set(v.id, button);
  }
}

export function buildDrawer(deps: DrawerDeps, views: readonly DrawerView[], currentViewId: string | null): void {
  drawerStops.length = 0;
  viewButtons.clear();
  drawerStops.push(deps.closeButton);
  deps.tree.innerHTML = "";
  if (views.length === 0) {
    const note = document.createElement("p");
    note.className = "treenote";
    note.textContent = "No views yet.";
    deps.tree.append(note);
    deps.note.textContent = "";
  } else {
    const root = foldersOf(views);
    paintFolder(deps, root, deps.tree, currentViewId);
    const folders = root.folders.size;
    deps.note.textContent =
      `${views.length} views · ${folders} folder${folders === 1 ? "" : "s"} · \\ opens, Esc closes`;
  }
  // Escape and the Tab wrap are bound PER STOP rather than read off document.activeElement, because
  // a handler that asks the document where the cursor is only works in a browser — this way the
  // trap is this module's own code and a test can drive it.
  drawerStops.forEach((stop, index) => stop.addEventListener("keydown", (e) => drawerKey(deps, e as KeyboardEvent, index)));
  markWhereWeAre(deps, views, currentViewId);
}

function drawerKey(deps: DrawerDeps, e: KeyboardEvent, index: number): void {
  if (e.key === "Escape") { e.preventDefault(); closeDrawer(deps); return; }
  if (e.key !== "Tab" || drawerStops.length === 0) return;
  const last = drawerStops.length - 1;
  if (e.shiftKey && index === 0) { e.preventDefault(); drawerStops[last]?.focus(); }
  else if (!e.shiftKey && index === last) { e.preventDefault(); drawerStops[0]?.focus(); }
}

export function openDrawer(deps: DrawerDeps, currentViewId: string | null): void {
  drawerIsOpen = true;
  deps.panel.classList.add("open");
  deps.scrim.classList.add("open");
  deps.panel.setAttribute("aria-hidden", "false");
  deps.openButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("noscroll");
  // The current view if it is on screen, else the close button. Landing the cursor on where you
  // already are means the first arrow key moves from here rather than from the top of a list.
  const target = (currentViewId === null ? undefined : viewButtons.get(currentViewId)) ?? drawerStops[0] ?? deps.panel;
  target.focus();
}

export function closeDrawer(deps: DrawerDeps): void {
  const wasOpen = drawerIsOpen;
  drawerIsOpen = false;
  deps.panel.classList.remove("open");
  deps.scrim.classList.remove("open");
  deps.panel.setAttribute("aria-hidden", "true");
  deps.openButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("noscroll");
  // Focus goes back to what opened it — but only if it WAS open, so closing an already-closed
  // drawer (boot, sign-out) does not steal the cursor from whatever has it.
  if (wasOpen) deps.openButton.focus();
}

/** The bar says where you are, and the drawer marks it. Both from the same one fact. */
export function markWhereWeAre(deps: DrawerDeps, views: readonly DrawerView[], currentViewId: string | null): void {
  const v = views.find((x) => x.id === currentViewId) ?? null;
  deps.barFolder.textContent = v ? folderOf(v.path) : "";
  deps.barView.textContent = v ? v.title : "";
  for (const [id, button] of viewButtons) button.classList.toggle("current", id === currentViewId);
}

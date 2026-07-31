/**
 * The app page's own module script, lifted and made importable — the fixture two suites share.
 *
 * THE PAGE IS `app/index.html`, served at https://qntm.network/app/. It was `app.html` at the
 * repo root until 2026-07-30; the old URL is now a redirect stub and is NOT what this reads.
 *
 * WHY THIS EXISTS RATHER THAN A COPY OF THE PAGE'S WIRING. The page is hand-authored HTML,
 * outside every enforcer this repo has: outside the capture filter (node cannot import an HTML
 * document, so being under `app/` changes nothing), outside tsconfig, outside the bundle. A test
 * that reimplemented its wiring in a fixture would pass forever while the page rotted. So this
 * extracts the page's real `<script type="module">`, swaps ONLY its three import lines (two CDN
 * URLs node cannot fetch, and one site-absolute path that has to become a file URL), appends an
 * export block, and runs it. Every line of logic under test is the line that ships.
 *
 * IT LIVES HERE, IN ONE FILE, BECAUSE THERE ARE NOW TWO SUITES THAT NEED IT — the write path
 * (tests/app-html-write-path.test.mjs) and the served GLOBAL declaration
 * (tests/present-global.test.mjs). A second copy of the extractor would be a second thing to keep
 * in step with the page, which is the failure this fixture is written to avoid in the first place.
 */

import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

export const REPO = resolve(fileURLToPath(import.meta.url), "..", "..", "..");

/**
 * Write app.html's module script to a temp file node can import, changing nothing else.
 *
 * Returns the path. The caller owns the directory and removes it.
 */
export function extractPageScript(workDir) {
  const html = readFileSync(join(REPO, "app", "index.html"), "utf8");
  const match = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, "app/index.html no longer contains a module script");
  let source = match[1];

  const swapped = [];
  const swap = (pattern, replacement, label) => {
    assert.ok(pattern.test(source), `app/index.html no longer imports ${label}`);
    source = source.replace(pattern, replacement);
    swapped.push(label);
  };

  // 1. The passkey library — a CDN URL node cannot fetch.
  //
  //    IT ROUTES THROUGH A HOOK RATHER THAN BEING A NO-OP, and the default is still the no-op the
  //    two older suites relied on. What the hook buys is the CEREMONY's failures: a cancelled
  //    passkey sheet is a `NotAllowedError` raised from inside this call, it is the commonest
  //    thing a first-time visitor does, and the page's answer to it is untestable if the only
  //    thing this function can do is succeed silently. A suite sets `globalThis.__webauthn` to
  //    make it throw what a real browser throws; anything that does not, gets exactly what it got
  //    before.
  swap(
    /^import \{ startRegistration, startAuthentication \} from "https:\/\/esm\.sh\/@simplewebauthn\/browser@13";$/m,
    "const startRegistration = (...a) => (globalThis.__webauthn?.startRegistration ?? (() => {}))(...a);\n" +
      "const startAuthentication = (...a) => (globalThis.__webauthn?.startAuthentication ?? (() => {}))(...a);",
    "@simplewebauthn/browser",
  );
  // 2. markdown-it — same library, same major, resolved from this repo's node_modules instead of
  //    a CDN. Resolved to an absolute URL because the rewritten script runs from a temp dir,
  //    where a bare specifier has no node_modules to find.
  swap(
    /^import MarkdownIt from "https:\/\/esm\.sh\/markdown-it@14";$/m,
    `import MarkdownIt from ${JSON.stringify(import.meta.resolve("markdown-it"))};`,
    "markdown-it",
  );
  // 3. The presentation bundle — a SITE-root-absolute path ("/dist/present.js", because the page
  //    is served at /app/) that has to become a FILE url once the script is written to a temp
  //    dir. THE BUNDLE ITSELF IS NOT SUBSTITUTED: this is the same dist/present.js the browser
  //    loads. The leading `/` is asserted, not tolerated — a page that went back to a relative
  //    "./dist/present.js" would 404 at /app/ in a browser and this swap fails instead.
  swap(
    /"\/dist\/present\.js"/,
    JSON.stringify(pathToFileURL(join(REPO, "dist", "present.js")).href),
    "/dist/present.js",
  );

  assert.equal(swapped.length, 3, "unexpected number of import swaps");

  // The page keeps its state in module-scoped `let`s and exports nothing. These lines are
  // additive — they read and write what is already there and change no behaviour.
  source += `
export { paintView, toggleTask, loadPresentation };
export { buildDrawer, openDrawer, closeDrawer, folderOf, foldersOf, drawerStops, viewButtons };
export { landOn, loadGraph, refresh, showShell };
export { register, login, logout, friendlyAuthError, showEmpty, hideEmpty, HANDLE_RE, api };
export const __token = () => token;
export function __setToken(next) { token = next; }
export const __currentViewId = () => currentViewId;
export function __setGraphData(next) { graphData = next; }
export function __setCurrentViewId(next) { currentViewId = next; }
export const __drawerIsOpen = () => drawerIsOpen;
`;

  const file = join(workDir, "page.mjs");
  writeFileSync(file, source);
  return file;
}

/** A temp directory that removes itself when the process exits. */
export function makeWorkDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `${label}-`));
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * A `classList` with the real semantics, backed by the element's own `className`.
 *
 * IT USED TO BE FOUR NO-OPS, and that was honest while the page's only use of a class was to
 * hide a section nothing asserted on. The shell changed that: `open`, `shut` and `current` are
 * the drawer's whole state, and a `toggle()` that does nothing makes every assertion about that
 * state vacuously true — a green nothing could turn red. Reading and writing `className` (rather
 * than keeping a private set) is what keeps it consistent with the painter, which sets
 * `className` directly and never goes through here.
 */
const makeClassList = (element) => ({
  _read() {
    return new Set(String(element.className || "").split(/\s+/).filter(Boolean));
  },
  _write(set) {
    element.className = [...set].join(" ");
  },
  add(...names) {
    const set = this._read();
    for (const name of names) set.add(name);
    this._write(set);
  },
  remove(...names) {
    const set = this._read();
    for (const name of names) set.delete(name);
    this._write(set);
  },
  toggle(name, force) {
    const set = this._read();
    const on = force === undefined ? !set.has(name) : Boolean(force);
    if (on) set.add(name);
    else set.delete(name);
    this._write(set);
    return on;
  },
  contains(name) {
    return this._read().has(name);
  },
});

/** The smallest browser the page touches at import time and while it is driven. */
export function installBrowser() {
  const elements = new Map();
  const focused = { value: null };
  const make = (tagName) => {
    const element = makeElement(tagName);
    element.classList = makeClassList(element);
    return element;
  };
  const makeElement = (tagName) => ({
    tagName,
    className: "",
    // innerHTML and textContent both REPLACE an element's content, so assigning either drops any
    // children a previous assignment left. Same observable behaviour as the real DOM, and the
    // reason `body.innerHTML = ""` at the top of a repaint actually empties the body — without
    // it a second paint appends to the first and every count in every suite reads double.
    _html: "",
    _text: "",
    get innerHTML() {
      return this._html;
    },
    set innerHTML(value) {
      this._html = String(value);
      this._text = "";
      this.children = [];
    },
    get textContent() {
      return this._text;
    },
    set textContent(value) {
      this._text = String(value);
      this._html = "";
      this.children = [];
    },
    value: "",
    type: "",
    checked: false,
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    listeners: new Map(),
    // Attributes are RECORDED rather than ignored, because the shell's state is announced
    // through them (`aria-expanded`, `aria-hidden`) and an announcement nothing can read back is
    // an announcement nobody can test.
    attributes: new Map(),
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    },
    // The rail's re-read raises `aria-busy` while it is in flight and DROPS it when it lands.
    // Recording the set and ignoring the removal would make "it stopped being busy" untestable —
    // the attribute would read `"true"` forever and the assertion would pass whether the button
    // recovered or stayed stuck.
    removeAttribute(name) {
      this.attributes.delete(name);
    },
    focus() {
      this.focused = true;
      focused.value = this;
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    addEventListener(type, listener) {
      const existing = this.listeners.get(type) ?? [];
      existing.push(listener);
      this.listeners.set(type, existing);
    },
    dispatch(type, event = makeEvent()) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
      return event;
    },
  });

  // The document itself takes listeners now: the shell binds ONE global `keydown` (Escape from
  // anywhere, `\` to open), which is a reach the page did not have before the shell existed.
  const documentListeners = new Map();
  globalThis.document = {
    createElement: make,
    getElementById: (id) => {
      if (!elements.has(id)) {
        elements.set(id, make("div"));
      }
      return elements.get(id);
    },
    body: make("body"),
    addEventListener(type, listener) {
      const existing = documentListeners.get(type) ?? [];
      existing.push(listener);
      documentListeners.set(type, existing);
    },
    /** Fire a document-level handler — how a test presses a key with nothing focused. */
    dispatch(type, event = makeEvent()) {
      for (const listener of documentListeners.get(type) ?? []) {
        listener(event);
      }
      return event;
    },
  };
  globalThis.location = { hostname: "qntm.network" };
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  // Where the cursor is. `focus()` records it, so a test can assert the drawer took the cursor
  // and gave it back — which is the whole of "focus behaves" and is otherwise unobservable.
  return { elements, focused, document: globalThis.document };
}

/** An event object carrying only what the page's handlers touch. */
export function makeEvent(fields = {}) {
  return {
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    ...fields,
  };
}

/** Every element under `element`, in document order. */
export function walk(element, out = []) {
  for (const child of element.children ?? []) {
    out.push(child);
    walk(child, out);
  }
  return out;
}

/** Import the lifted page once, with a fetch stub installed. Returns the module. */
export async function importPage(workDir) {
  return import(pathToFileURL(extractPageScript(workDir)).href);
}

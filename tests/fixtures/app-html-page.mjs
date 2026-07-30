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

  // 1. The passkey library — a CDN URL node cannot fetch, and nothing these tests drive calls it.
  swap(
    /^import \{ startRegistration, startAuthentication \} from "https:\/\/esm\.sh\/@simplewebauthn\/browser@13";$/m,
    "const startRegistration = () => {}; const startAuthentication = () => {};",
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
export function __setGraphData(next) { graphData = next; }
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

/** The smallest browser the page touches at import time and while it is driven. */
export function installBrowser() {
  const elements = new Map();
  const make = (tagName) => ({
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
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains: () => false,
    },
    focus() {
      this.focused = true;
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

  globalThis.document = {
    createElement: make,
    getElementById: (id) => {
      if (!elements.has(id)) {
        elements.set(id, make("div"));
      }
      return elements.get(id);
    },
  };
  globalThis.location = { hostname: "qntm.network" };
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  return { elements };
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

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
 * extracts the page's real `<script type="module">`, swaps ONLY its two site-root-absolute import
 * lines for node-resolvable equivalents (the vendor bundle — markdown-it resolved from this repo's
 * own node_modules, the passkey ceremony routed through a test hook — and the presentation bundle,
 * turned into a file URL), appends an export block, and runs it. Every line of logic under test is
 * the line that ships. NEITHER SWAP IS A CDN URL ANY MORE — app/vendor.ts (-> dist/vendor.js)
 * retired both esm.sh imports; see that file's own header.
 *
 * IT LIVES HERE, IN ONE FILE, BECAUSE THERE ARE NOW TWO SUITES THAT NEED IT — the write path
 * (tests/app-html-write-path.test.mjs) and the served GLOBAL declaration
 * (tests/present-global.test.mjs). A second copy of the extractor would be a second thing to keep
 * in step with the page, which is the failure this fixture is written to avoid in the first place.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

export const REPO = resolve(fileURLToPath(import.meta.url), "..", "..", "..");

/**
 * Write app.html's module script to a temp file node can import, changing nothing else.
 *
 * Returns the path. The caller owns the directory and removes it.
 *
 * `mutate` IS FOR MUTATION PROOFS ONLY, AND IT IS DELIBERATELY THE LAST THING APPLIED — after both
 * import swaps and after the export block, so a mutation can reach any line of the page's real
 * logic and cannot be silently undone by a rewrite that runs later. It receives the finished source
 * and returns the source to write; the default is identity, so every existing caller is unchanged.
 *
 * A GUARD THAT CANNOT GO RED IS DECORATION, and a suite proving that the page holds a vanished
 * edit has no other way to show its assertions would fail if the holding were removed: the page is
 * one hand-authored file with no seam to inject at. Breaking one named expression and re-importing
 * is that seam. `assertMutated` below is what stops a typo in the pattern from producing a green
 * "mutation proof" against an unmodified page.
 */
export function extractPageScript(workDir, mutate = (source) => source) {
  const html = readFileSync(join(REPO, "app", "index.html"), "utf8");
  const match = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, "app/index.html no longer contains a module script");
  let source = match[1];
  const bundle = JSON.stringify(pathToFileURL(join(REPO, "dist", "present.js")).href);

  const swapped = [];
  const swap = (pattern, replacement, label) => {
    assert.ok(pattern.test(source), `app/index.html no longer imports ${label}`);
    source = source.replace(pattern, replacement);
    swapped.push(label);
  };

  // 1. The vendor bundle (app/vendor.ts -> dist/vendor.js) — markdown-it and the passkey library,
  //    imported by the page from ONE site-root-absolute path, split into node-testable pieces:
  //
  //      MarkdownIt — same library, same major, resolved from THIS REPO'S node_modules instead of
  //      dist/vendor.js's minified copy, so the golden comparisons run against the readable source
  //      rather than a bundle a diff cannot usefully show. Resolved to an absolute URL because the
  //      rewritten script runs from a temp dir, where a bare specifier has no node_modules to find.
  //
  //      startRegistration/startAuthentication — ROUTED THROUGH A HOOK RATHER THAN BEING A NO-OP,
  //      and the default is still the no-op the older suites relied on. What the hook buys is the
  //      CEREMONY's failures: a cancelled passkey sheet is a `NotAllowedError` raised from inside
  //      this call, it is the commonest thing a first-time visitor does, and the page's answer to
  //      it is untestable if the only thing this function can do is succeed silently. A suite sets
  //      `globalThis.__webauthn` to make it throw what a real browser throws; anything that does
  //      not, gets exactly what it got before.
  //
  //    Testing dist/vendor.js itself (that it bundles, that it ships no esm.sh) is a SEPARATE proof
  //    — tests/no-cdn.test.mjs — and deliberately does not run through this fixture, for the same
  //    reason present-golden.test.mjs imports dist/present.js directly rather than through here:
  //    the artifact the browser loads has to be the thing under test, not a stand-in for it.
  // BOTH PATTERNS TOLERATE A TRAILING `?v=<hash>` — scripts/build.mjs's cache-buster (see its own
  // header), which changes with the bundle's bytes. Pinning these to the query-less form would
  // make this fixture go stale on every rebuild that changes either bundle; the swap still reads
  // and loads the SAME on-disk file either way, so the query is irrelevant to what this fixture
  // proves and is dropped rather than carried into the substitution.
  swap(
    /^import \{ MarkdownIt, startRegistration, startAuthentication \} from "\/dist\/vendor\.js(?:\?v=[0-9a-f]+)?";$/m,
    `import MarkdownIt from ${JSON.stringify(import.meta.resolve("markdown-it"))};\n` +
      "const startRegistration = (...a) => (globalThis.__webauthn?.startRegistration ?? (() => {}))(...a);\n" +
      "const startAuthentication = (...a) => (globalThis.__webauthn?.startAuthentication ?? (() => {}))(...a);",
    "/dist/vendor.js",
  );
  // 2. The presentation bundle — a SITE-root-absolute path ("/dist/present.js", because the page
  //    is served at /app/) that has to become a FILE url once the script is written to a temp
  //    dir. THE BUNDLE ITSELF IS NOT SUBSTITUTED: this is the same dist/present.js the browser
  //    loads. The leading `/` is asserted, not tolerated — a page that went back to a relative
  //    "./dist/present.js" would 404 at /app/ in a browser and this swap fails instead.
  swap(
    /"\/dist\/present\.js(?:\?v=[0-9a-f]+)?"/,
    JSON.stringify(pathToFileURL(join(REPO, "dist", "present.js")).href),
    "/dist/present.js",
  );

  assert.equal(swapped.length, 2, "unexpected number of import swaps");

  // The page keeps its state in module-scoped `let`s and exports nothing. These lines are
  // additive — they read and write what is already there and change no behaviour.
  source += `
export { paintView, toggleTask, commitLine, loadPresentation };
// THE DECLARATION, DRIVEN DIRECTLY. \`loadPresentation\` IS A FETCH AGAIN — it reads
// \`/presentation.json\` off the wire, so it is ASYNC and a suite that calls it must await it and
// must answer that request (see \`withDeclaration\` in this file). This export is the other half: a
// test that wants to drive a DIFFERENT document than the one actually shipping (to prove the reader
// is wired, the same falsifier migration stage 2 always asserted), or to RESET the page to the real
// one between tests, calls this — the exact application logic \`loadPresentation\` itself calls,
// against an arbitrary document rather than a fetched one.
export { applyPresentation as __applyPresentation };
// THE URL, EXPORTED SO A SUITE CANNOT DISAGREE WITH THE PAGE ABOUT IT. A fetch stub keyed on a
// hand-written "/presentation.json" would go on passing after the page moved the document — this
// reads the page's own constant.
export const __declarationUrl = () => DECLARATION_URL;
// THE DECLARATION ITSELF — a getter, the same reason \`__served\`/\`__rows\` below are: a suite
// reads what the page is holding NOW, not a snapshot from import time, and \`declaration\` is
// reassigned wholesale by \`applyPresentation\` rather than mutated in place (app/present/
// context.ts's \`Declaration\` header). A suite proving that reassignment is atomic reads this
// getter before and after an interrupted load; see tests/app-declaration-atomicity.test.mjs.
export const __declaration = () => declaration;
// THE BASE. \`served\` is the page's own BaseSurface (app/present/base.ts) — a getter, like the vim
// pair below, so a suite reads what the page is holding NOW rather than a snapshot from import
// time. \`writeFile\` is exported for the one thing a driven affordance cannot show: that the write
// path itself measures and carries the base, independently of which gesture reached it.
export const __served = () => served;
export { writeFile as __writeFile };
export { buildDrawer, openDrawer, closeDrawer, folderOf, foldersOf, drawerStops, viewButtons };
export { landOn, loadGraph, refresh, showShell, bootRead };
export { register, login, logout, friendlyAuthError, showEmpty, hideEmpty, HANDLE_RE, api };
export const __token = () => token;
export function __setToken(next) { token = next; }
export const __currentViewId = () => currentViewId;
export function __setGraphData(next) { graphData = next; }
export function __setCurrentViewId(next) { currentViewId = next; }
export const __drawerIsOpen = () => drawerIsOpen;
// VIM. \`mode\` and \`focus\` are module-scoped consts, same shape as \`currentViewId\` above —
// getters rather than raw exports so a test reads the live value instead of a snapshot from
// import time.
export const __vimMode = () => mode.mode;
export const __focusIndex = () => focus.lineIndex;
export const __focusColumn = () => focus.column;
// ARMED, NOT PRESSED. A click positions the cursor and stays in NORMAL — paint.ts's \`focusable\`
// no longer calls \`mode.enterInsert()\` on click, only \`i\`/\`a\`/\`o\`/\`O\` do, and those reach
// \`mode\` through the page's own document-level keydown handler, which ALSO runs
// \`drainPainted()\` on every keystroke (the third drain point, see that handler's own comment)
// and then \`repaintCurrentView()\`, which is what actually swaps the block-cursor line for the
// typeable \`<input>\` — \`mode.enterInsert()\` alone only flips a flag. A suite proving something
// about a HELD projection's timing needs a line open for typing WITHOUT running that drain
// early — the same reason this suite's \`clickLine\` used to reach INSERT through a bare click,
// before this field existed. This hook is the state-level replacement: it does what the keydown
// handler's "enter-insert" branch does (arm, then repaint) without the keystroke that would also
// drain.
export function __enterInsert() { mode.enterInsert(); repaintCurrentView(); }
// THE ANCHOR. \`__setFocus\` is how a suite puts the cursor somewhere WITH the source it belongs to
// AND the view it belongs to — \`currentViewId\`, the same id \`paintView\`'s own \`focus.focus\`/
// \`focus.reanchor\` calls already namespace the anchor by, so a test that calls this after
// \`paintView\` lands the anchor in the SAME instance-id space \`paintView\`'s own reanchoring will
// resolve it against.
// IT SEATS THE ROW STORE TOO, because putting the cursor somewhere IS both facts. In the shipping
// app the two are never apart: every gesture that moves the cursor is followed by a paint, and
// \`paint()\` records the seat (app/present/rows.ts). This hook has no paint, so without the second
// statement it would leave the page in a state no gesture can produce — the cursor on one row and
// the store seated on another — and every suite using it would be measuring that instead of the app.
export function __setFocus(lineIndex, source) {
  focus.focus(lineIndex, source, 0, currentViewId);
  rows.seat(currentViewId ?? "", source, lineIndex);
}
export const __focusAnchor = () => focus.anchor;
// ── THE RESOLVER SEAM, AND WHY IT IS A COMPATIBILITY SHIM RATHER THAN AN API ──
//
// The four axes were four hand-written functions each ON THE PAGE, and the exports below are the
// names roughly fifty existing assertions already call. The page no longer has those functions:
// they are \`ResolverSpec\`s in \`app/present/resolvers/\`, driven by one registry walk.
//
// THE ALIASES ARE KEPT, VERBATIM IN SIGNATURE, ON PURPOSE. They are how the restructure proves
// itself: every assertion written against the old functions still runs, with the same arguments,
// against the ported code, and any behaviour difference shows up as a red test rather than as a
// claim in a PR body. That is the only proof of "no behaviour change" worth anything, and it costs
// exactly the twenty aliasing lines below.
//
// THEY ARE NOT THE SHAPE TO WRITE NEW TESTS AGAINST. A new test drives \`page.commitLine\` (the real
// registry walk, which is what a keystroke does) or reads \`__resolverContextFor\` and calls
// \`runResolvers\` itself. Retiring these aliases and re-pointing the suites that use them is
// follow-up work, deliberately not folded into the same diff as the move.
import {
  membershipSpec as __membershipSpec,
  orderingSpec as __orderingSpec,
  rulesSpec as __rulesSpec,
  promotionSpec as __promotionSpec,
  defineResolver as __defineResolver,
  runResolvers as __runResolvers,
  armSettle as __armSettleWith,
} from ${bundle};
export { resolverContextFor as __resolverContextFor };
const __ctx = (view, commit) => resolverContextFor(view, commit);
// \`__paintBadge\`/\`__showBadge\`/\`__updateMembershipBadge\`/\`__updateOrderingBadge\`/
// \`__updateRulesBadge\`/\`__updateParentBadge\` ARE GONE — \`paintBadge\` and the four abstention-
// badge elements it wrote to (\`#membershipBadge\`/\`#orderingBadge\`/\`#rulesBadge\`/\`#parentBadge\`)
// were retired from the page (\`chore/retire-the-status-line\`). \`__membershipDiagnosticFor\` and its
// three siblings below still answer the same question (what did this axis decide, and did it
// abstain) by calling the resolver spec's own \`.show\` directly — the DOM sink is gone, the
// resolver-level answer is not.
export const __membershipNoteFor = (v, c) => __membershipSpec.say(__membershipSpec.read(__ctx(v, c)));
export const __membershipDiagnosticFor = (v, c) => __membershipSpec.show(__membershipSpec.read(__ctx(v, c)));
export const __orderingNoteFor = (v, c) => __orderingSpec.say(__orderingSpec.read(__ctx(v, c)));
export const __orderingDiagnosticFor = (v, c) => __orderingSpec.show(__orderingSpec.read(__ctx(v, c)));
// ORDERING'S ARM ALONE, applied to the settle surface alone — the page's own \`commitLine\` also arms
// \`predict\` on every commit, and a suite asserting what THIS gesture armed must not have the
// predict surface moved under it as a side effect.
const __orderingOnly = [__defineResolver(__orderingSpec)];
export const __armOrderingSettle = (v, c) => {
  const outcome = __runResolvers(__orderingOnly, __ctx(v, c));
  __armSettleWith(settle, c.markdown, v.id, outcome.placements);
};
export const __rulesReadingFor = (v, c) => __rulesSpec.read(__ctx(v, c));
export const __rulesNoteFor = (reading) => __rulesSpec.say(reading);
export const __rulesDiagnosticFor = (reading) => __rulesSpec.show(reading);
export const __rulesTable = () => rulesTable;
export const __parentPromotionFor = (v, c) => __promotionSpec.read(__ctx(v, c));
export const __parentPromotionNoteFor = (reading) => __promotionSpec.say(reading);
export const __parentPromotionDiagnosticFor = (reading) => __promotionSpec.show(reading);
// THE SETTLE SURFACE (app/present/settle.ts). A getter, the same reason __focusAnchor and __served
// are: a suite reads what the page is holding NOW, and what changes under it is which placement
// (if any) is armed.
export const __settle = () => settle;
// THE PREDICT SURFACE (app/present/predict.ts) — same reasoning as __settle immediately above.
// THERE ARE NO \`__armPrediction\`/\`__childPredictionFor\`/\`__parentPredictionFor\` ANY MORE: those
// three page functions are the rules and promotion resolvers' own \`arm\`, and the arming they
// produce is applied by \`armPredict\` (resolve.ts) from ONE call in \`commitLine\`. A suite asking
// "what would this commit arm" drives \`page.commitLine\` and reads \`__predict()\`, which is the
// real path and was always the stronger proof. \`__repaintCurrentView\` is exported so a suite can
// drive an ACTUAL paint of the current view (the same function every real projection and every real
// keystroke eventually calls) and inspect \`#viewBody\`'s own children — the only way to prove a
// prediction lands in the ROW it belongs to, rather than merely that it was armed.
export const __predict = () => predict;
export { repaintCurrentView as __repaintCurrentView };
// \`__todayNoteFor\`/\`__sentEdit\` ARE GONE. \`todayNoteFor\` was wired into the page for exactly one
// reason — \`sayAsOf\`'s freshness-line "today <date>" clause — and both were retired together
// (\`chore/retire-the-status-line\`); \`sentEdit\` existed only to feed \`reportCursorReading\`'s
// \`proved\` argument, also retired. \`todayFor\` itself (app/present/today.ts) is untouched and still
// reachable directly from \`dist/present.js\` for any suite that wants it — see
// tests/present-today.test.mjs — and it is still called for real by the rules resolver
// (app/present/resolvers/rules.ts), unrelated to the page's own freshness wiring.
// THE LINE BEING MADE (app/present/draft.ts). A getter, the same reason \`__served\` is one: a
// suite reads the row the page is holding NOW, and \`draftLine\` is a module-scoped const whose
// CONTENTS change under it. It is the only way to tell "the row survived and was re-placed" apart
// from "the row was destroyed and a new one opened", which are the same screen.
export const __draft = () => draftLine;
// THE BEHAVIOURAL QUEUE (app/present/queue.ts). A getter, the same reason \`__draft\` and
// \`__served\` are: a suite reads what the page is holding NOW. \`__drainPainted\` and
// \`__aLineIsOpen\` are exported so a suite can drive the two halves of the gate separately — "is
// something waiting" and "may it go on" are different failures and a test that could only see the
// screen would not be able to tell them apart.
export const __queued = () => queued;
export { drainPainted as __drainPainted, aLineIsOpen as __aLineIsOpen };
// WRITE CORRELATION (app/present/correlation.ts). \`__writes\` is a getter, the same reason
// \`__queued\` and \`__served\` are: a suite reads the register the page is holding NOW,
// and what changes under it is which writes are outstanding. \`__correlate\` is exported so a suite
// can drive the reader against an arbitrary envelope without also standing up a POST — the same
// separation \`__membershipNoteFor\` gets, and for the same reason: "what did the echo say" and
// "what did the write path do about it" are different failures.
export const __writes = () => writes;
export { correlate as __correlate };
// THE PICKUP (app/present/pickup.ts) AND THE ACCEPTED SOURCE (app/present/accepted.ts). Getters,
// the same reason \`__queued\`, \`__writes\` and \`__served\` are: a suite reads what the page
// is holding NOW. \`__collect\` is exported so a suite can drive ONE pickup attempt without waiting
// out a real \`setTimeout\` — the timer is the page's and the policy is the module's, and a test that
// could only wait ten seconds could prove neither.
export const __pickups = () => pickups;
export const __accepted = () => accepted;
// THE ROWS OF THE VIEW ON SCREEN (app/present/rows.ts). A getter, the same reason \`__accepted\`
// and \`__draft\` are: a suite reads the table the page is holding NOW, and what changes under it
// is which rows survived, what they are called and which one is selected. It is the ONLY way to
// tell "the row the operator typed is still that row" apart from "a row with the same characters
// is on screen", which are the same pixels and different facts.
export const __rows = () => rows;
export { collect as __collect, startPickup as __startPickup };
`;

  const file = join(workDir, "page.mjs");
  writeFileSync(file, mutate(source));
  return file;
}

/**
 * Replace `pattern` with `replacement` exactly once, asserting it was really there.
 *
 * The whole value of a mutation proof is that the mutation LANDED. A `String.replace` whose pattern
 * has drifted returns the original string and the suite then proves the unmodified page still
 * works — a green test reporting the opposite of what it claims. This refuses instead.
 */
export function assertMutated(source, pattern, replacement) {
  const occurrences = source.split(pattern).length - 1;
  assert.equal(occurrences, 1, `the mutation pattern must appear exactly once, found ${occurrences}: ${pattern}`);
  return source.replace(pattern, replacement);
}

/**
 * EVERY RESOLVER'S SOURCE, READ OFF DISK — the ground the "nothing in app/ does X" invariants have
 * to cover now that the resolvers are not on the page any more.
 *
 * THE DIRECTORY IS ENUMERATED, NOT LISTED. Eight test files pin `` `.markdown` is never ASSIGNED in
 * app/ `` and its siblings, and every one of them used to read exactly two files: the page and
 * paint.ts. If those greps had stayed pointed at two files while the code they protect moved into a
 * third, the invariant would have kept passing and stopped meaning anything — which is the same
 * failure a hand-written list of resolver files would reintroduce the day a fifth one lands. So
 * this reads whatever is in the directory.
 */
export const RESOLVER_SOURCES = (() => {
  const dir = join(REPO, "app", "present", "resolvers");
  const sources = { "app/present/resolve.ts": readFileSync(join(REPO, "app", "present", "resolve.ts"), "utf8") };
  for (const name of readdirSync(dir).sort()) {
    if (name.endsWith(".ts")) {
      sources[`app/present/resolvers/${name}`] = readFileSync(join(dir, name), "utf8");
    }
  }
  assert.ok(Object.keys(sources).length > 1, "app/present/resolvers/ holds no modules — the greps below are vacuous");
  return sources;
})();

/** One resolver module's source, by spec name (`membership`, `ordering`, `rules`, `promotion`). */
export function resolverSource(name) {
  const source = RESOLVER_SOURCES[`app/present/resolvers/${name}.ts`];
  assert.ok(source, `app/present/resolvers/${name}.ts does not exist — this test is checking the wrong source`);
  return source;
}

/**
 * Point the lifted page at a MUTATED COPY of `dist/present.js` instead of the real one.
 *
 * WHY THIS IS NOT `assertMutated(source, was, url)` ANY MORE. The page names the bundle TWICE
 * since the resolvers moved into it: once in its own `import` statement, and once in the test seam
 * this fixture appends (which imports the four `ResolverSpec`s). `assertMutated` refuses anything
 * other than exactly one occurrence, on purpose — a mutation proof whose pattern has drifted is a
 * green test reporting the opposite of what it claims. Here BOTH occurrences must move, or the
 * page would run the mutant while the seam kept reading the real bundle and the two would disagree
 * about what the code under test says. So this replaces every occurrence and refuses zero.
 */
export function repointBundle(source, mutantUrl) {
  const was = JSON.stringify(pathToFileURL(join(REPO, "dist", "present.js")).href);
  const occurrences = source.split(was).length - 1;
  assert.ok(occurrences > 0, `the lifted page names no bundle to repoint: ${was}`);
  return source.split(was).join(JSON.stringify(mutantUrl));
}

/**
 * A page rewriter that points the lifted page at a MUTATED COPY of the bundle.
 *
 * `mutatingBundle(...pairs)(workDir)` returns the `mutate` function `importPage` takes. It writes
 * the mutant beside the lifted page and repoints BOTH bundle references (the page's own import and
 * this fixture's resolver seam) at it.
 *
 * WHY THIS IS SHARED RATHER THAN COPIED. Three suites cut this seam and a fourth now needs it,
 * because the code their mutation proofs target moved out of `app/index.html` and into
 * `app/present/`. Four copies of a mutation harness is four things to keep in step with the page —
 * the exact failure this whole fixture exists to prevent.
 *
 * THE PATTERNS ARE THE BUNDLE'S OWN TEXT. esbuild escapes non-ASCII on the way out (an em dash
 * becomes `\u2014`), so a pattern carrying the literal character matches nothing — and
 * `assertMutated` fails loudly rather than producing a green proof against unmodified code.
 */
export function mutatingBundle(...pairs) {
  return (workDir) => {
    let mutated = readFileSync(join(REPO, "dist", "present.js"), "utf8");
    for (const [pattern, replacement] of pairs) {
      mutated = assertMutated(mutated, pattern, replacement);
    }
    const file = join(workDir, "present.mutated.js");
    writeFileSync(file, mutated);
    return (source) => repointBundle(source, pathToFileURL(file).href);
  };
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
    // Where the caret landed. Recorded rather than simulated, same posture as `focus()` above —
    // `a`'s "caret at end of line" is otherwise unobservable through this stub.
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    append(...nodes) {
      this.children.push(...nodes);
      for (const node of nodes) node._parent = this;
    },
    // THE SETTLE AFFORDANCE'S OWN REACH — `paint.ts`'s `settleRow` is the first thing in this
    // bundle to reorder an already-appended child, and this stub is the fixture-file's own
    // instance of the rule `tests/fixtures/dom-stub.mjs` states for itself: a painter reaching for
    // a new piece of the DOM fails loudly unless the stub is widened on purpose. Standard `Node`
    // semantics — remove `node` from wherever it already sits in THIS element's children, then
    // splice it back in immediately before `referenceNode`, or at the end when that is `null`.
    insertBefore(node, referenceNode) {
      const at = this.children.indexOf(node);
      if (at !== -1) this.children.splice(at, 1);
      node._parent = this;
      if (referenceNode === null || referenceNode === undefined) {
        this.children.push(node);
        return node;
      }
      const refAt = this.children.indexOf(referenceNode);
      this.children.splice(refAt === -1 ? this.children.length : refAt, 0, node);
      return node;
    },
    // WHERE THE ROW SITS — a MINIMAL layout model derived from this element's own index among its
    // current parent's children, times an arbitrary constant row height, mirroring
    // tests/fixtures/dom-stub.mjs's own version of this method (see that file for the full
    // rationale). Enough for `settleRow`'s FLIP arithmetic (paint.ts) to see a real, non-zero,
    // sign-correct delta the instant a reorder changes an element's index, without this fixture
    // pretending to lay out text. `_top`, when a suite sets it directly, wins.
    getBoundingClientRect() {
      const top = this._top ?? (this._parent ? this._parent.children.indexOf(this) * 24 : 0);
      return { top, left: 0, right: 0, bottom: top, width: 0, height: 0 };
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

/**
 * `presentation.json` as it ships, read off disk — the document `/presentation.json` really serves.
 *
 * IT IS READ, NOT IMPORTED, AND THAT IS THE POINT OF THE WHOLE CHANGE THIS FIXTURE NOW SUPPORTS.
 * `app/present/embedded-declaration.ts` imported this file into `dist/present.js` at build time;
 * that module is deleted (design-config-is-content.md step 2) and the bundle no longer carries a
 * copy. A suite wanting the real declaration reads the real file, exactly as the page now fetches
 * the real URL.
 */
export const SERVED_DECLARATION = JSON.parse(
  readFileSync(join(REPO, "presentation.json"), "utf8"),
);

/**
 * Wrap a fetch stub so the DECLARATION request is answered and everything else falls through.
 *
 * WHY EVERY PAGE SUITE NEEDS THIS NOW. `loadPresentation()` is a fetch again, and the stubs these
 * suites install are written for the page's POST paths — they read `init.body` and would throw on
 * a bodyless GET. Rather than teach a dozen stubs about a request they do not care about, this
 * answers the declaration and hands everything else to the stub unchanged.
 *
 * `declaration` DEFAULTS TO WHAT ACTUALLY SHIPS. A suite proving the app runs on a document that
 * was never in the bundle passes its own instead — which is the same wire the real page reads, not
 * a back door around it.
 */
export function withDeclaration(stub, declaration = SERVED_DECLARATION) {
  return async (url, init) => {
    if (String(url) === DECLARATION_URL) {
      return { ok: true, status: 200, json: async () => declaration };
    }
    return stub(url, init);
  };
}

/**
 * The page's own declaration URL, read out of `app/index.html` rather than restated here.
 *
 * A CONSTANT COPIED INTO A FIXTURE IS A CONSTANT THAT CAN DISAGREE WITH THE PAGE — and a fetch stub
 * keyed on the stale one would answer nothing, the page would fall back to its defaults, and the
 * suites would go quietly wrong rather than red. This refuses to load instead.
 */
export const DECLARATION_URL = (() => {
  const html = readFileSync(join(REPO, "app", "index.html"), "utf8");
  const match = /const DECLARATION_URL = "([^"]+)";/.exec(html);
  assert.ok(match, "app/index.html no longer declares DECLARATION_URL");
  return match[1];
})();

/**
 * Import the lifted page once, with a fetch stub installed. Returns the module.
 *
 * ONE MODULE INSTANCE PER `workDir`, because node caches by path — so a suite wanting a MUTATED
 * page beside an unmutated one asks for a second `makeWorkDir` and passes `mutate`. Two calls with
 * the same directory return the same module, which is what every existing caller relies on.
 */
export async function importPage(workDir, mutate) {
  return import(pathToFileURL(extractPageScript(workDir, mutate)).href);
}

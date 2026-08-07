/**
 * locations_field_has_no_reader — the pinned capability
 * `locations-field-is-the-declared-answer-to-line-relocation` (monorepo
 * docs/architecture/capabilities.yaml) descends here: this is the app-repo half of that
 * descent, and what it finds is a REFUSAL, not a wire-up.
 *
 * Run by flow-trace's node observer (`flow-trace verify .`). Not picked up by `npm test`, which
 * globs `tests/**\/*.test.mjs`.
 *
 * ── THE BRIEF THIS SCENARIO ANSWERS ──
 *
 * The monorepo side of this arc wires `server/app.py`'s `locations` envelope key from the
 * engine's own `RenderedLineRecord`s — it was declared, "node -> {view,line}", and shipped
 * `{}` since inception. The obvious next question is whether `viewSources()`
 * (`app/index.html`), the brute-force text search that field was supposed to make
 * unnecessary, can now be rewired to consult it. **The falsifiable claims below show it
 * cannot, structurally, and name the two separate reasons — one architectural, one about
 * this very instrument's own blind spot.**
 *
 * ── THE FALSIFIABLE CLAIMS ──
 *
 * 1. `stampsOwed` and `stampsLanded` (`app/present/correlation.ts`, the module that actually
 *    performs the text search `viewSources()` feeds) import NOTHING but `./express/
 *    rendition.js` for the stamp grammar. No import of any module a server-populated
 *    `locations` map could arrive through, and no parameter shaped like one either — their
 *    signatures take `string`/`string[]`/`Iterable<string>` only. A `locations` field cannot
 *    reach this search without a signature change neither this scenario nor the monorepo PR
 *    it descends from makes.
 *
 * 2. `stampsOwed` is computed BEFORE the line that would key a `locations` lookup exists.
 *    Driven directly: a genuinely new (create) line has no `[[qntm:N]]` stamp yet, so it has
 *    no `node_id` — the ONLY key a `locations: {node_id: […]}` map is indexed by. The owed
 *    set for a create is therefore never answerable by ANY node-keyed structure, no matter
 *    how completely the server populates one — this is the load-bearing refutation of the
 *    brief's premise for this specific consumer, proven by driving the real function with a
 *    real create/edit/tick fixture rather than argued in prose.
 *
 * 3. An EDIT to an already-stamped line, and a plain checkbox TICK, both produce an EMPTY
 *    `owed` set (driven below) — `stampsLanded` short-circuits `true` before touching any
 *    markdown at all in that case (correlation.ts's own early return). So the expensive
 *    search this capability is about is bounded to CREATE writes only, already, today,
 *    independent of anything this arc changes. `locations` cannot shrink that further because
 *    of claim 2, and it was never the cost driver for the tick/edit path because of this claim.
 *
 * 4. `viewSources()` — the function actually named in the brief — is NOT observable by this
 *    instrument at all, and that is reported here rather than routed around. It is defined
 *    inline inside `app/index.html`'s `<script type="module">`, and `.flow-trace.yaml`'s own
 *    `modules` block (bottom of the file) already documents why: capture is a node
 *    module-load hook, and node cannot import an HTML document. So no scenario anywhere in
 *    this tree can drive `viewSources()` through the observer and produce a flow-trace edge
 *    for it — this claim proves that by reading `app/index.html`'s own source (never by
 *    importing it, since it cannot be imported) and confirming the function still exists,
 *    still reads only `data?.snapshot?.views[].markdown`, and still contains no reference to
 *    `locations` or `snapshot.locations` anywhere in the file. That absence is the honest
 *    measurement: today, with the server's `locations` key now populated, the shipped client
 *    still has ZERO readers of it. Wiring one is out of scope for a consumer that cannot
 *    consult it (claim 2) — the gap this claim reports is a DIFFERENT one: this instrument's
 *    own reach, not a defect in the client.
 *
 * ── WHAT IS STUBBED, AND WHY THAT IS HONEST ──
 *
 * Nothing under `app/present/` is stubbed — `stampsOwed` and `stampsLanded` run for real.
 * `viewSources()` and `collect()` are read as TEXT, never executed and never stubbed as a
 * stand-in for a real edge — see claim 4. A stand-in that reported a green edge for
 * `viewSources()` would be exactly the "declaration that exists and does not reach" defect
 * this whole arc exists to correct, so this scenario declines to fake one.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { stampsOwed, stampsLanded } from "../../app/present/correlation.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** CLAIM 1 — `correlation.ts` imports nothing that could carry a server-side `locations` map. */
function assertCorrelationImportsNothingLocationsShaped(): void {
  const source = readFileSync(resolve(HERE, "../../app/present/correlation.ts"), "utf8");
  const imports = source
    .split(/\r?\n/)
    .filter((line) => /^\s*import\b/.test(line))
    .map((line) => line.trim());
  const unexpected = imports.filter((line) => !line.includes("./express/rendition.js"));
  if (unexpected.length !== 0) {
    throw new Error(
      `app/present/correlation.ts imports something beyond the stamp grammar ` +
        `(${unexpected.join(" | ")}) — a locations-shaped input may have arrived; re-check ` +
        "this claim rather than trusting it",
    );
  }
  // Comments are prose, not code — correlation.ts's own header already uses the English word
  // "locations" (plural, describing WHERE in an envelope the echo appears) with no relation to
  // a `locations`-keyed data structure. Stripping block AND line comments before scanning is
  // what keeps this claim about the CODE rather than about a word that appears in prose.
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  if (/\blocations\b/i.test(codeOnly)) {
    throw new Error(
      "app/present/correlation.ts's CODE (comments excluded) now references 'locations' — " +
        "this scenario's claim that the search is locations-blind needs re-deriving, not " +
        "silently kept",
    );
  }
}

/** CLAIM 2 — a CREATE line has no stamp yet, so it has no node_id: no `locations` key exists for it. */
function driveTheCreateCase(): void {
  const before = "## Inbox\n## Domain Empty\n- [ ] Ring the dentist [[qntm:2603]] #task";
  const after =
    "## Inbox\n## Domain Empty\n- [ ] Ring the dentist [[qntm:2603]] #task\n" +
    "- [ ] Lesley pay tenner #task";
  const owed = stampsOwed(before, after);
  if (owed.length !== 1 || owed[0] !== "Lesley pay tenner #task") {
    throw new Error(
      `expected exactly one owed body for the new unstamped line, got ${JSON.stringify(owed)}`,
    );
  }
  // The owed body carries no `[[qntm:N]]` of its own — by construction, since it is unstamped —
  // so there is no node_id a `locations: {node_id: […]}` map could be indexed by for this write,
  // no matter how complete that map is server-side. Proven structurally, not merely stated: the
  // body string itself contains no bracket at all.
  if (owed[0].includes("[[qntm:")) {
    throw new Error("the owed body unexpectedly carries a stamp — the fixture is not a create");
  }
  // The search still has real work to do WHILE the line sits in a projection unstamped — this
  // is the polling window the search exists for. `before` is the wrong fixture for this half
  // (it never held the line at all, which is the OTHER satisfied case, "gone" — see below), so
  // this checks against `after`, the projection this write itself produced.
  if (stampsLanded(owed, [after])) {
    throw new Error("stampsLanded must still be owed while the new line sits unstamped");
  }
  // Satisfied once the line arrives WITH a stamp — proving the search's only mechanism is
  // reading the stamp off the text, never a side-channel lookup by id.
  const stampedElsewhere =
    "## Outcomes\n- [ ] Lesley pay tenner [[qntm:2701]] #task 🆕 2026-08-07";
  if (!stampsLanded(owed, [before, stampedElsewhere])) {
    throw new Error(
      "stampsLanded must be satisfied once the body is stamped, even in a DIFFERENT view — " +
        "this is the 'engine moved it' case the search exists for",
    );
  }
  // Also satisfied if the body is simply GONE from every view (reworded, deleted, or never
  // published) — `before` never held it, which stands in for that outcome. This is the second
  // of the two satisfying conditions `stampsLanded`'s own header names, and it is exactly as
  // locations-blind as the stamped case: nothing here is keyed by node_id either.
  if (!stampsLanded(owed, [before])) {
    throw new Error("stampsLanded must also be satisfied when the body is gone from every view");
  }
}

/** CLAIM 3 — a tick and an edit-to-an-existing-stamped-line both cost nothing: `owed` is empty. */
function driveTheCheapPaths(): void {
  const stampedLine = "- [x] Ring the dentist [[qntm:2603]] #task";
  const tickBefore = "## Inbox\n- [ ] Ring the dentist [[qntm:2603]] #task";
  const tickAfter = `## Inbox\n${stampedLine}`;
  const tickOwed = stampsOwed(tickBefore, tickAfter);
  if (tickOwed.length !== 0) {
    throw new Error(`a checkbox tick must owe nothing, got ${JSON.stringify(tickOwed)}`);
  }

  const editBefore = "## Inbox\n- [ ] Ring the dentist [[qntm:2603]] #task";
  const editAfter = "## Inbox\n- [ ] Ring the dentist urgently [[qntm:2603]] #task";
  const editOwed = stampsOwed(editBefore, editAfter);
  if (editOwed.length !== 0) {
    throw new Error(`an edit to an already-stamped line must owe nothing, got ${JSON.stringify(editOwed)}`);
  }

  // Empty owed short-circuits BEFORE any markdown is scanned — the cheap path is cheap
  // regardless of how many views are passed in, and regardless of `locations`.
  if (!stampsLanded(tickOwed, [])) {
    throw new Error("an empty owed set must be satisfied immediately, scanning nothing");
  }
}

/**
 * CLAIM 4 — `viewSources()` cannot be driven through this instrument at all, and this claim
 * says so by reading `app/index.html` as text (the only access this instrument or any other
 * node-based one has to it) rather than importing it.
 */
function assertViewSourcesIsUnobservedAndUnwired(): void {
  const appHtmlPath = resolve(HERE, "../../app/index.html");
  const source = readFileSync(appHtmlPath, "utf8");
  const fnMatch = source.match(/function viewSources\(data\) \{([\s\S]*?)\n\}/);
  if (fnMatch === null) {
    throw new Error(
      "app/index.html no longer defines viewSources(data) the way this scenario expects — " +
        "the function moved or was renamed; re-derive this claim rather than deleting it",
    );
  }
  const body = fnMatch[1];
  if (!body.includes("data?.snapshot?.views") || !body.includes("v?.markdown")) {
    throw new Error("viewSources() no longer reads snapshot.views[].markdown — re-derive this claim");
  }
  if (/\.locations\b/.test(body) || /snapshot\?\.locations/.test(body)) {
    throw new Error(
      "viewSources() now references '.locations' — the client has grown a reader and this " +
        "scenario's central claim (it is locations-blind today) is stale",
    );
  }
  // The stronger, structural half of this claim: NOTHING in app/index.html references
  // `snapshot.locations` or `data.snapshot.locations` anywhere, not just inside viewSources
  // itself — the whole file has no reader for the key the monorepo PR this descends from just
  // started populating.
  if (/snapshot\??\.locations\b/.test(source)) {
    throw new Error(
      "app/index.html now reads snapshot.locations somewhere — the 'zero readers today' " +
        "measurement this claim makes is stale and must be re-derived, not silently trusted",
    );
  }
}

export function run(): void {
  assertCorrelationImportsNothingLocationsShaped();
  driveTheCreateCase();
  driveTheCheapPaths();
  assertViewSourcesIsUnobservedAndUnwired();
}

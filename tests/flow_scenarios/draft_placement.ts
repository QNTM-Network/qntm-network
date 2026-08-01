/**
 * draft_placement — WHERE A LINE THAT IS IN NO FILE GOES when the file it is not in is replaced.
 *
 * Run by flow-trace's node observer (`flow-trace verify .`). Not picked up by `npm test`, which
 * globs `tests/**\/*.test.mjs`; every claim below is additionally proved under `node --test` by
 * tests/present-replay.test.mjs section 8 and tests/app-open-line-survives.test.mjs.
 *
 * ── WHY THIS FILE EXISTS ──
 *
 * `a-line-being-made-survives-a-projection-too` gives `draft.ts` its first outward edges. Until
 * this row it imported nothing and reached nothing; it now reaches `instance.ts` (to resolve the
 * row's neighbour) and `relative.ts` (for the one predicate that decides whether the arriving file
 * has taken the characters back). An edge that exists and is not declared reports as drift, and an
 * edge that is declared and never driven reports as a commitment the code stopped honouring — so
 * the four new edges are declared in `docs/architecture/flows.yaml` and driven here.
 *
 * ── THE FALSIFIABLE CLAIMS ──
 *
 * 1. `draft.ts` REACHES EXACTLY TWO MODULES, and neither is `source.ts`. The row's whole output is
 *    a LINE INDEX, which is what `applyEdit` takes — the same hazard `relative.ts` already carries
 *    a `forbidden_flows` entry for, one module further on. Asserted by reading its own source.
 *
 * 2. THE PLACE IS TAKEN ON THE NEIGHBOUR, ABOVE FIRST. A draft is in NEITHER source string by
 *    construction, so it cannot carry a relative anchor of its own; what it has is the line it was
 *    opened beside.
 *
 * 3. THE ROW SURVIVES A PROJECTION THAT MOVED IT. The cycle files something above the row and the
 *    placement moves with it — the apex capability's second blocker, driven.
 *
 * 4. AND SURVIVES THE FIRST STAMP OF ITS OWN NEIGHBOUR, by the `relative` rung. This is the case
 *    the row could never reach for itself and reaches through `resolveInstanceAnchor` — the
 *    operator's own double capture: type a thing, press Enter, press `o`, keep typing.
 *
 * 5. A ROW THE PROJECTION ALREADY CARRIES IS RELEASED, not duplicated. `extendsLine` is the
 *    predicate, which is `held.ts`'s own release rule reached through `relative.ts` rather than
 *    written a third time.
 *
 * 6. A REFUSAL IS A REFUSAL. The neighbour leaves the view and the placement says `unplaced` with a
 *    reason, rather than putting the row at an index that means nothing.
 *
 * ── WHAT IS STUBBED, AND WHAT IS NOT ──
 *
 * Nothing under `app/` is stubbed — the real `draft.ts`, `instance.ts`, `relative.ts` and
 * `resolution.ts` run. What is replaced is the ENVIRONMENT: `document`, `fetch` and `Date.now` all
 * throw for the whole of the drive, so a module that reached for one says which one.
 *
 * ── WHAT THIS SCENARIO DOES NOT COVER ──
 *
 * No DOM, no painting, no browser, no page, and no cycle. `app/index.html` is where the placement
 * is acted on and it is unobservable here by construction (node cannot import an HTML document);
 * tests/app-open-line-survives.test.mjs drives that half under `node --test` instead. Every arrival
 * below is a fixture, hand-built the way a real cycle transforms a real line.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { placeDraft, placeFor } from "../../app/present/draft.js";
import type { Draft } from "../../app/present/draft.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW = "inbox";
const SEED = "- [ ] ";

/** `~/qntm/inbox.md`'s own shape, read read-only 2026-08-01 — newest first, every line stamped. */
const INBOX = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
  "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
].join("\n");

/** The same file with a fresh capture filed above — what the cycle does to an inbox. */
const FILED_ABOVE = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] New capture from the phone [[qntm:2610]] #task 🆕 2026-08-01",
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
  "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
].join("\n");

/** The inbox with the neighbour gone entirely — nothing beside the row survives. */
const NEIGHBOUR_GONE = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
].join("\n");

/** The row is opened beneath the neighbour at line 2, so it will occupy line 3. */
const AT = 3;

function draftOn(source: string, typed: string): Draft {
  return { lineIndex: AT, seed: SEED, typed, place: placeFor(source, AT, VIEW) };
}

/** CLAIM 1 — read the module's own source; the module graph is stripped by the time this runs. */
function assertDraftReachesOnlyTwo(): void {
  const source = readFileSync(resolve(HERE, "..", "..", "app", "present", "draft.ts"), "utf8");
  const imports = [...source.matchAll(/^import[^;]*from "\.\/([a-z]+)\.js";$/gm)].map((m) => m[1]);
  const reached = [...new Set(imports)].sort();
  if (reached.join(",") !== "instance,relative") {
    throw new Error(`draft.ts reaches ${reached.join(",") || "nothing"} — expected instance,relative`);
  }
}

/** The three capabilities a pure module must not have, made to say so. */
function poisonDomFetchAndClock(): () => void {
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const savedFetch = globalThis.fetch;
  const savedNow = Date.now;
  const explode = (what: string) => () => {
    throw new Error(`draft placement reached for ${what}`);
  };
  Object.defineProperty(globalThis, "document", {
    value: new Proxy({}, { get: explode("the DOM") }),
    configurable: true,
    writable: true,
  });
  (globalThis as { fetch: unknown }).fetch = explode("the network");
  Date.now = explode("the clock") as typeof Date.now;
  return () => {
    if (savedDocument === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      Object.defineProperty(globalThis, "document", savedDocument);
    }
    (globalThis as { fetch: unknown }).fetch = savedFetch;
    Date.now = savedNow;
  };
}

/** CLAIM 2 — the place is the neighbour ABOVE. */
function driveThePlace(): void {
  const place = placeFor(INBOX, AT, VIEW);
  if (place === null || place.side !== "above" || place.anchor.node !== "qntm:2603") {
    throw new Error(`the place is not the neighbour above — got ${JSON.stringify(place)}`);
  }
}

/** CLAIM 3 — the cycle moved the row, and the row moved with it. */
function driveTheSurvival(): void {
  const placement = placeDraft(draftOn(INBOX, "- [ ] Call the bank"), INBOX, FILED_ABOVE, VIEW);
  if (placement.outcome !== "placed" || placement.lineIndex !== AT + 1) {
    throw new Error(`the row did not follow its neighbour — got ${JSON.stringify(placement)}`);
  }
}

/** CLAIM 4 — the neighbour was unstamped and the cycle stamped it. The `relative` rung answers. */
function driveTheFirstStamp(): void {
  const before = [
    "## Inbox",
    "## Domain Empty",
    "- [ ] Lesley pay tenner",
    "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
  ].join("\n");
  const placement = placeDraft(draftOn(before, "- [ ] Call the bank"), before, INBOX, VIEW);
  if (placement.outcome !== "placed" || placement.via !== "relative") {
    throw new Error(`the first stamp broke the row's place — got ${JSON.stringify(placement)}`);
  }
}

/** CLAIM 5 — the projection brought his line back, so the row is released rather than duplicated. */
function driveTheRelease(): void {
  const before = [
    "## Inbox",
    "## Domain Empty",
    "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
  ].join("\n");
  const draft: Draft = {
    lineIndex: 2,
    seed: SEED,
    typed: "- [ ] Lesley pay tenner",
    place: placeFor(before, 2, VIEW),
  };
  const placement = placeDraft(draft, before, INBOX, VIEW);
  if (placement.outcome !== "arrived") {
    throw new Error(`a line the cycle ingested must be released — got ${JSON.stringify(placement)}`);
  }
}

/** CLAIM 6 — the neighbour left, and the row refuses rather than landing somewhere invented. */
function driveTheRefusal(): void {
  const placement = placeDraft(draftOn(INBOX, "- [ ] Call the bank"), INBOX, NEIGHBOUR_GONE, VIEW);
  if (placement.outcome !== "unplaced") {
    throw new Error(`a lost neighbour must refuse, not guess — got ${JSON.stringify(placement)}`);
  }
  if (placement.because !== "absent") {
    throw new Error(`a refusal must say WHY — got ${placement.because}`);
  }
}

export function run(): void {
  assertDraftReachesOnlyTwo();
  const restoreEnvironment = poisonDomFetchAndClock();
  try {
    driveThePlace();
    driveTheSurvival();
    driveTheFirstStamp();
    driveTheRelease();
    driveTheRefusal();
  } finally {
    restoreEnvironment();
  }
}

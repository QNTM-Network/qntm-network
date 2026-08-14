/**
 * THE SEED RESOLVES FROM THE VIEW'S DECLARATION, NOT FROM WHATEVER THE NEIGHBOUR HAPPENS TO SAY.
 *
 *   node --test tests/app-seed-from-cascade.test.mjs
 *
 * ── THE OBSERVATION, FROM A REAL BROWSER RUN (2026-08-01) ──
 *
 * `o` on a real line seeded exactly the right thing — `- [ ] #task #personal ` in `personal/all`,
 * `- [ ] #task ` in `inbox`. `o` on the TRAILING BLANK LINE seeded a bare `- [ ] ` in BOTH. The
 * feature was passing every test it had while giving the right answer for the wrong reason: it was
 * copying the neighbour, and his neighbours happen to carry the right tags.
 *
 * ── WHAT WAS ACTUALLY WRONG, MEASURED RATHER THAN ARGUED ──
 *
 * NOT the rung order. `chromeFor`'s printed rungs (LINE, STRUCTURAL_NODE, VIEW) answered correctly
 * at every index measured, the trailing blank line included — `STRUCTURAL_NODE`, chrome `- [ ] `,
 * from the line above. The CHROME was never the defect. What was lost is the TOKENS.
 *
 * `seedFor` named the section with `sectionAt(source, lineIndex, …)`. `lineIndex` is an INSERTION
 * index — the index the new line WILL OCCUPY, `applyEdit`'s `insert-line` convention — and
 * `sectionAt` answers for a line that EXISTS at that index. `sectionOrdinalAt` refuses
 * `lineIndex >= lines.length`, correctly: nothing is there to read. `o` on the trailing blank line
 * asks for exactly `lines.length`. So the section came back `null`, the tokens fell to `[]`, and
 * the chrome carried on arriving from the neighbour.
 *
 * The fix is `sectionForInsertAt` (app/present/address.ts) and it is one subtraction — see that
 * function's own header. `sectionAt` is untouched.
 *
 * ── THE SEVEN SECTIONS ──
 *
 *   1. THE REPRODUCTION, THROUGH THE PAGE'S OWN KEY WIRING, on his two real files. Red before the
 *      fix, green after — the defect nobody reproduced is the defect nobody fixed.
 *   2. THE FOUR POSITIONS a declaration has to answer for, because printed evidence is absent or
 *      misleading at each: the trailing blank line, above the first heading, an empty section, and
 *      the line above a heading.
 *   3. THE INVARIANCE PROOF over his 71 real views, every insertion index of every one.
 *   4. THE REFUSALS KEPT — each one still fires, none removed to make a case pass.
 *   5. THE CONFIG-CHANGE ACCEPTANCE TEST, both halves, against a scratch copy of his real config.
 *   6. THE MUTATION PROOF — break the fix, watch this file go red.
 *   7. NOTHING LOCAL IS WRITTEN. The pinned write-site counts, asserted at the VALUE level.
 *
 * ── WHAT THIS SUITE DOES NOT VERIFY ──
 *
 * NO BROWSER WAS OPENED. The DOM is `installBrowser`'s stub; section 1 drives the page's real
 * keydown handler, not a real keypress. No graph server, no passkey session, no engine cycle, no
 * POST. Nothing is written to `~/qntm` or `~/.qntm-md` — both are read read-only, and section 5
 * mutates a `cpSync` copy of the config under the runner's temp dir.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { importPage, installBrowser, makeEvent, makeWorkDir, walk, withDeclaration } from "./fixtures/app-html-page.mjs";
import {
  seedFor,
  sectionAt,
  sectionForInsertAt,
  readConfigResolutionDeclaration,
  readQualificationDeclaration,
} from "../dist/present.js";
import { generateResolution } from "../scripts/generate-resolution-declaration.mjs";
import { generateQualification } from "../scripts/generate-qualification-declaration.mjs";
import { DEFAULT_CONFIG_DIR } from "../scripts/monorepo-config.mjs";
import { Ledger } from "../scripts/ledger.mjs";
import { assertOneWritePath } from "./fixtures/write-path-callers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const SERVED = JSON.parse(readFileSync(join(REPO, "presentation.json"), "utf8"));
const RESOLUTION = readConfigResolutionDeclaration(SERVED).resolution;
const QUALIFICATION = readQualificationDeclaration(SERVED).qualification;

const VAULT = join(homedir(), "qntm");
const monorepoAvailable = existsSync(DEFAULT_CONFIG_DIR);
const vaultAvailable = existsSync(VAULT);

/**
 * A `GlobalRegistration` for one of the operator's own views, assembled the way `app/index.html`'s
 * own `globalRegistrationFor` assembles it — from the SERVED declaration, never from a literal.
 */
const declaredFor = (viewId) => ({
  view: viewId,
  sectionOrder: QUALIFICATION.sectionOrder,
  sections: QUALIFICATION.sections,
  chromeShapes: RESOLUTION.chromeShapes,
  sectionRegistration: RESOLUTION.sectionRegistration,
});

/**
 * `~/qntm/inbox.md` and `~/qntm/personal/all.md` as they really print (read read-only,
 * 2026-08-01), TRAILING BLANK LINE INCLUDED — that blank is not incidental to this suite, it is
 * the position the defect lives at, and a fixture that trimmed it would be a fixture the defect
 * cannot appear in. The engine's own writer terminates every rendered view with a newline, so
 * every real view has one.
 *
 * `personal/all.md` is truncated to its first rows; the tail is 30 more lines of the same shape
 * and the seed's answer does not depend on how many there are. What is kept verbatim is the
 * heading, the indentation, the stamps, and the final newline.
 */
const INBOX = [
  "## Inbox",
  "## Domain Empty",
  "- [ ] Lesley pay tenner [[qntm:2603]] #task 🆕 2026-07-31",
  "- [ ] Matt's coverage updates from Adam [[qntm:2602]] #task 🆕 2026-07-31",
  "- [ ] Remove zoe from all coverage [[qntm:2598]] #task 🆕 2026-07-31",
  "",
].join("\n");

const PERSONAL_ALL = [
  "## All Personal",
  "- [ ] Adam birthday present [[qntm:783]] #outcome #personal 🆕 2026-06-08",
  "    - [ ] Buy domain [[qntm:866]] #task #personal 🆕 2026-06-10",
  "- [ ] Pay back per Darinz' plan said on 16th May [[qntm:1232]] #outcome #personal",
  "- [ ] Check personal outcomes [[qntm:1054]] #task #personal 🛫 2026-07-27 🆕 2026-07-28",
  "",
].join("\n");

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE REPRODUCTION — through app/index.html's own lifted script, on his two real files
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. `o` ON THE TRAILING BLANK LINE — the browser's own observation, driven", () => {
  const WORK = makeWorkDir("app-seed-from-cascade");
  let page;
  let elements;
  let doc;

  before(async () => {
    ({ elements, document: doc } = installBrowser());
    globalThis.fetch = withDeclaration(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    page = await importPage(WORK);
    // THE DECLARATION HAS TO BE LOADED, and this is the page's own loader — not a fixture. It is
    // AWAITED now, and the stub above answers the request: the declaration is FETCHED from
    // `/presentation.json` rather than read from a constant baked into dist/present.js
    // (design-config-is-content.md step 2). Without it `globalRegistrationFor` returns `undefined`,
    // `seedFor` gets no declaration, and every assertion below would measure the chrome-only seed
    // that shipped before the tokens existed at all.
    await page.loadPresentation();
  });

  const view = (id, path, title, markdown) => ({ id, path, title, domain: "all", markdown });
  const snapshot = () => ({
    generated_at: "2026-08-01T09:00:00Z",
    views: [
      view("inbox", "inbox.md", "Inbox", INBOX),
      view("all-personal", "personal/all.md", "All Personal", PERSONAL_ALL),
    ],
  });
  const inputs = () =>
    walk(elements.get("viewBody")).filter((el) => el.tagName === "input" && el.type === "text");
  const press = (key) => doc.dispatch("keydown", makeEvent({ key }));

  /**
   * Land in `viewId`, put the cursor where `place` says, press `o`, return the open row's value.
   *
   * IT DRIVES THE PAGE'S OWN KEY WIRING rather than calling `openLine` — `app/index.html` is
   * outside tsconfig, outside the bundle and outside every enforcer this repo has, so a suite that
   * reimplemented its wiring would stay green while the page rotted. `G` is the page's own motion
   * for "the last line", which on every real view IS the trailing blank line.
   */
  const openAt = (viewId, place) => {
    page.__setGraphData({ snapshot: snapshot() });
    page.__setCurrentViewId(viewId);
    page.paintView(viewId, "chosen");
    place(press);
    press("o");
    const row = inputs()[0];
    assert.ok(row, `\`o\` opened no row in ${viewId} — the page declined`);
    return row.value;
  };

  const toLastLine = (press) => {
    press("g");
    press("g");
    press("G");
  };

  // 2026-08-06: the SEED TEXT changed shape once `resolution.composition` is declared and
  // `newline.ts`'s `seedFor` composes it (see that module's own header, "THE `o` SEED"). The title
  // slot reserves ITS OWN separator on both sides — one from the checkbox's trailing space, one
  // from the separator between the (not-yet-typed) title and the declared tag — so the seed carries
  // a double space where the title goes, rather than a single trailing space at the string's end.
  // That double space is not a defect: `openAt`'s row also carries `cursorOffset` (asserted below,
  // via `row.selectionStart` — see `paint.ts`'s `paintDraft`), placed exactly BETWEEN the two
  // spaces, so the first character typed lands where the title belongs and both spaces resolve to
  // one on either side of it, matching the engine's own title-then-tag order.

  test("in `personal/all` it seeds `- [ ]  #task #personal`, the same as one line higher", () => {
    assert.equal(
      openAt("all-personal", toLastLine),
      "- [ ]  #task #personal",
      "`o` on the trailing blank line copied the neighbour's chrome and dropped the declaration",
    );
  });

  test("in `inbox` it seeds `- [ ]  #task`, the same as one line higher", () => {
    assert.equal(
      openAt("inbox", toLastLine),
      "- [ ]  #task",
      "`o` on the trailing blank line copied the neighbour's chrome and dropped the declaration",
    );
  });

  // THE CONTROL, AND IT IS THE HALF THAT ALWAYS WORKED. Stated here so the two assertions above
  // are a comparison rather than a bare literal: what the trailing blank line now gives is exactly
  // what a real line already gave, which is the operator's own way of putting it.
  test("THE CONTROL: `o` on a real line is unchanged, in both views", () => {
    assert.equal(openAt("all-personal", (press) => (press("g"), press("g"), press("j"))), "- [ ]  #task #personal");
    assert.equal(
      openAt("inbox", (press) => (press("g"), press("g"), press("j"), press("j"))),
      "- [ ]  #task",
    );
  });

  test("the cursor sits BEFORE the declared tag, where the title belongs — the `o` seed fix", () => {
    page.__setGraphData({ snapshot: snapshot() });
    page.__setCurrentViewId("all-personal");
    page.paintView("all-personal", "chosen");
    toLastLine(press);
    press("o");
    const row = inputs()[0];
    assert.equal(row.value, "- [ ]  #task #personal");
    assert.equal(row.selectionStart, 6, "cursor must land right after the checkbox, before the tag");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE FOUR POSITIONS — where printed evidence is absent or misleading
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. THE FOUR POSITIONS a declaration has to answer for", () => {
  const ORDER = QUALIFICATION.sectionOrder;

  test("THE TRAILING BLANK LINE: `sectionAt` cannot address it; `sectionForInsertAt` can", () => {
    const at = INBOX.split("\n").length; // 6 — one past the last line, `o`'s own target
    assert.equal(sectionAt(INBOX, at, "inbox", ORDER), null, "the diagnosis is wrong: sectionAt DID answer");
    assert.equal(sectionForInsertAt(INBOX, at, "inbox", ORDER), "domain-empty");
    assert.deepEqual(seedFor(INBOX, at, declaredFor("inbox")).tokens, ["#task"]);
  });

  test("ABOVE THE FIRST HEADING: neither addresses it, and that refusal is CORRECT", () => {
    // Index 0 is where `O` on the first heading lands. The config declares no section there, so
    // there is nothing to read — and the previous behaviour, which named the FIRST section for it,
    // was seeding one section's meaning onto a line that is in none.
    assert.equal(sectionForInsertAt(INBOX, 0, "inbox", ORDER), null);
    assert.deepEqual(seedFor(INBOX, 0, declaredFor("inbox")).tokens, []);
    // The CHROME still comes from printed evidence — the refusal is about meaning, not about
    // whether a line can be opened at all.
    assert.equal(seedFor(INBOX, 0, declaredFor("inbox")).text, "- [ ] ");
  });

  test("AN EMPTY SECTION: no line is printed in it, and the declaration answers anyway", () => {
    // `## Inbox` is EMPTY in his real file — every row sits under `## Domain Empty`. A line opened
    // directly under it has no printed evidence in its own section at all.
    const at = 1; // directly under `## Inbox`, above `## Domain Empty`
    assert.equal(sectionForInsertAt(INBOX, at, "inbox", ORDER), "inbox-tagged");
    assert.deepEqual(seedFor(INBOX, at, declaredFor("inbox")).tokens, ["#task"]);
  });

  test("THE LINE ABOVE A HEADING: it is in the section the heading CLOSES, never the one it opens", () => {
    // The arithmetic, on the smallest fixture that can show it. Inserting AT a heading's index
    // pushes the heading DOWN, so the new line lands above it.
    const source = ["## Inbox", "## Domain Empty", "- [ ] a row"].join("\n");
    assert.equal(sectionForInsertAt(source, 1, "inbox", ORDER), "inbox-tagged", "named the section it lands ABOVE");
    assert.equal(sectionAt(source, 1, "inbox", ORDER), "domain-empty", "the read index still names the heading's own");
    assert.equal(sectionForInsertAt(source, 2, "inbox", ORDER), "domain-empty", "under the heading is inside it");
  });

  test("AND NOTHING ELSE MOVED: every interior index agrees with the read index, one lower", () => {
    // The fix is `sectionAt` asked one line earlier and nothing else. Asserted directly rather
    // than left as a claim about the implementation.
    const lines = PERSONAL_ALL.split("\n");
    for (let at = 0; at <= lines.length; at += 1) {
      assert.equal(
        sectionForInsertAt(PERSONAL_ALL, at, "all-personal", ORDER),
        sectionAt(PERSONAL_ALL, at - 1, "all-personal", ORDER),
        `insertion at ${at} did not address as the line below it`,
      );
    }
  });

  test("THE RANGE IS `applyEdit`'s OWN — `lines.length` is in, `lines.length + 1` is out", () => {
    const n = INBOX.split("\n").length;
    assert.notEqual(sectionForInsertAt(INBOX, n, "inbox", ORDER), null);
    assert.equal(sectionForInsertAt(INBOX, n + 1, "inbox", ORDER), null);
    assert.equal(sectionForInsertAt(INBOX, -1, "inbox", ORDER), null);
    assert.equal(sectionForInsertAt(INBOX, 1.5, "inbox", ORDER), null);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE INVARIANCE PROOF — every insertion index of every one of his real views
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Every view this instance declares, paired with the markdown the engine really printed for it.
 * The `path:`/id extraction mirrors `tests/present-address.test.mjs`'s own — a targeted line scan,
 * used only to locate the file, never to decide anything the app ships.
 */
function realViews() {
  const viewsDir = join(DEFAULT_CONFIG_DIR, "views");
  const out = [];
  for (const file of readdirSync(viewsDir)) {
    if (!file.endsWith(".yaml") || file === "default_registration.yaml") continue;
    const text = readFileSync(join(viewsDir, file), "utf8");
    const path = text.match(/^\s*path:\s*(\S+)\s*$/m);
    const id = text.match(/^([A-Za-z0-9_-]+):\s*$/m);
    if (path === null || id === null) continue;
    const mdPath = join(VAULT, path[1].replace(/^["']|["']$/g, ""));
    if (!existsSync(mdPath)) continue;
    out.push({ view: id[1], path: path[1], markdown: readFileSync(mdPath, "utf8") });
  }
  return out;
}

describe("3. THE INVARIANCE PROOF — over his own views, nothing moved that was not wrong", () => {
  const skip =
    monorepoAvailable && vaultAvailable
      ? false
      : `needs both the monorepo (${DEFAULT_CONFIG_DIR}) and the vault (${VAULT}) — this section ` +
        "runs locally and is skipped in CI, which has neither (same posture as present-address.test.mjs)";

  /**
   * THE CLAIM, AND WHY IT IS STATED AS A POSITION RATHER THAN A DIFF. A before/after diff needs a
   * copy of the old bundle, which no test can have once the fix has shipped. What CAN be asserted
   * for ever is the property the diff MEASURED: the only insertion indexes whose answer differs
   * between the old addressing (`sectionAt`) and the new (`sectionForInsertAt`) are the three
   * BOUNDARY positions — index 0, `lines.length`, and a heading's own index. Everywhere else the
   * two agree, which is what "no existing answer moved" means, restated so it cannot rot.
   *
   * The measured run on 2026-08-01: 3524 insertion points across 71 views, 3342 identical, 182
   * moved — 70 at index 0, 65 at `lines.length`, 47 at a heading's index, and ZERO anywhere else.
   */
  test(
    "every insertion index whose section changed is a boundary position — 0, lines.length, or a heading",
    { skip },
    () => {
      let points = 0;
      let moved = 0;
      const positions = { zero: 0, end: 0, heading: 0 };
      for (const { view, path, markdown } of realViews()) {
        const order = QUALIFICATION.sectionOrder[view];
        if (order === undefined) continue;
        const lines = markdown.split("\n");
        const headings = new Set();
        lines.forEach((line, at) => {
          if (/^#{1,6} /.test(line)) headings.add(at);
        });
        for (let at = 0; at <= lines.length; at += 1) {
          points += 1;
          const was = sectionAt(markdown, at, view, QUALIFICATION.sectionOrder);
          const now = sectionForInsertAt(markdown, at, view, QUALIFICATION.sectionOrder);
          if (was === now) continue;
          moved += 1;
          if (at === 0) positions.zero += 1;
          else if (at === lines.length) positions.end += 1;
          else if (headings.has(at)) positions.heading += 1;
          else assert.fail(`${path}:${at} moved from '${was}' to '${now}' and is not a boundary position`);
        }
      }
      assert.ok(points > 3000, `only ${points} insertion points swept — the vault was not really read`);
      assert.equal(
        positions.zero + positions.end + positions.heading,
        moved,
        "an answer moved at a position this proof cannot account for",
      );
      // POSITIVE CONTROLS. A sweep that moved NOTHING would satisfy every assertion above while
      // proving the fix does nothing, so each boundary class is asserted non-empty.
      assert.ok(positions.zero > 0, "no answer moved above a first heading — the sweep is not measuring");
      assert.ok(positions.end > 0, "no answer moved at the end of a file — the defect is not in this sweep");
      assert.ok(positions.heading > 0, "no answer moved at a heading — the sweep found no adjacent headings");
    },
  );

  test("AND THE SEED FOLLOWS: every trailing blank line now seeds its own section's tokens", { skip }, () => {
    let checked = 0;
    let seeded = 0;
    for (const { view, path, markdown } of realViews()) {
      const declared = declaredFor(view);
      const at = markdown.split("\n").length;
      const section = sectionForInsertAt(markdown, at, view, QUALIFICATION.sectionOrder);
      if (section === null) continue;
      const expected = RESOLUTION.sectionRegistration?.[view]?.[section]?.tokens ?? [];
      const seed = seedFor(markdown, at, declared);
      if (seed === null) continue;
      checked += 1;
      assert.deepEqual(seed.tokens, expected, `${path}: the last line seeded the wrong section's tokens`);
      if (seed.tokens.length > 0) seeded += 1;
    }
    assert.ok(checked >= 60, `only ${checked} views' trailing lines answered — expected close to 71`);
    assert.ok(seeded >= 60, `only ${seeded} of them seeded any token at all — the defect is not fixed`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE REFUSALS KEPT — a seed that guesses is worse than one that refuses
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("4. THE REFUSALS — each one still fires, none removed to make a case pass", () => {
  test("NO DECLARATION AT ALL still gets exactly the previous behaviour", () => {
    // No `declared` argument — `cursorOffset` falls back to `text.length` (see `NewLine.
    // cursorOffset`'s own header), the same "cursor at the end" every pre-existing caller got.
    assert.deepEqual(seedFor("## Overdue\n- [ ] a row [[qntm:1]] #task\n", 2), {
      text: "- [ ] ",
      level: "LINE",
      tokens: [],
      cursorOffset: 6,
    });
  });

  test("A LINE IN NO SECTION seeds no tokens — above the first heading, still", () => {
    const printed = "- [ ] a line above every heading\n## All Personal\n";
    assert.deepEqual(seedFor(printed, 0, declaredFor("all-personal")).tokens, []);
  });

  test("A VIEW WITH NO PUBLISHED SEED TABLE still refuses outright", () => {
    // `sections: {}` ALONGSIDE `sectionRegistration: undefined` — 2026-08-06 (job 1, "the last
    // fourteen") closed `all-personal.tasks`'s own qualification, so `declared.sections`
    // answers on its own now (`newline.ts`'s `chromeFor`, rung 4, tries it BEFORE
    // `sectionRegistration`). Stripping `sections` too is what isolates "no seed table AT ALL" —
    // see `tests/present-seed.test.mjs`'s identical fixture for the fuller account.
    assert.equal(
      seedFor(
        "## All Personal\n",
        1,
        { ...declaredFor("all-personal"), sections: {}, sectionRegistration: undefined },
      ),
      null,
      "the GLOBAL rung answered without a table to answer from",
    );
  });

  test("AN UNADDRESSABLE VIEW still refuses — nothing printed, and no section order to read", () => {
    assert.equal(seedFor("## Anything\n", 1, declaredFor("not-a-real-view")), null);
  });

  test("A SOURCE WITH NO HEADING AT ALL still seeds no tokens", () => {
    // No heading means no ordinal means no section — for every index, not only index 0.
    const printed = "- [ ] one line and no heading\n";
    for (const at of [0, 1, 2]) {
      const seed = seedFor(printed, at, declaredFor("all-personal"));
      assert.deepEqual(seed?.tokens ?? [], [], `index ${at} seeded a section's tokens with no section to read`);
    }
  });

  test("AN OUT-OF-RANGE INDEX still refuses outright, and the range is unchanged", () => {
    assert.equal(seedFor(INBOX, INBOX.split("\n").length + 1, declaredFor("inbox")), null);
    assert.equal(seedFor(INBOX, -1, declaredFor("inbox")), null);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE CONFIG-CHANGE ACCEPTANCE TEST — both halves, against a scratch copy of his real config
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. THE ACCEPTANCE TEST — a config change flows through with no code change", () => {
  const skip = monorepoAvailable
    ? false
    : `monorepo not checked out at ${DEFAULT_CONFIG_DIR} — this section runs locally and is skipped in CI`;

  /**
   * Copy his real config to a scratch dir, mutate the copy, regenerate BOTH declarations from it,
   * and hand back what a browser holding them would seed. NOTHING IS WRITTEN TO HIS CONFIG: the
   * copy is `cpSync`'d under the runner's temp dir and removed in a `finally`. No cycle is run.
   */
  function withMutatedConfig(mutate, use) {
    const scratch = mkdtempSync(join(tmpdir(), "seed-from-cascade-"));
    try {
      const configDir = join(scratch, "config");
      cpSync(DEFAULT_CONFIG_DIR, configDir, { recursive: true });
      mutate(configDir);
      const resolution = generateResolution(configDir, new Ledger());
      const qualification = generateQualification(configDir);
      return use({
        declared: (view) => ({
          view,
          sectionOrder: qualification.sectionOrder,
          sections: qualification.sections,
          chromeShapes: resolution.chromeShapes,
          sectionRegistration: resolution.sectionRegistration,
        }),
        resolution,
        qualification,
      });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  test("THE POSITIVE HALF: a NEW view with its own `default_node_type` seeds through the new addressing", { skip }, () => {
    withMutatedConfig(
      (configDir) => {
        writeFileSync(
          join(configDir, "views", "scratch_seed.yaml"),
          [
            "scratch-seed:",
            "  version: 1",
            "  path: scratch/seed.md",
            "  default_node_type: person",
            "  sections:",
            "    - id: everyone",
            "      qualification: all-personal-nodes",
            '      name: "Everyone"',
            "      defaults:",
            "        domain: personal",
            "",
          ].join("\n"),
        );
      },
      ({ declared, resolution }) => {
        // `person`'s render shape is `plain_line`, not a checkbox — the chrome and the tokens both
        // follow the DECLARATION, and no line in this view has ever been printed to copy from.
        assert.equal(resolution.chromeShapes.person, "plain_line", "the fixture's own premise is gone");
        const source = "## Everyone\n";
        const seed = seedFor(source, 1, declared("scratch-seed"));
        assert.equal(seed.level, "GLOBAL");
        assert.equal(seed.text, "- #person #personal ", "the chrome or the tokens did not follow the config");
        // AND AT THE POSITION THE DEFECT LIVED AT — one past the end, which is what `o` on the
        // trailing blank line of this brand-new view would ask for.
        assert.deepEqual(seedFor(source, 2, declared("scratch-seed")), seed);
      },
    );
  });

  test("THE POSITIVE HALF, HIS OWN VIEW: ADD a `default_node_type` and the seed follows", { skip }, () => {
    // THE BRIEF'S OWN ACCEPTANCE TEST, WORD FOR WORD: add a `default_node_type` to a scratch copy
    // of his real config, regenerate, and the seed follows with no code change. `all-personal.yaml`
    // declares NONE today — it takes the root default, `task` — so this ADDS the key rather than
    // editing one, which is the harder half and the one the operator would actually do.
    withMutatedConfig(
      (configDir) => {
        const path = join(configDir, "views", "all-personal.yaml");
        const text = readFileSync(path, "utf8");
        assert.ok(!/default_node_type:/.test(text), "all-personal.yaml already declares one — rewrite this test");
        assert.match(text, /^\s*path:\s*personal\/all\.md\s*$/m, "all-personal.yaml no longer points at his file");
        writeFileSync(path, text.replace(/^(\s*path:\s*personal\/all\.md\s*)$/m, "$1\n  default_node_type: person"));
      },
      ({ declared, resolution }) => {
        assert.equal(
          resolution.sectionRegistration["all-personal"].tasks.nodeType,
          "person",
          "the generator did not read the key that was added",
        );
        const seed = seedFor(PERSONAL_ALL, PERSONAL_ALL.split("\n").length, declared("all-personal"));
        assert.ok(seed.tokens.includes("#personal"), "the section's own default stopped being seeded");
        assert.ok(seed.tokens.includes("#person"), "the type tag did not follow the config to `person`");
        assert.ok(!seed.tokens.includes("#task"), "the seed still says `task` after the config stopped saying it");
      },
    );
  });

  test("THE NEGATIVE HALF: a declaration the grammar cannot express lands in `dropped`, visibly", { skip }, () => {
    withMutatedConfig(
      (configDir) => {
        writeFileSync(
          join(configDir, "views", "scratch_unspellable.yaml"),
          [
            "scratch-unspellable:",
            "  version: 1",
            "  path: scratch/unspellable.md",
            "  default_node_type: task",
            "  sections:",
            "    - id: nowhere",
            "      qualification: all-personal-nodes",
            '      name: "Nowhere"',
            "      defaults:",
            "        project: a-project-no-vocabulary-spells",
            "",
          ].join("\n"),
        );
      },
      ({ declared, resolution }) => {
        const what = "section 'scratch-unspellable.nowhere' default 'project'";
        assert.ok(what in resolution.dropped, "the unspellable default was refused with no record");
        assert.match(resolution.dropped[what], /no vocabulary tag spells/, "the record does not say WHY");
        // AND THE SEED SAYS ONLY WHAT IT CAN SPELL — the type tag, never a guess at the rest.
        const seed = seedFor("## Nowhere\n", 2, declared("scratch-unspellable"));
        assert.deepEqual(seed.tokens, ["#task"], "the browser spelled a field the generator refused");
      },
    );
  });

  test("THE CONTROL: the UNMUTATED config produces exactly what is committed", { skip }, () => {
    assert.deepEqual(
      generateQualification(DEFAULT_CONFIG_DIR).sectionOrder,
      SERVED.qualification.sectionOrder,
      "presentation.json's section order is stale relative to the monorepo config",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE MUTATION PROOF — break the fix and this file goes red
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("6. THE MUTATION PROOF — a guard that cannot go red is decoration", () => {
  /**
   * Rebuild the presentation bundle from a MUTATED copy of `app/present/`, in a temp dir, and hand
   * back its `seedFor`. Nothing is written into the repository and `dist/present.js` is untouched.
   *
   * The whole bundle is rebuilt rather than the one module patched because `seedFor` reaches
   * `sectionForInsertAt` through an import the bundler resolves — a copy of one file would still
   * import the real other one, and the mutation would land nowhere.
   */
  async function withMutatedBundle(module, mutate, use) {
    const scratch = mkdtempSync(join(tmpdir(), "seed-from-cascade-mutant-"));
    try {
      // THE COPY KEEPS THE REPO'S OWN SHAPE — `<root>/app/present/` beside `<root>/presentation.json`.
      // It USED to be forced: `embedded-declaration.ts` imported the declaration at
      // `../../presentation.json`, so a flat copy would not bundle. That module is deleted and the
      // bundle imports no JSON at all now (design-config-is-content.md step 2), so the shape is
      // kept because a mutant that differs from the repo in TWO ways proves less than one that
      // differs in one — not because the bundler still requires it.
      //
      // `app/shell/` COPIED TOO, AS OF THE DRAWER'S EXTRACTION. `app/present/index.ts` re-exports
      // the view drawer from `../shell/drawer.js` — a relative import that leaves this directory —
      // because the drawer touches the document and `app/present/` is, by its own header, the one
      // directory in this repo where exactly one module (`paint.ts`) may do that (see
      // `app/shell/drawer.ts`'s own header for the full argument). "The repo's own shape" now
      // includes that sibling, so the copy does too; a scratch build that omitted it would fail on
      // `Could not resolve "../shell/drawer.js"` for every mutant here, regardless of the mutation,
      // which is not a signal about `address.ts`/`newline.ts` and would make this suite red for a
      // reason that has nothing to do with what it exists to prove.
      const present = join(scratch, "app", "present");
      cpSync(join(REPO, "app", "present"), present, { recursive: true });
      cpSync(join(REPO, "app", "shell"), join(scratch, "app", "shell"), { recursive: true });
      cpSync(join(REPO, "presentation.json"), join(scratch, "presentation.json"));
      const path = join(present, module);
      const source = readFileSync(path, "utf8");
      const mutated = mutate(source);
      assert.notEqual(mutated, source, "the mutation's own anchor is gone — it changed nothing");
      writeFileSync(path, mutated);
      const { build } = await import("esbuild");
      const outfile = join(scratch, "present.js");
      await build({
        entryPoints: [join(present, "index.ts")],
        bundle: true,
        format: "esm",
        target: ["es2022"],
        outfile,
        logLevel: "silent",
      });
      return await use(await import(pathToFileURL(outfile).href));
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  test("MUTANT 1: undo the subtraction — section 1's two assertions go red", async () => {
    await withMutatedBundle(
      "address.ts",
      (source) =>
        source.replace(
          "return sectionAt(source, lineIndex - 1, view, sectionOrder);",
          "return sectionAt(source, lineIndex, view, sectionOrder);",
        ),
      (mutant) => {
        // The exact defect, back: the trailing blank line seeds no tokens in either view.
        assert.deepEqual(mutant.seedFor(INBOX, INBOX.split("\n").length, declaredFor("inbox")).tokens, []);
        assert.deepEqual(
          mutant.seedFor(PERSONAL_ALL, PERSONAL_ALL.split("\n").length, declaredFor("all-personal")).tokens,
          [],
        );
        // And the control the defect hid behind still passes, which is what made it invisible.
        assert.deepEqual(mutant.seedFor(INBOX, 3, declaredFor("inbox")).tokens, ["#task"]);
      },
    );
  });

  test("MUTANT 2: unwire the CALL SITE — the fix is carried by the wiring, not only the function", async () => {
    // A DIFFERENT PROPERTY FROM MUTANT 1. That one breaks the arithmetic; this one leaves
    // `sectionForInsertAt` perfect and has `newline.ts` ask the OTHER function — the exact state
    // this branch found the code in. It is what stops the fix from being a correct function
    // nothing calls.
    await withMutatedBundle(
      "newline.ts",
      (source) =>
        source
          .replace('import { sectionForInsertAt } from "./address.js";', 'import { sectionAt } from "./address.js";')
          .replace(": sectionForInsertAt(source, lineIndex,", ": sectionAt(source, lineIndex,"),
      (mutant) => {
        assert.equal(
          mutant.sectionForInsertAt(INBOX, INBOX.split("\n").length, "inbox", QUALIFICATION.sectionOrder),
          "domain-empty",
          "the mutant broke the function too — this would not isolate the wiring",
        );
        assert.deepEqual(
          mutant.seedFor(INBOX, INBOX.split("\n").length, declaredFor("inbox")).tokens,
          [],
          "the call site was unwired and the seed still answered — something else is carrying it",
        );
      },
    );
  });

  test("MUTANT 3: over-correct the subtraction — section 2's heading case goes red", async () => {
    await withMutatedBundle(
      "address.ts",
      (source) =>
        source.replace(
          "return sectionAt(source, lineIndex - 1, view, sectionOrder);",
          "return sectionAt(source, lineIndex - 2, view, sectionOrder);",
        ),
      (mutant) => {
        // Subtracting two names the section of the line ABOVE the one the insertion lands after —
        // right at the end of a file by luck, wrong the moment a heading is near.
        assert.notEqual(
          mutant.sectionForInsertAt(INBOX, 2, "inbox", QUALIFICATION.sectionOrder),
          sectionForInsertAt(INBOX, 2, "inbox", QUALIFICATION.sectionOrder),
          "subtracting two gave the same answer — the arithmetic is not what is being measured",
        );
      },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7. NOTHING LOCAL IS WRITTEN — the pinned write sites, at the VALUE level
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("7. NOTHING LOCAL IS WRITTEN beyond the seed characters themselves", () => {
  const APP = readFileSync(join(REPO, "app", "index.html"), "utf8");
  const PAINT = readFileSync(join(REPO, "app", "present", "paint.ts"), "utf8");

  // research-the-rule-closure.md §8 proved "there is no code path from a painted pixel to a POST
  // body" BY COUNTING these sites. Re-counted here, on this branch, so a fix that quietly added a
  // write fails rather than passes. Each count is paired with the VALUES assigned, because a count
  // alone can be satisfied by editing the number.

  test("`graphData` is assigned in exactly four places, every one the server's own envelope", () => {
    const sites = APP.match(/\bgraphData\s*=(?!=)/g) ?? [];
    assert.equal(sites.length, 4, "the seed fix must not add a client-computed graphData write");
    const assigned = (APP.match(/\bgraphData\s*=(?!=)\s*([A-Za-z0-9_$.]+)/g) ?? []).map((site) =>
      site.replace(/^\bgraphData\s*=\s*/, ""),
    );
    assert.deepEqual(
      assigned.sort(),
      ["data", "null", "null", "pending.data"],
      "a value this page computed became the copy of the file every write is measured against",
    );
  });

  // ONE RULE, ONE EXPRESSION — see tests/fixtures/write-path-callers.mjs. This was the SEVENTH
  // copy of the same invariant, and like the other six it asserted TWO callers when the correct
  // number was always ONE. Unrelated to the seed fix this suite is about; it is here so the seed
  // fix cannot add a write, and that claim is unchanged.
  test("the seed fix adds no write — there is still exactly ONE write path", () => {
    assertOneWritePath();
  });

  test("`applyEdit(` is called in exactly three places in paint.ts and two in the page", () => {
    // NARROWED 2026-08-10, NOT RELAXED — the claim is unchanged, the SPLIT moved. The page's two
    // `applyEdit` calls (`x` and `>`/`<`) went to `app/shell/keys.ts` when the global keydown
    // handler left `app/index.html` for a file the compiler and the tracer can both read. Five
    // sites outside `source.ts`, as before; the page now holds ZERO, which is stronger than the
    // two this used to assert.
    const KEYS = readFileSync(join(REPO, "app", "shell", "keys.ts"), "utf8");
    assert.equal((PAINT.match(/\bapplyEdit\(/g) ?? []).length, 3);
    assert.equal((KEYS.match(/\bapplyEdit\(/g) ?? []).length, 2);
    assert.equal((APP.match(/\bapplyEdit\(/g) ?? []).length, 0);
  });

  test("`.markdown` is never assigned — the page reads the envelope and never rewrites it", () => {
    assert.deepEqual(APP.match(/\.markdown\s*=(?!=)/g), null);
    assert.deepEqual(PAINT.match(/\.markdown\s*=(?!=)/g), null);
  });

  test("`motions.ts` imports nothing and produces no `Contribution` — no new edit kind", () => {
    // COMMENTS ARE STRIPPED FIRST. That module's own header argues at length about why it is NOT a
    // `Contribution` producer, so the word appears in its prose six times — matching the raw text
    // would fail on the very explanation of the property being checked.
    const motions = readFileSync(join(REPO, "app", "present", "motions.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.deepEqual(motions.match(/^import\s/gm), null, "motions.ts grew an import");
    assert.deepEqual(motions.match(/\bContribution\b/g), null, "motions.ts grew a Contribution");
  });

  test("THE FIX TOUCHED NO WRITE PATH — `app/index.html` and `paint.ts` are unchanged by it", () => {
    // `sectionForInsertAt` is reached from `newline.ts` alone. Asserted so a later change that
    // wired it into a write path has to say so here first.
    assert.ok(!APP.includes("sectionForInsertAt"), "the page grew its own insertion addressing");
    assert.ok(!PAINT.includes("sectionForInsertAt"), "paint.ts grew its own insertion addressing");
    const newline = readFileSync(join(REPO, "app", "present", "newline.ts"), "utf8");
    assert.equal(
      (newline.match(/sectionForInsertAt\(/g) ?? []).length,
      1,
      "the section is resolved more than once — two chances to describe two different sections",
    );
  });
});

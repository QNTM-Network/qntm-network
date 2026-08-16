/**
 * THE FLAG THAT MOVES ALL FOUR READERS OF A VIEW'S TEXT — proved off, proved on, proved refusing.
 *
 *   node --test tests/app-html-compose-flag.test.mjs
 *
 * ── WHAT IS ACTUALLY AT STAKE ──
 *
 * `snapshot.views[].markdown` is read in four places on the page:
 *
 *   the painter        `repaintCurrentView` — what the operator sees
 *   the write base     `paintView` — the string the next save is measured against
 *   the way station    `drainProjection` — the same base, set while a projection is held
 *   the staleness read `viewSources` — what `stampsLanded` searches a saved body for
 *
 * `paintView`'s own comment states the property that keeps the stale-write detector honest: neither
 * base site "can pass a string this app computed". A painter walking a composed string while the
 * base holds the engine's is not a cosmetic mismatch — it is a save computed against a file the
 * operator was never shown, on the one surface he types into.
 *
 * So this file's whole subject is that the four move TOGETHER. Four claims:
 *
 *   1. FLAG OFF — every one of the four is byte-identical to `view.markdown`, the shape the page
 *      shipped before `sourceOfView` existed. `COMPOSE_VIEW_IN_BROWSER` DEFAULTS TRUE now
 *      (turn-on-browser-composition, 2026-08-16), so this claim mutates the shipped page DOWN to
 *      off, the mirror image of what claim 1 used to prove.
 *   2. FLAG ON, COMPOSING — all four come from the composer, and none of them is the engine's
 *      string. Proved against an UNMUTATED page — this is now the shipped default, not a
 *      reconstruction of it.
 *   3. FLAG ON, REFUSING — a view the composer cannot answer for falls back to the engine's
 *      markdown in ALL FOUR, per view, never per line. A view assembled half from each would be a
 *      string this app computed, arriving as a write base.
 *   4. FLAG ON, WITH A TREE — claim 3's exact edge-touching graph, but this time the envelope's own
 *      view carries a `sections` key (`GET /graph?include_structure=true`, section-trees-have-a-
 *      persisted-home, 2026-08-16). The refusal LIFTS: all four readers nest instead of falling
 *      back — proving `sourceOfView`'s `view.sections` plumbing reaches the composer, not only that
 *      the composer can accept one when handed it directly (`present-viewmarkdown.test.mjs` already
 *      proves that half).
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { assertMutated, importPage, installBrowser, makeWorkDir } from "./fixtures/app-html-page.mjs";
import { generateResolution, DEFAULT_CONFIG_DIR } from "../scripts/generate-resolution-declaration.mjs";
import { generateQualification } from "../scripts/generate-qualification-declaration.mjs";
import { generateStructural } from "../scripts/generate-structural-declaration.mjs";

const HAVE_CONFIG = existsSync(DEFAULT_CONFIG_DIR);

/** The page's own flag line, and the one-character change that turns it on. */
const FLAG_OFF = "const COMPOSE_VIEW_IN_BROWSER = false;";
const FLAG_ON = "const COMPOSE_VIEW_IN_BROWSER = true;";

/**
 * `admin`, exactly as the operator's config declares it — two sections, both named, neither
 * graph-dependent. With an empty graph the engine renders `## To Do` then `## Done` and nothing
 * else, which is what makes it the one view where "the composer agreed" is a short, readable
 * string rather than a hundred lines.
 */
const COMPOSED = "## To Do\n## Done";

/** DELIBERATELY NOT the composed answer. The engine's copy, as a projection would carry it. */
const ENGINE = ["# Admin", "", "## To Do", "- [ ] Something the engine said [[qntm:9]]", ""].join("\n");

const VIEW = { id: "admin", path: "admin/admin.md", title: "Admin", domain: "admin", markdown: ENGINE };

/** A declaration compiled from the live config — the committed `presentation.json` predates
 *  `sectionPresentation`, so the page's own boot document would make the composer refuse
 *  everything and claim 2 while proving 3. */
function liveDeclaration() {
  return {
    resolution: generateResolution(DEFAULT_CONFIG_DIR),
    qualification: generateQualification(DEFAULT_CONFIG_DIR),
    structural: generateStructural(DEFAULT_CONFIG_DIR),
  };
}

async function pageWith(flagOn, { graph }) {
  const { elements } = installBrowser();
  globalThis.fetch = () => new Promise(() => {});
  const page = await importPage(
    makeWorkDir(`compose-flag-${flagOn ? "on" : "off"}-${Math.random().toString(36).slice(2)}`),
    // ON IS THE SHIPPED DEFAULT NOW — mutating DOWN to off is the one that needs a pattern.
    flagOn ? undefined : (source) => assertMutated(source, FLAG_ON, FLAG_OFF),
  );
  page.__applyPresentation(liveDeclaration());
  page.__setGraphData({ snapshot: { generated_at: "2026-08-16T00:00:00Z", views: [VIEW], graph } });
  return { page, elements };
}

/** The four answers, read off the page rather than recomputed. */
const fourReaders = (page) => ({
  painted: page.__paintedSource(),
  base: page.__served().markdown,
  wayStation: page.__sourceOfView(VIEW),
  staleness: page.__viewSources({ snapshot: { views: [VIEW] } }),
});

describe("COMPOSE_VIEW_IN_BROWSER", () => {
  if (!HAVE_CONFIG) {
    test("SKIPPED, LOUDLY — the monorepo config is not checked out", () => {
      assert.ok(true, `${DEFAULT_CONFIG_DIR} is absent, so nothing was composed`);
    });
    return;
  }

  describe("1. OFF — the shipped page, mutated DOWN to off, byte-identical to before this existed", () => {
    let page;
    before(async () => {
      ({ page } = await pageWith(false, { graph: { nodes: [], edges: [] } }));
      page.paintView("admin");
    });

    test("all four readers answer the ENGINE'S string, and nothing else", () => {
      const four = fourReaders(page);
      assert.equal(four.painted, ENGINE, "the painter walked something the server did not send");
      assert.equal(four.base, ENGINE, "the write base is not the string the server sent");
      assert.equal(four.wayStation, ENGINE);
      assert.deepEqual(four.staleness, [ENGINE]);
    });

    test("THE FIXTURE CAN TELL THE TWO SOURCES APART — otherwise every assertion here is vacuous", () => {
      // This is a GUARD, not evidence, and saying so matters: it does not prove the composer was
      // silenced rather than merely unable to answer. What proves that is claim 2, which composes
      // `admin` from the SAME config and the SAME empty graph. Read together, the only difference
      // between the two is the flag.
      assert.notEqual(ENGINE, COMPOSED, "the two strings are equal, so nothing above distinguishes them");
    });
  });

  describe("2. ON — the shipped page, unmutated — all four come from the composer, together", () => {
    let page;
    before(async () => {
      ({ page } = await pageWith(true, { graph: { nodes: [], edges: [] } }));
      page.paintView("admin");
    });

    test("the painter, the base, the way station and the staleness read all move", () => {
      const four = fourReaders(page);
      assert.equal(four.painted, COMPOSED, "the painter did not walk the composed view");
      assert.equal(four.base, COMPOSED, "THE BASE DID NOT FOLLOW THE PAINTER — a save would be computed against a file nobody was shown");
      assert.equal(four.wayStation, COMPOSED);
      assert.deepEqual(four.staleness, [COMPOSED]);
    });

    test("and none of them is the engine's string any more", () => {
      for (const [name, value] of Object.entries(fourReaders(page))) {
        assert.notDeepEqual(value, name === "staleness" ? [ENGINE] : ENGINE, `${name} still holds the engine's copy`);
      }
    });
  });

  describe("3. ON, BUT REFUSING — the whole view falls back, never half of it", () => {
    let page;
    before(async () => {
      // ONE EDGE IS ENOUGH, and that is the honest state of this composer today: the engine renders
      // a section's TREE and the browser never receives one, so a member touching any edge means
      // the flat member list may not be what the engine printed. See `viewmarkdown.ts`'s header.
      ({ page } = await pageWith(true, {
        graph: {
          nodes: [
            { id: "a", type: "task", fields: { title: "Parent", domain: "admin", status: "open" } },
            { id: "b", type: "task", fields: { title: "Child", domain: "admin", status: "open" } },
          ],
          edges: [{ id: "e1", type: "PART_OF", source: "b", target: "a", fields: {} }],
        },
      }));
      page.paintView("admin");
    });

    test("all four fall back to the engine's markdown — the same four, the same way", () => {
      const four = fourReaders(page);
      assert.equal(four.painted, ENGINE, "the painter did not fall back");
      assert.equal(four.base, ENGINE, "the base did not fall back with the painter");
      assert.equal(four.wayStation, ENGINE);
      assert.deepEqual(four.staleness, [ENGINE]);
    });

    test("THE FALLBACK IS THE WHOLE VIEW — no line of it came from the composer", () => {
      // A per-line fallback would produce a view carrying SOME composed lines. That string would be
      // one this app computed, and `paintView` would take the next save's base from it.
      assert.ok(!page.__paintedSource().includes(COMPOSED), page.__paintedSource());
      assert.equal(page.__paintedSource().split("\n").length, ENGINE.split("\n").length);
    });
  });

  describe("4. ON, WITH A TREE — the same edges, but the refusal lifts", () => {
    // THE SAME GRAPH AS CLAIM 3, so the only variable is the `sections` key — measured against the
    // real config by a one-off probe against `dist/present.js` before being pinned here.
    const NESTED = "## To Do\n- [ ] Parent [[qntm:a]] #task #admin\n    - [ ] Child [[qntm:b]] #task #admin\n## Done";
    const VIEW_WITH_TREE = {
      ...VIEW,
      sections: {
        "to-do": {
          section_id: "to-do",
          roots: [
            {
              node_id: "a",
              node_type: "task",
              is_qualifying: true,
              children: [{ node_id: "b", node_type: "task", is_qualifying: true, children: [] }],
            },
          ],
        },
      },
    };
    let page;
    before(async () => {
      const { elements } = installBrowser();
      globalThis.fetch = () => new Promise(() => {});
      // ON IS THE SHIPPED DEFAULT NOW — no mutation needed, same as claim 2 and claim 3.
      page = await importPage(makeWorkDir(`compose-flag-tree-${Math.random().toString(36).slice(2)}`));
      page.__applyPresentation(liveDeclaration());
      page.__setGraphData({
        snapshot: {
          generated_at: "2026-08-16T00:00:00Z",
          views: [VIEW_WITH_TREE],
          graph: {
            nodes: [
              { id: "a", type: "task", fields: { title: "Parent", domain: "admin", status: "open" } },
              { id: "b", type: "task", fields: { title: "Child", domain: "admin", status: "open" } },
            ],
            edges: [{ id: "e1", type: "PART_OF", source: "b", target: "a", fields: {} }],
          },
        },
      });
      page.paintView("admin");
    });

    test("all four readers nest instead of falling back to the engine's markdown", () => {
      const painted = page.__paintedSource();
      const base = page.__served().markdown;
      const wayStation = page.__sourceOfView(VIEW_WITH_TREE);
      const staleness = page.__viewSources({ snapshot: { views: [VIEW_WITH_TREE] } });
      assert.equal(painted, NESTED, "the painter did not walk the tree-composed view");
      assert.equal(base, NESTED, "the base did not follow the painter");
      assert.equal(wayStation, NESTED);
      assert.deepEqual(staleness, [NESTED]);
    });
  });
});

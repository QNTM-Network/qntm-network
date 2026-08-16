/**
 * present-viewheading-agreement — the BROWSER half of `scripts/viewheading-agreement.py`.
 *
 *   node --test tests/present-viewheading-agreement.test.mjs
 *
 * The engine drove `ViewRegistration.section_heading` over 17 probes and wrote what it produced.
 * This compiles the SAME config through `generate-resolution-declaration.mjs` and asserts
 * `composeSectionHeading` reproduces every one, including the two that produce NO `## ` line.
 *
 * ── WHY THE HEADING GETS ITS OWN DIFFERENTIAL ──
 *
 * Because I described its shape to the operator twice and was wrong twice — see the Python half's
 * header for both wrong descriptions and where each came from. A heading composed from a reading of
 * the code, tested against a test written from the same reading, is a green measuring nothing. This
 * pair is the only thing in the repo that can tell the difference.
 *
 * It has already earned that on its first run: the browser suppressed a pinned heading's stamp for
 * a unique-identity type, copying `composeNodeLine`'s rule for a BODY line. The engine stamps it —
 * `_container_heading_stamp` passes `consult_identity_mode=False` on purpose — and the fixture said
 * so immediately.
 *
 * ── THE FIXTURE IS COMMITTED, so this runs anywhere ──
 *
 * Only REGENERATION needs the monorepo. The compile half does too, so those assertions skip loudly
 * when it is absent, in the same shape `present-nodeline-agreement.test.mjs` uses.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readConfigResolutionDeclaration, composeSectionHeading } from "../dist/present.js";
import { generateResolution, DEFAULT_CONFIG_DIR } from "../scripts/generate-resolution-declaration.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(resolve(HERE, "fixtures", "viewheading-agreement.json"), "utf8"));
const HAVE_CONFIG = existsSync(DEFAULT_CONFIG_DIR);

describe("the composed heading is the engine's own, branch for branch", () => {
  if (!HAVE_CONFIG) {
    test("SKIPPED, LOUDLY — the monorepo config is not checked out", () => {
      assert.ok(true, `${DEFAULT_CONFIG_DIR} is absent, so nothing was compared`);
    });
    return;
  }

  const resolution = readConfigResolutionDeclaration({ resolution: generateResolution(DEFAULT_CONFIG_DIR) });

  test("the reader accepts the compiled table, so a disagreement below is about the heading", () => {
    assert.deepEqual(resolution.problems, []);
  });

  for (const fixture of FIXTURE.fixtures) {
    test(`${fixture.id} — ${fixture.expectedHeading === null ? "emits NO heading line" : JSON.stringify(fixture.expectedHeading)}`, () => {
      // THE GRAPH IS ASSEMBLED FROM WHAT THE ENGINE RECORDED, not re-derived. Members, the pinned
      // node and the PLANTED collision node are all real nodes the engine created, carried across
      // with the ids it minted — which is what makes a stamp comparison meaningful at all.
      const nodes = [
        ...fixture.members,
        ...(fixture.pinned === null ? [] : [fixture.pinned]),
        ...(fixture.planted === null ? [] : [fixture.planted]),
      ];
      const answer = composeSectionHeading(
        fixture.sectionId,
        fixture.presentation,
        fixture.members,
        resolution.resolution,
        { nodes, edges: [] },
        fixture.writePolicy,
      );
      if (fixture.expectedHeading === null) {
        assert.equal(
          answer.kind,
          "node-line",
          `the engine emits no \`## \` line here; the browser answered ${JSON.stringify(answer)}`,
        );
        return;
      }
      assert.equal(answer.kind, "heading", `the browser refused a heading the engine produced: ${JSON.stringify(answer)}`);
      assert.equal(answer.text, fixture.expectedHeading);
    });
  }

  test("THE GRID CROSSED EVERY BRANCH — a fixture set that missed one would agree by luck", () => {
    const headings = FIXTURE.fixtures.map((f) => f.expectedHeading);
    assert.ok(headings.some((h) => h === null), "no probe deletes the heading line");
    assert.ok(headings.some((h) => h !== null && /\(\d+\)$/.test(h)), "no probe carries a count");
    assert.ok(headings.some((h) => h !== null && h.includes("[[qntm:")), "no probe carries a stamp");
    assert.ok(
      FIXTURE.fixtures.some((f) => f.presentation.name && f.members.length > 0 && f.expectedHeading === f.presentation.name),
      "no probe proves a name suppresses the count while members exist",
    );
    assert.ok(
      FIXTURE.fixtures.some((f) => f.headingPathway === "declared_name"),
      "no probe resolves the heading node by NAME — the collision route is unexercised",
    );
  });
});

describe("the fixture is not stale relative to the composer's own refusals", () => {
  test("`render-shape-unpublished` fires when the shape is off the wire, rather than guessing", () => {
    // The composer must not fall back to "probably a heading". `chromeShapes` drops `heading` on
    // purpose, so a composer reading THAT table would see an absence and have to guess; this proves
    // it reads `renderShapes` and refuses when even that cannot answer.
    const pinned = { id: "n1", type: "header", fields: { title: "Whatever" } };
    const answer = composeSectionHeading(
      "to-do",
      { name: "Whatever" },
      [],
      // `identityModes` MUST say the type is unique-identity, or the by-name lookup finds nothing
      // and there is no backing node to have an unknown shape — the refusal would never be reached
      // and this test would pass while measuring the wrong branch. It did, on its first run.
      {
        chromeShapes: {},
        identityModes: { header: { unique: true, field: null } },
        renderShapes: undefined,
        spelling: undefined,
        markerOrder: undefined,
      },
      { nodes: [pinned], edges: [] },
      "writable",
    );
    assert.deepEqual(answer, { kind: "refused", because: "render-shape-unpublished" });
  });
});

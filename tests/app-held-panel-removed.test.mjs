/**
 * THE HELD PANEL CANNOT APPEAR — reconstructed, not merely deleted.
 *
 *   node --test tests/app-held-panel-removed.test.mjs
 *
 * ── WHAT THIS PROVES, AND WHY DELETING THE ELEMENT IS NOT ENOUGH ──
 *
 * `app/present/held.ts`, `#heldStrip`, `#heldRows`, `.held-row`, `.held-discard` and every call
 * site that armed them (`holdEdit`, `heldFrom("vanished"|"refused"|"unplaced", …)`) were removed
 * from this bundle (`remove-held-panel`). Deleting the markup proves the panel is gone from the
 * SOURCE; it does not prove the panel cannot RENDER, because a caller could in principle still
 * construct an equivalent element by hand from a surviving code path. So this suite reconstructs
 * the three conditions that used to arm the panel — a line VANISHING from a projection, a write
 * REFUSED by a 409, and an open row left UNPLACED by a projection arrival — drives them through
 * the real page, and inspects the ACTUAL RENDERED TREE rather than grepping the source.
 *
 * ── WHY WALKING THE TREE, NOT `document.getElementById` ──
 *
 * `tests/fixtures/app-html-page.mjs`'s DOM stub auto-creates an empty element the first time
 * `getElementById` is asked for an id it has never seen (see that file's own `getElementById`) —
 * the same permissive behaviour `document.getElementById` gives a caller in a real browser for an
 * id that exists nowhere in the page. So asking the stub for `"heldStrip"` would silently succeed
 * whether or not the page ever created one. `walk()` from the real root the page paints into does
 * not have that blind spot: it only reports nodes something actually `append`ed, which is the
 * question that matters.
 *
 * ── NO OTHER MEANING OF "HELD" IS TOUCHED ──
 *
 * The word is overloaded elsewhere on this page — `#oneThing`/`#doneBtn` (a separate to-do capture
 * panel), `ProjectionQueue` (a projection arriving mid-edit is HELD until a line settles) — and
 * none of that is this suite's subject. Only the recovery-strip meaning ("characters no file
 * owns") is asserted absent here.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

import { importPage, installBrowser, makeEvent, makeWorkDir, walk } from "./fixtures/app-html-page.mjs";

const WORK = makeWorkDir("app-held-panel-removed");

const PATH = "work/outcomes.md";
const OTHER_PATH = "work/inbox.md";

const V1 = [
  "# This Week",
  "",
  "## Overdue",
  "- [ ] Draft the launch note [[qntm:121]] #task",
  "- [ ] Water the plants [[qntm:122]] #task",
  "",
].join("\n");
const CURSOR = 3;

/** VANISHED — the cycle removed the cursor's own line, unproved (no echoed token). */
const DELETED = V1.split("\n").filter((_, at) => at !== CURSOR).join("\n");

const BARE = ["# This Week", "", "## Overdue", "- [ ] Ring the dentist", ""].join("\n");
const TYPED = "- [ ] Ring the dentist #work";
/** UNPLACED — the neighbour a draft was opened beside leaves the view entirely. */
const STAMPED_ELSEWHERE_UNPLACEABLE = ["# This Week", "", "## Overdue", ""].join("\n");

const view = (markdown, id = "this-week", path = PATH) => ({ id, path, title: id, domain: "work", markdown });

/**
 * EVERY NODE THE PAGE HAS ACTUALLY APPENDED, ANYWHERE — not one container guessed in advance.
 * `#graph` (the reading view, freshness line, badges) and `#app` (the unrelated to-do capture
 * panel) are the two top-level sections `document.getElementById` would have handed a real caller
 * something to attach into; walking both and their own container `body` is what makes "nowhere in
 * the rendered page" a claim about the whole tree rather than one guessed corner of it.
 */
function renderedTree(elements) {
  const seen = new Set();
  const out = [];
  for (const id of ["body", "graph", "app"]) {
    const root = elements.get(id);
    if (root === undefined || seen.has(root)) continue;
    seen.add(root);
    out.push(root, ...walk(root));
  }
  return out;
}

const panelTraces = (elements) =>
  renderedTree(elements).filter(
    (el) =>
      el.getAttribute?.("id") === "heldStrip" ||
      el.getAttribute?.("id") === "heldRows" ||
      /\bheld-(row|head|text|where|discard)\b/.test(el.className ?? ""),
  );

describe("the panel does not render for any of the three conditions that used to arm it", () => {
  let page;
  let elements;
  let posted;
  let refuseWith;

  before(async () => {
    ({ elements } = installBrowser());
    globalThis.fetch = async (url, init) => {
      if (refuseWith) {
        posted.push(JSON.parse(init.body));
        return { ok: false, status: refuseWith.status, json: async () => refuseWith.body };
      }
      const body = JSON.parse(init.body);
      posted.push(body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          handle: "luke",
          pending_edits: 0,
          snapshot: {
            generated_at: "2026-08-01T09:00:00Z",
            views: [view(body.markdown), view("# Inbox\n", "inbox", OTHER_PATH)],
          },
        }),
      };
    };
    page = await importPage(WORK);
  });

  const land = (markdown, id = "this-week") => {
    const data = {
      ok: true,
      handle: "luke",
      pending_edits: 0,
      snapshot: { generated_at: "2026-08-01T09:00:00Z", views: [view(markdown, id), view("# Inbox\n", "inbox", OTHER_PATH)] },
    };
    page.__setGraphData(data);
    page.paintView(id);
  };

  test("VANISHED — the cursor's own line disappears from an arriving projection", () => {
    refuseWith = null;
    land(V1);
    page.__setFocus(CURSOR, V1);
    assert.equal(page.__focusAnchor()?.node, "qntm:121", "the arm did not anchor the line it means to lose");

    land(DELETED);

    // "the line you were on is not in this view any more" (`reportCursorReading`) is retired
    // (chore/retire-the-status-line) — the arm's setup is confirmed functionally instead: the
    // cursor's identity could not survive DELETED (qntm:121 is gone from it entirely).
    assert.notEqual(
      page.__focusAnchor()?.node,
      "qntm:121",
      "the arm did not set up — the vanish was not detected at all",
    );
    assert.deepEqual(panelTraces(elements), [], "a vanished line rendered panel markup somewhere in the page");
  });

  test("REFUSED — a line commit comes back 409, with real characters at stake", async () => {
    const taskText = () => walk(elements.get("viewBody")).find((el) => el.tagName === "span" && el.innerHTML !== "");
    posted = [];
    land(V1);
    page.__setFocus(0, V1);
    page.paintView("this-week");
    taskText().dispatch("click", makeEvent());
    page.__enterInsert();
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = "- [ ] Draft the launch note BY FRIDAY [[qntm:121]] #task";

    refuseWith = {
      status: 409,
      body: { ok: false, error: "stale base", refused: "stale-base", path: PATH, current: V1 },
    };
    input.dispatch("blur");
    await new Promise((r) => setImmediate(r));

    // "...the server refused it and nothing was written" (`WRITE_REFUSED`) is retired
    // (chore/retire-the-status-line) — the arm's setup is confirmed functionally instead: a 409
    // does not repaint, so his characters must still be exactly where he left them.
    assert.equal(
      input.value,
      "- [ ] Draft the launch note BY FRIDAY [[qntm:121]] #task",
      "the arm did not set up — the refusal was not detected at all",
    );
    assert.deepEqual(panelTraces(elements), [], "a refused write rendered panel markup somewhere in the page");
  });

  test("UNPLACED — a row he has open is left with nowhere to go", async () => {
    refuseWith = null;
    posted = [];
    land("# Inbox\n", "inbox");
    land(BARE);
    page.__setFocus(0, BARE);
    page.paintView("this-week");
    const before = walk(elements.get("viewBody")).find((el) => el.tagName === "span" && el.innerHTML !== "");
    before.dispatch("click", makeEvent());
    page.__enterInsert();
    const input = walk(elements.get("viewBody")).find((el) => el.type === "text");
    input.value = TYPED;

    land(STAMPED_ELSEWHERE_UNPLACEABLE);

    assert.equal(page.__draft().draft, null, "the arm did not set up — the row was placed, not left unplaced");
    assert.deepEqual(panelTraces(elements), [], "an unplaced row rendered panel markup somewhere in the page");
  });
});

describe("MUTATION PROOF — the absence check itself is not vacuous", () => {
  test("planting the panel's own markup in the tree is caught by the same check", async () => {
    const { elements, document } = installBrowser();
    // `renderedTree` reads `elements.get("body")`, which is only populated once something calls
    // `document.getElementById("body")` — nothing in this bundle ever does, so a fresh browser (no
    // page imported) leaves it unset. Register it directly, the same object `document.body` is, so
    // the fabricated row below lands exactly where a real `document.body.append(...)` would put it.
    elements.set("body", document.body);
    // A fabricated stand-in for exactly what the removed `paintHeldRows` used to build — proving
    // the check above would have gone red against the page it used to describe, not merely against
    // a page that happens not to build one any more.
    const fake = { tagName: "div", className: "held-row", children: [], getAttribute: () => null };
    document.body.append(fake);

    assert.notEqual(
      panelTraces(elements).length,
      0,
      "the mutation planted panel markup and the check still reported nothing — it proves nothing",
    );
  });
});

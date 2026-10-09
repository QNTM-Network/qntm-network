/**
 * BACK AND FORWARD THROUGH VIEWS (2026-10-09) — app/shell/viewhistory.ts, driven over a fake
 * browser history that behaves like the real one: push drops the forward entries, back and forward
 * move an index and fire `popstate` with that entry's state.
 *
 *   node --test tests/app-view-history.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installViewHistory, viewFromHash, ModeSurface } from "../dist/present.js";

function fakeWindow() {
  const entries = [{ state: null, url: "/app/" }];
  let at = 0;
  const listeners = [];
  const location = { pathname: "/app/", search: "", hash: "" };
  const go = (to) => {
    if (to < 0 || to >= entries.length) return;
    at = to;
    for (const l of listeners) l({ state: entries[at].state });
  };
  const history = {
    get state() { return entries[at].state; },
    pushState(state, _t, url) { entries.splice(at + 1); entries.push({ state, url }); at += 1; },
    replaceState(state, _t, url) { entries[at] = { state, url }; },
    back() { go(at - 1); },
    forward() { go(at + 1); },
  };
  return { history, location, addEventListener: (type, l) => type === "popstate" && listeners.push(l), entries: () => entries.map((e) => e.state?.qntmView ?? null), urls: () => entries.map((e) => e.url) };
}

function setup() {
  const win = fakeWindow();
  const shown = [];
  let vh;
  vh = installViewHistory({ win, show: (id) => { shown.push(id); vh.visited(id); } });
  return { win, shown, vh };
}

test("each chosen view is one entry, and the first replaces the page's own", () => {
  const { win, vh } = setup();
  vh.visited("daily");
  vh.visited("daily");
  vh.visited("inbox");
  vh.visited("outcomes");
  assert.deepEqual(win.entries(), ["daily", "inbox", "outcomes"]);
  assert.deepEqual(win.urls(), ["/app/#view=daily", "/app/#view=inbox", "/app/#view=outcomes"]);
});

test("back and forward show the views in order, and showing them records nothing new", () => {
  const { win, shown, vh } = setup();
  for (const id of ["daily", "inbox", "outcomes"]) vh.visited(id);
  vh.back();
  vh.back();
  assert.deepEqual(shown, ["inbox", "daily"]);
  vh.forward();
  assert.deepEqual(shown, ["inbox", "daily", "inbox"]);
  assert.deepEqual(win.entries(), ["daily", "inbox", "outcomes"], "a back or forward made an entry");
});

test("back stops at the first view rather than leaving the app", () => {
  const { shown, vh } = setup();
  vh.visited("daily");
  vh.back();
  assert.deepEqual(shown, []);
});

test("a view chosen after going back drops the forward entries, as a browser does", () => {
  const { win, vh } = setup();
  for (const id of ["daily", "inbox", "outcomes"]) vh.visited(id);
  vh.back();
  vh.visited("people");
  assert.deepEqual(win.entries(), ["daily", "inbox", "people"]);
});

test("the address names the view, and only a well-formed one counts", () => {
  assert.equal(viewFromHash("#view=work%2Foutcomes"), "work/outcomes");
  assert.equal(viewFromHash("#view="), null);
  assert.equal(viewFromHash("#other"), null);
  assert.equal(viewFromHash("#view=%E0%A4%A"), null);
});

test("H and L are back and forward in NORMAL", () => {
  const mode = new ModeSurface();
  assert.deepEqual(mode.handleKey("H", 0, 5).effect, { kind: "view-back" });
  assert.deepEqual(mode.handleKey("L", 0, 5).effect, { kind: "view-forward" });
});

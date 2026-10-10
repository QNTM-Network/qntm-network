/**
 * RECENTLY USED (2026-10-10, backlog row recently-used-recorded-on-the-server).
 *
 *   node --test tests/recently-used.test.mjs
 *
 * 1. A use moves an item to the front of the list, once, and the list keeps its limit.
 * 2. A blank `/` lists only used items, newest first, without the view already open — so the first
 *    item is the view to switch back to.
 * 3. Typing ranks as before, with recency breaking ties ahead of file order.
 * 4. The Worker keeps the list per user: one user's uses never reach another's list, a repeat use
 *    moves the item rather than adding it, and a key that is not view:/task: is refused.
 * 5. ⌘S / Ctrl+S is Cycle, in either mode.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { noteUse, viewKey, taskKey, lineKey, searchViews, RECENT_LIMIT, globalKey } from "../dist/present.js";
import { recentGet, recentPost } from "../worker/src/recent.js";

test("1. a use moves the item to the front, once; the list keeps its limit", () => {
  let list = [];
  list = noteUse(list, viewKey("daily"));
  list = noteUse(list, viewKey("inbox"));
  list = noteUse(list, viewKey("daily"));
  assert.deepEqual(list, ["view:daily", "view:inbox"]);
  for (let i = 0; i < RECENT_LIMIT + 5; i += 1) list = noteUse(list, taskKey(String(i)));
  assert.equal(list.length, RECENT_LIMIT);
  assert.equal(lineKey("- [ ] Call Mum [[qntm:42]] #task"), "task:42");
  assert.equal(lineKey("plain prose"), null);
});

const VIEWS = [
  { id: "daily", title: "Daily", path: "daily.md", markdown: "# Daily\n- [ ] Write report [[qntm:1]] #task\n" },
  { id: "inbox", title: "Inbox", path: "inbox.md", markdown: "# Inbox\n- [ ] Write letter [[qntm:2]] #task\n" },
  { id: "work", title: "Work", path: "work/tasks.md", markdown: "# Work\n- [ ] Write plan [[qntm:3]] #task\n" },
];

test("2. a blank `/` lists used items, newest first, without the open view", () => {
  const recent = [viewKey("daily"), taskKey("2"), viewKey("work")];
  const hits = searchViews(VIEWS, "", { prefer: "daily", recent });
  assert.deepEqual(
    hits.map((h) => `${h.kind}:${h.kind === "task" ? h.qntmId : h.viewId}`),
    ["task:2", "view:work"],
    "the open view was listed, or the order is not newest first",
  );
  assert.deepEqual(searchViews(VIEWS, "", { prefer: "daily", recent: [] }), [], "a blank search with no uses lists nothing");
});

test("3. typing ranks as before; recency breaks a tie ahead of file order", () => {
  const plain = searchViews(VIEWS, "write", { prefer: "daily" }).map((h) => h.qntmId);
  assert.deepEqual(plain, ["1", "2", "3"]);
  const withRecent = searchViews(VIEWS, "write", { prefer: "daily", recent: [taskKey("3")] }).map((h) => h.qntmId);
  assert.deepEqual(withRecent, ["3", "1", "2"]);
});

function makeDb() {
  const rows = new Map(); // user|key -> used_at
  const stmt = (sql) => ({
    sql,
    bind: (...p) => ({
      sql,
      p,
      all: async () => {
        const [user, limit] = p;
        const mine = [...rows].filter(([k]) => k.startsWith(user + "|")).sort((a, b) => (a[1] < b[1] ? 1 : -1));
        return { results: mine.slice(0, limit).map(([k]) => ({ item_key: k.slice(user.length + 1) })) };
      },
    }),
  });
  return {
    prepare: stmt,
    batch: async (statements) => {
      for (const s of statements) {
        if (s.sql.includes("INSERT INTO recents")) rows.set(`${s.p[0]}|${s.p[1]}`, s.p[2]);
      }
    },
    rows,
  };
}

async function call(fn, env, user, body) {
  const request = new Request("http://w/app/recent", { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined });
  const response = await fn(request, env, "https://qntm.network", { user_id: user });
  return { status: response.status, body: await response.json() };
}

test("4. the Worker keeps one list per user, newest first, and refuses a malformed key", async () => {
  const env = { DB: makeDb() };
  await call(recentPost, env, "luke", { key: "view:daily" });
  await new Promise((r) => setTimeout(r, 5));
  await call(recentPost, env, "luke", { key: "task:42" });
  await new Promise((r) => setTimeout(r, 5));
  await call(recentPost, env, "someone-else", { key: "view:secret" });
  await new Promise((r) => setTimeout(r, 5));
  await call(recentPost, env, "luke", { key: "view:daily" });
  const mine = await call(recentGet, env, "luke");
  assert.deepEqual(mine.body.recent, ["view:daily", "task:42"]);
  const bad = await call(recentPost, env, "luke", { key: "javascript:alert(1)" });
  assert.equal(bad.status, 400);
});

test("5. ⌘S and Ctrl+S run Cycle in NORMAL", () => {
  let cycled = 0;
  const deps = { cycle: () => { cycled += 1; }, drawerIsOpen: () => false, closeDrawer() {}, openDrawer() {}, mode: { mode: "NORMAL" }, drainPainted() {}, currentViewId: () => null };
  for (const mods of [{ metaKey: true }, { ctrlKey: true }]) {
    // Node has no KeyboardEvent; globalKey reads only these fields.
    const e = { key: "s", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: null, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...mods };
    globalKey(deps, e);
    assert.equal(e.defaultPrevented, true, "the browser's own Save was not stopped");
  }
  assert.equal(cycled, 2);
});

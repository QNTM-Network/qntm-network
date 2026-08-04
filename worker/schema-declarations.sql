-- Compiled declaration storage — the piece `design-the-runtime-compile.md` §2.3/§4 names and
-- `worker/src/config.js`'s own Gate-1-only route explicitly leaves undone ("Nothing here is
-- stored... those are Gate 2 and the two-consumer write path"). Additive to schema-app.sql
-- (reuses `users`). Apply with:
--   wrangler d1 execute qntm-signups --file=./schema-declarations.sql            (local)
--   wrangler d1 execute qntm-signups --remote --file=./schema-declarations.sql   (prod)

-- One row per (user, kind, version) — a compiled declaration, durable under its own content-hash
-- identity (`scripts/declaration-version.mjs`, `sha256-<hex>` of the canonical
-- `{declaration, dropped}` pair). NEVER UPDATED IN PLACE: a version names one immutable byte
-- string by construction (`versionKey`'s own header), so the only legal operations on this table
-- are INSERT and read — `kind` is one of structural | qualification | resolution | rules, one row
-- per generator's own compile, matching the four independent Gate-1 routes already shipped. No
-- schema change was needed to add `rules` as a fourth kind — `kind` was always a bare TEXT column
-- with no CHECK constraint, so this comment is the only place the set of kinds is enumerated at
-- the SQL layer, and it is descriptive, not enforced.
CREATE TABLE IF NOT EXISTS declarations (
  user_id          TEXT NOT NULL REFERENCES users(id),
  kind             TEXT NOT NULL,               -- structural | qualification | resolution | rules
  version          TEXT NOT NULL,               -- sha256-<hex>, from declaration-version.mjs
  declaration_json TEXT NOT NULL,
  dropped_json     TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, kind, version)
);

-- The tiny, mutable pointer — "what is CURRENT for this user and this kind"
-- (`design-the-runtime-compile.md` §4.2 point 1: "a tiny, mutable pointer... served with a short
-- or absent cache lifetime, because it must always answer freshly"). One row per (user, kind);
-- flipped on every accepted store, never appended to.
CREATE TABLE IF NOT EXISTS declaration_current (
  user_id    TEXT NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL,
  version    TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, kind)
);

-- RECENTLY USED (2026-10-10, backlog row recently-used-recorded-on-the-server). One row per
-- (user, item): a view opened (`view:<id>`) or a task jumped to or edited (`task:<qntm id>`),
-- with the last time it was used. Keyed by user from the first line, so every device of one user
-- sees one list. worker/src/recent.js writes and reads it; it keeps the newest 200 per user.
-- Every statement is rerunnable: CI applies this file before each deploy (worker.yml).
CREATE TABLE IF NOT EXISTS recents (
  user_id  TEXT NOT NULL REFERENCES users(id),
  item_key TEXT NOT NULL,
  used_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, item_key)
);
CREATE INDEX IF NOT EXISTS recents_by_user_time ON recents(user_id, used_at);

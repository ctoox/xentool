-- D1 schema for the /sql console.
--
-- Apply once after creating the database:
--   npx wrangler d1 execute xentool --file=./schema.sql --remote
--
-- The console is read-only, so nothing here is written by the app itself;
-- these tables exist so the console has something meaningful to inspect and
-- so a future tool has a place to write.

create table if not exists notes (
  id integer primary key autoincrement,
  body text not null,
  created_at integer not null default (unixepoch()),
  expires_at integer
);

create index if not exists notes_created_at on notes (created_at desc);

-- Optional: a place to record what was inspected, for audit purposes.
create table if not exists query_log (
  id integer primary key autoincrement,
  sql text not null,
  ran_at integer not null default (unixepoch()),
  duration_ms integer
);

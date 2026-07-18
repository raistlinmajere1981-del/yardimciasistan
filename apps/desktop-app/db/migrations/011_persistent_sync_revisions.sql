CREATE TABLE IF NOT EXISTS sync_outbox_revisions (
  job_key TEXT PRIMARY KEY,
  source_revision INTEGER NOT NULL CHECK (source_revision > 0),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO sync_outbox_revisions (job_key, source_revision, updated_at)
SELECT job_key, MAX(1, source_revision), updated_at
FROM sync_outbox;

-- A database that already completed a v2 publication may no longer have an
-- outbox row. Seed missing counters above any practical legacy revision so the
-- first post-upgrade publication cannot move the hosting copy backwards.
INSERT OR IGNORE INTO sync_outbox_revisions (job_key, source_revision, updated_at)
VALUES (
  'menu',
  MAX(1, CAST(strftime('%s', 'now') AS INTEGER)),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

INSERT OR IGNORE INTO sync_outbox_revisions (job_key, source_revision, updated_at)
VALUES (
  'android_snapshot',
  MAX(1, CAST(strftime('%s', 'now') AS INTEGER)),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

CREATE TRIGGER IF NOT EXISTS trg_sync_outbox_revision_insert
AFTER INSERT ON sync_outbox
BEGIN
  INSERT INTO sync_outbox_revisions (job_key, source_revision, updated_at)
  VALUES (NEW.job_key, MAX(1, NEW.source_revision), NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = MAX(sync_outbox_revisions.source_revision + 1, excluded.source_revision),
    updated_at = excluded.updated_at;

  UPDATE sync_outbox
  SET source_revision = (
    SELECT source_revision
    FROM sync_outbox_revisions
    WHERE job_key = NEW.job_key
  )
  WHERE job_key = NEW.job_key;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_outbox_revision_update
AFTER UPDATE OF source_revision ON sync_outbox
WHEN NEW.source_revision > OLD.source_revision
BEGIN
  INSERT INTO sync_outbox_revisions (job_key, source_revision, updated_at)
  VALUES (NEW.job_key, NEW.source_revision, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = MAX(sync_outbox_revisions.source_revision, excluded.source_revision),
    updated_at = excluded.updated_at;
END;

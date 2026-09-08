-- Live cashier scans are short-lived observations, not action receipts, sale
-- drafts, sales, stock movements, or finance entries. The Android action id is
-- unique so transport retries cannot produce duplicate observations.

CREATE TABLE IF NOT EXISTS market_barcode_scan_events (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  android_action_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  barcode TEXT NOT NULL,
  scanned_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  consumed_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'expired')),
  UNIQUE (android_action_id)
);

CREATE INDEX IF NOT EXISTS idx_market_barcode_scans_business_pending
  ON market_barcode_scan_events (business_id, status, scanned_at, received_at, id);

-- Reviewing a phone draft must be visible in the next Android snapshot just
-- like creating it. The desktop remains the authority for the status change.
CREATE TRIGGER IF NOT EXISTS trg_market_product_drafts_android_snapshot_update
AFTER UPDATE OF status ON catalog_product_drafts
WHEN OLD.status <> NEW.status
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0,
    next_attempt_at = '',
    last_error = '',
    updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_market_cart_drafts_android_snapshot_update
AFTER UPDATE OF status ON commerce_sale_drafts
WHEN OLD.status <> NEW.status
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0,
    next_attempt_at = '',
    last_error = '',
    updated_at = excluded.updated_at;
END;

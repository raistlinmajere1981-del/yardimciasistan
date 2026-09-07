-- Market Android companion drafts are explicit review records. They are not
-- inactive catalog products or pending commerce sales.

CREATE TABLE IF NOT EXISTS catalog_product_drafts (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  barcode TEXT NOT NULL,
  proposed_name TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  proposed_category TEXT NOT NULL DEFAULT '',
  proposed_purchase_price REAL NOT NULL DEFAULT 0 CHECK (proposed_purchase_price >= 0),
  proposed_sale_price REAL NOT NULL DEFAULT 0 CHECK (proposed_sale_price >= 0),
  currency TEXT NOT NULL DEFAULT 'TRY',
  unit TEXT NOT NULL DEFAULT 'piece' CHECK (unit IN (
    'piece', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'meter', 'other'
  )),
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'android',
  created_by_device TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalog_product_drafts_business_status
  ON catalog_product_drafts (business_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_catalog_product_drafts_barcode
  ON catalog_product_drafts (business_id, barcode, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce_sale_drafts (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  source TEXT NOT NULL DEFAULT 'android',
  created_by_device TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commerce_sale_drafts_business_status
  ON commerce_sale_drafts (business_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce_sale_draft_items (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (draft_id) REFERENCES commerce_sale_drafts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_commerce_sale_draft_items_draft
  ON commerce_sale_draft_items (draft_id, created_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_sale_draft_items_product_unique
  ON commerce_sale_draft_items (draft_id, product_id);

CREATE TRIGGER IF NOT EXISTS trg_market_product_drafts_android_snapshot_insert
AFTER INSERT ON catalog_product_drafts
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.created_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0,
    next_attempt_at = '',
    last_error = '',
    updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_market_cart_drafts_android_snapshot_insert
AFTER INSERT ON commerce_sale_drafts
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.created_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0,
    next_attempt_at = '',
    last_error = '',
    updated_at = excluded.updated_at;
END;

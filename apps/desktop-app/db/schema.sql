-- Yardımcı Asistan current clean-install desktop schema.
-- Historical database upgrades are intentionally unsupported; reset to this schema.

-- TABLES
CREATE TABLE service_settings_verifications (
  service TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  tested_at TEXT NOT NULL
);

CREATE TABLE ai_service_profiles (
  service TEXT PRIMARY KEY,
  project_name TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  vision_model TEXT NOT NULL DEFAULT '',
  image_model TEXT NOT NULL DEFAULT '',
  stt_model TEXT NOT NULL DEFAULT '',
  model_options_json TEXT NOT NULL DEFAULT '[]',
  timeout_seconds INTEGER NOT NULL DEFAULT 30,
  api_key_encrypted TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE android_action_receipts (
  id TEXT PRIMARY KEY,
  intent_hash TEXT NOT NULL DEFAULT '',
  action_type TEXT NOT NULL,
  device_id TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE android_market_sale_result_receipts (
  action_id TEXT PRIMARY KEY REFERENCES android_action_receipts(id),
  sale_id TEXT NOT NULL UNIQUE REFERENCES commerce_sales(id),
  result_json TEXT NOT NULL CHECK (json_valid(result_json))
);
CREATE TRIGGER android_market_sale_result_no_update BEFORE UPDATE ON android_market_sale_result_receipts BEGIN SELECT RAISE(ABORT, 'receipt immutable'); END;
CREATE TRIGGER android_market_sale_result_no_delete BEFORE DELETE ON android_market_sale_result_receipts BEGIN SELECT RAISE(ABORT, 'receipt immutable'); END;

CREATE TABLE android_devices (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL DEFAULT '',
  app_version TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  authorization_epoch INTEGER NOT NULL DEFAULT 1 CHECK (typeof(authorization_epoch) = 'integer' AND authorization_epoch BETWEEN 1 AND 9007199254740991),
  permissions_json TEXT NOT NULL DEFAULT '[]',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT NULL
, permission_groups_json TEXT NOT NULL
  DEFAULT '{"service_orders":true,"cashier":false,"rooms_tasks":true,"customer_reservation":false}');

CREATE TABLE android_local_credentials (
  device_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (device_id) REFERENCES android_devices(device_id) ON DELETE CASCADE
);

-- Internal-only explicit customer scope; never derived from Android device roles.
CREATE TABLE android_benefits_balance_grants (
  business_id TEXT NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  device_record_id TEXT NOT NULL REFERENCES android_devices(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  authorization_epoch INTEGER NOT NULL CHECK (authorization_epoch > 0),
  PRIMARY KEY (business_id, device_record_id, customer_id)
);

-- Internal-only spend authority; never inferred from balance access or device role.
CREATE TABLE android_benefits_spend_grants (
  business_id TEXT NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  device_record_id TEXT NOT NULL REFERENCES android_devices(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  authorization_epoch INTEGER NOT NULL CHECK (authorization_epoch > 0),
  grant_generation TEXT NOT NULL CHECK (length(grant_generation) = 64 AND grant_generation NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (business_id, device_record_id, customer_id)
);

CREATE TABLE business (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  profile_id TEXT NOT NULL CHECK (profile_id IN ('pension_restaurant', 'pension', 'restaurant', 'market')),
  phone TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  publish_rooms_web INTEGER NOT NULL DEFAULT 1 CHECK (publish_rooms_web IN (0, 1)),
  publish_tables_web INTEGER NOT NULL DEFAULT 0 CHECK (publish_tables_web IN (0, 1)),
  publish_qr_menu_web INTEGER NOT NULL DEFAULT 1 CHECK (publish_qr_menu_web IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
);

CREATE TABLE business_public_profile (
  map_display_mode TEXT NOT NULL DEFAULT 'manual' CHECK (map_display_mode IN ('manual', 'google_maps_embed')),
  google_maps_embed_url TEXT NOT NULL DEFAULT '',
  business_id TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  about_text TEXT NOT NULL DEFAULT '',
  latitude REAL NULL
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude REAL NULL
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  directions_note TEXT NOT NULL DEFAULT '',
  check_in_time TEXT NOT NULL DEFAULT '',
  check_out_time TEXT NOT NULL DEFAULT '',
  breakfast_start_time TEXT NOT NULL DEFAULT '',
  breakfast_end_time TEXT NOT NULL DEFAULT '',
  features_json TEXT NOT NULL DEFAULT '[]',
  policy_note TEXT NOT NULL DEFAULT '',
  payment_note TEXT NOT NULL DEFAULT '',
  languages_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  ),
  FOREIGN KEY (business_id) REFERENCES business(id) ON DELETE CASCADE
);

CREATE TABLE business_public_social_links (
  business_id TEXT PRIMARY KEY,
  links_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  FOREIGN KEY (business_id) REFERENCES business(id) ON DELETE CASCADE
);

CREATE TABLE business_capabilities (
  business_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  is_selected INTEGER NOT NULL DEFAULT 0 CHECK (is_selected IN (0, 1)),
  source TEXT NOT NULL DEFAULT 'profile' CHECK (source IN ('system', 'profile', 'user')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (business_id, capability_id),
  FOREIGN KEY (business_id) REFERENCES business(id) ON DELETE CASCADE
);

CREATE TABLE catalog_categories (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  parent_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE catalog_products (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  category_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sale_price REAL NOT NULL DEFAULT 0,
  dealer_price_a REAL NULL CHECK (dealer_price_a IS NULL OR dealer_price_a >= 0),
  dealer_price_b REAL NULL CHECK (dealer_price_b IS NULL OR dealer_price_b >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  quick_access_enabled INTEGER NOT NULL DEFAULT 0 CHECK (quick_access_enabled IN (0, 1)),
  quick_access_order INTEGER NOT NULL DEFAULT 0,
  purchase_price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  unit TEXT NOT NULL DEFAULT 'piece',
  tax_rate REAL NOT NULL DEFAULT 0,
  track_inventory INTEGER NOT NULL DEFAULT 1 CHECK (track_inventory IN (0, 1)),
  minimum_quantity REAL NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  -- Original import assets belong to the canonical product image archive; no separate gallery owner.
  image_original_assets_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(image_original_assets_json)),
  image_asset_path TEXT NOT NULL DEFAULT '',
  image_source_url TEXT NOT NULL DEFAULT '',
  data_source TEXT NOT NULL DEFAULT '',
  source_product_url TEXT NOT NULL DEFAULT '',
  data_license TEXT NOT NULL DEFAULT '',
  image_license TEXT NOT NULL DEFAULT '',
  source_fetched_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT ''
);

-- Transport acknowledgements only. Image identity/order/bytes remain in catalog_products.
CREATE TABLE catalog_product_media_publications (
  product_id TEXT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  target TEXT NOT NULL,
  public_url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  PRIMARY KEY (product_id, content_hash, target)
);

CREATE TABLE commerce_sale_draft_items (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (draft_id) REFERENCES commerce_sale_drafts(id) ON DELETE CASCADE
);

CREATE TABLE commerce_sale_drafts (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  source TEXT NOT NULL DEFAULT 'android',
  created_by_device TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A phone inbox draft may create at most one sale. Review remains independent
-- inbox state; this durable link survives a failed review or lost IPC response.
CREATE TABLE commerce_cart_draft_sales (
  draft_id TEXT PRIMARY KEY REFERENCES commerce_sale_drafts(id),
  sale_id TEXT NOT NULL UNIQUE REFERENCES commerce_sales(id),
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- A desktop checkout intent survives IPC retries without duplicating stock/debt.
CREATE TABLE commerce_market_sale_receipts (
  operation_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business(id),
  sale_id TEXT NOT NULL UNIQUE REFERENCES commerce_sales(id),
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE commerce_sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  barcode TEXT NOT NULL DEFAULT '',
  unit_price REAL NOT NULL,
  quantity REAL NOT NULL,
  line_total REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE commerce_sales (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  customer_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  subtotal REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  payment_method TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'desktop',
  opened_at TEXT NOT NULL,
  closed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (business_id, customer_id) REFERENCES customers(business_id, id)
);

-- Sale provenance is chosen by the transaction owner and cannot be relabeled.
CREATE TRIGGER trg_sale_source_immutable BEFORE UPDATE OF source ON commerce_sales
WHEN NEW.source IS NOT OLD.source
BEGIN SELECT RAISE(ABORT, 'commerce_sale_source_immutable'); END;

-- Parent-owned paid tender evidence. Sale total remains after discounts, BEFORE
-- Puan tender; Finance projects only cash_received_minor for these sales.
CREATE TABLE commerce_sale_settlements (
  sale_id TEXT PRIMARY KEY REFERENCES commerce_sales(id),
  business_id TEXT NOT NULL REFERENCES business(id),
  customer_id TEXT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'bank', 'other')),
  cash_received_minor INTEGER NOT NULL CHECK (typeof(cash_received_minor) = 'integer' AND cash_received_minor BETWEEN 0 AND 9007199254740991),
  points_tender_minor INTEGER NOT NULL CHECK (typeof(points_tender_minor) = 'integer' AND points_tender_minor BETWEEN 0 AND 9007199254740991),
  created_at TEXT NOT NULL,
  FOREIGN KEY (business_id, sale_id) REFERENCES commerce_sales(business_id, id),
  FOREIGN KEY (business_id, customer_id) REFERENCES customers(business_id, id)
);
CREATE TRIGGER trg_commerce_sale_settlement_immutable_update BEFORE UPDATE ON commerce_sale_settlements
BEGIN SELECT RAISE(ABORT, 'commerce_sale_settlement_immutable'); END;
CREATE TRIGGER trg_commerce_sale_settlement_immutable_delete BEFORE DELETE ON commerce_sale_settlements
BEGIN SELECT RAISE(ABORT, 'commerce_sale_settlement_immutable'); END;

-- B2c-1: full Desktop Quick Sale refund, never a mutation of the original sale.
-- The parent and exact operation receipt commit with stock/Finance/points.
CREATE TABLE commerce_sale_full_refunds (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business(id),
  sale_id TEXT NOT NULL UNIQUE REFERENCES commerce_sales(id),
  customer_id TEXT NULL,
  snapshot_id TEXT NULL,
  operation_id TEXT NOT NULL,
  command_json TEXT NOT NULL CHECK (json_valid(command_json)),
  actor_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('desktop-market-quick-sale', 'android-market-sale')),
  currency TEXT NOT NULL,
  cash_minor INTEGER NOT NULL CHECK (typeof(cash_minor) = 'integer' AND cash_minor >= 0),
  points_minor INTEGER NOT NULL CHECK (typeof(points_minor) = 'integer' AND points_minor >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','card','bank','other')),
  items_json TEXT NOT NULL CHECK (json_valid(items_json)),
  stock_movements_json TEXT NOT NULL CHECK (json_valid(stock_movements_json)),
  created_at TEXT NOT NULL,
  UNIQUE (business_id, operation_id),
  FOREIGN KEY (business_id, sale_id) REFERENCES commerce_sales(business_id, id),
  FOREIGN KEY (business_id, customer_id) REFERENCES customers(business_id, id),
  FOREIGN KEY (business_id, snapshot_id) REFERENCES commerce_benefit_snapshots(business_id, id)
);
CREATE TABLE commerce_sale_full_refund_receipts (
  refund_id TEXT PRIMARY KEY REFERENCES commerce_sale_full_refunds(id),
  receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json))
);
CREATE TRIGGER trg_sale_full_refund_no_update BEFORE UPDATE ON commerce_sale_full_refunds
BEGIN SELECT RAISE(ABORT, 'commerce_sale_full_refund_immutable'); END;
CREATE TRIGGER trg_sale_full_refund_no_delete BEFORE DELETE ON commerce_sale_full_refunds
BEGIN SELECT RAISE(ABORT, 'commerce_sale_full_refund_immutable'); END;
CREATE TRIGGER trg_sale_full_refund_receipt_no_update BEFORE UPDATE ON commerce_sale_full_refund_receipts
BEGIN SELECT RAISE(ABORT, 'commerce_sale_full_refund_receipt_immutable'); END;
CREATE TRIGGER trg_sale_full_refund_receipt_no_delete BEFORE DELETE ON commerce_sale_full_refund_receipts
BEGIN SELECT RAISE(ABORT, 'commerce_sale_full_refund_receipt_immutable'); END;
CREATE TRIGGER trg_refunded_sale_no_update BEFORE UPDATE ON commerce_sales
WHEN EXISTS (SELECT 1 FROM commerce_sale_full_refunds WHERE sale_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'commerce_refunded_sale_immutable'); END;
CREATE TRIGGER trg_refunded_sale_no_delete BEFORE DELETE ON commerce_sales
WHEN EXISTS (SELECT 1 FROM commerce_sale_full_refunds WHERE sale_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'commerce_refunded_sale_immutable'); END;

CREATE TABLE commerce_orders (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business(id),
  customer_id TEXT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  buyer_snapshot_json TEXT NOT NULL DEFAULT 'null' CHECK (json_valid(buyer_snapshot_json)),
  delivery_snapshot_json TEXT NOT NULL DEFAULT '{"method":"pickup","address":null}' CHECK (json_valid(delivery_snapshot_json)),
  status TEXT NOT NULL DEFAULT 'placed'
    CHECK (status IN ('placed', 'confirmed', 'fulfilled', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'desktop',
  source_reference TEXT NOT NULL DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total REAL NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  total REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
  currency TEXT NOT NULL DEFAULT 'TRY'
    CHECK (length(currency) = 3 AND currency NOT GLOB '*[^A-Z]*'),
  note TEXT NOT NULL DEFAULT '',
  placed_at TEXT NOT NULL,
  confirmed_at TEXT NOT NULL DEFAULT '',
  fulfilled_at TEXT NOT NULL DEFAULT '',
  cancelled_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (business_id, customer_id) REFERENCES customers(business_id, id),
  CHECK (discount_total <= subtotal),
  CHECK (total <= subtotal)
);

CREATE TABLE commerce_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'piece',
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  quantity REAL NOT NULL CHECK (quantity > 0),
  line_total REAL NOT NULL CHECK (line_total >= 0),
  tax_rate REAL NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  created_at TEXT NOT NULL
);

-- Provider-neutral physical shipment; many shipments may reference one order.
CREATE TABLE commerce_shipments (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business(id),
  order_id TEXT NOT NULL REFERENCES commerce_orders(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'dispatched', 'delivered', 'cancelled')),
  provider_id TEXT NOT NULL DEFAULT '',
  provider_name TEXT NOT NULL DEFAULT '',
  external_reference TEXT NOT NULL DEFAULT '',
  tracking_number TEXT NOT NULL DEFAULT '',
  tracking_url TEXT NOT NULL DEFAULT '',
  label_reference TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  ready_at TEXT NOT NULL DEFAULT '',
  dispatched_at TEXT NOT NULL DEFAULT '',
  delivered_at TEXT NOT NULL DEFAULT '',
  cancelled_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_commerce_shipments_order ON commerce_shipments (order_id, created_at, id);
CREATE INDEX idx_commerce_shipments_status ON commerce_shipments (business_id, status);

-- Local provider configuration. Password is an OS-keyring encrypted envelope only.
CREATE TABLE commerce_shipping_provider_config (
  business_id TEXT NOT NULL REFERENCES business(id),
  provider_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  environment TEXT NOT NULL DEFAULT 'test' CHECK (environment IN ('test', 'production')),
  customer_code TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  password_encrypted TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (business_id, provider_id)
);

-- Durable send boundary: submitted is ambiguous until reconciled by reference.
CREATE TABLE commerce_shipment_registrations (
  shipment_id TEXT PRIMARY KEY REFERENCES commerce_shipments(id),
  provider_id TEXT NOT NULL,
  integration_code TEXT NOT NULL,
  account_fingerprint TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('prepared', 'submitted', 'registered')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider_id, account_fingerprint, integration_code)
);

CREATE TABLE commerce_order_fulfillments (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business(id),
  order_id TEXT NOT NULL REFERENCES commerce_orders(id),
  sale_id TEXT NOT NULL REFERENCES commerce_sales(id),
  operation_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  settlement_type TEXT NOT NULL
    CHECK (settlement_type IN ('paid', 'credit', 'no_payment')),
  payment_method TEXT NOT NULL DEFAULT '',
  inventory_location_id TEXT NULL REFERENCES inventory_locations(id),
  created_at TEXT NOT NULL,
  CHECK (
    (settlement_type = 'paid' AND payment_method IN ('cash', 'card', 'bank', 'other'))
    OR (settlement_type = 'credit' AND payment_method = '')
    OR (settlement_type = 'no_payment' AND payment_method = 'none')
  )
);

CREATE TABLE commerce_suppliers (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  tax_number TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE customer_credit_entries (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business(id),
  customer_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount_minor INTEGER NOT NULL
    CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0 AND amount_minor <= 999999999999),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency NOT GLOB '*[^A-Z]*'),
  entry_type TEXT NOT NULL CHECK (entry_type IN
    ('credit_sale', 'payment', 'adjustment_debit', 'adjustment_credit')),
  sale_id TEXT,
  payment_method TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'desktop',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (business_id, customer_id) REFERENCES customers(business_id, id),
  FOREIGN KEY (business_id, sale_id) REFERENCES commerce_sales(business_id, id),
  CHECK ((direction = 'debit' AND entry_type IN ('credit_sale', 'adjustment_debit'))
    OR (direction = 'credit' AND entry_type IN ('payment', 'adjustment_credit'))),
  CHECK ((entry_type = 'credit_sale' AND sale_id IS NOT NULL)
    OR (entry_type != 'credit_sale' AND sale_id IS NULL)),
  CHECK ((entry_type = 'payment' AND payment_method IN ('cash', 'card', 'bank', 'other'))
    OR (entry_type != 'payment' AND payment_method = '')),
  CHECK (entry_type NOT IN ('adjustment_debit', 'adjustment_credit') OR length(trim(note)) > 0)
);

CREATE TABLE customer_room_stays (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'checked_in', 'checked_out', 'cancelled')),
  check_in_date TEXT NOT NULL,
  check_out_date TEXT NOT NULL DEFAULT '',
  guest_count INTEGER NOT NULL DEFAULT 1 CHECK (guest_count BETWEEN 1 AND 50),
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  checked_in_at TEXT NOT NULL DEFAULT '',
  checked_out_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT NOT NULL DEFAULT '',
  last_contact_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
, birthday_message_enabled INTEGER NOT NULL DEFAULT 1 CHECK (birthday_message_enabled IN (0, 1)), identity_type TEXT NOT NULL DEFAULT ''
  CHECK (identity_type IN ('', 'tc_identity_card', 'passport', 'other')), identity_number TEXT NOT NULL DEFAULT '', nationality TEXT NOT NULL DEFAULT '', birth_date TEXT NOT NULL DEFAULT '', gender TEXT NOT NULL DEFAULT ''
  CHECK (gender IN ('', 'female', 'male', 'unspecified')), document_serial_number TEXT NOT NULL DEFAULT '', document_expiry_date TEXT NOT NULL DEFAULT '', birth_place TEXT NOT NULL DEFAULT '', mother_name TEXT NOT NULL DEFAULT '', father_name TEXT NOT NULL DEFAULT '', issuing_authority TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', business_id TEXT REFERENCES business(id));

CREATE TABLE customer_commercial_profiles (
  customer_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  tax_office TEXT NOT NULL DEFAULT '',
  tax_number TEXT NOT NULL DEFAULT '',
  authorized_person TEXT NOT NULL DEFAULT '',
  dealer_status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (dealer_status IN ('active', 'inactive')),
  price_group TEXT NOT NULL DEFAULT 'retail'
    CHECK (price_group IN ('retail', 'dealer_a', 'dealer_b')),
  payment_term_days INTEGER NOT NULL DEFAULT 0
    CHECK (payment_term_days BETWEEN 0 AND 3650),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES business(id) ON DELETE CASCADE
);

CREATE TABLE daily_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  task_type TEXT NOT NULL DEFAULT 'note',
  status TEXT NOT NULL DEFAULT 'pending',
  due_date TEXT NOT NULL DEFAULT '',
  due_time TEXT NOT NULL DEFAULT '',
  related_type TEXT NOT NULL DEFAULT '',
  related_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
);

CREATE TABLE finance_entries (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('income', 'expense')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'TRY',
  payment_method TEXT NOT NULL DEFAULT 'unspecified'
    CHECK (payment_method IN ('cash', 'card', 'bank', 'other', 'unspecified')),
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
);

CREATE TABLE finance_categories (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('income', 'expense')),
  name TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE inventory_balances (
  product_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (product_id, location_id)
);

-- Web channel settings reference the canonical product; visibility defaults OFF.
CREATE TABLE commerce_product_publications (
  product_id TEXT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES business(id),
  channel TEXT NOT NULL DEFAULT 'online_sales' CHECK (channel = 'online_sales'),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  title_override TEXT NOT NULL DEFAULT '',
  description_override TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (product_id, channel)
);
CREATE INDEX idx_commerce_product_publications_business
  ON commerce_product_publications(business_id, channel, is_published, sort_order);

CREATE TABLE inventory_locations (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE inventory_movements (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES catalog_products(id),
  location_id TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  quantity_delta REAL NOT NULL,
  quantity_after REAL NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0,
  reference_type TEXT NOT NULL DEFAULT '',
  reference_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  actor_source TEXT NOT NULL DEFAULT 'desktop',
  created_at TEXT NOT NULL
);

CREATE TABLE market_barcode_scan_events (
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

CREATE TABLE menu_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
);

CREATE TABLE menu_product_entries (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES catalog_products(id),
  category_id TEXT NOT NULL,
  is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  price_override REAL NULL CHECK (price_override IS NULL OR price_override >= 0),
  allergens_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  hide_when_out_of_stock INTEGER NOT NULL DEFAULT 0 CHECK (hide_when_out_of_stock IN (0, 1)),
  stock_consumption_quantity REAL NOT NULL DEFAULT 1 CHECK (stock_consumption_quantity > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  FOREIGN KEY (category_id) REFERENCES menu_categories(id)
);

CREATE UNIQUE INDEX idx_menu_product_entries_active_product
  ON menu_product_entries(product_id) WHERE deleted_at = '';
CREATE INDEX idx_menu_product_entries_category_order
  ON menu_product_entries(category_id, sort_order);

CREATE TABLE pension_payments (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'TRY',
  payment_method TEXT NOT NULL DEFAULT 'unspecified'
    CHECK (payment_method IN ('cash', 'card', 'bank', 'other', 'unspecified')),
  paid_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  FOREIGN KEY (reservation_id) REFERENCES reservations(id)
);

CREATE TABLE purchase_order_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_cost REAL NOT NULL,
  line_total REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  ordered_at TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  dealer_application_json TEXT NOT NULL DEFAULT 'null',
  documents_json TEXT NOT NULL DEFAULT '[]',
  dealer_customer_id TEXT NOT NULL DEFAULT '',
  customer_id TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  date_text TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  time TEXT NOT NULL DEFAULT '',
  guest_count INTEGER NOT NULL DEFAULT 1,
  adult_count INTEGER NOT NULL DEFAULT 0,
  child_count INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  ai_summary TEXT NOT NULL DEFAULT '',
  ai_suggested_reply TEXT NOT NULL DEFAULT '',
  whatsapp_message TEXT NOT NULL DEFAULT '',
  assigned_to TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE reservations (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL DEFAULT '',
  customer_id TEXT NOT NULL DEFAULT '',
  reservation_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL DEFAULT '',
  time TEXT NOT NULL DEFAULT '',
  guest_count INTEGER NOT NULL DEFAULT 1,
  adult_count INTEGER NOT NULL DEFAULT 0,
  child_count INTEGER NOT NULL DEFAULT 0,
  room_ids_json TEXT NOT NULL DEFAULT '[]',
  table_ids_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  price_note TEXT NOT NULL DEFAULT '',
  payment_status TEXT NOT NULL DEFAULT 'not_required',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
, agreed_total_minor INTEGER NOT NULL DEFAULT 0
  CHECK (agreed_total_minor >= 0), currency TEXT NOT NULL DEFAULT 'TRY');

CREATE TABLE room_folio_items (
  id TEXT PRIMARY KEY,
  folio_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('menu', 'manual_charge', 'discount')),
  product_id TEXT NULL REFERENCES catalog_products(id),
  menu_entry_id TEXT NULL REFERENCES menu_product_entries(id),
  inventory_quantity_per_item REAL NOT NULL DEFAULT 0 CHECK (inventory_quantity_per_item >= 0),
  inventory_location_id TEXT NULL REFERENCES inventory_locations(id),
  label TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_minor >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 1000),
  line_total_minor INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  FOREIGN KEY (folio_id) REFERENCES room_folios(id)
);

CREATE TABLE room_folio_payments (
  id TEXT PRIMARY KEY,
  folio_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'TRY',
  payment_method TEXT NOT NULL DEFAULT 'unspecified'
    CHECK (payment_method IN ('cash', 'card', 'bank', 'other', 'unspecified')),
  paid_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'direct' CHECK (origin IN ('direct', 'reservation')),
  reference_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  FOREIGN KEY (folio_id) REFERENCES room_folios(id)
);

CREATE TABLE room_folio_table_order_transfers (
  id TEXT PRIMARY KEY,
  folio_id TEXT NOT NULL,
  folio_item_id TEXT NOT NULL UNIQUE,
  table_order_id TEXT NOT NULL UNIQUE,
  table_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'TRY',
  created_at TEXT NOT NULL,
  FOREIGN KEY (folio_id) REFERENCES room_folios(id),
  FOREIGN KEY (folio_item_id) REFERENCES room_folio_items(id),
  FOREIGN KEY (table_order_id) REFERENCES table_orders(id),
  FOREIGN KEY (table_id) REFERENCES tables(id)
);

CREATE TABLE room_folios (
  id TEXT PRIMARY KEY,
  stay_id TEXT NOT NULL UNIQUE,
  room_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  guest_count INTEGER NOT NULL DEFAULT 1 CHECK (guest_count BETWEEN 1 AND 50),
  check_in_date TEXT NOT NULL,
  planned_check_out_date TEXT NOT NULL DEFAULT '',
  nightly_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (nightly_price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'TRY',
  lodging_total_minor INTEGER NOT NULL DEFAULT 0 CHECK (lodging_total_minor >= 0),
  lodging_manual_override INTEGER NOT NULL DEFAULT 0 CHECK (lodging_manual_override IN (0, 1)),
  opened_at TEXT NOT NULL,
  closed_at TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  FOREIGN KEY (stay_id) REFERENCES customer_room_stays(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  number TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 1,
  bed_info TEXT NOT NULL DEFAULT '',
  floor TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'available',
  features_json TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  price_note TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
, nightly_price_minor INTEGER NOT NULL DEFAULT 0
  CHECK (nightly_price_minor >= 0), price_currency TEXT NOT NULL DEFAULT 'TRY');

CREATE TABLE kbs_service_settings (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  provider TEXT NOT NULL DEFAULT 'egm' CHECK (provider IN ('egm', 'jandarma')),
  facility_code TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  authorized_identity_number TEXT NOT NULL DEFAULT '',
  password_encrypted TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE settings (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  web_module_url TEXT NOT NULL DEFAULT '',
  sync_secret TEXT NOT NULL DEFAULT '',
  auto_sync_enabled INTEGER NOT NULL DEFAULT 1 CHECK (auto_sync_enabled IN (0, 1)),
  traffic_enabled INTEGER NOT NULL DEFAULT 1 CHECK (traffic_enabled IN (0, 1)),
  local_network_enabled INTEGER NOT NULL DEFAULT 1 CHECK (local_network_enabled IN (0, 1)),
  ai_provider TEXT NOT NULL DEFAULT '',
  ai_service TEXT NOT NULL DEFAULT 'openai',
  ai_last_published_at TEXT NOT NULL DEFAULT '',
  google_reviews_enabled INTEGER NOT NULL DEFAULT 0 CHECK (google_reviews_enabled IN (0, 1)),
  google_place_id TEXT NOT NULL DEFAULT '',
  google_places_api_key_encrypted TEXT NOT NULL DEFAULT '',
  google_reviews_last_published_at TEXT NOT NULL DEFAULT '',
  google_reviews_publish_pending INTEGER NOT NULL DEFAULT 0 CHECK (google_reviews_publish_pending IN (0, 1)),
  whatsapp_mode TEXT NOT NULL DEFAULT 'webview',
  birthday_enabled INTEGER NOT NULL DEFAULT 1 CHECK (birthday_enabled IN (0, 1)),
  birthday_mode TEXT NOT NULL DEFAULT 'manual' CHECK (birthday_mode IN ('manual', 'automatic')),
  birthday_send_time TEXT NOT NULL DEFAULT '10:00',
  birthday_message_template TEXT NOT NULL DEFAULT 'Doğum gününüz kutlu olsun {ad}! 🎉 {işletme} olarak sağlıklı ve güzel bir yıl dileriz.',
  product_data_enabled INTEGER NOT NULL DEFAULT 0 CHECK (product_data_enabled IN (0, 1)),
  product_data_provider TEXT NOT NULL DEFAULT 'open_food_facts',
  product_data_auto_search INTEGER NOT NULL DEFAULT 1 CHECK (product_data_auto_search IN (0, 1)),
  product_data_include_images INTEGER NOT NULL DEFAULT 1 CHECK (product_data_include_images IN (0, 1)),
  dealer_application_enabled INTEGER NOT NULL DEFAULT 0 CHECK (dealer_application_enabled IN (0, 1)),
  dealer_portal_enabled INTEGER NOT NULL DEFAULT 0 CHECK (dealer_portal_enabled IN (0, 1)),
  online_sales_pickup_enabled INTEGER NOT NULL DEFAULT 1 CHECK (online_sales_pickup_enabled IN (0, 1)),
  online_sales_delivery_enabled INTEGER NOT NULL DEFAULT 0 CHECK (online_sales_delivery_enabled IN (0, 1)),
  online_sales_shipping_enabled INTEGER NOT NULL DEFAULT 0 CHECK (online_sales_shipping_enabled IN (0, 1) AND (online_sales_delivery_enabled = 0 OR online_sales_pickup_enabled = 1 OR online_sales_shipping_enabled = 1)),
  setup_completed INTEGER NOT NULL DEFAULT 0 CHECK (setup_completed IN (0, 1)),
  app_password_verifier TEXT NOT NULL DEFAULT '',
  app_password_updated_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only',
  FOREIGN KEY (business_id) REFERENCES business(id) ON DELETE CASCADE
);

CREATE TABLE stock_image_import_lines (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  matched_product_id TEXT NULL,
  suggested_quantity REAL NULL CHECK (suggested_quantity IS NULL OR suggested_quantity > 0),
  approved_quantity REAL NULL CHECK (approved_quantity IS NULL OR approved_quantity > 0),
  source_quantity_text TEXT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'ignored', 'needs_review')),
  note TEXT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (import_id) REFERENCES stock_image_imports(import_id) ON DELETE CASCADE,
  FOREIGN KEY (matched_product_id) REFERENCES catalog_products(id)
);

CREATE TABLE stock_image_imports (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('desktop', 'android')),
  device_id TEXT NULL,
  image_hash TEXT NOT NULL,
  original_filename TEXT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'analyzing', 'review', 'applied', 'cancelled', 'failed'
  )),
  supplier_name TEXT NULL,
  invoice_number TEXT NULL,
  invoice_date TEXT NULL,
  raw_analysis_json TEXT NULL,
  error_message TEXT NULL,
  created_at TEXT NOT NULL,
  applied_at TEXT NULL
);

CREATE TABLE sync_outbox (
  job_key TEXT PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN ('menu_publish', 'android_snapshot', 'online_catalog_publish', 'dealer_access_publish', 'marketing_website_publish', 'room_catalog_publish', 'table_catalog_publish', 'business_context_publish', 'ai_catalog_publish', 'public_room_availability_publish', 'ai_settings_publish', 'google_reviews_settings_publish')),
  source_revision INTEGER NOT NULL DEFAULT 1,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sync_outbox_revisions (
  job_key TEXT PRIMARY KEY,
  source_revision INTEGER NOT NULL CHECK (source_revision > 0),
  updated_at TEXT NOT NULL
);

-- Last prepared immutable body survives job deletion; desired projections are
-- reconstructed from canonical state on each cycle after a crash/restart.
CREATE TABLE sync_publication_payloads (
  job_key TEXT PRIMARY KEY,
  source_revision INTEGER NOT NULL,
  payload TEXT NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE TABLE sync_publication_sources (
  target TEXT PRIMARY KEY,
  source_epoch INTEGER NOT NULL CHECK (source_epoch > 0)
);

CREATE TABLE sync_runtime (
  id TEXT PRIMARY KEY,
  publication_target TEXT NOT NULL DEFAULT '',
  request_cursor INTEGER NOT NULL DEFAULT 0,
  web_order_cursor INTEGER NOT NULL DEFAULT 0,
  web_order_acknowledged_cursor INTEGER NOT NULL DEFAULT 0,
  acknowledged_cursor INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT NOT NULL DEFAULT '',
  last_success_at TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Explicit restore only. Local canonical restore can complete while Web recovery waits.
CREATE TABLE sync_restore_reconciliation (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  operation_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('activation_pending', 'reconciliation_pending', 'complete')),
  target TEXT NOT NULL DEFAULT '',
  expected_epoch INTEGER,
  source_epoch INTEGER NOT NULL DEFAULT 0,
  requests_through INTEGER NOT NULL DEFAULT 0,
  orders_through INTEGER NOT NULL DEFAULT 0,
  requests_complete INTEGER NOT NULL DEFAULT 0,
  orders_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE sync_restore_publications (
  job_key TEXT PRIMARY KEY,
  applied_revision INTEGER NOT NULL DEFAULT 0
);
-- Retained Web-origin ingress pricing/outcomes, not post-backup operational decisions.
-- Private recovery material is never a publication, renderer payload or diagnostic record.
CREATE TABLE sync_restore_order_snapshots (
  web_order_id TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json))
);

-- Local database identity, independent of business/setup data. Populated by initialize().
CREATE TABLE desktop_sync_identity (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  client_id TEXT NOT NULL UNIQUE CHECK (length(trim(client_id)) > 0)
);

CREATE TABLE table_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES catalog_products(id),
  menu_entry_id TEXT NULL REFERENCES menu_product_entries(id),
  inventory_quantity_per_item REAL NOT NULL DEFAULT 0 CHECK (inventory_quantity_per_item >= 0),
  inventory_location_id TEXT NULL REFERENCES inventory_locations(id),
  product_name TEXT NOT NULL,
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  line_total REAL NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'preparing', 'served', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'TRY'
  CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  FOREIGN KEY (order_id) REFERENCES table_orders(id) ON DELETE CASCADE
);

CREATE TABLE table_orders (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'preparing', 'served', 'payment', 'paid', 'cancelled')),
  opened_at TEXT NOT NULL,
  closed_at TEXT NOT NULL DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total REAL NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  total REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (table_id) REFERENCES tables(id)
);

-- Actual Desktop paid table tender, before assignment is cleared. No room-folio collection.
CREATE TABLE table_order_settlements (
  order_id TEXT PRIMARY KEY REFERENCES table_orders(id),
  business_id TEXT NOT NULL REFERENCES business(id),
  table_id TEXT NOT NULL REFERENCES tables(id),
  customer_id TEXT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind = 'table_order'),
  channel TEXT NOT NULL CHECK (channel = 'desktop_desk'),
  operation_key TEXT NOT NULL UNIQUE,
  request_hmac TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','card','bank','other')),
  currency TEXT NOT NULL,
  subtotal_minor INTEGER NOT NULL CHECK (typeof(subtotal_minor) = 'integer' AND subtotal_minor BETWEEN 1 AND 9007199254740991),
  discount_minor INTEGER NOT NULL CHECK (typeof(discount_minor) = 'integer' AND discount_minor BETWEEN 0 AND subtotal_minor),
  order_total_minor INTEGER NOT NULL CHECK (typeof(order_total_minor) = 'integer' AND order_total_minor = subtotal_minor - discount_minor AND order_total_minor > 0),
  cash_received_minor INTEGER NOT NULL CHECK (typeof(cash_received_minor) = 'integer' AND cash_received_minor BETWEEN 0 AND order_total_minor),
  points_tender_minor INTEGER NOT NULL CHECK (typeof(points_tender_minor) = 'integer' AND points_tender_minor BETWEEN 0 AND order_total_minor
    AND cash_received_minor + points_tender_minor = order_total_minor AND (points_tender_minor = 0 OR customer_id IS NOT NULL)),
  items_json TEXT NOT NULL CHECK (json_valid(items_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (business_id, customer_id) REFERENCES customers(business_id, id)
);
CREATE TRIGGER table_order_settlement_immutable_update BEFORE UPDATE ON table_order_settlements
BEGIN SELECT RAISE(ABORT, 'table_order_settlement_immutable'); END;
CREATE TRIGGER table_order_settlement_immutable_delete BEFORE DELETE ON table_order_settlements
BEGIN SELECT RAISE(ABORT, 'table_order_settlement_immutable'); END;

CREATE TABLE tables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 1,
  public_description TEXT NOT NULL DEFAULT '',
  public_features_json TEXT NOT NULL DEFAULT '[]',
  smoking_policy TEXT NOT NULL DEFAULT 'unspecified'
    CHECK (smoking_policy IN ('unspecified', 'non_smoking', 'smoking_allowed', 'outdoor_only')),
  status TEXT NOT NULL DEFAULT 'available',
  current_customer_id TEXT NOT NULL DEFAULT '',
  current_reservation_id TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
);

CREATE TABLE whatsapp_messages (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL DEFAULT '',
  customer_id TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outgoing',
  mode TEXT NOT NULL DEFAULT 'manual_copy',
  status TEXT NOT NULL DEFAULT 'prepared',
  message TEXT NOT NULL,
  prepared_by_ai INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
);

CREATE TABLE birthday_message_deliveries (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  birthday_year INTEGER NOT NULL CHECK (birthday_year > 0),
  birthday_date TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('manual', 'automatic')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'prepared', 'sent', 'skipped', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempted_at TEXT NOT NULL DEFAULT '',
  next_attempt_at TEXT NOT NULL DEFAULT '',
  prepared_at TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT '',
  failed_at TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (customer_id, birthday_year),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Current runtime seeds.
INSERT INTO sync_runtime (
  id, request_cursor, acknowledged_cursor, last_attempt_at, last_success_at,
  last_error, consecutive_failures, updated_at
) VALUES (
  'primary', 0, 0, '', '', '', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
INSERT INTO sync_outbox (
  job_key, job_type, source_revision, attempt_count, next_attempt_at,
  last_error, created_at, updated_at
) VALUES
  ('menu', 'menu_publish', 1, 0, '', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('android_snapshot', 'android_snapshot', 1, 0, '', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('online_catalog', 'online_catalog_publish', 1, 0, '', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO sync_outbox_revisions (job_key, source_revision, updated_at)
VALUES
  ('menu', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('android_snapshot', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('online_catalog', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- INDEXS

CREATE INDEX idx_android_action_receipts_applied_at
  ON android_action_receipts(applied_at);

CREATE INDEX idx_android_devices_active_role
  ON android_devices(is_active, role);

CREATE INDEX idx_android_devices_last_seen
  ON android_devices(last_seen_at DESC);

CREATE INDEX idx_business_capabilities_enabled
  ON business_capabilities (business_id, is_enabled, capability_id);

CREATE INDEX idx_catalog_categories_business
  ON catalog_categories (business_id, is_active, sort_order, name);

CREATE UNIQUE INDEX idx_catalog_products_barcode_unique
  ON catalog_products (business_id, barcode)
  WHERE barcode != '' AND deleted_at = '';

CREATE INDEX idx_catalog_products_business
  ON catalog_products (business_id, is_active, name);

CREATE INDEX idx_catalog_products_page
  ON catalog_products (business_id, sort_order, name COLLATE NOCASE, id) WHERE deleted_at = '';
CREATE INDEX idx_catalog_products_sale_page
  ON catalog_products (business_id, is_active, sort_order, name COLLATE NOCASE, id) WHERE deleted_at = '';
CREATE INDEX idx_catalog_products_category_page
  ON catalog_products (business_id, category_id, is_active, sort_order, name COLLATE NOCASE, id) WHERE deleted_at = '';
CREATE INDEX idx_catalog_products_quick_page
  ON catalog_products (business_id, quick_access_enabled, quick_access_order, sort_order, name COLLATE NOCASE, id) WHERE deleted_at = '';

CREATE UNIQUE INDEX idx_catalog_products_sku_unique
  ON catalog_products (business_id, sku)
  WHERE sku != '' AND deleted_at = '';

CREATE INDEX idx_commerce_sale_draft_items_draft
  ON commerce_sale_draft_items (draft_id, created_at, id);

CREATE UNIQUE INDEX idx_commerce_sale_draft_items_product_unique
  ON commerce_sale_draft_items (draft_id, product_id);

CREATE INDEX idx_commerce_sale_drafts_business_status
  ON commerce_sale_drafts (business_id, status, created_at DESC);

CREATE INDEX idx_commerce_sale_items_sale
  ON commerce_sale_items (sale_id, created_at);

CREATE INDEX idx_commerce_sales_business
  ON commerce_sales (business_id, status, opened_at DESC);

CREATE UNIQUE INDEX idx_commerce_sales_business_id ON commerce_sales(business_id, id);

CREATE INDEX idx_commerce_order_items_order
  ON commerce_order_items (order_id, created_at, id);

CREATE INDEX idx_commerce_orders_business_status
  ON commerce_orders (business_id, status, placed_at DESC, id DESC);

CREATE INDEX idx_commerce_orders_customer
  ON commerce_orders (business_id, customer_id, placed_at DESC)
  WHERE customer_id IS NOT NULL AND deleted_at = '';

CREATE UNIQUE INDEX idx_commerce_orders_source_reference
  ON commerce_orders (business_id, source, source_reference)
  WHERE source_reference != '' AND deleted_at = '';

CREATE UNIQUE INDEX idx_commerce_order_fulfillment_order
  ON commerce_order_fulfillments (business_id, order_id);

CREATE UNIQUE INDEX idx_commerce_order_fulfillment_sale
  ON commerce_order_fulfillments (business_id, sale_id);

CREATE UNIQUE INDEX idx_commerce_order_fulfillment_operation
  ON commerce_order_fulfillments (business_id, operation_key);

CREATE INDEX idx_commerce_suppliers_business
  ON commerce_suppliers (business_id, is_active, name);

CREATE INDEX idx_customer_credit_account_currency
  ON customer_credit_entries(business_id, customer_id, currency);

CREATE INDEX idx_customer_credit_account_history
  ON customer_credit_entries(business_id, customer_id, occurred_at DESC, created_at DESC, id DESC);

CREATE INDEX idx_customer_credit_last_payment
  ON customer_credit_entries(business_id, customer_id, occurred_at DESC, created_at DESC, id DESC)
  WHERE entry_type = 'payment';

CREATE UNIQUE INDEX idx_customer_credit_sale_unique
  ON customer_credit_entries(business_id, sale_id) WHERE entry_type = 'credit_sale';

CREATE INDEX idx_customer_commercial_profiles_status
  ON customer_commercial_profiles (business_id, dealer_status, company_name);

CREATE UNIQUE INDEX idx_customer_commercial_profiles_tax_number
  ON customer_commercial_profiles (business_id, tax_number)
  WHERE tax_number != '';

CREATE INDEX idx_customer_room_stays_customer
  ON customer_room_stays(customer_id, check_in_date DESC, created_at DESC);

CREATE INDEX idx_customer_room_stays_reservation
  ON customer_room_stays(reservation_id)
  WHERE reservation_id != '';

CREATE INDEX idx_customer_room_stays_room
  ON customer_room_stays(room_id, status, check_in_date, check_out_date);

CREATE UNIQUE INDEX idx_customers_business_id ON customers(business_id, id);

CREATE UNIQUE INDEX idx_customers_identity_number
  ON customers(identity_number)
  WHERE identity_number != '' AND deleted_at = '';

CREATE INDEX idx_customers_phone_active
  ON customers(phone)
  WHERE phone != '' AND deleted_at = '';

CREATE INDEX idx_daily_tasks_report_due_status
  ON daily_tasks(due_date, status)
  WHERE deleted_at = '';

CREATE INDEX idx_events_type ON events(type);

CREATE INDEX idx_finance_entries_direction_category
  ON finance_entries(direction, category, occurred_at DESC)
  WHERE deleted_at = '';

CREATE INDEX idx_finance_entries_occurred_at
  ON finance_entries(occurred_at DESC);

CREATE UNIQUE INDEX idx_finance_entries_source
  ON finance_entries(source_type, source_id)
  WHERE source_id != '';

CREATE INDEX idx_inventory_balances_location
  ON inventory_balances (location_id, quantity);

CREATE UNIQUE INDEX idx_inventory_locations_code_unique
  ON inventory_locations (business_id, code)
  WHERE code != '' AND deleted_at = '';

CREATE UNIQUE INDEX idx_inventory_locations_primary_unique
  ON inventory_locations (business_id)
  WHERE is_primary = 1 AND deleted_at = '';

CREATE INDEX idx_inventory_movements_product
  ON inventory_movements (product_id, created_at DESC);

CREATE INDEX idx_inventory_movements_reference
  ON inventory_movements (reference_type, reference_id);

CREATE INDEX idx_market_barcode_scans_business_pending
  ON market_barcode_scan_events (business_id, status, scanned_at, received_at, id);

CREATE INDEX idx_pension_payments_paid_at
  ON pension_payments(paid_at DESC)
  WHERE deleted_at = '';

CREATE INDEX idx_pension_payments_reservation
  ON pension_payments(reservation_id, paid_at DESC)
  WHERE deleted_at = '';

CREATE INDEX idx_purchase_order_items_order
  ON purchase_order_items (purchase_order_id, created_at);

CREATE INDEX idx_purchase_orders_business
  ON purchase_orders (business_id, status, created_at DESC);

CREATE INDEX idx_requests_report_created_status
  ON requests(created_at, status)
  WHERE deleted_at = '';

CREATE INDEX idx_requests_status ON requests(status);

CREATE INDEX idx_requests_sync_status ON requests(sync_status);

CREATE INDEX idx_reservations_report_created_status
  ON reservations(created_at, status)
  WHERE deleted_at = '';

CREATE INDEX idx_reservations_start_date ON reservations(start_date);

CREATE INDEX idx_room_folio_items_folio
  ON room_folio_items(folio_id, created_at) WHERE deleted_at = '';

CREATE INDEX idx_room_folio_order_transfers_folio
  ON room_folio_table_order_transfers(folio_id, created_at DESC);

CREATE INDEX idx_room_folio_payments_folio
  ON room_folio_payments(folio_id, paid_at DESC) WHERE deleted_at = '';

CREATE UNIQUE INDEX idx_room_folio_payments_reference
  ON room_folio_payments(reference_id) WHERE reference_id != '';

CREATE INDEX idx_room_folios_customer
  ON room_folios(customer_id, opened_at DESC) WHERE deleted_at = '';

CREATE INDEX idx_room_folios_reservation
  ON room_folios(reservation_id) WHERE reservation_id != '' AND deleted_at = '';

CREATE INDEX idx_room_folios_room_status
  ON room_folios(room_id, status, opened_at DESC) WHERE deleted_at = '';

CREATE INDEX idx_rooms_status ON rooms(status);

CREATE INDEX idx_stock_image_import_lines_import
  ON stock_image_import_lines(import_id, created_at ASC, id ASC);

CREATE INDEX idx_stock_image_imports_created
  ON stock_image_imports(created_at DESC);

CREATE INDEX idx_stock_image_imports_hash_status
  ON stock_image_imports(image_hash, status, created_at DESC);

CREATE INDEX idx_table_order_items_product_id
  ON table_order_items(product_id);

CREATE INDEX idx_table_order_items_order_id
  ON table_order_items(order_id);

CREATE INDEX idx_table_order_items_report_order_status
  ON table_order_items(order_id, status);

CREATE UNIQUE INDEX idx_table_orders_one_active_per_table
  ON table_orders(table_id)
  WHERE status IN ('open', 'preparing', 'served', 'payment');

CREATE INDEX idx_table_orders_report_closed
  ON table_orders(status, closed_at);

CREATE INDEX idx_table_orders_status_opened_at
  ON table_orders(status, opened_at);

CREATE INDEX idx_tables_status ON tables(status);

-- VIEWS

CREATE VIEW customer_credit_balances AS
SELECT business_id, customer_id, currency,
  SUM(CASE direction WHEN 'debit' THEN amount_minor ELSE -amount_minor END) AS amount_minor
FROM customer_credit_entries GROUP BY business_id, customer_id, currency;

CREATE VIEW enabled_business_capabilities AS
SELECT business_id, capability_id, source, updated_at
FROM business_capabilities
WHERE is_enabled = 1;

CREATE VIEW pension_payment_totals AS
SELECT
  reservations.id AS reservation_id,
  reservations.agreed_total_minor AS agreed_total_minor,
  reservations.currency AS currency,
  COALESCE(SUM(CASE WHEN pension_payments.deleted_at = '' THEN pension_payments.amount_minor ELSE 0 END), 0) AS paid_total_minor,
  CASE
    WHEN reservations.agreed_total_minor - COALESCE(SUM(CASE WHEN pension_payments.deleted_at = '' THEN pension_payments.amount_minor ELSE 0 END), 0) > 0
      THEN reservations.agreed_total_minor - COALESCE(SUM(CASE WHEN pension_payments.deleted_at = '' THEN pension_payments.amount_minor ELSE 0 END), 0)
    ELSE 0
  END AS remaining_minor
FROM reservations
LEFT JOIN pension_payments ON pension_payments.reservation_id = reservations.id
WHERE reservations.deleted_at = ''
GROUP BY reservations.id;

CREATE VIEW room_folio_totals AS
SELECT
  base.folio_id,
  base.lodging_total_minor,
  base.extras_total_minor,
  MAX(base.raw_charge_total_minor, 0) AS charge_total_minor,
  base.paid_total_minor,
  MAX(MAX(base.raw_charge_total_minor, 0) - base.paid_total_minor, 0) AS remaining_minor,
  MAX(base.paid_total_minor - MAX(base.raw_charge_total_minor, 0), 0) AS credit_minor
FROM (
  SELECT
    folios.id AS folio_id,
    folios.lodging_total_minor,
    COALESCE(items.extras_total_minor, 0) AS extras_total_minor,
    folios.lodging_total_minor + COALESCE(items.extras_total_minor, 0) AS raw_charge_total_minor,
    COALESCE(payments.paid_total_minor, 0) AS paid_total_minor
  FROM room_folios AS folios
  LEFT JOIN (
    SELECT folio_id, SUM(line_total_minor) AS extras_total_minor
    FROM room_folio_items
    WHERE deleted_at = ''
    GROUP BY folio_id
  ) AS items ON items.folio_id = folios.id
  LEFT JOIN (
    SELECT folio_id, SUM(amount_minor) AS paid_total_minor
    FROM room_folio_payments
    WHERE deleted_at = ''
    GROUP BY folio_id
  ) AS payments ON payments.folio_id = folios.id
  WHERE folios.deleted_at = ''
) AS base;

-- TRIGGERS

CREATE TRIGGER android_devices_require_approval_after_insert
AFTER INSERT ON android_devices
WHEN NEW.is_active = 1
BEGIN
  UPDATE android_devices
  SET is_active = 0
  WHERE id = NEW.id;
END;
CREATE TRIGGER trg_catalog_products_barcode_insert_guard
BEFORE INSERT ON catalog_products
WHEN NEW.barcode != ''
  AND NEW.deleted_at = ''
  AND EXISTS (
    SELECT 1
    FROM catalog_products
    WHERE business_id = NEW.business_id
      AND barcode = NEW.barcode
      AND deleted_at = ''
      AND id != NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'Bu barkod başka bir üründe kullanılıyor.');
END;

CREATE TRIGGER trg_catalog_products_barcode_update_guard
BEFORE UPDATE OF business_id, barcode, deleted_at ON catalog_products
WHEN NEW.barcode != ''
  AND NEW.deleted_at = ''
  AND EXISTS (
    SELECT 1
    FROM catalog_products
    WHERE business_id = NEW.business_id
      AND barcode = NEW.barcode
      AND deleted_at = ''
      AND id != NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'Bu barkod başka bir üründe kullanılıyor.');
END;

CREATE TRIGGER trg_catalog_products_sku_insert_guard
BEFORE INSERT ON catalog_products
WHEN NEW.sku != ''
  AND NEW.deleted_at = ''
  AND EXISTS (
    SELECT 1
    FROM catalog_products
    WHERE business_id = NEW.business_id
      AND sku = NEW.sku
      AND deleted_at = ''
      AND id != NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'Bu stok kodu başka bir üründe kullanılıyor.');
END;

CREATE TRIGGER trg_catalog_products_sku_update_guard
BEFORE UPDATE OF business_id, sku, deleted_at ON catalog_products
WHEN NEW.sku != ''
  AND NEW.deleted_at = ''
  AND EXISTS (
    SELECT 1
    FROM catalog_products
    WHERE business_id = NEW.business_id
      AND sku = NEW.sku
      AND deleted_at = ''
      AND id != NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'Bu stok kodu başka bir üründe kullanılıyor.');
END;

CREATE TRIGGER trg_customer_business_insert
AFTER INSERT ON customers WHEN NEW.business_id IS NULL
BEGIN
  UPDATE customers SET business_id = (
    SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1
  ) WHERE id = NEW.id;
END;

CREATE TRIGGER trg_customer_commercial_profile_insert_guard
BEFORE INSERT ON customer_commercial_profiles
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM customers
    WHERE id = NEW.customer_id
      AND business_id = NEW.business_id
      AND deleted_at = ''
  ) THEN RAISE(ABORT, 'Ticari profil aktif müşteri ve işletmeyle eşleşmiyor.') END;
END;

CREATE TRIGGER trg_customer_commercial_profile_update_guard
BEFORE UPDATE OF customer_id, business_id ON customer_commercial_profiles
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM customers
    WHERE id = NEW.customer_id
      AND business_id = NEW.business_id
      AND deleted_at = ''
  ) THEN RAISE(ABORT, 'Ticari profil aktif müşteri ve işletmeyle eşleşmiyor.') END;
END;

CREATE TRIGGER trg_customer_credit_customer_deletion
BEFORE UPDATE OF deleted_at ON customers
WHEN NEW.deleted_at != '' AND EXISTS (
  SELECT 1 FROM customer_credit_balances WHERE customer_id = OLD.id AND amount_minor > 0
)
BEGIN SELECT RAISE(ABORT, 'Bu müşterinin açık veresiye borcu var.'); END;

CREATE TRIGGER trg_customer_credit_customer_ownership
BEFORE UPDATE OF business_id ON customers
WHEN NEW.business_id IS NOT OLD.business_id AND EXISTS (
  SELECT 1 FROM customer_credit_entries WHERE customer_id = OLD.id
)
BEGIN SELECT RAISE(ABORT, 'Veresiye geçmişi olan müşterinin işletmesi değiştirilemez.'); END;

CREATE TRIGGER trg_customer_credit_no_delete BEFORE DELETE ON customer_credit_entries
BEGIN SELECT RAISE(ABORT, 'Veresiye hareketi silinemez; düzeltme hareketi ekleyin.'); END;

CREATE TRIGGER trg_customer_credit_no_update BEFORE UPDATE ON customer_credit_entries
BEGIN SELECT RAISE(ABORT, 'Veresiye hareketi değiştirilemez; düzeltme hareketi ekleyin.'); END;

CREATE TRIGGER trg_customer_credit_sale_no_update BEFORE UPDATE ON commerce_sales
WHEN EXISTS (SELECT 1 FROM customer_credit_entries WHERE sale_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'Veresiye satışının muhasebe izi değiştirilemez.'); END;

CREATE TRIGGER trg_customer_credit_validate_insert
BEFORE INSERT ON customer_credit_entries
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customers c JOIN business b ON b.id = c.business_id
    WHERE c.id = NEW.customer_id AND c.business_id = NEW.business_id
      AND c.deleted_at = '' AND b.deleted_at = ''
  ) THEN RAISE(ABORT, 'Veresiye için kayıtlı aktif müşteri gerekli.') END;
  SELECT CASE WHEN NEW.direction = 'credit' AND NEW.amount_minor > COALESCE((
    SELECT amount_minor FROM customer_credit_balances
    WHERE business_id = NEW.business_id AND customer_id = NEW.customer_id AND currency = NEW.currency
  ), 0) THEN RAISE(ABORT, 'Tutar mevcut veresiye borcunu aşamaz.') END;
  SELECT CASE WHEN NEW.direction = 'debit' AND NEW.amount_minor + COALESCE((
    SELECT amount_minor FROM customer_credit_balances
    WHERE business_id = NEW.business_id AND customer_id = NEW.customer_id AND currency = NEW.currency
  ), 0) > 9007199254740991 THEN RAISE(ABORT, 'Veresiye bakiyesi güvenli sınırı aşıyor.') END;
  SELECT CASE WHEN NEW.entry_type = 'credit_sale' AND NOT EXISTS (
    SELECT 1 FROM commerce_sales s WHERE s.id = NEW.sale_id AND s.business_id = NEW.business_id
      AND s.status = 'credit' AND s.payment_method = '' AND s.deleted_at = ''
      AND s.currency = NEW.currency AND CAST(ROUND(s.total * 100) AS INTEGER) = NEW.amount_minor
  ) THEN RAISE(ABORT, 'Veresiye satış hareketi satışla eşleşmiyor.') END;
END;

CREATE TRIGGER trg_market_cart_drafts_android_snapshot_insert
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

CREATE TRIGGER trg_market_cart_drafts_android_snapshot_update
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

CREATE TRIGGER trg_pension_payment_remaining_guard
BEFORE INSERT ON pension_payments
WHEN NEW.deleted_at = ''
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM room_folios f
      JOIN customer_room_stays s ON s.id = f.stay_id
      WHERE f.deleted_at = ''
        AND (f.reservation_id = NEW.reservation_id OR s.reservation_id = NEW.reservation_id)
    ) THEN RAISE(ABORT, 'reservation_payment_authority_transferred')
    WHEN COALESCE((
      SELECT agreed_total_minor
      FROM reservations
      WHERE id = NEW.reservation_id AND deleted_at = ''
    ), 0) <= 0
      THEN RAISE(ABORT, 'reservation_total_required')
    WHEN NEW.amount_minor > COALESCE((
      SELECT remaining_minor
      FROM pension_payment_totals
      WHERE reservation_id = NEW.reservation_id
    ), 0)
      THEN RAISE(ABORT, 'payment_exceeds_remaining')
  END;
END;

CREATE TRIGGER trg_pension_payment_status_insert
AFTER INSERT ON pension_payments
BEGIN
  UPDATE reservations
  SET payment_status = CASE
    WHEN agreed_total_minor <= 0 THEN 'not_required'
    WHEN COALESCE((
      SELECT SUM(amount_minor)
      FROM pension_payments
      WHERE reservation_id = NEW.reservation_id AND deleted_at = ''
    ), 0) <= 0 THEN 'unpaid'
    WHEN COALESCE((
      SELECT SUM(amount_minor)
      FROM pension_payments
      WHERE reservation_id = NEW.reservation_id AND deleted_at = ''
    ), 0) < agreed_total_minor THEN 'partial'
    ELSE 'paid'
  END
  WHERE id = NEW.reservation_id;
END;

CREATE TRIGGER trg_pension_payment_status_update
AFTER UPDATE ON pension_payments
BEGIN
  UPDATE reservations
  SET payment_status = CASE
    WHEN agreed_total_minor <= 0 THEN 'not_required'
    WHEN COALESCE((
      SELECT SUM(amount_minor)
      FROM pension_payments
      WHERE reservation_id = NEW.reservation_id AND deleted_at = ''
    ), 0) <= 0 THEN 'unpaid'
    WHEN COALESCE((
      SELECT SUM(amount_minor)
      FROM pension_payments
      WHERE reservation_id = NEW.reservation_id AND deleted_at = ''
    ), 0) < agreed_total_minor THEN 'partial'
    ELSE 'paid'
  END
  WHERE id = NEW.reservation_id;
END;

CREATE TRIGGER trg_reservation_insert_payment_status
AFTER INSERT ON reservations
WHEN NEW.agreed_total_minor > 0
BEGIN
  UPDATE reservations
  SET payment_status = 'unpaid'
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_reservation_total_paid_guard
BEFORE UPDATE OF agreed_total_minor ON reservations
BEGIN
  SELECT CASE
    WHEN NEW.agreed_total_minor < COALESCE((
      SELECT SUM(amount_minor)
      FROM pension_payments
      WHERE reservation_id = NEW.id AND deleted_at = ''
    ), 0)
      THEN RAISE(ABORT, 'reservation_total_below_paid')
  END;
END;

CREATE TRIGGER trg_reservation_total_payment_status
AFTER UPDATE OF agreed_total_minor ON reservations
BEGIN
  UPDATE reservations
  SET payment_status = CASE
    WHEN NEW.agreed_total_minor <= 0 THEN 'not_required'
    WHEN COALESCE((
      SELECT SUM(amount_minor)
      FROM pension_payments
      WHERE reservation_id = NEW.id AND deleted_at = ''
    ), 0) <= 0 THEN 'unpaid'
    WHEN COALESCE((
      SELECT SUM(amount_minor)
      FROM pension_payments
      WHERE reservation_id = NEW.id AND deleted_at = ''
    ), 0) < NEW.agreed_total_minor THEN 'partial'
    ELSE 'paid'
  END
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_room_folio_payment_remaining_guard
BEFORE INSERT ON room_folio_payments
WHEN NEW.deleted_at = '' AND NEW.origin = 'direct'
BEGIN
  SELECT CASE
    WHEN COALESCE((SELECT charge_total_minor FROM room_folio_totals WHERE folio_id = NEW.folio_id), 0) <= 0
      THEN RAISE(ABORT, 'room_folio_total_required')
    WHEN NEW.amount_minor > COALESCE((SELECT remaining_minor FROM room_folio_totals WHERE folio_id = NEW.folio_id), 0)
      THEN RAISE(ABORT, 'room_folio_payment_exceeds_remaining')
  END;
END;

CREATE TRIGGER trg_room_folio_transfer_item_delete_guard
BEFORE UPDATE OF deleted_at ON room_folio_items
WHEN OLD.deleted_at = ''
  AND NEW.deleted_at != ''
  AND EXISTS (
    SELECT 1
    FROM room_folio_table_order_transfers
    WHERE folio_item_id = OLD.id
  )
BEGIN
  SELECT RAISE(ABORT, 'room_folio_table_order_transfer_locked');
END;

CREATE TRIGGER trg_sync_android_devices_insert
AFTER INSERT ON android_devices
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

CREATE TRIGGER trg_sync_android_devices_permissions_update
AFTER UPDATE OF role, is_active, permissions_json, permission_groups_json, revoked_at ON android_devices
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

CREATE TRIGGER trg_sync_customer_room_stays_insert
AFTER INSERT ON customer_room_stays
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

CREATE TRIGGER trg_sync_customer_room_stays_update
AFTER UPDATE ON customer_room_stays
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

CREATE TRIGGER trg_sync_customers_insert AFTER INSERT ON customers BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_customers_update AFTER UPDATE ON customers BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_daily_tasks_insert AFTER INSERT ON daily_tasks BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_daily_tasks_update AFTER UPDATE ON daily_tasks BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_menu_categories_insert
AFTER INSERT ON menu_categories WHEN NEW.sync_status != 'synced'
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('menu', 'menu_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_menu_categories_update
AFTER UPDATE ON menu_categories WHEN NEW.sync_status != 'synced'
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('menu', 'menu_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_menu_product_entries_insert
AFTER INSERT ON menu_product_entries WHEN NEW.sync_status != 'synced'
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('menu', 'menu_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_menu_product_entries_update
AFTER UPDATE ON menu_product_entries WHEN NEW.sync_status != 'synced'
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('menu', 'menu_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

-- Sensitive config intent is invalidated atomically with canonical settings.
CREATE TRIGGER trg_menu_catalog_product_update AFTER UPDATE ON catalog_products
WHEN EXISTS (SELECT 1 FROM menu_product_entries WHERE product_id = NEW.id AND deleted_at = '')
BEGIN
  INSERT INTO sync_outbox(job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('menu', 'menu_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
  INSERT INTO sync_outbox(job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_menu_inventory_balance_insert AFTER INSERT ON inventory_balances
WHEN EXISTS (SELECT 1 FROM menu_product_entries WHERE product_id = NEW.product_id AND deleted_at = '')
BEGIN
  INSERT INTO sync_outbox(job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('menu', 'menu_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
  INSERT INTO sync_outbox(job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_menu_inventory_balance_update AFTER UPDATE ON inventory_balances
WHEN EXISTS (SELECT 1 FROM menu_product_entries WHERE product_id = NEW.product_id AND deleted_at = '')
BEGIN
  INSERT INTO sync_outbox(job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('menu', 'menu_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
  INSERT INTO sync_outbox(job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
-- Ack-only timestamps are deliberately absent from these trigger column lists.
CREATE TRIGGER trg_sync_ai_profile_insert AFTER INSERT ON ai_service_profiles
BEGIN
  INSERT INTO sync_outbox(job_key, job_type, created_at, updated_at)
  VALUES ('ai_settings', 'ai_settings_publish', NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
  INSERT INTO sync_outbox(job_key, job_type, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_sync_ai_profile_update AFTER UPDATE OF base_url, model, vision_model, stt_model, timeout_seconds, api_key_encrypted ON ai_service_profiles
WHEN NEW.base_url != OLD.base_url OR NEW.model != OLD.model OR NEW.vision_model != OLD.vision_model OR NEW.stt_model != OLD.stt_model OR NEW.timeout_seconds != OLD.timeout_seconds OR NEW.api_key_encrypted != OLD.api_key_encrypted
BEGIN
  INSERT INTO sync_outbox(job_key, job_type, created_at, updated_at)
  VALUES ('ai_settings', 'ai_settings_publish', NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
  INSERT INTO sync_outbox(job_key, job_type, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_sync_ai_settings_update AFTER UPDATE OF ai_provider, ai_service ON settings
WHEN NEW.ai_provider != OLD.ai_provider OR NEW.ai_service != OLD.ai_service
BEGIN
  INSERT INTO sync_outbox(job_key, job_type, created_at, updated_at)
  VALUES ('ai_settings', 'ai_settings_publish', NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
  INSERT INTO sync_outbox(job_key, job_type, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_sync_google_settings_update AFTER UPDATE OF google_reviews_enabled, google_place_id, google_places_api_key_encrypted ON settings
WHEN NEW.google_reviews_enabled != OLD.google_reviews_enabled OR NEW.google_place_id != OLD.google_place_id OR NEW.google_places_api_key_encrypted != OLD.google_places_api_key_encrypted
BEGIN
  INSERT INTO sync_outbox(job_key, job_type, created_at, updated_at)
  VALUES ('google_reviews_settings', 'google_reviews_settings_publish', NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_ai_capability_insert AFTER INSERT ON business_capabilities
WHEN NEW.capability_id = 'service.ai' AND EXISTS (SELECT 1 FROM sync_publication_payloads WHERE job_key = 'ai_settings')
BEGIN
  INSERT INTO sync_outbox(job_key, job_type, created_at, updated_at)
  VALUES ('ai_settings', 'ai_settings_publish', NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_sync_ai_capability_update AFTER UPDATE OF is_enabled ON business_capabilities
WHEN NEW.capability_id = 'service.ai' AND NEW.is_enabled != OLD.is_enabled
  AND EXISTS (SELECT 1 FROM sync_publication_payloads WHERE job_key = 'ai_settings')
BEGIN
  INSERT INTO sync_outbox(job_key, job_type, created_at, updated_at)
  VALUES ('ai_settings', 'ai_settings_publish', NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_sync_ai_capability_delete AFTER DELETE ON business_capabilities
WHEN OLD.capability_id = 'service.ai' AND EXISTS (SELECT 1 FROM sync_publication_payloads WHERE job_key = 'ai_settings')
BEGIN
  INSERT INTO sync_outbox(job_key, job_type, created_at, updated_at)
  VALUES ('ai_settings', 'ai_settings_publish', OLD.updated_at, OLD.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_outbox_revision_insert
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

CREATE TRIGGER trg_sync_outbox_revision_update
AFTER UPDATE OF source_revision ON sync_outbox
WHEN NEW.source_revision > OLD.source_revision
BEGIN
  INSERT INTO sync_outbox_revisions (job_key, source_revision, updated_at)
  VALUES (NEW.job_key, NEW.source_revision, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET
    source_revision = MAX(sync_outbox_revisions.source_revision, excluded.source_revision),
    updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_requests_insert
AFTER INSERT ON requests
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_requests_update
AFTER UPDATE ON requests
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_reservations_insert AFTER INSERT ON reservations BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_reservations_update AFTER UPDATE ON reservations BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_room_folios_insert
AFTER INSERT ON room_folios
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

CREATE TRIGGER trg_sync_room_folios_update
AFTER UPDATE ON room_folios
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

CREATE TRIGGER trg_sync_rooms_insert AFTER INSERT ON rooms BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_rooms_update AFTER UPDATE ON rooms BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_table_order_items_insert AFTER INSERT ON table_order_items BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_table_order_items_update AFTER UPDATE ON table_order_items BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_table_orders_insert AFTER INSERT ON table_orders BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_table_orders_update AFTER UPDATE ON table_orders BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_tables_insert AFTER INSERT ON tables BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_tables_update AFTER UPDATE ON tables BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_whatsapp_messages_insert AFTER INSERT ON whatsapp_messages BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_sync_whatsapp_messages_update AFTER UPDATE ON whatsapp_messages BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

-- Hospitality guest schema.
CREATE UNIQUE INDEX idx_stay_one_occupied_room ON customer_room_stays(room_id)
  WHERE status = 'checked_in' AND deleted_at = '';
CREATE TABLE hospitality_entry_receipts (
  request_id TEXT PRIMARY KEY,
  input_json TEXT NOT NULL,
  stay_id TEXT NOT NULL REFERENCES customer_room_stays(id)
);
CREATE TABLE stay_guests (
  id TEXT PRIMARY KEY,
  stay_id TEXT NOT NULL REFERENCES customer_room_stays(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL CHECK (status IN ('planned', 'checked_in', 'checked_out', 'cancelled')),
  checked_in_at TEXT NOT NULL DEFAULT '',
  checked_out_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_stay_guests_active_customer ON stay_guests(customer_id)
  WHERE status IN ('planned', 'checked_in');
CREATE INDEX idx_stay_guests_stay ON stay_guests(stay_id, status);

-- Local reporting outbox. A queued record is NOT proof of delivery to EGM/Jandarma.
-- Identity snapshots are protected domain data, never diagnostic/event-log payloads.
CREATE TABLE hospitality_notifications (
  id TEXT PRIMARY KEY,
  guest_id TEXT NOT NULL REFERENCES stay_guests(id),
  stay_id TEXT NOT NULL REFERENCES customer_room_stays(id),
  room_id TEXT NOT NULL REFERENCES rooms(id),
  kind TEXT NOT NULL CHECK (kind IN ('arrival', 'departure', 'room_change')),
  occurred_at TEXT NOT NULL,
  identity_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'submission_unknown')),
  provider TEXT NOT NULL DEFAULT '',
  provider_reference TEXT NOT NULL DEFAULT '',
  confirmed_rejection INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_rejection IN (0, 1)),
  sent_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_hospitality_notifications_pending ON hospitality_notifications(stay_id, status);

-- Domain delivery intent, separate from publication jobs. Receipt + request commit together.
-- A crash leaves the request pending; notification submission_unknown is the permanent I/O fence.
CREATE TABLE kbs_delivery_requests (
  action_id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES hospitality_notifications(id),
  device_id TEXT NOT NULL REFERENCES android_devices(device_id),
  provider TEXT NOT NULL CHECK (provider IN ('egm', 'jandarma')),
  requested_at TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT '',
  result_state TEXT NOT NULL DEFAULT '' CHECK (result_state IN ('', 'sent', 'failed', 'waiting', 'submission_unknown', 'denied'))
);
CREATE UNIQUE INDEX idx_kbs_delivery_requests_pending
  ON kbs_delivery_requests(notification_id) WHERE completed_at = '';

CREATE TABLE stay_room_history (
  id TEXT PRIMARY KEY,
  stay_id TEXT NOT NULL REFERENCES customer_room_stays(id),
  room_id TEXT NOT NULL REFERENCES rooms(id),
  entered_at TEXT NOT NULL,
  left_at TEXT NOT NULL DEFAULT ''
);

CREATE TRIGGER trg_stay_guest_initial AFTER INSERT ON customer_room_stays
BEGIN
  INSERT INTO stay_guests (id, stay_id, customer_id, status, checked_in_at, checked_out_at, created_at, updated_at)
  VALUES ('guest_' || NEW.id, NEW.id, NEW.customer_id, NEW.status, NEW.checked_in_at, NEW.checked_out_at, NEW.created_at, NEW.updated_at);
  INSERT INTO stay_room_history (id, stay_id, room_id, entered_at)
  SELECT 'room_' || NEW.id, NEW.id, NEW.room_id, NEW.checked_in_at WHERE NEW.status = 'checked_in';
END;

CREATE TRIGGER trg_stay_guest_lifecycle_guard BEFORE UPDATE OF status ON customer_room_stays
WHEN OLD.status != NEW.status
BEGIN
  SELECT CASE WHEN OLD.status = 'checked_in' AND NEW.status = 'cancelled'
    THEN RAISE(ABORT, 'Konaklayan misafirler için çıkış işlemini kullanın.') END;
  SELECT CASE WHEN NEW.status = 'checked_in' AND NEW.guest_count !=
    (SELECT COUNT(*) FROM stay_guests WHERE stay_id = NEW.id AND status = 'planned')
    THEN RAISE(ABORT, 'Her misafir için müşteri kaydı eklenmeli.') END;
  SELECT CASE WHEN NEW.status = 'checked_in' AND EXISTS
    (SELECT 1 FROM rooms WHERE id = NEW.room_id AND (is_active != 1 OR deleted_at != '' OR status IN ('cleaning', 'maintenance', 'out_of_service')))
    THEN RAISE(ABORT, 'Giriş için oda hazır olmalı.') END;
  SELECT CASE WHEN NEW.status = 'checked_in' AND EXISTS
    (SELECT 1 FROM rooms WHERE id = NEW.room_id AND capacity > 0 AND capacity < NEW.guest_count)
    THEN RAISE(ABORT, 'Misafir sayısı oda kapasitesini aşıyor.') END;
  SELECT CASE WHEN NEW.status = 'checked_in' AND EXISTS
    (SELECT 1 FROM customer_room_stays WHERE room_id = NEW.room_id AND id != NEW.id AND status = 'checked_in' AND deleted_at = '')
    THEN RAISE(ABORT, 'Odada zaten giriş yapmış bir konaklama var.') END;
END;

CREATE TRIGGER trg_stay_guest_lifecycle AFTER UPDATE OF status ON customer_room_stays
WHEN OLD.status != NEW.status
BEGIN
  UPDATE stay_guests SET status = NEW.status,
    checked_in_at = CASE WHEN NEW.status = 'checked_in' THEN NEW.checked_in_at ELSE checked_in_at END,
    checked_out_at = CASE WHEN NEW.status = 'checked_out' THEN NEW.checked_out_at ELSE checked_out_at END,
    updated_at = NEW.updated_at
  WHERE stay_id = NEW.id AND (status IN ('planned', 'checked_in') OR (NEW.status = 'planned' AND status = 'cancelled'));
  INSERT INTO stay_room_history (id, stay_id, room_id, entered_at)
  SELECT lower(hex(randomblob(16))), NEW.id, NEW.room_id, NEW.checked_in_at WHERE NEW.status = 'checked_in';
  UPDATE stay_room_history SET left_at = NEW.checked_out_at
    WHERE stay_id = NEW.id AND left_at = '' AND NEW.status = 'checked_out';
END;

CREATE TRIGGER trg_stay_guest_arrival AFTER INSERT ON stay_guests
WHEN NEW.status = 'checked_in'
  AND EXISTS (SELECT 1 FROM kbs_service_settings WHERE id = 'primary' AND enabled = 1)
BEGIN
  INSERT INTO hospitality_notifications (id, guest_id, stay_id, room_id, kind, occurred_at, identity_snapshot, created_at)
  SELECT lower(hex(randomblob(16))), NEW.id, NEW.stay_id, s.room_id, 'arrival', NEW.checked_in_at,
    json_object('customerId', c.id, 'fullName', c.full_name, 'identityType', c.identity_type,
      'identityNumber', c.identity_number, 'nationality', c.nationality, 'birthDate', c.birth_date,
      'documentSerialNumber', c.document_serial_number, 'documentExpiryDate', c.document_expiry_date,
      'gender', c.gender, 'birthPlace', c.birth_place, 'motherName', c.mother_name,
      'fatherName', c.father_name, 'issuingAuthority', c.issuing_authority, 'address', c.address,
      'phone', c.phone, 'roomNumber', r.number), NEW.updated_at
  FROM customers c JOIN customer_room_stays s ON s.id = NEW.stay_id JOIN rooms r ON r.id = s.room_id WHERE c.id = NEW.customer_id;
END;

CREATE TRIGGER trg_stay_guest_notification AFTER UPDATE OF status ON stay_guests
WHEN OLD.status != NEW.status
  AND NEW.status IN ('checked_in', 'checked_out')
  AND EXISTS (SELECT 1 FROM kbs_service_settings WHERE id = 'primary' AND enabled = 1)
BEGIN
  INSERT INTO hospitality_notifications (id, guest_id, stay_id, room_id, kind, occurred_at, identity_snapshot, created_at)
  SELECT lower(hex(randomblob(16))), NEW.id, NEW.stay_id, s.room_id,
    CASE NEW.status WHEN 'checked_in' THEN 'arrival' ELSE 'departure' END,
    CASE NEW.status WHEN 'checked_in' THEN NEW.checked_in_at ELSE NEW.checked_out_at END,
    json_object('customerId', c.id, 'fullName', c.full_name, 'identityType', c.identity_type,
      'identityNumber', c.identity_number, 'nationality', c.nationality, 'birthDate', c.birth_date,
      'documentSerialNumber', c.document_serial_number, 'documentExpiryDate', c.document_expiry_date,
      'gender', c.gender, 'birthPlace', c.birth_place, 'motherName', c.mother_name,
      'fatherName', c.father_name, 'issuingAuthority', c.issuing_authority, 'address', c.address,
      'phone', c.phone, 'roomNumber', r.number), NEW.updated_at
  FROM customers c JOIN customer_room_stays s ON s.id = NEW.stay_id JOIN rooms r ON r.id = s.room_id WHERE c.id = NEW.customer_id;
END;
CREATE TRIGGER trg_customer_pending_hospitality_identity
AFTER UPDATE OF full_name, phone, identity_type, identity_number, nationality, birth_date, gender,
  document_serial_number, document_expiry_date, birth_place, mother_name, father_name, issuing_authority, address ON customers
BEGIN
  UPDATE hospitality_notifications
  SET identity_snapshot = json_patch(identity_snapshot,
    json_object('fullName', NEW.full_name, 'phone', NEW.phone, 'identityType', NEW.identity_type,
      'identityNumber', NEW.identity_number, 'nationality', NEW.nationality, 'birthDate', NEW.birth_date,
      'gender', NEW.gender, 'documentSerialNumber', NEW.document_serial_number,
      'documentExpiryDate', NEW.document_expiry_date, 'birthPlace', NEW.birth_place,
      'motherName', NEW.mother_name, 'fatherName', NEW.father_name,
      'issuingAuthority', NEW.issuing_authority, 'address', NEW.address))
   WHERE status IN ('pending', 'failed') AND guest_id IN (SELECT id FROM stay_guests WHERE customer_id = NEW.id);
END;

CREATE TRIGGER trg_online_catalog_commerce_product_publications_insert
AFTER INSERT ON commerce_product_publications
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('online_catalog', 'online_catalog_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_online_catalog_commerce_product_publications_update
AFTER UPDATE ON commerce_product_publications
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('online_catalog', 'online_catalog_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_online_catalog_commerce_product_publications_delete
AFTER DELETE ON commerce_product_publications
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('online_catalog', 'online_catalog_publish', 1, OLD.updated_at, OLD.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_online_catalog_catalog_products_update
AFTER UPDATE ON catalog_products WHEN EXISTS (SELECT 1 FROM commerce_product_publications WHERE product_id = OLD.id AND is_published = 1)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('online_catalog', 'online_catalog_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_online_catalog_catalog_products_delete
AFTER DELETE ON catalog_products WHEN EXISTS (SELECT 1 FROM commerce_product_publications WHERE product_id = OLD.id AND is_published = 1)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('online_catalog', 'online_catalog_publish', 1, OLD.updated_at, OLD.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_online_catalog_business_capabilities_insert
AFTER INSERT ON business_capabilities WHEN NEW.capability_id = 'channel.online_sales'
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('online_catalog', 'online_catalog_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_online_catalog_business_capabilities_update
AFTER UPDATE ON business_capabilities WHEN NEW.capability_id = 'channel.online_sales'
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('online_catalog', 'online_catalog_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_online_catalog_business_capabilities_delete
AFTER DELETE ON business_capabilities WHEN OLD.capability_id = 'channel.online_sales'
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('online_catalog', 'online_catalog_publish', 1, OLD.updated_at, OLD.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

-- D-033: focused canonical access state; raw invitation/session tokens never persist.
CREATE TABLE web_customer_accounts (
  account_id TEXT PRIMARY KEY, email TEXT NOT NULL, full_name TEXT NOT NULL,
  customer_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('linked', 'conflict'))
);
CREATE TABLE web_customer_account_sync (id INTEGER PRIMARY KEY CHECK(id=1), cursor INTEGER NOT NULL DEFAULT 0);
INSERT INTO web_customer_account_sync VALUES (1, 0);
CREATE TABLE customer_web_access (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  customer_ref TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL DEFAULT '',
  access_revision INTEGER NOT NULL DEFAULT 1 CHECK (access_revision > 0),
  session_revision INTEGER NOT NULL DEFAULT 1 CHECK (session_revision > 0),
  revoked_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_customer_web_account ON customer_web_access(account_id) WHERE account_id <> '';
CREATE TRIGGER trg_customer_account_identity_immutable BEFORE UPDATE OF account_id ON customer_web_access
WHEN OLD.account_id <> '' AND NEW.account_id <> OLD.account_id
BEGIN SELECT RAISE(ABORT, 'customer_account_binding_immutable'); END;
CREATE TRIGGER trg_customer_web_access_insert AFTER INSERT ON customers
WHEN NEW.business_id IS NOT NULL OR EXISTS (SELECT 1 FROM business WHERE deleted_at = '')
BEGIN
 INSERT INTO customer_web_access (id, customer_id, business_id, customer_ref, created_at, updated_at)
 VALUES (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
 NEW.id, COALESCE(NEW.business_id, (SELECT id FROM business WHERE deleted_at = '' LIMIT 1)),
 lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))), NEW.created_at, NEW.updated_at);
END;
CREATE TRIGGER trg_customer_web_access_assigned AFTER UPDATE OF business_id ON customers
WHEN NEW.business_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customer_web_access WHERE customer_id = NEW.id)
BEGIN
 INSERT INTO customer_web_access (id, customer_id, business_id, customer_ref, created_at, updated_at)
 VALUES (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
 NEW.id, COALESCE(NEW.business_id, (SELECT id FROM business WHERE deleted_at = '' LIMIT 1)),
 lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))), NEW.created_at, NEW.updated_at);
END;
CREATE TRIGGER trg_dealer_publication_customer_web_access_insert AFTER INSERT ON customer_web_access
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_dealer_publication_customer_web_access_update AFTER UPDATE ON customer_web_access
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_dealer_publication_customer_web_access_delete AFTER DELETE ON customer_web_access
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_dealer_publication_customers_update AFTER UPDATE ON customers
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE customer_id = NEW.id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_dealer_publication_customers_delete AFTER DELETE ON customers
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE customer_id = OLD.id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_dealer_publication_customer_commercial_profiles_update AFTER UPDATE ON customer_commercial_profiles
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE customer_id = NEW.customer_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_dealer_publication_customer_commercial_profiles_delete AFTER DELETE ON customer_commercial_profiles
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE customer_id = OLD.customer_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_account_profile_insert AFTER INSERT ON customer_commercial_profiles

BEGIN
UPDATE customer_web_access SET access_revision = access_revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')  WHERE customer_id = NEW.customer_id;
END;
CREATE TRIGGER trg_account_profile_update AFTER UPDATE ON customer_commercial_profiles

BEGIN
UPDATE customer_web_access SET access_revision = access_revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')  WHERE customer_id = NEW.customer_id;
END;
CREATE TRIGGER trg_account_profile_delete AFTER DELETE ON customer_commercial_profiles

BEGIN
UPDATE customer_web_access SET access_revision = access_revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')  WHERE customer_id = OLD.customer_id;
END;
CREATE TRIGGER trg_account_customer_delete AFTER UPDATE OF deleted_at ON customers
WHEN NEW.deleted_at <> OLD.deleted_at
BEGIN
UPDATE customer_web_access SET access_revision = access_revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')  WHERE customer_id = NEW.id;
END;
CREATE TRIGGER trg_account_portal AFTER UPDATE OF dealer_portal_enabled ON settings

BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_account_capability_insert AFTER INSERT ON business_capabilities
WHEN NEW.capability_id IN ('commerce.wholesale', 'channel.online_sales')
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_account_capability_update AFTER UPDATE ON business_capabilities
WHEN NEW.capability_id IN ('commerce.wholesale', 'channel.online_sales')
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_account_capability_delete AFTER DELETE ON business_capabilities
WHEN OLD.capability_id IN ('commerce.wholesale', 'channel.online_sales')
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

-- D-034: the private dealer publication includes canonical resolved catalogs.
CREATE TRIGGER trg_dealer_catalog_catalog_products_insert AFTER INSERT ON catalog_products
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE business_id = NEW.business_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

-- D-034: the private dealer publication includes canonical resolved catalogs.
CREATE TRIGGER trg_dealer_catalog_catalog_products_update AFTER UPDATE ON catalog_products
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE business_id = NEW.business_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

-- D-034: the private dealer publication includes canonical resolved catalogs.
CREATE TRIGGER trg_dealer_catalog_catalog_products_delete AFTER DELETE ON catalog_products
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE business_id = OLD.business_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

-- D-034: the private dealer publication includes canonical resolved catalogs.
CREATE TRIGGER trg_dealer_catalog_commerce_product_publications_insert AFTER INSERT ON commerce_product_publications
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE business_id = NEW.business_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

-- D-034: the private dealer publication includes canonical resolved catalogs.
CREATE TRIGGER trg_dealer_catalog_commerce_product_publications_update AFTER UPDATE ON commerce_product_publications
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE business_id = NEW.business_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

-- D-034: the private dealer publication includes canonical resolved catalogs.
CREATE TRIGGER trg_dealer_catalog_commerce_product_publications_delete AFTER DELETE ON commerce_product_publications
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE business_id = OLD.business_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_dealer_catalog_delivery AFTER UPDATE OF online_sales_delivery_enabled, online_sales_pickup_enabled, online_sales_shipping_enabled ON settings
WHEN (NEW.online_sales_delivery_enabled <> OLD.online_sales_delivery_enabled OR NEW.online_sales_pickup_enabled <> OLD.online_sales_pickup_enabled OR NEW.online_sales_shipping_enabled <> OLD.online_sales_shipping_enabled)
  AND EXISTS (SELECT 1 FROM customer_web_access WHERE business_id = NEW.business_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

-- Terminal transport outcomes only; rejected access never creates a Commerce Order.
CREATE TABLE commerce_dealer_order_rejections (
  web_order_id TEXT PRIMARY KEY,
  dealer_access_id TEXT NOT NULL,
  access_revision INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason = 'access_revoked'),
  created_at TEXT NOT NULL
);

-- D-035: delivery intent and provider credentials are isolated from commerce/customer state.
CREATE TABLE business_messaging_provider_config (
  business_id TEXT NOT NULL REFERENCES business(id), provider_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0, waba_id TEXT NOT NULL DEFAULT '', phone_number_id TEXT NOT NULL DEFAULT '',
  access_token_encrypted TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
  PRIMARY KEY (business_id, provider_id)
);
CREATE TABLE business_messages (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES business(id), customer_id TEXT REFERENCES customers(id),
  purpose TEXT NOT NULL DEFAULT 'operational' CHECK(purpose IN ('operational','marketing')),
  campaign_id TEXT REFERENCES messaging_campaigns(id), campaign_recipient_id TEXT REFERENCES messaging_campaign_recipients(id),
  related_entity_type TEXT NOT NULL DEFAULT '', related_entity_id TEXT NOT NULL DEFAULT '',
  provider_id TEXT NOT NULL, recipient TEXT NOT NULL, message_kind TEXT NOT NULL CHECK(message_kind IN ('template','session','text')),
  template_name TEXT NOT NULL, template_language TEXT NOT NULL, provider_message_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('draft','queued','accepted','delivered','read','failed','cancelled')),
  failure_code TEXT NOT NULL DEFAULT '', failure_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, accepted_at TEXT NOT NULL DEFAULT '', delivered_at TEXT NOT NULL DEFAULT '',
  read_at TEXT NOT NULL DEFAULT '', failed_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX business_message_provider_reference ON business_messages(provider_id, provider_message_id) WHERE provider_message_id != '';
CREATE TABLE business_message_provider_bindings (
  message_id TEXT PRIMARY KEY REFERENCES business_messages(id), account_key TEXT NOT NULL,
  intent_hash TEXT NOT NULL, submitted INTEGER NOT NULL DEFAULT 0
);

-- D-036: desktop-only marketing intent. No contact/body snapshots. D-037 owns dispatch.
CREATE TABLE customer_messaging_preferences (
  business_id TEXT NOT NULL REFERENCES business(id), customer_id TEXT NOT NULL REFERENCES customers(id),
  channel TEXT NOT NULL CHECK(channel IN ('whatsapp','sms')), purpose TEXT NOT NULL CHECK(purpose='marketing'),
  status TEXT NOT NULL DEFAULT 'unknown' CHECK(status IN ('unknown','opted_in','opted_out')),
  source TEXT NOT NULL CHECK(length(source) BETWEEN 1 AND 80), note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=500),
  recorded_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(customer_id,channel,purpose)
);
CREATE TABLE messaging_segments (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES business(id), name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', filter_definition_json TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT NOT NULL DEFAULT '',
  UNIQUE(id,business_id)
);
CREATE TABLE messaging_campaigns (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES business(id), name TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose='marketing'), channel TEXT NOT NULL CHECK(channel IN ('whatsapp','sms')),
  provider_id TEXT, segment_id TEXT NOT NULL, template_name TEXT NOT NULL, template_language TEXT NOT NULL,
  content_id TEXT REFERENCES marketing_contents(id), content_revision INTEGER, text TEXT NOT NULL DEFAULT '',
  bindings_json TEXT NOT NULL, template_snapshot_json TEXT, preparation_counts_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','prepared','running','paused','cancelled','completed')),
  prepared_at TEXT NOT NULL DEFAULT '', cancelled_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(id,business_id), FOREIGN KEY(segment_id,business_id) REFERENCES messaging_segments(id,business_id)
);
CREATE TABLE messaging_campaign_recipients (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES messaging_campaigns(id), customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL CHECK(status IN ('prepared','skipped','cancelled')),
  skip_reason TEXT NOT NULL DEFAULT '' CHECK(skip_reason IN ('','unknown_consent','opted_out','missing_recipient','customer_unavailable')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(campaign_id,customer_id), UNIQUE(id,campaign_id,customer_id)
);
CREATE TABLE messaging_outbox (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES business(id), campaign_id TEXT NOT NULL,
  campaign_recipient_id TEXT NOT NULL, customer_id TEXT NOT NULL REFERENCES customers(id),
  channel TEXT NOT NULL CHECK(channel IN ('whatsapp','sms')), provider_id TEXT NOT NULL,
  business_message_id TEXT REFERENCES business_messages(id),
  status TEXT NOT NULL CHECK(status IN ('pending','claimed','dispatched','skipped','failed','cancelled')),
  operation_key TEXT NOT NULL UNIQUE, attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
  claim_token TEXT NOT NULL DEFAULT '', claimed_at TEXT NOT NULL DEFAULT '',
  next_attempt_at TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT '' CHECK(length(last_error)<=240),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(campaign_id,customer_id,channel),
  FOREIGN KEY(campaign_id,business_id) REFERENCES messaging_campaigns(id,business_id),
  FOREIGN KEY(campaign_recipient_id,campaign_id,customer_id) REFERENCES messaging_campaign_recipients(id,campaign_id,customer_id)
);
CREATE UNIQUE INDEX messaging_outbox_message ON messaging_outbox(business_message_id) WHERE business_message_id IS NOT NULL;
CREATE TABLE messaging_dispatch_runtime (
  business_id TEXT PRIMARY KEY REFERENCES business(id), next_dispatch_at TEXT NOT NULL
);
CREATE INDEX messaging_outbox_pending ON messaging_outbox(business_id,status,next_attempt_at);
CREATE INDEX messaging_outbox_customer ON messaging_outbox(customer_id,channel,status);

-- Every canonical preference writer (including future importers) suppresses unsent pending intent.
CREATE TRIGGER trg_messaging_preference_suppress_insert AFTER INSERT ON customer_messaging_preferences
WHEN NEW.status != 'opted_in'
BEGIN
  UPDATE messaging_campaign_recipients SET status='skipped',
    skip_reason=CASE WHEN NEW.status='opted_out' THEN 'opted_out' ELSE 'unknown_consent' END, updated_at=NEW.updated_at
    WHERE id IN (SELECT campaign_recipient_id FROM messaging_outbox WHERE business_id=NEW.business_id
      AND customer_id=NEW.customer_id AND channel=NEW.channel AND status='pending' AND NOT EXISTS(SELECT 1 FROM business_message_provider_bindings b WHERE b.message_id=messaging_outbox.business_message_id AND b.submitted=1));
  UPDATE messaging_outbox SET status='skipped', last_error=CASE WHEN NEW.status='opted_out' THEN 'opted_out' ELSE 'unknown_consent' END,
    updated_at=NEW.updated_at WHERE business_id=NEW.business_id AND customer_id=NEW.customer_id AND channel=NEW.channel AND status='pending' AND NOT EXISTS(SELECT 1 FROM business_message_provider_bindings b WHERE b.message_id=messaging_outbox.business_message_id AND b.submitted=1);
END;
CREATE TRIGGER trg_messaging_preference_suppress_update AFTER UPDATE OF status ON customer_messaging_preferences
WHEN NEW.status != 'opted_in'
BEGIN
  UPDATE messaging_campaign_recipients SET status='skipped',
    skip_reason=CASE WHEN NEW.status='opted_out' THEN 'opted_out' ELSE 'unknown_consent' END, updated_at=NEW.updated_at
    WHERE id IN (SELECT campaign_recipient_id FROM messaging_outbox WHERE business_id=NEW.business_id
      AND customer_id=NEW.customer_id AND channel=NEW.channel AND status='pending' AND NOT EXISTS(SELECT 1 FROM business_message_provider_bindings b WHERE b.message_id=messaging_outbox.business_message_id AND b.submitted=1));
  UPDATE messaging_outbox SET status='skipped', last_error=CASE WHEN NEW.status='opted_out' THEN 'opted_out' ELSE 'unknown_consent' END,
    updated_at=NEW.updated_at WHERE business_id=NEW.business_id AND customer_id=NEW.customer_id AND channel=NEW.channel AND status='pending' AND NOT EXISTS(SELECT 1 FROM business_message_provider_bindings b WHERE b.message_id=messaging_outbox.business_message_id AND b.submitted=1);
END;
CREATE TRIGGER trg_messaging_customer_deleted AFTER UPDATE OF deleted_at ON customers
WHEN NEW.deleted_at != ''
BEGIN
  UPDATE messaging_campaign_recipients SET status='skipped', skip_reason='customer_unavailable', updated_at=NEW.updated_at
    WHERE id IN (SELECT campaign_recipient_id FROM messaging_outbox WHERE customer_id=NEW.id AND status='pending' AND NOT EXISTS(SELECT 1 FROM business_message_provider_bindings b WHERE b.message_id=messaging_outbox.business_message_id AND b.submitted=1));
  UPDATE messaging_outbox SET status='skipped', last_error='customer_unavailable', updated_at=NEW.updated_at
    WHERE customer_id=NEW.id AND status='pending' AND NOT EXISTS(SELECT 1 FROM business_message_provider_bindings b WHERE b.message_id=messaging_outbox.business_message_id AND b.submitted=1);
END;

-- A certainly unsent canonical campaign message shares the terminal cancellation of its transport intent.
CREATE TRIGGER trg_campaign_outbox_terminal_message AFTER UPDATE OF status ON messaging_outbox
WHEN NEW.status IN ('skipped','cancelled') AND NEW.business_message_id IS NOT NULL
BEGIN
  UPDATE business_messages SET status='cancelled' WHERE id=NEW.business_message_id AND purpose='marketing' AND status='draft'
    AND EXISTS(SELECT 1 FROM business_message_provider_bindings b WHERE b.message_id=NEW.business_message_id AND b.submitted=0);
END;

-- D-038: desktop canonical content, reusable disk assets and explicit publication snapshots.
CREATE TABLE marketing_contents (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES business(id), title TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('announcement','promotion')),
  source TEXT NOT NULL CHECK(source IN ('manual','ai')), master_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','ready','archived')), revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
-- Editorial share options and links only; actual publication/delivery/schedule state stays canonical.
CREATE TABLE marketing_shares (
  content_id TEXT PRIMARY KEY REFERENCES marketing_contents(id), options_json TEXT NOT NULL
);
CREATE TABLE marketing_share_targets (
  content_id TEXT NOT NULL REFERENCES marketing_shares(content_id),
  channel TEXT NOT NULL CHECK(channel IN ('website','instagram','whatsapp','sms')),
  target_type TEXT NOT NULL CHECK(target_type IN ('public_publication','audience_campaign')),
  target_id TEXT NOT NULL, PRIMARY KEY(content_id,channel)
);
CREATE TABLE marketing_content_variants (
  content_id TEXT NOT NULL REFERENCES marketing_contents(id), channel TEXT NOT NULL CHECK(channel IN ('website','whatsapp','sms','instagram')),
  title TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, media_asset_id TEXT REFERENCES media_assets(id), metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(content_id,channel)
);
CREATE TABLE media_assets (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES business(id), kind TEXT NOT NULL CHECK(kind='image'),
  source TEXT NOT NULL CHECK(source IN ('upload','ai')), storage_ref TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
  width INTEGER NOT NULL CHECK(width>0), height INTEGER NOT NULL CHECK(height>0), file_size INTEGER NOT NULL CHECK(file_size>0),
  alt_text TEXT NOT NULL DEFAULT '', ai_metadata_json TEXT NOT NULL DEFAULT '{}', content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL, archived_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE marketing_content_media (
  content_id TEXT NOT NULL REFERENCES marketing_contents(id), media_asset_id TEXT NOT NULL REFERENCES media_assets(id),
  sort_order INTEGER NOT NULL CHECK(sort_order>=0), role TEXT NOT NULL CHECK(role IN ('primary','gallery')),
  PRIMARY KEY(content_id,media_asset_id), UNIQUE(content_id,sort_order)
);
CREATE TABLE marketing_publications (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES business(id), content_id TEXT NOT NULL REFERENCES marketing_contents(id),
  channel TEXT NOT NULL CHECK(channel IN ('website','whatsapp','sms','instagram')),
  status TEXT NOT NULL CHECK(status IN ('draft','publishing','published','unpublished','failed')),
  placement TEXT NOT NULL CHECK(placement='homepage_feature'), title TEXT NOT NULL, text TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1, published_revision INTEGER NOT NULL DEFAULT 0,
  desired_published INTEGER NOT NULL DEFAULT 0 CHECK(desired_published IN (0,1)),
  published_snapshot_json TEXT NOT NULL DEFAULT '{}', published_at TEXT NOT NULL DEFAULT '', unpublished_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE marketing_publication_media (
  publication_id TEXT NOT NULL REFERENCES marketing_publications(id), media_asset_id TEXT NOT NULL REFERENCES media_assets(id),
  sort_order INTEGER NOT NULL CHECK(sort_order>=0), PRIMARY KEY(publication_id,media_asset_id), UNIQUE(publication_id,sort_order)
);
CREATE INDEX idx_marketing_contents_business ON marketing_contents(business_id, updated_at);
CREATE INDEX idx_marketing_publications_business ON marketing_publications(business_id, channel);

-- Capability bounds effective Web visibility; editorial desired_published is retained.
CREATE TRIGGER trg_marketing_capability_insert AFTER INSERT ON business_capabilities
WHEN NEW.capability_id = 'marketing.studio'
  AND (EXISTS (SELECT 1 FROM marketing_publications WHERE channel = 'website')
    OR EXISTS (SELECT 1 FROM sync_publication_payloads WHERE job_key = 'marketing_website'))
BEGIN
  INSERT INTO sync_outbox(job_key, job_type, created_at, updated_at)
  VALUES ('marketing_website', 'marketing_website_publish', NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_marketing_capability_update AFTER UPDATE OF is_enabled ON business_capabilities
WHEN NEW.capability_id = 'marketing.studio' AND NEW.is_enabled != OLD.is_enabled
  AND (EXISTS (SELECT 1 FROM marketing_publications WHERE channel = 'website')
    OR EXISTS (SELECT 1 FROM sync_publication_payloads WHERE job_key = 'marketing_website'))
BEGIN
  INSERT INTO sync_outbox(job_key, job_type, created_at, updated_at)
  VALUES ('marketing_website', 'marketing_website_publish', NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_marketing_capability_delete AFTER DELETE ON business_capabilities
WHEN OLD.capability_id = 'marketing.studio'
  AND (EXISTS (SELECT 1 FROM marketing_publications WHERE channel = 'website')
    OR EXISTS (SELECT 1 FROM sync_publication_payloads WHERE job_key = 'marketing_website'))
BEGIN
  INSERT INTO sync_outbox(job_key, job_type, created_at, updated_at)
  VALUES ('marketing_website', 'marketing_website_publish', OLD.updated_at, OLD.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;
CREATE INDEX idx_media_assets_business ON media_assets(business_id, archived_at);
-- Retain every in-flight intent's files until a matching acknowledgement supersedes it.
CREATE TABLE marketing_publication_pending_media (
  publication_id TEXT NOT NULL REFERENCES marketing_publications(id),
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id),
  revision INTEGER NOT NULL, PRIMARY KEY(publication_id,media_asset_id)
);

-- D-039: independent provider configuration; secrets are safeStorage ciphertext only.
CREATE TABLE marketing_provider_config (
  business_id TEXT NOT NULL REFERENCES business(id), provider_id TEXT NOT NULL CHECK(provider_id IN ('iletimerkezi','instagram_api')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)), account_id TEXT NOT NULL DEFAULT '', sender_id TEXT NOT NULL DEFAULT '',
  iys_list TEXT NOT NULL DEFAULT 'BIREYSEL' CHECK(iys_list IN ('BIREYSEL','TACIR')),
  secret_one_encrypted TEXT NOT NULL DEFAULT '', secret_two_encrypted TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
  PRIMARY KEY(business_id,provider_id)
);
-- Provider-specific submission state augments the canonical public publication; never a second publication.
CREATE TABLE instagram_publication_state (
  publication_id TEXT PRIMARY KEY REFERENCES marketing_publications(id), account_key TEXT NOT NULL,
  container_id TEXT NOT NULL DEFAULT '', provider_media_id TEXT NOT NULL DEFAULT '', permalink TEXT NOT NULL DEFAULT '',
  create_submitted INTEGER NOT NULL DEFAULT 0, publish_submitted INTEGER NOT NULL DEFAULT 0, failure_code TEXT NOT NULL DEFAULT '',
  stage_token TEXT NOT NULL DEFAULT '', stage_expires_at TEXT NOT NULL DEFAULT '', stage_base_url TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX instagram_published_reference ON instagram_publication_state(provider_media_id) WHERE provider_media_id!='';

-- D-040: immutable canonical publication revisions; scheduler holds references only.
CREATE TABLE marketing_publication_revisions (
  publication_id TEXT NOT NULL REFERENCES marketing_publications(id), revision INTEGER NOT NULL,
  content_revision INTEGER NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(publication_id,revision)
);
CREATE TABLE marketing_schedules (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES business(id), name TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('audience_campaign','public_publication')),
  target_id TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('website','instagram','whatsapp','sms')),
  target_revision INTEGER, content_revision INTEGER,
  schedule_type TEXT NOT NULL CHECK(schedule_type IN ('once','recurring')), timezone TEXT NOT NULL,
  starts_at TEXT NOT NULL, starts_local TEXT NOT NULL, recurrence_json TEXT,
  status TEXT NOT NULL CHECK(status IN ('active','paused','completed','cancelled')),
  missed_run_policy TEXT NOT NULL CHECK(missed_run_policy IN ('run_once_when_resumed','skip')),
  next_run_at TEXT NOT NULL, last_run_at TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK(schedule_type='once' OR channel IN ('website','instagram')),
  CHECK((target_type='audience_campaign' AND channel IN ('whatsapp','sms') AND target_revision IS NULL)
     OR (target_type='public_publication' AND channel IN ('website','instagram') AND target_revision IS NOT NULL)),
  FOREIGN KEY(target_id,target_revision) REFERENCES marketing_publication_revisions(publication_id,revision)
);
CREATE INDEX idx_marketing_schedules_due ON marketing_schedules(business_id,status,next_run_at);
CREATE TABLE marketing_schedule_executions (
  id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL REFERENCES marketing_schedules(id), occurrence_key TEXT NOT NULL,
  planned_at TEXT NOT NULL, claimed_at TEXT NOT NULL DEFAULT '', completed_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('pending','claimed','succeeded','skipped','failed')),
  result_reference TEXT, action_revision INTEGER, last_error TEXT NOT NULL DEFAULT '' CHECK(length(last_error)<=160),
  created_at TEXT NOT NULL, UNIQUE(schedule_id,occurrence_key)
);
CREATE INDEX idx_marketing_schedule_executions_recovery ON marketing_schedule_executions(status,schedule_id);

-- D-041: bounded normalized external observations only; canonical entities remain untouched.
CREATE TABLE marketing_metric_snapshots (
  business_id TEXT NOT NULL REFERENCES business(id),
  target_type TEXT NOT NULL CHECK(target_type='publication'),
  target_id TEXT NOT NULL REFERENCES marketing_publications(id),
  channel TEXT NOT NULL CHECK(channel='instagram'),
  provider_key TEXT NOT NULL,
  metric TEXT NOT NULL CHECK(metric IN ('reach','views','likes','comments','saves','shares')),
  range_start TEXT NOT NULL, range_end TEXT NOT NULL,
  value INTEGER NOT NULL CHECK(value>=0), measured_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  UNIQUE(business_id,target_id,provider_key,metric,range_start,range_end)
);

-- Companion v3 uses the existing durable Android publication invalidation/revision ledger.
CREATE TRIGGER trg_companion_commerce_orders_insert AFTER INSERT ON commerce_orders BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_commerce_orders_update AFTER UPDATE ON commerce_orders BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_commerce_orders_delete AFTER DELETE ON commerce_orders BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, OLD.updated_at, OLD.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_commerce_shipments_insert AFTER INSERT ON commerce_shipments BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_commerce_shipments_update AFTER UPDATE ON commerce_shipments BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_commerce_shipments_delete AFTER DELETE ON commerce_shipments BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, OLD.updated_at, OLD.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_customer_commercial_profiles_insert AFTER INSERT ON customer_commercial_profiles BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_customer_commercial_profiles_update AFTER UPDATE ON customer_commercial_profiles BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_customer_commercial_profiles_delete AFTER DELETE ON customer_commercial_profiles BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, OLD.updated_at, OLD.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_commerce_product_publications_insert AFTER INSERT ON commerce_product_publications BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_commerce_product_publications_update AFTER UPDATE ON commerce_product_publications BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_commerce_product_publications_delete AFTER DELETE ON commerce_product_publications BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, OLD.updated_at, OLD.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_marketing_publications_insert AFTER INSERT ON marketing_publications BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_marketing_publications_update AFTER UPDATE ON marketing_publications BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_marketing_publications_delete AFTER DELETE ON marketing_publications BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, OLD.updated_at, OLD.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_marketing_schedules_insert AFTER INSERT ON marketing_schedules BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_marketing_schedules_update AFTER UPDATE ON marketing_schedules BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_marketing_schedules_delete AFTER DELETE ON marketing_schedules BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, OLD.updated_at, OLD.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_marketing_schedule_executions_insert AFTER INSERT ON marketing_schedule_executions BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.created_at, NEW.created_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_marketing_schedule_executions_update AFTER UPDATE ON marketing_schedule_executions BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.created_at, NEW.created_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_marketing_schedule_executions_delete AFTER DELETE ON marketing_schedule_executions BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, OLD.created_at, OLD.created_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_messaging_campaigns_insert AFTER INSERT ON messaging_campaigns BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_messaging_campaigns_update AFTER UPDATE ON messaging_campaigns BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_messaging_campaigns_delete AFTER DELETE ON messaging_campaigns BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, OLD.updated_at, OLD.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_messaging_outbox_insert AFTER INSERT ON messaging_outbox BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_messaging_outbox_update AFTER UPDATE ON messaging_outbox BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_messaging_outbox_delete AFTER DELETE ON messaging_outbox BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, OLD.updated_at, OLD.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_online_product_update AFTER UPDATE ON catalog_products
WHEN EXISTS (SELECT 1 FROM commerce_product_publications WHERE product_id=OLD.id AND is_published=1) BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, NEW.updated_at, NEW.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_companion_online_product_delete AFTER DELETE ON catalog_products
WHEN EXISTS (SELECT 1 FROM commerce_product_publications WHERE product_id=OLD.id AND is_published=1) BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('android_snapshot', 'android_snapshot', 1, OLD.updated_at, OLD.updated_at)
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_kbs_notifications_android_snapshot_insert AFTER INSERT ON hospitality_notifications BEGIN
  INSERT INTO sync_outbox (job_key,job_type,source_revision,created_at,updated_at)
  VALUES ('android_snapshot','android_snapshot',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision=sync_outbox.source_revision+1,
    attempt_count=0,next_attempt_at='',last_error='',updated_at=excluded.updated_at;
END;

CREATE TRIGGER trg_kbs_notifications_android_snapshot_update AFTER UPDATE ON hospitality_notifications BEGIN
  INSERT INTO sync_outbox (job_key,job_type,source_revision,created_at,updated_at)
  VALUES ('android_snapshot','android_snapshot',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision=sync_outbox.source_revision+1,
    attempt_count=0,next_attempt_at='',last_error='',updated_at=excluded.updated_at;
END;

CREATE TRIGGER trg_kbs_notifications_android_snapshot_delete AFTER DELETE ON hospitality_notifications BEGIN
  INSERT INTO sync_outbox (job_key,job_type,source_revision,created_at,updated_at)
  VALUES ('android_snapshot','android_snapshot',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision=sync_outbox.source_revision+1,
    attempt_count=0,next_attempt_at='',last_error='',updated_at=excluded.updated_at;
END;

CREATE TRIGGER trg_kbs_settings_android_snapshot_insert AFTER INSERT ON kbs_service_settings BEGIN
  INSERT INTO sync_outbox (job_key,job_type,source_revision,created_at,updated_at)
  VALUES ('android_snapshot','android_snapshot',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision=sync_outbox.source_revision+1,
    attempt_count=0,next_attempt_at='',last_error='',updated_at=excluded.updated_at;
END;

CREATE TRIGGER trg_kbs_settings_android_snapshot_update AFTER UPDATE ON kbs_service_settings BEGIN
  INSERT INTO sync_outbox (job_key,job_type,source_revision,created_at,updated_at)
  VALUES ('android_snapshot','android_snapshot',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision=sync_outbox.source_revision+1,
    attempt_count=0,next_attempt_at='',last_error='',updated_at=excluded.updated_at;
END;

CREATE TRIGGER trg_kbs_settings_android_snapshot_delete AFTER DELETE ON kbs_service_settings BEGIN
  INSERT INTO sync_outbox (job_key,job_type,source_revision,created_at,updated_at)
  VALUES ('android_snapshot','android_snapshot',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision=sync_outbox.source_revision+1,
    attempt_count=0,next_attempt_at='',last_error='',updated_at=excluded.updated_at;
END;

CREATE TRIGGER trg_kbs_requests_android_snapshot_insert AFTER INSERT ON kbs_delivery_requests BEGIN
  INSERT INTO sync_outbox (job_key,job_type,source_revision,created_at,updated_at)
  VALUES ('android_snapshot','android_snapshot',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision=sync_outbox.source_revision+1,
    attempt_count=0,next_attempt_at='',last_error='',updated_at=excluded.updated_at;
END;

CREATE TRIGGER trg_kbs_requests_android_snapshot_update AFTER UPDATE ON kbs_delivery_requests BEGIN
  INSERT INTO sync_outbox (job_key,job_type,source_revision,created_at,updated_at)
  VALUES ('android_snapshot','android_snapshot',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision=sync_outbox.source_revision+1,
    attempt_count=0,next_attempt_at='',last_error='',updated_at=excluded.updated_at;
END;

CREATE TRIGGER trg_kbs_requests_android_snapshot_delete AFTER DELETE ON kbs_delivery_requests BEGIN
  INSERT INTO sync_outbox (job_key,job_type,source_revision,created_at,updated_at)
  VALUES ('android_snapshot','android_snapshot',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision=sync_outbox.source_revision+1,
    attempt_count=0,next_attempt_at='',last_error='',updated_at=excluded.updated_at;
END;

-- Public translation service: current schema only, independent of spoken languages.
CREATE TABLE public_translation_settings (
  business_id TEXT PRIMARY KEY REFERENCES business(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  source_language TEXT NOT NULL DEFAULT 'tr' CHECK(source_language='tr'),
  target_languages_json TEXT NOT NULL DEFAULT '[]',
  automatic INTEGER NOT NULL DEFAULT 0 CHECK(automatic IN (0,1)),
  updated_at TEXT NOT NULL
);
CREATE TABLE public_site_translation_catalogs (
  business_id TEXT NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  catalog_json TEXT NOT NULL,
  PRIMARY KEY(business_id,target_url)
);
-- Durable queue/cooldown only; canonical source text stays with its publication owner.
CREATE TABLE public_translation_runtime (
  business_id TEXT PRIMARY KEY REFERENCES business(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL
);
CREATE TABLE public_translations (
  business_id TEXT NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK(record_type IN ('business','room','table','menu_category','menu_product','catalog_category','catalog_product','gallery','marketing','site_text')),
  record_id TEXT NOT NULL, field TEXT NOT NULL, target_language TEXT NOT NULL,
  source_text TEXT NOT NULL, source_hash TEXT NOT NULL,
  translated_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('ready','failed')),
  origin TEXT NOT NULL CHECK(origin IN ('manual','ai')),
  failure_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(business_id,record_type,record_id,field,target_language)
);
CREATE INDEX idx_public_translations_ai_reuse ON public_translations(business_id,source_hash,target_language)
  WHERE origin='ai' AND status='ready';
-- Reconstructable allowlist projection. Never joins customers, bookings, finance or messages.
CREATE VIEW public_translation_sources AS
SELECT b.id AS business_id, 'business' AS record_type, b.id AS record_id, b.display_name AS label, json_object('description', p.description, 'about_text', p.about_text, 'directions_note', p.directions_note, 'policy_note', p.policy_note, 'payment_note', p.payment_note) AS fields_json FROM business b JOIN business_public_profile p ON p.business_id=b.id WHERE b.deleted_at='' AND 1
UNION ALL
SELECT b.id AS business_id, 'room' AS record_type, r.id AS record_id, r.name AS label, json_object('name', r.name, 'bed_info', r.bed_info, 'description', r.description, 'price_note', r.price_note) AS fields_json FROM business b CROSS JOIN rooms r WHERE b.deleted_at='' AND r.deleted_at='' AND r.is_active=1 AND b.publish_rooms_web=1 AND EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id=b.id AND c.capability_id='accommodation.rooms' AND c.is_enabled=1)
UNION ALL
SELECT b.id AS business_id, 'table' AS record_type, r.id AS record_id, r.name AS label, json_object('name', r.name, 'area', r.area, 'description', r.public_description) AS fields_json FROM business b CROSS JOIN tables r WHERE b.deleted_at='' AND r.deleted_at='' AND r.is_active=1 AND b.publish_tables_web=1 AND EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id=b.id AND c.capability_id='food_service.tables' AND c.is_enabled=1)
UNION ALL
SELECT b.id AS business_id, 'menu_category' AS record_type, r.id AS record_id, r.name AS label, json_object('name', r.name, 'description', r.description) AS fields_json FROM business b CROSS JOIN menu_categories r WHERE b.deleted_at='' AND r.deleted_at='' AND r.is_active=1 AND b.publish_qr_menu_web=1 AND EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id=b.id AND c.capability_id='channel.qr_menu' AND c.is_enabled=1)
UNION ALL
SELECT b.id AS business_id, 'menu_product' AS record_type, e.id AS record_id, p.name AS label, json_object('name', p.name, 'description', p.description) AS fields_json FROM business b JOIN catalog_products p ON p.business_id=b.id JOIN menu_product_entries e ON e.product_id=p.id JOIN menu_categories c ON c.id=e.category_id WHERE b.deleted_at='' AND p.deleted_at='' AND p.is_active=1 AND e.deleted_at='' AND c.deleted_at='' AND c.is_active=1 AND b.publish_qr_menu_web=1 AND EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id=b.id AND c.capability_id='channel.qr_menu' AND c.is_enabled=1)
UNION ALL
SELECT b.id AS business_id, 'catalog_product' AS record_type, p.id AS record_id, COALESCE(NULLIF(r.title_override,''),p.name) AS label, json_object('name', COALESCE(NULLIF(r.title_override,''),p.name), 'description', COALESCE(NULLIF(r.description_override,''),p.description)) AS fields_json FROM business b JOIN catalog_products p ON p.business_id=b.id JOIN commerce_product_publications r ON r.product_id=p.id AND r.business_id=b.id WHERE b.deleted_at='' AND p.deleted_at='' AND p.is_active=1 AND r.is_published=1 AND r.channel='online_sales' AND EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id=b.id AND c.capability_id='channel.online_sales' AND c.is_enabled=1)
UNION ALL
SELECT b.id AS business_id, 'catalog_category' AS record_type, r.id AS record_id, r.name AS label, json_object('name', r.name) AS fields_json FROM business b JOIN catalog_categories r ON r.business_id=b.id WHERE b.deleted_at='' AND r.deleted_at='' AND r.is_active=1 AND EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id=b.id AND c.capability_id='channel.online_sales' AND c.is_enabled=1) AND EXISTS(SELECT 1 FROM catalog_products p JOIN commerce_product_publications x ON x.product_id=p.id AND x.business_id=b.id WHERE p.category_id=r.id AND p.deleted_at='' AND p.is_active=1 AND x.is_published=1 AND x.channel='online_sales')
UNION ALL
SELECT b.id AS business_id, 'marketing' AS record_type, r.id AS record_id, r.title AS label, json_object('title', r.title, 'text', r.text) AS fields_json FROM business b JOIN marketing_publications r ON r.business_id=b.id WHERE b.deleted_at='' AND r.channel='website' AND r.desired_published=1 AND r.status!='draft' AND EXISTS(SELECT 1 FROM business_capabilities c WHERE c.business_id=b.id AND c.capability_id='marketing.studio' AND c.is_enabled=1);

-- Dealer read projections share the existing private durable publication.
CREATE TRIGGER trg_dealer_history_commerce_orders_insert AFTER INSERT ON commerce_orders
WHEN NEW.source IN ('web-dealer', 'web-online-sales') AND EXISTS (SELECT 1 FROM customer_web_access WHERE business_id = NEW.business_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_dealer_history_commerce_orders_update AFTER UPDATE ON commerce_orders
WHEN NEW.source IN ('web-dealer', 'web-online-sales') AND EXISTS (SELECT 1 FROM customer_web_access WHERE business_id = NEW.business_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_dealer_history_commerce_orders_delete AFTER DELETE ON commerce_orders
WHEN OLD.source IN ('web-dealer', 'web-online-sales') AND EXISTS (SELECT 1 FROM customer_web_access WHERE business_id = OLD.business_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_dealer_history_commerce_order_items_insert AFTER INSERT ON commerce_order_items
WHEN EXISTS (SELECT 1 FROM commerce_orders o JOIN customer_web_access a ON a.customer_id = o.customer_id AND a.business_id = o.business_id WHERE o.id = NEW.order_id AND o.source IN ('web-dealer', 'web-online-sales'))
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_dealer_history_commerce_order_items_update AFTER UPDATE ON commerce_order_items
WHEN EXISTS (SELECT 1 FROM commerce_orders o JOIN customer_web_access a ON a.customer_id = o.customer_id AND a.business_id = o.business_id WHERE o.id = NEW.order_id AND o.source IN ('web-dealer', 'web-online-sales'))
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_dealer_history_commerce_order_items_delete AFTER DELETE ON commerce_order_items
WHEN EXISTS (SELECT 1 FROM commerce_orders o JOIN customer_web_access a ON a.customer_id = o.customer_id AND a.business_id = o.business_id WHERE o.id = OLD.order_id AND o.source IN ('web-dealer', 'web-online-sales'))
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_dealer_history_commerce_dealer_order_rejections_insert AFTER INSERT ON commerce_dealer_order_rejections
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE id = NEW.dealer_access_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_dealer_history_commerce_dealer_order_rejections_update AFTER UPDATE ON commerce_dealer_order_rejections
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE id = NEW.dealer_access_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_dealer_history_commerce_dealer_order_rejections_delete AFTER DELETE ON commerce_dealer_order_rejections
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE id = OLD.dealer_access_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_dealer_history_catalog_categories_insert AFTER INSERT ON catalog_categories
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE business_id = NEW.business_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_dealer_history_catalog_categories_update AFTER UPDATE ON catalog_categories
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE business_id = NEW.business_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

CREATE TRIGGER trg_dealer_history_catalog_categories_delete AFTER DELETE ON catalog_categories
WHEN EXISTS (SELECT 1 FROM customer_web_access WHERE business_id = OLD.business_id)
BEGIN
  INSERT INTO sync_outbox (job_key, job_type, source_revision, created_at, updated_at)
  VALUES ('dealer_access', 'dealer_access_publish', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(job_key) DO UPDATE SET source_revision = sync_outbox.source_revision + 1,
    attempt_count = 0, next_attempt_at = '', last_error = '', updated_at = excluded.updated_at;
END;

-- Commerce benefits Phase A: canonical local authority; no migration/backfill.
CREATE TABLE commerce_benefit_settings (
  business_id TEXT PRIMARY KEY REFERENCES business(id),
  coupons_enabled INTEGER NOT NULL DEFAULT 0 CHECK (coupons_enabled IN (0,1)),
  points_enabled INTEGER NOT NULL DEFAULT 0 CHECK (points_enabled IN (0,1)),
  payment_modifiers_enabled INTEGER NOT NULL DEFAULT 0 CHECK (payment_modifiers_enabled IN (0,1)),
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0)
);

-- Versioned canonical JSON owns channel/customer/group/product/category scopes,
-- exclusions, thresholds, caps, stacking and monetary policy. Indexed fields are
-- generated from that same JSON, never a second independently writable policy.
CREATE TABLE commerce_benefit_rules (
  business_id TEXT NOT NULL REFERENCES business(id),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json)),
  family TEXT GENERATED ALWAYS AS (json_extract(canonical_json,'$.family')) STORED NOT NULL
    CHECK (family IN ('coupon','points','payment_modifier')),
  status TEXT GENERATED ALWAYS AS (json_extract(canonical_json,'$.status')) STORED NOT NULL
    CHECK (status IN ('draft','active','disabled')),
  currency TEXT GENERATED ALWAYS AS (json_extract(canonical_json,'$.currency')) STORED NOT NULL,
  starts_at_ms INTEGER GENERATED ALWAYS AS (json_extract(canonical_json,'$.startsAt')) STORED NOT NULL,
  ends_at_ms INTEGER GENERATED ALWAYS AS (json_extract(canonical_json,'$.endsAt')) STORED,
  min_spend_minor INTEGER GENERATED ALWAYS AS (json_extract(canonical_json,'$.minSpendMinor')) STORED NOT NULL CHECK (min_spend_minor >= 0),
  max_benefit_minor INTEGER GENERATED ALWAYS AS (json_extract(canonical_json,'$.maxBenefitMinor')) STORED CHECK (max_benefit_minor >= 0),
  percent_bps INTEGER GENERATED ALWAYS AS (json_extract(canonical_json,'$.percentBps')) STORED NOT NULL CHECK (percent_bps BETWEEN 0 AND 10000),
  fixed_minor INTEGER GENERATED ALWAYS AS (json_extract(canonical_json,'$.fixedMinor')) STORED NOT NULL CHECK (fixed_minor >= 0),
  PRIMARY KEY (business_id,id,version),
  CHECK (id = json_extract(canonical_json,'$.id') AND version = json_extract(canonical_json,'$.version')),
  CHECK (json_extract(canonical_json,'$.schemaVersion') = 1),
  CHECK (ends_at_ms IS NULL OR ends_at_ms > starts_at_ms)
);
CREATE TABLE commerce_benefit_rule_heads (
  business_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  PRIMARY KEY (business_id,rule_id),
  FOREIGN KEY (business_id,rule_id,version) REFERENCES commerce_benefit_rules(business_id,id,version)
);
CREATE INDEX idx_benefit_rules_scope ON commerce_benefit_rules(business_id,family,status,currency,starts_at_ms,ends_at_ms);

CREATE TABLE commerce_benefit_payment_methods (
  business_id TEXT NOT NULL REFERENCES business(id),
  channel TEXT NOT NULL CHECK (channel IN ('desktop_cart','desktop_desk','web','web_dealer','companion')),
  external_method TEXT NOT NULL,
  canonical_method TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  PRIMARY KEY (business_id,channel,external_method)
);
CREATE TABLE commerce_benefit_coupon_codes (
  business_id TEXT NOT NULL,
  id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  secret_hmac TEXT NOT NULL CHECK (length(secret_hmac) = 64),
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  max_uses INTEGER NOT NULL CHECK (max_uses > 0),
  max_uses_per_customer INTEGER NULL CHECK (max_uses_per_customer > 0),
  expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms > 0),
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,key_id,secret_hmac),
  FOREIGN KEY (business_id,rule_id) REFERENCES commerce_benefit_rule_heads(business_id,rule_id)
);
CREATE INDEX idx_benefit_codes_rule ON commerce_benefit_coupon_codes(business_id,rule_id,status);
CREATE TABLE commerce_benefit_coupon_rate_limits (
  business_id TEXT NOT NULL REFERENCES business(id),
  bucket_hmac TEXT NOT NULL,
  window_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  PRIMARY KEY (business_id,bucket_hmac,window_ms)
);
-- A successful online secret check yields a short-lived, intent-bound permit.
-- Rate attempts commit before the parent sale transaction, including failures.
CREATE TABLE commerce_benefit_coupon_authorizations (
  business_id TEXT NOT NULL REFERENCES business(id),
  id TEXT NOT NULL,
  intent_hmac TEXT NOT NULL,
  code_ids_json TEXT NOT NULL CHECK (json_valid(code_ids_json)),
  expires_at_ms INTEGER NOT NULL,
  reservation_id TEXT NULL,
  PRIMARY KEY (business_id,id)
);
CREATE INDEX idx_benefit_authorizations_expiry ON commerce_benefit_coupon_authorizations(business_id,expires_at_ms);

CREATE TABLE commerce_benefit_receipts (
  business_id TEXT NOT NULL REFERENCES business(id),
  operation_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  intent_hmac TEXT NOT NULL,
  receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (business_id,operation_key)
);
CREATE TABLE commerce_benefit_reservations (
  business_id TEXT NOT NULL REFERENCES business(id),
  id TEXT NOT NULL,
  customer_id TEXT NULL REFERENCES customers(id),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('sale','commerce_order','table_order')),
  source_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','settled','released','expired')),
  intent_json TEXT NOT NULL CHECK (json_valid(intent_json)),
  context_json TEXT NOT NULL CHECK (json_valid(context_json)),
  quote_json TEXT NOT NULL CHECK (json_valid(quote_json)),
  rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
  points_minor INTEGER NOT NULL CHECK (points_minor >= 0),
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms > created_at_ms),
  PRIMARY KEY (business_id,id)
);
CREATE UNIQUE INDEX idx_benefit_active_source ON commerce_benefit_reservations(business_id,source_kind,source_id) WHERE status = 'active';
CREATE INDEX idx_benefit_reservations_customer ON commerce_benefit_reservations(business_id,customer_id,currency,status,expires_at_ms);
CREATE TRIGGER benefit_reservation_customer_insert BEFORE INSERT ON commerce_benefit_reservations
WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customers WHERE id = NEW.customer_id AND business_id = NEW.business_id AND deleted_at = '')
BEGIN SELECT RAISE(ABORT,'BENEFITS_CUSTOMER_SCOPE'); END;

CREATE TABLE commerce_benefit_coupon_holds (
  business_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  code_id TEXT NOT NULL,
  PRIMARY KEY (business_id,reservation_id,code_id),
  FOREIGN KEY (business_id,reservation_id) REFERENCES commerce_benefit_reservations(business_id,id),
  FOREIGN KEY (business_id,code_id) REFERENCES commerce_benefit_coupon_codes(business_id,id)
);
CREATE INDEX idx_benefit_coupon_holds_code ON commerce_benefit_coupon_holds(business_id,code_id);

CREATE TABLE commerce_benefit_point_ledger (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES business(id),
  id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency NOT GLOB '*[^A-Z]*'),
  kind TEXT NOT NULL CHECK (kind IN ('grant','spend','reversal','expiry','manual_adjustment')),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND abs(amount_minor) <= 9007199254740991 AND amount_minor != 0),
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  operation_key TEXT NOT NULL,
  linked_entry_id TEXT NULL,
  expires_at_ms INTEGER NULL,
  created_at_ms INTEGER NOT NULL,
  UNIQUE (business_id,id),
  UNIQUE (business_id,source_kind,source_id,kind),
  FOREIGN KEY (business_id,linked_entry_id) REFERENCES commerce_benefit_point_ledger(business_id,id),
  CHECK ((kind = 'grant' AND amount_minor > 0) OR (kind IN ('spend','expiry') AND amount_minor < 0) OR kind IN ('reversal','manual_adjustment')),
  CHECK (expires_at_ms IS NULL OR (amount_minor > 0 AND expires_at_ms > 0))
);
CREATE INDEX idx_benefit_points_account ON commerce_benefit_point_ledger(business_id,customer_id,currency,created_at_ms,id);
CREATE INDEX idx_benefit_points_expiry ON commerce_benefit_point_ledger(business_id,expires_at_ms) WHERE amount_minor > 0;
CREATE TRIGGER benefit_point_customer_insert BEFORE INSERT ON commerce_benefit_point_ledger
WHEN NOT EXISTS (SELECT 1 FROM customers WHERE id = NEW.customer_id AND business_id = NEW.business_id AND deleted_at = '')
BEGIN SELECT RAISE(ABORT,'BENEFITS_CUSTOMER_SCOPE'); END;

-- Immutable FIFO lot allocations make expiry/refund independent of later rules.
CREATE TABLE commerce_benefit_point_allocations (
  business_id TEXT NOT NULL,
  credit_entry_id TEXT NOT NULL,
  debit_entry_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
  PRIMARY KEY (business_id,credit_entry_id,debit_entry_id),
  FOREIGN KEY (business_id,credit_entry_id) REFERENCES commerce_benefit_point_ledger(business_id,id),
  FOREIGN KEY (business_id,debit_entry_id) REFERENCES commerce_benefit_point_ledger(business_id,id)
);
CREATE TABLE commerce_benefit_point_holds (
  business_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  credit_entry_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
  PRIMARY KEY (business_id,reservation_id,credit_entry_id),
  FOREIGN KEY (business_id,reservation_id) REFERENCES commerce_benefit_reservations(business_id,id),
  FOREIGN KEY (business_id,credit_entry_id) REFERENCES commerce_benefit_point_ledger(business_id,id)
);
CREATE TRIGGER benefit_point_hold_scope BEFORE INSERT ON commerce_benefit_point_holds
WHEN NOT EXISTS (
  SELECT 1 FROM commerce_benefit_reservations r JOIN commerce_benefit_point_ledger l
  ON l.business_id = r.business_id AND l.customer_id = r.customer_id AND l.currency = r.currency
  WHERE r.business_id = NEW.business_id AND r.id = NEW.reservation_id AND l.id = NEW.credit_entry_id
    AND l.amount_minor > 0 AND (l.expires_at_ms IS NULL OR l.expires_at_ms >= r.expires_at_ms)
) BEGIN SELECT RAISE(ABORT,'BENEFITS_POINT_HOLD_SCOPE'); END;
CREATE TRIGGER benefit_point_allocation_scope BEFORE INSERT ON commerce_benefit_point_allocations
WHEN NOT EXISTS (
  SELECT 1 FROM commerce_benefit_point_ledger c JOIN commerce_benefit_point_ledger d
  ON d.business_id = c.business_id AND d.customer_id = c.customer_id AND d.currency = c.currency
  WHERE c.business_id = NEW.business_id AND c.id = NEW.credit_entry_id AND d.id = NEW.debit_entry_id
    AND c.amount_minor > 0 AND d.amount_minor < 0
    AND NEW.amount_minor <= c.amount_minor - COALESCE((SELECT SUM(a.amount_minor) FROM commerce_benefit_point_allocations a
      WHERE a.business_id = c.business_id AND a.credit_entry_id = c.id),0)
) BEGIN SELECT RAISE(ABORT,'BENEFITS_POINT_ALLOCATION_SCOPE'); END;

CREATE TABLE commerce_benefit_snapshots (
  business_id TEXT NOT NULL,
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version = 1),
  reservation_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('sale','commerce_order','table_order')),
  source_id TEXT NOT NULL,
  context_json TEXT NOT NULL CHECK (json_valid(context_json)),
  rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
  receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,source_kind,source_id),
  UNIQUE (business_id,reservation_id),
  FOREIGN KEY (business_id,reservation_id) REFERENCES commerce_benefit_reservations(business_id,id)
);
CREATE TABLE commerce_benefit_coupon_redemptions (
  business_id TEXT NOT NULL,
  id TEXT NOT NULL,
  code_id TEXT NOT NULL,
  customer_id TEXT NULL REFERENCES customers(id),
  reservation_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,code_id,reservation_id),
  FOREIGN KEY (business_id,code_id) REFERENCES commerce_benefit_coupon_codes(business_id,id),
  FOREIGN KEY (business_id,reservation_id) REFERENCES commerce_benefit_reservations(business_id,id),
  FOREIGN KEY (business_id,snapshot_id) REFERENCES commerce_benefit_snapshots(business_id,id)
);
CREATE INDEX idx_benefit_coupon_usage ON commerce_benefit_coupon_redemptions(business_id,code_id,customer_id);
CREATE TABLE commerce_benefit_reversals (
  business_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (business_id,snapshot_id),
  FOREIGN KEY (business_id,snapshot_id) REFERENCES commerce_benefit_snapshots(business_id,id)
);

CREATE TRIGGER benefit_rules_no_update BEFORE UPDATE ON commerce_benefit_rules BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_rules_no_delete BEFORE DELETE ON commerce_benefit_rules BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_ledger_no_update BEFORE UPDATE ON commerce_benefit_point_ledger BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_ledger_no_delete BEFORE DELETE ON commerce_benefit_point_ledger BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_allocations_no_update BEFORE UPDATE ON commerce_benefit_point_allocations BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_allocations_no_delete BEFORE DELETE ON commerce_benefit_point_allocations BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_snapshots_no_update BEFORE UPDATE ON commerce_benefit_snapshots BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_snapshots_no_delete BEFORE DELETE ON commerce_benefit_snapshots BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_receipts_no_update BEFORE UPDATE ON commerce_benefit_receipts BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_receipts_no_delete BEFORE DELETE ON commerce_benefit_receipts BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_redemptions_no_update BEFORE UPDATE ON commerce_benefit_coupon_redemptions BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_redemptions_no_delete BEFORE DELETE ON commerce_benefit_coupon_redemptions BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_reversals_no_update BEFORE UPDATE ON commerce_benefit_reversals BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_reversals_no_delete BEFORE DELETE ON commerce_benefit_reversals BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_reservation_immutable BEFORE UPDATE ON commerce_benefit_reservations
WHEN NEW.business_id != OLD.business_id OR NEW.id != OLD.id OR NEW.customer_id IS NOT OLD.customer_id
 OR NEW.source_kind != OLD.source_kind OR NEW.source_id != OLD.source_id OR NEW.currency != OLD.currency
 OR NEW.intent_json != OLD.intent_json OR NEW.context_json != OLD.context_json OR NEW.quote_json != OLD.quote_json
 OR NEW.rules_json != OLD.rules_json OR NEW.points_minor != OLD.points_minor
 OR NEW.created_at_ms != OLD.created_at_ms OR NEW.expires_at_ms != OLD.expires_at_ms
 OR (OLD.status != 'active' AND NOT (OLD.status = 'expired' AND NEW.status = 'released') AND NEW.status != OLD.status)
BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_reservation_no_delete BEFORE DELETE ON commerce_benefit_reservations BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_coupon_holds_no_update BEFORE UPDATE ON commerce_benefit_coupon_holds BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_coupon_holds_no_delete BEFORE DELETE ON commerce_benefit_coupon_holds BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_point_holds_no_update BEFORE UPDATE ON commerce_benefit_point_holds BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_point_holds_no_delete BEFORE DELETE ON commerce_benefit_point_holds BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_point_link_scope BEFORE INSERT ON commerce_benefit_point_ledger
WHEN NEW.linked_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM commerce_benefit_point_ledger l WHERE l.business_id = NEW.business_id
 AND l.id = NEW.linked_entry_id AND l.customer_id = NEW.customer_id AND l.currency = NEW.currency)
BEGIN SELECT RAISE(ABORT,'BENEFITS_POINT_LINK_SCOPE'); END;
CREATE TRIGGER benefit_point_hold_capacity BEFORE INSERT ON commerce_benefit_point_holds
WHEN NEW.amount_minor > (SELECT l.amount_minor
 - COALESCE((SELECT SUM(a.amount_minor) FROM commerce_benefit_point_allocations a WHERE a.business_id = l.business_id AND a.credit_entry_id = l.id),0)
 - COALESCE((SELECT SUM(h.amount_minor) FROM commerce_benefit_point_holds h JOIN commerce_benefit_reservations r ON r.business_id = h.business_id AND r.id = h.reservation_id
   WHERE h.business_id = l.business_id AND h.credit_entry_id = l.id AND r.status = 'active' AND r.expires_at_ms >
     (SELECT created_at_ms FROM commerce_benefit_reservations WHERE business_id = NEW.business_id AND id = NEW.reservation_id)),0)
 FROM commerce_benefit_point_ledger l WHERE l.business_id = NEW.business_id AND l.id = NEW.credit_entry_id)
 OR NEW.amount_minor + COALESCE((SELECT SUM(h.amount_minor) FROM commerce_benefit_point_holds h
 WHERE h.business_id = NEW.business_id AND h.reservation_id = NEW.reservation_id),0) >
 (SELECT points_minor FROM commerce_benefit_reservations WHERE business_id = NEW.business_id AND id = NEW.reservation_id)
BEGIN SELECT RAISE(ABORT,'BENEFITS_POINTS_INSUFFICIENT'); END;
CREATE TRIGGER benefit_point_debit_capacity BEFORE INSERT ON commerce_benefit_point_allocations
WHEN NEW.amount_minor + COALESCE((SELECT SUM(a.amount_minor) FROM commerce_benefit_point_allocations a
 WHERE a.business_id = NEW.business_id AND a.debit_entry_id = NEW.debit_entry_id),0) >
 (SELECT -amount_minor FROM commerce_benefit_point_ledger WHERE business_id = NEW.business_id AND id = NEW.debit_entry_id)
BEGIN SELECT RAISE(ABORT,'BENEFITS_POINT_ALLOCATION_SCOPE'); END;
CREATE TRIGGER benefit_coupon_redemption_scope BEFORE INSERT ON commerce_benefit_coupon_redemptions
WHEN NOT EXISTS (SELECT 1 FROM commerce_benefit_reservations r JOIN commerce_benefit_coupon_holds h
 ON h.business_id = r.business_id AND h.reservation_id = r.id JOIN commerce_benefit_snapshots s
 ON s.business_id = r.business_id AND s.reservation_id = r.id
 WHERE r.business_id = NEW.business_id AND r.id = NEW.reservation_id AND r.customer_id IS NEW.customer_id
 AND h.code_id = NEW.code_id AND s.id = NEW.snapshot_id)
BEGIN SELECT RAISE(ABORT,'BENEFITS_COUPON_SCOPE'); END;

-- Future Web/Dealer opaque authorization envelope. Phase A exposes no issuer or
-- HTTP consumer. Only the canonical reservation/snapshot can authorize spending.
CREATE TABLE commerce_benefit_checkout_authorizations (
  business_id TEXT NOT NULL,
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version = 1),
  reservation_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('web','web_dealer')),
  customer_id TEXT NULL REFERENCES customers(id),
  principal_hmac TEXT NOT NULL CHECK (length(principal_hmac) = 64),
  token_hmac TEXT NOT NULL CHECK (length(token_hmac) = 64),
  authority_id TEXT NOT NULL,
  authority_revision INTEGER NOT NULL CHECK (authority_revision > 0),
  access_revision INTEGER NOT NULL CHECK (access_revision >= 0),
  quote_hmac TEXT NOT NULL CHECK (length(quote_hmac) = 64),
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms > created_at_ms),
  revoked_at_ms INTEGER NULL,
  consumed_snapshot_id TEXT NULL,
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,token_hmac),
  FOREIGN KEY (business_id,reservation_id) REFERENCES commerce_benefit_reservations(business_id,id),
  FOREIGN KEY (business_id,consumed_snapshot_id) REFERENCES commerce_benefit_snapshots(business_id,id)
);
CREATE INDEX idx_benefit_checkout_authorizations_scope ON commerce_benefit_checkout_authorizations(business_id,customer_id,channel,expires_at_ms);
CREATE TRIGGER benefit_checkout_authorization_scope BEFORE INSERT ON commerce_benefit_checkout_authorizations
WHEN NOT EXISTS (SELECT 1 FROM commerce_benefit_reservations r WHERE r.business_id = NEW.business_id AND r.id = NEW.reservation_id
 AND r.customer_id IS NEW.customer_id AND json_extract(r.intent_json,'$.channel') = NEW.channel
 AND NEW.expires_at_ms <= r.expires_at_ms AND r.status = 'active')
BEGIN SELECT RAISE(ABORT,'BENEFITS_AUTHORIZATION_SCOPE'); END;

-- B1 staff attribution/reason for explicit point maintenance. No customer messages or coupon secrets.
CREATE TABLE commerce_benefit_management_audit (
  business_id TEXT NOT NULL REFERENCES business(id),
  operation_key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  intent_json TEXT NOT NULL CHECK (json_valid(intent_json)),
  note TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (business_id,operation_key)
);
CREATE TRIGGER benefit_management_audit_update BEFORE UPDATE ON commerce_benefit_management_audit
BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;
CREATE TRIGGER benefit_management_audit_delete BEFORE DELETE ON commerce_benefit_management_audit
BEGIN SELECT RAISE(ABORT,'BENEFITS_IMMUTABLE'); END;

-- Common document output P0. Local-only; deliberately absent from public publication.
-- Template revisions are append-only; the domain owner validates the declarative layout.
CREATE TABLE document_print_templates (
  business_id TEXT NOT NULL REFERENCES business(id),
  id TEXT NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
  revision INTEGER NOT NULL CHECK (typeof(revision) = 'integer' AND revision > 0),
  document_kind TEXT NOT NULL CHECK (document_kind IN ('sale_receipt','table_bill','stay_statement','product_label','invoice_copy','credit_statement','shipping_label','kitchen_ticket')),
  layout_json TEXT NOT NULL CHECK (length(CAST(layout_json AS BLOB)) <= 32768 AND json_valid(layout_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (business_id, id, revision),
  CHECK (json_extract(layout_json, '$.unit') IS 'mm10'),
  CHECK (json_type(layout_json, '$.pageWidth') IS 'integer' AND json_extract(layout_json, '$.pageWidth') BETWEEN 200 AND 5000),
  CHECK (json_type(layout_json, '$.pageHeight') IS 'integer' AND json_extract(layout_json, '$.pageHeight') BETWEEN 200 AND 10000),
  CHECK (json_type(layout_json, '$.fields') IS 'array' AND json_array_length(layout_json, '$.fields') <= 100)
);
CREATE TRIGGER document_template_immutable BEFORE UPDATE ON document_print_templates
BEGIN SELECT RAISE(ABORT, 'DOCUMENT_TEMPLATE_IMMUTABLE'); END;

CREATE TRIGGER document_template_layout_guard BEFORE INSERT ON document_print_templates
BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(NEW.layout_json) WHERE key NOT IN ('unit','pageWidth','pageHeight','fields','lineBlock','scan'))
    OR json_type(NEW.layout_json, '$.lineBlock') IS NULL OR json_type(NEW.layout_json, '$.scan') IS NULL
    THEN RAISE(ABORT, 'DOCUMENT_TEMPLATE_INVALID') END;
  SELECT CASE WHEN json_type(NEW.layout_json, '$.lineBlock') <> 'null' AND (
    json_type(NEW.layout_json, '$.lineBlock') <> 'object'
    OR json_type(NEW.layout_json, '$.lineBlock.y') IS NOT 'integer'
    OR json_type(NEW.layout_json, '$.lineBlock.rowHeight') IS NOT 'integer'
    OR json_type(NEW.layout_json, '$.lineBlock.maxRows') IS NOT 'integer'
    OR json_extract(NEW.layout_json, '$.lineBlock.y') < 0
    OR json_extract(NEW.layout_json, '$.lineBlock.rowHeight') < 1
    OR json_extract(NEW.layout_json, '$.lineBlock.maxRows') NOT BETWEEN 1 AND 200
    OR json_extract(NEW.layout_json, '$.lineBlock.y') + json_extract(NEW.layout_json, '$.lineBlock.rowHeight') * json_extract(NEW.layout_json, '$.lineBlock.maxRows') > json_extract(NEW.layout_json, '$.pageHeight')
    OR json_type(NEW.layout_json, '$.lineBlock.fields') IS NOT 'array'
    OR json_array_length(NEW.layout_json, '$.lineBlock.fields') > 100
    OR EXISTS (SELECT 1 FROM json_each(NEW.layout_json, '$.lineBlock') WHERE key NOT IN ('y','rowHeight','maxRows','fields')))
    THEN RAISE(ABORT, 'DOCUMENT_TEMPLATE_INVALID') END;
  SELECT CASE WHEN json_type(NEW.layout_json, '$.scan') <> 'null' AND (
    json_type(NEW.layout_json, '$.scan') <> 'object'
    OR json_type(NEW.layout_json, '$.scan.originalImageRef') IS NOT 'text'
    OR length(json_extract(NEW.layout_json, '$.scan.originalImageRef')) NOT BETWEEN 1 AND 128
    OR json_extract(NEW.layout_json, '$.scan.originalImageRef') GLOB '*[^a-zA-Z0-9_-]*'
    OR json_type(NEW.layout_json, '$.scan.processedImageRef') IS NULL
    OR (json_type(NEW.layout_json, '$.scan.processedImageRef') <> 'null' AND (
      json_type(NEW.layout_json, '$.scan.processedImageRef') <> 'text'
      OR length(json_extract(NEW.layout_json, '$.scan.processedImageRef')) NOT BETWEEN 1 AND 128
      OR json_extract(NEW.layout_json, '$.scan.processedImageRef') GLOB '*[^a-zA-Z0-9_-]*'))
    OR json_type(NEW.layout_json, '$.scan.foreground') NOT IN ('true','false')
    OR json_type(NEW.layout_json, '$.scan.foreground') IS NULL
    OR EXISTS (SELECT 1 FROM json_each(NEW.layout_json, '$.scan') WHERE key NOT IN ('originalImageRef','processedImageRef','foreground')))
    THEN RAISE(ABORT, 'DOCUMENT_TEMPLATE_INVALID') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(NEW.layout_json, '$.fields') f WHERE
    json_type(f.value) <> 'object' OR json_type(f.value, '$.binding') IS NOT 'text' OR json_extract(f.value, '$.binding') NOT IN ('business.name','business.address','business.phone','document.number','document.date','customer.name','totals.total','totals.currency','product.barcode')
    OR json_type(f.value, '$.x') IS NOT 'integer' OR json_extract(f.value, '$.x') < 0
    OR json_type(f.value, '$.y') IS NOT 'integer' OR json_extract(f.value, '$.y') < 0
    OR json_type(f.value, '$.width') IS NOT 'integer' OR json_extract(f.value, '$.width') < 1
    OR json_type(f.value, '$.height') IS NOT 'integer' OR json_extract(f.value, '$.height') < 1
    OR json_extract(f.value, '$.x') + json_extract(f.value, '$.width') > json_extract(NEW.layout_json, '$.pageWidth')
    OR json_extract(f.value, '$.y') + json_extract(f.value, '$.height') > json_extract(NEW.layout_json, '$.pageHeight')
    OR EXISTS (SELECT 1 FROM json_each(f.value) WHERE key NOT IN ('binding','x','y','width','height')))
    THEN RAISE(ABORT, 'DOCUMENT_TEMPLATE_INVALID') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(NEW.layout_json, '$.lineBlock.fields') f WHERE
    json_type(f.value) <> 'object' OR json_type(f.value, '$.binding') IS NOT 'text' OR json_extract(f.value, '$.binding') NOT IN ('business.name','business.address','business.phone','document.number','document.date','customer.name','totals.total','totals.currency','product.barcode', 'line.description','line.quantity','line.price','line.total')
    OR json_type(f.value, '$.x') IS NOT 'integer' OR json_extract(f.value, '$.x') < 0
    OR json_type(f.value, '$.y') IS NOT 'integer' OR json_extract(f.value, '$.y') < 0
    OR json_type(f.value, '$.width') IS NOT 'integer' OR json_extract(f.value, '$.width') < 1
    OR json_type(f.value, '$.height') IS NOT 'integer' OR json_extract(f.value, '$.height') < 1
    OR json_extract(f.value, '$.x') + json_extract(f.value, '$.width') > json_extract(NEW.layout_json, '$.pageWidth')
    OR json_extract(f.value, '$.y') + json_extract(f.value, '$.height') > json_extract(NEW.layout_json, '$.lineBlock.rowHeight')
    OR EXISTS (SELECT 1 FROM json_each(f.value) WHERE key NOT IN ('binding','x','y','width','height')))
    THEN RAISE(ABORT, 'DOCUMENT_TEMPLATE_INVALID') END;
END;

CREATE TABLE document_output_rules (
  business_id TEXT NOT NULL REFERENCES business(id),
  document_kind TEXT NOT NULL CHECK (document_kind IN ('sale_receipt','table_bill','stay_statement','product_label','invoice_copy','credit_statement','shipping_label','kitchen_ticket')),
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('sale_completed','table_closed','stay_checked_out','order_dispatched','shipment_created','customer_statement_requested','order_created','manual')),
  channel TEXT NOT NULL CHECK (channel IN ('print','email','whatsapp')),
  mode TEXT NOT NULL CHECK (mode IN ('OFF','ASK_CONFIRMATION','AUTOMATIC')),
  adapter TEXT NOT NULL CHECK (adapter IN ('native_print','smtp','whatsapp_webview','whatsapp_business_api')),
  PRIMARY KEY (business_id, document_kind, trigger_kind, channel),
  CHECK ((channel = 'print' AND adapter = 'native_print') OR (channel = 'email' AND adapter = 'smtp') OR (channel = 'whatsapp' AND adapter IN ('whatsapp_webview','whatsapp_business_api'))),
  CHECK (mode <> 'AUTOMATIC' OR adapter <> 'whatsapp_webview'),
  CHECK (trigger_kind = 'manual' OR (document_kind = 'sale_receipt' AND trigger_kind = 'sale_completed') OR (document_kind = 'table_bill' AND trigger_kind = 'table_closed') OR (document_kind = 'stay_statement' AND trigger_kind = 'stay_checked_out') OR (document_kind = 'credit_statement' AND trigger_kind = 'customer_statement_requested') OR (document_kind = 'shipping_label' AND trigger_kind IN ('order_dispatched','shipment_created')) OR (document_kind = 'kitchen_ticket' AND trigger_kind = 'order_created'))
);
CREATE TABLE document_printer_bindings (
  business_id TEXT NOT NULL REFERENCES business(id),
  installation_id TEXT NOT NULL CHECK (length(installation_id) BETWEEN 1 AND 128),
  id TEXT NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
  printer_ref TEXT NOT NULL CHECK (length(printer_ref) BETWEEN 1 AND 256),
  PRIMARY KEY (business_id, installation_id, id)
);
CREATE TABLE document_output_jobs (
  business_id TEXT NOT NULL REFERENCES business(id),
  id TEXT NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
  installation_id TEXT NOT NULL CHECK (length(installation_id) BETWEEN 1 AND 128),
  source_id TEXT NOT NULL CHECK (length(source_id) BETWEEN 1 AND 128),
  operation_id TEXT NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 128),
  command_kind TEXT NOT NULL CHECK (command_kind IN ('event','manual')),
  reprint_of TEXT,
  document_kind TEXT NOT NULL CHECK (document_kind IN ('sale_receipt','table_bill','stay_statement','product_label','invoice_copy','credit_statement','shipping_label','kitchen_ticket')),
  trigger_kind TEXT NOT NULL,
  channel TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('ASK_CONFIRMATION','AUTOMATIC')),
  adapter TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_revision INTEGER NOT NULL,
  layout_snapshot_json TEXT NOT NULL CHECK (json_valid(layout_snapshot_json) AND length(CAST(layout_snapshot_json AS BLOB)) <= 32768),
  copies INTEGER NOT NULL CHECK (typeof(copies) = 'integer' AND copies BETWEEN 1 AND 100),
  printer_binding_id TEXT,
  legal_meaning TEXT NOT NULL DEFAULT 'non_fiscal_copy' CHECK (legal_meaning = 'non_fiscal_copy'),
  state TEXT NOT NULL CHECK (state IN ('queued','awaiting-confirmation','sending','accepted','failed','unknown')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (business_id, id),
  UNIQUE (business_id, operation_id, source_id, trigger_kind, channel, document_kind),
  FOREIGN KEY (business_id, template_id, template_revision) REFERENCES document_print_templates(business_id, id, revision),
  FOREIGN KEY (business_id, installation_id, printer_binding_id) REFERENCES document_printer_bindings(business_id, installation_id, id),
  FOREIGN KEY (business_id, reprint_of) REFERENCES document_output_jobs(business_id, id),
  CHECK (command_kind = 'manual' OR (reprint_of IS NULL AND trigger_kind <> 'manual')),
  CHECK (channel = 'print' OR printer_binding_id IS NULL),
  CHECK (channel <> 'print' OR printer_binding_id IS NOT NULL),
  CHECK (reprint_of IS NULL OR reprint_of <> id)
);
-- One event per source/trigger/channel, including replays with a changed operation ID.
-- Manual commands deliberately do not participate; new command IDs permit reprints.
CREATE UNIQUE INDEX document_output_event_once ON document_output_jobs(business_id, source_id, document_kind, trigger_kind, channel) WHERE command_kind = 'event';
CREATE INDEX document_output_pending ON document_output_jobs(business_id, installation_id, state);
CREATE TRIGGER document_job_create_guard BEFORE INSERT ON document_output_jobs
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM document_output_rules r WHERE r.business_id = NEW.business_id AND r.document_kind = NEW.document_kind AND r.trigger_kind = NEW.trigger_kind AND r.channel = NEW.channel AND r.mode = NEW.mode AND r.adapter = NEW.adapter AND r.mode <> 'OFF') THEN RAISE(ABORT, 'DOCUMENT_RULE_DISABLED') END;
  SELECT CASE WHEN NEW.state <> CASE NEW.mode WHEN 'AUTOMATIC' THEN 'queued' ELSE 'awaiting-confirmation' END THEN RAISE(ABORT, 'DOCUMENT_INITIAL_STATE') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM document_print_templates t WHERE t.business_id = NEW.business_id AND t.id = NEW.template_id AND t.revision = NEW.template_revision AND t.document_kind = NEW.document_kind AND t.layout_json = NEW.layout_snapshot_json) THEN RAISE(ABORT, 'DOCUMENT_SNAPSHOT_INVALID') END;
  SELECT CASE WHEN NEW.reprint_of IS NOT NULL AND NOT EXISTS (SELECT 1 FROM document_output_jobs j WHERE j.business_id = NEW.business_id AND j.id = NEW.reprint_of AND j.source_id = NEW.source_id AND j.document_kind = NEW.document_kind AND j.channel = NEW.channel) THEN RAISE(ABORT, 'DOCUMENT_REPRINT_LINEAGE') END;
END;
CREATE TRIGGER document_job_capability_insert BEFORE INSERT ON document_output_jobs
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = NEW.business_id AND capability_id = 'document.printing' AND is_enabled = 1) OR
    (NEW.document_kind <> 'invoice_copy' AND NOT EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = NEW.business_id AND capability_id = CASE NEW.document_kind WHEN 'sale_receipt' THEN 'commerce.sales' WHEN 'table_bill' THEN 'food_service.orders' WHEN 'stay_statement' THEN 'accommodation.stays' WHEN 'product_label' THEN 'retail.labels' WHEN 'credit_statement' THEN 'commerce.customer_credit' WHEN 'shipping_label' THEN 'commerce.orders' WHEN 'kitchen_ticket' THEN 'food_service.orders' END AND is_enabled = 1)) OR
    (NEW.channel = 'whatsapp' AND NOT EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = NEW.business_id AND capability_id = 'service.whatsapp' AND is_enabled = 1))
    THEN RAISE(ABORT, 'DOCUMENT_CAPABILITY_DISABLED') END;
END;
CREATE TRIGGER document_job_state_guard BEFORE UPDATE ON document_output_jobs
BEGIN
  SELECT CASE WHEN NEW.business_id IS NOT OLD.business_id OR NEW.id IS NOT OLD.id OR NEW.installation_id IS NOT OLD.installation_id OR NEW.source_id IS NOT OLD.source_id OR NEW.operation_id IS NOT OLD.operation_id OR NEW.command_kind IS NOT OLD.command_kind OR NEW.reprint_of IS NOT OLD.reprint_of OR NEW.document_kind IS NOT OLD.document_kind OR NEW.trigger_kind IS NOT OLD.trigger_kind OR NEW.channel IS NOT OLD.channel OR NEW.mode IS NOT OLD.mode OR NEW.adapter IS NOT OLD.adapter OR NEW.template_id IS NOT OLD.template_id OR NEW.template_revision IS NOT OLD.template_revision OR NEW.layout_snapshot_json IS NOT OLD.layout_snapshot_json OR NEW.copies IS NOT OLD.copies OR NEW.printer_binding_id IS NOT OLD.printer_binding_id OR NEW.legal_meaning IS NOT OLD.legal_meaning OR NEW.created_at IS NOT OLD.created_at THEN RAISE(ABORT, 'DOCUMENT_JOB_IMMUTABLE') END;
  SELECT CASE WHEN NOT ((OLD.state = 'awaiting-confirmation' AND NEW.state = 'queued') OR (OLD.state = 'queued' AND NEW.state = 'sending') OR (OLD.state = 'sending' AND NEW.state IN ('accepted','failed','unknown'))) THEN RAISE(ABORT, 'DOCUMENT_STATE_TRANSITION') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = NEW.business_id AND capability_id = 'document.printing' AND is_enabled = 1) AND NEW.state IN ('queued','sending') THEN RAISE(ABORT, 'DOCUMENT_CAPABILITY_DISABLED') END;
  SELECT CASE WHEN NEW.state IN ('queued','sending') AND (NOT EXISTS (SELECT 1 FROM document_output_rules r WHERE r.business_id = NEW.business_id AND r.document_kind = NEW.document_kind AND r.trigger_kind = NEW.trigger_kind AND r.channel = NEW.channel AND r.mode = NEW.mode AND r.adapter = NEW.adapter) OR
    (NEW.document_kind <> 'invoice_copy' AND NOT EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = NEW.business_id AND capability_id = CASE NEW.document_kind WHEN 'sale_receipt' THEN 'commerce.sales' WHEN 'table_bill' THEN 'food_service.orders' WHEN 'stay_statement' THEN 'accommodation.stays' WHEN 'product_label' THEN 'retail.labels' WHEN 'credit_statement' THEN 'commerce.customer_credit' WHEN 'shipping_label' THEN 'commerce.orders' WHEN 'kitchen_ticket' THEN 'food_service.orders' END AND is_enabled = 1)) OR
    (NEW.channel = 'whatsapp' AND NOT EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = NEW.business_id AND capability_id = 'service.whatsapp' AND is_enabled = 1))) THEN RAISE(ABORT, 'DOCUMENT_EXECUTION_DISABLED') END;
END;
CREATE TRIGGER document_job_no_delete BEFORE DELETE ON document_output_jobs
BEGIN SELECT RAISE(ABORT, 'DOCUMENT_JOB_IMMUTABLE'); END;
CREATE TABLE document_output_render_snapshots (
  business_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND length(CAST(payload_json AS BLOB)) <= 262144),
  PRIMARY KEY (business_id, job_id),
  FOREIGN KEY (business_id, job_id) REFERENCES document_output_jobs(business_id, id)
);
CREATE TRIGGER document_render_snapshot_parent BEFORE INSERT ON document_output_render_snapshots
BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM document_output_render_snapshots s WHERE s.business_id = NEW.business_id AND s.job_id = NEW.job_id) THEN RAISE(ABORT, 'DOCUMENT_SNAPSHOT_IMMUTABLE') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM document_output_jobs j WHERE j.business_id = NEW.business_id AND j.installation_id = NEW.installation_id AND j.id = NEW.job_id AND j.legal_meaning = 'non_fiscal_copy') THEN RAISE(ABORT, 'DOCUMENT_SNAPSHOT_JOB_MISSING') END;
END;
CREATE TRIGGER document_render_snapshot_no_update BEFORE UPDATE ON document_output_render_snapshots
BEGIN SELECT RAISE(ABORT, 'DOCUMENT_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER document_render_snapshot_no_delete BEFORE DELETE ON document_output_render_snapshots
BEGIN SELECT RAISE(ABORT, 'DOCUMENT_SNAPSHOT_IMMUTABLE'); END;
CREATE TABLE document_output_snapshot_images (
  business_id TEXT NOT NULL, installation_id TEXT NOT NULL, job_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('original','processed')),
  image_ref TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  bytes BLOB NOT NULL CHECK (typeof(bytes) = 'blob' AND length(bytes) BETWEEN 1 AND 12582912),
  PRIMARY KEY (business_id, job_id, role),
  FOREIGN KEY (business_id, job_id) REFERENCES document_output_render_snapshots(business_id, job_id)
);
CREATE TRIGGER document_snapshot_image_parent BEFORE INSERT ON document_output_snapshot_images
BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM document_output_snapshot_images WHERE business_id=NEW.business_id AND job_id=NEW.job_id AND role=NEW.role) THEN RAISE(ABORT, 'DOCUMENT_IMAGE_IMMUTABLE') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM document_output_render_snapshots WHERE business_id=NEW.business_id AND installation_id=NEW.installation_id AND job_id=NEW.job_id) THEN RAISE(ABORT, 'DOCUMENT_SNAPSHOT_JOB_MISSING') END;
END;
CREATE TRIGGER document_snapshot_image_no_update BEFORE UPDATE ON document_output_snapshot_images
BEGIN SELECT RAISE(ABORT, 'DOCUMENT_IMAGE_IMMUTABLE'); END;
CREATE TRIGGER document_snapshot_image_no_delete BEFORE DELETE ON document_output_snapshot_images
BEGIN SELECT RAISE(ABORT, 'DOCUMENT_IMAGE_IMMUTABLE'); END;
CREATE TRIGGER document_template_no_delete BEFORE DELETE ON document_print_templates
BEGIN SELECT RAISE(ABORT, 'DOCUMENT_TEMPLATE_IMMUTABLE'); END;
CREATE TRIGGER document_binding_immutable BEFORE UPDATE ON document_printer_bindings
BEGIN SELECT RAISE(ABORT, 'DOCUMENT_BINDING_IMMUTABLE'); END;

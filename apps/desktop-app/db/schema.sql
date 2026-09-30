-- Yardımcı Asistan current clean-install desktop schema.
-- Historical database upgrades are intentionally unsupported; reset to this schema.

-- TABLES

CREATE TABLE ai_service_profiles (
  service TEXT PRIMARY KEY,
  project_name TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  model_options_json TEXT NOT NULL DEFAULT '[]',
  timeout_seconds INTEGER NOT NULL DEFAULT 30,
  api_key_encrypted TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE android_action_receipts (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  device_id TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE android_devices (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL DEFAULT '',
  app_version TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
);

CREATE TABLE business_public_profile (
  business_id TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
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
  purchase_price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  unit TEXT NOT NULL DEFAULT 'piece',
  tax_rate REAL NOT NULL DEFAULT 0,
  track_inventory INTEGER NOT NULL DEFAULT 1 CHECK (track_inventory IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
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
  deleted_at TEXT NOT NULL DEFAULT ''
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
  tags_json TEXT NOT NULL DEFAULT '[]',
  last_contact_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
, birthday_message_enabled INTEGER NOT NULL DEFAULT 1 CHECK (birthday_message_enabled IN (0, 1)), identity_type TEXT NOT NULL DEFAULT ''
  CHECK (identity_type IN ('', 'tc_identity_card', 'passport', 'other')), identity_number TEXT NOT NULL DEFAULT '', nationality TEXT NOT NULL DEFAULT '', birth_date TEXT NOT NULL DEFAULT '', gender TEXT NOT NULL DEFAULT ''
  CHECK (gender IN ('', 'female', 'male', 'unspecified')), document_serial_number TEXT NOT NULL DEFAULT '', document_expiry_date TEXT NOT NULL DEFAULT '', birth_place TEXT NOT NULL DEFAULT '', mother_name TEXT NOT NULL DEFAULT '', father_name TEXT NOT NULL DEFAULT '', issuing_authority TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', business_id TEXT REFERENCES business(id));

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
  minimum_quantity REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (product_id, location_id)
);

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
  product_id TEXT NOT NULL,
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

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  image_url TEXT NOT NULL DEFAULT '',
  is_available INTEGER NOT NULL DEFAULT 1,
  is_featured INTEGER NOT NULL DEFAULT 0,
  allergens_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
, stock_quantity REAL NULL
  CHECK (stock_quantity IS NULL OR stock_quantity >= 0), stock_min_quantity REAL NULL
  CHECK (stock_min_quantity IS NULL OR stock_min_quantity >= 0), hide_when_out_of_stock INTEGER NOT NULL DEFAULT 0
  CHECK (hide_when_out_of_stock IN (0, 1)), stock_note TEXT NULL, stock_unit TEXT NOT NULL DEFAULT 'piece'
  CHECK (stock_unit IN ('piece', 'gram')), stock_consumption_quantity REAL NOT NULL DEFAULT 1
  CHECK (stock_consumption_quantity > 0));

CREATE TABLE "menu_stock_movements" (
  id TEXT PRIMARY KEY,
  menu_item_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'add', 'remove', 'set', 'adjust', 'image_import_add',
    'order_add', 'order_update', 'order_remove', 'order_cancel'
  )),
  quantity_change REAL NOT NULL,
  quantity_before REAL NOT NULL CHECK (quantity_before >= 0),
  quantity_after REAL NOT NULL CHECK (quantity_after >= 0),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'desktop', 'android', 'table_order', 'stock_image_import'
  )),
  source_id TEXT NULL,
  actor_source TEXT NOT NULL CHECK (actor_source IN ('desktop', 'android')),
  actor_device_id TEXT NULL,
  note TEXT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  related_type TEXT NOT NULL DEFAULT '',
  related_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unread',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
);

CREATE TABLE pension_payments (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  stay_id TEXT NOT NULL DEFAULT '',
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
  menu_item_id TEXT NOT NULL DEFAULT '',
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
  second_factor_secret_encrypted TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE settings (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  web_module_url TEXT NOT NULL DEFAULT '',
  sync_secret TEXT NOT NULL DEFAULT '',
  auto_sync_enabled INTEGER NOT NULL DEFAULT 1 CHECK (auto_sync_enabled IN (0, 1)),
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
  matched_menu_item_id TEXT NULL,
  suggested_quantity INTEGER NULL CHECK (suggested_quantity IS NULL OR suggested_quantity > 0),
  approved_quantity INTEGER NULL CHECK (approved_quantity IS NULL OR approved_quantity > 0),
  source_quantity_text TEXT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'ignored', 'needs_review')),
  note TEXT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (import_id) REFERENCES stock_image_imports(import_id) ON DELETE CASCADE,
  FOREIGN KEY (matched_menu_item_id) REFERENCES menu_items(id)
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
  job_type TEXT NOT NULL CHECK (job_type IN ('menu_publish', 'android_snapshot')),
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

CREATE TABLE sync_records (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_attempt_at TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'local_only'
);

CREATE TABLE sync_runtime (
  id TEXT PRIMARY KEY,
  request_cursor INTEGER NOT NULL DEFAULT 0,
  acknowledged_cursor INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT NOT NULL DEFAULT '',
  last_success_at TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Local database identity, independent of business/setup data. Populated by initialize().
CREATE TABLE desktop_sync_identity (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  client_id TEXT NOT NULL UNIQUE CHECK (length(trim(client_id)) > 0)
);

CREATE TABLE table_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  line_total REAL NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'preparing', 'served', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'TRY'
  CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  FOREIGN KEY (order_id) REFERENCES table_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
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
  ('android_snapshot', 'android_snapshot', 1, 0, '', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO sync_outbox_revisions (job_key, source_revision, updated_at)
VALUES
  ('menu', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('android_snapshot', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

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

CREATE INDEX idx_menu_stock_movements_item_created
  ON menu_stock_movements(menu_item_id, created_at DESC);

CREATE INDEX idx_menu_stock_movements_report_created_source
  ON menu_stock_movements(created_at, source_type);

CREATE INDEX idx_menu_stock_movements_source
  ON menu_stock_movements(source_type, source_id, created_at DESC);

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

CREATE INDEX idx_table_order_items_menu_item_id
  ON table_order_items(menu_item_id);

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

CREATE TRIGGER trg_customer_credit_payment_finance_insert
AFTER INSERT ON customer_credit_entries WHEN NEW.entry_type = 'payment'
BEGIN
  INSERT INTO finance_entries (
    id, direction, amount_minor, currency, payment_method, category, description,
    occurred_at, source_type, source_id, note, created_at, updated_at, deleted_at, sync_status
  ) VALUES (
    'finance_credit_' || NEW.id, 'income', NEW.amount_minor, NEW.currency,
    NEW.payment_method, 'other_income', 'Veresiye tahsilatı', NEW.occurred_at,
    'customer_credit_payment', NEW.id, NEW.note, NEW.created_at, NEW.updated_at, '', 'local_only'
  );
END;

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

CREATE TRIGGER trg_paid_table_order_finance_insert
AFTER INSERT ON table_orders
WHEN NEW.status = 'paid'
  AND NEW.total > 0
  AND NOT EXISTS (
    SELECT 1
    FROM room_folio_table_order_transfers
    WHERE table_order_id = NEW.id
  )
BEGIN
  INSERT OR IGNORE INTO finance_entries (
    id, direction, amount_minor, currency, payment_method, category, description,
    occurred_at, source_type, source_id, note, created_at, updated_at, sync_status
  ) VALUES (
    'finance_restaurant_' || NEW.id,
    'income',
    CAST(ROUND(NEW.total * 100) AS INTEGER),
    COALESCE((SELECT currency FROM table_order_items WHERE order_id = NEW.id LIMIT 1), 'TRY'),
    'unspecified',
    'restaurant',
    'Restoran adisyonu',
    COALESCE(NULLIF(NEW.closed_at, ''), NEW.updated_at),
    'restaurant_order',
    NEW.id,
    NEW.note,
    NEW.created_at,
    NEW.updated_at,
    'local_only'
  );
END;

CREATE TRIGGER trg_paid_table_order_finance_update
AFTER UPDATE OF status, total, closed_at, note, updated_at ON table_orders
WHEN NEW.status = 'paid'
  AND NEW.total > 0
  AND NOT EXISTS (
    SELECT 1
    FROM room_folio_table_order_transfers
    WHERE table_order_id = NEW.id
  )
BEGIN
  INSERT INTO finance_entries (
    id, direction, amount_minor, currency, payment_method, category, description,
    occurred_at, source_type, source_id, note, created_at, updated_at, sync_status
  ) VALUES (
    'finance_restaurant_' || NEW.id,
    'income',
    CAST(ROUND(NEW.total * 100) AS INTEGER),
    COALESCE((SELECT currency FROM table_order_items WHERE order_id = NEW.id LIMIT 1), 'TRY'),
    'unspecified',
    'restaurant',
    'Restoran adisyonu',
    COALESCE(NULLIF(NEW.closed_at, ''), NEW.updated_at),
    'restaurant_order',
    NEW.id,
    NEW.note,
    NEW.created_at,
    NEW.updated_at,
    'local_only'
  )
  ON CONFLICT(source_type, source_id) WHERE source_id != '' DO UPDATE SET
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    occurred_at = excluded.occurred_at,
    note = excluded.note,
    updated_at = excluded.updated_at,
    deleted_at = '';
END;

CREATE TRIGGER trg_pension_payment_finance_insert
AFTER INSERT ON pension_payments
WHEN NEW.deleted_at = ''
BEGIN
  INSERT INTO finance_entries (
    id,
    direction,
    amount_minor,
    currency,
    payment_method,
    category,
    description,
    occurred_at,
    source_type,
    source_id,
    note,
    created_at,
    updated_at,
    deleted_at,
    sync_status
  ) VALUES (
    'finance_pension_' || NEW.id,
    'income',
    NEW.amount_minor,
    NEW.currency,
    NEW.payment_method,
    'pension',
    'Pansiyon ödemesi',
    NEW.paid_at,
    'pension_payment',
    NEW.id,
    NEW.note,
    NEW.created_at,
    NEW.updated_at,
    '',
    'local_only'
  )
  ON CONFLICT(source_type, source_id) WHERE source_id != '' DO UPDATE SET
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    payment_method = excluded.payment_method,
    occurred_at = excluded.occurred_at,
    note = excluded.note,
    updated_at = excluded.updated_at,
    deleted_at = '';
END;

CREATE TRIGGER trg_pension_payment_finance_update
AFTER UPDATE ON pension_payments
BEGIN
  INSERT INTO finance_entries (
    id,
    direction,
    amount_minor,
    currency,
    payment_method,
    category,
    description,
    occurred_at,
    source_type,
    source_id,
    note,
    created_at,
    updated_at,
    deleted_at,
    sync_status
  ) VALUES (
    'finance_pension_' || NEW.id,
    'income',
    NEW.amount_minor,
    NEW.currency,
    NEW.payment_method,
    'pension',
    'Pansiyon ödemesi',
    NEW.paid_at,
    'pension_payment',
    NEW.id,
    NEW.note,
    NEW.created_at,
    NEW.updated_at,
    NEW.deleted_at,
    'local_only'
  )
  ON CONFLICT(source_type, source_id) WHERE source_id != '' DO UPDATE SET
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    payment_method = excluded.payment_method,
    occurred_at = excluded.occurred_at,
    note = excluded.note,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER trg_pension_payment_remaining_guard
BEFORE INSERT ON pension_payments
WHEN NEW.deleted_at = ''
BEGIN
  SELECT CASE
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

CREATE TRIGGER trg_room_folio_payment_finance_insert
AFTER INSERT ON room_folio_payments
WHEN NEW.deleted_at = '' AND NEW.origin = 'direct'
BEGIN
  INSERT INTO finance_entries (
    id, direction, amount_minor, currency, payment_method, category, description,
    occurred_at, source_type, source_id, note, created_at, updated_at, deleted_at, sync_status
  ) VALUES (
    'finance_room_folio_' || NEW.id,
    'income', NEW.amount_minor, NEW.currency, NEW.payment_method, 'pension', 'Oda tahsilatı',
    NEW.paid_at, 'room_folio_payment', NEW.id, NEW.note,
    NEW.created_at, NEW.updated_at, '', 'local_only'
  )
  ON CONFLICT(source_type, source_id) WHERE source_id != '' DO UPDATE SET
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    payment_method = excluded.payment_method,
    occurred_at = excluded.occurred_at,
    note = excluded.note,
    updated_at = excluded.updated_at,
    deleted_at = '';
END;

CREATE TRIGGER trg_room_folio_payment_finance_update
AFTER UPDATE ON room_folio_payments
WHEN NEW.origin = 'direct'
BEGIN
  INSERT INTO finance_entries (
    id, direction, amount_minor, currency, payment_method, category, description,
    occurred_at, source_type, source_id, note, created_at, updated_at, deleted_at, sync_status
  ) VALUES (
    'finance_room_folio_' || NEW.id,
    'income', NEW.amount_minor, NEW.currency, NEW.payment_method, 'pension', 'Oda tahsilatı',
    NEW.paid_at, 'room_folio_payment', NEW.id, NEW.note,
    NEW.created_at, NEW.updated_at, NEW.deleted_at, 'local_only'
  )
  ON CONFLICT(source_type, source_id) WHERE source_id != '' DO UPDATE SET
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    payment_method = excluded.payment_method,
    occurred_at = excluded.occurred_at,
    note = excluded.note,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;
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

CREATE TRIGGER trg_sync_menu_items_insert
AFTER INSERT ON menu_items WHEN NEW.sync_status != 'synced'
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

CREATE TRIGGER trg_sync_menu_items_update
AFTER UPDATE ON menu_items WHEN NEW.sync_status != 'synced'
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

CREATE TRIGGER trg_unpaid_table_order_finance_update
AFTER UPDATE OF status, updated_at ON table_orders
WHEN OLD.status = 'paid' AND NEW.status != 'paid'
BEGIN
  UPDATE finance_entries
  SET deleted_at = NEW.updated_at, updated_at = NEW.updated_at
  WHERE source_type = 'restaurant_order'
    AND source_id = NEW.id;
END;

CREATE TRIGGER trg_zero_paid_table_order_finance_update
AFTER UPDATE OF status, total, updated_at ON table_orders
WHEN NEW.status = 'paid' AND NEW.total <= 0
BEGIN
  UPDATE finance_entries
  SET deleted_at = NEW.updated_at, updated_at = NEW.updated_at
  WHERE source_type = 'restaurant_order' AND source_id = NEW.id;
END;

-- BEGIN HOSPITALITY GUEST SCHEMA
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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  provider TEXT NOT NULL DEFAULT '',
  provider_reference TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_hospitality_notifications_pending ON hospitality_notifications(stay_id, status);

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
BEGIN
  INSERT INTO hospitality_notifications (id, guest_id, stay_id, room_id, kind, occurred_at, identity_snapshot, created_at)
  SELECT lower(hex(randomblob(16))), NEW.id, NEW.stay_id, s.room_id, 'arrival', NEW.checked_in_at,
    json_object('customerId', c.id, 'fullName', c.full_name, 'identityType', c.identity_type,
      'identityNumber', c.identity_number, 'nationality', c.nationality, 'birthDate', c.birth_date,
      'documentSerialNumber', c.document_serial_number, 'roomNumber', r.number), NEW.updated_at
  FROM customers c JOIN customer_room_stays s ON s.id = NEW.stay_id JOIN rooms r ON r.id = s.room_id WHERE c.id = NEW.customer_id;
END;

CREATE TRIGGER trg_stay_guest_notification AFTER UPDATE OF status ON stay_guests
WHEN OLD.status != NEW.status AND NEW.status IN ('checked_in', 'checked_out')
BEGIN
  INSERT INTO hospitality_notifications (id, guest_id, stay_id, room_id, kind, occurred_at, identity_snapshot, created_at)
  SELECT lower(hex(randomblob(16))), NEW.id, NEW.stay_id, s.room_id,
    CASE NEW.status WHEN 'checked_in' THEN 'arrival' ELSE 'departure' END,
    CASE NEW.status WHEN 'checked_in' THEN NEW.checked_in_at ELSE NEW.checked_out_at END,
    json_object('customerId', c.id, 'fullName', c.full_name, 'identityType', c.identity_type,
      'identityNumber', c.identity_number, 'nationality', c.nationality, 'birthDate', c.birth_date,
      'documentSerialNumber', c.document_serial_number, 'roomNumber', r.number), NEW.updated_at
  FROM customers c JOIN customer_room_stays s ON s.id = NEW.stay_id JOIN rooms r ON r.id = s.room_id WHERE c.id = NEW.customer_id;
END;
CREATE TRIGGER trg_customer_pending_hospitality_identity
AFTER UPDATE OF full_name, identity_type, identity_number, nationality, birth_date, document_serial_number ON customers
BEGIN
  UPDATE hospitality_notifications
  SET identity_snapshot = json_patch(identity_snapshot,
    json_object('fullName', NEW.full_name, 'identityType', NEW.identity_type,
      'identityNumber', NEW.identity_number, 'nationality', NEW.nationality,
      'birthDate', NEW.birth_date, 'documentSerialNumber', NEW.document_serial_number))
  WHERE status != 'sent' AND guest_id IN (SELECT id FROM stay_guests WHERE customer_id = NEW.id);
END;
-- END HOSPITALITY GUEST SCHEMA

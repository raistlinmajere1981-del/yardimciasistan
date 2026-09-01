-- Yardımcı Asistan tanıtım kurulumu için küçük ve tekrar üretilebilir kaynak envanteri.
-- Operasyon geçmişi özellikle eklenmez. Müşteri talebi, rezervasyon, adisyon ve
-- günlük işlemler tanıtım sırasında gerçek uygulama akışından oluşur.
-- Menü görselleri boş başlar; gerçek kullanıcı akışını test etmek için uygulama
-- içinden sonradan seçilip web modülüne yayınlanır.

INSERT OR IGNORE INTO business (
  id, name, display_name, business_type, phone, whatsapp, email, address, modules_json, created_at, updated_at
) VALUES (
  'business_showcase_001',
  'yardimci-asistan-tanitim',
  'Yardımcı Asistan Tanıtım İşletmesi',
  'pension_restaurant',
  '+905000000000',
  '+905000000000',
  'tanitim@yardimciasistan.local',
  'Tanıtım kurulumu',
  '{"rooms":true,"tables":true,"qr_menu":true,"ai":true,"whatsapp":true,"android":true}',
  '2026-09-01T12:00:00+03:00',
  '2026-09-01T12:00:00+03:00'
);

INSERT OR IGNORE INTO settings (
  id, business_id, web_module_url, sync_secret, ai_enabled, whatsapp_enabled, whatsapp_mode,
  android_enabled, rooms_enabled, tables_enabled, qr_menu_enabled, setup_completed, created_at, updated_at
) VALUES (
  'settings_showcase_001',
  'business_showcase_001',
  'https://yardimciasistan.alwaysdata.net/yardimci-asistan',
  '112233445566',
  0,
  1,
  'webview',
  1,
  1,
  1,
  1,
  1,
  '2026-09-01T12:00:00+03:00',
  '2026-09-01T12:00:00+03:00'
);

INSERT OR IGNORE INTO rooms (
  id, name, number, capacity, bed_info, floor, status, features_json, description, price_note,
  is_active, sort_order, created_at, updated_at
) VALUES
  ('showcase_room_101', 'Standart Oda', '101', 2, '1 çift kişilik yatak', 'Zemin Kat', 'available', '["Klima","Özel banyo","Wi-Fi"]', 'İki kişilik standart tanıtım odası.', '', 1, 1, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_room_102', 'Balkonlu Oda', '102', 2, '1 çift kişilik yatak', '1. Kat', 'available', '["Balkon","Klima","Wi-Fi"]', 'Balkonlu iki kişilik tanıtım odası.', '', 1, 2, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_room_103', 'Aile Odası', '103', 4, '1 çift kişilik + 2 tek kişilik yatak', '1. Kat', 'cleaning', '["Klima","Mini buzdolabı","Wi-Fi"]', 'Aile konaklaması örneği.', '', 1, 3, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_room_201', 'Manzaralı Oda', '201', 2, '1 çift kişilik yatak', '2. Kat', 'available', '["Balkon","Manzara","Klima","Wi-Fi"]', 'Üst kat oda örneği.', '', 1, 4, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_room_202', 'Bakım Odası', '202', 2, '2 tek kişilik yatak', '2. Kat', 'maintenance', '["Klima","Wi-Fi"]', 'Bakım durumunun gösterimi için ayrılmış oda.', '', 1, 5, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00');

INSERT OR IGNORE INTO tables (
  id, name, area, capacity, status, notes, is_active, sort_order, created_at, updated_at
) VALUES
  ('showcase_table_01', 'Salon 1', 'Salon', 2, 'available', '', 1, 1, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_table_02', 'Salon 2', 'Salon', 4, 'available', '', 1, 2, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_table_03', 'Salon 3', 'Salon', 4, 'available', '', 1, 3, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_table_04', 'Bahçe 1', 'Bahçe', 4, 'available', '', 1, 4, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_table_05', 'Bahçe 2', 'Bahçe', 6, 'available', '', 1, 5, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_table_06', 'Teras 1', 'Teras', 2, 'available', '', 1, 6, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00');

INSERT OR IGNORE INTO menu_categories (
  id, name, description, is_active, sort_order, created_at, updated_at
) VALUES
  ('showcase_cat_breakfast', 'Kahvaltı', 'Kahvaltı ürünleri.', 1, 10, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_cat_food', 'Yemekler', 'Günlük yemek ve atıştırmalıklar.', 1, 20, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_cat_drinks', 'İçecekler', 'Sıcak ve soğuk içecekler.', 1, 30, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00');

INSERT OR IGNORE INTO menu_items (
  id, category_id, name, description, price, currency, image_url, is_available, is_featured,
  allergens_json, tags_json, sort_order, stock_quantity, stock_min_quantity, hide_when_out_of_stock,
  stock_note, stock_unit, stock_consumption_quantity, created_at, updated_at
) VALUES
  ('showcase_item_01', 'showcase_cat_breakfast', 'Kahvaltı Tabağı', 'Peynir, zeytin, söğüş ve yumurta.', 320, 'TRY', '', 1, 1, '["süt","yumurta"]', '["kahvaltı"]', 10, 12, 4, 0, 'Tanıtım stoğu', 'piece', 1, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_item_02', 'showcase_cat_breakfast', 'Menemen', 'Domates, biber ve yumurta.', 240, 'TRY', '', 1, 0, '["yumurta"]', '["sıcak"]', 20, 9, 3, 0, 'Tanıtım stoğu', 'piece', 1, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_item_03', 'showcase_cat_breakfast', 'Tost', 'Kaşarlı tost.', 180, 'TRY', '', 1, 0, '["gluten","süt"]', '["hızlı"]', 30, 18, 5, 0, 'Tanıtım stoğu', 'piece', 1, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_item_04', 'showcase_cat_food', 'Izgara Tavuk', 'Salata eşliğinde ızgara tavuk.', 390, 'TRY', '', 1, 1, '[]', '["ana yemek"]', 10, 7, 3, 0, 'Tanıtım stoğu', 'piece', 1, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_item_05', 'showcase_cat_food', 'Mevsim Salata', 'Günlük mevsim yeşillikleri.', 190, 'TRY', '', 1, 0, '[]', '["vejetaryen"]', 20, 14, 4, 0, 'Tanıtım stoğu', 'piece', 1, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_item_06', 'showcase_cat_food', 'Patates Tabağı', 'Baharatlı patates kızartması.', 170, 'TRY', '', 1, 0, '[]', '["atıştırmalık"]', 30, 20, 5, 0, 'Tanıtım stoğu', 'piece', 1, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_item_07', 'showcase_cat_drinks', 'Türk Kahvesi', 'Geleneksel Türk kahvesi.', 110, 'TRY', '', 1, 1, '[]', '["sıcak"]', 10, 30, 8, 0, 'Tanıtım stoğu', 'piece', 1, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_item_08', 'showcase_cat_drinks', 'Limonata', 'Ev yapımı limonata.', 125, 'TRY', '', 1, 0, '[]', '["soğuk"]', 20, 16, 5, 0, 'Tanıtım stoğu', 'piece', 1, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00'),
  ('showcase_item_09', 'showcase_cat_drinks', 'Su', 'Şişe su.', 45, 'TRY', '', 1, 0, '[]', '["soğuk"]', 30, 40, 10, 0, 'Tanıtım stoğu', 'piece', 1, '2026-09-01T12:00:00+03:00', '2026-09-01T12:00:00+03:00');

-- Ürün sitesi canlı sistem panelini gerçek Android snapshot hattından okur.
-- Tanıtım profiline bu sanal cihazı önceden ekleyerek site açılır açılmaz
-- operasyon özetini göstermesini sağlarız; gerçek telefon onay akışı değişmez.
INSERT OR IGNORE INTO android_devices (
  id, device_id, device_name, app_version, role, is_active, permissions_json,
  first_seen_at, last_seen_at, created_at, updated_at, revoked_at
) VALUES (
  'android_showcase_web_console',
  'web-showcase-console',
  'Yardımcı Asistan Tanıtım Sitesi',
  'web-showcase-1',
  'admin',
  1,
  '[]',
  '2026-09-01T12:00:00+03:00',
  '2026-09-01T12:00:00+03:00',
  '2026-09-01T12:00:00+03:00',
  '2026-09-01T12:00:00+03:00',
  NULL
);

INSERT OR IGNORE INTO business (
  id, name, display_name, business_type, phone, whatsapp, email, address, modules_json, created_at, updated_at
) VALUES (
  'business_demo_001',
  'deniz-cicegi',
  'Deniz Çiçeği Pansiyon & Kafe',
  'pension_restaurant',
  '+905321234567',
  '+905321234567',
  'merhaba@denizcicegi.example',
  'Sahil Yolu No: 18, Akyaka / Muğla',
  '{"rooms":true,"tables":true,"qr_menu":true,"ai":true,"whatsapp":true,"android":true}',
  '2026-07-10T10:00:00+03:00',
  '2026-07-10T10:00:00+03:00'
);

INSERT OR IGNORE INTO settings (
  id, business_id, web_module_url, sync_secret, ai_enabled, whatsapp_enabled, whatsapp_mode,
  android_enabled, rooms_enabled, tables_enabled, qr_menu_enabled, created_at, updated_at
) VALUES (
  'settings_demo_001',
  'business_demo_001',
  'http://127.0.0.1:8080',
  'change-this-secret',
  1,
  1,
  'webview',
  1,
  1,
  1,
  1,
  '2026-07-10T10:00:00+03:00',
  '2026-07-10T10:00:00+03:00'
);

INSERT OR IGNORE INTO rooms (
  id, name, number, capacity, bed_info, floor, status, features_json, description, sort_order, created_at, updated_at
) VALUES
  ('room_101', 'Balkonlu Standart Oda', '101', 2, '1 çift kişilik yatak', '1. Kat', 'available', '["Klima","Balkon","Duş","Wi-Fi"]', 'Kısa konaklamalar için ferah ve sakin oda.', 1, '2026-07-10T10:00:00+03:00', '2026-07-10T10:00:00+03:00'),
  ('room_102', 'Aile Odası', '102', 4, '1 çift kişilik yatak + 2 tek kişilik yatak', '1. Kat', 'reserved', '["Klima","Ek yatak","Duş","Mini dolap"]', 'Çocuklu aileler için geniş kullanım alanı.', 2, '2026-07-10T10:00:00+03:00', '2026-07-10T10:00:00+03:00');

INSERT OR IGNORE INTO tables (
  id, name, area, capacity, status, sort_order, created_at, updated_at
) VALUES
  ('table_001', 'Bahçe Masası 1', 'Bahçe', 4, 'available', 1, '2026-07-10T10:00:00+03:00', '2026-07-10T10:00:00+03:00'),
  ('table_002', 'Salon Masası 1', 'Salon', 2, 'reserved', 2, '2026-07-10T10:00:00+03:00', '2026-07-10T10:00:00+03:00');

INSERT OR IGNORE INTO menu_categories (
  id, name, description, is_active, sort_order, created_at, updated_at
) VALUES
  ('cat_breakfast', 'Kahvaltı', 'Sabah servisi için hazırlanan tabaklar ve sıcaklar.', 1, 10, '2026-07-10T10:00:00+03:00', '2026-07-10T10:00:00+03:00'),
  ('cat_drinks', 'İçecekler', 'Kahve, çay ve serin içecekler.', 1, 20, '2026-07-10T10:00:00+03:00', '2026-07-10T10:00:00+03:00'),
  ('cat_food', 'Hafif Lezzetler', 'Gün boyu servis edilen pratik tabaklar.', 1, 30, '2026-07-10T10:00:00+03:00', '2026-07-10T10:00:00+03:00');

INSERT OR IGNORE INTO menu_items (
  id, category_id, name, description, price, currency, image_url, is_available, is_featured,
  allergens_json, tags_json, sort_order, created_at, updated_at
) VALUES
  ('item_breakfast_001', 'cat_breakfast', 'Serpme Kahvaltı', 'Yöresel peynirler, zeytin, bal-kaymak, sıcak lezzetler ve sınırsız çay.', 450, 'TRY', '/assets/menu-breakfast.webp', 1, 1, '["gluten","süt","yumurta"]', '["popüler","kahvaltı"]', 10, '2026-07-10T10:00:00+03:00', '2026-07-10T10:00:00+03:00'),
  ('item_breakfast_002', 'cat_breakfast', 'Menemen', 'Domates, biber ve yumurtayla tavada servis edilir.', 180, 'TRY', '', 1, 0, '["yumurta"]', '["sıcak"]', 20, '2026-07-10T10:00:00+03:00', '2026-07-10T10:00:00+03:00'),
  ('item_drink_001', 'cat_drinks', 'Türk Kahvesi', 'Yanında küçük ikramla servis edilir.', 90, 'TRY', '', 1, 0, '[]', '["kahve"]', 10, '2026-07-10T10:00:00+03:00', '2026-07-10T10:00:00+03:00'),
  ('item_drink_002', 'cat_drinks', 'Ev Limonatası', 'Taze limon, nane ve hafif şekerle hazırlanır.', 120, 'TRY', '', 1, 1, '[]', '["soğuk","ferah"]', 20, '2026-07-10T10:00:00+03:00', '2026-07-10T10:00:00+03:00'),
  ('item_food_001', 'cat_food', 'Günün Tostu', 'Kaşar, domates ve mevsim yeşillikleriyle.', 180, 'TRY', '', 1, 0, '["gluten","süt"]', '["hızlı"]', 10, '2026-07-10T10:00:00+03:00', '2026-07-10T10:00:00+03:00');

INSERT OR IGNORE INTO customers (
  id, full_name, phone, email, source, notes, tags_json, last_contact_at, created_at, updated_at
) VALUES (
  'customer_demo_001',
  'Demo Misafir',
  '+905321234567',
  '',
  'web_form',
  'Balkonlu oda sordu.',
  '["pansiyon","demo"]',
  '',
  '2026-07-10T14:30:00+03:00',
  '2026-07-10T14:30:00+03:00'
);

INSERT OR IGNORE INTO requests (
  id, customer_id, source, request_type, status, customer_name, customer_phone, date_text,
  start_date, end_date, time, guest_count, adult_count, child_count, message, ai_summary,
  ai_suggested_reply, whatsapp_message, assigned_to, priority, created_at, updated_at, sync_status
) VALUES (
  'request_demo_001',
  'customer_demo_001',
  'web_form',
  'pension_reservation',
  'new',
  'Demo Misafir',
  '+905321234567',
  '12-14 Temmuz',
  '2026-07-12',
  '2026-07-14',
  '',
  3,
  2,
  1,
  'Balkonlu oda varsa bilgi almak istiyorum.',
  '2 yetişkin 1 çocuk için balkonlu oda soruldu.',
  'Merhaba, talebiniz için teşekkür ederiz. Müsaitlik ve detayları kontrol edip size dönüş yapacağız.',
  'Merhaba, talebiniz için teşekkür ederiz. Müsaitlik ve detayları kontrol edip size dönüş yapacağız.',
  '',
  'normal',
  '2026-07-10T14:30:00+03:00',
  '2026-07-10T14:30:00+03:00',
  'pending'
);

INSERT OR IGNORE INTO reservations (
  id, request_id, customer_id, reservation_type, status, title, start_date, end_date, time,
  guest_count, adult_count, child_count, room_ids_json, table_ids_json, notes, price_note,
  payment_status, created_at, updated_at
) VALUES
  ('reservation_demo_001', 'request_demo_001', 'customer_demo_001', 'room', 'pending', 'Demo Misafir - 2 gece', '2026-07-12', '2026-07-14', '', 3, 2, 1, '["room_101"]', '[]', 'Balkonlu oda istedi.', 'Fiyat işletme sahibi tarafından verilecek.', 'not_required', '2026-07-10T14:35:00+03:00', '2026-07-10T14:35:00+03:00');

INSERT OR IGNORE INTO daily_tasks (
  id, title, description, task_type, status, due_date, due_time, related_type, related_id, created_at, updated_at
) VALUES
  ('task_demo_001', 'Oda 101 giriş hazırlığı', 'Demo Misafir için giriş hazırlığı.', 'check_in', 'pending', '2026-07-12', '14:00', 'reservation', 'reservation_demo_001', '2026-07-10T14:30:00+03:00', '2026-07-10T14:30:00+03:00'),
  ('task_demo_002', 'Bahçe masa kontrolü', 'Akşam servisi için bahçe masaları kontrol edilecek.', 'table_reservation', 'pending', '2026-07-10', '18:00', 'table', 'table_001', '2026-07-10T14:30:00+03:00', '2026-07-10T14:30:00+03:00');

INSERT OR IGNORE INTO whatsapp_messages (
  id, request_id, customer_id, phone, direction, mode, status, message, prepared_by_ai, created_at, updated_at
) VALUES (
  'wa_msg_demo_001',
  'request_demo_001',
  'customer_demo_001',
  '+905321234567',
  'outgoing',
  'manual_copy',
  'prepared',
  'Merhaba, talebiniz için teşekkür ederiz. Müsaitlik ve detayları kontrol edip size dönüş yapacağız.',
  1,
  '2026-07-10T14:40:00+03:00',
  '2026-07-10T14:40:00+03:00'
);

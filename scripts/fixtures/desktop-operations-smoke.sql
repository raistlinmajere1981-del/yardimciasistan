-- Üretim demo seed'i operasyon kayıtlarını boş bırakır. Bu dosya yalnız
-- masaüstü veritabanı smoke testinin ihtiyaç duyduğu ilişkili kayıtları kurar.

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
) VALUES (
  'reservation_demo_001',
  'request_demo_001',
  'customer_demo_001',
  'room',
  'pending',
  'Demo Misafir - 2 gece',
  '2026-07-12',
  '2026-07-14',
  '',
  3,
  2,
  1,
  '["room_101"]',
  '[]',
  'Balkonlu oda istedi.',
  'Fiyat işletme sahibi tarafından verilecek.',
  'not_required',
  '2026-07-10T14:35:00+03:00',
  '2026-07-10T14:35:00+03:00'
);

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

INSERT OR IGNORE INTO menu_items (
  id, category_id, name, description, price, currency, image_url, is_available, is_featured,
  allergens_json, tags_json, stock_quantity, stock_min_quantity, stock_unit,
  stock_consumption_quantity, hide_when_out_of_stock, stock_note, sort_order,
  created_at, updated_at, sync_status
)
SELECT * FROM (
  SELECT 'item_main_004', 'cat_mains', 'Izgara Çipura', 'Mevsim salatası, roka ve köz limon eşliğinde bütün çipura.', 980, 'TRY', '/assets/menu-grilled-sea-bass.webp', 1, 1, '["balık"]', '["ızgara","deniz ürünü","stok takipli"]', 14, 4, 'piece', 1, 1, 'Bütün balık adedi üzerinden takip edilir.', 40, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00', 'pending'
  UNION ALL SELECT 'item_main_005', 'cat_mains', 'Fırında Alabalık', 'Defne, limon ve mevsim sebzeleriyle fırında pişirilen bütün alabalık.', 820, 'TRY', '/assets/menu-grilled-sea-bass.webp', 1, 0, '["balık"]', '["fırın","deniz ürünü","stok takipli"]', 10, 3, 'piece', 1, 1, 'Bütün balık adedi üzerinden takip edilir.', 50, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00', 'pending'
  UNION ALL SELECT 'item_main_006', 'cat_mains', 'Izgara Kasap Köfte', '200 gram dana kasap köfte, köz sebze ve pilav eşliğinde.', 720, 'TRY', '/assets/menu-main-courses.webp', 1, 1, '["gluten"]', '["ızgara","köfte","stok takipli"]', 6000, 1500, 'gram', 200, 1, 'Bir porsiyonda 200 g köfte kullanılır.', 60, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00', 'pending'
  UNION ALL SELECT 'item_main_007', 'cat_mains', 'Kaşarlı Köfte', '200 gram dana köfte, erimiş kaşar, domates sosu ve patates eşliğinde.', 760, 'TRY', '/assets/menu-main-courses.webp', 1, 0, '["gluten","süt"]', '["ızgara","köfte","stok takipli"]', 4500, 1200, 'gram', 200, 1, 'Bir porsiyonda 200 g köfte kullanılır.', 70, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00', 'pending'
  UNION ALL SELECT 'item_drink_005', 'cat_drinks', 'Şişe Su (330 ml)', 'Soğuk servis edilen 330 ml cam şişe su.', 60, 'TRY', '/assets/menu-drinks.webp', 1, 0, '[]', '["soğuk","şişe","stok takipli"]', 72, 24, 'piece', 1, 1, 'Şişe adedi üzerinden takip edilir.', 50, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00', 'pending'
  UNION ALL SELECT 'item_drink_006', 'cat_drinks', 'Maden Suyu (200 ml)', 'Doğal mineralli 200 ml cam şişe maden suyu.', 80, 'TRY', '/assets/menu-drinks.webp', 1, 0, '[]', '["soğuk","şişe","stok takipli"]', 48, 12, 'piece', 1, 1, 'Şişe adedi üzerinden takip edilir.', 60, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00', 'pending'
  UNION ALL SELECT 'item_drink_007', 'cat_drinks', 'Kutu Kola (330 ml)', 'Soğuk servis edilen 330 ml kutu kola.', 120, 'TRY', '/assets/menu-drinks.webp', 1, 0, '[]', '["soğuk","kutu","stok takipli"]', 36, 12, 'piece', 1, 1, 'Kutu adedi üzerinden takip edilir.', 70, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00', 'pending'
  UNION ALL SELECT 'item_drink_008', 'cat_drinks', 'Portakallı Gazoz (250 ml)', 'Portakal aromalı 250 ml cam şişe gazoz.', 110, 'TRY', '/assets/menu-drinks.webp', 1, 0, '[]', '["soğuk","şişe","stok takipli"]', 24, 8, 'piece', 1, 1, 'Şişe adedi üzerinden takip edilir.', 80, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00', 'pending'
  UNION ALL SELECT 'item_drink_009', 'cat_drinks', 'Şişe Ayran (300 ml)', 'Soğuk servis edilen 300 ml şişe ayran.', 100, 'TRY', '/assets/menu-drinks.webp', 1, 0, '["süt"]', '["soğuk","şişe","stok takipli"]', 30, 10, 'piece', 1, 1, 'Şişe adedi üzerinden takip edilir.', 90, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00', 'pending'
)
WHERE EXISTS (SELECT 1 FROM business WHERE id = 'business_demo_001')
  AND EXISTS (SELECT 1 FROM menu_categories WHERE id = 'cat_mains' AND deleted_at = '')
  AND EXISTS (SELECT 1 FROM menu_categories WHERE id = 'cat_drinks' AND deleted_at = '');

UPDATE menu_items
SET stock_quantity = 12,
  stock_min_quantity = 4,
  stock_unit = 'piece',
  stock_consumption_quantity = 1,
  hide_when_out_of_stock = 1,
  stock_note = 'Bütün balık adedi üzerinden takip edilir.',
  updated_at = '2026-07-22T09:00:00+03:00',
  sync_status = 'pending'
WHERE id = 'item_main_001'
  AND stock_quantity IS NULL
  AND EXISTS (SELECT 1 FROM business WHERE id = 'business_demo_001');

-- Temiz kurulumda yalnız işletmenin kalıcı kaynak envanteri oluşturulur.
-- Müşteri, talep, rezervasyon, görev, mesaj ve adisyon gibi operasyon kayıtları
-- özellikle seed edilmez; uygulama ilk açılışta temiz bir çalışma alanı sunar.

INSERT OR IGNORE INTO business (
  id, name, display_name, profile_id, phone, whatsapp, email, address, created_at, updated_at
) VALUES (
  'business_demo_001',
  'deniz-cicegi',
  'Deniz Çiçeği Pansiyon & Kafe',
  'pension_restaurant',
  '+905316969334',
  '+905316969334',
  'merhaba@denizcicegi.example',
  'Sahil Yolu No: 18, Akyaka / Muğla',
  '2026-07-22T09:00:00+03:00',
  '2026-07-22T09:00:00+03:00'
);

INSERT OR IGNORE INTO settings (
  id, business_id, web_module_url, sync_secret, auto_sync_enabled, ai_provider, ai_service,
  whatsapp_mode, setup_completed, created_at, updated_at
) VALUES (
  'settings_demo_001',
  'business_demo_001',
  'https://yardimciasistan.alwaysdata.net/yardimci-asistan',
  'change-this-secret',
  1,
  'openai_compatible',
  'openai',
  'webview',
  1,
  '2026-07-22T09:00:00+03:00',
  '2026-07-22T09:00:00+03:00'
);

WITH capabilities(capability_id) AS (VALUES
  ('core.customers'), ('core.tasks'), ('core.calendar'), ('core.notifications'), ('core.finance'),
  ('core.reports'), ('core.web'), ('core.sync'), ('core.backups'), ('core.devices'),
  ('service.whatsapp'), ('service.ai'), ('service.android'),
  ('accommodation.rooms'), ('accommodation.reservations'), ('accommodation.stays'), ('accommodation.folio'),
  ('food_service.tables'), ('food_service.reservations'), ('food_service.orders'), ('food_service.menu'),
  ('channel.qr_menu'), ('commerce.catalog'), ('commerce.inventory'), ('commerce.sales')
)
INSERT OR IGNORE INTO business_capabilities (business_id, capability_id, is_enabled, source, created_at, updated_at)
SELECT 'business_demo_001', capability_id, 1, 'profile', '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00' FROM capabilities;

INSERT OR IGNORE INTO rooms (
  id, name, number, capacity, bed_info, floor, status, features_json, description, price_note,
  is_active, sort_order, created_at, updated_at
) VALUES
  ('room_101', 'Bahçe Katı Standart Oda', '101', 2, '1 çift kişilik yatak', 'Zemin Kat', 'available', '["Klima","Bahçe çıkışı","Özel banyo","Wi-Fi"]', 'Bahçeye açılan, sakin ve serin standart oda.', 'Kahvaltı dahil fiyat için işletmeye danışın.', 1, 1, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('room_102', 'Balkonlu Standart Oda', '102', 2, '1 çift kişilik yatak', '1. Kat', 'available', '["Klima","Balkon","Özel banyo","Wi-Fi"]', 'Sabah ışığı alan özel balkonlu iki kişilik oda.', 'Kahvaltı dahil fiyat için işletmeye danışın.', 1, 2, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('room_103', 'İkiz Yataklı Oda', '103', 2, '2 tek kişilik yatak', '1. Kat', 'cleaning', '["Klima","Fransız balkon","Özel banyo","Wi-Fi"]', 'Arkadaşlar ve ayrı yatak tercih eden misafirler için.', 'Kahvaltı dahil fiyat için işletmeye danışın.', 1, 3, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('room_104', 'Üç Kişilik Oda', '104', 3, '1 çift kişilik + 1 tek kişilik yatak', '1. Kat', 'available', '["Klima","Balkon","Mini buzdolabı","Wi-Fi"]', 'Üç kişilik konaklamalar için dengeli ve ferah yerleşim.', 'Kahvaltı dahil fiyat için işletmeye danışın.', 1, 4, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('room_105', 'Erişilebilir Bahçe Odası', '105', 2, '1 çift kişilik yatak', 'Zemin Kat', 'available', '["Basamaksız giriş","Geniş kapı","Klima","Wi-Fi"]', 'Basamaksız erişime ve geniş dolaşım alanına sahip oda.', 'Özel ihtiyaçlar için işletmeyle önceden görüşün.', 1, 5, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('room_201', 'Deniz Manzaralı Deluxe Oda', '201', 2, '1 büyük çift kişilik yatak', '2. Kat', 'available', '["Deniz manzarası","Geniş balkon","Klima","Mini buzdolabı","Wi-Fi"]', 'Gökova Körfezi yönüne bakan geniş balkonlu üst kat odası.', 'Kahvaltı dahil fiyat için işletmeye danışın.', 1, 6, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('room_202', 'Aile Odası', '202', 4, '1 çift kişilik + 2 tek kişilik yatak', '2. Kat', 'available', '["Klima","Geniş balkon","Mini buzdolabı","Wi-Fi"]', 'Çocuklu aileler için geniş depolama ve oturma alanı.', 'Kahvaltı dahil fiyat için işletmeye danışın.', 1, 7, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('room_203', 'Çatı Katı Oda', '203', 2, '1 çift kişilik yatak', 'Çatı Katı', 'maintenance', '["Klima","Tavan penceresi","Özel banyo","Wi-Fi"]', 'Ahşap tavanlı, sessiz ve kompakt üst kat odası.', 'Kahvaltı dahil fiyat için işletmeye danışın.', 1, 8, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('room_204', 'Bağlantılı Aile Odası', '204', 5, '1 çift kişilik + 3 tek kişilik yatak', '2. Kat', 'available', '["İki oda","Ara kapı","Klima","İki balkon","Wi-Fi"]', 'Kalabalık aileler için ara kapıyla birleşen iki ayrı bölüm.', 'Kahvaltı dahil fiyat için işletmeye danışın.', 1, 9, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('room_205', 'Ekonomik Tek Kişilik Oda', '205', 1, '1 tek kişilik yatak', '2. Kat', 'available', '["Klima","Özel banyo","Çalışma masası","Wi-Fi"]', 'Tek başına kısa konaklamalar için sade ve işlevsel oda.', 'Kahvaltı dahil fiyat için işletmeye danışın.', 1, 10, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00');

INSERT OR IGNORE INTO tables (
  id, name, area, capacity, status, notes, is_active, sort_order, created_at, updated_at
) VALUES
  ('table_001', 'Bahçe 1', 'Bahçe', 4, 'available', 'Zeytin ağacı yanı.', 1, 1, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('table_002', 'Salon 1', 'Salon', 2, 'available', 'Pencere önü.', 1, 2, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('table_003', 'Bahçe 2', 'Bahçe', 4, 'available', '', 1, 3, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('table_004', 'Bahçe 3', 'Bahçe', 4, 'available', '', 1, 4, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('table_005', 'Bahçe 4', 'Bahçe', 6, 'available', 'Geniş aile masası.', 1, 5, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('table_006', 'Teras 1', 'Teras', 2, 'available', 'Korkuluk yanı.', 1, 6, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('table_007', 'Teras 2', 'Teras', 4, 'available', '', 1, 7, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('table_008', 'Teras 3', 'Teras', 4, 'available', '', 1, 8, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('table_009', 'Salon 2', 'Salon', 2, 'available', '', 1, 9, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('table_010', 'Salon 3', 'Salon', 4, 'available', '', 1, 10, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('table_011', 'Salon 4', 'Salon', 4, 'available', 'Servis bankosuna yakın.', 1, 11, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('table_012', 'Avlu 1', 'Avlu', 2, 'available', 'Sessiz köşe.', 1, 12, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('table_013', 'Avlu 2', 'Avlu', 4, 'available', '', 1, 13, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('table_014', 'Büyük Grup Masası', 'Bahçe', 8, 'available', 'Birleştirilebilir geniş masa.', 1, 14, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00');

INSERT OR IGNORE INTO menu_categories (
  id, name, description, is_active, sort_order, created_at, updated_at
) VALUES
  ('cat_breakfast', 'Kahvaltı', 'Her gün 08:30–11:30 arasında hazırlanan sıcak ve yöresel kahvaltılıklar.', 1, 10, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('cat_meze', 'Ege Başlangıçları', 'Zeytinyağlılar, günlük mezeler ve paylaşmalık tabaklar.', 1, 20, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('cat_mains', 'Ana Yemekler', 'Yerel dokunuşlarla hazırlanan balık, et ve tavuk seçenekleri.', 1, 30, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('cat_light', 'Hafif Lezzetler', 'Gün boyu servis edilen salata, sandviç ve tostlar.', 1, 40, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('cat_dessert', 'Tatlılar', 'Günlük hazırlanan ev yapımı tatlılar.', 1, 50, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('cat_drinks', 'İçecekler', 'Kahve, bitki çayı ve ev yapımı serin içecekler.', 1, 60, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00');

INSERT OR IGNORE INTO menu_items (
  id, category_id, name, description, price, currency, image_url, is_available, is_featured,
  allergens_json, tags_json, sort_order, created_at, updated_at
) VALUES
  ('item_breakfast_001', 'cat_breakfast', 'Serpme Kahvaltı (2 Kişilik)', 'Ege peynirleri, zeytinler, söğüş, ev reçeli, bal-kaymak, yumurta, sıcak pişi ve sınırsız demleme çay.', 1150, 'TRY', '/assets/menu-breakfast-spread.webp', 1, 1, '["gluten","süt","yumurta"]', '["iki kişilik","popüler","yöresel"]', 10, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_breakfast_002', 'cat_breakfast', 'Menemen', 'Domates, köy biberi ve yumurta; bakır tavada sıcak servis edilir.', 420, 'TRY', '/assets/menu-menemen.webp', 1, 0, '["yumurta"]', '["sıcak","vejetaryen"]', 20, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_breakfast_003', 'cat_breakfast', 'Ege Otlu Omlet', 'Maydanoz, dereotu, taze soğan ve keçi peyniriyle üç yumurtalı omlet.', 390, 'TRY', '/assets/menu-menemen.webp', 1, 0, '["yumurta","süt"]', '["vejetaryen","proteinli"]', 30, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_meze_001', 'cat_meze', 'Ege Meze Tabağı', 'Fava, deniz börülcesi, köz biber yoğurtlama, Girit ezmesi ve zeytin.', 480, 'TRY', '/assets/menu-aegean-meze.webp', 1, 1, '["süt","susam"]', '["paylaşmalık","yöresel"]', 10, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_meze_002', 'cat_meze', 'Kabak Çiçeği Dolması', 'Zeytinyağlı, dereotlu ve limonlu pirinç harcıyla günlük hazırlanır.', 360, 'TRY', '/assets/menu-stuffed-zucchini-flowers.webp', 1, 0, '[]', '["vegan","zeytinyağlı"]', 20, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_meze_003', 'cat_meze', 'Girit Ezmesi', 'Ezine peyniri, lor, ceviz, Antep fıstığı ve taze otlar.', 320, 'TRY', '/assets/menu-aegean-meze.webp', 1, 0, '["süt","ceviz","Antep fıstığı"]', '["vejetaryen","paylaşmalık"]', 30, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_main_001', 'cat_mains', 'Izgara Levrek', 'Mevsim salatası, köz limon ve roka eşliğinde bütün levrek.', 950, 'TRY', '/assets/menu-grilled-sea-bass.webp', 1, 1, '["balık"]', '["ızgara","deniz ürünü"]', 10, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_main_002', 'cat_mains', 'Çökertme Kebabı', 'Kibrit patates üzerinde sarımsaklı yoğurt, dana eti ve domates sosu.', 780, 'TRY', '/assets/menu-main-courses.webp', 1, 1, '["süt"]', '["Muğla mutfağı","doyurucu"]', 20, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_main_003', 'cat_mains', 'Otlu Tavuk Şiş', 'Ege otlarıyla marine tavuk, bulgur pilavı ve köz sebzeler.', 650, 'TRY', '/assets/menu-main-courses.webp', 1, 0, '["gluten"]', '["ızgara","proteinli"]', 30, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_main_004', 'cat_mains', 'Izgara Çipura', 'Mevsim salatası, roka ve köz limon eşliğinde bütün çipura.', 980, 'TRY', '/assets/menu-grilled-sea-bass.webp', 1, 1, '["balık"]', '["ızgara","deniz ürünü","stok takipli"]', 40, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_main_005', 'cat_mains', 'Fırında Alabalık', 'Defne, limon ve mevsim sebzeleriyle fırında pişirilen bütün alabalık.', 820, 'TRY', '/assets/menu-grilled-sea-bass.webp', 1, 0, '["balık"]', '["fırın","deniz ürünü","stok takipli"]', 50, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_main_006', 'cat_mains', 'Izgara Kasap Köfte', '200 gram dana kasap köfte, köz sebze ve pilav eşliğinde.', 720, 'TRY', '/assets/menu-main-courses.webp', 1, 1, '["gluten"]', '["ızgara","köfte","stok takipli"]', 60, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_main_007', 'cat_mains', 'Kaşarlı Köfte', '200 gram dana köfte, erimiş kaşar, domates sosu ve patates eşliğinde.', 760, 'TRY', '/assets/menu-main-courses.webp', 1, 0, '["gluten","süt"]', '["ızgara","köfte","stok takipli"]', 70, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_light_001', 'cat_light', 'Izgara Hellimli Mevsim Salatası', 'Mevsim yeşillikleri, domates, salatalık, zeytin ve narenciye sosu.', 490, 'TRY', '/assets/menu-light-bites.webp', 1, 0, '["süt"]', '["vejetaryen","hafif"]', 10, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_light_002', 'cat_light', 'Akyaka Kumrusu', 'Çıtır ekmekte kaşar, domates, biber ve kekikli zeytin ezmesi.', 430, 'TRY', '/assets/menu-light-bites.webp', 1, 1, '["gluten","süt"]', '["vejetaryen","hızlı"]', 20, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_light_003', 'cat_light', 'Köy Ekmeğinde Karışık Tost', 'Kaşar, dana sucuk, domates ve yanında küçük mevsim salatası.', 380, 'TRY', '/assets/menu-light-bites.webp', 1, 0, '["gluten","süt"]', '["hızlı","doyurucu"]', 30, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_dessert_001', 'cat_dessert', 'Limonlu Cheesecake', 'Günlük hazırlanan, ince limon kabuklu ve hafif ekşi cheesecake.', 320, 'TRY', '/assets/menu-desserts.webp', 1, 1, '["gluten","süt","yumurta"]', '["ev yapımı","ferah"]', 10, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_dessert_002', 'cat_dessert', 'Muğla Saraylısı', 'Cevizli ince hamur katları ve dengeli şerbetle geleneksel usulde.', 330, 'TRY', '/assets/menu-desserts.webp', 1, 0, '["gluten","ceviz"]', '["yöresel","şerbetli"]', 20, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_drink_001', 'cat_drinks', 'Türk Kahvesi', 'Orta kavrum kahve; yanında su ve küçük lokumla.', 150, 'TRY', '/assets/menu-drinks.webp', 1, 0, '[]', '["sıcak","kahve"]', 10, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_drink_002', 'cat_drinks', 'Ev Yapımı Naneli Limonata', 'Taze limon, nane ve az şekerle günlük hazırlanır.', 220, 'TRY', '/assets/menu-drinks.webp', 1, 1, '[]', '["soğuk","ev yapımı"]', 20, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_drink_003', 'cat_drinks', 'Soğuk Demleme Kahve', 'On altı saat demlenen yumuşak içimli kahve, buzla servis edilir.', 260, 'TRY', '/assets/menu-drinks.webp', 1, 0, '[]', '["soğuk","kahve"]', 30, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_drink_004', 'cat_drinks', 'Adaçayı', 'Demlikte taze demlenir; yanında limon ve bal seçeneğiyle.', 160, 'TRY', '/assets/menu-drinks.webp', 1, 0, '[]', '["sıcak","bitki çayı"]', 40, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_drink_005', 'cat_drinks', 'Şişe Su (330 ml)', 'Soğuk servis edilen 330 ml cam şişe su.', 60, 'TRY', '/assets/menu-drinks.webp', 1, 0, '[]', '["soğuk","şişe","stok takipli"]', 50, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_drink_006', 'cat_drinks', 'Maden Suyu (200 ml)', 'Doğal mineralli 200 ml cam şişe maden suyu.', 80, 'TRY', '/assets/menu-drinks.webp', 1, 0, '[]', '["soğuk","şişe","stok takipli"]', 60, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_drink_007', 'cat_drinks', 'Kutu Kola (330 ml)', 'Soğuk servis edilen 330 ml kutu kola.', 120, 'TRY', '/assets/menu-drinks.webp', 1, 0, '[]', '["soğuk","kutu","stok takipli"]', 70, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_drink_008', 'cat_drinks', 'Portakallı Gazoz (250 ml)', 'Portakal aromalı 250 ml cam şişe gazoz.', 110, 'TRY', '/assets/menu-drinks.webp', 1, 0, '[]', '["soğuk","şişe","stok takipli"]', 80, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00'),
  ('item_drink_009', 'cat_drinks', 'Şişe Ayran (300 ml)', 'Soğuk servis edilen 300 ml şişe ayran.', 100, 'TRY', '/assets/menu-drinks.webp', 1, 0, '["süt"]', '["soğuk","şişe","stok takipli"]', 90, '2026-07-22T09:00:00+03:00', '2026-07-22T09:00:00+03:00');

UPDATE menu_items
SET stock_quantity = 12, stock_min_quantity = 4, stock_unit = 'piece', stock_consumption_quantity = 1,
  hide_when_out_of_stock = 1, stock_note = 'Bütün balık adedi üzerinden takip edilir.'
WHERE id = 'item_main_001';

UPDATE menu_items
SET stock_quantity = 14, stock_min_quantity = 4, stock_unit = 'piece', stock_consumption_quantity = 1,
  hide_when_out_of_stock = 1, stock_note = 'Bütün balık adedi üzerinden takip edilir.'
WHERE id = 'item_main_004';

UPDATE menu_items
SET stock_quantity = 10, stock_min_quantity = 3, stock_unit = 'piece', stock_consumption_quantity = 1,
  hide_when_out_of_stock = 1, stock_note = 'Bütün balık adedi üzerinden takip edilir.'
WHERE id = 'item_main_005';

UPDATE menu_items
SET stock_quantity = 6000, stock_min_quantity = 1500, stock_unit = 'gram', stock_consumption_quantity = 200,
  hide_when_out_of_stock = 1, stock_note = 'Bir porsiyonda 200 g köfte kullanılır.'
WHERE id = 'item_main_006';

UPDATE menu_items
SET stock_quantity = 4500, stock_min_quantity = 1200, stock_unit = 'gram', stock_consumption_quantity = 200,
  hide_when_out_of_stock = 1, stock_note = 'Bir porsiyonda 200 g köfte kullanılır.'
WHERE id = 'item_main_007';

UPDATE menu_items SET stock_quantity = 72, stock_min_quantity = 24, stock_unit = 'piece', stock_consumption_quantity = 1,
  hide_when_out_of_stock = 1, stock_note = 'Şişe adedi üzerinden takip edilir.' WHERE id = 'item_drink_005';
UPDATE menu_items SET stock_quantity = 48, stock_min_quantity = 12, stock_unit = 'piece', stock_consumption_quantity = 1,
  hide_when_out_of_stock = 1, stock_note = 'Şişe adedi üzerinden takip edilir.' WHERE id = 'item_drink_006';
UPDATE menu_items SET stock_quantity = 36, stock_min_quantity = 12, stock_unit = 'piece', stock_consumption_quantity = 1,
  hide_when_out_of_stock = 1, stock_note = 'Kutu adedi üzerinden takip edilir.' WHERE id = 'item_drink_007';
UPDATE menu_items SET stock_quantity = 24, stock_min_quantity = 8, stock_unit = 'piece', stock_consumption_quantity = 1,
  hide_when_out_of_stock = 1, stock_note = 'Şişe adedi üzerinden takip edilir.' WHERE id = 'item_drink_008';
UPDATE menu_items SET stock_quantity = 30, stock_min_quantity = 10, stock_unit = 'piece', stock_consumption_quantity = 1,
  hide_when_out_of_stock = 1, stock_note = 'Şişe adedi üzerinden takip edilir.' WHERE id = 'item_drink_009';

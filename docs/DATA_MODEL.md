# Yardımcı Asistan — Veri Modeli

Bu doküman Yardımcı Asistan v1 için temel veri yapılarını tanımlar.

Amaç, demo web sitesi, web modülü, firma hosting mini API, masaüstü uygulaması ve Android companion arasında ortak bir veri dili oluşturmaktır.

## Genel Veri Yaklaşımı

Yardımcı Asistan v1 merkezi cloud servisine bağımlı olmayacaktır.

Bu nedenle veriler temel olarak üç yerde bulunabilir:

```text
1. Firma hostingindeki mini API verileri
2. Local PC uygulamasındaki SQLite verileri
3. Android companion uygulamasındaki geçici/cache veriler
```

Ana yönetim verisi PC uygulamasında tutulacaktır.

Web tarafında oluşan müşteri talepleri firma hostinginde saklanacak, PC uygulaması bu talepleri çekecektir.

Android companion sadece gerekli özetleri ve işlem bilgilerini gösterecektir.

Android'den gelen değişiklikler doğrudan PC verisine yazılmaz. Hosting action queue
üzerinden masaüstüne taşınır; masaüstü aynı action kimliğini yalnız bir kez uygular.

## Android Action Queue Modeli

```json
{
  "id": "android_action_001",
  "action_type": "room_status_update",
  "payload": {
    "room_id": "room_001",
    "status": "cleaning",
    "expected_updated_at": "2026-07-17T10:00:00.000Z"
  },
  "created_at": "2026-07-17T10:00:00+03:00",
  "device_id": "android-device-001",
  "status": "pending",
  "error_message": "",
  "processed_at": ""
}
```

`status` değerleri `pending`, `applied` ve `failed` olabilir. Masaüstü başarılı
uygulanan action kimliğini yerel receipt tablosunda saklar; aynı kimlik yeniden gelirse
veriyi ikinci kez değiştirmeden uygulanmış sonucu döndürür.

Android action kimliği ilk ağ çağrısından önce üretilir ve action telefondaki kalıcı
outbox'a alınır. Yanıt alınamayan çağrı aynı kimlik ve payload ile yeniden denenir.
Outbox kaydı normalize endpoint ve sync-secret parmak izini de taşır; farklı firma
bağlantısına otomatik gönderilemez. Çok adımlı action payload'ları
`depends_on_action_id` ile parent receipt'ine bağlanır.
`expected_updated_at` (sipariş satırı ve masa açılışında eşdeğer beklenen sürüm alanları)
yalnız gönderildiğinde kontrol edilir; bu sayede eski kuyruk kayıtları geriye dönük uyumlu
kalırken yeni kayıtlar stale snapshot üzerine yazamaz.

## Android Cihaz ve Yetki Modeli

Android uygulaması ilk açılışta bir kez `device_id` üretir ve uygulama verisinde kalıcı
olarak saklar. Özet istekleri ve action kayıtları ayrıca cihaz adı ile uygulama sürümünü
taşıyabilir. Hosting bu bilgileri yalnız masaüstüne ulaştıran bir görülme kaydı olarak
tutar; rol ve yetki kararı hostingde verilmez.

Masaüstü SQLite kaydı:

```json
{
  "id": "android_device_001",
  "device_id": "android-device-001",
  "device_name": "Samsung SM-A546E",
  "app_version": "0.1.0",
  "role": "staff",
  "is_active": true,
  "permissions_json": "[\"table.view\",\"table_order.open\"]",
  "first_seen_at": "2026-07-18T10:00:00+03:00",
  "last_seen_at": "2026-07-18T10:15:00+03:00",
  "created_at": "2026-07-18T10:00:00+03:00",
  "updated_at": "2026-07-18T10:15:00+03:00",
  "revoked_at": null
}
```

`role` yalnız `admin` veya `staff` olabilir. Bilinmeyen cihaz aktif `staff` profiliyle
oluşturulur. Admin preset'i tüm Android izinlerini, staff preset'i günlük operasyon için
tanımlanan sınırlı izinleri `permissions_json` alanına yazar. Cihaz pasifleştirildiğinde
hiçbir action uygulanmaz. Android snapshot'ındaki `androidPermissions` haritası UI için
etkili profili taşır; güvenlik kontrolü her zaman masaüstü kaydından yeniden yapılır.
`permissions_json` geçersiz veya çözümlenemez durumdaysa masaüstü boş izin kümesi kullanır
ve action'ı reddeder; bozuk güvenlik kaydı staff preset'ine fail-open dönmez.

## Temel Veri Prensipleri

1. Her kayıt benzersiz bir `id` alanına sahip olmalıdır.
2. Her kayıtta `created_at` ve `updated_at` alanları bulunmalıdır.
3. Silme işlemleri mümkünse doğrudan kalıcı silme yerine `deleted_at` veya `is_active` ile yapılmalıdır.
4. Senkronizasyon gereken kayıtlarda `sync_status` alanı bulunmalıdır.
5. Her firma kurulumu kendi verisini bağımsız tutmalıdır.
6. Müşteri tarafına gereksiz işletme içi veri gönderilmemelidir.
7. AI tarafından üretilen bilgiler kesin veri değil, öneri olarak işaretlenmelidir.

---

# 1. Business / Firma Modeli

Firma bilgilerini temsil eder.

## Alanlar

```json
{
  "id": "business_001",
  "name": "Örnek Pansiyon",
  "display_name": "Örnek Pansiyon & Restoran",
  "business_type": "pension_restaurant",
  "logo_url": "/assets/logo.png",
  "primary_color": "#2F6F5E",
  "accent_color": "#F29D52",
  "phone": "+905xxxxxxxxx",
  "whatsapp": "+905xxxxxxxxx",
  "email": "info@example.com",
  "website": "https://example.com",
  "address": "Adres bilgisi",
  "map_url": "https://maps.google.com/...",
  "description": "Kısa firma açıklaması",
  "working_hours": [],
  "modules": {},
  "created_at": "2026-01-01T10:00:00+03:00",
  "updated_at": "2026-01-01T10:00:00+03:00"
}
```

## business_type Değerleri

```text
pension
restaurant
pension_restaurant
cafe
other
```

## modules Örneği

```json
{
  "rooms": true,
  "tables": true,
  "qr_menu": true,
  "ai": true,
  "whatsapp": true,
  "android": true,
  "stock": false,
  "camera": false
}
```

---

# 2. User / Kullanıcı Modeli

PC uygulaması veya ileride admin paneli kullanacak kişileri temsil eder.

v1 için çok karmaşık kullanıcı yetkileri gerekli değildir.

## Alanlar

```json
{
  "id": "user_001",
  "name": "İşletme Sahibi",
  "role": "owner",
  "phone": "+905xxxxxxxxx",
  "email": "owner@example.com",
  "pin_enabled": true,
  "is_active": true,
  "created_at": "2026-01-01T10:00:00+03:00",
  "updated_at": "2026-01-01T10:00:00+03:00"
}
```

## role Değerleri

```text
owner
manager
staff
viewer
```

---

# 3. Customer / Müşteri Modeli

Müşteri bilgilerini temsil eder.

Müşteri kaydı web formundan, AI sohbetinden, WhatsApp destek ekranından veya manuel girişten oluşabilir.

## Alanlar

```json
{
  "id": "customer_001",
  "full_name": "Ahmet Yılmaz",
  "phone": "+905xxxxxxxxx",
  "email": "",
  "source": "web_form",
  "notes": "Deniz manzaralı oda sordu.",
  "tags": ["pansiyon", "yaz sezonu"],
  "last_contact_at": "2026-07-10T14:30:00+03:00",
  "created_at": "2026-07-10T14:30:00+03:00",
  "updated_at": "2026-07-10T14:30:00+03:00"
}
```

## source Değerleri

```text
web_form
web_ai
whatsapp
manual
phone
android
```

---

# 4. Request / Talep Modeli

Web sitesi, AI sohbet, WhatsApp veya manuel giriş üzerinden oluşan müşteri taleplerini temsil eder.

Bu model Yardımcı Asistan’ın en önemli modellerinden biridir.

## Alanlar

```json
{
  "id": "request_001",
  "customer_id": "customer_001",
  "source": "web_form",
  "request_type": "pension_reservation",
  "status": "new",
  "customer_name": "Ahmet Yılmaz",
  "customer_phone": "+905xxxxxxxxx",
  "date_text": "12-14 Temmuz",
  "start_date": "2026-07-12",
  "end_date": "2026-07-14",
  "time": "",
  "guest_count": 3,
  "adult_count": 2,
  "child_count": 1,
  "message": "Deniz manzaralı oda varsa bilgi almak istiyorum.",
  "ai_summary": "Müşteri 12-14 Temmuz için 2 yetişkin 1 çocuk oda sordu.",
  "ai_suggested_reply": "",
  "whatsapp_message": "",
  "assigned_to": "",
  "priority": "normal",
  "sync_status": "pending",
  "created_at": "2026-07-10T14:30:00+03:00",
  "updated_at": "2026-07-10T14:30:00+03:00"
}
```

## request_type Değerleri

```text
general_info
pension_reservation
restaurant_reservation
breakfast_request
qr_menu_question
location_question
price_question
other
```

## status Değerleri

```text
new
seen
waiting_owner
waiting_customer
approved
rejected
answered
converted_to_reservation
cancelled
archived
```

## priority Değerleri

```text
low
normal
high
urgent
```

## sync_status Değerleri

```text
local_only
pending
synced
failed
conflict
```

---

# 5. Reservation / Rezervasyon Modeli

Onaylanmış veya onay bekleyen rezervasyonları temsil eder.

Pansiyon ve restoran rezervasyonları aynı modelde tutulabilir, `reservation_type` alanı ile ayrılır.

## Alanlar

```json
{
  "id": "reservation_001",
  "request_id": "request_001",
  "customer_id": "customer_001",
  "reservation_type": "room",
  "status": "pending",
  "title": "Ahmet Yılmaz - 2 gece",
  "start_date": "2026-07-12",
  "end_date": "2026-07-14",
  "time": "",
  "guest_count": 3,
  "adult_count": 2,
  "child_count": 1,
  "room_ids": ["room_001"],
  "table_ids": [],
  "notes": "Deniz manzaralı oda istedi.",
  "price_note": "Fiyat işletme sahibi tarafından verilecek.",
  "payment_status": "not_required",
  "created_at": "2026-07-10T14:35:00+03:00",
  "updated_at": "2026-07-10T14:35:00+03:00"
}
```

## reservation_type Değerleri

```text
room
table
room_and_table
event
other
```

## status Değerleri

```text
pending
approved
rejected
cancelled
completed
no_show
```

## payment_status Değerleri

```text
not_required
unpaid
partial
paid
refunded
```

---

# 6. Room / Oda Modeli

Pansiyon veya konaklama işletmeleri için oda bilgisini temsil eder.

## Alanlar

```json
{
  "id": "room_001",
  "name": "Oda 1",
  "number": "101",
  "capacity": 2,
  "bed_info": "1 çift kişilik yatak",
  "floor": "1. Kat",
  "status": "available",
  "features": ["banyo", "klima", "deniz manzarası"],
  "description": "2 kişilik standart oda.",
  "price_note": "",
  "is_active": true,
  "sort_order": 1,
  "created_at": "2026-01-01T10:00:00+03:00",
  "updated_at": "2026-01-01T10:00:00+03:00"
}
```

## status Değerleri

```text
available
occupied
reserved
cleaning
maintenance
out_of_service
```

---

# 7. Table / Masa Modeli

Restoran ve kafe işletmeleri için masa bilgisini temsil eder.

## Alanlar

```json
{
  "id": "table_001",
  "name": "Masa 1",
  "area": "Bahçe",
  "capacity": 4,
  "status": "available",
  "current_customer_id": "",
  "current_reservation_id": "",
  "notes": "",
  "is_active": true,
  "sort_order": 1,
  "created_at": "2026-01-01T10:00:00+03:00",
  "updated_at": "2026-01-01T10:00:00+03:00"
}
```

## status Değerleri

```text
available
occupied
reserved
service
waiting_bill
cleaning
out_of_service
```

---

# 8. MenuCategory / Menü Kategorisi Modeli

QR menüde kullanılacak ürün kategorilerini temsil eder.

## Alanlar

```json
{
  "id": "cat_001",
  "name": "Kahvaltı",
  "description": "Kahvaltı ürünleri",
  "is_active": true,
  "sort_order": 1,
  "created_at": "2026-01-01T10:00:00+03:00",
  "updated_at": "2026-01-01T10:00:00+03:00"
}
```

---

# 9. MenuItem / Menü Ürünü Modeli

QR menüde gösterilecek ürünleri temsil eder.

## Alanlar

```json
{
  "id": "item_001",
  "category_id": "cat_001",
  "name": "Serpme Kahvaltı",
  "description": "Yöresel ürünlerle hazırlanan kahvaltı.",
  "price": 450,
  "currency": "TRY",
  "image_url": "",
  "is_available": true,
  "is_featured": false,
  "allergens": [],
  "tags": ["kahvaltı", "yöresel"],
  "sort_order": 1,
  "created_at": "2026-01-01T10:00:00+03:00",
  "updated_at": "2026-01-01T10:00:00+03:00"
}
```

---

# 10. AIKnowledgeFile / AI Bilgi Dosyası Modeli

AI’nin firma hakkında bilgi alacağı markdown dosyalarını temsil eder.

## Dosya Yapısı

```text
knowledge/
  firma.md
  odalar.md
  restoran.md
  menu.md
  sik-sorulan-sorular.md
  rezervasyon-kurallari.md
  ulasim.md
```

## Metadata Alanları

```json
{
  "id": "knowledge_001",
  "title": "Firma Bilgileri",
  "filename": "firma.md",
  "category": "business",
  "is_active": true,
  "last_updated_at": "2026-01-01T10:00:00+03:00"
}
```

## category Değerleri

```text
business
rooms
restaurant
menu
faq
reservation_rules
location
other
```

---

# 11. AIConversation / AI Konuşma Modeli

Web AI veya PC AI ile yapılan konuşmaları temsil eder.

## Alanlar

```json
{
  "id": "ai_conv_001",
  "source": "web_ai",
  "customer_id": "customer_001",
  "request_id": "request_001",
  "status": "open",
  "messages": [],
  "summary": "Müşteri oda müsaitliği sordu.",
  "created_at": "2026-07-10T14:20:00+03:00",
  "updated_at": "2026-07-10T14:30:00+03:00"
}
```

## source Değerleri

```text
web_ai
desktop_ai
android_ai
desktop_workspace:reply
desktop_workspace:summary
desktop_workspace:daily
```

`desktop_workspace:*` kaynakları AI Yardımcı sayfasındaki yerel çalışma geçmişini temsil eder. `messages` alanında çalışma türü, isteğe bağlı ek talimat, düzenlenebilir sonuç, eksik alanlar, kullanılan provider/model ve fallback bilgisi tutulur. `reply` ve `summary` kayıtları bir talebe bağlanabilir; günlük değerlendirme talep bağı olmadan saklanır.

## status Değerleri

```text
open
closed
converted_to_request
archived
```

## Message Örneği

```json
{
  "role": "user",
  "content": "12 Temmuz için odanız var mı?",
  "created_at": "2026-07-10T14:20:00+03:00"
}
```

## role Değerleri

```text
system
user
assistant
owner
tool
```

---

# 12. WhatsAppMessage / WhatsApp Mesaj Modeli

Sistemin hazırladığı veya takip ettiği WhatsApp mesajlarını temsil eder.

V1’de gerçek WhatsApp mesajlarını tam otomatik okumak zorunlu değildir. Öncelik hazır mesaj ve cevap taslağıdır.

## Alanlar

```json
{
  "id": "wa_msg_001",
  "request_id": "request_001",
  "customer_id": "customer_001",
  "phone": "+905xxxxxxxxx",
  "direction": "outgoing",
  "mode": "prepared",
  "status": "prepared",
  "message": "Merhaba, talebiniz için teşekkür ederiz...",
  "prepared_by_ai": true,
  "sent_at": "",
  "created_at": "2026-07-10T14:40:00+03:00",
  "updated_at": "2026-07-10T14:40:00+03:00"
}
```

## direction Değerleri

```text
incoming
outgoing
```

## mode Değerleri

```text
wa_link
manual_copy
webview
official_api
```

## status Değerleri

```text
prepared
opened
sent_by_user
failed
cancelled
```

---

# 13. Notification / Bildirim Modeli

PC ve Android tarafında gösterilecek bildirimleri temsil eder.

## Alanlar

```json
{
  "id": "notification_001",
  "type": "new_request",
  "title": "Yeni müşteri talebi",
  "message": "Ahmet Yılmaz pansiyon rezervasyonu sordu.",
  "related_type": "request",
  "related_id": "request_001",
  "status": "unread",
  "priority": "normal",
  "created_at": "2026-07-10T14:30:00+03:00",
  "read_at": ""
}
```

## type Değerleri

```text
new_request
reservation_pending
reservation_today
room_status
table_status
ai_reply_ready
whatsapp_message_ready
sync_problem
system
```

## status Değerleri

```text
unread
read
archived
```

---

# 14. DailyTask / Günlük İş Modeli

İşletmenin günlük takip kartlarını temsil eder.

## Alanlar

```json
{
  "id": "task_001",
  "title": "Oda 101 giriş hazırlığı",
  "description": "Ahmet Yılmaz bugün giriş yapacak.",
  "task_type": "check_in",
  "status": "pending",
  "due_date": "2026-07-12",
  "due_time": "14:00",
  "related_type": "reservation",
  "related_id": "reservation_001",
  "created_at": "2026-07-10T14:30:00+03:00",
  "updated_at": "2026-07-10T14:30:00+03:00"
}
```

## task_type Değerleri

```text
check_in
check_out
reservation_followup
customer_call
table_reservation
cleaning
maintenance
note
other
```

## status Değerleri

```text
pending
done
cancelled
archived
```

---

# 15. SyncRecord / Senkronizasyon Modeli

PC uygulaması ile firma hosting mini API arasındaki veri aktarımını takip eder.

## Alanlar

```json
{
  "id": "sync_001",
  "entity_type": "request",
  "entity_id": "request_001",
  "direction": "pull",
  "status": "success",
  "last_attempt_at": "2026-07-10T14:30:00+03:00",
  "error_message": "",
  "created_at": "2026-07-10T14:30:00+03:00",
  "updated_at": "2026-07-10T14:30:00+03:00"
}
```

## entity_type Değerleri

```text
request
reservation
menu
business
notification
settings
```

## direction Değerleri

```text
pull
push
two_way
```

## status Değerleri

```text
pending
success
failed
conflict
skipped
```

---

# 16. Settings / Ayarlar Modeli

Firma kurulum ayarlarını temsil eder.

## Alanlar

```json
{
  "id": "settings_001",
  "business_id": "business_001",
  "web_module_url": "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
  "sync_secret": "change-this-secret",
  "ai_enabled": true,
  "ai_provider": "openai_compatible",
  "ai_service": "openrouter",
  "ai_base_url": "https://openrouter.ai/api/v1",
  "ai_model": "provider/model-name",
  "ai_api_key_encrypted": "<opaque-encrypted-value>",
  "ai_timeout_seconds": 30,
  "ai_last_published_at": "2026-01-01T10:00:00+03:00",
  "whatsapp_enabled": true,
  "whatsapp_mode": "webview",
  "android_enabled": true,
  "rooms_enabled": true,
  "tables_enabled": true,
  "qr_menu_enabled": true,
  "created_at": "2026-01-01T10:00:00+03:00",
  "updated_at": "2026-01-01T10:00:00+03:00"
}
```

`ai_provider` kullanılan adapter protokolünü, `ai_service` ise kullanıcıya gösterilen servis hazır ayarını temsil eder. v1 bağlantısı OpenAI uyumlu `chat/completions` protokolünü kullanır; özel servis seçildiğinde bağlantı adresi kullanıcı tarafından girilebilir.

`ai_api_key_encrypted` yalnız masaüstü ana süreç tarafından çözülebilen yerel gizli değerdir. Renderer'a, bootstrap verisine, loglara veya web istemcisine gönderilmez. Hosting tarafına yalnız `sync_secret` ile yetkilendirilmiş HTTPS isteğinde aktarılır ve doğrudan web erişimine kapalı sunucu dosyasında tutulur. API cevapları anahtarın kendisini hiçbir zaman döndürmez.

AI kapalıysa sistemin form, WhatsApp, talep yönetimi ve yerel işletme özellikleri çalışmaya devam eder.

## whatsapp_mode Değerleri

```text
wa_link
manual_copy
webview
official_api
```

---

# 17. Event / Olay Temel Modeli

Sistemdeki önemli işlemler olay olarak kaydedilebilir.

Bu yapı modüller arası iletişimi kolaylaştırır.

## Alanlar

```json
{
  "id": "event_001",
  "type": "request.created",
  "actor_type": "customer",
  "actor_id": "customer_001",
  "entity_type": "request",
  "entity_id": "request_001",
  "payload": {},
  "created_at": "2026-07-10T14:30:00+03:00"
}
```

## Örnek Event Tipleri

```text
request.created
request.seen
request.answered
request.converted_to_reservation
reservation.created
reservation.approved
reservation.cancelled
room.status_changed
table.status_changed
menu.updated
ai.summary_created
ai.reply_suggested
whatsapp.message_prepared
whatsapp.message_opened
sync.completed
sync.failed
```

---

# 18. Hosting Mini API Veri Deposu

Firma hosting mini API çalışma verileri için SQLite kullanır:

```text
data/yardimci-asistan.sqlite
```

Temel tablolar:

```text
sync_meta
web_requests
android_actions
android_device_sightings
publications
publication_receipts
sync_clients
```

`web_requests.seq` talep cursor'udur. `publications` menü ve Android snapshot için
kaynak istemci/revision ile sunucu revision'ını tutar. `publication_receipts`
idempotency anahtarlarının sonucunu, `sync_clients` masaüstü acknowledgement cursor'unu
tutar. Eski JSON dosyaları yalnız ilk açılıştaki migration girdisi ve
`.legacy-backup-v1` güvenlik kopyasıdır; güncel çalışma deposu değildir.

AI konuşma geçmişi `ai-conversations.json`, sunucu AI anahtarı ise doğrudan webden
erişimi engellenmiş `ai-settings.local.php` içinde kalır.

---

# 19. PC SQLite Tablo Önerileri

PC uygulaması için başlangıç SQLite tabloları:

```text
business
settings
customers
requests
reservations
rooms
tables
menu_categories
menu_items
ai_conversations
whatsapp_messages
notifications
daily_tasks
sync_records
sync_runtime
sync_outbox
sync_outbox_revisions
android_devices
events
```

Her tabloda şu alanlar mümkün olduğunca standart olmalıdır:

```text
id
created_at
updated_at
deleted_at
sync_status
```

---

# 20. Veri Öncelik Sırası

İlk geliştirme için veri modelleri öncelik sırası:

```text
1. business
2. settings
3. requests
4. customers
5. reservations
6. rooms
7. tables
8. menu_categories
9. menu_items
10. whatsapp_messages
11. ai_conversations
12. notifications
13. sync_records
14. events
```

---

# 21. Kişisel Veri Notu

Müşteri adı, telefon numarası, notları ve rezervasyon bilgileri kişisel veri sayılabilir.

Bu nedenle:

* Gereksiz veri toplanmamalıdır.
* Veriler açıkça işletme amacıyla kullanılmalıdır.
* Müşteri notlarında hassas bilgiler tutulmamalıdır.
* Yedekler güvenli saklanmalıdır.
* Web formunda kısa bilgilendirme metni gösterilmelidir.

Örnek kısa metin:

```text
Formdaki bilgileriniz talebinize dönüş yapılması amacıyla işletmeye iletilir.
```

---

# 22. v1 İçin Minimum Gerekli Veri Seti

Yardımcı Asistan v1’in ilk çalışan demosu için minimum veri seti:

```text
business
settings
requests
customers
rooms
tables
reservations
menu_categories
menu_items
```

Bunlar tamamlandığında temel sistem çalışabilir.

AI, WhatsApp, Android ve senkronizasyon bu veri setinin üzerine eklenebilir.

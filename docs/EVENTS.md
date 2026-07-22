# Yardımcı Asistan — Event / Olay Sistemi

Bu doküman Yardımcı Asistan v1 içinde oluşacak olayları ve bu olaylara hangi modüllerin nasıl tepki vereceğini tanımlar.

Event sistemi, modüllerin birbirine sıkı bağlı olmadan çalışmasını sağlar.

## Event Sistemi Nedir?

Event, sistemde gerçekleşen önemli bir işlemin kaydıdır.

Örnekler:

```text
Yeni müşteri talebi geldi.
Rezervasyon onaylandı.
Oda durumu değişti.
Masa boşaldı.
AI cevap önerisi hazırladı.
WhatsApp mesajı hazırlandı.
QR menü güncellendi.
```

Bu olaylar sistem tarafından kaydedilir ve ilgili modüller bu olaylara göre işlem yapar.

## Temel Amaç

Yardımcı Asistan modüler bir sistemdir.

Bu nedenle web modülü, PC uygulaması, Android companion, AI sistemi ve WhatsApp Bridge doğrudan birbirine bağımlı olmamalıdır.

Bunun yerine sistemde olaylar oluşur ve ilgili modüller bu olaylara tepki verir.

Örnek:

```text
request.created
  ↓
PC uygulaması yeni talebi gösterir.
Android bildirim gösterir.
AI talebi özetler.
WhatsApp cevap taslağı hazırlanabilir.
```

## Event Temel Modeli

Her event şu temel yapıya sahip olmalıdır:

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

## Alan Açıklamaları

### id

Event kaydının benzersiz kimliğidir.

### type

Olay tipidir.

Örnek:

```text
request.created
reservation.approved
room.status_changed
```

### actor_type

Olayı başlatan tarafı belirtir.

Değerler:

```text
customer
owner
staff
system
ai
web
desktop
android
whatsapp
```

### actor_id

Olayı başlatan kişi veya sistem parçasının id bilgisidir.

Boş olabilir.

### entity_type

Olayın hangi veri türüyle ilgili olduğunu belirtir.

Değerler:

```text
request
reservation
customer
room
table
menu
ai_conversation
whatsapp_message
notification
sync
system
```

### entity_id

İlgili kaydın id bilgisidir.

### payload

Olayla ilgili ek bilgileri taşır.

Örnek:

```json
{
  "old_status": "new",
  "new_status": "seen"
}
```

### created_at

Olayın oluştuğu tarihtir.

---

# 1. Request / Talep Eventleri

Müşteri talepleri sistemin en önemli event kaynaklarından biridir.

## request.created

Yeni müşteri talebi oluşturulduğunda oluşur.

Kaynaklar:

```text
Web form
Web AI
WhatsApp manuel giriş
PC manuel giriş
Android manuel giriş
```

Örnek payload:

```json
{
  "source": "web_form",
  "request_type": "pension_reservation",
  "customer_name": "Ahmet Yılmaz",
  "customer_phone": "+905xxxxxxxxx"
}
```

Tepkiler:

```text
PC uygulaması yeni talebi gösterir.
Android companion bildirim oluşturur.
AI talebi özetleyebilir.
WhatsApp cevap taslağı hazırlanabilir.
```

## request.seen

Talep işletme sahibi veya personel tarafından görüldüğünde oluşur.

Payload:

```json
{
  "seen_by": "user_001"
}
```

Tepkiler:

```text
Talep durumu görüldü olarak işaretlenir.
Android ve PC ekranlarında bildirim sayısı azalır.
```

## request.updated

Talep bilgileri güncellendiğinde oluşur.

Payload:

```json
{
  "changed_fields": ["guest_count", "message"]
}
```

Tepkiler:

```text
PC ve Android ekranları güncellenir.
Gerekirse yeni AI özeti hazırlanır.
```

## request.answered

Talebe dönüş yapıldığında oluşur.

Payload:

```json
{
  "answer_method": "whatsapp",
  "answered_by": "user_001"
}
```

answer_method değerleri:

```text
phone
whatsapp
manual
ai_suggested
other
```

Tepkiler:

```text
Talep cevaplandı olarak işaretlenir.
Günlük işler listesinden düşebilir.
```

## request.converted_to_reservation

Talep rezervasyona dönüştürüldüğünde oluşur.

Payload:

```json
{
  "reservation_id": "reservation_001"
}
```

Tepkiler:

```text
Rezervasyon kaydı oluşturulur.
Talep durumu converted_to_reservation olur.
Oda veya masa uygunluğu güncellenebilir.
```

## request.status_changed

PC uygulamasında talep durumu manuel değiştirildiğinde oluşur.

Payload:

```json
{
  "previous_status": "new",
  "status": "answered"
}
```

Tepkiler:

```text
Talep listesi ve dashboard özeti güncellenir.
WhatsApp veya rezervasyon akışı gerekiyorsa kullanıcı elle devam eder.
```

## request.cancelled

Talep iptal edildiğinde oluşur.

Payload:

```json
{
  "reason": "Müşteri vazgeçti"
}
```

Tepkiler:

```text
Talep iptal durumuna alınır.
İlgili bildirimler pasifleşir.
```

## request.archived

Talep arşivlendiğinde oluşur.

Tepkiler:

```text
Talep aktif listeden çıkar.
Geçmiş kayıt olarak saklanır.
```

## request.deleted

Talep masaüstünden veya yetkili Android yönetici cihazdan silindiğinde oluşur.

```json
{
  "customer_name": "Ahmet Yılmaz",
  "deleted_message_count": 1
}
```

Talep ve bağlı hazırlanmış WhatsApp mesajları `deleted_at` ile görünür veri kümesinden
çıkarılır. Talep kimliği Android snapshot tombstone listesine eklenir.

---

# 2. Reservation / Rezervasyon Eventleri

## reservation.created

Yeni rezervasyon oluşturulduğunda oluşur.

Payload:

```json
{
  "reservation_type": "room",
  "customer_id": "customer_001",
  "start_date": "2026-07-12",
  "end_date": "2026-07-14"
}
```

Tepkiler:

```text
Takvim güncellenir.
Oda veya masa durumu güncellenebilir.
Android bildirim oluşturabilir.
Günlük iş oluşturulabilir.
```

## reservation.approved

Rezervasyon onaylandığında oluşur.

Payload:

```json
{
  "approved_by": "user_001"
}
```

Tepkiler:

```text
Rezervasyon onaylandı durumuna geçer.
İlgili oda veya masa rezerve durumuna alınır.
Müşteriye gönderilecek WhatsApp mesajı hazırlanabilir.
```

## reservation.rejected

Rezervasyon reddedildiğinde oluşur.

Payload:

```json
{
  "rejected_by": "user_001",
  "reason": "Müsaitlik yok"
}
```

Tepkiler:

```text
Rezervasyon reddedildi durumuna geçer.
Müşteriye açıklama mesajı hazırlanabilir.
```

## reservation.cancelled

Rezervasyon iptal edildiğinde oluşur.

Payload:

```json
{
  "cancelled_by": "user_001",
  "reason": "Müşteri iptal etti"
}
```

Tepkiler:

```text
Rezervasyon iptal edilir.
Bağlı oda veya masa uygun hale getirilebilir.
```

## reservation.completed

Rezervasyon tamamlandığında oluşur.

Tepkiler:

```text
Rezervasyon geçmişe alınır.
Oda veya masa durumu güncellenebilir.
```

## reservation.no_show

Müşteri gelmedi olarak işaretlendiğinde oluşur.

Tepkiler:

```text
Rezervasyon no_show durumuna alınır.
İlgili oda veya masa uygun hale getirilebilir.
```

## reservation.status_changed

PC uygulamasında rezervasyon durumu manuel değiştirildiğinde oluşur.

Payload:

```json
{
  "previous_status": "pending",
  "status": "approved",
  "room_ids": ["room_101"],
  "table_ids": []
}
```

Tepkiler:

```text
Rezervasyon listesi güncellenir.
Onaylanan rezervasyonda bağlı oda veya masa rezerve durumuna alınır.
Reddedilen, iptal edilen veya tamamlanan rezervasyonda bağlı kaynaklar uygun hale getirilebilir.
```

---

# 3. Room / Oda Eventleri

## room.created

Yeni oda eklendiğinde oluşur.

Payload:

```json
{
  "room_id": "room_001",
  "name": "Oda 1"
}
```

Tepkiler:

```text
Oda listesi güncellenir.
Dashboard oda sayıları güncellenir.
```

## room.updated

Oda bilgileri güncellendiğinde oluşur.

Payload:

```json
{
  "changed_fields": ["capacity", "features"]
}
```

Tepkiler:

```text
Oda ekranları güncellenir.
AI bilgi dosyaları manuel güncelleme gerektirebilir.
```

## room.status_changed

Oda durumu değiştiğinde oluşur.

Payload:

```json
{
  "room_id": "room_001",
  "old_status": "available",
  "new_status": "occupied"
}
```

Durumlar:

```text
available
occupied
reserved
cleaning
maintenance
out_of_service
```

Tepkiler:

```text
Dashboard oda özeti güncellenir.
Android oda özeti güncellenir.
Gerekirse günlük iş oluşturulur.
```

## room.deleted

Oda pasifleştirildiğinde veya silindiğinde oluşur.

Tepkiler:

```text
Oda aktif listeden çıkar.
Geçmiş rezervasyon bağlantıları korunmalıdır.
```

---

# 4. Table / Masa Eventleri

## table.created

Yeni masa eklendiğinde oluşur.

## table.updated

Masa bilgileri güncellendiğinde oluşur.

## table.status_changed

Masa durumu değiştiğinde oluşur.

Payload:

```json
{
  "table_id": "table_001",
  "old_status": "available",
  "new_status": "occupied"
}
```

Durumlar:

```text
available
occupied
reserved
service
bill_waiting
cleaning
out_of_service
```

Tepkiler:

```text
Dashboard masa özeti güncellenir.
Android masa özeti güncellenir.
Gerekirse bildirim oluşturulur.
```

## table.deleted

Masa pasifleştirildiğinde veya silindiğinde oluşur.

---

# 5. Customer / Müşteri Eventleri

## customer.created

Yeni müşteri kaydı oluştuğunda oluşur.

Kaynaklar:

```text
Web form
AI sohbet
WhatsApp
Manuel giriş
Rezervasyon
```

Tepkiler:

```text
Müşteri listesi güncellenir.
Talep veya rezervasyonla ilişkilendirilir.
```

## customer.updated

Müşteri bilgileri güncellendiğinde oluşur.

Payload:

```json
{
  "changed_fields": ["phone", "notes"]
}
```

## customer.contacted

Müşteriyle iletişim kurulduğunda oluşur.

Payload:

```json
{
  "method": "whatsapp",
  "contacted_by": "user_001"
}
```

method değerleri:

```text
phone
whatsapp
email
in_person
other
```

Tepkiler:

```text
Müşteri last_contact_at alanı güncellenir.
İlgili talep cevaplandı durumuna geçebilir.
```

## customer.deleted

Müşteri masaüstünden veya yetkili Android yönetici cihazdan silindiğinde oluşur.

```json
{
  "full_name": "Ahmet Yılmaz",
  "preserved_request_count": 2,
  "preserved_reservation_count": 1
}
```

Müşteri soft-delete edilir. Talep ve rezervasyon geçmişi korunur; müşteri kimliği bağları
kaldırılır.

---

# 6. Menu / QR Menü Eventleri

## menu.category_created

Yeni menü kategorisi eklendiğinde oluşur.

## menu.category_updated

Menü kategorisi güncellendiğinde oluşur.

## menu.category_deleted

Menü kategorisi silindiğinde oluşur.

```json
{
  "name": "Kahvaltı",
  "deleted_item_count": 8
}
```

Kategori ve bağlı ürünler soft-delete edilir; menü ve Android snapshot yayınları sıraya alınır.

## menu.item_created

Yeni menü ürünü eklendiğinde oluşur.

## menu.item_updated

Menü ürünü güncellendiğinde oluşur.

Payload:

```json
{
  "item_id": "item_001",
  "changed_fields": ["price", "is_available"]
}
```

Tepkiler:

```text
QR menü verisi güncellenir.
Hosting mini API’ye senkronizasyon gerekebilir.
```

## menu.item_deleted

Tek bir menü ürünü silindiğinde oluşur.

```json
{
  "name": "Serpme Kahvaltı",
  "category_id": "cat_001"
}
```

Ürün soft-delete edilir; kategori korunur ve yayınlar sıraya alınır.

## menu.item_availability_changed

Ürün aktif/pasif veya var/yok durumuna alındığında oluşur.

Payload:

```json
{
  "item_id": "item_001",
  "old_value": true,
  "new_value": false
}
```

Tepkiler:

```text
QR menüde ürün durumu değişir.
```

## menu.published

PC uygulamasındaki menü web tarafına yayınlandığında oluşur.

Payload:

```json
{
  "category_count": 8,
  "item_count": 42
}
```

Tepkiler:

```text
QR menü sayfası güncellenir.
Senkronizasyon kaydı başarı olarak işaretlenir.
```

---

# 7. AI Eventleri

## ai.conversation_started

AI sohbet başladığında oluşur.

Payload:

```json
{
  "source": "web_ai"
}
```

source değerleri:

```text
web_ai
desktop_ai
android_ai
```

Tepkiler:

```text
AI konuşma kaydı oluşturulur.
```

## ai.message_received

Kullanıcı AI’ye mesaj gönderdiğinde oluşur.

Payload:

```json
{
  "conversation_id": "ai_conv_001",
  "message_length": 54
}
```

Tepkiler:

```text
AI provider’a istek gönderilir.
```

## ai.message_replied

AI cevap verdiğinde oluşur.

Payload:

```json
{
  "conversation_id": "ai_conv_001",
  "reply_length": 180
}
```

Tepkiler:

```text
Cevap web widget veya PC ekranında gösterilir.
Konuşma geçmişi güncellenir.
```

## ai.summary_created

AI bir talep veya konuşma özeti oluşturduğunda oluşur.

Payload:

```json
{
  "request_id": "request_001",
  "summary": "Müşteri 2 kişilik oda sordu."
}
```

Tepkiler:

```text
Talep kartında AI özeti gösterilir.
```

## ai.reply_suggested

AI işletme sahibine cevap önerisi hazırladığında oluşur.

Payload:

```json
{
  "request_id": "request_001",
  "reply": "Merhaba, talebiniz için teşekkür ederiz..."
}
```

Tepkiler:

```text
PC uygulamasında cevap taslağı gösterilir.
WhatsApp mesajı hazırlanabilir.
```

## ai.request_created_from_chat

AI sohbetinden düzenli talep oluşturulduğunda oluşur.

Payload:

```json
{
  "conversation_id": "ai_conv_001",
  "request_id": "request_001"
}
```

Tepkiler:

```text
Yeni talep listesine kayıt düşer.
PC ve Android bildirim alabilir.
```

## ai.failed

AI cevabı alınamadığında oluşur.

Payload:

```json
{
  "source": "web_ai",
  "error_message": "Provider timeout"
}
```

Tepkiler:

```text
Kullanıcıya sade hata mesajı gösterilir.
Sistem çalışmaya devam eder.
```

Kullanıcı mesajı:

```text
AI cevabı alınamadı. Biraz sonra tekrar deneyin.
```

---

# 8. WhatsApp Eventleri

## whatsapp.message_prepared

WhatsApp mesaj taslağı hazırlandığında oluşur.

Payload:

```json
{
  "request_id": "request_001",
  "mode": "manual_copy",
  "prepared_by_ai": true
}
```

mode değerleri:

```text
wa_link
manual_copy
webview
official_api
```

Tepkiler:

```text
PC ekranında hazır mesaj gösterilir.
Kopyala veya WhatsApp’ta aç butonu aktif olur.
```

## whatsapp.link_opened

Müşteri veya işletme WhatsApp linkini açtığında oluşur.

Payload:

```json
{
  "phone": "+905xxxxxxxxx",
  "source": "web_form"
}
```

Tepkiler:

```text
Talep durumuna WhatsApp açıldı bilgisi eklenebilir.
```

## whatsapp.message_sent_by_user

İşletme sahibi mesajı gönderildi olarak işaretlediğinde oluşur.

V1’de gerçek gönderim otomatik doğrulanmak zorunda değildir.

Payload:

```json
{
  "request_id": "request_001",
  "marked_by": "user_001"
}
```

Tepkiler:

```text
Talep cevaplandı olarak işaretlenebilir.
Müşteri last_contact_at güncellenir.
```

## whatsapp.message_deleted

Hazır mesaj masaüstünden veya yetkili Android yönetici cihazdan silindiğinde oluşur.

```json
{
  "request_id": "request_001",
  "deleted_record_count": 1
}
```

Hazırlanmış outgoing mesaj soft-delete edilir ve talepteki hazır cevap alanları temizlenir;
talebin kendisi korunur.

## whatsapp.webview_connected

Electron içindeki WhatsApp Web oturumu açıldığında oluşur.

Tepkiler:

```text
WhatsApp ekranında bağlı durumu gösterilir.
```

## whatsapp.webview_disconnected

WhatsApp Web oturumu düştüğünde oluşur.

Tepkiler:

```text
Kullanıcıya sade uyarı gösterilir.
Sistem geri kalanı çalışmaya devam eder.
```

Uyarı örneği:

```text
WhatsApp bağlantısı kesildi. Tekrar bağlanmak için WhatsApp ekranını açın.
```

---

# 9. Notification / Bildirim Eventleri

## notification.created

Yeni bildirim oluşturulduğunda oluşur.

Payload:

```json
{
  "type": "new_request",
  "title": "Yeni müşteri talebi"
}
```

Tepkiler:

```text
PC bildirim listesi güncellenir.
Android bildirim gösterebilir.
```

## notification.read

Bildirim okunduğunda oluşur.

## notification.archived

Bildirim arşivlendiğinde oluşur.

---

# 10. Sync / Senkronizasyon Eventleri

## sync.started

Senkronizasyon başladığında oluşur.

Payload:

```json
{
  "direction": "pull",
  "entity_type": "request"
}
```

## sync.completed

Senkronizasyon başarıyla tamamlandığında oluşur.

Payload:

```json
{
  "direction": "pull",
  "entity_type": "request",
  "record_count": 5
}
```

Tepkiler:

```text
Son güncelleme zamanı gösterilir.
Yeni kayıtlar PC’ye eklenir.
```

## sync.failed

Senkronizasyon başarısız olduğunda oluşur.

Payload:

```json
{
  "direction": "pull",
  "entity_type": "request",
  "error_message": "Connection failed"
}
```

Tepkiler:

```text
Kullanıcıya sade hata gösterilir.
Sistem local çalışmaya devam eder.
```

Kullanıcı mesajı:

```text
Web bağlantısı kurulamadı. Yerel kayıtlarla çalışmaya devam edebilirsiniz.
```

## sync.conflict_detected

Aynı kayıt hem local hem web tarafında farklı güncellendiğinde oluşur.

Payload:

```json
{
  "entity_type": "request",
  "entity_id": "request_001"
}
```

Tepkiler:

```text
Varsayılan olarak son güncellenen kayıt tercih edilebilir.
Gerekirse kullanıcıya seçim sunulur.
```

---

# 11. System / Sistem Eventleri

## system.started

PC uygulaması açıldığında oluşur.

## system.closed

PC uygulaması kapandığında oluşur.

## system.backup_created

Yerel yedek oluşturulduğunda oluşur.

Payload:

```json
{
  "backup_file_name": "backup-2026-07-10.sqlite",
  "backup_path": "backups/backup-2026-07-10.sqlite"
}
```

## system.backup_failed

Yedekleme başarısız olduğunda oluşur.

## system.settings_updated

Ayarlar güncellendiğinde oluşur.

Payload:

```json
{
  "changed_fields": ["whatsapp_mode", "ai_enabled"]
}
```

## system.module_enabled

Bir modül aktif edildiğinde oluşur.

Payload:

```json
{
  "module": "qr_menu"
}
```

## system.module_disabled

Bir modül pasif edildiğinde oluşur.

Payload:

```json
{
  "module": "ai"
}
```

---

# 12. Daily Task / Günlük İş Eventleri

## task.created

Yeni günlük iş oluşturulduğunda oluşur.

Örnek kaynaklar:

```text
Bugün giriş var.
Bugün çıkış var.
Müşteri aranacak.
Masa rezervasyonu yaklaşıyor.
Oda temizlikte.
```

## task.completed

Günlük iş tamamlandığında oluşur.

## task.cancelled

Günlük iş iptal edildiğinde oluşur.

## task.status_changed

Günlük iş tamamlandı veya iptal dışındaki bir duruma alındığında oluşur.

Payload:

```json
{
  "previous_status": "done",
  "status": "pending"
}
```

---

# 13. Event İşleme Prensibi

Event oluştuğunda sistem şu sırayı izleyebilir:

```text
1. Olay kaydı oluşturulur.
2. İlgili ana veri güncellenir.
3. Bildirim gerekiyorsa oluşturulur.
4. AI görevi gerekiyorsa kuyruğa alınır.
5. Senkronizasyon gerekiyorsa işaretlenir.
6. UI ilgili ekranları günceller.
```

## Örnek: Web Form Talebi

```text
Müşteri form doldurur.
↓
request.created oluşur.
↓
Talep hosting mini API’ye kaydedilir.
↓
WhatsApp hazır mesaj oluşturulur.
↓
whatsapp.message_prepared oluşur.
↓
PC uygulaması talebi çektiğinde sync.completed oluşur.
↓
PC talebi gösterir.
↓
Android yeni talebi gösterir.
```

## Örnek: Rezervasyon Onayı

```text
İşletme sahibi talebi onaylar.
↓
reservation.approved oluşur.
↓
Talep converted_to_reservation olur.
↓
Oda veya masa reserved durumuna geçer.
↓
WhatsApp onay mesajı hazırlanır.
↓
Android ve PC durum ekranları güncellenir.
```

---

# 14. Event Saklama

PC uygulaması eventleri SQLite içinde saklamalıdır.

Önerilen tablo:

```text
events
```

Alanlar:

```text
id
type
actor_type
actor_id
entity_type
entity_id
payload_json
created_at
```

Firma hosting mini API tarafında event saklama ilk sürümde zorunlu değildir, ama talep ve AI konuşmaları için basit event kaydı tutulabilir.

---

# 15. Event İsimlendirme Kuralı

Event isimleri küçük harf ve nokta ayrımıyla yazılmalıdır.

Format:

```text
entity.action
```

Örnekler:

```text
request.created
reservation.approved
room.status_changed
ai.reply_suggested
whatsapp.message_prepared
sync.failed
```

Yanlış örnekler:

```text
RequestCreated
requestCreated
NEW_REQUEST
roomStatusChanged
```

---

# 16. Eventlerde Kullanıcıya Teknik Bilgi Gösterme

Event kayıtlarında teknik hata saklanabilir.

Ama kullanıcı ekranında teknik detay gösterilmemelidir.

Örnek event payload:

```json
{
  "error_message": "HTTP 500 internal server error"
}
```

Kullanıcıya gösterilecek metin:

```text
Bağlantı sırasında bir sorun oldu. Biraz sonra tekrar deneyin.
```

---

# 17. v1 İçin Öncelikli Eventler

İlk çalışan demo için öncelikli eventler:

```text
request.created
request.seen
request.answered
request.converted_to_reservation
request.deleted

customer.deleted

reservation.created
reservation.approved
reservation.cancelled

room.status_changed
table.status_changed

menu.item_updated
menu.item_deleted
menu.category_deleted
menu.published

ai.summary_created
ai.reply_suggested

whatsapp.message_prepared
whatsapp.message_deleted
whatsapp.link_opened

sync.completed
sync.failed

notification.created
```

Bu eventler tamamlandığında sistemin ana iş akışları kurulmuş olur.

---

# 18. Geliştirme Notu

Codex görevlerinde yeni bir özellik eklenirken şu soru sorulmalıdır:

```text
Bu işlem bir event üretmeli mi?
```

Eğer cevap evetse:

1. Event tipi `docs/EVENTS.md` içine eklenmelidir.
2. Event ilgili veri modeliyle ilişkilendirilmelidir.
3. UI bu evente göre güncellenmelidir.
4. Gerekirse bildirim veya AI görevi tetiklenmelidir.

## Kapanış Kuralı

Yardımcı Asistan içinde önemli her işlem sade, anlaşılır ve takip edilebilir bir event olarak düşünülmelidir.

Event sistemi, ürünün ileride farklı sektörlere ve yeni modüllere kolay genişlemesini sağlayacaktır.

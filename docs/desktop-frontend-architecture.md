# Masaüstü Frontend Mimari Notları

Bu belge, Yardımcı Asistan masaüstü arayüzünde yapılan kullanıcı dostu sadeleştirmelerden sonra korunması gereken teknik sınırları özetler.

## Ana kural

Yeni bir ekran davranışı mümkün olduğunca React bileşeninin içinde uygulanmalıdır. React tarafından oluşturulan DOM ağacını sonradan `innerHTML`, `append`, `replaceChildren` veya benzeri yöntemlerle değiştiren bir uyumluluk katmanı artık bulunmamaktadır ve yeni özelliklerde yeniden oluşturulmamalıdır.

## React dışı UX katmanı

Geçiş döneminde kullanılan `src/desktop-ux.ts` ve ona bağlı `MutationObserver` tabanlı yardımcı dosyalar kaldırılmıştır. Kasa, Oda Yönetimi, Menü ve müşteri son-temas sunumu artık doğrudan React state/props/event akışıyla çalışır.

Kasa detay raporlarının aç/kapa durumu ve alacak satırlarındaki tarih metinleri doğrudan `ReportsPage` / `FinanceWorkspace` React sunumunda yönetilir.

Oda Yönetimi `RoomManagementSection` React bileşeni olarak doğrudan Setup/Ayarlar ağacında çalışır. Oda sayısı `SetupFormState` üzerinden, oda adı ve fiyat kayıtları ise masaüstü bridge üzerinden React state ile yönetilir.

Menü yönetimi `components/menu/MenuManager.tsx` içinde doğrudan React tarafından yönetilir. Sürekli açık kategori/ürün ayarları, görsel dosya seçimi, WebP dönüştürme ve mevcut görsel önizlemesi React state/event akışındadır.

Müşteri kartındaki `Son temas` bilgisi de artık `CustomersWorkspace` sunumunda Türkçe tarih/saat biçimine dönüştürülür; ham zaman damgası yalnız `title` bilgisinde korunur.

## Menü alanı

Menü form tipleri, taslak oluşturma ve ortak saf menü yardımcıları `components/menu/menu-model.ts` altında tutulur. `MenuManager` ve müşteri görünümü aynı tip/yardımcıları kullanır; yeni menü iş kuralları tekrar `App.tsx` içine eklenmemelidir.

Yerel müşteri önizlemesi `components/menu/MenuPreview.tsx` içindedir. `App.tsx` yalnız önizleme overlay'ini açıp kapatır ve gerekli veriyi bileşene geçirir.

## Stil katmanları

`styles.css` eski ana stil dosyasıdır. Sonradan eklenen `*-ux.css` dosyaları işlev veya ekran alanına göre ayrılmıştır. Yeni stiller mümkün olduğunca ilgili bileşenin/alanın mevcut UX dosyasına eklenmeli; aynı seçiciyi farklı dosyalarda tekrar override eden yeni zincirler oluşturulmamalıdır.

## App.tsx

`App.tsx` halen büyük bir koordinasyon dosyasıdır. Yeni özellik eklerken bu dosyada yeni büyük workspace bileşenleri tanımlamak yerine `src/pages`, `src/components` veya `src/app` altına taşımak tercih edilmelidir.

Kademeli ayrıştırma için güncel sıra:

1. `SetupFormState`, AI servis taslakları ve ayar dönüştürme yardımcılarını `src/app` altındaki ayar modülüne ayır.
2. Müşteri form tipleri ve saf müşteri dönüştürme/biçimlendirme yardımcılarını ayrı alana taşı.
3. Büyük workspace bileşenlerini iş alanlarına göre `components` / `pages` altına taşımaya devam et.

Tamamlanan geçişler:

- Kasa detay aç/kapa durumu `ReportsPage` state'ine taşındı; `cash-page-ux.ts` kaldırıldı.
- Açık / kapanmış oda alacağı tarih metinleri `FinanceWorkspace` içinde oluşturuluyor.
- Oda Yönetimi `RoomManagementSection` ile Setup/Ayarlar React ağacına taşındı; `room-management-ux.ts` kaldırıldı.
- Menü yöneticisi `App.tsx` içinden ayrı `MenuManager` bileşenine taşındı.
- Menü görsel seçimi/dönüştürme/önizleme ve sürekli açık detay alanları React event/state akışına taşındı; `menu-editor-ux.ts` kaldırıldı.
- Menü form tipleri ve ortak saf menü yardımcıları `menu-model.ts` altında toplandı.
- `LocalMenuPreview` / `MenuPreviewCanvas` / `MenuPreviewItem` bileşenleri `MenuPreview.tsx` içine taşındı.
- Müşteri `Son temas` tarih biçimi `CustomersWorkspace` React sunumuna taşındı; `customer-work-enhancements.ts` kaldırıldı.
- Son geçici giriş noktası olan `desktop-ux.ts` kaldırıldı.

## Kontrol

Frontend temizliği sırasında kullanıcı davranışı değiştirilmemelidir. Her paket en az mevcut `Desktop Finance Check` hattındaki masaüstü build, finans smoke testleri, oda adisyonu testi ve gerçek Electron başlatma kontrolünden geçmelidir.

# Masaüstü Frontend Mimari Notları

Bu belge, Yardımcı Asistan masaüstü arayüzünde yapılan kullanıcı dostu sadeleştirmelerden sonra korunması gereken teknik sınırları özetler.

## Ana kural

Yeni bir ekran davranışı mümkün olduğunca React bileşeninin içinde uygulanmalıdır. React tarafından oluşturulan DOM ağacını sonradan `innerHTML`, `append`, `replaceChildren` veya benzeri yöntemlerle değiştirmek yalnız geçiş dönemi uyumluluk kodunda kabul edilir.

## Geçici UX uyumluluk katmanı

`src/desktop-ux.ts`, React dışındaki mevcut UX iyileştirmelerinin tek giriş noktasıdır. Bu katmandaki her kurulum:

- tekrar çağrıldığında ikinci bir observer/listener oluşturmamalı,
- bir cleanup fonksiyonu döndürmeli,
- `MutationObserver` kullanıyorsa işi `requestAnimationFrame` ile birleştirmeli,
- tüm belgeyi gereksiz yere sürekli taramamalı,
- uygulama iş/veri kurallarını değiştirmemelidir.

Mevcut geçici katmanlar:

- `customer-work-enhancements.ts`: Eski müşteri son-temas tarihinin kullanıcı dostu gösterimi.
- `menu-editor-ux.ts`: Menü detaylarının sürekli açık tutulması, görsel dosya seçimi/dönüştürme ve görsel önizleme uyumluluğu.

Kasa detay raporlarının aç/kapa durumu ve alacak satırlarındaki tarih metinleri artık doğrudan `ReportsPage` / `FinanceWorkspace` React sunumunda yönetilir. Eski `cash-page-ux.ts` uyumluluk katmanı kaldırılmıştır.

Oda Yönetimi de artık `RoomManagementSection` React bileşeni olarak doğrudan Setup/Ayarlar ağacında çalışır. Oda sayısı `SetupFormState` üzerinden, oda adı ve fiyat kayıtları ise masaüstü bridge üzerinden React state ile yönetilir; eski `room-management-ux.ts` kaldırılmıştır.

Bu işlevler ilgili React bileşenlerine taşındıkça kalan geçici dosyalar da tek tek kaldırılmalıdır.

## Stil katmanları

`styles.css` eski ana stil dosyasıdır. Sonradan eklenen `*-ux.css` dosyaları işlev veya ekran alanına göre ayrılmıştır. Yeni stiller mümkün olduğunca ilgili bileşenin/alanın mevcut UX dosyasına eklenmeli; aynı seçiciyi farklı dosyalarda tekrar override eden yeni zincirler oluşturulmamalıdır.

## App.tsx

`App.tsx` halen büyük bir koordinasyon dosyasıdır. Yeni özellik eklerken bu dosyada yeni büyük workspace bileşenleri tanımlamak yerine `src/pages`, `src/components` veya `src/app` altına taşımak tercih edilmelidir.

Kademeli ayrıştırma için güncel sıra:

1. Menü yönetimini ayrı React bileşenine taşı ve `menu-editor-ux.ts` uyumluluk katmanını kaldır.
2. Müşteri tarih biçimlendirmesini veri sunum katmanına taşı ve `customer-work-enhancements.ts` dosyasını kaldır.
3. Büyük form tiplerini ve saf yardımcı fonksiyonları `src/app` altındaki alan modüllerine ayır.

Tamamlanan geçişler:

- Kasa detay aç/kapa durumu `ReportsPage` state'ine taşındı.
- Açık / kapanmış oda alacağı tarih metinleri `FinanceWorkspace` içinde oluşturuluyor.
- `cash-page-ux.ts` kaldırıldı.
- Oda Yönetimi `RoomManagementSection` ile Setup/Ayarlar React ağacına taşındı.
- Oda sayısı, oda adı ve gecelik fiyat akışı React state üzerinden yönetiliyor.
- `room-management-ux.ts` kaldırıldı.

## Kontrol

Frontend temizliği sırasında kullanıcı davranışı değiştirilmemelidir. Her paket en az mevcut `Desktop Finance Check` hattındaki masaüstü build, finans smoke testleri, oda adisyonu testi ve gerçek Electron başlatma kontrolünden geçmelidir.

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

- `cash-page-ux.ts`: Kasa detay raporlarının katlanması ve eski alacak metin uyumluluğu.
- `customer-work-enhancements.ts`: Eski müşteri son-temas tarihinin kullanıcı dostu gösterimi.
- `menu-editor-ux.ts`: Menü detaylarının sürekli açık tutulması, görsel dosya seçimi/dönüştürme ve görsel önizleme uyumluluğu.
- `room-management-ux.ts`: Oda yönetiminin Ayarlar ekranına geçici entegrasyonu.

Bu işlevler ilgili React bileşenlerine taşındıkça dosyalar tek tek kaldırılmalıdır.

## Stil katmanları

`styles.css` eski ana stil dosyasıdır. Sonradan eklenen `*-ux.css` dosyaları işlev veya ekran alanına göre ayrılmıştır. Yeni stiller mümkün olduğunca ilgili bileşenin/alanın mevcut UX dosyasına eklenmeli; aynı seçiciyi farklı dosyalarda tekrar override eden yeni zincirler oluşturulmamalıdır.

## App.tsx

`App.tsx` halen büyük bir koordinasyon dosyasıdır. Yeni özellik eklerken bu dosyada yeni büyük workspace bileşenleri tanımlamak yerine `src/pages`, `src/components` veya `src/app` altına taşımak tercih edilmelidir.

Kademeli ayrıştırma için önerilen sıra:

1. Menü yönetimini ayrı React bileşenine taşı ve `menu-editor-ux.ts` uyumluluk katmanını kaldır.
2. Oda Yönetimi panelini Setup/Ayarlar React ağacına taşı ve `room-management-ux.ts` dosyasını kaldır.
3. Kasa detay aç/kapa durumunu `ReportsPage` state'ine taşı ve `cash-page-ux.ts` dosyasını kaldır.
4. Müşteri tarih biçimlendirmesini veri sunum katmanına taşı ve `customer-work-enhancements.ts` dosyasını kaldır.
5. Büyük form tiplerini ve saf yardımcı fonksiyonları `src/app` altındaki alan modüllerine ayır.

## Kontrol

Frontend temizliği sırasında kullanıcı davranışı değiştirilmemelidir. Her paket en az mevcut `Desktop Finance Check` hattındaki masaüstü build, finans smoke testleri, oda adisyonu testi ve gerçek Electron başlatma kontrolünden geçmelidir.

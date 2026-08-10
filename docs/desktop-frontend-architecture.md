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

Menü form tipleri, taslak oluşturma ve ortak saf menü yardımcıları `components/menu/menu-model.ts` altında tutulur. `MenuManager`, `MenuPreview` ve `App.tsx` aynı ortak yardımcıları kullanır; yeni menü iş kuralları tekrar `App.tsx` içine eklenmemelidir.

Yerel müşteri önizlemesi `components/menu/MenuPreview.tsx` içindedir. `App.tsx` yalnız önizleme overlay'ini açıp kapatır ve gerekli veriyi bileşene geçirir.

## Ayarlar ve AI alanı

Kurulum formunun veri modeli `app/setup-model.ts` altında tutulur. `SetupFormState`, masa kategori taslağı, AI servis profilleri, servis presetleri, form dönüşümleri ve kayıt için hazırlanan AI profil verisi burada tek kaynaktır.

`SetupWizard` ve Android cihaz yetki sunumu `components/settings/SetupWizard.tsx` altında tutulur. `App.tsx` yalnız ayar state/bridge koordinasyonunu ve kayıt işlemlerini sürdürür; servis seçimi, varsayılan profil üretimi, kayıtlı profil kontrolü, oda/masa başlangıç formu ve senkron gizli anahtar üretimi gibi saf dönüşüm kuralları `setup-model.ts` dışında tekrar tanımlanmamalıdır.

## Müşteri alanı

Müşteri kartı ve oda atama formunun veri modeli `app/customer-model.ts` altında tutulur. `CustomerFormState`, `RoomAssignmentFormState`, müşteri kartı ↔ kayıt payload dönüşümü, kimlik alanı sunum yardımcıları, müşteri kaynağı etiketi ve konaklama tarih/durum biçimlendirmeleri burada tek kaynaktır.

`CustomersWorkspace`, `CustomerEditorDrawer`, `RoomAssignmentDrawer` ve ortak konaklama durum işlemleri `components/customers/CustomersWorkspace.tsx` altında React bileşenleri olarak tutulur. `App.tsx` bu alanlarda yalnız veri/bridge işlemlerini ve sayfa koordinasyonunu sağlar.

Müşteri, talep, rezervasyon, oda ve tarih gösteriminde birden fazla ekranın kullandığı saf metin biçimlendiricileri `app/record-formatters.ts` altında paylaşılır. Yeni ortak gösterim kuralları tekrar büyük ekran bileşenlerine kopyalanmamalıdır.

## Stil katmanları

`styles.css` eski ana stil dosyasıdır. Sonradan eklenen `*-ux.css` dosyaları işlev veya ekran alanına göre ayrılmıştır. Yeni stiller mümkün olduğunca ilgili bileşenin/alanın mevcut UX dosyasına eklenmeli; aynı seçiciyi farklı dosyalarda tekrar override eden yeni zincirler oluşturulmamalıdır.

## App.tsx

`App.tsx` halen büyük bir koordinasyon dosyasıdır. Yeni özellik eklerken bu dosyada yeni büyük workspace bileşenleri tanımlamak yerine `src/pages`, `src/components` veya `src/app` altına taşımak tercih edilmelidir.

Kademeli ayrıştırma için güncel sıra:

1. Ayarlar ekranının büyük React sunum bloklarını `components/settings` altına ayır.
2. Oda / konaklama workspace bloklarını kendi bileşenlerine taşı.
3. Kalan büyük workspace bileşenlerini iş alanlarına göre `components` / `pages` altına taşımaya devam et.

Tamamlanan geçişler:

- Kasa detay aç/kapa durumu `ReportsPage` state'ine taşındı; `cash-page-ux.ts` kaldırıldı.
- Açık / kapanmış oda alacağı tarih metinleri `FinanceWorkspace` içinde oluşturuluyor.
- Oda Yönetimi `RoomManagementSection` ile Setup/Ayarlar React ağacına taşındı; `room-management-ux.ts` kaldırıldı.
- Menü yöneticisi `App.tsx` içinden ayrı `MenuManager` bileşenine taşındı.
- Menü görsel seçimi/dönüştürme/önizleme ve sürekli açık detay alanları React event/state akışına taşındı; `menu-editor-ux.ts` kaldırıldı.
- Menü form tipleri ve ortak saf menü yardımcıları `menu-model.ts` altında toplandı.
- `LocalMenuPreview` / `MenuPreviewCanvas` / `MenuPreviewItem` bileşenleri `MenuPreview.tsx` içine taşındı.
- `App.tsx` içinde kalmış menü sıralama/önizleme yardımcı tekrarları temizlendi; menü domain yardımcıları tek kaynağa bağlandı.
- `SetupFormState`, masa kategori form modeli, AI servis taslakları/presetleri ve ayar dönüşüm yardımcıları `app/setup-model.ts` altına taşındı.
- `SetupWizard`, Android cihaz yetki kartları ve Ayarlar sunum akışı `components/settings/SetupWizard.tsx` altına taşındı; `App.tsx` ayar verisi/bridge koordinasyonuna indirildi.
- Mesajlar ekranındaki `AiWorkspace`, `WhatsAppWorkspace` ve WhatsApp Web doğrulama/gönderim sunumu `components/messages/MessageWorkspaces.tsx` altına taşındı; `App.tsx` mesaj state/bridge koordinasyonunda kaldı.
- Müşteri form tipleri, müşteri kayıt dönüşümleri, kimlik alanı yardımcıları ve konaklama sunum yardımcıları `app/customer-model.ts` altına taşındı.
- `CustomersWorkspace`, `CustomerEditorDrawer`, `RoomAssignmentDrawer` ve `CustomerRoomStayActions` `components/customers` altına taşındı.
- Talep/rezervasyon/oda/tarih ortak gösterim yardımcıları `app/record-formatters.ts` altında toplandı.
- Müşteri `Son temas` tarih biçimi müşteri modelindeki ortak yardımcıdan üretilir; ham zaman damgası yalnız `title` bilgisinde korunur.
- Son geçici giriş noktası olan `desktop-ux.ts` kaldırıldı.

## Kontrol

Frontend temizliği sırasında kullanıcı davranışı değiştirilmemelidir. Her paket en az mevcut `Desktop Finance Check` hattındaki masaüstü build, finans smoke testleri, oda adisyonu testi ve gerçek Electron başlatma kontrolünden geçmelidir.
- `RequestsWorkspace` ve manuel talep drawer’ı `components/customers/RequestsWorkspace.tsx` altına taşındı; talep durum tonu ve bekleyen-talep görünüm yardımcıları aynı modülden paylaşılır.
- `DailyTasksWorkspace`, `ReservationsWorkspace`, `RoomsWorkspace` ve `CustomerRoomStaysWorkspace` `components/operations/OperationWorkspaces.tsx` altına taşındı; App yalnız operasyon state/bridge koordinasyonunu yürütür.
- Tarayıcı önizleme/fallback `defaultDashboardData` ve `defaultSetupData` verileri `app/bootstrap-defaults.ts` altında tutulur; `App.tsx` statik örnek veri taşımak yerine yalnız uygulama koordinasyonuna odaklanır.
- Uygulama çalışma zamanı/senkron UI yardımcıları `app/runtime-state.ts`, rezervasyon WhatsApp metin üretimi `app/reservation-messaging.ts`, masa durum yardımcıları ise `app/operations.ts` altında tutulur; `App.tsx` saf yardımcı fonksiyon taşımaz.
- Uygulama kilidi state/bridge akışı `app/use-app-lock.ts` hook'unda tutulur; `App.tsx` yalnız kilitlenirken açık menü önizlemesini kapatma gibi üst seviye koordinasyonu yapar.
- Dashboard verisi, bootstrap yükleme, otomatik senkron abonelikleri ve manuel web talebi çekme akışı `app/use-desktop-sync.ts` controller hook'unda tutulur; `App.tsx` kurulum, menü seçimi ve ortak durum mesajı koordinasyonunu sağlar.
- Menü seçimleri, taslak form state'leri, kaydet/sil/yayınla ve yerel önizleme lifecycle'ı `app/use-menu-controller.ts` controller hook'unda tutulur; `App.tsx` yalnız MenuManager ve preview bileşenlerini bağlar.
- Kurulum/Ayarlar form state’i, AI bağlantı testi ve ayar kaydetme bridge akışı `app/use-setup-controller.ts` içinde tutulur; `App.tsx` yalnız bootstrap, dashboard ve ekran koordinasyonunu bağlar.

- Mesaj/AI, müşteri-talep, oda/rezervasyon/günlük iş mutation'ları ve Android/yedek akışları ayrı controller hook'larında tutulur; `App.tsx` bu domainleri yalnız sayfa ve ortak durum koordinasyonu için bağlar.
- Uygulama shell/header/sidebar, kilit/ilk kurulum görünümü ve sayfa router kompozisyonu `components/app/DesktopAppView.tsx` altında tutulur; `App.tsx` controller hooklarını başlatıp ortak sayfa/senkron state bağlantılarını kuran ince giriş noktasıdır.

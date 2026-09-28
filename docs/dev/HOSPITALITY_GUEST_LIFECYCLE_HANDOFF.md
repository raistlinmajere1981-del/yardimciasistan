# Konaklama misafir modeli — uygulama ve OpenCode devri

Dal: `feature/hospitality-guest-lifecycle`
Başlangıç: `b6e1f15e3e604ec1a5b195ae02fbc00e36f2ec3e`

## Uygulanan kararlar

- Her kişi ayrı müşteri ve misafir katılım kaydıdır; çocuk/bebek ayrımı ve telefon zorunluluğu yoktur.
- Rezervasyon kişi sayısı beklenendir. Gerçek giriş, seçilen kişilerin sayısıdır; rezervasyonun kişi sayısı değiştirilmez.
- Bir oda bir aktif konaklama grubuna, grup tek ortak hesaba sahiptir. Kişi aynı anda iki aktif misafir listesinde bulunamaz.
- Ana misafir değişebilir. Ana misafir ayrılırken kalanlardan yeni ana misafir seçilir. Ortak hesabın ilk hesap sahibi ve geçmiş borç otomatik değiştirilmez.
- Kişi bazında giriş/çıkış, yeniden gelişte yeni katılım ve tüm grubun çıkışı ayrı kaydedilir.
- Giriş ve etkinse hesap oluşturma aynı transaction içindedir. İstek kimliği yinelenen gönderimi önler. Oda değişimi veya çıkış sonrasında aynı rezervasyondan ikinci konaklama oluşturulmaz.
- Oda değişimi hesap, fiyat ve konaklama kimliğini korur; oda hareket geçmişi ve kişi bazında bildirim olayı üretir.
- Fiziksel çıkış otomatik tahsilat yapmaz. Borç hesapta kalır; oda temizlik bekler.
- Restoranda ana misafir olmayan bir katılımcı da oda hesabını buldurur. Tam adisyon açık durumların herhangi birinden aktarılır. Stok tekrar düşmez, tahsilat uydurulmaz.
- Restorandan konaklama başlatma aynı Oda Workspace'ini açar; sonra Masa Hesabına Dön üzerinden aktarım yapılabilir.
- Çok odalı rezervasyonda fiyat/kapora dağılımı ve kısmi adisyon aktarımı bu sürümde yoktur.

## Dosya grupları

| Alan | Dosyalar |
| --- | --- |
| Şema | `apps/desktop-app/db/schema.sql` |
| Misafir operasyonları | `electron/stay-guest-service.ts`, `electron/stay-reservation-service.ts`, `electron/room-state-service.ts` |
| Facade / kontrat / IPC | `electron/database.ts`, `electron/database-types.ts`, `electron/ipc/customer-ipc.ts`, `electron/preload.ts` |
| Okuma projeksiyonları | `electron/database/customer-room-stay-store.ts`, `electron/database/customer-store.ts` |
| Hesap / aktarım | `electron/room-folio.ts`, `electron/room-folio-order-transfer.ts` |
| Android korumaları | `electron/android-action-service.ts` |
| Oda UI | `src/components/pension/RoomStayPanel.tsx`, `StayGuestPicker.tsx`, `StayGuestList.tsx`, `RoomWorkspace.tsx`, `use-room-stay-operations.ts`, `RoomDailyOperations.tsx`, `RoomCheckoutConfirmation.tsx`, `RoomResourceCard.tsx`, `RoomHistory.tsx`, `RoomAccount.tsx`, `RoomAccountAdjustments.tsx` |
| Restoran UI | `src/components/restaurant/TableAccountPanel.tsx`, `TableRoomTransfer.tsx`, `TableWorkspace.tsx` |
| Ortak girişler | `src/components/operations/OperationWorkspaces.tsx`, `QuickCustomerCreator.tsx`, `src/components/customers/CustomerWorkspace.tsx` |
| Kararlar / kontrol | `docs/architecture/DOMAIN_DECISIONS_V1.md` D-017–D-021, `scripts/smoke-hospitality-guests.mjs`, kök `package.json` |

Tablodaki `electron/` ve `src/` yolları `apps/desktop-app/` altındadır.

## Veri ve kimlik bildirimi sınırları

Şema tanımları yalnız `schema.sql` içindedir. İlk açılışta mevcut veritabanında misafir
tabloları yoksa bu güncel şema bölümü transaction içinde eklenir. Önceki konaklamanın
bilinen ana müşterisi ve tarihleri aktarılır; kayıtlı olmayan başka kişiler uydurulmaz.
Mevcut test veritabanı bu çalışma sırasında açılmadı veya silinmedi.

`hospitality_notifications`, kişi/oda/gerçek zaman ile kimlik bilgisi içeren yerel hazırlık
kayıtlarıdır. Kişisel bilgiler genel olay/diagnostic loglarına yazılmaz. Kimlik alanlarının
dolu olması resmî kimlik doğrulaması anlamına gelmez. Bildirim gönderen servis, sağlayıcı
ayarları, sabit IP/tesis yetkilendirmesi ve kurum yanıtından teslim doğrulama henüz yoktur.
`sent` alanı yalnız ileride gerçek kurum yanıtı doğrulandığında kullanılmalıdır; şu an
uygulama hiçbir kaydı gönderildi olarak işaretlemez. Ekran bu sınırı açıkça belirtir.

Dayanak: [Jandarma resmî KBS Tesis kullanım kılavuzu](https://www.jandarma.gov.tr/kurumlar/jandarma.gov.tr/Jandarma/Uygulamalar/KBS/KBS_Tesis_2_Uygulama_TD.pdf),
özellikle konaklayan ekleme/güncelleme/çıkış ve web servis yetkilendirme bölümleri.
EGM ve Jandarma için gerçek servis entegrasyonu yapılırken işletmenin yetkili olduğu
kurumun güncel teknik sözleşmesi ayrıca doğrulanmalıdır. Mevcut çalışma hukuki uygunluk
sertifikası veya otomatik bildirim entegrasyonu değildir.

## OpenCode kontrolü

İlk teslimde TypeScript, lint, build ve testler kullanıcı tercihiyle OpenCode'a bırakıldı.
OpenCode düzeltmelerinden sonra kullanıcı tam `pre-main` kontrolünün geçtiğini bildirdi.
Son inceleme düzeltmelerinde masaüstü TypeScript kontrolü, hospitality-guests,
hospitality-domain, room-folio-service, room-folio-table-order-transfer, pension-workspace
ve restaurant-workspace testleri yeniden çalıştırıldı ve geçti. Değiştirilen kod/test
dosyalarının hedefli ESLint kontrolü ve `git diff --check` temiz. Restoran testi ilk paralel
denemede port çakışması nedeniyle başlamadı; tek başına tekrar çalıştırıldığında geçti.
Son düzeltmelerden sonra tam `pre-main` kullanıcı
tarafından yeniden çalıştırılacak.

Son inceleme düzeltmelerinin dosyaları: `electron/room-folio.ts`,
`src/components/pension/StayGuestList.tsx` (ikisi de `apps/desktop-app/` altında),
`scripts/smoke-hospitality-guests.mjs`, `scripts/smoke-pension-workspace.mjs`,
`scripts/test-helpers/pension-workspace-fixture.mjs` ve bu devir notu.

Yeni davranış testi: `npm run smoke:hospitality-guests`. Paylaşılan paketler ve Electron
zaten derlendiyse `node scripts/smoke-hospitality-guests.mjs` mevcut çıktıları kullanır.
Test; çoklu kayıt, çocuk için telefonsuz kayıt, çifte giriş engeli, istek tekrarı,
ana misafir çıkışı, ortak hesabın sahibi, oda değişimi, restoran aktarımı, çift tahsilat
engeli, borçla çıkış, finansal hata sırasında tam rollback ve rezervasyon/gerçek kişi
sayısı ayrımını kapsar. Ayrıca 105 eski borç hesabı varken aktif hesabın global listede
kalmasını, geçmişin 100 kayıtla sınırlanmasını ve oda bazında geçmişin kesilmemesini doğrular.
Renderer testi atomik giriş hatasında formun korunmasını, aynı istekle yeniden girişi ve
kişi bazında çıkışta açık restoran adisyonu/son misafir hesap uyarılarını kapsar.

Eski smoke fixture'larında özellikle şu beklentiler artık geçersizdir: tek kayıtlı müşteri
ile çok kişili gerçek giriş, giriş sonrasında folio olmaması, girişli konaklamayı iptal,
çıkış sırasında otomatik tahsilat, aktarım için önce `payment` durumuna geçiş. Yeni guest
DTO alanlarını fixture'lara ekleyin; bu eski davranışları geri getirmeyin.

Renderer incelemesinde misafir ekleme/draft koruması, ana misafir ayrılırken yerine kişi
seçimi, oda değişiminden sonra doğru oda/hesap, müşterinin kimlik bilgilerini tamamlama,
restorandan giriş ve masaya dönüş, eski borç hesabının aktarım hedefi olmaması ve
capability kapalı varyantlar önceliklidir. Mevcut Android tek müşteri arayüzü çok kişili
doğrudan girişi reddeder; misafir listesi masaüstünde tamamlanır. Android grup çıkışı
aynı veritabanı lifecycle korumalarından geçer.

Kontroller ve gerekli fixture/düzeltmeler kullanıcı planına göre ayrı commit'te ele alınır.

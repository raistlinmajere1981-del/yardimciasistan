# Pansiyon / Restoran yapısal UI devri

## Son ek: workspace yerleşim iyileştirmesi

Önceki yapısal sürüm için kullanıcı `pre-main` sonucunu temiz bildirdi. Sonradan
eklenen varsayılan kart görselleri ve aşağıdaki yerleşim değişiklikleri bu sonuca
dahil değildir. Bu ek için sözdizimi ve `git diff --check` temiz; çalışma zamanı
doğrulaması kullanıcının dış modelle test iş akışına bırakıldı.

- ResourceWorkspaceSummary: yerel varsayılan görsel, birlikte gruplanmış kaynak
  bilgileri/durumlar; sağda mevcut konaklama/adisyon özeti.
- RoomWorkspace ve TableWorkspace: ilgili görsel özete bağlandı.
- TableAccountPanel: hesap ve Ödendi / Kapat ilk sırada, müşteri sonra,
  tekrar eden masa bilgileri en altta. Müşteri butonları aynı satırda sarılıyor.
- TableWorkspace: müşteri modundan giriş doğrudan müşteri bölümüne odaklanıyor.
- StayGuestList: misafir ekleme ve oda değiştirme geniş alanda yan yana;
  alan daraldığında otomatik alt alta. Gizlenen ya da kaldırılan işlem yok.
- operation-surface.css: kısa kolon başlıkları, scroll içinde bölümlerin
  küçülmesini engelleme, boş masada menü/adisyon yüksekliğini 2:1 bölme.

Bu ekin dosyaları: ResourceWorkspaceSummary.tsx, RoomWorkspace.tsx,
TableWorkspace.tsx, TableAccountPanel.tsx, StayGuestList.tsx,
styles/components/operation-surface.css ve bu rapor.

Dış doğrulama: desktop typecheck, pension/restaurant workspace smoke ve design
audit; 1366×768 ile 1920×1080'de boş/dolu durumları görsel kontrol edin. Özellikle
Ödendi / Kapat'ın ilk görünümde erişimi, oda değiştirme/misafir ekleme alanları,
quick customer formu, müşteri modunun odağı, menü scroll'u ve artırılmış ölçek
kontrol edilmeli. Önceki doğrulama ayrıntıları aşağıda korunmuştur.

Tarih: 2026-09-28
Branch: `ui/pension-restaurant-structure`
Başlangıç: `c6a9afe733d5eb04a0e3161dbb8648754f9f6339`
Durum: Uygulama değişiklikleri hazır; davranış ve görsel doğrulama bekliyor. Commit/merge yapılmadı.

## Kapsam

Kullanıcının dört AI referansı: restoran ana sayfası, boş/dolu masa workspace'i,
pansiyon ana sayfası, boş/dolu oda workspace'i. Referanslar panel ve bilgi
düzeni için kullanıldı. Uygulama geneli makyaj sonraki aşamadır.

Mevcut ActionButton, ChoiceChips, StatusBadge, OperationPanel ve WorkspaceFrame
kullanılıyor. Domain/controller, IPC ve veritabanı değiştirilmedi.
Fotoğraf galerisi, yeni temizlik checklist'i, masa ödeme yöntemi/kısmi tahsilat,
yeni rezervasyon bağlama işlemi veya sınırsız geçmiş eklenmedi.
Mevcut menü ürün görselleri korunuyor; yeni asset üretilmedi.
Superdesign oturumu doğrulandı; uzak proje/draft ve init çıktısı üretilmedi.

## Uygulanan düzen

- Mevcut rezervasyon–kaynak–günlük işler üçlü sayfa düzeni korunuyor.
- Pansiyon: kat ve durum filtreleri, kat kapsamındaki sayaçlar, sonuç yok durumu
  ve filtre sıfırlama. Oda filtreleri mevcut sayfa controller'ında tutuluyor.
  Boş doluluk, fiziksel olarak hazır anlamına gelmez; temizlikteki boş oda hem
  Boş hem Temizlik filtresinde yer alabilir. Özet alınamayan oda boş sayılmaz.
- Restoran: masa durum sayaçları, mevcut temizlik durumu filtresi, daraltılabilir
  alan grupları, görünür masa sayıları ve sonuç yok/sıfırla durumu.
- Oda/masa kartlarında açık workspace girişleri var. Kartların minimum yüksekliği
  operasyon sayfasında serbest; satır yüksekliği yalnız o satırın içeriğine bağlı.
- Ortak ResourceWorkspaceSummary oda/masa kimliği ve durumlarını gösteriyor.
  Oda doluluğu, fiziksel durum ve finansal hesap ayrı kavramlar olarak kalıyor.
- Oda workspace'i: misafir/konaklama, hazırlık/işlemler, hesap kolonları;
  mevcut formlar ayrı işlem bölümlerinde. Ödeme bölümüne başlık eklendi.
- Boş masa: solda başlatma/müşteri/hazırlık, sağda menü ve boş adisyon.
  Aktif adisyon: menü–adisyon–müşteri/hesap kolonları.
- Masa bölümleri anahtarlı Fragment ile yer değiştiriyor; aynı bileşenlerin
  taslaklarını koruması amaçlanıyor. Özellikle çalışma zamanında doğrulanmalı.
- Dar ekranlarda mevcut tek kolon workspace davranışı sürüyor.

## Değişen dosyalar

Tüm kaynak yolları `apps/desktop-app/src/` altındadır:

- `components/operations/ResourceWorkspaceSummary.tsx` (yeni)
- `components/pension/RoomAccount.tsx`
- `components/pension/RoomAccountPayment.tsx`
- `components/pension/RoomResourceCard.tsx`
- `components/pension/RoomWorkspace.tsx`
- `components/pension/RoomsWorkspace.tsx`
- `components/pension/pension-page-state.tsx`
- `components/restaurant/TableAccountPanel.tsx`
- `components/restaurant/TableOrderEditor.tsx`
- `components/restaurant/TableResourceCard.tsx`
- `components/restaurant/TableWorkspace.tsx`
- `pages/RestaurantPage.tsx`
- `styles/components/operation-surface.css`
- `styles/pages/operations-board.css`
- `styles/pages/pension.css`
- `styles/pages/restaurant.css`

Ek dosya: bu rapor. Önceki turdaki genel font/gölge/renk değişiklikleri kaldırıldı.

## Bu sessiondaki doğrulama

- Değişen TS/TSX dosyaları TypeScript transpileModule ile sözdizimi açısından
  kontrol edildi. Bu kontrol typecheck veya davranış testi değildir.
- `git diff --check` temiz.
- Önceki modelin başlattığı test çağrısı kesildi; sonuçları doğrulanmış sayılmıyor.
- Kullanıcının tercihiyle typecheck, smoke testleri ve görsel inceleme dış modele
  bırakıldı. Önceden var olan bir test hatası tespit edilmiş değil; testlerin
  geçtiği anlamına gelmez.

## OpenCode / Gemini doğrulama görevi

Önce AGENTS.md, mimari Constitution ve bu raporu okuyun. Aynı branch'te mevcut
diff'i inceleyin; değişiklikleri sıfırlamayın. Makyaj veya domain genişletmeyin.
Repo kurallarındaki kurulu yerel runtime/binary kullanımına uyun.

Dar başlangıç kontrolleri:

```bash
npm run typecheck -w @yardimci-asistan/desktop-app
npm run smoke:pension-workspace
npm run smoke:restaurant-workspace
npm run smoke:operations-ui
npm run design:audit:strict
git diff --check
```

Birleşme öncesi tek milestone kapısı `npm run pre-main`; ayrıca ikinci bir tam
check listesi oluşturmayın. Hataları başlangıç commit'i ile karşılaştırıp bu
değişiklikten gelenler ve önceden var olanlar olarak kanıtlarıyla ayırın.

Tarayıcıda özellikle kontrol edin:

1. Boş/dolu/temizlik/bakım/hizmet dışı/pasif odalar, eksik özet ve aktif filtrede
   kaynak silinmesi: sayaçlar ve sıfırlama; doluluk ile hazırlık ayrımı.
2. Odayı aç/kapat, tarihçe dönüşü, kat/durum filtrelerinin korunması;
   misafir girişi, planlı giriş, checkout, eski açık hesap, ödeme odağı ve dirty guard.
3. Boş masayı açmanın adisyon oluşturmaması; yalnız Sipariş Aç'ın oluşturması.
   Başlatınca menü araması/kategori ve müşteri seçimi taslağının korunması.
4. Ürün ekleme/adet/silme/not, ödeme-kapat, iptal ve odaya aktarım;
   tarihçeden dönüş ve entity değişiminde eski taslak taşınmaması.
5. Masa alanını daralt/aç; grup/durum değiştir; boş sonuçtan filtre temizle.
6. Sipariş, menü, müşteri, rezervasyon ve folio capability'leri kapalı kombinasyonlar.
7. 1920×1080, 1366×768, 900px altı; compact/comfortable, light/dark ve artırılmış
   ölçek. Kesilen kontroller, klavye odak sırası ve scroll bölgelerini inceleyin.

Son rapor: test komutları ve çıkış kodları, varsa ekran görüntüleri, yapılan
düzeltmeler/dosyalar, kalan bulgular, `git diff --stat`, `git status --short`.
Son inceleme bu sessionda değişen dosyalar ve bu doğrulama raporu üzerinden yapılacak.

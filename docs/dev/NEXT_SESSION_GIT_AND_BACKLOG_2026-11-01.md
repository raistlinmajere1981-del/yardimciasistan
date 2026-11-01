# Yardımcı Asistan — C33 sonrası temiz oturum devri ve Git toparlama

**Tarih:** 2026-11-01
**Öncelik:** **Yeni geliştirmeden ÖNCE Git ve çalışma ağacını güvenli kontrol noktasına getirmek.**
**Kaynak önceliği:** `AGENTS.md` → `docs/dev/TEST_ENVIRONMENT_POLICY.md` → bu belge → ilgili domain mimarisi / `docs/dev/CONTINUATION_BACKLOG_2026-10-29.md` son C28–C33.

## Kesin proje politikası

Bütün projeye ait Alwaysdata siteleri **demo/staging**, asla gerçek ticaret değildir. Teknikel'e çekilmiş ürünler ve görseller, demo bayi/müşteri hesapları ve test siparişleri konulabilir; test DB'si/Companion/Bayi verileri sıfırlanabilir. **Migration/legacy compatibility/yeni backup/rollback çalışmaları yok.** Firma kendi asıl sitesine ve gerçek kullanıcıya geçerken veri devamlılığı ayrıca planlanacak. Halihazırdaki manuel backup/restore, pre-reset safety backup ve onaylı `legacy-data` özellikleri sırf staging politikası yüzünden sökülmez. Yetki, finansal doğruluk, imza ve idempotency kanıtları korunur. Kod, sırlar, başka ajanların çalışmaları ve Git tarihi disposable değildir.

## Çalışma ağacı ve test baz çizgisi (2026-11-01 son kontrol)

- Repo: `/home/raistlin/YardimciWorkspace/YardimciAsistan`.
- `main` ve `origin/main`: **`fca57c5a6bf0916e294ae77ccf6ef12499b19ad2`**, 2026-10-27; arada yeni commit yok.
- `git status --porcelain=v1`: **406 durum girdisi**: 220 değiştirilmiş, 3 silinmiş, 183 untracked girdisi (untracked tekil dosya sayısı 195). Büyük dağılım: `apps` 229, `scripts` 125, `docs` 19, `packages` 17, `test-site` 7. Üç silinmiş desktop Android bootstrap/install/ticket dosyası otomatik geri getirilmeyecek; bilinçli kaldırılma mı incelenecek.
- `git diff --stat`: tracked 223 dosyada yaklaşık 8.644 ekleme / 2.845 silme; untracked kaynaklar ayrıca. `git diff --check` **PASS**.
- Untracked `apps/android-app/src/test/resources/local-tls/*.pem` yalnız yerel test sertifikaları gibi görünüyor; staging öncesi içerik ve gizlilik taraması yapılmalı. Genel olarak `.env`, private key, token, cache, test çıktısı, APK/EXE, kişisel DB ve host konfigürasyonları **yanlışlıkla stage edilmemeli**.
- `artifacts/verify/latest.json`: **290/290 pre-main PASS**, çalıştırma başlangıcı **2026-10-31T22:51:19.807Z**, bitişi **2026-10-31T23:25:43.569Z**. **Bu rapor C28–C33 sonrası yeni kaynakları kapsayan tam doğrulama değildir.**
- C28–C33 hedefli testler: ortak Android imzalı HTTPS güncelleyici (Companion+Bayi), Android yükleyicinin chooser çıkarmayan sistem uygulaması seçimi, Bayi çoklu sepet (5 bağımsız), fiziksel izole Android fixture, sunucu tarafı katalog revizyonu/özel fiyat/idempotency **PASS**; kanıtlar son backlog bölümlerinde.
- Resmi kaynak `product-version.json` **2.1.0 / Android code 16**. Test telefonu Samsung J700F'de iki test APK'sı **2.1.5/code21**; kod 16'ya downgrade yapma, sonraki gerçek signed release için kod 22+ veya temiz kurulum gerekli. Staging verileri disposable.
- Android OTA için geçici HTTPS feed/APK yayınları temizlendi. Teknikel Alwaysdata modülünde en son `account/config.php enabled=false`, bayi katalog/sipariş uçları `403 online_sales_disabled`; **bu gerçek site değildir**; demo veri ve online satış modülü test için açılabilir.

## Önerilen sıralı iş listesi

### G0 — Git ve güvenilir geliştirme tabanı (ilk yeni oturum)

1. Salt-okunur Git envanteri: `git status --short --branch`, `git diff --stat`, `git ls-files --others --exclude-standard`, `git diff --name-status`; tarihsel kararlarla silinmiş dosyaları ve paralel admin/efekt çalışmalarını ayır. **Reset/stash/clean/checkout/rebase/force-push yapma.**
2. Değişiklikleri tutarlı sahiplik gruplarına ayır: (a) core/desktop commerce+Companion+Puan+belge/baskı, (b) Android ortak OTA + Bayi UI/test, (c) web site template/demo/Teknikel, (d) admin/efekt işleri, (e) docs/testler. `AGENTS.md`, staging politika ve dev checkpoint belgelerini dahil et. Yeni kaynaklarla çıktıları/secrets ayır; `.gitignore` eksiklerini yalnız gerçekten gerekirse düzelt.
3. Mevcut hedefli testleri gözden geçir; ardından **kullanıcı tetiklemeli** bir kez güncel `npm run verify:pre-main`. 290 önceki PASS'i yeni PASS gibi sunma. Kalan FAIL'leri ilgili dosya sahipliğinde kısa OpenCode DeepSeek High dilimlerinde kapat. Sonra mantıksal parçalar hâlinde `git add <doğrulanmış alan>` ve açıklayıcı commit'ler; mümkünse bir **temiz checkpoint** elde et. Gerekirse push yetkisi netleştir; uzak `origin/main` doğrulanmadan force-push yok. Büyük, kör `git add -A && git commit` yapma.
4. Git toparlandıktan sonra kod/staging güncellemelerine devam et; doğrulama kayıtlarını kısa ve güncel tut. **Bu kapatma oturumunda commit/push yapılmadı.**

### G1 — Teknikel Alwaysdata **demo** site + gerçek staging entegrasyonu

- Mevcut çekilmiş katalog (önceki 179 ürün / 68 görsel kaydı; diskte güncelliğini doğrula), kategori/galeri/arama, test stok/fiyat yayınını gerçek stage üzerinde göster.
- Demo müşteriler, davetli bayi hesapları, iki farklı fiyat grubu, çoklu sepet, offline sepet, sipariş/teslimat durumu, tekrar sipariş ve idempotency uçtan uca. `online_sales_disabled` sadece staging ayarı; senaryoyu çalıştırmak için demo online satış/hesap servisi açılabilir. Gerçek ticaret yapılmaz.
- Özel fiyat revizyonu, eski makbuzun sabitliği ve yeni quote için C33 testlerini stage üzerinde doğrula; test verileri sıfırlanabilir.

### G2 — Companion / Android kalan fiziksel kabul

- Companion staff rolünün gerçek bağlı telefonla, yalnız gereken Market/Satış izinleriyle sınırları; müşteri/stok/veresiye/tahsilat/Puan grant. Gerekirse bağlantı kopması–ACK sonrası tekrar ve aynı işlem ID güvenliği (önceki backlog C20p notlarıyla mükerrer iş yapma).
- Android Companion/Bayi yeni kodun signed release smoke'u ve web'den normal yükleme/güncelleme davranışı; son telefon test APK'sı code21. Kapsamı tamamlanmış OTA'yı yeniden tasarlama.
- Puan/kupon/satış/iade ve belge/baskı paylaşımındaki açık UI uçlarını yeni kayıtların ışığında yalnız hedefli kontrol et; PASS olmuş işleri tekrar açma.

### G3 — Sayfa ve demo görünümü

- Demo **test alanını** amatör/boş vitrin hissinden çıkar: yayınlanan gerçek test verisini yerli yerinde, yayınlanmamış modülleri ise `etkinleştirir/yayınlarsan burada görünür` açıklamalı profesyonel önizleme olarak sun.
- Site içi test menüsü ayrı, ana sayfaya tek dönüş bağlantısı; pasif/olmayan modüllere hardcoded menü bırakma. Teknikel, Pansiyon ve diğer Alwaysdata test sayfalarının geriye kalan görsel/yerleşim, responsive, harita ve ortak şablon tutarlılığını kontrol et.
- Desktop sayfa/diyalog görsel rötuşları; baskı-belge/WhatsApp-email/AI/STT/finance UI alanlarını büyük bir yeniden geliştirme yapmadan **eksik kanıt** durumuna göre sırala. Admin/efekt atölyesi paralel sahipliğini karıştırma.

### G4 — Windows kabul, son doğrulama ve staging yayınları

- Windows x64/x86 paketleme ve makine/VM smoke; masaüstü açılış, profil, güncelleme, baskı, veri/yerel servis bağları; Android imza ve paket manifest kontrolleri.
- Yeniden `verify:pre-main` + `verify:release` raporlarına göre kırıkları düzelt. Son release/check, HTTPS yayın akışı ve site test alanı deploy; dağınık eski test APK/feed sürümlerini ve resmi `product-version.json`ı tutarlı hâle getir.
- Alwaysdata siteler staging'dir: gerçek firma domainine **taşıma kararı gelmedikçe** migration/production migration/gerçek müşteri backup çalışması yok.

## Oturum kapatma kanıtı ve başlangıç cümlesi

**2026-11-01 kapanışı:** Politikalar `AGENTS.md` ve `docs/dev/TEST_ENVIRONMENT_POLICY.md` içinde. G0 başlamadan önce hiçbir dosya resetlenmedi, commit/push veya deploy yapılmadı; `git diff --check` PASS. OpenCode aktif oturum yok. Yeni oturumda en güncel `git status` yeniden alınacak.

**Yeni session başlangıcı:**

> Nexa, Yardımcı Asistan C33 sonrasından devam edelim. Önce `AGENTS.md`, `docs/dev/TEST_ENVIRONMENT_POLICY.md` ve `docs/dev/NEXT_SESSION_GIT_AND_BACKLOG_2026-11-01.md` belgelerini oku. Her Alwaysdata sitesi test ortamı; migration/backup yükü yok. Git çalışma ağacında yaklaşık 406 değişiklik var, ilk işimiz bunları koruyarak sınıflandırmak, doğrulamak ve kontrollü Git checkpoint oluşturmak. Mevcut paralel admin/efekt dosyalarını koru; reset/stash/force-push yapma. Sonra G1 Teknikel demo site, G2 kalan Android fiziksel kabul, G3 test sayfası/UX ve G4 Windows/release/deploy sırasıyla ilerleyelim. Terminal ve OpenCode hazırsa kısa DeepSeek High dilimleri kullan.

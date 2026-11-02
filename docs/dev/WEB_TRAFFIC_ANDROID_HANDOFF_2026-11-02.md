# Site Trafiği / Android kapanış kontrolü — 2026-11-02

## Başlangıç ve durum

- Başlangıç Git HEAD `787eaea8` — temiz, `origin/main` 18 commit geride. Paralel Efekt Atölyesi / Demo / Teknikel checkpoint'leri korunmuştur. İstenen çalışma: (1) Site Trafiği + Dashboard, (3) Android Bayi oturum ve Companion son testleri; tam pre-main/release ve canlı deploy kullanıcıya ait sonraki aşama.
- OpenCode API ile iki dar High oturum başlatıldı: trafik `ses_e6348648affe0rEySMBVc8WCJy`, Android `ses_e634699a0ffemH4OLQcVNf6xdL`. **İkisi de `provider.free-limit` ile FAILED**. Başka sağlayıcıya sessiz düşüş veya alternatif model denemesi yapılmadı; kullanıcının limitte ara verme isteği uygulandı.

## Site Trafiği — uygulanmış ve hedefli PASS

- `firm-template/web-module/lib/traffic.php`, `api/traffic.php`: anonim, kısa bedenli ve allowlist'li aynı-origin olay girişi, salted hash oturum+idempotent event, günlük sayfa/kaynak toplulaştırması, 48 saat event dedupe ve 90 gün saklama; IP/full URL/referrer/UA/mail/telefon/kullanıcı kimliği saklanmıyor. Gerçek kişi değil **yaklaşık oturum** sayılır.
- `api/sync.php` sync-secret ile yetkili `traffic_snapshot` action (7/30 gün), `lib/storage.php` capability `traffic_analytics_v1`. Siteler için `web-site-template/public/assets/core/traffic.mjs` ve `site.mjs` ortak başlangıcı. Template manifest güncellendi.
- `apps/desktop-app/electron/web-traffic/snapshot.ts`: sadece main-process sync-secret, HTTPS POST, response normalization, source-keyed 5 dk in-memory cache, bozulmuş ağda stale özeti. `ipc/web-traffic-ipc.ts`, `main.ts`, `preload.ts`: IPC kilit sınırı ve salt okunur renderer metrikleri.
- Dashboard sağ sütununda `SiteTrafficCard.tsx`: Bugün/7 gün küçük gösterge, 7/30 gün hover+tıklama+klavye üst katman popover, kaynaklar, popüler sayfalar, niyet tıklamaları, son ölçüm ve ölçüm eksikliği; site kapalıysa görünmez. Dashboard CSS ve fixture/mock/sınır testleri güncellendi.
- **PASS:** `php scripts/test-web-traffic.php`; `node scripts/test-web-traffic.mjs` 7/7; üç PHP dosyası `php -l`; Electron+React TypeScript `tsc --noEmit`; `scripts/smoke-dashboard-workspace.mjs`; gerçek dist-electron üzerinden `scripts/smoke-runtime-boundary-lock.mjs` 323 korumalı invoke; registry `10/10`; `git diff --check`.
- **Henüz tamamlanmadı:** Web ayarlarında sayaç aç/kapat yüzeyi (PHP `traffic_enabled` config bayrağı var); doğrulanmış talep/sipariş dönüşüm metriğini sunucu sipariş tablolarından ayrı olarak ekleme; Marketing Analytics içindeki eski “Ziyaret verisi toplanmıyor” metnini düzeltme; uygulama görünümünün gerçek Desktop/Windows görsel kabulü, canlı sahte trafik ile e2e/tekilleştirme ve alt site şablonlarına güvenli sync/deploy. Bu yüzden **tam V1 ürün kabulü veya canlı kullanıma hazır ilan etme.**

## Android — regresyonlar PASS, TTL açık

- Compan-ion hedefli regresyonları exit 0: `scripts/smoke-companion-points-production-path.mjs` (gerçek TLS pozitif puan + sıfır puan nakit earn, settle/ACK/replay), `scripts/smoke-companion-coupon-sale.mjs` (kupon/TLS/earn/ACK), `scripts/smoke-android-sale-owner-refund.mjs` **10/10**, `scripts/smoke-market-sale-full-refund-ui.mjs` PASS.
- Android Bayi 30 dk sonrası refresh kök nedeni hâlâ kanıtlanmadı/düzeltilmedi. Android ajan `DealerSession.java` ve `DealerSessionTest.java` taslaklarını tamamlayamadan kotaya takıldı; **kaynak ağacında derlemeyi kirletmesinler diye** `/tmp/ya-android-refresh-wip/production/` ve `/tmp/ya-android-refresh-wip/test/` altına taşındı. Bunlar test edilmemiştir, commit'e dahil edilmez.
- Android Bayi “Beni hatırla” önceden kod/commit (`29e5fe8c`) olarak hazır, telefondaki 2.1.6/code22 bu özelliği henüz içermiyor. Resmî yeni Android sürümü **code>22** olmalı. Gerçek canlı Bayi revoke/demotion, Companion ağ kesme/cihaz idempotent retry + fiziki iade, TTL yenileme ve güncel Companion OTA paket kabulü ayrı kapsamda açık.
- Telefonda kurulu Bayi/Companion değiştirilmedi, uygulamalar kapalı bırakıldı. Git push/deploy/Windows paketleme veya tam pre-main/release çalıştırılmadı.

## Güvenli devam

1. OpenCode ücretsiz limit yeniden müsait olduğunda iki High session'a geri dön veya doğrudan kodu sürdür; farklı provider'a otomatik düşme yapma. Önce PHP + Dashboard plan açıklarını kapat, `traffic_snapshot` endpoint'i ve tekilleştirmeyi gerçek tarayıcı üzerinden sentetik localhost fixture ile doğrula, settings ve marketing metinlerini tamamla; tam pre-main öncesi hedefli smoke + manifest.
2. Bayi gerçek 30 dakika expiry reproducer ile refresh, revocation ve opt-in `Beni hatırla` davranışlarını güvenli test fixture üzerinde doğrula; izole APK/native test, sonra gerekirse code>22 imzalı OTA.
3. Companion fiziksel testleri ve kesinti/iade/ACK kabulü, ardından kullanıcı çalıştıracağı tam pre-main/release, demo/Teknikel staging deploy, en son Windows gerçek cihaz kabulü.

# D4 — Pazarlama Stüdyosu ve Website Yayınlama

Başlangıç: `main`, `e351aaa47509424d1521a1da014dac5d6fb6b56c`, temiz çalışma ağacı.
Uygulama doğrudan `main` üzerinde yapıldı. Commit/push ve uzak siteye deployment yapılmadı.

## Teslim edilen akış

`marketing.studio` bütün işletme profillerinde isteğe bağlı ve varsayılan kapalıdır.
Ayarlar > İşletme'den açıldığında Pazarlama navigasyonu görünür. İçerik Stüdyosu,
Kampanyalar, Yayınlar ve Medya aynı merkezde bulunur. Kampanyalar mevcut D2/D3
`CampaignsPage`, consent/segment/outbox ve dispatch operasyonlarını kullanır;
`messaging.campaigns` yetki kapısı korunur. Pazarlama açıkken bağımsız Kampanyalar
menüsü tekrarlanmaz.

Kullanıcı ana metni elle yazar veya AI taslağını açıkça uygular; bağımsız Website,
WhatsApp, SMS ve Instagram varyantlarını düzenler. Yüklenen/üretilen görseller ortak
Medya kütüphanesine girer. Website önizlemesinde metin, görsel seçimi ve sıra
düzenlenebilir. Yayınla eylemi kalıcı yayın intent'i oluşturur. Yayınlar ekranında
canlı metin/görsel/sıra düzenlenir, güncellenir ve açık onayla yayından kaldırılır.
Önizleme yayın kaydı oluşturmaz. Kaydedilmemiş editör verileri gezinme korumasına
bağlıdır; durum yenilemesi veya arka plan polling'i editör taslağını ezmez.

## D-038 ve model sahipliği

Karar: [D-038](../architecture/DOMAIN_DECISIONS_V1.md#d-038--marketing-studio-channel-publications-and-reusable-media).

| Kavram | Sahibi ve davranışı |
| --- | --- |
| MarketingContent | İşletmeye ait ana içerik; announcement/promotion, manual/ai, draft/ready/archived, optimistic revision. Campaign, publication, asset ve provider request'ten ayrı. |
| MarketingContentVariant | Content + channel anahtarı; bağımsız başlık/metin ve sürümlü, typed adaptation metadata. SMS 160 karakterle sınırlı. |
| MediaAsset | Focused canonical store ve immutable dosya; işletme, kaynak, boyut, MIME, hash, alt text, arşiv zamanı ve temizlenmiş AI metadata. |
| MarketingContentMedia | Ortak görsel ilişkileri, kararlı sortOrder ve primary/gallery rolü. |
| MarketingPublication | Content'e bağlı kanal instance'ı; ayrı editable başlık/metin/medya snapshot'ı. D4'te yalnız Website yürütülebilir. |
| MarketingPublicationMedia | Yayın seçimi ve sırası; content ilişkilerinden bağımsız. |

Persistans `DesktopDatabase` facade üzerinden yürür; şema yalnız mevcut
`apps/desktop-app/db/schema.sql` içinde tanımlıdır. Tarihsel migration zinciri eklenmedi.
İçerik arşivlemek canlı yayını kendiliğinden kaldırmaz. Arşivlenmiş içerikten yeni
yayın veya yeniden yayınlama engellenir.

## Asset storage ve çoklu görsel lifecycle

Dosyalar `userData/assets/marketing/files/<opaque-asset-id>.png` altında tutulur.
SQLite içerik/yayın içine binary/base64 gömülmez. Yükleme ve AI çıktısı aynı
nativeImage doğrulama hattından geçer: 30 MB, 40 milyon piksel, PNG'ye yeniden
kodlama, metadata temizleme ve hash. Renderer yalnız geçici küçük önizlemeleri ve
asset kimliklerini alır; dosya yolu/hash renderer yayın girdisi değildir.

Website en fazla 20 görsel destekler; sınır typed registry'den gelir. İçerik ve yayın
aynı asset'i yeniden kullanabilir. Kullanım sayısı content ilişkilerini, yayın
ilişkilerini, son onaylı canlı snapshot'ı ve bütün bekleyen/in-flight medya intent'lerini
hesaba katar. Arşiv yeni seçimleri engeller, mevcut ilişkileri korur. Herhangi bir
ilişki varken fiziksel silme reddedilir. Canlı yayından görsel çıkarıldığında veya
yayın kaldırıldığında, web ack gelmeden dosya koruması kaldırılmaz.

## AI capability ve privacy kararı

Marketing UI provider adı bilmez. Resolver `text_generation`, `rewrite`,
`channel_adaptation`, `image_generation` yetenekleri için mevcut kayıtlı AI profillerini
ve safeStorage anahtarlarını kullanır; seçili uygun profili, sonra uygun alternatifleri
seçer. AI Core OpenAI-compatible text hattı korunur. Görsel üretimi ai-core içinde
OpenAI Images ve Gemini generateContent adaptörleriyle sağlanır; custom image endpoint
için eşleşen kayıtlı model gerekir. Desteklenmeyen/anahtarsız profiller güvenle devre dışıdır.
Provider hesabının izin/kota erişimi üretim sırasında doğrulanır.

AI sonucu taslaktır. Metin kullanıcı kabulünden sonra editöre uygulanır. Görsel önce
canonical asset olur; önizlenir, kütüphanede tutulur, silinir veya içeriğe eklenir.
AI üretimi hiçbir publication oluşturmaz ve publish çağırmaz.

Provider girdileri yalnız editoryal metin, amaç, stil ve kanal özetidir. Recipient/
segment müşteri listeleri bağlanmaz. Bilinen müşteri adları yalnız yerel redaction
sözlüğü için okunur; sözlük provider'a gönderilmez. Telefon/kimlik numaraları,
e-posta ve belirgin credential kalıpları maskelenir. Raw prompt, tam generated body,
binary ve secret diagnostic metadata'ya alınmaz. Asset AI metadata yalnız
provider/model kimlikleri ve sabit `marketing_image` intent'idir.

## Channel registry ve Settings sahipliği

Registry statik ve typed'dır; channel ile provider ayrı kavramlardır. Website text,
çoklu görsel, direct publish, edit, unpublish ve connection test destekler. WhatsApp
durumu mevcut D1 configuration'dan okunur; D1 kartı ve kontrollü campaign dispatch
korunur. SMS/Instagram görülebilir planned kanallardır, gerçek publish kapalıdır.
Genel boş SMS credential formu veya ikinci secret persistence hattı eklenmedi.

Website aynı staged Settings > Servisler URL/sync secret kaynağını kullanır.
Mevcut web bağlantı testi korunur; ayrı Website yayın testi kaydedilmiş bağlantıyla
`marketing_website_publications` desteğini kontrol eder. AI/social provider secret'ı
renderer'a geri okunmaz. D5 adapter'a özgü sosyal credential alanlarını ve safeStorage
yazımını sahiplenir. Runtime plugin discovery, service locator ve generic operation
bus eklenmedi.

## Website publication, revision ve sync

Tek placement `homepage_feature`'dır. Content/variant değişiklikleri canlı publication'ı
kendiliğinden değiştirmez. Yayın editörü bağımsız title/text/ordered media snapshot'ını
düzenler; her edit/state intent'i revision artırır. `publishedRevision` yalnız
gönderilen revision web tarafından onaylandığında ilerler. Daha yeni eşzamanlı intent
eski ack ile onaylanmaz. Unpublish revision taşıyan tombstone'dur. Failed intent kalıcı
outbox'ta kalır ve mevcut retry/backoff mekanizmasını kullanır.

Açık yayınla/güncelle/kaldır eylemi mevcut `SyncCoordinator.runNow()` ile otomatik
eşitleme kapalıyken de çalışır; otomatik eşitleme tercihini değiştirmez. Devam eden
döngünün snapshot'ından sonra gelen yeni intent için bir ek drain talebi vardır.
Desktop authoritative'dır. `marketing_website_publish` job'u mevcut outbox, source
revision ledger, idempotency key/receipt ve matching ack semantiğini kullanır.

Medya mevcut streaming multipart transport ile hash içeren deterministik module-owned
yola yüklenir. Public projection yalnız opaque kimlikler, public metin, yerel public
görsel URL'leri, ölçüler/alt text/sıra taşır. PHP whitelist ve gerçek dosya/ölçü
doğrulaması uygular. Canonical content, yerel storage reference, AI metadata ve secret
web projection'a girmez. Rendering textContent kullanır; yayından kaldırılan yayınlar
public API ve bloktan gizlenir. Responsive çoklu görsel galeri generic embeddable
`duyurular/marketing.js`/CSS ve standalone `/duyurular/` yüzeyinde çalışır. Demo ana
sayfa bu generic bloğu kullanır. Web deploy paketi yeni endpoint ve yüzeyleri içerir.

## Diagnostics

`marketing.content.created`, `marketing.content.ai_generated`,
`marketing.asset.created`, `marketing.asset.ai_generated`,
`marketing.publication.created`, `marketing.publication.published`,
`marketing.publication.updated`, `marketing.publication.unpublished`,
`marketing.channel.connection_test` structured API üzerinden üretilir.
Sync ack olayları sync operationId'sini taşır. Metadata opaque kimlik/channel/count
ile sınırlıdır. IPC session lock servis erişiminden önce ve async dönüşten sonra
kontrol edilir.

## Targeted doğrulama

| Kontrol | Sonuç |
| --- | --- |
| `npm run verify:domain -- marketing` | **7/7 geçti**: shared/package ve desktop build, gerçek Electron media, content/assets/AI/registry, UI akışı, PHP lint, gerçek PHP hosting/sync/gallery. Rapor: `artifacts/verify/2026-10-04T21-06-37-893Z.json`. |
| `node scripts/smoke-marketing-studio.mjs` | Son eklenen before/after-await IPC session lock kontrolü de geçti. Resolver fallback, Gemini fixture, provider unavailable/failure, privacy ve no-auto-publish doğrulandı. |
| `npm run verify:check -- typecheck` | Workspace TypeScript geçti; `artifacts/verify/2026-10-04T20-51-21-204Z.json`. |
| `npm run verify:check -- typecheck-electron` | Electron TypeScript geçti; son preload düzeltmesinden sonra tekrar kontrol edildi. |
| `npm run verify:check -- lint-strict` | Geçti. |
| `npm run verify:check -- architecture-audit` | Geçti. |
| `node scripts/test-verification-registry.mjs` | **9/9 geçti**; dört yeni smoke canonical registry'de. |
| `node scripts/package-web-module.mjs` | Paket doğrulandı, 80 dosya; tracked widget snapshot değişmedi. |
| D1/D2/D3 `business-messaging` domain | Foundation/provider/hosting/webhook/UI, campaign domain, dispatch/lifecycle ve ilişkili DB/logging regresyonları geçti. İlk domain raporundaki dört başarısız kontrol aşağıda açıklanır. |
| `node scripts/smoke-automatic-sync.mjs` | Yeni marketing feature'ın beklenen capability listesine eklenmesinden sonra geçti. |
| `node scripts/smoke-messaging-campaigns-ui.mjs` | Port çakışması giderilip tek başına çalıştırılınca geçti. |
| `node scripts/smoke-messaging-dispatch-ui.mjs` | Port çakışması giderilip tek başına çalıştırılınca geçti. |
| `node scripts/smoke-settings-platform.mjs` | İlk concurrent koşudaki timeout sonrası tek başına geçti. |
| `node scripts/smoke-commerce-online-catalog.mjs` | Geçti. |
| `node scripts/smoke-commerce-online-catalog-ui.mjs` | Concurrent koşudaki port/timeout sonrası tek başına geçti. |
| `node scripts/smoke-web-dealer-portal.mjs` | Geçti. |
| `node scripts/smoke-web-storefront.mjs` | Geçti. |
| `node scripts/smoke-workspace-platform.mjs` | Customer Workspace dahil geçti. |
| `git diff --check` | Geçti. |

İlk business-messaging aggregate raporu `artifacts/verify/2026-10-04T20-51-35-606Z.json`
19/23'tür; bu raporun sonucu değiştirilmedi. Başarısız automatic-sync fixture beklentisi
uyarlandı; D2 UI/D3 UI/Settings aynı Vite portunu kullanan concurrent koşudan çıkarılıp
sırayla tekrar çalıştırıldı ve geçti. Full Verify, Pre-main ve Release aggregate
çalıştırılmadı. AI provider çağrıları fixture yanıtlarıyla sınandı; canlı credential
ve ücretli üretim yapılmadı. Website publish gerçek yerel PHP sunucusunda doğrulandı;
uzak siteye deployment yapılmadı.

## Ayrı raporlanan başlangıç hataları

Her ikisi temiz `e351aaa4` arşivinde de aynı sonuçla doğrulandı:

- `knip-strict`: mevcut admin console'da 10 kullanılmayan dosya.
- `design-audit-strict`: mevcut `market.css` içinde 7 duplicate selector;
  raporda mevcut `menu-preview.css` raw color envanteri de bulunuyor.

Bu dosyalarda D4 dışı düzeltme yapılmadı. Desktop build'in mevcut büyük chunk uyarısı
build'i başarısız kılmıyor.

## Önerilen commit mesajı

`feat(marketing): add D4 content studio, media library and website publishing`

## Çalışma ağacı teslim kaydı

Aşağıdaki liste gerçek Git çıktısıdır. `git diff --stat` untracked yeni dosyaları
saymaz; yeni dosyalar ayrı envanterde ve `git status --short` içinde yer alır.

Yeni dosyalar: 31 dosya (rapor ekleri öncesi 1460 satır).

```text
apps/desktop-app/electron/ipc/marketing-ipc.ts
apps/desktop-app/electron/marketing/ai-service.ts
apps/desktop-app/electron/marketing/asset-store.ts
apps/desktop-app/electron/marketing/channel-registry.ts
apps/desktop-app/electron/marketing/marketing-persistence.ts
apps/desktop-app/electron/marketing/media-service.ts
apps/desktop-app/electron/marketing/service.ts
apps/desktop-app/electron/marketing/store.ts
apps/desktop-app/electron/marketing/validation.ts
apps/desktop-app/electron/marketing/website-publication.ts
apps/desktop-app/src/components/marketing/MarketingMediaGallery.tsx
apps/desktop-app/src/components/marketing/MarketingPublicationEditor.tsx
apps/desktop-app/src/components/settings/MarketingChannelsSettingsSection.tsx
apps/desktop-app/src/pages/MarketingPage.tsx
apps/desktop-app/src/styles/pages/marketing.css
docs/dev/D4_MARKETING_STUDIO_REPORT.md
firm-template/web-module/api/marketing-media.php
firm-template/web-module/api/marketing.php
firm-template/web-module/duyurular/index.php
firm-template/web-module/duyurular/marketing.css
firm-template/web-module/duyurular/marketing.js
firm-template/web-module/lib/marketing.php
packages/ai-core/providers/image-generation.ts
packages/shared/types/marketing.ts
scripts/fixtures/marketing-media-native.cjs
scripts/fixtures/marketing.tsx
scripts/smoke-marketing-media-native.mjs
scripts/smoke-marketing-studio.mjs
scripts/smoke-marketing-ui.mjs
scripts/smoke-marketing-website.mjs
scripts/test-helpers/marketing-fixtures.mjs
```

`git diff --stat`:

```text
 apps/desktop-app/db/schema.sql                     | 51 ++++++++++++++-
 apps/desktop-app/electron/database-types.ts        |  2 +-
 apps/desktop-app/electron/database.ts              | 15 +++++
 .../electron/database/sync-runtime-store.ts        |  2 +-
 apps/desktop-app/electron/main.ts                  | 18 ++++++
 apps/desktop-app/electron/preload.ts               | 14 +++-
 apps/desktop-app/electron/sync-coordinator.ts      | 21 ++++++
 apps/desktop-app/src/app/navigation.ts             | 11 +++-
 apps/desktop-app/src/app/settings-registry.ts      |  7 ++
 .../src/components/app/DesktopWorkspaceRouter.tsx  |  3 +
 .../settings/BusinessCapabilitySettings.tsx        |  1 +
 .../components/settings/ServiceSettingsCard.tsx    |  8 +--
 .../settings/ServicesSettingsSection.tsx           |  2 +
 .../src/components/settings/WebSettingsSection.tsx | 32 ++++++----
 apps/desktop-app/src/styles/index.css              |  1 +
 docs/architecture/DOMAIN_DECISIONS_V1.md           | 74 ++++++++++++++++++++++
 firm-template/web-module/README.md                 | 17 +++++
 firm-template/web-module/api/sync.php              | 23 ++++++-
 firm-template/web-module/lib/storage.php           |  1 +
 packages/ai-core/index.ts                          |  1 +
 packages/shared/index.ts                           |  1 +
 packages/shared/types/business-capabilities.ts     |  3 +-
 packages/sync-core/hosting-transport.ts            |  9 +++
 packages/sync-core/index.ts                        |  2 +
 scripts/package-web-module.mjs                     |  6 ++
 scripts/php-lint.mjs                               |  4 ++
 scripts/smoke-automatic-sync.mjs                   |  1 +
 scripts/verification-registry.mjs                  |  8 ++-
 test-site/landing/demo/index.php                   |  6 +-
 29 files changed, 315 insertions(+), 29 deletions(-)
```

`git status --short`:

```text
 M apps/desktop-app/db/schema.sql
 M apps/desktop-app/electron/database-types.ts
 M apps/desktop-app/electron/database.ts
 M apps/desktop-app/electron/database/sync-runtime-store.ts
 M apps/desktop-app/electron/main.ts
 M apps/desktop-app/electron/preload.ts
 M apps/desktop-app/electron/sync-coordinator.ts
 M apps/desktop-app/src/app/navigation.ts
 M apps/desktop-app/src/app/settings-registry.ts
 M apps/desktop-app/src/components/app/DesktopWorkspaceRouter.tsx
 M apps/desktop-app/src/components/settings/BusinessCapabilitySettings.tsx
 M apps/desktop-app/src/components/settings/ServiceSettingsCard.tsx
 M apps/desktop-app/src/components/settings/ServicesSettingsSection.tsx
 M apps/desktop-app/src/components/settings/WebSettingsSection.tsx
 M apps/desktop-app/src/styles/index.css
 M docs/architecture/DOMAIN_DECISIONS_V1.md
 M firm-template/web-module/README.md
 M firm-template/web-module/api/sync.php
 M firm-template/web-module/lib/storage.php
 M packages/ai-core/index.ts
 M packages/shared/index.ts
 M packages/shared/types/business-capabilities.ts
 M packages/sync-core/hosting-transport.ts
 M packages/sync-core/index.ts
 M scripts/package-web-module.mjs
 M scripts/php-lint.mjs
 M scripts/smoke-automatic-sync.mjs
 M scripts/verification-registry.mjs
 M test-site/landing/demo/index.php
?? apps/desktop-app/electron/ipc/marketing-ipc.ts
?? apps/desktop-app/electron/marketing/
?? apps/desktop-app/src/components/marketing/
?? apps/desktop-app/src/components/settings/MarketingChannelsSettingsSection.tsx
?? apps/desktop-app/src/pages/MarketingPage.tsx
?? apps/desktop-app/src/styles/pages/marketing.css
?? docs/dev/D4_MARKETING_STUDIO_REPORT.md
?? firm-template/web-module/api/marketing-media.php
?? firm-template/web-module/api/marketing.php
?? firm-template/web-module/duyurular/
?? firm-template/web-module/lib/marketing.php
?? packages/ai-core/providers/image-generation.ts
?? packages/shared/types/marketing.ts
?? scripts/fixtures/marketing-media-native.cjs
?? scripts/fixtures/marketing.tsx
?? scripts/smoke-marketing-media-native.mjs
?? scripts/smoke-marketing-studio.mjs
?? scripts/smoke-marketing-ui.mjs
?? scripts/smoke-marketing-website.mjs
?? scripts/test-helpers/marketing-fixtures.mjs
```

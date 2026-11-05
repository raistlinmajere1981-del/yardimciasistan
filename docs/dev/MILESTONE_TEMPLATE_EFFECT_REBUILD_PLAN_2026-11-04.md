# Milestone Öncesi Ortak Şablon + Efekt Motoru Geçiş Planı

Tarih: 2026-11-04 · Durum: **Planlandı; uygulama, yeni sürüm ve staging sıfırlaması yapılmadı.**

## Karar ve sıfırlama yetkisi

Bütün yayımlı müşteri siteleri ve masaüstü bağlantıları test içindir. **Mevcut efekt kayıtları da korunmayacak.** Bu izin şu **geçici içerikleri** içerir:

- Efekt Atölyesi veritabanındaki test efekt projeleri, parametreleri, bölge tanımları, ayar/atama kayıtları, önizleme çıktıları.
- Sitelerdeki yayımlı efekt reçeteleri, hero sahne kayıtları/JSON yayınları ve eski efekt sürümü referansları.
- Eski site yayın verileri, kaynak/bağlantı kimlikleri, test müşteri/bayi hesapları, istemci senkronizasyon anahtarları, eski önbellek ve test veritabanları.
- Demo ortamdaki yerel uygulama verileri ve restore sonrası eski bağlantı konfigürasyonları.

**Korunacak olanlar test kayıtları değil, üretilebilir kaynaklardır:** EfektAtolyesi kaynak kodu, runtime/model/registry ve yeni efekt yetenekleri; Admin Panelinin efekt editörü ve yayın sözleşmeleri; ortak şablon, siteye özel logo/özgün görseller/medya, Teknikel ürün arşivi, mevcut demo ZIP üreticileri, belge/test kaynakları, Git tarihçesi. Bunlar da gerektiğinde yeniden düzenlenebilir, ancak veri temizliği sırasında rastgele silinmez. Eski `hero.scene.json` veya örnek sahneler uyumsuzsa **taşınmayacak**, güncel motorla yeni sahne oluşturulacak.

Her test sitesi için temiz başlangıç, eski efektif verinin migration/backfill gerekmeden silinmesi anlamına gelir. Canlı ortamlarda veya dış hizmetlerde bu projeye ait olmayan kimlik ve dosyalara dokunulmaz.

## 1. Release doğrulama engelleri

Son rapor: `artifacts/verify/2026-11-04T17-23-49-190Z.json` — 292 PASS / 11 FAIL. Registry'deki eksik testler, 335/333 IPC sözleşmesi, ModalSurface mimari kuralı, Desktop–Hosting STT model politikası, UI test drift'i, lint strict ve desktop-renderer sorunları hedefli çözülür. IPC sayısı kör artırılmaz; yetki korunur. Sonraki pre-release ancak bu kapılar yeşil olduktan sonra.

## 2. Ortak şablonu aktif sitelere taşı

Kaynak: `web-site-template/`; `firm-template/web-module/` backend ve yayın/ACK sahibidir. Siteye özgü alanlar tema/marka/medya ve özel sayfa kompozisyonudur; widget, request, dil, yayın izinleri, hesap/bayi/sepet ve ortak UI sözleşmeleri tek sürümden tüketilir.

- Teknikel: özel `index.php → inc/layout.php → assets/` akışını ortak çekirdeğin gerçek girişine bağla. Eski özel widget/request/localization kopyalarını davranış eşitliği kanıtlandıktan sonra kaldır. Bayi oturumu, özel fiyat, sepet ve işlem tekrar denemelerini test et.
- Gündoğdu: kök `inc/site.php` ve `assets/js/` üzerinden çift locale/yayın/projection sahipliğini kaldır; ortak çekirdeğe bağla. Oda/masa, QR, panorama 180/360 ve hero sahne testleri geçmeli.
- BlackSea ve demo: ortak çekirdek release'ine yükselt, site kimliklerini ve demo showcase'ini koru.
- Gerçek deployment artifact'ı için `template-manifest.json` hash/entrypoint/override/provenance kontrolleri zorunlu; yalnız `canonical/` kopyalarının güncel olması yeterli sayılmaz. Mevcut `tools/update-plan.mjs` üç yönlü çatışma kontrolü kullanılmalı; core forklarına izin verilmez.

## 3. Efekt motorunu tekleştir

- Tek kaynak: `~/YardimciWorkspace/EfektAtolyesi/`. Runtime, registry, model, flame/glow/smoke ve sceneObject gibi yeni özelliklerin gerçek içeriği/kontratı esas alınır. `1.1.0` etiketi tek başına eşitlik kanıtı değildir.
- Admin Paneli ve `web-site-template/public/assets/vendor/effect-engine/` kopyaları aynı kaynak commit/sha256 envanterinden üretilir. Motor sürümü, scene formatı ve API uyumluluğu doğrulanır.
- **Mevcut efekt sahnelerini/verilerini dönüştürmeye çalışma.** Eski DB kayıtlarını, sitedeki reçete JSON'larını, önizleme çıktılarını ve atama verilerini temizle; uyumlu birkaç yeni test sahnesini yeni motorla sıfırdan oluştur.
- Efekt yokken gereksiz runtime çalışmamalı; hatalı sahneler statik görsele düşmeli. Mobil/reduced-motion, 180/360 ve etkileşimli sahneler test edilmeli.

## 4. Merkezi kontrat matrisi

Gerçek site entrypoint/deploy paketinde aynı fikstürler:
AI ON/OFF, Talepler ON/OFF (AI kapalıyken genel/ürün talebi), bayi başvurusu, WhatsApp, yön tarifi; Çoklu Dil OFF/ON, eski URL/çerez, RTL ve yayınlanmış metin hash'i; satış/stok/bayi özel fiyat/sepet/session/retry; medya 180/360, efektler ON/OFF/reduced-motion; boş yayın, restore/yeni source fencing ve bütün yayınların ACK eşitlenmesi. 320/390/768/1440px. Bu matris verification registry'ye bağlanır.

## 5. Agresif temiz kurulum ve sürüm yayını

Önce Faz 1–4 yeşil. Sonra her staging web modu/site ve yerel Desktop/Android test verileri sıfırlanır; **efekt verileri de sıfırlanır**. Eski site bağlantı kimlikleri/secret, test hesapları ve publication epoch/önbellek temizlenir. Tek yeni kaynakla bağlantı kurulur, sıfır/kapalı yayınlar dahil bütün public yüzeyleri yeniden yayımlanır; ACK/HTTP/gerçek tarayıcı doğrulanır. Teknikel demo ZIP indirme dosyası, kaynak ürün fotoğrafları ve yeniden üretim araçları korunur; gerekli test verileri paketten yeniden yüklenebilir. Sürüm metadata, Windows x64/x86, Android Companion/Bayi ve Hosting aynı release sözleşmesinde doğrulanır. Kapanışta repo commit/push ve deploy receipts kayıt altına alınır.

## Kabul / çıkış koşulları

- Hedefli hatalar ve tam release doğrulaması **0 FAIL**.
- Ortak şablonun **aktif** Teknikel/Gündoğdu/BlackSea/demo dosyalarında aynı manifest ve widget sürümü doğrulanmış.
- Admin Efekt Atölyesi ve site efekt motorları aynı hash/provenance; eski efekt kayıtlarına hiçbir bağımlılık kalmamış.
- Tüm siteler yeni, tekil web kaynağından yayın okuyor; eski kaynak, eski secret veya hardcoded dil/AI fallback bulunmuyor.
- Tüm demo paketleri, site indirme yolları, güncelleme manifestleri ve hedef site dağıtımları smoke/HTTP testlerinde başarılı.

Referans analizler:
`docs/dev/WEB_PUBLICATION_CONTRACT_AUDIT_2026-11-04.md`
`docs/dev/SITE_TEMPLATE_CENTRALIZATION_AUDIT_2026-11-04.md`

## Uygulama kontrol noktası — 2026-11-04, 22:42 TR

**Parça 1 (yapısal kapılar) tamamlandı:** doğrulama registry'sine eksik beş kayıt eklendi; IPC iptal ve ZIP import kanalları güvenlik kontrolüyle runtime lock'a alındı; Nexa modal aydınlatması MutationObserver yerine React sinyali + ResizeObserver kullanıyor. Strict lint sorunları giderildi. Desktop ve Hosting STT seçimleri ortak STT_MODEL_POLICY ve explicit snapshot ile eşleştirildi; tanınmayan Cloudflare modellerine sessiz fallback yasak. Hedefli registry, boundary lock/scope, mimari denetim, lint strict, AI iptal, STT ayarları, STT masaüstü, hizmet kartı tarayıcı ve Desktop TS kontrolleri **PASS**. STT test fikstürleri gerçek service-prerequisites modülüne ve canlı kataloga uygun düzenlendi.

**Parça 2 (UI test drift) tamamlandı:** business messaging, desktop renderer, desktop TTS, Instagram OAuth ve Settings Platform testleri yeni bütünleşik servis kartı/üst çubuk geri bildirimine ve hover geçişine göre güncellendi. Gerçek Linux host üzerinde beş hedefli tarayıcı testi **5/5 PASS**, git diff --check PASS. Sandbox EPERM nedeniyle tarayıcı testleri Codex dışında hostta koşuldu.

**Önemli ayrım:** Önceki `artifacts/verify/2026-11-04T17-23-49-190Z.json` raporunda 292 PASS / 11 FAIL bulunuyordu; bu 11 başarısızlığın ilgili hedefli denetimleri artık **PASS**. **Yeni tam pre-main/release verify ÇALIŞTIRILMADI**, dolayısıyla rapordaki 11 sayısı otomatik sıfırlanmış sayılmaz. Kullanıcı tam doğrulamayı sonra kendisi çalıştıracak.

**Sıradaki bağımsız parça:** EfektAtolyesi `src/runtime, registry, model` → kanonik `web-site-template/public/assets/vendor/effect-engine` senkronizasyonunu, sceneObject/flame/glow/smoke ve provenance/hash sözleşmesini temizle; mevcut eski efekt verilerini/migration'ı taşıma. Ardından Teknikel/Gündoğdu aktif entrypoint'lerini ortak çekirdeğe taşıma, BlackSea+demo sözleşme testleri, test verisi reseti, yeni sürüm/deploy. Her parça ≤30 dakika, yalnız hedefli test, sürüm/temizlik/deploy ancak entegrasyon kapıları sonrası.

**Bu oturumda yapılmayanlar:** DB veya eski efekt verisi silme, migrasyon, web deploy, commit/push, sürüm yükseltme, tam verify, release.

## Chunk 3 checkpoint — canonical effect engine synchronization (2026-11-04)

- Oturum: Codex `01a1a825-e347-7631-afe4-9febf0305230`; mevcut `main`, HEAD `67b2bb3b76a39290c3363945e4be88152d054a24`. Başlangıçtaki çok sayıdaki dirty değişiklik, özellikle Admin sahne editörü, korundu. OpenCode/alt ajan/ağ çağrısı, commit/push, sürüm artırımı, deploy, DB veya efekt proje kaydı değişikliği yok. Eski sahne/veri migration'ı yok; temizlik henüz yapılmadı. EfektAtolyesi kaynak ağacı salt okundu. Kaynak package.json içermiyor; doğrudan Node test dosyaları kullanıldı.
- `web-site-template/tools/sync-effect-engine.mjs`: sürüm metnini eşitlik kanıtı saymak yerine kaynaktaki ENGINE_VERSION + desteklenen semantik major/API ve v1/v2 şema/sceneObject kayıtlarını kontrol eder. Model/registry/runtime için deterministik SHA-256 envanteri, format 2 provenance ve kaynak fingerprint'i üretir. Symlink/ancestor, kapsam dışı import, beklenmeyen dosya/boş dizin kontrolleri; doğrulanmış staged kopya, eski hedefi rename ile saklama ve yayın hatasında rollback. Crash-atomic exchange iddiası yok; rollback de başarısızsa önceki ağaç geçici kardeş dizinde korunur. `--check` salt okunur, otomatik onarım yok.
- Vendor 13 → **19 modül**: kanonik model/registry/runtime güncellendi; `object-compile.mjs`, `object-overlay.mjs`, `object-scene.mjs` ve `effects/{flame,glow,smoke}.mjs` eklendi. Kaynak, template ve Admin üçlü byte/hash eşitliği doğrulandı. Motor sürümü **1.1.0**; fingerprint **078c2ac168547a04e1ec5716239100e7fcd910dc67a1eb703878c80577a0f39f**. Değişmeyen kanonik modüller de provenance envanterine dahil.
- Admin: önceden dirty `scripts/sync-effect-studio.mjs` içindeki tam editor + scene kopyalama kapsamı korundu; staged sync ve `--check` eklendi. Mevcut ignored snapshot zaten 19 modülde aynıydı; **tam sync yapılmadı**, yalnız `--write-provenance` ile yeni `apps/admin-control-center/effect-engine-provenance.json` yazıldı. Editör/scene dosyalarına dokunulmadı. `package.json` predev/prebuild/prebuild:check artık yalnız check yapar; `effect:sync` açık yazar, `effect:check` salt okur. Provenance tam editörün değil, ortak üç motor ağacının kanıtıdır.
- Dar kontroller: yeni `scripts/test-effect-engine-sync.mjs` aynı sürüm altında değişik bayt, eksik modül, stale leftover, beklenmeyen dosya, symlink, dış import, uyumsuz major ve invalid kaynak karşısında hedef koruması; deterministik sync/check; üçlü tutarlılık; minimal sceneObject flame/glow/smoke compile/update/render; bozuk JSON/şema ve reduced-motion statik fotoğraf fallback'ini sınar. `scripts/verification-registry.mjs` içine yalnız hedefli `effect-engine-consistency` kaydı eklendi (önceden dirty kayıtlar korundu). `scripts/smoke-web-site-template.mjs` sabit sürüm etiketi yerine ortak semantik/provenance doğrulamasını kullanır; tam browser smoke bu dilimde çalıştırılmadı.
- Belgeler: `web-site-template/README.md`, `apps/admin-control-center/EFFECT_STUDIO.md`, bu checkpoint ve continuation backlog. Manifest yalnız yeni vendor/araçlar doğrulandıktan sonra **`node web-site-template/tools/manifest.mjs --write`** ile üretildi; **template_version 0.6.1**, **76 common dosya**. `tools/manifest.mjs` ve update-plan sahiplik/symlink/üç yönlü kontrol kuralları değiştirilmedi.
- Son hedefli sonuçlar: `node --test --test-isolation=none scripts/test-effect-engine-sync.mjs` **5/5 PASS**; EfektAtolyesi `tests/{model,effect-actions,scene-object-model,scene-object-runtime}.test.mjs` **34/34 PASS**; Admin `tests/{effect-studio-deploy-link,effect-publication-service}.test.mjs` **8/8 PASS** (mevcut dist-electron servis çıktısı kullanıldı, yeniden build iddiası yok); `scripts/test-verification-registry.mjs` **10/10 PASS**. Dört değişen JS araç/test dosyasında hedefli ESLint **PASS**. Template manifest check, canonical `--check`, Admin `--check`, üçlü SHA-256 karşılaştırma, smoke syntax ve `git diff --check` **PASS**. Her yeni testin timeout'u 120s; gerçek koşular bir saniyenin altında. İlk varsayılan Node test izolasyonu sandbox `spawn EPERM` nedeniyle başarısızdı; Node 26 `--test-isolation=none` ile alt süreç açmadan tamamlandı. İlk lint'teki iki unsafe-finally hatası düzeltilip tekrar PASS alındı.
- Sınırlar: v2 motor ve minimal runtime hazır; statik fotoğraf site adaptörü hâlâ v1 fotoğraf bağlama kontratını korur, v2 DOM binding/yayın ayrı iştir. Admin/browser/Electron tam kabulü, gerçek yayın ve geniş pre-release doğrulaması yapılmadı. **Tam pre-release PASS iddiası yok.**
- Sonraki bağımsız dilim: Teknikel/Gündoğdu gerçek giriş/deploy yolunu ortak şablona bağlama; ardından açık yetkili staging sıfırlama ve yeni sahne/veri hazırlığı. Bu chunk hiçbir site kopyasını veya canlı ortamı güncellemedi. Büyük verify/pre-main/release/full ve paketleme kullanıcıya bırakıldı.


## Chunk 4A checkpoint — Teknikel active canonical cutover, LOCAL ONLY (2026-11-04)

**Status: local cutover implemented; NOT LIVE READY.** Current site branch `main`,
starting HEAD `0a27ed47c671be35ec3147c3415c0e4ac43fdcc8`. Existing extensive dirty
changes remain. No OpenCode/subagents, commit/push/deploy, remote read/write, API/data/
SQLite/key reset or full pre-main/release/verify/broad npm test. Source
`web-site-template/` was read-only; only this handoff is appended in the source repo.

- Verified installed canonical **0.6.1 / 70 clean common files**, incoming
  **0.6.1 / 76 clean files**. Unmodified upstream baseline-aware three-way planner:
  **13 changes, 0 conflicts, 0 missing source keys**. Explicit
  `scripts/update-canonical.mjs --apply <source>` staged the complete installation,
  checked hashes and retained the previous installation under ignored
  `.test-artifacts/canonical-updates/before-1793823613367`. Config/views/brand/theme/
  locales were preserved during the common update; subsequent changes were solely
  site-owned files. Final planner: no changes/conflicts. No common file was hand edited.
- Root `index.php` now carries `teknikel-site`, validates scalar/length/control-char/
  allowed query input and includes `canonical/public/index.php`. All 16 existing
  business/detail wrappers enter the same common alias/gate owner: magaza, katalog,
  urun, sepet, hesabim, bayi, markalar, galeri, odalar, odalar/oda, restoran, qr-menu,
  iletisim, yorumlar, duyurular, hakkimizda. Common aliases preserve semantic query
  fields and cart hash; account fragment tokens survive redirects. Supported query
  verify/reset tokens move into a fragment with no-store/no-referrer. There is no
  new publication, language, session, pricing, mutation or AI implementation.
- `scripts/sync-public-assets.mjs --apply|--check` explicitly installs/checks **47
  files** under `/assets/core`, `/assets/site`, `/assets/vendor/effect-engine` from
  canonical. It rejects symlinks, checks full inventories, stages and renames with
  rollback. No symlinks or build-time repair. Cross-directory crash atomicity is not
  claimed. The updater similarly fails on conflicts/unknown common files/catalog
  changes before installation; owned-tree bytes are fenced across the swap.
- **76/76** common hashes equal upstream; **19/19** engine module hashes equal
  canonical upstream, actual EfektAtolyesi source and actual Admin snapshot. Admin
  provenance and fingerprint match
  `078c2ac168547a04e1ec5716239100e7fcd910dc67a1eb703878c80577a0f39f`.
- Teknikel theme/logo retained. Product detail has a presentation-only
  `data-ya-action="request.general"` button for an existing public product ID;
  the unchanged common widget owns AI-OFF request/context/validation/idempotency.
  `/demo-icerik/` is a fixed alias for a site editorial extension using the common
  layout, with the original ZIP download path. ZIP integrity passes, originals/
  static source photos/import fixtures/customer tests are retained. Single source
  endpoint ID remains **teknikel-site**, **1,175 entries / 194,586 UTF-8 bytes**:
  common/theme keys plus all original site phrase keys and hashes preserved.
  Published target languages only; no hardcoded English dictionary was introduced.
- Old 224K widget and `assets/assistant/customer-request.js` remain locally intact
  pending equivalence review. They are excluded from the deployment allowlist and
  blocked by `.htaccess`, together with old root JS and `inc/`. Canonical stays
  HTTP-private. Rewrite fallback excludes `/yardimci-asistan` and preserves physical
  demo/route wrappers. The configured same-host public-GET API transport is retained;
  `YA_SITE_API_ORIGIN` overrides it for separate host fixture tests.
- `scripts/package-site.mjs` verifies and stages a **164-file** allowlisted package
  with SHA256SUMS and identity/version/template hash receipt. `deploy-site.sh
  --dry-run` is entirely LOCAL now (no SSH/curl); it checks assets, narrow acceptance,
  PHP rendering, ZIP and all packaged PHP syntax. `--yes` is a separate future action:
  ownership/version/receipt endpoint and symlink checks, staged transfer/checksums,
  backups without pruning, entry/access activation last, root/source/assets and
  publication-aware route health checks. It excludes backend/data/keys/legacy JS.
  Remote activation is per-file, with backups, **not** a transactional full-site
  exchange or automatic health rollback; it has not been exercised remotely.

**Evidence actually run:** `node --test --test-isolation=none
 tests/canonical-cutover.test.mjs` **8/8 PASS** (hashes/provenance, package/entry,
three-way conflict/read-only/add/replace/remove/owned preservation, corrupt source/
catalog/symlink rejection, asset drift detection); `php tests/canonical-entry.php`
**PASS** (actual root inclusion/common layout, language OFF and stale cookies,
12 published page renders/gates, unavailable/surface OFF, AI-OFF product hook,
exactly one common widget and correct loaded asset files in catalog/account HTML).
Original `tests/customer-request.test.mjs` **8/8 PASS**, evidence for preserved
legacy helpers only, not proof of active widget equivalence. Manifest, final planner,
47 public hashes, ZIP CRC, packaged PHP lint, JS browser-script syntax, shell syntax,
local deploy dry-run, `git diff --check` **PASS**. Latest local package:
`.test-artifacts/site-package-feKBL3`. No browser server was attempted in the sandbox.

**Exact host browser commands** (all isolated synthetic fixtures; cwd is site repo):

```sh
cd /home/raistlin/YardimciWorkspace/teknikel_web
node tests/canonical-live-entry.mjs
node tests/canonical-theme.mjs
CANONICAL_DOCUMENT_ROOT=. TEST_FILTER='one canonical catalog' node tests/canonical-commerce.mjs
CANONICAL_DOCUMENT_ROOT=. TEST_FILTER='authenticated reload recovers' node tests/canonical-commerce.mjs
CANONICAL_DOCUMENT_ROOT=. TEST_FILTER='guest uncertain retry' node tests/canonical-commerce.mjs
CANONICAL_DOCUMENT_ROOT=. TEST_FILTER='logout and cross-account' node tests/canonical-commerce.mjs
CANONICAL_DOCUMENT_ROOT=. TEST_FILTER='legacy aliases' node tests/canonical-commerce.mjs
```

Optional browser override: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium`.
The new live-entry script covers real root/16 aliases/safe filters/fragment and query
token transport/OFF gates/AI-OFF product request POST/no AI request/one widget/demo/
asset URLs at 390/1440px. Existing canonical theme smoke now serves actual repo root;
existing canonical commerce harness accepts an optional root override while preserving
all original scenario assertions. Neither browser harness was executed here.

**Chunk 4B / remaining gates:** run the exact host commands and fix actual failures;
reconcile legacy broad smoke/check/source-catalog assertions with canonical DOM and
strict query rejection (original tests remain; broad npm test is not claimed green).
Exercise real API account callback/secure cookies/private-price clearing/cart/retry/
receipt endpoint compatibility, including private/dealer products. The request CTA
currently covers published public product detail; private product request UI and old
advanced overlay/pinch/linked zoom/filter comparison parity remain unported (common
comparison is present). Review 320/768px, full language/RTL, media/effect browser
lifecycle. Verify Apache private-path denial/MJS MIME/rewrite/unknown 404/API exclusion
on a host honoring `.htaccess`; PHP built-in server does not enforce `.htaccess`.
No live cutover, stored-data deletion, legacy-code deletion, full verification or
release is authorized by completion of this checkpoint.

## Chunk 4A — Teknikel yerel canonical geçişinin host doğrulaması (2026-11-04 23:34 TR)

- Aktif kök `index.php`, `canonical/public/index.php` kullanır; fiziksel eski rota sarmalayıcıları ortak alias kapılarına geçer. Mağaza, ürün detayı, sepet, bayi/hesap ve yayın sayfaları aynı API yetki/sunum sahibine bağlıdır. Siteye özgü logo, tema, ana sayfa ve katalog override'ları korunmuştur; eski Teknikel widget ve talep çalışma kodu aktif paketlenmez.
- Teknikel canonical manifest **76/76**, Efekt Atölyesi **19 modül aynı SHA-256**, root public mirror **47 dosya**, site release paketi **164 dosya**. `node scripts/sync-public-assets.mjs --check`, `node scripts/package-site.mjs --check`, `node canonical/tools/manifest.mjs`, `php tests/canonical-entry.php` PASS.
- `node --test tests/canonical-cutover.test.mjs`: **8/8 PASS** (hash, yayın sahibi, kaynak çatışması/rollback ve güvenli statik paket). `node tests/canonical-live-entry.mjs`: **390 ve 1440 pikselde PASS** (gerçek kök, 16 alias, kapalı yayın kapıları, AI kapalı ürün talebi ve demo/asset yolları).
- `node --test tests/canonical-theme.mjs tests/canonical-commerce.mjs`: **2/2 test dosyası PASS**; alt akışlar bayi/perakende fiyat, hesap oturumu, sepet, sipariş idempotency ve tekrar denemeyi kapsar. Gerçek canlı API'de mutation yapılmadı.
- `npm run check`: önce önceki Teknikel `phrase.<hash>` sözlüğünü bekleyen legacy testte FAIL; `tests/source-catalog.mjs` semantik anahtar ve `tests/check.mjs` gerçek canonical Türkçe katalog + Desktop importer sözleşmesini doğrulayacak şekilde güncellendi; **yeniden PASS**. `git diff --check` PASS.
- **Canlı deploy, web modülü değişikliği, veri/efekt kayıt sıfırlaması, sürüm yükseltme, commit/push YOK.** Sitedeki eski iş mantığı dosyaları yerel geçmiş/çalışma ağacında hâlâ bulunabilir ama yeni allowlist paketine alınmaz. Gerçek canlı HTTPS smoke henüz uygulanmadı.
- Sonraki kısa parça: Gündoğdu aktif giriş/deploy yolunu ortak canonical çekirdeğe bağlamak ve 180/360, widget, dil ve hesap/yayın testlerini korumak; ardından BlackSea/demo çoklu-site kontrat kontrolleri. Sürüm/temiz kurulum final kapısından sonra.

## Chunk 4C — ortak widget başarı odağı ve panorama genişletme (2026-11-05)

- Oturum `01a1a85b-02e6-7923-aa2d-3c1c3e383c15`; mevcut dirty `main` worktree'leri korundu. Widget sahibi `test-site/landing/assistant/direct-request-flow.ts`, form yerine başarı DOM'u geldiğinde bağlı “Tamam” düğmesine odak verir; başarı status olarak duyurulur. Kapanmış widget'ın geç yanıtı sayfa odağını çalmaz; mevcut root Escape/kapatma/launcher ve idempotency yolları korunur.
- Ortak `web-site-template/public/assets/core/panorama.mjs` + `site.css`: WebGL/görsel hazır olduktan sonra açık genişletme düğmesi; native Fullscreen API ve reddedildiğinde modal dialog, yerelleştirilmiş kapat, Escape, Tab/oklar ve odağın düğmeye dönüşü. Context loss statik görsel/özgün bağlantıya döner; dialog/observer/listener/GL kaynakları temizlenir. Otomatik açılma/animasyon veya yeni kütüphane yok. `room.panorama.expand/close` Türkçe kaynak anahtarları ortak/demo ve iki site-owned canonical kataloğa çakışma reddedilerek eklendi.
- Yalnız widget Vite build'i (`test-site/landing` içinde `npx vite build --config vite.config.ts`) PASS; ortak bundle ve baseline kontrollü demo snapshot açıkça yenilendi. Demo yenilemesi önceki Chunk 3 motor snapshot'ını da mevcut central manifest'e eşitledi; engine kaynak kodunda bu parçada değişiklik yok. Manifest **0.6.1 / 76 ortak dosya**. Gündoğdu önce, Teknikel sonra kendi update-canonical/sync-public-assets araçlarıyla **0 conflict / 0 catalog merge** uygulanıp tekrar salt okunur kontrol edildi; owned tema/içerik korundu. Gündoğdu eski `assets/js/room-media.js` değişmedi ve aktif pakete girmiyor.
- Dar kanıt: `scripts/test-widget-direct-request-focus.mjs` **3/3 PASS** (başarı odağı, detached geç yanıt, çift submit); Gündoğdu canonical-cutover **9/9 PASS**, canonical-entry PHP **PASS** (9 sayfa, katalog 1274, ortak widget, 180/360 SSR); Teknikel cutover **8/8 PASS**. İki site **76/76** ortak hash; public mirror **60 / 47** hash. Manifest/demo integrity/syntax ve üç worktree diff-check PASS.
- `scripts/test-panorama-focus.mjs` 390/1440 için native/modal/fallback/context-loss ve gerçek bundle başarı/Escape odağını kapsar. **Tek deneme HTTP listen EPERM ile engellendi; browser assertion çalışmadı, PASS iddiası yok.** Sonraki host dilimi: ana depoda `timeout 85s node scripts/test-panorama-focus.mjs`; iki site kökünde `timeout 85s node tests/canonical-live-entry.mjs`. Veri reset, deploy, canlı çağrı, OpenCode, geniş test, sürüm artışı veya Git mutation yapılmadı.
- Tam dosya listesi/komut/HEAD ve çalışma kanıtları: `/tmp/ya-chunk4c-handoff.md`. Kaynaklar: `direct-request-flow.ts`, iki yeni dar test, ortak panorama/CSS/widget/README/catalog/manifest; demo snapshot; iki sitede canonical README/catalog/panorama/CSS/widget/manifest ve root üç core asset mirror'ı.

### Host acceptance — 2026-11-05 00:10 TRT (Chunk 4B/4C)

Bağlı Linux hostunda, Codex sandbox engeli dışında gerçek tarayıcı testleri doğrulandı:

- `gundogdu_web/tests/canonical-live-entry.mjs`: **PASS 390/1440px**, gerçek kök, 10 alias, kapalı/yayınlı kapılar, kaynak dil ve yayımlanmış çeviri, 180°/360° kayıtları, AI kapalı talep, bozuk efektte statik fotoğraf.
- `teknikel_web/tests/canonical-live-entry.mjs`: **PASS 390/1440px**, gerçek kök, 16 alias, yayın kapıları, AI kapalı ürün talebi, demo/asset yolu.
- `YardimciAsistan/scripts/test-panorama-focus.mjs`: ilk çalıştırma `text/html` Content-Type içinde UTF-8 bulunmadığı için Türkçe button locator'ını bulamadı; izole test fixture'ı `text/html; charset=utf-8` ile gerçeğe uyarlandı. **Tekrar PASS 390/1440px**: WebGL 180/360, tam ekran/alternatif dialog, Escape ve odak iadesi, klavye yönü, context loss fotoğraf fallback, widget talep idempotency/Escape.
- Gündoğdu/Teknikel canonical manifest, public mirror ve cutover testleri **tümü PASS** (9/9 ve 8/8); main manifest 76/76 PASS; üç repoda `git diff --check` PASS. Yeni tam pre-release/release testi çalıştırılmadı.
- Sürüm `0.6.1` kaldı, canlı deploy, test verisi reseti, eskiden kalmış efekt kayıtlarının silinmesi, commit/push yapılmadı.

**Sonraki bağımsız parça:** BlackSea + demo aktif şablon/provenance parity ve ortak yayın senaryo matrisi; Gündoğdu/Teknikel legacy kaynaklarının yerel/deploy izin listesinde tamamen devreden çıkma denetimi; sonra kullanıcıya tam pre-release test için yönlendirme ve sürüm/temiz kurulum.

## Chunk 5 — BlackSea + demo active common-template parity (2026-11-05)

- Session `01a1a86b-aaf0-7a83-b92e-f78a9c6a3473`; local-only, within the 14-minute maximum. Existing dirty main/BlackSea changes preserved. BlackSea starting HEAD `15209cf23efaa7ca303ad8593c3f9f78ab77d9a7`, main `67b2bb3b76a39290c3363945e4be88152d054a24`. No OpenCode/subagent, Git mutation, DB reset, scene migration/publishing, website deploy, version bump or broad suite.
- BlackSea `scripts/sync-template.mjs`: exact explicit `--check`/`--write`; local owning-path allowlist, SHA-256 inventory and baseline/current/incoming three-way validation; reject common edits/additions/symlinks/stale source and site-owned manifest paths. Stage/hash before per-file rename installation, baseline last, caught-error rollback and backup retention on rollback failure. Not crash-atomic or a concurrent-common-writer lock. Site catalog preserves existing text; only the two missing panorama keys auto-merge; source ID and 2048-entry/512-KiB limits validated.
- One real `--write`: BlackSea **70 → 76 common files**, 16 changed/new common files (6 additions), **0.6.1** retained; post-sync check PASS. Engine **19 modules**, fingerprint `078c2ac168547a04e1ec5716239100e7fcd910dc67a1eb703878c80577a0f39f`; widget SHA `7984a72b2c7c5caee57dcb5856c0f634679cdcbc7fff62ac7eb2cb3d2947d5e6`. Site source **blacksea-pansiyon / 699 entries / 108008 response bytes**. Hash snapshot: 52 existing owned files unchanged (catalog merge excepted), including BlackSea dirty scenes. Demo and other sites were read-only; no demo resync/write.
- New main `scripts/test-active-site-template-parity.mjs` + `scripts/fixtures/site-template-parity.php`: **5/5 PASS**, actual BlackSea/Teknikel/Gündoğdu/demo root-entry chains and served assets, all installed manifests and common runtime hashes, actual EfektAtolyesi/Admin provenance, independent served themes, real source endpoints/hash revisions, language OFF/published-target-only/stale-hash fallback, AI OFF requests ON/OFF, one widget and public 180/360 SSR. No sockets/DB/provider; PHP subprocess API transport disabled. Demo identity stays its existing **yardimci-site**. New fixture initially assumed another ID; corrected expectation, no source change.
- BlackSea new installer fixture: **4/4 PASS**, including conflict/path/symlink/catalog bounds and final-baseline installation failure restoring common files/catalog/baseline. Staging + staging check and `check-site-release.sh --target-only` **PASS**, wrong target rejected without FTP/module packaging. Main `sync-demo-template.mjs --check`, template manifest **76/76**, new Node test ESLint, PHP/JS syntax and both repo diff-checks **PASS**; test timeouts <=85s.
- Full exact file/test/limitation handoff: `../blacksea_web/docs/CHUNK5_PARITY_2026-11-05.md`. No browser/server attempt was needed; CLI/SSR is not browser/fullscreen/WebGL/POST/Apache/live acceptance. Long BlackSea browser suite, FTP/module tests, broad verification and full release remain unrun; **no full release PASS**. Next bounded slice: host panorama/actual-root browser acceptance if needed, then remaining legacy deploy-boundary audit; no reset/deploy/cleanup implied.

### Chunk 5 — BlackSea + Demo + dört site aktif şablon kabulü (2026-11-05 00:24 TRT)

- BlackSea gerçek aktif `/index.php` önceden canonical çekirdeği kullanıyordu. Güvenli `scripts/sync-template.mjs` üç yönlü/salt-okunur kontrol, hash, dosya güvenliği, stage/rollback ile yeniden düzenlendi. Açık `--write` ile **70 → 76 common**, **13 → 19 kanonik efekt modülü**, widget/panorama/site.css ve iki yeni TR panorama anahtarı eşitlendi; **0.6.1** değişmedi. Önce/sonra **52 site-owned dosyanın SHA-256 değerleri birebir aynı**, özel sahne manifesti ve yeni Cide sahnesi korundu.
- BlackSea rollback ve yetki testleri `node --test tests/sync-template.test.mjs` **4/4 PASS** (bağlı host); 4 sitenin gerçek PHP entrypoint/publication/AI OFF+requests ON/locale OFF veya yayınlanmış hedefler, panorama SSR, tema/efekt fingerprint doğrulaması `node --test scripts/test-active-site-template-parity.mjs` **5/5 PASS** (bağlı host). BlackSea staging ve `scripts/check-site-release.sh --target-only` yerel dry-run **PASS**, yanlış web-module hedefi reddedildi. Demo `scripts/sync-demo-template.mjs --check`, ana template manifest **76/76** ve her iki worktree `git diff --check` **PASS**.
- Dört kaynak kataloğu: BlackSea 699, Teknikel 1177, Gündoğdu 1274, demo 1025; tümü 2048/512KB sınırlarında. Kod ve doküman: BlackSea `docs/CHUNK5_PARITY_2026-11-05.md`, ana `scripts/test-active-site-template-parity.mjs`, `scripts/fixtures/site-template-parity.php`.
- **Çalıştırılmayanlar:** BlackSea uzun `scripts/check-template-browser.mjs`, tam pre-main/release/verify, canlı API/hosting deploy, veri veya mevcut sahne reseti, sürüm artışı, commit/push. Bir sonraki bağımsız parça: eski site çalışma yolları ve release allowlist/hosting dağıtım sözleşmesini son kez denetle; sonra kullanıcıya tam pre-release testini çalıştırması için dön, PASS sonrasında sürümleme, staging resetleri ve deploy.


## Chunk 6 — final local release readiness / deploy-boundary audit (2026-11-05)

**PRE-RELEASE TEST READY: YES — ready for the owner to RUN the complete test, not a claim it passes.**
**DEPLOY READY: NO — exact remote legacy retirement and authenticated target acceptance remain release blockers.**

- Session: `01a1a87a-bd7c-73a2-bb93-4814c001ee6f`. Existing dirty `main` worktrees preserved: main HEAD `67b2bb3b76a39290c3363945e4be88152d054a24`, Teknikel `0a27ed47c671be35ec3147c3415c0e4ac43fdcc8`, Gündoğdu `662160d4ce58888a611f790c2b1baf1901fed1f0`, BlackSea `15209cf23efaa7ca303ad8593c3f9f78ab77d9a7`. No OpenCode, subagents, remote commands, credentials read, DB/data reset, scene edits, version bump, Git mutation or full suite.
- Read the main AGENTS, this plan, both 2026-11-04 audit documents and web ownership contracts. Inspected actual root/canonical/public entry chains, all three site package/deploy paths, BlackSea prepare/FTP/cleanup inventory, demo sync, central template manifest and product policy. Main contracts, module API and common template sources were not changed.
- New main `scripts/lib/site-release-policy.mjs` reads only the fixed central `product-version.json`, validates regular/non-symlink paths and strict independent product/module version equality. `scripts/site-release-target.mjs` verifies public backend JSON against that policy. Product/module remain **2.2.1 / 2.2.1**, template **0.6.1 / 76 common files**. Synthetic future policy **9.8.7 / 9.8.6** verifies independently; either old/missing backend field fails. Site package target must match central source inventory + installed baseline exactly; stale source/extra common files fail.
- Teknikel/Gündoğdu packages now emit deterministic redacted receipts containing site identity, fixed origin/module URL, product/module/template versions, central and local-installed manifest SHA-256, effect provenance SHA-256, exact file hashes and retirement-plan hash. The local-installed hash is LOCAL evidence, not a remote upgrade-source attestation. Fixed version literals removed from both deploy scripts; SSH strict host-key guards retained, backend version request requires HTTPS without following redirects. Packaging now rejects unexpected Teknikel site assets and checks every listed file is regular. Main helper is an intentional local packaging dependency; the sites do not need Node/main sources at runtime.
- Site-specific `scripts/retired-paths.json`: **Teknikel 19 / Gündoğdu 32** exact locally hashed legacy CODE files (JS/MJS/PHP only). Preview rejects changed local hashes, symlinks, active package overlap, traversal and protected data/config/media/download paths. No directory wildcard, media, ZIP, scenes, credentials or backend API retirement. Inventory is evidence for a future remote preflight, NOT authority to delete arbitrary remote content. No file was retired locally or remotely.
- **Deliberate fail-closed deployment gate:** both `deploy-site.sh --yes` paths now exit **4 before any curl/SSH/rsync** after local checks. `--dry-run` still succeeds entirely locally. A safe remote retirement executor was not added within this bounded audit; merely uploading a deny rule does not fulfill physical retirement. Existing dormant activation validators also need explicit acceptance/verification of the new `retired-paths.json` artifact before this gate can be removed. Do not bypass the gate.
- Access rules: Teknikel/Gündoğdu deny legacy namespaces case-insensitively; Teknikel also blocks root legacy asset PHP. BlackSea explicitly denies old JS/CSS/widget/i18n/engine namespaces, root legacy scripts, old direct route PHP and index.html before physical-file fallback. Current common assets, API, scene paths and demo ZIP remain allowed. Tests inspect unconditional Apache deny-rule semantics; **Apache/live enforcement was NOT executed**.
- BlackSea `scripts/stage-site.mjs` now enforces a file allowlist within the previous namespaces, rejecting extra duplicate engines/renderers, private/foreign files and symlinks, and writes/verifies a redacted deterministic **124-file** site receipt with versions, origin, manifest/provenance and file hashes. Combined backend is intentionally outside this site receipt and remains the independent existing backend target validator's responsibility. `prepare-natro-release.sh`, `deploy-natro-ftp.sh` and `natro-cleanup.txt` were inspected and left unchanged. Fresh-install cleanup includes entire private/backend runtime directories: it is NOT an upgrade retirement allowlist and was NOT invoked. FTP has configurable/off TLS and no independent live site-origin/backend-version/remote-hash retirement acceptance; this remains a **BlackSea deployment blocker**, not local package/test failure. No cleanup expansion.
- Demo independently passes check-only sync and installed manifest/parity; no demo write/build/resync. All existing special scene manifests and scene files remain untouched.

**Actual narrow evidence:**

- `node scripts/test-site-release-readiness.mjs`: **7/7 PASS**, exact allowlist/legacy+synthetic-secret injection/backend-data exclusion; deterministic redacted receipts/checksums; protected/stale retirement inventory rejection; future central versions and both mismatch gates; source manifest/provenance binding; static deny rules; BlackSea stage/extra-file rejection; demo check.
- Teknikel `timeout 85s bash scripts/deploy-site.sh --dry-run`: **PASS**, 8/8 cutover, PHP actual-entry/12 pages, mirror **47** hashes, ZIP CRC, packaged PHP syntax; package **165 files**. Stage `.test-artifacts/site-package-i0YoK4` (additional isolated test stages removed by their own tests).
- Gündoğdu same local dry-run: **PASS**, 9/9 cutover, 4/4 effect fallback, PHP actual-entry/9 pages/source 1274, 10 route wrappers, mirror **60** hashes, checksums/packaged PHP syntax; package **179 files**. Stage `.test-artifacts/site-package-ffoQTn`.
- BlackSea staging + `--check` **PASS**, local stage `/tmp/ya-chunk6-blacksea-stage`; `timeout 45s bash scripts/check-site-release.sh --target-only` **PASS**, wrong backend target rejected without FTP/module/archive packaging.
- Four active-site CLI/SSR parity and actual EfektAtolyesi/Admin provenance **PASS**; demo check **PASS**; central template manifest **76/76 PASS**. Main registry targeted test **PASS**. New gate registered as explicit/manual `site-release-readiness` because all three sibling worktrees are required; not silently added to portable/default suites.
- Targeted ESLint, Node/shell syntax, both embedded remote PHP programs' syntax-only lint, strict current-version CLI check and all four `git diff --check` **PASS**. No browser or live Apache claim. No full BlackSea browser suite, broad npm test, full pre-main/release/verify or release archive build.

**Next bounded slice / release blockers:** owner may now run `npm run verify:pre-main` and the required `npm run verify:release` release gate, retain actual failures, and fix only those before any version bump. This audit does not replace the earlier failed full result. Separately implement/test a site-specific remote retirement executor: verify authenticated host/root and exact origin, current central backend versions, staged receipt digest/target manifest, independent remote SOURCE manifest hashes/provenance, and EVERY exact legacy file's remote SHA-256 + all ancestor types before any move. Abort the entire retirement for foreign/changed bytes; preview first; quarantine code only outside document root, preserve private data/media/ZIP/API/scenes, no wildcard or global `--delete`. Test partial failure/recovery and then remove the explicit gate only after review. BlackSea additionally needs strict authenticated transport/host/root and live version/origin acceptance; its fresh-install cleanup must stay separate. Host Apache deny/route acceptance and any future deploy need separate authorized execution. Full handoff: `/tmp/ya-milestone-chunk6-handoff.md`.

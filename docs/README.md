# Yardımcı Asistan Dokümanları

Bu klasör yalnız **güncel ürün ve uygulama sözleşmelerini** tutar. Tarihsel stage raporları,
tamamlanmış audit/roadmap belgeleri ve tek seferlik oturum notları Git geçmişinde kalır;
aktif `docs/` ağacında tutulmaz.

## Önce okunacaklar

Yeni masaüstü feature/UI/platform işi için:

- `architecture/APPLICATION_ARCHITECTURE_CONSTITUTION_V1.md` — uzun vadeli uygulama grameri ve ownership kuralları.
- `architecture/DOMAIN_DECISIONS_V1.md` — domain ayrımları ve kalıcı kararlar.
- `FEATURE_DEVELOPMENT.md` — yeni feature geliştirme akışı.
- `UI_RULES.md` — güncel UI ilkeleri.
- `design-system/README.md` — masaüstü tasarım sistemi.
- `desktop-frontend-architecture.md` — renderer kompozisyonu ve frontend sınırları.

Repository-wide agent kuralları için kökteki `AGENTS.md` otoritatiftir.

## Sistem ve domain

- `MODULAR_BUSINESS_FOUNDATION.md` — capability-first işletme modeli.
- `DATA_MODEL.md` — ana veri modeli.
- `EVENTS.md` — event sözleşmeleri.
- `FINANCE_MODEL.md` — Kasa / oda hesabı / ön muhasebe modeli.
- `architecture/WEB_DATA_SERVICE_CONTRACT_V1.md` — API-only web hizmeti ve site sunumu sahipliği.
- `architecture/WEB_SITE_TEMPLATE_V1.md` — bağımsız ortak site şablonu, tema/dil/efekt ve kontrollü güncelleme sınırları.
- [Product Photos V2](architecture/PRODUCT_PHOTOS_V2.md) — canonical ürün fotoğraf arşivi, kapak ve perakende yayın entegrasyonu.
- `AUTOMATIC_SYNC.md` — hosting ↔ desktop ↔ Android senkron mimarisi.
- `desktop-sync-identity.md` — desktop sync kimliği.
- `architecture/hospitality-domain.md` — pansiyon domain sınırları.
- `architecture/sector-feature-contribution-model.md` — capability tabanlı feature katkıları.
- `architecture/voice-input.md` — S2A STT ayarları/hosting servisi ve S2B doğrudan ses girişi sınırı.
- `architecture/ai-providers.md` — AI profilleri, Cloudflare erişim/yetenek ayrımı ve sağlayıcı sözleşmeleri.

## Workspace / platform

`architecture/` altında yalnız güncel platform ve workspace sözleşmeleri tutulur:

- `workspace-platform.md`
- `settings-platform.md`
- `dashboard-workspace.md`
- `calendar-workspace.md`
- `finance-workspace.md`
- `market-workspace.md`
- `menu-item-workspace.md`
- `messages-workspace.md`
- `pension-workspace.md`
- `restaurant-workspace.md`

## Kurulum, dağıtım ve saha testi

- `DEVELOPMENT_SETUP.md`
- `WEB_MODULE_INSTALLATION.md`
- `dev/RELEASE_WORKFLOW.md` — canonical paket kontrolü ve operatörün çalıştıracağı toplu temiz yayın sırası.
- `ANDROID_DISTRIBUTION.md`
- `PILOT_FIELD_TEST.md`
- `WINDOWS_HOSTING_FIELD_TEST.md`
- [Windows update handoff](architecture/DESKTOP_WINDOWS_UPDATE_V1.md) — independent native installation window, result reconciliation and Windows validation.
- `dev/LOCAL_COMPANION_NETWORK.md`
- `dev/ADMIN_CONSOLE_TARGET.md` — mevcut Electron Admin Control Center'ın operasyon, secret ve paketleme sınırları.

- `dev/KBS_PROVIDER_VERIFICATION.md` — gerçek işletme hesabı gerektiren KBS doğrulama sınırları.
- `dev/LOCAL_COMPANION_NETWORK.md` — yerel Android bağlantısının protokol ve güvenlik sınırları.

## Operasyonel geliştirme notları

- `diagnostics/logging.md` — structured desktop logları ve inceleme akışı.
- `knip-runtime-smokes.md` — compiled runtime smoke / Knip istisna sözleşmesi.

## Doküman yaşam döngüsü

Yeni belge eklemeden önce şu filtreyi kullanın:

1. Bu bilgi yaşayan bir ürün/mimari sözleşmesi mi?
2. Başka bir güncel belgeyle aynı gerçeği tekrar ediyor mu?
3. Bir stage/audit/session tamamlandığında belgeye hâlâ günlük geliştirmede ihtiyaç var mı?

Yanıt yalnız tarihsel kanıt ise yeni belge tutmayın; commit/PR/Git geçmişi arşivdir.
Tamamlanan plan/audit belgelerini aktif docs ağacında bırakmayın.

- [Desktop ürün ve müşteri veri aktarımı](architecture/DESKTOP_DATA_TRANSFER_V1.md)

# D6 — Marketing Calendar / Scheduling / Time-based Automation

Doğrudan `main` üzerinde uygulandı. Başlangıç: `8ac10ec5060726fffe1ee536d551dd1425a2f5f5`.
Commit/push oluşturulmadı. Full Verify çalıştırılmadı.

## Karar ve semantik

[D-040](../architecture/DOMAIN_DECISIONS_V1.md#d-040--marketing-calendar--scheduling--time-based-automation-d6)
kanonik domain kararını içerir.

| Kanal | Hedef | Tek sefer | Tekrar |
| --- | --- | --- | --- |
| Website | Hazır yayının dondurulmuş revision'ı → mevcut D4 publish/update + sync outbox | Evet | Evet |
| Instagram | Hazır yayının dondurulmuş revision'ı → occurrence başına canonical D5 yayın niyeti | Evet | Evet |
| WhatsApp | Hazırlanmış campaign → D3 start | Evet | Hayır |
| SMS | Hazırlanmış campaign → D3 start | Evet | Hayır |

- Daily/weekly/monthly typed recurrence; interval 1–365, ISO weekdays 1–7, ayın günü 1–31 ve HH:mm yerel saat. Cron yok.
- startsAt başlangıç alt sınırı ve takvim anchor'ıdır. Haftalık interval Pazartesi haftasına, aylık interval başlangıç ayına bağlıdır. Kısa aylarda ayın son günü kullanılır.
- Varsayılan saat dilimi plan oluşturulurken yerel sistem IANA timezone'u; kayıtlı timezone sistem timezone değişikliğinden etkilenmez. UTC instant ve özgün yerel başlangıç saklanır; timezone açık plan düzenlemesiyle değişir.
- DST fold ilk instant'ı seçer; gap geçiş boşluğu kadar ileri kayar. [Temporal compatible semantics](https://tc39.es/proposal-temporal/docs/timezone.html) ile aynı seçim uygulanır.
- Varsayılan missed-run policy `run_once_when_resumed`; alternatif `skip`. Normal timer gecikmesi için 60 saniye tolerans vardır. Recovery'de plan başına en fazla bir catch-up; nextRunAt gelecekteki normal occurrence'a ilerler.
- `occurrenceKey = scheduleId + planned UTC instant`; DB `(schedule_id, occurrence_key)` unique. Claim + ledger insert + nextRunAt advance atomik.
- D3 start ve accepted execution reference aynı D3 transaction'ında; Website frozen publish intent/sync job/reference aynı transaction'da; Instagram yeni canonical intent/reference uzak çağrıdan önce aynı transaction'da saklanır.
- Restart aynı execution/target reference'ını kullanır. D3 submission fence/backoff, D4 sync revision/ack/outbox ve D5 create/publish fence/receipt yeniden kullanılır. Scheduler provider retry'sı yapmaz.
- Başarı D3/Website için kalıcı işlem kabulünü; Instagram için doğrulanmış yayını ifade eder. Website senkron onayı ve audience teslim durumu kendi hedef ekranında takip edilir.
- Frozen publication revision, canonical revision history'de içerik sürümü ve MediaAsset referanslarıyla saklanır. Scheduler body, binary veya provider request kopyası tutmaz.
- İçerik/yayın düzenlemesi planı değiştirmez. “Planı güncelle” + Kaydet açıkça güncel revision'a bağlar. Frozen medyanın silinmesi active/paused/in-flight planlar için engellenir; arşivleme mevcut frozen ilişkiyi bozmaz.
- Plan pause/cancel kampanya pause/cancel veya unpublish değildir. Pause yeni claim'i durdurur; in-flight action zorla abort edilmez. Cancel yalnız geleceği iptal eder.
- Main startup/unlock/OS resume recovery; 15 saniyeyi aşmayan wake hints; shutdown ve reset/restore önce scheduler suspend/drain. İş kuralları SyncCoordinator'a taşınmadı.
- Takvim Ay ve Liste/Yaklaşan projection'ları; recurring filtre; tek canonical Plan workspace; Studio, Publication ve Campaign “Planla” girişleri; sayfa draft/leave guard; global hata durumu ve structured diagnostics.

## Doğrulama

- `npm run verify:domain -- marketing`: 14/14; D6 domain/UI, D4 Studio/medya/Website/UI, D5 multichannel/UI/staging/log privacy ve showcase; canonical prerequisites ile package/desktop TypeScript + build.
- Son recovery düzeltmesi için `npm run verify:check -- marketing-schedules`: package/desktop build ve D6 domain/runtime tekrar doğrulaması.
- `npm run verify:check -- typecheck-electron`.
- `npm run verify:check -- architecture-audit`, `verification-registry-tests`, `lint-strict`, `knip-strict`, `design-audit-strict`.
- Derlenmiş mevcut smoke leaf'leri: `smoke-messaging-dispatch.mjs` (31/31), `smoke-messaging-dispatch-lifecycle.mjs`, `smoke-messaging-dispatch-ui.mjs`, `smoke-messaging-campaigns.mjs`, `smoke-messaging-campaigns-ui.mjs`, `smoke-settings-platform.mjs`, `smoke-automatic-sync.mjs`, `smoke-database-schema.mjs`.
- D6: once/daily/weekly/monthly; Istanbul/New York/Lord Howe timezone/DST; pause/resume/cancel; skip/catch-up/no backlog; clock geri alma; unique claim; gerçek SQLite reopen; crash-before-action/after-accepted-intent; Website ve Instagram frozen revision/media; WhatsApp/SMS prepared-only; D3 gerçek mock dispatch; audience recurring rejection; Instagram unknown response no retry; gerçek reset/restore handlers ile scheduler drain.
- Browser: ay occurrence projection, upcoming list, create/edit/pause/resume/cancel, explicit revision refresh, dört kanal, audience recurring disabled, dirty guard, nested dialog olmaması, global failure feedback.
- `git diff --check`: temiz.

Önceden mevcut başarısız kontrol saptanmadı. Build mevcut Vite 500 kB chunk uyarısını; native medya testi mevcut Haswell Vulkan uyarısını verdi. Canlı provider çağrısı veya fiziksel OS sleep deneyi yapılmadı; sağlayıcılar mock, sleep/restart senaryoları kontrollü saat + gerçek SQLite ile doğrulandı.

Yeni tablolar yalnız canonical `schema.sql` içindedir; repository'nin current-schema kuralı korunur, tarihsel migration zinciri eklenmez.

## Önerilen commit

`feat(marketing): add durable calendar and time-based scheduling (D6)`

## Değişen dosyalar ve Git çıktısı

Bu bölüm final çalışma ağacının `git diff --stat` ve `git status --short` çıktılarıyla tamamlanır. `??` satırları yeni dosyalardır; standart `git diff --stat` bunları henüz saymaz.

```text
$ git diff --stat
 apps/desktop-app/db/schema.sql                     | 32 ++++++++
 apps/desktop-app/electron/database.ts              | 12 +++
 apps/desktop-app/electron/main.ts                  | 25 +++++-
 apps/desktop-app/electron/marketing/asset-store.ts |  6 +-
 .../electron/marketing/channel-registry.ts         |  2 +-
 apps/desktop-app/electron/marketing/service.ts     |  5 ++
 apps/desktop-app/electron/marketing/store.ts       | 13 +++-
 .../electron/messaging-campaigns/dispatch-store.ts |  5 +-
 .../electron/messaging-campaigns/service.ts        |  4 +-
 apps/desktop-app/electron/preload.ts               | 11 ++-
 .../src/components/app/DesktopWorkspaceRouter.tsx  | 10 ++-
 apps/desktop-app/src/pages/CampaignsPage.tsx       |  3 +-
 apps/desktop-app/src/pages/MarketingPage.tsx       | 49 +++++++++---
 apps/desktop-app/src/styles/pages/marketing.css    |  5 ++
 docs/architecture/DOMAIN_DECISIONS_V1.md           | 89 ++++++++++++++++++++++
 packages/shared/index.ts                           |  1 +
 packages/shared/types/marketing.ts                 |  1 +
 scripts/verification-registry.mjs                  |  2 +
 18 files changed, 249 insertions(+), 26 deletions(-)

$ git status --short
 M apps/desktop-app/db/schema.sql
 M apps/desktop-app/electron/database.ts
 M apps/desktop-app/electron/main.ts
 M apps/desktop-app/electron/marketing/asset-store.ts
 M apps/desktop-app/electron/marketing/channel-registry.ts
 M apps/desktop-app/electron/marketing/service.ts
 M apps/desktop-app/electron/marketing/store.ts
 M apps/desktop-app/electron/messaging-campaigns/dispatch-store.ts
 M apps/desktop-app/electron/messaging-campaigns/service.ts
 M apps/desktop-app/electron/preload.ts
 M apps/desktop-app/src/components/app/DesktopWorkspaceRouter.tsx
 M apps/desktop-app/src/pages/CampaignsPage.tsx
 M apps/desktop-app/src/pages/MarketingPage.tsx
 M apps/desktop-app/src/styles/pages/marketing.css
 M docs/architecture/DOMAIN_DECISIONS_V1.md
 M packages/shared/index.ts
 M packages/shared/types/marketing.ts
 M scripts/verification-registry.mjs
?? apps/desktop-app/electron/ipc/marketing-schedule-ipc.ts
?? apps/desktop-app/electron/marketing/schedule-recurrence.ts
?? apps/desktop-app/electron/marketing/schedule-service.ts
?? apps/desktop-app/electron/marketing/schedule-store.ts
?? apps/desktop-app/electron/marketing/schedule-target-store.ts
?? apps/desktop-app/electron/marketing/scheduled-target-service.ts
?? apps/desktop-app/electron/marketing/scheduler-service.ts
?? apps/desktop-app/src/app/use-marketing-schedule-status.ts
?? apps/desktop-app/src/components/marketing/MarketingCalendar.tsx
?? apps/desktop-app/src/components/marketing/MarketingScheduleWorkspace.tsx
?? docs/dev/D6_MARKETING_SCHEDULING_REPORT.md
?? packages/shared/types/marketing-schedules.ts
?? scripts/fixtures/marketing-schedules.tsx
?? scripts/smoke-marketing-schedules-ui.mjs
?? scripts/smoke-marketing-schedules.mjs
?? scripts/test-helpers/marketing-schedule-fixtures.mjs
```

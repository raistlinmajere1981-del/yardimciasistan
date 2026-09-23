# Settings Platform v2 — Stage 7 audit

Baseline: `48b017586abff99230876b98cb0731ea412b5d73`, clean
`refactor/settings-platform-v2`. This map was written before implementation.
Constitution, D-007/D-013/D-014/D-016 and Stage 6 workspace boundaries apply.

## Existing surfaces and owners

| Visible section / component | Source of truth; draft | Save / validation | Gate | Class and feedback before Stage 7 |
| --- | --- | --- | --- | --- |
| İşletme / SetupForm | DesktopSetupData → toSetupForm; useSetupController global draft | saveInitialSetup → setup:saveInitial → DesktopDatabase; database validates identity/contact | all profiles | A: Setup staged; global header result |
| Sektör tipi, Ek özellikler / BusinessProfileOptionEditor | shared business profiles; profileId/profileOptions in Setup draft | same Setup operation; required/optional/defaultOptional from shared | only selected profile's optional capabilities | A; requests, room/table reservations, QR/menu, inventory, credit and retail options live here, not separate forms |
| İşletme Düzeni / SetupForm | initialCounts, tableCategories in Setup draft | Setup save; table-category-utils normalizes/validates; database protects occupied tables | rooms / tables capabilities | A; global header result; room count also rendered in RoomManagementSection |
| Müşteriye Açık Bilgiler / BusinessPublicProfileSection | getBusinessPublicProfile; local draft + initialDraftRef | saveBusinessPublicProfile; coordinate validation + resource backend | initialized; capability-filtered features and hospitality fields | B/D: independent resource, incorrectly enlisted in global save; global app status |
| Oda Yönetimi / RoomManagementSection | getRoomFolioData room profiles; local rooms + savedRoomsRef | setRoomNightlyPrice (name/default price), same operation with publicDetails via RoomPublicDetailsEditor; local money/name validation | runtime accommodation.rooms; initialized | B/D: independent resource enlisted in global save; local + app feedback. Folio override is separate |
| WhatsApp / SetupForm | servicePreferences.whatsapp, birthdaySettings; Setup draft | Setup save; validateBirthdaySettings + required WhatsApp number | service toggle; birthday controls disabled when off | A; no independent config resource |
| Android, Yerel ağ / SetupForm | servicePreferences.android, localNetworkEnabled; Setup draft | Setup save | Android preference; devices require initialized setup | A; Android remains opt-in |
| Telefon Kurulumu / AndroidDevicesSection | dashboard devices + installation snapshot | USB scan/install, role/groups/active/reset/revoke existing device controller APIs | Android + permission groups projected from capabilities | D/action: immediate commands; device/install status |
| Ürün Verisi / SetupForm | DesktopSetupData.productData; Setup draft | Setup save; fixed Open Food Facts provider | catalog capability | A; not an independent provider resource |
| Web Modülü / SetupForm | URL/secret/autoSyncEnabled; Setup draft | Setup save; connection test uses testWebConnection | all profiles | A + action; test has its own status |
| AI Yardımcı / SetupForm | DesktopSetupData.aiProfiles + active provider; Setup draft incl. per-provider drafts | Setup save / encrypted keys in main; testAiConnection and revealAiApiKey separate commands | AI preference | A + action; not a new resource API; provider switching preserves provider drafts |
| Görünüm / SetupForm | DesktopAppView uiPreferences → localStorage v2 | applyUiPreferences/saveUiPreferences | all | C/immediate; scheme/density/scale/accent/font/motion, no Setup save |
| Güncellemeler / UpdateSettings | getUpdateStatus/onUpdateStatusChanged; local URL/auto-check draft | saveUpdatePreferences; existing local/backend validation | initialized | B/D resource preferences enlisted in global save; check/download/restart/reset are separate actions; local feedback |
| Uygulama Şifresi / PasswordSettings | lock service; local password inputs | setAppPassword/remove/reset; existing local validation | all, configured-dependent fields | D/action incorrectly enlisted in global save; local feedback |
| Veri ve Yedekleme / DataMaintenanceSettings | backup service/list | create/restore/delete/reset commands | initialized | D/action; local feedback; no Setup fields |

A = global Setup draft/save; B = independent local draft/save; C = immediate
preference; D = action/resource lifecycle. Stage 7 uses explicit persistence kinds
`staged`, `immediate`, `action`, `resource`; mixed sections have separate definitions.

## Current failure boundaries

- SetupForm renders every section and uses sticky anchor navigation over document flow.
- One header save validates all resource handles, saves whole Setup, then profile,
  rooms, update preferences and password. Unrelated invalid inputs block each other;
  partial success is reported as one ambiguous result.
- applyBootstrapSetup and Setup success replace the entire form and clear one dirty
  boolean. Per-category pending changes cannot survive either path safely.
- Resource state lives below presentation; simply conditionally rendering categories
  would lose it. Resource controllers must outlive category bodies.
- toSetupForm creates table row keys and fresh setup secrets. Dirty comparison must
  ignore presentation keys and canonical conversion must not run on every render.

## Business type and persistence decisions

Existing sector selection intentionally replaces profileOptions with that profile's
defaultOptionalCapabilities. Same-profile refresh must preserve explicit opt-outs;
ANDROID and CUSTOMER_CREDIT must never be implicitly added. Backend continues to own
capability reprojection, protected table checks, normalization and side effects.

Use four categories: İşletme, İşletme Düzeni, Servisler, Uygulama. Keep capabilities
with sector identity (no fifth category). Setup saves merge only owned, currently
supported fields into the latest canonical snapshot, never other category drafts.
Hidden drafts are retained locally but excluded from payloads. Display resource
capabilities from persisted setup so unsaved sector choices cannot authorize APIs.
Resource lifecycle hooks stay mounted in Settings, while only one category body is
rendered. Public Profile, rooms and update preferences have their own save/discard;
password/device/update/backup actions are never invoked by category save.

No IPC, schema, domain operation, appearance storage, workspace definition or plugin
framework change is required. Settings lifetime is the mounted page; a global
navigation blocker is outside this stage's minimum guarantee.

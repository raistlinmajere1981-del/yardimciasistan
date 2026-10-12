import { useEffect, useState } from "react";
import { PageViewStateProvider, usePageViewState } from "../../apps/desktop-app/src/app/page-view-state";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES as C, getBusinessProfile, getBusinessProfileSelectionCapabilities } from "@yardimci-asistan/shared";
import { normalizeProfileTransitionInput } from "../../apps/desktop-app/electron/profile-service-activation";
import { defaultDashboardData, defaultSetupData } from "../../apps/desktop-app/src/app/bootstrap-defaults";
import { useSetupController } from "../../apps/desktop-app/src/app/use-setup-controller";
import { createCapabilitySnapshotFixture } from "../test-helpers/business-capability-fixtures.mjs";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { SettingsWorkspace } from "../../apps/desktop-app/src/components/settings/SettingsWorkspace";
import type { PageLeaveGuard } from "../../apps/desktop-app/src/app/page-navigation-guard";
import { AppShell } from "../../apps/desktop-app/src/components/layout/AppShell";
import { GlobalMessageBar } from "../../apps/desktop-app/src/components/layout/GlobalMessageBar";
import { subscribeAppStatus, type AppStatusDetail } from "../../apps/desktop-app/src/app/runtime-state";
import { readUiPreferences, applyUiPreferences, saveUiPreferences } from "../../apps/desktop-app/src/ui-preferences";
import "../../apps/desktop-app/src/styles/index.css";

function FixtureStatusHost() {
  const [status, setStatus] = useState<AppStatusDetail | null>(null);
  useEffect(() => subscribeAppStatus(setStatus), []);
  return status ? (
    <GlobalMessageBar
      tone={status.state === "error" ? "error" : status.state === "success" ? "success" : "loading"}
      message={status.message}
    />
  ) : null;
}

let maintenanceConfirmation: ((request: { title: string; description: string; details: string; confirmLabel: string }) => Promise<boolean>) | null = null;
let canonical = { ...defaultSetupData, profileId: new URLSearchParams(window.location.search).get("profile") ?? defaultSetupData.profileId, setupRequired: false, businessName: "İlk Firma", syncSecret: "settings-platform-secret" };
const firstRun = new URLSearchParams(window.location.search).get("firstRun") === "on";
if (firstRun) canonical = { ...canonical, setupRequired: true, businessName: "" };
canonical.profileOptions = [...getBusinessProfile(canonical.profileId).defaultOptionalCapabilities];
if (new URLSearchParams(window.location.search).get("wholesale") === "on") canonical.profileOptions = [C.WHOLESALE];
let profile = { description: "İlk açıklama", latitude: null, longitude: null, directionsNote: "", checkInTime: "14:00", checkOutTime: "11:00", breakfastStartTime: "08:00", breakfastEndTime: "10:00", features: [], policyNote: "", paymentNote: "", languages: ["Türkçe"], socialLinks: [] };
let layout = {
  capabilities: { rooms: true, tables: true },
  rooms: [{
    id: "room-1",
    number: "101",
    name: "Oda 101",
    nightlyPriceMinor: 150000,
    currency: "TRY",
    capacity: 2,
    bedInfo: "Çift kişilik",
    features: [],
    description: "",
    floor: "",
    priceNote: "",
    sortOrder: 1,
    outOfService: false,
    canRemove: true,
    removeBlockReason: ""
  }],
  tables: [
    { id: "table-1", name: "Salon 1", area: "Salon", capacity: 4, description: "", features: [], smokingPolicy: "unspecified", sortOrder: 1 },
    { id: "table-2", name: "Salon 2", area: "Salon", capacity: 4, description: "", features: [], smokingPolicy: "unspecified", sortOrder: 2 }
  ],
  tableCategories: [{ name: "Salon", tableCount: 2 }],
  publication: { rooms: true, tables: false }
};
if (firstRun) layout = { ...layout, rooms: [], tables: [], tableCategories: [], publication: { rooms: false, tables: false } };
let updateStatus = { phase: "idle", message: "Hazır", currentVersion: "1", defaultBaseUrl: "https://example.test/updates", customBaseUrl: "", autoCheckEnabled: true, notes: [], installSupported: false };
let mediaSeq = 0;
let mediaCanonical: Array<Record<string, unknown>> = [];
let mediaDraft: Array<Record<string, unknown>> | null = null;
const mediaStagedDirty = () => mediaDraft !== null && JSON.stringify(mediaDraft) !== JSON.stringify(mediaCanonical);
const mediaVisible = (roomId: string) => (mediaDraft ?? mediaCanonical)
  .filter((item) => item.roomId === roomId)
  .map((item) => ({ ...item }));

let tableMediaSeq = 0;
let tableMediaCanonical: Array<Record<string, unknown>> = [];
let tableMediaDraft: Array<Record<string, unknown>> | null = null;
const tableMediaStagedDirty = () => tableMediaDraft !== null && JSON.stringify(tableMediaDraft) !== JSON.stringify(tableMediaCanonical);
const tableMediaVisible = (tableId: string) => (tableMediaDraft ?? tableMediaCanonical)
  .filter((item) => item.tableId === tableId)
  .map((item) => ({ ...item }));
let androidDevices = [
  {
    id: "android-device-row-1",
    deviceId: "android-smoke-staff-01",
    deviceName: "Personel Telefonu",
    appVersion: "1.0",
    role: "staff",
    isActive: true,
    permissionGroups: { service_orders: true, cashier: false, rooms_tasks: true, customer_reservation: false, market_operations: false },
    permissions: [],
    firstSeenAt: "",
    lastSeenAt: "",
    createdAt: "",
    updatedAt: "",
    revokedAt: ""
  }
];
let pageLeaveGuard: PageLeaveGuard | null = null;
window.settingsPageLeaveCompleted = false;
window.requestSettingsPageLeave = () => {
  window.settingsPageLeaveCompleted = false;
  if (!pageLeaveGuard) {
    window.settingsPageLeaveCompleted = true;
    return true;
  }
  const allowed = pageLeaveGuard("dashboard", () => {
    window.settingsPageLeaveCompleted = true;
  });
  if (allowed) window.settingsPageLeaveCompleted = true;
  return allowed;
};

window.settingsCalls = [];
window.failSetup = false;
let shippingPassword = "", shippingVerification = "";
const shippingSignature = (input: typeof canonical.arasShipping & { password?: string; clearPassword?: boolean }) =>
  JSON.stringify([input.environment, input.customerCode, input.username, input.clearPassword ? "" : input.password || shippingPassword]);
let googleReviews = { enabled: false, placeId: "", apiKeyConfigured: false, lastPublishedAt: "", publicationPending: false };
let kbsSettings = { enabled: false, provider: "egm", facilityCode: "", username: "", authorizedIdentityNumber: "", passwordConfigured: false };
window.yardimciDesktop = {
  getSetupData: async () => structuredClone(canonical),
  getInstagramConfiguration: async () => structuredClone(canonical.instagram),
  beginInstagramOAuth: async () => ({ ok: false, message: "OAuth fixture bağlı değil." }),
  pollInstagramOAuth: async () => ({ status: "failed", message: "OAuth fixture bağlı değil." }),
  disconnectInstagramOAuth: async () => structuredClone(canonical.instagram),
  testInstagramConnection: async () => ({ ok: false, message: "OAuth fixture bağlı değil.", testedAt: new Date().toISOString() }),
  testWebConnection: async input => { window.settingsCalls.push({ kind: "web-test", input }); return { ok: true, message: "Fixture web bağlantısı doğrulandı." }; },
  commerce: {
    getShippingProviderConfiguration: async () => ({ ...canonical.arasShipping,
      verified: Boolean(shippingVerification && shippingVerification === shippingSignature(canonical.arasShipping)) }),
    testShippingProviderConnection: async input => {
      window.settingsCalls.push({ kind: "shipping-test" });
      if (!window.failShippingTest) shippingVerification = shippingSignature(input);
      return { ok: !window.failShippingTest, providerId: canonical.arasShipping.providerId,
        message: window.failShippingTest ? "Fixture bağlantı hatası" : "Fixture kargo bağlantısı doğrulandı.", testedAt: new Date().toISOString() };
    }
  },
  saveInitialSetup: async input => {
    window.settingsCalls.push({ kind: "setup", input });
    if (window.delaySetup) await new Promise(resolve => { window.finishSetup = resolve; });
    if (window.failSetup) return { ok: false, message: "Test kayıt hatası" };
    input = normalizeProfileTransitionInput(input, canonical);
    const arasShipping = input.arasShipping ? {
      ...canonical.arasShipping, enabled: input.onlineSalesDeliveryEnabled && input.onlineSalesDelivery.shippingEnabled, environment: input.arasShipping.environment,
      username: input.arasShipping.username, customerCode: input.arasShipping.customerCode,
      hasSecret: input.arasShipping.clearPassword ? false : Boolean(input.arasShipping.password) || canonical.arasShipping.hasSecret,
      configured: Boolean(input.arasShipping.username && input.arasShipping.customerCode
        && (input.arasShipping.password || (canonical.arasShipping.hasSecret && !input.arasShipping.clearPassword)))
    } : canonical.arasShipping;
    if (input.arasShipping?.clearPassword) shippingPassword = "";
    else if (input.arasShipping?.password) shippingPassword = input.arasShipping.password;
    canonical = { ...canonical, ...input, arasShipping, setupRequired: false, aiApiKeyConfigured: Boolean(input.aiApiKey) || canonical.aiApiKeyConfigured };
    return { ok: true, message: "Kaydedildi", setupData: structuredClone(canonical), dashboardData: { ...defaultDashboardData, androidDevices: structuredClone(androidDevices) } };
  },
  getBusinessPublicProfile: async () => profile,
  geocodeBusinessAddress: async address => {
    window.settingsCalls.push({ kind: "geocode", address });
    return { ok: true, results: [{ id: "fixture-point", label: address, latitude: 39, longitude: 32 }] };
  },
  testAiConnection: async input => {
    window.settingsCalls.push({ kind: "ai-test", input });
    return { ok: true, message: "Fixture AI bağlantısı doğrulandı.", model: input.model || "gemini-3-flash",
      models: [{ id: input.model || "gemini-3-flash", label: input.model || "gemini-3-flash" }, { id: "gemini-3-pro-image-preview", label: "Gemini Image" }] };
  },
  saveBusinessPublicProfile: async input => { window.settingsCalls.push({ kind: "profile", input }); if (window.failProfile) return { ok: false, message: "Profil hatası" }; profile = input; return { ok: true, message: "Müşteri bilgileri kaydedildi", profile }; },
  getGoogleReviewsSettings: async () => structuredClone(googleReviews),
  saveGoogleReviewsSettings: async input => {
    window.settingsCalls.push({ kind: "google-reviews", input });
    googleReviews = {
      enabled: input.enabled,
      placeId: input.placeId,
      apiKeyConfigured: input.clearApiKey ? false : Boolean(input.apiKey) || googleReviews.apiKeyConfigured,
      lastPublishedAt: "2026-09-27T00:00:00.000Z",
      publicationPending: false
    };
    return { ok: true, message: "Google yorumları ayarları kaydedildi.", settings: structuredClone(googleReviews) };
  },
  testGoogleReviewsConnection: async input => {
    window.settingsCalls.push({ kind: "google-reviews-test", input });
    return { ok: true, message: "Google Places bağlantısı doğrulandı.", name: "BlackSea Pansiyon", rating: 4.9, userRatingCount: 42 };
  },
  getKbsSettings: async () => structuredClone(kbsSettings),
  saveKbsSettings: async input => {
    window.settingsCalls.push({ kind: "kbs", input });
    kbsSettings = {
      enabled: input.enabled,
      provider: input.provider,
      facilityCode: input.facilityCode,
      username: input.username,
      authorizedIdentityNumber: input.authorizedIdentityNumber,
      passwordConfigured: input.clearPassword ? false : Boolean(input.password) || kbsSettings.passwordConfigured
    };
    return { ok: true, message: "Kimlik Bildirim Sistemi ayarları kaydedildi.", settings: structuredClone(kbsSettings) };
  },
  testKbsConnection: async input => {
    window.settingsCalls.push({ kind: "kbs-test", input });
    return input.provider === "jandarma"
      ? { ok: true, message: "Jandarma KBS servis adresine ulaşıldı.", provider: "jandarma", credentialsVerified: false, requiresWebLogin: false }
      : { ok: true, message: "EGM KBS bilgileri hazır.", provider: "egm", credentialsVerified: false, requiresWebLogin: true, portalUrl: "https://kbs.egm.gov.tr" };
  },
  getDashboardData: async () => defaultDashboardData,
  getBusinessLayout: async () => {
    const enabled = createCapabilitySnapshotFixture(canonical).enabledCapabilities;
    return structuredClone({
      ...layout,
      capabilities: {
        rooms: enabled.includes("accommodation.rooms"),
        tables: enabled.includes("food_service.tables")
      }
    });
  },
  saveBusinessLayout: async input => {
    window.settingsCalls.push({ kind: "layout", input });
    if (window.failLayout) return { ok: false, message: "Düzen hatası" };

    if (input.rooms) {
      let nextId = 1;
      layout = {
        ...layout,
        rooms: input.rooms.map((room, index) => ({
          id: room.id || `room-new-${nextId++}`,
          name: room.name,
          number: room.number,
          capacity: room.capacity,
          bedInfo: room.bedInfo,
          floor: room.floor,
          features: [...room.features],
          description: room.description,
          priceNote: room.priceNote,
          nightlyPriceMinor: room.nightlyPriceMinor,
          currency: room.currency,
          sortOrder: index + 1,
          outOfService: room.outOfService === true,
          canRemove: true,
          removeBlockReason: ""
        }))
      };
    }
    if (input.tables) {
      layout = {
        ...layout,
        tables: layout.tables.map((table) => {
          const update = input.tables.find((candidate) => candidate.id === table.id);
          return update ? {
            ...table,
            capacity: update.capacity,
            description: update.description,
            features: [...update.features],
            smokingPolicy: update.smokingPolicy
          } : table;
        })
      };
    }
    if (input.tableCategories) {
      layout = {
        ...layout,
        tableCategories: input.tableCategories.map(({ name, tableCount }) => ({ name, tableCount }))
      };
    }
    if (input.publication) {
      layout = {
        ...layout,
        publication: { ...layout.publication, ...input.publication }
      };
    }

    const enabled = createCapabilitySnapshotFixture(canonical).enabledCapabilities;
    return {
      ok: true,
      message: "İşletme düzeni kaydedildi.",
      layout: structuredClone({
        ...layout,
        capabilities: {
          rooms: enabled.includes("accommodation.rooms"),
          tables: enabled.includes("food_service.tables")
        }
      })
    };
  },
  listRoomMedia: async (roomId) => mediaVisible(String(roomId ?? "")),
  addRoomMedia: async (input) => {
    const roomId = String(input?.roomId ?? "");
    if (!mediaDraft) mediaDraft = structuredClone(mediaCanonical);
    mediaSeq += 1;
    mediaDraft.push({ id: `media-${mediaSeq}`, roomId, kind: "photo", originalName: `oda-fotograf-${mediaSeq}.jpg`, mimeType: "image/jpeg", title: "", sortOrder: mediaDraft.length + 1, sizeBytes: 2048, updatedAt: new Date().toISOString(), remoteUrl: "", previewDataUrl: "" });
    return { ok: true, message: "Oda medyası taslağa eklendi.", media: mediaVisible(roomId), dirty: mediaStagedDirty() };
  },
  updateRoomMedia: async (input) => {
    const roomId = String(input?.roomId ?? "");
    if (!mediaDraft) mediaDraft = structuredClone(mediaCanonical);
    const target = mediaDraft.find((item) => item.roomId === roomId && item.id === input?.mediaId);
    if (!target) return { ok: false, message: "Medya kaydı bulunamadı.", media: mediaVisible(roomId), dirty: mediaStagedDirty() };
    target.kind = input?.kind ?? target.kind;
    return { ok: true, message: "Medya bilgisi taslakta güncellendi.", media: mediaVisible(roomId), dirty: mediaStagedDirty() };
  },
  deleteRoomMedia: async (input) => {
    const roomId = String(input?.roomId ?? "");
    if (!mediaDraft) mediaDraft = structuredClone(mediaCanonical);
    mediaDraft = mediaDraft.filter((item) => !(item.roomId === roomId && item.id === input?.mediaId));
    return { ok: true, message: "Medya taslaktan kaldırıldı.", media: mediaVisible(roomId), dirty: mediaStagedDirty() };
  },
  getRoomMediaDraftState: async () => ({ dirty: mediaStagedDirty() }),
  commitRoomMediaDraft: async () => {
    window.settingsCalls.push({ kind: "room-media-commit" });
    if (!mediaStagedDirty()) { mediaDraft = null; return { ok: true, message: "Oda medyalarında değişiklik yok.", dirty: false, changed: false }; }
    mediaCanonical = mediaDraft;
    mediaDraft = null;
    return { ok: true, message: "Oda medyaları kaydedildi.", dirty: false, changed: true };
  },
  discardRoomMediaDraft: async () => {
    const changed = mediaStagedDirty();
    mediaDraft = null;
    return { ok: true, message: changed ? "Oda medyası değişiklikleri geri alındı." : "Oda medyalarında bekleyen değişiklik yok.", dirty: false, changed };
  },
  listTableMedia: async (tableId) => tableMediaVisible(String(tableId ?? "")),
  addTableMedia: async (input) => {
    const tableId = String(input?.tableId ?? "");
    if (!tableMediaDraft) tableMediaDraft = structuredClone(tableMediaCanonical);
    tableMediaSeq += 1;
    tableMediaDraft.push({ id: `table-media-${tableMediaSeq}`, tableId, kind: "photo", originalName: `masa-fotograf-${tableMediaSeq}.jpg`, mimeType: "image/jpeg", title: "", sortOrder: tableMediaDraft.length + 1, sizeBytes: 2048, updatedAt: new Date().toISOString(), remoteUrl: "", previewDataUrl: "" });
    return { ok: true, message: "Masa medyası taslağa eklendi.", media: tableMediaVisible(tableId), dirty: tableMediaStagedDirty() };
  },
  updateTableMedia: async (input) => {
    const tableId = String(input?.tableId ?? "");
    if (!tableMediaDraft) tableMediaDraft = structuredClone(tableMediaCanonical);
    const target = tableMediaDraft.find((item) => item.tableId === tableId && item.id === input?.mediaId);
    if (!target) return { ok: false, message: "Medya kaydı bulunamadı.", media: tableMediaVisible(tableId), dirty: tableMediaStagedDirty() };
    target.kind = input?.kind ?? target.kind;
    return { ok: true, message: "Medya bilgisi taslakta güncellendi.", media: tableMediaVisible(tableId), dirty: tableMediaStagedDirty() };
  },
  deleteTableMedia: async (input) => {
    const tableId = String(input?.tableId ?? "");
    if (!tableMediaDraft) tableMediaDraft = structuredClone(tableMediaCanonical);
    tableMediaDraft = tableMediaDraft.filter((item) => !(item.tableId === tableId && item.id === input?.mediaId));
    return { ok: true, message: "Medya taslaktan kaldırıldı.", media: tableMediaVisible(tableId), dirty: tableMediaStagedDirty() };
  },
  getTableMediaDraftState: async () => ({ dirty: tableMediaStagedDirty() }),
  commitTableMediaDraft: async () => {
    window.settingsCalls.push({ kind: "table-media-commit" });
    if (!tableMediaStagedDirty()) {
      tableMediaDraft = null;
      return { ok: true, message: "Masa medyalarında değişiklik yok.", dirty: false, changed: false };
    }
    tableMediaCanonical = tableMediaDraft;
    tableMediaDraft = null;
    return { ok: true, message: "Masa medyaları kaydedildi.", dirty: false, changed: true };
  },
  discardTableMediaDraft: async () => {
    const changed = tableMediaStagedDirty();
    tableMediaDraft = null;
    return { ok: true, message: changed ? "Masa medyası değişiklikleri geri alındı." : "Masa medyalarında bekleyen değişiklik yok.", dirty: false, changed };
  },
  setAndroidDevicePermissionGroupsBatch: async (updates) => {
    window.settingsCalls.push({ kind: "android-permissions", input: updates });
    for (const update of updates ?? []) {
      const device = androidDevices.find((candidate) => candidate.deviceId === update?.deviceId);
      if (!device || device.role !== "staff" || device.revokedAt) {
        return { ok: false, message: "Görev alanı değiştirilecek telefon artık mevcut değil.", devices: structuredClone(androidDevices) };
      }
      device.permissionGroups = { ...update.groups };
    }
    return { ok: true, message: "Telefon görev alanları kaydedildi.", devices: structuredClone(androidDevices) };
  },
  getUpdateStatus: async () => updateStatus,
  onUpdateStatusChanged: () => () => {},
  saveUpdatePreferences: async input => { window.settingsCalls.push({ kind: "update-preferences", input }); if (window.failUpdate) return { ok: false, message: "Güncelleme tercih hatası", status: updateStatus }; updateStatus = { ...updateStatus, ...input }; return { ok: true, message: "Güncelleme tercihleri kaydedildi", status: updateStatus }; },
  checkForUpdates: async () => { window.settingsCalls.push({ kind: "update-check" }); return updateStatus; },
  updateAppPassword: async input => { window.settingsCalls.push({ kind: "password", input }); return { ok: true, message: "Şifre kaydedildi", status: { passwordConfigured: Boolean(input.newPassword) } }; },
  onDataMaintenanceConfirmation: listener => { maintenanceConfirmation = listener; return () => { maintenanceConfirmation = null; }; },
  resetLocalData: async () => {
    const approved = await maintenanceConfirmation?.({ title: "Tüm Verileri Sıfırla", description: "Bu bilgisayardaki Yardımcı Asistan verileri sıfırlanacak.", details: "İşlemden önce otomatik güvenlik yedeği alınır.", confirmLabel: "Tüm Verileri Sıfırla" });
    if (!approved) return { ok: false, cancelled: true, message: "Veri sıfırlama iptal edildi." };
    window.settingsCalls.push({ kind: "reset" });
    return { ok: true, message: "Sıfırlama hazırlandı." };
  },
  listLocalBackups: async () => ({ ok: true, backups: [] })
};
function Fixture() {
  const setup = useSetupController();
  const [ready, setReady] = useState(false);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [preferences, setPreferences] = useState(readUiPreferences);
  const [dashboard, setDashboard] = useState(() => ({ ...defaultDashboardData, androidDevices: structuredClone(androidDevices) }));
  useEffect(() => { setup.applyBootstrapSetup(canonical, false); setReady(true); }, []);
  useEffect(() => { applyUiPreferences(preferences); saveUiPreferences(preferences); }, [preferences]);
  window.refreshSettings = patch => { canonical = { ...canonical, ...patch }; setup.applyBootstrapSetup(structuredClone(canonical), false); };
  window.persistedSettings = () => canonical;
  window.reopenSettings = () => setWorkspaceKey(key => key + 1);
  const snapshot = new URLSearchParams(window.location.search).has("missingRuntime")
    ? null : createCapabilitySnapshotFixture(setup.setupData);
  const capabilities = snapshot?.enabledCapabilities ?? [];
  window.fixtureRuntimeCapabilities = () => [...capabilities];
  window.requiredCapabilities = () => getBusinessProfileSelectionCapabilities(setup.setupData.profileId, []);
  return <BusinessCapabilityRuntimeProvider value={{ snapshot }}>
    <AppShell contentScroll="workspace" sidebar={<aside className="sidebar">Test</aside>} header={<header className="page-header"><div className="page-header__main"><div className="page-header-copy"><h1 className="page-header__title">Ayarlar</h1></div><div className="page-header__notice has-notice"><FixtureStatusHost /></div><div className="page-header__actions" /></div></header>}>
      {ready && <SettingsWorkspace key={workspaceKey} setupData={setup.setupData} dashboardData={dashboard}
        onSave={input => setup.saveSetup(input, setDashboard)}
        uiPreferences={preferences}
        onUiPreferencesChange={setPreferences}
        onAppPasswordConfiguredChange={setup.setPasswordConfigured}
        onDashboardRefresh={async () => {
          setDashboard((current) => ({ ...current, androidDevices: structuredClone(androidDevices) }));
        }}
        registerPageLeaveGuard={(guard) => {
          pageLeaveGuard = guard;
          return () => {
            if (pageLeaveGuard === guard) pageLeaveGuard = null;
          };
        }}
      />}
    </AppShell>
  </BusinessCapabilityRuntimeProvider>;
}
function StoredCategory() {
  const [category] = usePageViewState("settings.category", "business");
  return <output aria-label="Stored settings category">{category}</output>;
}

function SeededFixture() {
  const [, setCategory] = usePageViewState("settings.category", "business");
  const [ready, setReady] = useState(false);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    const seed = new URLSearchParams(window.location.search).get("category");
    if (seed) setCategory(seed);
    setReady(true);
  }, []);
  window.readStoredSettingsCategory = () => setReading(true);
  return ready ? reading ? <StoredCategory /> : <Fixture /> : null;
}
createRoot(document.getElementById("root")!).render(<PageViewStateProvider>
  {new URLSearchParams(window.location.search).has("category") ? <SeededFixture /> : <Fixture />}
</PageViewStateProvider>);

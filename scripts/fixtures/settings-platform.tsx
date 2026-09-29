import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getBusinessProfileSelectionCapabilities } from "@yardimci-asistan/shared";
import { defaultDashboardData, defaultSetupData } from "../../apps/desktop-app/src/app/bootstrap-defaults";
import { useSetupController } from "../../apps/desktop-app/src/app/use-setup-controller";
import { settingsCapabilities } from "../../apps/desktop-app/src/app/settings-registry";
import { toSetupForm } from "../../apps/desktop-app/src/app/setup-model";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { SettingsWorkspace } from "../../apps/desktop-app/src/components/settings/SettingsWorkspace";
import type { PageLeaveGuard } from "../../apps/desktop-app/src/app/page-navigation-guard";
import { AppShell } from "../../apps/desktop-app/src/components/layout/AppShell";
import { readUiPreferences, applyUiPreferences, saveUiPreferences } from "../../apps/desktop-app/src/ui-preferences";
import "../../apps/desktop-app/src/styles/index.css";

let maintenanceConfirmation: ((request: { title: string; description: string; details: string; confirmLabel: string }) => Promise<boolean>) | null = null;
let canonical = { ...defaultSetupData, setupRequired: false, businessName: "İlk Firma", syncSecret: "settings-platform-secret" };
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
let googleReviews = { enabled: false, placeId: "", apiKeyConfigured: false, lastPublishedAt: "", publicationPending: false };
window.yardimciDesktop = {
  getSetupData: async () => structuredClone(canonical),
  saveInitialSetup: async input => {
    window.settingsCalls.push({ kind: "setup", input });
    if (window.delaySetup) await new Promise(resolve => { window.finishSetup = resolve; });
    if (window.failSetup) return { ok: false, message: "Test kayıt hatası" };
    canonical = { ...canonical, ...input, setupRequired: false, aiApiKeyConfigured: Boolean(input.aiApiKey) || canonical.aiApiKeyConfigured };
    return { ok: true, message: "Kaydedildi", setupData: structuredClone(canonical), dashboardData: { ...defaultDashboardData, androidDevices: structuredClone(androidDevices) } };
  },
  getBusinessPublicProfile: async () => profile,
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
  getDashboardData: async () => defaultDashboardData,
  getBusinessLayout: async () => {
    const enabled = getBusinessProfileSelectionCapabilities(canonical.profileId, canonical.profileOptions);
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

    const enabled = getBusinessProfileSelectionCapabilities(canonical.profileId, canonical.profileOptions);
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
  const [preferences, setPreferences] = useState(readUiPreferences);
  const [dashboard, setDashboard] = useState(() => ({ ...defaultDashboardData, androidDevices: structuredClone(androidDevices) }));
  useEffect(() => { setup.applyBootstrapSetup(canonical, false); setReady(true); }, []);
  useEffect(() => { applyUiPreferences(preferences); saveUiPreferences(preferences); }, [preferences]);
  window.refreshSettings = patch => { canonical = { ...canonical, ...patch }; setup.applyBootstrapSetup(structuredClone(canonical), false); };
  window.persistedSettings = () => canonical;
  const capabilities = settingsCapabilities(toSetupForm(setup.setupData));
  window.requiredCapabilities = () => getBusinessProfileSelectionCapabilities(setup.setupData.profileId, []);
  return <BusinessCapabilityRuntimeProvider value={{ snapshot: { profileId: setup.setupData.profileId, enabledCapabilities: capabilities }, state: "success", message: "", setCapability: async () => undefined, clearOverride: async () => undefined }}>
    <AppShell contentScroll="workspace" sidebar={<aside className="sidebar">Test</aside>} header={<header className="page-header"><h1>Ayarlar</h1></header>}>
      {ready && <SettingsWorkspace setupData={setup.setupData} dashboardData={dashboard}
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
createRoot(document.getElementById("root")!).render(<Fixture />);

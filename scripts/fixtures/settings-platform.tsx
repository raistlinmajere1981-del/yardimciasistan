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
  tableCategories: [{ name: "Salon", tableCount: 2 }]
};
let updateStatus = { phase: "idle", message: "Hazır", currentVersion: "1", defaultBaseUrl: "https://example.test/updates", customBaseUrl: "", autoCheckEnabled: true, notes: [], installSupported: false };
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
    return { ok: true, message: "Kaydedildi", setupData: structuredClone(canonical), dashboardData: defaultDashboardData };
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
    if (input.tableCategories) {
      layout = {
        ...layout,
        tableCategories: input.tableCategories.map(({ name, tableCount }) => ({ name, tableCount }))
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
  listRoomMedia: async () => [],
  addRoomMedia: async () => ({ ok: true, message: "Medya eklendi.", media: [] }),
  updateRoomMedia: async () => ({ ok: true, message: "Medya güncellendi.", media: [] }),
  deleteRoomMedia: async () => ({ ok: true, message: "Medya kaldırıldı.", media: [] }),
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
  const [, setDashboard] = useState(defaultDashboardData);
  useEffect(() => { setup.applyBootstrapSetup(canonical, false); setReady(true); }, []);
  useEffect(() => { applyUiPreferences(preferences); saveUiPreferences(preferences); }, [preferences]);
  window.refreshSettings = patch => { canonical = { ...canonical, ...patch }; setup.applyBootstrapSetup(structuredClone(canonical), false); };
  window.persistedSettings = () => canonical;
  const capabilities = settingsCapabilities(toSetupForm(setup.setupData));
  window.requiredCapabilities = () => getBusinessProfileSelectionCapabilities(setup.setupData.profileId, []);
  return <BusinessCapabilityRuntimeProvider value={{ snapshot: { profileId: setup.setupData.profileId, enabledCapabilities: capabilities }, state: "success", message: "", setCapability: async () => undefined, clearOverride: async () => undefined }}>
    <AppShell contentScroll="workspace" sidebar={<aside className="sidebar">Test</aside>} header={<header className="page-header"><h1>Ayarlar</h1></header>}>
      {ready && <SettingsWorkspace setupData={setup.setupData} dashboardData={defaultDashboardData}
        onSave={input => setup.saveSetup(input, setDashboard)}
        uiPreferences={preferences}
        onUiPreferencesChange={setPreferences}
        onAppPasswordConfiguredChange={setup.setPasswordConfigured}
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

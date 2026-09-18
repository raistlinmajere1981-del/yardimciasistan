import { useCallback, useEffect, useImperativeHandle, useRef, useState, type MutableRefObject, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ExternalLink, Plus, RefreshCw, ShieldCheck, Smartphone, Trash2, UploadCloud } from "lucide-react";
import { androidAvailablePermissionGroupIds, type AndroidPermissionGroupId, type AndroidPermissionGroups } from "@yardimci-asistan/sync-core";
import {
  BUSINESS_CAPABILITIES,
  getBusinessProfiles,
  hasBusinessCapability,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { DesktopAndroidDevice, DesktopDashboardData, DesktopSetupData } from "../../../electron/database";
import { formatDateTime } from "../../app/record-formatters";
import {
  aiServicePresets,
  createDefaultAiServiceDraft,
  isAiServiceProfileStored,
  nextTableCategoryFormKey,
  normalizeAiService,
  toAiServiceFormDraft,
  type SetupFormState
} from "../../app/setup-model";
import { UI_SCALE_OPTIONS, type UiMode, type UiPreferences } from "../../ui-preferences";
import type {
  SettingsOperationResult,
  SettingsSaveHandle,
  SettingsSaveSectionHandle,
  SettingsSaveState
} from "../../app/settings-save";
import { DataMaintenanceSettings } from "./DataMaintenanceSettings";
import { PasswordSettings } from "../security/PasswordSettings";
import { RoomManagementSection } from "./RoomManagementSection";
import { ActionButton } from "../ui/ActionButton";

type SyncState = "idle" | "loading" | "success" | "error";

const STORED_AI_API_KEY_MASK = "*".repeat(20);

function setupStatusClass(state: SyncState) {
  const tone = state === "error" ? "danger" : state === "success" ? "success" : state === "loading" ? "info" : "";
  return `status-message setup-status-message${tone ? ` status-message--${tone}` : ""}`;
}

const ANDROID_PERMISSION_GROUP_OPTIONS: Array<{
  id: AndroidPermissionGroupId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  { id: "service_orders", label: "Servis / Sipariş", shortLabel: "Servis", description: "Masa, sipariş ve servis akışı" },
  { id: "cashier", label: "Kasa / Hesap", shortLabel: "Kasa", description: "Ödendi / Kapat işlemi" },
  { id: "rooms_tasks", label: "Oda / Günlük İşler", shortLabel: "Oda işleri", description: "Oda durumu ve günlük işler" },
  { id: "customer_reservation", label: "Müşteri / Rezervasyon", shortLabel: "Müşteri / Rezervasyon", description: "Talep yanıtı ve rezervasyon onayı" },
  {
    id: "market_operations",
    label: "Market / El Terminali",
    shortLabel: "Market",
    description: "Barkod, stok sayımı, mal kabulü, ürün taslağı ve sepet hazırlama"
  }
];

interface SetupFormProps {
  form: SetupFormState;
  enabledCapabilities: BusinessCapability[];
  setupData: DesktopSetupData;
  dashboardData?: DesktopDashboardData;
  publicProfile?: ReactNode;
  publicProfileSaveRef?: MutableRefObject<SettingsSaveSectionHandle | null>;
  settingsSaveRef?: MutableRefObject<SettingsSaveHandle | null>;
  onSettingsSaveStateChange?: (state: SettingsSaveState, message: string) => void;
  onDashboardRefresh?: () => Promise<unknown>;
  androidPublishState?: SyncState;
  androidPublishMessage?: string;
  androidDeviceState?: SyncState;
  androidDeviceMessage?: string;
  aiConnectionTestState: SyncState;
  aiConnectionTestMessage: string;
  onFormChange: (form: SetupFormState) => void;
  onTestAiConnection: () => void;
  onPublishAndroid?: () => void;
  onSetAndroidDeviceRole?: (deviceId: string, role: "admin" | "staff") => void;
  onSetAndroidDevicePermissionGroups?: (deviceId: string, groups: AndroidPermissionGroups) => void;
  onSetAndroidDeviceActive?: (deviceId: string, active: boolean) => void;
  onResetAndroidDevicePermissions?: (deviceId: string) => void;
  onRevokeAndroidDevice?: (device: DesktopAndroidDevice) => void;
  onAppPasswordConfiguredChange?: (configured: boolean) => void;
  onSave: () => Promise<SettingsOperationResult>;
  uiPreferences: UiPreferences;
  onUiPreferencesChange: (preferences: UiPreferences) => void;
}

export function SetupForm({
  form,
  enabledCapabilities,
  setupData,
  dashboardData,
  publicProfile,
  publicProfileSaveRef,
  settingsSaveRef,
  onSettingsSaveStateChange,
  onDashboardRefresh,
  androidPublishState = "idle",
  androidPublishMessage = "Telefon özeti henüz yayınlanmadı.",
  androidDeviceState = "idle",
  androidDeviceMessage = "Telefon rolleri ve görev alanları masaüstünden yönetilir.",
  aiConnectionTestState,
  aiConnectionTestMessage,
  onFormChange,
  onTestAiConnection,
  onPublishAndroid,
  onSetAndroidDeviceRole,
  onSetAndroidDevicePermissionGroups,
  onSetAndroidDeviceActive,
  onResetAndroidDevicePermissions,
  onRevokeAndroidDevice,
  onAppPasswordConfiguredChange,
  onSave,
  uiPreferences,
  onUiPreferencesChange
}: SetupFormProps) {
  const [showAiApiKey, setShowAiApiKey] = useState(false);
  const [showGoogleCurl, setShowGoogleCurl] = useState(false);
  const [revealedAiApiKey, setRevealedAiApiKey] = useState("");
  const [aiApiKeyRevealState, setAiApiKeyRevealState] = useState<"idle" | "loading" | "error">("idle");
  const [aiApiKeyRevealMessage, setAiApiKeyRevealMessage] = useState("");
  const selectedAiServiceRef = useRef(form.aiService);
  const appearanceModeRefs = useRef<Record<UiMode, HTMLButtonElement | null>>({ easy: null, pro: null });
  const roomSaveRef = useRef<SettingsSaveSectionHandle | null>(null);
  const passwordSaveRef = useRef<SettingsSaveSectionHandle | null>(null);
  const settingsSaveInFlightRef = useRef(false);
  const [webConnectionTestState, setWebConnectionTestState] = useState<SyncState>("idle");
  const [webConnectionTestMessage, setWebConnectionTestMessage] = useState("Web bağlantısı henüz denenmedi.");

  useEffect(() => {
    selectedAiServiceRef.current = form.aiService;
    setShowAiApiKey(false);
    setShowGoogleCurl(false);
    setRevealedAiApiKey("");
    setAiApiKeyRevealState("idle");
    setAiApiKeyRevealMessage("");
  }, [form.aiService, form.clearAiApiKey]);

  useEffect(() => {
    setWebConnectionTestState("idle");
    setWebConnectionTestMessage("Web bağlantısı henüz denenmedi.");
  }, [form.webModuleUrl, form.syncSecret]);

  const update = <Key extends keyof SetupFormState,>(key: Key, value: SetupFormState[Key]) => {
    onFormChange({ ...form, [key]: value });
  };

  const updateBirthday = <Key extends keyof SetupFormState["birthdaySettings"],>(
    key: Key,
    value: SetupFormState["birthdaySettings"][Key]
  ) => {
    update("birthdaySettings", { ...form.birthdaySettings, [key]: value });
  };

  const handleAppearanceModeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, currentMode: UiMode) => {
    const modes: UiMode[] = ["easy", "pro"];
    const currentIndex = modes.indexOf(currentMode);
    let nextMode: UiMode | undefined;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextMode = modes[(currentIndex + 1) % modes.length];
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextMode = modes[(currentIndex - 1 + modes.length) % modes.length];
    } else if (event.key === "Home") {
      nextMode = modes[0];
    } else if (event.key === "End") {
      nextMode = modes[modes.length - 1];
    }

    if (!nextMode) return;

    event.preventDefault();
    onUiPreferencesChange({ ...uiPreferences, mode: nextMode });
    appearanceModeRefs.current[nextMode]?.focus();
  };

  const updateTableCategory = (key: string, field: "name" | "tableCount", value: string) => {
    update("tableCategories", form.tableCategories.map((category) =>
      category.key === key ? { ...category, [field]: value } : category
    ));
  };

  const addTableCategory = () => {
    update("tableCategories", [
      ...form.tableCategories,
      {
        key: nextTableCategoryFormKey(),
        sourceName: "",
        name: "",
        tableCount: "1"
      }
    ]);
  };

  const removeTableCategory = (key: string) => {
    update("tableCategories", form.tableCategories.filter((category) => category.key !== key));
  };

  const tableCountTotal = form.tableCategories.reduce((total, category) => {
    const count = Number(category.tableCount);
    return total + (Number.isFinite(count) && count > 0 ? count : 0);
  }, 0);
  const accommodationEnabled = hasBusinessCapability(
    enabledCapabilities,
    BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS
  );
  const foodServiceEnabled = hasBusinessCapability(
    enabledCapabilities,
    BUSINESS_CAPABILITIES.FOOD_TABLES
  );

  const googleUsesStoredApiKey = form.aiStoredApiKeyConfigured && !form.clearAiApiKey && !form.aiGoogleCurl && !form.aiApiKey;
  const genericUsesStoredApiKey = form.aiStoredApiKeyConfigured && !form.clearAiApiKey && !form.aiApiKey;
  const googleSecretValue = form.aiGoogleCurl
    || form.aiApiKey
    || (googleUsesStoredApiKey ? (showGoogleCurl ? revealedAiApiKey : STORED_AI_API_KEY_MASK) : "");
  const genericSecretValue = form.aiApiKey
    || (genericUsesStoredApiKey ? (showAiApiKey ? revealedAiApiKey : STORED_AI_API_KEY_MASK) : "");

  const testWebConnection = async () => {
    const baseUrl = form.webModuleUrl.trim().replace(/\/+$/, "");
    const syncSecret = form.syncSecret.trim();
    if (!/^https?:\/\//i.test(baseUrl)) {
      setWebConnectionTestState("error");
      setWebConnectionTestMessage("Web eşitleme adresi http:// veya https:// ile başlamalı.");
      return;
    }
    if (syncSecret.length < 12) {
      setWebConnectionTestState("error");
      setWebConnectionTestMessage("Web güvenlik anahtarı en az 12 karakter olmalı.");
      return;
    }

    const bridge = window.yardimciDesktop;
    if (!bridge?.testWebConnection) {
      setWebConnectionTestState("error");
      setWebConnectionTestMessage("Web bağlantı kontrolü hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setWebConnectionTestState("loading");
    setWebConnectionTestMessage("Web modülüne bağlanılıyor...");
    try {
      const result = await bridge.testWebConnection({ baseUrl, syncSecret });
      setWebConnectionTestState(result.ok ? "success" : "error");
      setWebConnectionTestMessage(result.message);
    } catch {
      setWebConnectionTestState("error");
      setWebConnectionTestMessage("Web bağlantısı kontrol edilemedi. Uygulamayı yeniden başlatıp tekrar deneyin.");
    }
  };

  const toggleAiApiKeyVisibility = async (field: "google" | "generic") => {
    const isVisible = field === "google" ? showGoogleCurl : showAiApiKey;
    const setVisible = field === "google" ? setShowGoogleCurl : setShowAiApiKey;
    if (isVisible) {
      setVisible(false);
      setRevealedAiApiKey("");
      setAiApiKeyRevealState("idle");
      setAiApiKeyRevealMessage("");
      return;
    }

    const pendingValue = field === "google" ? form.aiGoogleCurl || form.aiApiKey : form.aiApiKey;
    if (pendingValue || !form.aiStoredApiKeyConfigured) {
      setVisible(true);
      return;
    }

    const requestedService = form.aiService;
    const bridge = window.yardimciDesktop;
    if (!bridge?.revealAiApiKey) {
      setAiApiKeyRevealState("error");
      setAiApiKeyRevealMessage("Bağlantı anahtarı gösterilemiyor. Uygulamayı yeniden başlatın.");
      return;
    }

    setAiApiKeyRevealState("loading");
    setAiApiKeyRevealMessage("");
    const result = await bridge.revealAiApiKey(requestedService);
    if (selectedAiServiceRef.current !== requestedService) {
      return;
    }
    if (!result.ok) {
      setAiApiKeyRevealState("error");
      setAiApiKeyRevealMessage(result.message);
      return;
    }

    setRevealedAiApiKey(result.apiKey);
    setVisible(true);
    setAiApiKeyRevealState("idle");
  };

  const replaceGoogleSecret = (value: string) => {
    let nextValue = value;
    if (googleUsesStoredApiKey && !showGoogleCurl && nextValue.startsWith(STORED_AI_API_KEY_MASK)) {
      nextValue = nextValue.slice(STORED_AI_API_KEY_MASK.length);
    }

    setRevealedAiApiKey("");
    setAiApiKeyRevealState("idle");
    setAiApiKeyRevealMessage("");
    if (form.aiApiKey && !form.aiGoogleCurl) {
      onFormChange({ ...form, aiApiKey: nextValue });
      return;
    }
    if (googleUsesStoredApiKey && showGoogleCurl) {
      onFormChange({ ...form, aiApiKey: nextValue, aiGoogleCurl: "" });
      return;
    }
    onFormChange({ ...form, aiGoogleCurl: nextValue, aiApiKey: "" });
  };

  const replaceGenericSecret = (value: string) => {
    const nextValue = genericUsesStoredApiKey && !showAiApiKey && value.startsWith(STORED_AI_API_KEY_MASK)
      ? value.slice(STORED_AI_API_KEY_MASK.length)
      : value;
    setRevealedAiApiKey("");
    setAiApiKeyRevealState("idle");
    setAiApiKeyRevealMessage("");
    update("aiApiKey", nextValue);
  };

  const updateAiService = (service: string) => {
    const normalizedService = normalizeAiService(service);
    const currentDraft = toAiServiceFormDraft(form);
    const targetDraft = form.aiServiceDrafts[normalizedService] ?? createDefaultAiServiceDraft(normalizedService);
    onFormChange({
      ...form,
      aiService: normalizedService,
      aiProjectName: targetDraft.projectName,
      aiGoogleCurl: targetDraft.googleCurl,
      aiBaseUrl: targetDraft.baseUrl,
      aiModel: targetDraft.model,
      aiModelOptions: targetDraft.modelOptions,
      aiApiKey: targetDraft.apiKey,
      aiStoredApiKeyConfigured: targetDraft.storedApiKeyConfigured,
      clearAiApiKey: targetDraft.clearApiKey,
      aiTimeoutSeconds: targetDraft.timeoutSeconds,
      aiServiceDrafts: {
        ...form.aiServiceDrafts,
        [form.aiService]: currentDraft
      }
    });
  };

  const renderAiConnectionActions = (inline: boolean) => (
    <div className={`setup-ai-actions${inline ? " is-inline" : ""} sync-${aiConnectionTestState}`}>
      <ActionButton variant="secondary" className="setup-secondary" type="button" onClick={onTestAiConnection} disabled={!form.aiEnabled || aiConnectionTestState === "loading" || (form.aiService === "gemini" && !form.aiGoogleCurl.trim() && !form.aiApiKey.trim() && !form.aiStoredApiKeyConfigured)}>
        <RefreshCw size={16} aria-hidden="true" />
        {aiConnectionTestState === "loading" ? "Bağlantı deneniyor" : "Bağlantıyı Dene"}
      </ActionButton>
      <span className="setup-connection-message" role="status" aria-live="polite">{aiConnectionTestMessage}</span>
    </div>
  );

  const saveSettings = useCallback(async () => {
    if (settingsSaveInFlightRef.current) return false;

    const initialSetup = setupData.setupRequired;
    settingsSaveInFlightRef.current = true;
    onSettingsSaveStateChange?.("loading", "Kaydediliyor...");
    const getSections = () => [
      { label: "Müşteri bilgileri", handle: initialSetup ? null : publicProfileSaveRef?.current },
      { label: "Oda yönetimi", handle: initialSetup ? null : roomSaveRef.current },
      { label: "Uygulama şifresi", handle: passwordSaveRef.current }
    ].filter(
      (section): section is { label: string; handle: SettingsSaveSectionHandle } => Boolean(section.handle)
    );

    try {
      for (const section of getSections()) {
        const validationMessage = section.handle.validate();
        if (validationMessage) {
          onSettingsSaveStateChange?.("error", `${section.label}: ${validationMessage}`);
          section.handle.focus();
          return false;
        }
      }

      const setupResult = await onSave();
      if (!setupResult.ok) {
        onSettingsSaveStateChange?.("error", setupResult.message);
        return false;
      }

      for (const section of getSections()) {
        const result = await section.handle.save();
        if (!result.ok) {
          onSettingsSaveStateChange?.("error", `${section.label}: ${result.message}`);
          section.handle.focus();
          return false;
        }
      }

      onSettingsSaveStateChange?.("success", "Ayarlar kaydedildi.");
      return true;
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : "Ayarlar kaydedilemedi.";
      onSettingsSaveStateChange?.("error", message);
      return false;
    } finally {
      settingsSaveInFlightRef.current = false;
    }
  }, [onSave, onSettingsSaveStateChange, publicProfileSaveRef, setupData.setupRequired]);

  useImperativeHandle(settingsSaveRef, () => ({ save: saveSettings }), [saveSettings]);

  useEffect(() => {
    onSettingsSaveStateChange?.("idle", "Ayarlar düzenlenebilir.");
  }, [onSettingsSaveStateChange]);

  return (
    <main className={`setup-shell is-embedded${setupData.setupRequired ? " is-initial-setup" : ""}`}>
      <section className="setup-form-surface">
        <nav className="settings-section-nav" aria-label="Ayar bölümleri">
          <a href="#settings-business">İşletme</a>
          <a href="#settings-operations">İşletme düzeni</a>
          <a href="#settings-connections">Servisler</a>
          <a href="#settings-application">Uygulama</a>
          {!setupData.setupRequired && <a href="#settings-maintenance">Bakım</a>}
        </nav>

        <div id="settings-business" className="setup-section settings-identity-section">
          <div className="setup-section-title">
            <h2>İşletme</h2>
          </div>
          <div className="form-row">
            <label className="form-field form-field--long">
              Firma adı
            <input value={form.businessName} onChange={(event) => update("businessName", event.target.value)} placeholder="İşletme adı" />
            </label>
            <label className="form-field form-field--medium">
              Sektör tipi
              <select value={form.profileId} onChange={(event) => update("profileId", event.target.value)}>
                {getBusinessProfiles().map((profile) => (
                  <option value={profile.id} key={profile.id}>{profile.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label className="form-field form-field--short">
              Telefon
              <input value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+90 5xx xxx xx xx" />
            </label>
            <label className="form-field form-field--short">
              WhatsApp
              <input value={form.whatsapp} onChange={(event) => update("whatsapp", event.target.value)} placeholder="+90 5xx xxx xx xx" />
            </label>
            <label className="form-field form-field--medium">
              E-posta
              <input value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="info@firma.com" />
            </label>
          </div>
          <div className="form-row">
            <label className="form-field form-field--long">
              Adres
              <input value={form.address} onChange={(event) => update("address", event.target.value)} placeholder="İşletme adresi" />
            </label>
          </div>

          {publicProfile}
        </div>

        <div id="settings-operations" className="setup-section settings-daily-section">
          <div className="setup-section-title">
            <h2>İşletme Düzeni</h2>
          </div>
          {accommodationEnabled && <div className="setup-count-row settings-room-count">
            <label className="form-field form-field--xs">
              Oda sayısı
              <input value={form.roomCount} onChange={(event) => update("roomCount", event.target.value)} inputMode="numeric" min="0" step="1" type="number" />
            </label>
          </div>}
          {foodServiceEnabled && <div className="table-category-editor">
            <div className="table-category-heading">
              <div>
                <strong>Masa kategorileri</strong>
                <small>Restoran alanlarını adlandırın ve her alandaki masa sayısını belirleyin.</small>
              </div>
              <span>{tableCountTotal} masa</span>
            </div>
            {form.tableCategories.length === 0 ? (
              <div className="table-category-empty">
                <span>Henüz masa kategorisi yok.</span>
                <small>Masa kullanacaksanız ilk kategoriyi ekleyin.</small>
              </div>
            ) : (
              <div className="table-category-list">
                {form.tableCategories.map((category, index) => (
                  <div className="table-category-row" key={category.key}>
                    <label className="form-field form-field--medium">
                      <span>Kategori adı</span>
                      <input
                        value={category.name}
                        onChange={(event) => updateTableCategory(category.key, "name", event.target.value)}
                        placeholder={index === 0 ? "Örn. Salon" : "Örn. Bahçe"}
                        maxLength={50}
                      />
                    </label>
                    <label className="form-field form-field--xs table-category-count">
                      <span>Masa</span>
                      <input
                        value={category.tableCount}
                        onChange={(event) => updateTableCategory(category.key, "tableCount", event.target.value)}
                        inputMode="numeric"
                        min="1"
                        max="200"
                        step="1"
                        type="number"
                      />
                    </label>
                    <ActionButton
                      variant="ghost"
                      size="sm"
                      className="table-category-remove"
                      type="button"
                      onClick={() => removeTableCategory(category.key)}
                      aria-label={`${category.name || `${index + 1}. kategori`} satırını kaldır`}
                      title="Kategoriyi kaldır"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </ActionButton>
                  </div>
                ))}
              </div>
            )}
            <ActionButton variant="secondary" size="sm" className="table-category-add" type="button" onClick={addTableCategory}>
              <Plus size={15} aria-hidden="true" />
              Kategori Ekle
            </ActionButton>
            <small className="table-category-note">
              Adedi azalttığınızda kullanılmayan masalar arşivlenir; aktif adisyon veya rezervasyona bağlı masalar korunur.
            </small>
          </div>}
        </div>
        {!setupData.setupRequired && (
          <RoomManagementSection
            roomCount={form.roomCount}
            dashboardRoomCount={dashboardData?.rooms.length ?? 0}
            onRoomCountChange={(value) => update("roomCount", value)}
            onDashboardRefresh={onDashboardRefresh}
            saveHandleRef={roomSaveRef}
          />
        )}
        <div id="settings-connections" className="settings-services-workspace">
          <div className="settings-services-heading">
            <h2>Servisler</h2>
          </div>

          <section className={`settings-service-card${form.whatsappEnabled ? " is-enabled" : " is-disabled"}`}>
            <div className="settings-service-card-header">
              <div>
                <strong>WhatsApp</strong>
                <span>{form.whatsappEnabled ? "Açık" : "Kapalı"}</span>
              </div>
              <label className="settings-service-toggle">
                <input checked={form.whatsappEnabled} onChange={(event) => update("whatsappEnabled", event.target.checked)} type="checkbox" />
                <span>{form.whatsappEnabled ? "Açık" : "Kapalı"}</span>
              </label>
            </div>
            <fieldset className="settings-service-card-body setup-birthday-settings form-stack" disabled={!form.whatsappEnabled}>
              <div className="setup-section-title setup-section-title--subsection">
                <h3>Doğum Günü Mesajları</h3>
              </div>
            <label className="form-check setup-checkline">
              <input
                checked={form.birthdaySettings.enabled}
                onChange={(event) => updateBirthday("enabled", event.target.checked)}
                type="checkbox"
              />
              Doğum günü mesajlarını kullan
            </label>
            <div className="form-grid">
              <fieldset className="form-stack birthday-mode-fieldset">
                <legend>Gönderim:</legend>
                <label className="form-check">
                  <input
                    checked={form.birthdaySettings.mode === "manual"}
                    onChange={() => updateBirthday("mode", "manual")}
                    name="birthday-mode"
                    type="radio"
                  />
                  Manuel
                </label>
                <label className="form-check">
                  <input
                    checked={form.birthdaySettings.mode === "automatic"}
                    onChange={() => updateBirthday("mode", "automatic")}
                    name="birthday-mode"
                    type="radio"
                  />
                  Otomatik
                </label>
              </fieldset>
              <label className="form-field form-field--short">
                Gönderim saati
                <input
                  type="time"
                  lang="tr-TR"
                  value={form.birthdaySettings.sendTime}
                  onChange={(event) => updateBirthday("sendTime", event.target.value)}
                  disabled={!form.birthdaySettings.enabled}
                />
              </label>
              <label className="form-field form-field--span form-field--fluid">
                Mesaj
                <textarea
                  value={form.birthdaySettings.messageTemplate}
                  onChange={(event) => updateBirthday("messageTemplate", event.target.value)}
                  maxLength={4000}
                  disabled={!form.birthdaySettings.enabled}
                />
                <small>{"{ad}"} ve {"{işletme}"} yer tutucuları desteklenir.</small>
              </label>
            </div>
              <small className="setup-birthday-note">
                Otomatik modda uygulama ve WhatsApp oturumu açık olduğunda, doğum günü mesajları seçtiğiniz saatten itibaren aynı gün otomatik gönderilir.
              </small>
            </fieldset>
          </section>

          <div className="setup-toggle-grid settings-service-legacy-toggles">
            <label>
              <input checked={form.androidEnabled} onChange={(event) => update("androidEnabled", event.target.checked)} type="checkbox" />
              Android
            </label>
          </div>
        </div>

        <section className="settings-service-card is-enabled settings-web-section">
          <div className="settings-service-card-header">
            <div>
              <strong>Web Modülü</strong>
              <span>{form.webModuleUrl.trim() && form.syncSecret.trim() ? "Yapılandırıldı" : "Yapılandırılmadı"}</span>
            </div>
            <label className="settings-service-toggle">
              <input checked={form.autoSyncEnabled} onChange={(event) => update("autoSyncEnabled", event.target.checked)} type="checkbox" />
              <span>Otomatik eşitle</span>
            </label>
          </div>
          <div className="settings-service-card-body">
          <div className="form-grid">
            <label className="form-field form-field--long form-field--span setup-field">
              Web eşitleme adresi
              <input value={form.webModuleUrl} onChange={(event) => update("webModuleUrl", event.target.value)} placeholder="https://yardimciasistan.alwaysdata.net/yardimci-asistan" />
            </label>
            <label className="form-field form-field--medium">
              Web güvenlik anahtarı
              <input
                value={form.syncSecret}
                onChange={(event) => update("syncSecret", event.target.value)}
                placeholder="uzun-gizli-anahtar"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
              />
            </label>
          </div>
          <div className={`setup-ai-actions is-inline setup-web-actions sync-${webConnectionTestState}`}>
            <ActionButton variant="secondary" className="setup-secondary" type="button" onClick={() => void testWebConnection()} disabled={webConnectionTestState === "loading"}>
              <RefreshCw size={16} aria-hidden="true" />
              {webConnectionTestState === "loading" ? "Bağlantı deneniyor" : "Web Bağlantısını Dene"}
            </ActionButton>
            <span className="setup-connection-message" role="status" aria-live="polite">{webConnectionTestMessage}</span>
          </div>
          </div>
        </section>

        <section className={`settings-service-card setup-ai-section${form.aiEnabled ? " is-enabled" : " is-disabled"}`}>
          <div className="settings-service-card-header">
            <div>
              <strong>AI Yardımcı</strong>
              <span>{form.aiEnabled ? (form.aiStoredApiKeyConfigured ? "Hazır" : "Açık · anahtar bekliyor") : "Kapalı"}</span>
            </div>
            <label className="settings-service-toggle">
              <input checked={form.aiEnabled} onChange={(event) => update("aiEnabled", event.target.checked)} type="checkbox" />
              <span>{form.aiEnabled ? "Açık" : "Kapalı"}</span>
            </label>
          </div>
          <div className="settings-service-card-body">
          <div className="form-grid">
            <label className="form-field form-field--medium setup-ai-service-field">
              Servis sağlayıcı
              <select value={form.aiService} onChange={(event) => updateAiService(event.target.value)} disabled={!form.aiEnabled}>
                {aiServicePresets.map((preset) => (
                  <option value={preset.id} key={preset.id}>
                    {preset.label}{isAiServiceProfileStored(form, preset.id) ? " · kayıtlı" : ""}
                  </option>
                ))}
              </select>
            </label>
            {form.aiService === "gemini" ? (
              <>
                <div className="setup-field setup-ai-studio-help">
                  <ActionButton variant="secondary" className="setup-secondary" type="button" onClick={() => void window.yardimciDesktop?.openExternal("https://aistudio.google.com/apikey")} disabled={!form.aiEnabled}>
                    <ExternalLink size={16} aria-hidden="true" />
                    Google AI Studio'yu Aç
                  </ActionButton>
                  <small>Bağlantı anahtarı ayrıntısında “Copy cURL quickstart” seçeneğini kullanın.</small>
                </div>
                <div className="form-field form-field--long form-field--span setup-ai-curl-field">
                  <span>Google AI Studio cURL bağlantısı</span>
                  <div className="field-control-group setup-secret-input">
                    <input
                      aria-label="Google AI Studio cURL bağlantısı"
                      value={googleSecretValue}
                      onChange={(event) => replaceGoogleSecret(event.target.value)}
                      onFocus={(event) => {
                        if (googleUsesStoredApiKey) event.currentTarget.select();
                      }}
                      type={showGoogleCurl || googleUsesStoredApiKey ? "text" : "password"}
                      placeholder={form.aiStoredApiKeyConfigured ? "Kayıtlı bağlantıyı değiştirmek için yeni cURL yapıştırın" : "Copy cURL quickstart çıktısını buraya yapıştırın"}
                      disabled={!form.aiEnabled || form.clearAiApiKey}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <ActionButton variant="secondary" size="sm" type="button" onClick={() => void toggleAiApiKeyVisibility("google")} disabled={!form.aiEnabled || form.clearAiApiKey || aiApiKeyRevealState === "loading"} aria-pressed={showGoogleCurl}>
                      {aiApiKeyRevealState === "loading" ? "Açılıyor" : showGoogleCurl ? "Gizle" : "Göster"}
                    </ActionButton>
                  </div>
                  <small>{form.aiStoredApiKeyConfigured ? "Kayıtlı bağlantı anahtarı maskelenir; Göster ile görüntüleyebilir veya yeni cURL yapıştırabilirsiniz." : "Komut yalnız bağlantı kontrolünde okunur; adres, anahtar ve örnek model otomatik hazırlanır."}</small>
                  {aiApiKeyRevealMessage && <small className="setup-secret-error" role="status">{aiApiKeyRevealMessage}</small>}
                </div>
                {renderAiConnectionActions(true)}
              </>
            ) : (
              <label className="form-field form-field--long form-field--span">
                Bağlantı adresi
                <input value={form.aiBaseUrl} onChange={(event) => update("aiBaseUrl", event.target.value)} placeholder="https://servis.example/v1" disabled={!form.aiEnabled} spellCheck={false} />
              </label>
            )}
            <label className="form-field form-field--medium">
              Model adı
              {form.aiService === "gemini" && form.aiModelOptions.length > 0 ? (
                <select value={form.aiModel} onChange={(event) => update("aiModel", event.target.value)} disabled={!form.aiEnabled}>
                  {form.aiModelOptions.map((model) => (
                    <option value={model.id} key={model.id}>{model.label}</option>
                  ))}
                </select>
              ) : (
                <input value={form.aiModel} onChange={(event) => update("aiModel", event.target.value)} placeholder={form.aiService === "gemini" ? "Bağlantı kontrolünden sonra listelenir" : "Serviste görünen model adı"} disabled={!form.aiEnabled || form.aiService === "gemini"} spellCheck={false} />
              )}
              {form.aiService === "gemini" && (
                <small>{form.aiModelOptions.length > 0
                  ? form.aiStoredApiKeyConfigured
                    ? `${form.aiModelOptions.length} görsel ve metin modeli bu sağlayıcı altında kayıtlı.`
                    : `${form.aiModelOptions.length} görsel ve metin modeli hazır; kalıcı olması için ayarları kaydedin.`
                  : "Bağlantıyı Dene ile görsel destekli, güncel modeller otomatik alınır."}</small>
              )}
            </label>
            <label className="form-field form-field--short">
              Yanıt bekleme süresi (saniye)
              <input value={form.aiTimeoutSeconds} onChange={(event) => update("aiTimeoutSeconds", event.target.value)} inputMode="numeric" min="5" max="120" disabled={!form.aiEnabled} />
            </label>
            {form.aiService !== "gemini" && <div className="form-field form-field--long form-field--span">
              <span>AI güvenlik anahtarı</span>
              <div className="field-control-group setup-secret-input">
                <input
                  aria-label="AI güvenlik anahtarı"
                  value={genericSecretValue}
                  onChange={(event) => replaceGenericSecret(event.target.value)}
                  onFocus={(event) => {
                    if (genericUsesStoredApiKey) event.currentTarget.select();
                  }}
                  type={showAiApiKey || genericUsesStoredApiKey ? "text" : "password"}
                  placeholder={form.aiStoredApiKeyConfigured ? "Yeni anahtar girmezseniz bu sağlayıcının kayıtlı anahtarı korunur" : "Servis erişim anahtarını girin"}
                  disabled={!form.aiEnabled || form.clearAiApiKey}
                  autoComplete="new-password"
                  spellCheck={false}
                />
                <ActionButton variant="secondary" size="sm" type="button" onClick={() => void toggleAiApiKeyVisibility("generic")} disabled={!form.aiEnabled || form.clearAiApiKey || aiApiKeyRevealState === "loading"} aria-pressed={showAiApiKey}>
                  {aiApiKeyRevealState === "loading" ? "Açılıyor" : showAiApiKey ? "Gizle" : "Göster"}
                </ActionButton>
              </div>
              <small>{form.aiStoredApiKeyConfigured ? "Kayıtlı bağlantı anahtarı maskelenir; Göster ile görüntüleyebilirsiniz." : "Bu sağlayıcı için anahtar henüz kayıtlı değil."}</small>
              {aiApiKeyRevealMessage && <small className="setup-secret-error" role="status">{aiApiKeyRevealMessage}</small>}
            </div>}
            {form.aiStoredApiKeyConfigured && (
              <label className="form-check setup-checkline form-field--span setup-danger-checkline">
                <input
                  checked={form.clearAiApiKey}
                  onChange={(event) => onFormChange({
                    ...form,
                    clearAiApiKey: event.target.checked,
                    aiEnabled: event.target.checked ? false : form.aiEnabled
                  })}
                  type="checkbox"
                />
                Bu sağlayıcının kayıtlı anahtarını sil ve AI yardımcıyı kapat
              </label>
            )}
          </div>
          {form.aiService !== "gemini" && renderAiConnectionActions(false)}
          </div>
        </section>

        {!setupData.setupRequired && form.androidEnabled && (
          <AndroidDevicesSection
            devices={dashboardData?.androidDevices ?? []}
            enabledCapabilities={enabledCapabilities}
            state={androidDeviceState}
            message={androidDeviceMessage}
            publishState={androidPublishState}
            publishMessage={androidPublishMessage}
            onPublish={onPublishAndroid}
            onSetRole={onSetAndroidDeviceRole}
            onSetPermissionGroups={onSetAndroidDevicePermissionGroups}
            onSetActive={onSetAndroidDeviceActive}
            onResetPermissions={onResetAndroidDevicePermissions}
            onRevoke={onRevokeAndroidDevice}
          />
        )}
        <div id="settings-application" className="setup-section appearance-settings">
          <div className="setup-section-title">
            <h2>Uygulama Görünümü</h2>
          </div>
          <p className="setup-section-description">Size rahat gelen görünümü seçin. Değişiklikler anında uygulanır ve bu bilgisayarda saklanır.</p>
          <div className="appearance-mode-options" role="radiogroup" aria-label="Görünüm biçimi">
            <button
              className={`appearance-mode-card${uiPreferences.mode === "easy" ? " is-selected" : ""}`}
              ref={(node) => {
                appearanceModeRefs.current.easy = node;
              }}
              type="button"
              role="radio"
              aria-checked={uiPreferences.mode === "easy"}
              tabIndex={uiPreferences.mode === "easy" ? 0 : -1}
              onClick={() => onUiPreferencesChange({ ...uiPreferences, mode: "easy" })}
              onKeyDown={(event) => handleAppearanceModeKeyDown(event, "easy")}
            >
              <strong>Büyük ve Sade Görünüm <span>(Önerilen)</span></strong>
              <small>Daha büyük yazılar, ferah alanlar ve açık veya karanlık temayla rahat bir görünüm sunar.</small>
            </button>
            <button
              className={`appearance-mode-card${uiPreferences.mode === "pro" ? " is-selected" : ""}`}
              ref={(node) => {
                appearanceModeRefs.current.pro = node;
              }}
              type="button"
              role="radio"
              aria-checked={uiPreferences.mode === "pro"}
              tabIndex={uiPreferences.mode === "pro" ? 0 : -1}
              onClick={() => onUiPreferencesChange({ ...uiPreferences, mode: "pro" })}
              onKeyDown={(event) => handleAppearanceModeKeyDown(event, "pro")}
            >
              <strong>Kompakt ve Gelişmiş Görünüm</strong>
              <small>Daha çok bilgiyi ekrana sığdırır; yoğun ve gelişmiş çalışma için uygundur.</small>
            </button>
          </div>
          <div className="form-grid appearance-controls">
            <label className="form-field form-field--short">
              Arayüz ölçeği
              <select
                value={String(uiPreferences.scale)}
                onChange={(event) => onUiPreferencesChange({ ...uiPreferences, scale: Number(event.target.value) })}
              >
                {UI_SCALE_OPTIONS.map((scale) => (
                  <option value={scale} key={scale}>{Math.round(scale * 100)}%</option>
                ))}
              </select>
              <small>Metinler, menüler ve içerik alanları birlikte ölçeklenir.</small>
            </label>
            <div className="setup-field">
              <span>Tema</span>
              <label className="form-check setup-checkline appearance-theme-toggle">
                <input
                  checked={uiPreferences.theme === "dark"}
                  onChange={(event) => onUiPreferencesChange({ ...uiPreferences, theme: event.target.checked ? "dark" : "light" })}
                  type="checkbox"
                />
                Karanlık tema
              </label>
              <small>Az ışıklı ortamlarda daha rahat bir görünüm sağlar.</small>
            </div>
          </div>
        </div>
        <PasswordSettings
          configured={setupData.appPasswordConfigured}
          onConfiguredChange={onAppPasswordConfiguredChange ?? (() => undefined)}
          saveHandleRef={passwordSaveRef}
        />
        {!setupData.setupRequired && <DataMaintenanceSettings />}


      </section>
    </main>
  );
}

interface AndroidDevicesSectionProps {
  devices: DesktopAndroidDevice[];
  enabledCapabilities: BusinessCapability[];
  state: SyncState;
  message: string;
  publishState: SyncState;
  publishMessage: string;
  onPublish?: () => void;
  onSetRole?: (deviceId: string, role: "admin" | "staff") => void;
  onSetPermissionGroups?: (deviceId: string, groups: AndroidPermissionGroups) => void;
  onSetActive?: (deviceId: string, active: boolean) => void;
  onResetPermissions?: (deviceId: string) => void;
  onRevoke?: (device: DesktopAndroidDevice) => void;
}

function AndroidDevicesSection({
  devices,
  enabledCapabilities,
  state,
  message,
  publishState,
  publishMessage,
  onPublish,
  onSetRole,
  onSetPermissionGroups,
  onSetActive,
  onResetPermissions,
  onRevoke
}: AndroidDevicesSectionProps) {
  const busy = state === "loading";
  const availableGroupIds = new Set(androidAvailablePermissionGroupIds(enabledCapabilities));
  const permissionGroupOptions = ANDROID_PERMISSION_GROUP_OPTIONS
    .filter((group) => availableGroupIds.has(group.id))
    .map((group) => capabilityAwareAndroidGroupCopy(group, enabledCapabilities));
  const availableDevices = devices.filter((device) => !device.revokedAt);
  const removedDevices = devices.filter((device) => Boolean(device.revokedAt));
  const restoreDevice = (device: DesktopAndroidDevice) => {
    if (!onSetActive) return;
    const shortId = compactAndroidDeviceId(device.deviceId);
    const deviceName = device.deviceName || "Android Telefon";
    const roleLabel = device.role === "admin" ? "Yönetici" : "Personel";
    if (!window.confirm(`${deviceName} (${shortId}) ${roleLabel} rolü ve kayıtlı görev alanlarıyla geri yüklensin mi?`)) {
      return;
    }
    onSetActive(device.deviceId, true);
  };
  return (
    <section className="setup-section settings-android-devices-section">
      <div className="setup-section-title android-devices-heading">
        <div>
          <p>Telefon Yetkileri</p>
          <h2>Android Cihazlar</h2>
        </div>
        <div className="android-devices-heading-actions">
          <span>{availableDevices.length} cihaz</span>
          <ActionButton
            variant="secondary"
            className="setup-secondary"
            type="button"
            onClick={onPublish}
            disabled={!onPublish || publishState === "loading"}
          >
            <UploadCloud size={15} aria-hidden="true" />
            {publishState === "loading" ? "Yayınlanıyor" : "Android'e Yayınla"}
          </ActionButton>
        </div>
      </div>
      <p className="setup-section-description">Rol ve görev alanları yalnız bu bilgisayardan değiştirilebilir. Kaldırılan cihazlar ana listeden çıkarılır ve erişimleri kapalı kalır.</p>
      {availableDevices.length === 0 ? (
        <div className="android-devices-empty">
          <Smartphone size={22} aria-hidden="true" />
          <div>
            <strong>{removedDevices.length > 0 ? "Etkin Android cihaz yok." : "Henüz Android cihaz görülmedi."}</strong>
            <span>{removedDevices.length > 0 ? "Gerekirse kaldırılan cihazlardan birini geri yükleyin." : "Telefon web modülüne bağlandığında burada personel olarak görünür."}</span>
          </div>
        </div>
      ) : (
        <div className="android-device-list">
          {availableDevices.map((device) => {
            const shortId = compactAndroidDeviceId(device.deviceId);
            return (
              <article className={`android-device-card${device.isActive ? "" : " is-inactive"}`} key={device.deviceId}>
                <div className="android-device-identity">
                  <span className="android-device-icon"><Smartphone size={18} aria-hidden="true" /></span>
                  <div>
                    <strong>{device.deviceName || "Android Telefon"}</strong>
                    <code title={device.deviceId}>{shortId}</code>
                  </div>
                  <div className="android-device-badges">
                    <span className={`device-role role-${device.role}`}>{device.role === "admin" ? "Yönetici" : "Personel"}</span>
                    <span className={`device-state${device.isActive ? " is-active" : " is-inactive"}`}>{device.isActive ? "Aktif" : "Pasif"}</span>
                  </div>
                </div>
                <dl className="android-device-details">
                  <div><dt>Son bağlantı</dt><dd>{device.lastSeenAt ? formatDateTime(device.lastSeenAt) : "Henüz yok"}</dd></div>
                  <div><dt>Uygulama</dt><dd>{device.appVersion || "Sürüm bilinmiyor"}</dd></div>
                  <div><dt>Görev özeti</dt><dd>{androidDevicePermissionSummary(device, permissionGroupOptions)}</dd></div>
                </dl>
                {device.role === "admin" ? (
                  <div className="android-device-all-permissions">
                    <ShieldCheck size={18} aria-hidden="true" />
                    <div>
                      <strong>Etkin alanlarda yönetici</strong>
                      <span>Yalnız işletmede etkin yeteneklerin izinleri kullanılabilir.</span>
                    </div>
                  </div>
                ) : (
                  <fieldset className="android-device-permission-groups" disabled={busy}>
                    <legend>Görev alanları</legend>
                    <div className="android-device-permission-grid">
                      {permissionGroupOptions.map((group) => {
                        const checked = Boolean(device.permissionGroups?.[group.id]);
                        return (
                          <label className={`android-permission-group${checked ? " is-selected" : ""}`} key={group.id}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => onSetPermissionGroups?.(
                                device.deviceId,
                                androidPermissionGroupsWith(device, group.id, event.target.checked)
                              )}
                              disabled={busy || !onSetPermissionGroups}
                            />
                            <span>
                              <strong>{group.label}</strong>
                              <small>{group.description}</small>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
                <div className="android-device-actions">
                  <ActionButton variant="secondary" size="sm" className="setup-secondary" type="button" onClick={() => onSetRole?.(device.deviceId, "admin")} disabled={busy || device.role === "admin"}>
                    <ShieldCheck size={15} aria-hidden="true" /> Yönetici Yap
                  </ActionButton>
                  <ActionButton variant="secondary" size="sm" className="setup-secondary" type="button" onClick={() => onSetRole?.(device.deviceId, "staff")} disabled={busy || device.role === "staff"}>Personel Yap</ActionButton>
                  <ActionButton variant="secondary" size="sm" className="setup-secondary" type="button" onClick={() => onSetActive?.(device.deviceId, !device.isActive)} disabled={busy}>{device.isActive ? "Pasifleştir" : "Aktif Et"}</ActionButton>
                  <ActionButton variant="secondary" size="sm" className="setup-secondary" type="button" onClick={() => onResetPermissions?.(device.deviceId)} disabled={busy}>Yetkileri Sıfırla</ActionButton>
                  <ActionButton variant="secondary" size="sm" className="setup-secondary android-device-remove" type="button" onClick={() => onRevoke?.(device)} disabled={busy}>Kaldır</ActionButton>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {removedDevices.length > 0 && (
        <details className="android-removed-devices">
          <summary>
            <span>Kaldırılan cihazlar</span>
            <strong>{removedDevices.length}</strong>
          </summary>
          <div className="android-removed-device-list">
            {removedDevices.map((device) => (
              <article className="android-removed-device-row" key={device.deviceId}>
                <div className="android-device-identity">
                  <span className="android-device-icon"><Smartphone size={17} aria-hidden="true" /></span>
                  <div>
                    <strong>{device.deviceName || "Android Telefon"}</strong>
                    <code title={device.deviceId}>{compactAndroidDeviceId(device.deviceId)}</code>
                  </div>
                  <span className={`device-role role-${device.role}`}>{device.role === "admin" ? "Yönetici" : "Personel"}</span>
                </div>
                <span>{device.revokedAt ? `${formatDateTime(device.revokedAt)} tarihinde kaldırıldı` : "Erişimi kapalı"}</span>
                <ActionButton
                  variant="secondary"
                  size="sm"
                  aria-label={`${device.deviceName || "Android Telefon"} (${compactAndroidDeviceId(device.deviceId)}) cihazını geri yükle`}
                  className="setup-secondary"
                  type="button"
                  onClick={() => restoreDevice(device)}
                  disabled={busy || !onSetActive}
                >
                  Geri Yükle
                </ActionButton>
              </article>
            ))}
          </div>
        </details>
      )}
      <p className={`menu-status sync-${state}`} role="status" aria-live="polite">{message}</p>
      <p className={`menu-status sync-${publishState}`} role="status" aria-live="polite">{publishMessage}</p>
    </section>
  );
}

function compactAndroidDeviceId(deviceId: string): string {
  return deviceId.length > 22
    ? `${deviceId.slice(0, 12)}…${deviceId.slice(-6)}`
    : deviceId;
}

function androidPermissionGroupsWith(
  device: DesktopAndroidDevice,
  changedGroupId: AndroidPermissionGroupId,
  enabled: boolean
): AndroidPermissionGroups {
  return Object.fromEntries(ANDROID_PERMISSION_GROUP_OPTIONS.map((group) => [
    group.id,
    group.id === changedGroupId ? enabled : Boolean(device.permissionGroups?.[group.id])
  ])) as AndroidPermissionGroups;
}

function androidDevicePermissionSummary(
  device: DesktopAndroidDevice,
  groupOptions: typeof ANDROID_PERMISSION_GROUP_OPTIONS = ANDROID_PERMISSION_GROUP_OPTIONS
): string {
  if (!device.isActive) {
    return "Yetkisiz / Pasif";
  }
  if (device.role === "admin") {
    return "Etkin yeteneklerde tüm izinler";
  }
  const selected = groupOptions
    .filter((group) => device.permissionGroups?.[group.id])
    .map((group) => group.shortLabel);
  return selected.length > 0 ? selected.join(" + ") : "Görev alanı seçilmedi";
}

function capabilityAwareAndroidGroupCopy(
  group: typeof ANDROID_PERMISSION_GROUP_OPTIONS[number],
  capabilities: Iterable<BusinessCapability>
): typeof ANDROID_PERMISSION_GROUP_OPTIONS[number] {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  if (group.id === "service_orders") {
    const hasService = hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_TABLES)
      || hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_ORDERS);
    if (!hasService) {
      const inventory = hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.INVENTORY);
      return {
        ...group,
        label: inventory ? "Menü / Stok" : "Menü",
        shortLabel: inventory ? "Menü / Stok" : "Menü",
        description: inventory ? "Menü ve stok durumunu görüntüleme" : "Menü kayıtlarını görüntüleme"
      };
    }
  }
  if (group.id === "cashier") {
    const hasDomainCheckout = hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_ORDERS)
      || hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO);
    return hasDomainCheckout
      ? group
      : { ...group, label: "Kasa / Finans", shortLabel: "Kasa", description: "Finans kayıtlarını görüntüleme ve ekleme" };
  }
  if (group.id === "rooms_tasks"
      && !hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS)) {
    return {
      ...group,
      label: "Günlük İşler",
      shortLabel: "İşler",
      description: "Genel günlük işleri görüntüleme ve tamamlama"
    };
  }
  if (group.id === "customer_reservation"
      && !hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS)
      && !hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_RESERVATIONS)) {
    return {
      ...group,
      label: "Müşteri Talepleri",
      shortLabel: "Müşteri",
      description: "Talepleri görüntüleme ve yanıtlama"
    };
  }
  return group;
}

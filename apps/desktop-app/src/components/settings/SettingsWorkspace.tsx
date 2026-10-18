import { usePageViewState, usePageViewScroll } from "../../app/page-view-state";
import { useEffect, useRef, useState } from "react";
import { BUSINESS_CAPABILITIES as C, isBusinessServiceAvailable } from "@yardimci-asistan/shared";
import type { SaveInitialSetupInput } from "../../../electron/database";
import type { DesktopPage } from "../../app/navigation";
import type { RegisterPageLeaveGuard } from "../../app/page-navigation-guard";
import { reportAppStatus } from "../../app/runtime-state";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { StagedSettingsContributionSlot } from "../../app/settings-section-contributions";
import { useSettingsDrafts } from "../../app/use-settings-drafts";
import { useTtsSettings } from "../../app/use-tts-settings";
import { useDesktopDictationSettings } from "../../app/use-desktop-dictation-settings";
import { useSettingsAiTest } from "../../app/use-settings-ai-test";
import { useBusinessLayoutSettings } from "../../app/use-business-layout-settings";
import { useAndroidDevicePermissionSettings } from "../../app/use-android-device-permission-settings";
import {
  isSettingsSectionVisible,
  layoutSettingsDefinition,
  roomSettingsDefinition,
  searchSettings,
} from "../../app/settings-registry";
import type { SettingsOperationResult, SettingsSetupSaveResult } from "../../app/settings-save";
import { ServiceSettingsContext, type ServiceSettingsOwner } from "./ServiceSettingsCard";
import { isSetupServiceId, serviceActivation } from "../../app/settings-service-fields";
import { SettingsUnsavedChangesDialog } from "./SettingsUnsavedChangesDialog";
import { BusinessContactFields, BusinessSettingsSection } from "./BusinessSettingsSection";
import { ServicesSettingsSection, type ServicesSettingsProps } from "./ServicesSettingsSection";
import {
  BusinessPublicProfileSection,
  BusinessSocialLinksSection,
  useBusinessPublicProfileSettings
} from "./BusinessPublicProfileSection";
import {
  GoogleReviewsSettingsSection,
  useGoogleReviewsSettings
} from "./GoogleReviewsSettingsSection";
import { KbsSettingsSection, useKbsSettings } from "./KbsSettingsSection";
import { BusinessLayoutOverlay } from "./BusinessLayoutOverlay";
import { BusinessGalleryOverlay } from "./BusinessGalleryOverlay";
import { PasswordSettings, usePasswordSettings } from "../security/PasswordSettings";
import { SettingsActionPopover } from "./SettingsActionPopover";
import { DataMaintenanceSettings } from "./DataMaintenanceSettings";
import { ActionButton } from "../ui/ActionButton";
import { SpeechSettingsSection } from "./SpeechSettingsSection";
import { DesktopDictationSetup } from "./DesktopDictationSetup";
import { WebSettingsSection } from "./WebSettingsSection";
import { AiSettingsSection } from "./AiSettingsSection";

export type SettingsWorkspaceProps = Omit<
  ServicesSettingsProps,
  "form" | "onFormChange" | "enabledCapabilities"
> & {
  onSave: (input: SaveInitialSetupInput) => Promise<SettingsSetupSaveResult>;
  onDashboardRefresh?: () => Promise<unknown>;
  onAppPasswordConfiguredChange?: (configured: boolean) => void;
  registerPageLeaveGuard?: RegisterPageLeaveGuard;
};

interface PendingTransition {
  destination: DesktopPage;
  continueNavigation: () => void;
}

export function SettingsWorkspace(props: SettingsWorkspaceProps) {
  const { registerPageLeaveGuard } = props;
  const [structureExpanded, setStructureExpanded] = useState(props.setupData.setupRequired);
  const [serviceOpen, setServiceOpen] = useState<string | null>(null);
  const [query, setQuery] = usePageViewState("settings.search", "");
  const [focusTarget, setFocusTarget] = useState("");
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const [guardBusy, setGuardBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { snapshot: runtimeCapabilities } = useBusinessCapabilityRuntime();

  const drafts = useSettingsDrafts(props.setupData, props.onSave);
  const tts = useTtsSettings();
  const dictation = useDesktopDictationSettings(props.setupData);
  const ai = useSettingsAiTest(drafts.form, drafts.setDraft);
  const initialized = !props.setupData.setupRequired;
  const capabilities = runtimeCapabilities?.enabledCapabilities ?? [];

  const roomsEnabled = isSettingsSectionVisible(roomSettingsDefinition, capabilities, initialized, runtimeCapabilities);
  const tablesEnabled = isSettingsSectionVisible(layoutSettingsDefinition, capabilities, initialized, runtimeCapabilities);
  const profile = useBusinessPublicProfileSettings({
    businessAddress: drafts.form.address,
    enabledCapabilities: capabilities,
    enabled: initialized
  });
  const googleReviews = useGoogleReviewsSettings(initialized && isBusinessServiceAvailable("googleReviews", capabilities));
  const kbs = useKbsSettings(initialized && isBusinessServiceAvailable("kbs", capabilities), drafts.canonical.profileId);
  const layout = useBusinessLayoutSettings({
    enabled: initialized,
    capabilities: {
      rooms: roomsEnabled,
      tables: tablesEnabled
    },
    ...(props.onDashboardRefresh === undefined ? {} : { onDashboardRefresh: props.onDashboardRefresh })
  });
  const androidPermissions = useAndroidDevicePermissionSettings({
    devices: props.dashboardData?.androidDevices ?? [],
    enabled: initialized && props.setupData.servicePreferences.android && capabilities.includes(C.ANDROID),
    ...(props.onDashboardRefresh === undefined ? {} : { onDashboardRefresh: props.onDashboardRefresh })
  });
  const [layoutOpen, setLayoutOpen] = useState<"rooms" | "tables" | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [utility, setUtility] = useState<"security" | "data" | null>(null);
  const password = usePasswordSettings({
    configured: props.setupData.appPasswordConfigured,
    onConfiguredChange: props.onAppPasswordConfiguredChange ?? (() => undefined)
  });

  const businessDirty = drafts.dirty.business || profile.dirty;
  const canSaveBusiness = businessDirty || !initialized;
  const businessBusy = drafts.busy || profile.saving;
  const allDirty = businessDirty || drafts.dirty.services || googleReviews.dirty || kbs.dirty || tts.dirty || dictation.dirty || androidPermissions.dirty;
  const wasSetupRequired = useRef(props.setupData.setupRequired);
  const collapsePending = useRef(false);
  useEffect(() => {
    if (wasSetupRequired.current && initialized) collapsePending.current = true;
    wasSetupRequired.current = !initialized;
    if (!initialized) setStructureExpanded(true);
    else if (collapsePending.current && !allDirty && !serviceOpen) {
      setStructureExpanded(false);
      collapsePending.current = false;
    }
  }, [initialized, allDirty, serviceOpen]);
  const expanded = !initialized || structureExpanded;
  const results = searchSettings(query, capabilities, initialized, runtimeCapabilities)
    .filter(result => initialized || result.category === "business" || result.id === "settings-web");

  function serviceOwner(id: string): ServiceSettingsOwner {
    if (id === "settings-google-reviews") return { dirty: googleReviews.dirty, busy: googleReviews.loading || googleReviews.saving || googleReviews.testing,
      savedEnabled: googleReviews.settings.enabled, save: googleReviews.save, discard: googleReviews.discard };
    if (id === "settings-kbs") return { dirty: kbs.dirty, busy: kbs.loading || kbs.saving || kbs.testing,
      savedEnabled: kbs.settings.enabled, save: async () => {
        const result = await kbs.save();
        if (result.ok && result.changed) {
          try { await props.onDashboardRefresh?.(); }
          catch { return { ...result, message: "KBS ayarları kaydedildi. Görünümü yenilemek için Ayarları tekrar açın." }; }
        }
        return result;
      }, discard: kbs.discard };
    if (id === "settings-speech") return { dirty: tts.dirty, savedEnabled: tts.savedPreferences.enabled, save: tts.save, discard: tts.discard };
    if (id === "settings-dictation") return { dirty: dictation.dirty, busy: dictation.busy || dictation.loading,
      savedEnabled: dictation.status?.enabled ?? false, save: dictation.save, discard: dictation.discard };
    if (isSetupServiceId(id)) return {
      savedEnabled: serviceActivation(drafts.canonical, id),
      dirty: drafts.serviceDirty(id) || (id === "settings-android" && androidPermissions.dirty),
      busy: drafts.busy || (id === "settings-android" && androidPermissions.busy) || (id === "settings-ai" && ai.aiConnectionTestState === "loading"),
      save: async () => {
        const result = await drafts.saveService(id);
        if (!result.ok) return result;
        if (id === "settings-android" && drafts.form.androidEnabled && androidPermissions.dirty) return androidPermissions.save();
        if (id === "settings-android" && !drafts.form.androidEnabled) androidPermissions.discard();
        return result;
      },
      discard: () => { drafts.discardService(id); if (id === "settings-android") androidPermissions.discard(); if (id === "settings-ai") ai.invalidate(); }
    };
    return { dirty: false, save: () => ({ ok: false, message: "Servis kayıt sahibi bulunamadı." }), discard: () => undefined };
  }

  async function saveBusiness(): Promise<SettingsOperationResult> {
      const profileChanged = initialized && drafts.form.profileId !== drafts.canonical.profileId;
      let changed = false;
      if (drafts.dirty.business || !initialized) {
        const setupResult = await drafts.saveBusiness();
        if (!setupResult.ok) return setupResult;
        changed ||= setupResult.changed;
      }
      if (profile.dirty) {
        const profileResult = await profile.save();
        if (!profileResult.ok) return profileResult;
        changed ||= profileResult.changed;
      }
      if (profileChanged && changed) {
        try {
          if (!window.yardimciDesktop?.restartAfterProfileChange) {
            throw new Error("Yeniden başlatma köprüsü kullanılamıyor.");
          }
          await window.yardimciDesktop.restartAfterProfileChange();
          return { ok: true, changed, message: "Yeni sektör kaydedildi. Uygulama yeniden başlatılıyor." };
        } catch {
          // The profile is already committed. Never claim that persistence failed.
          return { ok: true, changed, message: "Yeni sektör kaydedildi. Değişikliklerin tam uygulanması için uygulamayı yeniden başlatın." };
        }
      }
      return { ok: true, changed };
  }

  function discardBusiness() { drafts.discardBusiness(); profile.discard(); }
  function reportResult(result: SettingsOperationResult) {
    reportAppStatus(result.ok ? "success" : "error", result.message || (result.ok ? "İşletme ayarları kaydedildi." : "Ayarlar kaydedilemedi."));
  }
  async function saveBusinessSettings() { if (canSaveBusiness) reportResult(await saveBusiness()); }
  function discardBusinessSettings() { if (!businessBusy) discardBusiness(); }
  async function saveAndContinue() {
    if (!pendingTransition || guardBusy || businessBusy) return;
    setGuardBusy(true);
    try {
      const result = await saveBusiness();
      reportResult(result);
      if (result.ok) { const next = pendingTransition; setPendingTransition(null); next.continueNavigation(); }
    } finally { setGuardBusy(false); }
  }
  function discardAndContinue() {
    if (!pendingTransition || guardBusy || businessBusy) return;
    discardBusiness(); const next = pendingTransition; setPendingTransition(null); next.continueNavigation();
  }

  useEffect(() => {
    if (!registerPageLeaveGuard) return;

    return registerPageLeaveGuard((destination, continueNavigation) => {
      if (layoutOpen || layout.dirty || serviceOpen) return false;
      if (!businessDirty) return true;
      if (pendingTransition || guardBusy) return false;
      setPendingTransition({
        destination,
        continueNavigation
      });
      return false;
    });
  }, [businessDirty, guardBusy, pendingTransition, registerPageLeaveGuard, layoutOpen, layout.dirty, serviceOpen]);

  useEffect(() => {
    if (!focusTarget) return;
    if (focusTarget === "settings-rooms-button" || focusTarget === "settings-tables-button") {
      setLayoutOpen(focusTarget === "settings-rooms-button" ? "rooms" : "tables");
    }
    const target = root.current?.querySelector<HTMLElement>(`#${focusTarget}`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start", behavior: "instant" });
    setFocusTarget("");
  }, [focusTarget, expanded]);

  const pageScroll = usePageViewScroll("settings.scroll");
  return (
    <ServiceSettingsContext.Provider value={{ active: serviceOpen, open: setServiceOpen, owner: serviceOwner }}>
    <div ref={root} className="settings-workspace setup-capabilities">
      <div className="settings-search">
        <div className="form-field">
          <input
            aria-label="Ayarlarda ara"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ayarlarda ara"
          />
        </div>
        <div className="settings-utility-actions">
          <SettingsActionPopover id="settings-security-button" label="Güvenlik" open={utility === "security"} onOpenChange={open => setUtility(open ? "security" : null)}>
            <PasswordSettings controller={password} />
          </SettingsActionPopover>
          <SettingsActionPopover id="settings-data-button" label="Veriler" open={utility === "data"} onOpenChange={open => setUtility(open ? "data" : null)}>
            <DataMaintenanceSettings initialized={initialized} />
          </SettingsActionPopover>
        </div>
        {query.trim() && (
          <div className="settings-search-results" aria-label="Ayar arama sonuçları">
            {results.length ? results.map((result) => (
              <button
                className="action-button action-button-ghost"
                key={result.id}
                type="button"
                onClick={() => {
                  if (result.placement === "global") {
                    setQuery("");
                    if (result.id === "settings-security-button") setUtility("security");
                    if (result.id === "settings-data-button") setUtility("data");
                    if (result.id === "settings-web") setFocusTarget(result.id);
                    return;
                  }
                  setQuery("");
                  const id = result.serviceTarget ?? result.id;
                  if (result.category === "services") {
                    setStructureExpanded(true); setServiceOpen(id);
                  } else {
                    if (id === "settings-business" || id === "settings-options") setStructureExpanded(true);
                    setFocusTarget(id);
                  }
                }}
              >
                {result.title}
              </button>
            )) : <p role="status">Ayar bulunamadı.</p>}
          </div>
        )}
      </div>

      <WebSettingsSection canonical={initialized ? drafts.canonical : drafts.form} onSave={drafts.saveWebConnection}
        disabled={drafts.busy || guardBusy} initialized={initialized}
        onSetupChange={web => drafts.setDraft(form => ({ ...form, ...web }))} />

      <section className="settings-page-workspace" id="settings-panel-business" aria-label="İşletme ayarları">
        <div ref={pageScroll} className="settings-page-body">
          <section className="settings-panel settings-structure">
            <div className="settings-panel-header"><ActionButton variant="ghost" aria-expanded={expanded} aria-controls="settings-structure-content"
              onClick={() => { if (initialized && !(expanded && allDirty)) setStructureExpanded(!expanded); }}>
              İşletme Yapısı ve Özellikler {expanded ? '▴' : '▾'}
            </ActionButton></div>
            <div id="settings-structure-content" hidden={!expanded}>
              <fieldset className="settings-resource-fields" disabled={drafts.busy || guardBusy}>
                <BusinessSettingsSection form={drafts.form} onFormChange={drafts.setDraft} persistedProfileId={drafts.canonical.profileId} />
              </fieldset>
              <StagedSettingsContributionSlot
                category="business"
                form={drafts.form}
                onFormChange={drafts.setDraft}
                busy={drafts.busy || guardBusy}
                configurationCapabilities={capabilities}
                initialized={initialized}
                runtimeSnapshot={runtimeCapabilities}
              />
              {initialized && <section className="settings-services-list" aria-label="Servisler"><h3>Servisler</h3>
              <div className="settings-services-grid">
              {isBusinessServiceAvailable("googleReviews", capabilities) && (
                    <GoogleReviewsSettingsSection
                      controller={googleReviews}
                      disabled={drafts.busy || guardBusy}
                    />
                  )}
              {isBusinessServiceAvailable("ai", capabilities) &&
                <AiSettingsSection form={drafts.form} onFormChange={drafts.setDraft} {...ai}
                  disabled={businessBusy || guardBusy} onTestAiConnection={() => void ai.testAiConnection()} />}
              <SpeechSettingsSection controller={tts} disabled={businessBusy || guardBusy} />
              <DesktopDictationSetup controller={dictation} form={drafts.form} canonical={drafts.canonical}
                aiCapability={capabilities.includes(C.AI)} disabled={businessBusy || guardBusy} />
                <ServicesSettingsSection
                  {...props}
                  disabled={businessBusy || guardBusy}
                  onRevokeAndroidDevice={device => {
                    if (serviceOwner("settings-android").dirty) { reportAppStatus("error", "Önce Android değişikliklerini kaydedin veya İptal seçin."); return; }
                    setServiceOpen(null);
                    setTimeout(() => props.onRevokeAndroidDevice?.(device), 0);
                  }}
                  form={drafts.form}
                  onFormChange={drafts.setDraft}
                  enabledCapabilities={capabilities}
                  androidPermissionGroups={androidPermissions.draft}
                  onAndroidPermissionGroupsChange={androidPermissions.update}
                />
              {isBusinessServiceAvailable("kbs", capabilities) && (
                <KbsSettingsSection controller={kbs} disabled={businessBusy || guardBusy} />
              )}
              <StagedSettingsContributionSlot
                category="services"
                form={drafts.form}
                onFormChange={drafts.setDraft}
                busy={businessBusy || guardBusy}
                configurationCapabilities={capabilities}
                initialized={initialized}
                runtimeSnapshot={runtimeCapabilities}
              />
              </div>
              </section>}
            </div>
          </section>
              <section id="settings-public-profile" tabIndex={-1} className="settings-panel">
                <div className="settings-panel-header"><h2>İşletme Bilgileri</h2></div>
                <div className="settings-panel-body">
                  <div className="settings-company-toolbar">
                    <fieldset className="settings-resource-fields" disabled={drafts.busy || guardBusy}>
                      <BusinessContactFields form={drafts.form} onFormChange={drafts.setDraft} />
                    </fieldset>
                    <div className="settings-company-management-actions">
                      {roomsEnabled && <ActionButton id="settings-rooms-button" variant="secondary" onClick={() => setLayoutOpen("rooms")}>Oda Yönetimi</ActionButton>}
                      {tablesEnabled && <ActionButton id="settings-tables-button" variant="secondary" onClick={() => setLayoutOpen("tables")}>Masa Yönetimi</ActionButton>}
                      {initialized && <ActionButton id="settings-gallery-button" variant="secondary" onClick={() => setGalleryOpen(true)}>Galeri Yönetimi</ActionButton>}
                    </div>
                  </div>
                  {initialized && <>
                  <BusinessPublicProfileSection
                    controller={profile}
                    disabled={drafts.busy || guardBusy}
                  />
                  <BusinessSocialLinksSection
                    controller={profile}
                    disabled={drafts.busy || guardBusy}
                  />
                  </>}
                </div>
              </section>



        </div>

        {(
          <footer className="settings-page-actions">
            <div>
              {businessDirty && <span>Kaydedilmemiş işletme değişiklikleri</span>}
            </div>
            <ActionButton
              type="button"
              disabled={businessBusy || guardBusy || !canSaveBusiness}
              onClick={() => { void saveBusinessSettings(); }}
            >
              {businessBusy ? "Kaydediliyor…" : "Kaydet"}
            </ActionButton>
            <ActionButton
              variant="secondary"
              type="button"
              disabled={businessBusy || guardBusy || !businessDirty}
              onClick={() => { void discardBusinessSettings(); }}
            >
              Değişiklikleri Geri Al
            </ActionButton>
          </footer>
        )}
      </section>

      {layoutOpen && <BusinessLayoutOverlay kind={layoutOpen} controller={layout} onClose={() => setLayoutOpen(null)} />}
      {galleryOpen && <BusinessGalleryOverlay onClose={() => setGalleryOpen(false)} />}
      <SettingsUnsavedChangesDialog
        open={Boolean(pendingTransition)}
        busy={guardBusy || businessBusy}
        categoryTitle="İşletme"
        onSaveAndContinue={() => { void saveAndContinue(); }}
        onDiscardAndContinue={() => { void discardAndContinue(); }}
        onStay={() => {
          if (!guardBusy) setPendingTransition(null);
        }}
      />
    </div>
    </ServiceSettingsContext.Provider>
  );
}

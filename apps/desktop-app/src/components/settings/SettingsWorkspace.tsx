import { usePageViewState, usePageViewScroll } from "../../app/page-view-state";
import { useEffect, useRef, useState } from "react";
import { isBusinessServiceAvailable } from "@yardimci-asistan/shared";
import type { SaveInitialSetupInput } from "../../../electron/database";
import type { DesktopPage } from "../../app/navigation";
import type { RegisterPageLeaveGuard } from "../../app/page-navigation-guard";
import { reportAppStatus } from "../../app/runtime-state";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { StagedSettingsContributionSlot } from "../../app/settings-section-contributions";
import { useSettingsDrafts } from "../../app/use-settings-drafts";
import { useSettingsAiTest } from "../../app/use-settings-ai-test";
import { useBusinessLayoutSettings } from "../../app/use-business-layout-settings";
import { useAndroidDevicePermissionSettings } from "../../app/use-android-device-permission-settings";
import {
  isSettingsSectionVisible,
  layoutSettingsDefinition,
  roomSettingsDefinition,
  searchSettings,
  settingsCategories,
  visibleSettingsCategories,
  settingsSections,
  type SettingsCategoryId
} from "../../app/settings-registry";
import type { SettingsOperationResult, SettingsSetupSaveResult } from "../../app/settings-save";
import type { UiPreferences } from "../../ui-preferences";
import { SettingsCategoryTabs } from "./SettingsCategoryTabs";
import { SettingsUnsavedChangesDialog } from "./SettingsUnsavedChangesDialog";
import { BusinessSettingsSection } from "./BusinessSettingsSection";
import { ServicesSettingsSection, type ServicesSettingsProps } from "./ServicesSettingsSection";
import { AppearanceSettingsSection, useAppearanceSettings } from "./AppearanceSettingsSection";
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
import { RoomManagementSection } from "./RoomManagementSection";
import { LayoutSettingsSection } from "./LayoutSettingsSection";
import { PasswordSettings, usePasswordSettings } from "../security/PasswordSettings";
import { UpdateSettings, useUpdateSettings } from "./UpdateSettings";
import { DataMaintenanceSettings } from "./DataMaintenanceSettings";
import { ActionButton } from "../ui/ActionButton";

export type SettingsWorkspaceProps = Omit<
  ServicesSettingsProps,
  "form" | "onFormChange" | "enabledCapabilities" | "onTestAiConnection" | "aiConnectionTestState" | "aiConnectionTestMessage"
> & {
  onSave: (input: SaveInitialSetupInput) => Promise<SettingsSetupSaveResult>;
  onDashboardRefresh?: () => Promise<unknown>;
  onAppPasswordConfiguredChange?: (configured: boolean) => void;
  uiPreferences: UiPreferences;
  onUiPreferencesChange: (preferences: UiPreferences) => void;
  registerPageLeaveGuard?: RegisterPageLeaveGuard;
};

interface PendingCategoryTransition {
  kind: "category";
  category: SettingsCategoryId;
  focusTarget: string;
  clearQuery: boolean;
  focusTabAfterGuard: boolean;
}

interface PendingPageTransition {
  kind: "page";
  destination: DesktopPage;
  continueNavigation: () => void;
}

type PendingTransition = PendingCategoryTransition | PendingPageTransition;

export function SettingsWorkspace(props: SettingsWorkspaceProps) {
  const { registerPageLeaveGuard } = props;
  const [storedActive, setActive] = usePageViewState<SettingsCategoryId>("settings.category", "business");
  const [query, setQuery] = usePageViewState("settings.search", "");
  const [focusTarget, setFocusTarget] = useState("");
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const [guardBusy, setGuardBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { snapshot: runtimeCapabilities } = useBusinessCapabilityRuntime();

  const drafts = useSettingsDrafts(props.setupData, props.onSave);
  const ai = useSettingsAiTest(drafts.form, drafts.setDraft);
  const initialized = !props.setupData.setupRequired;
  const capabilities = runtimeCapabilities?.enabledCapabilities ?? [];
  const visibleCategories = visibleSettingsCategories(initialized, runtimeCapabilities);
  const roomsEnabled = isSettingsSectionVisible(roomSettingsDefinition, capabilities, initialized, runtimeCapabilities);
  const tablesEnabled = isSettingsSectionVisible(layoutSettingsDefinition, capabilities, initialized, runtimeCapabilities);
  const category = visibleCategories.find((item) => item.id === storedActive)
    ?? settingsCategories[0] ?? { id: "business" as SettingsCategoryId, title: "İşletme", description: "" };
  const active = category.id;
  useEffect(() => {
    if (storedActive !== active) setActive(active);
  }, [active, setActive, storedActive]);
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
    onDashboardRefresh: props.onDashboardRefresh
  });
  const appearance = useAppearanceSettings(props.uiPreferences, props.onUiPreferencesChange);
  const androidPermissions = useAndroidDevicePermissionSettings({
    devices: props.dashboardData?.androidDevices ?? [],
    enabled: initialized && props.setupData.servicePreferences.android,
    onDashboardRefresh: props.onDashboardRefresh
  });
  const updates = useUpdateSettings(initialized);
  const password = usePasswordSettings({
    configured: props.setupData.appPasswordConfigured,
    onConfiguredChange: props.onAppPasswordConfiguredChange ?? (() => undefined)
  });

  const setupCategory = active === "business" || active === "services" ? active : null;
  const hasSetupSection = setupCategory
    ? settingsSections.some((section) =>
        section.category === active
        && section.persistence === "staged"
        && isSettingsSectionVisible(section, capabilities, initialized, runtimeCapabilities)
      )
    : false;
  const hasCategorySaveSection = active === "operations"
    ? layout.draft.capabilities.rooms || layout.draft.capabilities.tables
    : active === "application"
      ? initialized
      : hasSetupSection;

  const dirty: Record<SettingsCategoryId, boolean> = {
    business: drafts.dirty.business || profile.dirty || googleReviews.dirty,
    operations: layout.dirty,
    services: drafts.dirty.services || androidPermissions.dirty || kbs.dirty,
    application: appearance.dirty || updates.dirty
  };
  const categoryDirty = dirty[active];

  const categoryBusy = active === "operations"
    ? layout.loading || layout.saving
    : active === "application"
      ? updates.busy
      : drafts.busy
      || (active === "services" && (androidPermissions.busy || kbs.loading || kbs.saving || kbs.testing))
      || (active === "business" && (profile.saving || googleReviews.saving || googleReviews.testing));

  const categorySaving = active === "operations"
    ? layout.saving
    : active === "application"
      ? updates.action === "save"
      : setupCategory
        ? drafts.feedback[setupCategory]?.state === "loading"
          || (active === "services" && (androidPermissions.busy || kbs.saving))
          || (active === "business" && (profile.saving || googleReviews.saving))
        : false;

  const results = searchSettings(query, capabilities, initialized, runtimeCapabilities)
    .filter((result) => initialized || result.category === "business");

  async function saveCategory(categoryId: SettingsCategoryId): Promise<SettingsOperationResult> {
    if (categoryId === "business") {
      let changed = false;
      if (drafts.dirty.business) {
        const setupResult = await drafts.save("business");
        if (!setupResult.ok) return setupResult;
        changed ||= setupResult.changed;
      }
      if (profile.dirty) {
        const profileResult = await profile.save();
        if (!profileResult.ok) return profileResult;
        changed ||= profileResult.changed;
      }
      if (googleReviews.dirty) {
        const googleReviewsResult = await googleReviews.save();
        if (!googleReviewsResult.ok) return googleReviewsResult;
        changed ||= googleReviewsResult.changed;
      }
      return { ok: true, changed };
    }

    if (categoryId === "operations") {
      return layout.save();
    }

    if (categoryId === "services") {
      let changed = false;
      if (drafts.dirty.services) {
        const setupResult = await drafts.save("services");
        if (!setupResult.ok) return setupResult;
        changed ||= setupResult.changed;
      }
      if (!drafts.form.androidEnabled) {
        androidPermissions.discard();
      } else if (androidPermissions.dirty) {
        const permissionResult = await androidPermissions.save();
        if (!permissionResult.ok) return permissionResult;
        changed ||= permissionResult.changed;
      }
      if (kbs.dirty) {
        const kbsResult = await kbs.save();
        if (!kbsResult.ok) return kbsResult;
        changed ||= kbsResult.changed;
        if (kbsResult.changed) await props.onDashboardRefresh?.();
      }
      return { ok: true, changed };
    }

    let changed = false;
    if (updates.dirty) {
      const updateResult = await updates.savePreferences();
      if (!updateResult.ok) return updateResult;
      changed ||= updateResult.changed;
    }
    if (appearance.dirty) {
      const appearanceResult = appearance.save();
      if (!appearanceResult.ok) return appearanceResult;
      changed ||= appearanceResult.changed;
    }
    return { ok: true, changed };
  }

  async function discardCategory(categoryId: SettingsCategoryId): Promise<boolean> {
    if (categoryId === "business") {
      drafts.discard("business");
      profile.discard();
      googleReviews.discard();
      return true;
    }
    if (categoryId === "operations") {
      return await layout.discard();
    }
    if (categoryId === "services") {
      drafts.discard("services");
      androidPermissions.discard();
      kbs.discard();
      ai.invalidate();
      return true;
    }
    appearance.discard();
    updates.discard();
    return true;
  }

  function commitTransition(transition: PendingCategoryTransition, afterGuard = false) {
    if (active === "services" && transition.category !== "services") {
      ai.invalidate();
    }
    setActive(transition.category);
    if (transition.clearQuery) setQuery("");
    if (transition.focusTarget) {
      setFocusTarget(transition.focusTarget);
    } else if (afterGuard && transition.focusTabAfterGuard) {
      setFocusTarget(`settings-tab-${transition.category}`);
    }
  }

  function requestCategoryTransition(transition: Omit<PendingCategoryTransition, "kind">): boolean {
    if (!initialized && transition.category !== "business") return false;
    const categoryTransition: PendingCategoryTransition = { kind: "category", ...transition };
    if (transition.category === active) {
      if (transition.clearQuery) setQuery("");
      if (transition.focusTarget) setFocusTarget(transition.focusTarget);
      return true;
    }
    if (!dirty[active]) {
      commitTransition(categoryTransition);
      return true;
    }
    setPendingTransition(categoryTransition);
    return false;
  }

  function requestTabChange(categoryId: SettingsCategoryId) {
    return requestCategoryTransition({
      category: categoryId,
      focusTarget: "",
      clearQuery: false,
      focusTabAfterGuard: true
    });
  }

  function reportSettingsSaveResult(categoryId: SettingsCategoryId, result: SettingsOperationResult) {
    const title = settingsCategories.find((item) => item.id === categoryId)?.title ?? "Ayarlar";
    if (!result.ok) {
      reportAppStatus("error", result.message);
      return;
    }
    if (result.changed) {
      reportAppStatus("success", result.message || `${title} kaydedildi.`);
    }
  }

  async function saveCurrentCategory() {
    if (!categoryDirty) return;
    const categoryId = active;
    const result = await saveCategory(categoryId);
    reportSettingsSaveResult(categoryId, result);
  }

  async function discardCurrentCategory() {
    if (categoryBusy) return;
    const categoryId = active;
    const discarded = await discardCategory(categoryId);
    if (discarded) {
      const title = settingsCategories.find((item) => item.id === categoryId)?.title ?? "Ayarlar";
      reportAppStatus("success", `${title} değişiklikleri geri alındı.`);
    }
  }

  async function saveAndContinue() {
    if (!pendingTransition || guardBusy || categoryBusy) return;
    setGuardBusy(true);
    try {
      const categoryId = active;
      const result = await saveCategory(categoryId);
      reportSettingsSaveResult(categoryId, result);
      if (!result.ok) return;
      const transition = pendingTransition;
      setPendingTransition(null);
      if (transition.kind === "category") {
        commitTransition(transition, true);
      } else {
        if (active === "services") ai.invalidate();
        transition.continueNavigation();
      }
    } finally {
      setGuardBusy(false);
    }
  }

  async function discardAndContinue() {
    if (!pendingTransition || guardBusy || categoryBusy) return;
    setGuardBusy(true);
    try {
      const categoryId = active;
      const discarded = await discardCategory(categoryId);
      if (!discarded) return;
      const title = settingsCategories.find((item) => item.id === categoryId)?.title ?? "Ayarlar";
      reportAppStatus("success", `${title} değişiklikleri geri alındı.`);
      const transition = pendingTransition;
      setPendingTransition(null);
      if (transition.kind === "category") {
        commitTransition(transition, true);
      } else {
        if (active === "services") ai.invalidate();
        transition.continueNavigation();
      }
    } finally {
      setGuardBusy(false);
    }
  }

  useEffect(() => {
    if (!registerPageLeaveGuard) return;

    return registerPageLeaveGuard((destination, continueNavigation) => {
      if (!categoryDirty) return true;
      if (pendingTransition || guardBusy) return false;
      setPendingTransition({
        kind: "page",
        destination,
        continueNavigation
      });
      return false;
    });
  }, [categoryDirty, guardBusy, pendingTransition, registerPageLeaveGuard]);

  useEffect(() => {
    if (!focusTarget) return;
    const target = root.current?.querySelector<HTMLElement>(`#${focusTarget}`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start", behavior: "instant" });
    setFocusTarget("");
  }, [active, focusTarget]);

  const pageScroll = usePageViewScroll(`settings.scroll.${active}`, active);
  return (
    <div ref={root} className="settings-workspace setup-capabilities">
      <div className="settings-search">
        <label className="form-field">
          Ayarlarda ara
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Kategori, bölüm veya ayar adı"
          />
        </label>
        {query.trim() && (
          <div className="settings-search-results" aria-label="Ayar arama sonuçları">
            {results.length ? results.map((result) => (
              <button
                className="action-button action-button-ghost"
                key={result.id}
                type="button"
                onClick={() => {
                  requestCategoryTransition({
                    category: result.category,
                    focusTarget: result.id,
                    clearQuery: true,
                    focusTabAfterGuard: false
                  });
                }}
              >
                {settingsCategories.find((item) => item.id === result.category)?.title ?? "Ayarlar"} · {result.title}
              </button>
            )) : <p role="status">Ayar bulunamadı.</p>}
          </div>
        )}
      </div>

      <SettingsCategoryTabs active={active} dirty={dirty} categories={visibleCategories} onChange={requestTabChange} />

      <section
        className="settings-category-workspace"
        id={`settings-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${active}`}
        tabIndex={0}
      >
        <div ref={pageScroll} className="settings-category-body" role="region" aria-label={`${category.title} ayar içeriği`}>
          {active === "business" && (
            <>
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
              {initialized && (
                <>
                  <BusinessPublicProfileSection
                    controller={profile}
                    disabled={drafts.busy || guardBusy}
                  />
                  <BusinessSocialLinksSection
                    controller={profile}
                    disabled={drafts.busy || guardBusy}
                  />
                  {isBusinessServiceAvailable("googleReviews", capabilities) && (
                    <GoogleReviewsSettingsSection
                      controller={googleReviews}
                      disabled={drafts.busy || guardBusy}
                    />
                  )}
                </>
              )}
            </>
          )}

          {active === "operations" && (
            <>
              {tablesEnabled && <LayoutSettingsSection controller={layout} />}
              {roomsEnabled && <RoomManagementSection controller={layout} />}
            </>
          )}

          {active === "services" && (
            <>
              <fieldset className="settings-resource-fields" disabled={drafts.busy || guardBusy}>
                <ServicesSettingsSection
                  {...props}
                  {...ai}
                  onTestAiConnection={() => void ai.testAiConnection()}
                  form={drafts.form}
                  onFormChange={drafts.setDraft}
                  enabledCapabilities={capabilities}
                  androidPermissionGroups={androidPermissions.draft}
                  onAndroidPermissionGroupsChange={androidPermissions.update}
                />
              </fieldset>
              {isBusinessServiceAvailable("kbs", capabilities) && (
                <KbsSettingsSection controller={kbs} disabled={drafts.busy || guardBusy} />
              )}
              <StagedSettingsContributionSlot
                category="services"
                form={drafts.form}
                onFormChange={drafts.setDraft}
                busy={drafts.busy || guardBusy}
                configurationCapabilities={capabilities}
                initialized={initialized}
                runtimeSnapshot={runtimeCapabilities}
              />
            </>
          )}

          {active === "application" && (
            <div id="settings-application" className="settings-application-workspace">
              <AppearanceSettingsSection controller={appearance} />
              {initialized && <UpdateSettings controller={updates} />}
              <PasswordSettings controller={password} />
              {initialized && (
                <div id="settings-maintenance" tabIndex={-1}>
                  <DataMaintenanceSettings />
                </div>
              )}
            </div>
          )}
        </div>

        {hasCategorySaveSection && (
          <footer className="settings-category-actions">
            <div>
              {categoryDirty && <span>Kaydedilmemiş kategori değişiklikleri</span>}
            </div>
            <ActionButton
              type="button"
              disabled={categoryBusy || guardBusy || !categoryDirty}
              onClick={() => { void saveCurrentCategory(); }}
            >
              {categorySaving ? "Kaydediliyor…" : "Kaydet"}
            </ActionButton>
            <ActionButton
              variant="secondary"
              type="button"
              disabled={categoryBusy || guardBusy || !categoryDirty}
              onClick={() => { void discardCurrentCategory(); }}
            >
              Değişiklikleri Geri Al
            </ActionButton>
          </footer>
        )}
      </section>

      <SettingsUnsavedChangesDialog
        open={Boolean(pendingTransition)}
        busy={guardBusy || categoryBusy}
        categoryTitle={category.title}
        onSaveAndContinue={() => { void saveAndContinue(); }}
        onDiscardAndContinue={() => { void discardAndContinue(); }}
        onStay={() => {
          if (!guardBusy) setPendingTransition(null);
        }}
      />
    </div>
  );
}

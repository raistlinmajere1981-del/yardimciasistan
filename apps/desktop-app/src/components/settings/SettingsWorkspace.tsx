import { useEffect, useRef, useState } from "react";
import type { SaveInitialSetupInput } from "../../../electron/database";
import type { DesktopPage } from "../../app/navigation";
import type { RegisterPageLeaveGuard } from "../../app/page-navigation-guard";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { StagedSettingsContributionSlot } from "../../app/settings-section-contributions";
import { useSettingsDrafts } from "../../app/use-settings-drafts";
import { useSettingsAiTest } from "../../app/use-settings-ai-test";
import { useBusinessLayoutSettings } from "../../app/use-business-layout-settings";
import {
  isSettingsSectionVisible,
  searchSettings,
  settingsCapabilities,
  settingsCategories,
  settingsSections,
  type SettingsCategoryId
} from "../../app/settings-registry";
import type { SettingsOperationResult, SettingsSetupSaveResult } from "../../app/settings-save";
import type { UiPreferences } from "../../ui-preferences";
import { SettingsCategoryTabs } from "./SettingsCategoryTabs";
import { SettingsUnsavedChangesDialog } from "./SettingsUnsavedChangesDialog";
import { BusinessSettingsSection } from "./BusinessSettingsSection";
import { ServicesSettingsSection, type ServicesSettingsProps } from "./ServicesSettingsSection";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";
import {
  BusinessPublicProfileSection,
  BusinessSocialLinksSection,
  useBusinessPublicProfileSettings
} from "./BusinessPublicProfileSection";
import {
  GoogleReviewsSettingsSection,
  useGoogleReviewsSettings
} from "./GoogleReviewsSettingsSection";
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
  const [active, setActive] = useState<SettingsCategoryId>("business");
  const [query, setQuery] = useState("");
  const [focusTarget, setFocusTarget] = useState("");
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const [guardBusy, setGuardBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { snapshot: runtimeCapabilities } = useBusinessCapabilityRuntime();

  const drafts = useSettingsDrafts(props.setupData, props.onSave);
  const ai = useSettingsAiTest(drafts.form, drafts.setDraft);
  const capabilities = settingsCapabilities(drafts.canonical);
  const initialized = !props.setupData.setupRequired;
  const visibleCategories = initialized
    ? settingsCategories
    : settingsCategories.filter((item) => item.id === "business");
  const profile = useBusinessPublicProfileSettings({
    businessAddress: drafts.canonical.address,
    enabledCapabilities: capabilities,
    enabled: initialized
  });
  const googleReviews = useGoogleReviewsSettings(initialized);
  const layout = useBusinessLayoutSettings({
    enabled: initialized,
    onDashboardRefresh: props.onDashboardRefresh
  });
  const updates = useUpdateSettings(initialized);
  const password = usePasswordSettings({
    configured: props.setupData.appPasswordConfigured,
    onConfiguredChange: props.onAppPasswordConfiguredChange ?? (() => undefined)
  });

  const category = settingsCategories.find((item) => item.id === active)!;
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
    services: drafts.dirty.services,
    application: updates.dirty
  };
  const categoryDirty = dirty[active];

  const categoryBusy = active === "operations"
    ? layout.loading || layout.saving
    : active === "application"
      ? updates.busy
      : drafts.busy || (active === "business" && (profile.saving || googleReviews.saving || googleReviews.testing));

  const categorySaving = active === "operations"
    ? layout.saving
    : active === "application"
      ? updates.action === "save"
      : setupCategory
        ? drafts.feedback[setupCategory]?.state === "loading" || (active === "business" && (profile.saving || googleReviews.saving))
        : false;

  const feedback = active === "operations"
    ? (layout.message ? { state: layout.state, message: layout.message } : undefined)
    : setupCategory
      ? drafts.feedback[setupCategory]
      : undefined;

  const results = searchSettings(query, capabilities, initialized, runtimeCapabilities)
    .filter((result) => initialized || result.category === "business");

  async function saveCategory(categoryId: SettingsCategoryId): Promise<SettingsOperationResult> {
    if (categoryId === "business") {
      let changed = false;
      if (drafts.dirty.business) {
        const setupResult = await drafts.save("business");
        if (!setupResult.ok) return setupResult;
        changed ||= setupResult.changed;
        if (setupResult.changed) await layout.refresh();
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
      return drafts.save("services");
    }

    return updates.savePreferences();
  }

  function discardCategory(categoryId: SettingsCategoryId) {
    if (categoryId === "business") {
      drafts.discard("business");
      profile.discard();
      googleReviews.discard();
      return;
    }
    if (categoryId === "operations") {
      layout.discard();
      return;
    }
    if (categoryId === "services") {
      drafts.discard("services");
      ai.invalidate();
      return;
    }
    updates.discard();
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

  async function saveCurrentCategory() {
    if (!categoryDirty) return;
    await saveCategory(active);
  }

  function discardCurrentCategory() {
    if (categoryBusy) return;
    discardCategory(active);
  }

  async function saveAndContinue() {
    if (!pendingTransition || guardBusy || categoryBusy) return;
    setGuardBusy(true);
    try {
      const result = await saveCategory(active);
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

  function discardAndContinue() {
    if (!pendingTransition || guardBusy || categoryBusy) return;
    discardCategory(active);
    const transition = pendingTransition;
    setPendingTransition(null);
    if (transition.kind === "category") {
      commitTransition(transition, true);
    } else {
      if (active === "services") ai.invalidate();
      transition.continueNavigation();
    }
  }

  useEffect(() => {
    if (!props.registerPageLeaveGuard) return;

    return props.registerPageLeaveGuard((destination, continueNavigation) => {
      if (!dirty[active]) return true;
      if (pendingTransition || guardBusy) return false;
      setPendingTransition({
        kind: "page",
        destination,
        continueNavigation
      });
      return false;
    });
  }, [active, guardBusy, pendingTransition, props.registerPageLeaveGuard, dirty.business, dirty.operations, dirty.services, dirty.application]);

  useEffect(() => {
    if (!focusTarget) return;
    const target = root.current?.querySelector<HTMLElement>(`#${focusTarget}`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start", behavior: "instant" });
    setFocusTarget("");
  }, [active, focusTarget]);

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
                {settingsCategories.find((item) => item.id === result.category)!.title} · {result.title}
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
        <div className="settings-category-body" role="region" aria-label={`${category.title} ayar içeriği`}>
          {active === "business" && (
            <>
              <fieldset className="settings-resource-fields" disabled={drafts.busy || guardBusy}>
                <BusinessSettingsSection form={drafts.form} onFormChange={drafts.setDraft} />
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
                  {capabilities.includes("accommodation.rooms") && (
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
              {initialized && <LayoutSettingsSection controller={layout} />}
              {initialized && <RoomManagementSection controller={layout} />}
              {!hasCategorySaveSection && !layout.loading && <p>Bu sektör için oda veya masa düzeni bulunmuyor.</p>}
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
                />
              </fieldset>
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
              <AppearanceSettingsSection
                uiPreferences={props.uiPreferences}
                onUiPreferencesChange={props.onUiPreferencesChange}
              />
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
              {feedback?.message && (
                <p role={feedback.state === "error" ? "alert" : "status"}>{feedback.message}</p>
              )}
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
              onClick={discardCurrentCategory}
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
        onDiscardAndContinue={discardAndContinue}
        onStay={() => {
          if (!guardBusy) setPendingTransition(null);
        }}
      />
    </div>
  );
}

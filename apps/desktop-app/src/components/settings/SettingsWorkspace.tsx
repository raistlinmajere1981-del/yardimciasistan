import { useEffect, useRef, useState } from "react";
import type { SaveInitialSetupInput } from "../../../electron/database";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { StagedSettingsContributionSlot } from "../../app/settings-section-contributions";
import { useSettingsDrafts } from "../../app/use-settings-drafts";
import { useSettingsAiTest } from "../../app/use-settings-ai-test";
import { isSettingsSectionVisible, searchSettings, settingsCapabilities, settingsCategories, settingsSections, type SettingsCategoryId } from "../../app/settings-registry";
import type { SettingsSetupSaveResult } from "../../app/settings-save";
import type { UiPreferences } from "../../ui-preferences";
import { SettingsCategoryTabs } from "./SettingsCategoryTabs";
import { BusinessSettingsSection } from "./BusinessSettingsSection";
import { ServicesSettingsSection, type ServicesSettingsProps } from "./ServicesSettingsSection";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";
import { BusinessPublicProfileSection, useBusinessPublicProfileSettings } from "./BusinessPublicProfileSection";
import { RoomManagementSection, useRoomManagementSettings } from "./RoomManagementSection";
import { PasswordSettings, usePasswordSettings } from "../security/PasswordSettings";
import { UpdateSettings, useUpdateSettings } from "./UpdateSettings";
import { DataMaintenanceSettings } from "./DataMaintenanceSettings";
import { ActionButton } from "../ui/ActionButton";

export type SettingsWorkspaceProps = Omit<ServicesSettingsProps, "form" | "onFormChange" | "enabledCapabilities" | "onTestAiConnection" | "aiConnectionTestState" | "aiConnectionTestMessage"> & {
  onSave: (input: SaveInitialSetupInput) => Promise<SettingsSetupSaveResult>;
  onDashboardRefresh?: () => Promise<unknown>;
  onAppPasswordConfiguredChange?: (configured: boolean) => void;
  uiPreferences: UiPreferences;
  onUiPreferencesChange: (preferences: UiPreferences) => void;
};

export function SettingsWorkspace(props: SettingsWorkspaceProps) {
  const [active, setActive] = useState<SettingsCategoryId>("business");
  const [query, setQuery] = useState("");
  const [focusTarget, setFocusTarget] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const { snapshot: runtimeCapabilities } = useBusinessCapabilityRuntime();
  const drafts = useSettingsDrafts(props.setupData, props.onSave);
  const ai = useSettingsAiTest(drafts.form, drafts.setDraft);
  const capabilities = settingsCapabilities(drafts.canonical);
  const initialized = !props.setupData.setupRequired;
  const profile = useBusinessPublicProfileSettings({ businessAddress: drafts.canonical.address, enabledCapabilities: capabilities, enabled: initialized });
  const rooms = useRoomManagementSettings({ dashboardRoomCount: props.dashboardData?.rooms.length ?? 0, onDashboardRefresh: props.onDashboardRefresh });
  const updates = useUpdateSettings(initialized);
  const password = usePasswordSettings({ configured: props.setupData.appPasswordConfigured, onConfiguredChange: props.onAppPasswordConfiguredChange ?? (() => undefined) });
  const category = settingsCategories.find(item => item.id === active)!;
  const staged = active === "application" ? null : active;
  const hasStagedSection = settingsSections.some(section => section.category === active && section.persistence === "staged" && isSettingsSectionVisible(section, capabilities, initialized, runtimeCapabilities));
  const feedback = staged ? drafts.feedback[staged] : undefined;
  const results = searchSettings(query, capabilities, initialized, runtimeCapabilities);
  const dirty = { business: drafts.dirty.business || profile.dirty, operations: drafts.dirty.operations || rooms.dirty, services: drafts.dirty.services, application: updates.dirty };

  useEffect(() => {
    if (!focusTarget) return;
    const target = root.current?.querySelector<HTMLElement>(`#${focusTarget}`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start", behavior: "instant" });
    setFocusTarget("");
  }, [active, focusTarget]);

  return <div ref={root} className="settings-workspace setup-capabilities">
    <div className="settings-search">
      <label className="form-field">Ayarlarda ara
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Kategori, bölüm veya ayar adı" />
      </label>
      {query.trim() && <div className="settings-search-results" aria-label="Ayar arama sonuçları">
        {results.length ? results.map(result => <button className="action-button action-button-ghost" key={result.id} type="button" onClick={() => {
          setActive(result.category); setFocusTarget(result.id); setQuery("");
        }}>{settingsCategories.find(item => item.id === result.category)!.title} · {result.title}</button>) : <p role="status">Ayar bulunamadı.</p>}
      </div>}
    </div>
    <SettingsCategoryTabs active={active} dirty={dirty} onChange={setActive} />
    <section className="settings-category-workspace" id={`settings-panel-${active}`} role="tabpanel" aria-labelledby={`settings-tab-${active}`} tabIndex={0}>
      <header className="settings-category-header"><h2>{category.title}</h2><p>{category.description}</p></header>
      <div className="settings-category-body" role="region" aria-label={`${category.title} ayar içeriği`}>
        {active === "business" && <>
          <fieldset className="settings-resource-fields" disabled={drafts.busy}><BusinessSettingsSection form={drafts.form} onFormChange={drafts.setDraft} /></fieldset>
          <StagedSettingsContributionSlot category="business" form={drafts.form} onFormChange={drafts.setDraft} busy={drafts.busy} configurationCapabilities={capabilities} initialized={initialized} runtimeSnapshot={runtimeCapabilities} />
          {initialized && <BusinessPublicProfileSection controller={profile} />}
        </>}
        {active === "operations" && <>
          <StagedSettingsContributionSlot category="operations" form={drafts.form} onFormChange={drafts.setDraft} busy={drafts.busy} configurationCapabilities={capabilities} initialized={initialized} runtimeSnapshot={runtimeCapabilities} />
          {initialized && <RoomManagementSection controller={rooms} />}
          {!hasStagedSection && <p>Bu sektör için oda veya masa düzeni bulunmuyor.</p>}
        </>}
        {active === "services" && <fieldset className="settings-resource-fields" disabled={drafts.busy}>
          <ServicesSettingsSection {...props} {...ai} onTestAiConnection={() => void ai.testAiConnection()} form={drafts.form} onFormChange={drafts.setDraft} enabledCapabilities={capabilities} />
        </fieldset>
          <StagedSettingsContributionSlot category="services" form={drafts.form} onFormChange={drafts.setDraft} busy={drafts.busy} configurationCapabilities={capabilities} initialized={initialized} runtimeSnapshot={runtimeCapabilities} />}
        {active === "application" && <div id="settings-application" className="settings-application-workspace">
          <AppearanceSettingsSection uiPreferences={props.uiPreferences} onUiPreferencesChange={props.onUiPreferencesChange} />
          {initialized && <UpdateSettings controller={updates} />}
          <PasswordSettings controller={password} />
          {initialized && <div id="settings-maintenance" tabIndex={-1}><DataMaintenanceSettings /></div>}
        </div>}
      </div>
      {staged && hasStagedSection && <footer className="settings-category-actions">
        <div>{drafts.dirty[staged] && <span>Kaydedilmemiş kategori değişiklikleri</span>}
          {feedback?.message && <p role={feedback.state === "error" ? "alert" : "status"}>{feedback.message}</p>}
        </div>
        <ActionButton type="button" disabled={drafts.busy || !drafts.dirty[staged]} onClick={() => void drafts.save(staged)}>{feedback?.state === "loading" ? "Kaydediliyor…" : "Kaydet"}</ActionButton>
        <ActionButton variant="secondary" type="button" disabled={drafts.busy || !drafts.dirty[staged]} onClick={() => drafts.discard(staged)}>Değişiklikleri Geri Al</ActionButton>
      </footer>}
    </section>
  </div>;
}

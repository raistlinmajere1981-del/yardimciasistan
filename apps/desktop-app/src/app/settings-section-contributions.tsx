import { SmsSettingsSection, InstagramSettingsSection } from "../components/settings/MarketingChannelsSettingsSection";
import { WhatsAppBusinessSettingsSection } from "../components/settings/WhatsAppBusinessSettingsSection";
import { ArasShippingSettingsSection } from "../components/settings/ArasShippingSettingsSection";
import type { ReactNode, SetStateAction } from "react";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import { settingsFieldOwners } from "./settings-draft-model";
import {
  isSettingsSectionVisible,
  onlineSalesDeliveryDefinition,
  dealerPortalDefinition,
  arasShippingDefinition,
  whatsappCloudDefinition, smsProviderDefinition, instagramProviderDefinition,
  type SettingsSectionDefinition,
  type StagedSettingsCategoryId
} from "./settings-registry";
import type { SetupFormState } from "./setup-model";

type CategoryField<C extends StagedSettingsCategoryId> = (typeof settingsFieldOwners)[C][number];
export type CategoryDraft<C extends StagedSettingsCategoryId> = Pick<SetupFormState, CategoryField<C>>;

interface StagedSectionProps<C extends StagedSettingsCategoryId> {
  readonly draft: Readonly<CategoryDraft<C>>;
  readonly busy: boolean;
  readonly configurationCapabilities: readonly BusinessCapability[];
  readonly onChange: (patch: Partial<CategoryDraft<C>>) => void;
}

export interface SettingsSectionContribution<C extends StagedSettingsCategoryId> {
  readonly definition: SettingsSectionDefinition & {
    readonly category: C;
    readonly persistence: "staged";
  };
  readonly render: (props: StagedSectionProps<C>) => ReactNode;
}

type StagedSettingsContributions = {
  readonly [C in StagedSettingsCategoryId]: readonly SettingsSectionContribution<C>[];
};

const stagedSettingsContributions = {
  business: [],
  services: [{
    definition: smsProviderDefinition,
    render: ({ draft, onChange, busy }) => <SmsSettingsSection draft={draft.sms} busy={busy} onChange={sms=>onChange({sms})}/>
  }, {
    definition: instagramProviderDefinition,
    render: ({ draft, onChange, busy }) => <InstagramSettingsSection draft={draft.instagram} busy={busy} onChange={instagram=>onChange({instagram})}/>
  }, {
    definition: whatsappCloudDefinition,
    render: ({ draft, onChange, busy }) => <WhatsAppBusinessSettingsSection draft={draft.whatsappCloud} busy={busy} onChange={(whatsappCloud) => onChange({ whatsappCloud })} />
  }, {
    definition: dealerPortalDefinition,
    render: ({ draft, onChange, busy }) => (
      <section id="settings-dealer-portal" tabIndex={-1} className="settings-service-card">
        <div className="settings-service-card-head"><div><h3>Bayi Web Erişimi</h3><p>Aktif bayilere tek kullanımlık davet ile web erişimi verin.</p></div></div>
        <label className="settings-service-toggle"><input type="checkbox" disabled={busy} checked={draft.dealerPortalEnabled}
          onChange={(event) => onChange({ dealerPortalEnabled: event.target.checked })} /><span>Bayi portalını etkinleştir</span></label>
      </section>
    )
  }, {
    definition: arasShippingDefinition,
    render: ({ draft, onChange, busy }) => <ArasShippingSettingsSection draft={draft.arasShipping}
      busy={busy} onChange={(arasShipping) => onChange({ arasShipping })} />
  }, {
    definition: onlineSalesDeliveryDefinition,
    render: ({ draft, onChange, busy, configurationCapabilities }) => (
      <section id="settings-online-delivery" tabIndex={-1} className="settings-service-card is-enabled">
        <div className="settings-service-card-header"><div><strong>{configurationCapabilities.includes("channel.online_sales") ? "Online Satış Teslimatı" : "Bayi Sipariş Teslimatı"}</strong><span>En az bir teslimat yöntemi açık olmalı.</span></div></div>
        <div className="settings-service-card-body">
        <label className="settings-service-toggle"><input type="checkbox" disabled={busy} checked={draft.onlineSalesDelivery.pickupEnabled}
          onChange={(event) => onChange({ onlineSalesDelivery: { ...draft.onlineSalesDelivery, pickupEnabled: event.target.checked } })} /><span>İşletmeden teslim</span></label>
        <label className="settings-service-toggle"><input type="checkbox" disabled={busy} checked={draft.onlineSalesDelivery.shippingEnabled}
          onChange={(event) => onChange({ onlineSalesDelivery: { ...draft.onlineSalesDelivery, shippingEnabled: event.target.checked } })} /><span>Kargo ile gönderim</span></label>
        </div>
      </section>
    )
  }]
} satisfies StagedSettingsContributions;

interface StagedSettingsContributionSlotProps<C extends StagedSettingsCategoryId> {
  category: C;
  form: SetupFormState;
  onFormChange: (next: SetStateAction<SetupFormState>) => void;
  busy: boolean;
  configurationCapabilities: readonly BusinessCapability[];
  initialized: boolean;
  runtimeSnapshot?: BusinessCapabilitySnapshot | null;
  contributions?: readonly SettingsSectionContribution<C>[];
}

export function StagedSettingsContributionSlot<C extends StagedSettingsCategoryId>({
  category,
  form,
  onFormChange,
  busy,
  configurationCapabilities,
  initialized,
  runtimeSnapshot,
  contributions
}: StagedSettingsContributionSlotProps<C>) {
  const activeContributions = contributions
    ?? (stagedSettingsContributions[category] as readonly SettingsSectionContribution<C>[]);
  const draft = pickCategoryDraft(form, category);

  return <>
    {activeContributions
      .filter((contribution) => isSettingsSectionVisible(
        contribution.definition,
        configurationCapabilities,
        initialized,
        runtimeSnapshot
      ))
      .map((contribution) => (
        <fieldset className="settings-resource-fields" disabled={busy} key={contribution.definition.id}>
          {contribution.render({
            draft,
            busy,
            configurationCapabilities,
            onChange: (patch) => onFormChange((current) => applyCategoryPatch(current, category, patch))
          })}
        </fieldset>
      ))}
  </>;
}

function pickCategoryDraft<C extends StagedSettingsCategoryId>(
  form: SetupFormState,
  category: C
): CategoryDraft<C> {
  return Object.fromEntries(
    settingsFieldOwners[category].map((key) => [key, form[key]])
  ) as CategoryDraft<C>;
}

function applyCategoryPatch<C extends StagedSettingsCategoryId>(
  form: SetupFormState,
  category: C,
  patch: Partial<CategoryDraft<C>>
): SetupFormState {
  const safePatch: Partial<SetupFormState> = {};
  for (const key of settingsFieldOwners[category]) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    Object.assign(safePatch, { [key]: patch[key as CategoryField<C>] });
  }
  return { ...form, ...safePatch };
}

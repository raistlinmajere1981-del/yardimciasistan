import { CommerceCheckoutSettingsSection } from "../components/settings/CommerceCheckoutSettingsSection";
import { SmsSettingsSection, InstagramSettingsSection } from "../components/settings/MarketingChannelsSettingsSection";
import { WhatsAppBusinessSettingsSection } from "../components/settings/WhatsAppBusinessSettingsSection";
import { ArasShippingSettingsSection } from "../components/settings/ArasShippingSettingsSection";
import { ServiceSettingsCard } from "../components/settings/ServiceSettingsCard";
import { COMMERCE_SHIPPING_PROVIDERS, isArasShippingConfigurationReady } from "@yardimci-asistan/shared";
import { type ReactNode, type SetStateAction } from "react";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import { settingsFieldOwners } from "./settings-draft-model";
import {
  isSettingsSectionVisible,
  onlineSalesDeliveryDefinition,
  dealerPortalDefinition,
  whatsappCloudDefinition, smsProviderDefinition, instagramProviderDefinition,
  type SettingsSectionDefinition,
  type StagedSettingsCategoryId
} from "./settings-registry";
import type { SetupFormState } from "./setup-model";
import { useWebAvailability } from "./web-availability";

type CategoryField<C extends StagedSettingsCategoryId> = (typeof settingsFieldOwners)[C][number];
export type CategoryDraft<C extends StagedSettingsCategoryId> = Pick<SetupFormState, CategoryField<C>>;

interface StagedSectionProps<C extends StagedSettingsCategoryId> {
  readonly draft: Readonly<CategoryDraft<C>>;
  readonly busy: boolean;
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

// Static provider-specific field adapters under one delivery owner; no runtime discovery.
const shippingProviderSettings = {
  aras: {
    render: ({ draft, onChange, busy }: StagedSectionProps<"services">) => <ArasShippingSettingsSection
      draft={draft.arasShipping} busy={busy} onChange={arasShipping => onChange({ arasShipping })} />
  }
} satisfies Record<keyof typeof COMMERCE_SHIPPING_PROVIDERS, {
  render: (props: StagedSectionProps<"services">) => ReactNode;
}>;

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
      <ServiceSettingsCard id="settings-dealer-portal" readiness="Test kullanılamıyor" title="Bayi Web Erişimi" enabled={draft.dealerPortalEnabled}
        disabled={busy} onEnabledChange={dealerPortalEnabled => onChange({ dealerPortalEnabled })}>
        <label className="settings-service-toggle"><input type="checkbox" checked={draft.dealerApplicationEnabled} disabled={busy}
          onChange={event => onChange({ dealerApplicationEnabled: event.target.checked })} /><span>Online Bayi Başvurusu</span></label>
      </ServiceSettingsCard>
    )
  }, {
    definition: onlineSalesDeliveryDefinition,
    render: (props) => {
      const { draft, onChange, busy } = props;
      return (
      <ServiceSettingsCard id="settings-online-delivery" readiness="Test kullanılamıyor" title="Teslimat ve Gönderim"
        enabled={draft.onlineSalesDeliveryEnabled} disabled={busy} onEnabledChange={onlineSalesDeliveryEnabled => onChange({ onlineSalesDeliveryEnabled })}>
        <CommerceCheckoutSettingsSection value={draft.commerceCheckout} onChange={commerceCheckout=>onChange({commerceCheckout})} disabled={busy}/>
        <small>En az bir teslimat yöntemi açık olmalı. Kapalıyken web siparişi alınmaz.</small>
        <label className="settings-service-toggle"><input type="checkbox" disabled={busy} checked={draft.onlineSalesDelivery.pickupEnabled}
          onChange={(event) => onChange({ onlineSalesDelivery: { ...draft.onlineSalesDelivery, pickupEnabled: event.target.checked } })} /><span>İşletmeden teslim</span></label>
        <label className="settings-service-toggle"><input type="checkbox" disabled={busy} checked={draft.onlineSalesDelivery.shippingEnabled}
          onChange={(event) => onChange({ onlineSalesDelivery: { ...draft.onlineSalesDelivery, shippingEnabled: event.target.checked } })} /><span>Kargo ile gönderim</span></label>
        {draft.onlineSalesDelivery.shippingEnabled && <section aria-label="Kargo firmaları / sağlayıcılar" className="form-stack">
          <h3>Kargo firmaları / sağlayıcılar</h3>
          {Object.values(COMMERCE_SHIPPING_PROVIDERS).map(provider =>
            <div key={provider.id}>{shippingProviderSettings[provider.id].render(props)}</div>)}
          {!isArasShippingConfigurationReady(draft.arasShipping) &&
            <p role="alert">Kargo ile gönderim için bir kargo sağlayıcısının hesap ayarlarını tamamlayın ve bağlantıyı test edin.</p>}
        </section>}
      </ServiceSettingsCard>
    ); }
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
  /** Persisted invalid shipping must stay editable until the repair is saved. */
  allowOfflineDeliveryRepair?: boolean;
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
  allowOfflineDeliveryRepair = false,
  contributions
}: StagedSettingsContributionSlotProps<C>) {
  const activeContributions = contributions
    ?? (stagedSettingsContributions[category] as readonly SettingsSectionContribution<C>[]);
  const webAvailable = useWebAvailability();
  const draft = pickCategoryDraft(form, category);

  return <>
    {activeContributions
      .filter((contribution) => {
        // A restored backup can contain shipping enabled without a saved web
        // connection. Keep only that already-active delivery editor reachable
        // so it can be turned off; do not expose other web-only services.
        const needsShippingRepair = contribution.definition.id === "settings-online-delivery"
          && allowOfflineDeliveryRepair;
        return isSettingsSectionVisible(
          contribution.definition,
          configurationCapabilities,
          initialized,
          runtimeSnapshot,
          webAvailable || needsShippingRepair
        );
      })
      .map((contribution) => (
        <fieldset className="settings-resource-fields" disabled={busy} key={contribution.definition.id}>
          {contribution.render({
            draft,
            busy,
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

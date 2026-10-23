import { SmsSettingsSection, InstagramSettingsSection } from "../components/settings/MarketingChannelsSettingsSection";
import { WhatsAppBusinessSettingsSection } from "../components/settings/WhatsAppBusinessSettingsSection";
import { ArasShippingSettingsSection } from "../components/settings/ArasShippingSettingsSection";
import { ServiceSettingsCard } from "../components/settings/ServiceSettingsCard";
import { COMMERCE_SHIPPING_PROVIDERS, isArasShippingConfigurationReady } from "@yardimci-asistan/shared";
import { useState, type ReactNode, type SetStateAction } from "react";
import { ActionButton } from "../components/ui/ActionButton";
import { reportAppStatus } from "./runtime-state";
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
        <DealerApplicationLinkButton disabled={busy || !draft.dealerApplicationEnabled} />
      </ServiceSettingsCard>
    )
  }, {
    definition: onlineSalesDeliveryDefinition,
    render: (props) => {
      const { draft, onChange, busy } = props;
      return (
      <ServiceSettingsCard id="settings-online-delivery" readiness="Test kullanılamıyor" title="Teslimat ve Gönderim"
        enabled={draft.onlineSalesDeliveryEnabled} disabled={busy} onEnabledChange={onlineSalesDeliveryEnabled => onChange({ onlineSalesDeliveryEnabled })}>
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

function DealerApplicationLinkButton({ disabled }: { disabled: boolean }) {
  const [copying, setCopying] = useState(false);
  async function copy() {
    setCopying(true);
    try {
      const saved = await window.yardimciDesktop?.getSetupData();
      if (!saved?.dealerPortalEnabled || !saved.dealerApplicationEnabled) {
        reportAppStatus("error", "Önce Bayi Web Erişimi ve Online Bayi Başvurusu ayarlarını kaydedin.");
        return;
      }
      const module = new URL(saved.webModuleUrl);
      if (module.protocol !== "https:" || module.username || module.password || module.search || module.hash) {
        reportAppStatus("error", "Web bağlantısı ayarlarına geçerli HTTPS modül adresini kaydedin.");
        return;
      }
      const moduleUrl = `${module.href.replace(/\/+$/, "")}/`;
      const link = `${new URL("../bayi/", moduleUrl).href}#${new URLSearchParams({ application: "dealer", module: moduleUrl })}`;
      await navigator.clipboard.writeText(link);
      reportAppStatus("success", "Bayi başvuru bağlantısı kopyalandı. Bayi uygulamasında açılabilir.");
    } catch {
      reportAppStatus("error", "Başvuru bağlantısı kopyalanamadı. Web bağlantısı ayarlarını kontrol edin.");
    } finally { setCopying(false); }
  }
  return <ActionButton variant="secondary" disabled={disabled || copying} onClick={() => void copy()}>
    Başvuru bağlantısını kopyala
  </ActionButton>;
}

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

import type { ReactNode, SetStateAction } from "react";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import { settingsFieldOwners } from "./settings-draft-model";
import {
  isSettingsSectionVisible,
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
  services: []
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

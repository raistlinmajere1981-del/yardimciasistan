import { useRef } from "react";
import type { ComponentProps } from "react";
import { BUSINESS_CAPABILITIES, getBusinessProfileSelectionCapabilities } from "@yardimci-asistan/shared";
import type { SetupFormState } from "../../app/setup-model";
import { BusinessPublicProfileSection } from "./BusinessPublicProfileSection";
import { SetupForm } from "./SetupForm";
import type { SettingsSaveSectionHandle } from "../../app/settings-save";

type SetupFormProps = ComponentProps<typeof SetupForm>;
type SettingsWorkspaceProps = Omit<SetupFormProps, "form" | "onFormChange" | "enabledCapabilities" | "publicProfile" | "publicProfileSaveRef"> & {
  form: SetupFormState;
  onFormChange: (form: SetupFormState) => void;
};

export function SettingsWorkspace(props: SettingsWorkspaceProps) {
  const publicProfileSaveRef = useRef<SettingsSaveSectionHandle | null>(null);
  const baseCapabilities = getBusinessProfileSelectionCapabilities(
    props.form.profileId,
    props.form.profileOptions
  );
  const effectiveCapabilities = [
    ...baseCapabilities,
    ...(props.form.whatsappEnabled ? [BUSINESS_CAPABILITIES.WHATSAPP] : []),
    ...(props.form.androidEnabled ? [BUSINESS_CAPABILITIES.ANDROID] : []),
    ...(props.form.aiEnabled ? [BUSINESS_CAPABILITIES.AI] : []),
  ];

  return (
    <div className="setup-capabilities">
      <SetupForm
        {...props}
        enabledCapabilities={effectiveCapabilities}
        publicProfileSaveRef={publicProfileSaveRef}
        publicProfile={!props.setupData.setupRequired ? (
          <BusinessPublicProfileSection businessAddress={props.form.address} saveHandleRef={publicProfileSaveRef} />
        ) : null}
      />
    </div>
  );
}

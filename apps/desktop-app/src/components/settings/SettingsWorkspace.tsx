import { useRef } from "react";
import type { ComponentProps } from "react";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import type { SetupFormState } from "../../app/setup-model";
import {
  BusinessCapabilityEditor,
  getEffectiveSetupCapabilities
} from "./BusinessCapabilitySettings";
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
  const capabilityRuntime = useBusinessCapabilityRuntime();
  const effectiveCapabilities = getEffectiveSetupCapabilities(
    props.form.profileId,
    capabilityRuntime.snapshot
  );
  // Existing device controls mutate the persisted business immediately. Keep
  // their visibility anchored to the persisted snapshot until a pending profile
  // selection is actually saved. First setup has no persisted business yet, so
  // the selected profile defaults remain the correct preview there.
  const deviceRuntimeCapabilities = capabilityRuntime.snapshot?.businessId
    ? capabilityRuntime.snapshot.enabledCapabilities
    : effectiveCapabilities;
  return (
    <div className="setup-capabilities">
      <SetupForm
        {...props}
        enabledCapabilities={deviceRuntimeCapabilities}
        publicProfileSaveRef={publicProfileSaveRef}
        publicProfile={capabilityRuntime.snapshot?.businessId ? (
          <BusinessPublicProfileSection businessAddress={props.form.address} saveHandleRef={publicProfileSaveRef} />
        ) : null}
      />



      {capabilityRuntime.snapshot?.businessId && (
        <BusinessCapabilityEditor
          profileId={props.form.profileId}
          snapshot={capabilityRuntime.snapshot}
          state={capabilityRuntime.state}
          message={capabilityRuntime.message}
          onSetCapability={(capability, enabled) => {
            void capabilityRuntime.setCapability(capability, enabled);
          }}
          onClearOverride={(capability) => {
            void capabilityRuntime.clearOverride(capability);
          }}
        />
      )}
    </div>
  );
}

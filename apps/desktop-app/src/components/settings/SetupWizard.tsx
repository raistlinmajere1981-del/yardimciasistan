import type { ComponentProps } from "react";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import type { SetupFormState } from "../../app/setup-model";
import {
  BusinessCapabilityEditor,
  getEffectiveSetupCapabilities
} from "./BusinessCapabilitySettings";
import { BusinessPublicProfileSection } from "./BusinessPublicProfileSection";
import { SetupForm } from "./SetupForm";
import "./setup-capabilities.css";

type SetupFormProps = ComponentProps<typeof SetupForm>;
type SetupWizardProps = Omit<SetupFormProps, "form" | "onFormChange" | "enabledCapabilities"> & {
  form: SetupFormState;
  onFormChange: (form: SetupFormState) => void;
};

export function SetupWizard(props: SetupWizardProps) {
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
      />

      {props.embedded && capabilityRuntime.snapshot?.businessId && (
        <div className="setup-public-profile-shell">
          <BusinessPublicProfileSection businessAddress={props.form.address} />
        </div>
      )}

      {props.embedded && capabilityRuntime.snapshot?.businessId && (
        <div className="setup-capability-editor-shell">
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
        </div>
      )}
    </div>
  );
}

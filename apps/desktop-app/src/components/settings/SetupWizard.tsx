import type { ComponentProps } from "react";
import { BUSINESS_CAPABILITIES, hasBusinessCapability } from "@yardimci-asistan/shared";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import type { CapabilitySetupFormState, SetupFormState } from "../../app/setup-model";
import {
  BusinessCapabilityEditor,
  getEffectiveSetupCapabilities
} from "./BusinessCapabilitySettings";
import { SetupWizard as LegacySetupWizard } from "./LegacySetupWizard";
import "./setup-capability-v2.css";

type LegacySetupWizardProps = ComponentProps<typeof LegacySetupWizard>;
type SetupWizardProps = Omit<LegacySetupWizardProps, "form" | "onFormChange"> & {
  form: CapabilitySetupFormState;
  onFormChange: (form: CapabilitySetupFormState) => void;
};

/**
 * Capability-first setup boundary.
 *
 * The controller-owned form no longer contains room/table/QR booleans. The
 * historical wizard still needs that shape while its connection/device panels
 * are being split, so those three values are projected here from capabilities
 * and stripped again before any form mutation reaches application state.
 */
export function SetupWizard(props: SetupWizardProps) {
  const capabilityRuntime = useBusinessCapabilityRuntime();
  const effectiveCapabilities = getEffectiveSetupCapabilities(
    props.form.businessType,
    capabilityRuntime.snapshot
  );
  const C = BUSINESS_CAPABILITIES;
  const capabilityForm: SetupFormState = {
    ...props.form,
    roomsEnabled: hasBusinessCapability(effectiveCapabilities, C.ACCOMMODATION_ROOMS),
    tablesEnabled: hasBusinessCapability(effectiveCapabilities, C.FOOD_TABLES),
    qrMenuEnabled: hasBusinessCapability(effectiveCapabilities, C.QR_MENU)
  };

  const handleLegacyFormChange: LegacySetupWizardProps["onFormChange"] = (nextForm) => {
    const {
      roomsEnabled: _roomsEnabled,
      tablesEnabled: _tablesEnabled,
      qrMenuEnabled: _qrMenuEnabled,
      ...nextCapabilityForm
    } = nextForm;
    props.onFormChange(nextCapabilityForm);
  };

  return (
    <div className="setup-capability-v2">
      <LegacySetupWizard
        {...props}
        form={capabilityForm}
        onFormChange={handleLegacyFormChange}
      />

      {props.embedded && capabilityRuntime.snapshot?.businessId && (
        <details className="setup-capability-editor-shell">
          <summary>Gelişmiş işletme yetenekleri</summary>
          <BusinessCapabilityEditor
            businessType={props.form.businessType}
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
        </details>
      )}
    </div>
  );
}

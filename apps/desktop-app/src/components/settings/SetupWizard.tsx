import type { ComponentProps } from "react";
import { BUSINESS_CAPABILITIES, hasBusinessCapability } from "@yardimci-asistan/shared";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import {
  BusinessCapabilityEditor,
  getEffectiveSetupCapabilities
} from "./BusinessCapabilitySettings";
import { SetupWizard as LegacySetupWizard } from "./LegacySetupWizard";
import "./setup-capability-v2.css";

type SetupWizardProps = ComponentProps<typeof LegacySetupWizard>;

/**
 * Capability-first setup boundary.
 *
 * The historical wizard still owns the large collection of connection/device
 * forms while it is being split into smaller settings panels. Domain toggles
 * are no longer allowed to become a second runtime authority: the legacy form
 * receives a read-only compatibility projection derived from the persisted
 * capability snapshot (or, during first setup, from the selected profile).
 */
export function SetupWizard(props: SetupWizardProps) {
  const capabilityRuntime = useBusinessCapabilityRuntime();
  const effectiveCapabilities = getEffectiveSetupCapabilities(
    props.form.businessType,
    capabilityRuntime.snapshot
  );
  const C = BUSINESS_CAPABILITIES;
  const capabilityForm = {
    ...props.form,
    roomsEnabled: hasBusinessCapability(effectiveCapabilities, C.ACCOMMODATION_ROOMS),
    tablesEnabled: hasBusinessCapability(effectiveCapabilities, C.FOOD_TABLES),
    qrMenuEnabled: hasBusinessCapability(effectiveCapabilities, C.QR_MENU)
  };

  const handleLegacyFormChange: SetupWizardProps["onFormChange"] = (nextForm) => {
    props.onFormChange({
      ...nextForm,
      roomsEnabled: capabilityForm.roomsEnabled,
      tablesEnabled: capabilityForm.tablesEnabled,
      qrMenuEnabled: capabilityForm.qrMenuEnabled
    });
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

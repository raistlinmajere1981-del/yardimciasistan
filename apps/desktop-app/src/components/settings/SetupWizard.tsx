import { useEffect, useRef, type ComponentProps } from "react";
import {
  BUSINESS_CAPABILITIES,
  getAvailableBusinessProfiles,
  getBusinessProfile,
  hasBusinessCapability
} from "@yardimci-asistan/shared";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import type { CapabilitySetupFormState, SetupFormState } from "../../app/setup-model";
import {
  BusinessCapabilityEditor,
  getEffectiveSetupCapabilities
} from "./BusinessCapabilitySettings";
import { SetupWizard as LegacySetupWizard } from "./LegacySetupWizard";
import "./setup-capability-v2.css";

type LegacySetupWizardProps = ComponentProps<typeof LegacySetupWizard>;
type SetupWizardProps = Omit<LegacySetupWizardProps, "form" | "onFormChange" | "enabledCapabilities"> & {
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
  const setupRootRef = useRef<HTMLDivElement>(null);
  const effectiveCapabilities = getEffectiveSetupCapabilities(
    props.form.businessType,
    capabilityRuntime.snapshot
  );
  // Existing device controls mutate the persisted business immediately. Keep
  // their visibility anchored to the persisted snapshot until a pending profile
  // selection is actually saved. First setup has no persisted business yet, so
  // the selected profile defaults remain the correct preview there.
  const deviceRuntimeCapabilities = capabilityRuntime.snapshot?.businessId
    ? capabilityRuntime.snapshot.enabledCapabilities
    : effectiveCapabilities;
  const C = BUSINESS_CAPABILITIES;
  const capabilityForm: SetupFormState = {
    ...props.form,
    roomsEnabled: hasBusinessCapability(effectiveCapabilities, C.ACCOMMODATION_ROOMS),
    tablesEnabled: hasBusinessCapability(effectiveCapabilities, C.FOOD_TABLES),
    qrMenuEnabled: hasBusinessCapability(effectiveCapabilities, C.QR_MENU)
  };

  useEffect(() => {
    // LegacySetupWizard still owns the visual identity form and its onChange
    // handler, but its sector options predate the capability/profile registry.
    // Keep that large component stable while projecting the authoritative
    // available profile list into its select. Existing installations using a
    // now-planned profile keep their current value so settings never go blank.
    const selector = setupRootRef.current?.querySelector<HTMLSelectElement>(
      ".settings-identity-section > .setup-grid.two > label:nth-child(2) select"
    );
    if (!selector) return;

    const availableProfiles = getAvailableBusinessProfiles();
    const currentProfile = getBusinessProfile(props.form.businessType);
    const profiles = availableProfiles.some((profile) => profile.id === currentProfile.id)
      ? availableProfiles
      : [...availableProfiles, currentProfile];
    const nextSignature = profiles.map((profile) => `${profile.id}:${profile.label}`).join("|");
    const currentSignature = Array.from(selector.options)
      .map((option) => `${option.value}:${option.textContent ?? ""}`)
      .join("|");

    if (nextSignature !== currentSignature) {
      const fragment = document.createDocumentFragment();
      for (const profile of profiles) {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = profile.label;
        fragment.appendChild(option);
      }
      selector.replaceChildren(fragment);
    }
    selector.value = currentProfile.id;
  }, [props.form.businessType]);

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
    <div className="setup-capability-v2" ref={setupRootRef}>
      <LegacySetupWizard
        {...props}
        form={capabilityForm}
        enabledCapabilities={deviceRuntimeCapabilities}
        onFormChange={handleLegacyFormChange}
      />

      {props.embedded && capabilityRuntime.snapshot?.businessId && (
        <div className="setup-capability-editor-shell">
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
        </div>
      )}
    </div>
  );
}

import { BUSINESS_CAPABILITIES as C, CORE_BUSINESS_CAPABILITIES,
  getBusinessProfile, getBusinessProfileSelectionCapabilities } from "@yardimci-asistan/shared";

/** Model a committed snapshot from canonical roots; never inject technical rows. */
export function createCapabilitySnapshotFixture(setupData, businessId = "smoke-business") {
  const profile = getBusinessProfile(setupData.profileId);
  const enabledCapabilities = [...getBusinessProfileSelectionCapabilities(profile.id,
    setupData.profileOptions ?? profile.defaultOptionalCapabilities),
    ...(setupData.servicePreferences?.whatsapp ? [C.WHATSAPP] : []),
    ...(setupData.servicePreferences?.android ? [C.ANDROID] : []),
    ...(setupData.aiEnabled ? [C.AI] : [])];
  return {
    businessId, profileId: profile.id, enabledCapabilities,
    capabilities: enabledCapabilities.map(capability => ({ capability, enabled: true,
      source: CORE_BUSINESS_CAPABILITIES.includes(capability) ? "system" : "profile",
      updatedAt: "2026-07-18T12:00:00+03:00" }))
  };
}

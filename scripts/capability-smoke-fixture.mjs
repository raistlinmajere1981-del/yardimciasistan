const CORE_CAPABILITIES = [
  "core.customers",
  "core.tasks",
  "core.calendar",
  "core.notifications",
  "core.finance",
  "core.reports",
  "core.web",
  "core.sync",
  "core.backups",
  "core.devices"
];

const { getBusinessProfile } = await import("@yardimci-asistan/shared");

export function createCapabilitySnapshotFixture(setupData, businessId = "smoke-business") {
  const enabledCapabilities = new Set(getBusinessProfile(setupData.profileId).defaultCapabilities);
  for (const capability of CORE_CAPABILITIES) enabledCapabilities.add(capability);
  if (setupData.servicePreferences?.whatsapp) enabledCapabilities.add("service.whatsapp");
  else enabledCapabilities.delete("service.whatsapp");
  if (setupData.servicePreferences?.android) enabledCapabilities.add("service.android");
  else enabledCapabilities.delete("service.android");
  if (setupData.aiEnabled) enabledCapabilities.add("service.ai");
  else enabledCapabilities.delete("service.ai");

  const enabled = [...enabledCapabilities];
  return {
    businessId,
    profileId: setupData.profileId,
    capabilities: enabled.map((capability) => ({
      capability,
      enabled: true,
      source: capability.startsWith("core.") ? "system" : "profile",
      updatedAt: "2026-07-18T12:00:00+03:00"
    })),
    enabledCapabilities: enabled
  };
}

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

export function createCapabilitySnapshotFixture(setupData, businessId = "smoke-business") {
  const modules = setupData.modules ?? {};
  const enabledCapabilities = new Set(CORE_CAPABILITIES);

  if (modules.rooms) {
    [
      "accommodation.rooms",
      "accommodation.reservations",
      "accommodation.stays",
      "accommodation.folio"
    ].forEach((capability) => enabledCapabilities.add(capability));
  }
  if (modules.tables) {
    [
      "food_service.tables",
      "food_service.reservations",
      "food_service.orders",
      "food_service.menu",
      "commerce.catalog",
      "commerce.sales"
    ].forEach((capability) => enabledCapabilities.add(capability));
  }
  if (modules.qrMenu) {
    enabledCapabilities.add("food_service.menu");
    enabledCapabilities.add("channel.qr_menu");
    enabledCapabilities.add("commerce.catalog");
    enabledCapabilities.add("commerce.inventory");
  }
  if (modules.whatsapp) enabledCapabilities.add("service.whatsapp");
  if (modules.android) enabledCapabilities.add("service.android");
  if (setupData.aiEnabled) enabledCapabilities.add("service.ai");

  const enabled = [...enabledCapabilities];
  return {
    businessId,
    businessType: setupData.businessType,
    profileId: setupData.businessType,
    capabilities: enabled.map((capability) => ({
      capability,
      enabled: true,
      source: capability.startsWith("core.") ? "system" : "profile",
      updatedAt: "2026-07-18T12:00:00+03:00"
    })),
    enabledCapabilities: enabled
  };
}

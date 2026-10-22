import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C, getBusinessProfile, getBusinessProfileSelectionCapabilities,
  isBusinessServiceAvailable, normalizeBusinessType, type BusinessCapability } from "@yardimci-asistan/shared";
import type { DesktopSetupData, SaveInitialSetupInput } from "./database-types";

/** Profile-independent transport/configuration survives; feature usage requires a new opt-in. */
export function normalizeProfileTransitionInput(
  input: SaveInitialSetupInput,
  current: DesktopSetupData
): SaveInitialSetupInput {
  const profileChanged = !current.setupRequired && normalizeBusinessType(input.profileId) !== current.profileId;
  const effective = profileChanged ? {
    ...input,
    profileOptions: [...getBusinessProfile(input.profileId).defaultOptionalCapabilities],
    aiEnabled: false,
    servicePreferences: { whatsapp: false, android: false },
    dealerPortalEnabled: false,
    dealerApplicationEnabled: false,
    onlineSalesDeliveryEnabled: false,
    productData: { ...(input.productData ?? current.productData), enabled: false },
    birthdaySettings: { ...(input.birthdaySettings ?? current.birthdaySettings), enabled: false },
    arasShipping: { ...(input.arasShipping ?? current.arasShipping), enabled: false },
    whatsappCloud: { ...(input.whatsappCloud ?? current.whatsappCloud), enabled: false },
    sms: { ...(input.sms ?? current.sms), enabled: false },
    instagram: { enabled: false },
  } : input;
  const capabilities = getBusinessProfileSelectionCapabilities(effective.profileId,
    effective.profileOptions ?? getBusinessProfile(effective.profileId).defaultOptionalCapabilities);
  if (effective.servicePreferences.whatsapp) capabilities.push(C.WHATSAPP);
  const available = (service: Parameters<typeof isBusinessServiceAvailable>[0]) => isBusinessServiceAvailable(service, capabilities);
  const onlineSalesDeliveryEnabled = available("delivery") && (effective.onlineSalesDeliveryEnabled ?? current.onlineSalesDeliveryEnabled);
  return {
    ...effective,
    dealerPortalEnabled: available("dealerPortal") && (effective.dealerPortalEnabled ?? current.dealerPortalEnabled),
    ...(onlineSalesDeliveryEnabled !== undefined ? { onlineSalesDeliveryEnabled } : {}),
    productData: { ...(effective.productData ?? current.productData),
      enabled: available("productData") && (effective.productData ?? current.productData).enabled },
    birthdaySettings: { ...(effective.birthdaySettings ?? current.birthdaySettings),
      enabled: available("birthday") && (effective.birthdaySettings ?? current.birthdaySettings).enabled },
    arasShipping: { ...(effective.arasShipping ?? current.arasShipping),
      enabled: available("shipping") && Boolean(effective.onlineSalesDeliveryEnabled ?? current.onlineSalesDeliveryEnabled)
        && (effective.onlineSalesDelivery ?? current.onlineSalesDelivery).shippingEnabled },
    sms: { ...(effective.sms ?? current.sms), enabled: available("sms") && (effective.sms ?? current.sms).enabled },
    instagram: { enabled: available("instagram") && (effective.instagram?.enabled ?? current.instagram.enabled) },
  };
}

/** Same feature-owner policy for Setup, direct capability writes and override clearing. */
export function resetUnavailableServiceActivationsInTransaction(
  db: DatabaseSync, businessId: string, capabilities: Iterable<BusinessCapability>, now: string
): void {
  const enabled = [...capabilities];
  const available = (service: Parameters<typeof isBusinessServiceAvailable>[0]) => isBusinessServiceAvailable(service, enabled);
  const settings = [
    ["productData", "product_data_enabled"], ["birthday", "birthday_enabled"],
    ["dealerPortal", "dealer_portal_enabled"], ["delivery", "online_sales_delivery_enabled"]
  ] as const;
  for (const [service, column] of settings) {
    if (!available(service)) db.prepare(`UPDATE settings SET ${column} = 0, updated_at = ?
      WHERE business_id = ? AND ${column} = 1`).run(now, businessId);
  }
  if (!available("shipping")) db.prepare("UPDATE commerce_shipping_provider_config SET enabled = 0, updated_at = ? WHERE business_id = ? AND enabled = 1").run(now, businessId);
  if (!available("whatsappCloud")) db.prepare("UPDATE business_messaging_provider_config SET enabled = 0, updated_at = ? WHERE business_id = ? AND enabled = 1").run(now, businessId);
  for (const [service, provider] of [["sms", "iletimerkezi"], ["instagram", "instagram_api"]] as const) {
    if (!available(service)) db.prepare("UPDATE marketing_provider_config SET enabled = 0, updated_at = ? WHERE business_id = ? AND provider_id = ? AND enabled = 1").run(now, businessId, provider);
  }
  if (!available("kbs")) db.prepare("UPDATE kbs_service_settings SET enabled = 0, updated_at = ? WHERE enabled = 1").run(now);
  if (!available("googleReviews")) {
    // Existing settings trigger invalidates the canonical publication owner.
    db.prepare(`UPDATE settings SET google_reviews_enabled = 0, google_reviews_publish_pending = 1,
      updated_at = ? WHERE business_id = ? AND google_reviews_enabled = 1`).run(now, businessId);
  }
}

/** Caller owns the profile/capability transaction. Never delete credentials or configuration. */
export function resetProfileServiceActivationsInTransaction(db: DatabaseSync, businessId: string, now: string): void {
  db.prepare(`UPDATE settings SET product_data_enabled = 0, birthday_enabled = 0,
    dealer_application_enabled = 0, dealer_portal_enabled = 0, online_sales_delivery_enabled = 0, updated_at = ?
    WHERE business_id = ? AND deleted_at = ''`).run(now, businessId);
  db.prepare("UPDATE commerce_shipping_provider_config SET enabled = 0, updated_at = ? WHERE business_id = ?").run(now, businessId);
  db.prepare("UPDATE business_messaging_provider_config SET enabled = 0, updated_at = ? WHERE business_id = ?").run(now, businessId);
  db.prepare("UPDATE marketing_provider_config SET enabled = 0, updated_at = ? WHERE business_id = ?").run(now, businessId);
  db.prepare("UPDATE kbs_service_settings SET enabled = 0, updated_at = ?").run(now);
}

import type { DatabaseSync } from "node:sqlite";
import { getBusinessProfile, normalizeBusinessType } from "@yardimci-asistan/shared";
import type { DesktopSetupData, SaveInitialSetupInput } from "./database-types";

/** Profile-independent transport/configuration survives; feature usage requires a new opt-in. */
export function normalizeProfileTransitionInput(
  input: SaveInitialSetupInput,
  current: DesktopSetupData
): SaveInitialSetupInput {
  if (current.setupRequired || normalizeBusinessType(input.profileId) === current.profileId) return input;
  return {
    ...input,
    profileOptions: [...getBusinessProfile(input.profileId).defaultOptionalCapabilities],
    aiEnabled: false,
    servicePreferences: { whatsapp: false, android: false },
    dealerPortalEnabled: false,
    onlineSalesDeliveryEnabled: false,
    productData: { ...(input.productData ?? current.productData), enabled: false },
    birthdaySettings: { ...(input.birthdaySettings ?? current.birthdaySettings), enabled: false },
    arasShipping: { ...(input.arasShipping ?? current.arasShipping), enabled: false },
    whatsappCloud: { ...(input.whatsappCloud ?? current.whatsappCloud), enabled: false },
    sms: { ...(input.sms ?? current.sms), enabled: false },
    instagram: { ...(input.instagram ?? current.instagram), enabled: false }
  };
}

/** Caller owns the profile/capability transaction. Never delete credentials or configuration. */
export function resetProfileServiceActivationsInTransaction(db: DatabaseSync, businessId: string, now: string): void {
  db.prepare(`UPDATE settings SET product_data_enabled = 0, birthday_enabled = 0,
    dealer_portal_enabled = 0, online_sales_delivery_enabled = 0, updated_at = ?
    WHERE business_id = ? AND deleted_at = ''`).run(now, businessId);
  db.prepare("UPDATE commerce_shipping_provider_config SET enabled = 0, updated_at = ? WHERE business_id = ?").run(now, businessId);
  db.prepare("UPDATE business_messaging_provider_config SET enabled = 0, updated_at = ? WHERE business_id = ?").run(now, businessId);
  db.prepare("UPDATE marketing_provider_config SET enabled = 0, updated_at = ? WHERE business_id = ?").run(now, businessId);
  db.prepare("UPDATE kbs_service_settings SET enabled = 0, updated_at = ?").run(now);
}

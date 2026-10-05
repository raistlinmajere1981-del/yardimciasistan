import {
  createBusinessAiContext,
  normalizeGoogleMapsEmbedUrl,
  type BusinessAiContext,
  type BusinessWebContext
} from "@yardimci-asistan/shared";
import {
  pushBusinessContext,
  type PushBusinessContextResult
} from "@yardimci-asistan/sync-core";
import type { DesktopDatabase } from "./database";
import { getBusinessPublicProfile } from "./business-public-profile";
import type { AiSettingsSyncConfig } from "./ai-settings-publish-service";

export function createCurrentBusinessAiContext(database: DesktopDatabase): BusinessAiContext {
  const setup = database.getSetupData();
  return createBusinessAiContext({
    businessName: setup.businessName,
    profileId: setup.profileId,
    phone: setup.phone,
    whatsapp: setup.whatsapp,
    email: setup.email,
    address: setup.address,
    enabledCapabilities: database.getEnabledBusinessCapabilities(),
    publicProfile: getBusinessPublicProfile(database.databasePath)
  });
}

export async function publishBusinessAiContext(
  database: DesktopDatabase,
  syncConfig: AiSettingsSyncConfig
): Promise<PushBusinessContextResult> {
  const profile = getBusinessPublicProfile(database.databasePath);
  const context: BusinessWebContext = {
    ...createCurrentBusinessAiContext(database),
    mapDisplayMode: profile.mapDisplayMode,
    googleMapsEmbedUrl: normalizeGoogleMapsEmbedUrl(profile.googleMapsEmbedUrl)
  };
  const result = await pushBusinessContext({
    ...syncConfig,
    clientId: database.getSyncRuntimeStatus().clientId,
    context
  });

  database.recordSyncEvent({
    direction: "push",
    entityType: "business_context",
    ok: result.ok,
    recordCount: result.ok ? 1 : 0,
    message: result.message,
    status: result.ok ? undefined : result.status
  });

  return result;
}

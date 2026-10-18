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
import { publishedGallery, pendingGallery } from "./business-gallery-service";
import { publishPendingBusinessGallery } from "./business-gallery-publication";
import { ensurePublicationSource } from "./publication-source-service";
import { getBusinessPublicProfile } from "./business-public-profile";
import type { AiSettingsSyncConfig } from "./ai-settings-publish-service";
import { publishDesktopProjection } from "./desktop-publication-service";

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
  syncConfig: AiSettingsSyncConfig,
  refresh = true
): Promise<PushBusinessContextResult | null> {
  if (pendingGallery(database.userDataPath).length) {
    const source = await ensurePublicationSource(database, syncConfig);
    if (!source.ok) return { ok: false, message: source.message, error: "gallery_publication_source" };
    const uploaded = await publishPendingBusinessGallery(database.userDataPath, syncConfig, source.clientId);
    if (!uploaded.ok) return { ok: false, message: uploaded.message, error: "gallery_upload_failed" };
  }
  const context = createCurrentBusinessWebContext(database);
  const result = await publishDesktopProjection(database, syncConfig, "business_context_publish", context,
    (identity, frozen) => pushBusinessContext({ ...syncConfig, ...identity, context: frozen }), { refresh });
  if (!result) return null;

  database.recordSyncEvent({
    direction: "push",
    entityType: "business_context",
    ok: result.ok,
    recordCount: result.ok ? 1 : 0,
    message: result.message,
    ...(!result.ok && result.status !== undefined ? { status: result.status } : {})
  });

  return result;
}

/** Web projection uses only the chosen map source; canonical location remains intact.
 * @compiledSmoke scripts/smoke-settings-correctness.mjs (dist-electron require) */
export function createCurrentBusinessWebContext(database: DesktopDatabase): BusinessWebContext {
  const profile = getBusinessPublicProfile(database.databasePath);
  const context = createCurrentBusinessAiContext(database);
  return {
    ...context,
    latitude: profile.mapDisplayMode === "manual" ? context.latitude : null,
    longitude: profile.mapDisplayMode === "manual" ? context.longitude : null,
    mapDisplayMode: profile.mapDisplayMode,
    gallery: publishedGallery(database.userDataPath),
    googleMapsEmbedUrl: profile.mapDisplayMode === "google_maps_embed" ? normalizeGoogleMapsEmbedUrl(profile.googleMapsEmbedUrl) : ""
  };
}

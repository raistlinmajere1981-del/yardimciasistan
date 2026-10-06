/** Static Desktop-owned publication inventory. Job types, protocol receipt names,
 * retry ownership and explicit restore coverage derive from this one contract.
 * A new kind needs its real producer in the coordinator and the roundtrip test.
 */
export const DESKTOP_PUBLICATIONS = {
  menu_publish: { name: "menu", publisher: "outbox" },
  android_snapshot: { name: "android_snapshot", publisher: "outbox" },
  online_catalog_publish: { name: "online_catalog", publisher: "outbox" },
  dealer_access_publish: { name: "dealer_access_private", publisher: "outbox" },
  marketing_website_publish: { name: "marketing_website", publisher: "outbox" },
  room_catalog_publish: { name: "room_catalog", publisher: "room_catalog" },
  table_catalog_publish: { name: "table_catalog", publisher: "table_catalog" },
  business_context_publish: { name: "business_context", publisher: "business_context" },
  ai_catalog_publish: { name: "ai_catalog", publisher: "ai_catalog" },
  public_room_availability_publish: { name: "public_room_availability", publisher: "availability" },
  ai_settings_publish: { name: "ai_settings", publisher: "ai_settings" },
  google_reviews_settings_publish: { name: "google_reviews_settings", publisher: "google_reviews_settings" }
} as const;

export type DesktopPublicationJobType = keyof typeof DESKTOP_PUBLICATIONS;
export const DESKTOP_PUBLICATION_JOB_TYPES = Object.keys(DESKTOP_PUBLICATIONS) as DesktopPublicationJobType[];

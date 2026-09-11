export const ROOM_PUBLIC_FEATURE_CATALOG = [
  { id: "air_conditioning", label: "Klima", group: "comfort" },
  { id: "wifi", label: "Wi-Fi", group: "connectivity" },
  { id: "private_bathroom", label: "Özel banyo", group: "bathroom" },
  { id: "balcony", label: "Balkon", group: "outdoor" },
  { id: "terrace", label: "Teras", group: "outdoor" },
  { id: "sea_view", label: "Deniz manzarası", group: "view" },
  { id: "garden_view", label: "Bahçe manzarası", group: "view" },
  { id: "mountain_view", label: "Dağ manzarası", group: "view" },
  { id: "tv", label: "TV", group: "comfort" },
  { id: "mini_fridge", label: "Mini buzdolabı", group: "comfort" },
  { id: "heating", label: "Isıtma", group: "comfort" },
  { id: "work_desk", label: "Çalışma masası", group: "comfort" },
  { id: "kitchenette", label: "Mini mutfak", group: "comfort" },
  { id: "step_free_access", label: "Basamaksız erişim", group: "accessibility" },
  { id: "wheelchair_friendly", label: "Tekerlekli sandalye erişimine uygun", group: "accessibility" },
  { id: "non_smoking", label: "Sigara içilmeyen oda", group: "policy" }
] as const;

export type RoomPublicFeatureId = (typeof ROOM_PUBLIC_FEATURE_CATALOG)[number]["id"];
export type RoomPublicFeatureGroup = (typeof ROOM_PUBLIC_FEATURE_CATALOG)[number]["group"];

export const ROOM_PUBLIC_DETAIL_LIMITS = {
  name: 120,
  number: 40,
  bedInfo: 160,
  floor: 80,
  description: 1200,
  priceNote: 500,
  features: ROOM_PUBLIC_FEATURE_CATALOG.length
} as const;

/**
 * Customer-facing room profile. Operational state, reservations, stays and
 * internal notes deliberately do not belong to this contract.
 */
export interface RoomPublicDetails {
  name: string;
  number: string;
  capacity: number;
  bedInfo: string;
  floor: string;
  features: RoomPublicFeatureId[];
  description: string;
  priceNote: string;
}

export interface SaveRoomPublicDetailsInput extends RoomPublicDetails {
  roomId: string;
}

const ROOM_PUBLIC_FEATURE_IDS = new Set<string>(ROOM_PUBLIC_FEATURE_CATALOG.map((feature) => feature.id));
const ROOM_PUBLIC_FEATURE_LABELS = new Map<string, string>(
  ROOM_PUBLIC_FEATURE_CATALOG.map((feature) => [feature.id, feature.label])
);

export function isRoomPublicFeatureId(value: unknown): value is RoomPublicFeatureId {
  return typeof value === "string" && ROOM_PUBLIC_FEATURE_IDS.has(value);
}

/**
 * Public room features are intentionally allow-listed. Unknown/internal values
 * are never promoted into a future web/AI public context by this helper.
 */
export function normalizeRoomPublicFeatures(values: readonly unknown[]): RoomPublicFeatureId[] {
  const normalized: RoomPublicFeatureId[] = [];
  const seen = new Set<RoomPublicFeatureId>();

  for (const value of values) {
    if (!isRoomPublicFeatureId(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function getRoomPublicFeatureLabel(value: string): string {
  return ROOM_PUBLIC_FEATURE_LABELS.get(value) ?? value;
}

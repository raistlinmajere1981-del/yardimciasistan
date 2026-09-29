export const TABLE_PUBLIC_FEATURE_CATALOG = [
  { id: "indoor", label: "İç mekân", group: "location" },
  { id: "outdoor", label: "Açık alan", group: "location" },
  { id: "terrace", label: "Teras / veranda", group: "location" },
  { id: "window_side", label: "Cam kenarı", group: "location" },
  { id: "sea_view", label: "Deniz manzarası", group: "view" },
  { id: "garden_view", label: "Bahçe manzarası", group: "view" },
  { id: "quiet_area", label: "Sakin bölüm", group: "experience" },
  { id: "wheelchair_friendly", label: "Tekerlekli sandalye erişimine uygun", group: "accessibility" }
] as const;

export const TABLE_SMOKING_POLICIES = [
  "unspecified",
  "non_smoking",
  "smoking_allowed",
  "outdoor_only"
] as const;

export const TABLE_SMOKING_POLICY_LABELS = {
  unspecified: "",
  non_smoking: "Sigara içilmez",
  smoking_allowed: "Sigara içilebilir",
  outdoor_only: "Yalnız açık alanda sigara içilebilir"
} as const;

export type TablePublicFeatureId = (typeof TABLE_PUBLIC_FEATURE_CATALOG)[number]["id"];
export type TablePublicFeatureGroup = (typeof TABLE_PUBLIC_FEATURE_CATALOG)[number]["group"];
export type TableSmokingPolicy = (typeof TABLE_SMOKING_POLICIES)[number];

export const TABLE_PUBLIC_DETAIL_LIMITS = {
  name: 120,
  area: 120,
  description: 1200,
  features: TABLE_PUBLIC_FEATURE_CATALOG.length
} as const;

/**
 * Customer-facing table profile. Operational status, active orders, customer
 * relations, reservations and internal notes deliberately stay outside it.
 */
export interface TablePublicDetails {
  name: string;
  area: string;
  capacity: number;
  description: string;
  features: TablePublicFeatureId[];
  smokingPolicy: TableSmokingPolicy;
}

export interface SaveTablePublicDetailsInput extends TablePublicDetails {
  tableId: string;
}

const TABLE_PUBLIC_FEATURE_IDS = new Set<string>(TABLE_PUBLIC_FEATURE_CATALOG.map((feature) => feature.id));
const TABLE_PUBLIC_FEATURE_LABELS = new Map<string, string>(
  TABLE_PUBLIC_FEATURE_CATALOG.map((feature) => [feature.id, feature.label])
);
const TABLE_SMOKING_POLICY_IDS = new Set<string>(TABLE_SMOKING_POLICIES);

export function isTablePublicFeatureId(value: unknown): value is TablePublicFeatureId {
  return typeof value === "string" && TABLE_PUBLIC_FEATURE_IDS.has(value);
}

export function normalizeTablePublicFeatures(values: readonly unknown[]): TablePublicFeatureId[] {
  const normalized: TablePublicFeatureId[] = [];
  const seen = new Set<TablePublicFeatureId>();

  for (const value of values) {
    if (!isTablePublicFeatureId(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function getTablePublicFeatureLabel(value: string): string {
  return TABLE_PUBLIC_FEATURE_LABELS.get(value) ?? value;
}

export function isTableSmokingPolicy(value: unknown): value is TableSmokingPolicy {
  return typeof value === "string" && TABLE_SMOKING_POLICY_IDS.has(value);
}

export function normalizeTableSmokingPolicy(value: unknown): TableSmokingPolicy {
  return isTableSmokingPolicy(value) ? value : "unspecified";
}

export function getTableSmokingPolicyLabel(value: string): string {
  return isTableSmokingPolicy(value) ? TABLE_SMOKING_POLICY_LABELS[value] : value;
}

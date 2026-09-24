import type { BusinessCapability } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";

export type NonEmpty<T> = readonly [T, ...T[]];

export interface AllCapabilities {
  readonly allOf: NonEmpty<BusinessCapability>;
  readonly anyOf?: never;
}

export interface AnyCapabilities {
  readonly anyOf: NonEmpty<BusinessCapability | AllCapabilities>;
  readonly allOf?: never;
}

export type CapabilityCondition = AllCapabilities | AnyCapabilities;

/**
 * Static UI composition predicate only.
 *
 * Runtime authority stays in the persisted BusinessCapabilitySnapshot and backend
 * capability guards. This evaluator performs no profile fallback or dependency expansion.
 */
export function matchesCapabilityCondition(
  snapshot: BusinessCapabilitySnapshot | null | undefined,
  condition?: CapabilityCondition
): boolean {
  if (!condition) return true;
  const enabled = new Set<BusinessCapability>(snapshot?.enabledCapabilities ?? []);
  if ("allOf" in condition && condition.allOf) {
    return condition.allOf.every((capability) => enabled.has(capability));
  }
  return condition.anyOf.some((candidate) =>
    typeof candidate === "string"
      ? enabled.has(candidate)
      : candidate.allOf.every((capability) => enabled.has(capability))
  );
}

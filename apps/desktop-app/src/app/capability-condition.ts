import { expandBusinessCapabilities, type BusinessCapability } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";

type NonEmpty<T> = readonly [T, ...T[]];

interface AllCapabilities {
  readonly allOf: NonEmpty<BusinessCapability>;
}

interface AnyCapabilities {
  readonly anyOf: NonEmpty<BusinessCapability | AllCapabilities>;
}

export type CapabilityCondition = AllCapabilities | AnyCapabilities;

/**
 * Static UI composition predicate only.
 *
 * Runtime authority stays in the persisted BusinessCapabilitySnapshot and backend
 * capability guards. Requirements come from the canonical graph; missing persisted
 * prerequisites fail closed. This never adds capabilities to the runtime snapshot.
 */
export function matchesCapabilityCondition(
  snapshot: BusinessCapabilitySnapshot | null | undefined,
  condition?: CapabilityCondition
): boolean {
  if (!condition) return true;
  const enabled = new Set<BusinessCapability>(snapshot?.enabledCapabilities ?? []);
  const satisfies = (capabilities: Iterable<BusinessCapability>) =>
    expandBusinessCapabilities(capabilities).every(capability => enabled.has(capability));
  if ("allOf" in condition) {
    return satisfies(condition.allOf);
  }
  return condition.anyOf.some((candidate) =>
    typeof candidate === "string"
      ? satisfies([candidate])
      : satisfies(candidate.allOf)
  );
}

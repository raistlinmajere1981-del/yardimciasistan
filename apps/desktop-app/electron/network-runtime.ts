import {
  getDefaultAutoSelectFamilyAttemptTimeout,
  setDefaultAutoSelectFamilyAttemptTimeout
} from "node:net";

export const MINIMUM_NETWORK_FAMILY_ATTEMPT_TIMEOUT_MS = 1_000;

export function configureNetworkFamilyAttemptTimeout(): number {
  const currentTimeout = getDefaultAutoSelectFamilyAttemptTimeout();
  if (currentTimeout < MINIMUM_NETWORK_FAMILY_ATTEMPT_TIMEOUT_MS) {
    setDefaultAutoSelectFamilyAttemptTimeout(MINIMUM_NETWORK_FAMILY_ATTEMPT_TIMEOUT_MS);
  }
  return getDefaultAutoSelectFamilyAttemptTimeout();
}

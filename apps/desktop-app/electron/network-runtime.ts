import {
  getDefaultAutoSelectFamilyAttemptTimeout,
  setDefaultAutoSelectFamilyAttemptTimeout
} from "node:net";

/** @compiledSmoke Used via dist-electron by scripts/smoke-web-connection-test.mjs. */
export const MINIMUM_NETWORK_FAMILY_ATTEMPT_TIMEOUT_MS = 1_000;

export function configureNetworkFamilyAttemptTimeout(): number {
  const currentTimeout = getDefaultAutoSelectFamilyAttemptTimeout();
  if (currentTimeout < MINIMUM_NETWORK_FAMILY_ATTEMPT_TIMEOUT_MS) {
    setDefaultAutoSelectFamilyAttemptTimeout(MINIMUM_NETWORK_FAMILY_ATTEMPT_TIMEOUT_MS);
  }
  return getDefaultAutoSelectFamilyAttemptTimeout();
}

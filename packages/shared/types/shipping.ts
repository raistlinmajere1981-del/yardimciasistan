/** Static provider configuration metadata; endpoints and credentials stay in main. */
export const COMMERCE_SHIPPING_PROVIDERS = {
  aras: { id: "aras", name: "Aras Kargo" }
} as const;
export const ARAS_SHIPPING_PROVIDER = COMMERCE_SHIPPING_PROVIDERS.aras;
export type ShippingEnvironment = "test" | "production";

export interface ArasShippingConfiguration {
  providerId: string;
  providerName: string;
  enabled: boolean;
  environment: ShippingEnvironment;
  customerCode: string;
  username: string;
  hasSecret: boolean;
  configured: boolean;
  /** Main-owned evidence for the effective stored credentials, not live availability. */
  verified?: boolean;
}
export interface ArasShippingConfigurationInput {
  enabled: boolean;
  environment: ShippingEnvironment;
  customerCode: string;
  username: string;
  password?: string;
  clearPassword?: boolean;
}
export function emptyArasShippingConfiguration(): ArasShippingConfiguration {
  return { providerId: ARAS_SHIPPING_PROVIDER.id, providerName: ARAS_SHIPPING_PROVIDER.name,
    enabled: false, environment: "test", customerCode: "", username: "", hasSecret: false, configured: false };
}

/** Credentials readiness is independent of delivery activation; not a remote test. */
export function isArasShippingConfigurationReady(config: Pick<ArasShippingConfiguration, "enabled" | "customerCode" | "username"> & {
  hasSecret?: boolean; password?: string; clearPassword?: boolean;
}): boolean {
  return Boolean(config.customerCode.trim() && config.username.trim()
    && (config.password?.trim() || (config.hasSecret && !config.clearPassword)));
}
export interface ShippingConnectionTestResult {
  ok: boolean;
  providerId: string;
  message: string;
  testedAt: string;
}

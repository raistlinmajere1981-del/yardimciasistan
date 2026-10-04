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
export interface ShippingConnectionTestResult {
  ok: boolean;
  providerId: string;
  message: string;
  testedAt: string;
}

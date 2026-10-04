export class ShippingProviderError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus?: number) {
    super(message);
    this.name = "ShippingProviderError";
  }
}
export function normalizeShippingProviderError(error: unknown): ShippingProviderError {
  return error instanceof ShippingProviderError ? error
    : new ShippingProviderError("provider_failure", "Kargo sağlayıcısı işlemi tamamlanamadı.");
}

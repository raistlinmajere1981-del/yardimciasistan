export class BusinessMessagingError extends Error {
  constructor(readonly code: string, message = "WhatsApp Business işlemi tamamlanamadı.",
    readonly disposition?: { rejected: boolean; retry: "transient" | "rate_limit" | "none"; retryAfterMs?: number }) { super(message); this.name = "BusinessMessagingError"; }
}
/** Raw provider/network errors can include credentials or customer data. */
export function normalizeBusinessMessagingError(error: unknown): BusinessMessagingError {
  return error instanceof BusinessMessagingError ? error : new BusinessMessagingError("operation_failed");
}

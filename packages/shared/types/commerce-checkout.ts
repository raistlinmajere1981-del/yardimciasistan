/** Public business configuration, carried by the existing online_catalog publication. */
export interface CommerceCheckoutSettings {
  version: 1;
  enabled: boolean;
  demo: boolean;
  currency: "TRY" | "EUR" | "USD" | "GBP";
  shippingFeeMinor: number | null;
  bank: { name: string; accountHolder: string; iban: string } | null;
  legal: { version: string; preliminary: string; agreement: string } | null;
}

export interface CommerceCheckoutSnapshot {
  version: 2;
  currency: string;
  minor_unit: 2;
  items: Array<{ product_id: string; name: string; unit: string; quantity: number;
    unit_price_minor: number; line_total_minor: number; tax_rate: number; sku: string }>;
  subtotal_minor: number;
  delivery_fee_minor: number;
  total_minor: number;
  delivery_method: "pickup" | "shipping";
  payment_method: "bank_transfer";
  bank: NonNullable<CommerceCheckoutSettings["bank"]>;
  demo: boolean;
  legal: NonNullable<CommerceCheckoutSettings["legal"]>;
  quote_id: string;
  order_number: string;
  accepted_at: string;
  consent: { preliminary: true; agreement: true; marketing: boolean };
}

export type CommercePaymentStatus = "unpaid" | "verification_pending" | "paid" | "rejected" | "refunded";
export type CommerceDeliveryStatus = "unfulfilled" | "preparing" | "delivered" | "cancelled" | "returned";

export interface CommerceOrderEvent {
  id: string; type: string; actorId: string; createdAt: string; reason: string;
}
export interface CommerceOrderPaymentCommand {
  orderId: string; operationKey: string; expectedUpdatedAt: string;
  action: "approve" | "reject" | "refund" | "prepare";
  reason: string;
}
export interface CommerceWebOrderStatus {
  order_id: string; order_number: string; status: string;
  payment_status: CommercePaymentStatus; delivery_status: CommerceDeliveryStatus;
  updated_at: string;
  events: Array<{ id: string; type: string; created_at: string }>;
}

export const DEFAULT_COMMERCE_CHECKOUT: CommerceCheckoutSettings = { version:1,enabled:false,demo:true,currency:"TRY",shippingFeeMinor:null,bank:null,legal:null };

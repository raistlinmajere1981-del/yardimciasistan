/** Ephemeral prepared content, never a customer request or delivery receipt. */
export interface EphemeralWhatsAppHandoff {
  source: "customer_credit" | "birthday";
  customerId: string;
  customerName: string;
  phone: string;
  message: string;
}

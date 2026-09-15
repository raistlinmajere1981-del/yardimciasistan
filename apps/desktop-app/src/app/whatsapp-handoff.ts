/** Ephemeral prepared content, never a customer request or delivery receipt. */
export interface PreparedWhatsAppMessage {
  source: "customer_credit" | "birthday";
  customerId: string;
  customerName: string;
  phone: string;
  message: string;
}

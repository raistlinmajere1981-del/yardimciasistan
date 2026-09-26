interface BaseEphemeralWhatsAppHandoff {
  customerId: string;
  customerName: string;
  phone: string;
  message: string;
}

/** Ephemeral prepared content, never a customer request or delivery receipt. */
export type EphemeralWhatsAppHandoff =
  | (BaseEphemeralWhatsAppHandoff & { source: "customer_credit" })
  | (BaseEphemeralWhatsAppHandoff & { source: "birthday" })
  | (BaseEphemeralWhatsAppHandoff & {
      source: "reservation";
      reservationId: string;
      reservationType: string;
    });

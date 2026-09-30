/** Ephemeral prepared content, never a customer request or delivery receipt. */
export type EphemeralWhatsAppHandoff =
  | {
      customerId: string;
      customerName: string;
      phone: string;
      message: string;
      source: "customer_credit";
    }
  | {
      customerId: string;
      customerName: string;
      phone: string;
      message: string;
      source: "birthday";
    }
  | {
      customerId: string;
      customerName: string;
      phone: string;
      message: string;
      source: "reservation";
      reservationId: string;
      reservationType: string;
    };

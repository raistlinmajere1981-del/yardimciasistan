export type CustomerCreditDirection = "debit" | "credit";
export type CustomerCreditEntryType = "credit_sale" | "payment" | "adjustment_debit" | "adjustment_credit";
/** Explicit subset of the existing finance payment vocabulary. */
export type CustomerCreditPaymentMethod = "cash" | "card" | "bank" | "other";

export interface CustomerCreditEntry {
  id: string;
  businessId: string;
  customerId: string;
  direction: CustomerCreditDirection;
  amountMinor: number;
  currency: string;
  entryType: CustomerCreditEntryType;
  saleId: string | null;
  paymentMethod: CustomerCreditPaymentMethod | "";
  occurredAt: string;
  note: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerCreditBalance {
  currency: string;
  amountMinor: number;
}

/** Read-only commerce snapshots; monetary values use sale-model major units. */
export interface CustomerCreditSaleLineItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  currency: string;
}

export interface CustomerCreditSaleDetail {
  items: CustomerCreditSaleLineItem[];
  subtotal: number;
  discountTotal: number;
  total: number;
  currency: string;
}

/** History projection only: never persisted into the debt/payment ledger. */
export interface CustomerCreditHistoryEntry extends CustomerCreditEntry {
  /** Absent for non-sale movements; null when the linked snapshot is missing. */
  saleDetail?: CustomerCreditSaleDetail | null;
}

export interface CustomerCreditCustomer {
  id: string;
  businessId: string;
  fullName: string;
  phone: string;
  deletedAt: string;
}

export interface CustomerCreditAccountSummary {
  customer: CustomerCreditCustomer;
  /** Only positive outstanding balances, separated by currency. */
  balances: CustomerCreditBalance[];
  lastMovementAt: string;
  lastPayment: Pick<CustomerCreditEntry, "id" | "occurredAt" | "amountMinor" | "currency" | "paymentMethod"> | null;
}

export interface CustomerCreditAccountDetail {
  customer: CustomerCreditCustomer;
  /** Includes currencies whose balance has reached zero. */
  balances: CustomerCreditBalance[];
  /** Latest 200 entries. Use listCustomerCreditEntries for additional pages. */
  entries: CustomerCreditHistoryEntry[];
}

export interface CreateCustomerCreditSaleInput {
  customerId: string;
  items: Array<{ productId: string; quantity: number }>;
  discountTotal?: number;
  source?: string;
  locationId?: string;
  note?: string;
}

export interface RecordCustomerCreditPaymentInput {
  customerId: string;
  amountMinor: number;
  currency: string;
  paymentMethod: CustomerCreditPaymentMethod;
  paidAt?: string;
  note?: string;
  source?: string;
}

export interface AddCustomerCreditAdjustmentInput {
  customerId: string;
  entryType: "adjustment_debit" | "adjustment_credit";
  amountMinor: number;
  currency: string;
  note: string;
  source: string;
}

export interface ListCustomerCreditAccountsOptions {
  search?: string;
  outstandingOnly?: boolean;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListCustomerCreditEntriesOptions {
  currency?: string;
  limit?: number;
  offset?: number;
}

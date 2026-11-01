/** Phase A contract. All monetary values are integer minor units in the explicit currency. */
export type BenefitsChannel = "desktop_cart" | "desktop_desk" | "web" | "web_dealer" | "companion";
export type BenefitsFamily = "coupon" | "points" | "payment_modifier";
export interface BenefitsFamilies { coupon: boolean; points: boolean; payment_modifier: boolean }
export interface BenefitsScope {
  channels: readonly BenefitsChannel[];
  customerIds: readonly string[];
  customerGroups: readonly string[];
  priceGroups: readonly ("retail" | "dealer_a" | "dealer_b")[];
  productIds: readonly string[];
  categoryIds: readonly string[];
  excludedProductIds: readonly string[];
  excludedCategoryIds: readonly string[];
}
export interface BenefitsRule {
  schemaVersion: 1;
  id: string;
  version: number;
  family: BenefitsFamily;
  status: "draft" | "active" | "disabled";
  currency: string;
  startsAt: number;
  endsAt: number | null;
  priority: number;
  scope: BenefitsScope;
  minSpendMinor: number;
  maxBenefitMinor: number | null;
  /** Both values apply to the same eligible base, half-up rounded, then capped. */
  percentBps: number;
  fixedMinor: number;
  /** Multiple coupons require every selected coupon to explicitly allow stacking. */
  allowCouponStacking: boolean;
  /** Cross-family combination is explicit in both rules; defaults must be empty. */
  combinesWith: readonly BenefitsFamily[];
  paymentMethodIds: readonly string[];
  points: null | {
    operation: "earn" | "redeem";
    earnBase: "after_discounts" | "after_points";
    expiryDays: number | null;
  };
}
export interface BenefitsResolvedLine {
  id: string;
  productId: string;
  categoryId: string;
  /** Retail/dealer resolution MUST already be performed by the canonical price owner. */
  unitPriceMinor: number;
  quantityTenThousandths: number;
}
export interface BenefitsPricingContext {
  businessId: string;
  customerId: string | null;
  customerGroups: readonly string[];
  priceGroup: "retail" | "dealer_a" | "dealer_b";
  channel: BenefitsChannel;
  currency: string;
  currencyExponent: number;
  now: number;
  families: BenefitsFamilies;
  lines: readonly BenefitsResolvedLine[];
  payment: { methodId: string; confirmed: boolean } | null;
  requestedPointsMinor: number;
  availablePointsMinor: number;
  /** Tax/finance owners supply these explicitly; engine never infers tax. */
  accounting: {
    taxTreatment: "included_in_items" | "added_explicitly";
    taxMinor: number;
    financeMinor: number;
    earnOnAccountingAdjustments: boolean;
  };
}
export interface BenefitsAdjustment {
  ruleId: string;
  ruleVersion: number;
  family: BenefitsFamily;
  operation: "discount" | "points_tender" | "earn_after_settlement";
  baseMinor: number;
  amountMinor: number;
}
export interface BenefitsQuote {
  version: 1;
  currency: string;
  currencyExponent: number;
  subtotalMinor: number;
  discountMinor: number;
  accountingMinor: number;
  pointsTenderMinor: number;
  payableMinor: number;
  /** Projection only; no ledger grant until the parent confirms actual paid settlement. */
  pointsEarnPreviewMinor: number;
  adjustments: readonly BenefitsAdjustment[];
}
export interface BenefitsSource { kind: "sale" | "commerce_order" | "table_order"; id: string }
/** Transport intent, never resolved prices, customer authorization or a quote as authority. */
export interface BenefitsCheckoutIntent {
  businessId: string;
  customerId: string | null;
  source: BenefitsSource;
  channel: BenefitsChannel;
  currency: string;
  lines: readonly { productId: string; quantityTenThousandths: number }[];
  couponCodes: readonly string[];
  paymentMethodId: string | null;
  requestedPointsMinor: number;
}
export interface BenefitsReservationReceipt {
  version: 1;
  reservationId: string;
  expiresAt: number;
  quote: BenefitsQuote;
}
export interface BenefitsSettlementReceipt {
  version: 1;
  snapshotId: string;
  reservationId: string;
  source: BenefitsSource;
  quote: BenefitsQuote;
  pointSpendEntryId: string | null;
  pointGrantEntryId: string | null;
}
/** Future API/outbox contracts. The existing durable action/publication owners carry these. */
export interface BenefitsCheckoutCommand {
  version: 1;
  actionId: string;
  intent: BenefitsCheckoutIntent;
  expectedQuote: BenefitsQuote | null;
  reservationId: string | null;
}
export type BenefitsCheckoutAcknowledgement =
  | { version: 1; actionId: string; status: "applied"; receipt: BenefitsSettlementReceipt }
  | { version: 1; actionId: string; status: "rejected"; code: string }
  | { version: 1; actionId: string; status: "requires_authority"; previewOnly: true };
/** Web offline preview and an unsent Companion action cannot authorize Puan redemption. */
export type BenefitsAuthority =
  | { state: "preview_only"; canConfirmPoints: false }
  | { state: "reserved"; reservationId: string; authorityRevision: number; expiresAt: number };

/** Desktop management only. Configuring a rule does not wire checkout. */
export type BenefitsManagementResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };
export interface BenefitsManagementSnapshot {
  families: BenefitsFamilies;
  revision: number;
  rules: BenefitsRule[];
  secureOperationsAvailable: boolean;
  checkoutIntegrated: false;
}
export interface BenefitsPointAccount {
  postedMinor: number;
  availableMinor: number;
  reservedMinor: number;
  entries: { id: string; kind: string; amountMinor: number; createdAt: number; expiresAt: number | null; reason: string; actor: string }[];
}
export interface BenefitsPointAdjustmentInput {
  customerId: string;
  currency: string;
  amountMinor: number;
  expiresAt: number | null;
  reason: "opening_balance" | "correction";
  note: string;
  operationKey: string;
}
export interface BenefitsCouponIssueInput {
  ruleId: string;
  maxUses: number;
  maxUsesPerCustomer: number | null;
  expiresAt: number;
}
export interface BenefitsManagementBridge {
  listCompanionPointDevices(): Promise<BenefitsManagementResult<{ deviceId: string; deviceName: string; recordId: string }[]>>;
  getCompanionPointGrantStatus(input: { deviceId: string; customerId: string }): Promise<BenefitsManagementResult<boolean>>;
  grantCompanionPointAccess(input: { deviceId: string; customerId: string; confirmed: true; recordId?: string }): Promise<BenefitsManagementResult<boolean>>;
  revokeCompanionPointAccess(input: { deviceId: string; customerId: string; confirmed: true; recordId?: string }): Promise<BenefitsManagementResult<boolean>>;
  getCompanionPointSpendStatus(input: { deviceId: string; customerId: string; recordId: string }): Promise<BenefitsManagementResult<boolean>>;
  grantCompanionPointSpend(input: { deviceId: string; customerId: string; recordId: string; confirmed: true }): Promise<BenefitsManagementResult<boolean>>;
  revokeCompanionPointSpend(input: { deviceId: string; customerId: string; recordId: string; confirmed: true }): Promise<BenefitsManagementResult<boolean>>;
  getCommerceBenefits(): Promise<BenefitsManagementResult<BenefitsManagementSnapshot>>;
  configureCommerceBenefits(input: { families: BenefitsFamilies; revision: number }): Promise<BenefitsManagementResult<BenefitsManagementSnapshot>>;
  saveCommerceBenefitsRule(rule: BenefitsRule): Promise<BenefitsManagementResult<BenefitsRule>>;
  issueCommerceBenefitsCoupon(input: BenefitsCouponIssueInput): Promise<BenefitsManagementResult<{ codeId: string; secret: string }>>;
  getCommercePointAccount(customerId: string, currency: string): Promise<BenefitsManagementResult<BenefitsPointAccount>>;
  adjustCommercePoints(input: BenefitsPointAdjustmentInput): Promise<BenefitsManagementResult<{ version: 1; entryId: string }>>;
  expireCommercePoints(input: { customerId: string; currency: string; operationKey: string; note: string }): Promise<BenefitsManagementResult<{ version: 1; entryIds: string[] }>>;
}

/** Native Desktop table checkout only. Customer, scope and line prices are DB-owned. */
export interface TableOrderBenefitsPreviewInput {
  orderId: string;
  operationKey: string;
  paymentMethod: "cash" | "card" | "bank" | "other";
  requestedPointsMinor: number;
  couponCode?: string;
}
export interface TableOrderBenefitsCloseInput {
  orderId: string;
  status: "paid";
  operationKey: string;
  paymentMethod: TableOrderBenefitsPreviewInput["paymentMethod"];
  benefits: { requestedPointsMinor: number; paymentAmountMinor: number; expectedQuote: BenefitsQuote; previewToken: string; couponCode?: string };
}
export interface TableOrderBenefitsState { enabled: boolean; families: BenefitsFamilies }
export interface TableOrderBenefitsPreview {
  previewToken: string;
  quote: BenefitsQuote;
  availablePointsMinor: number;
  families: BenefitsFamilies;
  authority: { state: "preview_only"; canConfirmPoints: false };
}
export interface TableOrderBenefitsPaidReceipt { orderId: string; benefits: BenefitsSettlementReceipt }
export interface TableOrderBenefitsBridge {
  getTableOrderBenefitsState(): Promise<BenefitsManagementResult<TableOrderBenefitsState>>;
  previewTableOrderBenefits(input: TableOrderBenefitsPreviewInput): Promise<BenefitsManagementResult<TableOrderBenefitsPreview>>;
  settleTableOrderBenefits(input: TableOrderBenefitsCloseInput): Promise<BenefitsManagementResult<TableOrderBenefitsPaidReceipt>>;
}

import type { DatabaseSync } from "node:sqlite";
import type { BenefitsCouponIssueInput, BenefitsFamilies, BenefitsManagementSnapshot, BenefitsPointAccount, BenefitsPointAdjustmentInput } from "@yardimci-asistan/shared";
import { benefitsAssert } from "./commerce-benefits-engine.js";
import { configureCommerceBenefits, issueCommerceBenefitCoupon, loadCommerceBenefitsRules, readBenefitsFamilies, requireCommerceBenefitsCapability,
  saveCommerceBenefitsRule, withCommerceBenefitsTransaction, type BenefitsSecretKey, type BenefitsTransaction } from "./commerce-benefits-rules.js";
import { readCommercePointBalance } from "./commerce-benefits-points.js";
import { CommerceBenefitsStore } from "./commerce-benefits-store.js";
import { canReadAndroidBenefitsBalance, grantAndroidBenefitsBalance, revokeAndroidBenefitsBalance } from "./database/android-benefits-grant-store.js";
import { canSpendAndroidBenefits, grantAndroidBenefitsSpend, revokeAndroidBenefitsSpend } from "./database/android-benefits-spend-grant-store.js";

interface CompanionSpendScope { deviceId: string; customerId: string; recordId: string }

/** The unlocked trusted local Desktop operator is the current app's staff authority.
 * There is no renderer-selected role or customer/device management path. Recheck on every call.
 */
export interface BenefitsManagementActor { id: string; role: "desktop_owner"; assertAuthorized(): void }
export interface BenefitsManagementKeys { available(): boolean; load(allowCreate?: boolean): BenefitsSecretKey }
export class CommerceBenefitsManagement {
  constructor(private readonly database: DatabaseSync, private readonly keys: BenefitsManagementKeys,
    private readonly actor: BenefitsManagementActor, private readonly now = Date.now) {}
  private business(): string {
    this.actor.assertAuthorized();
    benefitsAssert(this.actor.role === "desktop_owner" && this.actor.id.length > 0, "BENEFITS_STAFF_REQUIRED");
    const row = this.database.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
    benefitsAssert(row, "BENEFITS_TENANT_REQUIRED");
    requireCommerceBenefitsCapability(this.database, row.id);
    return row.id;
  }
  snapshot(): BenefitsManagementSnapshot {
    const businessId = this.business();
    const settings = this.database.prepare("SELECT revision FROM commerce_benefit_settings WHERE business_id = ?").get(businessId) as { revision: number } | undefined;
    return { families: readBenefitsFamilies(this.database, businessId), revision: settings?.revision ?? 0,
      rules: loadCommerceBenefitsRules(this.database, businessId), secureOperationsAvailable: this.keys.available(), checkoutIntegrated: false };
  }
  configure(input: { families: BenefitsFamilies; revision: number }): BenefitsManagementSnapshot {
    const businessId = this.business();
    withCommerceBenefitsTransaction(this.database, this.now(), tx => {
      benefitsAssert(input && input.revision === this.snapshot().revision, "BENEFITS_SETTINGS_VERSION_CONFLICT");
      configureCommerceBenefits(tx, businessId, input.families);
    });
    return this.snapshot();
  }
  saveRule(value: unknown) {
    const businessId = this.business();
    return withCommerceBenefitsTransaction(this.database, this.now(), tx => saveCommerceBenefitsRule(tx, businessId, value));
  }
  private key(): BenefitsSecretKey {
    const used = this.database.prepare(`SELECT 1 FROM commerce_benefit_coupon_codes UNION ALL SELECT 1 FROM commerce_benefit_receipts LIMIT 1`).get();
    return this.keys.load(!used);
  }
  issueCoupon(input: BenefitsCouponIssueInput) {
    const businessId = this.business();
    benefitsAssert(input && readBenefitsFamilies(this.database, businessId).coupon, "BENEFITS_COUPON_UNAVAILABLE");
    const rule = loadCommerceBenefitsRules(this.database, businessId).find(rule => rule.id === input.ruleId);
    benefitsAssert(rule?.status === "active", "BENEFITS_COUPON_UNAVAILABLE");
    const key = this.key();
    return withCommerceBenefitsTransaction(this.database, this.now(), tx => issueCommerceBenefitCoupon(tx, businessId, key, input));
  }
  pointAccount(customerId: string, currency: string): BenefitsPointAccount {
    const businessId = this.business();
    benefitsAssert(typeof customerId === "string" && customerId.length <= 128 && typeof currency === "string" && /^[A-Z]{3}$/.test(currency), "BENEFITS_INVALID_CONTEXT");
    const balance = readCommercePointBalance(this.database, businessId, customerId, currency, this.now());
    const rows = this.database.prepare(`SELECT l.id,l.kind,l.amount_minor AS amountMinor,l.created_at_ms AS createdAt,l.expires_at_ms AS expiresAt,
      COALESCE(a.note,'') AS reason,COALESCE(a.actor_id,'') AS actor FROM commerce_benefit_point_ledger l
      LEFT JOIN commerce_benefit_management_audit a ON a.business_id = l.business_id AND a.operation_key = l.operation_key
      WHERE l.business_id = ? AND l.customer_id = ? AND l.currency = ? ORDER BY l.sequence DESC LIMIT 100`)
      .all(businessId, customerId, currency) as unknown as BenefitsPointAccount["entries"];
    return { ...balance, entries: rows };
  }
  grantCompanionPointBalance(deviceId: string, customerId: string, recordId?: string): boolean {
    const businessId = this.business();
    benefitsAssert(readBenefitsFamilies(this.database, businessId).points, "BENEFITS_POINTS_UNAVAILABLE");
    benefitsAssert(typeof deviceId === "string" && /^[A-Za-z0-9._:-]{6,120}$/.test(deviceId)
      && typeof customerId === "string" && customerId.length > 0 && customerId.length <= 128 && customerId === customerId.trim(), "BENEFITS_INVALID_CONTEXT");
    return grantAndroidBenefitsBalance(this.database, { assertAuthorized: () => { this.business(); } }, businessId, deviceId, customerId, recordId);
  }
  revokeCompanionPointBalance(deviceId: string, customerId: string, recordId?: string): boolean {
    const businessId = this.business();
    benefitsAssert(typeof deviceId === "string" && /^[A-Za-z0-9._:-]{6,120}$/.test(deviceId)
      && typeof customerId === "string" && customerId.length > 0 && customerId.length <= 128 && customerId === customerId.trim(), "BENEFITS_INVALID_CONTEXT");
    return revokeAndroidBenefitsBalance(this.database, { assertAuthorized: () => { this.business(); } }, businessId, deviceId, customerId, recordId);
  }
  companionPointGrantStatus(input: { deviceId: string; customerId: string }): boolean {
    const businessId = this.business();
    benefitsAssert(input && typeof input.deviceId === "string" && /^[A-Za-z0-9._:-]{6,120}$/.test(input.deviceId)
      && typeof input.customerId === "string" && input.customerId.length > 0 && input.customerId.length <= 128
      && input.customerId === input.customerId.trim(), "BENEFITS_INVALID_CONTEXT");
    return canReadAndroidBenefitsBalance(this.database, businessId, input.deviceId, input.customerId);
  }
  companionPointDevices(): { deviceId: string; deviceName: string; recordId: string }[] {
    const businessId = this.business();
    if (!readBenefitsFamilies(this.database, businessId).points) return [];
    return this.database.prepare(`SELECT d.device_id AS deviceId, d.device_name AS deviceName, d.id AS recordId FROM android_devices d
      JOIN android_local_credentials c ON c.device_id = d.device_id AND c.revoked_at = ''
      WHERE d.is_active = 1 AND COALESCE(d.revoked_at, '') = ''
      AND EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = ? AND capability_id = 'service.android' AND is_enabled = 1)
      ORDER BY d.device_name, d.device_id LIMIT 200`).all(businessId) as unknown as { deviceId: string; deviceName: string; recordId: string }[];
  }
  changeCompanionPointGrant(input: { deviceId: string; customerId: string; confirmed: true; recordId?: string }, grant: boolean): boolean {
    this.business();
    benefitsAssert(input && input.confirmed === true, "BENEFITS_INVALID_CONTEXT");
    benefitsAssert(input.recordId === undefined || (typeof input.recordId === "string" && input.recordId.length > 0 && input.recordId.length <= 128), "BENEFITS_INVALID_CONTEXT");
    return grant ? this.grantCompanionPointBalance(input.deviceId, input.customerId, input.recordId)
      : this.revokeCompanionPointBalance(input.deviceId, input.customerId, input.recordId);
  }
  private assertSpendScope(input: CompanionSpendScope): void {
    benefitsAssert(input && typeof input.deviceId === "string" && /^[A-Za-z0-9._:-]{6,120}$/.test(input.deviceId)
      && typeof input.customerId === "string" && input.customerId.length > 0 && input.customerId.length <= 128 && input.customerId === input.customerId.trim()
      && typeof input.recordId === "string" && input.recordId.length > 0 && input.recordId.length <= 128 && input.recordId === input.recordId.trim(), "BENEFITS_INVALID_CONTEXT");
  }
  private pairedSpendDevice(input: CompanionSpendScope): boolean {
    return Boolean(this.database.prepare(`SELECT 1 FROM android_devices d JOIN android_local_credentials c ON c.device_id = d.device_id
      WHERE d.id = ? AND d.device_id = ? AND d.is_active = 1 AND COALESCE(d.revoked_at, '') = '' AND c.revoked_at = ''`)
      .get(input.recordId, input.deviceId));
  }
  companionPointSpendGrantStatus(input: CompanionSpendScope): boolean {
    const businessId = this.business();
    this.assertSpendScope(input);
    return this.pairedSpendDevice(input) && canSpendAndroidBenefits(this.database, businessId, input.deviceId, input.customerId);
  }
  changeCompanionPointSpendGrant(input: CompanionSpendScope & { confirmed: true }, grant: boolean): boolean {
    const businessId = this.business();
    benefitsAssert(input && input.confirmed === true && typeof grant === "boolean", "BENEFITS_INVALID_CONTEXT");
    this.assertSpendScope(input);
    if (grant) benefitsAssert(readBenefitsFamilies(this.database, businessId).points, "BENEFITS_POINTS_UNAVAILABLE");
    const owner = { assertAuthorized: () => { benefitsAssert(this.business() === businessId, "BENEFITS_STAFF_REQUIRED"); } };
    if (!grant) return revokeAndroidBenefitsSpend(this.database, owner, businessId, input.deviceId, input.customerId, input.recordId);
    return withCommerceBenefitsTransaction(this.database, this.now(), () => this.pairedSpendDevice(input)
      && grantAndroidBenefitsSpend(this.database, owner, businessId, input.deviceId, input.customerId, input.recordId));
  }
  private pointStore() {
    // Checkout/refund ports are intentionally closed until B2's canonical parent adapters.
    const closed = (): never => { throw new Error("BENEFITS_CHECKOUT_NOT_INTEGRATED"); };
    return new CommerceBenefitsStore(this.key(), { authorize: closed, resolvePricing: closed, readSettlement: closed, readFullRefund: closed,
      authorizePointAdjustment: (_database, businessId) => benefitsAssert(this.business() === businessId, "BENEFITS_STAFF_REQUIRED") });
  }
  private audit(tx: BenefitsTransaction, businessId: string, operationKey: string, intent: unknown, note: string): void {
    benefitsAssert(typeof note === "string" && note.trim().length >= 3 && note.length <= 500, "BENEFITS_ADJUSTMENT_REASON_REQUIRED");
    // Only explicit management fields enter this audit; never arbitrary renderer JSON or coupon secrets.
    const canonical = JSON.stringify(intent);
    const previous = tx.database.prepare("SELECT actor_id,intent_json FROM commerce_benefit_management_audit WHERE business_id = ? AND operation_key = ?")
      .get(businessId, operationKey) as { actor_id: string; intent_json: string } | undefined;
    if (previous) benefitsAssert(previous.actor_id === this.actor.id && previous.intent_json === canonical, "BENEFITS_IDEMPOTENCY_INTENT_CHANGED");
    else tx.database.prepare("INSERT INTO commerce_benefit_management_audit VALUES (?,?,?,?,?,?)")
      .run(businessId, operationKey, this.actor.id, canonical, note.trim(), tx.now);
  }
  adjustPoints(input: BenefitsPointAdjustmentInput) {
    const businessId = this.business();
    benefitsAssert(input && typeof input.customerId === "string", "BENEFITS_INVALID_ADJUSTMENT");
    const store = this.pointStore();
    const command = { businessId, customerId: input.customerId, currency: input.currency, amountMinor: input.amountMinor,
      expiresAt: input.expiresAt, reason: input.reason, operationKey: input.operationKey };
    return withCommerceBenefitsTransaction(this.database, this.now(), tx => {
      this.audit(tx, businessId, input.operationKey, { ...command, note: input.note }, input.note);
      return store.adjustPoints(tx, command);
    });
  }
  expirePoints(input: { customerId: string; currency: string; operationKey: string; note: string }) {
    const businessId = this.business();
    benefitsAssert(input && typeof input.customerId === "string", "BENEFITS_INVALID_CONTEXT");
    const store = this.pointStore();
    return withCommerceBenefitsTransaction(this.database, this.now(), tx => {
      this.audit(tx, businessId, input.operationKey, { customerId: input.customerId, currency: input.currency, note: input.note }, input.note);
      return store.expirePoints(tx, businessId, input.customerId, input.currency, input.operationKey);
    });
  }
}

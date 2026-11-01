import type {
  BenefitsAdjustment, BenefitsPricingContext, BenefitsQuote, BenefitsRule
} from "@yardimci-asistan/shared";

export class CommerceBenefitsError extends Error {
  constructor(readonly code: string) { super(code); this.name = "CommerceBenefitsError"; }
}
export function benefitsAssert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new CommerceBenefitsError(code);
}
export function minor(value: number): number {
  benefitsAssert(Number.isSafeInteger(value) && value >= 0, "BENEFITS_INVALID_AMOUNT");
  return value;
}
function safe(value: bigint): number {
  benefitsAssert(value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER), "BENEFITS_AMOUNT_OVERFLOW");
  return Number(value);
}
export function roundedRatio(value: number, numerator: number, denominator: number): number {
  minor(value); minor(numerator); minor(denominator);
  benefitsAssert(denominator > 0, "BENEFITS_INVALID_RATIO");
  return safe((BigInt(value) * BigInt(numerator) + BigInt(Math.floor(denominator / 2))) / BigInt(denominator));
}
function sum(values: readonly number[]): number {
  return safe(values.reduce((total, value) => total + BigInt(minor(value)), 0n));
}
function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string" && item.length > 0 && item.length <= 128)
    && new Set(value).size === value.length;
}
function exactKeys(value: object, keys: string) {
  benefitsAssert(Object.keys(value).sort().join(",") === keys.split(" ").sort().join(","), "BENEFITS_INVALID_RULE");
}
/** Strict canonical JSON validator; unknown properties and implicit financial policies fail closed. */
export function validateBenefitsRule(value: unknown): BenefitsRule {
  benefitsAssert(value && typeof value === "object" && !Array.isArray(value), "BENEFITS_INVALID_RULE");
  exactKeys(value, "schemaVersion id version family status currency startsAt endsAt priority scope minSpendMinor maxBenefitMinor percentBps fixedMinor allowCouponStacking combinesWith paymentMethodIds points");
  const rule = value as BenefitsRule;
  benefitsAssert(rule.schemaVersion === 1 && typeof rule.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(rule.id), "BENEFITS_INVALID_RULE");
  benefitsAssert(Number.isSafeInteger(rule.version) && rule.version > 0, "BENEFITS_INVALID_RULE");
  benefitsAssert(["coupon", "points", "payment_modifier"].includes(rule.family) && ["draft", "active", "disabled"].includes(rule.status), "BENEFITS_INVALID_RULE");
  benefitsAssert(typeof rule.currency === "string" && /^[A-Z]{3}$/.test(rule.currency), "BENEFITS_INVALID_CURRENCY");
  minor(rule.startsAt);
  if (rule.endsAt !== null) benefitsAssert(minor(rule.endsAt) > rule.startsAt, "BENEFITS_INVALID_RULE");
  benefitsAssert(Number.isSafeInteger(rule.priority), "BENEFITS_INVALID_RULE");
  minor(rule.minSpendMinor); minor(rule.fixedMinor); minor(rule.percentBps);
  benefitsAssert(rule.percentBps <= 10000, "BENEFITS_INVALID_RULE");
  if (rule.maxBenefitMinor !== null) minor(rule.maxBenefitMinor);
  benefitsAssert(typeof rule.allowCouponStacking === "boolean" && stringList(rule.combinesWith)
    && rule.combinesWith.every(family => ["coupon", "points", "payment_modifier"].includes(family)), "BENEFITS_INVALID_RULE");
  benefitsAssert(rule.scope && typeof rule.scope === "object", "BENEFITS_INVALID_RULE");
  exactKeys(rule.scope, "channels customerIds customerGroups priceGroups productIds categoryIds excludedProductIds excludedCategoryIds");
  benefitsAssert(Object.values(rule.scope).every(stringList), "BENEFITS_INVALID_RULE");
  benefitsAssert(rule.scope.channels.length > 0 && rule.scope.channels.every(channel =>
    ["desktop_cart", "desktop_desk", "web", "web_dealer", "companion"].includes(channel)), "BENEFITS_INVALID_RULE");
  benefitsAssert(rule.scope.priceGroups.every(group => ["retail", "dealer_a", "dealer_b"].includes(group)), "BENEFITS_INVALID_RULE");
  benefitsAssert(stringList(rule.paymentMethodIds), "BENEFITS_INVALID_RULE");
  benefitsAssert(rule.family === "payment_modifier" ? rule.paymentMethodIds.length > 0 : rule.paymentMethodIds.length === 0, "BENEFITS_INVALID_RULE");
  if (rule.family === "points") {
    benefitsAssert(rule.points && typeof rule.points === "object", "BENEFITS_INVALID_RULE");
    exactKeys(rule.points, "operation earnBase expiryDays");
    benefitsAssert(["earn", "redeem"].includes(rule.points.operation)
      && ["after_discounts", "after_points"].includes(rule.points.earnBase), "BENEFITS_INVALID_RULE");
    if (rule.points.expiryDays !== null) benefitsAssert(Number.isSafeInteger(rule.points.expiryDays)
      && rule.points.expiryDays > 0 && rule.points.expiryDays <= 36500, "BENEFITS_INVALID_RULE");
  } else benefitsAssert(rule.points === null, "BENEFITS_INVALID_RULE");
  return rule;
}

export function benefitsRuleMatches(rule: BenefitsRule, context: BenefitsPricingContext): boolean {
  return context.families[rule.family] && rule.status === "active" && rule.currency === context.currency
    && context.now >= rule.startsAt && (rule.endsAt === null || context.now < rule.endsAt)
    && rule.scope.channels.includes(context.channel)
    && (!rule.scope.customerIds.length || (!!context.customerId && rule.scope.customerIds.includes(context.customerId)))
    && (!rule.scope.customerGroups.length || rule.scope.customerGroups.some(group => context.customerGroups.includes(group)))
    && (!rule.scope.priceGroups.length || rule.scope.priceGroups.includes(context.priceGroup));
}

/** No I/O, clock, randomness, floating money, tax inference or price-group resolution. */
export function calculateCommerceBenefits(context: BenefitsPricingContext, inputRules: readonly BenefitsRule[]): BenefitsQuote {
  minor(context.now); minor(context.requestedPointsMinor); minor(context.availablePointsMinor);
  benefitsAssert(/^[A-Z]{3}$/.test(context.currency) && Number.isSafeInteger(context.currencyExponent)
    && context.currencyExponent >= 0 && context.currencyExponent <= 4, "BENEFITS_INVALID_CURRENCY");
  benefitsAssert(["desktop_cart", "desktop_desk", "web", "web_dealer", "companion"].includes(context.channel)
    && ["retail", "dealer_a", "dealer_b"].includes(context.priceGroup), "BENEFITS_INVALID_CONTEXT");
  benefitsAssert(Object.keys(context.families).sort().join(",") === "coupon,payment_modifier,points" && Object.values(context.families).every(value => typeof value === "boolean"), "BENEFITS_INVALID_CONTEXT");
  benefitsAssert(new Set(context.lines.map(line => line.id)).size === context.lines.length, "BENEFITS_DUPLICATE_LINE");
  const lines = [...context.lines].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(line => {
    benefitsAssert(line.id.length > 0 && line.productId.length > 0 && minor(line.quantityTenThousandths) > 0, "BENEFITS_INVALID_LINE");
    return { ...line, remaining: roundedRatio(line.unitPriceMinor, line.quantityTenThousandths, 10000) };
  });
  const subtotalMinor = sum(lines.map(line => line.remaining));
  const selected = inputRules.map(validateBenefitsRule).sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  benefitsAssert(new Set(selected.map(rule => rule.id)).size === selected.length, "BENEFITS_DUPLICATE_RULE");
  // Coupon rules are an explicit, already secret-authorized selection. Reject invalid ones.
  const coupons = selected.filter(rule => rule.family === "coupon");
  for (const rule of coupons) benefitsAssert(benefitsRuleMatches(rule, context), "BENEFITS_COUPON_UNAVAILABLE");
  benefitsAssert(coupons.length <= 1 || coupons.every(rule => rule.allowCouponStacking), "BENEFITS_COUPON_STACKING");
  const eligible = (rule: BenefitsRule) => lines.filter(line =>
    (!rule.scope.productIds.length || rule.scope.productIds.includes(line.productId))
    && (!rule.scope.categoryIds.length || rule.scope.categoryIds.includes(line.categoryId))
    && !rule.scope.excludedProductIds.includes(line.productId)
    && !rule.scope.excludedCategoryIds.includes(line.categoryId));
  const used: BenefitsRule[] = [];
  const adjustments: BenefitsAdjustment[] = [];
  const compatible = (rule: BenefitsRule) => used.every(previous => previous.family === rule.family
    || (previous.combinesWith.includes(rule.family) && rule.combinesWith.includes(previous.family)));
  const amountFor = (rule: BenefitsRule, base: number) => Math.min(base, rule.maxBenefitMinor ?? base,
    sum([roundedRatio(base, rule.percentBps, 10000), rule.fixedMinor]));
  // Largest-remainder allocation, stable line-id tie break; scopes share the remaining item base.
  const allocate = (targets: typeof lines, amount: number) => {
    const base = sum(targets.map(line => line.remaining));
    if (!base || !amount) return;
    const parts = targets.map(line => ({ line, amount: safe(BigInt(amount) * BigInt(line.remaining) / BigInt(base)),
      remainder: BigInt(amount) * BigInt(line.remaining) % BigInt(base) }));
    let residual = amount - sum(parts.map(part => part.amount));
    parts.sort((a, b) => a.remainder === b.remainder ? (a.line.id < b.line.id ? -1 : 1) : a.remainder > b.remainder ? -1 : 1);
    for (const part of parts) { if (residual > 0) { part.amount++; residual--; } part.line.remaining -= part.amount; }
  };
  const discount = (rule: BenefitsRule) => {
    const targets = eligible(rule);
    const base = sum(targets.map(line => line.remaining));
    if (base < rule.minSpendMinor || !base) {
      benefitsAssert(rule.family !== "coupon", "BENEFITS_COUPON_THRESHOLD"); return;
    }
    benefitsAssert(compatible(rule), "BENEFITS_COMBINATION_FORBIDDEN");
    const amount = amountFor(rule, base);
    adjustments.push({ ruleId: rule.id, ruleVersion: rule.version, family: rule.family, operation: "discount", baseMinor: base, amountMinor: amount });
    used.push(rule); allocate(targets, amount);
  };
  coupons.forEach(discount);
  const matching = selected.filter(rule => benefitsRuleMatches(rule, context));
  const payment = context.payment?.confirmed ? matching.find(rule => rule.family === "payment_modifier"
    && rule.paymentMethodIds.includes(context.payment!.methodId)) : undefined;
  if (payment) discount(payment);
  const discountMinor = subtotalMinor - sum(lines.map(line => line.remaining));
  const accounting = context.accounting;
  minor(accounting.taxMinor);
  benefitsAssert(["included_in_items", "added_explicitly"].includes(accounting.taxTreatment)
    && (accounting.taxTreatment !== "included_in_items" || accounting.taxMinor === 0)
    && Number.isSafeInteger(accounting.financeMinor) && typeof accounting.earnOnAccountingAdjustments === "boolean", "BENEFITS_INVALID_ACCOUNTING");
  const accountingBig = BigInt(accounting.taxMinor) + BigInt(accounting.financeMinor);
  benefitsAssert(accountingBig >= -BigInt(Number.MAX_SAFE_INTEGER) && accountingBig <= BigInt(Number.MAX_SAFE_INTEGER), "BENEFITS_AMOUNT_OVERFLOW");
  const beforePoints = safe(BigInt(subtotalMinor - discountMinor) + accountingBig);
  let pointsTenderMinor = 0;
  const redeem = matching.find(rule => rule.family === "points" && rule.points?.operation === "redeem");
  if (context.requestedPointsMinor) {
    benefitsAssert(context.customerId && redeem && compatible(redeem), "BENEFITS_POINTS_UNAVAILABLE");
    const targets = eligible(redeem);
    const base = sum(targets.map(line => line.remaining));
    benefitsAssert(base >= redeem.minSpendMinor && context.requestedPointsMinor <= context.availablePointsMinor
      && context.requestedPointsMinor <= Math.min(beforePoints, amountFor(redeem, base)), "BENEFITS_POINTS_INSUFFICIENT");
    pointsTenderMinor = context.requestedPointsMinor;
    adjustments.push({ ruleId: redeem.id, ruleVersion: redeem.version, family: "points", operation: "points_tender", baseMinor: base, amountMinor: pointsTenderMinor });
    used.push(redeem);
  }
  const earn = context.customerId ? matching.find(rule => rule.family === "points" && rule.points?.operation === "earn") : undefined;
  let pointsEarnPreviewMinor = 0;
  if (earn && compatible(earn)) {
    const targets = eligible(earn);
    let base = sum(targets.map(line => line.remaining));
    if (earn.points?.earnBase === "after_points") {
      if (redeem && pointsTenderMinor) allocate(eligible(redeem), pointsTenderMinor);
      base = sum(targets.map(line => line.remaining));
    }
    if (accounting.earnOnAccountingAdjustments) base = safe(BigInt(base) + accountingBig);
    if (base >= earn.minSpendMinor) {
      pointsEarnPreviewMinor = amountFor(earn, base);
      adjustments.push({ ruleId: earn.id, ruleVersion: earn.version, family: "points", operation: "earn_after_settlement", baseMinor: base, amountMinor: pointsEarnPreviewMinor });
    }
  }
  return { version: 1, currency: context.currency, currencyExponent: context.currencyExponent, subtotalMinor, discountMinor,
    accountingMinor: Number(accountingBig), pointsTenderMinor, payableMinor: beforePoints - pointsTenderMinor,
    pointsEarnPreviewMinor, adjustments };
}

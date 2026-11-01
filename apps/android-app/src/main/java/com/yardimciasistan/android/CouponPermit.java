package com.yardimciasistan.android;

import java.util.function.BooleanSupplier;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Short-lived server-issued coupon permit plus its advisory quote. The plaintext
 * coupon code is never copied here, never persisted and never sent in the sale
 * action; only the opaque permit id leaves the preauthorization response.
 */
final class CouponPermit {
  private static final String UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  // Paired phone clocks can lag the desktop slightly; allow parsing with bounded skew,
  // but expire locally five seconds BEFORE the server deadline (never after it).
  private static final long CLOCK_SKEW_GUARD_MS = 5000L;

  private final String permitId, actionId, customer, payment, currency, scopeFingerprint;
  private final long subtotalMinor, discountMinor, payableMinor, expiresAtMs;
  private final BooleanSupplier current;

  CouponPermit(JSONObject raw, String actionId, String customer, String payment, String expectedCurrency,
      JSONArray lines, BooleanSupplier current) {
    if (raw == null || current == null || actionId == null || !actionId.matches("[A-Za-z0-9_-]{8,120}")
        || customer == null || customer.isEmpty() || !"cash".equals(payment)
        || raw.length() != 6) throw new IllegalArgumentException();
    Object permit = raw.opt("permitId"), currencyValue = raw.opt("currency");
    long subtotal = minor(raw.opt("subtotalMinor")), discount = minor(raw.opt("discountMinor"));
    long payable = minor(raw.opt("payableMinor")), expires = minor(raw.opt("expiresAtMs"));
    long now = System.currentTimeMillis();
    if (!(permit instanceof String) || !((String) permit).matches(UUID)
        || !(currencyValue instanceof String) || !((String) currencyValue).matches("[A-Z]{3}")
        || !((String) currencyValue).equals(expectedCurrency)
        || subtotal < 0 || discount <= 0 || payable < 0 || subtotal != discount + payable
        || expires <= 0 || expires - now > 60000L + CLOCK_SKEW_GUARD_MS) throw new IllegalArgumentException();
    String scope = MarketSalePreviewGuard.fingerprint(lines);
    if (scope == null) throw new IllegalArgumentException();
    this.permitId = (String) permit;
    this.actionId = actionId;
    this.customer = customer;
    this.payment = payment;
    this.currency = (String) currencyValue;
    this.subtotalMinor = subtotal;
    this.discountMinor = discount;
    this.payableMinor = payable;
    this.expiresAtMs = expires;
    this.scopeFingerprint = scope;
    this.current = current;
  }

  private static long minor(Object value) {
    if (!(value instanceof Integer || value instanceof Long) || ((Number) value).longValue() < 0
        || ((Number) value).longValue() > 9007199254740991L) return -1;
    return ((Number) value).longValue();
  }

  /** Re-checked immediately before the confirmation and again before submit. */
  boolean isCurrent() {
    return current.getAsBoolean() && System.currentTimeMillis() + CLOCK_SKEW_GUARD_MS < expiresAtMs;
  }

  /** Permit, customer, payment and current cart must all still describe the same sale. */
  boolean matches(String customerId, String paymentMethod, JSONArray lines, String cartCurrency) {
    return customer.equals(customerId) && payment.equals(paymentMethod) && currency.equals(cartCurrency)
        && scopeFingerprint.equals(MarketSalePreviewGuard.fingerprint(lines));
  }

  String permitId() { return permitId; }
  String actionId() { return actionId; }
  String currency() { return currency; }
  long subtotalMinor() { return subtotalMinor; }
  long discountMinor() { return discountMinor; }
  long payableMinor() { return payableMinor; }
  long expiresAtMs() { return expiresAtMs; }
}

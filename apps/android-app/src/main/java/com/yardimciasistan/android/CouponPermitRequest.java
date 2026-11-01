package com.yardimciasistan.android;

import org.json.JSONArray;

/**
 * Transient request scope for one Companion coupon preauthorization. The coupon
 * code and the preassigned action id live only in the current checkout memory;
 * this object is never persisted to ActionOutbox, preferences or logs.
 */
final class CouponPermitRequest {
  final String actionId, customer, payment, snapshotVersion, currency, couponCode;
  final long generation;
  private final String linesJson;

  CouponPermitRequest(String actionId, String customer, String payment, String snapshotVersion, long generation,
      String currency, JSONArray lines, String couponCode) {
    this.actionId = actionId == null ? "" : actionId;
    this.customer = customer == null ? "" : customer;
    this.payment = payment == null ? "" : payment;
    this.snapshotVersion = snapshotVersion == null ? "" : snapshotVersion;
    this.generation = generation;
    this.currency = currency == null ? "" : currency;
    this.couponCode = couponCode == null ? "" : couponCode;
    this.linesJson = lines == null ? "[]" : lines.toString();
  }

  JSONArray lines() {
    try { return new JSONArray(linesJson); }
    catch (Exception ignored) { return new JSONArray(); }
  }

  boolean isComplete() {
    return actionId.matches("[A-Za-z0-9_-]{8,120}") && !customer.isEmpty() && "cash".equals(payment)
        && !snapshotVersion.isEmpty() && currency.matches("[A-Z]{3}") && !couponCode.isEmpty()
        && couponCode.length() <= 256;
  }
}

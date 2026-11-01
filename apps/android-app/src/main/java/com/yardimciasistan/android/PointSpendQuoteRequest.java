package com.yardimciasistan.android;

import org.json.JSONArray;

/** Scope of one advisory point-spend quote request; never proof of authorization. */
final class PointSpendQuoteRequest {
  final String customer, payment, snapshotVersion, currency;
  final long generation;
  private final String linesJson;

  PointSpendQuoteRequest(String customer, String payment, String snapshotVersion, long generation,
      String currency, JSONArray lines) {
    this.customer = customer;
    this.payment = payment;
    this.snapshotVersion = snapshotVersion;
    this.generation = generation;
    this.currency = currency;
    this.linesJson = lines == null ? "[]" : lines.toString();
  }

  JSONArray lines() {
    try { return new JSONArray(linesJson); }
    catch (Exception ignored) { return new JSONArray(); }
  }
}

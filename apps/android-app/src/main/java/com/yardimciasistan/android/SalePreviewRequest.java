package com.yardimciasistan.android;

import org.json.JSONArray;

/** Immutable request scope, without pairing credentials or checkout authority. */
final class SalePreviewRequest {
  final String customer, payment, snapshotVersion;
  final long generation;
  private final String linesJson;

  SalePreviewRequest(String customer, String payment, String snapshotVersion, long generation, JSONArray lines) {
    this.customer = customer; this.payment = payment; this.snapshotVersion = snapshotVersion;
    this.generation = generation; this.linesJson = lines == null ? "[]" : lines.toString();
  }

  JSONArray lines() {
    try { return new JSONArray(linesJson); }
    catch (Exception ignored) { return new JSONArray(); }
  }
}

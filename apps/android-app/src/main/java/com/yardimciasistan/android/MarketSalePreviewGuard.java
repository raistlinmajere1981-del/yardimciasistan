package com.yardimciasistan.android;

import org.json.JSONArray;
import org.json.JSONObject;

/** Immutable comparison scope only; not a preview, reservation, or checkout authority. */
final class MarketSalePreviewGuard {
  private final PointPreviewGuard connection;
  private final String payment, snapshotVersion, lines;
  private final boolean validConnection;

  MarketSalePreviewGuard(ConnectionSettings.LocalConnection pairing, boolean localOnly, String target,
      String customer, String payment, String snapshotVersion, JSONArray lines, long generation) {
    this.connection = new PointPreviewGuard(pairing, localOnly, target, customer, generation);
    this.validConnection = PointPreviewGuard.available(pairing, true, true) && target != null && !target.isEmpty()
        && customer != null && !customer.isEmpty();
    this.payment = payment;
    this.snapshotVersion = snapshotVersion;
    this.lines = fingerprint(lines);
  }

  boolean matches(ConnectionSettings.LocalConnection pairing, boolean localOnly, String target,
      String customer, String payment, String snapshotVersion, JSONArray lines, long generation,
      boolean showing, boolean authorized) {
    String current = fingerprint(lines);
    return validConnection && this.payment != null && !this.payment.isEmpty() && this.payment.equals(payment)
        && this.snapshotVersion != null && !this.snapshotVersion.isEmpty() && this.snapshotVersion.equals(snapshotVersion)
        && this.lines != null && this.lines.equals(current) && customer != null && !customer.isEmpty()
        && connection.matches(pairing, localOnly, target, customer, generation, showing, authorized);
  }

  static String fingerprint(JSONArray lines) {
    if (lines == null || lines.length() == 0 || lines.length() > 200) return null;
    try {
      JSONArray normalized = new JSONArray();
      java.util.Set<String> ids = new java.util.HashSet<>();
      for (int i = 0; i < lines.length(); i++) {
        JSONObject line = lines.getJSONObject(i);
        Object idValue = line.opt("productId"), amount = line.opt("quantity");
        if (line.length() != 2 || !(idValue instanceof String) || !(amount instanceof Number)) return null;
        String id = (String) idValue;
        double quantity = ((Number) amount).doubleValue();
        if (id.isEmpty() || !id.equals(id.trim()) || id.length() > 128 || !ids.add(id)
            || !Double.isFinite(quantity) || quantity <= 0 || quantity > 1000000
            || Math.abs(quantity * 10000 - Math.rint(quantity * 10000)) > 0.00001) return null;
        normalized.put(new JSONArray().put(id).put(quantity));
      }
      return normalized.toString();
    } catch (Exception error) { return null; }
  }
}

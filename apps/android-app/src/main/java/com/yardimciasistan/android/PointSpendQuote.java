package com.yardimciasistan.android;

import java.util.HashSet;
import java.util.Set;
import java.util.function.BooleanSupplier;
import org.json.JSONArray;
import org.json.JSONObject;

/** Advisory live quote. Owner re-authorizes every spend; this object never authorizes a sale alone. */
final class PointSpendQuote {
  private final String quoteJson, quoteLinesJson;
  private final String currency, scopeFingerprint;
  private final long subtotalMinor, availablePointMinor, maxSpendableMinor, expiresAtMs;
  private final BooleanSupplier current;

  PointSpendQuote(JSONObject quote, BooleanSupplier current) {
    if (quote == null || current == null) throw new IllegalArgumentException();
    Object currencyValue = quote.opt("currency");
    long subtotal = minor(quote.opt("subtotalMinor")), available = minor(quote.opt("availablePointMinor"));
    long maximum = minor(quote.opt("maxSpendableMinor")), generated = minor(quote.opt("generatedAtMs"));
    long expires = minor(quote.opt("expiresAtMs"));
    JSONArray lines = quote.optJSONArray("lines");
    if (!(currencyValue instanceof String) || !((String) currencyValue).matches("[A-Z]{3}")
        || subtotal < 0 || available < 0 || maximum < 0 || generated <= 0 || expires <= 0
        || maximum > Math.min(available, subtotal) || expires <= generated || expires - generated > 30000L
        || generated > System.currentTimeMillis() + 60000L) throw new IllegalArgumentException();
    String lineScope = scopeFingerprint(lines, (String) currencyValue);
    if (lineScope == null) throw new IllegalArgumentException();
    this.quoteJson = quote.toString();
    this.quoteLinesJson = lines.toString();
    this.currency = (String) currencyValue;
    this.subtotalMinor = subtotal;
    this.availablePointMinor = available;
    this.maxSpendableMinor = maximum;
    this.expiresAtMs = expires;
    this.scopeFingerprint = lineScope;
    this.current = current;
  }

  private static long minor(Object value) {
    if (!(value instanceof Integer || value instanceof Long) || ((Number) value).longValue() < 0
        || ((Number) value).longValue() > 9007199254740991L) return -1;
    return ((Number) value).longValue();
  }

  /** Full 5-field owner lines become the 2-field cart scope the guard fingerprints. */
  private static String scopeFingerprint(JSONArray lines, String currency) {
    if (lines == null || lines.length() < 1 || lines.length() > 200) return null;
    try {
      JSONArray scope = new JSONArray();
      Set<String> ids = new HashSet<>();
      for (int i = 0; i < lines.length(); i++) {
        JSONObject line = lines.getJSONObject(i);
        Object idValue = line.opt("productId"), amount = line.opt("quantity"), price = line.opt("unitPriceMinor");
        Object updated = line.opt("updatedAt");
        if (line.length() != 5 || !(idValue instanceof String) || !(amount instanceof Number)
            || minor(price) < 0 || !currency.equals(line.opt("currency"))
            || !(updated instanceof String) || ((String) updated).trim().isEmpty()) return null;
        String id = (String) idValue;
        double quantity = ((Number) amount).doubleValue();
        if (id.isEmpty() || !id.equals(id.trim()) || id.length() > 128 || !ids.add(id)
            || !Double.isFinite(quantity) || quantity <= 0 || quantity > 1000000
            || Math.abs(quantity * 10000 - Math.rint(quantity * 10000)) > 0.00001) return null;
        scope.put(new JSONObject().put("productId", id).put("quantity", quantity));
      }
      return MarketSalePreviewGuard.fingerprint(scope);
    } catch (Exception error) { return null; }
  }

  /** Re-checked immediately before submitting; an expired quote is never reusable. */
  boolean isCurrent() {
    return current.getAsBoolean() && System.currentTimeMillis() < expiresAtMs;
  }

  /** Quote, live preview and current cart must agree before any point amount is sent. */
  boolean matches(JSONObject preview, JSONArray requestedLines, long requestedPointsMinor) {
    if (preview == null || requestedLines == null || requestedPointsMinor <= 0) return false;
    try {
      JSONArray quoteLines = new JSONArray(quoteLinesJson), previewLines = preview.optJSONArray("lines");
      if (preview.length() != 4 || !currency.equals(preview.opt("currency"))
          || minor(preview.opt("subtotalMinor")) != subtotalMinor
          || previewLines == null || previewLines.length() != quoteLines.length()) return false;
      for (int i = 0; i < quoteLines.length(); i++) {
        JSONObject quoteLine = quoteLines.getJSONObject(i), previewLine = previewLines.getJSONObject(i);
        Object previewQuantity = previewLine.opt("quantity"), quoteQuantity = quoteLine.opt("quantity");
        if (previewLine.length() != 5 || !quoteLine.opt("productId").equals(previewLine.opt("productId"))
            || !(previewQuantity instanceof Number) || !(quoteQuantity instanceof Number)
            || Double.compare(((Number) quoteQuantity).doubleValue(), ((Number) previewQuantity).doubleValue()) != 0
            || minor(previewLine.opt("unitPriceMinor")) != minor(quoteLine.opt("unitPriceMinor"))
            || !currency.equals(previewLine.opt("currency"))
            || !String.valueOf(quoteLine.opt("updatedAt")).equals(String.valueOf(previewLine.opt("updatedAt"))))
          return false;
      }
      return scopeFingerprint.equals(MarketSalePreviewGuard.fingerprint(requestedLines))
          && requestedPointsMinor <= maxSpendableMinor && requestedPointsMinor <= subtotalMinor;
    } catch (Exception error) { return false; }
  }

  long subtotalMinor() { return subtotalMinor; }
  long availablePointMinor() { return availablePointMinor; }
  long maxSpendableMinor() { return maxSpendableMinor; }
  long expiresAtMs() { return expiresAtMs; }
  String currency() { return currency; }
  String linesFingerprint() { return scopeFingerprint; }

  JSONObject raw() {
    try { return new JSONObject(quoteJson); }
    catch (Exception error) { throw new IllegalStateException(error); }
  }
}

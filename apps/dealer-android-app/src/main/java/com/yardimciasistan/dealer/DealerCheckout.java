package com.yardimciasistan.dealer;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Dealer V2 review contract. Pricing, shipping and legal terms always originate
 * from the authenticated server; this class checks, displays and freezes them.
 * It never computes or authorizes an order total locally.
 */
final class DealerCheckout {
  private DealerCheckout() {}

  static JSONObject verifiedQuote(JSONObject response, JSONObject draft) throws Exception {
    if (!response.optBoolean("ok")) throw new IllegalArgumentException("Sunucu sipariş özeti doğrulanamadı.");
    JSONObject quote = response.optJSONObject("quote");
    if (quote == null || quote.optInt("version", -1) != 3
        || quote.optInt("minor_unit", -1) != 2
        || !"bank_transfer".equals(quote.optString("payment_method"))
        || !quote.optString("quote_id").matches("[a-f0-9]{64}")
        || !quote.optString("currency").matches("TRY|EUR|USD|GBP")
        || !draft.getJSONObject("delivery").getString("method").equals(quote.optString("delivery_method"))) {
      throw new IllegalArgumentException("Sunucu sipariş teklifi geçersiz. Güncelleyip yeniden deneyin.");
    }
    long subtotal = minor(quote, "subtotal_minor"), delivery = minor(quote, "delivery_fee_minor");
    long total = minor(quote, "total_minor");
    if (total <= 0 || Math.addExact(subtotal, delivery) != total) {
      throw new IllegalArgumentException("Sipariş toplamı doğrulanamadı.");
    }
    JSONObject bank = quote.optJSONObject("bank"), legal = quote.optJSONObject("legal");
    if (bank == null || legal == null) throw new IllegalArgumentException("Banka veya sözleşme bilgisi bulunamadı.");
    for (String key : new String[]{"name","accountHolder","iban"}) required(bank,key);
    for (String key : new String[]{"version","preliminary","agreement"}) required(legal,key);
    if (quote.has("demo") || !validIban(bank.getString("iban"))) {
      throw new IllegalArgumentException("Banka hesap bilgisi geçersiz.");
    }
    JSONArray lines = quote.optJSONArray("items"), requested = draft.getJSONArray("items");
    if (lines == null || lines.length() != requested.length() || lines.length() == 0) {
      throw new IllegalArgumentException("Sipariş satırları değişti. Kataloğu yenileyin.");
    }
    Set<String> seen = new HashSet<>();
    for (int i = 0; i < requested.length(); i++) {
      JSONObject a = requested.getJSONObject(i), b = lines.getJSONObject(i);
      String id = a.getString("productId");
      if (!seen.add(id) || !id.equals(b.optString("product_id"))
          || new BigDecimal(a.get("quantity").toString()).compareTo(new BigDecimal(b.get("quantity").toString())) != 0
          || minor(b, "unit_price_minor") < 0 || minor(b, "line_total_minor") < 0) {
        throw new IllegalArgumentException("Sipariş ürünleri sunucu özetiyle eşleşmiyor.");
      }
    }
    return new JSONObject(quote.toString());
  }

  /**
   * UI-only comparison at order review. The quote remains the sole authority:
   * local catalog prices are not written back to the quote or sent in the order.
   * Ignore delivery fees; only changed product prices merit a price warning.
   */
  static boolean displayedPricesDiffer(JSONObject quote, DealerState state) throws Exception {
    String currency = quote.getString("currency");
    JSONArray lines = quote.getJSONArray("items");
    for (int i = 0; i < lines.length(); i++) {
      JSONObject line = lines.getJSONObject(i);
      JSONObject cached = state.product(line.getString("product_id"));
      if (cached == null || !currency.equals(cached.optString("currency"))) return true;
      long displayedMinor = new BigDecimal(cached.get("price").toString())
          .movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
      if (displayedMinor != line.getLong("unit_price_minor")) return true;
    }
    return false;
  }

  private static boolean validIban(String value) {
    String iban = value.replace(" ", "").toUpperCase(java.util.Locale.ROOT);
    if (!iban.matches("[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}")) return false;
    String rearranged = iban.substring(4) + iban.substring(0, 4);
    int remainder = 0;
    for (int i = 0; i < rearranged.length(); i++) {
      char c = rearranged.charAt(i);
      String digits = c >= 'A' && c <= 'Z' ? Integer.toString(c - 'A' + 10) : Character.toString(c);
      for (int j = 0; j < digits.length(); j++) remainder = (remainder * 10 + digits.charAt(j) - '0') % 97;
    }
    return remainder == 1;
  }

  private static String required(JSONObject object, String key) throws Exception {
    String text = object.optString(key, "").trim();
    if (text.isEmpty() || text.length() > 20000) throw new IllegalArgumentException("Sipariş koşulları eksik.");
    return text;
  }

  private static long minor(JSONObject object, String key) throws Exception {
    Object value = object.opt(key);
    if (!(value instanceof Number)) throw new IllegalArgumentException("Sipariş tutarı geçersiz.");
    BigDecimal n = new BigDecimal(value.toString());
    long result = n.longValueExact();
    if (result < 0 || result > 900000000000L) throw new IllegalArgumentException("Sipariş tutarı geçersiz.");
    return result;
  }

  static JSONObject approvedRequest(JSONObject draft, JSONObject quote, boolean preliminary, boolean agreement,
                                    boolean marketing) throws Exception {
    if (!preliminary || !agreement) throw new IllegalArgumentException("Ön bilgilendirme ve satış sözleşmesini kabul edin.");
    verifiedQuote(new JSONObject().put("ok", true).put("quote", quote), draft);
    return new JSONObject(draft.toString())
        .put("idempotencyKey", UUID.randomUUID().toString())
        .put("paymentMethod", "bank_transfer")
        .put("quoteId", quote.getString("quote_id"))
        .put("consent", new JSONObject().put("preliminary", true).put("agreement", true).put("marketing", marketing));
  }
}

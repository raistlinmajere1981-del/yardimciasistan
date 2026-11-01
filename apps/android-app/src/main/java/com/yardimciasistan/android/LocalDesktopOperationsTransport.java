package com.yardimciasistan.android;

import android.content.SharedPreferences;

import org.json.JSONObject;
import org.json.JSONArray;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import javax.net.ssl.SSLException;
import java.nio.charset.StandardCharsets;

final class LocalDesktopOperationsTransport implements AndroidOperationsTransport {
  private static final int CONNECT_TIMEOUT_MS = 900;
  private static final int READ_TIMEOUT_MS = 2200;

  interface ConnectionFactory extends LocalPinnedHttps.ConnectionFactory {}
  private final ConnectionFactory connections;
  private final String desktopId;
  private final SharedPreferences preferences;
  private final String expectedPin;

  static final class PointBalance {
    final long availableMinor;
    final long generatedAtMs;
    PointBalance(long availableMinor, long generatedAtMs) {
      this.availableMinor = availableMinor;
      this.generatedAtMs = generatedAtMs;
    }
  }

  LocalDesktopOperationsTransport(SharedPreferences preferences, String desktopId) {
    this(preferences, desktopId, LocalPinnedHttps.CONNECTIONS::open);
  }

  LocalDesktopOperationsTransport(SharedPreferences preferences, String desktopId, ConnectionFactory connections) {
    this.desktopId = desktopId == null ? "" : desktopId.trim();
    this.preferences = preferences;
    this.expectedPin = ConnectionSettings.localConnection(preferences).spkiSha256;
    this.connections = connections;
  }

  @Override
  public String preferredSourceKey(String baseUrl, String credential) {
    return CompanionConnectionIdentity.localSourceKey(desktopId);
  }

  @Override
  public FetchResult fetchOperations(
      String baseUrl,
      String credential,
      DeviceIdentity identity,
      long knownServerRevision
  ) throws TransportException {
    JSONObject request = new JSONObject();
    try {
      request.put("known_server_revision", Math.max(0L, knownServerRevision));
      request.put("device_name", identity.deviceName);
      request.put("app_version", identity.appVersion);
    } catch (Exception error) {
      throw new TransportException("Yerel güncelleme isteği hazırlanamadı.", error);
    }

    JSONObject response = post(
        endpoint(baseUrl, LocalCompanionProtocol.SUMMARY_PATH),
        credential,
        identity,
        request, false
    );
    long revision = Math.max(0L, response.optLong("server_revision", 0L));
    String sourceKey = preferredSourceKey(baseUrl, credential);
    if (response.optBoolean("not_modified", false)) {
      return new FetchResult(true, revision, null, response, sourceKey);
    }
    return new FetchResult(
        false,
        revision,
        OperationData.fromJson(response, identity.deviceId),
        response,
        sourceKey
    );
  }

  @Override
  public OperationData.ActionRecord enqueueAction(
      String baseUrl,
      String credential,
      DeviceIdentity identity,
      String actionId,
      String actionType,
      JSONObject actionPayload
  ) throws TransportException {
    JSONObject request = new JSONObject();
    try {
      request.put("id", actionId);
      request.put("action_type", actionType);
      request.put("payload", actionPayload);
      request.put("device_name", identity.deviceName);
      request.put("app_version", identity.appVersion);
      request.put("created_at", new java.util.Date().toInstant().toString());
    } catch (Exception error) {
      throw new TransportException("Yerel işlem isteği hazırlanamadı.", error);
    }

    JSONObject response = post(
        endpoint(baseUrl, LocalCompanionProtocol.ACTION_PATH),
        credential,
        identity,
        request, true
    );
    String status = response.optString("status", "").trim();
    String message = response.optString("message", "").trim();
    if (!"applied".equals(status)) {
      throw new TransportException(
          message.isEmpty() ? "Masaüstü yerel işlemi reddetti." : message,
          "local_action_rejected",
          409,
          null
      );
    }

    // An applied market sale without a genuine receipt is NOT delivery proof. This
    // is especially critical for a positive points tender: dequeuing it here would
    // silently destroy the customer's Puan without desktop-side settlement proof.
    // Keep the action queued and let a later sync resolve the unknown outcome.
    if ("market_sale_complete".equals(actionType)) {
      if (!(response.opt("sale_receipt") instanceof JSONObject)) {
        throw new TransportException(
            "Yerel satış makbuzu doğrulanamadı; bekleyen işlem korunuyor.",
            "local_delivery_unknown",
            0,
            null
        );
      }
      validateSaleReceipt(response, actionId, actionPayload, credential, baseUrl);
      verifyCurrentSaleBusiness(response, actionId, actionPayload, credential, baseUrl, identity);
    }

    try {
      JSONObject action = new JSONObject();
      action.put("id", actionId);
      action.put("action_type", actionType);
      action.put("status", "applied");
      action.put("error_message", "");
      action.put("payload", actionPayload);
      action.put("created_at", request.optString("created_at", ""));
      action.put("processed_at", new java.util.Date().toInstant().toString());
      return OperationData.ActionRecord.fromJson(action);
    } catch (Exception error) {
      throw new TransportException("Yerel işlem sonucu okunamadı.", error);
    }
  }

  /** A fresh paired summary is an identity check, not a payment authorization. */
  private void verifyCurrentSaleBusiness(JSONObject response, String actionId, JSONObject intent, String credential,
      String baseUrl, DeviceIdentity identity) throws TransportException {
    try {
      JSONObject request = new JSONObject().put("known_server_revision", 0);
      JSONObject summary = post(endpoint(baseUrl, LocalCompanionProtocol.SUMMARY_PATH), credential, identity, request, false);
      if (!desktopId.equals(summary.opt("desktop_id")) || !Boolean.FALSE.equals(summary.opt("approval_required"))
          || (summary.has("not_modified") && !Boolean.FALSE.equals(summary.opt("not_modified"))) || !validReceiptId(summary.opt("business_id"))
          || !summary.opt("business_id").equals(response.getJSONObject("sale_receipt").opt("businessId"))) throw new IllegalArgumentException();
      // Pairing may have changed while the fresh response was in flight.
      validateSaleReceipt(response, actionId, intent, credential, baseUrl);
    } catch (Exception error) {
      throw new TransportException("Yerel satış sonucu doğrulanamadı; bekleyen işlem korunuyor.", "local_delivery_unknown", 0, null);
    }
  }

  /** Validate only in memory; never attach the receipt to the persisted ActionRecord. */
  private void validateSaleReceipt(JSONObject response, String actionId, JSONObject intent, String credential, String baseUrl) throws TransportException {
    try {
      ConnectionSettings.LocalConnection pairing = ConnectionSettings.localConnection(preferences);
      if (!pairing.isComplete() || !desktopId.equals(pairing.desktopId) || !expectedPin.equals(pairing.spkiSha256)
          || !pairing.localToken.equals(credential) || !endpoint(baseUrl, LocalCompanionProtocol.ACTION_PATH).equals(pairing.baseUrl + LocalCompanionProtocol.ACTION_PATH)
          || !pairing.targetKey.equals(CompanionConnectionIdentity.actionTargetKey(preferences, ConnectionSettings.webModuleUrl(preferences)))) throw new IllegalArgumentException();
      if (!(response.opt("action_id") instanceof String) || !actionId.equals(response.opt("action_id"))
          || !(response.opt("sale_receipt") instanceof JSONObject)) throw new IllegalArgumentException();
      validateSaleReceiptFacts(response, actionId, intent);
    } catch (Exception error) {
      throw new TransportException("Yerel satış sonucu doğrulanamadı; bekleyen işlem korunuyor.", "local_delivery_unknown", 0, null);
    }
  }

  /**
   * Receipt shape/amount verification without transport credentials. A coupon
   * action may ONLY accept the nine-field discounted receipt; the historical
   * eight-field noncoupon receipt keeps its exact previous validation.
   */
  static void validateSaleReceiptFacts(JSONObject response, String actionId, JSONObject intent) throws org.json.JSONException {
    if (response == null || intent == null || actionId == null || !(response.opt("action_id") instanceof String)
        || !actionId.equals(response.opt("action_id")) || !(response.opt("sale_receipt") instanceof JSONObject))
      throw new IllegalArgumentException();
    JSONObject receipt = response.getJSONObject("sale_receipt");
    boolean coupon = intent.has("couponPermitId");
    if (coupon && (!(intent.opt("couponPermitId") instanceof String)
        || !((String) intent.opt("couponPermitId")).matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")))
      throw new IllegalArgumentException();
    if (receipt.length() != (coupon ? 9 : 8) || !validReceiptId(receipt.opt("saleId"))
        || !validReceiptId(receipt.opt("businessId"))
        || !"android-market-sale".equals(receipt.opt("source")) || !safeMinor(receipt.opt("cashPaidMinor"))
        || !safeMinor(receipt.opt("pointsTenderMinor"))
        || !(receipt.opt("currency") instanceof String) || !receipt.getString("currency").matches("[A-Z]{3}"))
      throw new IllegalArgumentException();
    Object customer = receipt.opt("customerId");
    String expectedCustomer = intent.optString("customer_id", "");
    if (expectedCustomer.isEmpty() ? customer != JSONObject.NULL : !expectedCustomer.equals(customer))
      throw new IllegalArgumentException();
    String settlement = intent.optString("settlement", ""), method = intent.optString("payment_method", "");
    if (!(receipt.opt("paymentMethod") instanceof String) || !method.equals(receipt.opt("paymentMethod"))
        || !("paid".equals(settlement) && ("cash".equals(method) || "card".equals(method) || "bank".equals(method) || "other".equals(method))
        || "credit".equals(settlement) && method.isEmpty() && receipt.getLong("cashPaidMinor") == 0 && !expectedCustomer.isEmpty()))
      throw new IllegalArgumentException();
    long pointsTender = receipt.getLong("pointsTenderMinor");
    if (coupon) {
      // Coupon = customer-linked paid cash, zero points and a real discount.
      // A full-price receipt for a coupon action must never look delivered.
      long discount = safeMinor(receipt.opt("discountMinor")) ? receipt.getLong("discountMinor") : -1;
      long subtotal = receiptSubtotalMinor(intent);
      long cash = receipt.getLong("cashPaidMinor");
      if (!"paid".equals(settlement) || !"cash".equals(method) || expectedCustomer.isEmpty()
          || pointsTender != 0 || discount <= 0 || subtotal < 0 || cash < 0
          || (subtotal - discount) != cash) throw new IllegalArgumentException();
    } else {
      // A positive points tender is authoritative only when it equals the exact
      // amount the user selected in this intent. Absent/zero intent can never
      // accept a forged positive receipt; a positive intent can never accept a
      // cash-only or different-amount receipt and be treated as delivered.
      Object requested = intent.opt("requestedPointsMinor");
      if (requested == null || JSONObject.NULL.equals(requested)) {
        if (pointsTender != 0) throw new IllegalArgumentException();
      } else {
        if (!(requested instanceof Integer || requested instanceof Long)) throw new IllegalArgumentException();
        long requestedPoints = ((Number) requested).longValue();
        if (requestedPoints <= 0 || requestedPoints > 9007199254740991L || pointsTender != requestedPoints
            || !"paid".equals(settlement) || expectedCustomer.isEmpty() || receipt.getLong("cashPaidMinor") < 0)
          throw new IllegalArgumentException();
      }
    }
    JSONArray lines = intent.optJSONArray("lines");
    if (lines == null || lines.length() == 0) throw new IllegalArgumentException();
    for (int i = 0; i < lines.length(); i++) {
      JSONObject line = lines.optJSONObject(i);
      if (line == null || !receipt.getString("currency").equals(line.opt("expected_currency")))
        throw new IllegalArgumentException();
    }
  }

  private static long receiptSubtotalMinor(JSONObject intent) {
    JSONArray lines = intent.optJSONArray("lines");
    if (lines == null || lines.length() == 0 || lines.length() > 200) return -1;
    long total = 0;
    for (int i = 0; i < lines.length(); i++) {
      JSONObject line = lines.optJSONObject(i);
      Object priceValue = line == null ? null : line.opt("expected_unit_price");
      Object quantityValue = line == null ? null : line.opt("quantity");
      if (!(priceValue instanceof Number) || !(quantityValue instanceof Number)) return -1;
      double price = ((Number) priceValue).doubleValue(), quantity = ((Number) quantityValue).doubleValue();
      if (!Double.isFinite(price) || price < 0 || !Double.isFinite(quantity) || quantity <= 0 || quantity > 1000000)
        return -1;
      double lineMinor = Math.floor((price * quantity + Math.ulp(1.0)) * 100.0 + 0.5);
      if (!Double.isFinite(lineMinor) || lineMinor < 0 || lineMinor > 9007199254740991L
          || total > 9007199254740991L - (long) lineMinor) return -1;
      total += (long) lineMinor;
    }
    return total;
  }

  private static boolean validReceiptId(Object value) {
    if (!(value instanceof String)) return false;
    String id = (String) value;
    return !id.isEmpty() && id.length() <= 128 && id.equals(id.trim());
  }

  /** Live, on-demand projection only; never persisted or queued as spending authority. */
  PointBalance fetchPointBalance(String baseUrl, String credential, DeviceIdentity identity,
      String customerId, String currency) throws TransportException {
    if (identity == null || customerId == null || customerId.isEmpty() || customerId.length() > 128
        || !customerId.equals(customerId.trim()) || currency == null || !currency.matches("[A-Z]{3}")) {
      throw new TransportException("Puan isteği geçersiz.", "local_balance_invalid", 0, null);
    }
    try {
      JSONObject request = new JSONObject();
      request.put("customerId", customerId);
      request.put("currency", currency);
      JSONObject response = post(endpoint(baseUrl, LocalCompanionProtocol.BENEFITS_BALANCE_PATH), credential, identity, request, false, true);
      Object amount = response.opt("availableMinor"), timestamp = response.opt("generatedAtMs");
      if (response.length() != 2 || !(amount instanceof Integer || amount instanceof Long) || !(timestamp instanceof Integer || timestamp instanceof Long)) {
        throw new TransportException("Puan yanıtı geçersiz.", "local_balance_invalid", 0, null);
      }
      long available = ((Number) amount).longValue(), generated = ((Number) timestamp).longValue();
      if (available < 0 || available > 9007199254740991L || generated <= 0 || generated > 9007199254740991L) {
        throw new TransportException("Puan yanıtı geçersiz.", "local_balance_invalid", 0, null);
      }
      return new PointBalance(available, generated);
    } catch (TransportException error) { throw error; }
    catch (Exception error) { throw new TransportException("Puan isteği hazırlanamadı.", "local_balance_invalid", 0, error); }
  }

  /** Volatile price preview only, not a reservation or checkout authorization. */
  JSONObject fetchCustomerSalePreview(String baseUrl, String credential, DeviceIdentity identity,
      String customerId, JSONArray requestedLines) throws TransportException {
    final String invalid = "local_preview_invalid";
    try {
      if (identity == null || identity.deviceId == null || identity.deviceId.trim().isEmpty()
          || customerId == null || !customerId.equals(customerId.trim()) || customerId.length() > 128
          || requestedLines == null || requestedLines.length() < 1 || requestedLines.length() > 200) throw new IllegalArgumentException();
      JSONArray lines = new JSONArray();
      java.util.Set<String> ids = new java.util.HashSet<>();
      for (int i = 0; i < requestedLines.length(); i++) {
        JSONObject line = requestedLines.getJSONObject(i);
        Object idValue = line.opt("productId"), quantityValue = line.opt("quantity");
        if (line.length() != 2 || !(idValue instanceof String) || !(quantityValue instanceof Number)) throw new IllegalArgumentException();
        String id = (String) idValue;
        double quantity = ((Number) quantityValue).doubleValue();
        if (id.isEmpty() || id.length() > 128 || !id.equals(id.trim()) || !ids.add(id)
            || !Double.isFinite(quantity) || quantity <= 0 || quantity > 1000000
            || Math.abs(quantity * 10000 - Math.rint(quantity * 10000)) > 0.00001) throw new IllegalArgumentException();
        lines.put(new JSONObject().put("productId", id).put("quantity", quantity));
      }
      JSONObject request = new JSONObject().put("lines", lines);
      if (!customerId.isEmpty()) request.put("customerId", customerId);
      long startedAt = System.currentTimeMillis();
      JSONObject response = post(endpoint(baseUrl, LocalCompanionProtocol.CUSTOMER_SALE_PREVIEW_PATH), credential, identity, request, false, true);
      Object subtotal = response.opt("subtotalMinor"), timestamp = response.opt("generatedAtMs"), currencyValue = response.opt("currency");
      JSONArray resultLines = response.optJSONArray("lines");
      if (response.length() != 4 || !safeMinor(subtotal) || !safeMinor(timestamp) || !(currencyValue instanceof String)
          || !((String) currencyValue).matches("[A-Z]{3}") || resultLines == null || resultLines.length() != lines.length()) throw new IllegalArgumentException();
      long generated = ((Number) timestamp).longValue(), now = System.currentTimeMillis();
      if (generated < startedAt - 60000L || generated > now + 60000L) throw new IllegalArgumentException();
      for (int i = 0; i < lines.length(); i++) {
        JSONObject expected = lines.getJSONObject(i), actual = resultLines.getJSONObject(i);
        Object productId = actual.opt("productId"), quantity = actual.opt("quantity"), currency = actual.opt("currency"), updatedAt = actual.opt("updatedAt");
        if (actual.length() != 5 || !(productId instanceof String) || !productId.equals(expected.getString("productId"))
            || !(quantity instanceof Number) || !Double.isFinite(((Number) quantity).doubleValue())
            || Double.compare(((Number) quantity).doubleValue(), expected.getDouble("quantity")) != 0
            || !safeMinor(actual.opt("unitPriceMinor")) || !currencyValue.equals(currency)
            || !(updatedAt instanceof String) || ((String) updatedAt).trim().isEmpty()) throw new IllegalArgumentException();
      }
      return response;
    } catch (TransportException error) { throw error; }
    catch (Exception error) { throw new TransportException("Satış önizlemesi geçersiz.", invalid, 0, error); }
  }

  /** Advisory only; never persist, enqueue or treat as spend authorization. */
  JSONObject fetchPointSpendQuote(String baseUrl, String credential, DeviceIdentity identity,
      String customerId, JSONArray requestedLines, String expectedCurrency) throws TransportException {
    try {
      if (identity == null || identity.deviceId == null || identity.deviceId.trim().isEmpty()
          || customerId == null || customerId.isEmpty() || customerId.length() > 128 || !customerId.equals(customerId.trim())
          || expectedCurrency == null || !expectedCurrency.matches("[A-Z]{3}")
          || requestedLines == null || requestedLines.length() < 1 || requestedLines.length() > 200) throw new IllegalArgumentException();
      JSONArray lines = new JSONArray(); java.util.Set<String> ids = new java.util.HashSet<>();
      for (int i = 0; i < requestedLines.length(); i++) {
        JSONObject line = requestedLines.getJSONObject(i); Object idValue = line.opt("productId"), amount = line.opt("quantity");
        if (line.length() != 2 || !(idValue instanceof String) || !(amount instanceof Number)) throw new IllegalArgumentException();
        String id = (String) idValue; double quantity = ((Number) amount).doubleValue();
        if (id.isEmpty() || id.length() > 128 || !id.equals(id.trim()) || !ids.add(id)
            || !Double.isFinite(quantity) || quantity <= 0 || quantity > 1000000
            || Math.abs(quantity * 10000 - Math.rint(quantity * 10000)) > 0.00001) throw new IllegalArgumentException();
        lines.put(new JSONObject().put("productId", id).put("quantity", quantity));
      }
      JSONObject request = new JSONObject().put("customerId", customerId).put("lines", lines);
      JSONObject response = post(endpoint(baseUrl, LocalCompanionProtocol.POINT_SPEND_QUOTE_PATH), credential, identity, request, false, true);
      Object subtotal = response.opt("subtotalMinor"), available = response.opt("availablePointMinor"), maximum = response.opt("maxSpendableMinor");
      Object generated = response.opt("generatedAtMs"), expires = response.opt("expiresAtMs");
      JSONArray resultLines = response.optJSONArray("lines");
      if (response.length() != 7 || !safeMinor(subtotal) || !safeMinor(available) || !safeMinor(maximum)
          || !safeMinor(generated) || !safeMinor(expires) || !expectedCurrency.equals(response.opt("currency"))
          || resultLines == null || resultLines.length() != lines.length()) throw new IllegalArgumentException();
      long generatedMs = ((Number) generated).longValue(), expiryMs = ((Number) expires).longValue(), now = System.currentTimeMillis();
      // Desktop-generated timestamps may lead the handset clock slightly; keep the owner's 30s TTL unchanged.
      if (generatedMs <= 0 || generatedMs > now + 60000L || expiryMs <= now || expiryMs <= generatedMs || expiryMs - generatedMs > 30000L
          || ((Number) maximum).longValue() > Math.min(((Number) available).longValue(), ((Number) subtotal).longValue())) throw new IllegalArgumentException();
      long total = 0;
      for (int i = 0; i < lines.length(); i++) {
        JSONObject expected = lines.getJSONObject(i), actual = resultLines.getJSONObject(i);
        Object productId = actual.opt("productId"), quantity = actual.opt("quantity"), updatedAt = actual.opt("updatedAt"), price = actual.opt("unitPriceMinor");
        if (actual.length() != 5 || !(productId instanceof String) || !productId.equals(expected.getString("productId"))
            || !(quantity instanceof Number) || !Double.isFinite(((Number) quantity).doubleValue())
            || Double.compare(((Number) quantity).doubleValue(), expected.getDouble("quantity")) != 0
            || !safeMinor(price) || !expectedCurrency.equals(actual.opt("currency"))
            || !(updatedAt instanceof String) || ((String) updatedAt).trim().isEmpty()) throw new IllegalArgumentException();
        long lineTotal = java.math.BigDecimal.valueOf(((Number) price).longValue())
            .multiply(java.math.BigDecimal.valueOf(((Number) quantity).doubleValue()))
            .setScale(0, java.math.RoundingMode.HALF_UP).longValueExact();
        total = Math.addExact(total, lineTotal);
        if (total > 9007199254740991L) throw new IllegalArgumentException();
      }
      if (total != ((Number) subtotal).longValue()) throw new IllegalArgumentException();
      return response;
    } catch (TransportException error) { throw error; }
    catch (Exception error) { throw new TransportException("Puan önizlemesi geçersiz.", "local_point_quote_invalid", 0, error); }
  }

  /**
   * TLS-only coupon preauthorization. The plaintext code travels only in this
   * request; it is never queued, logged or attached to the sale action. The
   * response is an opaque 60-second permit plus an advisory quote.
   */
  JSONObject fetchCouponAttempt(String baseUrl, String credential, DeviceIdentity identity,
      String actionId, String customerId, JSONArray requestedLines, String couponCode, String paymentMethod)
      throws TransportException {
    final String invalid = "local_coupon_invalid";
    try {
      if (identity == null || identity.deviceId == null || identity.deviceId.trim().isEmpty()
          || actionId == null || !actionId.matches("[A-Za-z0-9_-]{8,120}")
          || customerId == null || customerId.isEmpty() || customerId.length() > 128 || !customerId.equals(customerId.trim())
          || couponCode == null || couponCode.isEmpty() || couponCode.length() > 256
          || !"cash".equals(paymentMethod)
          || requestedLines == null || requestedLines.length() < 1 || requestedLines.length() > 200)
        throw new IllegalArgumentException();
      JSONArray lines = new JSONArray(); java.util.Set<String> ids = new java.util.HashSet<>();
      for (int i = 0; i < requestedLines.length(); i++) {
        JSONObject line = requestedLines.getJSONObject(i);
        Object idValue = line.opt("productId"), amount = line.opt("quantity");
        if (line.length() != 2 || !(idValue instanceof String) || !(amount instanceof Number)) throw new IllegalArgumentException();
        String id = (String) idValue; double quantity = ((Number) amount).doubleValue();
        if (id.isEmpty() || id.length() > 128 || !id.equals(id.trim()) || !ids.add(id)
            || !Double.isFinite(quantity) || quantity <= 0 || quantity > 1000000
            || Math.abs(quantity * 10000 - Math.rint(quantity * 10000)) > 0.00001) throw new IllegalArgumentException();
        lines.put(new JSONObject().put("productId", id).put("quantity", quantity));
      }
      JSONObject request = new JSONObject().put("actionId", actionId).put("customerId", customerId)
          .put("lines", lines).put("couponCode", couponCode).put("paymentMethod", paymentMethod);
      JSONObject response = post(endpoint(baseUrl, LocalCompanionProtocol.COUPON_ATTEMPT_PATH),
          credential, identity, request, false, false, true);
      Object permit = response.opt("permitId"), currency = response.opt("currency");
      long subtotal = safeMinorAmount(response.opt("subtotalMinor")), discount = safeMinorAmount(response.opt("discountMinor"));
      long payable = safeMinorAmount(response.opt("payableMinor")), expires = safeMinorAmount(response.opt("expiresAtMs"));
      long now = System.currentTimeMillis();
      if (response.length() != 6 || !(permit instanceof String)
          || !((String) permit).matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
          || !(currency instanceof String) || !((String) currency).matches("[A-Z]{3}")
          || subtotal < 0 || discount <= 0 || payable < 0 || subtotal != discount + payable
          // Accept small peer clock skew; CouponPermit independently expires locally five seconds early.
          || expires <= now || expires - now > 65000L) throw new IllegalArgumentException();
      return response;
    } catch (TransportException error) { throw error; }
    catch (Exception error) { throw new TransportException("Kupon doğrulanamadı; yeni bir kodla yeniden deneyin.", invalid, 0, error); }
  }

  private static long safeMinorAmount(Object value) {
    if (!(value instanceof Integer || value instanceof Long)) return -1;
    long amount = ((Number) value).longValue();
    return amount >= 0 && amount <= 9007199254740991L ? amount : -1;
  }

  private static boolean safeMinor(Object value) {
    return (value instanceof Integer || value instanceof Long) && ((Number) value).longValue() >= 0
        && ((Number) value).longValue() <= 9007199254740991L;
  }

  private static String endpoint(String baseUrl, String path) throws TransportException {
    String normalized = baseUrl == null ? "" : baseUrl.trim();
    while (normalized.endsWith("/")) {
      normalized = normalized.substring(0, normalized.length() - 1);
    }
    if (LocalPinnedHttps.normalizeBaseUrl(normalized).isEmpty()) {
      throw new TransportException(
          "Yerel masaüstü adresi geçersiz.",
          "local_unreachable",
          0,
          null
      );
    }
    return normalized + path;
  }

  private JSONObject post(
      String endpoint,
      String token,
      DeviceIdentity identity,
      JSONObject payload,
      boolean action
  ) throws TransportException {
    return post(endpoint, token, identity, payload, action, false);
  }

  private JSONObject post(
      String endpoint, String token, DeviceIdentity identity, JSONObject payload, boolean action, boolean balance
  ) throws TransportException {
    return post(endpoint, token, identity, payload, action, balance, false);
  }

  private JSONObject post(
      String endpoint, String token, DeviceIdentity identity, JSONObject payload, boolean action, boolean balance,
      boolean bareResponse
  ) throws TransportException {
    HttpURLConnection connection = null;
    boolean deliveryStarted = false;
    try {
      ConnectionSettings.LocalConnection current = ConnectionSettings.localConnection(preferences);
      if (!current.isComplete() || !desktopId.equals(current.desktopId)
          || !current.spkiSha256.equals(expectedPin) || !current.localToken.equals(token)
          || !current.targetKey.equals(CompanionConnectionIdentity.actionTargetKey(preferences, ConnectionSettings.webModuleUrl(preferences)))
          || !endpoint.startsWith(current.baseUrl + "/local/v1/")) {
        throw new SSLException("local_tls_pairing_required");
      }
      connection = LocalPinnedHttps.open(endpoint, current.spkiSha256, connections);
      connection.setInstanceFollowRedirects(false);
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(READ_TIMEOUT_MS);
      connection.setDoOutput(true);
      connection.setRequestProperty("Accept", "application/json");
      connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
      connection.setRequestProperty(LocalCompanionProtocol.DEVICE_ID_HEADER, identity.deviceId);
      connection.setRequestProperty(LocalCompanionProtocol.TOKEN_HEADER, token == null ? "" : token.trim());

      byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
      connection.setFixedLengthStreamingMode(body.length);
      LocalPinnedHttps.authenticate(connection, expectedPin);
      deliveryStarted = true;
      try (OutputStream output = connection.getOutputStream()) {
        output.write(body);
      }

      int status = connection.getResponseCode();
      LocalPinnedHttps.rejectRedirect(status);
      InputStream stream = status >= 200 && status < 300
          ? connection.getInputStream()
          : connection.getErrorStream();
      String responseText = readAll(stream);
      JSONObject response;
      try {
        response = new JSONObject(responseText);
      } catch (Exception error) {
        throw new TransportException(
            "Yerel masaüstü geçerli bir yanıt vermedi.",
            action ? "local_delivery_unknown" : "local_unreachable",
            status,
            error
        );
      }

      if (status < 200 || status >= 300 || (!balance && !bareResponse && !response.optBoolean("ok", false))) {
        if (balance) throw new TransportException(endpoint.endsWith(LocalCompanionProtocol.CUSTOMER_SALE_PREVIEW_PATH)
            ? "Satış önizlemesi kullanılamıyor." : "Puan bakiyesi kullanılamıyor.",
            endpoint.endsWith(LocalCompanionProtocol.CUSTOMER_SALE_PREVIEW_PATH) ? "local_preview_denied" : "local_balance_denied", status, null);
        String code = response.optString("code", "").trim();
        String message = response.optString("message", "").trim();
        throw new TransportException(
            message.isEmpty() ? "Yerel masaüstü isteği başarısız oldu." : message,
            code.isEmpty() ? (action ? "local_delivery_unknown" : "local_unreachable") : code,
            status,
            null
        );
      }
      return response;
    } catch (TransportException error) {
      throw error;
    } catch (SSLException error) {
      throw new TransportException(
          "Masaüstü güvenlik kimliği doğrulanamadı. Bekleyen işlemler korunuyor; doğru masaüstünde QR ile yeniden eşleştirin.",
          "local_tls_authentication_failed", 0, error);
    } catch (SocketTimeoutException error) {
      throw new TransportException(
          "Yerel masaüstü bağlantısı zaman aşımına uğradı.",
          action && deliveryStarted ? "local_delivery_unknown" : "local_unreachable",
          0,
          error
      );
    } catch (Exception error) {
      throw new TransportException(
          "Yerel masaüstüne ulaşılamadı.",
          action && deliveryStarted ? "local_delivery_unknown" : "local_unreachable",
          0,
          error
      );
    } finally {
      if (connection != null) {
        connection.disconnect();
      }
    }
  }

  private static String readAll(InputStream stream) throws Exception {
    if (stream == null) return "";
    StringBuilder result = new StringBuilder();
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        result.append(line);
      }
    }
    return result.toString();
  }
}

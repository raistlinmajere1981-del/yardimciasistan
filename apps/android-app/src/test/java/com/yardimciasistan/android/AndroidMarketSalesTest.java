package com.yardimciasistan.android;

import static org.junit.Assert.*;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public final class AndroidMarketSalesTest {
  private JSONObject snapshot(boolean read, boolean pay) throws Exception {
    return new JSONObject().put("business_capabilities", new JSONArray(new String[]{"service.android", "commerce.catalog", "commerce.sales",
        "commerce.inventory", "retail.barcode", "commerce.customer_credit", "core.customers", "core.finance"}))
        .put("androidPermissions", new JSONObject().put("market-test-device", new JSONObject().put("role", "staff").put("is_active", true)
          .put("permissions", new JSONArray(new String[]{"market.product.view", "market.sale.complete", read ? "customer_credit.view" : "",
            pay ? "customer_credit.payment" : "", "market.cart_draft"}))))
        .put("market", new JSONObject().put("primary_location_id", "stock-main").put("customer_credit_accounts", new JSONArray().put(new JSONObject()
          .put("customer_id", "customer-1").put("full_name", "Saha Müşterisi").put("phone", "PRIVATE")
          .put("balances", new JSONArray().put(new JSONObject().put("currency", "TRY").put("amount_minor", 10000))
            .put(new JSONObject().put("currency", "EUR").put("amount_minor", 2000)))
          .put("entries", new JSONArray().put(new JSONObject().put("direction", "debit").put("entry_type", "credit_sale")
            .put("currency", "TRY").put("amount_minor", 10000).put("occurred_at", "2026-10-14T12:00:00Z"))))));
  }
  private OperationData data(boolean read, boolean pay) throws Exception { return OperationData.fromJson(snapshot(read, pay), "market-test-device"); }
  private OperationData.MarketProduct product(String id, String currency, double price) {
    OperationData.MarketProduct p = new OperationData.MarketProduct(); p.id = id; p.name = id; p.currency = currency;
    p.salePrice = price; p.active = true; p.updatedAt = "2026-10-14T10:00:00Z"; return p;
  }

  @Test public void privateAccountsRequireCreditReadCapabilityAndActiveDevice() throws Exception {
    assertEquals(0, data(false, false).market.customerCreditAccounts.size());
    OperationData allowed = data(true, false);
    assertEquals(1, allowed.market.customerCreditAccounts.size());
    assertEquals(2, allowed.market.customerCreditAccounts.get(0).balances.size());
    assertTrue(MarketUiRules.canViewCredit(allowed)); assertFalse(MarketUiRules.canPayCredit(allowed));
    JSONObject root = snapshot(true, true);
    root.getJSONArray("business_capabilities").remove(5);
    assertEquals(0, OperationData.fromJson(root, "market-test-device").market.customerCreditAccounts.size());
    root = snapshot(true, true); root.getJSONObject("androidPermissions").getJSONObject("market-test-device").put("is_active", false);
    assertEquals(0, OperationData.fromJson(root, "market-test-device").market.customerCreditAccounts.size());
  }

  @Test public void multiLineSalePreservesExpectedPricesAndDraftContract() throws Exception {
    OperationData d = data(true, true); MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft();
    OperationData.MarketProduct p = product("one", "TRY", 12.50), q = product("two", "TRY", 4);
    d.market.products.add(p); d.market.products.add(q); cart.addProduct(p); cart.addProduct(q); cart.changeQuantity("one", 1.5);
    JSONObject draft = cart.toPayload(); assertFalse(draft.getJSONArray("lines").getJSONObject(0).has("expected_unit_price"));
    JSONObject sale = cart.toSalePayload(d, "paid", "", "cash", false);
    assertEquals(2, sale.getJSONArray("lines").length()); assertEquals(2.5, sale.getJSONArray("lines").getJSONObject(0).getDouble("quantity"), 0);
    assertEquals(12.50, sale.getJSONArray("lines").getJSONObject(0).getDouble("expected_unit_price"), 0);
    assertEquals("stock-main", sale.getString("location_id")); assertFalse(sale.has("note"));
    p.salePrice = 20; p.updatedAt = "new-version";
    assertEquals(12.50, cart.toSalePayload(d, "paid", "", "bank", false).getJSONArray("lines").getJSONObject(0).getDouble("expected_unit_price"), 0);
    assertEquals("", AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE, sale));
    JSONObject credit = cart.toSalePayload(d, "credit", "customer-1", "credit", false);
    assertEquals("", credit.getString("payment_method"));
    assertEquals("", AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE, credit));
  }

  @Test public void invalidSettlementCurrencyVersionAndCardConfirmationFail() throws Exception {
    OperationData d = data(true, true); MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft();
    OperationData.MarketProduct p = product("one", "TRY", 12.5); d.market.products.add(p); cart.addProduct(p);
    for (String settlement : new String[]{"paid", "invalid"}) {
      try { cart.toSalePayload(d, settlement, "", "card", false); fail(); } catch (MarketUiRules.ValidationException expected) {}
    }
    assertTrue(cart.toSalePayload(d, "paid", "", "card", true).getBoolean("external_payment_confirmed"));
    OperationData.MarketProduct euro = product("euro", "EUR", 2); d.market.products.add(euro); cart.addProduct(euro);
    try { cart.toSalePayload(d, "paid", "", "cash", false); fail(); } catch (MarketUiRules.ValidationException expected) {}
    cart.remove("euro"); d.permissions.remove("customer_credit.view");
    try { cart.toSalePayload(d, "credit", "customer-1", "", false); fail(); } catch (MarketUiRules.ValidationException expected) {}
    cart.clear(); p.updatedAt = ""; cart.addProduct(p);
    try { cart.toSalePayload(d, "paid", "", "cash", false); fail(); } catch (MarketUiRules.ValidationException expected) {}
  }

  @Test public void collectionsUseMinorUnitsAndIndependentPermissions() throws Exception {
    OperationData d = data(true, true);
    JSONObject payment = MarketUiRules.creditPaymentPayload(d, "customer-1", "TRY", "12,34", "cash", false);
    assertEquals(1234, payment.getLong("amount_minor")); assertEquals(10000, payment.getLong("expected_balance_minor"));
    for (String amount : new String[]{"0", "-1", "100.01", "1.001", "NaN"}) {
      try { MarketUiRules.creditPaymentPayload(d, "customer-1", "TRY", amount, "cash", false); fail(amount); } catch (MarketUiRules.ValidationException expected) {}
    }
    assertEquals(2000, MarketUiRules.creditPaymentPayload(d, "customer-1", "EUR", "20", "bank", false).getLong("amount_minor"));
    try { MarketUiRules.creditPaymentPayload(d, "customer-1", "TRY", "1", "card", false); fail(); } catch (MarketUiRules.ValidationException expected) {}
    assertFalse(AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_CREDIT_PAYMENT, new JSONObject(payment.toString()).put("payment_method", "card")).isEmpty());
    d.permissions.remove("customer_credit.payment"); assertFalse(AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_CREDIT_PAYMENT, payment).isEmpty());
    assertFalse(AndroidActionPolicy.validationError(d, "unknown_action", payment).isEmpty());
  }

  @Test public void pendingTransportNeverClaimsCompletionOrPayment() {
    assertEquals("Masaüstünde onay bekliyor", MarketUiRules.financialFeedback(MarketUiRules.ACTION_SALE, "pending"));
    assertEquals("Masaüstünde onay bekliyor", MarketUiRules.financialFeedback(MarketUiRules.ACTION_CREDIT_PAYMENT, "pending"));
    assertTrue(MarketUiRules.financialFeedback(MarketUiRules.ACTION_SALE, "applied").contains("kaydedildi"));
    assertFalse(MarketUiRules.financialFeedback(MarketUiRules.ACTION_SALE, "failed").contains("kaydedildi"));
  }

  @Test public void offlineFinancialIntentAndMonotonicReceiptSurviveRestart() throws Exception {
    AndroidCompanionStorageTest.InMemoryPreferences prefs = new AndroidCompanionStorageTest.InMemoryPreferences();
    String url = "https://example.test/mobile", target = CompanionConnectionIdentity.actionTargetKey(url);
    prefs.edit().putString(ConnectionSettings.KEY_WEB_MODULE_URL, url).commit();
    JSONObject intent = MarketUiRules.creditPaymentPayload(data(true, true), "customer-1", "TRY", "1,23", "cash", false);
    ActionOutbox.PendingAction action = ActionOutbox.PendingAction.create("financial_retry_001", MarketUiRules.ACTION_CREDIT_PAYMENT, intent, target);
    new ActionOutbox(prefs).appendAll(java.util.Collections.singletonList(action));
    ActionOutbox.PendingAction retry = new ActionOutbox(prefs).load().get(0);
    assertEquals(action.id, retry.id); assertEquals(intent.toString(), retry.payload.toString()); assertTrue(retry.matchesTarget(target));
    OperationCache cache = new OperationCache(prefs, "market-test-device");
    cache.save(snapshot(true, true), "hosting:fixture", 1);
    OperationData.ActionRecord receipt = new OperationData.ActionRecord(); receipt.id = action.id; receipt.type = action.type; receipt.status = "pending";
    cache.recordActionResult(receipt, target); assertEquals("pending", cache.load().actions.get(0).status);
    receipt.status = "applied"; cache.recordActionResult(receipt, target); receipt.status = "failed"; cache.recordActionResult(receipt, target);
    assertEquals("applied", new OperationCache(prefs, "market-test-device").load().actions.get(0).status);
    new ActionOutbox(prefs).remove(action.id); assertTrue(new ActionOutbox(prefs).load().isEmpty());
    cache.save(snapshot(false, false), "hosting:fixture", 2); assertTrue(cache.load().actions.isEmpty());
    assertTrue(cache.load().market.customerCreditAccounts.isEmpty());
  }
}

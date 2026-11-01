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

  private OperationData customerSaleData() throws Exception {
    JSONObject root = snapshot(true, true);
    root.put("customers", new JSONArray().put(new JSONObject().put("id", "customer-1").put("full_name", "Müşteri")));
    root.getJSONObject("androidPermissions").getJSONObject("market-test-device").getJSONArray("permissions").put("customer.view");
    return OperationData.fromJson(root, "market-test-device");
  }

  private JSONObject salePreview() throws Exception {
    return new JSONObject().put("currency", "TRY").put("subtotalMinor", 900)
        .put("generatedAtMs", System.currentTimeMillis()).put("lines", new JSONArray().put(new JSONObject()
        .put("productId", "one").put("quantity", 1).put("currency", "TRY")
        .put("unitPriceMinor", 900).put("updatedAt", "2026-10-14T10:00:00Z")));
  }

  @Test public void customerPreviewBuildsPrivatePriceWithoutChangingCart() throws Exception {
    OperationData d = customerSaleData(); OperationData.MarketProduct p = product("one", "TRY", 12.5);
    d.market.products.add(p); MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft(); cart.addProduct(p);
    JSONObject payload = cart.toSalePayload(d, "paid", "customer-1", "cash", false, salePreview());
    JSONObject line = payload.getJSONArray("lines").getJSONObject(0);
    assertEquals(9.0, line.getDouble("expected_unit_price"), 0);
    assertEquals(p.updatedAt, line.getString("expected_updated_at"));
    assertEquals(12.5, cart.estimatedTotal(), 0);
    assertEquals("", AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE, payload));
    for (String key : new String[]{"total", "subtotalMinor", "discount", "benefits", "coupon"}) assertFalse(payload.has(key));
  }

  @Test public void explicitPointsIntentIsOptionalTypedAndNeverAutomatic() throws Exception {
    OperationData d = customerSaleData(); OperationData.MarketProduct p = product("one", "TRY", 12.5);
    d.market.products.add(p); MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft(); cart.addProduct(p);
    JSONObject plain = cart.toSalePayload(d, "paid", "customer-1", "cash", false, salePreview());
    assertFalse(plain.has("requestedPointsMinor"));
    JSONObject requested = cart.toSalePayload(d, "paid", "customer-1", "cash", false, salePreview(), 100);
    assertEquals(100, requested.getLong("requestedPointsMinor"));
    assertEquals("", AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE, requested));
    for (Object invalid : new Object[]{-1, 0.5, "100", JSONObject.NULL, 9007199254740992L}) {
      JSONObject changed = new JSONObject(requested.toString()).put("requestedPointsMinor", invalid);
      assertFalse(AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE, changed).isEmpty());
    }
    JSONObject noCustomer = cart.toSalePayload(d, "paid", "", "cash", false).put("requestedPointsMinor", 100);
    assertFalse(AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE, noCustomer).isEmpty());
    try { cart.toSalePayload(d, "paid", "", "cash", false, null, 100); fail("Puan requires live preview and customer"); }
    catch (MarketUiRules.ValidationException expected) {}
    try { cart.toSalePayload(d, "paid", "customer-1", "cash", false, salePreview(), 901); fail("Puan cannot exceed payable"); }
    catch (MarketUiRules.ValidationException expected) {}
    assertEquals("", AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE,
        new JSONObject(plain.toString()).put("requestedPointsMinor", 0)));
  }

  @Test public void customerPreviewCardRequiresCurrentExternalConfirmation() throws Exception {
    OperationData d = customerSaleData(); OperationData.MarketProduct p = product("one", "TRY", 12.5);
    d.market.products.add(p); MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft(); cart.addProduct(p);
    JSONObject preview = salePreview();
    assertTrue(cart.toSalePayload(d, "paid", "customer-1", "card", true, preview).getBoolean("external_payment_confirmed"));
    try { cart.toSalePayload(d, "paid", "customer-1", "card", false, preview); fail(); }
    catch (MarketUiRules.ValidationException expected) {}
    d.permissions.remove("customer.view");
    try { cart.toSalePayload(d, "paid", "customer-1", "card", true, preview); fail(); }
    catch (MarketUiRules.ValidationException expected) {}
  }

  @Test public void customerPreviewRejectsStaleMalformedAndChangedScope() throws Exception {
    OperationData d = customerSaleData(); OperationData.MarketProduct p = product("one", "TRY", 12.5);
    d.market.products.add(p); MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft(); cart.addProduct(p);
    java.util.List<JSONObject> bad = new java.util.ArrayList<>();
    bad.add(salePreview().put("generatedAtMs", System.currentTimeMillis() - 61000));
    bad.add(salePreview().put("generatedAtMs", System.currentTimeMillis() + 61000));
    bad.add(salePreview().put("subtotalMinor", 901));
    bad.add(salePreview().put("subtotalMinor", new java.math.BigInteger("18446744073709551615")));
    JSONObject wrong = salePreview(); wrong.getJSONArray("lines").getJSONObject(0).put("unitPriceMinor", new java.math.BigInteger("18446744073709551615")); bad.add(wrong);
    for (String key : new String[]{"productId", "quantity", "currency", "updatedAt", "unitPriceMinor"}) {
      wrong = salePreview(); wrong.getJSONArray("lines").getJSONObject(0).put(key,
          "quantity".equals(key) ? 2 : "unitPriceMinor".equals(key) ? -1 : "wrong"); bad.add(wrong);
    }
    wrong = salePreview(); wrong.getJSONArray("lines").put(new JSONObject()); bad.add(wrong);
    bad.add(salePreview().put("currency", "XYZ"));
    for (JSONObject preview : bad) {
      try { cart.toSalePayload(d, "paid", "customer-1", "cash", false, preview); fail(preview.toString()); }
      catch (MarketUiRules.ValidationException expected) {}
    }
    try { cart.toSalePayload(d, "paid", "customer-1", "cash", false, null); fail(); } catch (MarketUiRules.ValidationException expected) {}
    cart.changeQuantity("one", 1);
    try { cart.toSalePayload(d, "paid", "customer-1", "cash", false, salePreview()); fail(); } catch (MarketUiRules.ValidationException expected) {}
    cart.changeQuantity("one", -1);
    try { cart.toSalePayload(d, "paid", "missing", "cash", false, salePreview()); fail(); } catch (MarketUiRules.ValidationException expected) {}
    p.updatedAt = "new";
    try { cart.toSalePayload(d, "paid", "customer-1", "cash", false, salePreview()); fail(); } catch (MarketUiRules.ValidationException expected) {}
    p.updatedAt = "2026-10-14T10:00:00Z"; d.permissions.remove("customer.view");
    try { cart.toSalePayload(d, "paid", "customer-1", "cash", false, salePreview()); fail(); } catch (MarketUiRules.ValidationException expected) {}
  }

  @Test public void customerPreviewRequiresExactLineOrderAndRoundedSubtotal() throws Exception {
    OperationData d = customerSaleData(); MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft();
    OperationData.MarketProduct one = product("one", "TRY", 12.5), two = product("two", "TRY", 4);
    d.market.products.add(one); d.market.products.add(two); cart.addProduct(one); cart.addProduct(two);
    cart.changeQuantity("one", -0.5);
    JSONObject preview = salePreview(); preview.getJSONArray("lines").getJSONObject(0).put("quantity", 0.5).put("unitPriceMinor", 901);
    preview.getJSONArray("lines").put(new JSONObject().put("productId", "two").put("quantity", 1).put("currency", "TRY")
        .put("unitPriceMinor", 200).put("updatedAt", two.updatedAt));
    preview.put("subtotalMinor", 651);
    assertEquals(9.01, cart.toSalePayload(d, "paid", "customer-1", "cash", false, preview).getJSONArray("lines").getJSONObject(0).getDouble("expected_unit_price"), 0);
    JSONArray ordered = preview.getJSONArray("lines");
    preview.put("lines", new JSONArray().put(ordered.getJSONObject(1)).put(ordered.getJSONObject(0)));
    try { cart.toSalePayload(d, "paid", "customer-1", "cash", false, preview); fail(); } catch (MarketUiRules.ValidationException expected) {}
  }

  @Test public void customerPaidSaleWithoutLivePreviewCannotBuildQueuePayload() throws Exception {
    JSONObject root = snapshot(true, true);
    root.put("customers", new JSONArray().put(new JSONObject().put("id", "customer-1").put("full_name", "Müşteri")));
    root.getJSONObject("androidPermissions").getJSONObject("market-test-device").getJSONArray("permissions").put("customer.view");
    OperationData d = OperationData.fromJson(root, "market-test-device");
    OperationData.MarketProduct p = product("one", "TRY", 12.5); d.market.products.add(p);
    MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft(); cart.addProduct(p);
    try { cart.toSalePayload(d, "paid", "customer-1", "cash", false); fail("Live preview is required"); }
    catch (MarketUiRules.ValidationException expected) { assertTrue(expected.getMessage().contains("önizleme")); }
    assertEquals("", cart.toSalePayload(d, "paid", "", "cash", false).getString("customer_id"));
    assertEquals("credit", cart.toSalePayload(d, "credit", "customer-1", "credit", false).getString("settlement"));
  }

  @Test public void paidCustomerMustBeVisibleAndExplicitlyAuthorizedInCurrentSnapshot() throws Exception {
    JSONObject root = snapshot(true, true);
    root.put("customers", new JSONArray().put(new JSONObject().put("id", "customer-1").put("full_name", "Müşteri")));
    root.getJSONObject("androidPermissions").getJSONObject("market-test-device").getJSONArray("permissions").put("customer.view");
    OperationData d = OperationData.fromJson(root, "market-test-device");
    OperationData.MarketProduct p = product("one", "TRY", 12.5); d.market.products.add(p);
    MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft(); cart.addProduct(p);
    assertNotNull(MarketUiRules.paidCustomer(d, "customer-1"));
    try { cart.toSalePayload(d, "paid", "customer-1", "cash", false); fail(); }
    catch (MarketUiRules.ValidationException expected) { assertTrue(expected.getMessage().contains("önizleme")); }
    for (String id : new String[]{"missing", "customer-1 "}) {
      try { cart.toSalePayload(d, "paid", id, "cash", false); fail(id); } catch (MarketUiRules.ValidationException expected) {}
    }
    d.customers.clear();
    assertNull(MarketUiRules.paidCustomer(d, "customer-1"));
    try { cart.toSalePayload(d, "paid", "customer-1", "cash", false); fail(); } catch (MarketUiRules.ValidationException expected) {}
    d = OperationData.fromJson(root, "market-test-device"); d.market.products.add(p);
    d.permissions.remove("customer.view");
    try { cart.toSalePayload(d, "paid", "customer-1", "cash", false); fail(); } catch (MarketUiRules.ValidationException expected) {}
    assertEquals("", cart.toSalePayload(d, "paid", "", "cash", false).getString("customer_id"));
    root.getJSONArray("business_capabilities").remove(6);
    OperationData withoutCustomers = OperationData.fromJson(root, "market-test-device"); withoutCustomers.market.products.add(p);
    assertFalse(MarketUiRules.canSelectPaidCustomer(withoutCustomers));
    try { cart.toSalePayload(withoutCustomers, "paid", "customer-1", "cash", false); fail(); } catch (MarketUiRules.ValidationException expected) {}
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
    try { cart.toSalePayload(d, "paid", "", "bank", false); fail("Eski fiyatlı sepet kuyruğa girmemeli."); }
    catch (MarketUiRules.ValidationException expected) { assertTrue(expected.getMessage().contains("değişmiş")); }
    cart.remove("one"); cart.addProduct(p);
    assertEquals(20, cart.toSalePayload(d, "paid", "", "bank", false).getJSONArray("lines").getJSONObject(1).getDouble("expected_unit_price"), 0);
    assertEquals("", AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE, sale));
    JSONObject credit = cart.toSalePayload(d, "credit", "customer-1", "credit", false);
    assertEquals("", credit.getString("payment_method"));
    assertEquals("", AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE, credit));
  }

  @Test public void unsupportedBenefitsAndClientMoneyFieldsNeverEnterOfflineFinancialQueue() throws Exception {
    OperationData d = data(true, true);
    OperationData.MarketProduct p = product("one", "TRY", 12.50); d.market.products.add(p);
    MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft(); cart.addProduct(p);
    JSONObject sale = cart.toSalePayload(d, "paid", "", "cash", false);
    assertEquals("", AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE, sale));
    for (String unsupported : new String[]{"benefits", "couponCode", "discountMinor", "expectedQuote", "total"}) {
      JSONObject injected = new JSONObject(sale.toString()).put(unsupported, 1);
      assertFalse(unsupported, AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE, injected).isEmpty());
    }
    assertFalse(AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE,
        new JSONObject(sale.toString()).put("settlement", "pending")).isEmpty());
    for (String badField : new String[]{"couponCode", "discount", "unitPrice"}) {
      JSONObject injected = new JSONObject(sale.toString());
      injected.getJSONArray("lines").getJSONObject(0).put(badField, 1);
      assertFalse(badField, AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE, injected).isEmpty());
    }
    for (double invalidQuantity : new double[]{0, -1, 1.00001, 1_000_001}) {
      JSONObject injected = new JSONObject(sale.toString());
      injected.getJSONArray("lines").getJSONObject(0).put("quantity", invalidQuantity);
      assertFalse(AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE, injected).isEmpty());
    }
    JSONObject invalidPrice = new JSONObject(sale.toString());
    invalidPrice.getJSONArray("lines").getJSONObject(0).put("expected_unit_price", -1);
    assertFalse(AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_SALE, invalidPrice).isEmpty());
    JSONObject payment = MarketUiRules.creditPaymentPayload(d, "customer-1", "TRY", "1", "cash", false);
    assertEquals("", AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_CREDIT_PAYMENT, payment));
    assertFalse(AndroidActionPolicy.validationError(d, MarketUiRules.ACTION_CREDIT_PAYMENT,
        new JSONObject(payment.toString()).put("couponCode", "unsupported")).isEmpty());
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

  @Test public void pointSpendQuoteIsOptionalBoundToPreviewCartAndExpiry() throws Exception {
    long now = System.currentTimeMillis();
    JSONObject quote = new JSONObject().put("currency", "TRY").put("subtotalMinor", 900)
        .put("availablePointMinor", 5000).put("maxSpendableMinor", 900)
        .put("generatedAtMs", now).put("expiresAtMs", now + 30000)
        .put("lines", salePreview().getJSONArray("lines"));
    PointSpendQuote valid = new PointSpendQuote(quote, () -> true);
    assertTrue(valid.isCurrent());
    JSONArray cartLines = new JSONArray().put(new JSONObject().put("productId", "one").put("quantity", 1));
    assertTrue(valid.matches(salePreview(), cartLines, 500));
    assertFalse(valid.matches(salePreview(), cartLines, 0));
    assertFalse(valid.matches(salePreview(), cartLines, 901));
    assertFalse(valid.matches(new JSONObject(salePreview().toString()).put("subtotalMinor", 800), cartLines, 500));
    assertFalse(valid.matches(salePreview(), new JSONArray().put(new JSONObject().put("productId", "one").put("quantity", 2)), 500));
    assertFalse(new PointSpendQuote(quote, () -> false).isCurrent());

    // Real server quote lines carry price, currency and version; scope uses only product + quantity.
    JSONArray serverLines = new JSONArray().put(new JSONObject().put("productId", "one").put("quantity", 1)
        .put("unitPriceMinor", 900).put("currency", "TRY").put("updatedAt", "2026-10-14T10:00:00Z"));
    assertEquals(5, serverLines.getJSONObject(0).length());
    JSONObject priced = new JSONObject(quote.toString()).put("lines", serverLines);
    assertTrue(new PointSpendQuote(priced, () -> true).matches(salePreview(), cartLines, 500));
    JSONObject changedPrice = new JSONObject(priced.toString()).put("lines",
        new JSONArray().put(new JSONObject(serverLines.getJSONObject(0).toString()).put("unitPriceMinor", 901)));
    assertFalse(new PointSpendQuote(changedPrice, () -> true).matches(salePreview(), cartLines, 500));
    JSONObject changedVersion = new JSONObject(priced.toString()).put("lines",
        new JSONArray().put(new JSONObject(serverLines.getJSONObject(0).toString()).put("updatedAt", "2026-10-14T11:00:00Z")));
    assertFalse(new PointSpendQuote(changedVersion, () -> true).matches(salePreview(), cartLines, 500));
    try {
      new PointSpendQuote(new JSONObject(quote.toString()).put("lines",
          new JSONArray().put(new JSONObject().put("productId", "one").put("quantity", 1).put("unitPriceMinor", 900).put("currency", "TRY"))), () -> true);
      fail("malformed owner quote line must be rejected");
    } catch (IllegalArgumentException expected) {}

    JSONObject expired = new JSONObject(quote.toString()).put("generatedAtMs", now - 40000).put("expiresAtMs", now - 10000);
    assertFalse(new PointSpendQuote(expired, () -> true).isCurrent());
    try {
      new PointSpendQuote(new JSONObject(quote.toString()).put("maxSpendableMinor", 901), () -> true);
      fail("max spendable cannot exceed available or subtotal");
    } catch (IllegalArgumentException expected) {}

    assertEquals(0, MarketUiRules.parsePointAmountMinor(""));
    assertEquals(0, MarketUiRules.parsePointAmountMinor(" 0 "));
    assertEquals(1250, MarketUiRules.parsePointAmountMinor("12,5"));
    assertEquals(1, MarketUiRules.parsePointAmountMinor("0,01"));
    for (String invalid : new String[]{"-1", "1,234", "abc"}) {
      try { MarketUiRules.parsePointAmountMinor(invalid); fail("invalid point amount " + invalid); }
      catch (MarketUiRules.ValidationException expected) {}
    }
  }
}

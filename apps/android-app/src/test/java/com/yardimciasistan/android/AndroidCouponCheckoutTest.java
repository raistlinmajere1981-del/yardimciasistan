package com.yardimciasistan.android;

import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.function.BooleanSupplier;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public final class AndroidCouponCheckoutTest {
  private static final String PERMIT_ID = "123e4567-e89b-12d3-a456-426614174000";
  private static final String ACTION_ID = "android_action_coupon_fixed_0001";
  private static final String COUPON = "OWNER-CODE-123";

  private OperationData data() throws Exception {
    JSONObject root = new JSONObject()
        .put("business_capabilities", new JSONArray(new String[]{"service.android", "commerce.catalog", "commerce.sales",
            "commerce.inventory", "retail.barcode", "core.customers", "core.finance"}))
        .put("androidPermissions", new JSONObject().put("market-test-device", new JSONObject().put("role", "staff")
            .put("is_active", true).put("permissions", new JSONArray(new String[]{"market.product.view",
                "market.sale.complete", "customer.view"}))))
        .put("customers", new JSONArray().put(new JSONObject().put("id", "customer-1").put("full_name", "Müşteri")))
        .put("market", new JSONObject().put("primary_location_id", "stock-main")
            .put("customer_credit_accounts", new JSONArray()));
    return OperationData.fromJson(root, "market-test-device");
  }

  private OperationData.MarketProduct product(OperationData data) {
    OperationData.MarketProduct product = new OperationData.MarketProduct();
    product.id = "one"; product.name = "Ürün"; product.currency = "TRY"; product.salePrice = 12.5;
    product.active = true; product.updatedAt = "2026-10-14T10:00:00Z";
    data.market.products.add(product);
    return product;
  }

  private JSONArray lines(double quantity) throws Exception {
    return new JSONArray().put(new JSONObject().put("productId", "one").put("quantity", quantity));
  }

  private CouponPermit permit(long subtotal, long discount, long expiresAt, BooleanSupplier current) throws Exception {
    JSONObject raw = new JSONObject().put("permitId", PERMIT_ID).put("expiresAtMs", expiresAt)
        .put("currency", "TRY").put("subtotalMinor", subtotal).put("discountMinor", discount)
        .put("payableMinor", subtotal - discount);
    return new CouponPermit(raw, ACTION_ID, "customer-1", "cash", "TRY", lines(1), current);
  }

  private CouponPermit validPermit() throws Exception {
    return permit(1250, 250, System.currentTimeMillis() + 30000, () -> true);
  }

  private JSONObject couponIntent() throws Exception {
    return new JSONObject().put("lines", new JSONArray().put(new JSONObject().put("product_id", "one")
            .put("quantity", 1).put("expected_unit_price", 12.5).put("expected_currency", "TRY")
            .put("expected_updated_at", "2026-10-14T10:00:00Z")))
        .put("location_id", "stock-main").put("settlement", "paid").put("customer_id", "customer-1")
        .put("payment_method", "cash").put("external_payment_confirmed", false)
        .put("couponPermitId", PERMIT_ID);
  }

  private JSONObject receipt(int fields, long cash, long discount) throws Exception {
    JSONObject receipt = new JSONObject().put("saleId", "sale-1").put("businessId", "business-1")
        .put("source", "android-market-sale").put("customerId", "customer-1").put("cashPaidMinor", cash)
        .put("pointsTenderMinor", 0).put("currency", "TRY").put("paymentMethod", "cash");
    if (fields == 9) receipt.put("discountMinor", discount);
    return receipt;
  }

  private JSONObject response(JSONObject receipt) throws Exception {
    return new JSONObject().put("action_id", ACTION_ID).put("sale_receipt", receipt);
  }

  @Test public void couponPayloadCarriesOnlyTheOpaquePermit() throws Exception {
    OperationData data = data();
    MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft();
    cart.addProduct(product(data));
    JSONObject payload = cart.toCouponSalePayload(data, "paid", "customer-1", "cash", false, validPermit());
    assertEquals(PERMIT_ID, payload.getString("couponPermitId"));
    assertFalse(payload.has("requestedPointsMinor"));
    assertFalse(payload.has("note"));
    assertEquals("", AndroidActionPolicy.validationError(data, MarketUiRules.ACTION_SALE, payload));
    String serialized = payload.toString();
    assertFalse(serialized.contains(COUPON));
    assertFalse(serialized.contains("couponCode"));
    assertFalse(serialized.contains("coupon_code"));

    CouponPermitRequest request = new CouponPermitRequest(ACTION_ID, "customer-1", "cash",
        "snapshot-1", 7, "TRY", lines(1), COUPON);
    assertTrue(request.isComplete());
    assertEquals(COUPON, request.couponCode);
    AndroidActionDispatcher.Command command = AndroidActionDispatcher.Command.preassigned(
        ACTION_ID, MarketUiRules.ACTION_SALE, payload);
    assertEquals(ACTION_ID, command.id);
    AndroidCompanionStorageTest.InMemoryPreferences prefs = new AndroidCompanionStorageTest.InMemoryPreferences();
    ActionOutbox outbox = new ActionOutbox(prefs);
    ArrayList<ActionOutbox.PendingAction> pending = new ArrayList<>();
    pending.add(ActionOutbox.PendingAction.create(command.id, command.type, command.payload, "companion:target"));
    outbox.appendAll(pending);
    assertEquals(command.id, outbox.load().get(0).id);
    String stored = prefs.getString("pending_android_actions_v2", "");
    assertTrue(stored.contains(PERMIT_ID));
    assertFalse(stored.contains(COUPON));
    assertFalse(stored.contains("couponCode"));
  }

  @Test(expected = IllegalArgumentException.class)
  public void preassignedActionIdIsNeverSilentlyRegeneratedOrTrimmed() {
    AndroidActionDispatcher.Command.preassigned(" " + ACTION_ID + " ", MarketUiRules.ACTION_SALE, new JSONObject());
  }

  @Test public void couponAndPointsAreMutuallyExclusive() throws Exception {
    OperationData data = data();
    MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft();
    cart.addProduct(product(data));
    JSONObject payload = cart.toCouponSalePayload(data, "paid", "customer-1", "cash", false, validPermit());
    assertFalse(AndroidActionPolicy.validationError(data, MarketUiRules.ACTION_SALE,
        new JSONObject(payload.toString()).put("requestedPointsMinor", 100)).isEmpty());
    assertEquals("", AndroidActionPolicy.validationError(data, MarketUiRules.ACTION_SALE,
        new JSONObject(payload.toString()).put("requestedPointsMinor", 0)));
    assertFalse(AndroidActionPolicy.validationError(data, MarketUiRules.ACTION_SALE,
        new JSONObject(payload.toString()).put("payment_method", "card")).isEmpty());
    assertFalse(AndroidActionPolicy.validationError(data, MarketUiRules.ACTION_SALE,
        new JSONObject(payload.toString()).put("settlement", "credit")).isEmpty());
    assertFalse(AndroidActionPolicy.validationError(data, MarketUiRules.ACTION_SALE,
        new JSONObject(payload.toString()).put("customer_id", "")).isEmpty());
    assertFalse(AndroidActionPolicy.validationError(data, MarketUiRules.ACTION_SALE,
        new JSONObject(payload.toString()).put("couponPermitId", "not-a-uuid")).isEmpty());
  }

  @Test public void smallDesktopPhoneClockSkewIsAcceptedButExpiresLocallyEarly() throws Exception {
    long now = System.currentTimeMillis();
    // Server granted 60 seconds while the phone clock trails by 1.5 seconds.
    CouponPermit skewed = permit(1250, 250, now + 61500, () -> true);
    assertTrue(skewed.isCurrent());
    assertFalse(permit(1250, 250, now + 4000, () -> true).isCurrent());
    try { permit(1250, 250, now + 66000, () -> true); fail("unbounded clock difference"); }
    catch (IllegalArgumentException expected) {}
  }

  @Test public void expiredOrChangedPermitIsNeverSubmitted() throws Exception {
    OperationData data = data();
    MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft();
    cart.addProduct(product(data));
    CouponPermit expired = permit(1250, 250, System.currentTimeMillis() - 1000, () -> true);
    assertFalse(expired.isCurrent());
    try { cart.toCouponSalePayload(data, "paid", "customer-1", "cash", false, expired); fail("expired permit"); }
    catch (MarketUiRules.ValidationException expected) {}
    CouponPermit stale = permit(1250, 250, System.currentTimeMillis() + 30000, () -> false);
    try { cart.toCouponSalePayload(data, "paid", "customer-1", "cash", false, stale); fail("stale scope"); }
    catch (MarketUiRules.ValidationException expected) {}
    CouponPermit wrongSubtotal = permit(1300, 250, System.currentTimeMillis() + 30000, () -> true);
    try { cart.toCouponSalePayload(data, "paid", "customer-1", "cash", false, wrongSubtotal); fail("stale price"); }
    catch (MarketUiRules.ValidationException expected) {}
    cart.changeQuantity("one", 1);
    try { cart.toCouponSalePayload(data, "paid", "customer-1", "cash", false, validPermit()); fail("changed cart"); }
    catch (MarketUiRules.ValidationException expected) {}
  }

  @Test public void couponReceiptRequiresNineFieldsAndARealDiscount() throws Exception {
    JSONObject intent = couponIntent();
    LocalDesktopOperationsTransport.validateSaleReceiptFacts(response(receipt(9, 1000, 250)), ACTION_ID, intent);

    try { LocalDesktopOperationsTransport.validateSaleReceiptFacts(response(receipt(8, 1250, 0)), ACTION_ID, intent); fail("eight fields"); }
    catch (IllegalArgumentException expected) {}
    try { LocalDesktopOperationsTransport.validateSaleReceiptFacts(response(receipt(9, 1250, 0)), ACTION_ID, intent); fail("zero discount"); }
    catch (IllegalArgumentException expected) {}
    try { LocalDesktopOperationsTransport.validateSaleReceiptFacts(response(receipt(9, 1001, 250)), ACTION_ID, intent); fail("cash mismatch"); }
    catch (IllegalArgumentException expected) {}
    try { LocalDesktopOperationsTransport.validateSaleReceiptFacts(response(receipt(9, 750, 500)), "other_action", intent); fail("action mismatch"); }
    catch (IllegalArgumentException expected) {}
    JSONObject pointsReceipt = receipt(9, 1000, 250).put("pointsTenderMinor", 500);
    try { LocalDesktopOperationsTransport.validateSaleReceiptFacts(response(pointsReceipt), ACTION_ID, intent); fail("points mix"); }
    catch (IllegalArgumentException expected) {}
    JSONObject creditIntent = new JSONObject(intent.toString()).put("settlement", "credit").put("payment_method", "");
    try { LocalDesktopOperationsTransport.validateSaleReceiptFacts(response(receipt(9, 1000, 250)), ACTION_ID, creditIntent); fail("credit coupon"); }
    catch (IllegalArgumentException expected) {}
  }

  @Test public void ordinaryEightFieldReceiptValidationIsUnchanged() throws Exception {
    JSONObject intent = new JSONObject().put("lines", new JSONArray().put(new JSONObject().put("product_id", "one")
            .put("quantity", 1).put("expected_unit_price", 12.5).put("expected_currency", "TRY")
            .put("expected_updated_at", "2026-10-14T10:00:00Z")))
        .put("settlement", "paid").put("customer_id", "customer-1").put("payment_method", "cash");
    LocalDesktopOperationsTransport.validateSaleReceiptFacts(response(receipt(8, 1250, 0)), ACTION_ID, intent);
    try { LocalDesktopOperationsTransport.validateSaleReceiptFacts(response(receipt(9, 1000, 250)), ACTION_ID, intent); fail("coupon field on normal sale"); }
    catch (IllegalArgumentException expected) {}
    JSONObject pointsIntent = new JSONObject(intent.toString()).put("requestedPointsMinor", 500);
    JSONObject pointsReceipt = receipt(8, 750, 0).put("pointsTenderMinor", 500);
    LocalDesktopOperationsTransport.validateSaleReceiptFacts(response(pointsReceipt), ACTION_ID, pointsIntent);
    JSONObject cashOnly = receipt(8, 1000, 0);
    try { LocalDesktopOperationsTransport.validateSaleReceiptFacts(response(cashOnly), ACTION_ID, pointsIntent); fail("missing points tender"); }
    catch (IllegalArgumentException expected) {}
  }
}

package com.yardimciasistan.dealer;

import org.junit.Test;
import static org.junit.Assert.*;
import org.json.*;

public class DealerStateTest {
  private String disk = "{}";
  /** Simulated authenticated quote; no local price is ever accepted by the actual API. */
  private static JSONObject quoted(DealerState state) throws Exception {
    JSONObject draft = state.draftOrder();
    JSONArray lines = new JSONArray();
    long sum = 0;
    JSONArray items = draft.getJSONArray("items");
    for (int i = 0; i < items.length(); i++) {
      JSONObject item = items.getJSONObject(i);
      JSONObject product = state.product(item.getString("productId"));
      long unit = new java.math.BigDecimal(product.get("price").toString())
          .movePointRight(2).setScale(0, java.math.RoundingMode.HALF_UP).longValueExact();
      long amount = new java.math.BigDecimal(item.get("quantity").toString())
          .multiply(java.math.BigDecimal.valueOf(unit))
          .setScale(0, java.math.RoundingMode.HALF_UP).longValueExact();
      sum += amount;
      lines.put(new JSONObject().put("product_id", item.getString("productId"))
          .put("quantity", item.getDouble("quantity"))
          .put("name", product.optString("name", "Ürün"))
          .put("unit_price_minor", unit).put("line_total_minor", amount));
    }
    return new JSONObject().put("version", 2).put("minor_unit", 2).put("items", lines)
        .put("currency", state.product(items.getJSONObject(0).getString("productId")).getString("currency"))
        .put("delivery_method", draft.getJSONObject("delivery").getString("method"))
        .put("subtotal_minor", sum).put("delivery_fee_minor", 0).put("total_minor", sum)
        .put("payment_method", "bank_transfer").put("quote_id", "a".repeat(64))
        .put("demo", true).put("bank", new JSONObject().put("name", "TEST BANKA")
            .put("accountHolder", "DEMO").put("iban", "DEMO-GECERSIZ-HESAP"))
        .put("legal", new JSONObject().put("version", "test-v1")
            .put("preliminary", "Ön bilgilendirme test metni")
            .put("agreement", "Satış sözleşmesi test metni"));
  }
  private static JSONObject approved(DealerState state) throws Exception {
    return state.prepareOrder(state.data.has("pending") ? new JSONObject() : quoted(state), true, true, false);
  }
  private DealerState state() throws Exception { return new DealerState(disk, json -> disk = json); }
  private DealerState signedIn() throws Exception {
    DealerState state = state(); state.authenticate("https://firma.example/module/", "session-a", new JSONObject().put("access_id", "a"));
    state.put("catalog", new JSONObject("{\"catalog_revision\":\"" + "a".repeat(64) + "\",\"delivery_methods\":[\"pickup\",\"shipping\"],\"products\":[{\"product_id\":\"p\",\"name\":\"Ürün\",\"price\":12.35,\"currency\":\"TRY\"},{\"product_id\":\"q\",\"name\":\"İkinci\",\"price\":2.1,\"currency\":\"TRY\"}]}"));
    return state;
  }
  @Test public void rememberMePersistsOnlyOptedInEncryptedSessionWhileKeepingDrafts() throws Exception {
    DealerState state = state();
    assertFalse(state.rememberMe());
    String secret = "ya_account_session=" + "s".repeat(43) + "; ya_account_refresh=" + "r".repeat(43);
    state.authenticate("https://firma.example/module/", secret, new JSONObject().put("access_id", "a"), false);
    state.put("catalog", new JSONObject("{\"catalog_revision\":\"" + "a".repeat(64) + "\",\"delivery_methods\":[\"pickup\"],\"products\":[{\"product_id\":\"p\",\"name\":\"Test\",\"price\":2,\"currency\":\"TRY\"}]}"));
    state.quantity("p", 1);
    assertEquals(secret, state.text("cookie")); // live session usable until process ends
    assertFalse(disk.contains(secret));
    assertFalse(new JSONObject(disk).has("cookie"));
    assertEquals(1, state().object("cart").getInt("p"));
    approved(state);
    assertFalse(disk.contains(secret)); // pending-order copy-on-write cannot persist an opted-out session
    assertEquals(1, state().object("cart").getInt("p"));
    state.accepted(new JSONObject().put("order_id", "receipt"));
    assertFalse(disk.contains(secret)); // acceptance persistence cannot leak the bearer token either
  }
  @Test public void rememberMeRestoresOptedInCookieAndAllowsOptingOutWithoutErasingCarts() throws Exception {
    DealerState legacy = new DealerState("{\"cookie\":\"previous-session\"}", json -> {});
    assertTrue(legacy.rememberMe()); // previously persisted sessions remain remembered
    DealerState state = signedIn();
    assertFalse(state.rememberMe()); // new logins start without persistent auth
    state.setRememberMe(true);
    state.quantity("p", 2);
    assertEquals("session-a", state().text("cookie"));
    state.setRememberMe(false);
    assertEquals("session-a", state.text("cookie"));
    assertFalse(new JSONObject(disk).has("cookie"));
    assertEquals(2, state().object("cart").getInt("p"));
    state.setRememberMe(true);
    assertEquals("session-a", state().text("cookie"));
    state.newCart("İkinci sepet");
    assertEquals("session-a", state().text("cookie"));
    state.setRememberMe(false);
    state.newCart("Üçüncü sepet");
    assertFalse(new JSONObject(disk).has("cookie")); // cart copy-on-write does not bypass preference
  }
  @Test public void rememberMeStorageFailureCannotClaimCookieWasForgotten() throws Exception {
    DealerState state = signedIn(); state.setRememberMe(true);
    String recorded = disk;
    DealerState failing = new DealerState(disk, json -> { throw new java.io.IOException("disk full"); });
    assertThrows(java.io.IOException.class, () -> failing.setRememberMe(false));
    assertTrue(failing.rememberMe());
    assertEquals(recorded, disk);
    assertEquals("session-a", state().text("cookie"));
  }
  @Test public void rotatedCookieIsDurableBeforeRetryAndRespectsRememberPreference() throws Exception {
    DealerState state = signedIn();
    String token = "ya_account_session=" + "x".repeat(43) + "; ya_account_refresh=" + "y".repeat(43);
    state.setRememberMe(true);
    state.rotateCookie(token);
    assertEquals(token, state.text("cookie"));
    assertEquals(token, state().text("cookie"));
    state.setRememberMe(false);
    state.rotateCookie("ya_account_session=" + "a".repeat(43) + "; ya_account_refresh=" + "b".repeat(43));
    assertFalse(new JSONObject(disk).has("cookie"));
    assertFalse(state.text("cookie").isEmpty());
  }
  @Test public void failedRotatedCookiePersistenceAbortsWithoutMutatingLiveState() throws Exception {
    DealerState state = signedIn(); state.setRememberMe(true);
    String before = disk;
    DealerState failing = new DealerState(before, json -> { throw new java.io.IOException("disk unavailable"); });
    String token = "ya_account_session=" + "x".repeat(43) + "; ya_account_refresh=" + "y".repeat(43);
    assertThrows(java.io.IOException.class, () -> failing.rotateCookie(token));
    assertEquals("session-a", failing.text("cookie"));
    assertEquals(before, disk);
    assertThrows(IllegalArgumentException.class, () -> failing.rotateCookie("invalid"));
  }
  @Test public void rememberMeDefaultsOffForNewLoginAndUiExposesUserChoice() throws Exception {
    assertFalse(state().rememberMe());
    String activity = java.nio.file.Files.readString(java.nio.file.Paths.get("src/main/java/com/yardimciasistan/dealer/DealerActivity.java"));
    assertTrue(activity.contains("remember.setText(\"Beni hatırla\")"));
    assertTrue(activity.contains("state.setRememberMe(enabled)"));
    assertFalse(disk.contains("password"));
  }
  @Test public void draftNeedsOnlineQuoteAndConsentBeforePendingExists() throws Exception {
    DealerState state = signedIn();state.quantity("p",2);
    JSONObject draft = state.draftOrder();
    assertFalse(state.data.has("pending"));
    JSONObject quote = quoted(state);
    assertEquals(quote.getString("quote_id"), DealerCheckout.verifiedQuote(
        new JSONObject().put("ok",true).put("quote",quote), draft).getString("quote_id"));
    assertThrows(IllegalArgumentException.class, () -> state.prepareOrder(quote, false,true,false));
    assertThrows(IllegalArgumentException.class, () -> state.prepareOrder(quote, true,false,false));
    assertFalse(state.data.has("pending"));
    assertEquals("bank_transfer", state.prepareOrder(quote,true,true,true).getString("paymentMethod"));
    assertTrue(state.object("pending").getJSONObject("consent").getBoolean("marketing"));
    assertEquals(state.object("pending").toString(), state().object("pending").toString());
  }
  @Test public void invalidOrTamperedServerQuotesFailBeforeDurableOrder() throws Exception {
    DealerState state=signedIn();state.quantity("p",2);JSONObject draft=state.draftOrder();
    JSONObject q=quoted(state);
    for (String key : new String[]{"quote_id","currency","payment_method","total_minor","items","bank","legal"}) {
      JSONObject broken=new JSONObject(q.toString());
      switch(key){
        case "items":broken.put(key,new JSONArray());break;
        case "bank":broken.put(key,JSONObject.NULL);break;
        case "legal":broken.put(key,JSONObject.NULL);break;
        case "total_minor":broken.put(key,3);break;
        default:broken.put(key,"tampered");
      }
      assertThrows(Exception.class,()->DealerCheckout.verifiedQuote(new JSONObject().put("ok",true).put("quote",broken),draft));
      assertFalse(state.data.has("pending"));
    }
  }
  @Test public void offlineCartAndCatalogPricesAreExplicitlyUnconfirmed() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2);
    String pending = approved(state).toString();
    DealerState reopened = state();
    assertEquals(2, reopened.object("cart").getInt("p"));
    assertEquals(pending, reopened.object("pending").toString());
    String activity = java.nio.file.Files.readString(java.nio.file.Paths.get("src/main/java/com/yardimciasistan/dealer/DealerActivity.java"));
    assertTrue(activity.contains("Kayıtlı fiyat (değişebilir)"));
    assertTrue(activity.contains("Çevrimdışı sepet (salt okunur)"));
    assertTrue(activity.contains("if (!state.text(\"cookie\").isEmpty() && state.object(\"cart\").length() > 0)"));
  }
  @Test public void offlineCartAndFavoritesSurviveRestart() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2); state.quantity("q", 3); state.favorite("p");
    DealerState reopened = state(); assertEquals(2, reopened.object("cart").getInt("p")); assertTrue(reopened.object("favorites").has("p")); assertEquals("31.00", reopened.total().toPlainString());
  }
  @Test public void lostResponseRetriesExactRequestAfterRestart() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2); state.put("note", "Deneme");
    String first = approved(state).toString(); assertEquals(first, approved(state()).toString());
    assertFalse(first.contains("unitPrice")); assertFalse(first.contains("customerId")); assertFalse(first.contains("priceGroup"));
  }
  @Test public void dealerOrderDoesNotForgeRetailBenefitsOrResolvedPrices() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2);
    JSONObject request = approved(state);
    assertEquals("bank_transfer", request.getString("paymentMethod"));
    assertEquals("a".repeat(64), request.getString("quoteId"));
    assertTrue(request.getJSONObject("consent").getBoolean("agreement"));
    assertFalse(request.getJSONObject("consent").getBoolean("marketing"));
    for (String forbidden : new String[]{"benefits", "couponCode", "requestedPointsMinor", "discountMinor", "expectedQuote", "unitPrice"}) {
      assertFalse("Bayi otoritesi dışında alan: " + forbidden, request.has(forbidden));
    }
    JSONObject line = request.getJSONArray("items").getJSONObject(0);
    assertEquals(2, line.length());
    assertTrue(line.has("productId")); assertTrue(line.has("quantity"));
    assertFalse(line.has("price")); assertFalse(line.has("unitPrice")); assertFalse(line.has("discount"));
    assertEquals(request.toString(), approved(state()).toString());
  }
  @Test public void pendingIsSavedBeforeSendingAndFreezesCart() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2); approved(state); assertTrue(new JSONObject(disk).has("pending"));
    assertThrows(IllegalStateException.class, () -> state.quantity("p", 3));
  }
  @Test public void diskFailureNeverAllowsUnsavedSend() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2);
    DealerState failing = new DealerState(disk, json -> { throw new java.io.IOException("disk-full"); });
    assertThrows(java.io.IOException.class, () -> approved(failing));
    assertThrows(java.io.IOException.class, () -> approved(failing));
  }
  @Test public void paymentNoticeAndStatusRefreshCanOnlyUpdateSameFrozenReceipt() throws Exception {
    DealerState state=signedIn();state.quantity("p",1);
    JSONObject acceptedQuote=quoted(state);
    approved(state);
    JSONObject receipt=new JSONObject().put("ok",true).put("order_id","web_dealer_order_"+"a".repeat(32))
        .put("order_number","YA-20261107-0123456789").put("payment_status","unpaid")
        .put("delivery_status","unfulfilled").put("status","placed")
        .put("total_minor",1235).put("currency","TRY")
        .put("checkout",acceptedQuote);
    state.accepted(receipt);
    JSONObject update=new JSONObject().put("order_id",receipt.getString("order_id"))
        .put("order_number",receipt.getString("order_number"))
        .put("payment_status","verification_pending")
        .put("delivery_status","unfulfilled").put("status","placed");
    state.paymentStatus(update);
    assertEquals("verification_pending",state().object("last_receipt").getString("payment_status"));
    assertEquals(1235,state().object("last_receipt").getInt("total_minor"));
    assertEquals("bank_transfer",state().object("last_receipt").getJSONObject("checkout").getString("payment_method"));
    String before=disk;
    assertThrows(IllegalArgumentException.class,()->state.paymentStatus(new JSONObject(update.toString()).put("order_number","other")));
    assertThrows(IllegalArgumentException.class,()->state.paymentStatus(new JSONObject(update.toString()).put("payment_status","fake_paid")));
    assertEquals(before,disk);
    DealerState failing=new DealerState(disk,json->{throw new java.io.IOException("disk-full");});
    assertThrows(java.io.IOException.class,()->failing.paymentStatus(new JSONObject(update.toString()).put("payment_status","paid")));
    assertEquals("verification_pending",failing.object("last_receipt").getString("payment_status"));
    assertEquals(before,disk);
  }
  @Test public void acceptanceClearsPendingAndCartDurably() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1); approved(state); state.accepted(new JSONObject().put("order_id", "server-id"));
    DealerState reopened = state(); assertFalse(reopened.data.has("pending")); assertEquals(0, reopened.object("cart").length()); assertEquals("server-id", reopened.object("last_receipt").getString("order_id"));
  }
  @Test public void failedAcceptancePersistenceRetainsExactPendingRequest() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1);
    String request = approved(state).toString();
    DealerState failing = new DealerState(disk, json -> { throw new java.io.IOException("disk-full"); });
    assertThrows(java.io.IOException.class, () -> failing.accepted(new JSONObject().put("order_id", "server-id")));
    assertEquals(request, failing.object("pending").toString());
    assertEquals(1, failing.object("cart").getInt("p"));
    assertEquals(request, approved(state()).toString());
  }
  @Test public void revokedSessionPreservesHiddenDraftForSameOwner() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1); approved(state); String first = state.object("pending").toString(); state.invalidateSession();
    assertEquals("", state().text("cookie"));
    state.authenticate("https://firma.example/module/", "new-cookie", new JSONObject().put("access_id", "a")); assertEquals(first, state.object("pending").toString());
  }
  @Test public void otherDealerCannotSeePreviousPricesCartOrHistory() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1); state.favorite("p"); approved(state); state.put("orders", new JSONArray().put(new JSONObject().put("total", 20))); state.put("last_receipt", new JSONObject().put("quoted_total", 99));
    state.authenticate("https://firma.example/module/", "new-cookie", new JSONObject().put("access_id", "b"));
    assertEquals(0, state.object("cart").length()); assertFalse(state.data.has("catalog")); assertFalse(state.data.has("pending")); assertEquals(0, state.array("orders").length()); assertEquals(0, state.object("favorites").length()); assertFalse(state.data.has("last_receipt"));
  }
  @Test public void otherServerWithSameAccessIdClearsData() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2);
    state.authenticate("https://other.example/module/", "new", new JSONObject().put("access_id", "a")); assertEquals(0, state.object("cart").length());
  }
  @Test public void missingProductBlocksSubmissionButCanBeRemoved() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1); state.object("catalog").put("products", new JSONArray());
    assertThrows(IllegalArgumentException.class, state::draftOrder); state.quantity("p", 0); assertEquals(0, state.object("cart").length());
  }
  @Test public void mixedCurrenciesCannotBeSubmitted() throws Exception {
    DealerState state = signedIn(); state.product("q").put("currency", "USD"); state.quantity("p", 1); state.quantity("q", 1);
    assertThrows(IllegalArgumentException.class, state::draftOrder);
  }
  @Test public void corruptedOrStaleDealerPriceNeverCreatesPendingOrder() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2);
    for (Object invalid : new Object[]{-1, "NaN", JSONObject.NULL}) {
      state.product("p").put("price", invalid);
      assertThrows(IllegalArgumentException.class, state::total);
      assertThrows(IllegalArgumentException.class, state::draftOrder);
      assertFalse(state.data.has("pending"));
    }
    state.product("p").put("price", 12.35).put("currency", "invalid");
    assertThrows(IllegalArgumentException.class, state::draftOrder);
    assertFalse(state.data.has("pending"));
    state.product("p").put("currency", "TRY");
    assertEquals("24.70", state.total().toPlainString());
    assertEquals(1, state.draftOrder().getJSONArray("items").length());
  }
  @Test public void quantityBoundariesAndFractionalUnits() throws Exception {
    DealerState state = signedIn();
    for (double invalid : new double[]{-1, 1001, Double.NaN, Double.POSITIVE_INFINITY, 0.00001}) assertThrows(IllegalArgumentException.class, () -> state.quantity("p", invalid));
    state.quantity("p", 1.25); assertEquals("15.44", state.total().toPlainString()); state.quantity("p", 0); assertEquals(0, state.object("cart").length());
  }
  @Test public void deliveryRequiresAllowedMethodAndCompleteAddress() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1); state.put("delivery", "shipping");
    assertThrows(IllegalArgumentException.class, state::draftOrder);
    state.put("address", new JSONObject("{\"recipientName\":\"Bayi\",\"addressLine1\":\"Cadde\",\"district\":\"Merkez\",\"city\":\"İstanbul\",\"countryCode\":\"TR\"}"));
    assertEquals("shipping", state.draftOrder().getJSONObject("delivery").getString("method"));
  }
  @Test public void logoutClearsSessionAndPrivateState() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2); state.favorite("p"); state.logout();
    assertEquals("{}", disk);
  }

  @Test public void logoutPreservesOnlyTheBusinessConnection() throws Exception {
    DealerState state = signedIn(); state.put("connection_base", "https://firma.example/module/"); state.quantity("p",2); state.logout();
    assertEquals("https://firma.example/module/",state.text("connection_base"));
    assertEquals(1,state.data.length());
  }

  @Test public void reorderUsesCurrentCatalogAndSkipsUnavailableProducts() throws Exception {
    DealerState state = signedIn(); state.product("p").put("price", 20);
    int missing = state.reorder(new JSONArray("[{\"product_id\":\"p\",\"quantity\":2},{\"product_id\":\"removed\",\"quantity\":3}]"));
    assertEquals(1, missing); assertEquals("40.00", state.total().toPlainString());
  }
  @Test public void reorderValidationCannotPartiallyChangeExistingCart() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1); String before = disk;
    assertThrows(IllegalArgumentException.class, () -> state.reorder(new JSONArray("[{\"product_id\":\"p\",\"quantity\":2},{\"product_id\":\"q\",\"quantity\":1001}]")));
    assertEquals(before, disk); assertEquals(1, state.object("cart").getInt("p"));
  }

  @Test public void switchingAfterRevocationNeverSilentlyLosesOldPendingDraft() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2); state.put("note", "private-a"); String request = approved(state).toString(); state.invalidateSession();
    state.authenticate("https://firma.example/module/", "b-cookie", new JSONObject().put("access_id", "b"));
    assertFalse(state.data.has("pending")); assertEquals("", state.text("note")); assertEquals(0, state.object("cart").length());
    state.logout(); state = state();
    state.authenticate("https://firma.example/module/", "a-cookie", new JSONObject().put("access_id", "a"));
    assertEquals(request, state.object("pending").toString()); assertEquals(2, state.object("cart").getInt("p")); assertEquals("private-a", state.text("note"));
    assertFalse(state.data.has("catalog"));
  }

  private static String cartId(DealerState state, String name) throws Exception {
    JSONArray carts = state.carts();
    for (int i = 0; i < carts.length(); i++) if (name.equals(carts.getJSONObject(i).getString("name"))) return carts.getJSONObject(i).getString("id");
    throw new AssertionError("Sepet bulunamadı: " + name);
  }

  @Test public void independentCartsKeepTheirOwnCartNoteAndDeliveryAcrossSwitches() throws Exception {
    DealerState state = signedIn();
    state.quantity("p", 2); state.put("note", "A notu"); state.put("delivery", "shipping");
    state.put("address", new JSONObject("{\"recipientName\":\"Bayi A\",\"addressLine1\":\"Cadde\",\"district\":\"Merkez\",\"city\":\"İstanbul\",\"countryCode\":\"TR\"}"));
    String first = state.activeCartId();
    String second = state.newCart("İkinci");
    assertEquals(2, state.carts().length()); assertEquals(second, state.activeCartId());
    assertTrue(state.carts().getJSONObject(1).getBoolean("active") == false);
    assertEquals(0, state.object("cart").length()); assertEquals("", state.text("note")); assertEquals(0, state.object("address").length());
    state.quantity("q", 3); state.put("note", "B notu"); state.put("delivery", "pickup");
    state.selectCart(first);
    assertEquals(2, state.object("cart").getInt("p")); assertEquals("A notu", state.text("note"));
    assertEquals("shipping", state.text("delivery")); assertEquals("Bayi A", state.object("address").getString("recipientName"));
    assertEquals("24.70", state.total().toPlainString());
    state.selectCart(second);
    assertEquals(3, state.object("cart").getInt("q")); assertEquals("B notu", state.text("note"));
    assertEquals("pickup", state.text("delivery")); assertEquals(0, state.object("address").length());
    DealerState reopened = state();
    assertEquals(second, reopened.activeCartId()); assertEquals("İkinci", reopened.activeCartName());
    assertEquals(3, reopened.object("cart").getInt("q"));
    reopened.selectCart(first); assertEquals(2, reopened.object("cart").getInt("p")); assertEquals("A notu", reopened.text("note"));
  }

  @Test public void ownerSwitchKeepsEveryCartIsolatedAndRestoresThem() throws Exception {
    DealerState state = signedIn();
    state.quantity("p", 1); state.put("note", "A-1");
    String aFirst = state.activeCartId();
    String aSecond = state.newCart("A İkinci"); state.quantity("q", 2); state.put("note", "A-2");
    state.authenticate("https://firma.example/module/", "b-cookie", new JSONObject().put("access_id", "b"));
    assertEquals(1, state.carts().length()); assertEquals(0, state.object("cart").length()); assertEquals("", state.text("note"));
    assertFalse(state.data.has("carts"));
    state.put("catalog", new JSONObject("{\"catalog_revision\":\"" + "b".repeat(64) + "\",\"delivery_methods\":[\"pickup\"],\"products\":[{\"product_id\":\"p\",\"price\":1,\"currency\":\"TRY\"}]}"));
    state.quantity("p", 4); String bCart = state.activeCartId(); state.put("note", "B-1");
    state.authenticate("https://firma.example/module/", "a-cookie", new JSONObject().put("access_id", "a"));
    assertEquals(2, state.carts().length()); assertEquals(aSecond, state.activeCartId());
    state.selectCart(aFirst); assertEquals(1, state.object("cart").getInt("p")); assertEquals("A-1", state.text("note"));
    state.selectCart(aSecond); assertEquals(2, state.object("cart").getInt("q")); assertEquals("A-2", state.text("note"));
    state.authenticate("https://firma.example/module/", "b-cookie", new JSONObject().put("access_id", "b"));
    state.selectCart(bCart); assertEquals(4, state.object("cart").getInt("p")); assertEquals("B-1", state.text("note"));
    assertEquals(1, state.carts().length());
  }

  @Test public void atMostFiveCartsWithTheActiveOneIncluded() throws Exception {
    DealerState state = signedIn();
    for (int i = 2; i <= 5; i++) state.newCart("Sepet " + i);
    assertEquals(DealerState.MAX_CARTS, state.carts().length());
    assertThrows(IllegalArgumentException.class, () -> state.newCart("Sepet 6"));
    assertEquals(DealerState.MAX_CARTS, state.carts().length());
    assertEquals(5, state.carts().length());
  }

  @Test public void pendingBlocksCartCreationSelectionRenameAndDeleteUntilAcknowledged() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1);
    String first = state.activeCartId();
    String second = state.newCart("İkinci"); state.quantity("q", 2);
    String request = approved(state).toString();
    assertEquals(request, approved(state()).toString());
    assertThrows(IllegalStateException.class, () -> state.newCart("Üçüncü"));
    assertThrows(IllegalStateException.class, () -> state.selectCart(first));
    assertThrows(IllegalStateException.class, () -> state.renameCart(second, "Yeni"));
    assertThrows(IllegalStateException.class, () -> state.deleteCart(first));
    assertEquals(second, state.activeCartId()); assertEquals(2, state.object("cart").getInt("q"));
    assertEquals(2, state.carts().length());
    state.accepted(new JSONObject().put("order_id", "server-id"));
    state.selectCart(first); assertEquals(1, state.object("cart").getInt("p"));
    state.selectCart(second); assertEquals(0, state.object("cart").length());
    state.newCart("Üçüncü"); assertEquals(3, state.carts().length());
  }

  @Test public void acceptanceClearsOnlyTheActiveCartAndKeepsOtherSnapshots() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1); state.put("note", "ilk");
    String first = state.activeCartId();
    String second = state.newCart("İkinci"); state.quantity("q", 2); state.put("note", "ikinci");
    approved(state); state.accepted(new JSONObject().put("order_id", "x"));
    assertEquals(0, state.object("cart").length()); assertEquals("", state.text("note"));
    JSONObject kept = state.object("carts").getJSONObject(first);
    assertEquals(1, kept.getJSONObject("cart").getInt("p")); assertEquals("ilk", kept.getString("note"));
    state.selectCart(first);
    assertEquals(1, state.object("cart").getInt("p")); assertEquals("ilk", state.text("note"));
    JSONObject cleared = state.object("carts").getJSONObject(second);
    assertFalse(cleared.has("cart")); assertFalse(cleared.has("note"));
  }

  @Test public void deleteGuardsInvalidIdsAndPromotesRemainingCart() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1);
    String first = state.activeCartId();
    String second = state.newCart("İkinci"); state.quantity("q", 2);
    assertThrows(IllegalArgumentException.class, () -> state.selectCart("yok"));
    assertThrows(IllegalArgumentException.class, () -> state.selectCart(""));
    assertThrows(IllegalArgumentException.class, () -> state.deleteCart("yok"));
    assertThrows(IllegalArgumentException.class, () -> state.deleteCart(" "));
    assertThrows(IllegalArgumentException.class, () -> state.renameCart("yok", "X"));
    state.deleteCart(first);
    assertEquals(1, state.carts().length()); assertEquals(second, state.activeCartId());
    assertEquals(2, state.object("cart").getInt("q"));
    state.deleteCart(second);
    assertEquals(0, state.object("cart").length()); assertEquals("", state.text("cart_id"));
    assertEquals(1, state.carts().length());
  }

  @Test public void diskFailureLeavesLiveMultiCartStateUnchanged() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1);
    String first = state.activeCartId();
    String second = state.newCart("İkinci"); state.quantity("q", 2);
    String before = disk; int count = state.carts().length();
    DealerState failing = new DealerState(disk, json -> { throw new java.io.IOException("disk-full"); });
    assertThrows(java.io.IOException.class, () -> failing.newCart("Üçüncü"));
    assertThrows(java.io.IOException.class, () -> failing.renameCart(second, "Yeni"));
    assertThrows(java.io.IOException.class, () -> failing.selectCart(first));
    assertThrows(java.io.IOException.class, () -> failing.deleteCart(first));
    assertEquals(before, disk); assertEquals(count, failing.carts().length());
    assertEquals(second, failing.activeCartId()); assertEquals("İkinci", failing.activeCartName());
    assertEquals(2, failing.object("cart").getInt("q"));
    state.selectCart(first);
    assertEquals(first, state().activeCartId());
    assertEquals(1, state().object("cart").getInt("p"));
  }

  @Test public void cartNamesAreTrimmedLimitedAndUnique() throws Exception {
    DealerState state = signedIn();
    assertThrows(IllegalArgumentException.class, () -> state.newCart("   "));
    assertThrows(IllegalArgumentException.class, () -> state.newCart("x".repeat(DealerState.MAX_CART_NAME + 1)));
    assertThrows(IllegalArgumentException.class, () -> state.newCart("Sepet 1"));
    String id = state.newCart("  Alışveriş  ");
    assertEquals("Alışveriş", state.activeCartName());
    assertThrows(IllegalArgumentException.class, () -> state.newCart("alışveriş"));
    assertThrows(IllegalArgumentException.class, () -> state.renameCart(id, "Sepet 1"));
    state.renameCart(id, "  Yeni Ad  "); assertEquals("Yeni Ad", state.activeCartName());
    state.renameCart(id, "Yeni Ad"); assertEquals("Yeni Ad", state.activeCartName());
    state.renameCart(id, "y".repeat(DealerState.MAX_CART_NAME));
    assertEquals(DealerState.MAX_CART_NAME, state.activeCartName().length());
  }

  @Test public void newCartCannotDuplicateTheActiveCartName() throws Exception {
    DealerState state = signedIn();
    assertEquals("Sepet 1", state.activeCartName());
    assertThrows(IllegalArgumentException.class, () -> state.newCart("Sepet 1"));
    assertThrows(IllegalArgumentException.class, () -> state.newCart("  sepet 1  "));
    String second = state.newCart("İkinci");
    assertEquals(second, state.activeCartId());
    assertThrows(IllegalArgumentException.class, () -> state.newCart("İkinci"));
    state.selectCart(cartId(state, "Sepet 1"));
    assertThrows(IllegalArgumentException.class, () -> state.newCart("İkinci"));
    assertEquals(2, state.carts().length());
  }
}

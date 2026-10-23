package com.yardimciasistan.dealer;

import org.junit.Test;
import static org.junit.Assert.*;
import org.json.*;

public class DealerStateTest {
  private String disk = "{}";
  private DealerState state() throws Exception { return new DealerState(disk, json -> disk = json); }
  private DealerState signedIn() throws Exception {
    DealerState state = state(); state.authenticate("https://firma.example/module/", "session-a", new JSONObject().put("access_id", "a"));
    state.put("catalog", new JSONObject("{\"catalog_revision\":\"" + "a".repeat(64) + "\",\"delivery_methods\":[\"pickup\",\"shipping\"],\"products\":[{\"product_id\":\"p\",\"name\":\"Ürün\",\"price\":12.35,\"currency\":\"TRY\"},{\"product_id\":\"q\",\"name\":\"İkinci\",\"price\":2.1,\"currency\":\"TRY\"}]}"));
    return state;
  }
  @Test public void offlineCartAndFavoritesSurviveRestart() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2); state.quantity("q", 3); state.favorite("p");
    DealerState reopened = state(); assertEquals(2, reopened.object("cart").getInt("p")); assertTrue(reopened.object("favorites").has("p")); assertEquals("31.00", reopened.total().toPlainString());
  }
  @Test public void lostResponseRetriesExactRequestAfterRestart() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2); state.put("note", "Deneme");
    String first = state.prepareOrder().toString(); assertEquals(first, state().prepareOrder().toString());
    assertFalse(first.contains("unitPrice")); assertFalse(first.contains("customerId")); assertFalse(first.contains("priceGroup"));
  }
  @Test public void pendingIsSavedBeforeSendingAndFreezesCart() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2); state.prepareOrder(); assertTrue(new JSONObject(disk).has("pending"));
    assertThrows(IllegalStateException.class, () -> state.quantity("p", 3));
  }
  @Test public void diskFailureNeverAllowsUnsavedSend() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2);
    DealerState failing = new DealerState(disk, json -> { throw new java.io.IOException("disk-full"); });
    assertThrows(java.io.IOException.class, failing::prepareOrder);
    assertThrows(java.io.IOException.class, failing::prepareOrder);
  }
  @Test public void acceptanceClearsPendingAndCartDurably() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1); state.prepareOrder(); state.accepted(new JSONObject().put("order_id", "server-id"));
    DealerState reopened = state(); assertFalse(reopened.data.has("pending")); assertEquals(0, reopened.object("cart").length()); assertEquals("server-id", reopened.object("last_receipt").getString("order_id"));
  }
  @Test public void revokedSessionPreservesHiddenDraftForSameOwner() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1); state.prepareOrder(); String first = state.object("pending").toString(); state.invalidateSession();
    assertEquals("", state().text("cookie"));
    state.authenticate("https://firma.example/module/", "new-cookie", new JSONObject().put("access_id", "a")); assertEquals(first, state.object("pending").toString());
  }
  @Test public void otherDealerCannotSeePreviousPricesCartOrHistory() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1); state.favorite("p"); state.prepareOrder(); state.put("orders", new JSONArray().put(new JSONObject().put("total", 20))); state.put("last_receipt", new JSONObject().put("quoted_total", 99));
    state.authenticate("https://firma.example/module/", "new-cookie", new JSONObject().put("access_id", "b"));
    assertEquals(0, state.object("cart").length()); assertFalse(state.data.has("catalog")); assertFalse(state.data.has("pending")); assertEquals(0, state.array("orders").length()); assertEquals(0, state.object("favorites").length()); assertFalse(state.data.has("last_receipt"));
  }
  @Test public void otherServerWithSameAccessIdClearsData() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2);
    state.authenticate("https://other.example/module/", "new", new JSONObject().put("access_id", "a")); assertEquals(0, state.object("cart").length());
  }
  @Test public void missingProductBlocksSubmissionButCanBeRemoved() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1); state.object("catalog").put("products", new JSONArray());
    assertThrows(IllegalArgumentException.class, state::prepareOrder); state.quantity("p", 0); assertEquals(0, state.object("cart").length());
  }
  @Test public void mixedCurrenciesCannotBeSubmitted() throws Exception {
    DealerState state = signedIn(); state.product("q").put("currency", "USD"); state.quantity("p", 1); state.quantity("q", 1);
    assertThrows(IllegalArgumentException.class, state::prepareOrder);
  }
  @Test public void quantityBoundariesAndFractionalUnits() throws Exception {
    DealerState state = signedIn();
    for (double invalid : new double[]{-1, 1001, Double.NaN, Double.POSITIVE_INFINITY, 0.00001}) assertThrows(IllegalArgumentException.class, () -> state.quantity("p", invalid));
    state.quantity("p", 1.25); assertEquals("15.44", state.total().toPlainString()); state.quantity("p", 0); assertEquals(0, state.object("cart").length());
  }
  @Test public void deliveryRequiresAllowedMethodAndCompleteAddress() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 1); state.put("delivery", "shipping");
    assertThrows(IllegalArgumentException.class, state::prepareOrder);
    state.put("address", new JSONObject("{\"recipientName\":\"Bayi\",\"addressLine1\":\"Cadde\",\"district\":\"Merkez\",\"city\":\"İstanbul\",\"countryCode\":\"TR\"}"));
    assertEquals("shipping", state.prepareOrder().getJSONObject("delivery").getString("method"));
  }
  @Test public void logoutClearsSessionAndPrivateState() throws Exception {
    DealerState state = signedIn(); state.quantity("p", 2); state.favorite("p"); state.logout();
    assertEquals("{}", disk);
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
    DealerState state = signedIn(); state.quantity("p", 2); state.put("note", "private-a"); String request = state.prepareOrder().toString(); state.invalidateSession();
    state.authenticate("https://firma.example/module/", "b-cookie", new JSONObject().put("access_id", "b"));
    assertFalse(state.data.has("pending")); assertEquals("", state.text("note")); assertEquals(0, state.object("cart").length());
    state.logout(); state = state();
    state.authenticate("https://firma.example/module/", "a-cookie", new JSONObject().put("access_id", "a"));
    assertEquals(request, state.object("pending").toString()); assertEquals(2, state.object("cart").getInt("p")); assertEquals("private-a", state.text("note"));
    assertFalse(state.data.has("catalog"));
  }
}

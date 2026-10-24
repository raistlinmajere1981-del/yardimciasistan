package com.yardimciasistan.dealer;

import org.json.JSONArray;
import org.json.JSONObject;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

/** Device drafts/cache only. All prices/statuses originate from the authenticated API. */
final class DealerState {
  interface Persistence { void write(String json) throws Exception; }
  final JSONObject data;
  private final Persistence persistence;
  DealerState(String json, Persistence persistence) throws Exception {
    data = new JSONObject(json); this.persistence = persistence;
  }
  void save() throws Exception { persistence.write(data.toString()); }
  String text(String key) { return data.optString(key, ""); }
  JSONObject object(String key) { JSONObject value = data.optJSONObject(key); return value == null ? new JSONObject() : value; }
  JSONArray array(String key) { JSONArray value = data.optJSONArray(key); return value == null ? new JSONArray() : value; }
  JSONObject brandingFor(String base) {
    return base.equals(text("branding_base")) ? object("branding") : new JSONObject();
  }
  void updateBranding(String base, JSONObject display) throws Exception {
    data.put("branding_base", base).put("branding", display)
        .put("branding_at", System.currentTimeMillis());
    save();
  }
  void put(String key, Object value) throws Exception { data.put(key, value); save(); }
  void authenticate(String base, String cookie, JSONObject dealer) throws Exception {
    String owner = base + "|" + dealer.getString("access_id");
    if (!owner.equals(text("owner"))) {
      JSONObject drafts = object("saved_drafts");
      String[] draftFields = {"cart", "pending", "note", "address", "delivery", "favorites"};
      if (!text("owner").isEmpty() && (object("cart").length() > 0 || data.has("pending"))) {
        JSONObject previous = new JSONObject();
        for (String key : draftFields) if (data.has(key)) previous.put(key, data.get(key));
        drafts.put(text("owner"), new JSONObject(previous.toString()));
      }
      for (String key : new String[]{"catalog", "orders", "cart", "favorites", "pending", "last_receipt", "note", "address", "delivery", "catalog_at", "orders_at"}) data.remove(key);
      JSONObject restored = drafts.optJSONObject(owner);
      if (restored != null) for (String key : draftFields) if (restored.has(key)) data.put(key, restored.get(key));
      drafts.remove(owner);
      if (drafts.length() > 0) data.put("saved_drafts", drafts); else data.remove("saved_drafts");
    }
    data.put("owner", owner).put("base", base).put("cookie", cookie).put("dealer", dealer); save();
  }
  void invalidateSession() throws Exception { data.remove("cookie"); save(); }
  JSONObject product(String id) {
    JSONArray products = object("catalog").optJSONArray("products");
    if (products != null) for (int i = 0; i < products.length(); i++) {
      JSONObject product = products.optJSONObject(i);
      if (product != null && id.equals(product.optString("product_id"))) return product;
    }
    return null;
  }
  void quantity(String id, double amount) throws Exception {
    if (data.has("pending")) throw new IllegalStateException("Bekleyen siparişi önce aynı kimlikle tekrar deneyin.");
    if (!Double.isFinite(amount) || amount < 0 || amount > 1000 || Math.abs(amount * 10000 - Math.rint(amount * 10000)) > 0.00001) throw new IllegalArgumentException("Miktar 0–1000 arasında, en fazla dört ondalık basamaklı olmalı.");
    JSONObject cart = new JSONObject(object("cart").toString());
    if (amount == 0) cart.remove(id); else {
      if (product(id) == null) throw new IllegalArgumentException("Ürün güncel katalogda bulunamadı.");
      if (!cart.has(id) && cart.length() >= 50) throw new IllegalArgumentException("Sepete en fazla 50 farklı ürün eklenebilir.");
      cart.put(id, amount);
    }
    double sum = 0; for (java.util.Iterator<String> it = cart.keys(); it.hasNext();) sum += cart.getDouble(it.next());
    if (sum > 10000) throw new IllegalArgumentException("Toplam miktar 10000 sınırını aşıyor.");
    data.put("cart", cart); save();
  }
  BigDecimal total() throws Exception {
    BigDecimal total = BigDecimal.ZERO; String currency = null; JSONObject cart = object("cart");
    for (java.util.Iterator<String> it = cart.keys(); it.hasNext();) {
      String id = it.next(); JSONObject product = product(id);
      if (product == null) throw new IllegalArgumentException("Sepette artık sunulmayan ürün var. Ürünü sepetten çıkarın.");
      if (currency != null && !currency.equals(product.getString("currency"))) throw new IllegalArgumentException("Farklı para birimleri aynı siparişte kullanılamaz.");
      currency = product.getString("currency");
      total = total.add(new BigDecimal(product.get("price").toString()).multiply(new BigDecimal(cart.get(id).toString())).setScale(2, RoundingMode.HALF_UP));
    }
    return total;
  }
  JSONObject prepareOrder() throws Exception {
    if (data.has("pending")) { save(); return new JSONObject(object("pending").toString()); }
    total(); JSONObject cart = object("cart");
    if (cart.length() == 0) throw new IllegalArgumentException("Sepetiniz boş.");
    JSONArray items = new JSONArray();
    for (java.util.Iterator<String> it = cart.keys(); it.hasNext();) {
      String id = it.next(); items.put(new JSONObject().put("productId", id).put("quantity", cart.getDouble(id)));
    }
    String method = text("delivery");
    if (method.isEmpty()) method = "pickup";
    JSONArray allowed = object("catalog").optJSONArray("delivery_methods"); boolean found = false;
    if (allowed != null) for (int i = 0; i < allowed.length(); i++) if (method.equals(allowed.getString(i))) found = true;
    if (!found) throw new IllegalArgumentException("Geçerli bir teslimat tercihi seçin.");
    JSONObject address = object("address");
    if (method.equals("shipping")) for (String key : new String[]{"recipientName", "addressLine1", "district", "city", "countryCode"}) {
      if (address.optString(key).trim().isEmpty()) throw new IllegalArgumentException("Teslimat adresindeki zorunlu alanları doldurun.");
    }
    JSONObject request = new JSONObject().put("idempotencyKey", UUID.randomUUID().toString()).put("items", items)
        .put("catalogRevision", object("catalog").getString("catalog_revision"))
        .put("delivery", new JSONObject().put("method", method).put("address", method.equals("shipping") ? address : JSONObject.NULL))
        .put("note", text("note"));
    // Freeze an independent snapshot before the first byte is sent. Retried verbatim after restart.
    data.put("pending", new JSONObject(request.toString())); save(); return object("pending");
  }
  void accepted(JSONObject receipt) throws Exception {
    data.put("last_receipt", receipt); data.remove("pending"); data.remove("cart"); data.remove("note"); save();
  }
  int reorder(JSONArray items) throws Exception {
    if (data.has("pending")) throw new IllegalStateException("Bekleyen siparişi önce aynı kimlikle tekrar deneyin.");
    DealerState draft = new DealerState(data.toString(), json -> {}); int missing = 0;
    for (int i = 0; i < items.length(); i++) {
      JSONObject item = items.getJSONObject(i); String id = item.getString("product_id");
      if (draft.product(id) == null) { missing++; continue; }
      draft.quantity(id, draft.object("cart").optDouble(id, 0) + item.getDouble("quantity"));
    }
    draft.total(); data.put("cart", draft.object("cart")); save(); return missing;
  }
  void favorite(String id) throws Exception {
    JSONObject favorites = object("favorites");
    if (favorites.has(id)) favorites.remove(id); else favorites.put(id, true);
    put("favorites", favorites);
  }
  void logout() throws Exception {
    JSONObject drafts = object("saved_drafts");
    String connection = text("connection_base");
    JSONObject lastBrand = brandingFor(connection);
    long lastBrandAt = data.optLong("branding_at", 0);
    java.util.List<String> keys = new java.util.ArrayList<>(); data.keys().forEachRemaining(keys::add);
    for (String key : keys) data.remove(key);
    if (drafts.length() > 0) data.put("saved_drafts", drafts);
    if (!connection.isEmpty()) data.put("connection_base", connection);
    if (!connection.isEmpty() && lastBrand.length() > 0) {
      data.put("branding_base", connection).put("branding", lastBrand)
          .put("branding_at", lastBrandAt);
    }
    save();
  }
}

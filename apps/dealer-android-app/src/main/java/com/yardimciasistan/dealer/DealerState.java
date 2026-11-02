package com.yardimciasistan.dealer;

import org.json.JSONArray;
import org.json.JSONObject;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

/** Device drafts/cache only. All prices/statuses originate from the authenticated API. */
final class DealerState {
  interface Persistence { void write(String json) throws Exception; }
  static final int MAX_CARTS = 5;
  static final int MAX_CART_NAME = 40;
  private static final String DEFAULT_CART_ID = "cart-1";
  private static final String[] CART_FIELDS = {"cart", "note", "delivery", "address"};
  final JSONObject data;
  private final Persistence persistence;
  DealerState(String json, Persistence persistence) throws Exception {
    data = new JSONObject(json); this.persistence = persistence;
  }
  // Save drafts regardless of login preference, but persist bearer cookies only with opt-in.
  private static String diskJson(JSONObject source) throws Exception {
    JSONObject copy = new JSONObject(source.toString());
    if (!copy.optBoolean("remember_me", copy.has("cookie"))) copy.remove("cookie");
    return copy.toString();
  }
  void save() throws Exception { persistence.write(diskJson(data)); }
  boolean rememberMe() { return data.optBoolean("remember_me", data.has("cookie")); }
  void setRememberMe(boolean enabled) throws Exception {
    JSONObject next = new JSONObject(data.toString()).put("remember_me", enabled);
    commit(next); // preference and removal of a previously saved cookie must be atomic
  }
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
    authenticate(base, cookie, dealer, rememberMe());
  }
  void authenticate(String base, String cookie, JSONObject dealer, boolean remember) throws Exception {
    String owner = base + "|" + dealer.getString("access_id");
    if (!owner.equals(text("owner"))) {
      JSONObject drafts = object("saved_drafts");
      String[] draftFields = {"cart", "carts", "cart_id", "cart_name", "pending", "note", "address", "delivery", "favorites"};
      if (!text("owner").isEmpty() && (object("cart").length() > 0 || object("carts").length() > 0 || data.has("pending"))) {
        JSONObject previous = new JSONObject();
        for (String key : draftFields) if (data.has(key)) previous.put(key, data.get(key));
        drafts.put(text("owner"), new JSONObject(previous.toString()));
      }
      for (String key : new String[]{"catalog", "orders", "cart", "carts", "cart_id", "cart_name", "favorites", "pending", "last_receipt", "note", "address", "delivery", "catalog_at", "orders_at"}) data.remove(key);
      JSONObject restored = drafts.optJSONObject(owner);
      if (restored != null) for (String key : draftFields) if (restored.has(key)) data.put(key, restored.get(key));
      drafts.remove(owner);
      if (drafts.length() > 0) data.put("saved_drafts", drafts); else data.remove("saved_drafts");
    }
    data.put("owner", owner).put("base", base).put("cookie", cookie).put("dealer", dealer).put("remember_me", remember); save();
  }
  /** Persist the server's rotated pair before any retry. A failed write leaves live state intact. */
  void rotateCookie(String cookie) throws Exception {
    if (!DealerApi.hasRotatedPair(cookie)) throw new IllegalArgumentException("Geçersiz oturum yenilemesi.");
    commit(new JSONObject(data.toString()).put("cookie", cookie));
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
      String productCurrency = product.optString("currency", "");
      if (!productCurrency.matches("[A-Z]{3}")) throw new IllegalArgumentException("Bayi ürününün para birimi geçersiz. Kataloğu yenileyin.");
      if (currency != null && !currency.equals(productCurrency)) throw new IllegalArgumentException("Farklı para birimleri aynı siparişte kullanılamaz.");
      currency = productCurrency;
      BigDecimal unitPrice;
      try { unitPrice = new BigDecimal(product.get("price").toString()); }
      catch (Exception error) { throw new IllegalArgumentException("Bayi ürününün fiyatı geçersiz. Kataloğu yenileyin."); }
      if (unitPrice.signum() < 0) throw new IllegalArgumentException("Bayi ürününün fiyatı geçersiz. Kataloğu yenileyin.");
      total = total.add(unitPrice.multiply(new BigDecimal(cart.get(id).toString())).setScale(2, RoundingMode.HALF_UP));
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
    JSONObject next = new JSONObject(data.toString());
    next.put("last_receipt", receipt); next.remove("pending"); next.remove("cart"); next.remove("note");
    persistence.write(diskJson(next));
    data.put("last_receipt", receipt); data.remove("pending"); data.remove("cart"); data.remove("note");
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

  /** Active cart id, synthesized in memory for legacy state without an explicit identity. */
  String activeCartId() { String id = text("cart_id"); return id.isEmpty() ? DEFAULT_CART_ID : id; }
  /** Active cart name, synthesized in memory for legacy state without an explicit name. */
  String activeCartName() { String name = text("cart_name").trim(); return name.isEmpty() ? "Sepet 1" : name; }

  /** All carts of the current owner; the active one is listed first. */
  JSONArray carts() throws Exception {
    JSONArray list = new JSONArray();
    list.put(new JSONObject().put("id", activeCartId()).put("name", activeCartName()).put("active", true));
    JSONObject others = object("carts");
    for (java.util.Iterator<String> it = others.keys(); it.hasNext();) {
      String id = it.next(); JSONObject entry = others.optJSONObject(id);
      if (entry != null) list.put(new JSONObject().put("id", id).put("name", entry.optString("name", "")).put("active", false));
    }
    return list;
  }

  /** Creates an independent named cart and makes it active. Returns the new cart id. */
  String newCart(String name) throws Exception {
    requireNoPending();
    String clean = cleanCartName(name);
    // The active cart is snapshotted, not replaced, so its name must stay unique too.
    requireUniqueCartName(clean, null);
    JSONObject next = new JSONObject(data.toString());
    JSONObject others = next.optJSONObject("carts"); if (others == null) others = new JSONObject();
    if (1 + others.length() >= MAX_CARTS) throw new IllegalArgumentException("En fazla " + MAX_CARTS + " sepet oluşturulabilir.");
    others.put(activeCartId(), snapshotOf(next, activeCartName()));
    String id = UUID.randomUUID().toString();
    clearCartFields(next);
    next.put("carts", others).put("cart_id", id).put("cart_name", clean);
    commit(next); return id;
  }

  /** Switches the active cart, keeping every other cart snapshot intact. */
  void selectCart(String id) throws Exception {
    requireNoPending();
    String target = requireCartId(id);
    if (target.equals(activeCartId())) return;
    JSONObject next = new JSONObject(data.toString());
    JSONObject others = next.optJSONObject("carts");
    JSONObject entry = others == null ? null : others.optJSONObject(target);
    if (entry == null) throw new IllegalArgumentException("Sepet bulunamadı.");
    others.put(activeCartId(), snapshotOf(next, activeCartName()));
    others.remove(target);
    clearCartFields(next);
    putCartFields(next, entry);
    next.put("carts", others).put("cart_id", target).put("cart_name", entry.optString("name", "Sepet"));
    commit(next);
  }

  /** Renames the active or a stored cart. */
  void renameCart(String id, String name) throws Exception {
    requireNoPending();
    String target = requireCartId(id);
    String clean = cleanCartName(name);
    requireUniqueCartName(clean, target);
    JSONObject next = new JSONObject(data.toString());
    if (target.equals(activeCartId())) next.put("cart_name", clean);
    else {
      JSONObject others = next.optJSONObject("carts");
      JSONObject entry = others == null ? null : others.optJSONObject(target);
      if (entry == null) throw new IllegalArgumentException("Sepet bulunamadı.");
      entry.put("name", clean);
    }
    commit(next);
  }

  /** Deletes a cart; deleting the active one promotes the next stored cart. */
  void deleteCart(String id) throws Exception {
    requireNoPending();
    String target = requireCartId(id);
    JSONObject next = new JSONObject(data.toString());
    JSONObject others = next.optJSONObject("carts"); if (others == null) others = new JSONObject();
    if (!target.equals(activeCartId())) {
      others.remove(target);
      next.put("carts", others);
      commit(next); return;
    }
    clearCartFields(next);
    others.remove(target);
    if (others.length() > 0) {
      String promoted = others.keys().next();
      JSONObject entry = others.optJSONObject(promoted);
      others.remove(promoted);
      putCartFields(next, entry);
      next.put("cart_id", promoted).put("cart_name", entry.optString("name", "Sepet"));
    } else {
      next.put("cart_id", "").put("cart_name", "");
    }
    next.put("carts", others);
    commit(next);
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

  private void requireNoPending() {
    if (data.has("pending")) throw new IllegalStateException("Bekleyen siparişi önce aynı kimlikle tekrar deneyin.");
  }
  private String cleanCartName(String name) {
    String clean = name == null ? "" : name.trim();
    if (clean.isEmpty()) throw new IllegalArgumentException("Sepet adı boş olamaz.");
    if (clean.length() > MAX_CART_NAME) throw new IllegalArgumentException("Sepet adı en fazla " + MAX_CART_NAME + " karakter olabilir.");
    return clean;
  }
  private void requireUniqueCartName(String name, String exceptId) {
    if (!activeCartId().equals(exceptId) && name.equalsIgnoreCase(activeCartName())) throw new IllegalArgumentException("Bu sepet adı zaten kullanılıyor.");
    JSONObject others = object("carts");
    for (java.util.Iterator<String> it = others.keys(); it.hasNext();) {
      String id = it.next(); if (id.equals(exceptId)) continue;
      JSONObject entry = others.optJSONObject(id);
      if (entry != null && name.equalsIgnoreCase(entry.optString("name", "").trim())) throw new IllegalArgumentException("Bu sepet adı zaten kullanılıyor.");
    }
  }
  private String requireCartId(String id) {
    String cartId = id == null ? "" : id.trim();
    if (cartId.isEmpty()) throw new IllegalArgumentException("Geçersiz sepet kimliği.");
    if (cartId.equals(activeCartId())) return cartId;
    if (!object("carts").has(cartId)) throw new IllegalArgumentException("Sepet bulunamadı.");
    return cartId;
  }
  private static JSONObject snapshotOf(JSONObject source, String name) throws Exception {
    JSONObject entry = new JSONObject().put("name", name);
    for (String key : CART_FIELDS) if (source.has(key)) entry.put(key, copy(source.get(key)));
    return entry;
  }
  private static void clearCartFields(JSONObject target) {
    for (String key : CART_FIELDS) target.remove(key);
  }
  private static void putCartFields(JSONObject target, JSONObject entry) throws Exception {
    for (String key : CART_FIELDS) if (entry.has(key)) target.put(key, copy(entry.get(key)));
  }
  private static Object copy(Object value) throws Exception {
    if (value instanceof JSONObject) return new JSONObject(value.toString());
    if (value instanceof JSONArray) return new JSONArray(value.toString());
    return value;
  }
  /** Copy-on-write: persist first, only then replace live state. */
  private void commit(JSONObject next) throws Exception {
    persistence.write(diskJson(next));
    java.util.List<String> keys = new java.util.ArrayList<>(); data.keys().forEachRemaining(keys::add);
    for (String key : keys) data.remove(key);
    for (java.util.Iterator<String> it = next.keys(); it.hasNext();) {
      String key = it.next(); data.put(key, next.get(key));
    }
  }
}

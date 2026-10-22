package com.yardimciasistan.dealer;

import android.app.AlertDialog;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.text.InputType;
import android.view.View;
import android.widget.*;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.NumberFormat;
import java.util.*;
import java.util.concurrent.*;

/** Four native destinations. No Companion permissions, device actions or publication credentials. */
public final class DealerActivity extends ComponentActivity {
  private DealerApplicationForm application;
  private DealerState state;
  private LinearLayout shell, body, navigation;
  private final ExecutorService network = Executors.newSingleThreadExecutor();
  private DealerImages images;
  private String tab = "Katalog", detail = "", message = "", query = "", category = "Tüm kategoriler", brand = "Tüm markalar";
  private String loginBase = "", loginInvite = "";
  private boolean busy, favoritesOnly, storageFailed;
  private int page;
  private final Map<String, EditText> cartFields = new LinkedHashMap<>();
  private int background, surface, ink, muted, accent, border;
  private final Locale locale = new Locale("tr", "TR");
  interface Action { void run() throws Exception; }
  interface Job { JSONObject run() throws Exception; }
  interface Success { void run(JSONObject result) throws Exception; }

  @Override public void onCreate(Bundle saved) {
    super.onCreate(saved);
    try {
      DealerDisk disk = new DealerDisk(this); state = new DealerState(disk.read(), disk);
      application = new DealerApplicationForm(this, network, this::render, saved);
      applyTheme(); images = new DealerImages(this);
      if (saved != null) { tab = saved.getString("tab", "Katalog"); detail = saved.getString("detail", ""); }
      getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
        public void handleOnBackPressed() {
          if (application.active()) { application.close(); }
          else if (!detail.isEmpty()) { detail = ""; render(); }
          else if (!tab.equals("Katalog")) { tab = "Katalog"; render(); }
          else { setEnabled(false); getOnBackPressedDispatcher().onBackPressed(); setEnabled(true); }
        }
      });
      render();
      if (!state.text("claim_cookie").isEmpty()) verifyClaim(state.text("claim_base"), state.text("claim_cookie"));
      else if (!state.text("cookie").isEmpty()) refresh();
    } catch (Exception error) { fatalStorage(); }
  }
  @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); out.putString("tab", tab); out.putString("detail", detail); if (application != null) application.save(out); }
  @Override protected void onDestroy() { network.shutdownNow(); if (images != null) images.close(); super.onDestroy(); }
  private void applyTheme() {
    String mode = state.text("theme"); boolean dark = mode.equals("dark") || (!mode.equals("light") && (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES);
    setTheme(dark ? android.R.style.Theme_Material_NoActionBar : android.R.style.Theme_Material_Light_NoActionBar);
    background = Color.parseColor(dark ? "#0B1220" : "#F4F6F8"); surface = Color.parseColor(dark ? "#172332" : "#FFFFFF");
    ink = Color.parseColor(dark ? "#F1F5F9" : "#152536"); muted = Color.parseColor(dark ? "#B5C2D0" : "#536577");
    accent = Color.parseColor(dark ? "#5EEAD4" : "#0F766E"); border = Color.parseColor(dark ? "#334155" : "#DCE4EA");
    getWindow().getDecorView().setSystemUiVisibility(dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    getWindow().setStatusBarColor(background); getWindow().setNavigationBarColor(surface);
  }
  private void fatalStorage() {
    storageFailed = true;
    TextView text = new TextView(this); text.setPadding(dp(24), dp(48), dp(24), dp(24));
    text.setText(R.string.storage_failure);
    setContentView(text);
  }
  private void safely(Action action) {
    if (storageFailed || busy) return;
    try { action.run(); }
    catch (IllegalArgumentException | IllegalStateException error) { message = error.getMessage(); render(); }
    catch (Exception error) { fatalStorage(); }
  }
  private void task(Job job, Success success, boolean submission) {
    if (busy || storageFailed) return;
    busy = true;
    ProgressBar progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); progress.setIndeterminate(true);
    shell.addView(progress, 0, new LinearLayout.LayoutParams(-1, dp(4)));
    enableTree(shell, false);
    network.execute(() -> {
      JSONObject result = null; Exception failure = null;
      try { result = job.run(); } catch (Exception error) { failure = error; }
      final JSONObject value = result; final Exception problem = failure;
      runOnUiThread(() -> {
        if (isDestroyed()) return;
        busy = false;
        try {
          if (problem == null) success.run(value);
          else if (problem instanceof DealerApi.Failure) {
            DealerApi.Failure apiError = (DealerApi.Failure) problem;
            if (apiError.status == 401) { state.invalidateSession(); state.data.remove("claim_cookie"); state.data.remove("claim_base"); state.save(); message = "Oturumunuz sona erdi veya erişiminiz kapatıldı. Firmanızdan yeni davet isteyin. Sepet taslağınız bu cihazda saklanıyor."; }
            else {
              if (submission && apiError.status == 422) { state.data.remove("pending"); state.save(); }
              message = apiError.getMessage();
            }
          } else message = submission ? "Gönderim doğrulanamadı. Siparişiniz cihazda kayıtlı; aynı siparişi tekrar deneyin." : "Bağlantı kurulamadı. Son kayıtlı veriler gösteriliyor. Yenile ile tekrar deneyin.";
          render(); if (busy) enableTree(shell, false);
        } catch (Exception error) { fatalStorage(); }
      });
    });
  }
  private void refresh() {
    safely(() -> {
      String base = state.text("base"), cookie = state.text("cookie");
      task(() -> {
        DealerApi api = new DealerApi(base);
        JSONObject session = api.call("session", null, cookie).body;
        JSONObject result = new JSONObject().put("dealer", session.getJSONObject("dealer"));
        // A valid session can still read history while its catalog/delivery is unavailable.
        try { result.put("catalog", api.call("catalog", null, cookie).body.getJSONObject("catalog")); }
        catch (DealerApi.Failure error) { if (error.status == 401) throw error; result.put("catalog_error", error.getMessage()); }
        result.put("history", api.call("orders", null, cookie).body); return result;
      }, result -> {
        state.data.put("dealer", result.getJSONObject("dealer"));
        if (result.has("catalog")) state.data.put("catalog", result.getJSONObject("catalog")).put("catalog_at", now());
        else state.data.remove("catalog");
        state.data.put("orders", result.getJSONObject("history").getJSONArray("orders")).put("orders_at", now()); state.save();
        message = result.has("catalog_error") ? result.getString("catalog_error") : "Katalog ve siparişler güncellendi.";
      }, false);
    });
  }
  private void render() {
    if (storageFailed) return;
    if (application != null && application.active()) { application.show(); return; }
    shell = column(); shell.setBackgroundColor(background); setContentView(shell);
    ViewCompat.setOnApplyWindowInsetsListener(shell, (view, insets) -> {
      androidx.core.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom); return insets;
    });
    if (state.text("cookie").isEmpty()) { login(); return; }
    LinearLayout header = column(); header.setPadding(dp(20), dp(14), dp(20), dp(10)); shell.addView(header);
    label(header, "YARDIMCI ASİSTAN · BAYİ", 11, muted);
    LinearLayout line = row(); header.addView(line);
    TextView title = label(line, detail.isEmpty() ? tab : "Ürün detayı", 25, ink); title.setTypeface(null, Typeface.BOLD); title.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1));
    button(line, "Yenile", this::refresh, false);
    label(header, state.object("dealer").optString("display_name") + " · " + host(), 12, muted);
    if (!message.isEmpty()) { TextView status = label(header, message, 13, accent); status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); }
    if (state.data.has("pending")) label(header, "Gönderimi doğrulanmamış sipariş var. Sepet’ten aynı siparişi tekrar deneyin.", 13, accent);
    ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); shell.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
    body = column(); body.setPadding(dp(16), dp(4), dp(16), dp(20)); scroll.addView(body);
    switch (tab) {
      case "Sepet": cart(); break;
      case "Siparişler": orders(); break;
      case "Hesabım": account(); break;
      default: if (detail.isEmpty()) catalog(); else productDetail();
    }
    navigation = row(); navigation.setBackgroundColor(surface); navigation.setPadding(dp(4), dp(6), dp(4), dp(6)); shell.addView(navigation);
    for (String destination : new String[]{"Katalog", "Sepet", "Siparişler", "Hesabım"}) {
      String caption = destination.equals("Sepet") && state.object("cart").length() > 0 ? "Sepet (" + state.object("cart").length() + ")" : destination;
      Button item = button(navigation, caption, () -> { tab = destination; detail = ""; message = ""; render(); }, false);
      item.setTextSize(12); item.setPadding(0, 0, 0, 0); item.setTextColor(tab.equals(destination) ? accent : muted);
      item.setSelected(tab.equals(destination)); item.setLayoutParams(new LinearLayout.LayoutParams(0, dp(52), 1));
      if (tab.equals(destination)) item.setTypeface(null, Typeface.BOLD);
    }
  }
  private void login() {
    ScrollView scroll = new ScrollView(this); shell.addView(scroll); LinearLayout form = column(); form.setPadding(dp(24), dp(36), dp(24), dp(24)); scroll.addView(form);
    label(form, "Yardımcı Asistan", 15, accent); TextView title = label(form, "Bayi hesabınıza\nhoş geldiniz", 30, ink); title.setTypeface(null, Typeface.BOLD);
    label(form, "Toptancınızın web modülü adresini ve size özel bayi davet bağlantısını girin.", 15, muted);
    if (!message.isEmpty()) label(form, message, 14, accent);
    if (!state.text("claim_cookie").isEmpty()) button(form, "Girişi tamamla", () -> verifyClaim(state.text("claim_base"), state.text("claim_cookie")), true);
    EditText server = field(form, "Web modülü adresi", loginBase.isEmpty() ? state.text("base") : loginBase, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI, value -> loginBase = value, 2048);
    server.setHint("https://firmaniz.com/web-modulu/");
    EditText invitation = field(form, "Bayi davet bağlantısı", loginInvite, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI, value -> loginInvite = value, 2048);
    button(form, "Davetle giriş yap", () -> safely(() -> {
      String base = DealerApi.normalizeBase(server.getText().toString()); String token = DealerApi.inviteToken(invitation.getText().toString(), base);
      task(() -> {
        DealerApi api = new DealerApi(base); DealerApi.Reply claim = api.call("claim", new JSONObject().put("invite_token", token), "");
        if (claim.cookie.isEmpty()) throw new IllegalStateException("Oturum oluşturulamadı.");
        // Persist the consumed invite's cookie before any follow-up request can fail.
        return new JSONObject().put("cookie", claim.cookie);
      }, result -> {
        loginInvite = "";
        state.data.put("claim_base", base).put("claim_cookie", result.getString("cookie")); state.save();
        message = "Oturum açıldı. Hesap doğrulanıyor…";
        // Hide any old account's cached data until identity has been revalidated.
        verifyClaim(base, result.getString("cookie"));
      }, false);
    }), true);
    button(form, "Bayi Başvurusu Yap", () -> application.open(server.getText().toString()), false);
    label(form, "Davet tek kullanımlıktır. Süresi dolduysa firmanızdan yeni davet isteyin. Kaydedilmiş sepet yalnız aynı bayi hesabıyla yeniden giriş yaptığınızda açılır.", 13, muted);
  }
  private void verifyClaim(String base, String cookie) {
    task(() -> new DealerApi(base).call("session", null, cookie).body, result -> {
      state.authenticate(base, cookie, result.getJSONObject("dealer"));
      state.data.remove("claim_cookie"); state.data.remove("claim_base"); state.save();
      message = "Giriş yapıldı. Katalog alınıyor…";
      new android.os.Handler(getMainLooper()).post(this::refresh);
    }, false);
  }
  private void catalog() {
    label(body, "Son katalog: " + fallback(state.text("catalog_at"), "Henüz indirilmedi") + "\nÇevrimdışıyken fiyatlar değişmiş olabilir.", 12, muted);
    EditText search = field(body, "Ürün, stok kodu veya marka ara", query, InputType.TYPE_CLASS_TEXT, null, 180);
    LinearLayout filters = column(); body.addView(filters);
    Set<String> categories = new TreeSet<>(), brands = new TreeSet<>(); JSONArray products = state.object("catalog").optJSONArray("products");
    if (products != null) for (int i = 0; i < products.length(); i++) {
      JSONObject product = products.optJSONObject(i); if (product == null) continue;
      if (!product.optString("category_name").isEmpty()) categories.add(product.optString("category_name"));
      if (!product.optString("brand").isEmpty()) brands.add(product.optString("brand"));
    }
    LinearLayout results = column();
    selector(filters, "Kategori", withAll("Tüm kategoriler", categories), category, value -> { category = value; page = 0; renderProducts(results); });
    selector(filters, "Marka", withAll("Tüm markalar", brands), brand, value -> { brand = value; page = 0; renderProducts(results); });
    Switch favorites = new Switch(this); favorites.setText(R.string.favorites_only); favorites.setTextColor(ink); favorites.setMinHeight(dp(48)); favorites.setChecked(favoritesOnly); filters.addView(favorites);
    favorites.setOnCheckedChangeListener((view, checked) -> { favoritesOnly = checked; page = 0; renderProducts(results); });
    body.addView(results); renderProducts(results);
    watch(search, value -> { query = value; page = 0; renderProducts(results); });
  }
  private void renderProducts(LinearLayout results) {
    results.removeAllViews(); JSONArray products = state.object("catalog").optJSONArray("products"); int count = 0;
    if (products != null) for (int i = 0; i < products.length(); i++) {
      JSONObject product = products.optJSONObject(i); if (product == null) continue;
      String searchable = (product.optString("name") + " " + product.optString("sku") + " " + product.optString("brand") + " " + product.optString("category_name")).toLowerCase(locale);
      if (!searchable.contains(query.toLowerCase(locale)) || (favoritesOnly && !state.object("favorites").has(product.optString("product_id")))
          || (!category.equals("Tüm kategoriler") && !category.equals(product.optString("category_name")))
          || (!brand.equals("Tüm markalar") && !brand.equals(product.optString("brand")))) continue;
      count++; if (count > (page + 1) * 30) continue;
      LinearLayout card = card(results); LinearLayout top = row(); card.addView(top);
      ImageView image = new ImageView(this); image.setScaleType(ImageView.ScaleType.CENTER_INSIDE); image.setContentDescription(product.optString("name") + " görseli");
      image.setImageResource(R.drawable.ic_dealer); top.addView(image, new LinearLayout.LayoutParams(dp(72), dp(72))); images.load(image, product.optString("image_url"));
      LinearLayout texts = column(); texts.setPadding(dp(12), 0, 0, 0); top.addView(texts, new LinearLayout.LayoutParams(0, -2, 1));
      label(texts, product.optString("name"), 17, ink).setTypeface(null, Typeface.BOLD);
      label(texts, join(product.optString("brand"), product.optString("category_name")), 12, muted);
      label(texts, "Stok kodu: " + fallback(product.optString("sku"), "—"), 12, muted);
      label(card, money(product.optDouble("price"), product.optString("currency")) + " / " + unit(product.optString("unit")), 19, accent);
      Button inspect = button(card, "Ürünü incele", () -> { detail = product.optString("product_id"); render(); }, false);
      inspect.setContentDescription(product.optString("name") + " ürününü incele");
    }
    if (count == 0) label(results, products == null ? "Kataloğu indirmek için Yenile’ye dokunun." : "Aramanıza uygun ürün bulunamadı.", 15, muted);
    if (count > (page + 1) * 30) button(results, "Daha fazla ürün (" + count + ")", () -> { page++; renderProducts(results); }, false);
  }
  private void productDetail() {
    button(body, "‹ Kataloğa dön", () -> { detail = ""; render(); }, false);
    JSONObject product = state.product(detail); if (product == null) { label(body, "Ürün güncel katalogda bulunamadı.", 16, ink); return; }
    ImageView image = new ImageView(this); image.setImageResource(R.drawable.ic_dealer); image.setScaleType(ImageView.ScaleType.CENTER_INSIDE); image.setContentDescription(product.optString("name")); body.addView(image, new LinearLayout.LayoutParams(-1, dp(200))); images.load(image, product.optString("image_url"));
    label(body, product.optString("name"), 25, ink).setTypeface(null, Typeface.BOLD);
    label(body, join(product.optString("brand"), product.optString("category_name")), 14, muted);
    label(body, "Stok kodu: " + fallback(product.optString("sku"), "—"), 13, muted);
    label(body, fallback(product.optString("description"), "Bu ürün için açıklama eklenmemiş."), 16, ink);
    label(body, "Bayi fiyatınız · " + money(product.optDouble("price"), product.optString("currency")) + " / " + unit(product.optString("unit")), 21, accent);
    EditText quantity = field(body, "Eklenecek miktar (" + unit(product.optString("unit")) + ")", "1", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL, null, 12);
    button(body, "Sepete ekle", () -> safely(() -> { state.quantity(detail, state.object("cart").optDouble(detail, 0) + amount(quantity)); message = "Ürün sepetinize eklendi."; render(); }), true);
    button(body, state.object("favorites").has(detail) ? "Favorilerimden çıkar" : "Favorilerime ekle", () -> safely(() -> { state.favorite(detail); render(); }), false);
  }
  private void cart() {
    cartFields.clear();
    JSONObject cart = state.object("cart");
    if (cart.length() == 0) { label(body, "Sepetiniz boş", 23, ink); label(body, "Katalogdan ürün seçerek başlayın.", 15, muted); return; }
    boolean pending = state.data.has("pending");
    for (Iterator<String> it = cart.keys(); it.hasNext();) {
      String id = it.next(); JSONObject product = state.product(id); String name = product == null ? "Artık sunulmayan ürün · " + id : product.optString("name");
      LinearLayout card = card(body); label(card, name, 17, ink).setTypeface(null, Typeface.BOLD);
      if (product != null) label(card, money(product.optDouble("price"), product.optString("currency")) + " / " + unit(product.optString("unit")), 14, muted);
      EditText quantity = field(card, name + " miktarı", number(cart.optDouble(id)), InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL, null, 12); quantity.setEnabled(!pending); cartFields.put(id, quantity);
      LinearLayout actions = row(); card.addView(actions);
      Button update = button(actions, "Miktarı uygula", () -> safely(() -> { state.quantity(id, amount(quantity)); render(); }), false); update.setEnabled(!pending); update.setContentDescription(name + " miktarını uygula");
      Button remove = button(actions, "Çıkar", () -> safely(() -> { state.quantity(id, 0); render(); }), false); remove.setEnabled(!pending); remove.setContentDescription(name + " sepetten çıkar");
    }
    try {
      String currency = ""; Iterator<String> it = cart.keys(); if (it.hasNext()) { JSONObject p = state.product(it.next()); if (p != null) currency = p.optString("currency"); }
      label(body, "Tahmini toplam  " + money(state.total().doubleValue(), currency), 23, accent);
    } catch (Exception error) { label(body, error.getMessage(), 14, accent); }
    label(body, "Sunucu tutarı bayi kataloğunuzdan hesaplar. Kesin sipariş tutarı masaüstünde güncel fiyatlarla belirlenir; sipariş geçmişinde görünür.", 12, muted);
    JSONArray methods = state.object("catalog").optJSONArray("delivery_methods"); List<String> options = new ArrayList<>();
    if (methods != null) for (int i = 0; i < methods.length(); i++) options.add(methods.optString(i).equals("shipping") ? "Adrese gönderim" : "Elden teslim");
    String currentMethod = state.text("delivery");
    if (!pending && methods != null && methods.length() > 0) {
      boolean allowed = false; for (int i = 0; i < methods.length(); i++) if (methods.optString(i).equals(currentMethod)) allowed = true;
      if (!allowed) { currentMethod = methods.optString(0); persist("delivery", currentMethod); }
    }
    String selected = currentMethod.equals("shipping") ? "Adrese gönderim" : "Elden teslim";
    Spinner method = selector(body, "Teslimat tercihi", options, selected, value -> safely(() -> {
      state.put("delivery", value.equals("Adrese gönderim") ? "shipping" : "pickup"); render();
    })); method.setEnabled(!pending);
    if (selected.equals("Adrese gönderim")) {
      String[] keys = {"recipientName", "addressLine1", "district", "city", "postalCode", "countryCode"};
      String[] captions = {"Teslim alacak kişi *", "Açık adres *", "İlçe *", "İl *", "Posta kodu", "Ülke kodu (TR) *"};
      int[] limits = {160, 300, 120, 120, 32, 2};
      for (int i = 0; i < keys.length; i++) {
        final String key = keys[i];
        EditText field = field(body, captions[i], state.object("address").optString(key, key.equals("countryCode") ? "TR" : ""), InputType.TYPE_CLASS_TEXT, value -> persistAddress(key, value), limits[i]); field.setEnabled(!pending);
        if (key.equals("countryCode") && !state.object("address").has(key)) persistAddress(key, "TR");
      }
    }
    EditText note = field(body, "Sipariş notu (isteğe bağlı)", state.text("note"), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE, value -> persist("note", value), 2000); note.setEnabled(!pending);
    if (pending) label(body, "Gönderim bekliyor. Sipariş içeriği tekrar deneme bitene kadar korunur; uygulamayı kapatsanız da kaybolmaz.", 14, accent);
    button(body, pending ? "Aynı siparişi tekrar dene" : "Siparişi gönder", () -> safely(this::submit), true);
  }
  private void submit() throws Exception {
    if (!state.data.has("pending")) for (Map.Entry<String, EditText> entry : cartFields.entrySet()) state.quantity(entry.getKey(), amount(entry.getValue()));
    JSONObject request = state.prepareOrder(); String cookie = state.text("cookie"), base = state.text("base");
    task(() -> new DealerApi(base).submit(request, cookie), receipt -> {
      state.accepted(receipt); tab = "Siparişler";
      message = receipt.has("quoted_total")
          ? "Talebiniz alındı. Sunucu toplamı: " + money(receipt.optDouble("quoted_total"), receipt.optString("currency")) + ". Masaüstü onayı için siparişleri yenileyin."
          : "Talebiniz alındı. Kesin tutar ve durum için siparişleri yenileyin.";
      // Local acceptance is a transport fact; canonical state arrives only from orders.php.
    }, true);
  }
  private void orders() {
    label(body, "Son kontrol: " + fallback(state.text("orders_at"), "Henüz alınmadı"), 12, muted);
    JSONObject receipt = state.object("last_receipt");
    if (receipt.has("order_id")) label(body, "Son gönderilen talep: " + receipt.optString("order_id") + "\n" + receipt.optString("accepted_at"), 12, muted);
    JSONArray orders = state.array("orders");
    if (orders.length() == 0) label(body, "Henüz sipariş görünmüyor. Yeni talepler için Yenile’ye dokunun.", 16, ink);
    for (int i = 0; i < orders.length(); i++) {
      JSONObject order = orders.optJSONObject(i); if (order == null) continue;
      LinearLayout card = card(body); label(card, status(order.optString("status")), 18, accent).setTypeface(null, Typeface.BOLD);
      label(card, order.optString("created_at").replace('T', ' ') + "\n" + order.optString("order_id"), 12, muted);
      if (!order.isNull("total")) label(card, money(order.optDouble("total"), order.optString("currency")), 20, ink);
      JSONArray items = order.optJSONArray("items"); if (items == null) continue;
      for (int j = 0; j < items.length(); j++) {
        JSONObject item = items.optJSONObject(j); if (item == null) continue;
        JSONObject product = state.product(item.optString("product_id"));
        label(card, number(item.optDouble("quantity")) + " × " + fallback(item.optString("name"), product == null ? item.optString("product_id") : product.optString("name")), 14, ink);
      }
      if (items.length() > 0) {
        Button reorder = button(card, "Ürünleri tekrar sepete ekle", () -> safely(() -> {
        int missing = state.reorder(items);
        tab = "Sepet"; message = missing == 0 ? "Ürünler güncel bayi fiyatlarıyla sepete eklendi." : missing + " ürün artık katalogda yok; diğer ürünler eklendi."; render();
      }), false);
        reorder.setContentDescription(order.optString("order_id") + " ürünlerini tekrar sepete ekle");
      }
    }
  }
  private void account() {
    LinearLayout card = card(body); label(card, "Firma hesabı", 21, ink).setTypeface(null, Typeface.BOLD);
    label(card, state.object("dealer").optString("display_name"), 18, ink); label(card, state.text("base"), 13, muted);
    label(card, "Bu cihazdaki katalog, sepet ve favoriler yalnız bu bayi hesabına aittir. Oturum kapatılınca cihazdan temizlenir.", 13, muted);
    selector(body, "Görünüm", Arrays.asList("Sistem", "Açık", "Koyu"), state.text("theme").equals("dark") ? "Koyu" : state.text("theme").equals("light") ? "Açık" : "Sistem", value -> safely(() -> {
      state.put("theme", value.equals("Koyu") ? "dark" : value.equals("Açık") ? "light" : "system"); recreate();
    }));
    button(body, "Oturumu kapat", () -> new AlertDialog.Builder(this).setTitle("Oturum kapatılsın mı?")
        .setMessage(state.data.has("pending") ? "Gönderimi doğrulanmamış siparişiniz var. Önce Sepet’ten aynı siparişi tekrar deneyin; taslağınız kaybolmasın." : "Cihazdaki sepet, favoriler ve katalog temizlenecek. Yeniden giriş için yeni davet gerekir.")
        .setNegativeButton("Vazgeç", null).setPositiveButton(state.data.has("pending") ? "Sepete dön" : "Oturumu kapat", (dialog, which) -> {
          if (state.data.has("pending")) { tab = "Sepet"; render(); return; }
          safely(() -> {
            String cookie = state.text("cookie"), base = state.text("base");
            task(() -> new DealerApi(base).call("logout", new JSONObject(), cookie).body, result -> { state.logout(); tab = "Katalog"; message = "Oturumunuz kapatıldı."; }, false);
          });
        }).show(), false);
    label(body, "Oturum kapatma sunucuya ulaşmayı gerektirir. Erişim iptali, masaüstündeki değişiklik sunucuya yayınlandığında uygulanır.", 12, muted);
  }
  private void persist(String key, String value) { try { state.put(key, value); } catch (Exception error) { fatalStorage(); } }
  private void persistAddress(String key, String value) { try { JSONObject address = state.object("address"); address.put(key, value); state.put("address", address); } catch (Exception error) { fatalStorage(); } }
  interface TextChange { void changed(String value); }
  private EditText field(LinearLayout parent, String caption, String value, int type, TextChange change, int limit) {
    label(parent, caption, 13, muted); EditText field = new EditText(this); field.setTextColor(ink); field.setHintTextColor(muted); field.setTextSize(16);
    field.setInputType(type); field.setSingleLine((type & InputType.TYPE_TEXT_FLAG_MULTI_LINE) == 0);
    field.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(limit)}); field.setText(value); field.setContentDescription(caption); field.setMinHeight(dp(52));
    field.setPadding(dp(12), dp(8), dp(12), dp(8)); field.setBackground(shape(surface, border, 10));
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.setMargins(0, dp(3), 0, dp(10)); parent.addView(field, params);
    if (change != null) watch(field, change); return field;
  }
  private void watch(EditText field, TextChange change) { field.addTextChangedListener(new TextWatcher() {
    public void beforeTextChanged(CharSequence text, int start, int count, int after) {}
    public void onTextChanged(CharSequence text, int start, int before, int count) { change.changed(text.toString()); }
    public void afterTextChanged(Editable text) {}
  }); }
  private Spinner selector(LinearLayout parent, String caption, List<String> options, String selected, TextChange change) {
    label(parent, caption, 13, muted); Spinner spinner = new Spinner(this); spinner.setContentDescription(caption);
    List<String> values = options.isEmpty() ? Collections.singletonList("Şu anda sunulmuyor") : options;
    ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, values); spinner.setAdapter(adapter);
    int position = values.indexOf(selected); spinner.setSelection(Math.max(0, position)); parent.addView(spinner, new LinearLayout.LayoutParams(-1, dp(48)));
    final String[] previous = {values.get(Math.max(0, position))};
    spinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
      public void onNothingSelected(AdapterView<?> view) {}
      public void onItemSelected(AdapterView<?> view, View item, int index, long id) {
        String next = values.get(index); if (next.equals(previous[0])) return; previous[0] = next; change.changed(next);
      }
    }); return spinner;
  }
  private Button button(LinearLayout parent, String caption, Runnable action, boolean primary) {
    Button button = new Button(this); button.setText(caption); button.setTextSize(14); button.setAllCaps(false); button.setMinHeight(dp(48));
    button.setTextColor(primary ? background : accent); button.setBackground(shape(primary ? accent : surface, primary ? accent : border, 10));
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(parent.getOrientation() == LinearLayout.HORIZONTAL ? -2 : -1, -2); params.setMargins(dp(2), dp(5), dp(2), dp(5)); parent.addView(button, params);
    button.setOnClickListener(view -> { if (!busy && !storageFailed) action.run(); }); return button;
  }
  private TextView label(LinearLayout parent, String text, int size, int color) {
    TextView label = new TextView(this); label.setText(text); label.setTextSize(size); label.setTextColor(color); label.setPadding(0, dp(4), 0, dp(4)); parent.addView(label); return label;
  }
  private LinearLayout card(LinearLayout parent) {
    LinearLayout card = column(); card.setPadding(dp(16), dp(12), dp(16), dp(12)); card.setBackground(shape(surface, border, 14));
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.setMargins(0, dp(8), 0, dp(8)); parent.addView(card, params); return card;
  }
  private GradientDrawable shape(int fill, int stroke, int radius) { GradientDrawable shape = new GradientDrawable(); shape.setColor(fill); shape.setCornerRadius(dp(radius)); shape.setStroke(dp(1), stroke); return shape; }
  private LinearLayout column() { LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); return layout; }
  private LinearLayout row() { LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.HORIZONTAL); layout.setGravity(android.view.Gravity.CENTER_VERTICAL); return layout; }
  private void enableTree(View view, boolean enabled) { view.setEnabled(enabled); if (view instanceof android.view.ViewGroup) { android.view.ViewGroup group = (android.view.ViewGroup) view; for (int i = 0; i < group.getChildCount(); i++) enableTree(group.getChildAt(i), enabled); } }
  private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
  private String money(double value, String currency) { NumberFormat format = NumberFormat.getNumberInstance(locale); format.setMinimumFractionDigits(2); format.setMaximumFractionDigits(2); return format.format(value) + " " + currency; }
  private String number(double value) { return java.math.BigDecimal.valueOf(value).stripTrailingZeros().toPlainString(); }
  private double amount(EditText field) { try { return Double.parseDouble(field.getText().toString().trim().replace(',', '.')); } catch (NumberFormatException error) { throw new IllegalArgumentException("Geçerli bir miktar girin."); } }
  private String host() { try { return new java.net.URI(state.text("base")).getHost(); } catch (Exception error) { return ""; } }
  private String fallback(String text, String replacement) { return text.isEmpty() ? replacement : text; }
  private String join(String first, String second) { return first.isEmpty() ? second : second.isEmpty() ? first : first + " · " + second; }
  private String now() { return new java.text.SimpleDateFormat("dd.MM.yyyy HH:mm", locale).format(new Date()); }
  private List<String> withAll(String all, Set<String> options) { List<String> result = new ArrayList<>(); result.add(all); result.addAll(options); return result; }
  private String unit(String value) {
    switch (value) { case "piece": return "adet"; case "pack": return "paket"; case "box": return "kutu"; case "meter": return "metre"; case "other": return "birim"; default: return value; }
  }
  static String status(String value) {
    switch (value) {
      case "placed": return "Sipariş alındı";
      case "confirmed": return "Onaylandı";
      case "fulfilled": return "Tamamlandı";
      case "cancelled": return "İptal edildi";
      case "rejected": return "Erişim iptali nedeniyle işlenemedi";
      case "awaiting_desktop": return "Talep alındı · Masaüstüne aktarım bekleniyor";
      default: return "Durum alınamadı";
    }
  }
}

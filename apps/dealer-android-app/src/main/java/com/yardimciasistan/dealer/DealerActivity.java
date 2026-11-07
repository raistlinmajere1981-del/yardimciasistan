package com.yardimciasistan.dealer;

import android.app.AlertDialog;
import android.net.Uri;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import java.text.NumberFormat;
import java.util.*;
import java.util.concurrent.*;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Independent native dealer client; server sessions, prices and order operations retain ownership.
 */
public final class DealerActivity extends ComponentActivity {
  private DealerApplicationForm application;
  private DealerState state;
  private DealerUi ui;
  private DealerImages images;
  private DealerPhotoViewer photos;
  private LinearLayout shell, body, footer, navigation, results;
  private ScrollView scroll;
  private ProgressBar progress;
  private TextView notice, catalogTime, cartTotal, detailPrice;
  private Button refreshButton, loginButton, sendButton;
  private final ExecutorService network = Executors.newSingleThreadExecutor();
  private final Map<String, EditText> cartFields = new LinkedHashMap<>();
  private final Map<String, TextView> cartPrices = new LinkedHashMap<>();
  private final Map<String, String> quantityDrafts = new LinkedHashMap<>();
  private final Map<String, Integer> positions = new HashMap<>();
  private static final String PENDING_CARTS =
      "Bekleyen sipariş kesinleşene kadar sepetler kilitli. Aynı siparişi tekrar deneyin.";
  private String tab = "Katalog", detail = "", renderedKey = "", message = "", query = "",
                 category = "Tüm kategoriler", brand = "Tüm markalar", connectionInput = "", accountEmail = "";
  private boolean busy, favoritesOnly, storageFailed, accessVerified, freshScroll;
  private JSONObject accountConfig;
  private int page;
  private final Locale locale = new Locale("tr", "TR");
  private enum Task { REFRESH, LOGIN, VERIFY, SUBMIT, LOGOUT }
  interface Action {
    void run() throws Exception;
  }
  interface Job {
    JSONObject run() throws Exception;
  }
  interface Success {
    void run(JSONObject result) throws Exception;
  }

  @Override
  protected void attachBaseContext(Context base) {
    Configuration configuration = new Configuration(base.getResources().getConfiguration());
    configuration.fontScale =
        DealerAppearance.fontScale(configuration.fontScale, DealerUi.appearance(base).fontPercent);
    super.attachBaseContext(base.createConfigurationContext(configuration));
  }
  @Override
  public void onCreate(Bundle saved) {
    ui = new DealerUi(this);
    setTheme(ui.dark ? R.style.DealerThemeDark : R.style.DealerTheme);
    super.onCreate(saved);
    com.yardimciasistan.update.AndroidUpdates.confirmInstalledOnLaunch(this);
    try {
      DealerDisk disk = new DealerDisk(this);
      state = new DealerState(disk.read(), disk);
      images = new DealerImages(this);
      application = new DealerApplicationForm(this, network, this::render, saved);
      photos = new DealerPhotoViewer(this, images, this::render, saved);
      if (saved != null) {
        tab = saved.getString("tab", "Katalog");
        detail = saved.getString("detail", "");
        query = saved.getString("query", "");
        category = saved.getString("category", category);
        brand = saved.getString("brand", brand);
        page = saved.getInt("page");
        favoritesOnly = saved.getBoolean("favorites");
        Bundle draft = saved.getBundle("quantities");
        if (draft != null)
          for (String id : draft.keySet()) quantityDrafts.put(id, draft.getString(id, ""));
        Bundle offsets = saved.getBundle("positions");
        if (offsets != null)
          for (String key : offsets.keySet()) positions.put(key, offsets.getInt(key));
      }
      getWindow().getDecorView().setSystemUiVisibility(ui.dark
              ? 0
              : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
      getWindow().setStatusBarColor(ui.background);
      getWindow().setNavigationBarColor(ui.surface);
      getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
        public void handleOnBackPressed() {
          if (photos.active())
            photos.close();
          else if (application.active())
            application.close();
          else if (!detail.isEmpty()) {
            detail = "";
            render();
          } else if (!tab.equals("Katalog"))
            navigate("Katalog");
          else {
            setEnabled(false);
            getOnBackPressedDispatcher().onBackPressed();
            setEnabled(true);
          }
        }
      });
      receiveLink(getIntent());
      render();
      if (!state.text("cookie").isEmpty()) refresh();
    } catch (Exception error) {
      fatalStorage();
    }
  }
  private final android.os.Handler accountTimer = new android.os.Handler(android.os.Looper.getMainLooper());
  private final Runnable accountCheck = new Runnable() { public void run() { if (state != null && !busy && !state.text("cookie").isEmpty()) refresh(); accountTimer.postDelayed(this, 30000); } };
  @Override protected void onResume() { super.onResume(); accountTimer.removeCallbacks(accountCheck); accountTimer.postDelayed(accountCheck, 30000); if (state != null && !state.text("cookie").isEmpty() && !busy) { accessVerified = false; render(); refresh(); } }
  @Override protected void onPause() { accountTimer.removeCallbacks(accountCheck); super.onPause(); }
  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    receiveLink(intent);
  }
  private void receiveLink(Intent intent) {
    if (intent == null)
      return;
    String input = Intent.ACTION_VIEW.equals(intent.getAction()) ? intent.getDataString()
        : Intent.ACTION_SEND.equals(intent.getAction()) ? intent.getStringExtra(Intent.EXTRA_TEXT)
                                                        : null;
    intent.setData(null);
    intent.removeExtra(Intent.EXTRA_TEXT);
    if (input == null)
      return;
    try {
      Uri uri = Uri.parse(input);
      if ("yardimci-bayi".equals(uri.getScheme()) && "account".equals(uri.getHost())) {
        String code = uri.getQueryParameter("code"), verifier = state.text("oauth_verifier"), base = state.text("connection_base");
        state.data.remove("oauth_verifier"); state.save();
        if (code == null || !code.matches("[A-Za-z0-9_-]{43}") || verifier.isEmpty()) throw new IllegalArgumentException("Giriş denemesi geçersiz veya süresi dolmuş.");
        authenticate(base, "exchange", new JSONObject().put("code", code).put("verifier", verifier));
      } else {
        connectionInput = DealerApi.normalizeBase(input); message = "";
      }
    } catch (Exception error) { message = "Geçerli işletme bağlantısı veya hesap girişini kullanın."; }
    if (shell != null)
      render();
  }
  @Override
  protected void onSaveInstanceState(Bundle out) {
    super.onSaveInstanceState(out);
    rememberPosition();
    out.putString("tab", tab);
    out.putString("detail", detail);
    out.putString("query", query);
    out.putString("category", category);
    out.putString("brand", brand);
    out.putInt("page", page);
    out.putBoolean("favorites", favoritesOnly);
    Bundle drafts = new Bundle();
    for (Map.Entry<String, String> entry : quantityDrafts.entrySet())
      drafts.putString(entry.getKey(), entry.getValue());
    out.putBundle("quantities", drafts);
    Bundle offsets = new Bundle();
    for (Map.Entry<String, Integer> entry : positions.entrySet())
      offsets.putInt(entry.getKey(), entry.getValue());
    out.putBundle("positions", offsets);
    if (application != null)
      application.save(out);
    if (photos != null)
      photos.save(out);
  }
  @Override
  protected void onDestroy() {
    network.shutdownNow();
    if (photos != null)
      photos.destroy(isChangingConfigurations());
    if (images != null)
      images.close();
    super.onDestroy();
  }
  private void fatalStorage() {
    storageFailed = true;
    TextView text = new TextView(this);
    text.setPadding(dp(24), dp(48), dp(24), dp(24));
    text.setText(R.string.storage_failure);
    setContentView(text);
  }
  private void safely(Action action) {
    if (storageFailed)
      return;
    try {
      action.run();
    } catch (IllegalArgumentException | IllegalStateException error) {
      showMessage(error.getMessage());
    } catch (Exception error) {
      fatalStorage();
    }
  }
  private void showMessage(String value) {
    message = value == null ? "İşlem tamamlanamadı." : value;
    if (notice != null) {
      notice.setText(message);
      notice.setVisibility(message.isEmpty() ? View.GONE : View.VISIBLE);
    }
  }
  private void loading(boolean value) {
    busy = value;
    if (progress != null)
      progress.setVisibility(value ? View.VISIBLE : View.GONE);
    if (refreshButton != null)
      refreshButton.setEnabled(!value);
    if (loginButton != null)
      loginButton.setEnabled(!value);
    if (sendButton != null)
      sendButton.setEnabled(!value);
  }
  private void task(Job job, Success success, Task kind) {
    if (busy || storageFailed || isDestroyed() || isFinishing())
      return;
    loading(true);
    network.execute(() -> {
      JSONObject result = null;
      Exception failure = null;
      try {
        result = job.run();
      } catch (Exception error) {
        failure = error;
      }
      final JSONObject value = result;
      final Exception problem = failure;
      runOnUiThread(() -> {
        if (isDestroyed())
          return;
        loading(false);
        try {
          if (problem == null) {
            success.run(value);
            if (kind != Task.REFRESH)
              render();
          } else if (problem instanceof DealerApi.Failure) {
            DealerApi.Failure error = (DealerApi.Failure) problem;
            if (error.status == 401 || error.status == 403) {
              accessVerified = false;
              if (error.code.equals("online_sales_disabled")) accountConfig = new JSONObject().put("enabled", false);
              state.invalidateSession();
              if (photos.active()) photos.close();
              message = error.status == 401 && kind != Task.LOGIN ? "Oturumunuz sona erdi. Aynı hesabınızla yeniden giriş yapın. Sepetiniz cihazda korunuyor." : error.getMessage();
              render();
            } else {
              if (kind == Task.SUBMIT && error.status == 422) {
                state.data.remove("pending");
                state.save();
                message = error.getMessage();
                render();
              } else
                showMessage(error.getMessage());
            }
          } else
            showMessage(kind == Task.SUBMIT
                    ? "Gönderim doğrulanamadı. Aynı siparişi tekrar deneyin."
                    : kind == Task.LOGIN || kind == Task.VERIFY
                    ? "Bağlantı kurulamadı. Giriş işlemini yeniden deneyin."
                    : "Bağlantı kurulamadı. Son kayıtlı bilgiler gösteriliyor.");
        } catch (Exception error) {
          fatalStorage();
        }
      });
    });
  }
  private DealerSession.Renewed rotatedCookieSaver() {
    return value -> {
      try { state.rotateCookie(value); }
      catch (Exception error) {
        runOnUiThread(this::fatalStorage);
        throw error; // no retry while a rotated token cannot be durably saved
      }
    };
  }
  private void refresh() {
    if (state.text("cookie").isEmpty())
      return;
    String base = state.text("base"), cookie = state.text("cookie");
    task(
        ()
            -> {
          DealerSession session = new DealerSession(base, cookie, rotatedCookieSaver());
          JSONObject sessionBody = session.call("session", null).body;
          String activeCookie = session.cookie();
          JSONObject result = new JSONObject().put("dealer", sessionBody.getJSONObject("dealer")).put("cookie", activeCookie);
          DealerApi api = new DealerApi(base);
          if (brandingRefreshDue(base)) {
            JSONObject branding = loadBusinessBrand(api, base);
            if (branding != null) result.put("branding", branding);
          }
          try {
            result.put("catalog", session.call("catalog", null).body.getJSONObject("catalog"));
          } catch (DealerApi.Failure error) {
            if (error.status == 401 || error.status == 403)
              throw error;
            result.put("catalog_error", error.getMessage());
          }
          result.put("history", session.call("orders", null).body);
          return result;
        },
        result
        -> {
          accessVerified = true;
          state.data.put("cookie", result.getString("cookie"));
          String previousAccess = state.object("dealer").optString("access_id");
          JSONObject old = state.object("catalog");
          String previousProducts =
              old.optJSONArray("products") == null ? "" : old.optJSONArray("products").toString();
          String previousMethods = String.valueOf(old.optJSONArray("delivery_methods"));
          String previousOrders = state.array("orders").toString();
          state.data.put("dealer", result.getJSONObject("dealer"));
          if (result.has("branding")) {
            state.data.put("branding_base", base).put("branding", result.getJSONObject("branding"))
                .put("branding_at", System.currentTimeMillis());
          }
          if (result.has("catalog"))
            state.data.put("catalog", result.getJSONObject("catalog")).put("catalog_at", now());
          else
            state.data.remove("catalog");
          state.data.put("orders", result.getJSONObject("history").getJSONArray("orders"))
              .put("orders_at", now());
          state.save();
          showMessage(result.has("catalog_error") ? result.getString("catalog_error") : "");
          if (catalogTime != null)
            catalogTime.setText(getString(
                R.string.last_updated, fallback(state.text("catalog_at"), "Henüz alınmadı")));
          JSONObject next = state.object("catalog");
          boolean productsChanged =
              !previousProducts.equals(String.valueOf(next.optJSONArray("products")));
          boolean methodsChanged =
              !previousMethods.equals(String.valueOf(next.optJSONArray("delivery_methods")));
          // Revoke cached pixels/personal sources when the authorized catalog or owner changes.
          if (photos.active() && (productsChanged
              || !previousAccess.equals(state.object("dealer").optString("access_id"))))
            photos.close();
          if (result.has("catalog_error") && tab.equals("Katalog")) {
            if (photos.active())
              photos.close();
            detail = "";
            render();
            return;
          }
          if (tab.equals("Katalog") && detail.isEmpty() && productsChanged && results != null) {
            int offset = scroll.getScrollY();
            renderProducts(results);
            scroll.post(() -> scroll.scrollTo(0, offset));
          }
          if (!detail.isEmpty() && detailPrice != null) {
            JSONObject product = state.product(detail);
            detailPrice.setText(product == null ? "Ürün artık sunulmuyor" : price(product));
          }
          if (tab.equals("Sepet")) {
            if (methodsChanged) {
              render();
            } else {
              for (Map.Entry<String, TextView> entry : cartPrices.entrySet()) {
                JSONObject product = state.product(entry.getKey());
                entry.getValue().setText(
                    product == null ? "Ürün artık sunulmuyor" : price(product));
              }
              updateCartTotal();
            }
          }
          if (tab.equals("Siparişler") && !previousOrders.equals(state.array("orders").toString()))
            render();
        },
        Task.REFRESH);
  }
  private void rememberPosition() {
    if (scroll != null && !renderedKey.isEmpty())
      positions.put(renderedKey, scroll.getScrollY());
  }
  private void navigate(String destination) {
    rememberPosition();
    hideKeyboard();
    tab = destination;
    detail = "";
    message = "";
    render();
  }
  private void hideKeyboard() {
    View view = getCurrentFocus();
    if (view != null)
      ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE))
          .hideSoftInputFromWindow(view.getWindowToken(), 0);
  }
  private void render() {
    if (storageFailed)
      return;
    if (freshScroll)
      freshScroll = false;
    else
      rememberPosition();
    if (photos != null && photos.active()) {
      photos.show();
      return;
    }
    if (application != null && application.active()) {
      application.show();
      return;
    }
    renderedKey = tab + "|" + detail;
    shell = ui.column();
    shell.setBackgroundColor(ui.background);
    shell.setFocusableInTouchMode(true);
    setContentView(shell);
    ui.insets(shell);
    shell.requestFocus();
    cartFields.clear();
    cartPrices.clear();
    cartTotal = null;
    catalogTime = null;
    detailPrice = null;
    results = null;
    refreshButton = null;
    loginButton = null;
    sendButton = null;
    scroll = null;
    progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
    progress.setIndeterminate(true);
    progress.setVisibility(busy ? View.VISIBLE : View.GONE);
    shell.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));
    if (state.text("cookie").isEmpty() || !accessVerified) {
      login();
      return;
    }
    LinearLayout header = ui.row();
    header.setPadding(dp(16), dp(8), dp(16), dp(8));
    shell.addView(header);
    if (!detail.isEmpty())
      ui.button(header, "‹ Katalog", () -> {
        detail = "";
        render();
      }, false);
    else {
      header.addView(businessLogo(32));
      LinearLayout copy = ui.column();
      copy.setPadding(dp(12), 0, 0, 0);
      header.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
      ui.label(copy, tab, 24, ui.ink).setTypeface(null, Typeface.BOLD);
      ui.label(copy, DealerBranding.displayName(businessBrand()), 12, ui.muted);
      if (tab.equals("Katalog"))
        ui.label(copy, state.object("dealer").optString("display_name"), 12, ui.muted);
      if (!tab.equals("Ayarlar"))
        refreshButton = ui.button(header, "Yenile", this::refresh, false);
    }
    notice = ui.label(shell, message, 13, ui.accent);
    notice.setPadding(dp(16), dp(6), dp(16), dp(6));
    notice.setVisibility(message.isEmpty() ? View.GONE : View.VISIBLE);
    notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    shell.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
    body = ui.column();
    body.setPadding(dp(16), dp(4), dp(16), dp(20));
    scroll.addView(body);
    footer = ui.column();
    shell.addView(footer);
    switch (tab) {
      case "Sepet":
        cart();
        break;
      case "Siparişler":
        orders();
        break;
      case "Ayarlar":
        account();
        break;
      default:
        if (detail.isEmpty())
          catalog();
        else
          productDetail();
    }
    if (detail.isEmpty())
      navigation();
    int offset = positions.getOrDefault(renderedKey, 0);
    ScrollView current = scroll;
    current.post(() -> current.scrollTo(0, offset));
    loading(busy);
  }
  private void navigation() {
    navigation = ui.row();
    navigation.setPadding(dp(4), dp(4), dp(4), dp(4));
    navigation.setBackgroundColor(ui.surface);
    shell.addView(navigation);
    for (String destination : new String[] {"Katalog", "Sepet", "Siparişler", "Ayarlar"}) {
      String label = destination.equals("Sepet") && state.object("cart").length() > 0
          ? "Sepet (" + state.object("cart").length() + ")"
          : destination;
      Button button = ui.button(label, () -> navigate(destination), false);
      button.setTextSize(12);
      button.setPadding(dp(3), dp(8), dp(3), dp(8));
      button.setMinHeight(dp(64));
      button.setSelected(tab.equals(destination));
      button.setTextColor(tab.equals(destination) ? ui.accent : ui.muted);
      int icon = destination.equals("Katalog") ? R.drawable.nav_catalog
          : destination.equals("Sepet")        ? R.drawable.nav_cart
          : destination.equals("Siparişler")   ? R.drawable.nav_orders
                                               : R.drawable.nav_settings;
      android.graphics.drawable.Drawable symbol = getDrawable(icon).mutate();
      symbol.setTint(tab.equals(destination) ? ui.accent : ui.muted);
      symbol.setBounds(0, 0, dp(22), dp(22));
      button.setCompoundDrawables(null, symbol, null, null);
      button.setCompoundDrawablePadding(dp(3));
      button.setBackground(ui.shape(tab.equals(destination) ? ui.soft : ui.surface, 0, 12));
      button.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1));
      navigation.addView(button);
    }
  }
  private JSONObject businessBrand() {
    return state.brandingFor(state.text("connection_base"));
  }
  private ImageView businessLogo(int size) {
    ImageView view = ui.logo(size);
    String url = businessBrand().optString("logo_url");
    if (!url.isEmpty()) images.loadBrand(view, url);
    return view;
  }
  private JSONObject loadBusinessBrand(DealerApi api, String base) {
    try { return DealerBranding.normalize(api.applicationInfo(), base); }
    catch (Exception ignored) { return null; }
  }
  private boolean brandingRefreshDue(String base) {
    return !base.equals(state.text("branding_base"))
        || System.currentTimeMillis() - state.data.optLong("branding_at", 0) > 6 * 3600_000L;
  }
  private void login() {
    ScrollView container = new ScrollView(this);
    shell.addView(container, new LinearLayout.LayoutParams(-1, -1));
    LinearLayout form = ui.column(); form.setPadding(dp(16), dp(36), dp(16), dp(24)); container.addView(form);
    form.addView(businessLogo(72)); ui.label(form, DealerBranding.displayName(businessBrand()), 14, ui.muted);
    ui.label(form, "Müşteri hesabınıza giriş", 26, ui.ink).setTypeface(null, Typeface.BOLD);
    notice = ui.label(form, message, 14, ui.danger); notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    if (!state.text("cookie").isEmpty() && state.object("cart").length() > 0) {
      ui.label(form, "Çevrimdışı sepet (salt okunur)", 18, ui.ink);
      ui.label(form, "Sipariş göndermek için bayi erişimini doğrulayın.", 13, ui.muted);
      JSONObject cart = state.object("cart");
      for (Iterator<String> it = cart.keys(); it.hasNext();) {
        String id = it.next();
        JSONObject product = state.product(id);
        String name = product == null ? id : product.optString("name", id);
        ui.label(form, name + " × " + number(cart.optDouble(id)), 15, ui.ink);
      }
    }
    String base = state.text("connection_base");
    if (base.isEmpty() || accountConfig == null) {
      EditText connection = field(form, "İşletme bağlantısı", connectionInput.isEmpty() ? base : connectionInput,
          InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI, value -> connectionInput = value, 2048);
      connection.setHint("İşletmenin paylaştığı HTTPS bağlantısı");
      loginButton = ui.button(form, "İşletmeye bağlan", () -> safely(() -> {
        String target = DealerApi.normalizeBase(connection.getText().toString());
        task(() -> {
          DealerApi api = new DealerApi(target);
          JSONObject config = api.call("account/config", null, "").body;
          JSONObject response = new JSONObject().put("account", config);
          JSONObject branding = loadBusinessBrand(api, target);
          if (branding != null) response.put("branding", branding);
          return response;
        }, result -> {
          state.put("connection_base", target);
          state.updateBranding(target,
              result.optJSONObject("branding") == null ? new JSONObject() : result.getJSONObject("branding"));
          accountConfig = result.getJSONObject("account"); message = "";
        }, Task.LOGIN);
      }), true);
    } else if (!accountConfig.optBoolean("enabled")) {
      ui.label(form, "Bu işletmede Online Satış kapalı. Hesap erişimi işletme yeniden açtığında kullanılabilir.", 16, ui.ink);
      ui.button(form, "Yeniden kontrol et", () -> { accountConfig = null; render(); }, false);
    } else {
      ui.label(form, base, 13, ui.muted);
      EditText email = field(form, "E-posta", accountEmail, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, value -> accountEmail = value, 254);
      email.setAutofillHints(View.AUTOFILL_HINT_EMAIL_ADDRESS);
      EditText password = field(form, "Şifre", "", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD, null, 72);
      password.setSaveEnabled(false); password.setAutofillHints(View.AUTOFILL_HINT_PASSWORD);
      CheckBox remember = new CheckBox(this);
      remember.setText("Beni hatırla");
      remember.setChecked(state.rememberMe());
      remember.setOnCheckedChangeListener((button, enabled) -> safely(() -> state.setRememberMe(enabled)));
      form.addView(remember);
      loginButton = ui.button(form, "Giriş yap", () -> safely(() -> {
        JSONObject credentials = new JSONObject().put("email", email.getText().toString().trim()).put("password", password.getText().toString());
        password.setText(""); authenticate(base, "login", credentials);
      }), true);
      org.json.JSONArray providers = accountConfig.optJSONArray("providers");
      if (providers != null) for (int i = 0; i < providers.length(); i++) {
        String provider = providers.optString(i);
        if (provider.equals("google") || provider.equals("facebook")) ui.button(form, provider.equals("google") ? "Google ile giriş" : "Facebook ile giriş", () -> safely(() -> {
          String verifier = DealerAccountAuth.verifier(); state.put("oauth_verifier", verifier);
          task(() -> new DealerApi(base).call("account/oauth", new JSONObject().put("provider", provider).put("nativeChallenge", DealerAccountAuth.challenge(verifier)), "").body,
            result -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(result.getString("url")))), Task.LOGIN);
        }), false);
      }
      ui.button(form, "Hesap oluştur / Şifremi unuttum", () -> {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(accountConfig.getString("site_url")))); }
        catch (Exception error) { showMessage("İşletmenin web sitesindeki Hesabım alanını açın."); }
      }, false);
      ui.button(form, "Bayi başvurusu", () -> application.open(base), false);
      ui.button(form, "İşletmeyi değiştir", () -> safely(() -> { state.put("connection_base", ""); accountConfig = null; render(); }), false);
    }
    ui.button(form, "Yerel oturumu temizle", () -> safely(() -> { state.invalidateSession(); accessVerified = false; message = "Yerel oturum kapatıldı."; render(); }), false);
    // Public release feed remains accessible without an active dealer account.
    form.addView(com.yardimciasistan.update.AndroidUpdates.settingsView(
        this, "android-dealer", ".files"));
    loading(busy);
  }
  private void authenticate(String base, String endpoint, JSONObject credentials) {
    task(() -> {
      DealerApi api = new DealerApi(base);
      DealerApi.Reply login = api.call("account/" + endpoint, credentials, "");
      if (login.cookie.isEmpty()) throw new IllegalStateException("Oturum alınamadı.");
      try { return new JSONObject().put("cookie", login.cookie).put("dealer", api.call("session", null, login.cookie).body.getJSONObject("dealer")); }
      catch (Exception error) { try { api.call("account/logout", new JSONObject(), login.cookie); } catch (Exception ignored) {} throw error; }
    }, result -> {
      state.authenticate(base, result.getString("cookie"), result.getJSONObject("dealer"));
      state.put("connection_base", base); message = ""; accessVerified = true; hideKeyboard();
      new android.os.Handler(getMainLooper()).post(this::refresh);
    }, Task.LOGIN);
  }
  private void catalog() {
    EditText search = field(body, "Ürün veya kod ara", query, InputType.TYPE_CLASS_TEXT, null, 180);
    search.setHint("Ürün, kod veya marka");
    Set<String> categories = new TreeSet<>(), brands = new TreeSet<>();
    JSONArray products = state.object("catalog").optJSONArray("products");
    if (products != null)
      for (int i = 0; i < products.length(); i++) {
        JSONObject p = products.optJSONObject(i);
        if (p == null)
          continue;
        if (!p.optString("category_name").isEmpty())
          categories.add(p.optString("category_name"));
        if (!p.optString("brand").isEmpty())
          brands.add(p.optString("brand"));
      }
    HorizontalScrollView filters = new HorizontalScrollView(this);
    filters.setHorizontalScrollBarEnabled(false);
    LinearLayout options = ui.row();
    filters.addView(options);
    body.addView(filters);
    filter(options, withAll("Tüm kategoriler", categories), category, "Kategori", true);
    filter(options, withAll("Tüm markalar", brands), brand, "Marka", false);
    Button favorite = ui.choice(options, "Favoriler", favoritesOnly, () -> {
      favoritesOnly = !favoritesOnly;
      page = 0;
      renderProducts(results);
    });
    favorite.setOnClickListener(v -> {
      favoritesOnly = !favoritesOnly;
      favorite.setSelected(favoritesOnly);
      favorite.setContentDescription(favoritesOnly ? "Favoriler, seçili" : "Favoriler");
      favorite.setBackground(ui.shape(
          favoritesOnly ? ui.soft : ui.surface, favoritesOnly ? ui.accent : ui.border, 12));
      page = 0;
      renderProducts(results);
    });
    catalogTime = ui.label(body,
        getString(R.string.last_updated, fallback(state.text("catalog_at"), "Henüz alınmadı")), 12,
        ui.muted);
    results = ui.column();
    body.addView(results);
    renderProducts(results);
    watch(search, value -> {
      query = value;
      page = 0;
      renderProducts(results);
    });
  }
  private void filter(LinearLayout parent, List<String> values, String selected, String caption,
      boolean isCategory) {
    Button view = ui.button(parent, selected, () -> {}, false);
    view.setContentDescription(caption + ": " + selected);
    view.setOnClickListener(v
        -> new AlertDialog.Builder(this)
            .setTitle(caption)
            .setItems(values.toArray(new String[0]),
                (dialog, index) -> {
                  String next = values.get(index);
                  if (isCategory)
                    category = next;
                  else
                    brand = next;
                  view.setText(next);
                  view.setContentDescription(caption + ": " + next);
                  page = 0;
                  renderProducts(results);
                })
            .show());
  }
  private void renderProducts(LinearLayout target) {
    if (target == null)
      return;
    target.removeAllViews();
    JSONArray products = state.object("catalog").optJSONArray("products");
    int count = 0;
    if (products != null)
      for (int i = 0; i < products.length(); i++) {
        JSONObject p = products.optJSONObject(i);
        if (p == null)
          continue;
        String searchable = (p.optString("name") + " " + p.optString("sku") + " "
            + p.optString("brand") + " " + p.optString("category_name"))
                                .toLowerCase(locale);
        if (!searchable.contains(query.toLowerCase(locale))
            || favoritesOnly && !state.object("favorites").has(p.optString("product_id"))
            || !category.equals("Tüm kategoriler") && !category.equals(p.optString("category_name"))
            || !brand.equals("Tüm markalar") && !brand.equals(p.optString("brand")))
          continue;
        count++;
        if (count > (page + 1) * 30)
          continue;
        LinearLayout card = ui.card(target), row = ui.row();
        card.addView(row);
        ImageView image = productImage(p, 72);
        row.addView(image, new LinearLayout.LayoutParams(dp(72), dp(72)));
        LinearLayout copy = ui.column();
        copy.setPadding(dp(12), 0, 0, 0);
        row.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
        ui.label(copy, p.optString("name"), 17, ui.ink).setTypeface(null, Typeface.BOLD);
        if (!p.optString("sku").isEmpty())
          ui.label(copy, p.optString("sku"), 13, ui.muted);
        ui.label(copy, price(p), 18, ui.accent).setTypeface(null, Typeface.BOLD);
        card.setContentDescription(p.optString("name") + " ürününü incele");
        card.setFocusable(true);
        card.setClickable(true);
        card.setOnClickListener(v -> {
          hideKeyboard();
          detail = p.optString("product_id");
          render();
        });
      }
    if (count == 0)
      ui.label(target,
          products == null ? "Kataloğunuz henüz alınmadı. Yenile’ye dokunun."
                           : "Aramanıza uygun ürün yok.",
          16, ui.muted);
    if (count > (page + 1) * 30)
      ui.button(target, "Daha fazla ürün", () -> {
        page++;
        int offset = scroll.getScrollY();
        renderProducts(target);
        scroll.post(() -> scroll.scrollTo(0, offset));
      }, false);
  }
  private ImageView productImage(JSONObject product, int height) {
    ImageView view = new ImageView(this);
    view.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
    view.setImageResource(R.drawable.ic_no_photo);
    view.setContentDescription(product.optString("name") + " fotoğrafı");
    view.setBackground(ui.shape(ui.surface, ui.border, 12));
    view.setMinimumHeight(dp(height));
    ArrayList<String> sources = DealerPhotoViewer.sources(product);
    images.load(view, sources.isEmpty() ? "" : sources.get(0));
    return view;
  }
  private void productDetail() {
    JSONObject product = state.product(detail);
    if (product == null) {
      ui.label(body, "Ürün artık katalogda bulunmuyor.", 18, ui.ink);
      return;
    }
    ImageView image = productImage(product, 220);
    body.addView(image, new LinearLayout.LayoutParams(-1, dp(240)));
    ArrayList<String> photoSources = DealerPhotoViewer.sources(product);
    if (photoSources.isEmpty())
      ui.label(body, "Fotoğraf yok", 13, ui.muted);
    else {
      image.setScaleType(ImageView.ScaleType.FIT_CENTER);
      image.setOnClickListener(v -> photos.open(product));
      ui.button(body,
          "Fotoğrafı incele" + (photoSources.size() > 1 ? " (" + photoSources.size() + ")" : ""),
          () -> photos.open(product), false);
    }
    ui.label(body, product.optString("name"), 26, ui.ink).setTypeface(null, Typeface.BOLD);
    ui.label(body, join(product.optString("brand"), product.optString("sku")), 14, ui.muted);
    detailPrice =
        ui.label(body, price(product) + " / " + unit(product.optString("unit")), 24, ui.accent);
    if (!product.optString("description").isEmpty())
      ui.label(body, product.optString("description"), 16, ui.ink);
    Button favorite = ui.button(body,
        state.object("favorites").has(detail) ? "Favorilerimden çıkar" : "Favorilerime ekle",
        () -> {}, false);
    favorite.setOnClickListener(v -> safely(() -> {
      state.favorite(detail);
      favorite.setText(
          state.object("favorites").has(detail) ? "Favorilerimden çıkar" : "Favorilerime ekle");
    }));
    footer.setPadding(dp(16), dp(8), dp(16), dp(12));
    footer.setBackgroundColor(ui.surface);
    EditText quantity = quantityControl(
        footer, "Eklenecek miktar (" + unit(product.optString("unit")) + ")", "1", null);
    ui.button(footer, "Sepete ekle",
        ()
            -> safely(() -> {
          state.quantity(detail, state.object("cart").optDouble(detail, 0) + amount(quantity));
          quantityDrafts.remove(detail);
          showMessage("Ürün sepetinize eklendi.");
        }),
        true);
  }
  private EditText quantityControl(
      LinearLayout parent, String caption, String value, TextChange change) {
    ui.label(parent, caption, 13, ui.muted);
    LinearLayout row = ui.row();
    parent.addView(row);
    final EditText[] holder = new EditText[1];
    Button minus = ui.button(row, "−",
        () -> safely(() -> holder[0].setText(number(Math.max(0, amount(holder[0]) - 1)))), false);
    EditText input = new EditText(this);
    input.setContentDescription(caption);
    input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    input.setTextColor(ui.ink);
    input.setTextSize(16);
    input.setSingleLine(true);
    input.setMinHeight(dp(52));
    input.setPadding(dp(10), dp(8), dp(10), dp(8));
    input.setBackground(ui.shape(ui.surface, ui.border, 12));
    input.setFilters(
        new android.text.InputFilter[] {new android.text.InputFilter.LengthFilter(12)});
    input.setText(value);
    row.addView(input, new LinearLayout.LayoutParams(0, -2, 1));
    holder[0] = input;
    Button plus = ui.button(row, "+",
        () -> safely(() -> input.setText(number(Math.min(1000, amount(input) + 1)))), false);
    minus.setContentDescription(caption + " azalt");
    plus.setContentDescription(caption + " artır");
    if (change != null)
      watch(input, change);
    return input;
  }
  private void cart() {
    cartSelector();
    JSONObject cart = state.object("cart");
    if (cart.length() == 0) {
      ui.label(body, "Sepetiniz boş", 24, ui.ink);
      ui.button(body, "Katalogdan ürün seç", () -> navigate("Katalog"), true);
      return;
    }
    boolean pending = state.data.has("pending");
    for (Iterator<String> it = cart.keys(); it.hasNext();) {
      String id = it.next();
      JSONObject product = state.product(id);
      String name = product == null ? "Artık sunulmayan ürün" : product.optString("name");
      LinearLayout card = ui.card(body);
      ui.label(card, name, 17, ui.ink).setTypeface(null, Typeface.BOLD);
      cartPrices.put(id,
          ui.label(card, product == null ? "Ürün artık sunulmuyor" : price(product), 15, ui.muted));
      EditText quantity = quantityControl(card, name + " miktarı",
          quantityDrafts.getOrDefault(id, number(cart.optDouble(id))), value -> {
            quantityDrafts.put(id, value);
            if (state.data.has("pending"))
              return;
            try {
              double amount = Double.parseDouble(value.trim().replace(',', '.'));
              state.quantity(id, amount);
              updateCartTotal();
            } catch (IllegalArgumentException ignored) { /* Keep incomplete typing until submit; do
                                                            not replace the field or its focus. */
            } catch (Exception error) {
              fatalStorage();
            }
          });
      quantity.setEnabled(!pending && product != null);
      cartFields.put(id, quantity);
      LinearLayout controls = (LinearLayout) quantity.getParent();
      for (int i = 0; i < controls.getChildCount(); i++)
        controls.getChildAt(i).setEnabled(!pending && product != null);
      Button remove = ui.button(card, "Çıkar",
          ()
              -> safely(() -> {
            state.quantity(id, 0);
            quantityDrafts.remove(id);
            render();
          }),
          false);
      remove.setContentDescription(name + " sepetten çıkar");
      remove.setEnabled(!pending);
    }
    cartTotal = ui.label(body, "", 23, ui.accent);
    updateCartTotal();
    ui.label(body, "Fiyatlar işletme onayında güncellenebilir.", 12, ui.muted);
    JSONArray methods = state.object("catalog").optJSONArray("delivery_methods");
    List<String> options = new ArrayList<>();
    if (methods != null)
      for (int i = 0; i < methods.length(); i++)
        options.add(methods.optString(i).equals("shipping") ? "Adrese gönderim" : "Elden teslim");
    String method = state.text("delivery");
    boolean allowed = false;
    if (methods != null)
      for (int i = 0; i < methods.length(); i++)
        if (methods.optString(i).equals(method))
          allowed = true;
    if (!pending && !allowed && methods != null && methods.length() > 0) {
      method = methods.optString(0);
      persist("delivery", method);
    }
    String selected = method.equals("shipping") ? "Adrese gönderim" : "Elden teslim";
    Spinner delivery =
        ui.selector(body, "Teslimat tercihi", options, selected, value -> safely(() -> {
          state.put("delivery", value.equals("Adrese gönderim") ? "shipping" : "pickup");
          render();
        }));
    delivery.setEnabled(!pending);
    if (method.equals("shipping")) {
      String[] keys = {
          "recipientName", "addressLine1", "district", "city", "postalCode", "countryCode"};
      String[] captions = {"Teslim alacak kişi", "Açık adres", "İlçe", "İl",
          "Posta kodu (isteğe bağlı)", "Ülke kodu"};
      int[] limits = {160, 300, 120, 120, 32, 2};
      for (int i = 0; i < keys.length; i++) {
        String key = keys[i];
        EditText field = field(body, captions[i],
            state.object("address").optString(key, key.equals("countryCode") ? "TR" : ""),
            InputType.TYPE_CLASS_TEXT, value -> persistAddress(key, value), limits[i]);
        field.setEnabled(!pending);
        if (key.equals("countryCode") && !state.object("address").has(key))
          persistAddress(key, "TR");
      }
    }
    EditText note = field(body, "Sipariş notu (isteğe bağlı)", state.text("note"),
        InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE,
        value -> persist("note", value), 2000);
    note.setEnabled(!pending);
    if (pending)
      ui.label(body, "Gönderim doğrulanamadı. Sipariş içeriğiniz korunuyor.", 14, ui.accent);
    sendButton = ui.button(body, pending ? "Aynı siparişi tekrar dene" : "Siparişi gönder",
        () -> safely(this::submit), true);
  }
  private void cartSelector() {
    JSONArray carts;
    try {
      carts = state.carts();
    } catch (Exception error) {
      fatalStorage();
      return;
    }
    boolean locked = state.data.has("pending");
    ui.label(body, "Sepetler", 13, ui.muted);
    HorizontalScrollView strip = new HorizontalScrollView(this);
    strip.setHorizontalScrollBarEnabled(false);
    LinearLayout names = ui.row();
    strip.addView(names);
    body.addView(strip);
    for (int i = 0; i < carts.length(); i++) {
      JSONObject entry = carts.optJSONObject(i);
      if (entry == null)
        continue;
      String id = entry.optString("id");
      String name = entry.optString("name", "Sepet");
      boolean active = entry.optBoolean("active");
      Button choice = ui.choice(names, name, active, () -> {});
      choice.setTextSize(13);
      choice.setPadding(dp(10), dp(6), dp(10), dp(6));
      choice.setContentDescription("Sepet: " + name + (active ? ", etkin" : ""));
      choice.setEnabled(!locked);
      if (!active)
        choice.setOnClickListener(view -> safely(() -> switchCart(id)));
      LinearLayout.LayoutParams params = (LinearLayout.LayoutParams) choice.getLayoutParams();
      params.setMargins(0, 0, dp(8), 0);
      choice.setLayoutParams(params);
    }
    TextView current = ui.label(body, "Etkin sepet: " + state.activeCartName(), 15, ui.ink);
    current.setTypeface(null, Typeface.BOLD);
    LinearLayout actions = ui.row();
    body.addView(actions);
    Button create = ui.button(actions, "Yeni", () -> safely(this::newCart), false);
    Button rename = ui.button(actions, "Adlandır", () -> safely(this::renameCart), false);
    Button delete = ui.button(actions, "Sil", () -> safely(this::removeCart), false);
    create.setEnabled(!locked);
    rename.setEnabled(!locked);
    delete.setEnabled(!locked);
    if (locked)
      ui.label(body, PENDING_CARTS, 13, ui.accent);
  }
  private void switchCart(String id) throws Exception {
    if (state.data.has("pending"))
      throw new IllegalStateException(PENDING_CARTS);
    state.selectCart(id);
    message = "";
    resetCart();
  }
  private void newCart() throws Exception {
    if (state.data.has("pending"))
      throw new IllegalStateException(PENDING_CARTS);
    if (state.carts().length() >= DealerState.MAX_CARTS)
      throw new IllegalArgumentException(
          "En fazla " + DealerState.MAX_CARTS + " sepet oluşturulabilir.");
    cartName("Yeni sepet", "", "Oluştur", value -> {
      state.newCart(value);
      message = "Yeni sepet oluşturuldu.";
      resetCart();
    });
  }
  private void renameCart() throws Exception {
    if (state.data.has("pending"))
      throw new IllegalStateException(PENDING_CARTS);
    String id = state.activeCartId();
    cartName("Sepeti adlandır", state.activeCartName(), "Kaydet", value -> {
      state.renameCart(id, value);
      message = "Sepet adı güncellendi.";
      resetCart();
    });
  }
  private void removeCart() {
    if (state.data.has("pending")) {
      showMessage(PENDING_CARTS);
      return;
    }
    String id = state.activeCartId();
    new AlertDialog.Builder(this)
        .setTitle("Sepet silinsin mi?")
        .setMessage("“" + state.activeCartName() + "” sepeti ve içeriği silinecek.")
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton(
            "Sepeti sil",
            (dialog, which) -> safely(() -> {
              state.deleteCart(id);
              message = "Sepet silindi.";
              resetCart();
            }))
        .show();
  }
  /** Fresh active cart: drop drafts, field bindings and cached scroll offsets. */
  private void resetCart() {
    quantityDrafts.clear();
    cartFields.clear();
    positions.clear();
    freshScroll = true;
    render();
  }
  private interface CartName {
    void run(String name) throws Exception;
  }
  private void cartName(String title, String initial, String confirm, CartName action) {
    EditText input = new EditText(this);
    input.setContentDescription("Sepet adı");
    input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
    input.setSingleLine(true);
    input.setTextSize(16);
    input.setTextColor(ui.ink);
    input.setHintTextColor(ui.muted);
    input.setHint("En fazla " + DealerState.MAX_CART_NAME + " karakter");
    input.setPadding(dp(12), dp(10), dp(12), dp(10));
    input.setBackground(ui.shape(ui.surface, ui.border, 12));
    input.setFilters(new android.text.InputFilter[] {
        new android.text.InputFilter.LengthFilter(DealerState.MAX_CART_NAME)});
    input.setText(initial);
    input.setSelection(initial.length());
    FrameLayout frame = new FrameLayout(this);
    frame.setPadding(dp(20), dp(4), dp(20), 0);
    frame.addView(input, new FrameLayout.LayoutParams(-1, -2));
    AlertDialog dialog = new AlertDialog.Builder(this)
        .setTitle(title)
        .setView(frame)
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton(confirm, null)
        .create();
    dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE)
        .setOnClickListener(view -> {
          try {
            action.run(input.getText().toString().trim());
            dialog.dismiss();
          } catch (IllegalArgumentException | IllegalStateException error) {
            input.setError(error.getMessage());
          } catch (Exception error) {
            dialog.dismiss();
            fatalStorage();
          }
        }));
    dialog.getWindow().setSoftInputMode(
        android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
    dialog.show();
    input.requestFocus();
  }
  private void updateCartTotal() {
    if (cartTotal == null)
      return;
    try {
      JSONObject cart = state.object("cart");
      String currency = "";
      Iterator<String> it = cart.keys();
      if (it.hasNext()) {
        JSONObject p = state.product(it.next());
        if (p != null)
          currency = p.optString("currency");
      }
      cartTotal.setText(
          getString(R.string.estimated_total, money(state.total().doubleValue(), currency)));
    } catch (Exception error) {
      cartTotal.setText(error.getMessage());
    }
  }
  private void submit() throws Exception {
    if (busy) {
      showMessage("Yenileme bitince siparişinizi gönderebilirsiniz.");
      return;
    }
    if (!state.data.has("pending"))
      for (Map.Entry<String, EditText> entry : cartFields.entrySet()) {
        double value = amount(entry.getValue());
        if (value <= 0)
          throw new IllegalArgumentException(
              "Miktar sıfırdan büyük olmalı. İstemediğiniz ürünü Çıkar ile kaldırın.");
        state.quantity(entry.getKey(), value);
      }
    JSONObject request = state.prepareOrder();
    String base = state.text("base"), cookie = state.text("cookie");
    hideKeyboard();
    render();
    task(() -> new DealerSession(base, cookie, rotatedCookieSaver()).submit(request), receipt -> {
      state.accepted(receipt);
      quantityDrafts.clear();
      tab = "Siparişler";
      detail = "";
      message = "Talebiniz alındı. İşletme onayı bekleniyor.";
    }, Task.SUBMIT);
  }
  private void orders() {
    ui.label(
        body, "Son kontrol: " + fallback(state.text("orders_at"), "Henüz alınmadı"), 12, ui.muted);
    JSONArray orders = state.array("orders");
    if (orders.length() == 0)
      ui.label(body,
          state.object("last_receipt").has("order_id")
              ? "Talebiniz alındı. İşletmeye iletiliyor; durumu görmek için yenileyin."
              : "Henüz siparişiniz yok.",
          16, ui.muted);
    for (int i = 0; i < orders.length(); i++) {
      JSONObject order = orders.optJSONObject(i);
      if (order == null)
        continue;
      LinearLayout card = ui.card(body);
      ui.label(card, status(order.optString("status")), 18, ui.accent)
          .setTypeface(null, Typeface.BOLD);
      ui.label(card, order.optString("created_at").replace('T', ' '), 13, ui.muted);
      if (!order.isNull("total"))
        ui.label(card, money(order.optDouble("total"), order.optString("currency")), 22, ui.ink);
      JSONArray items = order.optJSONArray("items");
      if (items == null)
        continue;
      LinearLayout lines = ui.column();
      card.addView(lines);
      for (int j = 0; j < items.length(); j++) {
        JSONObject item = items.optJSONObject(j);
        if (item == null)
          continue;
        JSONObject product = state.product(item.optString("product_id"));
        ui.label(lines,
            number(item.optDouble("quantity")) + " × "
                + fallback(
                    item.optString("name"), product == null ? "Ürün" : product.optString("name")),
            15, ui.ink);
      }
      if (items.length() > 0) {
        Button reorder = ui.button(card, "Tekrar sepete ekle",
            ()
                -> safely(() -> {
              int missing = state.reorder(items);
              quantityDrafts.clear();
              tab = "Sepet";
              message = missing == 0 ? "Ürünler güncel fiyatlarla sepete eklendi."
                                     : missing + " ürün artık sunulmuyor; diğerleri eklendi.";
              render();
            }),
            false);
        reorder.setContentDescription(
            order.optString("order_id") + " ürünlerini tekrar sepete ekle");
      }
    }
  }
  private void account() {
    body.addView(com.yardimciasistan.update.AndroidUpdates.settingsView(
        this, "android-dealer", ".files"));
    DealerAppearance selected = ui.appearance;
    choices(body, "Tema", new String[] {"Sistem", "Açık", "Koyu"},
        new String[] {"system", "light", "dark"}, selected.theme,
        value
        -> appearance(new DealerAppearance(
            value, selected.accent, selected.fontPercent, selected.highContrast)));
    String[] sizes = new String[DealerAppearance.FONT_OPTIONS.length];
    for (int i = 0; i < sizes.length; i++) sizes[i] = "%" + DealerAppearance.FONT_OPTIONS[i];
    choices(body, "Yazı boyutu", sizes, sizes, "%" + selected.fontPercent,
        value
        -> appearance(new DealerAppearance(selected.theme, selected.accent,
            Integer.parseInt(value.substring(1)), selected.highContrast)));
    choices(body, "Renk tonu", new String[] {"Mavi", "Yeşil", "Sıcak", "Mor"},
        DealerAppearance.ACCENTS, selected.accent,
        value
        -> appearance(new DealerAppearance(
            selected.theme, value, selected.fontPercent, selected.highContrast)));
    choices(body, "Kontrast", new String[] {"Normal", "Yüksek"}, new String[] {"normal", "high"},
        selected.highContrast ? "high" : "normal",
        value
        -> appearance(new DealerAppearance(
            selected.theme, selected.accent, selected.fontPercent, value.equals("high"))));
    LinearLayout preview = ui.card(body);
    ui.label(preview, "Önizleme", 13, ui.muted);
    ui.label(preview, "Ürün adı", 18, ui.ink).setTypeface(null, Typeface.BOLD);
    ui.label(preview, "Seçtiğiniz görünüm", 15, ui.muted);
    ui.button(preview, "Örnek düğme", () -> {}, true);
    ui.button(body, "Görünümü sıfırla", () -> appearance(DealerAppearance.defaults()), false);
    LinearLayout identity = ui.card(body);
    ui.label(identity, state.object("dealer").optString("display_name"), 18, ui.ink);
    ui.label(identity, host(), 13, ui.muted);
    ui.button(body, "Oturumu kapat",
        ()
            -> new AlertDialog.Builder(this)
                .setTitle("Oturum kapatılsın mı?")
                .setMessage(state.data.has("pending")
                        ? "Önce Sepet’ten bekleyen siparişinizi tekrar deneyin."
                        : "Aynı müşteri hesabınızla yeniden giriş yapabilirsiniz.")
                .setNegativeButton("Vazgeç", null)
                .setPositiveButton(state.data.has("pending") ? "Sepete dön" : "Oturumu kapat",
                    (dialog, which) -> {
                      if (state.data.has("pending")) {
                        navigate("Sepet");
                        return;
                      }
                      String cookie = state.text("cookie"), base = state.text("base");
                      task(()
                               -> new DealerApi(base).call("account/logout", new JSONObject(), cookie).body,
                          result
                          -> {
                            state.logout(); accessVerified = false;
                            quantityDrafts.clear();
                            positions.clear();
                            tab = "Katalog";
                            message = "Oturumunuz kapatıldı.";
                          },
                          Task.LOGOUT);
                    })
                .show(),
        false);
  }
  private void choices(LinearLayout parent, String title, String[] captions, String[] values,
      String selected, TextChange change) {
    ui.label(parent, title, 16, ui.ink).setTypeface(null, Typeface.BOLD);
    LinearLayout line = null;
    for (int i = 0; i < captions.length; i++) {
      if (i % 2 == 0) {
        line = ui.row();
        parent.addView(line);
      }
      String value = values[i];
      Button choice =
          ui.choice(line, captions[i], value.equals(selected), () -> change.changed(value));
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, -2, 1);
      params.setMargins(0, dp(4), dp(8), dp(4));
      choice.setLayoutParams(params);
    }
  }
  private void appearance(DealerAppearance next) {
    if (!DealerUi.save(this, next)) {
      showMessage("Görünüm kaydedilemedi. Yeniden deneyin.");
      return;
    }
    rememberPosition();
    recreate();
  }
  private void persist(String key, String value) {
    try {
      state.put(key, value);
    } catch (Exception error) {
      fatalStorage();
    }
  }
  private void persistAddress(String key, String value) {
    try {
      JSONObject address = state.object("address");
      address.put(key, value);
      state.put("address", address);
    } catch (Exception error) {
      fatalStorage();
    }
  }
  interface TextChange {
    void changed(String value);
  }
  private EditText field(
      LinearLayout parent, String caption, String value, int type, TextChange change, int max) {
    EditText input = ui.field(parent, caption, value, type, max);
    if (change != null)
      watch(input, change);
    return input;
  }
  private void watch(EditText field, TextChange change) {
    field.addTextChangedListener(new TextWatcher() {
      public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
      public void afterTextChanged(Editable s) {}
      public void onTextChanged(CharSequence s, int start, int before, int count) {
        change.changed(s.toString());
      }
    });
  }
  private int dp(int value) {
    return ui.dp(value);
  }
  private String price(JSONObject product) {
    return "Kayıtlı fiyat (değişebilir): " + money(product.optDouble("price"), product.optString("currency"));
  }
  private String money(double amount, String currency) {
    NumberFormat format = NumberFormat.getNumberInstance(locale);
    format.setMinimumFractionDigits(2);
    format.setMaximumFractionDigits(2);
    return format.format(amount) + " " + (currency.equals("TRY") ? "TL" : currency);
  }
  private String number(double value) {
    return java.math.BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
  }
  private double amount(EditText input) {
    try {
      double value = Double.parseDouble(input.getText().toString().trim().replace(',', '.'));
      if (!Double.isFinite(value) || value < 0 || value > 1000)
        throw new NumberFormatException();
      return value;
    } catch (NumberFormatException error) {
      input.setError("Geçerli bir miktar girin.");
      throw new IllegalArgumentException("Geçerli bir miktar girin.");
    }
  }
  private String host() {
    try {
      return new java.net.URI(state.text("base")).getHost();
    } catch (Exception error) {
      return "";
    }
  }
  private String fallback(String value, String replacement) {
    return value.isEmpty() ? replacement : value;
  }
  private String join(String a, String b) {
    return a.isEmpty() ? b : b.isEmpty() ? a : a + " · " + b;
  }
  private String now() {
    return new java.text.SimpleDateFormat("dd.MM.yyyy HH:mm", locale).format(new Date());
  }
  private List<String> withAll(String all, Set<String> options) {
    List<String> result = new ArrayList<>();
    result.add(all);
    result.addAll(options);
    return result;
  }
  private String unit(String value) {
    switch (value) {
      case "piece":
        return "adet";
      case "pack":
        return "paket";
      case "box":
        return "kutu";
      case "meter":
        return "metre";
      case "other":
        return "birim";
      default:
        return value;
    }
  }
  static String status(String value) {
    switch (value) {
      case "placed":
        return "Sipariş alındı";
      case "confirmed":
        return "Onaylandı";
      case "fulfilled":
        return "Tamamlandı";
      case "cancelled":
        return "İptal edildi";
      case "rejected":
        return "Erişim iptali nedeniyle işlenemedi";
      case "awaiting_desktop":
        return "İşletmeye iletiliyor";
      default:
        return "Durum alınamadı";
    }
  }
}

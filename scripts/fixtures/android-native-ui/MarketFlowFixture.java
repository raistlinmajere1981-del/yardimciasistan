package com.yardimciasistan.android;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.os.Build;
import android.view.ContextThemeWrapper;
import android.view.View;
import android.view.ViewGroup;
import android.view.inspector.WindowInspector;
import android.widget.Button;
import android.widget.EditText;
import android.widget.CheckBox;
import android.widget.Spinner;
import android.widget.TextView;
import java.util.Arrays;
import java.util.Locale;
import java.util.function.Consumer;
import org.json.JSONObject;

/** Real native Market forms with an in-memory transport boundary; no storage or network. */
final class MarketFlowFixture implements MarketWorkspace.Listener {
  private final Activity activity;
  private final Context context;
  private final MarketWorkspace workspace;
  private final OperationData data = new OperationData();
  private final OperationData.MarketProduct product = new OperationData.MarketProduct();
  private View page;
  private boolean accept;
  private int pending;
  private String action;
  private JSONObject payload;
  private int lookupCalls;
  private String lookupScreen;
  private String priorAction;

  MarketFlowFixture(Activity activity) {
    // Exercise the supported manual scanner fallback, without changing device permissions/camera.
    this.activity = activity;
    context = new ContextThemeWrapper(activity, 0);
    workspace = new MarketWorkspace(context, this);
    data.deviceActive = true; data.permissionsResolved = true; data.capabilitiesResolved = true; data.deviceRole = "admin";
    data.businessCapabilities.addAll(Arrays.asList("service.android", MarketUiRules.CAPABILITY_BARCODE, MarketUiRules.CAPABILITY_INVENTORY,
        MarketUiRules.CAPABILITY_PURCHASING, MarketUiRules.CAPABILITY_CATALOG, MarketUiRules.CAPABILITY_SALES, "commerce.customer_credit", "core.customers", "core.finance"));
    data.permissions.addAll(Arrays.asList(MarketUiRules.PERMISSION_SUMMARY, MarketUiRules.PERMISSION_PRODUCT_VIEW,
        MarketUiRules.PERMISSION_STOCK_COUNT, MarketUiRules.PERMISSION_RECEIVING, MarketUiRules.PERMISSION_PRODUCT_CREATE,
        MarketUiRules.PERMISSION_CART_DRAFT, MarketUiRules.PERMISSION_SALE, MarketUiRules.PERMISSION_CREDIT_VIEW,
        MarketUiRules.PERMISSION_CREDIT_PAYMENT, MarketUiRules.PERMISSION_SCAN_TO_DESKTOP));
    product.id = "fixture-product"; product.name = "Test Ürün"; product.barcode = "8690000000011";
    product.unit = "piece"; product.currency = "TRY"; product.salePrice = 10; product.currentQuantity = 20; product.trackInventory = true; product.active = true;
    product.updatedAt = "2026-10-18T12:00:00Z";
    product.inventoryUpdatedAt = "2026-10-18T12:00:00Z";
    data.market.primaryLocationId = "fixture-location";
    data.market.products.add(product);
    OperationData.CustomerCreditAccount account = new OperationData.CustomerCreditAccount();
    account.customerId = "fixture-customer"; account.fullName = "Işıl İzmir";
    OperationData.CreditBalance balance = new OperationData.CreditBalance(); balance.currency = "TRY"; balance.amountMinor = 5000;
    account.balances.add(balance); data.market.customerCreditAccounts.add(account);
  }

  void exercise(NativeUiFamilyFixture.Runner runner, Consumer<View> measure) {
    runner.ui(() -> { locale(); catalogPreviews(); });
    runner.ui(() -> { render(); });
    runner.ui(() -> { measure.accept(page); });
    runner.ui(() -> { click("Ürün Ara"); });
    runner.ui(() -> { chooseProduct(); });
    runner.ui(() -> { click("Sepete Ekle"); });
    runner.ui(() -> { require(workspace.screenKey().equals("cart"), "catalog selection routes to shared cart draft"); });
    runner.ui(() -> { field("Not (isteğe bağlı)").setText("bağımsız sepet taslağı"); });
    runner.ui(() -> { measure.accept(page); });
    runner.ui(() -> { workspace.handleBack(); });
    runner.ui(() -> { click("Stok Say"); });
    runner.ui(() -> { click("Ürün Seç"); });
    runner.ui(() -> { chooseProduct(); });
    runner.ui(() -> { field("Fiziksel miktar").setText("3"); });
    runner.ui(() -> { field("Not (isteğe bağlı)").setText("sayım"); });
    runner.ui(() -> { accept = false; });
    runner.ui(() -> { click("Sayımı Kaydet"); });
    runner.ui(() -> { require(field("Fiziksel miktar").getText().toString().equals("3"), "rejected stock submission retains form draft"); });
    runner.ui(() -> { accept = true; });
    runner.ui(() -> { click("Sayımı Kaydet"); });
    runner.ui(() -> { require(action.equals(MarketUiRules.ACTION_STOCK_COUNT) && payload.optDouble("counted_quantity") == 3 && !payload.has("delta"), "stock uses absolute canonical payload"); });
    runner.ui(() -> { require(field("Fiziksel miktar").length() == 0 && product.currentQuantity == 20, "accepted stock clears draft without optimistic snapshot mutation"); });
    runner.ui(() -> { measure.accept(page); });
    runner.ui(() -> { workspace.handleBack(); });
    runner.ui(() -> { click("Mal Kabul"); });
    runner.ui(() -> { click("Ürün Seç"); });
    runner.ui(() -> { chooseProduct(); });
    runner.ui(() -> { setDialogField("Miktar", "2"); });
    runner.ui(() -> { setDialogField("Birim alış fiyatı", "4"); });
    runner.ui(() -> { positive(); });
    runner.ui(() -> { measure.accept(page); });
    runner.ui(() -> { click("Mal Kabulü Gönder"); });
    runner.ui(() -> { positive(); });
    runner.ui(() -> { require(action.equals(MarketUiRules.ACTION_PURCHASE_RECEIVE) && payload.optJSONArray("lines").length() == 1, "receiving has independent canonical draft/payload"); });
    runner.ui(() -> { require(product.currentQuantity == 20, "receiving waits for authoritative snapshot"); });
    runner.ui(() -> { workspace.handleBack(); });
    runner.ui(() -> { click("Sepet"); });
    runner.ui(() -> { require(field("Not (isteğe bağlı)").getText().toString().equals("bağımsız sepet taslağı"), "inventory submissions preserve cart draft"); });
    runner.ui(() -> { click("Satışı Tamamla"); });
    runner.ui(() -> { pending = 1; });
    runner.ui(() -> { render(); });
    runner.ui(() -> { require(!find(page, "Satışı Onayla ve Gönder").isEnabled(), "pending outbox blocks financial submission"); });
    runner.ui(() -> { workspace.handleBack(); });
    runner.ui(() -> { workspace.handleBack(); });
    runner.ui(() -> { click("Yeni Ürün"); });
    runner.ui(() -> { setDialogField("Barkod", "8690000000099"); });
    runner.ui(() -> { positive(); });
    runner.ui(() -> { require(workspace.screenKey().equals("product_create"), "manual barcode dismisses before product form route"); });
    runner.ui(() -> { require(find(page, "Ürünü Kaydet").isEnabled(), "unrelated pending action does not lock product creation"); });
    runner.ui(() -> { field("Ürün adı").setText("Yerel taslak"); });
    runner.ui(() -> { data.market.productData.enabled = true; });
    runner.ui(() -> { data.market.productData.provider = "open_food_facts"; });
    runner.ui(() -> { render(); });
    runner.ui(() -> { click("Ürün Bilgilerini Ara"); });
    runner.ui(() -> { require(lookupCalls == 1 && lookupScreen.equals("product_create"), "lookup dispatched after rendering product form"); });
    runner.ui(() -> { require(!find(page, "Ürünü Kaydet").isEnabled(), "active lookup blocks product submit"); });
    runner.ui(() -> { workspace.onProductLookupCompleted("another-barcode", result("Başka ürün"), ""); });
    runner.ui(() -> { require(!find(page, "Ürünü Kaydet").isEnabled(), "stale barcode lookup cannot finish active lookup"); });
    runner.ui(() -> { workspace.onProductLookupCompleted("8690000000099", result("Sağlayıcı ürünü"), ""); });
    runner.ui(() -> { require(field("Ürün adı").getText().toString().equals("Yerel taslak") && images(page) == 1, "lookup preserves edited draft and renders real preview"); });
    runner.ui(() -> { accept = false; });
    runner.ui(() -> { click("Ürünü Kaydet"); });
    runner.ui(() -> { require(workspace.screenKey().equals("product_create"), "rejected product submit preserves form"); });
    runner.ui(() -> { accept = true; });
    runner.ui(() -> { click("Ürünü Kaydet"); });
    runner.ui(() -> { require(action.equals(MarketUiRules.ACTION_PRODUCT_CREATE) && payload.optString("name").equals("Yerel taslak") && payload.optString("data_source").equals("open_food_facts") && payload.optString("image_license").equals("CC BY-SA"), "product creation preserves lookup provenance through one submission boundary"); });
    runner.ui(() -> { require(workspace.screenKey().equals("home") && data.market.products.size() == 1, "catalog only changes through future snapshot"); });
    runner.ui(() -> { pending = 0; });
    runner.ui(() -> { render(); });
    runner.ui(() -> { click("Sepet"); });
    runner.ui(() -> { click("Satışı Tamamla"); });
    runner.ui(() -> { measure.accept(page); });
    runner.ui(() -> { click("Satışı Onayla ve Gönder"); });
    // Outbox can change while the confirmation is open: guard must be read at confirmation time.
    runner.ui(() -> { pending = 1; });
    runner.ui(() -> { render(); });
    runner.ui(() -> { priorAction = action; });
    runner.ui(() -> { positive(); });
    runner.ui(() -> { require(action.equals(priorAction) && workspace.screenKey().equals("sale"), "confirmation rechecks live pending state"); });
    runner.ui(() -> { pending = 0; });
    runner.ui(() -> { render(); });
    runner.ui(() -> { ((Spinner) described(page, "Ödeme türü")).setSelection(1); });
    runner.ui(() -> { click("Satışı Onayla ve Gönder"); });
    runner.ui(() -> { require(find(page, "Kart ödemesinin harici POS'ta gerçekleştiğini onaylayın.") != null, "external card confirmation is required"); });
    runner.ui(() -> { click("Kart ödemesi harici POS'ta gerçekleşti; yalnız kaydını gönderiyorum."); });
    runner.ui(() -> { accept = false; });
    runner.ui(() -> { click("Satışı Onayla ve Gönder"); });
    runner.ui(() -> { positive(); });
    runner.ui(() -> { require(workspace.screenKey().equals("sale") && ((CheckBox) find(page, "Kart ödemesi harici POS'ta gerçekleşti; yalnız kaydını gönderiyorum.")).isChecked(), "rejected sale preserves cart/payment form"); });
    runner.ui(() -> { accept = true; });
    runner.ui(() -> { click("Satışı Onayla ve Gönder"); });
    runner.ui(() -> { positive(); });
    runner.ui(() -> { require(action.equals(MarketUiRules.ACTION_SALE) && payload.optString("payment_method").equals("card") && payload.optBoolean("external_payment_confirmed") && workspace.screenKey().equals("home"), "accepted sale clears shared cart and returns home"); });
    runner.ui(() -> { require(product.currentQuantity == 20, "sale never decrements projected inventory"); });
    runner.ui(() -> { click("Veresiye / Cari"); });
    runner.ui(() -> { click("Işıl İzmir"); });
    runner.ui(() -> { field("Tahsilat tutarı").setText("12,50"); });
    runner.ui(() -> { measure.accept(page); });
    runner.ui(() -> { accept = false; });
    runner.ui(() -> { click("Tahsilatı Kaydet"); });
    runner.ui(() -> { positive(); });
    runner.ui(() -> { require(field("Tahsilat tutarı").getText().toString().equals("12,50"), "rejected credit submission retains amount"); });
    runner.ui(() -> { accept = true; });
    runner.ui(() -> { click("Tahsilatı Kaydet"); });
    runner.ui(() -> { positive(); });
    runner.ui(() -> { require(action.equals(MarketUiRules.ACTION_CREDIT_PAYMENT) && payload.optLong("amount_minor") == 1250, "credit uses canonical minor-unit payload"); });
    runner.ui(() -> { require(data.market.customerCreditAccounts.get(0).balances.get(0).amountMinor == 5000, "collection waits for Desktop balance acknowledgement"); });
    runner.ui(() -> { require(workspace.handleBack() && workspace.screenKey().equals("credit"), "credit back first returns to account list"); });
    runner.ui(() -> { data.deviceRole = "staff"; });
    runner.ui(() -> { data.permissions.remove(MarketUiRules.PERMISSION_CREDIT_VIEW); });
    runner.ui(() -> { render(); });
    runner.ui(() -> { require(workspace.screenKey().equals("home") && find(page, "Veresiye / Cari") == null, "withdrawn permission clears credit route"); });
    runner.ui(() -> { measure.accept(page); });
  }

  private void catalogPreviews() {
    int[] requests = {0};
    MarketWorkspace.Listener boundary = new MarketWorkspace.Listener() {
      @Override public boolean onSubmit(String type, JSONObject payload, String accepted, String queued) { throw new AssertionError("catalog projection cannot mutate"); }
      @Override public boolean onBarcodeScan(String code, JSONObject payload) { throw new AssertionError("catalog projection cannot scan"); }
      @Override public void onProductLookupRequested(String provider, String code, boolean images) { throw new AssertionError("catalog projection cannot lookup"); }
      @Override public void onProductImageRequested(String id, String provider, String url) { requests[0]++; }
      @Override public void onRenderRequested() {}
    };
    MarketCatalogBrowser catalog = new MarketCatalogBrowser(context, () -> data, boundary,
        new MarketFormUi(context, () -> {}), purpose -> {}, (item, purpose) -> {});
    OperationData.MarketProduct item = new OperationData.MarketProduct();
    item.id = "preview"; item.dataSource = "open_food_facts"; item.imageSourceUrl = "https://images.openfoodfacts.org/first.jpg";
    LinearLayout card = UiKit.card(context);
    catalog.addProductImage(card, item); catalog.addProductImage(card, item);
    require(requests[0] == 1 && images(card) == 0, "lazy preview requests are deduplicated");
    Bitmap bitmap = Bitmap.createBitmap(4, 4, Bitmap.Config.ARGB_8888);
    catalog.onProductImageLoaded(item.id, item.imageSourceUrl, bitmap); catalog.addProductImage(card, item);
    require(images(card) == 1 && ((ImageView) card.getChildAt(0)).getScaleType() == ImageView.ScaleType.CENTER_INSIDE, "completed preview is reused without cropping");
    item.imageSourceUrl = "https://images.openfoodfacts.org/second.jpg";
    catalog.addProductImage(UiKit.card(context), item); require(requests[0] == 2, "preview cache includes source URL");
    catalog.onProductImageLoaded(item.id, item.imageSourceUrl, null);
    catalog.addProductImage(UiKit.card(context), item); require(requests[0] == 2, "failed preview does not cause request/render loop");
  }
  private int images(View root) {
    int count = root instanceof ImageView ? 1 : 0;
    if (root instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++) count += images(((ViewGroup) root).getChildAt(i));
    return count;
  }
  private void locale() {
    Locale original = Locale.getDefault();
    try {
      Locale.setDefault(Locale.US);
      Configuration config = new Configuration(context.getResources().getConfiguration()); config.setLocale(new Locale("tr", "TR"));
      require(UiKit.eyebrow(context.createConfigurationContext(config), "işlem").getText().toString().equals("İŞLEM"), "eyebrow follows UI locale, not process default");
    } finally { Locale.setDefault(original); }
  }
  private ProductDataLookupClient.Result result(String name) {
    return new ProductDataLookupClient.Result(true, "open_food_facts", "8690000000099", name, "Marka", "330 ml", "", "https://images.openfoodfacts.org/fixture.jpg", "https://world.openfoodfacts.org/product/8690000000099", "ODbL", "CC BY-SA", "2026-10-18T12:00:00Z", Bitmap.createBitmap(4, 4, Bitmap.Config.ARGB_8888));
  }
  private void render() { page = workspace.create(data, pending, false); activity.setContentView(page); }
  private void click(String label) { View button = find(page, label); require(button != null && button.isEnabled(), "enabled action: " + label); button.performClick(); }
  private void chooseProduct() {
    for (View root : roots()) { View choice = prefix(root, "Test Ürün\n"); if (choice != null) { choice.performClick(); return; } }
    throw new AssertionError("product picker choice missing");
  }
  private View prefix(View root, String value) {
    if (root instanceof Button && ((Button) root).getText().toString().startsWith(value)) return root;
    if (root instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++) { View found = prefix(((ViewGroup) root).getChildAt(i), value); if (found != null) return found; }
    return null;
  }
  private void positive() {
    for (View root : roots()) { Button button = root.findViewById(android.R.id.button1); if (button != null) { button.performClick(); return; } }
    throw new AssertionError("confirmation button missing");
  }
  private java.util.List<View> roots() {
    require(Build.VERSION.SDK_INT >= 29, "Market dialog fixture requires API29 WindowInspector; production minSdk is unchanged");
    return WindowInspector.getGlobalWindowViews();
  }
  private EditText field(String label) { return field(page, label); }
  private EditText field(View root, String label) {
    View caption = find(root, label); require(caption != null, "field label: " + label);
    if (caption.getLabelFor() != View.NO_ID) return root.findViewById(caption.getLabelFor());
    ViewGroup parent = (ViewGroup) caption.getParent(); return (EditText) parent.getChildAt(parent.indexOfChild(caption) + 1);
  }
  private void setDialogField(String label, String value) {
    for (View root : roots()) if (find(root, label) != null) { field(root, label).setText(value); return; }
    throw new AssertionError("dialog field: " + label);
  }
  private View described(View root, String label) {
    if (label.contentEquals(root.getContentDescription() == null ? "" : root.getContentDescription())) return root;
    if (root instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++) { View found = described(((ViewGroup) root).getChildAt(i), label); if (found != null) return found; }
    return null;
  }
  private View find(View root, String label) {
    if (root instanceof TextView && label.contentEquals(((TextView) root).getText())) return root;
    if (root instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++) { View found = find(((ViewGroup) root).getChildAt(i), label); if (found != null) return found; }
    return null;
  }
  private void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
  @Override public boolean onSubmit(String type, JSONObject value, String accepted, String queued) {
    action = type; payload = value;
    if (accept) workspace.onSubmissionQueued(type, queued);
    return accept;
  }
  @Override public boolean onBarcodeScan(String barcode, JSONObject value) { throw new AssertionError("cash scanner cannot submit financial action"); }
  @Override public void onProductLookupRequested(String provider, String barcode, boolean images) { lookupCalls++; lookupScreen = workspace.screenKey(); }
  @Override public void onProductImageRequested(String productId, String provider, String imageUrl) { throw new AssertionError("no network in fixture"); }
  @Override public void onRenderRequested() { render(); }
}

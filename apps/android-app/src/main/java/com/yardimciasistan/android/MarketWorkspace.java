package com.yardimciasistan.android;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;

import org.json.JSONException;
import org.json.JSONObject;

import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;

/** Phone-first Market companion surface backed only by projected snapshots/actions. */
final class MarketWorkspace {
  interface Listener {
    boolean onSubmit(
        String actionType,
        JSONObject payload,
        String acceptedMessage,
        String queuedMessage
    );

    boolean onBarcodeScan(String barcode, JSONObject payload);

    void onProductLookupRequested(String provider, String barcode, boolean includeImages);

    void onProductImageRequested(String productId, String provider, String imageUrl);

    void onRenderRequested();
  }

  private interface ProductListener {
    void onProduct(OperationData.MarketProduct product);
  }

  private static final String SCREEN_HOME = "home";
  private static final String SCREEN_BARCODE_RESULT = "barcode_result";
  private static final String SCREEN_STOCK = "stock";
  private static final String SCREEN_RECEIVING = "receiving";
  private static final String SCREEN_CART = "cart";
  private static final String SCREEN_PRODUCT_CREATE = "product_create";
  private static final String SCREEN_CASH_BARCODE = "cash_barcode";

  private static final String PURPOSE_LOOKUP = "lookup";
  private static final String PURPOSE_STOCK = "stock";
  private static final String PURPOSE_RECEIVING = "receiving";
  private static final String PURPOSE_CART = "cart";
  private static final String PURPOSE_PRODUCT_CREATE = "product_create";
  private static final String PURPOSE_CASH = "cash";

  private final Context context;
  private final Listener listener;
  private final ComponentActivity activity;
  private final ActivityResultLauncher<String> cameraPermissionLauncher;
  private final MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft();
  private final MarketUiRules.ReceivingDraft receiving = new MarketUiRules.ReceivingDraft();
  private final MarketUiRules.BarcodeScanCapture barcodeScanCapture =
      new MarketUiRules.BarcodeScanCapture(MarketUiRules.BARCODE_DEBOUNCE_MS);
  private final Map<String, Bitmap> productImagePreviews = new HashMap<>();
  private final Set<String> productImageRequests = new HashSet<>();
  private final Set<String> productImageFailures = new HashSet<>();

  private OperationData data = new OperationData();
  private String screen = SCREEN_HOME;
  private String resultReturnScreen = SCREEN_HOME;
  private String barcodeResult = "";
  private String barcodeResultProductId = "";
  private String stockProductId = "";
  private String stockCountText = "";
  private String stockNote = "";
  private String productCreateBarcode = "";
  private String productCreateName = "";
  private String productCreateBrand = "";
  private String productCreateSku = "";
  private String productCreateUnit = "piece";
  private String productCreatePurchasePrice = "";
  private String productCreateSalePrice = "";
  private String productCreateCategory = "";
  private String productCreateNote = "";
  private String productCreateImageUrl = "";
  private String productCreateDataSource = "";
  private String productCreateSourceProductUrl = "";
  private String productCreateDataLicense = "";
  private String productCreateImageLicense = "";
  private String productCreateSourceFetchedAt = "";
  private boolean productLookupLoading;
  private String productLookupMessage = "";
  private Bitmap productCreateImagePreview;
  private String visibleMessage = "";
  private boolean visibleMessagePending;
  private String formError = "";
  private int localPendingCount;
  private boolean loading;
  private String cashBarcodeLast = "";
  private String cashBarcodeStatus = "Kamera hazır";
  private TextView cashBarcodeLastView;
  private TextView cashBarcodeStatusView;
  private String pendingCameraPurpose = "";
  private boolean pendingCameraContinuous;
  private boolean cameraPermissionRequestInFlight;

  MarketWorkspace(Context context, Listener listener) {
    this.context = context;
    this.listener = listener;
    this.activity = context instanceof ComponentActivity ? (ComponentActivity) context : null;
    this.cameraPermissionLauncher = activity == null
        ? null
        : activity.registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            granted -> {
              cameraPermissionRequestInFlight = false;
              String purpose = pendingCameraPurpose;
              boolean continuous = pendingCameraContinuous;
              pendingCameraPurpose = "";
              pendingCameraContinuous = false;
              if (Boolean.TRUE.equals(granted)) {
                launchCameraScanner(purpose, continuous);
              } else {
                Toast.makeText(
                    context,
                    "Kamera izni verilmedi. Barkodu elle girebilirsiniz.",
                    Toast.LENGTH_SHORT
                ).show();
                showManualBarcodeEntry(purpose);
              }
            }
        );
  }

  ScrollView create(OperationData nextData, int nextLocalPendingCount, boolean nextLoading) {
    data = nextData == null ? new OperationData() : nextData;
    localPendingCount = Math.max(0, nextLocalPendingCount);
    loading = nextLoading;
    enforceVisibleScreen();

    LinearLayout page;
    if (SCREEN_STOCK.equals(screen)) {
      page = stockScreen();
    } else if (SCREEN_RECEIVING.equals(screen)) {
      page = receivingScreen();
    } else if (SCREEN_CART.equals(screen)) {
      page = cartScreen();
    } else if (SCREEN_PRODUCT_CREATE.equals(screen)) {
      page = productCreateScreen();
    } else if (SCREEN_BARCODE_RESULT.equals(screen)) {
      page = barcodeResultScreen();
    } else if (SCREEN_CASH_BARCODE.equals(screen)) {
      page = cashBarcodeScreen();
    } else {
      page = homeScreen();
    }
    return UiKit.scroll(context, page);
  }

  boolean handleBack() {
    if (SCREEN_HOME.equals(screen)) return false;
    if (SCREEN_BARCODE_RESULT.equals(screen)) {
      screen = resultReturnScreen;
    } else {
      screen = SCREEN_HOME;
    }
    formError = "";
    listener.onRenderRequested();
    return true;
  }

  String screenKey() {
    return screen;
  }

  void onSubmissionAccepted(String actionType, String message) {
    if (!isMarketAction(actionType)) return;
    visibleMessage = message;
    visibleMessagePending = false;
  }

  void onSubmissionQueued(String actionType, String message) {
    if (!isMarketAction(actionType)) return;
    visibleMessage = message;
    visibleMessagePending = true;
  }

  void onBarcodeScanAccepted(String barcode, String message) {
    if (!barcode.equals(cashBarcodeLast)) return;
    cashBarcodeStatus = message;
    updateCashBarcodeViews();
  }

  void onBarcodeScanQueued(String barcode, String message) {
    if (!barcode.equals(cashBarcodeLast)) return;
    cashBarcodeStatus = message;
    updateCashBarcodeViews();
  }

  void onProductLookupCompleted(
      String barcode,
      ProductDataLookupClient.Result result,
      String errorMessage
  ) {
    if (!barcode.equals(productCreateBarcode)) return;
    productLookupLoading = false;
    if (result == null) {
      productLookupMessage = errorMessage == null || errorMessage.trim().isEmpty()
          ? "Ürün bilgileri alınamadı."
          : errorMessage.trim();
      listener.onRenderRequested();
      return;
    }
    if (!result.found) {
      productLookupMessage = "Bu barkod ürün veri kaynağında bulunamadı.";
      listener.onRenderRequested();
      return;
    }

    if (productCreateName.trim().isEmpty()) productCreateName = result.name;
    if (productCreateBrand.trim().isEmpty()) productCreateBrand = result.brand;
    if (productCreateNote.trim().isEmpty() && !result.quantity.isEmpty()) {
      productCreateNote = "Ambalaj: " + result.quantity;
    }
    productCreateImageUrl = result.imageUrl;
    productCreateDataSource = result.provider;
    productCreateSourceProductUrl = result.sourceProductUrl;
    productCreateDataLicense = result.dataLicense;
    productCreateImageLicense = result.imageLicense;
    productCreateSourceFetchedAt = result.fetchedAt;
    productCreateImagePreview = result.imagePreview;
    productLookupMessage = result.name + " bilgileri bulundu.";
    listener.onRenderRequested();
  }

  void onProductImageLoaded(String productId, String imageUrl, Bitmap preview) {
    String key = productImageKey(productId, imageUrl);
    productImageRequests.remove(key);
    if (preview == null) {
      productImageFailures.add(key);
    } else {
      productImageFailures.remove(key);
      productImagePreviews.put(key, preview);
    }
    listener.onRenderRequested();
  }


  private void enforceVisibleScreen() {
    if (!MarketUiRules.canOpenMarket(data)) {
      screen = SCREEN_HOME;
      return;
    }
    if (SCREEN_STOCK.equals(screen) && !MarketUiRules.canStockCount(data)) screen = SCREEN_HOME;
    if (SCREEN_RECEIVING.equals(screen) && !MarketUiRules.canReceive(data)) screen = SCREEN_HOME;
    if (SCREEN_CART.equals(screen) && !MarketUiRules.canCreateCartDraft(data)) screen = SCREEN_HOME;
    if (SCREEN_PRODUCT_CREATE.equals(screen) && !MarketUiRules.canCreateProduct(data)) screen = SCREEN_HOME;
    if (SCREEN_BARCODE_RESULT.equals(screen) && !MarketUiRules.canViewProducts(data)) screen = SCREEN_HOME;
    if (SCREEN_CASH_BARCODE.equals(screen) && !MarketUiRules.canScanToDesktop(data)) screen = SCREEN_HOME;
  }

  private LinearLayout homeScreen() {
    LinearLayout page = UiKit.column(context);
    page.addView(UiKit.eyebrow(context, "MARKET"));
    TextView title = UiKit.title(context, "Saha işlemleri");
    LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(-1, -2);
    titleParams.setMargins(0, dp(3), 0, dp(12));
    title.setLayoutParams(titleParams);
    page.addView(title);

    addPendingState(page);

    if (MarketUiRules.canScanToDesktop(data)) {
      Button cashBarcode = UiKit.button(context, "▣  Kasa Barkod Modu", UiKit.PRIMARY,
          view -> openCashBarcodeMode());
      cashBarcode.setContentDescription("Telefonu masaüstü kasası için sürekli barkod okuyucu olarak kullan");
      cashBarcode.setLayoutParams(fullButtonParams(58, 0, 12));
      page.addView(cashBarcode);
    }

    if (MarketUiRules.canScanBarcode(data)) {
      Button barcode = UiKit.button(context, "▣  Barkod Tara", UiKit.PRIMARY,
          view -> showBarcodeEntry(PURPOSE_LOOKUP));
      barcode.setContentDescription("Barkod tara veya barkod okuyucudan gir");
      barcode.setLayoutParams(fullButtonParams(58, 0, 12));
      page.addView(barcode);
    }

    ArrayList<ActionItem> actions = new ArrayList<>();
    if (MarketUiRules.canStockCount(data)) {
      actions.add(new ActionItem("Stok Say", () -> openScreen(SCREEN_STOCK)));
    }
    if (MarketUiRules.canReceive(data)) {
      actions.add(new ActionItem("Mal Kabul", () -> openScreen(SCREEN_RECEIVING)));
    }
    if (MarketUiRules.canCreateCartDraft(data)) {
      actions.add(new ActionItem("Sepet", () -> openScreen(SCREEN_CART)));
    }
    if (MarketUiRules.canCreateProduct(data)) {
      actions.add(new ActionItem("Yeni Ürün", () -> showBarcodeEntry(PURPOSE_PRODUCT_CREATE)));
    }
    addActionGrid(page, actions);

    if (MarketUiRules.canViewProducts(data)) {
      Button search = UiKit.outlineButton(context, "Ürün Ara", view -> showProductPicker(PURPOSE_LOOKUP, false));
      search.setLayoutParams(fullButtonParams(48, actions.isEmpty() ? 0 : 2, 10));
      page.addView(search);
    }

    if (MarketUiRules.canViewSummary(data)) {
      addMarketSummary(page);
    }
    return page;
  }

  private void addActionGrid(LinearLayout page, List<ActionItem> actions) {
    for (int index = 0; index < actions.size(); index += 2) {
      LinearLayout row = UiKit.row(context);
      LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(-1, -2);
      rowParams.setMargins(0, 0, 0, dp(8));
      row.setLayoutParams(rowParams);
      addGridAction(row, actions.get(index));
      if (index + 1 < actions.size()) {
        addGridAction(row, actions.get(index + 1));
      } else {
        View spacer = new View(context);
        LinearLayout.LayoutParams spacerParams = new LinearLayout.LayoutParams(0, dp(52), 1f);
        spacerParams.setMargins(dp(7), 0, 0, 0);
        spacer.setLayoutParams(spacerParams);
        row.addView(spacer);
      }
      page.addView(row);
    }
  }

  private void addGridAction(LinearLayout row, ActionItem action) {
    Button button = UiKit.outlineButton(context, action.label, view -> action.action.run());
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(52), 1f);
    if (row.getChildCount() > 0) params.setMargins(dp(7), 0, 0, 0);
    button.setLayoutParams(params);
    row.addView(button);
  }

  private void addPendingState(LinearLayout page) {
    String outboxState = MarketUiRules.pendingStatus(localPendingCount, data.pendingActions);
    if (!outboxState.isEmpty()) {
      page.addView(messageCard(outboxState, true));
    }
    if (!visibleMessage.isEmpty() && !visibleMessage.equals(outboxState)) {
      page.addView(messageCard(visibleMessage, visibleMessagePending));
    }
  }

  private void addMarketSummary(LinearLayout page) {
    page.addView(UiKit.sectionTitle(context, "Bugün"));
    OperationData.MarketSummary summary = data.market.summary;
    LinearLayout metrics = UiKit.card(context);
    int metricsShown = 0;
    if (data.hasBusinessCapability(MarketUiRules.CAPABILITY_SALES)) {
      addMetric(metrics, metricsShown++, "Satış", summary.todaySaleCount + " · " + money(summary.todaySalesTotal, summary.currency), UiKit.SUCCESS);
    }
    if (data.hasBusinessCapability(MarketUiRules.CAPABILITY_INVENTORY)) {
      addMetric(metrics, metricsShown++, "Kritik stok", String.valueOf(summary.criticalStockCount),
          summary.criticalStockCount > 0 ? UiKit.WARNING : UiKit.SUCCESS);
    }
    if (data.hasBusinessCapability(MarketUiRules.CAPABILITY_PURCHASING)) {
      addMetric(metrics, metricsShown++, "Mal kabul", String.valueOf(summary.recentReceivingCount), UiKit.INFO);
    }
    if (metricsShown > 0) page.addView(metrics);

    if (data.hasBusinessCapability(MarketUiRules.CAPABILITY_INVENTORY)
        && !summary.recentStockAdjustments.isEmpty()) {
      page.addView(UiKit.sectionTitle(context, "Son stok hareketleri"));
      int shown = 0;
      for (OperationData.MarketStockAdjustment adjustment : summary.recentStockAdjustments) {
        if (shown >= 8) break;
        LinearLayout card = UiKit.card(context);
        card.addView(UiKit.text(context, adjustment.productName, 14, UiKit.TEXT, Typeface.BOLD));
        card.addView(UiKit.text(
            context,
            "Gerçek stok: " + quantity(adjustment.quantityAfter) + " · " + shortTime(adjustment.createdAt),
            12,
            UiKit.SECONDARY,
            Typeface.NORMAL
        ));
        if (!adjustment.note.isEmpty()) {
          card.addView(UiKit.text(context, adjustment.note, 11, UiKit.MUTED, Typeface.NORMAL));
        }
        page.addView(card);
        shown += 1;
      }
    }

    if (data.hasBusinessCapability(MarketUiRules.CAPABILITY_PURCHASING)
        && !data.market.recentPurchases.isEmpty()) {
      page.addView(UiKit.sectionTitle(context, "Son mal kabuller"));
      int shown = 0;
      for (OperationData.MarketPurchase purchase : data.market.recentPurchases) {
        if (shown >= 6) break;
        LinearLayout card = UiKit.card(context);
        card.addView(UiKit.text(
            context,
            purchase.supplierName.isEmpty() ? "Mal kabul" : purchase.supplierName,
            14,
            UiKit.TEXT,
            Typeface.BOLD
        ));
        card.addView(UiKit.text(
            context,
            purchase.lineCount + " satır · " + money(purchase.total, purchase.currency)
                + " · " + shortTime(purchase.receivedAt),
            12,
            UiKit.SECONDARY,
            Typeface.NORMAL
        ));
        page.addView(card);
        shown += 1;
      }
    }
  }

  private void addMetric(LinearLayout card, int index, String label, String value, int tone) {
    if (index > 0) card.addView(UiKit.divider(context));
    LinearLayout row = UiKit.row(context);
    TextView labelView = UiKit.text(context, label, 13, UiKit.SECONDARY, Typeface.NORMAL);
    labelView.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    row.addView(labelView);
    row.addView(UiKit.text(context, value, 14, tone, Typeface.BOLD));
    card.addView(row);
  }

  private LinearLayout cashBarcodeScreen() {
    LinearLayout page = UiKit.column(context);
    page.addView(UiKit.eyebrow(context, "KASA BARKOD MODU"));
    TextView title = UiKit.title(context, "Telefon barkod okuyucu");
    LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(-1, -2);
    titleParams.setMargins(0, dp(3), 0, dp(5));
    title.setLayoutParams(titleParams);
    page.addView(title);
    TextView description = UiKit.text(
        context,
        "Kamera barkodu gördüğünde tarama otomatik olarak masaüstü Hızlı Satış ekranına gönderilir.",
        13,
        UiKit.SECONDARY,
        Typeface.NORMAL
    );
    LinearLayout.LayoutParams descriptionParams = new LinearLayout.LayoutParams(-1, -2);
    descriptionParams.setMargins(0, 0, 0, dp(12));
    description.setLayoutParams(descriptionParams);
    page.addView(description);

    LinearLayout statusCard = UiKit.card(context);
    statusCard.addView(UiKit.text(context, "Son taranan", 11, UiKit.MUTED, Typeface.BOLD));
    cashBarcodeLastView = UiKit.text(
        context,
        cashBarcodeLast.isEmpty() ? "Henüz barkod okutulmadı" : cashBarcodeLast,
        19,
        UiKit.TEXT,
        Typeface.BOLD
    );
    statusCard.addView(cashBarcodeLastView);
    cashBarcodeStatusView = UiKit.text(context, cashBarcodeStatus, 13, UiKit.SUCCESS, Typeface.BOLD);
    statusCard.addView(cashBarcodeStatusView);
    page.addView(statusCard);

    Button camera = UiKit.button(context, "Kamerayı Aç", UiKit.PRIMARY,
        view -> requestCameraScanner(PURPOSE_CASH, true));
    camera.setLayoutParams(fullButtonParams(52, 12, 8));
    page.addView(camera);

    Button manual = UiKit.outlineButton(context, "Barkodu Elle Gir",
        view -> showManualBarcodeEntry(PURPOSE_CASH));
    manual.setLayoutParams(fullButtonParams(48, 0, 12));
    page.addView(manual);

    TextView transport = UiKit.text(
        context,
        "Tarama otomatik gönderilir; ürün ve ödeme masaüstünde çözülür. Aynı barkod kamerada tutulduğunda tekrar eklenmez; yeniden okutmak için barkodu kadrajdan çıkarıp tekrar gösterin.",
        11,
        UiKit.MUTED,
        Typeface.NORMAL
    );
    LinearLayout.LayoutParams transportParams = new LinearLayout.LayoutParams(-1, -2);
    transportParams.setMargins(0, 0, 0, dp(14));
    transport.setLayoutParams(transportParams);
    page.addView(transport);

    Button close = UiKit.outlineButton(context, "Modu Kapat", view -> {
      screen = SCREEN_HOME;
      formError = "";
      listener.onRenderRequested();
    });
    close.setLayoutParams(fullButtonParams(50, 0, 0));
    page.addView(close);
    return page;
  }

  private void openCashBarcodeMode() {
    screen = SCREEN_CASH_BARCODE;
    formError = "";
    listener.onRenderRequested();
    requestCameraScanner(PURPOSE_CASH, true);
  }

  private void captureCashBarcode(String rawBarcode) {
    String barcode = MarketUiRules.normalizeBarcodeIdentity(rawBarcode);
    try {
      JSONObject payload = barcodeScanCapture.capture(
          barcode,
          System.currentTimeMillis(),
          isoTimestamp()
      );
      if (payload == null) {
        cashBarcodeStatus = "Aynı barkod kısa süre önce okundu.";
        updateCashBarcodeViews();
        return;
      }
      cashBarcodeLast = payload.optString("barcode", barcode);
      cashBarcodeStatus = "Gönderiliyor";
      updateCashBarcodeViews();
      boolean persisted = listener.onBarcodeScan(cashBarcodeLast, payload);
      if (!persisted) {
        cashBarcodeStatus = "Gönderilemedi";
        updateCashBarcodeViews();
      }
    } catch (MarketUiRules.ValidationException error) {
      cashBarcodeStatus = error.getMessage();
      updateCashBarcodeViews();
    }
  }

  private void updateCashBarcodeViews() {
    if (cashBarcodeLastView != null) {
      cashBarcodeLastView.setText(cashBarcodeLast.isEmpty() ? "Henüz barkod okutulmadı" : cashBarcodeLast);
    }
    if (cashBarcodeStatusView != null) cashBarcodeStatusView.setText(cashBarcodeStatus);
  }

  private String isoTimestamp() {
    SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
    format.setTimeZone(TimeZone.getTimeZone("UTC"));
    return format.format(new Date());
  }

  private LinearLayout barcodeResultScreen() {
    LinearLayout page = UiKit.column(context);
    addBackHeader(page, "Barkod sonucu", barcodeResult);
    addPendingState(page);
    OperationData.MarketProduct product = MarketUiRules.productById(data, barcodeResultProductId);
    if (product == null) {
      LinearLayout unknown = UiKit.card(context);
      unknown.addView(UiKit.text(context, "Barkod kayıtlı değil.", 18, UiKit.TEXT, Typeface.BOLD));
      unknown.addView(UiKit.text(context, "Barkod: " + barcodeResult, 13, UiKit.SECONDARY, Typeface.NORMAL));
      if (MarketUiRules.canCreateProduct(data)) {
        Button draft = UiKit.button(context, "Yeni Ürün", UiKit.PRIMARY, view -> startProductCreate(barcodeResult));
        draft.setLayoutParams(fullButtonParams(48, 12, 0));
        unknown.addView(draft);
      }
      page.addView(unknown);
      if (MarketUiRules.canScanBarcode(data)) {
        Button retry = UiKit.outlineButton(context, "Başka Barkod Tara", view -> showBarcodeEntry(PURPOSE_LOOKUP));
        retry.setLayoutParams(fullButtonParams(48, 2, 0));
        page.addView(retry);
      }
      return page;
    }

    page.addView(productCard(product, true));
    return page;
  }

  private LinearLayout productCard(OperationData.MarketProduct product, boolean withActions) {
    LinearLayout card = UiKit.card(context);
    addProductImage(card, product);
    card.addView(UiKit.text(context, product.name, 18, UiKit.TEXT, Typeface.BOLD));
    if (!product.barcode.isEmpty()) {
      card.addView(UiKit.text(context, "Barkod: " + product.barcode, 12, UiKit.SECONDARY, Typeface.NORMAL));
    }
    if (data.hasBusinessCapability(MarketUiRules.CAPABILITY_INVENTORY) && product.trackInventory) {
      card.addView(UiKit.text(
          context,
          "Stok: " + quantity(product.currentQuantity) + " " + unitLabel(product.unit),
          14,
          UiKit.WARNING,
          Typeface.BOLD
      ));
    }
    card.addView(UiKit.text(
        context,
        "Fiyat: " + money(product.salePrice, product.currency),
        14,
        UiKit.SUCCESS,
        Typeface.BOLD
    ));
    if (!withActions) return card;

    ArrayList<ActionItem> actions = new ArrayList<>();
    if (MarketUiRules.canCreateCartDraft(data)) {
      actions.add(new ActionItem("Sepete Ekle", () -> addProductToCart(product)));
    }
    if (MarketUiRules.canStockCount(data) && product.trackInventory) {
      actions.add(new ActionItem("Stok Say", () -> {
        stockProductId = product.id;
        openScreen(SCREEN_STOCK);
      }));
    }
    if (MarketUiRules.canReceive(data) && product.trackInventory) {
      actions.add(new ActionItem("Mal Kabule Ekle", () -> showReceivingLineDialog(product)));
    }
    for (ActionItem action : actions) {
      Button button = UiKit.outlineButton(context, action.label, view -> action.action.run());
      button.setLayoutParams(fullButtonParams(48, 10, 0));
      card.addView(button);
    }
    return card;
  }

  private LinearLayout stockScreen() {
    LinearLayout page = UiKit.column(context);
    addBackHeader(page, "Stok Say", "Fiziksel miktarı olduğu gibi kaydedin");
    addPendingState(page);
    addFormError(page);
    addProductSelectionActions(page, PURPOSE_STOCK, true);

    OperationData.MarketProduct product = MarketUiRules.productById(data, stockProductId);
    if (product == null || !product.trackInventory) {
      page.addView(emptyCard("Ürün seçilmedi", "Barkod okutun veya stok takibine açık bir ürün seçin."));
      return page;
    }

    LinearLayout productInfo = UiKit.card(context);
    addProductImage(productInfo, product);
    productInfo.addView(UiKit.text(context, product.name, 17, UiKit.TEXT, Typeface.BOLD));
    productInfo.addView(UiKit.text(
        context,
        "Sistem miktarı: " + quantity(product.currentQuantity) + " " + unitLabel(product.unit),
        13,
        UiKit.SECONDARY,
        Typeface.NORMAL
    ));
    productInfo.addView(UiKit.text(
        context,
        "Gönderimden sonra bu değer tahmini olarak değiştirilmez; yeni snapshot beklenir.",
        11,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    page.addView(productInfo);

    EditText counted = labeledInput(page, "Fiziksel miktar", "0");
    counted.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    bind(counted, stockCountText, value -> stockCountText = value);
    EditText note = labeledMultiline(page, "Not (isteğe bağlı)", "Raf / sayım notu");
    bind(note, stockNote, value -> stockNote = value);

    Button save = UiKit.button(context, "Sayımı Kaydet", UiKit.PRIMARY, view -> submitStockCount(product));
    save.setEnabled(!submissionBlocked());
    save.setLayoutParams(fullButtonParams(52, 4, 0));
    page.addView(save);
    return page;
  }

  private void submitStockCount(OperationData.MarketProduct product) {
    try {
      JSONObject payload = MarketUiRules.stockCountPayload(product, stockCountText, stockNote);
      boolean queued = listener.onSubmit(
          MarketUiRules.ACTION_STOCK_COUNT,
          payload,
          "Sayım masaüstüne gönderildi. Gerçek stok yeni snapshot ile gösterilecek.",
          "Sayım gönderim kuyruğuna alındı. Gerçek stok yeni snapshot ile gösterilecek."
      );
      if (queued) {
        stockCountText = "";
        stockNote = "";
        formError = "";
        visibleMessage = "Sayım gönderim kuyruğuna alındı. Gerçek stok yeni snapshot ile gösterilecek.";
        visibleMessagePending = true;
        listener.onRenderRequested();
      }
    } catch (MarketUiRules.ValidationException error) {
      showFormError(error.getMessage());
    }
  }

  private LinearLayout receivingScreen() {
    LinearLayout page = UiKit.column(context);
    addBackHeader(page, "Mal Kabul", "Birden çok ürün satırı hazırlayın");
    addPendingState(page);
    addFormError(page);

    addSupplierPicker(page);
    addProductSelectionActions(page, PURPOSE_RECEIVING, true);

    page.addView(UiKit.sectionTitle(context, "Ürün satırları"));
    if (receiving.size() == 0) {
      page.addView(emptyCard("Henüz ürün yok", "Barkod okutun veya listeden ürün ekleyin."));
    } else {
      for (MarketUiRules.ReceivingLine line : receiving.lines()) {
        page.addView(receivingLineCard(line));
      }
    }

    LinearLayout totals = UiKit.card(context);
    addMetric(totals, 0, "Toplam satır", String.valueOf(receiving.size()), UiKit.INFO);
    addMetric(totals, 1, "Tahmini maliyet", money(receiving.total(), receivingCurrency()), UiKit.SUCCESS);
    page.addView(totals);

    EditText note = labeledMultiline(page, "Not (isteğe bağlı)", "Mal kabul notu");
    bind(note, receiving.note, value -> receiving.note = value);

    Button submit = UiKit.button(context, "Mal Kabulü Gönder", UiKit.PRIMARY, view -> confirmReceiving());
    submit.setEnabled(receiving.size() > 0 && !submissionBlocked());
    submit.setLayoutParams(fullButtonParams(52, 4, 0));
    page.addView(submit);
    return page;
  }

  private void addSupplierPicker(LinearLayout page) {
    if (data.market.suppliers.isEmpty()) return;
    ArrayList<SupplierChoice> choices = new ArrayList<>();
    choices.add(new SupplierChoice("", "Tedarikçi seçilmedi"));
    int selected = 0;
    for (OperationData.MarketSupplier supplier : data.market.suppliers) {
      if (!supplier.active) continue;
      choices.add(new SupplierChoice(supplier.id, supplier.name));
      if (supplier.id.equals(receiving.supplierId)) selected = choices.size() - 1;
    }
    if (choices.size() <= 1) return;
    addFieldLabel(page, "Tedarikçi (isteğe bağlı)");
    Spinner spinner = new Spinner(context);
    ArrayAdapter<SupplierChoice> adapter = new ArrayAdapter<>(context, android.R.layout.simple_spinner_item, choices);
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    spinner.setAdapter(adapter);
    spinner.setSelection(selected);
    spinner.setBackground(UiKit.rounded(context, UiKit.SURFACE, UiKit.BORDER, 11));
    spinner.setLayoutParams(fieldParams(50));
    spinner.setOnItemSelectedListener(new SimpleItemSelectedListener(position -> {
      SupplierChoice choice = (SupplierChoice) spinner.getSelectedItem();
      receiving.supplierId = choice == null ? "" : choice.id;
    }));
    page.addView(spinner);
  }

  private LinearLayout receivingLineCard(MarketUiRules.ReceivingLine line) {
    LinearLayout card = UiKit.card(context);
    card.addView(UiKit.text(context, line.productName, 15, UiKit.TEXT, Typeface.BOLD));
    card.addView(UiKit.text(
        context,
        quantity(line.quantity) + " × " + money(line.unitCost, line.currency)
            + " = " + money(line.quantity * line.unitCost, line.currency),
        12,
        UiKit.SECONDARY,
        Typeface.NORMAL
    ));
    LinearLayout actions = UiKit.row(context);
    LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(-1, -2);
    actionParams.setMargins(0, dp(9), 0, 0);
    actions.setLayoutParams(actionParams);
    OperationData.MarketProduct product = MarketUiRules.productById(data, line.productId);
    Button edit = UiKit.outlineButton(context, "Düzenle", view -> {
      if (product != null) showReceivingLineDialog(product);
    });
    edit.setEnabled(product != null);
    UiKit.addAction(actions, edit, context);
    UiKit.addAction(actions, UiKit.dangerButton(context, "Kaldır", view -> {
      receiving.remove(line.productId);
      listener.onRenderRequested();
    }), context);
    card.addView(actions);
    return card;
  }

  private void showReceivingLineDialog(OperationData.MarketProduct product) {
    if (product == null || !product.trackInventory || !MarketUiRules.canReceive(data)) return;
    MarketUiRules.ReceivingLine existing = receiving.line(product.id);
    LinearLayout form = dialogForm();
    form.addView(UiKit.text(context, product.name, 16, UiKit.TEXT, Typeface.BOLD));
    EditText quantity = labeledInput(form, "Miktar", "1");
    quantity.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    quantity.setText(existing == null ? "1" : quantity(existing.quantity));
    EditText unitCost = labeledInput(form, "Birim alış fiyatı", "0,00");
    unitCost.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    unitCost.setText(existing == null ? "" : quantity(existing.unitCost));
    TextView status = statusText();
    form.addView(status);

    AlertDialog dialog = new AlertDialog.Builder(context)
        .setTitle(existing == null ? "Mal kabule ekle" : "Satırı düzenle")
        .setView(wrapDialog(form))
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton(existing == null ? "Satır Ekle" : "Kaydet", null)
        .create();
    dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
      try {
        receiving.putProduct(product, value(quantity), value(unitCost));
        formError = "";
        screen = SCREEN_RECEIVING;
        dialog.dismiss();
        listener.onRenderRequested();
      } catch (MarketUiRules.ValidationException error) {
        status.setText(error.getMessage());
      }
    }));
    dialog.show();
  }

  private void confirmReceiving() {
    final JSONObject payload;
    try {
      payload = receiving.toPayload();
    } catch (MarketUiRules.ValidationException error) {
      showFormError(error.getMessage());
      return;
    }
    String supplier = supplierName(receiving.supplierId);
    String message = receiving.size() + " ürün satırı\n"
        + "Tahmini maliyet: " + money(receiving.total(), receivingCurrency())
        + (supplier.isEmpty() ? "" : "\nTedarikçi: " + supplier);
    new AlertDialog.Builder(context)
        .setTitle("Mal kabulünü gönder")
        .setMessage(message)
        .setNegativeButton("Geri Dön", null)
        .setPositiveButton("Gönder", (dialog, which) -> {
          boolean queued = listener.onSubmit(
              MarketUiRules.ACTION_PURCHASE_RECEIVE,
              payload,
              "Mal kabulü masaüstüne gönderildi.",
              "Mal kabulü gönderim kuyruğuna alındı."
          );
          if (queued) {
            receiving.clear();
            formError = "";
            visibleMessage = "Mal kabulü gönderim kuyruğuna alındı.";
            visibleMessagePending = true;
            listener.onRenderRequested();
          }
        })
        .show();
  }

  private LinearLayout cartScreen() {
    LinearLayout page = UiKit.column(context);
    addBackHeader(page, "Sepet", "Satış değil; masaüstü için taslak hazırlayın");
    addPendingState(page);
    addFormError(page);
    addProductSelectionActions(page, PURPOSE_CART, false);

    page.addView(UiKit.sectionTitle(context, "Sepet satırları"));
    if (cart.size() == 0) {
      page.addView(emptyCard("Sepet boş", "Barkod okutun veya ürün seçin. Her okutma miktarı 1 artırır."));
    } else {
      for (MarketUiRules.CartLine line : cart.lines()) {
        page.addView(cartLineCard(line));
      }
    }

    LinearLayout total = UiKit.card(context);
    addMetric(total, 0, "Toplam ürün", String.valueOf(cart.size()), UiKit.INFO);
    addMetric(total, 1, "Tahmini toplam", money(cart.estimatedTotal(), cartCurrency()), UiKit.SUCCESS);
    page.addView(total);

    EditText note = labeledMultiline(page, "Not (isteğe bağlı)", "Masaüstü için sepet notu");
    bind(note, cart.note, value -> cart.note = value);

    Button send = UiKit.button(context, "Masaüstüne Gönder", UiKit.PRIMARY, view -> submitCart());
    send.setEnabled(cart.size() > 0 && !submissionBlocked());
    send.setLayoutParams(fullButtonParams(54, 4, 0));
    page.addView(send);
    return page;
  }

  private LinearLayout cartLineCard(MarketUiRules.CartLine line) {
    LinearLayout card = UiKit.card(context);
    LinearLayout header = UiKit.row(context);
    TextView name = UiKit.text(context, line.productName, 15, UiKit.TEXT, Typeface.BOLD);
    name.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    header.addView(name);
    header.addView(UiKit.text(
        context,
        money(line.quantity * line.unitPrice, line.currency),
        13,
        UiKit.SUCCESS,
        Typeface.BOLD
    ));
    card.addView(header);
    card.addView(UiKit.text(context, money(line.unitPrice, line.currency) + " / " + unitLabel(line.unit), 11, UiKit.MUTED, Typeface.NORMAL));

    LinearLayout controls = UiKit.row(context);
    LinearLayout.LayoutParams controlsParams = new LinearLayout.LayoutParams(-1, -2);
    controlsParams.setMargins(0, dp(9), 0, 0);
    controls.setLayoutParams(controlsParams);
    Button minus = UiKit.outlineButton(context, "−", view -> {
      cart.changeQuantity(line.productId, -1);
      listener.onRenderRequested();
    });
    minus.setContentDescription(line.productName + " miktarını azalt");
    UiKit.addAction(controls, minus, context);
    TextView amount = UiKit.text(context, quantity(line.quantity), 16, UiKit.TEXT, Typeface.BOLD);
    amount.setGravity(Gravity.CENTER);
    amount.setLayoutParams(new LinearLayout.LayoutParams(0, dp(44), 1f));
    controls.addView(amount);
    Button plus = UiKit.outlineButton(context, "+", view -> {
      cart.changeQuantity(line.productId, 1);
      listener.onRenderRequested();
    });
    plus.setContentDescription(line.productName + " miktarını artır");
    UiKit.addAction(controls, plus, context);
    Button remove = UiKit.dangerButton(context, "Sil", view -> {
      cart.remove(line.productId);
      listener.onRenderRequested();
    });
    UiKit.addAction(controls, remove, context);
    card.addView(controls);
    return card;
  }

  private void addProductToCart(OperationData.MarketProduct product) {
    try {
      cart.addProduct(product);
      screen = SCREEN_CART;
      formError = "";
      visibleMessage = product.name + " sepete eklendi.";
      visibleMessagePending = false;
      listener.onRenderRequested();
    } catch (MarketUiRules.ValidationException error) {
      showFormError(error.getMessage());
    }
  }

  private void submitCart() {
    try {
      JSONObject payload = cart.toPayload();
      boolean queued = listener.onSubmit(
          MarketUiRules.ACTION_CART_DRAFT_CREATE,
          payload,
          "Sepet masaüstü için hazırlandı.",
          "Sepet gönderim kuyruğuna alındı."
      );
      if (queued) {
        cart.clear();
        formError = "";
        visibleMessage = "Sepet gönderim kuyruğuna alındı.";
        visibleMessagePending = true;
        listener.onRenderRequested();
      }
    } catch (MarketUiRules.ValidationException error) {
      showFormError(error.getMessage());
    }
  }

  private LinearLayout productCreateScreen() {
    LinearLayout page = UiKit.column(context);
    addBackHeader(page, "Yeni Ürün", "Ürün bilgileri doğrudan kataloğa kaydedilir.");
    addPendingState(page);
    addFormError(page);

    EditText barcode = labeledInput(page, "Barkod", "");
    barcode.setText(productCreateBarcode);
    barcode.setEnabled(false);

    if (MarketUiRules.canLookupProductData(data)) {
      Button lookup = UiKit.outlineButton(
          context,
          productLookupLoading ? "Ürün Bilgileri Aranıyor…" : "Ürün Bilgilerini Ara",
          view -> requestProductLookup()
      );
      lookup.setEnabled(!productLookupLoading);
      lookup.setLayoutParams(fullButtonParams(48, 0, 8));
      page.addView(lookup);
      if (!productLookupMessage.isEmpty()) {
        page.addView(UiKit.text(
            context,
            productLookupMessage,
            12,
            productLookupMessage.contains("bulunamadı") || productLookupMessage.contains("alınamadı")
                ? UiKit.WARNING
                : UiKit.SUCCESS,
            Typeface.NORMAL
        ));
      }
    }

    if (productCreateImagePreview != null) {
      ImageView preview = productImageView(productCreateImagePreview, 180);
      LinearLayout.LayoutParams previewParams = new LinearLayout.LayoutParams(-1, dp(180));
      previewParams.setMargins(0, dp(4), 0, dp(10));
      preview.setLayoutParams(previewParams);
      page.addView(preview);
    }

    CatalogProductCreateFields.name(page, productCreateName, value -> productCreateName = value);
    EditText brand = labeledInput(page, "Marka (isteğe bağlı)", "");
    bind(brand, productCreateBrand, value -> productCreateBrand = value);
    EditText sku = labeledInput(page, "SKU (isteğe bağlı)", "");
    bind(sku, productCreateSku, value -> productCreateSku = value);

    CatalogProductCreateFields.unit(page, productCreateUnit, value -> productCreateUnit = value);

    EditText purchase = labeledInput(page, "Alış fiyatı (isteğe bağlı)", "0,00");
    purchase.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    bind(purchase, productCreatePurchasePrice, value -> productCreatePurchasePrice = value);
    CatalogProductCreateFields.salePrice(page, productCreateSalePrice, value -> productCreateSalePrice = value);
    EditText category = labeledInput(page, "Kategori (isteğe bağlı)", "");
    bind(category, productCreateCategory, value -> productCreateCategory = value);
    EditText note = labeledMultiline(page, "Not", "Ürün açıklaması / not");
    bind(note, productCreateNote, value -> productCreateNote = value);

    Button submit = UiKit.button(context, "Ürünü Kaydet", UiKit.PRIMARY, view -> submitProductCreate());
    // Product creation is already outbox-safe. Another pending Market action must
    // not lock this form; only wait for the active product-data lookup to finish.
    submit.setEnabled(!productLookupLoading);
    submit.setLayoutParams(fullButtonParams(54, 4, 0));
    page.addView(submit);
    return page;
  }

  private void submitProductCreate() {
    try {
      JSONObject payload = MarketUiRules.productCreatePayload(
          productCreateBarcode,
          productCreateName,
          productCreateSku,
          productCreateUnit,
          productCreatePurchasePrice,
          productCreateSalePrice,
          productCreateCategory,
          productCreateNote
      );
      payload.put(
          "track_inventory",
          data.hasBusinessCapability(MarketUiRules.CAPABILITY_INVENTORY)
      );
      payload.put("brand", productCreateBrand);
      payload.put("image_source_url", productCreateImageUrl);
      payload.put("data_source", productCreateDataSource);
      payload.put("source_product_url", productCreateSourceProductUrl);
      payload.put("data_license", productCreateDataLicense);
      payload.put("image_license", productCreateImageLicense);
      payload.put("source_fetched_at", productCreateSourceFetchedAt);
      boolean queued = listener.onSubmit(
          MarketUiRules.ACTION_PRODUCT_CREATE,
          payload,
          "Ürün kaydı gönderildi; masaüstünde otomatik olarak kataloğa işlenecek.",
          "Ürün kaydı gönderim kuyruğuna alındı."
      );
      if (queued) {
        clearProductCreate();
        screen = SCREEN_HOME;
        formError = "";
        visibleMessage = "Ürün kaydı gönderim kuyruğuna alındı.";
        visibleMessagePending = true;
        listener.onRenderRequested();
      }
    } catch (MarketUiRules.ValidationException error) {
      showFormError(error.getMessage());
    } catch (JSONException error) {
      showFormError("Ürün kaydı hazırlanamadı.");
    }
  }

  private void clearProductCreate() {
    productCreateBarcode = "";
    productCreateName = "";
    productCreateBrand = "";
    productCreateSku = "";
    productCreateUnit = "piece";
    productCreatePurchasePrice = "";
    productCreateSalePrice = "";
    productCreateCategory = "";
    productCreateNote = "";
    productCreateImageUrl = "";
    productCreateDataSource = "";
    productCreateSourceProductUrl = "";
    productCreateDataLicense = "";
    productCreateImageLicense = "";
    productCreateSourceFetchedAt = "";
    productLookupLoading = false;
    productLookupMessage = "";
    productCreateImagePreview = null;
  }

  private void addProductSelectionActions(LinearLayout page, String purpose, boolean inventoryOnly) {
    LinearLayout row = UiKit.row(context);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, 0, 0, dp(10));
    row.setLayoutParams(params);
    if (MarketUiRules.canScanBarcode(data)) {
      UiKit.addAction(row, UiKit.button(context, "Barkod Tara", UiKit.PRIMARY,
          view -> showBarcodeEntry(purpose)), context);
    }
    UiKit.addAction(row, UiKit.outlineButton(context, "Ürün Seç",
        view -> showProductPicker(purpose, inventoryOnly)), context);
    page.addView(row);
  }

  private void showBarcodeEntry(String purpose) {
    boolean directCreate = PURPOSE_PRODUCT_CREATE.equals(purpose);
    if (!directCreate && !MarketUiRules.canScanBarcode(data)) return;
    requestCameraScanner(purpose, false);
  }

  private void requestCameraScanner(String purpose, boolean continuous) {
    if (activity == null || cameraPermissionLauncher == null) {
      showManualBarcodeEntry(purpose);
      return;
    }
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
        == PackageManager.PERMISSION_GRANTED) {
      launchCameraScanner(purpose, continuous);
      return;
    }
    if (cameraPermissionRequestInFlight) return;
    pendingCameraPurpose = purpose;
    pendingCameraContinuous = continuous;
    cameraPermissionRequestInFlight = true;
    cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
  }

  private void launchCameraScanner(String purpose, boolean continuous) {
    if (activity == null || purpose == null || purpose.isEmpty()) return;
    String title = PURPOSE_CASH.equals(purpose)
        ? "Kasa Barkod Okuyucu"
        : PURPOSE_PRODUCT_CREATE.equals(purpose)
          ? "Yeni ürün barkodu"
          : "Barkod Tara";
    BarcodeCameraScanner.show(activity, title, continuous, new BarcodeCameraScanner.Listener() {
      @Override
      public void onBarcode(String barcode) {
        handleBarcode(barcode, purpose);
      }

      @Override
      public void onManualEntry() {
        showManualBarcodeEntry(purpose);
      }

      @Override
      public void onError(String message) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show();
      }
    });
  }

  private void showManualBarcodeEntry(String purpose) {
    boolean directCreate = PURPOSE_PRODUCT_CREATE.equals(purpose);
    boolean cashMode = PURPOSE_CASH.equals(purpose);
    LinearLayout form = dialogForm();
    TextView help = UiKit.text(
        context,
        cashMode
            ? "Kamera yerine barkodu elle girip masaüstüne gönderebilirsiniz."
            : directCreate
              ? "Yeni ürünün barkodunu elle girin."
              : "Barkodu elle girin.",
        12,
        UiKit.SECONDARY,
        Typeface.NORMAL
    );
    form.addView(help);
    EditText barcode = labeledInput(form, "Barkod", "Barkodu girin");
    barcode.setInputType(InputType.TYPE_CLASS_TEXT);
    barcode.addTextChangedListener(watcher(value -> {
      String normalized = MarketUiRules.normalizeBarcodeIdentity(value);
      if (!normalized.equals(value)) {
        barcode.setText(normalized);
        barcode.setSelection(normalized.length());
      }
    }));
    TextView status = statusText();
    form.addView(status);
    AlertDialog dialog = new AlertDialog.Builder(context)
        .setTitle(cashMode ? "Kasa barkodu" : directCreate ? "Yeni ürün barkodu" : "Barkod Gir")
        .setView(form)
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton(cashMode ? "Gönder" : directCreate ? "Devam Et" : "Bul", null)
        .create();
    dialog.setOnShowListener(ignored -> {
      Button positive = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
      Runnable submit = () -> {
        String raw = MarketUiRules.normalizeBarcodeIdentity(value(barcode));
        if (raw.length() < 3) {
          status.setText("Geçerli bir barkod girin.");
          return;
        }
        dialog.dismiss();
        handleBarcode(raw, purpose);
      };
      positive.setOnClickListener(view -> submit.run());
      barcode.setOnEditorActionListener((view, actionId, event) -> {
        submit.run();
        return true;
      });
      barcode.requestFocus();
    });
    dialog.show();
  }

  private void handleBarcode(String rawBarcode, String purpose) {
    String barcode = MarketUiRules.normalizeBarcodeIdentity(rawBarcode);
    if (PURPOSE_CASH.equals(purpose)) {
      captureCashBarcode(barcode);
      return;
    }
    if (PURPOSE_PRODUCT_CREATE.equals(purpose)) {
      OperationData.MarketProduct existingProduct = MarketUiRules.resolveBarcode(data, barcode);
      if (existingProduct != null) {
        resultReturnScreen = SCREEN_HOME;
        barcodeResult = existingProduct.barcode;
        barcodeResultProductId = existingProduct.id;
        visibleMessage = "Bu barkod zaten " + existingProduct.name + " ürününe ait.";
        visibleMessagePending = false;
        screen = SCREEN_BARCODE_RESULT;
        formError = "";
        listener.onRenderRequested();
        return;
      }
      startProductCreate(barcode);
      return;
    }
    OperationData.MarketProduct product = MarketUiRules.resolveBarcode(data, barcode);
    if (product == null) {
      resultReturnScreen = screen;
      barcodeResult = barcode;
      barcodeResultProductId = "";
      screen = SCREEN_BARCODE_RESULT;
      formError = "";
      listener.onRenderRequested();
      return;
    }
    handleSelectedProduct(product, purpose);
  }

  private void handleSelectedProduct(OperationData.MarketProduct product, String purpose) {
    if (PURPOSE_STOCK.equals(purpose)) {
      stockProductId = product.id;
      screen = SCREEN_STOCK;
      formError = "";
      listener.onRenderRequested();
    } else if (PURPOSE_RECEIVING.equals(purpose)) {
      screen = SCREEN_RECEIVING;
      showReceivingLineDialog(product);
    } else if (PURPOSE_CART.equals(purpose)) {
      addProductToCart(product);
    } else {
      resultReturnScreen = screen;
      barcodeResult = product.barcode;
      barcodeResultProductId = product.id;
      screen = SCREEN_BARCODE_RESULT;
      formError = "";
      listener.onRenderRequested();
    }
  }

  private void showProductPicker(String purpose, boolean inventoryOnly) {
    if (!MarketUiRules.canViewProducts(data)) return;
    LinearLayout form = dialogForm();
    EditText search = labeledInput(form, "Ürün ara", "Ad, SKU veya barkod");
    LinearLayout results = UiKit.column(context);
    form.addView(results);
    ScrollView scroll = wrapDialog(form);
    AlertDialog dialog = new AlertDialog.Builder(context)
        .setTitle("Ürün Seç")
        .setView(scroll)
        .setNegativeButton("Kapat", null)
        .create();
    Runnable refresh = () -> {
      results.removeAllViews();
      int shown = 0;
      for (OperationData.MarketProduct product : MarketUiRules.searchProducts(data, value(search))) {
        if (inventoryOnly && !product.trackInventory) continue;
        Button choice = UiKit.outlineButton(
            context,
            product.name + productMeta(product),
            view -> {
              dialog.dismiss();
              handleSelectedProduct(product, purpose);
            }
        );
        choice.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        choice.setLayoutParams(fullButtonParams(52, 0, 7));
        results.addView(choice);
        shown += 1;
        if (shown >= 40) break;
      }
      if (shown == 0) {
        results.addView(UiKit.text(
            context,
            inventoryOnly ? "Stok takibine açık eşleşen ürün yok." : "Eşleşen ürün yok.",
            13,
            UiKit.MUTED,
            Typeface.NORMAL
        ));
      }
    };
    search.addTextChangedListener(watcher(value -> refresh.run()));
    dialog.setOnShowListener(ignored -> refresh.run());
    dialog.show();
  }

  private String productMeta(OperationData.MarketProduct product) {
    String barcode = product.barcode.isEmpty() ? "" : " · " + product.barcode;
    return "\n" + money(product.salePrice, product.currency) + barcode;
  }

  private void startProductCreate(String barcode) {
    if (!MarketUiRules.canCreateProduct(data)) return;
    clearProductCreate();
    productCreateBarcode = MarketUiRules.normalizeBarcodeIdentity(barcode);
    screen = SCREEN_PRODUCT_CREATE;
    formError = "";
    listener.onRenderRequested();
    if (MarketUiRules.canLookupProductData(data) && data.market.productData.autoSearchUnknownBarcode) {
      requestProductLookup();
    }
  }

  private void requestProductLookup() {
    if (!MarketUiRules.canCreateProduct(data)
        || !MarketUiRules.canLookupProductData(data)
        || productCreateBarcode.isEmpty()
        || productLookupLoading) {
      return;
    }
    productLookupLoading = true;
    productLookupMessage = "Ürün bilgileri aranıyor…";
    listener.onRenderRequested();
    listener.onProductLookupRequested(
        data.market.productData.provider,
        productCreateBarcode,
        data.market.productData.includeImages
    );
  }

  private void openScreen(String next) {
    screen = next;
    formError = "";
    listener.onRenderRequested();
  }

  private void addBackHeader(LinearLayout page, String title, String subtitle) {
    Button back = UiKit.outlineButton(context, "← Market", view -> handleBack());
    back.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
    LinearLayout.LayoutParams backParams = new LinearLayout.LayoutParams(-1, dp(44));
    backParams.setMargins(0, 0, 0, dp(10));
    back.setLayoutParams(backParams);
    page.addView(back);
    page.addView(UiKit.title(context, title));
    if (!subtitle.isEmpty()) {
      TextView description = UiKit.text(context, subtitle, 12, UiKit.SECONDARY, Typeface.NORMAL);
      LinearLayout.LayoutParams descriptionParams = new LinearLayout.LayoutParams(-1, -2);
      descriptionParams.setMargins(0, dp(2), 0, dp(12));
      description.setLayoutParams(descriptionParams);
      page.addView(description);
    }
  }

  private String productImageKey(String productId, String imageUrl) {
    return (productId == null ? "" : productId) + "|" + (imageUrl == null ? "" : imageUrl);
  }

  private void addProductImage(LinearLayout card, OperationData.MarketProduct product) {
    if (product == null || product.imageSourceUrl.isEmpty() || product.dataSource.isEmpty()) return;

    String key = productImageKey(product.id, product.imageSourceUrl);
    Bitmap preview = productImagePreviews.get(key);
    if (preview != null) {
      ImageView image = productImageView(preview, 168);
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(168));
      params.setMargins(0, 0, 0, dp(10));
      image.setLayoutParams(params);
      card.addView(image);
      return;
    }

    if (productImageFailures.contains(key) || !productImageRequests.add(key)) return;
    listener.onProductImageRequested(product.id, product.dataSource, product.imageSourceUrl);
  }

  private ImageView productImageView(Bitmap bitmap, int heightDp) {
    ImageView image = new ImageView(context);
    image.setImageBitmap(bitmap);
    image.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
    image.setAdjustViewBounds(false);
    image.setPadding(dp(14), dp(12), dp(14), dp(12));
    image.setBackground(UiKit.rounded(context, UiKit.SURFACE_ALT, UiKit.BORDER, 12));
    image.setMinimumHeight(dp(heightDp));
    return image;
  }

  private View messageCard(String message, boolean pending) {
    LinearLayout card = UiKit.card(context);
    int tone = pending ? UiKit.WARNING : UiKit.SUCCESS;
    card.setBackground(UiKit.rounded(context, UiKit.withAlpha(tone, 25), UiKit.withAlpha(tone, 100), 14));
    card.addView(UiKit.text(context, message, 13, tone, Typeface.BOLD));
    return card;
  }

  private View emptyCard(String title, String detail) {
    LinearLayout card = UiKit.card(context);
    card.addView(UiKit.text(context, title, 14, UiKit.TEXT, Typeface.BOLD));
    card.addView(UiKit.text(context, detail, 12, UiKit.MUTED, Typeface.NORMAL));
    return card;
  }

  private void addFormError(LinearLayout page) {
    if (!formError.isEmpty()) {
      page.addView(messageCard(formError, true));
    }
  }

  private void showFormError(String message) {
    formError = message == null ? "Bilgileri kontrol edin." : message;
    listener.onRenderRequested();
  }

  private void addFieldLabel(LinearLayout form, String label) {
    TextView text = UiKit.text(context, label, 12, UiKit.SECONDARY, Typeface.BOLD);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, dp(4), 0, dp(5));
    text.setLayoutParams(params);
    form.addView(text);
  }

  private EditText labeledInput(LinearLayout form, String label, String hint) {
    addFieldLabel(form, label);
    EditText input = UiKit.input(context, hint);
    input.setLayoutParams(fieldParams(50));
    form.addView(input);
    return input;
  }

  private EditText labeledMultiline(LinearLayout form, String label, String hint) {
    addFieldLabel(form, label);
    EditText input = UiKit.input(context, hint);
    input.setSingleLine(false);
    input.setGravity(Gravity.TOP | Gravity.START);
    input.setPadding(dp(12), dp(11), dp(12), dp(11));
    input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
    input.setLayoutParams(fieldParams(82));
    form.addView(input);
    return input;
  }

  private void bind(EditText input, String initial, ValueListener listener) {
    input.setText(initial == null ? "" : initial);
    input.addTextChangedListener(watcher(listener));
  }

  private TextWatcher watcher(ValueListener listener) {
    return new TextWatcher() {
      @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) {}
      @Override public void onTextChanged(CharSequence value, int start, int before, int count) {
        listener.onValue(value == null ? "" : value.toString());
      }
      @Override public void afterTextChanged(Editable value) {}
    };
  }

  private LinearLayout dialogForm() {
    LinearLayout form = UiKit.column(context);
    form.setPadding(dp(16), dp(10), dp(16), dp(8));
    return form;
  }

  private ScrollView wrapDialog(View content) {
    ScrollView scroll = new ScrollView(context);
    scroll.addView(content);
    return scroll;
  }

  private TextView statusText() {
    TextView status = UiKit.text(context, "", 12, UiKit.DANGER, Typeface.BOLD);
    status.setPadding(0, dp(5), 0, 0);
    return status;
  }

  private LinearLayout.LayoutParams fieldParams(int height) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(height));
    params.setMargins(0, 0, 0, dp(9));
    return params;
  }

  private LinearLayout.LayoutParams fullButtonParams(int height, int top, int bottom) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(height));
    params.setMargins(0, dp(top), 0, dp(bottom));
    return params;
  }

  private boolean submissionBlocked() {
    return loading || localPendingCount > 0 || data.pendingActions > 0;
  }

  private String supplierName(String supplierId) {
    for (OperationData.MarketSupplier supplier : data.market.suppliers) {
      if (supplier.id.equals(supplierId)) return supplier.name;
    }
    return "";
  }

  private String receivingCurrency() {
    List<MarketUiRules.ReceivingLine> lines = receiving.lines();
    return lines.isEmpty() ? "TRY" : lines.get(0).currency;
  }

  private String cartCurrency() {
    List<MarketUiRules.CartLine> lines = cart.lines();
    return lines.isEmpty() ? "TRY" : lines.get(0).currency;
  }

  private String money(double value, String currency) {
    NumberFormat format = NumberFormat.getCurrencyInstance(new Locale("tr", "TR"));
    try {
      format.setCurrency(java.util.Currency.getInstance(
          currency == null || currency.trim().isEmpty() ? "TRY" : currency.trim().toUpperCase(Locale.ROOT)
      ));
    } catch (IllegalArgumentException ignored) {
      // Snapshot currency is already sanitized; keep the locale default as a safe fallback.
    }
    return format.format(Math.max(0, value));
  }

  private String quantity(double value) {
    if (value == Math.rint(value)) return String.valueOf((long) value);
    return String.format(Locale.US, "%.4f", value).replaceAll("0+$", "").replaceAll("\\.$", "").replace('.', ',');
  }

  private String unitLabel(String unit) {
    if ("kg".equals(unit)) return "kg";
    if ("g".equals(unit)) return "g";
    if ("l".equals(unit)) return "l";
    if ("ml".equals(unit)) return "ml";
    if ("pack".equals(unit)) return "paket";
    if ("box".equals(unit)) return "kutu";
    if ("meter".equals(unit)) return "metre";
    if ("other".equals(unit)) return "birim";
    return "adet";
  }

  private String shortTime(String raw) {
    String value = raw == null ? "" : raw.trim().replace('T', ' ');
    return value.length() > 16 ? value.substring(0, 16) : value;
  }

  private String value(EditText input) {
    return input == null || input.getText() == null ? "" : input.getText().toString().trim();
  }

  private int dp(int value) {
    return UiKit.dp(context, value);
  }

  private boolean isMarketAction(String actionType) {
    return MarketUiRules.requiredPermissionForAction(actionType) != null;
  }

  private interface ValueListener {
    void onValue(String value);
  }

  private interface PositionListener {
    void onSelected(int position);
  }

  private static final class SimpleItemSelectedListener implements android.widget.AdapterView.OnItemSelectedListener {
    private final PositionListener listener;

    SimpleItemSelectedListener(PositionListener listener) {
      this.listener = listener;
    }

    @Override
    public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
      listener.onSelected(position);
    }

    @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
  }

  private static final class ActionItem {
    final String label;
    final Runnable action;

    ActionItem(String label, Runnable action) {
      this.label = label;
      this.action = action;
    }
  }

  private static final class SupplierChoice {
    final String id;
    final String label;

    SupplierChoice(String id, String label) {
      this.id = id;
      this.label = label;
    }

    @Override public String toString() { return label; }
  }

}

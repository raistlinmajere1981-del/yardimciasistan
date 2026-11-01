package com.yardimciasistan.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

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

    default void onCustomerSalePreviewRequested(SalePreviewRequest request, java.util.function.Consumer<SalePreviewApproval> callback) {
      callback.accept(null);
    }

    default void onPointSpendQuoteRequested(PointSpendQuoteRequest request, java.util.function.Consumer<PointSpendQuote> callback) {
      callback.accept(null);
    }

    default void onCouponPermitRequested(CouponPermitRequest request, java.util.function.Consumer<CouponPermit> callback) {
      callback.accept(null);
    }

    /** Coupon sales must reuse the exact preauthorization action id, never a new one. */
    default boolean onSubmitWithActionId(String actionId, String actionType, JSONObject payload,
        String acceptedMessage, String queuedMessage) {
      return false;
    }
  }

  static final String SCREEN_HOME = "home";
  static final String SCREEN_BARCODE_RESULT = "barcode_result";
  static final String SCREEN_STOCK = "stock";
  static final String SCREEN_RECEIVING = "receiving";
  static final String SCREEN_CART = "cart";
  static final String SCREEN_SALE = "sale";
  static final String SCREEN_CREDIT = "credit";
  static final String SCREEN_PRODUCT_CREATE = "product_create";
  static final String SCREEN_CASH_BARCODE = "cash_barcode";

  static final String PURPOSE_LOOKUP = "lookup";
  static final String PURPOSE_STOCK = "stock";
  static final String PURPOSE_RECEIVING = "receiving";
  static final String PURPOSE_CART = "cart";
  static final String PURPOSE_PRODUCT_CREATE = "product_create";
  static final String PURPOSE_CASH = "cash";

  private final Context context;
  private final Listener listener;
  private final MarketFormUi ui;
  private final MarketSubmissionFeedback feedback;
  private final MarketBarcodeFlow barcodeFlow;
  private final MarketProductEditor productEditor;
  private final MarketCatalogBrowser catalog;
  private final MarketInventoryFlow inventory;
  private final MarketCheckoutFlow checkout;
  private final MarketCreditFlow credit;

  private OperationData data = new OperationData();
  private String observedSnapshotVersion = "";
  private String screen = SCREEN_HOME;
  private String resultReturnScreen = SCREEN_HOME;
  private String barcodeResult = "";
  private String barcodeResultProductId = "";
  private int saleScrollY;

  MarketWorkspace(Context context, Listener listener) {
    this.context = context;
    this.listener = listener;
    ui = new MarketFormUi(context, this::handleBack);
    feedback = new MarketSubmissionFeedback(() -> data, listener, ui);
    barcodeFlow = new MarketBarcodeFlow(context, ui, new MarketBarcodeFlow.Listener() {
      @Override public void onBarcode(String barcode, String purpose) { handleBarcode(barcode, purpose); }
      @Override public boolean onCashBarcode(String barcode, JSONObject payload) { return listener.onBarcodeScan(barcode, payload); }
    }, () -> openScreen(SCREEN_HOME));
    catalog = new MarketCatalogBrowser(context, () -> data, listener, ui, this::showBarcodeEntry, this::handleSelectedProduct);
    productEditor = new MarketProductEditor(context, listener, () -> data, ui, feedback, next -> screen = next);
    inventory = new MarketInventoryFlow(context, listener, () -> data, ui, feedback, next -> screen = next, catalog);
    checkout = new MarketCheckoutFlow(context, listener, () -> data, ui, feedback, next -> screen = next, catalog, this::openScreen);
    credit = new MarketCreditFlow(context, listener, () -> data, ui, feedback);
  }

  ScrollView create(OperationData nextData, int nextLocalPendingCount, boolean nextLoading) {
    String nextSnapshotVersion = nextData == null ? "" : nextData.snapshotUpdatedAt;
    // Rebuilt OperationData objects can represent the very same snapshot. Do not
    // discard an open financial confirmation merely because a sync rerendered
    // its presentation; true snapshot revisions still invalidate and recheck.
    if (!observedSnapshotVersion.equals(nextSnapshotVersion)) checkout.invalidateSale();
    observedSnapshotVersion = nextSnapshotVersion;
    data = nextData == null ? new OperationData() : nextData;
    checkout.reconcileCustomer();
    feedback.update(nextLocalPendingCount, nextLoading);
    enforceVisibleScreen();

    LinearLayout page;
    if (SCREEN_STOCK.equals(screen)) {
      page = inventory.stockScreen();
    } else if (SCREEN_RECEIVING.equals(screen)) {
      page = inventory.receivingScreen();
    } else if (SCREEN_CART.equals(screen)) {
      page = checkout.cartScreen();
    } else if (SCREEN_SALE.equals(screen)) {
      page = checkout.saleScreen();
    } else if (SCREEN_CREDIT.equals(screen)) {
      page = credit.creditScreen();
    } else if (SCREEN_PRODUCT_CREATE.equals(screen)) {
      page = productEditor.productCreateScreen();
    } else if (SCREEN_BARCODE_RESULT.equals(screen)) {
      page = barcodeResultScreen();
    } else if (SCREEN_CASH_BARCODE.equals(screen)) {
      page = barcodeFlow.cashBarcodeScreen();
    } else {
      page = homeScreen();
    }
    if (SCREEN_SALE.equals(screen)) {
      // A tall checkout must remain scrollable above bottom navigation on
      // small Android phones, including after a quote/sync rerender.
      ScrollView saleScroll = UiKit.scroll(context, page, 104);
      int previousY = saleScrollY;
      saleScroll.setOnScrollChangeListener((view, x, y, oldX, oldY) -> saleScrollY = y);
      saleScroll.post(() -> saleScroll.scrollTo(0, previousY));
      return saleScroll;
    }
    saleScrollY = 0;
    return UiKit.scroll(context, page);
  }

  boolean handleBack() {
    if (SCREEN_HOME.equals(screen)) return false;
    checkout.invalidateSale();
    if (SCREEN_SALE.equals(screen)) {
      screen = SCREEN_CART;
    } else if (SCREEN_CREDIT.equals(screen)) {
      if (!credit.backToList()) screen = SCREEN_HOME;
    } else if (SCREEN_BARCODE_RESULT.equals(screen)) {
      screen = resultReturnScreen;
    } else {
      screen = SCREEN_HOME;
    }
    feedback.formError = "";
    listener.onRenderRequested();
    return true;
  }

  String screenKey() {
    return screen;
  }

  void invalidateSaleLifecycle() { checkout.invalidateSale(); }
  boolean matchesSalePreviewScope(SalePreviewRequest request) {
    return SCREEN_SALE.equals(screen) && checkout.matchesSalePreviewScope(request);
  }

  void onSubmissionAccepted(String type, String message, String id) { feedback.onSubmissionAccepted(type, message, id); }
  void onSubmissionQueued(String type, String message) { feedback.onSubmissionQueued(type, message); }
  void onBarcodeScanAccepted(String barcode, String message) { barcodeFlow.onScanFeedback(barcode, message); }
  void onBarcodeScanQueued(String barcode, String message) { barcodeFlow.onScanFeedback(barcode, message); }

  void onProductLookupCompleted(String barcode, ProductDataLookupClient.Result result, String error) {
    productEditor.onProductLookupCompleted(barcode, result, error);
  }
  void onProductImageLoaded(String productId, String imageUrl, Bitmap preview) {
    catalog.onProductImageLoaded(productId, imageUrl, preview);
  }

  private void enforceVisibleScreen() {
    if (!MarketUiRules.canOpenMarket(data)) {
      screen = SCREEN_HOME;
      return;
    }
    if (SCREEN_STOCK.equals(screen) && !MarketUiRules.canStockCount(data)) screen = SCREEN_HOME;
    if (SCREEN_RECEIVING.equals(screen) && !MarketUiRules.canReceive(data)) screen = SCREEN_HOME;
    if (SCREEN_CART.equals(screen) && !MarketUiRules.canCreateCartDraft(data) && !MarketUiRules.canCompleteSale(data)) screen = SCREEN_HOME;
    if (SCREEN_SALE.equals(screen) && !MarketUiRules.canCompleteSale(data)) screen = SCREEN_HOME;
    if (!MarketUiRules.canViewCredit(data)) {
      credit.revokeCredit();
      checkout.revokeCredit();
      if (SCREEN_CREDIT.equals(screen)) screen = SCREEN_HOME;
    }
    if (SCREEN_PRODUCT_CREATE.equals(screen) && !MarketUiRules.canCreateProduct(data)) screen = SCREEN_HOME;
    if (SCREEN_BARCODE_RESULT.equals(screen) && !MarketUiRules.canViewProducts(data)) screen = SCREEN_HOME;
    if (SCREEN_CASH_BARCODE.equals(screen) && !MarketUiRules.canScanToDesktop(data)) screen = SCREEN_HOME;
  }

  private LinearLayout homeScreen() {
    LinearLayout page = UiKit.column(context);
    // The application shell already shows the "Satış" title.
    // Avoid repeating the same label in the content area.
    feedback.addPendingState(page);

    if (MarketUiRules.canScanToDesktop(data)) {
      Button cashBarcode = UiKit.button(context, "▣  Kasa Barkod Modu", UiKit.PRIMARY,
          view -> openCashBarcodeMode());
      cashBarcode.setContentDescription("Telefonu masaüstü kasası için sürekli barkod okuyucu olarak kullan");
      ui.sizeButton(cashBarcode, 58, 0, 12);
      page.addView(cashBarcode);
    }

    if (MarketUiRules.canScanBarcode(data)) {
      Button barcode = UiKit.button(context, "▣  Barkod Tara", UiKit.PRIMARY,
          view -> showBarcodeEntry(PURPOSE_LOOKUP));
      barcode.setContentDescription("Barkod tara veya barkod okuyucudan gir");
      ui.sizeButton(barcode, 58, 0, 12);
      page.addView(barcode);
    }

    ArrayList<ActionItem> actions = new ArrayList<>();
    if (MarketUiRules.canStockCount(data)) {
      actions.add(new ActionItem("Stok Say", () -> openScreen(SCREEN_STOCK)));
    }
    if (MarketUiRules.canReceive(data)) {
      actions.add(new ActionItem("Mal Kabul", () -> openScreen(SCREEN_RECEIVING)));
    }
    if (MarketUiRules.canCreateCartDraft(data) || MarketUiRules.canCompleteSale(data)) {
      actions.add(new ActionItem("Sepet", () -> openScreen(SCREEN_CART)));
    }
    if (MarketUiRules.canViewCredit(data)) actions.add(new ActionItem("Veresiye / Cari", () -> openScreen(SCREEN_CREDIT)));
    if (MarketUiRules.canCreateProduct(data)) {
      actions.add(new ActionItem("Yeni Ürün", () -> showBarcodeEntry(PURPOSE_PRODUCT_CREATE)));
    }
    addActionGrid(page, actions);

    if (MarketUiRules.canViewProducts(data)) {
      Button search = UiKit.outlineButton(context, "Ürün Ara", view -> catalog.showProductPicker(PURPOSE_LOOKUP, false));
      ui.sizeButton(search, 48, actions.isEmpty() ? 0 : 2, 10);
      page.addView(search);
    }

    if (MarketUiRules.canViewSummary(data)) {
      addMarketSummary(page);
    }
    int financialCount = 0;
    for (OperationData.ActionRecord action : data.actions) {
      if ((!MarketUiRules.ACTION_SALE.equals(action.type) && !MarketUiRules.ACTION_CREDIT_PAYMENT.equals(action.type))
          || (MarketUiRules.ACTION_SALE.equals(action.type) && !MarketUiRules.canCompleteSale(data))
          || (MarketUiRules.ACTION_CREDIT_PAYMENT.equals(action.type) && !MarketUiRules.canViewCredit(data))) continue;
      if (financialCount++ >= 5) break;
      LinearLayout result = UiKit.card(context);
      result.addView(UiKit.text(context, MarketUiRules.ACTION_SALE.equals(action.type) ? "Mobil satış" : "Cari tahsilat", 16, UiKit.TEXT, Typeface.BOLD));
      result.addView(UiKit.text(context, MarketUiRules.financialFeedback(action.type, action.status), 16, UiKit.SECONDARY, Typeface.NORMAL));
      if (!action.errorMessage.isEmpty()) result.addView(UiKit.text(context, action.errorMessage, 16, UiKit.DANGER, Typeface.NORMAL));
      page.addView(result);
    }
    return page;
  }

  private void addActionGrid(LinearLayout page, List<ActionItem> actions) {
    for (int index = 0; index < actions.size(); index += 2) {
      LinearLayout row = UiKit.row(context);
      LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(-1, -2);
      rowParams.setMargins(0, 0, 0, ui.dp(8));
      row.setLayoutParams(rowParams);
      addGridAction(row, actions.get(index));
      if (index + 1 < actions.size()) {
        addGridAction(row, actions.get(index + 1));
      } else {
        View spacer = new View(context);
        LinearLayout.LayoutParams spacerParams = new LinearLayout.LayoutParams(0, ui.dp(52), 1f);
        spacerParams.setMargins(ui.dp(7), 0, 0, 0);
        spacer.setLayoutParams(spacerParams);
        row.addView(spacer);
      }
      page.addView(row);
    }
  }

  private void addGridAction(LinearLayout row, ActionItem action) {
    Button button = UiKit.outlineButton(context, action.label, view -> action.action.run());
    button.setMinHeight(ui.dp(52));
    button.setMinimumHeight(ui.dp(52));
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, -2, 1f);
    if (row.getChildCount() > 0) params.setMargins(ui.dp(7), 0, 0, 0);
    button.setLayoutParams(params);
    row.addView(button);
  }

  private void addMarketSummary(LinearLayout page) {
    page.addView(UiKit.sectionTitle(context, "Bugün"));
    OperationData.MarketSummary summary = data.market.summary;
    ArrayList<View> metrics = new ArrayList<>();
    if (data.hasBusinessCapability(MarketUiRules.CAPABILITY_SALES)) {
      metrics.add(UiKit.metricCard(context, "Bugünkü satış",
          summary.todaySaleCount + " · " + ui.money(summary.todaySalesTotal, summary.currency),
          UiKit.SUCCESS, null));
    }
    if (data.hasBusinessCapability(MarketUiRules.CAPABILITY_INVENTORY)) {
      metrics.add(UiKit.metricCard(context, "Kritik stok", summary.criticalStockCount,
          summary.criticalStockCount > 0 ? UiKit.WARNING : UiKit.SUCCESS, null));
    }
    if (data.hasBusinessCapability(MarketUiRules.CAPABILITY_PURCHASING)) {
      metrics.add(UiKit.metricCard(context, "Mal kabul", summary.recentReceivingCount,
          UiKit.INFO, null));
    }
    if (!metrics.isEmpty()) page.addView(UiKit.metricGrid(context, metrics));

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
            "Gerçek stok: " + ui.quantity(adjustment.quantityAfter) + " · " + ui.shortTime(adjustment.createdAt),
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
            purchase.lineCount + " satır · " + ui.money(purchase.total, purchase.currency)
                + " · " + ui.shortTime(purchase.receivedAt),
            12,
            UiKit.SECONDARY,
            Typeface.NORMAL
        ));
        page.addView(card);
        shown += 1;
      }
    }
  }

  private void openCashBarcodeMode() {
    screen = SCREEN_CASH_BARCODE;
    feedback.formError = "";
    listener.onRenderRequested();
    barcodeFlow.requestCameraScanner(PURPOSE_CASH, true);
  }

  private LinearLayout barcodeResultScreen() {
    LinearLayout page = UiKit.column(context);
    ui.addBackHeader(page, "Barkod sonucu", barcodeResult);
    feedback.addPendingState(page);
    OperationData.MarketProduct product = MarketUiRules.productById(data, barcodeResultProductId);
    if (product == null) {
      LinearLayout unknown = UiKit.card(context);
      unknown.addView(UiKit.text(context, "Barkod kayıtlı değil.", 18, UiKit.TEXT, Typeface.BOLD));
      unknown.addView(UiKit.text(context, "Barkod: " + barcodeResult, 13, UiKit.SECONDARY, Typeface.NORMAL));
      if (MarketUiRules.canCreateProduct(data)) {
        Button draft = UiKit.button(context, "Yeni Ürün", UiKit.PRIMARY, view -> productEditor.startProductCreate(barcodeResult));
        ui.sizeButton(draft, 48, 12, 0);
        unknown.addView(draft);
      }
      page.addView(unknown);
      if (MarketUiRules.canScanBarcode(data)) {
        Button retry = UiKit.outlineButton(context, "Başka Barkod Tara", view -> showBarcodeEntry(PURPOSE_LOOKUP));
        ui.sizeButton(retry, 48, 2, 0);
        page.addView(retry);
      }
      return page;
    }

    page.addView(productCard(product));
    return page;
  }

  private LinearLayout productCard(OperationData.MarketProduct product) {
    LinearLayout card = UiKit.card(context);
    catalog.addProductImage(card, product);
    card.addView(UiKit.text(context, product.name, 18, UiKit.TEXT, Typeface.BOLD));
    if (!product.barcode.isEmpty()) {
      card.addView(UiKit.text(context, "Barkod: " + product.barcode, 12, UiKit.SECONDARY, Typeface.NORMAL));
    }
    if (data.hasBusinessCapability(MarketUiRules.CAPABILITY_INVENTORY) && product.trackInventory) {
      card.addView(UiKit.text(
          context,
          "Stok: " + ui.quantity(product.currentQuantity) + " " + ui.unitLabel(product.unit),
          14,
          UiKit.WARNING,
          Typeface.BOLD
      ));
    }
    card.addView(UiKit.text(
        context,
        "Fiyat: " + ui.money(product.salePrice, product.currency),
        14,
        UiKit.SUCCESS,
        Typeface.BOLD
    ));

    ArrayList<ActionItem> actions = new ArrayList<>();
    if (MarketUiRules.canCreateCartDraft(data) || MarketUiRules.canCompleteSale(data)) {
      actions.add(new ActionItem("Sepete Ekle", () -> checkout.addProductToCart(product)));
    }
    if (MarketUiRules.canStockCount(data) && product.trackInventory) {
      actions.add(new ActionItem("Stok Say", () -> {
        inventory.selectStock(product);
        openScreen(SCREEN_STOCK);
      }));
    }
    if (MarketUiRules.canReceive(data) && product.trackInventory) {
      actions.add(new ActionItem("Mal Kabule Ekle", () -> inventory.showReceivingLineDialog(product)));
    }
    for (ActionItem action : actions) {
      Button button = UiKit.outlineButton(context, action.label, view -> action.action.run());
      ui.sizeButton(button, 48, 10, 0);
      card.addView(button);
    }
    return card;
  }

  private void showBarcodeEntry(String purpose) {
    boolean directCreate = PURPOSE_PRODUCT_CREATE.equals(purpose);
    if (!directCreate && !MarketUiRules.canScanBarcode(data)) return;
    barcodeFlow.requestCameraScanner(purpose, false);
  }

  private void handleBarcode(String rawBarcode, String purpose) {
    String barcode = MarketUiRules.normalizeBarcodeIdentity(rawBarcode);
    if (PURPOSE_CASH.equals(purpose)) {
      barcodeFlow.captureCashBarcode(barcode);
      return;
    }
    if (PURPOSE_PRODUCT_CREATE.equals(purpose)) {
      OperationData.MarketProduct existingProduct = MarketUiRules.resolveBarcode(data, barcode);
      if (existingProduct != null) {
        resultReturnScreen = SCREEN_HOME;
        barcodeResult = existingProduct.barcode;
        barcodeResultProductId = existingProduct.id;
        feedback.visibleMessage = "Bu barkod zaten " + existingProduct.name + " ürününe ait.";
        feedback.visibleMessagePending = false;
        screen = SCREEN_BARCODE_RESULT;
        feedback.formError = "";
        listener.onRenderRequested();
        return;
      }
      productEditor.startProductCreate(barcode);
      return;
    }
    OperationData.MarketProduct product = MarketUiRules.resolveBarcode(data, barcode);
    if (product == null) {
      resultReturnScreen = screen;
      barcodeResult = barcode;
      barcodeResultProductId = "";
      screen = SCREEN_BARCODE_RESULT;
      feedback.formError = "";
      listener.onRenderRequested();
      return;
    }
    handleSelectedProduct(product, purpose);
  }

  private void handleSelectedProduct(OperationData.MarketProduct product, String purpose) {
    if (PURPOSE_STOCK.equals(purpose)) {
      inventory.selectStock(product);
      screen = SCREEN_STOCK;
      feedback.formError = "";
      listener.onRenderRequested();
    } else if (PURPOSE_RECEIVING.equals(purpose)) {
      screen = SCREEN_RECEIVING;
      inventory.showReceivingLineDialog(product);
    } else if (PURPOSE_CART.equals(purpose)) {
      checkout.addProductToCart(product);
    } else {
      resultReturnScreen = screen;
      barcodeResult = product.barcode;
      barcodeResultProductId = product.id;
      screen = SCREEN_BARCODE_RESULT;
      feedback.formError = "";
      listener.onRenderRequested();
    }
  }

  private void openScreen(String next) {
    if (!next.equals(screen)) {
      checkout.invalidateSale();
      saleScrollY = 0;
    }
    screen = next;
    feedback.formError = "";
    listener.onRenderRequested();
  }

  private static final class ActionItem {
    final String label;
    final Runnable action;

    ActionItem(String label, Runnable action) {
      this.label = label;
      this.action = action;
    }
  }

}

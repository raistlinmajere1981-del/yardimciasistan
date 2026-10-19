package com.yardimciasistan.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import java.util.function.Consumer;
import java.util.function.Supplier;
import org.json.JSONException;
import org.json.JSONObject;

/** Product creation draft and optional lookup presentation; catalog writes remain Desktop-owned. */
final class MarketProductEditor {
  private final Context context;
  private final MarketWorkspace.Listener listener;
  private final Supplier<OperationData> snapshot;
  private final MarketFormUi ui;
  private final MarketSubmissionFeedback feedback;
  private final Consumer<String> selectScreen;
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

  MarketProductEditor(Context context, MarketWorkspace.Listener listener, Supplier<OperationData> snapshot, MarketFormUi ui, MarketSubmissionFeedback feedback, Consumer<String> selectScreen) {
    this.context = context; this.listener = listener; this.snapshot = snapshot;
    this.ui = ui; this.feedback = feedback; this.selectScreen = selectScreen;
  }

  LinearLayout productCreateScreen() {
    LinearLayout page = UiKit.column(context);
    ui.addBackHeader(page, "Yeni Ürün", "Ürün bilgileri doğrudan kataloğa kaydedilir.");
    feedback.addPendingState(page);
    feedback.addFormError(page);

    EditText barcode = UiKit.labeledInput(context, page, "Barkod", "");
    barcode.setText(productCreateBarcode);
    barcode.setEnabled(false);

    if (MarketUiRules.canLookupProductData(snapshot.get())) {
      Button lookup = UiKit.outlineButton(
          context,
          productLookupLoading ? "Ürün Bilgileri Aranıyor…" : "Ürün Bilgilerini Ara",
          view -> requestProductLookup()
      );
      lookup.setEnabled(!productLookupLoading);
      ui.sizeButton(lookup, 48, 0, 8);
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
      ImageView preview = ui.productImageView(productCreateImagePreview, 180);
      LinearLayout.LayoutParams previewParams = new LinearLayout.LayoutParams(-1, ui.dp(180));
      previewParams.setMargins(0, ui.dp(4), 0, ui.dp(10));
      preview.setLayoutParams(previewParams);
      page.addView(preview);
    }

    CatalogProductCreateFields.name(page, productCreateName, value -> productCreateName = value);
    EditText brand = UiKit.labeledInput(context, page, "Marka (isteğe bağlı)", "");
    ui.bind(brand, productCreateBrand, value -> productCreateBrand = value);
    EditText sku = UiKit.labeledInput(context, page, "SKU (isteğe bağlı)", "");
    ui.bind(sku, productCreateSku, value -> productCreateSku = value);

    CatalogProductCreateFields.unit(page, productCreateUnit, value -> productCreateUnit = value);

    EditText purchase = UiKit.labeledInput(context, page, "Alış fiyatı (isteğe bağlı)", "0,00");
    purchase.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    ui.bind(purchase, productCreatePurchasePrice, value -> productCreatePurchasePrice = value);
    CatalogProductCreateFields.salePrice(page, productCreateSalePrice, value -> productCreateSalePrice = value);
    EditText category = UiKit.labeledInput(context, page, "Kategori (isteğe bağlı)", "");
    ui.bind(category, productCreateCategory, value -> productCreateCategory = value);
    EditText note = ui.labeledMultiline(page, "Not", "Ürün açıklaması / not");
    ui.bind(note, productCreateNote, value -> productCreateNote = value);

    Button submit = UiKit.button(context, "Ürünü Kaydet", UiKit.PRIMARY, view -> submitProductCreate());
    // Product creation is already outbox-safe. Another pending Market action must
    // not lock this form; only wait for the active product-snapshot.get() lookup to finish.
    submit.setEnabled(!productLookupLoading);
    ui.sizeButton(submit, 54, 4, 0);
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
          snapshot.get().hasBusinessCapability(MarketUiRules.CAPABILITY_INVENTORY)
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
        selectScreen.accept(MarketWorkspace.SCREEN_HOME);
        feedback.formError = "";
        feedback.visibleMessage = "Ürün kaydı gönderim kuyruğuna alındı.";
        feedback.visibleMessagePending = true;
        listener.onRenderRequested();
      }
    } catch (MarketUiRules.ValidationException error) {
      feedback.showFormError(error.getMessage());
    } catch (JSONException error) {
      feedback.showFormError("Ürün kaydı hazırlanamadı.");
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

  void startProductCreate(String barcode) {
    if (!MarketUiRules.canCreateProduct(snapshot.get())) return;
    clearProductCreate();
    productCreateBarcode = MarketUiRules.normalizeBarcodeIdentity(barcode);
    selectScreen.accept(MarketWorkspace.SCREEN_PRODUCT_CREATE);
    feedback.formError = "";
    listener.onRenderRequested();
    if (MarketUiRules.canLookupProductData(snapshot.get()) && snapshot.get().market.productData.autoSearchUnknownBarcode) {
      requestProductLookup();
    }
  }

  private void requestProductLookup() {
    if (!MarketUiRules.canCreateProduct(snapshot.get())
        || !MarketUiRules.canLookupProductData(snapshot.get())
        || productCreateBarcode.isEmpty()
        || productLookupLoading) {
      return;
    }
    productLookupLoading = true;
    productLookupMessage = "Ürün bilgileri aranıyor…";
    listener.onRenderRequested();
    listener.onProductLookupRequested(
        snapshot.get().market.productData.provider,
        productCreateBarcode,
        snapshot.get().market.productData.includeImages
    );
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
}

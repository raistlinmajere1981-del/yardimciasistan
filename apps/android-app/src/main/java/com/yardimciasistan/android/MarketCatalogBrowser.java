package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Snapshot-only product selection and lazy preview cache shared by Market forms. */
final class MarketCatalogBrowser {
  private final Context context;
  private final Supplier<OperationData> snapshot;
  private final MarketWorkspace.Listener listener;
  private final MarketFormUi ui;
  private final Consumer<String> scan;
  private final BiConsumer<OperationData.MarketProduct, String> selected;
  private final Map<String, Bitmap> productImagePreviews = new HashMap<>();
  private final Set<String> productImageRequests = new HashSet<>();
  private final Set<String> productImageFailures = new HashSet<>();

  MarketCatalogBrowser(Context context, Supplier<OperationData> snapshot, MarketWorkspace.Listener listener,
      MarketFormUi ui, Consumer<String> scan, BiConsumer<OperationData.MarketProduct, String> selected) {
    this.context = context; this.snapshot = snapshot; this.listener = listener;
    this.ui = ui; this.scan = scan; this.selected = selected;
  }
  void showProductPicker(String purpose, boolean inventoryOnly) {
    if (!MarketUiRules.canViewProducts(snapshot.get())) return;
    LinearLayout form = ui.dialogForm();
    EditText search = UiKit.labeledInput(context, form, "Ürün ara", "Ad, SKU veya barkod");
    LinearLayout results = UiKit.column(context);
    form.addView(results);
    ScrollView scroll = ui.wrapDialog(form);
    AlertDialog dialog = new AlertDialog.Builder(context)
        .setTitle("Ürün Seç")
        .setView(scroll)
        .setNegativeButton("Kapat", null)
        .create();
    Runnable refresh = () -> {
      results.removeAllViews();
      int shown = 0;
      for (OperationData.MarketProduct product : MarketUiRules.searchProducts(snapshot.get(), ui.value(search))) {
        if (inventoryOnly && !product.trackInventory) continue;
        Button choice = UiKit.outlineButton(
            context,
            product.name + productMeta(product),
            view -> {
              dialog.dismiss();
              selected.accept(product, purpose);
            }
        );
        choice.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        LinearLayout resultRow = UiKit.row(context);
        Bitmap cached = productImagePreviews.get(productImageKey(product.id, product.imageSourceUrl));
        if (cached != null) {
          ImageView preview = ui.productImageView(cached, 58);
          LinearLayout.LayoutParams imageParams = new LinearLayout.LayoutParams(ui.dp(58), ui.dp(58));
          imageParams.setMargins(0, 0, ui.dp(8), 0);
          resultRow.addView(preview, imageParams);
        } else {
          TextView placeholder = UiKit.text(context, "Görsel\nyok", 10, UiKit.MUTED, Typeface.NORMAL);
          placeholder.setGravity(Gravity.CENTER);
          placeholder.setBackground(UiKit.rounded(context, UiKit.SURFACE_ALT, UiKit.BORDER, 10));
          LinearLayout.LayoutParams imageParams = new LinearLayout.LayoutParams(ui.dp(58), ui.dp(58));
          imageParams.setMargins(0, 0, ui.dp(8), 0);
          resultRow.addView(placeholder, imageParams);
        }
        choice.setMinHeight(ui.dp(62));
        choice.setMinimumHeight(ui.dp(62));
        resultRow.addView(choice, new LinearLayout.LayoutParams(0, -2, 1f));
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(-1, -2);
        rowParams.setMargins(0, 0, 0, ui.dp(7));
        results.addView(resultRow, rowParams);
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
    search.addTextChangedListener(ui.watcher(value -> refresh.run()));
    dialog.setOnShowListener(ignored -> refresh.run());
    dialog.show();
  }

  private String productMeta(OperationData.MarketProduct product) {
    String barcode = product.barcode.isEmpty() ? "" : " · " + product.barcode;
    return "\n" + ui.money(product.salePrice, product.currency) + barcode;
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

  private String productImageKey(String productId, String imageUrl) {
    return (productId == null ? "" : productId) + "|" + (imageUrl == null ? "" : imageUrl);
  }

  void addProductImage(LinearLayout card, OperationData.MarketProduct product) {
    if (product == null || product.imageSourceUrl.isEmpty() || product.dataSource.isEmpty()) return;

    String key = productImageKey(product.id, product.imageSourceUrl);
    Bitmap preview = productImagePreviews.get(key);
    if (preview != null) {
      ImageView image = ui.productImageView(preview, 168);
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, ui.dp(168));
      params.setMargins(0, 0, 0, ui.dp(10));
      image.setLayoutParams(params);
      card.addView(image);
      return;
    }

    if (productImageFailures.contains(key) || !productImageRequests.add(key)) return;
    listener.onProductImageRequested(product.id, product.dataSource, product.imageSourceUrl);
  }

  void addProductSelectionActions(LinearLayout page, String purpose, boolean inventoryOnly) {
    LinearLayout row = UiKit.row(context);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, 0, 0, ui.dp(10));
    row.setLayoutParams(params);
    if (MarketUiRules.canScanBarcode(snapshot.get())) {
      UiKit.addAction(row, UiKit.button(context, "Barkod Tara", UiKit.PRIMARY,
          view -> scan.accept(purpose)), context);
    }
    UiKit.addAction(row, UiKit.outlineButton(context, "Ürün Seç",
        view -> showProductPicker(purpose, inventoryOnly)), context);
    page.addView(row);
  }
}

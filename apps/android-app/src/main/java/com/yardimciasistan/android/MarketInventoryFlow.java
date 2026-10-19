package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Typeface;
import android.text.InputType;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;
import org.json.JSONObject;

/** Physical counts and receiving drafts; canonical validation stays in MarketUiRules. */
final class MarketInventoryFlow {
  private final Context context;
  private final MarketWorkspace.Listener listener;
  private final Supplier<OperationData> snapshot;
  private final MarketFormUi ui;
  private final MarketSubmissionFeedback feedback;
  private final Consumer<String> selectScreen;
  private String stockProductId = "";
  private String stockCountText = "";
  private String stockNote = "";
  private final MarketUiRules.ReceivingDraft receiving = new MarketUiRules.ReceivingDraft();
  private final MarketCatalogBrowser catalog;
  MarketInventoryFlow(Context context, MarketWorkspace.Listener listener, Supplier<OperationData> snapshot, MarketFormUi ui, MarketSubmissionFeedback feedback, Consumer<String> selectScreen, MarketCatalogBrowser catalog) {
    this.context = context; this.listener = listener; this.snapshot = snapshot;
    this.ui = ui; this.feedback = feedback; this.selectScreen = selectScreen;
    this.catalog = catalog;
  }
  void selectStock(OperationData.MarketProduct product) { stockProductId = product.id; }
  LinearLayout stockScreen() {
    LinearLayout page = UiKit.column(context);
    ui.addBackHeader(page, "Stok Say", "Fiziksel miktarı olduğu gibi kaydedin");
    feedback.addPendingState(page);
    feedback.addFormError(page);
    catalog.addProductSelectionActions(page, MarketWorkspace.PURPOSE_STOCK, true);

    OperationData.MarketProduct product = MarketUiRules.productById(snapshot.get(), stockProductId);
    if (product == null || !product.trackInventory) {
      page.addView(UiKit.emptyCard(context, "Ürün seçilmedi", "Barkod okutun veya stok takibine açık bir ürün seçin.", UiKit.MUTED));
      return page;
    }

    LinearLayout productInfo = UiKit.card(context);
    catalog.addProductImage(productInfo, product);
    productInfo.addView(UiKit.text(context, product.name, 17, UiKit.TEXT, Typeface.BOLD));
    productInfo.addView(UiKit.text(
        context,
        "Sistem miktarı: " + ui.quantity(product.currentQuantity) + " " + ui.unitLabel(product.unit),
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

    EditText counted = UiKit.labeledInput(context, page, "Fiziksel miktar", "0");
    counted.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    ui.bind(counted, stockCountText, value -> stockCountText = value);
    EditText note = ui.labeledMultiline(page, "Not (isteğe bağlı)", "Raf / sayım notu");
    ui.bind(note, stockNote, value -> stockNote = value);

    Button save = UiKit.button(context, "Sayımı Kaydet", UiKit.PRIMARY, view -> submitStockCount(product));
    save.setEnabled(!feedback.submissionBlocked());
    ui.sizeButton(save, 52, 4, 0);
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
        feedback.formError = "";
        feedback.visibleMessage = "Sayım gönderim kuyruğuna alındı. Gerçek stok yeni snapshot ile gösterilecek.";
        feedback.visibleMessagePending = true;
        listener.onRenderRequested();
      }
    } catch (MarketUiRules.ValidationException error) {
      feedback.showFormError(error.getMessage());
    }
  }

  LinearLayout receivingScreen() {
    LinearLayout page = UiKit.column(context);
    ui.addBackHeader(page, "Mal Kabul", "Birden çok ürün satırı hazırlayın");
    feedback.addPendingState(page);
    feedback.addFormError(page);

    addSupplierPicker(page);
    catalog.addProductSelectionActions(page, MarketWorkspace.PURPOSE_RECEIVING, true);

    page.addView(UiKit.sectionTitle(context, "Ürün satırları"));
    if (receiving.size() == 0) {
      page.addView(UiKit.emptyCard(context, "Henüz ürün yok", "Barkod okutun veya listeden ürün ekleyin.", UiKit.MUTED));
    } else {
      for (MarketUiRules.ReceivingLine line : receiving.lines()) {
        page.addView(receivingLineCard(line));
      }
    }

    LinearLayout totals = UiKit.card(context);
    ui.addMetric(totals, 0, "Toplam satır", String.valueOf(receiving.size()), UiKit.INFO);
    ui.addMetric(totals, 1, "Tahmini maliyet", ui.money(receiving.total(), receivingCurrency()), UiKit.SUCCESS);
    page.addView(totals);

    EditText note = ui.labeledMultiline(page, "Not (isteğe bağlı)", "Mal kabul notu");
    ui.bind(note, receiving.note, value -> receiving.note = value);

    Button submit = UiKit.button(context, "Mal Kabulü Gönder", UiKit.PRIMARY, view -> confirmReceiving());
    submit.setEnabled(receiving.size() > 0 && !feedback.submissionBlocked());
    ui.sizeButton(submit, 52, 4, 0);
    page.addView(submit);
    return page;
  }

  private void addSupplierPicker(LinearLayout page) {
    if (snapshot.get().market.suppliers.isEmpty()) return;
    ArrayList<SupplierChoice> choices = new ArrayList<>();
    choices.add(new SupplierChoice("", "Tedarikçi seçilmedi"));
    int selected = 0;
    for (OperationData.MarketSupplier supplier : snapshot.get().market.suppliers) {
      if (!supplier.active) continue;
      choices.add(new SupplierChoice(supplier.id, supplier.name));
      if (supplier.id.equals(receiving.supplierId)) selected = choices.size() - 1;
    }
    if (choices.size() <= 1) return;
    UiKit.fieldLabel(context, page, "Tedarikçi (isteğe bağlı)");
    Spinner spinner = new Spinner(context);
    ArrayAdapter<SupplierChoice> adapter = new ArrayAdapter<>(context, android.R.layout.simple_spinner_item, choices);
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    spinner.setAdapter(adapter);
    spinner.setSelection(selected);
    spinner.setBackground(UiKit.rounded(context, UiKit.SURFACE, UiKit.BORDER, 11));
    spinner.setLayoutParams(ui.fieldParams(50));
    spinner.setOnItemSelectedListener(new MarketFormUi.SimpleItemSelectedListener(position -> {
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
        ui.quantity(line.quantity) + " × " + ui.money(line.unitCost, line.currency)
            + " = " + ui.money(line.quantity * line.unitCost, line.currency),
        12,
        UiKit.SECONDARY,
        Typeface.NORMAL
    ));
    LinearLayout actions = UiKit.row(context);
    LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(-1, -2);
    actionParams.setMargins(0, ui.dp(9), 0, 0);
    actions.setLayoutParams(actionParams);
    OperationData.MarketProduct product = MarketUiRules.productById(snapshot.get(), line.productId);
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

  void showReceivingLineDialog(OperationData.MarketProduct product) {
    if (product == null || !product.trackInventory || !MarketUiRules.canReceive(snapshot.get())) return;
    MarketUiRules.ReceivingLine existing = receiving.line(product.id);
    LinearLayout form = ui.dialogForm();
    form.addView(UiKit.text(context, product.name, 16, UiKit.TEXT, Typeface.BOLD));
    EditText quantity = UiKit.labeledInput(context, form, "Miktar", "1");
    quantity.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    quantity.setText(existing == null ? "1" : ui.quantity(existing.quantity));
    EditText unitCost = UiKit.labeledInput(context, form, "Birim alış fiyatı", "0,00");
    unitCost.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    unitCost.setText(existing == null ? "" : ui.quantity(existing.unitCost));
    TextView status = ui.statusText();
    form.addView(status);

    AlertDialog dialog = new AlertDialog.Builder(context)
        .setTitle(existing == null ? "Mal kabule ekle" : "Satırı düzenle")
        .setView(ui.wrapDialog(form))
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton(existing == null ? "Satır Ekle" : "Kaydet", null)
        .create();
    dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
      try {
        receiving.putProduct(product, ui.value(quantity), ui.value(unitCost));
        feedback.formError = "";
        selectScreen.accept(MarketWorkspace.SCREEN_RECEIVING);
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
      feedback.showFormError(error.getMessage());
      return;
    }
    String supplier = supplierName(receiving.supplierId);
    String message = receiving.size() + " ürün satırı\n"
        + "Tahmini maliyet: " + ui.money(receiving.total(), receivingCurrency())
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
            feedback.formError = "";
            feedback.visibleMessage = "Mal kabulü gönderim kuyruğuna alındı.";
            feedback.visibleMessagePending = true;
            listener.onRenderRequested();
          }
        })
        .show();
  }

  private String supplierName(String supplierId) {
    for (OperationData.MarketSupplier supplier : snapshot.get().market.suppliers) {
      if (supplier.id.equals(supplierId)) return supplier.name;
    }
    return "";
  }

  private String receivingCurrency() {
    List<MarketUiRules.ReceivingLine> lines = receiving.lines();
    return lines.isEmpty() ? "TRY" : lines.get(0).currency;
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

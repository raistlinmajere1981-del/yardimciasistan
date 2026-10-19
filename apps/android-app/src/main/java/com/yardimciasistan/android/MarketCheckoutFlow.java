package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Typeface;
import android.text.InputType;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;
import org.json.JSONObject;

/** One cart draft across cart, sale and payment presentation. No optimistic stock/ledger writes. */
final class MarketCheckoutFlow {
  private final Context context;
  private final MarketWorkspace.Listener listener;
  private final Supplier<OperationData> snapshot;
  private final MarketFormUi ui;
  private final MarketSubmissionFeedback feedback;
  private final Consumer<String> selectScreen;
  private String salePaymentChoice = "cash";
  private String saleCustomerId = "";
  private boolean saleExternalConfirmed;
  private final MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft();
  private final MarketCatalogBrowser catalog;
  private final Consumer<String> openScreen;
  MarketCheckoutFlow(Context context, MarketWorkspace.Listener listener, Supplier<OperationData> snapshot, MarketFormUi ui, MarketSubmissionFeedback feedback, Consumer<String> selectScreen, MarketCatalogBrowser catalog, Consumer<String> openScreen) {
    this.context = context; this.listener = listener; this.snapshot = snapshot;
    this.ui = ui; this.feedback = feedback; this.selectScreen = selectScreen;
    this.catalog = catalog; this.openScreen = openScreen;
  }
  void revokeCredit() {
    saleCustomerId = "";
    if ("credit".equals(salePaymentChoice)) salePaymentChoice = "cash";
  }
  LinearLayout cartScreen() {
    LinearLayout page = UiKit.column(context);
    ui.addBackHeader(page, "Sepet", "Ürünleri ve miktarları kontrol edin");
    feedback.addPendingState(page);
    feedback.addFormError(page);
    catalog.addProductSelectionActions(page, MarketWorkspace.PURPOSE_CART, false);

    page.addView(UiKit.sectionTitle(context, "Sepet satırları"));
    if (cart.size() == 0) {
      page.addView(UiKit.emptyCard(context, "Sepet boş", "Barkod okutun veya ürün seçin. Her okutma miktarı 1 artırır.", UiKit.MUTED));
    } else {
      for (MarketUiRules.CartLine line : cart.lines()) {
        page.addView(cartLineCard(line));
      }
    }

    LinearLayout total = UiKit.card(context);
    ui.addMetric(total, 0, "Toplam ürün", String.valueOf(cart.size()), UiKit.INFO);
    ui.addMetric(total, 1, "Tahmini toplam", ui.money(cart.estimatedTotal(), cartCurrency()), UiKit.SUCCESS);
    page.addView(total);

    EditText note = ui.labeledMultiline(page, "Not (isteğe bağlı)", "Masaüstü için sepet notu");
    ui.bind(note, cart.note, value -> cart.note = value);

    if (MarketUiRules.canCompleteSale(snapshot.get())) {
      Button complete = UiKit.button(context, "Satışı Tamamla", UiKit.PRIMARY, view -> openScreen.accept(MarketWorkspace.SCREEN_SALE));
      complete.setEnabled(cart.size() > 0 && !feedback.submissionBlocked());
      ui.sizeButton(complete, 54, 4, 8);
      page.addView(complete);
    }
    if (MarketUiRules.canCreateCartDraft(snapshot.get())) {
    Button send = UiKit.outlineButton(context, "Masaüstüne Sepet Taslağı Gönder", view -> submitCart());
    send.setEnabled(cart.size() > 0 && !feedback.submissionBlocked());
    ui.sizeButton(send, 54, 4, 0);
    page.addView(send);
    }
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
        ui.money(line.quantity * line.unitPrice, line.currency),
        13,
        UiKit.SUCCESS,
        Typeface.BOLD
    ));
    card.addView(header);
    card.addView(UiKit.text(context, ui.money(line.unitPrice, line.currency) + " / " + ui.unitLabel(line.unit), 11, UiKit.MUTED, Typeface.NORMAL));

    LinearLayout controls = UiKit.row(context);
    LinearLayout.LayoutParams controlsParams = new LinearLayout.LayoutParams(-1, -2);
    controlsParams.setMargins(0, ui.dp(9), 0, 0);
    controls.setLayoutParams(controlsParams);
    Button minus = UiKit.outlineButton(context, "−", view -> {
      cart.changeQuantity(line.productId, -1);
      listener.onRenderRequested();
    });
    minus.setContentDescription(line.productName + " miktarını azalt");
    UiKit.addAction(controls, minus, context);
    TextView amount = UiKit.text(context, ui.quantity(line.quantity), 16, UiKit.TEXT, Typeface.BOLD);
    amount.setGravity(Gravity.CENTER);
    amount.setLayoutParams(new LinearLayout.LayoutParams(0, ui.dp(48), 1f));
    controls.addView(amount);
    amount.setOnClickListener(view -> {
      LinearLayout form = UiKit.column(context);
      EditText entered = UiKit.labeledInput(context, form, "Miktar", ui.quantity(line.quantity));
      entered.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
      entered.setText(java.math.BigDecimal.valueOf(line.quantity).stripTrailingZeros().toPlainString().replace('.', ','));
      AlertDialog dialog = new AlertDialog.Builder(context).setTitle(line.productName).setView(form)
          .setNegativeButton("Vazgeç", null).setPositiveButton("Uygula", null).create();
      dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button -> {
        try {
          double requested = Double.parseDouble(ui.value(entered).replace(',', '.'));
          if (!Double.isFinite(requested) || requested <= 0 || requested > 1000000) throw new NumberFormatException();
          cart.changeQuantity(line.productId, requested - line.quantity); dialog.dismiss(); listener.onRenderRequested();
        } catch (NumberFormatException error) { entered.setError("Pozitif miktar girin."); }
      }));
      dialog.show();
    });
    amount.setContentDescription(line.productName + " miktarını düzenle");
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

  void addProductToCart(OperationData.MarketProduct product) {
    try {
      cart.addProduct(product);
      selectScreen.accept(MarketWorkspace.SCREEN_CART);
      feedback.formError = "";
      feedback.visibleMessage = product.name + " sepete eklendi.";
      feedback.visibleMessagePending = false;
      listener.onRenderRequested();
    } catch (MarketUiRules.ValidationException error) {
      feedback.showFormError(error.getMessage());
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
        feedback.formError = "";
        feedback.visibleMessage = "Sepet gönderim kuyruğuna alındı.";
        feedback.visibleMessagePending = true;
        listener.onRenderRequested();
      }
    } catch (MarketUiRules.ValidationException error) {
      feedback.showFormError(error.getMessage());
    }
  }

  LinearLayout saleScreen() {
    LinearLayout page = UiKit.column(context);
    ui.addBackHeader(page, "Satışı Tamamla", "Son kayıt masaüstünde doğrulanır. Telefon ödeme almaz.");
    feedback.addPendingState(page); feedback.addFormError(page);
    page.addView(UiKit.text(context, ui.money(cart.estimatedTotal(), cartCurrency()) + " · " + cart.size() + " ürün", 18, UiKit.TEXT, Typeface.BOLD));
    for (MarketUiRules.CartLine line : cart.lines()) {
      page.addView(UiKit.text(context, line.productName + " · " + ui.quantity(line.quantity) + " × " + ui.money(line.unitPrice, line.currency), 16, UiKit.SECONDARY, Typeface.NORMAL));
    }
    String[] methods = MarketUiRules.canViewCredit(snapshot.get()) ? new String[]{"cash", "card", "bank", "other", "credit"} : new String[]{"cash", "card", "bank", "other"};
    ui.addPaymentPicker(page, salePaymentChoice, methods, choice -> {
      if (!choice.equals(salePaymentChoice)) { salePaymentChoice = choice; saleExternalConfirmed = false; listener.onRenderRequested(); }
    });
    if ("credit".equals(salePaymentChoice)) {
      ArrayList<String> labels = new ArrayList<>(); labels.add("Müşteri seçin");
      int selected = 0;
      for (OperationData.CustomerCreditAccount account : snapshot.get().market.customerCreditAccounts) {
        labels.add(account.fullName); if (account.customerId.equals(saleCustomerId)) selected = labels.size() - 1;
      }
      ui.addChoicePicker(page, "Veresiye müşterisi", labels.toArray(new String[0]), selected, position -> {
        String id = position == 0 ? "" : snapshot.get().market.customerCreditAccounts.get(position - 1).customerId;
        if (!id.equals(saleCustomerId)) { saleCustomerId = id; listener.onRenderRequested(); }
      });
      OperationData.CustomerCreditAccount account = MarketUiRules.creditAccount(snapshot.get(), saleCustomerId);
      if (account != null) for (OperationData.CreditBalance balance : account.balances) page.addView(UiKit.text(context, "Mevcut borç: " + ui.money(balance.amountMinor / 100.0, balance.currency), 16, UiKit.SECONDARY, Typeface.NORMAL));
    } else if ("card".equals(salePaymentChoice)) {
      ui.addExternalConfirmation(page, saleExternalConfirmed, checked -> saleExternalConfirmed = checked);
    }
    Button complete = UiKit.button(context, "Satışı Onayla ve Gönder", UiKit.PRIMARY, view -> {
      try {
        JSONObject payload = cart.toSalePayload(snapshot.get(), "credit".equals(salePaymentChoice) ? "credit" : "paid", saleCustomerId, salePaymentChoice, saleExternalConfirmed);
        String detail = ui.money(cart.estimatedTotal(), cartCurrency()) + " · " + ui.paymentLabel(salePaymentChoice);
        if ("credit".equals(salePaymentChoice)) detail += " · " + MarketUiRules.creditAccount(snapshot.get(), saleCustomerId).fullName + " hesabına borç";
        ui.confirmFinancial("Satış kaydı", detail, feedback::submissionBlocked, () -> {
          if (listener.onSubmit(MarketUiRules.ACTION_SALE, payload, "Masaüstünde onay bekliyor", "Masaüstünde onay bekliyor · işlem telefonda kuyrukta")) {
            cart.clear(); saleCustomerId = ""; salePaymentChoice = "cash"; saleExternalConfirmed = false;
            feedback.lastFinancialActionId = ""; feedback.visibleMessage = "Masaüstünde onay bekliyor"; feedback.visibleMessagePending = true; openScreen.accept(MarketWorkspace.SCREEN_HOME);
          }
        });
      } catch (MarketUiRules.ValidationException error) { feedback.showFormError(error.getMessage()); }
    });
    complete.setEnabled(cart.size() > 0 && !feedback.submissionBlocked()); ui.sizeButton(complete, 54, 8, 0); page.addView(complete);
    return page;
  }

  private String cartCurrency() {
    List<MarketUiRules.CartLine> lines = cart.lines();
    return lines.isEmpty() ? "TRY" : lines.get(0).currency;
  }
}

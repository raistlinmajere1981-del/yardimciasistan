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
  private final SaleConfirmationLifecycle saleLifecycle = new SaleConfirmationLifecycle();
  private AlertDialog saleConfirmation;
  private SalePreviewRequest previewPending;
  private Button previewButton;
  private PointSpendQuoteRequest pointQuotePending;
  private PointSpendQuote pointQuote;
  private Button pointQuoteButton;
  private String pointAmountText = "";
  private String couponCode = "";
  private CouponPermitRequest couponPermitPending;
  private CouponPermit couponPermit;
  private Button couponButton;
  private final MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft();
  private final MarketCatalogBrowser catalog;
  private final Consumer<String> openScreen;
  MarketCheckoutFlow(Context context, MarketWorkspace.Listener listener, Supplier<OperationData> snapshot, MarketFormUi ui, MarketSubmissionFeedback feedback, Consumer<String> selectScreen, MarketCatalogBrowser catalog, Consumer<String> openScreen) {
    this.context = context; this.listener = listener; this.snapshot = snapshot;
    this.ui = ui; this.feedback = feedback; this.selectScreen = selectScreen;
    this.catalog = catalog; this.openScreen = openScreen;
  }
  void revokeCredit() {
    if ("credit".equals(salePaymentChoice)) { invalidateSale(); saleCustomerId = ""; salePaymentChoice = "cash"; }
  }
  void invalidateSale() {
    saleLifecycle.invalidate();
    previewPending = null;
    pointQuotePending = null;
    pointQuote = null;
    couponPermitPending = null;
    couponPermit = null;
    if (couponButton != null) {
      couponButton.setText("Kuponu Doğrula");
      couponButton.setEnabled(cart.size() > 0 && !feedback.submissionBlocked());
      couponButton = null;
    }
    if (pointQuoteButton != null) {
      pointQuoteButton.setText("Puan limitini sorgula");
      pointQuoteButton.setEnabled(cart.size() > 0 && !feedback.submissionBlocked());
      pointQuoteButton = null;
    }
    if (previewButton != null) {
      previewButton.setText("Satışı Onayla ve Gönder");
      previewButton.setEnabled(cart.size() > 0 && !feedback.submissionBlocked());
      previewButton = null;
    }
    AlertDialog previous = saleConfirmation; saleConfirmation = null;
    if (previous != null && previous.isShowing()) previous.dismiss();
  }
  /** Cart, customer or payment changed: the chosen amount no longer belongs to this sale. */
  void invalidatePointChoice() {
    invalidateSale();
    pointAmountText = "";
    couponCode = "";
  }
  long saleGeneration() { return saleLifecycle.generation(); }
  boolean matchesSalePreviewScope(SalePreviewRequest request) {
    if (request == null || !saleCustomerId.equals(request.customer) || !salePaymentChoice.equals(request.payment)
        || "credit".equals(salePaymentChoice) || saleLifecycle.generation() != request.generation
        || !snapshot.get().snapshotUpdatedAt.equals(request.snapshotVersion)
        || MarketUiRules.paidCustomer(snapshot.get(), saleCustomerId) == null) return false;
    try {
      org.json.JSONArray lines = new org.json.JSONArray();
      for (MarketUiRules.CartLine line : cart.lines()) lines.put(new JSONObject().put("productId", line.productId).put("quantity", line.quantity));
      String current = MarketSalePreviewGuard.fingerprint(lines);
      return current != null && current.equals(MarketSalePreviewGuard.fingerprint(request.lines()));
    } catch (Exception ignored) { return false; }
  }
  boolean isSaleConfirmationShowing(long id) {
    return saleLifecycle.isShowing(id) && saleConfirmation != null && saleConfirmation.isShowing();
  }
  void reconcileCustomer() {
    if ("credit".equals(salePaymentChoice) ? MarketUiRules.creditAccount(snapshot.get(), saleCustomerId) == null
        : MarketUiRules.paidCustomer(snapshot.get(), saleCustomerId) == null) {
      if (!saleCustomerId.isEmpty()) invalidatePointChoice();
      saleCustomerId = "";
    }
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
      invalidatePointChoice();
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
          invalidatePointChoice(); cart.changeQuantity(line.productId, requested - line.quantity); dialog.dismiss(); listener.onRenderRequested();
        } catch (NumberFormatException error) { entered.setError("Pozitif miktar girin."); }
      }));
      dialog.show();
    });
    amount.setContentDescription(line.productName + " miktarını düzenle");
    Button plus = UiKit.outlineButton(context, "+", view -> {
      invalidatePointChoice();
      cart.changeQuantity(line.productId, 1);
      listener.onRenderRequested();
    });
    plus.setContentDescription(line.productName + " miktarını artır");
    UiKit.addAction(controls, plus, context);
    Button remove = UiKit.dangerButton(context, "Sil", view -> {
      invalidatePointChoice();
      cart.remove(line.productId);
      listener.onRenderRequested();
    });
    UiKit.addAction(controls, remove, context);
    card.addView(controls);
    return card;
  }

  void addProductToCart(OperationData.MarketProduct product) {
    try {
      cart.addProduct(product); invalidatePointChoice();
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
        invalidatePointChoice(); cart.clear();
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
    reconcileCustomer();
    LinearLayout page = UiKit.column(context);
    ui.addBackHeader(page, "Satışı Tamamla", "Son kayıt masaüstünde doğrulanır. Telefon ödeme almaz.");
    feedback.addPendingState(page); feedback.addFormError(page);
    page.addView(UiKit.text(context, "Tahmini toplam: " + ui.money(cart.estimatedTotal(), cartCurrency()) + " · " + cart.size() + " ürün", 18, UiKit.TEXT, Typeface.BOLD));
    page.addView(UiKit.text(context, "Müşteriye özel fiyat veya eski fiyat masaüstünde reddedilebilir; kesin fiyat masaüstünde doğrulanır.", 13, UiKit.MUTED, Typeface.NORMAL));
    for (MarketUiRules.CartLine line : cart.lines()) {
      page.addView(UiKit.text(context, line.productName + " · " + ui.quantity(line.quantity) + " × " + ui.money(line.unitPrice, line.currency), 16, UiKit.SECONDARY, Typeface.NORMAL));
    }
    String[] methods = MarketUiRules.canViewCredit(snapshot.get()) ? new String[]{"cash", "card", "bank", "other", "credit"} : new String[]{"cash", "card", "bank", "other"};
    ui.addPaymentPicker(page, salePaymentChoice, methods, choice -> {
      if (!choice.equals(salePaymentChoice)) { invalidatePointChoice(); salePaymentChoice = choice; saleCustomerId = ""; saleExternalConfirmed = false; listener.onRenderRequested(); }
    });
    if ("credit".equals(salePaymentChoice)) {
      ArrayList<String> labels = new ArrayList<>(); labels.add("Müşteri seçin");
      int selected = 0;
      for (OperationData.CustomerCreditAccount account : snapshot.get().market.customerCreditAccounts) {
        labels.add(account.fullName); if (account.customerId.equals(saleCustomerId)) selected = labels.size() - 1;
      }
      ui.addSelectionDialog(page, "Veresiye müşterisi", labels.toArray(new String[0]), selected, position -> {
        String id = position == 0 ? "" : snapshot.get().market.customerCreditAccounts.get(position - 1).customerId;
        if (!id.equals(saleCustomerId)) { invalidatePointChoice(); saleCustomerId = id; listener.onRenderRequested(); }
      });
      OperationData.CustomerCreditAccount account = MarketUiRules.creditAccount(snapshot.get(), saleCustomerId);
      if (account != null) for (OperationData.CreditBalance balance : account.balances) page.addView(UiKit.text(context, "Mevcut borç: " + ui.money(balance.amountMinor / 100.0, balance.currency), 16, UiKit.SECONDARY, Typeface.NORMAL));
    } else {
      if (MarketUiRules.canSelectPaidCustomer(snapshot.get())) {
        List<OperationData.CustomerRecord> customers = MarketUiRules.selectablePaidCustomers(snapshot.get());
        String[] labels = MarketUiRules.paidCustomerLabels(customers);
        int selected = MarketUiRules.paidCustomerPosition(customers, saleCustomerId);
        ui.addSelectionDialog(page, "Müşteri (isteğe bağlı)", labels, selected, position -> {
          String selectedId = MarketUiRules.paidCustomerIdAt(snapshot.get(), customers, position);
          if (!selectedId.equals(saleCustomerId)) {
            invalidatePointChoice();
            saleCustomerId = selectedId;
            listener.onRenderRequested();
          }
        });
      }
      if ("card".equals(salePaymentChoice)) ui.addExternalConfirmation(page, saleExternalConfirmed, checked -> { if (saleExternalConfirmed != checked) invalidatePointChoice(); saleExternalConfirmed = checked; });
    }
    if (!"credit".equals(salePaymentChoice) && !saleCustomerId.isEmpty()
        && MarketUiRules.paidCustomer(snapshot.get(), saleCustomerId) != null) {
      if ("cash".equals(salePaymentChoice)) addCouponChoice(page);
      addPointChoice(page);
    }
    Button complete = UiKit.button(context, "Satışı Onayla ve Gönder", UiKit.PRIMARY, view -> {
      if (!"credit".equals(salePaymentChoice) && !saleCustomerId.isEmpty()) {
        long points;
        try { points = MarketUiRules.parsePointAmountMinor(pointAmountText); }
        catch (MarketUiRules.ValidationException error) { feedback.showFormError(error.getMessage()); return; }
        String typedCoupon = couponCode.trim();
        if (!typedCoupon.isEmpty()) {
          if (points > 0) {
            feedback.showFormError("Kupon ile Puan birlikte kullanılamaz. Puan tutarını veya kupon kodunu temizleyin.");
            return;
          }
          if (!"cash".equals(salePaymentChoice)) {
            feedback.showFormError("Kupon yalnız müşterili nakit satışta kullanılabilir.");
            return;
          }
          if (couponPermit == null || !couponPermit.isCurrent()
              || !couponPermit.matches(saleCustomerId, salePaymentChoice, saleLines(), cartCurrency())) {
            couponPermit = null;
            feedback.showFormError("Kupon doğrulanmadı veya izin süresi doldu. Kuponu yeniden doğrulayın; satış tam fiyatla gönderilmez.");
            listener.onRenderRequested();
            return;
          }
          showCouponConfirmation(couponPermit);
          return;
        }
        if (points > 0 && !pointChoiceMatchesCurrent(points)) {
          feedback.showFormError("Puan seçimi sepet, müşteri veya ödemeye bağlı. Önce güncel Puan limitini sorgulayın.");
          return;
        }
        requestCustomerPreview((Button) view, points);
        return;
      }
      try {
        cart.toSalePayload(snapshot.get(), "credit".equals(salePaymentChoice) ? "credit" : "paid", saleCustomerId, salePaymentChoice, saleExternalConfirmed);
        String detail = "Tahmini toplam: " + ui.money(cart.estimatedTotal(), cartCurrency()) + " · " + ui.paymentLabel(salePaymentChoice);
        if ("credit".equals(salePaymentChoice)) detail += " · " + MarketUiRules.creditAccount(snapshot.get(), saleCustomerId).fullName + " hesabına borç";
        final String confirmedCustomer = saleCustomerId, confirmedChoice = salePaymentChoice;
        final boolean confirmedExternal = saleExternalConfirmed;
        invalidateSale();
        long confirmationId = saleLifecycle.open();
        AlertDialog[] confirmationRef = new AlertDialog[1];
        confirmationRef[0] = ui.confirmFinancial("Satış kaydı", detail, feedback::submissionBlocked, () -> saleLifecycle.submit(confirmationId, () -> {
          try {
          if (!confirmedChoice.equals(salePaymentChoice) || !confirmedCustomer.equals(saleCustomerId)) throw new MarketUiRules.ValidationException("Satış seçimi değişti; tekrar onaylayın.");
          JSONObject payload = cart.toSalePayload(snapshot.get(), "credit".equals(confirmedChoice) ? "credit" : "paid", confirmedCustomer, confirmedChoice, confirmedExternal);
          if (listener.onSubmit(MarketUiRules.ACTION_SALE, payload, "Masaüstünde onay bekliyor", "Masaüstünde onay bekliyor · işlem telefonda kuyrukta")) {
            cart.clear(); saleCustomerId = ""; salePaymentChoice = "cash"; saleExternalConfirmed = false;
            feedback.lastFinancialActionId = ""; feedback.visibleMessage = "Masaüstünde onay bekliyor"; feedback.visibleMessagePending = true; openScreen.accept(MarketWorkspace.SCREEN_HOME);
          }
          } catch (MarketUiRules.ValidationException error) { saleCustomerId = ""; feedback.showFormError(error.getMessage()); }
        }), () -> { saleLifecycle.dismiss(confirmationId); if (saleConfirmation == confirmationRef[0]) saleConfirmation = null; });
        saleConfirmation = confirmationRef[0];
      } catch (MarketUiRules.ValidationException error) { feedback.showFormError(error.getMessage()); }
    });
    complete.setEnabled(cart.size() > 0 && !feedback.submissionBlocked() && previewPending == null); ui.sizeButton(complete, 54, 8, 0); page.addView(complete);
    return page;
  }

  private void requestCustomerPreview(Button button, long requestedPointsMinor) {
    if (previewPending != null || feedback.submissionBlocked()) return;
    if (MarketUiRules.paidCustomer(snapshot.get(), saleCustomerId) == null) {
      feedback.showFormError("Güncel yetkili müşteri kaydını seçin."); return;
    }
    final boolean external = saleExternalConfirmed;
    try {
      org.json.JSONArray lines = new org.json.JSONArray();
      for (MarketUiRules.CartLine line : cart.lines()) lines.put(new JSONObject().put("productId", line.productId).put("quantity", line.quantity));
      invalidateSale();
      long id = saleLifecycle.open();
      SalePreviewRequest request = new SalePreviewRequest(saleCustomerId, salePaymentChoice, snapshot.get().snapshotUpdatedAt, id, lines);
      previewPending = request;
      previewButton = button;
      button.setEnabled(false); button.setText("Fiyat sorgulanıyor…");
      listener.onCustomerSalePreviewRequested(request, approval -> {
        if (previewPending != request) return;
        previewPending = null;
        previewButton = null;
        button.setText("Satışı Onayla ve Gönder"); button.setEnabled(!feedback.submissionBlocked() && cart.size() > 0);
        if (!saleLifecycle.isShowing(request.generation) || !matchesSalePreviewScope(request) || external != saleExternalConfirmed) return;
        if (approval == null || !approval.isCurrent()) {
          saleLifecycle.dismiss(request.generation); feedback.showFormError("Canlı satış fiyatı kullanılamıyor."); return;
        }
        try {
          JSONObject preview = approval.preview();
          cart.toSalePayload(snapshot.get(), "paid", request.customer, request.payment, external, preview, requestedPointsMinor);
          if (requestedPointsMinor > 0) requestFreshPointQuote(request, approval, external, requestedPointsMinor, preview);
          else showPaidConfirmation(request, approval, external, 0, null, preview);
        } catch (Exception error) {
          saleLifecycle.dismiss(request.generation); feedback.showFormError("Canlı satış fiyatı kullanılamıyor.");
        }
      });
    } catch (Exception error) { invalidateSale(); feedback.showFormError("Satış önizlemesi hazırlanamadı."); }
  }

  /** The confirm dialog never opens on a stale quote; the amount must match preview, cart and live max. */
  private void requestFreshPointQuote(SalePreviewRequest request, SalePreviewApproval approval, boolean external,
      long requestedPointsMinor, JSONObject preview) {
    try {
      org.json.JSONArray lines = saleLines();
      PointSpendQuoteRequest quoteRequest = new PointSpendQuoteRequest(request.customer, request.payment,
          request.snapshotVersion, request.generation, cartCurrency(), lines);
      listener.onPointSpendQuoteRequested(quoteRequest, quote -> {
        if (!saleLifecycle.isShowing(request.generation) || !matchesSalePreviewScope(request)
            || external != saleExternalConfirmed) return;
        if (quote == null || !quote.isCurrent() || !quote.matches(preview, lines, requestedPointsMinor)) {
          saleLifecycle.dismiss(request.generation);
          feedback.showFormError("Puan limiti doğrulanamadı veya süresi doldu; bağlantıyı ve Puan harcama iznini kontrol edip yeniden deneyin.");
          return;
        }
        pointQuote = quote;
        showPaidConfirmation(request, approval, external, requestedPointsMinor, quote, preview);
      });
    } catch (Exception error) {
      saleLifecycle.dismiss(request.generation); feedback.showFormError("Puan limiti hazırlanamadı.");
    }
  }

  private void showPaidConfirmation(SalePreviewRequest request, SalePreviewApproval approval, boolean external,
      long requestedPointsMinor, PointSpendQuote quote, JSONObject preview) {
    try {
      long subtotal = preview.getLong("subtotalMinor");
      String detail = "Canlı fiyat önizlemesi: " + ui.money(subtotal / 100.0, preview.getString("currency"))
          + " · " + ui.paymentLabel(request.payment)
          + (requestedPointsMinor > 0
              ? "\nPuan: " + ui.money(requestedPointsMinor / 100.0, preview.getString("currency"))
                + " · Kalan nakit: " + ui.money((subtotal - requestedPointsMinor) / 100.0, preview.getString("currency"))
              : "")
          + "\nKesin kayıt masaüstünde doğrulanır.";
      AlertDialog[] dialog = new AlertDialog[1];
      dialog[0] = ui.confirmFinancial("Satış kaydı", detail, feedback::submissionBlocked, () -> {
        if (!isSaleConfirmationShowing(request.generation)) {
          feedback.showFormError("Satış onayı geçerliliğini yitirdi; güncel fiyatı yeniden sorgulayın.");
          return;
        }
        if (!saleLifecycle.submit(request.generation, () -> {
          try {
            if (!approval.isCurrent() || !matchesSalePreviewScope(request) || external != saleExternalConfirmed)
              throw new MarketUiRules.ValidationException("Satış önizlemesi artık geçerli değil.");
            if (requestedPointsMinor > 0 && (quote == null || !quote.isCurrent()
                || !quote.matches(approval.preview(), saleLines(), requestedPointsMinor)))
              throw new MarketUiRules.ValidationException("Puan limiti süresi doldu; yeniden sorgulayın.");
            JSONObject payload = cart.toSalePayload(snapshot.get(), "paid", request.customer, request.payment,
                external, approval.preview(), requestedPointsMinor);
            if (listener.onSubmit(MarketUiRules.ACTION_SALE, payload, "Masaüstünde onay bekliyor", "Masaüstünde onay bekliyor · işlem telefonda kuyrukta")) {
              cart.clear(); saleCustomerId = ""; salePaymentChoice = "cash"; saleExternalConfirmed = false;
              pointAmountText = ""; pointQuote = null;
              feedback.lastFinancialActionId = ""; feedback.visibleMessage = "Masaüstünde onay bekliyor"; feedback.visibleMessagePending = true; openScreen.accept(MarketWorkspace.SCREEN_HOME);
            } else {
              feedback.showFormError("Satış gönderilemedi. Bağlantıyı ve bekleyen işlemleri kontrol edin.");
            }
          } catch (MarketUiRules.ValidationException error) { feedback.showFormError(error.getMessage()); }
        })) feedback.showFormError("Satış onayı artık güncel değil; yeniden deneyin.");
      }, () -> { saleLifecycle.dismiss(request.generation); if (saleConfirmation == dialog[0]) saleConfirmation = null; });
      saleConfirmation = dialog[0];
    } catch (Exception error) {
      saleLifecycle.dismiss(request.generation); feedback.showFormError("Canlı satış fiyatı kullanılamıyor.");
    }
  }

  private void addCouponChoice(LinearLayout page) {
    page.addView(UiKit.sectionTitle(context, "Kupon (isteğe bağlı)"));
    page.addView(UiKit.text(context, "Yalnız müşterili nakit satışta ve Puan kullanmadan. Kod telefonda saklanmaz; masaüstü 60 saniyelik izin üretir.", 12, UiKit.MUTED, Typeface.NORMAL));
    EditText input = UiKit.labeledInput(context, page, "Kupon Kodu", "Personelin bildiği kupon kodu");
    input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
    input.setSaveEnabled(false);
    input.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
    ui.bind(input, couponCode, value -> {
      if (!value.equals(couponCode)) { couponCode = value; couponPermit = null; }
    });
    Button verify = UiKit.outlineButton(context, couponPermit == null ? "Kuponu Doğrula" : "Kuponu Yenile",
        view -> requestCouponPermit((Button) view));
    verify.setEnabled(cart.size() > 0 && !feedback.submissionBlocked() && couponPermitPending == null);
    ui.sizeButton(verify, 48, 0, 0);
    page.addView(verify);
    if (couponPermit != null) {
      page.addView(UiKit.text(context, "Ara toplam: " + ui.money(couponPermit.subtotalMinor() / 100.0, couponPermit.currency())
          + " · Kupon indirimi: −" + ui.money(couponPermit.discountMinor() / 100.0, couponPermit.currency()), 13, UiKit.SECONDARY, Typeface.NORMAL));
      page.addView(UiKit.text(context, "Ödenecek nakit: " + ui.money(couponPermit.payableMinor() / 100.0, couponPermit.currency())
          + " · İzin 60 sn geçerlidir", 14, UiKit.SUCCESS, Typeface.BOLD));
    }
  }

  private void requestCouponPermit(Button button) {
    if (couponPermitPending != null || previewPending != null || feedback.submissionBlocked()) return;
    String code = couponCode.trim();
    if (code.isEmpty()) { feedback.showFormError("Kupon kodu girin veya alanı temizleyin."); return; }
    if (!"cash".equals(salePaymentChoice) || saleCustomerId.isEmpty()
        || MarketUiRules.paidCustomer(snapshot.get(), saleCustomerId) == null) {
      feedback.showFormError("Kupon yalnız güncel müşteri kaydıyla nakit satışta kullanılabilir.");
      return;
    }
    try {
      if (MarketUiRules.parsePointAmountMinor(pointAmountText) > 0) {
        feedback.showFormError("Kupon ile Puan birlikte kullanılamaz. Puan tutarını temizleyin.");
        return;
      }
      org.json.JSONArray lines = saleLines();
      saleLifecycle.invalidate();
      long generation = saleLifecycle.open();
      CouponPermitRequest request = new CouponPermitRequest(ActionOutbox.createActionId(), saleCustomerId,
          salePaymentChoice, snapshot.get().snapshotUpdatedAt, generation, cartCurrency(), lines, code);
      if (!request.isComplete()) throw new MarketUiRules.ValidationException("Kupon isteği geçersiz.");
      couponPermitPending = request;
      couponPermit = null;
      couponButton = button;
      button.setEnabled(false); button.setText("Kupon doğrulanıyor…");
      listener.onCouponPermitRequested(request, permit -> {
        if (couponPermitPending != request) return;
        couponPermitPending = null;
        couponButton = null;
        button.setText("Kuponu Yenile");
        button.setEnabled(!feedback.submissionBlocked() && cart.size() > 0);
        if (!saleLifecycle.isShowing(request.generation) || !matchesCouponScope(request)) {
          feedback.showFormError("Kupon kapsamı değişti; kuponu yeniden doğrulayın.");
          listener.onRenderRequested();
          return;
        }
        if (permit == null || !permit.isCurrent()) {
          couponPermit = null;
          feedback.showFormError("Kupon doğrulanamadı veya izin süresi doldu; kodu kontrol edip yeniden deneyin. Satış tam fiyatla gönderilmez.");
          listener.onRenderRequested();
          return;
        }
        couponPermit = permit;
        listener.onRenderRequested();
      });
    } catch (MarketUiRules.ValidationException error) {
      feedback.showFormError(error.getMessage());
    } catch (Exception error) {
      couponPermitPending = null; couponButton = null;
      feedback.showFormError("Kupon isteği hazırlanamadı.");
    }
  }

  private boolean matchesCouponScope(CouponPermitRequest request) {
    try {
      return request != null && couponCode.trim().equals(request.couponCode)
          && saleCustomerId.equals(request.customer) && "cash".equals(salePaymentChoice)
          && request.payment.equals(salePaymentChoice) && request.generation == saleLifecycle.generation()
          && snapshot.get().snapshotUpdatedAt.equals(request.snapshotVersion)
          && cartCurrency().equals(request.currency)
          && MarketUiRules.paidCustomer(snapshot.get(), saleCustomerId) != null
          && MarketSalePreviewGuard.fingerprint(saleLines()).equals(MarketSalePreviewGuard.fingerprint(request.lines()));
    } catch (Exception error) { return false; }
  }

  private void showCouponConfirmation(CouponPermit permit) {
    try {
      final String customer = saleCustomerId, payment = salePaymentChoice;
      final boolean external = saleExternalConfirmed;
      cart.toCouponSalePayload(snapshot.get(), "paid", customer, payment, external, permit);
      String detail = "Ara toplam: " + ui.money(permit.subtotalMinor() / 100.0, permit.currency())
          + "\nKupon indirimi: −" + ui.money(permit.discountMinor() / 100.0, permit.currency())
          + "\nÖdenecek nakit: " + ui.money(permit.payableMinor() / 100.0, permit.currency())
          + "\nKupon izni 60 saniyelidir; süresi dolarsa yeni kod gerekir.";
      AlertDialog[] dialog = new AlertDialog[1];
      dialog[0] = ui.confirmFinancial("Kuponlu satış", detail, feedback::submissionBlocked, () -> {
        try {
          if (!customer.equals(saleCustomerId) || !payment.equals(salePaymentChoice)
              || external != saleExternalConfirmed || !permit.isCurrent()
              || !permit.matches(saleCustomerId, salePaymentChoice, saleLines(), cartCurrency()))
            throw new MarketUiRules.ValidationException("Kupon izni süresi doldu veya satış değişti; yeni bir kupon kodu girip yeniden doğrulayın.");
          JSONObject fresh = cart.toCouponSalePayload(snapshot.get(), "paid", customer, payment, external, permit);
          if (listener.onSubmitWithActionId(permit.actionId(), MarketUiRules.ACTION_SALE, fresh,
              "Masaüstünde onay bekliyor", "Masaüstünde onay bekliyor · işlem telefonda kuyrukta")) {
            cart.clear(); saleCustomerId = ""; salePaymentChoice = "cash"; saleExternalConfirmed = false;
            pointAmountText = ""; pointQuote = null; clearCouponState();
            feedback.lastFinancialActionId = ""; feedback.visibleMessage = "Masaüstünde onay bekliyor";
            feedback.visibleMessagePending = true; openScreen.accept(MarketWorkspace.SCREEN_HOME);
          } else {
            feedback.showFormError("Kuponlu satış gönderilemedi. Bağlantıyı ve bekleyen işlemleri kontrol edin.");
          }
        } catch (MarketUiRules.ValidationException error) {
          couponPermit = null;
          feedback.showFormError(error.getMessage());
          listener.onRenderRequested();
        }
      }, () -> {
        if (saleConfirmation == dialog[0]) saleConfirmation = null;
        if (permit == couponPermit) {
          clearCouponState();
          listener.onRenderRequested();
        }
      });
      saleConfirmation = dialog[0];
    } catch (MarketUiRules.ValidationException error) {
      feedback.showFormError(error.getMessage());
    }
  }

  private void clearCouponState() {
    couponPermitPending = null;
    couponPermit = null;
    couponCode = "";
    if (couponButton != null) {
      couponButton.setText("Kuponu Doğrula");
      couponButton.setEnabled(cart.size() > 0 && !feedback.submissionBlocked());
      couponButton = null;
    }
  }

  private void addPointChoice(LinearLayout page) {
    page.addView(UiKit.sectionTitle(context, "Puan kullanımı (isteğe bağlı)"));
    page.addView(UiKit.text(context, "Puan yalnızca canlı masaüstü bakiyesi ve fiyatıyla harcanır. Boş veya 0 = normal satış.", 12, UiKit.MUTED, Typeface.NORMAL));
    EditText input = UiKit.labeledInput(context, page, "Kullanılacak Puan", "Örn. 25,00");
    input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    ui.bind(input, pointAmountText, value -> pointAmountText = value);
    Button query = UiKit.outlineButton(context, pointQuote == null ? "Puan limitini sorgula" : "Limiti yenile",
        view -> requestPointQuote((Button) view));
    query.setEnabled(!feedback.submissionBlocked() && pointQuotePending == null);
    ui.sizeButton(query, 48, 0, 0);
    page.addView(query);
    if (pointQuote != null) {
      page.addView(UiKit.text(context, "Kullanılabilir: " + ui.money(pointQuote.availablePointMinor() / 100.0, pointQuote.currency())
          + " · En fazla: " + ui.money(pointQuote.maxSpendableMinor() / 100.0, pointQuote.currency()), 13, UiKit.SECONDARY, Typeface.NORMAL));
      try {
        long requested = MarketUiRules.parsePointAmountMinor(pointAmountText);
        if (requested > pointQuote.maxSpendableMinor())
          page.addView(UiKit.text(context, "Girilen Puan en fazla " + ui.money(pointQuote.maxSpendableMinor() / 100.0, pointQuote.currency()) + " olabilir.", 13, UiKit.DANGER, Typeface.NORMAL));
        else if (requested > 0)
          page.addView(UiKit.text(context, "Kalan nakit: " + ui.money((pointQuote.subtotalMinor() - requested) / 100.0, pointQuote.currency()), 13, UiKit.SUCCESS, Typeface.NORMAL));
      } catch (MarketUiRules.ValidationException error) {
        page.addView(UiKit.text(context, error.getMessage(), 13, UiKit.DANGER, Typeface.NORMAL));
      }
    }
  }

  private void requestPointQuote(Button button) {
    if (pointQuotePending != null || feedback.submissionBlocked()) return;
    if (MarketUiRules.paidCustomer(snapshot.get(), saleCustomerId) == null) {
      feedback.showFormError("Güncel yetkili müşteri kaydını seçin."); return;
    }
    try {
      org.json.JSONArray lines = saleLines();
      pointQuote = null;
      saleLifecycle.invalidate();
      long id = saleLifecycle.open();
      PointSpendQuoteRequest request = new PointSpendQuoteRequest(saleCustomerId, salePaymentChoice,
          snapshot.get().snapshotUpdatedAt, id, cartCurrency(), lines);
      pointQuotePending = request;
      pointQuoteButton = button;
      button.setEnabled(false); button.setText("Puan limiti sorgulanıyor…");
      listener.onPointSpendQuoteRequested(request, quote -> {
        if (pointQuotePending != request) return;
        pointQuotePending = null;
        pointQuoteButton = null;
        button.setText("Limiti yenile"); button.setEnabled(!feedback.submissionBlocked());
        if (!saleLifecycle.isShowing(request.generation) || !matchesPointQuoteScope(request)) return;
        if (quote == null || !quote.isCurrent()) {
          feedback.showFormError("Puan limiti alınamadı. Masaüstü bağlantısını ve bu telefon/müşteri için Puan harcama iznini kontrol edin."); return;
        }
        pointQuote = quote;
        listener.onRenderRequested();
      });
    } catch (Exception error) { pointQuotePending = null; feedback.showFormError("Puan limiti hazırlanamadı."); }
  }

  private boolean matchesPointQuoteScope(PointSpendQuoteRequest request) {
    try {
      return request != null && saleCustomerId.equals(request.customer) && salePaymentChoice.equals(request.payment)
          && !"credit".equals(salePaymentChoice) && saleLifecycle.generation() == request.generation
          && snapshot.get().snapshotUpdatedAt.equals(request.snapshotVersion)
          && MarketUiRules.paidCustomer(snapshot.get(), saleCustomerId) != null
          && cartCurrency().equals(request.currency)
          && MarketSalePreviewGuard.fingerprint(saleLines()).equals(MarketSalePreviewGuard.fingerprint(request.lines()));
    } catch (Exception error) { return false; }
  }

  private boolean pointChoiceMatchesCurrent(long requestedPointsMinor) {
    if (pointQuote == null || requestedPointsMinor <= 0 || !pointQuote.isCurrent()) return false;
    try {
      String current = MarketSalePreviewGuard.fingerprint(saleLines());
      return current != null && current.equals(pointQuote.linesFingerprint())
          && requestedPointsMinor <= pointQuote.maxSpendableMinor()
          && cartCurrency().equals(pointQuote.currency());
    } catch (Exception error) { return false; }
  }

  private org.json.JSONArray saleLines() {
    org.json.JSONArray lines = new org.json.JSONArray();
    try {
      for (MarketUiRules.CartLine line : cart.lines())
        lines.put(new JSONObject().put("productId", line.productId).put("quantity", line.quantity));
    } catch (Exception ignored) { return new org.json.JSONArray(); }
    return lines;
  }

  private String cartCurrency() {
    List<MarketUiRules.CartLine> lines = cart.lines();
    return lines.isEmpty() ? "TRY" : lines.get(0).currency;
  }
}

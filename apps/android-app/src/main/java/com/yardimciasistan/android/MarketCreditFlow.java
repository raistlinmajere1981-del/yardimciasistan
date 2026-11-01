package com.yardimciasistan.android;

import android.content.Context;
import android.graphics.Typeface;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import java.util.ArrayList;
import java.util.Locale;
import java.util.function.Supplier;
import org.json.JSONObject;

/** Credit account projection and collection form draft; balances only come from authorized snapshots. */
final class MarketCreditFlow {
  private final Context context;
  private final MarketWorkspace.Listener listener;
  private final Supplier<OperationData> snapshot;
  private final MarketFormUi ui;
  private final MarketSubmissionFeedback feedback;
  private String creditCustomerId = "";
  private String creditSearch = "";
  private String creditCurrency = "";
  private String creditAmountText = "";
  private String creditPaymentMethod = "cash";
  private boolean creditExternalConfirmed;

  MarketCreditFlow(Context context, MarketWorkspace.Listener listener, Supplier<OperationData> snapshot, MarketFormUi ui, MarketSubmissionFeedback feedback) {
    this.context = context; this.listener = listener; this.snapshot = snapshot;
    this.ui = ui; this.feedback = feedback;
  }
  void revokeCredit() { creditCustomerId = ""; creditSearch = ""; }
  boolean backToList() {
    if (creditCustomerId.isEmpty()) return false;
    creditCustomerId = "";
    return true;
  }
  LinearLayout creditScreen() {
    LinearLayout page = UiKit.column(context);
    ui.addBackHeader(page, "Veresiye / Cari", "Son yetkili snapshot · güncel borcu masaüstü doğrular");
    feedback.addPendingState(page); feedback.addFormError(page);
    OperationData.CustomerCreditAccount account = MarketUiRules.creditAccount(snapshot.get(), creditCustomerId);
    if (account == null) {
      EditText search = UiKit.labeledInput(context, page, "Müşteri ara", "Müşteri adı");
      ui.bind(search, creditSearch, value -> creditSearch = value);
      LinearLayout rows = UiKit.column(context); page.addView(rows);
      Runnable populate = () -> {
        rows.removeAllViews();
        for (OperationData.CustomerCreditAccount item : snapshot.get().market.customerCreditAccounts) {
          if (!item.fullName.toLowerCase(new Locale("tr", "TR")).contains(creditSearch.toLowerCase(new Locale("tr", "TR")))) continue;
          Button open = UiKit.outlineButton(context, item.fullName, view -> {
            creditCustomerId = item.customerId; creditCurrency = ""; creditAmountText = ""; creditExternalConfirmed = false; listener.onRenderRequested();
          });
          ui.sizeButton(open, 54, 0, 8); rows.addView(open);
        }
        if (rows.getChildCount() == 0) rows.addView(UiKit.emptyCard(context, "Müşteri bulunamadı", "Yetkili müşteri listesini yenileyin.", UiKit.MUTED));
      };
      search.addTextChangedListener(new TextWatcher() {
        @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
        @Override public void onTextChanged(CharSequence s, int start, int before, int count) { creditSearch = s.toString(); populate.run(); }
        @Override public void afterTextChanged(Editable e) {}
      });
      populate.run(); return page;
    }
    Button customers = UiKit.outlineButton(context, "Müşteri Listesine Dön", view -> { creditCustomerId = ""; listener.onRenderRequested(); });
    ui.sizeButton(customers, 48, 0, 8); page.addView(customers);
    page.addView(UiKit.text(context, account.fullName, 20, UiKit.TEXT, Typeface.BOLD));
    ArrayList<OperationData.CreditBalance> debts = new ArrayList<>();
    for (OperationData.CreditBalance balance : account.balances) {
      page.addView(UiKit.text(context, "Borç: " + ui.money(balance.amountMinor / 100.0, balance.currency), 18, UiKit.TEXT, Typeface.BOLD));
      if (balance.amountMinor > 0) debts.add(balance);
    }
    if (account.balances.isEmpty()) page.addView(UiKit.text(context, "Açık borç yok", 16, UiKit.SECONDARY, Typeface.NORMAL));
    page.addView(UiKit.sectionTitle(context, "Son hareketler"));
    for (OperationData.CreditMovement entry : account.entries) {
      String kind = "payment".equals(entry.entryType) ? "Tahsilat" : "credit_sale".equals(entry.entryType) ? "Veresiye satış" : "Düzeltme";
      page.addView(UiKit.text(context, ui.shortTime(entry.occurredAt) + " · " + kind + " · " + ("debit".equals(entry.direction) ? "+" : "−")
          + ui.money(entry.amountMinor / 100.0, entry.currency), 16, UiKit.SECONDARY, Typeface.NORMAL));
    }
    if (!MarketUiRules.canPayCredit(snapshot.get()) || debts.isEmpty()) return page;
    int selected = 0; String[] currencies = new String[debts.size()];
    for (int i = 0; i < debts.size(); i++) { currencies[i] = debts.get(i).currency; if (currencies[i].equals(creditCurrency)) selected = i; }
    creditCurrency = currencies[selected];
    ui.addSelectionDialog(page, "Tahsilat para birimi", currencies, selected, position -> creditCurrency = currencies[position]);
    EditText amount = UiKit.labeledInput(context, page, "Tahsilat tutarı", "0,00");
    amount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    ui.bind(amount, creditAmountText, value -> creditAmountText = value);
    ui.addPaymentPicker(page, creditPaymentMethod, new String[]{"cash", "card", "bank", "other"}, choice -> {
      if (!choice.equals(creditPaymentMethod)) { creditPaymentMethod = choice; creditExternalConfirmed = false; listener.onRenderRequested(); }
    });
    if ("card".equals(creditPaymentMethod)) ui.addExternalConfirmation(page, creditExternalConfirmed, checked -> creditExternalConfirmed = checked);
    Button pay = UiKit.button(context, "Tahsilatı Kaydet", UiKit.PRIMARY, view -> {
      try {
        JSONObject payload = MarketUiRules.creditPaymentPayload(snapshot.get(), creditCustomerId, creditCurrency, creditAmountText, creditPaymentMethod, creditExternalConfirmed);
        ui.confirmFinancial("Alınmış tahsilatı kaydet", account.fullName + " · " + ui.money(payload.optLong("amount_minor") / 100.0, creditCurrency) + " · " + ui.paymentLabel(creditPaymentMethod), feedback::submissionBlocked, () -> {
          if (listener.onSubmit(MarketUiRules.ACTION_CREDIT_PAYMENT, payload, "Masaüstünde onay bekliyor", "Masaüstünde onay bekliyor · tahsilat telefonda kuyrukta")) {
            creditAmountText = ""; creditExternalConfirmed = false; feedback.lastFinancialActionId = ""; feedback.visibleMessage = "Masaüstünde onay bekliyor"; feedback.visibleMessagePending = true; listener.onRenderRequested();
          }
        });
      } catch (MarketUiRules.ValidationException error) { feedback.showFormError(error.getMessage()); }
    });
    pay.setEnabled(!feedback.submissionBlocked()); ui.sizeButton(pay, 54, 8, 0); page.addView(pay);
    return page;
  }
}

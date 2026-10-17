package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Typeface;
import android.text.InputType;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import org.json.JSONObject;
import org.json.JSONException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Currency;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

final class RoomFolioWorkspace {
  interface Listener {
    void onAction(String actionType, JSONObject payload, String successMessage);
  }

  private RoomFolioWorkspace() {}

  static void append(Context context, LinearLayout page, OperationData data, Listener listener) {
    int openCount = 0;
    Map<String, Long> remainingByCurrency = new LinkedHashMap<>();
    for (OperationData.RoomFolioRecord folio : data.roomFolios) {
      if (!folio.isOpen()) continue;
      openCount += 1;
      remainingByCurrency.put(folio.currency, remainingByCurrency.getOrDefault(folio.currency, 0L) + Math.max(0L, folio.remainingMinor));
    }

    // V16: each independently denominated balance gets its own tile;
    // never combine different currencies into one amount.
    ArrayList<View> summary = new ArrayList<>();
    summary.add(UiKit.metricCard(context, "Açık hesap", openCount, UiKit.INFO, null));
    for (Map.Entry<String, Long> remaining : remainingByCurrency.entrySet()) {
      summary.add(UiKit.metricCard(context, "Bekleyen · " + remaining.getKey(),
          money(remaining.getValue(), remaining.getKey()),
          remaining.getValue() > 0 ? UiKit.WARNING : UiKit.SUCCESS, null));
    }
    page.addView(UiKit.metricGrid(context, summary));

    if (openCount == 0) {
      LinearLayout empty = UiKit.card(context);
      empty.addView(UiKit.text(context, "Açık oda hesabı yok", 14, UiKit.TEXT, Typeface.BOLD));
      empty.addView(UiKit.text(
          context,
          "Giriş yapılmış ve oda hesabı açılmış konaklamalar burada görünür.",
          12,
          UiKit.MUTED,
          Typeface.NORMAL
      ));
      page.addView(empty);
      return;
    }

    NativeSearchList search = new NativeSearchList(context, "Müşteri veya oda ara");
    LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(-1, -2);
    searchParams.setMargins(0, dp(context, 4), 0, dp(context, 12));
    page.addView(search.input(), searchParams);
    for (OperationData.RoomFolioRecord folio : data.roomFolios) {
      if (!folio.isOpen()) continue;
      View card = folioCard(context, data, folio, listener);
      page.addView(card);
      search.add(card, folio.customerName + " " + folio.roomName + " "
          + folio.roomNumber + " " + folio.currency + " "
          + folio.checkInDate + " " + folio.plannedCheckOutDate);
    }
    TextView noMatches = UiKit.text(context, "Aramayla eşleşen açık hesap yok.",
        13, UiKit.MUTED, Typeface.NORMAL);
    page.addView(noMatches);
    search.setNoMatchesNotice(noMatches);

    TextView note = UiKit.text(
        context,
        "Eklenen kalemler masaüstü onayından sonra hesaba yansır. Fiyat, indirim ve ödeme düzeltmeleri masaüstünde yapılır.",
        11,
        UiKit.MUTED,
        Typeface.NORMAL
    );
    page.addView(note);
  }

  private static LinearLayout folioCard(
      Context context,
      OperationData data,
      OperationData.RoomFolioRecord folio,
      Listener listener
  ) {
    LinearLayout card = UiKit.card(context);
    LinearLayout top = UiKit.row(context);
    TextView title = UiKit.text(
        context,
        folio.customerName.isEmpty() ? "Misafir" : folio.customerName,
        15,
        UiKit.TEXT,
        Typeface.BOLD
    );
    title.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(title);
    top.addView(UiKit.badge(context,
        folio.remainingMinor > 0 ? "Tahsilat bekliyor" : "Ödendi",
        folio.remainingMinor > 0 ? UiKit.WARNING : UiKit.SUCCESS));
    card.addView(top);

    String room = folio.roomNumber.isEmpty() ? folio.roomName : folio.roomName + " · " + folio.roomNumber;
    card.addView(UiKit.text(context, room, 13, UiKit.SECONDARY, Typeface.BOLD));
    card.addView(UiKit.text(
        context,
        dateRange(folio.checkInDate, folio.plannedCheckOutDate) + " · " + Math.max(1, folio.nights) + " gece",
        11,
        UiKit.MUTED,
        Typeface.NORMAL
    ));

    LinearLayout totals = UiKit.column(context);
    totals.setPadding(0, dp(context, 9), 0, dp(context, 2));
    totals.addView(amountLine(context, "Toplam", money(folio.chargeTotalMinor, folio.currency), UiKit.TEXT));
    totals.addView(amountLine(context, "Alınan", money(folio.paidTotalMinor, folio.currency), UiKit.SECONDARY));
    totals.addView(amountLine(context, "Kalan", money(folio.remainingMinor, folio.currency),
        folio.remainingMinor > 0 ? UiKit.WARNING : UiKit.SUCCESS));
    card.addView(totals);

    LinearLayout additions = UiKit.row(context);
    if (canAddMenuItems(data, folio)) {
      UiKit.addAction(additions, UiKit.outlineButton(context, "Menü Ekle",
          view -> showMenuItemDialog(context, data, folio, listener)), context);
    }
    if (canAddManualCharge(data, folio)) {
      UiKit.addAction(additions, UiKit.outlineButton(context, "Ek Ücret",
          view -> showManualChargeDialog(context, folio, listener)), context);
    }
    if (additions.getChildCount() > 0) {
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
      params.setMargins(0, dp(context, 10), 0, 0);
      card.addView(additions, params);
    }

    if (data.hasPermission("room_folio.payment") && folio.remainingMinor > 0) {
      Button payment = UiKit.button(context, "Ödeme Al", UiKit.PRIMARY, view -> showPaymentDialog(context, folio, listener));
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(context, 46));
      params.setMargins(0, dp(context, 10), 0, 0);
      payment.setLayoutParams(params);
      card.addView(payment);
    }

    if (data.hasPermission("room_folio.checkout")) {
      if (folio.remainingMinor == 0) {
        Button checkout = UiKit.outlineButton(context, "Çıkış ve Hesabı Kapat",
            view -> confirmCheckout(context, folio, listener));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(context, 46));
        params.setMargins(0, dp(context, 8), 0, 0);
        checkout.setLayoutParams(params);
        card.addView(checkout);
      } else {
        TextView blocked = UiKit.text(
            context,
            "Çıkış için önce kalan tutarı tahsil edin.",
            11,
            UiKit.WARNING,
            Typeface.BOLD
        );
        blocked.setPadding(0, dp(context, 8), 0, 0);
        card.addView(blocked);
      }
    }
    return card;
  }

  private static View amountLine(Context context, String label, String amount, int tone) {
    LinearLayout row = UiKit.row(context);
    TextView name = UiKit.text(context, label, 12, UiKit.SECONDARY, Typeface.NORMAL);
    row.addView(name, new LinearLayout.LayoutParams(0, -2, 1f));
    row.addView(UiKit.text(context, amount, 13, tone, Typeface.BOLD));
    LinearLayout.LayoutParams spacing = new LinearLayout.LayoutParams(-1, -2);
    spacing.setMargins(0, dp(context, 3), 0, dp(context, 3));
    row.setLayoutParams(spacing);
    return row;
  }

  static boolean canAddMenuItems(OperationData data, OperationData.RoomFolioRecord folio) {
    return canAddManualChargeContext(data, folio) && data.hasPermission("room_folio.add_menu_item")
        && data.hasPermission("menu.view");
  }

  static boolean canAddManualCharge(OperationData data, OperationData.RoomFolioRecord folio) {
    return canAddManualChargeContext(data, folio) && data.hasPermission("room_folio.add_manual_charge");
  }

  private static boolean canAddManualChargeContext(OperationData data, OperationData.RoomFolioRecord folio) {
    return data != null && data.hasPermission("room_folio.view") && folio != null && folio.isOpen()
        && folio.canAddItems && folio.version.matches("[a-f0-9]{64}");
  }

  static JSONObject menuChargePayload(OperationData.RoomFolioRecord folio, OperationData.MenuItem item, int quantity) throws JSONException {
    JSONObject payload = chargePayload(folio);
    if (item == null || item.id.isEmpty() || !item.available || !item.productActive || item.updatedAt.isEmpty()) {
      throw new IllegalArgumentException("Güncel ve satışa açık bir menü ürünü seçin.");
    }
    if (!folio.currency.equalsIgnoreCase(item.currency)) throw new IllegalArgumentException("Ürünün para birimi oda hesabıyla aynı olmalı.");
    if (quantity <= 0 || quantity > 1000) throw new IllegalArgumentException("Adet 1 ile 1000 arasında olmalı.");
    if (!Double.isFinite(item.price) || item.price < 0) throw new IllegalArgumentException("Ürünün fiyatı geçersiz.");
    long priceMinor;
    try { priceMinor = BigDecimal.valueOf(item.price).movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact(); }
    catch (ArithmeticException error) { throw new IllegalArgumentException("Ürünün fiyatı geçersiz."); }
    if (priceMinor > 9007199254740991L / quantity) throw new IllegalArgumentException("Kalem tutarı çok büyük.");
    if (item.stockQuantity != null && item.stockQuantity + 0.0000001 < item.stockConsumptionQuantity * quantity) {
      throw new IllegalArgumentException("Seçilen adet için yeterli stok yok.");
    }
    return payload.put("menu_entry_id", item.id).put("quantity", quantity)
        .put("expected_menu_updated_at", item.updatedAt).put("expected_unit_price_minor", priceMinor)
        .put("expected_currency", item.currency.toUpperCase(Locale.ROOT));
  }

  static JSONObject manualChargePayload(OperationData.RoomFolioRecord folio, String label, long amountMinor, String note) throws JSONException {
    JSONObject payload = chargePayload(folio);
    String cleanLabel = label == null ? "" : label.trim().replaceAll("\\s+", " ");
    String cleanNote = note == null ? "" : note.trim();
    if (cleanLabel.isEmpty() || cleanLabel.length() > 120) throw new IllegalArgumentException("Ek ücret adı 1 ile 120 karakter arasında olmalı.");
    if (amountMinor <= 0 || amountMinor > 999999999999L) throw new IllegalArgumentException("Geçerli bir pozitif tutar girin.");
    if (cleanNote.length() > 500) throw new IllegalArgumentException("Not en fazla 500 karakter olabilir.");
    return payload.put("label", cleanLabel).put("amount_minor", amountMinor).put("note", cleanNote);
  }

  private static JSONObject chargePayload(OperationData.RoomFolioRecord folio) throws JSONException {
    if (folio == null || folio.id.isEmpty() || !folio.isOpen() || !folio.canAddItems || !folio.version.matches("[a-f0-9]{64}")) {
      throw new IllegalArgumentException("Kalem eklemek için güncel ve devam eden bir konaklamanın hesabını seçin.");
    }
    return new JSONObject().put("folio_id", folio.id).put("expected_folio_version", folio.version);
  }

  private static void showMenuItemDialog(Context context, OperationData data, OperationData.RoomFolioRecord folio, Listener listener) {
    List<MenuChoice> choices = new ArrayList<>();
    for (OperationData.MenuItem item : data.menuItems) {
      boolean activeCategory = false;
      String categoryName = "Menü";
      for (OperationData.MenuCategory category : data.categories) {
        if (category.id.equals(item.categoryId) && category.active) {
          activeCategory = true;
          if (!category.name.trim().isEmpty()) categoryName = category.name;
        }
      }
      if (activeCategory && item.available && item.productActive
          && folio.currency.equalsIgnoreCase(item.currency) && !item.outOfStock()) {
        choices.add(new MenuChoice(item, categoryName));
      }
    }
    if (choices.isEmpty()) {
      new AlertDialog.Builder(context).setTitle("Menü ürünü ekle")
          .setMessage("Bu hesap için uygun menü ürünü yok. Güncel veriyi çekip menü ve stok durumunu kontrol edin.")
          .setPositiveButton("Tamam", null).show();
      return;
    }
    LinearLayout form = UiKit.column(context);
    form.setPadding(dp(context, 16), dp(context, 12), dp(context, 16), dp(context, 12));
    EditText productSearch = UiKit.input(context, "Ürün veya kategori ara");
    addField(context, form, "Menüde ara", productSearch);
    Spinner product = new Spinner(context);
    ArrayAdapter<MenuChoice> adapter = new ArrayAdapter<>(context,
        android.R.layout.simple_spinner_item, new ArrayList<>(choices));
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    product.setAdapter(adapter);
    addField(context, form, "Menü ürünü · " + folio.currency, product);
    TextView found = UiKit.text(context, choices.size() + " uygun ürün", 12,
        UiKit.MUTED, Typeface.NORMAL);
    form.addView(found);
    productSearch.addTextChangedListener(new android.text.TextWatcher() {
      @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
      @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
        adapter.clear();
        for (MenuChoice choice : choices) {
          if (NativeSearchList.matches(s.toString(), choice.searchText()))
            adapter.add(choice);
        }
        adapter.notifyDataSetChanged();
        found.setText(adapter.getCount() == 0 ? "Eşleşen ürün yok."
            : adapter.getCount() + " uygun ürün");
      }
      @Override public void afterTextChanged(android.text.Editable s) {}
    });
    EditText quantity = new EditText(context);
    quantity.setSingleLine(true);
    quantity.setInputType(InputType.TYPE_CLASS_NUMBER);
    quantity.setText("1");
    addField(context, form, "Adet", quantity);
    TextView status = UiKit.text(context, "", 12, UiKit.DANGER, Typeface.BOLD);
    form.addView(status);
    AlertDialog dialog = new AlertDialog.Builder(context).setTitle("Menü ürünü ekle")
        .setView(UiKit.scroll(context, form)).setNegativeButton("Vazgeç", null).setPositiveButton("Odaya Ekle", null).create();
    dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
      try {
        if (!(product.getSelectedItem() instanceof MenuChoice)) {
          status.setText("Önce uygun bir menü ürünü seçin.");
          return;
        }
        int count = Integer.parseInt(quantity.getText().toString().trim());
        JSONObject payload = menuChargePayload(folio, ((MenuChoice) product.getSelectedItem()).item, count);
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
        dialog.dismiss();
        listener.onAction("room_folio_menu_item_add", payload, "Menü ürünü ekleme işlemi gönderildi; masaüstü onayı bekleniyor.");
      } catch (NumberFormatException error) { status.setText("Adet 1 ile 1000 arasında olmalı."); }
      catch (IllegalArgumentException error) { status.setText(error.getMessage()); }
      catch (JSONException error) { status.setText("Menü ürünü bilgileri hazırlanamadı."); }
    }));
    dialog.show();
  }

  private static void showManualChargeDialog(Context context, OperationData.RoomFolioRecord folio, Listener listener) {
    LinearLayout form = UiKit.column(context);
    form.setPadding(dp(context, 16), dp(context, 12), dp(context, 16), dp(context, 12));
    EditText label = new EditText(context);
    label.setSingleLine(true);
    addField(context, form, "Ek ücret adı", label);
    EditText amount = new EditText(context);
    amount.setSingleLine(true);
    amount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    addField(context, form, "Tutar (" + folio.currency + ")", amount);
    EditText note = new EditText(context);
    note.setSingleLine(true);
    addField(context, form, "Not (isteğe bağlı)", note);
    TextView status = UiKit.text(context, "", 12, UiKit.DANGER, Typeface.BOLD);
    form.addView(status);
    AlertDialog dialog = new AlertDialog.Builder(context).setTitle("Ek ücret ekle")
        .setView(UiKit.scroll(context, form)).setNegativeButton("Vazgeç", null).setPositiveButton("Odaya Ekle", null).create();
    dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
      try {
        JSONObject payload = manualChargePayload(folio, label.getText().toString(),
            FinanceWorkspace.parseAmountMinor(amount.getText().toString()), note.getText().toString());
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
        dialog.dismiss();
        listener.onAction("room_folio_manual_charge_add", payload, "Ek ücret ekleme işlemi gönderildi; masaüstü onayı bekleniyor.");
      } catch (IllegalArgumentException error) { status.setText(error.getMessage()); }
      catch (JSONException error) { status.setText("Ek ücret bilgileri hazırlanamadı."); }
    }));
    dialog.show();
  }

  private static final class MenuChoice {
    final OperationData.MenuItem item;
    final String category;
    MenuChoice(OperationData.MenuItem item, String category) {
      this.item = item;
      this.category = category;
    }
    String searchText() { return category + " " + item.name + " " + item.description; }
    @Override public String toString() {
      return category + " · " + item.name + " · "
          + money(Math.round(item.price * 100), item.currency);
    }
  }

  private static void showPaymentDialog(Context context, OperationData.RoomFolioRecord folio, Listener listener) {
    LinearLayout form = new LinearLayout(context);
    form.setOrientation(LinearLayout.VERTICAL);
    int padding = dp(context, 16);
    form.setPadding(padding, padding, padding, padding);

    addLabel(context, form, "Kalan tutar");
    TextView remaining = UiKit.text(context, money(folio.remainingMinor, folio.currency), 15, UiKit.WARNING, Typeface.BOLD);
    form.addView(remaining);

    addLabel(context, form, "Alınan tutar (" + folio.currency + ")");
    EditText amount = new EditText(context);
    amount.setSingleLine(true);
    amount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    amount.setText(String.format(Locale.US, "%.2f", folio.remainingMinor / 100d));
    form.addView(amount);

    addLabel(context, form, "Ödeme şekli");
    Spinner method = new Spinner(context);
    PaymentChoice[] choices = {
        new PaymentChoice("Nakit", "cash"),
        new PaymentChoice("Kart", "card"),
        new PaymentChoice("Banka / Havale", "bank"),
        new PaymentChoice("Diğer", "other")
    };
    ArrayAdapter<PaymentChoice> adapter = new ArrayAdapter<>(context, android.R.layout.simple_spinner_item, choices);
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    method.setAdapter(adapter);
    form.addView(method);

    addLabel(context, form, "Not (isteğe bağlı)");
    EditText note = new EditText(context);
    note.setSingleLine(true);
    form.addView(note);

    TextView status = UiKit.text(context, "", 12, UiKit.DANGER, Typeface.BOLD);
    form.addView(status);
    ScrollView scroll = new ScrollView(context);
    scroll.addView(form);

    AlertDialog dialog = new AlertDialog.Builder(context)
        .setTitle("Oda tahsilatı")
        .setView(scroll)
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton("Ödemeyi Kaydet", null)
        .create();
    dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
      long amountMinor = FinanceWorkspace.parseAmountMinor(amount.getText().toString());
      if (amountMinor <= 0) {
        status.setText("Geçerli bir tutar girin.");
        return;
      }
      if (amountMinor > folio.remainingMinor) {
        status.setText("Ödeme kalan tutardan büyük olamaz.");
        return;
      }
      String noteValue = note.getText().toString().trim().replaceAll("\\s+", " ");
      if (noteValue.length() > 500) {
        status.setText("Not en fazla 500 karakter olabilir.");
        return;
      }
      PaymentChoice selected = (PaymentChoice) method.getSelectedItem();
      JSONObject payload = new JSONObject();
      try {
        payload.put("folio_id", folio.id);
        payload.put("amount_minor", amountMinor);
        payload.put("expected_remaining_minor", folio.remainingMinor);
        payload.put("payment_method", selected.value);
        payload.put("note", noteValue);
      } catch (Exception error) {
        status.setText("Tahsilat bilgileri hazırlanamadı.");
        return;
      }
      dialog.dismiss();
      listener.onAction("room_folio_payment_add", payload, "Oda tahsilatı gönderildi.");
    }));
    dialog.show();
  }

  private static void confirmCheckout(Context context, OperationData.RoomFolioRecord folio, Listener listener) {
    new AlertDialog.Builder(context)
        .setTitle("Çıkış ve hesabı kapat")
        .setMessage((folio.customerName.isEmpty() ? "Misafirin" : folio.customerName + " adlı misafirin")
            + " oda hesabı ödenmiş görünüyor. Konaklama kapatılıp oda boş olarak işaretlensin mi?")
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton("Çıkışı Tamamla", (dialog, which) -> {
          JSONObject payload = new JSONObject();
          try {
            payload.put("folio_id", folio.id);
            payload.put("expected_remaining_minor", folio.remainingMinor);
          } catch (Exception ignored) {
            return;
          }
          listener.onAction("room_folio_checkout", payload, "Çıkış işlemi gönderildi.");
        })
        .show();
  }

  private static void addField(Context context, LinearLayout form, String label, View field) {
    field.setId(View.generateViewId());
    addLabel(context, form, label).setLabelFor(field.getId());
    form.addView(field);
  }

  private static TextView addLabel(Context context, LinearLayout form, String label) {
    TextView text = UiKit.text(context, label, 12, UiKit.MUTED, Typeface.BOLD);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, dp(context, 9), 0, dp(context, 3));
    text.setLayoutParams(params);
    form.addView(text);
    return text;
  }

  private static String money(long minor, String currency) {
    NumberFormat format = NumberFormat.getCurrencyInstance(new Locale("tr", "TR"));
    BigDecimal amount = BigDecimal.valueOf(Math.max(0L, minor), 2);
    try { format.setCurrency(Currency.getInstance(currency)); }
    catch (IllegalArgumentException error) { return amount.toPlainString() + " " + currency; }
    format.setMinimumFractionDigits(2);
    format.setMaximumFractionDigits(2);
    return format.format(amount);
  }

  private static String dateRange(String start, String end) {
    String left = start == null ? "" : start.trim();
    String right = end == null ? "" : end.trim();
    if (left.isEmpty() && right.isEmpty()) return "Tarih yok";
    if (right.isEmpty() || left.equals(right)) return left;
    return left + " → " + right;
  }

  private static int dp(Context context, int value) {
    return Math.round(value * context.getResources().getDisplayMetrics().density);
  }

  private static final class PaymentChoice {
    final String label;
    final String value;

    PaymentChoice(String label, String value) {
      this.label = label;
      this.value = value;
    }

    @Override
    public String toString() {
      return label;
    }
  }
}

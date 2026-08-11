package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Typeface;
import android.text.InputType;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import org.json.JSONObject;

import java.text.NumberFormat;
import java.util.Locale;

final class RoomFolioWorkspace {
  interface Listener {
    void onAction(String actionType, JSONObject payload, String successMessage);
  }

  private RoomFolioWorkspace() {}

  static ScrollView create(Context context, OperationData data, Listener listener) {
    LinearLayout page = UiKit.column(context);
    append(context, page, data, listener);
    return UiKit.scroll(context, page);
  }

  static void append(Context context, LinearLayout page, OperationData data, Listener listener) {
    int openCount = 0;
    long totalRemaining = 0L;
    for (OperationData.RoomFolioRecord folio : data.roomFolios) {
      if (!folio.isOpen()) continue;
      openCount += 1;
      totalRemaining += Math.max(0L, folio.remainingMinor);
    }

    LinearLayout summary = UiKit.card(context);
    summary.addView(UiKit.text(context, "Oda Hesapları", 16, UiKit.TEXT, Typeface.BOLD));
    summary.addView(line(context, "Açık hesap", String.valueOf(openCount), UiKit.INFO));
    summary.addView(line(context, "Bekleyen tahsilat", money(totalRemaining), totalRemaining > 0 ? UiKit.WARNING : UiKit.SUCCESS));
    page.addView(summary);

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

    for (OperationData.RoomFolioRecord folio : data.roomFolios) {
      if (folio.isOpen()) {
        page.addView(folioCard(context, data, folio, listener));
      }
    }

    TextView note = UiKit.text(
        context,
        "Fiyat, indirim, ek harcama ve ödeme düzeltmeleri masaüstü Pansiyon > Oda Hesabı ve Tahsilat alanında yapılır.",
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
    top.addView(UiKit.text(
        context,
        folio.remainingMinor > 0 ? money(folio.remainingMinor) : "Ödendi",
        13,
        folio.remainingMinor > 0 ? UiKit.WARNING : UiKit.SUCCESS,
        Typeface.BOLD
    ));
    card.addView(top);

    String room = folio.roomNumber.isEmpty() ? folio.roomName : folio.roomName + " · " + folio.roomNumber;
    card.addView(UiKit.text(context, room, 12, UiKit.MUTED, Typeface.BOLD));
    card.addView(UiKit.text(
        context,
        dateRange(folio.checkInDate, folio.plannedCheckOutDate) + " · " + Math.max(1, folio.nights) + " gece",
        11,
        UiKit.MUTED,
        Typeface.NORMAL
    ));

    LinearLayout totals = UiKit.column(context);
    totals.setPadding(0, dp(context, 7), 0, 0);
    totals.addView(UiKit.text(context, "Toplam: " + money(folio.chargeTotalMinor), 12, UiKit.TEXT, Typeface.NORMAL));
    totals.addView(UiKit.text(context, "Alınan: " + money(folio.paidTotalMinor), 12, UiKit.SECONDARY, Typeface.NORMAL));
    totals.addView(UiKit.text(
        context,
        "Kalan: " + money(folio.remainingMinor),
        13,
        folio.remainingMinor > 0 ? UiKit.WARNING : UiKit.SUCCESS,
        Typeface.BOLD
    ));
    card.addView(totals);

    if (data.hasPermission("room_folio.payment") && folio.remainingMinor > 0) {
      Button payment = UiKit.button(context, "Ödeme Al", UiKit.PRIMARY, view -> showPaymentDialog(context, folio, listener));
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(context, 46));
      params.setMargins(0, dp(context, 10), 0, 0);
      payment.setLayoutParams(params);
      card.addView(payment);
    }

    if (data.hasPermission("room_folio.checkout")) {
      if (folio.remainingMinor == 0) {
        Button checkout = UiKit.outlineButton(context, "Çıkışı Tamamla", view -> confirmCheckout(context, folio, listener));
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

  private static void showPaymentDialog(Context context, OperationData.RoomFolioRecord folio, Listener listener) {
    LinearLayout form = new LinearLayout(context);
    form.setOrientation(LinearLayout.VERTICAL);
    int padding = dp(context, 16);
    form.setPadding(padding, padding, padding, padding);

    addLabel(context, form, "Kalan tutar");
    TextView remaining = UiKit.text(context, money(folio.remainingMinor), 15, UiKit.WARNING, Typeface.BOLD);
    form.addView(remaining);

    addLabel(context, form, "Alınan tutar (TL)");
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
        .setTitle("Çıkışı tamamla")
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

  private static TextView line(Context context, String label, String value, int tone) {
    TextView text = UiKit.text(context, label + ": " + value, 13, tone, Typeface.BOLD);
    text.setPadding(0, dp(context, 7), 0, 0);
    return text;
  }

  private static void addLabel(Context context, LinearLayout form, String label) {
    TextView text = UiKit.text(context, label, 12, UiKit.MUTED, Typeface.BOLD);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, dp(context, 9), 0, dp(context, 3));
    text.setLayoutParams(params);
    form.addView(text);
  }

  private static String money(long minor) {
    NumberFormat format = NumberFormat.getCurrencyInstance(new Locale("tr", "TR"));
    return format.format(Math.max(0L, minor) / 100d);
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
